// Board-tier access scoping. Board materials are among the most sensitive
// data in the platform, so every read/write of governance data MUST go
// through `assertAccess` / `can`. This is enforced in the API route layer,
// not just the UI, and is covered by the access-attempt matrix test in
// scripts/verify.ts.

import type { BoardTier } from "./types";
import { BOARD_TIERS } from "./types";

export type ResourceType =
  | "board_pack_full"
  | "board_pack_committee_scope"
  | "board_pack_public_summary"
  | "resolution_register"
  | "minutes_full"
  | "minutes_public_summary"
  | "information_request"
  | "whistleblower_channel"
  | "conflicts_register"
  | "governance_metrics_aggregate"
  | "governance_metrics_individual";

export type Action = "read" | "write";

export class AccessDeniedError extends Error {
  constructor(tier: string, resource: ResourceType, action: Action) {
    super(`Access denied: tier "${tier}" cannot ${action} "${resource}"`);
    this.name = "AccessDeniedError";
  }
}

function isBoardTier(tier: string): tier is BoardTier {
  return (BOARD_TIERS as readonly string[]).includes(tier);
}

/** Permission matrix. Deliberately explicit (no wildcard default-allow) so
 * adding a new resource type forces a conscious access decision. */
const MATRIX: Record<ResourceType, Partial<Record<BoardTier, Action[]>>> = {
  board_pack_full: {
    chair: ["read", "write"],
    director: ["read"],
    company_secretary: ["read", "write"],
  },
  board_pack_committee_scope: {
    chair: ["read"],
    director: ["read"],
    company_secretary: ["read", "write"],
    audit_committee_chair: ["read"],
    audit_committee: ["read"],
    risk_committee: ["read"],
    compensation_committee: ["read"],
  },
  board_pack_public_summary: {
    chair: ["read"],
    director: ["read"],
    company_secretary: ["read"],
    audit_committee_chair: ["read"],
    audit_committee: ["read"],
    risk_committee: ["read"],
    compensation_committee: ["read"],
    management: ["read"],
    external_auditor: ["read"],
    observer: ["read"],
  },
  resolution_register: {
    chair: ["read", "write"],
    director: ["read", "write"],
    company_secretary: ["read", "write"],
    audit_committee_chair: ["read"],
    audit_committee: ["read"],
    risk_committee: ["read"],
    compensation_committee: ["read"],
    observer: ["read"],
  },
  minutes_full: {
    chair: ["read", "write"],
    director: ["read"],
    company_secretary: ["read", "write"],
  },
  minutes_public_summary: {
    chair: ["read"],
    director: ["read"],
    company_secretary: ["read"],
    audit_committee_chair: ["read"],
    audit_committee: ["read"],
    risk_committee: ["read"],
    compensation_committee: ["read"],
    management: ["read"],
    external_auditor: ["read"],
    observer: ["read"],
  },
  information_request: {
    chair: ["read", "write"],
    director: ["read", "write"],
    company_secretary: ["read", "write"],
    management: ["read", "write"],
  },
  whistleblower_channel: {
    chair: ["read", "write"],
    audit_committee_chair: ["read", "write"],
    audit_committee: ["read", "write"],
  },
  conflicts_register: {
    chair: ["read", "write"],
    director: ["read", "write"],
    company_secretary: ["read", "write"],
    audit_committee_chair: ["read"],
    audit_committee: ["read"],
  },
  governance_metrics_aggregate: {
    chair: ["read"],
    director: ["read"],
    company_secretary: ["read"],
    audit_committee_chair: ["read"],
    audit_committee: ["read"],
    risk_committee: ["read"],
    compensation_committee: ["read"],
  },
  // Individual director scoring is NEVER granted by the static matrix.
  // It can only be unlocked at runtime by a documented governance_policy
  // record (see metrics.ts: assertIndividualScoringPolicy). This entry is
  // intentionally empty — the hard stop is structural, not a tier grant.
  governance_metrics_individual: {},
};

export function can(tier: string, resource: ResourceType, action: Action): boolean {
  if (!isBoardTier(tier)) return false;
  const allowed = MATRIX[resource][tier];
  return Boolean(allowed && allowed.includes(action));
}

export function assertAccess(tier: string, resource: ResourceType, action: Action) {
  if (!can(tier, resource, action)) {
    throw new AccessDeniedError(tier, resource, action);
  }
}

/** Every (tier x resource x action) combination, used to build the
 * exhaustive access-attempt matrix test. */
export function allCombinations(): Array<{
  tier: BoardTier;
  resource: ResourceType;
  action: Action;
  expected: boolean;
}> {
  const resources = Object.keys(MATRIX) as ResourceType[];
  const actions: Action[] = ["read", "write"];
  const out: Array<{
    tier: BoardTier;
    resource: ResourceType;
    action: Action;
    expected: boolean;
  }> = [];
  for (const tier of BOARD_TIERS) {
    for (const resource of resources) {
      for (const action of actions) {
        out.push({ tier, resource, action, expected: can(tier, resource, action) });
      }
    }
  }
  return out;
}
