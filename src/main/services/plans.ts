// Learning plans (PRD section 7): candidates from the catalog, a plan written by the model and
// checked against those candidates, review and edits on a draft, one active plan the daily loop
// draws from, and progress that can always be recomputed from the attempts.
import type { BridgeParsedInput, LlmStatus, ApiKeyTest, PlanOverview, PlanSummary, PlanView, ProblemSummary } from '../../bridge/contract';
import {
  CANDIDATES_PER_TOPIC,
  isPlanFinished,
  PLAN_PLATFORMS,
  planProgress,
  planQueue,
  recomputeItemStates,
  selectCandidates,
  SUGGESTED_PLAN_MODELS,
  validatePlanRequest,
  type PlanCandidate,
  type PlanItemProgress,
  type PlanPlatform,
  type PlanRequest,
} from '../../core/plan';
import { TOPICS, topicLabel, type TopicId } from '../../core/topics';
import {
  deletePlan as deletePlanRow,
  deletePlanItem,
  getActivePlan,
  getPlan as getPlanRow,
  insertPlan,
  listPlanItems,
  listPlans,
  reorderPlanItems,
  setItemProblem,
  setItemState,
  finishPlan,
  setPlanStatus,
  type PlanItemRecord,
  type PlanRecord,
} from '../../data/repos/plans';
import { countCatalogByTopic, getProblem, listAttemptedProblemTimes, listTopicProblems } from '../../data/repos/problems';
import { getSettings } from '../../data/repos/settings';
import { generatePlan as generateWithModel, LlmError, PlanGenerationError } from '../../llm/planGenerator';
import type { AppContext } from './context';
import { toSummary } from './views';

/** An error whose message is written for the user and can be shown as it is. */
export class PlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlanError';
  }
}

export function llmStatus(ctx: AppContext): LlmStatus {
  return {
    hasKey: ctx.secrets.available() && ctx.secrets.getApiKey() !== null,
    canStoreKey: ctx.secrets.available(),
    model: getSettings(ctx.db).planModel,
    suggestedModels: SUGGESTED_PLAN_MODELS.map((model) => ({ ...model })),
  };
}

function toProgressItems(items: readonly PlanItemRecord[]): PlanItemProgress[] {
  return items.map((item) => ({
    position: item.position,
    topic: item.topic,
    stage: item.stage,
    groupName: item.groupName,
    problemId: item.problemId,
    state: item.state,
  }));
}

function toPlanSummary(plan: PlanRecord, items: readonly PlanItemRecord[]): PlanSummary {
  return {
    id: plan.id,
    title: plan.title,
    status: plan.status,
    topics: plan.topics,
    platforms: plan.platforms,
    level: plan.level,
    model: plan.model,
    createdAt: plan.createdAt,
    progress: planProgress(toProgressItems(items)).overall,
  };
}

function toPlanView(ctx: AppContext, plan: PlanRecord): PlanView {
  const items = listPlanItems(ctx.db, plan.id);
  const next = plan.status === 'active' ? (planQueue(toProgressItems(items))[0] ?? null) : null;
  const sections: PlanView['sections'] = [];
  for (const item of items) {
    const problem = getProblem(ctx.db, item.problemId);
    if (!problem) continue;
    const last = sections[sections.length - 1];
    const view = { problem: toSummary(problem), state: item.state, isNext: item.problemId === next };
    if (last && last.topic === item.topic && last.stage === item.stage && last.groupName === item.groupName) {
      last.items.push(view);
    } else {
      sections.push({
        topic: item.topic,
        stage: item.stage,
        groupName: item.groupName,
        groupDescription: item.groupDescription,
        progress: { total: 0, done: 0, skipped: 0, pending: 0 },
        items: [view],
      });
    }
  }
  for (const section of sections) {
    const done = section.items.filter((item) => item.state === 'done').length;
    const skipped = section.items.filter((item) => item.state === 'skipped').length;
    section.progress = { total: section.items.length, done, skipped, pending: section.items.length - done - skipped };
  }
  return { ...toPlanSummary(plan, items), targetSize: plan.targetSize, sections };
}

function requirePlan(ctx: AppContext, planId: number): PlanRecord {
  const plan = getPlanRow(ctx.db, planId);
  if (!plan) throw new PlanError('That plan no longer exists.');
  return plan;
}

function requireDraft(ctx: AppContext, planId: number): PlanRecord {
  const plan = requirePlan(ctx, planId);
  if (plan.status !== 'draft') throw new PlanError('Only a draft plan can be edited.');
  return plan;
}

export function getPlan(ctx: AppContext, planId: number): PlanView {
  return toPlanView(ctx, requirePlan(ctx, planId));
}

