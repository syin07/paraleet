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

export const EMPTY_STREAK: StreakState = { current: 0, longest: 0, lastFedDay: null };

/** The streak after an attempt on `day`. Later attempts on an already-fed day change nothing. */
export function applyFedDay(state: StreakState, day: ParaDay): StreakState {
  if (state.lastFedDay !== null) {
    const gap = daysBetween(state.lastFedDay, day);
    // gap <= 0: the same day, or an earlier day after the clock moved back (a time-zone change).
    if (gap <= 0) return state;
    if (gap === 1) {
      const current = state.current + 1;
      return { current, longest: Math.max(state.longest, current), lastFedDay: day };
    }
  }
  return { current: 1, longest: Math.max(state.longest, 1), lastFedDay: day };
}

/** True when the pet has been fed for `today`. */
export function isFedOn(state: StreakState, today: ParaDay): boolean {
  return state.lastFedDay !== null && daysBetween(state.lastFedDay, today) <= 0;
}

/** Full ParaLeet days with no attempt between the last fed day and `today`. */
export function missedDays(state: StreakState, today: ParaDay): number {
  if (state.lastFedDay === null) return 0;
  return Math.max(0, daysBetween(state.lastFedDay, today) - 1);
}

/** The streak to show on `today`: zero once a full day has been missed. */
export function displayedStreak(state: StreakState, today: ParaDay): number {
  if (state.lastFedDay === null) return 0;
  return missedDays(state, today) > 0 ? 0 : state.current;
}
