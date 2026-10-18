import { db } from "@/db";
import {
  leados_people,
  leados_events,
  leados_decisions,
  leados_growth_plans,
  leados_work_queue,
  leados_hypotheses,
  leados_audit,
} from "@/db/schema";
import { sql } from "drizzle-orm";

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

/**
 * Idempotent seed: only populates the database the first time it's called
 * (i.e. when the people table is empty). Safe to call on every page load.
 */
export async function seed() {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leados_people);

  if (count > 0) return;

  const peopleSeed = [
    { name: "Ana Silva", role: "Engineering Lead", cadenceDays: 7 },
    { name: "Bruno Costa", role: "Sales Manager", cadenceDays: 14 },
    { name: "Carla Mendes", role: "Finance Analyst", cadenceDays: 14 },
    { name: "Diego Santos", role: "Ops Coordinator", cadenceDays: 10 },
    { name: "Elena Rocha", role: "Strategy Director", cadenceDays: 21 },
    { name: "Felipe Souza", role: "Support Lead", cadenceDays: 14 },
  ];

  const people = await db.insert(leados_people).values(peopleSeed).returning();
  const byName = Object.fromEntries(people.map((p) => [p.name, p]));

  // ---- Pulse + 1:1 history (8 weeks, twice weekly) ----------------------
  type Profile = { moodStart: number; moodDrift: number; loadStart: number; loadDrift: number; domain: string };
  const profiles: Record<string, Profile> = {
    "Ana Silva":    { moodStart: 4.2, moodDrift: 0.02,  loadStart: 2.8, loadDrift: 0.0,  domain: "ops" },
    "Bruno Costa":  { moodStart: 3.6, moodDrift: -0.09, loadStart: 3.4, loadDrift: 0.07, domain: "sales" },
    "Carla Mendes": { moodStart: 3.9, moodDrift: 0.0,   loadStart: 3.0, loadDrift: 0.0,  domain: "finance" },
    "Diego Santos": { moodStart: 3.3, moodDrift: -0.03, loadStart: 3.6, loadDrift: 0.02, domain: "ops" },
    "Elena Rocha":  { moodStart: 3.8, moodDrift: 0.0,   loadStart: 2.9, loadDrift: 0.0,  domain: "strategy" },
    "Felipe Souza": { moodStart: 3.1, moodDrift: -0.08, loadStart: 4.0, loadDrift: 0.05, domain: "people" },
  };

  const eventRows: Array<typeof leados_events.$inferInsert> = [];
  for (const p of people) {
    const prof = profiles[p.name];
    const points = 16; // twice weekly over 8 weeks
    for (let i = points; i >= 0; i--) {
      const t = points - i;
      const mood = Math.max(1, Math.min(5, prof.moodStart + prof.moodDrift * t + (Math.sin(t * 1.3) * 0.15)));
      const load = Math.max(1, Math.min(5, prof.loadStart + prof.loadDrift * t + (Math.cos(t * 0.9) * 0.15)));
      eventRows.push({
        type: "pulse",
        domain: "people",
        personId: p.id,
        data: { mood: Number(mood.toFixed(2)), load: Number(load.toFixed(2)) },
        createdAt: daysAgo(i * 3.5),
      });
    }
  }

  // 1:1 history — deliberately staggered so some people show cadence slip
  const lastOneOnOne: Record<string, number> = {
    "Ana Silva": 3,
    "Bruno Costa": 40,
    "Carla Mendes": 5,
    "Diego Santos": 27,
    "Elena Rocha": 9,
    "Felipe Souza": 21,
  };
  for (const p of people) {
    const lastDays = lastOneOnOne[p.name];
    // a couple of historical 1:1s plus the most recent one
    eventRows.push({
      type: "oneonone",
      domain: "people",
      personId: p.id,
      data: { notes: `Regular check-in with ${p.name.split(" ")[0]}.` },
      createdAt: daysAgo(lastDays),
    });
    eventRows.push({
      type: "oneonone",
      domain: "people",
      personId: p.id,
      data: { notes: "Career growth + workload discussion." },
      createdAt: daysAgo(lastDays + 18),
    });
  }

  // Feedback events
  eventRows.push(
    { type: "feedback", domain: "people", personId: byName["Bruno Costa"].id, data: { notes: "Pipeline slipping, coaching on forecasting.", sentiment: "negative" }, createdAt: daysAgo(6) },
    { type: "feedback", domain: "people", personId: byName["Felipe Souza"].id, data: { notes: "Great incident response last week.", sentiment: "positive" }, createdAt: daysAgo(4) },
    { type: "feedback", domain: "people", personId: byName["Ana Silva"].id, data: { notes: "Shipped migration ahead of schedule.", sentiment: "positive" }, createdAt: daysAgo(2) },
  );

  await db.insert(leados_events).values(eventRows);

  // ---- Decisions ----------------------------------------------------------
  await db.insert(leados_decisions).values([
    { title: "Approve Q3 headcount plan for Sales", owner: "Bruno Costa", domain: "gov", status: "open", openedAt: daysAgo(52) },
    { title: "Finance tooling vendor renewal", owner: "Carla Mendes", domain: "finance", status: "open", openedAt: daysAgo(26) },
    { title: "Ops on-call rotation redesign", owner: "Diego Santos", domain: "ops", status: "open", openedAt: daysAgo(8) },
    { title: "FY strategy offsite agenda", owner: "Elena Rocha", domain: "strategy", status: "open", openedAt: daysAgo(3) },
    { title: "Support SLA tier restructuring", owner: "Felipe Souza", domain: "gov", status: "resolved", openedAt: daysAgo(40), resolvedAt: daysAgo(2) },
  ]);

  // ---- Growth plans ---------------------------------------------------------
  await db.insert(leados_growth_plans).values([
    { personId: byName["Ana Silva"].id, goal: "Staff-level system design track", level: "advanced", status: "open", lastCheckin: daysAgo(5) },
    { personId: byName["Bruno Costa"].id, goal: "Forecasting rigor + pipeline hygiene", level: "developing", status: "open", lastCheckin: daysAgo(12) },
    { personId: byName["Diego Santos"].id, goal: "Ops automation certification", level: "developing", status: "open", lastCheckin: daysAgo(46) },
    { personId: byName["Felipe Souza"].id, goal: "People management readiness", level: "developing", status: "open", lastCheckin: daysAgo(18) },
  ]);

  // ---- Work queue -------------------------------------------------------
  await db.insert(leados_work_queue).values([
    { title: "Draft 1:1 agenda for Bruno Costa (pipeline risk)", type: "draft", status: "pending", data: { personName: "Bruno Costa" } },
    { title: "Weekly exec summary — Strategy domain", type: "summary", status: "pending", data: { domain: "strategy" } },
    { title: "Nudge email: Ops on-call decision stalling", type: "email", status: "pending", data: { domain: "ops" } },
    { title: "Draft growth check-in note for Diego Santos", type: "draft", status: "accepted", data: { personName: "Diego Santos" } },
  ]);

  // ---- Hypotheses ---------------------------------------------------------
  await db.insert(leados_hypotheses).values([
    { statement: "Reducing Bruno's deal load will stabilize pipeline accuracy", prediction: "Forecast variance drops below 15%", testMetric: "forecast_variance_pct", windowDays: 21, status: "open", confidence: 55, createdAt: daysAgo(4) },
    { statement: "Diego's automation project reduces on-call pages", prediction: "On-call pages drop 30%", testMetric: "oncall_pages_per_week", windowDays: 14, status: "open", confidence: 48, createdAt: daysAgo(20) },
    { statement: "Support SLA restructuring improves CSAT", prediction: "CSAT rises above 90%", testMetric: "csat_pct", windowDays: 10, status: "confirmed", confidence: 82, createdAt: daysAgo(35) },
  ]);

  // ---- Audit log seed -----------------------------------------------------
  await db.insert(leados_audit).values([
    { action: "SEED", detail: "Database seeded with initial roster, events, decisions, and queue." },
    { action: "DECISION_OPENED", detail: "Approve Q3 headcount plan for Sales" },
    { action: "DECISION_RESOLVED", detail: "Support SLA tier restructuring" },
    { action: "HYPOTHESIS_CONFIRMED", detail: "Support SLA restructuring improves CSAT" },
  ]);
}
