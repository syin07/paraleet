// The typed bridge between the UI and the main process (PRD section 9). The UI never touches the
// database or the network: it calls these methods on `window.paraleet`. Inputs are validated in
// the main process with the zod schemas below. Owned by the lead: do not change without the
// lead's say.
import { z } from 'zod';
import {
  PLAN_LEVELS,
  PLAN_MAX_TOPICS,
  PLAN_PLATFORMS,
  PLAN_SIZE_MAX,
  PLAN_SIZE_MIN,
  type PlanItemState,
  type PlanLevel,
  type PlanPlatform,
  type PlanProgress,
  type PlanStage,
  type PlanStatus,
} from '../core/plan';
import { settingsPatchSchema, timeOfDaySchema, type Settings } from '../core/settings';
import { STATS_RANGES, type Stats } from '../core/stats';
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

/** Where the compact card opens from. */
export const CARD_ANCHORS = ['pet', 'tray'] as const;
export type CardAnchor = (typeof CARD_ANCHORS)[number];
/** The compact card is 320 points wide, 360 while it shows the report form. */
export const CARD_WIDTH = 320;
export const CARD_WIDTH_REPORT = 360;
export const CARD_MIN_HEIGHT = 120;
export const CARD_MAX_HEIGHT = 640;

const problemId = z.number().int().positive();
const problemRef = z.object({ problemId });
const planId = z.number().int().positive();
const planRef = z.object({ planId });
const planItemRef = z.object({ planId, problemId });
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
  /** Shows the main window on Today with the swap choices open. */
  showSwap: z.undefined(),
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
  /**
   * Opens the compact card (today's problem, Open problem, I solved it) beside the floating pet
   * or under the menu bar icon. Opening it again from the same place closes it.
   */
  showCard: z.object({ anchor: z.enum(CARD_ANCHORS) }),
  /** Card window only: closes the card. */
  hideCard: z.undefined(),
  /** Card window only: the size its content needs, in points, so the window fits it. */
  setCardSize: z.object({
    width: z.union([z.literal(CARD_WIDTH), z.literal(CARD_WIDTH_REPORT)]),
    height: z.number().int().min(CARD_MIN_HEIGHT).max(CARD_MAX_HEIGHT),
  }),
  /** First launch: Para has hatched and the reminder times are chosen. */
  completeOnboarding: z.object({
    firstReminderTime: timeOfDaySchema,
    eveningReminderTime: timeOfDaySchema,
  }),
  /** Everything the Plan screen shows: the key's state, the active plan, drafts and past plans. */
  getPlanOverview: z.undefined(),
  /** Asks the model for a plan and saves it as a draft. Needs an API key. */
  generatePlan: z.object({
    topics: z.array(z.enum(TOPIC_IDS as [TopicId, ...TopicId[]])).min(1).max(PLAN_MAX_TOPICS),
    platforms: z.array(z.enum(PLAN_PLATFORMS)).min(1).max(PLAN_PLATFORMS.length),
    level: z.enum(PLAN_LEVELS),
    targetSize: z.number().int().min(PLAN_SIZE_MIN).max(PLAN_SIZE_MAX),
  }),
  getPlan: planRef,
  /** Draft plans only: takes a problem out of the plan. */
  removePlanItem: planItemRef,
  /** Draft plans only: moves a problem one place up or down within its stage or group. */
  movePlanItem: planItemRef.extend({ direction: z.enum(['up', 'down']) }),
  /** Draft plans only: other catalog problems that could take this one's place. */
  getPlanSwapOptions: planItemRef,
  /** Draft plans only: puts another catalog problem in this one's place. */
  swapPlanItem: planItemRef.extend({ replacementId: problemId }),
  /** Makes a draft the active plan. A plan that was active is archived. */
  activatePlan: planRef,
  archivePlan: planRef,
  /** Deletes a draft or an archived plan. */
  deletePlan: planRef,
  /** Stores the Anthropic API key, encrypted. The key is never sent back to the UI. */
  saveApiKey: z.object({ apiKey: z.string().trim().min(10).max(300) }),
  removeApiKey: z.undefined(),
  /** Asks Anthropic whether the stored key works. Costs nothing. */
  testApiKey: z.undefined(),
  /** Everything the Stats screen shows, for a range of 12, 26 or 53 weeks. */
  getStats: z.object({ range: z.enum(STATS_RANGES) }),
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
  /** The title of the plan this attempt finished, or null. */
  finishedPlan: string | null;
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

/** Whether plans can be generated, and with which model. The key itself never leaves main. */
export interface LlmStatus {
  hasKey: boolean;
  /** False when this Mac cannot encrypt the key, so none can be stored. */
  canStoreKey: boolean;
  model: string;
  suggestedModels: { id: string; label: string }[];
}

export type ApiKeyTest = { ok: true; modelAvailable: boolean } | { ok: false; reason: string };

export interface PlanSummary {
  id: number;
  title: string;
  status: PlanStatus;
  topics: TopicId[];
  platforms: PlanPlatform[];
  level: PlanLevel;
  model: string;
  createdAt: IsoInstant;
  progress: PlanProgress;
}

export interface PlanItemView {
  problem: ProblemSummary;
  state: PlanItemState;
  /** True for the problem the daily loop will assign next from this plan. */
  isNext: boolean;
}

/** A run of the plan: one stage of one topic, or one pattern group. */
export interface PlanSectionView {
  topic: TopicId;
  stage: PlanStage;
  /** The pattern group's name and one-sentence description, written by the model. */
  groupName: string | null;
  groupDescription: string | null;
  progress: PlanProgress;
  items: PlanItemView[];
}

export interface PlanView extends PlanSummary {
  targetSize: number;
  sections: PlanSectionView[];
}

export interface PlanOverview {
  llm: LlmStatus;
  active: PlanView | null;
  drafts: PlanSummary[];
  /** Finished and archived plans, newest first. */
  past: PlanSummary[];
  /** How many catalog problems each topic has on each platform, for the topic picker. */
  topics: { id: TopicId; label: string; counts: Record<PlanPlatform, number> }[];
}

/** What the Stats screen shows: the rules' output, plus the streaks the pet facts hold. */
export interface StatsView extends Stats {
  /** The ParaLeet day the numbers were built for. */
  today: ParaDay;
  streak: {
    /** 0 after a missed day. */
    current: number;
    longest: number;
  };
}

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
  showSwap: Done;
  movePetWindowBy: Done;
  endPetDrag: Done;
  setPetInteractive: Done;
  showPetMenu: Done;
  showCard: Done;
  hideCard: Done;
  setCardSize: Done;
  completeOnboarding: TodayView;
  getPlanOverview: PlanOverview;
  generatePlan: PlanView;
  getPlan: PlanView;
  removePlanItem: PlanView;
  movePlanItem: PlanView;
  getPlanSwapOptions: ProblemSummary[];
  swapPlanItem: PlanView;
  activatePlan: PlanView;
  archivePlan: PlanOverview;
  deletePlan: PlanOverview;
  saveApiKey: LlmStatus;
  removeApiKey: LlmStatus;
  testApiKey: ApiKeyTest;
  getStats: StatsView;
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
