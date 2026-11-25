import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, paraDayOf } from './day';
import {
  capRatingAfterReveal,
  DEFAULT_TARGET_RETENTION,
  dueDayOf,
  isDueOn,
  previewIntervals,
  resetCard,
  retireCard,
  scheduleFirstAttempt,
  scheduleReview,
  type SchedulerOptions,
} from './scheduler';
import type { Rating, ReviewCard, SchedulerState } from './types';

const TZ = 'America/Los_Angeles';
const opts: SchedulerOptions = { targetRetention: DEFAULT_TARGET_RETENTION, timeZone: TZ, boundaryHour: 4 };
const T0 = new Date('2026-11-25T20:00:00Z'); // noon in Los Angeles
const RATINGS: Rating[] = ['again', 'hard', 'good', 'easy'];

const day = (iso: string | Date) => paraDayOf(new Date(iso), TZ, 4);
const daysFrom = (now: Date, card: ReviewCard) => daysBetween(day(now), dueDayOf(card, TZ, 4));

/** A card rated the same way three times, each time on the day it came due. */
function seasoned(rating: Rating = 'good'): { card: ReviewCard; now: Date } {
  let now = T0;
  let card = scheduleFirstAttempt(1, rating, now, opts);
  for (let i = 0; i < 2; i++) {
    now = new Date(card.dueAt);
    card = scheduleReview(card, rating, now, opts);
  }
  return { card, now };
}

describe('first attempt and later attempts', () => {
  it('creates an active card for the problem, even when rated Again', () => {
    const card = scheduleFirstAttempt(7, 'again', T0, opts);
    expect(card.problemId).toBe(7);
    expect(card.status).toBe('active');
  });

  it('updates the same card on later attempts', () => {
    const first = scheduleFirstAttempt(7, 'good', T0, opts);
    const later = new Date(first.dueAt);
    const second = scheduleReview(first, 'good', later, opts);
    expect(second.problemId).toBe(7);
    expect(second.state).not.toEqual(first.state);
    expect(new Date(second.dueAt).getTime()).toBeGreaterThan(new Date(first.dueAt).getTime());
  });
});

describe('rating order', () => {
  it('gives strictly later due days Again < Hard < Good < Easy for a new card', () => {
    const days = RATINGS.map((r) => daysFrom(T0, scheduleFirstAttempt(1, r, T0, opts)));
    for (let i = 1; i < days.length; i++) expect(days[i]).toBeGreaterThan(days[i - 1]!);
  });

  it('does the same for a card with a few reviews', () => {
    const { card, now } = seasoned();
    const days = RATINGS.map((r) => daysFrom(now, scheduleReview(card, r, now, opts)));
    for (let i = 1; i < days.length; i++) expect(days[i]).toBeGreaterThan(days[i - 1]!);
  });

  it('grows intervals over a long run of Good ratings', () => {
    let now = T0;
    let card = scheduleFirstAttempt(1, 'good', now, opts);
    let last = daysFrom(now, card);
    for (let i = 0; i < 5; i++) {
      now = new Date(card.dueAt);
      card = scheduleReview(card, 'good', now, opts);
      const interval = daysFrom(now, card);
      expect(interval).toBeGreaterThan(last);
      last = interval;
    }
  });
});

