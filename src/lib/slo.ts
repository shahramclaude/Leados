// LEADOS — Part 35 resilience lab.
//
// Stand-in for Part 20's SLO/runbook service. Part 20's artifacts are not
// present in this repository snapshot, so this file declares the minimal set
// of SLOs the chaos harness needs to judge "steady state" objectively. When
// Part 20's real SLO service lands, these constants should be imported from
// there instead of re-declared here (see RESILIENCE.md "integration debt").

export const SLO = {
  apiAvailabilityTarget: 0.999,
  apiLatencyP95Ms: 800,
  dbQueryP95Ms: 300,
  dbDegradedFallbackP95Ms: 1200, // ceiling while serving degraded/cached data
  queueMaxDepth: 50, // backpressure ceiling for the in-process demo queue
  providerErrorRateTripThreshold: 0.3, // breaker opens above this rate
  providerBreakerConsecutiveFailures: 5,
  recoveryRtoMinutes: {
    db: 0.1, // 6s, scaled down for an in-process simulation
    queue: 0.1,
    provider: 0.1,
  },
  recoveryRpoMinutes: {
    invoicing: 15,
    leadSync: 5,
    payments: 1,
    supportEscalation: 30,
    nightlyBackup: 1440,
  },
} as const;

export type SteadyStateSample = {
  calls: number;
  errors: number;
  timeouts: number;
  latenciesMs: number[];
};

export function p95(latenciesMs: number[]): number {
  if (latenciesMs.length === 0) return 0;
  const sorted = [...latenciesMs].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1);
  return sorted[idx];
}

export function errorRate(sample: SteadyStateSample): number {
  if (sample.calls === 0) return 0;
  return sample.errors / sample.calls;
}

export function summarizeSample(sample: SteadyStateSample) {
  return {
    calls: sample.calls,
    errors: sample.errors,
    timeouts: sample.timeouts,
    errorRate: Number(errorRate(sample).toFixed(3)),
    p95Ms: Number(p95(sample.latenciesMs).toFixed(1)),
  };
}
