// Turns the question list from LeetCode's GraphQL endpoint into catalog entries. Pure.
// The list carries no statement text and the script never asks for any.
import { z } from 'zod';
import { leetcodeAdapter } from '../leetcode';
import { cleanTitle, type CatalogEntry, type CatalogTransform, type SkippedProblem } from './types';

const questionSchema = z.object({
  questionFrontendId: z.string(),
  title: z.string(),
  titleSlug: z.string(),
  difficulty: z.string(),
  isPaidOnly: z.boolean(),
  topicTags: z.array(z.object({ name: z.string() })),
  // A JSON string such as {"totalAcceptedRaw": 24211566, ...}.
  stats: z.string().nullish(),
});

function acceptedCount(stats: string | null | undefined): number | null {
  if (!stats) return null;
  try {
    const parsed = z.object({ totalAcceptedRaw: z.number().int().min(0) }).safeParse(JSON.parse(stats));
    return parsed.success ? parsed.data.totalAcceptedRaw : null;
  } catch {
    return null;
  }
}

/** By the number LeetCode shows, then by slug so ties still have one place. */
export function compareLeetcode(
  a: { displayId: string | null; platformId: string },
  b: { displayId: string | null; platformId: string },
): number {
  return (
    Number(a.displayId) - Number(b.displayId) ||
    (a.platformId < b.platformId ? -1 : a.platformId > b.platformId ? 1 : 0)
  );
}

/** `listing` is the list of question objects from all pages, in any order. */
export function transformLeetcode(listing: unknown): CatalogTransform {
  const rows = z.array(z.unknown()).parse(listing);
  const skipped: SkippedProblem[] = [];
  const seen = new Set<string>();
  const entries: CatalogEntry[] = [];
  for (const raw of rows) {
    const parsed = questionSchema.safeParse(raw);
    if (!parsed.success) {
      skipped.push({ what: JSON.stringify(raw).slice(0, 60), reason: 'unreadable row' });
      continue;
    }
    const question = parsed.data;
    const slug = question.titleSlug;
    if (question.isPaidOnly) skipped.push({ what: slug, reason: 'paid-only' });
    else if (!leetcodeAdapter.isValidId(slug)) skipped.push({ what: slug, reason: 'malformed slug' });
    else if (!/^[1-9]\d*$/.test(question.questionFrontendId)) skipped.push({ what: slug, reason: 'malformed number' });
    else if (leetcodeAdapter.normalizeDifficulty(question.difficulty) === null) {
      skipped.push({ what: slug, reason: `unknown difficulty "${question.difficulty}"` });
    } else if (seen.has(slug)) skipped.push({ what: slug, reason: 'duplicate' });
    else {
      seen.add(slug);
      const sourceTags = question.topicTags.map((tag) => tag.name);
      entries.push({
        platform: 'leetcode',
        platformId: slug,
        displayId: question.questionFrontendId,
        title: cleanTitle(question.title),
        url: leetcodeAdapter.buildUrl(slug),
        difficultyRaw: question.difficulty,
        difficultyNorm: leetcodeAdapter.normalizeDifficulty(question.difficulty),
        topics: leetcodeAdapter.mapTags(sourceTags),
        sourceTags,
        solvedCount: acceptedCount(question.stats),
      });
    }
  }
  entries.sort(compareLeetcode);
  return { fetched: rows.length, entries, skipped };
}
