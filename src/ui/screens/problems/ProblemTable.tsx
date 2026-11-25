// The table of logged problems: sortable header, 40px rows, keyboard up/down and Enter.
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { KeyboardEvent, ReactNode } from 'react';
import type { LoggedProblemRow } from '../../../bridge/contract';
import { topicLabel } from '../../../core/topics';
import type { ParaDay, Rating } from '../../../core/types';
import { DifficultyText, PlatformBadge, StatusBadge } from '../../components/Badges';
import { Button } from '../../components/Button';
import { cx, problemTitle, relativeDay } from '../../lib/format';
import type { Sort, SortKey } from './problemsModel';

// Topics is the first column to go when the window is narrow (under 960px).
const GRID =
  'grid items-center gap-x-2 px-3 grid-cols-[minmax(0,1fr)_82px_140px_84px_88px_88px_76px] max-[959px]:grid-cols-[minmax(0,1fr)_82px_84px_88px_80px_76px]';

const RATING_DOT: Record<Rating, string> = {
  again: 'bg-line-strong',
  hard: 'bg-medium',
  good: 'bg-easy',
  easy: 'bg-easy',
};

const COLUMNS: { key: SortKey | 'topics'; label: string; short?: string; align?: 'right'; hideNarrow?: boolean }[] = [
  { key: 'title', label: 'Title' },
  { key: 'platform', label: 'Platform' },
  { key: 'topics', label: 'Topics', hideNarrow: true },
  { key: 'difficulty', label: 'Difficulty' },
  { key: 'last', label: 'Last attempt', short: 'Last' },
  { key: 'next', label: 'Next review', short: 'Next' },
  { key: 'attempts', label: 'Attempts', align: 'right' },
];

function HeaderCell({ column, sort, onSort }: { column: (typeof COLUMNS)[number]; sort: Sort; onSort: (key: SortKey) => void }) {
  const hide = column.hideNarrow ? 'max-[959px]:hidden' : '';
  const base = cx('section-label', column.align === 'right' && 'text-right', hide);
  if (column.key === 'topics') {
    return (
      <div role="columnheader" className={base}>
        {column.label}
      </div>
    );
  }
  const key = column.key;
  const active = sort.key === key;
  return (
    <div
      role="columnheader"
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cx(base, 'min-w-0')}
    >
      <button
        type="button"
        aria-label={column.label}
        title={column.label}
        onClick={() => onSort(key)}
        className={cx(
          'focus-ring app-no-drag -mx-1 inline-flex max-w-full items-center gap-0.5 rounded-xs px-1 uppercase tracking-[inherit] hover:text-fg',
          active && 'text-fg-secondary',
          column.align === 'right' && 'flex-row-reverse',
        )}
      >
        <span className="truncate">{column.short ?? column.label}</span>
        {active &&
          (sort.dir === 'asc' ? (
            <ChevronUp className="h-3 w-3 shrink-0" aria-hidden />
          ) : (
            <ChevronDown className="h-3 w-3 shrink-0" aria-hidden />
          ))}
      </button>
    </div>
  );
}

function NextReview({ row, today }: { row: LoggedProblemRow; today: ParaDay }) {
  if (!row.card) return <span className="text-fg-muted">—</span>;
  if (row.card.status === 'retired') return <span className="text-fg-muted">Retired</span>;
  if (row.card.isDue) return <StatusBadge>Due</StatusBadge>;
  return <span className="text-fg-secondary">{relativeDay(row.card.dueDay, today)}</span>;
}

