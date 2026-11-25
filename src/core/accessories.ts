// Accessories unlock at milestones and stay unlocked (PRD section 6).
import { applyAttempt, EMPTY_PET_FACTS, isGrowthSolve } from './petFacts';
import { ACCESSORY_IDS, type AccessoryId, type ParaDay, type Rating } from './types';

export interface MilestoneFacts {
  /** True once any growth solve (rated Hard, Good or Easy) was on a problem whose normalized difficulty is 4 or 5. */
  solvedHardProblem: boolean;
  longestStreak: number;
  plansFinished: number;
}

const EARNED_WHEN: Record<AccessoryId, (facts: MilestoneFacts) => boolean> = {
  scarf: (facts) => facts.solvedHardProblem,
  bow_tie: (facts) => facts.longestStreak >= 7,
  crown: (facts) => facts.longestStreak >= 30,
  grad_cap: (facts) => facts.plansFinished >= 1,
};

/** Every accessory these facts have earned, in the fixed order of ACCESSORY_IDS. */
export function earnedAccessories(facts: MilestoneFacts): AccessoryId[] {
  return ACCESSORY_IDS.filter((id) => EARNED_WHEN[id](facts));
}

/**
 * What to store after an update: everything already unlocked plus anything newly earned. Never
 * removes one. Callers recording an attempt use `unlockedAfterAttempt`, which honors the Again rule.
 */
export function mergeUnlocked(alreadyUnlocked: readonly AccessoryId[], facts: MilestoneFacts): AccessoryId[] {
  const earned = new Set(earnedAccessories(facts));
  return ACCESSORY_IDS.filter((id) => earned.has(id) || alreadyUnlocked.includes(id));
}

/**
 * What to store after an attempt. An attempt rated Again unlocks nothing (PRD section 6): the list
 * comes back unchanged, and whatever the facts have earned is picked up by the next attempt with
 * any other rating.
 */
export function unlockedAfterAttempt(
  alreadyUnlocked: readonly AccessoryId[],
  facts: MilestoneFacts,
  rating: Rating,
): AccessoryId[] {
  if (rating === 'again') return ACCESSORY_IDS.filter((id) => alreadyUnlocked.includes(id));
  return mergeUnlocked(alreadyUnlocked, facts);
}

/** The accessories in `after` that are not in `before`, for celebrating a new unlock. */
export function newlyUnlocked(before: readonly AccessoryId[], after: readonly AccessoryId[]): AccessoryId[] {
  return ACCESSORY_IDS.filter((id) => after.includes(id) && !before.includes(id));
}

/** A problem counts as Hard for the scarf when its normalized difficulty is 4 or 5. */
export const HARD_DIFFICULTY_NORM = 4;

/** One attempt as the unlock rules see it. */
export interface UnlockAttempt {
  paraDay: ParaDay;
  rating: Rating;
  /** True when the attempted problem's normalized difficulty is 4 or 5. */
  hardProblem: boolean;
  /**
   * How many plans counted as finished when this attempt was recorded, the plan this attempt
   * finished included. Left out means none.
   */
  plansFinished?: number;
}

/**
 * Every accessory the attempts have unlocked, replayed in the order they were recorded exactly
 * as reporting them one by one would have. Each attempt sees only the plans that were finished
 * when it was recorded: a plan finished by an attempt rated Again earns the graduation cap with
 * the next attempt of another rating, never with an earlier one.
 */
export function replayUnlocks(attempts: readonly UnlockAttempt[]): AccessoryId[] {
  let facts = EMPTY_PET_FACTS;
  let solvedHardProblem = false;
  let unlocked: AccessoryId[] = [];
  for (const attempt of attempts) {
    facts = applyAttempt(facts, attempt);
    if (attempt.hardProblem && isGrowthSolve(attempt.rating)) solvedHardProblem = true;
    unlocked = unlockedAfterAttempt(
      unlocked,
      { solvedHardProblem, longestStreak: facts.longestStreak, plansFinished: attempt.plansFinished ?? 0 },
      attempt.rating,
    );
  }
  return unlocked;
}
