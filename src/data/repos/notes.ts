import type { IsoInstant, ProblemNotes } from '../../core/types';
import { parseJsonArray, type Db } from '../db';

interface NotesRow {
  problem_id: number;
  key_insight: string | null;
  pattern_tags: string;
  notes: string | null;
  solution_url: string | null;
}

/** A problem's notes. A problem with no notes row yet gets empty notes. */
export function getNotes(db: Db, problemId: number): ProblemNotes {
  const row = db.get<NotesRow>(
    'SELECT problem_id, key_insight, pattern_tags, notes, solution_url FROM problem_notes WHERE problem_id = ?',
    [problemId],
  );
  if (!row) return { problemId, keyInsight: null, patternTags: [], notes: null, solutionUrl: null };
  return {
    problemId: row.problem_id,
    keyInsight: row.key_insight,
    patternTags: parseJsonArray(row.pattern_tags),
    notes: row.notes,
    solutionUrl: row.solution_url,
  };
}

function blankToNull(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

export function saveNotes(db: Db, notes: ProblemNotes, now: IsoInstant): ProblemNotes {
  const clean: ProblemNotes = {
    problemId: notes.problemId,
    keyInsight: blankToNull(notes.keyInsight),
    patternTags: [...new Set(notes.patternTags.map((tag) => tag.trim()).filter((tag) => tag !== ''))],
    notes: blankToNull(notes.notes),
    solutionUrl: blankToNull(notes.solutionUrl),
  };
  db.run(
    `INSERT INTO problem_notes (problem_id, key_insight, pattern_tags, notes, solution_url, updated_at)
     VALUES (:problemId, :keyInsight, :patternTags, :notes, :solutionUrl, :now)
     ON CONFLICT (problem_id) DO UPDATE SET
       key_insight = excluded.key_insight,
       pattern_tags = excluded.pattern_tags,
       notes = excluded.notes,
       solution_url = excluded.solution_url,
       updated_at = excluded.updated_at`,
    {
      problemId: clean.problemId,
      keyInsight: clean.keyInsight,
      patternTags: JSON.stringify(clean.patternTags),
      notes: clean.notes,
      solutionUrl: clean.solutionUrl,
      now,
    },
  );
  return clean;
}
