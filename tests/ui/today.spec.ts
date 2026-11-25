import { expect, test, type Page } from '@playwright/test';
import type { ParaLeetApi } from '../../src/bridge/contract';
import { captureBothSizes, mockOpenedUrls, openScreen } from './screenshots';

type Host = { paraleet: ParaLeetApi; document: { documentElement: { scrollWidth: number } } };

const dialog = (page: Page) => page.getByRole('dialog');

/** Searches in quick-log and picks the first result whose title matches. */
async function quickLogPick(page: Page, query: string, title: RegExp): Promise<void> {
  await page.getByRole('combobox', { name: 'Paste a problem URL or search' }).fill(query);
  await page.getByRole('option', { name: title }).first().click();
}

/** The rating the mock recorded as the newest attempt on a problem. */
function lastRating(page: Page, problemId: number): Promise<string | undefined> {
  return page.evaluate(async (id) => {
    const detail = await (globalThis as unknown as Host).paraleet.getProblemDetail({ problemId: id });
    return detail.attempts[0]?.rating;
  }, problemId);
}

test.describe('the screen', () => {
  test('shows the pet, the problem, the reason and the streak', async ({ page }) => {
    await openScreen(page, 'today');
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    await expect(page.getByText('Wed, Nov 25')).toBeVisible();
    await expect(page.getByTestId('screen-today').getByRole('img', { name: 'Para the parakeet' })).toBeVisible();
    await expect(page.getByTestId('pet-status')).toHaveText('Para is waiting for one problem');
    await expect(page.getByTestId('today-title')).not.toBeEmpty();
    await expect(page.getByText('Review', { exact: true })).toBeVisible();
    await expect(page.getByTestId('streak-current')).toHaveText('4');
    await expect(page.getByTestId('screen-today').getByText('day streak')).toBeVisible();
    await expect(page.getByText(/^Longest: \d+$/)).toBeVisible();
    await expect(page.getByRole('list', { name: 'This week' }).getByRole('listitem')).toHaveCount(7);
    await captureBothSizes(page, 'today-default');
  });

  test('the fresh state starts with the first starter problem', async ({ page }) => {
    await openScreen(page, 'today', 'fresh');
    await expect(page.getByTestId('today-title')).toHaveText('1. Two Sum');
    await expect(page.getByText('Starter', { exact: true })).toBeVisible();
    await expect(page.getByTestId('streak-current')).toHaveText('0');
    await captureBothSizes(page, 'today-fresh');
  });

  test('Open problem opens the problem in the browser', async ({ page }) => {
    await openScreen(page, 'today', 'fresh');
    await page.getByRole('button', { name: 'Open problem' }).click();
    await expect.poll(() => mockOpenedUrls(page)).toEqual(['https://leetcode.com/problems/two-sum/']);
  });

  test('when today is done the card collapses and Log another focuses the quick-log input', async ({ page }) => {
    await openScreen(page, 'today', 'fed');
    await expect(page.getByTestId('pet-status')).toHaveText('Para is fed for today');
    await expect(page.getByText('Fed', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'I solved it' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Swap', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Log another' }).click();
    await expect(page.getByRole('combobox', { name: 'Paste a problem URL or search' })).toBeFocused();
    await captureBothSizes(page, 'today-fed');
  });
});

