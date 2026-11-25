import catalogCodeforces from '../../seed/catalog-codeforces.json';
import catalogCses from '../../seed/catalog-cses.json';
import catalogLeetcode from '../../seed/catalog-leetcode.json';
import starterSeed from '../../seed/starter.json';
import { join } from 'node:path';
import { utimesSync } from 'node:fs';
import type { IsoInstant } from '../core/types';
import { Db } from './db';
import { migrate, type MigrationResult } from './migrate';
import { loadCatalogSeed, loadStarterSeed } from './seed';
import {
  applyStagedImport,
  DATABASE_FILE_NAME,
  discardStagedImport,
  restoreMissingDatabase,
  revertAppliedImport,
  STAGED_IMPORT_FILE_NAME,
  STAGED_IMPORT_MAX_AGE_MS,
  stagedImportAgeMs,
  stageImport,
  TransferError,
  type DatabaseSummary,
} from './transfer';

export { Db } from './db';
export { migrate, NewerDatabaseError } from './migrate';
export { LATEST_SCHEMA_VERSION, MIGRATIONS } from './migrations';
export {
  applyStagedImport,
  DATABASE_FILE_NAME,
  dataDirOf,
  discardStagedImport,
  exportDatabase,
  FAILED_IMPORT_FILE_NAME,
  hasImportBackup,
  hasStagedImport,
  IMPORT_BACKUP_FILE_NAME,
  inspectDatabaseFile,
  STAGED_IMPORT_FILE_NAME,
  restoreMissingDatabase,
  revertAppliedImport,
  samePath,
  STAGED_IMPORT_MAX_AGE_MS,
  stagedImportAgeMs,
  stageImport,
  summarizeDatabase,
  TransferError,
  type DatabaseCheck,
  type DatabaseSummary,
  type StagedImportResult,
} from './transfer';


export interface OpenResult {
  db: Db;
  migration: MigrationResult;
  /** Catalog files that could not be loaded, in plain words. The app still opens without them. */
  catalogProblems: string[];
}

/** The built-in catalog files (PRD section 8). Replaceable in tests. */
const CATALOGS: readonly unknown[] = [catalogLeetcode, catalogCses, catalogCodeforces];

/**
 * Opens the database at `path`, brings its schema up to date and loads the built-in seeds.
 *
 * The catalog is reference data: a catalog file that cannot be loaded is reported and skipped,
 * and never stops the app from opening the user's data. Each file loads in its own transaction,
 * so a bad one changes nothing.
 */
