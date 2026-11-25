import type { StatsWeek } from '../../../core/stats';
import { cx } from '../../lib/format';
import { axisTicks, barPercent, shortDay, weekTooltip } from './statsModel';
import { ChartCard, ChartEmpty, useTooltip } from './StatsParts';

const PLOT_HEIGHT = 180;

/** Solves per week: one bar per week, the current week drawn as a dashed outline. */
export function WeeklyBars({ weeks, maxWeekSolves, empty }: { weeks: StatsWeek[]; maxWeekSolves: number; empty: boolean }) {
  const { container, show, hide, tip } = useTooltip();
  const ticks = axisTicks(maxWeekSolves);
  const top = ticks[0];

  return (
    <ChartCard title="Solves per week" testId="stats-weekly" className="min-w-0">
      {empty ? (
        <ChartEmpty height={PLOT_HEIGHT} />
      ) : (
        <div ref={container} className="relative">
          <div className="flex gap-2">
            <div
              className="relative w-5 shrink-0 text-right text-xs text-fg-muted tabular-nums"
              style={{ height: PLOT_HEIGHT }}
              aria-hidden="true"
            >
              {ticks.map((tick) => (
                <span key={tick} className="absolute right-0 -translate-y-1/2 leading-4" style={{ top: `${(1 - tick / top) * 100}%` }}>
                  {tick}
                </span>
              ))}
            </div>
            <div className="relative min-w-0 flex-1" style={{ height: PLOT_HEIGHT }} onMouseLeave={hide}>
              {ticks.map((tick) => (
                <div
                  key={tick}
                  className="absolute inset-x-0 border-t border-line-subtle"
                  style={{ top: `${(1 - tick / top) * 100}%` }}
                  aria-hidden="true"
                />
              ))}
              <div className="absolute inset-0 flex">
                {weeks.map((week) => {
                  const text = weekTooltip(week.start, week.solves);
                  return (
                    <div
                      key={week.start}
                      role="img"
                      aria-label={text}
                      data-current={week.current ? 'true' : undefined}
                      className="flex min-w-0 flex-1 items-end justify-center"
                      onMouseEnter={(event) => show(event, text)}
                    >
                      <div
                        className={cx(
                          'w-3/5 rounded-t-[3px]',
                          week.current ? 'border border-dashed border-accent-border bg-accent-subtle' : 'bg-accent',
                        )}
                        style={{
                          height: `${barPercent(week.solves, top, week.current)}%`,
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="mt-1.5 flex justify-between pl-7 text-xs text-fg-muted" aria-hidden="true">
            <span>{weeks[0] ? shortDay(weeks[0].start) : ''}</span>
            <span>This week</span>
          </div>
          {tip}
        </div>
      )}
    </ChartCard>
  );
}
