/**
 * app/core/domain/prospectiveActions.js — commands and scoped adapters for the
 * Prospective Intervention Contract (ADR-0094).
 *
 * Reads are pure adapters over one report. The only writes are: DECLARE a
 * frozen bet, SCAN for due outcomes, and SET the conventions (rank 3+). The
 * governed DACI decision, the owned outcome task, the typed provenance and the
 * vertical roll-up are NOT written here — they are produced by RULE-PIC-01 on
 * the shared post-commit spine in the SAME atomic transaction. That is the
 * whole point: no second command bus, no per-module glue.
 */
import { addDays, dayKey } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import {
  buildProspectiveReport,
  cohortFingerprint,
  freezeCohort,
  prospectiveAttentionCount,
  prospectiveBriefText,
  prospectiveCsvRows,
} from './prospective.js';
import {
  PROSPECTIVE_ENGINE_VERSION,
  PROSPECTIVE_EVENTS,
  PROSPECTIVE_LIMITS,
} from './prospectiveRegistry.js';
import {
  prospectiveConventions,
  validateProspectiveDeclaration,
} from './prospectiveSchema.js';

export function createProspectiveActions(store, { now, idFactory }) {
  const fail = (error, field = null) => ({ ok: false, error, ...(field ? { field } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date());
  const saved = (extra = {}) => ({
    ok: true,
    ...extra,
    saved: !store.persistError,
    warning: store.persistError || null,
    propagations: store.lastPropagations || [],
  });
  const report = () => buildProspectiveReport(store.state, { now: clock() });
  const seatRight = () => {
    const built = buildSeats(store.state, { now: clock(), settings: store.state.settings || {} });
    const seat = activeSeat(built);
    if (seat.readOnly) return { ok: false, error: 'The declared seat is unresolved and read-only. Choose a valid seat before declaring a bet.' };
    const right = canAct('declare-prospective', seat);
    return right.allow ? { ok: true, seat, built } : { ok: false, error: right.reason };
  };

  return {
    prospectiveRead() {
      return report();
    },

    prospectiveBriefText() {
      const current = report();
      return current.ok ? { ok: true, text: prospectiveBriefText(current) } : current;
    },

    prospectiveCsvRows() {
      const current = report();
      return current.ok ? { ok: true, rows: prospectiveCsvRows(current) } : current;
    },

    prospectiveAttentionCount() {
      return prospectiveAttentionCount(store.state, { now: clock(), settings: store.state.settings || {} });
    },

    /**
     * Pre-register one bet. The population, probability, threshold and horizon
     * are frozen BEFORE any governed work exists; RULE-PIC-01 then creates that
     * work. A second identical declaration on the same day is idempotent.
     */
    prospectiveDeclare(input = {}) {
      const right = seatRight();
      if (!right.ok) return fail(right.error);
      const valid = validateProspectiveDeclaration(input);
      if (!valid.ok) return fail(valid.error, valid.field);
      const nowValue = clock();
      const today = dayKey(nowValue);
      const conventions = prospectiveConventions(store.state.settings || {});
      const horizonOn = addDays(today, valid.declaration.horizonDays);
      const frozen = freezeCohort(store.state, valid.declaration.instrumentKey, right.seat.scope, {
        declaredOn: today,
        horizonOn,
        evidenceFloor: conventions.prospectiveEvidenceFloor,
      });
      if (!frozen.ok) return fail(frozen.reason, 'instrumentKey');
      const existing = (Array.isArray(store.state.prospectiveContracts) ? store.state.prospectiveContracts : [])
        .find((row) => row && row.scopeSeatId === right.seat.id
          && row.declaredOn === today && row.instrumentKey === valid.declaration.instrumentKey);
      if (existing) return saved({ id: existing.id, existing: true, report: report() });
      if ((Array.isArray(store.state.prospectiveContracts) ? store.state.prospectiveContracts : []).length >= PROSPECTIVE_LIMITS.contracts) {
        return fail(`The frozen contract ledger is full at ${PROSPECTIVE_LIMITS.contracts} bets. Export the current brief before declaring another.`);
      }
      const contract = {
        id: idFactory('pic'),
        title: valid.declaration.title,
        declaredOn: today,
        horizonOn,
        scopeSeatId: right.seat.id,
        altitudeKey: right.seat.altitudeKey || 'chief',
        rank: right.seat.rank,
        instrumentKey: valid.declaration.instrumentKey,
        probabilityPct: valid.declaration.probabilityPct,
        thresholdPct: valid.declaration.thresholdPct,
        cohortN: frozen.n,
        cohortIds: frozen.ids,
        cohortFingerprint: cohortFingerprint(frozen.ids),
        engineVersion: PROSPECTIVE_ENGINE_VERSION,
        createdAt: nowValue.toISOString(),
      };
      store.update((draft) => {
        draft.prospectiveContracts = Array.isArray(draft.prospectiveContracts) ? draft.prospectiveContracts : [];
        draft.prospectiveContracts.unshift(contract);
      }, {
        type: PROSPECTIVE_EVENTS.DECLARED,
        entity: 'prospectivecontract',
        entityId: contract.id,
        summary: `Pre-registered a ${valid.declaration.probabilityPct}% bet over a frozen cohort of ${frozen.n} record(s); governed work, typed provenance and vertical roll-up requested`,
      });
      return saved({ id: contract.id, existing: false, cohortN: frozen.n, report: report() });
    },

    /** Explicitly grade every due, resolvable contract in this seat's scope. */
    prospectiveScan() {
      const right = seatRight();
      if (!right.ok) return fail(right.error);
      const full = right.seat.fullAccess;
      store.update(() => {}, {
        type: PROSPECTIVE_EVENTS.SCAN,
        entity: full ? 'workspace' : 'prospective',
        entityId: full ? 'all' : right.seat.id,
        summary: 'Explicitly graded due pre-registered contracts from the frozen cohorts and opened bounded governed findings',
      });
      return saved({ report: report() });
    },

    /** Director+ only: these conventions bound what every altitude below reads. */
    prospectiveSetConventions({ evidenceFloor = null, cellFloor = null, skillFloorPct = null, reviewDays = null } = {}) {
      const right = seatRight();
      if (!right.ok) return fail(right.error);
      if (right.seat.rank < 3) return fail('The calibration conventions are set at director rank and above; they bound what every altitude reads.');
      const patch = {
        ...(evidenceFloor === null ? {} : { prospectiveEvidenceFloor: evidenceFloor }),
        ...(cellFloor === null ? {} : { prospectiveCellFloor: cellFloor }),
        ...(skillFloorPct === null ? {} : { prospectiveSkillFloorPct: skillFloorPct }),
        ...(reviewDays === null ? {} : { prospectiveReviewDays: reviewDays }),
      };
      const next = prospectiveConventions({ ...store.state.settings, ...patch });
      const current = prospectiveConventions(store.state.settings || {});
      if (Object.keys(next).every((key) => next[key] === current[key])) {
        return fail('The declared evidence, cell, skill and review conventions are unchanged; nothing was written.');
      }
      store.update((draft) => {
        draft.settings = { ...draft.settings, ...next };
      }, {
        type: PROSPECTIVE_EVENTS.CONVENTIONS,
        entity: 'settings',
        entityId: 'prospective',
        summary: `Prospective conventions set: evidence floor ${next.prospectiveEvidenceFloor}, cell floor ${next.prospectiveCellFloor}, skill floor ${next.prospectiveSkillFloorPct}%, review ${next.prospectiveReviewDays}d`,
      });
      return saved({ conventions: next, report: report() });
    },
  };
}