export function openDatabase(path: string, now: IsoInstant, catalogs: readonly unknown[] = CATALOGS): OpenResult {
  const db = new Db(path);
  try {
    const migration = migrate(db);
    loadStarterSeed(db, starterSeed, now);
    const catalogProblems: string[] = [];
    // The files are part of the app's own code, so reading them costs nothing extra; writing to
    // the database is skipped after one small query per file unless the file is newer.
    for (const catalog of catalogs) {
      try {
        loadCatalogSeed(db, catalog, now);
      } catch (error) {
        const platform = (catalog as { platform?: unknown } | null)?.platform;
        catalogProblems.push(
          `The ${typeof platform === 'string' ? platform : 'problem'} catalog could not be loaded: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
        );
      }
    }
    return { db, migration, catalogProblems };
  } catch (error) {
    db.close();
    throw error;
  }
}

/** What a launch did with a staged import. */
export type ImportOutcome = { status: 'applied' } | { status: 'rejected'; reason: string };

/**
 * Stages a file for import and proves the copy can be used: the staged copy, which is ours, is
 * opened the way the app opens its database, so it is brought up to date and given the built-in
 * lists here and now. A file that looks like a ParaLeet database but cannot be opened is refused
 * at this point, with nothing changed, and never reaches the swap at launch.
 */
export function stageCheckedImport(
  sourcePath: string,
  dataDir: string,
  now: IsoInstant,
  catalogs: readonly unknown[] = CATALOGS,
): DatabaseSummary {
  const summary = stageImport(sourcePath, dataDir);
  try {
    openDatabase(join(dataDir, STAGED_IMPORT_FILE_NAME), now, catalogs).db.close();
  } catch {
    discardStagedImport(dataDir);
    throw new TransferError('That file could not be brought up to date, so it cannot be imported. Your data was not changed.');
  }
  // Opening it wrote to it. Its date is when it was staged.
  const stagedAt = new Date();
  utimesSync(join(dataDir, STAGED_IMPORT_FILE_NAME), stagedAt, stagedAt);
  return summary;
}

export interface DataFolderResult extends OpenResult {
  /** What this launch did with a staged import, or null when there was none. */
  lastImport: ImportOutcome | null;
  /** Things that went wrong on the way, for the log. Never shown to the user as they are. */
  problems: string[];
}

const describe = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Opens the database in the app's data folder at launch. A staged import is put in place first,
 * before anything has the database open, and the user's data is never left without a file that
 * opens under its name:
 *
 * - a swap that an earlier launch left half done (the database gone, its backup there) is undone
 *   first, so the app never starts on a new, empty database while the user's data sits beside it;
 * - a staged file that is too old, or fails its check, is dropped and the database is untouched;
 * - a swap that fails half way puts the old database back (`applyStagedImport`), and if even that
 *   cannot be done the launch fails loudly instead of opening an empty database;
 * - an imported database that will not open is moved aside and the one it replaced is put back.
 *
 * `realNowMs` is the real time, also when the app runs on a test clock: it is compared with the
 * staged file's date on disk.
 */
export function openDataFolder(
  dataDir: string,
  now: IsoInstant,
  options: { realNowMs: number; catalogs?: readonly unknown[]; rename?: (from: string, to: string) => void },
): DataFolderResult {
  const path = join(dataDir, DATABASE_FILE_NAME);
  const problems: string[] = [];
  let lastImport: ImportOutcome | null = null;
  let applied = false;

  if (restoreMissingDatabase(dataDir, options.rename)) {
    problems.push('The database was missing and the backup of an import was there: an import had stopped half way, or the file was removed. The backup was put back.');
    // Told to the user too, unless a staged import below has more to say: data they did not
    // expect to see must never appear without a word.
    lastImport = {
      status: 'rejected',
      reason: 'The data file was missing, so the copy kept from your last import was put back.',
    };
  }

  const age = stagedImportAgeMs(dataDir, options.realNowMs);
  if (age !== null && age > STAGED_IMPORT_MAX_AGE_MS) {
    // The restart it was waiting for never came. Applying it now would replace whatever was
    // logged since, without anyone having asked today.
    discardStagedImport(dataDir);
    lastImport = {
      status: 'rejected',
      reason: 'An import was left waiting for a restart for too long, so it was dropped. Your data was not changed. Choose the file again to import it.',
    };
  } else if (age !== null) {
    try {
      const staged = applyStagedImport(dataDir, options.rename);
      if (staged.status === 'applied') {
        applied = true;
        lastImport = { status: 'applied' };
      } else if (staged.status === 'rejected') {
        lastImport = { status: 'rejected', reason: `${staged.reason} Your data was not changed.` };
      }
    } catch (error) {
      // The old database is back in place. Do not try again at every launch.
      problems.push(`The staged import could not be put in place: ${describe(error)}`);
      // If it is not back in place (putting it back failed too), this puts it back or throws:
      // the launch then fails, which is better than opening a new, empty database over it.
      if (restoreMissingDatabase(dataDir, options.rename)) problems.push('The database was put back from the backup of the import.');
      try {
        discardStagedImport(dataDir);
      } catch (discardError) {
        problems.push(`The staged import could not be removed: ${describe(discardError)}`);
      }
      lastImport = { status: 'rejected', reason: 'The file could not be put in place. Your data was not changed.' };
    }
  }

  const open = (): OpenResult => (options.catalogs ? openDatabase(path, now, options.catalogs) : openDatabase(path, now));
  try {
    return { ...open(), lastImport, problems };
  } catch (error) {
    if (!applied) throw error;
    // It passed every check and still will not open. The data it replaced comes back.
    problems.push(`The imported database could not be opened: ${describe(error)}`);
    const putBack = revertAppliedImport(dataDir);
    return {
      ...open(),
      lastImport: {
        status: 'rejected',
        reason: putBack
          ? 'The imported file could not be opened, so your earlier data was put back.'
          : // There was no database before the import, so there is nothing to put back.
            'The imported file could not be opened, so ParaLeet started without it.',
      },
      problems,
    };
  }
}
