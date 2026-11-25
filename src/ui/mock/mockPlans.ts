// Learning plans for the in-browser mock: the same contract as the app, with a pretend model that
// builds a plan out of the mock's own problems after a short wait. Dev and UI tests only.
import type {
  ApiKeyTest,
  LlmStatus,
  PlanOverview,
  PlanSectionView,
  PlanSummary,
  PlanView,
  ProblemSummary,
} from '../../bridge/contract';
import {
  planProgress,
  planQueue,
  SUGGESTED_PLAN_MODELS,
  type PlanItemProgress,
  type PlanItemState,
  type PlanLevel,
  type PlanPlatform,
  type PlanStage,
  type PlanStatus,
} from '../../core/plan';
import { TOPICS, topicLabel, type TopicId } from '../../core/topics';

interface MockPlanItem {
  topic: TopicId;
  stage: PlanStage;
  groupName: string | null;
  groupDescription: string | null;
  problemId: number;
  state: PlanItemState;
}

export interface MockPlan {
  id: number;
  title: string;
  status: PlanStatus;
  topics: TopicId[];
  platforms: PlanPlatform[];
  level: PlanLevel;
  targetSize: number;
  model: string;
  createdAt: string;
  items: MockPlanItem[];
}

export interface MockPlanState {
  hasKey: boolean;
  canStoreKey: boolean;
  /** What the pretend model does: answer, fail, or reject the key. */
  model: 'ok' | 'fails' | 'bad-key';
  /** How long the pretend model takes, in milliseconds. */
  delayMs: number;
  plans: MockPlan[];
  nextPlanId: number;
}

export function emptyPlanState(): MockPlanState {
  return { hasKey: true, canStoreKey: true, model: 'ok', delayMs: 900, plans: [], nextPlanId: 1 };
}

export interface PlanHost {
  plans: MockPlanState;
  problems: ProblemSummary[];
  planModel: () => string;
  attemptedIds: () => Set<number>;
  now: () => string;
  changed: () => void;
}

const GROUPS: [string, string][] = [
  ['The core pattern', 'Apply the technique in its plainest form, then with one extra condition.'],
  ['A common twist', 'Spot the same idea when the input is reshaped or the question is asked backwards.'],
  ['Combine with a second idea', 'Use the technique as one step inside a larger solution.'],
];

function progressItems(plan: MockPlan): PlanItemProgress[] {
  return plan.items.map((item, position) => ({
    position,
    topic: item.topic,
    stage: item.stage,
    groupName: item.groupName,
    problemId: item.problemId,
    state: item.state,
  }));
}

function summary(plan: MockPlan): PlanSummary {
  return {
    id: plan.id,
    title: plan.title,
    status: plan.status,
    topics: plan.topics,
    platforms: plan.platforms,
    level: plan.level,
    model: plan.model,
    createdAt: plan.createdAt,
    progress: planProgress(progressItems(plan)).overall,
  };
}

function view(host: PlanHost, plan: MockPlan): PlanView {
  const next = plan.status === 'active' ? (planQueue(progressItems(plan))[0] ?? null) : null;
  const sections: PlanSectionView[] = [];
  for (const item of plan.items) {
    const problem = host.problems.find((candidate) => candidate.id === item.problemId);
    if (!problem) continue;
    const last = sections[sections.length - 1];
    const entry = { problem, state: item.state, isNext: item.problemId === next };
    if (last && last.topic === item.topic && last.stage === item.stage && last.groupName === item.groupName) {
      last.items.push(entry);
    } else {
      sections.push({
        topic: item.topic,
        stage: item.stage,
        groupName: item.groupName,
        groupDescription: item.groupDescription,
        progress: { total: 0, done: 0, skipped: 0, pending: 0 },
        items: [entry],
      });
    }
  }
  for (const section of sections) {
    const done = section.items.filter((item) => item.state === 'done').length;
    const skipped = section.items.filter((item) => item.state === 'skipped').length;
    section.progress = { total: section.items.length, done, skipped, pending: section.items.length - done - skipped };
  }
  return { ...summary(plan), targetSize: plan.targetSize, sections };
}

function llm(host: PlanHost): LlmStatus {
  return {
    hasKey: host.plans.hasKey,
    canStoreKey: host.plans.canStoreKey,
    model: host.planModel(),
    suggestedModels: SUGGESTED_PLAN_MODELS.map((model) => ({ ...model })),
  };
}

