/**
 * app/core/domain/workplaceAdjustmentActions.js — the seat-checked commands of
 * the Workplace Adjustment & Functional-Restriction Register (ADR-0241).
 *
 * SEVEN human acts and a scan, and nothing else: DECLARE a restriction, WITHDRAW
 * it, RECORD an adjustment, mark it OPERATIONAL, RETIRE it, ACKNOWLEDGE a line,
 * record a REVIEW — plus the conventions and the explicit scan. Every state,
 * conflict, duration and median is re-derived on read by `workplaceAdjustment.js`;
 * nothing derived is stored.
 *
 * THE DOOR IS THE PRODUCT, AND EVERY REFUSAL IS A CONTROL.
 *  - A restriction carries a FUNCTIONAL statement and a WRITTEN INSTRUMENT
 *    reference or it is refused. A restriction is a claim about a human being's
 *    body; an unsourced one is impossible to defend and impossible to review.
 *  - A restriction is declared by a seat that HOLDS the person — through the
 *    span, a declared line, or the person themselves. One line does not write
 *    another line's people, and a peer cannot file a limitation against somebody
 *    they do not manage.
 *  - The LIMIT is read against its domain's own unit at the door. A gram value on
 *    an hours domain, a fractional minute, or a number attached to a pure
 *    prohibition is refused, because a repaired number here is a duty nobody
 *    declared.
 *  - A review day that precedes the declaration is refused. A restriction with no
 *    review day is permitted and prints its own consequence: it never falls into
 *    a review cycle, and the screen says so.
 *  - WITHDRAWING a live restriction requires a written basis AND a recorded review
 *    that decided `close` or `amend`. Nobody can administratively delete a duty
 *    from the record by typing a reason into a dialog — the review is the control,
 *    and it must be recorded BEFORE the withdrawal is accepted.
 *  - Marking an adjustment OPERATIONAL is a separate, dated act from recording
 *    it as agreed, because the distance between the two is the whole point.
 *  - An acknowledgement is signed by the holder of ONE line, on a day, on or after
 *    the restriction was declared. The person carrying the restriction can never
 *    sign for a line that holds them: they would be acknowledging their own duty.
 *  - Every write is run through the loader and the stored row is the row the
 *    loader returns. A write the loader would refuse on reload is refused now.
 *
 * WHAT NO COMMAND CAN DO. There is no command that declares a restriction to be
 * inapplicable, no command that scores a person's capacity, no command that
 * infers a restriction from an absence or a plan, and no command that lifts a
 * restriction by time passing. The absence of those commands is the design.
 */

import { dayKey } from '../time.js';
import { buildSeats, activeSeat, canAct } from './seat.js';
import { matrixLineScopeFor, buildMatrix, matrixJointApex } from './matrix.js';
import { buildWorkplaceAdjustment, workplaceAdjustmentAttentionCount } from './workplaceAdjustment.js';
import {
  WPA_EVENTS,
  WPA_LIMITS as L,
  WPA_REFUSALS,
  WPA_RIGHTS,
  WPA_ROUTE,
  WPA_RULE_ID,
  WPA_SETTING_KEYS,
  WPA_DOMAIN_BY_KEY,
  WPA_INSTRUMENT_BY_KEY,
  WPA_ADJUSTMENT_KIND_BY_KEY,
  WPA_REVIEW_DECISION_BY_KEY,
} from './workplaceAdjustmentRegistry.js';
import {
  normalizeWpaAcknowledgements,
  normalizeWpaAdjustments,
  normalizeWpaNightWindow,
  normalizeWpaRestrictions,
  normalizeWpaReviews,
  normalizeWpaSettings,
  wpaDay,
  wpaLimit,
  wpaReason,
  wpaSourceRef,
  wpaStatement,
} from './workplaceAdjustmentSchema.js';

