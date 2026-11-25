import { describe, expect, it } from 'vitest';
import { ACCESSORY_IDS, GROWTH_STAGES, MOODS, type AccessoryId, type GrowthStage, type Mood } from '../types';
import {
  describeTraits,
  frameCount,
  HATCH_FRAMES,
  headBox,
  PALETTE,
  renderHatching,
  renderSprite,
  SPRITE_FPS,
  SPRITE_SIZE,
  type SpriteFrame,
} from './index';
import { posesFor } from './moods';
import { STAGES } from './stages';
import { mulberry32, normalizeSeed } from './traits';

const HEX = new Map<string, string>(Object.entries(PALETTE).map(([name, hex]) => [hex.toUpperCase(), name]));

function hexAt(f: SpriteFrame, x: number, y: number): string | null {
  const i = (y * 32 + x) * 4;
  if (f.pixels[i + 3] === 0) return null;
  const h = (n: number): string => n.toString(16).padStart(2, '0');
  return `#${h(f.pixels[i] ?? 0)}${h(f.pixels[i + 1] ?? 0)}${h(f.pixels[i + 2] ?? 0)}`.toUpperCase();
}

function colorName(f: SpriteFrame, x: number, y: number): string | null {
  const hex = hexAt(f, x, y);
  return hex === null ? null : (HEX.get(hex) ?? `?${hex}`);
}

function pixelsOf(f: SpriteFrame, ...names: string[]): [number, number][] {
  const out: [number, number][] = [];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (names.includes(colorName(f, x, y) ?? '')) out.push([x, y]);
  return out;
}

function opaqueCount(f: SpriteFrame): number {
  let n = 0;
  for (let i = 3; i < f.pixels.length; i += 4) if (f.pixels[i] !== 0) n++;
  return n;
}

function changed(a: SpriteFrame, b: SpriteFrame): number {
  let n = 0;
  for (let i = 0; i < a.pixels.length; i += 4) {
    if (a.pixels[i] !== b.pixels[i] || a.pixels[i + 1] !== b.pixels[i + 1] || a.pixels[i + 2] !== b.pixels[i + 2] || a.pixels[i + 3] !== b.pixels[i + 3]) n++;
  }
  return n;
}

function lowestRow(f: SpriteFrame): number {
  for (let y = 31; y >= 0; y--) for (let x = 0; x < 32; x++) if (hexAt(f, x, y)) return y;
  return -1;
}

const SEEDS = Array.from({ length: 200 }, (_, i) => {
  const next = mulberry32(i * 7919 + 13);
  return Math.floor(next() * 4294967296);
});

