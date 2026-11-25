// The one interface every platform sits behind (PRD section 8). Owned by the lead: do not change
// without the lead's say.
import type { TopicId } from '../core/topics';
import type { DifficultyNorm, Platform } from '../core/types';
import type { VerificationResult } from '../core/verify';

export interface VerifyRequest {
  platformId: string;
  /** The user's handle on the platform. */
  handle: string;
  /** Only solves at or after this instant count. */
  since: Date;
}

export interface PlatformAdapter {
  readonly platform: Platform;
  /** Display name: "LeetCode", "CSES", "Codeforces", "Other". */
  readonly label: string;

  /** The problem's ID when `url` is a problem page on this platform, otherwise null. */
  parseUrl(url: URL): string | null;

  /** The canonical problem link for an ID. `parseUrl(new URL(buildUrl(id)))` gives `id` back. */
  buildUrl(platformId: string): string;

  /** True when `platformId` is well-formed for this platform. */
  isValidId(platformId: string): boolean;

  /** Maps the platform's own difficulty (`Easy`, `1500`, ...) to 1 (easiest) through 5, or null when unknown. */
  normalizeDifficulty(raw: string | null): DifficultyNorm | null;

  /** Maps the platform's tags onto the app's fixed topic list. Unknown tags map to nothing. */
  mapTags(sourceTags: readonly string[]): TopicId[];

  /** Checks a solve with the platform. Part of the interface, not implemented in v1. */
  verify?(request: VerifyRequest): Promise<VerificationResult>;
}

export type RecognizedUrl =
  | { ok: true; platform: Platform; platformId: string; canonicalUrl: string }
  | { ok: false; reason: string };
