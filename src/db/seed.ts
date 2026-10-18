import { sql } from "drizzle-orm";
import type { db as DbInstance } from "@/db";
import { leados_events, leados_people } from "@/db/schema";

type DbClient = typeof DbInstance;

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS);

/**
 * Populate a handful of people and a realistic event log the first time the
 * app boots against an empty database, so the autonomous loop and work
 * queue have something to reason about out of the box. No-op once seeded.
 */
export async function ensureSeedData(db: DbClient): Promise<void> {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(leados_people);
  if (count > 0) return;

  const people = await db
    .insert(leados_people)
    .values([
      { name: "Avery Chen", role: "Staff Engineer", team: "Platform", tenureStartAt: daysAgo(900) },
      { name: "Jordan Patel", role: "Sales Lead", team: "Revenue", tenureStartAt: daysAgo(620) },
      { name: "Riley Thompson", role: "Product Manager", team: "Growth", tenureStartAt: daysAgo(400) },
      { name: "Sam Okafor", role: "Support Engineer", team: "Ops", tenureStartAt: daysAgo(250) },
      { name: "Dana Kowalski", role: "Finance Manager", team: "Finance", tenureStartAt: daysAgo(1100) },
      { name: "Taylor Nguyen", role: "Engineering Manager", team: "Platform", tenureStartAt: daysAgo(800) },
    ])
    .returning();

  const byName = (name: string) => people.find((p) => p.name === name)!.id;

  await db.insert(leados_events).values([
    // People domain — flight risk + overdue cadence for Avery.
    { type: "hr.flightrisk.flag", domain: "people", personId: byName("Avery Chen"), occurredAt: daysAgo(4), data: { reason: "declined promotion, recruiter activity" } },
    { type: "people.oneonone.logged", domain: "people", personId: byName("Avery Chen"), occurredAt: daysAgo(40), data: {} },
    { type: "engagement.decline", domain: "people", personId: byName("Riley Thompson"), occurredAt: daysAgo(10), data: { deltaPct: -18 } },
    { type: "people.oneonone.logged", domain: "people", personId: byName("Riley Thompson"), occurredAt: daysAgo(8), data: {} },
    { type: "people.oneonone.logged", domain: "people", personId: byName("Jordan Patel"), occurredAt: daysAgo(5), data: {} },
    { type: "people.oneonone.logged", domain: "people", personId: byName("Sam Okafor"), occurredAt: daysAgo(50), data: {} },
    { type: "people.oneonone.logged", domain: "people", personId: byName("Dana Kowalski"), occurredAt: daysAgo(12), data: {} },
    { type: "people.oneonone.logged", domain: "people", personId: byName("Taylor Nguyen"), occurredAt: daysAgo(6), data: {} },
    { type: "hr.attrition", domain: "people", personId: null, occurredAt: daysAgo(35), data: { team: "Ops" } },
    { type: "hr.attrition", domain: "people", personId: null, occurredAt: daysAgo(15), data: { team: "Ops" } },

    // Finance — runway pressure.
    { type: "fin.runway.snapshot", domain: "finance", personId: null, occurredAt: daysAgo(2), data: { months: 5.2 } },
    { type: "fin.runway.drop", domain: "finance", personId: null, occurredAt: daysAgo(6), data: { fromMonths: 9.1, toMonths: 5.2 } },

    // Sales — thin pipeline.
    { type: "sales.pipeline.snapshot", domain: "sales", personId: byName("Jordan Patel"), occurredAt: daysAgo(1), data: { coverage: 1.8 } },

    // Ops — incident cluster.
    { type: "ops.incident", domain: "ops", personId: byName("Sam Okafor"), occurredAt: daysAgo(1), data: { severity: "sev2" } },
    { type: "ops.incident", domain: "ops", personId: byName("Sam Okafor"), occurredAt: daysAgo(3), data: { severity: "sev3" } },
    { type: "ops.incident", domain: "ops", personId: byName("Sam Okafor"), occurredAt: daysAgo(5), data: { severity: "sev2" } },

    // Strategy — stale escalation.
    { type: "decision.escalate", domain: "strategy", personId: byName("Taylor Nguyen"), occurredAt: daysAgo(9), data: { decisionId: "dec_pricing_2026" } },
  ]);
}
