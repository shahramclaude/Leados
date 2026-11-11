/**
 * app/core/domain/hiringLineActions.js — the write and read doors of Cross-Line
 * Selection Corroboration (ADR-0176).
 *
 *  hiringLineReport    seat-scoped read (see `buildHiringLines`).
 *  hiringLineDeclare   append a dated line plan for one requisition. Operator
 *                      view only: hiring writes have no seat-scoped adapter in
 *                      this workspace, and a plan names managers in more than
 *                      one span by definition.
 *  hiringLineWithdraw  retract the effective plan with a reason (append-only).
 *  hiringLineScan      re-run RULE-HLC-01 explicitly (director+ or operator).
 *
 * Nothing here records evidence, moves a candidate or blocks an offer.
 */

import { buildMatrix, matrixLineScope } from './matrix.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { buildHiringLines, effectiveHiringLinePlans } from './hiringLines.js';
import {
  HIRING_LINE_EVENTS,
  HIRING_LINE_LIMITS,
  HIRING_LINE_RIGHTS,
  HIRING_LINE_RULE_ID,
} from './hiringLineRegistry.js';

const fail = (error, field = 'scope') => ({ ok: false, error, field });
const text = (value) => (typeof value === 'string' ? value.trim() : '');

function seatFor(state, at) {
  const settings = state.settings || {};
  const matrix = buildMatrix(state, { now: at, settings });
  const scope = matrixLineScope(matrix);
  const built = buildSeats(state, { now: at, settings, lineScope: scope.byManager });
  return activeSeat(built);
}

function saved(store, extra = {}) {
  return {
    ok: true, ...extra,
    saved: store.isEncrypted ? null : !store.persistError,
    warning: store.persistError || (store.isEncrypted ? 'Encrypted save queued; watch the workspace save status before leaving.' : null),
    propagations: store.lastPropagations || [],
  };
}

