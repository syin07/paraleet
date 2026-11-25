import { expect, test, type Page } from '@playwright/test';
import type { ParaLeetApi } from '../../src/bridge/contract';
import { captureBothSizes, mockOpenedUrls, openScreen, WINDOW_MIN } from './screenshots';

const rows = (page: Page) => page.getByTestId('problem-row');
const row = (page: Page, title: string) => rows(page).filter({ hasText: title });
const drawer = (page: Page) => page.getByRole('complementary', { name: 'Details' });
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Add a problem' });

/** Opens a filter menu, ticks one option, and closes the menu again. */
async function pick(page: Page, menu: string, option: string): Promise<void> {
  await page.locator('button[aria-haspopup="menu"]').filter({ hasText: menu }).click();
  await page.getByRole('menuitemcheckbox', { name: option }).click();
  await page.keyboard.press('Escape');
}

async function titles(page: Page): Promise<string[]> {
  return rows(page).evaluateAll((nodes) => nodes.map((node) => node.querySelector('[role="cell"]')?.textContent ?? ''));
}

async function attemptCounts(page: Page): Promise<number[]> {
  return rows(page).evaluateAll((nodes) =>
    nodes.map((node) => Number([...node.querySelectorAll('[role="cell"]')].at(-1)?.textContent ?? 'NaN')),
  );
}

async function startAdding(page: Page, url: string): Promise<void> {
  await page.getByRole('button', { name: 'Add problem' }).first().click();
  await expect(dialog(page).getByPlaceholder('https://leetcode.com/problems/…')).toBeFocused();
  await dialog(page).getByPlaceholder('https://leetcode.com/problems/…').fill(url);
}

