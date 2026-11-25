import { describe, expect, it } from 'vitest';
import { adapterFor, recognizeUrl } from './index';

// Accepted examples (the shapes from the per-platform tables), mutated in every way a pasted link
// can plausibly differ. Each mutated input must be rejected with a reason or satisfy the three
// invariants, and a real platform's problem must never turn into "Other" or a different ID.
const EXAMPLES: string[] = [
  'https://leetcode.com/problems/two-sum/',
  'https://leetcode.com/problems/two-sum',
  'https://www.leetcode.com/problems/two-sum/description/',
  'https://leetcode.com/problems/two-sum/submissions/1234567890/',
  'https://leetcode.com/problems/longest-substring-without-repeating-characters/?envType=study-plan-v2&envId=top-interview-150',
  'https://leetcode.cn/problems/two-sum/',
  'https://leetcode.com/contest/weekly-contest-300/problems/two-sum/',
  'http://leetcode.com/problems/3sum/',
  'https://cses.fi/problemset/task/1068',
  'https://www.cses.fi/problemset/task/1068/',
  'https://cses.fi/problemset/stats/1068/',
  'https://cses.fi/problemset/submit/1068/',
  'https://cses.fi/problemset/view/1068',
  'http://cses.fi/problemset/task/1640',
  'https://codeforces.com/problemset/problem/4/A',
  'https://www.codeforces.com/contest/1352/problem/C/',
  'https://codeforces.com/contest/1520/problem/F2',
  'https://codeforces.com/gym/102861/problem/A',
  'https://codeforces.com/problemset/gymProblem/102861/A',
  'https://codeforces.com/group/MWSDmqGsZm/contest/219158/problem/A',
  'https://m1.codeforces.com/contest/1352/problem/C',
  'https://mirror.codeforces.com/problemset/problem/4/A',
  'https://codeforces.ml/problemset/problem/4/A',
  'https://codeforc.es/problemset/problem/4/A',
  'http://codeforces.com/problemset/problem/1352/C',
  'https://example.com/p/1',
  'https://www.example.com/p/1/',
  'https://example.com/',
  'https://example.com/p?id=7&lang=en',
  'https://example.com/p?id=7#/route',
  'https://example.com/#/problem/12',
  'https://example.com/app/#!/p/3',
  'https://example.com:8080/p/1',
  'http://example.com/p/1',
  'https://atcoder.jp/contests/abc001/tasks/abc001_1',
  'https://www.hackerrank.com/challenges/solve-me-first/problem',
  'http://localhost:3000/x',
  'http://127.0.0.1/x',
];

interface Parts {
  scheme: string;
  host: string;
  path: string;
  query: string;
  fragment: string;
}

