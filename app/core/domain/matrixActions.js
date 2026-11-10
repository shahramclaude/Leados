/**
 * app/core/domain/matrixActions.js — the Matrix Accountability Ledger's commands
 * (ADR-0140, Schema v119).
 *
 * Four human writes, all dated, all span-checked, all with a printed reason for
 * every refusal:
 *
 *   matrixDeclareLine   "This person is ALSO accountable to that manager, on
 *                        this kind of line, for this share, holding these
 *                        rights, from this day." One atomic `store.update`: the
 *                        line row, one `reports-to` typed edge to the additional
 *                        manager, and the audit event.
 *
 *   matrixRetuneLine    "The allocation changed." The previous value stays on
 *                        the row in a bounded history, because an allocation
 *                        that silently became a different number is exactly the
 *                        drift this register exists to make visible.
 *
 *   matrixEndLine       "This line no longer holds, and here is why." Append-
 *                        only: the row is dated out and never deleted. A
 *                        reporting line that quietly disappeared is an
 *                        accountability nobody can be asked about.
 *
 *   matrixSetConventions  re-declares the two printed conventions.
 *
 * There is deliberately NO command that allocates a person automatically, none
 * that infers a reporting line from a case or a project record, and none that
 * closes an over-commitment on its own: the split is an agreement between two
 * managers and the person, and an engine that filled it in would be inventing
 * that agreement.
 */

import { dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { LEADER_ID } from './chain.js';
import {
  buildMatrixReport, matrixBriefText, matrixCsvRows, matrixAttentionCount,
  matrixLineScopeFor, formatShareH,
} from './matrix.js';
import { normalizeMatrixSettings, normalizeShareH } from './matrixSchema.js';
import {
  MATRIX_BOUNDS,
  MATRIX_LIMITS,
  MATRIX_LINE_KIND_KEYS,
  MATRIX_RELATION,
  MATRIX_RIGHT_KEYS,
  matrixLineKind,
  matrixRight,
} from './matrixRegistry.js';
import { buildMatrixCoordination } from './matrixCoordination.js';
import { MATRIX_COORDINATION_SCAN_EVENT } from './matrixCoordinationRegistry.js';

export const MATRIX_EVENTS = Object.freeze({
  DECLARE: 'matrix.line.declared',
  RETUNE: 'matrix.line.retuned',
  END: 'matrix.line.ended',
  CONVENTIONS: 'matrix.conventions.set',
  COORDINATION_SCAN: MATRIX_COORDINATION_SCAN_EVENT,
});

export function createMatrixActions(store, { now, idFactory }) {
  const fail = (error, field = null) => ({ ok: false, error, ...(field ? { field } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  const saved = (extra = {}) => ({
    ...extra,
    saved: !store.persistError,
    warning: store.persistError || null,
    propagations: store.lastPropagations || [],
    ok: true,
  });

  const seatFor = (right) => {
    const at = clock();
    const cfg = settings();
    const built = buildSeats(store.state, {
      now: at,
      settings: cfg,
      lineScope: matrixLineScopeFor(store.state, { now: at, settings: cfg }),
    });
    const seat = activeSeat(built);
    if (seat.readOnly) {
      return fail('The declared seat is unresolved and read-only. Choose a valid seat before declaring a reporting line.');
    }
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, seat, built };
  };

  const lines = () => (Array.isArray(store.state.reportingLines) ? store.state.reportingLines : []);
  const people = () => (Array.isArray(store.state.people) ? store.state.people : []);
  const activePerson = (id) => people().find((p) => p && p.id === id && p.status !== 'archived') || null;

  /**
   * Who may declare a line joining `personId` to `managerId`: one of the two
   * managers the line joins, or the span above BOTH of them. Never a peer, and
   * never a seat with no line of sight to either party.
   */
  function declarationEligibility(seat, built, personId, managerId) {
    if (seat.fullAccess) return { ok: true };
    const homeManagerId = built.chain.nodes.get(personId)?.rawManagerId || LEADER_ID;
    if (seat.id === homeManagerId) return { ok: true };
    if (seat.id === managerId) return { ok: true };
    const scope = new Set([...(seat.scope || []), ...(seat.lineScope || [])]);
    if (scope.has(personId) && (managerId === LEADER_ID || scope.has(managerId))) return { ok: true };
    return {
      ok: false,
      error: 'A reporting line is declared by one of the two managers it joins, or by the span above both of them. A peer cannot declare accountability inside another span.',
      field: 'managerId',
    };
  }

  function readShareInput(input, { required = false } = {}) {
    const raw = input?.shareH;
    if (raw === null || raw === undefined || raw === '') {
      return required ? { ok: false, error: 'State the allocation as a whole percentage (0–100).', field: 'shareH' } : { ok: true, value: null };
    }
    const shareH = normalizeShareH(raw);
    if (shareH === null) {
      return { ok: false, error: 'The allocation must be a whole percentage between 0 and 100.', field: 'shareH' };
    }
    return { ok: true, value: shareH };
  }

  function readRightsInput(input) {
    const raw = input?.rights;
    if (raw === null || raw === undefined) return { ok: true, value: [] };
    const list = Array.isArray(raw) ? raw : String(raw).split(',');
    const cleaned = [...new Set(list.map((r) => String(r).trim()).filter(Boolean))];
    const unknown = cleaned.filter((r) => !MATRIX_RIGHT_KEYS.includes(r));
    if (unknown.length) {
      return { ok: false, error: `Unknown decision right(s): ${unknown.join(', ')}.`, field: 'rights' };
    }
    return { ok: true, value: cleaned };
  }

  return {
    /* ---------------------------------------------------------------- reads */

    matrixReport() {
      const check = seatFor('declare-matrix-line');
      if (!check.ok) return check;
      return { ok: true, report: buildMatrixReport(store.state, { now: clock(), settings: settings() }) };
    },

    matrixBriefText() {
      const check = seatFor('declare-matrix-line');
      if (!check.ok) return check;
      const report = buildMatrixReport(store.state, { now: clock(), settings: settings() });
      return { ok: true, text: matrixBriefText(report) };
    },

    matrixCsvRows() {
      const check = seatFor('declare-matrix-line');
      if (!check.ok) return check;
      const report = buildMatrixReport(store.state, { now: clock(), settings: settings() });
      return { ok: true, rows: matrixCsvRows(report) };
    },

    // ADR-0161: a pure, seat-scoped reader over the SAME matrix graph. It is
    // intentionally not cached or stored: every displayed interface count is
    // derived from the current reporting lines and allocations.
    matrixCoordinationReport() {
      const check = seatFor('declare-matrix-line');
      if (!check.ok) return check;
      return { ok: true, report: buildMatrixCoordination(store.state, { now: clock(), settings: settings() }) };
    },

    matrixSettings() {
      return { ok: true, conventions: normalizeMatrixSettings(settings()), bounds: MATRIX_BOUNDS };
    },

    /** The person/manager pool a seat may declare lines over, with refusals printed. */
    matrixCandidates() {
      const check = seatFor('declare-matrix-line');
      if (!check.ok) return check;
      const { seat, built } = check;
      const scope = seat.fullAccess
        ? new Set(built.chain.byId.keys())
        : new Set([...(seat.scope || []), ...(seat.lineScope || [])]);
      const personRows = [];
      for (const personId of scope) {
        const node = built.chain.byId.get(personId);
        if (!node) continue;
        personRows.push({ personId, name: node.name, role: node.role || '', homeManagerId: node.rawManagerId || LEADER_ID });
      }
      personRows.sort((a, b) => a.name.localeCompare(b.name));
      const managerRows = [];
      for (const node of built.chain.nodes.values()) {
        if (node.id !== LEADER_ID && !built.chain.byId.has(node.id)) continue;
        if (!seat.fullAccess && node.id !== LEADER_ID && !scope.has(node.id)) continue;
        managerRows.push({ managerId: node.id, name: node.name, role: node.role || '', isLeader: node.id === LEADER_ID });
      }
      managerRows.sort((a, b) => (a.isLeader ? 1 : 0) - (b.isLeader ? 1 : 0) || a.name.localeCompare(b.name));
      return {
        ok: true,
        people: personRows,
        managers: managerRows,
        kinds: MATRIX_LINE_KIND_KEYS.map((k) => matrixLineKind(k)).filter(Boolean),
        rights: MATRIX_RIGHT_KEYS.map((k) => matrixRight(k)).filter(Boolean),
        limits: { linesPerPerson: MATRIX_LIMITS.linesPerPerson, noteChars: MATRIX_LIMITS.noteChars },
      };
    },

    /* --------------------------------------------------------------- writes */

    matrixDeclareLine(input = {}) {
      const check = seatFor('declare-matrix-line');
      if (!check.ok) return check;
      const { seat, built } = check;

      const personId = String(input.personId || '').trim();
      const managerId = String(input.managerId || 'leader').trim() || 'leader';
      if (!personId) return fail('Name the person this line is about.', 'personId');
      if (!activePerson(personId)) return fail('That person is not on the active roster.', 'personId');
      if (managerId !== LEADER_ID && !activePerson(managerId)) return fail('That manager is not on the active roster.', 'managerId');
      if (personId === managerId) return fail('A person cannot report to themselves.', 'managerId');

      const kind = MATRIX_LINE_KIND_KEYS.includes(input.kind) ? input.kind : null;
      if (!kind) return fail('Name the kind of line this is: project, product, cross-functional or administrative.', 'kind');

      const eligible = declarationEligibility(seat, built, personId, managerId);
      if (!eligible.ok) return fail(eligible.error, eligible.field);

      const share = readShareInput(input);
      if (!share.ok) return fail(share.error, share.field);
      const rights = readRightsInput(input);
      if (!rights.ok) return fail(rights.error, rights.field);

      const fromRaw = String(input.fromISO || '').trim();
      const fromISO = /^\d{4}-\d{2}-\d{2}$/.test(fromRaw) ? fromRaw : dayKey(clock());
      if (new Date(`${fromISO}T00:00:00.000Z`).toISOString().slice(0, 10) !== fromISO) {
        return fail('Give the start date as a real calendar day (YYYY-MM-DD).', 'fromISO');
      }
      let toISO = null;
      if (input.toISO) {
        const rawTo = String(input.toISO).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(rawTo)) return fail('Give the end date as a real calendar day (YYYY-MM-DD), or leave it blank.', 'toISO');
        if (rawTo < fromISO) return fail('A line cannot end before it starts.', 'toISO');
        toISO = rawTo;
      }

      const homeManagerId = built.chain.nodes.get(personId)?.rawManagerId || LEADER_ID;
      const isHomeAllocation = managerId === homeManagerId;

      const existing = lines().filter((r) => r && r.personId === personId && r.status === 'active');
      if (existing.some((r) => r.managerId === managerId)) {
        return fail(isHomeAllocation
          ? 'That person already has a declared allocation for their home line. Retune it instead of declaring a second one.'
          : 'That person already reports to that manager on an active line. Retune the existing line instead of declaring a second one.', 'managerId');
      }
      if (!isHomeAllocation) {
        const activeAdditional = existing.filter((r) => r.managerId !== homeManagerId);
        if (activeAdditional.length >= MATRIX_LIMITS.linesPerPerson) {
          return fail(`This person already carries the declared maximum of ${MATRIX_LIMITS.linesPerPerson} additional lines. End one before declaring another — a person is not an inexhaustible resource.`, 'managerId');
        }
      }

      const note = String(input.note || '').trim().slice(0, MATRIX_LIMITS.noteChars);
      const at = clock();
      const rowId = idFactory('mtxline');
      const personName = built.chain.byId.get(personId)?.name || personId;
      const managerName = managerId === LEADER_ID
        ? (built.chain.nodes.get(LEADER_ID)?.name || 'the workspace leader')
        : (built.chain.byId.get(managerId)?.name || managerId);
      const kindLabel = matrixLineKind(kind)?.label || kind;
      const shareLabel = share.value === null ? 'no allocation declared yet' : `${formatShareH(share.value)} of a person`;

      store.update((draft) => {
        draft.reportingLines = Array.isArray(draft.reportingLines) ? draft.reportingLines : [];
        draft.reportingLines.unshift({
          id: rowId,
          personId,
          managerId,
          kind,
          shareH: share.value,
          shareInvalid: false,
          rights: rights.value,
          fromISO,
          toISO,
          note,
          declaredAt: at.toISOString(),
          declaredBySeatId: seat.fullAccess ? null : seat.id,
          endedAt: null,
          endReason: '',
          history: [],
          status: toISO ? 'ended' : 'active',
        });
        // The graph, not a second table: the line IS a reporting edge. The home
        // line is deliberately NOT written — `person.managerId` already records
        // it, and a second copy of the same fact is a fact waiting to drift.
        if (!isHomeAllocation) {
          ensureEntityLink(draft, {
            sourceType: 'person',
            sourceId: personId,
            targetType: 'person',
            targetId: managerId,
            relation: MATRIX_RELATION,
            ruleId: '',
            summary: `Declared ${kindLabel} reporting line: ${personName} is accountable to ${managerName} for ${shareLabel}.`,
          }, { idFactory, todayStr: dayKey(at), nowIso: at.toISOString() });
        }
      }, {
        type: MATRIX_EVENTS.DECLARE,
        entity: 'matrixline',
        entityId: rowId,
        summary: `Reporting line declared: ${personName} → ${managerName} (${kindLabel}, ${shareLabel}).`.slice(0, 300),
      });
      return saved({ id: rowId, personId, managerId, kind, shareH: share.value });
    },

    /**
     * Change the allocation and/or the rights on a declared line. The previous
     * value is kept on the row; the change is an act, not an overwrite.
     */
    matrixRetuneLine(input = {}) {
      const check = seatFor('declare-matrix-line');
      if (!check.ok) return check;
      const { seat, built } = check;
      const id = String(input.id || '').trim();
      const row = lines().find((r) => r && r.id === id);
      if (!row) return fail('That reporting line no longer exists.', 'id');
      if (row.status !== 'active') return fail('That line has already been dated out. Declare a new one instead of retuning a closed line.', 'id');

      const eligible = declarationEligibility(seat, built, row.personId, row.managerId);
      if (!eligible.ok) return fail(eligible.error, eligible.field);

      const hasShare = Object.prototype.hasOwnProperty.call(input, 'shareH');
      const hasRights = Object.prototype.hasOwnProperty.call(input, 'rights');
      if (!hasShare && !hasRights) return fail('State a new allocation, a new set of decision rights, or both. Nothing was changed.', 'shareH');

      let shareH = row.shareH;
      if (hasShare) {
        const parsed = readShareInput(input);
        if (!parsed.ok) return fail(parsed.error, parsed.field);
        shareH = parsed.value;
      }
      let rights = row.rights;
      if (hasRights) {
        const parsed = readRightsInput(input);
        if (!parsed.ok) return fail(parsed.error, parsed.field);
        rights = parsed.value;
      }
      if (shareH === row.shareH && JSON.stringify(rights) === JSON.stringify(row.rights || [])) {
        return fail('That is the allocation and the rights the line already holds. Nothing was changed.', 'shareH');
      }

      const at = clock();
      store.update((draft) => {
        draft.reportingLines = Array.isArray(draft.reportingLines) ? draft.reportingLines : [];
        const target = draft.reportingLines.find((r) => r && r.id === id);
        if (!target) return;
        target.history = Array.isArray(target.history) ? target.history : [];
        target.history.push({ at: at.toISOString(), shareH: row.shareH, rights: row.rights || [] });
        target.history = target.history.slice(-MATRIX_LIMITS.history);
        target.shareH = shareH;
        target.rights = rights;
        target.shareInvalid = false;
      }, {
        type: MATRIX_EVENTS.RETUNE,
        entity: 'matrixline',
        entityId: id,
        summary: `Reporting line retuned: allocation ${formatShareH(row.shareH) ?? 'undeclared'} → ${formatShareH(shareH) ?? 'undeclared'}; rights ${(row.rights || []).length} → ${rights.length}.`.slice(0, 300),
      });
      return saved({ id, shareH, rights });
    },

    /** Date a line out, with the reason recorded. Append-only. */
    matrixEndLine(input = {}) {
      const check = seatFor('declare-matrix-line');
      if (!check.ok) return check;
      const { seat, built } = check;
      const id = String(input.id || '').trim();
      const row = lines().find((r) => r && r.id === id);
      if (!row) return fail('That reporting line no longer exists.', 'id');
      if (row.status !== 'active') return fail('That line is already dated out.', 'id');
      const eligible = declarationEligibility(seat, built, row.personId, row.managerId);
      if (!eligible.ok) return fail(eligible.error, eligible.field);
      const reason = String(input.reason || '').trim().slice(0, MATRIX_LIMITS.reasonChars);
      if (reason.length < 8) return fail('Write one line saying why this line no longer holds. A closed line with no reason is an accountability nobody can be asked about.', 'reason');
      const toRaw = String(input.toISO || '').trim();
      const toISO = /^\d{4}-\d{2}-\d{2}$/.test(toRaw) ? toRaw : dayKey(clock());
      if (new Date(`${toISO}T00:00:00.000Z`).toISOString().slice(0, 10) !== toISO) {
        return fail('Give the end date as a real calendar day (YYYY-MM-DD).', 'toISO');
      }
      if (toISO < row.fromISO) return fail('A line cannot end before it started.', 'toISO');

      const at = clock();
      store.update((draft) => {
        draft.reportingLines = Array.isArray(draft.reportingLines) ? draft.reportingLines : [];
        const target = draft.reportingLines.find((r) => r && r.id === id);
        if (!target) return;
        target.toISO = toISO;
        target.status = 'ended';
        target.endedAt = at.toISOString();
        target.endReason = reason;
      }, {
        type: MATRIX_EVENTS.END,
        entity: 'matrixline',
        entityId: id,
        summary: `Reporting line ended on ${toISO}: ${reason}`.slice(0, 300),
      });
      return saved({ id, toISO });
    },

    /**
     * A deliberate structural scan. The report itself remains a pure read; the
     * scan sends one event through the shared post-commit spine so RULE-MCO-01
     * can write an idempotent aggregate trace when fragmentation or an
     * incomplete allocation needs to be visible beyond this panel.
     */
    matrixCoordinationScan() {
      const check = seatFor('declare-matrix-line');
      if (!check.ok) return check;
      const at = clock();
      store.update(() => {}, {
        type: MATRIX_EVENTS.COORDINATION_SCAN,
        entity: 'matrixcoordination',
        entityId: 'matrix',
        summary: 'Matrix coordination topology scan requested.'.slice(0, 300),
      });
      return saved({
        report: buildMatrixCoordination(store.state, { now: at, settings: settings() }),
      });
    },

    matrixSetConventions(input = {}) {
      const check = seatFor('declare-matrix-line');
      if (!check.ok) return check;
      const { seat } = check;
      if (!seat.fullAccess && Number(seat.rank) < 4) {
        return fail('Re-declaring the matrix conventions is a rank-4+ full-access act. The numbers are printed on the panel precisely so they can be argued with before they are changed.');
      }
      const current = normalizeMatrixSettings(settings());
      const next = normalizeMatrixSettings({
        ...settings(),
        matrixBalanceHundredths: Object.prototype.hasOwnProperty.call(input, 'matrixBalanceHundredths')
          ? input.matrixBalanceHundredths : current.matrixBalanceHundredths,
        matrixExpiringDays: Object.prototype.hasOwnProperty.call(input, 'matrixExpiringDays')
          ? input.matrixExpiringDays : current.matrixExpiringDays,
        matrixAutoPropagate: Object.prototype.hasOwnProperty.call(input, 'matrixAutoPropagate')
          ? input.matrixAutoPropagate : current.matrixAutoPropagate,
      });
      const at = clock();
      store.update((draft) => {
        draft.settings = { ...(draft.settings || {}), ...next };
      }, {
        type: MATRIX_EVENTS.CONVENTIONS,
        entity: 'settings',
        entityId: 'matrix',
        summary: `Matrix conventions re-declared: balance tolerance ${next.matrixBalanceHundredths} hundredths, expiring window ${next.matrixExpiringDays} day(s), auto-propagation ${next.matrixAutoPropagate ? 'on' : 'off'}.`.slice(0, 300),
      });
      return saved({ conventions: next });
    },
  };
}

export { matrixAttentionCount };
