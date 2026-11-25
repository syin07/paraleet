import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { recomputePetFacts } from '../../core/petFacts';
import { listAttemptFacts } from '../../data/repos/attempts';
import { getPet } from '../../data/repos/pet';
import { createDayWatcher } from './index';
import { createTestApp, noonLA, type TestApp } from './testing';

let app: TestApp;
afterEach(() => app?.close());

const report = (problemId: number, rating: 'again' | 'hard' | 'good' | 'easy' = 'good') => ({
  problemId,
  rating,
  minutes: null,
  keyInsight: null,
  notes: null,
  insightRevealed: false,
});

describe('the thin path: assign, report, persist', () => {
  it('assigns the first starter problem on a fresh install', async () => {
    app = createTestApp();
    const today = await app.handlers.getToday(undefined);
    expect(today.today).toBe('2026-11-25');
    expect(today.fed).toBe(false);
    expect(today.assignment).toMatchObject({ reason: 'starter', completed: false, problem: { title: 'Two Sum' } });
    expect(today.streak.current).toBe(0);
    expect(today.pet.stage).toBe('egg');
  });

  it('keeps the same assignment for the whole day', async () => {
    app = createTestApp();
    const first = await app.handlers.getToday(undefined);
    app.clock.set('2026-11-26T09:00:00.000Z'); // 01:00 the next calendar day: still the same ParaLeet day
    const later = await app.handlers.getToday(undefined);
    expect(later.today).toBe('2026-11-25');
    expect(later.assignment?.problem.id).toBe(first.assignment?.problem.id);
  });

  it('opens the stored link, never one from the UI', async () => {
    app = createTestApp();
    const today = await app.handlers.getToday(undefined);
    const id = today.assignment?.problem.id ?? 0;
    expect(await app.handlers.openProblem({ problemId: id })).toEqual({ opened: true });
    expect(app.openedUrls).toEqual(['https://leetcode.com/problems/two-sum/']);
    expect(await app.handlers.openProblem({ problemId: 99999 })).toEqual({ opened: false });
  });

  it('opens the saved solution link only when it is a web link', async () => {
    app = createTestApp();
    const id = (await app.handlers.getToday(undefined)).assignment?.problem.id ?? 0;
    expect(await app.handlers.openSolutionLink({ problemId: id })).toEqual({ opened: false });

    const notes = { problemId: id, keyInsight: null, patternTags: [], notes: null };
    await app.handlers.saveProblemNotes({ ...notes, solutionUrl: 'file:///etc/passwd' });
    expect(await app.handlers.openSolutionLink({ problemId: id })).toEqual({ opened: false });

    await app.handlers.saveProblemNotes({ ...notes, solutionUrl: 'https://github.com/me/solutions/two-sum.py' });
    expect(await app.handlers.openSolutionLink({ problemId: id })).toEqual({ opened: true });
    expect(app.openedUrls).toEqual(['https://github.com/me/solutions/two-sum.py']);
  });

  it('records an attempt, feeds the pet and starts the streak', async () => {
    app = createTestApp();
    const today = await app.handlers.getToday(undefined);
    const id = today.assignment?.problem.id ?? 0;

    const result = await app.handlers.submitReport({ ...report(id), minutes: 12, keyInsight: 'Hash map of complements' });
    expect(result.meal).toBe('full');
    expect(result.streak).toEqual({ current: 1, longest: 1, increased: true });
    expect(result.today.fed).toBe(true);
    expect(result.today.assignment?.completed).toBe(true);
    expect(result.today.attemptsToday).toBe(1);
    expect(app.changes()).toBeGreaterThan(0);

    const detail = await app.handlers.getProblemDetail({ problemId: id });
    expect(detail.attempts).toHaveLength(1);
    expect(detail.attempts[0]).toMatchObject({ rating: 'good', minutes: 12, kind: 'first_solve', paraDay: '2026-11-25' });
    expect(detail.notes.keyInsight).toBe('Hash map of complements');

    const logged = await app.handlers.listLoggedProblems(undefined);
    expect(logged.map((row) => row.problem.title)).toEqual(['Two Sum']);
    expect(logged[0]?.lastAttemptDay).toBe('2026-11-25');
  });

  it('gives a crumb for Again: fed and streak kept, but no growth', async () => {
    app = createTestApp();
    const id = (await app.handlers.getToday(undefined)).assignment?.problem.id ?? 0;
    const result = await app.handlers.submitReport(report(id, 'again'));
    expect(result.meal).toBe('crumb');
    expect(result.today.fed).toBe(true);
    expect(result.streak.current).toBe(1);
    expect(result.growth.growthSolves).toBe(0);
  });

  it('caps the rating at Hard when the insight was revealed first', async () => {
    app = createTestApp();
    const id = (await app.handlers.getToday(undefined)).assignment?.problem.id ?? 0;
    const result = await app.handlers.submitReport({ ...report(id, 'easy'), insightRevealed: true });
    expect(result.rating).toBe('hard');
  });

  it('moves on to the next starter problem the next day and extends the streak', async () => {
    app = createTestApp();
    const first = (await app.handlers.getToday(undefined)).assignment?.problem.id ?? 0;
    await app.handlers.submitReport(report(first));

    app.clock.set(noonLA('2026-11-26'));
    const tomorrow = await app.handlers.getToday(undefined);
    expect(tomorrow.fed).toBe(false);
    expect(tomorrow.streak.current).toBe(1); // yesterday's streak is still alive
    expect(tomorrow.assignment?.problem.title).toBe('Valid Anagram');

    const result = await app.handlers.submitReport(report(tomorrow.assignment?.problem.id ?? 0));
    expect(result.streak).toEqual({ current: 2, longest: 2, increased: true });
  });

  it('shows a streak of 0 after a missed day, and 1 after the next solve', async () => {
    app = createTestApp();
    const first = (await app.handlers.getToday(undefined)).assignment?.problem.id ?? 0;
    await app.handlers.submitReport(report(first));

    app.clock.set(noonLA('2026-11-28'));
    const later = await app.handlers.getToday(undefined);
    expect(later.streak).toMatchObject({ current: 0, longest: 1 });

    const result = await app.handlers.submitReport(report(later.assignment?.problem.id ?? 0));
    expect(result.streak).toEqual({ current: 1, longest: 1, increased: true });
  });

  it('feeds the pet for any logged problem, not only the assigned one', async () => {
    app = createTestApp();
    const today = await app.handlers.getToday(undefined);
    const [other] = await app.handlers.searchProblems({ query: 'Coin Change', limit: 5 });
    expect(other).toBeDefined();
    const result = await app.handlers.submitReport(report(other?.id ?? 0));
    expect(result.today.fed).toBe(true);
    expect(result.today.assignment?.completed).toBe(false);
    expect(result.today.assignment?.problem.id).toBe(today.assignment?.problem.id);
  });

  it('keeps the stored pet facts equal to the facts recomputed from attempts', async () => {
    app = createTestApp();
    const ratings = ['good', 'again', 'easy', 'hard', 'good'] as const;
    for (const [index, rating] of ratings.entries()) {
      app.clock.set(noonLA(`2026-11-${25 + (index === 3 ? 5 : index)}`));
      const today = await app.handlers.getToday(undefined);
      await app.handlers.submitReport(report(today.assignment?.problem.id ?? 0, rating));
    }
    const pet = getPet(app.db);
    expect({
      growthSolves: pet.growthSolves,
      totalAttempts: pet.totalAttempts,
      currentStreak: pet.currentStreak,
      longestStreak: pet.longestStreak,
      lastFedDay: pet.lastFedDay,
    }).toEqual(recomputePetFacts(listAttemptFacts(app.db)));
  });

  it('rejects a report for a problem that does not exist', async () => {
    app = createTestApp();
    await expect(app.handlers.submitReport(report(99999))).rejects.toThrow(/does not exist/);
  });
});

