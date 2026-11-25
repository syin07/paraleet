import { ArrowDown, ArrowUp, ArrowLeftRight, CircleCheck, Circle, Minus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { PlanItemView, PlanView, ProblemSummary } from '../../../bridge/contract';
import { api } from '../../bridge';
import { DifficultyText, PlatformBadge, StatusBadge } from '../../components/Badges';
import { Button } from '../../components/Button';
import { cx, problemTitle } from '../../lib/format';
import type { Lock } from './useLock';

/** A draft shows at most this many alternatives for a swap. */
const MAX_ALTERNATIVES = 5;

function StateIcon({ state }: { state: PlanItemView['state'] }) {
  if (state === 'done') return <CircleCheck className="h-4 w-4 text-easy" aria-label="Done" />;
  if (state === 'skipped') return <Minus className="h-4 w-4 text-fg-muted" aria-label="Skipped" />;
  return <Circle className="h-4 w-4 text-fg-muted" aria-label="Pending" />;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function PlanRow({
  planId,
  item,
  editable,
  solvedBefore,
  isFirst,
  isLast,
  swapOpen,
  setSwapOpen,
  lock,
  focusTitle,
  onTitleFocused,
  neighborId,
  onFocusRow,
  onChange,
  onError,
}: {
  planId: number;
  item: PlanItemView;
  editable: boolean;
  solvedBefore: boolean;
  isFirst: boolean;
  isLast: boolean;
  swapOpen: boolean;
  setSwapOpen: (open: boolean) => void;
  lock: Lock;
  /** True when this row just took the place of a swapped one: its title gets focus. */
  focusTitle: boolean;
  onTitleFocused: () => void;
  /** The row that takes this one's place when it is removed: the next, or the previous for the last. */
  neighborId: number | null;
  /** Asks for focus on the title of a row, after a swap or a removal took the focused button away. */
  onFocusRow: (problemId: number) => void;
  onChange: (plan: PlanView) => void;
  onError: (message: string) => void;
}) {
  const { problem } = item;
  const { busy } = lock;
  const name = problemTitle(problem);
  const titleButton = useRef<HTMLButtonElement>(null);
  const swapButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!focusTitle) return;
    titleButton.current?.focus();
    onTitleFocused();
  }, [focusTitle, onTitleFocused]);

  /** Sends one edit. Says whether it worked; a refused edit shows its message and changes nothing. */
  async function run(work: () => Promise<PlanView>): Promise<boolean> {
    const result = await lock.guard(async () => {
      try {
        onChange(await work());
        return true;
      } catch (error) {
        onError(message(error));
        return false;
      }
    });
    return result.ran && result.value;
  }

  function closeSwap(): void {
    setSwapOpen(false);
    swapButton.current?.focus();
  }

  const ref = { planId, problemId: problem.id };
  return (
    <li data-testid="plan-row" className="border-t border-line-subtle first:border-t-0">
      <div className="flex min-h-10 items-center gap-3 px-4 py-1">
        <span className="shrink-0">
          <StateIcon state={item.state} />
        </span>
        <div className="min-w-0 flex-1">
          <button
            ref={titleButton}
            type="button"
            onClick={() => void api().openProblem({ problemId: problem.id }).catch((error: unknown) => onError(message(error)))}
            className={cx(
              'focus-ring app-no-drag block max-w-full truncate rounded-xs text-left text-base hover:underline',
              item.state === 'pending' ? 'text-fg' : 'text-fg-secondary',
            )}
          >
            {name}
          </button>
          {solvedBefore && <div className="text-xs text-fg-muted">solved, will be offered as review</div>}
        </div>
        <PlatformBadge platform={problem.platform} />
        <span className="w-16 shrink-0 text-right">
          <DifficultyText raw={problem.difficultyRaw} norm={problem.difficultyNorm} />
        </span>
        {/* A slot of its own, so "Next" never moves the columns before it. */}
        {!editable && <span className="flex w-10 shrink-0 justify-end">{item.isNext && <StatusBadge>Next</StatusBadge>}</span>}
        {editable && (
          <span className="flex shrink-0 items-center gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              aria-label={`Move up ${name}`}
              disabled={busy || isFirst}
              onClick={() => void run(() => api().movePlanItem({ ...ref, direction: 'up' }))}
              icon={<ArrowUp className="h-3.5 w-3.5" />}
            />
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              aria-label={`Move down ${name}`}
              disabled={busy || isLast}
              onClick={() => void run(() => api().movePlanItem({ ...ref, direction: 'down' }))}
              icon={<ArrowDown className="h-3.5 w-3.5" />}
            />
            <Button
              ref={swapButton}
              variant="ghost"
              size="sm"
              iconOnly
              aria-label={`Swap ${name}`}
              aria-expanded={swapOpen}
              disabled={busy}
              onClick={() => (swapOpen ? closeSwap() : setSwapOpen(true))}
              icon={<ArrowLeftRight className="h-3.5 w-3.5" />}
            />
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              aria-label={`Remove ${name}`}
              disabled={busy}
              onClick={() =>
                void run(() => api().removePlanItem(ref)).then((ok) => {
                  if (ok && neighborId !== null) onFocusRow(neighborId);
                })
              }
              icon={<Trash2 className="h-3.5 w-3.5" />}
            />
          </span>
        )}
      </div>
      {editable && swapOpen && (
        <SwapOptions
          planId={planId}
          problemId={problem.id}
          busy={busy}
          onClose={closeSwap}
          onPick={async (replacementId) => {
            // The row is replaced by the new problem's row: focus its title, not the gone button.
            if (await run(() => api().swapPlanItem({ ...ref, replacementId }))) onFocusRow(replacementId);
          }}
        />
      )}
    </li>
  );
}

