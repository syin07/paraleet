// Turns the response of https://codeforces.com/api/problemset.problems into catalog entries.
// Pure: no network, no clock. The app will reuse this to refresh its catalog on demand.
import { z } from 'zod';
import { codeforcesAdapter } from '../codeforces';
import { cleanTitle, type CatalogEntry, type CatalogTransform, type SkippedProblem } from './types';

const problemSchema = z.object({
  contestId: z.number().int(),
  index: z.string(),
  name: z.string(),
  type: z.string(),
  rating: z.number().int().optional(),
  tags: z.array(z.string()).default([]),
});
const statisticSchema = z.object({ contestId: z.number().int(), index: z.string(), solvedCount: z.number().int() });
const responseSchema = z.object({
  status: z.literal('OK'),
  result: z.object({ problems: z.array(z.unknown()), problemStatistics: z.array(z.unknown()) }),
});

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

export function transformCodeforces(listing: unknown, minSolved: number = CODEFORCES_MIN_SOLVED): CatalogTransform {
  const { result } = responseSchema.parse(listing);
  const solved = new Map<string, number>();
  for (const raw of result.problemStatistics) {
    const stat = statisticSchema.safeParse(raw);
    if (stat.success) solved.set(`${stat.data.contestId}${stat.data.index}`, stat.data.solvedCount);
  }

  const skipped: SkippedProblem[] = [];
  const seen = new Set<string>();
  const entries: CatalogEntry[] = [];
  for (const raw of result.problems) {
    const parsed = problemSchema.safeParse(raw);
    if (!parsed.success) {
      skipped.push({ what: JSON.stringify(raw).slice(0, 60), reason: 'unreadable row' });
      continue;
    }
    const problem = parsed.data;
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
