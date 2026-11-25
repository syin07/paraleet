import type { PetSummary } from '../../../bridge/contract';
import { Card } from '../../components/Layout';
import { Sprite } from '../../components/Sprite';

/** The pet stage. The speech bubble and pixel mood line arrive with the pet's voice (SAN-115). */
export function PetStage({ fed, pet }: { fed: boolean; pet: PetSummary }) {
  return (
    <Card large padding="none" className="flex h-60 flex-col items-center justify-center gap-3">
      <Sprite
        seed={pet.seed}
        stage={pet.stage}
        mood={pet.mood}
        accessories={pet.equippedAccessories}
        size={160}
        animated
      />
      <div className="text-sm text-fg-muted" data-testid="pet-status">
        {fed ? 'Para is fed for today' : 'Para is waiting for one problem'}
      </div>
    </Card>
  );
}
