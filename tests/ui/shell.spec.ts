import { expect, test } from '@playwright/test';
import { captureBothSizes, mockOpenedUrls, openScreen } from './screenshots';

test('the sidebar switches between the five screens', async ({ page }) => {
  await openScreen(page, 'today');
  for (const [name, heading] of [
    ['Problems', 'Problems'],
    ['Plan', 'Plan'],
    ['Stats', 'Stats'],
    ['Settings', 'Settings'],
    ['Today', 'Today'],
  ] as const) {
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name }).click();
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  }
});

test('the sidebar shows the streak', async ({ page }) => {
  await openScreen(page, 'today', 'fed');
  await expect(page.getByTestId('sidebar-streak')).toHaveText('5-day streak');
  await openScreen(page, 'today', 'fresh');
  await expect(page.getByTestId('sidebar-streak')).toHaveText('No streak yet');
});

test('reporting today\'s problem feeds the pet (mock bridge)', async ({ page }) => {
  await openScreen(page, 'today', 'fresh');
  await expect(page.getByTestId('today-title')).toHaveText('1. Two Sum');
  await page.getByRole('button', { name: 'Open problem' }).click();
  expect(await mockOpenedUrls(page)).toEqual(['https://leetcode.com/problems/two-sum/']);
  await page.getByRole('button', { name: 'I solved it' }).click();
  await captureBothSizes(page, 'foundation-report');
  await page.getByRole('radio', { name: /^Good/ }).click();
  await page.getByRole('button', { name: 'Feed Para' }).click();
  await expect(page.getByTestId('pet-status')).toHaveText('Para is fed for today');
  await expect(page.getByTestId('sidebar-streak')).toHaveText('1-day streak');
});

test('screenshots: shell at default and minimum sizes', async ({ page }) => {
  await openScreen(page, 'today');
  await captureBothSizes(page, 'foundation-today');
  await openScreen(page, 'problems');
  await captureBothSizes(page, 'foundation-problems');
});
