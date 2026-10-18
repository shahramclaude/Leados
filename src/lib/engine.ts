// src/lib/engine.ts
//
// Stage 1 of the orchestration pipeline: rule evaluation.
//
// Reads raw behavioural/operational signals from the `signals` table,
// aggregates them per person over a lookback window, and evaluates a
// catalog of domain rules against those aggregates. Matching rules produce
// `findings`, which are persisted (prior active findings for the same
// rule+person are resolved first so the table doesn't grow unbounded).
//
// UNVERIFIED-PRIOR-STATE: no pre-existing rule catalog was found in this
// sandbox (see orchestrator.ts header). This is a new, from-scratch rule
// set covering the 8 domains named in the task brief.
import { and, eq, gte, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";
import type { Domain, Finding, RuleEvaluationResult, Severity } from "@/lib/types";

type Db = NodePgDatabase<typeof schema>;

const LOOKBACK_DAYS = 90;

interface PersonAggregate {
  personId: number;
  teamId: string;
  counts: Record<string, number>;
  sums: Record<string, number>;
  averages: Record<string, number>;
  seriesByType: Record<string, { occurredAt: Date; value: number }[]>;
}

interface RuleDefinition {
  id: string;
  domain: Domain;
  severity: Severity;
  description: string;
  evaluate: (agg: PersonAggregate) => { message: string; evidence: Record<string, number | string> } | null;
}

function trendDeclining(series: { occurredAt: Date; value: number }[]): boolean {
  if (series.length < 3) return false;
  const sorted = [...series].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const mid = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, mid);
  const secondHalf = sorted.slice(mid);
  const avg = (arr: { value: number }[]) => arr.reduce((s, x) => s + x.value, 0) / (arr.length || 1);
  return avg(secondHalf) < avg(firstHalf) - 0.1;
}

const RULES: RuleDefinition[] = [
  {
    id: "WL-01",
    domain: "workload",
    severity: 3,
    description: "Meeting overload",
    evaluate: (a) => {
      const avgHours = a.averages["meeting_hours"] ?? 0;
      if (avgHours > 25) {
        return { message: "Sustained meeting overload (avg > 25h/week)", evidence: { avgHoursPerWeek: round(avgHours) } };
      }
      return null;
    },
  },
  {
    id: "WL-02",
    domain: "workload",
    severity: 3,
    description: "After-hours work pattern",
    evaluate: (a) => {
      const count = a.counts["commit_late_night"] ?? 0;
      if (count >= 5) {
        return { message: "Repeated after-hours activity detected", evidence: { lateNightEvents: count } };
      }
      return null;
    },
  },
  {
    id: "SENT-01",
    domain: "sentiment",
    severity: 4,
    description: "Negative sentiment trend",
    evaluate: (a) => {
      const avg = a.averages["sentiment_score"];
      if (avg !== undefined && avg < -0.3) {
        return { message: "Average sentiment is negative", evidence: { avgSentiment: round(avg) } };
      }
      return null;
    },
  },
  {
    id: "SENT-02",
    domain: "sentiment",
    severity: 3,
    description: "Declining sentiment trajectory",
    evaluate: (a) => {
      const series = a.seriesByType["sentiment_score"] ?? [];
      if (trendDeclining(series)) {
        return { message: "Sentiment trajectory declining over window", evidence: { samples: series.length } };
      }
      return null;
    },
  },
  {
    id: "RET-01",
    domain: "retention",
    severity: 3,
    description: "Burnout-adjacent: low PTO usage",
    evaluate: (a) => {
      const sum = a.sums["pto_days_taken"] ?? 0;
      if (sum < 2) {
        return { message: "Very low PTO usage over the last quarter", evidence: { ptoDaysTaken: round(sum) } };
      }
      return null;
    },
  },
  {
    id: "RET-02",
    domain: "retention",
    severity: 4,
    description: "Overdue promotion",
    evaluate: (a) => {
      const months = a.averages["promotion_overdue_months"];
      if (months !== undefined && months > 12) {
        return { message: "Promotion overdue by more than a year", evidence: { monthsOverdue: round(months) } };
      }
      return null;
    },
  },
  {
    id: "CULT-01",
    domain: "culture",
    severity: 3,
    description: "Manager disengagement: skipped 1:1s",
    evaluate: (a) => {
      const count = a.counts["one_on_one_skipped"] ?? 0;
      if (count >= 3) {
        return { message: "Multiple 1:1s skipped", evidence: { skipped: count } };
      }
      return null;
    },
  },
  {
    id: "CULT-02",
    domain: "culture",
    severity: 4,
    description: "Repeated conflict incidents",
    evaluate: (a) => {
      const count = a.counts["conflict_incident"] ?? 0;
      if (count >= 2) {
        return { message: "Repeated interpersonal conflict incidents", evidence: { incidents: count } };
      }
      return null;
    },
  },
  {
    id: "ENG-01",
    domain: "engagement",
    severity: 2,
    description: "No peer recognition signals",
    evaluate: (a) => {
      const count = a.counts["peer_recognition"] ?? 0;
      const hasSignals = (a.counts["signal_count"] ?? 0) > 0;
      if (count === 0 && hasSignals) {
        return { message: "No peer recognition received in window", evidence: { peerRecognitionEvents: 0 } };
      }
      return null;
    },
  },
  {
    id: "ENG-02",
    domain: "engagement",
    severity: 3,
    description: "Seeking internal mobility",
    evaluate: (a) => {
      const count = a.counts["internal_mobility_apply"] ?? 0;
      if (count >= 1) {
        return { message: "Applied to internal mobility opportunities", evidence: { applications: count } };
      }
      return null;
    },
  },
  {
    id: "COLLAB-01",
    domain: "collaboration",
    severity: 2,
    description: "Slow collaboration response",
    evaluate: (a) => {
      const avg = a.averages["response_latency_hours"];
      if (avg !== undefined && avg > 24) {
        return { message: "Average response latency exceeds 24h", evidence: { avgLatencyHours: round(avg) } };
      }
      return null;
    },
  },
  {
    id: "PERF-01",
    domain: "performance",
    severity: 3,
    description: "Low OKR completion",
    evaluate: (a) => {
      const avg = a.averages["okr_completion_rate"];
      if (avg !== undefined && avg < 0.5) {
        return { message: "OKR completion rate below 50%", evidence: { completionRate: round(avg) } };
      }
      return null;
    },
  },
  {
    id: "PERF-02",
    domain: "performance",
    severity: 3,
    description: "High code review rejection rate",
    evaluate: (a) => {
      const avg = a.averages["code_review_rejection_rate"];
      if (avg !== undefined && avg > 0.4) {
        return { message: "Code review rejection rate above 40%", evidence: { rejectionRate: round(avg) } };
      }
      return null;
    },
  },
  {
    id: "PERF-03",
    domain: "performance",
    severity: 4,
    description: "Significant deal slippage",
    evaluate: (a) => {
      const sum = a.sums["deal_slip_days"] ?? 0;
      if (sum > 30) {
        return { message: "Cumulative deal slippage exceeds 30 days", evidence: { slipDays: round(sum) } };
      }
      return null;
    },
  },
  {
    id: "RISK-01",
    domain: "risk",
    severity: 5,
    description: "External recruiter contact detected",
    evaluate: (a) => {
      const count = a.counts["external_recruiter_contact"] ?? 0;
      if (count >= 1) {
        return { message: "External recruiter contact detected", evidence: { contacts: count } };
      }
      return null;
    },
  },
  {
    id: "RISK-02",
    domain: "risk",
    severity: 4,
    description: "Below-market compensation gap",
    evaluate: (a) => {
      const avg = a.averages["compensation_benchmark_gap"];
      if (avg !== undefined && avg > 15) {
        return { message: "Compensation trails market benchmark by >15%", evidence: { gapPercent: round(avg) } };
      }
      return null;
    },
  },
];

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

