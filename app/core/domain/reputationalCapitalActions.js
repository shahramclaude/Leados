/**
 * app/core/domain/reputationalCapitalActions.js — commands and scoped adapters
 * for the Reputational Capital Ledger (ADR-0101).
 *
 * Reads are pure adapters over the same engine the spine rules use. The writes
 * are deliberately few and deliberately narrow:
 *
 *   recordAct          a human names a dated act and its source record.
 *   openPosition       a dated guarantee or repair, with the CLAIM frozen at
 *                      open time (`claimP`) so RULE-RCL-05 can grade the ledger
 *                      against itself later instead of against hindsight.
 *   closePosition      a human closes a position. The engine never does.
 *   withdrawPosition   the human who offered a guarantee takes it back.
 *   setConventions     director+ changes the declared conventions.
 *   scan               explicit re-read; always runs, never pausable.
 *
 * None of them withholds a decision, edits a reporting line, sends a message,
 * rates a person, or writes a cell. There is nothing in this module that can
 * turn a reading into a judgement.
 */
import { dayKey } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import {
  buildReputationReport,
  reputationAttentionCount,
  reputationBriefText,
  reputationCsvRows,
  reputationSignals,
  cellReading,
  counterfactualActs,
  harvestActs,
} from './reputationalCapital.js';
import { reputationConventions } from './reputationalCapitalSchema.js';
import {
  ACT_CLASS_KEYS,
  ACT_STATUSES,
  ENGAGEMENT_TIER_KEYS,
  POSITION_KINDS,
  REPUTATION_EVENTS,
  REPUTATION_LIMITS,
  engagementTierMeta,
} from './reputationalCapitalRegistry.js';

