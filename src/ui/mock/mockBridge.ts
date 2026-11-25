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
  DueReviewItem,
  LoggedProblemRow,
  ParaLeetApi,
  ParsedProblemUrl,
  ProblemDetail,
  ProblemSummary,
  ReportResult,
  TodayView,
} from '../../bridge/contract';
import { addDays, daysBetween, weekdayIndex } from '../../core/day';
import { applyAttempt, EMPTY_PET_FACTS, stageFor } from '../../core/petFacts';
import { DEFAULT_SETTINGS, type Settings } from '../../core/settings';
import { displayedStreak, isFedOn } from '../../core/streak';
import type { TopicId } from '../../core/topics';
import type {
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

/** The same order as the real policy: most overdue review, then the starter list. */
function assignToday(state: MockState): void {
  const review = dueReviews(state)[0];
  if (review) {
    state.assignment = { problemId: review.problem.id, reason: 'review', completed: false };
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

function todayView(state: MockState): TodayView {
  const streakState = {
    current: state.pet.currentStreak,
    longest: state.pet.longestStreak,
    lastFedDay: state.pet.lastFedDay,
  };
  const monday = addDays(MOCK_TODAY, -weekdayIndex(MOCK_TODAY));
  const fedDays = new Set(state.attempts.map((attempt) => attempt.paraDay));
  const assignment = state.assignment;
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
      if (!url) return { opened: false };
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
        difficultyNorm: difficultyRaw ? (norms[difficultyRaw.toLowerCase()] ?? null) : null,
        topics: [...new Set(input.topics)],
      };
      state.problems.push(problem);
      changed();
      return { ok: true, problem, created: true };
    },

    getSettings: async () => ({ ...state.settings }),

    updateSettings: async (patch) => {
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

export const SCENARIOS: Record<string, (state: MockState) => void> = {
  /** The default: a user a few weeks in. */
  default: (state) => {
    midway(state);
    assignToday(state);
  },
  /** First launch: nothing logged, the first starter problem assigned. */
  fresh: (state) => assignToday(state),
  /** Today's problem already reported. */
  fed: (state) => {
    midway(state);
    assignToday(state);
    if (state.assignment) {
      logAttempt(state, state.assignment.problemId, MOCK_TODAY, 'good', { minutes: 11 });
      state.assignment.completed = true;
    }
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
    __paraleetMock?: { openedUrls(): string[]; now: string };
  }
}

/** Puts the mock on `window.paraleet`. `scenario` comes from `?scenario=` and defaults to "default". */
export function installMockBridge(scenario: string | null): void {
  const state = baseState();
  (SCENARIOS[scenario ?? 'default'] ?? SCENARIOS.default)?.(state);
  window.paraleet = createApi(state);
  window.__paraleetMock = { openedUrls: () => [...state.opened], now: MOCK_NOW };
}
