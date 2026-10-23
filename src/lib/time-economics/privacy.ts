// LEADOS — Part 45: Privacy enforcement matrix for time/calendar data.
//
// STRUCTURAL GUARANTEE (Phase 5 answer, encoded as code not just policy):
// Individual-level time data (interaction events, per-meeting personal
// cost/fragmentation detail, personal strategy-mirror evidence) is
// SELF-OWNED. This module is the single choke point every API route in
// this part must call before returning such data. The rule is NOT
// role-based ("managers can see their reports' data") — it is
// consent-gated: even an admin is denied unless the individual has
// explicitly opted in (`timeDataConsent.allowManagerView`), and every
// decision (allowed or denied) is meant to be written to
// `privacyAuditLog` by the caller using the `reason` string returned
// here. This file is pure (no DB access) so it is trivial to fixture-test
// exhaustively (see src/lib/time-economics/__tests__/privacy.test.ts).

import type { Role } from "./types";

export type TimeDataResource =
  | "individual_interaction_detail" // raw interaction/fragmentation events
  | "individual_meeting_cost_detail" // per-attendee cost line for a specific meeting
  | "individual_strategy_mirror" // personal strategy-time allocation + evidence
  | "loaded_rate" // comp-adjacent loaded hourly rate
  | "aggregate_dashboard"; // team/org rollups, no individual line items

export interface ConsentRecord {
  shareAggregateOnly: boolean;
  allowManagerView: boolean;
}

export interface PrivacyDecision {
  allowed: boolean;
  reason: string;
}

const MIN_AGGREGATE_GROUP_SIZE = 5; // k-anonymity floor for any rollup that could identify one person

export function evaluateTimeDataAccess(
  actor: { id: string; role: Role },
  targetUserId: string,
  resource: TimeDataResource,
  consent: ConsentRecord | null,
): PrivacyDecision {
  // 1) Self always wins — this data is self-owned.
  if (actor.id === targetUserId) {
    return { allowed: true, reason: "Self-access: individual time data is self-owned." };
  }

  // 2) Aggregate dashboards never expose an individual line, so identity
  //    doesn't matter here — the caller is responsible for the
  //    k-anonymity floor via `meetsKAnonymityFloor` before querying.
  if (resource === "aggregate_dashboard") {
    return { allowed: true, reason: "Aggregate dashboard request — subject to k-anonymity floor at query time." };
  }

  // 3) Loaded rate: comp-adjacent, restricted to finance/admin regardless
  //    of consent (needed to run the cost model at all), but still never
  //    exposed as part of an "activity/behavior" surface.
  if (resource === "loaded_rate") {
    if (actor.role === "finance" || actor.role === "admin") {
      return { allowed: true, reason: `Role '${actor.role}' is authorized to view loaded rates for cost modeling.` };
    }
    return { allowed: false, reason: `Role '${actor.role}' is not authorized to view another person's loaded rate.` };
  }

  // 4) Everything else is individual activity/behavior detail: consent-
  //    gated, not role-gated. No consent record = no access, full stop.
  if (!consent) {
    return { allowed: false, reason: "No consent record on file — individual time data defaults to self-view-only." };
  }
  if (!consent.allowManagerView) {
    return { allowed: false, reason: "Target has not opted in to manager/admin visibility of individual time data." };
  }
  if (actor.role !== "manager" && actor.role !== "admin") {
    return {
      allowed: false,
      reason: `Role '${actor.role}' is not a manager/admin role eligible for consented individual-data visibility.`,
    };
  }
  return {
    allowed: true,
    reason: "Target has explicitly opted in (allowManagerView=true) and actor holds an eligible role.",
  };
}

export function meetsKAnonymityFloor(groupSize: number): boolean {
  return groupSize >= MIN_AGGREGATE_GROUP_SIZE;
}

export const PRIVACY_K_ANONYMITY_FLOOR = MIN_AGGREGATE_GROUP_SIZE;
