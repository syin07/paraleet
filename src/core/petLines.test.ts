import { describe, expect, it } from 'vitest';
import { addDays, daysBetween } from './day';
import { LINES, MAX_LINE_LENGTH, fillTemplate, pickLine, type LineContext } from './petLines';
import { MOODS, type Mood } from './types';

const LONG_TITLE = 'Find Minimum Number of Operations to Make Every Element of a Very Long Array Equal';

function context(overrides: Partial<LineContext> = {}): LineContext {
  return {
    seed: 12345,
    today: '2026-01-15',
    mood: 'peckish',
    problemTitle: 'Two Sum',
    platformLabel: 'LeetCode',
    streak: 5,
    ...overrides,
  };
}

const templates = MOODS.flatMap((mood) => LINES[mood].map((template) => ({ mood, template })));

describe('LINES pools', () => {
  it('has enough templates per mood', () => {
    for (const mood of ['content', 'peckish', 'hungry', 'missed_you'] as const) {
      expect(LINES[mood].length).toBeGreaterThanOrEqual(8);
    }
    for (const mood of ['sleeping', 'checking', 'eating', 'nibbling'] as const) {
      expect(LINES[mood].length).toBeGreaterThanOrEqual(4);
    }
  });

  it('has unfed templates both with and without the problem', () => {
    for (const mood of ['peckish', 'hungry'] as const) {
      const withProblem = LINES[mood].filter((t) => t.includes('{title}'));
      const without = LINES[mood].filter((t) => !t.includes('{title}') && !t.includes('{platform}'));
      expect(withProblem.length).toBeGreaterThanOrEqual(2);
      expect(without.length).toBeGreaterThanOrEqual(6);
    }
  });

  it('keeps a template with no placeholder in both the even and the odd half of every pool', () => {
    for (const mood of MOODS) {
      for (const half of [0, 1]) {
        const plain = LINES[mood].filter((t, index) => index % 2 === half && !t.includes('{'));
        expect(plain.length, `${mood} half ${half}`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('spreads the placeholder templates over both halves', () => {
    for (const mood of ['peckish', 'hungry', 'content'] as const) {
      for (const marker of mood === 'content' ? ['{streak}'] : ['{title}']) {
        const halves = new Set(LINES[mood].flatMap((t, index) => (t.includes(marker) ? [index % 2] : [])));
        expect(halves.size, `${mood} ${marker}`).toBe(2);
      }
    }
  });

  it('has no duplicate templates within a mood', () => {
    for (const mood of MOODS) expect(new Set(LINES[mood]).size).toBe(LINES[mood].length);
  });

  it('only uses the known placeholders', () => {
    for (const { template } of templates) {
      for (const match of template.matchAll(/\{(\w+)\}/g)) {
        expect(['title', 'platform', 'streak']).toContain(match[1]);
      }
    }
  });

  it('only uses streak lines in the fed mood', () => {
    for (const { mood, template } of templates) {
      if (template.includes('{streak}')) expect(mood).toBe('content');
    }
  });
});

describe('every template, filled', () => {
  it.each(templates)('$mood: $template stays short with no placeholder left', ({ template, mood }) => {
    const long = fillTemplate(
      template,
      context({
        mood,
        problemTitle: LONG_TITLE,
        platformLabel: 'Codeforces',
        streak: 99999,
      }),
    );
    const short = fillTemplate(
      template,
      context({
        mood,
        problemTitle: 'Two Sum',
        platformLabel: 'Codeforces',
        streak: 12,
      }),
    );
    expect(long).not.toMatch(/\{|\}/);
    expect(long.length).toBeLessThanOrEqual(MAX_LINE_LENGTH);
    expect(short.length).toBeLessThanOrEqual(60);
  });

  it('cuts a long title with an ellipsis and keeps a short one whole', () => {
    const cut = fillTemplate('Fancy {title}? It is on {platform}.', context({ problemTitle: LONG_TITLE }));
    expect(cut).toContain('…');
    expect(cut.length).toBeLessThanOrEqual(MAX_LINE_LENGTH);
    expect(cut.endsWith('? It is on LeetCode.')).toBe(true);
    expect(fillTemplate('Fancy {title}?', context({ problemTitle: 'Two Sum' }))).toBe('Fancy Two Sum?');
  });

  it('keeps a short title whole', () => {
    for (let day = 0; day < 30; day += 1) {
      const text = pickLine(context({ mood: 'peckish', today: addDays('2026-01-01', day) })) as string;
      expect(text).not.toContain('…');
    }
  });
});

describe('voice: banned words', () => {
  const banned: RegExp[] = [
    /\bmissed\b/i,
    /\blate\b/i,
    /\bagain\?/i,
    /\bfinally\b/i,
    /where were you/i,
    /\boverdue\b/i,
    /\bbehind\b/i,
    /streak lost/i,
    /\bshould\b/i,
    /\bmust\b/i,
    /\bforgot\b/i,
    /\bdays?\b.*\bmissed\b/i,
    /\bwaiting\b/i,
    /\breviews?\b/i,
    /\bdue\b/i,
    /\bwhy\b/i,
    /\bdisappoint/i,
    /\bguilt/i,
    /\bsorry\b/i,
  ];

  it.each(templates)('$mood: $template', ({ mood, template }) => {
    // Pure delight at seeing the user is the one place "missed you" belongs.
    const text = mood === 'missed_you' ? template.replace(/\bmissed you\b/gi, 'ok') : template;
    for (const pattern of banned) expect(text).not.toMatch(pattern);
    // Digits only through the streak placeholder.
    expect(template.replaceAll('{streak}', '')).not.toMatch(/\d/);
  });

  it('keeps "missed you" out of every other mood', () => {
    for (const { mood, template } of templates) {
      if (mood !== 'missed_you') expect(template).not.toMatch(/missed/i);
    }
  });

  it('is one short sentence-ish line: no newlines, within 60 characters unfilled', () => {
    for (const { template } of templates) {
      expect(template).not.toMatch(/\n/);
      expect(template.replace(/\{title\}/g, '').length).toBeLessThanOrEqual(60);
    }
  });
});

describe('pickLine', () => {
  const seeds = [0, 1, 42, 99999, 4294967295];

  describe('never the same line two days running, whatever is eligible', () => {
    type Facts = Pick<LineContext, 'problemTitle' | 'platformLabel' | 'streak'>;
    const withProblem = { problemTitle: 'Two Sum', platformLabel: 'LeetCode' };
    const noProblem = { problemTitle: null, platformLabel: null };

    function check(name: string, factsFor: (seed: number, day: number) => Facts) {
      it(name, () => {
        for (const seed of seeds) {
          for (const mood of MOODS) {
            let previous: string | null = null;
            for (let day = 0; day < 365; day += 1) {
              const line = pickLine(context({ seed, mood, today: addDays('2026-01-01', day), ...factsFor(seed, day) }));
              expect(line, `${mood} seed ${seed} day ${day}`).not.toBeNull();
              expect(line, `${mood} seed ${seed} day ${day}`).not.toBe(previous);
              previous = line;
            }
          }
        }
      });
    }

    check('with the problem present and absent on alternate days', (_seed, day) => ({
      ...(day % 2 === 0 ? withProblem : noProblem),
      streak: 5,
    }));
    check('with the problem present on the odd days only', (_seed, day) => ({
      ...(day % 2 === 1 ? withProblem : noProblem),
      streak: 5,
    }));
    check('with the streak crossing 2 every day', (_seed, day) => ({ ...withProblem, streak: day % 2 === 0 ? 1 : 2 }));
    check('with a seeded irregular pattern of problem and streak', (seed, day) => {
      const bits = hashBits(seed, day);
      return { ...(bits & 1 ? withProblem : noProblem), streak: (bits >> 1) % 4 };
    });

    // A small integer mix, so the pattern is irregular but identical on every run.
    function hashBits(seed: number, day: number): number {
      let value = (seed ^ Math.imul(day + 1, 0x9e3779b1)) >>> 0;
      value = Math.imul(value ^ (value >>> 15), 0x85ebca6b) >>> 0;
      return (value ^ (value >>> 13)) >>> 0;
    }
  });

  it('treats a blank or whitespace-only problem title or platform like null', () => {
    for (const blank of ['', '   ', '\t\n']) {
      for (const mood of ['peckish', 'hungry'] as const) {
        for (let day = 0; day < 100; day += 1) {
          for (const facts of [
            { problemTitle: blank, platformLabel: 'LeetCode' },
            { problemTitle: 'Two Sum', platformLabel: blank },
            { problemTitle: blank, platformLabel: blank },
          ]) {
            const line = pickLine(context({ mood, today: addDays('2026-01-01', day), ...facts })) as string;
            expect(LINES[mood]).toContain(line);
          }
        }
      }
    }
  });

  it('lets the bird seed matter: different seeds differ on at least 25% of days, per mood', () => {
    for (const mood of MOODS) {
      // Only moods with at least two plain lines in each half can differ between seeds.
      const halves = [0, 1].map((h) => LINES[mood].filter((t, i) => i % 2 === h && !t.includes('{')).length);
      if (Math.min(...halves) < 2) continue;
      for (const [a, b] of [
        [1, 2],
        [100, 101],
        [7, 8],
      ] as const) {
        let different = 0;
        for (let day = 0; day < 365; day += 1) {
          const today = addDays('2026-01-01', day);
          const facts = { problemTitle: null, platformLabel: null, streak: 0 };
          if (
            pickLine(context({ mood, seed: a, today, ...facts })) !==
            pickLine(context({ mood, seed: b, today, ...facts }))
          )
            different += 1;
        }
        expect(different, `${mood} seeds ${a} and ${b}`).toBeGreaterThanOrEqual(365 * 0.25);
      }
    }
  });

  it('spreads picks: no line is chosen on more than 65% of the days it was a candidate', () => {
    const facts = { problemTitle: null, platformLabel: null, streak: 0 };
    for (const mood of MOODS) {
      for (const seed of seeds) {
        const candidateDays = new Map<string, number>();
        const pickedDays = new Map<string, number>();
        for (let day = 0; day < 365; day += 1) {
          const today = addDays('2026-01-01', day);
          const parity = ((daysBetween('1970-01-01', today) % 2) + 2) % 2;
          for (const [index, template] of LINES[mood].entries()) {
            if (index % 2 === parity && !template.includes('{')) {
              candidateDays.set(template, (candidateDays.get(template) ?? 0) + 1);
            }
          }
          const picked = pickLine(context({ mood, seed, today, ...facts })) as string;
          pickedDays.set(picked, (pickedDays.get(picked) ?? 0) + 1);
        }
        for (const [line, candidate] of candidateDays) {
          const halfSize = LINES[mood].filter(
            (t, i) => i % 2 === LINES[mood].indexOf(line) % 2 && !t.includes('{'),
          ).length;
          if (halfSize < 2) continue;
          const share = (pickedDays.get(line) ?? 0) / candidate;
          expect(share, `${mood} seed ${seed}: ${line}`).toBeLessThanOrEqual(0.65);
        }
      }
    }
  });

  it('is deterministic for the same context', () => {
    for (const mood of MOODS) {
      expect(pickLine(context({ mood }))).toBe(pickLine(context({ mood })));
    }
  });

  it('never repeats the previous day for 365 days, for several seeds and moods', () => {
    for (const seed of seeds) {
      for (const mood of MOODS) {
        let previous: string | null = null;
        for (let day = 0; day < 365; day += 1) {
          const line = pickLine(context({ seed, mood, today: addDays('2026-01-01', day) }));
          expect(line).not.toBeNull();
          expect(line).not.toBe(previous);
          previous = line;
        }
      }
    }
  });

  it('never repeats the previous day without a problem or a streak either', () => {
    for (const seed of seeds) {
      for (const mood of MOODS) {
        let previous: string | null = null;
        for (let day = 0; day < 120; day += 1) {
          const line = pickLine(
            context({
              seed,
              mood,
              problemTitle: null,
              platformLabel: null,
              streak: 0,
              today: addDays('2026-03-01', day),
            }),
          );
          expect(line).not.toBe(previous);
          previous = line;
        }
      }
    }
  });

  it('uses more than one template over time', () => {
    const seen = new Set<string | null>();
    for (let day = 0; day < 60; day += 1)
      seen.add(pickLine(context({ mood: 'content', today: addDays('2026-01-01', day) })));
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });

  it('respects eligibility: no problem means no {title} or {platform} template', () => {
    const problemLines = new Set(
      (['peckish', 'hungry'] as const).flatMap((mood) =>
        LINES[mood].filter((t) => t.includes('{title}') || t.includes('{platform}')),
      ),
    );
    expect(problemLines.size).toBeGreaterThan(0);
    for (const mood of ['peckish', 'hungry'] as const) {
      for (let day = 0; day < 200; day += 1) {
        for (const missing of [
          { problemTitle: null, platformLabel: null },
          { problemTitle: 'Two Sum', platformLabel: null },
          { problemTitle: null, platformLabel: 'CSES' },
        ]) {
          const line = pickLine(context({ mood, today: addDays('2026-01-01', day), ...missing })) as string;
          expect(line).not.toMatch(/\{|\}/);
          expect(line).not.toContain('Two Sum');
          expect(line).not.toContain('CSES');
          expect(LINES[mood].some((t) => !t.includes('{') && t === line)).toBe(true);
        }
      }
    }
  });

  it('uses problem templates when a problem is known', () => {
    let named = 0;
    for (let day = 0; day < 60; day += 1) {
      const line = pickLine(context({ mood: 'peckish', today: addDays('2026-01-01', day) })) as string;
      if (line.includes('Two Sum') && line.includes('LeetCode')) named += 1;
    }
    expect(named).toBeGreaterThan(0);
  });

  it('respects eligibility: no {streak} template under a streak of 2', () => {
    for (const streak of [0, 1]) {
      for (let day = 0; day < 200; day += 1) {
        const line = pickLine(
          context({
            mood: 'content',
            streak,
            today: addDays('2026-01-01', day),
          }),
        ) as string;
        expect(LINES.content).toContain(line);
      }
    }
  });

  it('names the streak on some days once it is 2 or more', () => {
    let named = 0;
    for (let day = 0; day < 60; day += 1) {
      const line = pickLine(
        context({
          mood: 'content',
          streak: 12,
          today: addDays('2026-01-01', day),
        }),
      ) as string;
      if (line.includes('12')) named += 1;
    }
    expect(named).toBeGreaterThan(0);
    // A streak of exactly 2 is the lowest that may be named.
    const lowest = Array.from({ length: 60 }, (_, day) =>
      pickLine(
        context({
          mood: 'content',
          streak: 2,
          today: addDays('2026-01-01', day),
        }),
      ),
    );
    expect(lowest.some((line) => line?.includes('2'))).toBe(true);
  });

  it('gives different seeds different lines on some days', () => {
    let different = 0;
    for (let day = 0; day < 60; day += 1) {
      const today = addDays('2026-01-01', day);
      if (pickLine(context({ seed: 1, today })) !== pickLine(context({ seed: 2, today }))) different += 1;
    }
    expect(different).toBeGreaterThan(5);
  });

  it('returns null when a mood has no usable template', () => {
    expect(pickLine(context({ mood: 'nonexistent' as Mood }))).toBeNull();
  });
});