/** The short list of alternatives under a row. */
function SwapOptions({
  planId,
  problemId,
  busy,
  onClose,
  onPick,
}: {
  planId: number;
  problemId: number;
  busy: boolean;
  onClose: () => void;
  onPick: (replacementId: number) => Promise<void>;
}) {
  const [options, setOptions] = useState<ProblemSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const first = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let current = true;
    api()
      .getPlanSwapOptions({ planId, problemId })
      .then(
        (list) => current && setOptions(list.slice(0, MAX_ALTERNATIVES)),
        (failure: unknown) => current && setError(message(failure)),
      );
    return () => {
      current = false;
    };
  }, [planId, problemId]);

  // Opening the list moves focus into it: the first option, or Cancel when there is none.
  const loaded = options !== null || error !== null;
  useEffect(() => {
    if (loaded) (first.current ?? cancel.current)?.focus();
  }, [loaded]);

  return (
    <div
      role="group"
      aria-label="Alternatives"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        onClose();
      }}
      className="mx-4 mb-3 rounded-sm border border-line bg-sunken p-1"
    >
      <div className="flex items-center justify-between px-2 py-1">
        <span className="section-label">Swap for</span>
        <Button ref={cancel} size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
      {error && <div className="px-2 py-1 text-sm text-hard-text">{error}</div>}
      {!error && !options && <div className="px-2 py-1 text-sm text-fg-muted">Loading…</div>}
      {options?.length === 0 && <div className="px-2 py-1 text-sm text-fg-muted">No alternatives for this problem.</div>}
      {options?.map((option, index) => (
        <button
          key={option.id}
          ref={index === 0 ? first : undefined}
          type="button"
          disabled={busy}
          onClick={() => void onPick(option.id)}
          className="focus-ring app-no-drag flex h-8 w-full items-center gap-3 rounded-xs px-2 text-left text-base text-fg hover:bg-raised disabled:pointer-events-none disabled:opacity-60"
        >
          <span className="min-w-0 flex-1 truncate">{problemTitle(option)}</span>
          <PlatformBadge platform={option.platform} />
          <span className="w-16 shrink-0 text-right">
            <DifficultyText raw={option.difficultyRaw} norm={option.difficultyNorm} />
          </span>
        </button>
      ))}
    </div>
  );
}