test.describe('the report form', () => {
  test('two clicks feed Para and the streak and fed state update without a reload', async ({ page }) => {
    await openScreen(page, 'today', 'fresh');
    await expect(page.getByTestId('sidebar-streak')).toHaveText('No streak yet');
    await page.getByRole('button', { name: 'I solved it' }).click();
    await expect(dialog(page).getByRole('button', { name: 'Feed Para' })).toBeDisabled();
    await dialog(page).getByRole('radio', { name: /^Good/ }).click();
    await dialog(page).getByRole('button', { name: 'Feed Para' }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByTestId('pet-status')).toHaveText('Para is fed for today');
    await expect(page.getByTestId('streak-current')).toHaveText('1');
    await expect(page.getByTestId('sidebar-streak')).toHaveText('1-day streak');
    await expect(page.getByText('Fed', { exact: true })).toBeVisible();
  });

  test('shows the four ratings with their exact meanings, and a first solve asks for the insight', async ({ page }) => {
    await openScreen(page, 'today', 'fresh');
    await page.getByRole('button', { name: 'I solved it' }).click();
    const form = dialog(page);
    const meanings: [string, string][] = [
      ['Again', 'Could not solve it without reading the solution'],
      ['Hard', 'Solved it, but needed a hint or got badly stuck'],
      ['Good', 'Solved it alone with normal effort'],
      ['Easy', 'Saw the approach immediately and coded it cleanly'],
    ];
    await expect(form.getByRole('radio')).toHaveCount(4);
    for (const [label, meaning] of meanings) {
      await expect(form.getByRole('radio', { name: new RegExp(`^${label}`) })).toContainText(meaning);
    }
    await expect(form.getByLabel(/Key insight/)).toBeVisible();
    await expect(form.getByText('New', { exact: true })).toBeVisible();
    await expect(form.getByRole('button', { name: 'Reveal key insight' })).toHaveCount(0);
    await captureBothSizes(page, 'today-report-first-solve');
  });

  test('keys 1 to 4 pick a rating and Enter submits', async ({ page }) => {
    await openScreen(page, 'today', 'fresh');
    await page.getByRole('button', { name: 'I solved it' }).click();
    const form = dialog(page);
    await page.keyboard.press('Enter');
    await expect(form).toBeVisible(); // nothing picked yet: Enter does not submit
    for (const [key, label] of [
      ['1', 'Again'],
      ['2', 'Hard'],
      ['3', 'Good'],
      ['4', 'Easy'],
    ] as const) {
      await page.keyboard.press(key);
      await expect(form.getByRole('radio', { name: new RegExp(`^${label}`) })).toHaveAttribute('aria-checked', 'true');
      await expect(form.getByRole('radio', { checked: true })).toHaveCount(1);
    }
    await page.keyboard.press('1');
    await expect(form.getByText('Counts for today. Para gets a crumb.')).toBeVisible();
    await page.keyboard.press('3');
    await expect(form.getByTestId('report-hint')).toHaveText(/^Next review (tomorrow|in .+)$/);
    await page.keyboard.press('Enter');
    await expect(form).toHaveCount(0);
    expect(await lastRating(page, 1)).toBe('good');
  });

  test('typing digits in the minutes field does not change the rating', async ({ page }) => {
    await openScreen(page, 'today', 'fresh');
    await page.getByRole('button', { name: 'I solved it' }).click();
    await dialog(page).getByRole('radio', { name: /^Good/ }).click();
    await dialog(page).getByLabel('Minutes').fill('14');
    await expect(dialog(page).getByRole('radio', { name: /^Good/ })).toHaveAttribute('aria-checked', 'true');
  });

  test('minutes must be a whole number from 0 to 1440', async ({ page }) => {
    await openScreen(page, 'today', 'fresh');
    await page.getByRole('button', { name: 'I solved it' }).click();
    const form = dialog(page);
    await form.getByRole('radio', { name: /^Good/ }).click();
    for (const bad of ['abc', '1441', '-5', '2.5']) {
      await form.getByLabel('Minutes').fill(bad);
      await expect(form.getByText('Enter whole minutes from 0 to 1440')).toBeVisible();
      await expect(form.getByRole('button', { name: 'Feed Para' })).toBeDisabled();
    }
    await form.getByLabel('Minutes').fill('1440');
    await expect(form.getByText('Enter whole minutes from 0 to 1440')).toHaveCount(0);
    await expect(form.getByRole('button', { name: 'Feed Para' })).toBeEnabled();
  });

  test('notes expand on request and the key insight stops at 300 characters', async ({ page }) => {
    await openScreen(page, 'today', 'fresh');
    await page.getByRole('button', { name: 'I solved it' }).click();
    const form = dialog(page);
    await expect(form.getByLabel('Notes')).toHaveCount(0);
    await form.getByRole('button', { name: '+ Add notes' }).click();
    await expect(form.getByLabel('Notes')).toBeVisible();
    await form.getByLabel(/Key insight/).fill('x'.repeat(400));
    await expect(form.getByLabel(/Key insight/)).toHaveValue('x'.repeat(300));
  });

  test('a failed submit shows the error and keeps what the user typed', async ({ page }) => {
    await openScreen(page, 'today', 'fresh');
    await page.evaluate(() => {
      const api = (globalThis as unknown as Host).paraleet;
      const original = api.submitReport;
      let failed = false;
      api.submitReport = (input) => {
        if (!failed) {
          failed = true;
          return Promise.reject(new Error('The database is busy'));
        }
        return original(input);
      };
    });
    await page.getByRole('button', { name: 'I solved it' }).click();
    const form = dialog(page);
    await form.getByRole('radio', { name: /^Hard/ }).click();
    await form.getByLabel('Minutes').fill('22');
    await form.getByLabel(/Key insight/).fill('Use a map');
    await form.getByRole('button', { name: 'Feed Para' }).click();
    await expect(form.getByRole('alert')).toHaveText('The database is busy');
    await expect(form.getByLabel('Minutes')).toHaveValue('22');
    await expect(form.getByLabel(/Key insight/)).toHaveValue('Use a map');
    await expect(form.getByRole('radio', { name: /^Hard/ })).toHaveAttribute('aria-checked', 'true');
    await form.getByRole('button', { name: 'Feed Para' }).click();
    await expect(form).toHaveCount(0);
  });

  test('a review hides the saved insight; reporting without revealing shows it once', async ({ page }) => {
    await openScreen(page, 'today');
    await quickLogPick(page, 'two sum', /^1\. Two Sum/);
    const form = dialog(page);
    await expect(form.getByRole('button', { name: 'Reveal key insight' })).toBeVisible();
    await expect(form.getByLabel(/Key insight/)).toHaveCount(0);
    await captureBothSizes(page, 'today-report-review');
    await form.getByRole('radio', { name: /^Good/ }).click();
    await form.getByRole('button', { name: 'Feed Para' }).click();
    await expect(form.getByText('Your key insight')).toBeVisible();
    await expect(form).toContainText("Store each value's index in a hash map");
    await form.getByRole('button', { name: 'Done' }).click();
    await expect(form).toHaveCount(0);
    expect(await lastRating(page, 1)).toBe('good');
  });

  test('revealing the insight caps the rating at Hard', async ({ page }) => {
    await openScreen(page, 'today');
    await quickLogPick(page, 'two sum', /^1\. Two Sum/);
    const form = dialog(page);
    await expect(form).toContainText('1. Two Sum');
    await form.getByRole('radio', { name: /^Easy/ }).click();
    await form.getByRole('button', { name: 'Reveal key insight' }).click();
    await expect(form.getByLabel(/Key insight/)).toHaveValue(/Store each value's index/);
    await expect(form.getByRole('radio', { name: /^Good/ })).toBeDisabled();
    await expect(form.getByRole('radio', { name: /^Easy/ })).toBeDisabled();
    await expect(form.getByRole('radio', { name: /^Hard/ })).toHaveAttribute('aria-checked', 'true');
    await expect(form.getByText('Revealing the key insight limits the rating to Hard.')).toBeVisible();
    await page.keyboard.press('3');
    await expect(form.getByRole('radio', { name: /^Hard/ })).toHaveAttribute('aria-checked', 'true');
    await form.getByRole('radio', { name: /^Again/ }).click();
    await expect(form.getByRole('radio', { name: /^Again/ })).toHaveAttribute('aria-checked', 'true');
    await form.getByRole('radio', { name: /^Hard/ }).click();
    await captureBothSizes(page, 'today-report-revealed');
    await form.getByRole('button', { name: 'Feed Para' }).click();
    // The insight was shown, so there is no confirmation step.
    await expect(form).toHaveCount(0);
    expect(await lastRating(page, 1)).toBe('hard');
  });

  test('a review with no saved insight shows the empty field at once', async ({ page }) => {
    await openScreen(page, 'today');
    // Valid Anagram was reviewed without ever saving an insight.
    await quickLogPick(page, 'valid anagram', /Valid Anagram/);
    await expect(dialog(page).getByLabel(/Key insight/)).toHaveValue('');
    await expect(dialog(page).getByRole('button', { name: 'Reveal key insight' })).toHaveCount(0);
  });

  test('Cancel and Esc close the form without recording anything', async ({ page }) => {
    await openScreen(page, 'today', 'fresh');
    await page.getByRole('button', { name: 'I solved it' }).click();
    await dialog(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'I solved it' }).click();
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByTestId('pet-status')).toHaveText('Para is waiting for one problem');
  });
});