export function getPlanOverview(ctx: AppContext): PlanOverview {
  const plans = listPlans(ctx.db);
  const summaries = plans.map((plan) => toPlanSummary(plan, listPlanItems(ctx.db, plan.id)));
  const active = plans.find((plan) => plan.status === 'active');

  const counts = new Map<TopicId, Record<PlanPlatform, number>>(
    TOPICS.map((topic) => [topic.id, { leetcode: 0, cses: 0, codeforces: 0 }]),
  );
  for (const row of countCatalogByTopic(ctx.db)) {
    if (!(PLAN_PLATFORMS as readonly string[]).includes(row.platform)) continue;
    for (const topic of row.topics) {
      const entry = counts.get(topic as TopicId);
      if (entry) entry[row.platform as PlanPlatform] += 1;
    }
  }

  return {
    llm: llmStatus(ctx),
    active: active ? toPlanView(ctx, active) : null,
    drafts: summaries.filter((plan) => plan.status === 'draft'),
    past: summaries.filter((plan) => plan.status === 'done' || plan.status === 'archived'),
    topics: TOPICS.map((topic) => ({
      id: topic.id,
      label: topic.label,
      counts: counts.get(topic.id) ?? { leetcode: 0, cses: 0, codeforces: 0 },
    })),
  };
}

/** The candidates the model may choose from, per topic (PRD section 7, step 3). */
export function candidatesFor(ctx: AppContext, request: PlanRequest): Map<TopicId, PlanCandidate[]> {
  const out = new Map<TopicId, PlanCandidate[]>();
  for (const topic of request.topics) {
    const pool: PlanCandidate[] = listTopicProblems(ctx.db, topic, request.platforms).map((problem) => ({
      id: problem.id,
      platform: problem.platform,
      title: problem.title,
      difficultyRaw: problem.difficultyRaw,
      difficultyNorm: problem.difficultyNorm,
      topics: problem.topics,
      sourceTags: problem.sourceTags,
      solvedCount: problem.solvedCount,
      solved: problem.solved,
    }));
    out.set(topic, selectCandidates(pool, topic, request, CANDIDATES_PER_TOPIC));
  }
  return out;
}

function planTitle(topics: readonly TopicId[]): string {
  return topics.map(topicLabel).join(', ');
}

/**
 * Generates a plan and saves it as a draft (PRD section 7, steps 3 to 5). Nothing is saved
 * unless every problem in the model's answer is one of the catalog candidates it was shown.
 */
export async function generatePlan(ctx: AppContext, input: BridgeParsedInput<'generatePlan'>): Promise<PlanView> {
  const request: PlanRequest = { ...input };
  const problems = validatePlanRequest(request);
  if (problems.length > 0) throw new PlanError(problems.join(' '));

  const apiKey = ctx.secrets.available() ? ctx.secrets.getApiKey() : null;
  if (apiKey === null) throw new PlanError('Add an Anthropic API key in Settings to generate a plan.');

  const candidates = candidatesFor(ctx, request);
  const empty = request.topics.filter((topic) => (candidates.get(topic)?.length ?? 0) === 0);
  if (empty.length > 0) {
    throw new PlanError(
      `There are no catalog problems for ${empty.map(topicLabel).join(' and ')} on the platforms you chose. Pick another platform or topic.`,
    );
  }

  const model = getSettings(ctx.db).planModel;
  let generated;
  try {
    generated = await generateWithModel(ctx.models.client(apiKey), model, request, candidates);
  } catch (error) {
    // Both kinds carry a message written for the user. Anything else is a bug: say so plainly.
    if (error instanceof PlanGenerationError || error instanceof LlmError) throw new PlanError(error.message);
    throw new PlanError('The plan could not be generated. Nothing was saved. Try again.');
  }

  // The time is read after the model answered: a slow request must not date the plan in the past.
  const now = ctx.clock.now().toISOString();
  const plan = ctx.db.transaction(() =>
    insertPlan(
      ctx.db,
      {
        title: planTitle(request.topics),
        topics: request.topics,
        platforms: request.platforms,
        level: request.level,
        targetSize: request.targetSize,
        // The model that wrote the plan: a fallback model when the API used one.
        model: generated.model,
      },
      generated.items,
      now,
    ),
  );
  ctx.notifyChanged();
  return toPlanView(ctx, plan);
}

function requireItem(ctx: AppContext, planId: number, problemId: number): { items: PlanItemRecord[]; item: PlanItemRecord } {
  const items = listPlanItems(ctx.db, planId);
  const item = items.find((candidate) => candidate.problemId === problemId);
  if (!item) throw new PlanError('That problem is not in this plan.');
  return { items, item };
}

