// Platform registry and URL recognition (PRD section 8).
import type { Platform } from '../core/types';
import { CODEFORCES_HOSTS, codeforcesAdapter } from './codeforces';
import { CSES_HOSTS, csesAdapter } from './cses';
import { hasWellFormedHost, hostnameOf } from './host';
import { LEETCODE_HOSTS, leetcodeAdapter } from './leetcode';
import { otherAdapter } from './other';
import type { PlatformAdapter, RecognizedUrl } from './types';

export type { PlatformAdapter, RecognizedUrl, VerifyRequest } from './types';
export { leetcodeAdapter, csesAdapter, codeforcesAdapter, otherAdapter };

const ADAPTERS: Record<Platform, PlatformAdapter> = {
  leetcode: leetcodeAdapter,
  cses: csesAdapter,
  codeforces: codeforcesAdapter,
  other: otherAdapter,
};

// The three real platforms, tried before "Other", with the hosts that count as their own site.
const REAL_PLATFORMS: readonly { adapter: PlatformAdapter; hosts: readonly string[] }[] = [
  { adapter: leetcodeAdapter, hosts: LEETCODE_HOSTS },
  { adapter: csesAdapter, hosts: CSES_HOSTS },
  { adapter: codeforcesAdapter, hosts: CODEFORCES_HOSTS },
];

/** The adapter for a platform, or null when it has none. */
export function adapterFor(platform: Platform): PlatformAdapter | null {
  return ADAPTERS[platform] ?? null;
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  leetcode: 'LeetCode',
  cses: 'CSES',
  codeforces: 'Codeforces',
  other: 'Other',
};

const NOT_A_LINK: RecognizedUrl = { ok: false, reason: 'That does not look like a link. Paste the full problem URL.' };

/**
 * For scheme-less input only: "e.g.", "..." and "3.14" contain a dot but are not addresses (and
 * `URL` would turn numbers into IP addresses). Needs non-empty labels and an alphabetic last label.
 */
function looksLikeAddress(text: string): boolean {
  let authority = (text.split(/[/?#]/)[0] ?? '').replace(/^.*@/, '').replace(/:\d*$/, '');
  while (authority.endsWith('.')) authority = authority.slice(0, -1);
  const labels = authority.split('.');
  if (labels.some((label) => label === '')) return false;
  return /^(?:[a-z]{2,}|xn--[a-z0-9-]+)$/i.test(labels[labels.length - 1]!);
}

/**
 * Works out which platform and problem a pasted link points at.
 *
 * Every accepted result is checked to be a fixed point before it is returned: its ID is valid for
 * its adapter, its canonical link is an http(s) link, and recognizing that canonical link gives the
 * very same result. So one problem has one identity by construction, whatever oddities the URL
 * parser allows. An input that cannot meet this is not a usable link and is rejected.
 */
export function recognizeUrl(text: string): RecognizedUrl {
  const first = recognizeOnce(text);
  if (!first.ok) return first;
  const again = recognizeOnce(first.canonicalUrl);
  const stable =
    again.ok &&
    again.platform === first.platform &&
    again.platformId === first.platformId &&
    again.canonicalUrl === first.canonicalUrl;
  const valid = ADAPTERS[first.platform].isValidId(first.platformId);
  return stable && valid && /^https?:\/\//.test(first.canonicalUrl) ? first : NOT_A_LINK;
}

function recognizeOnce(text: string): RecognizedUrl {
  let trimmed = text.trim();
  if (trimmed === '' || /\s/.test(trimmed)) return NOT_A_LINK;
  // "example.com/x" has no scheme; "example.com:8080/x" must not be mistaken for one.
  const hasScheme = /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(trimmed);
  if (!hasScheme && trimmed.includes('.')) {
    if (!looksLikeAddress(trimmed)) return NOT_A_LINK;
    trimmed = `https://${trimmed}`;
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return NOT_A_LINK;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'Only http and https links are supported.' };
  }
  // Applies with or without a scheme: a host with an empty label can never open.
  if (!hasWellFormedHost(url)) return NOT_A_LINK;
  for (const { adapter } of REAL_PLATFORMS) {
    const platformId = adapter.parseUrl(url);
    if (platformId !== null) {
      return { ok: true, platform: adapter.platform, platformId, canonicalUrl: adapter.buildUrl(platformId) };
    }
  }
  const site = REAL_PLATFORMS.find(({ hosts }) => hosts.includes(hostnameOf(url)));
  if (site) {
    return {
      ok: false,
      reason: `That is a ${site.adapter.label} link, but not a problem page. Open the problem and paste its link.`,
    };
  }
  const platformId = otherAdapter.parseUrl(url);
  if (platformId === null) return NOT_A_LINK;
  return { ok: true, platform: 'other', platformId, canonicalUrl: otherAdapter.buildUrl(platformId) };
}
