# ParaLeet status

Last updated: 2026-11-25 (session 2, lead)

## What works today

**Milestones M1 and M2 are complete and merged.** Run `npm install`, then `npm run dev`.

- First launch: an egg hatches, Para says hello, you pick two reminder times. Under a minute.
- Para is a pixel-art parakeet drawn by code. It floats on the desktop in its own see-through window, follows the day (asleep, peckish, hungry, content), says a different line each day, checks and eats when you report a solve, greets you after days away, grows (egg, chick, fledgling, adult) and earns accessories you can put on in Settings.
- Click Para, or the bird in the menu bar, for a small card: today's problem, "Open problem", "I solved it" (the report form opens right in the card), and the streak. The menu bar shows Para's mood and the streak.
- Para picks one problem a day: a due review first, otherwise the next starter problem. "Open problem" opens the browser; "I solved it" records a rating in two clicks.
- Two reminders a day at most (16:00 and 21:00 unless you change them), each naming the problem, none once Para is fed. A click on one opens the card.
- Every reported problem gets a review card (FSRS). A problem rated Again is tomorrow's problem. Up to five other due reviews are listed, never a count. Today's problem can be swapped.
- Any problem can be logged from Today by search or by pasting its link (LeetCode, CSES, Codeforces or another site). The Problems screen lists everything logged, with filters, attempt history, notes, retire and reset.
- The streak holds across the 04:00 boundary, restarts, sleep and time-zone changes. All data is one SQLite file.
- Settings works (reminder times, day start, review schedule, Para on the desktop, launch at login, accessories). Plan and Stats are still placeholders: learning plans (M3) and stats, export, import and the installer (M4) are in progress.

## Notes for the owner

- **Please try Para with a real mouse.** Tests drive the pet window from inside the app, so one thing is unconfirmed by a person: with another app in front, hover Para (a bubble appears), click it (ParaLeet opens), drag it, and click on the empty area around it (the click should reach the window underneath). Run `npm run dev` to try.

- **Mobbin needs a paid plan.** The Mobbin connector answered "requires a paid plan", so screens are designed from PRD section 11 and well-known app patterns, as section 13 allows. `docs/design-references.md` says so at the top. Nothing is blocked.
- **Please click a real reminder once.** Tests click the notification from inside the app. With another app in front, a click on a real "Para is peckish" notification should show the small card and not bring the main window forward. The first notification makes macOS ask for permission.
- **Playwright MCP is not connected** in this session. Playwright is used as an npm library instead (same screenshots and end-to-end tests). Nothing is blocked.

## Current milestone

M3. Catalog and learning plans, with M4 work running beside it. (M2 closed with SAN-118, merge commit `ad369d2`.)

## In flight

Session 2 (2026-11-25). Nothing below is merged yet.

| Issue | What | Branch | State |
| --- | --- | --- | --- |
| SAN-120 to SAN-123 (M3 core) | Lead: plan rules in core, migration 003, plans repository, the `llm` module, plan services, the API key in a sealed file, bridge methods, plain error messages across the bridge, mock plans, decision 0016 | `lead/m3-plan-core` (worktree `.claude/worktrees/lead-m3`) | Type check, lint and 1026 unit tests pass (`b59ead4`). `tests/e2e/plans.spec.ts` is **written but not run yet**. To do, in order: rebase on main; run the UI and end-to-end suites; fresh reviewer; merge. Then workers: SAN-130 (the Plan screen) and SAN-131 ("Learning plans" in Settings); the lead adds the optional API key step to the first-launch flow |
| SAN-124 (M4) | Worker: stats rules in core (`src/core/stats.ts`, `buildStats`), 28 tests | `worker/san-124-stats` at `ecc5ae6` (worktree `.claude/worktrees/agent-ab3ac71efafc0b677`) | Worker done; a fresh reviewer is reading it. Then merge; the lead adds `getStats` (bridge, service, mock); then the same worker builds the Stats screen (step 2) |
| Export and import (M4, issue to create) | Lead: the data layer is done (`src/data/transfer.ts`: `exportDatabase` with `VACUUM INTO`, `inspectDatabaseFile`, an import staged next to the database and swapped in at the next launch, the replaced database kept as `paraleet.sqlite3.before-import`), 18 tests | `lead/san-132-export-import` at `266fcad` (worktree `.claude/worktrees/lead-m4`), stacked on `lead/m3-plan-core` | Still to do: file-dialog and restart ports on the service context, services, bridge methods (`getDataInfo`, `exportData`, `chooseImport`, `applyImport`, `cancelImport`, `showDataInFinder`), apply the staged import at launch in `src/main/index.ts`, mock, end-to-end test, decision 0017. Then a worker adds the "Data" group to Settings |

