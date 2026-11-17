/**
 * app/core/domain/authorisationActions.js — the seat-checked commands of the
 * Statutory Authorisation & Licence-to-Operate Register (ADR-0247).
 *
 * NINE human acts and a scan: DECLARE an authority, DECLARE a condition, RECORD
 * evidence, RECORD a regulator action, CLOSE an action, SUBMIT a renewal, DECIDE a
 * renewal, re-declare the conventions — plus the explicit scan. Every state,
 * effective expiry, lapsed minute and condition verdict is re-derived on read by
 * `authorisation.js`; nothing derived is stored.
 *
 * THE DOOR IS THE PRODUCT, AND EVERY REFUSAL IS A CONTROL.
 *  - An authority carries a written instrument reference, an issuing body, a
 *    declared grant, a declared expiry, a declared renewal lead and one to four
 *    accountable hands. Holding a power to operate is a grant on an instrument;
 *    an untraceable one is refused.
 *  - The same site, activity and instrument cannot be declared twice while the
 *    first is anything other than revoked. Two live records of one consent is how
 *    a renewal gets filed against the wrong row.
 *  - A grant cannot be declared to run backwards or beyond the bound, and a lead
 *    time is a whole number of days, refused rather than rounded.
 *  - A CONDITION is declared against a written condition with its own re-evidence
 *    window. The register does not invent a window from the instrument type.
 *  - EVIDENCE is a dated reference, never the certificate, and cannot be recorded
 *    in the future or at an instant that is not later than the last evidence on
 *    that condition: evidence history that can run backwards is history nobody can
 *    read.
 *  - A REGULATOR ACTION is served and effective in that order, carries a written
 *    basis, and an improvement notice carries the compliance day it set. A notice
 *    cannot be served in the future. A second revocation is refused while one
 *    stands, and a suspension cannot be recorded against a revoked authority.
 *  - A CLOSE names what ended the action, is one its own kind permits, and is
 *    refused on a revocation: a revoked authority stays revoked. Nothing may
 *    “close” a revocation back to life.
 *  - A RENEWAL is submitted with a written basis and cannot be submitted against a
 *    revoked authority or while another renewal is undecided.
 *  - A DECISION arrives once, after the submission, with a written reason; a grant
 *    must carry a new expiry STRICTLY LATER than the effective expiry at that
 *    instant and after the decision day. A submission never extends anything.
 *  - Every write is run through the loader and the stored row is the row the
 *    loader returns. A write the loader would refuse on reload is refused now.
 *
 * WHAT NO COMMAND CAN DO. There is no command that sets a status, marks a
 * condition compliant without evidence, treats a submitted renewal as a grant,
 * lifts a revocation, closes a notice without a close kind and basis, erases a
 * lapsed authority, or scores a site, a person or a line. The absence of those
 * commands is the design.
 */

import { dayKey } from '../time.js';
import { buildSeats, activeSeat, canAct } from './seat.js';
import { matrixLineScopeFor, buildMatrix } from './matrix.js';
import { buildAuthorisations, authorisationAttentionCount, deriveLtoState } from './authorisation.js';
import {
  LTO_ACTION_KIND_BY_KEY,
  LTO_BOUNDS,
  LTO_CLOSE_KIND_BY_KEY,
  LTO_EVENTS,
  LTO_LIMITS as L,
  LTO_REFUSALS,
  LTO_RENEWAL_DECISION_KEYS,
  LTO_RIGHTS,
  LTO_ROUTE,
  LTO_SETTING_KEYS,
} from './authorisationRegistry.js';
import {
  ltoDayKey,
  ltoHolders,
  ltoInstant,
  ltoInstrument,
  ltoLeadDays,
  ltoMaxAgeDays,
  ltoReason,
  ltoShort,
  normalizeLtoActions,
  normalizeLtoAuthorisations,
  normalizeLtoConditions,
  normalizeLtoEvidence,
  normalizeLtoRenewals,
  normalizeLtoSettings,
} from './authorisationSchema.js';
import { instantMs } from './authorisationMath.js';

