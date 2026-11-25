// Problems: everything the user has logged, with search, filters, sorting, a detail drawer and
// "Add problem" by URL (PRD sections 5, 8 and 11; docs/design-references.md, section 4).
import { Plus, Search, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { TOPICS, topicLabel, type TopicId } from '../../../core/topics';
import { api } from '../../bridge';
import { AddProblemDialog } from '../../components/AddProblemDialog';
import { Button } from '../../components/Button';
import { Input } from '../../components/Field';
import { EmptyState, QueryNotice } from '../../components/Layout';
import { PLATFORM_LABELS, type DifficultyTone } from '../../lib/format';
import { useBridgeQuery } from '../../lib/useBridgeQuery';
import { PLATFORMS, type Platform } from '../../../core/types';
import { FilterMenu, type FilterOption } from './FilterMenu';
import { ProblemDrawer, type FailedSave } from './ProblemDrawer';
import { NoMatches, ProblemTable } from './ProblemTable';
import {
  DEFAULT_SORT,
  filterRows,
  NO_FILTERS,
  sortRows,
  type Filters,
  type Sort,
  type SortKey,
  type StatusKey,
} from './problemsModel';

const DIFFICULTY_OPTIONS: FilterOption<DifficultyTone>[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
  { value: 'none', label: 'No rating' },
];
const DIFFICULTY_LABELS = Object.fromEntries(DIFFICULTY_OPTIONS.map((option) => [option.value, option.label]));

const STATUS_OPTIONS: FilterOption<StatusKey>[] = [
  { value: 'due', label: 'Due' },
  { value: 'active', label: 'Active' },
  { value: 'retired', label: 'Retired' },
];

const PLATFORM_OPTIONS: FilterOption<Platform>[] = PLATFORMS.map((value) => ({ value, label: PLATFORM_LABELS[value] }));

export function ProblemsScreen() {
  const logged = useBridgeQuery(() => api().listLoggedProblems());
  const todayView = useBridgeQuery(() => api().getToday());
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);
  // `nonce` changes on every opening, so each opening of the drawer fetches fresh details.
  const [selection, setSelection] = useState<{ id: number; nonce: number } | null>(null);
  const selectedId = selection?.id ?? null;
  const nonce = useRef(0);
  const [restore, setRestore] = useState<FailedSave | null>(null);
  const lastFailure = useRef<FailedSave | null>(null);

  function select(problemId: number | null): void {
    // A drawer the user opens themselves starts a clean slate for failed saves.
    if (problemId !== null) lastFailure.current = null;
    if (problemId === null) setSelection(null);
    else setSelection((current) => (current?.id === problemId ? current : { id: problemId, nonce: ++nonce.current }));
  }

  /** A save failed while the drawer closed: open that problem again with the text and the error. */
  function onSaveFailed(failed: FailedSave): void {
    const previous = lastFailure.current;
    lastFailure.current = failed;
    // The same text failing again after the user saw the error: let them close it.
    if (previous?.problemId === failed.problemId && JSON.stringify(previous.draft) === JSON.stringify(failed.draft)) {
      return;
    }
    setRestore(failed);
    setSelection({ id: failed.problemId, nonce: ++nonce.current });
  }
  const [adding, setAdding] = useState(false);

  const rows = logged.data;
  const today = todayView.data?.today;
  const visible = useMemo(() => (rows ? sortRows(filterRows(rows, filters), sort) : []), [rows, filters, sort]);

  const topicOptions = useMemo<FilterOption<TopicId>[]>(() => {
    const present = new Set(rows?.flatMap((row) => row.problem.topics));
    return TOPICS.filter((topic) => present.has(topic.id)).map((topic) => ({ value: topic.id, label: topic.label }));
  }, [rows]);

  function changeSort(key: SortKey): void {
    setSort((current) =>
      current.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' },
    );
  }

  const chips: { id: string; label: string; remove: () => void }[] = [
    ...filters.platforms.map((value) => ({
      id: `platform-${value}`,
      label: PLATFORM_LABELS[value],
      remove: () => setFilters({ ...filters, platforms: filters.platforms.filter((item) => item !== value) }),
    })),
    ...filters.topics.map((value) => ({
      id: `topic-${value}`,
      label: topicLabel(value),
      remove: () => setFilters({ ...filters, topics: filters.topics.filter((item) => item !== value) }),
    })),
    ...filters.difficulties.map((value) => ({
      id: `difficulty-${value}`,
      label: DIFFICULTY_LABELS[value] ?? value,
      remove: () => setFilters({ ...filters, difficulties: filters.difficulties.filter((item) => item !== value) }),
    })),
    ...filters.statuses.map((value) => ({
      id: `status-${value}`,
      label: STATUS_OPTIONS.find((option) => option.value === value)?.label ?? value,
      remove: () => setFilters({ ...filters, statuses: filters.statuses.filter((item) => item !== value) }),
    })),
  ];
  const nothingLogged = rows !== undefined && rows.length === 0;

  return (
    // The drawer is positioned against this box, which fills the screen area.
    <div className="relative h-full">
      <div className="h-full overflow-y-auto">
        <div className="mx-0 max-w-[960px] px-6 pt-2 pb-10 min-[960px]:px-10">
          <header className="mb-6 flex min-h-8 items-center gap-3">
            <h1 className="text-xl font-semibold text-fg">Problems</h1>
            {rows && <div className="text-sm text-fg-muted">{rows.length} logged</div>}
            <div className="ml-auto">
              <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
                Add problem
              </Button>
            </div>
          </header>

          {!rows || !today ? (
            <QueryNotice loading={logged.loading || todayView.loading} error={logged.error ?? todayView.error} />
          ) : nothingLogged ? (
            <div className="rounded-md border border-line bg-surface">
              <EmptyState
                title="No problems yet"
                line="Solve today's problem or add one by URL"
                action={<Button onClick={() => setAdding(true)}>Add problem</Button>}
              />
            </div>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="relative w-[200px] min-[960px]:w-[280px]">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-fg-muted"
                    aria-hidden
                  />
                  <Input
                    type="search"
                    aria-label="Search problems"
                    placeholder="Search title or ID"
                    value={filters.query}
                    onChange={(event) => setFilters({ ...filters, query: event.target.value })}
                    className="pl-8"
                  />
                </div>
                <FilterMenu
                  label="Platform"
                  options={PLATFORM_OPTIONS}
                  selected={filters.platforms}
                  onChange={(platforms) => setFilters({ ...filters, platforms })}
                />
                <FilterMenu
                  label="Topic"
                  options={topicOptions}
                  selected={filters.topics}
                  onChange={(topics) => setFilters({ ...filters, topics })}
                />
                <FilterMenu
                  label="Difficulty"
                  options={DIFFICULTY_OPTIONS}
                  selected={filters.difficulties}
                  onChange={(difficulties) => setFilters({ ...filters, difficulties })}
                />
                <FilterMenu
                  label="Status"
                  options={STATUS_OPTIONS}
                  selected={filters.statuses}
                  onChange={(statuses) => setFilters({ ...filters, statuses })}
                />
              </div>

              {chips.length > 0 && (
                <div className="mb-3 flex flex-wrap items-center gap-1.5" data-testid="filter-chips">
                  {chips.map((chip) => (
                    <span
                      key={chip.id}
                      className="inline-flex h-6 items-center gap-1 rounded-xs bg-accent-subtle pr-1 pl-2 text-sm text-fg"
                    >
                      {chip.label}
                      <button
                        type="button"
                        aria-label={`Remove filter ${chip.label}`}
                        onClick={chip.remove}
                        className="focus-ring flex h-4 w-4 items-center justify-center rounded-xs text-fg-secondary hover:text-fg"
                      >
                        <X className="h-3 w-3" aria-hidden />
                      </button>
                    </span>
                  ))}
                  <Button variant="ghost" size="sm" onClick={() => setFilters(NO_FILTERS)}>
                    Clear
                  </Button>
                </div>
              )}

              <ProblemTable
                rows={visible}
                today={today}
                sort={sort}
                onSort={changeSort}
                selectedId={selectedId}
                onOpen={select}
                empty={<NoMatches onClear={() => setFilters(NO_FILTERS)} />}
              />
            </>
          )}
        </div>
      </div>

      {selection && (
        <ProblemDrawer
          key={selection.nonce}
          problemId={selection.id}
          restore={restore}
          onRestoreUsed={() => setRestore(null)}
          onSaveFailed={onSaveFailed}
          onClose={() => select(null)}
        />
      )}
      {adding && (
        <AddProblemDialog
          onClose={() => setAdding(false)}
          onAdded={(problem) => {
            setAdding(false);
            select(problem.id);
          }}
        />
      )}
    </div>
  );
}
