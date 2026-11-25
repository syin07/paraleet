import { describe, expect, it } from 'vitest';
import {
  BEDTIME_HOUR,
  CHECKING_MS,
  EATING_MS,
  NIBBLING_MS,
  celebrationEndsAt,
  deriveMood,
  minutesIntoParaDay,
  reminderMinutesIntoParaDay,
  type MoodInput,
} from './pet';

const LA = 'America/Los_Angeles';

/** A winter instant (Los Angeles is UTC-8) from a local wall-clock time on 2026-01-15 plus offset days. */
function la(time: string, dayOffset = 0): Date {
  const day = String(15 + dayOffset).padStart(2, '0');
  return new Date(`2026-01-${day}T${time}:00-08:00`);
}

function input(overrides: Partial<MoodInput> & { now: Date }): MoodInput {
  return {
    timeZone: LA,
    dayBoundaryHour: 4,
    firstReminderTime: '16:00',
    eveningReminderTime: '20:00',
    fedToday: false,
    missedDays: 0,
    greetedToday: false,
    celebration: null,
    ...overrides,
  };
}

const mood = (time: string, overrides: Partial<MoodInput> = {}, dayOffset = 0) =>
  deriveMood(input({ now: la(time, dayOffset), ...overrides }));

describe('minutesIntoParaDay', () => {
  it('is 0 at the boundary hour and counts up from there', () => {
    expect(minutesIntoParaDay(la('04:00'), LA, 4)).toBe(0);
    expect(minutesIntoParaDay(la('04:01'), LA, 4)).toBe(1);
    expect(minutesIntoParaDay(la('16:30'), LA, 4)).toBe(12 * 60 + 30);
  });

  it('counts the hours after midnight as the end of the previous day', () => {
    expect(minutesIntoParaDay(la('01:00'), LA, 4)).toBe(21 * 60);
    expect(minutesIntoParaDay(la('03:59'), LA, 4)).toBe(1439);
  });

  it.each([0, 4, 6])('wraps correctly for boundary hour %i', (boundary) => {
    expect(minutesIntoParaDay(la('00:00'), LA, boundary)).toBe((0 - boundary * 60 + 1440) % 1440);
    expect(minutesIntoParaDay(la(`${String(boundary).padStart(2, '0')}:00`), LA, boundary)).toBe(0);
    expect(minutesIntoParaDay(la('23:59'), LA, boundary)).toBe((23 * 60 + 59 - boundary * 60 + 1440) % 1440);
  });

  it('reads the wall clock of the given zone, including half-hour offsets', () => {
    // 2026-01-15T00:00Z is 09:00 in Tokyo and 05:30 in Kolkata.
    const instant = new Date('2026-01-15T00:00:00Z');
    expect(minutesIntoParaDay(instant, 'Asia/Tokyo', 4)).toBe(5 * 60);
    expect(minutesIntoParaDay(instant, 'Asia/Kolkata', 4)).toBe(90);
  });

  it('uses the wall clock as it reads on a daylight-saving day', () => {
    // 2026-03-08: Los Angeles jumps from 02:00 PST to 03:00 PDT.
    expect(minutesIntoParaDay(new Date('2026-03-08T10:30:00Z'), LA, 4)).toBe(23 * 60 + 30); // 03:30 PDT
    expect(minutesIntoParaDay(new Date('2026-03-08T11:30:00Z'), LA, 4)).toBe(30); // 04:30 PDT
  });
});

describe('reminderMinutesIntoParaDay', () => {
  it('measures a time of day from the boundary hour', () => {
    expect(reminderMinutesIntoParaDay('04:00', 4)).toBe(0);
    expect(reminderMinutesIntoParaDay('16:00', 4)).toBe(720);
    expect(reminderMinutesIntoParaDay('00:30', 4)).toBe(20 * 60 + 30);
    expect(reminderMinutesIntoParaDay('03:59', 4)).toBe(1439);
  });

  it('rejects text that is not HH:MM', () => {
    expect(() => reminderMinutesIntoParaDay('4pm', 4)).toThrow(RangeError);
    expect(() => reminderMinutesIntoParaDay('24:00', 4)).toThrow(RangeError);
    expect(() => reminderMinutesIntoParaDay('10:60', 4)).toThrow(RangeError);
  });
});

