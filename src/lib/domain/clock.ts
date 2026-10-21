/**
 * Clock injection for time-dependent domain code. Domain code MUST accept a
 * `Clock` rather than calling `Date.now()`/`new Date()` directly, so tests
 * can freeze time deterministically. Enforced by
 * `src/lib/domain/convention.test.ts`.
 */
export type Clock = {
  now(): Date;
};

export const systemClock: Clock = {
  now: () => new Date(),
};

export function createFixedClock(isoTimestamp: string): Clock {
  const fixed = new Date(isoTimestamp);
  return { now: () => new Date(fixed.getTime()) };
}

/** A clock that advances by a fixed step every time `now()` is read — useful for testing ordering. */
export function createTickingClock(startIso: string, stepMs: number): Clock {
  let current = new Date(startIso).getTime();
  return {
    now: () => {
      const d = new Date(current);
      current += stepMs;
      return d;
    },
  };
}
