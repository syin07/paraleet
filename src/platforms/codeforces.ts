import type { TopicId } from '../core/topics';
import type { DifficultyNorm } from '../core/types';
import { hostnameOf, plainNumber } from './host';
import { mapTagsWith } from './tags';
import type { PlatformAdapter } from './types';

export const CODEFORCES_HOSTS: readonly string[] = [
  'codeforces.com',
  'www.codeforces.com',
  'm1.codeforces.com',
  'm2.codeforces.com',
  'm3.codeforces.com',
  'mirror.codeforces.com',
  'codeforces.ml',
  'www.codeforces.ml',
  'codeforc.es',
  'www.codeforc.es',
];

// The contest number has no leading zeros and is not zero, so one problem has one ID.
const ID = /^([1-9]\d*)([A-Z]\d?)$/;
const INDEX = '([A-Za-z]\\d?)';
const PATHS = [
  new RegExp(`^/problemset/problem/(\\d+)/${INDEX}/*$`),
  new RegExp(`^/problemset/gymProblem/(\\d+)/${INDEX}/*$`),
  new RegExp(`^/contest/(\\d+)/problem/${INDEX}/*$`),
  new RegExp(`^/gym/(\\d+)/problem/${INDEX}/*$`),
  new RegExp(`^/group/[^/]+/contest/(\\d+)/problem/${INDEX}/*$`),
];

/** Contest numbers from here up are gym contests, which have no problemset page. */
const FIRST_GYM_CONTEST = 100000;

// Codeforces's own tag names (lower case). "*special" and "interactive" describe the format of a
// problem, not its subject; "divide and conquer" and "meet-in-the-middle" have no topic of their own.
export const CODEFORCES_TAGS: Record<string, TopicId> = {
  '2-sat': 'graphs',
  'binary search': 'binary-search',
  bitmasks: 'bit-manipulation',
  'brute force': 'implementation',
  'chinese remainder theorem': 'math',
  combinatorics: 'math',
  'constructive algorithms': 'implementation',
  'data structures': 'arrays-hashing',
  'dfs and similar': 'graphs',
  dp: 'dynamic-programming',
  dsu: 'union-find',
  'expression parsing': 'strings',
  fft: 'math',
  flows: 'graphs',
  games: 'math',
  geometry: 'geometry',
  'graph matchings': 'graphs',
  graphs: 'graphs',
  greedy: 'greedy',
  hashing: 'arrays-hashing',
  implementation: 'implementation',
  math: 'math',
  matrices: 'math',
  'number theory': 'math',
  probabilities: 'math',
  schedules: 'intervals',
  'shortest paths': 'shortest-paths',
  sortings: 'sorting',
  'string suffix structures': 'strings',
  strings: 'strings',
  'ternary search': 'binary-search',
  trees: 'trees',
  'two pointers': 'two-pointers',
};

export const codeforcesAdapter: PlatformAdapter = {
  platform: 'codeforces',
  label: 'Codeforces',

  parseUrl(url) {
    if (!CODEFORCES_HOSTS.includes(hostnameOf(url))) return null;
    for (const path of PATHS) {
      const match = path.exec(url.pathname);
      if (!match) continue;
      const contest = plainNumber(match[1]!);
      return contest === null ? null : `${contest}${match[2]!.toUpperCase()}`;
    }
    return null;
  },

  /** Call `isValidId` first: a malformed ID gives a meaningless link, not an error. */
  buildUrl(platformId) {
    const match = ID.exec(platformId);
    const contest = match?.[1] ?? '';
    const index = match?.[2] ?? '';
    return Number(contest) >= FIRST_GYM_CONTEST
      ? `https://codeforces.com/gym/${contest}/problem/${index}`
      : `https://codeforces.com/problemset/problem/${contest}/${index}`;
  },

  isValidId(platformId) {
    return ID.test(platformId);
  },

  normalizeDifficulty(raw) {
    if (raw === null) return null;
    const text = raw.trim();
    if (!/^\d+$/.test(text)) return null;
    const rating = Number(text);
    if (rating <= 0) return null;
    const band: DifficultyNorm = rating <= 1000 ? 1 : rating <= 1400 ? 2 : rating <= 1800 ? 3 : rating <= 2200 ? 4 : 5;
    return band;
  },

  mapTags(sourceTags) {
    return mapTagsWith(CODEFORCES_TAGS, sourceTags);
  },
};
