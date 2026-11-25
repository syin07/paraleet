import type { StreakSummary } from '../../../bridge/contract';
import { Card } from '../../components/Layout';
import { cx, formatDay } from '../../lib/format';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function StreakCard({ streak }: { streak: StreakSummary }) {
  return (
    <Card>
      <div className="text-2xl font-semibold text-fg tabular-nums" data-testid="streak-current">
        {streak.current}
      </div>
      <div className="text-sm text-fg-muted">day streak</div>
      <div className="mt-4 flex gap-1.5" role="list" aria-label="This week">
        {streak.week.map((cell, index) => (
          <div
            key={cell.day}
            role="listitem"
            aria-label={`${formatDay(cell.day)}${cell.fed ? ', fed' : ''}`}
            className={cx(
              'flex h-6 w-6 items-center justify-center rounded-sm text-xs',
              cell.fed ? 'bg-accent font-semibold text-on-accent' : 'bg-sunken text-fg-muted',
              cell.isToday && 'border border-accent-border',
            )}
          >
            {WEEKDAYS[index]}
          </div>
        ))}
      </div>
      <div className="mt-3 text-sm text-fg-muted">Longest: {streak.longest}</div>
    </Card>
  );
}
