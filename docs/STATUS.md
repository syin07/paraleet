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
| SAN-127 | Add a problem from Today; report form keyboard and focus fixes; scroll hint in dialogs | `worker/san-127-today-add-and-form-fixes` | Worker running |
| SAN-111 | Lead: wire the loop end to end | `lead/san-111-daily-loop` (worktree `.claude/worktrees/lead-san-111`) | In progress. Done: review cards created on report, real next-review preview, launch-time reconcile, swap guard and swap-candidate rule, seeds checked with the link recognizer, service tests for every platform, end-to-end review test, Playwright config fixes, decisions 0008 and 0009 |

## Next

1. SAN-127: when the worker returns, run its gate (rebase, three suites, screenshots at both sizes, fresh reviewer), merge, attach the screenshot sheet.
2. SAN-111, after SAN-127 is merged: rebase; add `tests/e2e/problems.spec.ts` (open a logged problem, edit notes, retire and reset, add by URL for LeetCode, Codeforces and another site, add from Today's quick-log, restart and check it all persisted); exercise every M1 checklist line in the running app; run its gate; merge. That closes M1.
3. Then write detailed M2 issues and continue. Planned M2 split: sprite renderer and gallery plus seed variations (core, one worker); pet mood, speech lines, accessory unlocks and reminder decisions (core, new issue); Settings screen (ui, new issue); pet window, menu bar icon and compact card window, notifications, launch at login (lead, main); compact card and first-launch flow screens (ui workers); report animations (ui).

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

## Linear

- Project: ParaLeet (`P-SAN-2`), team `SAN`. Milestones M1 to M4.
- M1: SAN-104 to SAN-111 and SAN-127 (detailed). M2: SAN-112 to SAN-118 (coarse). M3: SAN-119 to SAN-123 (coarse). M4: SAN-124 to SAN-126 (coarse; SAN-126 is the owner's one-week trial).
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

- The end-to-end smoke test failed once when three workers were building at the same time, and passed on rerun. Treat a lone e2e failure under load as a rerun, and fix the timeouts in SAN-111.

- `isRendererUrl` (the bridge's sender check) has only been run against the unpackaged build. Confirm it inside the packaged app in M4, including an install path with unusual characters.
- The renderer bundle is not minified (about 600 kB). Harmless for a local app; revisit at packaging.

## Blockers

None.

## Decisions since last entry

See `docs/decisions/0001` to `0007` on `main`; `0008` (loop wiring) and `0009` (problem links) arrive with the SAN-111 branch.
