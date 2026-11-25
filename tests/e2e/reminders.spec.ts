import { expect, test } from '@playwright/test';
import { launchApp, makeUserDataDir, type RunningApp } from './launch';

// PRD section 12, M2: "Two daily notifications fire at the set times and are skipped once fed".
// The test's zone is Los Angeles in standard time: 16:00 there is 00:00 UTC the next day.
test('two reminders a day at the set times, never repeated, and a click opens the card', async () => {
  const data = makeUserDataDir();
  let running: RunningApp | null = null;
  try {
    // Noon: nothing yet.
    running = await launchApp({ userDataDir: data.dir, now: '2026-11-25T20:00:00.000Z' });
    await expect(running.page.getByTestId('today-title')).toHaveText('1. Two Sum');
    expect(await running.notifications()).toEqual([]);
    await running.setNow('2026-11-25T23:59:00.000Z');
    expect(await running.notifications()).toEqual([]);

    // 16:00: the first reminder, naming today's problem.
    await running.setNow('2026-11-26T00:00:30.000Z');
    await expect
      .poll(() => running?.notifications())
      .toEqual([{ title: 'Para is peckish', body: 'Today: Two Sum on LeetCode' }]);
    await running.setNow('2026-11-26T02:00:00.000Z');
    expect(await running.notifications()).toHaveLength(1);

    // Clicking it opens the compact card.
    expect((await running.card()).exists).toBe(false);
    await running.clickNotification(0);
    await running.cardPage();
    await expect.poll(async () => (await running?.card())?.visible).toBe(true);

    // A restart does not send it again.
    await running.close();
    running = await launchApp({ userDataDir: data.dir, now: '2026-11-26T02:05:00.000Z' });
    await running.setNow('2026-11-26T02:06:00.000Z');
    expect(await running.notifications()).toEqual([]);

    // 21:00: the evening reminder. Then no more that day, however long the night.
    await running.setNow('2026-11-26T05:00:10.000Z');
    await expect
      .poll(() => running?.notifications())
      .toEqual([{ title: 'Para is getting hungry', body: 'Today: Two Sum on LeetCode' }]);
    await running.setNow('2026-11-26T09:00:00.000Z');
    await running.setNow('2026-11-26T11:59:00.000Z');
    expect(await running.notifications()).toHaveLength(1);
  } finally {
    await running?.close().catch(() => undefined);
    data.remove();
  }
});

test('no reminder once Para is fed, and the reminder times in Settings are used', async () => {
  const data = makeUserDataDir();
  let running: RunningApp | null = null;
  try {
    running = await launchApp({ userDataDir: data.dir, now: '2026-11-25T20:00:00.000Z' });
    const main = running.page;
    // Move the first reminder to 12:30; it is 12:00.
    await main.evaluate(() =>
      (
        globalThis as unknown as { paraleet: { updateSettings(patch: object): Promise<unknown> } }
      ).paraleet.updateSettings({ firstReminderTime: '12:30' }),
    );
    await running.setNow('2026-11-25T20:31:00.000Z');
    await expect
      .poll(() => running?.notifications())
      .toEqual([{ title: 'Para is peckish', body: 'Today: Two Sum on LeetCode' }]);

    // Fed before the evening: no evening reminder.
    await main.getByRole('button', { name: 'I solved it' }).click();
    await main.getByRole('radio', { name: /^Good/ }).click();
    await main.getByRole('button', { name: 'Feed Para' }).click();
    await expect(main.getByTestId('pet-status')).toHaveText('Para is fed for today');
    await running.setNow('2026-11-26T05:30:00.000Z');
    await running.setNow('2026-11-26T08:00:00.000Z');
    expect(await running.notifications()).toHaveLength(1);
  } finally {
    await running?.close().catch(() => undefined);
    data.remove();
  }
});

// PRD section 12, M2: "Launch at login works".
test('opened at login, the app starts with only Para and the menu bar icon', async () => {
  const data = makeUserDataDir();
  let running: RunningApp | null = null;
  try {
    // A first run so Para exists and the setting can be read.
    running = await launchApp({ userDataDir: data.dir, now: '2026-11-25T20:00:00.000Z' });
    // "Launch at login" is on by default, and the app asks the system for what the setting says.
    expect(await running.loginItemWanted()).toBe(true);
    await running.page.evaluate(() =>
      (
        globalThis as unknown as { paraleet: { updateSettings(patch: object): Promise<unknown> } }
      ).paraleet.updateSettings({ launchAtLogin: false }),
    );
    await expect.poll(() => running?.loginItemWanted()).toBe(false);
    await running.page.evaluate(() =>
      (
        globalThis as unknown as { paraleet: { updateSettings(patch: object): Promise<unknown> } }
      ).paraleet.updateSettings({ launchAtLogin: true }),
    );
    await expect.poll(() => running?.loginItemWanted()).toBe(true);
    await running.close();

    // The login launch: no main window, Para on the desktop, the icon in the menu bar, no Dock icon.
    running = await launchApp({ userDataDir: data.dir, now: '2026-11-26T16:00:00.000Z', atLogin: true });
    await expect(running.page.getByTestId('pet-bird')).toBeVisible();
    expect(await running.mainWindowOpen()).toBe(false);
    expect((await running.pet()).visible).toBe(true);
    expect((await running.tray()).exists).toBe(true);
    await expect.poll(() => running?.dockVisible()).toBe(false);

    // The main window is one click away.
    await running.clickTrayMenu('Open ParaLeet');
    const main = await running.mainPage();
    await expect(main.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    await expect.poll(() => running?.dockVisible()).toBe(true);
  } finally {
    await running?.close().catch(() => undefined);
    data.remove();
  }
});

test('a first launch shows the main window even when opened at login', async () => {
  const data = makeUserDataDir();
  let running: RunningApp | null = null;
  try {
    running = await launchApp({
      userDataDir: data.dir,
      now: '2026-11-25T20:00:00.000Z',
      hatched: false,
      atLogin: true,
    });
    expect(await running.mainWindowOpen()).toBe(true);
    expect(await running.notifications()).toEqual([]);
    // Not hatched: no reminder, even late in the evening.
    await running.setNow('2026-11-26T06:00:00.000Z');
    expect(await running.notifications()).toEqual([]);
  } finally {
    await running?.close().catch(() => undefined);
    data.remove();
  }
});

test('the swap choices can be opened straight from another window', async () => {
  const data = makeUserDataDir();
  let running: RunningApp | null = null;
  try {
    running = await launchApp({ userDataDir: data.dir, now: '2026-11-25T20:00:00.000Z' });
    const main = running.page;
    await main.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Settings' }).click();
    const pet = await running.petPage();
    await pet.evaluate(() =>
      (globalThis as unknown as { paraleet: { showSwap(): Promise<unknown> } }).paraleet.showSwap(),
    );
    await expect(main.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    await expect(main.getByRole('dialog')).toContainText('swap');
  } finally {
    await running?.close().catch(() => undefined);
    data.remove();
  }
});
