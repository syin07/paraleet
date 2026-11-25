import { useEffect, useMemo, useRef, useState } from 'react';
import type { AccessoryId, GrowthStage, Mood } from '../../core/types';
import { frameCount, renderSprite, SPRITE_FPS, SPRITE_SIZE, type SpriteFrame } from '../../core/sprite';

/** The seed used where no real one is known yet (the sidebar logo, empty states). */
export const SAMPLE_SEED = 20261125;

/** True while the system asks for less motion; animated sprites then hold their first frame. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (): void => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/** Draws one pixel frame to a canvas, scaled with nearest-neighbor. */
export function PixelCanvas({
  frame,
  size,
  label,
  decorative = false,
  className,
  testId,
}: {
  frame: SpriteFrame;
  /** CSS pixels, both sides. */
  size: number;
  label: string;
  /** Hides the canvas from assistive tech (a logo or an illustration beside text). */
  decorative?: boolean;
  className?: string;
  testId?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.putImageData(new ImageData(frame.pixels as Uint8ClampedArray<ArrayBuffer>, SPRITE_SIZE, SPRITE_SIZE), 0, 0);
  }, [frame]);
  return (
    <canvas
      ref={ref}
      width={SPRITE_SIZE}
      height={SPRITE_SIZE}
      style={{ width: size, height: size }}
      className={`pixelated shrink-0 ${className ?? ''}`}
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label })}
      data-testid={testId}
    />
  );
}

export interface SpriteProps {
  seed: number;
  stage: GrowthStage;
  mood?: Mood;
  accessories?: readonly AccessoryId[];
  /** CSS pixels, both sides. Multiples of 32 stay crispest. */
  size?: number;
  /** Plays the mood's loop at SPRITE_FPS. Otherwise `frame` is shown. */
  animated?: boolean;
  frame?: number;
  decorative?: boolean;
  className?: string;
  testId?: string;
}

/** Para, drawn by code (PRD section 6). */
export function Sprite({
  seed,
  stage,
  mood = 'content',
  accessories,
  size = 128,
  animated = false,
  frame = 0,
  decorative = false,
  className,
  testId,
}: SpriteProps) {
  const reduced = usePrefersReducedMotion();
  const [tick, setTick] = useState(0);
  const playing = animated && !reduced;
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000 / SPRITE_FPS);
    return () => clearInterval(id);
  }, [playing]);

  const worn = accessories?.join(',') ?? '';
  const frames = useMemo(() => {
    const list = worn === '' ? [] : (worn.split(',') as AccessoryId[]);
    return Array.from({ length: frameCount(stage, mood) }, (_, i) => renderSprite(seed, stage, mood, i, list));
  }, [seed, stage, mood, worn]);

  const index = (playing ? tick : frame) % frames.length;
  return (
    <PixelCanvas
      frame={frames[index] as SpriteFrame}
      size={size}
      label={`Para the parakeet, ${mood.replace('_', ' ')}`}
      decorative={decorative}
      className={className}
      testId={testId}
    />
  );
}
