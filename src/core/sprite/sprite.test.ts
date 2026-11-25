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
import { mulberry32 } from './traits';

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

  it('changes between consecutive frames, with no big jump, including last to first', () => {
    for (const stage of GROWTH_STAGES) {
      for (const mood of MOODS) {
        const n = frameCount(stage, mood);
        for (let frame = 0; frame < n; frame++) {
          const a = renderSprite(11, stage, mood, frame, ['crown']);
          const b = renderSprite(11, stage, mood, frame + 1, ['crown']);
          const diff = changed(a, b);
          if (diff === 0) throw new Error(`${stage}/${mood}: frame ${frame} equals the next`);
          if (diff > 260) throw new Error(`${stage}/${mood}: frame ${frame} jumps ${diff} pixels`);
        }
      }
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
      const belly = { pale: 'bellyPale', cream: 'bellyCream', honey: 'bellyHoney', amber: 'bellyAmber' }[traits.bellyShade];
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
