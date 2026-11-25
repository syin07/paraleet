// The plan overview: the no-key card, or the active plan, or "No active plan", with drafts and
// past plans listed below.
import { useState } from 'react';
import type { PlanOverview, PlanSummary } from '../../../bridge/contract';
import { api } from '../../bridge';
import { NeutralBadge } from '../../components/Badges';
import { Button } from '../../components/Button';
import { Card, EmptyState, Page } from '../../components/Layout';
import { ConfirmDialog } from './ConfirmDialog';
import { LoadFailed } from './notices';
import { PlanBody } from './PlanBody';
import { ProgressFigure } from './ProgressBar';
import { useLock } from './useLock';
import { formatCreated, STATUS_LABELS } from './planModel';

function PlanRowButton({ plan, onOpen }: { plan: PlanSummary; onOpen: (id: number) => void }) {
  return (
    <li className="border-t border-line-subtle first:border-t-0">
      <button
        type="button"
        onClick={() => onOpen(plan.id)}
        className="focus-ring app-no-drag flex min-h-10 w-full items-center gap-3 px-4 py-1 text-left hover:bg-raised/40"
      >
        <span className="min-w-0 flex-1 truncate text-base text-fg">{plan.title}</span>
        <NeutralBadge>{STATUS_LABELS[plan.status]}</NeutralBadge>
        <ProgressFigure progress={plan.progress} className="w-36 shrink-0 text-sm text-fg-secondary" />
        <span className="w-14 shrink-0 text-right text-sm text-fg-muted">{formatCreated(plan.createdAt)}</span>
      </button>
    </li>
  );
}

function PlanList({ label, plans, onOpen }: { label: string; plans: PlanSummary[]; onOpen: (id: number) => void }) {
  if (plans.length === 0) return null;
  return (
    <section aria-label={label} className="mt-8">
      <h2 className="section-label mb-2">{label}</h2>
      <Card padding="none">
        <ul>
          {plans.map((plan) => (
            <PlanRowButton key={plan.id} plan={plan} onOpen={onOpen} />
          ))}
        </ul>
      </Card>
    </section>
  );
}

/** The card that stands in for "Create a plan" when no plan can be made. */
function NoKeyCard({ canStoreKey }: { canStoreKey: boolean }) {
  return (
    <Card padding="none" large>
      <EmptyState
        title={canStoreKey ? 'Plans need an Anthropic API key' : 'Plans are not available on this Mac'}
        mood="sleeping"
        line={
          canStoreKey
            ? 'ParaLeet asks Claude to pick problems from its local catalog. Everything else works without a key.'
            : 'ParaLeet cannot store an API key securely on this Mac, so it cannot ask Claude for a plan. Everything else works without one.'
        }
        action={
          canStoreKey ? (
            <Button
              variant="primary"
              onClick={() => {
                window.location.hash = '/settings/api-key';
              }}
            >
              Add API key
            </Button>
          ) : undefined
        }
      />
    </Card>
  );
}

export function PlanOverviewView({
  overview,
  loadError,
  onRetry,
  onCreate,
  onOpen,
  onOverview,
}: {
  overview: PlanOverview;
  /** A reload failed while an older overview is on screen. */
  loadError: string | null;
  onRetry: () => void;
  onCreate: () => void;
  onOpen: (planId: number) => void;
  onOverview: (overview: PlanOverview) => void;
}) {
  const [archiving, setArchiving] = useState(false);
  // The active plan is never edited here; the lock is only there for the shared plan layout.
  const lock = useLock();
  const { llm, active } = overview;
  const canCreate = llm.hasKey;

  const actions = (
    <>
      {canCreate && active && (
        <Button variant="secondary" onClick={onCreate}>
          Create a plan
        </Button>
      )}
      {active && (
        <Button variant="ghost" onClick={() => setArchiving(true)}>
          Archive
        </Button>
      )}
    </>
  );

  return (
    <Page title="Plan" actions={actions}>
      {loadError && (
        <div className="mb-4">
          <LoadFailed message={loadError} onRetry={onRetry} />
        </div>
      )}
      {active ? (
        <PlanBody plan={active} editable={false} onChange={() => undefined} loggedIds={new Set()} lock={lock} />
      ) : canCreate ? (
        <Card padding="none" large>
          <EmptyState
            title="No active plan"
            line="Pick topics and Para asks Claude for a staged list of real problems."
            action={
              <Button variant="primary" onClick={onCreate}>
                Create a plan
              </Button>
            }
          />
        </Card>
      ) : (
        <NoKeyCard canStoreKey={llm.canStoreKey} />
      )}
      <PlanList label="Drafts" plans={overview.drafts} onOpen={onOpen} />
      <PlanList label="Past plans" plans={overview.past} onOpen={onOpen} />
      {archiving && active && (
        <ConfirmDialog
          title="Archive this plan?"
          line="Para stops picking problems from it. Your progress is kept, and you can still read the plan."
          confirmLabel="Archive plan"
          onClose={() => setArchiving(false)}
          onConfirm={async () => {
            onOverview(await api().archivePlan({ planId: active.id }));
            setArchiving(false);
          }}
        />
      )}
    </Page>
  );
}
