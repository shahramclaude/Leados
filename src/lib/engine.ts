// ════════════════════════════════════════════════════════════════════
// Leados Engine — projects raw events + people into a decision surface.
// Pure functions. No DB calls. Never throws (every rule is sandboxed).
// ════════════════════════════════════════════════════════════════════

import { updateBelief, extractSignals } from "./bayesian";

// ───────────────────────── Core data shapes ─────────────────────────

export interface LeadosEvent {
  id: string;
  type: string;
  domain: string;
  ts: Date;
  data: Record<string, unknown>;
  personId?: string | null;
}

export interface Person {
  id: string;
  name: string;
  role: string;
  reports_to: string | null;
  cadence_days: number;
  archived: boolean;
  joined_at?: Date;
}

export interface Finding {
  key: string;
  rule: string;
  domain: string;
  sev: number; // 1-5
  ref: string;
  title: string;
  detail: string;
}

export interface DomainScore {
  domain: string;
  score: number;
  findings: number;
}

export interface DecisionView {
  id: string;
  title: string;
  domain: string;
  status: string;
  ageDays: number;
}

// ─────────────────────── Intelligence layer shapes ───────────────────

export interface PulseView {
  personId: string;
  name: string;
  meanMood: number;
  meanLoad: number;
  trend: "improving" | "stable" | "declining";
  n: number;
}

export interface GoalView {
  goalId: string;
  title: string;
  domain: string;
  ownerAssigned: boolean;
  ageDays: number;
  status: string;
}

export interface GrowthPlan {
  planId: string;
  personId: string;
  personName: string;
  currentLevel: string;
  targetLevel: string;
  ageDays: number;
  lastCheckin: Date | null;
}

export interface CorrelationCluster {
  name: string;
  rules: string[];
  severity: number;
  description: string;
  findings: Finding[];
}

export interface Inference {
  id: string;
  name: string;
  type: "FORWARD" | "BACKWARD" | "TEMPORAL";
  confidence: number;
  title: string;
  body: string;
  urgency: string;
  action: string;
}

export interface BeliefResult {
  hypothesis: string;
  prior: number;
  posterior: number;
  posteriorPct: number;
  evidence: string[];
  highRisk: boolean;
}

export interface FlightRiskResult {
  personId: string;
  personName: string;
  riskScore: number;
  riskLevel: "HIGH" | "ELEVATED" | "MODERATE" | "LOW";
  signals: string[];
  dataQuality: "HIGH" | "MEDIUM" | "LOW";
}

export interface OrgHealthScore {
  overall: number;
  grade: "A" | "B" | "C" | "D" | "F";
  domains: Record<string, number>;
  trend: number;
}

export interface FeedbackLoop {
  name: string;
  polarity: "REINFORCING" | "REINFORCING_POSITIVE";
  active: boolean;
  evidence: string;
}

export interface ProjectedState {
  findings: Finding[];
  domainScores: DomainScore[];
  decisions: DecisionView[];
  pulseByPerson: Record<string, PulseView>;
  openGoals: GoalView[];
  openPlans: GrowthPlan[];
  correlations: CorrelationCluster[];
  inferences: Inference[];
  beliefs: BeliefResult[];
  flightRisk: FlightRiskResult[];
  healthScore: OrgHealthScore;
  temporalMode: "REACTIVE" | "BALANCED" | "STRATEGIC_DRIFT" | "STRUCTURAL_STRESS";
  orgEntropy: number;
  feedbackLoops: FeedbackLoop[];
}

// ───────────────────────────── Constants ─────────────────────────────

const HEALTH_DOMAINS = [
  "people",
  "finance",
  "sales",
  "ops",
  "strategy",
  "governance",
  "culture",
  "resilience",
] as const;

const MS_DAY = 86400000;

// ───────────────────────────── Accessors ─────────────────────────────

function dataStr(d: Record<string, unknown>, key: string): string | undefined {
  const v = d[key];
  return typeof v === "string" ? v : undefined;
}
function dataNum(d: Record<string, unknown>, key: string): number | undefined {
  const v = d[key];
  return typeof v === "number" && !Number.isNaN(v) ? v : undefined;
}
function dataBool(d: Record<string, unknown>, key: string): boolean | undefined {
  const v = d[key];
  return typeof v === "boolean" ? v : undefined;
}