test.describe('due reviews', () => {
  test('lists at most five, most overdue first, and never a count', async ({ page }) => {
    await openScreen(page, 'today', 'backlog');
    const section = page.getByRole('region', { name: 'Due for review' });
    await expect(section.getByTestId('due-row')).toHaveCount(5);
    await expect(section.getByRole('heading')).toHaveText('Due for review');
    const overdue = (await section.getByTestId('due-row').allInnerTexts()).map((text) => {
      const days = /due (\d+)d ago/.exec(text);
      return days ? Number(days[1]) : 0;
    });
    expect(overdue).toEqual([...overdue].sort((a, b) => b - a));
    const body = (await page.getByTestId('screen-today').innerText()).toLowerCase();
    expect(body).not.toMatch(/\b\d+ (more|overdue|due|reviews)\b/);
    expect(body).not.toMatch(/\bmore\b|\btotal\b|\bbehind\b/);
    await captureBothSizes(page, 'today-backlog');
  });

  test('rows have Open, Report and Make today\'s actions', async ({ page }) => {
    await openScreen(page, 'today');
    const row = page.getByTestId('due-row').first();
    const name = await row.locator('span.truncate').innerText();
    await row.hover();
    await captureBothSizes(page, 'today-due-hover');
    await row.getByRole('button', { name: 'Open', exact: true }).click();
    await expect.poll(() => mockOpenedUrls(page)).toHaveLength(1);
    await row.getByRole('button', { name: 'Report' }).click();
    await expect(dialog(page)).toContainText(name.replace(/^\d+\.\s*/, ''));
    await page.keyboard.press('Escape');
    await row.getByRole('button', { name: "Make today's" }).click();
    await expect(page.getByTestId('today-title')).toHaveText(name);
    await expect(page.getByText('Your pick', { exact: true })).toBeVisible();
    await expect(page.getByTestId('due-row').filter({ hasText: name })).toHaveCount(0);
  });

  test('is reachable with the keyboard', async ({ page }) => {
    await openScreen(page, 'today');
    await page.getByTestId('due-row').first().getByRole('button', { name: 'Open', exact: true }).focus();
    await expect(page.getByTestId('due-row').first().getByRole('button', { name: 'Report' })).toBeVisible();
  });

  test('Make today\'s is hidden once today is done', async ({ page }) => {
    await openScreen(page, 'today', 'fed');
    await page.getByTestId('due-row').first().hover();
    await expect(page.getByRole('button', { name: "Make today's" })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Report' }).first()).toBeVisible();
  });

  test('an empty list says so warmly', async ({ page }) => {
    await openScreen(page, 'today', 'fresh');
    await expect(page.getByText('Nothing due. Para approves.')).toBeVisible();
  });
});

test.describe('swap', () => {
  test('swaps today\'s problem for another due review', async ({ page }) => {
    await openScreen(page, 'today');
    const before = await page.getByTestId('today-title').innerText();
    await page.getByRole('button', { name: 'Swap', exact: true }).click();
    await captureBothSizes(page, 'today-swap');
    const options = dialog(page).getByRole('region', { name: 'Due for review' }).getByRole('button');
    const first = options.first();
    const picked = (await first.locator('span.truncate').innerText()).trim();
    await first.click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByTestId('today-title')).toHaveText(picked);
    expect(picked).not.toBe(before);
  });

  test('says so when there is nothing to swap to', async ({ page }) => {
    await openScreen(page, 'today', 'fresh');
    await page.getByRole('button', { name: 'Swap', exact: true }).click();
    await expect(dialog(page).getByText('Nothing to swap to right now.')).toBeVisible();
  });
});

