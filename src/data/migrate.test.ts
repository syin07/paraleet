import { describe, expect, it } from 'vitest';
import { Db } from './db';
import { migrate, NewerDatabaseError } from './migrate';
import { LATEST_SCHEMA_VERSION, MIGRATIONS } from './migrations';

// One fixture per schema version: rows that are valid at that version. When you add migration N,
// add FIXTURES[N] and, if the new migration moves old data, an assertion in `expectDataSurvived`.
const FIXTURES: Record<number, (db: Db) => void> = {
  1: (db) => {
    db.exec(`
      INSERT INTO problems (id, platform, platform_id, display_id, title, url, difficulty_raw, difficulty_norm,
        topics, source_tags, origin, starter_position, created_at)
      VALUES (1, 'leetcode', 'two-sum', '1', 'Two Sum', 'https://leetcode.com/problems/two-sum/', 'Easy', 1,
        '["arrays-hashing"]', '["Array"]', 'seed', 0, '2026-11-01T00:00:00.000Z');
      INSERT INTO attempts (id, problem_id, attempted_at, para_day, rating, minutes, kind)
      VALUES (1, 1, '2026-11-02T20:00:00.000Z', '2026-11-02', 'good', 12, 'first_solve');
      INSERT INTO problem_notes (problem_id, key_insight, updated_at)
      VALUES (1, 'Hash map of complements', '2026-11-02T20:00:00.000Z');
      INSERT INTO review_cards (problem_id, status, due_at, state, updated_at)
      VALUES (1, 'active', '2026-11-06T20:00:00.000Z', '{}', '2026-11-02T20:00:00.000Z');
      INSERT INTO daily_assignments (para_day, problem_id, reason, completed, assigned_at)
      VALUES ('2026-11-02', 1, 'starter', 1, '2026-11-02T12:00:00.000Z');
      INSERT INTO pet (id, seed, growth_solves, total_attempts, current_streak, longest_streak, last_fed_day, created_at)
      VALUES (1, 42, 1, 1, 1, 1, '2026-11-02', '2026-11-01T00:00:00.000Z');
      INSERT INTO settings (key, value) VALUES ('dayBoundaryHour', '5');
    `);
  },
  2: (db) => {
    FIXTURES[1]?.(db);
    db.exec(`
      UPDATE pet SET greeted_day = '2026-11-02', reminder_first_day = '2026-11-01', reminder_evening_day = '2026-11-01',
        hatched_at = '2026-11-01T00:05:00.000Z';
      UPDATE problems SET solved_count = 12345 WHERE id = 1;
      INSERT INTO catalog_sources (platform, source, generated_at, problem_count, loaded_at)
      VALUES ('leetcode', 'test', '2026-11-01T00:00:00.000Z', 1, '2026-11-01T00:00:01.000Z');
    `);
  },
  3: (db) => {
    FIXTURES[2]?.(db);
    db.exec(`
      INSERT INTO plans (id, title, topics, platforms, level, target_size, status, model, created_at, activated_at)
      VALUES (1, 'Arrays & hashing', '["arrays-hashing"]', '["leetcode"]', 'some', 20, 'active', 'test-model',
        '2026-11-03T00:00:00.000Z', '2026-11-03T00:10:00.000Z');
      INSERT INTO plan_items (plan_id, position, topic, stage, group_name, group_description, problem_id, state)
      VALUES (1, 0, 'arrays-hashing', 'foundations', NULL, NULL, 1, 'done');
    `);
  },
};

function expectDataSurvived(db: Db): void {
  expect(db.get<{ title: string }>('SELECT title FROM problems WHERE id = 1')?.title).toBe('Two Sum');
  expect(db.get<{ rating: string }>('SELECT rating FROM attempts WHERE id = 1')?.rating).toBe('good');
  expect(db.get<{ key_insight: string }>('SELECT key_insight FROM problem_notes WHERE problem_id = 1')?.key_insight).toBe(
    'Hash map of complements',
  );
  expect(db.get<{ status: string }>('SELECT status FROM review_cards WHERE problem_id = 1')?.status).toBe('active');
  expect(db.get<{ completed: number }>("SELECT completed FROM daily_assignments WHERE para_day = '2026-11-02'")?.completed).toBe(1);
  expect(db.get<{ seed: number; current_streak: number }>('SELECT seed, current_streak FROM pet')).toMatchObject({
    seed: 42,
    current_streak: 1,
  });
  expect(db.get<{ value: string }>("SELECT value FROM settings WHERE key = 'dayBoundaryHour'")?.value).toBe('5');
}

