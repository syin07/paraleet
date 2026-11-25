// An in-memory stand-in for the main process, used when the UI runs in a plain browser
// (`npm run dev:ui` and the Playwright UI tests). It follows src/bridge/contract.ts and behaves
// like the real app closely enough to click through every screen. Owned by the lead.
//
// Pick a starting state with `?scenario=` in the URL: see SCENARIOS at the bottom.
// The mock's clock is frozen at noon on 2026-11-25 so screenshots never change with the date.
import starterSeed from '../../../seed/starter.json';
import type {
  AttemptView,
  CardSummary,
  DataInfo,
  DataSummary,
  DueReviewItem,
  LoggedProblemRow,
  ParaLeetApi,
  ParsedProblemUrl,
  ProblemDetail,
  ProblemSummary,
  ReportResult,
  TodayView,
} from '../../bridge/contract';
import { newlyUnlocked, unlockedAfterAttempt } from '../../core/accessories';
import { addDays, daysBetween, weekdayIndex } from '../../core/day';
import { CHECKING_MS, celebrationEndsAt, deriveMood, type Celebration } from '../../core/pet';
import { applyAttempt, EMPTY_PET_FACTS, isGrowthSolve, stageFor } from '../../core/petFacts';
import { pickLine } from '../../core/petLines';
import { DEFAULT_SETTINGS, type Settings } from '../../core/settings';
import { buildStats } from '../../core/stats';
import { displayedStreak, isFedOn, missedDays } from '../../core/streak';
import type { TopicId } from '../../core/topics';
import { ACCESSORY_IDS } from '../../core/types';
import {
  buildMockPlan,
  createPlanApi,
  emptyPlanState,
  mockPlanQueue,
  mockRecordPlanAttempt,
  type MockPlanState,
  type PlanHost,
} from './mockPlans';
import type {
  AccessoryId,
  AssignmentReason,
  DifficultyNorm,
  ParaDay,
  PetFacts,
  Platform,
  ProblemNotes,
  Rating,
} from '../../core/types';

export const MOCK_TODAY: ParaDay = '2026-11-25';
const MOCK_NOW = '2026-11-25T20:00:00.000Z';

interface MockAttempt extends AttemptView {
  problemId: number;
}

interface MockState {
  problems: ProblemSummary[];
  attempts: MockAttempt[];
  notes: Map<number, ProblemNotes>;
  cards: Map<number, { status: 'active' | 'retired'; dueDay: ParaDay }>;
  assignment: { problemId: number; reason: AssignmentReason; completed: boolean } | null;
  pet: PetFacts;
  settings: Settings;
  starterIds: number[];
  opened: string[];
  unlockedAccessories: AccessoryId[];
  equippedAccessories: AccessoryId[];
  hatched: boolean;
  windowCalls: string[];
  /** True once the "missed you" greeting was acknowledged. */
  greeted: boolean;
  celebration: Celebration | null;
  plans: MockPlanState;
  /** True when reading the stats should fail, to show the Stats screen's error state. */
  statsFail: boolean;
  data: MockDataState;
}

/** Export and import in the mock: there are no files, so the dialogs' answers are scripted. */
interface MockDataState {
  /** What the open dialog "picks": a good backup, a file that is not ParaLeet's, one from a newer ParaLeet, or nothing. */
  importFile: 'good' | 'not-paraleet' | 'newer' | 'none';
  /** What saving a copy does: works, is cancelled in the dialog, or fails. */
  save: 'ok' | 'cancel' | 'fails';
  /** True between a good `chooseImport` and the yes or no that follows. */
  pending: boolean;
  hasBackup: boolean;
  lastImport: DataInfo['lastImport'];
}

const MOCK_DATA_PATH = '/Users/you/Library/Application Support/ParaLeet/paraleet.sqlite3';
/** The backup the mock's open dialog "picks". */
const MOCK_IMPORT_SUMMARY: DataSummary = {
  attempts: 214,
  problems: 96,
  firstDay: '2026-03-02',
  lastDay: '2026-10-31',
  longestStreak: 41,
};

function dataSummary(state: MockState): DataSummary {
  const days = state.attempts.map((attempt) => attempt.paraDay).sort();
  return {
    attempts: state.attempts.length,
    problems: new Set(state.attempts.map((attempt) => attempt.problemId)).size,
    firstDay: days[0] ?? null,
    lastDay: days[days.length - 1] ?? null,
    longestStreak: state.pet.longestStreak,
  };
}

// A few non-LeetCode problems so every platform shows up in the mock. Mock data only.
const EXTRA_PROBLEMS: Omit<ProblemSummary, 'id'>[] = [
  {
    platform: 'cses',
    platformId: '1068',
    displayId: null,
    title: 'Weird Algorithm',
    url: 'https://cses.fi/problemset/task/1068',
    difficultyRaw: null,
    difficultyNorm: null,
    topics: ['implementation'],
  },
  {
    platform: 'codeforces',
    platformId: '4A',
    displayId: null,
    title: 'Watermelon',
    url: 'https://codeforces.com/problemset/problem/4/A',
    difficultyRaw: '800',
    difficultyNorm: 1,
    topics: ['math'],
  },
  {
    platform: 'codeforces',
    platformId: '1352C',
    displayId: null,
    title: 'K-th Not Divisible by n',
    url: 'https://codeforces.com/problemset/problem/1352/C',
    difficultyRaw: '1200',
    difficultyNorm: 2,
    topics: ['binary-search', 'math'],
  },
];

