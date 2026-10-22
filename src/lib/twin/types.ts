/**
 * Minimal typed digital-twin surface (Part 06 contract).
 *
 * NOTE ON PROVENANCE: this session's sandbox does not contain the Part 06
 * source tree, so this file re-declares the twin contract this part depends
 * on (typed parameter bundle + deterministic step function) rather than
 * guessing at Part 06 internals. If/when Part 06's actual module lands in
 * the repo, this file should be deleted and imports repointed at it — the
 * shape below is intentionally the same minimal contract Parts 04/05/06
 * are described as producing: a named set of numeric operating parameters,
 * stepped deterministically from a seed.
 */
export interface TwinConfig {
  id: string;
  name: string;
  /** Operating parameters — e.g. revenue growth rate, churn, cash runway months, headcount. */
  parameters: Record<string, number>;
  seed: number;
}

export interface TwinState {
  tick: number;
  metrics: Record<string, number>;
  log: string[];
}

export interface TwinStepOptions {
  /** Additive parameter deltas applied for this tick only (shocks, strategy moves). */
  deltas?: Record<string, number>;
  note?: string;
}