describe('deriveMood: not fed', () => {
  it('sleeps before the first reminder, peckish from it, hungry from the evening one', () => {
    expect(mood('15:59')).toBe('sleeping');
    expect(mood('16:00')).toBe('peckish');
    expect(mood('19:59')).toBe('peckish');
    expect(mood('20:00')).toBe('hungry');
    expect(mood('23:59')).toBe('hungry');
  });

  it('stays hungry through the small hours, which are the end of the previous day', () => {
    expect(mood('01:00')).toBe('hungry');
    expect(mood('03:59')).toBe('hungry');
  });

  it('starts the new day asleep at the boundary hour', () => {
    expect(mood('04:00')).toBe('sleeping');
    expect(mood('04:00', {}, 0)).toBe('sleeping');
  });

  it('works with boundary hours 0 and 6', () => {
    expect(mood('00:00', { dayBoundaryHour: 0 })).toBe('sleeping');
    expect(mood('23:59', { dayBoundaryHour: 0 })).toBe('hungry');
    expect(mood('05:59', { dayBoundaryHour: 6 })).toBe('hungry');
    expect(mood('06:00', { dayBoundaryHour: 6 })).toBe('sleeping');
  });

  it('handles reminder times after midnight', () => {
    const late = {
      dayBoundaryHour: 4,
      firstReminderTime: '22:00',
      eveningReminderTime: '00:30',
    };
    expect(mood('23:59', late)).toBe('peckish');
    expect(mood('00:29', late)).toBe('peckish');
    expect(mood('00:30', late)).toBe('hungry');
    expect(mood('03:59', late)).toBe('hungry');
    expect(mood('04:00', late)).toBe('sleeping');
  });

  it('treats the later of two out-of-order reminder times as the evening one', () => {
    const swapped = {
      firstReminderTime: '20:00',
      eveningReminderTime: '16:00',
    };
    expect(mood('15:59', swapped)).toBe('sleeping');
    expect(mood('16:00', swapped)).toBe('peckish');
    expect(mood('20:00', swapped)).toBe('hungry');
  });

  it('is peckish and hungry at once when both reminders share a time (hungry wins)', () => {
    expect(mood('16:00', { eveningReminderTime: '16:00' })).toBe('hungry');
  });
});

describe('deriveMood: fed', () => {
  const fed = { fedToday: true };

  it('is content during the day and sleeps from bedtime', () => {
    expect(BEDTIME_HOUR).toBe(23);
    expect(mood('04:00', fed)).toBe('content');
    expect(mood('12:00', fed)).toBe('content');
    expect(mood('22:59', fed)).toBe('content');
    expect(mood('23:00', fed)).toBe('sleeping');
  });

  it('sleeps through the late part of the ParaLeet day, then wakes at the boundary', () => {
    expect(mood('01:00', fed)).toBe('sleeping');
    expect(mood('03:59', fed)).toBe('sleeping');
    // At 04:00 the next ParaLeet day has begun, so the caller reports fedToday false there; the
    // mood function itself calls 04:00 daytime.
    expect(mood('04:00', fed)).toBe('content');
  });

  it('respects the boundary hour for the late part', () => {
    expect(mood('05:59', { ...fed, dayBoundaryHour: 6 })).toBe('sleeping');
    expect(mood('06:00', { ...fed, dayBoundaryHour: 6 })).toBe('content');
    expect(mood('00:00', { ...fed, dayBoundaryHour: 0 })).toBe('content');
    expect(mood('23:00', { ...fed, dayBoundaryHour: 0 })).toBe('sleeping');
  });

  it('ignores reminder times once fed', () => {
    expect(mood('17:00', fed)).toBe('content');
    expect(mood('21:00', fed)).toBe('content');
  });
});

