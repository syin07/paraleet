import { useState } from 'react';
import type { StatsTopic } from '../../../core/stats';
import { Button } from '../../components/Button';
import { cx, plural } from '../../lib/format';
import { TOPICS_COLLAPSED_ROWS } from './statsModel';
import { ChartCard, ChartEmpty } from './StatsParts';

/** How many different problems are solved in each topic. The list arrives sorted, zeros last. */
export function TopicCoverage({ topics, empty }: { topics: StatsTopic[]; empty: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? topics : topics.slice(0, TOPICS_COLLAPSED_ROWS);
  const largest = Math.max(1, ...topics.map((topic) => topic.solved));

  return (
    <ChartCard title="Topic coverage" testId="stats-topics">
      {empty ? (
        <ChartEmpty height={180} />
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {shown.map((topic) => (
              <li
                key={topic.topic}
                aria-label={`${topic.label}, ${plural(topic.solved, 'problem')} solved`}
                className={cx('flex h-6 items-center gap-2', topic.solved === 0 && 'opacity-60')}
              >
                <span className={cx('w-[132px] shrink-0 truncate text-sm', topic.solved === 0 ? 'text-fg-muted' : 'text-fg')}>
                  {topic.label}
                </span>
                <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${(topic.solved / largest) * 100}%` }} />
                </span>
                <span className="w-6 shrink-0 text-right text-sm text-fg-secondary tabular-nums" aria-hidden="true">
                  {topic.solved}
                </span>
              </li>
            ))}
          </ul>
          {topics.length > TOPICS_COLLAPSED_ROWS && (
            <Button variant="ghost" size="sm" className="mt-3" onClick={() => setShowAll((value) => !value)} aria-expanded={showAll}>
              {showAll ? 'Show fewer' : 'Show all'}
            </Button>
          )}
        </>
      )}
    </ChartCard>
  );
}
