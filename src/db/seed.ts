// src/db/seed.ts
//
// Idempotent-ish demo seed for the GRC module: a handful of risks (financial
// + categorical), a control library, obligations, a policy, appetite
// metrics, and an early-warning indicator. Run with:
//   npx tsx src/db/seed.ts
//
// Safe to re-run: it checks for existing codes before inserting.

import { db } from "./index";
import { risks, controls, riskControls, controlTests, obligations, appetiteMetrics, earlyWarningIndicators, policies, policyVersions } from "./schema";
import { eq } from "drizzle-orm";
import { uninformativePrior } from "../lib/beta";
import { materializeUpcomingInstances } from "../lib/obligations";
import { scheduleControlTest } from "../lib/controls";

async function ensureRisk(code: string, data: Omit<typeof risks.$inferInsert, "code">) {
  const [existing] = await db.select().from(risks).where(eq(risks.code, code));
  if (existing) return existing;
  const [row] = await db.insert(risks).values({ code, ...data }).returning();
  return row;
}

async function ensureControl(code: string, data: Omit<typeof controls.$inferInsert, "code">) {
  const [existing] = await db.select().from(controls).where(eq(controls.code, code));
  if (existing) return existing;
  const [row] = await db.insert(controls).values({ code, ...data }).returning();
  return row;
}

