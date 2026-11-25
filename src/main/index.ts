// Electron main process: app lifecycle, the database, the bridge and the windows.
import { randomInt } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, dialog, powerMonitor, shell } from 'electron';
import { CHANGED_EVENT } from '../bridge/channels';
import { DATABASE_FILE_NAME, openDatabase, type Db } from '../data';
import { registerBridge } from './bridge';
import { FakeClock, systemClock, type Clock } from './clock';
import { createDayWatcher, createHandlers, type AppContext } from './services';
import { createMainWindow, isRendererUrl } from './windows/mainWindow';

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
let db: Db | null = null;

function showMainWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  mainWindow = createMainWindow();
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
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
    db = openDatabase(join(userData, DATABASE_FILE_NAME), clock.now().toISOString()).db;
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
  const ctx: AppContext = {
    db,
    clock,
    notifyChanged: () => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) window.webContents.send(CHANGED_EVENT);
      }
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
  dayWatcher.check();
  setInterval(() => dayWatcher.check(), TICK_MS);
  powerMonitor.on('resume', () => dayWatcher.check());
  powerMonitor.on('unlock-screen', () => dayWatcher.check());

  if (isE2E && clock instanceof FakeClock) {
    // Reached from tests through Playwright's electronApp.evaluate.
    (globalThis as Record<string, unknown>).__paraleetTest = {
      setNow: (iso: string) => {
        clock.set(iso);
        dayWatcher.check();
      },
      setTimeZone: (timeZone: string) => {
        clock.setTimeZone(timeZone);
        dayWatcher.check();
      },
      openedUrls: () => [...openedUrls],
    };
  }

  showMainWindow();
}

if (!app.requestSingleInstanceLock()) {
  // Only one instance of the app can run at a time (PRD section 9).
  app.quit();
} else {
  app.on('second-instance', showMainWindow);
  app.on('activate', showMainWindow);
  app.on('window-all-closed', () => {
    // Stay running on macOS; the pet and the menu bar icon keep the app alive.
    if (process.platform !== 'darwin' || isE2E) app.quit();
  });
  app.on('will-quit', () => {
    db?.close();
    db = null;
  });
  void app.whenReady().then(start);
}
