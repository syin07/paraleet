import { expect, test, type Page } from '@playwright/test';
import { launchApp, makeUserDataDir, type RunningApp } from './launch';

// The pet page asks main to move the window through the bridge, exactly as a drag does.
async function dragPetBy(pet: Page, dx: number, dy: number): Promise<void> {
  await pet.evaluate(
    async ([x, y]) => {
      const api = (
        globalThis as unknown as {
          paraleet: { movePetWindowBy(input: object): Promise<unknown>; endPetDrag(): Promise<unknown> };
        }
      ).paraleet;
      await api.movePetWindowBy({ dx: x, dy: y });
      await api.endPetDrag();
    },
    [dx, dy] as const,
  );
}

// PRD section 12, M2: "Floating pet window: transparent, always on top, draggable, position remembered".
test('the pet window floats, stays out of the way, and remembers where it was put', async () => {
  const data = makeUserDataDir();
  let running: RunningApp | null = null;
  try {
    running = await launchApp({ userDataDir: data.dir, now: '2026-11-25T20:00:00.000Z' });
    const pet = await running.petPage();
    await expect(pet.getByTestId('pet-bird')).toBeVisible();

    // It floats over everything, on every desktop, and never takes keyboard focus.
    const facts = await running.pet();
    expect(facts).toMatchObject({
      exists: true,
      visible: true,
      alwaysOnTop: true,
      onAllWorkspaces: true,
      focusable: false,
      focused: false,
    });
    expect(facts.bounds).toMatchObject({ width: 240, height: 280 });

    // The page itself is transparent: only the bird is drawn.
    const background = await pet.evaluate(() => {
      const page = globalThis as unknown as {
        document: { body: unknown };
        getComputedStyle(element: unknown): { backgroundColor: string };
      };
      return page.getComputedStyle(page.document.body).backgroundColor;
    });
    expect(background).toBe('rgba(0, 0, 0, 0)');

    // And the real window is see-through: its corners have no pixels at all, the bird does.
    const drawn = await running.app.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isFocusable());
      if (!window) return null;
      const image = await window.webContents.capturePage();
      const { width, height } = image.getSize();
      const bitmap = image.toBitmap();
      const alpha = (x: number, y: number): number => bitmap[(y * width + x) * 4 + 3] ?? -1;
      const scale = width / 240;
      let solid = 0;
      // The bird's box: 128 points wide from 56, 128 tall from 144.
      for (let y = Math.round(144 * scale); y < Math.round(272 * scale); y += 1) {
        for (let x = Math.round(56 * scale); x < Math.round(184 * scale); x += 1) {
          if (alpha(x, y) === 255) solid += 1;
        }
      }
      return {
        corners: [alpha(1, 1), alpha(width - 2, 1), alpha(1, height - 2), alpha(width - 2, height - 2)],
        birdShare: solid / (128 * 128 * scale * scale),
      };
    });
    expect(drawn?.corners).toEqual([0, 0, 0, 0]);
    // A new pet is in its egg stage: a small bird in a shell, well under half of its box.
    expect(drawn?.birdShare).toBeGreaterThan(0.08);
    expect(drawn?.birdShare).toBeLessThan(0.9);
    expect(await pet.getByRole('navigation').count()).toBe(0);

    // Clicks pass through the window, except while the pointer is over the bird.
    expect(facts.clickThrough).toBe(true);

    // Hovering shows today's problem and its platform.
    await pet.getByTestId('pet-bird').hover();
    await expect(pet.getByTestId('pet-bubble')).toContainText('Two Sum');
    await expect(pet.getByTestId('pet-bubble')).toContainText('LeetCode');
    await expect.poll(async () => (await running?.pet())?.clickThrough).toBe(false);
    await pet.mouse.move(4, 4);
    await expect.poll(async () => (await running?.pet())?.clickThrough).toBe(true);
    await expect(pet.getByTestId('pet-bubble')).toHaveCount(0);

    // Dragging moves it, and the place is remembered across a restart.
    const before = facts.bounds!;
    await dragPetBy(pet, -180, -120);
    const moved = (await running.pet()).bounds!;
    expect(moved).toMatchObject({ x: before.x - 180, y: before.y - 120 });
    await running.close();

    running = await launchApp({ userDataDir: data.dir, now: '2026-11-25T20:05:00.000Z' });
    await running.petPage();
    await expect.poll(async () => (await running?.pet())?.bounds).toMatchObject({ x: moved.x, y: moved.y });

    // Dragged far past an edge until the bird is out of view, it is pulled back so the whole
    // bird shows again on some screen.
    const birdOnAScreen = async (): Promise<boolean> => {
      const bounds = (await running!.pet()).bounds!;
      const areas = await running!.app.evaluate(({ screen }) => screen.getAllDisplays().map((d) => d.workArea));
      // The bird is drawn from 56 to 184 points across and 144 to 272 down the 240×280 window.
      const bird = { left: bounds.x + 56, right: bounds.x + 184, top: bounds.y + 144, bottom: bounds.y + 272 };
      return areas.some(
        (area) =>
          bird.left >= area.x &&
          bird.right <= area.x + area.width &&
          bird.top >= area.y &&
          bird.bottom <= area.y + area.height,
      );
    };
    const edgePet = await running.petPage();
    for (let step = 0; step < 8; step += 1) {
      await edgePet.evaluate(async () => {
        const api = (globalThis as unknown as { paraleet: { movePetWindowBy(input: object): Promise<unknown> } })
          .paraleet;
        await api.movePetWindowBy({ dx: 3900, dy: 0 });
      });
    }
    expect(await birdOnAScreen()).toBe(false);
    await dragPetBy(edgePet, 0, 0);
    expect(await birdOnAScreen()).toBe(true);
    const rescued = (await running.pet()).bounds!;
    expect(rescued.y).toBe(moved.y);

    // And that rescued place is what the next launch uses.
    await running.close();
    running = await launchApp({ userDataDir: data.dir, now: '2026-11-25T20:10:00.000Z' });
    await running.petPage();
    await expect.poll(async () => (await running?.pet())?.bounds).toMatchObject({ x: rescued.x, y: rescued.y });

    // A saved place that is on no screen at all (its display was unplugged) is not used as it is:
    // at the next launch Para is back on a visible screen.
    const lastPet = await running.petPage();
    await lastPet.evaluate(() =>
      (
        globalThis as unknown as { paraleet: { updateSettings(patch: object): Promise<unknown> } }
      ).paraleet.updateSettings({ petWindowPosition: { x: 99999, y: 99999 } }),
    );
    await running.close();
    running = await launchApp({ userDataDir: data.dir, now: '2026-11-25T20:15:00.000Z' });
    await running.petPage();
    await expect.poll(birdOnAScreen).toBe(true);
    expect((await running.pet()).visible).toBe(true);
  } finally {
    await running?.close().catch(() => undefined);
    data.remove();
  }
});

