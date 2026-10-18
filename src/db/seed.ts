// ─────────────────────────────────────────────────────────────────────────
// Sample data seeding. Populates a small, realistic roster + event log that
// exercises every signal the intelligence engine reads: cadence slip,
// morale pulses, a flight-risk flag, decision backlog/escalation, pipeline
// coverage, runway, and the three hard-coded causal chains.
// ─────────────────────────────────────────────────────────────────────────

import { db } from "@/db";
import { leados_events, leados_people } from "@/db/schema";

const DAY_MS = 24 * 60 * 60 * 1000;
function daysAgo(n: number): Date {
  return new Date(Date.now() - n * DAY_MS);
}

export async function seedIfEmpty(): Promise<boolean> {
  const existing = await db.select({ id: leados_people.id }).from(leados_people).limit(1);
  if (existing.length > 0) return false;
  await seedDatabase();
  return true;
}

export async function seedDatabase(): Promise<void> {
  const [alex, bianca, carlos, dana, elena] = await db
    .insert(leados_people)
    .values([
      { name: "Alex Rivera", role: "Senior Engineer", team: "Platform", tenureStartAt: daysAgo(900) },
      { name: "Bianca Chen", role: "Account Executive", team: "Sales", tenureStartAt: daysAgo(60) },
      { name: "Carlos Mendes", role: "Ops Lead", team: "Operations", tenureStartAt: daysAgo(400) },
      { name: "Dana Okafor", role: "Product Manager", team: "Product", tenureStartAt: daysAgo(730) },
      { name: "Elena Petrova", role: "Finance Analyst", team: "Finance", tenureStartAt: daysAgo(200) },
    ])
    .returning();

  await db.insert(leados_events).values([
    // Alex: cadence slipping + declining mood -> flight risk
    { type: "people.oneonone.logged", domain: "people", personId: alex.id, occurredAt: daysAgo(40), data: {} },
    { type: "people.pulse.logged", domain: "people", personId: alex.id, occurredAt: daysAgo(28), data: { mood: 4 } },
    { type: "people.pulse.logged", domain: "people", personId: alex.id, occurredAt: daysAgo(14), data: { mood: 3 } },
    { type: "people.pulse.logged", domain: "people", personId: alex.id, occurredAt: daysAgo(3), data: { mood: 2 } },
    { type: "hr.flightrisk.flag", domain: "people", personId: alex.id, occurredAt: daysAgo(5), data: { reason: "manager concern" } },
    { type: "people.comp.reviewed", domain: "people", personId: alex.id, occurredAt: daysAgo(90), data: { gapPct: 18 } },
    { type: "people.feedback.logged", domain: "people", personId: alex.id, occurredAt: daysAgo(80), data: {} },
    { type: "engagement.decline", domain: "people", personId: alex.id, occurredAt: daysAgo(20), data: {} },

    // Bianca: new hire, healthy cadence
    { type: "people.oneonone.logged", domain: "people", personId: bianca.id, occurredAt: daysAgo(5), data: {} },
    { type: "people.pulse.logged", domain: "people", personId: bianca.id, occurredAt: daysAgo(4), data: { mood: 5 } },
    { type: "people.feedback.logged", domain: "people", personId: bianca.id, occurredAt: daysAgo(10), data: {} },

    // Carlos: ops incidents
    { type: "ops.incident", domain: "ops", personId: carlos.id, occurredAt: daysAgo(12), data: { severity: "high" } },
    { type: "ops.incident", domain: "ops", personId: carlos.id, occurredAt: daysAgo(6), data: { severity: "medium" } },
    { type: "people.pulse.logged", domain: "people", personId: carlos.id, occurredAt: daysAgo(6), data: { mood: 2 } },
    { type: "people.oneonone.logged", domain: "people", personId: carlos.id, occurredAt: daysAgo(35), data: {} },

    // Dana: decision backlog / escalation -> ops incident causal chain
    { type: "decision.logged", domain: "strategy", personId: dana.id, occurredAt: daysAgo(25), data: { decisionId: "D-100" } },
    { type: "decision.escalate", domain: "strategy", personId: dana.id, occurredAt: daysAgo(18), data: { decisionId: "D-100" } },
    { type: "ops.incident", domain: "ops", personId: null, occurredAt: daysAgo(15), data: { decisionId: "D-100" } },
    { type: "decision.logged", domain: "strategy", personId: dana.id, occurredAt: daysAgo(10), data: { decisionId: "D-101" } },
    { type: "decision.escalate", domain: "strategy", personId: dana.id, occurredAt: daysAgo(4), data: { decisionId: "D-101" } },
    { type: "ops.incident", domain: "ops", personId: null, occurredAt: daysAgo(1), data: { decisionId: "D-101" } },
    { type: "decision.resolved", domain: "strategy", personId: dana.id, occurredAt: daysAgo(2), data: { decisionId: "D-99" } },
    { type: "people.oneonone.logged", domain: "people", personId: dana.id, occurredAt: daysAgo(7), data: {} },
    { type: "people.pulse.logged", domain: "people", personId: dana.id, occurredAt: daysAgo(7), data: { mood: 4 } },

    // Elena / finance + sales: runway and pipeline signals, pipeline.thin -> runway.drop chain
    { type: "fin.runway.snapshot", domain: "finance", personId: elena.id, occurredAt: daysAgo(3), data: { months: 7.5 } },
    { type: "fin.pl.logged", domain: "finance", personId: elena.id, occurredAt: daysAgo(3), data: { netMarginPct: -4 } },
    { type: "people.oneonone.logged", domain: "people", personId: elena.id, occurredAt: daysAgo(6), data: {} },
    { type: "people.pulse.logged", domain: "people", personId: elena.id, occurredAt: daysAgo(6), data: { mood: 4 } },
    { type: "pipeline.thin", domain: "sales", personId: null, occurredAt: daysAgo(45), data: {} },
    { type: "fin.runway.drop", domain: "finance", personId: null, occurredAt: daysAgo(20), data: {} },
    { type: "sales.pipeline.snapshot", domain: "sales", personId: null, occurredAt: daysAgo(2), data: { coverageX: 1.4 } },

    // A second occurrence of decision.escalate -> ops.incident further back, to raise chain confidence
    { type: "decision.logged", domain: "strategy", personId: dana.id, occurredAt: daysAgo(55), data: { decisionId: "D-90" } },
    { type: "decision.escalate", domain: "strategy", personId: dana.id, occurredAt: daysAgo(50), data: { decisionId: "D-90" } },
    { type: "ops.incident", domain: "ops", personId: null, occurredAt: daysAgo(47), data: { decisionId: "D-90" } },
  ]);
}
