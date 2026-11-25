// Reporting an attempt is all or nothing (PRD section 4 step 7, decision 0008): if verification
// refuses it, or any step inside the transaction fails, nothing at all is saved.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as SchedulerModule from '../../core/scheduler';
import type * as VerifyModule from '../../core/verify';

// Switches that make the scheduler or the verification step fail on demand. Everything else in
// those modules stays real.
const failures = vi.hoisted(() => ({ scheduler: false, verification: false }));

vi.mock('../../core/scheduler', async (importOriginal) => {
  const real = await importOriginal<typeof SchedulerModule>();
  const guard = <A extends unknown[], R>(fn: (...args: A) => R) =>
    (...args: A): R => {
      if (failures.scheduler) throw new Error('scheduler failed on purpose');
      return fn(...args);
    };
  return {
    ...real,
    scheduleFirstAttempt: guard(real.scheduleFirstAttempt),
    scheduleReview: guard(real.scheduleReview),
  };
});

vi.mock('../../core/verify', async (importOriginal) => {
  const real = await importOriginal<typeof VerifyModule>();
  return {
    ...real,
    verifyAttempt: async (...args: Parameters<typeof real.verifyAttempt>) =>
      failures.verification
        ? { accepted: false, method: 'self_report' as const, reason: 'Could not confirm this solve' }
        : real.verifyAttempt(...args),
  };
});

import { getAssignment } from '../../data/repos/assignments';
import { getCard } from '../../data/repos/cards';
import { getNotes } from '../../data/repos/notes';
import { getPet } from '../../data/repos/pet';
import { createTestApp, noonLA, type TestApp } from './testing';

let app: TestApp;
beforeEach(() => {
  failures.scheduler = false;
  failures.verification = false;
});
afterEach(() => app?.close());

function report(problemId: number, rating: 'again' | 'good' = 'good') {
  return app.handlers.submitReport({
    problemId,
    rating,
    minutes: 10,
    keyInsight: 'A fresh insight',
    notes: 'Some notes',
    insightRevealed: false,
  });
}

/** Everything a report writes, read straight from the database. */
function snapshot(problemId: number, day: string) {
  return {
    attempts: app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM attempts')?.n,
    card: getCard(app.db, problemId),
    pet: getPet(app.db),
    assignment: getAssignment(app.db, day),
    notes: getNotes(app.db, problemId),
  };
}

describe('a report is all or nothing', () => {
  it('saves nothing when a step inside the transaction fails on a first attempt', async () => {
    app = createTestApp();
    const id = (await app.handlers.getToday(undefined)).assignment?.problem.id ?? 0;
    const before = snapshot(id, '2026-11-25');
    const changesBefore = app.changes();

    failures.scheduler = true;
    await expect(report(id)).rejects.toThrow('scheduler failed on purpose');

    // The attempt was inserted and the insight saved before the scheduler ran; both are rolled back.
    expect(snapshot(id, '2026-11-25')).toEqual(before);
    expect(before.attempts).toBe(0);
    expect(app.changes()).toBe(changesBefore);
    expect((await app.handlers.getToday(undefined)).fed).toBe(false);
  });

  it('saves nothing when a step fails on a review, and keeps the earlier card and streak', async () => {
    app = createTestApp();
    const id = (await app.handlers.getToday(undefined)).assignment?.problem.id ?? 0;
    await report(id, 'again');
    app.clock.set(noonLA('2026-11-26'));
    await app.handlers.getToday(undefined);
    const before = snapshot(id, '2026-11-26');
    expect(before.attempts).toBe(1);
    expect(before.assignment).toMatchObject({ problemId: id, completed: false });

    failures.scheduler = true;
    await expect(report(id)).rejects.toThrow('scheduler failed on purpose');
    expect(snapshot(id, '2026-11-26')).toEqual(before);

    // Once the fault is gone the same report goes through whole.
    failures.scheduler = false;
    const result = await report(id);
    expect(result.streak.current).toBe(2);
    const after = snapshot(id, '2026-11-26');
    expect(after.attempts).toBe(2);
    expect(after.assignment?.completed).toBe(true);
    expect(after.card?.dueAt).not.toBe(before.card?.dueAt);
  });

  it('writes nothing when verification refuses the attempt, and says why', async () => {
    app = createTestApp();
    const id = (await app.handlers.getToday(undefined)).assignment?.problem.id ?? 0;
    const before = snapshot(id, '2026-11-25');
    const changesBefore = app.changes();

    failures.verification = true;
    await expect(report(id)).rejects.toThrow('Could not confirm this solve');

    expect(snapshot(id, '2026-11-25')).toEqual(before);
    expect(app.changes()).toBe(changesBefore);
  });

  it('with no fault, one report writes the attempt, the card, the pet facts, the insight and the assignment together', async () => {
    app = createTestApp();
    const id = (await app.handlers.getToday(undefined)).assignment?.problem.id ?? 0;
    await report(id);
    const after = snapshot(id, '2026-11-25');
    expect(after.attempts).toBe(1);
    expect(after.card).toMatchObject({ problemId: id, status: 'active' });
    expect(after.pet).toMatchObject({ totalAttempts: 1, growthSolves: 1, currentStreak: 1, lastFedDay: '2026-11-25' });
    expect(after.assignment?.completed).toBe(true);
    expect(after.notes.keyInsight).toBe('A fresh insight');
  });
});
