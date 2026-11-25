import { useState, type KeyboardEvent } from 'react';
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

interface Position {
  column: number;
  row: number;
}

/**
 * Fed days, one column per week, Monday at the top. The columns share the width equally and the
 * cells stay square, at most 12px, so a year of weeks fits without scrolling. The grid is one tab
 * stop: arrow keys move between days and show the same tooltip as hovering.
 */
export function Heatmap({ weeks }: { weeks: StatsWeek[] }) {
  const { container, show, showElement, hide, tip } = useTooltip();
  // The keyboard position is a day, not a column and row, so a new range can never leave it
  // pointing past the data: a day that is not in the current weeks falls back to today.
  const [activeDay, setActiveDay] = useState<string | null>(null);
  // True while the position is shown: only for keyboard focus, so a click leaves the hovered tooltip alone.
  const [focused, setFocused] = useState(false);
  const marks = monthMarks(weeks);
  const maxWidth = LABEL_COLUMN + weeks.length * (MAX_CELL + GAP);

  const isReal = (position: Position): boolean => weeks[position.column]?.days[position.row]?.future === false;

  /** Today's cell: the last day that is not in the future. */
  function startPosition(): Position {
    const column = weeks.length - 1;
    const row = (weeks[column]?.days ?? []).reduce((last, day, index) => (day.future ? last : index), 0);
    return { column, row };
  }

  function locate(day: string | null): Position {
    for (const [column, week] of weeks.entries()) {
      const row = week.days.findIndex((candidate) => candidate.day === day);
      if (row >= 0 && isReal({ column, row })) return { column, row };
    }
    return startPosition();
  }

  const current = locate(activeDay);
  const currentDay = weeks[current.column]?.days[current.row]?.day;

  function reveal(grid: HTMLElement, position: Position): void {
    const cell = grid.querySelector<HTMLElement>(`[data-mark="${position.column}-${position.row}"]`);
    if (cell) showElement(cell, cell.getAttribute('aria-label') ?? '');
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const step: Record<string, Position> = {
      ArrowLeft: { column: -1, row: 0 },
      ArrowRight: { column: 1, row: 0 },
      ArrowUp: { column: 0, row: -1 },
      ArrowDown: { column: 0, row: 1 },
    };
    const delta = step[event.key];
    if (!delta) return;
    event.preventDefault();
    const next = { column: current.column + delta.column, row: current.row + delta.row };
    if (!isReal(next)) return;
    setActiveDay(weeks[next.column]?.days[next.row]?.day ?? null);
    setFocused(true);
    reveal(event.currentTarget, next);
  }

  return (
    <ChartCard title="Fed days" testId="stats-heatmap-card">
      <div ref={container} className="relative">
        <div
          data-testid="stats-heatmap"
          role="group"
          aria-label="Fed days calendar. Use the arrow keys to move between days."
          tabIndex={0}
          className="focus-ring grid w-full rounded-xs"
          style={{
            maxWidth,
            columnGap: GAP,
            rowGap: GAP,
            gridTemplateColumns: `${LABEL_COLUMN - GAP}px repeat(${weeks.length}, minmax(0, 1fr))`,
            gridTemplateRows: '16px repeat(7, auto)',
          }}
          onMouseLeave={hide}
          onFocus={(event) => {
            if (event.target !== event.currentTarget) return;
            // A click also focuses the grid; only keyboard focus shows the position.
            if (!event.currentTarget.matches(':focus-visible')) return;
            setActiveDay(currentDay ?? null);
            setFocused(true);
            reveal(event.currentTarget, current);
          }}
          onBlur={() => {
            setFocused(false);
            hide();
            // Each visit starts from today (or this week) again, so a position never outlives the data it pointed at.
            setActiveDay(null);
          }}
          onKeyDown={onKeyDown}
          aria-activedescendant={focused && currentDay ? `heat-${currentDay}` : undefined}
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
              const isActive = focused && day.day === currentDay;
              return (
                <div
                  key={day.day}
                  role="img"
                  id={`heat-${day.day}`}
                  aria-label={text}
                  data-mark={`${column}-${row}`}
                  style={place}
                  className={cx('aspect-square w-full rounded-[2px]', HEAT[day.level], isActive && 'outline-2 outline-fg')}
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
