import { Check } from 'lucide-react';
import type { PlanProgress } from '../../../core/plan';
import { cx } from '../../lib/format';
import { allFinished, percentDone, progressFigure } from './planModel';

/** A thin orange bar: the share of a plan or a card that needs no more work. */
export function ProgressBar({ progress, width, label }: { progress: PlanProgress; width: number; label: string }) {
  const percent = percentDone(progress);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      style={{ width }}
      className="h-1.5 shrink-0 overflow-hidden rounded-full bg-sunken"
    >
      <div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
    </div>
  );
}

/** "5 / 22 · 1 skipped", with a small green check once everything is finished. */
export function ProgressFigure({ progress, className }: { progress: PlanProgress; className?: string }) {
  return (
    <span className={cx('inline-flex items-center justify-end gap-1 whitespace-nowrap tabular-nums', className)}>
      {allFinished(progress) && <Check className="h-3.5 w-3.5 text-easy" aria-label="All finished" />}
      <span>{progressFigure(progress)}</span>
    </span>
  );
}
