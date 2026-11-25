// When a reminder notification is due (PRD section 11, "Reminders"). Pure: the caller sends the
// notification and records it with `markSent`.
import { minutesIntoParaDay, orderedReminderMinutes } from './pet';
import type { ParaDay } from './types';

export type ReminderKind = 'first' | 'evening';

export interface ReminderInput {
  now: Date;
  timeZone: string;
  dayBoundaryHour: number;
  firstReminderTime: string;
  eveningReminderTime: string;
  fedToday: boolean;
  today: ParaDay;
  /** The ParaLeet day each reminder was last sent on, or null if never. */
  sent: Readonly<Record<ReminderKind, ParaDay | null>>;
}

type SentMap = Readonly<Record<ReminderKind, ParaDay | null>>;

// A day later than today means the clock moved back since it was sent, so it still counts as sent.
// ParaDay strings (YYYY-MM-DD) compare correctly as text.
function sentByToday(day: ParaDay | null, today: ParaDay): boolean {
  return day !== null && day >= today;
}

/** The reminder to send now, or null. At most one, and the later one wins when both are overdue. */
export function dueReminder(input: ReminderInput): ReminderKind | null {
  if (input.fedToday) return null;
  const minutes = minutesIntoParaDay(input.now, input.timeZone, input.dayBoundaryHour);
  const times = orderedReminderMinutes(input.firstReminderTime, input.eveningReminderTime, input.dayBoundaryHour);
  const eveningSent = sentByToday(input.sent.evening, input.today);
  if (minutes >= times.evening && !eveningSent) return 'evening';
  // Once the evening one went out, the first is superseded even if its own record is missing.
  if (minutes >= times.first && !eveningSent && !sentByToday(input.sent.first, input.today)) return 'first';
  return null;
}

/** What to record after sending `kind`: it, and any earlier reminder it supersedes, count as sent today. */
export function markSent(sent: SentMap, kind: ReminderKind, today: ParaDay): Record<ReminderKind, ParaDay | null> {
  return kind === 'evening' ? { first: today, evening: today } : { first: today, evening: sent.evening };
}

export function reminderText(
  kind: ReminderKind,
  problem: { title: string; platformLabel: string } | null,
): { title: string; body: string } {
  const title = kind === 'first' ? 'Para is peckish' : 'Para is getting hungry';
  if (problem)
    return {
      title,
      body: `Today: ${problem.title} on ${problem.platformLabel}`,
    };
  return {
    title,
    body: kind === 'first' ? 'Any problem you log feeds Para.' : 'Any problem you log tonight feeds Para.',
  };
}
