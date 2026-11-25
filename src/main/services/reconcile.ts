// Launch-time self-check. `attempts` is the source of truth (PRD section 10): the stored pet
// facts and the review cards are derived from it, so they can always be rebuilt from it.
import { newlyUnlocked, replayUnlocks } from '../../core/accessories';
import { recomputePetFacts } from '../../core/petFacts';
import { scheduleFirstAttempt, scheduleReview } from '../../core/scheduler';
import { ACCESSORY_IDS, type AccessoryId, type PetFacts, type ReviewCard } from '../../core/types';
import {
  listAttemptFacts,
  listAttemptsForProblem,
  listProblemsMissingCards,
  listUnlockAttempts,
} from '../../data/repos/attempts';
import { saveCard } from '../../data/repos/cards';
import { savePetFacts, saveUnlockedAccessories } from '../../data/repos/pet';
import { countFinishedPlans } from '../../data/repos/plans';
import { currentMoment, type AppContext } from './context';
import { knownAccessories } from './pet';
import { reconcileActivePlan } from './plans';
import { schedulerOptions } from './report';

export interface ReconcileResult {
  /** True when the stored streak or totals differed from the attempts and were corrected. */
  petFactsRepaired: boolean;
  /** How many review cards were rebuilt for problems that had attempts but no card. */
  cardsRebuilt: number;
  /** Accessories the attempts had earned that were not stored as unlocked, now added. */
  accessoriesRestored: AccessoryId[];
  /** Items of the active plan whose state differed from what the attempts say, now corrected. */
  planItemsCorrected: number;
}

function sameFacts(a: PetFacts, b: PetFacts): boolean {
  return (
    a.growthSolves === b.growthSolves &&
    a.totalAttempts === b.totalAttempts &&
    a.currentStreak === b.currentStreak &&
    a.longestStreak === b.longestStreak &&
    a.lastFedDay === b.lastFedDay
  );
}

/**
 * Makes the derived data agree with the attempts. Run once at launch. It never touches the
 * attempts themselves, and it changes nothing when everything already agrees.
 */
export function reconcile(ctx: AppContext): ReconcileResult {
  return ctx.db.transaction(() => {
    const moment = currentMoment(ctx);

    const recomputed = recomputePetFacts(listAttemptFacts(ctx.db));
    const petFactsRepaired = !sameFacts(moment.pet, recomputed);
    if (petFactsRepaired) savePetFacts(ctx.db, recomputed);

    // A database from before review cards existed has attempts with no card. Replay each
    // problem's attempts through the scheduler, oldest first, to give it the card it would have.
    const options = schedulerOptions(moment);
    const missing = listProblemsMissingCards(ctx.db);
    for (const problemId of missing) {
      let card: ReviewCard | null = null;
      for (const attempt of listAttemptsForProblem(ctx.db, problemId).reverse()) {
        const at = new Date(attempt.attemptedAt);
        card = card
          ? scheduleReview(card, attempt.rating, at, options)
          : scheduleFirstAttempt(problemId, attempt.rating, at, options);
      }
      if (card) saveCard(ctx.db, card, moment.now.toISOString());
    }

    // Accessories never go away, so this only ever adds: anything the attempts earned that is
    // not stored (a database from before accessories existed, or a lost write).
    const stored = knownAccessories(moment.pet.unlockedAccessories);
    // The active plan's progress first: finishing a plan is what earns the graduation cap.
    const planItemsCorrected = reconcileActivePlan(ctx, moment.now.toISOString());

    const earned = replayUnlocks(listUnlockAttempts(ctx.db), countFinishedPlans(ctx.db));
    const accessoriesRestored = newlyUnlocked(stored, earned);
    if (accessoriesRestored.length > 0) {
      saveUnlockedAccessories(ctx.db, ACCESSORY_IDS.filter((id) => stored.includes(id) || earned.includes(id)));
    }

    return { petFactsRepaired, cardsRebuilt: missing.length, accessoriesRestored, planItemsCorrected };
  });
}
