// Platform primitive: the only place application code should read "now".
// Domain engines never call `new Date()` or `Date.now()` directly — they
// receive time as an argument — which keeps them pure and testable.
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};
