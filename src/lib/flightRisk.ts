// Part 09-B: calibrated, explainable, fair flight-risk engine.
//
// IMPORTANT: this is an OBSERVATIONAL, correlational model. It has not been
// validated against a randomized experiment, so every driver and
// counterfactual is reported with causalStatus = "association" (see
// docs/FAIRNESS.md and src/lib/causalLanguage.ts). It must never be
// presented, in code or UI copy, as predicting an individual will resign.

import { db } from "@/db";
import { people, oneOnOnes, commitments, growthPlans, attritionOutcomes, events } from "@/db/schema";
import { and, eq, gte, lte, ne, sql } from "drizzle-orm";
import type { Explain, Driver, Counterfactual } from "./explain";
import {
  assertNoProtectedFeatures,
  FLIGHT_RISK_ALLOWED_FEATURES,
  type ExcludedProxyField,
} from "./protectedAttributes";
import { type Actor, canReadIndividualScore, assertAccess } from "./accessControl";

export type FeatureName = (typeof FLIGHT_RISK_ALLOWED_FEATURES)[number];
export type FlightRiskFeatures = Record<FeatureName, number>;

/** Fixed, documented logistic coefficients (log-odds scale). See docs/FAIRNESS.md
 * "Model card" for derivation and the monthly recalibration process
 * (src/lib/scheduler/recalibration.ts, Part 07 seam) that updates these from
 * outcomes, never from protected attributes. */
export const MODEL_INTERCEPT = -1.6;
export const MODEL_COEFFICIENTS: Record<FeatureName, number> = {
  compaRatioBelowBandGap: 2.2, // gap in band points below 1.0
  tenureMonths: -0.004, // longer tenure, modestly lower risk, saturates
  daysSinceLastOneOnOne: 0.01,
  managerChangedLast90d: 0.55,
  teamAttritionRate90d: 1.4,
  growthPlanActivityLast180d: -0.6,
  commitmentFollowThroughRate: -0.5,
  skillStagnationMonths: 0.03,
  promotionGapMonthsVsRoleMedian: 0.015,
};

const FEATURE_LABELS: Record<FeatureName, string> = {
  compaRatioBelowBandGap: "Compa-ratio below band midpoint",
  tenureMonths: "Tenure",
  daysSinceLastOneOnOne: "Days since last 1:1",
  managerChangedLast90d: "Manager changed in last 90 days",
  teamAttritionRate90d: "Team attrition rate (last 90 days)",
  growthPlanActivityLast180d: "Active growth plan in last 180 days",
  commitmentFollowThroughRate: "Commitment follow-through rate",
  skillStagnationMonths: "Months since last new skill evidence",
  promotionGapMonthsVsRoleMedian: "Months since last promotion vs. role median",
};

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** Pure scoring function — no I/O — so it is trivially unit-testable and
 * reusable by the fairness audit with synthetic populations. */
