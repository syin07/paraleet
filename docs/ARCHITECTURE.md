# ParaLeet architecture

A local-first Mac desktop app with no server. One Electron process owns the data; the UI is a React page that talks to it through a small typed bridge.

Keep this file accurate at the end of every session (PRD section 2).

## Processes

```
┌──────────────────────── Electron main process (Node) ────────────────────────┐
│  src/main/index.ts        app lifecycle, single-instance lock, timers, Dock    │
│  src/main/windows/*       main window, floating pet window, window placement   │
│  src/main/bridge.ts       one IPC handler per bridge method, zod-validated     │
│  src/main/services/*      use cases: today, report, problems, settings         │
│        │                  (no Electron imports; unit-tested with real SQLite)  │
│        ├── src/core       pure rules: day, streak, assignment, scheduler, pet  │
│        ├── src/platforms  URL recognition, tag and difficulty mapping          │
│        └── src/data       node:sqlite, migrations, seed loading, repositories  │
│                                   │                                            │
│                                   ▼                                            │
│                 ~/Library/Application Support/ParaLeet/paraleet.sqlite3        │
└───────────────────────────────────┬────────────────────────────────────────────┘
                                    │ IPC: "paraleet:<method>" (invoke), "paraleet:changed" (event)
┌───────────────────────────────────┴────────────────────────────────────────────┐
│  src/preload/index.ts     exposes window.paraleet (sandboxed, context-isolated) │
│  src/ui/*                 React screens; window.paraleet is their only door     │
└──────────────────────────────────────────────────────────────────────────────────┘
```

There are two windows, both loading the same renderer bundle:

- **The main window** (`windows/mainWindow.ts`): the sidebar and screens. Closing it leaves the app running.
- **The pet window** (`windows/petWindow.ts`, route `#/pet`, UI in `src/ui/windows/pet/`): 240×280, transparent, frameless, always on top, on every desktop, never focused. Clicks pass through except over the bird. `PetWindowController.sync()` makes it match the `petVisible` setting and the "hide for 1 hour" timer; it runs on launch, on every data change, on the 30-second tick and when displays change. `windows/placement.ts` is the pure geometry that keeps the bird on a visible screen. See decision 0010.

**Para's state.** `services/pet.ts` builds the pet summary every screen shows: stage, mood, line and accessories. Mood and line are computed on each read from the clock, the settings, the stored streak facts and `ctx.session` (what the app remembers only while running: the celebration after the last report). Main tells the windows to redraw when the mood changes: a short timer for each step of a celebration (`nextCelebrationStep`) and a comparison on the 30-second tick (`createMoodWatcher`). See decision 0012.

Services never import Electron. When a use case needs a window to do something it calls `ctx.windows` (`WindowPort` in `services/context.ts`), which main implements and tests fake.

## Modules

| Module | Holds | Notes |
| --- | --- | --- |
| `src/core` | `types.ts`, `topics.ts`, `day.ts`, `streak.ts`, `petFacts.ts`, `scheduler.ts`, `assignment.ts`, `verify.ts`, `settings.ts` | Pure. Time and time zone are arguments. Lint blocks Electron, Node built-ins, the network, `new Date()`, `Date.now()` and `Math.random()`. |
| `src/platforms` | `types.ts` (`PlatformAdapter`), one file per platform, `index.ts` (`recognizeUrl`, `adapterFor`) | LeetCode, CSES, Codeforces and Other. No network in v1. |
| `src/data` | `db.ts` (wrapper over `node:sqlite`), `migrations/`, `migrate.ts`, `seedFormat.ts`, `seed.ts`, `repos/*`, `index.ts` (`openDatabase`) | Hand-written SQL, no ORM. JSON arrays are stored as text. |
| `src/llm` | Empty until M3 | Plan generation, main process only. |
| `src/bridge` | `channels.ts` (method names, no imports), `contract.ts` (zod input schemas, output types, `ParaLeetApi`, `BridgeHandlers`) | The single contract shared by main, preload and UI. |
| `src/main` | `index.ts`, `bridge.ts`, `clock.ts`, `windows/mainWindow.ts`, `services/` | `services/` builds the bridge handlers from an `AppContext` (database, clock, side-effect callbacks). |
| `src/preload` | `index.ts` | Forwards calls; nothing else. Built as CommonJS because sandboxed preloads require it. |
| `src/ui` | `App.tsx` (shell and sidebar), `screens/<name>/`, `components/` (shared), `lib/`, `mock/mockBridge.ts`, `styles.css` (theme tokens) | Tailwind CSS v4 with the default palette cleared, so only ParaLeet tokens exist. |

## Data flow: the daily loop

