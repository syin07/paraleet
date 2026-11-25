import { describe, expect, it } from 'vitest';
import { dueReminder, markSent, reminderText, type ReminderInput } from './reminders';

const LA = 'America/Los_Angeles';
const TODAY = '2026-01-15';

function la(time: string, dayOffset = 0): Date {
  const day = String(15 + dayOffset).padStart(2, '0');
  return new Date(`2026-01-${day}T${time}:00-08:00`);
}

function input(time: string, overrides: Partial<ReminderInput> = {}): ReminderInput {
  return {
    now: la(time),
    timeZone: LA,
    dayBoundaryHour: 4,
    firstReminderTime: '16:00',
    eveningReminderTime: '20:00',
    fedToday: false,
    today: TODAY,
    sent: { first: null, evening: null },
    ...overrides,
  };
}

describe('dueReminder', () => {
  it('is not due before the first reminder time', () => {
    expect(dueReminder(input('15:59'))).toBeNull();
    expect(dueReminder(input('05:00'))).toBeNull();
  });

  it('is due from the first reminder time until the evening one', () => {
    expect(dueReminder(input('16:00'))).toBe('first');
    expect(dueReminder(input('19:59'))).toBe('first');
  });

  it('is the evening one from its time', () => {
    expect(dueReminder(input('20:00'))).toBe('evening');
    expect(dueReminder(input('23:30'))).toBe('evening');
  });

  it('keeps the evening reminder due after midnight, as part of the same ParaLeet day', () => {
    expect(
      dueReminder(
        input('01:00', {
          today: '2026-01-14',
          sent: { first: '2026-01-14', evening: null },
        }),
      ),
    ).toBe('evening');
  });

  it('is never due once fed', () => {
    expect(dueReminder(input('16:00', { fedToday: true }))).toBeNull();
    expect(dueReminder(input('21:00', { fedToday: true }))).toBeNull();
  });

  it('is not due again once sent today', () => {
    expect(dueReminder(input('17:00', { sent: { first: TODAY, evening: null } }))).toBeNull();
    expect(dueReminder(input('21:00', { sent: { first: TODAY, evening: TODAY } }))).toBeNull();
  });

  it('sends the evening one after the first went out', () => {
    expect(dueReminder(input('20:00', { sent: { first: TODAY, evening: null } }))).toBe('evening');
  });

  it('counts yesterday as not sent', () => {
    expect(
      dueReminder(
        input('16:00', {
          sent: { first: '2026-01-14', evening: '2026-01-14' },
        }),
      ),
    ).toBe('first');
  });

  it('sends only the evening one when both are overdue', () => {
    expect(dueReminder(input('22:00'))).toBe('evening');
  });

  it('does not send the first after the evening one went out', () => {
    expect(dueReminder(input('21:00', { sent: { first: null, evening: TODAY } }))).toBeNull();
  });

  it('counts a sent day in the future (clock moved back) as sent', () => {
    expect(dueReminder(input('17:00', { sent: { first: '2026-01-16', evening: null } }))).toBeNull();
    expect(
      dueReminder(
        input('21:00', {
          sent: { first: '2026-01-16', evening: '2026-01-16' },
        }),
      ),
    ).toBeNull();
  });

  it('works with reminder times after midnight and out of order', () => {
    const after = { firstReminderTime: '22:00', eveningReminderTime: '00:30' };
    expect(dueReminder(input('22:00', after))).toBe('first');
    expect(dueReminder(input('00:29', { ...after, today: '2026-01-14' }))).toBe('first');
    expect(dueReminder(input('00:30', { ...after, today: '2026-01-14' }))).toBe('evening');
    const swapped = {
      firstReminderTime: '20:00',
      eveningReminderTime: '16:00',
    };
    expect(dueReminder(input('16:00', swapped))).toBe('first');
    expect(dueReminder(input('20:00', swapped))).toBe('evening');
  });

  it('uses the boundary hour and zone given', () => {
    // 2026-01-15T07:00Z is 16:00 in Tokyo.
    expect(
      dueReminder({
        ...input('00:00'),
        now: new Date('2026-01-15T07:00:00Z'),
        timeZone: 'Asia/Tokyo',
      }),
    ).toBe('first');
    expect(
      dueReminder({
        ...input('00:00'),
        now: new Date('2026-01-15T10:29:00Z'),
        timeZone: 'Asia/Kolkata',
      }),
    ).toBeNull();
    expect(
      dueReminder({
        ...input('00:00'),
        now: new Date('2026-01-15T10:30:00Z'),
        timeZone: 'Asia/Kolkata',
      }),
    ).toBe('first');
  });

  it('sends at most two a day when run repeatedly through a day', () => {
    let sent: ReminderInput['sent'] = { first: null, evening: null };
    const sentKinds: string[] = [];
    for (let step = 0; step < 96; step += 1) {
      const now = new Date(la('04:00').getTime() + step * 15 * 60_000);
      const kind = dueReminder({ ...input('04:00'), now, sent });
      if (kind) {
        sentKinds.push(kind);
        sent = markSent(sent, kind, TODAY);
      }
    }
    expect(sentKinds).toEqual(['first', 'evening']);
  });
});

describe('markSent', () => {
  it('marks only the first reminder when the first is sent', () => {
    expect(markSent({ first: null, evening: null }, 'first', TODAY)).toEqual({
      first: TODAY,
      evening: null,
    });
  });

  it('keeps an earlier evening record when the first is sent', () => {
    expect(markSent({ first: null, evening: '2026-01-10' }, 'first', TODAY)).toEqual({
      first: TODAY,
      evening: '2026-01-10',
    });
  });

  it('marks both when the evening one is sent, so a late wake sends one notification', () => {
    expect(markSent({ first: null, evening: null }, 'evening', TODAY)).toEqual({
      first: TODAY,
      evening: TODAY,
    });
    expect(
      dueReminder(
        input('22:00', {
          sent: markSent({ first: null, evening: null }, 'evening', TODAY),
        }),
      ),
    ).toBeNull();
  });
});

describe('reminderText', () => {
  it('names the problem and platform', () => {
    expect(reminderText('first', { title: 'Two Sum', platformLabel: 'LeetCode' })).toEqual({
      title: 'Para is peckish',
      body: 'Today: Two Sum on LeetCode',
    });
    expect(
      reminderText('evening', {
        title: 'Watermelon',
        platformLabel: 'Codeforces',
      }),
    ).toEqual({
      title: 'Para is getting hungry',
      body: 'Today: Watermelon on Codeforces',
    });
  });

  it('says any logged problem feeds Para when nothing is assigned', () => {
    for (const kind of ['first', 'evening'] as const) {
      const text = reminderText(kind, null);
      expect(text.body).toMatch(/any problem/i);
      expect(text.body).toMatch(/feeds Para/);
    }
  });

  it('stays warm: no guilt words', () => {
    for (const kind of ['first', 'evening'] as const) {
      for (const problem of [null, { title: 'X', platformLabel: 'CSES' }]) {
        const { title, body } = reminderText(kind, problem);
        expect(`${title} ${body}`).not.toMatch(/missed|overdue|behind|should|again|late\b/i);
      }
    }
  });
});
