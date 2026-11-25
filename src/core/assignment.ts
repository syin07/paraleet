// The daily assignment policy (PRD sections 4 and 5): which problem fills today's slot.
// Pure functions of their input; the day is an argument. Order: overdue review, then the
// active plan, then the starter list, except that after 3 days of reviews filling the slot
// the plan gets today's slot so a long backlog cannot starve it.
// Nothing here reports how many reviews are due beyond MAX_DUE_REVIEWS_SHOWN, on purpose.
import { addDays, daysBetween } from './day';
import type { AssignmentChoice, AssignmentInput, DueReview, SwapCandidates } from './types';

/** At most this many due reviews are ever shown (PRD section 5). */
export const MAX_DUE_REVIEWS_SHOWN = 5;

/** Days in a row of review-filled slots after which the plan gets a turn. */
const REVIEW_RUN_DAYS = 3;

/**
 * Reviews that are due today, most overdue first. Earliest due day wins, ties go to the lower
 * problem id. Not-yet-due entries are dropped and duplicate problems keep their earliest day.
 */
function sortedDueReviews(input: AssignmentInput): DueReview[] {
  const earliest = new Map<number, DueReview>();
  for (const review of input.dueReviews) {
    if (!(daysBetween(review.dueDay, input.today) >= 0)) continue; // also drops unreadable days
    const seen = earliest.get(review.problemId);
    if (seen === undefined || review.dueDay < seen.dueDay) earliest.set(review.problemId, review);
  }
  return [...earliest.values()]
    .map((review) => ({ problemId: review.problemId, dueDay: review.dueDay }))
    .sort((a, b) => (a.dueDay < b.dueDay ? -1 : a.dueDay > b.dueDay ? 1 : a.problemId - b.problemId));
}

/** True when each of the 3 days before today has entries and every entry is a review. */
function reviewsFilledRecentDays(input: AssignmentInput): boolean {
  for (let back = 1; back <= REVIEW_RUN_DAYS; back += 1) {
    const day = addDays(input.today, -back);
    const entries = input.recentAssignments.filter((entry) => entry.day === day);
    if (entries.length === 0 || entries.some((entry) => entry.reason !== 'review')) return false;
  }
  return true;
}

/** Picks today's problem. */
export function chooseDailyProblem(input: AssignmentInput): AssignmentChoice {
  const reviews = sortedDueReviews(input);
  const dueIds = new Set(reviews.map((review) => review.problemId));
  const nextPlan = input.planQueue.find((id) => !dueIds.has(id));
  const nextStarter = input.starterQueue.find((id) => !dueIds.has(id));
  const first = reviews[0];

  // Reviews fill the slot, unless they have done so 3 days running and a plan is waiting.
  if (first !== undefined && !(nextPlan !== undefined && reviewsFilledRecentDays(input))) {
    return { kind: 'assigned', problemId: first.problemId, reason: 'review' };
  }
  if (nextPlan !== undefined) return { kind: 'assigned', problemId: nextPlan, reason: 'plan' };
  if (nextStarter !== undefined) return { kind: 'assigned', problemId: nextStarter, reason: 'starter' };
  return { kind: 'none' };
}

/** The other due reviews to list on Today: most overdue first, at most 5, never today's problem. */
export function otherDueReviews(input: AssignmentInput, assignedProblemId: number | null): DueReview[] {
  return sortedDueReviews(input)
    .filter((review) => review.problemId !== assignedProblemId)
    .slice(0, MAX_DUE_REVIEWS_SHOWN);
}

/** What the user may swap today's problem for. */
export function swapCandidates(input: AssignmentInput, assignedProblemId: number | null): SwapCandidates {
  const reviews = otherDueReviews(input, assignedProblemId);
  const shownReviewIds = new Set(reviews.map((review) => review.problemId));
  const plan = input.planQueue
    .slice(0, MAX_DUE_REVIEWS_SHOWN)
    .filter((id) => id !== assignedProblemId && !shownReviewIds.has(id));
  return { reviews, plan };
}
