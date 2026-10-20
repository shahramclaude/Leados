/**
 * types.ts — the shared vocabulary for LEADOS's belief/explainability
 * subsystem (Part 04). These types are imported by every engine in
 * `src/lib/domain/intelligence/**` and `src/lib/platform/intelligence/**`
 * and by every UI adapter in `src/components/intelligence/**`. There is
 * intentionally only one `Belief` type and one `Explain<T>` type in the
 * whole codebase — see `docs/INTELLIGENCE.md` §1 for the duplication
 * cluster this replaces.
 */

// ---------------------------------------------------------------------------
// Evidence & event envelope (Part 01 compatibility shim)
// ---------------------------------------------------------------------------

/**
 * Part 01 of this program defines the canonical append-only event envelope
 * (`eventType`, `eventVersion`, `payload`, `actor`, `createdAt`) persisted to
 * `event_log` in the real LEADOS repository (see `src/db/schema.ts` /
 * `eventRepository.ts` in https://github.com/shahramclaude/Leados). This
 * sandbox cannot reach that Postgres-backed repository, so
 * `src/lib/platform/intelligence/eventLog.ts` re-implements the identical
 * envelope shape in memory and documents the mapping. Domain code only ever
 * depends on this shape, never on how it is stored.
 */
export type EventEnvelope<TPayload = Record<string, unknown>> = {
  id: string;
  eventType: string;
  eventVersion: string;
  payload: TPayload;
  actor: string;
  createdAt: string; // ISO-8601
};

export type EvidenceRef = {
  /** Either an eventId (from the event envelope) or a metric key. */
  id: string;
  kind: "event" | "metric";
  sourceId: string;
  /** correlated evidence shares a group id so pooling can discount it */
  correlationGroup?: string;
  /** weight actually applied after reliability + decay + correlation cap */
  weightApplied: number;
  observedAt: string; // ISO-8601, when the underlying fact was true
  description: string;
};

// ---------------------------------------------------------------------------
// Distributions
// ---------------------------------------------------------------------------

export type BetaDistribution = { kind: "beta"; alpha: number; beta: number };
export type NormalDistribution = { kind: "normal"; mu: number; sigma: number };
export type CategoricalDistribution = { kind: "categorical"; probs: Record<string, number> };

export type Distribution = BetaDistribution | NormalDistribution | CategoricalDistribution;

export function betaMean(d: BetaDistribution): number {
  return d.alpha / (d.alpha + d.beta);
}

export function betaVariance(d: BetaDistribution): number {
  const { alpha: a, beta: b } = d;
  return (a * b) / ((a + b) ** 2 * (a + b + 1));
}

// ---------------------------------------------------------------------------
// Belief (Part 04-A)
// ---------------------------------------------------------------------------

export type BeliefKind = "binary" | "rate" | "continuous";
export type BeliefMethod = "beta-binomial" | "log-odds-pool" | "gaussian-conjugate" | "ewma" | "ensemble";

export type Belief = {
  proposition: string; // e.g. "person:p123 flight risk within 90d"
  kind: BeliefKind;
  prior: Distribution;
  posterior: Distribution;
  interval: { lo: number; hi: number; mass: 0.68 | 0.95 };
  evidence: EvidenceRef[];
  sourceReliability: Record<string, number>;
  updatedAt: string;
  asOf: string;
  method: BeliefMethod;
};

// ---------------------------------------------------------------------------
// Explain<T> contract (Part 04-B) — the ONLY way a score may reach a view.
// ---------------------------------------------------------------------------

export type Driver = {
  factor: string;
  contribution: number; // signed, same units as `value` where possible
  direction: "up" | "down";
  evidence: EvidenceRef[];
};

export type Explain<T> = {
  value: T;
  interval?: { lo: number; hi: number };
  drivers: Driver[];
  evidence: EvidenceRef[];
  method: string;
  asOf: string;
  counterfactual?: { change: string; newValue: T }[];
};

/** Runtime type guard so adapters/tests can assert "this is not a bare
 * number" without relying purely on the type system (see
 * `explainContract.test.ts`). */
export function isExplain(x: unknown): x is Explain<unknown> {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    "value" in o &&
    Array.isArray(o.drivers) &&
    Array.isArray(o.evidence) &&
    typeof o.method === "string" &&
    typeof o.asOf === "string"
  );
}

// ---------------------------------------------------------------------------
// Source reliability (Part 04-C)
// ---------------------------------------------------------------------------

export type ResolvedPrediction = { p: number; outcome: 0 | 1; resolvedAt: string };

export type SourceReliabilityRecord = {
  sourceId: string;
  reliability: number; // in [0,1], shrunk toward 0.5 for sparse history
  resolvedCount: number;
  brierScore: number | null; // null if never resolved
  neverResolved: boolean;
};

// ---------------------------------------------------------------------------
// Severity / findings (Part 04-E)
// ---------------------------------------------------------------------------

export type Severity = 1 | 2 | 3 | 4 | 5;

export type RawSignal = {
  id: string;
  rootCauseKey: string; // signals sharing this key are the same root cause
  sourceId: string;
  score: number; // 0..1
  observedAt: string;
  description: string;
  evidence: EvidenceRef[];
};

export type SeverityHistoryEntry = { at: string; score: number; level: Severity };

export type Finding = {
  id: string;
  rootCauseKey: string;
  parentId: string | null; // null = root finding, else links to the parent
  severity: Severity;
  belowStreak: number; // consecutive evals below current level's down-threshold
  score: number;
  history: SeverityHistoryEntry[];
  recommendedActions: string[];
  interruptPolicy: { mayInterrupt: boolean; requiresOptIn: boolean };
  evidence: EvidenceRef[];
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Forecasting (Part 04-F)
// ---------------------------------------------------------------------------

export type ForecastAssumption = { name: string; detail: string };

export type ModelCard = {
  inputs: Record<string, unknown>;
  method: string;
  modelVersion: string;
  knownFailures: string[];
};

export type Forecast = {
  p10: number;
  p50: number;
  p90: number;
  histogram: { binLo: number; binHi: number; count: number }[];
  assumptions: ForecastAssumption[];
  modelCard: ModelCard;
  asOf: string;
  inputsHash: string;
};
