import { useEffect, useMemo, useRef } from 'react';
import { GROWTH_STAGES, type AccessoryId, type GrowthStage } from '../../../core/types';
import { headBox, renderSprite, SPRITE_SIZE } from '../../../core/sprite';
import { cx } from '../../lib/format';

/** The head cut from the content frame with `headBox`, the way the menu bar icon will be. */
function HeadIcon({
  seed,
  stage,
  size,
  accessories,
}: {
  seed: number;
  stage: GrowthStage;
  size: number;
  accessories: readonly AccessoryId[];
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const box = headBox(stage);
  const worn = accessories.join(',');
  const frame = useMemo(
    () => renderSprite(seed, stage, 'content', 0, worn === '' ? [] : (worn.split(',') as AccessoryId[])),
    [seed, stage, worn],
  );
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, box.size, box.size);
    const image = new ImageData(frame.pixels as Uint8ClampedArray<ArrayBuffer>, SPRITE_SIZE, SPRITE_SIZE);
    ctx.putImageData(image, -box.x, -box.y, box.x, box.y, box.size, box.size);
  }, [frame, box.x, box.y, box.size]);
  return (
    <canvas
      ref={ref}
      width={box.size}
      height={box.size}
      style={{ width: size, height: size }}
      className="pixelated shrink-0"
      role="img"
      aria-label={`${stage} head at ${size} pixels`}
    />
  );
}

/** Menu bar sizes: 16, 18 and 22 CSS pixels, each stage, on a dark and a light strip. */
export function HeadIcons({ seed, accessories }: { seed: number; accessories: readonly AccessoryId[] }) {
  return (
    <div className="grid grid-cols-1 gap-3" data-testid="gallery-menubar">
      {[
        { name: 'dark', bg: 'bg-canvas', text: 'text-fg-secondary' },
        { name: 'light', bg: 'bg-fg', text: 'text-canvas' },
      ].map((strip) => (
        <div
          key={strip.name}
          className={cx('flex flex-wrap items-center gap-x-8 gap-y-2 rounded-md border border-line p-4', strip.bg)}
        >
          {GROWTH_STAGES.map((stage) => (
            <div key={stage} className="flex items-center gap-3">
              <span className={cx('w-16 text-xs', strip.text)}>{stage}</span>
              {[16, 18, 22].map((size) => (
                <HeadIcon key={size} seed={seed} stage={stage} size={size} accessories={accessories} />
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
