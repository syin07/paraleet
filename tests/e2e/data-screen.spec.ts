import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp, makeUserDataDir, ROOT, type RunningApp } from './launch';

// PRD section 10, through the real Settings screen in the real app: export a copy, be refused a
// wrong file, import the copy into a second install, and see what the restart did. The file
// dialogs are answered by the test; the buttons, the files and the restart are real.

const NOW = '2026-11-25T20:00:00.000Z';
const shot = (name: string): string => join(ROOT, 'artifacts/screenshots', `e2e-${name}.png`);
const group = (page: Page) => page.getByRole('region', { name: 'Data', exact: true });

async function openSettings(page: Page): Promise<void> {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Settings' }).click();
  await expect(group(page).getByRole('button', { name: 'Export…' })).toBeVisible();
}

test('Settings, Data in the real app: export here, import there, and the restart says what happened', async () => {
  const first = makeUserDataDir();
  const second = makeUserDataDir();
  const files = makeUserDataDir();
  const backup = join(files.dir, 'ParaLeet backup.sqlite3');
  let running: RunningApp | null = null;
  try {
    // The first install: one solve through the screen, then "Export…".
    running = await launchApp({ userDataDir: first.dir, now: NOW });
    let page = running.page;
    await expect(page.getByTestId('today-title')).toHaveText('1. Two Sum');
    await page.getByRole('button', { name: 'I solved it' }).click();
    await page.getByRole('radio', { name: /^Good/ }).click();
    await page.getByRole('button', { name: 'Feed Para' }).click();
    await expect(page.getByTestId('pet-status')).toHaveText('Para is fed for today');
    await openSettings(page);
    await expect(group(page).getByText(join(first.dir, 'paraleet.sqlite3'))).toBeVisible();
    await group(page).getByRole('button', { name: 'Show in Finder' }).click();
    await expect.poll(() => running!.revealedPaths()).toEqual([join(first.dir, 'paraleet.sqlite3')]);

    // Closing the save dialog shows nothing; choosing a place saves the copy and names it.
    await running.setDialogPaths({ save: null });
    await group(page).getByRole('button', { name: 'Export…' }).click();
    await expect(group(page).getByRole('button', { name: 'Export…' })).toBeEnabled();
    await expect(group(page).getByText(/Saved as/)).toHaveCount(0);
    await expect(group(page).getByRole('alert')).toHaveCount(0);
    await running.setDialogPaths({ save: backup });
    await group(page).getByRole('button', { name: 'Export…' }).click();
    await expect(group(page).getByText('Saved as ParaLeet backup.sqlite3.')).toBeVisible();
    expect(existsSync(backup)).toBe(true);
    await group(page).scrollIntoViewIfNeeded();
    await page.screenshot({ path: shot('data-exported') });
    await running.close();
    running = null;

    // The second install starts empty. A wrong file is refused and nothing changes.
    running = await launchApp({ userDataDir: second.dir, now: NOW });
    page = running.page;
    await expect(page.getByTestId('today-title')).toHaveText('1. Two Sum');
    await openSettings(page);
    const wrong = join(files.dir, 'notes.sqlite3');
    writeFileSync(wrong, 'Not a database.');
    await running.setDialogPaths({ open: wrong });
    await group(page).getByRole('button', { name: 'Import…' }).click();
    await expect(group(page).getByText(/notes\.sqlite3/)).toBeVisible();
    await expect(group(page).getByText(/Nothing was changed/)).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // The copy from the first install: the dialog says what is in it, next to what is here.
    await running.setDialogPaths({ open: backup });
    await group(page).getByRole('button', { name: 'Import…' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('ParaLeet backup.sqlite3');
    const attempts = dialog.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'Attempts', exact: true }) });
    await expect(attempts.getByRole('cell').first()).toHaveText('1');
    await expect(dialog).toContainText('No attempts yet');
    await expect(dialog).toContainText('paraleet.sqlite3.before-import');
    await page.screenshot({ path: shot('data-import-confirm') });

    // Cancel changes nothing; then yes, and the app quits to restart.
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    expect(existsSync(join(second.dir, 'paraleet.sqlite3.import'))).toBe(false);
    await group(page).getByRole('button', { name: 'Import…' }).click();
    const closed = new Promise<void>((resolve) => running!.app.once('close', () => resolve()));
    await page.getByRole('dialog').getByRole('button', { name: 'Replace my data' }).click();
    await closed;
    running = null;

    // The launch after it: the imported solve is there, Settings is open and says so.
    running = await launchApp({ userDataDir: second.dir, now: NOW });
    page = running.page;
    await expect(page.getByTestId('screen-settings')).toBeVisible();
    const notice = group(page).getByRole('status');
    await expect(notice).toContainText('paraleet.sqlite3.before-import');
    expect(existsSync(join(second.dir, 'paraleet.sqlite3.before-import'))).toBe(true);
    await group(page).scrollIntoViewIfNeeded();
    await page.screenshot({ path: shot('data-after-import') });
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Today' }).click();
    await expect(page.getByTestId('pet-status')).toHaveText('Para is fed for today');
  } finally {
    await running?.close().catch(() => undefined);
    first.remove();
    second.remove();
    files.remove();
  }
});
