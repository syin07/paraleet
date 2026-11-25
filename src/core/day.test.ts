import { describe, expect, it } from 'vitest';
import { DEFAULT_BOUNDARY_HOUR, addDays, daysBetween, effectiveToday, isParaDay, paraDayOf, weekdayIndex } from './day';

const LA = 'America/Los_Angeles';

describe('paraDayOf', () => {
  it('counts a solve at 01:00 for the previous day', () => {
    // 2026-11-26 01:00 in Los Angeles (UTC-8)
    expect(paraDayOf(new Date('2026-11-26T09:00:00Z'), LA, 4)).toBe('2026-11-25');
  });

  it('starts the new day exactly at the boundary hour', () => {
    expect(paraDayOf(new Date('2026-11-26T11:59:59Z'), LA, 4)).toBe('2026-11-25');
    expect(paraDayOf(new Date('2026-11-26T12:00:00Z'), LA, 4)).toBe('2026-11-26');
  });

  it('uses the given time zone, not the machine one', () => {
    const instant = new Date('2026-11-25T20:00:00Z');
    expect(paraDayOf(instant, 'Asia/Tokyo', 4)).toBe('2026-11-26');
    expect(paraDayOf(instant, LA, 4)).toBe('2026-11-25');
  });

  it('honors a different boundary hour', () => {
    const instant = new Date('2026-11-26T09:00:00Z'); // 01:00 in Los Angeles
    expect(paraDayOf(instant, LA, 0)).toBe('2026-11-26');
    expect(paraDayOf(instant, LA, 2)).toBe('2026-11-25');
  });
});

describe('calendar helpers', () => {
  it('adds days across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('measures whole days between two days', () => {
    expect(daysBetween('2026-11-25', '2026-11-28')).toBe(3);
    expect(daysBetween('2026-11-25', '2026-11-24')).toBe(-1);
  });

  it('knows the weekday with Monday as 0', () => {
    expect(weekdayIndex('2026-11-23')).toBe(0); // a Monday
    expect(weekdayIndex('2026-11-25')).toBe(2); // a Wednesday
    expect(weekdayIndex('2026-11-29')).toBe(6); // a Sunday
  });

  it('recognizes well-formed days only', () => {
    expect(isParaDay('2026-11-25')).toBe(true);
    expect(isParaDay('2026-13-01')).toBe(false);
    expect(isParaDay('2026-02-30')).toBe(false);
    expect(isParaDay('25/11/2026')).toBe(false);
  });
});

describe('effectiveToday', () => {
  it('is the computed day when nothing was fed later', () => {
    expect(effectiveToday('2026-11-25', null)).toBe('2026-11-25');
    expect(effectiveToday('2026-11-25', '2026-11-24')).toBe('2026-11-25');
  });

  it('does not step back behind the last fed day after a move to an earlier time zone', () => {
    expect(effectiveToday('2026-11-25', '2026-11-26')).toBe('2026-11-26');
  });

  it('trusts the clock when the last fed day is implausibly far ahead', () => {
    expect(effectiveToday('2026-11-25', '2026-12-25')).toBe('2026-11-25');
  });
});

const at = (iso: string) => new Date(iso);

