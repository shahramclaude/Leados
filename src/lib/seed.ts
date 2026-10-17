// src/lib/seed.ts
//
// Deterministic synthetic roster + event log generator for this demo.
// ORIGINAL to this sandbox session. All names/events are fabricated demo
// data, clearly disclosed as such in the UI (About / Provenance view).
// Seeded (mulberry32) so the same seed always reproduces the same log —
// useful for anyone checking the Shannon entropy / mutual information
// numbers shown in the UI against this source.

import type { OrgEvent, Person } from "./types";
import { mulberry32 } from "./prng";

export const DEMO_SEED = 20260101;

export const ROSTER: Person[] = [
  { id: "me", name: "You", role: "Director of Engineering", team: "org", level: "self" },
  { id: "p1", name: "Ana Reyes", role: "Eng Manager", team: "platform", level: "direct" },
  { id: "p2", name: "Marcus Lee", role: "Eng Manager", team: "product-eng", level: "direct" },
  { id: "p3", name: "Priya Nair", role: "Staff Engineer", team: "platform", level: "direct" },
  { id: "p4", name: "Sofia Conti", role: "Design Lead", team: "product-eng", level: "direct" },
  { id: "p5", name: "Devon Ward", role: "Finance BP", team: "finance", level: "direct" },
  { id: "p6", name: "Yuki Tanaka", role: "Senior Engineer", team: "platform", level: "skip" },
  { id: "p7", name: "Omar Haddad", role: "Senior Engineer", team: "product-eng", level: "skip" },
  { id: "p8", name: "Grace Kim", role: "Product Designer", team: "product-eng", level: "skip" },
  { id: "p9", name: "Liam O'Brien", role: "SRE", team: "platform", level: "skip" },
  { id: "p10", name: "Nadia Petrov", role: "Analyst", team: "finance", level: "skip" },
];

const EVENT_TYPES = [
  "oneOnOne.held",
  "decision.logged",
  "decision.resolved",
  "goal.updated",
  "signal.raised",
  "conflict.raised",
  "conflict.resolved",
  "org.network.edge",
  "review.completed",
  "praise.given",
] as const;

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Generates ~N days of synthetic org events across the roster. Deterministic for a given seed. */
export function generateSeedEvents(seed: number = DEMO_SEED, days = 120): OrgEvent[] {
  const rand = mulberry32(seed);
  const events: OrgEvent[] = [];
  let idSeq = 1;
  const today = new Date();
  const people = ROSTER.filter((p) => p.level !== "self");
  const domains = ["people", "strategy", "ops", "finance", "product"];

  function push(daysAgo: number, type: string, data: Record<string, any>) {
    const ts = new Date(today);
    ts.setDate(ts.getDate() - daysAgo);
    events.push({ id: `ev_${idSeq++}`, type, ts: iso(ts), data });
  }

  // Baseline cadence: 1:1s, slightly irregular per person (some people slip).
  const oneOnOneGapByPerson: Record<string, number> = {
    p1: 7, p2: 14, p3: 10, p4: 7, p5: 21, // p5 (Devon) intentionally slipping
  };
  Object.entries(oneOnOneGapByPerson).forEach(([pid, gap]) => {
    for (let d = days; d >= 0; d -= gap) {
      if (rand() < 0.85) push(d, "oneOnOne.held", { personId: pid, domain: "people" });
    }
  });

  // Decisions: logged regularly, some resolved, some left stale.
  const decisionTitles = [
    "Adopt new deploy pipeline", "Reorg platform pods", "Vendor renewal: observability",
    "Hiring plan Q-next", "Pricing experiment rollback", "SLA target change",
    "Freeze non-critical migrations", "Promote Yuki to Staff", "Consolidate finance tooling",
  ];
  decisionTitles.forEach((title, i) => {
    const age = 5 + Math.floor(rand() * (days - 5));
    const domain = domains[i % domains.length];
    const decisionId = `dec_${i}`;
    push(age, "decision.logged", { decisionId, title, domain });
    // ~55% get resolved within a plausible window; rest stay open (-> DECISION_STALE candidates).
    if (rand() < 0.55) {
      const resolveAfter = Math.max(1, Math.floor(rand() * Math.min(20, age)));
      push(age - resolveAfter, "decision.resolved", { decisionId, domain });
    }
  });

  // Goals: most owned, a couple ownerless.
  const goals = [
    { title: "Reduce P1 incident count 30%", ownerId: "p1" },
    { title: "Ship v2 onboarding flow", ownerId: "p2" },
    { title: "Close platform cost gap", ownerId: undefined },
    { title: "Expand analyst coverage", ownerId: "p5" },
    { title: "Design system v3 adoption", ownerId: undefined },
  ];
  goals.forEach((g, i) => {
    push(10 + i * 9, "goal.updated", { goalId: `goal_${i}`, title: g.title, ownerId: g.ownerId, domain: "strategy" });
  });

  // Signals: sparse, occasionally recent (so findings have sources).
  const signalTitles = [
    "Deploy frequency down 35% this sprint", "Churn ticked up in SMB segment",
    "On-call page volume +2x week-over-week", "Vendor spend 18% over forecast",
  ];
  signalTitles.forEach((title, i) => {
    push(2 + i * 11, "signal.raised", { title, domain: domains[(i + 2) % domains.length], severity: 2 + (i % 3) });
  });

  // Conflicts: mostly resolved, one left open.
  const conflicts = [
    { id: "c1", personId: "p2", resolved: true },
    { id: "c2", personId: "p4", resolved: true },
    { id: "c3", personId: "p3", resolved: false },
  ];
  conflicts.forEach((c, i) => {
    const age = 18 + i * 12;
    push(age, "conflict.raised", { conflictId: c.id, personId: c.personId, domain: "people" });
    if (c.resolved) push(age - 6, "conflict.resolved", { conflictId: c.id, domain: "people" });
  });

  // Network edges: collaboration graph. Nadia (p10) intentionally sparse -> bottleneck candidate.
  const edgeWeights: Array<[string, string, number]> = [
    ["p1", "p3", 18], ["p1", "p6", 10], ["p1", "p9", 9],
    ["p2", "p4", 14], ["p2", "p7", 12], ["p2", "p8", 8],
    ["p3", "p6", 11], ["p3", "p9", 7],
    ["p4", "p8", 9],
    ["p5", "p10", 1], // sparse on purpose
    ["me", "p1", 20], ["me", "p2", 20], ["me", "p3", 10], ["me", "p4", 10], ["me", "p5", 8],
  ];
  edgeWeights.forEach(([from, to, weight]) => {
    for (let i = 0; i < weight; i++) {
      push(Math.floor(rand() * days), "org.network.edge", { fromId: from, toId: to });
    }
  });

  // Reviews + praise: general texture for entropy (adds event-type diversity).
  people.forEach((p) => {
    const reviews = 1 + Math.floor(rand() * 3);
    for (let i = 0; i < reviews; i++) {
      push(Math.floor(rand() * days), "review.completed", { personId: p.id, domain: "people" });
    }
    if (rand() < 0.6) push(Math.floor(rand() * days), "praise.given", { personId: p.id, domain: "people" });
  });

  events.sort((a, b) => a.ts.localeCompare(b.ts));
  return events;
}

export const _EVENT_TYPES_FOR_REFERENCE = EVENT_TYPES;
