// Complex Adaptive Systems layer: feedback loops, bifurcation points,
// attractors. Original implementation for this delivery, designed around
// generic systems-thinking concepts (reinforcing/balancing loops, structural
// thresholds, recurring states) — not ported from any external source.
import type { Finding } from "./types";

export type Polarity = "REINFORCING" | "BALANCING";

export interface FeedbackLoop {
  id: string;
  label: string;
  polarity: Polarity;
  ruleIds: string[];
  personId?: string;
  detail: string;
}

export function identifyFeedbackLoops(findings: Finding[]): FeedbackLoop[] {
  const loops: FeedbackLoop[] = [];
  const byRule = (id: string) => findings.filter((f) => f.ruleId === id);
  const has = (id: string) => findings.some((f) => f.ruleId === id);

  // Burnout feedback loop: R4 (overtime) + R7 (burnout) on the same person.
  if (has("R4") && has("R7")) {
    const r7People = new Set(byRule("R7").map((f) => f.personId).filter(Boolean));
    for (const f of byRule("R4")) {
      if (f.personId && r7People.has(f.personId)) {
        loops.push({
          id: `BURNOUT:${f.personId}`,
          label: "Burnout feedback loop",
          polarity: "REINFORCING",
          ruleIds: ["R4", "R7"],
          personId: f.personId,
          detail: "Sustained overtime and a burnout signal are reinforcing each other for the same person.",
        });
      }
    }
    if (loops.length === 0) {
      loops.push({
        id: "BURNOUT:team",
        label: "Burnout feedback loop (team-wide)",
        polarity: "REINFORCING",
        ruleIds: ["R4", "R7"],
        detail: "Overtime and burnout signals are both active, not yet confirmed on the same individual.",
      });
    }
  }

  // Velocity death spiral: R15 + R17 + R18.
  if (has("R15") && has("R17") && has("R18")) {
    loops.push({
      id: "VELOCITY_SPIRAL",
      label: "Velocity death spiral",
      polarity: "REINFORCING",
      ruleIds: ["R15", "R17", "R18"],
      detail: "Declining velocity, recurring incidents, and on-call fatigue are compounding each other.",
    });
  }

  // Austerity trap: R8 + R13/R14.
  if (has("R8") && (has("R13") || has("R14"))) {
    loops.push({
      id: "AUSTERITY_TRAP",
      label: "Austerity trap",
      polarity: "BALANCING",
      ruleIds: ["R8", has("R13") ? "R13" : "R14"],
      detail: "Low runway is forcing cuts that may further damage the delivery capacity needed to extend runway.",
    });
  }

  // Trust collapse: R40 + R41 + R43.
  if (has("R40") && has("R41") && has("R43")) {
    loops.push({
      id: "TRUST_COLLAPSE",
      label: "Trust collapse",
      polarity: "REINFORCING",
      ruleIds: ["R40", "R41", "R43"],
      detail: "Falling psychological safety, trust erosion, and individual blame are reinforcing a culture spiral.",
    });
  }

  return loops;
}

export interface Bifurcation {
  id: string;
  label: string;
  detail: string;
}

/** Structural thresholds past which the system is modeled as behaving qualitatively differently. */
export function identifyBifurcationPoints(findings: Finding[], runwayMonths: number): Bifurcation[] {
  const points: Bifurcation[] = [];
  const has = (id: string) => findings.some((f) => f.ruleId === id);

  if (runwayMonths <= 6) {
    points.push({
      id: "RUNWAY_BIFURCATION",
      label: "Runway bifurcation (<= 6 months)",
      detail: `Runway at ${runwayMonths} months crosses the threshold where financial constraints are modeled as dominating strategic choice.`,
    });
  }
  if (has("R5")) {
    points.push({
      id: "SPAN_BIFURCATION",
      label: "Manager span bifurcation",
      detail: "Manager span of control above 8 direct reports is modeled as a point where 1:1 quality degrades structurally, not just incrementally.",
    });
  }
  const criticalCount = findings.filter((f) => f.severity === 4).length;
  if (criticalCount >= 3) {
    points.push({
      id: "SEVERITY_BIFURCATION",
      label: "Critical-mass bifurcation",
      detail: `${criticalCount} critical-severity findings are active simultaneously — modeled as a point where issues compound rather than stay independent.`,
    });
  }
  return points;
}

export interface Attractor {
  id: string;
  label: string;
  detail: string;
  occurrences: number;
}

/** States the system is modeled as "snapping back to" when a rule recurs 3+ times via the simulate-recurrence control. */
export function identifyAttractors(findings: Finding[]): Attractor[] {
  return findings
    .filter((f) => f.recurrence >= 3)
    .map((f) => ({
      id: `ATTRACTOR:${f.ruleId}${f.personId ? ":" + f.personId : ""}`,
      label: `Recurring attractor: ${f.label}`,
      detail: `${f.label} has recurred ${f.recurrence}x — modeled as a stable attractor state the org keeps returning to despite intervention.`,
      occurrences: f.recurrence,
    }));
}
