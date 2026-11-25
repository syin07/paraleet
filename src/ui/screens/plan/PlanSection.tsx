import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { PlanSectionView, PlanView } from '../../../bridge/contract';
import { PLAN_STAGE_LABELS } from '../../../core/plan';
import { Card } from '../../components/Layout';
import { PlanRow } from './PlanRow';
import { startsCollapsed } from './planModel';
import { ProgressBar } from './ProgressBar';

const STAGE_CAPS = { foundations: 'Foundations', patterns: 'Pattern', challenge: 'Challenge' } as const;

/** One stage of a topic, or one pattern group: a header with progress, then its problems. */
export function PlanSection({
  planId,
  section,
  editable,
  loggedIds,
  swapFor,
  setSwapFor,
  onChange,
  onError,
}: {
  planId: number;
  section: PlanSectionView;
  editable: boolean;
  loggedIds: ReadonlySet<number>;
  swapFor: number | null;
  setSwapFor: (problemId: number | null) => void;
  onChange: (plan: PlanView) => void;
  onError: (message: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(() => startsCollapsed(section.progress));
  const title = section.groupName ?? PLAN_STAGE_LABELS[section.stage];
  const { progress } = section;
  const Chevron = collapsed ? ChevronRight : ChevronDown;

  return (
    <Card padding="none" testId="plan-section">
      <button
        type="button"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed(!collapsed)}
        className="focus-ring app-no-drag flex min-h-14 w-full items-center gap-3 rounded-md px-4 py-2 text-left hover:bg-raised/40"
      >
        <Chevron className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
        <span className="min-w-0 flex-1">
          {section.groupName && <span className="section-label block">{STAGE_CAPS[section.stage]}</span>}
          <span className="block truncate text-md font-semibold text-fg">{title}</span>
          {section.groupDescription && (
            <span className="block text-sm text-fg-secondary">{section.groupDescription}</span>
          )}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="text-sm tabular-nums whitespace-nowrap text-fg-secondary">
            {progress.done} done · {progress.skipped > 0 && `${progress.skipped} skipped · `}{progress.pending} pending
          </span>
          <ProgressBar progress={progress} width={80} label={`${title} progress`} />
        </span>
      </button>
      {!collapsed && (
        <ul className="border-t border-line-subtle">
          {section.items.map((item, index) => (
            <PlanRow
              key={item.problem.id}
              planId={planId}
              item={item}
              editable={editable}
              solvedBefore={editable && (item.state === 'skipped' || loggedIds.has(item.problem.id))}
              isFirst={index === 0}
              isLast={index === section.items.length - 1}
              swapOpen={swapFor === item.problem.id}
              setSwapOpen={(open) => setSwapFor(open ? item.problem.id : null)}
              onChange={onChange}
              onError={onError}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}
