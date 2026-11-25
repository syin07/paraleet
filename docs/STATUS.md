# ParaLeet status

Last updated: 2026-11-25 (session 1, lead)

## What works today

Run `npm install`, then `npm run dev`. The app opens, shows today's problem from a 32-problem starter list, opens it in the browser, and records "I solved it" with a rating. The solve, the streak and the fed day survive a restart, and the day rolls over at 04:00.

## Notes for the owner

- **Mobbin needs a paid plan.** The Mobbin connector answered "requires a paid plan", so screens are designed from PRD section 11 and well-known app patterns, as section 13 allows. `docs/design-references.md` says so at the top. Nothing is blocked.
- **No git remote.** The repo has no remote, so work is committed locally and not pushed. To back it up: create an empty private repo, then `git remote add origin <url> && git push -u origin main`.
- **Playwright MCP is not connected** in this session. Playwright is used as an npm library instead (same screenshots and end-to-end tests). Nothing is blocked.

## Current milestone

M1. The loop works.

## In flight

| Issue | What | Branch | State |
| --- | --- | --- | --- |
| SAN-106 | FSRS review cards (`src/core/scheduler.ts`) | `worker/san-106-scheduler` | Worker running |
| SAN-109 | Today screen and report form | `worker/san-109-today-screen` | Worker running |
| SAN-110 | Problems screen and add by URL | `worker/san-110-problems-screen` | Worker running |

## Next

1. As each worker returns: run the merge gate (rebase on main, `npm run check`, `npm run test:ui`, `npm run test:e2e`, exercise in the app, fresh `reviewer`), merge one at a time, attach screenshots to the Linear issue for UI work.
2. Start the remaining M1 workers as slots free up (3 at most): SAN-105 (streak hardening), SAN-107 (assignment policy), SAN-108 (CSES, Codeforces and Other adapters).
3. Lead: SAN-111, wiring the loop end to end. It creates review cards on report, fills `nextReviewInDays` and `nextReviewDay`, reads the full card in `listLoggedProblems`, connects quick-log to the add dialog and adds the "I solved it today" option there, and adds end-to-end tests. It closes M1.
4. Then write detailed M2 issues and continue.

## Done

| Issue | What | Merge commit |
| --- | --- | --- |
| SAN-104 | Foundation: toolchain, modules, database, starter list, bridge, thin Today path, docs, agents | `3fbe795` |

## Linear

- Project: ParaLeet (`P-SAN-2`), team `SAN`. Milestones M1 to M4.
- M1: SAN-104 to SAN-111 (detailed). M2: SAN-112 to SAN-118 (coarse). M3: SAN-119 to SAN-123 (coarse). M4: SAN-124 to SAN-126 (coarse; SAN-126 is the owner's one-week trial).
- Module labels: `core`, `data`, `platforms`, `llm`, `main`, `ui` (group `Module`).

## How the loop is run in this repo

- Workers: Agent tool with `subagent_type: implementer` (Sonnet, own worktree under `.claude/worktrees/`, based on the lead's current HEAD, so stay on `main` when launching). Branches are named `worker/san-<n>-<slug>`.
- Reviewer: `subagent_type: reviewer` (Opus, read-only). Give it the branch, the issue text with acceptance criteria, and the PRD sections.
- If those agent types are not listed in a new session, use `general-purpose` and tell it to read `.claude/agents/<name>.md` as its role.
- Merge with `git merge --no-ff` on `main`, then record the merge commit on the Linear issue and here.

## Watch list (not blocking)

- `isRendererUrl` (the bridge's sender check) has only been run against the unpackaged build. Confirm it inside the packaged app in M4, including an install path with unusual characters.
- The renderer bundle is not minified (about 600 kB). Harmless for a local app; revisit at packaging.

## Blockers

None.

## Decisions since last entry

See `docs/decisions/0001` to `0006`.
