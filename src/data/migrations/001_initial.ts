import type { Migration } from './types';

// Version 1: the daily loop. Plans arrive in a later migration (M3).
// Timestamps are UTC ISO strings. ParaLeet days are local calendar dates, YYYY-MM-DD.
// JSON arrays are stored as text.
export const m001Initial: Migration = {
  version: 1,
  name: 'initial',
  sql: `
    CREATE TABLE problems (
      id               INTEGER PRIMARY KEY,
      platform         TEXT NOT NULL CHECK (platform IN ('leetcode', 'cses', 'codeforces', 'other')),
      platform_id      TEXT NOT NULL,
      display_id       TEXT,
      title            TEXT NOT NULL,
      url              TEXT NOT NULL,
      difficulty_raw   TEXT,
      difficulty_norm  INTEGER CHECK (difficulty_norm BETWEEN 1 AND 5),
      topics           TEXT NOT NULL DEFAULT '[]',
      source_tags      TEXT NOT NULL DEFAULT '[]',
      origin           TEXT NOT NULL CHECK (origin IN ('seed', 'user')),
      starter_position INTEGER,
      created_at       TEXT NOT NULL,
      UNIQUE (platform, platform_id)
    );
    CREATE INDEX problems_starter ON problems (starter_position) WHERE starter_position IS NOT NULL;

    CREATE TABLE attempts (
      id               INTEGER PRIMARY KEY,
      problem_id       INTEGER NOT NULL REFERENCES problems (id),
      attempted_at     TEXT NOT NULL,
      para_day         TEXT NOT NULL,
      rating           TEXT NOT NULL CHECK (rating IN ('again', 'hard', 'good', 'easy')),
      minutes          INTEGER CHECK (minutes IS NULL OR minutes >= 0),
      kind             TEXT NOT NULL CHECK (kind IN ('first_solve', 'review')),
      verification     TEXT NOT NULL DEFAULT 'self_report',
      insight_revealed INTEGER NOT NULL DEFAULT 0,
      pattern_tags     TEXT NOT NULL DEFAULT '[]',
      notes            TEXT
    );
    CREATE INDEX attempts_problem ON attempts (problem_id);
    CREATE INDEX attempts_day ON attempts (para_day);

    -- attempts is append-only: it is the source of truth for streak, growth and plan progress.
    CREATE TRIGGER attempts_no_update BEFORE UPDATE ON attempts
    BEGIN
      SELECT RAISE(ABORT, 'attempts is append-only');
    END;
    CREATE TRIGGER attempts_no_delete BEFORE DELETE ON attempts
    BEGIN
      SELECT RAISE(ABORT, 'attempts is append-only');
    END;

    CREATE TABLE problem_notes (
      problem_id   INTEGER PRIMARY KEY REFERENCES problems (id),
      key_insight  TEXT,
      pattern_tags TEXT NOT NULL DEFAULT '[]',
      notes        TEXT,
      solution_url TEXT,
      updated_at   TEXT NOT NULL
    );

    CREATE TABLE review_cards (
      problem_id INTEGER PRIMARY KEY REFERENCES problems (id),
      status     TEXT NOT NULL CHECK (status IN ('active', 'retired')),
      due_at     TEXT NOT NULL,
      state      TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX review_cards_due ON review_cards (status, due_at);

    CREATE TABLE daily_assignments (
      para_day    TEXT PRIMARY KEY,
      problem_id  INTEGER NOT NULL REFERENCES problems (id),
      reason      TEXT NOT NULL CHECK (reason IN ('review', 'plan', 'starter', 'user_swap')),
      completed   INTEGER NOT NULL DEFAULT 0,
      assigned_at TEXT NOT NULL
    );

    CREATE TABLE pet (
      id                   INTEGER PRIMARY KEY CHECK (id = 1),
      seed                 INTEGER NOT NULL,
      growth_solves        INTEGER NOT NULL DEFAULT 0,
      total_attempts       INTEGER NOT NULL DEFAULT 0,
      current_streak       INTEGER NOT NULL DEFAULT 0,
      longest_streak       INTEGER NOT NULL DEFAULT 0,
      last_fed_day         TEXT,
      unlocked_accessories TEXT NOT NULL DEFAULT '[]',
      equipped_accessories TEXT NOT NULL DEFAULT '[]',
      hatched_at           TEXT,
      created_at           TEXT NOT NULL
    );

    CREATE TABLE settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `,
};
