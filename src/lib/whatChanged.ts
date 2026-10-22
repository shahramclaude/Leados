// =============================================================================
// Part 32 — What-Changed engine (Part 14 pattern, generalized).
// =============================================================================
// Mirrors the real repo's `src/components/WhatChangedStrip.tsx`: compare a
// `localStorage` "last visit" timestamp against the audit log and surface
// only entries since then. Same mechanism, reused here as a pure function
// (`diffSinceLastVisit`) so it is unit-testable and shared between the
// cockpit strip and `ops.whatChanged`'s answer compiler.
import type { AuditEntry, OrgDataset } from "./domainData";

export const LAST_VISIT_KEY = "leados.cockpit.lastVisit";

export function diffSinceLastVisit(ds: OrgDataset, lastVisitIso: string | null): AuditEntry[] {
  if (!lastVisitIso) return [];
  const since = new Date(lastVisitIso).getTime();
  return ds.auditLog.filter((e) => new Date(e.occurredAt).getTime() > since);
}

export function readLastVisit(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(LAST_VISIT_KEY);
}

export function writeLastVisit(iso: string = new Date().toISOString()): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LAST_VISIT_KEY, iso);
}
