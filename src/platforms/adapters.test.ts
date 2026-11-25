import { describe, expect, it } from 'vitest';
import { isTopicId } from '../core/topics';
import { CODEFORCES_TAGS, codeforcesAdapter } from './codeforces';
import { CSES_TAGS, csesAdapter } from './cses';
import { leetcodeAdapter } from './leetcode';
import { otherAdapter } from './other';
import type { PlatformAdapter } from './types';

const parse = (adapter: PlatformAdapter, url: string) => adapter.parseUrl(new URL(url));

const ADAPTERS: readonly PlatformAdapter[] = [leetcodeAdapter, csesAdapter, codeforcesAdapter, otherAdapter];

describe('verify', () => {
  it.each(ADAPTERS.map((a) => [a.platform, a] as const))('%s does not implement verify in v1', (_name, adapter) => {
    expect(adapter.verify).toBeUndefined();
  });
});

describe('LeetCode URLs', () => {
  const cases: [string, string | null][] = [
    ['https://leetcode.com/problems/two-sum/', 'two-sum'],
    ['https://leetcode.com/problems/two-sum', 'two-sum'],
    ['https://www.leetcode.com/problems/two-sum/', 'two-sum'],
    ['http://leetcode.com/problems/two-sum/', 'two-sum'],
    ['https://LeetCode.com/problems/two-sum/', 'two-sum'],
    ['https://leetcode.com/problems/two-sum/description/', 'two-sum'],
    ['https://leetcode.com/problems/two-sum/submissions/', 'two-sum'],
    ['https://leetcode.com/problems/two-sum/submissions/1234567890/', 'two-sum'],
    ['https://leetcode.com/problems/two-sum/solutions/', 'two-sum'],
    ['https://leetcode.com/problems/two-sum/editorial/', 'two-sum'],
    ['https://leetcode.com/problems/longest-substring-without-repeating-characters/?envType=study-plan-v2&envId=top-interview-150', 'longest-substring-without-repeating-characters'],
    ['https://leetcode.com/problems/3sum/#section', '3sum'],
    ['https://leetcode.cn/problems/two-sum/', 'two-sum'],
    ['https://www.leetcode.cn/problems/two-sum/description/', 'two-sum'],
    ['https://leetcode.com/contest/weekly-contest-300/problems/two-sum/', 'two-sum'],
    ['https://leetcode.com/contest/biweekly-contest-80/problems/minimum-cost-to-reach-city', 'minimum-cost-to-reach-city'],
    ['https://leetcode.com/problems/Two-Sum/', 'two-sum'],
    ['https://leetcode.com./problems/two-sum/', 'two-sum'],
    ['https://leetcode.com.:443/problems/two-sum/', 'two-sum'],
    // Not problem pages, or not LeetCode.
    ['https://leetcode.com/problemset/', null],
    ['https://leetcode.com/problems/', null],
    ['https://leetcode.com/explore/', null],
    ['https://leetcode.com/contest/weekly-contest-300/', null],
    ['https://leetcode.com.evil.example/problems/two-sum/', null],
    ['https://notleetcode.com/problems/two-sum/', null],
    ['https://example.com/problems/two-sum/', null],
    ['https://leetcode.com/problems/two_sum/', null],
  ];
  it.each(cases)('%s', (url, expected) => {
    expect(parse(leetcodeAdapter, url)).toBe(expected);
  });
});

