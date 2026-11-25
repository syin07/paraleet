// Spaced repetition (PRD section 5). One review card per attempted problem, scheduled by FSRS
// through the ts-fsrs library. A review is a full re-solve, so intervals are whole days.
//
// The exported signatures are the contract with the rest of the app. Implemented in SAN-106.
import { createEmptyCard, fsrs, Rating as FsrsRating, State, type Card, type Grade } from 'ts-fsrs';
import { addDays, daysBetween, isParaDay, paraDayOf } from './day';
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
const MIN_RETENTION = 0.7;
const MAX_RETENTION = 0.97;
// The library's memory-state bounds (FSRS-6 model bounds).
const MIN_STABILITY = 0.001;
const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 10;

/** The stored state of a card with no history. Its shape is private to this file. */
function newState(): SchedulerState {
  return { stability: 0, difficulty: 0, scheduledDays: 0, reps: 0, lapses: 0, fsrsState: State.New, lastReviewDay: null };
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isCount(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value) && value >= 0;
}

/**
 * The library measures elapsed time in UTC calendar days between two instants. To make that equal
 * the ParaLeet-day difference whatever the clock time, the library only ever sees noon UTC of a
 * ParaLeet day ("day space").
 */
function daySpace(day: ParaDay): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, date ?? 1, 12));
}

/**
 * Library card from stored state, with the last review placed in day space. Returns null for a
 * damaged state (the caller then schedules from scratch). A last review after today is a clock
 * error, not damage: the memory state is kept and the elapsed time is 0 days.
 */
function toFsrsCard(state: SchedulerState, today: ParaDay): Card | null {
  const { stability, difficulty, scheduledDays, reps, lapses, fsrsState, lastReviewDay } = state;
  if (!isNumber(scheduledDays) || !isCount(reps) || !isCount(lapses)) return null;
  if (!isNumber(stability) || !isNumber(difficulty)) return null;
  if (lastReviewDay !== null && (typeof lastReviewDay !== 'string' || !isParaDay(lastReviewDay))) return null;
  if (fsrsState === State.New) {
    if (reps !== 0) return null;
    return { ...createEmptyCard(daySpace(today)) };
  }
  if (fsrsState !== State.Learning && fsrsState !== State.Review && fsrsState !== State.Relearning) return null;
  // Same bounds the library enforces on a memory state.
  if (stability < MIN_STABILITY || difficulty < MIN_DIFFICULTY || difficulty > MAX_DIFFICULTY) return null;
  // A card with history always knows when it was last reviewed. Without that day the gap would
  // silently count as zero and the next interval would be far too short.
  if (lastReviewDay === null) return null;
  const card: Card = {
    due: daySpace(today),
    stability,
    difficulty,
    scheduled_days: scheduledDays,
    learning_steps: 0,
    reps,
    lapses,
    state: fsrsState,
  };
  card.last_review = daySpace(daysBetween(lastReviewDay, today) < 0 ? today : lastReviewDay);
  return card;
}

function engine(options: SchedulerOptions) {
  if (!(options.targetRetention >= MIN_RETENTION && options.targetRetention <= MAX_RETENTION)) {
    throw new RangeError(
      `targetRetention must be between ${MIN_RETENTION} and ${MAX_RETENTION}, got ${options.targetRetention}`,
    );
  }
  // No same-day steps and no fuzz: every interval is a deterministic whole number of days.
  return fsrs({
    request_retention: options.targetRetention,
    enable_short_term: false,
    enable_fuzz: false,
  });
}

/** An instant on ParaLeet day today + intervalDays, found by whole-hour nudges from now + N * 24h. */
function dueInstant(now: Date, intervalDays: number, options: SchedulerOptions): Date {
  const target = addDays(paraDayOf(now, options.timeZone, options.boundaryHour), intervalDays);
  let candidate = new Date(now.getTime() + intervalDays * 24 * HOUR_MS);
  // A clock change shifts the wall time by an hour, which can land on the neighbouring day.
  for (let i = 0; i < 4; i++) {
    const off = daysBetween(paraDayOf(candidate, options.timeZone, options.boundaryHour), target);
    if (off === 0) return candidate;
    candidate = new Date(candidate.getTime() + off * HOUR_MS);
  }
  if (paraDayOf(candidate, options.timeZone, options.boundaryHour) === target) return candidate;
  throw new Error(
    `Could not place a due time on ${target} from ${now.toISOString()} in ${options.timeZone} with boundary hour ${options.boundaryHour}`,
  );
}

function applyRating(state: SchedulerState, rating: Rating, now: Date, options: SchedulerOptions) {
  const scheduler = engine(options);
  const today = paraDayOf(now, options.timeZone, options.boundaryHour);
  const stored = toFsrsCard(state, today);
  let next: Card;
  try {
    // A damaged state is scheduled as a new card.
    next = scheduler.next(stored ?? createEmptyCard(daySpace(today)), daySpace(today), GRADES[rating]).card;
  } catch (error) {
    // Last line of defence for stored values the checks above did not foresee. A brand-new
    // card failing here is a real bug and must surface.
    if (stored === null) throw error;
    next = scheduler.next(createEmptyCard(daySpace(today)), daySpace(today), GRADES[rating]).card;
  }
  const intervalDays = Math.max(1, Math.round(next.scheduled_days));
  const newStored: SchedulerState = {
    stability: next.stability,
    difficulty: next.difficulty,
    scheduledDays: next.scheduled_days,
    reps: next.reps,
    lapses: next.lapses,
    fsrsState: next.state,
    lastReviewDay: today,
  };
  return { state: newStored, dueAt: dueInstant(now, intervalDays, options).toISOString() };
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
