import type { TopicId } from '../core/topics';
import { hostnameOf, plainNumber } from './host';
import { mapTagsWith } from './tags';
import type { PlatformAdapter } from './types';

export const CSES_HOSTS: readonly string[] = ['cses.fi', 'www.cses.fi'];

// No leading zeros and not zero, so one task has one ID.
const ID = /^[1-9]\d*$/;
// The task page and its sibling pages (stats, submit, ...) all name the same task.
const PATH = /^\/problemset\/(?:task|stats|submit|hack|model|view)\/(\d+)\/?$/;

// CSES's own section names (lower case), read from https://cses.fi/problemset/. "General",
// "Advanced Techniques", "Interactive Problems" and the two "Additional Problems" sections have no
// single topic, so they map to nothing.
export const CSES_TAGS: Record<string, TopicId | readonly TopicId[]> = {
  'introductory problems': 'implementation',
  'sorting and searching': ['sorting', 'binary-search'],
  'dynamic programming': 'dynamic-programming',
  'graph algorithms': 'graphs',
  'range queries': 'range-queries',
  'tree algorithms': 'trees',
  mathematics: 'math',
  'string algorithms': 'strings',
  geometry: 'geometry',
  'sliding window problems': 'sliding-window',
  'bitwise operations': 'bit-manipulation',
  'construction problems': 'implementation',
  'advanced graph problems': 'graphs',
  'counting problems': 'math',
};

export const csesAdapter: PlatformAdapter = {
  platform: 'cses',
  label: 'CSES',

  parseUrl(url) {
    if (!CSES_HOSTS.includes(hostnameOf(url))) return null;
    const digits = PATH.exec(url.pathname)?.[1];
    return digits === undefined ? null : plainNumber(digits);
  },

  /** Call `isValidId` first: a malformed ID gives a meaningless link, not an error. */
  buildUrl(platformId) {
    return `https://cses.fi/problemset/task/${platformId}`;
  },

  isValidId(platformId) {
    return ID.test(platformId);
  },

  // CSES publishes no difficulty.
  normalizeDifficulty() {
    return null;
  },

  mapTags(sourceTags) {
    return mapTagsWith(CSES_TAGS, sourceTags);
  },
};
