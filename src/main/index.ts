// Electron main process: app lifecycle, the database, the bridge and the windows.
import { randomInt } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, dialog, powerMonitor, screen, shell, type MenuItemConstructorOptions } from 'electron';
import { CHANGED_EVENT, NAVIGATE_EVENT } from '../bridge/channels';
import { DATABASE_FILE_NAME, openDatabase, type Db } from '../data';
import { ensurePet, saveHatched } from '../data/repos/pet';
import { getSettings, updateSettings } from '../data/repos/settings';
import { registerBridge } from './bridge';
import { FakeClock, systemClock, type Clock } from './clock';
import {
  createDayWatcher,
  createHandlers,
  createMoodWatcher,
  newSession,
  nextCelebrationStep,
  reconcile,
  trayState,
  type AppContext,
} from './services';
import { createMainWindow, isRendererUrl } from './windows/mainWindow';
import { TrayController } from './tray';
import { CardWindowController } from './windows/cardWindow';
import { PetWindowController } from './windows/petWindow';

const TICK_MS = 30_000;

// End-to-end tests run the real app with its own data folder, a fake clock and no browser.
// The test switches work only in an unpackaged app, so an installed copy cannot be put in test mode.
const isE2E = !app.isPackaged && process.env.PARALEET_E2E === '1';

app.setName('ParaLeet');
if (process.env.PARALEET_USER_DATA_DIR) {
  app.setPath('userData', process.env.PARALEET_USER_DATA_DIR);
} else if (!app.isPackaged) {
  // Development runs never touch the installed app's real data.
  app.setPath('userData', join(app.getPath('appData'), 'ParaLeet-dev'));
}

let mainWindow: BrowserWindow | null = null;
let petWindow: PetWindowController | null = null;
let db: Db | null = null;

let dockTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * The Dock icon is hidden while only the pet is showing, like a menu bar app. It stays when the
 * main window is open, and also when the pet is hidden, so the app can always be reached.
 *
 * macOS is fussy about this: a request to hide made while a window is still closing, or within a
 * second of the icon being shown, is silently ignored. So the decision is made a moment after the
 * event, the icon is only touched when it is wrong, and the result is checked again afterwards.
 */
function updateDock(attempt = 0): void {
  if (!app.dock) return;
  if (dockTimer) clearTimeout(dockTimer);
  dockTimer = setTimeout(
    () => {
      dockTimer = null;
      if (!app.dock) return;
      const mainOpen = mainWindow !== null && !mainWindow.isDestroyed();
      const wanted = mainOpen || !petWindow?.isVisible();
      if (app.dock.isVisible() === wanted) return;
      if (wanted) void app.dock.show();
      else app.dock.hide();
      if (attempt < 8) updateDock(attempt + 1);
    },
    attempt === 0 ? 150 : 500,
  );
}

/** Shows the main window, creating it if needed. `path` is the screen to show, such as `/settings`. */
function showMainWindow(path = ''): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (path !== '') mainWindow.webContents.send(NAVIGATE_EVENT, path);
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  mainWindow = createMainWindow(path);
  mainWindow.on('closed', () => {
    mainWindow = null;
    updateDock();
  });
  updateDock();
}

function createClock(): Clock {
  const fakeNow = app.isPackaged ? undefined : process.env.PARALEET_FAKE_NOW;
  if (!fakeNow) return systemClock;
  return new FakeClock(fakeNow, process.env.PARALEET_FAKE_TZ ?? systemClock.timeZone());
}

