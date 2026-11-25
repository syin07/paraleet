import type { PlanProgress } from '../../../core/plan';
import { percentDone } from './planModel';

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
