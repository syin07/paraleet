import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// The floating pet window's page, against the mock bridge. The native side (always on top,
// click-through, remembered position) is covered by tests/e2e/pet.spec.ts.

const PET_WINDOW = { width: 240, height: 250 };
const SHOTS = resolve(import.meta.dirname, '../../artifacts/screenshots');

async function openPet(page: Page, scenario = 'default'): Promise<void> {
  await page.setViewportSize(PET_WINDOW);
  await page.goto(`/?scenario=${scenario}#/pet`);
  await page.getByTestId('pet-bird').waitFor();
}

function windowCalls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const mock = (globalThis as unknown as { __paraleetMock?: { windowCalls(): string[] } }).__paraleetMock;
    return mock?.windowCalls() ?? [];
  });
}

function setBackdrop(page: Page, color: string): Promise<void> {
  return page.evaluate((value) => {
    const view = globalThis as unknown as { document: { documentElement: { style: { background: string } } } };
    view.document.documentElement.style.background = value;
  }, color);
}

async function capture(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  // The page is transparent; a desktop-like backdrop shows how the bird and bubble read on it.
  for (const [label, color] of [
    ['dark', '#20242B'],
    ['light', '#E9E4DA'],
  ] as const) {
    await setBackdrop(page, color);
    await page.screenshot({ path: resolve(SHOTS, `${name}-${label}.png`), animations: 'disabled' });
  }
  await setBackdrop(page, '');
}

test('shows only the bird on a transparent page', async ({ page }) => {
  await openPet(page);
  await expect(page.getByTestId('pet-bird')).toBeVisible();
  // None of the main window's shell: no sidebar, no headings.
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await expect(page.getByRole('heading')).toHaveCount(0);
  const background = await page.evaluate(() => {
    const view = globalThis as unknown as {
      document: { body: unknown };
      getComputedStyle(element: unknown): { backgroundColor: string };
    };
    return view.getComputedStyle(view.document.body).backgroundColor;
  });
  expect(background).toBe('rgba(0, 0, 0, 0)');
  // The bird sits where the main process expects it (PET_BIRD_BOX): 128 points, centred, 8 from the bottom.
  expect(await page.getByTestId('pet-bird').boundingBox()).toEqual({ x: 56, y: 114, width: 128, height: 128 });
  await capture(page, 'pet-window-idle');
});

test('hovering shows a speech bubble: the problem when not fed, the streak when fed', async ({ page }) => {
  await openPet(page);
  await expect(page.getByTestId('pet-bubble')).toHaveCount(0);
  await page.getByTestId('pet-bird').hover();
  await expect(page.getByTestId('pet-bubble')).toHaveText('121. Best Time to Buy and Sell Stock on LeetCode?');
  await capture(page, 'pet-window-unfed');
  await page.mouse.move(2, 2);
  await expect(page.getByTestId('pet-bubble')).toHaveCount(0);

  await openPet(page, 'fed');
  await page.getByTestId('pet-bird').hover();
  await expect(page.getByTestId('pet-bubble')).toHaveText(/^\d+-day streak!$/);
  await capture(page, 'pet-window-fed');

  await openPet(page, 'nothing');
  await page.getByTestId('pet-bird').hover();
  await expect(page.getByTestId('pet-bubble')).toHaveText('Log any problem and I get fed!');
});

test('a long problem title wraps inside the window', async ({ page }) => {
  await openPet(page, 'many');
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
      title: 'Yet Another Extraordinarily Long Substring Reverse Problem Title',
      difficultyRaw: null,
      topics: [],
    });
    await api.swapToday({ problemId: added.problem.id });
  });
  await page.getByTestId('pet-bird').hover();
  const bubble = page.getByTestId('pet-bubble');
  await expect(bubble).toContainText('Yet Another Extraordinarily Long');
  const box = await bubble.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(PET_WINDOW.width);
  await capture(page, 'pet-window-long-title');
});

test('a click opens the main window', async ({ page }) => {
  await openPet(page);
  await page.getByTestId('pet-bird').click();
  const calls = await windowCalls(page);
  expect(calls).toContain('showMainWindow:');
  expect(calls.filter((call) => call.startsWith('movePetWindowBy:'))).toEqual([]);
  expect(calls).not.toContain('endPetDrag');
});

