// Maps stored records to the plain shapes the UI receives over the bridge.
import type { CardSummary, DueReviewItem, ProblemSummary } from '../../bridge/contract';
import { daysBetween } from '../../core/day';
import { dueDayOf, isDueOn } from '../../core/scheduler';
import type { DueReview, Problem, ReviewCard } from '../../core/types';
import type { Db } from '../../data/db';
import { getProblem } from '../../data/repos/problems';
import type { Moment } from './context';

export function toSummary(problem: Problem): ProblemSummary {
  return {
    id: problem.id,
    platform: problem.platform,
    platformId: problem.platformId,
    displayId: problem.displayId,
    title: problem.title,
    url: problem.url,
    difficultyRaw: problem.difficultyRaw,
    difficultyNorm: problem.difficultyNorm,
    topics: problem.topics,
  };
}

export function requireProblem(db: Db, problemId: number): Problem {
  const problem = getProblem(db, problemId);
  if (!problem) throw new Error(`Problem ${problemId} does not exist`);
  return problem;
}

export function toCardSummary(card: ReviewCard, moment: Moment): CardSummary {
  const { timeZone, settings, today } = moment;
  return {
    status: card.status,
    dueDay: dueDayOf(card, timeZone, settings.dayBoundaryHour),
    isDue: isDueOn(card, today, timeZone, settings.dayBoundaryHour),
  };
}

export function toDueReviewItems(db: Db, reviews: readonly DueReview[], moment: Moment): DueReviewItem[] {
  return reviews.flatMap((review) => {
    const problem = getProblem(db, review.problemId);
    if (!problem) return [];
    return [
      {
        problem: toSummary(problem),
        dueDay: review.dueDay,
        daysOverdue: Math.max(0, daysBetween(review.dueDay, moment.today)),
      },
    ];
  });
}
