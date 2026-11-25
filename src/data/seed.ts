import type { TopicId } from '../core/topics';
import type { IsoInstant } from '../core/types';
import type { Db } from './db';
import {
  getProblemByPlatformId,
  insertProblem,
  listStarterProblems,
  setStarterPosition,
  updateSeedProblem,
  type NewProblem,
} from './repos/problems';
import { starterSeedSchema, validateSeedProblems, type SeedProblem } from './seedFormat';

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
