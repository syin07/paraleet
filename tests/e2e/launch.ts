// Starts the built app for an end-to-end test: its own data folder, a fake clock, and links
// recorded instead of opened in a browser. Build first (`npm run test:e2e` does).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

export const ROOT = resolve(import.meta.dirname, '../..');
export const TEST_ZONE = 'America/Los_Angeles';

export interface RunningApp {
  app: ElectronApplication;
  page: Page;
  /** Moves the app's clock. The app re-checks the ParaLeet day at once. */
  setNow(iso: string): Promise<void>;
  setTimeZone(timeZone: string): Promise<void>;
  /** Links the app would have opened in the browser. */
  openedUrls(): Promise<string[]>;
  close(): Promise<void>;
}

interface TestHooks {
  setNow(iso: string): void;
  setTimeZone(timeZone: string): void;
  openedUrls(): string[];
}

export function makeUserDataDir(): { dir: string; remove(): void } {
  const dir = mkdtempSync(join(tmpdir(), 'paraleet-e2e-'));
  return { dir, remove: () => rmSync(dir, { recursive: true, force: true }) };
}

export async function launchApp(options: { userDataDir: string; now: string; timeZone?: string }): Promise<RunningApp> {
  const app = await electron.launch({
    args: [ROOT],
    cwd: ROOT,
    env: {
      ...process.env,
      PARALEET_E2E: '1',
      PARALEET_USER_DATA_DIR: options.userDataDir,
      PARALEET_FAKE_NOW: options.now,
      PARALEET_FAKE_TZ: options.timeZone ?? TEST_ZONE,
    },
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  const hooks = <T>(use: (hooks: TestHooks, arg: string) => T, arg = ''): Promise<T> =>
    app.evaluate((_electron, [body, value]) => {
      const target = (globalThis as unknown as { __paraleetTest: TestHooks }).__paraleetTest;
      // The function is sent as text because it must run inside the app's main process.
      return (new Function('hooks', 'arg', `return (${body})(hooks, arg)`) as (h: TestHooks, a: string) => T)(target, value);
    }, [use.toString(), arg] as const);

  return {
    app,
    page,
    setNow: (iso) => hooks((h, value) => h.setNow(value), iso),
    setTimeZone: (timeZone) => hooks((h, value) => h.setTimeZone(value), timeZone),
    openedUrls: () => hooks((h) => h.openedUrls()),
    close: () => app.close(),
  };
}
