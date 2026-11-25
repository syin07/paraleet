// The Plan screen (docs/design-references.md, section 6). Three views held in local state: the
// overview, the create form, and one plan opened by ID.
import { useState } from 'react';
import { api } from '../../bridge';
import { Page } from '../../components/Layout';
import { useBridgeQuery } from '../../lib/useBridgeQuery';
import { CreatePlan } from './CreatePlan';
import { LoadFailed, Loading } from './notices';
import { OpenedPlan } from './OpenedPlan';
import { PlanOverviewView } from './PlanOverviewView';
import { useFresh } from './useFresh';

type View = { kind: 'overview' } | { kind: 'create' } | { kind: 'plan'; id: number };

export function PlanScreen() {
  const [view, setView] = useState<View>({ kind: 'overview' });
  const query = useBridgeQuery(() => api().getPlanOverview());
  // archivePlan and deletePlan answer with the new overview: show it at once.
  const [overview, setOverview] = useFresh(query.data);
  const back = (): void => setView({ kind: 'overview' });

  if (!overview) {
    return (
      <Page title="Plan">
        {query.error ? <LoadFailed message={query.error} onRetry={query.reload} /> : <Loading />}
      </Page>
    );
  }

  if (view.kind === 'create') {
    return <CreatePlan overview={overview} onBack={back} onGenerated={(plan) => setView({ kind: 'plan', id: plan.id })} />;
  }
  if (view.kind === 'plan') {
    return (
      <OpenedPlan
        planId={view.id}
        onBack={back}
        onActivated={back}
        onDeleted={(next) => {
          setOverview(next);
          back();
        }}
      />
    );
  }
  return (
    <PlanOverviewView
      overview={overview}
      loadError={query.error}
      onRetry={query.reload}
      onCreate={() => setView({ kind: 'create' })}
      onOpen={(id) => setView({ kind: 'plan', id })}
      onOverview={setOverview}
    />
  );
}