async function loadAggregates(db: Db, now: Date): Promise<PersonAggregate[]> {
  const cutoff = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      personId: schema.signals.personId,
      team: schema.people.team,
      type: schema.signals.type,
      value: schema.signals.value,
      occurredAt: schema.signals.occurredAt,
    })
    .from(schema.signals)
    .innerJoin(schema.people, eq(schema.signals.personId, schema.people.id))
    .where(gte(schema.signals.occurredAt, cutoff));

  const byPerson = new Map<number, PersonAggregate>();
  for (const row of rows) {
    let agg = byPerson.get(row.personId);
    if (!agg) {
      agg = { personId: row.personId, teamId: row.team, counts: {}, sums: {}, averages: {}, seriesByType: {} };
      byPerson.set(row.personId, agg);
    }
    agg.counts[row.type] = (agg.counts[row.type] ?? 0) + 1;
    agg.counts["signal_count"] = (agg.counts["signal_count"] ?? 0) + 1;
    agg.sums[row.type] = (agg.sums[row.type] ?? 0) + row.value;
    if (!agg.seriesByType[row.type]) agg.seriesByType[row.type] = [];
    agg.seriesByType[row.type].push({ occurredAt: row.occurredAt, value: row.value });
  }

  for (const agg of byPerson.values()) {
    for (const type of Object.keys(agg.sums)) {
      agg.averages[type] = agg.sums[type] / agg.counts[type];
    }
  }

  return [...byPerson.values()];
}

/**
 * Evaluates the rule catalog against recent signals and persists findings.
 * Previously-active findings for rules re-evaluated this run are resolved
 * first (set inactive) so the table reflects current state rather than an
 * ever-growing history.
 */
export async function evaluateRules(db: Db, now: Date): Promise<RuleEvaluationResult> {
  const aggregates = await loadAggregates(db, now);
  const evaluatedPersonIds = aggregates.map((a) => a.personId);

  if (evaluatedPersonIds.length > 0) {
    await db
      .update(schema.findings)
      .set({ active: false, resolvedAt: now })
      .where(and(eq(schema.findings.active, true), inArray(schema.findings.personId, evaluatedPersonIds)));
  }

  const toInsert: (typeof schema.findings.$inferInsert)[] = [];
  for (const agg of aggregates) {
    for (const rule of RULES) {
      const outcome = rule.evaluate(agg);
      if (outcome) {
        toInsert.push({
          ruleId: rule.id,
          domain: rule.domain,
          personId: agg.personId,
          teamId: agg.teamId,
          severity: rule.severity,
          message: outcome.message,
          evidence: outcome.evidence,
          active: true,
          createdAt: now,
        });
      }
    }
  }

  let inserted: (typeof schema.findings.$inferSelect)[] = [];
  if (toInsert.length > 0) {
    inserted = await db.insert(schema.findings).values(toInsert).returning();
  }

  const findings: Finding[] = inserted.map((row) => ({
    id: row.id,
    ruleId: row.ruleId,
    domain: row.domain as Domain,
    personId: row.personId,
    teamId: row.teamId,
    severity: row.severity as Severity,
    message: row.message,
    evidence: row.evidence ?? {},
    active: row.active,
    createdAt: row.createdAt.toISOString(),
  }));

  return {
    computedAt: now.toISOString(),
    rulesEvaluated: RULES.length,
    peopleEvaluated: aggregates.length,
    findings,
  };
}
