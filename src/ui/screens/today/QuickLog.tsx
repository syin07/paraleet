import { useEffect, useState, type RefObject } from 'react';
import type { ProblemSummary } from '../../../bridge/contract';
import { api } from '../../bridge';
import { PlatformBadge } from '../../components/Badges';
import { Input } from '../../components/Field';
import { Card } from '../../components/Layout';
import { cx, problemTitle } from '../../lib/format';

interface Outcome {
  results: ProblemSummary[];
  message: string | null;
}
const NONE: Outcome = { results: [], message: null };

function lookup(query: string): Promise<Outcome> {
  if (/^http/i.test(query)) {
    return api()
      .parseProblemUrl({ url: query })
      .then((parsed): Outcome => {
        if (!parsed.ok) return { results: [], message: parsed.reason };
        if (!parsed.known) {
          return { results: [], message: 'ParaLeet does not know this problem yet. Add it from the Problems screen.' };
        }
        return { results: [parsed.known], message: null };
      });
  }
  return api()
    .searchProblems({ query })
    .then((results): Outcome => ({ results, message: results.length === 0 ? 'No matching problem.' : null }));
}

/** One input that finds any problem the app knows, by search or by pasted URL, then opens the report form. */
export function QuickLog({
  inputRef,
  onPick,
}: {
  /** Wraps the input; the shared Input has no ref prop, so the screen finds the input inside it. */
  inputRef: RefObject<HTMLDivElement | null>;
  onPick: (problemId: number) => void;
}) {
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
          if (live) setOutcome({ results: [], message: cause instanceof Error ? cause.message : String(cause) });
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

  function onKeyDown(event: React.KeyboardEvent): void {
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
      }
    } else if (event.key === 'Escape' && text !== '') {
      event.stopPropagation();
      change('');
    }
  }

  const open = text.trim() !== '' && (outcome.results.length > 0 || outcome.message !== null);

  return (
    <Card padding="compact">
      <h2 className="section-label mb-2">Log another problem</h2>
      <div className="relative" ref={inputRef}>
        <Input
          role="combobox"
          aria-label="Paste a problem URL or search"
          aria-expanded={open}
          aria-controls="quick-log-results"
          aria-autocomplete="list"
          value={text}
          placeholder="Paste a problem URL or search"
          onChange={(event) => change(event.target.value)}
          onKeyDown={onKeyDown}
        />
        {open && (
          <div
            id="quick-log-results"
            role="listbox"
            className="absolute top-full right-0 left-0 z-10 mt-1 rounded-md border border-line bg-surface p-1 shadow-popover"
          >
            {outcome.results.map((problem, index) => (
              <div
                key={problem.id}
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(problem);
                }}
                onMouseEnter={() => setActive(index)}
                className={cx(
                  'flex h-9 cursor-pointer items-center gap-2 rounded-xs px-2 text-base text-fg',
                  index === active && 'bg-raised',
                )}
              >
                <span className="min-w-0 flex-1 truncate">{problemTitle(problem)}</span>
                <PlatformBadge platform={problem.platform} />
              </div>
            ))}
            {outcome.message && (
              <div role="status" className="px-2 py-2 text-sm text-fg-muted">
                {outcome.message}
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