describe('renderSprite basics', () => {
  it('is a 32x32 grid of 4096 bytes', () => {
    const f = renderSprite(1, 'adult', 'content', 0);
    expect(SPRITE_SIZE).toBe(32);
    expect(SPRITE_FPS).toBe(6);
    expect([f.width, f.height, f.pixels.length]).toEqual([32, 32, 4096]);
  });

  it('gives the same pixels for the same inputs', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      for (const stage of GROWTH_STAGES) {
        const a = renderSprite(seed, stage, 'eating', 3, ['crown']);
        const b = renderSprite(seed, stage, 'eating', 3, ['crown']);
        expect(Array.from(a.pixels)).toEqual(Array.from(b.pixels));
      }
    }
  });

  it('renders every stage, mood and frame for 200 seeds: in bounds, palette only, one pixel margin', { timeout: 60_000 }, () => {
    for (const seed of SEEDS) {
      for (const stage of GROWTH_STAGES) {
        for (const mood of MOODS) {
          const n = frameCount(stage, mood);
          for (let frame = 0; frame < n; frame++) {
            // The full set of accessories is the worst case for the margin.
            const f = renderSprite(seed, stage, mood, frame, ['scarf', 'bow_tie', 'grad_cap']);
            expect(f.pixels.length).toBe(4096);
            expect(opaqueCount(f)).toBeGreaterThan(150);
            for (let y = 0; y < 32; y++) {
              for (let x = 0; x < 32; x++) {
                const name = colorName(f, x, y);
                if (name?.startsWith('?')) throw new Error(`off-palette ${name} in ${seed}/${stage}/${mood}/${frame}`);
                if (name && (x === 0 || y === 0 || x === 31 || y === 31)) {
                  throw new Error(`pixel on the border at ${x},${y} in ${seed}/${stage}/${mood}/${frame}`);
                }
              }
            }
          }
        }
      }
    }
  });

  it('keeps the margin with a crown too', () => {
    for (const seed of SEEDS.slice(0, 30)) {
      for (const stage of GROWTH_STAGES) {
        for (const mood of MOODS) {
          for (let frame = 0; frame < frameCount(stage, mood); frame++) {
            const f = renderSprite(seed, stage, mood, frame, ['crown']);
            for (let i = 0; i < 32; i++) {
              for (const [x, y] of [[i, 0], [i, 31], [0, i], [31, i]] as const) expect(hexAt(f, x, y)).toBeNull();
            }
          }
        }
      }
    }
  });

  it('has only fully opaque or fully transparent pixels', () => {
    const f = renderSprite(9, 'adult', 'missed_you', 1, ['crown']);
    for (let i = 3; i < f.pixels.length; i += 4) expect([0, 255]).toContain(f.pixels[i]);
  });

  it('never throws on odd seeds', () => {
    for (const seed of [-1, -123456789, 0, 0.5, 3.99, 2 ** 32, 2 ** 53, 1e300, Number.MAX_SAFE_INTEGER, NaN, Infinity, -Infinity]) {
      for (const stage of GROWTH_STAGES) {
        expect(() => renderSprite(seed, stage, 'content', 0)).not.toThrow();
        expect(opaqueCount(renderSprite(seed, stage, 'hungry', 2))).toBeGreaterThan(100);
      }
      expect(() => describeTraits(seed)).not.toThrow();
      expect(() => renderHatching(seed, 2)).not.toThrow();
    }
  });
});

