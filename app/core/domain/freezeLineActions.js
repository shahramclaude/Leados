/**
 * app/core/domain/freezeLineActions.js — commands and scoped adapters for the
 * Freeze-Line Continuity Audit (ADR-0099).
 *
 * Reads are pure adapters. The only writes are: freeze a continuity reading for
 * a crossed freeze line, and run an explicit scan. Neither changes a reporting
 * line, sends a message, closes a decision, or touches any measured channel.
 */
import { dayKey } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import {
  buildFreezeLineReport,
  buildFreezeReading,
  freezeLineAttentionCount,
  freezeLineBriefText,
  freezeLineCsvRows,
} from './freezeLine.js';
import { freezeLineConventions } from './freezeLineSchema.js';
import { FREEZE_EVENTS, FREEZE_LIMITS } from './freezeLineRegistry.js';

export function createFreezeLineActions(store, { now, idFactory }) {
  const fail = (error, field = null) => ({ ok: false, error, ...(field ? { field } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date());
  const saved = (extra = {}) => ({
    ok: true,
    ...extra,
    saved: !store.persistError,
    warning: store.persistError || null,
    propagations: store.lastPropagations || [],
  });
  const report = () => buildFreezeLineReport(store.state, { now: clock(), settings: store.state.settings || {} });
  // The same governance right as the Programme Federation Reading: freezing or
  // scanning a scoped hierarchy measurement (rank 1–5), declared per seat.
  const seatRight = () => {
    const built = buildSeats(store.state, { now: clock(), settings: store.state.settings || {} });
    const seat = activeSeat(built);
    if (seat.readOnly) {
      return { ok: false, error: 'The declared seat is unresolved and read-only. Choose a valid seat before freezing a continuity reading.' };
    }
    const right = canAct('govern-federation', seat);
    return right.allow ? { ok: true, seat } : { ok: false, error: right.reason };
  };

  return {
    freezeLineReport() {
      return report();
    },

    freezeLineBriefText() {
      const current = report();
      return current.ok ? { ok: true, text: freezeLineBriefText(current) } : current;
    },

    freezeLineCsvRows() {
      const current = report();
      if (!current.ok) return current;
      return { ok: true, rows: freezeLineCsvRows(current), summary: { lines: current.lines.length, degradedN: current.degradedN } };
    },

    freezeLineAttentionCount() {
      return freezeLineAttentionCount(store.state, { now: clock(), settings: store.state.settings || {} });
    },

    freezeLineConventions() {
      return freezeLineConventions(store.state.settings || {});
    },

    freezeLineFreeze({ designId } = {}) {
      const right = seatRight();
      if (!right.ok) return fail(right.error);
      if (!designId) return fail('Name the structural design whose freeze line to freeze.', 'designId');
      const nowValue = clock();
      const today = dayKey(nowValue);
      const existing = (store.state.freezeReadings || []).find((row) => row
        && row.designId === designId && row.frozenOn === today);
      if (existing) return saved({ id: existing.id, existing: true, report: report() });
      if ((store.state.freezeReadings || []).length >= FREEZE_LIMITS.readings) {
        return fail(`The immutable reading ledger is full at ${FREEZE_LIMITS.readings} readings. Export the current reading before continuing.`);
      }
      const built = buildFreezeReading(store.state, {
        id: idFactory('freeze'),
        designId,
        now: nowValue,
        settings: store.state.settings || {},
      });
      if (!built.ok) return fail(built.error);
      store.update((draft) => {
        draft.freezeReadings = Array.isArray(draft.freezeReadings) ? draft.freezeReadings : [];
        draft.freezeReadings.unshift(built.reading);
      }, {
        type: FREEZE_EVENTS.FROZEN,
        entity: 'freezereading',
        entityId: built.reading.id,
        summary: `Froze a freeze-line continuity reading (verdict ${built.reading.verdict}); line registration and any degraded-line decision requested`,
      });
      return saved({ id: built.reading.id, existing: false, verdict: built.reading.verdict, report: report() });
    },

    freezeLineScan() {
      const right = seatRight();
      if (!right.ok) return fail(right.error);
      store.update(() => {}, {
        type: FREEZE_EVENTS.SCAN,
        entity: right.seat.fullAccess ? 'workspace' : 'freezeline',
        entityId: right.seat.fullAccess ? 'all' : right.seat.id,
        summary: 'Explicitly re-measured continuity across every crossed freeze line and audited the timing guard',
      });
      return saved({ report: report() });
    },
  };
}
