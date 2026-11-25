import starterSeed from '../../seed/starter.json';
import type { IsoInstant } from '../core/types';
import { Db } from './db';
import { migrate, type MigrationResult } from './migrate';
import { loadStarterSeed } from './seed';

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
    return { db, migration };
  } catch (error) {
    db.close();
    throw error;
  }
}
