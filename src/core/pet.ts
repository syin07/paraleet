// Which mood Para is in right now (PRD section 6). Derived from stored facts and the clock,
// never stored. Time and time zone are arguments; nothing here reads the system clock.
import type { Mood } from './types';

/** How long each part of the celebration after a report lasts. */
export const CHECKING_MS = 2000;
export const EATING_MS = 3000;
export const NIBBLING_MS = 1500;
/** Fed and at or after this local hour (until the day boundary), Para sleeps. */
export const BEDTIME_HOUR = 23;

const MINUTES_PER_DAY = 1440;

export type Celebration = { meal: 'full' | 'crumb'; reportedAt: Date };

export interface MoodInput {
  now: Date;
  timeZone: string;
  dayBoundaryHour: number;
  firstReminderTime: string; // 'HH:MM', local wall-clock time
  eveningReminderTime: string; // 'HH:MM'
  /** True when at least one attempt was reported on the current ParaLeet day. */
  fedToday: boolean;
  /** Full ParaLeet days with no attempt before today (`missedDays` in streak.ts). 0 for a new install. */
  missedDays: number;
  /** True once the user has seen today's "missed you" greeting. */
  greetedToday: boolean;
  /** The most recent report, while its celebration may still be playing; otherwise null. */
  celebration: Celebration | null;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function localMinutesOfDay(now: Date, timeZone: string): number {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      hour: '2-digit',
      minute: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  let hour = 0;
  let minute = 0;
  for (const part of formatter.formatToParts(now)) {
    if (part.type === 'hour') hour = Number(part.value);
    if (part.type === 'minute') minute = Number(part.value);
  }
  return hour * 60 + minute;
}

function shiftToParaDay(minutesOfDay: number, dayBoundaryHour: number): number {
  return (((minutesOfDay - dayBoundaryHour * 60) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/** Minutes since the current ParaLeet day began: 0 at the boundary hour, up to 1439. */
export function minutesIntoParaDay(now: Date, timeZone: string, dayBoundaryHour: number): number {
  return shiftToParaDay(localMinutesOfDay(now, timeZone), dayBoundaryHour);
}

/** The same for a wall-clock time of day such as '16:00'. Times before the boundary hour belong to the end of the day. */
export function reminderMinutesIntoParaDay(time: string, dayBoundaryHour: number): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  const hour = match ? Number(match[1]) : NaN;
  const minute = match ? Number(match[2]) : NaN;
  if (!match || hour > 23 || minute > 59) throw new RangeError(`Reminder time must be HH:MM, got "${time}"`);
  return shiftToParaDay(hour * 60 + minute, dayBoundaryHour);
}

/** The two reminder times in day order: if they are entered out of order, the later one is the evening one. */
export function orderedReminderMinutes(
  firstTime: string,
  eveningTime: string,
  dayBoundaryHour: number,
): { first: number; evening: number } {
  const a = reminderMinutesIntoParaDay(firstTime, dayBoundaryHour);
  const b = reminderMinutesIntoParaDay(eveningTime, dayBoundaryHour);
  return { first: Math.min(a, b), evening: Math.max(a, b) };
}

function mealMs(meal: Celebration['meal']): number {
  return meal === 'full' ? EATING_MS : NIBBLING_MS;
}

/** When the celebration for a report is over, so the caller knows when to ask again. */
export function celebrationEndsAt(celebration: Celebration): Date {
  return new Date(celebration.reportedAt.getTime() + CHECKING_MS + mealMs(celebration.meal));
}

function celebrationMood(celebration: Celebration, now: Date): Mood | null {
  const elapsed = now.getTime() - celebration.reportedAt.getTime();
  // A report dated after `now` means the clock moved back; do not replay it.
  if (elapsed < 0) return null;
  if (elapsed < CHECKING_MS) return 'checking';
  if (elapsed < CHECKING_MS + mealMs(celebration.meal)) return celebration.meal === 'full' ? 'eating' : 'nibbling';
  return null;
}

export function deriveMood(input: MoodInput): Mood {
  if (input.celebration) {
    const mood = celebrationMood(input.celebration, input.now);
    if (mood) return mood;
  }
  if (!input.fedToday && input.missedDays >= 1 && !input.greetedToday) return 'missed_you';

  if (input.fedToday) {
    const local = localMinutesOfDay(input.now, input.timeZone);
    const late = local >= BEDTIME_HOUR * 60 || local < input.dayBoundaryHour * 60;
    return late ? 'sleeping' : 'content';
  }

  const minutes = minutesIntoParaDay(input.now, input.timeZone, input.dayBoundaryHour);
  const times = orderedReminderMinutes(input.firstReminderTime, input.eveningReminderTime, input.dayBoundaryHour);
  if (minutes >= times.evening) return 'hungry';
  if (minutes >= times.first) return 'peckish';
  return 'sleeping';
}
