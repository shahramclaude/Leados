// LEADOS Part 25 — adaptive cadence policy engine + simulator.
//
// Cadence intensity is a POLICY, not a hidden heuristic: every rule is a
// typed, serializable `CadenceRule` row a human can read, edit, and — most
// importantly — simulate against history before it takes effect ("this
// policy would have skipped 3 reviews last quarter — is that intended?").
//
// The evaluation and simulation functions below are pure (no DB access) so
// they can be unit-tested against seeded histories and checked against a
// hand-computed answer (Phase 4 gate 4). `simulatePolicyAgainstHistory` is
// the thin DB-backed wrapper used by the API route.
import { db } from "@/db";
import { cadenceOverrides, cadencePolicies, ritualOccurrences } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { assertNoFiller } from "@/lib/zeroFillerLint";
import type { CadenceRule, OccurrenceSummary, PolicyDecisionResult, SimulationResult } from "./types";

/** Pure: evaluates a single rule against the N most-recent prior occurrence
 * summaries (summaries[0] = most recent). Does not know about overrides —
 * callers apply an override on top of this result (see resolveCadenceMode). */
export function evaluateCadenceRule(rule: CadenceRule, priorOccurrences: OccurrenceSummary[]): PolicyDecisionResult {
  if (rule.kind === "always_full") {
    return { mode: "full", reason: "Policy is \"always_full\": no degradation condition is configured." };
  }

  const window = priorOccurrences.slice(0, rule.anomalyFreeOccurrences);
  if (window.length < rule.anomalyFreeOccurrences) {
    const reason = `Only ${window.length} of the required ${rule.anomalyFreeOccurrences} prior occurrence(s) exist — defaulting to full cadence until enough history accrues.`;
    assertNoFiller(reason, "cadence policy reason");
    return { mode: "full", reason };
  }

  const maxVariance = Math.max(0, ...window.map((o) => Math.abs(o.variancePct)));
  const totalAnomalies = window.reduce((a, o) => a + o.anomalyCount, 0);
  const qualifies = maxVariance < rule.varianceThresholdPct && totalAnomalies === 0;

  if (qualifies) {
    const reason = `Max variance across the last ${window.length} occurrence(s) was ${maxVariance}% (< ${rule.varianceThresholdPct}% threshold) with 0 anomalies — degrading to ${rule.degradeTo}.`;
    assertNoFiller(reason, "cadence policy reason");
    return { mode: rule.degradeTo, reason };
  }

  const reason = `Max variance across the last ${window.length} occurrence(s) was ${maxVariance}% and ${totalAnomalies} anomal${totalAnomalies === 1 ? "y was" : "ies were"} observed — staying at full cadence.`;
  assertNoFiller(reason, "cadence policy reason");
  return { mode: "full", reason };
}

/** Pure: runs a rule across an entire ordered history (oldest first),
 * re-evaluating at each point using only occurrences strictly before it —
 * exactly what the simulator needs to answer "would this policy have
 * skipped/degraded N occurrences over this history?" without look-ahead bias. */
export function simulateCadenceRule(rule: CadenceRule, history: OccurrenceSummary[]): SimulationResult {
  const sorted = [...history].sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
  const details: SimulationResult["details"] = [];
  for (let i = 0; i < sorted.length; i++) {
    const priorDescending = sorted.slice(0, i).reverse(); // most-recent-first, matches evaluateCadenceRule's contract
    const result = evaluateCadenceRule(rule, priorDescending);
    details.push({ occurrenceKey: sorted[i].occurrenceKey, mode: result.mode, reason: result.reason });
  }
  const degraded = details.filter((d) => d.mode !== "full");
  return {
    totalOccurrences: sorted.length,
    wouldDegradeCount: degraded.length,
    wouldDegradeOccurrenceKeys: degraded.map((d) => d.occurrenceKey),
    details,
  };
}

