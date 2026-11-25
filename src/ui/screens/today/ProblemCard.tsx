import { Check } from 'lucide-react';
import type { TodayAssignment } from '../../../bridge/contract';
import { api } from '../../bridge';
import { DifficultyText, NeutralBadge, PlatformBadge, StatusBadge, TopicChips } from '../../components/Badges';
import { Button } from '../../components/Button';
import { Card } from '../../components/Layout';
import { problemTitle, REASON_LABELS } from '../../lib/format';

/** Today's problem: the full card, or the one-row fed state once it is reported. */
export function ProblemCard({
  assignment,
  fed,
  onReport,
  onSwap,
  onLogAnother,
}: {
  assignment: TodayAssignment;
  /** True when Para was fed today, by any problem. */
  fed: boolean;
  onReport: () => void;
  onSwap: () => void;
  onLogAnother: () => void;
}) {
  const { problem } = assignment;
  const title = problemTitle(problem);

  if (assignment.completed) {
    return (
      <Card padding="none" className="flex h-14 items-center gap-3 px-5">
        <Check className="h-4 w-4 shrink-0 text-easy" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-base text-fg-secondary" data-testid="today-title">
          {title}
        </span>
        <NeutralBadge>Fed</NeutralBadge>
        <Button variant="ghost" size="sm" onClick={onLogAnother}>
          Log another
        </Button>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center gap-2">
        <h2 className="section-label">Today's problem</h2>
        <div className="ml-auto">
          <StatusBadge>{REASON_LABELS[assignment.reason]}</StatusBadge>
        </div>
      </div>
      <div className="mt-2 text-lg font-semibold text-fg" data-testid="today-title">
        {title}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <PlatformBadge platform={problem.platform} />
        <DifficultyText raw={problem.difficultyRaw} norm={problem.difficultyNorm} />
        <TopicChips topics={problem.topics} />
      </div>
      {fed && <div className="mt-3 text-sm text-fg-muted">Para is already fed. This one is a bonus.</div>}
      <div className="mt-4 flex items-center gap-2">
        <Button variant="primary" size="lg" onClick={() => void api().openProblem({ problemId: problem.id })}>
          Open problem
        </Button>
        <Button variant="secondary" size="lg" onClick={onReport}>
          I solved it
        </Button>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={onSwap}>
          Swap
        </Button>
      </div>
    </Card>
  );
}
