// One plan opened by ID: a draft under review, or an archived or finished plan to read.
import { ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { PlanOverview } from '../../../bridge/contract';
import { api } from '../../bridge';
import { Button } from '../../components/Button';
import { Page } from '../../components/Layout';
import { useBridgeQuery } from '../../lib/useBridgeQuery';
import { ConfirmDialog } from './ConfirmDialog';
import { InlineError, LoadFailed, Loading } from './notices';
import { PlanBody } from './PlanBody';
import { useFresh } from './useFresh';

export function OpenedPlan({
  planId,
  onBack,
  onActivated,
  onDeleted,
}: {
  planId: number;
  onBack: () => void;
  onActivated: () => void;
  onDeleted: (overview: PlanOverview) => void;
}) {
  const query = useBridgeQuery(() => api().getPlan({ planId }), [planId]);
  const [plan, setPlan] = useFresh(query.data);
  const [loggedIds, setLoggedIds] = useState<ReadonlySet<number>>(new Set());
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const isDraft = plan?.status === 'draft';

  // A draft tags problems the user has solved before. Without the list, the tags are just missing.
  useEffect(() => {
    if (!isDraft) return;
    let current = true;
    api()
      .listLoggedProblems()
      .then(
        (rows) => current && setLoggedIds(new Set(rows.map((row) => row.problem.id))),
        () => undefined,
      );
    return () => {
      current = false;
    };
  }, [isDraft]);

  const backButton = (
    <Button variant="ghost" icon={<ArrowLeft className="h-3.5 w-3.5" />} onClick={onBack}>
      Back
    </Button>
  );

  if (!plan) {
    return (
      <Page title="Plan" actions={backButton}>
        {query.error ? <LoadFailed message={query.error} onRetry={query.reload} /> : <Loading />}
      </Page>
    );
  }

  async function activate(): Promise<void> {
    setActivating(true);
    setActivateError(null);
    try {
      await api().activatePlan({ planId });
      onActivated();
    } catch (error) {
      setActivateError(error instanceof Error ? error.message : String(error));
      setActivating(false);
    }
  }

  const canDelete = plan.status === 'draft' || plan.status === 'archived';
  const banner = isDraft && (
    <div className="mb-5 rounded-md bg-accent-subtle p-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1 text-base text-fg">Draft plan. Remove, reorder or swap problems, then activate.</div>
        <Button variant="primary" loading={activating} onClick={() => void activate()}>
          Activate plan
        </Button>
      </div>
      {activateError && (
        <div className="mt-2">
          <InlineError message={activateError} />
        </div>
      )}
    </div>
  );

  return (
    <Page
      title="Plan"
      actions={
        <>
          {backButton}
          {canDelete && (
            <Button variant="ghost" onClick={() => setConfirmingDelete(true)}>
              Delete
            </Button>
          )}
        </>
      }
    >
      {query.error && <LoadFailed message={query.error} onRetry={query.reload} />}
      <PlanBody plan={plan} editable={isDraft} banner={banner || undefined} onChange={setPlan} loggedIds={loggedIds} />
      {confirmingDelete && (
        <ConfirmDialog
          title="Delete this plan?"
          line={`“${plan.title}” will be removed. This cannot be undone.`}
          confirmLabel="Delete plan"
          onClose={() => setConfirmingDelete(false)}
          onConfirm={async () => onDeleted(await api().deletePlan({ planId }))}
        />
      )}
    </Page>
  );
}
