// The two daily reminders, through the service: what is sent, when, and that a restart or a
// second tick never sends one twice.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getPet } from '../../data/repos/pet';
import { listStarterProblems } from '../../data/repos/problems';
import { sendDueReminder } from './index';
import { createTestApp, type TestApp } from './testing';

let app: TestApp;
afterEach(() => app?.close());

/** An instant on `day` at `time` in Los Angeles during standard time (UTC-8). */
function la(day: string, time: string): string {
  const [hour = 0, minute = 0] = time.split(':').map(Number);
  const at = new Date(`${day}T00:00:00.000Z`);
  at.setUTCHours(hour + 8, minute);
  return at.toISOString();
}

async function hatched(now: string, path?: string): Promise<TestApp> {
  const created = createTestApp({ now, path });
  await created.handlers.completeOnboarding({ firstReminderTime: '16:00', eveningReminderTime: '21:00' });
  return created;
}

const texts = (): string[] => app.notices.map((notice) => `${notice.title} | ${notice.body}`);

describe('sendDueReminder', () => {
  it('sends the first reminder once its time has passed, naming the problem, and only once', async () => {
    app = await hatched(la('2026-12-01', '15:59'));
    expect(sendDueReminder(app.ctx)).toBeNull();
    expect(app.notices).toEqual([]);

    app.clock.set(la('2026-12-01', '16:00'));
    expect(sendDueReminder(app.ctx)).toBe('first');
    expect(texts()).toEqual(['Para is peckish | Today: Two Sum on LeetCode']);
    // The next ticks send nothing more.
    for (const time of ['16:00', '16:01', '18:30', '20:59']) {
      app.clock.set(la('2026-12-01', time));
      expect(sendDueReminder(app.ctx)).toBeNull();
    }
    expect(app.notices).toHaveLength(1);
  });

  it('sends the evening reminder too, and never more than two in a day', async () => {
    app = await hatched(la('2026-12-01', '12:00'));
    app.clock.set(la('2026-12-01', '16:05'));
    expect(sendDueReminder(app.ctx)).toBe('first');
    app.clock.set(la('2026-12-01', '21:00'));
    expect(sendDueReminder(app.ctx)).toBe('evening');
    expect(texts()[1]).toBe('Para is getting hungry | Today: Two Sum on LeetCode');
    // Through the small hours, still the same ParaLeet day: nothing more.
    for (const [day, time] of [
      ['2026-12-01', '23:30'],
      ['2026-12-02', '01:00'],
      ['2026-12-02', '03:59'],
    ] as const) {
      app.clock.set(la(day, time));
      expect(sendDueReminder(app.ctx)).toBeNull();
    }
    expect(app.notices).toHaveLength(2);
    // A new day starts the count again.
    app.clock.set(la('2026-12-02', '16:00'));
    expect(sendDueReminder(app.ctx)).toBe('first');
  });

  it('sends nothing once Para is fed', async () => {
    app = await hatched(la('2026-12-01', '10:00'));
    const today = await app.handlers.getToday(undefined);
    await app.handlers.submitReport({
      problemId: today.assignment?.problem.id ?? 0,
      rating: 'again',
      minutes: null,
      keyInsight: null,
      notes: null,
      insightRevealed: false,
    });
    for (const time of ['16:00', '21:00', '23:00']) {
      app.clock.set(la('2026-12-01', time));
      expect(sendDueReminder(app.ctx)).toBeNull();
    }
    expect(app.notices).toEqual([]);
  });

  it('sends one notification, not two, when the Mac wakes after both times', async () => {
    app = await hatched(la('2026-12-01', '09:00'));
    app.clock.set(la('2026-12-01', '22:15'));
    expect(sendDueReminder(app.ctx)).toBe('evening');
    expect(sendDueReminder(app.ctx)).toBeNull();
    expect(texts()).toEqual(['Para is getting hungry | Today: Two Sum on LeetCode']);
    expect(getPet(app.db).reminderDays).toEqual({ first: '2026-12-01', evening: '2026-12-01' });
  });

  it('does not send again after a restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'paraleet-reminders-'));
    const path = join(dir, 'test.sqlite3');
    try {
      app = await hatched(la('2026-12-01', '12:00'), path);
      app.clock.set(la('2026-12-01', '16:30'));
      expect(sendDueReminder(app.ctx)).toBe('first');
      app.close();
      app = createTestApp({ now: la('2026-12-01', '16:45'), path });
      expect(sendDueReminder(app.ctx)).toBeNull();
      expect(app.notices).toEqual([]);
      app.clock.set(la('2026-12-01', '21:10'));
      expect(sendDueReminder(app.ctx)).toBe('evening');
    } finally {
      // The app is closed by afterEach; removing the folder first is fine on macOS.
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('says any problem feeds Para when nothing is assigned', async () => {
    app = await hatched(la('2026-11-28', '10:00'));
    // Finish the whole starter list in one day. The next day no review is due yet, no plan is
    // active and the starter list is done, so there is nothing to assign.
    const starters = listStarterProblems(app.db);
    expect(starters.length).toBeGreaterThan(20);
    for (const problem of starters) {
      await app.handlers.submitReport({
        problemId: problem.id,
        rating: 'easy',
        minutes: null,
        keyInsight: null,
        notes: null,
        insightRevealed: false,
      });
    }
    app.clock.set(la('2026-11-29', '16:30'));
    expect((await app.handlers.getToday(undefined)).assignment).toBeNull();
    expect(sendDueReminder(app.ctx)).toBe('first');
    expect(texts().at(-1)).toBe('Para is peckish | Any problem you log feeds Para.');
    app.clock.set(la('2026-11-29', '21:30'));
    expect(sendDueReminder(app.ctx)).toBe('evening');
    expect(texts().at(-1)).toBe('Para is getting hungry | Any problem you log feeds Para. Even a small one.');
  });

  it("names a review when one is today's problem", async () => {
    app = await hatched(la('2026-12-01', '10:00'));
    const today = await app.handlers.getToday(undefined);
    const title = today.assignment?.problem.title ?? '';
    await app.handlers.submitReport({
      problemId: today.assignment?.problem.id ?? 0,
      rating: 'again',
      minutes: null,
      keyInsight: null,
      notes: null,
      insightRevealed: false,
    });
    // Rated Again, it comes back the next day as the day's problem.
    app.clock.set(la('2026-12-02', '16:05'));
    expect((await app.handlers.getToday(undefined)).assignment).toMatchObject({ reason: 'review', problem: { title } });
    expect(sendDueReminder(app.ctx)).toBe('first');
    expect(texts().at(-1)).toBe(`Para is peckish | Today: ${title} on LeetCode`);
  });

  it("still sends a reminder when today's problem cannot be read", async () => {
    app = await hatched(la('2026-12-01', '12:00'));
    app.clock.set(la('2026-12-01', '16:10'));
    // Break the read of Today: the reminder falls back to the any-problem text.
    app.db.exec('ALTER TABLE daily_assignments RENAME TO daily_assignments_gone');
    expect(sendDueReminder(app.ctx)).toBe('first');
    expect(texts()).toEqual(['Para is peckish | Any problem you log feeds Para.']);
    app.db.exec('ALTER TABLE daily_assignments_gone RENAME TO daily_assignments');
  });

  it('does not nag on the day Para hatches for reminder times that had already passed', async () => {
    // Hatched at 22:00: both times are behind us. No reminder tonight; the first one comes tomorrow.
    app = await hatched(la('2026-12-01', '22:00'));
    expect(sendDueReminder(app.ctx)).toBeNull();
    app.clock.set(la('2026-12-02', '02:00'));
    expect(sendDueReminder(app.ctx)).toBeNull();
    app.clock.set(la('2026-12-02', '16:00'));
    expect(sendDueReminder(app.ctx)).toBe('first');
    app.close();

    // Hatched at 17:00: the first time has passed, the evening one has not.
    app = await hatched(la('2026-12-01', '17:00'));
    expect(sendDueReminder(app.ctx)).toBeNull();
    app.clock.set(la('2026-12-01', '21:00'));
    expect(sendDueReminder(app.ctx)).toBe('evening');
    app.close();

    // Hatched in the morning: both come as usual.
    app = await hatched(la('2026-12-01', '09:00'));
    app.clock.set(la('2026-12-01', '16:00'));
    expect(sendDueReminder(app.ctx)).toBe('first');
  });

  it('follows the reminder times in Settings', async () => {
    app = await hatched(la('2026-12-01', '09:00'));
    await app.handlers.updateSettings({ firstReminderTime: '08:30' });
    expect(sendDueReminder(app.ctx)).toBe('first');
  });

  it('sends nothing before Para has hatched', async () => {
    app = createTestApp({ now: la('2026-12-01', '22:00') });
    await app.handlers.getToday(undefined);
    expect(sendDueReminder(app.ctx)).toBeNull();
    expect(app.notices).toEqual([]);
  });

  it('opens the compact card when the notification is clicked', async () => {
    app = await hatched(la('2026-12-01', '12:00'));
    app.clock.set(la('2026-12-01', '16:10'));
    sendDueReminder(app.ctx);
    app.notices[0]?.onClick();
    expect(app.windowCalls).toContain('openCard');
  });

  it('records the reminder before showing it, so a failure to show never repeats it', async () => {
    app = await hatched(la('2026-12-01', '12:00'));
    app.clock.set(la('2026-12-01', '16:10'));
    app.ctx.notify = () => {
      throw new Error('the system refused');
    };
    expect(() => sendDueReminder(app.ctx)).toThrow('the system refused');
    expect(getPet(app.db).reminderDays.first).toBe('2026-12-01');
    app.ctx.notify = (notice) => app.notices.push(notice);
    expect(sendDueReminder(app.ctx)).toBeNull();
  });
});
