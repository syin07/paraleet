import { expect, test, type Page } from '@playwright/test';
import type { ParaLeetApi } from '../../src/bridge/contract';
import { captureBothSizes, openScreen } from './screenshots';

type Host = { paraleet: ParaLeetApi };

const toast = (page: Page) => page.getByRole('status');
const field = (page: Page, name: string) => page.getByRole('textbox', { name, exact: true });

/** Leaves Settings for another screen and comes back, to prove the values were stored. */
async function leaveAndReturn(page: Page): Promise<void> {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Today' }).click();
  await page.getByTestId('screen-today').waitFor();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Settings' }).click();
  await page.getByTestId('screen-settings').waitFor();
}

/** Makes the next call to a bridge method reject once. */
function failNext(page: Page, method: 'updateSettings' | 'setEquippedAccessories', message: string): Promise<void> {
  return page.evaluate(
    ([name, text]) => {
      const api = (globalThis as unknown as Host).paraleet as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
      const original = api[name] as (...args: unknown[]) => Promise<unknown>;
      let failed = false;
      api[name as string] = (...args: unknown[]) => {
        if (!failed) {
          failed = true;
          return Promise.reject(new Error(text));
        }
        return original(...args);
      };
    },
    [method, message] as const,
  );
}

test.describe('reminders', () => {
  test('both reminder times can be changed, on blur and on Enter, and are still there after leaving', async ({ page }) => {
    await openScreen(page, 'settings');
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    await expect(field(page, 'First reminder')).toHaveValue('16:00');
    await expect(field(page, 'Evening reminder')).toHaveValue('21:00');

    await field(page, 'First reminder').fill('15:30');
    await expect(toast(page)).toHaveText('');
    await field(page, 'First reminder').blur();
    await expect(toast(page)).toHaveText('Saved');

    await field(page, 'Evening reminder').fill('22:15');
    await field(page, 'Evening reminder').press('Enter');
    await expect(toast(page)).toHaveText('Saved');

    await leaveAndReturn(page);
    await expect(field(page, 'First reminder')).toHaveValue('15:30');
    await expect(field(page, 'Evening reminder')).toHaveValue('22:15');
  });

  test('the evening time may be earlier than the first time', async ({ page }) => {
    await openScreen(page, 'settings');
    await field(page, 'Evening reminder').fill('08:00');
    await field(page, 'Evening reminder').press('Enter');
    await expect(toast(page)).toHaveText('Saved');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('a time that is not valid shows a plain message and is not saved', async ({ page }) => {
    await openScreen(page, 'settings');
    for (const bad of ['25:00', '9:00', 'noon', '16:60', '']) {
      await field(page, 'First reminder').fill(bad);
      await field(page, 'First reminder').press('Enter');
      await expect(page.getByRole('alert')).toHaveText('Use a 24-hour time like 16:00');
      await field(page, 'First reminder').fill('16:00');
      await expect(page.getByRole('alert')).toHaveCount(0);
    }
    await field(page, 'First reminder').fill('25:00');
    await field(page, 'First reminder').press('Enter');
    await expect(toast(page)).toHaveText('');
    await captureBothSizes(page, 'settings-invalid-time');
    await leaveAndReturn(page);
    await expect(field(page, 'First reminder')).toHaveValue('16:00');
  });

  test('the note under the group is shown', async ({ page }) => {
    await openScreen(page, 'settings');
    await expect(page.getByText('At most two a day. Skipped once Para is fed.')).toBeVisible();
  });
});

test.describe('day boundary', () => {
  test('defaults to 04:00, offers 00:00 to 08:00, explains itself and saves', async ({ page }) => {
    await openScreen(page, 'settings');
    const select = page.getByRole('combobox', { name: 'Day starts at' });
    await expect(select).toHaveValue('4');
    await captureBothSizes(page, 'settings-save-failed');
    await expect(select.locator('option')).toHaveText(['00:00', '01:00', '02:00', '03:00', '04:00', '05:00', '06:00', '07:00', '08:00']);
    await expect(page.getByText('A solve before this hour counts for the previous day.')).toBeVisible();
    await select.selectOption('6');
    await expect(toast(page)).toHaveText('Saved');
    await leaveAndReturn(page);
    await expect(select).toHaveValue('6');
    // Today still renders its date line with the new boundary.
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Today' }).click();
    await expect(page.getByText('Wed, Nov 25')).toBeVisible();
  });
});

test.describe('review schedule', () => {
  test('target retention has four choices and each can be picked', async ({ page }) => {
    await openScreen(page, 'settings');
    const group = page.getByRole('radiogroup', { name: 'Target retention' });
    await expect(group.getByRole('radio')).toHaveText(['80%', '85%', '90%', '95%']);
    await expect(group.getByRole('radio', { name: '85%' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText(/Higher means more frequent reviews/)).toBeVisible();
    for (const [label, value] of [['80%', 0.8], ['95%', 0.95], ['85%', 0.85], ['90%', 0.9]] as const) {
      await group.getByRole('radio', { name: label }).click();
      await expect(group.getByRole('radio', { name: label })).toHaveAttribute('aria-checked', 'true');
      await expect.poll(() => page.evaluate(async () => (await (globalThis as unknown as Host).paraleet.getSettings()).targetRetention)).toBe(value);
    }
  });

  test('a saved value that is not one of the four is shown as a fifth segment', async ({ page }) => {
    await openScreen(page, 'settings');
    await page.evaluate(() => (globalThis as unknown as Host).paraleet.updateSettings({ targetRetention: 0.93 }));
    const group = page.getByRole('radiogroup', { name: 'Target retention' });
    await expect(group.getByRole('radio')).toHaveText(['80%', '85%', '90%', '93%', '95%']);
    await expect(group.getByRole('radio', { name: '93%' })).toHaveAttribute('aria-checked', 'true');
  });
});

test.describe('pet', () => {
  test('both toggles work by mouse and by keyboard and are kept', async ({ page }) => {
    await openScreen(page, 'settings');
    const show = page.getByRole('switch', { name: 'Show Para on the desktop' });
    const launch = page.getByRole('switch', { name: 'Launch at login' });
    await expect(show).toHaveAttribute('aria-checked', 'true');
    await expect(launch).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('Para and the menu bar icon start with your Mac.')).toBeVisible();

    await show.click();
    await expect(show).toHaveAttribute('aria-checked', 'false');
    await launch.click();
    await expect(launch).toHaveAttribute('aria-checked', 'false');

    await show.focus();
    await page.keyboard.press('Space');
    await expect(show).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Enter');
    await expect(show).toHaveAttribute('aria-checked', 'false');

    await leaveAndReturn(page);
    await expect(show).toHaveAttribute('aria-checked', 'false');
    await expect(launch).toHaveAttribute('aria-checked', 'false');
  });
});

test.describe('accessories', () => {
  test('an unlocked accessory can be put on and taken off, and it is kept', async ({ page }) => {
    await openScreen(page, 'settings', 'accessories');
    const group = page.getByRole('group', { name: 'Accessories' });
    const scarf = group.getByRole('button', { name: 'Scarf' });
    const bowTie = group.getByRole('button', { name: 'Bow tie' });
    const crown = group.getByRole('button', { name: 'Crown' });
    await expect(scarf).toHaveAttribute('aria-pressed', 'true');
    await expect(crown).toHaveAttribute('aria-pressed', 'true');
    await expect(bowTie).toHaveAttribute('aria-pressed', 'false');

    await bowTie.click();
    await expect(bowTie).toHaveAttribute('aria-pressed', 'true');
    await scarf.click();
    await expect(scarf).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => page.evaluate(async () => (await (globalThis as unknown as Host).paraleet.getToday()).pet.equippedAccessories)).toEqual(['bow_tie', 'crown']);

    await leaveAndReturn(page);
    await expect(scarf).toHaveAttribute('aria-pressed', 'false');
    await expect(bowTie).toHaveAttribute('aria-pressed', 'true');
    await captureBothSizes(page, 'settings-accessories');
  });

  test('a locked accessory cannot be chosen and shows what unlocks it', async ({ page }) => {
    await openScreen(page, 'settings', 'accessories');
    const cap = page.getByRole('group', { name: 'Accessories' }).getByRole('button', { name: 'Graduation cap' });
    await expect(cap).toBeDisabled();
    await expect(cap).toHaveAttribute('title', 'Finishing your first plan');
    await expect(page.getByText('Graduation cap: Finishing your first plan')).toBeVisible();
    await expect(page.getByText('Crown: A 30-day streak')).toHaveCount(0);
  });

  test('a fresh pet has every accessory locked, each with its unlock text', async ({ page }) => {
    await openScreen(page, 'settings', 'fresh');
    const group = page.getByRole('group', { name: 'Accessories' });
    for (const name of ['Scarf', 'Bow tie', 'Crown', 'Graduation cap']) await expect(group.getByRole('button', { name })).toBeDisabled();
    await expect(page.getByText('Scarf: Your first attempt rated Hard')).toBeVisible();
    await expect(page.getByText('Bow tie: A 7-day streak')).toBeVisible();
    await expect(page.getByText('Crown: A 30-day streak')).toBeVisible();
    await captureBothSizes(page, 'settings-fresh');
  });
});

test.describe('LeetCode handle', () => {
  test('is saved trimmed and capped at 64 characters, with its note', async ({ page }) => {
    await openScreen(page, 'settings');
    await expect(page.getByText('Not used yet. Saved for checking solves automatically in a later version.')).toBeVisible();
    await field(page, 'LeetCode handle').fill('  syin0519  ');
    await field(page, 'LeetCode handle').press('Enter');
    await expect(toast(page)).toHaveText('Saved');
    await leaveAndReturn(page);
    await expect(field(page, 'LeetCode handle')).toHaveValue('syin0519');

    await field(page, 'LeetCode handle').fill('x'.repeat(80));
    await expect(field(page, 'LeetCode handle')).toHaveValue('x'.repeat(64));
    await field(page, 'LeetCode handle').press('Enter');
    await expect.poll(() => page.evaluate(async () => (await (globalThis as unknown as Host).paraleet.getSettings()).leetcodeHandle)).toBe('x'.repeat(64));
  });

  test('can be cleared', async ({ page }) => {
    await openScreen(page, 'settings');
    await page.evaluate(() => (globalThis as unknown as Host).paraleet.updateSettings({ leetcodeHandle: 'abc' }));
    await expect(field(page, 'LeetCode handle')).toHaveValue('abc');
    await field(page, 'LeetCode handle').fill('');
    await field(page, 'LeetCode handle').press('Enter');
    await expect(toast(page)).toHaveText('Saved');
    await leaveAndReturn(page);
    await expect(field(page, 'LeetCode handle')).toHaveValue('');
  });
});

test.describe('saving', () => {
  test('two quick changes show one "Saved" toast, which goes away', async ({ page }) => {
    await openScreen(page, 'settings');
    await page.getByRole('switch', { name: 'Show Para on the desktop' }).click();
    await page.getByRole('switch', { name: 'Launch at login' }).click();
    await expect(toast(page).getByText('Saved')).toHaveCount(1);
    await expect(toast(page)).toHaveText('Saved');
    await expect(toast(page)).toHaveText('', { timeout: 4000 });
  });

  test('quick changes to one control end on the last choice', async ({ page }) => {
    await openScreen(page, 'settings');
    const group = page.getByRole('radiogroup', { name: 'Target retention' });
    await page.evaluate(() => {
      // Make the first save slow, so the second one has to wait for it.
      const api = (globalThis as unknown as Host).paraleet;
      const original = api.updateSettings;
      let first = true;
      api.updateSettings = async (patch) => {
        if (first) {
          first = false;
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
        return original(patch);
      };
    });
    await group.getByRole('radio', { name: '80%' }).click();
    await group.getByRole('radio', { name: '95%' }).click();
    await expect(group.getByRole('radio', { name: '95%' })).toHaveAttribute('aria-checked', 'true');
    await page.waitForTimeout(600);
    await expect(group.getByRole('radio', { name: '95%' })).toHaveAttribute('aria-checked', 'true');
    expect(await page.evaluate(async () => (await (globalThis as unknown as Host).paraleet.getSettings()).targetRetention)).toBe(0.95);
  });

  test('a failed save shows the error and puts a toggle back', async ({ page }) => {
    await openScreen(page, 'settings');
    await failNext(page, 'updateSettings', 'The database is busy');
    const show = page.getByRole('switch', { name: 'Show Para on the desktop' });
    await show.click();
    await expect(page.getByRole('alert')).toHaveText('The database is busy');
    await expect(show).toHaveAttribute('aria-checked', 'true');
    await expect(toast(page)).toHaveText('');
    await show.click();
    await expect(show).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('a failed save of a choice restores the saved choice', async ({ page }) => {
    await openScreen(page, 'settings');
    await failNext(page, 'updateSettings', 'Disk full');
    const group = page.getByRole('radiogroup', { name: 'Target retention' });
    await group.getByRole('radio', { name: '80%' }).click();
    await expect(page.getByRole('alert')).toHaveText('Disk full');
    await expect(group.getByRole('radio', { name: '85%' })).toHaveAttribute('aria-checked', 'true');
  });

  test('a save the app refuses restores the day boundary', async ({ page }) => {
    await openScreen(page, 'settings');
    await failNext(page, 'updateSettings', 'Not saved');
    const select = page.getByRole('combobox', { name: 'Day starts at' });
    await select.selectOption('1');
    await expect(page.getByRole('alert')).toHaveText('Not saved');
    await expect(select).toHaveValue('4');
    await captureBothSizes(page, 'settings-save-failed');
  });

  test('a failed save of a time keeps the typed text marked as an error and the saved value unchanged', async ({ page }) => {
    await openScreen(page, 'settings');
    await failNext(page, 'updateSettings', 'The database is busy');
    await field(page, 'First reminder').fill('17:45');
    await field(page, 'First reminder').press('Enter');
    await expect(page.getByRole('alert')).toHaveText('The database is busy');
    await expect(field(page, 'First reminder')).toHaveAttribute('aria-invalid', 'true');
    await expect(field(page, 'First reminder')).toHaveValue('17:45');
    expect(await page.evaluate(async () => (await (globalThis as unknown as Host).paraleet.getSettings()).firstReminderTime)).toBe('16:00');
  });

  test('a failed accessory change restores the worn list', async ({ page }) => {
    await openScreen(page, 'settings', 'accessories');
    await failNext(page, 'setEquippedAccessories', 'Could not change accessories');
    const bowTie = page.getByRole('group', { name: 'Accessories' }).getByRole('button', { name: 'Bow tie' });
    await bowTie.click();
    await expect(page.getByRole('alert')).toHaveText('Could not change accessories');
    await expect(bowTie).toHaveAttribute('aria-pressed', 'false');
  });

  test('the mock refuses values the real app refuses', async ({ page }) => {
    await openScreen(page, 'settings');
    const results = await page.evaluate(async () => {
      const api = (globalThis as unknown as Host).paraleet;
      const attempt = async (patch: Parameters<ParaLeetApi['updateSettings']>[0]) => {
        try {
          await api.updateSettings(patch);
          return 'ok';
        } catch (error) {
          return error instanceof Error ? 'error' : 'other';
        }
      };
      return [
        await attempt({ dayBoundaryHour: 24 }),
        await attempt({ dayBoundaryHour: 1.5 }),
        await attempt({ firstReminderTime: '9:00' }),
        await attempt({ targetRetention: 0.99 }),
        await attempt({ targetRetention: 0.8 }),
      ];
    });
    expect(results).toEqual(['error', 'error', 'error', 'error', 'ok']);
  });
});

test.describe('changes from elsewhere', () => {
  test('show up without a reload, and never overwrite a field being typed in', async ({ page }) => {
    await openScreen(page, 'settings');
    await field(page, 'LeetCode handle').click();
    await field(page, 'LeetCode handle').pressSequentially('abc');
    await page.evaluate(() => (globalThis as unknown as Host).paraleet.updateSettings({ eveningReminderTime: '22:30', leetcodeHandle: 'other' }));
    await expect(field(page, 'Evening reminder')).toHaveValue('22:30');
    await expect(field(page, 'LeetCode handle')).toHaveValue('abc');
    await expect(field(page, 'LeetCode handle')).toBeFocused();
    await field(page, 'LeetCode handle').press('Enter');
    await expect(toast(page)).toHaveText('Saved');
    await expect(field(page, 'LeetCode handle')).toHaveValue('abc');
  });
});

test.describe('the screen', () => {
  test('shows every group in order, in a column of 640px at most', async ({ page }) => {
    await openScreen(page, 'settings');
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Reminders', 'Review schedule', 'Para', 'Account handles']);
    const column = await page.getByTestId('screen-settings').locator('> div').boundingBox();
    expect(column?.width).toBeLessThanOrEqual(640);
    await captureBothSizes(page, 'settings-default');
  });

  test('has no horizontal scroll at the minimum window size', async ({ page }) => {
    await page.setViewportSize({ width: 860, height: 580 });
    await openScreen(page, 'settings', 'fresh');
    const inner = await page.getByTestId('screen-settings').evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(inner).toBe(0);
  });
});
