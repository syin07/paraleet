// Thin Problems screen from the foundation (SAN-104): a plain list of what has been logged.
// The finished screen (table, filters, detail drawer, add by URL) is SAN-110.
import { api } from '../../bridge';
import { DifficultyText, PlatformBadge } from '../../components/Badges';
import { Card, EmptyState, Page, QueryNotice } from '../../components/Layout';
import { plural, problemTitle } from '../../lib/format';
import { RATING_LABELS } from '../../../core/types';
import { useBridgeQuery } from '../../lib/useBridgeQuery';

export function ProblemsScreen() {
  const logged = useBridgeQuery(() => api().listLoggedProblems());
  const rows = logged.data;

  return (
    <Page title="Problems" meta={rows ? `${rows.length} logged` : undefined}>
      {!rows ? (
        <QueryNotice loading={logged.loading} error={logged.error} />
      ) : rows.length === 0 ? (
        <Card padding="none">
          <EmptyState title="No problems yet" line="Solve today's problem and it shows up here." />
        </Card>
      ) : (
        <Card padding="none" className="overflow-hidden">
          {rows.map((row) => (
            <div
              key={row.problem.id}
              data-testid="problem-row"
              className="flex h-10 items-center gap-3 border-b border-line-subtle px-4 last:border-b-0"
            >
              <span className="min-w-0 flex-1 truncate text-base text-fg">{problemTitle(row.problem)}</span>
              <PlatformBadge platform={row.problem.platform} />
              <DifficultyText raw={row.problem.difficultyRaw} norm={row.problem.difficultyNorm} />
              <span className="w-16 text-right text-sm text-fg-muted">{RATING_LABELS[row.lastRating]}</span>
              <span className="w-20 text-right text-sm text-fg-muted tabular-nums">
                {plural(row.attemptCount, 'attempt')}
              </span>
            </div>
          ))}
        </Card>
      )}
    </Page>
  );
}
