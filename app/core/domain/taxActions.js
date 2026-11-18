/**
 * app/core/domain/taxActions.js — the seat-checked commands of the Tax
 * Controversy & Appeal-Control Register (ADR-0257).
 *
 * SIX human acts and a scan: RECORD a notice (the authority reference, the
 * disputed position, the jurisdiction as declared, the tax type, the disputed
 * amount), DECLARE a deadline (the jurisdiction-declared objection day with its
 * written basis), RECORD a filing (its kind, its filed day, the authority's
 * receipt reference), RECORD an evidence item (its label and document
 * reference), RECORD a resolution (the closed-vocabulary outcome and the amount
 * finally payable), re-declare the conventions — plus the explicit scan. Every
 * state, timeliness verdict, days-remaining figure and swing is re-derived on
 * read by `taxControversy.js`; nothing derived is stored.
 *
 * THE DOOR IS THE PRODUCT, AND EVERY REFUSAL IS A CONTROL.
 *  - A NOTICE carries the authority reference, the disputed position, the
 *    jurisdiction as declared, the tax type, the notice day, the disputed
 *    amount, a currency, a written basis and one to four responsible hands. A
 *    tax type this register does not carry is refused: the kind is the verdict.
 *  - A DEADLINE carries the deadline day and a written jurisdictional basis. A
 *    deadline with no basis is refused — a date nobody cited is the deadline
 *    this register exists to refuse. The register computes no window from a
 *    notice day; there is no jurisdiction calendar in this record.
 *  - A FILING carries its kind, its filed day and the authority's receipt
 *    reference. A filing with no receipt is refused: an unreceipted filing is
 *    an intention, not a filing. A filing after the deadline is recorded as
 *    late by the reader, never refused and never re-dated.
 *  - An EVIDENCE item carries its label and the document reference it is drawn
 *    from. A bare label is refused: it is not a packet.
 *  - A RESOLUTION carries the closed-vocabulary outcome, the resolved day, the
 *    resolved amount and a written basis. An outcome this register does not
 *    carry is refused; the register never infers an outcome from an amount.
 *  - Every write is run through the loader and the stored row is the row the
 *    loader returns. A write the loader would refuse on reload is refused now.
 *
 * WHAT NO COMMAND CAN DO. There is no command that sets a state, asserts
 * timeliness, computes a deadline, re-dates a filing, infers evidence from a
 * filing, re-measures the uncertain-tax provision, or scores a person, a line
 * or a tax handler.
 */

import { dayKey } from '../time.js';
import { buildSeats, activeSeat, canAct } from './seat.js';
import { matrixLineScopeFor } from './matrix.js';
import { buildTaxControversy, taxAttentionCount } from './taxControversy.js';
import {
  TAX_BOUNDS,
  TAX_FILING_KIND_KEYS,
  TAX_OUTCOME_KEYS,
  TAX_EVENTS,
  TAX_LIMITS as L,
  TAX_REFUSALS,
  TAX_RIGHTS,
  TAX_ROUTE,
  TAX_SETTING_KEYS,
  TAX_TYPE_KEYS,
} from './taxRegistry.js';
import {
  normalizeTaxDeadlines,
  normalizeTaxEvidence,
  normalizeTaxFilings,
  normalizeTaxNotices,
  normalizeTaxResolutions,
  normalizeTaxSettings,
  taxCurrency,
  taxDayKey,
  taxHolders,
  taxInstrument,
  taxJurisdiction,
  taxReason,
  taxShort,
} from './taxSchema.js';
import { instantMs, minorUnits } from './taxMath.js';

