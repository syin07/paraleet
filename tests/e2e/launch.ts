// Starts the built app for an end-to-end test: its own data folder, a fake clock, and links
// recorded instead of opened in a browser. Build first (`npm run test:e2e` does).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

export const ROOT = resolve(import.meta.dirname, '../..');
export const TEST_ZONE = 'America/Los_Angeles';

/** What the main process reports about the pet window. */
export interface PetWindowFacts {
  exists: boolean;
  visible: boolean;
  bounds: { x: number; y: number; width: number; height: number } | null;
  alwaysOnTop: boolean;
  onAllWorkspaces: boolean;
  focusable: boolean;
  focused: boolean;
  /** True while clicks pass through the window to whatever is underneath. */
  clickThrough: boolean;
}

export interface RunningApp {
  app: ElectronApplication;
  /** The main window. */
  page: Page;
  /** The floating pet window's page. Waits for it to open. */
  petPage(): Promise<Page>;
  pet(): Promise<PetWindowFacts>;
  petMenuLabels(): Promise<string[]>;
  clickPetMenu(label: string): Promise<void>;
  dockVisible(): Promise<boolean>;
  mainWindowOpen(): Promise<boolean>;
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
  pet(): PetWindowFacts;
  petMenuLabels(): string[];
  clickPetMenu(label: string): void;
  dockVisible(): boolean;
  mainWindowOpen(): boolean;
}

const isPetPage = (page: Page): boolean => /#\/pet\b/.test(page.url());

const isAppPage = (page: Page): boolean => /index\.html|localhost/.test(page.url());

/**
 * Finds an open window of the wanted kind, waiting for it to appear if needed. It polls instead
 * of waiting for a "window" event, because the window may open between looking and listening.
 */
async function findWindow(app: ElectronApplication, wantPet: boolean): Promise<Page> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    for (const page of app.windows()) {
      // A window that has not loaded the app yet has no route to judge it by.
      if (isAppPage(page) && isPetPage(page) === wantPet) {
        await page.waitForLoadState('domcontentloaded');
        return page;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`The ${wantPet ? 'pet' : 'main'} window did not open`);
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
  const page = await findWindow(app, false);

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
    petPage: () => findWindow(app, true),
    pet: () => hooks((h) => h.pet()),
    petMenuLabels: () => hooks((h) => h.petMenuLabels()),
    clickPetMenu: (label) => hooks((h, value) => h.clickPetMenu(value), label),
    dockVisible: () => hooks((h) => h.dockVisible()),
    mainWindowOpen: () => hooks((h) => h.mainWindowOpen()),
    close: () => app.close(),
  };
}
