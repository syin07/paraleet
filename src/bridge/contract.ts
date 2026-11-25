// The typed bridge between the UI and the main process (PRD section 9). The UI never touches the
// database or the network: it calls these methods on `window.paraleet`. Inputs are validated in
// the main process with the zod schemas below. Owned by the lead: do not change without the
// lead's say.
import { z } from 'zod';
import { settingsPatchSchema, type Settings } from '../core/settings';
import { TOPIC_IDS, type TopicId } from '../core/topics';
import {
  ACCESSORY_IDS,
  PLATFORMS,
  RATINGS,
  type AccessoryId,
  type AssignmentReason,
  type AttemptKind,
  type CardStatus,
  type DifficultyNorm,
  type GrowthStage,
  type IsoInstant,
  type Mood,
  type ParaDay,
  type Platform,
  type ProblemNotes,
  type Rating,
} from '../core/types';
import type { BridgeMethodName } from './channels';

// ---------- Inputs (validated in main) ----------

/** The main window's screens, as used in its URL hash. */
export const MAIN_SCREENS = ['today', 'problems', 'plan', 'stats', 'settings'] as const;
export type MainScreen = (typeof MAIN_SCREENS)[number];

const problemId = z.number().int().positive();
const problemRef = z.object({ problemId });
const shortText = (max: number) => z.string().trim().max(max);

export const inputSchemas = {
  getToday: z.undefined(),
  swapToday: problemRef,
  getSwapCandidates: z.undefined(),
  openProblem: problemRef,
  openSolutionLink: problemRef,
  getReportContext: problemRef,
  revealKeyInsight: problemRef,
  submitReport: z.object({
    problemId,
    rating: z.enum(RATINGS),
    minutes: z.number().int().min(0).max(1440).nullable(),
    /** One line. Null leaves the saved insight unchanged. */
    keyInsight: shortText(300).nullable(),
    notes: shortText(5000).nullable(),
    /** True when the user revealed the saved key insight before reporting. */
    insightRevealed: z.boolean(),
  }),
  listLoggedProblems: z.undefined(),
  getProblemDetail: problemRef,
  saveProblemNotes: z.object({
    problemId,
    keyInsight: shortText(300).nullable(),
    patternTags: z.array(shortText(60)).max(20),
    notes: shortText(5000).nullable(),
    solutionUrl: shortText(500).nullable(),
  }),
  retireCard: problemRef,
  resetCard: problemRef,
  searchProblems: z.object({ query: z.string().max(200), limit: z.number().int().min(1).max(50).default(8) }),
  parseProblemUrl: z.object({ url: z.string().max(2000) }),
  addProblem: z.object({
    url: z.string().max(2000),
    title: shortText(300).min(1),
    difficultyRaw: shortText(20).nullable(),
    topics: z.array(z.enum(TOPIC_IDS as [TopicId, ...TopicId[]])).max(10),
  }),
  /** The accessories Para wears. Each must already be unlocked. */
  setEquippedAccessories: z.object({
    accessories: z.array(z.enum(ACCESSORY_IDS)).max(ACCESSORY_IDS.length),
  }),
  /** The user has seen Para's "missed you" greeting; Para returns to its normal mood. */
  acknowledgeGreeting: z.undefined(),
  /** Shows and focuses the main window, optionally on a given screen. */
  showMainWindow: z.object({ screen: z.enum(MAIN_SCREENS).nullable() }),
  /** Pet window only: moves it while the user drags the bird. Whole screen points. */
  movePetWindowBy: z.object({
    dx: z.number().int().min(-4000).max(4000),
    dy: z.number().int().min(-4000).max(4000),
  }),
  /** Pet window only: the drag ended, remember where the window is. */
  endPetDrag: z.undefined(),
  /** Pet window only: true while the pointer is over the bird or its bubble; elsewhere clicks pass through. */
  setPetInteractive: z.object({ interactive: z.boolean() }),
  /** Pet window only: opens the right-click menu at the pointer. */
  showPetMenu: z.undefined(),
  getSettings: z.undefined(),
  updateSettings: settingsPatchSchema,
} as const satisfies Record<BridgeMethodName, z.ZodType>;

export const platformSchema = z.enum(PLATFORMS);

// ---------- Outputs (plain data; main is trusted) ----------

export interface ProblemSummary {
  id: number;
  platform: Platform;
  platformId: string;
  /** LeetCode's problem number, when there is one. */
  displayId: string | null;
  title: string;
  url: string;
  difficultyRaw: string | null;
  difficultyNorm: DifficultyNorm | null;
  topics: TopicId[];
}

export interface DueReviewItem {
  problem: ProblemSummary;
  /** The ParaLeet day the review became due. */
  dueDay: ParaDay;
  /** 0 when it became due today. */
  daysOverdue: number;
}

export interface TodayAssignment {
  problem: ProblemSummary;
  reason: AssignmentReason;
  /** True once an attempt on this problem was reported today. */
  completed: boolean;
}

export interface PetSummary {
  /** Random per install; varies the bird's small traits. */
  seed: number;
  stage: GrowthStage;
  growthSolves: number;
  totalAttempts: number;
  /** What Para is doing right now. Derived, never stored. */
  mood: Mood;
  /** Today's speech-bubble line for that mood, or null when Para has nothing to say. */
  line: string | null;
  /** Accessories earned so far, in the fixed order of `ACCESSORY_IDS`. */
  unlockedAccessories: AccessoryId[];
  /** The unlocked accessories Para is wearing. */
  equippedAccessories: AccessoryId[];
  /** False until the first-launch hatching flow has finished. */
  hatched: boolean;
}