test.describe('quick log', () => {
  test('finds a problem by search and opens the report form for it', async ({ page }) => {
    await openScreen(page, 'today');
    const input = page.getByRole('combobox', { name: 'Paste a problem URL or search' });
    await expect(input).toHaveAttribute('placeholder', 'Paste a problem URL or search');
    await input.fill('weird');
    await expect(page.getByRole('option', { name: /Weird Algorithm/ })).toContainText('CSES');
    await captureBothSizes(page, 'today-quicklog');
    // At the minimum size the input is below the fold: retake that shot scrolled to it.
    await page.setViewportSize({ width: 860, height: 580 });
    await input.scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'artifacts/screenshots/today-quicklog-min.png', animations: 'disabled' });
    await page.keyboard.press('Enter');
    await expect(dialog(page)).toContainText('Weird Algorithm');
    await dialog(page).getByRole('radio', { name: /^Good/ }).click();
    await dialog(page).getByRole('button', { name: 'Feed Para' }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByTestId('pet-status')).toHaveText('Para is fed for today');
    // Today's assignment is untouched, so the card stays and says the pick is a bonus.
    await expect(page.getByText('Para is already fed. This one is a bonus.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'I solved it' })).toBeVisible();
  });

  test('arrow keys move through the results', async ({ page }) => {
    await openScreen(page, 'today');
    await page.getByRole('combobox', { name: 'Paste a problem URL or search' }).fill('two');
    const options = page.getByRole('option');
    await expect(options.nth(1)).toBeVisible();
    await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowDown');
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowUp');
    await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true');
  });

  test('a pasted URL for a known problem is the single result', async ({ page }) => {
    await openScreen(page, 'today');
    await page.getByRole('combobox', { name: 'Paste a problem URL or search' }).fill('https://leetcode.com/problems/two-sum/');
    await expect(page.getByRole('option')).toHaveCount(1);
    await expect(page.getByRole('option')).toContainText('1. Two Sum');
    await page.getByRole('option').click();
    await expect(dialog(page)).toContainText('Two Sum');
  });

  test('a pasted URL the app does not know says so', async ({ page }) => {
    await openScreen(page, 'today');
    await page
      .getByRole('combobox', { name: 'Paste a problem URL or search' })
      .fill('https://leetcode.com/problems/a-brand-new-problem/');
    await expect(page.getByRole('status')).toHaveText(
      'ParaLeet does not know this problem yet. Add it from the Problems screen.',
    );
    await expect(page.getByRole('option')).toHaveCount(0);
  });

  test('a link that is not a problem shows the reason', async ({ page }) => {
    await openScreen(page, 'today');
    await page.getByRole('combobox', { name: 'Paste a problem URL or search' }).fill('http://nonsense');
    await expect(page.getByRole('status')).toHaveText('That does not look like a link. Paste the full problem URL.');
  });
});

