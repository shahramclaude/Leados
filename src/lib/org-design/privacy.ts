// Self-visibility privacy rules for the Human-Impact Ledger.
//
// Policy: a person sees their own status before any org-wide announcement.
// Nobody else (other employees) can see an individual's entry before the
// announcement; after announcement, detail becomes visible to employees.
// Admin/HR roles (who own support-plan execution) can always see detail —
// that is a distinct, audited access path from the "org-wide" broadcast.

import type { HumanImpactLedgerEntry } from "./types";

export type LedgerEntryRecord = HumanImpactLedgerEntry & {
  id: number;
  simulationRunId: number;
  visibleToSelfAt: string;
  announcedOrgWideAt: string | null;
};

export type Viewer = { role: "admin" } | { role: "employee"; personId: number };

export function canViewEntryDetail(entry: LedgerEntryRecord, viewer: Viewer): boolean {
  if (viewer.role === "admin") return true;
  if (viewer.personId === entry.personId) return true; // self-first, always
  return entry.announcedOrgWideAt != null; // org-wide reveal gate
}

export type AttemptResult = { label: string; allowed: boolean; expected: boolean; pass: boolean };

/**
 * Runs the full attempt matrix for a single entry and returns a pass/fail
 * table — used both by the UI (admin-facing privacy self-check) and by the
 * verify script's gate 3.
 */
export function runPrivacyAttemptMatrix(entry: LedgerEntryRecord, otherPersonId: number): AttemptResult[] {
  const attempts: { label: string; viewer: Viewer; expected: boolean }[] = [
    { label: "subject views own entry (pre-announcement)", viewer: { role: "employee", personId: entry.personId }, expected: true },
    { label: "other employee views entry (pre-announcement)", viewer: { role: "employee", personId: otherPersonId }, expected: entry.announcedOrgWideAt != null },
    { label: "admin views entry (pre-announcement)", viewer: { role: "admin" }, expected: true },
  ];

  return attempts.map((a) => {
    const allowed = canViewEntryDetail(entry, a.viewer);
    return { label: a.label, allowed, expected: a.expected, pass: allowed === a.expected };
  });
}

/** Aggregate-only projection — safe to show org-wide before individual announcement. */
export function aggregateOnly(entries: Pick<HumanImpactLedgerEntry, "disruptionClass" | "roleChangeType">[]) {
  const byDisruptionClass: Record<string, number> = {};
  for (const e of entries) {
    byDisruptionClass[e.disruptionClass] = (byDisruptionClass[e.disruptionClass] ?? 0) + 1;
  }
  return { totalAffected: entries.length, byDisruptionClass };
}
