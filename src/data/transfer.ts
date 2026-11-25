// Export and import of the whole database as one file (PRD section 10).
//
// Export writes a clean, complete copy with SQLite's own `VACUUM INTO`. Import never touches the
// open database: the chosen file is checked, copied next to the database as a staged file, and
// swapped in at the next launch, before anything has the database open. The database it replaces
// is kept beside it as a backup. See docs/decisions/0017-stats-and-data.md.
import { closeSync, copyFileSync, existsSync, fsyncSync, openSync, renameSync, rmSync, statSync, utimesSync } from 'node:fs';
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
/** An imported database that would not open at launch. Kept, not deleted; the next one overwrites it. */
export const FAILED_IMPORT_FILE_NAME = 'paraleet.sqlite3.import-failed';

/** What SQLite can leave beside a database it had open when the app died. */
const SIDE_FILE_SUFFIXES = ['-journal', '-wal', '-shm'] as const;

/**
 * Removes the files SQLite left beside `path`. Only for a file that is about to be thrown away or
 * written anew: a journal left beside a name would otherwise be applied to the next file put
 * under that name, and damage it.
 */
function removeSideFiles(path: string): void {
  for (const suffix of SIDE_FILE_SUFFIXES) rmSync(`${path}${suffix}`, { force: true });
}

/** Asks the disk to really hold the file, so "saved" is still true after a power cut. */
function flushToDisk(path: string): void {
  const handle = openSync(path, 'r');
  try {
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
}

/** Tables every ParaLeet database has had since its first version. */
const REQUIRED_TABLES = ['problems', 'attempts', 'review_cards', 'pet', 'settings'] as const;

/**
 * True when two paths name the same file. Spelling is not enough on a Mac: the disk ignores case
 * and a folder may be reached through a link, so two files that both exist are compared by what
 * they are on disk.
 */
export function samePath(a: string, b: string): boolean {
  if (resolve(a) === resolve(b)) return true;
  try {
    const first = statSync(a);
    const second = statSync(b);
    return first.dev === second.dev && first.ino === second.ino;
  } catch {
    // One of them does not exist, so they are not the same file.
    return false;
  }
}

/** A failure whose message is written for the user and can be shown as it is. */
export class TransferError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransferError';
  }
}

/**
 * Writes a complete copy of the database to `targetPath`, replacing a file that is there. The
 * copy is written beside the target first and renamed, so a failure never leaves half a file
 * under the name the user chose.
 */
export function exportDatabase(db: Db, targetPath: string): void {
  if (samePath(db.path, targetPath)) {
    throw new TransferError('That is the file ParaLeet is using. Choose another place for the copy.');
  }
  const temporary = `${targetPath}.partial`;
  rmSync(temporary, { force: true });
  try {
    db.run('VACUUM INTO ?', [temporary]);
    flushToDisk(temporary);
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

const SUMMARY_SQL =
  'SELECT COUNT(*) AS attempts, COUNT(DISTINCT problem_id) AS problems, MIN(para_day) AS first, MAX(para_day) AS last FROM attempts';

interface SummaryRow {
  attempts: number;
  problems: number;
  first: string | null;
  last: string | null;
}

function toSummary(schemaVersion: number, row: SummaryRow | undefined, longestStreak: number | undefined): DatabaseSummary {
  return {
    schemaVersion,
    attempts: Number(row?.attempts ?? 0),
    problems: Number(row?.problems ?? 0),
    firstDay: row?.first ?? null,
    lastDay: row?.last ?? null,
    longestStreak: Number(longestStreak ?? 0),
  };
}

/** What the open database holds, in the same terms as a file about to be imported. */
export function summarizeDatabase(db: Db): DatabaseSummary {
  return toSummary(
    db.get<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0,
    db.get<SummaryRow>(SUMMARY_SQL),
    db.get<{ longest_streak: number }>('SELECT longest_streak FROM pet LIMIT 1')?.longest_streak,
  );
}

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
    const attempts = raw.prepare(SUMMARY_SQL).get() as SummaryRow | undefined;
    const pet = raw.prepare('SELECT longest_streak FROM pet LIMIT 1').get() as { longest_streak: number } | undefined;
    return { ok: true, summary: toSummary(version, attempts, pet?.longest_streak) };
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
    throw new TransferError('That is the file ParaLeet is already using.');
  }
  const check = inspectDatabaseFile(sourcePath);
  if (!check.ok) throw new TransferError(check.reason);
  const staged = join(dataDir, STAGED_IMPORT_FILE_NAME);
  const temporary = `${staged}.partial`;
  rmSync(temporary, { force: true });
  // A journal left by an earlier staged file that the app died on must not meet this one.
  removeSideFiles(staged);
  copyFileSync(sourcePath, temporary);
  renameSync(temporary, staged);
  // A copy can keep the original's date. The staged file's date says when it was staged: a launch
  // long after that does not apply it (see `stagedImportAgeMs`).
  const stagedAt = new Date();
  utimesSync(staged, stagedAt, stagedAt);
  return check.summary;
}

