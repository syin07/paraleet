import type { IsoInstant, PetFacts } from '../../core/types';
import { parseJsonArray, type Db } from '../db';

export interface PetRecord extends PetFacts {
  /** Random per install; varies the bird's small traits (PRD section 6). */
  seed: number;
  unlockedAccessories: string[];
  equippedAccessories: string[];
  /** When the first-launch hatching flow finished, or null before it has. */
  hatchedAt: IsoInstant | null;
}

interface PetRow {
  seed: number;
  growth_solves: number;
  total_attempts: number;
  current_streak: number;
  longest_streak: number;
  last_fed_day: string | null;
  unlocked_accessories: string;
  equipped_accessories: string;
  hatched_at: string | null;
}

function toPet(row: PetRow): PetRecord {
  return {
    seed: row.seed,
    growthSolves: row.growth_solves,
    totalAttempts: row.total_attempts,
    currentStreak: row.current_streak,
    longestStreak: row.longest_streak,
    lastFedDay: row.last_fed_day,
    unlockedAccessories: parseJsonArray(row.unlocked_accessories),
    equippedAccessories: parseJsonArray(row.equipped_accessories),
    hatchedAt: row.hatched_at,
  };
}

/** Returns the single pet, creating it with `seed` on first launch. */
export function ensurePet(db: Db, seed: number, now: IsoInstant): PetRecord {
  db.run('INSERT OR IGNORE INTO pet (id, seed, created_at) VALUES (1, ?, ?)', [seed, now]);
  const row = db.get<PetRow>('SELECT * FROM pet WHERE id = 1');
  if (!row) throw new Error('The pet row is missing');
  return toPet(row);
}

export function getPet(db: Db): PetRecord {
  const row = db.get<PetRow>('SELECT * FROM pet WHERE id = 1');
  if (!row) throw new Error('The pet row is missing');
  return toPet(row);
}

export function saveEquippedAccessories(db: Db, accessories: readonly string[]): void {
  db.run('UPDATE pet SET equipped_accessories = ? WHERE id = 1', [JSON.stringify(accessories)]);
}

export function saveUnlockedAccessories(db: Db, accessories: readonly string[]): void {
  db.run('UPDATE pet SET unlocked_accessories = ? WHERE id = 1', [JSON.stringify(accessories)]);
}

export function savePetFacts(db: Db, facts: PetFacts): void {
  db.run(
    `UPDATE pet SET growth_solves = :growthSolves, total_attempts = :totalAttempts,
       current_streak = :currentStreak, longest_streak = :longestStreak, last_fed_day = :lastFedDay
     WHERE id = 1`,
    {
      growthSolves: facts.growthSolves,
      totalAttempts: facts.totalAttempts,
      currentStreak: facts.currentStreak,
      longestStreak: facts.longestStreak,
      lastFedDay: facts.lastFedDay,
    },
  );
}
