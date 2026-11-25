// Turns the question list from LeetCode's GraphQL endpoint into catalog entries. Pure.
// The list carries no statement text and the script never asks for any.
import { leetcodeAdapter } from '../leetcode';
import {
  cleanTitle,
  describeRow,
  isRecord,
  type CatalogEntry,
  type CatalogTransform,
  type SkippedProblem,
} from './types';

interface Question {
  questionFrontendId: string;
  title: string;
  titleSlug: string;
  difficulty: string;
  isPaidOnly: boolean;
  tags: string[];
  stats: unknown;
}

function readQuestion(raw: unknown): Question | null {
  if (!isRecord(raw)) return null;
  const { questionFrontendId, title, titleSlug, difficulty, isPaidOnly, topicTags, stats } = raw;
  if (typeof questionFrontendId !== 'string' || typeof title !== 'string' || typeof titleSlug !== 'string') return null;
  if (typeof difficulty !== 'string' || typeof isPaidOnly !== 'boolean' || !Array.isArray(topicTags)) return null;
  const tags: string[] = [];
  for (const tag of topicTags as unknown[]) {
    if (!isRecord(tag) || typeof tag.name !== 'string') return null;
    tags.push(tag.name);
  }
  return { questionFrontendId, title, titleSlug, difficulty, isPaidOnly, tags, stats };
}

/** `stats` is a JSON string such as {"totalAcceptedRaw": 24211566, ...}. */
function acceptedCount(stats: unknown): number | null {
  if (typeof stats !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(stats);
    const accepted = isRecord(parsed) ? parsed.totalAcceptedRaw : undefined;
    return typeof accepted === 'number' && Number.isInteger(accepted) && accepted >= 0 ? accepted : null;
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
  if (!Array.isArray(listing)) throw new Error('LeetCode did not send a question list');
  const rows = listing as unknown[];
  const skipped: SkippedProblem[] = [];
  const seen = new Set<string>();
  const entries: CatalogEntry[] = [];
  for (const raw of rows) {
    const question = readQuestion(raw);
    if (!question) {
      skipped.push({ what: describeRow(raw), reason: 'unreadable row' });
      continue;
    }
    const slug = question.titleSlug;
    if (question.isPaidOnly) skipped.push({ what: slug, reason: 'paid-only' });
    else if (!leetcodeAdapter.isValidId(slug)) skipped.push({ what: slug, reason: 'malformed slug' });
    else if (!/^[1-9]\d*$/.test(question.questionFrontendId)) skipped.push({ what: slug, reason: 'malformed number' });
    else if (leetcodeAdapter.normalizeDifficulty(question.difficulty) === null) {
      skipped.push({ what: slug, reason: `unknown difficulty "${question.difficulty}"` });
    } else if (seen.has(slug)) skipped.push({ what: slug, reason: 'duplicate' });
    else {
      seen.add(slug);
      entries.push({
        platform: 'leetcode',
        platformId: slug,
        displayId: question.questionFrontendId,
        title: cleanTitle(question.title),
        url: leetcodeAdapter.buildUrl(slug),
        difficultyRaw: question.difficulty,
        difficultyNorm: leetcodeAdapter.normalizeDifficulty(question.difficulty),
        topics: leetcodeAdapter.mapTags(question.tags),
        sourceTags: question.tags,
        solvedCount: acceptedCount(question.stats),
      });
    }
  }
  entries.sort(compareLeetcode);
  return { fetched: rows.length, entries, skipped };
}
