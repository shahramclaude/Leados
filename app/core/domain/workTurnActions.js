/**
 * app/core/domain/workTurnActions.js — the reviewed API doors of the
 * Non-Promotable Work Turn Ledger (ADR-0181).
 *
 *   workTurnReport          seat-scoped read (SAFE_READS);
 *   workTurnClassify        a manager who reaches the person declares ONE ask
 *                           non-promotable or promotable (append-only act);
 *   workTurnScan            re-run RULE-NPW-01 on the shared spine;
 *   workTurnSetConventions  change the declared conventions. A value outside
 *                           its bounds is REFUSED with the bound printed —
 *                           never clamped into something nobody chose.
 *
 * Every write goes through `store.update`, so RULE-NPW-01, the Operating Seat's
 * roll-up and the seal all run in the same atomic commit.
 */
import { buildMatrix, matrixLineScope } from './matrix.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { buildWorkTurns, workTurnRuleIssuedIds } from './workTurns.js';
import { compactWorkTurnActs, effectiveWorkTurnActs, normalizeWorkTurnSettings } from './workTurnSchema.js';
import {
  WORK_TURN_BOUNDS,
  WORK_TURN_EVENTS,
  WORK_TURN_KINDS,
  WORK_TURN_KIND_LABELS,
  WORK_TURN_LIMITS,
  WORK_TURN_RIGHTS,
  WORK_TURN_RULE_ID,
  WORK_TURN_SETTING_KEYS,
  WORK_TURN_SETTING_LABELS,
} from './workTurnRegistry.js';

const fail = (error, field = 'scope') => ({ ok: false, error, field });

function seatOf(state, at) {
  const settings = state.settings || {};
  const matrix = buildMatrix(state, { now: at, settings });
  const scope = matrixLineScope(matrix);
  return activeSeat(buildSeats(state, { now: at, settings, lineScope: scope.byManager }));
}

function saved(store, extra = {}) {
  return {
    ok: true,
    ...extra,
    saved: store.isEncrypted ? null : !store.persistError,
    warning: store.persistError || null,
    propagations: store.lastPropagations || [],
  };
}

const SETTING_NAME_BY_KEY = new Map(Object.entries(WORK_TURN_SETTING_KEYS).map(([name, key]) => [key, name]));

