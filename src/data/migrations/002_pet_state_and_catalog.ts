import type { Migration } from './types';

// Version 2: what the living pet must remember, and bookkeeping for the problem catalog.
//
// - pet.greeted_day: the ParaLeet day the "missed you" greeting was last seen, so it shows once
//   per absence and not on every launch.
// - pet.reminder_first_day / reminder_evening_day: the ParaLeet day each reminder was last sent,
//   so a restart never sends one twice.
// - A pet that has already been fed has met its owner: mark it hatched, so people who used the
//   app before the first-launch flow existed are not sent through it.
// - problems.solved_count: how many people solved the problem on its platform, when the source
//   says. Used only to prefer well-known problems when choosing candidates for a plan.
// - catalog_sources: which catalog file is loaded for each platform, so a newer file is loaded
//   once and an unchanged one is not reloaded on every launch.
export const m002PetStateAndCatalog: Migration = {
  version: 2,
  name: 'pet-state-and-catalog',
  sql: `
    ALTER TABLE pet ADD COLUMN greeted_day TEXT;
    ALTER TABLE pet ADD COLUMN reminder_first_day TEXT;
    ALTER TABLE pet ADD COLUMN reminder_evening_day TEXT;
    UPDATE pet SET hatched_at = created_at WHERE hatched_at IS NULL AND total_attempts > 0;

    ALTER TABLE problems ADD COLUMN solved_count INTEGER CHECK (solved_count IS NULL OR solved_count >= 0);

    CREATE TABLE catalog_sources (
      platform      TEXT PRIMARY KEY CHECK (platform IN ('leetcode', 'cses', 'codeforces')),
      source        TEXT NOT NULL,
      generated_at  TEXT NOT NULL,
      problem_count INTEGER NOT NULL CHECK (problem_count >= 0),
      loaded_at     TEXT NOT NULL
    );
  `,
};
