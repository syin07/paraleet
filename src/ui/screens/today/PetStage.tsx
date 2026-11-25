import { useEffect } from 'react';
import type { PetSummary } from '../../../bridge/contract';
import { api } from '../../bridge';
import { Card } from '../../components/Layout';
import { SpeechBubble } from '../../components/SpeechBubble';
import { Sprite } from '../../components/Sprite';
import { MOOD_LABELS, STAGE_LABELS } from '../../lib/format';

/** How long the "missed you" greeting stays up on Today before it counts as seen. */
const GREETING_SEEN_MS = 5000;

/**
 * The pet stage (docs/design-references.md, section 2): Para at 160px, its line in a pixel-font
 * bubble above and to the right, and the stage and mood beneath. After a report the mood moves
 * through checking and eating by itself, because the app tells the screen at each step.
 */
export function PetStage({ fed, pet }: { fed: boolean; pet: PetSummary }) {
  // Looking at Today with the window in front is how the greeting is seen from this screen.
  useEffect(() => {
    if (pet.mood !== 'missed_you') return;
    const timer = window.setTimeout(() => {
      if (document.visibilityState === 'visible' && document.hasFocus()) void api().acknowledgeGreeting();
    }, GREETING_SEEN_MS);
    return () => window.clearTimeout(timer);
  }, [pet.mood]);

  return (
    <Card large padding="none" className="relative flex h-60 flex-col items-center justify-center gap-2">
      <div className="relative">
        <Sprite
          seed={pet.seed}
          stage={pet.stage}
          mood={pet.mood}
          accessories={pet.equippedAccessories}
          size={160}
          animated
        />
        {pet.line !== null && (
          // Narrow enough to stay inside the card at every window size.
          <div className="absolute bottom-[calc(100%-36px)] left-[calc(100%-40px)] w-max" data-testid="pet-line">
            <SpeechBubble tail="left" className="max-w-[184px]">
              {pet.line}
            </SpeechBubble>
          </div>
        )}
      </div>
      <div className="font-pixel text-[8px] leading-[14px] text-fg-muted" data-testid="pet-mood" data-mood={pet.mood}>
        {STAGE_LABELS[pet.stage]} · {MOOD_LABELS[pet.mood]}
      </div>
      {/* The plain sentence, for screen readers. */}
      <div className="sr-only" data-testid="pet-status">
        {fed ? 'Para is fed for today' : 'Para is waiting for one problem'}
      </div>
    </Card>
  );
}
