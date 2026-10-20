// LEADOS Part 01 — synthetic seed data.
//
// *** EVERYTHING THIS SCRIPT WRITES IS SYNTHETIC / LABELLED FAKE DATA. ***
// Names, ids, dollar amounts and dates below are invented for demonstration
// and testing only (see honesty rule in AI-SESSION-LOG.md Part 01). The
// dataset.label setting is set to "synthetic-seed" so any UI/API consuming
// it can display that fact; see src/lib/dataset.server.ts.
//
// Run with: `npx tsx src/db/seed.ts` (there is no `npm run db:seed` script —
// see AI-SESSION-LOG.md Part 01, "package.json constraint", for why).
//
// Every single row this script creates goes through `appendEvent()`
// (src/lib/eventStore.ts) — the same single write path the API/UI use. There
// is no raw SQL seed path (scripts/seed_financial.sql does not exist in this
// repo on purpose; see the manifest notes in the Part 01 delivery).

import "dotenv/config";
import { appendEvent } from "@/lib/eventStore";
import { setDatasetLabel } from "@/lib/dataset.server";
import { countEvents } from "@/lib/platform/eventRepository";
import { newUlid } from "@/lib/ulid";
import type { EventTypeId } from "@/lib/events/eventCatalog";

const ORG_ID = "org_demo_synthetic";
const SEED_ACTOR = { kind: "system" as const, id: "seed-script" };

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

async function emit(type: EventTypeId, entityId: string, payload: unknown, occurredAt: string, correlationId: string) {
  return appendEvent({
    type,
    orgId: ORG_ID,
    actor: SEED_ACTOR,
    entityId,
    occurredAt,
    correlationId,
    source: "migration",
    payload,
  });
}

