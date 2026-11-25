// Domain types shared by every module. Owned by the lead: do not change without the lead's say.
import type { TopicId } from './topics';

export const PLATFORMS = ['leetcode', 'cses', 'codeforces', 'other'] as const;
export type Platform = (typeof PLATFORMS)[number];

/** The four ratings, worst to best. Meanings are in PRD section 5 and `RATING_MEANINGS`. */
export const RATINGS = ['again', 'hard', 'good', 'easy'] as const;
export type Rating = (typeof RATINGS)[number];

export const RATING_LABELS: Record<Rating, string> = {
  again: 'Again',
  hard: 'Hard',
  good: 'Good',
  easy: 'Easy',
};

/** Exact wording from PRD section 5. Show these in the UI as written. */
export const RATING_MEANINGS: Record<Rating, string> = {
  again: 'Could not solve it without reading the solution',
  hard: 'Solved it, but needed a hint or got badly stuck',
  good: 'Solved it alone with normal effort',
  easy: 'Saw the approach immediately and coded it cleanly',
};

/** A ParaLeet day as a local calendar date, `YYYY-MM-DD`. See `day.ts`. */
export type ParaDay = string;

/** An instant in UTC, ISO 8601 (`2026-11-25T10:00:00.000Z`). */
export type IsoInstant = string;

export type AttemptKind = 'first_solve' | 'review';
export type VerificationMethod = 'self_report';
export type ProblemOrigin = 'seed' | 'user';
export type AssignmentReason = 'review' | 'plan' | 'starter' | 'user_swap';
export type CardStatus = 'active' | 'retired';

/** Normalized difficulty for sorting across platforms: 1 easiest, 5 hardest. */
export type DifficultyNorm = 1 | 2 | 3 | 4 | 5;

export interface Problem {
  id: number;
  platform: Platform;
  /** The platform's own stable ID: LeetCode slug, CSES task number, Codeforces contest+index (`1352C`), or the cleaned URL for "other". */
  platformId: string;
  /** What people call it, when that differs from `platformId`: LeetCode's problem number. */
  displayId: string | null;
  title: string;
  url: string;
  /** As the platform gives it: `Easy`/`Medium`/`Hard`, or a Codeforces rating like `1500`. */
  difficultyRaw: string | null;
  difficultyNorm: DifficultyNorm | null;
  topics: TopicId[];
  /** The platform's original tags, unmapped. */
  sourceTags: string[];
  origin: ProblemOrigin;
  /** Position in the built-in starter list, or null when the problem is not on it. */
  starterPosition: number | null;
}

export interface Attempt {
  id: number;
  problemId: number;
  attemptedAt: IsoInstant;
  paraDay: ParaDay;
  rating: Rating;
  minutes: number | null;
  kind: AttemptKind;
  verification: VerificationMethod;
  /** True when the user revealed the key insight before reporting (rating is then capped at Hard). */
  insightRevealed: boolean;
  /** Pattern tags at the time of the attempt, kept for later pattern-level scheduling (PRD section 5). */
  patternTags: string[];
  notes: string | null;
}

export interface ProblemNotes {
  problemId: number;
  /** The trick in a sentence. */
  keyInsight: string | null;
  patternTags: string[];
  notes: string | null;
  solutionUrl: string | null;
}

/** JSON-safe scheduler state. Its exact shape is private to `scheduler.ts`. */
export type SchedulerState = { readonly [key: string]: string | number | null };

export interface ReviewCard {
  problemId: number;
  status: CardStatus;
  dueAt: IsoInstant;
  state: SchedulerState;
}

export const GROWTH_STAGES = ['egg', 'chick', 'fledgling', 'adult'] as const;
export type GrowthStage = (typeof GROWTH_STAGES)[number];

/** The pet facts that can be recomputed from the attempts (PRD section 10). */
export interface PetFacts {
  /** Attempts rated Hard, Good or Easy. */
  growthSolves: number;
  totalAttempts: number;
  /** The streak as of `lastFedDay`. Use `displayedStreak` to show it: a missed day makes it 0. */
  currentStreak: number;
  longestStreak: number;
  lastFedDay: ParaDay | null;
}

export interface DueReview {
  problemId: number;
  /** The ParaLeet day the review became due. */
  dueDay: ParaDay;
}

export interface PastAssignment {
  day: ParaDay;
  reason: AssignmentReason;
}

export interface AssignmentInput {
  today: ParaDay;
  /** Active cards due on or before today, in any order. */
  dueReviews: DueReview[];
  /** Assignments from earlier days. Must cover at least the 3 days before today when they exist. */
  recentAssignments: PastAssignment[];
  /** The next unsolved problems of the active plan, in plan order. Empty when no plan is active. */
  planQueue: number[];
  /** Unsolved starter-list problems, in list order. */
  starterQueue: number[];
}

export type AssignmentChoice =
  | { kind: 'assigned'; problemId: number; reason: Exclude<AssignmentReason, 'user_swap'> }
  | { kind: 'none' };

export interface SwapCandidates {
  /** Other due reviews, most overdue first, at most 5. */
  reviews: DueReview[];
  /** The next plan problems, in plan order, at most 5. */
  plan: number[];
}
