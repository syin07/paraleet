// Learning plans (PRD section 7). The model selects, it never invents: the app hands it candidate
// problems from the catalog and accepts back only IDs it handed out. Everything here is pure:
// choosing candidates, checking a model's answer, and tracking a plan's progress.
import { z } from 'zod';
import { isTopicId, type TopicId } from './topics';
import type { DifficultyNorm, Platform } from './types';

export const PLAN_LEVELS = ['new', 'some', 'comfortable'] as const;
export type PlanLevel = (typeof PLAN_LEVELS)[number];
export const PLAN_LEVEL_LABELS: Record<PlanLevel, string> = {
  new: 'New to this',
  some: 'Some practice',
  comfortable: 'Comfortable',
};

export const PLAN_STAGES = ['foundations', 'patterns', 'challenge'] as const;
export type PlanStage = (typeof PLAN_STAGES)[number];
export const PLAN_STAGE_LABELS: Record<PlanStage, string> = {
  foundations: 'Foundations',
  patterns: 'Pattern groups',
  challenge: 'Challenge',
};

export const PLAN_STATUSES = ['draft', 'active', 'done', 'archived'] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];
export const PLAN_ITEM_STATES = ['pending', 'done', 'skipped'] as const;
export type PlanItemState = (typeof PLAN_ITEM_STATES)[number];

/** Platforms a plan can draw from: the ones with a catalog. */
export const PLAN_PLATFORMS = ['leetcode', 'cses', 'codeforces'] as const satisfies readonly Platform[];
export type PlanPlatform = (typeof PLAN_PLATFORMS)[number];

export const PLAN_SIZE_MIN = 8;
export const PLAN_SIZE_MAX = 30;
export const PLAN_SIZE_DEFAULT = 20;
export const PLAN_MAX_TOPICS = 4;
/** How many candidates per topic are shown to the model. */
export const CANDIDATES_PER_TOPIC = 60;

/** What the user asks for (PRD section 7, steps 1 and 2). */
export interface PlanRequest {
  topics: TopicId[];
  platforms: PlanPlatform[];
  level: PlanLevel;
  /** About how many problems per topic. */
  targetSize: number;
}

/** A catalog problem as the plan rules see it. */
export interface PlanCandidate {
  id: number;
  platform: Platform;
  title: string;
  difficultyRaw: string | null;
  difficultyNorm: DifficultyNorm | null;
  topics: readonly TopicId[];
  sourceTags: readonly string[];
  /** How many people solved it on its platform, when known: a sign of a well-known problem. */
  solvedCount: number | null;
  /** True when the user has already attempted it. */
  solved: boolean;
}

/** The share of each difficulty a level's candidates aim for, easiest (1) to hardest (5). */
const LEVEL_MIX: Record<PlanLevel, Record<DifficultyNorm, number>> = {
  new: { 1: 0.45, 2: 0.25, 3: 0.2, 4: 0.08, 5: 0.02 },
  some: { 1: 0.25, 2: 0.25, 3: 0.3, 4: 0.15, 5: 0.05 },
  comfortable: { 1: 0.1, 2: 0.15, 3: 0.35, 4: 0.25, 5: 0.15 },
};

function byBestKnown(a: PlanCandidate, b: PlanCandidate): number {
  return (b.solvedCount ?? -1) - (a.solvedCount ?? -1) || a.id - b.id;
}

/**
 * The candidates for one topic: catalog problems on the chosen platforms that carry the topic,
 * best known first, spread over difficulties to suit the level. Problems with no difficulty
 * (CSES) share what room is left. Deterministic: the same catalog gives the same list.
 */
export function selectCandidates(
  problems: readonly PlanCandidate[],
  topic: TopicId,
  request: Pick<PlanRequest, 'platforms' | 'level'>,
  limit: number = CANDIDATES_PER_TOPIC,
): PlanCandidate[] {
  const platforms = new Set<Platform>(request.platforms);
  const pool = problems.filter((problem) => platforms.has(problem.platform) && problem.topics.includes(topic));
  const buckets = new Map<DifficultyNorm | 0, PlanCandidate[]>();
  for (const problem of pool) {
    const key = problem.difficultyNorm ?? 0;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(problem);
    else buckets.set(key, [problem]);
  }
  for (const bucket of buckets.values()) bucket.sort(byBestKnown);

  const unrated = buckets.get(0) ?? [];
  const hasRated = pool.length > unrated.length;
  // Unrated problems get a fixed share when both kinds exist, everything when they are all there is.
  const unratedRoom = hasRated ? Math.min(unrated.length, Math.round(limit * 0.2)) : limit;
  const ratedRoom = limit - (hasRated ? unratedRoom : limit);

  const chosen: PlanCandidate[] = [];
  const taken = new Set<number>();
  const take = (bucket: readonly PlanCandidate[], count: number): void => {
    for (const problem of bucket) {
      if (count <= 0) return;
      if (taken.has(problem.id)) continue;
      taken.add(problem.id);
      chosen.push(problem);
      count -= 1;
    }
  };

  const mix = LEVEL_MIX[request.level];
  for (const norm of [1, 2, 3, 4, 5] as const) take(buckets.get(norm) ?? [], Math.round(ratedRoom * mix[norm]));
  take(unrated, unratedRoom);
  // A thin bucket leaves room: fill it from the others, nearest the level's centre first.
  const fillOrder: (DifficultyNorm | 0)[] =
    request.level === 'new' ? [1, 2, 3, 0, 4, 5] : request.level === 'some' ? [3, 2, 1, 4, 0, 5] : [3, 4, 2, 5, 0, 1];
  for (const key of fillOrder) take(buckets.get(key) ?? [], limit - chosen.length);

  // Easiest first, best known first within a difficulty; unrated last.
  return chosen.sort(
    (a, b) => (a.difficultyNorm ?? 6) - (b.difficultyNorm ?? 6) || byBestKnown(a, b),
  );
}

