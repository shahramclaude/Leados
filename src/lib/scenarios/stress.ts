import type { StressShock } from "./types";

/**
 * Parameterized shock library — reusable stress events that can be attached
 * to any scenario's twin configuration (Part 24 brief: "parameterized
 * shocks + macro drivers" on top of Part 06's twin).
 */
export function makeShock(
  id: string,
  label: string,
  description: string,
  appliesAtTick: number,
  parameterDeltas: Record<string, number>
): StressShock {
  return { id, label, description, appliesAtTick, parameterDeltas };
}

export const SHOCK_LIBRARY: StressShock[] = [
  makeShock("shock-key-customer-churn", "Key customer churn", "A top-5 customer churns unexpectedly.", 2, {
    revenueGrowth: -0.05,
    churnRate: 0.03,
  }),
  makeShock("shock-funding-freeze", "Funding market freeze", "Capital markets tighten, extending fundraising timelines.", 3, {
    cashRunwayMonths: -4,
  }),
  makeShock("shock-key-hire-loss", "Key hire departs", "A critical early hire leaves for a competitor.", 1, {
    talentAvailability: -0.08,
    headcount: -1,
  }),
  makeShock("shock-regulatory-surprise", "Regulatory surprise", "An unanticipated regulatory action lands with no transition period.", 4, {
    regulatoryPressure: 0.25,
    cashRunwayMonths: -2,
  }),
  makeShock("shock-viral-growth", "Unplanned viral growth", "Inbound demand spikes faster than delivery capacity.", 2, {
    revenueGrowth: 0.08,
    talentAvailability: -0.05,
  }),
];

/** Compose an ad-hoc shock set by intensity, for quick wind-tunnel what-ifs. */
export function scaleShock(shock: StressShock, intensity: number): StressShock {
  const scaled: Record<string, number> = {};
  for (const [k, v] of Object.entries(shock.parameterDeltas)) scaled[k] = v * intensity;
  return { ...shock, id: `${shock.id}@${intensity}x`, parameterDeltas: scaled };
}