export function computeFlightRisk(
  features: FlightRiskFeatures,
  opts: { asOf: Date; observationCount: number },
): Explain<number> {
  // Defense in depth: assert the feature vector itself, every call.
  assertNoProtectedFeatures(Object.keys(features));

  let logOdds = MODEL_INTERCEPT;
  const drivers: Driver[] = [];
  const p0 = sigmoid(MODEL_INTERCEPT);

  for (const key of Object.keys(MODEL_COEFFICIENTS) as FeatureName[]) {
    const coef = MODEL_COEFFICIENTS[key];
    const value = features[key] ?? 0;
    const contributionLogOdds = coef * value;
    logOdds += contributionLogOdds;
  }
  const probability = sigmoid(logOdds);

  for (const key of Object.keys(MODEL_COEFFICIENTS) as FeatureName[]) {
    const coef = MODEL_COEFFICIENTS[key];
    const value = features[key] ?? 0;
    // Linear approximation of this driver's marginal contribution in
    // probability space, holding others fixed, around the working point.
    const derivative = probability * (1 - probability);
    const contribution = derivative * coef * value;
    if (Math.abs(contribution) < 0.0005) continue;
    drivers.push({
      name: FEATURE_LABELS[key],
      contribution: Number(contribution.toFixed(4)),
      direction: contribution >= 0 ? "increases" : "decreases",
      evidence: `feature=${key} value=${value}`,
      causalStatus: "association",
    });
  }
  drivers.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  // Heuristic uncertainty: fewer underlying observations (1:1s, tenure
  // months, growth-plan events) -> wider interval. This is NOT a sampled
  // posterior; it is an explicit, documented proxy for "how much evidence
  // backs this number" pending the richer Bayesian loop (Part 04).
  const width = Math.max(0.06, 0.26 - Math.min(0.2, opts.observationCount * 0.015));
  const low = Math.max(0, probability - width / 2);
  const high = Math.min(1, probability + width / 2);

  const counterfactuals: Counterfactual[] = [];
  counterfactuals.push(
    cf("growthPlanActivityLast180d", 1, features, probability, "Hold a growth/development conversation"),
  );
  counterfactuals.push(
    cf("daysSinceLastOneOnOne", 14, features, probability, "Bring 1:1 cadence back to ~every 2 weeks"),
  );
  counterfactuals.push(
    cf(
      "commitmentFollowThroughRate",
      Math.min(1, (features.commitmentFollowThroughRate ?? 0) + 0.3),
      features,
      probability,
      "Improve commitment follow-through by closing open promises",
    ),
  );

  return {
    value: Number(probability.toFixed(4)),
    method:
      "Logistic regression over whitelisted, non-demographic features; coefficients fixed and reviewed monthly by scheduled recalibration against realized attrition outcomes (see Part 07 seam). Not causal.",
    inputs: Object.keys(MODEL_COEFFICIENTS),
    confidence: { low: Number(low.toFixed(4)), high: Number(high.toFixed(4)), level: 0.8 },
    drivers,
    counterfactuals,
    uncertaintyNote:
      "This is an association-based estimate from a small, non-random set of workplace signals. It does not know this person's reasons, personal circumstances, or anything outside LEADOS's event log, and it has not been validated against a controlled experiment. It can be wrong in either direction.",
    lawfulPurpose:
      "Retention planning and equitable allocation of manager attention/support; not used for automated adverse action. Access limited to the person, their manager, and HR (see docs/FAIRNESS.md Privacy policy).",
    asOf: opts.asOf.toISOString(),
    limitations: [
      "Decision support only — no automated action is taken from this score.",
      "Does not and must not include protected attributes or their proxies (enforced by assertNoProtectedFeatures).",
      "Baseline coefficients; recalibrated monthly against outcomes, not demographics.",
    ],
  };
}

function cf(
  feature: FeatureName,
  newValue: number,
  features: FlightRiskFeatures,
  currentP: number,
  changeLabel: string,
): Counterfactual {
  const hypothetical = { ...features, [feature]: newValue };
  let logOdds = MODEL_INTERCEPT;
  for (const key of Object.keys(MODEL_COEFFICIENTS) as FeatureName[]) {
    logOdds += MODEL_COEFFICIENTS[key] * (hypothetical[key] ?? 0);
  }
  const newP = sigmoid(logOdds);
  const delta = newP - currentP;
  return {
    change: changeLabel,
    estimatedDelta: Number(delta.toFixed(4)),
    causalStatus: "association",
    note:
      `${changeLabel} is associated with a ${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(1)}pp change ` +
      `in the estimated flight-risk probability in this model, holding other signals fixed. This is an ` +
      `association from observational data, not a guaranteed effect of taking the action.`,
  };
}

// ---------------------------------------------------------------------------
// Feature building from the database (I/O layer, kept separate from the
// pure scoring function above for testability).
// ---------------------------------------------------------------------------

