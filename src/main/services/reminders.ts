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
  const assignment = buildTodayView(ctx, moment).assignment;
  const problem =
    assignment && !assignment.completed
      ? { title: assignment.problem.title, platformLabel: PLATFORM_LABELS[assignment.problem.platform] }
      : null;

  // Recorded before it is shown: a reminder lost to an error is better than one sent twice.
  saveReminderDays(ctx.db, markSent(pet.reminderDays, kind, today));
  ctx.notify({ ...reminderText(kind, problem), onClick: () => ctx.windows.openCard() });
  return kind;
}
