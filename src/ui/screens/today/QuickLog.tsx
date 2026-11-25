import { useEffect, useId, useState, type RefObject } from 'react';
import type { ProblemSummary } from '../../../bridge/contract';
import { api } from '../../bridge';
import { PlatformBadge } from '../../components/Badges';
import { Button } from '../../components/Button';
import { Input } from '../../components/Field';
import { Card } from '../../components/Layout';
import { cx, problemTitle } from '../../lib/format';

interface Outcome {
  /** The trimmed text these results answer. Results for any other text are stale. */
  forText: string;
  results: ProblemSummary[];
  message: string | null;
  /** The pasted link is valid but the app does not have the problem. */
  unknown: boolean;
}
const NONE: Outcome = { forText: '', results: [], message: null, unknown: false };

function lookup(query: string): Promise<Outcome> {
  const base = { forText: query, results: [], message: null, unknown: false };
  if (/^http/i.test(query)) {
    return api()
      .parseProblemUrl({ url: query })
      .then((parsed): Outcome => {
        if (!parsed.ok) return { ...base, message: parsed.reason };
        if (!parsed.known) return { ...base, message: 'ParaLeet does not know this problem yet.', unknown: true };
        return { ...base, results: [parsed.known] };
      });
  }
  return api()
    .searchProblems({ query })
    .then((results): Outcome => ({ ...base, results, message: results.length === 0 ? 'No matching problem.' : null }));
}

/** One input that finds any problem the app knows, by search or by pasted URL, then opens the report form. */
export function QuickLog({
  inputRef,
  onPick,
  onAddUnknown,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  onPick: (problemId: number) => void;
  /** The user chose "Add it" for a pasted link the app does not know. */
  onAddUnknown: (url: string) => void;
}) {
  const listId = useId();
  const [text, setText] = useState('');
  const [outcome, setOutcome] = useState<Outcome>(NONE);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const query = text.trim();
    if (query === '') return;
    let live = true;
    const timer = setTimeout(() => {
      lookup(query).then(
        (next) => {
          if (!live) return;
          setOutcome(next);
          setActive(0);
        },
        (cause: unknown) => {
          if (live) {
            setOutcome({ forText: query, results: [], message: cause instanceof Error ? cause.message : String(cause), unknown: false });
          }
        },
      );
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [text]);

  function change(value: string): void {
    setText(value);
    if (value.trim() === '') setOutcome(NONE);
  }

  function choose(problem: ProblemSummary): void {
    setText('');
    setOutcome(NONE);
    onPick(problem.id);
  }

  // Results belong to the text they were found for. While the text has moved on (the typing pause,
  // or a request in flight) they cannot be picked or navigated.
  const stale = text.trim() !== outcome.forText;

  function addUnknown(): void {
    const url = outcome.forText;
    setText('');
    setOutcome(NONE);
    onAddUnknown(url);
  }

  function onKeyDown(event: React.KeyboardEvent): void {
    if (stale) {
      if (event.key === 'Escape' && text !== '') {
        event.stopPropagation();
        change('');
      }
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (outcome.results.length === 0) return;
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((index) => (index + step + outcome.results.length) % outcome.results.length);
    } else if (event.key === 'Enter') {
      const chosen = outcome.results[active];
      if (chosen) {
        event.preventDefault();
        choose(chosen);
      } else if (outcome.unknown) {
        event.preventDefault();
        addUnknown();
      }
    } else if (event.key === 'Escape' && text !== '') {
      event.stopPropagation();
      change('');
    }
  }

  const open = text.trim() !== '' && (outcome.results.length > 0 || outcome.message !== null);
  const activeOption = open && !stale ? outcome.results[active] : undefined;

  return (
    <Card padding="compact">
      <h2 className="section-label mb-2">Log another problem</h2>
      <div className="relative">
        <Input
          ref={inputRef}
          role="combobox"
          aria-label="Paste a problem URL or search"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={activeOption ? `${listId}-${activeOption.id}` : undefined}
          aria-autocomplete="list"
          value={text}
          placeholder="Paste a problem URL or search"
          onChange={(event) => change(event.target.value)}
          onKeyDown={onKeyDown}
        />
        {open && (
          <div
            id={listId}
            aria-busy={stale}
            className={cx(
              'absolute top-full right-0 left-0 z-10 mt-1 rounded-md border border-line bg-surface p-1 shadow-popover',
              stale && 'pointer-events-none opacity-50',
            )}
          >
            {outcome.results.length > 0 && (
              <div role="listbox" aria-label="Matching problems">
                {outcome.results.map((problem, index) => (
                  <div
                    key={problem.id}
                    id={`${listId}-${problem.id}`}
                    role="option"
                    aria-selected={!stale && index === active}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      if (!stale) choose(problem);
                    }}
                    onMouseEnter={() => setActive(index)}
                    className={cx(
                      'flex h-9 cursor-pointer items-center gap-2 rounded-xs px-2 text-base text-fg',
                      !stale && index === active && 'bg-raised',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{problemTitle(problem)}</span>
                    <PlatformBadge platform={problem.platform} />
                  </div>
                ))}
              </div>
            )}
            {outcome.message && (
              <div role="status" className="px-2 py-2 text-sm text-fg-muted">
                {outcome.message}
              </div>
            )}
            {outcome.unknown && (
              <div className="px-2 pt-1 pb-1">
                <Button variant="secondary" size="sm" disabled={stale} onMouseDown={(event) => event.preventDefault()} onClick={addUnknown}>
                  Add it
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
