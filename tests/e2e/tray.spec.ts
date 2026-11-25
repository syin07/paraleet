import { expect, test, type Page } from '@playwright/test';
import { launchApp, makeUserDataDir, type RunningApp } from './launch';

type Bridge = Record<string, (input?: unknown) => Promise<unknown>>;
const call = (page: Page, method: string, input?: unknown): Promise<unknown> =>
  page.evaluate(([name, value]) => (globalThis as unknown as { paraleet: Bridge }).paraleet[name as string]!(value), [
    method,
    input,
  ] as const);

async function insideSomeScreen(running: RunningApp, bounds: { x: number; y: number; width: number; height: number }) {
  const areas = await running.app.evaluate(({ screen }) => screen.getAllDisplays().map((display) => display.bounds));
  return areas.some(
    (area) =>
      bounds.x >= area.x &&
      bounds.y >= area.y &&
      bounds.x + bounds.width <= area.x + area.width &&
      bounds.y + bounds.height <= area.y + area.height,
  );
}

// PRD section 12, M2: "Menu bar icon with mood and streak; compact card from both entry points".
test('the menu bar icon shows the mood and the streak', async () => {
  const data = makeUserDataDir();
  let running: RunningApp | null = null;
  try {
    // Noon in the test's zone: not fed, before the first reminder.
    running = await launchApp({ userDataDir: data.dir, now: '2026-11-25T20:00:00.000Z' });
    const main = running.page;
    await expect(main.getByTestId('today-title')).toHaveText('1. Two Sum');
    const asleep = await running.tray();
    expect(asleep).toMatchObject({ exists: true, title: '', tooltip: 'Para is asleep' });

    // The first reminder time passes: the icon's expression changes with the mood.
    await running.setNow('2026-11-26T00:05:00.000Z');
    await expect.poll(async () => (await running?.tray())?.tooltip).toBe('Para is peckish');
    expect((await running.tray()).key).not.toBe(asleep.key);

    // A report: the streak appears beside the icon, and the icon follows the celebration.
    await main.getByRole('button', { name: 'I solved it' }).click();
    await main.getByRole('radio', { name: /^Good/ }).click();
    await main.getByRole('button', { name: 'Feed Para' }).click();
    await expect.poll(async () => (await running?.tray())?.title).toBe(' 1');
    expect((await running.tray()).tooltip).toBe('Para is checking your report · 1-day streak');
    await running.setNow('2026-11-26T00:05:03.000Z');
    await expect.poll(async () => (await running?.tray())?.tooltip).toBe('Para is eating · 1-day streak');
    await running.setNow('2026-11-26T00:05:10.000Z');
    await expect.poll(async () => (await running?.tray())?.tooltip).toBe('Para is content · 1-day streak');

    // The streak is still there after a restart.
    await running.close();
    running = await launchApp({ userDataDir: data.dir, now: '2026-11-26T00:10:00.000Z' });
    expect(await running.tray()).toMatchObject({
      exists: true,
      title: ' 1',
      tooltip: 'Para is content · 1-day streak',
    });
  } finally {
    await running?.close().catch(() => undefined);
    data.remove();
  }
});

