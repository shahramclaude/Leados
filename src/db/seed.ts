import { db } from "@/db";
import {
  leados_people,
  leados_events,
  leados_decisions,
  leados_plans,
} from "@/db/schema";
import { sql } from "drizzle-orm";

function daysAgo(n: number) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

// Builds 12 evenly spaced timestamps from `spanDays` ago up to `recencyDays` ago.
function series(spanDays: number, recencyDays: number, count = 12) {
  const out: Date[] = [];
  const step = (spanDays - recencyDays) / (count - 1);
  for (let i = 0; i < count; i++) {
    out.push(daysAgo(spanDays - step * i));
  }
  return out;
}

export async function seed() {
  const existing = await db.execute(sql`select count(*)::int as n from leados_people`);
  const count = Number((existing.rows[0] as { n: number })?.n ?? 0);
  if (count > 0) return; // idempotent — already seeded

  const [ana, marcus, priya, diego, fatima, tom] = await db
    .insert(leados_people)
    .values([
      { name: "Ana Petrova", role: "Engineering Manager", cadenceDays: 14 },
      { name: "Marcus Chen", role: "Sales Lead", cadenceDays: 14 },
      { name: "Priya Sharma", role: "Ops Lead", cadenceDays: 14 },
      { name: "Diego Fernandez", role: "Finance Analyst", cadenceDays: 21 },
      { name: "Fatima Al-Sayed", role: "Strategy Lead", cadenceDays: 14 },
      { name: "Tom O'Brien", role: "Senior Engineer", cadenceDays: 14 },
    ])
    .returning();

  // ── Pulse history (mood + load, 1-5 scale) ──────────────────────────
  const pulsePlan: { person: typeof ana; mood: number[]; load: number[] }[] = [
    { person: ana, mood: [3, 3, 3, 2, 2, 2, 2, 1, 1, 1, 2, 1], load: [3, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5] },
    { person: priya, mood: [3, 3, 3, 3, 2, 3, 2, 3, 2, 2, 3, 2], load: [4, 4, 4, 5, 5, 4, 5, 5, 5, 5, 5, 5] },
    { person: marcus, mood: [4, 4, 3, 4, 3, 4, 4, 3, 4, 4, 3, 4], load: [3, 3, 2, 3, 3, 3, 2, 3, 3, 2, 3, 3] },
    { person: diego, mood: [4, 4, 4, 3, 4, 4, 3, 4, 4, 4, 3, 4], load: [3, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3] },
    { person: fatima, mood: [4, 5, 4, 5, 4, 4, 5, 4, 4, 5, 4, 4], load: [3, 3, 3, 2, 3, 3, 2, 3, 3, 3, 2, 3] },
    { person: tom, mood: [3, 3, 4, 3, 3, 3, 3, 3, 3, 3, 4, 3], load: [4, 4, 3, 4, 4, 4, 3, 4, 4, 4, 4, 4] },
  ];

  const pulseRows: (typeof leados_events.$inferInsert)[] = [];
  for (const { person, mood, load } of pulsePlan) {
    const dates = series(74, 2, 12);
    mood.forEach((m, i) => {
      pulseRows.push({
        type: "pulse",
        domain: "people",
        personId: person.id,
        data: { mood: m, load: load[i], notes: "" },
        createdAt: dates[i],
      });
    });
  }
  await db.insert(leados_events).values(pulseRows);

  // ── 1:1 history ──────────────────────────────────────────────────────
  const oneOnOnePlan = [
    { person: ana, lastHeld: 40, history: [68, 54, 40] },
    { person: priya, lastHeld: 25, history: [50, 25] },
    { person: tom, lastHeld: 20, history: [48, 34, 20] },
    { person: marcus, lastHeld: 10, history: [38, 24, 10] },
    { person: diego, lastHeld: 12, history: [44, 28, 12] },
    { person: fatima, lastHeld: 8, history: [36, 22, 8] },
  ];
  const oneOnOneRows: (typeof leados_events.$inferInsert)[] = [];
  for (const { person, history } of oneOnOnePlan) {
    history.forEach((d, i) => {
      oneOnOneRows.push({
        type: "oneonone",
        domain: "people",
        personId: person.id,
        data: { notes: "Regular check-in.", status: "held" },
        createdAt: daysAgo(d),
      });
      void i;
    });
  }
  await db.insert(leados_events).values(oneOnOneRows);

  // ── Feedback history ──────────────────────────────────────────────────
  const feedbackRows: (typeof leados_events.$inferInsert)[] = [
    { type: "feedback", domain: "sales", personId: marcus.id, data: { notes: "Client flagged missed SLAs in renewal.", sentiment: "negative" }, createdAt: daysAgo(18) },
    { type: "feedback", domain: "sales", personId: marcus.id, data: { notes: "Second escalation from enterprise account this month.", sentiment: "negative" }, createdAt: daysAgo(6) },
    { type: "feedback", domain: "people", personId: ana.id, data: { notes: "Strong technical mentorship noted by team.", sentiment: "positive" }, createdAt: daysAgo(45) },
    { type: "feedback", domain: "people", personId: fatima.id, data: { notes: "Clear strategic communication in all-hands.", sentiment: "positive" }, createdAt: daysAgo(20) },
    { type: "feedback", domain: "ops", personId: priya.id, data: { notes: "Ops migration slipping, team morale strained.", sentiment: "negative" }, createdAt: daysAgo(15) },
    { type: "feedback", domain: "people", personId: diego.id, data: { notes: "Reliable, steady quarterly close.", sentiment: "neutral" }, createdAt: daysAgo(30) },
    { type: "feedback", domain: "people", personId: tom.id, data: { notes: "Good debugging support for on-call.", sentiment: "positive" }, createdAt: daysAgo(22) },
  ];
  await db.insert(leados_events).values(feedbackRows);

  // ── Decisions ───────────────────────────────────────────────────────
  await db.insert(leados_decisions).values([
    { title: "Re-architect billing pipeline", owner: "Diego Fernandez", domain: "finance", status: "open", openedAt: daysAgo(10) },
    { title: "Vendor contract renewal", owner: "Fatima Al-Sayed", domain: "strategy", status: "open", openedAt: daysAgo(70) },
    { title: "Sales comp plan redesign", owner: "Marcus Chen", domain: "sales", status: "open", openedAt: daysAgo(30) },
    { title: "Ops tooling migration", owner: "Priya Sharma", domain: "ops", status: "open", openedAt: daysAgo(50) },
    { title: "Governance policy update", owner: "Ana Petrova", domain: "gov", status: "open", openedAt: daysAgo(5) },
    { title: "Q3 roadmap prioritization", owner: "Fatima Al-Sayed", domain: "strategy", status: "resolved", openedAt: daysAgo(40), resolvedAt: daysAgo(2) },
  ]);

  // ── Growth plans ────────────────────────────────────────────────────
  await db.insert(leados_plans).values([
    { personId: priya.id, goal: "Lead cross-team ops initiative", level: "senior", status: "active", lastCheckin: daysAgo(35) },
    { personId: diego.id, goal: "Finance modeling certification", level: "mid", status: "active", lastCheckin: daysAgo(40) },
    { personId: ana.id, goal: "People management skills", level: "senior", status: "active", lastCheckin: daysAgo(5) },
    { personId: tom.id, goal: "Backend architecture mastery", level: "mid", status: "active", lastCheckin: daysAgo(10) },
  ]);
}