describe('CSES URLs', () => {
  const cases: [string, string | null][] = [
    ['https://cses.fi/problemset/task/1068', '1068'],
    ['https://cses.fi/problemset/task/1068/', '1068'],
    ['https://www.cses.fi/problemset/task/1068', '1068'],
    ['http://cses.fi/problemset/task/1068', '1068'],
    ['https://CSES.fi/problemset/task/1068', '1068'],
    ['https://cses.fi/problemset/task/1068?x=1#top', '1068'],
    ['https://cses.fi/problemset/stats/1068/', '1068'],
    ['https://cses.fi/problemset/submit/1068/', '1068'],
    ['https://cses.fi/problemset/hack/1068/', '1068'],
    ['https://cses.fi/problemset/model/1068', '1068'],
    ['https://cses.fi/problemset/view/1068/', '1068'],
    ['https://cses.fi/problemset/task/1640', '1640'],
    ['https://cses.fi./problemset/task/1068', '1068'],
    ['https://cses.fi/problemset/task/01068', '1068'],
    ['https://cses.fi/problemset/task/0', null],
    ['https://cses.fi/problemset/task/000', null],
    ['https://cses.fi/problemset/', null],
    ['https://cses.fi/problemset/list/', null],
    ['https://cses.fi/problemset/task/', null],
    ['https://cses.fi/problemset/task/abc', null],
    ['https://cses.fi/problemset/task/1068/extra', null],
    ['https://cses.fi/', null],
    ['https://cses.fi.evil.example/problemset/task/1068', null],
    ['https://notcses.fi/problemset/task/1068', null],
  ];
  it.each(cases)('%s', (url, expected) => {
    expect(parse(csesAdapter, url)).toBe(expected);
  });
});

describe('Codeforces URLs', () => {
  const cases: [string, string | null][] = [
    ['https://codeforces.com/problemset/problem/4/A', '4A'],
    ['https://codeforces.com/problemset/problem/4/A/', '4A'],
    ['https://www.codeforces.com/problemset/problem/4/A', '4A'],
    ['http://codeforces.com/problemset/problem/4/A', '4A'],
    ['https://Codeforces.com/problemset/problem/4/a', '4A'],
    ['https://codeforces.com/problemset/problem/1352/C?locale=ru', '1352C'],
    ['https://codeforces.com/contest/1352/problem/C', '1352C'],
    ['https://codeforces.com/contest/1352/problem/C/', '1352C'],
    ['https://codeforces.com/contest/1520/problem/F2', '1520F2'],
    ['https://codeforces.com/contest/1520/problem/f2', '1520F2'],
    ['https://codeforces.com/gym/102861/problem/A', '102861A'],
    ['https://codeforces.com/problemset/gymProblem/102861/A', '102861A'],
    ['https://codeforces.com/group/MWSDmqGsZm/contest/219158/problem/A', '219158A'],
    ['https://m1.codeforces.com/contest/1352/problem/C', '1352C'],
    ['https://m2.codeforces.com/problemset/problem/4/A', '4A'],
    ['https://m3.codeforces.com/problemset/problem/4/A', '4A'],
    ['https://mirror.codeforces.com/problemset/problem/4/A', '4A'],
    ['https://codeforces.ml/problemset/problem/4/A', '4A'],
    ['https://codeforc.es/problemset/problem/4/A', '4A'],
    ['https://codeforces.com./problemset/problem/4/A', '4A'],
    ['https://codeforces.com/contest/01352/problem/C', '1352C'],
    ['https://codeforces.com/problemset/problem/0004/A', '4A'],
    ['https://codeforces.com/contest/0/problem/A', null],
    // Not problem pages, or not Codeforces.
    ['https://codeforces.com/contest/1352', null],
    ['https://codeforces.com/contest/1352/standings', null],
    ['https://codeforces.com/problemset', null],
    ['https://codeforces.com/problemset/problem/4', null],
    ['https://codeforces.com/problemset/problem/4/AB', null],
    ['https://codeforces.com/problemset/problem/x/A', null],
    ['https://codeforces.com/profile/tourist', null],
    ['https://notcodeforces.com/problemset/problem/4/A', null],
    ['https://codeforces.com.evil.example/problemset/problem/4/A', null],
  ];
  it.each(cases)('%s', (url, expected) => {
    expect(parse(codeforcesAdapter, url)).toBe(expected);
  });
});