async function main() {
  console.log("Seeding GRC demo data...");

  const ctrlAccessReview = await ensureControl("CTRL-001", {
    name: "Quarterly privileged access review",
    description: "IT security reviews all privileged account access quarterly and revokes unneeded access.",
    type: "preventive",
    mechanism: "automated",
    testProcedure: "Confirm an access-review evidence event exists in the audit chain within the trailing 90 days.",
    testProcedureKey: "access_review_quarterly",
    cadenceDays: 90,
    owner: "Head of IT Security",
  });

  const ctrlBackup = await ensureControl("CTRL-002", {
    name: "Backup restore test",
    description: "Monthly test restore of production backups to confirm recoverability.",
    type: "detective",
    mechanism: "automated",
    testProcedure: "Confirm a successful restore-test evidence event exists in the trailing 30 days.",
    testProcedureKey: "backup_restore_test",
    cadenceDays: 30,
    owner: "Head of Infrastructure",
  });

  const ctrlVendorDueDiligence = await ensureControl("CTRL-003", {
    name: "Vendor due-diligence review",
    description: "Manual annual review of critical third-party vendors' security and financial posture.",
    type: "preventive",
    mechanism: "manual",
    testProcedure: "Procurement lead reviews vendor file and attests completion.",
    testProcedureKey: "manual_attestation",
    cadenceDays: 365,
    owner: "Head of Procurement",
  });

  const riskDataBreach = await ensureRisk("RISK-001", {
    title: "Customer data breach via compromised privileged account",
    cause: "Weak offboarding process leaves a former employee's privileged credentials active.",
    event: "Credentials used by an external actor to exfiltrate customer PII.",
    consequence: "Regulatory fines, breach notification costs, customer churn, reputational damage.",
    category: "security",
    owner: "CISO",
    likelihood: { alpha: 2, beta: 18, priorRationale: "Base-rated from 1 near-miss in 10 years across comparable firms; thin internal evidence." },
    impact: { kind: "lognormal", mu: 13.5, sigma: 1.1, currency: "GBP" },
    velocityDays: "14",
    detectability: { alpha: 6, beta: 4, priorRationale: "SIEM detection coverage assessed at ~60% for this scenario class." },
    linkedDecisions: [],
    linkedIndicators: ["EWI-001"],
  } as never);

  const riskOutage = await ensureRisk("RISK-002", {
    title: "Extended platform outage due to backup/restore failure",
    cause: "Backup corruption undetected for an extended period.",
    event: "Primary database failure forces restore from backup, restore fails or is materially delayed.",
    consequence: "SLA penalties, customer attrition, incident response cost.",
    category: "operational",
    owner: "Head of Infrastructure",
    likelihood: { alpha: 3, beta: 27, priorRationale: "3 historical near-misses over ~10 years of incident data; moderate evidence." },
    impact: { kind: "lognormal", mu: 12.8, sigma: 0.9, currency: "GBP" },
    velocityDays: "2",
    detectability: { alpha: 8, beta: 2, priorRationale: "Monitoring alerts fire quickly once restore is attempted." },
    linkedDecisions: [],
    linkedIndicators: [],
  } as never);

  const riskConductRisk = await ensureRisk("RISK-003", {
    title: "Conduct-risk failure in customer complaints handling",
    cause: "Complaint-handling staff under-resourced during volume spikes.",
    event: "Complaints breach regulatory SLA for acknowledgement/resolution.",
    consequence: "Regulatory censure, remediation cost; non-financial reputational harm (categorical).",
    category: "compliance",
    owner: "Head of Customer Operations",
    likelihood: { alpha: 4, beta: 16, priorRationale: "4 SLA breaches in the last 2 years of complaint-handling data." },
    impact: { kind: "categorical", labels: ["minor", "moderate", "severe", "critical"], probabilities: [0.5, 0.3, 0.15, 0.05] },
    velocityDays: "30",
    detectability: { alpha: 5, beta: 5, priorRationale: "No fully automated SLA-breach alerting yet; evidence is thin." },
    linkedDecisions: [],
    linkedIndicators: [],
  } as never);

  const dueSoon = new Date(Date.now() + 10 * 24 * 3600 * 1000);
  const overdue = new Date(Date.now() - 5 * 24 * 3600 * 1000);

  async function ensureRiskControl(riskId: number, controlId: number, effectiveness: { alpha: number; beta: number }, nextTestDueAt: Date) {
    const existing = await db.select().from(riskControls).where(eq(riskControls.riskId, riskId));
    const already = existing.find((e) => e.controlId === controlId);
    if (already) return already;
    const [row] = await db
      .insert(riskControls)
      .values({ riskId, controlId, effectiveness, nextTestDueAt: nextTestDueAt.toISOString() })
      .returning();
    return row;
  }

  const rc1 = await ensureRiskControl(riskDataBreach.id, ctrlAccessReview.id, { alpha: 5, beta: 2 }, overdue);
  const rc2 = await ensureRiskControl(riskOutage.id, ctrlBackup.id, { alpha: 9, beta: 1 }, dueSoon);
  await ensureRiskControl(riskDataBreach.id, ctrlVendorDueDiligence.id, uninformativePrior("No vendor review tested yet"), dueSoon);

  // Schedule one historical-overdue test and one upcoming test for the demo transcript.
  const existingTests = await db.select().from(controlTests);
  if (existingTests.length === 0) {
    await scheduleControlTest(rc1.id, overdue);
    await scheduleControlTest(rc2.id, dueSoon);
  }

  await db
    .insert(obligations)
    .values({
      code: "OBL-001",
      title: "Quarterly regulatory data-protection return",
      source: "regulatory",
      description: "Submit the quarterly data-protection compliance return to the regulator.",
      cadence: { kind: "quarterly", dayOfMonth: 28 },
      timezone: "Europe/London",
      anchorDate: new Date().toISOString(),
      linkedControlIds: [ctrlAccessReview.id],
      linkedRiskIds: [riskDataBreach.id],
      owner: "Head of Compliance",
    })
    .onConflictDoNothing();

  await db
    .insert(obligations)
    .values({
      code: "OBL-002",
      title: "Annual vendor contract SLA attestation",
      source: "contractual",
      description: "Annual attestation that critical vendor SLAs have been reviewed and remain fit for purpose.",
      cadence: { kind: "annually", month: 3, dayOfMonth: 31 },
      timezone: "America/New_York",
      anchorDate: new Date().toISOString(),
      linkedControlIds: [ctrlVendorDueDiligence.id],
      linkedRiskIds: [],
      owner: "Head of Procurement",
    })
    .onConflictDoNothing();

  const obligationRows = await db.select().from(obligations);
  for (const ob of obligationRows) {
    await materializeUpcomingInstances(ob.id, 4);
  }

  await db
    .insert(appetiteMetrics)
    .values([
      {
        code: "APP-VAR95",
        name: "Aggregate residual loss VaR95 (annual)",
        unit: "currency",
        thresholdAmber: "750000",
        thresholdRed: "1500000",
        direction: "above",
        linkedRiskIds: [riskDataBreach.id, riskOutage.id],
        source: "part08-finance / part29-montecarlo",
      },
      {
        code: "APP-OVERDUE-CTRL",
        name: "Overdue control tests (count)",
        unit: "count",
        thresholdAmber: "2",
        thresholdRed: "5",
        direction: "above",
        linkedRiskIds: [],
        source: "part10-control-testing",
      },
      {
        code: "APP-SLA-BREACH",
        name: "Complaint SLA breach rate",
        unit: "percent",
        thresholdAmber: "5",
        thresholdRed: "10",
        direction: "above",
        linkedRiskIds: [riskConductRisk.id],
        source: "part08-finance",
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(earlyWarningIndicators)
    .values([
      { code: "EWI-001", name: "Failed login spike (privileged accounts)", currentLevel: "elevated", description: "7-day moving average of failed privileged-account logins vs. baseline." },
      { code: "EWI-002", name: "Backup job failure rate", currentLevel: "normal", description: "Rolling 30-day backup job failure percentage." },
    ])
    .onConflictDoNothing();

  const [existingPolicy] = await db.select().from(policies).where(eq(policies.code, "POL-001"));
  if (!existingPolicy) {
    const [policy] = await db
      .insert(policies)
      .values({ code: "POL-001", title: "Information Security Access Control Policy", owner: "CISO", reviewCadenceDays: 365, status: "published" })
      .returning();
    const [version] = await db
      .insert(policyVersions)
      .values({
        policyId: policy.id,
        versionNumber: 1,
        content: "1. All privileged access must be reviewed quarterly.\n2. Access is revoked within 24 hours of role change.\n3. MFA is mandatory for all privileged accounts.",
        status: "published",
        approvedBy: "CISO",
        approvedAt: new Date().toISOString(),
        publishedAt: new Date().toISOString(),
      })
      .returning();
    await db.update(policies).set({ currentVersionId: version.id, nextReviewDueAt: new Date(Date.now() + 365 * 86400000).toISOString() }).where(eq(policies.id, policy.id));
  }

  console.log("Seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
