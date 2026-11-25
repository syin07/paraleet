import { expect, test, type Page } from '@playwright/test';
import type { ParaLeetApi } from '../../src/bridge/contract';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { captureBothSizes, openScreen, WINDOW_DEFAULT, WINDOW_MIN } from './screenshots';

type Host = { paraleet: ParaLeetApi; __calls?: Record<string, number> };

const group = (page: Page) => page.getByRole('region', { name: 'Data', exact: true });
const dialog = (page: Page) => page.getByRole('dialog');
const exportButton = (page: Page) => group(page).getByRole('button', { name: 'Export…' });
const importButton = (page: Page) => group(page).getByRole('button', { name: 'Import…' });

async function open(page: Page, scenario = 'default'): Promise<void> {
  await openScreen(page, 'settings', scenario);
  await group(page).scrollIntoViewIfNeeded();
  await expect(group(page).getByText('Show in Finder')).toBeVisible();
}

/** Counts calls to bridge methods and optionally slows them, without changing what they return. */
function spy(page: Page, methods: string[], delayMs = 0): Promise<void> {
  return page.evaluate(
    ([names, delay]) => {
      const host = globalThis as unknown as Host;
      const api = host.paraleet as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
      host.__calls = {};
      for (const name of names as string[]) {
        const original = api[name] as (...args: unknown[]) => Promise<unknown>;
        api[name] = async (...args: unknown[]) => {
          host.__calls![name] = (host.__calls![name] ?? 0) + 1;
          if (delay) await new Promise((resolve) => setTimeout(resolve, delay as number));
          return original(...args);
        };
      }
    },
    [methods, delayMs] as const,
  );
}

const calls = (page: Page, name: string): Promise<number> =>
  page.evaluate((method) => (globalThis as unknown as Host).__calls?.[method] ?? 0, name);

const restarts = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    (globalThis as unknown as { __paraleetMock: { windowCalls(): string[] } }).__paraleetMock.windowCalls(),
  );

/** The cell of the comparison table: column 0 is the file, column 1 is what is in ParaLeet now. */
const cell = (page: Page, row: string, column: 0 | 1) =>
  dialog(page)
    .getByRole('row')
    .filter({ has: page.getByRole('rowheader', { name: row, exact: true }) })
    .getByRole('cell')
    .nth(column);

/** Like captureBothSizes, but scrolled to the bottom, where this group is. Same file names. */
async function captureGroup(page: Page, name: string): Promise<void> {
  const dir = resolve(import.meta.dirname, '../../artifacts/screenshots');
  mkdirSync(dir, { recursive: true });
  for (const [label, size] of [
    ['min', WINDOW_MIN],
    ['default', WINDOW_DEFAULT],
  ] as const) {
    await page.setViewportSize(size);
    await page.getByTestId('screen-settings').evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await page.screenshot({ path: resolve(dir, `settings-data-${name}-${label}.png`), animations: 'disabled' });
  }
}

async function openDialog(page: Page, scenario = 'default'): Promise<void> {
  await open(page, scenario);
  await importButton(page).click();
  await expect(dialog(page)).toBeVisible();
}

