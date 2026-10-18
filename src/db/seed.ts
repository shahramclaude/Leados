// Seed script: populates leados_people + leados_events with a realistic
// scenario that exercises all 60 engine rules, all 4 correlation
// clusters, and all 3 forward-chain inferences.
//
// Run with: npx tsx src/db/seed.ts

import "dotenv/config";
import { db, pool } from "./index";
import { leados_people, leados_events, leados_hypotheses, leados_work_queue, leados_audit } from "./schema";

const DAY = 86400000;
const ago = (days: number) => new Date(Date.now() - days * DAY);
const ahead = (days: number) => new Date(Date.now() + days * DAY);

async function main() {
  console.log("Clearing existing Leados data...");
  await db.delete(leados_events);
  await db.delete(leados_work_queue);
  await db.delete(leados_hypotheses);
  await db.delete(leados_audit);
  await db.delete(leados_people);

  console.log("Seeding people...");
  const [alice] = await db
    .insert(leados_people)
    .values({ name: "Alice Chen", role: "CEO", cadence_days: 14, joined_at: ago(1100) })
    .returning();
  const [bob] = await db
    .insert(leados_people)
    .values({ name: "Bob Martinez", role: "CTO", reports_to: alice.id, cadence_days: 14, joined_at: ago(900) })
    .returning();
  const [carla] = await db
    .insert(leados_people)
    .values({ name: "Carla Singh", role: "VP Sales", reports_to: alice.id, cadence_days: 14, joined_at: ago(850) })
    .returning();
  const [dev] = await db
    .insert(leados_people)
    .values({ name: "Dev Patel", role: "Engineering Manager", reports_to: bob.id, cadence_days: 14, joined_at: ago(600) })
    .returning();
  const [elena] = await db
    .insert(leados_people)
    .values({ name: "Elena Petrova", role: "Senior Engineer", reports_to: dev.id, cadence_days: 14, joined_at: ago(400) })
    .returning();
  const [frank] = await db
    .insert(leados_people)
    .values({ name: "Frank Osei", role: "Engineer", reports_to: dev.id, cadence_days: 14, joined_at: ago(250) })
    .returning();
  const [grace] = await db
    .insert(leados_people)
    .values({ name: "Grace Kim", role: "Sales Rep", reports_to: carla.id, cadence_days: 14, joined_at: ago(300) })
    .returning();
  const [henry] = await db
    .insert(leados_people)
    .values({ name: "Henry Wu", role: "Support Lead", reports_to: carla.id, cadence_days: 21, joined_at: ago(800), archived: true })
    .returning();

  console.log("Seeding events...");
  const events: Array<{
    type: string;
    domain: string;
    person_id?: string | null;
    ts: Date;
    data: Record<string, unknown>;
  }> = [];

  const push = (type: string, domain: string, ts: Date, data: Record<string, unknown>, personId: string | null = null) =>
    events.push({ type, domain, ts, data, person_id: personId });

  // ── PEOPLE ──
  // Frank: declining mood + rising load -> burnout (R7), low mood (R3b), declining trend (R14)
  push("pulse", "people", ago(28), { personId: frank.id, mood: 6, load: 5 }, frank.id);
  push("pulse", "people", ago(21), { personId: frank.id, mood: 5, load: 7 }, frank.id);
  push("pulse", "people", ago(14), { personId: frank.id, mood: 3, load: 8 }, frank.id);
  push("pulse", "people", ago(7), { personId: frank.id, mood: 1, load: 9 }, frank.id);
  // Grace: pulses to round out org mean (R13)
  push("pulse", "people", ago(10), { personId: grace.id, mood: 5, load: 5 }, grace.id);
  push("pulse", "people", ago(3), { personId: grace.id, mood: 6, load: 5 }, grace.id);

  // Frank: 3 skipped 1:1s in 60d (R1)
  push("oneonone", "people", ago(50), { personId: frank.id, status: "skipped" }, frank.id);
  push("oneonone", "people", ago(35), { personId: frank.id, status: "skipped" }, frank.id);
  push("oneonone", "people", ago(20), { personId: frank.id, status: "skipped" }, frank.id);
  // Frank: no growth plan, tenure > 6mo (R8b) — intentionally no growth_plan event for Frank

  // Elena: 5 held 1:1s, no recognition (R2)
  for (const d of [80, 60, 40, 20, 5]) {
    push("oneonone", "people", ago(d), { personId: elena.id, status: "held" }, elena.id);
  }
  // Elena: growth plan created long ago, checkin stale (R9b)
  push("growth_plan", "people", ago(200), { event: "created", planId: "plan-elena", personId: elena.id, currentLevel: "D2", targetLevel: "D3" }, elena.id);
  push("growth_plan", "people", ago(50), { event: "checkin", planId: "plan-elena" }, elena.id);

  // Conflicts
  push("conflict", "people", ago(20), { personA: grace.id, personB: henry.id, status: "opened" });
  push("conflict", "people", ago(5), { personA: dev.id, personB: frank.id, status: "opened" });
  push("conflict", "people", ago(3), { personA: carla.id, personB: grace.id, status: "opened" });

  // Attrition (R12b)
  push("attrition", "people", ago(30), { personId: henry.id, name: henry.name, voluntary: true }, henry.id);

  // Goal with no owner (R10)
  push("goal", "people", ago(20), { goalId: "goal-1", title: "Expand EU sales motion", domain: "sales", ownerId: null, status: "open" });

  // Feedback imbalance — Alice gives Bob only positive feedback
  for (let i = 0; i < 6; i++) {
    push("feedback", "people", ago(10 + i * 5), { personId: bob.id, sentiment: "positive", byPersonId: alice.id }, bob.id);
  }

  // ── FINANCE ──
  push("metric", "finance", ago(1), { key: "runway_months", value: 4.5 });
  push("metric", "finance", ago(1), { key: "burn_rate_delta_pct", value: 25 });
  push("metric", "finance", ago(1), { key: "mrr_growth_pct", value: -3 });
  push("metric", "finance", ago(1), { key: "ltv_cac", value: 0.8 });
  push("metric", "finance", ago(1), { key: "gross_margin_pct", value: 55 });
  push("metric", "finance", ago(1), { key: "churn_pct", value: 6 });
  push("metric", "finance", ago(1), { key: "payback_period_months", value: 20 });
  push("metric", "finance", ago(1), { key: "quick_ratio", value: 0.8 });

  // ── SALES ──
  push("metric", "sales", ago(1), { key: "pipeline_coverage_x", value: 1.8 });
  push("metric", "sales", ago(150), { key: "win_rate", value: 55 });
  push("metric", "sales", ago(120), { key: "win_rate", value: 50 });
  push("metric", "sales", ago(60), { key: "win_rate", value: 32 });
  push("metric", "sales", ago(20), { key: "win_rate", value: 28 });
  push("metric", "sales", ago(1), { key: "nps", value: -5 });

  // Recurring loss reason unaddressed (R28)
  for (const d of [80, 60, 40, 10]) {
    push("deal", "sales", ago(d), { dealId: `lost-${d}`, outcome: "lost", lossReason: "price", cycleDays: 35 });
  }
  // Historical deals (fast cycle) vs recent deals (slow cycle) -> R30
  for (const d of [280, 240, 200, 160, 120]) {
    push("deal", "sales", ago(d), { dealId: `hist-${d}`, outcome: "won", cycleDays: 30 });
  }
  for (const d of [45, 35, 25, 15, 5]) {
    push("deal", "sales", ago(d), { dealId: `recent-${d}`, outcome: "won", cycleDays: 62 });
  }

  // Churn with no CS response (R31)
  push("churn", "sales", ago(15), { customerId: "cust-1" });

  // ── OPS ──
  push("metric", "ops", ago(1), { key: "deploy_freq_delta_pct", value: -40 });
  push("metric", "ops", ago(1), { key: "tech_debt_metric", value: 80 });
  push("sprint", "ops", ago(42), { sprintId: "s1", velocity: 45, goalHit: true });
  push("sprint", "ops", ago(28), { sprintId: "s2", velocity: 40, goalHit: false });
  push("sprint", "ops", ago(14), { sprintId: "s3", velocity: 32, goalHit: false });
  push("sprint", "ops", ago(0), { sprintId: "s4", velocity: 25, goalHit: false });
  push("blocker", "ops", ago(10), { blockerId: "blk-1", status: "open", escalated: false });
  push("incident", "ops", ago(15), { incidentId: "inc-1" });
  push("sla", "ops", ago(5), { commitmentId: "sla-1", breached: true });
  push("headcount", "ops", ago(65), { count: 20 });
  push("headcount", "ops", ago(0), { count: 16 });

  // ── STRATEGY ──
  push("okr", "strategy", ago(50), { okrId: "okr-1", title: "Expand EU market", ownerId: carla.id, resource: "eng-team" });
  push("okr", "strategy", ago(40), { okrId: "okr-2", title: "Reduce churn", ownerId: null, resource: "eng-team" });
  push("decision", "strategy", ago(70), { decisionId: "sdec-1", title: "Pivot pricing model", status: "open" });
  push("initiative", "strategy", ago(75), { initiativeId: "init-1", title: "API v2 launch", outcomeSignal: "negative" });
  // no market_intel event -> R47

  // ── GOVERNANCE ──
  push("decision", "governance", ago(50), { decisionId: "gdec-1", title: "Renew office lease", status: "open" });
  push("board_meeting", "governance", ago(100), { date: ago(100).toISOString(), narrativePrepared: true });
  push("board_meeting", "governance", ahead(10), { date: ahead(10).toISOString(), narrativePrepared: false });
  push("contract", "governance", ago(1), { contractId: "ctr-1", expiresAt: ahead(20).toISOString(), decisionLogged: false });
  // no compliance_check -> R51; no risk_register -> R54

  // ── CULTURE + RESILIENCE ──
  push("signal", "culture", ago(80), { polarity: "negative" });
  push("signal", "culture", ago(60), { polarity: "negative" });
  push("signal", "culture", ago(40), { polarity: "negative" });
  push("signal", "culture", ago(20), { polarity: "negative" });
  push("signal", "culture", ago(10), { polarity: "negative" });
  push("signal", "culture", ago(5), { polarity: "positive" });
  push("domain_knowledge", "resilience", ago(100), { domain: "payment-infra", personId: bob.id, hasBackup: false });
  push("crisis_detected", "resilience", ago(10), { crisisId: "cr-1" });

  for (const e of events) {
    await db.insert(leados_events).values(e);
  }

  console.log(`Seeded ${events.length} events across 8 people.`);
  console.log("Done.");
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    return pool.end().then(() => process.exit(1));
  });
