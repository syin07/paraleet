import { describe, expect, it } from 'vitest';
import { formatInterval } from './formatInterval';

describe('formatInterval', () => {
  it('says tomorrow for one day', () => expect(formatInterval(1)).toBe('tomorrow'));
  it('counts days from 2 to 13', () => {
    expect(formatInterval(2)).toBe('in 2 days');
    expect(formatInterval(13)).toBe('in 13 days');
  });
  it('rounds to weeks from 14 to 55', () => {
    expect(formatInterval(14)).toBe('in about 2 weeks');
    expect(formatInterval(17)).toBe('in about 2 weeks');
    expect(formatInterval(18)).toBe('in about 3 weeks');
    expect(formatInterval(55)).toBe('in about 8 weeks');
  });
  it('rounds to months from 56 to 364, at least 2', () => {
    expect(formatInterval(56)).toBe('in about 2 months');
    expect(formatInterval(173)).toBe('in about 6 months');
    expect(formatInterval(364)).toBe('in about 12 months');
  });
  it('says about a year from 365 to 547', () => {
    expect(formatInterval(365)).toBe('in about a year');
    expect(formatInterval(547)).toBe('in about a year');
  });
  it('rounds to years from 548, at least 2', () => {
    expect(formatInterval(548)).toBe('in about 2 years');
    expect(formatInterval(773)).toBe('in about 2 years');
    expect(formatInterval(2859)).toBe('in about 8 years');
  });
  it('treats anything that is not a number of at least 1 as 1', () => {
    for (const bad of [0, -3, 0.4, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(formatInterval(bad)).toBe('tomorrow');
    }
  });
  it('rounds fractions', () => {
    expect(formatInterval(2.4)).toBe('in 2 days');
    expect(formatInterval(2.6)).toBe('in 3 days');
    expect(formatInterval(1.2)).toBe('tomorrow');
  });
});
