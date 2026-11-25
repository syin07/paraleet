import { describe, expect, it } from 'vitest';
import {
  CANDIDATES_PER_TOPIC,
  isPlanFinished,
  planProgress,
  planQueue,
  recomputeItemStates,
  selectCandidates,
  validatePlanRequest,
  validatePlanResponse,
  type PlanCandidate,
  type PlanItemProgress,
  type PlanRequest,
} from './plan';
import type { TopicId } from './topics';
import type { DifficultyNorm, Platform } from './types';

let nextId = 1;
function candidate(overrides: Partial<PlanCandidate> = {}): PlanCandidate {
  const id = overrides.id ?? nextId++;
  return {
    id,
    platform: 'leetcode',
    title: `Problem ${id}`,
    difficultyRaw: 'Medium',
    difficultyNorm: 3,
    topics: ['binary-search'],
    sourceTags: ['Binary Search'],
    solvedCount: 1000,
    solved: false,
    ...overrides,
  };
}

/** A catalog slice: `count` problems per difficulty for one topic and platform. */
function pool(topic: TopicId, platform: Platform, count: number, startId: number): PlanCandidate[] {
  const out: PlanCandidate[] = [];
  let id = startId;
  for (const norm of [1, 2, 3, 4, 5] as DifficultyNorm[]) {
    for (let index = 0; index < count; index += 1) {
      out.push(
        candidate({ id: id++, platform, topics: [topic], difficultyNorm: norm, solvedCount: 100_000 - index * 10 }),
      );
    }
  }
  return out;
}

const request: PlanRequest = { topics: ['binary-search'], platforms: ['leetcode'], level: 'some', targetSize: 20 };

describe('selectCandidates', () => {
  const catalog = [
    ...pool('binary-search', 'leetcode', 40, 1),
    ...pool('binary-search', 'codeforces', 40, 1001),
    ...pool('graphs', 'leetcode', 40, 2001),
  ];

  it('only offers problems of the topic on the chosen platforms', () => {
    const chosen = selectCandidates(catalog, 'binary-search', { platforms: ['leetcode'], level: 'some' });
    expect(chosen).toHaveLength(CANDIDATES_PER_TOPIC);
    expect(chosen.every((problem) => problem.platform === 'leetcode' && problem.topics.includes('binary-search'))).toBe(
      true,
    );
    const both = selectCandidates(catalog, 'binary-search', { platforms: ['leetcode', 'codeforces'], level: 'some' });
    expect(new Set(both.map((problem) => problem.platform))).toEqual(new Set(['leetcode', 'codeforces']));
  });

  it('never offers the same problem twice, and is the same list every time', () => {
    const first = selectCandidates(catalog, 'binary-search', { platforms: ['leetcode', 'codeforces'], level: 'new' });
    const second = selectCandidates([...catalog].reverse(), 'binary-search', {
      platforms: ['codeforces', 'leetcode'],
      level: 'new',
    });
    expect(new Set(first.map((problem) => problem.id)).size).toBe(first.length);
    expect(second.map((problem) => problem.id)).toEqual(first.map((problem) => problem.id));
  });

  it('leans easier for a beginner and harder for someone comfortable', () => {
    const mean = (level: PlanRequest['level']): number => {
      const chosen = selectCandidates(catalog, 'binary-search', { platforms: ['leetcode'], level });
      return chosen.reduce((sum, problem) => sum + (problem.difficultyNorm ?? 0), 0) / chosen.length;
    };
    expect(mean('new')).toBeLessThan(mean('some'));
    expect(mean('some')).toBeLessThan(mean('comfortable'));
    // Every level still sees some of each end, so the model can build foundations and a challenge.
    for (const level of ['new', 'some', 'comfortable'] as const) {
      const norms = new Set(
        selectCandidates(catalog, 'binary-search', { platforms: ['leetcode'], level }).map((p) => p.difficultyNorm),
      );
      expect(norms.has(1)).toBe(true);
      expect(norms.has(4) || norms.has(5)).toBe(true);
    }
  });

  it('prefers the best-known problems within a difficulty', () => {
    const chosen = selectCandidates(catalog, 'binary-search', { platforms: ['leetcode'], level: 'some' });
    const easy = chosen.filter((problem) => problem.difficultyNorm === 1);
    const all = catalog.filter(
      (p) => p.platform === 'leetcode' && p.topics.includes('binary-search') && p.difficultyNorm === 1,
    );
    const leastKnownChosen = Math.min(...easy.map((problem) => problem.solvedCount ?? 0));
    const skipped = all.filter((problem) => !easy.includes(problem));
    expect(skipped.every((problem) => (problem.solvedCount ?? 0) <= leastKnownChosen)).toBe(true);
  });

  it('gives problems with no difficulty (CSES) a share, and everything when they are all there is', () => {
    const cses = Array.from({ length: 30 }, (_, index) =>
      candidate({
        id: 5000 + index,
        platform: 'cses',
        difficultyRaw: null,
        difficultyNorm: null,
        topics: ['binary-search'],
      }),
    );
    const mixed = selectCandidates([...catalog, ...cses], 'binary-search', {
      platforms: ['leetcode', 'cses'],
      level: 'some',
    });
    const unrated = mixed.filter((problem) => problem.difficultyNorm === null).length;
    expect(unrated).toBeGreaterThan(0);
    expect(unrated).toBeLessThan(mixed.length / 2);
    const only = selectCandidates(cses, 'binary-search', { platforms: ['cses'], level: 'some' });
    expect(only).toHaveLength(30);
  });

  it('returns what there is when the topic is thin, and nothing when it has no problems', () => {
    const thin = [
      candidate({ id: 9001, topics: ['tries'] }),
      candidate({ id: 9002, topics: ['tries'], difficultyNorm: 5 }),
    ];
    expect(selectCandidates(thin, 'tries', { platforms: ['leetcode'], level: 'new' }).map((p) => p.id)).toEqual([
      9001, 9002,
    ]);
    expect(selectCandidates(thin, 'geometry', { platforms: ['leetcode'], level: 'new' })).toEqual([]);
    expect(selectCandidates(thin, 'tries', { platforms: ['cses'], level: 'new' })).toEqual([]);
  });

  it('keeps already solved problems in the list, marked', () => {
    const withSolved = [
      ...catalog.slice(0, 10),
      candidate({ id: 7777, solved: true, difficultyNorm: 1, solvedCount: 999_999 }),
    ];
    const chosen = selectCandidates(withSolved, 'binary-search', { platforms: ['leetcode'], level: 'new' });
    expect(chosen.find((problem) => problem.id === 7777)?.solved).toBe(true);
  });
});

