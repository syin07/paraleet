import { Card, EmptyState, Page } from '../../components/Layout';

// The settings screen is built with the features it controls (reminders in M2, API key in M3,
// export and import in M4).
export function SettingsScreen() {
  return (
    <Page title="Settings">
      <Card padding="none">
        <EmptyState title="Settings are on the way" line="Reminder times, the day boundary and your data controls will live here." />
      </Card>
    </Page>
  );
}