async function assertGroupFitsAt(page: Page, size: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(size);
  const box = await group(page).boundingBox();
  const finder = await group(page).getByRole('button', { name: 'Show in Finder' }).boundingBox();
  expect(box).not.toBeNull();
  expect(finder).not.toBeNull();
  // The button stays inside the card and the page never scrolls sideways.
  expect(finder!.x + finder!.width).toBeLessThanOrEqual(box!.x + box!.width + 1);
  const scroller = page.getByTestId('screen-settings');
  expect(await scroller.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
}

test.describe('Settings: Data group', () => {
  // Criterion 1
  test('is the last group on the page, with the same rows as the others', async ({ page }) => {
    await open(page);
    const names = await page
      .getByTestId('screen-settings')
      .locator('section[aria-label]')
      .evaluateAll((all) => all.map((s) => s.getAttribute('aria-label')));
    expect(names.at(-1)).toBe('Data');
    await expect(group(page).getByText('Export data', { exact: true })).toBeVisible();
    await expect(group(page).getByText('Import data', { exact: true })).toBeVisible();
    await expect(group(page).getByText('Your API key is not part of the copy.')).toBeVisible();
    await captureGroup(page, 'rest');
  });

  // Criterion 2
  test('export: saved names the file, not the path', async ({ page }) => {
    await open(page);
    await exportButton(page).click();
    await expect(group(page).getByText(/^Saved as ParaLeet backup .*\.sqlite3\.$/)).toBeVisible();
    await expect(group(page).getByText('/Users/you/Documents')).toHaveCount(0);
    await expect(group(page).getByRole('alert')).toHaveCount(0);
    await captureGroup(page, 'export-saved');
  });

  test('export: closing the dialog shows nothing and no error', async ({ page }) => {
    await open(page, 'data-cancel');
    await exportButton(page).click();
    await expect(exportButton(page)).toBeEnabled();
    await expect(group(page).getByText(/Saved as/)).toHaveCount(0);
    await expect(group(page).getByRole('alert')).toHaveCount(0);
  });

  test('export: a failure shows its message and the button works again', async ({ page }) => {
    await open(page, 'data-export-fails');
    await exportButton(page).click();
    await expect(group(page).getByRole('alert')).toHaveText(
      'The copy could not be saved there. Choose another place and try again.',
    );
    await expect(exportButton(page)).toBeEnabled();
    await captureGroup(page, 'export-failed');
  });

  test('export: busy while it runs and pressed twice calls once', async ({ page }) => {
    await open(page);
    await spy(page, ['exportData'], 400);
    await exportButton(page).click();
    await expect(exportButton(page)).toBeDisabled();
    await exportButton(page)
      .click({ force: true, noWaitAfter: true })
      .catch(() => undefined);
    await expect(group(page).getByText(/^Saved as/)).toBeVisible();
    expect(await calls(page, 'exportData')).toBe(1);
  });

  // Criterion 3
  test('import: closing the dialog does nothing', async ({ page }) => {
    await open(page, 'data-cancel');
    await importButton(page).click();
    await expect(importButton(page)).toBeEnabled();
    await expect(dialog(page)).toHaveCount(0);
    await expect(group(page).getByRole('alert')).toHaveCount(0);
  });

  for (const [scenario, file, reason] of [
    ['data-import-bad', 'recipes.sqlite3', 'That file is not a ParaLeet database.'],
    [
      'data-import-newer',
      'ParaLeet backup 2027-03-01.sqlite3',
      'That file was made by a newer ParaLeet. Update ParaLeet, then import it.',
    ],
  ] as const) {
    test(`import: a refused file (${scenario}) says why and that nothing changed`, async ({ page }) => {
      await open(page, scenario);
      await importButton(page).click();
      const alert = group(page).getByRole('alert');
      await expect(alert).toContainText(file);
      await expect(alert).toContainText(reason);
      await expect(alert).toContainText('Nothing was changed.');
      await expect(dialog(page)).toHaveCount(0);
      await captureGroup(page, scenario === 'data-import-bad' ? 'refused' : 'refused-newer');
    });
  }

  // Criterion 4
  test('import: the dialog shows both sides, the warning, the backup and the restart', async ({ page }) => {
    await openDialog(page);
    const box = dialog(page);
    await expect(box).toContainText('ParaLeet backup 2026-10-31.sqlite3');
    await expect(cell(page, 'Attempts', 0)).toHaveText('214');
    await expect(cell(page, 'Problems', 0)).toHaveText('96');
    await expect(cell(page, 'First day', 0)).toHaveText('Mar 2, 2026');
    await expect(cell(page, 'Last day', 0)).toHaveText('Oct 31, 2026');
    await expect(cell(page, 'Longest streak', 0)).toHaveText('41 days');
    await expect(cell(page, 'Attempts', 1)).toHaveText('12');
    await expect(box.getByRole('columnheader', { name: 'In the file' })).toBeVisible();
    await expect(box.getByRole('columnheader', { name: 'In ParaLeet now' })).toBeVisible();
    await expect(box).toContainText('will be replaced');
    await expect(box).toContainText('paraleet.sqlite3.before-import');
    await expect(box).toContainText('ParaLeet restarts');
    await expect(box).not.toContainText('earlier import');
    await expect(box.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(box.getByRole('button', { name: 'Replace my data' })).toBeVisible();
    // Focus starts on Cancel, so a stray Return closes the dialog and replaces nothing.
    await expect(box.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await captureBothSizes(page, 'settings-data-confirm');
  });

  test('import: with an earlier backup the dialog says it is replaced', async ({ page }) => {
    await openDialog(page, 'data-imported');
    await expect(dialog(page)).toContainText('replaces the backup kept from your earlier import');
    await captureBothSizes(page, 'settings-data-confirm-backup');
  });

  test('import: an empty app and an empty file read naturally', async ({ page }) => {
    await openDialog(page, 'fresh');
    await expect(cell(page, 'Attempts', 1)).toHaveText('No attempts yet');
    await expect(cell(page, 'Attempts', 0)).toHaveText('214');
    await expect(dialog(page)).not.toContainText(/null|0 to 0/);
    await captureBothSizes(page, 'settings-data-confirm-empty-current');
    await openDialog(page, 'data-import-empty');
    await expect(cell(page, 'Attempts', 0)).toHaveText('No attempts yet');
    await expect(cell(page, 'Attempts', 1)).not.toHaveText('No attempts yet');
    await expect(dialog(page)).not.toContainText(/null|0 to 0/);
    await captureBothSizes(page, 'settings-data-confirm-empty-file');
  });

  // Criterion 5
  for (const [how, act] of [
    ['Cancel', (page: Page) => dialog(page).getByRole('button', { name: 'Cancel' }).click()],
    ['Escape', (page: Page) => page.keyboard.press('Escape')],
    ['the close icon', (page: Page) => dialog(page).getByRole('button', { name: 'Close' }).click()],
    ['a click outside', (page: Page) => page.mouse.click(5, 5)],
  ] as const) {
    test(`import: ${how} calls cancelImport and closes`, async ({ page }) => {
      await open(page);
      await spy(page, ['cancelImport', 'applyImport']);
      await importButton(page).click();
      await expect(dialog(page)).toBeVisible();
      await act(page);
      await expect(dialog(page)).toHaveCount(0);
      expect(await calls(page, 'cancelImport')).toBe(1);
      expect(await calls(page, 'applyImport')).toBe(0);
      await expect(group(page).getByRole('status')).toHaveCount(0);
      expect(await restarts(page)).not.toContain('restart');
    });
  }

  // Criterion 6
  test('import: Replace my data runs once, locks the dialog, then shows Restarting', async ({ page }) => {
    await open(page);
    await spy(page, ['applyImport', 'cancelImport'], 500);
    await importButton(page).click();
    const replace = dialog(page).getByRole('button', { name: 'Replace my data' });
    await replace.click();
    await expect(replace).toBeDisabled();
    await expect(dialog(page).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    // The close icon and a click outside still reach the dialog while it works, and must not close it.
    await dialog(page).getByRole('button', { name: 'Close' }).click();
    await page.mouse.click(5, 5);
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page)).toContainText('Restarting…');
    expect(await calls(page, 'applyImport')).toBe(1);
    expect(await calls(page, 'cancelImport')).toBe(0);
    // It stays: the app would restart, and the mock does not.
    await page.waitForTimeout(300);
    await expect(dialog(page)).toContainText('Restarting…');
    await expect(dialog(page).getByRole('button', { name: 'Replace my data' })).toHaveCount(0);
    await dialog(page).getByRole('button', { name: 'Close' }).click();
    await page.mouse.click(5, 5);
    await expect(dialog(page)).toBeVisible();
    expect(await restarts(page)).toContain('restart');
    await captureBothSizes(page, 'settings-data-restarting');
  });

  test('import: a failed apply stays open with the message and offers only Close', async ({ page }) => {
    await open(page, 'data-apply-fails');
    await spy(page, ['applyImport', 'cancelImport']);
    await importButton(page).click();
    await dialog(page).getByRole('button', { name: 'Replace my data' }).click();
    await expect(dialog(page).getByRole('alert')).toHaveText(
      'The import failed and your data was not changed. Choose the file again to retry.',
    );
    await expect(dialog(page).getByRole('button', { name: 'Replace my data' })).toHaveCount(0);
    await expect(dialog(page).getByRole('button', { name: 'Close', exact: true }).last()).toBeVisible();
    await captureBothSizes(page, 'settings-data-apply-failed');
    // Focus is back inside the dialog, so Escape closes it.
    await expect(dialog(page).getByRole('button', { name: 'Close', exact: true }).last()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    expect(await calls(page, 'applyImport')).toBe(1);
    expect(await calls(page, 'cancelImport')).toBe(0);
    // Starting again from Import… works.
    await importButton(page).click();
    await expect(dialog(page).getByRole('button', { name: 'Replace my data' })).toBeVisible();
  });

  // Criterion 7
  test('after an import: the applied notice is good news, not an error', async ({ page }) => {
    await open(page, 'data-imported');
    const notice = group(page).getByRole('status');
    await expect(notice).toContainText('Your import is done');
    await expect(notice).toContainText('paraleet.sqlite3.before-import');
    await expect(notice).toContainText('next to the database');
    await expect(group(page).getByRole('alert')).toHaveCount(0);
    await captureGroup(page, 'after-import');
  });

  test('after an import: a rejected import says so and gives the reason as main wrote it', async ({ page }) => {
    await open(page, 'data-import-refused');
    const notice = group(page).getByRole('status');
    await expect(notice).toContainText('The import was not applied.');
    await expect(notice).toContainText('That file is damaged and cannot be imported. Your data was not changed.');
    // Said once, by the reason itself.
    expect(((await notice.textContent()) ?? '').match(/not changed/g)).toHaveLength(1);
    await expect(group(page).getByRole('alert')).toHaveCount(0);
    await captureGroup(page, 'after-rejected');
  });

  test('after an import: a reason that says the old copy was put back gets no "not changed" from the screen', async ({
    page,
  }) => {
    await open(page);
    await page.evaluate(() => {
      const api = (globalThis as unknown as Host).paraleet;
      const original = api.getDataInfo.bind(api);
      api.getDataInfo = async () => ({
        ...(await original()),
        lastImport: {
          status: 'rejected',
          reason: 'The data file was missing, so the copy kept from your last import was put back.',
        },
      });
    });
    // A change event makes the group read again.
    await page.getByTestId('screen-settings').getByRole('switch').first().click();
    const notice = group(page).getByRole('status');
    await expect(notice).toContainText('The import was not applied. The data file was missing');
    await expect(notice).not.toContainText('not changed');
  });

  test('no notice after a normal launch', async ({ page }) => {
    await open(page);
    await expect(group(page).getByRole('status')).toHaveCount(0);
  });

  // Criterion 8
  test('where the data is: the full path, Show in Finder, and no path sent', async ({ page }) => {
    await open(page);
    await expect(
      group(page).getByText('/Users/you/Library/Application Support/ParaLeet/paraleet.sqlite3'),
    ).toBeVisible();
    await page.evaluate(() => {
      const host = globalThis as unknown as Host & { __args?: Record<string, unknown[][]> };
      const api = host.paraleet as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
      host.__args = {};
      for (const name of [
        'getDataInfo',
        'exportData',
        'chooseImport',
        'applyImport',
        'cancelImport',
        'showDataInFinder',
      ]) {
        const original = api[name] as (...args: unknown[]) => Promise<unknown>;
        api[name] = (...args: unknown[]) => {
          (host.__args![name] ??= []).push(args);
          return original(...args);
        };
      }
    });
    await exportButton(page).click();
    await expect(group(page).getByText(/^Saved as/)).toBeVisible();
    await group(page).getByRole('button', { name: 'Show in Finder' }).click();
    await importButton(page).click();
    await dialog(page).getByRole('button', { name: 'Cancel' }).click();
    await importButton(page).click();
    await dialog(page).getByRole('button', { name: 'Replace my data' }).click();
    await expect(dialog(page)).toContainText('Restarting…');
    const recorded = await page.evaluate(
      () => (globalThis as unknown as { __args: Record<string, unknown[][]> }).__args,
    );
    for (const name of ['exportData', 'chooseImport', 'applyImport', 'cancelImport', 'showDataInFinder']) {
      expect(recorded[name]?.length, name).toBeGreaterThan(0);
    }
    for (const [name, all] of Object.entries(recorded)) {
      for (const args of all)
        expect(
          args.filter((arg) => arg !== undefined),
          name,
        ).toEqual([]);
    }
    expect(await restarts(page)).toContain('showDataInFinder');
  });

  test('where the data is: a very long path stays in the row at both sizes', async ({ page }) => {
    await open(page, 'data-long-path');
    const path = group(page).getByText(/a-very-long-folder-name/);
    await expect(path).toBeVisible();
    await expect(path).toHaveAttribute('title', /paraleet\.sqlite3$/);
    await assertGroupFitsAt(page, WINDOW_MIN);
    const finder = await group(page).getByRole('button', { name: 'Show in Finder' }).boundingBox();
    const text = await path.boundingBox();
    expect(text!.x + text!.width).toBeLessThanOrEqual(finder!.x);
    await assertGroupFitsAt(page, WINDOW_DEFAULT);
    await captureGroup(page, 'long-path');
  });

  // Criterion 9
  test('if the details cannot be read, the group says so and Export and Import still work', async ({ page }) => {
    await openScreen(page, 'settings', 'data-info-fails');
    await group(page).scrollIntoViewIfNeeded();
    await expect(group(page).getByText('The data details could not be read.')).toBeVisible();
    await expect(group(page).getByText('Show in Finder')).toHaveCount(0);
    await captureGroup(page, 'info-failed');
    await exportButton(page).click();
    await expect(group(page).getByText(/^Saved as/)).toBeVisible();
    await importButton(page).click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page)).toContainText('kept as a backup file next to the database');
    await expect(dialog(page)).toContainText('A backup kept from an earlier import, if there is one, is replaced.');
    await expect(dialog(page)).not.toContainText('named');
    await captureBothSizes(page, 'settings-data-confirm-unknown-backup');
  });

  test('import: details read after the group loaded decide the backup line', async ({ page }) => {
    await open(page);
    await expect(importButton(page)).toBeEnabled();
    // An import was applied elsewhere since the page loaded: a backup exists now.
    await page.evaluate(() => {
      const api = (globalThis as unknown as Host).paraleet;
      const original = api.getDataInfo.bind(api);
      api.getDataInfo = async () => ({ ...(await original()), hasImportBackup: true });
    });
    await importButton(page).click();
    await expect(dialog(page)).toContainText('That replaces the backup kept from your earlier import.');
  });

  test('import: leaving Settings with the dialog open lets main forget the file once', async ({ page }) => {
    await open(page);
    await spy(page, ['cancelImport']);
    await importButton(page).click();
    await expect(dialog(page)).toBeVisible();
    await page.evaluate(() => {
      (globalThis as unknown as { location: { hash: string } }).location.hash = '#/today';
    });
    await page.getByTestId('screen-today').waitFor();
    await expect(dialog(page)).toHaveCount(0);
    expect(await calls(page, 'cancelImport')).toBe(1);
  });
});
