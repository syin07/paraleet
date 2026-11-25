// ParaLeet days. A ParaLeet day runs from the boundary hour (default 04:00) to the same hour the
// next day, in local time, so a solve at 01:00 counts for the previous day (PRD section 4).
// A day is written as the local calendar date it started on: `YYYY-MM-DD`.
//
// Nothing here reads the system clock or the system time zone: both are arguments.
import type { ParaDay } from './types';

export const DEFAULT_BOUNDARY_HOUR = 4;

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

function localParts(instant: Date, timeZone: string): LocalParts {
  const parts: Record<string, number> = {};
  for (const part of formatterFor(timeZone).formatToParts(instant)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year ?? 0,
    month: parts.month ?? 1,
    day: parts.day ?? 1,
    hour: parts.hour ?? 0,
  };
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

function toParaDay(year: number, month: number, day: number): ParaDay {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/** Days since 1970-01-01 for a calendar date string. */
function dayNumber(day: ParaDay): number {
  const [year, month, date] = day.split('-').map(Number);
  return Math.round(Date.UTC(year ?? 0, (month ?? 1) - 1, date ?? 1) / 86_400_000);
}

export function isParaDay(value: string): value is ParaDay {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return addDays(value, 0) === value;
}

/**
 * The ParaLeet day that `instant` falls on, for someone in `timeZone`. The rule is only "local
 * hour below the boundary belongs to the previous date", so a boundary hour skipped by a
 * spring-forward needs no special case, and a repeated hour on a fall-back day gives both passes
 * the same day.
 */
export function paraDayOf(instant: Date, timeZone: string, boundaryHour: number = DEFAULT_BOUNDARY_HOUR): ParaDay {
  if (!Number.isInteger(boundaryHour) || boundaryHour < 0 || boundaryHour > 23) {
    throw new RangeError(`Boundary hour must be an integer from 0 to 23, got ${boundaryHour}`);
  }
  // An unknown zone makes Intl throw a RangeError; it is never swallowed or replaced by another zone.
  const local = localParts(instant, timeZone);
  const calendarDay = toParaDay(local.year, local.month, local.day);
  return local.hour < boundaryHour ? addDays(calendarDay, -1) : calendarDay;
}

/** The calendar date `count` days after `day` (negative goes back). */
export function addDays(day: ParaDay, count: number): ParaDay {
  const date = new Date((dayNumber(day) + count) * 86_400_000);
  return toParaDay(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** Whole days from `from` to `to`: positive when `to` is later. */
export function daysBetween(from: ParaDay, to: ParaDay): number {
  return dayNumber(to) - dayNumber(from);
}

/** 0 for Monday through 6 for Sunday. */
export function weekdayIndex(day: ParaDay): number {
  // 1970-01-01 was a Thursday (index 3 when Monday is 0).
  return (((dayNumber(day) + 3) % 7) + 7) % 7;
}

/**
 * The day the app treats as today. Moving to an earlier time zone can make the computed day step
 * back behind a day the user already fed the pet on; the app's day never goes back past that, so
 * the pet does not turn hungry again and no day is counted twice. The guard only covers the two
 * days a time-zone move can explain, so a badly wrong system clock cannot freeze the app's day.
 */
export function effectiveToday(computed: ParaDay, lastFedDay: ParaDay | null): ParaDay {
  if (lastFedDay === null) return computed;
  const ahead = daysBetween(computed, lastFedDay);
  return ahead > 0 && ahead <= 2 ? lastFedDay : computed;
}
