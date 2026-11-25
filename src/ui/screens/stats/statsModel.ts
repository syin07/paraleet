// Pure helpers for the Stats screen: labels, month marks and bar scaling. Dates are ParaLeet days
// ("YYYY-MM-DD") and are formatted from their own parts, so the system time zone never moves them.
import type { StatsWeek } from '../../../core/stats';
import type { ParaDay } from '../../../core/types';
import { plural } from '../../lib/format';

const SHORT_DAY = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
const SHORT_MONTH = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  timeZone: 'UTC',
});

function utcDate(day: ParaDay): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, date ?? 1));
}

/** "Nov 12" */
export function shortDay(day: ParaDay): string {
  return SHORT_DAY.format(utcDate(day));
}

/** "Nov 12 · 2 problems". A day with nothing shows only its date: no zero, no "missed". */
export function dayTooltip(day: ParaDay, count: number): string {
  return count > 0 ? `${shortDay(day)} · ${plural(count, 'problem')}` : shortDay(day);
}

/** "Week of Nov 23 · 4 solves" */
export function weekTooltip(start: ParaDay, solves: number): string {
  return `Week of ${shortDay(start)} · ${solves > 0 ? plural(solves, 'solve') : 'no solves'}`;
}

export interface MonthMark {
  /** Zero-based week column the label sits above. */
  column: number;
  label: string;
}

/** Fewest week columns between two month labels, so neighbours never overlap. */
const MIN_LABEL_GAP = 3;

/**
 * A label above the first week of each month. When two would sit closer than MIN_LABEL_GAP
 * columns (only possible at the left edge), the earlier one is dropped.
 */
export function monthMarks(weeks: readonly Pick<StatsWeek, 'start'>[]): MonthMark[] {
  const marks: MonthMark[] = [];
  let previousMonth = '';
  weeks.forEach((week, column) => {
    const month = week.start.slice(0, 7);
    if (month === previousMonth) return;
    previousMonth = month;
    marks.push({ column, label: SHORT_MONTH.format(utcDate(week.start)) });
  });
  return marks.filter((mark, index) => {
    const next = marks[index + 1];
    return !next || next.column - mark.column >= MIN_LABEL_GAP;
  });
}

/** The y axis: top, middle and bottom gridline values. The top is an even number so the middle is whole. */
export function axisTicks(maxWeekSolves: number): [number, number, number] {
  const top = Math.max(2, Math.ceil(maxWeekSolves / 2) * 2);
  return [top, top / 2, 0];
}

/** A bar's height as a percentage of the plot. The current week keeps a sliver so it stays visible. */
export function barPercent(solves: number, top: number, current: boolean): number {
  const percent = top > 0 ? (solves / top) * 100 : 0;
  return current ? Math.max(percent, 3) : percent;
}

export const TOPICS_COLLAPSED_ROWS = 8;
