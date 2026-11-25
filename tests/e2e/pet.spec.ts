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
    expect(facts.bounds).toMatchObject({ width: 240, height: 250 });

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
      // The bird's box: 128 points wide from 56, 128 tall from 114.
      for (let y = Math.round(114 * scale); y < Math.round(242 * scale); y += 1) {
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
    expect(drawn?.birdShare).toBeGreaterThan(0.2);
    expect(drawn?.birdShare).toBeLessThan(0.9);
    expect(await pet.getByRole('navigation').count()).toBe(0);

    // Clicks pass through the window, except while the pointer is over the bird.
    expect(facts.clickThrough).toBe(true);

    // Hovering shows today's problem and its platform.
    await pet.getByTestId('pet-bird').hover();
    await expect(pet.getByTestId('pet-bubble')).toHaveText('1. Two Sum on LeetCode?');
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

    // Dragged past the right edge until the bird is out of view, it is pulled back so the whole
    // bird shows again (macOS itself stops the window a little short of leaving the screen).
    const edgePet = await running.petPage();
    const screenRight = await running.app.evaluate(({ screen }) => {
      const area = screen.getPrimaryDisplay().workArea;
      return area.x + area.width;
    });
    await dragPetBy(edgePet, 3900, 0);
    const rescued = (await running.pet()).bounds!;
    // The bird is drawn from 56 to 184 points across the 240-point window.
    expect(rescued.x + 184).toBeLessThanOrEqual(screenRight);
    expect(rescued.x + 184).toBeGreaterThan(screenRight - 60);
    expect(rescued.y).toBe(moved.y);

    // And that rescued place is what the next launch uses.
    await running.close();
    running = await launchApp({ userDataDir: data.dir, now: '2026-11-25T20:10:00.000Z' });
    await running.petPage();
    await expect.poll(async () => (await running?.pet())?.bounds).toMatchObject({ x: rescued.x, y: rescued.y });
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
    await pet.getByTestId('pet-bird').hover();
    await expect(pet.getByTestId('pet-bubble')).toHaveText('Fed and happy!');

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
