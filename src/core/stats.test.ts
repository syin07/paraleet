import { describe, expect, it } from 'vitest';
import { addDays, weekdayIndex } from './day';
import { buildStats, STATS_RANGES, STATS_RANGE_WEEKS, type StatsAttempt, type StatsRange } from './stats';
import { TOPICS } from './topics';
import type { ParaDay, Rating } from './types';

// 2026-11-25 is a Wednesday.
const TODAY: ParaDay = '2026-11-25';

let nextId = 1;
function attempt(day: ParaDay, rating: Rating = 'good', extra: Partial<StatsAttempt> = {}): StatsAttempt {
  return { problemId: nextId++, day, rating, kind: 'first_solve', topics: [], ...extra };
}

function build(attempts: StatsAttempt[], today = TODAY, range: StatsRange = '12w') {
  return buildStats({ attempts, today, range });
}

function dayOf(stats: ReturnType<typeof build>, day: ParaDay) {
  for (const week of stats.weeks) {
    const found = week.days.find((d) => d.day === day);
    if (found) return found;
  }
  throw new Error(`day ${day} not in range`);
}

describe('weeks layout', () => {
  it.each(STATS_RANGES)('range %s: right length, Mondays, seven ordered days, last is current', (range) => {
    const stats = build([], TODAY, range);
    expect(stats.range).toBe(range);
    expect(stats.weeks).toHaveLength(STATS_RANGE_WEEKS[range]);
    stats.weeks.forEach((week, i) => {
      expect(weekdayIndex(week.start)).toBe(0);
      expect(week.days.map((d) => d.day)).toEqual([0, 1, 2, 3, 4, 5, 6].map((n) => addDays(week.start, n)));
      if (i > 0) expect(week.start).toBe(addDays(stats.weeks[i - 1]!.start, 7));
      expect(week.current).toBe(i === stats.weeks.length - 1);
    });
    expect(stats.weeks.at(-1)!.days.map((d) => d.day)).toContain(TODAY);
  });

  it('today on a Monday: the current week has six future days', () => {
    const stats = build([], '2026-11-23');
    const last = stats.weeks.at(-1)!;
    expect(last.start).toBe('2026-11-23');
    expect(last.days.map((d) => d.future)).toEqual([false, true, true, true, true, true, true]);
  });

  it('today on a Sunday: the current week has no future days', () => {
    const stats = build([], '2026-11-29');
    const last = stats.weeks.at(-1)!;
    expect(last.start).toBe('2026-11-23');
    expect(last.days.every((d) => !d.future)).toBe(true);
  });

  it('across a year change and a range start in the previous year', () => {
    // 2027-01-01 is a Friday; its week starts Monday 2026-12-28.
    const stats = build([attempt('2026-12-31'), attempt('2027-01-01')], '2027-01-01');
    const last = stats.weeks.at(-1)!;
    expect(last.start).toBe('2026-12-28');
    expect(last.days.map((d) => d.day).slice(3, 5)).toEqual(['2026-12-31', '2027-01-01']);
    expect(last.solves).toBe(2);
    expect(stats.weeks[0]!.start).toBe('2026-10-12');
    const year = build([attempt('2026-01-05')], '2027-01-01', '1y');
    expect(year.weeks[0]!.start < '2026-01-01').toBe(true);
    expect(dayOf(year, '2026-01-05').count).toBe(1);
  });
});

describe('day counts and levels', () => {
  it.each([
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 3],
    [4, 4],
    [5, 4],
    [9, 4],
  ])('%i attempts give level %i', (n, level) => {
    const attempts = Array.from({ length: n }, () => attempt('2026-11-24'));
    const day = dayOf(build(attempts), '2026-11-24');
    expect(day.count).toBe(n);
    expect(day.level).toBe(level);
  });

  it('an again attempt counts for the day but is not a solve', () => {
    const stats = build([attempt('2026-11-24', 'again')]);
    expect(dayOf(stats, '2026-11-24')).toMatchObject({ count: 1, level: 1 });
    expect(stats.weeks.at(-1)!.solves).toBe(0);
    expect(stats.totals.fedDays).toBe(1);
  });
});

