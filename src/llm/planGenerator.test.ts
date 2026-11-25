// Plan generation against saved model answers (PRD section 12, "Testing"): a good one, a
// malformed one and one with invented problems. No test here talks to a real model.
import { describe, expect, it } from 'vitest';
import type { PlanCandidate, PlanRequest } from '../core/plan';
import type { TopicId } from '../core/topics';
import good from './fixtures/good.json';
import hallucinated from './fixtures/hallucinated.json';
import malformed from './fixtures/malformed.json';
import { generatePlan, LlmError, PlanGenerationError, type LlmAnswer, type LlmClient, type LlmTurn } from './planGenerator';
import { buildPlanMessage, buildRetryMessage, PLAN_SYSTEM_PROMPT } from './prompt';

const request: PlanRequest = { topics: ['binary-search'], platforms: ['leetcode'], level: 'some', targetSize: 12 };

function candidate(id: number, overrides: Partial<PlanCandidate> = {}): PlanCandidate {
  return {
    id,
    platform: 'leetcode',
    title: `Problem ${id}`,
    difficultyRaw: 'Medium',
    difficultyNorm: 3,
    topics: ['binary-search'],
    sourceTags: ['Binary Search', 'Array'],
    solvedCount: 5000,
    solved: false,
    ...overrides,
  };
}

const candidates = new Map<TopicId, PlanCandidate[]>([
  ['binary-search', Array.from({ length: 30 }, (_, index) => candidate(101 + index))],
]);
const allowed = new Set((candidates.get('binary-search') ?? []).map((problem) => problem.id));

const json = (value: unknown): LlmAnswer => ({ kind: 'json', value, text: JSON.stringify(value) });

/** A model that gives the saved answers in order and records what it was asked. */
function scripted(answers: (LlmAnswer | Error)[]): LlmClient & { calls: { model: string; system: string; turns: LlmTurn[] }[] } {
  const calls: { model: string; system: string; turns: LlmTurn[] }[] = [];
  return {
    calls,
    async complete(input) {
      calls.push({ model: input.model, system: input.system, turns: [...input.turns] });
      const next = answers[calls.length - 1];
      if (next === undefined) throw new Error('The test model was asked more often than expected');
      if (next instanceof Error) throw next;
      return next;
    },
  };
}

describe('generatePlan', () => {
  it('returns the plan when the first answer is good, after one request', async () => {
    const model = scripted([json(good)]);
    const plan = await generatePlan(model, 'test-model', request, candidates);
    expect(plan.attempts).toBe(1);
    expect(plan.items.map((item) => item.problemId)).toEqual([101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111]);
    expect(plan.items[3]).toMatchObject({ stage: 'patterns', groupName: 'Binary search on the answer' });
    expect(model.calls).toHaveLength(1);
    expect(model.calls[0]).toMatchObject({ model: 'test-model', system: PLAN_SYSTEM_PROMPT });
  });

  it('retries once with the errors when the answer invents problems, and accepts a corrected plan', async () => {
    const model = scripted([json(hallucinated), json(good)]);
    const plan = await generatePlan(model, 'test-model', request, candidates);
    expect(plan.attempts).toBe(2);
    expect(plan.items.every((item) => allowed.has(item.problemId))).toBe(true);
    // The retry carries the first answer and what was wrong with it.
    const retry = model.calls[1]?.turns ?? [];
    expect(retry.map((turn) => turn.role)).toEqual(['user', 'assistant', 'user']);
    expect(retry[1]?.text).toBe(JSON.stringify(hallucinated));
    expect(retry[2]?.text).toContain('problem 900001 is not in the candidate list');
    expect(retry[2]?.text).toContain('problem 900002 is not in the candidate list');
    expect(retry[2]?.text).toContain('problem 104 is already used');
  });

  it('never returns a plan with a problem outside the catalog: two bad answers give a plain error', async () => {
    const model = scripted([json(hallucinated), json(hallucinated)]);
    const failure = await generatePlan(model, 'test-model', request, candidates).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(PlanGenerationError);
    expect((failure as PlanGenerationError).kind).toBe('invalid');
    expect((failure as PlanGenerationError).message).toBe(
      'The model did not produce a usable plan, even after one retry. Nothing was saved. Try again.',
    );
    expect((failure as PlanGenerationError).problems.join(' ')).toContain('900001');
    // Exactly one retry, never more.
    expect(model.calls).toHaveLength(2);
  });

  it('retries a malformed answer, and gives up after the second', async () => {
    const recovered = scripted([json(malformed), json(good)]);
    expect((await generatePlan(recovered, 'm', request, candidates)).attempts).toBe(2);
    expect(recovered.calls[1]?.turns[2]?.text).toContain('That plan cannot be used');

    const stuck = scripted([json(malformed), { kind: 'unparseable', text: 'Sure! Here is your plan:' }]);
    const failure = await generatePlan(stuck, 'm', request, candidates).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(PlanGenerationError);
    expect((failure as PlanGenerationError).kind).toBe('invalid');
  });

  it('retries an answer that is not JSON at all', async () => {
    const model = scripted([{ kind: 'unparseable', text: 'I think you should start with Two Sum.' }, json(good)]);
    const plan = await generatePlan(model, 'm', request, candidates);
    expect(plan.attempts).toBe(2);
    expect(model.calls[1]?.turns[1]?.text).toBe('I think you should start with Two Sum.');
  });

  it('does not retry a refusal or a cut-off answer: each is its own plain error', async () => {
    const refused = scripted([{ kind: 'refused', explanation: null }]);
    const first = await generatePlan(refused, 'm', request, candidates).catch((error: unknown) => error);
    expect(first).toBeInstanceOf(PlanGenerationError);
    expect((first as PlanGenerationError).kind).toBe('refused');
    expect(refused.calls).toHaveLength(1);

    const cut = scripted([{ kind: 'truncated' }]);
    const second = await generatePlan(cut, 'm', request, candidates).catch((error: unknown) => error);
    expect((second as PlanGenerationError).kind).toBe('truncated');
    expect(cut.calls).toHaveLength(1);
  });

  it('passes a failed request straight through, without a retry', async () => {
    const model = scripted([new LlmError('bad_key', 'Anthropic did not accept the API key. Check it in Settings.')]);
    const failure = await generatePlan(model, 'm', request, candidates).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(LlmError);
    expect((failure as LlmError).kind).toBe('bad_key');
    expect(model.calls).toHaveLength(1);
  });

  it('never lets an invented problem through, whatever mix of answers comes back', async () => {
    let state = 99;
    const random = (): number => {
      state = (Math.imul(state, 1103515245) + 12345) >>> 0;
      return state / 4294967296;
    };
    const damaged = (): unknown => {
      const plan = structuredClone(good);
      for (const list of [plan.topics[0]!.foundations, plan.topics[0]!.groups[0]!.problems, plan.topics[0]!.groups[1]!.problems, plan.topics[0]!.challenge]) {
        for (let index = 0; index < list.length; index += 1) {
          if (random() < 0.25) list[index] = 100 + Math.floor(random() * 2000);
        }
      }
      return plan;
    };
    let accepted = 0;
    for (let round = 0; round < 300; round += 1) {
      const model = scripted([json(damaged()), json(damaged())]);
      const result = await generatePlan(model, 'm', request, candidates).catch((error: unknown) => error);
      if (result instanceof Error) {
        expect(result).toBeInstanceOf(PlanGenerationError);
        continue;
      }
      accepted += 1;
      const used = (result as { items: { problemId: number }[] }).items.map((item) => item.problemId);
      expect(used.every((id) => allowed.has(id))).toBe(true);
      expect(new Set(used).size).toBe(used.length);
    }
    // The test means something only if both outcomes happen.
    expect(accepted).toBeGreaterThan(5);
    expect(accepted).toBeLessThan(295);
  });
});

