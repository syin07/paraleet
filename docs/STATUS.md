DONE

# ParaLeet status

Last updated: 2026-11-25 (end of session 4). Milestones M1 to M4 are built and merged, except the one line that is the owner's: a week of his own daily use (SAN-126). No agent and no test run is in flight. On main: type check and lint clean, 1155 unit, 319 UI and 29 end-to-end tests pass.

## How to run it and how to install it

- **Run from the code:** `npm install`, then `npm run dev`. Data for this is kept apart, in `~/Library/Application Support/ParaLeet-dev`.
- **Build the installer:** `npm run dist`. It writes `dist/ParaLeet-0.1.0.dmg` (about 221 MB), one file for Apple silicon and Intel Macs. One built from main at the end of session 4 is already there. `npm run dist:check` starts the packaged app and checks it (19 checks).
- **Install it** (your own Mac, or a friend's): open the `.dmg`, drag ParaLeet to Applications, and follow `docs/INSTALL.md` for the one-time macOS warning. The installed app keeps its data in `~/Library/Application Support/ParaLeet`.
- **Main is not pushed.** `git push origin main` was refused by this session's permission rules, and the lead does not work around a refusal. Main is ahead of `origin/main`; run `git push origin main` yourself.

## What works today

- First launch: an egg hatches, Para says hello, you pick two reminder times, and you can add an Anthropic API key or skip that. Under a minute.
- Para is a pixel-art parakeet drawn by code. It floats on the desktop in its own see-through window, follows the day (asleep, peckish, hungry, content), says a different line each day, checks and eats when you report a solve, greets you after days away, grows (egg, chick, fledgling, adult) and earns accessories you can put on in Settings.
- Click Para, or the bird in the menu bar, for a small card: today's problem, "Open problem", "I solved it" (the report form opens right in the card), and the streak. The menu bar shows Para's mood and the streak.
- Para picks one problem a day: a due review first, then the next problem of your active plan, otherwise the next starter problem. "Open problem" opens the browser; "I solved it" records a rating in two clicks.
- Two reminders a day at most (16:00 and 21:00 unless you change them), each naming the problem, none once Para is fed. A click on one opens the card.
- Every reported problem gets a review card (FSRS). A problem rated Again is tomorrow's problem. Up to five other due reviews are listed, never a count. Today's problem can be swapped.
- Any problem can be logged from Today by search or by pasting its link (LeetCode, CSES, Codeforces or another site). The Problems screen lists everything logged, with filters, attempt history, notes, retire and reset.
- **Plan:** with an API key saved, pick one to four topics, platforms, a level and a size, and Para asks Claude for a staged plan made only of problems in the built-in catalog. Review the draft (remove, move up and down, swap), activate it, and follow progress by topic, stage and pattern group. Without a key the screen says what plans need; everything else works.
- **Stats:** current and longest streak, total solves, reviews done, a calendar of fed days, solves per week and topic coverage, for 12 weeks, 6 months or 1 year.
- **Settings:** reminder times, day start, review schedule, Para on the desktop, launch at login, accessories, the API key and model for plans, and **Data**: "Export…" saves a complete copy of your data as one file; "Import…" shows what is in a file next to what is in the app and asks before replacing; the data an import replaces is kept as `paraleet.sqlite3.before-import`; "Show in Finder" shows where the database is.
- The streak holds across the 04:00 boundary, restarts, sleep and time-zone changes. All data is one SQLite file.
- An installed copy writes `paraleet.log` next to the database (one line per launch, warnings and failures, never the API key), so a friend can send it when something goes wrong.

## Notes for the owner

- **Your week (SAN-126).** The last M4 line is a week of your own daily use. Install from the `.dmg` and use it; anything that week turns up becomes a Linear issue.
- **Hand checks nobody but a person can do.** (1) With another app in front, hover Para (a bubble), click it (the small card opens; a second click closes it), drag it, right-click it (a menu), and click the empty area around it (the click should reach the window underneath). (2) Click a real "Para is peckish" notification: the small card should show, and the main window should not come forward. The first notification makes macOS ask for permission. (3) Open the app from the `.dmg` on a Mac that has never seen it, ideally an Intel Mac too: the Intel half was only started under Rosetta here. (4) Log out and in once: only Para and the menu bar icon should appear, and the login item should still be there.
- **No live call to Anthropic was made by the build.** Plan generation is tested against a scripted model and saved answers. The first real plan you generate is the first real call. The server-side refusal fallback is on for plan generation (decision 0016, item 11).
- **The packaged-app check and your login items.** In session 3, `npm run dist:check` switched a real "ParaLeet" login item on and off again on this Mac. Since session 4 the check uses a copy of the app with its own identifier (`app.paraleet.mac.packaged-check`), so it cannot touch the login item of a real install, and it switches its own off before it ends. If System Settings, General, Login Items ever shows a stray "ParaLeet" entry while the app is not installed, remove it.
- **A worker once left a preview server running** (session 3, pid 45616; it later said it stopped it). Session 4 left no process running.
- **Mobbin needs a paid plan**, so screens were designed from PRD section 11 and well-known app patterns, as section 13 allows. `docs/design-references.md` says so at the top. **Playwright MCP was not connected**; Playwright is used as an npm library instead. Neither blocked anything.
- **Two small things were filed, not built** (neither is on the M1 to M4 checklist): SAN-136 (an imported file that makes the app quit while it opens should be undone at the next launch; no data is at risk) and SAN-137 (the sidebar logo and empty states show a sample bird, not your own Para).

## Current milestone

M1 to M4 are complete except SAN-126, the owner's week. The PRD checklist in section 12 is ticked to match.

## In flight

Nothing. No worker, reviewer or test run is in flight. The only worktree is the main checkout, and the only branches are `main` and `lead/m2-contract` (two superseded work-in-progress commits from session 1, not in main; it can be deleted after a look).

Merged in session 4, all through the gate: `8863c92`, `acb4ec8`, `a0f41f7`, `6e67562`, `bd47257`, `5086c9f` (see Done).

## Next

1. The owner's week (SAN-126). Fix what it turns up, each as its own Linear issue through the gate.
2. Then, if wanted: SAN-136 and SAN-137.
3. Nothing on the PRD's "Later" list is started until the owner asks for it.

## Cold start: what is not written down anywhere else

**Agents do not survive a cleared session.** A worker from an earlier session cannot be continued with `SendMessage`: brief a new `implementer`, tell it which branch to start from (`git checkout -b <new> <existing branch>`), and give it the reviewer's findings word for word. A worktree left by an old agent may be locked: `git worktree unlock <path>` before removing it.

**What the reviews of sessions 3 and 4 taught.** Most blocked rounds had the same cause: an acceptance criterion with no test that would fail if it broke, or a test that could not fail (a key press that never reaches a dialog because focus has left it; a file that the test itself created; a junk journal that SQLite deletes by itself). Before sending a branch to review, go down the criteria and name the test for each, and for each new test break the code once and see it fail. The reviewers' non-blocking notes were worth fixing before the merge every time. Give a reviewer the claims and the criteria, never the conclusion.

**Stack branches instead of rebasing after every merge.** When several branches are ready, rebase each onto the one that merges before it and run the suites on each stacked tip. Merging them in order with `--no-ff` then gives main exactly the trees that were tested, and no branch needs a second full run.

**Never `cd` in the lead's shell, and never rebase a branch from the main checkout.** A bare `cd <worktree>` moves the whole session into that worktree. Use `git -C <path>` and `npm --prefix <path>`, or a subshell `(cd <path> && ...)`. Run a rebase only inside the worktree that has the branch checked out, and check `git -C /Users/sandy/projects/ParaLeet rev-parse --abbrev-ref HEAD` says `main` before every merge.

**A lone end-to-end failure is not always load. Read the error first.** Session 3's (`tray.spec.ts`, "Settings…" after "Open ParaLeet") was a real race in the app (SAN-134). Session 4's (`tray.spec.ts`, `hideCard`) was a race in the test: the card closes itself a moment after it answers, so the test driver can lose the page before it hears back. Both were fixed, not rerun.

**Read the numbers before writing them, and check exit codes.** A merge message in session 3 had test counts guessed ahead of the log. And `npm run test:ui 2>&1 | tail -3 && git commit ...` commits past a failing test, because the pipe's exit code is `tail`'s. Run each suite to a log file, print `$?`, then print the counts.

**One Playwright run at a time in one worktree; several worktrees at once are fine** for UI runs (each has its own port). End-to-end runs are kept to one at a time on the whole Mac. A worker that waits "until no Playwright is running anywhere" waits forever while the lead runs suites: tell workers not to wait for other worktrees.

**Do not assert heights that depend on how text wraps** in UI tests. Assert positions (same row, same column) instead.

**The Anthropic SDK (1.14), as found by running it.** `messages.parse` throws on an answer that is cut off or is not JSON, so the client calls `messages.create` and reads the text itself. The SDK sends the key as `Authorization: Bearer`, not `x-api-key`; tests accept either. The client takes a `fetch` option, which is how `src/llm/anthropicClient.test.ts` runs without the network. End-to-end runs always get the scripted model (`scriptedModels` in `src/main/index.ts`), with or without `PARALEET_E2E_LLM_ANSWERS`.

**Packaging, as found by running it.** This Mac is arm64, macOS 26.6. `npm run dist` builds a universal app signed ad hoc (`identity: "-"`); nothing of `electron-builder` ships. The Intel half takes 35 to 75 seconds to start under Rosetta the first time; `dist:check` waits a minute. A copy of the app can be given its own identifier with `plutil` and signed again with `codesign --force --deep --sign -`, and it still starts. `start()` in `src/main/index.ts` runs inside a promise, so a throw from it is a rejection, not an uncaught exception: it is caught where `start` is called (`startFailed`).

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
| SAN-124 (step 1) | The stats rules in core | `db6b465` |
| SAN-134 | "Settings…" right after "Open ParaLeet" no longer leaves the window on Today | `89c87ab` |
| SAN-120 to SAN-123 (M3 core) | Learning plans in the main process: generation with one retry, drafts, activation, the daily loop drawing from the plan; the API key sealed with the keychain; plain error messages across the bridge | `ea88274` |
| SAN-124 (step 2) | The `getStats` bridge method | `a03c90e` |
| SAN-131 | Settings, "Learning plans": add, test and remove the API key; choose the model | `aa94c95` |
| SAN-124 (step 3) | The Stats screen | `f69fc27` |
| SAN-135 | An empty model answer is said at once; clearer words for a request Anthropic does not accept | `ce82f0e` |
| SAN-132 (main-process side) | Export and import of all data as one file: the copy, the checks, the launch-time swap with a backup, six bridge methods | `8863c92` |
| SAN-130 | The Plan screen: pick topics, generate, review and edit a draft, activate, follow progress | `acb4ec8` |
| SAN-123 (first-launch step) | The optional fourth step of the first launch: add an Anthropic API key. Closes SAN-123 | `a0f41f7` |
| SAN-132 (UI side) | Settings, "Data": Export, Import with a confirm dialog, what the last restart did, Show in Finder. Closes SAN-132 | `6e67562` |
| Lead's M3 and M4 slice | Two real-app tests through the Plan screen and through Settings, Data; as-built notes for Plan and Stats | `bd47257` |
| SAN-125 | The `.dmg`, the app icon, `paraleet.log`, a failed start that quits, `npm run dist:check`, `docs/INSTALL.md`. Closes M4 except the owner's week | `5086c9f` |

## Linear

- Project: ParaLeet (`P-SAN-2`), team `SAN`. Milestones M1 to M4. Module labels: `core`, `data`, `platforms`, `llm`, `main`, `ui` (one per issue: they are one label group).
- M1, M2 and M3: all Done.
- M4: SAN-124 (Stats), SAN-132 (export and import), SAN-134 and SAN-125 (installer) Done. SAN-126 is the owner's week and is the only open milestone issue.
- Backlog, no milestone: SAN-136 and SAN-137.
- Screenshot sheets are attached to SAN-124, SAN-130, SAN-131, SAN-132 and SAN-123.

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

- `lead/m2-contract` is a leftover work-in-progress branch from session 1 (two commits, not in main, superseded by the SAN-114 merge). It can be deleted once someone has looked at it.
- The renderer bundle is not minified (about 600 kB). Harmless for a local app.
- A real desktop screenshot cannot be taken from a session: `screencapture` and the computer-use tools have no screen-recording permission, and the lead does not raise permission prompts on the owner's Mac. Windows are checked through the real Electron windows instead (window flags, bounds, Dock state, and `capturePage` pixels), and screens through Playwright screenshots of the real app (`artifacts/screenshots/e2e-*.png`).
- The sidebar logo and the empty states use a fixed sample bird (SAN-137).
- Settings notes for later: `Field`'s `Input` has no `aria-invalid` and forces `w-full`; `Page` in `Layout.tsx` is capped at 960px with no width option. The shared `Modal` always shows its close icon, also where a dialog cannot be closed (it then does nothing).
- The Electron switch that lets the app binary run as plain Node is left on in the packaged app (decision 0018, Limits). Hardening for later.
- First launch, step 3: if the small "Skip" is pressed before the app knows whether a key can be stored, and the finish then fails, the dots can change from three to four. Nothing is lost.

## Blockers

Nothing blocks the build. One thing waits on the owner: `git push origin main`, which this session was not allowed to run. And the one open line of M4 is the owner's week (SAN-126).

## Decisions since last entry

In main: `docs/decisions/0001` to `0018`. `0017` is stats, and export and import (item 12 holds the rare cases the reviews hardened: an import that stopped half way is undone at the next launch, a journal left by a crash cannot reach a staged file, a failed import is kept as `paraleet.sqlite3.import-failed`, and Settings is told when a backup was put back). `0018` is the installer, the log file, a failed start, and the packaged-app check with its own identifier.

As-built notes are in `docs/design-references.md` for Plan (section 6), Stats (7), Settings and its Data group (8) and the first-launch flow (10).
