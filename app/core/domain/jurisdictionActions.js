/**
 * app/core/domain/jurisdictionActions.js — commands and scoped adapters for the
 * Jurisdiction Compiler (ADR-0109).
 *
 * Reads are pure, seat-scoped adapters (SAFE_READS in the access gateway). The
 * writes are exactly TWO, both deliberate:
 *
 *   scan            explicitly re-detect, re-price, govern, grade and roll up
 *                   every cross-branch objective now. Never moves a reporting
 *                   line, never reassigns a case, never accepts a proposal.
 *   setConventions  re-declare the printed, clamped conventions (rank 4-5 and a
 *                   full-access seat only).
 *
 * Findings, governed decisions, typed edges, once-only grades and identity-free
 * span readings are produced by RULE-JUR-01..04 on the SHARED post-commit spine
 * in the SAME atomic transaction — never by a second workflow engine here.
 */

import { activeSeat, buildSeats, canAct } from './seat.js';
import {
  buildJurisdictionBook, jurisdictionRead, jurAttentionCount, jurBrief,
  jurConventions, jurCsvRows, jurSpanRollUp,
} from './jurisdiction.js';
import { normalizeJurSettings } from './jurisdictionSchema.js';
import { JUR_EVENTS } from './jurisdictionRegistry.js';

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
    const built = buildSeats(store.state, { now: clock(), settings: settings() });
    const seat = activeSeat(built);
    if (seat.readOnly) {
      return { ok: false, error: 'The declared seat is unresolved and read-only. Choose a valid seat before changing the jurisdiction ledger.' };
    }
    const verdict = canAct(right, seat);
    if (!verdict.allow) return { ok: false, error: verdict.reason };
    if (fullAccess && !seat.fullAccess) {
      return { ok: false, error: 'Re-declaring the jurisdiction conventions re-prices every cross-branch objective in the workspace. Only a full-access seat may declare them.' };
    }
    return { ok: true, seat };
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
    jurRead() {
      return saved({ report: jurisdictionRead(store.state, { now: clock(), settings: settings() }) });
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
  };
}

export const JUR_SCAN = JUR_EVENTS.SCAN;
