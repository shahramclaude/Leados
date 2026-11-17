/**
 * app/core/domain/lfgActions.js — the seat-checked commands of the Claim, Limitation
 * & Settlement-Authority Register (ADR-0248).
 *
 * EIGHT human acts and a scan: OPEN a matter, DECLARE its accrual, RECORD a stay,
 * RECORD a resolution, DECLARE a concession, DECLARE an authority grant, re-declare
 * the conventions — plus the explicit scan. Every state, deadline, day count, ceiling
 * and total is re-derived on read by `lfgClaims.js`; nothing derived is stored.
 *
 * THE DOOR IS THE PRODUCT, AND EVERY REFUSAL IS A CONTROL.
 *  - A MATTER carries the written reference on the document that started the clock, a
 *    party, a claim type, a forum, a currency and one to four responsible hands. A
 *    claim nobody can trace to a document is refused, because that is exactly the
 *    letter that sits in an inbox until the clock runs out.
 *  - THE SAME MATTER REFERENCE CANNOT BE OPENED TWICE while the first is unresolved.
 *    Two live records of one claim is how a limitation date gets computed against the
 *    wrong accrual.
 *  - AN ACCRUAL is ONE per matter, carries the day, the written rule it relied on and
 *    a declared period in whole months. A knowledge-based claim type must carry the
 *    knowledge day as well. There is no default period, no jurisdiction table and no
 *    inference from the incident date — every one of those would put a deadline on the
 *    record nobody was given.
 *  - A STAY is recorded with its kind, its span and its instrument. Proof is COMPUTED
 *    by the loader from the evidence its own kind requires; the door never accepts a
 *    `proved` flag from the caller. An unproved stay is stored as an allegation and
 *    moves no deadline.
 *  - A RESOLUTION arrives once per matter, after the matter was opened, with a written
 *    basis and — for a settlement or a judgment — an exact integer amount in a
 *    three-letter currency. A withdrawal cannot carry an amount; a settlement cannot
 *    omit one.
 *  - A CONCESSION carries its kind, its day and its written basis; a kind that moves
 *    money must carry an exact integer minor-unit amount. A fractional amount is
 *    refused rather than rounded into a total.
 *  - AN AUTHORITY GRANT names the person, the scope, the currency and the ceiling in
 *    minor units, with a written basis. It records authority GIVEN; the reader computes
 *    the ceiling and compares a settlement against it.
 *  - Every write is run through the loader and the stored row is the row the loader
 *    returns. A write the loader would refuse on reload is refused now.
 *
 * WHAT NO COMMAND CAN DO. There is no command that sets a state, writes a deadline,
 * writes a days-remaining figure, marks a stay proved without its evidence, treats an
 * allegation as a suspension, approves a settlement beyond authority (it is recorded
 * and flagged, never rejected after the money moved), extends a limitation period after
 * the fact, or scores a person, a line or a fee earner.
 */

import { dayKey } from '../time.js';
import { buildSeats, activeSeat, canAct } from './seat.js';
import { matrixLineScopeFor } from './matrix.js';
import { buildClaims, claimAttentionCount } from './lfgClaims.js';
import {
  LFG_BOUNDS,
  LFG_CLAIM_TYPE_BY_KEY,
  LFG_CLAIM_TYPE_KEYS,
  LFG_CONCESSION_KIND_BY_KEY,
  LFG_CONCESSION_KIND_KEYS,
  LFG_EVENTS,
  LFG_LIMITS as L,
  LFG_REFUSALS,
  LFG_RESOLUTION_KIND_BY_KEY,
  LFG_RESOLUTION_KIND_KEYS,
  LFG_RIGHTS,
  LFG_ROUTE,
  LFG_SETTING_KEYS,
  LFG_STAY_KIND_BY_KEY,
  LFG_STAY_KIND_KEYS,
} from './lfgRegistry.js';
import {
  lfgCurrency,
  lfgDayKey,
  lfgHolders,
  lfgInstant,
  lfgInstrument,
  lfgPeriodMonths,
  lfgReason,
  lfgShort,
  normalizeLfgAccruals,
  normalizeLfgAuthorityGrants,
  normalizeLfgConcessions,
  normalizeLfgMatters,
  normalizeLfgResolutions,
  normalizeLfgSettings,
  normalizeLfgStays,
} from './lfgSchema.js';
import { instantMs, minorUnits, staySpanDays } from './lfgMath.js';

