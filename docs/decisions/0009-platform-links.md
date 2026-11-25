# 0009. Recognizing problem links

Date: 2026-11-25. Status: accepted. Issue: SAN-108.

## Context

The user adds a problem by pasting its link (PRD section 8). The link decides the problem's identity: platform plus platform ID. If two spellings of one link gave two identities, the same problem would be stored twice with two review cards.

## Decision

- One adapter per platform in `src/platforms/` behind `PlatformAdapter`: LeetCode (ID is the slug), CSES (task number), Codeforces (contest number plus index, such as `1352C`; gym contests from 100000 use the gym link) and Other (ID is the cleaned-up link). No adapter makes a network call, and none implements `verify` in v1.
- `recognizeUrl(text)` is the only entry point for pasted text. It accepts `http` and `https` only, adds `https://` to scheme-less text that looks like an address, tries the three real platforms first and "Other" last, and refuses a page on a real platform's own site that is not a problem page.
- **Recognition is a fixed point by construction.** A result is returned only if its ID is valid for its adapter and recognizing its canonical link gives the very same result. Anything else is rejected as "not a link". Three review rounds found three different families of odd hosts that broke "one identity per problem" (a trailing dot, several dots, numeric hosts that stop being IP addresses when dots are added). Checking the property itself replaced chasing cases.
- "Other" cleaning: lower-case scheme and host; trailing dots on the host, credentials, tracking parameters (`utm_*`, `fbclid`, `gclid`, `ref`), trailing slashes and ordinary fragments are dropped; a leading `www.`, a non-default port, the rest of the query (in order) and a route fragment starting `#/` or `#!` are kept. `www.` stays because the cleaned link is the one the app later opens, and some sites only answer there.
- Difficulty normalizes to 1 to 5: LeetCode Easy 1, Medium 3, Hard 5; Codeforces ratings in bands (up to 1000, 1400, 1800, 2200, above); CSES has none. Unknown text gives null, including words like `constructor`.
- Tags map onto the fixed topic list in `src/core/topics.ts`. A tag with no clear home stays unmapped. CSES tags are its section names.
- Seed files are checked with the same `recognizeUrl`, so a seed can never hold a link the app would identify differently.

## Alternatives rejected

- **A regular expression per site in the UI**: the rules would exist twice and drift.
- **Normalizing every odd host to something usable**: the list of oddities the URL parser accepts is long; refusing an unstable link is simpler and safe.
- **Dropping `www.` for "Other"**: fewer duplicates, but dead links on sites that need it.

## Consequences

- A property test builds about 4,900 mutated links (dots, case, ports, credentials, slashes, queries, fragments, leading zeros, missing scheme) and checks the invariants on each.
- Adding a platform means one new adapter file and one line in the registry.
