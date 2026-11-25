import { expect, test, type Page } from '@playwright/test';
import { captureBothSizes, WINDOW_MIN } from './screenshots';

type Host = {
  paraleet: { completeOnboarding: (input: unknown) => Promise<unknown> };
};

const flow = (page: Page) => page.getByTestId('onboarding');
const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Main' });
const field = (page: Page, name: string) => page.getByRole('textbox', { name, exact: true });

async function openFlow(page: Page): Promise<void> {
  await page.goto('/?scenario=hatching#/today');
  await expect(flow(page)).toBeVisible();
}

/** Records every `completeOnboarding` call on `window.__completed`, optionally making it fail. */
async function spyOnComplete(page: Page, failWith?: string): Promise<void> {
  await page.evaluate((message) => {
    const host = globalThis as unknown as Host & { __completed: unknown[] };
    const original = host.paraleet.completeOnboarding;
    host.__completed = [];
    host.paraleet.completeOnboarding = async (input: unknown) => {
      host.__completed.push(input);
      if (message) throw new Error(message);
      return original(input);
    };
  }, failWith);
}

const completed = (page: Page): Promise<unknown[]> =>
  page.evaluate(() => (globalThis as unknown as { __completed: unknown[] }).__completed);

async function toMeet(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Hatch', exact: true }).click();
  await expect(page.getByText("Hi! I'm Para. Feed me one problem a day.")).toBeVisible();
}

async function toReminders(page: Page): Promise<void> {
  await toMeet(page);
  await page.getByRole('button', { name: 'Nice to meet you' }).click();
  await expect(page.getByRole('heading', { name: 'When should Para remind you?' })).toBeVisible();
}

test('the flow replaces the sidebar and screens while Para has not hatched', async ({ page }) => {
  await openFlow(page);
  await expect(sidebar(page)).toHaveCount(0);
  await expect(page.getByTestId('screen-today')).toHaveCount(0);
  await expect(page.getByTestId('onboarding-step')).toHaveText('Step 1 of 3');
  await expect(page.getByTestId('onboarding-dots').locator('span')).toHaveCount(3);
});

test('step 1 shows the egg, the line and one Hatch button', async ({ page }) => {
  await openFlow(page);
  await expect(page.getByText('Something is moving…')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hatch', exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Hatch the egg' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Skip' })).toHaveCount(0);
  await captureBothSizes(page, 'onboarding-1-egg');
});

test('the Hatch button plays the animation and moves on by itself', async ({ page }) => {
  await openFlow(page);
  await page.getByRole('button', { name: 'Hatch', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Hatching…' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Hatch the egg' })).toBeDisabled();
  await expect(page.getByTestId('onboarding-step')).toHaveText('Step 1 of 3');
  await expect(page.getByTestId('onboarding-bubble')).toBeVisible({
    timeout: 4000,
  });
  await expect(page.getByTestId('onboarding-step')).toHaveText('Step 2 of 3');
});

test('clicking the egg hatches it too', async ({ page }) => {
  await openFlow(page);
  await page.getByRole('button', { name: 'Hatch the egg' }).click();
  await expect(page.getByRole('button', { name: 'Hatching…' })).toBeVisible();
  await expect(page.getByTestId('onboarding-bubble')).toBeVisible({
    timeout: 4000,
  });
});

test('step 2 introduces Para, with Enter moving on', async ({ page }) => {
  await openFlow(page);
  await toMeet(page);
  await expect(
    page.getByText(
      'Solve one problem a day and Para gets fed. Para remembers what you solved and brings it back for review at the right time.',
    ),
  ).toBeVisible();
  await expect(page.getByTestId('onboarding-para')).toHaveAttribute('data-stage', 'egg');
  await expect(page.getByTestId('onboarding-para')).toHaveAttribute('data-mood', 'content');
  await expect(page.getByRole('button', { name: 'Nice to meet you' })).toBeFocused();
  await captureBothSizes(page, 'onboarding-2-meet');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('onboarding-bubble')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('onboarding-step')).toHaveText('Step 3 of 3');
});