describe('Other URL cleaning', () => {
  const cases: [string, string][] = [
    ['HTTPS://Example.COM/Problem/7', 'https://example.com/Problem/7'],
    ['https://www.Example.com/p?id=7#x', 'https://www.example.com/p?id=7'],
    ['https://www.example.com/p/1', 'https://www.example.com/p/1'],
    ['https://example.com/p/1/', 'https://example.com/p/1'],
    ['https://example.com/', 'https://example.com'],
    ['https://example.com/p/1#solution', 'https://example.com/p/1'],
    ['https://example.com/p/1?utm_source=x&utm_medium=y', 'https://example.com/p/1'],
    ['https://example.com/p/1?fbclid=abc&gclid=def&ref=twitter', 'https://example.com/p/1'],
    ['https://example.com/p?id=7&utm_campaign=a&lang=en', 'https://example.com/p?id=7&lang=en'],
    ['https://example.com/p?lang=en&id=7', 'https://example.com/p?lang=en&id=7'],
    ['http://example.com:8080/p/1/?ref=a', 'http://example.com:8080/p/1'],
    ['https://user:secret@example.com/p/1', 'https://example.com/p/1'],
    ['https://example.com./p/1', 'https://example.com/p/1'],
    ['https://example.com.:8080/p/1', 'https://example.com:8080/p/1'],
    ['https://example.com/#/problem/12', 'https://example.com#/problem/12'],
    ['https://example.com/app/#!/p/3', 'https://example.com/app#!/p/3'],
    ['https://example.com/p?id=1#/route?x=2', 'https://example.com/p?id=1#/route?x=2'],
    ['https://example.com/p#section-2', 'https://example.com/p'],
    ['https://example.com/p#', 'https://example.com/p'],
    ['https://atcoder.jp/contests/abc001/tasks/abc001_1', 'https://atcoder.jp/contests/abc001/tasks/abc001_1'],
  ];
  it.each(cases)('%s', (url, expected) => {
    expect(parse(otherAdapter, url)).toBe(expected);
  });

  it('keeps www, so the same URL with and without it gives two IDs', () => {
    expect(parse(otherAdapter, 'https://www.example.com/p')).not.toBe(parse(otherAdapter, 'https://example.com/p'));
  });

  it('the canonical link has the host the user pasted, lower-cased', () => {
    for (const host of ['Example.com', 'WWW.Example.com', 'www.judge.org:8080', 'sub.Site.io']) {
      const id = parse(otherAdapter, `https://${host}/p/1/?utm_source=a`);
      expect(new URL(otherAdapter.buildUrl(id!)).host).toBe(host.toLowerCase());
    }
  });

  it('cleaning is idempotent for every example above', () => {
    for (const [url] of cases) {
      const once = parse(otherAdapter, url)!;
      expect(parse(otherAdapter, once)).toBe(once);
      expect(otherAdapter.isValidId(once)).toBe(true);
    }
  });

  it('a long run of trailing slashes is handled', () => {
    expect(parse(otherAdapter, `https://example.com/p${'/'.repeat(100000)}`)).toBe('https://example.com/p');
  });

  it('does not accept non-http schemes', () => {
    expect(parse(otherAdapter, 'file:///etc/passwd')).toBeNull();
    expect(parse(otherAdapter, 'javascript:alert(1)')).toBeNull();
  });
});

