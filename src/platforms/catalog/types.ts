// What a catalog transform returns. Entries have exactly the fields of a catalog seed problem
// (src/data/seedFormat.ts), so the data layer can validate them without a conversion.
import type { TopicId } from '../../core/topics';
import type { DifficultyNorm, Platform } from '../../core/types';

export interface CatalogEntry {
  platform: Platform;
  platformId: string;
  displayId: string | null;
  title: string;
  url: string;
  difficultyRaw: string | null;
  difficultyNorm: DifficultyNorm | null;
  topics: TopicId[];
  sourceTags: string[];
  solvedCount: number | null;
}

export interface SkippedProblem {
  /** Whatever identifies the listing row: an ID, a slug or a title. */
  what: string;
  reason: string;
}

export interface CatalogTransform {
  /** Rows in the fetched listing, before any were skipped. */
  fetched: number;
  entries: CatalogEntry[];
  skipped: SkippedProblem[];
}

/** Titles come from web pages and APIs; collapse runs of white space and trim. */
export function cleanTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim();
}