test('step 3 starts at 16:00 and 21:00; Enter continues to Today', async ({ page }) => {
  await openFlow(page);
  await spyOnComplete(page);
  await toReminders(page);
  await expect(field(page, 'First reminder')).toHaveValue('16:00');
  await expect(field(page, 'Evening reminder')).toHaveValue('21:00');
  await expect(page.getByText('At most two a day. Skipped once Para is fed.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Skip' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeFocused();
  await captureBothSizes(page, 'onboarding-3-reminders');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('screen-today')).toBeVisible();
  expect(await completed(page)).toEqual([{ firstReminderTime: '16:00', eveningReminderTime: '21:00' }]);
});

test('a bad time is refused with a message and the flow stays', async ({ page }) => {
  await openFlow(page);
  await spyOnComplete(page);
  await toReminders(page);
  await field(page, 'First reminder').fill('25:00');
  await field(page, 'Evening reminder').focus();
  // Checked when the field loses focus.
  await expect(page.getByRole('alert')).toHaveText('Use a 24-hour time like 16:00');
  await expect(field(page, 'First reminder')).toHaveAttribute('aria-invalid', 'true');
  await captureBothSizes(page, 'onboarding-3-invalid');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('alert')).toHaveCount(1);
  expect(await completed(page)).toEqual([]);
  await expect(flow(page)).toBeVisible();

  // Typing again clears the message; fixed, Continue saves the typed times.
  await field(page, 'First reminder').fill('15:30');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('screen-today')).toBeVisible();
  expect(await completed(page)).toEqual([{ firstReminderTime: '15:30', eveningReminderTime: '21:00' }]);
  await expect(flow(page)).toHaveCount(0);

  // The times are now the settings, and the flow stays gone.
  await sidebar(page).getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByLabel('First reminder')).toHaveValue('15:30');
  await sidebar(page).getByRole('button', { name: 'Today' }).click();
  await expect(page.getByTestId('screen-today')).toBeVisible();
  await expect(flow(page)).toHaveCount(0);
});

test('a time that is only invalid on Continue is also refused', async ({ page }) => {
  await openFlow(page);
  await spyOnComplete(page);
  await toReminders(page);
  await field(page, 'Evening reminder').fill('9pm');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('alert')).toHaveText('Use a 24-hour time like 16:00');
  await expect(field(page, 'Evening reminder')).toHaveAttribute('aria-invalid', 'true');
  expect(await completed(page)).toEqual([]);
});

test('Skip finishes with the default times', async ({ page }) => {
  await openFlow(page);
  await spyOnComplete(page);
  await toReminders(page);
  // Skip ignores whatever is typed.
  await field(page, 'First reminder').fill('nonsense');
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByTestId('screen-today')).toBeVisible();
  expect(await completed(page)).toEqual([{ firstReminderTime: '16:00', eveningReminderTime: '21:00' }]);
});

test('a failed save shows the error and stays on step 3', async ({ page }) => {
  await openFlow(page);
  await spyOnComplete(page, 'The database is locked');
  await toReminders(page);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('alert')).toHaveText('The database is locked');
  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
  await expect(flow(page)).toBeVisible();
  await expect(page.getByTestId('onboarding-step')).toHaveText('Step 3 of 3');
});

test('after a failed save, trying again finishes the flow', async ({ page }) => {
  await openFlow(page);
  await toReminders(page);
  // Fails once, then works.
  await page.evaluate(() => {
    const host = globalThis as unknown as Host & { __completed: unknown[] };
    const original = host.paraleet.completeOnboarding;
    host.__completed = [];
    host.paraleet.completeOnboarding = async (input: unknown) => {
      host.__completed.push(input);
      if (host.__completed.length === 1) throw new Error('The database is locked');
      return original(input);
    };
  });
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('alert')).toHaveText('The database is locked');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('screen-today')).toBeVisible();
  await expect(flow(page)).toHaveCount(0);
  expect(await completed(page)).toHaveLength(2);
});

test('reminder times already in Settings are the starting point, and Skip keeps them', async ({ page }) => {
  await page.goto('/?scenario=hatching#/today');
  await expect(flow(page)).toBeVisible();
  await page.evaluate(() =>
    (
      globalThis as unknown as {
        paraleet: { updateSettings(patch: object): Promise<unknown> };
      }
    ).paraleet.updateSettings({
      firstReminderTime: '09:15',
      eveningReminderTime: '19:45',
    }),
  );
  await spyOnComplete(page);
  await toReminders(page);
  await expect(field(page, 'First reminder')).toHaveValue('09:15');
  await expect(field(page, 'Evening reminder')).toHaveValue('19:45');
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByTestId('screen-today')).toBeVisible();
  expect(await completed(page)).toEqual([{ firstReminderTime: '09:15', eveningReminderTime: '19:45' }]);
});

