// Accessories unlock at milestones and stay unlocked (PRD section 6).
import { ACCESSORY_IDS, type AccessoryId, type Rating } from './types';

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