test.describe('table', () => {
  test('lists every logged problem with its columns', async ({ page }) => {
    await openScreen(page, 'problems');
    await expect(page.getByText('10 logged')).toBeVisible();
    await expect(rows(page)).toHaveCount(10);
    for (const name of ['Title', 'Platform', 'Topics', 'Difficulty', 'Last attempt', 'Next review', 'Attempts']) {
      await expect(page.getByRole('columnheader', { name })).toBeVisible();
    }
    const two = row(page, '1. Two Sum');
    await expect(two).toContainText('LeetCode');
    await expect(two).toContainText('Arrays & hashing');
    await expect(two).toContainText('Easy');
    await expect(two).toContainText('10d ago');
    await expect(two.getByRole('cell').last()).toHaveText('2');
    // A problem on another platform shows its own ID and rating.
    const watermelon = row(page, 'Watermelon');
    await expect(watermelon).toContainText('Codeforces');
    await expect(watermelon).toContainText('4A');
    await expect(watermelon).toContainText('800');
    await captureBothSizes(page, 'problems-default');
  });

  test('searching by title or ID filters as the user types', async ({ page }) => {
    await openScreen(page, 'problems');
    const search = page.getByRole('searchbox', { name: 'Search problems' });
    await search.pressSequentially('pal');
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText('Valid Palindrome');
    await search.fill('');
    await expect(rows(page)).toHaveCount(10);
    await search.fill('1068');
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText('Weird Algorithm');
    await search.fill('zzzz');
    await expect(rows(page)).toHaveCount(0);
    await expect(page.getByText('No problems match these filters')).toBeVisible();
    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(rows(page)).toHaveCount(10);
    await expect(search).toHaveValue('');
  });

  test('platform, topic, difficulty and status filters work alone and together', async ({ page }) => {
    await openScreen(page, 'problems');

    await pick(page, 'Platform', 'Codeforces');
    await expect(rows(page)).toHaveCount(2);
    await pick(page, 'Platform', 'CSES');
    await expect(rows(page)).toHaveCount(3); // OR within one kind
    await page.getByRole('button', { name: 'Remove filter CSES' }).click();
    await page.getByRole('button', { name: 'Remove filter Codeforces' }).click();
    await expect(rows(page)).toHaveCount(10);

    await pick(page, 'Topic', 'Math');
    await expect(rows(page)).toHaveCount(2);
    await page.getByRole('button', { name: 'Clear' }).click();

    await pick(page, 'Difficulty', 'No rating');
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText('Weird Algorithm');
    await page.getByRole('button', { name: 'Clear' }).click();

    await pick(page, 'Status', 'Due');
    const due = await rows(page).count();
    expect(due).toBeGreaterThan(0);
    expect(due).toBeLessThan(10);
    for (const badge of await rows(page).all()) await expect(badge).toContainText('Due');
    await page.getByRole('button', { name: 'Clear' }).click();

    // Kinds combine with AND.
    await pick(page, 'Platform', 'Codeforces');
    await pick(page, 'Topic', 'Binary search');
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText('K-th Not Divisible by n');
    await captureBothSizes(page, 'problems-filtered');
    await pick(page, 'Difficulty', 'Medium');
    await expect(rows(page)).toHaveCount(0);
    await captureBothSizes(page, 'problems-no-matches');
    await page.getByRole('button', { name: 'Remove filter Medium' }).click();
    await expect(rows(page)).toHaveCount(1);
    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(rows(page)).toHaveCount(10);
    await expect(page.getByTestId('filter-chips')).toHaveCount(0);
  });

  test('sorts by next review by default and by any column header', async ({ page }) => {
    await openScreen(page, 'problems');
    // Due cards come first.
    await expect(rows(page).first()).toContainText('Due');
    const lastRow = rows(page).last();
    await expect(lastRow).not.toContainText('Due');

    await page.getByRole('button', { name: 'Attempts' }).click();
    const ascending = await attemptCounts(page);
    expect(ascending).toEqual([...ascending].sort((a, b) => a - b));
    await page.getByRole('button', { name: 'Attempts' }).click();
    const descending = await attemptCounts(page);
    expect(descending).toEqual([...descending].sort((a, b) => b - a));
    await expect(page.getByRole('columnheader', { name: 'Attempts' })).toHaveAttribute('aria-sort', 'descending');

    await page.getByRole('button', { name: 'Title' }).click();
    const sorted = await titles(page);
    expect(sorted).toEqual([...sorted].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })));
  });

  test('rows can be reached with the keyboard', async ({ page }) => {
    await openScreen(page, 'problems');
    await rows(page).first().focus();
    await page.keyboard.press('ArrowDown');
    await expect(rows(page).nth(1)).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(rows(page).first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    const second = await rows(page).nth(1).innerText();
    await page.keyboard.press('Enter');
    await expect(drawer(page)).toBeVisible();
    expect(second).toContain((await drawer(page).getByRole('heading', { level: 2 }).innerText()).replace(/^\d+\. /, ''));
  });

  test('the table does not scroll sideways at the minimum width and hides Topics', async ({ page }) => {
    await page.setViewportSize(WINDOW_MIN);
    await openScreen(page, 'problems', 'many');
    await expect(page.getByRole('columnheader', { name: 'Topics' })).toBeHidden();
    const overflow = await page.getByRole('table').evaluate((node) => node.scrollWidth - node.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const pageOverflow = await page
      .getByTestId('screen-problems')
      .evaluate((node) => node.scrollWidth - node.clientWidth);
    expect(pageOverflow).toBeLessThanOrEqual(0);
  });

  test('topic chips are shown whole or not at all', async ({ page }) => {
    await openScreen(page, 'problems', 'many');
    await expect(rows(page)).toHaveCount(35);
    const clipped = await page.getByTestId('topic-chip').evaluateAll((chips) =>
      chips
        // Chips wrapped out of the one-line row are folded into "+n"; only shown ones count.
        .filter((chip) => (chip as unknown as { offsetTop: number }).offsetTop === 0)
        .map((chip) => ({ text: chip.textContent, over: chip.scrollWidth - chip.clientWidth }))
        .filter((chip) => chip.over > 0),
    );
    expect(clipped).toEqual([]);
    // Folded chips are counted and named in the tooltip.
    const folded = rows(page).filter({ hasText: '+1' }).first().getByRole('cell').nth(2);
    expect(await folded.getAttribute('title')).toContain(',');
  });

  test('the Due filter never shows how many reviews are due', async ({ page }) => {
    await openScreen(page, 'problems', 'backlog');
    await expect(rows(page)).toHaveCount(9);
    // Retire one so the due count (8) differs from the logged count (9).
    await rows(page).first().click();
    await drawer(page).getByRole('button', { name: 'Retire card' }).click();
    await drawer(page).getByRole('button', { name: 'Retire', exact: true }).click();
    await expect(drawer(page).getByText('Retired', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.locator('button[aria-haspopup="menu"]').filter({ hasText: 'Status' }).click();
    await expect(page.getByRole('menuitemcheckbox', { name: /\d/ })).toHaveCount(0);
    await page.getByRole('menuitemcheckbox', { name: 'Due' }).click();
    await page.keyboard.press('Escape');
    await expect(rows(page)).toHaveCount(8);

    const outside = await page.getByTestId('screen-problems').evaluate((node) => {
      const copy = node.cloneNode(true) as { querySelectorAll(selector: string): { remove(): void }[]; innerText?: string; textContent: string | null };
      copy.querySelectorAll('[data-testid="problem-row"]').forEach((element) => element.remove());
      return copy.textContent ?? '';
    });
    expect(outside).not.toContain('Showing');
    expect(outside).not.toMatch(/\b8\b/);
    expect(outside).toContain('9 logged');
    await expect(page.getByTestId('filter-chips')).toHaveText('DueClear');
  });

  test('many problems', async ({ page }) => {
    await openScreen(page, 'problems', 'many');
    await expect(rows(page)).toHaveCount(35);
    await captureBothSizes(page, 'problems-many');
  });

  test('nothing logged shows how to log the first problem', async ({ page }) => {
    await openScreen(page, 'problems', 'fresh');
    await expect(page.getByText('No problems yet')).toBeVisible();
    await expect(page.getByText("Solve today's problem or add one by URL")).toBeVisible();
    await expect(rows(page)).toHaveCount(0);
    await expect(page.getByRole('searchbox')).toHaveCount(0);
    await captureBothSizes(page, 'problems-empty');
    // Its button opens the add dialog.
    await page.getByRole('button', { name: 'Add problem' }).last().click();
    await expect(dialog(page)).toBeVisible();
  });
});

test.describe('detail drawer', () => {
  test('opens on a row click with the link, every attempt and the notes', async ({ page }) => {
    await openScreen(page, 'problems');
    await row(page, 'Valid Palindrome').click();
    await expect(drawer(page)).toBeVisible();
    await expect(drawer(page).getByRole('heading', { level: 2 })).toHaveText('125. Valid Palindrome');
    await expect(row(page, 'Valid Palindrome')).toHaveAttribute('aria-selected', 'true');

    // Newest first: the Hard retry before the Again.
    const attempts = drawer(page).getByTestId('attempt');
    await expect(attempts).toHaveCount(2);
    await expect(attempts.first()).toContainText('Hard');
    await expect(attempts.first()).toContainText('18 min');
    await expect(attempts.first()).toContainText('review');
    await expect(attempts.last()).toContainText('Again');
    await expect(attempts.last()).toContainText('30 min');
    await expect(attempts.last()).toContainText('first solve');
    await expect(attempts.last()).toContainText('Forgot to skip non-alphanumeric characters.');

    await expect(drawer(page).getByLabel('Key insight')).toHaveValue(/Two pointers from both ends/);
    await expect(drawer(page).getByText('two pointers from both ends', { exact: true })).toBeVisible();
    await expect(drawer(page).getByLabel('Notes')).toHaveValue(/Second try went fine/);
    await expect(drawer(page).getByLabel('Link to my solution')).toHaveValue(/leetcode\.com\/problems\/valid-palindrome/);

    await drawer(page).getByRole('button', { name: 'Open on platform' }).click();
    expect(await mockOpenedUrls(page)).toEqual(['https://leetcode.com/problems/valid-palindrome/']);
    await captureBothSizes(page, 'problems-drawer');

    // The table behind it stays usable: another row switches the drawer.
    await page.setViewportSize({ width: 1100, height: 720 });
    await row(page, 'Two Sum').click();
    await expect(drawer(page).getByRole('heading', { level: 2 })).toHaveText('1. Two Sum');
    await page.keyboard.press('Escape');
    await expect(drawer(page)).toHaveCount(0);
  });

  test('the key insight, tags, notes and solution link can be edited and are kept', async ({ page }) => {
    await openScreen(page, 'problems');
    await row(page, '704. Binary Search').click();
    const panel = drawer(page);
    await expect(panel.getByLabel('Key insight')).toHaveValue('');

    await panel.getByLabel('Key insight').fill('Halve the range until it is one element');
    await panel.getByLabel('Key insight').press('Enter');
    await panel.getByLabel('Add a pattern tag').fill('lo hi mid');
    await panel.getByLabel('Add a pattern tag').press('Enter');
    await panel.getByLabel('Add a pattern tag').pressSequentially('off by one,');
    await expect(panel.getByRole('button', { name: 'Remove tag off by one' })).toBeVisible();
    await panel.getByLabel('Notes').fill('Use lo + (hi - lo) / 2.');
    await panel.getByLabel('Notes').blur();
    await expect(panel.getByText('Saved', { exact: true })).toBeVisible();
    await panel.getByLabel('Link to my solution').fill('https://example.com/my-binary-search');
    await panel.getByLabel('Link to my solution').blur();

    // Close, reopen: every field is still there, so saving one did not wipe another.
    await page.keyboard.press('Escape');
    await expect(drawer(page)).toHaveCount(0);
    await row(page, '704. Binary Search').click();
    await expect(panel.getByLabel('Key insight')).toHaveValue('Halve the range until it is one element');
    await expect(panel.getByText('lo hi mid', { exact: true })).toBeVisible();
    await expect(panel.getByText('off by one', { exact: true })).toBeVisible();
    await expect(panel.getByLabel('Notes')).toHaveValue('Use lo + (hi - lo) / 2.');
    await expect(panel.getByLabel('Link to my solution')).toHaveValue('https://example.com/my-binary-search');

    // A tag can be removed.
    await panel.getByRole('button', { name: 'Remove tag lo hi mid' }).click();
    await page.keyboard.press('Escape');
    await row(page, '704. Binary Search').click();
    await expect(panel.getByText('lo hi mid', { exact: true })).toHaveCount(0);
    await expect(panel.getByText('off by one', { exact: true })).toBeVisible();
    await expect(panel.getByLabel('Key insight')).toHaveValue('Halve the range until it is one element');

    // Open is enabled for the saved link and opens it.
    await panel.getByRole('button', { name: 'Open', exact: true }).click();
    expect(await mockOpenedUrls(page)).toEqual(['https://example.com/my-binary-search']);
  });

  test('several tags pasted at once are all added and kept', async ({ page }) => {
    await openScreen(page, 'problems');
    await row(page, '125. Valid Palindrome').click();
    const panel = drawer(page);
    const field = panel.getByLabel('Add a pattern tag');
    await field.fill('dp, greedy, bfs,');
    for (const tag of ['dp', 'greedy', 'bfs']) await expect(panel.getByText(tag, { exact: true })).toBeVisible();
    await expect(field).toHaveValue('');

    // Text after the last comma stays in the field until Enter.
    await field.fill('heap, two');
    await expect(panel.getByText('heap', { exact: true })).toBeVisible();
    await expect(field).toHaveValue(' two');
    await field.press('Enter');
    await expect(panel.getByText('two', { exact: true })).toBeVisible();

    await page.keyboard.press('Escape');
    await row(page, '125. Valid Palindrome').click();
    for (const tag of ['two pointers from both ends', 'dp', 'greedy', 'bfs', 'heap', 'two']) {
      await expect(panel.getByText(tag, { exact: true })).toBeVisible();
    }
  });

  test('pasted tags skip repeats of each other and of existing tags, whatever the case', async ({ page }) => {
    await openScreen(page, 'problems');
    await row(page, '125. Valid Palindrome').click();
    const panel = drawer(page);
    await panel.getByLabel('Add a pattern tag').fill('dp, DP, Two Pointers From Both Ends, greedy, dp,');
    await expect(panel.getByText('greedy', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await row(page, '125. Valid Palindrome').click();
    await expect(panel.getByRole('button', { name: /^Remove tag/ })).toHaveCount(3);
    await expect(panel.getByText('dp', { exact: true })).toHaveCount(1);
  });

  test('no more than 20 tags are kept from one paste', async ({ page }) => {
    await openScreen(page, 'problems');
    await row(page, '1. Two Sum').click();
    const many = Array.from({ length: 25 }, (_, index) => `tag${index}`).join(',') + ',';
    await drawer(page).getByLabel('Add a pattern tag').fill(many);
    await expect(drawer(page).getByRole('button', { name: /^Remove tag/ })).toHaveCount(20);
    await expect(drawer(page).getByText('20 tags at most')).toBeVisible();
    await drawer(page).getByRole('button', { name: 'Remove tag tag0' }).click();
    await expect(drawer(page).getByText('20 tags at most')).toHaveCount(0);
  });

  test('Saved only shows while the text on screen is the text that was saved', async ({ page }) => {
    await openScreen(page, 'problems');
    await row(page, '1. Two Sum').click();
    // Make saving slow so the text can change while a save is in flight.
    await page.evaluate(() => {
      const bridge = (globalThis as unknown as {
        paraleet: { saveProblemNotes: (input: unknown) => Promise<unknown> };
      }).paraleet;
      const original = bridge.saveProblemNotes.bind(bridge);
      bridge.saveProblemNotes = async (input) => {
        await new Promise((resolve) => setTimeout(resolve, 600));
        return original(input);
      };
    });
    const notes = drawer(page).getByLabel('Notes');
    await notes.fill('first version');
    await notes.blur();
    await notes.focus();
    await notes.press('End');
    await notes.pressSequentially(' and more');
    await expect(drawer(page).getByText('Saved', { exact: true })).toHaveCount(0);
    await page.waitForTimeout(900);
    await expect(drawer(page).getByText('Saved', { exact: true })).toHaveCount(0);
    await notes.blur();
    await expect(drawer(page).getByText('Saved', { exact: true })).toBeVisible();
  });

  test('a save that fails while the drawer closes reopens it with the text and the error', async ({ page }) => {
    await openScreen(page, 'problems');
    await row(page, '1. Two Sum').click();
    await page.evaluate(() => {
      const bridge = (globalThis as unknown as { paraleet: { saveProblemNotes: () => Promise<never> } }).paraleet;
      bridge.saveProblemNotes = () => Promise.reject(new Error('The disk is full'));
    });
    await drawer(page).getByLabel('Notes').fill('typed, then closed');
    await page.keyboard.press('Escape');
    await expect(drawer(page).getByRole('alert')).toContainText('The disk is full');
    await expect(drawer(page).getByLabel('Notes')).toHaveValue('typed, then closed');
    // Closing again with the same text lets the user go.
    await page.keyboard.press('Escape');
    await expect(drawer(page)).toHaveCount(0);
    await page.waitForTimeout(300);
    await expect(drawer(page)).toHaveCount(0);
  });

  test('a failed save while switching problems brings the first problem back', async ({ page }) => {
    await openScreen(page, 'problems');
    await row(page, '1. Two Sum').click();
    await page.evaluate(() => {
      const bridge = (globalThis as unknown as { paraleet: { saveProblemNotes: () => Promise<never> } }).paraleet;
      bridge.saveProblemNotes = () => Promise.reject(new Error('No space left'));
    });
    await drawer(page).getByLabel('Notes').fill('keep me');
    await row(page, '121. Best Time').click();
    await expect(drawer(page).getByRole('heading', { level: 2 })).toHaveText('1. Two Sum');
    await expect(drawer(page).getByLabel('Notes')).toHaveValue('keep me');
    await expect(drawer(page).getByRole('alert')).toContainText('No space left');
  });

  test('going A to B to A shows the notes as last saved for A', async ({ page }) => {
    await openScreen(page, 'problems');
    await row(page, '1. Two Sum').click();
    await drawer(page).getByLabel('Notes').fill('written in A');
    await row(page, '121. Best Time').click();
    await row(page, '1. Two Sum').click();
    await expect(drawer(page).getByLabel('Notes')).toHaveValue('written in A');
    await drawer(page).getByLabel('Notes').fill('written in A, then more');
    await row(page, '20. Valid Parentheses').click();
    await row(page, '1. Two Sum').click();
    await expect(drawer(page).getByLabel('Notes')).toHaveValue('written in A, then more');
  });

  test('a field being edited is saved when the drawer closes', async ({ page }) => {
    await openScreen(page, 'problems');
    await row(page, 'Two Sum').click();
    await drawer(page).getByLabel('Notes').fill('typed, never blurred');
    await page.keyboard.press('Escape');
    await row(page, 'Two Sum').click();
    await expect(drawer(page).getByLabel('Notes')).toHaveValue('typed, never blurred');
  });

  test('Open is disabled until a solution link is typed', async ({ page }) => {
    await openScreen(page, 'problems');
    await row(page, 'Two Sum').click();
    await expect(drawer(page).getByRole('button', { name: 'Open', exact: true })).toBeDisabled();
    await drawer(page).getByLabel('Link to my solution').fill('https://example.com/x');
    await expect(drawer(page).getByRole('button', { name: 'Open', exact: true })).toBeEnabled();
  });

  test('a failed save shows the error and keeps the typed text', async ({ page }) => {
    await openScreen(page, 'problems');
    await row(page, 'Two Sum').click();
    await page.evaluate(() => {
      const bridge = (globalThis as unknown as { paraleet: { saveProblemNotes: () => Promise<never> } }).paraleet;
      bridge.saveProblemNotes = () => Promise.reject(new Error('The disk is full'));
    });
    await drawer(page).getByLabel('Notes').fill('do not lose me');
    await drawer(page).getByLabel('Notes').blur();
    await expect(drawer(page).getByRole('alert')).toContainText('The disk is full');
    await expect(drawer(page).getByLabel('Notes')).toHaveValue('do not lose me');
  });

  test('a card can be retired and then reset', async ({ page }) => {
    await openScreen(page, 'problems');
    await row(page, 'Valid Parentheses').click();
    const panel = drawer(page);
    await expect(panel.getByRole('button', { name: 'Reset schedule' })).toBeVisible();

    await panel.getByRole('button', { name: 'Retire card' }).click();
    await expect(panel.getByText('Stop reviewing this problem?')).toBeVisible();
    await panel.getByRole('button', { name: 'Cancel' }).click();
    await expect(panel.getByRole('button', { name: 'Retire card' })).toBeVisible();

    await panel.getByRole('button', { name: 'Retire card' }).click();
    await panel.getByRole('button', { name: 'Retire', exact: true }).click();
    await expect(panel.getByText('Retired', { exact: true })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Retire card' })).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Reset schedule' })).toBeVisible();
    await expect(row(page, 'Valid Parentheses')).toContainText('Retired');
    await captureBothSizes(page, 'problems-drawer-retired');

    await panel.getByRole('button', { name: 'Reset schedule' }).click();
    await expect(panel.getByText('Clear its review history and make it due again?')).toBeVisible();
    await panel.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(panel.getByText('Retired', { exact: true })).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Retire card' })).toBeVisible();
    await expect(row(page, 'Valid Parentheses')).toContainText('Due');
  });
});

test.describe('add a problem', () => {
  test('starts with one focused link field and explains what it takes', async ({ page }) => {
    await openScreen(page, 'problems');
    await page.getByRole('button', { name: 'Add problem' }).first().click();
    await expect(dialog(page).getByPlaceholder('https://leetcode.com/problems/…')).toBeFocused();
    await expect(dialog(page).getByText('LeetCode, CSES, Codeforces, or any other link')).toBeVisible();
    await expect(dialog(page).getByRole('button', { name: 'Add problem' })).toBeDisabled();
    await captureBothSizes(page, 'problems-add-empty');
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
  });

  test('a new LeetCode link: recognized, fill in the rest, opens the new problem', async ({ page }) => {
    await openScreen(page, 'problems');
    await startAdding(page, 'https://leetcode.com/problems/minimum-window-substring/description/');
    await expect(dialog(page).getByTestId('recognition')).toContainText('LeetCode');
    await expect(dialog(page).getByTestId('recognition')).toContainText('New problem');
    await expect(dialog(page).getByTestId('platform-id')).toHaveText('minimum-window-substring');
    await expect(dialog(page).getByRole('button', { name: 'Add problem' })).toBeDisabled();
    await dialog(page).getByLabel('Title').fill('Minimum Window Substring');
    await dialog(page).getByRole('radio', { name: 'Hard' }).click();
    await dialog(page).getByRole('button', { name: 'Strings' }).click();
    await dialog(page).getByRole('button', { name: 'Sliding window' }).click();
    await dialog(page).getByTestId('new-problem-fields').scrollIntoViewIfNeeded();
    await dialog(page).locator('.overflow-y-auto').evaluate((node) => node.scrollTo(0, 0));
    await captureBothSizes(page, 'problems-add-new');
    await dialog(page).getByRole('button', { name: 'Add problem' }).click();

    await expect(dialog(page)).toHaveCount(0);
    await expect(drawer(page).getByRole('heading', { level: 2 })).toHaveText('Minimum Window Substring');
    await expect(drawer(page)).toContainText('Hard');
    await expect(drawer(page)).toContainText('Sliding window');
    await expect(drawer(page).getByText('No attempts yet.')).toBeVisible();
    // No attempt, so it is not in the table and nothing offers a card to retire.
    await expect(rows(page)).toHaveCount(10);
    await expect(drawer(page).getByRole('button', { name: 'Retire card' })).toHaveCount(0);
    await expect(drawer(page).getByRole('button', { name: 'Reset schedule' })).toHaveCount(0);
  });

  test('a Codeforces link asks for a rating, not Easy/Medium/Hard', async ({ page }) => {
    await openScreen(page, 'problems');
    await startAdding(page, 'https://codeforces.com/contest/1/problem/A');
    await expect(dialog(page).getByTestId('recognition')).toContainText('Codeforces');
    await expect(dialog(page).getByRole('radio', { name: 'Hard' })).toHaveCount(0);
    await dialog(page).getByLabel('Title').fill('Theatre Square');
    const ratingError = dialog(page).getByText('Use a whole number from 800 to 3500');
    for (const bad of ['abc', '100', '0000', '0800', '09999', '9999', '799', '3501', '1400.5']) {
      await dialog(page).getByLabel('Rating').fill(bad);
      await expect(ratingError).toBeVisible();
      await expect(dialog(page).getByRole('button', { name: 'Add problem' })).toBeDisabled();
    }
    for (const good of ['800', '3500']) {
      await dialog(page).getByLabel('Rating').fill(good);
      await expect(ratingError).toHaveCount(0);
      await expect(dialog(page).getByRole('button', { name: 'Add problem' })).toBeEnabled();
    }
    await dialog(page).getByLabel('Rating').fill('1000');
    await dialog(page).getByRole('button', { name: 'Math' }).click();
    await dialog(page).getByRole('button', { name: 'Add problem' }).click();
    await expect(drawer(page).getByRole('heading', { level: 2 })).toHaveText('Theatre Square');
    await expect(drawer(page)).toContainText('Codeforces');
    await expect(drawer(page)).toContainText('1000');
  });

  test('a link from another site is accepted as "Other"', async ({ page }) => {
    await openScreen(page, 'problems');
    await startAdding(page, 'https://example.com/puzzles/42');
    await expect(dialog(page).getByTestId('recognition')).toContainText('Other');
    await expect(dialog(page).getByTestId('recognition')).toContainText('Other site');
    await dialog(page).getByLabel('Title').fill('A puzzle from a friend');
    await dialog(page).getByRole('radio', { name: 'Medium' }).click();
    await captureBothSizes(page, 'problems-add-other');
    await dialog(page).getByLabel('Title').press('Enter');
    await expect(drawer(page).getByRole('heading', { level: 2 })).toHaveText('A puzzle from a friend');
    await expect(drawer(page)).toContainText('Other');
  });

  test('no more than ten topics can be picked', async ({ page }) => {
    await openScreen(page, 'problems');
    await startAdding(page, 'https://cses.fi/problemset/task/9999');
    await expect(dialog(page).getByRole('radio', { name: 'Easy' })).toHaveCount(0);
    const group = dialog(page).getByRole('group', { name: 'Topics' });
    const chips = group.getByRole('button');
    for (let index = 0; index < 10; index += 1) await chips.nth(index).click();
    await expect(dialog(page).getByText('10 of 10')).toBeVisible();
    await expect(chips.nth(10)).toBeDisabled();
  });

  test('a problem that is already logged is opened instead of added twice', async ({ page }) => {
    await openScreen(page, 'problems');
    await startAdding(page, 'https://leetcode.com/problems/two-sum/');
    await expect(dialog(page).getByTestId('recognition')).toContainText('ParaLeet already knows this problem');
    await expect(dialog(page).getByTestId('known-problem')).toContainText('1. Two Sum');
    await expect(dialog(page).getByTestId('known-problem')).toContainText('Already in your problems');
    await expect(dialog(page).getByLabel('Title')).toHaveCount(0);
    await captureBothSizes(page, 'problems-add-known');
    await dialog(page).getByRole('button', { name: 'Open it' }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(drawer(page).getByRole('heading', { level: 2 })).toHaveText('1. Two Sum');
    await expect(rows(page)).toHaveCount(10);
  });

  test('a problem the app knows but the user has not tried opens without the logged note', async ({ page }) => {
    await openScreen(page, 'problems');
    await startAdding(page, 'https://leetcode.com/problems/reverse-linked-list/');
    await expect(dialog(page).getByTestId('recognition')).toContainText('ParaLeet already knows this problem');
    await expect(dialog(page).getByText('Already in your problems')).toHaveCount(0);
    await dialog(page).getByRole('button', { name: 'Open it' }).click();
    await expect(drawer(page).getByRole('heading', { level: 2 })).toContainText('Reverse Linked List');
    await expect(rows(page)).toHaveCount(10);
  });

  test('text that is not a link shows an error', async ({ page }) => {
    await openScreen(page, 'problems');
    await startAdding(page, 'two sum please');
    await expect(dialog(page).getByText('That does not look like a link. Paste the full problem URL.')).toBeVisible();
    await expect(dialog(page).getByTestId('recognition')).toHaveCount(0);
    await expect(dialog(page).getByRole('button', { name: 'Add problem' })).toBeDisabled();
    // Fixing the text clears the error.
    await dialog(page).getByPlaceholder('https://leetcode.com/problems/…').fill('https://leetcode.com/problems/two-sum/');
    await expect(dialog(page).getByTestId('recognition')).toBeVisible();
    await expect(dialog(page).getByText('That does not look like a link')).toHaveCount(0);
  });

  test('from the empty state the first problem can be added', async ({ page }) => {
    await openScreen(page, 'problems', 'fresh');
    await startAdding(page, 'https://leetcode.com/problems/word-break/');
    await dialog(page).getByLabel('Title').fill('Word Break');
    await dialog(page).getByRole('button', { name: 'Add problem' }).click();
    await expect(drawer(page).getByRole('heading', { level: 2 })).toHaveText('Word Break');
  });
});

type Bridge = { paraleet: ParaLeetApi };

test.describe('add a problem and report it', () => {
  const report = (page: Page) => page.getByRole('dialog', { name: 'How did it go?' });
  const box = (page: Page) => dialog(page).getByRole('checkbox', { name: 'I solved it today' });

  test('from Problems "I solved it today" starts off and the button says Add problem', async ({ page }) => {
    await openScreen(page, 'problems');
    await startAdding(page, 'https://leetcode.com/problems/a-brand-new-problem/');
    await expect(box(page)).not.toBeChecked();
    await dialog(page).getByLabel('Title').fill('A Brand New Problem');
    await expect(dialog(page).getByRole('button', { name: 'Add problem' })).toBeEnabled();
    await box(page).check();
    await expect(dialog(page).getByRole('button', { name: 'Add and report' })).toBeEnabled();
    await box(page).uncheck();
    await dialog(page).getByRole('button', { name: 'Add problem' }).click();
    await expect(report(page)).toHaveCount(0);
    await expect(drawer(page).getByRole('heading', { level: 2 })).toHaveText('A Brand New Problem');
  });

  test('ticked, adding a new problem goes to the report form and then to its drawer', async ({ page }) => {
    await openScreen(page, 'problems');
    await startAdding(page, 'https://leetcode.com/problems/a-brand-new-problem/');
    await dialog(page).getByLabel('Title').fill('A Brand New Problem');
    await box(page).check();
    await dialog(page).getByRole('button', { name: 'Add and report' }).click();
    await expect(report(page)).toContainText('A Brand New Problem');
    await report(page).getByRole('radio', { name: /^Good/ }).click();
    await report(page).getByRole('button', { name: 'Feed Para' }).click();
    await expect(report(page)).toHaveCount(0);
    await expect(drawer(page).getByRole('heading', { level: 2 })).toHaveText('A Brand New Problem');
  });

  test('a known link with the box ticked goes to the report form for that problem', async ({ page }) => {
    await openScreen(page, 'problems');
    await startAdding(page, 'https://leetcode.com/problems/two-sum/');
    await expect(dialog(page).getByTestId('known-problem')).toBeVisible();
    await expect(dialog(page).getByRole('button', { name: 'Open it' })).toBeEnabled();
    await box(page).check();
    await expect(dialog(page).getByRole('button', { name: 'Report it' })).toBeEnabled();
    await captureBothSizes(page, 'add-problem-known-solved-today');
    await dialog(page).getByRole('button', { name: 'Report it' }).click();
    await expect(report(page)).toContainText('Two Sum');
    await report(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(drawer(page).getByRole('heading', { level: 2 })).toHaveText('1. Two Sum');
  });

  test('a Codeforces problem added through the mock gets its difficulty band', async ({ page }) => {
    await openScreen(page, 'problems');
    await startAdding(page, 'https://codeforces.com/contest/1/problem/A');
    await dialog(page).getByLabel('Title').fill('Theatre Square');
    await dialog(page).getByLabel('Rating').fill('1600');
    await dialog(page).getByRole('button', { name: 'Add problem' }).click();
    const norm = await page.evaluate(async () => {
      const found = await (globalThis as unknown as Bridge).paraleet.searchProblems({ query: 'Theatre' });
      return found[0]?.difficultyNorm;
    });
    expect(norm).toBe(3);
  });
});

test.describe('dialogs that scroll', () => {
  const footer = (page: Page) => dialog(page).getByTestId('modal-footer');
  const fade = (page: Page) => dialog(page).getByTestId('modal-scroll-fade');

  test('a tall add dialog at the minimum size shows that it scrolls', async ({ page }) => {
    await openScreen(page, 'problems');
    await page.setViewportSize(WINDOW_MIN);
    await startAdding(page, 'https://leetcode.com/problems/minimum-window-substring/');
    await dialog(page).getByLabel('Title').fill('Minimum Window Substring');
    await expect(fade(page)).toBeVisible();
    await expect(footer(page)).not.toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
    await captureBothSizes(page, 'add-problem-tall-min');
    // Scrolled to the end, the fade has nothing left to hint at; the footer line stays.
    await page.setViewportSize(WINDOW_MIN);
    await dialog(page).locator('[data-scrolls]').evaluate((node) => node.scrollTo(0, node.scrollHeight));
    await expect(fade(page)).toHaveCount(0);
    await expect(footer(page)).not.toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
  });

  test('a short dialog shows no scroll hint', async ({ page }) => {
    await openScreen(page, 'problems');
    await page.getByRole('button', { name: 'Add problem' }).first().click();
    await expect(fade(page)).toHaveCount(0);
    await expect(footer(page)).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
  });

  test('the hint follows the window size', async ({ page }) => {
    await openScreen(page, 'problems');
    await startAdding(page, 'https://leetcode.com/problems/minimum-window-substring/');
    await dialog(page).getByLabel('Title').fill('Minimum Window Substring');
    await page.setViewportSize({ width: 1100, height: 1400 });
    await expect(fade(page)).toHaveCount(0);
    await page.setViewportSize(WINDOW_MIN);
    await expect(fade(page)).toBeVisible();
  });
});

test.describe('failed-save restore', () => {
  test('a restore that was never shown does not come back later', async ({ page }) => {
    await openScreen(page, 'problems');
    await row(page, '1. Two Sum').click();
    await page.evaluate(() => {
      const bridge = (globalThis as unknown as Bridge).paraleet;
      bridge.saveProblemNotes = () => Promise.reject(new Error('The disk is full'));
    });
    await drawer(page).getByLabel('Notes').fill('typed, then closed');
    // The reopened drawer loads slowly, so it is closed before it ever shows the restored text.
    await page.evaluate(() => {
      const bridge = (globalThis as unknown as Bridge).paraleet;
      const original = bridge.getProblemDetail;
      bridge.getProblemDetail = async (input) => {
        await new Promise((resolve) => setTimeout(resolve, 700));
        return original(input);
      };
    });
    await page.keyboard.press('Escape');
    await expect(drawer(page).getByText('Loading…')).toBeVisible();
    await drawer(page).getByRole('button', { name: 'Close' }).click();
    await expect(drawer(page)).toHaveCount(0);
    await page.waitForTimeout(900);
    await row(page, '1. Two Sum').click();
    await expect(drawer(page).getByLabel('Notes')).toBeVisible();
    await expect(drawer(page).getByLabel('Notes')).not.toHaveValue('typed, then closed');
    await expect(drawer(page).getByRole('alert')).toHaveCount(0);
  });
});
