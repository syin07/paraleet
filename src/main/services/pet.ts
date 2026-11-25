// Para's state as the screens see it: mood, speech line, accessories. Everything here is derived
// from stored facts and the current time (PRD section 10); only the greeting day is written.
import type { PetSummary, TodayView } from '../../bridge/contract';
import { CHECKING_MS, celebrationEndsAt, deriveMood } from '../../core/pet';
import { stageFor } from '../../core/petFacts';
import { pickLine } from '../../core/petLines';
import { displayedStreak, isFedOn, missedDays, type StreakState } from '../../core/streak';
import {
  ACCESSORY_IDS,
  type AccessoryId,
  type GrowthStage,
  type Mood,
  type ParaDay,
  type Problem,
} from '../../core/types';
import { getAssignment } from '../../data/repos/assignments';
import { saveGreetedDay, saveHatched, type PetRecord } from '../../data/repos/pet';
import { getProblem } from '../../data/repos/problems';
import { updateSettings } from '../../data/repos/settings';
import { PLATFORM_LABELS } from '../../platforms';
import { currentMoment, type AppContext, type Moment } from './context';

/** Accessories in the fixed order of `ACCESSORY_IDS`, dropping anything unknown. */
export function knownAccessories(stored: readonly string[]): AccessoryId[] {
  return ACCESSORY_IDS.filter((id) => stored.includes(id));
}

function streakState(pet: PetRecord): StreakState {
  return { current: pet.currentStreak, longest: pet.longestStreak, lastFedDay: pet.lastFedDay };
}

/**
 * True once the "missed you" greeting has been seen since Para was last fed. The greeting is for
 * coming back after an absence, so it shows once per absence, not once per day.
 */
function greetedSinceLastFed(pet: PetRecord, today: ParaDay): boolean {
  // A greeting dated after today was recorded under a wrong clock: it does not count.
  if (pet.greetedDay === null || pet.greetedDay > today) return false;
  return pet.lastFedDay === null || pet.greetedDay > pet.lastFedDay;
}

/** Para's mood at this moment (PRD section 6). Never stored. */
export function moodAt(ctx: AppContext, moment: Moment): Mood {
  const { now, timeZone, settings, pet, today } = moment;
  const state = streakState(pet);
  return deriveMood({
    now,
    timeZone,
    dayBoundaryHour: settings.dayBoundaryHour,
    firstReminderTime: settings.firstReminderTime,
    eveningReminderTime: settings.eveningReminderTime,
    fedToday: isFedOn(state, today),
    missedDays: missedDays(state, today),
    greetedToday: greetedSinceLastFed(pet, today),
    celebration: ctx.session.celebration,
  });
}

/**
 * What Para is and says right now. `openProblem` is today's problem while it is still to do; the
 * unfed lines may name it.
 */
export function petSummary(ctx: AppContext, moment: Moment, openProblem: Problem | null): PetSummary {
  const { pet, today } = moment;
  const mood = moodAt(ctx, moment);
  const unlocked = knownAccessories(pet.unlockedAccessories);
  return {
    seed: pet.seed,
    stage: stageFor(pet.growthSolves),
    growthSolves: pet.growthSolves,
    totalAttempts: pet.totalAttempts,
    mood,
    line: pickLine({
      seed: pet.seed,
      today,
      mood,
      problemTitle: openProblem?.title ?? null,
      platformLabel: openProblem ? PLATFORM_LABELS[openProblem.platform] : null,
      streak: displayedStreak(streakState(pet), today),
    }),
    unlockedAccessories: unlocked,
    equippedAccessories: knownAccessories(pet.equippedAccessories).filter((id) => unlocked.includes(id)),
    hatched: pet.hatchedAt !== null,
  };
}

const MOOD_WORDS: Record<Mood, string> = {
  sleeping: 'asleep',
  content: 'content',
  peckish: 'peckish',
  hungry: 'hungry',
  checking: 'checking your report',
  eating: 'eating',
  nibbling: 'nibbling',
  missed_you: 'happy to see you',
};

/** What the menu bar icon shows: Para's look right now, the streak, and a line for the tooltip. */
export function trayState(ctx: AppContext): {
  seed: number;
  stage: GrowthStage;
  mood: Mood;
  accessories: AccessoryId[];
  streak: number;
  tooltip: string;
} {
  const moment = currentMoment(ctx);
  const summary = petSummary(ctx, moment, null);
  const streak = displayedStreak(streakState(moment.pet), moment.today);
  return {
    seed: summary.seed,
    stage: summary.stage,
    mood: summary.mood,
    accessories: summary.equippedAccessories,
    streak,
    tooltip: `Para is ${MOOD_WORDS[summary.mood]}${streak > 0 ? ` · ${streak}-day streak` : ''}`,
  };
}

/** Today's problem while it is still to do, without assigning one. */
export function openProblemToday(ctx: AppContext, moment: Moment): Problem | null {
  const assignment = getAssignment(ctx.db, moment.today);
  if (!assignment || assignment.completed) return null;
  return getProblem(ctx.db, assignment.problemId);
}

/**
 * The user has seen the "missed you" greeting. Para goes back to its normal mood for the time of
 * day. Does nothing when there is no greeting to acknowledge.
 */
export function acknowledgeGreeting(ctx: AppContext, buildToday: (ctx: AppContext) => TodayView): TodayView {
  const moment = currentMoment(ctx);
  if (moodAt(ctx, moment) === 'missed_you') {
    saveGreetedDay(ctx.db, moment.today);
    ctx.notifyChanged();
  }
  return buildToday(ctx);
}

/**
 * The first-launch flow is finished: Para has hatched and the reminder times are chosen. Safe to
 * call again; the first hatching time is kept.
 */
export function completeOnboarding(
  ctx: AppContext,
  input: { firstReminderTime: string; eveningReminderTime: string },
  buildToday: (ctx: AppContext) => TodayView,
): TodayView {
  ctx.db.transaction(() => {
    updateSettings(ctx.db, {
      firstReminderTime: input.firstReminderTime,
      eveningReminderTime: input.eveningReminderTime,
    });
    // Make sure the pet exists before marking it hatched.
    const moment = currentMoment(ctx);
    saveHatched(ctx.db, moment.now.toISOString());
  });
  ctx.notifyChanged();
  return buildToday(ctx);
}

/**
 * When Para's mood will next change because a celebration moves on (checking, then eating or
 * nibbling, then back to normal), or null when no celebration is playing. Main sets a short timer
 * for it so the windows redraw at the right moment.
 */
export function nextCelebrationStep(ctx: AppContext): Date | null {
  const celebration = ctx.session.celebration;
  if (!celebration) return null;
  const now = ctx.clock.now().getTime();
  const started = celebration.reportedAt.getTime();
  const end = celebrationEndsAt(celebration).getTime();
  if (now < started || now >= end) {
    // Over, or the clock moved back: nothing left to play.
    ctx.session.celebration = null;
    return null;
  }
  const checkingEnds = started + CHECKING_MS;
  return new Date(now < checkingEnds ? checkingEnds : end);
}

/**
 * Notices when the mood has changed since the last look (a reminder time passed, night fell, a
 * celebration ended) and tells the windows. Call it on the periodic tick.
 */
export function createMoodWatcher(ctx: AppContext): { check(): boolean } {
  let lastSeen: Mood | null = null;
  return {
    check() {
      const mood = moodAt(ctx, currentMoment(ctx));
      const changed = lastSeen !== null && mood !== lastSeen;
      lastSeen = mood;
      if (changed) ctx.notifyChanged();
      return changed;
    },
  };
}