test('the sprite gallery shows even before Para has hatched', async ({ page }) => {
  await page.goto('/?scenario=hatching#/gallery');
  await expect(page.getByTestId('screen-gallery')).toBeVisible();
  await expect(flow(page)).toHaveCount(0);
});

test('someone who has already hatched never sees the flow', async ({ page }) => {
  // Written as text because the test runs in Node, which has no DOM types.
  await page.addInitScript(`
    new MutationObserver(() => {
      if (document.querySelector('[data-testid="onboarding"]')) globalThis.__sawFlow = true;
    }).observe(document, { childList: true, subtree: true });
  `);
  await page.goto('/?scenario=default#/today');
  await expect(page.getByTestId('screen-today')).toBeVisible();
  await expect(sidebar(page)).toBeVisible();
  expect(await page.evaluate(() => (globalThis as unknown as { __sawFlow?: boolean }).__sawFlow ?? false)).toBe(false);
});

test('with reduced motion Hatch goes straight to Para', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openFlow(page);
  await page.getByRole('button', { name: 'Hatch', exact: true }).click();
  // No wait for an animation: step 2 is there at once.
  await expect(page.getByTestId('onboarding-bubble')).toBeVisible({
    timeout: 500,
  });
  await expect(page.getByRole('button', { name: 'Hatching…' })).toHaveCount(0);
});

test('Cmd+2 does nothing during the flow', async ({ page }) => {
  await openFlow(page);
  await page.keyboard.press('Meta+2');
  await expect(flow(page)).toBeVisible();
  await expect(sidebar(page)).toHaveCount(0);
  await page.evaluate(`window.location.hash = '/settings'`);
  await expect(flow(page)).toBeVisible();
  await expect(page.getByTestId('screen-settings')).toHaveCount(0);
});

// The menu bar icon and Para's menu can ask for a screen while the flow is showing: the address
// changes under it. The app still opens on Today when the flow ends, with nothing left over.
for (const asked of ['/settings', '/today/swap', '/stats']) {
  test(`the flow ends on Today even when ${asked} was asked for during it`, async ({ page }) => {
    await openFlow(page);
    await toReminders(page);
    // As text: the tests are type-checked without the browser's own types.
    await page.evaluate(`window.location.hash = ${JSON.stringify(asked)}`);
    await expect(flow(page)).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('screen-today')).toBeVisible();
    await expect(flow(page)).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(new URL(page.url()).hash).toBe('#/today');
  });
}

test('every step fits the minimum window without scrolling', async ({ page }) => {
  await page.setViewportSize(WINDOW_MIN);
  await openFlow(page);
  const fits = async (): Promise<void> => {
    const sizes = await page.evaluate<{
      scrollHeight: number;
      innerHeight: number;
      scrollWidth: number;
      innerWidth: number;
      top: number;
      bottom: number;
    }>(`({
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      top: Math.min(...[...document.querySelectorAll('[data-testid="onboarding"] :is(button, input, canvas, h1, p)')].map((el) => el.getBoundingClientRect().top)),
      bottom: Math.max(...[...document.querySelectorAll('[data-testid="onboarding"] :is(button, input, canvas, h1, p)')].map((el) => el.getBoundingClientRect().bottom)),
    })`);
    expect(sizes.scrollHeight).toBeLessThanOrEqual(sizes.innerHeight);
    expect(sizes.scrollWidth).toBeLessThanOrEqual(sizes.innerWidth);
    // Everything in the step is inside the window: nothing pushed off the top or the bottom.
    expect(sizes.top).toBeGreaterThanOrEqual(0);
    expect(sizes.bottom).toBeLessThanOrEqual(sizes.innerHeight);
  };
  await fits();
  await toMeet(page);
  await fits();
  await page.getByRole('button', { name: 'Nice to meet you' }).click();
  await field(page, 'First reminder').fill('99:99');
  await field(page, 'Evening reminder').fill('88:88');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('alert')).toHaveCount(2);
  await fits();
});

