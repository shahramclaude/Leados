/**
 * app/core/domain/loneWorkingActions.js — the seat-checked commands of the
 * Lone-Working Welfare Check Register (ADR-0242).
 *
 * FIVE human acts and a scan, and nothing else: DECLARE a lone deployment, record
 * a CONTACT, record an ESCALATION, CLOSE the deployment out, and re-declare the
 * conventions — plus the explicit scan. Every state, deadline, lateness and
 * overrun is re-derived on read by `loneWorking.js`; nothing derived is stored.
 *
 * THE DOOR IS THE PRODUCT, AND EVERY REFUSAL IS A CONTROL.
 *  - A deployment carries a WRITTEN PROTOCOL REFERENCE, a declared SITE, a
 *    declared TASK, a declared INTERVAL and a declared GRACE, or it is refused.
 *    Sending a human being out alone is a decision taken against an assessment;
 *    an untraceable one is impossible to defend after an incident and impossible
 *    to review before it.
 *  - Nobody declares THEMSELVES alone. The person who is sent out is the one the
 *    register exists to protect, and a declaration they made about their own
 *    welfare is the control failing at the first step. (The workspace operator
 *    seat is not a roster person, so this is never a block on a solo operator.)
 *  - One person cannot be declared alone in TWO PLACES at once: an overlapping
 *    span is refused using exact instants, with the overlap in milliseconds and
 *    whole minutes, computed on the effective span — a closed deployment ends at
 *    its recorded close, not its expected end. If it is still open, a later
 *    declaration is refused as uncertain rather than treating the expected end as
 *    proof of a close.
 *  - A contact cannot be recorded in the future, before the deployment started, or
 *    at or before the last contact. History that can run backwards is history
 *    nobody can read, and the whole register is a timer running from the last
 *    contact.
 *  - An escalation is a RESPONSE to a failed or concerning contact, and the door
 *    refuses one while the deployment is current: the register will not accept a
 *    welfare escalation on a deployment that nobody had reason to be worried
 *    about, because that would put a reassuring response on the record against a
 *    condition that never existed. A person may never raise the escalation about
 *    themselves.
 *  - A close-out names what happened and carries a written note. Time never closes
 *    a deployment: a passed declared end is a printed `overran` state, not an
 *    automatic close.
 *  - Every write is run through the loader and the stored row is the row the
 *    loader returns. A write the loader would refuse on reload is refused now.
 *
 * WHAT NO COMMAND CAN DO. There is no command that declares welfare confirmed on
 * somebody's behalf without a recorded escalation, no command that clears a
 * concern without a response, no command that extends a deadline retroactively,
 * no command that records a location, and no command that scores a person or a
 * line. The absence of those commands is the design.
 */

import { dayKey } from '../time.js';
import { buildSeats, activeSeat, canAct } from './seat.js';
import { matrixLineScopeFor, buildMatrix } from './matrix.js';
import { buildLoneWorking, loneWorkingAttentionCount } from './loneWorking.js';
import {
  LWK_CHANNEL_BY_KEY,
  LWK_CLOSE_OUTCOME_BY_KEY,
  LWK_ESCALATION_BASIS_BY_KEY,
  LWK_ESCALATION_OUTCOME_BY_KEY,
  LWK_EVENTS,
  LWK_LIMITS as L,
  LWK_REFUSALS,
  LWK_RIGHTS,
  LWK_ROUTE,
  LWK_SETTING_KEYS,
  LWK_BOUNDS,
} from './loneWorkingRegistry.js';
import {
  lwkGrace,
  lwkInstant,
  lwkInterval,
  lwkProtocol,
  lwkReason,
  lwkShort,
  normalizeLwkCheckins,
  normalizeLwkDeployments,
  normalizeLwkEscalations,
  normalizeLwkSettings,
} from './loneWorkingSchema.js';
import { instantMs, overlapMinutes } from './loneWorkingMath.js';

