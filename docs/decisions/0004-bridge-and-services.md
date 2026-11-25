# 0004. The typed bridge and the Electron-free service layer

Date: 2026-11-25. Status: accepted.

## Context

The UI must never touch the database or the network (PRD section 9), workers need a stable interface to build screens against, and the daily-loop logic that joins core and data needs fast tests.

## Decision

- One contract in `src/bridge/`: `channels.ts` lists method names (no imports, so the sandboxed preload stays tiny) and `contract.ts` gives each method a zod input schema and a TypeScript output type. A `satisfies` check keeps the two in step.
- The preload exposes `window.paraleet` with one async function per method plus `onChanged(listener)`. It forwards and does nothing else.
- Main validates every input with its zod schema before a service sees it.
- Main answers a call only when it comes from the main frame of one of its own windows and that frame is showing the app's own page.
- The UI never hands main a URL to open. `openProblem` and `openSolutionLink` take a problem ID, and main opens the link stored for it, http and https only. Windows refuse every navigation and every `window.open`.
- The test switches (`PARALEET_E2E`, `PARALEET_FAKE_NOW`, the dev-server URL) are ignored by a packaged app. `PARALEET_USER_DATA_DIR` still works there, so a packaged build can be tried without touching real data.
- Expected failures (text that is not a link, an unsupported site) come back as `{ ok: false, reason }`. Thrown errors are for bugs.
- The use cases live in `src/main/services/` and take an `AppContext` (database, clock, and callbacks for side effects such as opening a link). Nothing there imports Electron, enforced by lint, so they are unit-tested with an in-memory SQLite database and a fake clock.
- Main pushes one coarse event, `paraleet:changed`, after any write and on day rollover. Screens refetch what they show. No fine-grained cache.
- The UI in a plain browser installs `src/ui/mock/mockBridge.ts`, an in-memory implementation of the same contract with named scenarios, used for fast screen work and Playwright UI tests.
- Module boundaries are enforced by ESLint `no-restricted-imports`, not by convention.

## Alternatives rejected

- **A generic `invoke(channel, payload)` on the window**: any channel becomes reachable from the renderer.
- **tRPC or a similar IPC library**: a dependency for about twenty methods.
- **Validating outputs too**: main is trusted; the cost is not worth it.

## Consequences

- Adding a bridge method touches four files: `channels.ts`, `contract.ts`, `services/index.ts`, `mockBridge.ts`. The compiler flags any that is missed.
