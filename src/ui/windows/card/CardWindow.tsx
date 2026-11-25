// The compact card's page (PRD section 11; docs/design-references.md, section 9): today's
// problem, "Open problem" and "I solved it", opened from the floating pet or the menu bar icon.
// The window is exactly as big as this panel: the page measures itself and tells main.
import { Check, ChevronLeft } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReportResult, TodayAssignment, TodayView } from '../../../bridge/contract';
import { api } from '../../bridge';
import { DifficultyText, PlatformBadge } from '../../components/Badges';
import { Button } from '../../components/Button';
import { ReportForm } from '../../components/ReportForm';
import { reportNews } from '../../components/ReportNews';
import { MOOD_LABELS, problemTitle } from '../../lib/format';
import { useBridgeQuery } from '../../lib/useBridgeQuery';
import { ParaHead } from './ParaHead';

const MIN_HEIGHT = 120;
const MAX_HEIGHT = 640;
const NARROW = 320;
const WIDE = 360;
/** How long the confirmation stays up before the card closes. */
const CONFIRM_MS = 1500;
/** Longer when there is news (Para grew, an accessory was unlocked) to read. */
const CONFIRM_NEWS_MS = 3000;

type View =
  | { kind: 'first' }
  | { kind: 'report'; problemId: number; title: string }
  | { kind: 'done'; result: ReportResult };

/** Every action that opens the main window also closes the card. */
function openMain(screen: 'today' | null): void {
  void api().showMainWindow({ screen });
  void api().hideCard();
}

