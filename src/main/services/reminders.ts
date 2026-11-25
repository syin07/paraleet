// The two daily reminders (PRD section 11): a first one and an evening one, each at most once a
// day, both skipped once Para is fed. The rules are in src/core/reminders.ts; this sends what is
// due and records it so a restart never sends it twice.
import { dueReminder, markSent, reminderText, type ReminderKind } from '../../core/reminders';
import { isFedOn } from '../../core/streak';
import { saveReminderDays } from '../../data/repos/pet';
import { PLATFORM_LABELS } from '../../platforms';
import { currentMoment, type AppContext } from './context';
import { buildTodayView } from './today';

/**
 * Sends the reminder that is due now, if any, and returns which one. Call it on the periodic
 * tick. Nothing is sent before Para has hatched: the first-launch flow is where the reminder
 * times are chosen.
 */
export function sendDueReminder(ctx: AppContext): ReminderKind | null {
  const moment = currentMoment(ctx);
  const { pet, settings, today } = moment;
  if (pet.hatchedAt === null) return null;
  const kind = dueReminder({
    now: moment.now,
    timeZone: moment.timeZone,
    dayBoundaryHour: settings.dayBoundaryHour,
    firstReminderTime: settings.firstReminderTime,
    eveningReminderTime: settings.eveningReminderTime,
    fedToday: isFedOn({ current: pet.currentStreak, longest: pet.longestStreak, lastFedDay: pet.lastFedDay }, today),
    today,
    sent: pet.reminderDays,
  });
  if (kind === null) return null;

  // Reading Today assigns the day's problem if the app has not been looked at yet, so the
  // reminder can name it.
  let problem: { title: string; platformLabel: string } | null = null;
  try {
    const assignment = buildTodayView(ctx, moment).assignment;
    if (assignment && !assignment.completed) {
      problem = { title: assignment.problem.title, platformLabel: PLATFORM_LABELS[assignment.problem.platform] };
    }
  } catch {
    // The day's problem could not be read. Para is still hungry: remind without naming it.
  }

  // Recorded before it is shown: a reminder lost to an error is better than one sent twice.
  saveReminderDays(ctx.db, markSent(pet.reminderDays, kind, today));
  ctx.notify({ ...reminderText(kind, problem), onClick: () => ctx.windows.openCard() });
  return kind;
}

/**
 * Para has just hatched. Reminder times that had already passed today count as sent, so finishing
 * the first-launch screens late in the day is not answered with "Para is getting hungry" half a
 * minute later. Call inside the transaction that marks Para hatched.
 */
export function skipRemindersAlreadyPassed(ctx: AppContext): void {
  const moment = currentMoment(ctx);
  const { pet, settings, today } = moment;
  const passed = dueReminder({
    now: moment.now,
    timeZone: moment.timeZone,
    dayBoundaryHour: settings.dayBoundaryHour,
    firstReminderTime: settings.firstReminderTime,
    eveningReminderTime: settings.eveningReminderTime,
    fedToday: false,
    today,
    sent: { first: null, evening: null },
  });
  if (passed !== null) saveReminderDays(ctx.db, markSent(pet.reminderDays, passed, today));
}
