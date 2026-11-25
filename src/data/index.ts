import catalogCodeforces from '../../seed/catalog-codeforces.json';
import catalogCses from '../../seed/catalog-cses.json';
import catalogLeetcode from '../../seed/catalog-leetcode.json';
import starterSeed from '../../seed/starter.json';
import type { IsoInstant } from '../core/types';
import { Db } from './db';
import { migrate, type MigrationResult } from './migrate';
import { loadCatalogSeed, loadStarterSeed } from './seed';

export { Db } from './db';
export { migrate, NewerDatabaseError } from './migrate';
export { LATEST_SCHEMA_VERSION, MIGRATIONS } from './migrations';
export {
  applyStagedImport,
  DATABASE_FILE_NAME,
  dataDirOf,
  discardStagedImport,
  exportDatabase,
  hasImportBackup,
  hasStagedImport,
  IMPORT_BACKUP_FILE_NAME,
  inspectDatabaseFile,
  STAGED_IMPORT_FILE_NAME,
  samePath,
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
