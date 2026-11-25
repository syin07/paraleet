// One plan opened by ID: a draft under review, or an archived or finished plan to read.
import { ArrowLeft } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { PlanOverview } from '../../../bridge/contract';
import { api } from '../../bridge';
import { Button } from '../../components/Button';
import { Page } from '../../components/Layout';
import { useBridgeQuery } from '../../lib/useBridgeQuery';
import { ConfirmDialog } from './ConfirmDialog';
import { InlineError, LoadFailed, Loading } from './notices';
import { PlanBody } from './PlanBody';
import { useFresh } from './useFresh';
import { useLock } from './useLock';

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
  // Which plan is active, read again whenever the app's data changes: activating a draft
  // archives that plan, so the banner and the confirmation must name the right one.
  const overview = useBridgeQuery(() => api().getPlanOverview());
  const activeTitle = overview.data?.active?.title ?? null;
  // Problems the user has attempted, to tag them in a draft. Without the list the tags are just missing.
  const logged = useBridgeQuery(() => api().listLoggedProblems());
  const loggedIds = useMemo<ReadonlySet<number>>(
    () => new Set((logged.data ?? []).map((row) => row.problem.id)),
    [logged.data],
  );
  const lock = useLock();
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);
  // The title of the plan that activating would archive, while the confirmation is open.
  const [confirmingActivate, setConfirmingActivate] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const isDraft = plan?.status === 'draft';

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

  async function activateNow(): Promise<void> {
    await api().activatePlan({ planId });
    onActivated();
  }

  // With a plan active the user is asked first. The check reads the overview afresh, so it is
  // right even if the active plan changed while this draft was open.
  async function activate(): Promise<void> {
    setActivateError(null);
    setActivating(true);
    await lock.guard(async () => {
      try {
        const fresh = await api().getPlanOverview();
        if (fresh.active) setConfirmingActivate(fresh.active.title);
        else await activateNow();
      } catch (error) {
        setActivateError(error instanceof Error ? error.message : String(error));
      } finally {
        setActivating(false);
      }
    });
  }

  const canDelete = plan.status === 'draft' || plan.status === 'archived';
  const banner = isDraft && (
    <div className="mb-5 rounded-md bg-accent-subtle p-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1 text-base text-fg">
          Draft plan. Remove, reorder or swap problems, then activate.
          {activeTitle && <span className="block text-fg-secondary">Activating this plan archives “{activeTitle}”.</span>}
        </div>
        <Button variant="primary" loading={activating} disabled={lock.busy} onClick={() => void activate()}>
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
            <Button variant="ghost" disabled={lock.busy} onClick={() => setConfirmingDelete(true)}>
              Delete
            </Button>
          )}
        </>
      }
    >
      {query.error && <LoadFailed message={query.error} onRetry={query.reload} />}
      <PlanBody plan={plan} editable={isDraft} banner={banner || undefined} onChange={setPlan} loggedIds={loggedIds} lock={lock} />
      {confirmingActivate !== null && (
        <ConfirmDialog
          title="Activate this plan?"
          line={`“${confirmingActivate}” will be archived. Its progress is kept, but an archived plan cannot be made active again.`}
          confirmLabel="Activate plan"
          confirmVariant="primary"
          onClose={() => setConfirmingActivate(null)}
          onConfirm={activateNow}
        />
      )}
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
