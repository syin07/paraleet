# ParaLeet status

Last updated: 2026-11-25 (session 1, lead)

## What works today

**Milestone M1 is complete and merged.** Run `npm install`, then `npm run dev`.

- Para picks one problem a day: a due review first, otherwise the next starter problem. "Open problem" opens the browser; "I solved it" records a rating in two clicks.
- Every reported problem gets a review card (FSRS). A problem rated Again is tomorrow's problem. Up to five other due reviews are listed, never a count. Today's problem can be swapped.
- Any problem can be logged from Today by search or by pasting its link (LeetCode, CSES, Codeforces or another site). The Problems screen lists everything logged, with filters, attempt history, notes, retire and reset.
- The streak holds across the 04:00 boundary, restarts, sleep and time-zone changes. All data is one SQLite file.
- The bird is still a placeholder, and Plan, Stats and Settings are placeholders. That is M2 to M4.

## Notes for the owner

- **Mobbin needs a paid plan.** The Mobbin connector answered "requires a paid plan", so screens are designed from PRD section 11 and well-known app patterns, as section 13 allows. `docs/design-references.md` says so at the top. Nothing is blocked.
- **No git remote.** The repo has no remote, so work is committed locally and not pushed. To back it up: create an empty private repo, then `git remote add origin <url> && git push -u origin main`.
- **Playwright MCP is not connected** in this session. Playwright is used as an npm library instead (same screenshots and end-to-end tests). Nothing is blocked.

## Current milestone

M2. The pet is alive. (M1 closed with SAN-111, merge commit `2b2b8b5`.)

## In flight

| Issue | What | Branch | State |
| --- | --- | --- | --- |
| SAN-114 (slice 2) | Lead: the floating pet window, its bridge methods, hover bubble, right-click menu, Dock hiding | `lead/san-114-pet-window` at `68720b3` (worktree `.claude/worktrees/lead-san-111`) | In review, round 1 |
| SAN-112 + SAN-113 | Worker: procedural sprite, seed traits, `Sprite` component, gallery at `#/gallery` | `worker/san-112-sprite` (worktree `.claude/worktrees/agent-a76a928ef3328cd62`) | Code accepted by the lead; sent back for one art pass (upright posture, small hooked beak, wing and tail apart, moods that differ in silhouette, menu bar head crop). Not yet reviewed |
| SAN-128 | Worker: mood rules, speech lines, accessory unlocks, reminder timing (pure core) | `worker/san-128-pet-rules` at `3857522` (worktree `.claude/worktrees/agent-acaa4f7617470f92f`) | In review, round 2 (round 1 blocked on the fed-sleep window and on Again unlocking streak accessories; both fixed) |
| SAN-129 | Worker: Settings screen | `worker/san-129-settings` at `a11370f` (worktree `.claude/worktrees/agent-a0964102f926a80cc`) | In review, round 2 (round 1 blocked on field widths and missing lower-half screenshots; fixed) |

## Next

1. Gate and merge the four branches above as their reviews pass. At the SAN-129 merge, bring `docs/design-references.md` section 8 in line with what was built (day boundary 00:00 to 08:00, "Show Para on the desktop", text time inputs, stacked accessories row). At the SAN-128 merge, write decision 0011 (pet rules: egg stage and hatching, the four accessories, "first Hard" means the first Hard problem solved, an Again attempt unlocks nothing, a fed Para sleeps 23:00 to 06:00, how lines avoid repeating).
2. Lead, once SAN-128, SAN-112 and SAN-114 are on main: wire the real mood, line and accessories into `petSummary` (`src/main/services/today.ts` has a placeholder mood), unlock accessories inside `submitReport`'s transaction with `unlockedAfterAttempt`, show the real `Sprite` in the pet window and the sidebar with the pet's own seed, and tell windows when the mood changes (short timers for the checking and eating steps, the 30-second tick for the rest). This needs migration 002 for what must be remembered: the day the "missed you" greeting was seen and the day each reminder was sent.
3. Then SAN-115 (menu bar icon from the sprite's head with the streak as its title; the compact card from the pet and the icon, reusing `ReportForm`), SAN-116 (checking and eating animations, growth), SAN-117 (two daily notifications from `dueReminder`, clicking one opens the compact card), SAN-118 (launch at login, only when packaged; the first-launch hatching flow, without forcing people who already use the app through it). Define the bridge for these in one lead slice first, then give the compact card page and the first-launch screens to workers while the lead does the main-process side.
4. Then M3 (catalog and learning plans; load the `claude-api` skill before writing the `llm` module) and M4 (stats, export and import, the `.dmg`).

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

## Linear

- Project: ParaLeet (`P-SAN-2`), team `SAN`. Milestones M1 to M4.
- M1: SAN-104 to SAN-111 and SAN-127, all Done. M2: SAN-112 to SAN-118 plus SAN-128 (pet rules) and SAN-129 (Settings). SAN-112, 113, 128 and 129 are detailed; SAN-114 to SAN-118 are coarse. M3: SAN-119 to SAN-123 (coarse). M4: SAN-124 to SAN-126 (coarse; SAN-126 is the owner's one-week trial).
- Module labels: `core`, `data`, `platforms`, `llm`, `main`, `ui` (group `Module`).
- SAN-114 slice 1 (shared M2 types and the accessories part of the bridge) merged as `44b278d`.

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

See `docs/decisions/0001` to `0009`; `0010` (the pet window) arrives with the SAN-114 merge. Decided for M2 and to be written down as `0011` with the SAN-128 merge: the egg stage shows Para in a cracked shell (the PRD has both an egg stage until 3 growth solves and a hatching on first launch); the four accessories are scarf, bow tie, crown and graduation cap; "first Hard" means the first Hard problem solved, not the first attempt rated Hard; an attempt rated Again unlocks nothing and the next other attempt picks the milestone up; a fed Para sleeps from 23:00 to 06:00 local time whatever the day boundary.