describe('build and parse round trip', () => {
  const ids: Record<string, string[]> = {
    leetcode: ['two-sum', '3sum', 'longest-substring-without-repeating-characters'],
    cses: ['1068', '1640', '1'],
    codeforces: ['4A', '1352C', '1520F2', '102861A', '219158B'],
    other: ['https://example.com/p/1', 'https://example.com/p?id=7&lang=en', 'http://atcoder.jp/a/b_1'],
  };
  for (const adapter of ADAPTERS) {
    it(`${adapter.platform}: parseUrl(buildUrl(id)) gives id back and isValidId agrees`, () => {
      for (const id of ids[adapter.platform]!) {
        expect(adapter.isValidId(id)).toBe(true);
        expect(adapter.parseUrl(new URL(adapter.buildUrl(id)))).toBe(id);
      }
    });
  }

  it('canonical forms', () => {
    expect(leetcodeAdapter.buildUrl('two-sum')).toBe('https://leetcode.com/problems/two-sum/');
    expect(csesAdapter.buildUrl('1068')).toBe('https://cses.fi/problemset/task/1068');
    expect(codeforcesAdapter.buildUrl('4A')).toBe('https://codeforces.com/problemset/problem/4/A');
    expect(codeforcesAdapter.buildUrl('99999Z')).toBe('https://codeforces.com/problemset/problem/99999/Z');
    expect(codeforcesAdapter.buildUrl('100000A')).toBe('https://codeforces.com/gym/100000/problem/A');
    expect(codeforcesAdapter.buildUrl('102861A')).toBe('https://codeforces.com/gym/102861/problem/A');
  });

  it('isValidId rejects malformed IDs', () => {
    expect(leetcodeAdapter.isValidId('Two-Sum')).toBe(false);
    expect(leetcodeAdapter.isValidId('')).toBe(false);
    expect(csesAdapter.isValidId('10a')).toBe(false);
    expect(csesAdapter.isValidId('')).toBe(false);
    expect(csesAdapter.isValidId('0')).toBe(false);
    expect(csesAdapter.isValidId('01068')).toBe(false);
    expect(codeforcesAdapter.isValidId('1352c')).toBe(false);
    expect(codeforcesAdapter.isValidId('1352')).toBe(false);
    expect(codeforcesAdapter.isValidId('C')).toBe(false);
    expect(codeforcesAdapter.isValidId('1352CC')).toBe(false);
    expect(codeforcesAdapter.isValidId('0A')).toBe(false);
    expect(codeforcesAdapter.isValidId('01352C')).toBe(false);
    expect(otherAdapter.isValidId('example.com')).toBe(false);
    expect(otherAdapter.isValidId('https://www.example.com/p/')).toBe(false);
    expect(otherAdapter.isValidId('https://example.com/p?utm_source=a')).toBe(false);
    expect(otherAdapter.isValidId('ftp://example.com/p')).toBe(false);
  });
});

describe('one ID per problem', () => {
  it('different links to one problem give the same ID', () => {
    const cf = [
      'https://codeforces.com/problemset/problem/1352/C',
      'https://www.codeforces.com/contest/1352/problem/C/',
      'https://mirror.codeforces.com/contest/1352/problem/c',
      'https://m1.codeforces.com/problemset/problem/01352/C?x=1',
      'https://codeforces.com./contest/001352/problem/C',
      'https://codeforces.com/group/abc/contest/1352/problem/C',
    ];
    expect(new Set(cf.map((u) => parse(codeforcesAdapter, u)))).toEqual(new Set(['1352C']));
    const cses = [
      'https://cses.fi/problemset/task/1068',
      'https://www.cses.fi/problemset/task/1068/',
      'https://cses.fi/problemset/stats/01068',
      'https://cses.fi./problemset/submit/0001068/',
      'https://CSES.FI/problemset/view/1068#x',
    ];
    expect(new Set(cses.map((u) => parse(csesAdapter, u)))).toEqual(new Set(['1068']));
  });
});

