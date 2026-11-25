// A thin wrapper over Node's built-in SQLite (`node:sqlite`). One database file holds all user
// data (PRD section 2, hard constraint 2). See docs/decisions/0002-sqlite-node-builtin.md.
import { DatabaseSync, type StatementSync } from 'node:sqlite';

export type SqlValue = null | number | bigint | string | Uint8Array;
export type SqlParams = readonly SqlValue[] | Readonly<Record<string, SqlValue>>;

export interface RunResult {
  changes: number;
  lastInsertRowid: number;
}

export class Db {
  private readonly raw: DatabaseSync;
  private readonly statements = new Map<string, StatementSync>();
  private depth = 0;

  /** Opens (and creates if needed) the database at `path`. Use `:memory:` in tests. */
  constructor(readonly path: string) {
    this.raw = new DatabaseSync(path);
    this.raw.exec('PRAGMA foreign_keys = ON');
    // A rollback journal (not WAL) keeps the database as one file the user can copy to back up.
    this.raw.exec('PRAGMA journal_mode = DELETE');
    this.raw.exec('PRAGMA synchronous = FULL');
  }

  /** Runs one or more statements with no parameters. */
  exec(sql: string): void {
    this.raw.exec(sql);
  }

  run(sql: string, params: SqlParams = []): RunResult {
    const result = this.bind(sql, params, (statement, args) => statement.run(...args));
    return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) };
  }

  get<T>(sql: string, params: SqlParams = []): T | undefined {
    return this.bind(sql, params, (statement, args) => statement.get(...args)) as T | undefined;
  }

  all<T>(sql: string, params: SqlParams = []): T[] {
    return this.bind(sql, params, (statement, args) => statement.all(...args)) as T[];
  }

  /** Runs `work` atomically. Nested calls join the outer transaction through a savepoint. */
  transaction<T>(work: () => T): T {
    const name = `sp_${this.depth}`;
    this.raw.exec(this.depth === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${name}`);
    this.depth += 1;
    try {
      const result = work();
      this.depth -= 1;
      this.raw.exec(this.depth === 0 ? 'COMMIT' : `RELEASE ${name}`);
      return result;
    } catch (error) {
      this.depth -= 1;
      this.raw.exec(this.depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${name}; RELEASE ${name}`);
      throw error;
    }
  }

  get userVersion(): number {
    const row = this.get<{ user_version: number }>('PRAGMA user_version');
    return row?.user_version ?? 0;
  }

  set userVersion(version: number) {
    if (!Number.isInteger(version) || version < 0) throw new Error(`Invalid schema version ${version}`);
    this.raw.exec(`PRAGMA user_version = ${version}`);
  }

  close(): void {
    this.statements.clear();
    this.raw.close();
  }

  private bind<R>(
    sql: string,
    params: SqlParams,
    call: (statement: StatementSync, args: never[]) => R,
  ): R {
    let statement = this.statements.get(sql);
    if (!statement) {
      statement = this.raw.prepare(sql);
      this.statements.set(sql, statement);
    }
    const args = Array.isArray(params) ? params : [params];
    return call(statement, args as never[]);
  }
}

/** Parses a JSON array column, tolerating bad data by returning an empty list. */
export function parseJsonArray(text: string | null | undefined): string[] {
  if (!text) return [];
  try {
    const value: unknown = JSON.parse(text);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}