describe('what the model is sent', () => {
  it('lists every candidate once with its id, and nothing but metadata', () => {
    const many = new Map<TopicId, PlanCandidate[]>([
      ['binary-search', [candidate(101, { title: 'Binary Search', difficultyRaw: 'Easy', solved: true }), candidate(102, { platform: 'cses', difficultyRaw: null, sourceTags: [] })]],
      ['graphs', [candidate(201, { platform: 'codeforces', difficultyRaw: '1500', title: 'Roads', topics: ['graphs'], sourceTags: ['dfs and similar', 'graphs'] })]],
    ]);
    const message = buildPlanMessage({ ...request, topics: ['binary-search', 'graphs'], level: 'new', targetSize: 20 }, many);
    expect(message).toContain('Level: New to this.');
    expect(message).toContain('About 20 problems per topic.');
    expect(message).toContain('## binary-search (Binary search): 2 candidates');
    expect(message).toContain('101 | LeetCode | Easy | Binary Search | Binary Search, Array | solved');
    expect(message).toContain('102 | CSES | unrated | Problem 102');
    expect(message).toContain('## graphs (Graphs (BFS/DFS)): 1 candidates');
    expect(message).toContain('201 | Codeforces | 1500 | Roads | dfs and similar, graphs');
    // Topics appear in the order asked for.
    expect(message.indexOf('## binary-search')).toBeLessThan(message.indexOf('## graphs'));
    // No links and no solved counts: the model needs neither.
    expect(message).not.toMatch(/https?:\/\//);
    expect(message).not.toContain('5000');
  });

  it('says a topic has no candidates instead of leaving it out', () => {
    const message = buildPlanMessage({ ...request, topics: ['geometry'] }, new Map());
    expect(message).toContain('## geometry (Geometry): 0 candidates');
  });

  it('tells the model to select and never invent, with the shape the checks enforce', () => {
    expect(PLAN_SYSTEM_PROMPT).toContain('You select, you never invent.');
    expect(PLAN_SYSTEM_PROMPT).toContain('foundations: 2 to 6 problems');
    expect(PLAN_SYSTEM_PROMPT).toContain('use each id at most once in the whole plan');
  });

  it('keeps a retry message short even when there are many errors', () => {
    const errors = Array.from({ length: 50 }, (_, index) => `problem ${index} is not in the candidate list`);
    const message = buildRetryMessage(errors);
    expect(message.split('\n').length).toBeLessThan(30);
    expect(message).toContain('and 30 more of the same kind.');
  });
});