async function main() {
  const existing = await countEvents(ORG_ID);
  if (existing > 0 && !process.env.FORCE_SEED) {
    console.log(
      `[seed] org "${ORG_ID}" already has ${existing} events. Re-run with FORCE_SEED=1 to append more ` +
        `synthetic data anyway, or run scripts/reset.ts first for a clean slate.`,
    );
    return;
  }

  console.log(`[seed] writing SYNTHETIC demo data for org "${ORG_ID}"...`);

  // ---- people -----------------------------------------------------------
  const people = [
    { id: "person_synthetic_001", name: "Ada Example", role: "Staff Engineer", team: "Platform", start: 400 },
    { id: "person_synthetic_002", name: "Grace Sample", role: "Product Manager", team: "Product", start: 300 },
    { id: "person_synthetic_003", name: "Lin Fictitious", role: "Sales Lead", team: "Sales", start: 250 },
    { id: "person_synthetic_004", name: "Omar Placeholder", role: "Ops Manager", team: "Operations", start: 200 },
    { id: "person_synthetic_005", name: "Priya Demo", role: "Support Engineer", team: "Platform", start: 150 },
  ];
  for (const p of people) {
    const corr = newUlid();
    await emit(
      "people.person_added",
      p.id,
      { personId: p.id, name: p.name, role: p.role, team: p.team, startDate: daysAgo(p.start) },
      daysAgo(p.start),
      corr,
    );
  }
  await emit(
    "people.role_changed",
    "person_synthetic_001",
    { personId: "person_synthetic_001", fromRole: "Senior Engineer", toRole: "Staff Engineer", effectiveDate: daysAgo(60) },
    daysAgo(60),
    newUlid(),
  );
  // Flight risk history for person_001: medium -> high (two events, so the
  // upcast v1->v2 score mapping and projector historyCount both have
  // something real to show).
  // Note: writes always target the CURRENT schema version (v2 here), which
  // is why `score`/`previousLevel` are present even though the v1 FIXTURE
  // used by the upcaster test (eventSchema.ts) omits them — v1 only still
  // exists for rows written before the v2 migration. See docs/DATA.md.
  await emit(
    "people.flight_risk_changed",
    "person_synthetic_001",
    {
      personId: "person_synthetic_001",
      riskLevel: "medium",
      reason: "Synthetic: flagged in routine 1:1 notes",
      score: 0.5,
      previousLevel: null,
    },
    daysAgo(45),
    newUlid(),
  );
  await emit(
    "people.flight_risk_changed",
    "person_synthetic_001",
    {
      personId: "person_synthetic_001",
      riskLevel: "high",
      reason: "Synthetic: declined synthetic retention offer",
      score: 0.82,
      previousLevel: "medium",
    },
    daysAgo(10),
    newUlid(),
  );
  await emit(
    "people.flight_risk_changed",
    "person_synthetic_003",
    {
      personId: "person_synthetic_003",
      riskLevel: "low",
      reason: "Synthetic: stable, positive engagement signals",
      score: 0.15,
      previousLevel: null,
    },
    daysAgo(20),
    newUlid(),
  );
  // Demonstrate erasure (tombstone) on person_005.
  await emit(
    "privacy.person_erased",
    "person_synthetic_005",
    { personId: "person_synthetic_005", requestedBy: "person_synthetic_admin", method: "tombstone-scrub" },
    daysAgo(1),
    newUlid(),
  );

  // ---- finance ------------------------------------------------------------
  await emit(
    "finance.burn_updated",
    ORG_ID,
    { monthlyBurnUsd: 110000, cashOnHandUsd: 2200000, runwayMonths: 20 },
    daysAgo(60),
    newUlid(),
  );
  await emit(
    "finance.burn_updated",
    ORG_ID,
    { monthlyBurnUsd: 128000, cashOnHandUsd: 1850000, runwayMonths: 14.5 },
    daysAgo(5),
    newUlid(),
  );
  await emit(
    "finance.invoice_raised",
    ORG_ID,
    { invoiceId: "inv_synthetic_001", customerId: "cust_synthetic_001", amountUsd: 42000, dueDate: daysAgo(-25) },
    daysAgo(30),
    newUlid(),
  );
  await emit(
    "finance.invoice_raised",
    ORG_ID,
    { invoiceId: "inv_synthetic_002", customerId: "cust_synthetic_002", amountUsd: 18000, dueDate: daysAgo(-10) },
    daysAgo(12),
    newUlid(),
  );
  await emit(
    "finance.expense_recorded",
    ORG_ID,
    { expenseId: "exp_synthetic_001", category: "cloud_infra", amountUsd: 9400, incurredAt: daysAgo(14) },
    daysAgo(14),
    newUlid(),
  );

  // ---- strategy -----------------------------------------------------------
  await emit(
    "strategy.initiative_created",
    "init_synthetic_001",
    { initiativeId: "init_synthetic_001", title: "Synthetic market expansion", owner: "person_synthetic_002", quarter: "2026-Q1" },
    daysAgo(90),
    newUlid(),
  );
  await emit(
    "strategy.initiative_status_changed",
    "init_synthetic_001",
    { initiativeId: "init_synthetic_001", status: "at_risk", note: "Synthetic: dependent hire slipped" },
    daysAgo(7),
    newUlid(),
  );
  await emit(
    "strategy.okr_progress_recorded",
    "init_synthetic_001",
    { okrId: "okr_synthetic_001", initiativeId: "init_synthetic_001", progressPct: 55 },
    daysAgo(7),
    newUlid(),
  );
  await emit(
    "strategy.initiative_created",
    "init_synthetic_002",
    { initiativeId: "init_synthetic_002", title: "Synthetic platform reliability push", owner: "person_synthetic_001", quarter: "2026-Q1" },
    daysAgo(80),
    newUlid(),
  );
  await emit(
    "strategy.initiative_status_changed",
    "init_synthetic_002",
    { initiativeId: "init_synthetic_002", status: "on_track" },
    daysAgo(3),
    newUlid(),
  );

  // ---- execution ------------------------------------------------------------
  const tasks = [
    { id: "task_synthetic_001", title: "Synthetic: migrate billing job", assignee: "person_synthetic_001", done: true },
    { id: "task_synthetic_002", title: "Synthetic: write onboarding doc", assignee: "person_synthetic_002", done: true },
    { id: "task_synthetic_003", title: "Synthetic: fix flaky CI test", assignee: "person_synthetic_001", done: false },
  ];
  for (const t of tasks) {
    const corr = newUlid();
    await emit("execution.task_created", t.id, { taskId: t.id, title: t.title, assigneeId: t.assignee, dueDate: daysAgo(-5) }, daysAgo(21), corr);
    if (t.done) {
      await emit("execution.task_completed", t.id, { taskId: t.id, completedAt: daysAgo(2) }, daysAgo(2), corr);
    }
  }
  await emit(
    "execution.sprint_velocity_recorded",
    "sprint_synthetic_12",
    { teamId: "team_synthetic_platform", sprintId: "sprint_synthetic_12", velocityPoints: 31 },
    daysAgo(4),
    newUlid(),
  );

  // ---- rd_product -----------------------------------------------------------
  await emit(
    "rd_product.feature_proposed",
    "feat_synthetic_001",
    { featureId: "feat_synthetic_001", title: "Synthetic bulk CSV import", proposedBy: "person_synthetic_002" },
    daysAgo(40),
    newUlid(),
  );
  await emit(
    "rd_product.experiment_result_logged",
    "exp_rd_synthetic_001",
    { experimentId: "exp_rd_synthetic_001", featureId: "feat_synthetic_001", outcome: "positive", metricDelta: 0.08 },
    daysAgo(15),
    newUlid(),
  );
  await emit(
    "rd_product.roadmap_item_scheduled",
    "road_synthetic_001",
    { itemId: "road_synthetic_001", quarter: "2026-Q2", confidence: 0.65 },
    daysAgo(10),
    newUlid(),
  );

  // ---- sales_customers ----------------------------------------------------------
  await emit(
    "sales.deal_created",
    "deal_synthetic_001",
    { dealId: "deal_synthetic_001", customerId: "cust_synthetic_001", stage: "discovery", amountUsd: 54000 },
    daysAgo(35),
    newUlid(),
  );
  await emit(
    "sales.deal_stage_changed",
    "deal_synthetic_001",
    { dealId: "deal_synthetic_001", fromStage: "discovery", toStage: "proposal" },
    daysAgo(18),
    newUlid(),
  );
  await emit(
    "sales.deal_created",
    "deal_synthetic_002",
    { dealId: "deal_synthetic_002", customerId: "cust_synthetic_002", stage: "proposal", amountUsd: 21000 },
    daysAgo(25),
    newUlid(),
  );
  await emit(
    "sales.customer_health_scored",
    "cust_synthetic_001",
    { customerId: "cust_synthetic_001", healthScore: 81, driver: "synthetic usage growth" },
    daysAgo(6),
    newUlid(),
  );
  await emit(
    "sales.customer_health_scored",
    "cust_synthetic_002",
    { customerId: "cust_synthetic_002", healthScore: 38, driver: "synthetic support ticket spike" },
    daysAgo(2),
    newUlid(),
  );

  // ---- knowledge ------------------------------------------------------------
  await emit(
    "knowledge.doc_published",
    "doc_synthetic_001",
    { docId: "doc_synthetic_001", title: "Synthetic incident runbook", authorId: "person_synthetic_001", space: "engineering" },
    daysAgo(50),
    newUlid(),
  );
  for (let i = 0; i < 3; i += 1) {
    await emit(
      "knowledge.doc_viewed",
      "doc_synthetic_001",
      { docId: "doc_synthetic_001", viewerId: `person_synthetic_00${i + 2}` },
      daysAgo(5 - i),
      newUlid(),
    );
  }
  await emit(
    "knowledge.doc_flagged_outdated",
    "doc_synthetic_001",
    { docId: "doc_synthetic_001", flaggedBy: "person_synthetic_003", reason: "Synthetic: references a retired synthetic tool" },
    daysAgo(1),
    newUlid(),
  );

  // ---- manufacturing_ops ------------------------------------------------------
  await emit(
    "manufacturing.batch_started",
    "batch_synthetic_001",
    { batchId: "batch_synthetic_001", line: "line_synthetic_a", sku: "sku_synthetic_001", plannedUnits: 500 },
    daysAgo(9),
    newUlid(),
  );
  await emit(
    "manufacturing.batch_completed",
    "batch_synthetic_001",
    { batchId: "batch_synthetic_001", actualUnits: 486, defectUnits: 7 },
    daysAgo(8),
    newUlid(),
  );
  await emit(
    "manufacturing.downtime_logged",
    "line_synthetic_a",
    { line: "line_synthetic_a", minutes: 40, cause: "Synthetic: sensor recalibration" },
    daysAgo(8),
    newUlid(),
  );
  await emit(
    "manufacturing.downtime_logged",
    "line_synthetic_a",
    { line: "line_synthetic_a", minutes: 15, cause: "Synthetic: scheduled changeover" },
    daysAgo(3),
    newUlid(),
  );

  await setDatasetLabel({
    label: "synthetic-seed",
    description:
      "All data in this environment was generated by src/db/seed.ts for demonstration/testing. No real person, customer, or financial figure is represented.",
  });

  const total = await countEvents(ORG_ID);
  console.log(`[seed] done. ${total} synthetic events now stored for org "${ORG_ID}".`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed] failed:", err);
    process.exit(1);
  });
