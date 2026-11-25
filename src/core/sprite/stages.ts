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
  smallBeak: boolean;
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
    head: { cx: 13, cy: 11, rx: 6.8, ry: 6.2 },
    chest: { cx: 14.5, cy: 17.5, rx: 6.6, ry: 5.6 },
    rump: { cx: 17, cy: 19.5, rx: 5, ry: 5 },
    belly: { cx: 11.5, cy: 18.5, rx: 4.2, ry: 5.4 },
    wing: { cx: 17.5, cy: 18.5, rx: 3.6, ry: 6.4, angle: -22 },
    wingUp: [
      { cx: 19.5, cy: 15.5, rx: 3, ry: 6, angle: -35 },
      { cx: 20.5, cy: 14, rx: 2.8, ry: 5.6, angle: -55 },
    ],
    tail: { x: 20, y: 15, slope: 0.55, base: 11, w0: 6, w1: 3 },
    feet: { y: 24, xs: [13, 17] },
    eye: [-4, -3],
    cheek: [-3, 1],
    beak: [-9, -1],
    smallBeak: false,
    crown: [-2, 0],
    cap: [-5, 0],
    scarf: [-5, 0],
    bow: [-5, 0],
    fx: [21, 4],
    dip: [-2, 4],
    seedAt: [3, 20],
    tuft: false,
    headBox: { x: 3, y: 3, size: 17 },
  },
  fledgling: {
    head: { cx: 13, cy: 13, rx: 6.4, ry: 5.8 },
    chest: { cx: 14.5, cy: 20, rx: 6, ry: 4.8 },
    rump: { cx: 16.5, cy: 21.5, rx: 4.6, ry: 4.4 },
    belly: { cx: 12, cy: 21, rx: 3.6, ry: 4.6 },
    wing: { cx: 17, cy: 20.5, rx: 3, ry: 5, angle: -20 },
    wingUp: [
      { cx: 18.5, cy: 17.5, rx: 2.8, ry: 5, angle: -35 },
      { cx: 19.5, cy: 16.5, rx: 2.6, ry: 4.8, angle: -55 },
    ],
    tail: { x: 19, y: 18, slope: 0.65, base: 6, w0: 5, w1: 3 },
    feet: { y: 25, xs: [13, 17] },
    eye: [-4, -2],
    cheek: [-3, 1],
    beak: [-8, -1],
    smallBeak: false,
    crown: [-2, 0],
    cap: [-5, 0],
    scarf: [-5, 0],
    bow: [-5, 0],
    fx: [21, 6],
    dip: [-2, 3],
    seedAt: [3, 21],
    tuft: false,
    headBox: { x: 3, y: 5, size: 16 },
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
    smallBeak: true,
    crown: [-2, 0],
    cap: [-5, 0],
    scarf: [-4, 0],
    bow: [-5, 0],
    fx: [21, 8],
    dip: [-2, 3],
    seedAt: [3, 25],
    tuft: true,
    headBox: { x: 5, y: 10, size: 16 },
  },
  egg: {
    head: { cx: 14, cy: 15, rx: 5.8, ry: 5.4 },
    chest: { cx: 15, cy: 21, rx: 6, ry: 4.5 },
    rump: { cx: 17, cy: 22, rx: 5, ry: 4 },
    belly: { cx: 13, cy: 22, rx: 4, ry: 3.5 },
    wing: null,
    wingUp: null,
    tail: null,
    feet: null,
    eye: [-4, -2],
    cheek: [-3, 1],
    beak: [-8, -1],
    smallBeak: true,
    crown: [-2, 0],
    cap: [-5, 0],
    scarf: [-4, 0],
    bow: [-5, 0],
    fx: [22, 6],
    dip: [-2, 2],
    seedAt: [4, 19],
    tuft: true,
    headBox: { x: 5, y: 7, size: 16 },
  },
};
