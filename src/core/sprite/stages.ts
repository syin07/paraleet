import type { GrowthStage } from '../types';

// The shape of the bird at each growth stage, as plain data. Everything is in 32x32 pixel
// coordinates, facing left. Face parts are given relative to the head's center, so they travel
// with the head when a mood moves it.

export interface Ellipse {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** Degrees. A positive angle swings the lower end to the left. */
  angle?: number;
}

export interface StageSpec {
  head: Ellipse;
  chest: Ellipse;
  rump: Ellipse;
  belly: Ellipse;
  /** The folded wing, then two raised poses used when flapping. Null for the egg stage. */
  wing: Ellipse | null;
  wingUp: readonly [Ellipse, Ellipse] | null;
  /** The tail starts at (x, y), drifts `slope` pixels right per row, and is `base` rows long on a medium tail. */
  tail: { x: number; y: number; slope: number; base: number; w0: number; w1: number } | null;
  /** The feet's top row and the left pixel of each foot. Null while the bird is in the egg. */
  feet: { y: number; xs: readonly number[] } | null;
  /** Top-left pixels, relative to the head center. */
  eye: readonly [number, number];
  cheek: readonly [number, number];
  /** The beak's top-left pixel, relative to the head center. */
  beak: readonly [number, number];
  /** A 3x3 eye (adult, fledgling) instead of 2x2. */
  bigEye: boolean;
  /** Whether the wing shows barring (the chick's wing is only a nub). */
  wingBars: boolean;
  /** Where the accessories sit, relative to the head center. */
  crown: readonly [number, number];
  cap: readonly [number, number];
  scarf: readonly [number, number];
  bow: readonly [number, number];
  /** Top-left of the free corner where hearts, notes and Z's float. */
  fx: readonly [number, number];
  /** How far the head dips to eat (dx, dy), and where the seed lies. */
  dip: readonly [number, number];
  seedAt: readonly [number, number];
  /** Fluffy head feathers (chick and egg stage). */
  tuft: boolean;
  /** The square that holds the head, for the menu bar icon. */
  headBox: { x: number; y: number; size: number };
}

export const STAGES: Record<GrowthStage, StageSpec> = {
  adult: {
    head: { cx: 13, cy: 10, rx: 6.1, ry: 6.1 },
    chest: { cx: 14.5, cy: 16.5, rx: 5.4, ry: 5.6 },
    rump: { cx: 16.5, cy: 19.5, rx: 4.4, ry: 5.2, angle: -15 },
    belly: { cx: 12.3, cy: 18, rx: 3.6, ry: 5 },
    wing: { cx: 17.9, cy: 17.8, rx: 3.2, ry: 6.8, angle: -15 },
    wingUp: [
      { cx: 20.5, cy: 13.5, rx: 2.8, ry: 5.8, angle: -40 },
      { cx: 21.5, cy: 12, rx: 2.6, ry: 5.4, angle: -60 },
    ],
    tail: { x: 19, y: 15, slope: 0.45, base: 13, w0: 3, w1: 2 },
    feet: { y: 24, xs: [12, 16] },
    eye: [-4, -3],
    cheek: [-3, 2],
    beak: [-8, -1],
    bigEye: true,
    wingBars: true,
    crown: [-2, 0],
    cap: [-5, 0],
    scarf: [-5, 0],
    bow: [-5, 0],
    fx: [22, 3],
    dip: [-2, 4],
    seedAt: [2, 17],
    tuft: false,
    headBox: { x: 4, y: 3, size: 16 },
  },
  fledgling: {
    head: { cx: 13, cy: 12, rx: 6, ry: 6 },
    chest: { cx: 14.4, cy: 18.2, rx: 5.2, ry: 5.3 },
    rump: { cx: 16.2, cy: 21, rx: 4.4, ry: 5, angle: -15 },
    belly: { cx: 12.3, cy: 19.8, rx: 3.4, ry: 4.8 },
    wing: { cx: 17.4, cy: 19.5, rx: 2.7, ry: 5.6, angle: -15 },
    wingUp: [
      { cx: 19.5, cy: 16.5, rx: 2.5, ry: 5, angle: -40 },
      { cx: 20.5, cy: 15, rx: 2.4, ry: 4.6, angle: -60 },
    ],
    tail: { x: 18.8, y: 17, slope: 0.45, base: 8, w0: 3, w1: 2 },
    feet: { y: 25, xs: [12, 16] },
    eye: [-4, -3],
    cheek: [-3, 2],
    beak: [-8, -1],
    bigEye: true,
    wingBars: true,
    crown: [-2, 0],
    cap: [-5, 0],
    scarf: [-5, 0],
    bow: [-5, 0],
    fx: [21, 5],
    dip: [-2, 3],
    seedAt: [2, 18],
    tuft: false,
    headBox: { x: 4, y: 5, size: 15 },
  },
  chick: {
    head: { cx: 14, cy: 18, rx: 6.2, ry: 5.6 },
    chest: { cx: 15, cy: 22.5, rx: 6.6, ry: 4.8 },
    rump: { cx: 17, cy: 23.5, rx: 5.5, ry: 4 },
    belly: { cx: 13, cy: 24, rx: 4.2, ry: 3.8 },
    wing: { cx: 18.5, cy: 23.5, rx: 2.8, ry: 2.4, angle: -20 },
    wingUp: [
      { cx: 19.5, cy: 21.5, rx: 2.6, ry: 3, angle: -35 },
      { cx: 20.5, cy: 20.5, rx: 2.4, ry: 3, angle: -55 },
    ],
    tail: { x: 21, y: 22, slope: 0.5, base: 3, w0: 4, w1: 3 },
    feet: { y: 27, xs: [13, 17] },
    eye: [-4, -2],
    cheek: [-3, 1],
    beak: [-8, -1],
    bigEye: false,
    wingBars: false,
    crown: [-2, 0],
    cap: [-5, 0],
    scarf: [-4, 0],
    bow: [-5, 0],
    fx: [21, 8],
    dip: [-2, 3],
    seedAt: [3, 22],
    tuft: true,
    headBox: { x: 5, y: 10, size: 16 },
  },
  egg: {
    head: { cx: 14, cy: 13, rx: 5.8, ry: 5.4 },
    chest: { cx: 15, cy: 19.5, rx: 6, ry: 4.5 },
    rump: { cx: 17, cy: 21, rx: 5, ry: 4 },
    belly: { cx: 13, cy: 21, rx: 4, ry: 3.5 },
    wing: null,
    wingUp: null,
    tail: null,
    feet: null,
    eye: [-4, -2],
    cheek: [-3, 1],
    beak: [-8, -1],
    bigEye: false,
    wingBars: false,
    crown: [-2, 0],
    cap: [-5, 0],
    scarf: [-4, 0],
    bow: [-4, 0],
    fx: [22, 6],
    dip: [-2, 2],
    seedAt: [3, 17],
    tuft: true,
    headBox: { x: 5, y: 5, size: 16 },
  },
};
