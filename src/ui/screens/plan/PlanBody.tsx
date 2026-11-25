// One plan, laid out per topic, per stage and per pattern group. Used for the active plan, a
// draft under review, and a read-only archived or finished plan.
import { useState, type ReactNode } from 'react';
import type { PlanView } from '../../../bridge/contract';
import { PLAN_LEVEL_LABELS } from '../../../core/plan';
import { topicLabel } from '../../../core/topics';
import { PLATFORM_LABELS } from '../../lib/format';
import { NeutralBadge } from '../../components/Badges';
import { InlineError } from './notices';
import { PlanSection } from './PlanSection';
import { formatCreated, groupByTopic, STATUS_LABELS } from './planModel';
import { ProgressBar } from './ProgressBar';

export function PlanBody({
  plan,
  editable,
  banner,
  onChange,
  loggedIds,
}: {
  plan: PlanView;
  /** True for a draft: rows get move, swap and remove buttons. */
  editable: boolean;
  /** Shown above the plan, under the header: the draft's "Activate plan" banner. */
  banner?: ReactNode;
  onChange: (plan: PlanView) => void;
  /** Problems the user has attempted before, so a draft can tag them. */
  loggedIds: ReadonlySet<number>;
}) {
  const [error, setError] = useState<string | null>(null);
  // At most one row has its alternatives open.
  const [swapFor, setSwapFor] = useState<number | null>(null);
  const blocks = groupByTopic(plan.sections);
  const platforms = plan.platforms.map((platform) => PLATFORM_LABELS[platform]).join(', ');

  return (
    <div>
      <div className="mb-5 flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="min-w-0 truncate text-lg font-semibold text-fg">{plan.title}</h2>
            {plan.status !== 'active' && <NeutralBadge>{STATUS_LABELS[plan.status]}</NeutralBadge>}
          </div>
          <div className="mt-0.5 text-sm text-fg-muted">
            {platforms} · {PLAN_LEVEL_LABELS[plan.level]} · Created {formatCreated(plan.createdAt)}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3" data-testid="plan-overall">
          <span className="text-base tabular-nums text-fg-secondary">
            {plan.progress.done + plan.progress.skipped} / {plan.progress.total}
          </span>
          <ProgressBar progress={plan.progress} width={120} label="Overall progress" />
        </div>
      </div>
      {banner}
      {error && (
        <div className="mb-4">
          <InlineError message={error} />
        </div>
      )}
      <div className="flex flex-col gap-8">
        {blocks.map((block) => (
          <section key={block.topic} aria-label={topicLabel(block.topic)}>
            <h3 className="mb-3 text-lg font-semibold text-fg">{topicLabel(block.topic)}</h3>
            <div className="flex flex-col gap-3">
              {block.sections.map(({ section, index }) => (
                <PlanSection
                  key={`${index}-${section.groupName ?? section.stage}`}
                  planId={plan.id}
                  section={section}
                  editable={editable}
                  loggedIds={loggedIds}
                  swapFor={swapFor}
                  setSwapFor={setSwapFor}
                  onChange={(next) => {
                    setError(null);
                    onChange(next);
                  }}
                  onError={setError}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
