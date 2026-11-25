import type { ReactNode } from 'react';
import { cx } from '../lib/format';
import type { Mood } from '../../core/types';
import { SAMPLE_SEED, Sprite } from './Sprite';

/** The standard page frame: a title row, then the content, on the app's 960px column. */
export function Page({
  title,
  meta,
  actions,
  children,
}: {
  title: string;
  /** A quiet note beside the title: a count or a date. */
  meta?: ReactNode;
  /** Buttons at the right end of the title row. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-0 max-w-[960px] px-6 pt-2 pb-10 min-[960px]:px-10">
      <header className="mb-6 flex min-h-8 items-center gap-3">
        <h1 className="text-xl font-semibold text-fg">{title}</h1>
        {meta && <div className="text-sm text-fg-muted">{meta}</div>}
        <div className="ml-auto flex items-center gap-2">{actions}</div>
      </header>
      {children}
    </div>
  );
}

/** The standard card: surface fill, hairline border, 8px radius (12px with `large`). */
export function Card({
  large = false,
  padding = 'default',
  className,
  children,
}: {
  large?: boolean;
  padding?: 'none' | 'compact' | 'default';
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cx(
        'border border-line bg-surface',
        large ? 'rounded-lg' : 'rounded-md',
        padding === 'default' && 'p-5',
        padding === 'compact' && 'p-4',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A warm, quiet empty state: Para, one title, one line, at most one button. Never guilt. */
export function EmptyState({
  title,
  line,
  action,
  mood = 'content',
  className,
}: {
  title: string;
  /** What Para is doing beside the words. Content unless the screen says otherwise. */
  mood?: Mood;
  line?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <Sprite seed={SAMPLE_SEED} stage="adult" mood={mood} size={64} decorative />
      <div className="mt-4 text-md font-semibold text-fg">{title}</div>
      {line && <div className="mt-1 max-w-sm text-base text-fg-muted">{line}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** A loading or failed query, shown in place of a screen's content. */
export function QueryNotice({ loading, error }: { loading: boolean; error: string | null }) {
  if (error) {
    return (
      <div className="rounded-md border border-line bg-surface p-4 text-base text-hard-text" role="alert">
        Something went wrong: {error}
      </div>
    );
  }
  return loading ? <div className="p-4 text-base text-fg-muted">Loading…</div> : null;
}
