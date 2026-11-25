import type { PlanItemState, PlanLevel, PlanPlatform, PlanStage, PlanStatus } from '../../core/plan';
import type { TopicId } from '../../core/topics';
import type { IsoInstant } from '../../core/types';
import { parseJsonArray, type Db } from '../db';

export interface PlanRecord {
  id: number;
  title: string;
  topics: TopicId[];
  platforms: PlanPlatform[];
  level: PlanLevel;
  targetSize: number;
  status: PlanStatus;
  /** The model that wrote the plan. */
  model: string;
  createdAt: IsoInstant;
  activatedAt: IsoInstant | null;
  finishedAt: IsoInstant | null;
}

export interface PlanItemRecord {
  id: number;
  planId: number;
  position: number;
  topic: TopicId;
  stage: PlanStage;
  groupName: string | null;
  groupDescription: string | null;
  problemId: number;
  state: PlanItemState;
}

export interface NewPlan {
  title: string;
  topics: readonly TopicId[];
  platforms: readonly PlanPlatform[];
  level: PlanLevel;
  targetSize: number;
  model: string;
}

export interface NewPlanItem {
  topic: TopicId;
  stage: PlanStage;
  groupName: string | null;
  groupDescription: string | null;
  problemId: number;
}

interface PlanRow {
  id: number;
  title: string;
  topics: string;
  platforms: string;
  level: PlanLevel;
  target_size: number;
  status: PlanStatus;
  model: string;
  created_at: string;
  activated_at: string | null;
  finished_at: string | null;
}

interface ItemRow {
  id: number;
  plan_id: number;
  position: number;
  topic: string;
  stage: PlanStage;
  group_name: string | null;
  group_description: string | null;
  problem_id: number;
  state: PlanItemState;
}

function toPlan(row: PlanRow): PlanRecord {
  return {
    id: row.id,
    title: row.title,
    topics: parseJsonArray(row.topics) as TopicId[],
    platforms: parseJsonArray(row.platforms) as PlanPlatform[],
    level: row.level,
    targetSize: row.target_size,
    status: row.status,
    model: row.model,
    createdAt: row.created_at,
    activatedAt: row.activated_at,
    finishedAt: row.finished_at,
  };
}

function toItem(row: ItemRow): PlanItemRecord {
  return {
    id: row.id,
    planId: row.plan_id,
    position: row.position,
    topic: row.topic as TopicId,
    stage: row.stage,
    groupName: row.group_name,
    groupDescription: row.group_description,
    problemId: row.problem_id,
    state: row.state,
  };
}

/** Stores a new draft plan with its items in the order given. Call inside a transaction. */
export function insertPlan(db: Db, plan: NewPlan, items: readonly NewPlanItem[], now: IsoInstant): PlanRecord {
  db.run(
    `INSERT INTO plans (title, topics, platforms, level, target_size, status, model, created_at)
     VALUES (:title, :topics, :platforms, :level, :targetSize, 'draft', :model, :now)`,
    {
      title: plan.title,
      topics: JSON.stringify(plan.topics),
      platforms: JSON.stringify(plan.platforms),
      level: plan.level,
      targetSize: plan.targetSize,
      model: plan.model,
      now,
    },
  );
  const id = db.get<{ id: number }>('SELECT last_insert_rowid() AS id')?.id ?? 0;
  items.forEach((item, position) => insertItem(db, id, position, item));
  const stored = getPlan(db, id);
  if (!stored) throw new Error('The plan was not stored');
  return stored;
}

function insertItem(db: Db, planId: number, position: number, item: NewPlanItem): void {
  db.run(
    `INSERT INTO plan_items (plan_id, position, topic, stage, group_name, group_description, problem_id)
     VALUES (:planId, :position, :topic, :stage, :groupName, :groupDescription, :problemId)`,
    {
      planId,
      position,
      topic: item.topic,
      stage: item.stage,
      groupName: item.groupName,
      groupDescription: item.groupDescription,
      problemId: item.problemId,
    },
  );
}

export function getPlan(db: Db, id: number): PlanRecord | null {
  const row = db.get<PlanRow>('SELECT * FROM plans WHERE id = ?', [id]);
  return row ? toPlan(row) : null;
}

export function getActivePlan(db: Db): PlanRecord | null {
  const row = db.get<PlanRow>("SELECT * FROM plans WHERE status = 'active'");
  return row ? toPlan(row) : null;
}

/** Every plan, newest first. */
export function listPlans(db: Db): PlanRecord[] {
  return db.all<PlanRow>('SELECT * FROM plans ORDER BY created_at DESC, id DESC').map(toPlan);
}

export function countFinishedPlans(db: Db): number {
  return db.get<{ n: number }>("SELECT COUNT(*) AS n FROM plans WHERE finished_at IS NOT NULL")?.n ?? 0;
}

/** A plan's items in plan order. */
export function listPlanItems(db: Db, planId: number): PlanItemRecord[] {
  return db.all<ItemRow>('SELECT * FROM plan_items WHERE plan_id = ? ORDER BY position, id', [planId]).map(toItem);
}

export function setPlanStatus(
  db: Db,
  id: number,
  status: Exclude<PlanStatus, 'done'>,
  stamps: { activatedAt?: IsoInstant } = {},
): void {
  db.run(
    `UPDATE plans SET status = :status, activated_at = COALESCE(:activatedAt, activated_at) WHERE id = :id`,
    { id, status, activatedAt: stamps.activatedAt ?? null },
  );
}

/**
 * Marks a plan finished. Call inside the transaction that records the finishing attempt, before
 * the attempt is inserted: the plan then counts as finished for that attempt and every later one,
 * and for none recorded before it. At launch, with no attempt being recorded, it counts from the
 * next attempt on.
 */
export function finishPlan(db: Db, id: number, now: IsoInstant): void {
  db.run(
    `UPDATE plans SET status = 'done',
       finished_at = COALESCE(finished_at, :now),
       finished_from_attempt = COALESCE(finished_from_attempt, (SELECT COALESCE(MAX(id), 0) + 1 FROM attempts))
     WHERE id = :id`,
    { id, now },
  );
}

export function setItemState(db: Db, itemId: number, state: PlanItemState): void {
  db.run('UPDATE plan_items SET state = ? WHERE id = ?', [state, itemId]);
}

export function deletePlanItem(db: Db, itemId: number): void {
  db.run('DELETE FROM plan_items WHERE id = ?', [itemId]);
}

/** Points an item at another problem, keeping its place, stage and group. */
export function setItemProblem(db: Db, itemId: number, problemId: number): void {
  db.run("UPDATE plan_items SET problem_id = ?, state = 'pending' WHERE id = ?", [problemId, itemId]);
}

/** Rewrites positions to 0, 1, 2, ... in the order of `itemIds`. */
export function reorderPlanItems(db: Db, itemIds: readonly number[]): void {
  itemIds.forEach((itemId, position) => db.run('UPDATE plan_items SET position = ? WHERE id = ?', [position, itemId]));
}

/** Deletes a plan and its items. */
export function deletePlan(db: Db, id: number): void {
  db.run('DELETE FROM plans WHERE id = ?', [id]);
}
