import type { DifficultyNorm } from '../core/types';
import { hostnameOf, lookupDifficulty } from './host';
import type { PlatformAdapter } from './types';

const DIFFICULTY: Record<string, DifficultyNorm> = { easy: 1, medium: 3, hard: 5 };

function isTrackingParam(pair: string): boolean {
  const key = (pair.split('=')[0] ?? '').toLowerCase();
  return key.startsWith('utm_') || key === 'fbclid' || key === 'gclid' || key === 'ref';
}

function cleanOnce(url: URL): string | null {
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

/**
 * The cleaned-up form of an http(s) link, or null for anything else. Some judges name the problem in
 * the query, so the query stays (in its original order) minus tracking parameters. Credentials are
 * dropped so a pasted link never stores a password. Trailing dots on the host are dropped too.
 *
 * The result is always a fixed point: cleaning it again gives the same string. A link whose
 * cleaned form would parse differently the second time (for example a numeric host that only
 * stopped being an IP address because of its trailing dots) has no stable identity, so it is
 * refused instead of being stored under an ID that changes.
 */
export function cleanUrl(url: URL): string | null {
  const cleaned = cleanOnce(url);
  if (cleaned === null) return null;
  let reparsed: URL;
  try {
    reparsed = new URL(cleaned);
  } catch {
    return null;
  }
  return cleanOnce(reparsed) === cleaned ? cleaned : null;
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
