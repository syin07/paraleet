import { useState } from 'react';
import { HATCH_FRAMES, renderHatching, SPRITE_FPS } from '../../../core/sprite';
import { Button } from '../../components/Button';
import { useHatchingStep } from '../../components/Hatching';
import { Card } from '../../components/Layout';
import { PixelCanvas } from '../../components/Sprite';

/** Plays the hatching once, from its first frame. Mounting it again (a new `key`) replays it. */
function Playback({ seed }: { seed: number }) {
  // Half speed, so each crack can be read.
  const step = useHatchingStep((1000 / SPRITE_FPS) * 2);
  return (
    <>
      <PixelCanvas frame={renderHatching(seed, step)} size={128} label="Para hatching" testId="hatching" />
      <div className="text-sm text-fg-secondary" data-testid="hatching-step">
        Frame {step + 1} of {HATCH_FRAMES}
      </div>
    </>
  );
}

/** First-launch hatching, replayable, with every frame laid out beside it. */
export function HatchingPreview({ seed }: { seed: number }) {
  const [run, setRun] = useState(0);
  return (
    <Card padding="compact" className="flex flex-wrap items-center gap-6">
      <div className="flex items-center gap-6">
        <Playback key={`${run}-${seed}`} seed={seed} />
        <Button size="sm" onClick={() => setRun((r) => r + 1)} data-testid="hatching-replay">
          Replay
        </Button>
      </div>
      <div className="flex gap-2">
        {Array.from({ length: HATCH_FRAMES }, (_, i) => (
          <PixelCanvas key={i} frame={renderHatching(seed, i)} size={64} label={`Hatching frame ${i + 1}`} decorative />
        ))}
      </div>
    </Card>
  );
}