function TopicsCell({ topics }: { topics: LoggedProblemRow['problem']['topics'] }) {
  const shown = topics.slice(0, 2);
  const rest = topics.length - shown.length;
  return (
    <div className="flex min-w-0 items-center gap-1 max-[959px]:hidden">
      {shown.map((topic, index) => (
        // The first chip gives way last, so at least one topic stays readable.
        <span
          key={topic}
          className={cx(
            'inline-flex h-5 min-w-0 items-center rounded-xs bg-sunken px-1.5 text-sm text-fg-secondary',
            index === 0 && 'shrink-[0.1]',
          )}
        >
          <span className="truncate">{topicLabel(topic)}</span>
        </span>
      ))}
      {rest > 0 && <span className="shrink-0 text-sm text-fg-muted">+{rest}</span>}
    </div>
  );
}

function moveFocus(event: KeyboardEvent<HTMLElement>): void {
  const rows = [...(event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[data-testid="problem-row"]') ?? [])];
  const index = rows.indexOf(event.currentTarget);
  const next = rows[event.key === 'ArrowDown' ? index + 1 : index - 1];
  if (next) {
    event.preventDefault();
    next.focus();
  }
}

export function ProblemTable({
  rows,
  today,
  sort,
  onSort,
  selectedId,
  onOpen,
  empty,
}: {
  rows: LoggedProblemRow[];
  today: ParaDay;
  sort: Sort;
  onSort: (key: SortKey) => void;
  selectedId: number | null;
  onOpen: (problemId: number) => void;
  /** Shown in place of the rows when there are none. */
  empty: ReactNode;
}) {
  return (
    <div role="table" aria-label="Logged problems" className="overflow-hidden rounded-md border border-line bg-canvas">
      <div role="row" className={cx(GRID, 'h-8 bg-sunken')}>
        {COLUMNS.map((column) => (
          <HeaderCell key={column.key} column={column} sort={sort} onSort={onSort} />
        ))}
      </div>
      {rows.length === 0
        ? empty
        : rows.map((row) => {
            const { problem } = row;
            const selected = problem.id === selectedId;
            return (
              <div
                key={problem.id}
                role="row"
                tabIndex={0}
                data-testid="problem-row"
                aria-selected={selected}
                onClick={() => onOpen(problem.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') onOpen(problem.id);
                  else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') moveFocus(event);
                }}
                className={cx(
                  GRID,
                  'focus-ring relative h-10 border-t border-line-subtle text-base transition-colors duration-100',
                  selected ? 'bg-raised' : 'hover:bg-surface',
                )}
              >
                {selected && <span className="absolute inset-y-0 left-0 w-0.5 bg-accent" aria-hidden />}
                <div role="cell" className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate text-fg" title={problemTitle(problem)}>
                    {problemTitle(problem)}
                  </span>
                  {!problem.displayId && problem.platform !== 'other' && (
                    <span className="shrink-0 font-mono text-sm text-fg-muted max-[959px]:hidden">{problem.platformId}</span>
                  )}
                </div>
                <div role="cell">
                  <PlatformBadge platform={problem.platform} />
                </div>
                <TopicsCell topics={problem.topics} />
                <div role="cell" className="min-w-0 truncate">
                  <DifficultyText raw={problem.difficultyRaw} norm={problem.difficultyNorm} />
                </div>
                <div role="cell" className="flex min-w-0 items-center gap-1.5 text-fg-secondary">
                  <span className="truncate">{relativeDay(row.lastAttemptDay, today)}</span>
                  <span
                    className={cx('h-2 w-2 shrink-0 rounded-full', RATING_DOT[row.lastRating])}
                    title={`Last rated ${row.lastRating}`}
                    aria-label={`Last rated ${row.lastRating}`}
                  />
                </div>
                <div role="cell" className="min-w-0 truncate">
                  <NextReview row={row} today={today} />
                </div>
                <div role="cell" className="text-right tabular-nums text-fg-secondary">
                  {row.attemptCount}
                </div>
              </div>
            );
          })}
    </div>
  );
}

/** The quiet row shown when filters hide everything. */
export function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex h-24 items-center justify-center gap-2 text-base text-fg-muted">
      No problems match these filters
      <Button variant="ghost" size="sm" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}
