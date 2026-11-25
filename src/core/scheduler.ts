// Spaced repetition (PRD section 5). One review card per attempted problem, scheduled by FSRS
// through the ts-fsrs library. A review is a full re-solve, so intervals are whole days.
//
// The exported signatures are the contract with the rest of the app. Implemented in SAN-106.
import { createEmptyCard, fsrs, Rating as FsrsRating, State, type Card, type Grade } from 'ts-fsrs';
import { addDays, daysBetween, paraDayOf } from './day';
import type { ParaDay, Rating, ReviewCard, SchedulerState } from './types';

export const DEFAULT_TARGET_RETENTION = 0.85;

export interface SchedulerOptions {
  /** Probability of recall the schedule aims for, between 0.7 and 0.97. */
  targetRetention: number;
  /** IANA time zone name, used to place the due time on the intended ParaLeet day. */
  timeZone: string;
  /** Hour at which a ParaLeet day starts, see `day.ts`. */
  boundaryHour: number;
}

const GRADES: Record<Rating, Grade> = {
  again: FsrsRating.Again,
  hard: FsrsRating.Hard,
  good: FsrsRating.Good,
  easy: FsrsRating.Easy,
};
const RATING_LIST: readonly Rating[] = ['again', 'hard', 'good', 'easy'];
const HOUR_MS = 3_600_000;

/** The stored state of a card with no history. Its shape is private to this file. */
function newState(): SchedulerState {
  return { stability: 0, difficulty: 0, scheduledDays: 0, reps: 0, lapses: 0, fsrsState: State.New, lastReview: null };
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Library card from stored state; a damaged state is treated as a brand-new card. */
function toFsrsCard(state: SchedulerState, now: Date): Card {
  const { stability, difficulty, scheduledDays, reps, lapses, fsrsState, lastReview } = state;
  const lastReviewDate = typeof lastReview === 'string' ? new Date(lastReview) : null;
  const valid =
    isNumber(stability) &&
    isNumber(difficulty) &&
    isNumber(scheduledDays) &&
    isNumber(reps) &&
    isNumber(lapses) &&
    (fsrsState === State.New ||
      fsrsState === State.Learning ||
      fsrsState === State.Review ||
      fsrsState === State.Relearning) &&
    (lastReview === null || (lastReviewDate !== null && !Number.isNaN(lastReviewDate.getTime())));
  if (!valid) return createEmptyCard(now);
  const card: Card = {
    due: now,
    stability,
    difficulty,
    scheduled_days: scheduledDays,
    learning_steps: 0,
    reps,
    lapses,
    state: fsrsState,
  };
  if (lastReviewDate) card.last_review = lastReviewDate;
  return card;
}

function toState(card: Card): SchedulerState {
  return {
    stability: card.stability,
    difficulty: card.difficulty,
    scheduledDays: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    fsrsState: card.state,
    lastReview: card.last_review ? card.last_review.toISOString() : null,
  };
}

function engine(options: SchedulerOptions) {
  // No same-day steps and no fuzz: every interval is a deterministic whole number of days.
  return fsrs({
    request_retention: options.targetRetention,
    enable_short_term: false,
    enable_fuzz: false,
  });
}

/** The first instant, near `now` plus whole days, that lies on ParaLeet day today + intervalDays. */
function dueInstant(now: Date, intervalDays: number, options: SchedulerOptions): Date {
  const target = addDays(paraDayOf(now, options.timeZone, options.boundaryHour), intervalDays);
  let candidate = new Date(now.getTime() + intervalDays * 24 * HOUR_MS);
  // A clock change shifts the wall time by an hour, which can land on the neighbouring day.
  for (let i = 0; i < 4; i++) {
    const off = daysBetween(paraDayOf(candidate, options.timeZone, options.boundaryHour), target);
    if (off === 0) break;
    candidate = new Date(candidate.getTime() + off * HOUR_MS);
  }
  return candidate;
}

function applyRating(state: SchedulerState, rating: Rating, now: Date, options: SchedulerOptions) {
  const { card } = engine(options).next(toFsrsCard(state, now), now, GRADES[rating]);
  const intervalDays = Math.max(1, Math.round(card.scheduled_days));
  return { state: toState(card), dueAt: dueInstant(now, intervalDays, options).toISOString(), intervalDays };
}

/** The card for a problem after its first attempt. */
export function scheduleFirstAttempt(
  problemId: number,
  rating: Rating,
  now: Date,
  options: SchedulerOptions,
): ReviewCard {
  const { state, dueAt } = applyRating(newState(), rating, now, options);
  return { problemId, status: 'active', dueAt, state };
}

/** The card after one more attempt. A retired card stays retired but its state still updates. */
export function scheduleReview(card: ReviewCard, rating: Rating, now: Date, options: SchedulerOptions): ReviewCard {
  const { state, dueAt } = applyRating(card.state, rating, now, options);
  return { problemId: card.problemId, status: card.status, dueAt, state };
}

/**
 * Whole days until the next review for each rating, without changing anything. Pass `null` for a
 * problem with no card yet. Used for the "Next review in about 4 days" line on the report form.
 */
export function previewIntervals(
  card: ReviewCard | null,
  now: Date,
  options: SchedulerOptions,
): Record<Rating, number> {
  const state = card ? card.state : newState();
  const today = paraDayOf(now, options.timeZone, options.boundaryHour);
  const result = {} as Record<Rating, number>;
  for (const rating of RATING_LIST) {
    const { dueAt } = applyRating(state, rating, now, options);
    result[rating] = daysBetween(today, paraDayOf(new Date(dueAt), options.timeZone, options.boundaryHour));
  }
  return result;
}

/** "I've got this one": the card is never due again until it is reset. */
export function retireCard(card: ReviewCard): ReviewCard {
  return { ...card, status: 'retired' };
}

/** Clears the card's history, makes it active and due now. */
export function resetCard(card: ReviewCard, now: Date): ReviewCard {
  return { problemId: card.problemId, status: 'active', dueAt: now.toISOString(), state: newState() };
}

/** A rating given after the key insight was revealed is Hard at best. */
export function capRatingAfterReveal(rating: Rating, insightRevealed: boolean): Rating {
  if (!insightRevealed) return rating;
  return rating === 'good' || rating === 'easy' ? 'hard' : rating;
}

/** The ParaLeet day on which the card becomes due. Reads only `dueAt`, never `state`. */
export function dueDayOf(card: ReviewCard, timeZone: string, boundaryHour: number): ParaDay {
  return paraDayOf(new Date(card.dueAt), timeZone, boundaryHour);
}

/** True when the card is active and its due day is `today` or earlier. */
export function isDueOn(card: ReviewCard, today: ParaDay, timeZone: string, boundaryHour: number): boolean {
  if (card.status !== 'active') return false;
  return daysBetween(dueDayOf(card, timeZone, boundaryHour), today) >= 0;
}