## Next

1. Merge M3 core (see the table). Never run two end-to-end suites at once on this Mac: test apps take focus from each other.
2. Fan out the M3 screens to workers (SAN-130, SAN-131); the lead adds the API key step to the first-launch flow. Tick the M3 checklist in `docs/PRD.md` when merged. Tell the owner in the final report that the server-side refusal fallback is on (decision 0016, item 11), and that no live call to Anthropic was made by the build.
3. M4: the Stats screen (SAN-124); export and import in Settings; a `.dmg` with electron-builder (this Mac is arm64; build a universal app if the Electron download for x64 works, and sign ad hoc, because an unsigned arm64 app does not start) and a one-page install note for the unsigned-app warning; a log file for failures (`paraleet.log` in the data folder: the launch self-check, bridge failures, tick failures); and in the packaged app confirm `isRendererUrl` (also from a path with unusual characters), the login item and the quiet login start.
4. When everything is merged and the suites pass on main, write DONE at the top of this file with how to run and install.

## Done

| Issue | What | Merge commit |
| --- | --- | --- |
| SAN-104 | Foundation: toolchain, modules, database, starter list, bridge, thin Today path, docs, agents | `3fbe795` |
| SAN-106 | FSRS review cards in whole ParaLeet days (`src/core/scheduler.ts`) | `d5c3dc0` |
| SAN-107 | Full assignment order: overdue review, plan, starter; the 3-day rule; five due reviews at most | `c071371` |
| SAN-105 | Streak hardening: boundary, daylight saving, time zones, clock errors; stored facts checked against a recompute | `59e7aa3` |
| SAN-109 | Today screen and shared report form | `990088f` |
| SAN-110 | Problems screen: table, filters, detail drawer with notes, retire and reset, add by URL | `bce284f` |
| SAN-108 | Platform adapters and link recognition for LeetCode, CSES, Codeforces and Other (lead took it over after three failed reviews) | `398b61e` |
| SAN-127 | Add a problem from Today; "I solved it today" in the add dialog; report form keyboard and focus fixes; scroll hint in tall dialogs | `ef1a667` |
| SAN-111 | The loop wired end to end: review cards on report, launch-time reconcile, end-to-end tests. Closes M1 | `2b2b8b5` |
| SAN-129 | Settings screen: reminder times, day boundary, target retention, pet switches, accessories, LeetCode handle | `b908ee1` |
| SAN-128 | Pet rules in core: mood, speech lines, accessory unlocks, reminder timing | `a3393c2` |
| SAN-114 | The floating pet window (slice 1, shared types, was `44b278d`) | `17bce45` |
| SAN-112 + SAN-113 | Para drawn by code: four stages, eight moods, hatching, accessories, seed traits; the gallery at `#/gallery` | `73ff1b4` |
| SAN-116 | Para comes alive: moods through the day, lines, checking and eating on report, the greeting, accessory unlocks, migration 002 | `63ec870` |
| SAN-119 | The problem catalog: 3,332 LeetCode, 400 CSES and 3,905 Codeforces problems, built by scripts, loaded at launch, found by quick log | `848c2da` |
| SAN-115 (main-process side) | Menu bar icon with mood and streak; the compact card window, its placement and bridge methods | `b803954` |
| SAN-118 (UI side) | The first-launch flow: hatch the egg, meet Para, pick reminder times; the floating pet waits for it. Closes M2 | `ad369d2` |
| SAN-115 (UI side) | The compact card's page: today's problem, the report form in place, a confirmation; a click on Para opens the card; Swap opens the swap choices | `0015ba9` |
| SAN-117 + SAN-118 (main-process side) | Two daily reminders that name the problem and are skipped once fed; launch at login; a quiet login start; `showSwap` | `76ab89a` |

