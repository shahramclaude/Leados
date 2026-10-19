import type { Severity } from "./types";

export interface HypothesisCandidate {
  id: string;
  personId: string;
  type: string;
  title: string;
  sev: Severity;
  dedupeKey: string;
  createdAt: string;
}

export interface DedupeKeyed {
  dedupeKey: string;
}

export function buildFlightRiskDedupeKey(personId: string): string {
  return `${personId}:flight_risk`;
}

/**
 * Generates a flight-risk hypothesis for a person, or returns null if one
 * already exists for that exact (person, signal) pair — the dedupe key is
 * checked against every existing hypothesis before a new one is minted, so
 * calling this twice with the same inputs (and the first result folded back
 * into `existing`) never produces two hypotheses for the same finding.
 */
export function generateFlightRiskHypothesis(
  personId: string,
  personName: string,
  flightRiskScore: number,
  existing: DedupeKeyed[]
): HypothesisCandidate | null {
  if (flightRiskScore < 0.6) return null;
  const dedupeKey = buildFlightRiskDedupeKey(personId);
  if (existing.some((h) => h.dedupeKey === dedupeKey)) return null;

  const sev: Severity = flightRiskScore >= 0.85 ? 5 : flightRiskScore >= 0.7 ? 4 : 3;
  return {
    id: `hyp-${personId}-flight-risk`,
    personId,
    type: "flight_risk",
    title: `${personName} shows elevated flight-risk signals`,
    sev,
    dedupeKey,
    createdAt: new Date().toISOString(),
  };
}
