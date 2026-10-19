import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { buildSeedPeople, buildSeedProjects, buildSeedEvents } from "./seedData";

/**
 * Idempotently populates the database with a realistic baseline
 * dataset (50 people, 20 projects, findings, hypotheses, rules,
 * playbooks, metrics, a small knowledge graph, and 100 events) so
 * every view and the self-test suite have real data to work with
 * without requiring a manual seeding step. Each table is checked
 * independently and only populated if empty.
 */
export async function ensureBaselineData(db: Db): Promise<void> {
  const existingPeople = await db.select().from(schema.people).limit(1);
  if (existingPeople.length === 0) {
    const people = buildSeedPeople(50).map((p) => ({
      name: p.name,
      role: p.role,
      department: p.department,
      managerId: p.managerId,
      performanceScore: p.performanceScore,
      potentialScore: p.potentialScore,
      flightRiskScore: p.flightRiskScore,
      burnoutRiskScore: p.burnoutRiskScore,
      tenureMonths: p.tenureMonths,
      skills: p.skills,
      isCritical: p.isCritical,
    }));
    await db.insert(schema.people).values(people);
  }

  const existingProjects = await db.select().from(schema.projects).limit(1);
  if (existingProjects.length === 0) {
    const projects = buildSeedProjects(20).map((p) => ({
      name: p.name,
      status: "active",
      durationDays: p.durationDays,
      dependencies: p.dependencies,
      deliveryConfidence: 0.5 + Math.random() * 0.4,
    }));
    await db.insert(schema.projects).values(projects);
  }

  const existingRules = await db.select().from(schema.rules).limit(1);
  if (existingRules.length === 0) {
    await db.insert(schema.rules).values([
      { name: "flight-risk-escalation", domain: "people", weight: 1.0 },
      { name: "burn-rate-alert", domain: "financial", weight: 1.0 },
      { name: "schedule-slip-watch", domain: "execution", weight: 1.0 },
    ]);
  }

  const existingPlaybooks = await db.select().from(schema.playbooks).limit(1);
  if (existingPlaybooks.length === 0) {
    await db.insert(schema.playbooks).values([
      { name: "Retention intervention", domain: "people", triggerCondition: "flight_risk_high" },
      { name: "Runway extension", domain: "financial", triggerCondition: "burn_rate_high" },
      { name: "Schedule recovery", domain: "execution", triggerCondition: "slip_detected" },
    ]);
  }

  const existingFindings = await db.select().from(schema.findings).limit(1);
  if (existingFindings.length === 0) {
    await db.insert(schema.findings).values([
      {
        title: "Elevated flight risk cluster in Engineering",
        domain: "people",
        severity: "high",
        tags: ["attrition", "flight-risk", "engineering"],
        description: "Three senior engineers show elevated flight-risk signals in the last 30 days.",
        status: "open",
      },
      {
        title: "Burn rate trending above plan",
        domain: "financial",
        severity: "medium",
        tags: ["burn", "runway"],
        description: "Monthly burn is 12% above plan for the second consecutive month.",
        status: "open",
      },
      {
        title: "Critical path slip on Project 4",
        domain: "execution",
        severity: "medium",
        tags: ["schedule", "dependency"],
        description: "Dependency chain delay is pushing the critical path out by 5 days.",
        status: "open",
      },
    ]);
  }

  const existingHypotheses = await db.select().from(schema.hypotheses).limit(1);
  if (existingHypotheses.length === 0) {
    const now = Date.now();
    await db.insert(schema.hypotheses).values([
      {
        entity: "Engineering team",
        claim: "Flight risk cluster will lead to at least one resignation within 30 days",
        resolveBy: new Date(now + 1000 * 60 * 60 * 24 * 10),
        status: "open",
        confidence: 0.62,
      },
      {
        entity: "Finance",
        claim: "Burn rate overage is a one-time hiring ramp, not a structural trend",
        resolveBy: new Date(now - 1000 * 60 * 60 * 24 * 2),
        status: "open",
        confidence: 0.4,
      },
      {
        entity: "Project 4",
        claim: "Schedule slip will resolve without impacting the launch date",
        resolveBy: new Date(now - 1000 * 60 * 60 * 24 * 20),
        status: "confirmed",
        confidence: 0.81,
      },
    ]);
  }

  const existingMetrics = await db.select().from(schema.metrics).limit(1);
  if (existingMetrics.length === 0) {
    const [revenue, churn] = await db
      .insert(schema.metrics)
      .values([
        { name: "Monthly Recurring Revenue", unit: "usd", baseline: 150_000, stdDev: 12_000 },
        { name: "Customer Churn Rate", unit: "pct", baseline: 0.03, stdDev: 0.01 },
      ])
      .returning();

    const now = Date.now();
    const revenuePoints = Array.from({ length: 30 }, (_, i) => ({
      metricId: revenue.id,
      ts: new Date(now - (29 - i) * 1000 * 60 * 60 * 24),
      value: 140_000 + i * 1800 + (Math.random() - 0.5) * 4000,
    }));
    const churnPoints = Array.from({ length: 30 }, (_, i) => ({
      metricId: churn.id,
      ts: new Date(now - (29 - i) * 1000 * 60 * 60 * 24),
      value: 0.03 + (Math.random() - 0.5) * 0.01,
    }));
    await db.insert(schema.metricPoints).values([...revenuePoints, ...churnPoints]);
  }

  const existingNodes = await db.select().from(schema.knowledgeNodes).limit(1);
  if (existingNodes.length === 0) {
    const [n1, n2, n3] = await db
      .insert(schema.knowledgeNodes)
      .values([
        { type: "finding", label: "Flight risk cluster", domain: "people", severity: "high", tags: ["attrition", "flight-risk"] },
        { type: "finding", label: "Manager overload", domain: "people", severity: "medium", tags: ["burnout", "management"] },
        { type: "finding", label: "Burn rate overage", domain: "financial", severity: "medium", tags: ["burn", "runway"] },
      ])
      .returning();
    await db.insert(schema.knowledgeEdges).values([
      { fromId: n1.id, toId: n2.id, relation: "caused_by", weight: 0.7 },
    ]);
  }

  const existingEvents = await db.select().from(schema.events).limit(1);
  if (existingEvents.length === 0) {
    const events = buildSeedEvents(100).map((e) => ({
      type: e.type,
      entityType: "system",
      entityId: null,
      payload: {},
      createdAt: e.createdAt,
    }));
    await db.insert(schema.events).values(events);
  }
}
