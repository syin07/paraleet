# ParaLeet status

Last updated: 2026-11-25 (session 3, lead; in progress. If you are reading this cold, the In flight table is the truth: agents do not survive a cleared session)

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

- **Please try Para with a real mouse.** Tests drive the pet window from inside the app, so one thing is unconfirmed by a person: with another app in front, hover Para (a bubble appears), click it (the small card opens beside it; a second click closes it), drag it, right-click it (a menu), and click on the empty area around it (the click should reach the window underneath). Run `npm run dev` to try.

- **Mobbin needs a paid plan.** The Mobbin connector answered "requires a paid plan", so screens are designed from PRD section 11 and well-known app patterns, as section 13 allows. `docs/design-references.md` says so at the top. Nothing is blocked.
- **Please click a real reminder once.** Tests click the notification from inside the app. With another app in front, a click on a real "Para is peckish" notification should show the small card and not bring the main window forward. The first notification makes macOS ask for permission.
- **Playwright MCP is not connected** in this session. Playwright is used as an npm library instead (same screenshots and end-to-end tests). Nothing is blocked.

## Current milestone

M3. Catalog and learning plans, with M4 work running beside it. (M2 closed with SAN-118, merge commit `ad369d2`.)

## In flight

**Session 3 (2026-11-25).** Merged so far this session: the stats rules (`db6b465`). Only `main` is on the remote; every branch below is local.

| Issue | What | Branch (worktree) | State |
| --- | --- | --- | --- |
| SAN-134 | Lead: "Settings…" right after "Open ParaLeet" left the window on Today (a lost request while the window opens; in main since M2) | `lead/navigate-race` at `c08da91` (`.claude/worktrees/agent-ab3ac71efafc0b677`), off main | 959 unit tests pass; the new end-to-end test failed before the fix and passes after. UI and end-to-end suites running; with a fresh reviewer. **Merge first: the M3 branch is rebased on it** |
| SAN-120 to SAN-123 (M3 core) | Lead: plan rules, migration 003, `llm`, plan services, the sealed API key, bridge methods, plain errors across the bridge | `lead/m3-plan-core` at `7286b10` (`.claude/worktrees/lead-m3`) | Review round 1 **blocked** on one defect: the launch check gave the graduation cap for a plan finished with Again. Fixed in `7286b10` with tests (a finished plan stores `finished_from_attempt`; migration 003 changed, which is allowed because it is not in main). 1056 unit tests pass. **To do: rebase on main after SAN-134 merges; run check, UI and end-to-end; fresh reviewer (round 2); merge** |
| SAN-124, step 2 | Lead: the `getStats` bridge method, service, mock scenarios `stats-year` and `stats-fails`; a day's count is now different problems, not attempts | `lead/san-124-stats-bridge` at `8dce8f6` (`.claude/worktrees/lead-m4`), stacked on M3 core | 1059 unit tests pass. **To do after M3 core merges: rebase, suites, fresh reviewer, merge** |
| SAN-124, step 3 | Worker: the Stats screen | `worker/san-124-stats-screen`, based on `lead/san-124-stats-bridge` `8dce8f6` | Worker running |
| SAN-130 | Worker: the Plan screen | `worker/san-130-plan-screen`, based on `lead/m3-plan-core` `f443f0e` | Worker running |
| SAN-131 | Worker: "Learning plans" in Settings (the key, the model); the same worker gets the "Data" group next | `worker/san-131-settings-plans`, based on `lead/m3-plan-core` `f443f0e` | Worker running |
| SAN-132 | Lead: export and import, data layer only (`src/data/transfer.ts`) | `lead/san-132-export-import` at `3d137c5`, stacked on M3 core `f443f0e`, checked out nowhere | Not ready: services, bridge, main wiring, mock, end-to-end test and decision 0017 are still to do (see Cold start) |

Worker branches sit on lead branches that will be rebased. After a base merges: `git rebase --onto main <old base commit> <worker branch>`, run inside the worktree that has the branch checked out.

Leftovers that are not work in flight: `lead/m2-contract` (superseded; delete after a look), `worktree-agent-ab3ac71efafc0b677` and `worker/san-124-stats` (merged; delete).

## Next

1. Merge SAN-134, then M3 core (round 2 review), then the stats bridge. One end-to-end run at a time on this Mac.
2. As workers report: go down the criteria, look at their screenshots, run the merge gate, fresh reviewer, merge. Rebase each worker branch on main first.
3. The lead adds step 4 of the first-launch flow (the optional API key; design section 10), ticks the M3 checklist in `docs/PRD.md`, and updates `docs/design-references.md` ("as built" notes for Plan, Stats and Settings).
4. Finish SAN-132 (export and import services), then send the Settings worker the "Data" group.
5. SAN-125: the `.dmg`, the install note, the log file, and the checks in the packaged app.
6. When everything is merged and the suites pass on main, write DONE at the top of this file with how to run and install. In the final report tell the owner: the server-side refusal fallback is on for plan generation (decision 0016, item 11); no live call to Anthropic was made by the build; and the hand checks under "Notes for the owner".

## Cold start: what is not written down anywhere else

**Agents do not survive a cleared session.** The stats worker cannot be continued with `SendMessage`. For the Stats screen, brief a new `implementer` and tell it to work on top of main once the rules are merged. A worktree left by an old agent may be locked: `git worktree unlock <path>` before removing it.

