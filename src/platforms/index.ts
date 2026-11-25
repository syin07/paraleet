// Platform registry and URL recognition. The CSES, Codeforces and "Other" adapters arrive in
// SAN-108; until then only LeetCode links are recognized.
import type { Platform } from '../core/types';
import { leetcodeAdapter } from './leetcode';
import type { PlatformAdapter, RecognizedUrl } from './types';

export type { PlatformAdapter, RecognizedUrl, VerifyRequest } from './types';
export { leetcodeAdapter } from './leetcode';

const ADAPTERS: Partial<Record<Platform, PlatformAdapter>> = {
  leetcode: leetcodeAdapter,
};

/** The adapter for a platform, or null when it has none yet. */
export function adapterFor(platform: Platform): PlatformAdapter | null {
  return ADAPTERS[platform] ?? null;
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  leetcode: 'LeetCode',
  cses: 'CSES',
  codeforces: 'Codeforces',
  other: 'Other',
};

/** Works out which platform and problem a pasted link points at. */
export function recognizeUrl(text: string): RecognizedUrl {
  const trimmed = text.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, reason: 'That does not look like a link. Paste the full problem URL.' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'Only http and https links are supported.' };
  }
  for (const adapter of Object.values(ADAPTERS)) {
    const platformId = adapter.parseUrl(url);
    if (platformId !== null) {
      return { ok: true, platform: adapter.platform, platformId, canonicalUrl: adapter.buildUrl(platformId) };
    }
  }
  return { ok: false, reason: 'This site is not supported yet.' };
}
