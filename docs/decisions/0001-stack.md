# 0001. Stack and tooling

Date: 2026-11-25. Status: accepted.

## Context

PRD section 9 recommends Electron, TypeScript, React with Vite and SQLite, and leaves the specifics to the lead.

## Decision

| Need | Choice |
| --- | --- |
| App shell | Electron 45 |
| Build | `electron-vite` 6 (one config for main, preload and renderer) on Vite 8 |
| Language | TypeScript 6.0, strict, with `noUncheckedIndexedAccess` |
| UI | React 19, Tailwind CSS 4, `lucide-react` icons |
| Storage | Node's built-in `node:sqlite` (see 0002) |
| Scheduling | `ts-fsrs` 6 |
| Validation | `zod` 4 |
| Unit tests | `vitest` 5 |
| UI and end-to-end tests | `@playwright/test` (Chromium for the UI against a mock; Electron for the real app) |
| Lint | ESLint 10 with `typescript-eslint`; module boundaries enforced with `no-restricted-imports` |
| Package manager | npm (already on the machine; no extra tool) |

Third-party code is bundled into the main process (`externalizeDeps: false`), so the packaged app carries no `node_modules`.

## Alternatives rejected

- **TypeScript 7** (the current `latest`): `typescript-eslint` supports TypeScript below 6.1 only. Revisit when it supports 7.
- **Electron Forge**: fine, but `electron-vite` plus `electron-builder` is the smaller setup and both are widely documented.
- **Plain CSS or CSS modules**: fewer dependencies, but parallel worker agents drift apart without a shared utility vocabulary. Tailwind with its default palette cleared leaves only ParaLeet's tokens available.
- **A router, a state library, a data-fetching library**: not needed. Five screens switch on the URL hash, and `useBridgeQuery` refetches on the app's change event.
- **A component-test stack (jsdom, Testing Library)**: the UI is tested in a real browser with Playwright against the mock bridge instead, which also produces the screenshots section 13 asks for.
- **Tauri, native Swift**: rejected in the PRD; nothing found that changes that.

## Consequences

- No native modules, so there is no rebuild step and a universal `.dmg` stays simple.
- `npm run check` is the single pre-commit gate.
