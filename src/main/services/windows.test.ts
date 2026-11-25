import { afterEach, describe, expect, it } from 'vitest';
import { inputSchemas } from '../../bridge/contract';
import { createTestApp, type TestApp } from './testing';

let app: TestApp | null = null;
afterEach(() => {
  app?.close();
  app = null;
});

describe('window commands', () => {
  it('pass through to the window port and change no data', () => {
    app = createTestApp();
    expect(app.handlers.showMainWindow({ screen: null })).toEqual({ ok: true });
    expect(app.handlers.showMainWindow({ screen: 'settings' })).toEqual({ ok: true });
    expect(app.handlers.movePetWindowBy({ dx: 12, dy: -7 })).toEqual({ ok: true });
    expect(app.handlers.endPetDrag(undefined)).toEqual({ ok: true });
    expect(app.handlers.setPetInteractive({ interactive: true })).toEqual({ ok: true });
    expect(app.handlers.showPetMenu(undefined)).toEqual({ ok: true });
    expect(app.handlers.showCard({ anchor: 'pet' })).toEqual({ ok: true });
    expect(app.handlers.showCard({ anchor: 'tray' })).toEqual({ ok: true });
    expect(app.handlers.setCardSize({ width: 360, height: 480 })).toEqual({ ok: true });
    expect(app.handlers.hideCard(undefined)).toEqual({ ok: true });
    expect(app.windowCalls).toEqual([
      'showMain:',
      'showMain:settings',
      'movePetBy:12,-7',
      'endPetDrag',
      'setPetInteractive:true',
      'showPetMenu',
      'showCard:pet',
      'showCard:tray',
      'setCardSize:360x480',
      'hideCard',
    ]);
    // Moving a window is not a data change: no window is told to reload.
    expect(app.changes()).toBe(0);
  });
});

describe('window command inputs', () => {
  it('accept only whole, bounded moves', () => {
    const schema = inputSchemas.movePetWindowBy;
    expect(schema.safeParse({ dx: 3, dy: -4 }).success).toBe(true);
    expect(schema.safeParse({ dx: 4000, dy: -4000 }).success).toBe(true);
    for (const bad of [
      { dx: 0.5, dy: 0 },
      { dx: 4001, dy: 0 },
      { dx: 0, dy: -4001 },
      { dx: Number.NaN, dy: 0 },
      { dx: Number.POSITIVE_INFINITY, dy: 0 },
      { dx: '3', dy: 0 },
      { dx: 3 },
      {},
    ]) {
      expect(schema.safeParse(bad).success).toBe(false);
    }
  });

  it('accept only the main window\'s own screens', () => {
    const schema = inputSchemas.showMainWindow;
    for (const screen of ['today', 'problems', 'plan', 'stats', 'settings', null]) {
      expect(schema.safeParse({ screen }).success).toBe(true);
    }
    for (const bad of [{ screen: 'pet' }, { screen: 'https://example.com' }, { screen: '../x' }, {}, undefined]) {
      expect(schema.safeParse(bad).success).toBe(false);
    }
  });

  it('take a plain yes or no for click-through', () => {
    expect(inputSchemas.setPetInteractive.safeParse({ interactive: false }).success).toBe(true);
    expect(inputSchemas.setPetInteractive.safeParse({ interactive: 'yes' }).success).toBe(false);
    expect(inputSchemas.endPetDrag.safeParse(undefined).success).toBe(true);
    expect(inputSchemas.showPetMenu.safeParse({ anything: 1 }).success).toBe(false);
  });
});

describe('compact card inputs', () => {
  it('accept only the two anchors and the two widths, within the height limits', () => {
    expect(inputSchemas.showCard.safeParse({ anchor: 'pet' }).success).toBe(true);
    expect(inputSchemas.showCard.safeParse({ anchor: 'tray' }).success).toBe(true);
    expect(inputSchemas.showCard.safeParse({ anchor: 'main' }).success).toBe(false);
    expect(inputSchemas.showCard.safeParse({}).success).toBe(false);
    for (const good of [
      { width: 320, height: 120 },
      { width: 360, height: 640 },
    ]) {
      expect(inputSchemas.setCardSize.safeParse(good).success).toBe(true);
    }
    for (const bad of [
      { width: 300, height: 200 },
      { width: 320, height: 119 },
      { width: 320, height: 641 },
      { width: 320, height: 200.5 },
      { width: 320 },
    ]) {
      expect(inputSchemas.setCardSize.safeParse(bad).success).toBe(false);
    }
  });
});

describe('finishing the first-launch flow', () => {
  it('hatches Para, saves the reminder times and tells the windows', async () => {
    app = createTestApp();
    expect((await app.handlers.getToday(undefined)).pet.hatched).toBe(false);
    const changes = app.changes();
    const today = await app.handlers.completeOnboarding({ firstReminderTime: '15:30', eveningReminderTime: '20:45' });
    expect(today.pet.hatched).toBe(true);
    expect(await app.handlers.getSettings(undefined)).toMatchObject({
      firstReminderTime: '15:30',
      eveningReminderTime: '20:45',
    });
    expect(app.changes()).toBe(changes + 1);
  });

  it('keeps the first hatching time when called again', async () => {
    app = createTestApp();
    await app.handlers.completeOnboarding({ firstReminderTime: '16:00', eveningReminderTime: '21:00' });
    const first = app.db.get<{ hatched_at: string }>('SELECT hatched_at FROM pet')?.hatched_at;
    app.clock.set(new Date(app.clock.now().getTime() + 86_400_000));
    await app.handlers.completeOnboarding({ firstReminderTime: '17:00', eveningReminderTime: '22:00' });
    expect(app.db.get<{ hatched_at: string }>('SELECT hatched_at FROM pet')?.hatched_at).toBe(first);
    expect((await app.handlers.getSettings(undefined)).firstReminderTime).toBe('17:00');
  });

  it('refuses a time that is not a 24-hour time', () => {
    const schema = inputSchemas.completeOnboarding;
    expect(schema.safeParse({ firstReminderTime: '16:00', eveningReminderTime: '21:00' }).success).toBe(true);
    for (const bad of [
      { firstReminderTime: '4pm', eveningReminderTime: '21:00' },
      { firstReminderTime: '16:00', eveningReminderTime: '25:00' },
      { firstReminderTime: '16:00' },
    ]) {
      expect(schema.safeParse(bad).success).toBe(false);
    }
  });
});