test('the menu bar icon opens the compact card and offers a menu', async () => {
  const data = makeUserDataDir();
  let running: RunningApp | null = null;
  try {
    running = await launchApp({ userDataDir: data.dir, now: '2026-11-25T20:00:00.000Z' });
    await running.petPage();
    expect((await running.card()).exists).toBe(false);

    // A click opens the card under the icon, on a screen, 320 points wide.
    await running.clickTray();
    const card = await running.cardPage();
    await expect(card.getByTestId('card')).toBeVisible();
    await expect.poll(async () => (await running?.card())?.visible).toBe(true);
    const shown = await running.card();
    expect(shown.anchor).toBe('tray');
    expect(shown.bounds?.width).toBe(320);
    expect(await insideSomeScreen(running, shown.bounds!)).toBe(true);
    // Its page is see-through around the panel.
    expect(
      await card.evaluate(() => {
        const view = globalThis as unknown as {
          document: { body: unknown };
          getComputedStyle(element: unknown): { backgroundColor: string };
        };
        return view.getComputedStyle(view.document.body).backgroundColor;
      }),
    ).toBe('rgba(0, 0, 0, 0)');

    // The page tells the window how much room it needs.
    await call(card, 'setCardSize', { width: 360, height: 420 });
    await expect.poll(async () => (await running?.card())?.bounds).toMatchObject({ width: 360, height: 420 });
    expect(await insideSomeScreen(running, (await running.card()).bounds!)).toBe(true);

    // Opening the card leaves the Dock icon alone: the main window is open, so it stays.
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(await running.dockVisible()).toBe(true);

    // A second click on the icon closes it.
    await running.clickTray();
    await expect.poll(async () => (await running?.card())?.exists).toBe(false);

    // Clicking anywhere else closes it too: the card goes away when it loses focus.
    await running.clickTray();
    await expect.poll(async () => (await running?.card())?.visible).toBe(true);
    await running.blurCard();
    await expect.poll(async () => (await running?.card())?.exists).toBe(false);
    // A click on the icon while the card is open takes the card's focus first and reaches the app
    // second. That click meant "close": the card must not pop straight back open.
    await new Promise((resolve) => setTimeout(resolve, 500));
    await running.clickTray();
    await expect.poll(async () => (await running?.card())?.visible).toBe(true);
    await running.blurCard();
    await running.clickTray();
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect((await running.card()).exists).toBe(false);
    // The next click, a moment later, opens it as usual.
    await running.clickTray();
    await expect.poll(async () => (await running?.card())?.visible).toBe(true);
    await running.clickTray();
    await expect.poll(async () => (await running?.card())?.exists).toBe(false);

    // But losing focus before it has even appeared does not kill it: it still opens.
    await new Promise((resolve) => setTimeout(resolve, 500));
    await running.blurCard(true);
    await expect.poll(async () => (await running?.card())?.visible).toBe(true);
    await running.clickTray();
    await expect.poll(async () => (await running?.card())?.exists).toBe(false);

    // From the pet it opens beside the bird, and the page can close it.
    const pet = await running.petPage();
    await call(pet, 'showCard', { anchor: 'pet' });
    const fromPet = await running.cardPage();
    await expect.poll(async () => (await running?.card())?.visible).toBe(true);
    const beside = await running.card();
    expect(beside.anchor).toBe('pet');
    const bird = (await running.pet()).bounds!;
    // Above the bird when there is room (the bird starts 144 points down its window), otherwise below.
    const birdTop = bird.y + 144;
    const birdBottom = bird.y + 272;
    expect(beside.bounds!.y + beside.bounds!.height <= birdTop || beside.bounds!.y >= birdBottom).toBe(true);
    // The card closes its own window a moment after it answers. Under load the window can be
    // gone before the test driver hears the answer; that is the close this step asks for, and the
    // next line is what checks it.
    await call(fromPet, 'hideCard').catch((error: unknown) => {
      if (!/has been closed/.test(String(error))) throw error;
    });
    await expect.poll(async () => (await running?.card())?.exists).toBe(false);

    // Opening it from the other place moves it there instead of closing it.
    await running.clickTray();
    await expect.poll(async () => (await running?.card())?.anchor).toBe('tray');
    await call(pet, 'showCard', { anchor: 'pet' });
    await expect.poll(async () => (await running?.card())?.anchor).toBe('pet');
    await call(pet, 'showCard', { anchor: 'pet' });
    await expect.poll(async () => (await running?.card())?.exists).toBe(false);

    // The right-click menu.
    expect(await running.trayMenuLabels()).toEqual([
      'Open ParaLeet',
      "Swap today's problem…",
      'separator',
      'Hide Para from the desktop',
      'Settings…',
      'separator',
      'Quit ParaLeet',
    ]);
    await running.clickTrayMenu('Hide Para from the desktop');
    await expect.poll(async () => (await running?.pet())?.visible).toBe(false);
    expect(await running.trayMenuLabels()).toContain('Show Para on the desktop');
    // With Para hidden the icon still carries the card.
    await running.clickTray();
    await expect.poll(async () => (await running?.card())?.visible).toBe(true);
    expect((await running.card()).anchor).toBe('tray');
    await running.clickTray();

    // Para hidden and the main window closed: the Dock icon is the sure way back in, and opening
    // and closing the card must not take it away.
    await running.page.close();
    await expect.poll(() => running?.mainWindowOpen()).toBe(false);
    await expect.poll(() => running?.dockVisible()).toBe(true);
    await running.clickTray();
    await expect.poll(async () => (await running?.card())?.visible).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(await running.dockVisible()).toBe(true);
    await running.clickTray();
    await expect.poll(async () => (await running?.card())?.exists).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(await running.dockVisible()).toBe(true);
    await running.clickTrayMenu('Open ParaLeet');
    const reopened = await running.mainPage();
    await running.clickTrayMenu('Show Para on the desktop');
    await expect.poll(async () => (await running?.pet())?.visible).toBe(true);
    await running.clickTrayMenu('Settings…');
    await expect(reopened.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  } finally {
    await running?.close().catch(() => undefined);
    data.remove();
  }
});

// A request to show a screen must not be lost while the main window is still opening: its page
// has not loaded, so nothing in it is listening yet.
test('a screen asked for while the main window is still opening is shown', async () => {
  const data = makeUserDataDir();
  let running: RunningApp | null = null;
  try {
    running = await launchApp({ userDataDir: data.dir, now: '2026-11-25T20:00:00.000Z' });
    await expect(running.page.getByTestId('today-title')).toHaveText('1. Two Sum');
    for (const [label, heading] of [
      ['Settings…', 'Settings'],
      ["Swap today's problem…", 'Today'],
    ] as const) {
      const open = await running.mainPage();
      await open.close();
      await expect.poll(() => running?.mainWindowOpen()).toBe(false);
      // Both in one turn of the main process: the second is sent while the new window's page
      // has only just begun to load.
      await running.clickTrayMenus(['Open ParaLeet', label]);
      const reopened = await running.mainPage();
      await expect(reopened.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      if (heading === 'Today') await expect(reopened.getByRole('dialog')).toBeVisible();
    }
  } finally {
    await running?.close().catch(() => undefined);
    data.remove();
  }
});
