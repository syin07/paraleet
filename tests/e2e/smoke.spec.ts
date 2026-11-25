import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test } from '@playwright/test';
import { launchApp, makeUserDataDir, type RunningApp } from './launch';

// PRD section 12: launch, log an attempt, the pet is fed, restart, state persists.
test('the daily loop survives a restart', async () => {
  const data = makeUserDataDir();
  let running: RunningApp | null = null;
  try {
    // Noon in Los Angeles on Nov 25.
    running = await launchApp({ userDataDir: data.dir, now: '2026-11-25T20:00:00.000Z' });
    let { page } = running;

    // Today's problem is assigned from the starter list and opens in the browser.
    await expect(page.getByTestId('today-title')).toHaveText('1. Two Sum');
    await expect(page.getByTestId('pet-status')).toHaveText('Para is waiting for one problem');
    await page.getByRole('button', { name: 'Open problem' }).click();
    await expect.poll(() => running?.openedUrls()).toEqual(['https://leetcode.com/problems/two-sum/']);

    // Two clicks feed the pet: pick a rating, then submit.
    await page.getByRole('button', { name: 'I solved it' }).click();
    await page.getByRole('radio', { name: /^Good/ }).click();
    await page.getByRole('button', { name: 'Feed Para' }).click();
    await expect(page.getByTestId('pet-status')).toHaveText('Para is fed for today');
    await expect(page.getByTestId('sidebar-streak')).toHaveText('1-day streak');

    // The attempt shows up on the Problems screen.
    await page.getByRole('button', { name: 'Problems' }).click();
    await expect(page.getByTestId('problem-row')).toHaveCount(1);
    await expect(page.getByTestId('problem-row')).toContainText('1. Two Sum');

    // All data lives in one file in the user-data folder.
    expect(existsSync(join(data.dir, 'paraleet.sqlite3'))).toBe(true);

    // Restart: everything is still there.
    await running.close();
    running = await launchApp({ userDataDir: data.dir, now: '2026-11-25T21:00:00.000Z' });
    page = running.page;
    await expect(page.getByTestId('pet-status')).toHaveText('Para is fed for today');
    await expect(page.getByTestId('today-title')).toHaveText('1. Two Sum');
    await expect(page.getByTestId('sidebar-streak')).toHaveText('1-day streak');

    // At 04:00 the next ParaLeet day starts without a restart: hungry again, next problem, streak alive.
    await running.setNow('2026-11-26T12:00:30.000Z');
    await expect(page.getByTestId('pet-status')).toHaveText('Para is waiting for one problem');
    await expect(page.getByTestId('today-title')).toHaveText('242. Valid Anagram');
    await expect(page.getByTestId('sidebar-streak')).toHaveText('1-day streak');
  } finally {
    await running?.close().catch(() => undefined);
    data.remove();
  }
});

// PRD section 10: attempts are the source of truth. Derived values that drift are corrected at launch.
test('stored streak and review cards are rebuilt from the attempts at launch', async () => {
  const data = makeUserDataDir();
  let running: RunningApp | null = null;
  try {
    running = await launchApp({ userDataDir: data.dir, now: '2026-11-25T20:00:00.000Z' });
    await running.page.getByRole('button', { name: 'I solved it' }).click();
    await running.page.getByRole('radio', { name: /^Again/ }).click();
    await running.page.getByRole('button', { name: 'Feed Para' }).click();
    await expect(running.page.getByTestId('sidebar-streak')).toHaveText('1-day streak');
    await running.close();

    // Damage the derived data while the app is closed, as an old or hand-edited file might be.
    const db = new DatabaseSync(join(data.dir, 'paraleet.sqlite3'));
    db.exec('UPDATE pet SET current_streak = 41, longest_streak = 41, total_attempts = 7');
    db.exec('DELETE FROM review_cards');
    db.close();

    // The next day: the streak is the true one, and the rebuilt card makes yesterday's Again due.
    running = await launchApp({ userDataDir: data.dir, now: '2026-11-26T20:00:00.000Z' });
    await expect(running.page.getByTestId('sidebar-streak')).toHaveText('1-day streak');
    await expect(running.page.getByTestId('today-title')).toHaveText('1. Two Sum');
    await expect(running.page.getByTestId('screen-today')).toContainText('Review');
    await expect(running.page.getByTestId('screen-today')).toContainText('Longest: 1');
  } finally {
    await running?.close().catch(() => undefined);
    data.remove();
  }
});

test('a second copy of the app does not start', async () => {
  const data = makeUserDataDir();
  let first: RunningApp | null = null;
  try {
    first = await launchApp({ userDataDir: data.dir, now: '2026-11-25T20:00:00.000Z' });
    await expect(first.page.getByTestId('today-title')).toBeVisible();
    // The second launch exits at once because the first holds the single-instance lock.
    await expect(launchApp({ userDataDir: data.dir, now: '2026-11-25T20:00:00.000Z' })).rejects.toThrow();
    await expect(first.page.getByTestId('today-title')).toBeVisible();
  } finally {
    await first?.close().catch(() => undefined);
    data.remove();
  }
});
