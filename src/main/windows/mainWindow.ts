import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow } from 'electron';

export const MAIN_WINDOW_DEFAULT = { width: 1100, height: 720 };
export const MAIN_WINDOW_MIN = { width: 860, height: 580 };

/** In development the renderer is served by Vite. A packaged app never loads a remote page. */
function devServerUrl(): string | undefined {
  return app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL;
}

const RENDERER_FILE = join(import.meta.dirname, '../renderer/index.html');

export function loadRenderer(window: BrowserWindow, hash = ''): void {
  const devUrl = devServerUrl();
  if (devUrl) {
    void window.loadURL(`${devUrl}${hash ? `#${hash}` : ''}`);
  } else {
    void window.loadFile(RENDERER_FILE, hash ? { hash } : undefined);
  }
}

/** True when `url` is the app's own UI. The bridge answers no other page. */
export function isRendererUrl(url: string): boolean {
  const devUrl = devServerUrl();
  if (devUrl) return url === devUrl || url.startsWith(`${devUrl.replace(/\/$/, '')}/`);
  const page = url.split(/[?#]/)[0];
  return page === pathToFileURL(RENDERER_FILE).href;
}

/**
 * Locks a window down: it can never navigate away or open another window. Links open in the
 * browser only through the bridge, which opens only links stored in the database.
 */
export function hardenWindow(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
}

/** `path` is the screen to open on, for example `/settings`. */
export function createMainWindow(path = ''): BrowserWindow {
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
  loadRenderer(window, path);
  return window;
}
