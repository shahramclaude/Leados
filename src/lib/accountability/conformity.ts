// LEADOS — Part 56: conformity evidence export.
//
// Honesty rule enforced in code, not just prose: every bundle embeds an
// explicit `scope` object naming the frame it was requested against and a
// `notCertified` list of things this export does NOT prove. There is no
// code path that produces a bundle claiming unscoped "compliance".
import { z } from "zod";
import { db } from "@/db";
import { algoSystems, impactAssessments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAllLatestChecks } from "./monitoring";
import { getAllFairnessReports } from "./fairness";
import { getModelCardsForSystem } from "./modelCards";
import { getChain, verifyChain } from "./auditChain";
import { checkTierConsistency } from "./riskTiers";
import type { ActionTier, DecisionRole, RegulatoryTier } from "./types";

export const SUPPORTED_FRAMES = [
  "internal-governance-baseline",
  "eu-ai-act-style-internal-mapping",
] as const;
export type ConformityFrame = (typeof SUPPORTED_FRAMES)[number];

const FRAME_STATEMENTS: Record<ConformityFrame, { statement: string; notCertified: string[] }> = {
  "internal-governance-baseline": {
    statement:
      "This bundle evidences LEADOS's own internal algorithmic-accountability baseline (registry completeness, impact assessments, monitoring, fairness reporting, audit trail, rights machinery) as implemented in Part 56. It is an internal governance artifact.",
    notCertified: [
      "No external regulator, auditor, or certification body has reviewed or attested to this bundle.",
      "Does not constitute conformity with any named law or standard.",
      "Does not assess systems outside the registry scanned at export time.",
    ],
  },
  "eu-ai-act-style-internal-mapping": {
    statement:
      "This bundle maps LEADOS's internal action tiers (T0-T4) to a 4-bucket minimal/limited/high/unacceptable vocabulary that is STYLISTICALLY similar to EU AI Act risk categories, for internal planning/readiness purposes only.",
    notCertified: [
      "This is NOT a legal conformity assessment under the EU AI Act or any other statute.",
      "No qualified notified body or legal counsel has reviewed this mapping.",
      "Tier definitions, thresholds and obligations used here are LEADOS-internal and may not match the legal text's actual requirements article-by-article.",
      "Does not cover documentation obligations (e.g. Annex IV technical documentation) beyond what is explicitly included below.",
    ],
  },
};

export interface ConformityBundle {
  generatedAt: string;
  scope: {
    frame: ConformityFrame;
    statement: string;
    notCertified: string[];
  };
  registry: Array<{
    systemKey: string;
    name: string;
    purpose: string;
    affectedParties: string;
    decisionRole: DecisionRole;
    actionTier: ActionTier;
    regulatoryTier: RegulatoryTier;
    tierConsistency: { ok: boolean; issues: string[] };
    owner: string;
    oversight: { owner: string; method: string; trainingNotes: string };
    optOut: { allowed: boolean; limits: string };
    modelCards: Array<{ name: string; version: string; limitations: string }>;
  }>;
  impactAssessments: Array<{
    systemKey: string;
    latestVersion: number;
    latestStatus: string;
    history: Array<{ version: number; status: string; triggeredBy: string }>;
  }>;
  monitoring: Array<{ checkId: string; systemKey: string; checkType: string; status: string; lastRunAt: string }>;
  fairness: Array<{
    systemKey: string;
    metric: string;
    disparityRatio: number;
    threshold: number;
    passed: boolean;
  }>;
  auditChain: Array<{ systemKey: string; entryCount: number; valid: boolean; brokenAtSeq: number | null }>;
  gaps: string[];
}

const conformityBundleSchema = z.object({
  generatedAt: z.string(),
  scope: z.object({
    frame: z.enum(SUPPORTED_FRAMES),
    statement: z.string().min(10),
    notCertified: z.array(z.string().min(5)).min(1),
  }),
  registry: z.array(
    z.object({
      systemKey: z.string(),
      name: z.string(),
      purpose: z.string(),
      affectedParties: z.string(),
      decisionRole: z.enum(["inform", "recommend", "automate"]),
      actionTier: z.enum(["T0", "T1", "T2", "T3", "T4"]),
      regulatoryTier: z.enum(["minimal", "limited", "high", "unacceptable"]),
      tierConsistency: z.object({ ok: z.boolean(), issues: z.array(z.string()) }),
      owner: z.string(),
      oversight: z.object({ owner: z.string(), method: z.string(), trainingNotes: z.string() }),
      optOut: z.object({ allowed: z.boolean(), limits: z.string() }),
      modelCards: z.array(z.object({ name: z.string(), version: z.string(), limitations: z.string() })),
    }),
  ),
  impactAssessments: z.array(
    z.object({
      systemKey: z.string(),
      latestVersion: z.number(),
      latestStatus: z.string(),
      history: z.array(z.object({ version: z.number(), status: z.string(), triggeredBy: z.string() })),
    }),
  ),
  monitoring: z.array(
    z.object({
      checkId: z.string(),
      systemKey: z.string(),
      checkType: z.string(),
      status: z.string(),
      lastRunAt: z.string(),
    }),
  ),
  fairness: z.array(
    z.object({
      systemKey: z.string(),
      metric: z.string(),
      disparityRatio: z.number(),
      threshold: z.number(),
      passed: z.boolean(),
    }),
  ),
  auditChain: z.array(
    z.object({
      systemKey: z.string(),
      entryCount: z.number(),
      valid: z.boolean(),
      brokenAtSeq: z.number().nullable(),
    }),
  ),
  gaps: z.array(z.string()),
});

