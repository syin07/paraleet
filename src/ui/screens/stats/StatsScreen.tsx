import { Card, EmptyState, Page } from '../../components/Layout';

// The stats screen arrives in milestone M4.
export function StatsScreen() {
  return (
    <Page title="Stats">
      <Card padding="none">
        <EmptyState title="Stats are on the way" line="Solves per week, topic coverage and your fed-day calendar will live here." />
      </Card>
    </Page>
  );
}
