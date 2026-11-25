import type { Migration } from './types';

// Version 3: learning plans (PRD sections 7 and 10).
//
// - plans: what was asked for (topics, platforms, level, size), which model wrote it, and where it
//   is in its life: draft (being reviewed), active (the daily loop draws from it), done, archived.
//   At most one plan is active, enforced by a partial unique index.
// - plan_items: the plan's problems in order. Every item points at a row in `problems`, so a plan
//   cannot hold a problem the catalog does not have. A problem appears at most once in a plan.
//   Group name and description are the model's words for a pattern group; null outside it.
export const m003Plans: Migration = {
  version: 3,
  name: 'plans',
  sql: `
    CREATE TABLE plans (
      id            INTEGER PRIMARY KEY,
      title         TEXT NOT NULL,
      topics        TEXT NOT NULL,
      platforms     TEXT NOT NULL,
      level         TEXT NOT NULL CHECK (level IN ('new', 'some', 'comfortable')),
      target_size   INTEGER NOT NULL CHECK (target_size > 0),
      status        TEXT NOT NULL CHECK (status IN ('draft', 'active', 'done', 'archived')),
      model         TEXT NOT NULL,
      created_at    TEXT NOT NULL,
      activated_at  TEXT,
      finished_at   TEXT
    );
    CREATE UNIQUE INDEX plans_one_active ON plans (status) WHERE status = 'active';

    CREATE TABLE plan_items (
      id                INTEGER PRIMARY KEY,
      plan_id           INTEGER NOT NULL REFERENCES plans (id) ON DELETE CASCADE,
      position          INTEGER NOT NULL,
      topic             TEXT NOT NULL,
      stage             TEXT NOT NULL CHECK (stage IN ('foundations', 'patterns', 'challenge')),
      group_name        TEXT,
      group_description TEXT,
      problem_id        INTEGER NOT NULL REFERENCES problems (id),
      state             TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'done', 'skipped')),
      UNIQUE (plan_id, problem_id)
    );
    CREATE INDEX plan_items_by_plan ON plan_items (plan_id, position);
    CREATE INDEX plan_items_by_problem ON plan_items (problem_id);
  `,
};
