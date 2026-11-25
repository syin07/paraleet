// Learning plans through the services, with a scripted model: a plan is saved only if every
// problem in it is a catalog problem the model was shown; drafts can be edited; one plan is
// active; the daily loop draws from it; progress follows the attempts.
import { afterEach, describe, expect, it } from 'vitest';
import type { PlanView } from '../../bridge/contract';
import type { PlanRequest } from '../../core/plan';
import { listPlanItems, listPlans } from '../../data/repos/plans';
import { getNotes } from '../../data/repos/notes';
import { getPet } from '../../data/repos/pet';
import { LlmError, type LlmAnswer } from '../../llm/planGenerator';
import { candidatesFor } from './plans';
import { reconcile } from './index';
import { createTestApp, noonLA, type TestApp } from './testing';

let app: TestApp;
afterEach(() => app?.close());

const request: PlanRequest = { topics: ['binary-search'], platforms: ['leetcode'], level: 'some', targetSize: 12 };
const json = (value: unknown): LlmAnswer => ({ kind: 'json', value, text: JSON.stringify(value) });
/** Runs a handler on a later turn, as the bridge does, so one that throws at once is a rejection. */
const later = <T>(work: () => T | Promise<T>): Promise<T> => Promise.resolve().then(work);

function start(): TestApp {
  const created = createTestApp({ now: noonLA('2026-12-01') });
  created.secrets.key = 'sk-ant-test-key-000000';
  return created;
}

/** A well-formed answer built from the real candidates for the request. */
function goodAnswer(topic: 'binary-search' | 'graphs' = 'binary-search', offset = 0): { topics: unknown[]; ids: number[] } {
  const ids = (candidatesFor(app.ctx, { ...request, topics: [topic] }).get(topic) ?? []).map((candidate) => candidate.id).slice(offset, offset + 10);
  expect(ids).toHaveLength(10);
  return {
    ids,
    topics: [
      {
        topic,
        foundations: ids.slice(0, 3),
        groups: [
          { name: 'Search on the answer', description: 'Guess a value and check whether it is feasible.', problems: ids.slice(3, 6) },
          { name: 'Rotated arrays', description: 'Find the sorted half first.', problems: ids.slice(6, 8) },
        ],
        challenge: ids.slice(8, 10),
      },
    ],
  };
}

async function draft(): Promise<{ plan: PlanView; ids: number[] }> {
  const answer = goodAnswer();
  app.modelAnswers.push(json({ topics: answer.topics }));
  return { plan: await app.handlers.generatePlan({ ...request, topics: [...request.topics], platforms: [...request.platforms] }), ids: answer.ids };
}

const report = (problemId: number, rating: 'again' | 'hard' | 'good' | 'easy' = 'good') =>
  app.handlers.submitReport({ problemId, rating, minutes: null, keyInsight: null, notes: null, insightRevealed: false });

describe('candidates', () => {
  it('come from the catalog, for the topic and platforms asked, and mark what is already solved', async () => {
    app = start();
    const first = candidatesFor(app.ctx, request).get('binary-search') ?? [];
    expect(first.length).toBeGreaterThan(20);
    expect(first.every((candidate) => candidate.platform === 'leetcode' && candidate.topics.includes('binary-search'))).toBe(true);
    expect(first.every((candidate) => !candidate.solved)).toBe(true);
    await report(first[0]!.id);
    const again = candidatesFor(app.ctx, request).get('binary-search') ?? [];
    expect(again.find((candidate) => candidate.id === first[0]!.id)?.solved).toBe(true);
    // A problem the user added by hand is never a candidate.
    const added = await app.handlers.addProblem({
      url: 'https://leetcode.com/problems/my-own-binary-search-problem/',
      title: 'My Own Problem',
      difficultyRaw: 'Easy',
      topics: ['binary-search'],
    });
    expect(added.ok).toBe(true);
    if (added.ok) {
      const ids = new Set((candidatesFor(app.ctx, request).get('binary-search') ?? []).map((candidate) => candidate.id));
      expect(ids.has(added.problem.id)).toBe(false);
    }
  });
});

