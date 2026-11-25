// Export and import of the whole database as one file: a complete copy comes out, only a real
// ParaLeet database goes in, and the swap at launch never loses the data it replaces.
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Db } from './db';
import { migrate } from './migrate';
import { LATEST_SCHEMA_VERSION, MIGRATIONS } from './migrations';
import { insertAttempt } from './repos/attempts';
import { ensurePet } from './repos/pet';
import {
  applyStagedImport,
  DATABASE_FILE_NAME,
  discardStagedImport,
  exportDatabase,
  hasImportBackup,
  hasStagedImport,
  IMPORT_BACKUP_FILE_NAME,
  inspectDatabaseFile,
  STAGED_IMPORT_FILE_NAME,
  stageImport,
  summarizeDatabase,
  TransferError,
} from './transfer';
import { openDatabase } from './index';

const NOW = '2026-11-25T20:00:00.000Z';
let dir: string;
const open: Db[] = [];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'paraleet-transfer-'));
});
afterEach(() => {
  for (const db of open.splice(0)) {
    try {
      db.close();
    } catch {
      // Already closed by the test.
    }
  }
  rmSync(dir, { recursive: true, force: true });
});

/** A real database in its own folder, with `attempts` attempts on consecutive days. */
function makeDatabase(name: string, attempts: number): { db: Db; path: string } {
  const path = join(dir, `${name}.sqlite3`);
  const { db } = openDatabase(path, NOW, []);
  open.push(db);
  const problems = db.all<{ id: number }>('SELECT id FROM problems ORDER BY id LIMIT 20');
  for (let index = 0; index < attempts; index += 1) {
    insertAttempt(db, {
      problemId: problems[index % problems.length]!.id,
      attemptedAt: `2026-11-${String(1 + index).padStart(2, '0')}T20:00:00.000Z`,
      paraDay: `2026-11-${String(1 + index).padStart(2, '0')}`,
      rating: 'good',
      minutes: null,
      kind: 'first_solve',
      verification: 'self_report',
      insightRevealed: false,
      patternTags: [],
      notes: null,
    });
  }
  ensurePet(db, 7, NOW);
  db.run('UPDATE pet SET longest_streak = ?', [attempts]);
  return { db, path };
}

/** A data folder as the app has it: the database under its real name. */
function makeDataDir(attempts: number): string {
  const dataDir = mkdtempSync(join(dir, 'data-'));
  const { db } = openDatabase(join(dataDir, DATABASE_FILE_NAME), NOW, []);
  const problem = db.get<{ id: number }>('SELECT id FROM problems ORDER BY id LIMIT 1')!.id;
  for (let index = 0; index < attempts; index += 1) {
    insertAttempt(db, {
      problemId: problem,
      attemptedAt: `2026-10-${String(1 + index).padStart(2, '0')}T20:00:00.000Z`,
      paraDay: `2026-10-${String(1 + index).padStart(2, '0')}`,
      rating: 'hard',
      minutes: null,
      kind: index === 0 ? 'first_solve' : 'review',
      verification: 'self_report',
      insightRevealed: false,
      patternTags: [],
      notes: null,
    });
  }
  db.close();
  return dataDir;
}

const countAttempts = (path: string): number => {
  const db = new Db(path);
  try {
    return db.get<{ n: number }>('SELECT COUNT(*) AS n FROM attempts')!.n;
  } finally {
    db.close();
  }
};

describe('export', () => {
  it('writes a complete copy that opens as a ParaLeet database', () => {
    const { db } = makeDatabase('source', 5);
    const target = join(dir, 'backup.sqlite3');
    exportDatabase(db, target);
    expect(inspectDatabaseFile(target)).toEqual({
      ok: true,
      summary: {
        schemaVersion: LATEST_SCHEMA_VERSION,
        attempts: 5,
        problems: 5,
        firstDay: '2026-11-01',
        lastDay: '2026-11-05',
        longestStreak: 5,
      },
    });
    // The copy is its own database: the app's data is still there and still open.
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM attempts')?.n).toBe(5);
    expect(existsSync(`${target}.partial`)).toBe(false);
  });

  it('replaces a file that is already there', () => {
    const { db } = makeDatabase('source', 2);
    const target = join(dir, 'backup.sqlite3');
    writeFileSync(target, 'an older export');
    exportDatabase(db, target);
    expect(countAttempts(target)).toBe(2);
  });

  it('refuses to write over the database itself', () => {
    const { db, path } = makeDatabase('source', 1);
    expect(() => exportDatabase(db, path)).toThrow('That is the file ParaLeet is using.');
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM attempts')?.n).toBe(1);
  });

  it('leaves nothing behind when the copy cannot be written', () => {
    const { db } = makeDatabase('source', 1);
    const target = join(dir, 'no-such-folder', 'backup.sqlite3');
    expect(() => exportDatabase(db, target)).toThrow();
    expect(existsSync(target)).toBe(false);
    expect(existsSync(`${target}.partial`)).toBe(false);
  });
});

