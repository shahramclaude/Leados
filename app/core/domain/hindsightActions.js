/**
 * app/core/domain/hindsightActions.js — commands and scoped adapters for the
 * Hindsight Lock (ADR-0102).
 *
 * Reads are pure adapters and are safe under a declared seat. The writes are:
 *
 *   lock            freeze one decision's information set now (the spine also
 *                   does this automatically for every decision, bounded)
 *   scan            re-audit every lock and let the spine open its bounded work
 *   set conventions the quality floor, coverage share, fact/gap/settled floors,
 *                   cell floor and review grace — clamped, director+, full access
 *
 * No write here edits a decision, rewrites a lock, closes a human decision,
 * rates a person or sends anything. A lock is append-only evidence.
 */
import { activeSeat, buildSeats, canAct } from './seat.js';
import {
  buildHindsightReport,
  buildLockRecord,
  hindsightAttentionCount,
  hindsightBriefText,
  hindsightCsvRows,
} from './hindsight.js';
import { hindsightConventions, normalizeHindsightSettings } from './hindsightSchema.js';
import { HINDSIGHT_EVENTS, HINDSIGHT_LIMITS } from './hindsightRegistry.js';

export function createHindsightActions(store, { now, idFactory }) {
  const fail = (error, field = null) => ({ ok: false, error, ...(field ? { field } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date());
  const settings = () => store.state.settings || {};
  const saved = (extra = {}) => ({
    ok: true,
    ...extra,
    saved: !store.persistError,
    warning: store.persistError || null,
    propagations: store.lastPropagations || [],
  });
  const report = () => buildHindsightReport(store.state, { now: clock(), settings: settings() });

  const seatFor = (right) => {
    const built = buildSeats(store.state, { now: clock(), settings: settings() });
    const seat = activeSeat(built);
    if (seat.readOnly) {
      return { ok: false, error: 'The declared seat is unresolved and read-only. Choose a valid seat before freezing or auditing a decision lock.' };
    }
    const verdict = canAct(right, seat);
    return verdict.allow ? { ok: true, seat } : { ok: false, error: verdict.reason };
  };

  return {
    hindsightReport() {
      return report();
    },

    hindsightBriefText() {
      return hindsightBriefText(report());
    },

    hindsightCsvRows() {
      const current = report();
      if (!current.ok) return current;
      return {
        ok: true,
        rows: hindsightCsvRows(current),
        summary: {
          locks: current.summary.locksN,
          graded: current.summary.settledN,
          resulted: current.quadrants.resultedN,
        },
      };
    },

    hindsightAttentionCount() {
      return hindsightAttentionCount(store.state, { now: clock(), settings: settings() });
    },

    hindsightConventions() {
      return hindsightConventions(settings());
    },

    hindsightSettings() {
      return { ...normalizeHindsightSettings(settings()) };
    },

    /**
     * Freeze one decision's information set by hand. The spine locks every
     * decision automatically, so this exists for the case the paper record
     * matters most: a decision being reopened after the fact, where the reader
     * wants the set frozen before they touch a single field.
     */
    hindsightLock({ decisionId } = {}) {
      const right = seatFor('record-decision-lock');
      if (!right.ok) return fail(right.error);
      if (!decisionId) return fail('Choose the decision whose information set to freeze.', 'decisionId');
      const decision = (store.state.decisions || []).find((row) => row && row.id === decisionId);
      if (!decision) return fail('That decision is not in this workspace.', 'decisionId');
      const existing = (store.state.decisionLocks || []).find((lock) => lock && lock.decisionId === decisionId);
      if (existing) return saved({ id: existing.id, existing: true, report: report() });
      if ((store.state.decisionLocks || []).length >= HINDSIGHT_LIMITS.locks) {
        return fail(`The lock ledger is full at ${HINDSIGHT_LIMITS.locks} locks. Export the aggregate audit before freezing another.`);
      }
      const nowValue = clock();
      const built = buildLockRecord(store.state, decision, {
        id: idFactory('lock'),
        now: nowValue,
        settings: settings(),
        seatId: right.seat && right.seat.id ? right.seat.id : null,
      });
      if (!built.ok) return fail(built.error);
      store.update((draft) => {
        draft.decisionLocks = Array.isArray(draft.decisionLocks) ? draft.decisionLocks : [];
        draft.decisionLocks.push(built.lock);
      }, {
        type: HINDSIGHT_EVENTS.LOCKED,
        entity: 'hindsightlock',
        entityId: built.lock.id,
        summary: `Froze the information set of a decision dated ${built.lock.decisionOn}: ${built.lock.consultedN} consulted fact(s), process ${built.lock.qualityMet}/5`,
      });
      return saved({ id: built.lock.id, existing: false, report: report() });
    },

    hindsightScan() {
      const right = seatFor('record-decision-lock');
      if (!right.ok) return fail(right.error);
      store.update(() => {},  {
        type: HINDSIGHT_EVENTS.SCAN,
        entity: right.seat.fullAccess ? 'workspace' : 'hindsight',
        entityId: right.seat.fullAccess ? 'all' : right.seat.id,
        summary: 'Explicitly re-audited every decision lock, re-measured the information sets and opened the bounded work the spine owns',
      });
      return saved({ report: report() });
    },

    hindsightSetConventions(patch = {}) {
      const right = seatFor('govern-hindsight');
      if (!right.ok) return fail(right.error);
      if (!right.seat.fullAccess) {
        return fail('Changing the process-audit conventions re-prices every quadrant and every rate in the workspace. Only a full-access seat may declare them.');
      }
      const before = normalizeHindsightSettings(settings());
      const merged = normalizeHindsightSettings({ ...before, ...(patch || {}) });
      const changed = Object.keys(merged).filter((key) => merged[key] !== before[key]);
      if (!changed.length) return saved({ changed: [], report: report() });
      store.update((draft) => {
        if (!draft.settings) draft.settings = {};
        Object.assign(draft.settings, merged);
      }, {
        type: HINDSIGHT_EVENTS.CONVENTIONS,
        entity: 'hindsight',
        entityId: 'conventions',
        summary: `Changed hindsight-lock conventions: ${changed.map((key) => `${key}=${merged[key]}`).join(', ')}`,
      });
      return saved({ changed, report: report() });
    },
  };
}