describe('difficulty', () => {
  const probes = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', ' Constructor ', '', 'abc', '-5', 'Easy ', 'EASY'];
  it.each(ADAPTERS.map((a) => [a.platform, a] as const))('%s: any text gives null or an integer 1 to 5', (_name, adapter) => {
    for (const probe of [...probes, null]) {
      const result = adapter.normalizeDifficulty(probe);
      expect(result === null || (Number.isInteger(result) && result >= 1 && result <= 5), String(probe)).toBe(true);
    }
    for (const probe of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(adapter.normalizeDifficulty(probe)).toBeNull();
    }
  });

  it('maps LeetCode Easy, Medium and Hard, ignoring case and spaces', () => {
    expect(leetcodeAdapter.normalizeDifficulty('Easy')).toBe(1);
    expect(leetcodeAdapter.normalizeDifficulty(' medium ')).toBe(3);
    expect(leetcodeAdapter.normalizeDifficulty('HARD')).toBe(5);
    expect(leetcodeAdapter.normalizeDifficulty('Extreme')).toBeNull();
    expect(leetcodeAdapter.normalizeDifficulty(null)).toBeNull();
    expect(leetcodeAdapter.normalizeDifficulty('')).toBeNull();
  });

  it('Other accepts Easy, Medium and Hard only', () => {
    expect(otherAdapter.normalizeDifficulty('Easy')).toBe(1);
    expect(otherAdapter.normalizeDifficulty('medium')).toBe(3);
    expect(otherAdapter.normalizeDifficulty('Hard')).toBe(5);
    expect(otherAdapter.normalizeDifficulty('1500')).toBeNull();
    expect(otherAdapter.normalizeDifficulty(null)).toBeNull();
  });

  it('CSES has no difficulty', () => {
    expect(csesAdapter.normalizeDifficulty('Easy')).toBeNull();
    expect(csesAdapter.normalizeDifficulty('1200')).toBeNull();
    expect(csesAdapter.normalizeDifficulty(null)).toBeNull();
  });

  it.each([
    ['800', 1],
    ['1000', 1],
    ['1100', 2],
    ['1400', 2],
    ['1500', 3],
    ['1800', 3],
    ['1900', 4],
    ['2200', 4],
    ['2300', 5],
    ['3500', 5],
    [' 1500 ', 3],
  ] as const)('Codeforces rating %s is %i', (raw, expected) => {
    expect(codeforcesAdapter.normalizeDifficulty(raw)).toBe(expected);
  });

  it.each([[''], ['abc'], ['-5'], ['0'], ['12.5'], ['1e3'], [null]])('Codeforces %j gives null', (raw) => {
    expect(codeforcesAdapter.normalizeDifficulty(raw)).toBeNull();
  });
});

describe('tags', () => {
  it('every mapped value in every tag map is a real topic', () => {
    for (const map of [CODEFORCES_TAGS, CSES_TAGS]) {
      for (const [tag, mapped] of Object.entries(map)) {
        for (const topic of typeof mapped === 'string' ? [mapped] : mapped) {
          expect(isTopicId(topic), `${tag} -> ${topic}`).toBe(true);
        }
      }
    }
    // LeetCode's map is private, so check it through its adapter on a sample of its tags.
    for (const topic of leetcodeAdapter.mapTags(['Array', 'Dynamic Programming', 'Heap (Priority Queue)', 'Trie'])) {
      expect(isTopicId(topic)).toBe(true);
    }
  });

  it('maps known tags', () => {
    expect(codeforcesAdapter.mapTags(['dp', 'dsu', 'two pointers', 'bitmasks', 'dfs and similar'])).toEqual([
      'dynamic-programming',
      'union-find',
      'two-pointers',
      'bit-manipulation',
      'graphs',
    ]);
    expect(csesAdapter.mapTags(['Sorting and Searching', 'Range Queries'])).toEqual(['sorting', 'binary-search', 'range-queries']);
    expect(leetcodeAdapter.mapTags(['Hash Table', 'Binary Search'])).toEqual(['arrays-hashing', 'binary-search']);
  });

  it.each(ADAPTERS.map((a) => [a.platform, a] as const))('%s: unknown tags give an empty list', (_name, adapter) => {
    expect(adapter.mapTags([])).toEqual([]);
    expect(adapter.mapTags(['no such tag', '', 'constructor', '__proto__'])).toEqual([]);
  });

  it('leaves format tags unmapped', () => {
    expect(codeforcesAdapter.mapTags(['*special', 'interactive'])).toEqual([]);
    expect(csesAdapter.mapTags(['General', 'Additional Problems I'])).toEqual([]);
  });

  it('collapses duplicates, including tags that share a topic', () => {
    expect(codeforcesAdapter.mapTags(['math', 'number theory', 'math'])).toEqual(['math']);
    expect(leetcodeAdapter.mapTags(['Array', 'Hash Table'])).toEqual(['arrays-hashing']);
  });

  it('ignores case and surrounding spaces', () => {
    expect(codeforcesAdapter.mapTags(['  DP ', 'Two Pointers'])).toEqual(['dynamic-programming', 'two-pointers']);
    expect(csesAdapter.mapTags(['  GRAPH algorithms'])).toEqual(['graphs']);
  });

  it('Other maps nothing', () => {
    expect(otherAdapter.mapTags(['Array', 'dp'])).toEqual([]);
  });
});
