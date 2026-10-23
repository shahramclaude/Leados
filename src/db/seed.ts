// Deterministic seed data for local/dev verification of every screen.
// Run with: npx tsx src/db/seed.ts
import "dotenv/config";
import { db, pool } from "./index";
import {
  organizations,
  users,
  objectives,
  keyResults,
  initiatives,
  metrics,
  decisions,
  approvals,
  documents,
  claims,
} from "./schema";
import { appendAuditEvent } from "@/lib/audit";
import { DEFAULT_ORG_ID } from "@/lib/org";
import { eq } from "drizzle-orm";

async function main() {
  console.log("Seeding LEADOS demo data…");

  await db
    .insert(organizations)
    .values({ id: DEFAULT_ORG_ID, name: "Northwind Holdings" })
    .onConflictDoNothing();

  const [owner] = await db
    .insert(users)
    .values({ orgId: DEFAULT_ORG_ID, name: "Avery Kim", email: "avery@northwind.example", role: "admin" })
    .onConflictDoNothing()
    .returning();

  const ownerId = owner?.id ?? (await db.select().from(users).where(eq(users.orgId, DEFAULT_ORG_ID)))[0]?.id;

  // --- Metrics --------------------------------------------------------
  const existingMetrics = await db.select().from(metrics).where(eq(metrics.orgId, DEFAULT_ORG_ID));
  if (existingMetrics.length === 0) {
    await db.insert(metrics).values([
      { orgId: DEFAULT_ORG_ID, name: "ARR", category: "finance", unit: "$M", value: 18.4, previousValue: 16.9, target: 20 },
      { orgId: DEFAULT_ORG_ID, name: "Net revenue retention", category: "finance", unit: "%", value: 108, previousValue: 112, target: 115 },
      { orgId: DEFAULT_ORG_ID, name: "Customer churn", category: "customer", unit: "%", value: 3.1, previousValue: 2.4, target: 2.0 },
      { orgId: DEFAULT_ORG_ID, name: "Employee eNPS", category: "people", unit: "pts", value: 42, previousValue: 38, target: 50 },
    ]);
  }

  // --- Objectives + key results ----------------------------------------
  const existingObjectives = await db.select().from(objectives).where(eq(objectives.orgId, DEFAULT_ORG_ID));
  let objectiveIds: string[] = existingObjectives.map((o) => o.id);
  if (existingObjectives.length === 0) {
    const inserted = await db
      .insert(objectives)
      .values([
        {
          orgId: DEFAULT_ORG_ID,
          title: "Reach $20M ARR with durable retention",
          description: "Grow revenue while protecting net revenue retention above 110%.",
          ownerId,
          status: "at_risk",
        },
        {
          orgId: DEFAULT_ORG_ID,
          title: "Build a resilient, engaged organization",
          description: "Keep eNPS rising while scaling headcount responsibly.",
          ownerId,
          status: "on_track",
        },
      ])
      .returning();
    objectiveIds = inserted.map((o) => o.id);

    await db.insert(keyResults).values([
      { objectiveId: objectiveIds[0], title: "Annual recurring revenue", unit: "$M", baseline: 14, target: 20, current: 18.4, confidence: 0.7 },
      { objectiveId: objectiveIds[0], title: "Net revenue retention", unit: "%", baseline: 100, target: 115, current: 108, confidence: 0.55 },
      { objectiveId: objectiveIds[1], title: "Employee eNPS", unit: "pts", baseline: 30, target: 50, current: 42, confidence: 0.8 },
    ]);
  }

  // --- Initiatives -------------------------------------------------------
  const existingInitiatives = await db.select().from(initiatives).where(eq(initiatives.orgId, DEFAULT_ORG_ID));
  if (existingInitiatives.length === 0) {
    await db.insert(initiatives).values([
      {
        orgId: DEFAULT_ORG_ID,
        objectiveId: objectiveIds[0],
        title: "Launch usage-based pricing tier",
        summary: "New tier to capture expansion revenue from high-usage accounts.",
        status: "active",
        riskTier: "T2",
        ownerId,
        budgetUsd: 120000,
        progressPct: 55,
      },
      {
        orgId: DEFAULT_ORG_ID,
        objectiveId: objectiveIds[0],
        title: "Customer success retention playbook",
        summary: "Systematic save-plays for at-risk accounts flagged by the churn model.",
        status: "planned",
        riskTier: "T1",
        ownerId,
        budgetUsd: 45000,
        progressPct: 10,
      },
      {
        orgId: DEFAULT_ORG_ID,
        objectiveId: objectiveIds[1],
        title: "Manager enablement program",
        summary: "Quarterly training + 360 feedback loop for all people managers.",
        status: "active",
        riskTier: "T0",
        ownerId,
        budgetUsd: 30000,
        progressPct: 70,
      },
    ]);
  }

  // --- Decisions -----------------------------------------------------
  const existingDecisions = await db.select().from(decisions).where(eq(decisions.orgId, DEFAULT_ORG_ID));
  if (existingDecisions.length === 0) {
    await db.insert(decisions).values({
      orgId: DEFAULT_ORG_ID,
      question: "Should we launch the usage-based pricing tier this quarter or pilot it first?",
      status: "open",
      alternatives: [
        {
          id: "a1",
          label: "Launch now",
          costUsd: 50000,
          effects: [
            { state: "market-accepts", prob: 0.6, value: 400000 },
            { state: "market-rejects", prob: 0.4, value: 20000 },
          ],
        },
        {
          id: "a2",
          label: "Run a 4-week pilot first",
          costUsd: 80000,
          effects: [
            { state: "market-accepts", prob: 0.6, value: 380000 },
            { state: "market-rejects", prob: 0.4, value: 60000 },
          ],
        },
      ],
    });
  }

  // --- Approvals -----------------------------------------------------
  const existingApprovals = await db.select().from(approvals).where(eq(approvals.orgId, DEFAULT_ORG_ID));
  if (existingApprovals.length === 0) {
    await db.insert(approvals).values([
      { orgId: DEFAULT_ORG_ID, title: "Approve vendor renewal — Acme Analytics", riskTier: "T2", amountUsd: 24000, status: "pending" },
      { orgId: DEFAULT_ORG_ID, title: "Approve conference sponsorship", riskTier: "T1", amountUsd: 800, status: "pending" },
      { orgId: DEFAULT_ORG_ID, title: "Approve reduction of a product line", riskTier: "T4", amountUsd: 0, status: "pending" },
    ]);
  }

  // --- Knowledge (documents + claims) --------------------------------
  const existingDocs = await db.select().from(documents).where(eq(documents.orgId, DEFAULT_ORG_ID));
  if (existingDocs.length === 0) {
    const [churnDoc, financeDoc, pricingDoc] = await db
      .insert(documents)
      .values([
        {
          orgId: DEFAULT_ORG_ID,
          title: "Q3 Customer Churn Analysis",
          source: "internal-report",
          content:
            "Q3 customer churn rate reached 3.1%, up from 2.4% in Q2, driven primarily by mid-market accounts citing pricing complexity.",
        },
        {
          orgId: DEFAULT_ORG_ID,
          title: "FP&A Monthly Close — September",
          source: "finance",
          content:
            "Annual recurring revenue closed the month at $18.4M against a $20M target, with net revenue retention at 108%, down from 112% last quarter.",
        },
        {
          orgId: DEFAULT_ORG_ID,
          title: "Pricing Experiment Design Doc",
          source: "product",
          content:
            "The proposed usage-based tier models a 60% probability of market acceptance based on win-rate data from the Q2 pilot cohort.",
        },
      ])
      .returning();

    await db.insert(claims).values([
      { orgId: DEFAULT_ORG_ID, documentId: churnDoc.id, text: "Q3 customer churn rate reached 3.1%, up from 2.4% in Q2.", locator: "p.1 ¶1", confidence: 0.95 },
      { orgId: DEFAULT_ORG_ID, documentId: churnDoc.id, text: "Churn is driven primarily by mid-market accounts citing pricing complexity.", locator: "p.1 ¶2", confidence: 0.8 },
      { orgId: DEFAULT_ORG_ID, documentId: financeDoc.id, text: "ARR closed the month at $18.4M against a $20M target.", locator: "p.1 table 1", confidence: 0.97 },
      { orgId: DEFAULT_ORG_ID, documentId: financeDoc.id, text: "Net revenue retention is 108%, down from 112% last quarter.", locator: "p.1 table 2", confidence: 0.95 },
      { orgId: DEFAULT_ORG_ID, documentId: pricingDoc.id, text: "The usage-based tier models a 60% probability of market acceptance.", locator: "p.2 ¶3", confidence: 0.7 },
    ]);
  }

  await appendAuditEvent({
    orgId: DEFAULT_ORG_ID,
    actorId: ownerId ?? null,
    action: "seed.completed",
    entityType: "organization",
    entityId: DEFAULT_ORG_ID,
    metadata: { note: "Demo data seeded." },
  });

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