## Linear

- Project: ParaLeet (`P-SAN-2`), team `SAN`. Milestones M1 to M4.
- M1: SAN-104 to SAN-111 and SAN-127, all Done. M2: SAN-112 to SAN-118 plus SAN-128 (pet rules) and SAN-129 (Settings). M3: SAN-119 to SAN-123, SAN-130, SAN-131. M4: SAN-124 to SAN-126 (SAN-126 is the owner's one-week trial).
- Module labels: `core`, `data`, `platforms`, `llm`, `main`, `ui` (group `Module`).
- M2: all Done, with screenshot sheets attached where there is a screen.
- M3: SAN-119 Done; SAN-120 to SAN-123 detailed and In Progress; SAN-130 (Plan screen) and SAN-131 (Settings: key and model) are the worker issues. M4: SAN-124 is now the Stats screen only; export and import gets its own issue; SAN-125 is the installer; SAN-126 is the owner's week.

## How the loop is run in this repo

- Workers: Agent tool with `subagent_type: implementer` (Sonnet, own worktree under `.claude/worktrees/`, based on the lead's current HEAD, so stay on `main` when launching). Branches are named `worker/san-<n>-<slug>`.
- Reviewer: `subagent_type: reviewer` (Opus, read-only). Give it the branch, the issue text with acceptance criteria, and the PRD sections.
- If those agent types are not listed in a new session, use `general-purpose` and tell it to read `.claude/agents/<name>.md` as its role.
- Merge with `git merge --no-ff` on `main`, then record the merge commit on the Linear issue and here.
- A failed gate goes back to the same worker with `SendMessage` to its agent ID (it keeps its context and worktree). A re-review always uses a fresh `reviewer`.
- The lead's shell keeps whatever directory the last command ended in. Run commands for a worktree inside a subshell, `(cd <worktree> && ...)`, and start every command with `cd /Users/sandy/projects/ParaLeet`.
- Worker worktrees are locked while their agent exists: `git worktree unlock <path>` before `git worktree remove --force <path>`, then delete both `worker/...` and `worktree-agent-...` branches.
- UI issues: build one sheet of the final screenshots with `npx tsx scripts/contact-sheet.ts <out.png> "<title>" <worktree>/artifacts/screenshots <prefix>` and attach it to the Linear issue (prepare upload, PUT with curl, create attachment).

## Watch list (not blocking)

- A failed launch self-check (`reconcile`) is only written to the console. A packaged app's user cannot see that. Add a log file in M4.
- `lead/m2-contract` is a leftover work-in-progress branch from session 1 (two commits, not in main, superseded by the SAN-114 merge). It can be deleted once someone has looked at it.
- `scripts/contact-sheet.ts` builds the screenshot sheet for a UI issue; run it from the main checkout now that it is merged.

- The end-to-end smoke test failed once under heavy load before its timeouts were raised in SAN-111. Treat a lone e2e failure under load as a rerun.

- `isRendererUrl` (the bridge's sender check) has only been run against the unpackaged build. Confirm it inside the packaged app in M4, including an install path with unusual characters.
- The renderer bundle is not minified (about 600 kB). Harmless for a local app; revisit at packaging.

- A real desktop screenshot cannot be taken from this session: `screencapture` and the computer-use tools have no screen-recording permission, and the lead does not raise permission prompts on the owner's Mac. The pet window is checked through the real Electron windows instead (window flags, bounds, Dock state, and `capturePage` pixels for see-through corners).
- Reviewers and workers must not run two Playwright runs at once in one worktree; they interfere.
- The sidebar logo and empty states will use a fixed sample seed after SAN-112 merges; wire the pet's own seed in the lead's integration slice.
- Settings worker notes for later: `Field`'s `Input` has no `aria-invalid` and forces `w-full`; `Page` in `Layout.tsx` is capped at 960px with no width option.

## Blockers

None.

## Decisions since last entry

See `docs/decisions/0001` to `0015` (`0012`: wiring the living pet; `0013`: menu bar icon and card; `0014`: the catalog; `0015`: reminders and launch at login). `0010` is the pet window; `0011` is the pet rules (egg stage, accessories, "first Hard", Again unlocks nothing, the night sleep window, how lines avoid repeating).
