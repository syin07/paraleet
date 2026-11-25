// Test helpers for the use-case layer: a real in-memory database, a fake clock and spies for
// everything that would otherwise reach the outside world.
import type { BridgeHandlers } from '../../bridge/contract';
import { openDatabase, type Db } from '../../data';
import { FakeClock } from '../clock';
import { newSession } from './context';
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
  let changeCount = 0;
  const ctx: AppContext = {
    db,
    clock,
    session: newSession(),
    windows: {
      showMain: (screen) => windowCalls.push(`showMain:${screen ?? ''}`),
      movePetBy: (dx, dy) => windowCalls.push(`movePetBy:${dx},${dy}`),
      endPetDrag: () => windowCalls.push('endPetDrag'),
      setPetInteractive: (interactive) => windowCalls.push(`setPetInteractive:${interactive}`),
      showPetMenu: () => windowCalls.push('showPetMenu'),
      showCard: (anchor) => windowCalls.push(`showCard:${anchor}`),
      hideCard: () => windowCalls.push('hideCard'),
      setCardSize: (width, height) => windowCalls.push(`setCardSize:${width}x${height}`),
    },
    notifyChanged: () => {
      changeCount += 1;
    },
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
    changes: () => changeCount,
    close: () => db.close(),
  };
}
