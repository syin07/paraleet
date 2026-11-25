// The problem log: everything the user has attempted, its history and notes, and adding problems.
import type {
  AddProblemResult,
  BridgeParsedInput,
  LoggedProblemRow,
  ParsedProblemUrl,
  ProblemDetail,
  ProblemSummary,
} from '../../bridge/contract';
import { resetCard as resetCardState, retireCard as retireCardState } from '../../core/scheduler';
import type { ProblemNotes } from '../../core/types';
import { countAttemptsForProblem, listAttemptsForProblem } from '../../data/repos/attempts';
import { getCard, saveCard } from '../../data/repos/cards';
import { getNotes, saveNotes } from '../../data/repos/notes';
import {
  getProblemByPlatformId,
  insertProblem,
  listLoggedProblems as listLogged,
  searchProblems as search,
} from '../../data/repos/problems';
import { adapterFor, recognizeUrl } from '../../platforms';
import { currentMoment, type AppContext } from './context';
import { requireProblem, toCardSummary, toSummary } from './views';

export function listLoggedProblems(ctx: AppContext): LoggedProblemRow[] {
  const moment = currentMoment(ctx);
  return listLogged(ctx.db).map((row) => ({
    problem: toSummary(row.problem),
    attemptCount: row.attemptCount,
    lastAttemptAt: row.lastAttemptAt,
    lastAttemptDay: row.lastAttemptDay,
    lastRating: row.lastRating,
    card: row.card ? toCardSummary({ problemId: row.problem.id, state: {}, ...row.card }, moment) : null,
  }));
}

export function getProblemDetail(ctx: AppContext, problemId: number): ProblemDetail {
  const moment = currentMoment(ctx);
  const problem = requireProblem(ctx.db, problemId);
  const card = getCard(ctx.db, problemId);
  return {
    problem: toSummary(problem),
    attempts: listAttemptsForProblem(ctx.db, problemId).map((attempt) => ({
      id: attempt.id,
      attemptedAt: attempt.attemptedAt,
      paraDay: attempt.paraDay,
      rating: attempt.rating,
      minutes: attempt.minutes,
      kind: attempt.kind,
      notes: attempt.notes,
    })),
    notes: getNotes(ctx.db, problemId),
    card: card ? toCardSummary(card, moment) : null,
  };
}

export function saveProblemNotes(ctx: AppContext, input: BridgeParsedInput<'saveProblemNotes'>): ProblemNotes {
  requireProblem(ctx.db, input.problemId);
  const saved = saveNotes(ctx.db, input, ctx.clock.now().toISOString());
  ctx.notifyChanged();
  return saved;
}

/** "I've got this one": stop scheduling reviews for the problem. */
export function retireCard(ctx: AppContext, problemId: number): ProblemDetail {
  const card = getCard(ctx.db, problemId);
  if (!card) throw new Error('This problem has no review card yet');
  saveCard(ctx.db, retireCardState(card), ctx.clock.now().toISOString());
  ctx.notifyChanged();
  return getProblemDetail(ctx, problemId);
}

/** Clears the review history and makes the problem due again. */
export function resetCard(ctx: AppContext, problemId: number): ProblemDetail {
  const card = getCard(ctx.db, problemId);
  if (!card) throw new Error('This problem has no review card yet');
  const now = ctx.clock.now();
  saveCard(ctx.db, resetCardState(card, now), now.toISOString());
  ctx.notifyChanged();
  return getProblemDetail(ctx, problemId);
}

export function searchProblems(ctx: AppContext, input: BridgeParsedInput<'searchProblems'>): ProblemSummary[] {
  return search(ctx.db, input.query, input.limit).map(toSummary);
}

export function parseProblemUrl(ctx: AppContext, url: string): ParsedProblemUrl {
  const recognized = recognizeUrl(url);
  if (!recognized.ok) return recognized;
  const known = getProblemByPlatformId(ctx.db, recognized.platform, recognized.platformId);
  return {
    ...recognized,
    known: known ? toSummary(known) : null,
    alreadyLogged: known ? countAttemptsForProblem(ctx.db, known.id) > 0 : false,
  };
}

/** Adds a problem by its link. A problem the app already knows is returned, not added twice. */
export function addProblem(ctx: AppContext, input: BridgeParsedInput<'addProblem'>): AddProblemResult {
  const recognized = recognizeUrl(input.url);
  if (!recognized.ok) return recognized;
  const existing = getProblemByPlatformId(ctx.db, recognized.platform, recognized.platformId);
  if (existing) return { ok: true, problem: toSummary(existing), created: false };

  const adapter = adapterFor(recognized.platform);
  const difficultyRaw = input.difficultyRaw === '' ? null : input.difficultyRaw;
  const created = insertProblem(
    ctx.db,
    {
      platform: recognized.platform,
      platformId: recognized.platformId,
      displayId: null,
      title: input.title,
      url: recognized.canonicalUrl,
      difficultyRaw,
      difficultyNorm: adapter?.normalizeDifficulty(difficultyRaw) ?? null,
      topics: [...new Set(input.topics)],
      sourceTags: [],
      origin: 'user',
    },
    ctx.clock.now().toISOString(),
  );
  ctx.notifyChanged();
  return { ok: true, problem: toSummary(created), created: true };
}
