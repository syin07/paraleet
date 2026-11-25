// Criterion 10 of SAN-105 at the service level: after a random run of reports, with the clock and
// the time zone moving around, the pet facts the app stored equal the facts recomputed from the
// list of attempts.
import { afterEach, describe, expect, it } from 'vitest';
import { recomputePetFacts } from '../../core/petFacts';
import { listAttemptFacts } from '../../data/repos/attempts';
import { getPet } from '../../data/repos/pet';
import { createTestApp, noonLA, type TestApp } from './testing';

let app: TestApp;
afterEach(() => app?.close());

/** A tiny seeded generator (mulberry32), so every run of the test is the same run. */
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

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const RATINGS = ['again', 'hard', 'good', 'easy'] as const;
const ZONES = ['America/New_York', 'America/Los_Angeles', 'Asia/Tokyo', 'Pacific/Kiritimati'];

describe('stored pet facts after a random run of reports', () => {
  it.each([1, 2, 3, 4, 5])('equal the facts recomputed from the attempts (seed %i)', async (seed) => {
    const random = seeded(seed);
    const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
    app = createTestApp();
    const problems = await app.handlers.searchProblems({ query: 'a', limit: 50 });
    expect(problems.length).toBeGreaterThan(5);

    // `real` is the true timeline. A wrong-clock jump sets the clock away from it for one step.
    let real = new Date(noonLA('2026-11-25')).getTime();
    let reports = 0;
    let longestSeen = 0;

    for (let step = 0; step < 250; step++) {
      const roll = random();
      let wrongBy = 0;
      if (roll < 0.45) real += (1 + Math.floor(random() * 50)) * MINUTE;
      else if (roll < 0.7) real += (1 + Math.floor(random() * 12)) * HOUR;
      else if (roll < 0.85) real += (1 + Math.floor(random() * 3)) * DAY;
      else if (roll < 0.9) real -= (1 + Math.floor(random() * 5)) * HOUR;
      else if (roll < 0.95) app.clock.setTimeZone(pick(ZONES));
      else if (roll < 0.98)
        wrongBy = 365 * DAY; // the system clock is a year ahead for this report
      else real -= (30 + Math.floor(random() * 60)) * DAY; // a jump to a much earlier date
      app.clock.set(new Date(real + wrongBy).toISOString());

      await app.handlers.getToday(undefined);
      await app.handlers.submitReport({
        problemId: pick(problems).id,
        rating: pick(RATINGS),
        minutes: null,
        keyInsight: null,
        notes: null,
        insightRevealed: false,
      });
      reports += 1;

      const stored = getPet(app.db);
      const recomputed = recomputePetFacts(listAttemptFacts(app.db));
      const where = `seed ${seed}, step ${step}`;
      expect(stored.growthSolves, where).toBe(recomputed.growthSolves);
      expect(stored.totalAttempts, where).toBe(recomputed.totalAttempts);
      expect(stored.currentStreak, where).toBe(recomputed.currentStreak);
      expect(stored.longestStreak, where).toBe(recomputed.longestStreak);
      expect(stored.lastFedDay, where).toBe(recomputed.lastFedDay);

      expect(stored.totalAttempts, where).toBe(reports);
      expect(stored.longestStreak, where).toBeGreaterThanOrEqual(longestSeen);
      expect(stored.currentStreak, where).toBeLessThanOrEqual(stored.longestStreak);
      longestSeen = stored.longestStreak;
    }
  });
});
