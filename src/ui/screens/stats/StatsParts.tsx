import { useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { STATS_RANGES, STATS_RANGE_LABELS, type StatsRange } from '../../../core/stats';
import { cx } from '../../lib/format';

/** The range control: the segmented pattern of Settings, with text values. */
export function RangeControl({ value, onChange }: { value: StatsRange; onChange: (range: StatsRange) => void }) {
  const selected = STATS_RANGES.indexOf(value);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const index = (selected + step + STATS_RANGES.length) % STATS_RANGES.length;
    const next = STATS_RANGES[index];
    if (next) onChange(next);
    event.currentTarget.parentElement?.querySelectorAll('button')[index]?.focus();
  }

  return (
    <div role="radiogroup" aria-label="Range" className="app-no-drag inline-flex h-8 gap-0.5 rounded-sm bg-sunken p-0.5">
      {STATS_RANGES.map((range, index) => (
        <button
          key={range}
          type="button"
          role="radio"
          aria-checked={index === selected}
          tabIndex={index === selected ? 0 : -1}
          onClick={() => onChange(range)}
          onKeyDown={onKeyDown}
          className={cx(
            'focus-ring rounded-xs px-3 text-base transition-colors duration-100',
            index === selected ? 'bg-raised font-medium text-fg' : 'text-fg-secondary hover:text-fg',
          )}
        >
          {STATS_RANGE_LABELS[range]}
        </button>
      ))}
    </div>
  );
}

export function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex h-22 flex-col justify-center rounded-md border border-line bg-surface p-4" role="group" aria-label={label}>
      <div className="text-2xl font-semibold text-fg tabular-nums">{value}</div>
      <div className="text-sm text-fg-muted">{label}</div>
    </div>
  );
}

/** A card with a title, for one chart. */
export function ChartCard({
  title,
  testId,
  className,
  children,
}: {
  title: string;
  testId: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} data-testid={testId} className={cx('min-w-0 rounded-md border border-line bg-surface p-5', className)}>
      <h2 className="mb-4 text-md font-semibold text-fg">{title}</h2>
      {children}
    </section>
  );
}

/** The centered muted line a chart shows before anything is logged. */
export function ChartEmpty({ height }: { height?: number }) {
  return (
    <div className="flex items-center justify-center text-base text-fg-muted" style={height ? { height } : undefined}>
      Your first solve shows up here
    </div>
  );
}

interface TipState {
  text: string;
  x: number;
  y: number;
  /** Below the mark when there is no room above it inside the chart. */
  below: boolean;
}

/** Height of the popover plus its gap: the room needed above a mark. */
const TIP_ROOM = 36;

/**
 * A small popover next to a mark. `container` goes on a `relative` wrapper, `show` on each
 * hoverable element (or `showElement` from the keyboard), and `tip` renders inside the wrapper.
 * It sits above the mark when the wrapper has room, so it never covers the card's title.
 */
export function useTooltip() {
  const container = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<TipState | null>(null);

  /** `anchor` is the part of the mark the popover points at, when that is not the whole element. */
  function showElement(element: HTMLElement, text: string, anchor: HTMLElement = element): void {
    const wrapper = container.current?.getBoundingClientRect();
    if (!wrapper) return;
    const box = element.getBoundingClientRect();
    const mark = anchor.getBoundingClientRect();
    // Keep the popover inside the card even above the first and last column.
    const x = Math.min(Math.max(box.left - wrapper.left + box.width / 2, 72), Math.max(72, wrapper.width - 72));
    const below = mark.top - wrapper.top < TIP_ROOM;
    setState({
      text,
      x, // Below a tall bar the popover tucks in near the bar's top instead of dropping to its foot.
      y: (below ? Math.min(mark.bottom, mark.top + 20) : mark.top) - wrapper.top,
      below,
    });
  }

  function show(event: MouseEvent<HTMLElement>, text: string, anchor?: HTMLElement): void {
    showElement(event.currentTarget, text, anchor);
  }

  const tip = state && (
    <div
      role="tooltip"
      style={{ left: state.x, top: state.y }}
      className={cx(
        'pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border border-line bg-raised px-2.5 py-1 text-sm whitespace-nowrap text-fg shadow-popover',
        state.below ? 'mt-1.5' : '-mt-1.5 -translate-y-full',
      )}
    >
      {state.text}
    </div>
  );

  return { container, show, showElement, hide: () => setState(null), tip };
}
