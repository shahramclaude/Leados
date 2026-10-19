// Leados seed script — populates the append-only event log with a rich,
// cross-domain demonstration data set so the Signal Board, Strategy,
// Finance, Execution, Knowledge and Metrics views all have real findings
// to show. Run with: npx tsx seed.ts
import "dotenv/config";
import { db } from "./src/db";
import { events } from "./src/db/schema";
import type { NewLeadosEvent } from "./src/lib/types";

function iso(daysAgo: number, hour = 9): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

const E: NewLeadosEvent[] = [];
function add(e: NewLeadosEvent) {
  E.push(e);
}

// ───────────────────────── People ─────────────────────────
const people = [
  { id: "p-amy", name: "Amy Chen", role: "VP Engineering", performance: 88, potential: 35 },
  { id: "p-ben", name: "Ben Osei", role: "Staff Engineer", performance: 92, potential: 70 },
  { id: "p-cara", name: "Cara Lindqvist", role: "Head of Sales", performance: 60, potential: 55 },
  { id: "p-dev", name: "Dev Patel", role: "Product Manager", performance: 70, potential: 80 },
  { id: "p-ela", name: "Ela Novak", role: "Customer Success Lead", performance: 50, potential: 45 },
  { id: "p-finn", name: "Finn Walsh", role: "Finance Lead", performance: 65, potential: 50 },
];
people.forEach((p, i) =>
  add({ type: "person.added", domain: "people", entityId: p.id, ts: iso(200 - i * 5), data: { ...p, domain: "people", startDate: iso(200 - i * 5), flightRisk: 0.12 }, source: "seed" })
);

// Flight risk: Amy (high performer, low potential rating already) + Ben both get exit signals -> concentration rule.
["Had a call with a recruiter about a VP role at a competitor.", "Mentioned a counter-offer from another company during 1:1."].forEach((text, i) =>
  add({ type: "person.exit_signal", domain: "people", entityId: "p-amy", ts: iso(6 - i * 2), data: { id: "p-amy", text }, source: "seed" })
);
["Reached out to a headhunter exploring options.", "Asked about remote-work policy at other companies."].forEach((text, i) =>
  add({ type: "person.exit_signal", domain: "people", entityId: "p-ben", ts: iso(4 - i), data: { id: "p-ben", text }, source: "seed" })
);
add({ type: "person.exit_signal", domain: "people", entityId: "p-ela", ts: iso(3), data: { id: "p-ela", text: "Generally positive, no concerns raised." }, source: "seed" });

// ───────────────────────── Strategy / OKRs ─────────────────────────
add({
  type: "goal.set",
  domain: "strategy",
  entityId: "g-growth",
  ts: iso(60),
  data: {
    id: "g-growth",
    title: "Reach $10M ARR this fiscal year",
    owner: "Cara Lindqvist",
    quarterStart: iso(60),
    quarterLengthDays: 90,
    keyResults: [
      { id: "g-growth-kr1", title: "New ARR booked", target: 2500000, current: 900000, unit: "$" },
      { id: "g-growth-kr2", title: "Net revenue retention", target: 115, current: 95, unit: "%" },
    ],
  },
  source: "seed",
});
add({
  type: "goal.set",
  domain: "strategy",
  entityId: "g-platform",
  ts: iso(55),
  data: {
    id: "g-platform",
    title: "Ship the v2 platform migration",
    owner: "Amy Chen",
    quarterStart: iso(55),
    quarterLengthDays: 90,
    keyResults: [{ id: "g-platform-kr1", title: "Services migrated", target: 20, current: 16, unit: "services" }],
  },
  source: "seed",
});
for (const [day, val] of [[40, 400000], [25, 650000], [10, 820000], [1, 900000]] as [number, number][]) {
  add({ type: "goal.progress", domain: "strategy", ts: iso(day), data: { goalId: "g-growth", keyResultId: "g-growth-kr1", current: val }, source: "seed" });
}
for (const [day, val] of [[40, 8], [25, 12], [10, 15], [1, 16]] as [number, number][]) {
  add({ type: "goal.progress", domain: "strategy", ts: iso(day), data: { goalId: "g-platform", keyResultId: "g-platform-kr1", current: val }, source: "seed" });
}

// Competitor pressure (fires strategy.competitive_pressure within 14d window).
[
  { ts: 2, signal: "Launched aggressive 20% price cut on enterprise tier" },
  { ts: 5, signal: "Announced new integration marketplace" },
  { ts: 9, signal: "Poached a senior sales director" },
  { ts: 12, signal: "Published competitive-takeout case study" },
].forEach((s) => add({ type: "competitor.signal", domain: "strategy", ts: iso(s.ts), data: { competitorId: "comp-northwind", name: "Northwind Analytics", signal: s.signal, strength: 0.75 }, source: "seed" }));

