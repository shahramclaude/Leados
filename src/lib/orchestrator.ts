// Orchestrator: runs one end-to-end sweep over people/domains/metrics and
// produces a structured OrchestratorResult that downstream systems
// (autonomousAgent.ts, selfImprove.ts, the UI) consume.
//
// SCOPE NOTE: the repo had no real telemetry ingestion (Part 1 was not
// present in this snapshot), so metric snapshots are seeded with a
// lightweight simulated random-walk feed on first run and advanced a little
// on every subsequent run. This keeps the statistics (z-scores, health
// deltas, causal confidence) genuinely dynamic across runs without
// depending on an external data source. This simulation is isolated to the
// `advanceSimulatedTelemetry()` function below — everything downstream
// (anomaly detection, rule evaluation, calibration, hypotheses) operates
// on whatever is actually in the database.

import { randomUUID } from "crypto";
import { and, desc, eq, gte } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import { causalChains, domains, metricSnapshots, people, rules } from "@/db/schema";
import { ensureRulesSeeded, getAllRules } from "./ruleStore";

type Database = typeof defaultDb;

const DOMAIN_SEED = ["Engineering", "Sales", "Customer Success", "Finance", "People Ops"];
const METRIC_NAMES = ["throughput", "error_rate", "satisfaction", "cycle_time"];
const PEOPLE_SEED = [
  { name: "Avery Chen", department: "Engineering" },
  { name: "Priya Natarajan", department: "Sales" },
  { name: "Jordan Blake", department: "Customer Success" },
  { name: "Sam Okafor", department: "Finance" },
  { name: "Riley Thompson", department: "People Ops" },
];

export interface AnomalyFinding {
  domainId: number;
  domainName: string;
  metricName: string;
  value: number;
  mean: number;
  stddev: number;
  zScore: number;
}

export interface CausalChainFinding {
  id: number;
  cause: { domainId: number; domain: string; label: string };
  effect: { domainId: number; domain: string; label: string };
  confidence: number;
}

export interface FlightRiskFinding {
  personId: number;
  name: string;
  department: string | null;
  flightRiskScore: number;
}

export interface DomainHealthFinding {
  domainId: number;
  name: string;
  healthScore: number;
  priorHealthScore: number;
  delta: number;
}

export interface OrchestratorResult {
  runId: string;
  startedAt: string;
  durationMs: number;
  stagesCompleted: string[];
  findings: {
    anomalies: AnomalyFinding[];
    causalChains: CausalChainFinding[];
    flightRisks: FlightRiskFinding[];
    domainHealth: DomainHealthFinding[];
  };
  findingsCount: number;
}

