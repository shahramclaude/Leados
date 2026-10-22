/**
 * Clock abstraction for domain code and tests.
 *
 * Domain code MUST NOT call `Date.now()` / `new Date()` directly (enforced
 * by `eslint.config.mjs` via `no-restricted-properties` /
 * `no-restricted-syntax`). Inject a `Clock` instead so hysteresis windows,
 * decision timestamps, and automation schedules are reproducible in tests
 * (`FixedClock`) while using wall-clock time in production (`SystemClock`).
 */

export interface Clock {
  now(): number;
  nowDate(): Date;
}

export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }
  nowDate(): Date {
    return new Date();
  }
}

/** A clock that is frozen at a point in time until manually advanced. */
export class FixedClock implements Clock {
  private current: number;

  constructor(startMillis: number | Date = 0) {
    this.current =
      startMillis instanceof Date ? startMillis.getTime() : startMillis;
  }

  now(): number {
    return this.current;
  }

  nowDate(): Date {
    return new Date(this.current);
  }

  /** Advance the clock by `ms` milliseconds and return the new time. */
  advance(ms: number): number {
    this.current += ms;
    return this.current;
  }

  /** Jump the clock to an absolute point in time. */
  set(millis: number | Date): void {
    this.current = millis instanceof Date ? millis.getTime() : millis;
  }
}

export const systemClock = new SystemClock();
