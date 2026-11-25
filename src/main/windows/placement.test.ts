import { describe, expect, it } from 'vitest';
import { defaultPosition, keepOnScreen, MIN_VISIBLE, placePopover, workAreaFor, type Rect } from './placement';

const laptop: Rect = { x: 0, y: 25, width: 1728, height: 1002 };
const external: Rect = { x: 1728, y: 0, width: 2560, height: 1440 };
const size = { width: 240, height: 250 };
/** The bird: 128 wide, centred, sitting 8 points above the window's bottom edge. */
const bird: Rect = { x: 56, y: 114, width: 128, height: 128 };

describe('defaultPosition', () => {
  it('is the bottom-right corner of the usable area, inside a margin', () => {
    expect(defaultPosition(laptop, size)).toEqual({ x: 1728 - 240 - 24, y: 25 + 1002 - 250 - 24 });
    expect(defaultPosition(external, size, 0)).toEqual({ x: 1728 + 2560 - 240, y: 1440 - 250 });
  });
});

describe('keepOnScreen', () => {
  it('uses the default corner of the primary screen when nothing is remembered', () => {
    expect(keepOnScreen(null, size, [laptop, external], bird)).toEqual(defaultPosition(laptop, size));
  });

  it('keeps a remembered position that is on any screen', () => {
    expect(keepOnScreen({ x: 300, y: 300 }, size, [laptop], bird)).toEqual({ x: 300, y: 300 });
    expect(keepOnScreen({ x: 3000, y: 200 }, size, [laptop, external], bird)).toEqual({ x: 3000, y: 200 });
  });

  it('lets the transparent part of the window hang off an edge while the bird is in view', () => {
    // The window sticks out 56 points on the left; the bird's left edge is exactly at the screen edge.
    expect(keepOnScreen({ x: -56, y: 400 }, size, [laptop], bird)).toEqual({ x: -56, y: 400 });
    // The bird itself is half off the right edge, with more than the minimum still showing.
    expect(keepOnScreen({ x: 1728 - 56 - 64, y: 400 }, size, [laptop], bird)).toEqual({ x: 1608, y: 400 });
  });

  it('pulls the bird fully back into view when too little of it shows', () => {
    // Only a 40-point strip of the window is on screen and none of the bird: the shortest move
    // that shows the whole bird is to put its right edge on the screen's right edge.
    expect(keepOnScreen({ x: 1728 - 40, y: 400 }, size, [laptop], bird)).toEqual({ x: 1728 - 184, y: 400 });
    // Just under the minimum showing on the left.
    expect(keepOnScreen({ x: -56 - 128 + (MIN_VISIBLE - 1), y: 400 }, size, [laptop], bird)).toEqual({
      x: -56,
      y: 400,
    });
    // Exactly the minimum showing stays put.
    expect(keepOnScreen({ x: -56 - 128 + MIN_VISIBLE, y: 400 }, size, [laptop], bird)).toEqual({
      x: -56 - 128 + MIN_VISIBLE,
      y: 400,
    });
    // Below the bottom edge: the bird's bottom is brought to the screen's bottom.
    expect(keepOnScreen({ x: 400, y: 25 + 1002 - 120 }, size, [laptop], bird)).toEqual({
      x: 400,
      y: 25 + 1002 - 242,
    });
  });

  it('moves to the nearest screen when the remembered screen is gone', () => {
    // Was on the external display to the right; only the laptop is left.
    expect(keepOnScreen({ x: 3000, y: 200 }, size, [laptop], bird)).toEqual({ x: 1728 - 184, y: 200 });
    // Far below and to the left of everything: lands in the laptop's bottom-left corner.
    expect(keepOnScreen({ x: -5000, y: 9000 }, size, [laptop, external], bird)).toEqual({
      x: -56,
      y: 25 + 1002 - 242,
    });
    // Between two screens but nearer the external one.
    expect(keepOnScreen({ x: 2000, y: 2500 }, size, [laptop, external], bird)).toEqual({
      x: 2000,
      y: 1440 - 242,
    });
  });

  it('with no body given, judges the whole window', () => {
    expect(keepOnScreen({ x: -150, y: 400 }, size, [laptop])).toEqual({ x: -150, y: 400 });
    expect(keepOnScreen({ x: -220, y: 400 }, size, [laptop])).toEqual({ x: 0, y: 400 });
  });

  it('treats a damaged stored position as missing, and rounds fractions', () => {
    expect(keepOnScreen({ x: Number.NaN, y: 10 }, size, [laptop], bird)).toEqual(defaultPosition(laptop, size));
    expect(keepOnScreen({ x: 300.6, y: 299.4 }, size, [laptop], bird)).toEqual({ x: 301, y: 299 });
  });

  it('copes with a screen smaller than the bird and with no screens at all', () => {
    const tiny: Rect = { x: 0, y: 0, width: 100, height: 100 };
    expect(keepOnScreen({ x: 5000, y: 5000 }, size, [tiny], bird)).toEqual({ x: -56, y: -114 });
    expect(keepOnScreen({ x: 5, y: 6 }, size, [], bird)).toEqual({ x: 5, y: 6 });
    expect(keepOnScreen(null, size, [], bird)).toEqual({ x: 0, y: 0 });
  });

  it('never moves a position it has already settled', () => {
    for (const start of [
      { x: 1728 - 40, y: 400 },
      { x: 3000, y: 200 },
      { x: -5000, y: 9000 },
      { x: 300, y: 300 },
    ]) {
      const once = keepOnScreen(start, size, [laptop, external], bird);
      expect(keepOnScreen(once, size, [laptop, external], bird)).toEqual(once);
    }
  });
});