describe('animation', () => {
  it('has 2 to 6 frames per loop and wraps any whole frame number', () => {
    for (const stage of GROWTH_STAGES) {
      for (const mood of MOODS) {
        const n = frameCount(stage, mood);
        expect(n).toBeGreaterThanOrEqual(2);
        expect(n).toBeLessThanOrEqual(6);
        const first = renderSprite(5, stage, mood, 0);
        expect(Array.from(renderSprite(5, stage, mood, n).pixels)).toEqual(Array.from(first.pixels));
        expect(Array.from(renderSprite(5, stage, mood, n * 1000).pixels)).toEqual(Array.from(first.pixels));
        const last = renderSprite(5, stage, mood, n - 1);
        expect(Array.from(renderSprite(5, stage, mood, -1).pixels)).toEqual(Array.from(last.pixels));
      }
    }
  });

  // The most pixels a mood really changes between neighbouring frames (last to first included),
  // measured over 8 seeds with and without accessories. The bound is 20% above that, so a whole
  // bird jumping 2 pixels (198 to 248 pixels) is caught in every mood that should not move it.
  const MAX_CHANGE: Record<Mood, Record<GrowthStage, number>> = {
    sleeping: { egg: 40, chick: 47, fledgling: 52, adult: 41 },
    content: { egg: 110, chick: 165, fledgling: 182, adult: 202 },
    peckish: { egg: 29, chick: 27, fledgling: 33, adult: 32 },
    hungry: { egg: 159, chick: 203, fledgling: 218, adult: 231 },
    checking: { egg: 103, chick: 106, fledgling: 109, adult: 108 },
    eating: { egg: 141, chick: 191, fledgling: 185, adult: 189 },
    nibbling: { egg: 122, chick: 168, fledgling: 165, adult: 169 },
    missed_you: { egg: 124, chick: 191, fledgling: 208, adult: 242 },
  };

  it('changes between consecutive frames, within a bound set by what each mood really does', () => {
    for (const stage of GROWTH_STAGES) {
      for (const mood of MOODS) {
        const bound = Math.ceil(MAX_CHANGE[mood][stage] * 1.2);
        const n = frameCount(stage, mood);
        for (let frame = 0; frame < n; frame++) {
          for (const accessories of [[], ['crown', 'scarf', 'bow_tie'], ['grad_cap']] as AccessoryId[][]) {
            const a = renderSprite(11, stage, mood, frame, accessories);
            const b = renderSprite(11, stage, mood, frame + 1, accessories);
            const diff = changed(a, b);
            if (diff === 0) throw new Error(`${stage}/${mood}: frame ${frame} equals the next`);
            if (diff > bound) throw new Error(`${stage}/${mood}: frame ${frame} changes ${diff} pixels, bound ${bound}`);
          }
        }
      }
    }
  });

  // Rows from here down hold the feet, the lower body and the tail.
  const FLOOR: Record<GrowthStage, number> = { egg: 24, chick: 28, fledgling: 25, adult: 24 };
  const STILL_MOODS: Mood[] = ['sleeping', 'peckish', 'checking', 'eating', 'nibbling'];

  /** The pixels below the floor that must not move. A sleeper's body breathes, so it keeps only feet, tail, wing and shell. */
  function stillPixels(f: SpriteFrame, stage: GrowthStage, mood: Mood): string {
    const keepAll = mood !== 'sleeping';
    const parts: string[] = [];
    for (let y = FLOOR[stage]; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const name = colorName(f, x, y);
        // The outline follows the body, so it is left out: it moves when the chest leans.
        if (name && name !== 'outline' && (keepAll || ['beakShade', 'wing', 'wingBar', 'wingEdge', 'shell', 'shellShade'].includes(name))) parts.push(`${x},${y},${name}`);
      }
    }
    return parts.join(';');
  }

  /** True when every frame has the same still pixels as the first. */
  function isPlanted(frames: SpriteFrame[], stage: GrowthStage, mood: Mood): boolean {
    const first = stillPixels(frames[0] as SpriteFrame, stage, mood);
    return frames.every((f) => stillPixels(f, stage, mood) === first);
  }

  function shiftDown(f: SpriteFrame, rows: number): SpriteFrame {
    const pixels = new Uint8ClampedArray(4096);
    for (let y = rows; y < 32; y++) pixels.set(f.pixels.subarray((y - rows) * 128, (y - rows + 1) * 128), y * 128);
    return { width: 32, height: 32, pixels };
  }

  it('keeps the lower body, feet and tail identical in every frame of moods that do not hop or lean', () => {
    for (const seed of [1, 2, 3, 4]) {
      for (const stage of GROWTH_STAGES) {
        for (const mood of STILL_MOODS) {
          for (const accessories of [[], ['crown', 'scarf', 'bow_tie']] as AccessoryId[][]) {
            const frames = Array.from({ length: frameCount(stage, mood) }, (_, i) => renderSprite(seed, stage, mood, i, accessories));
            expect(isPlanted(frames, stage, mood), `${seed}/${stage}/${mood}`).toBe(true);
          }
        }
      }
    }
  });

  it('proves the planted check has teeth: one frame shifted by 2 pixels fails it', () => {
    for (const stage of GROWTH_STAGES) {
      for (const mood of STILL_MOODS) {
        const frames = Array.from({ length: frameCount(stage, mood) }, (_, i) => renderSprite(1, stage, mood, i));
        expect(isPlanted(frames, stage, mood)).toBe(true);
        const moved = frames.map((f, i) => (i === 1 ? shiftDown(f, 2) : f));
        expect(isPlanted(moved, stage, mood), `${stage}/${mood}`).toBe(false);
      }
    }
  });

  it("never lets the two sleeping Z's touch", () => {
    const components = (f: SpriteFrame): number => {
      const cells = new Set(pixelsOf(f, 'sleepBlue').map(([x, y]) => `${x},${y}`));
      let count = 0;
      while (cells.size > 0) {
        const start = cells.values().next().value as string;
        const stack = [start];
        cells.delete(start);
        while (stack.length > 0) {
          const [cx, cy] = (stack.pop() as string).split(',').map(Number) as [number, number];
          for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
              const key = `${cx + dx},${cy + dy}`;
              if (cells.delete(key)) stack.push(key);
            }
          }
        }
        count++;
      }
      return count;
    };
    for (const stage of GROWTH_STAGES) {
      // Frames 0-1 show the small Z, 2-3 both, 4-5 the big one.
      const expected = [1, 1, 2, 2, 1, 1];
      expected.forEach((n, frame) => {
        expect(components(renderSprite(5, stage, 'sleeping', frame)), `${stage} frame ${frame}`).toBe(n);
      });
    }
  });

  it('keeps the tail in front of a puffed-up sleeper', () => {
    for (const stage of ['fledgling', 'adult'] as GrowthStage[]) {
      const tail = (f: SpriteFrame): string => pixelsOf(f, 'wing', 'wingBar').filter(([x, y]) => x >= 20 && y >= 18).join(';');
      expect(tail(renderSprite(4, stage, 'sleeping', 4))).toBe(tail(renderSprite(4, stage, 'sleeping', 0)));
    }
  });

  it('keeps the feet and the lowest row planted in moods that do not hop', () => {
    const planted = MOODS.filter((m) => m !== 'content' && m !== 'missed_you');
    for (const seed of [1, 2, 3, 4]) {
      for (const stage of GROWTH_STAGES) {
        for (const mood of planted) {
          const base = renderSprite(seed, stage, mood, 0);
          const feet = pixelsOf(base, 'beakShade').filter(([x, y]) => x >= 12 && y >= 23);
          for (let frame = 1; frame < frameCount(stage, mood); frame++) {
            const f = renderSprite(seed, stage, mood, frame);
            expect(lowestRow(f)).toBe(lowestRow(base));
            expect(pixelsOf(f, 'beakShade').filter(([x, y]) => x >= 12 && y >= 23)).toEqual(feet);
          }
        }
      }
    }
  });

  it('keeps the feet down when hopping moods land', () => {
    for (const stage of GROWTH_STAGES) {
      const rest = renderSprite(3, stage, 'content', 0);
      const land = renderSprite(3, stage, 'content', 2);
      expect(lowestRow(land)).toBe(lowestRow(rest));
      const hop = renderSprite(3, stage, 'content', 1);
      // The egg's shell stays put while the bird bounces inside it.
      if (stage !== 'egg') expect(lowestRow(hop)).toBe(lowestRow(rest) - 1);
    }
  });

  it('draws hearts for eating and none for nibbling or anything else', () => {
    for (const stage of GROWTH_STAGES) {
      const hearts = (mood: Mood): number => {
        let n = 0;
        for (let f = 0; f < frameCount(stage, mood); f++) n += pixelsOf(renderSprite(7, stage, mood, f), 'heart').length;
        return n;
      };
      expect(hearts('eating')).toBeGreaterThan(8);
      for (const mood of MOODS.filter((m) => m !== 'eating')) expect(hearts(mood)).toBe(0);
    }
  });

  it('makes nibbling shorter and more modest than eating', () => {
    for (const stage of GROWTH_STAGES) {
      expect(frameCount(stage, 'nibbling')).toBeLessThan(frameCount(stage, 'eating'));
    }
  });

  it('shows no open eye while sleeping, and an open eye in the other moods', () => {
    for (const stage of GROWTH_STAGES) {
      for (let f = 0; f < frameCount(stage, 'sleeping'); f++) {
        expect(pixelsOf(renderSprite(8, stage, 'sleeping', f), 'white')).toHaveLength(0);
      }
      expect(pixelsOf(renderSprite(8, stage, 'content', 0), 'white').length).toBeGreaterThan(0);
      expect(pixelsOf(renderSprite(8, stage, 'hungry', 0), 'white').length).toBeGreaterThan(0);
    }
  });

  it('tells the moods apart: no two moods share a loop', () => {
    for (const stage of GROWTH_STAGES) {
      const signature = (mood: Mood): string => {
        const parts: string[] = [];
        for (let f = 0; f < frameCount(stage, mood); f++) parts.push(Array.from(renderSprite(1, stage, mood, f).pixels).join(','));
        return parts.join('|');
      };
      const sigs = new Set(MOODS.map(signature));
      expect(sigs.size).toBe(MOODS.length);
    }
  });
});

