// Today: the assignment for the current ParaLeet day and everything the Today screen shows.
import type { StreakSummary, SwapCandidatesView, TodayView } from '../../bridge/contract';
import { chooseDailyProblem, otherDueReviews, swapCandidates } from '../../core/assignment';
import { addDays, weekdayIndex } from '../../core/day';
import { stageFor } from '../../core/petFacts';
import { dueDayOf, isDueOn } from '../../core/scheduler';
import { displayedStreak, isFedOn } from '../../core/streak';
import type { AssignmentInput } from '../../core/types';
import {
  getAssignment,
  listAssignmentsBefore,
  saveAssignment,
  type DailyAssignment,
} from '../../data/repos/assignments';
import { countAttemptsOnDay, listFedDays } from '../../data/repos/attempts';
import { listActiveCards } from '../../data/repos/cards';
import { getProblem, listStarterQueue } from '../../data/repos/problems';
import { currentMoment, type AppContext, type Moment } from './context';
import { requireProblem, toDueReviewItems, toSummary } from './views';

/** Everything the assignment policy needs, read from the database. */
export function readAssignmentInput(ctx: AppContext, moment: Moment): AssignmentInput {
  const { today, timeZone, settings } = moment;
  const dueReviews = listActiveCards(ctx.db)
    .filter((card) => isDueOn(card, today, timeZone, settings.dayBoundaryHour))
    .map((card) => ({ problemId: card.problemId, dueDay: dueDayOf(card, timeZone, settings.dayBoundaryHour) }));
  return {
    today,
    dueReviews,
    recentAssignments: listAssignmentsBefore(ctx.db, today, 7),
    planQueue: [], // Plans arrive in M3.
    starterQueue: listStarterQueue(ctx.db),
  };
}

/** Returns today's assignment, choosing and saving one the first time a day is seen. */
export function ensureAssignment(ctx: AppContext, moment: Moment, input: AssignmentInput): DailyAssignment | null {
  const existing = getAssignment(ctx.db, moment.today);
  if (existing) return existing;
  const choice = chooseDailyProblem(input);
  if (choice.kind === 'none') return null;
  const assignment: DailyAssignment = {
    day: moment.today,
    problemId: choice.problemId,
    reason: choice.reason,
    completed: false,
    assignedAt: moment.now.toISOString(),
  };
  saveAssignment(ctx.db, assignment);
  return assignment;
}

function streakSummary(ctx: AppContext, moment: Moment): StreakSummary {
  const { today, pet } = moment;
  const monday = addDays(today, -weekdayIndex(today));
  const fedDays = new Set(listFedDays(ctx.db, monday, addDays(monday, 6)));
  const state = { current: pet.currentStreak, longest: pet.longestStreak, lastFedDay: pet.lastFedDay };
  return {
    current: displayedStreak(state, today),
    longest: pet.longestStreak,
    week: Array.from({ length: 7 }, (_, index) => {
      const day = addDays(monday, index);
      return { day, fed: fedDays.has(day), isToday: day === today };
    }),
  };
}

export function buildTodayView(ctx: AppContext, moment: Moment): TodayView {
  return ctx.db.transaction(() => {
    const { today, pet } = moment;
    const input = readAssignmentInput(ctx, moment);
    const assignment = ensureAssignment(ctx, moment, input);
    const problem = assignment ? getProblem(ctx.db, assignment.problemId) : null;
    const others = otherDueReviews(input, assignment?.problemId ?? null);
    return {
      today,
      fed: isFedOn({ current: pet.currentStreak, longest: pet.longestStreak, lastFedDay: pet.lastFedDay }, today),
      attemptsToday: countAttemptsOnDay(ctx.db, today),
      assignment:
        assignment && problem
          ? { problem: toSummary(problem), reason: assignment.reason, completed: assignment.completed }
          : null,
      dueReviews: toDueReviewItems(ctx.db, others, moment),
      streak: streakSummary(ctx, moment),
      pet: {
        seed: pet.seed,
        stage: stageFor(pet.growthSolves),
        growthSolves: pet.growthSolves,
        totalAttempts: pet.totalAttempts,
      },
    };
  });
}

export function getToday(ctx: AppContext): TodayView {
  return buildTodayView(ctx, currentMoment(ctx));
}

export function getSwapCandidates(ctx: AppContext): SwapCandidatesView {
  const moment = currentMoment(ctx);
  const input = readAssignmentInput(ctx, moment);
  const assignment = getAssignment(ctx.db, moment.today);
  const candidates = swapCandidates(input, assignment?.problemId ?? null);
  return {
    reviews: toDueReviewItems(ctx.db, candidates.reviews, moment),
    plan: candidates.plan.flatMap((id) => {
      const problem = getProblem(ctx.db, id);
      return problem ? [toSummary(problem)] : [];
    }),
  };
}

/** Swaps today's problem for another due review or plan problem (PRD section 4). */
export function swapToday(ctx: AppContext, problemId: number): TodayView {
  const moment = currentMoment(ctx);
  requireProblem(ctx.db, problemId);
  ctx.db.transaction(() => {
    const input = readAssignmentInput(ctx, moment);
    const current = ensureAssignment(ctx, moment, input);
    if (current?.completed) throw new Error("Today's problem is already done, so there is nothing to swap");
    const candidates = swapCandidates(input, current?.problemId ?? null);
    const allowed = candidates.reviews.some((review) => review.problemId === problemId) || candidates.plan.includes(problemId);
    if (!allowed) throw new Error('That problem is not one of the swap choices for today');
    saveAssignment(ctx.db, {
      day: moment.today,
      problemId,
      reason: 'user_swap',
      completed: false,
      assignedAt: moment.now.toISOString(),
    });
  });
  ctx.notifyChanged();
  return buildTodayView(ctx, currentMoment(ctx));
}