describe('deriveMood: missed you', () => {
  it('greets the first launch after missed days until acknowledged', () => {
    expect(mood('09:00', { missedDays: 1 })).toBe('missed_you');
    expect(mood('18:00', { missedDays: 3 })).toBe('missed_you');
    expect(mood('21:00', { missedDays: 3 })).toBe('missed_you');
  });

  it('is gone once the greeting is acknowledged', () => {
    expect(mood('09:00', { missedDays: 1, greetedToday: true })).toBe('sleeping');
    expect(mood('17:00', { missedDays: 1, greetedToday: true })).toBe('peckish');
  });

  it('never shows after Para has been fed that day', () => {
    expect(mood('12:00', { missedDays: 2, fedToday: true })).toBe('content');
    expect(mood('23:30', { missedDays: 2, fedToday: true })).toBe('sleeping');
  });

  it('does not show for a new install or an unbroken run', () => {
    expect(mood('09:00', { missedDays: 0 })).toBe('sleeping');
  });
});

describe('deriveMood: celebration', () => {
  const reportedAt = la('12:00');
  const at = (ms: number) => new Date(reportedAt.getTime() + ms);
  const run = (meal: 'full' | 'crumb', ms: number, extra: Partial<MoodInput> = {}) =>
    deriveMood(
      input({
        now: at(ms),
        fedToday: true,
        celebration: { meal, reportedAt },
        ...extra,
      }),
    );

  it('checks for CHECKING_MS, then eats a full meal', () => {
    expect(run('full', 0)).toBe('checking');
    expect(run('full', CHECKING_MS - 1)).toBe('checking');
    expect(run('full', CHECKING_MS)).toBe('eating');
    expect(run('full', CHECKING_MS + EATING_MS - 1)).toBe('eating');
    expect(run('full', CHECKING_MS + EATING_MS)).toBe('content');
  });

  it('checks, then nibbles for a crumb, then returns to the normal mood', () => {
    expect(run('crumb', 0)).toBe('checking');
    expect(run('crumb', CHECKING_MS - 1)).toBe('checking');
    expect(run('crumb', CHECKING_MS)).toBe('nibbling');
    expect(run('crumb', CHECKING_MS + NIBBLING_MS - 1)).toBe('nibbling');
    expect(run('crumb', CHECKING_MS + NIBBLING_MS)).toBe('content');
  });

  it('goes back to sleeping when the report came late at night', () => {
    const night = la('23:30');
    const done = deriveMood(
      input({
        now: new Date(night.getTime() + 10_000),
        fedToday: true,
        celebration: { meal: 'full', reportedAt: night },
      }),
    );
    expect(done).toBe('sleeping');
  });

  it('beats the missed-you greeting', () => {
    expect(run('full', 0, { missedDays: 2, fedToday: false })).toBe('checking');
  });

  it('ignores a celebration dated in the future (clock moved back)', () => {
    expect(run('full', -1)).toBe('content');
    expect(run('full', -60_000)).toBe('content');
  });

  it('reports when the celebration is over', () => {
    expect(celebrationEndsAt({ meal: 'full', reportedAt }).getTime()).toBe(
      reportedAt.getTime() + CHECKING_MS + EATING_MS,
    );
    expect(celebrationEndsAt({ meal: 'crumb', reportedAt }).getTime()).toBe(
      reportedAt.getTime() + CHECKING_MS + NIBBLING_MS,
    );
  });
});

describe('deriveMood: a whole day in 15-minute steps', () => {
  /** The moods through one ParaLeet day starting at 04:00 on 2026-01-15, with the minute each began. */
  function walk(overrides: Partial<MoodInput>): Array<[string, string]> {
    const changes: Array<[string, string]> = [];
    let previous = '';
    for (let step = 0; step < 96; step += 1) {
      const now = new Date(la('04:00').getTime() + step * 15 * 60_000);
      const current = deriveMood(input({ now, ...overrides }));
      if (current !== previous) {
        const minutes = minutesIntoParaDay(now, LA, 4);
        changes.push([
          `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
          current,
        ]);
        previous = current;
      }
    }
    return changes;
  }

  it('unfed: sleeping, peckish at the first reminder, hungry at the evening one', () => {
    expect(walk({})).toEqual([
      ['00:00', 'sleeping'],
      ['12:00', 'peckish'],
      ['16:00', 'hungry'],
    ]);
  });

  it('fed: content, then sleeping from bedtime to the boundary', () => {
    expect(walk({ fedToday: true })).toEqual([
      ['00:00', 'content'],
      ['19:00', 'sleeping'],
    ]);
  });
});