// The optional fourth step: an Anthropic API key for learning plans (PRD section 11).
const SECRET = 'sk-ant-test-0123456789-secret';
const keyField = (page: Page) => page.getByLabel('Anthropic API key', { exact: true });
const skipTop = (page: Page) => page.getByRole('button', { name: 'Skip', exact: true });

async function openKeyFlow(page: Page, scenario = 'hatching-nokey'): Promise<void> {
  await page.goto(`/?scenario=${scenario}#/today`);
  await expect(flow(page)).toBeVisible();
}

/**
 * Records calls of the named bridge methods on `window.__calls` as `{ method, input }`. A method
 * named in `failing` throws that message instead of running.
 */
async function spyOn(page: Page, methods: string[], failing: Record<string, string> = {}): Promise<void> {
  await page.evaluate(
    ({ methods: names, failing: fails }) => {
      const host = globalThis as unknown as {
        paraleet: Record<string, (input: unknown) => Promise<unknown>>;
        __calls: { method: string; input: unknown }[];
      };
      host.__calls = [];
      for (const method of names) {
        const original = host.paraleet[method]!;
        host.paraleet[method] = async (input: unknown) => {
          host.__calls.push({ method, input });
          const message = fails[method];
          if (message) throw new Error(message);
          return original(input);
        };
      }
    },
    { methods, failing },
  );
}

const calls = (page: Page): Promise<{ method: string; input: unknown }[]> =>
  page.evaluate(
    () =>
      (
        globalThis as unknown as {
          __calls: { method: string; input: unknown }[];
        }
      ).__calls,
  );

async function toKey(page: Page): Promise<void> {
  await toReminders(page);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Want learning plans?' })).toBeVisible();
}

const hasKey = (page: Page): Promise<boolean> =>
  page.evaluate(`globalThis.paraleet.getPlanOverview().then((overview) => overview.llm.hasKey)`);

test('with no key saved and a Mac that can store one, every step counts of 4', async ({ page }) => {
  await openKeyFlow(page);
  await expect(page.getByTestId('onboarding-dots').locator('span')).toHaveCount(4);
  await expect(page.getByTestId('onboarding-step')).toHaveText('Step 1 of 4');
  await toMeet(page);
  await expect(page.getByTestId('onboarding-step')).toHaveText('Step 2 of 4');
  await page.getByRole('button', { name: 'Nice to meet you' }).click();
  await expect(page.getByTestId('onboarding-step')).toHaveText('Step 3 of 4');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('onboarding-step')).toHaveText('Step 4 of 4');
  await expect(page.getByTestId('onboarding-dots').locator('span')).toHaveCount(4);
});

for (const scenario of ['hatching', 'hatching-nostore']) {
  test(`${scenario}: the flow keeps three steps and Continue completes directly`, async ({ page }) => {
    await openKeyFlow(page, scenario);
    await expect(page.getByTestId('onboarding-dots').locator('span')).toHaveCount(3);
    await spyOn(page, ['completeOnboarding', 'updateSettings']);
    await toReminders(page);
    await expect(page.getByTestId('onboarding-step')).toHaveText('Step 3 of 3');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('screen-today')).toBeVisible();
    expect((await calls(page)).map((c) => c.method)).toEqual(['completeOnboarding']);
  });
}

test('a failed getPlanOverview leaves three steps and never blocks them', async ({ page }) => {
  await page.addInitScript(`
    const timer = setInterval(() => {
      if (!globalThis.paraleet) return;
      clearInterval(timer);
      globalThis.paraleet.getPlanOverview = async () => { throw new Error('no'); };
    }, 0);
  `);
  await openKeyFlow(page);
  await toReminders(page);
  await expect(page.getByTestId('onboarding-step')).toHaveText('Step 3 of 3');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('screen-today')).toBeVisible();
});