describe('validatePlanResponse', () => {
  const ids = Array.from({ length: 30 }, (_, index) => 101 + index);
  const candidates = new Map<TopicId, PlanCandidate[]>([
    ['binary-search', ids.map((id) => candidate({ id, topics: ['binary-search'] }))],
    ['graphs', [201, 202, 203, 204, 205, 206, 207, 208, 209, 210].map((id) => candidate({ id, topics: ['graphs'] }))],
  ]);
  const twoTopics: PlanRequest = { ...request, topics: ['binary-search', 'graphs'] };
  const good = {
    topics: [
      {
        topic: 'binary-search',
        foundations: [101, 102, 103],
        groups: [
          {
            name: 'Search on the answer',
            description: 'Guess a value, check if it is feasible.',
            problems: [104, 105, 106],
          },
          { name: 'Rotated arrays', description: 'Find which half is sorted first.', problems: [107, 108] },
        ],
        challenge: [109, 110],
      },
    ],
  };

  it('accepts a well-formed answer and returns its items in plan order', () => {
    const result = validatePlanResponse(good, request, candidates);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items.map((item) => item.problemId)).toEqual([101, 102, 103, 104, 105, 106, 107, 108, 109, 110]);
    expect(result.items.map((item) => item.stage)).toEqual([
      'foundations',
      'foundations',
      'foundations',
      'patterns',
      'patterns',
      'patterns',
      'patterns',
      'patterns',
      'challenge',
      'challenge',
    ]);
    expect(result.items[3]).toMatchObject({
      groupName: 'Search on the answer',
      groupDescription: 'Guess a value, check if it is feasible.',
    });
    expect(result.items[0]).toMatchObject({ groupName: null, groupDescription: null, topic: 'binary-search' });
  });

  it('rejects a problem that is not among the candidates (an invented one)', () => {
    const invented = structuredClone(good);
    invented.topics[0]!.foundations = [101, 102, 99999];
    const result = validatePlanResponse(invented, request, candidates);
    expect(result).toEqual({
      ok: false,
      errors: ['binary-search foundations: problem 99999 is not in the candidate list for "binary-search".'],
    });
  });

  it("rejects a problem borrowed from another topic's candidates", () => {
    const borrowed = structuredClone(good);
    borrowed.topics[0]!.challenge = [201];
    const result = validatePlanResponse(borrowed, request, candidates);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(' ')).toContain('problem 201 is not in the candidate list');
  });

  it('rejects a problem used twice, anywhere in the plan', () => {
    const twice = structuredClone(good);
    twice.topics[0]!.challenge = [101, 110];
    const result = validatePlanResponse(twice, request, candidates);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      'binary-search challenge: problem 101 is already used in binary-search foundations.',
    ]);
  });

  it('rejects a missing, repeated or unrequested topic', () => {
    expect(validatePlanResponse(good, twoTopics, candidates)).toEqual({
      ok: false,
      errors: ['The topic "graphs" is missing.'],
    });
    const repeated = { topics: [good.topics[0], good.topics[0]] };
    const again = validatePlanResponse(repeated, request, candidates);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.errors).toContain('The topic "binary-search" appears more than once.');
    const other = { topics: [{ ...good.topics[0]!, topic: 'heaps' }] };
    const unrequested = validatePlanResponse(other, request, candidates);
    expect(unrequested.ok).toBe(false);
    if (!unrequested.ok) {
      expect(unrequested.errors[0]).toContain('"heaps" is not one of the requested topics');
      expect(unrequested.errors).toContain('The topic "binary-search" is missing.');
    }
  });

  it('rejects stages in the wrong shape', () => {
    const cases: [string, (plan: typeof good) => void, string][] = [
      ['too few foundations', (plan) => (plan.topics[0]!.foundations = [101]), 'foundations has 1, needs at least 2'],
      [
        'too many foundations',
        (plan) => (plan.topics[0]!.foundations = [111, 112, 113, 114, 115, 116, 117]),
        'foundations has 7, at most 6',
      ],
      ['no groups', (plan) => (plan.topics[0]!.groups = []), 'pattern groups has 0, needs at least 1'],
      [
        'a one-problem group',
        (plan) => (plan.topics[0]!.groups[0]!.problems = [104]),
        'the group "Search on the answer" has 1, needs at least 2',
      ],
      [
        'too many challenge problems',
        (plan) => (plan.topics[0]!.challenge = [111, 112, 113, 114, 115]),
        'challenge has 5, at most 4',
      ],
    ];
    for (const [name, damage, message] of cases) {
      const plan = structuredClone(good);
      damage(plan);
      const result = validatePlanResponse(plan, request, candidates);
      expect(result.ok, name).toBe(false);
      if (!result.ok) expect(result.errors.join(' | '), name).toContain(message);
    }
  });

  it('rejects two groups with the same name', () => {
    const plan = structuredClone(good);
    plan.topics[0]!.groups[1]!.name = 'search on the answer';
    const result = validatePlanResponse(plan, request, candidates);
    expect(result.ok).toBe(false);
  });

  it('rejects anything that is not the expected shape, without throwing', () => {
    for (const raw of [
      null,
      undefined,
      'a plan',
      42,
      [],
      {},
      { topics: 'x' },
      { topics: [{ topic: 'binary-search' }] },
      { topics: [{ ...good.topics[0], foundations: ['101'] }] },
      { topics: [{ ...good.topics[0], foundations: [1.5, -2] }] },
    ]) {
      const result = validatePlanResponse(raw, request, candidates);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it('reports every problem at once, so one retry can fix them all', () => {
    const plan = structuredClone(good);
    plan.topics[0]!.foundations = [101, 99999];
    plan.topics[0]!.challenge = [88888, 104];
    const result = validatePlanResponse(plan, request, candidates);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toHaveLength(3);
  });

  it('orders topics as requested, whatever order the model used', () => {
    const graphs = {
      topic: 'graphs',
      foundations: [201, 202],
      groups: [{ name: 'Grid BFS', description: 'Treat cells as nodes.', problems: [203, 204] }],
      challenge: [],
    };
    const result = validatePlanResponse({ topics: [graphs, good.topics[0]] }, twoTopics, candidates);
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.items.map((item) => item.topic).filter((t, i, all) => all.indexOf(t) === i)).toEqual([
        'binary-search',
        'graphs',
      ]);
  });

  it('does not demand more problems than a thin topic has', () => {
    const thin = new Map<TopicId, PlanCandidate[]>([['tries', [candidate({ id: 301, topics: ['tries'] })]]]);
    const result = validatePlanResponse(
      { topics: [{ topic: 'tries', foundations: [301], groups: [], challenge: [] }] },
      { ...request, topics: ['tries'] },
      thin,
    );
    expect(result.ok).toBe(true);
  });

  it('never lets a problem outside the candidates through, for many damaged answers', () => {
    const allowed = new Set(ids);
    let state = 12345;
    const random = (): number => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    for (let round = 0; round < 500; round += 1) {
      const plan = structuredClone(good);
      const lists = [
        plan.topics[0]!.foundations,
        plan.topics[0]!.groups[0]!.problems,
        plan.topics[0]!.groups[1]!.problems,
        plan.topics[0]!.challenge,
      ];
      for (const list of lists) {
        for (let index = 0; index < list.length; index += 1) {
          if (random() < 0.3) list[index] = Math.floor(random() * 400);
        }
      }
      const result = validatePlanResponse(plan, request, candidates);
      if (result.ok) {
        const used = result.items.map((item) => item.problemId);
        expect(used.every((id) => allowed.has(id))).toBe(true);
        expect(new Set(used).size).toBe(used.length);
      }
    }
  });
});