export interface StreakSummary {
  /** 0 after a missed day. */
  current: number;
  longest: number;
  /** The current week, Monday first. */
  week: { day: ParaDay; fed: boolean; isToday: boolean }[];
}

export interface TodayView {
  today: ParaDay;
  /** True when at least one attempt was reported today. */
  fed: boolean;
  attemptsToday: number;
  /** Null when there is nothing to assign (no due review, no plan, starter list finished). */
  assignment: TodayAssignment | null;
  /** Other due reviews: most overdue first, at most 5. There is never a count of the rest. */
  dueReviews: DueReviewItem[];
  streak: StreakSummary;
  pet: PetSummary;
}

export interface SwapCandidatesView {
  reviews: DueReviewItem[];
  plan: ProblemSummary[];
}

export interface ReportContext {
  problem: ProblemSummary;
  /** `first_solve` when the problem has no attempt yet. */
  kind: AttemptKind;
  /** True when a key insight is saved. On a review it stays hidden until revealed or reported. */
  hasKeyInsight: boolean;
  /** Whole days until the next review for each rating, or null while the scheduler cannot say. */
  nextReviewInDays: Record<Rating, number> | null;
}

export interface ReportResult {
  attemptId: number;
  /** `crumb` for Again (smaller reward), `full` for every other rating (PRD section 6). */
  meal: 'full' | 'crumb';
  /** The rating as recorded, after the cap for a revealed insight. */
  rating: Rating;
  streak: { current: number; longest: number; increased: boolean };
  growth: { stage: GrowthStage; previousStage: GrowthStage; growthSolves: number };
  /** Accessories this attempt unlocked, for celebrating. Empty for an attempt rated Again. */
  unlocked: AccessoryId[];
  /** The ParaLeet day of the next review, or null when none is scheduled. */
  nextReviewDay: ParaDay | null;
  today: TodayView;
}

export interface CardSummary {
  status: CardStatus;
  dueDay: ParaDay;
  /** True when the card is active and due today or earlier. */
  isDue: boolean;
}

export interface LoggedProblemRow {
  problem: ProblemSummary;
  attemptCount: number;
  lastAttemptAt: IsoInstant;
  /** The ParaLeet day of the last attempt, for "3d ago". */
  lastAttemptDay: ParaDay;
  lastRating: Rating;
  card: CardSummary | null;
}

export interface AttemptView {
  id: number;
  attemptedAt: IsoInstant;
  paraDay: ParaDay;
  rating: Rating;
  minutes: number | null;
  kind: AttemptKind;
  notes: string | null;
}

export interface ProblemDetail {
  problem: ProblemSummary;
  /** Newest first. */
  attempts: AttemptView[];
  notes: ProblemNotes;
  card: CardSummary | null;
}

export type ParsedProblemUrl =
  | {
      ok: true;
      platform: Platform;
      platformId: string;
      canonicalUrl: string;
      /** The matching problem when the app already knows it (from the catalog or added earlier). */
      known: ProblemSummary | null;
      /** True when the user has already logged an attempt on it. */
      alreadyLogged: boolean;
    }
  | { ok: false; reason: string };

export type AddProblemResult =
  | { ok: true; problem: ProblemSummary; created: boolean }
  | { ok: false; reason: string };

/** The answer of a command that returns nothing. */
export interface Done {
  ok: true;
}

export interface BridgeOutputs {
  getToday: TodayView;
  swapToday: TodayView;
  getSwapCandidates: SwapCandidatesView;
  /** Opens the problem's page on its platform in the default browser. */
  openProblem: { opened: boolean };
  /** Opens the user's saved link to their own solution. False when none is saved. */
  openSolutionLink: { opened: boolean };
  getReportContext: ReportContext;
  revealKeyInsight: { keyInsight: string | null };
  submitReport: ReportResult;
  listLoggedProblems: LoggedProblemRow[];
  getProblemDetail: ProblemDetail;
  saveProblemNotes: ProblemNotes;
  retireCard: ProblemDetail;
  resetCard: ProblemDetail;
  searchProblems: ProblemSummary[];
  parseProblemUrl: ParsedProblemUrl;
  addProblem: AddProblemResult;
  setEquippedAccessories: TodayView;
  acknowledgeGreeting: TodayView;
  showMainWindow: Done;
  movePetWindowBy: Done;
  endPetDrag: Done;
  setPetInteractive: Done;
  showPetMenu: Done;
  getSettings: Settings;
  updateSettings: Settings;
}

// ---------- The API the UI sees ----------

export type BridgeMethod = BridgeMethodName;
/** What the caller passes (before defaults are applied). */
export type BridgeInput<M extends BridgeMethod> = z.input<(typeof inputSchemas)[M]>;
/** What the handler in main receives (after validation and defaults). */
export type BridgeParsedInput<M extends BridgeMethod> = z.output<(typeof inputSchemas)[M]>;
export type BridgeOutput<M extends BridgeMethod> = BridgeOutputs[M];

export type ParaLeetApi = {
  [M in BridgeMethod]: undefined extends BridgeInput<M>
    ? () => Promise<BridgeOutput<M>>
    : (input: BridgeInput<M>) => Promise<BridgeOutput<M>>;
} & {
  /** Calls `listener` whenever data changed or the day rolled over. Returns an unsubscribe function. */
  onChanged(listener: () => void): () => void;
  /** Calls `listener` with a path such as `/settings` when main asks this window to show a screen. */
  onNavigate(listener: (path: string) => void): () => void;
};

/** What main implements: one handler per method. */
export type BridgeHandlers = {
  [M in BridgeMethod]: (input: BridgeParsedInput<M>) => BridgeOutput<M> | Promise<BridgeOutput<M>>;
};
