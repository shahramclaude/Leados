// ---------------------------------------------------------------------------
// src/lib/obligationTracker.ts
//
// Stand-in for Part 29's obligation tracker, reused here to track disclosure
// deadlines (e.g. "CSRD E1 Climate disclosure due") and link them to the
// disclosure pack that satisfies them, the same way Part 29 links a
// compliance obligation to the artifact that closes it out.
// ---------------------------------------------------------------------------

export type ObligationStatus = "open" | "in-progress" | "satisfied" | "overdue";

export interface ObligationRecord {
  id: string;
  name: string;
  standard: string;
  dueDate: string; // ISO date
  linkedPackId: string | null;
}

/**
 * Derive obligation status from due date + whether a disclosure pack has been
 * linked, rather than storing status as an independently-editable field —
 * this prevents an obligation being marked "satisfied" without an actual
 * evidence-linked pack behind it.
 */
export function deriveObligationStatus(obligation: ObligationRecord, today: Date): ObligationStatus {
  const due = new Date(obligation.dueDate);
  if (obligation.linkedPackId) return "satisfied";
  if (today.getTime() > due.getTime()) return "overdue";
  const daysToDue = (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
  if (daysToDue <= 30) return "in-progress";
  return "open";
}

export interface ObligationView extends ObligationRecord {
  status: ObligationStatus;
  daysToDue: number;
}

export function projectObligations(obligations: ObligationRecord[], today: Date = new Date()): ObligationView[] {
  return obligations
    .map((o) => ({
      ...o,
      status: deriveObligationStatus(o, today),
      daysToDue: Math.round((new Date(o.dueDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)),
    }))
    .sort((a, b) => a.daysToDue - b.daysToDue);
}
