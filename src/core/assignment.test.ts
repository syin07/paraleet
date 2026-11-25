import { describe, expect, it } from 'vitest';
import { MAX_DUE_REVIEWS_SHOWN, chooseDailyProblem, otherDueReviews, swapCandidates } from './assignment';
import type { AssignmentInput, AssignmentReason, DueReview, PastAssignment } from './types';

const TODAY = '2026-11-25';
const D1 = '2026-11-24';
const D2 = '2026-11-23';
const D3 = '2026-11-22';

function input(overrides: Partial<AssignmentInput> = {}): AssignmentInput {
  return { today: TODAY, dueReviews: [], recentAssignments: [], planQueue: [], starterQueue: [], ...overrides };
}

function past(day: string, reason: AssignmentReason): PastAssignment {
  return { day, reason };
}

function review(problemId: number, dueDay: string): DueReview {
  return { problemId, dueDay };
}

function threeReviewDays(): PastAssignment[] {
  return [past(D1, 'review'), past(D2, 'review'), past(D3, 'review')];
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe('chooseDailyProblem order', () => {
  it('picks the most overdue review first', () => {
    const choice = chooseDailyProblem(
      input({
        dueReviews: [review(10, D1), review(11, D3), review(12, D2)],
        planQueue: [20],
        starterQueue: [30],
      }),
    );
    expect(choice).toEqual({ kind: 'assigned', problemId: 11, reason: 'review' });
  });

  it('picks a review that became due today', () => {
    const choice = chooseDailyProblem(input({ dueReviews: [review(10, TODAY)], planQueue: [20] }));
    expect(choice).toEqual({ kind: 'assigned', problemId: 10, reason: 'review' });
  });

  it('picks the next plan problem when no review is due', () => {
    const choice = chooseDailyProblem(input({ planQueue: [20, 21], starterQueue: [30] }));
    expect(choice).toEqual({ kind: 'assigned', problemId: 20, reason: 'plan' });
  });

  it('picks the next starter problem when there is no review and no plan', () => {
    const choice = chooseDailyProblem(input({ starterQueue: [30, 31] }));
    expect(choice).toEqual({ kind: 'assigned', problemId: 30, reason: 'starter' });
  });

  it('assigns nothing when none of the three has anything', () => {
    expect(chooseDailyProblem(input())).toEqual({ kind: 'none' });
  });

  it('never returns the reason user_swap', () => {
    const choices = [
      chooseDailyProblem(input({ dueReviews: [review(1, D1)] })),
      chooseDailyProblem(input({ planQueue: [2] })),
      chooseDailyProblem(input({ starterQueue: [3] })),
    ];
    for (const choice of choices) {
      expect(choice.kind === 'assigned' && choice.reason).not.toBe('user_swap');
    }
  });
});

describe('ties and sloppy review input', () => {
  it('breaks ties between equally overdue reviews by the lower problem id, in any input order', () => {
    const a = chooseDailyProblem(input({ dueReviews: [review(9, D2), review(4, D2), review(7, D2)] }));
    const b = chooseDailyProblem(input({ dueReviews: [review(7, D2), review(9, D2), review(4, D2)] }));
    expect(a).toEqual({ kind: 'assigned', problemId: 4, reason: 'review' });
    expect(b).toEqual(a);
  });

  it('lists tied reviews by lower problem id', () => {
    const list = otherDueReviews(input({ dueReviews: [review(9, D2), review(4, D2), review(7, D1)] }), null);
    expect(list.map((r) => r.problemId)).toEqual([4, 9, 7]);
  });

  it('ignores a review that is not due yet', () => {
    const data = input({ dueReviews: [review(10, '2026-11-26')], planQueue: [20] });
    expect(chooseDailyProblem(data)).toEqual({ kind: 'assigned', problemId: 20, reason: 'plan' });
    expect(otherDueReviews(data, null)).toEqual([]);
  });

  it('ignores a not-yet-due review but still uses the due ones', () => {
    const data = input({ dueReviews: [review(10, '2026-11-30'), review(11, D1)] });
    expect(chooseDailyProblem(data)).toEqual({ kind: 'assigned', problemId: 11, reason: 'review' });
    expect(otherDueReviews(data, 11)).toEqual([]);
  });

  it('collapses duplicates of a problem, keeping the earliest due day', () => {
    const data = input({ dueReviews: [review(10, D1), review(10, D3), review(11, D2)] });
    expect(chooseDailyProblem(data)).toEqual({ kind: 'assigned', problemId: 10, reason: 'review' });
    expect(otherDueReviews(data, null)).toEqual([review(10, D3), review(11, D2)]);
  });

  it('does not throw on an unreadable due day', () => {
    const data = input({ dueReviews: [review(10, 'nonsense'), review(11, D1)] });
    expect(() => chooseDailyProblem(data)).not.toThrow();
    expect(chooseDailyProblem(data)).toEqual({ kind: 'assigned', problemId: 11, reason: 'review' });
  });

  it('treats a plan or starter problem that is also a due review as a review, never twice', () => {
    const data = input({ dueReviews: [review(20, D1)], planQueue: [20, 21], starterQueue: [20, 30] });
    expect(chooseDailyProblem(data)).toEqual({ kind: 'assigned', problemId: 20, reason: 'review' });
    expect(swapCandidates(data, 20)).toEqual({ reviews: [], plan: [21] });
  });

  it('skips a due review in the plan queue and the starter queue when choosing them', () => {
    // Reached via the 3-day rule: the review is today's only review but the plan skips it.
    const viaRule = input({
      dueReviews: [review(20, D1)],
      recentAssignments: threeReviewDays(),
      planQueue: [20, 21],
    });
    expect(chooseDailyProblem(viaRule)).toEqual({ kind: 'assigned', problemId: 21, reason: 'plan' });
    // A review that is not due yet is not skipped.
    const notDue = input({ dueReviews: [review(30, '2026-12-01')], starterQueue: [30, 31] });
    expect(chooseDailyProblem(notDue)).toEqual({ kind: 'assigned', problemId: 30, reason: 'starter' });
  });
});

describe('the 3-day review rule', () => {
  const due = [review(10, D1), review(11, D2)];

  it('gives the slot to the plan after exactly three review days, with reviews still due', () => {
    const data = input({ dueReviews: due, recentAssignments: threeReviewDays(), planQueue: [20, 21] });
    expect(chooseDailyProblem(data)).toEqual({ kind: 'assigned', problemId: 20, reason: 'plan' });
  });

  it('still lists the due reviews after the plan problem is picked', () => {
    const data = input({ dueReviews: due, recentAssignments: threeReviewDays(), planQueue: [20] });
    expect(otherDueReviews(data, 20)).toEqual([review(11, D2), review(10, D1)]);
  });

  it('does not fire with only two review days', () => {
    const data = input({
      dueReviews: due,
      recentAssignments: [past(D1, 'review'), past(D2, 'review')],
      planQueue: [20],
    });
    expect(chooseDailyProblem(data)).toEqual({ kind: 'assigned', problemId: 11, reason: 'review' });
  });

  it('does not fire when one of the three days has no entry (a gap)', () => {
    const data = input({
      dueReviews: due,
      recentAssignments: [past(D1, 'review'), past(D3, 'review'), past('2026-11-21', 'review')],
      planQueue: [20],
    });
    expect(chooseDailyProblem(data)).toEqual({ kind: 'assigned', problemId: 11, reason: 'review' });
  });

  it.each(['user_swap', 'plan', 'starter'] as const)('does not fire when a day among the three is %s', (reason) => {
    for (const odd of [D1, D2, D3]) {
      const recent = threeReviewDays().map((entry) => (entry.day === odd ? past(odd, reason) : entry));
      const data = input({ dueReviews: due, recentAssignments: recent, planQueue: [20] });
      expect(chooseDailyProblem(data)).toEqual({ kind: 'assigned', problemId: 11, reason: 'review' });
    }
  });

  it('does nothing when there is no active plan', () => {
    const data = input({ dueReviews: due, recentAssignments: threeReviewDays(), starterQueue: [30] });
    expect(chooseDailyProblem(data)).toEqual({ kind: 'assigned', problemId: 11, reason: 'review' });
  });

  it('gives the plan problem anyway when no review is due', () => {
    const data = input({ recentAssignments: threeReviewDays(), planQueue: [20], starterQueue: [30] });
    expect(chooseDailyProblem(data)).toEqual({ kind: 'assigned', problemId: 20, reason: 'plan' });
  });

  it('counts a shuffled list padded with older, same-day and later entries', () => {
    const recent = [
      past(TODAY, 'plan'),
      past('2026-11-26', 'starter'),
      past(D2, 'review'),
      past('2026-11-10', 'user_swap'),
      past(D3, 'review'),
      past(D1, 'review'),
      past('2026-11-21', 'plan'),
    ];
    const data = input({ dueReviews: due, recentAssignments: recent, planQueue: [20] });
    expect(chooseDailyProblem(data)).toEqual({ kind: 'assigned', problemId: 20, reason: 'plan' });
  });

  it('counts a day with several entries only when all of them are reviews', () => {
    const allReview = [...threeReviewDays(), past(D2, 'review')];
    const mixed = [...threeReviewDays(), past(D2, 'user_swap')];
    const plan = [20];
    expect(chooseDailyProblem(input({ dueReviews: due, recentAssignments: allReview, planQueue: plan }))).toEqual({
      kind: 'assigned',
      problemId: 20,
      reason: 'plan',
    });
    expect(chooseDailyProblem(input({ dueReviews: due, recentAssignments: mixed, planQueue: plan }))).toEqual({
      kind: 'assigned',
      problemId: 11,
      reason: 'review',
    });
  });

  it('works across a month boundary', () => {
    const data = input({
      today: '2026-12-02',
      dueReviews: [review(10, '2026-11-28')],
      recentAssignments: [past('2026-12-01', 'review'), past('2026-11-30', 'review'), past('2026-11-29', 'review')],
      planQueue: [20],
    });
    expect(chooseDailyProblem(data)).toEqual({ kind: 'assigned', problemId: 20, reason: 'plan' });
  });
});

describe('otherDueReviews', () => {
  const many = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => review(id, `2026-11-${String(10 + id)}`));

  it('holds at most 5, most overdue first', () => {
    const list = otherDueReviews(input({ dueReviews: [...many].reverse() }), null);
    expect(list).toHaveLength(MAX_DUE_REVIEWS_SHOWN);
    expect(list.map((r) => r.problemId)).toEqual([1, 2, 3, 4, 5]);
  });

  it('never includes today\'s problem and fills the list from the rest', () => {
    const data = input({ dueReviews: many });
    const choice = chooseDailyProblem(data);
    expect(choice).toEqual({ kind: 'assigned', problemId: 1, reason: 'review' });
    const list = otherDueReviews(data, 1);
    expect(list.map((r) => r.problemId)).toEqual([2, 3, 4, 5, 6]);
  });

  it('accepts null when nothing is assigned', () => {
    expect(otherDueReviews(input(), null)).toEqual([]);
    expect(otherDueReviews(input({ dueReviews: [review(3, D1)] }), null)).toEqual([review(3, D1)]);
  });

  it('returns only entries of problemId and dueDay', () => {
    const list = otherDueReviews(input({ dueReviews: [{ ...review(3, D1), extra: 1 } as DueReview] }), null);
    expect(list).toEqual([{ problemId: 3, dueDay: D1 }]);
  });

  it('never reports how many reviews are beyond the 5 shown', () => {
    const small = input({ dueReviews: many.slice(0, 6) });
    const big = input({ dueReviews: many });
    expect(otherDueReviews(small, null)).toEqual(otherDueReviews(big, null));
    expect(swapCandidates(small, null)).toEqual(swapCandidates(big, null));
    for (const output of [otherDueReviews(big, null), swapCandidates(big, null), chooseDailyProblem(big)]) {
      const keys = JSON.stringify(output, (_key, value: unknown) => value);
      expect(keys).not.toMatch(/count|total|more|overdue|remaining|extra/i);
    }
  });
});

