import { expect, test, type Page } from '@playwright/test';
import { captureBothSizes, mockOpenedUrls, openScreen } from './screenshots';

const rows = (page: Page) => page.getByTestId('plan-row');
const sections = (page: Page) => page.getByTestId('plan-section');
const chip = (page: Page, name: string) => page.getByRole('group', { name: 'Topics' }).getByRole('button', { name: new RegExp(`^${name}`) });
const confirmDialog = (page: Page, title: string) => page.getByRole('dialog', { name: title });

type Bridge = Record<string, (...args: unknown[]) => Promise<unknown>>;

/** Replaces one bridge method for the rest of the page's life. `body` runs in the page. */
async function replaceMethod(page: Page, method: string, body: string): Promise<void> {
  await page.evaluate(
    ([name, source]) => {
      const bridge = (globalThis as unknown as { paraleet: Bridge }).paraleet;
      bridge[name as string] = new Function('original', `return (...args) => { ${source as string} }`)(bridge[name as string]) as Bridge[string];
    },
    [method, body],
  );
}

function setHash(page: Page, hash: string): Promise<string> {
  return page.evaluate((value) => ((globalThis as unknown as { location: { hash: string } }).location.hash = value), hash);
}

/** Leaves the Plan screen and comes back, so it loads everything again. */
async function reopenPlan(page: Page): Promise<void> {
  await setHash(page, '/stats');
  await page.getByTestId('screen-stats').waitFor();
  await setHash(page, '/plan');
}

async function captureFromTop(page: Page, name: string): Promise<void> {
  await page.getByTestId('screen-plan').evaluate((element) => element.scrollTo(0, 0));
  await captureBothSizes(page, name);
}

async function pickTopics(page: Page, names: string[]): Promise<void> {
  for (const name of names) await chip(page, name).click();
}

async function openCreate(page: Page, scenario = 'default'): Promise<void> {
  await openScreen(page, 'plan', scenario);
  await page.getByRole('button', { name: 'Create a plan' }).click();
  await expect(page.getByRole('heading', { name: 'Create a plan' })).toBeVisible();
}

async function rowTitles(page: Page): Promise<string[]> {
  return rows(page).evaluateAll((nodes) => nodes.map((node) => node.querySelector('button')?.textContent ?? ''));
}

test.describe('without a key', () => {
  test('a card says plans need a key and Add API key opens Settings', async ({ page }) => {
    await openScreen(page, 'plan', 'plan-nokey');
    await expect(page.getByText('Plans need an Anthropic API key')).toBeVisible();
    await expect(page.getByText('Everything else works without a key.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create a plan' })).toHaveCount(0);
    await captureBothSizes(page, 'plan-nokey');
    await page.getByRole('button', { name: 'Add API key' }).click();
    await expect.poll(() => page.evaluate(() => (globalThis as unknown as { location: { hash: string } }).location.hash)).toBe('#/settings/api-key');
  });

  test('when this Mac cannot store a key, there is no button to add one', async ({ page }) => {
    await openScreen(page, 'plan', 'plan-nostore');
    await expect(page.getByText('Plans are not available on this Mac')).toBeVisible();
    await expect(page.getByText(/cannot store an API key securely/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add API key' })).toHaveCount(0);
    await captureBothSizes(page, 'plan-nostore');
  });
});

test.describe('overview', () => {
  test('a key and no plan shows No active plan with Create a plan', async ({ page }) => {
    await openScreen(page, 'plan');
    await expect(page.getByText('No active plan')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create a plan' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Drafts' })).toHaveCount(0);
    await captureBothSizes(page, 'plan-empty');
  });

  test('drafts and past plans are listed and can be opened', async ({ page }) => {
    await openScreen(page, 'plan', 'plan-draft');
    const drafts = page.getByRole('region', { name: 'Drafts' });
    await expect(drafts.getByRole('button')).toHaveCount(1);
    await drafts.getByRole('button').click();
    await expect(page.getByText('Draft plan. Remove, reorder or swap problems, then activate.')).toBeVisible();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByText('No active plan')).toBeVisible();

    await openScreen(page, 'plan', 'plan-active');
    const past = page.getByRole('region', { name: 'Past plans' });
    await expect(past.getByRole('button')).toHaveCount(2);
    await expect(past).toContainText('Finished');
    await expect(past).toContainText('Archived');
    await past.getByRole('button').filter({ hasText: 'Archived' }).click();
    await expect(page.getByRole('heading', { name: 'Greedy', level: 2 })).toBeVisible();
  });
});