describe('future days', () => {
  it('days after today are future with count 0, even with an attempt on them', () => {
    const stats = build([attempt('2026-11-27'), attempt('2026-11-25')]);
    const last = stats.weeks.at(-1)!;
    expect(last.days.map((d) => d.future)).toEqual([false, false, false, true, true, true, true]);
    expect(dayOf(stats, '2026-11-27')).toMatchObject({ count: 0, level: 0, future: true });
    expect(dayOf(stats, '2026-11-25')).toMatchObject({ count: 1, future: false });
    // Counted in the all-time totals, not in the week's bar.
    expect(stats.totals.solves).toBe(2);
    expect(stats.totals.fedDays).toBe(2);
    expect(last.solves).toBe(1);
  });

  it('attempts dated beyond the current week do not appear in weeks', () => {
    const stats = build([attempt('2026-12-20')]);
    expect(stats.weeks.reduce((s, w) => s + w.solves, 0)).toBe(0);
    expect(stats.totals.solves).toBe(1);
  });
});

describe('solves per week', () => {
  it('counts only hard, good and easy; maxWeekSolves matches', () => {
    const stats = build([
      attempt('2026-11-24', 'hard'),
      attempt('2026-11-24', 'good'),
      attempt('2026-11-25', 'easy'),
      attempt('2026-11-25', 'again'),
      attempt('2026-11-17', 'good'),
    ]);
    expect(stats.weeks.at(-1)!.solves).toBe(3);
    expect(stats.weeks.at(-2)!.solves).toBe(1);
    expect(stats.maxWeekSolves).toBe(3);
  });

  it('empty history gives zeros', () => {
    const stats = build([]);
    expect(stats.maxWeekSolves).toBe(0);
    expect(stats.totals).toEqual({ solves: 0, reviews: 0, problemsSolved: 0, fedDays: 0 });
    expect(stats.weeks.every((w) => w.solves === 0 && w.days.every((d) => d.count === 0 && d.level === 0))).toBe(true);
    expect(stats.topics.every((t) => t.solved === 0)).toBe(true);
  });

  it('attempts older than the range count in totals and topics, not in weeks', () => {
    const stats = build([attempt('2025-01-01', 'good', { topics: ['math'] })]);
    expect(stats.totals.solves).toBe(1);
    expect(stats.maxWeekSolves).toBe(0);
    expect(stats.topics.find((t) => t.topic === 'math')!.solved).toBe(1);
  });

  it('maxWeekSolves ignores weeks outside the range', () => {
    const old = Array.from({ length: 10 }, () => attempt('2025-01-01'));
    expect(build([...old, attempt('2026-11-25')]).maxWeekSolves).toBe(1);
  });
});

describe('week edges', () => {
  it('puts a solve on a Sunday and on a Monday in the right week', () => {
    // Weeks before the current one: Mon 2026-11-16 to Sun 2026-11-22, and Mon 11-09 to Sun 11-15.
    const stats = build([attempt('2026-11-22'), attempt('2026-11-16'), attempt('2026-11-15')]);
    expect(stats.weeks.at(-1)!.solves).toBe(0);
    expect(stats.weeks.at(-2)!.start).toBe('2026-11-16');
    expect(stats.weeks.at(-2)!.solves).toBe(2);
    expect(stats.weeks.at(-3)!.solves).toBe(1);
    expect(dayOf(stats, '2026-11-22').count).toBe(1);
    expect(dayOf(stats, '2026-11-16').count).toBe(1);
    expect(dayOf(stats, '2026-11-15').count).toBe(1);
  });

  it('keeps February 29 in its place in a leap year', () => {
    // 2028-02-29 is a Tuesday; today is the Friday after it.
    const stats = build([attempt('2028-02-29'), attempt('2028-02-29', 'again'), attempt('2028-03-01')], '2028-03-03');
    const week = stats.weeks.at(-1)!;
    expect(week.start).toBe('2028-02-28');
    expect(week.days.map((d) => d.day)).toEqual([
      '2028-02-28', '2028-02-29', '2028-03-01', '2028-03-02', '2028-03-03', '2028-03-04', '2028-03-05',
    ]);
    expect(week.days.map((d) => d.count)).toEqual([0, 2, 1, 0, 0, 0, 0]);
    expect(week.days.map((d) => d.future)).toEqual([false, false, false, false, false, true, true]);
    expect(week.solves).toBe(2);
    stats.weeks.forEach((each, i) => {
      if (i > 0) expect(each.start).toBe(addDays(stats.weeks[i - 1]!.start, 7));
    });
    // The year before has no such day: the same week of 2027 runs straight from February into March.
    const plain = build([], '2027-03-03');
    expect(plain.weeks.at(-1)!.days.map((d) => d.day)).toEqual([
      '2027-03-01', '2027-03-02', '2027-03-03', '2027-03-04', '2027-03-05', '2027-03-06', '2027-03-07',
    ]);
    expect(plain.weeks.at(-2)!.days.map((d) => d.day).slice(-2)).toEqual(['2027-02-27', '2027-02-28']);
  });
});

