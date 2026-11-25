import { expect, test, type Page } from '@playwright/test';
import type { ParaLeetApi } from '../../src/bridge/contract';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { captureBothSizes, openScreen, WINDOW_DEFAULT, WINDOW_MIN } from './screenshots';

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

/** Captures the bottom of the scrolled page at both sizes, as `<name>-lower-default.png` and `-min.png`. */
async function captureLower(page: Page, name: string): Promise<void> {
  const dir = resolve(import.meta.dirname, '../../artifacts/screenshots');
  mkdirSync(dir, { recursive: true });
  for (const [label, size] of [['min', WINDOW_MIN], ['default', WINDOW_DEFAULT]] as const) {
    await page.setViewportSize(size);
    await page.getByTestId('screen-settings').evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await page.screenshot({ path: resolve(dir, `${name}-lower-${label}.png`), animations: 'disabled' });
  }
}

/** Makes the first call to `updateSettings` or `setEquippedAccessories` wait `ms` before it runs. */
function slowFirst(page: Page, method: 'updateSettings' | 'setEquippedAccessories', ms: number): Promise<void> {
  return page.evaluate(
    ([name, delay]) => {
      const api = (globalThis as unknown as Host).paraleet as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
      const original = api[name] as (...args: unknown[]) => Promise<unknown>;
      let first = true;
      api[name as string] = async (...args: unknown[]) => {
        if (first) {
          first = false;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
        return original(...args);
      };
    },
    [method, ms] as const,
  );
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
    await captureLower(page, 'settings-accessories');
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
    await expect(page.getByText('Scarf: Solving your first Hard problem')).toBeVisible();
    await expect(page.getByText('Bow tie: A 7-day streak')).toBeVisible();
    await expect(page.getByText('Crown: A 30-day streak')).toBeVisible();
    await captureBothSizes(page, 'settings-fresh');
    await captureLower(page, 'settings-fresh');
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
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Reminders', 'Review schedule', 'Para', 'Learning plans', 'Account handles']);
    const column = await page.getByTestId('screen-settings').locator('> div').boundingBox();
    expect(column?.width).toBeLessThanOrEqual(640);
    await captureBothSizes(page, 'settings-default');
    await captureLower(page, 'settings-default');
  });

  test('has no horizontal scroll at the minimum window size', async ({ page }) => {
    await page.setViewportSize({ width: 860, height: 580 });
    await openScreen(page, 'settings', 'fresh');
    const inner = await page.getByTestId('screen-settings').evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(inner).toBe(0);
  });
});

