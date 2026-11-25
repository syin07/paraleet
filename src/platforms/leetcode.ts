import type { TopicId } from '../core/topics';
import type { DifficultyNorm } from '../core/types';
import { mapTagsWith } from './tags';
import type { PlatformAdapter } from './types';

/** LeetCode's own hosts; links there that are not problem pages are rejected, not treated as "Other". */
export const LEETCODE_HOSTS: readonly string[] = ['leetcode.com', 'www.leetcode.com', 'leetcode.cn', 'www.leetcode.cn'];

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const DIFFICULTY: Record<string, DifficultyNorm> = { easy: 1, medium: 3, hard: 5 };

// LeetCode topic tag names (lowercased) to app topics.
const TAGS: Record<string, TopicId> = {
  array: 'arrays-hashing',
  'hash table': 'arrays-hashing',
  matrix: 'arrays-hashing',
  counting: 'arrays-hashing',
  'two pointers': 'two-pointers',
  'sliding window': 'sliding-window',
  'prefix sum': 'prefix-sums',
  'binary search': 'binary-search',
  sorting: 'sorting',
  stack: 'stacks',
  'monotonic stack': 'stacks',
  'heap (priority queue)': 'heaps',
  'linked list': 'linked-lists',
  tree: 'trees',
  'binary tree': 'trees',
  'binary search tree': 'trees',
  trie: 'tries',
  graph: 'graphs',
  'depth-first search': 'graphs',
  'breadth-first search': 'graphs',
  'shortest path': 'shortest-paths',
  'union find': 'union-find',
  'topological sort': 'topological-sort',
  'dynamic programming': 'dynamic-programming',
  memoization: 'dynamic-programming',
  greedy: 'greedy',
  backtracking: 'backtracking',
  'bit manipulation': 'bit-manipulation',
  bitmask: 'bit-manipulation',
  math: 'math',
  'number theory': 'math',
  combinatorics: 'math',
  string: 'strings',
  'string matching': 'strings',
  'segment tree': 'range-queries',
  'binary indexed tree': 'range-queries',
  geometry: 'geometry',
  simulation: 'implementation',
};

export const leetcodeAdapter: PlatformAdapter = {
  platform: 'leetcode',
  label: 'LeetCode',

  parseUrl(url) {
    if (!LEETCODE_HOSTS.includes(url.hostname)) return null;
    // /problems/<slug>[/anything] or /contest/<contest>/problems/<slug>[/].
    const match = /^\/(?:contest\/[^/]+\/)?problems\/([^/]+)/.exec(url.pathname);
    const slug = match?.[1]?.toLowerCase();
    return slug && SLUG.test(slug) ? slug : null;
  },

  buildUrl(platformId) {
    return `https://leetcode.com/problems/${platformId}/`;
  },

  isValidId(platformId) {
    return SLUG.test(platformId);
  },

  normalizeDifficulty(raw) {
    return raw ? (DIFFICULTY[raw.trim().toLowerCase()] ?? null) : null;
  },

  mapTags(sourceTags) {
    return mapTagsWith(TAGS, sourceTags);
  },
};
