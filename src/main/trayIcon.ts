// The menu bar icon's pixels: Para's head, cut from the same sprite the windows draw, so the
// icon's expression always matches the mood (PRD section 11). Pure: no Electron, unit-tested.
import { headBoxAt, renderSprite } from '../core/sprite';
import type { AccessoryId, GrowthStage, Mood } from '../core/types';

export interface IconBitmap {
  width: number;
  height: number;
  /** BGRA bytes, row by row, as `nativeImage.createFromBitmap` wants them. */
  bgra: Uint8Array;
}

export interface IconInput {
  seed: number;
  stage: GrowthStage;
  mood: Mood;
  accessories: readonly AccessoryId[];
}

/** Each sprite pixel becomes a 2×2 block, so a 16-pixel head is a 16-point icon on a Retina display. */
export const ICON_SCALE = 2;

/** Para's head from the mood's first frame, scaled with nearest-neighbor. */
export function headIcon(input: IconInput, scale: number = ICON_SCALE): IconBitmap {
  const frame = renderSprite(input.seed, input.stage, input.mood, 0, input.accessories);
  // The box follows the head: a pecking or tucked head, and room for a hat.
  const box = headBoxAt(input.stage, input.mood, 0, input.accessories);
  const size = box.size * scale;
  const bgra = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const sourceX = box.x + Math.floor(x / scale);
      const sourceY = box.y + Math.floor(y / scale);
      const from = (sourceY * frame.width + sourceX) * 4;
      const to = (y * size + x) * 4;
      const alpha = frame.pixels[from + 3] ?? 0;
      // The sprite's pixels are fully opaque or fully clear, so no premultiplying is needed.
      bgra[to] = alpha === 0 ? 0 : (frame.pixels[from + 2] ?? 0);
      bgra[to + 1] = alpha === 0 ? 0 : (frame.pixels[from + 1] ?? 0);
      bgra[to + 2] = alpha === 0 ? 0 : (frame.pixels[from] ?? 0);
      bgra[to + 3] = alpha;
    }
  }
  return { width: size, height: size, bgra };
}

/** A short key that changes exactly when the icon's pixels would. */
export function iconKey(input: IconInput): string {
  return [input.seed, input.stage, input.mood, [...input.accessories].sort().join('+')].join('|');
}

/** The streak beside the icon: the number, or nothing when there is no streak to show. */
export function streakTitle(streak: number): string {
  return streak > 0 ? ` ${streak}` : '';
}