test('step 4 shows the title, the paragraph, a password field and both buttons', async ({ page }) => {
  await openKeyFlow(page);
  await toKey(page);
  await expect(
    page.getByText(
      'Pick topics and Para asks Claude for a staged list of real problems. That needs your own Anthropic API key. Everything else works without one, and you can add it later in Settings.',
    ),
  ).toBeVisible();
  await expect(keyField(page)).toHaveAttribute('type', 'password');
  await expect(page.getByRole('button', { name: 'Save key', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Skip for now', exact: true })).toBeEnabled();
  await expect(skipTop(page)).toBeVisible();
  await captureBothSizes(page, 'onboarding-4-key');
});

test('Save key needs 10 characters, saves the key and opens Today', async ({ page }) => {
  await openKeyFlow(page);
  await toKey(page);
  await spyOn(page, ['saveApiKey', 'completeOnboarding']);
  const save = page.getByRole('button', { name: 'Save key', exact: true });
  await keyField(page).fill('123456789');
  await expect(save).toBeDisabled();
  await keyField(page).fill(SECRET);
  await expect(save).toBeEnabled();
  await captureBothSizes(page, 'onboarding-4-key-typed');
  await save.click();
  await expect(page.getByTestId('screen-today')).toBeVisible();
  expect(await calls(page)).toEqual([
    { method: 'saveApiKey', input: { apiKey: SECRET } },
    {
      method: 'completeOnboarding',
      input: { firstReminderTime: '16:00', eveningReminderTime: '21:00' },
    },
  ]);
  expect(await page.content()).not.toContain(SECRET);
  expect(await hasKey(page)).toBe(true);
});

test('while the key is saving the button is busy and a second press does nothing', async ({ page }) => {
  await openKeyFlow(page);
  await toKey(page);
  await page.evaluate(`(() => {
    const original = globalThis.paraleet.saveApiKey;
    globalThis.__saves = 0;
    globalThis.paraleet.saveApiKey = async (input) => {
      globalThis.__saves += 1;
      await new Promise((resolve) => setTimeout(resolve, 600));
      return original(input);
    };
  })()`);
  await keyField(page).fill(SECRET);
  await keyField(page).press('Enter');
  await expect(page.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  await page.keyboard.press('Enter');
  await expect(skipTop(page)).toBeDisabled();
  await expect(page.getByTestId('screen-today')).toBeVisible();
  expect(await page.evaluate(`globalThis.__saves`)).toBe(1);
});

test('a refused key shows the message, clears the field and stays on step 4', async ({ page }) => {
  await openKeyFlow(page);
  await toKey(page);
  await spyOn(page, ['saveApiKey', 'completeOnboarding'], {
    saveApiKey: 'That does not look like an API key.',
  });
  await keyField(page).fill(SECRET);
  await page.getByRole('button', { name: 'Save key', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('That does not look like an API key.');
  await expect(keyField(page)).toHaveValue('');
  await expect(page.getByTestId('onboarding-step')).toHaveText('Step 4 of 4');
  expect(await page.content()).not.toContain(SECRET);
  expect((await calls(page)).map((c) => c.method)).toEqual(['saveApiKey']);
  await captureBothSizes(page, 'onboarding-4-key-refused');

  // The user can type again, or skip.
  await expect(page.getByRole('button', { name: 'Save key', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Skip for now', exact: true }).click();
  await expect(page.getByTestId('screen-today')).toBeVisible();
});

test('Skip for now finishes with no key saved', async ({ page }) => {
  await openKeyFlow(page);
  await toKey(page);
  await spyOn(page, ['saveApiKey', 'completeOnboarding']);
  await page.getByRole('button', { name: 'Skip for now', exact: true }).click();
  await expect(page.getByTestId('screen-today')).toBeVisible();
  expect(await calls(page)).toEqual([
    {
      method: 'completeOnboarding',
      input: { firstReminderTime: '16:00', eveningReminderTime: '21:00' },
    },
  ]);
  expect(await hasKey(page)).toBe(false);
});

test('the small Skip at the top right also finishes from step 4', async ({ page }) => {
  await openKeyFlow(page);
  await toKey(page);
  await spyOn(page, ['saveApiKey', 'completeOnboarding']);
  await skipTop(page).click();
  await expect(page.getByTestId('screen-today')).toBeVisible();
  expect((await calls(page)).map((c) => c.method)).toEqual(['completeOnboarding']);
});

test('in four steps Continue saves the times first and the flow ends with the same times', async ({ page }) => {
  await openKeyFlow(page);
  await spyOn(page, ['updateSettings', 'completeOnboarding']);
  await toReminders(page);
  await field(page, 'First reminder').fill('15:30');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Skip for now', exact: true }).click();
  await expect(page.getByTestId('screen-today')).toBeVisible();
  expect(await calls(page)).toEqual([
    {
      method: 'updateSettings',
      input: { firstReminderTime: '15:30', eveningReminderTime: '21:00' },
    },
    {
      method: 'completeOnboarding',
      input: { firstReminderTime: '15:30', eveningReminderTime: '21:00' },
    },
  ]);
});

test('in four steps a refused time stays on step 3 with its message', async ({ page }) => {
  await openKeyFlow(page);
  await spyOn(page, ['updateSettings', 'completeOnboarding'], {
    updateSettings: 'Nope, not that time',
  });
  await toReminders(page);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('alert')).toHaveText('Nope, not that time');
  await expect(page.getByTestId('onboarding-step')).toHaveText('Step 3 of 4');
  await expect(page.getByRole('heading', { name: 'Want learning plans?' })).toHaveCount(0);
});

test('in four steps Skip on step 3 finishes the whole flow', async ({ page }) => {
  await openKeyFlow(page);
  await spyOn(page, ['updateSettings', 'completeOnboarding']);
  await toReminders(page);
  await skipTop(page).click();
  await expect(page.getByTestId('screen-today')).toBeVisible();
  expect((await calls(page)).map((c) => c.method)).toEqual(['completeOnboarding']);
});

/** Makes a bridge method fail on its first call only; later calls run for real. */
async function failOnce(page: Page, method: string, message: string): Promise<void> {
  await page.evaluate(
    ({ method: name, message: text }) => {
      const host = globalThis as unknown as {
        paraleet: Record<string, (input: unknown) => Promise<unknown>>;
        __calls: { method: string; input: unknown }[];
      };
      const original = host.paraleet[name]!;
      host.__calls ??= [];
      let failed = false;
      host.paraleet[name] = async (input: unknown) => {
        host.__calls.push({ method: name, input });
        if (!failed) {
          failed = true;
          throw new Error(text);
        }
        return original(input);
      };
    },
    { method, message },
  );
}

const count = async (page: Page, method: string): Promise<number> =>
  (await calls(page)).filter((c) => c.method === method).length;

for (const [label, press] of [
  ['Skip for now', (page: Page) => page.getByRole('button', { name: 'Skip for now', exact: true }).click()],
  ['the small Skip at the top right', (page: Page) => skipTop(page).click()],
] as const) {
  test(`a failed finish on step 4 says so, and ${label} works when pressed again`, async ({ page }) => {
    await openKeyFlow(page);
    await toKey(page);
    await failOnce(page, 'completeOnboarding', 'The database is locked');
    await press(page);
    await expect(page.getByRole('alert')).toHaveText('The database is locked');
    await expect(page.getByTestId('onboarding-step')).toHaveText('Step 4 of 4');
    await expect(page.getByRole('button', { name: 'Skip for now', exact: true })).toBeEnabled();
    await expect(skipTop(page)).toBeEnabled();
    if (label === 'Skip for now') await captureBothSizes(page, 'onboarding-4-finish-failed');
    await press(page);
    await expect(page.getByTestId('screen-today')).toBeVisible();
    expect(await count(page, 'completeOnboarding')).toBe(2);
  });
}

test('step 4 puts focus in the key field when it appears', async ({ page }) => {
  await openKeyFlow(page);
  await toKey(page);
  await expect(keyField(page)).toBeFocused();
});

test('after a refused key, focus is back in the key field', async ({ page }) => {
  await openKeyFlow(page);
  await toKey(page);
  await spyOn(page, ['saveApiKey'], { saveApiKey: 'That does not look like an API key.' });
  await keyField(page).fill(SECRET);
  await keyField(page).press('Enter');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(keyField(page)).toBeEnabled();
  await expect(keyField(page)).toBeFocused();
});

test('a saved key whose finish failed says it is saved, and Try again never saves it twice', async ({ page }) => {
  await openKeyFlow(page);
  await toKey(page);
  await spyOn(page, ['saveApiKey']);
  await failOnce(page, 'completeOnboarding', 'The database is locked');
  await keyField(page).fill(SECRET);
  await page.getByRole('button', { name: 'Save key', exact: true }).click();
  await expect(page.getByText('Your key is saved.')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveText('The database is locked');
  await expect(keyField(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save key', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeFocused();
  expect(await page.content()).not.toContain(SECRET);
  await captureBothSizes(page, 'onboarding-4-key-saved-finish-failed');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByTestId('screen-today')).toBeVisible();
  expect(await count(page, 'saveApiKey')).toBe(1);
  expect(await count(page, 'completeOnboarding')).toBe(2);
  expect(await hasKey(page)).toBe(true);
});

test('a saved key whose finish failed can still be skipped from the top right', async ({ page }) => {
  await openKeyFlow(page);
  await toKey(page);
  await spyOn(page, ['saveApiKey']);
  await failOnce(page, 'completeOnboarding', 'The database is locked');
  await keyField(page).fill(SECRET);
  await keyField(page).press('Enter');
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
  await skipTop(page).click();
  await expect(page.getByTestId('screen-today')).toBeVisible();
  expect(await count(page, 'saveApiKey')).toBe(1);
});

test('a key over 300 characters is refused in the page, without being sent or cleared', async ({ page }) => {
  await openKeyFlow(page);
  await toKey(page);
  await spyOn(page, ['saveApiKey', 'completeOnboarding']);
  const long = 'k'.repeat(301);
  await keyField(page).fill(long);
  await page.getByRole('button', { name: 'Save key', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('That is too long to be an API key.');
  await expect(keyField(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(keyField(page)).toHaveValue(long);
  expect(await page.getByRole('alert').innerText()).not.toContain('kkkk');
  expect(await calls(page)).toEqual([]);
  // Exactly 300 is allowed.
  await keyField(page).fill('k'.repeat(300));
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save key', exact: true }).click();
  await expect(page.getByTestId('screen-today')).toBeVisible();
  expect(await count(page, 'saveApiKey')).toBe(1);
});

test('step 4 fits the minimum window without scrolling in every state', async ({ page }) => {
  await page.setViewportSize(WINDOW_MIN);
  await openKeyFlow(page);
  await toKey(page);
  const fits = async (): Promise<void> => {
    const sizes = await page.evaluate<{
      sh: number;
      ih: number;
      sw: number;
      iw: number;
      top: number;
      bottom: number;
    }>(`({
      sh: document.documentElement.scrollHeight,
      ih: window.innerHeight,
      sw: document.documentElement.scrollWidth,
      iw: window.innerWidth,
      top: Math.min(...[...document.querySelectorAll('[data-testid="onboarding"] :is(button, input, h1, p)')].map((el) => el.getBoundingClientRect().top)),
      bottom: Math.max(...[...document.querySelectorAll('[data-testid="onboarding"] :is(button, input, h1, p)')].map((el) => el.getBoundingClientRect().bottom)),
    })`);
    expect(sizes.sh).toBeLessThanOrEqual(sizes.ih);
    expect(sizes.sw).toBeLessThanOrEqual(sizes.iw);
    expect(sizes.top).toBeGreaterThanOrEqual(0);
    expect(sizes.bottom).toBeLessThanOrEqual(sizes.ih);
  };
  await fits();
  // Too long.
  await keyField(page).fill('k'.repeat(301));
  await page.getByRole('button', { name: 'Save key', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await fits();
  // Refused by main.
  await page.evaluate(
    `globalThis.paraleet.saveApiKey = async () => { throw new Error('Anthropic did not accept that key. Check it and try again.'); }`,
  );
  await keyField(page).fill(SECRET);
  await page.getByRole('button', { name: 'Save key', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Anthropic did not accept');
  await fits();
  // A failed finish with no key saved.
  await failOnce(page, 'completeOnboarding', 'The database is locked. Close other copies of the app and try again.');
  await page.getByRole('button', { name: 'Skip for now', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('The database is locked');
  await fits();
});

test('step 4 with a saved key and a failed finish fits the minimum window', async ({ page }) => {
  await page.setViewportSize(WINDOW_MIN);
  await openKeyFlow(page);
  await toKey(page);
  await failOnce(page, 'completeOnboarding', 'The database is locked. Close other copies of the app and try again.');
  await keyField(page).fill(SECRET);
  await keyField(page).press('Enter');
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
  const sizes = await page.evaluate<{ sh: number; ih: number; bottom: number }>(`({
    sh: document.documentElement.scrollHeight,
    ih: window.innerHeight,
    bottom: Math.max(...[...document.querySelectorAll('[data-testid="onboarding"] :is(button, h1, p)')].map((el) => el.getBoundingClientRect().bottom)),
  })`);
  expect(sizes.sh).toBeLessThanOrEqual(sizes.ih);
  expect(sizes.bottom).toBeLessThanOrEqual(sizes.ih);
});
