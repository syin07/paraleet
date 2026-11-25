// The report form (docs/design-references.md, section 3): pick a rating, press Feed Para. Everything
// else is optional. `ReportForm` is the body alone so the compact card can embed it in M2;
// `ReportDialog` is the same body inside the shared Modal.
import { Check } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReportContext, ReportResult } from '../../bridge/contract';
import { RATING_LABELS, RATING_MEANINGS, RATINGS, type Rating } from '../../core/types';
import { api } from '../bridge';
import { cx, plural } from '../lib/format';
import { PlatformBadge, StatusBadge } from './Badges';
import { Button } from './Button';
import { Field, Input, Textarea } from './Field';
import { Modal } from './Modal';

const MAX_INSIGHT = 300;
const CAPPED: ReadonlySet<Rating> = new Set<Rating>(['good', 'easy']);

/** Null when the text is a valid optional minutes value, otherwise the message to show. */
function minutesProblem(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (!/^\d+$/.test(trimmed) || Number(trimmed) > 1440) return 'Enter whole minutes from 0 to 1440';
  return null;
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export interface ReportFormProps {
  problemId: number;
  onDone: (result: ReportResult) => void;
  onCancel: () => void;
  /** Shorter rating buttons, for the compact card. */
  compact?: boolean;
  /** Called once the problem is known, so a host can show its title. */
  onLoaded?: (context: ReportContext) => void;
}

export function ReportForm({ problemId, onDone, onCancel, compact = false, onLoaded }: ReportFormProps) {
  const [context, setContext] = useState<ReportContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rating, setRating] = useState<Rating | null>(null);
  const [minutes, setMinutes] = useState('');
  const [insight, setInsight] = useState('');
  const [savedInsight, setSavedInsight] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [notes, setNotes] = useState('');
  const [notesOpen, setNotesOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ result: ReportResult; insight: string } | null>(null);
  const radios = useRef<(HTMLButtonElement | null)[]>([]);
  const doneRow = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    api()
      .getReportContext({ problemId })
      .then(
        (loaded) => {
          if (!live) return;
          setContext(loaded);
          onLoaded?.(loaded);
        },
        (cause: unknown) => live && setLoadError(messageOf(cause)),
      );
    return () => {
      live = false;
    };
    // onLoaded is a host callback; the context is loaded once per problem
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problemId]);

  // Put focus on the rating group once the form has loaded so the number keys and arrows work.
  const loaded = context !== null;
  useEffect(() => {
    if (loaded) radios.current[0]?.focus();
  }, [loaded]);

  useEffect(() => {
    if (confirmation) doneRow.current?.querySelector('button')?.focus();
  }, [confirmation]);

  const firstSolve = context?.kind === 'first_solve';
  const insightHidden = context !== null && !firstSolve && context.hasKeyInsight && !revealed;
  const minutesError = minutesProblem(minutes);
  const canSubmit = rating !== null && minutesError === null && !busy && context !== null && !confirmation;

  const pick = useCallback(
    (next: Rating) => {
      if (revealed && CAPPED.has(next)) return;
      setRating(next);
    },
    [revealed],
  );

  async function reveal(): Promise<void> {
    setError(null);
    try {
      const { keyInsight } = await api().revealKeyInsight({ problemId });
      setSavedInsight(keyInsight);
      setInsight(keyInsight ?? '');
      setRevealed(true);
      setRating((current) => (current === null || CAPPED.has(current) ? 'hard' : current));
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  async function submit(): Promise<void> {
    if (!canSubmit || rating === null || context === null) return;
    setBusy(true);
    setError(null);
    // Null leaves a saved insight alone: the user never saw it, or did not change it.
    const trimmed = insight.trim();
    const keyInsight = revealed ? (trimmed === (savedInsight ?? '') ? null : trimmed) : trimmed === '' ? null : trimmed;
    try {
      const result = await api().submitReport({
        problemId,
        rating,
        minutes: minutes.trim() === '' ? null : Number(minutes),
        keyInsight,
        notes: notes.trim() === '' ? null : notes.trim(),
        insightRevealed: revealed,
      });
      if (insightHidden) {
        // The insight stayed hidden: show it once now that the attempt is recorded.
        const saved = await api()
          .revealKeyInsight({ problemId })
          .then(
            (value) => value.keyInsight,
            () => null,
          );
        if (saved) {
          setConfirmation({ result, insight: saved });
          setBusy(false);
          return;
        }
      }
      onDone(result);
    } catch (cause) {
      setError(messageOf(cause));
      setBusy(false);
    }
  }

  // Number keys and Enter work wherever focus is inside the dialog, including on the dialog itself.
  const submitRef = useRef(submit);
  const pickRef = useRef(pick);
  const canSubmitRef = useRef(canSubmit);
  useEffect(() => {
    submitRef.current = submit;
    pickRef.current = pick;
    canSubmitRef.current = canSubmit;
  });
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';
      const index = ['1', '2', '3', '4'].indexOf(event.key);
      if (index >= 0 && !typing) {
        const next = RATINGS[index];
        if (next) pickRef.current(next);
        return;
      }
      if (event.key === 'Enter' && target?.tagName !== 'TEXTAREA') {
        // A focused link or footer button keeps its own Enter.
        if (target?.tagName === 'BUTTON' && target.getAttribute('role') !== 'radio') return;
        if (!canSubmitRef.current) return;
        event.preventDefault();
        void submitRef.current();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  function onRadioKeyDown(event: React.KeyboardEvent, index: number): void {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    for (let offset = 1; offset <= RATINGS.length; offset += 1) {
      const nextIndex = (index + step * offset + RATINGS.length * RATINGS.length) % RATINGS.length;
      const next = RATINGS[nextIndex];
      if (next && !(revealed && CAPPED.has(next))) {
        pick(next);
        radios.current[nextIndex]?.focus();
        return;
      }
    }
  }

  if (loadError) {
    return (
      <div role="alert" className="text-base text-hard-text">
        Something went wrong: {loadError}
      </div>
    );
  }
  if (!context) return <div className="py-6 text-base text-fg-muted">Loading…</div>;

  if (confirmation) {
    return (
      <div data-testid="report-confirmation">
        <div className="section-label">Your key insight</div>
        <p className="mt-2 text-md text-fg">{confirmation.insight}</p>
        <div ref={doneRow} className="mt-6 flex justify-end">
          <Button variant="primary" onClick={() => onDone(confirmation.result)}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  const days = rating && rating !== 'again' ? context.nextReviewInDays?.[rating] : undefined;
  const hint =
    rating === 'again'
      ? 'Counts for today. Para gets a crumb.'
      : days !== undefined
        ? `Next review in about ${plural(days, 'day')}`
        : null;
  const selectedStop = rating ?? RATINGS.find((candidate) => !(revealed && CAPPED.has(candidate)));

  return (
    <div>
      <div role="radiogroup" aria-label="Rating" className="grid grid-cols-4 gap-2">
        {RATINGS.map((value, index) => {
          const selected = rating === value;
          const disabled = revealed && CAPPED.has(value);
          return (
            <button
              key={value}
              ref={(element) => {
                radios.current[index] = element;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              tabIndex={selectedStop === value ? 0 : -1}
              onClick={() => pick(value)}
              onKeyDown={(event) => onRadioKeyDown(event, index)}
              className={cx(
                'focus-ring app-no-drag relative flex flex-col items-center justify-center rounded-md border px-2 text-center transition-colors duration-100',
                compact ? 'min-h-14' : 'min-h-[72px]', 'py-2',
                'disabled:pointer-events-none disabled:opacity-40',
                selected
                  ? 'border-accent-border bg-accent-subtle'
                  : 'border-line bg-sunken hover:bg-raised',
              )}
            >
              <span aria-hidden className="absolute top-1 left-2 text-xs text-fg-muted">
                {index + 1}
              </span>
              <span className={cx('text-md font-semibold', selected ? 'text-accent' : 'text-fg')}>
                {RATING_LABELS[value]}
              </span>
              <span className="mt-0.5 text-xs text-fg-muted">{RATING_MEANINGS[value]}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 min-h-4 text-sm text-fg-muted" data-testid="report-hint">
        {hint}
      </div>

      <div className="mt-4 flex items-start gap-3">
        <Field label="Minutes" error={minutesError} className="w-24 shrink-0">
          <Input
            inputMode="numeric"
            value={minutes}
            invalid={minutesError !== null}
            onChange={(event) => setMinutes(event.target.value)}
          />
        </Field>
        <div className="min-w-0 flex-1">
          {insightHidden ? (
            <>
              <div className="mb-1.5 h-4 text-sm text-fg-secondary">Key insight</div>
              <Button variant="ghost" size="md" onClick={() => void reveal()}>
                Reveal key insight
              </Button>
            </>
          ) : (
            <Field label={<>Key insight {firstSolve && <StatusBadge>New</StatusBadge>}</>}>
              <Input
                value={insight}
                maxLength={MAX_INSIGHT}
                placeholder="The trick in one sentence"
                onChange={(event) => setInsight(event.target.value)}
              />
            </Field>
          )}
        </div>
      </div>
      {revealed && (
        <div className="mt-1.5 text-sm text-fg-muted">Revealing the key insight limits the rating to Hard.</div>
      )}

      <div className="mt-3">
        {notesOpen ? (
          <Field label="Notes">
            <Textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </Field>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setNotesOpen(true)}>
            + Add notes
          </Button>
        )}
      </div>

      {error && (
        <div role="alert" className="mt-4 text-sm text-hard-text">
          {error}
        </div>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <Button onClick={onCancel}>Cancel</Button>
        <Button
          variant="primary"
          icon={busy ? undefined : <Check className="h-4 w-4" aria-hidden />}
          disabled={rating === null || minutesError !== null}
          loading={busy}
          onClick={() => void submit()}
        >
          Feed Para
        </Button>
      </div>
    </div>
  );
}

/** The report form in the shared modal. `onClose` runs after a report and on cancel. */
export function ReportDialog({ problemId, onClose }: { problemId: number; onClose: () => void }) {
  const [context, setContext] = useState<ReportContext | null>(null);
  return (
    <Modal
      width={560}
      title="How did it go?"
      subtitle={
        context && (
          <span className="flex items-center gap-2">
            <span className="min-w-0 truncate">{context.problem.title}</span>
            <PlatformBadge platform={context.problem.platform} />
          </span>
        )
      }
      onClose={onClose}
    >
      <ReportForm problemId={problemId} onLoaded={setContext} onDone={onClose} onCancel={onClose} />
    </Modal>
  );
}
