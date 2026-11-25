# 0006. Agents, tools and process choices

Date: 2026-11-25. Status: accepted.

## Context

PRD section 13 defines a lead, Sonnet workers in git worktrees, and a fresh-context reviewer. Some tools the PRD expected were not available when the build started.

## Decision

- `.claude/agents/implementer.md`: model `sonnet`, `isolation: worktree`. One Linear issue per run.
- `.claude/agents/reviewer.md`: model `opus`, read-only tools. It sees the diff, the issue and the PRD, and returns a verdict. A stronger model than the workers is used on purpose: the review is the safety net for their work.
- The lead's own foundation branch went through the same reviewer and gate.
- Branch names: `lead/san-<n>-<slug>` for lead work, `worker/san-<n>-<slug>` for worker issues. Merges to `main` are `--no-ff`, one branch at a time, and the merge commit hash is recorded on the Linear issue.
- **Mobbin** answered "requires a paid plan" on every call. Screens are designed from PRD section 11 and well-known patterns, as section 13 allows, and `docs/design-references.md` says so. Each screen section lists the Mobbin query to run if access appears.
- **Playwright MCP** was not connected. Playwright is used as an npm library, which gives the same screenshots and end-to-end tests and also runs them in the test suite.
- **No git remote** exists, so commits are local and nothing is pushed. Creating a repository on the owner's GitHub account is his call, not the lead's.
- Screenshots go to `artifacts/screenshots/` (not checked in) and are attached to the Linear issue for each UI change.

## Alternatives rejected

- **Creating a private GitHub repository to push to**: an action on the owner's account that he did not ask for.
- **Skipping the reviewer for lead work**: the gate says nothing merges without it.
