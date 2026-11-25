import { expect, test } from '@playwright/test';
import { launchApp, makeUserDataDir, type RunningApp } from './launch';

async function reportOpenDialog(running: RunningApp, rating: RegExp): Promise<void> {
  const dialog = running.page.getByRole('dialog');
  await dialog.getByRole('radio', { name: rating }).click();
  await dialog.getByRole('button', { name: 'Feed Para' }).click();
  await expect(dialog).toHaveCount(0);
}

// PRD section 12, M1: "Each solved problem gets a review card; due reviews take the daily slot".
test('a problem rated Again comes back as tomorrow\'s review, and today\'s problem can be swapped', async () => {
  const data = makeUserDataDir();
  let running: RunningApp | null = null;
  try {
    // Day 1, noon in Los Angeles: report the assigned problem and quick-log a second one, both Again.
    running = await launchApp({ userDataDir: data.dir, now: '2026-11-25T20:00:00.000Z' });
    const { page } = running;
    await expect(page.getByTestId('today-title')).toHaveText('1. Two Sum');
    await page.getByRole('button', { name: 'I solved it' }).click();
    // The form previews the real schedule for the rating picked.
    await page.getByRole('dialog').getByRole('radio', { name: /^Good/ }).click();
    await expect(page.getByRole('dialog')).toContainText('Next review in 4 days');
    await reportOpenDialog(running, /^Again/);
    await expect(page.getByTestId('pet-status')).toHaveText('Para is fed for today');

    await page.getByRole('combobox', { name: 'Paste a problem URL or search' }).fill('valid anagram');
    await page.getByRole('option', { name: /Valid Anagram/ }).first().click();
    await reportOpenDialog(running, /^Again/);

    // Day 2: the most overdue review takes the slot (a tie, so the lower ID), the other is listed.
    await running.setNow('2026-11-26T20:00:00.000Z');
    await expect(page.getByTestId('pet-status')).toHaveText('Para is waiting for one problem');
    await expect(page.getByTestId('today-title')).toHaveText('1. Two Sum');
    await expect(page.getByTestId('screen-today')).toContainText('Review');
    await expect(page.getByTestId('due-row')).toHaveCount(1);
    await expect(page.getByTestId('due-row')).toContainText('242. Valid Anagram');

    // Swap to the other due review.
    await page.getByRole('button', { name: 'Swap', exact: true }).click();
    await page.getByRole('dialog').getByRole('region', { name: 'Due for review' }).getByRole('button').first().click();
    await expect(page.getByTestId('today-title')).toHaveText('242. Valid Anagram');
    await expect(page.getByTestId('screen-today')).toContainText('Your pick');
    await expect(page.getByTestId('due-row')).toContainText('1. Two Sum');

    // Reporting the review feeds Para and extends the streak. The form knows it is a review.
    await page.getByRole('button', { name: 'I solved it' }).click();
    await reportOpenDialog(running, /^Good/);
    await expect(page.getByTestId('pet-status')).toHaveText('Para is fed for today');
    await expect(page.getByTestId('sidebar-streak')).toHaveText('2-day streak');

    // The review that was not done is still due after a restart, and the reported one is not.
    await running.close();
    running = await launchApp({ userDataDir: data.dir, now: '2026-11-26T21:00:00.000Z' });
    await expect(running.page.getByTestId('due-row')).toHaveCount(1);
    await expect(running.page.getByTestId('due-row')).toContainText('1. Two Sum');
    await expect(running.page.getByTestId('pet-status')).toHaveText('Para is fed for today');
  } finally {
    await running?.close().catch(() => undefined);
    data.remove();
  }
});