function baseState(): MockState {
  const seeded = starterSeed.problems.map((problem, index) => ({
    id: index + 1,
    platform: problem.platform as Platform,
    platformId: problem.platformId,
    displayId: problem.displayId,
    title: problem.title,
    url: problem.url,
    difficultyRaw: problem.difficultyRaw,
    difficultyNorm: problem.difficultyNorm as DifficultyNorm | null,
    topics: problem.topics as TopicId[],
  }));
  const extras = EXTRA_PROBLEMS.map((problem, index) => ({ ...problem, id: seeded.length + index + 1 }));
  return {
    problems: [...seeded, ...extras],
    attempts: [],
    notes: new Map(),
    cards: new Map(),
    assignment: null,
    pet: EMPTY_PET_FACTS,
    settings: { ...DEFAULT_SETTINGS },
    starterIds: seeded.map((problem) => problem.id),
    opened: [],
    unlockedAccessories: [],
    equippedAccessories: [],
    hatched: true,
    windowCalls: [],
    greeted: false,
    celebration: null,
    plans: emptyPlanState(),
    statsFail: false,
    data: { importFile: 'good', save: 'ok', pending: false, hasBackup: false, lastImport: null },
  };
}

const INTERVAL_DAYS: Record<Rating, number> = { again: 1, hard: 2, good: 4, easy: 7 };

function previewIntervals(state: MockState, problemId: number): Record<Rating, number> {
  const solved = state.attempts.filter((attempt) => attempt.problemId === problemId && attempt.rating !== 'again').length;
  const scale = 1 + solved;
  return {
    again: INTERVAL_DAYS.again,
    hard: INTERVAL_DAYS.hard * scale,
    good: INTERVAL_DAYS.good * scale,
    easy: INTERVAL_DAYS.easy * scale,
  };
}

function emptyNotes(problemId: number): ProblemNotes {
  return { problemId, keyInsight: null, patternTags: [], notes: null, solutionUrl: null };
}

function requireProblem(state: MockState, problemId: number): ProblemSummary {
  const problem = state.problems.find((candidate) => candidate.id === problemId);
  if (!problem) throw new Error(`Problem ${problemId} does not exist`);
  return problem;
}

/** Records an attempt on `day`, updating the card, the notes and the pet like the real app. */
function logAttempt(
  state: MockState,
  problemId: number,
  day: ParaDay,
  rating: Rating,
  extra: { minutes?: number | null; keyInsight?: string | null; notes?: string | null } = {},
): MockAttempt {
  const prior = state.attempts.filter((attempt) => attempt.problemId === problemId).length;
  const interval = previewIntervals(state, problemId)[rating];
  const attempt: MockAttempt = {
    id: state.attempts.length + 1,
    problemId,
    attemptedAt: `${day}T20:00:00.000Z`,
    paraDay: day,
    rating,
    minutes: extra.minutes ?? null,
    kind: prior === 0 ? 'first_solve' : 'review',
    notes: extra.notes ?? null,
  };
  state.attempts.push(attempt);
  if (extra.keyInsight) {
    state.notes.set(problemId, { ...(state.notes.get(problemId) ?? emptyNotes(problemId)), keyInsight: extra.keyInsight });
  }
  const existing = state.cards.get(problemId);
  state.cards.set(problemId, { status: existing?.status ?? 'active', dueDay: addDays(day, interval) });
  state.pet = applyAttempt(state.pet, { paraDay: day, rating });
  return attempt;
}