export function validateConformityBundle(bundle: unknown) {
  return conformityBundleSchema.safeParse(bundle);
}

export async function buildConformityBundle(frame: ConformityFrame): Promise<ConformityBundle> {
  const frameInfo = FRAME_STATEMENTS[frame];
  const systems = await db.select().from(algoSystems);
  const allChecks = await getAllLatestChecks();
  const allFairness = await getAllFairnessReports();

  const registry = [] as ConformityBundle["registry"];
  const impactAssessmentsOut = [] as ConformityBundle["impactAssessments"];
  const auditChainOut = [] as ConformityBundle["auditChain"];
  const gaps: string[] = [];

  for (const system of systems) {
    const issues = checkTierConsistency({
      systemId: system.systemKey,
      actionTier: system.actionTier as ActionTier,
      regulatoryTier: system.regulatoryTier as RegulatoryTier,
      decisionRole: system.decisionRole as DecisionRole,
      requiresHumanReview: system.requiresHumanReview,
    });

    const cards = await getModelCardsForSystem(system.systemKey);

    registry.push({
      systemKey: system.systemKey,
      name: system.name,
      purpose: system.purpose,
      affectedParties: system.affectedParties,
      decisionRole: system.decisionRole as DecisionRole,
      actionTier: system.actionTier as ActionTier,
      regulatoryTier: system.regulatoryTier as RegulatoryTier,
      tierConsistency: { ok: issues.length === 0, issues: issues.map((i) => i.message) },
      owner: system.owner,
      oversight: {
        owner: system.oversightOwner,
        method: system.oversightMethod,
        trainingNotes: system.oversightTrainingNotes,
      },
      optOut: { allowed: system.optOutAllowed, limits: system.optOutLimits },
      modelCards: cards.map((c) => ({ name: c.name, version: c.version, limitations: c.limitations })),
    });

    if (issues.length > 0) {
      gaps.push(`Tier consistency issue(s) for ${system.systemKey}: ${issues.map((i) => i.code).join(", ")}`);
    }

    const history = await db
      .select()
      .from(impactAssessments)
      .where(eq(impactAssessments.systemKey, system.systemKey));
    const sortedHistory = [...history].sort((a, b) => b.version - a.version);
    const latest = sortedHistory[0];

    if (!latest) {
      gaps.push(`No impact assessment on file for ${system.systemKey}.`);
    } else if (latest.status !== "approved") {
      gaps.push(
        `Latest impact assessment for ${system.systemKey} is v${latest.version} with status "${latest.status}" (not yet approved).`,
      );
    }

    impactAssessmentsOut.push({
      systemKey: system.systemKey,
      latestVersion: latest?.version ?? 0,
      latestStatus: latest?.status ?? "missing",
      history: sortedHistory.map((h) => ({ version: h.version, status: h.status, triggeredBy: h.triggeredBy })),
    });

    const chain = await getChain(system.systemKey);
    const verification = await verifyChain(system.systemKey);
    auditChainOut.push({
      systemKey: system.systemKey,
      entryCount: chain.length,
      valid: verification.valid,
      brokenAtSeq: verification.brokenAtSeq,
    });
    if (!verification.valid) {
      gaps.push(`Audit chain integrity check FAILED for ${system.systemKey} at seq ${verification.brokenAtSeq}.`);
    }

    const systemChecks = allChecks.filter((c) => c.systemKey === system.systemKey);
    for (const check of systemChecks) {
      if (check.status !== "pass") {
        gaps.push(`Monitoring check ${check.checkId} for ${system.systemKey} is "${check.status}", not "pass".`);
      }
    }

    const systemFairness = allFairness.filter((f) => f.systemKey === system.systemKey);
    for (const report of systemFairness) {
      if (!report.passed) {
        gaps.push(
          `Fairness report for ${system.systemKey} (${report.metric}) is FAILING: disparity ratio ${report.disparityRatio} exceeds threshold ${report.threshold}.`,
        );
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    scope: { frame, statement: frameInfo.statement, notCertified: frameInfo.notCertified },
    registry,
    impactAssessments: impactAssessmentsOut,
    monitoring: allChecks.map((c) => ({
      checkId: c.checkId,
      systemKey: c.systemKey,
      checkType: c.checkType,
      status: c.status,
      lastRunAt: c.lastRunAt.toISOString(),
    })),
    fairness: allFairness.map((f) => ({
      systemKey: f.systemKey,
      metric: f.metric,
      disparityRatio: f.disparityRatio,
      threshold: f.threshold,
      passed: f.passed,
    })),
    auditChain: auditChainOut,
    gaps,
  };
}
