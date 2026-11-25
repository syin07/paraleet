import { addDays } from '../../../core/day';
import { describe, expect, it } from 'vitest';
import { axisTicks, barPercent, dayTooltip, monthMarks, shortDay, weekTooltip } from './statsModel';

const weeks = (starts: string[]) => starts.map((start) => ({ start }));

describe('stats labels', () => {
  it('formats a day from its own parts', () => {
    expect(shortDay('2026-11-12')).toBe('Nov 12');
    expect(shortDay('2026-01-01')).toBe('Jan 1');
  });

  it('says one problem and several problems', () => {
    expect(dayTooltip('2026-11-12', 1)).toBe('Nov 12 · 1 problem');
    expect(dayTooltip('2026-11-12', 2)).toBe('Nov 12 · 2 problems');
  });

  it('shows only the date for a day with nothing', () => {
    expect(dayTooltip('2026-11-13', 0)).toBe('Nov 13');
  });

  it('says one solve and several solves', () => {
    expect(weekTooltip('2026-11-23', 1)).toBe('Week of Nov 23 · 1 solve');
    expect(weekTooltip('2026-11-23', 4)).toBe('Week of Nov 23 · 4 solves');
    expect(weekTooltip('2026-11-23', 0)).toBe('Week of Nov 23 · no solves');
  });
});

describe('monthMarks', () => {
  it('drops an edge label that would touch the next one', () => {
    const marks = monthMarks(weeks(['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']));
    expect(marks).toEqual([{ column: 1, label: 'Nov' }]);
  });

  it('keeps the first label when there is room', () => {
    const marks = monthMarks(weeks(['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02']));
    expect(marks).toEqual([
      { column: 0, label: 'Oct' },
      { column: 4, label: 'Nov' },
    ]);
  });
});

describe('monthMarks across a year change', () => {
  it('labels January after December', () => {
    // Dec starts at column 0 but Jan comes two columns later, so only Jan is kept.
    const marks = monthMarks(weeks(['2025-12-22', '2025-12-29', '2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26']));
    expect(marks).toEqual([{ column: 2, label: 'Jan' }]);
    // With room, both show.
    expect(monthMarks(weeks(['2025-12-01', '2025-12-08', '2025-12-15', '2025-12-22', '2025-12-29', '2026-01-05']))).toEqual([
      { column: 0, label: 'Dec' },
      { column: 5, label: 'Jan' },
    ]);
  });

  it('keeps one label per month over a year that starts in the previous year', () => {
    const starts = Array.from({ length: 53 }, (_, index) => addDays('2025-11-24', index * 7));
    expect(starts.at(-1)).toBe('2026-11-23');
    const marks = monthMarks(weeks(starts));
    // Nov 2025 is dropped (Dec follows at once); Dec 2025 to Nov 2026 is twelve labels, in order.
    expect(marks.map((mark) => mark.label)).toEqual(['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov']);
    expect(marks[0]?.column).toBe(1);
    expect(marks[1]?.column).toBe(6);
  });
});

describe('bars', () => {
  it('uses an even top with whole gridlines', () => {
    expect(axisTicks(0)).toEqual([2, 1, 0]);
    expect(axisTicks(4)).toEqual([4, 2, 0]);
    expect(axisTicks(5)).toEqual([6, 3, 0]);
  });

  it('scales a bar against the top', () => {
    expect(barPercent(3, 6, false)).toBe(50);
    expect(barPercent(0, 6, false)).toBe(0);
  });

  it('keeps the current week visible when it has nothing yet', () => {
    expect(barPercent(0, 6, true)).toBe(3);
    expect(barPercent(6, 6, true)).toBe(100);
  });
});
