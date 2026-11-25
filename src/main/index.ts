// Electron main process: app lifecycle, the database, the bridge and the windows.
import { randomInt } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { uptime } from 'node:os';
import {
  app,
  BrowserWindow,
  dialog,
  Notification,
  powerMonitor,
  safeStorage,
  screen,
  shell,
  type MenuItemConstructorOptions,
} from 'electron';
import { CHANGED_EVENT, NAVIGATE_EVENT } from '../bridge/channels';
import { DATABASE_FILE_NAME, openDataFolder, type Db } from '../data';
import { ensurePet, saveHatched } from '../data/repos/pet';
import { getSettings, updateSettings } from '../data/repos/settings';
import { createAnthropicClient, listModels } from '../llm/anthropicClient';
import { LlmError } from '../llm/planGenerator';
import { registerBridge } from './bridge';
import { createLog, LOG_FILE_NAME } from './log';
import { API_KEY_FILE_NAME, createSecretStore } from './secrets';
import { FakeClock, systemClock, type Clock } from './clock';
import {
  createDayWatcher,
  createHandlers,
  createMoodWatcher,
  newSession,
  nextCelebrationStep,
  reconcile,
  sendDueReminder,
  trayState,
  type AppContext,
  type ImportOutcome,
  type ModelAccess,
  type Notice,
} from './services';
import { createMainWindow, isRendererUrl } from './windows/mainWindow';
import { createLoginItemSync, startsQuietly } from './loginItem';
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

/** Until this moment, the app being activated does not open the main window (see the notifier). */
let quietActivationUntil = 0;
/**
 * A model for end-to-end tests: it answers from a JSON file the test writes (an array, consumed
 * in order). Each entry is `{ "plan": <the model's JSON answer> }` or `{ "error": "<message>" }`.
 * What it was asked is written next to that file, as `<file>.calls.json`, so a test can read the
 * candidates the app sent and build an answer from them.
 */