export function CardWindow() {
  const today = useBridgeQuery(() => api().getToday());
  const [view, setView] = useState<View>({ kind: 'first' });
  const panel = useRef<HTMLDivElement>(null);
  const sent = useRef<string>('');

  const width = view.kind === 'first' ? NARROW : WIDE;
  const ready = today.data !== undefined || today.error !== null;

  // Tell main how much room the card needs, once per actual change.
  const reportSize = useCallback((): void => {
    const element = panel.current;
    if (!element) return;
    const height = Math.min(Math.max(Math.ceil(element.getBoundingClientRect().height), MIN_HEIGHT), MAX_HEIGHT);
    const key = `${width}x${height}`;
    if (key === sent.current) return;
    sent.current = key;
    void api().setCardSize({ width, height });
  }, [width]);

  useLayoutEffect(() => {
    if (!ready) return;
    reportSize();
    const element = panel.current;
    if (!element) return;
    const observer = new ResizeObserver(reportSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ready, reportSize, view.kind]);

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') void api().hideCard();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // The confirmation closes the card by itself.
  const doneResult = view.kind === 'done' ? view.result : null;
  useEffect(() => {
    if (doneResult === null) return;
    const timer = setTimeout(() => void api().hideCard(), reportNews(doneResult) ? CONFIRM_NEWS_MS : CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [doneResult]);

  if (!ready) return null;
  const data = today.data;

  return (
    <div
      ref={panel}
      data-testid="card"
      style={{ width, maxHeight: MAX_HEIGHT }}
      className="box-border overflow-y-auto overflow-x-hidden rounded-lg border border-line bg-surface p-4 text-base text-fg"
    >
      {data === undefined ? (
        <FailedView />
      ) : view.kind === 'report' ? (
        <ReportView
          title={view.title}
          problemId={view.problemId}
          onBack={() => setView({ kind: 'first' })}
          onDone={(result) => setView({ kind: 'done', result })}
        />
      ) : view.kind === 'done' ? (
        <Confirmation result={view.result} data={data} />
      ) : (
        <FirstView
          data={data}
          onSolved={(assignment) =>
            setView({ kind: 'report', problemId: assignment.problem.id, title: problemTitle(assignment.problem) })
          }
        />
      )}
    </div>
  );
}

function FailedView() {
  return (
    <div className="flex flex-col gap-3" role="alert">
      <p className="text-base text-fg">Something went wrong</p>
      <Button variant="secondary" onClick={() => openMain(null)}>
        Open ParaLeet
      </Button>
    </div>
  );
}

function FirstView({ data, onSolved }: { data: TodayView; onSolved: (assignment: TodayAssignment) => void }) {
  const { pet, streak } = data;
  const open = data.assignment && !data.fed && !data.assignment.completed ? data.assignment : null;
  return (
    <>
      <div className="flex items-center gap-3">
        <ParaHead seed={pet.seed} stage={pet.stage} mood={pet.mood} accessories={pet.equippedAccessories} />
        <span className="min-w-0 flex-1 font-pixel text-[8px] leading-[14px] text-fg-secondary" data-testid="card-mood">
          Para is {MOOD_LABELS[pet.mood]}
        </span>
        {streak.current > 0 && (
          <span className="shrink-0 whitespace-nowrap" data-testid="card-streak">
            <span className="text-md font-semibold text-fg">{streak.current}</span>{' '}
            <span className="text-sm text-fg-muted">day streak</span>
          </span>
        )}
      </div>
      <div className="my-3 h-px bg-line" />

      {data.fed ? (
        <>
          <div className="flex items-center gap-2" data-testid="card-fed">
            <Check className="h-4 w-4 shrink-0 text-easy" aria-hidden />
            <span className="text-md font-semibold text-fg">Fed for today</span>
          </div>
          <Button className="mt-4 w-full" onClick={() => openMain('today')}>
            Log another problem
          </Button>
        </>
      ) : open ? (
        <>
          <div className="section-label">Today's problem</div>
          <div className="mt-1 line-clamp-2 break-words text-md font-semibold text-fg" data-testid="card-title">
            {problemTitle(open.problem)}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <PlatformBadge platform={open.problem.platform} />
            <DifficultyText raw={open.problem.difficultyRaw} norm={open.problem.difficultyNorm} />
          </div>
          {/* A grid, so the two halves are equal even though only one button has a border. */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="primary" onClick={() => void api().openProblem({ problemId: open.problem.id })}>
              Open problem
            </Button>
            <Button variant="secondary" onClick={() => onSolved(open)}>
              I solved it
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-base text-fg-secondary" data-testid="card-nothing">
            Nothing is assigned today. Any problem you log feeds Para.
          </p>
          <Button variant="primary" className="mt-4 w-full" onClick={() => openMain('today')}>
            Log a problem
          </Button>
        </>
      )}

      <div className="mt-3 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => openMain(null)}>
          Open ParaLeet
        </Button>
        {open && (
          <Button variant="ghost" size="sm" onClick={() => openMain('today')}>
            Swap
          </Button>
        )}
      </div>
    </>
  );
}

function ReportView({
  title,
  problemId,
  onBack,
  onDone,
}: {
  title: string;
  problemId: number;
  onBack: () => void;
  onDone: (result: ReportResult) => void;
}) {
  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          aria-label="Back"
          icon={<ChevronLeft className="h-4 w-4" aria-hidden />}
          onClick={onBack}
        />
        <span className="min-w-0 flex-1 truncate text-md font-semibold text-fg" data-testid="card-report-title">
          {title}
        </span>
      </div>
      <ReportForm problemId={problemId} compact onDone={onDone} onCancel={onBack} />
    </>
  );
}

function Confirmation({ result, data }: { result: ReportResult; data: TodayView }) {
  const { pet } = data;
  const news = reportNews(result);
  return (
    <div className="flex flex-col items-center gap-2 py-2 text-center" data-testid="card-confirmation">
      <ParaHead
        seed={pet.seed}
        stage={result.growth.stage}
        mood={result.meal === 'full' ? 'eating' : 'nibbling'}
        accessories={pet.equippedAccessories}
        size={48}
      />
      <p className="text-md font-semibold text-fg">
        {result.meal === 'full' ? 'Para ate!' : 'Para had a nibble.'} {result.streak.current}-day streak
      </p>
      {news && <p className="text-sm text-fg-secondary">{news}</p>}
    </div>
  );
}
