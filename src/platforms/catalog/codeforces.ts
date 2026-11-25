// Turns the response of https://codeforces.com/api/problemset.problems into catalog entries.
// Pure: no network, no clock. The app will reuse this to refresh its catalog on demand.
import { codeforcesAdapter } from '../codeforces';
import {
  cleanTitle,
  describeRow,
  isRecord,
  type CatalogEntry,
  type CatalogTransform,
  type SkippedProblem,
} from './types';

/**
 * Only problems solved at least this many times are kept: the well-known ones. Chosen on
 * 2026-11-25, when it left 3,905 of 11,194 rated problems (the target is 3,000 to 4,500).
 * Solved counts only grow, so the count drifts up over time; the script checks the window.
 */
export const CODEFORCES_MIN_SOLVED = 9000;
export const CODEFORCES_WINDOW = { min: 3000, max: 4500 } as const;

/** Contest first (numeric), then index (A, A1, A2, B ...). */
export function compareCodeforces(a: { platformId: string }, b: { platformId: string }): number {
  const [, contestA = '', indexA = ''] = /^(\d+)(.*)$/.exec(a.platformId) ?? [];
  const [, contestB = '', indexB = ''] = /^(\d+)(.*)$/.exec(b.platformId) ?? [];
  return Number(contestA) - Number(contestB) || (indexA < indexB ? -1 : indexA > indexB ? 1 : 0);
}

interface ListedProblem {
  contestId: number;
  index: string;
  name: string;
  type: string;
  rating: number | undefined;
  tags: string[];
}

function readProblem(raw: unknown): ListedProblem | null {
  if (!isRecord(raw)) return null;
  const { contestId, index, name, type, rating, tags } = raw;
  if (typeof contestId !== 'number' || !Number.isInteger(contestId)) return null;
  if (typeof index !== 'string' || typeof name !== 'string' || typeof type !== 'string') return null;
  const tagList = tags === undefined ? [] : tags;
  if (!Array.isArray(tagList) || !tagList.every((tag) => typeof tag === 'string')) return null;
  return {
    contestId,
    index,
    name,
    type,
    rating: typeof rating === 'number' && Number.isInteger(rating) ? rating : undefined,
    tags: tagList as string[],
  };
}

function readSolvedCounts(statistics: unknown[]): Map<string, number> {
  const solved = new Map<string, number>();
  for (const raw of statistics) {
    if (!isRecord(raw)) continue;
    const { contestId, index, solvedCount } = raw;
    if (typeof contestId === 'number' && typeof index === 'string' && typeof solvedCount === 'number' && solvedCount >= 0) {
      solved.set(`${contestId}${index}`, Math.floor(solvedCount));
    }
  }
  return solved;
}

export function transformCodeforces(listing: unknown, minSolved: number = CODEFORCES_MIN_SOLVED): CatalogTransform {
  const result = isRecord(listing) && listing.status === 'OK' ? listing.result : undefined;
  if (!isRecord(result) || !Array.isArray(result.problems) || !Array.isArray(result.problemStatistics)) {
    throw new Error('Codeforces did not send a problem list (expected status "OK" with problems and problemStatistics)');
  }
  const solved = readSolvedCounts(result.problemStatistics);

  const skipped: SkippedProblem[] = [];
  const seen = new Set<string>();
  const entries: CatalogEntry[] = [];
  for (const raw of result.problems as unknown[]) {
    const problem = readProblem(raw);
    if (!problem) {
      skipped.push({ what: describeRow(raw), reason: 'unreadable row' });
      continue;
    }
    const platformId = `${problem.contestId}${problem.index}`;
    if (problem.type !== 'PROGRAMMING') skipped.push({ what: platformId, reason: 'not a programming problem' });
    else if (problem.rating === undefined) skipped.push({ what: platformId, reason: 'no rating' });
    else if (!codeforcesAdapter.isValidId(platformId)) skipped.push({ what: platformId, reason: 'malformed ID' });
    else if (seen.has(platformId)) skipped.push({ what: platformId, reason: 'duplicate' });
    else if ((solved.get(platformId) ?? 0) < minSolved) {
      skipped.push({ what: platformId, reason: 'below the solved-count floor' });
    } else {
      seen.add(platformId);
      entries.push({
        platform: 'codeforces',
        platformId,
        displayId: platformId,
        title: cleanTitle(problem.name),
        url: codeforcesAdapter.buildUrl(platformId),
        difficultyRaw: String(problem.rating),
        difficultyNorm: codeforcesAdapter.normalizeDifficulty(String(problem.rating)),
        topics: codeforcesAdapter.mapTags(problem.tags),
        sourceTags: problem.tags,
        solvedCount: solved.get(platformId) ?? null,
      });
    }
  }
  entries.sort(compareCodeforces);
  return { fetched: result.problems.length, entries, skipped };
}
