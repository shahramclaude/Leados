// LEADOS Part 31 — demo data seeding for the Ecosystem Intelligence surfaces.
// Idempotent: truncates Part 31 tables then inserts a small, realistic fixture
// ecosystem so the Ecosystem Map / Concentration Dashboard / Alerts / Stakeholder
// Workspace have something real to render without needing a live Part 09/29 feed.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import type { EdgeType, EvidenceClass } from "./types";
import {
  commitments,
  dependencyAlerts,
  ecosystemEdges,
  ecosystemNodes,
  interactions,
  partnerScorecards,
  people,
  personMetricGrants,
  revenueRecords,
  riskRegister,
  skillCoverage,
  spendRecords,
  stakeholders,
} from "@/db/schema";

const PERIOD = "2026-Q1";

export async function seedDemoEcosystem() {
  await db.delete(commitments);
  await db.delete(interactions);
  await db.delete(stakeholders);
  await db.delete(dependencyAlerts);
  await db.delete(partnerScorecards);
  await db.delete(skillCoverage);
  await db.delete(spendRecords);
  await db.delete(revenueRecords);
  await db.delete(ecosystemEdges);
  await db.delete(ecosystemNodes);
  await db.delete(personMetricGrants);
  await db.delete(riskRegister);
  await db.delete(people);

  // --- Roster (Part 09 stand-in) -------------------------------------------------
  const [frank, alice, bob, carol, dana, eve] = await db
    .insert(people)
    .values([
      { name: "Frank Osei", role: "CEO", team: "Leadership" },
      { name: "Alice Nwosu", role: "CTO", team: "Leadership" },
      { name: "Bob Harrington", role: "Engineering Manager", team: "Engineering" },
      { name: "Carol Jimenez", role: "Senior Platform Engineer", team: "Engineering" },
      { name: "Dana Okafor", role: "Data Engineer", team: "Engineering" },
      { name: "Eve Tanaka", role: "Sales Lead", team: "Sales" },
    ])
    .returning();

  await db.update(people).set({ managerId: frank.id }).where(eq(people.id, alice.id));
  await db.update(people).set({ managerId: frank.id }).where(eq(people.id, eve.id));
  await db.update(people).set({ managerId: alice.id }).where(eq(people.id, bob.id));
  await db.update(people).set({ managerId: bob.id }).where(eq(people.id, carol.id));
  await db.update(people).set({ managerId: bob.id }).where(eq(people.id, dana.id));

  // --- Risk register (Part 29 stand-in) -------------------------------------------
  const [cloudRisk, vendorRisk] = await db
    .insert(riskRegister)
    .values([
      {
        title: "Single cloud provider outage exposure",
        category: "infrastructure",
        severity: "high",
        likelihood: "medium",
        owner: "Alice Nwosu",
      },
      {
        title: "Payments processor concentration",
        category: "financial",
        severity: "medium",
        likelihood: "low",
        owner: "Bob Harrington",
      },
    ])
    .returning();

  // --- Ecosystem nodes -------------------------------------------------------------
  const nodeValues = [
    { type: "internal_team" as const, name: "LEADOS Inc", isExternal: false },
    { type: "internal_person" as const, name: frank.name, isExternal: false, personId: frank.id },
    { type: "internal_person" as const, name: alice.name, isExternal: false, personId: alice.id },
    { type: "internal_person" as const, name: bob.name, isExternal: false, personId: bob.id },
    { type: "internal_person" as const, name: carol.name, isExternal: false, personId: carol.id },
    { type: "internal_person" as const, name: dana.name, isExternal: false, personId: dana.id },
    { type: "internal_person" as const, name: eve.name, isExternal: false, personId: eve.id },
    { type: "partner" as const, name: "NimbusCloud", isExternal: true },
    { type: "partner" as const, name: "PayFlow", isExternal: true },
    { type: "partner" as const, name: "DataVendor Co", isExternal: true },
    { type: "supplier" as const, name: "ChipSource Ltd", isExternal: true },
    { type: "customer" as const, name: "Globex Corp", isExternal: true },
    { type: "customer" as const, name: "Initech", isExternal: true },
    { type: "customer" as const, name: "Acme Retail", isExternal: true },
    { type: "regulator" as const, name: "Data Protection Authority", isExternal: true },
  ];
  const nodes = await db.insert(ecosystemNodes).values(nodeValues).returning();
  const n = (name: string) => nodes.find((x) => x.name === name)!;

  const company = n("LEADOS Inc");
  const nimbus = n("NimbusCloud");
  const payflow = n("PayFlow");
  const dataVendor = n("DataVendor Co");
  const chipSource = n("ChipSource Ltd");
  const globex = n("Globex Corp");
  const initech = n("Initech");
  const acme = n("Acme Retail");
  const dpa = n("Data Protection Authority");
  const nFrank = n(frank.name);
  const nAlice = n(alice.name);
  const nBob = n(bob.name);
  const nCarol = n(carol.name);
  const nDana = n(dana.name);
  const nEve = n(eve.name);

  await db.insert(ecosystemEdges).values([
    edge(company.id, nFrank.id, "employs", 1, 0.2, "verified_primary", ["hris:export:2026-01"]),
    edge(company.id, nAlice.id, "employs", 1, 0.3, "verified_primary", ["hris:export:2026-01"]),
    edge(company.id, nBob.id, "employs", 1, 0.4, "verified_primary", ["hris:export:2026-01"]),
    edge(company.id, nCarol.id, "employs", 1, 0.5, "verified_primary", ["hris:export:2026-01"]),
    edge(company.id, nDana.id, "employs", 1, 0.5, "verified_primary", ["hris:export:2026-01"]),
    edge(company.id, nEve.id, "employs", 1, 0.4, "verified_primary", ["hris:export:2026-01"]),

    edge(nAlice.id, nFrank.id, "reports_to", 1, 0.3, "verified_primary", ["hris:org-chart"]),
    edge(nEve.id, nFrank.id, "reports_to", 1, 0.5, "verified_primary", ["hris:org-chart"]),
    edge(nBob.id, nAlice.id, "reports_to", 1, 0.4, "verified_primary", ["hris:org-chart"]),
    edge(nCarol.id, nBob.id, "reports_to", 1, 0.5, "verified_primary", ["hris:org-chart"]),
    edge(nDana.id, nBob.id, "reports_to", 1, 0.5, "verified_primary", ["hris:org-chart"]),

    edge(company.id, nimbus.id, "depends_on", 0.95, 0.15, "verified_secondary", ["cloud:contract:2025-11"]),
    edge(company.id, payflow.id, "depends_on", 0.8, 0.3, "verified_secondary", ["finance:vendor-list"]),
    edge(company.id, dataVendor.id, "depends_on", 0.5, 0.6, "self_reported", ["procurement:note"]),
    edge(company.id, chipSource.id, "depends_on", 0.4, 0.5, "self_reported", ["procurement:note"]),

    edge(company.id, nimbus.id, "partners_with", 0.9, 0.15, "verified_primary", ["cloud:contract:2025-11"]),
    edge(company.id, payflow.id, "partners_with", 0.8, 0.3, "verified_primary", ["finance:contract:2025-09"]),
    edge(company.id, dataVendor.id, "partners_with", 0.5, 0.6, "verified_primary", ["procurement:contract:2025-06"]),

    edge(chipSource.id, company.id, "supplies", 0.4, 0.5, "self_reported", ["procurement:note"]),

    edge(company.id, globex.id, "serves", 0.9, 0.2, "verified_secondary", ["crm:account:globex"]),
    edge(company.id, initech.id, "serves", 0.5, 0.6, "verified_secondary", ["crm:account:initech"]),
    edge(company.id, acme.id, "serves", 0.4, 0.7, "verified_secondary", ["crm:account:acme"]),

    edge(company.id, dpa.id, "regulated_by", 0.7, 0.05, "verified_primary", ["legal:registration"]),
  ]);

  // --- Bus-factor inputs (Part 09 skill data stand-in) ------------------------------
  await db.insert(skillCoverage).values([
    { capability: "Kubernetes Infra Ops", personId: carol.id, capacity: "5", isPrimary: true },
    { capability: "Kubernetes Infra Ops", personId: dana.id, capacity: "2", isPrimary: false },

    { capability: "Payments Integration", personId: bob.id, capacity: "3", isPrimary: true },
    { capability: "Payments Integration", personId: carol.id, capacity: "1", isPrimary: false },

    { capability: "Data Pipeline Ops", personId: dana.id, capacity: "4", isPrimary: true },
  ]);

  // --- Concentration inputs ----------------------------------------------------------
  await db.insert(spendRecords).values([
    { partnerNodeId: nimbus.id, category: "cloud_infra", amount: "500000", period: PERIOD },
    { partnerNodeId: payflow.id, category: "payments", amount: "120000", period: PERIOD },
    { partnerNodeId: dataVendor.id, category: "data_enrichment", amount: "80000", period: PERIOD },
    { partnerNodeId: chipSource.id, category: "hardware", amount: "50000", period: PERIOD },
  ]);

  await db.insert(revenueRecords).values([
    { customerNodeId: globex.id, amount: "900000", period: PERIOD },
    { customerNodeId: initech.id, amount: "300000", period: PERIOD },
    { customerNodeId: acme.id, amount: "200000", period: PERIOD },
  ]);

  // --- Stakeholders + commitments + interactions ------------------------------------
  const [sGlobex, sNimbus, sDpa] = await db
    .insert(stakeholders)
    .values([
      {
        nodeId: globex.id,
        interest: 9,
        influence: 8,
        affectedness: 7,
        engagementPlan: "Quarterly business review + monthly SLA report; escalate via Eve Tanaka.",
        owner: "Eve Tanaka",
      },
      {
        nodeId: nimbus.id,
        interest: 6,
        influence: 7,
        affectedness: 9,
        engagementPlan: "Technical account manager sync monthly; annual contract renegotiation.",
        owner: "Alice Nwosu",
      },
      {
        nodeId: dpa.id,
        interest: 4,
        influence: 9,
        affectedness: 5,
        engagementPlan: "Annual compliance filing; respond to inquiries within 5 business days.",
        owner: "Alice Nwosu",
      },
    ])
    .returning();

  await db.insert(commitments).values([
    {
      stakeholderId: sGlobex.id,
      description: "Deliver Q2 uptime SLA report to Globex Corp",
      promisedBy: "Eve Tanaka",
      dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 20),
      status: "open",
      evidenceClass: "self_reported",
      evidenceRefs: ["email:2026-02-01"],
    },
    {
      stakeholderId: sNimbus.id,
      description: "Confirm renewed capacity reservation for Q3",
      promisedBy: "Alice Nwosu",
      dueDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3),
      status: "missed",
      evidenceClass: "self_reported",
      evidenceRefs: [],
    },
    {
      stakeholderId: sDpa.id,
      description: "Submit annual data-processing compliance filing",
      promisedBy: "Alice Nwosu",
      dueDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 40),
      status: "closed",
      evidenceClass: "verified_primary",
      evidenceRefs: ["filing:receipt:2025-12-01"],
      closedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 39),
    },
  ]);

  const now = Date.now();
  await db.insert(interactions).values([
    { stakeholderId: sGlobex.id, channel: "meeting", occurredAt: new Date(now - 7 * 86400000), sentiment: "positive" },
    { stakeholderId: sGlobex.id, channel: "email", occurredAt: new Date(now - 21 * 86400000), sentiment: "neutral" },
    { stakeholderId: sNimbus.id, channel: "call", occurredAt: new Date(now - 90 * 86400000), sentiment: "negative" },
    { stakeholderId: sDpa.id, channel: "event", occurredAt: new Date(now - 200 * 86400000), sentiment: "neutral" },
  ]);

  // --- Partner scorecards seed values (risk links) ----------------------------------
  await db.insert(partnerScorecards).values([
    {
      partnerNodeId: nimbus.id,
      deliveryQuality: "92",
      deliveryEvidenceClass: "verified_secondary",
      linkedRiskIds: [cloudRisk.id],
      notes: "Seed scorecard; recompute via /api/network/scorecards for live numbers.",
    },
    {
      partnerNodeId: payflow.id,
      deliveryQuality: "88",
      deliveryEvidenceClass: "self_reported",
      linkedRiskIds: [vendorRisk.id],
      notes: "Seed scorecard; recompute via /api/network/scorecards for live numbers.",
    },
  ]);

  return {
    nodeCount: nodes.length,
    peopleCount: 6,
    riskCount: 2,
  };
}

function edge(
  sourceId: string,
  targetId: string,
  edgeType: EdgeType,
  strength: number,
  substitutability: number,
  evidenceClass: EvidenceClass,
  evidenceRefs: string[],
) {
  return {
    sourceId,
    targetId,
    edgeType,
    strength: strength.toString(),
    substitutability: substitutability.toString(),
    evidenceClass,
    evidenceRefs,
  };
}
