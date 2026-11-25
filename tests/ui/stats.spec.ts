import { expect, test, type Locator, type Page } from '@playwright/test';
import type { ParaLeetApi } from '../../src/bridge/contract';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { captureBothSizes, openScreen, WINDOW_DEFAULT, WINDOW_MIN } from './screenshots';

type Host = { paraleet: ParaLeetApi };

// Browser globals used inside page.evaluate callbacks; the test tsconfig has no DOM library.
declare const getComputedStyle: (element: unknown) => { backgroundColor: string; borderTopStyle: string; opacity: string };
declare const document: { documentElement: { scrollWidth: number; clientWidth: number } };

/** Captures the scrolled-down screen as `<name>-lower-default.png` and `-min.png`, to check the cards below the fold. */
async function captureLower(page: Page, name: string): Promise<void> {
  const dir = resolve(import.meta.dirname, '../../artifacts/screenshots');
  mkdirSync(dir, { recursive: true });
  for (const [label, size] of [
    ['min', WINDOW_MIN],
    ['default', WINDOW_DEFAULT],
  ] as const) {
    await page.setViewportSize(size);
    await page.getByTestId('screen-stats').evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await page.screenshot({ path: resolve(dir, `${name}-lower-${label}.png`), animations: 'disabled' });
  }
}

/** Hovers `target` at both window sizes, checks the tooltip text and saves `<name>-default.png` and `-min.png`. */
async function captureHovered(page: Page, name: string, target: Locator, label: string): Promise<void> {
  for (const [suffix, size] of [
    ['min', WINDOW_MIN],
    ['default', WINDOW_DEFAULT],
  ] as const) {
    await page.setViewportSize(size);
    await target.scrollIntoViewIfNeeded();
    await target.hover();
    await expect(page.getByRole('tooltip')).toHaveText(label);
    await page.screenshot({
      path: resolve(import.meta.dirname, `../../artifacts/screenshots/${name}-${suffix}.png`),
      animations: 'disabled',
    });
  }
}

/** True when the tooltip's box overlaps the box of the card title `heading`. */
async function tooltipCoversTitle(page: Page, card: Locator, heading: string): Promise<boolean> {
  const tip = await page.getByRole('tooltip').boundingBox();
  const title = await card.getByRole('heading', { name: heading }).boundingBox();
  if (!tip || !title) throw new Error('tooltip or title not found');
  return tip.x < title.x + title.width && tip.x + tip.width > title.x && tip.y < title.y + title.height && tip.y + tip.height > title.y;
}

const heatmap = (page: Page) => page.getByTestId('stats-heatmap');
const range = (page: Page, name: string) => page.getByRole('radio', { name, exact: true });
const tile = (page: Page, name: string) => page.getByRole('group', { name, exact: true });

/** Cells of the heatmap that carry a date label. */
const cells = (page: Page) => heatmap(page).getByRole('img');