const REFUSAL = (key) => `workplaceAdjustment:${key}`;
const text = (value, max = 400) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export function createWorkplaceAdjustmentActions(store, { now, idFactory }) {
  const fail = (error, field = null, refusal = null) => ({ ok: false, error, ...(field ? { field } : {}), ...(refusal ? { refusal } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  const rows = (key) => (Array.isArray(store.state[key]) ? store.state[key] : []);
  const saved = (extra = {}) => ({ ...extra, saved: !store.persistError, warning: store.persistError || null, propagations: store.lastPropagations || [], ok: true });

  function seatFor(right) {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    const seat = activeSeat(built);
    if (seat.readOnly) return fail(WPA_REFUSALS.notSeated);
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, seat, at, cfg, actorId: seat.fullAccess ? 'leader' : (seat.nodeId || seat.id || null), today: dayKey(at) };
  }

  /**
   * A read is REGISTERED as safe and therefore bypasses the gateway's rank
   * check — so the right is re-proved HERE, exactly as the risk-appetite and
   * distributed-work registers re-prove it. Without this, the functional
   * limitation of a person would be readable by a seat the record class denies.
   */
  function readCheck() {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    const seat = activeSeat(built);
    if (seat.readOnly) return fail(WPA_REFUSALS.notSeated);
    const verdict = canAct(WPA_RIGHTS.READ, seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, seat, at, cfg, today: dayKey(at) };
  }

  /** Does the acting seat hold this person (span, declared line, or itself)? */
  function holdsPerson(check, personId) {
    if (!personId) return false;
    if (check.seat.fullAccess) return true;
    const nodeId = check.seat.nodeId || check.seat.id || null;
    if (personId === nodeId) return true;
    if (check.seat.scope?.has?.(personId)) return true;
    if (check.seat.lineScope?.has?.(personId)) return true;
    return false;
  }

  function personContext(check, personId) {
    const id = text(personId, L.idMax) || null;
    if (!id) return fail('Name the person this restriction describes.', 'personId');
    const person = rows('people').find((row) => row && row.id === id) || null;
    if (!person) return fail('That person is not on this record. Nothing was saved.', 'personId', REFUSAL('person-not-found'));
    if (person.status === 'archived') return fail('That person is archived. An archived person has no live work to restrict.', 'personId', REFUSAL('person-archived'));
    if (!holdsPerson(check, id)) {
      return fail(WPA_REFUSALS.noReach, 'personId', REFUSAL('not-your-person'));
    }
    return { ok: true, personId: id, person };
  }

  function dayNotFuture(check, value, field, fallback) {
    const day = value === undefined || value === null || value === '' ? fallback : wpaDay(value);
    if (!day) return { error: fail('Give a real calendar day.', field, REFUSAL('day-invalid')) };
    if (day > check.today) return { error: fail('That day is in the future. This register records what a human declared or did, not what will be.', field, REFUSAL('day-future')) };
    return { day };
  }

  /** A declared day that may legitimately be ahead: a review date is a plan. */
  function dayNotTooFarAhead(check, value, field, maxDays) {
    const day = wpaDay(value);
    if (!day) return { error: fail('Give a real calendar day.', field, REFUSAL('day-invalid')) };
    const ahead = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${check.today}T00:00:00Z`)) / 86_400_000);
    if (ahead > maxDays) {
      return { error: fail(`A review day more than ${maxDays} days ahead is not a review — it is a decision nobody will look at again. The register refuses it rather than printing a duty that will expire unread.`, field, REFUSAL('day-too-far')) };
    }
    return { day };
  }

  function writeDraft(mutate, event) {
    store.update((draft) => { mutate(draft); }, event);
    return true;
  }

  function liveRestriction(id) {
    const loaded = normalizeWpaRestrictions(rows('wpaRestrictions'), []);
    return loaded.find((row) => row.id === id) || null;
  }

  const CONTEXT = 'Read the workplace adjustment register (#/adjustments). It records what work a person must not do and what was actually done about it; it holds no diagnosis and scores nobody.';

  return {
    /* ------------------------------------------------------- restrictions */

    /**
     * DECLARE a restriction. The two facts a manager actually needs — what the
     * work must respect, and where that came from — are both mandatory. The
     * diagnosis is not asked for and cannot be supplied.
     */
    workplaceAdjustmentDeclareRestriction(input = {}) {
      const check = seatFor(WPA_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const person = personContext(check, input.personId);
      if (!person.ok) return person;

      const domain = text(input.domain, 60);
      if (!WPA_DOMAIN_BY_KEY[domain]) return fail('Choose the functional demand this restriction limits. A free-text limitation cannot be tested against the work, which is the only thing that makes this register worth keeping.', 'domain', REFUSAL('domain-invalid'));
      const instrument = text(input.instrument, 60);
      if (!WPA_INSTRUMENT_BY_KEY[instrument]) return fail('Name the instrument this restriction comes from. A restriction with no instrument is a rumour.', 'instrument', REFUSAL('instrument-invalid'));

      const statement = wpaStatement(input.statement);
      if (!statement) return fail(`Write what the work must respect, in at least ${L.statementMin} characters — “no lifting above 5 kg”, “no work between 22:00 and 06:00”. Write the LIMITATION, never the condition behind it.`, 'statement', REFUSAL('statement-invalid'));

      const sourceRef = wpaSourceRef(input.sourceRef);
      if (!sourceRef) return fail(`Write where this came from, in at least ${L.textMin} characters — the note’s own wording, who wrote it and when. A restriction nobody can trace is one nobody can defend.`, 'sourceRef', REFUSAL('source-missing'));

      const limit = wpaLimit(domain, input.limitValue === '' ? null : input.limitValue);
      if (!limit) {
        const declared = WPA_DOMAIN_BY_KEY[domain];
        return fail(declared.limit
          ? `This domain’s limit is a whole number of ${declared.limit === 'grams' ? 'grams' : 'minutes'}. A fraction, a negative number or a value beyond the register’s bound is refused rather than rounded.`
          : 'This restriction is a prohibition: it carries no number. A number on it means the declaration contradicts itself.', 'limitValue', REFUSAL('limit-invalid'));
      }

      const declared = dayNotFuture(check, input.declaredOn, 'declaredOn', check.today);
      if (declared.error) return declared.error;

      let reviewOn = null;
      if (input.reviewOn !== undefined && input.reviewOn !== null && input.reviewOn !== '') {
        const review = dayNotTooFarAhead(check, input.reviewOn, 'reviewOn', L.horizonMaxDays);
        if (review.error) return review.error;
        if (review.day < declared.day) return fail('A review day cannot precede the day the restriction was declared.', 'reviewOn', REFUSAL('review-before-declaration'));
        reviewOn = review.day;
      }

      const existing = normalizeWpaRestrictions(rows('wpaRestrictions'), []);
      if (existing.length >= L.restrictions) return fail('The restriction ledger is full. Export the workspace before proceeding.', null, REFUSAL('ledger-full'));

      const id = idFactory('wpa-res');
      const row = {
        id,
        personId: person.personId,
        domain,
        instrument,
        statement,
        sourceRef,
        limitUnit: limit.unit,
        limitValue: limit.value,
        declaredOn: declared.day,
        declaredAt: check.at.toISOString(),
        declaredById: check.actorId,
        reviewOn,
        note: text(input.note, L.textMax),
        status: 'active',
        withdrawnOn: null,
        withdrawalReason: '',
        withdrawnById: '',
        createdAt: check.at.toISOString(),
        updatedAt: check.at.toISOString(),
      };
      const loaded = normalizeWpaRestrictions([...rows('wpaRestrictions'), row], []);
      const storedRow = loaded.find((candidate) => candidate.id === id) || null;
      if (!storedRow) return fail('The restriction could not be stored as a row this register can read back. Nothing was saved.', 'statement', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.wpaRestrictions = Array.isArray(draft.wpaRestrictions) ? draft.wpaRestrictions : [];
        draft.wpaRestrictions.push(storedRow);
      }, {
        type: WPA_EVENTS.RESTRICTION_DECLARED,
        entity: 'person',
        entityId: person.personId,
        summary: `Functional restriction declared for ${person.person.name || person.personId} on the ${WPA_DOMAIN_BY_KEY[domain].label.toLowerCase()} domain, sourced from a ${WPA_INSTRUMENT_BY_KEY[instrument].label.toLowerCase()} (${WPA_ROUTE} register).`.slice(0, 300),
      });
      return saved({ id, restriction: storedRow });
    },

    /**
     * WITHDRAW a restriction. Refused without a written basis AND a recorded
     * review deciding `close` or `amend`: the review is the control, and an
     * administrative delete of a live duty is exactly what this stops.
     */
    workplaceAdjustmentWithdrawRestriction(input = {}) {
      const check = seatFor(WPA_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const restrictionId = text(input.restrictionId, L.idMax) || null;
      if (!restrictionId) return fail('Name the restriction being withdrawn.', 'restrictionId');
      const restriction = liveRestriction(restrictionId);
      if (!restriction) return fail(WPA_REFUSALS.notFound, 'restrictionId', REFUSAL('restriction-not-found'));
      if (restriction.status !== 'active') return fail('That restriction is already withdrawn. History is never rewritten.', 'restrictionId', REFUSAL('restriction-not-active'));
      if (!holdsPerson(check, restriction.personId)) return fail('This seat neither holds this person through the span nor through a declared line. One line does not withdraw another line’s duties.', 'restrictionId', REFUSAL('not-your-person'));

      const reason = wpaReason(input.reason);
      if (!reason) return fail(`Write why the restriction is being lifted, in at least ${L.textMin} characters. A withdrawal with no basis is a duty deleted by a keystroke.`, 'reason', REFUSAL('reason-missing'));

      const reviews = normalizeWpaReviews(rows('wpaReviews'), normalizeWpaRestrictions(rows('wpaRestrictions'), []), []);
      const closing = reviews
        .filter((row) => row.restrictionId === restrictionId && (row.decision === 'close' || row.decision === 'amend'))
        .sort((a, b) => String(b.reviewedOn).localeCompare(String(a.reviewedOn)))[0] || null;
      if (!closing) {
        return fail('A live restriction can only be lifted on a recorded review that decided to close or amend it. Record that review first: nobody may delete a duty from this record by typing a reason into a dialog.', 'reason', REFUSAL('review-required'));
      }

      const on = dayNotFuture(check, input.on, 'on', check.today);
      if (on.error) return on.error;
      if (on.day < restriction.declaredOn) return fail('The withdrawal cannot be before the day the restriction was declared.', 'on', REFUSAL('withdraw-before-declaration'));
      if (on.day < closing.reviewedOn) return fail('The withdrawal cannot precede the review that decided it.', 'on', REFUSAL('withdraw-before-review'));

      writeDraft((draft) => {
        for (const row of draft.wpaRestrictions || []) {
          if (row && row.id === restrictionId) {
            row.status = 'withdrawn';
            row.withdrawnOn = on.day;
            row.withdrawalReason = reason;
            row.withdrawnById = check.actorId;
            row.updatedAt = check.at.toISOString();
          }
        }
      }, {
        type: WPA_EVENTS.RESTRICTION_WITHDRAWN,
        entity: 'person',
        entityId: restriction.personId,
        summary: `Functional restriction ${restrictionId} lifted on the review of ${closing.reviewedOn} (${WPA_ROUTE} register). Work done under it remains on the record.`.slice(0, 300),
      });
      return saved({ id: restrictionId });
    },

    /* -------------------------------------------------------- adjustments */

    /**
     * RECORD an adjustment: what was actually done, agreed on a day. It is NOT
     * operational yet — that is a separate act, because the distance between
     * the two dates is the measurement this register exists to print.
     */
    workplaceAdjustmentRecordAdjustment(input = {}) {
      const check = seatFor(WPA_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const restrictionId = text(input.restrictionId, L.idMax) || null;
      if (!restrictionId) return fail('Name the restriction this adjustment answers.', 'restrictionId');
      const restriction = liveRestriction(restrictionId);
      if (!restriction) return fail(WPA_REFUSALS.notFound, 'restrictionId', REFUSAL('restriction-not-found'));
      if (restriction.status !== 'active') return fail('That restriction is withdrawn. An adjustment answers a live duty, not a closed one.', 'restrictionId', REFUSAL('restriction-not-active'));
      if (!holdsPerson(check, restriction.personId)) return fail('This seat neither holds this person through the span nor through a declared line. One line does not decide what another line’s work becomes.', 'restrictionId', REFUSAL('not-your-person'));

      const kind = text(input.kind, 60);
      if (!WPA_ADJUSTMENT_KIND_BY_KEY[kind]) return fail('Choose what was actually done. An adjustment with no kind is a sentence, not a record.', 'kind', REFUSAL('kind-invalid'));
      const detail = wpaStatement(input.detail);
      if (!detail) return fail(`Write what was done, in at least ${L.statementMin} characters. “Task substitution” alone does not say which task left the rota.`, 'detail', REFUSAL('detail-invalid'));

      const agreed = dayNotFuture(check, input.agreedOn, 'agreedOn', check.today);
      if (agreed.error) return agreed.error;
      if (agreed.day < restriction.declaredOn) return fail('An adjustment cannot be agreed before the restriction it answers was declared.', 'agreedOn', REFUSAL('agreed-before-restriction'));

      const existing = normalizeWpaAdjustments(rows('wpaAdjustments'), normalizeWpaRestrictions(rows('wpaRestrictions'), []), []);
      if (existing.length >= L.adjustments) return fail('The adjustment ledger is full. Export the workspace before proceeding.', null, REFUSAL('ledger-full'));

      const id = idFactory('wpa-adj');
      const row = {
        id,
        restrictionId,
        kind,
        detail,
        agreedOn: agreed.day,
        agreedAt: check.at.toISOString(),
        agreedById: check.actorId,
        operationalOn: null,
        operationalAt: null,
        operationalById: '',
        costNote: text(input.costNote, L.statementMax),
        status: 'active',
        retiredOn: null,
        retiredReason: '',
        retiredById: '',
        createdAt: check.at.toISOString(),
        updatedAt: check.at.toISOString(),
      };
      const loaded = normalizeWpaAdjustments([...rows('wpaAdjustments'), row], normalizeWpaRestrictions(rows('wpaRestrictions'), []), []);
      const storedRow = loaded.find((candidate) => candidate.id === id) || null;
      if (!storedRow) return fail('The adjustment could not be stored as a row this register can read back. Nothing was saved.', 'detail', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.wpaAdjustments = Array.isArray(draft.wpaAdjustments) ? draft.wpaAdjustments : [];
        draft.wpaAdjustments.push(storedRow);
      }, {
        type: WPA_EVENTS.ADJUSTMENT_RECORDED,
        entity: 'case',
        entityId: restrictionId,
        summary: `Adjustment agreed for restriction ${restrictionId}: ${WPA_ADJUSTMENT_KIND_BY_KEY[kind].label.toLowerCase()}. It is NOT yet operational, and the register prints that distance (${WPA_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, adjustment: storedRow });
    },

    /**
     * MARK OPERATIONAL. A distinct dated act, and it can only be made for an
     * adjustment that was agreed and is not already operational. Recording the
     * same fact twice is refused: two operational days on one adjustment would
     * make the agreed-to-operational distance a matter of which row you read.
     */
    workplaceAdjustmentMarkOperational(input = {}) {
      const check = seatFor(WPA_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const adjustmentId = text(input.adjustmentId, L.idMax) || null;
      if (!adjustmentId) return fail('Name the adjustment that became operational.', 'adjustmentId');
      const loadedRestrictions = normalizeWpaRestrictions(rows('wpaRestrictions'), []);
      const loaded = normalizeWpaAdjustments(rows('wpaAdjustments'), loadedRestrictions, []);
      const adjustment = loaded.find((row) => row.id === adjustmentId) || null;
      if (!adjustment) return fail(WPA_REFUSALS.notFound, 'adjustmentId', REFUSAL('adjustment-not-found'));
      if (adjustment.status !== 'active') return fail('That adjustment is retired. A retired adjustment is history.', 'adjustmentId', REFUSAL('adjustment-retired'));
      if (adjustment.operationalOn) return fail(`That adjustment is already recorded operational on ${adjustment.operationalOn}. The first record stands: a second operational day would make the agreed-to-operational distance a matter of which row you read.`, 'adjustmentId', REFUSAL('already-operational'));
      const restriction = loadedRestrictions.find((row) => row.id === adjustment.restrictionId) || null;
      if (!restriction) return fail(WPA_REFUSALS.notFound, 'adjustmentId', REFUSAL('restriction-not-found'));
      if (!holdsPerson(check, restriction.personId)) return fail('This seat neither holds this person through the span nor through a declared line.', 'adjustmentId', REFUSAL('not-your-person'));

      const on = dayNotFuture(check, input.operationalOn, 'operationalOn', check.today);
      if (on.error) return on.error;
      if (on.day < adjustment.agreedOn) return fail('An adjustment cannot become operational before the day it was agreed.', 'operationalOn', REFUSAL('operational-before-agreement'));

      writeDraft((draft) => {
        for (const row of draft.wpaAdjustments || []) {
          if (row && row.id === adjustmentId) {
            row.operationalOn = on.day;
            row.operationalAt = check.at.toISOString();
            row.operationalById = check.actorId;
            row.updatedAt = check.at.toISOString();
          }
        }
      }, {
        type: WPA_EVENTS.ADJUSTMENT_OPERATIONAL,
        entity: 'case',
        entityId: adjustment.restrictionId,
        summary: `Adjustment ${adjustmentId} recorded operational on ${on.day}, agreed on ${adjustment.agreedOn}. The register now prints the exact days between the two (${WPA_ROUTE}).`.slice(0, 300),
      });
      return saved({ id: adjustmentId });
    },

    /** RETIRE an adjustment that no longer stands. Written reason, retained as history. */
    workplaceAdjustmentRetireAdjustment(input = {}) {
      const check = seatFor(WPA_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const adjustmentId = text(input.adjustmentId, L.idMax) || null;
      if (!adjustmentId) return fail('Name the adjustment being retired.', 'adjustmentId');
      const loadedRestrictions = normalizeWpaRestrictions(rows('wpaRestrictions'), []);
      const loaded = normalizeWpaAdjustments(rows('wpaAdjustments'), loadedRestrictions, []);
      const adjustment = loaded.find((row) => row.id === adjustmentId) || null;
      if (!adjustment) return fail(WPA_REFUSALS.notFound, 'adjustmentId', REFUSAL('adjustment-not-found'));
      if (adjustment.status !== 'active') return fail('That adjustment is already retired. History is never rewritten.', 'adjustmentId', REFUSAL('adjustment-retired'));
      const restriction = loadedRestrictions.find((row) => row.id === adjustment.restrictionId) || null;
      if (!restriction) return fail(WPA_REFUSALS.notFound, 'adjustmentId', REFUSAL('restriction-not-found'));
      if (!holdsPerson(check, restriction.personId)) return fail('This seat neither holds this person through the span nor through a declared line.', 'adjustmentId', REFUSAL('not-your-person'));
      const reason = wpaReason(input.reason);
      if (!reason) return fail(`Write why the adjustment is being retired, in at least ${L.textMin} characters. A retirement with no reason is a duty disappearing quietly.`, 'reason', REFUSAL('reason-missing'));
      const on = dayNotFuture(check, input.on, 'on', check.today);
      if (on.error) return on.error;
      if (on.day < adjustment.agreedOn) return fail('The retirement cannot be before the day the adjustment was agreed.', 'on', REFUSAL('retire-before-agreement'));

      writeDraft((draft) => {
        for (const row of draft.wpaAdjustments || []) {
          if (row && row.id === adjustmentId) {
            row.status = 'retired';
            row.retiredOn = on.day;
            row.retiredReason = reason;
            row.retiredById = check.actorId;
            row.updatedAt = check.at.toISOString();
          }
        }
      }, {
        type: WPA_EVENTS.ADJUSTMENT_RETIRED,
        entity: 'case',
        entityId: adjustment.restrictionId,
        summary: `Adjustment ${adjustmentId} retired on ${on.day}. The restriction it answered remains: the register re-reads whether anything else is in place (${WPA_ROUTE}).`.slice(0, 300),
      });
      return saved({ id: adjustmentId });
    },

    /* --------------------------------------------------- acknowledgements */

    /**
     * ACKNOWLEDGE a line. The holder of ONE reporting line states, on a day, that
     * they have been shown this restriction. This is the row that makes a line
     * change re-open the gap by itself — which is precisely the third failure the
     * adjustment-register category names and no product tests for.
     */
    workplaceAdjustmentAcknowledgeLine(input = {}) {
      const check = seatFor(WPA_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const restrictionId = text(input.restrictionId, L.idMax) || null;
      if (!restrictionId) return fail('Name the restriction being acknowledged.', 'restrictionId');
      const restriction = liveRestriction(restrictionId);
      if (!restriction) return fail(WPA_REFUSALS.notFound, 'restrictionId', REFUSAL('restriction-not-found'));
      if (restriction.status !== 'active') return fail('That restriction is withdrawn. There is nothing live to acknowledge.', 'restrictionId', REFUSAL('restriction-not-active'));

      const lineManagerId = text(input.lineManagerId, L.idMax) || null;
      if (!lineManagerId) return fail('Name the reporting line’s holder acknowledging the restriction.', 'lineManagerId');
      if (lineManagerId === restriction.personId) {
        return fail('The person carrying the restriction cannot acknowledge their own line. This row exists so that the MANAGER who hands out the work has seen the limit.', 'lineManagerId', REFUSAL('self-acknowledgement'));
      }

      const at = check.at;
      let matrix;
      try {
        matrix = buildMatrix(store.state, { now: at, settings: { ...settings(), activeSeatId: null } });
      } catch {
        return fail('The reporting graph could not be read, so no line can be acknowledged. Nothing was saved.', null, REFUSAL('matrix-unreadable'));
      }
      const lines = (matrix?.linesByPerson?.get(restriction.personId) || []).filter((line) => line && line.active !== false);
      if (!lines.some((line) => line.managerId === lineManagerId)) {
        return fail('That manager holds no active line to this person today. Acknowledging a line that does not exist would sign for a duty nobody carries.', 'lineManagerId', REFUSAL('not-a-line'));
      }
      // The acknowledging seat must be that line's holder or the span above both.
      if (!check.seat.fullAccess) {
        const nodeId = check.seat.nodeId || check.seat.id || null;
        const apex = matrixJointApex(matrix, [lineManagerId, restriction.personId]);
        const permitted = nodeId === lineManagerId || apex.apexIds?.includes(nodeId) || holdsPerson(check, restriction.personId);
        if (!permitted) return fail('Only the line’s holder, the seat above both, or a seat that holds the person may record this acknowledgement.', 'lineManagerId', REFUSAL('not-authorised'));
      }

      const on = dayNotFuture(check, input.acknowledgedOn, 'acknowledgedOn', check.today);
      if (on.error) return on.error;
      if (on.day < restriction.declaredOn) return fail('An acknowledgement cannot precede the day the restriction was declared.', 'acknowledgedOn', REFUSAL('ack-before-restriction'));

      const already = normalizeWpaAcknowledgements(rows('wpaAcknowledgements'), normalizeWpaRestrictions(rows('wpaRestrictions'), []), [])
        .find((row) => row.restrictionId === restrictionId && row.lineManagerId === lineManagerId && row.acknowledgedOn === on.day);
      if (already) return fail(`That line already acknowledged this restriction on ${on.day}. A second row on the same day would double-count the acknowledgement.`, 'acknowledgedOn', REFUSAL('duplicate-acknowledgement'));

      const loadedRestrictions = normalizeWpaRestrictions(rows('wpaRestrictions'), []);
      const existing = normalizeWpaAcknowledgements(rows('wpaAcknowledgements'), loadedRestrictions, []);
      if (existing.length >= L.acknowledgements) return fail('The acknowledgement ledger is full. Export the workspace before proceeding.', null, REFUSAL('ledger-full'));

      const id = idFactory('wpa-ack');
      const row = {
        id,
        restrictionId,
        lineManagerId,
        acknowledgedOn: on.day,
        acknowledgedAt: check.at.toISOString(),
        acknowledgedById: check.actorId,
        note: text(input.note, L.textMax),
        createdAt: check.at.toISOString(),
      };
      const loaded = normalizeWpaAcknowledgements([...rows('wpaAcknowledgements'), row], loadedRestrictions, []);
      const storedRow = loaded.find((candidate) => candidate.id === id) || null;
      if (!storedRow) return fail('The acknowledgement could not be stored as a row this register can read back. Nothing was saved.', 'lineManagerId', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.wpaAcknowledgements = Array.isArray(draft.wpaAcknowledgements) ? draft.wpaAcknowledgements : [];
        draft.wpaAcknowledgements.push(storedRow);
      }, {
        type: WPA_EVENTS.LINE_ACKNOWLEDGED,
        entity: 'person',
        entityId: restriction.personId,
        summary: `A reporting line recorded that it has been shown functional restriction ${restrictionId}. A line that has not is a printed finding (${WPA_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, acknowledgement: storedRow });
    },

    /* ------------------------------------------------------------ review */

    /**
     * RECORD a review. The decision is a human judgement with a written basis —
     * including that the request is declined — and the day it was reached. A
     * `continue` must name the next review day, or the restriction silently
     * falls out of the review cycle for ever.
     */
    workplaceAdjustmentRecordReview(input = {}) {
      const check = seatFor(WPA_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const restrictionId = text(input.restrictionId, L.idMax) || null;
      if (!restrictionId) return fail('Name the restriction being reviewed.', 'restrictionId');
      const restriction = liveRestriction(restrictionId);
      if (!restriction) return fail(WPA_REFUSALS.notFound, 'restrictionId', REFUSAL('restriction-not-found'));
      if (restriction.status !== 'active') return fail('That restriction is withdrawn. There is nothing live to review.', 'restrictionId', REFUSAL('restriction-not-active'));
      if (!holdsPerson(check, restriction.personId)) return fail('This seat neither holds this person through the span nor through a declared line.', 'restrictionId', REFUSAL('not-your-person'));

      const decision = text(input.decision, 40);
      if (!WPA_REVIEW_DECISION_BY_KEY[decision]) return fail('Choose what the review decided: continue, amend or close. A review with no decision is a meeting.', 'decision', REFUSAL('decision-invalid'));
      const basis = wpaReason(input.basis);
      if (!basis) return fail(`Write the basis the review rested on, in at least ${L.textMin} characters. A recorded refusal WITH a reason is a defensible position; an unanswered request is not, and neither is a decision nobody wrote down.`, 'basis', REFUSAL('basis-missing'));

      const reviewed = dayNotFuture(check, input.reviewedOn, 'reviewedOn', check.today);
      if (reviewed.error) return reviewed.error;
      if (reviewed.day < restriction.declaredOn) return fail('A review cannot precede the day the restriction was declared.', 'reviewedOn', REFUSAL('review-before-restriction'));

      let nextReviewOn = null;
      if (decision === 'continue') {
        if (input.nextReviewOn === undefined || input.nextReviewOn === null || input.nextReviewOn === '') {
          return fail('A decision to continue must name the next review day. Without it the restriction falls out of the review cycle and a live duty is never looked at again.', 'nextReviewOn', REFUSAL('next-review-required'));
        }
        const next = dayNotTooFarAhead(check, input.nextReviewOn, 'nextReviewOn', L.horizonMaxDays);
        if (next.error) return next.error;
        if (next.day <= reviewed.day) return fail('The next review day must be after the review that set it.', 'nextReviewOn', REFUSAL('next-review-not-after'));
        nextReviewOn = next.day;
      }

      const loadedRestrictions = normalizeWpaRestrictions(rows('wpaRestrictions'), []);
      const existing = normalizeWpaReviews(rows('wpaReviews'), loadedRestrictions, []);
      if (existing.length >= L.reviews) return fail('The review ledger is full. Export the workspace before proceeding.', null, REFUSAL('ledger-full'));
      if (existing.some((row) => row.restrictionId === restrictionId && row.reviewedOn === reviewed.day)) {
        return fail(`This restriction already carries a review recorded on ${reviewed.day}. One day, one decision: two would make the state a matter of which row you read.`, 'reviewedOn', REFUSAL('duplicate-review'));
      }

      const id = idFactory('wpa-rev');
      const row = {
        id,
        restrictionId,
        decision,
        basis,
        reviewedOn: reviewed.day,
        reviewedAt: check.at.toISOString(),
        reviewedById: check.actorId,
        nextReviewOn,
        createdAt: check.at.toISOString(),
      };
      const loaded = normalizeWpaReviews([...rows('wpaReviews'), row], loadedRestrictions, []);
      const storedRow = loaded.find((candidate) => candidate.id === id) || null;
      if (!storedRow) return fail('The review could not be stored as a row this register can read back. Nothing was saved.', 'basis', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.wpaReviews = Array.isArray(draft.wpaReviews) ? draft.wpaReviews : [];
        draft.wpaReviews.push(storedRow);
        // A `continue` carries the next review day onto the restriction itself,
        // so the printed review horizon stays honest without a second ledger.
        if (decision === 'continue' && nextReviewOn) {
          for (const live of draft.wpaRestrictions || []) {
            if (live && live.id === restrictionId) {
              live.reviewOn = nextReviewOn;
              live.updatedAt = check.at.toISOString();
            }
          }
        }
      }, {
        type: WPA_EVENTS.RESTRICTION_REVIEWED,
        entity: 'person',
        entityId: restriction.personId,
        summary: `Review recorded on functional restriction ${restrictionId}: ${WPA_REVIEW_DECISION_BY_KEY[decision].label.toLowerCase()}${nextReviewOn ? `, next review ${nextReviewOn}` : ''} (${WPA_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, review: storedRow });
    },

    /* ------------------------------------------------------- conventions */

    workplaceAdjustmentSetConventions(input = {}) {
      const check = seatFor(WPA_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const current = normalizeWpaSettings(settings());
      const patch = input.patch && typeof input.patch === 'object' && !Array.isArray(input.patch) ? input.patch : input;
      const known = new Set([...Object.values(WPA_SETTING_KEYS), 'wpaNightStartMinute', 'wpaNightEndMinute']);
      for (const key of Object.keys(patch || {})) {
        if (!known.has(key)) return fail(`Unknown convention “${String(key).slice(0, 60)}”. Nothing was saved.`, key, REFUSAL('unknown-setting'));
      }
      if (Object.hasOwn(patch, 'wpaNightStartMinute') || Object.hasOwn(patch, 'wpaNightEndMinute')) {
        const start = Object.hasOwn(patch, 'wpaNightStartMinute') ? Number(patch.wpaNightStartMinute) : (settings().wpaNightStartMinute ?? normalizeWpaNightWindow({}).startMinute);
        const end = Object.hasOwn(patch, 'wpaNightEndMinute') ? Number(patch.wpaNightEndMinute) : (settings().wpaNightEndMinute ?? normalizeWpaNightWindow({}).endMinute);
        const window = normalizeWpaNightWindow({ startMinute: start, endMinute: end });
        if (!window) return fail('The declared night window must be a non-empty span of whole minutes inside one day. A zero-length night would make every no-night-work test vacuously pass.', 'wpaNightStartMinute', REFUSAL('night-window-invalid'));
      }
      const next = { ...current };
      for (const [key, value] of Object.entries(patch || {})) {
        if (key === WPA_SETTING_KEYS.autoPropagate) { next[key] = value !== false; continue; }
        if (key === 'wpaNightStartMinute' || key === 'wpaNightEndMinute') continue;
        const n = Number(value);
        if (!Number.isInteger(n)) return fail(`“${key}” is a whole number of days. Nothing was saved.`, key, REFUSAL('setting-invalid'));
        next[key] = n;
      }
      store.update((draft) => {
        draft.settings = { ...(draft.settings || {}), ...next, ...(Object.hasOwn(patch, 'wpaNightStartMinute') ? { wpaNightStartMinute: Number(patch.wpaNightStartMinute) } : {}), ...(Object.hasOwn(patch, 'wpaNightEndMinute') ? { wpaNightEndMinute: Number(patch.wpaNightEndMinute) } : {}) };
      }, {
        type: WPA_EVENTS.CONVENTIONS_SET,
        entity: 'workspace',
        entityId: WPA_ROUTE,
        summary: `Workplace adjustment conventions re-declared: the grace before an agreed adjustment is overdue, the review warning window and the privacy floor (${WPA_ROUTE}).`.slice(0, 300),
      });
      return saved({ conventions: normalizeWpaSettings(store.state.settings || {}) });
    },

    /* -------------------------------------------------------------- reads */

    workplaceAdjustmentReport() {
      const check = readCheck();
      if (!check.ok) return check;
      return { ok: true, report: buildWorkplaceAdjustment(store.state, { now: check.at, settings: check.cfg, seat: check.seat }) };
    },

    workplaceAdjustmentAttention() {
      const check = readCheck();
      if (!check.ok) return check;
      return { ok: true, count: workplaceAdjustmentAttentionCount(store.state, { now: check.at, settings: check.cfg, seat: check.seat }) };
    },

    /** The candidates a dialog may name, narrowed to what this seat may actually write. */
    workplaceAdjustmentCandidates() {
      const check = readCheck();
      if (!check.ok) return check;
      const roster = rows('people').filter((row) => row && row.status !== 'archived' && row.id);
      const people = roster
        .filter((row) => holdsPerson(check, row.id))
        .map((row) => ({ id: row.id, name: row.name || row.id, role: row.role || '' }))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
      return { ok: true, people };
    },

    /**
     * The explicit scan. Re-runs the rule over the whole register. Pausable: a
     * pause is a pause on every path, including this one.
     */
    workplaceAdjustmentScan() {
      const check = seatFor(WPA_RIGHTS.DECLARE);
      if (!check.ok) return check;
      store.update((draft) => {
        draft.wpaMarkers = Array.isArray(draft.wpaMarkers) ? draft.wpaMarkers : [];
      }, {
        type: WPA_EVENTS.SCANNED,
        entity: 'workspace',
        entityId: WPA_ROUTE,
        summary: `Workplace adjustment register scanned; the rule re-reads every live restriction against declared work, the review horizon and the per-line acknowledgement position (${WPA_ROUTE}).`.slice(0, 300),
      });
      return saved({});
    },
  };
}
