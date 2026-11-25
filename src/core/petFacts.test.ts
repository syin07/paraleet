import { describe, expect, it } from 'vitest';
import { addDays, daysBetween } from './day';
import {
  applyAttempt,
  EMPTY_PET_FACTS,
  GROWTH_THRESHOLDS,
  isGrowthSolve,
  recomputePetFacts,
  stageFor,
  type AttemptFact,
} from './petFacts';
import type { PetFacts, Rating } from './types';

/** A tiny seeded generator (mulberry32): the core lint forbids Math.random. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RATINGS: Rating[] = ['again', 'hard', 'good', 'easy'];

describe('stageFor and isGrowthSolve', () => {
  it('changes stage exactly at each threshold', () => {
    expect(GROWTH_THRESHOLDS).toEqual({
      egg: 0,
      chick: 3,
      fledgling: 15,
      adult: 50,
    });
    const expected: [number, string][] = [
      [0, 'egg'],
      [2, 'egg'],
      [3, 'chick'],
      [14, 'chick'],
      [15, 'fledgling'],
      [49, 'fledgling'],
      [50, 'adult'],
      [500, 'adult'],
    ];
    for (const [solves, stage] of expected) expect(stageFor(solves)).toBe(stage);
  });

  it('counts hard, good and easy as growth solves and again as not', () => {
    expect(isGrowthSolve('again')).toBe(false);
    expect(isGrowthSolve('hard')).toBe(true);
    expect(isGrowthSolve('good')).toBe(true);
    expect(isGrowthSolve('easy')).toBe(true);
  });
});

/**
 * An independent reference for days that never go backwards: it reads the plain list of days and
 * calls none of applyFedDay, applyAttempt or recomputePetFacts.
 */
function referenceStreaks(days: string[]) {
  let run = 0;
  let longest = 0;
  let previous: string | null = null;
  for (const day of days) {
    if (previous === null || daysBetween(previous, day) > 1) run = 1;
    else if (daysBetween(previous, day) === 1) run += 1;
    longest = Math.max(longest, run);
    previous = day;
  }
  return { currentStreak: run, longestStreak: longest, lastFedDay: previous };
}

describe('the fold against an independent reference', () => {
  it.each([7, 8, 9, 100, 31337])('matches the streak read from the plain list of days (seed %i)', (seed) => {
    const random = seeded(seed);
    const attempts: AttemptFact[] = [];
    const days: string[] = [];
    let facts: PetFacts = EMPTY_PET_FACTS;
    let day = '2026-02-20';
    for (let i = 0; i < 300; i++) {
      const roll = random();
      if (roll < 0.3) day = addDays(day, 0);
      else if (roll < 0.8) day = addDays(day, 1);
      else day = addDays(day, 2 + Math.floor(random() * 4));
      const attempt: AttemptFact = { paraDay: day, rating: RATINGS[Math.floor(random() * 4)] ?? 'good' };
      attempts.push(attempt);
      days.push(day);
      facts = applyAttempt(facts, attempt);
      expect(facts).toMatchObject(referenceStreaks(days));
      expect(recomputePetFacts(attempts)).toMatchObject(referenceStreaks(days));
    }
    // The run must have been interesting: some streak of 5 or more and some resets.
    expect(facts.longestStreak).toBeGreaterThanOrEqual(5);
  });
});

describe('recomputePetFacts', () => {
  it('is the empty facts for no attempts', () => {
    expect(recomputePetFacts([])).toEqual(EMPTY_PET_FACTS);
  });

  it.each([1, 2, 3, 42, 2026])('matches the stored facts after every random attempt (seed %i)', (seed) => {
    const random = seeded(seed);
    const attempts: AttemptFact[] = [];
    let facts: PetFacts = EMPTY_PET_FACTS;
    let day = '2026-01-01';
    let growth = 0;
    let longest = 0;

    for (let i = 0; i < 300; i++) {
      const roll = random();
      if (roll < 0.35) day = addDays(day, 0);
      else if (roll < 0.65) day = addDays(day, 1);
      else if (roll < 0.8) day = addDays(day, 2 + Math.floor(random() * 5));
      else if (roll < 0.9) day = addDays(day, -1);
      else if (roll < 0.95)
        day = addDays(day, 365); // a far-future outlier from a wrong clock
      else day = addDays(day, -300); // the clock is right again
      const rating = RATINGS[Math.floor(random() * 4)] ?? 'good';
      const attempt: AttemptFact = { paraDay: day, rating };
      attempts.push(attempt);

      facts = applyAttempt(facts, attempt);
      if (rating !== 'again') growth++;

      expect(facts).toEqual(recomputePetFacts(attempts));
      expect(facts.totalAttempts).toBe(attempts.length);
      expect(facts.growthSolves).toBe(growth);
      expect(facts.longestStreak).toBeGreaterThanOrEqual(longest);
      expect(facts.longestStreak).toBeGreaterThanOrEqual(facts.currentStreak);
      longest = facts.longestStreak;
    }
  });

  it('counts a year-ahead attempt, then restarts the streak on the real day', () => {
    const facts = recomputePetFacts([
      { paraDay: '2026-11-24', rating: 'good' },
      { paraDay: '2026-11-25', rating: 'good' },
      { paraDay: '2027-11-25', rating: 'good' },
      { paraDay: '2026-11-25', rating: 'again' },
      { paraDay: '2026-11-26', rating: 'easy' },
    ]);
    expect(facts).toEqual({
      growthSolves: 4,
      totalAttempts: 5,
      currentStreak: 2,
      longestStreak: 2,
      lastFedDay: '2026-11-26',
    });
  });
});
