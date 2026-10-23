// Crisis state machine: normal -> elevated -> crisis -> recovery -> post_mortem -> closed
//
// Pure functions only — no DB access — so this module can be unit tested in
// isolation (see src/lib/crisis/__tests__/stateMachine.test.ts) and reused by
// both the API routes and the drill runner.

export type CrisisState =
  | "normal"
  | "elevated"
  | "crisis"
  | "recovery"
  | "post_mortem"
  | "closed";

export const CRISIS_STATES: CrisisState[] = [
  "normal",
  "elevated",
  "crisis",
  "recovery",
  "post_mortem",
  "closed",
];

export type RoleKey =
  | "commander"
  | "deputy_commander"
  | "comms_lead"
  | "ops_lead"
  | "liaison"
  | "scribe"
  | "legal"
  | "board_liaison"
  | "watch_officer";

/**
 * Allowed transitions. "crisis" declaration can be reached directly from
 * "normal" for a sudden severe event (emergency override) as well as via
 * "elevated" for the normal escalation path.
 */
export const ALLOWED_TRANSITIONS: Record<CrisisState, CrisisState[]> = {
  normal: ["elevated", "crisis"], // crisis = emergency override, skips elevated
  elevated: ["normal", "crisis"],
  crisis: ["crisis", "recovery"], // crisis->crisis allowed to re-declare/escalate severity
  recovery: ["post_mortem", "crisis"], // recovery can relapse back into crisis
  post_mortem: ["closed"],
  closed: [],
};

/** Roles permitted to *initiate* each transition, independent of authority grants. */
export const TRANSITION_INITIATORS: Record<string, RoleKey[]> = {
  "normal->elevated": ["watch_officer", "commander", "ops_lead"],
  "elevated->normal": ["watch_officer", "commander"],
  "normal->crisis": ["commander", "deputy_commander", "board_liaison"],
  "elevated->crisis": ["commander", "deputy_commander", "board_liaison"],
  "crisis->crisis": ["commander", "deputy_commander"],
  "crisis->recovery": ["commander", "deputy_commander"],
  "recovery->post_mortem": ["commander", "scribe"],
  "recovery->crisis": ["commander", "deputy_commander", "watch_officer"],
  "post_mortem->closed": ["commander", "scribe"],
};

export function transitionKey(from: CrisisState, to: CrisisState): string {
  return `${from}->${to}`;
}

export function canTransition(from: CrisisState, to: CrisisState): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export interface TransitionRequest {
  from: CrisisState;
  to: CrisisState;
  initiatorRoleKeys: RoleKey[];
  /** True if the crisis class requires dual declaration for a *declaration* transition. */
  requiresDualDeclaration?: boolean;
  /** Number of distinct, independent qualifying declarers supplied for this transition. */
  declarerCount?: number;
  /** When the commander is compromised, commander-only authority must reroute. */
  commanderCompromised?: boolean;
}

export interface TransitionResult {
  ok: boolean;
  reason?: string;
}

const DECLARATION_TRANSITIONS = new Set(["normal->crisis", "elevated->crisis"]);

/**
 * Validates a proposed transition against the state machine shape AND the
 * role/declaration rules. This does not check per-action authority grants
 * (see authority.ts) — it only governs the state machine itself.
 */
export function validateTransition(req: TransitionRequest): TransitionResult {
  const { from, to } = req;

  if (!canTransition(from, to)) {
    return { ok: false, reason: `Transition ${from} -> ${to} is not allowed by the state machine.` };
  }

  const key = transitionKey(from, to);
  const allowedInitiators = TRANSITION_INITIATORS[key] ?? [];

  // Phase 5 scenario: commander compromised. Commander-only authority reroutes
  // to deputy_commander + board_liaison — commander alone can no longer act.
  let effectiveInitiators = req.initiatorRoleKeys;
  if (req.commanderCompromised) {
    effectiveInitiators = effectiveInitiators.filter((r) => r !== "commander");
  }

  const hasAllowedInitiator = effectiveInitiators.some((r) => allowedInitiators.includes(r));
  if (!hasAllowedInitiator) {
    return {
      ok: false,
      reason: req.commanderCompromised
        ? `No eligible initiator: commander is marked compromised for this crisis, and none of [${effectiveInitiators.join(", ") || "none"}] hold ${allowedInitiators.join(" or ")} authority.`
        : `None of the supplied roles [${req.initiatorRoleKeys.join(", ") || "none"}] may initiate ${key}. Allowed: ${allowedInitiators.join(", ")}.`,
    };
  }

  if (DECLARATION_TRANSITIONS.has(key) && req.requiresDualDeclaration) {
    const count = req.declarerCount ?? 0;
    if (count < 2) {
      return {
        ok: false,
        reason: `This crisis class requires dual declaration (>=2 independent authorized declarers). Received ${count}.`,
      };
    }
  }

  return { ok: true };
}

/** Automatic elevation evaluator — simulates Part 13 sensing + Part 29 risk triggers. */
export interface AutoElevationSignal {
  source: string;
  severity: number; // 1..5
  independentSources: number;
}

export interface AutoElevationResult {
  shouldElevate: boolean;
  shouldDeclareCrisis: boolean;
  reason: string;
}

/**
 * SEAM: in a merged system this evaluator would consume real sensing signals
 * (Part 13) and risk-trigger scores (Part 29). Here it implements the same
 * contract against a simplified signal shape so the rule can be tested and
 * later swapped for the real feed without touching the state machine.
 */
export function evaluateAutoElevation(signals: AutoElevationSignal[]): AutoElevationResult {
  if (signals.length === 0) {
    return { shouldElevate: false, shouldDeclareCrisis: false, reason: "No signals." };
  }

  const totalWeight = signals.reduce((sum, s) => sum + s.severity, 0);
  const maxSeverity = Math.max(...signals.map((s) => s.severity));
  const corroborated = signals.filter((s) => s.independentSources >= 2).length;

  // A "signal storm" — many signals arriving together — auto-elevates even if
  // individually each is modest, because correlated weak signals are a strong
  // early-warning pattern (Part 13 concept).
  if (signals.length >= 3 && totalWeight >= 8) {
    if (maxSeverity >= 5 && corroborated >= 1) {
      return {
        shouldElevate: true,
        shouldDeclareCrisis: true,
        reason: `Signal storm of ${signals.length} signals (total severity ${totalWeight}) includes a corroborated severity-5 signal — auto-declaring crisis.`,
      };
    }
    return {
      shouldElevate: true,
      shouldDeclareCrisis: false,
      reason: `Signal storm of ${signals.length} signals (total severity ${totalWeight}) crosses the elevation threshold.`,
    };
  }

  if (maxSeverity >= 5 && corroborated >= 1) {
    return {
      shouldElevate: true,
      shouldDeclareCrisis: true,
      reason: `Corroborated severity-5 signal — auto-declaring crisis.`,
    };
  }

  if (maxSeverity >= 3) {
    return { shouldElevate: true, shouldDeclareCrisis: false, reason: `Severity-${maxSeverity} signal crosses elevation threshold.` };
  }

  return { shouldElevate: false, shouldDeclareCrisis: false, reason: "Below elevation threshold." };
}
