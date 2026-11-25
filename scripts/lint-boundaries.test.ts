// Checks that the lint rules in eslint.config.js really enforce the module boundaries from
// docs/ARCHITECTURE.md. Each case lints a small snippet as if it were a file in a module.
import { resolve } from 'node:path';
import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const BOUNDARY_RULES = ['no-restricted-imports', 'no-restricted-globals', 'no-restricted-syntax'];

let eslint: ESLint;
beforeAll(() => {
  eslint = new ESLint({ cwd: ROOT });
});

/** The boundary rule violations for `code` linted as `file`. */
async function violations(file: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: resolve(ROOT, file) });
  return (result?.messages ?? [])
    .filter((message) => message.ruleId !== null && BOUNDARY_RULES.includes(message.ruleId))
    .map((message) => message.message);
}

async function expectBanned(file: string, code: string): Promise<void> {
  expect(await violations(file, code), `${file}: ${code}`).not.toEqual([]);
}

async function expectAllowed(file: string, code: string): Promise<void> {
  expect(await violations(file, code), `${file}: ${code}`).toEqual([]);
}

describe('core is pure', () => {
  const file = 'src/core/probe.ts';

  it.each([
    "import { Db } from '../data';",
    "import { Db } from '../data/db';",
    "import { openDatabase } from '../data/index';",
    "import { recognizeUrl } from '../platforms';",
    "import type { TodayView } from '../bridge/contract';",
    "import { createHandlers } from '../main/services';",
    "import { app } from 'electron';",
    "import { DatabaseSync } from 'node:sqlite';",
    "import { readFileSync } from 'fs';",
    "import { request } from 'undici';",
    "import axios from 'axios';",
    "export const x = await import('../data');",
  ])('rejects %s', async (code) => {
    await expectBanned(file, code);
  });

  it.each([
    'export const now = new Date();',
    'export const now = Date.now();',
    'export const roll = Math.random();',
    "export const page = fetch('https://example.com');",
    "export const page = globalThis.fetch('https://example.com');",
    'export const env = process.env.HOME;',
    'export const store = window.localStorage;',
  ])('rejects %s', async (code) => {
    await expectBanned(file, code);
  });

  it.each([
    "import { z } from 'zod';",
    "import { fsrs } from 'ts-fsrs';",
    "import { paraDayOf } from './day';",
    "import type { ParaDay } from './types';",
    "export const then = new Date('2026-11-25T20:00:00Z');",
  ])('allows %s', async (code) => {
    await expectAllowed(file, code);
  });

  it('lets core tests import the test runner and nothing else new', async () => {
    await expectAllowed('src/core/day.test.ts', "import { expect, it } from 'vitest';");
    await expectBanned('src/core/day.test.ts', "import { Db } from '../data';");
    await expectBanned('src/core/day.test.ts', 'export const now = Date.now();');
    await expectBanned('src/core/day.ts', "import { expect } from 'vitest';");
  });

  it('applies to nested core files too', async () => {
    await expectBanned('src/core/sprite/render.ts', "import { Db } from '../../data';");
    await expectAllowed('src/core/sprite/render.ts', "import type { GrowthStage } from '../types';");
  });
});

describe('ui reaches the app only through the bridge', () => {
  const file = 'src/ui/screens/today/Probe.tsx';

  it.each([
    "import { Db } from '../../../data';",
    "import { getPet } from '../../../data/repos/pet';",
    "import { createHandlers } from '../../../main/services';",
    "import { recognizeUrl } from '../../../platforms';",
    "import { ipcRenderer } from 'electron';",
    "import { readFileSync } from 'node:fs';",
    "import { join } from 'path';",
  ])('rejects %s', async (code) => {
    await expectBanned(file, code);
  });

  it.each([
    "import type { TodayView } from '../../../bridge/contract';",
    "import { RATINGS } from '../../../core/types';",
    "import { Button } from '../../components/Button';",
    "import { api } from '../../bridge';",
    "import { useState } from 'react';",
  ])('allows %s', async (code) => {
    await expectAllowed(file, code);
  });
});

describe('the other modules', () => {
  it('platforms may import only core', async () => {
    await expectBanned('src/platforms/probe.ts', "import { Db } from '../data';");
    await expectBanned('src/platforms/probe.ts', "import { request } from 'undici';");
    await expectBanned('src/platforms/probe.ts', "import { net } from 'electron';");
    await expectAllowed('src/platforms/probe.ts', "import type { Platform } from '../core/types';");
  });

  it('data may import core and platforms, never Electron, main or ui', async () => {
    await expectBanned('src/data/probe.ts', "import { app } from 'electron';");
    await expectBanned('src/data/probe.ts', "import { systemClock } from '../main/clock';");
    await expectBanned('src/data/repos/probe.ts', "import { api } from '../../ui/bridge';");
    await expectAllowed('src/data/repos/probe.ts', "import { adapterFor } from '../../platforms';");
    await expectAllowed('src/data/probe.ts', "import { DatabaseSync } from 'node:sqlite';");
  });

  it('llm may import only core', async () => {
    await expectBanned('src/llm/probe.ts', "import { Db } from '../data';");
    await expectBanned('src/llm/probe.ts', "import { safeStorage } from 'electron';");
    await expectAllowed('src/llm/probe.ts', "import type { Problem } from '../core/types';");
  });

  it('bridge may import only core and zod', async () => {
    await expectBanned('src/bridge/probe.ts', "import { recognizeUrl } from '../platforms';");
    await expectBanned('src/bridge/probe.ts', "import { ipcMain } from 'electron';");
    await expectAllowed('src/bridge/probe.ts', "import { z } from 'zod';");
    await expectAllowed('src/bridge/probe.ts', "import type { Rating } from '../core/types';");
  });

  it('services stay free of Electron and window code', async () => {
    await expectBanned('src/main/services/probe.ts', "import { shell } from 'electron';");
    await expectBanned('src/main/services/probe.ts', "import { createMainWindow } from '../windows/mainWindow';");
    await expectAllowed('src/main/services/probe.ts', "import { getPet } from '../../data/repos/pet';");
  });

  it('main never imports the UI', async () => {
    await expectBanned('src/main/index.ts', "import { App } from '../ui/App';");
    await expectAllowed('src/main/index.ts', "import { app } from 'electron';");
  });

  it('the preload imports only Electron and the channel list', async () => {
    await expectBanned('src/preload/index.ts', "import { getPet } from '../data/repos/pet';");
    await expectBanned('src/preload/index.ts', "import { z } from 'zod';");
    await expectAllowed('src/preload/index.ts', "import { BRIDGE_METHODS } from '../bridge/channels';");
  });
});
