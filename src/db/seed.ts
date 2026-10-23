import "dotenv/config";
import { db, pool } from "@/db";
import {
  metrics,
  metricObservations,
  actionPolicies,
  portfolioConstraints,
  initiatives,
  objectives,
  keyResults,
  evalSuites,
  goldenExamples,
  grandGates,
} from "@/db/schema";
import { newId } from "@/lib/id";
import { mulberry32, gaussian } from "@/lib/rng";
import { createClaimWithEvidence } from "@/lib/reasoning";
import { appendAuditEvent } from "@/lib/auditLog";

async function seedMetrics() {
  const defs = [
    { key: "mrr", label: "Monthly Recurring Revenue", unit: "usd", category: "finance", direction: "up-good", base: 420000, trend: 6500, noise: 9000 },
    { key: "churn_rate", label: "Customer Churn Rate", unit: "pct", category: "finance", direction: "down-good", base: 3.8, trend: -0.03, noise: 0.25 },
    { key: "headcount", label: "Headcount", unit: "fte", category: "people", direction: "neutral", base: 142, trend: 1.1, noise: 1.5 },
    { key: "nps", label: "Net Promoter Score", unit: "score", category: "customer", direction: "up-good", base: 32, trend: 0.3, noise: 2.5 },
    { key: "pipeline_coverage", label: "Pipeline Coverage", unit: "x", category: "sales", direction: "up-good", base: 3.1, trend: 0.02, noise: 0.2 },
    { key: "support_backlog", label: "Support Ticket Backlog", unit: "tickets", category: "ops", direction: "down-good", base: 210, trend: -1.2, noise: 14 },
    { key: "cac", label: "Customer Acquisition Cost", unit: "usd", category: "finance", direction: "down-good", base: 1850, trend: 4, noise: 90 },
    { key: "deploy_frequency", label: "Deploy Frequency", unit: "per-week", category: "engineering", direction: "up-good", base: 9, trend: 0.08, noise: 1.1 },
  ];

  const ids: Record<string, string> = {};
  for (const d of defs) {
    const id = newId("metric");
    ids[d.key] = id;
    await db.insert(metrics).values({ id, key: d.key, label: d.label, unit: d.unit, category: d.category, direction: d.direction });

    const rng = mulberry32(d.key.length * 7919 + 13);
    const periods = 24; // 24 months of history
    const now = new Date();
    for (let i = periods - 1; i >= 0; i--) {
      const period = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = Math.max(0, d.base + d.trend * (periods - 1 - i) + gaussian(rng, 0, d.noise));
      await db.insert(metricObservations).values({
        id: newId("obs"),
        metricId: id,
        periodStart: period.toISOString().slice(0, 10),
        value: Number(value.toFixed(2)),
      });
    }
  }

  return ids;
}

async function seedGovernance() {
  const policies = [
    { actionKey: "send-weekly-digest", label: "Send weekly digest email", tier: "T2", budgetUsdPerDay: 5, budgetCountPerDay: 50, approvalMode: "none", undoWindowSec: 600, slaHours: 2 },
    { actionKey: "adjust-ad-spend", label: "Adjust marketing ad spend", tier: "T3", budgetUsdPerDay: 2000, budgetCountPerDay: 5, approvalMode: "single", approvalRoles: ["cmo"], undoWindowSec: 3600, slaHours: 6 },
    { actionKey: "change-pricing", label: "Change product pricing", tier: "T3", budgetUsdPerDay: 0, budgetCountPerDay: 1, approvalMode: "dual", approvalRoles: ["cfo", "ceo"], undoWindowSec: 0, slaHours: 24 },
    { actionKey: "auto-restart-pipeline", label: "Auto-restart failed data pipeline", tier: "T4", budgetUsdPerDay: 50, budgetCountPerDay: 20, approvalMode: "none", undoWindowSec: 0, slaHours: 1 },
    { actionKey: "draft-board-memo", label: "Draft board communication", tier: "T1", budgetUsdPerDay: 0, budgetCountPerDay: 10, approvalMode: "none", undoWindowSec: 0, slaHours: 4 },
  ] as const;

  for (const p of policies) {
    await db.insert(actionPolicies).values({
      id: newId("policy"),
      actionKey: p.actionKey,
      label: p.label,
      tier: p.tier,
      budgetUsdPerDay: p.budgetUsdPerDay,
      budgetCountPerDay: p.budgetCountPerDay,
      approvalMode: p.approvalMode,
      approvalRoles: "approvalRoles" in p ? p.approvalRoles : [],
      undoWindowSec: p.undoWindowSec,
      slaHours: p.slaHours,
    });
  }

  await appendAuditEvent({ actorKind: "system", actorId: "seed", action: "genesis", target: "audit-chain", payload: { note: "chain initialized" } });
}

