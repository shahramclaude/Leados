// src/lib/prng.ts
//
// Seeded PRNG (mulberry32) so demo data is reproducible: same seed -> same
// event log, every time. This is the same technique disclosed in this
// project lineage's prior sessions for Monte Carlo reproducibility
// (see README "Provenance"); reused here for the same reason, applied to
// synthetic event-log generation instead.

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
