import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import catalogCodeforces from '../../seed/catalog-codeforces.json';
import catalogCses from '../../seed/catalog-cses.json';
import catalogLeetcode from '../../seed/catalog-leetcode.json';
import starterSeed from '../../seed/starter.json';
import { TOPIC_IDS } from '../core/topics';
import type { Platform } from '../core/types';
import { csesAdapter, leetcodeAdapter } from '../platforms';
import { CODEFORCES_WINDOW, compareCodeforces, compareLeetcode } from '../platforms/catalog';
import { Db } from './db';
import { migrate } from './migrate';
import { getCatalogSource } from './repos/catalogSources';
import { insertAttempt } from './repos/attempts';
import { getProblemByPlatformId, insertProblem, listStarterProblems, searchProblems } from './repos/problems';
import { loadCatalogSeed, loadStarterSeed } from './seed';
import {
  catalogProblemSchema,
  catalogSeedSchema,
  validateSeedProblems,
  type CatalogPlatform,
  type CatalogProblem,
} from './seedFormat';

const NOW = '2026-11-25T20:00:00.000Z';
const LATER = '2026-11-26T08:00:00.000Z';
const T1 = '2026-11-20T00:00:00.000Z';
const T2 = '2026-11-24T00:00:00.000Z';

const CATALOGS = { leetcode: catalogLeetcode, cses: catalogCses, codeforces: catalogCodeforces } as const;

function freshDb(): Db {
  const db = new Db(':memory:');
  migrate(db);
  return db;
}

function entry(platformId: string, overrides: Partial<CatalogProblem> = {}): CatalogProblem {
  return {
    platform: 'leetcode',
    platformId,
    displayId: null,
    title: `Problem ${platformId}`,
    url: leetcodeAdapter.buildUrl(platformId),
    difficultyRaw: 'Easy',
    difficultyNorm: 1,
    topics: ['arrays-hashing'],
    sourceTags: ['Array'],
    solvedCount: 100,
    ...overrides,
  };
}

function catalog(problems: CatalogProblem[], generatedAt = T1, platform: CatalogPlatform = 'leetcode'): unknown {
  return { generatedAt, source: 'test', platform, problems };
}

function rowCount(db: Db): number {
  return db.get<{ n: number }>('SELECT COUNT(*) AS n FROM problems')?.n ?? 0;
}

