import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { mockOpenedUrls } from './screenshots';

// The compact card's page, against the mock bridge. The native side (placement, focus, closing
// on blur) is covered by tests/e2e/tray.spec.ts and tests/e2e/card.spec.ts.

const SHOTS = resolve(import.meta.dirname, '../../artifacts/screenshots');

function windowCalls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const mock = (globalThis as unknown as { __paraleetMock?: { windowCalls(): string[] } }).__paraleetMock;
    return mock?.windowCalls() ?? [];
  });
}

async function sizeCalls(page: Page): Promise<{ width: number; height: number }[]> {
  return (await windowCalls(page))
    .filter((call) => call.startsWith('setCardSize:'))
    .map((call) => {
      const [width = 0, height = 0] = call.slice('setCardSize:'.length).split('x').map(Number);
      return { width, height };
    });
}

/** Opens the card at the size a real card window starts with and waits for its first size report. */
async function openCard(page: Page, scenario = 'default'): Promise<void> {
  await page.setViewportSize({ width: 320, height: 400 });
  // A hash-only navigation to the same address would not reload the page.
  await page.goto('about:blank');
  await page.goto(`/?scenario=${scenario}#/card`);
  await page.getByTestId('card').waitFor();
  await expect.poll(async () => (await sizeCalls(page)).length).toBeGreaterThan(0);
}

/** Makes the viewport the size the card last asked its window to be, as the real window would be. */
async function fit(page: Page): Promise<{ width: number; height: number }> {
  await expect.poll(async () => (await sizeCalls(page)).length).toBeGreaterThan(0);
  // Let a pending layout settle before reading the last report.
  await page.waitForTimeout(100);
  const size = (await sizeCalls(page)).at(-1)!;
  await page.setViewportSize(size);
  return size;
}

async function noHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const root = (globalThis as unknown as { document: { documentElement: { scrollWidth: number; clientWidth: number } } })
      .document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(0);
}

function setBackdrop(page: Page, color: string): Promise<void> {
  return page.evaluate((value) => {
    const view = globalThis as unknown as { document: { documentElement: { style: { background: string } } } };
    view.document.documentElement.style.background = value;
  }, color);
}

async function capture(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  await fit(page);
  for (const [label, color] of [
    ['dark', '#20242B'],
    ['light', '#E9E4DA'],
  ] as const) {
    await setBackdrop(page, color);
    await page.screenshot({ path: resolve(SHOTS, `${name}-${label}.png`), animations: 'disabled' });
  }
  await setBackdrop(page, '');
}

/** The form shows a saved key insight once, after the report, behind a "Done" button. */
async function passInsight(page: Page): Promise<void> {
  const done = page.getByRole('button', { name: 'Done' });
  await done.waitFor();
  await done.click();
}

function card(page: Page) {
  return page.getByTestId('card');
}

