// Deterministic synthetic roster + event log generator. Original to this
// delivery. Deterministic (seeded PRNG) so the self-test suite can assert
// exact numbers without flakiness.
import type { EventLogEntry, Person } from "./types";

export const ROSTER: Person[] = [
  { id: "p1", name: "Ana Reyes", role: "Staff Engineer" },
  { id: "p2", name: "Ben Oduya", role: "Engineering Manager" },
  { id: "p3", name: "Carmen Liu", role: "Product Manager" },
  { id: "p4", name: "Dev Patel", role: "Designer" },
  { id: "p5", name: "Elin Haas", role: "Finance Lead" },
  { id: "p6", name: "Faisal Noor", role: "Support Lead" },
];

const EVENT_TYPES = ["commit", "message", "meeting", "review", "ticket"] as const;

// Small mulberry32 PRNG so the synthetic log is reproducible across runs.
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

export function generateEventLog(seed = 42, days = 21): EventLogEntry[] {
  const rand = mulberry32(seed);
  const events: EventLogEntry[] = [];
  const now = Date.now();
  const day = 86400000;
  let id = 0;
  for (let d = 0; d < days; d++) {
    for (const person of ROSTER) {
      // Each person gets a variable number of events per day, biased by role,
      // so entropy / mutual-information calculations have real variety.
      const base = person.role === "Finance Lead" ? 2 : 4;
      const count = Math.floor(rand() * base) + 1;
      for (let i = 0; i < count; i++) {
        const type = EVENT_TYPES[Math.floor(rand() * EVENT_TYPES.length)];
        events.push({
          id: `ev_${id++}`,
          ts: now - d * day - Math.floor(rand() * day),
          personId: person.id,
          type,
        });
      }
    }
  }
  return events.sort((a, b) => a.ts - b.ts);
}