describe('checked-in catalog files', () => {
  for (const platform of ['leetcode', 'cses', 'codeforces'] as const) {
    describe(`seed/catalog-${platform}.json`, () => {
      const seed = catalogSeedSchema.parse(CATALOGS[platform]);

      it('parses, with every problem on the file platform and no field outside the schema', () => {
        expect(seed.platform).toBe(platform);
        const text = readFileSync(resolve(import.meta.dirname, `../../seed/catalog-${platform}.json`), 'utf8');
        const raw = JSON.parse(text) as { problems: Record<string, unknown>[] } & Record<string, unknown>;
        expect(Object.keys(raw).sort()).toEqual(['generatedAt', 'platform', 'problems', 'source']);
        const allowed = Object.keys(catalogProblemSchema.shape).sort();
        for (const problem of raw.problems) expect(Object.keys(problem).sort()).toEqual(allowed);
      });

      it('has well-formed, unique IDs and canonical, unique links the app recognizes', () => {
        expect(validateSeedProblems(seed.problems)).toEqual([]);
      });

      it('uses only known topics and keeps the platform tags', () => {
        for (const problem of seed.problems) {
          for (const topic of problem.topics) expect(TOPIC_IDS).toContain(topic);
          expect(problem.title.length).toBeLessThan(200);
        }
        // A few problems have no tags at all on the platform; nearly all do.
        const tagged = seed.problems.filter((problem) => problem.sourceTags.length > 0).length;
        expect(tagged / seed.problems.length).toBeGreaterThan(0.9);
      });
    });
  }

  it('LeetCode has well over a thousand problems, in numeric order, none paid-only', () => {
    const { problems } = catalogSeedSchema.parse(catalogLeetcode);
    expect(problems.length).toBeGreaterThan(1000);
    for (let i = 1; i < problems.length; i++) {
      expect(compareLeetcode(problems[i - 1]!, problems[i]!)).toBeLessThan(0);
    }
    for (const problem of problems) {
      expect(problem.displayId).toMatch(/^[1-9]\d*$/);
      expect(['Easy', 'Medium', 'Hard']).toContain(problem.difficultyRaw);
    }
    // The starter list is made of free problems, so all of it must be in the catalog.
    const slugs = new Set(problems.map((problem) => problem.platformId));
    for (const starter of starterSeed.problems) expect(slugs.has(starter.platformId)).toBe(true);
  });

  it('every one of the app topics has LeetCode problems', () => {
    const { problems } = catalogSeedSchema.parse(catalogLeetcode);
    const covered = new Set(problems.flatMap((problem) => problem.topics));
    expect([...TOPIC_IDS].filter((topic) => !covered.has(topic))).toEqual([]);
  });

  it('CSES has a few hundred tasks in listing order, each with its section as a source tag and no difficulty', () => {
    const { problems } = catalogSeedSchema.parse(catalogCses);
    expect(problems.length).toBeGreaterThanOrEqual(300);
    for (const problem of problems) {
      expect(problem.sourceTags).toHaveLength(1);
      expect(problem.difficultyRaw).toBeNull();
      expect(problem.difficultyNorm).toBeNull();
    }
    // Listing order: a section is never split, and the first task is the one CSES lists first.
    const sections = problems.map((problem) => problem.sourceTags[0]);
    const runs = sections.filter((section, index) => section !== sections[index - 1]);
    expect(new Set(runs).size).toBe(runs.length);
    expect(problems[0]?.platformId).toBe('1068');
  });

  it('Codeforces is inside the 3,000 to 4,500 window, all rated, ordered by contest then index', () => {
    const { problems } = catalogSeedSchema.parse(catalogCodeforces);
    expect(problems.length).toBeGreaterThanOrEqual(CODEFORCES_WINDOW.min);
    expect(problems.length).toBeLessThanOrEqual(CODEFORCES_WINDOW.max);
    for (let i = 0; i < problems.length; i++) {
      const problem = problems[i]!;
      expect(problem.difficultyRaw).toMatch(/^\d+$/);
      expect(problem.difficultyNorm).not.toBeNull();
      expect(problem.solvedCount).not.toBeNull();
      if (i > 0) expect(compareCodeforces(problems[i - 1]!, problem)).toBeLessThan(0);
    }
  });
});

