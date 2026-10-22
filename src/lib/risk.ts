// src/lib/risk.ts
//
// Quantified risk register domain logic: CRUD over the `risks` + `riskControls`
// tables, assembly of simulation inputs, and the inherent/residual belief
// maths that doesn't require full Monte Carlo (point summaries + intervals).
//
// PROVENANCE: no pre-existing src/lib/risk.ts was found in this sandbox
// (directory was empty — see PHASE 0 findings in docs/part29-grc-risk-governance.md).
// This is a first-principles implementation against the Part 29 spec.

import { db } from "@/db";
import { risks, riskControls, controls, type ImpactDistribution } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  betaMean,
  betaCredibleInterval,
  evidenceStrengthLabel,
  type BetaBelief,
} from "./beta";
import type { ControlForSimulation, RiskForSimulation } from "./montecarlo";

export interface RiskScenario {
  cause: string;
  event: string;
  consequence: string;
}

export interface RiskRecord {
  id: number;
  code: string;
  title: string;
  scenario: RiskScenario;
  category: string;
  owner: string;
  likelihood: BetaBelief;
  impact: ImpactDistribution;
  velocityDays: number;
  detectability: BetaBelief;
  linkedDecisions: string[];
  linkedIndicators: string[];
  status: string;
  controls: Array<{
    riskControlId: number;
    controlId: number;
    controlCode: string;
    controlName: string;
    controlType: "preventive" | "detective" | "corrective";
    effectiveness: BetaBelief;
    lastTestedAt: string | null;
    nextTestDueAt: string;
  }>;
}

export async function listRisks(): Promise<RiskRecord[]> {
  const riskRows = await db.select().from(risks);
  const out: RiskRecord[] = [];
  for (const r of riskRows) {
    out.push(await hydrateRisk(r));
  }
  return out;
}

export async function getRisk(id: number): Promise<RiskRecord | null> {
  const [r] = await db.select().from(risks).where(eq(risks.id, id));
  if (!r) return null;
  return hydrateRisk(r);
}

async function hydrateRisk(r: typeof risks.$inferSelect): Promise<RiskRecord> {
  const rcRows = await db
    .select({
      riskControlId: riskControls.id,
      controlId: riskControls.controlId,
      effectiveness: riskControls.effectiveness,
      lastTestedAt: riskControls.lastTestedAt,
      nextTestDueAt: riskControls.nextTestDueAt,
      controlCode: controls.code,
      controlName: controls.name,
      controlType: controls.type,
    })
    .from(riskControls)
    .innerJoin(controls, eq(riskControls.controlId, controls.id))
    .where(eq(riskControls.riskId, r.id));

  return {
    id: r.id,
    code: r.code,
    title: r.title,
    scenario: { cause: r.cause, event: r.event, consequence: r.consequence },
    category: r.category,
    owner: r.owner,
    likelihood: r.likelihood,
    impact: r.impact,
    velocityDays: Number(r.velocityDays),
    detectability: r.detectability,
    linkedDecisions: r.linkedDecisions,
    linkedIndicators: r.linkedIndicators,
    status: r.status,
    controls: rcRows.map((c) => ({
      riskControlId: c.riskControlId,
      controlId: c.controlId,
      controlCode: c.controlCode,
      controlName: c.controlName,
      controlType: c.controlType as "preventive" | "detective" | "corrective",
      effectiveness: c.effectiveness,
      lastTestedAt: c.lastTestedAt,
      nextTestDueAt: c.nextTestDueAt,
    })),
  };
}

export function toSimulationInput(risk: RiskRecord): RiskForSimulation {
  const controlsForSim: ControlForSimulation[] = risk.controls.map((c) => ({
    controlId: c.controlId,
    type: c.controlType,
    effectiveness: c.effectiveness,
  }));
  return {
    riskId: risk.id,
    likelihood: risk.likelihood,
    impact: risk.impact,
    controls: controlsForSim,
  };
}

export interface RiskBeliefSummary {
  likelihoodMean: number;
  likelihoodInterval90: { low: number; high: number };
  likelihoodEvidence: "thin" | "moderate" | "strong";
  detectabilityMean: number;
  detectabilityInterval90: { low: number; high: number };
  controlEffectivenessSummaries: Array<{
    controlId: number;
    mean: number;
    interval90: { low: number; high: number };
    evidence: "thin" | "moderate" | "strong";
    overdue: boolean;
  }>;
}

/** Non-Monte-Carlo belief summary — cheap to compute for list views. */
export function summarizeBeliefs(risk: RiskRecord, now = new Date()): RiskBeliefSummary {
  return {
    likelihoodMean: betaMean(risk.likelihood),
    likelihoodInterval90: betaCredibleInterval(risk.likelihood, 0.9),
    likelihoodEvidence: evidenceStrengthLabel(risk.likelihood),
    detectabilityMean: betaMean(risk.detectability),
    detectabilityInterval90: betaCredibleInterval(risk.detectability, 0.9),
    controlEffectivenessSummaries: risk.controls.map((c) => ({
      controlId: c.controlId,
      mean: betaMean(c.effectiveness),
      interval90: betaCredibleInterval(c.effectiveness, 0.9),
      evidence: evidenceStrengthLabel(c.effectiveness),
      overdue: new Date(c.nextTestDueAt).getTime() < now.getTime(),
    })),
  };
}

export async function createRisk(input: {
  code: string;
  title: string;
  scenario: RiskScenario;
  category: string;
  owner: string;
  likelihood: BetaBelief;
  impact: ImpactDistribution;
  velocityDays: number;
  detectability: BetaBelief;
  linkedDecisions?: string[];
  linkedIndicators?: string[];
}) {
  const [row] = await db
    .insert(risks)
    .values({
      code: input.code,
      title: input.title,
      cause: input.scenario.cause,
      event: input.scenario.event,
      consequence: input.scenario.consequence,
      category: input.category,
      owner: input.owner,
      likelihood: input.likelihood,
      impact: input.impact,
      velocityDays: input.velocityDays.toString(),
      detectability: input.detectability,
      linkedDecisions: input.linkedDecisions ?? [],
      linkedIndicators: input.linkedIndicators ?? [],
    })
    .returning();
  return row;
}

export async function linkControlToRisk(input: {
  riskId: number;
  controlId: number;
  effectiveness: BetaBelief;
  nextTestDueAt: string;
}) {
  const [row] = await db
    .insert(riskControls)
    .values({
      riskId: input.riskId,
      controlId: input.controlId,
      effectiveness: input.effectiveness,
      nextTestDueAt: input.nextTestDueAt,
    })
    .returning();
  return row;
}
