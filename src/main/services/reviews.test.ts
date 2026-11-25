// The daily loop with review cards: due reviews take the slot, swap, retire and reset, and the
// launch-time reconcile step.
import { afterEach, describe, expect, it } from 'vitest';
import { recomputePetFacts } from '../../core/petFacts';
import { getAssignment } from '../../data/repos/assignments';
import { listAttemptFacts } from '../../data/repos/attempts';
import { getCard, listActiveCards } from '../../data/repos/cards';
import { getPet } from '../../data/repos/pet';
import { listStarterQueue } from '../../data/repos/problems';
import { reconcile } from './index';
import { createTestApp, noonLA, type TestApp } from './testing';

let app: TestApp;
afterEach(() => app?.close());

type Rated = 'again' | 'hard' | 'good' | 'easy';

function report(problemId: number, rating: Rated = 'good') {
  return app.handlers.submitReport({
    problemId,
    rating,
    minutes: null,
    keyInsight: null,
    notes: null,
    insightRevealed: false,
  });
}

/** Reports `count` different starter problems on the current day and returns their IDs. */
async function reportStarters(count: number, rating: Rated): Promise<number[]> {
  const ids = listStarterQueue(app.db).slice(0, count);
  for (const id of ids) await report(id, rating);
  return ids;
}

describe('review cards are created by reporting', () => {
  it('gives the problem a card and says when it comes back', async () => {
    app = createTestApp();
    const id = (await app.handlers.getToday(undefined)).assignment?.problem.id ?? 0;
    expect(getCard(app.db, id)).toBeNull();

    const result = await report(id, 'good');
    expect(result.nextReviewDay).toBe('2026-11-29'); // Good on a new card: 4 days
    expect(getCard(app.db, id)).toMatchObject({ problemId: id, status: 'active' });

    const detail = await app.handlers.getProblemDetail({ problemId: id });
    expect(detail.card).toEqual({ status: 'active', dueDay: '2026-11-29', isDue: false });
    const [row] = await app.handlers.listLoggedProblems(undefined);
    expect(row?.card).toEqual({ status: 'active', dueDay: '2026-11-29', isDue: false });
  });

  it('updates the same card on a later attempt', async () => {
    app = createTestApp();
    const id = (await app.handlers.getToday(undefined)).assignment?.problem.id ?? 0;
    await report(id, 'again');
    app.clock.set(noonLA('2026-11-26'));
    const second = await report(id, 'good');
    expect(listActiveCards(app.db)).toHaveLength(1);
    expect(second.nextReviewDay && second.nextReviewDay > '2026-11-27').toBe(true);
    const detail = await app.handlers.getProblemDetail({ problemId: id });
    expect(detail.attempts.map((attempt) => attempt.kind)).toEqual(['review', 'first_solve']);
  });

  it('previews the next review for each rating on the report form', async () => {
    app = createTestApp();
    const id = (await app.handlers.getToday(undefined)).assignment?.problem.id ?? 0;
    const first = await app.handlers.getReportContext({ problemId: id });
    expect(first.kind).toBe('first_solve');
    expect(first.nextReviewInDays).toEqual({ again: 1, hard: 2, good: 4, easy: 16 });

    await report(id, 'good');
    app.clock.set(noonLA('2026-11-29'));
    const review = await app.handlers.getReportContext({ problemId: id });
    expect(review.kind).toBe('review');
    const days = review.nextReviewInDays;
    expect(days && days.again < days.hard && days.hard < days.good && days.good < days.easy).toBe(true);
  });

  it('uses the retention setting', async () => {
    app = createTestApp();
    const id = (await app.handlers.getToday(undefined)).assignment?.problem.id ?? 0;
    const relaxed = (await app.handlers.getReportContext({ problemId: id })).nextReviewInDays;
    await app.handlers.updateSettings({ targetRetention: 0.95 });
    const strict = (await app.handlers.getReportContext({ problemId: id })).nextReviewInDays;
    expect((strict?.easy ?? 0) < (relaxed?.easy ?? 0)).toBe(true);
  });
});

