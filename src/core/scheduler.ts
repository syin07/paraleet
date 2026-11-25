// Spaced repetition (PRD section 5). One review card per attempted problem, scheduled by FSRS
// through the ts-fsrs library. A review is a full re-solve, so intervals are whole days.
//
// The exported signatures are the contract with the rest of the app. Implemented in SAN-106.
import type { ParaDay, Rating, ReviewCard } from './types';

export const DEFAULT_TARGET_RETENTION = 0.85;

export interface SchedulerOptions {
  /** Probability of recall the schedule aims for, between 0.7 and 0.97. */
  targetRetention: number;
}

const NOT_BUILT = 'The review scheduler is not built yet (SAN-106).';

/** The card for a problem after its first attempt. */
export function scheduleFirstAttempt(
  _problemId: number,
  _rating: Rating,
  _now: Date,
  _options: SchedulerOptions,
): ReviewCard {
  throw new Error(NOT_BUILT);
}

/** The card after one more attempt. A retired card stays retired but its state still updates. */
export function scheduleReview(_card: ReviewCard, _rating: Rating, _now: Date, _options: SchedulerOptions): ReviewCard {
  throw new Error(NOT_BUILT);
}

/**
 * Whole days until the next review for each rating, without changing anything. Pass `null` for a
 * problem with no card yet. Used for the "Next review in about 4 days" line on the report form.
 */
export function previewIntervals(
  _card: ReviewCard | null,
  _now: Date,
  _options: SchedulerOptions,
): Record<Rating, number> {
  throw new Error(NOT_BUILT);
}

/** "I've got this one": the card is never due again until it is reset. */
export function retireCard(_card: ReviewCard): ReviewCard {
  throw new Error(NOT_BUILT);
}

/** Clears the card's history, makes it active and due now. */
export function resetCard(_card: ReviewCard, _now: Date): ReviewCard {
  throw new Error(NOT_BUILT);
}

/** A rating given after the key insight was revealed is Hard at best. */
export function capRatingAfterReveal(rating: Rating, insightRevealed: boolean): Rating {
  if (!insightRevealed) return rating;
  return rating === 'good' || rating === 'easy' ? 'hard' : rating;
}

/** The ParaLeet day on which the card becomes due. */
export function dueDayOf(_card: ReviewCard, _timeZone: string, _boundaryHour: number): ParaDay {
  throw new Error(NOT_BUILT);
}

/** True when the card is active and its due day is `today` or earlier. */
export function isDueOn(_card: ReviewCard, _today: ParaDay, _timeZone: string, _boundaryHour: number): boolean {
  throw new Error(NOT_BUILT);
}