describe('whole days', () => {
  it('never schedules a card due again on the day it was rated', () => {
    for (const r of RATINGS) {
      expect(daysFrom(T0, scheduleFirstAttempt(1, r, T0, opts))).toBeGreaterThanOrEqual(1);
    }
    const { card, now } = seasoned('again');
    expect(daysFrom(now, scheduleReview(card, 'again', now, opts))).toBeGreaterThanOrEqual(1);
  });

  it('puts the due time on exactly today plus the interval at 03:59 and 04:01 local', () => {
    // 04:00 PST is 12:00Z in November.
    const before = new Date('2026-11-25T11:59:00Z');
    const after = new Date('2026-11-25T12:01:00Z');
    expect(day(before)).toBe('2026-11-24');
    expect(day(after)).toBe('2026-11-25');
    for (const now of [before, after]) {
      for (const r of RATINGS) {
        const card = scheduleFirstAttempt(1, r, now, opts);
        const preview = previewIntervals(null, now, opts)[r];
        expect(day(card.dueAt)).toBe(addDays(day(now), preview));
        expect(preview).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it.each([
    ['daylight saving starts', '2026-03-08T20:00:00Z'],
    ['daylight saving ends', '2026-11-01T19:00:00Z'],
    ['the night before the spring change', '2026-03-08T07:30:00Z'],
    ['just after 04:00 on the fall change', '2026-11-01T12:01:00Z'],
  ])('keeps whole days and a later due day when %s', (_name, iso) => {
    const now = new Date(iso);
    for (const r of RATINGS) {
      const preview = previewIntervals(null, now, opts)[r];
      const card = scheduleFirstAttempt(1, r, now, opts);
      expect(preview).toBeGreaterThanOrEqual(1);
      expect(day(card.dueAt)).toBe(addDays(day(now), preview));
      const next = scheduleReview(card, r, now, opts);
      expect(daysFrom(now, next)).toBeGreaterThanOrEqual(1);
    }
  });

  it('lands on the intended day when the interval crosses a clock change', () => {
    for (const iso of ['2026-02-20T20:00:00Z', '2026-10-20T20:00:00Z', '2026-03-07T12:30:00Z', '2026-10-31T12:30:00Z']) {
      const now = new Date(iso);
      for (const r of RATINGS) {
        const preview = previewIntervals(null, now, opts)[r];
        expect(day(scheduleFirstAttempt(1, r, now, opts).dueAt)).toBe(addDays(day(now), preview));
      }
    }
  });
});

describe('target retention', () => {
  it('defaults to 0.85', () => {
    expect(DEFAULT_TARGET_RETENTION).toBe(0.85);
  });

  it('gives shorter intervals at a higher retention', () => {
    const { card, now } = seasoned();
    const low = daysFrom(now, scheduleReview(card, 'good', now, { ...opts, targetRetention: 0.8 }));
    const high = daysFrom(now, scheduleReview(card, 'good', now, { ...opts, targetRetention: 0.95 }));
    expect(high).toBeLessThan(low);
  });
});

describe('retire and reset', () => {
  it('a retired card is never due, even far in the future', () => {
    const card = retireCard(scheduleFirstAttempt(1, 'again', T0, opts));
    expect(card.status).toBe('retired');
    expect(isDueOn(card, '2099-01-01', TZ, 4)).toBe(false);
  });

  it('keeps state and dueAt when retiring', () => {
    const card = scheduleFirstAttempt(1, 'good', T0, opts);
    const retired = retireCard(card);
    expect(retired.state).toEqual(card.state);
    expect(retired.dueAt).toBe(card.dueAt);
  });

  it('a retired card stays retired when reviewed but its state updates', () => {
    const card = retireCard(scheduleFirstAttempt(1, 'good', T0, opts));
    const next = scheduleReview(card, 'good', new Date(card.dueAt), opts);
    expect(next.status).toBe('retired');
    expect(next.state).not.toEqual(card.state);
  });

  it('reset clears history, activates the card and makes it due today', () => {
    const { card, now } = seasoned();
    const reset = resetCard(retireCard(card), now);
    expect(reset.status).toBe('active');
    expect(reset.dueAt).toBe(now.toISOString());
    expect(isDueOn(reset, day(now), TZ, 4)).toBe(true);
    // The next review behaves like a first attempt.
    const fresh = scheduleFirstAttempt(reset.problemId, 'good', now, opts);
    expect(scheduleReview(reset, 'good', now, opts)).toEqual(fresh);
    // History is gone: the state does not depend on what came before.
    expect(resetCard(card, now).state).toEqual(resetCard(scheduleFirstAttempt(1, 'easy', T0, opts), now).state);
  });
});

describe('rating after the insight was revealed', () => {
  it('is capped at Hard', () => {
    expect(capRatingAfterReveal('easy', true)).toBe('hard');
    expect(capRatingAfterReveal('good', true)).toBe('hard');
    expect(capRatingAfterReveal('again', true)).toBe('again');
    expect(capRatingAfterReveal('easy', false)).toBe('easy');
  });
});

describe('previewIntervals', () => {
  it('matches what scheduling would do and is increasing', () => {
    const { card, now } = seasoned();
    const preview = previewIntervals(card, now, opts);
    for (const r of RATINGS) expect(preview[r]).toBe(daysFrom(now, scheduleReview(card, r, now, opts)));
    expect(preview.again).toBeLessThan(preview.hard);
    expect(preview.hard).toBeLessThan(preview.good);
    expect(preview.good).toBeLessThan(preview.easy);
  });

  it('works for a problem with no card and does not mutate its argument', () => {
    const preview = previewIntervals(null, T0, opts);
    for (const r of RATINGS) expect(preview[r]).toBe(daysFrom(T0, scheduleFirstAttempt(1, r, T0, opts)));
    const { card, now } = seasoned();
    const before = JSON.stringify(card);
    previewIntervals(card, now, opts);
    expect(JSON.stringify(card)).toBe(before);
  });
});

describe('JSON and mutation', () => {
  it('round-trips through JSON without loss and schedules identically', () => {
    const { card, now } = seasoned();
    const copy = JSON.parse(JSON.stringify(card)) as ReviewCard;
    expect(copy).toEqual(card);
    for (const r of RATINGS) expect(scheduleReview(copy, r, now, opts)).toEqual(scheduleReview(card, r, now, opts));
  });

  it('never mutates the card passed in', () => {
    const { card, now } = seasoned();
    const before = JSON.stringify(card);
    scheduleReview(card, 'hard', now, opts);
    retireCard(card);
    resetCard(card, now);
    previewIntervals(card, now, opts);
    expect(JSON.stringify(card)).toBe(before);
  });

  it('treats malformed state as a new card instead of throwing', () => {
    const fresh = scheduleFirstAttempt(3, 'good', T0, opts);
    const states: SchedulerState[] = [{}, { stability: 'x' }, { ...fresh.state, fsrsState: 9 }, { ...fresh.state, lastReviewDay: 'nope' }];
    for (const state of states) {
      const broken: ReviewCard = { problemId: 3, status: 'active', dueAt: T0.toISOString(), state };
      expect(scheduleReview(broken, 'good', T0, opts)).toEqual(fresh);
      expect(() => previewIntervals(broken, T0, opts)).not.toThrow();
    }
  });
});

describe('damaged and clock-skewed state', () => {
  const { card: seasonedCard, now: seasonedNow } = seasoned();
  const fresh = scheduleFirstAttempt(1, 'good', seasonedNow, opts);
  const withState = (patch: Record<string, string | number | null>): ReviewCard => ({
    ...seasonedCard,
    state: { ...seasonedCard.state, ...patch },
  });
  function oldShape(): ReviewCard {
    const { lastReviewDay: _day, ...rest } = seasonedCard.state;
    return { ...seasonedCard, state: { ...rest, lastReview: '2026-11-25T20:00:00.000Z' } };
  }
  const damaged: Array<[string, ReviewCard]> = [
    ['zero stability on a review card', withState({ stability: 0 })],
    ['negative stability', withState({ stability: -3 })],
    ['negative difficulty', withState({ difficulty: -1 })],
    ['difficulty above the maximum', withState({ difficulty: 11 })],
    ['fractional reps', withState({ reps: 1.5 })],
    ['negative lapses', withState({ lapses: -1 })],
    ['last review that is not a day', withState({ lastReviewDay: '2026-13-45' })],
    ['old shape with an ISO instant and no day', oldShape()],
    ['unknown state marker', withState({ fsrsState: 7 })],
  ];

  it.each(damaged)('treats %s as a new card without throwing', (_name, broken) => {
    expect(scheduleReview(broken, 'good', seasonedNow, opts).state).toEqual(fresh.state);
    expect(() => previewIntervals(broken, seasonedNow, opts)).not.toThrow();
    expect(previewIntervals(broken, seasonedNow, opts)).toEqual(previewIntervals(null, seasonedNow, opts));
  });

  it('keeps the memory state and counts 0 days when the last review is in the future', () => {
    const future = withState({ lastReviewDay: addDays(day(seasonedNow), 5) });
    const sameDay = withState({ lastReviewDay: day(seasonedNow) });
    const result = scheduleReview(future, 'good', seasonedNow, opts);
    expect(result).toEqual(scheduleReview(sameDay, 'good', seasonedNow, opts));
    expect(result.state.reps).toBe(Number(seasonedCard.state.reps) + 1);
    expect(previewIntervals(future, seasonedNow, opts)).toEqual(previewIntervals(sameDay, seasonedNow, opts));
  });
});

describe('options and placement', () => {
  it.each([0.5, 0.69, 0.98, 1, Number.NaN])('rejects target retention %s', (targetRetention) => {
    expect(() => scheduleFirstAttempt(1, 'good', T0, { ...opts, targetRetention })).toThrow(RangeError);
    expect(() => previewIntervals(null, T0, { ...opts, targetRetention })).toThrow(RangeError);
  });

  it('accepts the ends of the range', () => {
    for (const targetRetention of [0.7, 0.97]) {
      expect(() => scheduleFirstAttempt(1, 'good', T0, { ...opts, targetRetention })).not.toThrow();
    }
  });
});

describe('elapsed time is measured in ParaLeet days, not UTC days or clock time', () => {
  const zones = ['America/Los_Angeles', 'Asia/Tokyo'];

  /** An instant at the given local clock time on the given calendar date in the zone. */
  function localInstant(zone: string, date: string, hh: number, mm: number): Date {
    const guess = new Date(`${date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`);
    for (let i = 0; i < 3; i++) {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: zone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).formatToParts(guess);
      const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
      const shownMs = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
      const wantMs = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8)), hh, mm);
      guess.setTime(guess.getTime() + (wantMs - shownMs));
    }
    return guess;
  }

  it.each(zones)('gives the same result on the due ParaLeet day at any clock time in %s', (zone) => {
    const o = { ...opts, timeZone: zone };
    const rated = localInstant(zone, '2026-11-25', 17, 0);
    const first = scheduleFirstAttempt(1, 'again', rated, o);
    const dueDay = paraDayOf(new Date(first.dueAt), zone, 4);
    const nextDay = addDays(dueDay, 1);
    const times = [
      localInstant(zone, dueDay, 4, 1),
      localInstant(zone, dueDay, 9, 0),
      localInstant(zone, dueDay, 17, 0),
      localInstant(zone, nextDay, 3, 59),
    ];
    for (const t of times) expect(paraDayOf(t, zone, 4)).toBe(dueDay);
    const previews = times.map((t) => previewIntervals(first, t, o));
    const results = times.map((t) => scheduleReview(first, 'good', t, o));
    for (let i = 1; i < times.length; i++) {
      expect(previews[i]).toEqual(previews[0]);
      expect(results[i]!.state).toEqual(results[0]!.state);
      expect(paraDayOf(new Date(results[i]!.dueAt), zone, 4)).toBe(paraDayOf(new Date(results[0]!.dueAt), zone, 4));
    }
  });

  it('counts two attempts on the same ParaLeet day as 0 days apart', () => {
    const morning = new Date('2026-11-25T18:00:00Z'); // 10:00 PST
    const evening = new Date('2026-11-26T05:00:00Z'); // 21:00 PST, same ParaLeet day, next UTC day
    expect(day(morning)).toBe(day(evening));
    const first = scheduleFirstAttempt(1, 'good', morning, opts);
    const sameDay = scheduleReview(first, 'good', evening, opts);
    const stillMorning = scheduleReview(first, 'good', new Date('2026-11-25T19:00:00Z'), opts);
    expect(sameDay.state).toEqual(stillMorning.state);
  });

  it('gives a different result for a review a ParaLeet day late than one on time', () => {
    const first = scheduleFirstAttempt(1, 'good', T0, opts);
    const onTime = new Date(first.dueAt);
    const late = new Date(onTime.getTime() + 24 * 3_600_000);
    expect(scheduleReview(first, 'good', late, opts).state).not.toEqual(scheduleReview(first, 'good', onTime, opts).state);
  });
});