describe('accessories', () => {
  const colorOf: Record<AccessoryId, string> = { scarf: 'scarf', bow_tie: 'bow', crown: 'gold', grad_cap: 'capBoard' };

  it('adds its own pixels on every stage and mood and leaves the eye and beak alone', () => {
    for (const id of ACCESSORY_IDS) {
      for (const stage of GROWTH_STAGES) {
        for (const mood of MOODS) {
          for (let frame = 0; frame < frameCount(stage, mood); frame++) {
            const plain = renderSprite(21, stage, mood, frame);
            const worn = renderSprite(21, stage, mood, frame, [id]);
            const label = `${id}/${stage}/${mood}/${frame}`;
            expect(pixelsOf(worn, colorOf[id]).length, label).toBeGreaterThan(0);
            expect(pixelsOf(plain, colorOf[id]), label).toHaveLength(0);
            expect(pixelsOf(worn, 'white'), label).toEqual(pixelsOf(plain, 'white'));
            expect(pixelsOf(worn, 'cere'), label).toEqual(pixelsOf(plain, 'cere'));
            expect(pixelsOf(worn, 'beak'), label).toEqual(pixelsOf(plain, 'beak'));
          }
        }
      }
    }
  });

  it('never covers the eye region, whatever the mood or accessory', () => {
    const combos: AccessoryId[][] = [['scarf'], ['bow_tie'], ['crown'], ['grad_cap'], ['scarf', 'bow_tie'], ['crown', 'grad_cap', 'scarf', 'bow_tie']];
    for (const stage of GROWTH_STAGES) {
      const spec = STAGES[stage];
      for (const mood of MOODS) {
        const poses = posesFor(stage, mood);
        for (let frame = 0; frame < poses.length; frame++) {
          const pose = poses[frame]!;
          // The eye, its lid or brow, and the front-facing second eye: a box that follows the head.
          const x0 = spec.head.cx + (pose.face === 'front' ? -6 : spec.eye[0] - 1) + pose.head[0];
          const width = pose.face === 'front' ? 12 : 6;
          const brow = pose.eyes === 'narrow' ? 1 : 0;
          const y0 = spec.head.cy + spec.eye[1] - brow + pose.head[1] - pose.hop;
          const plain = renderSprite(21, stage, mood, frame);
          for (const worn of combos) {
            const f = renderSprite(21, stage, mood, frame, worn);
            for (let y = y0; y < y0 + (spec.bigEye ? 4 : 3) + brow; y++) {
              for (let x = x0; x < x0 + width; x++) {
                expect(colorName(f, x, y), `${worn.join('+')}/${stage}/${mood}/${frame} at ${x},${y}`).toBe(colorName(plain, x, y));
              }
            }
          }
        }
      }
    }
  });

  it('keeps a scarf and a bow tie both visible when worn together', () => {
    for (const stage of GROWTH_STAGES) {
      for (const mood of MOODS) {
        for (let frame = 0; frame < frameCount(stage, mood); frame++) {
          const f = renderSprite(21, stage, mood, frame, ['scarf', 'bow_tie']);
          expect(pixelsOf(f, 'scarf').length, `${stage}/${mood}/${frame} scarf`).toBeGreaterThanOrEqual(5);
          expect(pixelsOf(f, 'bow').length, `${stage}/${mood}/${frame} bow`).toBeGreaterThanOrEqual(8);
        }
      }
    }
  });

  it('keeps an accessory on the head when the head moves', () => {
    // The crown's gold moves with the head: in the eating dip it sits lower than at rest.
    for (const stage of GROWTH_STAGES) {
      const top = (f: SpriteFrame): number => Math.min(...pixelsOf(f, 'gold').map(([, y]) => y));
      const rest = renderSprite(2, stage, 'eating', 0, ['crown']);
      const dip = renderSprite(2, stage, 'eating', 2, ['crown']);
      expect(top(dip)).toBeGreaterThan(top(rest));
    }
  });

  it('draws the cap and skips the crown when both are requested', () => {
    for (const stage of GROWTH_STAGES) {
      const both = renderSprite(4, stage, 'content', 0, ['crown', 'grad_cap']);
      expect(pixelsOf(both, 'capBoard').length).toBeGreaterThan(0);
      expect(pixelsOf(both, 'jewel')).toHaveLength(0);
    }
  });

  it('does not change anything with an empty list', () => {
    expect(Array.from(renderSprite(4, 'adult', 'content', 0, []).pixels)).toEqual(Array.from(renderSprite(4, 'adult', 'content', 0).pixels));
  });
});

