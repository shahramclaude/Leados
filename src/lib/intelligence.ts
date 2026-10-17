import type { Projection, Finding, Domain } from "./types";
import { engine, run } from "./core";
import { heatmap, domainMath } from "./physics";

/**
 * DISCLOSURE: everything in this file — LEADOS.temporalField,
 * LEADOS.correlate's cluster detector, LEADOS.simulate, LEADOS.predict,
 * LEADOS.leaderSelf, LEADOS.calibration — was searched for in the real
 * wbweve/Leados repo this session (full recursive file tree, 88 files,
 * fetched and enumerated) and does not exist there under these or any
 * equivalent names. It also does not exist in this repo's own prior
 * sandbox sessions (Part 1 velocity.ts, Part 2 orgPhysics.ts, Part 6
 * synthesis build) — confirmed by grepping every fetched file for
 * "temporalField", "buildTemporalProfile", "correlate", "simulate",
 * "predict", "leaderSelf", "calibration". Every function below is this
 * delivery's own invention, built only to make the pasted Section 1/2/3
 * brief runnable end-to-end against real (if fabricated) event data.
 * Treat the numbers as illustrative, not validated.
 */

// --- LEADOS.temporalField ---------------------------------------------------

export type TemporalMode = "REACTIVE_STRESS" | "STRATEGIC_DRIFT" | "STRUCTURAL_STRESS" | "BALANCED";

export interface TemporalProfile {
  proportions: Record<"REACTIVE" | "STRATEGIC" | "STRUCTURAL", { count: number; pct: number }>;
  diagnosis: { mode: TemporalMode };
  avgFindingAgeDays: number;
}

/** Buckets active findings by age: REACTIVE <30d, STRATEGIC 30-180d, STRUCTURAL >180d. */
export function buildTemporalProfile(P: Projection, today: string | Date): TemporalProfile {
  const findings = run(P, today).findings;
  const todayIso = engine.iso(today);
  const ages = findings.map((f) => engine._days(f.ts, todayIso));
  const buckets = { REACTIVE: 0, STRATEGIC: 0, STRUCTURAL: 0 };
  ages.forEach((a) => {
    if (a < 30) buckets.REACTIVE++;
    else if (a < 180) buckets.STRATEGIC++;
    else buckets.STRUCTURAL++;
  });
  const total = findings.length || 1;
  const proportions = {
    REACTIVE: { count: buckets.REACTIVE, pct: Math.round((buckets.REACTIVE / total) * 100) },
    STRATEGIC: { count: buckets.STRATEGIC, pct: Math.round((buckets.STRATEGIC / total) * 100) },
    STRUCTURAL: { count: buckets.STRUCTURAL, pct: Math.round((buckets.STRUCTURAL / total) * 100) },
  };
  let mode: TemporalMode = "BALANCED";
  const top = Object.entries(proportions).sort((a, b) => b[1].pct - a[1].pct)[0];
  if (findings.length > 0 && top[1].pct >= 45) {
    mode = top[0] === "REACTIVE" ? "REACTIVE_STRESS" : top[0] === "STRATEGIC" ? "STRATEGIC_DRIFT" : "STRUCTURAL_STRESS";
  }
  const avgFindingAgeDays = ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : 0;
  return { proportions, diagnosis: { mode }, avgFindingAgeDays };
}

// --- LEADOS.correlate (clusters) -------------------------------------------

export interface Cluster {
  id: string;
  label: string;
  findings: string[]; // finding keys
}

export interface CorrelationResult {
  clusters: Cluster[];
}

/** Heuristic clustering: same-domain convergence + two named compound patterns. Disclosed fabrication. */
export function correlate(P: Projection, today: string | Date): CorrelationResult {
  const findings = run(P, today).findings;
  const clusters: Cluster[] = [];

  const byDomain = new Map<string, Finding[]>();
  findings.forEach((f) => {
    const arr = byDomain.get(f.domain) || [];
    arr.push(f);
    byDomain.set(f.domain, arr);
  });
  byDomain.forEach((arr, domain) => {
    if (arr.length >= 2) clusters.push({ id: "domain:" + domain, label: `${domain} convergence (${arr.length} findings)`, findings: arr.map((f) => f.key) });
  });

  byDomain.forEach((arr, domain) => {
    const hasLeaderGap = arr.some((f) => f.rule === "GOAL_OWNERLESS" || f.rule === "GOAL_SILENT");
    const hasStaleDecision = arr.some((f) => f.rule === "DECISION_STALE");
    if (hasLeaderGap && hasStaleDecision) {
      clusters.push({
        id: "pattern:leadership-vacuum:" + domain,
        label: `Leadership vacuum in ${domain} (unowned goals + stuck decisions)`,
        findings: arr.filter((f) => ["GOAL_OWNERLESS", "GOAL_SILENT", "DECISION_STALE"].includes(f.rule)).map((f) => f.key),
      });
    }
  });

  const recentSignals = findings.filter((f) => f.rule === "SIGNAL" && engine._days(f.ts, engine.iso(today)) <= 14);
  const domainsHit = new Set(recentSignals.map((f) => f.domain));
  if (domainsHit.size >= 2) {
    clusters.push({ id: "pattern:cross-domain-shock", label: `Cross-domain shock: ${[...domainsHit].join(", ")} within 14 days`, findings: recentSignals.map((f) => f.key) });
  }

  return { clusters };
}