function overview(host: PlanHost): PlanOverview {
  const active = host.plans.plans.find((plan) => plan.status === 'active');
  const summaries = [...host.plans.plans].reverse().map(summary);
  return {
    llm: llm(host),
    active: active ? view(host, active) : null,
    drafts: summaries.filter((plan) => plan.status === 'draft'),
    past: summaries.filter((plan) => plan.status === 'done' || plan.status === 'archived'),
    // The mock has few problems, so every topic gets a believable count on top of them.
    topics: TOPICS.map((topic, index) => ({
      id: topic.id,
      label: topic.label,
      counts: {
        leetcode: 30 + ((index * 37) % 200) + host.problems.filter((p) => p.platform === 'leetcode' && p.topics.includes(topic.id)).length,
        cses: index % 3 === 0 ? 0 : 5 + ((index * 7) % 30),
        codeforces: index % 5 === 0 ? 0 : 20 + ((index * 53) % 300),
      },
    })),
  };
}

function requirePlan(host: PlanHost, planId: number): MockPlan {
  const plan = host.plans.plans.find((candidate) => candidate.id === planId);
  if (!plan) throw new Error('That plan no longer exists.');
  return plan;
}

function requireDraft(host: PlanHost, planId: number): MockPlan {
  const plan = requirePlan(host, planId);
  if (plan.status !== 'draft') throw new Error('Only a draft plan can be edited.');
  return plan;
}

