// src/lib/seed.ts — synthetic roster + synthetic raw event log.
// Original for this sandbox. The event log is the substrate for the
// information-theory layer (Shannon entropy / mutual information / SNR);
// it is deliberately separate from the Signal Board findings layer so that
// "information flow" can be measured independently of which risk rules a
// user has toggled on.
import type { Category, OrgEvent, Person } from "./types";

export const PEOPLE: Person[] = [
  { id: "p1", name: "Ana Reyes", role: "VP Engineering" },
  { id: "p2", name: "Devon Clarke", role: "Director, People" },
  { id: "p3", name: "Priya Nair", role: "Head of Finance" },
  { id: "p4", name: "Marcus Webb", role: "VP Sales" },
  { id: "p5", name: "Sofia Lund", role: "Staff Engineer" },
  { id: "p6", name: "Jamal Ibori", role: "Director, Ops" },
];

const EVENT_TYPES: { type: string; category: Category }[] = [
  { type: "decision.logged", category: "OPERATIONAL" },
  { type: "conflict.raised", category: "PEOPLE" },
  { type: "conflict.resolved", category: "PEOPLE" },
  { type: "oneOnOne.held", category: "PEOPLE" },
  { type: "goal.updated", category: "STRATEGIC" },
  { type: "org.network.edge", category: "OPERATIONAL" },
  { type: "budget.reviewed", category: "FINANCIAL" },
  { type: "audit.checked", category: "GOVERNANCE" },
  { type: "customer.feedback", category: "MARKET" },
  { type: "press.mention", category: "REPUTATIONAL" },
  { type: "incident.logged", category: "RESILIENCE" },
];

// Deterministic PRNG (mulberry32) so the seed is reproducible across loads
// until the user clicks "Reset synthetic data".
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildSeedEvents(count = 220, seed = 20260401): OrgEvent[] {
  const rnd = mulberry32(seed);
  const now = Date.now();
  const day = 86400000;
  const events: OrgEvent[] = [];
  for (let i = 0; i < count; i++) {
    const spec = EVENT_TYPES[Math.floor(rnd() * EVENT_TYPES.length)];
    const ageDays = Math.floor(rnd() * 120);
    const person = PEOPLE[Math.floor(rnd() * PEOPLE.length)];
    events.push({
      id: `ev_${i}`,
      ts: now - ageDays * day - Math.floor(rnd() * day),
      type: spec.type,
      category: spec.category,
      personId: person.id,
      direction: rnd() > 0.5 ? "in" : "out",
    });
  }
  return events.sort((a, b) => a.ts - b.ts);
}