describe('checking a file before import', () => {
  it('refuses a file that is not a database', () => {
    const path = join(dir, 'notes.txt');
    writeFileSync(path, 'my notes about binary search');
    expect(inspectDatabaseFile(path)).toEqual({ ok: false, reason: 'That file is not a ParaLeet database, or it is damaged.' });
    writeFileSync(path, '');
    expect(inspectDatabaseFile(path)).toMatchObject({ ok: false });
  });

  it('refuses a folder and a file that is not there', () => {
    expect(inspectDatabaseFile(dir)).toEqual({ ok: false, reason: 'That is not a file.' });
    expect(inspectDatabaseFile(join(dir, 'missing.sqlite3'))).toEqual({ ok: false, reason: 'That file could not be opened.' });
  });

  it('refuses a database that is not ParaLeet’s', () => {
    const path = join(dir, 'other.sqlite3');
    const other = new Db(path);
    other.exec('CREATE TABLE contacts (id INTEGER PRIMARY KEY, name TEXT)');
    other.close();
    expect(inspectDatabaseFile(path)).toEqual({ ok: false, reason: 'That file is not a ParaLeet database.' });
    // Even one that claims a version.
    const claimed = new Db(path);
    claimed.userVersion = 2;
    claimed.close();
    expect(inspectDatabaseFile(path)).toEqual({ ok: false, reason: 'That file is not a ParaLeet database.' });
  });

  it('refuses a database from a newer ParaLeet', () => {
    const { db, path } = makeDatabase('newer', 1);
    db.userVersion = LATEST_SCHEMA_VERSION + 1;
    db.close();
    expect(inspectDatabaseFile(path)).toEqual({
      ok: false,
      reason: 'That file was made by a newer ParaLeet. Update ParaLeet, then import it.',
    });
  });

  it('refuses a database that was cut short', () => {
    const { db, path } = makeDatabase('whole', 3);
    db.close();
    const bytes = readFileSync(path);
    const cut = join(dir, 'cut.sqlite3');
    writeFileSync(cut, bytes.subarray(0, Math.floor(bytes.length / 2)));
    expect(inspectDatabaseFile(cut)).toMatchObject({ ok: false });
  });

  it('accepts a database from an older version, and does not change the file', () => {
    const path = join(dir, 'old.sqlite3');
    const old = new Db(path);
    migrate(old, MIGRATIONS, 1);
    old.close();
    const before = readFileSync(path);
    expect(inspectDatabaseFile(path)).toMatchObject({ ok: true, summary: { schemaVersion: 1, attempts: 0, firstDay: null } });
    expect(readFileSync(path).equals(before)).toBe(true);
  });
});