describe('migrations', () => {
  it('are numbered 1, 2, 3, ... with no gaps', () => {
    expect(MIGRATIONS.map((migration) => migration.version)).toEqual(MIGRATIONS.map((_, index) => index + 1));
    expect(LATEST_SCHEMA_VERSION).toBe(MIGRATIONS.length);
  });

  it('create a fresh database at the latest version', () => {
    const db = new Db(':memory:');
    expect(migrate(db)).toEqual({ from: 0, to: LATEST_SCHEMA_VERSION });
    expect(db.userVersion).toBe(LATEST_SCHEMA_VERSION);
    db.close();
  });

  it('do nothing when the database is already current', () => {
    const db = new Db(':memory:');
    migrate(db);
    expect(migrate(db)).toEqual({ from: LATEST_SCHEMA_VERSION, to: LATEST_SCHEMA_VERSION });
    db.close();
  });

  it('have a fixture for every version', () => {
    expect(Object.keys(FIXTURES).map(Number)).toEqual(MIGRATIONS.map((migration) => migration.version));
  });

  it.each(MIGRATIONS.map((migration) => migration.version))(
    'upgrade a database created at version %i without losing data',
    (version) => {
      const db = new Db(':memory:');
      migrate(db, MIGRATIONS, version);
      expect(db.userVersion).toBe(version);
      FIXTURES[version]?.(db);

      expect(migrate(db).to).toBe(LATEST_SCHEMA_VERSION);
      expectDataSurvived(db);
      db.close();
    },
  );

  it('refuse a database written by a newer app instead of touching it', () => {
    const db = new Db(':memory:');
    migrate(db);
    db.userVersion = LATEST_SCHEMA_VERSION + 1;
    expect(() => migrate(db)).toThrow(NewerDatabaseError);
    db.close();
  });

  it('leave the database at the last good version when a migration fails', () => {
    const db = new Db(':memory:');
    const broken = [...MIGRATIONS, { version: MIGRATIONS.length + 1, name: 'broken', sql: 'CREATE TABLE x (a); SELECT nope;' }];
    expect(() => migrate(db, broken)).toThrow();
    expect(db.userVersion).toBe(LATEST_SCHEMA_VERSION);
    expect(db.get("SELECT name FROM sqlite_master WHERE name = 'x'")).toBeUndefined();
    db.close();
  });
});

describe('schema rules', () => {
  it('keep attempts append-only', () => {
    const db = new Db(':memory:');
    migrate(db);
    FIXTURES[1]?.(db);
    expect(() => db.run("UPDATE attempts SET rating = 'easy' WHERE id = 1")).toThrow(/append-only/);
    expect(() => db.run('DELETE FROM attempts WHERE id = 1')).toThrow(/append-only/);
    db.close();
  });

  it('reject an unknown platform or rating', () => {
    const db = new Db(':memory:');
    migrate(db);
    FIXTURES[1]?.(db);
    expect(() =>
      db.run(
        "INSERT INTO problems (platform, platform_id, title, url, origin, created_at) VALUES ('hackerrank', 'x', 'X', 'https://x', 'user', 'now')",
      ),
    ).toThrow();
    expect(() =>
      db.run(
        "INSERT INTO attempts (problem_id, attempted_at, para_day, rating, kind) VALUES (1, 'now', '2026-11-03', 'perfect', 'review')",
      ),
    ).toThrow();
    db.close();
  });

  it('roll back a failed transaction, including nested ones', () => {
    const db = new Db(':memory:');
    migrate(db);
    expect(() =>
      db.transaction(() => {
        db.run("INSERT INTO settings (key, value) VALUES ('a', '1')");
        db.transaction(() => {
          db.run("INSERT INTO settings (key, value) VALUES ('b', '2')");
        });
        throw new Error('stop');
      }),
    ).toThrow('stop');
    expect(db.all('SELECT * FROM settings')).toEqual([]);

    db.transaction(() => {
      db.run("INSERT INTO settings (key, value) VALUES ('a', '1')");
      try {
        db.transaction(() => {
          db.run("INSERT INTO settings (key, value) VALUES ('b', '2')");
          throw new Error('inner');
        });
      } catch {
        // The inner savepoint rolled back; the outer transaction carries on.
      }
    });
    expect(db.all<{ key: string }>('SELECT key FROM settings').map((row) => row.key)).toEqual(['a']);
    db.close();
  });

  it('survives a commit that fails: the real error surfaces, nothing is saved, and the next transaction works', () => {
    const db = new Db(':memory:');
    migrate(db);
    // A deferred foreign-key violation is only detected at COMMIT.
    expect(() =>
      db.transaction(() => {
        db.exec('PRAGMA defer_foreign_keys = ON');
        db.run("INSERT INTO settings (key, value) VALUES ('kept', '1')");
        db.run(
          "INSERT INTO attempts (problem_id, attempted_at, para_day, rating, kind) VALUES (999, 'now', '2026-11-03', 'good', 'review')",
        );
      }),
    ).toThrow(/FOREIGN KEY/i);
    expect(db.all('SELECT * FROM settings')).toEqual([]);
    expect(db.all('SELECT * FROM attempts')).toEqual([]);

    db.transaction(() => {
      db.run("INSERT INTO settings (key, value) VALUES ('after', '1')");
    });
    expect(db.all<{ key: string }>('SELECT key FROM settings').map((row) => row.key)).toEqual(['after']);
    db.close();
  });

  it('stays usable when both the release and the commit fail', () => {
    const db = new Db(':memory:');
    migrate(db);
    // Ending the transaction from inside makes the inner release and the outer commit both fail.
    expect(() =>
      db.transaction(() => {
        db.transaction(() => {
          db.exec('ROLLBACK');
        });
      }),
    ).toThrow();

    db.transaction(() => {
      db.transaction(() => {
        db.run("INSERT INTO settings (key, value) VALUES ('after', '1')");
      });
    });
    expect(db.all<{ key: string }>('SELECT key FROM settings').map((row) => row.key)).toEqual(['after']);
    db.close();
  });

  it('refuses asynchronous work, which would commit before the work finished', () => {
    const db = new Db(':memory:');
    migrate(db);
    expect(() =>
      db.transaction(async () => {
        db.run("INSERT INTO settings (key, value) VALUES ('a', '1')");
      }),
    ).toThrow(/synchronous/);
    expect(db.all('SELECT * FROM settings')).toEqual([]);
    db.close();
  });
});

