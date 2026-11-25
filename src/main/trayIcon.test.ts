import { describe, expect, it } from 'vitest';
import { headBox, headBoxAt, renderSprite } from '../core/sprite';
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
    const box = headBoxAt(base.stage, base.mood, 0, []);
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
    expect(iconKey({ ...base, accessories: ['crown', 'scarf'] })).toBe(
      iconKey({ ...base, accessories: ['scarf', 'crown'] }),
    );
  });
});

describe('streakTitle', () => {
  it('is the number with a leading space, or nothing', () => {
    expect(streakTitle(12)).toBe(' 12');
    expect(streakTitle(1)).toBe(' 1');
    expect(streakTitle(0)).toBe('');
  });
});

describe('the head box follows the head', () => {
  const white = (pixels: Uint8ClampedArray, x: number, y: number): boolean =>
    pixels[(y * 32 + x) * 4] === 255 && pixels[(y * 32 + x) * 4 + 1] === 255 && pixels[(y * 32 + x) * 4 + 2] === 255;

  it('stays inside the frame and keeps its size for every stage, mood, frame and hat', () => {
    for (const stage of GROWTH_STAGES) {
      for (const mood of MOODS) {
        for (let frame = 0; frame < 6; frame += 1) {
          for (const accessories of [[], ['crown'], ['grad_cap']] as const) {
            const box = headBoxAt(stage, mood, frame, accessories);
            expect(box.size).toBe(headBox(stage).size);
            expect(box.x).toBeGreaterThanOrEqual(0);
            expect(box.y).toBeGreaterThanOrEqual(0);
            expect(box.x + box.size).toBeLessThanOrEqual(32);
            expect(box.y + box.size).toBeLessThanOrEqual(32);
          }
        }
      }
    }
  });

  it('keeps the eye in the icon in every mood that has its eyes open', () => {
    for (const stage of GROWTH_STAGES) {
      for (const mood of MOODS) {
        const frame = renderSprite(7, stage, mood, 0, []);
        const box = headBoxAt(stage, mood, 0, []);
        let glintInFrame = false;
        let glintInBox = false;
        for (let y = 0; y < 32; y += 1) {
          for (let x = 0; x < 32; x += 1) {
            if (!white(frame.pixels, x, y)) continue;
            glintInFrame = true;
            if (x >= box.x && x < box.x + box.size && y >= box.y && y < box.y + box.size) glintInBox = true;
          }
        }
        // A closed or happy eye has no glint; when there is one, the icon must show it.
        if (glintInFrame) expect(glintInBox, `${stage} ${mood}`).toBe(true);
      }
    }
  });

  it('moves with a head that leans or pecks, so the beak side is not cut off', () => {
    for (const stage of GROWTH_STAGES) {
      const rest = headBox(stage);
      const hungry = headBoxAt(stage, 'hungry', 0, []);
      // Hungry leans to the left: the box moves left with it (or is already at the edge).
      expect(hungry.x).toBeLessThanOrEqual(rest.x);
    }
    expect(headBoxAt('adult', 'hungry', 0, []).x).toBeLessThan(headBox('adult').x);
  });

  it('leaves room above the head for a crown or a cap', () => {
    for (const stage of GROWTH_STAGES) {
      const bare = headBoxAt(stage, 'content', 0, []);
      const crowned = headBoxAt(stage, 'content', 0, ['crown']);
      expect(crowned.y).toBeLessThanOrEqual(bare.y);
      // The crown's own pixels at the top of the head are inside the icon.
      const plain = renderSprite(7, stage, 'content', 0, []);
      const worn = renderSprite(7, stage, 'content', 0, ['crown']);
      let top = 32;
      for (let y = 0; y < 32 && top === 32; y += 1) {
        for (let x = 0; x < 32; x += 1) {
          const at = (y * 32 + x) * 4;
          if (worn.pixels[at + 3] !== plain.pixels[at + 3] || worn.pixels[at] !== plain.pixels[at]) {
            top = y;
            break;
          }
        }
      }
      expect(top, `${stage} crown top row`).toBeGreaterThanOrEqual(crowned.y);
    }
  });
});
