import { describe, expect, it } from 'vitest';
import { headBox, renderSprite } from '../core/sprite';
import { GROWTH_STAGES, MOODS } from '../core/types';
import { headIcon, iconKey, ICON_SCALE, streakTitle } from './trayIcon';

const base = { seed: 7, stage: 'adult', mood: 'content', accessories: [] } as const;

describe('headIcon', () => {
  it('is the head box scaled by whole pixels, at most 22 points tall', () => {
    for (const stage of GROWTH_STAGES) {
      const icon = headIcon({ ...base, stage });
      const box = headBox(stage);
      expect(icon.width).toBe(box.size * ICON_SCALE);
      expect(icon.height).toBe(icon.width);
      expect(icon.bgra.length).toBe(icon.width * icon.height * 4);
      // In points on a Retina display the icon fits the menu bar.
      expect(icon.width / ICON_SCALE).toBeLessThanOrEqual(22);
    }
  });

  it('copies the sprite pixels, with red and blue swapped and each pixel doubled', () => {
    const icon = headIcon(base);
    const frame = renderSprite(base.seed, base.stage, base.mood, 0, []);
    const box = headBox(base.stage);
    let opaque = 0;
    for (let y = 0; y < icon.height; y += 1) {
      for (let x = 0; x < icon.width; x += 1) {
        const from = ((box.y + Math.floor(y / 2)) * 32 + box.x + Math.floor(x / 2)) * 4;
        const to = (y * icon.width + x) * 4;
        const alpha = frame.pixels[from + 3];
        expect(icon.bgra[to + 3]).toBe(alpha);
        if (alpha === 255) {
          opaque += 1;
          expect([icon.bgra[to + 2], icon.bgra[to + 1], icon.bgra[to]]).toEqual([
            frame.pixels[from],
            frame.pixels[from + 1],
            frame.pixels[from + 2],
          ]);
        } else {
          expect([icon.bgra[to], icon.bgra[to + 1], icon.bgra[to + 2]]).toEqual([0, 0, 0]);
        }
      }
    }
    // A head, not an empty square and not a full one.
    expect(opaque).toBeGreaterThan(icon.width * icon.height * 0.3);
    expect(opaque).toBeLessThan(icon.width * icon.height);
  });

  it('shows the mood: sleeping and content heads differ, for every stage', () => {
    for (const stage of GROWTH_STAGES) {
      const asleep = headIcon({ ...base, stage, mood: 'sleeping' });
      const awake = headIcon({ ...base, stage, mood: 'content' });
      expect(Buffer.from(asleep.bgra).equals(Buffer.from(awake.bgra))).toBe(false);
    }
  });

  it('draws every stage and mood without an empty icon', () => {
    for (const stage of GROWTH_STAGES) {
      for (const mood of MOODS) {
        const icon = headIcon({ ...base, stage, mood, accessories: ['crown'] });
        const opaque = icon.bgra.filter((_, index) => index % 4 === 3 && icon.bgra[index] === 255).length;
        expect(opaque).toBeGreaterThan(50);
      }
    }
  });
});

describe('iconKey', () => {
  it('changes when the bird, its stage, its mood or what it wears changes, and only then', () => {
    const key = iconKey(base);
    expect(iconKey({ ...base })).toBe(key);
    expect(iconKey({ ...base, mood: 'hungry' })).not.toBe(key);
    expect(iconKey({ ...base, stage: 'chick' })).not.toBe(key);
    expect(iconKey({ ...base, seed: 8 })).not.toBe(key);
    expect(iconKey({ ...base, accessories: ['scarf'] })).not.toBe(key);
    expect(iconKey({ ...base, accessories: ['crown', 'scarf'] })).toBe(iconKey({ ...base, accessories: ['scarf', 'crown'] }));
  });
});

describe('streakTitle', () => {
  it('is the number with a leading space, or nothing', () => {
    expect(streakTitle(12)).toBe(' 12');
    expect(streakTitle(1)).toBe(' 1');
    expect(streakTitle(0)).toBe('');
  });
});