// ---------------------------------------------------------------------------------------------
// The model's answer
// ---------------------------------------------------------------------------------------------

const idList = z.array(z.number().int().positive());

/** The shape the model must return. Group names and descriptions are the model's own words. */
export const planResponseSchema = z.object({
  topics: z.array(
    z.object({
      topic: z.string(),
      foundations: idList,
      groups: z.array(
        z.object({
          name: z.string().trim().min(1).max(60),
          description: z.string().trim().min(1).max(200),
          problems: idList,
        }),
      ),
      challenge: idList,
    }),
  ),
});
export type PlanResponse = z.infer<typeof planResponseSchema>;

/** One problem in a plan, in order. */
export interface PlanItemDraft {
  topic: TopicId;
  stage: PlanStage;
  /** The pattern group's name and one-sentence description; null outside the patterns stage. */
  groupName: string | null;
  groupDescription: string | null;
  problemId: number;
}

export type PlanValidation = { ok: true; items: PlanItemDraft[] } | { ok: false; errors: string[] };

export const PLAN_SHAPE = {
  foundations: { min: 2, max: 6 },
  groups: { min: 1, max: 5 },
  groupProblems: { min: 2, max: 6 },
  challenge: { min: 0, max: 4 },
} as const;

/**
 * Checks a model's answer (PRD section 7, step 5): the right topics, every problem ID from that
 * topic's candidates, no problem twice, stages in the required shape. Returns the plan's items
 * in order, or every problem found, in plain words the model can act on in one retry.
 */
