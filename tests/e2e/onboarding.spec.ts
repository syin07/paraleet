import { expect, test } from '@playwright/test';
import { launchApp, makeUserDataDir, type RunningApp } from './launch';

// PRD section 11, "First launch": hatch the egg, meet Para, pick reminder times. The floating pet
// waits until it is done, then shows up by itself.
test('the first launch walks through the flow, then the pet appears and it never shows again', async () => {
  const data = makeUserDataDir();
  let running: RunningApp | null = null;
  try {
    running = await launchApp({ userDataDir: data.dir, now: '2026-11-25T20:00:00.000Z', hatched: false });
    let page = running.page;
    await expect(page.getByTestId('onboarding')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);

    // No floating pet yet; the menu bar icon is there.
    expect((await running.pet()).exists).toBe(false);
    expect((await running.tray()).exists).toBe(true);

    await page.getByRole('button', { name: 'Hatch', exact: true }).click();
    await expect(page.getByText("Hi! I'm Para. Feed me one problem a day.")).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Nice to meet you' }).click();
    await expect(page.getByLabel('First reminder')).toHaveValue('16:00');
    // Still no pet while the flow is open.
    expect((await running.pet()).exists).toBe(false);
    await page.getByLabel('First reminder').fill('15:30');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByTestId('screen-today')).toBeVisible();
    await expect(page.getByTestId('onboarding')).toHaveCount(0);
    const pet = await running.petPage();
    await expect(pet.getByTestId('pet-bird')).toBeVisible();
    await expect.poll(async () => (await running?.pet())?.visible).toBe(true);

    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByLabel('First reminder')).toHaveValue('15:30');
    await expect(page.getByLabel('Evening reminder')).toHaveValue('21:00');
    await running.close();
    running = null;

    // Another launch (still told not to hatch): the flow is gone for good and the pet is there.
    running = await launchApp({ userDataDir: data.dir, now: '2026-11-25T20:00:00.000Z', hatched: false });
    page = running.page;
    await expect(page.getByTestId('screen-today')).toBeVisible();
    await expect(page.getByTestId('onboarding')).toHaveCount(0);
    await running.petPage();
    await expect.poll(async () => (await running?.pet())?.visible).toBe(true);
  } finally {
    await running?.close().catch(() => undefined);
    data.remove();
  }
});

test('someone who has already hatched never sees the flow', async () => {
  const data = makeUserDataDir();
  let running: RunningApp | null = null;
  try {
    running = await launchApp({ userDataDir: data.dir, now: '2026-11-25T20:00:00.000Z' });
    await expect(running.page.getByTestId('screen-today')).toBeVisible();
    await expect(running.page.getByTestId('onboarding')).toHaveCount(0);
    await running.petPage();
  } finally {
    await running?.close().catch(() => undefined);
    data.remove();
  }
});