describe('due days', () => {
  it('is due on its due day and after, not before', () => {
    const card = scheduleFirstAttempt(1, 'good', T0, opts);
    const due = dueDayOf(card, TZ, 4);
    expect(isDueOn(card, addDays(due, -1), TZ, 4)).toBe(false);
    expect(isDueOn(card, due, TZ, 4)).toBe(true);
    expect(isDueOn(card, addDays(due, 30), TZ, 4)).toBe(true);
  });

  it('uses only dueAt and status, so an empty state works', () => {
    const card: ReviewCard = { problemId: 1, status: 'active', dueAt: '2026-11-25T20:00:00.000Z', state: {} };
    expect(dueDayOf(card, TZ, 4)).toBe('2026-11-25');
    expect(isDueOn(card, '2026-11-25', TZ, 4)).toBe(true);
  });

  it('respects the boundary hour for the due day', () => {
    const card: ReviewCard = { problemId: 1, status: 'active', dueAt: '2026-11-25T11:00:00.000Z', state: {} }; // 03:00 local
    expect(dueDayOf(card, TZ, 4)).toBe('2026-11-24');
  });
});

describe('known intervals at 0.85', () => {
  it('gives 1, 2, 4 and 16 days for a new card', () => {
    expect(previewIntervals(null, T0, opts)).toEqual({ again: 1, hard: 2, good: 4, easy: 16 });
  });
});