describe('paraDayOf: the boundary', () => {
  it('uses 04:00 by default', () => {
    expect(DEFAULT_BOUNDARY_HOUR).toBe(4);
    expect(paraDayOf(at('2026-11-26T11:59:59Z'), LA)).toBe('2026-11-25');
    expect(paraDayOf(at('2026-11-26T12:00:00Z'), LA)).toBe('2026-11-26');
  });

  it('switches at 03:59:59 / 04:00:00 local in UTC', () => {
    expect(paraDayOf(at('2026-06-10T03:59:59Z'), 'UTC', 4)).toBe('2026-06-09');
    expect(paraDayOf(at('2026-06-10T04:00:00Z'), 'UTC', 4)).toBe('2026-06-10');
  });

  it.each([0, 1, 4, 12, 23])('works with boundary hour %i', (hour) => {
    const start = at(`2026-06-10T${String(hour).padStart(2, '0')}:00:00Z`);
    expect(paraDayOf(start, 'UTC', hour)).toBe('2026-06-10');
    expect(paraDayOf(new Date(start.getTime() - 1000), 'UTC', hour)).toBe('2026-06-09');
  });

  it('works for every hour from 0 to 23', () => {
    for (let hour = 0; hour <= 23; hour++) {
      const start = at(`2026-06-10T${String(hour).padStart(2, '0')}:00:00Z`);
      expect(paraDayOf(start, 'UTC', hour)).toBe('2026-06-10');
      expect(paraDayOf(new Date(start.getTime() - 1000), 'UTC', hour)).toBe('2026-06-09');
    }
  });

  it.each([
    ['Asia/Kolkata', '2026-06-09T22:29:59Z', '2026-06-09T22:30:00Z'], // 03:59:59 / 04:00 at UTC+5:30
    ['Asia/Kathmandu', '2026-06-09T22:14:59Z', '2026-06-09T22:15:00Z'], // UTC+5:45
    ['Pacific/Kiritimati', '2026-06-09T13:59:59Z', '2026-06-09T14:00:00Z'], // UTC+14
    ['Pacific/Pago_Pago', '2026-06-10T14:59:59Z', '2026-06-10T15:00:00Z'], // UTC-11
    ['UTC', '2026-06-10T03:59:59Z', '2026-06-10T04:00:00Z'],
  ])('switches at 04:00 local in %s', (zone, before, after) => {
    const beforeDay = paraDayOf(at(before), zone, 4);
    const afterDay = paraDayOf(at(after), zone, 4);
    expect(daysBetween(beforeDay, afterDay)).toBe(1);
    expect(afterDay).toBe(paraDayOf(at(after), zone, 0));
  });

  it('gives exact days in half-hour and quarter-hour zones', () => {
    expect(paraDayOf(at('2026-06-09T22:29:59Z'), 'Asia/Kolkata', 4)).toBe('2026-06-09');
    expect(paraDayOf(at('2026-06-09T22:30:00Z'), 'Asia/Kolkata', 4)).toBe('2026-06-10');
    expect(paraDayOf(at('2026-06-09T22:14:59Z'), 'Asia/Kathmandu', 4)).toBe('2026-06-09');
    expect(paraDayOf(at('2026-06-09T22:15:00Z'), 'Asia/Kathmandu', 4)).toBe('2026-06-10');
    expect(paraDayOf(at('2026-06-09T13:59:59Z'), 'Pacific/Kiritimati', 4)).toBe('2026-06-09');
    expect(paraDayOf(at('2026-06-09T14:00:00Z'), 'Pacific/Kiritimati', 4)).toBe('2026-06-10');
    expect(paraDayOf(at('2026-06-10T14:59:59Z'), 'Pacific/Pago_Pago', 4)).toBe('2026-06-09');
    expect(paraDayOf(at('2026-06-10T15:00:00Z'), 'Pacific/Pago_Pago', 4)).toBe('2026-06-10');
  });

  it('handles year and leap-day ends', () => {
    expect(paraDayOf(at('2027-01-01T03:00:00Z'), 'UTC', 4)).toBe('2026-12-31');
    expect(paraDayOf(at('2027-01-01T04:00:00Z'), 'UTC', 4)).toBe('2027-01-01');
    expect(paraDayOf(at('2028-03-01T02:00:00Z'), 'UTC', 4)).toBe('2028-02-29');
    expect(paraDayOf(at('2028-02-29T23:59:59Z'), 'UTC', 4)).toBe('2028-02-29');
    expect(paraDayOf(at('2027-03-01T02:00:00Z'), 'UTC', 4)).toBe('2027-02-28');
  });

  it('rejects an invalid boundary hour with a RangeError', () => {
    const instant = at('2026-06-10T12:00:00Z');
    for (const bad of [-1, 24, 4.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => paraDayOf(instant, 'UTC', bad)).toThrow(RangeError);
    }
  });

  it('fails loudly on an unknown time zone', () => {
    expect(() => paraDayOf(at('2026-06-10T12:00:00Z'), 'Mars/Olympus', 4)).toThrow();
  });
});

