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

export const DATABASE_FILE_NAME = 'paraleet.sqlite3';

export interface OpenResult {
  db: Db;
  migration: MigrationResult;
}

/** Opens the database at `path`, brings its schema up to date and loads the built-in seeds. */
export function openDatabase(path: string, now: IsoInstant): OpenResult {
  const db = new Db(path);
  try {
    const migration = migrate(db);
    loadStarterSeed(db, starterSeed, now);
    // Cheap on a normal launch: each file is skipped after one query unless it is newer.
    for (const catalog of [catalogLeetcode, catalogCses, catalogCodeforces]) loadCatalogSeed(db, catalog, now);
    return { db, migration };
  } catch (error) {
    db.close();
    throw error;
  }
}
