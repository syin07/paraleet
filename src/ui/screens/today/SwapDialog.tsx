import { useRef, useState } from 'react';
import type { ProblemSummary } from '../../../bridge/contract';
import { api } from '../../bridge';
import { DifficultyDot, PlatformBadge } from '../../components/Badges';
import { Modal } from '../../components/Modal';
import { problemTitle } from '../../lib/format';
import { useBridgeQuery } from '../../lib/useBridgeQuery';

function CandidateRow({ problem, onPick }: { problem: ProblemSummary; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="focus-ring app-no-drag flex h-9 w-full items-center gap-2 rounded-xs px-2 text-left text-base text-fg hover:bg-raised"
    >
      <DifficultyDot raw={problem.difficultyRaw} norm={problem.difficultyNorm} />
      <span className="min-w-0 flex-1 truncate">{problemTitle(problem)}</span>
      <PlatformBadge platform={problem.platform} />
    </button>
  );
}

/** Today's problem can be swapped for another due review or a plan problem. */
export function SwapDialog({ currentId, onClose }: { currentId: number | null; onClose: () => void }) {
  const candidates = useBridgeQuery(() => api().getSwapCandidates());
  const [error, setError] = useState<string | null>(null);

  // A ref, not state: a second click in the same tick must already see the first.
  const inFlight = useRef(false);

  async function pick(problemId: number): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    try {
      await api().swapToday({ problemId });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      inFlight.current = false;
    }
  }

  const reviews = (candidates.data?.reviews ?? []).filter((item) => item.problem.id !== currentId);
  const plan = (candidates.data?.plan ?? []).filter((problem) => problem.id !== currentId);
  const empty = candidates.data !== undefined && reviews.length === 0 && plan.length === 0;

  return (
    <Modal title="Swap today's problem" onClose={onClose}>
      {candidates.loading && <div className="text-base text-fg-muted">Loading…</div>}
      {candidates.error && (
        <div role="alert" className="text-base text-hard-text">
          Something went wrong: {candidates.error}
        </div>
      )}
      {empty && <div className="text-base text-fg-muted">Nothing to swap to right now.</div>}
      {reviews.length > 0 && (
        <section aria-label="Due for review">
          <div className="section-label mb-1">Due for review</div>
          {reviews.map((item) => (
            <CandidateRow key={item.problem.id} problem={item.problem} onPick={() => void pick(item.problem.id)} />
          ))}
        </section>
      )}
      {plan.length > 0 && (
        <section aria-label="From your plan" className={reviews.length > 0 ? 'mt-4' : undefined}>
          <div className="section-label mb-1">From your plan</div>
          {plan.map((problem) => (
            <CandidateRow key={problem.id} problem={problem} onPick={() => void pick(problem.id)} />
          ))}
        </section>
      )}
      {error && (
        <div role="alert" className="mt-3 text-sm text-hard-text">
          {error}
        </div>
      )}
    </Modal>
  );
}
