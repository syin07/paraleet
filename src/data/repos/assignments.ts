import type { AssignmentReason, IsoInstant, ParaDay, PastAssignment } from '../../core/types';
import type { Db } from '../db';

export interface DailyAssignment {
  day: ParaDay;
  problemId: number;
  reason: AssignmentReason;
  completed: boolean;
  assignedAt: IsoInstant;
}

interface AssignmentRow {
  para_day: string;
  problem_id: number;
  reason: AssignmentReason;
  completed: number;
  assigned_at: string;
}

function toAssignment(row: AssignmentRow): DailyAssignment {
  return {
    day: row.para_day,
    problemId: row.problem_id,
    reason: row.reason,
    completed: row.completed === 1,
    assignedAt: row.assigned_at,
  };
}

export function getAssignment(db: Db, day: ParaDay): DailyAssignment | null {
  const row = db.get<AssignmentRow>('SELECT * FROM daily_assignments WHERE para_day = ?', [day]);
  return row ? toAssignment(row) : null;
}

/** Sets the day's assignment, replacing any earlier one (a swap). */
export function saveAssignment(db: Db, assignment: DailyAssignment): void {
  db.run(
    `INSERT INTO daily_assignments (para_day, problem_id, reason, completed, assigned_at)
     VALUES (:day, :problemId, :reason, :completed, :assignedAt)
     ON CONFLICT (para_day) DO UPDATE SET
       problem_id = excluded.problem_id, reason = excluded.reason,
       completed = excluded.completed, assigned_at = excluded.assigned_at`,
    {
      day: assignment.day,
      problemId: assignment.problemId,
      reason: assignment.reason,
      completed: assignment.completed ? 1 : 0,
      assignedAt: assignment.assignedAt,
    },
  );
}

export function markAssignmentCompleted(db: Db, day: ParaDay): void {
  db.run('UPDATE daily_assignments SET completed = 1 WHERE para_day = ?', [day]);
}

/** Assignments from days before `day`, newest first. */
export function listAssignmentsBefore(db: Db, day: ParaDay, limit: number): PastAssignment[] {
  return db
    .all<AssignmentRow>('SELECT * FROM daily_assignments WHERE para_day < ? ORDER BY para_day DESC LIMIT ?', [
      day,
      limit,
    ])
    .map((row) => ({ day: row.para_day, reason: row.reason }));
}
