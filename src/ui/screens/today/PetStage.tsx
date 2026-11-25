import { useEffect } from 'react';
import type { PetSummary } from '../../../bridge/contract';
import { api } from '../../bridge';
import { Card } from '../../components/Layout';
import { SpeechBubble } from '../../components/SpeechBubble';
import { Sprite } from '../../components/Sprite';
import { MOOD_LABELS, STAGE_LABELS } from '../../lib/format';

/** How long Today must be open and in front before the "missed you" greeting counts as seen. */
const GREETING_SEEN_SECONDS = 5;

/**
 * The pet stage (docs/design-references.md, section 2): Para at 160px, its line in a pixel-font
 * bubble above and to the right, and the stage and mood beneath. After a report the mood moves
 * through checking and eating by itself, because the app tells the screen at each step.
 */
export function PetStage({ fed, pet }: { fed: boolean; pet: PetSummary }) {
  // Looking at Today with the window in front is how the greeting is seen from this screen: five
  // seconds in a row, counted again from zero whenever the window is hidden or loses focus.
  useEffect(() => {
    if (pet.mood !== 'missed_you') return;
    let seconds = 0;
    const timer = window.setInterval(() => {
      seconds = document.visibilityState === 'visible' && document.hasFocus() ? seconds + 1 : 0;
      if (seconds >= GREETING_SEEN_SECONDS) {
        window.clearInterval(timer);
        void api().acknowledgeGreeting();
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [pet.mood]);

  return (
    <Card large padding="none" className="relative flex h-60 flex-col items-center justify-center gap-2" testId="pet-stage">
      <Sprite
        seed={pet.seed}
        stage={pet.stage}
        mood={pet.mood}
        accessories={pet.equippedAccessories}
        size={160}
        animated
      />
      {pet.line !== null && (
        // Pinned near the card's top, to the right of the bird's head, and growing downward, so a
        // long line can never leave the card. Its width shrinks with the card.
        <div
          className="absolute top-4 left-[calc(50%+72px)] max-w-[min(184px,calc(50%-84px))]"
          data-testid="pet-line"
        >
          <SpeechBubble tail="left" className="max-w-full">
            <span className="line-clamp-6">{pet.line}</span>
          </SpeechBubble>
        </div>
      )}
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
