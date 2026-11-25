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
});
