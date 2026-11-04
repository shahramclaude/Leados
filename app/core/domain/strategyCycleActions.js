/** Commands and scoped report adapter for the Hoshin strategy renewal bridge. */
import { dayKey } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import {
  buildStrategyCycleReport,
  buildStrategyCycleSnapshot,
  strategyCycleBriefText,
  strategyCycleCsvRows,
} from './strategyCycle.js';
import { STRATEGY_CYCLE_LIMITS } from './strategyCycleRegistry.js';

export function createStrategyCycleActions(store, { now, idFactory }) {
  const fail = (error, field = null) => ({ ok: false, error, ...(field ? { field } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date());
  const saved = (extra = {}) => ({
    ok: true,
    ...extra,
    saved: !store.persistError,
    warning: store.persistError || null,
    propagations: store.lastPropagations || [],
  });
  const report = (cycleId = null) => buildStrategyCycleReport(store.state, { now: clock(), cycleId });
  const seatRight = () => {
    const built = buildSeats(store.state, { now: clock(), settings: store.state.settings || {} });
    const seat = activeSeat(built);
    if (seat.readOnly) return { ok: false, error: 'The declared seat is unresolved and read-only. Choose a valid seat before changing a cycle.' };
    const right = canAct('govern-strategy-cycle', seat);
    return right.allow ? { ok: true, seat } : { ok: false, error: right.reason };
  };

  return {
    strategyCycleRead(cycleId = null) {
      return report(cycleId);
    },
    strategyCycleBriefText() {
      const current = report();
      return current.ok ? { ok: true, text: strategyCycleBriefText(current) } : current;
    },
    strategyCycleCsvRows() {
      const current = report();
      return current.ok ? { ok: true, rows: strategyCycleCsvRows(current) } : current;
    },
    strategyCycleFreeze({ reviewOn = null } = {}) {
      const right = seatRight();
      if (!right.ok) return fail(right.error);
      const nowValue = clock();
      const today = dayKey(nowValue);
      const scopeId = right.seat.fullAccess || right.seat.isLeader ? 'leader' : right.seat.id;
      const existing = (store.state.strategyCycles || []).find((cycle) => cycle
        && cycle.scopeSeatId === scopeId && cycle.frozenOn === today);
      if (existing) {
        return saved({ id: existing.id, existing: true, report: report() });
      }
      if ((store.state.strategyCycles || []).length >= STRATEGY_CYCLE_LIMITS.readings) {
        return fail(`The immutable cycle ledger is full at ${STRATEGY_CYCLE_LIMITS.readings} readings. Export the current learning line before continuing.`);
      }
      const built = buildStrategyCycleSnapshot(store.state, {
        id: idFactory('strategy-cycle'),
        now: nowValue,
        reviewOn,
      });
      if (!built.ok) return fail(built.error, 'reviewOn');
      store.update((draft) => {
        draft.strategyCycles = Array.isArray(draft.strategyCycles) ? draft.strategyCycles : [];
        draft.strategyCycles.unshift(built.reading);
      }, {
        type: 'strategy-cycle.frozen',
        entity: 'strategycycle',
        entityId: built.reading.id,
        summary: 'Froze an identity-reduced strategy renewal reading; typed Catchball and altitude provenance requested',
      });
      return saved({ id: built.reading.id, existing: false, report: report() });
    },
    strategyCycleScan() {
      const right = seatRight();
      if (!right.ok) return fail(right.error);
      store.update(() => {}, {
        type: 'strategy-cycle.scan',
        entity: right.seat.fullAccess ? 'workspace' : 'strategycycle',
        entityId: right.seat.fullAccess ? 'all' : (right.seat.isLeader ? 'leader' : right.seat.id),
        summary: 'Explicitly scanned frozen strategy cycles, stop-rule carryover and review dates',
      });
      return saved({ report: report() });
    },
  };
}