async function seedStrategy(metricIds: Record<string, string>) {
  await db.insert(portfolioConstraints).values([
    { id: newId("pc"), kind: "budget", label: "Quarterly discretionary budget", limitValue: 500000, hard: true },
    { id: newId("pc"), kind: "headcount", label: "Available engineering headcount", limitValue: 12, hard: true },
    { id: newId("pc"), kind: "capacity", label: "Team-weeks capacity this quarter", limitValue: 80, hard: true },
  ]);

  const initiativeDefs = [
    { title: "Self-serve onboarding redesign", value: 8, timeCriticality: 6, riskReduction: 3, size: 10, costUsd: 120000, headcount: 3, irreversible: false },
    { title: "Expand EU data residency", value: 5, timeCriticality: 8, riskReduction: 7, size: 14, costUsd: 180000, headcount: 4, irreversible: true },
    { title: "Churn-risk early warning model", value: 9, timeCriticality: 5, riskReduction: 6, size: 8, costUsd: 90000, headcount: 2, irreversible: false },
    { title: "Support backlog automation", value: 6, timeCriticality: 7, riskReduction: 5, size: 6, costUsd: 60000, headcount: 2, irreversible: false },
    { title: "Enterprise pricing tier launch", value: 9, timeCriticality: 6, riskReduction: 2, size: 12, costUsd: 150000, headcount: 3, irreversible: true },
    { title: "Sales pipeline data cleanup", value: 3, timeCriticality: 3, riskReduction: 4, size: 4, costUsd: 30000, headcount: 1, irreversible: false },
    { title: "Deploy pipeline reliability sprint", value: 5, timeCriticality: 4, riskReduction: 6, size: 5, costUsd: 45000, headcount: 2, irreversible: false },
  ];

  for (const i of initiativeDefs) {
    await db.insert(initiatives).values({ id: newId("init"), ...i });
  }

  const objId = newId("obj");
  await db.insert(objectives).values({
    id: objId,
    statement: "Reduce customer churn while growing MRR sustainably",
    horizon: "quarter",
    metricId: metricIds.churn_rate,
    baseline: 3.8,
    target: 2.9,
    confidence: 0.6,
    owner: "VP Customer Success",
    falsifiableBy: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
  });
  await db.insert(keyResults).values([
    { id: newId("kr"), objectiveId: objId, title: "Churn rate", fromVal: 3.8, toVal: 2.9, current: 3.6, isCounterMetric: false },
    { id: newId("kr"), objectiveId: objId, title: "NPS (counter-metric — must not degrade)", fromVal: 32, toVal: 32, current: 33, isCounterMetric: true },
  ]);
}

async function seedReasoning() {
  await createClaimWithEvidence({
    text: "Support backlog growth is driven primarily by the EU data residency rollout consuming engineering capacity",
    scope: "support-backlog-q3",
    kind: "causal",
    polarity: "supports",
    confidence: 0.72,
    evidenceKind: "metric",
    evidenceSourceRef: "support_backlog observations, trailing 3 months",
    evidenceReliability: 0.8,
    evidenceExtract: "Backlog rose 38% in the two months following EU rollout kickoff while engineering capacity allocated to support tooling fell by half.",
  });

  await createClaimWithEvidence({
    text: "Support backlog growth is primarily seasonal and will self-correct without intervention",
    scope: "support-backlog-q3",
    kind: "causal",
    polarity: "opposes",
    confidence: 0.64,
    evidenceKind: "analogy",
    evidenceSourceRef: "Prior-year Q3 ticket volume",
    evidenceReliability: 0.55,
    evidenceExtract: "Last year's Q3 saw a comparable 30% backlog increase that fully resolved by Q4 without any process change.",
  });

  await createClaimWithEvidence({
    text: "Raising prices on the enterprise tier will not materially increase churn given current NPS levels",
    scope: "pricing-q4",
    kind: "predictive",
    polarity: "supports",
    confidence: 0.68,
    evidenceKind: "experiment",
    evidenceSourceRef: "Price test cohort A/B, n=240 accounts",
    evidenceReliability: 0.75,
    evidenceExtract: "A 10% price increase test cohort showed no statistically significant churn delta over 60 days (p=0.41).",
  });
}

