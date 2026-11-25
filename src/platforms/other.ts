import type { DifficultyNorm } from '../core/types';
import { hostnameOf, lookupDifficulty } from './host';
import type { PlatformAdapter } from './types';

const DIFFICULTY: Record<string, DifficultyNorm> = { easy: 1, medium: 3, hard: 5 };

function isTrackingParam(pair: string): boolean {
  const key = (pair.split('=')[0] ?? '').toLowerCase();
  return key.startsWith('utm_') || key === 'fbclid' || key === 'gclid' || key === 'ref';
}

/**
 * The cleaned-up form of an http(s) link, or null for anything else. Some judges name the problem in
 * the query, so the query stays (in its original order) minus tracking parameters. Credentials are
 * dropped so a pasted link never stores a password. A trailing dot on the host is dropped too.
 */
export function cleanUrl(url: URL): string | null {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const hostname = hostnameOf(url);
  if (!hostname) return null;
  const host = url.port ? `${hostname}:${url.port}` : hostname;
  let end = url.pathname.length;
  while (end > 0 && url.pathname[end - 1] === '/') end--;
  const path = url.pathname.slice(0, end);
  const pairs = url.search
    .slice(1)
    .split('&')
    .filter((pair) => pair !== '' && !isTrackingParam(pair));
  const query = pairs.length > 0 ? `?${pairs.join('&')}` : '';
  // A fragment that starts with #/ or #! is a route on judges that serve one page, so it names the problem.
  const fragment = url.hash.startsWith('#/') || url.hash.startsWith('#!') ? url.hash : '';
  return `${url.protocol}//${host}${path}${query}${fragment}`;
}

export const otherAdapter: PlatformAdapter = {
  platform: 'other',
  label: 'Other',

  parseUrl(url) {
    return cleanUrl(url);
  },

  // For "Other" the ID is the link itself.
  /** Call `isValidId` first: a malformed ID gives a meaningless link, not an error. */
  buildUrl(platformId) {
    return platformId;
  },

  isValidId(platformId) {
    let url: URL;
    try {
      url = new URL(platformId);
    } catch {
      return false;
    }
    return cleanUrl(url) === platformId;
  },

  normalizeDifficulty(raw) {
    return lookupDifficulty(DIFFICULTY, raw);
  },

  mapTags() {
    return [];
  },
};