test.describe('create', () => {
  test('topics, platforms, level and size choose what is generated', async ({ page }) => {
    await openCreate(page);
    // Defaults: all three platforms, Some practice, 20 per topic, nothing chosen yet.
    for (const name of ['LeetCode', 'CSES', 'Codeforces']) {
      await expect(page.getByRole('group', { name: 'Platforms' }).getByRole('button', { name: name })).toHaveAttribute('aria-pressed', 'true');
    }
    await expect(page.getByRole('radio', { name: /Some practice/ })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('radio', { name: '20' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('button', { name: 'Generate plan' })).toBeDisabled();
    await expect(page.getByText('Pick at least one topic')).toBeVisible();

    await pickTopics(page, ['Binary search', 'Two pointers', 'Greedy']);
    await expect(page.getByText('About 60 problems from 3 topics')).toBeVisible();
    await page.getByRole('radio', { name: '30' }).click();
    await expect(page.getByText('About 90 problems from 3 topics')).toBeVisible();
    await page.getByRole('radio', { name: '10' }).click();
    await expect(page.getByText('About 30 problems from 3 topics')).toBeVisible();
    await page.getByRole('radio', { name: /Comfortable/ }).click();
    await expect(page.getByRole('radio', { name: /Comfortable/ })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('radio', { name: /Some practice/ })).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByRole('button', { name: 'Generate plan' })).toBeEnabled();
    await captureFromTop(page, 'plan-create');
  });

  test('the request carries what was chosen', async ({ page }) => {
    await openCreate(page);
    await page.evaluate(() => {
      const bridge = (globalThis as unknown as { paraleet: Bridge; __request?: unknown }).paraleet;
      const original = bridge['generatePlan'] as Bridge[string];
      bridge['generatePlan'] = (...args: unknown[]) => {
        (globalThis as unknown as { __request?: unknown }).__request = args[0];
        return original(...args);
      };
    });
    await page.getByRole('group', { name: 'Platforms' }).getByRole('button', { name: 'Codeforces' }).click();
    await pickTopics(page, ['Binary search', 'Greedy']);
    await page.getByRole('radio', { name: '30' }).click();
    await page.getByRole('radio', { name: /New to this/ }).click();
    await page.getByRole('button', { name: 'Generate plan' }).click();
    await expect(page.getByRole('button', { name: 'Activate plan' })).toBeVisible();
    expect(await page.evaluate(() => (globalThis as unknown as { __request?: unknown }).__request)).toEqual({
      topics: ['binary-search', 'greedy'],
      platforms: ['leetcode', 'cses'],
      level: 'new',
      targetSize: 30,
    });
  });

  test('a topic with no problems on the chosen platforms is disabled, and at least one platform stays', async ({ page }) => {
    await openCreate(page);
    // The mock gives Arrays & hashing problems on LeetCode only.
    await expect(chip(page, 'Arrays & hashing')).toBeEnabled();
    const platforms = page.getByRole('group', { name: 'Platforms' });
    await platforms.getByRole('button', { name: 'LeetCode' }).click();
    await expect(chip(page, 'Arrays & hashing')).toBeDisabled();
    await platforms.getByRole('button', { name: 'CSES' }).click();
    // Codeforces is the last one left: it cannot be turned off.
    await expect(platforms.getByRole('button', { name: 'Codeforces' })).toBeDisabled();
    await expect(platforms.getByRole('button', { name: 'Codeforces' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('counts follow the platforms, and a chosen topic drops out when none is left for it', async ({ page }) => {
    await openCreate(page);
    const greedy = chip(page, 'Greedy');
    const before = Number((await greedy.textContent())?.match(/(\d+)$/)?.[1]);
    await page.getByRole('group', { name: 'Platforms' }).getByRole('button', { name: 'CSES' }).click();
    const after = Number((await greedy.textContent())?.match(/(\d+)$/)?.[1]);
    expect(after).toBeLessThan(before);
    // Arrays & hashing exists on LeetCode only: choosing it, then turning LeetCode off, drops it.
    await chip(page, 'Arrays & hashing').click();
    await expect(chip(page, 'Arrays & hashing')).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('group', { name: 'Platforms' }).getByRole('button', { name: 'LeetCode' }).click();
    await expect(chip(page, 'Arrays & hashing')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByText('Pick at least one topic')).toBeVisible();
  });

  test('a fifth topic cannot be picked', async ({ page }) => {
    await openCreate(page);
    await pickTopics(page, ['Binary search', 'Two pointers', 'Greedy', 'Stacks']);
    await expect(page.getByText('4 selected, up to 4')).toBeVisible();
    await expect(chip(page, 'Heaps')).toBeDisabled();
    await expect(chip(page, 'Stacks')).toBeEnabled();
    await chip(page, 'Stacks').click();
    await expect(chip(page, 'Heaps')).toBeEnabled();
  });
});

test.describe('generating', () => {
  test('the button shows progress, cannot be pressed twice, and a draft opens', async ({ page }) => {
    await openCreate(page);
    await page.evaluate(() => {
      const bridge = (globalThis as unknown as { paraleet: Bridge }).paraleet;
      const original = bridge['generatePlan'] as Bridge[string];
      (globalThis as unknown as { __calls: number }).__calls = 0;
      bridge['generatePlan'] = (...args: unknown[]) => {
        (globalThis as unknown as { __calls: number }).__calls += 1;
        return original(...args);
      };
    });
    await pickTopics(page, ['Binary search']);
    const button = page.getByRole('button', { name: 'Para is picking problems…' });
    await page.getByRole('button', { name: 'Generate plan' }).click();
    await expect(button).toBeVisible();
    await expect(button).toBeDisabled();
    await captureFromTop(page, 'plan-generating');
    await button.click({ force: true, noWaitAfter: true }).catch(() => undefined);
    await expect(page.getByRole('button', { name: 'Activate plan' })).toBeVisible();
    expect(await page.evaluate(() => (globalThis as unknown as { __calls: number }).__calls)).toBe(1);
    await expect(page.getByRole('heading', { name: 'Binary search', level: 2 })).toBeVisible();
  });

  test('a failure shows its message with Try again and keeps the choices', async ({ page }) => {
    await openCreate(page, 'plan-fails');
    await pickTopics(page, ['Binary search', 'Greedy']);
    await page.getByRole('radio', { name: '30' }).click();
    await page.getByRole('button', { name: 'Generate plan' }).click();
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('The model did not produce a usable plan');
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    await expect(chip(page, 'Binary search')).toHaveAttribute('aria-pressed', 'true');
    await expect(chip(page, 'Greedy')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('radio', { name: '30' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('About 60 problems from 2 topics')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generate plan' })).toBeEnabled();
    await captureFromTop(page, 'plan-error');
    // Try again asks again, and the same failure comes back.
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('button', { name: 'Para is picking problems…' })).toBeVisible();
    await expect(alert).toContainText('The model did not produce a usable plan');
  });
});

test.describe('draft review', () => {
  test('shows the banner, tags solved problems and tells nothing about Next', async ({ page }) => {
    await openScreen(page, 'plan', 'plan-draft');
    await page.getByRole('region', { name: 'Drafts' }).getByRole('button').click();
    await expect(page.getByText('Draft plan. Remove, reorder or swap problems, then activate.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Activate plan' })).toBeVisible();
    await expect(page.getByText('Next', { exact: true })).toHaveCount(0);
    await expect(page.getByText('solved, will be offered as review').first()).toBeVisible();
    // Only a problem the user has attempted is tagged.
    const tagged = rows(page).filter({ hasText: 'solved, will be offered as review' });
    expect(await tagged.count()).toBeLessThan(await rows(page).count());
    await captureBothSizes(page, 'plan-draft');
  });

  async function openDraft(page: Page): Promise<void> {
    await openScreen(page, 'plan', 'plan-draft');
    await page.getByRole('region', { name: 'Drafts' }).getByRole('button').click();
    await expect(page.getByRole('button', { name: 'Activate plan' })).toBeVisible();
  }

  test('a problem can be removed', async ({ page }) => {
    await openDraft(page);
    const before = await rowTitles(page);
    await page.getByRole('button', { name: `Remove ${before[0]}` }).click();
    await expect(rows(page)).toHaveCount(before.length - 1);
    expect(await rowTitles(page)).toEqual(before.slice(1));
  });

  test('a problem moves up and down inside its group, and the ends are disabled', async ({ page }) => {
    await openDraft(page);
    const first = sections(page).first();
    const titles = await first.getByTestId('plan-row').evaluateAll((nodes) => nodes.map((node) => node.querySelector('button')?.textContent ?? ''));
    expect(titles.length).toBeGreaterThan(2);
    await expect(first.getByRole('button', { name: `Move up ${titles[0]}` })).toBeDisabled();
    await expect(first.getByRole('button', { name: `Move down ${titles.at(-1)}` })).toBeDisabled();
    await first.getByRole('button', { name: `Move down ${titles[0]}` }).click();
    await expect(first.getByTestId('plan-row').nth(0).locator('button').first()).toHaveText(titles[1] ?? '');
    await expect(first.getByTestId('plan-row').nth(1).locator('button').first()).toHaveText(titles[0] ?? '');
    await first.getByRole('button', { name: `Move up ${titles[0]}` }).click();
    await expect(first.getByTestId('plan-row').nth(0).locator('button').first()).toHaveText(titles[0] ?? '');
  });

  test('a problem is swapped from at most five alternatives', async ({ page }) => {
    await openDraft(page);
    const before = await rowTitles(page);
    await page.getByRole('button', { name: `Swap ${before[0]}` }).click();
    const options = page.getByRole('group', { name: 'Alternatives' });
    await expect(options).toBeVisible();
    const choices = options.getByRole('button').filter({ hasNot: page.getByText('Cancel', { exact: true }) });
    await expect(choices.first()).toBeVisible();
    const count = await choices.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(5 + 1);
    await captureBothSizes(page, 'plan-draft-swap');
    const pickedText = (await choices.first().locator('span').first().textContent()) ?? '';
    await choices.first().click();
    await expect(options).toHaveCount(0);
    const after = await rowTitles(page);
    expect(after).toHaveLength(before.length);
    expect(after[0]).toBe(pickedText);
    expect(after[0]).not.toBe(before[0]);
  });

  test('Activate plan makes it the active plan, with a Next problem', async ({ page }) => {
    await openDraft(page);
    await page.getByRole('button', { name: 'Activate plan' }).click();
    await expect(page.getByRole('button', { name: 'Archive', exact: true })).toBeVisible();
    await expect(page.getByText('Draft plan. Remove, reorder')).toHaveCount(0);
    await expect(page.getByText('Next', { exact: true })).toHaveCount(1);
    await expect(page.getByRole('region', { name: 'Drafts' })).toHaveCount(0);
  });
});

test.describe('active plan', () => {
  test('shows topics, stages and groups with progress and one Next badge', async ({ page }) => {
    await openScreen(page, 'plan', 'plan-active');
    await expect(page.getByRole('heading', { name: 'Arrays & hashing, Sliding window', level: 2 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Arrays & hashing', level: 3 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sliding window', level: 3 })).toBeVisible();
    // Each group has its name and one sentence.
    await expect(page.getByText('The core pattern').first()).toBeVisible();
    await expect(page.getByText('Apply the technique in its plainest form, then with one extra condition.').first()).toBeVisible();
    await expect(page.getByText('Foundations', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Challenge', { exact: true }).first()).toBeVisible();
    // Done and pending counts, and a bar, per card; an overall figure in the header.
    await expect(page.getByTestId('plan-overall')).toContainText(/\d+ \/ \d+/);
    await expect(sections(page).first()).toContainText('3 done · 0 pending');
    await expect(sections(page).nth(1)).toContainText('1 done · 1 skipped · 1 pending');
    await expect(page.getByRole('progressbar', { name: 'Overall progress' })).toBeVisible();
    await expect(sections(page).nth(1).getByRole('progressbar')).toHaveAttribute('aria-valuenow', /^(33|67)$/);
    // Exactly one Next badge, on a pending problem.
    const next = page.getByText('Next', { exact: true });
    await expect(next).toHaveCount(1);
    await expect(rows(page).filter({ has: next }).getByLabel('Pending')).toHaveCount(1);
    // An active plan is not edited.
    await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(0);
    await captureBothSizes(page, 'plan-active');
  });

  test('a card with nothing pending is collapsed and expands with its chevron', async ({ page }) => {
    await openScreen(page, 'plan', 'plan-active');
    const done = sections(page).first();
    const header = done.getByRole('button', { expanded: false });
    await expect(header).toBeVisible();
    await expect(done.getByTestId('plan-row')).toHaveCount(0);
    await header.click();
    await expect(done.getByTestId('plan-row')).toHaveCount(3);
    await expect(done.getByLabel('Done')).toHaveCount(3);
    await done.getByRole('button', { expanded: true }).click();
    await expect(done.getByTestId('plan-row')).toHaveCount(0);
    // A card with work left starts open.
    await expect(sections(page).nth(1).getByTestId('plan-row').first()).toBeVisible();
  });

  test('Archive asks first, and archiving shows the overview without the plan', async ({ page }) => {
    await openScreen(page, 'plan', 'plan-active');
    await page.getByRole('button', { name: 'Archive', exact: true }).click();
    const dialog = confirmDialog(page, 'Archive this plan?');
    await expect(dialog).toBeVisible();
    await captureBothSizes(page, 'plan-archive-confirm');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Arrays & hashing, Sliding window', level: 2 })).toBeVisible();

    await page.getByRole('button', { name: 'Archive', exact: true }).click();
    await dialog.getByRole('button', { name: 'Archive plan' }).click();
    await expect(page.getByText('No active plan')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Past plans' }).getByRole('button')).toHaveCount(3);
  });
});

test.describe('deleting and finished plans', () => {
  test('an archived plan is read-only and can be deleted after a confirmation', async ({ page }) => {
    await openScreen(page, 'plan', 'plan-active');
    await page.getByRole('region', { name: 'Past plans' }).getByRole('button').filter({ hasText: 'Archived' }).click();
    await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Activate plan' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    const dialog = confirmDialog(page, 'Delete this plan?');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'Greedy', level: 2 })).toBeVisible();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await dialog.getByRole('button', { name: 'Delete plan' }).click();
    // Back on the overview, the archived plan is gone and the finished one stays.
    const past = page.getByRole('region', { name: 'Past plans' });
    await expect(past.getByRole('button')).toHaveCount(1);
    await expect(past).toContainText('Finished');
  });

  test('a draft can be deleted', async ({ page }) => {
    await openScreen(page, 'plan', 'plan-draft');
    await page.getByRole('region', { name: 'Drafts' }).getByRole('button').click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await confirmDialog(page, 'Delete this plan?').getByRole('button', { name: 'Delete plan' }).click();
    await expect(page.getByText('No active plan')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Drafts' })).toHaveCount(0);
  });

  test('a finished plan is kept: shown as finished, with no delete', async ({ page }) => {
    await openScreen(page, 'plan', 'plan-active');
    await page.getByRole('region', { name: 'Past plans' }).getByRole('button').filter({ hasText: 'Finished' }).click();
    await expect(page.getByRole('heading', { name: 'Stacks', level: 2 }).first()).toBeVisible();
    await expect(page.getByText('Finished', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Archive', exact: true })).toHaveCount(0);
    await captureBothSizes(page, 'plan-finished');
  });
});

test.describe('opening problems', () => {
  test('a title opens the problem through the bridge, never a link', async ({ page }) => {
    await openScreen(page, 'plan', 'plan-active');
    await expect(page.getByTestId('screen-plan').locator('a')).toHaveCount(0);
    const row = rows(page).filter({ has: page.getByLabel('Pending') }).first();
    const title = (await row.locator('button').first().textContent()) ?? '';
    expect(await mockOpenedUrls(page)).toEqual([]);
    await row.getByRole('button', { name: title }).click();
    const opened = await mockOpenedUrls(page);
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatch(/^https:\/\//);
  });
});

test.describe('loading and failures', () => {
  test('shows Loading, not the wrong content, while the overview is read', async ({ page }) => {
    await openScreen(page, 'plan');
    await replaceMethod(
      page,
      'getPlanOverview',
      'return new Promise((resolve) => { window.__release = () => resolve(original(...args)); });',
    );
    await reopenPlan(page);
    await expect(page.getByText('Loading…')).toBeVisible();
    await expect(page.getByText('No active plan')).toHaveCount(0);
    await expect(page.getByText('Plans need an Anthropic API key')).toHaveCount(0);
    await page.evaluate(() => (globalThis as unknown as { __release: () => void }).__release());
    await expect(page.getByText('No active plan')).toBeVisible();
  });

  test('a failed overview shows the message and Try again, never a blank screen', async ({ page }) => {
    await openScreen(page, 'plan', 'plan-active');
    await replaceMethod(page, 'getPlanOverview', "return Promise.reject(new Error('The database is busy.'));");
    await reopenPlan(page);
    await expect(page.getByRole('alert')).toContainText('The database is busy.');
    await captureBothSizes(page, 'plan-load-failed');
  });

  test('Try again reads the overview again', async ({ page }) => {
    await openScreen(page, 'plan');
    // The first read fails; the next one goes through to the real method.
    await replaceMethod(
      page,
      'getPlanOverview',
      "if (window.__fail !== false) return Promise.reject(new Error('Could not read plans.')); return original(...args);",
    );
    await reopenPlan(page);
    await expect(page.getByRole('alert')).toContainText('Could not read plans.');
    await page.evaluate(() => ((globalThis as unknown as { __fail: boolean }).__fail = false));
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText('No active plan')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('a plan that cannot be opened shows the message, Try again and Back', async ({ page }) => {
    await openScreen(page, 'plan', 'plan-draft');
    await replaceMethod(
      page,
      'getPlan',
      "if (window.__fail !== false) return Promise.reject(new Error('That plan could not be read.')); return original(...args);",
    );
    await page.getByRole('region', { name: 'Drafts' }).getByRole('button').click();
    await expect(page.getByRole('alert')).toContainText('That plan could not be read.');
    await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeVisible();
    await page.evaluate(() => ((globalThis as unknown as { __fail: boolean }).__fail = false));
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('button', { name: 'Activate plan' })).toBeVisible();
  });

  test('an edit that is refused shows the message and keeps the plan', async ({ page }) => {
    await openScreen(page, 'plan', 'plan-draft');
    await page.getByRole('region', { name: 'Drafts' }).getByRole('button').click();
    await replaceMethod(page, 'removePlanItem', "return Promise.reject(new Error('A plan needs at least one problem.'));");
    const before = await rows(page).count();
    await rows(page).first().getByRole('button', { name: /^Remove / }).click();
    await expect(page.getByRole('alert')).toContainText('A plan needs at least one problem.');
    await expect(rows(page)).toHaveCount(before);
  });
});