describe('loadCatalogSeed', () => {
  it('loads a file into an empty database as seed rows and records the source', () => {
    const db = freshDb();
    const result = loadCatalogSeed(db, catalog([entry('a', { displayId: '1' }), entry('b')]), NOW);
    expect(result).toEqual({ platform: 'leetcode', status: 'loaded', problems: 2 });
    expect(rowCount(db)).toBe(2);
    const row = db.get<{ origin: string; solved_count: number; starter_position: number | null; created_at: string }>(
      "SELECT origin, solved_count, starter_position, created_at FROM problems WHERE platform_id = 'a'",
    );
    expect(row).toEqual({ origin: 'seed', solved_count: 100, starter_position: null, created_at: NOW });
    expect(getCatalogSource(db, 'leetcode')).toEqual({
      platform: 'leetcode',
      source: 'test',
      generatedAt: T1,
      problemCount: 2,
      loadedAt: NOW,
    });
  });

  it('does nothing the second time: same rows, loaded_at unchanged', () => {
    const db = freshDb();
    const seed = catalog([entry('a'), entry('b')]);
    loadCatalogSeed(db, seed, NOW);
    const before = db.all('SELECT * FROM problems ORDER BY id');
    expect(loadCatalogSeed(db, seed, LATER)).toEqual({ platform: 'leetcode', status: 'up-to-date' });
    expect(db.all('SELECT * FROM problems ORDER BY id')).toEqual(before);
    expect(getCatalogSource(db, 'leetcode')?.loadedAt).toBe(NOW);
  });

  it('does not load an older file over a newer one', () => {
    const db = freshDb();
    loadCatalogSeed(db, catalog([entry('a', { title: 'New' })], T2), NOW);
    expect(loadCatalogSeed(db, catalog([entry('a', { title: 'Old' })], T1), LATER).status).toBe('up-to-date');
    expect(getProblemByPlatformId(db, 'leetcode', 'a')?.title).toBe('New');
  });

  it('a newer file updates a seed row, adds new problems and keeps one that was dropped', () => {
    const db = freshDb();
    loadCatalogSeed(db, catalog([entry('a', { title: 'Old title' }), entry('gone')], T1), NOW);
    const id = getProblemByPlatformId(db, 'leetcode', 'a')!.id;
    const result = loadCatalogSeed(
      db,
      catalog([entry('a', { title: 'New title', difficultyRaw: 'Hard', difficultyNorm: 5, solvedCount: 7 }), entry('c')], T2),
      LATER,
    );
    expect(result.status).toBe('loaded');
    const updated = getProblemByPlatformId(db, 'leetcode', 'a');
    expect(updated).toMatchObject({ id, title: 'New title', difficultyRaw: 'Hard', difficultyNorm: 5, origin: 'seed' });
    expect(db.get('SELECT solved_count FROM problems WHERE id = ?', [id])).toEqual({ solved_count: 7 });
    expect(getProblemByPlatformId(db, 'leetcode', 'c')).not.toBeNull();
    expect(getProblemByPlatformId(db, 'leetcode', 'gone')).not.toBeNull();
    expect(getCatalogSource(db, 'leetcode')).toMatchObject({ generatedAt: T2, loadedAt: LATER, problemCount: 2 });
  });

  it('keeps what the user typed on a hand-added problem and fills only what is empty', () => {
    const db = freshDb();
    const mine = insertProblem(
      db,
      {
        platform: 'leetcode',
        platformId: 'a',
        displayId: null,
        title: 'My own title',
        url: leetcodeAdapter.buildUrl('a'),
        difficultyRaw: null,
        difficultyNorm: null,
        topics: [],
        sourceTags: ['mine'],
        origin: 'user',
      },
      T1,
    );
    loadCatalogSeed(db, catalog([entry('a', { displayId: '9', title: 'Catalog title', difficultyRaw: 'Medium', difficultyNorm: 3, topics: ['math'], sourceTags: ['Math'], solvedCount: 55 })]), NOW);
    const after = getProblemByPlatformId(db, 'leetcode', 'a');
    expect(after).toMatchObject({
      id: mine.id,
      origin: 'user',
      title: 'My own title',
      displayId: '9',
      difficultyRaw: 'Medium',
      difficultyNorm: 3,
      topics: ['math'],
      sourceTags: ['mine'],
    });
    expect(db.get('SELECT solved_count, created_at FROM problems WHERE id = ?', [mine.id])).toEqual({
      solved_count: 55,
      created_at: T1,
    });
  });

  it('does not overwrite a difficulty or topics the user already gave', () => {
    const db = freshDb();
    insertProblem(
      db,
      {
        platform: 'leetcode',
        platformId: 'a',
        displayId: '3',
        title: 'Mine',
        url: leetcodeAdapter.buildUrl('a'),
        difficultyRaw: 'Hard',
        difficultyNorm: 5,
        topics: ['greedy'],
        sourceTags: [],
        origin: 'user',
      },
      T1,
    );
    loadCatalogSeed(db, catalog([entry('a', { displayId: '9' })]), NOW);
    expect(getProblemByPlatformId(db, 'leetcode', 'a')).toMatchObject({
      displayId: '3',
      difficultyRaw: 'Hard',
      difficultyNorm: 5,
      topics: ['greedy'],
      sourceTags: ['Array'],
    });
  });

  it('keeps a problem with attempts on the same ID with its attempts', () => {
    const db = freshDb();
    loadCatalogSeed(db, catalog([entry('a')], T1), NOW);
    const id = getProblemByPlatformId(db, 'leetcode', 'a')!.id;
    insertAttempt(db, {
      problemId: id,
      attemptedAt: NOW,
      paraDay: '2026-11-25',
      rating: 'good',
      minutes: 10,
      kind: 'first_solve',
      verification: 'self_report',
      insightRevealed: false,
      patternTags: [],
      notes: null,
    });
    loadCatalogSeed(db, catalog([entry('a', { title: 'Renamed' })], T2), LATER);
    expect(getProblemByPlatformId(db, 'leetcode', 'a')).toMatchObject({ id, title: 'Renamed' });
    expect(db.get('SELECT COUNT(*) AS n FROM attempts WHERE problem_id = ?', [id])).toEqual({ n: 1 });
  });

  it('keeps starter positions and IDs whichever file loads first', () => {
    const slugs = starterSeed.problems.map((problem) => problem.platformId);
    const positions = (db: Db): [string, number | null][] =>
      listStarterProblems(db).map((problem) => [problem.platformId, problem.starterPosition]);

    const starterFirst = freshDb();
    loadStarterSeed(starterFirst, starterSeed, NOW);
    const ids = new Map(slugs.map((slug) => [slug, getProblemByPlatformId(starterFirst, 'leetcode', slug)!.id]));
    const expected = positions(starterFirst);
    loadCatalogSeed(starterFirst, catalogLeetcode, LATER);
    expect(positions(starterFirst)).toEqual(expected);
    for (const slug of slugs) expect(getProblemByPlatformId(starterFirst, 'leetcode', slug)?.id).toBe(ids.get(slug));

    const catalogFirst = freshDb();
    loadCatalogSeed(catalogFirst, catalogLeetcode, NOW);
    const catalogIds = new Map(slugs.map((slug) => [slug, getProblemByPlatformId(catalogFirst, 'leetcode', slug)!.id]));
    loadStarterSeed(catalogFirst, starterSeed, LATER);
    expect(positions(catalogFirst)).toEqual(expected);
    for (const slug of slugs) expect(getProblemByPlatformId(catalogFirst, 'leetcode', slug)?.id).toBe(catalogIds.get(slug));
  });

  it('loads nothing from an invalid file and leaves catalog_sources alone', () => {
    const db = freshDb();
    loadCatalogSeed(db, catalog([entry('a')], T1), NOW);
    const bad = catalog([entry('b'), entry('c', { url: 'https://leetcode.com/problems/other/' })], T2);
    expect(() => loadCatalogSeed(db, bad, LATER)).toThrow(/invalid/);
    expect(() => loadCatalogSeed(db, { generatedAt: T2, source: 'x', platform: 'leetcode', problems: [{ platform: 'leetcode' }] }, LATER)).toThrow();
    expect(() => loadCatalogSeed(db, catalog([entry('b', { platform: 'cses' as Platform })], T2), LATER)).toThrow();
    expect(rowCount(db)).toBe(1);
    expect(getCatalogSource(db, 'leetcode')).toMatchObject({ generatedAt: T1, loadedAt: NOW });
  });

  it('rolls the whole file back when a write fails halfway', () => {
    const db = freshDb();
    loadCatalogSeed(db, catalog([entry('a', { title: 'Before' })], T1), NOW);
    db.exec(`CREATE TRIGGER boom BEFORE INSERT ON problems WHEN NEW.platform_id = 'last'
             BEGIN SELECT RAISE(ABORT, 'boom'); END`);
    const next = catalog([entry('a', { title: 'After' }), entry('b'), entry('last')], T2);
    expect(() => loadCatalogSeed(db, next, LATER)).toThrow(/boom/);
    expect(rowCount(db)).toBe(1);
    expect(getProblemByPlatformId(db, 'leetcode', 'a')?.title).toBe('Before');
    expect(getCatalogSource(db, 'leetcode')).toMatchObject({ generatedAt: T1, loadedAt: NOW });
  });

  it('tracks each platform separately', () => {
    const db = freshDb();
    loadCatalogSeed(db, catalog([entry('a')], T1), NOW);
    loadCatalogSeed(
      db,
      catalog(
        [entry('1068', { platform: 'cses', url: csesAdapter.buildUrl('1068'), difficultyRaw: null, difficultyNorm: null })],
        T2,
        'cses',
      ),
      LATER,
    );
    expect(getCatalogSource(db, 'leetcode')?.generatedAt).toBe(T1);
    expect(getCatalogSource(db, 'cses')?.generatedAt).toBe(T2);
  });
});

