/** Wraps any frame number (negative, fractional or huge) into 0..count-1, as `renderSprite` does. */
export function wrapFrame(frame: number, count: number): number {
  const whole = Number.isFinite(frame) ? Math.trunc(frame) : 0;
  return ((whole % count) + count) % count;
}
