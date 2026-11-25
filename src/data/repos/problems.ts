import { isTopicId, type TopicId } from '../../core/topics';
import type {
  CardStatus,
  DifficultyNorm,
  IsoInstant,
  Platform,
  Problem,
  ProblemOrigin,
  Rating,
} from '../../core/types';
import { parseJsonArray, type Db } from '../db';

interface ProblemRow {
  id: number;
  platform: Platform;
  platform_id: string;
  display_id: string | null;
  title: string;
  url: string;
  difficulty_raw: string | null;
  difficulty_norm: number | null;
  topics: string;
  source_tags: string;
  origin: ProblemOrigin;
  starter_position: number | null;
}

const COLUMNS = `id, platform, platform_id, display_id, title, url, difficulty_raw, difficulty_norm,
  topics, source_tags, origin, starter_position`;

function prefixed(alias: string): string {
  return COLUMNS.split(',')
    .map((column) => `${alias}.${column.trim()}`)
    .join(', ');
}

export function toProblem(row: ProblemRow): Problem {
  return {
    id: row.id,
    platform: row.platform,
    platformId: row.platform_id,
    displayId: row.display_id,
    title: row.title,
    url: row.url,
    difficultyRaw: row.difficulty_raw,
    difficultyNorm: row.difficulty_norm as DifficultyNorm | null,
    topics: parseJsonArray(row.topics).filter(isTopicId),
    sourceTags: parseJsonArray(row.source_tags),
    origin: row.origin,
    starterPosition: row.starter_position,
  };
}

export interface NewProblem {
  platform: Platform;
  platformId: string;
  displayId: string | null;
  title: string;
  url: string;
  difficultyRaw: string | null;
  difficultyNorm: DifficultyNorm | null;
  topics: TopicId[];
  sourceTags: string[];
  origin: ProblemOrigin;
  starterPosition?: number | null;
}

export function insertProblem(db: Db, problem: NewProblem, now: IsoInstant): Problem {
  const result = db.run(
    `INSERT INTO problems (platform, platform_id, display_id, title, url, difficulty_raw, difficulty_norm,
       topics, source_tags, origin, starter_position, created_at)
     VALUES (:platform, :platformId, :displayId, :title, :url, :difficultyRaw, :difficultyNorm,
       :topics, :sourceTags, :origin, :starterPosition, :now)`,
    {
      platform: problem.platform,
      platformId: problem.platformId,
      displayId: problem.displayId,
      title: problem.title,
      url: problem.url,
      difficultyRaw: problem.difficultyRaw,
      difficultyNorm: problem.difficultyNorm,
      topics: JSON.stringify(problem.topics),
      sourceTags: JSON.stringify(problem.sourceTags),
      origin: problem.origin,
      starterPosition: problem.starterPosition ?? null,
      now,
    },
  );
  const created = getProblem(db, result.lastInsertRowid);
  if (!created) throw new Error('Problem insert failed');
  return created;
}

/** Updates the catalog fields of a seed problem. User-entered problems are never overwritten by seeds. */
export function updateSeedProblem(db: Db, id: number, problem: NewProblem): void {
  db.run(
    `UPDATE problems SET display_id = :displayId, title = :title, url = :url, difficulty_raw = :difficultyRaw,
       difficulty_norm = :difficultyNorm, topics = :topics, source_tags = :sourceTags,
       starter_position = :starterPosition
     WHERE id = :id`,
    {
      id,
      displayId: problem.displayId,
      title: problem.title,
      url: problem.url,
      difficultyRaw: problem.difficultyRaw,
      difficultyNorm: problem.difficultyNorm,
      topics: JSON.stringify(problem.topics),
      sourceTags: JSON.stringify(problem.sourceTags),
      starterPosition: problem.starterPosition ?? null,
    },
  );
}

export function setStarterPosition(db: Db, id: number, position: number | null): void {
  db.run('UPDATE problems SET starter_position = ? WHERE id = ?', [position, id]);
}

export function getProblem(db: Db, id: number): Problem | null {
  const row = db.get<ProblemRow>(`SELECT ${COLUMNS} FROM problems WHERE id = ?`, [id]);
  return row ? toProblem(row) : null;
}

export function getProblemByPlatformId(db: Db, platform: Platform, platformId: string): Problem | null {
  const row = db.get<ProblemRow>(`SELECT ${COLUMNS} FROM problems WHERE platform = ? AND platform_id = ?`, [
    platform,
    platformId,
  ]);
  return row ? toProblem(row) : null;
}

export function listStarterProblems(db: Db): Problem[] {
  return db
    .all<ProblemRow>(`SELECT ${COLUMNS} FROM problems WHERE starter_position IS NOT NULL ORDER BY starter_position`)
    .map(toProblem);
}

/** IDs of starter-list problems with no attempt yet, in list order. */
export function listStarterQueue(db: Db): number[] {
  return db
    .all<{ id: number }>(
      `SELECT p.id FROM problems p
       WHERE p.starter_position IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM attempts a WHERE a.problem_id = p.id)
       ORDER BY p.starter_position`,
    )
    .map((row) => row.id);
}

/** Finds problems by title, display ID or platform ID. Problems the user has logged come first. */
export function searchProblems(db: Db, query: string, limit: number): Problem[] {
  const trimmed = query.trim();
  if (trimmed === '') return [];
  const like = `%${trimmed.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
  return db
    .all<ProblemRow>(
      `SELECT ${prefixed('p')} FROM problems p
       WHERE p.title LIKE :like ESCAPE '\\' OR p.display_id = :exact OR p.platform_id LIKE :like ESCAPE '\\'
       ORDER BY
         (p.display_id = :exact) DESC,
         EXISTS (SELECT 1 FROM attempts a WHERE a.problem_id = p.id) DESC,
         (p.title LIKE :prefix ESCAPE '\\') DESC,
         p.title
       LIMIT :limit`,
      { like, exact: trimmed, prefix: like.slice(1), limit },
    )
    .map(toProblem);
}

export interface LoggedProblem {
  problem: Problem;
  attemptCount: number;
  lastAttemptAt: IsoInstant;
  lastRating: Rating;
  card: { status: CardStatus; dueAt: IsoInstant } | null;
}

/** Every problem with at least one attempt, most recently attempted first. */
export function listLoggedProblems(db: Db): LoggedProblem[] {
  type Row = ProblemRow & {
    attempt_count: number;
    last_attempt_at: string;
    last_rating: Rating;
    card_status: CardStatus | null;
    card_due_at: string | null;
  };
  return db
    .all<Row>(
      `SELECT ${prefixed('p')},
         stats.attempt_count,
         last.attempted_at AS last_attempt_at,
         last.rating AS last_rating,
         c.status AS card_status,
         c.due_at AS card_due_at
       FROM problems p
       JOIN (SELECT problem_id, COUNT(*) AS attempt_count, MAX(id) AS last_id FROM attempts GROUP BY problem_id) stats
         ON stats.problem_id = p.id
       JOIN attempts last ON last.id = stats.last_id
       LEFT JOIN review_cards c ON c.problem_id = p.id
       ORDER BY last.id DESC`,
    )
    .map((row) => ({
      problem: toProblem(row),
      attemptCount: row.attempt_count,
      lastAttemptAt: row.last_attempt_at,
      lastRating: row.last_rating,
      card: row.card_status && row.card_due_at ? { status: row.card_status, dueAt: row.card_due_at } : null,
    }));
}