describe('due reviews take the daily slot', () => {
  it('assigns yesterday\'s Again as today\'s problem instead of the next starter', async () => {
    app = createTestApp();
    const first = await app.handlers.getToday(undefined);
    const id = first.assignment?.problem.id ?? 0;
    const result = await report(id, 'again');
    expect(result.nextReviewDay).toBe('2026-11-26');

    app.clock.set(noonLA('2026-11-26'));
    const next = await app.handlers.getToday(undefined);
    expect(next.assignment).toMatchObject({ reason: 'review', completed: false, problem: { id } });
    expect(next.dueReviews).toEqual([]);
    expect(next.fed).toBe(false);
  });

  it('goes back to the starter list when no review is due', async () => {
    app = createTestApp();
    const id = (await app.handlers.getToday(undefined)).assignment?.problem.id ?? 0;
    await report(id, 'good'); // due in 4 days
    app.clock.set(noonLA('2026-11-26'));
    const next = await app.handlers.getToday(undefined);
    expect(next.assignment).toMatchObject({ reason: 'starter', problem: { title: 'Valid Anagram' } });
  });

  it('picks the most overdue review and lists at most five others', async () => {
    app = createTestApp({ now: noonLA('2026-11-20') });
    const [oldest] = await reportStarters(1, 'again'); // due Nov 21
    app.clock.set(noonLA('2026-11-22'));
    const later = (await reportStarters(8, 'again')).filter((id) => id !== oldest); // due Nov 23

    app.clock.set(noonLA('2026-11-25'));
    const today = await app.handlers.getToday(undefined);
    expect(today.assignment).toMatchObject({ reason: 'review', problem: { id: oldest } });
    expect(today.dueReviews).toHaveLength(5);
    expect(today.dueReviews.map((item) => item.problem.id)).toEqual(later.slice(0, 5));
    expect(today.dueReviews.every((item) => item.daysOverdue === 2)).toBe(true);
    // Nothing in the view says how many more are due.
    expect(JSON.stringify(today)).not.toMatch(/"(total|count|more|overdueCount|remaining)"/i);
  });

  it('marks a review done and feeds the pet when it is reported', async () => {
    app = createTestApp();
    const id = (await app.handlers.getToday(undefined)).assignment?.problem.id ?? 0;
    await report(id, 'again');
    app.clock.set(noonLA('2026-11-26'));
    await app.handlers.getToday(undefined);
    const result = await report(id, 'good');
    expect(result.today.assignment).toMatchObject({ reason: 'review', completed: true });
    expect(result.today.fed).toBe(true);
    expect(result.streak.current).toBe(2);
  });
});

describe('swapping today\'s problem', () => {
  async function twoDueReviews(): Promise<number[]> {
    app = createTestApp({ now: noonLA('2026-11-24') });
    const ids = await reportStarters(2, 'again'); // both due Nov 25
    app.clock.set(noonLA('2026-11-25'));
    return ids;
  }

  it('offers the other due reviews and records the swap as the user\'s pick', async () => {
    const [first, second] = await twoDueReviews();
    const before = await app.handlers.getToday(undefined);
    expect(before.assignment).toMatchObject({ reason: 'review', problem: { id: first } });

    const candidates = await app.handlers.getSwapCandidates(undefined);
    expect(candidates.reviews.map((item) => item.problem.id)).toEqual([second]);
    expect(candidates.plan).toEqual([]);

    const after = await app.handlers.swapToday({ problemId: second ?? 0 });
    expect(after.assignment).toMatchObject({ reason: 'user_swap', completed: false, problem: { id: second } });
    expect(after.dueReviews.map((item) => item.problem.id)).toEqual([first]);
    expect(getAssignment(app.db, '2026-11-25')).toMatchObject({ problemId: second, reason: 'user_swap' });
  });

  it('refuses a problem that is not a swap choice', async () => {
    await twoDueReviews();
    const starter = listStarterQueue(app.db)[0] ?? 0;
    expect(() => app.handlers.swapToday({ problemId: starter })).toThrow(/not one of the swap choices/);
  });

  it('refuses to swap once today\'s problem is done', async () => {
    const [first, second] = await twoDueReviews();
    await app.handlers.getToday(undefined);
    await report(first ?? 0, 'good');
    expect(() => app.handlers.swapToday({ problemId: second ?? 0 })).toThrow(/already done/);
  });
});

