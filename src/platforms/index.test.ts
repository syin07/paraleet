import { describe, expect, it } from 'vitest';
import { PLATFORMS } from '../core/types';
import { adapterFor, PLATFORM_LABELS, recognizeUrl } from './index';

function ok(text: string) {
  const result = recognizeUrl(text);
  if (!result.ok) throw new Error(`expected ${text} to be recognized: ${result.reason}`);
  return result;
}

function reason(text: string) {
  const result = recognizeUrl(text);
  if (result.ok) throw new Error(`expected ${text} to be rejected`);
  return result.reason;
}

describe('recognizeUrl on real platforms', () => {
  const cases: [string, string, string, string][] = [
    ['https://leetcode.com/problems/two-sum/description/', 'leetcode', 'two-sum', 'https://leetcode.com/problems/two-sum/'],
    ['https://leetcode.cn/problems/two-sum/submissions/', 'leetcode', 'two-sum', 'https://leetcode.com/problems/two-sum/'],
    ['https://cses.fi/problemset/task/1068', 'cses', '1068', 'https://cses.fi/problemset/task/1068'],
    ['https://www.cses.fi/problemset/stats/1068/', 'cses', '1068', 'https://cses.fi/problemset/task/1068'],
    ['https://codeforces.com/problemset/problem/4/A', 'codeforces', '4A', 'https://codeforces.com/problemset/problem/4/A'],
    ['https://codeforces.com/contest/1352/problem/C', 'codeforces', '1352C', 'https://codeforces.com/problemset/problem/1352/C'],
    ['https://codeforces.com/gym/102861/problem/A', 'codeforces', '102861A', 'https://codeforces.com/gym/102861/problem/A'],
    ['https://mirror.codeforces.com/contest/1520/problem/f2', 'codeforces', '1520F2', 'https://codeforces.com/problemset/problem/1520/F2'],
  ];
  it.each(cases)('%s', (text, platform, platformId, canonicalUrl) => {
    expect(ok(text)).toEqual({ ok: true, platform, platformId, canonicalUrl });
  });

  it('recognizing a canonical link gives the same ID back', () => {
    for (const text of ['https://leetcode.com/problems/two-sum/description/', 'https://cses.fi/problemset/task/1068', 'https://codeforces.com/contest/102861/problem/B']) {
      const first = ok(text);
      expect(ok(first.canonicalUrl)).toEqual(first);
    }
  });

  it('trims surrounding whitespace', () => {
    expect(ok('  https://cses.fi/problemset/task/1068\n').platformId).toBe('1068');
  });

  it('accepts scheme-less input', () => {
    expect(ok('leetcode.com/problems/two-sum')).toMatchObject({ platform: 'leetcode', platformId: 'two-sum' });
    expect(ok('www.cses.fi/problemset/task/1068')).toMatchObject({ platform: 'cses', platformId: '1068' });
    expect(ok('codeforces.com/contest/4/problem/A')).toMatchObject({ platform: 'codeforces', platformId: '4A' });
    expect(ok('example.com/p/1')).toMatchObject({ platform: 'other', platformId: 'https://example.com/p/1' });
    expect(ok('example.com:8080/p/1')).toMatchObject({ platform: 'other', platformId: 'https://example.com:8080/p/1' });
  });
});

describe('recognizeUrl rejects non-problem pages on real platforms', () => {
  it.each([
    ['https://leetcode.com/problemset/', 'LeetCode'],
    ['https://leetcode.cn/explore/', 'LeetCode'],
    ['https://codeforces.com/contest/1352', 'Codeforces'],
    ['https://codeforces.com/profile/tourist', 'Codeforces'],
    ['https://cses.fi/problemset/', 'CSES'],
    ['https://cses.fi/', 'CSES'],
  ])('%s', (text, label) => {
    const why = reason(text);
    expect(why).toContain(label);
    expect(why).toContain('not a problem page');
  });
});

describe('recognizeUrl rejects bad input with a reason', () => {
  it.each([[''], ['   '], ['two sum'], ['hello'], ['https://example.com/a b'], ['https://']])('%j', (text) => {
    expect(reason(text).length).toBeGreaterThan(10);
  });

  it.each([['javascript:alert(1)'], ['file:///etc/passwd'], ['ftp://example.com/p'], ['mailto:a@b.co'], ['data:text/html,x']])(
    '%s is not http or https',
    (text) => {
      expect(reason(text)).toContain('http');
    },
  );
});

describe('recognizeUrl falls back to Other', () => {
  it('lookalike hosts are Other, not the real platform', () => {
    expect(ok('https://leetcode.com.evil.example/problems/two-sum/').platform).toBe('other');
    expect(ok('https://notcodeforces.com/problemset/problem/4/A').platform).toBe('other');
    expect(ok('https://cses.fi.evil.example/problemset/task/1068').platform).toBe('other');
  });

  it('cleans the link one rule at a time', () => {
    expect(ok('HTTP://WWW.Example.COM/p').canonicalUrl).toBe('http://example.com/p');
    expect(ok('https://example.com/p/#frag').platformId).toBe('https://example.com/p');
    expect(ok('https://example.com/p/').platformId).toBe('https://example.com/p');
    expect(ok('https://example.com/p?utm_source=a&id=3&fbclid=z').platformId).toBe('https://example.com/p?id=3');
    expect(ok('https://example.com/p?b=2&a=1&ref=x&gclid=y').platformId).toBe('https://example.com/p?b=2&a=1');
  });

  it('the ID is the canonical link, and recognizing it again gives the same result', () => {
    const first = ok('https://www.hackerrank.com/challenges/solve-me-first/problem?utm_source=a');
    expect(first).toEqual({
      ok: true,
      platform: 'other',
      platformId: 'https://hackerrank.com/challenges/solve-me-first/problem',
      canonicalUrl: 'https://hackerrank.com/challenges/solve-me-first/problem',
    });
    expect(ok(first.canonicalUrl)).toEqual(first);
  });

  it('a real platform always wins over Other', () => {
    for (const text of ['https://leetcode.com/problems/two-sum/', 'https://cses.fi/problemset/task/1068', 'https://codeforces.com/problemset/problem/4/A']) {
      expect(ok(text).platform).not.toBe('other');
    }
  });
});

describe('registry', () => {
  it('has an adapter and a label for every platform', () => {
    for (const platform of PLATFORMS) {
      expect(adapterFor(platform)?.platform).toBe(platform);
      expect(adapterFor(platform)?.label).toBe(PLATFORM_LABELS[platform]);
    }
  });
});