export function validatePlanResponse(
  raw: unknown,
  request: PlanRequest,
  candidates: ReadonlyMap<TopicId, readonly PlanCandidate[]>,
): PlanValidation {
  const parsed = planResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join('.') || 'answer'}: ${issue.message}`),
    };
  }

  const errors: string[] = [];
  const wanted = new Set<string>(request.topics);
  const seenTopics = new Set<string>();
  const seenProblems = new Map<number, string>();
  const items: PlanItemDraft[] = [];

  for (const section of parsed.data.topics) {
    const name = section.topic;
    if (!isTopicId(name) || !wanted.has(name)) {
      errors.push(`"${name}" is not one of the requested topics (${request.topics.join(', ')}).`);
      continue;
    }
    if (seenTopics.has(name)) {
      errors.push(`The topic "${name}" appears more than once.`);
      continue;
    }
    seenTopics.add(name);
    const topic: TopicId = name;
    const allowed = new Set((candidates.get(topic) ?? []).map((candidate) => candidate.id));

    const check = (problemId: number, where: string): boolean => {
      if (!allowed.has(problemId)) {
        errors.push(`${where}: problem ${problemId} is not in the candidate list for "${topic}".`);
        return false;
      }
      const earlier = seenProblems.get(problemId);
      if (earlier !== undefined) {
        errors.push(`${where}: problem ${problemId} is already used in ${earlier}.`);
        return false;
      }
      seenProblems.set(problemId, where);
      return true;
    };
    const size = (count: number, limits: { min: number; max: number }, what: string): void => {
      // A topic with few candidates cannot fill the usual shape; never ask for more than exist.
      const min = Math.min(limits.min, allowed.size);
      if (count < min) errors.push(`${topic}: ${what} has ${count}, needs at least ${min}.`);
      if (count > limits.max) errors.push(`${topic}: ${what} has ${count}, at most ${limits.max} allowed.`);
    };

    size(section.foundations.length, PLAN_SHAPE.foundations, 'foundations');
    for (const problemId of section.foundations) {
      if (check(problemId, `${topic} foundations`)) {
        items.push({ topic, stage: 'foundations', groupName: null, groupDescription: null, problemId });
      }
    }

    size(section.groups.length, allowed.size >= 6 ? PLAN_SHAPE.groups : { min: 0, max: PLAN_SHAPE.groups.max }, 'pattern groups');
    const groupNames = new Set<string>();
    for (const group of section.groups) {
      const key = group.name.toLowerCase();
      if (groupNames.has(key)) errors.push(`${topic}: two pattern groups are both named "${group.name}".`);
      groupNames.add(key);
      size(group.problems.length, PLAN_SHAPE.groupProblems, `the group "${group.name}"`);
      for (const problemId of group.problems) {
        if (check(problemId, `${topic} group "${group.name}"`)) {
          items.push({
            topic,
            stage: 'patterns',
            groupName: group.name,
            groupDescription: group.description,
            problemId,
          });
        }
      }
    }

    size(section.challenge.length, PLAN_SHAPE.challenge, 'challenge');
    for (const problemId of section.challenge) {
      if (check(problemId, `${topic} challenge`)) {
        items.push({ topic, stage: 'challenge', groupName: null, groupDescription: null, problemId });
      }
    }
  }

  for (const topic of request.topics) {
    if (!seenTopics.has(topic)) errors.push(`The topic "${topic}" is missing.`);
  }
  if (errors.length > 0) return { ok: false, errors };

  // Requested order of topics, whatever order the model answered in.
  const order = new Map(request.topics.map((topic, index) => [topic, index]));
  const stageOrder = new Map(PLAN_STAGES.map((stage, index) => [stage, index]));
  const indexed = items.map((item, index) => ({ item, index }));
  indexed.sort(
    (a, b) =>
      (order.get(a.item.topic) ?? 0) - (order.get(b.item.topic) ?? 0) ||
      (stageOrder.get(a.item.stage) ?? 0) - (stageOrder.get(b.item.stage) ?? 0) ||
      a.index - b.index,
  );
  return { ok: true, items: indexed.map((entry) => entry.item) };
}

/** Checks what the user asked for before anything is sent anywhere. */
export function validatePlanRequest(request: PlanRequest): string[] {
  const errors: string[] = [];
  if (request.topics.length === 0) errors.push('Pick at least one topic.');
  if (request.topics.length > PLAN_MAX_TOPICS) errors.push(`Pick at most ${PLAN_MAX_TOPICS} topics for one plan.`);
  if (new Set(request.topics).size !== request.topics.length) errors.push('A topic is listed twice.');
  if (request.platforms.length === 0) errors.push('Pick at least one platform.');
  if (!Number.isInteger(request.targetSize) || request.targetSize < PLAN_SIZE_MIN || request.targetSize > PLAN_SIZE_MAX) {
    errors.push(`The size must be a whole number from ${PLAN_SIZE_MIN} to ${PLAN_SIZE_MAX}.`);
  }
  return errors;
}

// ---------------------------------------------------------------------------------------------
// A plan in use
// ---------------------------------------------------------------------------------------------

/** A stored plan item, as progress and the daily queue see it. */
export interface PlanItemProgress {
  position: number;
  topic: TopicId;
  stage: PlanStage;
  groupName: string | null;
  problemId: number;
  state: PlanItemState;
}

/** The problems the daily loop still has to assign from the plan, in plan order. */
export function planQueue(items: readonly PlanItemProgress[]): number[] {
  return [...items]
    .filter((item) => item.state === 'pending')
    .sort((a, b) => a.position - b.position)
    .map((item) => item.problemId);
}

/** A plan is finished when nothing in it is pending and it has at least one problem. */
export function isPlanFinished(items: readonly PlanItemProgress[]): boolean {
  return items.length > 0 && items.every((item) => item.state !== 'pending');
}

/**
 * The state each item should have given which problems have been attempted (PRD section 10:
 * plan progress can be recomputed from the attempts). A problem attempted before the plan was
 * activated is skipped (it comes back as a review instead); one attempted after is done.
 */
export function recomputeItemStates(
  items: readonly PlanItemProgress[],
  attempted: { before: ReadonlySet<number>; since: ReadonlySet<number> },
): PlanItemState[] {
  return items.map((item) => {
    if (attempted.since.has(item.problemId)) return 'done';
    if (attempted.before.has(item.problemId)) return 'skipped';
    // An item the user removed by hand stays skipped.
    return item.state === 'skipped' ? 'skipped' : 'pending';
  });
}

export interface PlanProgress {
  total: number;
  done: number;
  skipped: number;
  pending: number;
}

function count(items: readonly PlanItemProgress[]): PlanProgress {
  const done = items.filter((item) => item.state === 'done').length;
  const skipped = items.filter((item) => item.state === 'skipped').length;
  return { total: items.length, done, skipped, pending: items.length - done - skipped };
}

/** Progress for the whole plan, and per topic, stage and pattern group, in plan order. */
export function planProgress(items: readonly PlanItemProgress[]): {
  overall: PlanProgress;
  sections: { topic: TopicId; stage: PlanStage; groupName: string | null; progress: PlanProgress }[];
} {
  const sections: { topic: TopicId; stage: PlanStage; groupName: string | null; items: PlanItemProgress[] }[] = [];
  for (const item of [...items].sort((a, b) => a.position - b.position)) {
    const last = sections[sections.length - 1];
    if (last && last.topic === item.topic && last.stage === item.stage && last.groupName === item.groupName) {
      last.items.push(item);
    } else {
      sections.push({ topic: item.topic, stage: item.stage, groupName: item.groupName, items: [item] });
    }
  }
  return {
    overall: count(items),
    sections: sections.map((section) => ({
      topic: section.topic,
      stage: section.stage,
      groupName: section.groupName,
      progress: count(section.items),
    })),
  };
}