// --- LEADOS.simulate ---------------------------------------------------------

export interface SimResult {
  heatmapBefore: number;
  heatmapAfter: number;
}

/** Simulates removing one finding's source signal and recomputes that domain's score. Only meaningful for SIGNAL-rule findings; returns null otherwise (disclosed scope cut). */
export function resolve(findingKey: string, P: Projection, today: string | Date): SimResult | null {
  const findings = run(P, today).findings;
  const f = findings.find((x) => x.key === findingKey);
  if (!f || f.rule !== "SIGNAL" || f.domain === "org") return null;
  const eventId = findingKey.replace(/^signal:/, "");
  const before = domainMath(f.domain as Domain, P, today);
  const after = domainMath(f.domain as Domain, P, today, eventId);
  return { heatmapBefore: before.score, heatmapAfter: after.score };
}

// --- LEADOS.predict -----------------------------------------------------------

/** Heuristic fire-date projection: sev>=4 is already on fire ("NOW"); SIGNAL findings project via domain velocity; everything else has no modeled trajectory (disclosed: null, not a guess). */
export function projectFireDate(f: Finding, P: Projection, today: string | Date): "NOW" | string | null {
  if (f.sev >= 4) return "NOW";
  if (f.rule !== "SIGNAL") return null;
  const todayIso = engine.iso(today);
  const now = domainMath(f.domain as Domain, P, today);
  const past = domainMath(f.domain as Domain, P, engine.iso(new Date(Date.parse(todayIso) - 14 * 86400000)));
  const perDay = (now.score - past.score) / 14;
  if (perDay <= 0) return null;
  const daysToThreshold = (7 - now.score) / perDay;
  if (daysToThreshold <= 0 || daysToThreshold > 90) return null;
  const d = new Date(Date.parse(todayIso) + daysToThreshold * 86400000);
  return d.toISOString().slice(0, 10);
}

// --- LEADOS.leaderSelf ---------------------------------------------------------

export interface AvoidanceSignal {
  type: "STALE_DECISION" | "REPEATED_SNOOZE";
  key: string;
  detail: string;
}

/** Avoidance proxy: decisions open far past the staleness gate with no outcome, or findings snoozed repeatedly. */
export function avoidancePatterns(P: Projection, today: string | Date): AvoidanceSignal[] {
  const todayIso = engine.iso(today);
  const out: AvoidanceSignal[] = [];

  P.openDecisions.forEach((d) => {
    const age = engine._days(d.ts, todayIso);
    if (age > 42) out.push({ type: "STALE_DECISION", key: "decision:" + d.id, detail: `Decision "${d.title}" open ${Math.round(age)}d with no outcome logged` });
  });

  const snoozeCounts = new Map<string, number>();
  P.state.events.filter((e) => e.type === "engine.snoozed").forEach((e) => {
    snoozeCounts.set(e.data.key, (snoozeCounts.get(e.data.key) || 0) + 1);
  });
  snoozeCounts.forEach((count, key) => {
    if (count >= 2) out.push({ type: "REPEATED_SNOOZE", key, detail: `Finding "${key}" snoozed ${count}x without resolution` });
  });

  return out;
}

export function suppressedFindingKeys(P: Projection): string[] {
  const snoozeCounts = new Map<string, number>();
  P.state.events.filter((e) => e.type === "engine.snoozed").forEach((e) => {
    snoozeCounts.set(e.data.key, (snoozeCounts.get(e.data.key) || 0) + 1);
  });
  return [...snoozeCounts.entries()].filter(([, c]) => c >= 3).map(([k]) => k);
}

// --- LEADOS.calibration ---------------------------------------------------------

export interface Calibration {
  gap: number; // avg stated confidence - actual hit rate, both 0..1
  hitRate: number; // 0..100
  n: number;
}

/** Compares logged decision.confidence (0..1) against decision.outcome (success/failure). Needs >=3 decided+confidence-tagged decisions or returns null (disclosed: insufficient-data guard, not a hidden zero). */
export function overconfidenceScore(P: Projection): Calibration | null {
  const decided = P.decisions.filter((d) => d.outcome && typeof d.confidence === "number");
  if (decided.length < 3) return null;
  const hits = decided.filter((d) => (d.confidence! >= 0.5) === (d.outcome === "success")).length;
  const hitRate = hits / decided.length;
  const avgConfidence = decided.reduce((a, d) => a + (d.confidence || 0), 0) / decided.length;
  return { gap: Math.round((avgConfidence - hitRate) * 100) / 100, hitRate: Math.round(hitRate * 100), n: decided.length };
}

export function getTopDomain(P: Projection, today: string | Date): { domain: Domain | "org"; pct: number } {
  const findings = run(P, today).findings;
  if (!findings.length) return { domain: "org", pct: 0 };
  const counts = new Map<string, number>();
  findings.forEach((f) => counts.set(f.domain, (counts.get(f.domain) || 0) + 1));
  const [domain, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return { domain: domain as Domain | "org", pct: Math.round((count / findings.length) * 100) };
}

export { heatmap };