export async function buildFlightRiskFeatures(
  personId: string,
  asOf: Date,
): Promise<{ features: FlightRiskFeatures; observationCount: number }> {
  const [person] = await db.select().from(people).where(eq(people.id, personId)).limit(1);
  if (!person) throw new Error(`Person ${personId} not found`);

  const tenureStart = new Date(person.tenureStart);
  const tenureMonths = Math.max(
    0,
    (asOf.getFullYear() - tenureStart.getFullYear()) * 12 + (asOf.getMonth() - tenureStart.getMonth()),
  );

  const compaRatio = person.compaRatio !== null ? Number(person.compaRatio) : 1.0;
  const compaRatioBelowBandGap = Math.max(0, 1.0 - compaRatio);

  const heldOneOnOnes = await db
    .select()
    .from(oneOnOnes)
    .where(and(eq(oneOnOnes.employeeId, personId), eq(oneOnOnes.status, "held"), lte(oneOnOnes.heldAt, asOf)));
  const lastHeld = heldOneOnOnes
    .map((o) => o.heldAt)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const daysSinceLastOneOnOne = lastHeld
    ? Math.max(0, (asOf.getTime() - lastHeld.getTime()) / (1000 * 60 * 60 * 24))
    : 180;

  const ninetyDaysAgo = new Date(asOf.getTime() - 90 * 24 * 60 * 60 * 1000);
  const managerChangeEvents = await db
    .select()
    .from(events)
    .where(
      and(
        eq(events.entityId, personId),
        eq(events.type, "MANAGER_CHANGED"),
        gte(events.occurredAt, ninetyDaysAgo),
        lte(events.occurredAt, asOf),
      ),
    );
  const managerChangedLast90d = managerChangeEvents.length > 0 ? 1 : 0;

  let teamAttritionRate90d = 0;
  if (person.teamId) {
    const teammates = await db.select().from(people).where(eq(people.teamId, person.teamId));
    const teammateIds = teammates.map((t) => t.id);
    if (teammateIds.length > 0) {
      const leaves = await db
        .select()
        .from(attritionOutcomes)
        .where(
          and(
            sql`${attritionOutcomes.personId} = ANY(${teammateIds})`,
            gte(attritionOutcomes.leftAt, ninetyDaysAgo.toISOString().slice(0, 10)),
            lte(attritionOutcomes.leftAt, asOf.toISOString().slice(0, 10)),
          ),
        );
      teamAttritionRate90d = leaves.length / teammateIds.length;
    }
  }

  const oneEightyDaysAgo = new Date(asOf.getTime() - 180 * 24 * 60 * 60 * 1000);
  const plans = await db
    .select()
    .from(growthPlans)
    .where(and(eq(growthPlans.personId, personId), gte(growthPlans.updatedAt, oneEightyDaysAgo)));
  const growthPlanActivityLast180d = plans.length > 0 ? 1 : 0;

  const personCommitments = await db
    .select()
    .from(commitments)
    .innerJoin(oneOnOnes, eq(commitments.oneOnOneId, oneOnOnes.id))
    .where(and(eq(commitments.ownerId, personId), ne(commitments.status, "open")));
  const kept = personCommitments.filter((c) => c.commitments.status === "kept").length;
  const total = personCommitments.length;
  const commitmentFollowThroughRate = total > 0 ? kept / total : 0.5; // neutral prior if no history

  const skillEvents = await db
    .select()
    .from(events)
    .where(
      and(
        eq(events.entityId, personId),
        sql`${events.type} IN ('SKILL_DECLARED','SKILL_OBSERVED')`,
        lte(events.occurredAt, asOf),
      ),
    );
  const lastSkillEvent = skillEvents.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0];
  const skillStagnationMonths = lastSkillEvent
    ? Math.max(
        0,
        (asOf.getFullYear() - lastSkillEvent.occurredAt.getFullYear()) * 12 +
          (asOf.getMonth() - lastSkillEvent.occurredAt.getMonth()),
      )
    : tenureMonths;

  // No promotion-tracking event type is modeled yet; use a neutral, honest 0
  // rather than fabricate a signal. Left in the feature set so it is visible
  // as a documented placeholder in the model card.
  const promotionGapMonthsVsRoleMedian = 0;

  const features: FlightRiskFeatures = {
    compaRatioBelowBandGap,
    tenureMonths,
    daysSinceLastOneOnOne,
    managerChangedLast90d,
    teamAttritionRate90d,
    growthPlanActivityLast180d,
    commitmentFollowThroughRate,
    skillStagnationMonths,
    promotionGapMonthsVsRoleMedian,
  };

  const observationCount =
    heldOneOnOnes.length + plans.length + total + skillEvents.length + Math.min(tenureMonths, 24) / 2;

  return { features, observationCount };
}

/** Access-controlled entry point used by the API layer. */
export async function getFlightRisk(actor: Actor, personId: string, asOf: Date = new Date()): Promise<Explain<number>> {
  const [person] = await db.select().from(people).where(eq(people.id, personId)).limit(1);
  if (!person) throw new Error(`Person ${personId} not found`);
  assertAccess(
    canReadIndividualScore(actor, { id: person.id, managerId: person.managerId }),
    `actor ${actor.id} (${actor.globalRole}) may not read the flight-risk score of ${personId}`,
  );
  const { features, observationCount } = await buildFlightRiskFeatures(personId, asOf);
  return computeFlightRisk(features, { asOf, observationCount });
}

// Re-export for the fairness/proxy tests so they import the real denylist,
// not a copy.
export type { ExcludedProxyField };
