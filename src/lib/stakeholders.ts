// stakeholders — stakeholder intelligence + game theory.
//
// PROVENANCE: pasted "pt-O" brief names `js/stakeholders.js`. Not found in
// github.com/wbweve/Leados this session. Built from scratch.
//
// Uses the standard, citable power/interest grid (Mendelow, 1981) for
// classification, plus a textbook 2x2 simultaneous-move game (cooperate /
// compete payoff matrix, Nash-equilibrium check) per stakeholder relationship
// — standard game theory mechanics, original payoff numbers for this delivery.

import type { Stakeholder } from "./types";
import { round1 } from "./prng";

export type Quadrant = "Manage Closely" | "Keep Satisfied" | "Keep Informed" | "Monitor";

export interface StakeholderAnalysis extends Stakeholder {
  quadrant: Quadrant;
  alignmentWeight: number; // power-weighted stance contribution
}

export function classifyQuadrant(power: number, interest: number): Quadrant {
  const highPower = power >= 50;
  const highInterest = interest >= 50;
  if (highPower && highInterest) return "Manage Closely";
  if (highPower && !highInterest) return "Keep Satisfied";
  if (!highPower && highInterest) return "Keep Informed";
  return "Monitor";
}

export function analyzeStakeholders(stakeholders: Stakeholder[]): {
  analyzed: StakeholderAnalysis[];
  alignmentIndex: number; // -100..100, power-weighted average stance
} {
  const totalPower = stakeholders.reduce((s, h) => s + h.power, 0) || 1;
  const analyzed = stakeholders.map((h) => ({
    ...h,
    quadrant: classifyQuadrant(h.power, h.interest),
    alignmentWeight: round1((h.power / totalPower) * h.stance),
  }));
  const alignmentIndex = round1(analyzed.reduce((s, h) => s + h.alignmentWeight, 0));
  return { analyzed, alignmentIndex };
}

// --- Game theory: 2x2 cooperate/compete game between "us" and a stakeholder ---
// Payoff tuple = [usPayoff, themPayoff]. Classic mixed-motive structure,
// tuned (not derived) so that higher stakeholder "stance" raises their
// cooperate payoff — an original, disclosed modeling choice.
export interface GameOutcome {
  equilibrium: "mutual cooperation" | "mutual competition" | "us exploit" | "them exploit" | "no pure equilibrium";
  recommendation: string;
  payoffMatrix: { usMove: string; themMove: string; us: number; them: number }[];
}

export function stakeholderGame(stance: number): GameOutcome {
  const coopBias = stance / 100; // -1..1

  const cc: [number, number] = [6 + coopBias * 2, 6 + coopBias * 2]; // cooperate/cooperate
  const cd: [number, number] = [1, 8 + coopBias * 1]; // us cooperate, them defect
  const dc: [number, number] = [8, 1 + coopBias * 1]; // us defect, them cooperate
  const dd: [number, number] = [3, 3]; // mutual compete

  const payoffMatrix = [
    { usMove: "Cooperate", themMove: "Cooperate", us: round1(cc[0]), them: round1(cc[1]) },
    { usMove: "Cooperate", themMove: "Compete", us: round1(cd[0]), them: round1(cd[1]) },
    { usMove: "Compete", themMove: "Cooperate", us: round1(dc[0]), them: round1(dc[1]) },
    { usMove: "Compete", themMove: "Compete", us: round1(dd[0]), them: round1(dd[1]) },
  ];

  // Best-response check for pure Nash equilibria across the 2x2 grid.
  const usPrefersDefectGivenCoop = dc[0] > cc[0];
  const usPrefersDefectGivenDefect = dd[0] > cd[0];
  const themPrefersDefectGivenCoop = cd[1] > cc[1];
  const themPrefersDefectGivenDefect = dd[1] > dc[1];

  let equilibrium: GameOutcome["equilibrium"];
  let recommendation: string;

  if (!usPrefersDefectGivenCoop && !themPrefersDefectGivenCoop) {
    equilibrium = "mutual cooperation";
    recommendation = "Stable cooperative equilibrium — invest in the relationship, low risk of defection.";
  } else if (usPrefersDefectGivenDefect && themPrefersDefectGivenDefect && usPrefersDefectGivenCoop && themPrefersDefectGivenCoop) {
    equilibrium = "mutual competition";
    recommendation = "Both sides' dominant strategy is to compete — expect friction regardless of goodwill gestures.";
  } else if (usPrefersDefectGivenCoop && !themPrefersDefectGivenDefect) {
    equilibrium = "us exploit";
    recommendation = "We have leverage to extract concessions, but overplaying it will erode long-run stance.";
  } else if (!usPrefersDefectGivenCoop && themPrefersDefectGivenDefect) {
    equilibrium = "them exploit";
    recommendation = "This stakeholder has leverage over us — shore up alternatives before the next negotiation.";
  } else {
    equilibrium = "no pure equilibrium";
    recommendation = "Outcome is sensitive to timing/signaling — treat as a mixed-strategy relationship, monitor closely.";
  }

  return { equilibrium, recommendation, payoffMatrix };
}

export function stakeholderSignal(stakeholders: Stakeholder[]): number {
  const { alignmentIndex } = analyzeStakeholders(stakeholders);
  return Math.max(0, Math.min(100, (alignmentIndex + 100) / 2));
}
