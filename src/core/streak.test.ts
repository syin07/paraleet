import { describe, expect, it } from 'vitest';
import { applyAttempt, EMPTY_PET_FACTS, recomputePetFacts, stageFor } from './petFacts';
import { capRatingAfterReveal } from './scheduler';
import { applyFedDay, displayedStreak, EMPTY_STREAK, isFedOn, missedDays } from './streak';

describe('streak', () => {
  it('starts at 1 on the first fed day', () => {
    expect(applyFedDay(EMPTY_STREAK, '2026-11-25')).toEqual({ current: 1, longest: 1, lastFedDay: '2026-11-25' });
  });

  it('goes up by one on consecutive days and not at all on the same day', () => {
    let state = applyFedDay(EMPTY_STREAK, '2026-11-25');
    state = applyFedDay(state, '2026-11-25');
    expect(state.current).toBe(1);
    state = applyFedDay(state, '2026-11-26');
    expect(state.current).toBe(2);
    expect(state.longest).toBe(2);
  });

  it('restarts at 1 after a missed day and keeps the longest streak', () => {
    let state = applyFedDay(EMPTY_STREAK, '2026-11-20');
    state = applyFedDay(state, '2026-11-21');
    state = applyFedDay(state, '2026-11-22');
    state = applyFedDay(state, '2026-11-25');
    expect(state).toEqual({ current: 1, longest: 3, lastFedDay: '2026-11-25' });
  });

  it('shows 0 once a full day was missed, and the stored streak until then', () => {
    const state = { current: 5, longest: 9, lastFedDay: '2026-11-24' };
    expect(displayedStreak(state, '2026-11-24')).toBe(5);
    expect(displayedStreak(state, '2026-11-25')).toBe(5); // still alive: today is not over
    expect(displayedStreak(state, '2026-11-26')).toBe(0);
    expect(missedDays(state, '2026-11-27')).toBe(2);
  });

  it('knows whether the pet is fed today', () => {
    const state = { current: 2, longest: 2, lastFedDay: '2026-11-25' };
    expect(isFedOn(state, '2026-11-25')).toBe(true);
    expect(isFedOn(state, '2026-11-26')).toBe(false);
    expect(isFedOn(EMPTY_STREAK, '2026-11-25')).toBe(false);
  });
});

describe('pet facts', () => {
  it('counts Again for the streak and the total, but not for growth', () => {
    const facts = applyAttempt(EMPTY_PET_FACTS, { paraDay: '2026-11-25', rating: 'again' });
    expect(facts).toEqual({
      growthSolves: 0,
      totalAttempts: 1,
      currentStreak: 1,
      longestStreak: 1,
      lastFedDay: '2026-11-25',
    });
  });

  it('recomputes the same facts from the attempt list', () => {
    const attempts = [
      { paraDay: '2026-11-23', rating: 'good' },
      { paraDay: '2026-11-24', rating: 'again' },
      { paraDay: '2026-11-24', rating: 'easy' },
      { paraDay: '2026-11-25', rating: 'hard' },
    ] as const;
    expect(recomputePetFacts(attempts)).toEqual({
      growthSolves: 3,
      totalAttempts: 4,
      currentStreak: 3,
      longestStreak: 3,
      lastFedDay: '2026-11-25',
    });
  });

  it('grows at 3, 15 and 50 growth solves', () => {
    expect(stageFor(0)).toBe('egg');
    expect(stageFor(2)).toBe('egg');
    expect(stageFor(3)).toBe('chick');
    expect(stageFor(14)).toBe('chick');
    expect(stageFor(15)).toBe('fledgling');
    expect(stageFor(49)).toBe('fledgling');
    expect(stageFor(50)).toBe('adult');
  });
});

describe('capRatingAfterReveal', () => {
  it('caps Good and Easy at Hard once the insight was revealed', () => {
    expect(capRatingAfterReveal('easy', true)).toBe('hard');
    expect(capRatingAfterReveal('good', true)).toBe('hard');
    expect(capRatingAfterReveal('hard', true)).toBe('hard');
    expect(capRatingAfterReveal('again', true)).toBe('again');
    expect(capRatingAfterReveal('easy', false)).toBe('easy');
  });
});