describe('migration 2', () => {
  function atVersion1(): Db {
    const db = new Db(':memory:');
    migrate(db, MIGRATIONS, 1);
    return db;
  }

  it('marks a pet that has already been fed as hatched, and leaves a new one to hatch', () => {
    const fed = atVersion1();
    FIXTURES[1]?.(fed);
    migrate(fed);
    expect(fed.get<{ hatched_at: string | null }>('SELECT hatched_at FROM pet')?.hatched_at).toBe(
      '2026-11-01T00:00:00.000Z',
    );
    fed.close();

    const unfed = atVersion1();
    unfed.exec("INSERT INTO pet (id, seed, created_at) VALUES (1, 7, '2026-11-20T00:00:00.000Z')");
    migrate(unfed);
    expect(unfed.get<{ hatched_at: string | null }>('SELECT hatched_at FROM pet')?.hatched_at).toBeNull();
    unfed.close();
  });

  it('starts every pet with no greeting and no reminder sent, and problems with no solved count', () => {
    const db = atVersion1();
    FIXTURES[1]?.(db);
    migrate(db);
    expect(
      db.get('SELECT greeted_day, reminder_first_day, reminder_evening_day FROM pet'),
    ).toEqual({ greeted_day: null, reminder_first_day: null, reminder_evening_day: null });
    expect(db.get<{ solved_count: number | null }>('SELECT solved_count FROM problems WHERE id = 1')?.solved_count).toBeNull();
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM catalog_sources')?.n).toBe(0);
    db.close();
  });

  it('refuses a negative solved count and an unknown catalog platform', () => {
    const db = new Db(':memory:');
    migrate(db);
    FIXTURES[1]?.(db);
    expect(() => db.exec('UPDATE problems SET solved_count = -1 WHERE id = 1')).toThrow();
    expect(() =>
      db.exec(
        "INSERT INTO catalog_sources (platform, source, generated_at, problem_count, loaded_at) VALUES ('other', 's', 't', 0, 't')",
      ),
    ).toThrow();
    db.close();
  });
});

describe('migration 3', () => {
  function current(): Db {
    const db = new Db(':memory:');
    migrate(db);
    FIXTURES[3]?.(db);
    return db;
  }

  it('allows only one active plan', () => {
    const db = current();
    const second = `INSERT INTO plans (title, topics, platforms, level, target_size, status, model, created_at)
      VALUES ('Second', '[]', '[]', 'new', 10, 'active', 'm', '2026-11-04T00:00:00.000Z')`;
    expect(() => db.exec(second)).toThrow();
    // Any number of drafts and archived plans is fine.
    db.exec(second.replace("'active'", "'draft'"));
    db.exec(second.replace("'active'", "'archived'"));
    db.close();
  });

  it('refuses a plan item for a problem that does not exist, and the same problem twice in a plan', () => {
    const db = current();
    const item = (problemId: number): string =>
      `INSERT INTO plan_items (plan_id, position, topic, stage, problem_id) VALUES (1, 1, 'arrays-hashing', 'challenge', ${problemId})`;
    expect(() => db.exec(item(424242))).toThrow();
    expect(() => db.exec(item(1))).toThrow();
    db.close();
  });

  it('refuses an unknown level, status, stage or item state', () => {
    const db = current();
    expect(() => db.exec("UPDATE plans SET level = 'expert'")).toThrow();
    expect(() => db.exec("UPDATE plans SET status = 'paused'")).toThrow();
    expect(() => db.exec("UPDATE plan_items SET stage = 'warmup'")).toThrow();
    expect(() => db.exec("UPDATE plan_items SET state = 'failed'")).toThrow();
    db.close();
  });

  it('removes a plan\'s items with the plan, and never a problem', () => {
    const db = current();
    db.exec('DELETE FROM plans WHERE id = 1');
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM plan_items')?.n).toBe(0);
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM problems')?.n).toBe(1);
    db.close();
  });
});
