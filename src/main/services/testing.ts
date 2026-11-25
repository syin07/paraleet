// Test helpers for the use-case layer: a real in-memory database, a fake clock and spies for
// everything that would otherwise reach the outside world.
import type { BridgeHandlers } from '../../bridge/contract';
import { openDatabase, type Db } from '../../data';
import type { LlmAnswer, LlmTurn } from '../../llm/planGenerator';
import { FakeClock } from '../clock';
import { newSession, type Notice } from './context';
import { createHandlers, type AppContext } from './index';

export interface TestApp {
  ctx: AppContext;
  db: Db;
  clock: FakeClock;
  handlers: BridgeHandlers;
  /** Links the app tried to open in the browser. */
  openedUrls: string[];
  /** What the services asked of the windows, in order. */
  windowCalls: string[];
  /** Notifications the app showed, in order. */
  notices: Notice[];
  /** The stored API key, and whether this "Mac" can encrypt one. */
  secrets: { available: boolean; key: string | null };
  /** The answers the test model will give, in order. Push before calling `generatePlan`. */
  modelAnswers: (LlmAnswer | Error)[];
  /** What the test model was asked. */
  modelCalls: { apiKey: string; model: string; turns: LlmTurn[] }[];
  /** What listing the models answers: the IDs, or an error to throw. */
  setModelList(next: string[] | Error): void;
  /** How many times the app told its windows that something changed. */
  changes: () => number;
  close(): void;
}

export const TEST_ZONE = 'America/Los_Angeles';

/** Local noon in Los Angeles on the given day (UTC-8 in winter). */
export function noonLA(day: string): string {
  return `${day}T20:00:00.000Z`;
}

export function createTestApp(options: { now?: string; timeZone?: string; path?: string } = {}): TestApp {
  const clock = new FakeClock(options.now ?? noonLA('2026-11-25'), options.timeZone ?? TEST_ZONE);
  const { db } = openDatabase(options.path ?? ':memory:', clock.now().toISOString());
  const openedUrls: string[] = [];
  const windowCalls: string[] = [];
  const notices: Notice[] = [];
  const secrets: { available: boolean; key: string | null } = { available: true, key: null };
  const modelAnswers: (LlmAnswer | Error)[] = [];
  const modelCalls: { apiKey: string; model: string; turns: LlmTurn[] }[] = [];
  let modelList: string[] | Error = ['claude-opus-5-5'];
  let changeCount = 0;
  const ctx: AppContext = {
    db,
    clock,
    session: newSession(),
    secrets: {
      available: () => secrets.available,
      getApiKey: () => secrets.key,
      setApiKey: (key) => {
        secrets.key = key;
      },
      clearApiKey: () => {
        secrets.key = null;
      },
    },
    models: {
      client: (apiKey) => ({
        complete: async (input) => {
          modelCalls.push({ apiKey, model: input.model, turns: input.turns.map((turn) => ({ ...turn })) });
          const next = modelAnswers.shift();
          if (next === undefined) throw new Error('The test model was asked more often than expected');
          if (next instanceof Error) throw next;
          return next;
        },
      }),
      listModels: async () => {
        if (modelList instanceof Error) throw modelList;
        return modelList;
      },
    },
    windows: {
      showMain: (screen) => windowCalls.push(`showMain:${screen ?? ''}`),
      showSwap: () => windowCalls.push('showSwap'),
      movePetBy: (dx, dy) => windowCalls.push(`movePetBy:${dx},${dy}`),
      endPetDrag: () => windowCalls.push('endPetDrag'),
      setPetInteractive: (interactive) => windowCalls.push(`setPetInteractive:${interactive}`),
      showPetMenu: () => windowCalls.push('showPetMenu'),
      showCard: (anchor) => windowCalls.push(`showCard:${anchor}`),
      hideCard: () => windowCalls.push('hideCard'),
      setCardSize: (width, height) => windowCalls.push(`setCardSize:${width}x${height}`),
      openCard: () => windowCalls.push('openCard'),
    },
    notifyChanged: () => {
      changeCount += 1;
    },
    notify: (notice) => notices.push(notice),
    openExternal: async (url) => {
      openedUrls.push(url);
    },
    randomSeed: () => 12345,
  };
  return {
    ctx,
    db,
    clock,
    handlers: createHandlers(ctx),
    openedUrls,
    windowCalls,
    notices,
    secrets,
    modelAnswers,
    modelCalls,
    setModelList: (next) => {
      modelList = next;
    },
    changes: () => changeCount,
    close: () => db.close(),
  };
}
