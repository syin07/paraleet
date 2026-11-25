// The pet facts derived from attempts: totals, growth and streak. `attempts` is the source of
// truth (PRD section 10); the stored facts must always equal `recomputePetFacts(attempts)`.
import { applyFedDay } from './streak';
import type { GrowthStage, ParaDay, PetFacts, Rating } from './types';

export const EMPTY_PET_FACTS: PetFacts = {
  growthSolves: 0,
  totalAttempts: 0,
  currentStreak: 0,
  longestStreak: 0,
  lastFedDay: null,
};

/** Growth thresholds are final (PRD section 6). */
export const GROWTH_THRESHOLDS: Record<GrowthStage, number> = {
  egg: 0,
  chick: 3,
  fledgling: 15,
  adult: 50,
};

export interface AttemptFact {
  paraDay: ParaDay;
  rating: Rating;
}

/** Hard, Good and Easy are growth solves. Again keeps the streak but does not grow the bird. */
export function isGrowthSolve(rating: Rating): boolean {
  return rating !== 'again';
}

export function stageFor(growthSolves: number): GrowthStage {
  if (growthSolves >= GROWTH_THRESHOLDS.adult) return 'adult';
  if (growthSolves >= GROWTH_THRESHOLDS.fledgling) return 'fledgling';
  if (growthSolves >= GROWTH_THRESHOLDS.chick) return 'chick';
  return 'egg';
}

/** The facts after one more attempt. */
export function applyAttempt(facts: PetFacts, attempt: AttemptFact): PetFacts {
  const streak = applyFedDay(
    { current: facts.currentStreak, longest: facts.longestStreak, lastFedDay: facts.lastFedDay },
    attempt.paraDay,
  );
  return {
    growthSolves: facts.growthSolves + (isGrowthSolve(attempt.rating) ? 1 : 0),
    totalAttempts: facts.totalAttempts + 1,
    currentStreak: streak.current,
    longestStreak: streak.longest,
    lastFedDay: streak.lastFedDay,
  };
}

/** Recomputes every fact from the full list of attempts, given in the order they were recorded. */
export function recomputePetFacts(attempts: readonly AttemptFact[]): PetFacts {
  return attempts.reduce(applyAttempt, EMPTY_PET_FACTS);
}
