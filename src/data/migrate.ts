import type { Db } from './db';
import { MIGRATIONS, type Migration } from './migrations';

export interface MigrationResult {
  from: number;
  to: number;
}

/** Thrown when the database was written by a newer version of the app than this one. */
export class NewerDatabaseError extends Error {
  constructor(
    readonly databaseVersion: number,
    readonly appVersion: number,
  ) {
    super(
      `This database is at schema version ${databaseVersion}, but this copy of ParaLeet only knows version ${appVersion}. Update ParaLeet to open it.`,
    );
    this.name = 'NewerDatabaseError';
  }
}

/**
 * Brings the database up to `target` (default: the latest version). Each migration runs in its
 * own transaction together with the version bump, so a failure leaves the database at the last
 * good version.
 */
export function migrate(
  db: Db,
  migrations: readonly Migration[] = MIGRATIONS,
  target: number = migrations.length,
): MigrationResult {
  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new Error(`Migration "${migration.name}" has version ${migration.version}, expected ${index + 1}`);
    }
  });

  const from = db.userVersion;
  if (from > migrations.length) throw new NewerDatabaseError(from, migrations.length);

  for (const migration of migrations.slice(from, target)) {
    db.transaction(() => {
      db.exec(migration.sql);
      db.userVersion = migration.version;
    });
  }
  return { from, to: db.userVersion };
}
