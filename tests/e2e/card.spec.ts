import { expect, test } from '@playwright/test';
import { launchApp, makeUserDataDir, type RunningApp } from './launch';

// PRD section 12, M2: "Menu bar icon with mood and streak; compact card from both entry points".
// The page's own states are covered in detail by tests/ui/card.spec.ts; this is the real app.
test('the card opens from the menu bar icon, feeds Para, and closes by itself; the pet opens it too', async () => {
  const data = makeUserDataDir();
  let running: RunningApp | null = null;
  try {
    running = await launchApp({ userDataDir: data.dir, now: '2026-11-25T20:00:00.000Z' });
    const main = running.page;
    await expect(main.getByTestId('today-title')).toHaveText('1. Two Sum');
    const pet = await running.petPage();

    // From the menu bar icon: today's problem, and a window exactly as tall as the panel.
    await running.clickTray();
    const card = await running.cardPage();
    await expect(card.getByTestId('card-title')).toHaveText('1. Two Sum');
    await expect(card.getByTestId('card')).toContainText('LeetCode');
    await expect.poll(async () => (await running?.card())?.visible).toBe(true);
    const panelHeight = (): Promise<number> =>
      card.getByTestId('card').evaluate((element) => Math.ceil(element.getBoundingClientRect().height));
    await expect.poll(async () => (await running?.card())?.bounds?.height).toBe(await panelHeight());
    expect((await running.card()).bounds?.width).toBe(320);
    expect((await running.card()).anchor).toBe('tray');

    // "I solved it" turns it into the report form, 360 wide.
    await card.getByRole('button', { name: 'I solved it' }).click();
    await expect(card.getByRole('radiogroup', { name: 'Rating' })).toBeVisible();
    await expect.poll(async () => (await running?.card())?.bounds?.width).toBe(360);
    await expect.poll(async () => (await running?.card())?.bounds?.height).toBe(await panelHeight());

    // Rate Good, feed Para: the card says so, and closes by itself.
    await card.getByRole('radio', { name: /^Good/ }).click();
    await card.getByRole('button', { name: 'Feed Para' }).click();
    await expect(card.getByTestId('card-confirmation')).toContainText('Para ate! 1-day streak');
    await expect.poll(async () => (await running?.card())?.exists, { timeout: 8000 }).toBe(false);

    // The main window's Today shows Para fed, and the menu bar shows the streak.
    await expect(main.getByRole('button', { name: 'Log another' })).toBeVisible();
    await expect.poll(async () => (await running?.tray())?.title).toBe(' 1');

    // A real click on the bird opens the card beside it, in the fed state.
    await running.setNow('2026-11-25T20:00:10.000Z');
    await pet.getByTestId('pet-bird').click();
    const fromPet = await running.cardPage();
    await expect(fromPet.getByTestId('card-fed')).toHaveText('Fed for today');
    await expect.poll(async () => (await running?.card())?.visible).toBe(true);
    expect((await running.card()).anchor).toBe('pet');

    // Clicking it again closes the card.
    await new Promise((resolve) => setTimeout(resolve, 600));
    await pet.getByTestId('pet-bird').click();
    await expect.poll(async () => (await running?.card())?.exists).toBe(false);

    // "Open ParaLeet" closes the card and leaves the main window open.
    await new Promise((resolve) => setTimeout(resolve, 600));
    await pet.getByTestId('pet-bird').click();
    const again = await running.cardPage();
    await expect.poll(async () => (await running?.card())?.visible).toBe(true);
    await again.getByRole('button', { name: 'Open ParaLeet' }).click();
    await expect.poll(async () => (await running?.card())?.exists).toBe(false);
    expect(await running.mainWindowOpen()).toBe(true);
  } finally {
    await running?.close().catch(() => undefined);
    data.remove();
  }
});

test("the card's Swap opens the swap choices in the main window and closes the card", async () => {
  const data = makeUserDataDir();
  let running: RunningApp | null = null;
  try {
    running = await launchApp({ userDataDir: data.dir, now: '2026-11-25T20:00:00.000Z' });
    const main = running.page;
    await expect(main.getByTestId('today-title')).toHaveText('1. Two Sum');
    // Somewhere else in the main window first, so landing on Today is the card's doing.
    await main.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Settings' }).click();

    await running.clickTray();
    const card = await running.cardPage();
    await expect.poll(async () => (await running?.card())?.visible).toBe(true);
    await card.getByRole('button', { name: 'Swap' }).click();

    await expect(main.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    await expect(main.getByRole('dialog')).toContainText('swap');
    await expect.poll(async () => (await running?.card())?.exists).toBe(false);
  } finally {
    await running?.close().catch(() => undefined);
    data.remove();
  }
});
