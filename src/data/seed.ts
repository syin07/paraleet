import { z } from 'zod';
import type { TopicId } from '../core/topics';
import type { IsoInstant } from '../core/types';
import type { Db } from './db';
import { getCatalogSource, recordCatalogSource } from './repos/catalogSources';
import {
  fillMissingCatalogFields,
  getProblemByPlatformId,
  insertCatalogProblem,
  insertProblem,
  listStarterProblems,
  loadCatalogRows,
  setStarterPosition,
  updateCatalogProblem,
  updateSeedProblem,
  type NewProblem,
} from './repos/problems';
import {
  CATALOG_PLATFORMS,
  catalogSeedSchema,
  starterSeedSchema,
  validateSeedProblems,
  type CatalogPlatform,
  type SeedProblem,
} from './seedFormat';

function toNewProblem(seed: SeedProblem, starterPosition: number | null): NewProblem {
  return {
    platform: seed.platform,
    platformId: seed.platformId,
    displayId: seed.displayId,
    title: seed.title,
    url: seed.url,
    difficultyRaw: seed.difficultyRaw,
    difficultyNorm: seed.difficultyNorm,
    topics: seed.topics as TopicId[],
    sourceTags: seed.sourceTags,
    origin: 'seed',
    starterPosition,
  };
}

/**
 * Loads the built-in starter list. Safe to run on every launch: existing problems keep their
 * row (and so their attempts and notes), and a problem the user added by hand is only given its
 * starter position, never overwritten.
 */
export function loadStarterSeed(db: Db, rawSeed: unknown, now: IsoInstant): { loaded: number } {
  const seed = starterSeedSchema.parse(rawSeed);
  const errors = validateSeedProblems(seed.problems);
  if (errors.length > 0) throw new Error(`The starter seed is invalid:\n${errors.join('\n')}`);

  db.transaction(() => {
    const stillListed = new Set<number>();
    seed.problems.forEach((seedProblem, position) => {
      const existing = getProblemByPlatformId(db, seedProblem.platform, seedProblem.platformId);
      if (!existing) {
        stillListed.add(insertProblem(db, toNewProblem(seedProblem, position), now).id);
      } else if (existing.origin === 'seed') {
        updateSeedProblem(db, existing.id, toNewProblem(seedProblem, position));
        stillListed.add(existing.id);
      } else {
        setStarterPosition(db, existing.id, position);
        stillListed.add(existing.id);
      }
    });
    for (const problem of listStarterProblems(db)) {
      if (!stillListed.has(problem.id)) setStarterPosition(db, problem.id, null);
    }
  });
  return { loaded: seed.problems.length };
}

export type CatalogLoadResult =
  | { platform: CatalogPlatform; status: 'loaded'; problems: number }
  | { platform: CatalogPlatform; status: 'up-to-date' };

/** The two header fields that decide whether a file is newer, read without checking every problem. */
function peekHeader(raw: unknown): { platform: CatalogPlatform; generatedAt: string } | null {
  const header = z.object({ platform: z.enum(CATALOG_PLATFORMS), generatedAt: z.iso.datetime() }).safeParse(raw);
  return header.success ? header.data : null;
}

/**
 * Loads one catalog file (seed/catalog-<platform>.json) in one transaction. A normal launch costs
 * one small query: the file is only read through when it is newer than what was loaded last time.
 *
 * - A problem not in the table is added.
 * - A seed row is refreshed from the file.
 * - A row the user added by hand keeps everything the user gave and only gains what it lacks.
 * - Never changes a row's ID, origin, starter position or creation time, and never deletes a row,
 *   so attempts and notes always keep their problem.
 */
export function loadCatalogSeed(db: Db, rawSeed: unknown, now: IsoInstant): CatalogLoadResult {
  const header = peekHeader(rawSeed);
  if (header) {
    const loaded = getCatalogSource(db, header.platform);
    if (loaded && Date.parse(loaded.generatedAt) >= Date.parse(header.generatedAt)) {
      return { platform: header.platform, status: 'up-to-date' };
    }
  }

  const seed = catalogSeedSchema.parse(rawSeed);
  const errors = validateSeedProblems(seed.problems);
  if (errors.length > 0) {
    throw new Error(`The ${seed.platform} catalog seed is invalid:\n${errors.slice(0, 20).join('\n')}`);
  }

  db.transaction(() => {
    // Read inside the transaction, so nothing can change between the read and the writes.
    const existing = loadCatalogRows(db, seed.platform);
    for (const entry of seed.problems) {
      const problem = toNewProblem(entry, null);
      const row = existing.get(entry.platformId);
      if (!row) insertCatalogProblem(db, problem, entry.solvedCount, now);
      else if (row.origin === 'seed') updateCatalogProblem(db, row.id, problem, entry.solvedCount);
      else fillMissingCatalogFields(db, row, problem, entry.solvedCount);
    }
    recordCatalogSource(db, {
      platform: seed.platform,
      source: seed.source,
      generatedAt: seed.generatedAt,
      problemCount: seed.problems.length,
      loadedAt: now,
    });
  });
  return { platform: seed.platform, status: 'loaded', problems: seed.problems.length };
}
