import type { ColorName } from './palette';

/** A small deterministic generator (mulberry32). No randomness at render time: only the seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Any number becomes a well-mixed 32-bit integer, so that nearby seeds give different birds.
 * Fractions are cut off. The part beyond 32 bits is mixed in only when it is not zero, so every
 * seed from 0 to 2^32 - 1 keeps the bird it always had, and -1 or 2^32 + 5 are different birds
 * from 0 and 5 (they can still share a bird with some other seed by chance, as any two seeds can).
 */
export function normalizeSeed(seed: number): number {
  const whole = Number.isFinite(seed) ? Math.trunc(seed) : 0;
  const high = Math.floor(whole / 4294967296) | 0;
  let h = (whole >>> 0) ^ Math.imul(high, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

export const CHEEK_SHAPES = ['dot', 'bar', 'double', 'crescent'] as const;
export const CHEEK_COLORS = ['green', 'red'] as const;
export const BARRINGS = ['stripes', 'scallops', 'spots', 'chevrons'] as const;
export const BELLY_SHADES = ['pale', 'cream', 'honey'] as const;
export const TAIL_LENGTHS = ['short', 'medium', 'long'] as const;

export type CheekShape = (typeof CHEEK_SHAPES)[number];
export type Barring = (typeof BARRINGS)[number];
export type BellyShade = (typeof BELLY_SHADES)[number];
export type TailLength = (typeof TAIL_LENGTHS)[number];

/** The seed-driven traits, for tests and for labelling the gallery. */
export interface SpriteTraits {
  cheekShape: CheekShape;
  cheekColor: 'green' | 'red';
  barring: Barring;
  bellyShade: BellyShade;
  tailLength: TailLength;
}

export function describeTraits(seed: number): SpriteTraits {
  const next = mulberry32(normalizeSeed(seed));
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T;
  // The order of these calls is part of the contract: reordering would change every bird.
  return {
    cheekShape: pick(CHEEK_SHAPES),
    cheekColor: pick(CHEEK_COLORS),
    barring: pick(BARRINGS),
    bellyShade: pick(BELLY_SHADES),
    tailLength: pick(TAIL_LENGTHS),
  };
}

export const BELLY_COLOR: Record<BellyShade, ColorName> = {
  pale: 'bellyPale',
  cream: 'bellyCream',
  honey: 'bellyHoney',
};

/** How long the tail is, as a share of the stage's full tail. */
export const TAIL_FACTOR: Record<TailLength, number> = { short: 0.75, medium: 1, long: 1.15 };