describe('swapCandidates', () => {
  it('holds the other due reviews and the first 5 plan problems', () => {
    const data = input({
      dueReviews: [review(10, D2), review(11, D1)],
      planQueue: [20, 21, 22, 23, 24, 25, 26],
      starterQueue: [30],
    });
    expect(swapCandidates(data, 10)).toEqual({ reviews: [review(11, D1)], plan: [20, 21, 22, 23, 24] });
  });

  it('matches otherDueReviews for the reviews', () => {
    const data = input({ dueReviews: [3, 2, 1, 4, 5, 6, 7].map((id) => review(id, D1)) });
    expect(swapCandidates(data, 1).reviews).toEqual(otherDueReviews(data, 1));
    expect(swapCandidates(data, 1).reviews).toHaveLength(MAX_DUE_REVIEWS_SHOWN);
  });

  it('leaves plan empty without an active plan and never offers starter problems', () => {
    const data = input({ dueReviews: [review(10, D1)], starterQueue: [30, 31] });
    expect(swapCandidates(data, null)).toEqual({ reviews: [review(10, D1)], plan: [] });
  });

  it('leaves out today\'s problem when it is the plan problem', () => {
    const data = input({ planQueue: [20, 21, 22] });
    const choice = chooseDailyProblem(data);
    expect(choice).toEqual({ kind: 'assigned', problemId: 20, reason: 'plan' });
    expect(swapCandidates(data, 20)).toEqual({ reviews: [], plan: [21, 22] });
  });

  it('leaves out today\'s problem when it is a starter problem', () => {
    const data = input({ starterQueue: [30, 31] });
    expect(swapCandidates(data, 30)).toEqual({ reviews: [], plan: [] });
  });

  it('is empty when nothing is assigned and nothing is available', () => {
    expect(swapCandidates(input(), null)).toEqual({ reviews: [], plan: [] });
  });

  it('does not offer a plan problem that is already listed as a review', () => {
    const data = input({ dueReviews: [review(10, D2), review(21, D1)], planQueue: [20, 21, 22] });
    expect(swapCandidates(data, 10)).toEqual({ reviews: [review(21, D1)], plan: [20, 22] });
  });
});

