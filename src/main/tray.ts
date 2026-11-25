// The menu bar icon (PRD section 11): Para's head with the mood's expression and the streak
// number beside it. Clicking it opens the compact card; right-clicking gives the menu.
import { Menu, nativeImage, Tray, type MenuItemConstructorOptions } from 'electron';
import { headIcon, ICON_SCALE, iconKey, streakTitle, type IconInput } from './trayIcon';
import type { Rect } from './windows/placement';

export interface TrayState extends IconInput {
  /** The streak to show beside the icon; 0 shows nothing. */
  streak: number;
  tooltip: string;
}

export interface TrayActions {
  toggleCard(): void;
  menu(): MenuItemConstructorOptions[];
}

export class TrayController {
  private tray: Tray | null = null;
  private key = '';
  private title: string | null = null;
  private tooltip = '';

  constructor(
    private readonly read: () => TrayState,
    private readonly actions: TrayActions,
  ) {}

  /** Makes the icon match Para now. Cheap when nothing changed; safe to call on every change and tick. */
  sync(): void {
    const state = this.read();
    const key = iconKey(state);
    if (!this.tray || this.tray.isDestroyed()) {
      this.tray = new Tray(this.image(state));
      this.key = key;
      this.title = null;
      this.tooltip = '';
      this.tray.on('click', () => this.actions.toggleCard());
      this.tray.on('right-click', () => {
        this.tray?.popUpContextMenu(Menu.buildFromTemplate(this.actions.menu()));
      });
    } else if (key !== this.key) {
      this.tray.setImage(this.image(state));
      this.key = key;
    }
    const title = streakTitle(state.streak);
    if (title !== this.title) {
      this.tray.setTitle(title);
      this.title = title;
    }
    if (state.tooltip !== this.tooltip) {
      this.tray.setToolTip(state.tooltip);
      this.tooltip = state.tooltip;
    }
  }

  /** Where the icon is on screen, for hanging the card under it. */
  bounds(): Rect | null {
    if (!this.tray || this.tray.isDestroyed()) return null;
    const bounds = this.tray.getBounds();
    return bounds.width > 0 && bounds.height > 0 ? bounds : null;
  }

  /** What is showing, for tests. */
  facts(): { exists: boolean; title: string; tooltip: string; key: string } {
    const exists = this.tray !== null && !this.tray.isDestroyed();
    return { exists, title: this.title ?? '', tooltip: this.tooltip, key: this.key };
  }

  destroy(): void {
    if (this.tray && !this.tray.isDestroyed()) this.tray.destroy();
    this.tray = null;
  }

  private image(state: TrayState): Electron.NativeImage {
    const icon = headIcon(state);
    return nativeImage.createFromBitmap(Buffer.from(icon.bgra), {
      width: icon.width,
      height: icon.height,
      scaleFactor: ICON_SCALE,
    });
  }
}
