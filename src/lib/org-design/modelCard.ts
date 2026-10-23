// Model card for the org-design twin extension (Part 06 lineage).
//
// Honesty rule: every simulation output embeds a copy of this card (plus the
// live calibration version) so nobody can read a number without also seeing
// what the twin cannot see.

import { db } from "@/db";
import { twinModelParameters } from "@/db/schema";
import { desc } from "drizzle-orm";
import type { ModelCard } from "./types";

export const TWIN_NAME = "LEADOS Org Dynamics Twin — Structural Move Extension";

export const BASE_MODEL_CARD: Omit<ModelCard, "version" | "lastCalibratedAt" | "validationStatus"> = {
  twinName: TWIN_NAME,
  lineage: [
    "Part 06 — org dynamics twin (base behavioural model)",
    "Part 09 — people scoping (flight-risk aggregate signals, anonymised)",
    "Part 31 — ecosystem graph (cohesion / choke-point / bus-factor math)",
    "Part 37 — multi-entity model (deal counterparties, legal entities)",
    "Part 53 — obligation cascade (change-of-control triggers)",
  ],
  whatItModels: [
    "Short-run capacity and cycle-time shifts from structural moves (merge, split, reporting-line change, centralize, decentralize).",
    "Collaboration-graph cohesion, choke points and a bus-factor heuristic from declared org edges.",
    "Per-person human impact classification (role-change type, disruption class) — never aggregated into a single score.",
  ],
  knownLimits: [
    "Collaboration graph (Part 31) is only as complete as the edges that have been declared — undeclared informal networks are invisible to the twin.",
    "Delivery-impact coefficients are calibrated on a small, partly synthetic seed set of historical moves; confidence intervals are therefore wide and should widen further for structures unlike the seed set.",
    "The twin has no access to tacit knowledge, morale, or trust — it infers disruption class from role/reporting/location deltas only, which is a proxy, not a measurement of wellbeing.",
    "Flight-risk and culture-distance inputs are placeholder aggregate signals (Part 09 / Part 26 lineage) and must be replaced with validated organisational data before being used for binding decisions.",
    "The twin cannot see second-order effects beyond one reporting hop with confidence; multi-hop cascades are flagged but not fully modelled.",
  ],
  declaredErrorMargins: {
    capacityChangePct: "±35% of predicted magnitude (wide — small seed set)",
    cycleTimeChangeDays: "±40% of predicted magnitude",
    cohesion: "±0.15 absolute index points",
    busFactor: "±1 person",
    integrationDifficulty: "±20 composite points",
  },
};

export async function currentModelCard(): Promise<ModelCard> {
  const [latest] = await db
    .select()
    .from(twinModelParameters)
    .orderBy(desc(twinModelParameters.version))
    .limit(1);

  if (!latest) {
    return {
      ...BASE_MODEL_CARD,
      version: 0,
      lastCalibratedAt: new Date(0).toISOString(),
      validationStatus: "unvalidated",
    };
  }

  const ageDays = (Date.now() - new Date(latest.calibratedAt).getTime()) / 86_400_000;

  return {
    ...BASE_MODEL_CARD,
    version: latest.version,
    lastCalibratedAt: new Date(latest.calibratedAt).toISOString(),
    validationStatus: ageDays > 180 ? "stale" : "calibrated",
  };
}
