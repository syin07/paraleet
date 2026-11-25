# ParaLeet status

Last updated: 2026-11-25 (session 3 stopped at a usage limit, mid-run. NOT done. No agent is running; the In flight table is the truth)

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

**Session 3 (2026-11-25) stopped at a usage limit.** Merged this session, all through the gate: the stats rules (`db6b465`), SAN-134 the lost "Settings…" request (`89c87ab`), the M3 core SAN-120 to SAN-123 (`ea88274`), the `getStats` bridge (`a03c90e`), SAN-131 "Learning plans" in Settings (`aa94c95`), the Stats screen (`f69fc27`) and SAN-135 plan polish (`ce82f0e`). So the app now has a working Stats screen and the API key and model rows in Settings. Main is pushed up to this file's commit.

Correction: the merge message of `f69fc27` gives wrong test counts. The real ones on that branch were 1075 unit, 222 UI and 22 end-to-end, all passing.

No worker or reviewer is running. Every branch below is local, with its work committed.

| Issue | What | Branch (worktree) | State and what to do |
| --- | --- | --- | --- |
| SAN-130 | The Plan screen | `worker/san-130-plan-screen` at `5c1b457` (`.claude/worktrees/agent-a5a3d15bdbcd7d43f`), based on old M3 `f443f0e` | Review round 2 **passed** at `3cc7b40`; `5c1b457` then fixed the reviewer's four small notes (worker reports 1062 unit and 225 UI tests passing). To do: `git rebase --onto main f443f0e` inside its worktree, `npm ci`, check, UI and end-to-end suites, a fresh reviewer for `3cc7b40..5c1b457`, merge |
| SAN-132 | Export and import, main-process side | `lead/san-132-export-import` at `863d7ff` (`.claude/worktrees/lead-m4`), on main `f69fc27` | Round 1 **blocked** (a file could pass the check, be swapped in and then not open). Fixed in `863d7ff` (`stageCheckedImport`, `openDataFolder`); 1113 unit tests pass. The round 2 reviewer was stopped before it answered, and a background run of check, UI and end-to-end was in progress when the session stopped (results, if it finished, are not recorded: run them again). To do: rebase on main, suites (the new third test in `tests/e2e/data.spec.ts` has never been run), fresh reviewer (round 2), merge. Then the "Data" group in Settings (mock scenarios `data-*` exist; tell the UI to say that an import replaces the earlier backup) |
| SAN-123 (rest) | Step 4 of the first-launch flow: the optional API key | `worker/san-123-onboarding-key` at `919690b` (`.claude/worktrees/agent-ac3dbc0838ba8d3b5`), on main `ea88274` | Worker reports 1057 unit and 198 UI tests passing. Its reviewer was stopped before it answered. Its edits to `tests/e2e/onboarding.spec.ts` have never been run. To do: rebase on main, suites, fresh reviewer, merge |
| SAN-125 | The `.dmg`, the icon, `paraleet.log`, `npm run dist:check`, `docs/INSTALL.md`, decision 0018 | `lead/san-125-installer` at `23f0e2f` (`.claude/worktrees/agent-ab3ac71efafc0b677`), based on old M3 `e72f6de` | `npm run dist` builds `dist/ParaLeet-0.1.0.dmg` (universal, ad hoc signed, about 220 MB); `npm run dist:check` passed 14 of 14 on the packaged app. Not reviewed. To do: rebase on main (after SAN-132, then send `openDataFolder`'s problems to the log in `src/main/index.ts`); start the Intel half once under Rosetta with 40 seconds and no suite running (12 seconds was not enough to see it start); suites; reviewer; merge |

After those: tick M3 and M4 in `docs/PRD.md`; "as built" notes in `docs/design-references.md` (Plan, Stats, Settings, first-launch flow; tooltips use the raised surface, the topic column is 132px); screenshot sheets on Linear for SAN-130, SAN-131 (built at session end, not uploaded), SAN-132 and the onboarding step (SAN-124's is attached); mark SAN-131 and SAN-135 Done in Linear with their merge commits and comment SAN-124; a real-app walk through Plan, Stats and Settings by the lead; `npm ci` in the main checkout, then all suites on main; DONE.

Leftovers that are not work in flight: merged branches and `worktree-agent-*` branches can be deleted; `lead/m2-contract` after a look. The lead's shell ended inside `.claude/worktrees/lead-m3` (branch `lead/plan-polish`, merged).

## Next

1. Set the goal again, read this file, then finish the four rows above in this order: SAN-132, SAN-130, the onboarding step, SAN-125. One end-to-end run at a time.
2. Then the "Data" group worker, the docs and Linear items listed above, the suites on main, and DONE at the top of this file with how to run and install.
3. In the final report tell the owner: the server-side refusal fallback is on for plan generation (decision 0016, item 11); no live call to Anthropic was made by the build; the packaged-app check switched a real login item on and off again; a worker once left a preview server running (pid 45616; it later said it stopped it); and the hand checks under "Notes for the owner".

## Cold start: what is not written down anywhere else

**Agents do not survive a cleared session.** The stats worker cannot be continued with `SendMessage`. For the Stats screen, brief a new `implementer` and tell it to work on top of main once the rules are merged. A worktree left by an old agent may be locked: `git worktree unlock <path>` before removing it.

**Lessons from this session's reviews.** Five branches went to review; four were blocked in round 1, each time for the same reason: an acceptance criterion in the brief had no test that would fail if it broke (where the card opens after a notification click; the card's failed-load state; a leap day). Before sending a branch to review, go down the criteria in the brief and name the test for each one. The reviewers' non-blocking notes were worth fixing before the merge every time.

**Never `cd` in the lead's shell, and never rebase a branch from the main checkout.** Session 3 learned both the hard way. A bare `cd <worktree>` moves the whole session into that worktree (the harness then treats it as the working directory). Use `git -C <path>` and `npm --prefix <path>`. And `git -C <main checkout> rebase --onto A B <branch>` checks `<branch>` out in the main checkout: run a rebase only inside the worktree that has the branch checked out, and check `git -C /Users/sandy/projects/ParaLeet rev-parse --abbrev-ref HEAD` says `main` before every merge.

**A lone end-to-end failure is not always load.** The one in session 3 (`tray.spec.ts`, "Settings…" after "Open ParaLeet") was a real race in the app (SAN-134). Read the error context before rerunning.

**Read the numbers before writing them.** A merge message in session 3 was written with test counts guessed ahead of the log, and they were wrong. Print the counts, then write the message.

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
