/**
 * app/core/domain/disclosureActions.js — API mixin for the Disclosure Compiler
 * (Schema v90, ADR-0085). Mounted via `Object.assign(api, ...)` like every other
 * reviewed module: one command bus, one guarded boundary.
 *
 * The write path is four commands and no more:
 *   request  — ask the span that owns the detail for a bounded release.
 *   consent  — the span leader agrees (the only command that creates authority).
 *   refuse   — the span leader declines, with a reason that is kept.
 *   revoke   — either side, or the enterprise seat, ends a live release early.
 *
 * Every command re-derives the rule it enforces from the same pure validators the
 * console renders, so the button, the API and the test cannot drift apart.
 */
import { addDays, dayKey } from '../time.js';
import { buildSeats, activeSeat, canAct } from './seat.js';
import {
  activeGrants, disclosureBriefText as briefOf, disclosureCsvRows as csvOf,
  disclosureAttentionCount as countOf, disclosureReport, disclosureConventions,
  validateGrantRequest,
} from './disclosure.js';
import { normalizeDisclosureGrant, normalizeDisclosureGrants } from './disclosureSchema.js';
import { DISCLOSURE_EVENTS, DISCLOSURE_LIMITS } from './disclosureRegistry.js';

export function createDisclosureActions(store, { now, idFactory, createApi }) {
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
  const seatOf = () => {
    const built = buildSeats(store.state, { now: clock(), settings: settings() });
    return { built, seat: activeSeat(built) };
  };
  const grants = () => (Array.isArray(store.state.disclosureGrants) ? store.state.disclosureGrants : []);
  const grantById = (id) => grants().find((g) => g && g.id === id) || null;
  const stamp = () => clock().toISOString();

  function report(seatOverride = null) {
    const { built, seat } = seatOf();
    const effective = seatOverride && !seat.fullAccess ? seat : seat;
    return disclosureReport(store.state, { now: clock(), settings: settings(), seat: effective, built });
  }

  function pushHistory(row, type, by, summary) {
    if (!Array.isArray(row.history)) row.history = [];
    row.history.push({ at: stamp(), type, by: by || '', summary: String(summary).slice(0, 300) });
    if (row.history.length > DISCLOSURE_LIMITS.history) row.history.splice(0, row.history.length - DISCLOSURE_LIMITS.history);
  }

  return {
    /**
     * The console's read model. Pure — it compiles postures and aggregates and
     * writes nothing. `seatId` is accepted so a leader can preview a peer seat
     * from the operator view; under a declared seat it is ignored, because a
     * seat cannot preview the disclosure posture of another seat.
     */
    disclosureRead(seatId = null) {
      const { built, seat } = seatOf();
      let effective = seat;
      if (seat.fullAccess && seatId) {
        const candidate = built.byId.get(String(seatId));
        if (!candidate) return fail('That seat is not in this roster.', 'seatId');
        effective = candidate;
      }
      const reportBody = disclosureReport(store.state, { now: clock(), settings: settings(), seat: effective, built });
      return { ok: true, ...reportBody };
    },

    disclosureGrantRead(grantId) {
      const row = grantById(grantId);
      if (!row) return fail('Choose a release in this workspace.', 'grantId');
      const { seat } = seatOf();
      if (!seat.fullAccess && !(seat.scope?.has(row.spanId) || row.requesterSeatId === seat.id)) {
        return fail('That release names a span outside your operating seat.', 'scope');
      }
      return { ok: true, grant: row, history: row.history || [] };
    },

    /** Ask the span that owns the detail for a bounded, expiring release. */
    disclosureRequest(input = {}) {
      const { built, seat } = seatOf();
      const right = canAct('request-disclosure', seat);
      if (!right.allow) return fail(right.reason, 'scope');
      const verdict = validateGrantRequest(store.state, seat, built, input, { now: clock(), settings: settings() });
      if (!verdict.ok) return fail(verdict.error, verdict.field);
      const today = dayKey(clock());
      const record = {
        id: idFactory('grant'),
        ...verdict.value,
        status: 'requested',
        requestedOn: today,
        requestedAt: stamp(),
        consentFromId: null,
        grantedOn: null,
        grantedAt: null,
        expiresOn: null,
        refusedOn: null,
        refusedReason: '',
        revokedOn: null,
        revokedReason: '',
        expiredOn: null,
        decisionId: null,
        reviewOn: null,
        reviewedOn: null,
        createdAt: stamp(),
        history: [{ at: stamp(), type: 'requested', by: seat.id || '', summary: `Release requested for ${verdict.value.spanLabel} on ${verdict.value.moduleLabel} for ${verdict.value.days} day(s).` }],
      };
      const normalized = normalizeDisclosureGrant(record, [], { now: stamp(), today });
      if (!normalized) return fail('The request could not be recorded safely and nothing was changed.', 'scope');
      store.update((draft) => {
        draft.disclosureGrants = Array.isArray(draft.disclosureGrants) ? draft.disclosureGrants : [];
        draft.disclosureGrants.unshift(normalized);
      }, {
        type: DISCLOSURE_EVENTS.REQUESTED,
        entity: 'disclosuregrant',
        entityId: normalized.id,
        summary: `Disclosure release requested: ${normalized.moduleLabel} detail for ${normalized.spanLabel} (${normalized.days}d)`,
      });
      return saved({ grant: grantById(normalized.id) });
    },

    /**
     * The span leader agrees. This is the ONLY command in the workspace that
     * creates disclosure authority, and it refuses to be the requester.
     */
    disclosureConsent(grantId) {
      const { seat } = seatOf();
      const row = grantById(grantId);
      if (!row) return fail('Choose a release in this workspace.', 'grantId');
      const right = canAct('consent-disclosure', seat);
      if (!right.allow) return fail(right.reason, 'scope');
      if (row.status !== 'requested') return fail(`That request is ${row.status}; only an open request can be consented to.`, 'grantId');
      if (seat.fullAccess) return fail('Consent is the span leader’s act. Declare the seat of the span that owns these records — the operator view cannot consent on their behalf.', 'scope');
      if (seat.id !== row.spanId) {
        return fail(`Only the leader of ${row.spanLabel || row.spanId} can consent to widening its records. That is a different seat from yours.`, 'scope');
      }
      if (seat.id === row.requesterSeatId) return fail('A span cannot consent to its own upward disclosure.', 'scope');
      const conventions = disclosureConventions(settings());
      const days = Math.min(DISCLOSURE_LIMITS.maxDays, conventions.disclosureMaxDays, Math.max(DISCLOSURE_LIMITS.minDays, row.days));
      const today = dayKey(clock());
      store.update((draft) => {
        const target = (draft.disclosureGrants || []).find((g) => g.id === row.id);
        if (!target) return;
        target.status = 'granted';
        target.consentFromId = seat.id;
        target.grantedOn = today;
        target.grantedAt = stamp();
        target.expiresOn = dayKey(addDays(today, days));
        target.reviewOn = target.expiresOn;
        target.days = days;
        pushHistory(target, 'consented', seat.id, `Consented for ${days} day(s), expiring ${target.expiresOn}. Detail is bounded to this span and this screen.`);
      }, {
        type: DISCLOSURE_EVENTS.CONSENTED,
        entity: 'disclosuregrant',
        entityId: row.id,
        summary: `Disclosure release consented by ${row.spanLabel}: ${row.moduleLabel} detail for ${days} day(s)`,
      });
      return saved({ grant: grantById(row.id) });
    },

    /** Decline, with a reason the record keeps. Declining is a normal outcome. */
    disclosureRefuse(grantId, reason = '') {
      const { seat } = seatOf();
      const row = grantById(grantId);
      if (!row) return fail('Choose a release in this workspace.', 'grantId');
      const right = canAct('consent-disclosure', seat);
      if (!right.allow) return fail(right.reason, 'scope');
      if (row.status !== 'requested') return fail(`That request is ${row.status}; only an open request can be refused.`, 'grantId');
      const allowed = seat.fullAccess || seat.id === row.spanId;
      if (!allowed) return fail(`Only the leader of ${row.spanLabel || row.spanId} can refuse a request for its records.`, 'scope');
      const clean = String(reason || '').trim();
      if (clean.length < 8) return fail('Write at least 8 characters of reason. A refusal the requester cannot learn from will be repeated.', 'reason');
      const today = dayKey(clock());
      store.update((draft) => {
        const target = (draft.disclosureGrants || []).find((g) => g.id === row.id);
        if (!target) return;
        target.status = 'refused';
        target.refusedOn = today;
        target.refusedReason = clean.slice(0, 300);
        pushHistory(target, 'refused', seat.id || '', clean);
      }, {
        type: DISCLOSURE_EVENTS.REFUSED,
        entity: 'disclosuregrant',
        entityId: row.id,
        summary: `Disclosure release refused by ${row.spanLabel}: ${clean.slice(0, 160)}`,
      });
      return saved({ grant: grantById(row.id) });
    },

    /** Either party — or the enterprise seat — ends a live release early. */
    disclosureRevoke(grantId, reason = '') {
      const { seat } = seatOf();
      const row = grantById(grantId);
      if (!row) return fail('Choose a release in this workspace.', 'grantId');
      const right = canAct('consent-disclosure', seat);
      if (!right.allow) return fail(right.reason, 'scope');
      if (row.status !== 'granted') return fail(`That release is ${row.status}; only a live release can be revoked.`, 'grantId');
      const allowed = seat.fullAccess
        || seat.id === row.spanId
        || seat.id === row.requesterSeatId
        || (seat.isLeader && seat.rank >= 5);
      if (!allowed) return fail('Only the requesting seat, the span that consented, or the enterprise seat can end a release.', 'scope');
      const clean = String(reason || '').trim();
      if (clean.length < 8) return fail('Write at least 8 characters of reason; an early revocation is a fact the review needs.', 'reason');
      const today = dayKey(clock());
      store.update((draft) => {
        const target = (draft.disclosureGrants || []).find((g) => g.id === row.id);
        if (!target) return;
        target.status = 'revoked';
        target.revokedOn = today;
        target.revokedReason = clean.slice(0, 300);
        pushHistory(target, 'revoked', seat.id || '', clean);
      }, {
        type: DISCLOSURE_EVENTS.REVOKED,
        entity: 'disclosuregrant',
        entityId: row.id,
        summary: `Disclosure release revoked: ${clean.slice(0, 160)}`,
      });
      return saved({ grant: grantById(row.id) });
    },

    /** Explicit sweep: expiry, review tasks and stale edges. Always runs. */
    disclosureScan() {
      const { seat } = seatOf();
      store.update(() => {}, {
        type: DISCLOSURE_EVENTS.SCAN,
        entity: 'disclosurgrant:scan',
        entityId: '',
        summary: `Disclosure sweep requested from ${seat?.label || 'the operator view'}`,
      });
      const reportBody = report();
      return {
        ok: true,
        ...reportBody,
        expired: (reportBody.grants || []).filter((g) => g.status === 'expired').length,
        propagations: store.lastPropagations || [],
        saved: !store.persistError,
      };
    },

    disclosureBriefText() {
      const reportBody = report();
      return { ok: true, text: briefOf(reportBody) };
    },

    disclosureCsvRows() {
      const reportBody = report();
      return { ok: true, rows: csvOf(reportBody) };
    },

    disclosureAttentionCount() {
      return countOf(report());
    },

    /** Operator-only: pause the automatic paperwork, never the explicit scan. */
    setDisclosureAutoPropagate(on) {
      if (store.state.settings?.activeSeatId) return fail('Under a declared seat, automation pauses are reviewed settings adapters; this one is operator-only.', 'scope');
      const value = on !== false;
      store.update((draft) => { draft.settings.disclosureAutoPropagate = value; }, {
        type: DISCLOSURE_EVENTS.AUTOPROPAGATE,
        entity: 'disclosuregrant',
        entityId: '',
        summary: `Disclosure automatic paperwork ${value ? 'resumed' : 'paused'}`,
      });
      return { ok: true, disclosureAutoPropagate: value };
    },

    /** Exposed for tests and for the console's live preview. */
    disclosureGrants() {
      const { seat } = seatOf();
      const rows = normalizeDisclosureGrants(store.state.disclosureGrants, [], { now: stamp(), today: dayKey(clock()) });
      if (seat.fullAccess) return { ok: true, grants: rows };
      return { ok: true, grants: rows.filter((g) => g.spanId === seat.id || g.requesterSeatId === seat.id || seat.scope?.has(g.spanId)) };
    },
  };
}