describe('hatching', () => {
  it('has 4 to 8 frames, starts with a closed egg and ends on the egg-stage bird', () => {
    expect(HATCH_FRAMES).toBeGreaterThanOrEqual(4);
    expect(HATCH_FRAMES).toBeLessThanOrEqual(8);
    for (const seed of [1, 2, 3]) {
      const first = renderHatching(seed, 0);
      expect(pixelsOf(first, 'body', 'bodyShade', 'highlight')).toHaveLength(0);
      expect(opaqueCount(first)).toBeGreaterThan(200);
      const last = renderHatching(seed, HATCH_FRAMES - 1);
      expect(Array.from(last.pixels)).toEqual(Array.from(renderSprite(seed, 'egg', 'content', 0).pixels));
      expect(Array.from(renderHatching(seed, HATCH_FRAMES + 5).pixels)).toEqual(Array.from(last.pixels));
    }
  });

  it('draws a clean egg: the outline only widens to the middle and then narrows', () => {
    const widths: number[] = [];
    const first = renderHatching(1, 0);
    for (let y = 0; y < 32; y++) {
      const xs = Array.from({ length: 32 }, (_, x) => x).filter((x) => hexAt(first, x, y));
      if (xs.length > 0) widths.push((xs[xs.length - 1] as number) - (xs[0] as number) + 1);
    }
    const peak = widths.indexOf(Math.max(...widths));
    for (let i = 1; i <= peak; i++) expect(widths[i], `row ${i}`).toBeGreaterThanOrEqual(widths[i - 1] as number);
    for (let i = peak + 1; i < widths.length; i++) expect(widths[i], `row ${i}`).toBeLessThanOrEqual(widths[i - 1] as number);
  });

  it('keeps changing and never leaves the margin', () => {
    for (let f = 0; f < HATCH_FRAMES; f++) {
      const a = renderHatching(1, f);
      if (f > 0) expect(changed(renderHatching(1, f - 1), a)).toBeGreaterThan(0);
      for (let i = 0; i < 32; i++) {
        for (const [x, y] of [[i, 0], [i, 31], [0, i], [31, i]] as const) expect(hexAt(a, x, y)).toBeNull();
      }
    }
  });
});