describe('persistence', () => {
  it('keeps attempts, the streak and the assignment across a restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'paraleet-test-'));
    const path = join(dir, 'paraleet.sqlite3');
    try {
      app = createTestApp({ path });
      const id = (await app.handlers.getToday(undefined)).assignment?.problem.id ?? 0;
      await app.handlers.submitReport(report(id));
      const seed = (await app.handlers.getToday(undefined)).pet.seed;
      app.close();

      app = createTestApp({ path });
      const today = await app.handlers.getToday(undefined);
      expect(today.fed).toBe(true);
      expect(today.streak.current).toBe(1);
      expect(today.assignment).toMatchObject({ completed: true, problem: { id } });
      expect(today.pet).toMatchObject({ seed, totalAttempts: 1 });
      expect(await app.handlers.listLoggedProblems(undefined)).toHaveLength(1);
    } finally {
      app.close();
      rmSync(dir, { recursive: true, force: true });
      app = createTestApp();
    }
  });
});

describe('settings', () => {
  it('start at the defaults and save only what changed', async () => {
    app = createTestApp();
    expect(await app.handlers.getSettings(undefined)).toMatchObject({ dayBoundaryHour: 4, targetRetention: 0.85 });
    const updated = await app.handlers.updateSettings({ dayBoundaryHour: 6 });
    expect(updated).toMatchObject({ dayBoundaryHour: 6, firstReminderTime: '16:00', leetcodeHandle: '' });
  });

  it('use the day boundary setting for the current day', async () => {
    app = createTestApp({ now: '2026-11-26T13:00:00.000Z' }); // 05:00 in Los Angeles
    expect((await app.handlers.getToday(undefined)).today).toBe('2026-11-26');
    await app.handlers.updateSettings({ dayBoundaryHour: 6 });
    expect((await app.handlers.getToday(undefined)).today).toBe('2026-11-25');
  });
});

