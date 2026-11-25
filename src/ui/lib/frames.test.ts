import { describe, expect, it } from 'vitest';
import { wrapFrame } from './frames';

describe('wrapFrame', () => {
  it('wraps negative, fractional and large frames into range, like renderSprite', () => {
    expect(wrapFrame(0, 4)).toBe(0);
    expect(wrapFrame(5, 4)).toBe(1);
    expect(wrapFrame(-1, 4)).toBe(3);
    expect(wrapFrame(-9, 4)).toBe(3);
    expect(wrapFrame(2.7, 4)).toBe(2);
    expect(wrapFrame(-0.5, 4)).toBe(0);
    expect(wrapFrame(1e12 + 1, 6)).toBeGreaterThanOrEqual(0);
    expect(wrapFrame(1e12 + 1, 6)).toBeLessThan(6);
    expect(wrapFrame(NaN, 4)).toBe(0);
    expect(wrapFrame(Infinity, 4)).toBe(0);
  });
});
