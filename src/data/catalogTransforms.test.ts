import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { transformCodeforces, transformCses, transformLeetcode } from '../platforms/catalog';

// These tests live in src/data, not next to the transforms, because platforms tests may import only vitest.
const fixture = (name: string): string => readFileSync(resolve(import.meta.dirname, '../../scripts/seed/fixtures', name), 'utf8');
const reasons = (skipped: { reason: string }[]): string[] => skipped.map((skip) => skip.reason).sort();

describe('transformCodeforces', () => {
  const listing: unknown = JSON.parse(fixture('codeforces-problemset.json'));
  const result = transformCodeforces(listing, 13000);

  it('keeps rated programming problems at or above the solved-count floor, by contest then index', () => {
    expect(result.entries.map((entry) => entry.platformId)).toEqual(['1A', '2A', '2B', '4A', '100001B']);
    expect(result.fetched).toBe(11);
  });

  it('reports what it skipped and why', () => {
    expect(reasons(result.skipped)).toEqual([
      'below the solved-count floor',
      'below the solved-count floor',
      'duplicate',
      'malformed ID',
      'no rating',
      'not a programming problem',
    ]);
  });

  it('fills every field from the listing through the adapter', () => {
    const entry = result.entries[0];
    expect(entry).toEqual({
      platform: 'codeforces',
      platformId: '1A',
      displayId: '1A',
      title: 'Theatre Square',
      url: 'https://codeforces.com/problemset/problem/1/A',
      difficultyRaw: '1000',
      difficultyNorm: 1,
      topics: ['math'],
      sourceTags: ['math'],
      solvedCount: 150000,
    });
    expect(result.entries.find((e) => e.platformId === '100001B')?.url).toBe('https://codeforces.com/gym/100001/problem/B');
    expect(result.entries.find((e) => e.platformId === '2B')?.sourceTags).toEqual(['dp', 'math', '*special']);
  });

  it('keeps the first of a duplicated problem', () => {
    expect(result.entries.find((e) => e.platformId === '4A')?.title).toBe('Watermelon');
  });

  it('rejects a response that is not a successful listing', () => {
    expect(() => transformCodeforces({ status: 'FAILED', comment: 'x' })).toThrow();
  });
});

describe('transformLeetcode', () => {
  const result = transformLeetcode(JSON.parse(fixture('leetcode-questions.json')));

  it('keeps free problems in numeric order and drops the rest with reasons', () => {
    expect(result.entries.map((entry) => entry.platformId)).toEqual(['two-sum', 'add-two-numbers', 'odd-number']);
    expect(reasons(result.skipped)).toEqual([
      'duplicate',
      'malformed number',
      'malformed slug',
      'paid-only',
      'unknown difficulty "Impossible"',
      'unreadable row',
    ]);
  });

  it('maps difficulty, topics and the accepted count', () => {
    expect(result.entries[0]).toEqual({
      platform: 'leetcode',
      platformId: 'two-sum',
      displayId: '1',
      title: 'Two Sum',
      url: 'https://leetcode.com/problems/two-sum/',
      difficultyRaw: 'Easy',
      difficultyNorm: 1,
      topics: ['arrays-hashing'],
      sourceTags: ['Array', 'Hash Table'],
      solvedCount: 24211566,
    });
  });

  it('gives a null solved count when the stats are missing or unreadable, and keeps unmapped tags as source tags', () => {
    const odd = result.entries[2];
    expect(odd?.solvedCount).toBeNull();
    expect(odd?.topics).toEqual([]);
    expect(odd?.sourceTags).toEqual(['Design']);
  });

  it('never carries a statement field into an entry', () => {
    for (const entry of result.entries) {
      expect(Object.keys(entry).sort()).toEqual(
        ['difficultyNorm', 'difficultyRaw', 'displayId', 'platform', 'platformId', 'solvedCount', 'sourceTags', 'title', 'topics', 'url'],
      );
    }
  });
});

describe('transformCses', () => {
  const result = transformCses(fixture('cses-problemset.html'));

  it('lists tasks in page order, skipping the General section, duplicates and malformed links', () => {
    expect(result.entries.map((entry) => entry.platformId)).toEqual(['1068', '1083', '1621', '1640', '1111']);
    expect(reasons(result.skipped)).toEqual(['duplicate', 'malformed ID']);
    expect(result.fetched).toBe(7);
  });

  it('takes the section name as the source tag and the topics from it', () => {
    expect(result.entries[0]).toEqual({
      platform: 'cses',
      platformId: '1068',
      displayId: null,
      title: 'Weird Algorithm',
      url: 'https://cses.fi/problemset/task/1068',
      difficultyRaw: null,
      difficultyNorm: null,
      topics: ['implementation'],
      sourceTags: ['Introductory Problems'],
      solvedCount: 184925,
    });
    expect(result.entries[2]?.topics).toEqual(['sorting', 'binary-search']);
    expect(result.entries[4]).toMatchObject({ sourceTags: ['Additional Problems I'], topics: [] });
  });

  it('decodes HTML entities in titles and gives null when the listing shows no count', () => {
    expect(result.entries[3]).toMatchObject({ title: 'Sum of Two Values & More', solvedCount: null });
  });
});
