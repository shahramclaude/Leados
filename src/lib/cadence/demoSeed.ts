// LEADOS Part 25 — demo/dev seed data.
// Creates one org, a handful of users, the default cadence graph, one
// adaptive-cadence policy, and enough realistic signal rows (trigger
// watches, sensor readings incl. one deliberate anomaly, KR drift, budget
// variance, an aggregate pulse, and an overdue action) that the agenda
// synthesizer has real deltas to find on first run. Idempotent: re-running
// against the same org name finds the existing org rather than duplicating it.
import { db } from "@/db";
import {
  actions,
  budgetLines,
  cadencePolicies,
  decisions,
  decisionTriggerWatches,
  keyResults,
  orgs,
  sensorSignalReadings,
  teamPulseAggregates,
  users,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { seedDefaultCadenceGraph } from "./graph";

export async function seedDemoOrg(orgName = "LEADOS Demo Org"): Promise<{ orgId: string }> {
  const [existingOrg] = await db.select().from(orgs).where(eq(orgs.name, orgName)).limit(1);
  const org = existingOrg ?? (await db.insert(orgs).values({ name: orgName }).returning())[0];
  const orgId = org.id;

  const existingUsers = await db.select().from(users).where(eq(users.orgId, orgId));
  if (existingUsers.length === 0) {
    await db.insert(users).values([
      { orgId, name: "Amara Lead", role: "lead" },
      { orgId, name: "Devon Manager", role: "manager" },
      { orgId, name: "Priya IC", role: "ic" },
      { orgId, name: "Sam Exec", role: "exec" },
    ]);
  }

  const graph = await seedDefaultCadenceGraph(orgId, "America/New_York");

  const [existingPolicy] = await db
    .select()
    .from(cadencePolicies)
    .where(eq(cadencePolicies.ritualId, graph.monthly_business_review.id))
    .limit(1);
  if (!existingPolicy) {
    await db.insert(cadencePolicies).values({
      orgId,
      ritualId: graph.monthly_business_review.id,
      name: "Degrade MBR when stable",
      description:
        "If variance stays under 2% and no anomalies are observed for 3 consecutive monthly reviews, degrade the Monthly Business Review to an async checklist.",
      rule: { kind: "variance_anomaly_degrade", varianceThresholdPct: 2, anomalyFreeOccurrences: 3, degradeTo: "async_checklist" },
      active: true,
    });
  }

  const existingDecision = await db.select().from(decisions).where(eq(decisions.orgId, orgId)).limit(1);
  let decisionId = existingDecision[0]?.id;
  if (!decisionId) {
    const [d] = await db
      .insert(decisions)
      .values({
        orgId,
        decisionClass: "pricing",
        question: "Should we raise the Pro tier price by 10%?",
        impact: 4,
        status: "framed",
      })
      .returning();
    decisionId = d.id;
  }

  const existingWatch = await db.select().from(decisionTriggerWatches).where(eq(decisionTriggerWatches.orgId, orgId)).limit(1);
  if (existingWatch.length === 0) {
    await db.insert(decisionTriggerWatches).values({
      orgId,
      decisionId,
      signal: "monthly_churn_pct",
      thresholdOp: "gte",
      thresholdValue: "5",
      status: "watching",
      lastValue: "4.6",
      lastEvaluatedAt: new Date(),
    });
  }

  const existingSignals = await db.select().from(sensorSignalReadings).where(eq(sensorSignalReadings.orgId, orgId)).limit(1);
  if (existingSignals.length === 0) {
    const now = new Date();
    const baseline = [101, 99, 100, 102, 98, 101, 100].map((v, i) => ({
      orgId,
      signal: "support_tickets_per_day",
      value: String(v),
      observedAt: new Date(now.getTime() - (30 - i) * 86400000),
    }));
    await db.insert(sensorSignalReadings).values(baseline);
    // Deliberate anomaly in the current window.
    await db.insert(sensorSignalReadings).values({
      orgId,
      signal: "support_tickets_per_day",
      value: "167",
      observedAt: new Date(now.getTime() - 86400000),
    });
  }

  const existingKr = await db.select().from(keyResults).where(eq(keyResults.orgId, orgId)).limit(1);
  if (existingKr.length === 0) {
    await db.insert(keyResults).values({
      orgId,
      name: "Net new ARR",
      periodKey: "2026-Q1",
      target: "500000",
      current: "410000",
    });
  }

  const existingBudget = await db.select().from(budgetLines).where(eq(budgetLines.orgId, orgId)).limit(1);
  if (existingBudget.length === 0) {
    await db.insert(budgetLines).values({
      orgId,
      category: "Cloud infrastructure",
      periodKey: "2026-02",
      budgeted: "40000",
      actual: "48600",
    });
  }

  const existingPulse = await db.select().from(teamPulseAggregates).where(eq(teamPulseAggregates.orgId, orgId)).limit(1);
  if (existingPulse.length === 0) {
    await db.insert(teamPulseAggregates).values({
      orgId,
      teamLabel: "Platform",
      periodKey: "2026-02",
      avgScore: "2.7",
      respondentCount: 8,
    });
  }

  const existingActions = await db.select().from(actions).where(eq(actions.orgId, orgId)).limit(1);
  if (existingActions.length === 0) {
    await db.insert(actions).values({
      orgId,
      title: "Follow up with Acme Co on renewal",
      ownerRole: "manager",
      status: "open",
      dueAt: new Date(Date.now() - 5 * 86400000),
    });
  }

  return { orgId };
}