describe('searchProblems with the catalog loaded', () => {
  function titled(platformId: string, title: string, solvedCount: number | null, displayId: string | null = null): CatalogProblem {
    return entry(platformId, { title, solvedCount, displayId });
  }

  it('ranks an exact number, then titles that start with the query, then the rest by how well known they are', () => {
    const db = freshDb();
    loadCatalogSeed(
      db,
      catalog([
        titled('contains-sum', 'Maximum Sum of Pairs', 9_000_000),
        titled('sum-root', 'Sum Root to Leaf Numbers', 50),
        titled('sum-big', 'Sum of Two Values', 5_000),
        titled('sum-unknown', 'Sum Mystery', null),
        titled('other', 'Something Else', 10, '2'),
        titled('two-sum', 'Two Sum', 1, '1'),
      ]),
      NOW,
    );
    expect(searchProblems(db, 'sum', 10).map((p) => p.platformId)).toEqual([
      'sum-big',
      'sum-root',
      'sum-unknown',
      'contains-sum',
      'two-sum',
    ]);
    expect(searchProblems(db, '2', 10)[0]?.platformId).toBe('other');
  });

  it('puts problems the user has logged before better-known ones of the same match kind', () => {
    const db = freshDb();
    loadCatalogSeed(db, catalog([titled('big', 'Path Alpha', 1_000_000), titled('mine', 'Path Beta', 1)]), NOW);
    insertAttempt(db, {
      problemId: getProblemByPlatformId(db, 'leetcode', 'mine')!.id,
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
    expect(searchProblems(db, 'path', 5).map((p) => p.platformId)).toEqual(['mine', 'big']);
  });

  it('honors the limit and treats % and _ literally', () => {
    const db = freshDb();
    loadCatalogSeed(db, catalog([titled('a', '100% Sure', 1), titled('b', 'Fully Sure', 2), titled('c', 'Under_score', 3)]), NOW);
    expect(searchProblems(db, '%', 5).map((p) => p.platformId)).toEqual(['a']);
    expect(searchProblems(db, '_', 5).map((p) => p.platformId)).toEqual(['c']);
    expect(searchProblems(db, 'sure', 1)).toHaveLength(1);
  });

  it('answers in a few milliseconds with a few thousand rows, even for a one-letter query', () => {
    const db = freshDb();
    const problems = Array.from({ length: 6000 }, (_, i) =>
      titled(`p${i}`, `Problem number ${i} about arrays`, i, String(i + 1)),
    );
    loadCatalogSeed(db, catalog(problems), NOW);
    const started = performance.now();
    for (const query of ['a', 'arrays', 'number 59', '4000']) expect(searchProblems(db, query, 8).length).toBeGreaterThan(0);
    const perQuery = (performance.now() - started) / 4;
    expect(perQuery).toBeLessThan(100);
    expect(searchProblems(db, '4000', 8)[0]?.platformId).toBe('p3999');
  });
});

describe('loading the real catalog', () => {
  it('loads all three files into an empty in-memory database quickly, and finds well-known problems', () => {
    const db = freshDb();
    const started = performance.now();
    for (const seed of [catalogLeetcode, catalogCses, catalogCodeforces]) loadCatalogSeed(db, seed, NOW);
    const elapsed = performance.now() - started;
    console.log(`catalog load time: ${elapsed.toFixed(0)} ms for ${rowCount(db)} problems`);
    expect(elapsed).toBeLessThan(5000);
    expect(rowCount(db)).toBeGreaterThan(7000);

    expect(searchProblems(db, 'two sum', 5)[0]?.platformId).toBe('two-sum');
    expect(searchProblems(db, 'Weird Algorithm', 3)[0]?.platformId).toBe('1068');
    expect(searchProblems(db, 'Watermelon', 3)[0]?.platformId).toBe('4A');
    expect(searchProblems(db, '1', 5)[0]?.platformId).toBe('two-sum');

    const searched = performance.now();
    for (const query of ['a', 'tree', 'path', 'sum']) searchProblems(db, query, 8);
    expect((performance.now() - searched) / 4).toBeLessThan(100);

    // A second launch only reads the source rows.
    const again = performance.now();
    for (const seed of [catalogLeetcode, catalogCses, catalogCodeforces]) {
      expect(loadCatalogSeed(db, seed, LATER).status).toBe('up-to-date');
    }
    expect(performance.now() - again).toBeLessThan(500);
  });
});
