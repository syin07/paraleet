// Para as the screens see it: mood and line through a day, the "missed you" greeting, the
// celebration after a report, and accessories unlocked by reporting.
import { afterEach, describe, expect, it } from 'vitest';
import { replayUnlocks } from '../../core/accessories';
import { LINES } from '../../core/petLines';
import { CHECKING_MS, EATING_MS, NIBBLING_MS } from '../../core/pet';
import type { Rating } from '../../core/types';
import { listUnlockAttempts } from '../../data/repos/attempts';
import { getPet, saveUnlockedAccessories } from '../../data/repos/pet';
import { createMoodWatcher, nextCelebrationStep, reconcile } from './index';
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

const mood = async (): Promise<string> => (await app.handlers.getToday(undefined)).pet.mood;

async function report(rating: Rating, problemId?: number) {
  const today = await app.handlers.getToday(undefined);
  const id = problemId ?? today.assignment?.problem.id;
  if (id === undefined) throw new Error('nothing to report');
  return app.handlers.submitReport({
    problemId: id,
    rating,
    minutes: null,
    keyInsight: null,
    notes: null,
    insightRevealed: false,
  });
}

/** Lets the celebration finish, so the mood is the normal one for the time of day. */
function afterCelebration(): void {
  app.clock.set(new Date(app.clock.now().getTime() + CHECKING_MS + EATING_MS + 1000));
}

describe('mood through a day', () => {
  it('sleeps, gets peckish at the first reminder and hungry at the evening one, until fed', async () => {
    app = createTestApp({ now: la('2026-12-01', '09:00') });
    expect(await mood()).toBe('sleeping');
    app.clock.set(la('2026-12-01', '15:59'));
    expect(await mood()).toBe('sleeping');
    app.clock.set(la('2026-12-01', '16:00'));
    expect(await mood()).toBe('peckish');
    app.clock.set(la('2026-12-01', '21:00'));
    expect(await mood()).toBe('hungry');
    // After midnight is still the same ParaLeet day: still hungry.
    app.clock.set(la('2026-12-02', '01:30'));
    expect(await mood()).toBe('hungry');

    await report('good');
    afterCelebration();
    // Fed, and it is the middle of the night.
    expect(await mood()).toBe('sleeping');
  });

  it('is content once fed, and asleep from 23:00', async () => {
    app = createTestApp({ now: la('2026-12-01', '17:00') });
    await report('good');
    afterCelebration();
    expect(await mood()).toBe('content');
    app.clock.set(la('2026-12-01', '23:00'));
    expect(await mood()).toBe('sleeping');
  });

  it('follows the reminder times in Settings', async () => {
    app = createTestApp({ now: la('2026-12-01', '10:00') });
    expect(await mood()).toBe('sleeping');
    await app.handlers.updateSettings({ firstReminderTime: '09:30', eveningReminderTime: '09:45' });
    expect(await mood()).toBe('hungry');
  });
});

describe('what Para says', () => {
  it('gives a line for the mood, the same all day and never the same two days running', async () => {
    app = createTestApp({ now: la('2026-12-01', '17:00') });
    let previous: string | null = null;
    for (let day = 1; day <= 20; day += 1) {
      app.clock.set(la(`2026-12-${String(day).padStart(2, '0')}`, '17:00'));
      const first = (await app.handlers.getToday(undefined)).pet;
      expect(first.mood === 'peckish' || first.mood === 'missed_you').toBe(true);
      expect(first.line).not.toBeNull();
      app.clock.set(la(`2026-12-${String(day).padStart(2, '0')}`, '18:30'));
      expect((await app.handlers.getToday(undefined)).pet.line).toBe(first.line);
      if (first.mood === 'peckish') {
        expect(first.line).not.toBe(previous);
        previous = first.line;
      }
    }
  });

  it('can name today\'s problem and its platform while it is still to do, and never after', async () => {
    app = createTestApp({ now: la('2026-12-01', '17:00') });
    const title = (await app.handlers.getToday(undefined)).assignment?.problem.title ?? '';
    expect(title).not.toBe('');
    let named = 0;
    for (let day = 1; day <= 28; day += 1) {
      app.clock.set(la(`2026-12-${String(day).padStart(2, '0')}`, '17:00'));
      const today = await app.handlers.getToday(undefined);
      if (today.pet.mood === 'missed_you') await app.handlers.acknowledgeGreeting(undefined);
      const line = (await app.handlers.getToday(undefined)).pet.line ?? '';
      const assigned = today.assignment?.problem.title ?? '';
      if (assigned !== '' && line.includes(assigned)) {
        named += 1;
        expect(line).toContain('LeetCode');
      }
    }
    expect(named).toBeGreaterThan(0);

    await report('good');
    afterCelebration();
    const fed = await app.handlers.getToday(undefined);
    expect(fed.pet.mood).toBe('content');
    expect(LINES.content.some((template) => template.includes('{title}'))).toBe(false);
    expect(fed.pet.line).not.toContain(title);
  });
});

