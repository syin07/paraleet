import { HARD_DIFFICULTY_NORM, type UnlockAttempt } from '../../core/accessories';
import type { AttemptFact } from '../../core/petFacts';
import type { Attempt, AttemptKind, IsoInstant, ParaDay, Rating, VerificationMethod } from '../../core/types';
import { parseJsonArray, type Db } from '../db';

interface AttemptRow {
  id: number;
  problem_id: number;
  attempted_at: string;
  para_day: string;
  rating: Rating;
  minutes: number | null;
  kind: AttemptKind;
  verification: VerificationMethod;
  insight_revealed: number;
  pattern_tags: string;
  notes: string | null;
}

function toAttempt(row: AttemptRow): Attempt {
  return {
    id: row.id,
    problemId: row.problem_id,
    attemptedAt: row.attempted_at,
    paraDay: row.para_day,
    rating: row.rating,
    minutes: row.minutes,
    kind: row.kind,
    verification: row.verification,
    insightRevealed: row.insight_revealed === 1,
    patternTags: parseJsonArray(row.pattern_tags),
    notes: row.notes,
  };
}

export type NewAttempt = Omit<Attempt, 'id'>;

/** Attempts are append-only: there is no update or delete. */
export function insertAttempt(db: Db, attempt: NewAttempt): Attempt {
  const result = db.run(
    `INSERT INTO attempts (problem_id, attempted_at, para_day, rating, minutes, kind, verification,
       insight_revealed, pattern_tags, notes)
     VALUES (:problemId, :attemptedAt, :paraDay, :rating, :minutes, :kind, :verification,
       :insightRevealed, :patternTags, :notes)`,
    {
      problemId: attempt.problemId,
      attemptedAt: attempt.attemptedAt,
      paraDay: attempt.paraDay,
      rating: attempt.rating,
      minutes: attempt.minutes,
      kind: attempt.kind,
      verification: attempt.verification,
      insightRevealed: attempt.insightRevealed ? 1 : 0,
      patternTags: JSON.stringify(attempt.patternTags),
      notes: attempt.notes,
    },
  );
  return { ...attempt, id: result.lastInsertRowid };
}

/** A problem's attempts, newest first. */
export function listAttemptsForProblem(db: Db, problemId: number): Attempt[] {
  return db
    .all<AttemptRow>('SELECT * FROM attempts WHERE problem_id = ? ORDER BY id DESC', [problemId])
    .map(toAttempt);
}

export function countAttemptsForProblem(db: Db, problemId: number): number {
  return db.get<{ n: number }>('SELECT COUNT(*) AS n FROM attempts WHERE problem_id = ?', [problemId])?.n ?? 0;
}

export function countAttemptsOnDay(db: Db, day: ParaDay): number {
  return db.get<{ n: number }>('SELECT COUNT(*) AS n FROM attempts WHERE para_day = ?', [day])?.n ?? 0;
}

/** Every attempt's day and rating, in the order recorded. Input for `recomputePetFacts`. */
export function listAttemptFacts(db: Db): AttemptFact[] {
  return db
    .all<{ para_day: string; rating: Rating }>('SELECT para_day, rating FROM attempts ORDER BY id')
    .map((row) => ({ paraDay: row.para_day, rating: row.rating }));
}

/** Every attempt as the accessory rules see it, in the order recorded. Input for `replayUnlocks`. */
export function listUnlockAttempts(db: Db): UnlockAttempt[] {
  return db
    .all<{ para_day: string; rating: Rating; hard: number; plans_finished: number }>(
      `SELECT a.para_day, a.rating, COALESCE(p.difficulty_norm, 0) >= ? AS hard,
         (SELECT COUNT(*) FROM plans f
          WHERE f.finished_from_attempt IS NOT NULL AND f.finished_from_attempt <= a.id) AS plans_finished
       FROM attempts a JOIN problems p ON p.id = a.problem_id ORDER BY a.id`,
      [HARD_DIFFICULTY_NORM],
    )
    .map((row) => ({
      paraDay: row.para_day,
      rating: row.rating,
      hardProblem: row.hard === 1,
      plansFinished: Number(row.plans_finished),
    }));
}

/** True once any attempt not rated Again was on a problem of normalized difficulty 4 or 5. */
export function hasSolvedHardProblem(db: Db): boolean {
  return (
    db.get(
      `SELECT 1 AS found FROM attempts a JOIN problems p ON p.id = a.problem_id
       WHERE a.rating <> 'again' AND p.difficulty_norm >= ? LIMIT 1`,
      [HARD_DIFFICULTY_NORM],
    ) !== undefined
  );
}

/** The distinct days with at least one attempt, from `from` to `to` inclusive. */
export function listFedDays(db: Db, from: ParaDay, to: ParaDay): ParaDay[] {
  return db
    .all<{ para_day: string }>(
      'SELECT DISTINCT para_day FROM attempts WHERE para_day BETWEEN ? AND ? ORDER BY para_day',
      [from, to],
    )
    .map((row) => row.para_day);
}

export function lastAttemptAt(db: Db, problemId: number): IsoInstant | null {
  return (
    db.get<{ attempted_at: string }>('SELECT attempted_at FROM attempts WHERE problem_id = ? ORDER BY id DESC LIMIT 1', [
      problemId,
    ])?.attempted_at ?? null
  );
}

/** Problems that have attempts but no review card. Only possible for data from before cards existed. */
export function listProblemsMissingCards(db: Db): number[] {
  return db
    .all<{ problem_id: number }>(
      `SELECT DISTINCT a.problem_id FROM attempts a
       WHERE NOT EXISTS (SELECT 1 FROM review_cards c WHERE c.problem_id = a.problem_id)
       ORDER BY a.problem_id`,
    )
    .map((row) => row.problem_id);
}