describe('import', () => {
  it('stages a checked file and swaps it in at the next launch, keeping what it replaced', () => {
    const dataDir = makeDataDir(3);
    const { db, path } = makeDatabase('incoming', 7);
    db.close();

    expect(applyStagedImport(dataDir)).toEqual({ status: 'none' });
    expect(stageImport(path, dataDir)).toMatchObject({ attempts: 7 });
    expect(hasStagedImport(dataDir)).toBe(true);
    // Nothing has changed yet: the app keeps running on its own data until it restarts.
    expect(countAttempts(join(dataDir, DATABASE_FILE_NAME))).toBe(3);

    expect(applyStagedImport(dataDir)).toEqual({ status: 'applied', backupPath: join(dataDir, IMPORT_BACKUP_FILE_NAME) });
    expect(hasStagedImport(dataDir)).toBe(false);
    expect(countAttempts(join(dataDir, DATABASE_FILE_NAME))).toBe(7);
    expect(countAttempts(join(dataDir, IMPORT_BACKUP_FILE_NAME))).toBe(3);
    // The file the user chose is untouched.
    expect(countAttempts(path)).toBe(7);
    // Once is once.
    expect(applyStagedImport(dataDir)).toEqual({ status: 'none' });
  });

  it('brings an older database up to date when the app opens it after the swap', () => {
    const dataDir = makeDataDir(1);
    const path = join(dir, 'old.sqlite3');
    const old = new Db(path);
    migrate(old, MIGRATIONS, 1);
    old.close();
    stageImport(path, dataDir);
    expect(applyStagedImport(dataDir).status).toBe('applied');
    const { db, migration } = openDatabase(join(dataDir, DATABASE_FILE_NAME), NOW, []);
    open.push(db);
    expect(migration).toEqual({ from: 1, to: LATEST_SCHEMA_VERSION });
  });

  it('refuses to stage a file that fails the check, and stages nothing', () => {
    const dataDir = makeDataDir(2);
    const path = join(dir, 'notes.txt');
    writeFileSync(path, 'not a database');
    expect(() => stageImport(path, dataDir)).toThrow('That file is not a ParaLeet database, or it is damaged.');
    expect(hasStagedImport(dataDir)).toBe(false);
    expect(() => stageImport(join(dataDir, DATABASE_FILE_NAME), dataDir)).toThrow('That is the file ParaLeet is already using.');
    expect(hasStagedImport(dataDir)).toBe(false);
  });

  it('throws away a staged file that went bad, and leaves the database alone', () => {
    const dataDir = makeDataDir(4);
    writeFileSync(join(dataDir, STAGED_IMPORT_FILE_NAME), 'half a download');
    expect(applyStagedImport(dataDir)).toEqual({
      status: 'rejected',
      reason: 'That file is not a ParaLeet database, or it is damaged.',
    });
    expect(hasStagedImport(dataDir)).toBe(false);
    expect(countAttempts(join(dataDir, DATABASE_FILE_NAME))).toBe(4);
    expect(existsSync(join(dataDir, IMPORT_BACKUP_FILE_NAME))).toBe(false);
  });

  it('puts the database back when the swap fails half way, and says so', () => {
    const dataDir = makeDataDir(3);
    const { db, path } = makeDatabase('incoming', 7);
    db.close();
    stageImport(path, dataDir);
    // The first rename (the database to its backup name) works; the second (the import into
    // place) fails, as a full or failing disk would make it.
    let calls = 0;
    const failingSecond = (from: string, to: string): void => {
      calls += 1;
      if (calls === 2) throw new Error('rename failed');
      renameSync(from, to);
    };
    expect(() => applyStagedImport(dataDir, failingSecond)).toThrow('rename failed');
    // The user's own data is back under its name, and nothing of it was lost.
    expect(countAttempts(join(dataDir, DATABASE_FILE_NAME))).toBe(3);
    expect(hasImportBackup(dataDir)).toBe(false);
    // The staged file is still there; a later launch can apply it.
    expect(hasStagedImport(dataDir)).toBe(true);
    expect(applyStagedImport(dataDir)).toMatchObject({ status: 'applied' });
    expect(countAttempts(join(dataDir, DATABASE_FILE_NAME))).toBe(7);
    expect(countAttempts(join(dataDir, IMPORT_BACKUP_FILE_NAME))).toBe(3);
  });

  it('says what the open database holds, in the same terms as a file to import', () => {
    const { db, path } = makeDatabase('mine', 5);
    expect(summarizeDatabase(db)).toEqual({
      schemaVersion: LATEST_SCHEMA_VERSION,
      attempts: 5,
      problems: 5,
      firstDay: '2026-11-01',
      lastDay: '2026-11-05',
      longestStreak: 5,
    });
    const viaFile = inspectDatabaseFile(path);
    expect(viaFile).toEqual({ ok: true, summary: summarizeDatabase(db) });
  });

  it('refuses with a message for the user, as its own kind of error', () => {
    const dataDir = makeDataDir(1);
    const text = join(dir, 'notes.txt');
    writeFileSync(text, 'not a database');
    expect(() => stageImport(text, dataDir)).toThrow(TransferError);
    expect(() => stageImport(join(dataDir, DATABASE_FILE_NAME), dataDir)).toThrow(TransferError);
  });

  it('works in a folder with no database yet', () => {
    const dataDir = mkdtempSync(join(dir, 'empty-'));
    const { db, path } = makeDatabase('incoming', 2);
    db.close();
    stageImport(path, dataDir);
    expect(applyStagedImport(dataDir)).toEqual({ status: 'applied', backupPath: null });
    expect(countAttempts(join(dataDir, DATABASE_FILE_NAME))).toBe(2);
  });

  it('keeps only the newest backup', () => {
    const dataDir = makeDataDir(1);
    const first = makeDatabase('first', 5);
    first.db.close();
    const second = makeDatabase('second', 9);
    second.db.close();
    stageImport(first.path, dataDir);
    applyStagedImport(dataDir);
    stageImport(second.path, dataDir);
    applyStagedImport(dataDir);
    expect(countAttempts(join(dataDir, DATABASE_FILE_NAME))).toBe(9);
    expect(countAttempts(join(dataDir, IMPORT_BACKUP_FILE_NAME))).toBe(5);
  });

  it('can be called off before the restart', () => {
    const dataDir = makeDataDir(1);
    const { db, path } = makeDatabase('incoming', 2);
    db.close();
    stageImport(path, dataDir);
    discardStagedImport(dataDir);
    expect(applyStagedImport(dataDir)).toEqual({ status: 'none' });
    expect(countAttempts(join(dataDir, DATABASE_FILE_NAME))).toBe(1);
  });

  it('does not let a journal left by a crash reach the imported database', () => {
    const dataDir = makeDataDir(2);
    // A stale journal beside the database, as a crash in the middle of a write would leave. This
    // one is not valid, so SQLite ignores and removes it; what matters is that it is gone.
    writeFileSync(join(dataDir, `${DATABASE_FILE_NAME}-journal`), Buffer.alloc(512));
    const { db, path } = makeDatabase('incoming', 6);
    db.close();
    stageImport(path, dataDir);
    expect(applyStagedImport(dataDir).status).toBe('applied');
    expect(existsSync(join(dataDir, `${DATABASE_FILE_NAME}-journal`))).toBe(false);
    expect(countAttempts(join(dataDir, DATABASE_FILE_NAME))).toBe(6);
    expect(countAttempts(join(dataDir, IMPORT_BACKUP_FILE_NAME))).toBe(2);
  });
});
