/**
 * app/core/domain/workforceFlowActions.js — the reviewed API doors of the
 * Workforce Stock-Flow (Markov manpower) Plan (ADR-0184).
 *
 *   workforceFlowReport         seat-scoped read (SAFE_READS);
 *   workforceFlowRecordMove     record ONE dated transition against a person a
 *                               manager reaches — the act every rate is built on;
 *   workforceFlowWithdrawMove   withdraw a move recorded in error. Append-only:
 *                               the row is not deleted and the withdrawal is
 *                               itself a dated act, because a transition that
 *                               silently disappeared would move every rate.
 *   workforceFlowDeclareTarget  declare the intended headcount at a level by a
 *                               day (the chief's act);
 *   workforceFlowRetireTarget   retire a declaration whose horizon has changed;
 *   workforceFlowScan           re-run RULE-WFS-01 on the shared spine;
 *   workforceFlowSetConventions change the declared conventions. A value outside
 *                               its bounds is REFUSED with the bound printed —
 *                               never clamped into something nobody chose.
 *
 * Every write goes through `store.update`, so RULE-WFS-01, the Operating Seat's
 * roll-up and the seal all run in the same atomic commit.
 *
 * There is deliberately NO command that infers a move from a level that changed
 * between two loads. That difference could be a correction, a re-organisation or
 * a typo, and a rate built on it would inherit the error forever.
 */
import { dayKey } from '../time.js';
import { buildMatrix, matrixLineScope } from './matrix.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { buildWorkforceFlow } from './workforceFlow.js';
import {
  normalizeWorkforceFlowSettings,
  validateWorkforceMove,
} from './workforceFlowSchema.js';
import {
  WORKFORCE_FLOW_BOUNDS,
  WORKFORCE_FLOW_DETAIL_LEVELS,
  WORKFORCE_FLOW_EVENTS,
  WORKFORCE_FLOW_LEVEL_KEYS,
  WORKFORCE_FLOW_LIMITS,
  WORKFORCE_FLOW_RIGHTS,
  WORKFORCE_FLOW_RULE_ID,
  WORKFORCE_FLOW_SETTING_KEYS,
  WORKFORCE_FLOW_SETTING_LABELS,
  workforceFlowKind,
} from './workforceFlowRegistry.js';

// Every refusal is a plain result object. `extra` carries the clause list so a
// caller (and the panel) can name EXACTLY which clauses failed, instead of
// re-parsing them out of a sentence.
const fail = (error, field = 'scope', extra = null) => ({
  ok: false,
  error,
  field,
  ...(extra && typeof extra === 'object' ? extra : {}),
});

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

const SETTING_NAME_BY_KEY = new Map(Object.entries(WORKFORCE_FLOW_SETTING_KEYS).map(([name, key]) => [key, name]));

/** The disclosure level a seat is entitled to. Printed, never silently narrowed. */
function detailFor(seat) {
  if (seat.fullAccess) return 'full';
  const rank = Number.isInteger(seat.rank) ? seat.rank : 1;
  if (rank >= 3) return 'full';
  if (rank >= 1) return 'span';
  return 'none';
}

