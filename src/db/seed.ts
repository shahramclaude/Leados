import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  leados_people,
  leados_events,
  leados_growth_plans,
  leados_work_queue,
  leados_metrics,
} from "@/db/schema";

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

export async function seed() {
  const result: Record<string, unknown> = {};

  const [{ ecount }] = await db
    .select({ ecount: sql<number>`count(*)::int` })
    .from(leados_events);

  if (ecount === 0) {
    const [mia, diego, sarah, tom, priya, liam] = await db
      .insert(leados_people)
      .values([
        { name: "Mia Chen", role: "Product Manager", email: "mia@acme.io", createdAt: daysAgo(400) },
        { name: "Diego Alvarez", role: "Engineering Lead", email: "diego@acme.io", createdAt: daysAgo(300) },
        { name: "Sarah Kim", role: "Sales Lead", email: "sarah@acme.io", createdAt: daysAgo(500) },
        { name: "Tom Okafor", role: "Support Lead", email: "tom@acme.io", createdAt: daysAgo(200) },
        { name: "Priya Nair", role: "Software Engineer", email: "priya@acme.io", createdAt: daysAgo(5) },
        { name: "Liam Walsh", role: "Software Engineer", email: "liam@acme.io", createdAt: daysAgo(250) },
      ])
      .returning();

    const events: (typeof leados_events.$inferInsert)[] = [];

    // ---- Mia: healthy baseline ----
    events.push(
      { type: "oneonone", personId: mia.id, domain: "people", data: { notes: "Roadmap check-in" }, createdAt: daysAgo(10) },
      { type: "pulse", personId: mia.id, domain: "people", data: { mood: 4 }, createdAt: daysAgo(3) },
      { type: "feedback", personId: mia.id, domain: "people", data: { sentiment: "positive", text: "Great quarter" }, createdAt: daysAgo(10) },
    );

    // ---- Diego: burnout compound (low morale + high load) ----
    events.push(
      { type: "pulse", personId: diego.id, domain: "people", data: { mood: 1 }, createdAt: daysAgo(1) },
      { type: "pulse", personId: diego.id, domain: "people", data: { mood: 2 }, createdAt: daysAgo(6) },
      { type: "oneonone", personId: diego.id, domain: "people", data: { notes: "Workload check" }, createdAt: daysAgo(5) },
      { type: "feedback", personId: diego.id, domain: "people", data: { sentiment: "neutral", text: "Delivering but stretched" }, createdAt: daysAgo(20) },
    );
    for (let i = 0; i < 15; i++) {
      events.push({
        type: "task_assigned", personId: diego.id, domain: "people",
        data: { title: `Task ${i + 1}` }, createdAt: daysAgo(1 + i * 0.8),
      });
    }

    // ---- Sarah: cadence slip, open decision, stalled deals ----
    events.push(
      { type: "oneonone", personId: sarah.id, domain: "people", data: { notes: "Pipeline review" }, createdAt: daysAgo(35) },
      { type: "oneonone", personId: sarah.id, domain: "people", data: { notes: "Deal strategy" }, createdAt: daysAgo(70) },
      { type: "pulse", personId: sarah.id, domain: "people", data: { mood: 3 }, createdAt: daysAgo(4) },
      { type: "feedback", personId: sarah.id, domain: "people", data: { sentiment: "positive", text: "Closed a big logo" }, createdAt: daysAgo(15) },
      { type: "decision", personId: sarah.id, domain: "strategy", data: { topic: "Expand into EU market", status: "open" }, createdAt: daysAgo(10) },
    );
    for (let i = 0; i < 3; i++) {
      events.push({
        type: "deal", personId: sarah.id, domain: "sales",
        data: { stage: "negotiation", daysInStage: 35 + i * 5 }, createdAt: daysAgo(5),
      });
    }

    // ---- Tom: recognition gap (lots of 1:1s, no positive feedback) ----
    for (let i = 0; i < 5; i++) {
      events.push({
        type: "oneonone", personId: tom.id, domain: "people",
        data: { notes: `Support ops sync ${i + 1}` }, createdAt: daysAgo(7 + i * 10),
      });
    }
    events.push(
      { type: "feedback", personId: tom.id, domain: "people", data: { sentiment: "negative", text: "Missed SLA" }, createdAt: daysAgo(40) },
      { type: "feedback", personId: tom.id, domain: "people", data: { sentiment: "neutral", text: "On track" }, createdAt: daysAgo(70) },
      { type: "pulse", personId: tom.id, domain: "people", data: { mood: 3 }, createdAt: daysAgo(2) },
    );

    // ---- Priya: new hire, no check-in yet ----
    // (intentionally no oneonone / pulse events logged yet)

    // ---- Liam: negative feedback streak + declining mood ----
    events.push(
      { type: "feedback", personId: liam.id, domain: "people", data: { sentiment: "negative", text: "Missed deadline" }, createdAt: daysAgo(3) },
      { type: "feedback", personId: liam.id, domain: "people", data: { sentiment: "negative", text: "Quality concerns" }, createdAt: daysAgo(12) },
      { type: "feedback", personId: liam.id, domain: "people", data: { sentiment: "negative", text: "Communication gaps" }, createdAt: daysAgo(20) },
      { type: "pulse", personId: liam.id, domain: "people", data: { mood: 2 }, createdAt: daysAgo(2) },
      { type: "pulse", personId: liam.id, domain: "people", data: { mood: 3 }, createdAt: daysAgo(9) },
      { type: "pulse", personId: liam.id, domain: "people", data: { mood: 4 }, createdAt: daysAgo(16) },
      { type: "oneonone", personId: liam.id, domain: "people", data: { notes: "Check-in" }, createdAt: daysAgo(10) },
    );

    // ---- Org-wide: strategy, ops, decisions ----
    events.push(
      { type: "okr_review", domain: "strategy", data: { quarter: "Q2" }, createdAt: daysAgo(60) },
      { type: "meeting", domain: "strategy", data: { topic: "Leadership sync" }, createdAt: daysAgo(2) },
      { type: "meeting", domain: "strategy", data: { topic: "All hands" }, createdAt: daysAgo(5) },
      { type: "decision", domain: "strategy", data: { topic: "Pricing tier restructure", status: "open" }, createdAt: daysAgo(25) },
      { type: "decision", domain: "strategy", data: { topic: "Hire VP Eng", status: "open" }, createdAt: daysAgo(18) },
      { type: "decision", domain: "strategy", data: { topic: "Office relocation", status: "open" }, createdAt: daysAgo(9) },
      { type: "decision", domain: "strategy", data: { topic: "New brand positioning", status: "open" }, createdAt: daysAgo(8) },
      { type: "decision", domain: "strategy", data: { topic: "Partner integration", status: "resolved" }, createdAt: daysAgo(40) },
    );
    for (let i = 0; i < 4; i++) {
      events.push({
        type: "incident", domain: "ops",
        data: { severity: "sev2", afterHours: i < 3 }, createdAt: daysAgo(1 + i * 3),
      });
    }
    for (let i = 0; i < 12; i++) {
      events.push({
        type: "support_ticket", domain: "ops",
        data: { status: "open", subject: `Ticket ${i + 1}` }, createdAt: daysAgo(1 + i),
      });
    }

    await db.insert(leados_events).values(events);

    await db.insert(leados_growth_plans).values([
      { personId: mia.id, title: "Staff PM track", status: "completed", lastCheckinAt: daysAgo(5), createdAt: daysAgo(120) },
      { personId: diego.id, title: "Eng leadership growth", status: "open", lastCheckinAt: daysAgo(60), createdAt: daysAgo(150) },
      { personId: sarah.id, title: "Sales management track", status: "open", lastCheckinAt: daysAgo(25), createdAt: daysAgo(100) },
      { personId: tom.id, title: "Support ops scale-up", status: "open", lastCheckinAt: daysAgo(10), createdAt: daysAgo(90) },
      { personId: liam.id, title: "Senior engineer track", status: "open", lastCheckinAt: daysAgo(35), createdAt: daysAgo(80) },
    ]);

    result.people = 6;
    result.events = events.length;
    result.growthPlans = 5;
  }

  const [{ mcount }] = await db
    .select({ mcount: sql<number>`count(*)::int` })
    .from(leados_metrics);

  if (mcount === 0) {
    await db.insert(leados_metrics).values([
      { key: "runway_months", value: 8.5, domain: "finance", note: "Updated Q3" },
      { key: "mrr_growth_pct", value: -2.1, domain: "finance", note: "Q3 contraction" },
      { key: "pipeline_coverage_x", value: 2.3, domain: "sales", note: "Below 3× target" },
      { key: "win_rate_pct", value: 28, domain: "sales", note: "Declining from 35%" },
      { key: "churn_pct", value: 3.1, domain: "sales", note: "Above 2% threshold" },
      { key: "ltv_cac", value: 2.4, domain: "finance", note: "Below 3× benchmark" },
      { key: "deploy_freq_delta_pct", value: -38, domain: "ops", note: "Dropped since migration" },
      { key: "nps", value: 34, domain: "sales", note: "Q3 survey" },
      { key: "headcount", value: 6, domain: "people", note: "Current roster" },
    ]);

    // Extra metrics to exercise additional finance/ops rules in the demo.
    await db.insert(leados_metrics).values([
      { key: "burn_multiple", value: 2.6, domain: "finance", note: "Efficiency slipping" },
      { key: "cash_buffer_months", value: 2.2, domain: "finance", note: "Thin operating cushion" },
      { key: "code_review_lag_hours", value: 52, domain: "ops", note: "Review bottleneck" },
      { key: "headcount_target", value: 9, domain: "people", note: "Approved hiring plan" },
    ]);

    result.metrics = 13;
  }

  const [{ wcount }] = await db
    .select({ wcount: sql<number>`count(*)::int` })
    .from(leados_work_queue);
  result.existingWorkQueueItems = wcount;

  return result;
}
