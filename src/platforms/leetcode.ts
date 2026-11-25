import type { TopicId } from '../core/topics';
import type { DifficultyNorm } from '../core/types';
import { hostnameOf, lookupDifficulty } from './host';
import { mapTagsWith } from './tags';
import type { PlatformAdapter } from './types';

/** LeetCode's own hosts; links there that are not problem pages are rejected, not treated as "Other". */
export const LEETCODE_HOSTS: readonly string[] = ['leetcode.com', 'www.leetcode.com', 'leetcode.cn', 'www.leetcode.cn'];

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const DIFFICULTY: Record<string, DifficultyNorm> = { easy: 1, medium: 3, hard: 5 };

function tagsFor(topic: TopicId, tags: string[]): Record<string, TopicId> {
  return Object.fromEntries(tags.map((tag) => [tag, topic]));
}

// LeetCode topic tag names (lowercased) to app topics. Left unmapped on purpose, because no topic
// fits: Design, Database, Concurrency, Shell, Interactive, Iterator, Data Stream, Queue, Recursion,
// Divide and Conquer, Ordered Set, Meet in the Middle.
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
  ...tagsFor('graphs', [
    'graph theory', 'directed acyclic graph', 'bipartite graph', 'strongly connected component', 'eulerian circuit',
    'eulerian path', 'eulerian graph', 'semi-eulerian graph', 'minimum spanning tree', 'biconnected component',
    'bridge (graph)', 'articulation point', 'flow network', 'maximum flow', 'minimum cut', 'minimum-cost flow',
    'matching (graph)', 'maximum matching', 'perfect matching', 'hamiltonian path', 'graph coloring', 'planar graph',
    "tarjan's scc algorithm", "kosaraju's algorithm", "kruskal's algorithm", "prim's algorithm",
    'borůvka\'s algorithm', "dinic's algorithm", 'edmonds–karp algorithm', 'push-relabel algorithm', 'mpm algorithm',
    'successive shortest path algorithm', 'hungarian algorithm', 'bidirectional search',
  ]),
  ...tagsFor('shortest-paths', [
    "dijkstra's algorithm", 'bellman–ford algorithm', 'floyd–warshall algorithm', '0-1 bfs', 'a* search',
    'k shortest path',
  ]),
  'union-find': 'union-find',
  ...tagsFor('math', [
    'greatest common divisor', 'euclidean algorithm', 'least common multiple', 'prime factorization', 'primality test',
    'sieve theory', 'prime number sieve', "fermat's little theorem", "euler's theorem", "euler's totient function",
    "bézout's lemma", 'extended euclidean algorithm', 'inclusion-exclusion principle', 'pigeonhole principle',
    'probability and statistics', 'game theory', 'impartial game', 'nim game', 'sprague–grundy theorem', 'minimax',
    'zero-sum game', 'brainteaser', 'linear algebra', "newton's method", 'rejection sampling', 'reservoir sampling',
    'randomized',
  ]),
  ...tagsFor('dynamic-programming', [
    'dp on trees', 'knapsack problem', '0-1 knapsack', 'complete knapsack', 'multiple knapsack', 'mixed knapsack',
    'longest increasing subsequence', 'longest common subsequence',
  ]),
  ...tagsFor('sorting', [
    'merge sort', 'counting sort', 'bucket sort', 'radix sort', 'quicksort', 'quickselect', 'bubble sort', 'timsort',
    'tournament sort', 'sort',
  ]),
  ...tagsFor('strings', [
    'z algorithm', 'knuth–morris–pratt algorithm', 'boyer–moore string-search algorithm', 'suffix array',
    'suffix automaton', 'suffix tree', 'manacher', 'lyndon factorization', 'lexicographically minimal string rotation',
    'palindromic tree', 'aho–corasick algorithm', 'bracket sequences',
  ]),
  ...tagsFor('arrays-hashing', ['hash function', 'rolling hash', 'boyer–moore majority vote algorithm']),
  ...tagsFor('trees', ['treap', 'cartesian tree', 'k-d tree', 'lowest common ancestor', 'binary lifting']),
  ...tagsFor('range-queries', [
    'sqrt decomposition', 'sparse table', 'range minimum/maximum query', 'li chao tree', 'persistent data structure',
  ]),
  ...tagsFor('geometry', ['convex hull', 'polygons', 'triangulation']),
  ...tagsFor('implementation', ['enumeration', 'brute-force search']),
  ...tagsFor('backtracking', ['algorithm x', 'dancing links', 'heuristic search']),
  ...tagsFor('binary-search', ['ternary search']),
  ...tagsFor('two-pointers', ["floyd's cycle finding algorithm"]),
  ...tagsFor('sliding-window', ['monotonic queue']),
  ...tagsFor('linked-lists', ['doubly-linked list']),
  ...tagsFor('intervals', ['sweep line']),
};

export const leetcodeAdapter: PlatformAdapter = {
  platform: 'leetcode',
  label: 'LeetCode',

  parseUrl(url) {
    if (!LEETCODE_HOSTS.includes(hostnameOf(url))) return null;
    // /problems/<slug>[/anything] or /contest/<contest>/problems/<slug>[/].
    const match = /^\/(?:contest\/[^/]+\/)?problems\/([^/]+)/.exec(url.pathname);
    const slug = match?.[1]?.toLowerCase();
    return slug && SLUG.test(slug) ? slug : null;
  },

  /** Call `isValidId` first: a malformed ID gives a meaningless link, not an error. */
  buildUrl(platformId) {
    return `https://leetcode.com/problems/${platformId}/`;
  },

  isValidId(platformId) {
    return SLUG.test(platformId);
  },

  normalizeDifficulty(raw) {
    return lookupDifficulty(DIFFICULTY, raw);
  },

  mapTags(sourceTags) {
    return mapTagsWith(TAGS, sourceTags);
  },
};