function start(): void {
  const clock = createClock();
  const userData = app.getPath('userData');
  mkdirSync(userData, { recursive: true });

  try {
    const opened = openDatabase(join(userData, DATABASE_FILE_NAME), clock.now().toISOString());
    db = opened.db;
    // The catalog is reference data: the app opens without a file that could not be loaded.
    for (const problem of opened.catalogProblems) console.warn(`ParaLeet: ${problem}`);
  } catch (error) {
    // Never repair or replace the file automatically: the user's data comes first.
    dialog.showErrorBox(
      'ParaLeet could not open its database',
      `${error instanceof Error ? error.message : String(error)}\n\nYour data file was not changed:\n${join(userData, DATABASE_FILE_NAME)}`,
    );
    app.exit(1);
    return;
  }

  const openedUrls: string[] = [];
  const pet = new PetWindowController(
    db,
    clock,
    {
      openMain: (target) => showMainWindow(target ? `/${target}` : ''),
      openSwap: () => showMainWindow('/today/swap'),
      quit: () => app.quit(),
    },
    () => updateDock(),
  );
  petWindow = pet;

  // The compact card hangs on the bird or on the menu bar icon, whichever asked for it.
  const card = new CardWindowController({ pet: () => pet.birdRect(), tray: () => tray.bounds() }, () => updateDock());
  const trayMenu = (): MenuItemConstructorOptions[] => [
    { label: 'Open ParaLeet', click: () => showMainWindow() },
    { label: "Swap today's problem…", click: () => showMainWindow('/today/swap') },
    { type: 'separator' },
    getSettings(ctx.db).petVisible
      ? { label: 'Hide Para from the desktop', click: () => setPetVisible(false) }
      : { label: 'Show Para on the desktop', click: () => setPetVisible(true) },
    { label: 'Settings…', click: () => showMainWindow('/settings') },
    { type: 'separator' },
    { label: 'Quit ParaLeet', click: () => app.quit() },
  ];
  const tray: TrayController = new TrayController(() => trayState(ctx), {
    toggleCard: () => card.toggle('tray'),
    menu: trayMenu,
  });
  function setPetVisible(visible: boolean): void {
    updateSettings(ctx.db, { petVisible: visible });
    ctx.notifyChanged();
  }

  const ctx: AppContext = {
    db,
    clock,
    session: newSession(),
    windows: {
      showMain: (target) => showMainWindow(target ? `/${target}` : ''),
      movePetBy: (dx, dy) => pet.moveBy(dx, dy),
      endPetDrag: () => pet.endDrag(),
      setPetInteractive: (interactive) => pet.setInteractive(interactive),
      showPetMenu: () => pet.showMenu(),
      showCard: (anchor) => card.toggle(anchor),
      // Closed a moment later, so the card's own request is answered before its window is gone.
      // It closes the card that asked, even if another one has been opened in the meantime.
      hideCard: () => {
        const asking = card.current();
        setTimeout(() => {
          if (asking !== null && card.current() === asking) card.hide();
        }, 0);
      },
      setCardSize: (width, height) => card.setSize(width, height),
    },
    notifyChanged: () => {
      // A settings change may show or hide the pet; a report changes the icon and the streak.
      // Neither may stop the windows from hearing about a change that is already saved.
      try {
        pet.sync();
        tray.sync();
      } catch (error) {
        console.error('ParaLeet could not update the pet window or the menu bar icon:', error);
      }
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) window.webContents.send(CHANGED_EVENT);
      }
      scheduleCelebrationStep();
    },
    openExternal: async (url) => {
      if (isE2E) {
        openedUrls.push(url);
        return;
      }
      await shell.openExternal(url);
    },
    randomSeed: () => randomInt(0, 2 ** 31 - 1),
  };

  // After a report Para checks it for a moment, then eats. Each step is a mood change the windows
  // must redraw, so a short timer tells them when the next one is due. With the test clock, time
  // only moves when a test moves it, and the test hook below does the telling.
  let celebrationTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleCelebrationStep(): void {
    if (celebrationTimer) clearTimeout(celebrationTimer);
    celebrationTimer = null;
    if (clock instanceof FakeClock) return;
    const next = nextCelebrationStep(ctx);
    if (!next) return;
    celebrationTimer = setTimeout(
      () => {
        celebrationTimer = null;
        ctx.notifyChanged();
      },
      Math.max(next.getTime() - clock.now().getTime(), 0) + 20,
    );
  }

  // End-to-end tests start with Para already hatched unless they are about the first-launch flow.
  if (isE2E && process.env.PARALEET_E2E_UNHATCHED !== '1') {
    ensurePet(db, ctx.randomSeed(), clock.now().toISOString());
    saveHatched(db, clock.now().toISOString());
  }

  // Attempts are the source of truth: bring the stored streak, totals and review cards in line
  // with them before anything is shown.
  try {
    const repaired = reconcile(ctx);
    if (repaired.petFactsRepaired || repaired.cardsRebuilt > 0 || repaired.accessoriesRestored.length > 0) {
      console.warn(
        `ParaLeet reconciled its data with the attempts: pet facts ${repaired.petFactsRepaired ? 'corrected' : 'ok'}, ${repaired.cardsRebuilt} review card(s) rebuilt, ${repaired.accessoriesRestored.length} accessory unlock(s) restored.`,
      );
    }
  } catch (error) {
    // The self-check runs in one transaction, so a failure changes nothing. The app is still
    // usable with the data as stored; never leave the user with no window over this.
    console.error('ParaLeet could not reconcile its data at launch:', error);
  }

  // The bridge answers only the main frame of the app's own windows, showing the app's own page.
  registerBridge(createHandlers(ctx), (event) => {
    const frame = event.senderFrame;
    return (
      BrowserWindow.fromWebContents(event.sender) !== null &&
      frame !== null &&
      frame === event.sender.mainFrame &&
      isRendererUrl(frame.url)
    );
  });

  const dayWatcher = createDayWatcher(ctx);
  const moodWatcher = createMoodWatcher(ctx);
  // One tick does everything that depends on the clock. Long timers are not trusted (PRD section 9).
  // Each step is guarded: one that fails is logged and must not stop the others, the next tick,
  // or the main window from opening.
  const step = (what: string, run: () => void): void => {
    try {
      run();
    } catch (error) {
      console.error(`ParaLeet could not ${what}:`, error);
    }
  };
  const tick = (): void => {
    step('check the day', () => dayWatcher.check());
    // A reminder time passing, night falling or a celebration ending changes how Para looks.
    step("check Para's mood", () => moodWatcher.check());
    step('update the pet window', () => pet.sync());
    step('update the menu bar icon', () => tray.sync());
  };
  tick();
  setInterval(tick, TICK_MS);
  powerMonitor.on('resume', tick);
  powerMonitor.on('unlock-screen', tick);
  // A display was unplugged or rearranged: bring the pet back onto a visible screen.
  screen.on('display-removed', tick);
  screen.on('display-metrics-changed', tick);

  if (isE2E && clock instanceof FakeClock) {
    // Reached from tests through Playwright's electronApp.evaluate.
    (globalThis as Record<string, unknown>).__paraleetTest = {
      setNow: (iso: string) => {
        clock.set(iso);
        tick();
      },
      setTimeZone: (timeZone: string) => {
        clock.setTimeZone(timeZone);
        tick();
      },
      openedUrls: () => [...openedUrls],
      // Native windows and menus cannot be driven from the page, so tests reach them here.
      pet: () => {
        const window = pet.current();
        return {
          exists: window !== null,
          visible: pet.isVisible(),
          bounds: window?.getBounds() ?? null,
          alwaysOnTop: window?.isAlwaysOnTop() ?? false,
          onAllWorkspaces: window?.isVisibleOnAllWorkspaces() ?? false,
          focusable: window?.isFocusable() ?? true,
          focused: window?.isFocused() ?? false,
          clickThrough: pet.isClickThrough(),
        };
      },
      petMenuLabels: () => pet.menuTemplate().map((item) => item.label ?? item.type ?? ''),
      clickPetMenu: (label: string) => {
        const item = pet.menuTemplate().find((entry) => entry.label === label);
        if (!item?.click) throw new Error(`No pet menu item "${label}"`);
        (item.click as () => void)();
      },
      tray: () => tray.facts(),
      clickTray: () => card.toggle('tray'),
      // What losing focus does to the card. With `early`, the card is opened and loses focus in the
      // same breath, before it has been shown.
      blurCard: (early: string) => {
        if (early === 'early') card.show('tray');
        card.current()?.emit('blur');
      },
      trayMenuLabels: () => trayMenu().map((item) => item.label ?? item.type ?? ''),
      clickTrayMenu: (label: string) => {
        const item = trayMenu().find((entry) => entry.label === label);
        if (!item?.click) throw new Error(`No menu bar item "${label}"`);
        (item.click as () => void)();
      },
      card: () => {
        const window = card.current();
        return {
          exists: window !== null,
          visible: card.isVisible(),
          anchor: card.currentAnchor(),
          bounds: window?.getBounds() ?? null,
        };
      },
      dockVisible: () => app.dock?.isVisible() ?? true,
      mainWindowOpen: () => mainWindow !== null && !mainWindow.isDestroyed(),
    };
  }

  showMainWindow();
}

if (!app.requestSingleInstanceLock()) {
  // Only one instance of the app can run at a time (PRD section 9).
  app.quit();
} else {
  app.on('second-instance', () => showMainWindow());
  app.on('activate', () => showMainWindow());
  app.on('window-all-closed', () => {
    // Stay running on macOS; the pet and the menu bar icon keep the app alive.
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('will-quit', () => {
    db?.close();
    db = null;
  });
  void app.whenReady().then(start);
}
