import { Card, EmptyState, Page } from '../../components/Layout';

// Learning plans arrive in milestone M3.
export function PlanScreen() {
  return (
    <Page title="Plan">
      <Card padding="none">
        <EmptyState
          title="Learning plans are on the way"
          line="Soon you can pick topics and get a staged list of real problems. Until then Para picks from the starter list."
        />
      </Card>
    </Page>
  );
}