**Lessons from this session's reviews.** Five branches went to review; four were blocked in round 1, each time for the same reason: an acceptance criterion in the brief had no test that would fail if it broke (where the card opens after a notification click; the card's failed-load state; a leap day). Before sending a branch to review, go down the criteria in the brief and name the test for each one. The reviewers' non-blocking notes were worth fixing before the merge every time.

**Never `cd` in the lead's shell, and never rebase a branch from the main checkout.** Session 3 learned both the hard way. A bare `cd <worktree>` moves the whole session into that worktree (the harness then treats it as the working directory). Use `git -C <path>` and `npm --prefix <path>`. And `git -C <main checkout> rebase --onto A B <branch>` checks `<branch>` out in the main checkout: run a rebase only inside the worktree that has the branch checked out, and check `git -C /Users/sandy/projects/ParaLeet rev-parse --abbrev-ref HEAD` says `main` before every merge.

**A lone end-to-end failure is not always load.** The one in session 3 (`tray.spec.ts`, "Settings…" after "Open ParaLeet") was a real race in the app (SAN-134). Read the error context before rerunning.

**Check exit codes.** `npm run test:ui 2>&1 | tail -3 && git commit ...` commits past a failing test, because the pipe's exit code is `tail`'s. This happened once this session (caught before the merge). Run each suite to a log file and print `$?`.

**Do not assert heights that depend on how text wraps** in UI tests. The web font may or may not have loaded when the test measures, and a cell's height changed between 74 and 90 points from run to run. Assert positions (same row, same column) instead.

**The Anthropic SDK (1.14), as found by running it.** `messages.parse` throws on an answer that is cut off or is not JSON, so the client calls `messages.create` and reads the text itself. The SDK sends the key as `Authorization: Bearer`, not `x-api-key`; tests accept either. The client takes a `fetch` option, which is how `src/llm/anthropicClient.test.ts` runs without the network. End-to-end runs always get the scripted model (`scriptedModels` in `src/main/index.ts`), with or without `PARALEET_E2E_LLM_ANSWERS`.

**Decided for M4, not yet in the decision log** (write `docs/decisions/0017-stats-and-data.md` on the M4 branch; `src/data/transfer.ts` already points at it):

- Stats. A solve is an attempt rated Hard, Good or Easy. A fed day is a day with any attempt, also one rated Again. The heatmap colors days by attempts (0, 1, 2, 3, 4 or more; the tokens `heat-0` to `heat-4` exist in `src/ui/styles.css`). The weekly bars count solves. Topic coverage counts different problems solved per topic. Weeks start on Monday, in ParaLeet days. Ranges: 12, 26 and 53 weeks. Attempts dated after today count in totals but never light a future day. Streaks are not computed in `buildStats`: the `getStats` service takes them from the pet facts (`displayedStreak` for the current one). The service builds `StatsAttempt` rows from the attempts joined with each problem's topics.
- Export. `VACUUM INTO` a file beside the target, then rename: a complete, compact copy, safe while the app runs. The API key is not in it.
- Import. Check the file (`inspectDatabaseFile`: a real ParaLeet database, not newer than the app, passes SQLite's integrity check), show the user what is in it, then copy it next to the database as `paraleet.sqlite3.import` and restart. At launch, before the database is opened, `applyStagedImport` checks it again and swaps it in; the old database becomes `paraleet.sqlite3.before-import` (one backup is kept). The open database is never replaced while the app runs. Rejected: swapping the connection in place (every holder of the database would need to follow).
- Import, still to build. Ports on the service context: `files.chooseSavePath`, `files.chooseOpenPath`, `files.reveal`, and `restart` (main: `dialog`, `shell.showItemInFolder`, `app.relaunch()` then `app.exit(0)`; in end-to-end runs the paths come from test hooks and restart only quits, and the test launches the app again on the same folder). The UI never passes a file path to main: `chooseImport` remembers the path in `ctx.session` and `applyImport` takes no input. Bridge methods: `getDataInfo`, `exportData`, `chooseImport`, `applyImport`, `cancelImport`, `showDataInFinder`. In `src/main/index.ts`, call `applyStagedImport(userData)` before `openDatabase`, and log a rejected file.
- Log file. `paraleet.log` in the data folder, appended, rotated at about 1 MB to `paraleet.log.old`. It gets the launch self-check's failures, bridge failures (`registerBridge`'s `onFailure` already exists on the M3 branch), failed tick steps and uncaught errors. Never an input, never the key.
- Installer. See SAN-125's notes. This Mac is arm64, macOS 26.6.

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

None. Nothing is waiting on the owner. The M4 line "a week of the owner's own daily use" (SAN-126) is the owner's and starts when he likes; it is easier once the installer exists.

## Decisions since last entry

See `docs/decisions/0001` to `0015` (`0012`: wiring the living pet; `0013`: menu bar icon and card; `0014`: the catalog; `0015`: reminders and launch at login). `0016` (learning plans, the model, the API key, plain errors across the bridge) is written on `lead/m3-plan-core` and arrives with its merge. `0017` (stats, export and import) is still to write: its content is under Cold start. `0010` is the pet window; `0011` is the pet rules (egg stage, accessories, "first Hard", Again unlocks nothing, the night sleep window, how lines avoid repeating).
