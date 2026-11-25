// Export and import of the whole database as one file (PRD section 10).
//
// Export writes a clean, complete copy with SQLite's own `VACUUM INTO`. Import never touches the
// open database: the chosen file is checked, copied next to the database as a staged file, and
// swapped in at the next launch, before anything has the database open. The database it replaces
// is kept beside it as a backup. See docs/decisions/0017-stats-and-data.md.
import { copyFileSync, existsSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ParaDay } from '../core/types';
import { Db } from './db';
import { LATEST_SCHEMA_VERSION } from './migrations';

export const DATABASE_FILE_NAME = 'paraleet.sqlite3';
/** A checked import waiting for the next launch. */
export const STAGED_IMPORT_FILE_NAME = 'paraleet.sqlite3.import';
/** The database the last import replaced. One is kept; the next import overwrites it. */
export const IMPORT_BACKUP_FILE_NAME = 'paraleet.sqlite3.before-import';

/** Tables every ParaLeet database has had since its first version. */
const REQUIRED_TABLES = ['problems', 'attempts', 'review_cards', 'pet', 'settings'] as const;

const samePath = (a: string, b: string): boolean => resolve(a) === resolve(b);

/**
 * Writes a complete copy of the database to `targetPath`, replacing a file that is there. The
 * copy is written beside the target first and renamed, so a failure never leaves half a file
 * under the name the user chose.
 */
export function exportDatabase(db: Db, targetPath: string): void {
  if (samePath(db.path, targetPath)) {
    throw new Error('That is the file ParaLeet is using. Choose another place for the copy.');
  }
  const temporary = `${targetPath}.partial`;
  rmSync(temporary, { force: true });
  try {
    db.run('VACUUM INTO ?', [temporary]);
    renameSync(temporary, targetPath);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}

/** What a database file holds, for the user to recognize it before it replaces their data. */
export interface DatabaseSummary {
  schemaVersion: number;
  /** Attempts logged. */
  attempts: number;
  /** Different problems with at least one attempt. */
  problems: number;
  firstDay: ParaDay | null;
  lastDay: ParaDay | null;
  longestStreak: number;
}

export type DatabaseCheck = { ok: true; summary: DatabaseSummary } | { ok: false; reason: string };

/**
 * Looks at a file without changing it and says whether it is a ParaLeet database this app can
 * open. The reasons are written for the user.
 */
export function inspectDatabaseFile(path: string, latestVersion: number = LATEST_SCHEMA_VERSION): DatabaseCheck {
  let raw: DatabaseSync;
  try {
    if (!statSync(path).isFile()) return { ok: false, reason: 'That is not a file.' };
    raw = new DatabaseSync(path, { readOnly: true });
  } catch {
    return { ok: false, reason: 'That file could not be opened.' };
  }
  try {
    const version = (raw.prepare('PRAGMA user_version').get() as { user_version: number } | undefined)?.user_version ?? 0;
    const tables = new Set(
      (raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((row) => row.name),
    );
    if (version < 1 || !REQUIRED_TABLES.every((table) => tables.has(table))) {
      return { ok: false, reason: 'That file is not a ParaLeet database.' };
    }
    if (version > latestVersion) {
      return { ok: false, reason: 'That file was made by a newer ParaLeet. Update ParaLeet, then import it.' };
    }
    const integrity = raw.prepare('PRAGMA integrity_check').all() as { integrity_check: string }[];
    if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok') {
      return { ok: false, reason: 'That file is damaged and cannot be imported.' };
    }
    const attempts = raw
      .prepare('SELECT COUNT(*) AS attempts, COUNT(DISTINCT problem_id) AS problems, MIN(para_day) AS first, MAX(para_day) AS last FROM attempts')
      .get() as { attempts: number; problems: number; first: string | null; last: string | null };
    const pet = raw.prepare('SELECT longest_streak FROM pet LIMIT 1').get() as { longest_streak: number } | undefined;
    return {
      ok: true,
      summary: {
        schemaVersion: version,
        attempts: Number(attempts.attempts),
        problems: Number(attempts.problems),
        firstDay: attempts.first,
        lastDay: attempts.last,
        longestStreak: Number(pet?.longest_streak ?? 0),
      },
    };
  } catch {
    // Not SQLite at all, a file cut short, or a database another program left half-written.
    return { ok: false, reason: 'That file is not a ParaLeet database, or it is damaged.' };
  } finally {
    raw.close();
  }
}

/**
 * Copies a checked file next to the database, to be swapped in at the next launch. Throws with a
 * message for the user when the file does not pass the check.
 */
export function stageImport(sourcePath: string, dataDir: string): DatabaseSummary {
  if (samePath(sourcePath, join(dataDir, DATABASE_FILE_NAME))) {
    throw new Error('That is the file ParaLeet is already using.');
  }
  const check = inspectDatabaseFile(sourcePath);
  if (!check.ok) throw new Error(check.reason);
  const staged = join(dataDir, STAGED_IMPORT_FILE_NAME);
  const temporary = `${staged}.partial`;
  rmSync(temporary, { force: true });
  copyFileSync(sourcePath, temporary);
  renameSync(temporary, staged);
  return check.summary;
}

export function hasStagedImport(dataDir: string): boolean {
  return existsSync(join(dataDir, STAGED_IMPORT_FILE_NAME));
}

export function discardStagedImport(dataDir: string): void {
  rmSync(join(dataDir, STAGED_IMPORT_FILE_NAME), { force: true });
  rmSync(join(dataDir, `${STAGED_IMPORT_FILE_NAME}.partial`), { force: true });
}

export type StagedImportResult =
  | { status: 'none' }
  /** The staged file is now the database; what it replaced is at `backupPath` (null if there was none). */
  | { status: 'applied'; backupPath: string | null }
  /** The staged file failed the check and was removed; the database is untouched. */
  | { status: 'rejected'; reason: string };

/**
 * Swaps a staged import in. Call at launch, before the database is opened. The staged file is
 * checked again, because it may have sat on disk since an earlier run.
 */
export function applyStagedImport(dataDir: string): StagedImportResult {
  const staged = join(dataDir, STAGED_IMPORT_FILE_NAME);
  if (!existsSync(staged)) return { status: 'none' };

  const check = inspectDatabaseFile(staged);
  if (!check.ok) {
    discardStagedImport(dataDir);
    return { status: 'rejected', reason: check.reason };
  }

  const current = join(dataDir, DATABASE_FILE_NAME);
  const backup = join(dataDir, IMPORT_BACKUP_FILE_NAME);
  let backupPath: string | null = null;
  if (existsSync(current)) {
    // A crash can leave a journal beside the database. Opening the database lets SQLite finish
    // that work now; left alone, the journal would later be applied to the imported file.
    if (existsSync(`${current}-journal`)) {
      const settle = new Db(current);
      try {
        settle.get('SELECT COUNT(*) AS n FROM sqlite_master');
      } finally {
        settle.close();
      }
    }
    rmSync(backup, { force: true });
    renameSync(current, backup);
    backupPath = backup;
  }
  rmSync(`${current}-journal`, { force: true });
  renameSync(staged, current);
  return { status: 'applied', backupPath };
}

/** Where the database lives, for code that is handed only the database. */
export function dataDirOf(db: Db): string {
  return dirname(db.path);
}