function scriptedModels(file: string): ModelAccess {
  let used = 0;
  const calls: { model: string; system: string; turns: { role: string; text: string }[] }[] = [];
  return {
    client: () => ({
      complete: async (input) => {
        // A test that did not bring answers gets a failure, never the network.
        if (file === '') throw new LlmError('other', 'The test model has no answers.');
        calls.push({ model: input.model, system: input.system, turns: input.turns.map((turn) => ({ ...turn })) });
        writeFileSync(`${file}.calls.json`, JSON.stringify(calls));
        const answers = JSON.parse(readFileSync(file, 'utf8')) as ({ plan?: unknown; error?: string } | undefined)[];
        const next = answers[used];
        used += 1;
        if (!next) throw new LlmError('other', 'The test model has no more answers.');
        if (typeof next.error === 'string') throw new LlmError('offline', next.error);
        return { kind: 'json', value: next.plan, text: JSON.stringify(next.plan) };
      },
    }),
    listModels: async () => ['claude-opus-5-5'],
  };
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

/**
 * Asks the main window to show a screen. While its page is still loading nothing in it is
 * listening and a message would be dropped, so the request waits for the page.
 */
function navigateMainWindow(window: BrowserWindow, path: string): void {
  const contents = window.webContents;
  if (!contents.isLoading()) {
    contents.send(NAVIGATE_EVENT, path);
    return;
  }
  // A load that fails drops the request: it must not be applied by some later load, long after
  // it was asked for.
  const onLoaded = (): void => {
    contents.removeListener('did-fail-load', onFailed);
    if (!window.isDestroyed()) contents.send(NAVIGATE_EVENT, path);
  };
  const onFailed = (): void => {
    contents.removeListener('did-finish-load', onLoaded);
  };
  contents.once('did-finish-load', onLoaded);
  contents.once('did-fail-load', onFailed);
}

/** Shows the main window, creating it if needed. `path` is the screen to show, such as `/settings`. */
function showMainWindow(path = ''): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (path !== '') navigateMainWindow(mainWindow, path);
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

  // What a development run prints to the console, an installed app keeps in a file the user can
  // send: `paraleet.log`, next to the database. The log uses real time, also under a test clock.
  const log = createLog(join(userData, LOG_FILE_NAME), () => new Date(), {
    echo: (level, line) => (level === 'error' ? console.error(line) : level === 'warn' ? console.warn(line) : console.log(line)),
  });
  log.info(`ParaLeet ${app.getVersion()} started (${app.isPackaged ? 'installed' : 'development'}, ${process.arch}).`);
  // A failure nothing caught: keep it, and keep running. Para should not vanish over one error.
  process.on('uncaughtException', (error) => log.error('An error nothing caught:', error));
  process.on('unhandledRejection', (reason) => log.error('A failed promise nothing caught:', reason));

  // An import chosen in Settings is put in place here, before the database is opened: the open
  // database is never replaced while the app runs, and what it replaces is kept beside it.
  let lastImport: ImportOutcome | null;
  try {
    const opened = openDataFolder(userData, clock.now().toISOString(), { realNowMs: Date.now() });
    db = opened.db;
    lastImport = opened.lastImport;
    for (const problem of opened.problems) log.error(problem);
    if (lastImport?.status === 'applied') log.info('An import was applied at this launch.');
    if (lastImport?.status === 'rejected') log.warn(`An import was not applied: ${lastImport.reason}`);
    // The catalog is reference data: the app opens without a file that could not be loaded.
    for (const problem of opened.catalogProblems) log.warn(problem);
  } catch (error) {
    // Never repair or replace the file automatically: the user's data comes first.
    log.error('The database could not be opened:', error);
    dialog.showErrorBox(
      'ParaLeet could not open its database',
      // The folder, not the file: when an import stopped half way the data is under its backup name.
      `${error instanceof Error ? error.message : String(error)}\n\nYour data was not changed. It is in this folder:\n${userData}`,
    );
    app.exit(1);
    return;
  }

  const database = db;
  // "Launch at login" in Settings. Only a packaged app registers itself with the system.
  const loginItem = createLoginItemSync({
    packaged: app.isPackaged,
    read: () => getSettings(database).launchAtLogin,
    apply: (openAtLogin) => app.setLoginItemSettings({ openAtLogin }),
  });

  const openedUrls: string[] = [];
  const notices: Notice[] = [];
  // End-to-end runs answer the file dialogs from here and show none.
  const testDialogs: { save: string | null; open: string | null; revealed: string[] } = { save: null, open: null, revealed: [] };
  const liveNotifications = new Set<Notification>();
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
  const card = new CardWindowController({ pet: () => pet.birdRect(), tray: () => tray.bounds() }, () => updateDock(), {
    closeOnBlur: !isE2E,
  });
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

  // The API key: sealed by the system keychain in the app. End-to-end runs use a stand-in sealer
  // so they never touch the owner's keychain, and a scripted model so they never use the network.
  const secrets = createSecretStore(
    join(userData, API_KEY_FILE_NAME),
    isE2E
      ? {
          available: () => true,
          seal: (text) => Buffer.from(text, 'utf8').reverse(),
          open: (sealed) => Buffer.from(sealed).reverse().toString('utf8'),
        }
      : {
          available: () => safeStorage.isEncryptionAvailable(),
          seal: (text) => safeStorage.encryptString(text),
          open: (sealed) => safeStorage.decryptString(sealed),
        },
  );
  const models: ModelAccess =
    isE2E
      ? scriptedModels(process.env.PARALEET_E2E_LLM_ANSWERS ?? '')
      : { client: (apiKey) => createAnthropicClient(apiKey), listModels: (apiKey) => listModels(apiKey) };

  const ctx: AppContext = {
    db,
    clock,
    secrets,
    models,
    session: newSession(lastImport),
    windows: {
      showMain: (target) => showMainWindow(target ? `/${target}` : ''),
      showSwap: () => showMainWindow('/today/swap'),
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
      openCard: () => card.open(pet.birdRect() ? 'pet' : 'tray'),
    },
    files: {
      chooseSavePath: async (suggestedName) => {
        if (isE2E) return testDialogs.save;
        const options = {
          title: 'Export ParaLeet data',
          defaultPath: join(app.getPath('documents'), suggestedName),
          filters: [{ name: 'ParaLeet database', extensions: ['sqlite3'] }],
        };
        const owner = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
        const result = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options);
        return result.canceled || !result.filePath ? null : result.filePath;
      },
      chooseOpenPath: async () => {
        if (isE2E) return testDialogs.open;
        const options = {
          title: 'Import ParaLeet data',
          properties: ['openFile' as const],
          // The backup an import leaves behind ends in ".before-import", so every file can be picked;
          // what is picked is checked before anything changes.
          filters: [
            { name: 'ParaLeet database', extensions: ['sqlite3'] },
            { name: 'All files', extensions: ['*'] },
          ],
        };
        const owner = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
        const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
        return result.canceled ? null : (result.filePaths[0] ?? null);
      },
      reveal: (path) => {
        if (isE2E) testDialogs.revealed.push(path);
        else shell.showItemInFolder(path);
      },
    },
    // A moment later, so the window that asked gets its answer first. Quitting (not exiting)
    // closes the database on the way out. End-to-end runs only quit: the test starts the app again.
    restart: () => {
      setTimeout(() => {
        if (!isE2E) app.relaunch();
        app.quit();
      }, 200);
    },
    notifyChanged: () => {
      // A settings change may show or hide the pet; a report changes the icon and the streak.
      // None of these may stop the windows from hearing about a change that is already saved.
      try {
        pet.sync();
        tray.sync();
        loginItem.sync();
      } catch (error) {
        log.error('Could not update the pet window, the menu bar icon or the login item:', error);
      }
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) window.webContents.send(CHANGED_EVENT);
      }
      scheduleCelebrationStep();
    },
    notify: (notice) => {
      // End-to-end runs record notifications and never show one on the owner's Mac.
      if (isE2E) {
        notices.push(notice);
        return;
      }
      if (!Notification.isSupported()) return;
      const notification = new Notification({ title: notice.title, body: notice.body });
      // Held until it is clicked or goes away, or it could be collected with its click handler.
      liveNotifications.add(notification);
      notification.on('click', () => {
        liveNotifications.delete(notification);
        // Clicking a notification also "activates" the app, which normally opens the main window.
        // Here the click means "show me the card": hold the main window back for a moment.
        quietActivationUntil = Date.now() + 1500;
        notice.onClick();
      });
      notification.on('close', () => liveNotifications.delete(notification));
      notification.show();
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
      log.warn(
        `Reconciled the data with the attempts: pet facts ${repaired.petFactsRepaired ? 'corrected' : 'ok'}, ${repaired.cardsRebuilt} review card(s) rebuilt, ${repaired.accessoriesRestored.length} accessory unlock(s) restored.`,
      );
    }
  } catch (error) {
    // The self-check runs in one transaction, so a failure changes nothing. The app is still
    // usable with the data as stored; never leave the user with no window over this.
    log.error('Could not reconcile the data at launch:', error);
  }

  // The bridge answers only the main frame of the app's own windows, showing the app's own page.
  registerBridge(
    createHandlers(ctx),
    (event) => {
      const frame = event.senderFrame;
      return (
        BrowserWindow.fromWebContents(event.sender) !== null &&
        frame !== null &&
        frame === event.sender.mainFrame &&
        isRendererUrl(frame.url)
      );
    },
    // The window shows the message; the log keeps the rest. The input is never logged.
    (method, error) => log.error(`${method} failed:`, error),
  );

  const dayWatcher = createDayWatcher(ctx);
  const moodWatcher = createMoodWatcher(ctx);

  // One tick does everything that depends on the clock. Long timers are not trusted (PRD section 9).
  // Each step is guarded: one that fails is logged and must not stop the others, the next tick,
  // or the main window from opening.
  const step = (what: string, run: () => void): void => {
    try {
      run();
    } catch (error) {
      log.error(`Could not ${what}:`, error);
    }
  };
  const tick = (): void => {
    step('check the day', () => dayWatcher.check());
    // A reminder time passing, night falling or a celebration ending changes how Para looks.
    step("check Para's mood", () => moodWatcher.check());
    step('update the pet window', () => pet.sync());
    step('update the menu bar icon', () => tray.sync());
    step('update the login item', () => loginItem.sync());
    // Last: a reminder names today's problem and may assign it.
    step('send a reminder', () => sendDueReminder(ctx));
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
      // The next answers of the save and open dialogs; an empty string is the user cancelling.
      setDialogPaths: (paths: string) => {
        const next = JSON.parse(paths) as { save?: string; open?: string };
        if (next.save !== undefined) testDialogs.save = next.save === '' ? null : next.save;
        if (next.open !== undefined) testDialogs.open = next.open === '' ? null : next.open;
      },
      revealedPaths: () => [...testDialogs.revealed],
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
      notifications: () => notices.map((notice) => ({ title: notice.title, body: notice.body })),
      clickNotification: (index: string) => {
        const notice = notices[Number(index)];
        if (!notice) throw new Error(`No notification ${index}`);
        notice.onClick();
      },
      loginItemWanted: () => loginItem.wanted(),
      tray: () => tray.facts(),
      clickTray: () => card.toggle('tray'),
      // What losing focus does to the card. With `early`, the card is opened and loses focus in the
      // same breath, before it has been shown.
      blurCard: (early: string) => {
        if (early === 'early') card.show('tray');
        card.lostFocus();
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

  // Opened by the login item, the app starts with only Para and the menu bar icon.
  const quiet = startsQuietly({
    // End-to-end tests can say "this is the login launch"; a packaged app never reads this.
    wasOpenedAtLogin:
      app.getLoginItemSettings().wasOpenedAtLogin || (isE2E && process.env.PARALEET_E2E_AT_LOGIN === '1'),
    packaged: app.isPackaged,
    launchAtLogin: getSettings(ctx.db).launchAtLogin,
    uptimeSeconds: uptime(),
    hatched: ensurePet(database, ctx.randomSeed(), clock.now().toISOString()).hatchedAt !== null,
  });
  // After an import the app comes back on Settings, where the Data group says what happened.
  if (lastImport) showMainWindow('/settings');
  else if (quiet) updateDock();
  else showMainWindow();
}

if (!app.requestSingleInstanceLock()) {
  // Only one instance of the app can run at a time (PRD section 9).
  app.quit();
} else {
  app.on('second-instance', () => showMainWindow());
  app.on('activate', () => {
    if (Date.now() < quietActivationUntil) return;
    showMainWindow();
  });
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
