// src/lib/people/compensation.ts
//
// Transparent compensation bands + gap analysis. Individual pay is only ever
// returned for the subject themselves (enforced by `peopleScope.ts`, not by
// this module alone — this module additionally refuses to compute any
// cross-person aggregate below the k-anonymity threshold, as defense in
// depth).

import { kAnonymitySuppress } from "../intelligence/fairness/metrics";

export interface CompensationBand {
  id: string;
  roleId: string;
  level: number;
  min: number;
  mid: number;
  max: number;
  currency: string;
}

export interface EmployeeCompensation {
  employeeId: string;
  bandId: string;
  currentPay: number;
}

export interface CompensationGap {
  employeeId: string;
  bandId: string;
  currentPay: number;
  bandMin: number;
  bandMid: number;
  bandMax: number;
  positionInBandPct: number; // 0 = at min, 100 = at max, can exceed [0,100] if off-band
  gapToMidAbs: number;
  gapToMidPct: number;
}

export function computeGap(comp: EmployeeCompensation, band: CompensationBand): CompensationGap {
  const span = band.max - band.min || 1;
  const positionInBandPct = Math.round(((comp.currentPay - band.min) / span) * 1000) / 10;
  const gapToMidAbs = Math.round(band.mid - comp.currentPay);
  const gapToMidPct = Math.round((gapToMidAbs / band.mid) * 1000) / 10;
  return {
    employeeId: comp.employeeId,
    bandId: band.id,
    currentPay: comp.currentPay,
    bandMin: band.min,
    bandMid: band.mid,
    bandMax: band.max,
    positionInBandPct,
    gapToMidAbs,
    gapToMidPct,
  };
}

export interface BandAggregate {
  bandId: string;
  n: number;
  meanPositionInBandPct: number | null;
  suppressed: boolean;
  suppressionReason: string | null;
}

/**
 * Org-level-only aggregate of where a group sits in its band. Refuses to
 * render (returns `suppressed: true`, no numbers) below the k-anonymity
 * threshold (default 5) — this is enforced here as well as at the API/scope
 * layer so it is safe even if called directly.
 */
export function bandAggregate(bandId: string, gaps: CompensationGap[], k = 5): BandAggregate {
  const result = kAnonymitySuppress(gaps.length, k);
  if (result.suppressed) {
    return { bandId, n: gaps.length, meanPositionInBandPct: null, suppressed: true, suppressionReason: result.reason };
  }
  const mean = gaps.reduce((s, g) => s + g.positionInBandPct, 0) / gaps.length;
  return { bandId, n: gaps.length, meanPositionInBandPct: Math.round(mean * 10) / 10, suppressed: false, suppressionReason: null };
}

export const SEED_BANDS: CompensationBand[] = [
  { id: "band-eng-2", roleId: "backend-engineer-ii", level: 2, min: 95000, mid: 110000, max: 125000, currency: "USD" },
  { id: "band-eng-3", roleId: "backend-engineer-iii", level: 3, min: 120000, mid: 140000, max: 160000, currency: "USD" },
  { id: "band-tl", roleId: "tech-lead", level: 4, min: 145000, mid: 165000, max: 185000, currency: "USD" },
  { id: "band-em", roleId: "engineering-manager", level: 4, min: 150000, mid: 170000, max: 190000, currency: "USD" },
  { id: "band-de-2", roleId: "data-engineer-ii", level: 2, min: 98000, mid: 112000, max: 126000, currency: "USD" },
  { id: "band-mle", roleId: "ml-engineer", level: 3, min: 125000, mid: 145000, max: 165000, currency: "USD" },
  { id: "band-pm-2", roleId: "product-manager-ii", level: 2, min: 105000, mid: 120000, max: 135000, currency: "USD" },
  { id: "band-pd-2", roleId: "product-designer-ii", level: 2, min: 100000, mid: 115000, max: 130000, currency: "USD" },
];