const REFUSAL = (key) => `authorisation:${key}`;
const text = (value, max = L.textMax) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export function createAuthorisationActions(store, { now, idFactory }) {
  const fail = (error, field = null, refusal = null) => ({ ok: false, error, ...(field ? { field } : {}), ...(refusal ? { refusal } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  const rows = (key) => (Array.isArray(store.state[key]) ? store.state[key] : []);
  /**
   * A write result. The caller’s own warning is MERGED with the persist error,
   * never overwritten by it: a closure that left an isolation outstanding, or an
   * authority stored with an unreadable child, must not lose its message on a
   * clean persist.
   */
  const saved = (extra = {}) => {
    const { warning: ownWarning, ...rest } = extra;
    const persistError = store.persistError || null;
    const warning = ownWarning && persistError ? `${ownWarning} ${persistError}` : (ownWarning || persistError);
    return { ...rest, saved: !persistError, warning, propagations: store.lastPropagations || [], ok: true };
  };

  function seatFor(right) {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    const seat = activeSeat(built);
    if (seat.readOnly) return fail(LTO_REFUSALS.notSeated);
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, seat, at, cfg, actorId: seat.fullAccess ? 'leader' : (seat.nodeId || seat.id || null), today: dayKey(at) };
  }

  /**
   * A read is REGISTERED as safe and therefore bypasses the gateway’s rank check —
   * so the right is re-proved HERE, exactly as every register in this workspace
   * re-proves it. Without this, which authority lapsed and who holds it would be
   * readable by a seat the record class denies.
   */
  function readCheck() {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    const seat = activeSeat(built);
    if (seat.readOnly) return fail(LTO_REFUSALS.notSeated);
    const verdict = canAct(LTO_RIGHTS.READ, seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, seat, at, cfg, actorId: seat.fullAccess ? 'leader' : (seat.nodeId || seat.id || null), today: dayKey(at) };
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
    const personKey = text(personId, L.idMax) || null;
    if (!personKey) return fail('Name the person this is about.', 'personId');
    const person = rows('people').find((row) => row && row.id === personKey) || null;
    if (!person) return fail('That person is not on this record. Nothing was saved.', 'personId', REFUSAL('person-not-found'));
    if (person.status === 'archived') return fail('That person is archived. Nothing was saved.', 'personId', REFUSAL('person-archived'));
    if (!holdsPerson(check, personKey)) return fail(LTO_REFUSALS.noReach, 'personId', REFUSAL('not-your-person'));
    return { ok: true, personId: personKey, person };
  }

  /** One to four accountable hands, each on the roster, active, and held by this seat. */
  function holdersContext(check, value) {
    const ids = ltoHolders(Array.isArray(value) ? value : text(value, 2000).split(/[,;]/).map((part) => part.trim()).filter(Boolean));
    if (!ids) {
      return fail(`Name between one and ${L.holdersMax} accountable person(s), each on this workspace once. An authority with no accountable hand has nobody to answer for it.`, 'accountableIds', REFUSAL('holders-invalid'));
    }
    for (const holderId of ids) {
      const person = rows('people').find((row) => row && row.id === holderId) || null;
      if (!person) return fail(`“${holderId}” is not a person on this record. Nothing was saved.`, 'accountableIds', REFUSAL('holder-not-found'));
      if (person.status === 'archived') return fail(`${person.name || holderId} is archived and cannot be named as accountable for a live authority.`, 'accountableIds', REFUSAL('holder-archived'));
      if (!holdsPerson(check, holderId)) {
        return fail(`${person.name || holderId} is not on a line this seat holds. ${LTO_REFUSALS.noReach}`, 'accountableIds', REFUSAL('holder-not-your-person'));
      }
    }
    return { ok: true, ids };
  }

  function loadedAuthorisations() {
    return normalizeLtoAuthorisations(rows('ltoAuthorisations'), []);
  }
  function loadedConditions() {
    return normalizeLtoConditions(rows('ltoConditions'), loadedAuthorisations(), []);
  }
  function loadedEvidence() {
    return normalizeLtoEvidence(rows('ltoEvidence'), loadedConditions(), []);
  }
  function loadedActions() {
    return normalizeLtoActions(rows('ltoActions'), loadedAuthorisations(), []);
  }
  function loadedRenewals() {
    return normalizeLtoRenewals(rows('ltoRenewals'), loadedAuthorisations(), []);
  }

  function writeDraft(mutate, event) {
    store.update((draft) => { mutate(draft); }, event);
    return true;
  }

  /**
   * An instant a declaration names. Unlike a contact, a GRANT and an EFFECTIVE
   * instant may legitimately be in the future (a consent granted to commence on
   * Monday; a notice effective on Friday), so this bound only refuses values
   * outside the declared horizon and far past the backfill limit.
   */
  function declaredInstant(check, value, field, { futureDays = L.aheadMaxDays, pastDays = L.backfillMaxDays, required = true } = {}) {
    if (value === undefined || value === null || value === '') {
      return required ? { error: fail('Give a real instant.', field, REFUSAL('instant-invalid')) } : { at: null };
    }
    const at = ltoInstant(value);
    if (!at) return { error: fail('Give a real instant.', field, REFUSAL('instant-invalid')) };
    const deltaDays = (instantMs(at) - check.at.getTime()) / 86_400_000;
    if (deltaDays > futureDays) {
      return { error: fail(`That instant is more than ${futureDays} day(s) ahead. A declaration that far out is a plan, not a record anyone is working to.`, field, REFUSAL('instant-too-far')) };
    }
    if (deltaDays < -pastDays) {
      return { error: fail(`That instant is more than ${pastDays} day(s) ago. A backfilled record would read as a control that ran when it did not.`, field, REFUSAL('instant-too-old')) };
    }
    return { at };
  }

  /** An instant of an ACT that has already happened, and therefore cannot be future. */
  function pastInstant(check, value, field) {
    if (value === undefined || value === null || value === '') return { at: check.at.toISOString() };
    const at = ltoInstant(value);
    if (!at) return { error: fail('Give a real instant.', field, REFUSAL('instant-invalid')) };
    if (instantMs(at) > check.at.getTime()) {
      return { error: fail('That instant is in the future. This register records what a regulator or a hand did, not what will be.', field, REFUSAL('instant-future')) };
    }
    return { at };
  }

  return {
    /* ------------------------------------------------------------ authorities */

    /**
     * DECLARE an authority: site, activity, issuing body, written instrument, grant,
     * expiry, renewal lead and the hands accountable for it.
     */
    authorisationDeclare(input = {}) {
      const check = seatFor(LTO_RIGHTS.MANAGE);
      if (!check.ok) return check;

      const siteRef = ltoShort(input.siteRef);
      if (!siteRef) return fail(`Name the site this authority covers, in at least ${L.shortMin} characters. “The site” is not a site.`, 'siteRef', REFUSAL('site-invalid'));
      const activityRef = ltoShort(input.activityRef);
      if (!activityRef) return fail(`Name the activity the authority permits, in at least ${L.shortMin} characters.`, 'activityRef', REFUSAL('activity-invalid'));
      const issuingAuthority = ltoShort(input.issuingAuthority);
      if (!issuingAuthority) return fail(`Name the body that issued it, in at least ${L.shortMin} characters. An authority nobody issued is not an authority.`, 'issuingAuthority', REFUSAL('authority-invalid'));
      const instrumentRef = ltoInstrument(input.instrumentRef);
      if (!instrumentRef) {
        return fail(`Cite the written instrument, in at least ${L.instrumentMin} characters — its reference and any revision or number. An authority with no instrument is exactly the plausible default this register forbids.`, 'instrumentRef', REFUSAL('instrument-missing'));
      }

      const grant = declaredInstant(check, input.grantedAt, 'grantedAt');
      if (grant.error) return grant.error;
      const expiry = declaredInstant(check, input.expiresAt, 'expiresAt');
      if (expiry.error) return expiry.error;
      const grantedMs = instantMs(grant.at);
      const expiresMs = instantMs(expiry.at);
      if (expiresMs <= grantedMs) return fail('The declared expiry must be after the declared grant. A span that runs backwards is not an authority.', 'expiresAt', REFUSAL('span-reversed'));
      if ((expiresMs - grantedMs) / 86_400_000 > L.spanMaxDays) {
        return fail(`One authority may run at most ${L.spanMaxDays} days (${L.spanMaxDays / 365} years). A longer declared span is not a single instrument and would print a renewal window nobody set.`, 'expiresAt', REFUSAL('span-too-long'));
      }

      const renewalLeadDays = ltoLeadDays(Number(input.renewalLeadDays));
      if (renewalLeadDays === null) {
        return fail(`The renewal lead is a whole number of days between 0 and ${L.leadDaysMax}. Zero is legitimate — “renew on the day” — and is stored as such rather than defaulted.`, 'renewalLeadDays', REFUSAL('lead-invalid'));
      }

      const holders = holdersContext(check, input.accountableIds);
      if (!holders.ok) return holders;

      // THE SAME CONSENT, TWICE. Only refused while the earlier record is still a
      // live authority; a revoked one may legitimately be re-declared.
      const existing = buildAuthorisations(store.state, { now: check.at, settings: check.cfg, seat: null });
      const duplicate = existing.rows.find((row) => row.authorisation.siteRef.toLowerCase() === siteRef.toLowerCase()
        && row.authorisation.activityRef.toLowerCase() === activityRef.toLowerCase()
        && row.authorisation.instrumentRef.toLowerCase() === instrumentRef.toLowerCase()
        && row.state.key !== 'revoked');
      if (duplicate) {
        return fail(`That site, activity and instrument are already on the record as “${duplicate.state.label}”. Two live records of one consent is how a renewal gets filed against the wrong row. If this is a new instrument, cite its reference; if the old one was revoked, record the revocation first.`, 'instrumentRef', REFUSAL('duplicate-authority'));
      }

      if (loadedAuthorisations().length >= L.authorisations) return fail('The authority ledger is full. Export the workspace before proceeding.', null, REFUSAL('ledger-full'));

      const id = idFactory('lto-aut');
      const row = {
        id,
        siteRef,
        activityRef,
        issuingAuthority,
        instrumentRef,
        grantedAt: grant.at,
        expiresAt: expiry.at,
        renewalLeadDays,
        accountableIds: holders.ids,
        declaredById: check.actorId,
        createdAt: check.at.toISOString(),
        updatedAt: check.at.toISOString(),
      };
      const stored = normalizeLtoAuthorisations([...rows('ltoAuthorisations'), row], [])
        .find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The authority could not be stored as a row this register can read back. Nothing was saved.', 'instrumentRef', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.ltoAuthorisations = Array.isArray(draft.ltoAuthorisations) ? draft.ltoAuthorisations : [];
        draft.ltoAuthorisations.push(stored);
      }, {
        type: LTO_EVENTS.AUTHORISATION_DECLARED,
        entity: 'workspace',
        entityId: siteRef,
        summary: `Statutory authority declared for ${activityRef} at ${siteRef} by ${issuingAuthority} under ${instrumentRef}, expiring ${expiry.at}, with a ${renewalLeadDays}-day renewal lead (${LTO_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, authorisation: stored });
    },

    /* -------------------------------------------------------------- conditions */

    authorisationDeclareCondition(input = {}) {
      const check = seatFor(LTO_RIGHTS.MANAGE);
      if (!check.ok) return check;

      const authorisationId = text(input.authorisationId, L.idMax) || null;
      if (!authorisationId) return fail('Name the authority this condition belongs to.', 'authorisationId');
      const authority = loadedAuthorisations().find((row) => row.id === authorisationId) || null;
      if (!authority) return fail(LTO_REFUSALS.notFound, 'authorisationId', REFUSAL('authority-not-found'));

      const conditionKey = text(input.conditionKey, L.idMax) || null;
      if (!conditionKey || !/^[A-Za-z0-9:_-]{1,120}$/.test(conditionKey)) {
        return fail('Give the condition a short key — letters, digits, colon, dash or underscore — so its evidence can be attached to it unambiguously.', 'conditionKey', REFUSAL('condition-key-invalid'));
      }
      const conditionRef = ltoReason(input.conditionRef);
      if (!conditionRef) return fail(`Write the condition as the instrument states it, in at least ${L.textMin} characters. “Comply with the conditions” is not a condition.`, 'conditionRef', REFUSAL('condition-missing'));
      const maxAgeDays = ltoMaxAgeDays(Number(input.maxAgeDays));
      if (maxAgeDays === null) {
        return fail(`The re-evidence window is a whole number of days between 0 and ${L.conditionMaxAgeDays}. Zero means the condition carries no re-evidence window, and is stored as that declaration rather than as a default.`, 'maxAgeDays', REFUSAL('max-age-invalid'));
      }

      const existing = loadedConditions();
      if (existing.some((row) => row.authorisationId === authorisationId && row.conditionKey === conditionKey)) {
        return fail('That condition key is already on this authority. Two windows under one key would make the evidence age ambiguous; use a distinct key.', 'conditionKey', REFUSAL('condition-key-duplicate'));
      }
      if (existing.length >= L.conditions) return fail('The condition ledger is full. Export the workspace before proceeding.', null, REFUSAL('ledger-full'));

      const id = idFactory('lto-con');
      const row = {
        id,
        authorisationId,
        conditionKey,
        conditionRef,
        maxAgeDays,
        declaredById: check.actorId,
        createdAt: check.at.toISOString(),
      };
      const stored = normalizeLtoConditions([...rows('ltoConditions'), row], loadedAuthorisations(), [])
        .find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The condition could not be stored as a row this register can read back. Nothing was saved.', 'conditionRef', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.ltoConditions = Array.isArray(draft.ltoConditions) ? draft.ltoConditions : [];
        draft.ltoConditions.push(stored);
      }, {
        type: LTO_EVENTS.CONDITION_DECLARED,
        entity: 'workspace',
        entityId: authority.siteRef,
        summary: `Condition ${conditionKey} declared against the authority for ${authority.activityRef} at ${authority.siteRef}, with a ${maxAgeDays}-day re-evidence window (${LTO_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, condition: stored });
    },

    /* ---------------------------------------------------------------- evidence */

    authorisationRecordEvidence(input = {}) {
      const check = seatFor(LTO_RIGHTS.MANAGE);
      if (!check.ok) return check;

      const conditionId = text(input.conditionId, L.idMax) || null;
      if (!conditionId) return fail('Name the condition this evidence is for.', 'conditionId');
      const condition = loadedConditions().find((row) => row.id === conditionId) || null;
      if (!condition) return fail(LTO_REFUSALS.notFound, 'conditionId', REFUSAL('condition-not-found'));

      const evidenceRef = ltoInstrument(input.evidenceRef);
      if (!evidenceRef) return fail(`Cite the evidence, in at least ${L.instrumentMin} characters — a report reference, a test certificate number, a dated inspection record. The register stores the reference, not the document.`, 'evidenceRef', REFUSAL('evidence-missing'));

      const at = pastInstant(check, input.at, 'at');
      if (at.error) return at.error;

      const mine = loadedEvidence()
        .filter((row) => row.conditionId === conditionId && instantMs(row.at) !== null)
        .sort((a, b) => instantMs(b.at) - instantMs(a.at) || String(a.id).localeCompare(String(b.id)));
      if (mine.length && instantMs(at.at) <= instantMs(mine[0].at)) {
        return fail(`The latest evidence on this condition is ${mine[0].at} and this one is not later. Evidence history cannot run backwards, and a second record at the same instant is the same record.`, 'at', REFUSAL('evidence-not-later'));
      }
      if (loadedEvidence().length >= L.evidence) return fail('The evidence ledger is full. Export the workspace before proceeding.', null, REFUSAL('ledger-full'));

      const id = idFactory('lto-evd');
      const row = {
        id,
        conditionId,
        evidenceRef,
        at: at.at,
        byId: check.actorId,
        note: text(input.note, L.textMax),
        createdAt: check.at.toISOString(),
      };
      const stored = normalizeLtoEvidence([...rows('ltoEvidence'), row], loadedConditions(), [])
        .find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The evidence could not be stored as a row this register can read back. Nothing was saved.', 'evidenceRef', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.ltoEvidence = Array.isArray(draft.ltoEvidence) ? draft.ltoEvidence : [];
        draft.ltoEvidence.push(stored);
      }, {
        type: LTO_EVENTS.EVIDENCE_RECORDED,
        entity: 'workspace',
        entityId: condition.conditionKey,
        summary: `Evidence recorded against condition ${condition.conditionKey}: ${evidenceRef}, dated ${at.at} (${LTO_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, evidence: stored });
    },

    /* -------------------------------------------------------- regulator actions */

    authorisationRecordAction(input = {}) {
      const check = seatFor(LTO_RIGHTS.MANAGE);
      if (!check.ok) return check;

      const authorisationId = text(input.authorisationId, L.idMax) || null;
      if (!authorisationId) return fail('Name the authority this action is against.', 'authorisationId');
      const authority = loadedAuthorisations().find((row) => row.id === authorisationId) || null;
      if (!authority) return fail(LTO_REFUSALS.notFound, 'authorisationId', REFUSAL('authority-not-found'));

      const kind = text(input.kind, 60) || null;
      const definition = kind ? LTO_ACTION_KIND_BY_KEY[kind] : null;
      if (!definition) return fail('Choose the kind of regulator action. “Something happened” is not an action.', 'kind', REFUSAL('kind-invalid'));

      const served = pastInstant(check, input.servedAt, 'servedAt');
      if (served.error) return served.error;
      const effective = declaredInstant(check, input.effectiveFrom, 'effectiveFrom');
      if (effective.error) return effective.error;
      if (instantMs(effective.at) < instantMs(served.at)) {
        return fail('The effective instant cannot precede the instant it was served. An action cannot take effect before anybody was told.', 'effectiveFrom', REFUSAL('effective-before-served'));
      }

      const basisRef = ltoReason(input.basisRef);
      if (!basisRef) return fail(`Write the written basis the regulator gave, in at least ${L.textMin} characters. A notice with no stated basis cannot be answered.`, 'basisRef', REFUSAL('basis-missing'));

      const dueOn = input.dueOn ? ltoDayKey(input.dueOn) : null;
      if (input.dueOn && !dueOn) return fail('The compliance day is a real date (YYYY-MM-DD).', 'dueOn', REFUSAL('due-invalid'));
      if (definition.dueRequired && !dueOn) {
        return fail('An improvement notice carries the day the regulator set for compliance. Without it the register cannot tell an open notice from an overdue one.', 'dueOn', REFUSAL('due-missing'));
      }

      const existing = loadedActions();
      const mine = existing.filter((row) => row.authorisationId === authorisationId);
      const nowMs = check.at.getTime();
      /**
       * A REVOCATION IS COUNTED FROM THE MOMENT IT IS ON THE RECORD, not from the
       * moment it takes effect. A revocation served today and effective on Monday is
       * already a decision about this authority; a second revocation or a suspension
       * filed in between would make the record look like two separate acts.
       */
      const revocationOnRecord = mine.find((row) => row.kind === 'revocation'
        && (!row.closedAt || instantMs(row.closedAt) > nowMs)) || null;
      if (kind === 'revocation' && revocationOnRecord) {
        return fail('A revocation is already on this authority. A second revocation adds nothing and would make the record look like two separate acts.', 'kind', REFUSAL('already-revoked'));
      }
      if (revocationOnRecord) {
        return fail('That authority is revoked. No suspension or prohibition can be recorded against a revoked authority; declare the new instrument if one has been granted.', 'kind', REFUSAL('revoked'));
      }

      if (existing.length >= L.actions) return fail('The regulator-action ledger is full. Export the workspace before proceeding.', null, REFUSAL('ledger-full'));

      const id = idFactory('lto-act');
      const row = {
        id,
        authorisationId,
        kind,
        servedAt: served.at,
        effectiveFrom: effective.at,
        basisRef,
        noticeRef: input.noticeRef ? ltoShort(input.noticeRef) : null,
        scopeRef: input.scopeRef ? ltoShort(input.scopeRef) : null,
        dueOn,
        recordedById: check.actorId,
        closedAt: null,
        closeKind: null,
        closeBasisRef: null,
        closedById: null,
        createdAt: check.at.toISOString(),
      };
      const stored = normalizeLtoActions([...rows('ltoActions'), row], loadedAuthorisations(), [])
        .find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The action could not be stored as a row this register can read back. Nothing was saved.', 'basisRef', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.ltoActions = Array.isArray(draft.ltoActions) ? draft.ltoActions : [];
        draft.ltoActions.push(stored);
      }, {
        type: LTO_EVENTS.ACTION_RECORDED,
        entity: 'workspace',
        entityId: authority.siteRef,
        summary: `${definition.label} recorded against the authority for ${authority.activityRef} at ${authority.siteRef}, served ${served.at}, effective ${effective.at} (${LTO_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, action: stored });
    },

    authorisationCloseAction(input = {}) {
      const check = seatFor(LTO_RIGHTS.MANAGE);
      if (!check.ok) return check;

      const actionId = text(input.actionId, L.idMax) || null;
      if (!actionId) return fail('Name the action this close is for.', 'actionId');
      const action = loadedActions().find((row) => row.id === actionId) || null;
      if (!action) return fail(LTO_REFUSALS.notFound, 'actionId', REFUSAL('action-not-found'));
      const definition = LTO_ACTION_KIND_BY_KEY[action.kind];
      if (!definition?.closable) {
        return fail(`${definition?.label || 'That action'} cannot be closed. A revocation is terminal in the record and a variation already took effect; only a new declaration restores a power to operate.`, 'actionId', REFUSAL('not-closable'));
      }
      if (action.closedAt) return fail(`That action was already closed on ${action.closedAt}. A second close would edit a finished history.`, 'actionId', REFUSAL('already-closed'));

      const closeKind = text(input.closeKind, 60) || null;
      if (!LTO_CLOSE_KIND_BY_KEY[closeKind] || !definition.closeKinds.includes(closeKind)) {
        return fail(`Choose how it ended: ${definition.closeKinds.map((key) => LTO_CLOSE_KIND_BY_KEY[key].label).join(' or ')}. That is the only close this kind permits.`, 'closeKind', REFUSAL('close-kind-invalid'));
      }
      const closeBasisRef = ltoReason(input.closeBasisRef);
      if (!closeBasisRef) return fail(`Write the basis of the close, in at least ${L.textMin} characters — the compliance evidence reference or the regulator’s written withdrawal.`, 'closeBasisRef', REFUSAL('close-basis-missing'));

      const closed = pastInstant(check, input.closedAt, 'closedAt');
      if (closed.error) return closed.error;
      if (instantMs(closed.at) < instantMs(action.effectiveFrom)) {
        return fail('The close cannot precede the instant the action took effect.', 'closedAt', REFUSAL('close-before-effective'));
      }

      const updated = {
        ...action,
        closedAt: closed.at,
        closeKind,
        closeBasisRef,
        closedById: check.actorId,
      };
      const stored = normalizeLtoActions(rows('ltoActions').map((row) => (row && row.id === actionId ? updated : row)), loadedAuthorisations(), [])
        .find((candidate) => candidate.id === actionId) || null;
      if (!stored) return fail('The close could not be stored as a row this register can read back. Nothing was saved.', 'closeKind', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.ltoActions = rows('ltoActions').map((row) => (row && row.id === actionId ? stored : row));
      }, {
        type: LTO_EVENTS.ACTION_CLOSED,
        entity: 'workspace',
        entityId: actionId,
        summary: `${definition.label} closed as ${LTO_CLOSE_KIND_BY_KEY[closeKind].label} on ${closed.at} (${LTO_ROUTE} register).`.slice(0, 300),
      });
      return saved({ id: actionId, action: stored });
    },

    /* ----------------------------------------------------------------- renewals */

    authorisationSubmitRenewal(input = {}) {
      const check = seatFor(LTO_RIGHTS.MANAGE);
      if (!check.ok) return check;

      const authorisationId = text(input.authorisationId, L.idMax) || null;
      if (!authorisationId) return fail('Name the authority this renewal is for.', 'authorisationId');
      const authority = loadedAuthorisations().find((row) => row.id === authorisationId) || null;
      if (!authority) return fail(LTO_REFUSALS.notFound, 'authorisationId', REFUSAL('authority-not-found'));

      const derived = deriveLtoState({
        authorisation: authority,
        conditions: [],
        evidence: [],
        actions: loadedActions().filter((row) => row.authorisationId === authorisationId),
        renewals: loadedRenewals().filter((row) => row.authorisationId === authorisationId),
        nowMs: check.at.getTime(),
      });
      const revocationRecorded = loadedActions().some((row) => row.authorisationId === authorisationId && row.kind === 'revocation'
        && (!row.closedAt || instantMs(row.closedAt) > check.at.getTime()));
      if (revocationRecorded) return fail('That authority is revoked. There is nothing to renew; a new instrument must be declared.', 'authorisationId', REFUSAL('revoked'));
      if (derived.renewalInFlight) {
        return fail('A renewal is already submitted and undecided on this authority. One renewal at a time; decide the open one before filing another.', 'authorisationId', REFUSAL('renewal-pending'));
      }

      const submitted = pastInstant(check, input.submittedAt, 'submittedAt');
      if (submitted.error) return submitted.error;
      if (instantMs(submitted.at) < instantMs(authority.grantedAt)) {
        return fail('A renewal cannot be submitted before the authority was granted.', 'submittedAt', REFUSAL('submitted-before-grant'));
      }
      const basisRef = ltoReason(input.basisRef);
      if (!basisRef) return fail(`Write what was submitted and where, in at least ${L.textMin} characters. A renewal with no basis is a diary note, not an act.`, 'basisRef', REFUSAL('basis-missing'));

      const id = idFactory('lto-ren');
      const row = {
        id,
        authorisationId,
        submittedAt: submitted.at,
        basisRef,
        submittedById: check.actorId,
        decision: null,
        decidedAt: null,
        grantedExpiresAt: null,
        decidedById: null,
        note: '',
        createdAt: check.at.toISOString(),
      };
      const stored = normalizeLtoRenewals([...rows('ltoRenewals'), row], loadedAuthorisations(), [])
        .find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The renewal could not be stored as a row this register can read back. Nothing was saved.', 'basisRef', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.ltoRenewals = Array.isArray(draft.ltoRenewals) ? draft.ltoRenewals : [];
        draft.ltoRenewals.push(stored);
      }, {
        type: LTO_EVENTS.RENEWAL_SUBMITTED,
        entity: 'workspace',
        entityId: authority.siteRef,
        summary: `Renewal submitted for the authority covering ${authority.activityRef} at ${authority.siteRef}, on ${submitted.at}. A submission does not extend the authority (${LTO_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, renewal: stored });
    },

    authorisationDecideRenewal(input = {}) {
      const check = seatFor(LTO_RIGHTS.MANAGE);
      if (!check.ok) return check;

      const renewalId = text(input.renewalId, L.idMax) || null;
      if (!renewalId) return fail('Name the renewal being decided.', 'renewalId');
      const renewal = loadedRenewals().find((row) => row.id === renewalId) || null;
      if (!renewal) return fail(LTO_REFUSALS.notFound, 'renewalId', REFUSAL('renewal-not-found'));
      if (renewal.decision) return fail(`That renewal was already decided as ${renewal.decision} on ${renewal.decidedAt}. A decision arrives once.`, 'renewalId', REFUSAL('already-decided'));

      const authority = loadedAuthorisations().find((row) => row.id === renewal.authorisationId) || null;
      if (!authority) return fail(LTO_REFUSALS.notFound, 'renewalId', REFUSAL('authority-not-found'));

      const decision = text(input.decision, 40) || null;
      if (!LTO_RENEWAL_DECISION_KEYS.includes(decision)) {
        return fail('Choose granted or refused. There is no third state, and “pending” is what an undecided renewal already is.', 'decision', REFUSAL('decision-invalid'));
      }
      const decided = pastInstant(check, input.decidedAt, 'decidedAt');
      if (decided.error) return decided.error;
      if (instantMs(decided.at) < instantMs(renewal.submittedAt)) {
        return fail('A decision cannot precede the submission it decides.', 'decidedAt', REFUSAL('decided-before-submitted'));
      }
      const note = ltoReason(input.note);
      if (!note) return fail(`Write the reason on the record, in at least ${L.textMin} characters. A decision with no reason cannot be reviewed or defended.`, 'note', REFUSAL('note-missing'));

      let grantedExpiresAt = null;
      if (decision === 'granted') {
        const granted = declaredInstant(check, input.grantedExpiresAt, 'grantedExpiresAt');
        if (granted.error) return granted.error;
        const current = deriveLtoState({
          authorisation: authority,
          conditions: [],
          evidence: [],
          actions: loadedActions().filter((row) => row.authorisationId === authority.id),
          renewals: loadedRenewals().filter((row) => row.authorisationId === authority.id),
          nowMs: check.at.getTime(),
        });
        if (instantMs(granted.at) <= current.expiresMs) {
          return fail(`A grant must extend the authority. The effective expiry at this instant is ${current.effectiveExpiresAt}; a “new” expiry on or before it would shorten validity, and this register refuses to record that as a renewal.`, 'grantedExpiresAt', REFUSAL('grant-shortens'));
        }
        if (instantMs(granted.at) <= instantMs(decided.at)) {
          return fail('The new expiry must be after the decision instant. An authority that expires before it was granted is not a grant.', 'grantedExpiresAt', REFUSAL('grant-before-decision'));
        }
        grantedExpiresAt = granted.at;
      } else if (input.grantedExpiresAt) {
        return fail('A refused renewal takes no expiry. Recording one would put a validity on the record that nobody granted.', 'grantedExpiresAt', REFUSAL('refusal-with-expiry'));
      }

      const updated = {
        ...renewal,
        decision,
        decidedAt: decided.at,
        grantedExpiresAt,
        decidedById: check.actorId,
        note,
      };
      const stored = normalizeLtoRenewals(rows('ltoRenewals').map((row) => (row && row.id === renewalId ? updated : row)), loadedAuthorisations(), [])
        .find((candidate) => candidate.id === renewalId) || null;
      if (!stored) return fail('The decision could not be stored as a row this register can read back. Nothing was saved.', 'decision', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.ltoRenewals = rows('ltoRenewals').map((row) => (row && row.id === renewalId ? stored : row));
      }, {
        type: LTO_EVENTS.RENEWAL_DECIDED,
        entity: 'workspace',
        entityId: authority.siteRef,
        summary: `Renewal ${decision} for the authority covering ${authority.activityRef} at ${authority.siteRef}${grantedExpiresAt ? `, new expiry ${grantedExpiresAt}` : ', no new expiry'} (${LTO_ROUTE}).`.slice(0, 300),
      });
      return saved({ id: renewalId, renewal: stored });
    },

    /* -------------------------------------------------------------- conventions */

    authorisationSetConventions(patch = {}) {
      const check = seatFor(LTO_RIGHTS.MANAGE);
      if (!check.ok) return check;
      const current = normalizeLtoSettings(settings());
      const known = new Set(Object.values(LTO_SETTING_KEYS));
      for (const key of Object.keys(patch || {})) {
        if (!known.has(key)) return fail(`Unknown convention “${String(key).slice(0, 60)}”. Nothing was saved.`, key, REFUSAL('unknown-setting'));
      }
      const next = { ...current };
      for (const [key, value] of Object.entries(patch || {})) {
        if (key === LTO_SETTING_KEYS.autoPropagate) { next[key] = value !== false; continue; }
        const n = Number(value);
        if (!Number.isInteger(n)) return fail(`“${key}” is a whole number. Nothing was saved.`, key, REFUSAL('setting-invalid'));
        const bound = key === LTO_SETTING_KEYS.privacyFloor ? LTO_BOUNDS.privacyFloor : LTO_BOUNDS.horizonDays;
        if (n < bound.min || n > bound.max) {
          return fail(`“${key}” must be between ${bound.min} and ${bound.max}. It is refused rather than clamped, so the figure on the screen is always the figure somebody declared.`, key, REFUSAL('setting-out-of-bounds'));
        }
        next[key] = n;
      }
      store.update((draft) => {
        draft.settings = { ...(draft.settings || {}), ...next };
      }, {
        type: LTO_EVENTS.CONVENTIONS_SET,
        entity: 'workspace',
        entityId: LTO_ROUTE,
        summary: `Statutory-authorisation conventions re-declared: the planning horizon, the privacy floor and whether the rule may file asks (${LTO_ROUTE}).`.slice(0, 300),
      });
      return saved({ conventions: normalizeLtoSettings(store.state.settings || {}) });
    },

    /* -------------------------------------------------------------------- reads */

    authorisationReport() {
      const check = readCheck();
      if (!check.ok) return check;
      return { ok: true, report: buildAuthorisations(store.state, { now: check.at, settings: check.cfg, seat: check.seat }) };
    },

    authorisationAttention() {
      const check = readCheck();
      if (!check.ok) return check;
      return { ok: true, count: authorisationAttentionCount(store.state, { now: check.at, settings: check.cfg, seat: check.seat }) };
    },

    /** The candidates a dialog may name, narrowed to what this seat may actually write. */
    authorisationCandidates() {
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
    authorisationScan() {
      const check = seatFor(LTO_RIGHTS.MANAGE);
      if (!check.ok) return check;
      store.update((draft) => {
        draft.ltoMarkers = Array.isArray(draft.ltoMarkers) ? draft.ltoMarkers : [];
      }, {
        type: LTO_EVENTS.SCANNED,
        entity: 'workspace',
        entityId: LTO_ROUTE,
        summary: `Statutory-authorisation register scanned; the rule re-reads every authority against its expiry, renewal window, conditions and standing regulator actions (${LTO_ROUTE}).`.slice(0, 300),
      });
      return saved({});
    },
  };
}

/** The read context, exported so the view can print exactly what the register claims. */
export const AUTHORISATION_CONTEXT = 'Read the statutory authorisation register (#/authorisations). It records which powers to operate are held, on what written instrument, whether each is in force, what evidence exists for each condition, and which regulator actions stand. It scores nobody.';

/** The matrix this module reads must be the engine’s own (ADR-0140), not a second one. */
export function authorisationMatrixFor(state, now) {
  return buildMatrix(state, { now, settings: { ...(state?.settings || {}), activeSeatId: null } });
}
