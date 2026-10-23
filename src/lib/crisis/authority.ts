// Authority matrix — who can commit what during a crisis, pre-approved,
// faster than normal operation, but never invisible (every grant check is
// logged by the caller into crisis_timeline_events).

import type { RoleKey } from "./stateMachine";

export type CrisisAction =
  | "declare_crisis"
  | "transition_state"
  | "assign_role"
  | "approve_external_comms"
  | "send_comms"
  | "publish_status_update"
  | "commit_budget"
  | "confirm_claim"
  | "declare_recovery"
  | "close_post_mortem";

export interface AuthorityGrant {
  roleKey: RoleKey;
  action: CrisisAction;
  /** "normal" grants apply outside of crisis; "crisis" grants are the fast-path. */
  scope: "normal" | "crisis";
  maxCommitUsd?: number;
  requiresDualControl?: boolean;
}

/**
 * The default authority matrix. This is seeded into crisis_authority_grants
 * so it can be edited at runtime without a code deploy, but the defaults live
 * here so tests can exercise the matrix without a DB.
 */
export const DEFAULT_AUTHORITY_MATRIX: AuthorityGrant[] = [
  { roleKey: "commander", action: "declare_crisis", scope: "crisis" },
  { roleKey: "deputy_commander", action: "declare_crisis", scope: "crisis" },
  { roleKey: "board_liaison", action: "declare_crisis", scope: "crisis" },

  { roleKey: "commander", action: "transition_state", scope: "crisis" },
  { roleKey: "deputy_commander", action: "transition_state", scope: "crisis" },
  { roleKey: "watch_officer", action: "transition_state", scope: "crisis" },

  { roleKey: "commander", action: "assign_role", scope: "crisis" },
  { roleKey: "deputy_commander", action: "assign_role", scope: "crisis" },

  { roleKey: "legal", action: "approve_external_comms", scope: "crisis" },

  { roleKey: "comms_lead", action: "send_comms", scope: "crisis" },
  { roleKey: "commander", action: "send_comms", scope: "crisis" },

  { roleKey: "comms_lead", action: "publish_status_update", scope: "crisis" },
  { roleKey: "commander", action: "publish_status_update", scope: "crisis" },

  // Budget commitments during crisis are pre-approved up to a cap, above
  // which dual control (two authorized role-holders) is required — "faster
  // than normal, but never invisible."
  { roleKey: "commander", action: "commit_budget", scope: "crisis", maxCommitUsd: 50000 },
  { roleKey: "ops_lead", action: "commit_budget", scope: "crisis", maxCommitUsd: 10000 },
  {
    roleKey: "commander",
    action: "commit_budget",
    scope: "crisis",
    maxCommitUsd: 250000,
    requiresDualControl: true,
  },

  { roleKey: "scribe", action: "confirm_claim", scope: "crisis" },
  { roleKey: "comms_lead", action: "confirm_claim", scope: "crisis" },
  { roleKey: "commander", action: "confirm_claim", scope: "crisis" },

  { roleKey: "commander", action: "declare_recovery", scope: "crisis" },
  { roleKey: "deputy_commander", action: "declare_recovery", scope: "crisis" },

  { roleKey: "commander", action: "close_post_mortem", scope: "crisis" },
  { roleKey: "scribe", action: "close_post_mortem", scope: "crisis" },
];

export interface AuthorityCheckRequest {
  action: CrisisAction;
  actingRoleKeys: RoleKey[];
  scope?: "normal" | "crisis";
  commitUsd?: number;
  /** For dual-control actions: the distinct set of role-holders co-signing. */
  coSignerRoleKeys?: RoleKey[];
  commanderCompromised?: boolean;
  matrix?: AuthorityGrant[];
}

export interface AuthorityCheckResult {
  allowed: boolean;
  reason: string;
  matchedGrant?: AuthorityGrant;
}

/**
 * Enforces the authority matrix for a single action. Pure function — no DB —
 * so it is directly unit-testable (see __tests__/authority.test.ts).
 */
export function checkAuthority(req: AuthorityCheckRequest): AuthorityCheckResult {
  const matrix = req.matrix ?? DEFAULT_AUTHORITY_MATRIX;
  const scope = req.scope ?? "crisis";

  let actingRoleKeys = req.actingRoleKeys;
  if (req.commanderCompromised) {
    // Phase 5 scenario: a compromised commander cannot exercise commander
    // authority. Deputy commander + board liaison must act instead.
    actingRoleKeys = actingRoleKeys.filter((r) => r !== "commander");
  }

  const candidates = matrix.filter(
    (g) => g.action === req.action && g.scope === scope && actingRoleKeys.includes(g.roleKey),
  );

  if (candidates.length === 0) {
    return {
      allowed: false,
      reason: req.commanderCompromised
        ? `Commander is marked compromised; no other supplied role (${actingRoleKeys.join(", ") || "none"}) is authorized for "${req.action}".`
        : `No role in [${actingRoleKeys.join(", ") || "none"}] is authorized for "${req.action}" in scope "${scope}".`,
    };
  }

  // Pick the best-fitting grant: prefer one whose commit cap covers the
  // requested amount (if any) and that doesn't require dual control unless
  // co-signers were supplied.
  const amount = req.commitUsd ?? 0;

  const fitting = candidates
    .filter((g) => g.maxCommitUsd === undefined || amount <= Number(g.maxCommitUsd))
    .sort((a, b) => (a.maxCommitUsd ?? Infinity) - (b.maxCommitUsd ?? Infinity));

  if (fitting.length === 0) {
    const maxAvailable = Math.max(...candidates.map((g) => Number(g.maxCommitUsd ?? 0)));
    return {
      allowed: false,
      reason: `Requested commitment of $${amount.toLocaleString()} exceeds every available grant for [${actingRoleKeys.join(", ")}] (max $${maxAvailable.toLocaleString()}).`,
    };
  }

  const grant = fitting[0];

  if (grant.requiresDualControl) {
    const coSigners = (req.coSignerRoleKeys ?? []).filter((r) => r !== undefined);
    const distinctCoSigners = new Set(coSigners);
    if (distinctCoSigners.size < 2) {
      return {
        allowed: false,
        reason: `"${req.action}" at this commitment level requires dual control (two distinct authorized role-holders). Received ${distinctCoSigners.size}.`,
        matchedGrant: grant,
      };
    }
  }

  return { allowed: true, reason: `Authorized via role "${grant.roleKey}".`, matchedGrant: grant };
}