describe('the "missed you" greeting', () => {
  it('shows after a missed day until acknowledged, once per absence', async () => {
    app = createTestApp({ now: la('2026-12-01', '17:00') });
    await report('good');
    afterCelebration();

    // The next day: no day was missed, so no greeting.
    app.clock.set(la('2026-12-02', '17:00'));
    expect(await mood()).toBe('peckish');

    // Three days later, a full day and more was missed.
    app.clock.set(la('2026-12-05', '10:00'));
    expect(await mood()).toBe('missed_you');
    const changesBefore = app.changes();
    const after = await app.handlers.acknowledgeGreeting(undefined);
    expect(after.pet.mood).toBe('sleeping');
    expect(app.changes()).toBe(changesBefore + 1);

    // Still away from the keyboard the next day: the greeting is not repeated.
    app.clock.set(la('2026-12-06', '17:00'));
    expect(await mood()).toBe('peckish');

    // Fed again, then away again: a new absence, a new greeting.
    await report('good');
    afterCelebration();
    app.clock.set(la('2026-12-09', '17:00'));
    expect(await mood()).toBe('missed_you');
  });

  it('goes away by itself once Para is fed, and acknowledging then changes nothing', async () => {
    app = createTestApp({ now: la('2026-12-01', '17:00') });
    await report('good');
    app.clock.set(la('2026-12-05', '17:00'));
    expect(await mood()).toBe('missed_you');
    await report('good');
    afterCelebration();
    expect(await mood()).toBe('content');
    const changes = app.changes();
    await app.handlers.acknowledgeGreeting(undefined);
    expect(app.changes()).toBe(changes);
    expect(getPet(app.db).greetedDay).toBeNull();
  });

  it('greets again when the last greeting was recorded under a clock that was ahead', async () => {
    app = createTestApp({ now: la('2026-12-01', '17:00') });
    await report('good');
    // The clock jumps a year ahead; the greeting is seen and recorded with that date.
    app.clock.set(la('2027-12-05', '17:00'));
    expect(await mood()).toBe('missed_you');
    await app.handlers.acknowledgeGreeting(undefined);
    // The clock is corrected. Days later the user comes back: the old record must not hide the greeting.
    app.clock.set(la('2026-12-06', '17:00'));
    expect(await mood()).toBe('missed_you');
    await app.handlers.acknowledgeGreeting(undefined);
    expect(await mood()).toBe('peckish');
  });

  it('never greets a brand-new install', async () => {
    app = createTestApp({ now: la('2026-12-01', '17:00') });
    expect(await mood()).toBe('peckish');
    app.clock.set(la('2026-12-20', '17:00'));
    expect(await mood()).toBe('peckish');
  });
});

