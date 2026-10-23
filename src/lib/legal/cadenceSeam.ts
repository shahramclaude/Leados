// Seam into Part 25's cadence engine (recurring review/alert scheduling).
//
// Part 25 owns the canonical cadence scheduler used product-wide. This module adapts that concept for
// legal obligations/renewals without re-implementing Part 25's engine: it exposes the same cadence
// vocabulary (`Cadence`) and a thin `scheduleLegalAlert` function that, in a fully wired system, would
// enqueue into Part 25's scheduler. Here it computes the next occurrence deterministically (see
// src/lib/legal/dates.ts) and returns a plain alert descriptor the UI/API can render or (later) hand to
// Part 25's real dispatcher.

import { nextCadenceOccurrence, type Cadence } from "./dates";

export interface LegalAlert {
  kind: "renewal_window" | "termination_notice" | "obligation_due" | "obligation_breach_risk";
  dueAt: Date;
  severity: "info" | "warning" | "critical";
  message: string;
}

export function scheduleLegalAlert(params: {
  kind: LegalAlert["kind"];
  anchor: Date;
  cadence?: Cadence;
  now: Date;
  message: string;
  severity?: LegalAlert["severity"];
}): LegalAlert {
  const dueAt = params.cadence
    ? nextCadenceOccurrence(params.anchor, params.cadence, params.now)
    : params.anchor;
  return {
    kind: params.kind,
    dueAt,
    severity: params.severity ?? "info",
    message: params.message,
  };
}

export function daysUntil(now: Date, target: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.ceil((target.getTime() - now.getTime()) / msPerDay);
}