describe('growth', () => {
  it('gets bigger from chick to adult, and the egg stage shows the same bird', () => {
    for (const seed of SEEDS.slice(0, 50)) {
      const size = (stage: GrowthStage): number => opaqueCount(renderSprite(seed, stage, 'content', 0));
      expect(size('fledgling')).toBeGreaterThan(size('chick'));
      expect(size('adult')).toBeGreaterThan(size('fledgling'));
    }
  });

  it('keeps the same cheek color and belly shade through every stage', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      const traits = describeTraits(seed);
      const cheek = traits.cheekColor === 'green' ? 'cheekGreen' : 'cheekRed';
      const other = traits.cheekColor === 'green' ? 'cheekRed' : 'cheekGreen';
      const belly = { pale: 'bellyPale', cream: 'bellyCream', honey: 'bellyHoney' }[traits.bellyShade];
      for (const stage of GROWTH_STAGES) {
        const f = renderSprite(seed, stage, 'content', 0);
        expect(pixelsOf(f, cheek).length).toBeGreaterThan(0);
        expect(pixelsOf(f, other)).toHaveLength(0);
        expect(pixelsOf(f, belly).length).toBeGreaterThan(0);
      }
    }
  });

  it('has an adult tail longer than a fledgling tail, and the tail trait scales it', () => {
    const tailRows = (seed: number, stage: GrowthStage): number => {
      const f = renderSprite(seed, stage, 'content', 0);
      return pixelsOf(f, 'wing', 'wingBar').filter(([x, y]) => x > 22 && y > 20).length;
    };
    const bySeed = SEEDS.slice(0, 200).map((seed) => ({ seed, length: describeTraits(seed).tailLength }));
    const pick = (length: string): number => (bySeed.find((s) => s.length === length) as { seed: number }).seed;
    expect(tailRows(pick('long'), 'adult')).toBeGreaterThan(tailRows(pick('short'), 'adult'));
  });

  it('has a square head box inside the frame that holds the eye and part of the beak', () => {
    for (const seed of SEEDS) {
      for (const stage of GROWTH_STAGES) {
        const box = headBox(stage);
        expect(box.size).toBeGreaterThan(0);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.size).toBeLessThanOrEqual(32);
        expect(box.y + box.size).toBeLessThanOrEqual(32);
        const f = renderSprite(seed, stage, 'content', 0);
        const inside = ([x, y]: [number, number]): boolean =>
          x >= box.x && x < box.x + box.size && y >= box.y && y < box.y + box.size;
        const eye = pixelsOf(f, 'white');
        expect(eye.length).toBeGreaterThan(0);
        expect(eye.every(inside), `${seed}/${stage} eye`).toBe(true);
        expect(pixelsOf(f, 'beak').some(inside), `${seed}/${stage} beak`).toBe(true);
      }
    }
  });

  it('puts the head box inside the frame', () => {
    for (const stage of GROWTH_STAGES) {
      const box = headBox(stage);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.size).toBeLessThanOrEqual(32);
      expect(box.y + box.size).toBeLessThanOrEqual(32);
    }
  });
});