function dueReviews(state: MockState): DueReviewItem[] {
  return [...state.cards.entries()]
    .filter(([, card]) => card.status === 'active' && daysBetween(card.dueDay, MOCK_TODAY) >= 0)
    .map(([problemId, card]) => ({
      problem: requireProblem(state, problemId),
      dueDay: card.dueDay,
      daysOverdue: daysBetween(card.dueDay, MOCK_TODAY),
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue || a.problem.id - b.problem.id);
}

function nextStarter(state: MockState): number | null {
  const attempted = new Set(state.attempts.map((attempt) => attempt.problemId));
  return state.starterIds.find((id) => !attempted.has(id)) ?? null;
}

/** The same order as the real policy: most overdue review, then the active plan, then the starter list. */
function assignToday(state: MockState): void {
  const review = dueReviews(state)[0];
  if (review) {
    state.assignment = { problemId: review.problem.id, reason: 'review', completed: false };
    return;
  }
  const planned = mockPlanQueue(state.plans)[0];
  if (planned !== undefined) {
    state.assignment = { problemId: planned, reason: 'plan', completed: false };
    return;
  }
  const starter = nextStarter(state);
  state.assignment = starter === null ? null : { problemId: starter, reason: 'starter', completed: false };
}

function cardSummary(state: MockState, problemId: number): CardSummary | null {
  const card = state.cards.get(problemId);
  if (!card) return null;
  return {
    status: card.status,
    dueDay: card.dueDay,
    isDue: card.status === 'active' && daysBetween(card.dueDay, MOCK_TODAY) >= 0,
  };
}

const PLATFORM_NAMES: Record<string, string> = {
  leetcode: 'LeetCode',
  cses: 'CSES',
  codeforces: 'Codeforces',
  other: 'Other',
};

const LOADED_AT = Date.now();

/**
 * The mock's clock: the frozen moment plus the real time since the page loaded, so that the few
 * seconds of checking and eating after a report play out as they do in the app. The day never
 * changes.
 */
function mockNow(): Date {
  return new Date(Date.parse(MOCK_NOW) + (Date.now() - LOADED_AT));
}

function todayView(state: MockState): TodayView {
  const streakState = {
    current: state.pet.currentStreak,
    longest: state.pet.longestStreak,
    lastFedDay: state.pet.lastFedDay,
  };
  const monday = addDays(MOCK_TODAY, -weekdayIndex(MOCK_TODAY));
  const fedDays = new Set(state.attempts.map((attempt) => attempt.paraDay));
  const assignment = state.assignment;
  const openProblem = assignment && !assignment.completed ? requireProblem(state, assignment.problemId) : null;
  // The mock lives in UTC: 20:00 is after the first reminder (16:00) and before the evening one.
  const mood = deriveMood({
    now: mockNow(),
    timeZone: 'UTC',
    dayBoundaryHour: state.settings.dayBoundaryHour,
    firstReminderTime: state.settings.firstReminderTime,
    eveningReminderTime: state.settings.eveningReminderTime,
    fedToday: isFedOn(streakState, MOCK_TODAY),
    missedDays: missedDays(streakState, MOCK_TODAY),
    greetedToday: state.greeted,
    celebration: state.celebration,
  });
  return {
    today: MOCK_TODAY,
    fed: isFedOn(streakState, MOCK_TODAY),
    attemptsToday: state.attempts.filter((attempt) => attempt.paraDay === MOCK_TODAY).length,
    assignment: assignment
      ? {
          problem: requireProblem(state, assignment.problemId),
          reason: assignment.reason,
          completed: assignment.completed,
        }
      : null,
    dueReviews: dueReviews(state)
      .filter((review) => review.problem.id !== assignment?.problemId)
      .slice(0, 5),
    streak: {
      current: displayedStreak(streakState, MOCK_TODAY),
      longest: state.pet.longestStreak,
      week: Array.from({ length: 7 }, (_, index) => {
        const day = addDays(monday, index);
        return { day, fed: fedDays.has(day), isToday: day === MOCK_TODAY };
      }),
    },
    pet: {
      seed: 20261125,
      stage: stageFor(state.pet.growthSolves),
      growthSolves: state.pet.growthSolves,
      totalAttempts: state.pet.totalAttempts,
      mood,
      line: pickLine({
        seed: 20261125,
        today: MOCK_TODAY,
        mood,
        problemTitle: openProblem?.title ?? null,
        platformLabel: openProblem ? (PLATFORM_NAMES[openProblem.platform] ?? null) : null,
        streak: displayedStreak(streakState, MOCK_TODAY),
      }),
      unlockedAccessories: ACCESSORY_IDS.filter((id) => state.unlockedAccessories.includes(id)),
      equippedAccessories: ACCESSORY_IDS.filter((id) => state.equippedAccessories.includes(id)),
      hatched: state.hatched,
    },
  };
}

function problemDetail(state: MockState, problemId: number): ProblemDetail {
  return {
    problem: requireProblem(state, problemId),
    attempts: state.attempts
      .filter((attempt) => attempt.problemId === problemId)
      .map(({ problemId: _problemId, ...view }) => view)
      .reverse(),
    notes: state.notes.get(problemId) ?? emptyNotes(problemId),
    card: cardSummary(state, problemId),
  };
}

const URL_PATTERNS: { platform: Platform; pattern: RegExp; id: (match: RegExpExecArray) => string; url: (id: string) => string }[] = [
  {
    platform: 'leetcode',
    pattern: /^https?:\/\/(?:www\.)?leetcode\.(?:com|cn)\/problems\/([a-z0-9-]+)/i,
    id: (match) => (match[1] ?? '').toLowerCase(),
    url: (id) => `https://leetcode.com/problems/${id}/`,
  },
  {
    platform: 'cses',
    pattern: /^https?:\/\/(?:www\.)?cses\.fi\/problemset\/task\/(\d+)/i,
    id: (match) => match[1] ?? '',
    url: (id) => `https://cses.fi/problemset/task/${id}`,
  },
  {
    platform: 'codeforces',
    pattern: /^https?:\/\/(?:www\.)?codeforces\.com\/(?:problemset\/problem|contest|gym)\/(\d+)\/(?:problem\/)?([A-Za-z]\d?)/i,
    id: (match) => `${match[1] ?? ''}${(match[2] ?? '').toUpperCase()}`,
    url: (id) => `https://codeforces.com/problemset/problem/${id.replace(/^(\d+)/, '$1/')}`,
  },
];

function recognize(text: string): { platform: Platform; platformId: string; canonicalUrl: string } | { reason: string } {
  const trimmed = text.trim();
  for (const entry of URL_PATTERNS) {
    const match = entry.pattern.exec(trimmed);
    if (match) {
      const platformId = entry.id(match);
      return { platform: entry.platform, platformId, canonicalUrl: entry.url(platformId) };
    }
  }
  if (/^https?:\/\/\S+\.\S+/i.test(trimmed)) {
    const clean = trimmed.replace(/[?#].*$/, '').replace(/\/$/, '');
    return { platform: 'other', platformId: clean, canonicalUrl: clean };
  }
  return { reason: 'That does not look like a link. Paste the full problem URL.' };
}

function createApi(state: MockState): ParaLeetApi {
  const listeners = new Set<() => void>();
  const changed = (): void => listeners.forEach((listener) => listener());
  const planHost: PlanHost = {
    get plans() {
      return state.plans;
    },
    get problems() {
      return state.problems;
    },
    planModel: () => state.settings.planModel,
    attemptedIds: () => new Set(state.attempts.map((attempt) => attempt.problemId)),
    now: () => mockNow().toISOString(),
    changed,
  };

  return {
    getToday: async () => todayView(state),

    swapToday: async ({ problemId }) => {
      requireProblem(state, problemId);
      state.assignment = { problemId, reason: 'user_swap', completed: false };
      changed();
      return todayView(state);
    },

    getSwapCandidates: async () => ({
      reviews: dueReviews(state)
        .filter((review) => review.problem.id !== state.assignment?.problemId)
        .slice(0, 5),
      plan: [],
    }),

    openProblem: async ({ problemId }) => {
      state.opened.push(requireProblem(state, problemId).url);
      return { opened: true };
    },

    openSolutionLink: async ({ problemId }) => {
      const url = state.notes.get(problemId)?.solutionUrl;
      if (!url || !/^https?:\/\//i.test(url)) return { opened: false };
      state.opened.push(url);
      return { opened: true };
    },

    getReportContext: async ({ problemId }) => ({
      problem: requireProblem(state, problemId),
      kind: state.attempts.some((attempt) => attempt.problemId === problemId) ? 'review' : 'first_solve',
      hasKeyInsight: Boolean(state.notes.get(problemId)?.keyInsight),
      nextReviewInDays: previewIntervals(state, problemId),
    }),

    revealKeyInsight: async ({ problemId }) => ({ keyInsight: state.notes.get(problemId)?.keyInsight ?? null }),

    submitReport: async (input): Promise<ReportResult> => {
      requireProblem(state, input.problemId);
      const rating: Rating =
        input.insightRevealed && (input.rating === 'good' || input.rating === 'easy') ? 'hard' : input.rating;
      const before = state.pet;
      const streakBefore = todayView(state).streak.current;
      const attempt = logAttempt(state, input.problemId, MOCK_TODAY, rating, {
        minutes: input.minutes,
        keyInsight: input.keyInsight?.trim() || null,
        notes: input.notes?.trim() || null,
      });
      if (state.assignment?.problemId === input.problemId) state.assignment.completed = true;
      const unlockedBefore = ACCESSORY_IDS.filter((id) => state.unlockedAccessories.includes(id));
      state.unlockedAccessories = unlockedAfterAttempt(
        unlockedBefore,
        {
          solvedHardProblem: state.attempts.some(
            (logged) =>
              isGrowthSolve(logged.rating) && (requireProblem(state, logged.problemId).difficultyNorm ?? 0) >= 4,
          ),
          longestStreak: state.pet.longestStreak,
          plansFinished: 0,
        },
        rating,
      );
      // Para checks the report, then eats; tell the screens at each step, as the app does.
      const celebration: Celebration = { meal: rating === 'again' ? 'crumb' : 'full', reportedAt: mockNow() };
      state.celebration = celebration;
      setTimeout(changed, CHECKING_MS + 30);
      setTimeout(changed, celebrationEndsAt(celebration).getTime() - celebration.reportedAt.getTime() + 30);
      changed();
      const today = todayView(state);
      return {
        attemptId: attempt.id,
        meal: rating === 'again' ? 'crumb' : 'full',
        rating,
        streak: {
          current: today.streak.current,
          longest: today.streak.longest,
          increased: today.streak.current > streakBefore,
        },
        growth: {
          stage: stageFor(state.pet.growthSolves),
          previousStage: stageFor(before.growthSolves),
          growthSolves: state.pet.growthSolves,
        },
        unlocked: newlyUnlocked(unlockedBefore, state.unlockedAccessories),
        finishedPlan: mockRecordPlanAttempt(state.plans, input.problemId),
        nextReviewDay: state.cards.get(input.problemId)?.dueDay ?? null,
        today,
      };
    },

    listLoggedProblems: async (): Promise<LoggedProblemRow[]> => {
      const rows: LoggedProblemRow[] = [];
      for (const problem of state.problems) {
        const attempts = state.attempts.filter((attempt) => attempt.problemId === problem.id);
        const last = attempts[attempts.length - 1];
        if (!last) continue;
        rows.push({
          problem,
          attemptCount: attempts.length,
          lastAttemptAt: last.attemptedAt,
          lastAttemptDay: last.paraDay,
          lastRating: last.rating,
          card: cardSummary(state, problem.id),
        });
      }
      return rows.sort((a, b) => b.lastAttemptAt.localeCompare(a.lastAttemptAt) || b.problem.id - a.problem.id);
    },

    getProblemDetail: async ({ problemId }) => problemDetail(state, problemId),

    saveProblemNotes: async (input) => {
      requireProblem(state, input.problemId);
      const blank = (value: string | null): string | null => (value && value.trim() !== '' ? value.trim() : null);
      const saved: ProblemNotes = {
        problemId: input.problemId,
        keyInsight: blank(input.keyInsight),
        patternTags: [...new Set(input.patternTags.map((tag) => tag.trim()).filter(Boolean))],
        notes: blank(input.notes),
        solutionUrl: blank(input.solutionUrl),
      };
      state.notes.set(input.problemId, saved);
      changed();
      return saved;
    },

    retireCard: async ({ problemId }) => {
      const card = state.cards.get(problemId);
      if (!card) throw new Error('This problem has no review card yet');
      card.status = 'retired';
      changed();
      return problemDetail(state, problemId);
    },

    resetCard: async ({ problemId }) => {
      const card = state.cards.get(problemId);
      if (!card) throw new Error('This problem has no review card yet');
      card.status = 'active';
      card.dueDay = MOCK_TODAY;
      changed();
      return problemDetail(state, problemId);
    },

    searchProblems: async ({ query, limit = 8 }) => {
      const needle = query.trim().toLowerCase();
      if (needle === '') return [];
      return state.problems
        .filter(
          (problem) =>
            problem.title.toLowerCase().includes(needle) ||
            problem.displayId === needle ||
            problem.platformId.toLowerCase().includes(needle),
        )
        .slice(0, limit);
    },

    parseProblemUrl: async ({ url }): Promise<ParsedProblemUrl> => {
      const recognized = recognize(url);
      if ('reason' in recognized) return { ok: false, reason: recognized.reason };
      const known =
        state.problems.find(
          (problem) => problem.platform === recognized.platform && problem.platformId === recognized.platformId,
        ) ?? null;
      return {
        ok: true,
        ...recognized,
        known,
        alreadyLogged: known ? state.attempts.some((attempt) => attempt.problemId === known.id) : false,
      };
    },

    addProblem: async (input) => {
      // The app's Codeforces bands, so an added problem shows its difficulty color.
      const ratingBand = (rating: number): DifficultyNorm | null =>
        !Number.isFinite(rating) ? null : rating <= 1000 ? 1 : rating <= 1400 ? 2 : rating <= 1800 ? 3 : rating <= 2200 ? 4 : 5;
      const recognized = recognize(input.url);
      if ('reason' in recognized) return { ok: false, reason: recognized.reason };
      const existing = state.problems.find(
        (problem) => problem.platform === recognized.platform && problem.platformId === recognized.platformId,
      );
      if (existing) return { ok: true, problem: existing, created: false };
      const difficultyRaw = input.difficultyRaw?.trim() || null;
      const norms: Record<string, DifficultyNorm> = { easy: 1, medium: 3, hard: 5 };
      const problem: ProblemSummary = {
        id: Math.max(...state.problems.map((candidate) => candidate.id)) + 1,
        platform: recognized.platform,
        platformId: recognized.platformId,
        displayId: null,
        title: input.title.trim(),
        url: recognized.canonicalUrl,
        difficultyRaw,
        difficultyNorm: difficultyRaw
          ? recognized.platform === 'codeforces'
            ? ratingBand(Number(difficultyRaw))
            : (norms[difficultyRaw.toLowerCase()] ?? null)
          : null,
        topics: [...new Set(input.topics)],
      };
      state.problems.push(problem);
      changed();
      return { ok: true, problem, created: true };
    },

    setEquippedAccessories: async ({ accessories }) => {
      const locked = accessories.filter((id) => !state.unlockedAccessories.includes(id));
      if (locked.length > 0) throw new Error(`Not unlocked yet: ${locked.join(', ')}`);
      state.equippedAccessories = [...accessories];
      changed();
      return todayView(state);
    },

    acknowledgeGreeting: async () => {
      if (!state.greeted) {
        state.greeted = true;
        changed();
      }
      return todayView(state);
    },

    // Window commands do nothing in a browser; they are recorded so tests can see them.
    showMainWindow: async ({ screen }) => {
      state.windowCalls.push(`showMainWindow:${screen ?? ''}`);
      return { ok: true };
    },
    showSwap: async () => {
      state.windowCalls.push('showSwap');
      return { ok: true };
    },
    movePetWindowBy: async ({ dx, dy }) => {
      state.windowCalls.push(`movePetWindowBy:${dx},${dy}`);
      return { ok: true };
    },
    endPetDrag: async () => {
      state.windowCalls.push('endPetDrag');
      return { ok: true };
    },
    setPetInteractive: async ({ interactive }) => {
      state.windowCalls.push(`setPetInteractive:${interactive}`);
      return { ok: true };
    },
    showPetMenu: async () => {
      state.windowCalls.push('showPetMenu');
      return { ok: true };
    },

    showCard: async ({ anchor }) => {
      state.windowCalls.push(`showCard:${anchor}`);
      return { ok: true };
    },
    hideCard: async () => {
      state.windowCalls.push('hideCard');
      return { ok: true };
    },
    setCardSize: async ({ width, height }) => {
      state.windowCalls.push(`setCardSize:${width}x${height}`);
      return { ok: true };
    },
    completeOnboarding: async ({ firstReminderTime, eveningReminderTime }) => {
      const time = /^([01]\d|2[0-3]):[0-5]\d$/;
      if (!time.test(firstReminderTime) || !time.test(eveningReminderTime)) {
        throw new Error('Use a 24-hour time like 16:00');
      }
      state.settings = { ...state.settings, firstReminderTime, eveningReminderTime };
      state.hatched = true;
      changed();
      return todayView(state);
    },

    ...createPlanApi(planHost),

    getStats: async ({ range }) => {
      if (state.statsFail) throw new Error('The stats could not be read. Try again.');
      const streakState = {
        current: state.pet.currentStreak,
        longest: state.pet.longestStreak,
        lastFedDay: state.pet.lastFedDay,
      };
      return {
        ...buildStats({
          attempts: state.attempts.map((attempt) => ({
            problemId: attempt.problemId,
            day: attempt.paraDay,
            rating: attempt.rating,
            kind: attempt.kind,
            topics: requireProblem(state, attempt.problemId).topics,
          })),
          today: MOCK_TODAY,
          range,
        }),
        today: MOCK_TODAY,
        streak: { current: displayedStreak(streakState, MOCK_TODAY), longest: state.pet.longestStreak },
      };
    },

    getDataInfo: async () => ({
      path: MOCK_DATA_PATH,
      summary: dataSummary(state),
      hasImportBackup: state.data.hasBackup,
      importBackupName: 'paraleet.sqlite3.before-import',
      lastImport: state.data.lastImport,
    }),
    exportData: async () => {
      if (state.data.save === 'cancel') return { saved: false };
      if (state.data.save === 'fails') throw new Error('The copy could not be saved there. Choose another place and try again.');
      return { saved: true, path: `/Users/you/Documents/ParaLeet backup ${MOCK_TODAY}.sqlite3` };
    },
    chooseImport: async () => {
      state.data.pending = false;
      if (state.data.importFile === 'none') return { chosen: false };
      if (state.data.importFile === 'not-paraleet') {
        return { chosen: true, ok: false, fileName: 'recipes.sqlite3', reason: 'That file is not a ParaLeet database.' };
      }
      if (state.data.importFile === 'newer') {
        return {
          chosen: true,
          ok: false,
          fileName: 'ParaLeet backup 2027-03-01.sqlite3',
          reason: 'That file was made by a newer ParaLeet. Update ParaLeet, then import it.',
        };
      }
      state.data.pending = true;
      return {
        chosen: true,
        ok: true,
        fileName: 'ParaLeet backup 2026-10-31.sqlite3',
        incoming: { ...MOCK_IMPORT_SUMMARY },
        current: dataSummary(state),
      };
    },
    applyImport: async () => {
      if (!state.data.pending) throw new Error('Choose a file to import first.');
      // The real app restarts on the imported data. The mock keeps its own and says what a
      // restart would: an import was applied and the old data is kept as a backup.
      state.data.pending = false;
      state.data.hasBackup = true;
      state.data.lastImport = { status: 'applied' };
      state.windowCalls.push('restart');
      changed();
      return { ok: true };
    },
    cancelImport: async () => {
      state.data.pending = false;
      return { ok: true };
    },
    showDataInFinder: async () => {
      state.windowCalls.push('showDataInFinder');
      return { ok: true };
    },

    getSettings: async () => ({ ...state.settings }),

    updateSettings: async (patch) => {
      // The real app validates in main; the same limits here let UI tests exercise a refused save.
      const time = /^([01]\d|2[0-3]):[0-5]\d$/;
      if (patch.dayBoundaryHour !== undefined && !(Number.isInteger(patch.dayBoundaryHour) && patch.dayBoundaryHour >= 0 && patch.dayBoundaryHour <= 23)) {
        throw new Error('The day boundary must be a whole hour from 0 to 23');
      }
      for (const value of [patch.firstReminderTime, patch.eveningReminderTime]) {
        if (value !== undefined && !time.test(value)) throw new Error('Use a 24-hour time like 16:00');
      }
      if (patch.targetRetention !== undefined && !(patch.targetRetention >= 0.7 && patch.targetRetention <= 0.97)) {
        throw new Error('Target retention must be between 0.7 and 0.97');
      }
      if (patch.planModel !== undefined && !/^[A-Za-z0-9._:@-]{1,100}$/.test(patch.planModel.trim())) {
        throw new Error('Use a model ID such as claude-opus-5-5');
      }
      state.settings = { ...state.settings, ...patch };
      changed();
      return { ...state.settings };
    },

    onChanged: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    // Nothing asks a browser tab to navigate.
    onNavigate: () => () => undefined,
  };
}

// ---------- Scenarios ----------

/** Nine problems over two weeks, a 4-day streak, not fed today, four reviews due. */
function midway(state: MockState): void {
  const d = (offset: number): ParaDay => addDays(MOCK_TODAY, offset);
  logAttempt(state, 1, d(-14), 'good', { minutes: 12, keyInsight: 'Store each value\'s index in a hash map and look up the complement.' });
  logAttempt(state, 2, d(-13), 'easy', { minutes: 6 });
  logAttempt(state, 3, d(-12), 'hard', { minutes: 25, keyInsight: 'Track the lowest price so far; profit is today minus that.' });
  logAttempt(state, 33, d(-10), 'good', { minutes: 9 });
  logAttempt(state, 1, d(-10), 'good', { minutes: 7 });
  logAttempt(state, 4, d(-8), 'again', { minutes: 30, notes: 'Forgot to skip non-alphanumeric characters.' });
  logAttempt(state, 4, d(-7), 'hard', { minutes: 18, keyInsight: 'Two pointers from both ends, skipping anything that is not a letter or digit.' });
  logAttempt(state, 5, d(-4), 'good', { minutes: 10, keyInsight: 'Push openers; each closer must match the top of the stack.' });
  logAttempt(state, 6, d(-4), 'good', { minutes: 8 });
  logAttempt(state, 34, d(-3), 'hard', { minutes: 22 });
  logAttempt(state, 7, d(-2), 'good', { minutes: 14 });
  logAttempt(state, 35, d(-1), 'again', { minutes: 40, notes: 'Needed the editorial for the counting argument.' });
  state.notes.set(4, {
    ...(state.notes.get(4) ?? emptyNotes(4)),
    patternTags: ['two pointers from both ends'],
    notes: 'Second try went fine once I wrote the skip loops first.',
    solutionUrl: 'https://leetcode.com/problems/valid-palindrome/submissions/',
  });
}

/**
 * Most of a year of practice, for the Stats screen: busy weeks and quiet ones, a two-week break in
 * the summer, and a streak that runs through yesterday. The same history on every load.
 */
function longHistory(state: MockState): void {
  let seed = 20261125;
  const next = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let offset = -330; offset <= -1; offset += 1) {
    const inBreak = offset >= -150 && offset < -136;
    const inFinalRun = offset >= -12;
    if (inBreak || (!inFinalRun && next() < 0.22)) continue;
    const roll = next();
    const problems = roll < 0.58 ? 1 : roll < 0.84 ? 2 : roll < 0.95 ? 3 : 5;
    const used = new Set<number>();
    for (let index = 0; index < problems; index += 1) {
      const problem = state.problems[Math.floor(next() * state.problems.length)];
      if (!problem || used.has(problem.id)) continue;
      used.add(problem.id);
      const rated = next();
      const rating: Rating = rated < 0.1 ? 'again' : rated < 0.35 ? 'hard' : rated < 0.85 ? 'good' : 'easy';
      logAttempt(state, problem.id, addDays(MOCK_TODAY, offset), rating, { minutes: 5 + Math.floor(next() * 35) });
    }
  }
}

/** A plan built by the pretend model, for scenarios that start with one. */
function planFor(state: MockState, topics: TopicId[]) {
  return buildMockPlan(
    {
      plans: state.plans,
      problems: state.problems,
      planModel: () => state.settings.planModel,
      attemptedIds: () => new Set(),
      now: () => MOCK_NOW,
      changed: () => undefined,
    },
    { topics, platforms: ['leetcode'], level: 'some', targetSize: 12 },
  );
}

export const SCENARIOS: Record<string, (state: MockState) => void> = {
  /** The default: a user a few weeks in. */
  default: (state) => {
    midway(state);
    state.unlockedAccessories = ['scarf', 'bow_tie'];
    state.equippedAccessories = ['scarf'];
    assignToday(state);
  },
  /** The default history with three accessories unlocked and two worn. */
  accessories: (state) => {
    midway(state);
    state.unlockedAccessories = ['scarf', 'bow_tie', 'crown'];
    state.equippedAccessories = ['scarf', 'crown'];
    assignToday(state);
  },
  /** First launch: nothing logged, the first starter problem assigned. */
  fresh: (state) => assignToday(state),
  /** The very first launch, before the egg has hatched: the first-launch flow shows. */
  hatching: (state) => {
    state.hatched = false;
    assignToday(state);
  },
  /** Today's problem already reported. */
  fed: (state) => {
    midway(state);
    assignToday(state);
    if (state.assignment) {
      logAttempt(state, state.assignment.problemId, MOCK_TODAY, 'good', { minutes: 11 });
      state.assignment.completed = true;
    }
  },
  /** Back after a few days away: Para greets with "missed you" until the greeting is seen. */
  missed: (state) => {
    for (let index = 0; index < 5; index += 1) {
      const id = state.starterIds[index];
      if (id !== undefined) logAttempt(state, id, addDays(MOCK_TODAY, -9 + index), 'good', { minutes: 14 });
    }
    assignToday(state);
  },
  /** Six days in a row through yesterday and nothing unlocked: today's solve earns the bow tie. */
  milestone: (state) => {
    for (let index = 0; index < 6; index += 1) {
      const id = state.starterIds[index];
      if (id !== undefined) logAttempt(state, id, addDays(MOCK_TODAY, -6 + index), 'good', { minutes: 14 });
    }
    assignToday(state);
  },
  /** Plans: no API key saved yet. */
  'plan-nokey': (state) => {
    midway(state);
    assignToday(state);
    state.plans.hasKey = false;
  },
  /** Plans: this Mac cannot encrypt, so no key can be stored. */
  'plan-nostore': (state) => {
    midway(state);
    assignToday(state);
    state.plans.hasKey = false;
    state.plans.canStoreKey = false;
  },
  /** Plans: the model fails to produce a usable plan. */
  'plan-fails': (state) => {
    midway(state);
    assignToday(state);
    state.plans.model = 'fails';
  },
  /** Plans: a key is saved, but Anthropic does not accept it. */
  'plan-badkey': (state) => {
    midway(state);
    assignToday(state);
    state.plans.model = 'bad-key';
  },
  /** Plans: a freshly generated draft waiting for review. */
  'plan-draft': (state) => {
    midway(state);
    assignToday(state);
    state.plans.plans.push(planFor(state, ['binary-search', 'two-pointers']));
  },
  /** Plans: an active plan part way through, an older archived one and a finished one. */
  'plan-active': (state) => {
    midway(state);
    const finished = planFor(state, ['stacks']);
    finished.status = 'done';
    finished.items.forEach((item) => (item.state = 'done'));
    const archived = planFor(state, ['greedy']);
    archived.status = 'archived';
    const active = planFor(state, ['arrays-hashing', 'sliding-window']);
    active.status = 'active';
    active.items.slice(0, 4).forEach((item) => (item.state = 'done'));
    if (active.items[4]) active.items[4].state = 'skipped';
    state.plans.plans.push(finished, archived, active);
    assignToday(state);
  },
  /** Stats: most of a year of history. */
  'stats-year': (state) => {
    longHistory(state);
    state.unlockedAccessories = ['scarf', 'bow_tie', 'crown'];
    state.equippedAccessories = ['scarf'];
    assignToday(state);
  },
  /** Stats: the numbers cannot be read. */
  'stats-fails': (state) => {
    midway(state);
    assignToday(state);
    state.statsFail = true;
  },
  /** Data: the file picked for import is not a ParaLeet database. */
  'data-import-bad': (state) => {
    midway(state);
    assignToday(state);
    state.data.importFile = 'not-paraleet';
  },
  /** Data: the file picked for import was made by a newer ParaLeet. */
  'data-import-newer': (state) => {
    midway(state);
    assignToday(state);
    state.data.importFile = 'newer';
  },
  /** Data: every file dialog is closed without choosing. */
  'data-cancel': (state) => {
    midway(state);
    assignToday(state);
    state.data.importFile = 'none';
    state.data.save = 'cancel';
  },
  /** Data: the copy cannot be saved where the user chose. */
  'data-export-fails': (state) => {
    midway(state);
    assignToday(state);
    state.data.save = 'fails';
  },
  /** Data: this launch applied an import; the data it replaced is kept as a backup. */
  'data-imported': (state) => {
    midway(state);
    assignToday(state);
    state.data.hasBackup = true;
    state.data.lastImport = { status: 'applied' };
  },
  /** Data: this launch refused a staged import. */
  'data-import-refused': (state) => {
    midway(state);
    assignToday(state);
    state.data.lastImport = { status: 'rejected', reason: 'That file is damaged and cannot be imported. Your data was not changed.' };
  },
  /** More than five reviews due, to check the cap of five. */
  backlog: (state) => {
    for (let id = 1; id <= 9; id += 1) logAttempt(state, id, addDays(MOCK_TODAY, -20 + id), 'hard', { minutes: 15 });
    assignToday(state);
  },
  /** Nothing to assign: the starter list is finished and no review is due. */
  nothing: (state) => {
    for (const id of state.starterIds) logAttempt(state, id, addDays(MOCK_TODAY, -1), 'easy');
    assignToday(state);
  },
  /** A long history, to check the Problems table with many rows. */
  many: (state) => {
    const ratings: Rating[] = ['good', 'hard', 'easy', 'good', 'again', 'good'];
    state.problems.forEach((problem, index) => {
      logAttempt(state, problem.id, addDays(MOCK_TODAY, -40 + index), ratings[index % ratings.length] ?? 'good', {
        minutes: 5 + ((index * 7) % 35),
      });
    });
    assignToday(state);
  },
};

declare global {
  interface Window {
    /** Mock-only inspection hook for UI tests. */
    __paraleetMock?: { openedUrls(): string[]; windowCalls(): string[]; now: string };
  }
}

/** Puts the mock on `window.paraleet`. `scenario` comes from `?scenario=` and defaults to "default". */
export function installMockBridge(scenario: string | null): void {
  const state = baseState();
  (SCENARIOS[scenario ?? 'default'] ?? SCENARIOS.default)?.(state);
  window.paraleet = createApi(state);
  window.__paraleetMock = {
    openedUrls: () => [...state.opened],
    windowCalls: () => [...state.windowCalls],
    now: MOCK_NOW,
  };
}
