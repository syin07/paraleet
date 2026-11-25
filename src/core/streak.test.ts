import { describe, expect, it } from 'vitest';
import { applyAttempt, EMPTY_PET_FACTS, recomputePetFacts, stageFor } from './petFacts';
import { capRatingAfterReveal } from './scheduler';
import { effectiveToday, paraDayOf } from './day';
import { applyFedDay, displayedStreak, EMPTY_STREAK, isFedOn, missedDays } from './streak';

describe('streak', () => {
  it('starts at 1 on the first fed day', () => {
    expect(applyFedDay(EMPTY_STREAK, '2026-11-25')).toEqual({
      current: 1,
      longest: 1,
      lastFedDay: '2026-11-25',
    });
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

describe('streak: more cases', () => {
  it('resets after many missed days and keeps the longest', () => {
    let state = applyFedDay(applyFedDay(EMPTY_STREAK, '2026-01-01'), '2026-01-02');
    state = applyFedDay(state, '2026-06-01');
    expect(state).toEqual({ current: 1, longest: 2, lastFedDay: '2026-06-01' });
  });

  it('shows 0 two days after the fed day and the next attempt makes it 1', () => {
    const state = { current: 4, longest: 4, lastFedDay: '2026-11-25' };
    expect(displayedStreak(state, '2026-11-25')).toBe(4);
    expect(displayedStreak(state, '2026-11-26')).toBe(4);
    expect(displayedStreak(state, '2026-11-27')).toBe(0);
    expect(applyFedDay(state, '2026-11-27')).toEqual({
      current: 1,
      longest: 4,
      lastFedDay: '2026-11-27',
    });
  });

  it('never lowers the longest streak', () => {
    let state = EMPTY_STREAK;
    let longest = 0;
    for (const day of ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-09', '2026-01-02', '2026-03-01']) {
      state = applyFedDay(state, day);
      expect(state.longest).toBeGreaterThanOrEqual(longest);
      longest = state.longest;
    }
    expect(longest).toBe(3);
  });

  it('an attempt dated 0, 1 or 2 days before the last fed day changes nothing', () => {
    const state = { current: 3, longest: 5, lastFedDay: '2026-11-25' };
    for (const day of ['2026-11-25', '2026-11-24', '2026-11-23']) {
      expect(applyFedDay(state, day)).toEqual(state);
    }
  });

  it('an attempt dated more than 2 days before the last fed day starts over and keeps longest', () => {
    const state = { current: 3, longest: 5, lastFedDay: '2026-11-25' };
    expect(applyFedDay(state, '2026-11-22')).toEqual({
      current: 1,
      longest: 5,
      lastFedDay: '2026-11-22',
    });
  });

  it('missedDays is 0 when the last fed day is on or after today', () => {
    const state = { current: 3, longest: 5, lastFedDay: '2026-11-25' };
    expect(missedDays(state, '2026-11-25')).toBe(0);
    expect(missedDays(state, '2026-11-20')).toBe(0);
    expect(missedDays(EMPTY_STREAK, '2026-11-20')).toBe(0);
  });

  it('isFedOn accepts a last fed day up to 2 days ahead, not further', () => {
    const state = { current: 3, longest: 5, lastFedDay: '2026-11-27' };
    expect(isFedOn(state, '2026-11-25')).toBe(true);
    expect(isFedOn(state, '2026-11-24')).toBe(false);
    expect(displayedStreak(state, '2026-11-25')).toBe(3);
    expect(displayedStreak(state, '2026-11-24')).toBe(0);
  });
});

describe('streak: time-zone stories', () => {
  const NY = 'America/New_York';
  const LA = 'America/Los_Angeles';
  const TOKYO = 'Asia/Tokyo';

  it('fed in New York, then the clock reads Los Angeles time', () => {
    const fedAt = new Date('2026-11-25T09:30:00Z'); // 04:30 EST
    let state = applyFedDay(applyFedDay(EMPTY_STREAK, '2026-11-24'), paraDayOf(fedAt, NY, 4));
    expect(state).toEqual({ current: 2, longest: 2, lastFedDay: '2026-11-25' });

    const computed = paraDayOf(fedAt, LA, 4); // 01:30 PST: still the previous day
    expect(computed).toBe('2026-11-24');
    const today = effectiveToday(computed, state.lastFedDay);
    expect(today).toBe('2026-11-25');
    expect(isFedOn(state, today)).toBe(true);
    expect(displayedStreak(state, today)).toBe(2);

    // Another attempt, dated in the new zone, changes nothing.
    expect(applyFedDay(state, computed)).toEqual(state);

    // The next real day (04:00 PST on the 26th) continues the streak.
    state = applyFedDay(state, paraDayOf(new Date('2026-11-26T12:00:00Z'), LA, 4));
    expect(state).toEqual({ current: 3, longest: 3, lastFedDay: '2026-11-26' });
  });

  it('fed in Los Angeles in the evening, then Tokyo time the same night', () => {
    const fedAt = new Date('2026-11-25T04:00:00Z'); // 20:00 PST on the 24th
    let state = applyFedDay(applyFedDay(EMPTY_STREAK, '2026-11-23'), paraDayOf(fedAt, LA, 4));
    expect(state).toEqual({ current: 2, longest: 2, lastFedDay: '2026-11-24' });

    const inTokyo = new Date('2026-11-25T05:00:00Z'); // 14:00 JST on the 25th
    const day = paraDayOf(inTokyo, TOKYO, 4);
    expect(day).toBe('2026-11-25');
    expect(displayedStreak(state, day)).toBe(2); // not yet missed
    state = applyFedDay(state, day);
    expect(state).toEqual({ current: 3, longest: 3, lastFedDay: '2026-11-25' });
  });
});

describe('streak: a clock that was wrong in the future', () => {
  it('does not freeze the pet once the clock is right again', () => {
    const real = '2026-11-25';
    let state = applyFedDay(applyFedDay(EMPTY_STREAK, '2026-11-24'), real);
    expect(state.current).toBe(2);

    state = applyFedDay(state, '2027-11-25'); // attempt logged while the clock was a year ahead
    expect(state.lastFedDay).toBe('2027-11-25');

    const today = effectiveToday(real, state.lastFedDay);
    expect(today).toBe(real);
    expect(isFedOn(state, today)).toBe(false);
    expect(displayedStreak(state, today)).toBe(0);

    state = applyFedDay(state, today);
    expect(state.current).toBe(1);
    expect(state.lastFedDay).toBe(real);
    expect(state.longest).toBeGreaterThanOrEqual(2);

    state = applyFedDay(applyFedDay(state, '2026-11-26'), '2026-11-27');
    expect(state.current).toBe(3);
    expect(state.longest).toBe(3);
  });
});

describe('pet facts', () => {
  it('counts Again for the streak and the total, but not for growth', () => {
    const facts = applyAttempt(EMPTY_PET_FACTS, {
      paraDay: '2026-11-25',
      rating: 'again',
    });
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