describe('generating a plan', () => {
  it('saves a good answer as a draft, in order, with the model that wrote it', async () => {
    app = start();
    const { plan, ids } = await draft();
    expect(plan).toMatchObject({ status: 'draft', title: 'Binary search', level: 'some', model: 'claude-opus-5-5' });
    expect(plan.sections.map((section) => [section.stage, section.groupName, section.items.length])).toEqual([
      ['foundations', null, 3],
      ['patterns', 'Search on the answer', 3],
      ['patterns', 'Rotated arrays', 2],
      ['challenge', null, 2],
    ]);
    expect(plan.sections.flatMap((section) => section.items.map((item) => item.problem.id))).toEqual(ids);
    expect(plan.progress).toEqual({ total: 10, done: 0, skipped: 0, pending: 10 });
    // The model saw the key the user saved and the model in Settings, and nothing but metadata.
    expect(app.modelCalls).toHaveLength(1);
    expect(app.modelCalls[0]).toMatchObject({ apiKey: 'sk-ant-test-key-000000', model: 'claude-opus-5-5' });
    expect(app.modelCalls[0]?.turns[0]?.text).not.toMatch(/https?:\/\//);
    // A draft does not change what the daily loop assigns.
    expect((await app.handlers.getToday(undefined)).assignment?.reason).toBe('starter');
  });

  it('never saves a plan with a problem that is not in the catalog', async () => {
    app = start();
    const answer = goodAnswer();
    const invented = structuredClone(answer.topics) as { foundations: number[] }[];
    invented[0]!.foundations = [answer.ids[0]!, answer.ids[1]!, 987654321];
    app.modelAnswers.push(json({ topics: invented }), json({ topics: invented }));
    await expect(app.handlers.generatePlan({ ...request, topics: ['binary-search'], platforms: ['leetcode'] })).rejects.toThrow(
      'The model did not produce a usable plan, even after one retry. Nothing was saved. Try again.',
    );
    expect(listPlans(app.db)).toEqual([]);
    expect(app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM plan_items')?.n).toBe(0);
    expect(app.modelCalls).toHaveLength(2);
  });

  it('accepts the retry when the model corrects itself', async () => {
    app = start();
    const answer = goodAnswer();
    const invented = structuredClone(answer.topics) as { challenge: number[] }[];
    invented[0]!.challenge = [555555555];
    app.modelAnswers.push(json({ topics: invented }), json({ topics: answer.topics }));
    const plan = await app.handlers.generatePlan({ ...request, topics: ['binary-search'], platforms: ['leetcode'] });
    expect(plan.status).toBe('draft');
    expect(listPlanItems(app.db, plan.id).every((item) => answer.ids.includes(item.problemId))).toBe(true);
    expect(app.modelCalls[1]?.turns[2]?.text).toContain('555555555');
  });

  it('refuses a problem from another topic or platform, even though it is in the catalog', async () => {
    app = start();
    const answer = goodAnswer();
    const graphs = candidatesFor(app.ctx, { ...request, topics: ['graphs'] }).get('graphs') ?? [];
    const outsider = graphs.find((candidate) => !candidate.topics.includes('binary-search'));
    expect(outsider).toBeDefined();
    const wrong = structuredClone(answer.topics) as { challenge: number[] }[];
    wrong[0]!.challenge = [outsider!.id];
    app.modelAnswers.push(json({ topics: wrong }), json({ topics: wrong }));
    await expect(app.handlers.generatePlan({ ...request, topics: ['binary-search'], platforms: ['leetcode'] })).rejects.toThrow(/usable plan/);
    expect(listPlans(app.db)).toEqual([]);
  });

  it('needs an API key, and says so without calling the model', async () => {
    app = start();
    app.secrets.key = null;
    await expect(app.handlers.generatePlan({ ...request, topics: ['binary-search'], platforms: ['leetcode'] })).rejects.toThrow(
      'Add an Anthropic API key in Settings to generate a plan.',
    );
    expect(app.modelCalls).toEqual([]);
  });

  it('turns a failed request into a plain message and saves nothing', async () => {
    app = start();
    app.modelAnswers.push(new LlmError('bad_key', 'Anthropic did not accept the API key. Check it in Settings.'));
    await expect(app.handlers.generatePlan({ ...request, topics: ['binary-search'], platforms: ['leetcode'] })).rejects.toThrow(
      'Anthropic did not accept the API key. Check it in Settings.',
    );
    app.modelAnswers.push(new Error('socket hang up at /Users/someone/secret/path'));
    await expect(app.handlers.generatePlan({ ...request, topics: ['binary-search'], platforms: ['leetcode'] })).rejects.toThrow(
      'The plan could not be generated. Nothing was saved. Try again.',
    );
    expect(listPlans(app.db)).toEqual([]);
  });

  it('says so when the chosen platforms have no problems for a topic', async () => {
    app = start();
    await expect(app.handlers.generatePlan({ topics: ['linked-lists'], platforms: ['cses'], level: 'new', targetSize: 10 })).rejects.toThrow(
      /no catalog problems for Linked lists/,
    );
    expect(app.modelCalls).toEqual([]);
  });

  it('uses the model chosen in Settings', async () => {
    app = start();
    await app.handlers.updateSettings({ planModel: 'claude-sonnet-5-5' });
    await draft();
    expect(app.modelCalls[0]?.model).toBe('claude-sonnet-5-5');
    expect(listPlans(app.db)[0]?.model).toBe('claude-sonnet-5-5');
  });
});

describe('editing a draft', () => {
  it('removes, moves and swaps problems, and keeps the plan made of catalog problems', async () => {
    app = start();
    const { plan, ids } = await draft();
    const order = (view: PlanView): number[] => view.sections.flatMap((section) => section.items.map((item) => item.problem.id));

    const removed = await app.handlers.removePlanItem({ planId: plan.id, problemId: ids[1]! });
    expect(order(removed)).toEqual(ids.filter((id) => id !== ids[1]));

    // Moving stays inside the stage or group: the last foundation cannot move down into a group.
    const moved = await app.handlers.movePlanItem({ planId: plan.id, problemId: ids[2]!, direction: 'up' });
    expect(order(moved).slice(0, 2)).toEqual([ids[2], ids[0]]);
    const stuck = await app.handlers.movePlanItem({ planId: plan.id, problemId: ids[0]!, direction: 'down' });
    expect(order(stuck)).toEqual(order(moved));

    const options = await app.handlers.getPlanSwapOptions({ planId: plan.id, problemId: ids[3]! });
    expect(options.length).toBeGreaterThan(0);
    expect(options.every((option) => !order(moved).includes(option.id) && option.topics.includes('binary-search'))).toBe(true);
    const swapped = await app.handlers.swapPlanItem({ planId: plan.id, problemId: ids[3]!, replacementId: options[0]!.id });
    expect(order(swapped)[2]).toBe(options[0]!.id);
    expect(swapped.sections[1]).toMatchObject({ groupName: 'Search on the answer' });

    // A swap to something that is not an offered candidate is refused.
    await expect(later(() => app.handlers.swapPlanItem({ planId: plan.id, problemId: ids[4]!, replacementId: 987654321 }))).rejects.toThrow(
      'That problem cannot take this place. Pick one from the list.',
    );
    await expect(later(() => app.handlers.swapPlanItem({ planId: plan.id, problemId: ids[4]!, replacementId: ids[5]! }))).rejects.toThrow(/cannot take this place/);
    // So is a real catalog problem of another topic: a swap keeps the rule the model's answer is held to.
    const graphs = candidatesFor(app.ctx, { ...request, topics: ['graphs'] }).get('graphs') ?? [];
    const outsider = graphs.find((candidate) => !candidate.topics.includes('binary-search'));
    expect(outsider).toBeDefined();
    const before = order(await app.handlers.getPlan({ planId: plan.id }));
    await expect(later(() => app.handlers.swapPlanItem({ planId: plan.id, problemId: ids[4]!, replacementId: outsider!.id }))).rejects.toThrow(
      /cannot take this place/,
    );
    expect(order(await app.handlers.getPlan({ planId: plan.id }))).toEqual(before);
  });

  it('does not let the last problem be removed, or an active plan be edited', async () => {
    app = start();
    const { plan, ids } = await draft();
    for (const id of ids.slice(1)) await app.handlers.removePlanItem({ planId: plan.id, problemId: id });
    await expect(later(() => app.handlers.removePlanItem({ planId: plan.id, problemId: ids[0]! }))).rejects.toThrow(/at least one problem/);
    await app.handlers.activatePlan({ planId: plan.id });
    await expect(later(() => app.handlers.movePlanItem({ planId: plan.id, problemId: ids[0]!, direction: 'up' }))).rejects.toThrow(
      'Only a draft plan can be edited.',
    );
  });

  it('deletes a draft, and says so when a plan is gone', async () => {
    app = start();
    const { plan } = await draft();
    const overview = await app.handlers.deletePlan({ planId: plan.id });
    expect(overview.drafts).toEqual([]);
    await expect(later(() => app.handlers.getPlan({ planId: plan.id }))).rejects.toThrow('That plan no longer exists.');
  });
});

describe('an active plan', () => {
  it('feeds the daily loop in plan order, after due reviews and before the starter list', async () => {
    app = start();
    const { plan, ids } = await draft();
    const active = await app.handlers.activatePlan({ planId: plan.id });
    expect(active.status).toBe('active');
    expect(active.sections[0]?.items[0]?.isNext).toBe(true);

    // Today was already assigned from the starter list before the plan existed; tomorrow comes from the plan.
    app.clock.set(noonLA('2026-12-02'));
    const today = await app.handlers.getToday(undefined);
    expect(today.assignment).toMatchObject({ reason: 'plan', problem: { id: ids[0] } });
    await report(ids[0]!);
    const overview = await app.handlers.getPlanOverview(undefined);
    expect(overview.active?.progress).toMatchObject({ done: 1, pending: 9 });
    expect(overview.active?.sections[0]?.items.map((item) => item.isNext)).toEqual([false, true, false]);

    app.clock.set(noonLA('2026-12-03'));
    expect((await app.handlers.getToday(undefined)).assignment).toMatchObject({ reason: 'plan', problem: { id: ids[1] } });
  });

  it('skips problems the user had already solved, and refuses a plan that is all solved', async () => {
    app = start();
    const answer = goodAnswer();
    await report(answer.ids[0]!);
    await report(answer.ids[4]!);
    app.modelAnswers.push(json({ topics: answer.topics }));
    const plan = await app.handlers.generatePlan({ ...request, topics: ['binary-search'], platforms: ['leetcode'] });
    const active = await app.handlers.activatePlan({ planId: plan.id });
    expect(active.progress).toEqual({ total: 10, done: 0, skipped: 2, pending: 8 });
    expect(active.sections[0]?.items[0]?.state).toBe('skipped');
    expect(active.sections[0]?.items[1]?.isNext).toBe(true);

    // A second plan made only of solved problems cannot be activated.
    for (const id of answer.ids) await report(id);
    const other = goodAnswer('binary-search', 0);
    app.modelAnswers.push(json({ topics: other.topics }));
    const solved = await app.handlers.generatePlan({ ...request, topics: ['binary-search'], platforms: ['leetcode'] });
    await expect(later(() => app.handlers.activatePlan({ planId: solved.id }))).rejects.toThrow(/already solved every problem/);
  });

  it('is the only active plan: activating another archives it', async () => {
    app = start();
    const first = await draft();
    await app.handlers.activatePlan({ planId: first.plan.id });
    const answer = goodAnswer('binary-search', 12);
    app.modelAnswers.push(json({ topics: answer.topics }));
    const second = await app.handlers.generatePlan({ ...request, topics: ['binary-search'], platforms: ['leetcode'] });
    await app.handlers.activatePlan({ planId: second.id });
    const overview = await app.handlers.getPlanOverview(undefined);
    expect(overview.active?.id).toBe(second.id);
    expect(overview.past.map((plan) => [plan.id, plan.status])).toEqual([[first.plan.id, 'archived']]);
  });

  it('gives a solved problem its pattern group as a pattern tag', async () => {
    app = start();
    const { plan, ids } = await draft();
    await app.handlers.activatePlan({ planId: plan.id });
    await report(ids[3]!);
    expect(getNotes(app.db, ids[3]!).patternTags).toEqual(['Search on the answer']);
    await report(ids[3]!);
    expect(getNotes(app.db, ids[3]!).patternTags).toEqual(['Search on the answer']);
    // A foundations problem has no group and gets no tag.
    await report(ids[0]!);
    expect(getNotes(app.db, ids[0]!).patternTags).toEqual([]);
  });

  it('finishes with its last problem, earns the graduation cap, and is kept', async () => {
    app = start();
    const { plan, ids } = await draft();
    await app.handlers.activatePlan({ planId: plan.id });
    for (const id of ids.slice(0, 9)) {
      const result = await report(id);
      expect(result.finishedPlan).toBeNull();
      expect(result.unlocked).not.toContain('grad_cap');
    }
    const last = await report(ids[9]!);
    expect(last.finishedPlan).toBe('Binary search');
    expect(last.unlocked).toContain('grad_cap');
    expect(getPet(app.db).unlockedAccessories).toContain('grad_cap');
    const overview = await app.handlers.getPlanOverview(undefined);
    expect(overview.active).toBeNull();
    expect(overview.past[0]).toMatchObject({ id: plan.id, status: 'done', progress: { done: 10, pending: 0 } });
    await expect(later(() => app.handlers.deletePlan({ planId: plan.id }))).rejects.toThrow('A finished plan is kept.');
    // With no active plan the daily loop goes back to the starter list.
    app.clock.set(noonLA('2026-12-02'));
    expect((await app.handlers.getToday(undefined)).assignment?.reason).not.toBe('plan');
  });

  it('does not earn the cap when the last problem is rated Again; the next other attempt does', async () => {
    app = start();
    const { plan, ids } = await draft();
    await app.handlers.activatePlan({ planId: plan.id });
    for (const id of ids.slice(0, 9)) await report(id);
    const again = await report(ids[9]!, 'again');
    expect(again.finishedPlan).toBe('Binary search');
    expect(again.unlocked).toEqual([]);
    expect((await report(ids[9]!, 'good')).unlocked).toContain('grad_cap');
  });

  it('can be archived, and then deleted', async () => {
    app = start();
    const { plan } = await draft();
    await app.handlers.activatePlan({ planId: plan.id });
    await expect(later(() => app.handlers.deletePlan({ planId: plan.id }))).rejects.toThrow('Archive the active plan before deleting it.');
    const archived = await app.handlers.archivePlan({ planId: plan.id });
    expect(archived.active).toBeNull();
    expect(archived.past[0]?.status).toBe('archived');
    expect((await app.handlers.deletePlan({ planId: plan.id })).past).toEqual([]);
  });

  it('has its progress rebuilt from the attempts at launch', async () => {
    app = start();
    const { plan, ids } = await draft();
    await app.handlers.activatePlan({ planId: plan.id });
    await report(ids[0]!);
    await report(ids[1]!);
    // Damage the stored states: one done item back to pending, one pending item marked done.
    const items = listPlanItems(app.db, plan.id);
    app.db.run("UPDATE plan_items SET state = 'pending' WHERE id = ?", [items[0]!.id]);
    app.db.run("UPDATE plan_items SET state = 'done' WHERE id = ?", [items[5]!.id]);
    expect(reconcile(app.ctx).planItemsCorrected).toBe(2);
    expect(listPlanItems(app.db, plan.id).map((item) => item.state).slice(0, 6)).toEqual([
      'done', 'done', 'pending', 'pending', 'pending', 'pending',
    ]);
    expect(reconcile(app.ctx).planItemsCorrected).toBe(0);
  });
});

describe('the API key', () => {
  it('is saved, reported as present, never returned, and removed', async () => {
    app = createTestApp();
    expect((await app.handlers.getPlanOverview(undefined)).llm).toMatchObject({ hasKey: false, canStoreKey: true, model: 'claude-opus-5-5' });
    const saved = await app.handlers.saveApiKey({ apiKey: '  sk-ant-test-key-111111  ' });
    expect(saved.hasKey).toBe(true);
    expect(JSON.stringify(saved)).not.toContain('sk-ant');
    expect(app.secrets.key).toBe('sk-ant-test-key-111111');
    // Not in the database, in any table.
    for (const table of ['settings', 'pet', 'plans']) {
      expect(JSON.stringify(app.db.all(`SELECT * FROM ${table}`))).not.toContain('sk-ant');
    }
    expect((await app.handlers.removeApiKey(undefined)).hasKey).toBe(false);
    expect(app.secrets.key).toBeNull();
  });

  it('is not saved when this Mac cannot encrypt it', async () => {
    app = createTestApp();
    app.secrets.available = false;
    await expect(later(() => app.handlers.saveApiKey({ apiKey: 'sk-ant-test-key-111111' }))).rejects.toThrow(
      /cannot encrypt/,
    );
    expect(app.secrets.key).toBeNull();
    expect((await app.handlers.getPlanOverview(undefined)).llm).toMatchObject({ hasKey: false, canStoreKey: false });
  });

  it('can be tested without spending anything', async () => {
    app = createTestApp();
    expect(await app.handlers.testApiKey(undefined)).toEqual({ ok: false, reason: 'No API key is saved.' });
    app.secrets.key = 'sk-ant-test-key-111111';
    expect(await app.handlers.testApiKey(undefined)).toEqual({ ok: true, modelAvailable: true });
    await app.handlers.updateSettings({ planModel: 'claude-some-future-model' });
    expect(await app.handlers.testApiKey(undefined)).toEqual({ ok: true, modelAvailable: false });
    app.setModelList(new LlmError('bad_key', 'Anthropic did not accept the API key. Check it in Settings.'));
    expect(await app.handlers.testApiKey(undefined)).toEqual({
      ok: false,
      reason: 'Anthropic did not accept the API key. Check it in Settings.',
    });
  });
});

describe('the app with no API key', () => {
  it('does everything but generate a plan', async () => {
    app = createTestApp({ now: noonLA('2026-12-01') });
    const today = await app.handlers.getToday(undefined);
    expect(today.assignment).not.toBeNull();
    const result = await report(today.assignment!.problem.id);
    expect(result.today.fed).toBe(true);
    const overview = await app.handlers.getPlanOverview(undefined);
    expect(overview.llm.hasKey).toBe(false);
    expect(overview.topics.find((topic) => topic.id === 'binary-search')?.counts.leetcode).toBeGreaterThan(50);
    expect(app.modelCalls).toEqual([]);
  });
});