describe('purity', () => {
  const data = input({
    dueReviews: [review(10, D1), review(10, D2), review(11, D2), review(12, '2026-12-01')],
    recentAssignments: threeReviewDays(),
    planQueue: [20, 21],
    starterQueue: [30],
  });

  it('works on deep-frozen input', () => {
    const frozen = deepFreeze(structuredClone(data));
    expect(() => chooseDailyProblem(frozen)).not.toThrow();
    expect(() => otherDueReviews(frozen, 20)).not.toThrow();
    expect(() => swapCandidates(frozen, 20)).not.toThrow();
  });

  it('does not change its input', () => {
    const before = structuredClone(data);
    chooseDailyProblem(data);
    otherDueReviews(data, null);
    swapCandidates(data, null);
    expect(data).toEqual(before);
  });

  it('gives the same output for the same input, twice', () => {
    expect(chooseDailyProblem(data)).toEqual(chooseDailyProblem(data));
    expect(otherDueReviews(data, 20)).toEqual(otherDueReviews(data, 20));
    expect(swapCandidates(data, 20)).toEqual(swapCandidates(data, 20));
  });

  it('depends on the day passed in, not on the clock', () => {
    const noReviews = input({ dueReviews: [review(10, '2026-11-26')] });
    expect(chooseDailyProblem(noReviews)).toEqual({ kind: 'none' });
    expect(chooseDailyProblem({ ...noReviews, today: '2026-11-26' })).toEqual({
      kind: 'assigned',
      problemId: 10,
      reason: 'review',
    });
  });
});
