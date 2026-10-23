// Seed data for the Org Design Lab / Deal Room.
//
// HONESTY NOTE: the org chart below is a demo fixture, and the entries in
// `historicalMoves` are SYNTHETIC ground truth generated from the twin's own
// formulas plus a small bounded perturbation — they exist to exercise the
// calibration pipeline end-to-end, not to claim real historical validation.
// This is declared here, in the schema comment, and in the twin model card.

import { db } from "@/db";
import {
  historicalMoves,
  maDeals,
  obligations,
  orgEdges,
  orgPeople,
  orgUnits,
  readinessChecklistItems,
  supportPlans,
  synergyEstimates,
  twinModelParameters,
} from "@/db/schema";
import { sql } from "drizzle-orm";
import { DEFAULT_TWIN_PARAMS, applyStructuralMove, predictDeliveryImpact, type GraphState, type MovePayload, type TwinUnit } from "./twinEngine";
import { generateReadinessChecklist } from "./readinessChecklist";
import { estimateSynergy } from "./synergy";

// Exported so the verify script can reconstruct the exact same graph the
// historical moves were seeded against, without duplicating fixture data.
export const historicalFixtureUnits = (): TwinUnit[] => [
  { id: 901, name: "Fixture Platform", parentId: null, headcount: 12, cycleTimeDays: 10, capacityUnits: 50 },
  { id: 902, name: "Fixture App", parentId: null, headcount: 14, cycleTimeDays: 9, capacityUnits: 55 },
  { id: 903, name: "Fixture Data", parentId: null, headcount: 10, cycleTimeDays: 11, capacityUnits: 40 },
  { id: 904, name: "Fixture Hub", parentId: null, headcount: 6, cycleTimeDays: 8, capacityUnits: 30 },
];

export const historicalFixtureEdges = () => [
  { fromUnitId: 901, toUnitId: 902, weight: 3 },
  { fromUnitId: 902, toUnitId: 903, weight: 2 },
  { fromUnitId: 901, toUnitId: 904, weight: 1 },
  { fromUnitId: 903, toUnitId: 904, weight: 1 },
];

export const HISTORICAL_FIXTURES: { label: string; move: MovePayload }[] = [
  { label: "Historical: merge Platform+App (2023 Q2)", move: { type: "merge", unitIds: [901, 902] } },
  { label: "Historical: split Data into 2 (2023 Q3)", move: { type: "split", unitId: 903, intoCount: 2 } },
  { label: "Historical: App reports to Hub (2023 Q4)", move: { type: "reporting_line_change", unitId: 902, newParentId: 904 } },
  { label: "Historical: centralize Platform+Data under Hub (2024 Q1)", move: { type: "centralize", unitIds: [901, 903, 904], hubUnitId: 904 } },
  { label: "Historical: decentralize Hub (2024 Q2)", move: { type: "decentralize", hubUnitId: 904 } },
];

