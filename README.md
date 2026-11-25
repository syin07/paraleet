# ParaLeet

A Mac desktop app that makes daily algorithm practice stick. A pixel-art parakeet named Para gets hungry once a day and is fed only when you solve the problem it picked for you, on LeetCode, CSES or Codeforces.

Everything runs on your Mac. There is no account and no server, and your data is one file you can copy.

The full product spec is in [`docs/PRD.md`](docs/PRD.md). Build progress is in [`docs/STATUS.md`](docs/STATUS.md).

## Run it

You need macOS and Node.js 22.13 or newer (the unit tests use Node's built-in SQLite).

```sh
npm install
npm run dev
```

`npm run dev` opens the app with hot reload. Development runs keep their data in `~/Library/Application Support/ParaLeet-dev/`, apart from an installed copy's data in `~/Library/Application Support/ParaLeet/`.

## Test it

```sh
npm run check      # type check, lint and unit tests
npm run test:ui    # the screens in a browser against a mock of the app; saves screenshots
npm run test:e2e   # builds the app, then drives the real thing end to end
```

- Unit tests live next to the code as `*.test.ts`. Narrow a run with a path: `npm run test:unit -- src/core`.
- UI tests are in `tests/ui/`. They write `artifacts/screenshots/<name>-default.png` (1100×720) and `<name>-min.png` (860×580).
- End-to-end tests are in `tests/e2e/`. Each one starts the app with its own temporary data folder and a fake clock, and never opens your browser.

The first `npm run test:ui` on a machine needs Playwright's browser once: `npx playwright install chromium`.

To put a set of screenshots on one sheet (for attaching to an issue): `npx tsx scripts/contact-sheet.ts sheet.png "Title" artifacts/screenshots today-`.

## Work on the UI without Electron

```sh
npm run dev:ui     # http://localhost:5199
```

This serves the screens in a normal browser against an in-memory mock (`src/ui/mock/mockBridge.ts`). Choose a starting state with `?scenario=` before the `#`:

| URL | State |
| --- | --- |
| `/?scenario=default#/today` | A few weeks in: 4-day streak, not fed, reviews due |
| `/?scenario=fresh#/today` | First launch, nothing logged |
| `/?scenario=fed#/today` | Today's problem already reported |
| `/?scenario=backlog#/today` | More than five reviews due |
| `/?scenario=nothing#/today` | Nothing left to assign |
| `/?scenario=many#/problems` | A long problem history |

The mock's clock is frozen at noon on 2026-11-25 so screenshots are stable.

## Build it

```sh
npm run build      # production bundle in out/
npm run start      # run that bundle
```

## Install it (yours, or a friend's Mac)

```sh
npm run dist        # builds dist/ParaLeet-<version>.dmg (Apple silicon and Intel in one file)
npm run dist:check  # starts the packaged app on a throwaway data folder and checks it
```

Send the `.dmg` and `docs/INSTALL.md`: the note covers the one-time macOS warning for an app that is not signed with a paid certificate. An installed copy keeps its data in `~/Library/Application Support/ParaLeet/` and a log, `paraleet.log`, in the same folder.

## Your data

All data is in one SQLite file, `paraleet.sqlite3`, in the app's data folder (see "Run it"). Copy that file to back it up, or use Settings, Data, "Export", which saves a complete copy wherever you choose. "Import" replaces the data with such a copy: the app shows what is in the file, asks, restarts on the imported data, and keeps what it replaced as `paraleet.sqlite3.before-import` in the same folder. The app stores problem titles, links, tags and your attempts and notes. It never stores problem statements.

## Learning plans and the API key

Everything works without a key except generating a learning plan. A plan needs your own Anthropic API key (from the Claude Console, platform.claude.com), added in Settings. The key is encrypted with the macOS keychain and kept in `anthropic-api-key.bin` next to the database, never inside it. A copy of the database does not carry the key; on another Mac you add the key again.

When you generate a plan, the app sends Anthropic one request: the topics, level and size you chose, and titles, platforms, difficulties and tags of catalog problems to choose from. Nothing else leaves your Mac.

## Environment switches (for tests and debugging)

| Variable | Effect |
| --- | --- |
| `PARALEET_USER_DATA_DIR` | Use this folder for all app data |
| `PARALEET_FAKE_NOW` | Freeze the app's clock at this ISO time, for example `2026-11-25T20:00:00Z` |
| `PARALEET_FAKE_TZ` | With `PARALEET_FAKE_NOW`: the time zone to pretend, for example `Asia/Tokyo` |
| `PARALEET_E2E=1` | Record links and notifications instead of showing them, expose test hooks, and replace Anthropic with a scripted model |
| `PARALEET_E2E_UNHATCHED=1` | With `PARALEET_E2E`: start before Para has hatched, to see the first-launch flow |
| `PARALEET_E2E_AT_LOGIN=1` | With `PARALEET_E2E`: start the way the login item does, with no main window |
| `PARALEET_E2E_LLM_ANSWERS` | With `PARALEET_E2E`: a JSON file of answers for the scripted model, an array of `{ "plan": ... }` or `{ "error": "..." }` used in order. What the model was asked is written to `<file>.calls.json` |

A packaged app ignores every switch except `PARALEET_USER_DATA_DIR`.

## Regenerate the starter list

```sh
npm run seed:starter
```

This fetches metadata for the picks in `scripts/seed/starter-picks.ts` from LeetCode and rewrites `seed/starter.json`. It is a build-time script; the app itself never calls LeetCode.

## Where things are

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the module map and data flow, [`docs/decisions/`](docs/decisions/) for the reasons behind technical choices, and [`CLAUDE.md`](CLAUDE.md) for the rules agents follow in this repo.
