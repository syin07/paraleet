// The compact card (PRD section 11): a small popover with today's problem, "Open problem" and
// "I solved it", opened from the floating pet or from the menu bar icon. It is created when it
// opens and destroyed when it closes, so it always starts on its first view and costs nothing
// while closed.
import { join } from 'node:path';
import { app, BrowserWindow, screen } from 'electron';
import {
  CARD_MAX_HEIGHT,
  CARD_MIN_HEIGHT,
  CARD_WIDTH,
  CARD_WIDTH_REPORT,
  type CardAnchor,
} from '../../bridge/contract';
import { hardenWindow, loadRenderer } from './mainWindow';
import { placePopover, workAreaFor, type Rect, type Size } from './placement';

/** The size the card opens at, before its page has measured itself. */
export const CARD_DEFAULT_SIZE: Size = { width: CARD_WIDTH, height: 240 };
/** If the page never reports its size, show the card anyway after this long. */
const SHOW_FALLBACK_MS = 600;

export interface CardAnchors {
  /** Where the bird is on screen, or null when the floating pet is not showing. */
  pet(): Rect | null;
  /** Where the menu bar icon is, or null when there is none. */
  tray(): Rect | null;
}

export class CardWindowController {
  private window: BrowserWindow | null = null;
  private anchor: CardAnchor | null = null;
  private size: Size = CARD_DEFAULT_SIZE;
  private shown = false;
  private showTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly anchors: CardAnchors,
    /** Called when the card has been shown or closed, so the Dock rule can be applied again. */
    private readonly onVisibilityChanged: () => void = () => undefined,
  ) {}

  /** Opens the card at `anchor`. Asking again from the same place closes it. */
  toggle(anchor: CardAnchor): void {
    if (this.current() && this.anchor === anchor) this.hide();
    else this.show(anchor);
  }

  show(anchor: CardAnchor): void {
    this.hide();
    this.anchor = anchor;
    this.size = CARD_DEFAULT_SIZE;
    this.shown = false;
    const position = this.place();
    const window = new BrowserWindow({
      ...this.size,
      ...position,
      show: false,
      frame: false,
      transparent: true,
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      title: 'ParaLeet',
      webPreferences: {
        preload: join(import.meta.dirname, '../preload/index.cjs'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    this.window = window;
    hardenWindow(window);
    window.setAlwaysOnTop(true, 'floating');
    // `skipTransformProcessType`: without it this call would switch the whole app to a menu-bar-only
    // process and hide the Dock icon as a side effect. The Dock is decided in one place, index.ts.
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    // A popover: it goes away when the user clicks anywhere else.
    window.on('blur', () => {
      if (this.window === window && this.shown) this.hide();
    });
    window.on('closed', () => {
      if (this.window === window) this.forget();
    });
    // Shown once the page has said how tall it is, so it never opens at the wrong size.
    this.showTimer = setTimeout(() => this.reveal(), SHOW_FALLBACK_MS);
    loadRenderer(window, '/card');
  }

  hide(): void {
    const window = this.current();
    this.forget();
    if (window) {
      window.destroy();
      this.onVisibilityChanged();
    }
  }

  /** The page measured its content: fit the window to it and keep it on its anchor. */
  setSize(width: number, height: number): void {
    const window = this.current();
    if (!window) return;
    this.size = {
      width: width === CARD_WIDTH_REPORT ? CARD_WIDTH_REPORT : CARD_WIDTH,
      height: Math.min(Math.max(Math.round(height), CARD_MIN_HEIGHT), CARD_MAX_HEIGHT),
    };
    window.setBounds({ ...this.place(), ...this.size });
    this.reveal();
  }

  isVisible(): boolean {
    return this.current() !== null && this.shown;
  }

  current(): BrowserWindow | null {
    return this.window && !this.window.isDestroyed() ? this.window : null;
  }

  currentAnchor(): CardAnchor | null {
    return this.current() ? this.anchor : null;
  }

  private reveal(): void {
    if (this.showTimer) clearTimeout(this.showTimer);
    this.showTimer = null;
    const window = this.current();
    if (!window || this.shown) return;
    this.shown = true;
    window.show();
    // The app usually has no Dock icon and is not in front; the user just clicked Para or the
    // menu bar icon, so the card takes the keyboard for the report form.
    app.focus({ steal: true });
    window.focus();
    this.onVisibilityChanged();
  }

  private forget(): void {
    if (this.showTimer) clearTimeout(this.showTimer);
    this.showTimer = null;
    this.window = null;
    this.anchor = null;
    this.shown = false;
  }

  /** Above the bird, or under the menu bar icon; inside the screen the anchor is on. */
  private place(): { x: number; y: number } {
    const primary = screen.getPrimaryDisplay().workArea;
    const screens = screen.getAllDisplays().map((display) => ({ bounds: display.bounds, workArea: display.workArea }));
    const fromPet = this.anchor === 'pet';
    const rect =
      (fromPet ? this.anchors.pet() : this.anchors.tray()) ?? (fromPet ? this.anchors.tray() : this.anchors.pet());
    if (!rect) {
      // Nothing to hang the card on: the top-right corner of the main screen, where a menu bar icon would be.
      return { x: primary.x + primary.width - this.size.width - 12, y: primary.y + 8 };
    }
    const area = workAreaFor(rect, screens) ?? primary;
    return placePopover(
      rect,
      this.size,
      area,
      this.anchor === 'pet' ? 'above' : 'below',
      this.anchor === 'pet' ? 8 : 4,
    );
  }
}