export function createHiringLineActions(store, { now = () => new Date(), idFactory = null } = {}) {
  const clock = () => { const value = now(); return value instanceof Date ? value : new Date(value); };
  const newId = (prefix) => (typeof idFactory === 'function' ? idFactory(prefix) : `${prefix}-${Math.random().toString(36).slice(2, 10)}`);
  const activePerson = (id) => (store.state.people || []).some((p) => p.id === id && p.status !== 'archived');

  return {
    hiringLineReport() {
      const at = clock();
      const report = buildHiringLines(store.state, { now: at, settings: store.state.settings || {} });
      if (report.seat.readOnly) return fail('The operating seat is unresolved; the co-hiring register cannot be read.');
      return { ok: true, report };
    },

    hiringLineDeclare(reqId, input = {}) {
      const at = clock();
      const seat = seatFor(store.state, at);
      if (seat.readOnly || !seat.fullAccess) return fail('A line plan names managers in more than one span, so it is declared only in the full-access operator view.');
      const req = (store.state.requisitions || []).find((r) => r.id === reqId);
      if (!req) return fail('That requisition no longer exists.', 'reqId');
      if (req.status === 'cancelled') return fail('A cancelled requisition has no hire to plan lines for.', 'reqId');
      if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('Provide the line plan as an object.', 'plan');
      const homeManagerId = text(input.homeManagerId);
      if (!homeManagerId) return fail('Name the home-line manager the hire will report to.', 'homeManagerId');
      if (!activePerson(homeManagerId)) {
        return fail('The home-line manager must be an active roster member. Evidence recorded by the workspace leader carries no attributable interviewer, so a line held by the leader could never be read as heard.', 'homeManagerId');
      }
      if (input.lineManagerIds !== undefined && !Array.isArray(input.lineManagerIds)) return fail('Additional line managers must be a list.', 'lineManagerIds');
      const lineManagerIds = (input.lineManagerIds || []).map(text);
      if (lineManagerIds.some((id) => !id)) return fail('An additional line manager is blank.', 'lineManagerIds');
      if (new Set(lineManagerIds).size !== lineManagerIds.length) return fail('The same additional line manager is named twice.', 'lineManagerIds');
      if (lineManagerIds.includes(homeManagerId)) return fail('The home-line manager cannot also be an additional line.', 'lineManagerIds');
      if (lineManagerIds.length > HIRING_LINE_LIMITS.additionalLines) return fail(`Declare at most ${HIRING_LINE_LIMITS.additionalLines} additional lines.`, 'lineManagerIds');
      const unknown = lineManagerIds.find((id) => !activePerson(id));
      if (unknown) return fail('Every additional line manager must be an active roster member.', 'lineManagerIds');
      const note = text(input.note);
      if (note.length > HIRING_LINE_LIMITS.noteMax) return fail(`Keep the note to ${HIRING_LINE_LIMITS.noteMax} characters.`, 'note');
      if ((store.state.hiringLinePlans || []).length >= HIRING_LINE_LIMITS.acts) return fail('The line-plan ledger is full. Export it before declaring more.', 'plan');

      const current = effectiveHiringLinePlans(store.state).get(reqId) || null;
      if (current && current.homeManagerId === homeManagerId
        && current.lineManagerIds.length === lineManagerIds.length
        && current.lineManagerIds.every((id, i) => id === lineManagerIds[i])) {
        return fail('That is already the effective line plan for this requisition.', 'plan');
      }
      const act = { id: newId('hlp'), reqId, kind: 'declared', homeManagerId, lineManagerIds, note, at: at.toISOString() };
      store.update((draft) => {
        draft.hiringLinePlans = Array.isArray(draft.hiringLinePlans) ? draft.hiringLinePlans : [];
        draft.hiringLinePlans.push(act);
      }, {
        type: HIRING_LINE_EVENTS.DECLARED, entity: 'requisition', entityId: reqId,
        summary: `Declared the reporting lines for the hire on ${req.title}: 1 home line and ${lineManagerIds.length} additional line(s).`,
      });
      return saved(store, { id: act.id });
    },

    hiringLineWithdraw(reqId, input = {}) {
      const at = clock();
      const seat = seatFor(store.state, at);
      if (seat.readOnly || !seat.fullAccess) return fail('A line plan is withdrawn only in the full-access operator view.');
      const req = (store.state.requisitions || []).find((r) => r.id === reqId);
      if (!req) return fail('That requisition no longer exists.', 'reqId');
      const current = effectiveHiringLinePlans(store.state).get(reqId) || null;
      if (!current) return fail('This requisition has no effective line plan to withdraw.', 'reqId');
      const reason = text(input?.reason);
      if (reason.length < HIRING_LINE_LIMITS.reasonMin || reason.length > HIRING_LINE_LIMITS.reasonMax) {
        return fail(`Give a reason of ${HIRING_LINE_LIMITS.reasonMin}–${HIRING_LINE_LIMITS.reasonMax} characters.`, 'reason');
      }
      if ((store.state.hiringLinePlans || []).length >= HIRING_LINE_LIMITS.acts) return fail('The line-plan ledger is full. Export it before recording more.', 'plan');
      const act = { id: newId('hlp'), reqId, kind: 'withdrawn', homeManagerId: null, lineManagerIds: [], note: reason, at: at.toISOString() };
      store.update((draft) => {
        draft.hiringLinePlans = Array.isArray(draft.hiringLinePlans) ? draft.hiringLinePlans : [];
        draft.hiringLinePlans.push(act);
      }, {
        type: HIRING_LINE_EVENTS.WITHDRAWN, entity: 'requisition', entityId: reqId,
        summary: `Withdrew the line plan for ${req.title}: ${reason}`.slice(0, 300),
      });
      return saved(store, { id: act.id });
    },

    hiringLineScan() {
      const seat = seatFor(store.state, clock());
      const right = canAct(HIRING_LINE_RIGHTS.GOVERN, seat);
      if (seat.readOnly || (!seat.fullAccess && !right.allow)) {
        return fail(right.reason || 'Scanning co-hiring lines requires director rank or the workspace operator view.');
      }
      store.update(() => {}, {
        type: HIRING_LINE_EVENTS.SCAN, entity: 'workspace', entityId: 'hiring-lines',
        summary: `Scanned co-hiring line corroboration for silent or never-asked lines (${HIRING_LINE_RULE_ID}).`,
      });
      const effects = (store.lastPropagations || []).filter((p) => p && p.ruleId === HIRING_LINE_RULE_ID);
      return saved(store, { effects });
    },
  };
}