export function removePlanItem(ctx: AppContext, input: { planId: number; problemId: number }): PlanView {
  const plan = ctx.db.transaction(() => {
    const draft = requireDraft(ctx, input.planId);
    const { items, item } = requireItem(ctx, input.planId, input.problemId);
    if (items.length <= 1) throw new PlanError('A plan needs at least one problem. Delete the plan instead.');
    deletePlanItem(ctx.db, item.id);
    reorderPlanItems(
      ctx.db,
      items.filter((other) => other.id !== item.id).map((other) => other.id),
    );
    return draft;
  });
  ctx.notifyChanged();
  return toPlanView(ctx, plan);
}

const sameSection = (a: PlanItemRecord, b: PlanItemRecord): boolean =>
  a.topic === b.topic && a.stage === b.stage && a.groupName === b.groupName;

/** Moves a problem one place within its stage or pattern group. At the edge it stays where it is. */
export function movePlanItem(
  ctx: AppContext,
  input: { planId: number; problemId: number; direction: 'up' | 'down' },
): PlanView {
  const plan = ctx.db.transaction(() => {
    const draft = requireDraft(ctx, input.planId);
    const { items, item } = requireItem(ctx, input.planId, input.problemId);
    const index = items.indexOf(item);
    const other = items[index + (input.direction === 'up' ? -1 : 1)];
    if (other && sameSection(item, other)) {
      const order = items.map((entry) => entry.id);
      order[index] = other.id;
      order[items.indexOf(other)] = item.id;
      reorderPlanItems(ctx.db, order);
    }
    return draft;
  });
  ctx.notifyChanged();
  return toPlanView(ctx, plan);
}

/** Catalog problems of the same topic, on the plan's platforms, that are not in the plan yet. */
function swapCandidates(ctx: AppContext, plan: PlanRecord, items: readonly PlanItemRecord[], item: PlanItemRecord): PlanCandidate[] {
  const used = new Set(items.map((entry) => entry.problemId));
  const pool = candidatesFor(ctx, {
    topics: [item.topic],
    platforms: plan.platforms,
    level: plan.level,
    targetSize: plan.targetSize,
  });
  return (pool.get(item.topic) ?? []).filter((candidate) => !used.has(candidate.id));
}

export function getPlanSwapOptions(ctx: AppContext, input: { planId: number; problemId: number }): ProblemSummary[] {
  const plan = requireDraft(ctx, input.planId);
  const { items, item } = requireItem(ctx, input.planId, input.problemId);
  const current = getProblem(ctx.db, item.problemId);
  const target = current?.difficultyNorm ?? 3;
  // Nearest in difficulty first, unsolved before solved; a dozen is plenty to choose from.
  return swapCandidates(ctx, plan, items, item)
    .sort(
      (a, b) =>
        Number(a.solved) - Number(b.solved) ||
        Math.abs((a.difficultyNorm ?? 3) - target) - Math.abs((b.difficultyNorm ?? 3) - target) ||
        (b.solvedCount ?? 0) - (a.solvedCount ?? 0) ||
        a.id - b.id,
    )
    .slice(0, 12)
    .flatMap((candidate) => {
      const problem = getProblem(ctx.db, candidate.id);
      return problem ? [toSummary(problem)] : [];
    });
}

export function swapPlanItem(
  ctx: AppContext,
  input: { planId: number; problemId: number; replacementId: number },
): PlanView {
  const plan = ctx.db.transaction(() => {
    const draft = requireDraft(ctx, input.planId);
    const { items, item } = requireItem(ctx, input.planId, input.problemId);
    // The replacement must be a catalog problem of the same topic that the plan does not hold:
    // the same rule the model's answer is held to.
    const allowed = swapCandidates(ctx, draft, items, item).some((candidate) => candidate.id === input.replacementId);
    if (!allowed) throw new PlanError('That problem cannot take this place. Pick one from the list.');
    setItemProblem(ctx.db, item.id, input.replacementId);
    return draft;
  });
  ctx.notifyChanged();
  return toPlanView(ctx, plan);
}

/**
 * Makes a draft the active plan. One plan is active at a time: a plan that was active is
 * archived. Problems the user has already attempted are skipped; they come back as reviews.
 */
export function activatePlan(ctx: AppContext, planId: number): PlanView {
  const now = ctx.clock.now().toISOString();
  const plan = ctx.db.transaction(() => {
    const draft = requireDraft(ctx, planId);
    const items = listPlanItems(ctx.db, planId);
    const attempted = new Set(listAttemptedProblemTimes(ctx.db).map((entry) => entry.problemId));
    if (items.every((item) => attempted.has(item.problemId))) {
      throw new PlanError('You have already solved every problem in this plan. Generate a new one.');
    }
    const current = getActivePlan(ctx.db);
    if (current) setPlanStatus(ctx.db, current.id, 'archived');
    for (const item of items) {
      if (attempted.has(item.problemId)) setItemState(ctx.db, item.id, 'skipped');
    }
    setPlanStatus(ctx.db, planId, 'active', { activatedAt: now });
    return requirePlan(ctx, draft.id);
  });
  ctx.notifyChanged();
  return toPlanView(ctx, plan);
}