function split(url: string): Parts {
  const match = /^(https?):\/\/([^/?#]+)([^?#]*)(\?[^#]*)?(#.*)?$/.exec(url)!;
  return { scheme: match[1]!, host: match[2]!, path: match[3]!, query: match[4] ?? '', fragment: match[5] ?? '' };
}

const join = (p: Parts) => `${p.scheme}://${p.host}${p.path}${p.query}${p.fragment}`;

const REAL_HOSTS = [
  'leetcode.com',
  'leetcode.cn',
  'cses.fi',
  'codeforces.com',
  'codeforces.ml',
  'codeforc.es',
];

// Applied in this order, so every combination is deterministic. "scheme removed" is last.
const MUTATIONS: [string, (p: Parts) => Parts | null][] = [
  ['dot1', (p) => ({ ...p, host: `${p.host}.` })],
  ['dot2', (p) => ({ ...p, host: `${p.host}..` })],
  ['dot3', (p) => ({ ...p, host: `${p.host}...` })],
  ['upper', (p) => ({ ...p, host: p.host.toUpperCase() })],
  [
    'www',
    (p) => {
      if (/^www\./i.test(p.host)) return null;
      // Mirrors such as m1.codeforces.com have no www form.
      if (/^(m\d|mirror)\./i.test(p.host) || /^[\d.]+$/.test(p.host) || /^localhost/i.test(p.host)) return null;
      return { ...p, host: `www.${p.host}` };
    },
  ],
  [
    'port',
    (p) => {
      if (p.host.includes(':')) return null;
      return { ...p, host: `${p.host}:${p.scheme === 'https' ? 443 : 80}` };
    },
  ],
  ['userinfo', (p) => ({ ...p, host: `user:pass@${p.host}` })],
  ['slash', (p) => ({ ...p, path: `${p.path}/` })],
  ['slashes', (p) => ({ ...p, path: `${p.path}//` })],
  ['query', (p) => ({ ...p, query: p.query === '' ? '?a=1&utm_source=x' : `${p.query}&a=1&utm_source=x` })],
  ['fragment', (p) => (p.fragment === '' ? { ...p, fragment: '#top' } : null)],
  ['zeros1', (p) => padNumber(p, '0')],
  ['zeros3', (p) => padNumber(p, '000')],
];

function padNumber(p: Parts, zeros: string): Parts | null {
  if (!REAL_HOSTS.some((h) => p.host.toLowerCase().includes(h)) || /leetcode/i.test(p.host)) return null;
  const path = p.path.replace(/\/(\d+)(?=\/|$)/, (_m, digits: string) => `/${zeros}${digits}`);
  return path === p.path ? null : { ...p, path };
}

function combos(): { name: string; indexes: number[] }[] {
  const out: { name: string; indexes: number[] }[] = [];
  const n = MUTATIONS.length;
  for (let i = 0; i < n; i++) {
    out.push({ name: MUTATIONS[i]![0], indexes: [i] });
    for (let j = i + 1; j < n; j++) out.push({ name: `${MUTATIONS[i]![0]}+${MUTATIONS[j]![0]}`, indexes: [i, j] });
  }
  return out;
}

function mutate(example: string, indexes: number[], dropScheme: boolean): string | null {
  let parts: Parts | null = split(example);
  for (const index of indexes) {
    parts = MUTATIONS[index]![1](parts);
    if (parts === null) return null;
  }
  const text = join(parts);
  return dropScheme ? text.replace(/^https?:\/\//, '') : text;
}

function checkInvariants(input: string) {
  const result = recognizeUrl(input);
  if (!result.ok) {
    expect(result.reason.length, input).toBeGreaterThan(10);
    return result;
  }
  const adapter = adapterFor(result.platform)!;
  expect(adapter.isValidId(result.platformId), `${input} -> isValidId(${result.platformId})`).toBe(true);
  expect(result.canonicalUrl, input).toMatch(/^https?:\/\//);
  const again = recognizeUrl(result.canonicalUrl);
  expect(again, `${input} -> canonical ${result.canonicalUrl}`).toEqual(result);
  return result;
}

describe('recognizeUrl invariants under mutation', () => {
  let cases = 0;

  it('every accepted or rejected mutation holds the three invariants and never turns a real platform into Other', () => {
    for (const example of EXAMPLES) {
      const original = recognizeUrl(example);
      expect(original.ok, example).toBe(true);
      if (!original.ok) continue;
      checkInvariants(example);
      for (const { name, indexes } of combos()) {
        for (const dropScheme of [false, true]) {
          if (dropScheme && !example.startsWith('https://')) continue;
          const input = mutate(example, indexes, dropScheme);
          if (input === null) continue;
          cases++;
          const result = checkInvariants(input);
          if (result.ok && original.platform !== 'other') {
            expect(
              { platform: result.platform, platformId: result.platformId },
              `${name}${dropScheme ? '+noscheme' : ''}: ${input}`,
            ).toEqual({ platform: original.platform, platformId: original.platformId });
          }
        }
      }
    }
    // Guard against the generator silently producing almost nothing.
    expect(cases).toBeGreaterThan(5000);
  });

  it('the probed hosts with several trailing dots', () => {
    expect(recognizeUrl('https://leetcode.com../problems/two-sum/')).toMatchObject({ ok: true, platform: 'leetcode', platformId: 'two-sum' });
    expect(recognizeUrl('https://cses.fi../problemset/task/1068')).toMatchObject({ ok: true, platform: 'cses', platformId: '1068' });
    const blog = recognizeUrl('https://codeforces.com../blog');
    expect(blog.ok).toBe(false);
    expect(recognizeUrl('https://example.com../x')).toMatchObject({ ok: true, platform: 'other', platformId: 'https://example.com/x' });
    expect(recognizeUrl('http://...').ok).toBe(false);
  });

  it('hosts with an empty label are rejected with or without a scheme', () => {
    for (const text of ['https://a..b.com/x', 'https://.example.com/x', 'a..b.com/x', '.example.com/x', 'http://..', 'https://./x']) {
      const result = recognizeUrl(text);
      expect(result.ok, text).toBe(false);
      if (!result.ok) expect(result.reason).toContain('does not look like a link');
    }
  });
});