test.describe('Stats screen', () => {
  test('four tiles show the streaks and totals', async ({ page }) => {
    await openScreen(page, 'stats', 'stats-year');
    const data = await page.evaluate(() => (globalThis as unknown as Host).paraleet.getStats({ range: '6m' }));
    expect(data.totals.solves).toBeGreaterThan(0);
    await expect(tile(page, 'Current streak')).toContainText(String(data.streak.current));
    await expect(tile(page, 'Longest streak')).toContainText(String(data.streak.longest));
    await expect(tile(page, 'Total solves')).toContainText(String(data.totals.solves));
    await expect(tile(page, 'Reviews done')).toContainText(String(data.totals.reviews));
    expect(data.streak.current).toBeGreaterThan(0);
  });

  test('the heatmap has Monday at the top, labels, a legend and a tooltip in plain words', async ({ page }) => {
    await openScreen(page, 'stats', 'stats-year');
    // Six months: 26 week columns, 7 rows. Today (Wed Nov 25) is in the last column, third row.
    const grid = heatmap(page);
    await expect(grid.getByText('Mon', { exact: true })).toBeVisible();
    await expect(grid.getByText('Wed', { exact: true })).toBeVisible();
    await expect(grid.getByText('Fri', { exact: true })).toBeVisible();
    await expect(page.getByTestId('stats-heatmap-card').getByText('Less')).toBeVisible();
    await expect(page.getByTestId('stats-heatmap-card').getByText('More')).toBeVisible();
    // Month labels exist above the grid.
    await expect(grid.getByText('Nov', { exact: true }).first()).toBeVisible();

    // Monday of the current week is above today (Wednesday) and above Tuesday.
    const monday = grid.getByRole('img', { name: /^Nov 23/ });
    const wednesday = grid.getByRole('img', { name: /^Nov 25/ });
    const mondayBox = await monday.boundingBox();
    const wednesdayBox = await wednesday.boundingBox();
    expect(mondayBox && wednesdayBox && mondayBox.y < wednesdayBox.y).toBe(true);
    expect(mondayBox && wednesdayBox && Math.abs(mondayBox.x - wednesdayBox.x) < 1).toBe(true);

    // The 12-day run through yesterday: a day with problems says how many.
    const withProblems = grid.getByRole('img', { name: /problems?$/ }).first();
    await withProblems.hover();
    const text = (await withProblems.getAttribute('aria-label')) ?? '';
    expect(text).toMatch(/^[A-Z][a-z]{2} \d{1,2} · \d+ problems?$/);
    await expect(page.getByRole('tooltip')).toHaveText(text);
    await captureHovered(page, 'stats-tooltip-day', withProblems, text);
  });

  test('a day with nothing shows only its date, and days after today are blank', async ({ page }) => {
    await openScreen(page, 'stats', 'stats-year');
    const grid = heatmap(page);
    // The mock has a two-week break: find a labelled day with no count.
    const labels = await cells(page).evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label') ?? ''));
    const empty = labels.filter((label) => !label.includes('·'));
    expect(empty.length).toBeGreaterThan(0);
    for (const label of empty) expect(label).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
    const one = grid.getByRole('img', { name: empty[0] ?? '', exact: true }).first();
    await one.hover();
    await expect(page.getByRole('tooltip')).toHaveText(empty[0] ?? '');
    await expect(page.getByRole('tooltip')).not.toContainText('missed');
    await expect(page.getByRole('tooltip')).not.toContainText('·');
    // Nov 26 to Nov 29 come after today: no cell, no label.
    for (const day of ['Nov 26', 'Nov 27', 'Nov 28', 'Nov 29']) {
      await expect(grid.getByRole('img', { name: day })).toHaveCount(0);
    }
    await expect(grid.getByRole('img', { name: /^Nov 25/ })).toHaveCount(1);
  });

  test('heat levels map to the heat tokens, darker for more problems', async ({ page }) => {
    await openScreen(page, 'stats', 'stats-year');
    // The heat tokens of src/ui/styles.css, heat-0 to heat-4.
    const colors = ['#262626', '#5c3d0f', '#8f5a0e', '#c77a0f', '#ffa116'];
    // Compare each rendered cell's background with the token for its level.
    const rendered = await cells(page).evaluateAll((nodes) =>
      nodes.map((node) => ({
        label: node.getAttribute('aria-label') ?? '',
        color: getComputedStyle(node).backgroundColor,
      })),
    );
    const toRgb = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
    };
    const byCount = new Map<number, string>();
    for (const cell of rendered) {
      const match = /· (\d+) problem/.exec(cell.label);
      const count = match ? Number(match[1]) : 0;
      byCount.set(Math.min(count, 4), cell.color);
    }
    for (const [count, color] of byCount) expect(color).toBe(toRgb(colors[count] as string));
    expect(byCount.size).toBeGreaterThanOrEqual(3);
  });

  test('solves per week: a bar per week, the current one marked, tooltips, three gridlines', async ({ page }) => {
    await openScreen(page, 'stats', 'stats-year');
    const card = page.getByTestId('stats-weekly');
    const bars = card.getByRole('img');
    await expect(bars).toHaveCount(26);
    await expect(card.locator('[data-current="true"]')).toHaveCount(1);
    await expect(card.locator('[data-current="true"]')).toHaveAttribute('aria-label', /^Week of Nov 23 · /);
    // The current week's bar is the subtle fill with a dashed border.
    const style = await card.locator('[data-current="true"] > div').evaluate((node) => {
      const css = getComputedStyle(node);
      return { border: css.borderTopStyle, background: css.backgroundColor };
    });
    expect(style.border).toBe('dashed');
    expect(style.background).not.toBe('rgb(255, 161, 22)');
    // Three gridline values on the axis, the lowest being 0.
    const data = await page.evaluate(() => (globalThis as unknown as Host).paraleet.getStats({ range: '6m' }));
    const top = Math.max(2, Math.ceil(data.maxWeekSolves / 2) * 2);
    for (const value of [0, top / 2, top]) await expect(card.getByText(String(value), { exact: true })).toBeVisible();

    const busiest = data.weeks.find((week) => week.solves === data.maxWeekSolves);
    expect(busiest).toBeTruthy();
    const label = `Week of ${new Date(`${busiest?.start}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} · ${busiest?.solves} ${busiest?.solves === 1 ? 'solve' : 'solves'}`;
    const bar = card.getByRole('img', { name: label });
    await bar.hover();
    await expect(page.getByRole('tooltip')).toHaveText(label);
    await captureHovered(page, 'stats-tooltip-week', bar, label);
  });

  test('a week with exactly one solve says "1 solve"', async ({ page }) => {
    // Only the default scenario has such a week (stats-year and many have none in any range).
    await openScreen(page, 'stats');
    const data = await page.evaluate(() => (globalThis as unknown as Host).paraleet.getStats({ range: '6m' }));
    const week = data.weeks.find((candidate) => candidate.solves === 1);
    expect(week, 'the default scenario must have a week with exactly one solve').toBeDefined();
    const [year, month, day] = (week?.start ?? '').split('-').map(Number);
    const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
    const bar = page.getByTestId('stats-weekly').getByRole('img', { name: `Week of ${date} · 1 solve`, exact: true });
    await expect(bar).toHaveCount(1);
    await bar.hover();
    await expect(page.getByRole('tooltip')).toHaveText(`Week of ${date} · 1 solve`);
  });

  test('the tooltip never covers its card title, above the mark when there is room and below otherwise', async ({ page }) => {
    await openScreen(page, 'stats', 'stats-year');
    for (const size of [WINDOW_MIN, WINDOW_DEFAULT]) {
      await page.setViewportSize(size);
      // Top row of the heatmap (Mondays): no room above inside the grid, so it goes below.
      const heatCard = page.getByTestId('stats-heatmap-card');
      const monday = heatmap(page).locator('[data-mark$="-0"]').nth(3);
      await monday.scrollIntoViewIfNeeded();
      await monday.hover();
      await expect(page.getByRole('tooltip')).toBeVisible();
      expect(await tooltipCoversTitle(page, heatCard, 'Fed days')).toBe(false);
      const cellBox = await monday.boundingBox();
      const tipBox = await page.getByRole('tooltip').boundingBox();
      expect(cellBox && tipBox && tipBox.y >= cellBox.y + cellBox.height - 1).toBe(true);

      // A cell lower down has room: the tooltip sits above it.
      const lower = heatmap(page).locator('[data-mark$="-5"]').nth(3);
      await lower.hover();
      const lowerBox = await lower.boundingBox();
      const lowerTip = await page.getByRole('tooltip').boundingBox();
      expect(lowerBox && lowerTip && lowerTip.y + lowerTip.height <= lowerBox.y + 1).toBe(true);
      expect(await tooltipCoversTitle(page, heatCard, 'Fed days')).toBe(false);

      // The first bars: same rule for the weekly chart.
      const weekly = page.getByTestId('stats-weekly');
      const first = weekly.getByRole('img').first();
      await first.scrollIntoViewIfNeeded();
      await first.hover();
      await expect(page.getByRole('tooltip')).toBeVisible();
      expect(await tooltipCoversTitle(page, weekly, 'Solves per week')).toBe(false);
    }
  });

  test('the heatmap is one tab stop and the arrow keys move between days showing the tooltip', async ({ page }) => {
    await openScreen(page, 'stats', 'stats-year');
    const grid = heatmap(page);
    await grid.focus();
    // Starts on today (Wed Nov 25).
    await expect(page.getByRole('tooltip')).toHaveText(/^Nov 25/);
    await page.keyboard.press('ArrowUp');
    await expect(page.getByRole('tooltip')).toHaveText(/^Nov 24/);
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('tooltip')).toHaveText(/^Nov 17/);
    // Days after today cannot be reached: Down from Tuesday reaches Wednesday and stops there.
    await page.keyboard.press('ArrowRight');
    for (let step = 0; step < 7; step += 1) await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('tooltip')).toHaveText(/^Nov 25/);
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tooltip')).toHaveText(/^Nov 25/);
    // One tab stop: the next Tab leaves the grid.
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('stats-heatmap-card').getByRole('tooltip')).toHaveCount(0);
    expect(await grid.locator('[tabindex]').count()).toBe(0);
  });

  test('the weekly bars are one tab stop and the arrow keys move between weeks', async ({ page }) => {
    await openScreen(page, 'stats', 'stats-year');
    const plot = page.getByTestId('stats-weekly').getByRole('group');
    await plot.focus();
    await expect(page.getByRole('tooltip')).toHaveText(/^Week of Nov 23 · /);
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('tooltip')).toHaveText(/^Week of Nov 16 · /);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tooltip')).toHaveText(/^Week of Nov 23 · /);
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('stats-weekly').getByRole('tooltip')).toHaveCount(0);
  });

  test('topic coverage lists the most solved first, zeros muted last, and folds after 8 rows', async ({ page }) => {
    await openScreen(page, 'stats', 'stats-year');
    const card = page.getByTestId('stats-topics');
    const data = await page.evaluate(() => (globalThis as unknown as Host).paraleet.getStats({ range: '6m' }));
    expect(data.topics.length).toBeGreaterThan(8);
    const rows = card.getByRole('listitem');
    await expect(rows).toHaveCount(8);
    const first = data.topics[0];
    await expect(rows.first()).toHaveAccessibleName(
      `${first?.label}, ${first?.solved} ${first?.solved === 1 ? 'problem' : 'problems'} solved`,
    );
    await expect(card.getByRole('button', { name: 'Show all' })).toBeVisible();
    await captureBothSizes(page, 'stats-topics-folded');

    await card.getByRole('button', { name: 'Show all' }).click();
    await expect(rows).toHaveCount(data.topics.length);
    // Zero-solve topics come after the others, and look muted.
    const counts = await card.getByRole('listitem').evaluateAll((nodes) =>
      nodes.map((node) => ({
        solved: Number(node.lastElementChild?.textContent),
        opacity: getComputedStyle(node).opacity,
      })),
    );
    const sorted = [...counts].sort((a, b) => b.solved - a.solved).map((entry) => entry.solved);
    expect(counts.map((entry) => entry.solved)).toEqual(sorted);
    const zeros = counts.filter((entry) => entry.solved === 0);
    expect(zeros.length).toBeGreaterThan(0);
    expect(zeros.every((entry) => Number(entry.opacity) < 1)).toBe(true);
    expect(counts.filter((entry) => entry.solved > 0).every((entry) => Number(entry.opacity) === 1)).toBe(true);
    await captureBothSizes(page, 'stats-topics-all');
    await captureLower(page, 'stats-topics-all');

    await card.getByRole('button', { name: 'Show fewer' }).click();
    await expect(rows).toHaveCount(8);
  });

  test('the range control defaults to 6 months and changing it redraws the grid', async ({ page }) => {
    await openScreen(page, 'stats', 'stats-year');
    await expect(range(page, '6 months')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('stats-weekly').getByRole('img')).toHaveCount(26);
    await captureBothSizes(page, 'stats-year-6m');
    await captureLower(page, 'stats-year-6m');

    await range(page, '12 weeks').click();
    await expect(page.getByTestId('stats-weekly').getByRole('img')).toHaveCount(12);
    await expect(range(page, '12 weeks')).toHaveAttribute('aria-checked', 'true');
    await captureBothSizes(page, 'stats-year-12w');
    await captureLower(page, 'stats-year-12w');

    await range(page, '1 year').click();
    await expect(page.getByTestId('stats-weekly').getByRole('img')).toHaveCount(53);
    await captureBothSizes(page, 'stats-year-1y');
    await captureLower(page, 'stats-year-1y');
  });

  test('the one-year heatmap fits the width at both sizes with no horizontal scrolling', async ({ page }) => {
    await openScreen(page, 'stats', 'stats-year');
    await range(page, '1 year').click();
    await expect(page.getByTestId('stats-weekly').getByRole('img')).toHaveCount(53);
    for (const size of [WINDOW_DEFAULT, WINDOW_MIN]) {
      await page.setViewportSize(size);
      const fit = await heatmap(page).evaluate((grid) => ({
        scroll: grid.scrollWidth,
        client: grid.clientWidth,
        cell: grid.querySelector('[role="img"]')?.getBoundingClientRect().width ?? 0,
        cellHeight: grid.querySelector('[role="img"]')?.getBoundingClientRect().height ?? 0,
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }));
      expect(fit.scroll).toBeLessThanOrEqual(fit.client);
      expect(fit.page).toBeLessThanOrEqual(0);
      expect(fit.cell).toBeGreaterThan(4);
      expect(fit.cell).toBeLessThanOrEqual(12.01);
      expect(Math.abs(fit.cell - fit.cellHeight)).toBeLessThan(0.6);
    }
  });

  test('a range change keeps the old numbers on screen while the new ones load', async ({ page }) => {
    await openScreen(page, 'stats', 'stats-year');
    await expect(page.getByTestId('stats-weekly').getByRole('img')).toHaveCount(26);
    await page.evaluate(() => {
      const host = globalThis as unknown as Host;
      const original = host.paraleet.getStats.bind(host.paraleet);
      host.paraleet.getStats = (input) => new Promise((resolve) => setTimeout(() => void original(input).then(resolve), 700));
    });
    await range(page, '12 weeks').click();
    // While waiting: the tiles and the old 26 bars are still there, and there is no loading text.
    await page.waitForTimeout(250);
    await expect(tile(page, 'Total solves')).toBeVisible();
    await expect(page.getByTestId('stats-weekly').getByRole('img')).toHaveCount(26);
    await expect(page.getByText('Loading…')).toHaveCount(0);
    await expect(page.getByTestId('stats-weekly').getByRole('img')).toHaveCount(12);
  });

  test('with nothing logged the screen is calm', async ({ page }) => {
    await openScreen(page, 'stats', 'fresh');
    for (const name of ['Current streak', 'Longest streak', 'Total solves', 'Reviews done']) {
      await expect(tile(page, name).getByText('0', { exact: true })).toBeVisible();
    }
    // The empty grid still draws: every day up to today is a cell, none is colored.
    const rendered = await cells(page).evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).backgroundColor));
    expect(rendered.length).toBeGreaterThan(100);
    expect(new Set(rendered).size).toBe(1);
    await expect(page.getByText('Your first solve shows up here')).toHaveCount(2);
    await expect(page.getByTestId('stats-weekly').getByText('Your first solve shows up here')).toBeVisible();
    await expect(page.getByTestId('stats-topics').getByText('Your first solve shows up here')).toBeVisible();
    await captureBothSizes(page, 'stats-empty');
    await captureLower(page, 'stats-empty');
  });

  test('nothing on the screen scolds', async ({ page }) => {
    await openScreen(page, 'stats', 'stats-year');
    await range(page, '1 year').click();
    await expect(page.getByTestId('stats-weekly').getByRole('img')).toHaveCount(53);
    await page.getByTestId('stats-topics').getByRole('button', { name: 'Show all' }).click();
    const text = (
      (await page.getByTestId('screen-stats').innerText()) +
      (await page
        .getByTestId('screen-stats')
        .evaluate((node) => [...node.querySelectorAll('[aria-label]')].map((element) => element.getAttribute('aria-label')).join(' ')))
    ).toLowerCase();
    for (const word of ['missed', 'overdue', 'behind', 'goal']) expect(text).not.toContain(word);
  });

  test('the default scenario looks finished', async ({ page }) => {
    await openScreen(page, 'stats');
    await expect(tile(page, 'Total solves')).toBeVisible();
    await captureBothSizes(page, 'stats-default');
    await captureLower(page, 'stats-default');
  });

  test('a failed load shows the message and Try again recovers', async ({ page }) => {
    await openScreen(page, 'stats', 'stats-fails');
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('The stats could not be read. Try again.');
    await expect(page.getByText('Loading…')).toHaveCount(0);
    await captureBothSizes(page, 'stats-load-failed');

    await page.evaluate(() => {
      const host = globalThis as unknown as Host;
      host.paraleet.getStats = async (input) => {
        const weeks = Array.from({ length: 12 }, (_, index) => ({
          start: `2026-08-${String(index + 10)}`,
          days: [],
          solves: 0,
          current: index === 11,
        }));
        return {
          range: input.range,
          today: '2026-11-25',
          streak: { current: 3, longest: 5 },
          totals: { solves: 7, reviews: 2, problemsSolved: 7, fedDays: 4 },
          weeks: weeks.map((week) => ({
            ...week,
            days: Array.from({ length: 7 }, (_, day) => ({
              day: `2026-11-${String(day + 1).padStart(2, '0')}`,
              count: 0,
              level: 0 as const,
              future: false,
            })),
          })),
          maxWeekSolves: 0,
          topics: [],
        };
      };
    });
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(tile(page, 'Total solves')).toContainText('7');
  });

  test('the first load shows a quiet loading state, not zeros', async ({ page }) => {
    await page.addInitScript(() => {
      // Delay the first answer so the loading state can be seen.
      const timer = setInterval(() => {
        const host = globalThis as unknown as Partial<Host>;
        const api = host.paraleet;
        if (!api) return;
        clearInterval(timer);
        const original = api.getStats.bind(api);
        api.getStats = (input) => new Promise((resolve) => setTimeout(() => void original(input).then(resolve), 800));
      }, 1);
    });
    await page.goto('/?scenario=stats-year#/stats');
    await expect(page.getByText('Loading…')).toBeVisible();
    await expect(page.getByRole('group', { name: 'Total solves' })).toHaveCount(0);
    await expect(tile(page, 'Total solves')).toBeVisible();
    await expect(page.getByText('Loading…')).toHaveCount(0);
  });

  test('many problems: the screen still reads well', async ({ page }) => {
    await openScreen(page, 'stats', 'many');
    await expect(tile(page, 'Total solves')).toBeVisible();
    await captureBothSizes(page, 'stats-many');
    await captureLower(page, 'stats-many');
  });
});
