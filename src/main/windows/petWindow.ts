// The floating pet window (PRD section 11): a small transparent, frameless window that shows only
// the bird, stays on top on every desktop, never takes keyboard focus, lets clicks on its empty
// area pass through, can be dragged anywhere and remembers where it was left.
import { join } from 'node:path';
import { BrowserWindow, Menu, screen, type MenuItemConstructorOptions } from 'electron';
import type { MainScreen } from '../../bridge/contract';
import type { Db } from '../../data/db';
import { getPet } from '../../data/repos/pet';
import { getSettings, updateSettings } from '../../data/repos/settings';
import type { Clock } from '../clock';
import { hardenWindow, loadRenderer } from './mainWindow';
import { keepOnScreen, type Rect } from './placement';

/** Room for the bird (128 points) and a speech bubble of up to seven short lines above it. */
export const PET_WINDOW_SIZE = { width: 240, height: 280 };
/**
 * Where the page draws the bird inside the window: 128 points, centred, 8 above the bottom edge
 * (see `src/ui/windows/pet/PetWindow.tsx`). Everything else in the window is transparent.
 */
export const PET_BIRD_BOX: Rect = { x: 56, y: 144, width: 128, height: 128 };
export const HIDE_FOR_MS = 60 * 60 * 1000;

export interface PetWindowActions {
  openMain(screen: MainScreen | null): void;
  openSwap(): void;
  quit(): void;
}

function workAreas(): Rect[] {
  const primary = screen.getPrimaryDisplay();
  const others = screen.getAllDisplays().filter((display) => display.id !== primary.id);
  return [primary, ...others].map((display) => display.workArea);
}

