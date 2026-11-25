// Filtering and sorting for the Problems table: plain functions over the rows from the bridge.
import type { LoggedProblemRow } from '../../../bridge/contract';
import type { TopicId } from '../../../core/topics';
import type { Platform } from '../../../core/types';
import { difficultyTone, problemTitle, type DifficultyTone } from '../../lib/format';

/** `due` and `active` do not overlap: active means in rotation but not due yet. */
export type StatusKey = 'due' | 'active' | 'retired';

export interface Filters {
  query: string;
  platforms: Platform[];
  topics: TopicId[];
  difficulties: DifficultyTone[];
  statuses: StatusKey[];
}

export const NO_FILTERS: Filters = { query: '', platforms: [], topics: [], difficulties: [], statuses: [] };

export function hasFilters(filters: Filters): boolean {
  return (
    filters.query.trim() !== '' ||
    filters.platforms.length + filters.topics.length + filters.difficulties.length + filters.statuses.length > 0
  );
}

export function statusOf(row: LoggedProblemRow): StatusKey | null {
  if (!row.card) return null;
  if (row.card.status === 'retired') return 'retired';
  return row.card.isDue ? 'due' : 'active';
}

/** AND across kinds, OR within a kind. The search matches the title and the platform's ID. */
export function filterRows(rows: LoggedProblemRow[], filters: Filters): LoggedProblemRow[] {
  const needle = filters.query.trim().toLowerCase();
  return rows.filter((row) => {
    const { problem } = row;
    if (needle !== '') {
      const haystack = [problem.title, problem.displayId ?? '', problem.platformId].join('\n').toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    if (filters.platforms.length > 0 && !filters.platforms.includes(problem.platform)) return false;
    if (filters.topics.length > 0 && !problem.topics.some((topic) => filters.topics.includes(topic))) return false;
    if (filters.difficulties.length > 0 && !filters.difficulties.includes(difficultyTone(problem.difficultyNorm))) {
      return false;
    }
    if (filters.statuses.length > 0) {
      const status = statusOf(row);
      if (!status || !filters.statuses.includes(status)) return false;
    }
    return true;
  });
}

export type SortKey = 'title' | 'platform' | 'difficulty' | 'last' | 'next' | 'attempts';
export interface Sort {
  key: SortKey;
  dir: 'asc' | 'desc';
}

/** Next review, soonest first: due cards, then upcoming ones, then retired and cardless problems. */
export const DEFAULT_SORT: Sort = { key: 'next', dir: 'asc' };

function nextRank(row: LoggedProblemRow): number {
  if (row.card?.status === 'active') return 0;
  return row.card ? 1 : 2;
}

function compare(a: LoggedProblemRow, b: LoggedProblemRow, key: SortKey): number {
  switch (key) {
    case 'title':
      return problemTitle(a.problem).localeCompare(problemTitle(b.problem), 'en', { numeric: true });
    case 'platform':
      return a.problem.platform.localeCompare(b.problem.platform);
    case 'difficulty':
      return (a.problem.difficultyNorm ?? 99) - (b.problem.difficultyNorm ?? 99);
    case 'last':
      return a.lastAttemptDay.localeCompare(b.lastAttemptDay);
    case 'attempts':
      return a.attemptCount - b.attemptCount;
    case 'next':
      return nextRank(a) - nextRank(b) || (a.card && b.card ? a.card.dueDay.localeCompare(b.card.dueDay) : 0);
  }
}

export function sortRows(rows: LoggedProblemRow[], sort: Sort): LoggedProblemRow[] {
  const sign = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort(
    (a, b) =>
      sign * compare(a, b, sort.key) ||
      // Ties keep a stable, useful order whichever way the column is sorted.
      b.lastAttemptAt.localeCompare(a.lastAttemptAt) ||
      a.problem.id - b.problem.id,
  );
}
