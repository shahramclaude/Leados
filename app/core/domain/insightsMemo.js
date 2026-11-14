/**
 * Small render-session memo for the expensive, deterministic signal engine.
 *
 * LeadOS replaces the root state object for every committed store update. Within
 * that immutable snapshot, insight calculations are day-based, so the same
 * projection can be reused by navigation badges and the active view during
 * repeated renders. A new snapshot or calendar day always recomputes. This is
 * deliberately app-instance scoped; it is not persisted and cannot leak data
 * between workspaces.
 */
import { dayKey } from '../time.js';

export function createInsightsMemo(build) {
  if (typeof build !== 'function') throw new TypeError('An insights builder is required.');

  let previousState = null;
  let previousDay = null;
  let previousResult;

  return function getInsights(state, now) {
    const day = dayKey(now);
    if (state === previousState && day === previousDay) {
      // The engine's createdAt is display metadata, not a signal input. Keep it
      // aligned with the current render even when reusing the same daily read.
      const at = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
      for (const finding of previousResult?.findings || []) finding.createdAt = at;
      return previousResult;
    }
    previousState = state;
    previousDay = day;
    previousResult = build(state, now);
    return previousResult;
  };
}
