import { expect, test } from '@playwright/test';
import { launchApp, makeUserDataDir, type RunningApp } from './launch';

// Settings saved in the real app go through the bridge into the database file and are still
// there after a restart; values the app does not accept are refused by the main process.
test('settings are saved at once and survive a restart', async () => {
  const data = makeUserDataDir();
  let running: RunningApp | null = null;
  try {
    running = await launchApp({ userDataDir: data.dir, now: '2026-11-25T20:00:00.000Z' });
    let page = running.page;
    await page.getByRole('navigation').getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();

    // The defaults.
    await expect(page.getByLabel('First reminder')).toHaveValue('16:00');
    await expect(page.getByLabel('Evening reminder')).toHaveValue('21:00');
    await expect(page.getByLabel('Day starts at')).toHaveValue('4');
    await expect(page.getByRole('switch', { name: 'Launch at login' })).toBeChecked();

    await page.getByLabel('First reminder').fill('15:30');
    await page.getByLabel('First reminder').press('Enter');
    await expect(page.getByRole('status')).toHaveText('Saved');
    await page.getByRole('radio', { name: '90%' }).click();
    await page.getByRole('switch', { name: 'Launch at login' }).click();
    await page.getByLabel('LeetCode handle').fill('  para_fan  ');
    await page.getByLabel('LeetCode handle').press('Enter');
    await expect(page.getByLabel('LeetCode handle')).toHaveValue('para_fan');

    // A time the app cannot use is refused on the screen and never reaches the database.
    await page.getByLabel('Evening reminder').fill('25:00');
    await page.getByLabel('Evening reminder').press('Enter');
    await expect(page.getByRole('alert')).toHaveText('Use a 24-hour time like 16:00');

    // The main process itself refuses values outside the limits, whatever the screen does.
    const refused = await page.evaluate(async () => {
      const api = (globalThis as unknown as { paraleet: { updateSettings(patch: object): Promise<unknown> } }).paraleet;
      const results: string[] = [];
      for (const patch of [{ dayBoundaryHour: 99 }, { firstReminderTime: 'noon' }, { targetRetention: 2 }]) {
        try {
          await api.updateSettings(patch);
          results.push('accepted');
        } catch {
          results.push('refused');
        }
      }
      return results;
    });
    expect(refused).toEqual(['refused', 'refused', 'refused']);
    await running.close();

    running = await launchApp({ userDataDir: data.dir, now: '2026-11-25T20:05:00.000Z' });
    page = running.page;
    await page.getByRole('navigation').getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByLabel('First reminder')).toHaveValue('15:30');
    await expect(page.getByLabel('Evening reminder')).toHaveValue('21:00');
    await expect(page.getByRole('radio', { name: '90%' })).toBeChecked();
    await expect(page.getByRole('switch', { name: 'Launch at login' })).not.toBeChecked();
    await expect(page.getByRole('switch', { name: 'Show Para on the desktop' })).toBeChecked();
    await expect(page.getByLabel('LeetCode handle')).toHaveValue('para_fan');
    await expect(page.getByLabel('Day starts at')).toHaveValue('4');
  } finally {
    await running?.close().catch(() => undefined);
    data.remove();
  }
});