const clean = (value, max = 200) => (typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');

export function createReputationActions(store, { now, idFactory }) {
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
  const report = (seatId = null) => buildReputationReport(store.state, { now: clock(), settings: settings(), seatId });
  const seatOf = () => {
    const built = buildSeats(store.state, { now: clock(), settings: settings() });
    return { built, seat: activeSeat(built) };
  };
  const right = (action) => {
    const { built, seat } = seatOf();
    if (!seat) return { ok: false, error: 'No operating seat is resolved; declare a seat before acting on reputational capital.' };
    if (seat.readOnly) return { ok: false, error: 'The declared seat is unresolved and read-only. Choose a valid seat first.' };
    const verdict = canAct(action, seat, { built });
    return verdict.allow ? { ok: true, seat, built } : { ok: false, error: verdict.reason };
  };

  const actions = {
    /* ------------------------------------------------------------- reads */
    reputationReport({ seatId = null } = {}) {
      return report(seatId);
    },

    reputationSignals() {
      return { ok: true, signals: reputationSignals(store.state, { now: clock(), settings: settings() }) };
    },

    reputationCsvRows() {
      const current = report();
      if (!current.ok) return current;
      return { ok: true, rows: reputationCsvRows(current), summary: { cells: current.totals.cellsN, acts: current.totals.actsN } };
    },

    reputationBriefText() {
      return { ok: true, text: reputationBriefText(report()) };
    },

    reputationAttentionCount() {
      return reputationAttentionCount(store.state, { now: clock(), settings: settings() });
    },

    reputationConventions() {
      return reputationConventions(settings());
    },

    /** What would make one cell carry the ask — priced in acts, per tier. */
    reputationCounterfactual({ personId, actClass } = {}) {
      const current = report();
      const reading = current.readings.find((row) => row.personId === personId && row.actClass === actClass);
      if (!reading) return fail('That cell is not readable at the active seat, or no act of that class is on record.');
      return { ok: true, reading, counterfactual: counterfactualActs(reading, current.conventions) };
    },

    /**
     * A dry-run: price a guarantee the leader is CONSIDERING, before opening it.
     * Nothing is written. This is the "what would this cost me to promise?"
     * question the whole module exists to answer, and it must be answerable
     * without leaving a record behind.
     */
    reputationPriceAsk({ personId, actClass, tier = 'vouching', askActs = null } = {}) {
      if (!personId) return fail('Name the counter-party whose promise you are pricing.', 'personId');
      if (!ACT_CLASS_KEYS.includes(actClass)) return fail('Choose the act class the promise rests on.', 'actClass');
      if (!ENGAGEMENT_TIER_KEYS.includes(tier)) return fail('Choose an engagement tier.', 'tier');
      const conv = reputationConventions(settings());
      const harvest = harvestActs(store.state, { now: clock(), conventions: conv });
      const today = dayKey(clock());
      const matching = harvest.acts.filter((act) => act.personId === personId && act.actClass === actClass);
      const reading = cellReading({
        kept: matching.filter((a) => a.status === 'kept').length,
        breached: matching.filter((a) => a.status === 'breached').length,
        disputed: matching.filter((a) => a.status === 'disputed').length,
        lastActOn: matching.map((a) => a.on).sort().slice(-1)[0] || null,
        actFloor: conv.reputationActFloor,
        exposureFloor: conv.reputationExposureFloor,
        windowDays: conv.reputationWindowDays,
        halfLifeDays: conv.reputationHalfLifeDays,
        hazardPct: conv.reputationClassHazard[actClass],
        priorActs: 2,
        gamma: conv.reputationObstacleGamma,
        askActs: Number.isFinite(Number(askActs)) ? Number(askActs) : conv.reputationAskActs,
        tier,
        now: today,
      });
      return {
        ok: true,
        reading,
        counterfactual: counterfactualActs(reading, conv),
        tier: engagementTierMeta(tier),
        claimP: reading.intervalLowPct === null ? null : Math.round((reading.intervalLowPct / 100) * 1000) / 1000,
      };
    },

    /* ------------------------------------------------------------ writes */
    /**
     * Record one dated act by hand. This exists for the work the workspace does
     * not already carry: a cross-team hand-off, a supplier commitment, a public
     * promise. Everything LeadOS itself dates is harvested automatically, so a
     * human who tries to record one of those is refused rather than creating a
     * second entry that would double-count.
     */
    reputationRecordAct({ personId, actClass, status, on, sourceType = 'manual', sourceId = null, note = '' } = {}) {
      const check = right('record-reputation-act');
      if (!check.ok) return fail(check.error);
      const person = (store.state.people || []).find((row) => row && row.id === personId);
      if (!person) return fail('That person is not in the roster.', 'personId');
      if (!ACT_CLASS_KEYS.includes(actClass)) return fail('Choose a valid act class.', 'actClass');
      if (!ACT_STATUSES.includes(status)) return fail('Choose a valid outcome: kept, breached, disputed or excused.', 'status');
      const day = dayKey(on || clock());
      if (!day) return fail('Choose a valid date for the act.', 'on');
      if (day > dayKey(clock())) return fail('An act cannot be dated in the future.', 'on');
      // Anti-double-counting: LeadOS already dates several act classes itself.
      // A hand-typed twin of an auto-derived act would spend the same capital twice.
      const conv = reputationConventions(settings());
      const derived = harvestActs(store.state, { now: clock(), conventions: conv }).acts
        .some((act) => act.personId === personId && act.actClass === actClass && act.on === day && act.status === status);
      const manual = (store.state.reputationActs || []).some((act) => act.personId === personId && act.actClass === actClass && act.on === day && act.status === status);
      if (manual) return fail('An identical act is already on record for that date.', 'on');
      if (derived && sourceType === 'manual') {
        return fail('The workspace already derives an act of this class for this person on this date from its own records. Recording it again would count the same work twice.', 'on');
      }
      const before = (store.state.reputationActs || []).length;
      if (before >= REPUTATION_LIMITS.acts) {
        return fail(`The hand-recorded act ledger is full at ${REPUTATION_LIMITS.acts}. Export the ledger before continuing.`);
      }
      const record = {
        id: idFactory('ract'),
        personId,
        actClass,
        status,
        on: day,
        derived: false,
        sourceType: clean(sourceType, 40) || 'manual',
        sourceId: clean(sourceId, 80) || null,
        recordedBy: check.seat.id,
        createdAt: clock().toISOString(),
      };
      store.update((draft) => {
        draft.reputationActs = Array.isArray(draft.reputationActs) ? draft.reputationActs : [];
        draft.reputationActs.push(record);
      }, {
        type: REPUTATION_EVENTS.ACT_RECORDED,
        entity: 'reputationact',
        entityId: record.id,
        summary: `Recorded a ${status} ${actClass} act; cell registration, any breach decision and the ancestor roll-up requested in the same transaction`,
      });
      return saved({ id: record.id, report: report() });
    },

    /**
     * Open a dated guarantee or repair. The claim is FROZEN HERE.
     *
     * `claimP` is the conservative end of the cell's interval at the moment the
     * promise is made — never the point estimate, and never recomputed later.
     * RULE-RCL-05 grades positions against exactly this number, which is what
     * makes the module's own error measurable instead of rhetorical.
     */
    reputationOpenPosition({
      personId, actClass, kind, tier = 'vouching', dueOn = null, askActs = 1,
      sourceType = null, sourceId = null, breaksActId = null, note = '',
    } = {}) {
      const check = right('offer-reputation-guarantee');
      if (!check.ok) return fail(check.error);
      const person = (store.state.people || []).find((row) => row && row.id === personId);
      if (!person) return fail('That person is not in the roster.', 'personId');
      if (!ACT_CLASS_KEYS.includes(actClass)) return fail('Choose a valid act class.', 'actClass');
      if (!POSITION_KINDS.includes(kind)) return fail('A position is either a guarantee or a repair.', 'kind');
      if (!ENGAGEMENT_TIER_KEYS.includes(tier)) return fail('Choose a valid engagement tier.', 'tier');
      const openedOn = dayKey(clock());
      const due = dueOn ? dayKey(dueOn) : null;
      if (dueOn && !due) return fail('Choose a valid due date, or leave it blank.', 'dueOn');
      if (due && due < openedOn) return fail('A position cannot be due before it opens.', 'dueOn');
      const ask = Math.round(Number(askActs));
      if (!Number.isFinite(ask) || ask < REPUTATION_LIMITS.askActsMin || ask > REPUTATION_LIMITS.askActsMax) {
        return fail(`The ask is measured in acts and must be between ${REPUTATION_LIMITS.askActsMin} and ${REPUTATION_LIMITS.askActsMax}.`, 'askActs');
      }
      if ((store.state.reputationPositions || []).length >= REPUTATION_LIMITS.positions) {
        return fail(`The position ledger is full at ${REPUTATION_LIMITS.positions}. Close or export the open positions first.`);
      }
      // The frozen claim: the interval's LOW end at open, or null when the cell
      // cannot be read. A null claim is kept null and will be graded as refused —
      // never filled in later with hindsight.
      //
      // ADR-0101: priced through the module's OWN function, not `this`. The
      // guard wraps every action as `(...args) => fn(...args)`, which unbinds
      // `this`; a method calling a sibling through `this` would throw at runtime
      // exactly when a user tried to open a position. One implementation, three
      // callers — called by name.
      const priced = actions.reputationPriceAsk({ personId, actClass, tier, askActs: ask });
      if (!priced.ok) return priced;
      const claimP = priced.claimP;
      const position = {
        id: idFactory('rpos'),
        personId,
        actClass,
        kind,
        tier,
        status: 'open',
        openedOn,
        dueOn: due,
        askActs: ask,
        closedOn: null,
        outcome: null,
        decisionId: null,
        breaksActId: clean(breaksActId, 80) || null,
        openedBy: check.seat.id,
        sourceType: sourceType ? clean(sourceType, 40) : null,
        sourceId: sourceId ? clean(sourceId, 80) : null,
        claimP,
        grade: null,
        createdAt: clock().toISOString(),
      };
      store.update((draft) => {
        draft.reputationPositions = Array.isArray(draft.reputationPositions) ? draft.reputationPositions : [];
        draft.reputationPositions.push(position);
      }, {
        type: REPUTATION_EVENTS.POSITION_OPENED,
        entity: 'reputationposition',
        entityId: position.id,
        summary: `Opened a ${kind} on the ${actClass} class (${tier} tier, ask ${ask} act(s), claim ${claimP === null ? 'refused' : `${Math.round(claimP * 100)}%`}); collateral review requested`,
      });
      return saved({ id: position.id, claimP, reading: priced.reading, counterfactual: priced.counterfactual, report: report() });
    },

    /** A human closes a position. The engine never does, and never invents an outcome. */
    reputationClosePosition({ positionId, outcome } = {}) {
      const check = right('offer-reputation-guarantee');
      if (!check.ok) return fail(check.error);
      if (!['kept', 'breached', 'withdrawn'].includes(outcome)) return fail('A position closes as kept, breached or withdrawn.', 'outcome');
      const position = (store.state.reputationPositions || []).find((row) => row && row.id === positionId);
      if (!position) return fail('That position no longer exists.');
      if (position.status !== 'open') return fail('That position is already closed.');
      store.update((draft) => {
        const row = (draft.reputationPositions || []).find((entry) => entry && entry.id === positionId);
        if (!row) return;
        row.status = outcome;
        row.outcome = outcome;
        row.closedOn = dayKey(clock());
      }, {
        type: REPUTATION_EVENTS.POSITION_CLOSED,
        entity: 'reputationposition',
        entityId: positionId,
        summary: `Closed a ${position.kind} on the ${position.actClass} class as ${outcome}; grading and any collateral decision requested`,
      });
      return saved({ id: positionId, report: report() });
    },

    /** Withdraw a guarantee: taking back a promise is a human act with a record. */
    reputationWithdrawPosition({ positionId } = {}) {
      return actions.reputationClosePosition({ positionId, outcome: 'withdrawn' });
    },

    /** Director+ re-declares the conventions. Every cell re-reads them next render. */
    reputationSetConventions(patch = {}) {
      const check = right('govern-reputation');
      if (!check.ok) return fail(check.error);
      const before = reputationConventions(settings());
      const next = reputationConventions({ ...settings(), ...(patch && typeof patch === 'object' ? patch : {}) });
      if (JSON.stringify(before) === JSON.stringify(next)) {
        return fail('That change would not move any declared convention; nothing was written.');
      }
      store.update((draft) => {
        draft.settings = { ...(draft.settings || {}), ...next };
      }, {
        type: REPUTATION_EVENTS.SCAN,
        entity: 'workspace',
        entityId: 'reputation-conventions',
        summary: 'Reputational-capital conventions re-declared; every cell, obstacle and verdict re-reads them',
      });
      return saved({ conventions: next, report: report() });
    },

    /** Explicit scan — never pausable, and it always runs the full rule chain. */
    reputationScan() {
      const check = right('record-reputation-act');
      if (!check.ok) return fail(check.error);
      store.update(() => {}, {
        type: REPUTATION_EVENTS.SCAN,
        entity: check.seat.fullAccess ? 'workspace' : 'reputation',
        entityId: check.seat.fullAccess ? 'all' : check.seat.id,
        summary: 'Explicitly re-read every reputational act, re-priced every open position and graded any tagged guarantee',
      });
      return saved({ report: report() });
    },
  };
  return actions;
}