describe('the celebration after a report', () => {
  it('checks for about two seconds, then eats a full meal, then settles', async () => {
    app = createTestApp({ now: la('2026-12-01', '17:00') });
    const start = app.clock.now().getTime();
    const result = await report('good');
    expect(result.meal).toBe('full');
    expect(result.today.pet.mood).toBe('checking');
    expect(nextCelebrationStep(app.ctx)?.getTime()).toBe(start + CHECKING_MS);

    app.clock.set(new Date(start + CHECKING_MS - 1));
    expect(await mood()).toBe('checking');
    app.clock.set(new Date(start + CHECKING_MS));
    expect(await mood()).toBe('eating');
    expect(nextCelebrationStep(app.ctx)?.getTime()).toBe(start + CHECKING_MS + EATING_MS);

    app.clock.set(new Date(start + CHECKING_MS + EATING_MS));
    expect(await mood()).toBe('content');
    expect(nextCelebrationStep(app.ctx)).toBeNull();
    expect(app.ctx.session.celebration).toBeNull();
  });

  it('only nibbles for an attempt rated Again', async () => {
    app = createTestApp({ now: la('2026-12-01', '17:00') });
    const start = app.clock.now().getTime();
    const result = await report('again');
    expect(result.meal).toBe('crumb');
    app.clock.set(new Date(start + CHECKING_MS));
    expect(await mood()).toBe('nibbling');
    app.clock.set(new Date(start + CHECKING_MS + NIBBLING_MS));
    expect(await mood()).toBe('content');
  });

  it('is dropped when the clock moves back before the report', async () => {
    app = createTestApp({ now: la('2026-12-01', '17:00') });
    await report('good');
    app.clock.set(la('2026-12-01', '16:30'));
    expect(nextCelebrationStep(app.ctx)).toBeNull();
    expect(await mood()).not.toBe('checking');
  });

  it('plays over a "missed you" greeting, which does not come back afterwards', async () => {
    app = createTestApp({ now: la('2026-12-01', '17:00') });
    await report('good');
    app.clock.set(la('2026-12-05', '17:00'));
    expect(await mood()).toBe('missed_you');
    const result = await report('hard');
    expect(result.today.pet.mood).toBe('checking');
    afterCelebration();
    expect(await mood()).toBe('content');
  });
});

describe('the mood watcher', () => {
  it('tells the windows when the mood has changed, and only then', async () => {
    app = createTestApp({ now: la('2026-12-01', '15:00') });
    const watcher = createMoodWatcher(app.ctx);
    expect(watcher.check()).toBe(false); // the first look only records
    const changes = app.changes();
    app.clock.set(la('2026-12-01', '15:30'));
    expect(watcher.check()).toBe(false);
    expect(app.changes()).toBe(changes);
    app.clock.set(la('2026-12-01', '16:00'));
    expect(watcher.check()).toBe(true);
    expect(app.changes()).toBe(changes + 1);
    expect(watcher.check()).toBe(false);
    app.clock.set(la('2026-12-01', '21:05'));
    expect(watcher.check()).toBe(true);
    expect(app.changes()).toBe(changes + 2);
  });
});

