// Ethical lens engine — runs the structured lens checklist over a Part 23
// decision record: stakeholders affected, harm/benefit (Explain<T>),
// reversibility, fairness scan (Part 09), and the red-flag registry, then
// produces mandatory-but-non-blocking required steps with explanations.
//
// HONESTY RULE: this engine is decision support. It never returns a verdict
// like "approved" or "unethical" — only structured analysis a human
// decision-maker must weigh. decisionSupportNote says this explicitly on
// every review.

import { db } from "@/db";
import { decisions, ethicalReviews, conflictProximityWarnings } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { Explain, explain } from "@/lib/explain";
import { runFairnessScan, FairnessScanResult } from "@/lib/fairness";
import { peopleWithinHops, getPerson } from "@/lib/stakeholderGraph";
import { runRedFlagDetectors, RedFlagDetection } from "@/lib/ethics/redFlags";
import { isT4Action } from "@/lib/powerActions";
import { recordAudit } from "@/lib/audit";

export interface HarmBenefitAssessment {
  harm: "low" | "medium" | "high";
  benefit: "low" | "medium" | "high";
  netAssessment: string;
}

export interface EthicalReviewResult {
  decisionId: number;
  stakeholdersAffected: Array<{ personId: number; name: string; relation: string; hops: number }>;
  harmBenefit: Explain<HarmBenefitAssessment>;
  reversibilityAssessment: Explain<string>;
  fairnessScan: Explain<FairnessScanResult>;
  redFlags: RedFlagDetection[];
  requiredSteps: Array<{ step: string; reason: string; mandatory: boolean }>;
  decisionSupportNote: string;
  status: "completed" | "pending_review";
}

const IMPACT_TO_HARM: Record<string, "low" | "medium" | "high"> = { low: "low", medium: "medium", high: "high" };

function assessHarmBenefit(decisionRow: typeof decisions.$inferSelect): Explain<HarmBenefitAssessment> {
  const harm = IMPACT_TO_HARM[decisionRow.impact] ?? "medium";
  // Simple, explainable heuristic: benefit trends inverse to harm unless the
  // decision is explicitly reversible (lower stakes either way).
  const benefit: "low" | "medium" | "high" =
    decisionRow.reversibility === "reversible" ? "medium" : harm === "high" ? "low" : "medium";

  const netAssessment =
    harm === "high" && decisionRow.reversibility === "irreversible"
      ? "High harm potential combined with irreversibility — net assessment leans cautionary, not a block."
      : "Harm and benefit are in a plausible range for a standard mandatory review.";

  return explain(
    { harm, benefit, netAssessment },
    `Derived from the decision's declared impact ("${decisionRow.impact}") and reversibility ` +
      `("${decisionRow.reversibility}"). This is a structured estimate for human review, not an automated verdict.`,
    ["impact", "reversibility"],
    decisionRow.structuredCriteria ? "medium" : "low",
  );
}

function assessReversibility(decisionRow: typeof decisions.$inferSelect): Explain<string> {
  return explain(
    decisionRow.reversibility,
    `Declared reversibility for this decision is "${decisionRow.reversibility}". Irreversible or ` +
      `partially-reversible decisions should weight toward more deliberation time, not faster execution.`,
    ["reversibility"],
    "high",
  );
}

export async function runEthicalReview(decisionId: number, createdByPersonId: number): Promise<EthicalReviewResult> {
  const [decisionRow] = await db.select().from(decisions).where(eq(decisions.id, decisionId));
  if (!decisionRow) throw new Error("Decision not found");

  // Stakeholders affected: Part 31 graph, 2-hop neighborhood of the primary
  // subject (or proposer if no subject set).
  const anchor = decisionRow.primarySubjectPersonId ?? decisionRow.proposedByPersonId;
  const nearby = await peopleWithinHops(anchor, 2);
  const stakeholdersAffected: EthicalReviewResult["stakeholdersAffected"] = [];
  for (const n of nearby) {
    const p = await getPerson(n.personId);
    if (p) stakeholdersAffected.push({ personId: p.id, name: p.name, relation: p.role, hops: n.hops });
  }

  const harmBenefit = assessHarmBenefit(decisionRow);
  const reversibilityAssessment = assessReversibility(decisionRow);
  const fairnessScan = runFairnessScan(decisionRow.structuredCriteria);

  const unresolvedWarnings = await db
    .select()
    .from(conflictProximityWarnings)
    .where(and(eq(conflictProximityWarnings.decisionId, decisionId), eq(conflictProximityWarnings.resolved, false)));

  const redFlags = runRedFlagDetectors(
    {
      involvesPeopleData: decisionRow.involvesPeopleData,
      subjectsHaveVisibility: decisionRow.subjectsHaveVisibility,
      visibilityScope: decisionRow.visibilityScope,
      reversibility: decisionRow.reversibility,
      impact: decisionRow.impact,
      dissentHidden: decisionRow.dissentHidden,
    },
    {
      stakeholderCount: stakeholdersAffected.length,
      isT4Action: decisionRow.isPowerAction && isT4Action(decisionRow.powerActionType ?? ""),
      dualControlSatisfied: false, // the review always asks the caller to confirm separately; never assumed true
      unresolvedProximityWarnings: unresolvedWarnings.length,
    },
  );

  const requiredSteps = redFlags.map((f) => ({
    step: `Address red flag: ${f.label}`,
    reason: f.explanation,
    mandatory: true,
  }));

  const status: EthicalReviewResult["status"] = redFlags.length > 0 ? "pending_review" : "completed";

  const decisionSupportNote =
    "This ethical review is decision support only. It does not approve, reject, or morally judge the " +
    "decision — it surfaces stakeholders, harms/benefits, reversibility, fairness signal, and red flags " +
    "so an accountable human can decide with full information. Mandatory review steps above must be " +
    "addressed and documented, not silently bypassed.";

  const result: EthicalReviewResult = {
    decisionId,
    stakeholdersAffected,
    harmBenefit,
    reversibilityAssessment,
    fairnessScan,
    redFlags,
    requiredSteps,
    decisionSupportNote,
    status,
  };

  await db
    .update(decisions)
    .set({ status: status === "pending_review" ? "pending_review" : decisionRow.status })
    .where(eq(decisions.id, decisionId));

  const [saved] = await db
    .insert(ethicalReviews)
    .values({
      decisionId,
      stakeholdersAffected: result.stakeholdersAffected,
      harmBenefit: result.harmBenefit,
      reversibilityAssessment: result.reversibilityAssessment,
      fairnessScan: result.fairnessScan,
      redFlags: result.redFlags,
      requiredSteps: result.requiredSteps,
      decisionSupportNote: result.decisionSupportNote,
      status: result.status,
      createdByPersonId,
    })
    .returning();

  await recordAudit({
    actorId: createdByPersonId,
    action: "ethics.review_completed",
    resourceType: "decision",
    resourceId: decisionId,
    metadata: { reviewId: saved.id, redFlagCodes: redFlags.map((f) => f.code), status },
  });

  return result;
}
