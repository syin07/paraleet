# ParaLeet status

Last updated: 2026-11-25 (session 1, lead)

## Notes for the owner

- **Mobbin needs a paid plan.** The Mobbin connector answered "requires a paid plan", so screens are designed from PRD section 11 and well-known app patterns, as section 13 allows. `docs/design-references.md` says so at the top. Nothing is blocked.
- **No git remote.** The repo has no remote, so work is committed locally and not pushed. To back it up: create an empty private repo, then `git remote add origin <url> && git push -u origin main`.
- **Playwright MCP is not connected** in this session. Playwright is used as an npm library instead (same screenshots and end-to-end tests). Nothing is blocked.

## Current milestone

M1. The loop works.

## In flight

| Issue | What | Branch | State |
| --- | --- | --- | --- |
| SAN-104 | Foundation: app launches, thin path persists a solve | `lead/san-104-foundation` | In progress (lead) |

## Next

After SAN-104 merges, fan out up to 3 workers at a time over SAN-105 (streak), SAN-106 (FSRS review cards), SAN-107 (assignment policy), SAN-108 (platform adapters), SAN-109 (Today screen), SAN-110 (Problems screen). Then the lead does SAN-111 (wire the loop end to end), which closes M1.

## Linear

- Project: ParaLeet (`P-SAN-2`), team `SAN`. Milestones M1 to M4.
- M1: SAN-104 to SAN-111 (detailed). M2: SAN-112 to SAN-118 (coarse). M3: SAN-119 to SAN-123 (coarse). M4: SAN-124 to SAN-126 (coarse; SAN-126 is the owner's one-week trial).
- Module labels: `core`, `data`, `platforms`, `llm`, `main`, `ui` (group `Module`).

## Blockers

None.

## Decisions since last entry

See `docs/decisions/`.
