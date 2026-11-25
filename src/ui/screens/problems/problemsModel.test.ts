import { describe, expect, it } from 'vitest';
import type { LoggedProblemRow } from '../../../bridge/contract';
import type { TopicId } from '../../../core/topics';
import type { DifficultyNorm, Platform } from '../../../core/types';
import { DEFAULT_SORT, filterRows, NO_FILTERS, sortRows, type Filters } from './problemsModel';

interface Extra {
  platform?: Platform;
  norm?: DifficultyNorm | null;
  topics?: TopicId[];
  title?: string;
  attemptCount?: number;
  card?: LoggedProblemRow['card'];
}

function row(id: number, extra: Extra = {}): LoggedProblemRow {
  return {
    problem: {
      id,
      platform: extra.platform ?? 'leetcode',
      platformId: `p${id}`,
      displayId: null,
      title: extra.title ?? `Problem ${id}`,
      url: 'https://example.com',
      difficultyRaw: extra.norm ? 'x' : null,
      difficultyNorm: extra.norm ?? null,
      topics: extra.topics ?? [],
    },
    attemptCount: extra.attemptCount ?? 1,
    lastAttemptAt: `2026-11-${10 + id}T10:00:00.000Z`,
    lastAttemptDay: `2026-11-${10 + id}`,
    lastRating: 'good',
    card: extra.card ?? null,
  };
}

const ids = (rows: LoggedProblemRow[]): number[] => rows.map((r) => r.problem.id);

describe('filterRows', () => {
  const rows = [
    row(1, { title: 'Two Sum', norm: 1, topics: ['arrays-hashing'] }),
    row(2, { title: 'Watermelon', platform: 'codeforces', norm: 1, topics: ['math'] }),
    row(3, { title: 'Hard One', norm: 5, topics: ['math', 'greedy'] }),
    row(4, { title: 'Unrated', platform: 'cses' }),
  ];
  const run = (filters: Partial<Filters>): number[] => ids(filterRows(rows, { ...NO_FILTERS, ...filters }));

  it('combines kinds with AND and values within a kind with OR', () => {
    expect(run({ platforms: ['leetcode', 'cses'] })).toEqual([1, 3, 4]);
    expect(run({ topics: ['math'] })).toEqual([2, 3]);
    expect(run({ topics: ['math'], difficulties: ['easy'] })).toEqual([2]);
    expect(run({ difficulties: ['none'] })).toEqual([4]);
    expect(run({ query: ' sum ' })).toEqual([1]);
  });

  it('keeps due, active and retired apart', () => {
    const cards = [
      row(1, { card: { status: 'active', dueDay: '2026-11-25', isDue: true } }),
      row(2, { card: { status: 'active', dueDay: '2026-11-30', isDue: false } }),
      row(3, { card: { status: 'retired', dueDay: '2026-11-30', isDue: false } }),
      row(4),
    ];
    const byStatus = (statuses: Filters['statuses']): number[] => ids(filterRows(cards, { ...NO_FILTERS, statuses }));
    expect(byStatus(['due'])).toEqual([1]);
    expect(byStatus(['active'])).toEqual([2]);
    expect(byStatus(['retired'])).toEqual([3]);
  });
});

describe('sortRows', () => {
  it('puts due first, then upcoming, then retired and cardless problems', () => {
    const rows = [
      row(1),
      row(2, { card: { status: 'retired', dueDay: '2026-11-01', isDue: false } }),
      row(3, { card: { status: 'active', dueDay: '2026-12-02', isDue: false } }),
      row(4, { card: { status: 'active', dueDay: '2026-11-20', isDue: true } }),
    ];
    expect(ids(sortRows(rows, DEFAULT_SORT))).toEqual([4, 3, 2, 1]);
  });

  it('sorts by attempts both ways and breaks ties by most recent attempt', () => {
    const rows = [row(1, { attemptCount: 2 }), row(2, { attemptCount: 5 }), row(3, { attemptCount: 2 })];
    expect(ids(sortRows(rows, { key: 'attempts', dir: 'asc' }))).toEqual([3, 1, 2]);
    expect(ids(sortRows(rows, { key: 'attempts', dir: 'desc' }))).toEqual([2, 3, 1]);
  });
});
