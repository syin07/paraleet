import { useState } from 'react';
import type { DueReviewItem } from '../../../bridge/contract';
import { api } from '../../bridge';
import { DifficultyDot, PlatformBadge } from '../../components/Badges';
import { Button } from '../../components/Button';
import { Card } from '../../components/Layout';
import { problemTitle } from '../../lib/format';

function dueText(daysOverdue: number): string {
  return daysOverdue === 0 ? 'due today' : `due ${daysOverdue}d ago`;
}

/** Up to five other due reviews, most overdue first. There is never a count of the rest. */
export function DueReviews({
  reviews,
  canMakeToday,
  onReport,
}: {
  reviews: DueReviewItem[];
  canMakeToday: boolean;
  onReport: (problemId: number) => void;
}) {
  const [swapping, setSwapping] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);

  async function makeToday(problemId: number): Promise<void> {
    if (swapping) return;
    setSwapping(true);
    setSwapError(null);
    try {
      await api().swapToday({ problemId });
    } catch (cause) {
      setSwapError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSwapping(false);
    }
  }

  return (
    <section aria-label="Due for review">
      <h2 className="section-label mb-2">Due for review</h2>
      <Card padding="none" className="overflow-hidden">
        {reviews.length === 0 ? (
          <div className="flex h-11 items-center px-4 text-base text-fg-muted">Nothing due. Para approves.</div>
        ) : (
          <ul>
            {reviews.map((item) => (
              <li
                key={item.problem.id}
                data-testid="due-row"
                className="group relative flex h-11 items-center gap-3 border-b border-line-subtle px-4 last:border-b-0 hover:bg-raised focus-within:bg-raised"
              >
                <DifficultyDot raw={item.problem.difficultyRaw} norm={item.problem.difficultyNorm} />
                <span className="min-w-0 flex-1 truncate text-base text-fg">{problemTitle(item.problem)}</span>
                <PlatformBadge platform={item.problem.platform} />
                <span className="w-20 shrink-0 text-right text-sm text-fg-muted">{dueText(item.daysOverdue)}</span>
                <div className="absolute top-1/2 right-3 flex -translate-y-1/2 items-center gap-1 rounded-sm bg-raised pl-2 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
                  <Button variant="ghost" size="sm" onClick={() => void api().openProblem({ problemId: item.problem.id })}>
                    Open
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onReport(item.problem.id)}>
                    Report
                  </Button>
                  {canMakeToday && (
                    <Button variant="ghost" size="sm" disabled={swapping} onClick={() => void makeToday(item.problem.id)}>
                      Make today's
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {swapError && (
        <div role="alert" className="mt-2 text-sm text-hard-text">
          Could not change today's problem: {swapError}
        </div>
      )}
    </section>
  );
}