add({ type: "strategy.board.note", domain: "strategy", ts: iso(3), data: { text: "Board wants a clear plan to defend enterprise accounts against Northwind.", author: "Board Chair" }, source: "seed" });

// ───────────────────────── Finance ─────────────────────────
add({
  type: "finance.snapshot",
  domain: "finance",
  ts: iso(1),
  data: {
    cash: 650000,
    monthlyBurn: 155000,
    mrr: 210000,
    newArr: 420000,
    churnedArr: 180000,
    customers: 64,
    newCustomers: 5,
    cac: 14000,
    grossMarginPct: 0.57,
    headcount: 48,
    rdHeadcountCost: 1900000,
    totalPayroll: 3600000,
    salesSpend: 70000,
  },
  source: "seed",
});

const metricSeries: Record<string, number[]> = {
  arr_growth_rate: [0.08, 0.07, 0.06, 0.05, 0.04, 0.03, 0.025, 0.02, 0.018, 0.015, 0.013],
  net_burn: [240000, 245000, 248000, 250000, 252000, 255000, 258000, 260000, 262000, 265000, 268000],
  logo_churn_rate: [0.02, 0.021, 0.023, 0.025, 0.027, 0.03, 0.032, 0.034, 0.035, 0.036, 0.038],
  nps: [41, 38, 35, 30, 26, 22, 18, 15, 12, 10, 9],
  pipeline_coverage: [3.3, 3.1, 2.9, 2.7, 2.5, 2.4, 2.3, 2.2, 2.1, 2.0, 1.9],
  deal_cycle_days: [34, 36, 38, 40, 42, 44, 46, 47, 48, 49, 50],
  support_ticket_volume: [118, 125, 132, 140, 148, 156, 162, 168, 174, 180, 188],
  headcount_growth_rate: [0.03, 0.032, 0.034, 0.036, 0.038, 0.04, 0.043, 0.046, 0.048, 0.05, 0.052],
};
Object.entries(metricSeries).forEach(([key, values]) => {
  values.forEach((value, i) => {
    add({ type: "metric.recorded", domain: "finance", ts: iso(values.length - 1 - i), data: { key, value }, source: "seed" });
  });
});

// ───────────────────────── Execution (incl. R&D + Manufacturing) ─────────────────────────
add({ type: "project.created", domain: "execution", entityId: "proj-onboarding", ts: iso(40), data: { id: "proj-onboarding", title: "Self-serve onboarding revamp", domain: "execution", owner: "Dev Patel", dependsOn: [], durationDays: 30, confidence: 0.5 }, source: "seed" });
add({ type: "project.created", domain: "execution", entityId: "proj-billing", ts: iso(35), data: { id: "proj-billing", title: "Usage-based billing engine", domain: "execution", owner: "Amy Chen", dependsOn: ["proj-onboarding"], durationDays: 45, confidence: 0.4 }, source: "seed" });
add({ type: "project.updated", domain: "execution", entityId: "proj-billing", ts: iso(2), data: { id: "proj-billing", status: "blocked" }, source: "seed" });
add({ type: "milestone.created", domain: "execution", ts: iso(20), data: { id: "m-onboarding-1", projectId: "proj-onboarding", title: "Beta launch", dueDate: iso(3) }, source: "seed" });
add({ type: "milestone.overdue", domain: "execution", ts: iso(1), data: { id: "m-onboarding-1" }, source: "seed" });
add({ type: "blocker.raised", domain: "execution", ts: iso(6), data: { id: "blk-billing-1", projectId: "proj-billing", severity: "high", description: "Waiting on payments provider API access" }, source: "seed" });

// R&D
add({ type: "project.created", domain: "rd", entityId: "proj-rd-search", ts: iso(30), data: { id: "proj-rd-search", title: "Semantic search rollout", domain: "rd", owner: "Ben Osei", dependsOn: [], durationDays: 25, confidence: 0.45 }, source: "seed" });
add({ type: "milestone.created", domain: "rd", ts: iso(18), data: { id: "m-rd-1", projectId: "proj-rd-search", title: "Model eval complete", dueDate: iso(2) }, source: "seed" });
add({ type: "milestone.overdue", domain: "rd", ts: iso(1), data: { id: "m-rd-1" }, source: "seed" });
add({ type: "blocker.raised", domain: "rd", ts: iso(4), data: { id: "blk-rd-1", projectId: "proj-rd-search", severity: "critical", description: "GPU capacity exhausted in staging cluster" }, source: "seed" });