describe('validatePlanRequest', () => {
  it('accepts a sensible request and explains what is wrong with a bad one', () => {
    expect(validatePlanRequest(request)).toEqual([]);
    expect(validatePlanRequest({ ...request, topics: [] })).toEqual(['Pick at least one topic.']);
    expect(validatePlanRequest({ ...request, platforms: [] })).toEqual(['Pick at least one platform.']);
    expect(validatePlanRequest({ ...request, topics: ['graphs', 'graphs'] })).toEqual(['A topic is listed twice.']);
    expect(validatePlanRequest({ ...request, topics: ['graphs', 'trees', 'heaps', 'tries', 'math'] })[0]).toContain(
      'at most 4',
    );
    for (const targetSize of [7, 31, 12.5, Number.NaN]) {
      expect(validatePlanRequest({ ...request, targetSize })).toHaveLength(1);
    }
  });
});

describe('a plan in use', () => {
  const item = (
    position: number,
    problemId: number,
    state: PlanItemProgress['state'],
    extra: Partial<PlanItemProgress> = {},
  ): PlanItemProgress => ({
    position,
    topic: 'binary-search',
    stage: 'foundations',
    groupName: null,
    problemId,
    state,
    ...extra,
  });

  it('queues pending problems in plan order', () => {
    const items = [item(2, 12, 'pending'), item(0, 10, 'done'), item(1, 11, 'pending'), item(3, 13, 'skipped')];
    expect(planQueue(items)).toEqual([11, 12]);
    expect(planQueue([])).toEqual([]);
  });

  it('is finished when nothing is pending, and an empty plan is never finished', () => {
    expect(isPlanFinished([item(0, 10, 'done'), item(1, 11, 'skipped')])).toBe(true);
    expect(isPlanFinished([item(0, 10, 'done'), item(1, 11, 'pending')])).toBe(false);
    expect(isPlanFinished([])).toBe(false);
  });

  it('recomputes each item from the attempts: done since activation, skipped if solved before', () => {
    const items = [
      item(0, 10, 'pending'),
      item(1, 11, 'pending'),
      item(2, 12, 'pending'),
      item(3, 13, 'skipped'),
      item(4, 14, 'done'),
    ];
    const states = recomputeItemStates(items, { before: new Set([11, 10]), since: new Set([10, 12]) });
    // 10 was attempted before and again since: done wins. 13 was skipped by hand and stays so.
    // 14 was stored as done but has no attempt: it goes back to pending.
    expect(states).toEqual(['done', 'skipped', 'done', 'skipped', 'pending']);
  });

  it('counts progress overall and per section, in plan order', () => {
    const items = [
      item(0, 10, 'done'),
      item(1, 11, 'pending'),
      item(2, 12, 'done', { stage: 'patterns', groupName: 'Search on the answer' }),
      item(3, 13, 'skipped', { stage: 'patterns', groupName: 'Search on the answer' }),
      item(4, 14, 'pending', { stage: 'patterns', groupName: 'Rotated arrays' }),
      item(5, 15, 'pending', { stage: 'challenge' }),
      item(6, 20, 'pending', { topic: 'graphs' }),
    ];
    const progress = planProgress(items);
    expect(progress.overall).toEqual({ total: 7, done: 2, skipped: 1, pending: 4 });
    expect(
      progress.sections.map((section) => [
        section.topic,
        section.stage,
        section.groupName,
        section.progress.done,
        section.progress.total,
      ]),
    ).toEqual([
      ['binary-search', 'foundations', null, 1, 2],
      ['binary-search', 'patterns', 'Search on the answer', 1, 2],
      ['binary-search', 'patterns', 'Rotated arrays', 0, 1],
      ['binary-search', 'challenge', null, 0, 1],
      ['graphs', 'foundations', null, 0, 1],
    ]);
  });
});
