import { expect, test, type Page } from '@playwright/test';
import { captureBothSizes, WINDOW_MIN } from './screenshots';

type Host = { paraleet: { completeOnboarding: (input: unknown) => Promise<unknown> } };

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

test('every step fits the minimum window without scrolling', async ({ page }) => {
  await page.setViewportSize(WINDOW_MIN);
  await openFlow(page);
  const fits = async (): Promise<void> => {
    const sizes = await page.evaluate<{
      scrollHeight: number;
      innerHeight: number;
      scrollWidth: number;
      innerWidth: number;
      bottom: number;
    }>(`({
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      bottom: document.querySelector('[data-testid="onboarding"] button:last-of-type')?.getBoundingClientRect().bottom ?? 0,
    })`);
    expect(sizes.scrollHeight).toBeLessThanOrEqual(sizes.innerHeight);
    expect(sizes.scrollWidth).toBeLessThanOrEqual(sizes.innerWidth);
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
