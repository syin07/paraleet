import { join } from 'node:path';
import { BrowserWindow, shell } from 'electron';

export const MAIN_WINDOW_DEFAULT = { width: 1100, height: 720 };
export const MAIN_WINDOW_MIN = { width: 860, height: 580 };

/** In dev the renderer is served by Vite; in a build it is a file next to the main bundle. */
export function loadRenderer(window: BrowserWindow, hash = ''): void {
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    void window.loadURL(`${devUrl}${hash ? `#${hash}` : ''}`);
  } else {
    void window.loadFile(join(import.meta.dirname, '../renderer/index.html'), hash ? { hash } : undefined);
  }
}

/** Locks a window down: it can never navigate away or open child windows. */
export function hardenWindow(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event) => event.preventDefault());
}

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    ...MAIN_WINDOW_DEFAULT,
    minWidth: MAIN_WINDOW_MIN.width,
    minHeight: MAIN_WINDOW_MIN.height,
    show: false,
    title: 'ParaLeet',
    backgroundColor: '#1A1A1A',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  hardenWindow(window);
  window.once('ready-to-show', () => window.show());
  loadRenderer(window);
  return window;
}
