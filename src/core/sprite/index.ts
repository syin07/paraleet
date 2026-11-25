// The procedural parakeet (PRD section 6): a pure function from (seed, stage, mood, frame,
// accessories) to a 32x32 pixel grid. No image files, no clock, no randomness at render time.
import type { AccessoryId, GrowthStage, Mood } from '../types';
import { drawBird, drawEggCap, drawWholeEgg, outlineGrid, type Look } from './draw';
import { posesFor, REST_POSE } from './moods';
import { Grid, SIZE } from './raster';
import { STAGES } from './stages';
import { describeTraits } from './traits';

export { PALETTE } from './palette';
export { describeTraits } from './traits';
export type { SpriteTraits } from './traits';
export { BARRINGS, BELLY_SHADES, CHEEK_COLORS, CHEEK_SHAPES, TAIL_LENGTHS } from './traits';

export const SPRITE_SIZE = 32;
export const SPRITE_FPS = 6;

/** One frame: RGBA bytes, row by row, 4 per pixel, 32 x 32. Alpha 0 is transparent. */
export interface SpriteFrame {
  readonly width: 32;
  readonly height: 32;
  readonly pixels: Uint8ClampedArray; // length 4096
}

function toFrame(g: Grid): SpriteFrame {
  return { width: SIZE as 32, height: SIZE as 32, pixels: g.toRgba() };
}

function lookFor(seed: number): Look {
  return { traits: describeTraits(seed) };
}

/** `frame` may be any whole number; it wraps around the mood's frame count. */
export function renderSprite(
  seed: number,
  stage: GrowthStage,
  mood: Mood,
  frame: number,
  accessories: readonly AccessoryId[] = [],
): SpriteFrame {
  const poses = posesFor(stage, mood);
  const index = ((Math.trunc(frame) % poses.length) + poses.length) % poses.length;
  const pose = poses[Number.isFinite(index) ? index : 0] ?? REST_POSE;
  return toFrame(drawBird({ stage, look: lookFor(seed), pose, accessories }));
}

/** How many frames the mood's loop has for this stage: 2 to 6. */
export function frameCount(stage: GrowthStage, mood: Mood): number {
  return posesFor(stage, mood).length;
}

/** First launch: a whole egg, cracks spreading, the top lifting off, ending on the egg-stage bird. */
export const HATCH_FRAMES = 6;

export function renderHatching(seed: number, frame: number): SpriteFrame {
  const step = Math.min(HATCH_FRAMES - 1, Math.max(0, Math.trunc(Number.isFinite(frame) ? frame : 0)));
  if (step === HATCH_FRAMES - 1) return renderSprite(seed, 'egg', 'content', 0);
  if (step === HATCH_FRAMES - 2) {
    // The cap is off and Para's head is just rising out of the shell.
    const pose = { ...REST_POSE, head: [0, 3] as const, eyes: 'blink' as const };
    return toFrame(drawBird({ stage: 'egg', look: lookFor(seed), pose, accessories: [], extra: drawEggCap }));
  }
  const g = new Grid();
  const wobble = [0, 0, 1, -1][step] ?? 0;
  drawWholeEgg(g, step, wobble);
  outlineGrid(g);
  return toFrame(g);
}

/** The square region of the frame that holds the head at rest, used to cut a menu bar icon. */
export function headBox(stage: GrowthStage): { x: number; y: number; size: number } {
  return { ...STAGES[stage].headBox };
}

/**
 * The head's square in one frame of a mood: the stage's box moved with the head (a leaning,
 * pecking or tucked head, a hop), and raised a little when a crown or cap is worn so the hat is
 * not cut off. Always inside the frame.
 */
export function headBoxAt(
  stage: GrowthStage,
  mood: Mood,
  frame: number,
  accessories: readonly AccessoryId[] = [],
): { x: number; y: number; size: number } {
  const box = STAGES[stage].headBox;
  const poses = posesFor(stage, mood);
  const index = Number.isFinite(frame) ? ((Math.trunc(frame) % poses.length) + poses.length) % poses.length : 0;
  const pose = poses[index];
  const hat = accessories.includes('crown') || accessories.includes('grad_cap') ? HAT_ROOM : 0;
  const clamp = (value: number): number => Math.min(Math.max(value, 0), SPRITE_SIZE - box.size);
  return {
    x: clamp(box.x + (pose?.head[0] ?? 0)),
    y: clamp(box.y + (pose?.head[1] ?? 0) - (pose?.hop ?? 0) - hat),
    size: box.size,
  };
}

/** Rows a crown or cap needs above the head box. */
const HAT_ROOM = 2;