/** Steps through [from, to] in 30-minute steps and returns each day. */
function walk(from: string, to: string, zone: string, boundary: number): string[] {
  const days: string[] = [];
  for (let t = at(from).getTime(); t <= at(to).getTime(); t += 30 * 60_000) {
    days.push(paraDayOf(new Date(t), zone, boundary));
  }
  return days;
}

function expectOneStepForward(days: string[]) {
  let changes = 0;
  for (let i = 1; i < days.length; i++) {
    const step = daysBetween(days[i - 1] ?? '', days[i] ?? '');
    expect(step === 0 || step === 1).toBe(true);
    changes += step;
  }
  expect(changes).toBe(1);
}

describe('paraDayOf: daylight-saving changes', () => {
  const cases: [string, string, string][] = [
    ['LA spring forward', LA, '2026-03-08'],
    ['LA fall back', LA, '2026-11-01'],
    ['Berlin spring forward', 'Europe/Berlin', '2026-03-29'],
    ['Berlin fall back', 'Europe/Berlin', '2026-10-25'],
  ];
  for (const [name, zone, date] of cases) {
    for (const boundary of [1, 2, 3, 4]) {
      it(`${name}, boundary ${boundary}: the day never goes back and changes exactly once`, () => {
        const start = `${addDays(date, -1)}T12:00:00Z`;
        const end = `${date}T20:00:00Z`;
        const days = walk(start, end, zone, boundary);
        expectOneStepForward(days);
        // And it is the new date (the one the change happens on) that comes out the other side.
        expect(days[days.length - 1]).toBe(date);
      });
    }
  }

  it('spring forward: a skipped boundary hour (02:00 in Los Angeles) starts the day at 03:00', () => {
    expect(paraDayOf(at('2026-03-08T09:59:59Z'), LA, 2)).toBe('2026-03-07'); // 01:59 PST
    expect(paraDayOf(at('2026-03-08T10:00:00Z'), LA, 2)).toBe('2026-03-08'); // 03:00 PDT
  });

  it('spring forward: 04:00 is on time, one real hour later than usual', () => {
    expect(paraDayOf(at('2026-03-08T10:59:59Z'), LA, 4)).toBe('2026-03-07'); // 03:59 PDT
    expect(paraDayOf(at('2026-03-08T11:00:00Z'), LA, 4)).toBe('2026-03-08'); // 04:00 PDT
  });

  it('fall back: both passes through 01:00 get the same day', () => {
    expect(paraDayOf(at('2026-11-01T08:30:00Z'), LA, 2)).toBe('2026-10-31'); // 01:30 PDT
    expect(paraDayOf(at('2026-11-01T09:30:00Z'), LA, 2)).toBe('2026-10-31'); // 01:30 PST
    expect(paraDayOf(at('2026-11-01T10:00:00Z'), LA, 2)).toBe('2026-11-01'); // 02:00 PST
  });

  it('fall back with boundary 1: the repeated hour 01:00 starts the day on its first pass only', () => {
    expect(paraDayOf(at('2026-11-01T07:59:59Z'), LA, 1)).toBe('2026-10-31'); // 00:59 PDT
    expect(paraDayOf(at('2026-11-01T08:00:00Z'), LA, 1)).toBe('2026-11-01'); // 01:00 PDT
    expect(paraDayOf(at('2026-11-01T09:30:00Z'), LA, 1)).toBe('2026-11-01'); // 01:30 PST
  });
});
