/**
 * app/core/domain/operatingModelActions.js — API mixin for the Operating Model
 * (Schema v95, ADR-0089). Mounted with `Object.assign(api, ...)` exactly like
 * every other terminal; no second command bus and no second rule engine.
 *
 * The write path is deliberately small and it is all DECLARATION, not
 * measurement: declare the four work-type numbers for a level, declare the
 * recurring collaboration the span actually has, price one portfolio item, scan.
 * Nothing here records what a person did, and nothing here writes about a person.
 */

import { dayKey } from '../time.js';
import { buildChain, LEADER_ID } from './chain.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import {
  operatingModelBriefText,
  operatingModelCsvRows,
  operatingModelAttentionCount,
  operatingModelNorms,
  operatingModelRead,
} from './operatingModel.js';
import {
  normalizeOperatingModelDecisions,
  normalizeOperatingModelSettings,
  normalizeWorkSplit,
  normalizeWorkSplits,
} from './operatingModelSchema.js';
import {
  OPERATING_MODEL_EVENTS,
  OPERATING_MODEL_WORK_TYPES,
} from './operatingModelRegistry.js';

export function createOperatingModelActions(store, { now, idFactory, createApi }) {
  const fail = (error, field = null) => ({ ok: false, error, ...(field ? { field } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date());
  const saved = (extra = {}) => ({
    ok: true,
    ...extra,
    saved: !store.persistError,
    warning: store.persistError || null,
    propagations: store.lastPropagations || [],
  });
  const settings = () => store.state.settings || {};
  const splits = () => (Array.isArray(store.state.omWorkSplits) ? store.state.omWorkSplits : []);
  const edges = () => (Array.isArray(store.state.omEdges) ? store.state.omEdges : []);
  const portfolio = () => (Array.isArray(store.state.omDecisions) ? store.state.omDecisions : []);

  /** Only a seat that may edit reporting lines may edit the model of them. */
  function seatGate() {
    const built = buildSeats(store.state, { now: clock(), settings: settings() });
    const seat = activeSeat(built);
    if (seat.fullAccess) return { seat, built, error: null };
    const right = canAct('edit-reporting-line', seat);
    if (!right.allow) return { seat, built, error: fail(right.reason, 'scope') };
    return { seat, built, error: null };
  }

  return {
    /** Pure read. Never persists. */
    operatingModelRead(seatId = null) {
      return operatingModelRead(store.state, { now: clock(), settings: settings(), seatId });
    },

    operatingModelNorms() {
      return { ok: true, norms: operatingModelNorms(settings()) };
    },

    /**
     * Declare (or replace) the four work-type percentages for one level /
     * function. This is the only input the model needs from a human, and it is
     * deliberately about a LEVEL, not about a person.
     */
    omDeclareSplit(input = {}) {
      const gate = seatGate();
      if (gate.error) return gate.error;
      const warnings = [];
      const draftRow = {
        ...input,
        id: String(input.id || `oms-${Date.now().toString(36)}`),
        declaredOn: dayKey(clock()),
        declaredAt: clock().toISOString(),
        declaredBy: gate.seat && !gate.seat.fullAccess ? gate.seat.id : null,
        createdAt: clock().toISOString(),
      };
      const normalized = normalizeWorkSplit(draftRow, warnings);
      if (!normalized) return fail(warnings[0] || 'A work split needs a level, a function and at least one non-zero percentage.', 'level');
      const existing = splits();
      const clash = existing.find((s) => s.level === normalized.level && s.functionKey === normalized.functionKey && s.id !== normalized.id);
      store.update((draft) => {
        draft.omWorkSplits = Array.isArray(draft.omWorkSplits) ? draft.omWorkSplits : [];
        const index = draft.omWorkSplits.findIndex((s) => s && s.id === normalized.id);
        if (index === -1) draft.omWorkSplits.unshift(normalized);
        else draft.omWorkSplits[index] = normalized;
        // One split per (level, function) pair: the newest declaration wins and
        // the superseded row is removed rather than left to compete with it.
        draft.omWorkSplits = draft.omWorkSplits.filter((s) => s && !(s.level === normalized.level && s.functionKey === normalized.functionKey && s.id !== normalized.id));
        draft.omWorkSplits = normalizeWorkSplits(draft.omWorkSplits, []);
      }, {
        type: OPERATING_MODEL_EVENTS.NORMS_SET,
        entity: 'operatingmodel',
        summary: `Declared a work-type split for ${normalized.level || 'a level'}${normalized.functionKey ? ` · ${normalized.functionKey}` : ''}`,
      });
      return saved({ split: normalized, supersededId: clash ? clash.id : null, warnings });
    },

    omRemoveSplit(id) {
      const gate = seatGate();
      if (gate.error) return gate.error;
      const row = splits().find((s) => s && s.id === id);
      if (!row) return fail('That split no longer exists.', 'id');
      store.update((draft) => {
        draft.omWorkSplits = (Array.isArray(draft.omWorkSplits) ? draft.omWorkSplits : []).filter((s) => s && s.id !== id);
      }, {
        type: OPERATING_MODEL_EVENTS.NORMS_SET,
        entity: 'operatingmodel',
        summary: 'Removed a declared work-type split',
      });
      return saved({ removedId: id });
    },

    /** Declare one recurring collaboration edge. Declared, never inferred. */
    omDeclareEdge(input = {}) {
      const gate = seatGate();
      if (gate.error) return gate.error;
      const chain = buildChain(store.state, { now: clock(), settings: settings() });
      const fromId = String(input.fromId || (gate.seat && !gate.seat.fullAccess ? gate.seat.id : LEADER_ID));
      const toId = String(input.toId || '');
      if (!chain.nodes.has(fromId) || !chain.nodes.has(toId)) return fail('Both ends of a collaboration edge must be positions on this roster or the workspace leader.', 'toId');
      if (fromId === toId) return fail('An edge needs two ends.', 'toId');
      const weight = Math.max(1, Math.min(5, Math.round(Number(input.weight) || 1)));
      const kind = ['sync', 'handoff', 'review', 'escalation'].includes(input.kind) ? input.kind : 'sync';
      const fromNode = chain.nodes.get(fromId);
      const toNode = chain.nodes.get(toId);
      const unitCrossing = Boolean(input.unitCrossing)
        || Boolean(fromNode && toNode && fromNode.team && toNode.team && fromNode.team !== toNode.team);
      const row = {
        id: idFactory('ome'),
        fromId,
        toId,
        weight,
        kind,
        unitCrossing,
        note: String(input.note || '').slice(0, 200),
        declaredOn: dayKey(clock()),
        createdAt: clock().toISOString(),
      };
      if (edges().some((e) => e && ((e.fromId === fromId && e.toId === toId) || (e.fromId === toId && e.toId === fromId)))) {
        return fail('That conversation is already declared. Two rows for one relationship would double the seam cost.', 'toId');
      }
      store.update((draft) => {
        draft.omEdges = Array.isArray(draft.omEdges) ? draft.omEdges : [];
        draft.omEdges.unshift(row);
      }, {
        type: OPERATING_MODEL_EVENTS.PORTFOLIO_SET,
        entity: 'operatingmodel',
        summary: `Declared a ${kind} collaboration edge${unitCrossing ? ' across a unit boundary' : ''}`,
      });
      return saved({ edge: row });
    },

    omRemoveEdge(id) {
      const gate = seatGate();
      if (gate.error) return gate.error;
      if (!edges().some((e) => e && e.id === id)) return fail('That edge no longer exists.', 'id');
      store.update((draft) => {
        draft.omEdges = (Array.isArray(draft.omEdges) ? draft.omEdges : []).filter((e) => e && e.id !== id);
      }, {
        type: OPERATING_MODEL_EVENTS.PORTFOLIO_SET,
        entity: 'operatingmodel',
        summary: 'Removed a declared collaboration edge',
      });
      return saved({ removedId: id });
    },

    /**
     * Price one portfolio item: a measured cycle time and the weekly hours it
     * consumes. This is the bridge to the rest of the workspace — the same item
     * can be read as a timed obligation by every other terminal.
     */
    omPriceItem(input = {}) {
      const gate = seatGate();
      if (gate.error) return gate.error;
      const warnings = [];
      const row = {
        ...input,
        id: String(input.id || idFactory('omd')),
        source: 'declared',
        createdAt: clock().toISOString(),
      };
      const normalized = normalizeOperatingModelDecisions([row], warnings)[0];
      if (!normalized) return fail(warnings[0] || 'A portfolio item needs a name.', 'name');
      store.update((draft) => {
        draft.omDecisions = Array.isArray(draft.omDecisions) ? draft.omDecisions : [];
        const index = draft.omDecisions.findIndex((d) => d && d.id === normalized.id);
        if (index === -1) draft.omDecisions.unshift(normalized);
        else draft.omDecisions[index] = normalized;
      }, {
        type: OPERATING_MODEL_EVENTS.DECISION_SET,
        entity: 'operatingmodel',
        summary: 'Priced an operating-model portfolio item',
      });
      return saved({ item: normalized, warnings });
    },

    omRemoveItem(id) {
      const gate = seatGate();
      if (gate.error) return gate.error;
      if (!portfolio().some((d) => d && d.id === id)) return fail('That item no longer exists.', 'id');
      store.update((draft) => {
        draft.omDecisions = (Array.isArray(draft.omDecisions) ? draft.omDecisions : []).filter((d) => d && d.id !== id);
      }, {
        type: OPERATING_MODEL_EVENTS.DECISION_SET,
        entity: 'operatingmodel',
        summary: 'Removed an operating-model portfolio item',
      });
      return saved({ removedId: id });
    },

    /** Declared norms. Clamped, printed, and identical for every seat. */
    omSetNorms(values = {}) {
      const gate = seatGate();
      if (gate.error) return gate.error;
      const normalized = normalizeOperatingModelSettings({ ...settings(), ...values });
      store.update((draft) => {
        draft.settings = { ...(draft.settings || {}), ...normalized };
      }, {
        type: OPERATING_MODEL_EVENTS.NORMS_SET,
        entity: 'operatingmodel',
        summary: 'Changed the operating-model norms',
      });
      return saved({ norms: normalized });
    },

    /**
     * Explicit reconciliation. Always runs, whatever the pause setting says —
     * but it reports honestly when there is nothing to reconcile, instead of
     * toasting success over a workspace that has not declared a design.
     */
    operatingModelScan() {
      const report = operatingModelRead(store.state, { now: clock(), settings: settings() });
      const result = store.update(() => {}, {
        type: OPERATING_MODEL_EVENTS.SCAN,
        entity: 'operatingmodel',
        summary: 'Reconciled the operating model',
      });
      const inert = report.measuredPositions === 0;
      return {
        ok: true,
        ...result,
        inert,
        reason: inert
          ? 'Nothing is measured yet: no work-type split is declared, so the rules had nothing to reconcile. Declare one split and the model starts reading.'
          : null,
        propagations: store.lastPropagations || [],
      };
    },

    operatingModelBriefText() {
      return { ok: true, text: operatingModelBriefText(store.state, { now: clock(), settings: settings() }) };
    },

    operatingModelCsvRows() {
      return { ok: true, rows: operatingModelCsvRows(store.state, { now: clock(), settings: settings() }) };
    },

    operatingModelAttentionCount() {
      return operatingModelAttentionCount(store.state, clock(), settings());
    },

    /** The work-type vocabulary, so a view never duplicates it. */
    operatingModelWorkTypes() {
      return { ok: true, types: OPERATING_MODEL_WORK_TYPES };
    },
  };
}