test('a drag moves the pet and does not open the main window', async ({ page }) => {
  await openPet(page);
  await page.mouse.move(120, 180);
  await page.mouse.down();
  await page.mouse.move(150, 200, { steps: 5 });
  await page.mouse.up();
  const calls = await windowCalls(page);
  const moves = calls.filter((call) => call.startsWith('movePetWindowBy:'));
  expect(moves.length).toBeGreaterThan(0);
  // The steps add up to the whole movement of the pointer.
  const total = moves
    .map((call) => call.slice('movePetWindowBy:'.length).split(',').map(Number))
    .reduce((sum, [dx = 0, dy = 0]) => ({ x: sum.x + dx, y: sum.y + dy }), { x: 0, y: 0 });
  expect(total).toEqual({ x: 30, y: 20 });
  expect(calls.at(-1)).toBe('endPetDrag');
  expect(calls).not.toContain('showMainWindow:');
});

test('a tiny wobble of the pointer still counts as a click', async ({ page }) => {
  await openPet(page);
  await page.mouse.move(120, 180);
  await page.mouse.down();
  await page.mouse.move(122, 181);
  await page.mouse.up();
  const calls = await windowCalls(page);
  expect(calls.filter((call) => call.startsWith('movePetWindowBy:'))).toEqual([]);
  expect(calls).toContain('showMainWindow:');
  expect(calls).not.toContain('endPetDrag');
});

test('right-click asks for the menu and never opens the main window', async ({ page }) => {
  await openPet(page);
  await page.getByTestId('pet-bird').click({ button: 'right' });
  const calls = await windowCalls(page);
  expect(calls).toContain('showPetMenu');
  expect(calls).not.toContain('showMainWindow:');
});

test('the window only takes clicks while the pointer is over the bird', async ({ page }) => {
  await openPet(page);
  await page.mouse.move(4, 4);
  await page.getByTestId('pet-bird').hover();
  await expect.poll(async () => (await windowCalls(page)).at(-1)).toBe('setPetInteractive:true');
  // The bubble only informs: moving up onto it lets clicks through again and it goes away.
  const bubble = await page.getByTestId('pet-bubble').boundingBox();
  expect(bubble).not.toBeNull();
  await page.mouse.move(bubble!.x + bubble!.width / 2, bubble!.y + bubble!.height / 2);
  await expect.poll(async () => (await windowCalls(page)).at(-1)).toBe('setPetInteractive:false');
  await expect(page.getByTestId('pet-bubble')).toHaveCount(0);
  await page.getByTestId('pet-bird').hover();
  await expect.poll(async () => (await windowCalls(page)).at(-1)).toBe('setPetInteractive:true');
  await page.mouse.move(4, 4);
  await expect.poll(async () => (await windowCalls(page)).at(-1)).toBe('setPetInteractive:false');
  const interactive = (await windowCalls(page)).filter((call) => call.startsWith('setPetInteractive:'));
  // One message per change, not one per pointer movement.
  expect(interactive).toEqual([
    'setPetInteractive:true',
    'setPetInteractive:false',
    'setPetInteractive:true',
    'setPetInteractive:false',
  ]);
});

test('a drag whose release never arrives stops following the pointer', async ({ page }) => {
  await openPet(page);
  await page.mouse.move(120, 180);
  await page.mouse.down();
  await page.mouse.move(140, 190, { steps: 4 });
  // The button is let go where the page cannot see it (a native menu took the release).
  await page.getByTestId('pet-bird').dispatchEvent('pointermove', {
    buttons: 0,
    screenX: 400,
    screenY: 400,
    pointerId: 1,
    bubbles: true,
  });
  const afterLoss = await windowCalls(page);
  expect(afterLoss.at(-1)).toBe('endPetDrag');
  const movesBefore = afterLoss.filter((call) => call.startsWith('movePetWindowBy:')).length;
  await page.getByTestId('pet-bird').dispatchEvent('pointermove', {
    buttons: 0,
    screenX: 500,
    screenY: 500,
    pointerId: 1,
    bubbles: true,
  });
  const later = await windowCalls(page);
  expect(later.filter((call) => call.startsWith('movePetWindowBy:')).length).toBe(movesBefore);
  expect(later.filter((call) => call === 'endPetDrag').length).toBe(1);
  expect(later).not.toContain('showMainWindow:');
});

test('the bubble follows the day without a reload', async ({ page }) => {
  await openPet(page);
  await page.evaluate(async () => {
    const api = (
      globalThis as unknown as {
        paraleet: {
          getToday(): Promise<{ assignment: { problem: { id: number } } | null }>;
          submitReport(input: object): Promise<unknown>;
        };
      }
    ).paraleet;
    const today = await api.getToday();
    await api.submitReport({
      problemId: today.assignment!.problem.id,
      rating: 'good',
      minutes: null,
      keyInsight: null,
      notes: null,
      insightRevealed: false,
    });
  });
  await page.getByTestId('pet-bird').hover();
  await expect(page.getByTestId('pet-bubble')).toHaveText(/^\d+-day streak!$/);
});
