// OKR health scoring shared by /api/okr and the strategic intelligence layer.
//
// Health formula (as specified):
//   progress          = current_value / target_value, clamped to [0, 1]
//   daysRemaining     = end of quarter - now
//   daysTotal         = quarter duration
//   timeElapsed       = 1 - (daysRemaining / daysTotal)
//   expectedProgress  = timeElapsed
//   score             = progress / expectedProgress, clamped to [0, 1.5]
//   status: score >= 0.7 -> on_track, 0.4-0.7 -> at_risk, < 0.4 -> off_track

import type { OkrRow } from "./types";
import { toNumber } from "./types";

export interface QuarterRange {
  start: Date;
  end: Date;
  daysTotal: number;
}

/** Parse a "YYYY-Qn" string into its calendar date range. */
export function parseQuarter(quarter: string): QuarterRange {
  const match = /^(\d{4})-Q([1-4])$/.exec(quarter.trim());
  const year = match ? parseInt(match[1], 10) : new Date().getFullYear();
  const q = match ? parseInt(match[2], 10) : Math.floor(new Date().getMonth() / 3) + 1;
  const startMonth = (q - 1) * 3;
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(year, startMonth + 3, 1));
  const daysTotal = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
  return { start, end, daysTotal };
}

export interface OkrHealth {
  id: string;
  progress: number;
  expectedProgress: number;
  score: number;
  status: "on_track" | "at_risk" | "off_track";
  daysRemaining: number;
}

export function computeOkrHealth(okr: OkrRow, now: Date): OkrHealth {
  const target = toNumber(okr.targetValue, 100);
  const current = toNumber(okr.currentValue, 0);
  const progress = Math.min(1, Math.max(0, target !== 0 ? current / target : 0));

  const { end, daysTotal } = parseQuarter(okr.quarter);
  const daysRemainingRaw = Math.round((end.getTime() - now.getTime()) / 86_400_000);
  const daysRemaining = Math.max(0, daysRemainingRaw);
  const timeElapsed = Math.min(1, Math.max(0, 1 - daysRemaining / daysTotal));
  const expectedProgress = Math.max(0.0001, timeElapsed);

  const rawScore = progress / expectedProgress;
  const score = Math.min(1.5, Math.max(0, rawScore));

  let status: OkrHealth["status"] = "off_track";
  if (score >= 0.7) status = "on_track";
  else if (score >= 0.4) status = "at_risk";

  return { id: okr.id, progress, expectedProgress, score, status, daysRemaining };
}

export interface OKRHealthReport {
  totalOkrs: number;
  onTrackPct: number;
  atRiskCount: number;
  offTrackCount: number;
  nodes: (OkrRow & { health: OkrHealth })[];
}

export function buildOkrHealthReport(okrs: OkrRow[], now: Date): OKRHealthReport | null {
  if (okrs.length === 0) return null;
  const nodes = okrs.map((okr) => ({ ...okr, health: computeOkrHealth(okr, now) }));
  const onTrack = nodes.filter((n) => n.health.status === "on_track").length;
  const atRisk = nodes.filter((n) => n.health.status === "at_risk").length;
  const offTrack = nodes.filter((n) => n.health.status === "off_track").length;
  return {
    totalOkrs: nodes.length,
    onTrackPct: Math.round((onTrack / nodes.length) * 100),
    atRiskCount: atRisk,
    offTrackCount: offTrack,
    nodes,
  };
}
