import type { DifficultyNorm } from '../core/types';
import type { PlatformAdapter } from './types';

const DIFFICULTY: Record<string, DifficultyNorm> = { easy: 1, medium: 3, hard: 5 };

function isTrackingParam(pair: string): boolean {
  const key = (pair.split('=')[0] ?? '').toLowerCase();
  return key.startsWith('utm_') || key === 'fbclid' || key === 'gclid' || key === 'ref';
}

/**
 * The cleaned-up form of an http(s) link, or null for anything else. Some judges name the problem in
 * the query, so the query stays (in its original order) minus tracking parameters. Credentials are
 * dropped so a pasted link never stores a password.
 */
export function cleanUrl(url: URL): string | null {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const host = url.host.replace(/^www\./, '');
  if (!host) return null;
  const path = url.pathname.replace(/\/+$/, '');
  const pairs = url.search
    .slice(1)
    .split('&')
    .filter((pair) => pair !== '' && !isTrackingParam(pair));
  const query = pairs.length > 0 ? `?${pairs.join('&')}` : '';
  return `${url.protocol}//${host}${path}${query}`;
}

export const otherAdapter: PlatformAdapter = {
  platform: 'other',
  label: 'Other',

  parseUrl(url) {
    return cleanUrl(url);
  },

  // For "Other" the ID is the link itself.
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
    return raw ? (DIFFICULTY[raw.trim().toLowerCase()] ?? null) : null;
  },

  mapTags() {
    return [];
  },
};
