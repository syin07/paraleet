# 0002. SQLite through `node:sqlite`, one file, no ORM

Date: 2026-11-25. Status: accepted.

## Context

All user data must live in one local database file the user can back up by copying (PRD section 2). The usual Electron choice, `better-sqlite3`, is a native module: it must be rebuilt for Electron's ABI, and the same binary cannot serve both the app and the unit tests running under system Node.

## Decision

- Use Node's built-in `node:sqlite` (`DatabaseSync`). Verified working in Electron 45 (Node 24.22, SQLite 3.54) and in system Node 26.
- Wrap it in a small class, `src/data/db.ts`, with `run`, `get`, `all`, `transaction` (nested through savepoints) and `userVersion`.
- Hand-written SQL in `src/data/repos/`. No ORM and no query builder.
- Schema changes are numbered migrations in `src/data/migrations/`, tracked with SQLite's `user_version`, each applied in its own transaction. A database from a newer app version is refused, never modified.
- Journal mode is the default rollback journal, not WAL, with `synchronous = FULL`. WAL keeps `-wal` and `-shm` files beside the database, which breaks "back up by copying one file".
- `attempts` is append-only, enforced by triggers.
- Development and test runs use their own data folders (`ParaLeet-dev`, or `PARALEET_USER_DATA_DIR`), so they can never touch the installed app's data.
- If the database cannot be opened, the app shows an error and quits. It never repairs, replaces or deletes the file on its own.

## Alternatives rejected

- **better-sqlite3**: native rebuilds, ABI mismatches between tests and app, and no prebuilt binaries yet for the newest Node.
- **An ORM (Drizzle, Prisma)**: more dependencies and generated code for nine small tables.
- **WAL mode**: faster concurrent writes, which a single-user app does not need.

## Consequences

- Unit tests run against real SQLite in memory, in milliseconds, with no mocking of the database.
- If `node:sqlite` ever blocks something, only `src/data/db.ts` changes.
