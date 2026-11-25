import { describe, expect, it } from 'vitest';
import starterSeed from '../../seed/starter.json';
import { TOPIC_IDS } from '../core/topics';
import { Db } from './db';
import { migrate } from './migrate';
import { insertAttempt } from './repos/attempts';
import { getProblemByPlatformId, insertProblem, listStarterProblems, listStarterQueue } from './repos/problems';
import { loadStarterSeed } from './seed';
import { starterSeedSchema, validateSeedProblems, type SeedProblem } from './seedFormat';

const NOW = '2026-11-25T20:00:00.000Z';

function freshDb(): Db {
  const db = new Db(':memory:');
  migrate(db);
  return db;
}

describe('seed/starter.json', () => {
  const seed = starterSeedSchema.parse(starterSeed);

  it('has about 30 problems, all easy or medium', () => {
    expect(seed.problems.length).toBeGreaterThanOrEqual(25);
    expect(seed.problems.length).toBeLessThanOrEqual(40);
    for (const problem of seed.problems) expect(['Easy', 'Medium']).toContain(problem.difficultyRaw);
  });

  it('has well-formed, unique IDs and canonical links', () => {
    expect(validateSeedProblems(seed.problems)).toEqual([]);
  });

  it('gives every problem at least one known topic', () => {
    for (const problem of seed.problems) {
      expect(problem.topics.length).toBeGreaterThan(0);
      for (const topic of problem.topics) expect(TOPIC_IDS).toContain(topic);
    }
  });

  it('stores metadata and links only, never a statement', () => {
    for (const problem of seed.problems) {
      expect(Object.keys(problem).sort()).toEqual(
        ['difficultyNorm', 'difficultyRaw', 'displayId', 'platform', 'platformId', 'sourceTags', 'title', 'topics', 'url'].sort(),
      );
    }
  });
});

describe('validateSeedProblems', () => {
  const good: SeedProblem = {
    platform: 'leetcode',
    platformId: 'two-sum',
    displayId: '1',
    title: 'Two Sum',
    url: 'https://leetcode.com/problems/two-sum/',
    difficultyRaw: 'Easy',
    difficultyNorm: 1,
    topics: ['arrays-hashing'],
    sourceTags: ['Array'],
  };

  it('accepts a good list', () => {
    expect(validateSeedProblems([good])).toEqual([]);
  });

  it('reports duplicates, malformed IDs, wrong links and wrong difficulty', () => {
    expect(validateSeedProblems([good, good]).join('\n')).toMatch(/duplicate ID/);
    expect(validateSeedProblems([{ ...good, platformId: 'Two Sum' }]).join('\n')).toMatch(/malformed ID/);
    expect(validateSeedProblems([{ ...good, url: 'https://leetcode.com/problems/two-sum' }]).join('\n')).toMatch(
      /not the canonical/,
    );
    expect(validateSeedProblems([{ ...good, difficultyNorm: 3 }]).join('\n')).toMatch(/normalized difficulty/);
  });

  it('reports a link the app would identify differently', () => {
    const other: SeedProblem = {
      ...good,
      platform: 'other',
      platformId: 'https://leetcode.com/problems/two-sum',
      url: 'https://leetcode.com/problems/two-sum',
      difficultyNorm: 1,
    };
    expect(validateSeedProblems([other]).join('\n')).toMatch(/would not recognize this link as other/);
  });

  it('accepts well-formed CSES, Codeforces and other links', () => {
    const base = { displayId: null, difficultyRaw: null, difficultyNorm: null, topics: [], sourceTags: [] };
    expect(
      validateSeedProblems([
        { ...base, platform: 'cses', platformId: '1068', title: 'Weird Algorithm', url: 'https://cses.fi/problemset/task/1068' },
        {
          ...base,
          platform: 'codeforces',
          platformId: '1352C',
          title: 'K-th Not Divisible by n',
          url: 'https://codeforces.com/problemset/problem/1352/C',
          difficultyRaw: '1200',
          difficultyNorm: 2,
        },
        {
          ...base,
          platform: 'other',
          platformId: 'https://atcoder.jp/contests/abc300/tasks/abc300_a',
          title: 'N-choice question',
          url: 'https://atcoder.jp/contests/abc300/tasks/abc300_a',
        },
      ]),
    ).toEqual([]);
  });
});

describe('loadStarterSeed', () => {
  it('loads the list in order', () => {
    const db = freshDb();
    expect(loadStarterSeed(db, starterSeed, NOW).loaded).toBe(starterSeed.problems.length);
    const starters = listStarterProblems(db);
    expect(starters.map((problem) => problem.platformId)).toEqual(starterSeed.problems.map((problem) => problem.platformId));
    expect(starters[0]).toMatchObject({ title: 'Two Sum', origin: 'seed', starterPosition: 0, displayId: '1' });
    db.close();
  });

  it('is safe to run again and keeps IDs, so attempts stay attached', () => {
    const db = freshDb();
    loadStarterSeed(db, starterSeed, NOW);
    const before = listStarterProblems(db).map((problem) => problem.id);
    const first = before[0] ?? 0;
    insertAttempt(db, {
      problemId: first,
      attemptedAt: NOW,
      paraDay: '2026-11-25',
      rating: 'good',
      minutes: null,
      kind: 'first_solve',
      verification: 'self_report',
      insightRevealed: false,
      patternTags: [],
      notes: null,
    });

    loadStarterSeed(db, starterSeed, NOW);
    expect(listStarterProblems(db).map((problem) => problem.id)).toEqual(before);
    expect(listStarterQueue(db)).toEqual(before.slice(1));
    db.close();
  });

  it('never overwrites a problem the user added by hand', () => {
    const db = freshDb();
    insertProblem(
      db,
      {
        platform: 'leetcode',
        platformId: 'two-sum',
        displayId: null,
        title: 'My Two Sum',
        url: 'https://leetcode.com/problems/two-sum/',
        difficultyRaw: null,
        difficultyNorm: null,
        topics: [],
        sourceTags: [],
        origin: 'user',
      },
      NOW,
    );
    loadStarterSeed(db, starterSeed, NOW);
    expect(getProblemByPlatformId(db, 'leetcode', 'two-sum')).toMatchObject({
      title: 'My Two Sum',
      origin: 'user',
      starterPosition: 0,
    });
    db.close();
  });

  it('drops problems that left the list from the starter order', () => {
    const db = freshDb();
    loadStarterSeed(db, starterSeed, NOW);
    const shorter = { ...starterSeed, problems: starterSeed.problems.slice(1) };
    loadStarterSeed(db, shorter, NOW);
    expect(getProblemByPlatformId(db, 'leetcode', 'two-sum')?.starterPosition).toBeNull();
    expect(listStarterProblems(db)).toHaveLength(shorter.problems.length);
    db.close();
  });

  it('refuses an invalid seed and changes nothing', () => {
    const db = freshDb();
    const bad = { ...starterSeed, problems: [starterSeed.problems[0], starterSeed.problems[0]] };
    expect(() => loadStarterSeed(db, bad, NOW)).toThrow(/duplicate/);
    expect(listStarterProblems(db)).toEqual([]);
    db.close();
  });
});
