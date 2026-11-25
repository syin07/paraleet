# ParaLeet status

Last updated: 2026-11-25 (session 2, lead)

## What works today

**Milestone M1 is complete and merged, and most of M2.** Run `npm install`, then `npm run dev`.

- Para is a pixel-art parakeet drawn by code. It floats on the desktop in its own see-through window, follows the day (asleep, peckish, hungry, content), says a different line each day, checks and eats when you report a solve, greets you after days away, grows (egg, chick, fledgling, adult) and earns accessories you can put on in Settings.

- Para picks one problem a day: a due review first, otherwise the next starter problem. "Open problem" opens the browser; "I solved it" records a rating in two clicks.
- Every reported problem gets a review card (FSRS). A problem rated Again is tomorrow's problem. Up to five other due reviews are listed, never a count. Today's problem can be swapped.
- Any problem can be logged from Today by search or by pasting its link (LeetCode, CSES, Codeforces or another site). The Problems screen lists everything logged, with filters, attempt history, notes, retire and reset.
- The streak holds across the 04:00 boundary, restarts, sleep and time-zone changes. All data is one SQLite file.
- Settings works (reminder times, day start, review schedule, Para on the desktop, launch at login, accessories). Plan and Stats are still placeholders (M3 and M4). The menu bar icon, the compact card, notifications and the first-launch flow are in progress.

## Notes for the owner

- **Please try Para with a real mouse.** Tests drive the pet window from inside the app, so one thing is unconfirmed by a person: with another app in front, hover Para (a bubble appears), click it (ParaLeet opens), drag it, and click on the empty area around it (the click should reach the window underneath). Run `npm run dev` to try.

- **Mobbin needs a paid plan.** The Mobbin connector answered "requires a paid plan", so screens are designed from PRD section 11 and well-known app patterns, as section 13 allows. `docs/design-references.md` says so at the top. Nothing is blocked.
- **Please click a real reminder once.** Tests click the notification from inside the app. With another app in front, a click on a real "Para is peckish" notification should show the small card and not bring the main window forward. The first notification makes macOS ask for permission.
- **Playwright MCP is not connected** in this session. Playwright is used as an npm library instead (same screenshots and end-to-end tests). Nothing is blocked.

## Current milestone

M2. The pet is alive. (M1 closed with SAN-111, merge commit `2b2b8b5`.)

## In flight

Session 2 (2026-11-25) picked up after the usage limit. Reminders and launch at login are merged (`76ab89a`), and the compact card's page (`0015ba9`).

| Issue | What | Branch | State |
| --- | --- | --- | --- |
| SAN-118 (UI side) | First-launch screens (hatch, meet Para, reminder times) | `worker/san-118-onboarding` (worktree `.claude/worktrees/agent-aeeaa52179a1ba71c`) | **Review passed.** The reviewer's notes are fixed on the branch. Rebased on main; the three suites are running. Then merge, and M2 is complete |
| SAN-120 to SAN-123 (M3) | Lead: plan rules in core, migration 003, plans repository, the `llm` module, plan services, API key in a sealed file, bridge methods, mock plans | `lead/m3-plan-core` (worktree `.claude/worktrees/lead-m3`), based on old main `b803954` | Rebased on main at `76ab89a`; type check, lint and 1026 unit tests pass (`b59ead4`). Done on the branch: the model client reads answers itself and is tested against a fake network; plain error messages across the bridge (`dispatch`, `unwrapReply`); an end-to-end test with a scripted model (`tests/e2e/plans.spec.ts`, **written but not run yet**); decision 0016; architecture and README. To do, in order: rebase on main once the first-launch screens are merged; run the UI and end-to-end suites; fresh reviewer; merge. Then workers: SAN-130 (the Plan screen) and SAN-131 ("Learning plans" in Settings); the lead adds the optional API key step to the first-launch flow |

## Next

1. Merge the first-launch screens (rebase on main, run all three suites). Never run two end-to-end suites at once on this Mac: test apps take focus from each other.
2. Then M2 is complete: tick the M2 checklist in `docs/PRD.md` section 12, set SAN-115, SAN-117 and SAN-118 to Done in Linear with merge commits and screenshot sheets (card states; first-launch steps), remove the merged worktrees.
3. Finish M3 on `lead/m3-plan-core` as described in the table. Model notes from the `claude-api` skill (loaded 2026-11-25): default model `claude-opus-5-5`; structured output through `client.beta.messages.parse` with `betaZodOutputFormat`; the request opts into the server-side refusal fallback (`betas: ['server-side-fallback-2026-07-01']`, `fallbacks: 'default'`) and retries the plain way on a 400, so a retired beta flag cannot break plan generation; no `thinking`, `temperature` or `tool_choice` is sent. Tell the owner in the final report that the fallback is on. Still to build for M3: the Plan screen, the key and model in Settings, the daily loop already draws from the active plan (`activePlanQueue`), the graduation cap (`countFinishedPlans`), an optional in-app Codeforces refresh. Tick the M3 checklist when merged.
4. M4: Stats screen (solves per week, topic coverage, a heatmap of fed days, longest streak; needs a `getStats` bridge method), export and import of the database file from Settings, a `.dmg` with electron-builder and a one-page install note for the unsigned-app warning, a log file for launch self-check failures, and in the packaged app confirm `isRendererUrl`, the login item and the quiet login start.
5. When everything is merged and the suites pass on main, write DONE at the top of this file with how to run and install.

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
| SAN-115 (UI side) | The compact card's page: today's problem, the report form in place, a confirmation; a click on Para opens the card; Swap opens the swap choices | `0015ba9` |
| SAN-117 + SAN-118 (main-process side) | Two daily reminders that name the problem and are skipped once fed; launch at login; a quiet login start; `showSwap` | `76ab89a` |

## Linear

- Project: ParaLeet (`P-SAN-2`), team `SAN`. Milestones M1 to M4.
- M1: SAN-104 to SAN-111 and SAN-127, all Done. M2: SAN-112 to SAN-118 plus SAN-128 (pet rules) and SAN-129 (Settings). SAN-112, 113, 128 and 129 are detailed; SAN-114 to SAN-118 are coarse. M3: SAN-119 to SAN-123 (coarse). M4: SAN-124 to SAN-126 (coarse; SAN-126 is the owner's one-week trial).
- Module labels: `core`, `data`, `platforms`, `llm`, `main`, `ui` (group `Module`).
- M2 so far: SAN-112, SAN-113, SAN-114, SAN-116, SAN-128 and SAN-129 are Done with screenshots attached where there is a screen. SAN-115, SAN-117 and SAN-118 remain.

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
