// The daily assignment policy (PRD sections 4 and 5): which problem fills today's slot.
// Pure functions of their input. The full order (overdue review, plan, starter, and the
// 3-days-of-reviews rule) is implemented in SAN-107; this version knows only the starter list.
import type { AssignmentChoice, AssignmentInput, DueReview, SwapCandidates } from './types';

/** At most this many due reviews are ever shown (PRD section 5). */
export const MAX_DUE_REVIEWS_SHOWN = 5;

/** Picks today's problem. */
export function chooseDailyProblem(input: AssignmentInput): AssignmentChoice {
  const starter = input.starterQueue[0];
  if (starter !== undefined) return { kind: 'assigned', problemId: starter, reason: 'starter' };
  return { kind: 'none' };
}

/** The other due reviews to list on Today: most overdue first, at most 5, never today's problem. */
export function otherDueReviews(_input: AssignmentInput, _assignedProblemId: number | null): DueReview[] {
  return [];
}

/** What the user may swap today's problem for. */
export function swapCandidates(_input: AssignmentInput, _assignedProblemId: number | null): SwapCandidates {
  return { reviews: [], plan: [] };
}
