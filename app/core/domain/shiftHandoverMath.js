/**
 * app/core/domain/shiftHandoverMath.js — the exact arithmetic of the Shift
 * Handover & Two-Key Readback Ledger (ADR-0223, Schema v178).
 *
 * Nothing here divides, rounds or repairs. Every count is an exact integer
 * re-derived from the rows the loader returned; the two headline claims are
 * kept apart on purpose:
 *
 *   `countsReconcile` — the rows add up: the per-state counts sum to the
 *     declared total, the per-severity counts sum to the same total, and every
 *     readback act references a brief this workspace holds.
 *   `figuresComplete` — nothing is owed right now: no overdue uncontained
 *     brief and no uncontained EMERGENCY brief. A register can be reconciled
 *     and still not be complete, and vice versa.
 */

export const SHO_MAX_INT = 1_000_000;

/** Whole days from `from` to `to`; null when either day is unreadable. */
export function shoDaysBetween(fromDay, toDay) {
  if (typeof fromDay !== 'string' || typeof toDay !== 'string') return null;
  const a = Date.parse(`${fromDay}T00:00:00.000Z`);
  const b = Date.parse(`${toDay}T00:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/**
 * The states a brief may sit in, partitioned for the count test. `cancelled`
 * is a terminal stored fact; the other three are derived from the latest
 * readback act. Counts are computed once here and consumed by the reader, the
 * CSV and the rule — one partition, no drift.
 */
export function partitionByState(stateRows) {
  const out = { contained: 0, disputed: 0, awaiting: 0, cancelled: 0, overdue: 0, emergencyUncontained: 0 };
  for (const row of stateRows) {
    if (row.state === 'contained') out.contained += 1;
    else if (row.state === 'disputed') out.disputed += 1;
    else if (row.state === 'cancelled') out.cancelled += 1;
    else out.awaiting += 1;
    if (row.overdue) out.overdue += 1;
    if (row.state !== 'contained' && row.state !== 'cancelled' && row.severity === 'emergency') out.emergencyUncontained += 1;
  }
  return out;
}

/** The two claims, computed separately and reported separately. */
export function shoClaims({ briefsTotal, perState, perSeverity, perSeverityTotal, readbacksReferenced, readbacksTotal }) {
  const perStateSum = perState.contained + perState.disputed + perState.awaiting + perState.cancelled;
  const countsReconcile = perStateSum === briefsTotal
    && perSeverityTotal === briefsTotal
    && readbacksReferenced === readbacksTotal;
  const figuresComplete = perState.overdue === 0 && perState.emergencyUncontained === 0;
  return {
    countsReconcile,
    figuresComplete,
    perStateSum,
    perSeverityTotal,
    readbacksReferenced,
    readbacksTotal,
  };
}

/** Deterministic signatures for the rule's asks and markers. */
export const shoAwaitingSignature = (briefId) => `sho1:awaiting:${String(briefId || '').trim()}`;
export const shoDisputedSignature = (briefId) => `sho1:disputed:${String(briefId || '').trim()}`;
