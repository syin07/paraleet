// Reporting an attempt: the step that feeds the pet (PRD section 4, steps 5 to 7).
import type { BridgeParsedInput, ReportContext, ReportResult } from '../../bridge/contract';
import { applyAttempt, stageFor } from '../../core/petFacts';
import { capRatingAfterReveal } from '../../core/scheduler';
import { displayedStreak } from '../../core/streak';
import type { PetFacts } from '../../core/types';
import { verifyAttempt } from '../../core/verify';
import { getAssignment, markAssignmentCompleted } from '../../data/repos/assignments';
import { countAttemptsForProblem, insertAttempt } from '../../data/repos/attempts';
import { getNotes, saveNotes } from '../../data/repos/notes';
import { savePetFacts } from '../../data/repos/pet';
import { currentMoment, type AppContext } from './context';
import { buildTodayView } from './today';
import { requireProblem, toSummary } from './views';

export function getReportContext(ctx: AppContext, problemId: number): ReportContext {
  const problem = requireProblem(ctx.db, problemId);
  return {
    problem: toSummary(problem),
    kind: countAttemptsForProblem(ctx.db, problemId) === 0 ? 'first_solve' : 'review',
    hasKeyInsight: getNotes(ctx.db, problemId).keyInsight !== null,
    nextReviewInDays: null, // Filled in once the scheduler is wired (SAN-111).
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

  const before: PetFacts = moment.pet;
  const outcome = ctx.db.transaction(() => {
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

    const after = applyAttempt(before, { paraDay: moment.today, rating });
    savePetFacts(ctx.db, after);

    const assignment = getAssignment(ctx.db, moment.today);
    if (assignment && assignment.problemId === problem.id) markAssignmentCompleted(ctx.db, moment.today);

    return { attempt, after };
  });

  ctx.notifyChanged();

  const { after } = outcome;
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
    nextReviewDay: null, // Filled in once the scheduler is wired (SAN-111).
    today: buildTodayView(ctx, afterMoment),
  };
}