test.describe('nothing assigned', () => {
  test('says so plainly and offers quick-log', async ({ page }) => {
    await openScreen(page, 'today', 'nothing');
    await expect(page.getByText('Para has no pick for today')).toBeVisible();
    await expect(page.getByText('Logging any problem you solve still feeds Para.')).toBeVisible();
    await expect(page.getByTestId('today-title')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'I solved it' })).toHaveCount(0);
    await captureBothSizes(page, 'today-nothing');
    await page.getByRole('button', { name: 'Log a problem' }).click();
    await expect(page.getByRole('combobox', { name: 'Paste a problem URL or search' })).toBeFocused();
    await quickLogPick(page, 'two sum', /^1\. Two Sum/);
    await dialog(page).getByRole('radio', { name: /^Good/ }).click();
    await dialog(page).getByRole('button', { name: 'Feed Para' }).click();
    await expect(page.getByTestId('pet-status')).toHaveText('Para is fed for today');
  });
});

test('the right rail moves under the main column below 960px', async ({ page }) => {
  await openScreen(page, 'today');
  await page.setViewportSize({ width: 1100, height: 720 });
  const streak = page.getByTestId('streak-current');
  const title = page.getByTestId('today-title');
  const wide = { streak: await streak.boundingBox(), title: await title.boundingBox() };
  expect(wide.streak!.x).toBeGreaterThan(wide.title!.x + wide.title!.width - 1);
  await page.setViewportSize({ width: 860, height: 580 });
  const narrow = { streak: await streak.boundingBox(), title: await title.boundingBox() };
  expect(narrow.streak!.y).toBeGreaterThan(narrow.title!.y);
  const scrollWidth = await page.evaluate(() => (globalThis as unknown as Host).document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(860);
});
