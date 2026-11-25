import { Card } from '../../components/Layout';
import { PetPlaceholder } from '../../components/PetPlaceholder';

/** The pet stage. The speech bubble and pixel mood line arrive with the real pet in M2. */
export function PetStage({ fed }: { fed: boolean }) {
  return (
    <Card large padding="none" className="flex h-60 flex-col items-center justify-center gap-3">
      <PetPlaceholder size={160} />
      <div className="text-sm text-fg-muted" data-testid="pet-status">
        {fed ? 'Para is fed for today' : 'Para is waiting for one problem'}
      </div>
    </Card>
  );
}