test.describe('review fixes', () => {
  test('time inputs are 96px and the handle 200px wide at both window sizes', async ({ page }) => {
    await openScreen(page, 'settings');
    for (const size of [WINDOW_DEFAULT, WINDOW_MIN]) {
      await page.setViewportSize(size);
      for (const name of ['First reminder', 'Evening reminder']) {
        expect((await field(page, name).boundingBox())?.width).toBe(96);
      }
      expect((await field(page, 'LeetCode handle').boundingBox())?.width).toBe(200);
    }
  });

  test('a saved retention a hair off a choice marks that choice and adds no fifth segment', async ({ page }) => {
    await openScreen(page, 'settings');
    await page.evaluate(() => (globalThis as unknown as Host).paraleet.updateSettings({ targetRetention: 0.9000000001 }));
    const group = page.getByRole('radiogroup', { name: 'Target retention' });
    await expect(group.getByRole('radio', { name: '90%' })).toHaveAttribute('aria-checked', 'true');
    await expect(group.getByRole('radio')).toHaveCount(4);
    await expect(group.getByRole('radio', { name: '85%' })).toHaveAttribute('aria-checked', 'false');
  });

  test('two different settings changed during a slow first save both keep their new values', async ({ page }) => {
    await openScreen(page, 'settings');
    await slowFirst(page, 'updateSettings', 500);
    const show = page.getByRole('switch', { name: 'Show Para on the desktop' });
    const launch = page.getByRole('switch', { name: 'Launch at login' });
    await show.click();
    await launch.click();
    for (let i = 0; i < 5; i += 1) {
      await expect(show).toHaveAttribute('aria-checked', 'false');
      await expect(launch).toHaveAttribute('aria-checked', 'false');
      await page.waitForTimeout(150);
    }
    await expect(toast(page)).toHaveText('Saved');
    await expect(show).toHaveAttribute('aria-checked', 'false');
    await expect(launch).toHaveAttribute('aria-checked', 'false');
    const saved = await page.evaluate(() => (globalThis as unknown as Host).paraleet.getSettings());
    expect([saved.petVisible, saved.launchAtLogin]).toEqual([false, false]);
  });

  test('text typed after Enter while the save is still running is not lost', async ({ page }) => {
    await openScreen(page, 'settings');
    await slowFirst(page, 'updateSettings', 500);
    const handle = field(page, 'LeetCode handle');
    await handle.fill('abc');
    await handle.press('Enter');
    await handle.click();
    await handle.pressSequentially('def');
    await page.waitForTimeout(900);
    await expect(handle).toHaveValue('abcdef');
    await handle.press('Enter');
    await expect(toast(page)).toHaveText('Saved');
    await expect.poll(() => page.evaluate(async () => (await (globalThis as unknown as Host).paraleet.getSettings()).leetcodeHandle)).toBe('abcdef');
  });

  test('a second accessory change builds on the first while it is in flight', async ({ page }) => {
    await openScreen(page, 'settings', 'accessories');
    await slowFirst(page, 'setEquippedAccessories', 500);
    const group = page.getByRole('group', { name: 'Accessories' });
    const bowTie = group.getByRole('button', { name: 'Bow tie' });
    const scarf = group.getByRole('button', { name: 'Scarf' });
    await bowTie.click();
    await scarf.click();
    await expect(bowTie).toHaveAttribute('aria-pressed', 'true');
    await expect(scarf).toHaveAttribute('aria-pressed', 'false');
    await page.waitForTimeout(900);
    await expect(bowTie).toHaveAttribute('aria-pressed', 'true');
    await expect(scarf).toHaveAttribute('aria-pressed', 'false');
    expect(await page.evaluate(async () => (await (globalThis as unknown as Host).paraleet.getToday()).pet.equippedAccessories)).toEqual(['bow_tie', 'crown']);
  });
});

// ---------- Learning plans (SAN-131) ----------

const SECRET_KEY = 'sk-ant-test-0123456789-secret';
const keyField = (page: Page) => page.getByLabel('Anthropic API key');
const plansGroup = (page: Page) => page.getByRole('region', { name: 'Learning plans' });
type AnyApi = Record<string, (...args: unknown[]) => Promise<unknown>>;

