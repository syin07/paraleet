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
| SAN-105 | Streak hardening | `worker/san-105-streak` | Review round 2 (round 1 blocked on a test that could not fail) |
| SAN-107 | Assignment policy | `worker/san-107-assignment` | In review |
| SAN-108 | CSES, Codeforces and Other adapters | `worker/san-108-platforms` | Worker running |
| SAN-109 | Today screen and report form | `worker/san-109-today-screen` | Lead checks passed; worker making small fixes, then review |
| SAN-110 | Problems screen and add by URL | `worker/san-110-problems-screen` | Lead checks passed; worker making one visual fix, then review |

## Next

1. Merge each branch above as its gate passes, one at a time, rebasing the next on `main` first. Attach screenshots to the Linear issue for SAN-109 and SAN-110.
2. Lead: SAN-111, wiring the loop end to end. Scope so far:
   - create and update review cards on report; fill `nextReviewInDays` and `nextReviewDay`; read the full card in `listLoggedProblems`
   - connect Today's quick-log to the add dialog; add the "I solved it today" option to the add dialog
   - shared `Modal`: show that the body scrolls (footer border); `Button` and `Input`: accept a `ref`
   - mock bridge: map Codeforces ratings to a difficulty; return plan candidates for swap in one scenario
   - end-to-end tests: raise the expect timeout, start the UI dev server only for the `ui` project, add a review-due and a swap test
   - scheduler follow-ups from review: treat a non-new card with no last review day as damaged; log when a damaged card is rescheduled as new
   - `vite.shared` import needs a file extension for a future Vite default (warning only)
3. Then write detailed M2 issues and continue.

## Done

| Issue | What | Merge commit |
| --- | --- | --- |
| SAN-104 | Foundation: toolchain, modules, database, starter list, bridge, thin Today path, docs, agents | `3fbe795` |
| SAN-106 | FSRS review cards in whole ParaLeet days (`src/core/scheduler.ts`) | `d5c3dc0` |

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

- The end-to-end smoke test failed once when three workers were building at the same time, and passed on rerun. Treat a lone e2e failure under load as a rerun, and fix the timeouts in SAN-111.

- `isRendererUrl` (the bridge's sender check) has only been run against the unpackaged build. Confirm it inside the packaged app in M4, including an install path with unusual characters.
- The renderer bundle is not minified (about 600 kB). Harmless for a local app; revisit at packaging.

## Blockers

None.

## Decisions since last entry

See `docs/decisions/0001` to `0007`.
