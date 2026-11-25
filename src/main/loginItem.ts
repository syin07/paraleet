// Launch at login (PRD section 11): on by default, starting with only Para and the menu bar icon.
// Pure decisions, so they are unit-tested without Electron.

export interface QuietStartInput {
  /** What macOS says, where it still says it (before macOS 13). */
  wasOpenedAtLogin: boolean;
  packaged: boolean;
  /** The "Launch at login" setting. */
  launchAtLogin: boolean;
  /** Seconds since the Mac started. */
  uptimeSeconds: number;
  /** False until the first-launch flow has been finished. */
  hatched: boolean;
}

/** A launch this soon after the Mac started is taken to be the login launch. */
export const LOGIN_LAUNCH_WINDOW_SECONDS = 180;

/**
 * True when the app should start without its main window: it was opened by the login item, not
 * by the user. From macOS 13 the system no longer says which it was, so a packaged app with the
 * setting on that starts within three minutes of the Mac starting is taken to be the login
 * launch. A first launch always shows the main window, where Para hatches.
 */
export function startsQuietly(input: QuietStartInput): boolean {
  if (!input.hatched) return false;
  if (input.wasOpenedAtLogin) return true;
  return input.packaged && input.launchAtLogin && input.uptimeSeconds < LOGIN_LAUNCH_WINDOW_SECONDS;
}

/**
 * Keeps the system's login item in step with the setting. `apply` is called only when the wanted
 * value changes, and only in a packaged app: a development run must never register itself.
 */
export function createLoginItemSync(options: {
  packaged: boolean;
  read: () => boolean;
  apply: (openAtLogin: boolean) => void;
}): { sync(): void; wanted(): boolean | null } {
  let wanted: boolean | null = null;
  return {
    sync() {
      const next = options.read();
      if (next === wanted) return;
      wanted = next;
      if (options.packaged) options.apply(next);
    },
    wanted: () => wanted,
  };
}