export function createWorkforceFlowActions(store, { now = () => new Date(), idFactory = null } = {}) {
  const clock = () => { const x = now(); return x instanceof Date ? x : new Date(x); };
  const id = (prefix) => (idFactory ? idFactory(prefix) : `${prefix}-${Math.random().toString(36).slice(2, 10)}`);

  return {
    /** Seat-scoped read of the plan. The disclosure ladder is applied IN the read. */
    workforceFlowReport(input = {}) {
      const at = clock();
      const seat = seatOf(store.state, at);
      if (seat.readOnly) return fail('The operating seat is unresolved; the stock-flow plan cannot be read.');
      const detailLevel = WORKFORCE_FLOW_DETAIL_LEVELS.includes(input.detailLevel)
        ? input.detailLevel
        : detailFor(seat);
      const visiblePersonIds = seat.fullAccess ? null : new Set([...(seat.scope || []), ...(seat.lineScope || [])]);
      return {
        ok: true,
        report: buildWorkforceFlow(store.state, { now: at, settings: store.state.settings || {}, visiblePersonIds, detailLevel }),
        seat: { id: seat.id, fullAccess: seat.fullAccess, rank: seat.rank, detailLevel },
      };
    },

    /**
     * Record one dated transition. The request is validated by the SAME function
     * the loader uses, so an act this door accepts can never be dropped by the
     * next reload — the two can only disagree about a bug, never about policy.
     */
    workforceFlowRecordMove(input = {}) {
      const at = clock();
      const today = dayKey(at) || at.toISOString().slice(0, 10);
      const seat = seatOf(store.state, at);
      if (seat.readOnly) return fail('Resolve the operating seat before recording a workforce move.');
      const right = canAct(WORKFORCE_FLOW_RIGHTS.RECORD, seat);
      if (!right.allow) return fail(right.reason || 'Recording a workforce move requires a leadership seat.');

      const { refusals, act } = validateWorkforceMove(store.state, input, { today, idFactory: id });
      if (refusals.length) {
        return fail(`The move was refused: ${refusals.join(', ')}. Nothing was saved.`, 'kind', { refusals });
      }
      // A seat records moves for people it reaches. The operator view reaches
      // everyone; a declared seat is narrowed to its span and its lines.
      if (!seat.fullAccess && !(seat.scope?.has(act.personId) || seat.lineScope?.has(act.personId))) {
        return fail('This person sits outside your span and your declared lines, so you cannot record their move.', 'personId');
      }
      const person = (store.state.people || []).find((p) => p && p.id === act.personId);
      const row = {
        ...act,
        note: typeof input.note === 'string' ? input.note.trim().slice(0, 300) : '',
        recordedOn: today,
        recordedById: seat.fullAccess ? null : seat.id,
        at: at.toISOString(),
      };
      store.update((draft) => {
        const list = Array.isArray(draft.workforceFlowActs) ? draft.workforceFlowActs : [];
        draft.workforceFlowActs = [...list, row];
      }, {
        type: WORKFORCE_FLOW_EVENTS.MOVE_RECORDED,
        entity: 'person',
        entityId: act.personId,
        summary: `Recorded a ${workforceFlowKind(act.kind).label.toLowerCase()} for ${person?.name || act.personId} effective ${act.effectiveOn}.`,
      });
      return saved(store, { moveId: row.id, kind: row.kind, effectiveOn: row.effectiveOn });
    },

    /**
     * Withdraw a move recorded in error. The row is MARKED, never deleted: a
     * transition that vanished from the ledger would silently move every rate,
     * and the record of who withdrew it and why is the only thing that makes the
     * correction auditable. Withdrawn acts are excluded from every count on read.
     */
    workforceFlowWithdrawMove(moveId, reason = '') {
      const at = clock();
      const today = dayKey(at) || at.toISOString().slice(0, 10);
      const seat = seatOf(store.state, at);
      if (seat.readOnly) return fail('Resolve the operating seat before withdrawing a workforce move.');
      const right = canAct(WORKFORCE_FLOW_RIGHTS.RECORD, seat);
      if (!right.allow) return fail(right.reason || 'Withdrawing a workforce move requires a leadership seat.');
      const move = (store.state.workforceFlowActs || []).find((a) => a && a.id === moveId);
      if (!move) return fail('Choose an existing recorded move.', 'moveId');
      if (move.withdrawn === true) return fail('This move is already withdrawn; nothing was changed.', 'moveId');
      if (!seat.fullAccess && !(seat.scope?.has(move.personId) || seat.lineScope?.has(move.personId))) {
        return fail('This move concerns someone outside your span and your declared lines.', 'moveId');
      }
      const text = typeof reason === 'string' ? reason.trim().slice(0, 300) : '';
      if (text.length < 8) {
        return fail('Say why the move is being withdrawn (at least 8 characters). A withdrawal with no reason is indistinguishable from a deletion nobody can audit.', 'reason');
      }
      store.update((draft) => {
        const list = Array.isArray(draft.workforceFlowActs) ? draft.workforceFlowActs : [];
        const target = list.find((a) => a && a.id === moveId);
        if (!target) return;
        target.withdrawn = true;
        target.withdrawnOn = today;
        target.withdrawnById = seat.fullAccess ? null : seat.id;
        target.withdrawnReason = text;
        target.withdrawnAt = at.toISOString();
      }, {
        type: WORKFORCE_FLOW_EVENTS.MOVE_WITHDRAWN,
        entity: 'person',
        entityId: move.personId,
        summary: `Withdrew workforce move ${moveId}: ${text.slice(0, 120)}`,
      });
      return saved(store, { moveId, withdrawnOn: today });
    },

    /**
     * Declare the intended headcount at a level by a day. This is the only place
     * an intended shape enters the record, and zero is a legitimate declaration
     * (we intend to hold nobody there) while a missing one is not — the read
     * model refuses the comparison rather than defaulting a level to zero.
     */
    workforceFlowDeclareTarget(input = {}) {
      const at = clock();
      const today = dayKey(at) || at.toISOString().slice(0, 10);
      const seat = seatOf(store.state, at);
      if (seat.readOnly) return fail('Resolve the operating seat before declaring an intended shape.');
      const right = canAct(WORKFORCE_FLOW_RIGHTS.GOVERN, seat);
      if (!right.allow) return fail(right.reason || 'Declaring the intended shape of the workforce requires director rank.');
      const level = typeof input.level === 'string' ? input.level.trim() : '';
      if (!WORKFORCE_FLOW_LEVEL_KEYS.includes(level)) return fail('Choose one of the roster levels.', 'level');
      const headcount = input.headcount;
      if (!Number.isInteger(headcount) || headcount < 0 || headcount > 100000) {
        return fail('A declared headcount is a whole number of people, zero or more. Nothing was rounded.', 'headcount');
      }
      const byOn = typeof input.byOn === 'string' ? input.byOn.trim().slice(0, 10) : '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(byOn)) return fail('Choose the day the intended shape is to hold on.', 'byOn');
      if (byOn <= today) {
        return fail(`An intended shape must hold on a day that has not passed. ${byOn} is not a plan.`, 'byOn');
      }
      const existing = Array.isArray(store.state.workforceFlowTargets) ? store.state.workforceFlowTargets : [];
      if (existing.length >= WORKFORCE_FLOW_LIMITS.targets) {
        return fail(`The shape ledger holds its declared cap of ${WORKFORCE_FLOW_LIMITS.targets} declarations; retire or export before declaring more.`);
      }
      const row = {
        id: id('wft'),
        level,
        headcount,
        byOn,
        note: typeof input.note === 'string' ? input.note.trim().slice(0, 300) : '',
        declaredOn: today,
        declaredById: seat.fullAccess ? null : seat.id,
        retired: false,
        retiredOn: null,
        retiredById: null,
        at: at.toISOString(),
      };
      store.update((draft) => {
        const list = Array.isArray(draft.workforceFlowTargets) ? draft.workforceFlowTargets : [];
        draft.workforceFlowTargets = [...list, row];
      }, {
        type: WORKFORCE_FLOW_EVENTS.TARGET_DECLARED,
        entity: 'workspace',
        entityId: 'workforce-flow',
        summary: `Declared an intended ${headcount} people at the ${level} level by ${byOn}.`,
      });
      return saved(store, { targetId: row.id, level, headcount, byOn });
    },

    workforceFlowRetireTarget(targetId, reason = '') {
      const at = clock();
      const today = dayKey(at) || at.toISOString().slice(0, 10);
      const seat = seatOf(store.state, at);
      if (seat.readOnly) return fail('Resolve the operating seat before retiring a shape declaration.');
      const right = canAct(WORKFORCE_FLOW_RIGHTS.GOVERN, seat);
      if (!right.allow) return fail(right.reason || 'Retiring the intended shape requires director rank.');
      const target = (store.state.workforceFlowTargets || []).find((t) => t && t.id === targetId);
      if (!target) return fail('Choose an existing declaration.', 'targetId');
      if (target.retired) return fail('This declaration is already retired; nothing was changed.', 'targetId');
      store.update((draft) => {
        const list = Array.isArray(draft.workforceFlowTargets) ? draft.workforceFlowTargets : [];
        const row = list.find((t) => t && t.id === targetId);
        if (!row) return;
        row.retired = true;
        row.retiredOn = today;
        row.retiredById = seat.fullAccess ? null : seat.id;
        row.retiredNote = typeof reason === 'string' ? reason.trim().slice(0, 300) : '';
      }, {
        type: WORKFORCE_FLOW_EVENTS.TARGET_RETIRED,
        entity: 'workspace',
        entityId: 'workforce-flow',
        summary: `Retired the intended shape for the ${target.level} level by ${target.byOn}.`,
      });
      return saved(store, { targetId, retiredOn: today });
    },

    workforceFlowScan() {
      const seat = seatOf(store.state, clock());
      const right = canAct(WORKFORCE_FLOW_RIGHTS.GOVERN, seat);
      if (seat.readOnly || (!seat.fullAccess && !right.allow)) {
        return fail(right.reason || 'Scanning the workforce plan requires director rank.');
      }
      store.update(() => {}, {
        type: WORKFORCE_FLOW_EVENTS.SCAN,
        entity: 'workspace',
        entityId: 'workforce-flow',
        summary: `Scanned the workforce stock-flow plan (${WORKFORCE_FLOW_RULE_ID}).`,
      });
      return saved(store, { effects: (store.lastPropagations || []).filter((x) => x?.ruleId === WORKFORCE_FLOW_RULE_ID) });
    },

    workforceFlowSetConventions(patch) {
      const seat = seatOf(store.state, clock());
      const right = canAct(WORKFORCE_FLOW_RIGHTS.GOVERN, seat);
      if (seat.readOnly || (!seat.fullAccess && !right.allow)) {
        return fail(right.reason || 'Changing the stock-flow conventions requires director rank.');
      }
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return fail('Conventions must be a declared patch object.', 'patch');
      const next = {};
      for (const [key, value] of Object.entries(patch)) {
        const name = SETTING_NAME_BY_KEY.get(key);
        if (!name) return fail(`“${String(key).slice(0, 60)}” is not a stock-flow convention. Nothing was saved.`, 'patch');
        if (name === 'autoPropagate') {
          if (typeof value !== 'boolean') return fail(`${WORKFORCE_FLOW_SETTING_LABELS[name]} must be true or false. Nothing was saved.`, key);
          next[key] = value;
          continue;
        }
        const [min, max] = WORKFORCE_FLOW_BOUNDS[name];
        if (!Number.isInteger(value) || value < min || value > max) {
          return fail(`${WORKFORCE_FLOW_SETTING_LABELS[name]} must be a whole number from ${min} to ${max}. Nothing was clamped and nothing was saved.`, key);
        }
        next[key] = value;
      }
      const before = normalizeWorkforceFlowSettings(store.state.settings || {});
      const changed = Object.keys(next).filter((key) => before[key] !== next[key]);
      if (!changed.length) return fail('Those are already the conventions in force; nothing was changed.', 'patch');
      store.update((draft) => {
        draft.settings = { ...(draft.settings || {}), ...next };
      }, {
        type: WORKFORCE_FLOW_EVENTS.CONVENTIONS,
        entity: 'workspace',
        entityId: 'workforce-flow',
        summary: `Changed workforce stock-flow conventions: ${changed.join(', ')}.`,
      });
      return saved(store, { changed, conventions: normalizeWorkforceFlowSettings(store.state.settings || {}) });
    },
  };
}
