import { useEffect, useMemo, useRef } from 'react';
import { headBoxAt, renderSprite, SPRITE_SIZE } from '../../../core/sprite';
import type { AccessoryId, GrowthStage, Mood } from '../../../core/types';

/** Para's head alone (the crop the menu bar icon uses), drawn with nearest-neighbor scaling. */
export function ParaHead({
  seed,
  stage,
  mood,
  accessories,
  size = 32,
}: {
  seed: number;
  stage: GrowthStage;
  mood: Mood;
  accessories: readonly AccessoryId[];
  /** CSS pixels, both sides. */
  size?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const worn = accessories.join(',');
  const { frame, box } = useMemo(() => {
    const list = worn === '' ? [] : (worn.split(',') as AccessoryId[]);
    return { frame: renderSprite(seed, stage, mood, 0, list), box: headBoxAt(stage, mood, 0, list) };
  }, [seed, stage, mood, worn]);

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, box.size, box.size);
    // The dirty rectangle is drawn at (dx + x, dy + y): shifting by -x, -y puts the crop at the origin.
    ctx.putImageData(
      new ImageData(frame.pixels as Uint8ClampedArray<ArrayBuffer>, SPRITE_SIZE, SPRITE_SIZE),
      -box.x,
      -box.y,
      box.x,
      box.y,
      box.size,
      box.size,
    );
  }, [frame, box]);

  return (
    <canvas
      ref={ref}
      width={box.size}
      height={box.size}
      style={{ width: size, height: size }}
      className="pixelated shrink-0"
      aria-hidden
      data-testid="card-head"
    />
  );
}
