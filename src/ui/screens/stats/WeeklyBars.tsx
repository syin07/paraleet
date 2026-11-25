import { useState } from 'react';
import type { StatsWeek } from '../../../core/stats';
import { cx } from '../../lib/format';
import { axisTicks, barPercent, shortDay, weekTooltip } from './statsModel';
import { ChartCard, ChartEmpty, useTooltip } from './StatsParts';

const PLOT_HEIGHT = 180;

/** Solves per week: one bar per week, the current week drawn as a dashed outline. */
export function WeeklyBars({ weeks, maxWeekSolves, empty }: { weeks: StatsWeek[]; maxWeekSolves: number; empty: boolean }) {
  const { container, show, showElement, hide, tip } = useTooltip();
  const [active, setActive] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const ticks = axisTicks(maxWeekSolves);
  const top = ticks[0];

  function reveal(plot: HTMLElement, index: number): void {
    const slot = plot.querySelector<HTMLElement>(`[data-mark="${index}"]`);
    if (slot) showElement(slot, slot.getAttribute('aria-label') ?? '', slot.firstElementChild as HTMLElement);
  }

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
            <div
              role="group"
              aria-label="Solves per week. Use the left and right arrow keys to move between weeks."
              tabIndex={0}
              className="focus-ring relative min-w-0 flex-1"
              style={{ height: PLOT_HEIGHT }}
              onMouseLeave={hide}
              onFocus={(event) => {
                if (event.target !== event.currentTarget) return;
                const index = active ?? weeks.length - 1;
                setActive(index);
                setFocused(true);
                reveal(event.currentTarget, index);
              }}
              onBlur={() => {
                setFocused(false);
                hide();
              }}
              onKeyDown={(event) => {
                const move = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
                if (move === 0) return;
                event.preventDefault();
                const next = Math.min(Math.max((active ?? weeks.length - 1) + move, 0), weeks.length - 1);
                setActive(next);
                reveal(event.currentTarget, next);
              }}
            >
              {ticks.map((tick) => (
                <div
                  key={tick}
                  className="absolute inset-x-0 border-t border-line-subtle"
                  style={{ top: `${(1 - tick / top) * 100}%` }}
                  aria-hidden="true"
                />
              ))}
              <div className="absolute inset-0 flex">
                {weeks.map((week, index) => {
                  const text = weekTooltip(week.start, week.solves);
                  return (
                    <div
                      key={week.start}
                      role="img"
                      aria-label={text}
                      data-current={week.current ? 'true' : undefined}
                      data-mark={index}
                      className={cx('flex min-w-0 flex-1 items-end justify-center', focused && active === index && 'bg-raised')}
                      onMouseEnter={(event) => show(event, text, event.currentTarget.firstElementChild as HTMLElement)}
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