test('not fed, with a problem: the label, the title, the platform, the difficulty and two buttons', async ({ page }) => {
  await openCard(page);
  await expect(page.getByTestId('card-mood')).toHaveText('Para is peckish');
  await expect(page.getByTestId('card-head')).toBeVisible();
  await expect(page.getByTestId('card-streak')).toContainText('day streak');
  await expect(card(page)).toContainText(/today's problem/i);
  await expect(page.getByTestId('card-title')).toHaveText('121. Best Time to Buy and Sell Stock');
  await expect(card(page)).toContainText('LeetCode');
  await expect(card(page)).toContainText('Easy');
  const open = await page.getByRole('button', { name: 'Open problem' }).boundingBox();
  const solved = await page.getByRole('button', { name: 'I solved it' }).boundingBox();
  expect(open!.y).toBe(solved!.y);
  expect(Math.abs(open!.width - solved!.width)).toBeLessThan(1);
  expect(solved!.x - (open!.x + open!.width)).toBeCloseTo(8, 0);
  await expect(page.getByRole('button', { name: 'Open ParaLeet' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Swap' })).toBeVisible();
  await noHorizontalScroll(page);
  await capture(page, 'card-unfed');
});

test('"Open problem" opens the problem and leaves the card open', async ({ page }) => {
  await openCard(page);
  await page.getByRole('button', { name: 'Open problem' }).click();
  expect(await mockOpenedUrls(page)).toEqual(['https://leetcode.com/problems/best-time-to-buy-and-sell-stock/']);
  expect(await windowCalls(page)).not.toContain('hideCard');
  await expect(card(page)).toBeVisible();
});

test('fed: a green check, "Fed for today" and one button', async ({ page }) => {
  await openCard(page, 'fed');
  await expect(page.getByTestId('card-fed')).toHaveText('Fed for today');
  await expect(page.getByTestId('card-mood')).toHaveText(/^Para is /);
  await expect(card(page)).not.toContainText(/today's problem/i);
  await expect(page.getByRole('button', { name: 'Open problem' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'I solved it' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Swap' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Log another problem' })).toBeVisible();
  await noHorizontalScroll(page);
  await capture(page, 'card-fed');
  await page.getByRole('button', { name: 'Log another problem' }).click();
  expect((await windowCalls(page)).slice(-2)).toEqual(['showMainWindow:today', 'hideCard']);
});

test('nothing assigned: a plain line and "Log a problem"', async ({ page }) => {
  await openCard(page, 'nothing');
  await expect(page.getByTestId('card-nothing')).toHaveText('Nothing is assigned today. Any problem you log feeds Para.');
  await expect(page.getByRole('button', { name: 'Open problem' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Swap' })).toHaveCount(0);
  await noHorizontalScroll(page);
  await capture(page, 'card-nothing');
  await page.getByRole('button', { name: 'Log a problem' }).click();
  expect((await windowCalls(page)).slice(-2)).toEqual(['showMainWindow:today', 'hideCard']);
});

test('"I solved it" turns the card into the report form, 360 wide, with a way back', async ({ page }) => {
  await openCard(page);
  expect((await sizeCalls(page)).at(-1)?.width).toBe(320);
  await page.getByRole('button', { name: 'I solved it' }).click();
  await expect(page.getByRole('radiogroup', { name: 'Rating' })).toBeVisible();
  await expect(page.getByTestId('card-report-title')).toHaveText('121. Best Time to Buy and Sell Stock');
  await expect.poll(async () => (await sizeCalls(page)).at(-1)?.width).toBe(360);
  const wide = await fit(page);
  expect(wide.width).toBe(360);
  expect((await card(page).boundingBox())!.width).toBe(360);
  await noHorizontalScroll(page);
  await capture(page, 'card-report');
  await page.getByRole('radio', { name: /^Good/ }).click();
  await expect(page.getByTestId('report-hint')).toContainText('Next review');
  await capture(page, 'card-report-rated');

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('button', { name: 'I solved it' })).toBeVisible();
  await expect.poll(async () => (await sizeCalls(page)).at(-1)?.width).toBe(320);
  expect(await windowCalls(page)).not.toContain('hideCard');

  // Cancel in the form does the same as Back.
  await page.getByRole('button', { name: 'I solved it' }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: 'I solved it' })).toBeVisible();
  await expect.poll(async () => (await sizeCalls(page)).at(-1)?.width).toBe(320);
});

test('number keys and Enter feed Para without clicking into the form', async ({ page }) => {
  await openCard(page);
  await page.getByRole('button', { name: 'I solved it' }).click();
  await expect(page.getByRole('radiogroup', { name: 'Rating' })).toBeVisible();
  await page.keyboard.press('3');
  await expect(page.getByRole('radio', { name: /^Good/ })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Done' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('card-confirmation')).toContainText(/^Para ate! \d+-day streak$/);
});

test('after a report the card confirms for about 1.5 seconds and closes by itself', async ({ page }) => {
  await openCard(page);
  await page.getByRole('button', { name: 'I solved it' }).click();
  await page.getByRole('radio', { name: /^Good/ }).click();
  const started = Date.now();
  await page.getByRole('button', { name: 'Feed Para' }).click();
  await passInsight(page);
  await expect(page.getByTestId('card-confirmation')).toContainText(/^Para ate! 5-day streak$/);
  await expect(page.getByTestId('card-head')).toBeVisible();
  await capture(page, 'card-confirmation');
  // The screenshots took time; judge the timer on a fresh run below.
  await expect.poll(async () => (await windowCalls(page)).includes('hideCard')).toBe(true);
  expect(Date.now() - started).toBeGreaterThan(1000);

  await openCard(page);
  await page.getByRole('button', { name: 'I solved it' }).click();
  await page.getByRole('radio', { name: /^Good/ }).click();
  await page.getByRole('button', { name: 'Feed Para' }).click();
  await passInsight(page);
  await expect(page.getByTestId('card-confirmation')).toBeVisible();
  const shownAt = Date.now();
  await page.waitForTimeout(900);
  expect(await windowCalls(page)).not.toContain('hideCard');
  await expect.poll(async () => (await windowCalls(page)).includes('hideCard'), { timeout: 2500 }).toBe(true);
  const elapsed = Date.now() - shownAt;
  expect(elapsed).toBeGreaterThanOrEqual(1400);
  expect(elapsed).toBeLessThan(2600);
});

test('rating Again says Para had a nibble', async ({ page }) => {
  await openCard(page);
  await page.getByRole('button', { name: 'I solved it' }).click();
  await page.getByRole('radio', { name: /^Again/ }).click();
  await page.getByRole('button', { name: 'Feed Para' }).click();
  await passInsight(page);
  await expect(page.getByTestId('card-confirmation')).toContainText(/^Para had a nibble\. \d+-day streak$/);
});

test('a report that unlocks something keeps the confirmation up for 3 seconds and says so', async ({ page }) => {
  await openCard(page, 'milestone');
  await page.getByRole('button', { name: 'I solved it' }).click();
  await page.getByRole('radio', { name: /^Good/ }).click();
  const begin = Date.now();
  await page.getByRole('button', { name: 'Feed Para' }).click();
  const confirmation = page.getByTestId('card-confirmation');
  await expect(confirmation).toContainText('Para ate! 7-day streak');
  await expect(confirmation).toContainText(/New for Para: .+ Put it on in Settings\./);
  const wide = await fit(page);
  expect(wide.width).toBe(360);
  await noHorizontalScroll(page);
  await page.waitForTimeout(1900);
  expect(await windowCalls(page)).not.toContain('hideCard');
  await capture(page, 'card-confirmation-unlock');
  await expect.poll(async () => (await windowCalls(page)).includes('hideCard'), { timeout: 4000 }).toBe(true);
  expect(Date.now() - begin).toBeGreaterThanOrEqual(2900);
});

test('the footer opens the main window and closes the card', async ({ page }) => {
  await openCard(page);
  await page.getByRole('button', { name: 'Open ParaLeet' }).click();
  expect((await windowCalls(page)).slice(-2)).toEqual(['showMainWindow:', 'hideCard']);

  await openCard(page);
  await page.getByRole('button', { name: 'Swap' }).click();
  expect((await windowCalls(page)).slice(-2)).toEqual(['showMainWindow:today', 'hideCard']);
});

test('Escape closes the card from the first view and from the report view', async ({ page }) => {
  await openCard(page);
  await page.keyboard.press('Escape');
  expect(await windowCalls(page)).toContain('hideCard');

  await openCard(page);
  await page.getByRole('button', { name: 'I solved it' }).click();
  await expect(page.getByRole('radiogroup', { name: 'Rating' })).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await windowCalls(page)).toContain('hideCard');
  // It closes; it does not go back.
  await expect(page.getByRole('radiogroup', { name: 'Rating' })).toBeVisible();
});

test('the size is reported only after the content is laid out, and equals the panel', async ({ page }) => {
  await openCard(page);
  const first = (await sizeCalls(page))[0]!;
  expect(first.width).toBe(320);
  const box = await card(page).boundingBox();
  expect(first.height).toBe(Math.ceil(box!.height));
  expect(first.height).toBeGreaterThanOrEqual(120);
  // Once per actual change: no two identical reports in a row.
  const sizes = (await windowCalls(page)).filter((call) => call.startsWith('setCardSize:'));
  sizes.forEach((call, index) => expect(call).not.toBe(sizes[index - 1]));
  // No scroll bar for ordinary content.
  expect(await card(page).evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true);
});

test('a very long title clamps to two lines and the card stays 320 wide', async ({ page }) => {
  await openCard(page);
  await page.evaluate(async () => {
    const api = (
      globalThis as unknown as {
        paraleet: {
          addProblem(input: object): Promise<{ problem: { id: number } }>;
          swapToday(input: object): Promise<unknown>;
        };
      }
    ).paraleet;
    const added = await api.addProblem({
      url: 'https://codeforces.com/problemset/problem/1234/F',
      title:
        'An Extraordinarily Long Problem Title About Reversing Substrings Within Nested Palindromic Subsequences ' +
        'And Then Counting Every Possible Arrangement Modulo A Large Prime Number Supercalifragilisticexpialidocious',
      difficultyRaw: null,
      topics: [],
    });
    await api.swapToday({ problemId: added.problem.id });
  });
  await expect(page.getByTestId('card-title')).toContainText('An Extraordinarily Long');
  const title = await page.getByTestId('card-title').boundingBox();
  // Two lines of 22 points at most.
  expect(title!.height).toBeLessThanOrEqual(44);
  expect((await card(page).boundingBox())!.width).toBe(320);
  const last = (await sizeCalls(page)).at(-1)!;
  expect(last.width).toBe(320);
  await capture(page, 'card-long-title');
  await noHorizontalScroll(page);
});

test('a report made elsewhere while the card is open switches it to the fed state', async ({ page }) => {
  await openCard(page);
  await expect(page.getByRole('button', { name: 'I solved it' })).toBeVisible();
  await page.evaluate(async () => {
    const api = (
      globalThis as unknown as {
        paraleet: {
          getToday(): Promise<{ assignment: { problem: { id: number } } }>;
          submitReport(input: object): Promise<unknown>;
        };
      }
    ).paraleet;
    const today = await api.getToday();
    await api.submitReport({
      problemId: today.assignment.problem.id,
      rating: 'good',
      minutes: null,
      keyInsight: null,
      notes: null,
      insightRevealed: false,
    });
  });
  await expect(page.getByTestId('card-fed')).toHaveText('Fed for today');
  await expect(page.getByRole('button', { name: 'I solved it' })).toHaveCount(0);
});

test('every state fits without a horizontal scroll bar', async ({ page }) => {
  for (const scenario of ['default', 'fed', 'nothing', 'fresh', 'missed']) {
    await openCard(page, scenario);
    await fit(page);
    await noHorizontalScroll(page);
    expect(await card(page).evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
});