// Manufacturing / Ops
["proj-mfg-line1", "proj-mfg-line2", "proj-mfg-qa", "proj-mfg-supply"].forEach((id, i) =>
  add({ type: "project.created", domain: "manufacturing", entityId: id, ts: iso(28 - i), data: { id, title: `Ops workstream ${i + 1}`, domain: "manufacturing", owner: "Finn Walsh", dependsOn: [], durationDays: 20, confidence: i === 0 ? 0.4 : 0.75 }, source: "seed" })
);
add({ type: "blocker.raised", domain: "manufacturing", ts: iso(5), data: { id: "blk-mfg-1", projectId: "proj-mfg-line1", severity: "critical", description: "Key supplier missed delivery window" }, source: "seed" });
add({ type: "milestone.created", domain: "manufacturing", ts: iso(15), data: { id: "m-mfg-1", projectId: "proj-mfg-line1", title: "Line 1 capacity test", dueDate: iso(2) }, source: "seed" });
add({ type: "milestone.overdue", domain: "manufacturing", ts: iso(1), data: { id: "m-mfg-1" }, source: "seed" });

// ───────────────────────── Knowledge ─────────────────────────
for (let i = 0; i < 7; i++) {
  add({
    type: "hypothesis.created",
    domain: "knowledge",
    entityId: `h-${i}`,
    ts: iso(10 - i),
    data: { id: `h-${i}`, ruleId: i % 2 === 0 ? "people.flight_risk_spike" : "execution.blocked_projects", entityId: i % 2 === 0 ? "p-amy" : "proj-billing", confidence: 0.5 + i * 0.05, resolveBy: iso(-5 + i), statement: `Hypothesis #${i} pending review` },
    source: "seed",
  });
}
// Resolve some to build a calibration history (>=5 resolutions on one rule).
[
  { id: "h-r1", ruleId: "finance.runway_critical", confidence: 0.8, outcome: "confirmed" },
  { id: "h-r2", ruleId: "finance.runway_critical", confidence: 0.7, outcome: "confirmed" },
  { id: "h-r3", ruleId: "finance.runway_critical", confidence: 0.6, outcome: "refuted" },
  { id: "h-r4", ruleId: "finance.runway_critical", confidence: 0.75, outcome: "confirmed" },
  { id: "h-r5", ruleId: "finance.runway_critical", confidence: 0.65, outcome: "confirmed" },
  { id: "h-r6", ruleId: "finance.runway_critical", confidence: 0.55, outcome: "refuted" },
].forEach((h, i) => {
  add({ type: "hypothesis.created", domain: "knowledge", entityId: h.id, ts: iso(20 - i * 2), data: { id: h.id, ruleId: h.ruleId, entityId: null, confidence: h.confidence, resolveBy: iso(10 - i), statement: `Runway risk hypothesis #${i}` }, source: "seed" });
  add({ type: "hypothesis.resolved", domain: "knowledge", entityId: h.id, ts: iso(10 - i), data: { id: h.id, outcome: h.outcome }, source: "seed" });
});

["Underpriced enterprise contracts", "Underpriced enterprise contracts", "Slow vendor onboarding"].forEach((rootCause, i) =>
  add({ type: "root_cause.logged", domain: "knowledge", ts: iso(8 - i), data: { findingId: `f-${i}`, rootCause }, source: "seed" })
);

["Renew the Northwind defense plan", "Decide on Series B timing", "Approve billing engine re-scope", "Confirm RD headcount plan for Q3"].forEach((title, i) =>
  add({ type: "decision.logged", domain: "strategy", entityId: `dec-${i}`, ts: iso(30 - i * 3), data: { id: `dec-${i}`, title, domain: "strategy" }, source: "seed" })
);

async function main() {
  console.log(`Seeding ${E.length} events...`);
  await db.execute(`truncate table events restart identity`);
  const chunkSize = 200;
  for (let i = 0; i < E.length; i += chunkSize) {
    const chunk = E.slice(i, i + chunkSize).map((e) => ({
      type: e.type,
      domain: e.domain,
      entityId: e.entityId ?? null,
      ts: new Date(e.ts),
      data: e.data as Record<string, unknown>,
      source: e.source ?? "seed",
    }));
    await db.insert(events).values(chunk);
  }
  console.log("Seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