describe('accessories unlocked by reporting', () => {
  async function hardProblemId(): Promise<number> {
    const added = await app.handlers.addProblem({
      url: 'https://codeforces.com/problemset/problem/1500/D',
      title: 'A Rated Problem',
      difficultyRaw: '2100',
      topics: [],
    });
    if (!added.ok) throw new Error(added.reason);
    expect(added.problem.difficultyNorm).toBeGreaterThanOrEqual(4);
    return added.problem.id;
  }

  it('unlocks the scarf when a Hard problem is solved, not when it is rated Again', async () => {
    app = createTestApp({ now: la('2026-12-01', '17:00') });
    const hard = await hardProblemId();
    const again = await report('again', hard);
    expect(again.unlocked).toEqual([]);
    expect(again.today.pet.unlockedAccessories).toEqual([]);
    const solved = await report('hard', hard);
    expect(solved.unlocked).toEqual(['scarf']);
    expect(solved.today.pet.unlockedAccessories).toEqual(['scarf']);
    // Solving another does not announce it twice.
    expect((await report('good', hard)).unlocked).toEqual([]);
  });

  it('does not unlock the scarf for an easy problem rated Hard', async () => {
    app = createTestApp({ now: la('2026-12-01', '17:00') });
    expect((await report('hard')).unlocked).toEqual([]);
  });

  it('unlocks the bow tie on the seventh day in a row, but not on an attempt rated Again', async () => {
    app = createTestApp({ now: la('2026-12-01', '17:00') });
    for (let day = 1; day <= 6; day += 1) {
      app.clock.set(la(`2026-12-0${day}`, '17:00'));
      expect((await report('good')).unlocked).toEqual([]);
    }
    app.clock.set(la('2026-12-07', '17:00'));
    const again = await report('again');
    expect(again.streak.current).toBe(7);
    expect(again.unlocked).toEqual([]);
    // The next attempt that is not Again picks the milestone up, even later the same day.
    const good = await report('good');
    expect(good.unlocked).toEqual(['bow_tie']);
    expect(getPet(app.db).unlockedAccessories).toEqual(['bow_tie']);
  });

  it('unlocks the crown on the thirtieth day in a row', async () => {
    app = createTestApp({ now: la('2026-12-01', '17:00') });
    for (let day = 1; day <= 29; day += 1) {
      app.clock.set(la(`2026-12-${String(day).padStart(2, '0')}`, '17:00'));
      const result = await report('good');
      expect(result.unlocked).toEqual(day === 7 ? ['bow_tie'] : []);
    }
    app.clock.set(la('2026-12-30', '17:00'));
    const result = await report('easy');
    expect(result.streak.current).toBe(30);
    expect(result.unlocked).toEqual(['crown']);
    expect(getPet(app.db).unlockedAccessories).toEqual(['bow_tie', 'crown']);
  });

  it('keeps unlocks when the streak is lost, and can wear them', async () => {
    app = createTestApp({ now: la('2026-12-01', '17:00') });
    for (let day = 1; day <= 7; day += 1) {
      app.clock.set(la(`2026-12-0${day}`, '17:00'));
      await report('good');
    }
    app.clock.set(la('2026-12-20', '17:00'));
    const today = await app.handlers.getToday(undefined);
    expect(today.streak.current).toBe(0);
    expect(today.pet.unlockedAccessories).toEqual(['bow_tie']);
    const worn = await app.handlers.setEquippedAccessories({ accessories: ['bow_tie'] });
    expect(worn.pet.equippedAccessories).toEqual(['bow_tie']);
  });

  it('stores exactly what replaying the attempts gives, after a mixed month', async () => {
    app = createTestApp({ now: la('2026-12-01', '17:00') });
    const hard = await hardProblemId();
    const ratings: Rating[] = ['good', 'again', 'easy', 'hard', 'again', 'good', 'again'];
    for (let day = 1; day <= 31; day += 1) {
      if (day === 12 || day === 13) continue; // two missed days
      app.clock.set(la(`2026-12-${String(day).padStart(2, '0')}`, '17:00'));
      await report(ratings[day % ratings.length] ?? 'good', day === 20 ? hard : undefined);
      expect(getPet(app.db).unlockedAccessories).toEqual(replayUnlocks(listUnlockAttempts(app.db)));
    }
    expect(getPet(app.db).unlockedAccessories).toEqual(['scarf', 'bow_tie']);
  });

  it('restores at launch an unlock the attempts earned but the database lost, and removes nothing', async () => {
    app = createTestApp({ now: la('2026-12-01', '17:00') });
    for (let day = 1; day <= 7; day += 1) {
      app.clock.set(la(`2026-12-0${day}`, '17:00'));
      await report('good');
    }
    // The bow tie is lost; a crown is stored that the attempts never earned (say, from a later rule).
    saveUnlockedAccessories(app.db, ['crown']);
    expect(reconcile(app.ctx).accessoriesRestored).toEqual(['bow_tie']);
    expect(getPet(app.db).unlockedAccessories).toEqual(['bow_tie', 'crown']);
    expect(reconcile(app.ctx).accessoriesRestored).toEqual([]);
  });
});