export function archivePlan(ctx: AppContext, planId: number): PlanOverview {
  ctx.db.transaction(() => {
    const plan = requirePlan(ctx, planId);
    if (plan.status !== 'active') throw new PlanError('Only the active plan can be archived.');
    setPlanStatus(ctx.db, planId, 'archived');
  });
  ctx.notifyChanged();
  return getPlanOverview(ctx);
}

export function deletePlan(ctx: AppContext, planId: number): PlanOverview {
  ctx.db.transaction(() => {
    const plan = requirePlan(ctx, planId);
    if (plan.status === 'active') throw new PlanError('Archive the active plan before deleting it.');
    // A finished plan is part of the record (it earned the graduation cap): it is never deleted.
    if (plan.status === 'done') throw new PlanError('A finished plan is kept.');
    deletePlanRow(ctx.db, planId);
  });
  ctx.notifyChanged();
  return getPlanOverview(ctx);
}

// ---------------------------------------------------------------------------------------------
// The daily loop
// ---------------------------------------------------------------------------------------------

/** The active plan's problems still to assign, in plan order. Empty when no plan is active. */
export function activePlanQueue(ctx: AppContext): number[] {
  const plan = getActivePlan(ctx.db);
  return plan ? planQueue(toProgressItems(listPlanItems(ctx.db, plan.id))) : [];
}

/**
 * Records an attempt against the active plan. Call inside the report's transaction, after the
 * attempt is stored. Returns the pattern group the problem belongs to, if any, and the title of
 * the plan when this attempt finished it.
 */
export function recordPlanAttempt(
  ctx: AppContext,
  problemId: number,
  now: string,
): { groupName: string | null; finishedPlan: string | null } {
  const plan = getActivePlan(ctx.db);
  if (!plan) return { groupName: null, finishedPlan: null };
  const items = listPlanItems(ctx.db, plan.id);
  const item = items.find((entry) => entry.problemId === problemId);
  if (!item) return { groupName: null, finishedPlan: null };
  if (item.state !== 'done') {
    setItemState(ctx.db, item.id, 'done');
    item.state = 'done';
  }
  if (isPlanFinished(toProgressItems(items))) {
    finishPlan(ctx.db, plan.id, now);
    return { groupName: item.groupName, finishedPlan: plan.title };
  }
  return { groupName: item.groupName, finishedPlan: null };
}

/**
 * Brings the active plan's progress in line with the attempts (PRD section 10). Returns how many
 * items were corrected. Run at launch, inside the reconcile transaction.
 */
export function reconcileActivePlan(ctx: AppContext, now: string): number {
  const plan = getActivePlan(ctx.db);
  if (!plan || plan.activatedAt === null) return 0;
  const activatedAt = plan.activatedAt;
  const items = listPlanItems(ctx.db, plan.id);
  const times = listAttemptedProblemTimes(ctx.db);
  const states = recomputeItemStates(toProgressItems(items), {
    before: new Set(times.filter((entry) => entry.first < activatedAt).map((entry) => entry.problemId)),
    since: new Set(times.filter((entry) => entry.last >= activatedAt).map((entry) => entry.problemId)),
  });
  let corrected = 0;
  items.forEach((item, index) => {
    const state = states[index];
    if (state && state !== item.state) {
      setItemState(ctx.db, item.id, state);
      item.state = state;
      corrected += 1;
    }
  });
  if (isPlanFinished(toProgressItems(items))) finishPlan(ctx.db, plan.id, now);
  return corrected;
}

// ---------------------------------------------------------------------------------------------
// The API key
// ---------------------------------------------------------------------------------------------

export function saveApiKey(ctx: AppContext, apiKey: string): LlmStatus {
  if (!ctx.secrets.available()) {
    throw new PlanError('This Mac cannot encrypt the key right now, so it was not saved.');
  }
  ctx.secrets.setApiKey(apiKey.trim());
  ctx.notifyChanged();
  return llmStatus(ctx);
}

export function removeApiKey(ctx: AppContext): LlmStatus {
  ctx.secrets.clearApiKey();
  ctx.notifyChanged();
  return llmStatus(ctx);
}

/** Asks Anthropic for the model list with the stored key: free, and it proves the key works. */
export async function testApiKey(ctx: AppContext): Promise<ApiKeyTest> {
  const apiKey = ctx.secrets.available() ? ctx.secrets.getApiKey() : null;
  if (apiKey === null) return { ok: false, reason: 'No API key is saved.' };
  try {
    const models = await ctx.models.listModels(apiKey);
    return { ok: true, modelAvailable: models.includes(getSettings(ctx.db).planModel) };
  } catch (error) {
    return { ok: false, reason: error instanceof LlmError ? error.message : 'The key could not be checked. Try again.' };
  }
}
