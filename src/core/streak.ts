// Streak rules (PRD section 6). The streak counts consecutive ParaLeet days with at least one
// attempt. A missed day resets it to zero. That is the only penalty in the app.
import { daysBetween } from './day';
import type { ParaDay } from './types';

export interface StreakState {
  /** The streak as of `lastFedDay`. */
  current: number;
  longest: number;
  lastFedDay: ParaDay | null;
}

export const EMPTY_STREAK: StreakState = {
  current: 0,
  longest: 0,
  lastFedDay: null,
};

/** How far ahead of today a last fed day can be and still be explained by a time-zone move. */
const MAX_ZONE_SHIFT_DAYS = 2;

/**
 * The streak after an attempt on `day`. Later attempts on an already-fed day change nothing.
 * An attempt dated up to 2 days before `lastFedDay` is a move to an earlier time zone and also
 * changes nothing. One dated further back means `lastFedDay` came from a wrong clock, so the
 * streak starts over from `day`; `longest` never goes down.
 */
export function applyFedDay(state: StreakState, day: ParaDay): StreakState {
  if (state.lastFedDay !== null) {
    const gap = daysBetween(state.lastFedDay, day);
    if (gap <= 0 && gap >= -MAX_ZONE_SHIFT_DAYS) return state;
    if (gap === 1) {
      const current = state.current + 1;
      return {
        current,
        longest: Math.max(state.longest, current),
        lastFedDay: day,
      };
    }
  }
  return { current: 1, longest: Math.max(state.longest, 1), lastFedDay: day };
}

/**
 * True when the pet has been fed for `today`. A last fed day more than 2 days ahead is a clock
 * error, not a time-zone move, so it does not count.
 */
export function isFedOn(state: StreakState, today: ParaDay): boolean {
  if (state.lastFedDay === null) return false;
  const ahead = daysBetween(today, state.lastFedDay);
  return ahead >= 0 && ahead <= MAX_ZONE_SHIFT_DAYS;
}

/** Full ParaLeet days with no attempt between the last fed day and `today`. */
export function missedDays(state: StreakState, today: ParaDay): number {
  if (state.lastFedDay === null) return 0;
  return Math.max(0, daysBetween(state.lastFedDay, today) - 1);
}

/** The streak to show on `today`: zero once a full day has been missed or the last fed day is a clock error. */
export function displayedStreak(state: StreakState, today: ParaDay): number {
  if (state.lastFedDay === null) return 0;
  if (daysBetween(today, state.lastFedDay) > MAX_ZONE_SHIFT_DAYS) return 0;
  return missedDays(state, today) > 0 ? 0 : state.current;
}
