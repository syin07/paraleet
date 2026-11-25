import { expect, test, type Page } from '@playwright/test';
import { launchApp, makeUserDataDir, type RunningApp } from './launch';

const drawer = (page: Page) => page.getByRole('complementary', { name: 'Details' });
const addDialog = (page: Page) => page.getByRole('dialog', { name: 'Add a problem' });
const reportDialog = (page: Page) => page.getByRole('dialog', { name: 'How did it go?' });

async function goTo(page: Page, screen: 'Today' | 'Problems'): Promise<void> {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: screen }).click();
  await expect(page.getByRole('heading', { level: 1, name: screen })).toBeVisible();
}

async function feed(page: Page, rating: RegExp): Promise<void> {
  await reportDialog(page).getByRole('radio', { name: rating }).click();
  await reportDialog(page).getByRole('button', { name: 'Feed Para' }).click();
  await expect(reportDialog(page)).toHaveCount(0);
}

async function openAddDialog(page: Page, url: string): Promise<void> {
  await page.getByRole('button', { name: 'Add problem' }).first().click();
  await addDialog(page).getByPlaceholder('https://leetcode.com/problems/…').fill(url);
}

// PRD section 12, M1: "Problems screen lists everything logged; a problem can be added by URL".
test('Problems: notes, retire and reset, and adding problems by link from every platform', async () => {
  const data = makeUserDataDir();
  let running: RunningApp | null = null;
  try {
    // Day 1, noon in Los Angeles.
    running = await launchApp({ userDataDir: data.dir, now: '2026-11-25T20:00:00.000Z' });
    let { page } = running;
    await expect(page.getByTestId('today-title')).toHaveText('1. Two Sum');
    await page.getByRole('button', { name: 'I solved it' }).click();
    await feed(page, /^Again/);

    // The logged problem is listed; its detail holds the attempt and editable notes.
    await goTo(page, 'Problems');
    await expect(page.getByTestId('problem-row')).toHaveCount(1);
    await page.getByTestId('problem-row').first().click();
    await expect(drawer(page)).toContainText('1. Two Sum');
    await expect(drawer(page)).toContainText('Again');
    await drawer(page).getByLabel('Key insight').fill('Look up the complement in a hash map');
    await drawer(page).getByLabel('Key insight').press('Enter');
    await drawer(page).getByLabel('Add a pattern tag').fill('hash map, one pass,');
    await drawer(page).getByLabel('Notes').fill('Forgot to check the map before inserting.');
    await drawer(page).getByLabel('Notes').blur();
    await expect(drawer(page).getByRole('button', { name: 'Remove tag one pass' })).toBeVisible();

    // "I've got this one": retire the review card.
    await drawer(page).getByRole('button', { name: 'Retire card' }).click();
    await drawer(page).getByRole('button', { name: 'Retire', exact: true }).click();
    await expect(drawer(page).getByText('Retired', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer(page)).toHaveCount(0);

    // Add a Codeforces problem by link, not solved today: it is added and its detail opens.
    // 2172E is below the catalog's solved-count floor, so the app does not know it and asks for a title.
    await openAddDialog(page, 'codeforces.com/contest/2172/problem/e');
    await expect(addDialog(page)).toContainText('Codeforces');
    await expect(addDialog(page)).toContainText('2172E');
    await addDialog(page).getByLabel('Title').fill('Number Maze');
    await addDialog(page).getByLabel('Rating').fill('1200');
    await addDialog(page).getByRole('button', { name: 'Add problem' }).click();
    await expect(drawer(page)).toContainText('Number Maze');
    await expect(page.getByTestId('problem-row')).toHaveCount(1); // not logged yet, so not in the table
    await page.keyboard.press('Escape');

    // The same problem through a different link is recognized, not added twice.
    await openAddDialog(page, 'https://m1.codeforces.com/problemset/problem/02172/E?locale=en');
    await expect(addDialog(page).getByRole('button', { name: 'Open it' })).toBeVisible();
    await addDialog(page).getByRole('button', { name: 'Cancel' }).click();

    // Problems in the catalog, on every platform, are known: no title to type, just "Open it".
    for (const url of [
      'https://leetcode.com/problems/trapping-rain-water/',
      'https://cses.fi/problemset/task/1068/',
      'https://codeforces.com/contest/1352/problem/C',
    ]) {
      await openAddDialog(page, url);
      await expect(addDialog(page).getByRole('button', { name: 'Open it' })).toBeVisible();
      await expect(addDialog(page).getByLabel('Title')).toHaveCount(0);
      await addDialog(page).getByRole('button', { name: 'Cancel' }).click();
    }

    // A page that is not a problem is refused with a reason.
    await openAddDialog(page, 'https://leetcode.com/problemset/');
    await expect(addDialog(page)).toContainText('not a problem page');
    await addDialog(page).getByRole('button', { name: 'Cancel' }).click();

    // Another site, solved today: add, report, and land on its detail.
    await openAddDialog(page, 'https://atcoder.jp/contests/abc300/tasks/abc300_a?utm_source=x');
    await expect(addDialog(page)).toContainText('Other');
    await addDialog(page).getByLabel('Title').fill('N-choice question');
    await addDialog(page).getByRole('radio', { name: 'Easy' }).click();
    await addDialog(page).getByLabel('I solved it today').check();
    await addDialog(page).getByRole('button', { name: 'Add and report' }).click();
    await feed(page, /^Good/);
    await expect(drawer(page)).toContainText('N-choice question');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('problem-row')).toHaveCount(2);

    // Day 2: the retired problem is not due, so the starter list continues.
    await running.setNow('2026-11-26T20:00:00.000Z');
    await goTo(page, 'Today');
    await expect(page.getByTestId('today-title')).toHaveText('242. Valid Anagram');
    await expect(page.getByTestId('due-row')).toHaveCount(0);

    // Reset the card: the problem is due again. Today's pick was already made, so it shows up
    // in the due list.
    await goTo(page, 'Problems');
    await page.getByTestId('problem-row').filter({ hasText: '1. Two Sum' }).click();
    await drawer(page).getByRole('button', { name: 'Reset schedule' }).click();
    await drawer(page).getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(drawer(page).getByText('Retired', { exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await goTo(page, 'Today');
    await expect(page.getByTestId('due-row')).toHaveCount(1);
    await expect(page.getByTestId('due-row')).toContainText('1. Two Sum');

    // From Today's quick-log: a link the app does not know opens the add dialog, then the report form.
    await page.getByRole('combobox', { name: 'Paste a problem URL or search' }).fill('https://cses.fi/problemset/task/99999999/');
    await page.getByRole('button', { name: 'Add it' }).click();
    await expect(addDialog(page)).toContainText('CSES');
    await expect(addDialog(page).getByLabel('I solved it today')).toBeChecked();
    await addDialog(page).getByLabel('Title').fill('A task the catalog lacks');
    await addDialog(page).getByRole('button', { name: 'Add and report' }).click();
    await feed(page, /^Easy/);
    await expect(page.getByTestId('pet-status')).toHaveText('Para is fed for today');
    await expect(page.getByTestId('sidebar-streak')).toHaveText('2-day streak');

    // Restart: notes, tags, the added problems and the reset card are all still there.
    await running.close();
    running = await launchApp({ userDataDir: data.dir, now: '2026-11-26T21:00:00.000Z' });
    page = running.page;
    await expect(page.getByTestId('due-row')).toContainText('1. Two Sum');
    await goTo(page, 'Problems');
    await expect(page.getByTestId('problem-row')).toHaveCount(3);
    await page.getByTestId('problem-row').filter({ hasText: '1. Two Sum' }).click();
    await expect(drawer(page).getByLabel('Key insight')).toHaveValue('Look up the complement in a hash map');
    await expect(drawer(page).getByLabel('Notes')).toHaveValue('Forgot to check the map before inserting.');
    await expect(drawer(page).getByRole('button', { name: 'Remove tag hash map' })).toBeVisible();
    await expect(drawer(page).getByRole('button', { name: 'Remove tag one pass' })).toBeVisible();
  } finally {
    await running?.close().catch(() => undefined);
    data.remove();
  }
});

// SAN-119: the catalog is loaded at launch, so the quick log finds problems that were never added by hand.
test('the quick log finds catalog-only problems on a fresh database and opens their report form', async () => {
  const data = makeUserDataDir();
  let running: RunningApp | null = null;
  try {
    const started = Date.now();
    running = await launchApp({ userDataDir: data.dir, now: '2026-11-25T20:00:00.000Z' });
    const { page } = running;
    await expect(page.getByTestId('today-title')).toHaveText('1. Two Sum');
    // First launch loads three catalog files; this is the time until Today shows.
    console.log(`first launch with the catalog: Today shown after ${Date.now() - started} ms`);
    const box = page.getByRole('combobox', { name: 'Paste a problem URL or search' });
    for (const { query, option } of [
      { query: 'Weird Algorithm', option: /Weird Algorithm/ }, // CSES
      { query: 'Watermelon', option: /Watermelon/ }, // Codeforces
    ]) {
      await box.fill(query);
      await page.getByRole('option', { name: option }).first().click();
      await expect(reportDialog(page)).toBeVisible();
      await expect(reportDialog(page)).toContainText(query);
      await page.keyboard.press('Escape');
      await expect(reportDialog(page)).toHaveCount(0);
    }
  } finally {
    await running?.close().catch(() => undefined);
    data.remove();
  }
});
