import type { ReactNode } from 'react';
import { topicLabel, type TopicId } from '../../core/topics';
import type { DifficultyNorm, Platform } from '../../core/types';
import { cx, difficultyTone, PLATFORM_LABELS, type DifficultyTone } from '../lib/format';

const TONE_TEXT: Record<DifficultyTone, string> = {
  easy: 'text-easy',
  medium: 'text-medium',
  hard: 'text-hard-text',
  none: 'text-fg-muted',
};

const TONE_DOT: Record<DifficultyTone, string> = {
  easy: 'bg-easy',
  medium: 'bg-medium',
  hard: 'bg-hard',
  none: 'bg-line-strong',
};

/** "LeetCode", "CSES", "Codeforces" or "Other" as a quiet outlined badge. Never a logo. */
export function PlatformBadge({ platform }: { platform: Platform }) {
  return (
    <span className="inline-flex h-5 shrink-0 items-center rounded-xs border border-line px-1.5 text-xs font-medium text-fg-secondary">
      {PLATFORM_LABELS[platform]}
    </span>
  );
}

/** Difficulty as colored text: the platform's own wording (`Medium`, `1500`). */
export function DifficultyText({ raw, norm }: { raw: string | null; norm: DifficultyNorm | null }) {
  if (!raw) return <span className="text-sm text-fg-muted">No rating</span>;
  return <span className={cx('text-sm font-medium', TONE_TEXT[difficultyTone(norm)])}>{raw}</span>;
}

/** Difficulty as an 8px dot, for dense rows. */
export function DifficultyDot({ raw, norm }: { raw: string | null; norm: DifficultyNorm | null }) {
  return (
    <span
      className={cx('inline-block h-2 w-2 shrink-0 rounded-full', TONE_DOT[difficultyTone(norm)])}
      title={raw ?? 'No rating'}
    />
  );
}

/** A small orange-tinted badge: "Review", "Next", "Due", "New". */
export function StatusBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-5 shrink-0 items-center rounded-xs bg-accent-subtle px-1.5 text-xs font-semibold text-accent">
      {children}
    </span>
  );
}

/** A neutral badge for quiet states: "Fed", "Retired". */
export function NeutralBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-5 shrink-0 items-center rounded-xs bg-sunken px-1.5 text-xs font-medium text-fg-secondary">
      {children}
    </span>
  );
}

export function TopicChip({ topic }: { topic: TopicId }) {
  return (
    <span className="inline-flex h-5 shrink-0 items-center rounded-xs bg-sunken px-1.5 text-sm text-fg-secondary">
      {topicLabel(topic)}
    </span>
  );
}

/** Up to `max` topic chips, then "+n". */
export function TopicChips({ topics, max = 3 }: { topics: readonly TopicId[]; max?: number }) {
  const shown = topics.slice(0, max);
  const rest = topics.length - shown.length;
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      {shown.map((topic) => (
        <TopicChip key={topic} topic={topic} />
      ))}
      {rest > 0 && <span className="text-sm text-fg-muted">+{rest}</span>}
    </span>
  );
}
