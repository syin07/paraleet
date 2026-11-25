import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, effectiveToday, isParaDay, paraDayOf, weekdayIndex } from './day';

const LA = 'America/Los_Angeles';

describe('paraDayOf', () => {
  it('counts a solve at 01:00 for the previous day', () => {
    // 2026-11-26 01:00 in Los Angeles (UTC-8)
    expect(paraDayOf(new Date('2026-11-26T09:00:00Z'), LA, 4)).toBe('2026-11-25');
  });

  it('starts the new day exactly at the boundary hour', () => {
    expect(paraDayOf(new Date('2026-11-26T11:59:59Z'), LA, 4)).toBe('2026-11-25');
    expect(paraDayOf(new Date('2026-11-26T12:00:00Z'), LA, 4)).toBe('2026-11-26');
  });

  it('uses the given time zone, not the machine one', () => {
    const instant = new Date('2026-11-25T20:00:00Z');
    expect(paraDayOf(instant, 'Asia/Tokyo', 4)).toBe('2026-11-26');
    expect(paraDayOf(instant, LA, 4)).toBe('2026-11-25');
  });

  it('honors a different boundary hour', () => {
    const instant = new Date('2026-11-26T09:00:00Z'); // 01:00 in Los Angeles
    expect(paraDayOf(instant, LA, 0)).toBe('2026-11-26');
    expect(paraDayOf(instant, LA, 2)).toBe('2026-11-25');
  });
});

describe('calendar helpers', () => {
  it('adds days across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('measures whole days between two days', () => {
    expect(daysBetween('2026-11-25', '2026-11-28')).toBe(3);
    expect(daysBetween('2026-11-25', '2026-11-24')).toBe(-1);
  });

  it('knows the weekday with Monday as 0', () => {
    expect(weekdayIndex('2026-11-23')).toBe(0); // a Monday
    expect(weekdayIndex('2026-11-25')).toBe(2); // a Wednesday
    expect(weekdayIndex('2026-11-29')).toBe(6); // a Sunday
  });

  it('recognizes well-formed days only', () => {
    expect(isParaDay('2026-11-25')).toBe(true);
    expect(isParaDay('2026-13-01')).toBe(false);
    expect(isParaDay('2026-02-30')).toBe(false);
    expect(isParaDay('25/11/2026')).toBe(false);
  });
});

describe('effectiveToday', () => {
  it('is the computed day when nothing was fed later', () => {
    expect(effectiveToday('2026-11-25', null)).toBe('2026-11-25');
    expect(effectiveToday('2026-11-25', '2026-11-24')).toBe('2026-11-25');
  });

  it('does not step back behind the last fed day after a move to an earlier time zone', () => {
    expect(effectiveToday('2026-11-25', '2026-11-26')).toBe('2026-11-26');
  });

  it('trusts the clock when the last fed day is implausibly far ahead', () => {
    expect(effectiveToday('2026-11-25', '2026-12-25')).toBe('2026-11-25');
  });
});