describe('placePopover', () => {
  const card = { width: 320, height: 240 };

  it('sits above its anchor, centred, when there is room', () => {
    const birdBox: Rect = { x: 800, y: 600, width: 128, height: 128 };
    expect(placePopover(birdBox, card, laptop, 'above')).toEqual({ x: 800 + 64 - 160, y: 600 - 8 - 240 });
  });

  it('goes below when it does not fit above', () => {
    const nearTop: Rect = { x: 800, y: 100, width: 128, height: 128 };
    expect(placePopover(nearTop, card, laptop, 'above')).toEqual({ x: 704, y: 100 + 128 + 8 });
  });

  it('sits under a menu bar icon, pulled in from the screen edge', () => {
    const trayIcon: Rect = { x: 1700, y: 0, width: 24, height: 24 };
    expect(placePopover(trayIcon, card, laptop, 'below')).toEqual({ x: 1728 - 320, y: 32 });
    const leftIcon: Rect = { x: 2, y: 0, width: 24, height: 24 };
    expect(placePopover(leftIcon, card, laptop, 'below', 4)).toEqual({ x: 0, y: 28 });
  });

  it('stays inside the work area even when it fits on neither side', () => {
    const tall = { width: 360, height: 640 };
    const middle: Rect = { x: 600, y: 400, width: 128, height: 128 };
    const placed = placePopover(middle, tall, laptop, 'above');
    expect(placed.y).toBeGreaterThanOrEqual(laptop.y);
    expect(placed.y + tall.height).toBeLessThanOrEqual(laptop.y + laptop.height);
    expect(placed.x).toBe(600 + 64 - 180);
  });
});

describe('workAreaFor', () => {
  it('picks the screen the rectangle is on, or the nearest', () => {
    expect(workAreaFor({ x: 100, y: 100, width: 50, height: 50 }, [laptop, external])).toBe(laptop);
    expect(workAreaFor({ x: 3000, y: 100, width: 50, height: 50 }, [laptop, external])).toBe(external);
    expect(workAreaFor({ x: 9000, y: 100, width: 50, height: 50 }, [laptop, external])).toBe(external);
    expect(workAreaFor({ x: 0, y: 0, width: 1, height: 1 }, [])).toBeNull();
  });
});
