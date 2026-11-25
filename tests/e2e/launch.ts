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

/** What the main process reports about the menu bar icon. */
export interface TrayFacts {
  exists: boolean;
  /** The streak beside the icon, as shown (" 3"), or "" when there is none. */
  title: string;
  tooltip: string;
  /** Changes whenever the icon's picture does. */
  key: string;
}

/** What the main process reports about the compact card. */
export interface CardFacts {
  exists: boolean;
  visible: boolean;
  anchor: 'pet' | 'tray' | null;
  bounds: { x: number; y: number; width: number; height: number } | null;
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
  tray(): Promise<TrayFacts>;
  /** What a click on the menu bar icon does. */
  clickTray(): Promise<void>;
  trayMenuLabels(): Promise<string[]>;
  clickTrayMenu(label: string): Promise<void>;
  card(): Promise<CardFacts>;
  /** The card loses focus, as when the user clicks elsewhere. `early`: it is opened and loses focus before it has been shown. */
  blurCard(early?: boolean): Promise<void>;
  /** The compact card's page. Waits for it to open. */
  cardPage(): Promise<Page>;
  /** The main window's page, waiting for it to open. For runs that start without it, or after it was closed. */
  mainPage(): Promise<Page>;
  /** Notifications the app has sent, in order. End-to-end runs record them and show none. */
  notifications(): Promise<{ title: string; body: string }[]>;
  clickNotification(index: number): Promise<void>;
  /** What "Launch at login" asks of the system: true, false, or null before it was looked at. */
  loginItemWanted(): Promise<boolean | null>;
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
  tray(): TrayFacts;
  clickTray(): void;
  trayMenuLabels(): string[];
  clickTrayMenu(label: string): void;
  card(): CardFacts;
  blurCard(early: string): void;
  notifications(): { title: string; body: string }[];
  clickNotification(index: string): void;
  loginItemWanted(): boolean | null;
}

type WindowKind = 'main' | 'pet' | 'card';
const kindOf = (page: Page): WindowKind =>
  /#\/pet\b/.test(page.url()) ? 'pet' : /#\/card\b/.test(page.url()) ? 'card' : 'main';

const isAppPage = (page: Page): boolean => /index\.html|localhost/.test(page.url());

/**
 * Finds an open window of the wanted kind, waiting for it to appear if needed. It polls instead
 * of waiting for a "window" event, because the window may open between looking and listening.
 */
async function findWindow(app: ElectronApplication, want: WindowKind): Promise<Page> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    for (const page of app.windows()) {
      // A window that has not loaded the app yet has no route to judge it by.
      if (!page.isClosed() && isAppPage(page) && kindOf(page) === want) {
        await page.waitForLoadState('domcontentloaded');
        return page;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`The ${want} window did not open`);
}

export function makeUserDataDir(): { dir: string; remove(): void } {
  const dir = mkdtempSync(join(tmpdir(), 'paraleet-e2e-'));
  return { dir, remove: () => rmSync(dir, { recursive: true, force: true }) };
}

export async function launchApp(options: {
  userDataDir: string;
  now: string;
  timeZone?: string;
  /** False to start before the egg has hatched, for the first-launch flow. Default: hatched. */
  hatched?: boolean;
  /**
   * True to start the way the login item does: no main window. `page` is then the floating pet's
   * page; use `mainPage()` once something has opened the main window.
   */
  atLogin?: boolean;
}): Promise<RunningApp> {
  const app = await electron.launch({
    args: [ROOT],
    cwd: ROOT,
    env: {
      ...process.env,
      PARALEET_E2E: '1',
      PARALEET_USER_DATA_DIR: options.userDataDir,
      PARALEET_FAKE_NOW: options.now,
      PARALEET_FAKE_TZ: options.timeZone ?? TEST_ZONE,
      PARALEET_E2E_UNHATCHED: options.hatched === false ? '1' : '0',
      PARALEET_E2E_AT_LOGIN: options.atLogin ? '1' : '0',
    },
  });
  // A login launch has no main window, unless Para has not hatched yet: then it always shows.
  const page = await findWindow(app, options.atLogin && options.hatched !== false ? 'pet' : 'main');

  const hooks = <T>(use: (hooks: TestHooks, arg: string) => T, arg = ''): Promise<T> =>
    app.evaluate(
      (_electron, [body, value]) => {
        const target = (globalThis as unknown as { __paraleetTest: TestHooks }).__paraleetTest;
        // The function is sent as text because it must run inside the app's main process.
        return (new Function('hooks', 'arg', `return (${body})(hooks, arg)`) as (h: TestHooks, a: string) => T)(
          target,
          value,
        );
      },
      [use.toString(), arg] as const,
    );

  return {
    app,
    page,
    setNow: (iso) => hooks((h, value) => h.setNow(value), iso),
    setTimeZone: (timeZone) => hooks((h, value) => h.setTimeZone(value), timeZone),
    openedUrls: () => hooks((h) => h.openedUrls()),
    petPage: () => findWindow(app, 'pet'),
    pet: () => hooks((h) => h.pet()),
    petMenuLabels: () => hooks((h) => h.petMenuLabels()),
    clickPetMenu: (label) => hooks((h, value) => h.clickPetMenu(value), label),
    dockVisible: () => hooks((h) => h.dockVisible()),
    mainWindowOpen: () => hooks((h) => h.mainWindowOpen()),
    tray: () => hooks((h) => h.tray()),
    clickTray: () => hooks((h) => h.clickTray()),
    trayMenuLabels: () => hooks((h) => h.trayMenuLabels()),
    clickTrayMenu: (label) => hooks((h, value) => h.clickTrayMenu(value), label),
    card: () => hooks((h) => h.card()),
    blurCard: (early = false) => hooks((h, value) => h.blurCard(value), early ? 'early' : ''),
    cardPage: () => findWindow(app, 'card'),
    mainPage: () => findWindow(app, 'main'),
    notifications: () => hooks((h) => h.notifications()),
    clickNotification: (index) => hooks((h, value) => h.clickNotification(value), String(index)),
    loginItemWanted: () => hooks((h) => h.loginItemWanted()),
    close: () => app.close(),
  };
}
