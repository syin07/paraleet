// The app's only source of time. core never reads the system clock: main passes `clock.now()` and
// `clock.timeZone()` in. Tests and end-to-end runs use `FakeClock`.
import { readlinkSync } from 'node:fs';

export interface Clock {
  now(): Date;
  /** The current IANA time zone, for example `America/Los_Angeles`. */
  timeZone(): string;
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads the zone from macOS on every call. A long-running process can keep a stale zone in its
 * JavaScript engine after the user travels, so the system link is asked first.
 */
function systemTimeZone(): string {
  try {
    const match = /zoneinfo\/(.+)$/.exec(readlinkSync('/etc/localtime'));
    if (match?.[1] && isValidTimeZone(match[1])) return match[1];
  } catch {
    // Not a symlink on this system; fall through.
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export const systemClock: Clock = {
  now: () => new Date(),
  timeZone: systemTimeZone,
};

/** A clock that only moves when told to. */
export class FakeClock implements Clock {
  private current: Date;
  private zone: string;

  constructor(start: Date | string, timeZone: string) {
    this.current = new Date(start);
    if (Number.isNaN(this.current.getTime())) throw new Error(`Invalid fake time: ${String(start)}`);
    if (!isValidTimeZone(timeZone)) throw new Error(`Invalid fake time zone: ${timeZone}`);
    this.zone = timeZone;
  }

  now(): Date {
    return new Date(this.current);
  }

  timeZone(): string {
    return this.zone;
  }

  set(instant: Date | string): void {
    const next = new Date(instant);
    if (Number.isNaN(next.getTime())) throw new Error(`Invalid fake time: ${String(instant)}`);
    this.current = next;
  }

  setTimeZone(timeZone: string): void {
    if (!isValidTimeZone(timeZone)) throw new Error(`Invalid fake time zone: ${timeZone}`);
    this.zone = timeZone;
  }
}