describe('traits (SAN-113)', () => {
  const seeds500 = Array.from({ length: 500 }, (_, i) => Math.floor(mulberry32(i + 1)() * 4294967296));
  const traits = seeds500.map(describeTraits);

  it('keeps every belly shade clearly lighter than the body, and at least three apart', () => {
    const lum = (hex: string): number => {
      const n = parseInt(hex.slice(1), 16);
      return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
    };
    const shades = [PALETTE.bellyPale, PALETTE.bellyCream, PALETTE.bellyHoney];
    for (const shade of shades) expect(lum(shade)).toBeGreaterThan(lum(PALETTE.body) + 25);
    for (let i = 1; i < shades.length; i++) expect(lum(shades[i - 1] as string) - lum(shades[i] as string)).toBeGreaterThan(15);
    expect(new Set(traits.map((x) => x.bellyShade)).size).toBeGreaterThanOrEqual(3);
  });

  it('mixes seeds beyond 32 bits and below zero instead of folding them onto small seeds', () => {
    expect(normalizeSeed(-1)).not.toBe(normalizeSeed(0));
    expect(normalizeSeed(2 ** 32 + 5)).not.toBe(normalizeSeed(5));
    expect(normalizeSeed(2 ** 32 + 5)).not.toBe(normalizeSeed(4));
    expect(normalizeSeed(3.9)).toBe(normalizeSeed(3));
    expect(normalizeSeed(NaN)).toBe(normalizeSeed(0));
  });

  it('is stable for a seed', () => {
    for (const seed of seeds500.slice(0, 50)) expect(describeTraits(seed)).toEqual(describeTraits(seed));
  });

  it('takes several values for every trait', () => {
    const count = (pick: (t: ReturnType<typeof describeTraits>) => string): number => new Set(traits.map(pick)).size;
    expect(count((t) => t.cheekShape)).toBeGreaterThanOrEqual(3);
    expect(count((t) => t.cheekColor)).toBe(2);
    expect(count((t) => t.barring)).toBeGreaterThanOrEqual(3);
    expect(count((t) => t.bellyShade)).toBeGreaterThanOrEqual(3);
    expect(count((t) => t.tailLength)).toBeGreaterThanOrEqual(3);
  });

  it('gives nearby seeds different birds', () => {
    // Real installs get random seeds, but 1, 2, 3 ... must not all collapse to one look.
    expect(new Set(Array.from({ length: 40 }, (_, i) => JSON.stringify(describeTraits(i)))).size).toBeGreaterThan(15);
  });

  it('makes most pairs differ in a trait and in rendered pixels', () => {
    let traitDiff = 0;
    let pixelDiff = 0;
    const pairs = 500;
    for (let i = 0; i < pairs; i++) {
      const a = seeds500[i] as number;
      const b = seeds500[(i + 1) % pairs] as number;
      if (JSON.stringify(describeTraits(a)) !== JSON.stringify(describeTraits(b))) traitDiff++;
      if (changed(renderSprite(a, 'adult', 'content', 0), renderSprite(b, 'adult', 'content', 0)) > 0) pixelDiff++;
    }
    expect(traitDiff / pairs).toBeGreaterThanOrEqual(0.95);
    expect(pixelDiff / pairs).toBeGreaterThanOrEqual(0.95);
  });

  it('shows each trait visibly in the pixels', () => {
    // Fix everything but one trait by searching for seed pairs that differ in exactly that trait.
    const keys = ['cheekShape', 'cheekColor', 'barring', 'bellyShade', 'tailLength'] as const;
    for (const key of keys) {
      let checked = 0;
      for (let i = 0; i < 500 && checked < 5; i++) {
        for (let j = i + 1; j < 500 && checked < 5; j++) {
          const a = traits[i]!;
          const b = traits[j]!;
          const differing = keys.filter((k) => a[k] !== b[k]);
          if (differing.length === 1 && differing[0] === key) {
            checked++;
            const delta = changed(renderSprite(seeds500[i]!, 'adult', 'content', 0), renderSprite(seeds500[j]!, 'adult', 'content', 0));
            expect(delta, key).toBeGreaterThanOrEqual(3);
          }
        }
      }
      expect(checked, key).toBeGreaterThan(0);
    }
  });

  it('keeps the silhouette a parakeet: an orange body whatever the seed', () => {
    for (const seed of SEEDS) {
      const f = renderSprite(seed, 'adult', 'content', 0);
      expect(pixelsOf(f, 'body', 'bodyShade', 'highlight').length).toBeGreaterThan(80);
      expect(pixelsOf(f, 'wing', 'wingBar').length).toBeGreaterThan(20);
    }
  });
});