describe('totals', () => {
  it('counts solves, reviews, distinct problems and fed days', () => {
    const stats = build([
      { problemId: 1, day: '2026-11-20', rating: 'good', kind: 'first_solve', topics: [] },
      { problemId: 1, day: '2026-11-21', rating: 'again', kind: 'review', topics: [] },
      { problemId: 1, day: '2026-11-22', rating: 'easy', kind: 'review', topics: [] },
      { problemId: 2, day: '2026-11-22', rating: 'again', kind: 'first_solve', topics: [] },
      { problemId: 3, day: '2026-11-23', rating: 'hard', kind: 'first_solve', topics: [] },
    ]);
    expect(stats.totals).toEqual({ solves: 3, reviews: 2, problemsSolved: 2, fedDays: 4 });
  });
});

describe('topics', () => {
  it('lists every topic once, counts a two-topic problem in both and a repeated problem once', () => {
    const stats = build([
      { problemId: 1, day: '2026-11-20', rating: 'good', kind: 'first_solve', topics: ['math', 'greedy'] },
      ...Array.from({ length: 5 }, (_, i) => ({
        problemId: 2,
        day: addDays('2026-11-10', i),
        rating: 'good' as Rating,
        kind: 'review' as const,
        topics: ['math'] as const,
      })),
      { problemId: 3, day: '2026-11-20', rating: 'again', kind: 'first_solve', topics: ['trees'] },
    ]);
    expect(stats.topics).toHaveLength(TOPICS.length);
    expect(new Set(stats.topics.map((t) => t.topic)).size).toBe(TOPICS.length);
    const by = Object.fromEntries(stats.topics.map((t) => [t.topic, t]));
    expect(by.math).toMatchObject({ solved: 2, label: 'Math' });
    expect(by.greedy!.solved).toBe(1);
    expect(by.trees!.solved).toBe(0);
  });

  it('orders by solved descending, ties in TOPICS order', () => {
    const stats = build([
      attempt('2026-11-20', 'good', { topics: ['math'] }),
      attempt('2026-11-20', 'good', { topics: ['trees'] }),
      attempt('2026-11-20', 'good', { topics: ['trees'] }),
      attempt('2026-11-20', 'good', { topics: ['stacks'] }),
    ]);
    const order = stats.topics.map((t) => t.topic);
    expect(order.slice(0, 3)).toEqual(['trees', 'stacks', 'math']);
    const rest = TOPICS.map((t) => t.id).filter((id) => !['trees', 'stacks', 'math'].includes(id));
    expect(order.slice(3)).toEqual(rest);
  });
});

describe('purity', () => {
  it('gives the same output twice and leaves the input alone', () => {
    const attempts = [attempt('2026-11-24', 'hard', { topics: ['math'] }), attempt('2026-11-20', 'again')];
    const copy = structuredClone(attempts);
    const first = build(attempts);
    const second = build(attempts);
    expect(second).toEqual(first);
    expect(attempts).toEqual(copy);
  });
});