function daysAgo(date: Date, now: number): number {
  return (now - date.getTime()) / MS_DAY;
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// Least squares slope of y over x (x in days) -> returns slope per day
function leastSquaresSlope(points: Array<{ x: number; y: number }>): number {
  const n = points.length;
  if (n < 2) return 0;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumXX = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

// ───────────────────────────── add() helper ─────────────────────────

function add(
  findings: Finding[],
  rule: string,
  domain: string,
  sev: number,
  ref: string,
  title: string,
  detail: string
) {
  findings.push({
    key: `${rule}:${ref}`,
    rule,
    domain,
    sev: Math.max(1, Math.min(5, sev)),
    ref,
    title,
    detail,
  });
}

// Wrap a rule body so the engine never throws.
function R(findings: Finding[], ruleId: string, fn: () => void) {
  try {
    fn();
  } catch (err) {
    findings.push({
      key: `ENG:${ruleId}`,
      rule: "ENG",
      domain: "engine",
      sev: 1,
      ref: ruleId,
      title: `Rule ${ruleId} failed to evaluate`,
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

// ───────────────────────────── Metric helpers ────────────────────────

function latestMetric(
  events: LeadosEvent[],
  domain: string,
  key: string,
  now: number
): number | undefined {
  const matches = events
    .filter((e) => e.domain === domain && e.type === "metric" && dataStr(e.data, "key") === key)
    .sort((a, b) => b.ts.getTime() - a.ts.getTime());
  if (matches.length === 0) return undefined;
  return dataNum(matches[0].data, "value");
}

function metricWindowAvg(
  events: LeadosEvent[],
  domain: string,
  key: string,
  minDaysAgo: number,
  maxDaysAgo: number,
  now: number
): number | undefined {
  const vals = events
    .filter((e) => e.domain === domain && e.type === "metric" && dataStr(e.data, "key") === key)
    .filter((e) => {
      const age = daysAgo(e.ts, now);
      return age >= minDaysAgo && age < maxDaysAgo;
    })
    .map((e) => dataNum(e.data, "value"))
    .filter((v): v is number => v !== undefined);
  if (vals.length === 0) return undefined;
  return mean(vals);
}

// ───────────────────────────── Pulses ────────────────────────────────

export function computePulses(events: LeadosEvent[], people: Person[], now: number): Record<string, PulseView> {
  const byPerson: Record<string, Array<{ ts: Date; mood: number; load: number }>> = {};
  for (const e of events) {
    if (e.domain !== "people" || e.type !== "pulse") continue;
    const pid = dataStr(e.data, "personId") ?? e.personId ?? undefined;
    const mood = dataNum(e.data, "mood");
    const load = dataNum(e.data, "load");
    if (!pid || mood === undefined || load === undefined) continue;
    (byPerson[pid] ??= []).push({ ts: e.ts, mood, load });
  }
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "Unknown";
  const result: Record<string, PulseView> = {};
  for (const [pid, pulses] of Object.entries(byPerson)) {
    const sorted = [...pulses].sort((a, b) => a.ts.getTime() - b.ts.getTime());
    const meanMood = mean(sorted.map((p) => p.mood));
    const meanLoad = mean(sorted.map((p) => p.load));
    const t0 = sorted[0].ts.getTime();
    const points = sorted.map((p) => ({ x: (p.ts.getTime() - t0) / MS_DAY, y: p.mood }));
    const slopePerDay = leastSquaresSlope(points);
    const slopePerWeek = slopePerDay * 7;
    const trend: PulseView["trend"] =
      sorted.length < 2 ? "stable" : slopePerWeek < -0.2 ? "declining" : slopePerWeek > 0.2 ? "improving" : "stable";
    result[pid] = {
      personId: pid,
      name: nameOf(pid),
      meanMood: Math.round(meanMood * 100) / 100,
      meanLoad: Math.round(meanLoad * 100) / 100,
      trend,
      n: sorted.length,
    };
  }
  return result;
}

function pulseSlopePerWeek(events: LeadosEvent[], personId: string): number {
  const pts = events
    .filter(
      (e) => e.domain === "people" && e.type === "pulse" && (dataStr(e.data, "personId") ?? e.personId) === personId
    )
    .sort((a, b) => a.ts.getTime() - b.ts.getTime())
    .map((e) => ({ ts: e.ts, mood: dataNum(e.data, "mood") }))
    .filter((p): p is { ts: Date; mood: number } => p.mood !== undefined);
  if (pts.length < 2) return 0;
  const t0 = pts[0].ts.getTime();
  const points = pts.map((p) => ({ x: (p.ts.getTime() - t0) / MS_DAY, y: p.mood }));
  return leastSquaresSlope(points) * 7;
}

// ───────────────────────────── buildFindings ─────────────────────────

function buildFindings(events: LeadosEvent[], people: Person[], now: number): Finding[] {
  const findings: Finding[] = [];
  const active = people.filter((p) => !p.archived);

  // ═══════════════════ PEOPLE DOMAIN (R1-R15) ═══════════════════

  R(findings, "R1", () => {
    for (const p of active) {
      const skipped = events.filter(
        (e) =>
          e.domain === "people" &&
          e.type === "oneonone" &&
          (dataStr(e.data, "personId") ?? e.personId) === p.id &&
          dataStr(e.data, "status") === "skipped" &&
          daysAgo(e.ts, now) <= 60
      );
      if (skipped.length >= 3) {
        add(
          findings,
          "R1",
          "people",
          4,
          p.id,
          `${p.name}: 3+ skipped 1:1s in 60 days`,
          `${skipped.length} skipped 1:1s with ${p.name} in the last 60 days.`
        );
      }
    }
  });

  R(findings, "R2", () => {
    for (const p of active) {
      const held = events.filter(
        (e) =>
          e.domain === "people" &&
          e.type === "oneonone" &&
          (dataStr(e.data, "personId") ?? e.personId) === p.id &&
          dataStr(e.data, "status") === "held" &&
          daysAgo(e.ts, now) <= 90
      );
      const recognized = events.some(
        (e) =>
          e.domain === "people" &&
          e.type === "recognition" &&
          (dataStr(e.data, "personId") ?? e.personId) === p.id &&
          daysAgo(e.ts, now) <= 90
      );
      if (held.length >= 4 && !recognized) {
        add(
          findings,
          "R2",
          "people",
          3,
          p.id,
          `${p.name}: regular 1:1s but no recognition`,
          `${held.length} 1:1s held with ${p.name} in 90d, but no recognition event logged.`
        );
      }
    }
  });

  R(findings, "R3b", () => {
    const pulses = computePulses(events, people, now);
    for (const pv of Object.values(pulses)) {
      const recent = events.filter(
        (e) =>
          e.domain === "people" &&
          e.type === "pulse" &&
          (dataStr(e.data, "personId") ?? e.personId) === pv.personId &&
          daysAgo(e.ts, now) <= 30
      );
      if (recent.length >= 3) {
        const moodVals = recent.map((e) => dataNum(e.data, "mood")).filter((v): v is number => v !== undefined);
        const m = mean(moodVals);
        if (m < 4) {
          add(
            findings,
            "R3b",
            "people",
            4,
            pv.personId,
            `${pv.name}: low mood trend (30d)`,
            `Mean mood ${m.toFixed(1)}/10 across ${recent.length} pulses in the last 30 days.`
          );
        }
      }
    }
  });

  R(findings, "R4", () => {
    for (const p of active) {
      const fb = events.filter(
        (e) =>
          e.domain === "people" &&
          e.type === "feedback" &&
          (dataStr(e.data, "personId") ?? e.personId) === p.id &&
          daysAgo(e.ts, now) <= 90
      );
      if (fb.length >= 5) {
        const pos = fb.filter((e) => dataStr(e.data, "sentiment") === "positive").length;
        const posRatio = pos / fb.length;
        if (posRatio > 0.85 || posRatio < 0.15) {
          add(
            findings,
            "R4",
            "people",
            3,
            p.id,
            `${p.name}: feedback imbalance`,
            `${Math.round(posRatio * 100)}% of ${fb.length} feedback items are positive.`
          );
        }
      }
    }
  });

  R(findings, "R5b", () => {
    for (const manager of active) {
      const directs = active.filter((p) => p.reports_to === manager.id);
      if (directs.length === 0) continue;
      const given = events.filter(
        (e) =>
          e.domain === "people" &&
          e.type === "feedback" &&
          dataStr(e.data, "byPersonId") === manager.id
      );
      const latest = given.sort((a, b) => b.ts.getTime() - a.ts.getTime())[0];
      const age = latest ? daysAgo(latest.ts, now) : Infinity;
      if (age > 45) {
        add(
          findings,
          "R5b",
          "people",
          3,
          manager.id,
          `${manager.name}: no feedback given in 45+ days`,
          `No feedback event from ${manager.name} to any direct report in over 45 days.`
        );
      }
    }
  });

  R(findings, "R6", () => {
    const byPair: Record<string, LeadosEvent[]> = {};
    for (const e of events) {
      if (e.domain !== "people" || e.type !== "conflict") continue;
      const a = dataStr(e.data, "personA");
      const b = dataStr(e.data, "personB");
      if (!a || !b) continue;
      const key = [a, b].sort().join("|");
      (byPair[key] ??= []).push(e);
    }
    for (const [pairKey, evs] of Object.entries(byPair)) {
      const latest = [...evs].sort((a, b) => b.ts.getTime() - a.ts.getTime())[0];
      if (dataStr(latest.data, "status") === "opened" && daysAgo(latest.ts, now) > 14) {
        add(
          findings,
          "R6",
          "people",
          4,
          pairKey,
          `Unresolved conflict: ${pairKey}`,
          `Conflict opened ${Math.round(daysAgo(latest.ts, now))} days ago remains unresolved.`
        );
      }
    }
  });

  R(findings, "R7", () => {
    for (const p of active) {
      const recent = events.filter(
        (e) =>
          e.domain === "people" &&
          e.type === "pulse" &&
          (dataStr(e.data, "personId") ?? e.personId) === p.id &&
          daysAgo(e.ts, now) <= 30
      );
      if (recent.length === 0) continue;
      const loads = recent.map((e) => dataNum(e.data, "load")).filter((v): v is number => v !== undefined);
      const moods = recent.map((e) => dataNum(e.data, "mood")).filter((v): v is number => v !== undefined);
      if (loads.length === 0 || moods.length === 0) continue;
      const meanLoad = mean(loads);
      const meanMood = mean(moods);
      if (meanLoad > 7 && meanMood < 5) {
        add(
          findings,
          "R7",
          "people",
          4,
          p.id,
          `${p.name}: burnout signal`,
          `Load ${meanLoad.toFixed(1)}/10, mood ${meanMood.toFixed(1)}/10 over the last 30 days.`
        );
      }
    }
  });

  R(findings, "R8b", () => {
    for (const p of active) {
      if (!p.joined_at) continue;
      if (daysAgo(p.joined_at, now) < 182) continue;
      const hasPlan = events.some(
        (e) => e.domain === "people" && e.type === "growth_plan" && dataStr(e.data, "event") === "created" &&
          (dataStr(e.data, "personId") ?? e.personId) === p.id
      );
      if (!hasPlan) {
        add(
          findings,
          "R8b",
          "people",
          3,
          p.id,
          `${p.name}: no growth plan after 6+ months tenure`,
          `${p.name} has been on the team for ${Math.round(daysAgo(p.joined_at, now))} days with no growth plan.`
        );
      }
    }
  });

  R(findings, "R9b", () => {
    const plans = computeGrowthPlans(events, people);
    for (const plan of plans) {
      const age = plan.lastCheckin ? daysAgo(plan.lastCheckin, now) : daysAgo(new Date(now - plan.ageDays * MS_DAY), now) + plan.ageDays;
      const effectiveAge = plan.lastCheckin ? daysAgo(plan.lastCheckin, now) : plan.ageDays;
      if (effectiveAge > 30) {
        add(
          findings,
          "R9b",
          "people",
          2,
          plan.planId,
          `${plan.personName}: growth plan check-in overdue`,
          `Last check-in was ${Math.round(effectiveAge)} days ago (or never).`
        );
      }
    }
  });

  R(findings, "R10", () => {
    for (const g of computeGoals(events)) {
      if (!g.ownerAssigned && g.ageDays > 14) {
        add(
          findings,
          "R10",
          "people",
          3,
          g.goalId,
          `Goal "${g.title}" has no owner`,
          `Goal created ${Math.round(g.ageDays)} days ago still has no assigned owner.`
        );
      }
    }
  });

  R(findings, "R11b", () => {
    for (const p of active) {
      const manager = active.find((m) => m.id === p.reports_to);
      const skipLevelManager = manager ? active.find((m) => m.id === manager.reports_to) : undefined;
      if (!skipLevelManager) continue;
      const skiplevels = events.filter(
        (e) => e.domain === "people" && e.type === "skiplevel" && (dataStr(e.data, "personId") ?? e.personId) === p.id
      );
      const latest = skiplevels.sort((a, b) => b.ts.getTime() - a.ts.getTime())[0];
      const age = latest ? daysAgo(latest.ts, now) : Infinity;
      if (age > 90) {
        add(
          findings,
          "R11b",
          "people",
          2,
          p.id,
          `${p.name}: skip-level overdue`,
          `No skip-level with ${p.name} in over 90 days.`
        );
      }
    }
  });

  R(findings, "R12b", () => {
    for (const e of events) {
      if (e.domain !== "people" || e.type !== "attrition") continue;
      if (daysAgo(e.ts, now) <= 60) {
        const name = dataStr(e.data, "name") ?? "Unknown";
        add(
          findings,
          "R12b",
          "people",
          3,
          e.id,
          `Attrition: ${name}`,
          `${name} left the organization ${Math.round(daysAgo(e.ts, now))} days ago.`
        );
      }
    }
  });

  R(findings, "R13", () => {
    const recent = events.filter((e) => e.domain === "people" && e.type === "pulse" && daysAgo(e.ts, now) <= 60);
    const moods = recent.map((e) => dataNum(e.data, "mood")).filter((v): v is number => v !== undefined);
    if (moods.length >= 3) {
      const m = mean(moods);
      if (m < 5) {
        add(
          findings,
          "R13",
          "people",
          4,
          "org",
          "Team pulse below threshold org-wide",
          `Mean mood across the org is ${m.toFixed(1)}/10 over the last 60 days.`
        );
      }
    }
  });

  R(findings, "R14", () => {
    for (const p of active) {
      const n = events.filter(
        (e) => e.domain === "people" && e.type === "pulse" && (dataStr(e.data, "personId") ?? e.personId) === p.id
      ).length;
      if (n < 4) continue;
      const slope = pulseSlopePerWeek(events, p.id);
      if (slope < -0.3) {
        add(
          findings,
          "R14",
          "people",
          4,
          p.id,
          `${p.name}: mood declining sharply`,
          `Mood trending down ${Math.abs(slope).toFixed(2)} points/week.`
        );
      }
    }
  });

  R(findings, "R15", () => {
    for (const p of active) {
      const oneonones = events.filter(
        (e) => e.domain === "people" && e.type === "oneonone" && (dataStr(e.data, "personId") ?? e.personId) === p.id
      );
      const latest = oneonones.sort((a, b) => b.ts.getTime() - a.ts.getTime())[0];
      const gap = latest ? daysAgo(latest.ts, now) : (p.joined_at ? daysAgo(p.joined_at, now) : 0);
      const target = p.cadence_days || 14;
      if (gap > target * 1.5) {
        add(
          findings,
          "R15",
          "people",
          3,
          p.id,
          `${p.name}: 1:1 cadence drift`,
          `Last 1:1 was ${Math.round(gap)} days ago; target cadence is ${target} days.`
        );
      }
    }
  });

  // ═══════════════════ FINANCE DOMAIN (R16-R25) ═══════════════════

  R(findings, "R16", () => {
    const v = latestMetric(events, "finance", "runway_months", now);
    if (v !== undefined && v < 6) {
      add(findings, "R16", "finance", 5, "runway_months", "Runway under 6 months", `Runway is ${v} months.`);
    }
  });

  R(findings, "R17", () => {
    const v = latestMetric(events, "finance", "runway_months", now);
    if (v !== undefined && v < 12 && v > 6) {
      add(findings, "R17", "finance", 3, "runway_months", "Runway warning window", `Runway is ${v} months (warning zone).`);
    }
  });

  R(findings, "R18", () => {
    const v = latestMetric(events, "finance", "burn_rate_delta_pct", now);
    if (v !== undefined && v > 20) {
      add(findings, "R18", "finance", 4, "burn_rate_delta_pct", "Burn rate spiking", `Burn rate delta is +${v}%.`);
    }
  });

  R(findings, "R19", () => {
    const v = latestMetric(events, "finance", "mrr_growth_pct", now);
    if (v !== undefined && v < 0) {
      add(findings, "R19", "finance", 3, "mrr_growth_pct", "MRR shrinking", `MRR growth is ${v}%.`);
    }
  });

  R(findings, "R20", () => {
    const v = latestMetric(events, "finance", "ltv_cac", now);
    if (v !== undefined && v < 3) {
      add(findings, "R20", "finance", 3, "ltv_cac", "LTV:CAC below healthy range", `LTV:CAC is ${v}.`);
    }
  });

  R(findings, "R21", () => {
    const v = latestMetric(events, "finance", "ltv_cac", now);
    if (v !== undefined && v < 1) {
      add(findings, "R21", "finance", 5, "ltv_cac", "Unit economics broken", `LTV:CAC is ${v} (< 1).`);
    }
  });

  R(findings, "R22", () => {
    const v = latestMetric(events, "finance", "gross_margin_pct", now);
    if (v !== undefined && v < 60) {
      add(findings, "R22", "finance", 4, "gross_margin_pct", "Gross margin below target", `Gross margin is ${v}%.`);
    }
  });

  R(findings, "R23", () => {
    const v = latestMetric(events, "finance", "churn_pct", now);
    if (v !== undefined && v > 5) {
      add(findings, "R23", "finance", 4, "churn_pct", "Churn critically high", `Churn is ${v}%.`);
    } else if (v !== undefined && v > 2) {
      add(findings, "R23", "finance", 2, "churn_pct", "Churn elevated", `Churn is ${v}%.`);
    }
  });

  R(findings, "R24", () => {
    const v = latestMetric(events, "finance", "payback_period_months", now);
    if (v !== undefined && v > 18) {
      add(findings, "R24", "finance", 3, "payback_period_months", "CAC payback too slow", `Payback period is ${v} months.`);
    }
  });

  R(findings, "R25", () => {
    const v = latestMetric(events, "finance", "quick_ratio", now);
    if (v !== undefined && v < 1) {
      add(findings, "R25", "finance", 5, "quick_ratio", "Quick ratio critical", `Quick ratio is ${v}.`);
    } else if (v !== undefined && v < 4) {
      add(findings, "R25", "finance", 2, "quick_ratio", "Quick ratio weak", `Quick ratio is ${v}.`);
    }
  });

  // ═══════════════════ SALES DOMAIN (R26-R32) ═══════════════════

  R(findings, "R26", () => {
    const v = latestMetric(events, "sales", "pipeline_coverage_x", now);
    if (v !== undefined && v < 3) {
      add(findings, "R26", "sales", 3, "pipeline_coverage_x", "Pipeline coverage thin", `Coverage is ${v}x.`);
    }
  });

  R(findings, "R27", () => {
    const curr = metricWindowAvg(events, "sales", "win_rate", 0, 90, now);
    const prior = metricWindowAvg(events, "sales", "win_rate", 90, 180, now);
    if (curr !== undefined && prior !== undefined && prior - curr > 10) {
      add(
        findings,
        "R27",
        "sales",
        3,
        "win_rate",
        "Win rate declining",
        `Win rate dropped from ${prior.toFixed(1)}% to ${curr.toFixed(1)}% (90d windows).`
      );
    }
  });

  R(findings, "R28", () => {
    const lost = events.filter(
      (e) => e.domain === "sales" && e.type === "deal" && dataStr(e.data, "outcome") === "lost" && daysAgo(e.ts, now) <= 90
    );
    const byReason: Record<string, LeadosEvent[]> = {};
    for (const e of lost) {
      const reason = dataStr(e.data, "lossReason");
      if (!reason) continue;
      (byReason[reason] ??= []).push(e);
    }
    for (const [reason, evs] of Object.entries(byReason)) {
      if (evs.length > 3) {
        const addressed = events.some(
          (e) =>
            e.domain === "strategy" &&
            e.type === "decision" &&
            dataStr(e.data, "addresses") === reason &&
            e.ts.getTime() >= Math.min(...evs.map((x) => x.ts.getTime()))
        );
        if (!addressed) {
          add(
            findings,
            "R28",
            "sales",
            4,
            reason,
            `Recurring loss reason unaddressed: ${reason}`,
            `${evs.length} deals lost to "${reason}" in 90d with no strategy decision addressing it.`
          );
        }
      }
    }
  });

  R(findings, "R29", () => {
    const deals = events.filter((e) => e.domain === "sales" && e.type === "deal");
    const latest = deals.sort((a, b) => b.ts.getTime() - a.ts.getTime())[0];
    const age = latest ? daysAgo(latest.ts, now) : Infinity;
    if (age > 30) {
      add(findings, "R29", "sales", 2, "deal_cadence", "No deals logged recently", `No sales.deal.logged event in ${Math.round(age)} days.`);
    }
  });

  R(findings, "R30", () => {
    const deals = events
      .filter((e) => e.domain === "sales" && e.type === "deal" && dataNum(e.data, "cycleDays") !== undefined)
      .sort((a, b) => a.ts.getTime() - b.ts.getTime());
    if (deals.length < 6) return;
    const recent = deals.slice(-5);
    const historical = deals.slice(0, -5);
    const recentAvg = mean(recent.map((e) => dataNum(e.data, "cycleDays") as number));
    const histAvg = mean(historical.map((e) => dataNum(e.data, "cycleDays") as number));
    if (histAvg > 0 && recentAvg > histAvg * 1.5) {
      add(
        findings,
        "R30",
        "sales",
        3,
        "cycle_time",
        "Deal cycle lengthening",
        `Recent average cycle ${recentAvg.toFixed(0)}d vs historical ${histAvg.toFixed(0)}d.`
      );
    }
  });

  R(findings, "R31", () => {
    const churns = events.filter((e) => e.domain === "sales" && e.type === "churn");
    for (const c of churns) {
      if (daysAgo(c.ts, now) <= 7) continue;
      const customerId = dataStr(c.data, "customerId");
      const responded = events.some(
        (e) =>
          e.domain === "sales" &&
          e.type === "cs_response" &&
          dataStr(e.data, "customerId") === customerId &&
          e.ts.getTime() >= c.ts.getTime() &&
          e.ts.getTime() - c.ts.getTime() <= 7 * MS_DAY
      );
      if (!responded) {
        add(
          findings,
          "R31",
          "sales",
          3,
          c.id,
          `Churn with no CS response: ${customerId ?? "unknown"}`,
          `Customer churned with no cs.response event within 7 days.`
        );
      }
    }
  });

  R(findings, "R32", () => {
    const v = latestMetric(events, "sales", "nps", now);
    if (v !== undefined && v < 0) {
      add(findings, "R32", "sales", 5, "nps", "NPS negative", `NPS is ${v}.`);
    } else if (v !== undefined && v < 30) {
      add(findings, "R32", "sales", 3, "nps", "NPS below benchmark", `NPS is ${v}.`);
    }
  });

  // ═══════════════════ OPERATIONS DOMAIN (R33-R40) ═══════════════════

  R(findings, "R33", () => {
    const v = latestMetric(events, "ops", "deploy_freq_delta_pct", now);
    if (v !== undefined && v < -30) {
      add(findings, "R33", "ops", 3, "deploy_freq_delta_pct", "Deploy frequency dropping", `Deploy frequency delta is ${v}%.`);
    }
  });

  R(findings, "R34", () => {
    const sprints = events
      .filter((e) => e.domain === "ops" && e.type === "sprint" && dataNum(e.data, "velocity") !== undefined)
      .sort((a, b) => a.ts.getTime() - b.ts.getTime());
    if (sprints.length < 4) return;
    const last4 = sprints.slice(-4).map((e) => dataNum(e.data, "velocity") as number);
    let declining = true;
    for (let i = 1; i < last4.length; i++) {
      if (last4[i] >= last4[i - 1]) { declining = false; break; }
    }
    if (declining) {
      add(findings, "R34", "ops", 3, "velocity", "Sprint velocity declining 3 sprints running", `Velocity: ${last4.join(" → ")}.`);
    }
  });

  R(findings, "R35", () => {
    const sprints = events
      .filter((e) => e.domain === "ops" && e.type === "sprint" && dataBool(e.data, "goalHit") !== undefined)
      .sort((a, b) => b.ts.getTime() - a.ts.getTime())
      .slice(0, 4);
    if (sprints.length < 4) return;
    const hitRate = sprints.filter((e) => dataBool(e.data, "goalHit")).length / sprints.length;
    if (hitRate < 0.5) {
      add(findings, "R35", "ops", 3, "goal_hit_rate", "Sprint goal hit rate low", `Hit rate ${Math.round(hitRate * 100)}% over last 4 sprints.`);
    }
  });

  R(findings, "R36", () => {
    const blockers = events.filter((e) => e.domain === "ops" && e.type === "blocker");
    const byId: Record<string, LeadosEvent[]> = {};
    for (const e of blockers) {
      const id = dataStr(e.data, "blockerId");
      if (!id) continue;
      (byId[id] ??= []).push(e);
    }
    for (const [id, evs] of Object.entries(byId)) {
      const sorted = [...evs].sort((a, b) => a.ts.getTime() - b.ts.getTime());
      const opened = sorted[0];
      const latest = sorted[sorted.length - 1];
      if (dataStr(latest.data, "status") !== "resolved" && daysAgo(opened.ts, now) > 7 && !dataBool(latest.data, "escalated")) {
        add(findings, "R36", "ops", 3, id, `Blocker open 7+ days: ${id}`, `Opened ${Math.round(daysAgo(opened.ts, now))} days ago, not escalated.`);
      }
    }
  });

  R(findings, "R37", () => {
    const incidents = events.filter((e) => e.domain === "ops" && e.type === "incident");
    for (const inc of incidents) {
      if (daysAgo(inc.ts, now) <= 7) continue;
      const incidentId = dataStr(inc.data, "incidentId");
      const hasPostmortem = events.some(
        (e) => e.domain === "ops" && e.type === "postmortem" && dataStr(e.data, "incidentId") === incidentId
      );
      if (!hasPostmortem) {
        add(findings, "R37", "ops", 3, inc.id, `Incident without postmortem: ${incidentId ?? inc.id}`, `No postmortem logged ${Math.round(daysAgo(inc.ts, now))} days after incident.`);
      }
    }
  });

  R(findings, "R38", () => {
    const breaches = events.filter((e) => e.domain === "ops" && e.type === "sla" && dataBool(e.data, "breached") === true && daysAgo(e.ts, now) <= 30);
    for (const b of breaches) {
      add(findings, "R38", "ops", 4, b.id, "SLA breach on active commitment", `SLA breach logged ${Math.round(daysAgo(b.ts, now))} days ago.`);
    }
  });

  R(findings, "R39", () => {
    const hc = events
      .filter((e) => e.domain === "ops" && e.type === "headcount" && dataNum(e.data, "count") !== undefined)
      .sort((a, b) => a.ts.getTime() - b.ts.getTime());
    if (hc.length < 2) return;
    const latest = hc[hc.length - 1];
    const baseline = [...hc].reverse().find((e) => daysAgo(e.ts, now) >= 60) ?? hc[0];
    const latestCount = dataNum(latest.data, "count") as number;
    const baselineCount = dataNum(baseline.data, "count") as number;
    if (baselineCount > 0) {
      const dropPct = ((baselineCount - latestCount) / baselineCount) * 100;
      if (dropPct > 15) {
        add(findings, "R39", "ops", 4, "headcount", "Capacity shock: headcount reduced sharply", `Headcount dropped ${dropPct.toFixed(0)}% in 60 days.`);
      }
    }
  });

  R(findings, "R40", () => {
    const v = latestMetric(events, "ops", "tech_debt_metric", now);
    if (v !== undefined && v > 70) {
      const addressed = events.some(
        (e) => e.domain === "ops" && e.type === "sprint" && dataBool(e.data, "addressesTechDebt") === true && daysAgo(e.ts, now) <= 30
      );
      if (!addressed) {
        add(findings, "R40", "ops", 3, "tech_debt_metric", "Tech debt above threshold, unaddressed", `Tech debt metric is ${v}.`);
      }
    }
  });

  // ═══════════════════ STRATEGY DOMAIN (R41-R47) ═══════════════════

  R(findings, "R41", () => {
    const okrs = events.filter((e) => e.domain === "strategy" && e.type === "okr");
    const byId: Record<string, LeadosEvent> = {};
    for (const e of okrs) {
      const id = dataStr(e.data, "okrId");
      if (id) byId[id] = e;
    }
    for (const [id, created] of Object.entries(byId)) {
      const progress = events
        .filter((e) => e.domain === "strategy" && e.type === "okr_progress" && dataStr(e.data, "okrId") === id)
        .sort((a, b) => b.ts.getTime() - a.ts.getTime())[0];
      const refTs = progress ? progress.ts : created.ts;
      if (daysAgo(refTs, now) > 30) {
        add(findings, "R41", "strategy", 3, id, `OKR silent 30+ days: ${dataStr(created.data, "title") ?? id}`, `No progress update in ${Math.round(daysAgo(refTs, now))} days.`);
      }
    }
  });

  R(findings, "R42", () => {
    const okrs = events.filter((e) => e.domain === "strategy" && e.type === "okr");
    for (const e of okrs) {
      if (!dataStr(e.data, "ownerId")) {
        add(findings, "R42", "strategy", 3, dataStr(e.data, "okrId") ?? e.id, `OKR has no owner: ${dataStr(e.data, "title") ?? "untitled"}`, "No ownerId assigned to this OKR.");
      }
    }
  });

  R(findings, "R43", () => {
    const decisions = events.filter((e) => e.domain === "strategy" && e.type === "decision");
    for (const d of decisions) {
      if (daysAgo(d.ts, now) > 60 && !dataStr(d.data, "outcome")) {
        add(findings, "R43", "strategy", 2, dataStr(d.data, "decisionId") ?? d.id, `Decision with no outcome: ${dataStr(d.data, "title") ?? "untitled"}`, `Logged ${Math.round(daysAgo(d.ts, now))} days ago, no outcome recorded.`);
      }
    }
  });

  R(findings, "R44", () => {
    const decisions = events.filter((e) => e.domain === "strategy" && e.type === "decision");
    const latest = decisions.sort((a, b) => b.ts.getTime() - a.ts.getTime())[0];
    const age = latest ? daysAgo(latest.ts, now) : Infinity;
    if (age > 90) {
      add(findings, "R44", "strategy", 2, "decision_cadence", "No strategy decisions logged recently", `No strategy.decision event in ${Math.round(age)} days.`);
    }
  });

  R(findings, "R45", () => {
    const initiatives = events.filter((e) => e.domain === "strategy" && e.type === "initiative");
    for (const i of initiatives) {
      if (daysAgo(i.ts, now) > 60 && dataStr(i.data, "outcomeSignal") === "negative") {
        add(findings, "R45", "strategy", 3, dataStr(i.data, "initiativeId") ?? i.id, `Initiative trending negative: ${dataStr(i.data, "title") ?? "untitled"}`, `60+ days old with negative outcome signals.`);
      }
    }
  });

  R(findings, "R46", () => {
    const okrs = events.filter((e) => e.domain === "strategy" && e.type === "okr");
    const byResource: Record<string, Set<string>> = {};
    for (const e of okrs) {
      const resource = dataStr(e.data, "resource");
      const id = dataStr(e.data, "okrId");
      if (!resource || !id) continue;
      (byResource[resource] ??= new Set()).add(id);
    }
    for (const [resource, ids] of Object.entries(byResource)) {
      if (ids.size >= 2) {
        add(findings, "R46", "strategy", 2, resource, `Competing OKRs on resource: ${resource}`, `${ids.size} OKRs compete for the same resource.`);
      }
    }
  });

  R(findings, "R47", () => {
    const intel = events.filter((e) => e.domain === "strategy" && e.type === "market_intel");
    const latest = intel.sort((a, b) => b.ts.getTime() - a.ts.getTime())[0];
    const age = latest ? daysAgo(latest.ts, now) : Infinity;
    if (age > 90) {
      add(findings, "R47", "strategy", 2, "market_intel", "No market intelligence logged recently", `No market_intel event in ${Math.round(age)} days.`);
    }
  });

  // ═══════════════════ GOVERNANCE DOMAIN (R48-R54) ═══════════════════

  R(findings, "R48", () => {
    const decisions = events.filter((e) => e.domain === "governance" && e.type === "decision");
    const byId: Record<string, LeadosEvent[]> = {};
    for (const e of decisions) {
      const id = dataStr(e.data, "decisionId");
      if (id) (byId[id] ??= []).push(e);
    }
    for (const [id, evs] of Object.entries(byId)) {
      const latest = [...evs].sort((a, b) => b.ts.getTime() - a.ts.getTime())[0];
      if (dataStr(latest.data, "status") === "open") {
        const age = daysAgo(evs[0].ts, now);
        if (age > 45) {
          add(findings, "R49", "governance", 4, id, `Decision open 45+ days: ${dataStr(latest.data, "title") ?? id}`, `Open for ${Math.round(age)} days.`);
        } else if (age > 21) {
          add(findings, "R48", "governance", 2, id, `Decision open 21+ days: ${dataStr(latest.data, "title") ?? id}`, `Open for ${Math.round(age)} days.`);
        }
      }
    }
  });

  R(findings, "R50", () => {
    const meetings = events.filter((e) => e.domain === "governance" && e.type === "board_meeting");
    for (const m of meetings) {
      const meetingDate = dataStr(m.data, "date") ? new Date(dataStr(m.data, "date") as string) : m.ts;
      const daysUntil = (meetingDate.getTime() - now) / MS_DAY;
      if (daysUntil >= 0 && daysUntil <= 14 && !dataBool(m.data, "narrativePrepared")) {
        add(findings, "R50", "governance", 3, m.id, "Board meeting imminent, no narrative prepared", `Meeting in ${Math.round(daysUntil)} days, narrative not ready.`);
      }
    }
  });

  R(findings, "R51", () => {
    const checks = events.filter((e) => e.domain === "governance" && e.type === "compliance_check");
    const latest = checks.sort((a, b) => b.ts.getTime() - a.ts.getTime())[0];
    const age = latest ? daysAgo(latest.ts, now) : Infinity;
    if (age > 90) {
      add(findings, "R51", "governance", 3, "compliance_check", "Compliance check overdue", `No compliance check in ${Math.round(age)} days.`);
    }
  });

  R(findings, "R52", () => {
    const contracts = events.filter((e) => e.domain === "governance" && e.type === "contract");
    for (const c of contracts) {
      const expiresAt = dataStr(c.data, "expiresAt");
      if (!expiresAt) continue;
      const daysUntil = (new Date(expiresAt).getTime() - now) / MS_DAY;
      if (daysUntil >= 0 && daysUntil <= 30 && !dataBool(c.data, "decisionLogged")) {
        add(findings, "R52", "governance", 4, dataStr(c.data, "contractId") ?? c.id, "Contract expiring with no decision", `Expires in ${Math.round(daysUntil)} days, no decision logged.`);
      }
    }
  });

  R(findings, "R53", () => {
    const meetings = events.filter((e) => e.domain === "governance" && e.type === "board_meeting" && e.ts.getTime() <= now);
    const latest = meetings.sort((a, b) => b.ts.getTime() - a.ts.getTime())[0];
    const age = latest ? daysAgo(latest.ts, now) : Infinity;
    if (age > 90) {
      add(findings, "R53", "governance", 2, "board_cadence", "No board meeting logged recently", `No board_meeting event in ${Math.round(age)} days.`);
    }
  });

  R(findings, "R54", () => {
    const rr = events.filter((e) => e.domain === "governance" && e.type === "risk_register");
    const latest = rr.sort((a, b) => b.ts.getTime() - a.ts.getTime())[0];
    const age = latest ? daysAgo(latest.ts, now) : Infinity;
    if (age > 60) {
      add(findings, "R54", "governance", 3, "risk_register", "Risk register stale", `No risk_register update in ${Math.round(age)} days.`);
    }
  });

  // ═══════════════ CULTURE + RESILIENCE DOMAIN (R55-R60) ═══════════════

  R(findings, "R55", () => {
    const opened = events.filter((e) => e.domain === "people" && e.type === "conflict" && dataStr(e.data, "status") === "opened" && daysAgo(e.ts, now) <= 90);
    const resolved = events.some((e) => e.domain === "people" && e.type === "conflict" && dataStr(e.data, "status") === "resolved" && daysAgo(e.ts, now) <= 30);
    const peopleCount = Math.max(1, active.length);
    const rate = opened.length / peopleCount;
    if (rate > 0.3 && !resolved) {
      add(findings, "R55", "culture", 3, "psych_safety", "Psychological safety proxy breached", `Conflict rate ${rate.toFixed(2)}/person in 90d, no resolution in 30d.`);
    }
  });

  R(findings, "R56", () => {
    const signals = events.filter((e) => e.domain === "culture" && e.type === "signal" && daysAgo(e.ts, now) <= 90);
    if (signals.length >= 5) {
      const positive = signals.filter((e) => dataStr(e.data, "polarity") === "positive").length;
      const ratio = positive / signals.length;
      if (ratio < 0.3) {
        add(findings, "R56", "culture", 3, "culture_signal", "Culture signal polarity low", `${Math.round(ratio * 100)}% positive across ${signals.length} signals (90d).`);
      }
    }
  });

  R(findings, "R57", () => {
    const dk = events.filter((e) => e.domain === "resilience" && e.type === "domain_knowledge");
    const byDomain: Record<string, LeadosEvent> = {};
    for (const e of dk) {
      const d = dataStr(e.data, "domain");
      if (d) byDomain[d] = e;
    }
    for (const [d, e] of Object.entries(byDomain)) {
      if (dataBool(e.data, "hasBackup") === false) {
        add(findings, "R57", "resilience", 4, d, `Key person risk: ${d}`, `Only one person holds knowledge of "${d}" with no backup.`);
      }
    }
  });

  R(findings, "R58", () => {
    const crises = events.filter((e) => e.domain === "resilience" && e.type === "crisis_detected");
    for (const c of crises) {
      if (daysAgo(c.ts, now) <= 7) continue;
      const crisisId = dataStr(c.data, "crisisId");
      const hasPostmortem = events.some((e) => e.domain === "resilience" && e.type === "crisis_postmortem" && dataStr(e.data, "crisisId") === crisisId);
      if (!hasPostmortem) {
        add(findings, "R58", "resilience", 4, c.id, `Crisis without postmortem: ${crisisId ?? c.id}`, `No postmortem ${Math.round(daysAgo(c.ts, now))} days after crisis.`);
      }
    }
  });

  R(findings, "R59", () => {
    const h = shannonEntropy(events, now);
    if (h > 0.8) {
      add(findings, "R59", "resilience", 2, "entropy_high", "Organizational entropy too high", `Entropy H=${h.toFixed(2)} — signal is chaotic.`);
    } else if (h < 0.2 && h >= 0) {
      add(findings, "R59", "resilience", 2, "entropy_low", "Organizational entropy too low", `Entropy H=${h.toFixed(2)} — org may be too rigid.`);
    }
  });

  R(findings, "R60", () => {
    const recent = events.filter((e) => daysAgo(e.ts, now) <= 90);
    const total = recent.length;
    if (total < 20) return;
    const counts: Record<string, number> = {};
    for (const e of recent) counts[e.domain] = (counts[e.domain] ?? 0) + 1;
    for (const d of HEALTH_DOMAINS) {
      const share = (counts[d] ?? 0) / total;
      if (share < 0.05) {
        add(findings, "R60", "resilience", 2, d, `Information bottleneck: ${d}`, `Domain "${d}" represents only ${(share * 100).toFixed(1)}% of events in 90d.`);
      }
    }
  });

  return findings;
}

// ───────────────────────────── Shannon entropy ───────────────────────

function shannonEntropy(events: LeadosEvent[], now: number): number {
  const recent = events.filter((e) => daysAgo(e.ts, now) <= 90);
  if (recent.length === 0) return 0;
  const counts: Record<string, number> = {};
  for (const e of recent) counts[e.type] = (counts[e.type] ?? 0) + 1;
  const distinct = Object.keys(counts).length;
  if (distinct <= 1) return 0;
  const total = recent.length;
  let H = 0;
  for (const c of Object.values(counts)) {
    const p = c / total;
    H -= p * Math.log2(p);
  }
  return H / Math.log2(distinct);
}

// ───────────────────────────── Goals / Plans ─────────────────────────

function computeGoals(events: LeadosEvent[]): GoalView[] {
  const now = Date.now();
  const byId: Record<string, LeadosEvent[]> = {};
  for (const e of events) {
    if (e.domain !== "people" || e.type !== "goal") continue;
    const id = dataStr(e.data, "goalId");
    if (!id) continue;
    (byId[id] ??= []).push(e);
  }
  const result: GoalView[] = [];
  for (const [id, evs] of Object.entries(byId)) {
    const sorted = [...evs].sort((a, b) => a.ts.getTime() - b.ts.getTime());
    const created = sorted[0];
    const latest = sorted[sorted.length - 1];
    result.push({
      goalId: id,
      title: dataStr(latest.data, "title") ?? dataStr(created.data, "title") ?? "Untitled goal",
      domain: dataStr(latest.data, "domain") ?? "general",
      ownerAssigned: !!dataStr(latest.data, "ownerId"),
      ageDays: daysAgo(created.ts, now),
      status: dataStr(latest.data, "status") ?? "open",
    });
  }
  return result.filter((g) => g.status !== "closed");
}

function computeGrowthPlans(events: LeadosEvent[], people: Person[]): GrowthPlan[] {
  const now = Date.now();
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "Unknown";
  const created = events.filter((e) => e.domain === "people" && e.type === "growth_plan" && dataStr(e.data, "event") === "created");
  const result: GrowthPlan[] = [];
  for (const c of created) {
    const planId = dataStr(c.data, "planId") ?? c.id;
    const personId = dataStr(c.data, "personId") ?? c.personId ?? "unknown";
    const checkins = events.filter(
      (e) => e.domain === "people" && e.type === "growth_plan" && dataStr(e.data, "event") === "checkin" && dataStr(e.data, "planId") === planId
    );
    const lastCheckin = checkins.length > 0 ? checkins.sort((a, b) => b.ts.getTime() - a.ts.getTime())[0].ts : null;
    result.push({
      planId,
      personId,
      personName: nameOf(personId),
      currentLevel: dataStr(c.data, "currentLevel") ?? "D1",
      targetLevel: dataStr(c.data, "targetLevel") ?? "D2",
      ageDays: daysAgo(c.ts, now),
      lastCheckin,
    });
  }
  return result;
}

// ───────────────────────────── Decisions view ────────────────────────

function computeDecisions(events: LeadosEvent[], now: number): DecisionView[] {
  const decisions = events.filter((e) => (e.domain === "strategy" || e.domain === "governance") && e.type === "decision");
  const byKey: Record<string, LeadosEvent[]> = {};
  for (const e of decisions) {
    const id = dataStr(e.data, "decisionId") ?? e.id;
    const key = `${e.domain}:${id}`;
    (byKey[key] ??= []).push(e);
  }
  const result: DecisionView[] = [];
  for (const evs of Object.values(byKey)) {
    const sorted = [...evs].sort((a, b) => a.ts.getTime() - b.ts.getTime());
    const created = sorted[0];
    const latest = sorted[sorted.length - 1];
    result.push({
      id: dataStr(latest.data, "decisionId") ?? latest.id,
      title: dataStr(latest.data, "title") ?? "Untitled decision",
      domain: latest.domain,
      status: dataStr(latest.data, "status") ?? "open",
      ageDays: Math.round(daysAgo(created.ts, now)),
    });
  }
  return result.filter((d) => d.status === "open");
}

// ───────────────────────────── Domain scores / health ────────────────

const PENALTY: Record<number, number> = { 5: -30, 4: -15, 3: -8, 2: -3, 1: -1 };

function computeDomainScores(findings: Finding[]): DomainScore[] {
  return HEALTH_DOMAINS.map((domain) => {
    const domainFindings = findings.filter((f) => f.domain === domain);
    let score = 100;
    for (const f of domainFindings) score += PENALTY[f.sev] ?? 0;
    score = Math.max(0, Math.min(100, score));
    return { domain, score, findings: domainFindings.length };
  });
}

function gradeFor(score: number): OrgHealthScore["grade"] {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

function computeHealthScore(findings: Finding[]): OrgHealthScore {
  const domainScores = computeDomainScores(findings);
  const overall = Math.round(mean(domainScores.map((d) => d.score)));
  return {
    overall,
    grade: gradeFor(overall),
    domains: Object.fromEntries(domainScores.map((d) => [d.domain, d.score])),
    trend: 0,
  };
}

// ───────────────────────────── Correlation clusters ──────────────────

function hasRule(findings: Finding[], rule: string): boolean {
  return findings.some((f) => f.rule === rule);
}

function findingsFor(findings: Finding[], rules: string[]): Finding[] {
  return findings.filter((f) => rules.includes(f.rule));
}

function computeClusters(findings: Finding[]): CorrelationCluster[] {
  const clusters: CorrelationCluster[] = [];
  const defs: Array<{ name: string; rules: string[]; severity: number; description: string }> = [
    {
      name: "DEATH_SPIRAL",
      rules: ["R7", "R34", "R23"],
      severity: 5,
      description: "Burnout, declining velocity, and churn are active simultaneously — a self-reinforcing collapse pattern.",
    },
    {
      name: "REVENUE_AT_RISK",
      rules: ["R20", "R28", "R26"],
      severity: 4,
      description: "Unit economics, unaddressed loss patterns, and thin pipeline together threaten revenue.",
    },
    {
      name: "GOVERNANCE_GAP",
      rules: ["R49", "R54", "R50"],
      severity: 4,
      description: "Stale decisions, a stale risk register, and an unprepared board meeting indicate a governance gap.",
    },
    {
      name: "TALENT_RISK",
      rules: ["R12b", "R6", "R13"],
      severity: 4,
      description: "Recent attrition, unresolved conflict, and low team pulse compound talent risk.",
    },
  ];
  for (const def of defs) {
    if (def.rules.every((r) => hasRule(findings, r))) {
      clusters.push({ ...def, findings: findingsFor(findings, def.rules) });
    }
  }
  return clusters;
}

// ───────────────────────────── Inferences ────────────────────────────

function computeInferences(findings: Finding[]): Inference[] {
  const inferences: Inference[] = [];
  if (["R15", "R10", "R9b"].every((r) => hasRule(findings, r))) {
    inferences.push({
      id: "INF-001",
      name: "Leadership Absence Cascade",
      type: "FORWARD",
      confidence: 0.75,
      title: "Leadership Absence Cascade",
      body:
        "Cadence, growth plans, and ownership are all failing simultaneously. Pattern: step 2 of a 5-step cascade toward attrition.",
      urgency: "THIS_WEEK",
      action: "Re-establish 1:1 cadence and assign owners before the pattern compounds.",
    });
  }
  if (["R21", "R19", "R27"].every((r) => hasRule(findings, r))) {
    inferences.push({
      id: "INF-002",
      name: "Revenue Model Validity",
      type: "BACKWARD",
      confidence: 0.7,
      title: "Revenue Model Validity",
      body: "LTV:CAC broken, MRR declining, win rate falling. Not a sales execution problem — a product-market fit signal.",
      urgency: "IMMEDIATE",
      action: "Revisit ICP and pricing before investing further in sales execution fixes.",
    });
  }
  if (["R7", "R34", "R23"].every((r) => hasRule(findings, r))) {
    inferences.push({
      id: "INF-003",
      name: "Velocity Death Spiral",
      type: "TEMPORAL",
      confidence: 0.85,
      title: "Velocity Death Spiral",
      body: "Burnout → velocity decline → churn. Self-reinforcing. Breaking the loop requires one sprint of deliberate debt/load relief.",
      urgency: "THIS_SPRINT",
      action: "Dedicate one full sprint to load relief and technical debt before taking new commitments.",
    });
  }
  return inferences;
}

// ───────────────────────────── Flight risk ───────────────────────────

function computeFlightRisk(
  events: LeadosEvent[],
  people: Person[],
  pulses: Record<string, PulseView>,
  plans: GrowthPlan[],
  now: number
): FlightRiskResult[] {
  const active = people.filter((p) => !p.archived);
  const planPersonIds = new Set(plans.map((p) => p.personId));
  const results: FlightRiskResult[] = [];

  for (const p of active) {
    const pulse = pulses[p.id];
    if (!pulse || pulse.n === 0) continue;

    let score = 0;
    const signals: string[] = [];

    if (pulse.meanMood < 4) {
      score += 0.25;
      signals.push("low mean mood");
    }
    const slope = pulseSlopePerWeek(events, p.id);
    if (slope < -0.1) {
      score += 0.2;
      signals.push("declining mood trend");
    }
    const oneonones = events.filter((e) => e.domain === "people" && e.type === "oneonone" && (dataStr(e.data, "personId") ?? e.personId) === p.id);
    const latest1on1 = oneonones.sort((a, b) => b.ts.getTime() - a.ts.getTime())[0];
    const gap = latest1on1 ? daysAgo(latest1on1.ts, now) : daysAgo(p.joined_at ?? new Date(now), now);
    const cadenceRatio = gap / (p.cadence_days || 14);
    if (cadenceRatio > 1.5) {
      score += 0.2;
      signals.push("1:1 cadence drift");
    }
    if (!planPersonIds.has(p.id)) {
      score += 0.1;
      signals.push("no growth plan");
    }
    const conflicts60d = events.filter(
      (e) =>
        e.domain === "people" &&
        e.type === "conflict" &&
        (dataStr(e.data, "personA") === p.id || dataStr(e.data, "personB") === p.id) &&
        daysAgo(e.ts, now) <= 60
    ).length;
    if (conflicts60d >= 2) {
      score += 0.15;
      signals.push("multiple recent conflicts");
    }

    score = Math.min(1, Math.round(score * 100) / 100);
    const riskLevel: FlightRiskResult["riskLevel"] =
      score >= 0.7 ? "HIGH" : score >= 0.45 ? "ELEVATED" : score >= 0.2 ? "MODERATE" : "LOW";
    const dataQuality: FlightRiskResult["dataQuality"] = pulse.n >= 6 ? "HIGH" : pulse.n >= 3 ? "MEDIUM" : "LOW";

    results.push({
      personId: p.id,
      personName: p.name,
      riskScore: score,
      riskLevel,
      signals,
      dataQuality,
    });
  }

  return results.sort((a, b) => b.riskScore - a.riskScore);
}

// ───────────────────────────── Temporal mode / feedback loops ────────

function computeTemporalMode(findings: Finding[], clusters: CorrelationCluster[]): ProjectedState["temporalMode"] {
  const sevRatio = findings.length ? findings.filter((f) => f.sev >= 4).length / findings.length : 0;
  const peopleRules = new Set(["R1","R2","R3b","R4","R5b","R6","R7","R8b","R9b","R10","R11b","R12b","R13","R14","R15"]);
  const strategyRules = new Set(["R41","R42","R43","R44","R45","R46","R47"]);
  const peopleCount = findings.filter((f) => peopleRules.has(f.rule)).length;
  const strategyCount = findings.filter((f) => strategyRules.has(f.rule)).length;

  if (clusters.length > 3) return "STRUCTURAL_STRESS";
  if (sevRatio > 0.3) return "REACTIVE";
  if (strategyCount > peopleCount) return "STRATEGIC_DRIFT";
  return "BALANCED";
}

function computeFeedbackLoops(findings: Finding[]): FeedbackLoop[] {
  const loops: FeedbackLoop[] = [];
  loops.push({
    name: "BURNOUT_FEEDBACK_LOOP",
    polarity: "REINFORCING",
    active: ["R7", "R15", "R34"].every((r) => hasRule(findings, r)),
    evidence: "Burnout (R7), cadence drift (R15), and velocity decline (R34) reinforce one another.",
  });
  loops.push({
    name: "VELOCITY_DEATH_SPIRAL",
    polarity: "REINFORCING",
    active: ["R34", "R33", "R23"].every((r) => hasRule(findings, r)),
    evidence: "Velocity decline (R34), deploy frequency drop (R33), and churn (R23) reinforce one another.",
  });
  loops.push({
    name: "TALENT_VIRTUOUS_CYCLE",
    polarity: "REINFORCING_POSITIVE",
    active: !hasRule(findings, "R12b") && !hasRule(findings, "R8b") && !hasRule(findings, "R14"),
    evidence: "No recent attrition, growth plans present, and stable mood — a positive retention loop.",
  });
  return loops;
}

// ───────────────────────────── Main projection ───────────────────────

export function project(events: LeadosEvent[], people: Person[]): ProjectedState {
  const now = Date.now();

  const findings = buildFindings(events, people, now);
  const olderEvents = events.filter((e) => daysAgo(e.ts, now) > 30);
  const priorFindings = buildFindings(olderEvents, people, now);

  const domainScores = computeDomainScores(findings);
  const decisions = computeDecisions(events, now);
  const pulseByPerson = computePulses(events, people, now);
  const openGoals = computeGoals(events);
  const openPlans = computeGrowthPlans(events, people);
  const correlations = computeClusters(findings);
  const inferences = computeInferences(findings);
  const flightRisk = computeFlightRisk(events, people, pulseByPerson, openPlans, now);

  const signals = extractSignals(findings);
  const beliefs: BeliefResult[] = (["attrition_60d", "revenue_miss_quarter", "okr_on_track"] as const).map((h) => {
    const u = updateBelief(h, signals[h]);
    return {
      hypothesis: u.hypothesis,
      prior: u.prior,
      posterior: u.posterior,
      posteriorPct: u.posteriorPct,
      evidence: u.appliedEvidence.map((e) => e.signal),
      highRisk: u.highRisk,
    };
  });

  const healthScore = computeHealthScore(findings);
  const priorHealth = computeHealthScore(priorFindings);
  healthScore.trend = Math.round((healthScore.overall - priorHealth.overall) * 10) / 10;

  const temporalMode = computeTemporalMode(findings, correlations);
  const orgEntropy = Math.round(shannonEntropy(events, now) * 1000) / 1000;
  const feedbackLoops = computeFeedbackLoops(findings);

  return {
    findings: findings.sort((a, b) => b.sev - a.sev),
    domainScores,
    decisions,
    pulseByPerson,
    openGoals,
    openPlans,
    correlations,
    inferences,
    beliefs,
    flightRisk,
    healthScore,
    temporalMode,
    orgEntropy,
    feedbackLoops,
  };
}
