import { useState } from 'react';
import type { StatsRange } from '../../../core/stats';
import { api } from '../../bridge';
import { Button } from '../../components/Button';
import { Page } from '../../components/Layout';
import { useBridgeQuery } from '../../lib/useBridgeQuery';
import { Heatmap } from './Heatmap';
import { RangeControl, StatTile } from './StatsParts';
import { TopicCoverage } from './TopicCoverage';
import { WeeklyBars } from './WeeklyBars';

/**
 * Numbers that matter, a calendar of fed days, solves per week and topic coverage. Nothing here
 * counts days missed or draws a goal (PRD section 5). Changing the range keeps the old numbers
 * on screen until the new ones arrive.
 */
export function StatsScreen() {
  const [range, setRange] = useState<StatsRange>('6m');
  const { data, error, reload } = useBridgeQuery(() => api().getStats({ range }), [range]);

  return (
    <Page title="Stats" actions={<RangeControl value={range} onChange={setRange} />}>
      {error && (
        <div role="alert" className="mb-6 flex items-center gap-3 rounded-md border border-line bg-surface p-4 text-base text-hard-text">
          <span className="min-w-0 flex-1">{error}</span>
          <Button size="sm" onClick={reload}>
            Try again
          </Button>
        </div>
      )}
      {!data && !error && <div className="p-4 text-base text-fg-muted">Loading…</div>}
      {data && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-4 gap-3">
            <StatTile label="Current streak" value={data.streak.current} />
            <StatTile label="Longest streak" value={data.streak.longest} />
            <StatTile label="Total solves" value={data.totals.solves} />
            <StatTile label="Reviews done" value={data.totals.reviews} />
          </div>
          <Heatmap weeks={data.weeks} />
          <div className="grid grid-cols-1 items-start gap-4 min-[1000px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <WeeklyBars weeks={data.weeks} maxWeekSolves={data.maxWeekSolves} empty={data.totals.solves === 0} />
            <TopicCoverage topics={data.topics} empty={data.totals.solves === 0} />
          </div>
        </div>
      )}
    </Page>
  );
}
