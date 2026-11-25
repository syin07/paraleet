export interface Migration {
  /** 1, 2, 3, ... with no gaps. Stored in SQLite's `user_version` once applied. */
  version: number;
  name: string;
  /** Statements that take the schema from `version - 1` to `version`. Never edit a shipped migration. */
  sql: string;
}