export function createWorkTurnActions(store, { now = () => new Date(), idFactory = null } = {}) {
  const clock = () => { const x = now(); return x instanceof Date ? x : new Date(x); };
  const id = (prefix) => (idFactory ? idFactory(prefix) : `${prefix}-${Math.random().toString(36).slice(2, 10)}`);

  return {
    workTurnReport() {
      const report = buildWorkTurns(store.state, { now: clock() });
      if (report.seat.readOnly) return fail('The operating seat is unresolved; the work-turn ledger cannot be read.');
      return { ok: true, report };
    },

    workTurnClassify(delegationId, kind) {
      const at = clock();
      const seat = seatOf(store.state, at);
      if (seat.readOnly) return fail('Resolve the operating seat before classifying an ask.');
      if (!WORK_TURN_KINDS.includes(kind)) return fail('Choose non-promotable or promotable.', 'kind');
      const ask = (store.state.delegations || []).find((d) => d && d.id === delegationId);
      if (!ask) return fail('Choose an existing ask.', 'delegationId');
      if (ask.status === 'returned') return fail('This ask was handed back. Nobody is carrying it, so it takes no kind.', 'delegationId');
      if (workTurnRuleIssuedIds(store.state).has(ask.id)) return fail('An automation rule issued this ask. It is not a manager’s choice of person, so it takes no kind.', 'delegationId');
      if (!seat.fullAccess) {
        if (ask.personId === seat.id) return fail('An ask is classified by a manager who reaches the person, never by the person carrying it.', 'delegationId');
        if (!(seat.scope?.has(ask.personId) || seat.lineScope?.has(ask.personId))) {
          return fail('This ask belongs to someone outside your span and your declared lines.', 'delegationId');
        }
      }
      const existing = Array.isArray(store.state.workTurnActs) ? store.state.workTurnActs : [];
      const current = effectiveWorkTurnActs(existing).get(ask.id);
      if (current && current.act.kind === kind) {
        return fail(`This ask is already recorded as ${WORK_TURN_KIND_LABELS[kind].toLowerCase()}; nothing was added.`, 'kind');
      }
      // Make room by evicting SUPERSEDED acts only. If every stored act is the
      // effective classification of an ask, the ledger is genuinely full.
      const room = compactWorkTurnActs(existing, WORK_TURN_LIMITS.acts - 1);
      if (room.length >= WORK_TURN_LIMITS.acts) {
        return fail(`The classification ledger holds ${WORK_TURN_LIMITS.acts} effective acts and is full; export it before recording more.`);
      }
      const act = { id: id('wta'), delegationId: ask.id, personId: ask.personId, kind, byId: seat.fullAccess ? null : seat.id, at: at.toISOString() };
      store.update((draft) => {
        const list = Array.isArray(draft.workTurnActs) ? draft.workTurnActs : [];
        draft.workTurnActs = [...compactWorkTurnActs(list, WORK_TURN_LIMITS.acts - 1), act];
      }, {
        type: WORK_TURN_EVENTS.CLASSIFIED,
        entity: 'delegation',
        entityId: ask.id,
        summary: `Classified delegation ${ask.id} as ${kind}; any prior act remains in history.`,
      });
      return saved(store, { id: act.id, kind });
    },

    workTurnScan() {
      const seat = seatOf(store.state, clock());
      const right = canAct(WORK_TURN_RIGHTS.GOVERN, seat);
      if (seat.readOnly || (!seat.fullAccess && !right.allow)) {
        return fail(right.reason || 'Scanning work turns requires director rank.');
      }
      store.update(() => {}, {
        type: WORK_TURN_EVENTS.SCAN,
        entity: 'workspace',
        entityId: 'work-turns',
        summary: `Scanned non-promotable work turns (${WORK_TURN_RULE_ID}).`,
      });
      return saved(store, { effects: (store.lastPropagations || []).filter((x) => x?.ruleId === WORK_TURN_RULE_ID) });
    },

    workTurnSetConventions(patch) {
      const seat = seatOf(store.state, clock());
      const right = canAct(WORK_TURN_RIGHTS.GOVERN, seat);
      if (seat.readOnly || (!seat.fullAccess && !right.allow)) {
        return fail(right.reason || 'Changing the work-turn conventions requires director rank.');
      }
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return fail('Conventions must be a declared patch object.', 'patch');
      const next = {};
      for (const [key, value] of Object.entries(patch)) {
        const name = SETTING_NAME_BY_KEY.get(key);
        if (!name) return fail(`“${String(key).slice(0, 60)}” is not a work-turn convention. Nothing was saved.`, 'patch');
        if (name === 'autoPropagate') {
          if (typeof value !== 'boolean') return fail(`${WORK_TURN_SETTING_LABELS[name]} must be true or false. Nothing was saved.`, key);
          next[key] = value;
          continue;
        }
        const [min, max] = WORK_TURN_BOUNDS[name];
        if (!Number.isInteger(value) || value < min || value > max) {
          return fail(`${WORK_TURN_SETTING_LABELS[name]} must be a whole number from ${min} to ${max}. Nothing was clamped and nothing was saved.`, key);
        }
        next[key] = value;
      }
      const before = normalizeWorkTurnSettings(store.state.settings || {});
      const changed = Object.keys(next).filter((key) => before[key] !== next[key]);
      if (!changed.length) return fail('Those are already the conventions in force; nothing was changed.', 'patch');
      store.update((draft) => {
        draft.settings = { ...(draft.settings || {}), ...next };
      }, {
        type: WORK_TURN_EVENTS.CONVENTIONS,
        entity: 'workspace',
        entityId: 'work-turns',
        summary: `Changed work-turn conventions: ${changed.join(', ')}.`,
      });
      return saved(store, { changed, conventions: normalizeWorkTurnSettings(store.state.settings || {}) });
    },
  };
}
