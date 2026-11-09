/**
 * app/core/domain/jurisdictionActions.js — commands and scoped adapters for the
 * Jurisdiction Compiler (ADR-0109, ADR-0111).
 *
 * Reads are pure, seat-scoped adapters (SAFE_READS in the access gateway). The
 * writes are deliberate and span-checked:
 *
 *   scan            explicitly re-detect, re-price, govern, grade and roll up
 *                   every cross-branch objective now. Never moves a reporting
 *                   line, never reassigns a case, never accepts a proposal.
 *   anchorWork      anchor or re-point an open work record inside this seat's
 *                   own detail boundary to a live goal, writing a persistent
 *                   `impacts-goal` graph edge and waking RULE-JUR-01 in the
 *                   same atomic transaction.
 *   setConventions  re-declare the printed, clamped conventions (rank 4-5 and a
 *                   full-access seat only); this also re-declares ADR-0115's
 *                   drift week floor, coverage and look-back window.
 *   driftScan       freeze this ISO week's readings, grade the cross-week
 *                   conformal bands and govern a published crossing (RULE-JUR-05).
 *
 * Findings, governed decisions, typed edges, once-only grades and identity-free
 * span readings are produced by RULE-JUR-01..05 on the SHARED post-commit spine
 * in the SAME atomic transaction — never by a second workflow engine here.
 */

import { dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { activeSeat, buildSeats, canAct, canSee } from './seat.js';
import { matrixLineScopeFor } from './matrix.js';
import {
  buildJurisdictionBook, jurisdictionRead, jurAttentionCount, jurBrief,
  jurConventions, jurCsvRows, jurSpanRollUp, isEngineAuditRecord, workRecordPeople,
} from './jurisdiction.js';
import { normalizeJurSettings } from './jurisdictionSchema.js';
import { jurDriftRead } from './jurisdictionDrift.js';
import { rehearseBoundaryRedraw, redactRehearsalReport } from './redrawRehearsal.js';
import { JUR_EVENTS, JUR_RULE_IDS, JUR_SOURCES } from './jurisdictionRegistry.js';

export function createJurisdictionActions(store, { now, idFactory }) {
  const fail = (error, field = null) => ({ ok: false, error, ...(field ? { field } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  const saved = (extra = {}) => ({
    ok: true,
    ...extra,
    saved: !store.persistError,
    warning: store.persistError || null,
    propagations: store.lastPropagations || [],
  });
  const conventions = () => jurConventions(settings());

  const seatFor = (right, { fullAccess = false } = {}) => {
    const at = clock();
    const eff = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: eff });
    const built = buildSeats(store.state, { now: at, settings: eff, ...(lineScope ? { lineScope } : {}) });
    const seat = activeSeat(built);
    if (seat.readOnly) {
      return { ok: false, error: 'The declared seat is unresolved and read-only. Choose a valid seat before changing the jurisdiction ledger.' };
    }
    const verdict = canAct(right, seat);
    if (!verdict.allow) return { ok: false, error: verdict.reason };
    if (fullAccess && !seat.fullAccess) {
      return { ok: false, error: 'Re-declaring the jurisdiction conventions re-prices every cross-branch objective in the workspace. Only a full-access seat may declare them.' };
    }
    return { ok: true, seat, built };
  };

  return {
    /* -------------------------------------------------------------- scan */
    jurScan() {
      const right = seatFor('record-jurisdiction');
      if (!right.ok) return fail(right.error);
      store.update(() => {}, {
        type: JUR_EVENTS.SCAN,
        entity: right.seat.fullAccess ? 'workspace' : 'jurisdiction',
        entityId: right.seat.fullAccess ? 'all' : right.seat.id,
        summary: 'Explicitly re-detected cross-branch objectives, priced the governance routes, opened governed decisions and rolled up identity-free span readings',
      });
      return saved({ report: jurisdictionRead(store.state, { now: clock(), settings: settings() }) });
    },

    /* ------------------------------------------------------ drift scan */
    jurDriftScan() {
      const right = seatFor('record-jurisdiction');
      if (!right.ok) return fail(right.error);
      store.update(() => {}, {
        type: JUR_EVENTS.DRIFT,
        entity: right.seat.fullAccess ? 'workspace' : 'jurisdiction',
        entityId: right.seat.fullAccess ? 'all' : right.seat.id,
        summary: 'Froze this ISO week’s identity-free span readings, graded the cross-week conformal drift bands and governed a published crossing',
      });
      return saved({ report: jurDriftRead(store.state, { now: clock(), settings: settings() }) });
    },

    /* -------------------------------------------------------- anchorWork */
    jurAnchorWork({ entityType, recordId, goalId } = {}) {
      const right = seatFor('record-jurisdiction');
      if (!right.ok) return fail(right.error);
      const { seat, built } = right;
      if (!seat.fullAccess && seat.rank > 2) {
        return fail('Above the manager detail ceiling, individual work records are withheld and cannot be re-anchored directly. Delegate pointer remediation to the owning span.');
      }
      const cleanType = String(entityType || '').trim();
      const source = JUR_SOURCES.find((s) => s.entityType === cleanType);
      if (!source) return fail('Choose a supported work record type (case, decision or portfolio).', 'entityType');
      const cleanId = String(recordId || '').trim();
      if (!cleanId) return fail('Choose a work record to anchor.', 'recordId');
      const record = (store.state[source.collection] || []).find((r) => r?.id === cleanId);
      if (!record) return fail('That work record no longer exists.', 'recordId');
      if (isEngineAuditRecord(record)) {
        return fail('Engine-authored governance findings are audit output and cannot be re-anchored as operational work.', 'recordId');
      }
      if (!seat.fullAccess) {
        const vis = canSee(record, source.collection, seat, built);
        if (vis.allow !== 'full') return fail(vis.reason || 'That work record is outside this seat’s detail boundary.', 'recordId');
        const people = workRecordPeople(record, built.chain);
        if (!people.length && !seat.isLeader) {
          return fail('Unowned work belongs to the enterprise root and cannot be re-anchored by a subordinate seat.', 'recordId');
        }
        const inAccountableSpan = (pid) => seat.scope.has(pid) || Boolean(seat.lineScope?.has(pid));
        if (people.length && !people.every(inAccountableSpan)) {
          return fail('That work record belongs to a peer span outside your reporting subtree.', 'recordId');
        }
      }
      const cleanGoalId = String(goalId || '').trim();
      if (!cleanGoalId) return fail('Choose an active goal to anchor this work record.', 'goalId');
      const goal = (store.state.goals || []).find((g) => g?.id === cleanGoalId);
      if (!goal) return fail('That goal no longer exists in this workspace.', 'goalId');
      if (goal.status === 'dropped') return fail('Dropped goals cannot anchor open work. Choose an active goal.', 'goalId');
      if (!seat.fullAccess && canSee(goal, 'goals', seat, built).allow !== 'full') {
        return fail('That goal is outside this seat’s visible scope.', 'goalId');
      }

      const at = clock();
      const nowIso = at.toISOString();
      const todayStr = dayKey(at);
      store.update((draft) => {
        const target = (draft[source.collection] || []).find((r) => r?.id === cleanId);
        if (!target) return;
        if (cleanType === 'case') {
          target.linkedGoalId = cleanGoalId;
          if (Array.isArray(target.linkedGoalIds)) target.linkedGoalIds = [cleanGoalId];
          target.updatedAt = nowIso;
        } else if (cleanType === 'portfolio') {
          if (!target.sourceType || target.sourceType === 'manual' || target.sourceType === 'goal') {
            target.sourceType = 'goal';
            target.sourceId = cleanGoalId;
          }
          target.updatedAt = nowIso;
        } else if (cleanType === 'decision') {
          delete target.linkedGoalId;
          delete target.goalId;
          delete target.linkedGoalIds;
        }
        draft.links = (Array.isArray(draft.links) ? draft.links : []).filter((l) => {
          if (!l || l.relation !== 'impacts-goal') return true;
          const forward = l.sourceType === cleanType && l.sourceId === cleanId && l.targetType === 'goal';
          const reverse = l.sourceType === 'goal' && l.targetType === cleanType && l.targetId === cleanId;
          return !forward && !reverse;
        });
        ensureEntityLink(draft, {
          sourceType: cleanType,
          sourceId: cleanId,
          targetType: 'goal',
          targetId: cleanGoalId,
          relation: 'impacts-goal',
          ruleId: JUR_RULE_IDS.DETECT,
          summary: 'Objective pointer anchored from Jurisdiction Compiler',
        }, { idFactory, todayStr, nowIso });
      }, {
        type: `${cleanType}.updated`,
        entity: cleanType,
        entityId: cleanId,
        summary: `Anchored ${source.label.toLowerCase()} to active objective`,
      });
      return saved({
        anchored: { entityType: cleanType, recordId: cleanId, goalId: cleanGoalId },
        report: jurisdictionRead(store.state, { now: clock(), settings: settings() }),
      });
    },

    /* ------------------------------------------------------ conventions */
    jurSetConventions(patch = {}) {
      const right = seatFor('govern-jurisdiction', { fullAccess: true });
      if (!right.ok) return fail(right.error);
      const before = normalizeJurSettings(settings());
      const merged = normalizeJurSettings({ ...before, ...(patch || {}) });
      const changed = Object.keys(merged).filter((key) => merged[key] !== before[key]);
      if (!changed.length) return saved({ changed: [] });
      store.update((draft) => {
        if (!draft.settings) draft.settings = {};
        Object.assign(draft.settings, merged);
      }, {
        type: JUR_EVENTS.CONVENTIONS,
        entity: 'jurisdiction',
        entityId: 'conventions',
        summary: `Changed jurisdiction conventions: ${changed.map((key) => `${key}=${merged[key]}`).join(', ')}`,
      });
      return saved({ changed, report: jurisdictionRead(store.state, { now: clock(), settings: settings() }) });
    },

    /* ------------------------------------------------------------ reads */
    jurDriftRead() {
      return saved({ report: jurDriftRead(store.state, { now: clock(), settings: settings() }) });
    },
    jurDriftCsvRows() {
      const report = jurDriftRead(store.state, { now: clock(), settings: settings() });
      return saved({ columns: report.columns, rows: report.rows });
    },
    jurDriftBriefText() {
      return saved({ brief: jurDriftRead(store.state, { now: clock(), settings: settings() }).brief });
    },
    jurRead() {
      return saved({ report: jurisdictionRead(store.state, { now: clock(), settings: settings() }) });
    },
    jurHygiene() {
      const report = jurisdictionRead(store.state, { now: clock(), settings: settings() });
      return saved({
        withheld: report.withheld,
        hygiene: report.book.hygiene,
        spanHygiene: report.spanHygiene,
        hygieneBySource: report.hygieneBySource,
        hygieneQueue: report.hygieneQueue,
        eligibleGoals: report.eligibleGoals,
      });
    },
    jurBriefText() {
      return saved({ brief: jurBrief(store.state, { now: clock(), settings: settings() }) });
    },
    jurCsvRows() {
      return saved({ rows: jurCsvRows(store.state, { now: clock(), settings: settings() }) });
    },
    jurConventions() {
      return saved({ conventions: conventions() });
    },
    jurAttentionCount() {
      return saved({ count: jurAttentionCount(store.state, clock(), settings()) });
    },
    jurSpanRollUp(nodeId) {
      const id = String(nodeId || '').trim();
      if (!id) return fail('Choose a span to read.', 'nodeId');
      return saved({ rollUp: jurSpanRollUp(store.state, {
        nodeId: id, now: clock(), conventions: conventions(),
      }) });
    },
    jurBook() {
      return saved({ book: buildJurisdictionBook(store.state, { now: clock(), conventions: conventions() }) });
    },
    jurRedrawRehearse({ moves = [] } = {}) {
      const at = clock();
      const eff = settings();
      const lineScope = matrixLineScopeFor(store.state, { now: at, settings: eff });
      const built = buildSeats(store.state, { now: at, settings: eff, ...(lineScope ? { lineScope } : {}) });
      const seat = activeSeat(built);
      if (seat.readOnly) {
        return fail('The declared seat is unresolved and read-only. Choose a valid seat before rehearsing a boundary redraw.');
      }
      if (!seat.fullAccess && seat.rank < 3) {
        return fail('The boundary rehearsal is a director-and-above instrument (rank 3 or higher).');
      }
      const raw = rehearseBoundaryRedraw(store.state, { moves, now: at, conventions: conventions() });
      if (seat.fullAccess) return saved({ report: raw });
      const scope = new Set([
        ...(seat.scope instanceof Set ? seat.scope : []),
        ...(seat.lineScope instanceof Set ? seat.lineScope : []),
      ]);
      return saved({ report: redactRehearsalReport(raw, scope) });
    },
  };
}

export const JUR_SCAN = JUR_EVENTS.SCAN;