export async function getActivePolicy(ritualId: string): Promise<{ id: string; rule: CadenceRule } | null> {
  const [row] = await db
    .select()
    .from(cadencePolicies)
    .where(and(eq(cadencePolicies.ritualId, ritualId), eq(cadencePolicies.active, true)))
    .orderBy(desc(cadencePolicies.updatedAt))
    .limit(1);
  if (!row) return null;
  return { id: row.id, rule: row.rule as CadenceRule };
}

/** Builds the `OccurrenceSummary[]` the policy engine needs from real
 * `ritual_occurrences` + agenda-derived variance/anomaly counts already
 * persisted on those occurrences' agenda items at generation time. Most
 * recent first. */
export async function getPriorOccurrenceSummaries(ritualId: string, beforeOccurrenceKey: string | null, limit = 12): Promise<OccurrenceSummary[]> {
  const rows = await db
    .select()
    .from(ritualOccurrences)
    .where(eq(ritualOccurrences.ritualId, ritualId))
    .orderBy(desc(ritualOccurrences.scheduledFor))
    .limit(limit + 1);
  const filtered = beforeOccurrenceKey ? rows.filter((r) => r.occurrenceKey !== beforeOccurrenceKey) : rows;
  return filtered.slice(0, limit).map((r) => {
    const snap = r.varianceSnapshot as { variancePct: number; anomalyCount: number } | null;
    return {
      occurrenceKey: r.occurrenceKey,
      scheduledFor: r.scheduledFor.toISOString(),
      variancePct: snap?.variancePct ?? 0,
      anomalyCount: snap?.anomalyCount ?? 0,
    };
  });
}

/** Resolves the final cadence mode for an occurrence: an active, non-expired
 * human override wins outright (and is itself already logged by the time
 * this runs); otherwise the active policy's evaluation applies; otherwise
 * the ritual defaults to full cadence. */
export async function resolveCadenceMode(
  ritualId: string,
  orgId: string,
  occurrenceKey: string,
  priorOccurrences: OccurrenceSummary[],
): Promise<PolicyDecisionResult> {
  const [override] = await db
    .select()
    .from(cadenceOverrides)
    .where(and(eq(cadenceOverrides.ritualId, ritualId), eq(cadenceOverrides.orgId, orgId)))
    .orderBy(desc(cadenceOverrides.createdAt))
    .limit(1);

  if (override && (override.overrideType === "force_full" || override.overrideType === "force_async")) {
    const mode = override.overrideType === "force_full" ? "full" : "async_checklist";
    return { mode, reason: `Human override logged ${override.createdAt.toISOString()}: "${override.reason}" forces ${mode} cadence.` };
  }

  const policy = await getActivePolicy(ritualId);
  if (!policy) {
    return { mode: "full", reason: "No active adaptive-cadence policy is configured — defaulting to full cadence." };
  }
  return evaluateCadenceRule(policy.rule, priorOccurrences);
}

/** DB-backed wrapper: loads this ritual's full occurrence history and runs
 * the pure simulator over it — "this policy would have skipped N reviews
 * last quarter — is that intended?" */
export async function simulatePolicyAgainstHistory(ritualId: string, rule: CadenceRule) {
  const history = await getPriorOccurrenceSummaries(ritualId, null, 500);
  return simulateCadenceRule(rule, history);
}

export async function logCadenceOverride(input: {
  orgId: string;
  ritualId: string;
  occurrenceId?: string | null;
  overrideType: "force_full" | "force_async" | "force_skip" | "reactivate_policy";
  reason: string;
  actorId?: string | null;
}) {
  if (!input.reason || input.reason.trim().length < 3) {
    throw new Error("A human override requires a real reason (min 3 characters) — it is logged, not silent.");
  }
  const [row] = await db
    .insert(cadenceOverrides)
    .values({
      orgId: input.orgId,
      ritualId: input.ritualId,
      occurrenceId: input.occurrenceId ?? null,
      overrideType: input.overrideType,
      reason: input.reason,
      actorId: input.actorId ?? null,
    })
    .returning();
  return row;
}
