// LEADOS Agent Kernel — Clock abstraction.
//
// CONTRACT: no module under src/lib/agent/** may call `Date.now()` or
// `new Date()` directly inside planning, policy, critic, or execution logic.
// All time reads must flow through an injected `Clock`. This is what makes
// replay deterministic: a `FixedClock` seeded from the original run's
// timestamps reproduces byte-identical traces. Enforcement:
//   1. eslint `no-restricted-syntax` rule scoped to src/lib/agent/** (see
//      eslint.config.mjs) flags any direct Date.now()/new Date() usage
//      outside this file.
//   2. src/lib/agent/__tests__/no-bare-clock.test.ts greps the source tree
//      for violations as a second, independent enforcement layer.
export interface Clock {
  nowIso(): string;
  nowMs(): number;
}

export class SystemClock implements Clock {
  nowIso(): string {
    return new Date().toISOString();
  }
  nowMs(): number {
    return Date.now();
  }
}

// FixedClock advances by a deterministic step on every read so that
// durations recorded in a replay match the original run without depending
// on wall-clock speed.
export class FixedClock implements Clock {
  private cursorMs: number;
  constructor(
    startMs: number,
    private readonly stepMs: number = 17
  ) {
    this.cursorMs = startMs;
  }
  nowIso(): string {
    return new Date(this.cursorMs).toISOString();
  }
  nowMs(): number {
    const value = this.cursorMs;
    this.cursorMs += this.stepMs;
    return value;
  }
}
