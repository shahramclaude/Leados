// src/lib/bayesianNetwork.ts
//
// Stage 2 of the orchestration pipeline: Bayesian belief updates.
//
// For each person who has active findings from Stage 1, updates posterior
// probabilities for three latent belief nodes (flight_risk, burnout,
// disengagement) using sequential odds-ratio Bayesian updating. Each active
// finding in a node's evidence domains nudges the belief via a likelihood
// ratio proportional to the finding's severity. Priors are read from the
// `beliefs` table (defaulting to 0.1) and posteriors are persisted via
// upsert on (personId, nodeKey).
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";
import type { BayesianUpdateResult, BeliefKey, BeliefNode, Domain, Finding } from "@/lib/types";

type Db = NodePgDatabase<typeof schema>;

const DEFAULT_PRIOR = 0.1;

const EVIDENCE_DOMAINS: Record<BeliefKey, Domain[]> = {
  flight_risk: ["risk", "retention", "sentiment", "engagement"],
  burnout: ["workload", "retention", "sentiment"],
  disengagement: ["engagement", "culture", "collaboration"],
};

function likelihoodForSeverity(severity: number): number {
  // Maps severity 1..5 to a likelihood ratio in [0.55, 0.9].
  return Math.min(0.9, 0.5 + severity * 0.08);
}

function bayesUpdate(prior: number, likelihood: number): number {
  const priorOdds = prior / (1 - prior);
  const likelihoodRatio = likelihood / (1 - likelihood);
  const posteriorOdds = priorOdds * likelihoodRatio;
  const posterior = posteriorOdds / (1 + posteriorOdds);
  return Math.min(0.99, Math.max(0.01, posterior));
}

/**
 * Updates Bayesian belief nodes using the findings produced by Stage 1.
 */
export async function updateBeliefs(
  db: Db,
  now: Date,
  ruleEvaluation: { findings: Finding[] },
): Promise<BayesianUpdateResult> {
  const findingsByPerson = new Map<number, Finding[]>();
  for (const finding of ruleEvaluation.findings) {
    if (finding.personId === null || !finding.active) continue;
    const list = findingsByPerson.get(finding.personId) ?? [];
    list.push(finding);
    findingsByPerson.set(finding.personId, list);
  }

  const personIds = [...findingsByPerson.keys()];
  if (personIds.length === 0) {
    return { computedAt: now.toISOString(), beliefs: [] };
  }

  const existingRows = await db.select().from(schema.beliefs);
  const existingByKey = new Map<string, (typeof existingRows)[number]>();
  for (const row of existingRows) {
    existingByKey.set(`${row.personId}:${row.nodeKey}`, row);
  }

  const results: BeliefNode[] = [];
  const upserts: (typeof schema.beliefs.$inferInsert)[] = [];

  for (const personId of personIds) {
    const personFindings = findingsByPerson.get(personId) ?? [];
    const nodeKeys = Object.keys(EVIDENCE_DOMAINS) as BeliefKey[];

    for (const nodeKey of nodeKeys) {
      const relevantDomains = new Set(EVIDENCE_DOMAINS[nodeKey]);
      const relevantFindings = personFindings.filter((f) => relevantDomains.has(f.domain));
      if (relevantFindings.length === 0) continue;

      const existing = existingByKey.get(`${personId}:${nodeKey}`);
      const prior = existing?.probability ?? DEFAULT_PRIOR;

      let posterior = prior;
      for (const finding of relevantFindings) {
        posterior = bayesUpdate(posterior, likelihoodForSeverity(finding.severity));
      }

      upserts.push({
        personId,
        nodeKey,
        probability: posterior,
        priorProbability: prior,
        evidenceCount: relevantFindings.length,
        updatedAt: now,
      });

      results.push({
        personId,
        nodeKey,
        priorProbability: prior,
        probability: posterior,
        evidenceCount: relevantFindings.length,
        updatedAt: now.toISOString(),
      });
    }
  }

  if (upserts.length > 0) {
    await db
      .insert(schema.beliefs)
      .values(upserts)
      .onConflictDoUpdate({
        target: [schema.beliefs.personId, schema.beliefs.nodeKey],
        set: {
          probability: sql`excluded.probability`,
          priorProbability: sql`excluded.prior_probability`,
          evidenceCount: sql`excluded.evidence_count`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }

  return { computedAt: now.toISOString(), beliefs: results };
}