const REFUSAL = (key) => `tax-controversy:${key}`;
const text = (value, max = L.textMax) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export function createTaxActions(store, { now, idFactory }) {
  const fail = (error, field = null, refusal = null) => ({ ok: false, error, ...(field ? { field } : {}), ...(refusal ? { refusal } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  const rows = (key) => (Array.isArray(store.state[key]) ? store.state[key] : []);

  /**
   * A write result. The caller's own warning is MERGED with the persist error,
   * never overwritten by it — a notice stored with an unreadable child must
   * not lose its message on a clean persist.
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
    if (seat.readOnly) return fail(TAX_REFUSALS.notSeated);
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, seat, at, cfg, actorId: seat.fullAccess ? 'leader' : (seat.nodeId || seat.id || null), today: dayKey(at) };
  }

  /**
   * A read is REGISTERED as safe and therefore bypasses the gateway's rank
   * check — so the right is re-proved HERE, exactly as every register in this
   * workspace re-proves it.
   */
  function readCheck() {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    const seat = activeSeat(built);
    if (seat.readOnly) return fail(TAX_REFUSALS.notSeated);
    const verdict = canAct(TAX_RIGHTS.READ, seat);
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
    const ids = taxHolders(Array.isArray(value) ? value : text(value, 2000).split(/[,;]/).map((part) => part.trim()).filter(Boolean));
    if (!ids) {
      return fail(`Name between one and ${L.holdersMax} responsible person(s), each on this workspace once. A controversy with no responsible hand has nobody to answer for it.`, 'responsibleIds', REFUSAL('holders-invalid'));
    }
    for (const holderId of ids) {
      const person = rows('people').find((row) => row && row.id === holderId) || null;
      if (!person) return fail(`“${holderId}” is not a person on this record. Nothing was saved.`, 'responsibleIds', REFUSAL('holder-not-found'));
      if (person.status === 'archived') return fail(`${person.name || holderId} is archived and cannot be made responsible for a live controversy.`, 'responsibleIds', REFUSAL('holder-archived'));
      if (!holdsPerson(check, holderId)) {
        return fail(`${person.name || holderId} is not on a line this seat holds. ${TAX_REFUSALS.noReach}`, 'responsibleIds', REFUSAL('holder-not-your-person'));
      }
    }
    return { ok: true, ids };
  }

  function loadedNotices() { return normalizeTaxNotices(rows('taxNotices'), []); }
  function loadedDeadlines() { return normalizeTaxDeadlines(rows('taxDeadlines'), loadedNotices(), []); }
  function loadedFilings() { return normalizeTaxFilings(rows('taxFilings'), loadedNotices(), []); }
  function loadedEvidence() { return normalizeTaxEvidence(rows('taxEvidence'), loadedNotices(), []); }
  function loadedResolutions() { return normalizeTaxResolutions(rows('taxResolutions'), loadedNotices(), []); }

  function writeDraft(mutate, event) {
    store.update((draft) => { mutate(draft); }, event);
    return true;
  }

  /** A day an ACT that has already happened names, and therefore cannot be future. */
  function pastDay(check, value, field) {
    const day = taxDayKey(value);
    if (!day) return { error: fail('Give a real calendar day (YYYY-MM-DD).', field, REFUSAL('day-invalid')) };
    const dayMs = instantMs(`${day}T00:00:00.000Z`);
    if (dayMs > instantMs(`${check.today}T00:00:00.000Z`)) {
      return { error: fail('That day is in the future. This register records what has been decided, not what will be.', field, REFUSAL('day-future')) };
    }
    return { day };
  }

  return {
    /* ------------------------------------------------------------------- notices */

    /**
     * RECORD a notice: the authority reference, the disputed position, the
     * jurisdiction as declared, the tax type, the notice day, the disputed
     * amount, a currency, a written basis and the hands responsible for it.
     */
    taxRecordNotice(input = {}) {
      const check = seatFor(TAX_RIGHTS.MANAGE);
      if (!check.ok) return check;

      const noticeRef = taxShort(input.noticeRef);
      if (!noticeRef) return fail(`Cite the authority's notice reference, in at least ${L.shortMin} characters.`, 'noticeRef', REFUSAL('notice-ref-missing'));
      const position = taxShort(input.position);
      if (!position) return fail(`Name the disputed position, in at least ${L.shortMin} characters — the treatment the authority has reassessed.`, 'position', REFUSAL('position-missing'));
      const jurisdiction = taxJurisdiction(input.jurisdiction);
      if (!jurisdiction) return fail(`Name the jurisdiction as declared, in at least ${L.jurisdictionMin} characters. The register holds no jurisdiction calendar and will not guess one from a label.`, 'jurisdiction', REFUSAL('jurisdiction-missing'));
      const taxType = text(input.taxType, 60) || null;
      if (!taxType || !TAX_TYPE_KEYS.includes(taxType)) {
        return fail('Choose the tax type. The register never infers the kind of a dispute from an amount or a jurisdiction.', 'taxType', REFUSAL('tax-type-invalid'));
      }
      const noticeDay = pastDay(check, input.noticeDay || check.today, 'noticeDay');
      if (noticeDay.error) return noticeDay.error;

      const disputedMinor = minorUnits(Number(input.disputedMinor));
      if (disputedMinor === null) {
        return fail('The disputed amount is a whole number of minor units (pence or cents). A fractional minor unit is refused rather than rounded into a controversy.', 'disputedMinor', REFUSAL('amount-invalid'));
      }
      const currency = taxCurrency(input.currency);
      if (!currency) return fail('Give the three-letter currency the disputed amount is in. Amounts in this register are exact minor units in one named currency.', 'currency', REFUSAL('currency-invalid'));
      const basisRef = taxReason(input.basisRef);
      if (!basisRef) {
        return fail(`Write the basis for this notice, in at least ${L.textMin} characters — what the authority asserts and why the position is disputed. A notice with no written basis is an assertion the register cannot audit.`, 'basisRef', REFUSAL('basis-missing'));
      }

      let provisionRef = null;
      if (input.provisionRef !== undefined && input.provisionRef !== null && input.provisionRef !== '') {
        provisionRef = taxInstrument(input.provisionRef);
        if (!provisionRef) {
          return fail(`Cite the finance record where the uncertain-tax provision for this position is carried, in at least ${L.instrumentMin} characters — or leave it blank. The register references the provision; it never restates it.`, 'provisionRef', REFUSAL('provision-ref-invalid'));
        }
      }

      const holders = holdersContext(check, input.responsibleIds);
      if (!holders.ok) return holders;

      if (loadedNotices().some((row) => row.noticeRef === noticeRef)) {
        return fail('That authority reference already carries a notice. A second notice for one reference would make the controversy ambiguous; correct the existing one instead of adding a rival.', 'noticeRef', REFUSAL('notice-duplicate'));
      }

      if (loadedNotices().length >= L.notices) return fail('The notice ledger is full. Export the workspace before proceeding.', null, REFUSAL('ledger-full'));

      const id = idFactory('tax-not');
      const row = {
        id,
        noticeRef,
        position,
        jurisdiction,
        taxType,
        noticeDay: noticeDay.day,
        disputedMinor,
        currency,
        basisRef,
        responsibleIds: holders.ids,
        recordedById: check.actorId,
        recordedAt: check.at.toISOString(),
        recordedDay: check.today,
        provisionRef,
        createdAt: check.at.toISOString(),
        updatedAt: check.at.toISOString(),
      };
      const stored = normalizeTaxNotices([...rows('taxNotices'), row], []).find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The notice could not be stored as a row this register can read back. Nothing was saved.', 'basisRef', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.taxNotices = Array.isArray(draft.taxNotices) ? draft.taxNotices : [];
        draft.taxNotices.push(stored);
      }, {
        type: TAX_EVENTS.NOTICE_RECORDED,
        entity: 'workspace',
        entityId: noticeRef,
        summary: `Authority notice recorded: ${noticeRef}, ${taxType} in ${jurisdiction}, ${currency} ${disputedMinor} minor units disputed. The deadline, the filing, the evidence and the resolution are derived on read (${TAX_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, notice: stored });
    },

    /* ------------------------------------------------------------------ deadlines */

    /**
     * DECLARE a deadline: the jurisdiction-declared objection day with its
     * written jurisdictional basis. The register computes no window from the
     * notice day.
     */
    taxDeclareDeadline(input = {}) {
      const check = seatFor(TAX_RIGHTS.MANAGE);
      if (!check.ok) return check;

      const noticeId = text(input.noticeId, L.idMax) || null;
      if (!noticeId) return fail('Name the notice this deadline belongs to.', 'noticeId');
      const notice = loadedNotices().find((row) => row.id === noticeId) || null;
      if (!notice) return fail(TAX_REFUSALS.notFound, 'noticeId', REFUSAL('notice-not-found'));

      const deadlineDay = taxDayKey(input.deadlineDay);
      if (!deadlineDay) return fail('Give a real calendar day (YYYY-MM-DD) for the declared deadline.', 'deadlineDay', REFUSAL('day-invalid'));
      const basisRef = taxReason(input.basisRef);
      if (!basisRef) {
        return fail(`Cite the written jurisdictional basis for this deadline, in at least ${L.textMin} characters — the statute, regulation or authority guidance that sets the window. A date nobody cited is the deadline this register exists to refuse.`, 'basisRef', REFUSAL('basis-missing'));
      }

      const declared = pastDay(check, input.declaredDay || check.today, 'declaredDay');
      if (declared.error) return declared.error;

      if (loadedDeadlines().some((row) => row.noticeId === noticeId)) {
        return fail('That notice already carries a declared deadline. A second deadline for one notice would make the window ambiguous; correct the existing one instead of adding a rival.', 'noticeId', REFUSAL('deadline-duplicate'));
      }

      if (loadedDeadlines().length >= L.deadlines) return fail('The deadline ledger is full. Export the workspace before proceeding.', null, REFUSAL('ledger-full'));

      const id = idFactory('tax-dln');
      const row = {
        id,
        noticeId,
        deadlineDay,
        basisRef,
        declaredById: check.actorId,
        declaredAt: check.at.toISOString(),
        declaredDay: declared.day,
        createdAt: check.at.toISOString(),
      };
      const stored = normalizeTaxDeadlines([...rows('taxDeadlines'), row], loadedNotices(), []).find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The deadline could not be stored as a row this register can read back. Nothing was saved.', 'basisRef', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.taxDeadlines = Array.isArray(draft.taxDeadlines) ? draft.taxDeadlines : [];
        draft.taxDeadlines.push(stored);
      }, {
        type: TAX_EVENTS.DEADLINE_DECLARED,
        entity: 'workspace',
        entityId: notice.noticeRef,
        summary: `Objection deadline declared on notice ${notice.noticeRef}: ${deadlineDay}, with its written jurisdictional basis. Timeliness is derived on read (${TAX_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, deadline: stored });
    },

    /* --------------------------------------------------------------------- filings */

    /**
     * RECORD a filing: its kind, its filed day and the authority's receipt
     * reference. A filing after the deadline is recorded as late by the reader,
     * never refused and never re-dated.
     */
    taxRecordFiling(input = {}) {
      const check = seatFor(TAX_RIGHTS.MANAGE);
      if (!check.ok) return check;

      const noticeId = text(input.noticeId, L.idMax) || null;
      if (!noticeId) return fail('Name the notice this filing belongs to.', 'noticeId');
      const notice = loadedNotices().find((row) => row.id === noticeId) || null;
      if (!notice) return fail(TAX_REFUSALS.notFound, 'noticeId', REFUSAL('notice-not-found'));

      const filingKind = text(input.filingKind, 60) || null;
      if (!filingKind || !TAX_FILING_KIND_KEYS.includes(filingKind)) {
        return fail('Choose the filing kind. An objection, an appeal, a response and an information supply are four different acts, and the register never treats one as another.', 'filingKind', REFUSAL('filing-kind-invalid'));
      }
      const filedDay = pastDay(check, input.filedDay || check.today, 'filedDay');
      if (filedDay.error) return filedDay.error;

      const receiptRef = taxShort(input.receiptRef);
      if (!receiptRef) return fail(`Cite the authority's receipt reference, in at least ${L.shortMin} characters. An unreceipted filing is an intention, not a filing.`, 'receiptRef', REFUSAL('receipt-missing'));
      const basisRef = taxReason(input.basisRef);
      if (!basisRef) return fail(`Write the basis for this filing, in at least ${L.textMin} characters — what was filed and why.`, 'basisRef', REFUSAL('basis-missing'));

      if (loadedFilings().length >= L.filings) return fail('The filing ledger is full. Export the workspace before proceeding.', null, REFUSAL('ledger-full'));

      const id = idFactory('tax-fil');
      const row = {
        id,
        noticeId,
        filingKind,
        filedDay: filedDay.day,
        receiptRef,
        basisRef,
        filedById: check.actorId,
        filedAt: check.at.toISOString(),
        filedDayStamp: check.today,
        createdAt: check.at.toISOString(),
      };
      const stored = normalizeTaxFilings([...rows('taxFilings'), row], loadedNotices(), []).find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The filing could not be stored as a row this register can read back. Nothing was saved.', 'receiptRef', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.taxFilings = Array.isArray(draft.taxFilings) ? draft.taxFilings : [];
        draft.taxFilings.push(stored);
      }, {
        type: TAX_EVENTS.FILING_RECORDED,
        entity: 'workspace',
        entityId: notice.noticeRef,
        summary: `Filing recorded on notice ${notice.noticeRef}: ${filingKind} filed ${filedDay.day} against receipt ${receiptRef}. Timeliness is derived on read (${TAX_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, filing: stored });
    },

    /* -------------------------------------------------------------------- evidence */

    /**
     * RECORD an evidence item: its label and the document reference it is drawn
     * from, bound to the notice whose disputed position it supports.
     */
    taxRecordEvidence(input = {}) {
      const check = seatFor(TAX_RIGHTS.MANAGE);
      if (!check.ok) return check;

      const noticeId = text(input.noticeId, L.idMax) || null;
      if (!noticeId) return fail('Name the notice this evidence belongs to.', 'noticeId');
      const notice = loadedNotices().find((row) => row.id === noticeId) || null;
      if (!notice) return fail(TAX_REFUSALS.notFound, 'noticeId', REFUSAL('notice-not-found'));

      const itemLabel = taxShort(input.itemLabel);
      if (!itemLabel) return fail(`Name the evidence item, in at least ${L.shortMin} characters.`, 'itemLabel', REFUSAL('item-label-missing'));
      const itemRef = taxShort(input.itemRef);
      if (!itemRef) return fail(`Cite the document reference the item is drawn from, in at least ${L.shortMin} characters. A bare label is not a packet.`, 'itemRef', REFUSAL('item-ref-missing'));
      const suppliedDay = pastDay(check, input.suppliedDay || check.today, 'suppliedDay');
      if (suppliedDay.error) return suppliedDay.error;

      const basisRef = taxReason(input.basisRef);
      if (!basisRef) return fail(`Write the basis for this evidence item, in at least ${L.textMin} characters — what it proves about the disputed position.`, 'basisRef', REFUSAL('basis-missing'));

      if (loadedEvidence().length >= L.evidence) return fail('The evidence ledger is full. Export the workspace before proceeding.', null, REFUSAL('ledger-full'));

      const id = idFactory('tax-evi');
      const row = {
        id,
        noticeId,
        itemLabel,
        itemRef,
        suppliedDay: suppliedDay.day,
        basisRef,
        suppliedById: check.actorId,
        suppliedAt: check.at.toISOString(),
        suppliedDayStamp: check.today,
        createdAt: check.at.toISOString(),
      };
      const stored = normalizeTaxEvidence([...rows('taxEvidence'), row], loadedNotices(), []).find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The evidence item could not be stored as a row this register can read back. Nothing was saved.', 'itemRef', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.taxEvidence = Array.isArray(draft.taxEvidence) ? draft.taxEvidence : [];
        draft.taxEvidence.push(stored);
      }, {
        type: TAX_EVENTS.EVIDENCE_RECORDED,
        entity: 'workspace',
        entityId: notice.noticeRef,
        summary: `Evidence recorded on notice ${notice.noticeRef}: ${itemLabel} against ${itemRef}. The packet is derived on read (${TAX_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, evidence: stored });
    },

    /* ------------------------------------------------------------------ resolutions */

    /**
     * RECORD a resolution: the closed-vocabulary outcome, the resolved day, the
     * amount finally payable and a written basis. The swing against the
     * disputed amount is derived on read.
     */
    taxRecordResolution(input = {}) {
      const check = seatFor(TAX_RIGHTS.MANAGE);
      if (!check.ok) return check;

      const noticeId = text(input.noticeId, L.idMax) || null;
      if (!noticeId) return fail('Name the notice this resolution belongs to.', 'noticeId');
      const notice = loadedNotices().find((row) => row.id === noticeId) || null;
      if (!notice) return fail(TAX_REFUSALS.notFound, 'noticeId', REFUSAL('notice-not-found'));

      const outcome = text(input.outcome, 60) || null;
      if (!outcome || !TAX_OUTCOME_KEYS.includes(outcome)) {
        return fail('Choose the outcome. The register never infers an outcome from an amount or a payment.', 'outcome', REFUSAL('outcome-invalid'));
      }
      const resolvedDay = pastDay(check, input.resolvedDay || check.today, 'resolvedDay');
      if (resolvedDay.error) return resolvedDay.error;

      const resolvedMinor = minorUnits(Number(input.resolvedMinor));
      if (resolvedMinor === null) {
        return fail('The resolved amount is a whole number of minor units (pence or cents). A fractional minor unit is refused rather than rounded into a resolution.', 'resolvedMinor', REFUSAL('amount-invalid'));
      }
      const currency = taxCurrency(input.currency);
      if (!currency) return fail('Give the three-letter currency the resolved amount is in.', 'currency', REFUSAL('currency-invalid'));
      const basisRef = taxReason(input.basisRef);
      if (!basisRef) return fail(`Write the basis for this resolution, in at least ${L.textMin} characters — the authority's decision, the settlement terms, the concession.`, 'basisRef', REFUSAL('basis-missing'));

      if (loadedResolutions().some((row) => row.noticeId === noticeId)) {
        return fail('That notice already carries a resolution. A second resolution for one notice would make the outcome ambiguous; correct the existing one instead of adding a rival.', 'noticeId', REFUSAL('resolution-duplicate'));
      }

      if (loadedResolutions().length >= L.resolutions) return fail('The resolution ledger is full. Export the workspace before proceeding.', null, REFUSAL('ledger-full'));

      const id = idFactory('tax-res');
      const row = {
        id,
        noticeId,
        outcome,
        resolvedDay: resolvedDay.day,
        resolvedMinor,
        currency,
        basisRef,
        recordedById: check.actorId,
        recordedAt: check.at.toISOString(),
        recordedDay: check.today,
        createdAt: check.at.toISOString(),
      };
      const stored = normalizeTaxResolutions([...rows('taxResolutions'), row], loadedNotices(), []).find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The resolution could not be stored as a row this register can read back. Nothing was saved.', 'basisRef', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.taxResolutions = Array.isArray(draft.taxResolutions) ? draft.taxResolutions : [];
        draft.taxResolutions.push(stored);
      }, {
        type: TAX_EVENTS.RESOLUTION_RECORDED,
        entity: 'workspace',
        entityId: notice.noticeRef,
        summary: `Resolution recorded on notice ${notice.noticeRef}: ${outcome}, ${currency} ${resolvedMinor} minor units finally payable. The swing against the disputed amount is derived on read (${TAX_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, resolution: stored });
    },

    /* -------------------------------------------------------------- conventions */

    taxSetConventions(patch = {}) {
      const check = seatFor(TAX_RIGHTS.MANAGE);
      if (!check.ok) return check;
      const current = normalizeTaxSettings(settings());
      const known = new Set(Object.values(TAX_SETTING_KEYS));
      for (const key of Object.keys(patch || {})) {
        if (!known.has(key)) return fail(`Unknown convention “${String(key).slice(0, 60)}”. Nothing was saved.`, key, REFUSAL('unknown-setting'));
      }
      const next = { ...current };
      for (const [key, value] of Object.entries(patch || {})) {
        if (key === TAX_SETTING_KEYS.autoPropagate) { next[key] = value !== false; continue; }
        const n = Number(value);
        if (!Number.isInteger(n)) return fail(`“${key}” is a whole number. Nothing was saved.`, key, REFUSAL('setting-invalid'));
        const bound = key === TAX_SETTING_KEYS.privacyFloor ? TAX_BOUNDS.privacyFloor : TAX_BOUNDS.resolutionHorizonDays;
        if (n < bound.min || n > bound.max) {
          return fail(`“${key}” must be between ${bound.min} and ${bound.max}. It is refused rather than clamped, so the figure on the screen is always the figure somebody declared.`, key, REFUSAL('setting-out-of-bounds'));
        }
        next[key] = n;
      }
      store.update((draft) => {
        draft.settings = { ...(draft.settings || {}), ...next };
      }, {
        type: TAX_EVENTS.CONVENTIONS_SET,
        entity: 'workspace',
        entityId: TAX_ROUTE,
        summary: `Tax-controversy conventions re-declared: the privacy floor, the resolution horizon and whether the rule may file asks (${TAX_ROUTE}).`,
      });
      return saved({ conventions: normalizeTaxSettings(store.state.settings || {}) });
    },

    /* -------------------------------------------------------------------- reads */

    taxReport() {
      const check = readCheck();
      if (!check.ok) return check;
      return { ok: true, report: buildTaxControversy(store.state, { now: check.at, settings: check.cfg, seat: check.seat }) };
    },

    taxAttention() {
      const check = readCheck();
      if (!check.ok) return check;
      return { ok: true, count: taxAttentionCount(store.state, { now: check.at, settings: check.cfg, seat: check.seat }) };
    },

    /** The candidates a dialog may name, narrowed to what this seat may actually write. */
    taxCandidates() {
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
     * pause is a pause on every path, including this one — and it matters here
     * because an overdue-unfiled notice is a deadline that has already passed
     * with nobody having written anything.
     */
    taxScan() {
      const check = seatFor(TAX_RIGHTS.MANAGE);
      if (!check.ok) return check;
      store.update((draft) => {
        draft.taxMarkers = Array.isArray(draft.taxMarkers) ? draft.taxMarkers : [];
      }, {
        type: TAX_EVENTS.SCANNED,
        entity: 'workspace',
        entityId: TAX_ROUTE,
        summary: `Tax controversy register scanned; the rule re-reads every notice, deadline, filing, evidence item and resolution (${TAX_ROUTE}).`.slice(0, 300),
      });
      return saved({});
    },
  };
}

/** The read context, exported so the view can print exactly what the register claims. */
export const TAX_CONTEXT = 'Read the tax controversy and appeal-control register (#/tax). It binds each authority notice to the disputed position, the jurisdiction-declared objection deadline, the filing that met it, the evidence packet behind it and the resolution — deriving the state, the timeliness and the swing on read. It gives no tax advice and scores nobody.';