export async function seedAll() {
  await db.execute(sql`truncate table
    od_org_units, od_org_people, od_org_edges, od_structural_moves, od_simulation_runs,
    od_support_plans, od_human_impact_entries, od_ma_deals, od_synergy_estimates,
    od_obligations, od_obligation_cascade_events, od_integration_difficulty_scores,
    od_readiness_checklist_items, od_scenarios, od_post_change_tracking,
    od_historical_moves, od_twin_model_parameters
    restart identity cascade`);

  // --- Org units -------------------------------------------------------
  const [engineering] = await db.insert(orgUnits).values({ name: "Engineering", kind: "division", headcount: 0, location: "Remote", costCenter: "CC-100", cycleTimeDays: 12, capacityUnits: 100 }).returning();
  const [product] = await db.insert(orgUnits).values({ name: "Product", kind: "division", headcount: 0, location: "Remote", costCenter: "CC-200", cycleTimeDays: 8, capacityUnits: 60 }).returning();
  const [platform] = await db.insert(orgUnits).values({ name: "Platform Team", kind: "team", parentId: engineering.id, headcount: 12, location: "Austin", costCenter: "CC-101", cycleTimeDays: 10, capacityUnits: 50 }).returning();
  const [app] = await db.insert(orgUnits).values({ name: "App Team", kind: "team", parentId: engineering.id, headcount: 14, location: "Austin", costCenter: "CC-102", cycleTimeDays: 9, capacityUnits: 55 }).returning();
  const [data] = await db.insert(orgUnits).values({ name: "Data Team", kind: "team", parentId: engineering.id, headcount: 10, location: "Remote", costCenter: "CC-103", cycleTimeDays: 11, capacityUnits: 40 }).returning();
  const [design] = await db.insert(orgUnits).values({ name: "Design", kind: "team", parentId: product.id, headcount: 8, location: "Remote", costCenter: "CC-201", cycleTimeDays: 7, capacityUnits: 30 }).returning();
  const [growth] = await db.insert(orgUnits).values({ name: "Growth", kind: "team", parentId: product.id, headcount: 7, location: "Remote", costCenter: "CC-202", cycleTimeDays: 6, capacityUnits: 25 }).returning();

  await db.insert(orgEdges).values([
    { fromUnitId: platform.id, toUnitId: app.id, weight: 3 },
    { fromUnitId: platform.id, toUnitId: data.id, weight: 2 },
    { fromUnitId: app.id, toUnitId: design.id, weight: 2 },
    { fromUnitId: app.id, toUnitId: growth.id, weight: 1 },
    { fromUnitId: data.id, toUnitId: growth.id, weight: 1 },
    { fromUnitId: design.id, toUnitId: growth.id, weight: 2 },
    { fromUnitId: platform.id, toUnitId: design.id, weight: 1 },
  ]);

  const peopleRows = [
    { name: "Priya Nair", unitId: platform.id, role: "Engineering Manager", title: "EM, Platform", isManager: true, uniqueSkill: false, tenureMonths: 44, flightRiskScore: 0.2 },
    { name: "Omar Siddiqui", unitId: platform.id, role: "Staff Engineer", title: "Staff Eng, Platform", isManager: false, uniqueSkill: true, tenureMonths: 61, flightRiskScore: 0.15 },
    { name: "Leah Kim", unitId: platform.id, role: "Senior Engineer", title: "Sr Eng, Platform", isManager: false, uniqueSkill: false, tenureMonths: 20, flightRiskScore: 0.3 },
    { name: "Marcus Webb", unitId: app.id, role: "Engineering Manager", title: "EM, App", isManager: true, uniqueSkill: false, tenureMonths: 38, flightRiskScore: 0.25 },
    { name: "Ines Duarte", unitId: app.id, role: "Senior Engineer", title: "Sr Eng, App", isManager: false, uniqueSkill: true, tenureMonths: 52, flightRiskScore: 0.1 },
    { name: "Tariq Malik", unitId: app.id, role: "Engineer", title: "Eng, App", isManager: false, uniqueSkill: false, tenureMonths: 14, flightRiskScore: 0.35 },
    { name: "Sofia Reyes", unitId: data.id, role: "Engineering Manager", title: "EM, Data", isManager: true, uniqueSkill: false, tenureMonths: 29, flightRiskScore: 0.22 },
    { name: "Daniel Osei", unitId: data.id, role: "Data Engineer", title: "Data Eng", isManager: false, uniqueSkill: true, tenureMonths: 33, flightRiskScore: 0.18 },
    { name: "Hana Watanabe", unitId: design.id, role: "Design Manager", title: "DM, Design", isManager: true, uniqueSkill: false, tenureMonths: 41, flightRiskScore: 0.2 },
    { name: "Carlos Mendez", unitId: design.id, role: "Senior Designer", title: "Sr Designer", isManager: false, uniqueSkill: false, tenureMonths: 25, flightRiskScore: 0.28 },
    { name: "Aisha Bello", unitId: growth.id, role: "Growth Manager", title: "GM, Growth", isManager: true, uniqueSkill: false, tenureMonths: 19, flightRiskScore: 0.33 },
    { name: "Noah Fischer", unitId: growth.id, role: "Growth Analyst", title: "Growth Analyst", isManager: false, uniqueSkill: false, tenureMonths: 11, flightRiskScore: 0.4 },
  ];
  await db.insert(orgPeople).values(peopleRows);

  // --- Support plans -----------------------------------------------------
  await db.insert(supportPlans).values([
    { name: "Redundancy Transition Support", description: "Severance guidance, outplacement coaching, extended benefits bridge.", resources: ["outplacement_coaching", "severance_review", "benefits_bridge"] },
    { name: "Manager Transition Coaching", description: "1:1 coaching for managers absorbing new reporting lines or scope changes.", resources: ["leadership_coaching", "peer_cohort"] },
    { name: "Change Navigation Coaching", description: "Group sessions and a named change buddy for employees in lower-disruption moves.", resources: ["change_buddy", "group_sessions"] },
    { name: "Relocation & Mobility Support", description: "Relocation stipend, visa/immigration support, remote-work accommodation review.", resources: ["relocation_stipend", "mobility_counsel"] },
  ]);

  // --- Twin model parameters (version 1, baseline) -----------------------
  await db.insert(twinModelParameters).values({
    version: 1,
    params: DEFAULT_TWIN_PARAMS,
    errorMargins: {
      capacityChangePct: DEFAULT_TWIN_PARAMS.capacityErrorFraction,
      cycleTimeChangeDays: DEFAULT_TWIN_PARAMS.cycleTimeErrorFraction,
      cohesion: DEFAULT_TWIN_PARAMS.cohesionErrorMargin,
    },
    notes: "Baseline coefficients, hand-set from industry rules of thumb — not yet calibrated against real reorgs.",
  });

  // --- Historical moves for calibration (synthetic ground truth) --------
  for (const [i, fixture] of HISTORICAL_FIXTURES.entries()) {
    const graph: GraphState = { units: historicalFixtureUnits(), edges: historicalFixtureEdges() };
    const { graph: afterGraph, affectedUnitIds } = applyStructuralMove(graph, fixture.move);
    const affectedUnits = afterGraph.units.filter((u) => affectedUnitIds.includes(u.id));
    const predicted = predictDeliveryImpact(DEFAULT_TWIN_PARAMS, fixture.move.type, affectedUnits.length ? affectedUnits : graph.units);

    // Deterministic bounded perturbation (not random) so results are reproducible,
    // kept inside the declared error band to demonstrate the calibration pipeline.
    const perturbFrac = 0.12 + i * 0.02; // 12%..20% of the predicted magnitude
    const actualCapacity = predicted.capacityChangePct.value * (1 + perturbFrac);
    const actualCycle = predicted.cycleTimeChangeDays.value * (1 - perturbFrac);

    await db.insert(historicalMoves).values({
      label: fixture.label,
      type: fixture.move.type,
      payload: fixture.move,
      actualCapacityChangePct: round2(actualCapacity),
      actualCycleTimeChangeDays: round2(actualCycle),
      actualCohesionChange: i % 2 === 0 ? -0.05 : 0.04,
      occurredAt: new Date(2023, i * 3, 1),
    });
  }

  // --- M&A deal + obligations + synergy + readiness ----------------------
  const [deal] = await db
    .insert(maDeals)
    .values({ name: "Project Atlas", targetCompany: "Northwind Analytics", phase: "diligence", closeDate: new Date(Date.now() + 60 * 86_400_000) })
    .returning();

  await db.insert(obligations).values([
    { name: "Northwind MSA change-of-control clause", type: "change_of_control", counterparty: "BigCloud Vendor Inc.", triggerCondition: "change_of_control", dealId: deal.id, status: "dormant" },
    { name: "Key-employee retention agreements", type: "change_of_control", counterparty: "Northwind leadership team", triggerCondition: "change_of_control", dealId: deal.id, status: "dormant" },
    { name: "Office lease assignment notice", type: "notice_period", counterparty: "Northwind landlord", triggerCondition: "phase:integrate", dealId: deal.id, status: "dormant" },
    { name: "Customer data-processing addendum", type: "vendor_contract", counterparty: "Northwind top-5 customers", triggerCondition: "phase:announce", dealId: deal.id, status: "dormant" },
  ]);

  await db.insert(synergyEstimates).values([
    (() => {
      const e = estimateSynergy({ category: "cost", baselineAnnualValue: 4_200_000, expectedPct: 12, uncertaintyPct: 6, assumptions: ["Overlap in cloud infrastructure spend", "Duplicate SaaS tooling to consolidate"] });
      return { dealId: deal.id, category: "cost", low: e.low, mid: e.value, high: e.high, confidence: e.confidence, assumptions: e.assumptions, rationale: e.rationale, method: e.method };
    })(),
    (() => {
      const e = estimateSynergy({ category: "revenue", baselineAnnualValue: 9_500_000, expectedPct: 4, uncertaintyPct: 5, assumptions: ["Cross-sell Northwind analytics into existing customer base"] });
      return { dealId: deal.id, category: "revenue", low: e.low, mid: e.value, high: e.high, confidence: e.confidence, assumptions: e.assumptions, rationale: e.rationale, method: e.method };
    })(),
    (() => {
      const e = estimateSynergy({ category: "capability", baselineAnnualValue: 2_000_000, expectedPct: 8, uncertaintyPct: 7, assumptions: ["Faster roadmap delivery from acquired ML expertise"] });
      return { dealId: deal.id, category: "capability", low: e.low, mid: e.value, high: e.high, confidence: e.confidence, assumptions: e.assumptions, rationale: e.rationale, method: e.method };
    })(),
  ]);

  const template = generateReadinessChecklist();
  await db.insert(readinessChecklistItems).values(
    template.map((t) => ({ dealId: deal.id, phase: t.phase, item: t.item, owner: t.owner, dueOffsetDays: t.dueOffsetDays })),
  );

  return {
    units: [engineering, product, platform, app, data, design, growth].map((u) => u.id),
    dealId: deal.id,
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
