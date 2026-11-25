// The two daily reminders, through the service: what is sent, when, and that a restart or a
// second tick never sends one twice.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getPet } from '../../data/repos/pet';
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
    app = await hatched(la('2026-12-01', '16:05'));
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
      app = await hatched(la('2026-12-01', '16:30'), path);
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
    app = await hatched(la('2026-12-01', '10:00'));
    // Finish the whole starter list on earlier days so nothing is left to assign.
    const problems = await app.handlers.searchProblems({ query: '', limit: 50 });
    app.clock.set(la('2026-11-28', '10:00'));
    for (const problem of problems) {
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
    const today = await app.handlers.getToday(undefined);
    if (today.assignment === null) {
      expect(sendDueReminder(app.ctx)).toBe('first');
      expect(texts().at(-1)).toBe('Para is peckish | Any problem you log feeds Para.');
    } else {
      // A review came due instead: the reminder names it.
      expect(sendDueReminder(app.ctx)).toBe('first');
      expect(texts().at(-1)).toContain(today.assignment.problem.title);
    }
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
    app = await hatched(la('2026-12-01', '16:10'));
    sendDueReminder(app.ctx);
    app.notices[0]?.onClick();
    expect(app.windowCalls).toContain('openCard');
  });

  it('records the reminder before showing it, so a failure to show never repeats it', async () => {
    app = await hatched(la('2026-12-01', '16:10'));
    app.ctx.notify = () => {
      throw new Error('the system refused');
    };
    expect(() => sendDueReminder(app.ctx)).toThrow('the system refused');
    expect(getPet(app.db).reminderDays.first).toBe('2026-12-01');
    app.ctx.notify = (notice) => app.notices.push(notice);
    expect(sendDueReminder(app.ctx)).toBeNull();
  });
});
