// src/lib/people/loadBalancer.ts
//
// Cognitive load = f(WIP, context switches, meeting load), fed from the
// Part 06 twin proxy (`src/lib/twin/workloadFeed.ts`).
//
// Team load-balancing surfaces OPTIONS, never orders: `suggestRebalance`
// returns a list of named, reversible moves a manager or the team itself can
// choose between (or reject, with the rejection captured), it never
// auto-reassigns anything.

import type { WorkloadSnapshot } from "./types";

export type LoadBand = "sustainable" | "elevated" | "high" | "critical";

export interface CognitiveLoadResult {
  personId: string;
  score: number; // 0-100
  band: LoadBand;
  drivers: { label: string; contribution: number }[];
}

const WEIGHTS = { wip: 0.4, contextSwitches: 0.35, meetingHours: 0.25 };
// Normalization ceilings — chosen as "clearly unsustainable sustained" levels, not statistical norms of any one org.
const CEILINGS = { wip: 10, contextSwitches: 12, meetingHours: 6 };

export function cognitiveLoad(snapshot: WorkloadSnapshot): CognitiveLoadResult {
  const wipNorm = Math.min(1, snapshot.wip / CEILINGS.wip);
  const switchNorm = Math.min(1, snapshot.contextSwitches / CEILINGS.contextSwitches);
  const meetingNorm = Math.min(1, snapshot.meetingHours / CEILINGS.meetingHours);

  const drivers = [
    { label: "Work in progress", contribution: Math.round(wipNorm * WEIGHTS.wip * 100) },
    { label: "Context switches", contribution: Math.round(switchNorm * WEIGHTS.contextSwitches * 100) },
    { label: "Meeting load", contribution: Math.round(meetingNorm * WEIGHTS.meetingHours * 100) },
  ];
  const score = Math.round(drivers.reduce((s, d) => s + d.contribution, 0));

  let band: LoadBand = "sustainable";
  if (score >= 80) band = "critical";
  else if (score >= 60) band = "high";
  else if (score >= 40) band = "elevated";

  return { personId: snapshot.personId, score, band, drivers };
}

export function teamCognitiveLoad(snapshots: WorkloadSnapshot[]): CognitiveLoadResult[] {
  return snapshots.map(cognitiveLoad);
}

export interface RebalanceOption {
  id: string;
  label: string;
  description: string;
  fromPersonId: string;
  toPersonId: string;
  estimatedFromDeltaPct: number; // negative = reduces load
  estimatedToDeltaPct: number; // positive = increases load
}

/**
 * Produces a menu of rebalancing OPTIONS between the most and least loaded
 * team members. This function never mutates assignments — it is read-only
 * advice. The caller (UI) must capture an explicit accept/reject decision;
 * see `development.ts`/contestation-adjacent `rejectFeedback` capture in the
 * Team Composer surface.
 */
export function suggestRebalance(loads: CognitiveLoadResult[]): RebalanceOption[] {
  if (loads.length < 2) return [];
  const sorted = [...loads].sort((a, b) => b.score - a.score);
  const overloaded = sorted.filter((l) => l.band === "high" || l.band === "critical");
  const underloaded = sorted.filter((l) => l.band === "sustainable").reverse();

  const options: RebalanceOption[] = [];
  for (const over of overloaded) {
    for (const under of underloaded.slice(0, 2)) {
      const shift = Math.min(15, Math.round((over.score - under.score) / 4));
      if (shift <= 0) continue;
      options.push({
        id: `${over.personId}->${under.personId}`,
        label: `Move ~1 work item from ${over.personId} to ${under.personId}`,
        description: `${over.personId} is at ${over.score}/100 (${over.band}); ${under.personId} is at ${under.score}/100 (${under.band}). Shifting one item is estimated to change load by roughly ${shift} points each way. This is a suggestion — either person or their manager can accept, modify, or decline it.`,
        fromPersonId: over.personId,
        toPersonId: under.personId,
        estimatedFromDeltaPct: -shift,
        estimatedToDeltaPct: shift,
      });
    }
  }
  return options;
}
