// The Stats screen's numbers through the services: real attempts in a real database, the streaks
// from the pet facts, and days counted as ParaLeet days.
import { afterEach, describe, expect, it } from 'vitest';
import { inputSchemas, type StatsView } from '../../bridge/contract';
import { STATS_RANGE_WEEKS } from '../../core/stats';
import { TOPICS } from '../../core/topics';
import { getProblem, listStarterQueue } from '../../data/repos/problems';
import { createTestApp, noonLA, type TestApp } from './testing';

let app: TestApp;
afterEach(() => app?.close());

type Rated = 'again' | 'hard' | 'good' | 'easy';

const report = (problemId: number, rating: Rated = 'good') =>
  app.handlers.submitReport({ problemId, rating, minutes: null, keyInsight: null, notes: null, insightRevealed: false });

function dayOf(stats: StatsView, day: string) {
  const found = stats.weeks.flatMap((week) => week.days).find((each) => each.day === day);
  if (!found) throw new Error(`day ${day} is not in the range`);
  return found;
}

describe('the getStats input', () => {
  it('accepts only the three ranges', () => {
    expect(inputSchemas.getStats.safeParse({ range: '6m' }).success).toBe(true);
    expect(inputSchemas.getStats.safeParse({ range: '2y' }).success).toBe(false);
    expect(inputSchemas.getStats.safeParse(undefined).success).toBe(false);
  });
});

describe('getStats', () => {
  it('is all zeros before anything is logged, for every range', async () => {
    app = createTestApp();
    for (const range of ['12w', '6m', '1y'] as const) {
      const stats = await app.handlers.getStats({ range });
      expect(stats.range).toBe(range);
      expect(stats.weeks).toHaveLength(STATS_RANGE_WEEKS[range]);
      expect(stats.today).toBe('2026-11-25');
      expect(stats.streak).toEqual({ current: 0, longest: 0 });
      expect(stats.totals).toEqual({ solves: 0, reviews: 0, problemsSolved: 0, fedDays: 0 });
      expect(stats.maxWeekSolves).toBe(0);
      expect(stats.weeks.every((week) => week.solves === 0 && week.days.every((day) => day.count === 0))).toBe(true);
      expect(stats.topics).toHaveLength(TOPICS.length);
      expect(stats.topics.every((topic) => topic.solved === 0)).toBe(true);
    }
  });

  it('counts what was reported: days, solves, reviews, topics and the streak', async () => {
    // 2026-11-23 is a Monday.
    app = createTestApp({ now: noonLA('2026-11-23') });
    const [a, b, c] = listStarterQueue(app.db) as [number, number, number];
    await report(a, 'good');
    app.clock.set(noonLA('2026-11-24'));
    await report(b, 'again');
    await report(b, 'good');
    await report(c, 'hard');
    app.clock.set(noonLA('2026-11-25'));
    await report(a, 'easy');

    const stats = await app.handlers.getStats({ range: '12w' });
    expect(stats.today).toBe('2026-11-25');
    expect(stats.streak).toEqual({ current: 3, longest: 3 });
    // Solves are the attempts not rated Again; a second attempt on a problem is a review.
    expect(stats.totals).toEqual({ solves: 4, reviews: 2, problemsSolved: 3, fedDays: 3 });

    const week = stats.weeks.at(-1)!;
    expect(week).toMatchObject({ start: '2026-11-23', current: true, solves: 4 });
    // Tuesday had three attempts on two problems.
    expect(week.days.map((day) => day.count)).toEqual([1, 2, 1, 0, 0, 0, 0]);
    expect(week.days.map((day) => day.future)).toEqual([false, false, false, true, true, true, true]);
    expect(stats.maxWeekSolves).toBe(4);

    // Each topic counts the different problems solved in it, most first.
    const expected = new Map<string, number>();
    for (const id of [a, b, c]) {
      for (const topic of getProblem(app.db, id)!.topics) expected.set(topic, (expected.get(topic) ?? 0) + 1);
    }
    expect(expected.size).toBeGreaterThan(0);
    for (const topic of stats.topics) expect(topic.solved).toBe(expected.get(topic.topic) ?? 0);
    const counts = stats.topics.map((topic) => topic.solved);
    expect(counts).toEqual([...counts].sort((x, y) => y - x));
  });

  it('shows a streak of 0 after a missed day and keeps the longest', async () => {
    app = createTestApp({ now: noonLA('2026-11-23') });
    const [a, b] = listStarterQueue(app.db) as [number, number];
    await report(a);
    app.clock.set(noonLA('2026-11-24'));
    await report(b);
    // Nothing on the 25th and 26th.
    app.clock.set(noonLA('2026-11-27'));
    const stats = await app.handlers.getStats({ range: '6m' });
    expect(stats.today).toBe('2026-11-27');
    expect(stats.streak).toEqual({ current: 0, longest: 2 });
    expect(dayOf(stats, '2026-11-25')).toMatchObject({ count: 0, level: 0, future: false });
    expect(dayOf(stats, '2026-11-24')).toMatchObject({ count: 1, level: 1 });
  });

  it('counts a solve after midnight for the ParaLeet day it belongs to', async () => {
    app = createTestApp({ now: noonLA('2026-11-24') });
    const [a] = listStarterQueue(app.db) as [number];
    // 01:00 in Los Angeles on the 26th is still the 25th: the day starts at 04:00.
    app.clock.set('2026-11-26T09:00:00.000Z');
    await report(a);
    const stats = await app.handlers.getStats({ range: '12w' });
    expect(stats.today).toBe('2026-11-25');
    expect(dayOf(stats, '2026-11-25')).toMatchObject({ count: 1, future: false });
    expect(dayOf(stats, '2026-11-26')).toMatchObject({ count: 0, future: true });
    expect(stats.streak.current).toBe(1);
  });
});
