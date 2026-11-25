// What the Stats screen shows, built from the user's attempts (PRD sections 5, 6 and 11).
// Pure: `today` is an argument and nothing here reads the clock. Streaks are not computed here;
// the pet facts already hold them.
import { addDays, daysBetween, weekdayIndex } from './day';
import { isGrowthSolve } from './petFacts';
import { TOPICS, type TopicId } from './topics';
import type { AttemptKind, ParaDay, Rating } from './types';

export const STATS_RANGES = ['12w', '6m', '1y'] as const;
export type StatsRange = (typeof STATS_RANGES)[number];
/** How many week columns each range shows, the current week included. */
export const STATS_RANGE_WEEKS: Record<StatsRange, number> = { '12w': 12, '6m': 26, '1y': 53 };
export const STATS_RANGE_LABELS: Record<StatsRange, string> = { '12w': '12 weeks', '6m': '6 months', '1y': '1 year' };

/** One attempt as the stats see it. `day` is the ParaLeet day stored on the attempt. */
export interface StatsAttempt {
  problemId: number;
  day: ParaDay;
  rating: Rating;
  kind: AttemptKind;
  /** The problem's topics. */
  topics: readonly TopicId[];
}

export type HeatLevel = 0 | 1 | 2 | 3 | 4;

export interface StatsDay {
  day: ParaDay;
  /** Different problems attempted that day, any rating. Two attempts on one problem count once. */
  count: number;
  /** 0 not fed, 1 one problem, 2 two, 3 three, 4 four or more. */
  level: HeatLevel;
  /** True for days after today in the current week: drawn as blanks. */
  future: boolean;
}

export interface StatsWeek {
  /** The Monday the week starts on. */
  start: ParaDay;
  /** Seven days, Monday first. */
  days: StatsDay[];
  /** Solves that week: attempts rated Hard, Good or Easy. */
  solves: number;
  /** True for the week that holds today. */
  current: boolean;
}

export interface StatsTopic {
  topic: TopicId;
  label: string;
  /** Different problems with this topic that the user has solved at least once (Hard, Good or Easy). */
  solved: number;
}

export interface Stats {
  range: StatsRange;
  totals: {
    /** Attempts rated Hard, Good or Easy, over all time. */
    solves: number;
    /** Attempts of kind 'review', any rating, over all time. */
    reviews: number;
    /** Different problems solved at least once, over all time. */
    problemsSolved: number;
    /** Days with at least one attempt, over all time. */
    fedDays: number;
  };
  /** Oldest week first; the last one is the current week. Length is STATS_RANGE_WEEKS[range]. */
  weeks: StatsWeek[];
  /** The largest `solves` of any week in the range (0 when there are none), for scaling bars. */
  maxWeekSolves: number;
  /** Every topic of the fixed list: most solved first, ties in the list's own order. Over all time. */
  topics: StatsTopic[];
}

function levelFor(count: number): HeatLevel {
  return count >= 4 ? 4 : (count as HeatLevel);
}

export function buildStats(input: { attempts: readonly StatsAttempt[]; today: ParaDay; range: StatsRange }): Stats {
  const { attempts, today, range } = input;
  const weekCount = STATS_RANGE_WEEKS[range];
  const currentStart = addDays(today, -weekdayIndex(today));
  const firstStart = addDays(currentStart, -7 * (weekCount - 1));

  const problemsByDay = new Map<ParaDay, Set<number>>();
  const solvesByWeek: number[] = new Array<number>(weekCount).fill(0);
  const solvedProblems = new Set<number>();
  const topicProblems = new Map<TopicId, Set<number>>();
  let solves = 0;
  let reviews = 0;

  for (const attempt of attempts) {
    let onDay = problemsByDay.get(attempt.day);
    if (!onDay) problemsByDay.set(attempt.day, (onDay = new Set()));
    onDay.add(attempt.problemId);
    if (attempt.kind === 'review') reviews += 1;
    if (!isGrowthSolve(attempt.rating)) continue;
    solves += 1;
    solvedProblems.add(attempt.problemId);
    for (const topic of attempt.topics) {
      let set = topicProblems.get(topic);
      if (!set) topicProblems.set(topic, (set = new Set()));
      set.add(attempt.problemId);
    }
    // Only solves inside the range, up to today, belong to a week's bar.
    if (attempt.day <= today && attempt.day >= firstStart) {
      const index = Math.floor(daysBetween(firstStart, attempt.day) / 7);
      solvesByWeek[index] = (solvesByWeek[index] ?? 0) + 1;
    }
  }

  const weeks: StatsWeek[] = [];
  for (let w = 0; w < weekCount; w += 1) {
    const start = addDays(firstStart, 7 * w);
    const days: StatsDay[] = [];
    for (let d = 0; d < 7; d += 1) {
      const day = addDays(start, d);
      const future = day > today;
      const count = future ? 0 : (problemsByDay.get(day)?.size ?? 0);
      days.push({ day, count, level: levelFor(count), future });
    }
    weeks.push({ start, days, solves: solvesByWeek[w] ?? 0, current: start === currentStart });
  }

  const topics: StatsTopic[] = TOPICS.map((topic) => ({
    topic: topic.id,
    label: topic.label,
    solved: topicProblems.get(topic.id)?.size ?? 0,
  }));
  // Array.prototype.sort is stable, so ties stay in the list's own order.
  topics.sort((a, b) => b.solved - a.solved);

  return {
    range,
    totals: { solves, reviews, problemsSolved: solvedProblems.size, fedDays: problemsByDay.size },
    weeks,
    maxWeekSolves: Math.max(0, ...solvesByWeek),
    topics,
  };
}
