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
| SAN-114 (slice 1) | Lead: M2 shared types (`Mood`, `AccessoryId`) and the accessories part of the bridge | `lead/san-114-m2-contract` (worktree `.claude/worktrees/lead-san-111`) | In review |

## Next

1. Merge the SAN-114 contract slice when its review passes. Workers must not start before it: they all build on its types.
2. Then launch three workers at once:
   - SAN-112 and SAN-113 together on one branch (`worker/san-112-sprite`): the procedural sprite renderer, seed variations, the `Sprite` canvas component and the gallery at `#/gallery`. The egg stage is Para peeking out of a cracked shell; `nibbling` is the Again reward; a separate hatching animation is for first launch.
   - SAN-128 (`worker/san-128-pet-rules`): mood rules, speech lines, accessory unlocks, reminder timing. Pure core.
   - SAN-129 (`worker/san-129-settings`): the Settings screen.
3. Lead, in parallel, SAN-114 slice 2: bridge methods for windows, onboarding and pet events; the floating pet window (transparent, frameless, always on top, never focused, click-through outside the bird, draggable, position remembered, on every desktop); hide the Dock icon when only the pet is showing. A spike on this Mac confirmed Electron 45 supports all of it, and that the menu bar icon can be built from raw sprite pixels with the streak as its title.
4. Then SAN-115 (menu bar icon and compact card), SAN-116 (checking and eating animations, growth, accessory unlocks wired into reporting), SAN-117 (two daily notifications), SAN-118 (launch at login and the first-launch hatching flow). SAN-115 to SAN-118 are still coarse in Linear; detail each when it starts.
5. Then M3 (catalog and learning plans; load the `claude-api` skill before writing the `llm` module) and M4 (stats, export and import, the `.dmg`).

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

## Blockers

None.

## Decisions since last entry

See `docs/decisions/0001` to `0009`. Decided for M2 and still to be written down with SAN-112: the egg stage shows Para in a cracked shell (the PRD has both an egg stage until 3 growth solves and a hatching on first launch), and the four accessories are scarf, bow tie, crown and graduation cap.
