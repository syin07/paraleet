# 0005. The starter list

Date: 2026-11-25. Status: accepted.

## Context

The daily loop needs something to assign before any plan exists: about 30 well-known easy and medium problems (PRD section 8). Seed data must come from fetched sources, never from memory.

## Decision

- `scripts/seed/starter-picks.ts` holds only the ordered picks: 32 LeetCode slugs, easy first, covering the core topics.
- `npm run seed:starter` fetches each pick's number, title, difficulty and tags from LeetCode's GraphQL endpoint and writes `seed/starter.json`. It fails if a slug does not exist, is paid-only, is Hard, or maps to no topic.
- `validateSeedProblems` checks that IDs and links are well-formed, canonical and unique. The build script and a unit test over the checked-in file both run it.
- The app loads the file on every launch (`loadStarterSeed`). It is idempotent: existing rows keep their IDs, and a problem the user added by hand is never overwritten.
- The starter list is LeetCode only for now. CSES and Codeforces problems enter with the full catalog in M3; the starter list can be widened then.
- Topic IDs are a fixed list of 25 in `src/core/topics.ts`. Difficulty normalizes to 1 to 5: LeetCode Easy 1, Medium 3, Hard 5.

## Alternatives rejected

- **Typing the list by hand with titles and numbers**: the PRD forbids it, and one wrong slug is a dead link on day one.
- **Calling LeetCode at runtime**: forbidden by the PRD; the endpoint is unofficial.

## Consequences

- When the starter list runs out and no review or plan problem is available, nothing is assigned and Today says so. Any logged attempt still feeds the pet.