const REFUSAL = (key) => `claim:${key}`;
const text = (value, max = L.textMax) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export function createClaimActions(store, { now, idFactory }) {
  const fail = (error, field = null, refusal = null) => ({ ok: false, error, ...(field ? { field } : {}), ...(refusal ? { refusal } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  const rows = (key) => (Array.isArray(store.state[key]) ? store.state[key] : []);

  /**
   * A write result. The caller's own warning is MERGED with the persist error, never
   * overwritten by it — a settlement recorded beyond authority, or a matter stored
   * with an unreadable child, must not lose its message on a clean persist.
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
    if (seat.readOnly) return fail(LFG_REFUSALS.notSeated);
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, seat, at, cfg, actorId: seat.fullAccess ? 'leader' : (seat.nodeId || seat.id || null), today: dayKey(at) };
  }

  /**
   * A read is REGISTERED as safe and therefore bypasses the gateway's rank check — so
   * the right is re-proved HERE, exactly as every register in this workspace re-proves
   * it. Without this, which party is suing us and what we have reserved would be
   * readable by a seat the record class denies.
   */
  function readCheck() {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    const seat = activeSeat(built);
    if (seat.readOnly) return fail(LFG_REFUSALS.notSeated);
    const verdict = canAct(LFG_RIGHTS.READ, seat);
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

  /** One to four responsible hands, each on the roster, active, and held by this seat. */
  function holdersContext(check, value) {
    const ids = lfgHolders(Array.isArray(value) ? value : text(value, 2000).split(/[,;]/).map((part) => part.trim()).filter(Boolean));
    if (!ids) {
      return fail(`Name between one and ${L.holdersMax} responsible person(s), each on this workspace once. A claim with no responsible hand has nobody to answer for its clock.`, 'responsibleIds', REFUSAL('holders-invalid'));
    }
    for (const holderId of ids) {
      const person = rows('people').find((row) => row && row.id === holderId) || null;
      if (!person) return fail(`“${holderId}” is not a person on this record. Nothing was saved.`, 'responsibleIds', REFUSAL('holder-not-found'));
      if (person.status === 'archived') return fail(`${person.name || holderId} is archived and cannot be made responsible for a live claim.`, 'responsibleIds', REFUSAL('holder-archived'));
      if (!holdsPerson(check, holderId)) {
        return fail(`${person.name || holderId} is not on a line this seat holds. ${LFG_REFUSALS.noReach}`, 'responsibleIds', REFUSAL('holder-not-your-person'));
      }
    }
    return { ok: true, ids };
  }

  function loadedMatters() { return normalizeLfgMatters(rows('lfgMatters'), []); }
  function loadedAccruals() { return normalizeLfgAccruals(rows('lfgAccruals'), loadedMatters(), []); }
  function loadedStays() { return normalizeLfgStays(rows('lfgStays'), loadedMatters(), []); }
  function loadedResolutions() { return normalizeLfgResolutions(rows('lfgResolutions'), loadedMatters(), []); }
  function loadedConcessions() { return normalizeLfgConcessions(rows('lfgConcessions'), loadedMatters(), []); }
  function loadedGrants() { return normalizeLfgAuthorityGrants(rows('lfgAuthorityGrants'), []); }

  function writeDraft(mutate, event) {
    store.update((draft) => { mutate(draft); }, event);
    return true;
  }

  /** A day an ACT that has already happened names, and therefore cannot be future. */
  function pastDay(check, value, field) {
    const day = lfgDayKey(value);
    if (!day) return { error: fail('Give a real calendar day (YYYY-MM-DD).', field, REFUSAL('day-invalid')) };
    const dayMs = instantMs(`${day}T00:00:00.000Z`);
    if (dayMs > instantMs(`${check.today}T00:00:00.000Z`)) {
      return { error: fail('That day is in the future. This register records what has happened, not what will.', field, REFUSAL('day-future')) };
    }
    if ((instantMs(`${check.today}T00:00:00.000Z`) - dayMs) / 86_400_000 > L.backfillMaxDays) {
      return { error: fail(`That day is more than ${L.backfillMaxDays} day(s) ago. A backfilled record is not a control that ran when it did not.`, field, REFUSAL('day-too-old')) };
    }
    return { day };
  }

  /** A day that may legitimately be ahead (the day a suspension ends). */
  function forwardDay(check, value, field, { required = true } = {}) {
    if (value === undefined || value === null || value === '') {
      return required ? { error: fail('Give a real calendar day (YYYY-MM-DD).', field, REFUSAL('day-invalid')) } : { day: null };
    }
    const day = lfgDayKey(value);
    if (!day) return { error: fail('Give a real calendar day (YYYY-MM-DD).', field, REFUSAL('day-invalid')) };
    const delta = (instantMs(`${day}T00:00:00.000Z`) - instantMs(`${check.today}T00:00:00.000Z`)) / 86_400_000;
    if (delta > L.aheadMaxDays) return { error: fail(`That day is more than ${L.aheadMaxDays} day(s) ahead. A declaration that far out is a plan, not a record.`, field, REFUSAL('day-too-far')) };
    if (delta < -L.backfillMaxDays) return { error: fail(`That day is more than ${L.backfillMaxDays} day(s) ago.`, field, REFUSAL('day-too-old')) };
    return { day };
  }

  return {
    /* ------------------------------------------------------------------ matters */

    /**
     * OPEN a matter: the document that started the clock, the party, the claim type,
     * the forum, the currency, the amount claimed and the hands responsible for it.
     */
    claimOpenMatter(input = {}) {
      const check = seatFor(LFG_RIGHTS.MANAGE);
      if (!check.ok) return check;

      const matterRef = lfgInstrument(input.matterRef);
      if (!matterRef) {
        return fail(`Cite the document that started the clock, in at least ${L.instrumentMin} characters — a letter reference, a claim form number, a demand reference. A claim nobody can trace to a document is the letter that sits in an inbox until the clock runs out.`, 'matterRef', REFUSAL('matter-ref-missing'));
      }
      const partyRef = lfgShort(input.partyRef);
      if (!partyRef) return fail(`Name the party asserting the claim, in at least ${L.shortMin} characters.`, 'partyRef', REFUSAL('party-missing'));
      const claimType = text(input.claimType, 60) || null;
      // AN UNSUPPORTED TYPE IS ALLOWED HERE ON PURPOSE. The claim is real whether or not
      // this register carries its accrual rule; what it may not do is pretend to know
      // the period. The door accepts `other` and the accrual step then demands a written
      // rule, which the reader prints as an unsupported type.
      if (!claimType || !LFG_CLAIM_TYPE_KEYS.includes(claimType)) {
        return fail('Choose the claim type. It determines the accrual rule this matter must state, so “other” is a legitimate answer — it just obliges the matter to write its own rule.', 'claimType', REFUSAL('claim-type-invalid'));
      }
      const forumRef = lfgShort(input.forumRef);
      if (!forumRef) return fail(`Name the forum or arena this claim would be heard in, in at least ${L.shortMin} characters — a court, a tribunal, an arbitrator, a regulator.`, 'forumRef', REFUSAL('forum-missing'));
      const currency = lfgCurrency(input.currency);
      if (!currency) return fail('Give the three-letter currency the claim is in. Amounts in this register are exact minor units in one named currency.', 'currency', REFUSAL('currency-invalid'));

      const claimedMinor = input.claimedMinor === undefined || input.claimedMinor === null || input.claimedMinor === ''
        ? null
        : minorUnits(Number(input.claimedMinor));
      if (input.claimedMinor !== undefined && input.claimedMinor !== null && input.claimedMinor !== '' && claimedMinor === null) {
        return fail('The sum claimed must be a whole number of minor units (pence or cents). A fractional minor unit is refused rather than rounded into a total.', 'claimedMinor', REFUSAL('amount-invalid'));
      }

      const holders = holdersContext(check, input.responsibleIds);
      if (!holders.ok) return holders;

      // THE SAME CLAIM, TWICE. Only refused while the earlier record is still live; a
      // resolved matter may legitimately be reopened on a fresh document reference.
      const existing = buildClaims(store.state, { now: check.at, settings: check.cfg, seat: null });
      const duplicate = existing.rows.find((row) => row.matter.matterRef.toLowerCase() === matterRef.toLowerCase()
        && row.matter.partyRef.toLowerCase() === partyRef.toLowerCase()
        && !['resolved', 'settled-beyond-authority', 'merged'].includes(row.state.key));
      if (duplicate) {
        return fail(`That document and party are already on the record as “${duplicate.state.label}”. Two live records of one claim is how a limitation date gets computed against the wrong accrual. If this is a new document, cite its reference.`, 'matterRef', REFUSAL('duplicate-matter'));
      }

      if (loadedMatters().length >= L.matters) return fail('The matter ledger is full. Export the workspace before proceeding.', null, REFUSAL('ledger-full'));

      const id = idFactory('lfg-mat');
      const row = {
        id,
        matterRef,
        partyRef,
        claimType,
        forumRef,
        currency,
        claimedMinor,
        responsibleIds: holders.ids,
        openedById: check.actorId,
        openedAt: check.at.toISOString(),
        mergedIntoId: null,
        createdAt: check.at.toISOString(),
        updatedAt: check.at.toISOString(),
      };
      const stored = normalizeLfgMatters([...rows('lfgMatters'), row], []).find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The matter could not be stored as a row this register can read back. Nothing was saved.', 'matterRef', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.lfgMatters = Array.isArray(draft.lfgMatters) ? draft.lfgMatters : [];
        draft.lfgMatters.push(stored);
      }, {
        type: LFG_EVENTS.MATTER_OPENED,
        entity: 'workspace',
        entityId: matterRef,
        summary: `Claim matter opened on ${matterRef} from ${partyRef} (${LFG_CLAIM_TYPE_BY_KEY[claimType].label}) in ${forumRef}, ${currency}${claimedMinor === null ? ' with no sum claimed stated' : ` ${claimedMinor} minor units claimed`} (${LFG_ROUTE}). No deadline is derived until an accrual is declared.`.slice(0, 300),
      });
      return saved({ id, matter: stored });
    },

    /* ------------------------------------------------------------------ accruals */

    /**
     * DECLARE the accrual — the fact that starts the clock — and the limitation period
     * this cause of action carries. ONE per matter.
     */
    claimDeclareAccrual(input = {}) {
      const check = seatFor(LFG_RIGHTS.MANAGE);
      if (!check.ok) return check;

      const matterId = text(input.matterId, L.idMax) || null;
      if (!matterId) return fail('Name the matter this accrual belongs to.', 'matterId');
      const matter = loadedMatters().find((row) => row.id === matterId) || null;
      if (!matter) return fail(LFG_REFUSALS.notFound, 'matterId', REFUSAL('matter-not-found'));

      if (loadedAccruals().some((row) => row.matterId === matterId)) {
        return fail('That matter already carries an accrual. A second accrual day for one cause of action would make the deadline ambiguous; correct the existing one instead of adding a rival.', 'matterId', REFUSAL('accrual-duplicate'));
      }

      const accrual = pastDay(check, input.accrualDay, 'accrualDay');
      if (accrual.error) return accrual.error;
      const accrualRule = lfgReason(input.accrualRule);
      if (!accrualRule) {
        return fail(`Write the rule that starts the clock for this cause of action, in at least ${L.textMin} characters. The day alone is a date somebody typed; the rule is what makes it a derived deadline.`, 'accrualRule', REFUSAL('rule-missing'));
      }

      const typeDefinition = LFG_CLAIM_TYPE_BY_KEY[matter.claimType] || null;
      if (!typeDefinition) {
        return fail('This matter’s claim type is not one this register carries, so it must state its own accrual rule — which it has — and the register will print it as an unsupported type rather than pretending to know the period. The rule above is enough; continue.', 'accrualRule', REFUSAL('unsupported-type'));
      }

      // A KNOWLEDGE-BASED TYPE MUST CARRY THE KNOWLEDGE DAY. Negligence, personal injury
      // and latent property damage accrue on the date of knowledge in the general case,
      // and a register that silently used the injury date would place the deadline years
      // early — or, worse, a deadline computed off a knowledge date that was never
      // recorded would be a green tick over a guess.
      let knowledgeDay = null;
      if (typeDefinition.knowledgeBased) {
        const knowledge = forwardDay(check, input.knowledgeDay, 'knowledgeDay');
        if (knowledge.error) {
          return fail(`This claim type accrues on the date of knowledge, so name the day the organisation first knew (or ought reasonably to have known) the facts that make the claim arguable. ${knowledge.error.error}`, 'knowledgeDay', REFUSAL('knowledge-missing'));
        }
        knowledgeDay = knowledge.day;
        if (instantMs(`${knowledgeDay}T00:00:00.000Z`) < instantMs(`${accrual.day}T00:00:00.000Z`)) {
          return fail('The date of knowledge cannot precede the date of the damage. One of these two days is wrong, and the register will not choose between them.', 'knowledgeDay', REFUSAL('knowledge-before-accrual'));
        }
      }

      const periodMonths = lfgPeriodMonths(Number(input.periodMonths));
      if (periodMonths === null) {
        return fail(`The limitation period is a whole number of months between 1 and ${L.periodMonthsMax}. There is no default period in this register: a period belongs to the cause of action and the jurisdiction, and you declare it.`, 'periodMonths', REFUSAL('period-invalid'));
      }

      const id = idFactory('lfg-acc');
      const row = {
        id,
        matterId,
        accrualDay: accrual.day,
        accrualRule,
        knowledgeDay,
        periodMonths,
        declaredById: check.actorId,
        createdAt: check.at.toISOString(),
      };
      const stored = normalizeLfgAccruals([...rows('lfgAccruals'), row], loadedMatters(), []).find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The accrual could not be stored as a row this register can read back. Nothing was saved.', 'accrualRule', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.lfgAccruals = Array.isArray(draft.lfgAccruals) ? draft.lfgAccruals : [];
        draft.lfgAccruals.push(stored);
      }, {
        type: LFG_EVENTS.ACCRUAL_DECLARED,
        entity: 'workspace',
        entityId: matter.matterRef,
        summary: `Accrual declared on ${matter.matterRef}: clock starts ${accrual.day}, period ${periodMonths} month(s)${knowledgeDay ? `, date of knowledge ${knowledgeDay}` : ''}. The deadline is now derived on read and moves only with a PROVED suspension (${LFG_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, accrual: stored });
    },

    /* --------------------------------------------------------------------- stays */

    /**
     * RECORD a suspension of the clock. `proved` is never accepted from the caller: the
     * loader computes it from the evidence the kind requires.
     */
    claimRecordStay(input = {}) {
      const check = seatFor(LFG_RIGHTS.MANAGE);
      if (!check.ok) return check;

      const matterId = text(input.matterId, L.idMax) || null;
      if (!matterId) return fail('Name the matter whose clock was suspended.', 'matterId');
      const matter = loadedMatters().find((row) => row.id === matterId) || null;
      if (!matter) return fail(LFG_REFUSALS.notFound, 'matterId', REFUSAL('matter-not-found'));

      const kind = text(input.kind, 60) || null;
      if (!kind || !LFG_STAY_KIND_KEYS.includes(kind)) {
        return fail('Choose the kind of suspension. “The clock stopped” is not a kind; a standstill, a conciliation certificate, a court order and a statutory suspension are.', 'kind', REFUSAL('kind-invalid'));
      }
      if (input.proved !== undefined) {
        return fail('Proof is computed from the evidence, never declared. Record the instrument and the parties; the loader decides whether the stay moves the deadline.', 'proved', REFUSAL('proved-declared'));
      }

      const instrumentRef = lfgInstrument(input.instrumentRef);
      if (!instrumentRef) {
        return fail(`Cite the instrument, in at least ${L.instrumentMin} characters — the agreement, the certificate reference and issue day, or the order. An unproved suspension is kept, but it moves no deadline and the row will say why.`, 'instrumentRef', REFUSAL('instrument-missing'));
      }
      const from = pastDay(check, input.fromDay, 'fromDay');
      if (from.error) return from.error;
      const to = forwardDay(check, input.toDay, 'toDay');
      if (to.error) return to.error;

      const spanDays = staySpanDays(`${from.day}T00:00:00.000Z`, `${to.day}T00:00:00.000Z`);
      if (spanDays === null) return fail('The suspension cannot end before it starts.', 'toDay', REFUSAL('span-reversed'));
      if (spanDays > L.stayMaxDays) return fail(`One suspension may cover at most ${L.stayMaxDays} days. A longer declared span is not a single stay.`, 'toDay', REFUSAL('span-too-long'));

      const parties = Array.isArray(input.parties)
        ? input.parties.map((part) => lfgShort(part)).filter(Boolean)
        : text(input.parties, 400).split(/[,;]/).map((part) => part.trim()).filter(Boolean).map((part) => lfgShort(part)).filter(Boolean);

      if (loadedStays().length >= L.stays) return fail('The stay ledger is full. Export the workspace before proceeding.', null, REFUSAL('ledger-full'));

      const id = idFactory('lfg-sty');
      const row = {
        id,
        matterId,
        kind,
        instrumentRef,
        parties,
        fromDay: from.day,
        toDay: to.day,
        recordedById: check.actorId,
        note: text(input.note, L.textMax),
        createdAt: check.at.toISOString(),
      };
      const stored = normalizeLfgStays([...rows('lfgStays'), row], loadedMatters(), []).find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The stay could not be stored as a row this register can read back. Nothing was saved.', 'instrumentRef', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.lfgStays = Array.isArray(draft.lfgStays) ? draft.lfgStays : [];
        draft.lfgStays.push(stored);
      }, {
        type: LFG_EVENTS.STAY_RECORDED,
        entity: 'workspace',
        entityId: matter.matterRef,
        summary: `Suspension recorded on ${matter.matterRef}: ${LFG_STAY_KIND_BY_KEY[kind].label}, ${from.day} to ${to.day} (${spanDays} day(s)), ${stored.proved ? 'PROVED and counted in the deadline' : `NOT PROVED — ${stored.missing.join('; ')} — and it moves no deadline`} (${LFG_ROUTE}).`.slice(0, 300),
      });
      return saved({
        id,
        stay: stored,
        warning: stored.proved ? null : `The suspension was kept but is ALLEGED, not proved: ${stored.missing.join('; ')}. It moves no deadline on the register.`,
      });
    },

    /* --------------------------------------------------------------- resolutions */

    /** RECORD how the matter ended. One per matter, with a day, a basis and — where the kind requires it — an exact amount. */
    claimRecordResolution(input = {}) {
      const check = seatFor(LFG_RIGHTS.MANAGE);
      if (!check.ok) return check;

      const matterId = text(input.matterId, L.idMax) || null;
      if (!matterId) return fail('Name the matter being resolved.', 'matterId');
      const matter = loadedMatters().find((row) => row.id === matterId) || null;
      if (!matter) return fail(LFG_REFUSALS.notFound, 'matterId', REFUSAL('matter-not-found'));

      if (loadedResolutions().some((row) => row.matterId === matterId)) {
        return fail('That matter already carries a resolution. A matter closes once; a correction is a correction, not a second close.', 'matterId', REFUSAL('resolution-duplicate'));
      }

      const kind = text(input.kind, 60) || null;
      const definition = kind ? LFG_RESOLUTION_KIND_BY_KEY[kind] : null;
      if (!definition) return fail('Choose how the matter ended. “Closed” is not an outcome; a settlement, a withdrawal, a dismissal, a judgment, a merger are.', 'kind', REFUSAL('kind-invalid'));

      const resolved = pastDay(check, input.resolvedDay, 'resolvedDay');
      if (resolved.error) return resolved.error;
      const basisRef = lfgReason(input.basisRef);
      if (!basisRef) return fail(`Write the basis on the record, in at least ${L.textMin} characters — the agreement, the order, the discontinuance. A resolution with no basis cannot be reviewed or defended.`, 'basisRef', REFUSAL('basis-missing'));

      let amountMinor = null;
      let currency = null;
      if (definition.requiresAmount) {
        amountMinor = minorUnits(Number(input.amountMinor));
        if (amountMinor === null) {
          return fail(`A ${definition.label.toLowerCase()} carries an exact amount in whole minor units. “It settled” with no number is not a record of a settlement.`, 'amountMinor', REFUSAL('amount-missing'));
        }
        currency = lfgCurrency(input.currency);
        if (!currency) return fail('Give the three-letter currency the amount is in.', 'currency', REFUSAL('currency-invalid'));
      } else if (input.amountMinor !== undefined && input.amountMinor !== null && input.amountMinor !== '') {
        return fail(`A ${definition.label.toLowerCase()} takes no amount. Recording one would print money against an outcome that paid none.`, 'amountMinor', REFUSAL('amount-not-permitted'));
      }

      let mergedIntoId = null;
      if (definition.key === 'merged') {
        const target = text(input.mergedIntoId, L.idMax) || null;
        if (!target) return fail('Name the matter this one merged into. A merger that names nobody leaves the clock belonging to no matter at all.', 'mergedIntoId', REFUSAL('merge-target-missing'));
        if (target === matterId) return fail('A matter cannot merge into itself.', 'mergedIntoId', REFUSAL('merge-self'));
        if (!loadedMatters().some((row) => row.id === target)) return fail('That target matter is not on this record.', 'mergedIntoId', REFUSAL('merge-target-missing'));
        mergedIntoId = target;
      }

      if (loadedResolutions().length >= L.resolutions) return fail('The resolution ledger is full. Export the workspace before proceeding.', null, REFUSAL('ledger-full'));

      const id = idFactory('lfg-res');
      const row = {
        id,
        matterId,
        kind,
        resolvedDay: resolved.day,
        amountMinor,
        currency,
        basisRef,
        mergedIntoId,
        recordedById: check.actorId,
        createdAt: check.at.toISOString(),
      };
      const stored = normalizeLfgResolutions([...rows('lfgResolutions'), row], loadedMatters(), []).find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The resolution could not be stored as a row this register can read back. Nothing was saved.', 'basisRef', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.lfgResolutions = Array.isArray(draft.lfgResolutions) ? draft.lfgResolutions : [];
        draft.lfgResolutions.push(stored);
      }, {
        type: LFG_EVENTS.RESOLUTION_RECORDED,
        entity: 'workspace',
        entityId: matter.matterRef,
        summary: `Matter ${matter.matterRef} recorded as ${definition.label} on ${resolved.day}${amountMinor === null ? ' with no amount' : ` for ${currency} ${amountMinor} minor units`}. The authority gap, where any, is derived on read against the graph (${LFG_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, resolution: stored });
    },

    /* --------------------------------------------------------------- concessions */

    /** DECLARE a concession: a reserve, an offer, a payment, costs or interest — dated, based and exact. */
    claimRecordConcession(input = {}) {
      const check = seatFor(LFG_RIGHTS.MANAGE);
      if (!check.ok) return check;

      const matterId = text(input.matterId, L.idMax) || null;
      if (!matterId) return fail('Name the matter this concession belongs to.', 'matterId');
      const matter = loadedMatters().find((row) => row.id === matterId) || null;
      if (!matter) return fail(LFG_REFUSALS.notFound, 'matterId', REFUSAL('matter-not-found'));

      const kind = text(input.kind, 60) || null;
      const definition = kind ? LFG_CONCESSION_KIND_BY_KEY[kind] : null;
      if (!definition || !LFG_CONCESSION_KIND_KEYS.includes(kind)) {
        return fail('Choose the kind of concession. A reserve, an offer received, an offer made, a payment on account, costs and interest are different facts and are printed apart.', 'kind', REFUSAL('kind-invalid'));
      }

      const at = pastDay(check, input.atDay, 'atDay');
      if (at.error) return at.error;
      const basisRef = lfgReason(input.basisRef);
      if (!basisRef) return fail(`Write the basis on the record, in at least ${L.textMin} characters. Money moved on the record and nobody said why is worse than no row at all.`, 'basisRef', REFUSAL('basis-missing'));

      let amountMinor = null;
      let currency = null;
      if (definition.movesMoney) {
        amountMinor = minorUnits(Number(input.amountMinor));
        if (amountMinor === null) return fail(`A ${definition.label.toLowerCase()} carries an exact amount in whole minor units.`, 'amountMinor', REFUSAL('amount-missing'));
        currency = lfgCurrency(input.currency || matter.currency);
        if (!currency) return fail('Give the three-letter currency the amount is in.', 'currency', REFUSAL('currency-invalid'));
      } else {
        amountMinor = minorUnits(Number(input.amountMinor));
        if (input.amountMinor !== undefined && input.amountMinor !== null && input.amountMinor !== '' && amountMinor === null) {
          return fail('A reserve or an offer carries an exact amount in whole minor units. A fractional minor unit is refused rather than rounded into a total.', 'amountMinor', REFUSAL('amount-invalid'));
        }
        if (amountMinor !== null) currency = lfgCurrency(input.currency || matter.currency) || null;
      }

      if (loadedConcessions().length >= L.concessions) return fail('The concession ledger is full. Export the workspace before proceeding.', null, REFUSAL('ledger-full'));

      const id = idFactory('lfg-cnc');
      const row = {
        id,
        matterId,
        kind,
        atDay: at.day,
        amountMinor,
        currency,
        basisRef,
        recordedById: check.actorId,
        createdAt: check.at.toISOString(),
      };
      const stored = normalizeLfgConcessions([...rows('lfgConcessions'), row], loadedMatters(), []).find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The concession could not be stored as a row this register can read back. Nothing was saved.', 'basisRef', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.lfgConcessions = Array.isArray(draft.lfgConcessions) ? draft.lfgConcessions : [];
        draft.lfgConcessions.push(stored);
      }, {
        type: LFG_EVENTS.CONCESSION_RECORDED,
        entity: 'workspace',
        entityId: matter.matterRef,
        summary: `Concession recorded on ${matter.matterRef}: ${definition.label} on ${at.day}${amountMinor === null ? '' : `, ${currency} ${amountMinor} minor units`}. Each concession is its own dated instrument; the totals are derived on read (${LFG_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, concession: stored });
    },

    /* ---------------------------------------------------------- authority grants */

    /** DECLARE the settlement authority a person actually holds. The reader compares against it; it never derives from it. */
    claimDeclareAuthority(input = {}) {
      const check = seatFor(LFG_RIGHTS.MANAGE);
      if (!check.ok) return check;

      const personId = text(input.personId, L.idMax) || null;
      if (!personId) return fail('Name the person this authority is given to.', 'personId');
      const person = rows('people').find((row) => row && row.id === personId) || null;
      if (!person) return fail('That person is not on this record. Nothing was saved.', 'personId', REFUSAL('person-not-found'));
      if (person.status === 'archived') return fail(`${person.name || personId} is archived and cannot hold a live settlement authority.`, 'personId', REFUSAL('person-archived'));
      if (!holdsPerson(check, personId)) return fail(LFG_REFUSALS.noReach, 'personId', REFUSAL('not-your-person'));

      const scopeRef = lfgShort(input.scopeRef);
      if (!scopeRef) return fail(`Name the scope this authority covers, in at least ${L.shortMin} characters — a category of claim, a portfolio, a business unit. Authority with no scope is authority over everything.`, 'scopeRef', REFUSAL('scope-missing'));

      const currency = lfgCurrency(input.currency);
      if (!currency) return fail('Give the three-letter currency the ceiling is in.', 'currency', REFUSAL('currency-invalid'));
      const ceilingMinor = minorUnits(Number(input.ceilingMinor));
      if (ceilingMinor === null) {
        return fail('The ceiling is a whole number of minor units (pence or cents). A fractional ceiling is refused rather than rounded — a ceiling of 0 is a legitimate declaration that this person may settle nothing.', 'ceilingMinor', REFUSAL('ceiling-invalid'));
      }
      const basisRef = lfgReason(input.basisRef);
      if (!basisRef) return fail(`Write the basis on the record, in at least ${L.textMin} characters — the delegation, the board resolution, the standing instruction.`, 'basisRef', REFUSAL('basis-missing'));

      if (loadedGrants().length >= L.authorityGrants) return fail('The authority-grant ledger is full. Export the workspace before proceeding.', null, REFUSAL('ledger-full'));

      const id = idFactory('lfg-aut');
      const row = {
        id,
        personId,
        scopeRef,
        currency,
        ceilingMinor,
        basisRef,
        declaredById: check.actorId,
        declaredAt: check.at.toISOString(),
        createdAt: check.at.toISOString(),
      };
      const stored = normalizeLfgAuthorityGrants([...rows('lfgAuthorityGrants'), row], []).find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The authority could not be stored as a row this register can read back. Nothing was saved.', 'basisRef', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.lfgAuthorityGrants = Array.isArray(draft.lfgAuthorityGrants) ? draft.lfgAuthorityGrants : [];
        draft.lfgAuthorityGrants.push(stored);
      }, {
        type: LFG_EVENTS.AUTHORITY_DECLARED,
        entity: 'workspace',
        entityId: scopeRef,
        summary: `Settlement authority declared for ${person.name || personId} over ${scopeRef}: ${currency} ${ceilingMinor} minor units. The register computes the ceiling above a matter's lines from these grants and compares every settlement against it (${LFG_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, grant: stored });
    },

    /* -------------------------------------------------------------- conventions */

    claimSetConventions(patch = {}) {
      const check = seatFor(LFG_RIGHTS.MANAGE);
      if (!check.ok) return check;
      const current = normalizeLfgSettings(settings());
      const known = new Set(Object.values(LFG_SETTING_KEYS));
      for (const key of Object.keys(patch || {})) {
        if (!known.has(key)) return fail(`Unknown convention “${String(key).slice(0, 60)}”. Nothing was saved.`, key, REFUSAL('unknown-setting'));
      }
      const next = { ...current };
      for (const [key, value] of Object.entries(patch || {})) {
        if (key === LFG_SETTING_KEYS.autoPropagate) { next[key] = value !== false; continue; }
        const n = Number(value);
        if (!Number.isInteger(n)) return fail(`“${key}” is a whole number. Nothing was saved.`, key, REFUSAL('setting-invalid'));
        const bound = key === LFG_SETTING_KEYS.privacyFloor ? LFG_BOUNDS.privacyFloor : LFG_BOUNDS.warningHorizonDays;
        if (n < bound.min || n > bound.max) {
          return fail(`“${key}” must be between ${bound.min} and ${bound.max}. It is refused rather than clamped, so the figure on the screen is always the figure somebody declared.`, key, REFUSAL('setting-out-of-bounds'));
        }
        next[key] = n;
      }
      store.update((draft) => {
        draft.settings = { ...(draft.settings || {}), ...next };
      }, {
        type: LFG_EVENTS.CONVENTIONS_SET,
        entity: 'workspace',
        entityId: LFG_ROUTE,
        summary: `Claim-register conventions re-declared: the warning horizon, the privacy floor and whether the rule may file asks (${LFG_ROUTE}). The warning horizon is a planning convention and is never a limitation period.`.slice(0, 300),
      });
      return saved({ conventions: normalizeLfgSettings(store.state.settings || {}) });
    },

    /* -------------------------------------------------------------------- reads */

    claimReport() {
      const check = readCheck();
      if (!check.ok) return check;
      return { ok: true, report: buildClaims(store.state, { now: check.at, settings: check.cfg, seat: check.seat }) };
    },

    claimAttention() {
      const check = readCheck();
      if (!check.ok) return check;
      return { ok: true, count: claimAttentionCount(store.state, { now: check.at, settings: check.cfg, seat: check.seat }) };
    },

    /** The candidates a dialog may name, narrowed to what this seat may actually write. */
    claimCandidates() {
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
     * The explicit scan. Re-runs the rule over the whole register. Pausable: a pause is
     * a pause on every path, including this one — and it matters here because a
     * limitation period RUNS OUT by the calendar with nobody having written anything.
     */
    claimScan() {
      const check = seatFor(LFG_RIGHTS.MANAGE);
      if (!check.ok) return check;
      store.update((draft) => {
        draft.lfgMarkers = Array.isArray(draft.lfgMarkers) ? draft.lfgMarkers : [];
      }, {
        type: LFG_EVENTS.SCANNED,
        entity: 'workspace',
        entityId: LFG_ROUTE,
        summary: `Claims register scanned; the rule re-reads every matter against its declared accrual, its period, its proved suspensions and its resolution (${LFG_ROUTE}).`.slice(0, 300),
      });
      return saved({});
    },
  };
}

/** The read context, exported so the view can print exactly what the register claims. */
export const CLAIM_CONTEXT = 'Read the claims, limitation and settlement-authority register (#/claims). It records the matter, the accrual that starts the clock, the declared limitation period, every proved suspension, every concession and resolution, and the authority computed above the responsible lines. It gives no legal advice and scores nobody.';
