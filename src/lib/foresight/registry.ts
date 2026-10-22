/**
 * Foresight claims registry: every forward-looking claim is registered with
 * a timestamp BEFORE it can be scored, and resolved later against what
 * actually happened. The timestamped record is the anti-hindsight-bias
 * defense — nobody can claim "we knew it all along" after the fact because
 * the claim and its confidence were logged before resolution.
 */
export interface ForesightClaim {
  id: string;
  statement: string;
  /** Linked Part 12 hypothesis id, when this claim formalizes a registered hypothesis. */
  linkedHypothesisId?: string;
  /** Linked scenario id, when this claim is "scenario X's key driver will/won't materialize". */
  linkedScenarioId?: string;
  /** Forecast probability in [0,1] that the statement will resolve true. */
  confidence: number;
  horizon: string;
  registeredAt: string;
  registeredBy: string;
  status: "open" | "resolved";
  outcome?: boolean;
  resolvedAt?: string;
  resolutionNote?: string;
  brierComponent?: number;
}

export class BackdatingViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackdatingViolation";
  }
}

export interface RegisterForesightInput {
  id: string;
  statement: string;
  confidence: number;
  horizon: string;
  registeredBy: string;
  linkedHypothesisId?: string;
  linkedScenarioId?: string;
  registeredAt?: string;
}

export function registerForesight(input: RegisterForesightInput): ForesightClaim {
  if (input.confidence < 0 || input.confidence > 1) {
    throw new Error(`Confidence must be in [0,1], got ${input.confidence}.`);
  }
  return {
    id: input.id,
    statement: input.statement,
    linkedHypothesisId: input.linkedHypothesisId,
    linkedScenarioId: input.linkedScenarioId,
    confidence: input.confidence,
    horizon: input.horizon,
    registeredAt: input.registeredAt ?? new Date().toISOString(),
    registeredBy: input.registeredBy,
    status: "open",
  };
}

/**
 * Resolve a claim with an outcome. Guards against backdating: the
 * resolution timestamp can never precede the registration timestamp, and
 * an already-resolved claim cannot be re-resolved (no quietly rewriting
 * the record after the fact).
 */
export function resolveForesight(claim: ForesightClaim, outcome: boolean, resolutionNote: string, resolvedAt: string = new Date().toISOString()): ForesightClaim {
  if (claim.status === "resolved") {
    throw new BackdatingViolation(`Claim "${claim.id}" is already resolved; resolutions are immutable.`);
  }
  if (new Date(resolvedAt).getTime() < new Date(claim.registeredAt).getTime()) {
    throw new BackdatingViolation(`Claim "${claim.id}" cannot resolve (${resolvedAt}) before it was registered (${claim.registeredAt}).`);
  }
  const brierComponent = (claim.confidence - (outcome ? 1 : 0)) ** 2;
  return { ...claim, status: "resolved", outcome, resolvedAt, resolutionNote, brierComponent };
}

/** Mean Brier score across resolved claims — 0 is perfect calibration, 0.25 is "always said 50/50", 1 is maximally wrong. */
export function brierScore(claims: ForesightClaim[]): number {
  const resolved = claims.filter((c) => c.status === "resolved" && c.brierComponent !== undefined);
  if (resolved.length === 0) return NaN;
  return resolved.reduce((sum, c) => sum + (c.brierComponent ?? 0), 0) / resolved.length;
}

export const SEED_FORESIGHT_CLAIMS: ForesightClaim[] = [
  resolveForesight(
    registerForesight({
      id: "fc-001",
      statement: "A mid-market bundler feature would reach GA within 4 months of first signal.",
      confidence: 0.55,
      horizon: "2026-Q1",
      registeredBy: "strategy-desk",
      linkedHypothesisId: "hyp-12-011",
      linkedScenarioId: "scn-platform-capture",
      registeredAt: "2025-12-12T10:00:00.000Z",
    }),
    true,
    "Bundler reached GA in week 14, inside the 4-month window.",
    "2026-03-20T09:00:00.000Z"
  ),
  resolveForesight(
    registerForesight({
      id: "fc-002",
      statement: "A binding AI-audit statute would pass in at least one core market within 6 months of first signal.",
      confidence: 0.35,
      horizon: "2026-Q2",
      registeredBy: "strategy-desk",
      linkedHypothesisId: "hyp-12-003",
      linkedScenarioId: "scn-regulatory-clampdown",
      registeredAt: "2025-11-06T10:00:00.000Z",
    }),
    false,
    "No statute finalized within the window; drafts remain in committee.",
    "2026-05-10T09:00:00.000Z"
  ),
  registerForesight({
    id: "fc-003",
    statement: "Open-weight model quality will close to within 5% of frontier benchmark scores within 9 months of first signal.",
    confidence: 0.6,
    horizon: "2026-Q4",
    registeredBy: "strategy-desk",
    linkedHypothesisId: "hyp-12-017",
    linkedScenarioId: "scn-fragmented-frontier",
    registeredAt: "2026-02-22T10:00:00.000Z",
  }),
];
