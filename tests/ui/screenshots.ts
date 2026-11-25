// Screenshot helper for UI work (PRD section 13, "UI work" step 4). Every screen is captured at
// the main window's default and minimum sizes into artifacts/screenshots/, which is not checked in.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';

export const WINDOW_DEFAULT = { width: 1100, height: 720 };
export const WINDOW_MIN = { width: 860, height: 580 };

const DIR = resolve(import.meta.dirname, '../../artifacts/screenshots');

/** Saves `<name>-default.png` and `<name>-min.png`, and leaves the page at the default size. */
export async function captureBothSizes(page: Page, name: string): Promise<void> {
  mkdirSync(DIR, { recursive: true });
  for (const [label, size] of [
    ['min', WINDOW_MIN],
    ['default', WINDOW_DEFAULT],
  ] as const) {
    await page.setViewportSize(size);
    await page.screenshot({ path: resolve(DIR, `${name}-${label}.png`), animations: 'disabled' });
  }
}

/** Opens a screen in the browser against the mock bridge. Scenarios are in src/ui/mock/mockBridge.ts. */
export async function openScreen(page: Page, screen: string, scenario = 'default'): Promise<void> {
  await page.goto(`/?scenario=${scenario}#/${screen}`);
  await page.getByTestId(`screen-${screen}`).waitFor();
}

/** Links the mock bridge was asked to open in the browser. */
export function mockOpenedUrls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const mock = (globalThis as unknown as { __paraleetMock?: { openedUrls(): string[] } }).__paraleetMock;
    return mock?.openedUrls() ?? [];
  });
}
