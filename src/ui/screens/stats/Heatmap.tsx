import type { HeatLevel, StatsWeek } from '../../../core/stats';
import { cx } from '../../lib/format';
import { dayTooltip, monthMarks } from './statsModel';
import { ChartCard, useTooltip } from './StatsParts';

// Literal class names so Tailwind sees them.
const HEAT: Record<HeatLevel, string> = {
  0: 'bg-heat-0 shadow-[inset_0_0_0_1px_var(--color-line)]',
  1: 'bg-heat-1',
  2: 'bg-heat-2',
  3: 'bg-heat-3',
  4: 'bg-heat-4',
};

const LABEL_COLUMN = 28;
const GAP = 3;
const MAX_CELL = 12;
const WEEKDAY_LABELS: Record<number, string> = { 0: 'Mon', 2: 'Wed', 4: 'Fri' };

/**
 * Fed days, one column per week, Monday at the top. The columns share the width equally and the
 * cells stay square, at most 12px, so a year of weeks fits without scrolling.
 */
export function Heatmap({ weeks }: { weeks: StatsWeek[] }) {
  const { container, show, hide, tip } = useTooltip();
  const marks = monthMarks(weeks);
  const maxWidth = LABEL_COLUMN + weeks.length * (MAX_CELL + GAP);

  return (
    <ChartCard title="Fed days" testId="stats-heatmap-card">
      <div ref={container} className="relative">
        <div
          data-testid="stats-heatmap"
          className="grid w-full"
          style={{
            maxWidth,
            columnGap: GAP,
            rowGap: GAP,
            gridTemplateColumns: `${LABEL_COLUMN - GAP}px repeat(${weeks.length}, minmax(0, 1fr))`,
            gridTemplateRows: '16px repeat(7, auto)',
          }}
          onMouseLeave={hide}
        >
          {marks.map((mark) => (
            <div key={`m${mark.column}`} className="relative" style={{ gridRow: 1, gridColumn: mark.column + 2 }} aria-hidden="true">
              <span className="absolute left-0 text-xs leading-4 whitespace-nowrap text-fg-muted">{mark.label}</span>
            </div>
          ))}
          {Object.entries(WEEKDAY_LABELS).map(([row, label]) => (
            <div key={label} className="relative" style={{ gridRow: Number(row) + 2, gridColumn: 1 }} aria-hidden="true">
              <span className="absolute top-1/2 left-0 -translate-y-1/2 text-xs leading-4 text-fg-muted">{label}</span>
            </div>
          ))}
          {weeks.map((week, column) =>
            week.days.map((day, row) => {
              const place = { gridRow: row + 2, gridColumn: column + 2 };
              // Days after today stay blank: no color, no tooltip.
              if (day.future) return <div key={day.day} style={place} className="aspect-square w-full" aria-hidden="true" />;
              const text = dayTooltip(day.day, day.count);
              return (
                <div
                  key={day.day}
                  role="img"
                  aria-label={text}
                  style={place}
                  className={cx('aspect-square w-full rounded-[2px]', HEAT[day.level])}
                  onMouseEnter={(event) => show(event, text)}
                />
              );
            }),
          )}
        </div>
        {tip}
        <div className="mt-3 flex items-center justify-end gap-1.5 text-xs text-fg-muted" aria-hidden="true">
          Less
          {([0, 1, 2, 3, 4] as const).map((level) => (
            <span key={level} className={cx('size-3 rounded-[2px]', HEAT[level])} />
          ))}
          More
        </div>
      </div>
    </ChartCard>
  );
}
