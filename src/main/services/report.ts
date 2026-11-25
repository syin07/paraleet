// Reporting an attempt: the step that feeds the pet (PRD section 4, steps 5 to 7).
import type { BridgeParsedInput, ReportContext, ReportResult } from '../../bridge/contract';
import { applyAttempt, stageFor } from '../../core/petFacts';
import {
  capRatingAfterReveal,
  dueDayOf,
  previewIntervals,
  scheduleFirstAttempt,
  scheduleReview,
  type SchedulerOptions,
} from '../../core/scheduler';
import { displayedStreak } from '../../core/streak';
import type { PetFacts } from '../../core/types';
import { verifyAttempt } from '../../core/verify';
import { getAssignment, markAssignmentCompleted } from '../../data/repos/assignments';
import { countAttemptsForProblem, insertAttempt } from '../../data/repos/attempts';
import { getCard, saveCard } from '../../data/repos/cards';
import { getNotes, saveNotes } from '../../data/repos/notes';
import { getPet, savePetFacts } from '../../data/repos/pet';
import { currentMoment, type AppContext, type Moment } from './context';
import { buildTodayView } from './today';
import { requireProblem, toSummary } from './views';

export function schedulerOptions(moment: Moment): SchedulerOptions {
  return {
    targetRetention: moment.settings.targetRetention,
    timeZone: moment.timeZone,
    boundaryHour: moment.settings.dayBoundaryHour,
  };
}

export function getReportContext(ctx: AppContext, problemId: number): ReportContext {
  const problem = requireProblem(ctx.db, problemId);
  const moment = currentMoment(ctx);
  const card = getCard(ctx.db, problemId);
  return {
    problem: toSummary(problem),
    kind: countAttemptsForProblem(ctx.db, problemId) === 0 ? 'first_solve' : 'review',
    hasKeyInsight: getNotes(ctx.db, problemId).keyInsight !== null,
    // A retired card is never due again, so the form promises no next review for it.
    nextReviewInDays:
      card?.status === 'retired' ? null : previewIntervals(card, moment.now, schedulerOptions(moment)),
  };
}

export function revealKeyInsight(ctx: AppContext, problemId: number): { keyInsight: string | null } {
  requireProblem(ctx.db, problemId);
  return { keyInsight: getNotes(ctx.db, problemId).keyInsight };
}

export async function submitReport(ctx: AppContext, input: BridgeParsedInput<'submitReport'>): Promise<ReportResult> {
  const problem = requireProblem(ctx.db, input.problemId);
  const moment = currentMoment(ctx);
  const rating = capRatingAfterReveal(input.rating, input.insightRevealed);
  const attemptedAt = moment.now.toISOString();

  // The single verification seam. v1 always trusts the self-report.
  const verification = await verifyAttempt({
    problemId: problem.id,
    platform: problem.platform,
    platformId: problem.platformId,
    rating,
    attemptedAt,
  });
  if (!verification.accepted) throw new Error(verification.reason ?? 'This attempt could not be verified');

  const outcome = ctx.db.transaction(() => {
    // Read inside the transaction, never from before the verification step: once that step does
    // real work, two reports can be in flight, and each must build on the other's result.
    const before: PetFacts = getPet(ctx.db);
    const kind = countAttemptsForProblem(ctx.db, problem.id) === 0 ? 'first_solve' : 'review';

    let notes = getNotes(ctx.db, problem.id);
    if (input.keyInsight !== null && input.keyInsight !== '') {
      notes = saveNotes(ctx.db, { ...notes, keyInsight: input.keyInsight }, attemptedAt);
    }

    const attempt = insertAttempt(ctx.db, {
      problemId: problem.id,
      attemptedAt,
      paraDay: moment.today,
      rating,
      minutes: input.minutes,
      kind,
      verification: verification.method,
      insightRevealed: input.insightRevealed,
      patternTags: notes.patternTags,
      notes: input.notes === '' ? null : input.notes,
    });

    // Every attempt creates or updates the problem's review card, including one rated Again:
    // a problem the user could not solve is exactly the one that should come back soon.
    const existingCard = getCard(ctx.db, problem.id);
    const options = schedulerOptions(moment);
    const card = existingCard
      ? scheduleReview(existingCard, rating, moment.now, options)
      : scheduleFirstAttempt(problem.id, rating, moment.now, options);
    saveCard(ctx.db, card, attemptedAt);

    const after = applyAttempt(before, { paraDay: moment.today, rating });
    savePetFacts(ctx.db, after);

    const assignment = getAssignment(ctx.db, moment.today);
    if (assignment && assignment.problemId === problem.id) markAssignmentCompleted(ctx.db, moment.today);

    return { attempt, before, after, card };
  });

  ctx.notifyChanged();

  const { before, after } = outcome;
  const afterMoment = currentMoment(ctx);
  const streakNow = displayedStreak(
    { current: after.currentStreak, longest: after.longestStreak, lastFedDay: after.lastFedDay },
    afterMoment.today,
  );
  const streakBefore = displayedStreak(
    { current: before.currentStreak, longest: before.longestStreak, lastFedDay: before.lastFedDay },
    moment.today,
  );
  return {
    attemptId: outcome.attempt.id,
    meal: rating === 'again' ? 'crumb' : 'full',
    rating,
    streak: { current: streakNow, longest: after.longestStreak, increased: streakNow > streakBefore },
    growth: {
      stage: stageFor(after.growthSolves),
      previousStage: stageFor(before.growthSolves),
      growthSolves: after.growthSolves,
    },
    nextReviewDay:
      outcome.card.status === 'active'
        ? dueDayOf(outcome.card, afterMoment.timeZone, afterMoment.settings.dayBoundaryHour)
        : null,
    today: buildTodayView(ctx, afterMoment),
  };
}
