/**
 * src/lib/seedData.ts — synthetic event generator.
 *
 * DISCLOSURE: every event produced here is synthetic demonstration data,
 * not real organizational data. It exists to (a) seed a fresh database so
 * the cockpit/intelligence views have something to show, and (b) give the
 * health suite and rule engine realistic events to evaluate against. All
 * events are stamped `meta.seeded = true`.
 */

import type { LeadosEvent } from "./types";

function daysAgoIso(now: Date, n: number, hour = 9): string {
  const d = new Date(now.getTime() - n * 86400000);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

let seq = 0;
function nextId(): string {
  seq += 1;
  return "e-" + String(seq).padStart(6, "0");
}

function ev(now: Date, type: string, data: Record<string, any>, daysAgo: number): LeadosEvent {
  return { id: nextId(), ts: daysAgoIso(now, daysAgo), type, data, meta: { seeded: true } };
}

/**
 * buildBaselineDataset — a curated, realistic-looking (but fabricated)
 * event log covering all 8 domains, tuned so a healthy majority of the
 * 48 rules + several causal cascades actually fire for demo purposes.
 */
export function buildBaselineDataset(now: Date): LeadosEvent[] {
  const events: LeadosEvent[] = [];
  const push = (type: string, data: Record<string, any>, daysAgo: number) => events.push(ev(now, type, data, daysAgo));

  // ---- People & reporting lines (one broken line, one overloaded manager) ----
  push("person.added", { id: "p-ceo", name: "Dana Reyes", title: "CEO", reportsTo: null, createdAt: daysAgoIso(now, 900) }, 900);
  push("person.added", { id: "p-vpe", name: "Marcus Lin", title: "VP Engineering", reportsTo: "p-ceo", createdAt: daysAgoIso(now, 500) }, 500);
  push("person.added", { id: "p-vps", name: "Priya Shah", title: "VP Sales", reportsTo: "p-ceo", createdAt: daysAgoIso(now, 400) }, 400);
  push("person.added", { id: "p-vpcs", name: "Noah Weiss", title: "VP Customer Success", reportsTo: "p-ceo", createdAt: daysAgoIso(now, 380) }, 380);
  const engIds = ["p-eng1", "p-eng2", "p-eng3", "p-eng4", "p-eng5", "p-eng6", "p-eng7", "p-eng8", "p-eng9"];
  engIds.forEach((id, i) => push("person.added", { id, name: `Engineer ${i + 1}`, title: "Engineer", reportsTo: "p-vpe", createdAt: daysAgoIso(now, 200 - i * 5) }, 200 - i * 5));
  push("person.added", { id: "p-sales1", name: "Alicia Cruz", title: "AE", reportsTo: "p-vps", createdAt: daysAgoIso(now, 150) }, 150);
  push("person.added", { id: "p-sales2", name: "Tom Becker", title: "AE", reportsTo: "p-vps", createdAt: daysAgoIso(now, 30) }, 30);
  push("person.added", { id: "p-cs-lead", name: "Riley Fox", title: "CS Lead", reportsTo: "p-vpcs", createdAt: daysAgoIso(now, 120) }, 120);
  push("person.added", { id: "p-ghost", name: "Ravi Desai", title: "Contractor PM", reportsTo: "p-missing", createdAt: daysAgoIso(now, 90) }, 90);
  push("person.added", { id: "p-idle-lead", name: "Jamie Park", title: "Director of Ops", reportsTo: "p-ceo", createdAt: daysAgoIso(now, 250) }, 250);

  // ---- 1:1 cadence (most people current, one slipping badly, one flight risk) ----
  for (const id of ["p-vpe", "p-vps", "p-vpcs", "p-eng1", "p-eng2", "p-sales1", "p-cs-lead"]) {
    push("people.oneonone.logged", { personId: id }, 5);
    push("people.oneonone.logged", { personId: id }, 12);
  }
  // p-eng3 slipping (last 1:1 35 days ago)
  push("people.oneonone.logged", { personId: "p-eng3" }, 35);
  // flight-risk candidate: p-eng4 — stale goal, no recent commitment, negative sentiment, 1:1 gap
  push("people.oneonone.logged", { personId: "p-eng4" }, 40);
  push("people.sentiment.logged", { personId: "p-eng4", polarity: "negative" }, 10);

  // ---- Morale pulses (declining) ----
  push("people.pulse.logged", { personId: "p-eng1", mood: 2 }, 5);
  push("people.pulse.logged", { personId: "p-eng2", mood: 2 }, 10);
  push("people.pulse.logged", { personId: "p-eng3", mood: 1 }, 15);
  push("people.pulse.logged", { personId: "p-eng4", mood: 2 }, 20);

  // ---- Goals ----
  push("goal.set", { id: "g1", title: "Ship v2 onboarding", domain: "operations", ownerId: "p-eng1" }, 65);
  push("goal.progress", { goalId: "g1" }, 60);
  push("goal.progress", { goalId: "g1" }, 45);
  push("goal.progress", { goalId: "g1" }, 10);

  push("goal.set", { id: "g2", title: "Expand EU pipeline", domain: "strategy", ownerId: "p-sales1" }, 14);
  push("goal.progress", { goalId: "g2" }, 12);
  push("goal.progress", { goalId: "g2" }, 6);
  push("goal.progress", { goalId: "g2" }, 1);

  push("goal.set", { id: "g3", title: "Rework comp bands", domain: "people", ownerId: null }, 50); // ownerless
  push("goal.set", { id: "g4", title: "Vendor consolidation", domain: "operations", ownerId: "p-vpe" }, 70); // silent
  push("goal.set", { id: "g5", title: "Q3 security review", domain: "compliance", ownerId: "p-eng2", deadline: daysAgoIso(now, -5) }, 40);
  push("goal.closed", { goalId: "g5", result: "success" }, 10);
  push("goal.set", { id: "g6", title: "Rebrand launch", domain: "strategy", ownerId: "p-sales2" }, 90);
  push("goal.closed", { goalId: "g6", result: "missed" }, 50);
  push("goal.set", { id: "g7", title: "Unowned strategy bet", domain: "strategy", ownerId: null }, 20);
  push("goal.set", { id: "g8", title: "Platform migration", domain: "strategy", ownerId: "p-vpe" }, 95);
  push("goal.closed", { goalId: "g8", result: "missed" }, 20);
  push("goal.set", { id: "g9", title: "Pricing experiment", domain: "strategy", ownerId: "p-vps" }, 85);
  push("goal.closed", { goalId: "g9", result: "missed" }, 15);

  // ---- Decisions (several stale, one domain paralyzed, escalations) ----
  push("decision.logged", { id: "d1", title: "Switch payroll vendor", domain: "operations" }, 40);
  push("decision.outcome", { decisionId: "d1", outcome: "approved" }, 35);
  push("decision.logged", { id: "d2", title: "Expand EU entity", domain: "strategy" }, 60);
  push("decision.logged", { id: "d3", title: "Re-platform billing", domain: "strategy" }, 45);
  push("decision.logged", { id: "d4", title: "Consolidate vendors", domain: "strategy" }, 30);
  push("decision.logged", { id: "d5", title: "New comp bands", domain: "strategy" }, 25);
  for (let i = 0; i < 7; i++) {
    push("decision.logged", { id: `d-old-${i}`, title: `Deferred decision ${i}`, domain: "operations" }, 20 + i);
  }
  for (let i = 0; i < 4; i++) {
    push("decision.escalate", { decisionId: `d-old-${i}` }, 6 + i);
  }

  // ---- Commitments (several overdue) ----
  push("commitment.made", { id: "c1", ownerId: "p-eng1", desc: "Ship migration plan", by_date: daysAgoIso(now, 5) }, 20);
  push("commitment.made", { id: "c2", ownerId: "p-vps", desc: "Close enterprise deal", by_date: daysAgoIso(now, 12) }, 25);
  push("commitment.made", { id: "c3", ownerId: "p-eng4", desc: "Fix flaky deploy pipeline", by_date: daysAgoIso(now, 2) }, 15);
  push("commitment.made", { id: "c4", ownerId: "p-cs-lead", desc: "Renewal save plan", by_date: daysAgoIso(now, -3) }, 10);
  push("commitment.resolved", { commitmentId: "c4" }, 2);

  // ---- Operations ----
  push("info.pipeline.check", { name: "lead-gen", blocked: true }, 10);
  push("info.pipeline.check", { name: "support-queue", blocked: false }, 5);
  for (let i = 0; i < 5; i++) push("ops.incident.logged", { summary: `Incident ${i}` }, 2 + i);
  for (let i = 0; i < 6; i++) push("ops.process.debt", { item: `debt-${i}`, resolved: false }, 10 + i * 5);
  push("ops.throughput.snapshot", { value: 120 }, 45);
  push("ops.throughput.snapshot", { value: 118 }, 35);
  push("ops.throughput.snapshot", { value: 85 }, 15);
  push("ops.throughput.snapshot", { value: 80 }, 5);
  push("ops.sla.breach", { ticket: "T-1" }, 3);
  push("ops.sla.breach", { ticket: "T-2" }, 6);
  push("ops.sla.breach", { ticket: "T-3" }, 9);

  // ---- R&D ----
  for (let i = 0; i < 12; i++) push("rd.tech_debt.logged", { item: `td-${i}`, personId: "p-eng1" }, 2 + i * 2);
  push("rd.feature.shipped", { name: "feature-a" }, 70);
  push("rd.feature.shipped", { name: "feature-b" }, 55);
  push("rd.feature.shipped", { name: "feature-c" }, 40);
  push("rd.feature.shipped", { name: "feature-d" }, 10);
  for (let i = 0; i < 18; i++) push("rd.bug.logged", { id: `bug-${i}`, personId: "p-eng1" }, 1 + i);
  for (let i = 0; i < 4; i++) push("rd.bug.resolved", { id: `bug-${i}` }, 1 + i);
  push("rd.release.shipped", { version: "1.0" }, 95);
  push("rd.release.shipped", { version: "1.1" }, 92);
  push("rd.arch.decision.logged", { id: "arch-1", resolved: false }, 25);

  // ---- Compliance ----
  push("compliance.audit.finding", { auditId: "aud-1", summary: "Access control gap" }, 20);
  push("compliance.policy.review", { gapFound: true, regulatory: true }, 15);
  push("compliance.training.due", { personId: "p-eng2" }, 40);
  push("compliance.license.logged", { name: "SOC2 cert", expiryDate: daysAgoIso(now, -10) }, 100);
  push("compliance.regulation.update", { id: "reg-1" }, 20);
  push("ops.incident.logged", { summary: "Data exposure near-miss" }, 10);

  // ---- Manufacturing ----
  push("manufacturing.yield.snapshot", { pct: 88, target: 95 }, 5);
  push("manufacturing.downtime.logged", { hours: 9 }, 8);
  push("manufacturing.supply.snapshot", { riskLevel: "critical", vendor: "Acme Co" }, 12);
  push("manufacturing.quality.escape", { customerImpacting: true }, 6);
  push("manufacturing.capacity.snapshot", { utilizationPct: 96, affectsDelivery: true }, 4);
  push("manufacturing.maintenance.due", { assetId: "line-1", scheduledWindowEnd: daysAgoIso(now, 5) }, 20);

  // ---- Customer Success ----
  push("cs.nps.snapshot", { score: 42 }, 90);
  push("cs.nps.snapshot", { score: 38 }, 60);
  push("cs.nps.snapshot", { score: 30 }, 30);
  push("cs.nps.snapshot", { score: -2 }, 5);
  push("cs.churn.logged", { rate: 9, expectedRate: 3 }, 5);
  push("cs.escalation.logged", { accountId: "acct-1" }, 10);
  push("cs.health.score", { accountId: "acct-1", score: 40, keyAccount: true }, 50);
  push("cs.health.score", { accountId: "acct-1", score: 25, keyAccount: true }, 10);
  push("cs.renewal.logged", { accountId: "acct-2", probability: 0.3 }, 3);
  push("cs.onboarding.logged", { accountId: "acct-3", daysSinceStart: 120, progressPct: 30 }, 1);

  // ---- Finance ----
  push("finance.runway.snapshot", { months: 4.2 }, 1);
  push("finance.burn.snapshot", { amount: 180000 }, 30);
  push("finance.burn.snapshot", { amount: 190000 }, 60);
  push("finance.period.snapshot", { period: "2026-Q1", growthPct: 12, grossMarginPct: 58, netBurn: 500000, netNewARR: 120000, periodType: "quarterly" }, 90);
  push("finance.period.snapshot", { period: "2026-Q2", growthPct: 9, grossMarginPct: 55, netBurn: 520000, netNewARR: 90000, periodType: "quarterly" }, 1);
  push("finance.cac.snapshot", { paybackMonths: 26 }, 15);
  push("finance.customer.revenue_share", { customerId: "Acme Corp", pct: 44 }, 10);
  push("settings.updated", { key: "grossMarginFloorPct", value: 60 }, 200);

  // ---- Culture / wins (for leadership energy balance) ----
  push("culture.signal", { polarity: "positive" }, 4);
  push("culture.signal", { polarity: "positive" }, 9);

  return events;
}

/**
 * generateSyntheticEvents — used by health checks. Without `count`,
 * returns the curated baseline dataset. With `count`, pads the baseline
 * with cheap filler events (for performance testing at scale, e.g. the
 * T_CAUSAL_INFERENCE_STABLE check at 1000 events).
 */
export function generateSyntheticEvents(now: Date, count?: number): LeadosEvent[] {
  const base = buildBaselineDataset(now);
  if (!count || count <= base.length) return base;
  const filler: LeadosEvent[] = [];
  const fillerTypes = ["ops.incident.logged", "rd.bug.logged", "people.pulse.logged", "cs.nps.snapshot"];
  for (let i = base.length; i < count; i++) {
    const type = fillerTypes[i % fillerTypes.length];
    filler.push(ev(now, type, { id: `filler-${i}`, personId: "p-eng1", mood: 3, score: 20 }, i % 120));
  }
  return [...base, ...filler];
}