1. **A day starts.** `createDayWatcher` (in `services/index.ts`) recomputes the ParaLeet day from the clock every 30 seconds and when the Mac wakes or unlocks. When the day or the time zone changes it sends `paraleet:changed`, and every window refetches.
2. **Today is requested.** `getToday` reads one consistent moment (`currentMoment`: clock, settings, pet, today), reads the assignment policy's input from the database, and calls `chooseDailyProblem` (core) the first time a day is seen. The choice is saved in `daily_assignments` and stays for the whole day.
3. **The user opens the problem.** `openProblem` looks the link up in the database and opens it in the default browser. The UI never supplies a URL to open.
4. **The user reports.** `submitReport` caps the rating if the key insight was revealed, calls `verifyAttempt` (the verification seam; v1 trusts the self-report), then in one transaction: saves the key insight, appends the attempt, creates or reschedules the problem's review card (`scheduleFirstAttempt` or `scheduleReview`), updates the pet facts with `applyAttempt`, and marks today's assignment completed if it was that problem. Then it sends `paraleet:changed`.
5. **The next day.** Cards whose due day has arrived are read by `readAssignmentInput`; `chooseDailyProblem` gives the slot to the most overdue one, and `otherDueReviews` lists up to five more. The user may swap to one of `swapCandidates`.
6. **Derived values are never stored.** Fed status, displayed streak, growth stage and (later) mood are computed from stored facts and the current time.

At launch, before any window opens, `reconcile()` (`services/reconcile.ts`) recomputes the streak and totals from the attempts and rebuilds any missing review cards, so the stored derived data can never drift from the attempts for long. See decision 0008.

## Time

- A ParaLeet day runs from the boundary hour (default 04:00, a setting) to the same hour the next day, in the user's local time. It is written as the local calendar date it started on (`YYYY-MM-DD`).
- Timestamps are stored in UTC. Each attempt also stores its ParaLeet day as computed when it was made.
- `main/clock.ts` is the only source of time. The system time zone is read from macOS on every call (`/etc/localtime`), because a long-running process can hold a stale zone after travel.
- `effectiveToday` keeps the app's day from stepping back behind the last fed day after a move to an earlier time zone.

## Database

One file, `paraleet.sqlite3`, opened with a rollback journal (not WAL) so the database is always a single file. The schema version is SQLite's `user_version`. `migrate()` applies each pending migration in its own transaction and refuses a database written by a newer app.

| Table | Holds |
| --- | --- |
| `problems` | Catalog entries and user-added problems; `starter_position` orders the built-in starter list; `solved_count` says how well known a catalog problem is |
| `attempts` | Every reported attempt. Append-only, enforced by triggers. The source of truth |
| `problem_notes` | Key insight, pattern tags, free notes, link to the user's solution |
| `review_cards` | One card per attempted problem: status, due time, scheduler state as JSON |
| `daily_assignments` | One row per ParaLeet day: the problem, why it was picked, whether it was completed |
| `pet` | The single pet: seed, growth solves, totals, streak, last fed day, accessories, when it hatched, the day the "missed you" greeting was seen, the day each reminder was sent |
| `catalog_sources` | Which catalog file is loaded for each platform, so a newer file loads once (used from M3) |
| `settings` | Key-value settings as JSON, plus `meta.*` keys for internal state |

Migration 2 added the pet's greeting and reminder days and the catalog bookkeeping. Plan tables arrive with M3 as migration 3.

## The bridge

- `src/bridge/channels.ts` lists the method names. `src/bridge/contract.ts` gives each an input schema and an output type.
- Main validates every input with zod and accepts calls only from the main frame of the app's own windows.
- The UI gets `window.paraleet` with one async function per method, `onChanged(listener)` and `onNavigate(listener)`. Main sends `paraleet:navigate` with a path such as `/settings` to move the main window to a screen.
- Window commands (`showMainWindow`, `movePetWindowBy`, `endPetDrag`, `setPetInteractive`, `showPetMenu`) are ordinary bridge methods whose handlers call `ctx.windows`.
- In a plain browser there is no preload, so `src/ui/main.tsx` installs `src/ui/mock/mockBridge.ts`, an in-memory implementation of the same contract with named scenarios.

## Security posture

- Renderer: `sandbox: true`, `contextIsolation: true`, no Node integration, a strict Content-Security-Policy in production builds, navigation and new windows blocked.
- The renderer never touches the database, the file system or the network.
- Only `http` and `https` links stored in the database are ever opened externally, and only by ID (`openProblem`, `openSolutionLink`). The renderer cannot open a window or pass a URL to open.
- The bridge answers only the main frame of the app's own windows while it shows the app's own page.
- Test switches are ignored by a packaged app (see decision 0004).

## Build and packaging

- `electron-vite` builds three bundles into `out/`: `main/index.js` (ESM), `preload/index.cjs`, `renderer/`.
- Third-party code is bundled into main, so a packaged app needs no `node_modules`. There are no native modules.
- Packaging to a `.dmg` arrives in M4.

## Tests

| Kind | Where | What |
| --- | --- | --- |
| Unit | `src/**/*.test.ts`, `scripts/**/*.test.ts` (vitest) | core rules with injected time; migrations from every earlier version; seed validity; services against in-memory SQLite; the lint boundary rules themselves (`scripts/lint-boundaries.test.ts`) |
| UI | `tests/ui/*.spec.ts` (Playwright, Chromium) | Screens against the mock bridge; screenshots at default and minimum window sizes |
| End to end | `tests/e2e/*.spec.ts` (Playwright, Electron) | The built app with a temp data folder and a fake clock: report, restart, day rollover, a due review taking the slot, swap, quick-log |
