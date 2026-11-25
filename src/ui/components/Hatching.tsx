import { useEffect, useRef, useState } from 'react';
import { HATCH_FRAMES } from '../../core/sprite';

/**
 * Plays the hatching once from its first frame and returns the frame to draw (0 to HATCH_FRAMES - 1).
 * `onDone` runs once, when the last frame is reached. Mount it again (a new `key`) to replay.
 */
export function useHatchingStep(frameMs: number, onDone?: () => void): number {
  const [step, setStep] = useState(0);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    const id = setInterval(() => setStep((s) => Math.min(HATCH_FRAMES - 1, s + 1)), frameMs);
    return () => clearInterval(id);
  }, [frameMs]);
  useEffect(() => {
    if (step === HATCH_FRAMES - 1) done.current?.();
  }, [step]);
  return step;
}
