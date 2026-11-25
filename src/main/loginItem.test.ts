import { describe, expect, it } from 'vitest';
import { createLoginItemSync, LOGIN_LAUNCH_WINDOW_SECONDS, startsQuietly } from './loginItem';

const base = { wasOpenedAtLogin: false, packaged: true, launchAtLogin: true, uptimeSeconds: 60, hatched: true };

describe('startsQuietly', () => {
  it('starts with only Para when the system says the app was opened at login', () => {
    expect(startsQuietly({ ...base, wasOpenedAtLogin: true, uptimeSeconds: 99999, packaged: false })).toBe(true);
  });

  it('takes a packaged launch soon after the Mac started to be the login launch', () => {
    expect(startsQuietly(base)).toBe(true);
    expect(startsQuietly({ ...base, uptimeSeconds: LOGIN_LAUNCH_WINDOW_SECONDS - 1 })).toBe(true);
    expect(startsQuietly({ ...base, uptimeSeconds: LOGIN_LAUNCH_WINDOW_SECONDS })).toBe(false);
  });

  it('shows the main window when the user opens the app later, the setting is off, or it is a development run', () => {
    expect(startsQuietly({ ...base, uptimeSeconds: 3600 })).toBe(false);
    expect(startsQuietly({ ...base, launchAtLogin: false })).toBe(false);
    expect(startsQuietly({ ...base, packaged: false })).toBe(false);
  });

  it('always shows the main window before Para has hatched', () => {
    expect(startsQuietly({ ...base, hatched: false })).toBe(false);
    expect(startsQuietly({ ...base, hatched: false, wasOpenedAtLogin: true })).toBe(false);
  });
});

describe('createLoginItemSync', () => {
  it('tells the system once per change, and only in a packaged app', () => {
    let setting = true;
    const applied: boolean[] = [];
    const item = createLoginItemSync({ packaged: true, read: () => setting, apply: (open) => applied.push(open) });
    expect(item.wanted()).toBeNull();
    item.sync();
    item.sync();
    expect(applied).toEqual([true]);
    setting = false;
    item.sync();
    item.sync();
    expect(applied).toEqual([true, false]);
    expect(item.wanted()).toBe(false);
  });

  it('never registers a development run, but still knows what is wanted', () => {
    const applied: boolean[] = [];
    const item = createLoginItemSync({ packaged: false, read: () => true, apply: (open) => applied.push(open) });
    item.sync();
    expect(applied).toEqual([]);
    expect(item.wanted()).toBe(true);
  });
});