/** Makes the next call to a bridge method reject once with `message`. */
function failBridgeNext(page: Page, method: string, message: string): Promise<void> {
  return page.evaluate(
    ([name, text]) => {
      const api = (globalThis as unknown as Host).paraleet as unknown as AnyApi;
      const original = api[name as string] as (...args: unknown[]) => Promise<unknown>;
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

/** Makes every call to a bridge method reject until `restoreBridge` runs. */
function failBridgeAlways(page: Page, method: string, message: string): Promise<void> {
  return page.evaluate(
    ([name, text]) => {
      const api = (globalThis as unknown as Host).paraleet as unknown as AnyApi;
      const host = globalThis as unknown as { __original?: Record<string, unknown> };
      host.__original = { ...host.__original, [name as string]: api[name as string] };
      api[name as string] = () => Promise.reject(new Error(text));
    },
    [method, message] as const,
  );
}

function restoreBridge(page: Page, method: string): Promise<void> {
  return page.evaluate((name) => {
    const api = (globalThis as unknown as Host).paraleet as unknown as AnyApi;
    const host = globalThis as unknown as { __original: Record<string, (...args: unknown[]) => Promise<unknown>> };
    api[name] = host.__original[name] as (...args: unknown[]) => Promise<unknown>;
  }, method);
}

/** Waits until the group has loaded (it first shows "Loading…" or a failure), then scrolls it into view. */
async function showPlans(page: Page): Promise<void> {
  await expect(plansGroup(page).getByText('Model', { exact: true }).or(plansGroup(page).getByRole('button', { name: 'Try again' }))).toBeVisible();
  await plansGroup(page).evaluate((element) => element.scrollIntoView({ block: 'center' }));
}

test.describe('learning plans', () => {
  test('the group sits between Para and Account handles, with a key row and a model row', async ({ page }) => {
    await openScreen(page, 'settings');
    const titles = await page.getByTestId('screen-settings').getByRole('heading', { level: 2 }).allTextContents();
    expect(titles.indexOf('Learning plans')).toBe(titles.indexOf('Para') + 1);
    expect(titles.indexOf('Account handles')).toBe(titles.indexOf('Learning plans') + 1);
    await expect(plansGroup(page).getByText('Anthropic API key', { exact: true })).toBeVisible();
    await expect(plansGroup(page).getByText('Model', { exact: true })).toBeVisible();
    await expect(plansGroup(page).getByText('Used only to build learning plans.', { exact: false })).toBeVisible();
    await expect(plansGroup(page).getByText('The Claude model that picks problems for a plan.')).toBeVisible();
  });

  test('with no key: Save waits for 10 characters, a refused save explains, a saved key is never shown again', async ({ page }) => {
    await openScreen(page, 'settings', 'plan-nokey');
    await showPlans(page);
    const save = plansGroup(page).getByRole('button', { name: 'Save' });
    await expect(keyField(page)).toHaveAttribute('type', 'password');
    await expect(save).toBeDisabled();
    await keyField(page).fill('123456789');
    await expect(save).toBeDisabled();
    await keyField(page).fill('1234567890');
    await expect(save).toBeEnabled();
    await captureBothSizes(page, 'settings-plans-nokey');

    await failBridgeNext(page, 'saveApiKey', 'The key could not be saved right now.');
    await save.click();
    await expect(plansGroup(page).getByRole('alert')).toHaveText('The key could not be saved right now.');
    await expect(keyField(page)).toBeVisible();

    await keyField(page).fill(SECRET_KEY);
    await expect(plansGroup(page).getByRole('alert')).toHaveCount(0);
    await keyField(page).press('Enter');
    await expect(plansGroup(page).getByText('Saved, encrypted')).toBeVisible();
    await expect(keyField(page)).toHaveCount(0);
    await expect(plansGroup(page).getByRole('button', { name: 'Test' })).toBeVisible();
    await expect(plansGroup(page).getByRole('button', { name: 'Remove' })).toBeVisible();
    expect(await page.content()).not.toContain(SECRET_KEY);
    expect(await page.locator('input').evaluateAll((inputs) => inputs.map((input) => (input as unknown as { value: string }).value))).not.toContain(SECRET_KEY);
    await captureBothSizes(page, 'settings-plans-saved');
  });

  test('with a key: Test says it works, shows it is busy, and Remove goes back to the field', async ({ page }) => {
    await openScreen(page, 'settings');
    await showPlans(page);
    await expect(plansGroup(page).getByText('Saved, encrypted')).toBeVisible();
    await expect(keyField(page)).toHaveCount(0);

    await page.evaluate(() => {
      const api = (globalThis as unknown as Host).paraleet as unknown as AnyApi;
      const original = api.testApiKey as (...args: unknown[]) => Promise<unknown>;
      const counter = globalThis as unknown as { __tests: number };
      counter.__tests = 0;
      api.testApiKey = async (...args: unknown[]) => {
        counter.__tests += 1;
        await new Promise((resolve) => setTimeout(resolve, 600));
        return original(...args);
      };
    });
    await plansGroup(page).getByRole('button', { name: 'Test' }).click();
    await expect(plansGroup(page).getByRole('button', { name: 'Testing…' })).toBeDisabled();
    await expect(plansGroup(page).getByRole('button', { name: 'Remove' })).toBeDisabled();
    await expect(plansGroup(page).getByText('The key works.')).toBeVisible();
    expect(await page.evaluate(() => (globalThis as unknown as { __tests: number }).__tests)).toBe(1);
    await expect(plansGroup(page).getByRole('alert')).toHaveCount(0);
    await captureBothSizes(page, 'settings-plans-test-ok');

    await plansGroup(page).getByRole('button', { name: 'Remove' }).click();
    await expect(keyField(page)).toBeVisible();
    await expect(plansGroup(page).getByText('Saved, encrypted')).toHaveCount(0);
    await expect(plansGroup(page).getByText('The key works.')).toHaveCount(0);
    await expect.poll(() => page.evaluate(async () => (await (globalThis as unknown as Host).paraleet.getPlanOverview()).llm.hasKey)).toBe(false);
  });

  test('a key Anthropic does not accept: Test says why in plain words', async ({ page }) => {
    await openScreen(page, 'settings', 'plan-badkey');
    await showPlans(page);
    await plansGroup(page).getByRole('button', { name: 'Test' }).click();
    await expect(plansGroup(page).getByRole('alert')).toHaveText('Anthropic did not accept the API key. Check it in Settings.');
    await expect(plansGroup(page).getByText('The key works.')).toHaveCount(0);
    await captureBothSizes(page, 'settings-plans-test-failed');
  });

  test('a key that works but cannot use the chosen model says so and suggests another', async ({ page }) => {
    await openScreen(page, 'settings');
    await showPlans(page);
    await plansGroup(page).getByRole('combobox', { name: 'Model' }).selectOption({ label: 'Other…' });
    await field(page, 'Model ID').fill('claude-not-a-model');
    await field(page, 'Model ID').press('Enter');
    await expect(toast(page)).toHaveText('Saved');
    await plansGroup(page).getByRole('button', { name: 'Test' }).click();
    await expect(plansGroup(page).getByText(/cannot use the chosen model/)).toContainText('Pick another model');
    await expect(plansGroup(page).getByText('The key works.', { exact: true })).toHaveCount(0);
  });

  test('a Mac that cannot encrypt: plain message, field and Save disabled', async ({ page }) => {
    await openScreen(page, 'settings', 'plan-nostore');
    await showPlans(page);
    await expect(plansGroup(page).getByText('The key cannot be stored securely on this Mac, so learning plans are not available.')).toBeVisible();
    await expect(keyField(page)).toBeDisabled();
    await expect(plansGroup(page).getByRole('button', { name: 'Save' })).toBeDisabled();
    await captureBothSizes(page, 'settings-plans-nostore');
  });

  test('the model: pick a suggested one, it is saved and kept', async ({ page }) => {
    await openScreen(page, 'settings');
    await showPlans(page);
    const select = plansGroup(page).getByRole('combobox', { name: 'Model' });
    const labels = await select.locator('option').allTextContents();
    expect(labels.at(-1)).toBe('Other…');
    expect(labels).toContain('Claude Sonnet 5.5 (faster, cheaper)');
    await select.selectOption({ label: 'Claude Sonnet 5.5 (faster, cheaper)' });
    await expect(toast(page)).toHaveText('Saved');
    await expect(field(page, 'Model ID')).toHaveCount(0);
    await leaveAndReturn(page);
    await expect(plansGroup(page).getByRole('combobox', { name: 'Model' })).toHaveValue('claude-sonnet-5-5');
  });

  test('the model: Other reveals a text field, saved on Enter and on blur, and a saved unknown ID shows as Other', async ({ page }) => {
    await openScreen(page, 'settings');
    await showPlans(page);
    const select = plansGroup(page).getByRole('combobox', { name: 'Model' });
    await expect(field(page, 'Model ID')).toHaveCount(0);
    await select.selectOption({ label: 'Other…' });
    await expect(field(page, 'Model ID')).toBeVisible();
    await expect(toast(page)).toHaveText('');

    await field(page, 'Model ID').fill('claude-custom-1');
    await field(page, 'Model ID').press('Enter');
    await expect(toast(page)).toHaveText('Saved');
    await leaveAndReturn(page);
    await expect(select).toHaveValue('__other__');
    await expect(select.locator('option:checked')).toHaveText('Other…');
    await expect(field(page, 'Model ID')).toHaveValue('claude-custom-1');
    await showPlans(page);
    await captureBothSizes(page, 'settings-plans-other-model');

    await field(page, 'Model ID').fill('claude-custom-2');
    await field(page, 'Model ID').blur();
    await expect(toast(page)).toHaveText('Saved');
    await expect.poll(() => page.evaluate(async () => (await (globalThis as unknown as Host).paraleet.getSettings()).planModel)).toBe('claude-custom-2');
  });

  test('the model: a refused ID shows the message under the row and the control goes back to the saved value', async ({ page }) => {
    await openScreen(page, 'settings');
    await showPlans(page);
    const select = plansGroup(page).getByRole('combobox', { name: 'Model' });
    await select.selectOption({ label: 'Other…' });
    await failNext(page, 'updateSettings', 'Use a model ID such as claude-opus-5-5');
    await field(page, 'Model ID').fill('not valid!');
    await field(page, 'Model ID').press('Enter');
    await expect(plansGroup(page).getByRole('alert')).toHaveText('Use a model ID such as claude-opus-5-5');
    await expect(field(page, 'Model ID')).toHaveCount(0);
    await expect(select).toHaveValue('claude-opus-5-5');
    await expect.poll(() => page.evaluate(async () => (await (globalThis as unknown as Host).paraleet.getSettings()).planModel)).toBe('claude-opus-5-5');

    // The same refusal on a saved custom ID puts the saved ID back in the text field.
    await select.selectOption({ label: 'Other…' });
    await field(page, 'Model ID').fill('claude-custom-1');
    await field(page, 'Model ID').press('Enter');
    await expect(toast(page)).toHaveText('Saved');
    await failNext(page, 'updateSettings', 'Use a model ID such as claude-opus-5-5');
    await field(page, 'Model ID').fill('bad id');
    await field(page, 'Model ID').press('Enter');
    await expect(plansGroup(page).getByRole('alert')).toBeVisible();
    await expect(field(page, 'Model ID')).toHaveValue('claude-custom-1');
  });

  test('arriving at #/settings/api-key focuses the key field, or Test when a key is saved', async ({ page }) => {
    await page.goto('/?scenario=plan-nokey#/settings/api-key');
    await page.getByTestId('screen-settings').waitFor();
    await expect(keyField(page)).toBeFocused();
    await expect(keyField(page)).toBeInViewport();
    expect(new URL(page.url()).hash).toBe('#/settings');

    await page.goto('/?scenario=default#/settings/api-key');
    await page.getByTestId('screen-settings').waitFor();
    await expect(plansGroup(page).getByRole('button', { name: 'Test' })).toBeFocused();
    await expect(plansGroup(page).getByRole('button', { name: 'Test' })).toBeInViewport();
  });

  test('if the key setting cannot be read: a message and Try again, and the rest of Settings still works', async ({ page }) => {
    await openScreen(page, 'settings');
    await failBridgeAlways(page, 'getPlanOverview', 'The key store did not answer.');
    await leaveAndReturn(page);
    await showPlans(page);
    await expect(plansGroup(page).getByRole('alert')).toContainText('The key store did not answer.');
    await expect(plansGroup(page).getByRole('button', { name: 'Try again' })).toBeVisible();
    await expect(plansGroup(page).getByText('Anthropic API key', { exact: true })).toHaveCount(0);
    await captureBothSizes(page, 'settings-plans-load-failed');

    await field(page, 'First reminder').fill('15:45');
    await field(page, 'First reminder').press('Enter');
    await expect(toast(page)).toHaveText('Saved');

    await restoreBridge(page, 'getPlanOverview');
    await plansGroup(page).getByRole('button', { name: 'Try again' }).click();
    await expect(plansGroup(page).getByText('Saved, encrypted')).toBeVisible();
    await expect(plansGroup(page).getByRole('alert')).toHaveCount(0);
  });
});
