// The verification seam (PRD section 4). Every reported attempt passes through `verifyAttempt`
// before the pet is fed. v1 always trusts the user's word. Later versions can check a platform
// here without touching the pet or the scheduler.
import type { IsoInstant, Platform, Rating, VerificationMethod } from './types';

export interface AttemptReport {
  problemId: number;
  platform: Platform;
  platformId: string;
  rating: Rating;
  attemptedAt: IsoInstant;
}

export interface VerificationResult {
  accepted: boolean;
  method: VerificationMethod;
  /** Shown to the user when `accepted` is false. */
  reason?: string;
}

export async function verifyAttempt(_report: AttemptReport): Promise<VerificationResult> {
  return { accepted: true, method: 'self_report' };
}
