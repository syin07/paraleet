// Platform registry and URL recognition (PRD section 8).
import type { Platform } from '../core/types';
import { CODEFORCES_HOSTS, codeforcesAdapter } from './codeforces';
import { CSES_HOSTS, csesAdapter } from './cses';
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

/** Works out which platform and problem a pasted link points at. */
export function recognizeUrl(text: string): RecognizedUrl {
  let trimmed = text.trim();
  if (trimmed === '' || /\s/.test(trimmed)) return NOT_A_LINK;
  // "example.com/x" has no scheme; "example.com:8080/x" must not be mistaken for one.
  const hasScheme = /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(trimmed);
  if (!hasScheme && trimmed.includes('.')) trimmed = `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return NOT_A_LINK;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'Only http and https links are supported.' };
  }
  for (const { adapter } of REAL_PLATFORMS) {
    const platformId = adapter.parseUrl(url);
    if (platformId !== null) {
      return { ok: true, platform: adapter.platform, platformId, canonicalUrl: adapter.buildUrl(platformId) };
    }
  }
  const site = REAL_PLATFORMS.find(({ hosts }) => hosts.includes(url.hostname));
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
