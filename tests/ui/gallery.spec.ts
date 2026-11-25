import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { GROWTH_STAGES, MOODS } from '../../src/core/types';
import { captureBothSizes, openScreen } from './screenshots';

const DIR = resolve(import.meta.dirname, '../../artifacts/screenshots');
const GOLD = [0xff, 0xd2, 0x3f];
/** The browser's canvas, described by hand because the test project has no DOM types. */
interface CanvasLike {
  width: number;
  height: number;
  toDataURL(): string;
  getContext(kind: '2d'): { getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray } } | null;
}
const RED = [0xef, 0x47, 0x43];
const GREEN = [0x2c, 0xbb, 0x5d];

/** How many pixels of one color a sprite canvas holds right now. */
function countColor(canvas: Locator, rgb: number[]): Promise<number> {
  return canvas.evaluate((el, color) => {
    const c = el as unknown as CanvasLike;
    const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] === color[0] && data[i + 1] === color[1] && data[i + 2] === color[2] && data[i + 3] === 255) n++;
    }
    return n;
  }, rgb);
}

async function shot(target: Locator | Page, name: string, fullPage = false): Promise<void> {
  mkdirSync(DIR, { recursive: true });
  const path = resolve(DIR, `${name}.png`);
  if ('goto' in target) await target.screenshot({ path, fullPage });
  else await target.screenshot({ path });
}

test.describe('the sprite gallery', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 1000 });
    await openScreen(page, 'gallery');
  });

  test('is routable but not in the sidebar', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Sprite gallery' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' }).getByText('Sprite gallery')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('button')).toHaveCount(5);
  });

  test('draws a canvas for every stage and mood', async ({ page }) => {
    for (const stage of GROWTH_STAGES) {
      for (const mood of MOODS) {
        await expect(page.getByTestId(`cell-${stage}-${mood}`)).toBeVisible();
      }
    }
    await expect(page.getByTestId('gallery-grid').locator('canvas')).toHaveCount(GROWTH_STAGES.length * MOODS.length);
    await expect(page.getByTestId('gallery-seeds').locator('canvas')).toHaveCount(4);
  });

  test('animates: a canvas changes over time', async ({ page }) => {
    const cell = page.getByTestId('cell-adult-hungry');
    const snapshot = (): Promise<string> => cell.evaluate((el) => (el as unknown as CanvasLike).toDataURL());
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      seen.add(await snapshot());
      await page.waitForTimeout(90);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  test('toggling an accessory redraws the birds', async ({ page }) => {
    const cell = page.getByTestId('cell-adult-content');
    await expect.poll(() => countColor(cell, GOLD)).toBe(0);
    await page.getByTestId('accessory-crown').click();
    await expect(page.getByTestId('accessory-crown')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => countColor(cell, GOLD)).toBeGreaterThan(0);
    await page.getByTestId('accessory-crown').click();
    await expect.poll(() => countColor(cell, GOLD)).toBe(0);
  });

  test('changing the seed redraws the birds, from a chip or the field', async ({ page }) => {
    const cell = page.getByTestId('cell-adult-content');
    // Seed 2 has a red cheek and seed 9 a green one.
    await page.getByTestId('seed-chip-2').click();
    await expect.poll(() => countColor(cell, RED)).toBeGreaterThan(0);
    await page.getByTestId('seed-chip-9').click();
    await expect.poll(() => countColor(cell, GREEN)).toBeGreaterThan(0);
    await expect.poll(() => countColor(cell, RED)).toBe(0);
    await page.getByRole('textbox', { name: 'Type any seed' }).fill('2');
    await expect(page.getByTestId('gallery')).toHaveAttribute('data-seed', '2');
    await expect.poll(() => countColor(cell, RED)).toBeGreaterThan(0);
  });

  test('labels the traits of the four sample seeds', async ({ page }) => {
    await expect(page.getByTestId('traits-2')).toContainText('dot red cheek');
    await expect(page.getByTestId('traits-9')).toContainText('double green cheek');
  });

  test('replays the hatching animation', async ({ page }) => {
    await expect(page.getByTestId('hatching-step')).toHaveText('Frame 6 of 6', { timeout: 5000 });
    await page.getByTestId('hatching-replay').click();
    await expect(page.getByTestId('hatching-step')).toHaveText('Frame 1 of 6');
    await expect(page.getByTestId('hatching-step')).toHaveText('Frame 6 of 6', { timeout: 5000 });
  });

  test('shows the menu bar heads at three sizes for every stage', async ({ page }) => {
    // 4 stages x 3 sizes x 2 strips.
    await expect(page.getByTestId('gallery-menubar').getByRole('img')).toHaveCount(24);
    await expect(page.getByRole('img', { name: 'adult head at 18 pixels' })).toHaveCount(2);
  });

  test('hides the filmstrips until asked', async ({ page }) => {
    await expect(page.getByTestId('filmstrips')).toHaveCount(0);
    await page.getByTestId('filmstrip-toggle').click();
    await expect(page.getByTestId('filmstrips')).toBeVisible();
    for (const stage of GROWTH_STAGES) await expect(page.getByTestId(`filmstrip-${stage}`)).toBeVisible();
  });

  test('captures the screenshots used to judge the art', async ({ page }) => {
    await page.waitForTimeout(300);
    await shot(page.getByTestId('gallery-actual'), 'gallery-actual-size');
    await shot(page.getByTestId('gallery-seeds'), 'gallery-seeds');
    await shot(page.getByTestId('gallery-menubar'), 'gallery-menubar-heads');
    // One image per stage: its row of moods.
    for (const stage of GROWTH_STAGES) await shot(page.getByTestId(`row-${stage}`), `gallery-${stage}`);

    await page.getByTestId('filmstrip-toggle').click();
    for (const stage of GROWTH_STAGES) await shot(page.getByTestId(`filmstrip-${stage}`), `gallery-filmstrip-${stage}`);

    // With accessories on, for the same judging.
    for (const id of ['scarf', 'bow_tie', 'grad_cap']) await page.getByTestId(`accessory-${id}`).click();
    await shot(page.getByTestId('gallery-seeds'), 'gallery-seeds-accessories');
    await shot(page.getByTestId('gallery-actual'), 'gallery-actual-size-accessories');
    for (const id of ['scarf', 'bow_tie', 'grad_cap']) await page.getByTestId(`accessory-${id}`).click();

    await shot(page, 'gallery-full', true);
    await captureBothSizes(page, 'gallery');
  });
});
