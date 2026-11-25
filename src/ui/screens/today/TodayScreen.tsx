// Thin Today screen from the foundation (SAN-104). The finished screen is SAN-109.
import { Check, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import type { TodayView } from '../../../bridge/contract';
import { RATING_LABELS, RATING_MEANINGS, RATINGS, type Rating } from '../../../core/types';
import { api } from '../../bridge';
import { DifficultyText, NeutralBadge, PlatformBadge, StatusBadge, TopicChips } from '../../components/Badges';
import { Button } from '../../components/Button';
import { Card, EmptyState, Page, QueryNotice } from '../../components/Layout';
import { Modal } from '../../components/Modal';
import { PetPlaceholder } from '../../components/PetPlaceholder';
import { cx, formatDay, problemTitle, REASON_LABELS } from '../../lib/format';
import { useBridgeQuery } from '../../lib/useBridgeQuery';

function ReportModal({ problemId, title, onClose }: { problemId: number; title: string; onClose: () => void }) {
  const [rating, setRating] = useState<Rating | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    if (!rating) return;
    setBusy(true);
    setError(null);
    try {
      await api().submitReport({
        problemId,
        rating,
        minutes: null,
        keyInsight: null,
        notes: null,
        insightRevealed: false,
      });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  }

  return (
    <Modal
      title="How did it go?"
      subtitle={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!rating} loading={busy} onClick={() => void submit()}>
            Feed Para
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Rating">
        {RATINGS.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={rating === value}
            onClick={() => setRating(value)}
            className={cx(
              'focus-ring flex min-h-[72px] flex-col items-center justify-center rounded-md border px-2 py-2 text-center transition-colors duration-100',
              rating === value
                ? 'border-accent-border bg-accent-subtle'
                : 'border-line bg-sunken hover:bg-raised',
            )}
          >
            <span className={cx('text-md font-semibold', rating === value ? 'text-accent' : 'text-fg')}>
              {RATING_LABELS[value]}
            </span>
            <span className="mt-0.5 text-xs text-fg-muted">{RATING_MEANINGS[value]}</span>
          </button>
        ))}
      </div>
      {error && <div className="mt-3 text-sm text-hard-text">{error}</div>}
    </Modal>
  );
}

function ProblemCard({ today, onReport }: { today: TodayView; onReport: () => void }) {
  const assignment = today.assignment;
  if (!assignment) {
    return (
      <Card>
        <EmptyState
          title="Para has no pick for today"
          line="Log any problem you solve and Para still gets fed."
          className="py-6"
        />
      </Card>
    );
  }
  const { problem } = assignment;
  if (assignment.completed) {
    return (
      <Card padding="compact" className="flex h-14 items-center gap-3">
        <Check className="h-4 w-4 text-easy" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-base text-fg-secondary" data-testid="today-title">
          {problemTitle(problem)}
        </span>
        <NeutralBadge>Fed</NeutralBadge>
      </Card>
    );
  }
  return (
    <Card>
      <div className="flex items-center justify-between">
        <span className="section-label">Today&apos;s problem</span>
        <StatusBadge>{REASON_LABELS[assignment.reason]}</StatusBadge>
      </div>
      <h2 className="mt-2 text-lg font-semibold text-fg" data-testid="today-title" data-selectable>
        {problemTitle(problem)}
      </h2>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <PlatformBadge platform={problem.platform} />
        <DifficultyText raw={problem.difficultyRaw} norm={problem.difficultyNorm} />
        <TopicChips topics={problem.topics} />
      </div>
      <div className="mt-4 flex items-center gap-2">
        <Button
          variant="primary"
          size="lg"
          icon={<ExternalLink className="h-4 w-4" aria-hidden />}
          onClick={() => void api().openProblem({ problemId: problem.id })}
        >
          Open problem
        </Button>
        <Button size="lg" onClick={onReport}>
          I solved it
        </Button>
      </div>
    </Card>
  );
}

export function TodayScreen() {
  const today = useBridgeQuery(() => api().getToday());
  const [reporting, setReporting] = useState(false);
  const data = today.data;

  return (
    <Page title="Today" meta={data ? formatDay(data.today) : undefined}>
      {!data ? (
        <QueryNotice loading={today.loading} error={today.error} />
      ) : (
        <div className="flex flex-col gap-4">
          <Card large className="flex h-60 flex-col items-center justify-center gap-3">
            <PetPlaceholder size={128} />
            <div className="text-sm text-fg-muted" data-testid="pet-status">
              {data.fed ? 'Para is fed for today' : 'Para is waiting for one problem'}
            </div>
          </Card>
          <ProblemCard today={data} onReport={() => setReporting(true)} />
          <div className="text-sm text-fg-muted" data-testid="streak-line">
            Streak: {data.streak.current} · Longest: {data.streak.longest} · Attempts logged: {data.pet.totalAttempts}
          </div>
        </div>
      )}
      {reporting && data?.assignment && (
        <ReportModal
          problemId={data.assignment.problem.id}
          title={problemTitle(data.assignment.problem)}
          onClose={() => setReporting(false)}
        />
      )}
    </Page>
  );
}
