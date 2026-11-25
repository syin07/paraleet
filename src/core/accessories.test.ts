import { describe, expect, it } from 'vitest';
import {
  earnedAccessories,
  mergeUnlocked,
  newlyUnlocked,
  unlockedAfterAttempt,
  type MilestoneFacts,
} from './accessories';
import type { AccessoryId, Rating } from './types';

const none: MilestoneFacts = {
  solvedHardProblem: false,
  longestStreak: 0,
  plansFinished: 0,
};
const facts = (overrides: Partial<MilestoneFacts>): MilestoneFacts => ({
  ...none,
  ...overrides,
});

describe('earnedAccessories', () => {
  it('earns nothing for a fresh install', () => {
    expect(earnedAccessories(none)).toEqual([]);
  });

  it('unlocks the scarf only once a Hard problem is solved', () => {
    expect(earnedAccessories(facts({ solvedHardProblem: true }))).toEqual(['scarf']);
    // Without the Hard-solve fact, a short streak alone does not unlock the scarf.
    expect(earnedAccessories(facts({ solvedHardProblem: false, longestStreak: 3 }))).toEqual([]);
  });

  it('unlocks the bow tie at a 7-day streak, not 6', () => {
    expect(earnedAccessories(facts({ longestStreak: 6 }))).toEqual([]);
    expect(earnedAccessories(facts({ longestStreak: 7 }))).toEqual(['bow_tie']);
  });

  it('unlocks the crown at 30 days, not 29, on top of the bow tie', () => {
    expect(earnedAccessories(facts({ longestStreak: 29 }))).toEqual(['bow_tie']);
    expect(earnedAccessories(facts({ longestStreak: 30 }))).toEqual(['bow_tie', 'crown']);
  });

  it('unlocks the graduation cap when the first plan is finished', () => {
    expect(earnedAccessories(facts({ plansFinished: 0 }))).toEqual([]);
    expect(earnedAccessories(facts({ plansFinished: 1 }))).toEqual(['grad_cap']);
    expect(earnedAccessories(facts({ plansFinished: 4 }))).toEqual(['grad_cap']);
  });

  it('lists everything in the fixed order', () => {
    expect(
      earnedAccessories({
        solvedHardProblem: true,
        longestStreak: 99,
        plansFinished: 2,
      }),
    ).toEqual(['scarf', 'bow_tie', 'crown', 'grad_cap']);
  });
});

describe('mergeUnlocked', () => {
  it('adds newly earned accessories to the stored ones', () => {
    expect(mergeUnlocked(['grad_cap'], facts({ longestStreak: 7 }))).toEqual(['bow_tie', 'grad_cap']);
  });

  it('never removes an accessory, even when the facts no longer earn it', () => {
    expect(mergeUnlocked(['crown', 'scarf'], none)).toEqual(['scarf', 'crown']);
  });

  it('returns the fixed order without duplicates', () => {
    expect(mergeUnlocked(['grad_cap', 'scarf', 'scarf'], facts({ solvedHardProblem: true }))).toEqual([
      'scarf',
      'grad_cap',
    ]);
  });

  it('returns an empty list when nothing is unlocked or earned', () => {
    expect(mergeUnlocked([], none)).toEqual([]);
  });
});

describe('newlyUnlocked', () => {
  it('returns what is in after and not in before', () => {
    expect(newlyUnlocked(['scarf'], ['scarf', 'bow_tie', 'grad_cap'])).toEqual(['bow_tie', 'grad_cap']);
  });

  it('is empty when nothing changed or something was removed', () => {
    expect(newlyUnlocked(['scarf'], ['scarf'])).toEqual([]);
    expect(newlyUnlocked(['scarf', 'crown'], ['scarf'])).toEqual([]);
    expect(newlyUnlocked([], [])).toEqual([]);
  });
});

describe('unlockedAfterAttempt', () => {
  const grown: Rating[] = ['hard', 'good', 'easy'];
  const milestones: Array<[string, MilestoneFacts, AccessoryId]> = [
    ['the scarf', facts({ solvedHardProblem: true }), 'scarf'],
    ['the bow tie at a 7-day streak', facts({ longestStreak: 7 }), 'bow_tie'],
    ['the crown at a 30-day streak', facts({ longestStreak: 30 }), 'crown'],
    ['the graduation cap', facts({ plansFinished: 1 }), 'grad_cap'],
  ];

  it.each(milestones)('Again unlocks nothing, then the next Good unlocks %s', (_name, earned, id) => {
    expect(unlockedAfterAttempt([], earned, 'again')).not.toContain(id);
    expect(unlockedAfterAttempt([], earned, 'good')).toContain(id);
  });

  it('Again with a longest streak of 7 returns the same list, in fixed order', () => {
    expect(unlockedAfterAttempt([], facts({ longestStreak: 7 }), 'again')).toEqual([]);
    expect(unlockedAfterAttempt(['grad_cap', 'scarf'], facts({ longestStreak: 7 }), 'again')).toEqual([
      'scarf',
      'grad_cap',
    ]);
  });

  it('the attempt after an Again picks up what the Again reached', () => {
    const reached = facts({ longestStreak: 30 });
    const afterAgain = unlockedAfterAttempt([], reached, 'again');
    expect(unlockedAfterAttempt(afterAgain, reached, 'good')).toEqual(['bow_tie', 'crown']);
  });

  it.each(grown)('a %s attempt unlocks what the facts have earned', (rating) => {
    expect(unlockedAfterAttempt([], { solvedHardProblem: true, longestStreak: 7, plansFinished: 1 }, rating)).toEqual([
      'scarf',
      'bow_tie',
      'grad_cap',
    ]);
  });

  it('Again never removes anything already unlocked', () => {
    expect(unlockedAfterAttempt(['crown', 'scarf'], none, 'again')).toEqual(['scarf', 'crown']);
    expect(unlockedAfterAttempt(['crown'], none, 'good')).toEqual(['crown']);
  });
});