describe('adding and finding problems', () => {
  it('recognizes a LeetCode link the app already knows', async () => {
    app = createTestApp();
    const parsed = await app.handlers.parseProblemUrl({ url: 'https://leetcode.com/problems/two-sum/description/' });
    expect(parsed).toMatchObject({ ok: true, platform: 'leetcode', platformId: 'two-sum', alreadyLogged: false });
    expect(parsed.ok && parsed.known?.title).toBe('Two Sum');
  });

  it('adds a new problem once and returns the existing one after that', async () => {
    app = createTestApp();
    const input = {
      // Not in the catalog, so this is a new problem the user types in.
      url: 'https://leetcode.com/problems/a-problem-the-catalog-lacks/',
      title: 'A problem the catalog lacks',
      difficultyRaw: 'Hard',
      topics: ['two-pointers' as const],
    };
    const first = await app.handlers.addProblem(input);
    expect(first).toMatchObject({ ok: true, created: true, problem: { difficultyNorm: 5, platformId: 'a-problem-the-catalog-lacks' } });
    const second = await app.handlers.addProblem(input);
    expect(second).toMatchObject({ ok: true, created: false });
    expect(first.ok && second.ok && first.problem.id === second.problem.id).toBe(true);
  });

  it('recognizes CSES, Codeforces and other sites, and normalizes their difficulty', async () => {
    app = createTestApp();
    // 2172E is rated but below the catalog's solved-count floor, so it is not in the catalog.
    const cf = await app.handlers.parseProblemUrl({ url: 'codeforces.com/contest/2172/problem/e' });
    expect(cf).toMatchObject({
      ok: true,
      platform: 'codeforces',
      platformId: '2172E',
      canonicalUrl: 'https://codeforces.com/problemset/problem/2172/E',
      known: null,
    });
    const added = await app.handlers.addProblem({
      url: 'https://codeforces.com/contest/2172/problem/E',
      title: 'Number Maze',
      difficultyRaw: '1200',
      topics: ['math', 'binary-search'],
    });
    expect(added).toMatchObject({ ok: true, created: true, problem: { platform: 'codeforces', difficultyNorm: 2 } });
    // A different spelling of the same link is the same problem.
    const again = await app.handlers.addProblem({
      url: 'https://m1.codeforces.com/problemset/problem/02172/E?locale=en',
      title: 'Something else',
      difficultyRaw: null,
      topics: [],
    });
    expect(again).toMatchObject({ ok: true, created: false });

    const cses = await app.handlers.addProblem({
      url: 'https://cses.fi/problemset/task/99999999/',
      title: 'A task the catalog lacks',
      difficultyRaw: null,
      topics: ['implementation'],
    });
    expect(cses).toMatchObject({ ok: true, created: true, problem: { platform: 'cses', platformId: '99999999', difficultyNorm: null } });

    const other = await app.handlers.addProblem({
      url: 'https://atcoder.jp/contests/abc300/tasks/abc300_a/?utm_source=x',
      title: 'N-choice question',
      difficultyRaw: 'Easy',
      topics: [],
    });
    expect(other).toMatchObject({
      ok: true,
      problem: { platform: 'other', url: 'https://atcoder.jp/contests/abc300/tasks/abc300_a', difficultyNorm: 1 },
    });
  });

  it('knows catalog problems on every platform: parse returns them and adding creates nothing', async () => {
    app = createTestApp();
    const links = [
      { url: 'https://leetcode.com/problems/trapping-rain-water/', platform: 'leetcode', platformId: 'trapping-rain-water', title: 'Trapping Rain Water' },
      { url: 'https://cses.fi/problemset/task/1068/', platform: 'cses', platformId: '1068', title: 'Weird Algorithm' },
      { url: 'https://codeforces.com/contest/1352/problem/C', platform: 'codeforces', platformId: '1352C', title: 'K-th Not Divisible by n' },
    ];
    for (const link of links) {
      const parsed = await app.handlers.parseProblemUrl({ url: link.url });
      expect(parsed).toMatchObject({ ok: true, platform: link.platform, platformId: link.platformId });
      expect(parsed.ok && parsed.known?.title).toBe(link.title);
      const added = await app.handlers.addProblem({ url: link.url, title: 'Typed title', difficultyRaw: null, topics: [] });
      expect(added).toMatchObject({ ok: true, created: false, problem: { platformId: link.platformId, title: link.title } });
    }
  });

  it('refuses a platform page that is not a problem, with a reason', async () => {
    app = createTestApp();
    const parsed = await app.handlers.parseProblemUrl({ url: 'https://leetcode.com/problemset/' });
    expect(parsed).toMatchObject({ ok: false });
    expect(!parsed.ok && parsed.reason).toMatch(/LeetCode link, but not a problem page/);
    const added = await app.handlers.addProblem({
      url: 'https://codeforces.com/contest/1352',
      title: 'A contest',
      difficultyRaw: null,
      topics: [],
    });
    expect(added.ok).toBe(false);
  });

  it('stores null, never junk, for difficulty text it does not know', async () => {
    app = createTestApp();
    const added = await app.handlers.addProblem({
      url: 'https://example.com/judge/problem/7',
      title: 'Some problem',
      difficultyRaw: 'constructor',
      topics: [],
    });
    expect(added).toMatchObject({ ok: true, problem: { difficultyRaw: 'constructor', difficultyNorm: null } });
  });

  it('explains why text that is not a link was refused', async () => {
    app = createTestApp();
    expect(await app.handlers.parseProblemUrl({ url: 'two sum' })).toMatchObject({ ok: false });
  });
});

describe('day watcher', () => {
  it('reports a change when the ParaLeet day rolls over, and only then', () => {
    app = createTestApp({ now: '2026-11-26T11:59:00.000Z' }); // 03:59 in Los Angeles
    const watcher = createDayWatcher(app.ctx);
    expect(watcher.check()).toBe(false);
    expect(watcher.check()).toBe(false);
    app.clock.set('2026-11-26T12:00:30.000Z'); // 04:00:30
    const before = app.changes();
    expect(watcher.check()).toBe(true);
    expect(app.changes()).toBe(before + 1);
    expect(watcher.check()).toBe(false);
  });

  it('reports a change when the time zone changes', () => {
    app = createTestApp();
    const watcher = createDayWatcher(app.ctx);
    watcher.check();
    app.clock.setTimeZone('Asia/Tokyo');
    expect(watcher.check()).toBe(true);
  });
});