test('the pet opens the main window, offers its menu, and can be hidden', async () => {
  const data = makeUserDataDir();
  let running: RunningApp | null = null;
  try {
    running = await launchApp({ userDataDir: data.dir, now: '2026-11-25T20:00:00.000Z' });
    const pet = await running.petPage();
    const main = running.page;
    await expect(main.getByTestId('today-title')).toHaveText('1. Two Sum');

    expect(await running.petMenuLabels()).toEqual([
      'Open ParaLeet',
      "Swap today's problem…",
      'separator',
      'Hide Para for 1 hour',
      'Settings…',
      'separator',
      'Quit ParaLeet',
    ]);

    // "Settings…" takes the open main window to Settings.
    await running.clickPetMenu('Settings…');
    await expect(main.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();

    // "Swap today's problem…" goes to Today with the swap choices open.
    await running.clickPetMenu("Swap today's problem…");
    await expect(main.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    await expect(main.getByRole('dialog')).toContainText('Nothing to swap to right now.');
    await main.keyboard.press('Escape');

    // After a report the bubble shows the fed state without the pet window being reloaded.
    await main.getByRole('button', { name: 'I solved it' }).click();
    await main.getByRole('radio', { name: /^Good/ }).click();
    await main.getByRole('button', { name: 'Feed Para' }).click();
    // Para checks the report and eats, speaking without being hovered; the test clock is moved by
    // hand, so each step waits for it.
    const bubble = pet.getByTestId('pet-bubble');
    await expect(bubble).toHaveAttribute('data-mood', 'checking');
    await running.setNow('2026-11-25T20:00:02.500Z');
    await expect(bubble).toHaveAttribute('data-mood', 'eating');
    await running.setNow('2026-11-25T20:00:06.000Z');
    await expect(bubble).toHaveCount(0);
    await pet.getByTestId('pet-bird').hover();
    await expect(bubble).toHaveAttribute('data-mood', 'content');
    await expect(bubble).toContainText('1-day streak');

    // Closing the main window leaves Para running, with no Dock icon while only the pet shows.
    expect(await running.dockVisible()).toBe(true);
    await main.close();
    await expect.poll(() => running?.mainWindowOpen()).toBe(false);
    expect((await running.pet()).visible).toBe(true);
    await expect.poll(() => running?.dockVisible()).toBe(false);
    // Hiding the Dock icon must not take the pet with it.
    expect(await running.pet()).toMatchObject({ visible: true, alwaysOnTop: true, onAllWorkspaces: true });

    // A click on the bird brings the main window back.
    await pet.getByTestId('pet-bird').click();
    await expect.poll(() => running?.mainWindowOpen()).toBe(true);
    await expect.poll(() => running?.dockVisible()).toBe(true);

    // "Show Para on the desktop" in Settings hides it and brings it back.
    const reopened = running.page.context().pages().find((page) => !/#\/pet\b/.test(page.url()) && !page.isClosed());
    expect(reopened).toBeDefined();
    const setPetVisible = (visible: boolean): Promise<unknown> =>
      pet.evaluate(
        (value) =>
          (
            globalThis as unknown as { paraleet: { updateSettings(patch: object): Promise<unknown> } }
          ).paraleet.updateSettings({ petVisible: value }),
        visible,
      );
    await setPetVisible(false);
    await expect.poll(async () => (await running?.pet())?.visible).toBe(false);
    await setPetVisible(true);
    await expect.poll(async () => (await running?.pet())?.visible).toBe(true);

    // Hidden for an hour, switching the setting off and on again brings Para straight back.
    await running.clickPetMenu('Hide Para for 1 hour');
    await expect.poll(async () => (await running?.pet())?.visible).toBe(false);
    await setPetVisible(false);
    await setPetVisible(true);
    await expect.poll(async () => (await running?.pet())?.visible).toBe(true);

    // "Hide Para for 1 hour" hides it, and it returns by itself an hour later.
    await running.clickPetMenu('Hide Para for 1 hour');
    await expect.poll(async () => (await running?.pet())?.visible).toBe(false);
    await running.setNow('2026-11-25T20:59:00.000Z');
    expect((await running.pet()).visible).toBe(false);
    await running.setNow('2026-11-25T21:01:00.000Z');
    await expect.poll(async () => (await running?.pet())?.visible).toBe(true);
  } finally {
    await running?.close().catch(() => undefined);
    data.remove();
  }
});
