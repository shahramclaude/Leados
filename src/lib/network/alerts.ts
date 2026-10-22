// LEADOS Part 31 — key-dependency alert evaluation.
// Pure threshold logic (testable), separate from the DB write that persists
// alerts (done by the API route) and the Part 13 notification hand-off
// (represented here by the `notifyChannel` field, stand-in for a real integration).

import type { BusFactorResult, HhiResult } from "./types";

export interface DependencyAlertDraft {
  alertType: "bus_factor" | "single_source" | "concentration" | "choke_point";
  subjectRef: string;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  notifyChannel: string;
}

export const BUS_FACTOR_CRITICAL_THRESHOLD = 1;
export const BUS_FACTOR_WARNING_THRESHOLD = 2;
export const HHI_HIGH_THRESHOLD = 0.25;
export const HHI_MODERATE_THRESHOLD = 0.15;
export const SINGLE_SOURCE_SHARE_THRESHOLD = 0.9;

export function evaluateBusFactorAlert(result: BusFactorResult): DependencyAlertDraft | null {
  if (result.busFactor <= BUS_FACTOR_CRITICAL_THRESHOLD) {
    return {
      alertType: "bus_factor",
      subjectRef: result.capability,
      severity: "critical",
      message: `Capability "${result.capability}" has a bus factor of ${result.busFactor}: losing ${
        result.busFactor === 1 ? "one person" : `${result.busFactor} people`
      } would drop coverage below the required threshold (${result.requiredCapacity}).`,
      notifyChannel: "part13:inbox",
    };
  }
  if (result.busFactor <= BUS_FACTOR_WARNING_THRESHOLD) {
    return {
      alertType: "bus_factor",
      subjectRef: result.capability,
      severity: "high",
      message: `Capability "${result.capability}" has a thin bus factor of ${result.busFactor}.`,
      notifyChannel: "part13:inbox",
    };
  }
  return null;
}

export function evaluateConcentrationAlert(
  dimension: string,
  hhi: HhiResult,
): DependencyAlertDraft | null {
  // Single-source is checked first: it is the more severe, more specific
  // condition (one entity holding almost everything), and should not be
  // masked by the generic "high concentration" branch below.
  if (hhi.topShare >= SINGLE_SOURCE_SHARE_THRESHOLD) {
    return {
      alertType: "single_source",
      subjectRef: dimension,
      severity: "critical",
      message: `${dimension} is single-sourced: top entity holds ${(hhi.topShare * 100).toFixed(1)}% share.`,
      notifyChannel: "part13:inbox",
    };
  }
  if (hhi.hhi > HHI_HIGH_THRESHOLD) {
    return {
      alertType: "concentration",
      subjectRef: dimension,
      severity: "high",
      message: `${dimension} concentration HHI is ${(hhi.hhi * 100).toFixed(1)} (high band), top share ${(hhi.topShare * 100).toFixed(1)}%.`,
      notifyChannel: "part13:inbox",
    };
  }
  if (hhi.hhi > HHI_MODERATE_THRESHOLD) {
    return {
      alertType: "concentration",
      subjectRef: dimension,
      severity: "medium",
      message: `${dimension} concentration HHI is ${(hhi.hhi * 100).toFixed(1)} (moderate band).`,
      notifyChannel: "part13:inbox",
    };
  }
  return null;
}
