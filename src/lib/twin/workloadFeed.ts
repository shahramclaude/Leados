// src/lib/twin/workloadFeed.ts
//
// PART 06 PROXY: this repository snapshot does not contain the Part 04/06
// "digital twin" simulation yet. This module defines the minimal feed shape
// Part 09's cognitive-load model needs (WIP, context switches, meeting load)
// behind the same function signature a real twin feed would expose, so this
// is a drop-in replacement point, not a permanent substitute.
//
// The generator is a deterministic pseudo-random function of
// (personId, date) — no wall-clock randomness — so fairness tests and
// workload demos are reproducible.

import type { WorkloadSnapshot } from "../people/types";
import { rngFor } from "../shared/prng";

/** Deterministic synthetic workload reading for a person on a given date. Stand-in for Part 06's twin feed. */
export function getWorkloadSnapshot(personId: string, date: string, baseline: "low" | "typical" | "high" = "typical"): WorkloadSnapshot {
  const rand = rngFor(`${personId}:${date}`);
  const baselineWip = { low: 2, typical: 4, high: 7 }[baseline];
  const wip = Math.max(0, Math.round(baselineWip + (rand() - 0.5) * 4));
  const contextSwitches = Math.max(0, Math.round(wip * 1.5 + (rand() - 0.5) * 3));
  const meetingHours = Math.max(0, Math.round((2 + (rand() - 0.3) * 4) * 10) / 10);
  return { personId, date, wip, contextSwitches, meetingHours, source: "twin-proxy" };
}

export function getWorkloadHistory(personId: string, days: number, endDate: Date = new Date(), baseline: "low" | "typical" | "high" = "typical"): WorkloadSnapshot[] {
  const out: WorkloadSnapshot[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(endDate);
    d.setDate(d.getDate() - i);
    out.push(getWorkloadSnapshot(personId, d.toISOString().slice(0, 10), baseline));
  }
  return out;
}
