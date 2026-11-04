/**
 * app/core/domain/federationActions.js — commands and scoped adapters for the
 * Programme Federation Reading (ADR-0090).
 *
 * Reads are pure adapters. The only writes are: freeze an identity-reduced
 * assessment and run an explicit scan. Neither changes a reporting line, sends
 * a message, closes a decision or touches any measured channel.
 */
import { dayKey } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import {
  buildFederationReport,
  buildFederationSnapshot,
  federationBriefText,
  federationCsvRows,
  federationCsvSummary,
} from './federation.js';
import { FEDERATION_LIMITS } from './federationRegistry.js';
import { federationConventions } from './federationSchema.js';

export function createFederationActions(store, { now, idFactory }) {
  const fail = (error, field = null) => ({ ok: false, error, ...(field ? { field } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date());
  const saved = (extra = {}) => ({
    ok: true,
    ...extra,
    saved: !store.persistError,
    warning: store.persistError || null,
    propagations: store.lastPropagations || [],
  });
  const report = () => buildFederationReport(store.state, { now: clock() });
  const seatRight = () => {
    const built = buildSeats(store.state, { now: clock(), settings: store.state.settings || {} });
    const seat = activeSeat(built);
    if (seat.readOnly) {
      return { ok: false, error: 'The declared seat is unresolved and read-only. Choose a valid seat before freezing a federation reading.' };
    }
    const right = canAct('govern-federation', seat);
    return right.allow ? { ok: true, seat } : { ok: false, error: right.reason };
  };

  return {
    federationRead() {
      return report();
    },

    federationBriefText() {
      const current = report();
      return current.ok ? { ok: true, text: federationBriefText(current) } : current;
    },

    federationCsvRows() {
      const current = report();
      if (!current.ok) return current;
      return { ok: true, rows: federationCsvRows(current), summary: federationCsvSummary(current) };
    },

    federationAttentionCount() {
      const current = report();
      if (!current.ok) return 0;
      return Math.min(
        99,
        current.rows.filter((row) => row.state === 'silent' || row.state === 'bypass').length
          + current.openDecisions.length,
      );
    },

    federationFreeze() {
      const right = seatRight();
      if (!right.ok) return fail(right.error);
      const nowValue = clock();
      const today = dayKey(nowValue);
      const existing = (store.state.federationAssessments || []).find((row) => row
        && row.scopeSeatId === right.seat.id && row.frozenOn === today);
      if (existing) return saved({ id: existing.id, existing: true, report: report() });
      if ((store.state.federationAssessments || []).length >= FEDERATION_LIMITS.assessments) {
        return fail(`The immutable assessment ledger is full at ${FEDERATION_LIMITS.assessments} readings. Export the current reading before continuing.`);
      }
      const built = buildFederationSnapshot(store.state, {
        id: idFactory('federation'),
        now: nowValue,
      });
      if (!built.ok) return fail(built.error);
      store.update((draft) => {
        draft.federationAssessments = Array.isArray(draft.federationAssessments) ? draft.federationAssessments : [];
        draft.federationAssessments.unshift(built.assessment);
      }, {
        type: 'federation.assessed',
        entity: 'federationassessment',
        entityId: built.assessment.id,
        summary: 'Froze an identity-reduced federation assessment; span roll-up and any governed carriage findings requested',
      });
      return saved({ id: built.assessment.id, existing: false, report: report() });
    },

    federationScan() {
      const right = seatRight();
      if (!right.ok) return fail(right.error);
      store.update(() => {}, {
        type: 'federation.scan',
        // The operator scans the whole tree; a declared seat scans only its own
        // span, so an explicit re-measure can never open a peer span's findings.
        entity: right.seat.fullAccess ? 'workspace' : 'federation',
        entityId: right.seat.fullAccess ? 'all' : right.seat.id,
        summary: 'Explicitly re-measured carriage on the declared edges in scope and opened bounded carriage findings',
      });
      return saved({ report: report() });
    },

    federationSetConventions({ windowDays = null, minSpans = null, cellFloor = null } = {}) {
      const right = seatRight();
      if (!right.ok) return fail(right.error);
      if (right.seat.rank < 3) {
        return fail('The federation conventions are set at director rank and above; the floor and window bound what every altitude reads.');
      }
      const current = federationConventions(store.state.settings || {});
      const next = federationConventions({
        ...store.state.settings,
        ...(windowDays === null ? {} : { federationWindowDays: windowDays }),
        ...(minSpans === null ? {} : { federationMinSpans: minSpans }),
        ...(cellFloor === null ? {} : { federationCellFloor: cellFloor }),
      });
      if (next.federationWindowDays === current.federationWindowDays
        && next.federationMinSpans === current.federationMinSpans
        && next.federationCellFloor === current.federationCellFloor) {
        return fail('The declared window and floors are unchanged; nothing was written.');
      }
      store.update((draft) => {
        draft.settings = { ...draft.settings, ...next };
      }, {
        type: 'federation.conventions',
        entity: 'settings',
        entityId: 'federation',
        summary: `Federation conventions set: ${next.federationWindowDays}-day window, span floor ${next.federationMinSpans}, cell floor ${next.federationCellFloor}`,
      });
      return saved({ conventions: next, report: report() });
    },
  };
}