/** Builds a plan out of the mock's problems: the shape of a real one, not the judgment. */
export function buildMockPlan(
  host: PlanHost,
  request: { topics: TopicId[]; platforms: PlanPlatform[]; level: PlanLevel; targetSize: number },
): MockPlan {
  const used = new Set<number>();
  const items: MockPlanItem[] = [];
  for (const topic of request.topics) {
    const tagged = host.problems.filter((problem) => problem.topics.includes(topic) && !used.has(problem.id));
    const others = host.problems.filter((problem) => !problem.topics.includes(topic) && !used.has(problem.id));
    const pool = [...tagged, ...others].slice(0, Math.min(request.targetSize, 11));
    pool.forEach((problem) => used.add(problem.id));
    const take = (count: number): ProblemSummary[] => pool.splice(0, count);
    for (const problem of take(3)) {
      items.push({ topic, stage: 'foundations', groupName: null, groupDescription: null, problemId: problem.id, state: 'pending' });
    }
    for (const [name, description] of GROUPS.slice(0, 2)) {
      for (const problem of take(3)) {
        items.push({ topic, stage: 'patterns', groupName: name, groupDescription: description, problemId: problem.id, state: 'pending' });
      }
    }
    for (const problem of take(2)) {
      items.push({ topic, stage: 'challenge', groupName: null, groupDescription: null, problemId: problem.id, state: 'pending' });
    }
  }
  const plan: MockPlan = {
    id: host.plans.nextPlanId,
    title: request.topics.map(topicLabel).join(', '),
    status: 'draft',
    topics: request.topics,
    platforms: request.platforms,
    level: request.level,
    targetSize: request.targetSize,
    model: host.planModel(),
    createdAt: host.now(),
    items,
  };
  host.plans.nextPlanId += 1;
  return plan;
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function createPlanApi(host: PlanHost) {
  return {
    getPlanOverview: async (): Promise<PlanOverview> => overview(host),

    generatePlan: async (request: { topics: TopicId[]; platforms: PlanPlatform[]; level: PlanLevel; targetSize: number }): Promise<PlanView> => {
      if (!host.plans.hasKey) throw new Error('Add an Anthropic API key in Settings to generate a plan.');
      await wait(host.plans.delayMs);
      if (host.plans.model === 'bad-key') throw new Error('Anthropic did not accept the API key. Check it in Settings.');
      if (host.plans.model === 'fails') {
        throw new Error('The model did not produce a usable plan, even after one retry. Nothing was saved. Try again.');
      }
      const plan = buildMockPlan(host, request);
      host.plans.plans.push(plan);
      host.changed();
      return view(host, plan);
    },

    getPlan: async ({ planId }: { planId: number }): Promise<PlanView> => view(host, requirePlan(host, planId)),

    removePlanItem: async ({ planId, problemId }: { planId: number; problemId: number }): Promise<PlanView> => {
      const plan = requireDraft(host, planId);
      if (plan.items.length <= 1) throw new Error('A plan needs at least one problem. Delete the plan instead.');
      plan.items = plan.items.filter((item) => item.problemId !== problemId);
      host.changed();
      return view(host, plan);
    },

    movePlanItem: async ({ planId, problemId, direction }: { planId: number; problemId: number; direction: 'up' | 'down' }): Promise<PlanView> => {
      const plan = requireDraft(host, planId);
      const index = plan.items.findIndex((item) => item.problemId === problemId);
      const item = plan.items[index];
      const other = plan.items[index + (direction === 'up' ? -1 : 1)];
      if (item && other && item.topic === other.topic && item.stage === other.stage && item.groupName === other.groupName) {
        plan.items[index] = other;
        plan.items[index + (direction === 'up' ? -1 : 1)] = item;
        host.changed();
      }
      return view(host, plan);
    },

    getPlanSwapOptions: async ({ planId }: { planId: number; problemId: number }): Promise<ProblemSummary[]> => {
      const plan = requireDraft(host, planId);
      const used = new Set(plan.items.map((item) => item.problemId));
      return host.problems.filter((problem) => !used.has(problem.id)).slice(0, 12);
    },

    swapPlanItem: async ({ planId, problemId, replacementId }: { planId: number; problemId: number; replacementId: number }): Promise<PlanView> => {
      const plan = requireDraft(host, planId);
      const item = plan.items.find((candidate) => candidate.problemId === problemId);
      if (!item) throw new Error('That problem is not in this plan.');
      if (plan.items.some((candidate) => candidate.problemId === replacementId) || !host.problems.some((p) => p.id === replacementId)) {
        throw new Error('That problem cannot take this place. Pick one from the list.');
      }
      item.problemId = replacementId;
      host.changed();
      return view(host, plan);
    },

    activatePlan: async ({ planId }: { planId: number }): Promise<PlanView> => {
      const plan = requireDraft(host, planId);
      const attempted = host.attemptedIds();
      if (plan.items.every((item) => attempted.has(item.problemId))) {
        throw new Error('You have already solved every problem in this plan. Generate a new one.');
      }
      for (const other of host.plans.plans) if (other.status === 'active') other.status = 'archived';
      for (const item of plan.items) if (attempted.has(item.problemId)) item.state = 'skipped';
      plan.status = 'active';
      host.changed();
      return view(host, plan);
    },

    archivePlan: async ({ planId }: { planId: number }): Promise<PlanOverview> => {
      const plan = requirePlan(host, planId);
      if (plan.status !== 'active') throw new Error('Only the active plan can be archived.');
      plan.status = 'archived';
      host.changed();
      return overview(host);
    },

    deletePlan: async ({ planId }: { planId: number }): Promise<PlanOverview> => {
      const plan = requirePlan(host, planId);
      if (plan.status === 'active') throw new Error('Archive the active plan before deleting it.');
      if (plan.status === 'done') throw new Error('A finished plan is kept.');
      host.plans.plans = host.plans.plans.filter((candidate) => candidate.id !== planId);
      host.changed();
      return overview(host);
    },

    saveApiKey: async ({ apiKey }: { apiKey: string }): Promise<LlmStatus> => {
      if (!host.plans.canStoreKey) throw new Error('This Mac cannot encrypt the key right now, so it was not saved.');
      if (apiKey.trim().length < 10) throw new Error('That does not look like an API key.');
      host.plans.hasKey = true;
      host.changed();
      return llm(host);
    },

    removeApiKey: async (): Promise<LlmStatus> => {
      host.plans.hasKey = false;
      host.changed();
      return llm(host);
    },

    testApiKey: async (): Promise<ApiKeyTest> => {
      await wait(Math.min(host.plans.delayMs, 400));
      if (!host.plans.hasKey) return { ok: false, reason: 'No API key is saved.' };
      if (host.plans.model === 'bad-key') return { ok: false, reason: 'Anthropic did not accept the API key. Check it in Settings.' };
      return { ok: true, modelAvailable: SUGGESTED_PLAN_MODELS.some((model) => model.id === host.planModel()) };
    },
  };
}

/** The active plan's next problems, for the mock's daily assignment. */
export function mockPlanQueue(state: MockPlanState): number[] {
  const active = state.plans.find((plan) => plan.status === 'active');
  return active ? planQueue(progressItems(active)) : [];
}

/** Marks a problem done in the active plan. Returns the plan's title when that finished it. */
export function mockRecordPlanAttempt(state: MockPlanState, problemId: number): string | null {
  const active = state.plans.find((plan) => plan.status === 'active');
  const item = active?.items.find((candidate) => candidate.problemId === problemId);
  if (!active || !item) return null;
  item.state = 'done';
  if (active.items.every((candidate) => candidate.state !== 'pending')) {
    active.status = 'done';
    return active.title;
  }
  return null;
}