/** A staged import older than this is not applied: the restart it was waiting for never came. */
export const STAGED_IMPORT_MAX_AGE_MS = 10 * 60 * 1000;

/** How long ago the staged import was staged, or null when there is none. */
export function stagedImportAgeMs(dataDir: string, nowMs: number): number | null {
  try {
    return Math.max(nowMs - statSync(join(dataDir, STAGED_IMPORT_FILE_NAME)).mtimeMs, 0);
  } catch {
    return null;
  }
}

/**
 * Undoes an import that was just swapped in and then would not open: the imported file is moved
 * aside and the database it replaced is put back under its name. Returns true when a backup was
 * there to put back. Call only before the database is open.
 *
 * The imported file is kept as `FAILED_IMPORT_FILE_NAME`, not deleted. When the user imports the
 * backup of an earlier import to undo it, that backup is the only copy of what they want back;
 * this way no path through an import deletes the last copy of anything.
 */
export function revertAppliedImport(dataDir: string): boolean {
  const current = join(dataDir, DATABASE_FILE_NAME);
  const backup = join(dataDir, IMPORT_BACKUP_FILE_NAME);
  const failed = join(dataDir, FAILED_IMPORT_FILE_NAME);
  rmSync(failed, { force: true });
  if (existsSync(current)) renameSync(current, failed);
  removeSideFiles(current);
  if (!existsSync(backup)) return false;
  renameSync(backup, current);
  return true;
}

/**
 * Puts the backup back when the database is gone but the backup of an import is there. That is
 * what a swap looks like when the app died, or the disk failed, between its two renames: the
 * user's data sits under the backup name and nothing sits under the database name. Without this
 * the app would start on a new, empty database. Returns true when it put the backup back. Call
 * at launch, before anything else looks at the folder.
 */
export function restoreMissingDatabase(dataDir: string): boolean {
  const current = join(dataDir, DATABASE_FILE_NAME);
  const backup = join(dataDir, IMPORT_BACKUP_FILE_NAME);
  if (existsSync(current) || !existsSync(backup)) return false;
  removeSideFiles(current);
  renameSync(backup, current);
  return true;
}

export function hasStagedImport(dataDir: string): boolean {
  return existsSync(join(dataDir, STAGED_IMPORT_FILE_NAME));
}

/** True when the database an earlier import replaced is still kept next to the database. */
export function hasImportBackup(dataDir: string): boolean {
  return existsSync(join(dataDir, IMPORT_BACKUP_FILE_NAME));
}

export function discardStagedImport(dataDir: string): void {
  const staged = join(dataDir, STAGED_IMPORT_FILE_NAME);
  rmSync(staged, { force: true });
  rmSync(`${staged}.partial`, { force: true });
  removeSideFiles(staged);
}

export type StagedImportResult =
  | { status: 'none' }
  /** The staged file is now the database; what it replaced is at `backupPath` (null if there was none). */
  | { status: 'applied'; backupPath: string | null }
  /** The staged file failed the check and was removed; the database is untouched. */
  | { status: 'rejected'; reason: string };

/**
 * Swaps a staged import in. Call at launch, before the database is opened. The staged file is
 * checked again, because it may have sat on disk since an earlier run. If the swap fails half
 * way, the database that was there is put back and the error is thrown: the user's data is never
 * left without a file under its name. `rename` is replaceable so a test can make it fail.
 */
export function applyStagedImport(
  dataDir: string,
  rename: (from: string, to: string) => void = renameSync,
): StagedImportResult {
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
    rename(current, backup);
    backupPath = backup;
  }
  try {
    removeSideFiles(current);
    rename(staged, current);
  } catch (error) {
    if (backupPath !== null && !existsSync(current)) rename(backupPath, current);
    throw error;
  }
  // The staged file passed its check, so nothing beside its old name is still needed.
  removeSideFiles(staged);
  return { status: 'applied', backupPath };
}

/** Where the database lives, for code that is handed only the database. */
export function dataDirOf(db: Db): string {
  return dirname(db.path);
}
