// The Today screen (docs/design-references.md, section 2): the pet, today's problem, other due
// reviews, the streak and a quick way to log any other problem.
import { useRef, useState } from 'react';
import { api } from '../../bridge';
import { Button } from '../../components/Button';
import { Card, EmptyState, Page, QueryNotice } from '../../components/Layout';
import { ReportDialog } from '../../components/ReportForm';
import { formatDay } from '../../lib/format';
import { useBridgeQuery } from '../../lib/useBridgeQuery';
import { DueReviews } from './DueReviews';
import { PetStage } from './PetStage';
import { ProblemCard } from './ProblemCard';
import { QuickLog } from './QuickLog';
import { StreakCard } from './StreakCard';
import { SwapDialog } from './SwapDialog';

export function TodayScreen() {
  // Reloads by itself when a report or a swap changes the day, so no manual refresh is needed.
  const query = useBridgeQuery(() => api().getToday());
  const [reportFor, setReportFor] = useState<number | null>(null);
  const [swapping, setSwapping] = useState(false);
  const quickLogInput = useRef<HTMLDivElement>(null);
  const today = query.data;

  if (!today) {
    return (
      <Page title="Today">
        <QueryNotice loading={query.loading} error={query.error} />
      </Page>
    );
  }

  const assignment = today.assignment;
  const focusQuickLog = (): void => quickLogInput.current?.querySelector('input')?.focus();

  return (
    <Page title="Today" actions={<span className="text-sm text-fg-muted">{formatDay(today.today)}</span>}>
      <QueryNotice loading={false} error={query.error} />
      <div className="grid grid-cols-1 gap-6 min-[960px]:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex min-w-0 flex-col gap-4">
          <PetStage fed={today.fed} />
          {assignment ? (
            <ProblemCard
              assignment={assignment}
              fed={today.fed}
              onReport={() => setReportFor(assignment.problem.id)}
              onSwap={() => setSwapping(true)}
              onLogAnother={focusQuickLog}
            />
          ) : (
            <Card>
              <EmptyState
                className="py-4"
                title="Para has no pick for today"
                line="Logging any problem you solve still feeds Para."
                action={
                  <Button variant="secondary" onClick={focusQuickLog}>
                    Log a problem
                  </Button>
                }
              />
            </Card>
          )}
          <DueReviews reviews={today.dueReviews} canMakeToday={!assignment?.completed} onReport={setReportFor} />
        </div>
        <div className="flex flex-col gap-4">
          <StreakCard streak={today.streak} />
          <QuickLog inputRef={quickLogInput} onPick={setReportFor} />
        </div>
      </div>
      {reportFor !== null && <ReportDialog problemId={reportFor} onClose={() => setReportFor(null)} />}
      {swapping && <SwapDialog currentId={assignment?.problem.id ?? null} onClose={() => setSwapping(false)} />}
    </Page>
  );
}
