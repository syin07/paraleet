import type { CardStatus, IsoInstant, ReviewCard, SchedulerState } from '../../core/types';
import type { Db } from '../db';

interface CardRow {
  problem_id: number;
  status: CardStatus;
  due_at: string;
  state: string;
}

function toCard(row: CardRow): ReviewCard {
  return {
    problemId: row.problem_id,
    status: row.status,
    dueAt: row.due_at,
    state: JSON.parse(row.state) as SchedulerState,
  };
}

export function getCard(db: Db, problemId: number): ReviewCard | null {
  const row = db.get<CardRow>('SELECT problem_id, status, due_at, state FROM review_cards WHERE problem_id = ?', [
    problemId,
  ]);
  return row ? toCard(row) : null;
}

/** Inserts the card, or replaces the one the problem already has. */
export function saveCard(db: Db, card: ReviewCard, now: IsoInstant): void {
  db.run(
    `INSERT INTO review_cards (problem_id, status, due_at, state, updated_at)
     VALUES (:problemId, :status, :dueAt, :state, :now)
     ON CONFLICT (problem_id) DO UPDATE SET
       status = excluded.status, due_at = excluded.due_at, state = excluded.state, updated_at = excluded.updated_at`,
    { problemId: card.problemId, status: card.status, dueAt: card.dueAt, state: JSON.stringify(card.state), now },
  );
}

/** Every active card, soonest due first. Whether a card is due today is decided in core. */
export function listActiveCards(db: Db): ReviewCard[] {
  return db
    .all<CardRow>(
      "SELECT problem_id, status, due_at, state FROM review_cards WHERE status = 'active' ORDER BY due_at, problem_id",
    )
    .map(toCard);
}