describe('retiring and resetting a card', () => {
  it('a retired card is never due and never assigned; a reset one is due again', async () => {
    app = createTestApp();
    const id = (await app.handlers.getToday(undefined)).assignment?.problem.id ?? 0;
    await report(id, 'again'); // due tomorrow

    const retired = await app.handlers.retireCard({ problemId: id });
    expect(retired.card).toMatchObject({ status: 'retired', isDue: false });
    app.clock.set(noonLA('2026-11-26'));
    const next = await app.handlers.getToday(undefined);
    expect(next.assignment?.reason).toBe('starter');
    expect(next.dueReviews).toEqual([]);

    const reset = await app.handlers.resetCard({ problemId: id });
    expect(reset.card).toEqual({ status: 'active', dueDay: '2026-11-26', isDue: true });
    const candidates = await app.handlers.getSwapCandidates(undefined);
    expect(candidates.reviews.map((item) => item.problem.id)).toEqual([id]);
  });

  it('promises no next review on the report form for a retired card', async () => {
    app = createTestApp();
    const id = (await app.handlers.getToday(undefined)).assignment?.problem.id ?? 0;
    await report(id, 'again');
    expect((await app.handlers.getReportContext({ problemId: id })).nextReviewInDays).not.toBeNull();
    await app.handlers.retireCard({ problemId: id });
    expect((await app.handlers.getReportContext({ problemId: id })).nextReviewInDays).toBeNull();
    app.clock.set(noonLA('2026-11-26'));
    expect((await report(id, 'good')).nextReviewDay).toBeNull();
  });

  it('says so when the problem has no card yet', async () => {
    app = createTestApp();
    const id = (await app.handlers.getToday(undefined)).assignment?.problem.id ?? 0;
    expect(() => app.handlers.retireCard({ problemId: id })).toThrow(/no review card/);
  });
});

describe('reconcile at launch', () => {
  it('changes nothing when the stored data already agrees with the attempts', async () => {
    app = createTestApp();
    await reportStarters(3, 'good');
    expect(reconcile(app.ctx)).toEqual({ petFactsRepaired: false, cardsRebuilt: 0 });
  });

  it('corrects stored streak and totals that drifted from the attempts', async () => {
    app = createTestApp();
    await reportStarters(3, 'good');
    app.db.run('UPDATE pet SET current_streak = 99, growth_solves = 0, last_fed_day = NULL WHERE id = 1');

    expect(reconcile(app.ctx)).toEqual({ petFactsRepaired: true, cardsRebuilt: 0 });
    const pet = getPet(app.db);
    expect({
      growthSolves: pet.growthSolves,
      totalAttempts: pet.totalAttempts,
      currentStreak: pet.currentStreak,
      longestStreak: pet.longestStreak,
      lastFedDay: pet.lastFedDay,
    }).toEqual(recomputePetFacts(listAttemptFacts(app.db)));
    expect(pet.currentStreak).toBe(1);
  });

  it('rebuilds review cards for attempts logged before cards existed', async () => {
    app = createTestApp();
    const id = (await app.handlers.getToday(undefined)).assignment?.problem.id ?? 0;
    await report(id, 'again');
    app.clock.set(noonLA('2026-11-26'));
    await report(id, 'good');
    const original = getCard(app.db, id);
    app.db.run('DELETE FROM review_cards');

    expect(reconcile(app.ctx)).toEqual({ petFactsRepaired: false, cardsRebuilt: 1 });
    expect(getCard(app.db, id)).toEqual(original);
  });
});