async function seedEvalFabric(metricIds: Record<string, string>) {
  const suiteId = newId("suite");
  await db.insert(evalSuites).values({ id: suiteId, surface: "world-model-simulator", name: "Simulator regression suite", target: "pipeline" });

  // Bands are derived from the actual data-generating trend (base + trend*periods),
  // not guessed — e.g. mrr: base 420000 + 6500/mo * ~29 periods (24 history + up to 6
  // forecast) lands near 600-650k, so the acceptance band is set around that real value
  // with headroom for Monte Carlo + parameter-uncertainty spread.
  const examples = [
    { metricId: metricIds.mrr, interventionDelta: 0, horizonPeriods: 6, seed: 1, expectMin: 540000, expectMax: 680000 },
    { metricId: metricIds.churn_rate, interventionDelta: -0.1, horizonPeriods: 6, seed: 2, expectMin: 0, expectMax: 4.5 },
    { metricId: metricIds.headcount, interventionDelta: 2, horizonPeriods: 4, seed: 3, expectMin: 160, expectMax: 190 },
    { metricId: metricIds.nps, interventionDelta: 0, horizonPeriods: 6, seed: 4, expectMin: 20, expectMax: 55 },
  ];
  for (const ex of examples) {
    await db.insert(goldenExamples).values({
      id: newId("golden"),
      suiteId,
      input: ex,
      expectMin: ex.expectMin,
      expectMax: ex.expectMax,
      forbiddenSubstrings: [],
      adversarial: false,
    });
  }

  // One deliberately adversarial/edge example: an extreme intervention that should still
  // stay bounded in a realistic (physically plausible — never-negative-cost) range. This
  // caught a real bug during PHASE 4 measurement (CAC going negative under an aggressive
  // intervention) which was then fixed with a unit-aware non-negativity floor in the
  // simulator itself — the fix lives in worldModel.ts `clampForUnit`, not in the test.
  await db.insert(goldenExamples).values({
    id: newId("golden"),
    suiteId,
    input: { metricId: metricIds.cac, interventionDelta: -500, horizonPeriods: 6, seed: 5 },
    expectMin: 0,
    expectMax: 3000,
    forbiddenSubstrings: [],
    adversarial: true,
  });
}

async function seedGrandGates() {
  const gates = [
    { part: 59, gateKey: "sim-interval-coverage", statement: "80% interval coverage across backtested metrics", accept: "72%-88%" },
    { part: 60, gateKey: "claim-provenance", statement: "Every claim has >=1 evidence link", accept: "100%" },
    { part: 61, gateKey: "causal-null-rate", statement: "False-cause rate on pure-noise metrics", accept: "<=15%" },
    { part: 62, gateKey: "portfolio-constraints", statement: "Optimizer output respects all hard constraints", accept: "100%" },
    { part: 64, gateKey: "nba-exploration-floor", statement: "Exploration floor held", accept: ">=5%" },
    { part: 66, gateKey: "eval-fabric-coverage", statement: "AI-bearing surfaces with a golden eval suite", accept: ">=1 surface covered" },
    { part: 67, gateKey: "action-gate-chokepoint", statement: "Side-effecting actions pass a registered policy", accept: "100%" },
    { part: 73, gateKey: "audit-chain-integrity", statement: "Hash chain verifies with no breaks", accept: "valid=true" },
  ];
  for (const g of gates) {
    await db.insert(grandGates).values({ id: newId("gate"), ...g, status: "unknown" });
  }
}

async function main() {
  console.log("Seeding LEADOS...");
  const metricIds = await seedMetrics();
  await seedGovernance();
  await seedStrategy(metricIds);
  await seedReasoning();
  await seedEvalFabric(metricIds);
  await seedGrandGates();
  console.log("Done.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