export class PetWindowController {
  private window: BrowserWindow | null = null;
  private hiddenUntil: Date | null = null;
  private interactive = false;
  /** The "show Para" setting as last seen, to notice it being switched back on. */
  private lastWanted: boolean | null = null;

  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly actions: PetWindowActions,
    /** Called whenever the window is shown or hidden, so the Dock icon can follow. */
    private readonly onVisibilityChanged: () => void,
  ) {}

  /**
   * Makes the window match the settings and the "hide for 1 hour" timer. Safe to call often: on
   * launch, on every data change, on the periodic tick and when displays change.
   */
  sync(): void {
    const settings = getSettings(this.db);
    // Switching "Show Para on the desktop" back on is a clear request to see Para now.
    if (settings.petVisible && this.lastWanted === false) this.hiddenUntil = null;
    this.lastWanted = settings.petVisible;
    if (this.hiddenUntil !== null) {
      const remaining = this.hiddenUntil.getTime() - this.clock.now().getTime();
      // Over, or the clock was set back so far that "an hour" would last longer than an hour.
      if (remaining <= 0 || remaining > HIDE_FOR_MS) this.hiddenUntil = null;
    }
    const wanted = settings.petVisible && this.hiddenUntil === null && this.hasHatched();
    const wasVisible = this.isVisible();

    if (!wanted) {
      if (this.window && !this.window.isDestroyed() && this.window.isVisible()) {
        this.window.hide();
        // Come back click-through; the page switches it off again when the pointer is on the bird.
        this.setInteractive(false);
      }
    } else if (!this.window || this.window.isDestroyed()) {
      this.window = this.create(settings.petWindowPosition);
    } else {
      this.keepOnScreen();
      if (!this.window.isVisible()) {
        const [x = 0, y = 0] = this.window.getPosition();
        this.showAt(this.window, { x, y });
      }
    }
    if (wasVisible !== this.isVisible()) this.onVisibilityChanged();
  }

  /** The floating pet waits for the first-launch flow. No pet row yet counts as not hatched. */
  private hasHatched(): boolean {
    try {
      return getPet(this.db).hatchedAt !== null;
    } catch {
      return false;
    }
  }

  isVisible(): boolean {
    return this.window !== null && !this.window.isDestroyed() && this.window.isVisible();
  }

  /** Where the bird is on screen, or null while the pet is not showing. */
  birdRect(): Rect | null {
    const window = this.current();
    if (!window || !window.isVisible()) return null;
    const [x = 0, y = 0] = window.getPosition();
    return { x: x + PET_BIRD_BOX.x, y: y + PET_BIRD_BOX.y, width: PET_BIRD_BOX.width, height: PET_BIRD_BOX.height };
  }

  /** The window, for the trusted-sender check and for tests. */
  current(): BrowserWindow | null {
    return this.window && !this.window.isDestroyed() ? this.window : null;
  }

  moveBy(dx: number, dy: number): void {
    const window = this.current();
    if (!window) return;
    const [x = 0, y = 0] = window.getPosition();
    window.setPosition(x + dx, y + dy);
  }

  /** The drag ended: remember the position, pulling the window back if it was dropped off-screen. */
  endDrag(): void {
    const window = this.current();
    if (!window) return;
    this.keepOnScreen();
    const [x = 0, y = 0] = window.getPosition();
    updateSettings(this.db, { petWindowPosition: { x, y } });
  }

  /** While not interactive, clicks pass through to whatever is under the window. */
  setInteractive(interactive: boolean): void {
    this.interactive = interactive;
    this.current()?.setIgnoreMouseEvents(!interactive, { forward: true });
  }

  /** True while clicks pass through the window to whatever is underneath. */
  isClickThrough(): boolean {
    return !this.interactive;
  }

  hideForAnHour(): void {
    this.hiddenUntil = new Date(this.clock.now().getTime() + HIDE_FOR_MS);
    this.sync();
  }

  /** The right-click menu (PRD section 11). */
  menuTemplate(): MenuItemConstructorOptions[] {
    return [
      { label: 'Open ParaLeet', click: () => this.actions.openMain(null) },
      { label: "Swap today's problem…", click: () => this.actions.openSwap() },
      { type: 'separator' },
      { label: 'Hide Para for 1 hour', click: () => this.hideForAnHour() },
      { label: 'Settings…', click: () => this.actions.openMain('settings') },
      { type: 'separator' },
      { label: 'Quit ParaLeet', click: () => this.actions.quit() },
    ];
  }

  showMenu(): void {
    const window = this.current();
    if (window) Menu.buildFromTemplate(this.menuTemplate()).popup({ window });
  }

  destroy(): void {
    this.current()?.destroy();
    this.window = null;
  }

  /**
   * Shows the window without taking focus. macOS pushes a window fully onto the screen as it is
   * shown; the bird may sit right at an edge with the transparent part of the window hanging off,
   * so it is put back exactly where it was left.
   */
  private showAt(window: BrowserWindow, position: { x: number; y: number }): void {
    window.showInactive();
    window.setPosition(position.x, position.y);
  }

  private keepOnScreen(): void {
    const window = this.current();
    if (!window) return;
    const [x = 0, y = 0] = window.getPosition();
    const safe = keepOnScreen({ x, y }, PET_WINDOW_SIZE, workAreas(), PET_BIRD_BOX);
    if (safe.x !== x || safe.y !== y) window.setPosition(safe.x, safe.y);
  }

  private create(saved: { x: number; y: number } | null): BrowserWindow {
    const position = keepOnScreen(saved, PET_WINDOW_SIZE, workAreas(), PET_BIRD_BOX);
    const window = new BrowserWindow({
      ...PET_WINDOW_SIZE,
      ...position,
      show: false,
      frame: false,
      transparent: true,
      hasShadow: false,
      resizable: false,
      movable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      // Never takes keyboard focus from the app the user is working in.
      focusable: false,
      alwaysOnTop: true,
      title: 'Para',
      webPreferences: {
        preload: join(import.meta.dirname, '../preload/index.cjs'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    hardenWindow(window);
    window.setAlwaysOnTop(true, 'floating');
    // Side effect on macOS: this also hides the Dock icon. `updateDock` in index.ts puts it back
    // whenever the main window is open, so keep that call after any change here.
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    // If the page dies, drop the window; the next tick makes a new one.
    window.webContents.on('render-process-gone', () => {
      if (!window.isDestroyed()) window.destroy();
      if (this.window === window) this.window = null;
      this.onVisibilityChanged();
    });
    // Start click-through; the page turns it off while the pointer is over the bird.
    this.interactive = false;
    window.setIgnoreMouseEvents(true, { forward: true });
    window.once('ready-to-show', () => {
      if (window.isDestroyed()) return;
      this.showAt(window, position);
      this.onVisibilityChanged();
    });
    loadRenderer(window, '/pet');
    return window;
  }
}
