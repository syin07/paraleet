import { useState } from 'react';
import { frameCount, renderSprite } from '../../../core/sprite';
import { GROWTH_STAGES, MOODS, type AccessoryId } from '../../../core/types';
import { Button } from '../../components/Button';
import { Card } from '../../components/Layout';
import { PixelCanvas } from '../../components/Sprite';

/**
 * Every frame of every loop, side by side and still, so jitter can be judged in one image.
 * Hidden until asked for, because it draws a few hundred canvases.
 */
export function Filmstrips({ seed, accessories }: { seed: number; accessories: readonly AccessoryId[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-xs font-medium tracking-[0.06em] text-fg-muted uppercase">Filmstrips</h2>
        <Button size="sm" onClick={() => setOpen((o) => !o)} data-testid="filmstrip-toggle" aria-expanded={open}>
          {open ? 'Hide filmstrips' : 'Show filmstrips'}
        </Button>
      </div>
      {open && (
        <div className="flex flex-col gap-4" data-testid="filmstrips">
          {GROWTH_STAGES.map((stage) => (
            <Card key={stage} padding="compact" className="w-max max-w-full overflow-x-auto" >
              <div data-testid={`filmstrip-${stage}`} className="flex w-max flex-col gap-1">
                <div className="mb-1 text-sm font-medium text-fg">{stage}</div>
                {MOODS.map((mood) => (
                  <div key={mood} className="flex items-center gap-1">
                    <div className="w-20 shrink-0 text-xs text-fg-muted">{mood.replace('_', ' ')}</div>
                    {Array.from({ length: frameCount(stage, mood) }, (_, frame) => (
                      <div key={frame} className="rounded-xs bg-sunken">
                        <PixelCanvas
                          frame={renderSprite(seed, stage, mood, frame, accessories)}
                          size={96}
                          label={`${stage} ${mood} frame ${frame + 1}`}
                          decorative
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
