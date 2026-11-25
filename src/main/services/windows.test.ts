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
    expect(app.windowCalls).toEqual([
      'showMain:',
      'showMain:settings',
      'movePetBy:12,-7',
      'endPetDrag',
      'setPetInteractive:true',
      'showPetMenu',
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