const REFUSAL = (key) => `loneWorking:${key}`;
const text = (value, max = L.textMax) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export function createLoneWorkingActions(store, { now, idFactory }) {
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
    if (seat.readOnly) return fail(LWK_REFUSALS.notSeated);
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, seat, at, cfg, actorId: seat.fullAccess ? 'leader' : (seat.nodeId || seat.id || null), today: dayKey(at) };
  }

  /**
   * A read is REGISTERED as safe and therefore bypasses the gateway's rank check —
   * so the right is re-proved HERE, exactly as every register in this workspace
   * re-proves it. Without this, where a named human being is alone at this minute
   * would be readable by a seat the record class denies.
   */
  function readCheck() {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    const seat = activeSeat(built);
    if (seat.readOnly) return fail(LWK_REFUSALS.notSeated);
    const verdict = canAct(LWK_RIGHTS.READ, seat);
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
    if (!id) return fail('Name the person this deployment sends out alone.', 'personId');
    const person = rows('people').find((row) => row && row.id === id) || null;
    if (!person) return fail('That person is not on this record. Nothing was saved.', 'personId', REFUSAL('person-not-found'));
    if (person.status === 'archived') return fail('That person is archived. An archived person is not sent out alone.', 'personId', REFUSAL('person-archived'));
    if (!holdsPerson(check, id)) {
      return fail(LWK_REFUSALS.noReach, 'personId', REFUSAL('not-your-person'));
    }
    return { ok: true, personId: id, person };
  }

  function writeDraft(mutate, event) {
    store.update((draft) => { mutate(draft); }, event);
    return true;
  }

  function liveDeployment(id) {
    return normalizeLwkDeployments(rows('lwkDeployments'), []).find((row) => row.id === id) || null;
  }

  /** The instant a write names, defaulting to the injected clock and never to the future. */
  function writeInstant(check, value, field) {
    if (value === undefined || value === null || value === '') return { at: check.at.toISOString() };
    const at = lwkInstant(value);
    if (!at) return { error: fail('Give a real instant.', field, REFUSAL('instant-invalid')) };
    if (instantMs(at) > check.at.getTime()) {
      return { error: fail('That instant is in the future. This register records what a human declared or did, not what will be.', field, REFUSAL('instant-future')) };
    }
    return { at };
  }

  return {
    /* ---------------------------------------------------------- deployments */

    /**
     * DECLARE a lone deployment: who, where, doing what, against which written
     * assessment, checked on how often, with how much grace, from when until when.
     * All eight facts are mandatory, because a timer running against a guessed
     * interval is worse than no timer at all.
     */
    loneWorkingDeclareDeployment(input = {}) {
      const check = seatFor(LWK_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const person = personContext(check, input.personId);
      if (!person.ok) return person;

      if (!check.seat.fullAccess && person.personId === (check.seat.nodeId || check.seat.id)) {
        return fail('Nobody declares themselves alone. The person the deployment sends out is the one this register protects, and a declaration they made about their own welfare is the control failing at its first step. Ask the manager who holds the line.', 'personId', REFUSAL('self-declaration'));
      }

      const siteRef = lwkShort(input.siteRef);
      if (!siteRef) return fail(`Name the place the person will be alone in, in at least ${L.shortMin} characters. “Somewhere on site” is not a place anybody can go to.`, 'siteRef', REFUSAL('site-invalid'));

      const task = lwkShort(input.task);
      if (!task) return fail(`Name the work they are alone to do, in at least ${L.shortMin} characters.`, 'task', REFUSAL('task-invalid'));

      const protocolRef = lwkProtocol(input.protocolRef);
      if (!protocolRef) {
        return fail(`Cite the written lone-working assessment this deployment rests on, in at least ${L.protocolMin} characters — its reference and revision. A deployment with no assessment is exactly the plausible default this register forbids.`, 'protocolRef', REFUSAL('protocol-missing'));
      }

      const intervalMinutes = lwkInterval(Number(input.intervalMinutes));
      if (intervalMinutes === null) {
        return fail(`The check-in interval is a whole number of minutes between ${L.intervalMin} and ${L.intervalMax}. A fraction, a zero or a value beyond the bound is refused rather than rounded, because the whole register is a timer running against this number.`, 'intervalMinutes', REFUSAL('interval-invalid'));
      }

      const graceMinutes = lwkGrace(Number(input.graceMinutes));
      if (graceMinutes === null) {
        return fail(`The grace is a whole number of minutes between 0 and ${L.graceMax}. Zero is a legitimate declaration — “no grace, ring immediately” — and is stored as such.`, 'graceMinutes', REFUSAL('grace-invalid'));
      }

      const start = writeInstant(check, input.startAt, 'startAt');
      if (start.error) return start.error;
      const expectedEndAt = lwkInstant(input.expectedEndAt);
      if (!expectedEndAt) return fail('Give the instant this deployment is declared to end.', 'expectedEndAt', REFUSAL('end-invalid'));

      const startMs = instantMs(start.at);
      const endMs = instantMs(expectedEndAt);
      if (endMs <= startMs) return fail('The declared end must be after the declared start. A span that runs backwards is not a deployment.', 'expectedEndAt', REFUSAL('span-reversed'));
      const spanMinutes = Math.floor((endMs - startMs) / 60_000);
      if (spanMinutes > L.spanMaxMinutes) {
        return fail(`One deployment may run at most ${L.spanMaxMinutes / 1440} days. A longer period is a working pattern, not a single lone deployment, and this register would print a deadline nobody is actually watching.`, 'expectedEndAt', REFUSAL('span-too-long'));
      }

      const conventions = normalizeLwkSettings(settings());
      const aheadDays = Math.floor((startMs - check.at.getTime()) / 86_400_000);
      if (aheadDays > conventions[LWK_SETTING_KEYS.horizonDays]) {
        return fail(`A deployment more than ${conventions[LWK_SETTING_KEYS.horizonDays]} day(s) ahead cannot be watched: the check-in roster and the responder have not been set. Re-declare it inside the declared horizon.`, 'startAt', REFUSAL('start-too-far'));
      }
      if (aheadDays < -L.backfillMaxDays) {
        return fail(`A deployment cannot be recorded more than ${L.backfillMaxDays} days after it started; the contacts it needed would already be missing and a backfilled record would read as a control that ran.`, 'startAt', REFUSAL('start-too-old'));
      }

      // ONE PERSON, ONE PLACE. A recorded close bounds the known span. An open
      // deployment has no known end: its expected end is not proof of return.
      // Keep the exact declared-span overlap refusal distinct from this uncertainty.
      const existing = normalizeLwkDeployments(rows('lwkDeployments'), []);
      for (const other of existing) {
        if (other.personId !== person.personId) continue;
        const otherStart = instantMs(other.startAt);
        const otherEnd = other.closedAt ? instantMs(other.closedAt) : instantMs(other.expectedEndAt);
        const overlapMs = Math.min(endMs, otherEnd) - Math.max(startMs, otherStart);
        if (overlapMs > 0) {
          const overlap = overlapMinutes(startMs, endMs, otherStart, otherEnd);
          return fail(`This person is already declared alone over part of that span, overlapping by ${overlap} whole minute(s) (${overlapMs} milliseconds). One person cannot be alone in two places at once, and two overlapping clocks would each be honoured by a different hand.`, 'startAt', REFUSAL('overlapping-deployment'));
        }
        if (!other.closedAt && endMs > otherStart) {
          return fail('An earlier deployment for this person is still open. Its expected end is not a recorded close, so a later deployment cannot be confirmed non-overlapping. Establish what happened and record the actual close before declaring this span; do not invent a close time.', 'startAt', REFUSAL('open-deployment-uncertain'));
        }
      }

      if (existing.length >= L.deployments) return fail('The deployment ledger is full. Export the workspace before proceeding.', null, REFUSAL('ledger-full'));

      const id = idFactory('lwk-dep');
      const row = {
        id,
        personId: person.personId,
        lineManagerId: check.actorId,
        siteRef,
        task,
        protocolRef,
        intervalMinutes,
        graceMinutes,
        startAt: start.at,
        expectedEndAt,
        declaredById: check.actorId,
        closedAt: null,
        closeOutcome: null,
        closedById: null,
        closeNote: '',
        createdAt: check.at.toISOString(),
        updatedAt: check.at.toISOString(),
      };
      const loaded = normalizeLwkDeployments([...rows('lwkDeployments'), row], []);
      const storedRow = loaded.find((candidate) => candidate.id === id) || null;
      if (!storedRow) return fail('The deployment could not be stored as a row this register can read back. Nothing was saved.', 'protocolRef', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.lwkDeployments = Array.isArray(draft.lwkDeployments) ? draft.lwkDeployments : [];
        draft.lwkDeployments.push(storedRow);
      }, {
        type: LWK_EVENTS.DEPLOYMENT_DECLARED,
        entity: 'person',
        entityId: person.personId,
        summary: `Lone deployment declared for ${person.person.name || person.personId} at ${siteRef}, checked every ${intervalMinutes} minute(s) with ${graceMinutes} minute(s) of grace, against ${protocolRef} (${LWK_ROUTE} register).`.slice(0, 300),
      });
      return saved({ id, deployment: storedRow });
    },

    /* -------------------------------------------------------------- contact */

    /**
     * RECORD a contact. It resets the clock, which is exactly why it must be a
     * real, ordered, past instant: a contact recorded twice or backwards would
     * reset a timer that never ran.
     */
    loneWorkingCheckIn(input = {}) {
      const check = seatFor(LWK_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const deploymentId = text(input.deploymentId, L.idMax) || null;
      if (!deploymentId) return fail('Name the deployment this contact is for.', 'deploymentId');
      const deployment = liveDeployment(deploymentId);
      if (!deployment) return fail(LWK_REFUSALS.notFound, 'deploymentId', REFUSAL('deployment-not-found'));
      if (deployment.closedAt) return fail('That deployment is closed out. A contact recorded after the close would edit a finished history.', 'deploymentId', REFUSAL('deployment-closed'));

      const isPerson = check.actorId === deployment.personId;
      if (!isPerson && !holdsPerson(check, deployment.personId)) {
        return fail('Only the deployed person or a seat that holds them can record this contact.', 'deploymentId', REFUSAL('not-authorised'));
      }

      const channel = text(input.channel, 40);
      if (!LWK_CHANNEL_BY_KEY[channel]) return fail('Choose how contact was made. “Somehow” is not a channel, and the strength of the evidence depends on which it was.', 'channel', REFUSAL('channel-invalid'));
      const outcome = text(input.outcome, 40);
      if (!['ok', 'concern'].includes(outcome)) return fail('Choose whether the person was all well or raised a concern. Contact is not the same as a clean bill of health.', 'outcome', REFUSAL('outcome-invalid'));

      const at = writeInstant(check, input.at, 'at');
      if (at.error) return at.error;
      if (instantMs(at.at) < instantMs(deployment.startAt)) {
        return fail('That contact precedes the deployment’s declared start. The register refuses a reassurance from before the person went out.', 'at', REFUSAL('contact-before-start'));
      }

      const loaded = normalizeLwkCheckins(rows('lwkCheckins'), normalizeLwkDeployments(rows('lwkDeployments'), []), []);
      const mine = loaded.filter((row) => row.deploymentId === deploymentId).sort((a, b) => instantMs(b.at) - instantMs(a.at));
      if (mine.length && instantMs(at.at) <= instantMs(mine[0].at)) {
        return fail(`The last recorded contact on this deployment is ${mine[0].at} and this one is not after it. Contact history cannot run backwards, and a contact at the same instant is the same contact.`, 'at', REFUSAL('contact-not-later'));
      }
      if (loaded.length >= L.checkins) return fail('The contact ledger is full. Export the workspace before proceeding.', null, REFUSAL('ledger-full'));

      const id = idFactory('lwk-chk');
      const row = {
        id,
        deploymentId,
        at: at.at,
        channel,
        outcome,
        recordedById: check.actorId,
        note: text(input.note, L.textMax),
        createdAt: check.at.toISOString(),
      };
      const stored = normalizeLwkCheckins([...rows('lwkCheckins'), row], normalizeLwkDeployments(rows('lwkDeployments'), []), [])
        .find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The contact could not be stored as a row this register can read back. Nothing was saved.', 'at', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.lwkCheckins = Array.isArray(draft.lwkCheckins) ? draft.lwkCheckins : [];
        draft.lwkCheckins.push(stored);
      }, {
        type: LWK_EVENTS.CHECK_IN_RECORDED,
        entity: 'person',
        entityId: deployment.personId,
        summary: `Check-in recorded on deployment ${deploymentId} by ${LWK_CHANNEL_BY_KEY[channel].label.toLowerCase()}: ${outcome === 'concern' ? 'a concern was raised and is now owed a response' : 'all well'} (${LWK_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, checkIn: stored, concernRaised: outcome === 'concern' });
    },

    /* ----------------------------------------------------------- escalation */

    /**
     * RECORD an escalation: the response to a failed or concerning contact, by a
     * hand that is not the deployed person. Only `welfare-confirmed` clears the
     * unconfirmed state, and it clears nothing else.
     */
    loneWorkingEscalate(input = {}) {
      const check = seatFor(LWK_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const deploymentId = text(input.deploymentId, L.idMax) || null;
      if (!deploymentId) return fail('Name the deployment this escalation answers.', 'deploymentId');
      const deployment = liveDeployment(deploymentId);
      if (!deployment) return fail(LWK_REFUSALS.notFound, 'deploymentId', REFUSAL('deployment-not-found'));
      if (deployment.closedAt) return fail('That deployment is closed out. An escalation recorded after the close would answer a duty that had already ended.', 'deploymentId', REFUSAL('deployment-closed'));

      if (check.actorId === deployment.personId) {
        return fail('A person cannot raise the welfare escalation about themselves. Record a concern on the contact instead — that is the act the register is built for, and it owes somebody else a response.', 'deploymentId', REFUSAL('self-escalation'));
      }
      if (!holdsPerson(check, deployment.personId)) {
        return fail('This seat neither holds this person through the span nor through a declared line.', 'deploymentId', REFUSAL('not-authorised'));
      }

      const basis = text(input.basis, 60);
      if (!LWK_ESCALATION_BASIS_BY_KEY[basis]) return fail('Choose why this escalation was raised. The register does not guess which condition moved you.', 'basis', REFUSAL('basis-invalid'));
      const outcome = text(input.outcome, 60);
      if (!LWK_ESCALATION_OUTCOME_BY_KEY[outcome]) return fail('Choose what the escalation actually did. “Handled” is not an outcome.', 'outcome', REFUSAL('outcome-invalid'));
      const detail = lwkReason(input.detail);
      if (!detail) return fail(`Write what was done, in at least ${L.textMin} characters. The next hand needs to know what you tried before they try it again.`, 'detail', REFUSAL('detail-missing'));

      const raised = writeInstant(check, input.raisedAt, 'raisedAt');
      if (raised.error) return raised.error;
      if (instantMs(raised.at) < instantMs(deployment.startAt)) {
        return fail('That escalation precedes the deployment’s declared start.', 'raisedAt', REFUSAL('escalation-before-start'));
      }

      // Is there a condition to answer? Read it through the ONE reader so the door
      // and the screen cannot disagree about the state.
      const report = buildLoneWorking(store.state, { now: new Date(instantMs(raised.at)), settings: settings(), seat: null });
      const row = report.rows.find((candidate) => candidate.deployment.id === deploymentId) || null;
      const answerable = new Set(['check-due', 'welfare-unconfirmed', 'escalation-open', 'welfare-confirmed-late', 'concern-unanswered', 'overran']);
      if (!row || !answerable.has(row.state.key)) {
        return fail('The register accepts a welfare escalation only when the declared interval has passed, a concern is open, or the deployment has overrun its declared end. This deployment is current, so there is no condition to answer — record the contact instead.', 'raisedAt', REFUSAL('nothing-to-escalate'));
      }

      const loaded = normalizeLwkEscalations(rows('lwkEscalations'), normalizeLwkDeployments(rows('lwkDeployments'), []), []);
      if (loaded.length >= L.escalations) return fail('The escalation ledger is full. Export the workspace before proceeding.', null, REFUSAL('ledger-full'));

      const id = idFactory('lwk-esc');
      const escalation = {
        id,
        deploymentId,
        raisedAt: raised.at,
        raisedById: check.actorId,
        basis,
        outcome,
        detail,
        createdAt: check.at.toISOString(),
      };
      const stored = normalizeLwkEscalations([...rows('lwkEscalations'), escalation], normalizeLwkDeployments(rows('lwkDeployments'), []), [])
        .find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The escalation could not be stored as a row this register can read back. Nothing was saved.', 'detail', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.lwkEscalations = Array.isArray(draft.lwkEscalations) ? draft.lwkEscalations : [];
        draft.lwkEscalations.push(stored);
      }, {
        type: LWK_EVENTS.ESCALATION_RAISED,
        entity: 'person',
        entityId: deployment.personId,
        summary: `Welfare escalation recorded on deployment ${deploymentId} (${LWK_ESCALATION_BASIS_BY_KEY[basis].label.toLowerCase()}): ${LWK_ESCALATION_OUTCOME_BY_KEY[outcome].label.toLowerCase()}. ${outcome === 'welfare-confirmed' ? 'The late minutes stay on the record.' : 'Welfare remains unconfirmed.'} (${LWK_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, escalation: stored });
    },

    /* ---------------------------------------------------------------- close */

    /** CLOSE the deployment out: what happened, on a recorded instant, with a written note. */
    loneWorkingCloseDeployment(input = {}) {
      const check = seatFor(LWK_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const deploymentId = text(input.deploymentId, L.idMax) || null;
      if (!deploymentId) return fail('Name the deployment being closed out.', 'deploymentId');
      const deployment = liveDeployment(deploymentId);
      if (!deployment) return fail(LWK_REFUSALS.notFound, 'deploymentId', REFUSAL('deployment-not-found'));
      if (deployment.closedAt) return fail(`That deployment was already closed out on ${deployment.closedAt}. History is never rewritten.`, 'deploymentId', REFUSAL('already-closed'));

      const isPerson = check.actorId === deployment.personId;
      if (!isPerson && !holdsPerson(check, deployment.personId)) {
        return fail('Only the deployed person or a seat that holds them can close this deployment out.', 'deploymentId', REFUSAL('not-authorised'));
      }

      const closeOutcome = text(input.closeOutcome, 60);
      if (!LWK_CLOSE_OUTCOME_BY_KEY[closeOutcome]) return fail('Choose how the deployment ended. A close-out that names nothing is an administrative delete of a safety duty.', 'closeOutcome', REFUSAL('close-outcome-invalid'));
      const closeNote = lwkReason(input.note);
      if (!closeNote) return fail(`Write what happened, in at least ${L.textMin} characters. The next hand needs it, and so does anyone who reads this after an incident.`, 'note', REFUSAL('close-note-missing'));

      const at = writeInstant(check, input.at, 'at');
      if (at.error) return at.error;
      if (instantMs(at.at) < instantMs(deployment.startAt)) {
        return fail('A deployment cannot be closed out before it started.', 'at', REFUSAL('close-before-start'));
      }

      writeDraft((draft) => {
        for (const row of draft.lwkDeployments || []) {
          if (row && row.id === deploymentId) {
            row.closedAt = at.at;
            row.closeOutcome = closeOutcome;
            row.closedById = check.actorId;
            row.closeNote = closeNote;
            row.updatedAt = check.at.toISOString();
          }
        }
      }, {
        type: LWK_EVENTS.DEPLOYMENT_CLOSED,
        entity: 'person',
        entityId: deployment.personId,
        summary: `Deployment ${deploymentId} closed out (${LWK_CLOSE_OUTCOME_BY_KEY[closeOutcome].label.toLowerCase()})${isPerson ? ' by the deployed person themselves' : ''} (${LWK_ROUTE}).`.slice(0, 300),
      });
      return saved({ id: deploymentId });
    },

    /* ---------------------------------------------------------- conventions */

    loneWorkingSetConventions(input = {}) {
      const check = seatFor(LWK_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const current = normalizeLwkSettings(settings());
      const patch = input.patch && typeof input.patch === 'object' && !Array.isArray(input.patch) ? input.patch : input;
      const known = new Set(Object.values(LWK_SETTING_KEYS));
      for (const key of Object.keys(patch || {})) {
        if (!known.has(key)) return fail(`Unknown convention “${String(key).slice(0, 60)}”. Nothing was saved.`, key, REFUSAL('unknown-setting'));
      }
      const next = { ...current };
      for (const [key, value] of Object.entries(patch || {})) {
        if (key === LWK_SETTING_KEYS.autoPropagate) { next[key] = value !== false; continue; }
        const n = Number(value);
        if (!Number.isInteger(n)) return fail(`“${key}” is a whole number. Nothing was saved.`, key, REFUSAL('setting-invalid'));
        const bound = key === LWK_SETTING_KEYS.privacyFloor ? LWK_BOUNDS.privacyFloor : LWK_BOUNDS.horizonDays;
        if (n < bound.min || n > bound.max) {
          return fail(`“${key}” must be between ${bound.min} and ${bound.max}. It is refused rather than clamped, so the figure on the screen is always the figure somebody declared.`, key, REFUSAL('setting-out-of-bounds'));
        }
        next[key] = n;
      }
      store.update((draft) => {
        draft.settings = { ...(draft.settings || {}), ...next };
      }, {
        type: LWK_EVENTS.CONVENTIONS_SET,
        entity: 'workspace',
        entityId: LWK_ROUTE,
        summary: `Lone-working conventions re-declared: the planning horizon, the privacy floor and whether the rule may file asks (${LWK_ROUTE}).`.slice(0, 300),
      });
      return saved({ conventions: normalizeLwkSettings(store.state.settings || {}) });
    },

    /* ---------------------------------------------------------------- reads */

    loneWorkingReport() {
      const check = readCheck();
      if (!check.ok) return check;
      return { ok: true, report: buildLoneWorking(store.state, { now: check.at, settings: check.cfg, seat: check.seat }) };
    },

    loneWorkingAttention() {
      const check = readCheck();
      if (!check.ok) return check;
      return { ok: true, count: loneWorkingAttentionCount(store.state, { now: check.at, settings: check.cfg, seat: check.seat }) };
    },

    /** The candidates a dialog may name, narrowed to what this seat may actually write. */
    loneWorkingCandidates() {
      const check = readCheck();
      if (!check.ok) return check;
      const roster = rows('people').filter((row) => row && row.status !== 'archived' && row.id);
      const people = roster
        .filter((row) => holdsPerson(check, row.id) && (check.seat.fullAccess || row.id !== (check.seat.nodeId || check.seat.id)))
        .map((row) => ({ id: row.id, name: row.name || row.id, role: row.role || '' }))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
      return { ok: true, people };
    },

    /**
     * The explicit scan. Re-runs the rule over the whole register. Pausable: a
     * pause is a pause on every path, including this one.
     */
    loneWorkingScan() {
      const check = seatFor(LWK_RIGHTS.DECLARE);
      if (!check.ok) return check;
      store.update((draft) => {
        draft.lwkMarkers = Array.isArray(draft.lwkMarkers) ? draft.lwkMarkers : [];
      }, {
        type: LWK_EVENTS.SCANNED,
        entity: 'workspace',
        entityId: LWK_ROUTE,
        summary: `Lone-working register scanned; the rule re-reads every open deployment against its declared interval, grace and end (${LWK_ROUTE}).`.slice(0, 300),
      });
      return saved({});
    },
  };
}

/** The read context, exported so the view can print exactly what the register claims. */
export const LONE_WORKING_CONTEXT = 'Read the lone-working register (#/lone-working). It records who is working alone, when they were last heard from, and whether welfare is confirmed. It tracks no location and scores nobody.';

/** The matrix this module reads must be the engine's own (ADR-0140), not a second one. */
export function loneWorkingMatrixFor(state, now) {
  return buildMatrix(state, { now, settings: { ...(state?.settings || {}), activeSeatId: null } });
}