function seededRandom(seed: number): () => number {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

async function ensureSeedData(db: Database): Promise<void> {
  const existingDomains = await db.select().from(domains);
  if (existingDomains.length === 0) {
    await db.insert(domains).values(DOMAIN_SEED.map((name) => ({ name })));
  }

  const existingPeople = await db.select().from(people);
  if (existingPeople.length === 0) {
    await db.insert(people).values(
      PEOPLE_SEED.map((p) => ({
        name: p.name,
        department: p.department,
        flightRiskScore: 0.2,
      })),
    );
  }

  await ensureRulesSeeded(db);
}

/**
 * Advances a lightweight simulated telemetry feed by one tick (one snapshot
 * per domain/metric pair), and nudges flight risk scores + causal chain
 * confidence. UNVERIFIED: these are placeholder dynamics standing in for a
 * real telemetry/ML pipeline that is out of scope for this task.
 */
async function advanceSimulatedTelemetry(db: Database): Promise<void> {
  const allDomains = await db.select().from(domains);
  const daySeed = Math.floor(Date.now() / (1000 * 60 * 60)); // changes hourly

  for (const domain of allDomains) {
    for (const metricName of METRIC_NAMES) {
      const rand = seededRandom(hashString(`${domain.name}:${metricName}:${daySeed}`));
      const base = 50 + rand() * 20;
      // Occasionally inject a spike so anomaly detection has something to find.
      const spike = rand() > 0.88 ? (rand() > 0.5 ? 1 : -1) * (25 + rand() * 25) : 0;
      const value = base + spike;

      await db.insert(metricSnapshots).values({
        domainId: domain.id,
        metricName,
        value,
      });
    }
  }

  const allPeople = await db.select().from(people);
  for (const person of allPeople) {
    const rand = seededRandom(hashString(`${person.name}:flight:${daySeed}`));
    const drift = (rand() - 0.45) * 0.08;
    const next = Math.min(1, Math.max(0, person.flightRiskScore + drift));
    await db.update(people).set({ flightRiskScore: next, updatedAt: new Date() }).where(eq(people.id, person.id));
  }

  // Occasionally (re)synthesize a cross-domain causal chain candidate.
  if (allDomains.length >= 2) {
    const rand = seededRandom(hashString(`causal:${daySeed}`));
    if (rand() > 0.6) {
      const causeIdx = Math.floor(rand() * allDomains.length);
      let effectIdx = Math.floor(rand() * allDomains.length);
      if (effectIdx === causeIdx) effectIdx = (effectIdx + 1) % allDomains.length;
      const cause = allDomains[causeIdx];
      const effect = allDomains[effectIdx];
      const confidence = 0.5 + rand() * 0.5;
      await db.insert(causalChains).values({
        causeDomainId: cause.id,
        effectDomainId: effect.id,
        causeLabel: `${cause.name} throughput degradation`,
        effectLabel: `${effect.name} satisfaction decline`,
        confidence,
      });
    }
  }
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values: number[], avg: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((acc, v) => acc + (v - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

async function detectAnomalies(db: Database): Promise<AnomalyFinding[]> {
  const allDomains = await db.select().from(domains);
  const findings: AnomalyFinding[] = [];
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  for (const domain of allDomains) {
    for (const metricName of METRIC_NAMES) {
      const history = await db
        .select()
        .from(metricSnapshots)
        .where(
          and(
            eq(metricSnapshots.domainId, domain.id),
            eq(metricSnapshots.metricName, metricName),
            gte(metricSnapshots.recordedAt, since),
          ),
        )
        .orderBy(desc(metricSnapshots.recordedAt))
        .limit(200);

      if (history.length < 5) continue;

      const [latest, ...rest] = history;
      const baselineValues = rest.map((h) => h.value);
      const avg = mean(baselineValues);
      const sd = stddev(baselineValues, avg);
      if (sd === 0) continue;

      // Standard z-score: z = (x - mean) / stddev.
      // UNVERIFIED: not sourced from a repo file — standard statistical definition,
      // used here because the task explicitly references "z-score > 2.5" anomalies.
      const zScore = (latest.value - avg) / sd;

      if (Math.abs(zScore) > 2.5) {
        findings.push({
          domainId: domain.id,
          domainName: domain.name,
          metricName,
          value: latest.value,
          mean: avg,
          stddev: sd,
          zScore,
        });
      }
    }
  }

  return findings;
}

async function scoreDomainHealth(db: Database, anomalies: AnomalyFinding[]): Promise<DomainHealthFinding[]> {
  const allDomains = await db.select().from(domains);
  const findings: DomainHealthFinding[] = [];

  for (const domain of allDomains) {
    const domainAnomalies = anomalies.filter((a) => a.domainId === domain.id);
    // UNVERIFIED simulated scoring formula (no real health-scoring logic exists
    // in the repo): penalize 8 points per anomalous metric, scaled by severity.
    const penalty = domainAnomalies.reduce((acc, a) => acc + Math.min(40, Math.abs(a.zScore) * 8), 0);
    const newHealth = Math.max(0, Math.min(100, 100 - penalty));
    const priorHealth = domain.healthScore;

    await db
      .update(domains)
      .set({ healthScore: newHealth, priorHealthScore: priorHealth, updatedAt: new Date() })
      .where(eq(domains.id, domain.id));

    findings.push({
      domainId: domain.id,
      name: domain.name,
      healthScore: newHealth,
      priorHealthScore: priorHealth,
      delta: newHealth - priorHealth,
    });
  }

  return findings;
}

async function listCausalChains(db: Database): Promise<CausalChainFinding[]> {
  const allDomains = await db.select().from(domains);
  const domainById = new Map(allDomains.map((d) => [d.id, d.name]));

  const chains = await db
    .select()
    .from(causalChains)
    .orderBy(desc(causalChains.createdAt))
    .limit(50);

  return chains
    .filter((c) => c.causeDomainId !== null && c.effectDomainId !== null)
    .map((c) => ({
      id: c.id,
      cause: {
        domainId: c.causeDomainId as number,
        domain: domainById.get(c.causeDomainId as number) ?? "Unknown",
        label: c.causeLabel,
      },
      effect: {
        domainId: c.effectDomainId as number,
        domain: domainById.get(c.effectDomainId as number) ?? "Unknown",
        label: c.effectLabel,
      },
      confidence: c.confidence,
    }));
}

async function listFlightRisks(db: Database): Promise<FlightRiskFinding[]> {
  const allPeople = await db.select().from(people);
  return allPeople.map((p) => ({
    personId: p.id,
    name: p.name,
    department: p.department,
    flightRiskScore: p.flightRiskScore,
  }));
}

async function evaluateRules(db: Database, result: OrchestratorResult, runId: string): Promise<void> {
  const allRules = await getAllRules(db);
  const ruleByKey = new Map(allRules.map((r) => [r.key, r]));
  const { recordRuleEvaluation } = await import("./ruleStore");

  const flightRule = ruleByKey.get("FLIGHT_RISK_THRESHOLD");
  if (flightRule) {
    for (const person of result.findings.flightRisks) {
      if (person.flightRiskScore > 0.6) {
        await recordRuleEvaluation(db, {
          ruleId: flightRule.id,
          runId,
          predictedProbability: person.flightRiskScore,
          context: { personId: person.personId, name: person.name },
        });
      }
    }
  }

  const domainRule = ruleByKey.get("DOMAIN_HEALTH_DROP");
  if (domainRule) {
    for (const d of result.findings.domainHealth) {
      if (d.delta < -15) {
        await recordRuleEvaluation(db, {
          ruleId: domainRule.id,
          runId,
          predictedProbability: Math.min(1, Math.abs(d.delta) / 100),
          context: { domainId: d.domainId, name: d.name, delta: d.delta },
        });
      }
    }
  }

  const causalRule = ruleByKey.get("CAUSAL_CHAIN_CONFIDENCE");
  if (causalRule) {
    for (const chain of result.findings.causalChains) {
      if (chain.confidence > 0.7) {
        await recordRuleEvaluation(db, {
          ruleId: causalRule.id,
          runId,
          predictedProbability: chain.confidence,
          context: { chainId: chain.id, cause: chain.cause, effect: chain.effect },
        });
      }
    }
  }

  const anomalyRule = ruleByKey.get("METRIC_ANOMALY_ZSCORE");
  if (anomalyRule) {
    for (const anomaly of result.findings.anomalies) {
      await recordRuleEvaluation(db, {
        ruleId: anomalyRule.id,
        runId,
        predictedProbability: Math.min(1, Math.abs(anomaly.zScore) / 5),
        context: anomaly,
      });
    }
  }
}

export async function runFullOrchestration(db: Database = defaultDb): Promise<OrchestratorResult> {
  const startedAt = Date.now();
  const runId = randomUUID();
  const stagesCompleted: string[] = [];

  await ensureSeedData(db);
  stagesCompleted.push("seed-check");

  await advanceSimulatedTelemetry(db);
  stagesCompleted.push("telemetry-tick");

  const anomalies = await detectAnomalies(db);
  stagesCompleted.push("metric-anomaly-detection");

  const domainHealth = await scoreDomainHealth(db, anomalies);
  stagesCompleted.push("domain-health-scoring");

  const chains = await listCausalChains(db);
  stagesCompleted.push("causal-chain-analysis");

  const flightRisks = await listFlightRisks(db);
  stagesCompleted.push("flight-risk-assessment");

  const result: OrchestratorResult = {
    runId,
    startedAt: new Date(startedAt).toISOString(),
    durationMs: 0,
    stagesCompleted,
    findings: {
      anomalies,
      causalChains: chains,
      flightRisks,
      domainHealth,
    },
    findingsCount:
      anomalies.length +
      chains.filter((c) => c.confidence > 0.7).length +
      flightRisks.filter((f) => f.flightRiskScore > 0.6).length +
      domainHealth.filter((d) => d.delta < -15).length,
  };

  await evaluateRules(db, result, runId);
  stagesCompleted.push("rule-evaluation-logging");

  result.durationMs = Date.now() - startedAt;
  return result;
}

export { rules as rulesTable };
