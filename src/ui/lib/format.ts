// Small display helpers shared by every screen.
import { daysBetween } from '../../core/day';
import type { AssignmentReason, DifficultyNorm, GrowthStage, Mood, ParaDay, Platform } from '../../core/types';

export const PLATFORM_LABELS: Record<Platform, string> = {
  leetcode: 'LeetCode',
  cses: 'CSES',
  codeforces: 'Codeforces',
  other: 'Other',
};

export const REASON_LABELS: Record<AssignmentReason, string> = {
  review: 'Review',
  plan: 'Plan',
  starter: 'Starter',
  user_swap: 'Your pick',
};

export type DifficultyTone = 'easy' | 'medium' | 'hard' | 'none';

/** Normalized 1 to 2 is easy, 3 medium, 4 to 5 hard (docs/design-references.md, Theme). */
export function difficultyTone(norm: DifficultyNorm | null): DifficultyTone {
  if (norm === null) return 'none';
  if (norm <= 2) return 'easy';
  return norm === 3 ? 'medium' : 'hard';
}

/** "1. Two Sum" for LeetCode, the bare title elsewhere. */
export function problemTitle(problem: { title: string; displayId: string | null }): string {
  return problem.displayId ? `${problem.displayId}. ${problem.title}` : problem.title;
}

/** "today", "yesterday", "3d ago", "in 4d": a ParaLeet day relative to today. */
export function relativeDay(day: ParaDay, today: ParaDay): string {
  const diff = daysBetween(today, day);
  if (diff === 0) return 'today';
  if (diff === -1) return 'yesterday';
  if (diff === 1) return 'tomorrow';
  return diff < 0 ? `${-diff}d ago` : `in ${diff}d`;
}

/** "Tue, Nov 25" for a ParaLeet day. */
export function formatDay(day: ParaDay): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, date ?? 1)),
  );
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/** How a growth stage and a mood are named on screen. */
export const STAGE_LABELS: Record<GrowthStage, string> = {
  egg: 'Egg',
  chick: 'Chick',
  fledgling: 'Fledgling',
  adult: 'Adult',
};

export const MOOD_LABELS: Record<Mood, string> = {
  sleeping: 'sleeping',
  content: 'content',
  peckish: 'peckish',
  hungry: 'hungry',
  checking: 'checking',
  eating: 'eating',
  nibbling: 'nibbling',
  missed_you: 'so happy to see you',
};
