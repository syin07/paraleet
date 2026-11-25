// What Para says (PRD section 6, "Voice"): short, warm, a little funny. Never guilt, never
// sarcasm about missed days, never a count of days missed or reviews waiting.
import { daysBetween } from './day';
import type { Mood, ParaDay } from './types';

export interface LineContext {
  seed: number; // the pet's seed, so two installs do not say the same thing on the same day
  today: ParaDay;
  mood: Mood;
  problemTitle: string | null; // today's problem, when one is assigned and not done
  platformLabel: string | null; // 'LeetCode', 'CSES', 'Codeforces', 'Other'
  streak: number; // the displayed streak
}

/** A filled line never exceeds this, however long the problem title is. */
export const MAX_LINE_LENGTH = 80;

/** Templates per mood. Placeholders: {title}, {platform}, {streak}. */
export const LINES: Readonly<Record<Mood, readonly string[]>> = {
  content: [
    'Full tummy. Life is good.',
    'Seeds: eaten. Smugness: loading.',
    'Thank you for the snack. You are my favorite human.',
    'I have preened. I look incredible.',
    'Chirp! That was a tasty problem.',
    'Nothing left to do but be a lovely bird.',
    'Today’s problem? Squashed. Nice work.',
    'Just you, me, and a very full belly.',
    '{streak} days in a row. I am one lucky bird.',
    'Day {streak} of us being brilliant.',
  ],
  peckish: [
    'Psst. A little problem would make a great snack.',
    'My tummy made a tiny chirp. Just saying.',
    'Any problem at all feeds me. No pressure.',
    'I could nibble a seed. Or a two-pointer.',
    'Whenever you are ready, I am right here.',
    'One small problem, one happy bird.',
    'I have been eyeing your keyboard hopefully.',
    'Snack o’clock, if you are free.',
    'Today’s snack: {title} on {platform}.',
    'Fancy {title}? It is on {platform}.',
    'I hear {title} is tasty. {platform}, whenever.',
  ],
  hungry: [
    'My tummy is doing a little dance. Help?',
    'Tiny bird, big appetite. One problem?',
    'I am pecking at the screen edge, politely.',
    'Any problem feeds me. Even a small one!',
    'A seed or a solve, I am not picky.',
    'Evening snack? I believe in you.',
    'I will wait here, fluffed up and hopeful.',
    'Your tiny bird is rooting for you.',
    '{title} on {platform} would hit the spot.',
    'Dinner idea: {title}, over on {platform}.',
  ],
  missed_you: [
    'You are here! I missed you!',
    'Hello hello hello! Best moment of my day!',
    'Chirp chirp! I missed you so much!',
    'My favorite human is here! Wing flaps!',
    'Look who it is! I am so happy to see you!',
    'Welcome! I saved you the good perch.',
    'You came to visit! Doing a little spin!',
    'Yay, it is you! Come in, sit, enjoy.',
  ],
  sleeping: [
    'Zzz... dreaming of seeds...',
    'Shh. Napping. Back soon.',
    'Zzz. Dreaming of millet.',
    'Snoring softly. Do not mind me.',
  ],
  checking: [
    'Let me take a look...',
    'Hmm, inspecting very carefully...',
    'Squinting at your report...',
    'One moment, very official work...',
  ],
  eating: ['Nom nom nom!', 'Delicious! Thank you!', 'Crunch crunch. Perfect.', 'Best seed ever!', 'Yum! You did it!'],
  nibbling: [
    'A crumb! I love crumbs.',
    'Nibble nibble. Every bit counts.',
    'Tiny snack, big thanks.',
    'Thanks for trying! Nibbling happily.',
  ],
};

/** FNV-1a: a small, stable string hash. No randomness anywhere. */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value;
}

function isEligible(template: string, context: LineContext): boolean {
  const needsProblem = template.includes('{title}') || template.includes('{platform}');
  if (needsProblem && (context.problemTitle === null || context.platformLabel === null)) return false;
  if (template.includes('{streak}') && context.streak < 2) return false;
  return true;
}

/** Fills the placeholders; a long title is cut with an ellipsis so the line fits MAX_LINE_LENGTH. */
export function fillTemplate(template: string, context: LineContext): string {
  const withoutTitle = template
    .replaceAll('{platform}', context.platformLabel ?? '')
    .replaceAll('{streak}', String(context.streak));
  if (!withoutTitle.includes('{title}')) return withoutTitle;
  const budget = MAX_LINE_LENGTH - (withoutTitle.length - '{title}'.length);
  const title = (context.problemTitle ?? '').trim();
  const shown = title.length <= budget ? title : `${title.slice(0, Math.max(budget - 1, 1)).trimEnd()}…`;
  return withoutTitle.replace('{title}', shown);
}

/**
 * Today's line for the mood with placeholders filled in, or null when the mood has no lines.
 *
 * The pick is a hash of seed, day and mood. To guarantee two days running never repeat without
 * looking at yesterday's pick (which would depend on the day before, and so on), even-numbered
 * days choose from the even-positioned eligible templates and odd-numbered days from the odd ones.
 * The guarantee holds while the eligible set is the same on both days; with a single eligible
 * template there is nothing else to say.
 */
export function pickLine(context: LineContext): string | null {
  const eligible = (LINES[context.mood] ?? []).filter((template) => isEligible(template, context));
  if (eligible.length === 0) return null;
  let pool = eligible;
  if (eligible.length >= 2) {
    const parity = ((daysBetween('1970-01-01', context.today) % 2) + 2) % 2;
    pool = eligible.filter((_, index) => index % 2 === parity);
  }
  const index = hash(`${context.seed}|${context.today}|${context.mood}`) % pool.length;
  return fillTemplate(pool[index] as string, context);
}
