/**
 * app/core/domain/productNonconformanceActions.js — the seat-checked commands of
 * the Product Nonconformance & Disposition Register (ADR-0253, Schema v206).
 *
 * SIX human acts and a scan: OPEN a case (one internally identified manufactured
 * lot or serial), RECORD a containment attestation, SIGN a disposition in the
 * current joint round, RECORD the act that carries it out, RECORD a re-verification
 * of re-work, re-declare the conventions — plus the explicit scan. Every state,
 * count and verdict is re-derived on read by `productNonconformance.js`; nothing
 * derived is stored, and no command below can write a state.
 *
 * THE DOOR IS THE PRODUCT, AND EVERY REFUSAL IS A CONTROL.
 *  - A CASE carries a case reference, a product, a site, ONE identifier kind (lot or
 *    serial) with its value, a source kind, the requirement reference, the
 *    requirement, the finding, a source-evidence reference, the day it was
 *    identified, and one to four accountable hands this seat actually holds. A case
 *    that names no identifier, or both kinds at once, is refused: an unidentified
 *    output cannot be contained.
 *  - A CONTAINMENT is an ATTESTATION, not a physical or system hold. The door
 *    records who attested what, against which written hold reference and which
 *    evidence. It does not and cannot lock a warehouse, a pick list or a machine.
 *  - NO DISPOSITION WITHOUT A COMPLETE CONTAINMENT, and none without a resolved
 *    joint matrix apex. The `entire` attestation that governs is the LATEST one; an
 *    earlier `entire` act does not survive a later partial one.
 *  - ONLY A CURRENT JOINT APEX SIGNS. The route is recomputed here from the live
 *    reporting graph, never taken from the caller. One signature per hand per
 *    round; a second signature from the same hand is refused.
 *  - USE-AS-IS NEEDS A WRITTEN CONCESSION REFERENCE. There is no informal
 *    concession and no default disposition anywhere in this file.
 *  - RE-VERIFICATION IS STRICTLY SENIOR. The verifier must be a different person
 *    AND strictly above the hand that completed the rework on the live graph. This
 *    is checked HERE, on the write path, by the same pure rule the reader applies —
 *    not merely printed by the reader afterwards.
 *  - AN ACT MUST BE THE ONE THE DERIVED STATE WAITS FOR. The door re-derives the
 *    case and refuses any act outside `allowedActKinds`, so a release cannot be
 *    recorded against a pending rework and a return cannot be recorded against a
 *    scrap disposition.
 *
 * WHAT NO COMMAND CAN DO. There is no command that sets a case state, marks an
 * output held or released by status, releases without a passing senior
 * re-verification (or a written concession), writes a disposition without the
 * joint apex, edits a failed re-verification out of the record, or rates a person,
 * a line or a site.
 */

import { dayKey } from '../time.js';
import { buildSeats, activeSeat, canAct } from './seat.js';
import { buildMatrix, matrixLineScopeFor } from './matrix.js';
import { buildProductNonconformance, qncVerificationSeniority } from './productNonconformance.js';
import {
  QNC_ACT_KIND_BY_KEY,
  QNC_CONTAINMENT_METHOD_BY_KEY,
  QNC_DISPOSITION_BY_KEY,
  QNC_EVENTS,
  QNC_IDENTIFIER_KIND_BY_KEY,
  QNC_LIMITS as L,
  QNC_REFUSALS,
  QNC_RIGHTS,
  QNC_ROUTE,
  QNC_SETTING_KEYS,
  QNC_SOURCE_BY_KEY,
} from './productNonconformanceRegistry.js';
import {
  normalizeQncCases,
  normalizeQncContainments,
  normalizeQncDecisions,
  normalizeQncDispositionActs,
  normalizeQncMarkers,
  normalizeQncSettings,
  normalizeQncVerifications,
} from './productNonconformanceSchema.js';

const REFUSAL = (key) => `product-nonconformance:${key}`;
const clean = (value, max) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const shortText = (value, min = L.shortMin, max = L.shortMax) => {
  const text = clean(value, max + 1);
  return text.length >= min && text.length <= max ? text : null;
};
const reference = (value) => shortText(value, L.refMin, L.refMax);
const prose = (value) => shortText(value, L.textMin, L.textMax);

export function createProductNonconformanceActions(store, { now, idFactory }) {
  const fail = (error, field = null, refusal = null) => ({ ok: false, error, ...(field ? { field } : {}), ...(refusal ? { refusal } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  const rows = (key) => (Array.isArray(store.state[key]) ? store.state[key] : []);

  /** A write result: the caller's own warning and the persist error are BOTH kept. */
  const saved = (extra = {}) => {
    const { warning: own = null, ...rest } = extra;
    const persist = store.persistError || null;
    const warning = [own, persist].filter(Boolean).join(' ') || null;
    return { ...rest, saved: !persist, warning, propagations: store.lastPropagations || [], ok: true };
  };

  function seatContext() {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    const seat = activeSeat(built);
    const actorId = seat.fullAccess ? 'leader' : (seat.nodeId || seat.id || null);
    return { at, cfg, built, seat, actorId, today: dayKey(at) };
  }

  function seatFor(right) {
    const check = seatContext();
    if (check.seat.readOnly) return fail(QNC_REFUSALS.notSeated);
    const verdict = canAct(right, check.seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, ...check };
  }

  /** A read is a SAFE_READ at the gateway, so the right is re-proved HERE. */
  function readCheck() {
    const check = seatContext();
    if (check.seat.readOnly) return fail(QNC_REFUSALS.notSeated);
    const verdict = canAct(QNC_RIGHTS.READ, check.seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, ...check };
  }

  function holdsPerson(check, personId) {
    if (!personId) return false;
    if (check.seat.fullAccess) return true;
    const nodeId = check.seat.nodeId || check.seat.id || null;
    if (personId === nodeId) return true;
    if (check.seat.scope?.has?.(personId)) return true;
    if (check.seat.lineScope?.has?.(personId)) return true;
    return false;
  }

  /* ------------------------------------------------------- loaded in dependency order */

  function loadedCases() { return normalizeQncCases(rows('qncCases'), clock(), []); }
  function ledger() {
    const cases = loadedCases();
    const containments = normalizeQncContainments(rows('qncContainments'), cases, clock(), []);
    const decisions = normalizeQncDecisions(rows('qncDecisions'), cases, containments, clock(), []);
    const acts = normalizeQncDispositionActs(rows('qncDispositionActs'), cases, decisions, clock(), []);
    const verifications = normalizeQncVerifications(rows('qncVerifications'), cases, acts, clock(), []);
    return { cases, containments, decisions, acts, verifications };
  }

  /** The derived row for one case, from the same reader the panel and CSV use. */
  function caseRow(caseId) {
    const report = buildProductNonconformance(store.state, { now: clock(), settings: settings(), seat: null });
    return { report, row: (report.rows || []).find((item) => item.case?.id === caseId) || null };
  }

  /** The actor must declare the case, hold one of its accountable hands, or be its apex. */
  function carriesCase(check, row) {
    if (!row) return false;
    if (check.seat.fullAccess) return true;
    const actorId = check.actorId;
    if (!actorId) return false;
    return row.case.declaredById === actorId
      || (row.case.ownerIds || []).includes(actorId)
      || (row.authority?.apexIds || []).includes(actorId);
  }

  function ownerContext(check, value) {
    const raw = Array.isArray(value) ? value : clean(value, 2000).split(/[,;]/).map((part) => part.trim()).filter(Boolean);
    if (!raw.length || raw.length > L.ownersMax) {
      return fail(`Name between one and ${L.ownersMax} accountable person(s), each on this workspace once. A product case with no accountable hand has nobody to answer for it.`, 'ownerIds', REFUSAL('owners-invalid'));
    }
    const ids = raw.map((item) => (typeof item === 'string' ? item.trim() : ''));
    if (new Set(ids).size !== ids.length || ids.some((item) => !item)) {
      return fail('Each accountable hand appears once, and none may be blank.', 'ownerIds', REFUSAL('owners-invalid'));
    }
    for (const personId of ids) {
      const person = rows('people').find((row) => row && row.id === personId) || null;
      if (!person) return fail(`“${personId}” is not a person on this record. Nothing was saved.`, 'ownerIds', REFUSAL('owner-not-found'));
      if (person.status === 'archived') return fail(`${person.name || personId} is archived and cannot be made accountable for a live product case.`, 'ownerIds', REFUSAL('owner-archived'));
      if (!holdsPerson(check, personId)) {
        return fail(`${person.name || personId} is not on a line this seat holds. ${QNC_REFUSALS.noReach}`, 'ownerIds', REFUSAL('owner-not-your-person'));
      }
    }
    return { ok: true, ids };
  }

  /** A day the event already happened on, and therefore cannot be in the future. */
  function pastDay(check, value, field) {
    const day = clean(value, 40);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || dayKey(`${day}T00:00:00.000Z`) !== day) {
      return { error: fail('Give a real calendar day (YYYY-MM-DD).', field, REFUSAL('day-invalid')) };
    }
    if (day > check.today) return { error: fail('That day is in the future. This register records what was identified and done, not what will be.', field, REFUSAL('day-future')) };
    return { day };
  }

  function writeDraft(mutate, event) {
    store.update((draft) => { mutate(draft); }, event);
  }

  return {
    /* --------------------------------------------------------------- case opening */

    qncOpen(input = {}) {
      const check = seatFor(QNC_RIGHTS.OPEN);
      if (!check.ok) return check;
      const cases = loadedCases();
      if (cases.length >= L.cases) return fail(QNC_REFUSALS.ledgerFull, null, REFUSAL('ledger-full'));

      const caseRef = shortText(input.caseRef);
      if (!caseRef) return fail(`Give the case reference, in ${L.shortMin}–${L.shortMax} characters.`, 'caseRef', REFUSAL('ref-invalid'));
      if (cases.some((row) => row.caseRef.toLocaleLowerCase('en-US') === caseRef.toLocaleLowerCase('en-US'))) {
        return fail('That case reference is already on the register. One case per identified output; a second case with the same reference makes every act ambiguous.', 'caseRef', REFUSAL('ref-duplicate'));
      }
      const productRef = shortText(input.productRef);
      if (!productRef) return fail('Name the product or part the finding was identified on.', 'productRef', REFUSAL('product-missing'));
      const siteRef = shortText(input.siteRef);
      if (!siteRef) return fail('Name the site or plant the output was made at.', 'siteRef', REFUSAL('site-missing'));

      const identifierKind = typeof input.identifierKind === 'string' && QNC_IDENTIFIER_KIND_BY_KEY[input.identifierKind]
        ? input.identifierKind : null;
      if (!identifierKind) {
        return fail('Declare whether this case identifies a manufacturing lot or a serialised unit. The register does not guess the identifier kind from the value.', 'identifierKind', REFUSAL('identifier-kind-invalid'));
      }
      const identifierRef = shortText(input.identifierRef);
      if (!identifierRef) {
        return fail(`Give the ${QNC_IDENTIFIER_KIND_BY_KEY[identifierKind].label.toLowerCase()} identifier, in ${L.shortMin}–${L.shortMax} characters.`, 'identifierRef', REFUSAL('identifier-missing'));
      }

      const sourceKind = typeof input.sourceKind === 'string' && QNC_SOURCE_BY_KEY[input.sourceKind] ? input.sourceKind : null;
      if (!sourceKind) return fail('Choose the source the finding came from. An internal identification is still a declared source.', 'sourceKind', REFUSAL('source-invalid'));
      const specRef = reference(input.specRef);
      if (!specRef) return fail(`Give the requirement or specification reference this output was made against, in at least ${L.refMin} characters.`, 'specRef', REFUSAL('spec-missing'));
      const requirement = prose(input.requirement);
      if (!requirement) return fail(`State the requirement, in at least ${L.textMin} characters. Without it a finding cannot be judged against anything.`, 'requirement', REFUSAL('requirement-missing'));
      const finding = prose(input.finding);
      if (!finding) return fail(`State the finding, in at least ${L.textMin} characters. “Nonconforming” on its own is not an observation.`, 'finding', REFUSAL('finding-missing'));
      const evidenceRef = reference(input.evidenceRef);
      if (!evidenceRef) return fail(`Give the reference to the source evidence, in at least ${L.refMin} characters. The register stores a pointer, never the measurement itself.`, 'evidenceRef', REFUSAL('evidence-missing'));

      const identified = pastDay(check, input.identifiedOn || check.today, 'identifiedOn');
      if (identified.error) return identified.error;

      const owners = ownerContext(check, input.ownerIds);
      if (!owners.ok) return owners;

      const id = idFactory('qnc-case');
      const row = {
        id,
        caseRef,
        productRef,
        siteRef,
        identifierKind,
        identifierRef,
        sourceKind,
        specRef,
        requirement,
        finding,
        evidenceRef,
        identifiedOn: identified.day,
        ownerIds: owners.ids,
        declaredById: check.actorId,
        createdAt: check.at.toISOString(),
      };
      const stored = normalizeQncCases([...rows('qncCases'), row], check.at, []).find((item) => item.id === id) || null;
      if (!stored) return fail(QNC_REFUSALS.unreadable, 'caseRef', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.qncCases = Array.isArray(draft.qncCases) ? draft.qncCases : [];
        draft.qncCases.push(stored);
      }, {
        type: QNC_EVENTS.OPENED,
        entity: 'workspace',
        entityId: caseRef,
        summary: `Product nonconformance ${caseRef} opened on ${productRef} at ${siteRef}: one ${identifierKind} identified against ${specRef}. State is derived on read (${QNC_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, case: stored });
    },

    /* --------------------------------------------------------------- containment */

    qncRecordContainment(input = {}) {
      const check = seatFor(QNC_RIGHTS.CONTAIN);
      if (!check.ok) return check;
      const caseId = clean(input.caseId, 120);
      const { row } = caseRow(caseId);
      if (!row) return fail(QNC_REFUSALS.notFound, 'caseId', REFUSAL('case-not-found'));
      if (!carriesCase(check, row)) return fail(QNC_REFUSALS.notYourCase, 'caseId', REFUSAL('not-your-case'));
      if (row.terminal) return fail('That case is closed. A closed case accepts no new containment act; open a new case for a new identification.', 'caseId', REFUSAL('case-terminal'));

      const scope = input.scope === 'entire' || input.scope === 'partial' ? input.scope : null;
      if (!scope) return fail('Declare whether this attestation covers the WHOLE identified lot or serial, or only part of it.', 'scope', REFUSAL('containment-scope-invalid'));
      const method = typeof input.method === 'string' && QNC_CONTAINMENT_METHOD_BY_KEY[input.method] ? input.method : null;
      if (!method) return fail('Declare the control that was actually applied. The register records an attestation, and an attestation needs a method.', 'method', REFUSAL('containment-method-invalid'));
      const scopeRef = reference(input.scopeRef);
      if (!scopeRef) return fail(`Give the written hold reference, in at least ${L.refMin} characters — the quarantine sheet, the system block id, the stop notice. A hold with no reference cannot be audited.`, 'scopeRef', REFUSAL('hold-ref-missing'));
      const evidenceRef = reference(input.evidenceRef);
      if (!evidenceRef) return fail(`Give the evidence reference for the containment, in at least ${L.refMin} characters.`, 'evidenceRef', REFUSAL('evidence-missing'));
      const note = prose(input.note);
      if (!note) return fail(`Describe what was actually done, in at least ${L.textMin} characters.`, 'note', REFUSAL('note-missing'));

      const id = idFactory('qnc-hold');
      const stored = normalizeQncContainments([...rows('qncContainments'), {
        id,
        caseId,
        scope,
        method,
        scopeRef,
        evidenceRef,
        note,
        byId: check.actorId,
        recordedAt: check.at.toISOString(),
      }], loadedCases(), check.at, []).find((item) => item.id === id) || null;
      if (!stored) return fail(QNC_REFUSALS.unreadable, 'scopeRef', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.qncContainments = Array.isArray(draft.qncContainments) ? draft.qncContainments : [];
        draft.qncContainments.push(stored);
      }, {
        type: QNC_EVENTS.CONTAINMENT_RECORDED,
        entity: 'workspace',
        entityId: row.case.caseRef,
        summary: `Containment attested (${scope}) on ${row.case.caseRef} against hold ${scopeRef}. This is a recorded attestation, not an enforced physical or system hold (${QNC_ROUTE}).`.slice(0, 300),
      });

      const after = caseRow(caseId).row;
      const warning = scope === 'partial' && after && !after.fullContainment
        ? 'The latest attestation covers only part of the identified output, so the case is NOT fully contained — even if an earlier attestation said it was. The newest evidence governs.'
        : null;
      return saved({ id, containment: stored, warning });
    },

    /* --------------------------------------------------------------- disposition */

    qncSignDisposition(input = {}) {
      const check = seatFor(QNC_RIGHTS.DECIDE);
      if (!check.ok) return check;
      const caseId = clean(input.caseId, 120);
      const { row } = caseRow(caseId);
      if (!row) return fail(QNC_REFUSALS.notFound, 'caseId', REFUSAL('case-not-found'));
      if (row.terminal) return fail('That case is already closed by a completed disposition. Nothing was saved.', 'caseId', REFUSAL('case-terminal'));
      if (!row.fullContainment) return fail(QNC_REFUSALS.noHold, 'caseId', REFUSAL('containment-missing'));
      if (!row.authority?.resolved) return fail(`${QNC_REFUSALS.noAuthority} ${row.authority?.reason || ''}`.trim(), 'caseId', REFUSAL('authority-unresolved'));

      const apexIds = [...(row.authority.apexIds || [])].sort();
      if (!check.seat.fullAccess && !apexIds.includes(check.actorId)) {
        return fail(QNC_REFUSALS.notApex, 'caseId', REFUSAL('not-apex'));
      }

      const decisionRound = Number.isInteger(input.decisionRound) ? input.decisionRound : row.nextDecisionRound;
      if (decisionRound !== row.nextDecisionRound) {
        return fail(`${QNC_REFUSALS.roundClosed} The open round is ${row.nextDecisionRound}.`, 'decisionRound', REFUSAL('round-closed'));
      }
      const already = (row.decisions || []).some((item) => item.routeKey === row.currentRouteKey
        && item.decisionRound === decisionRound && item.decidedById === check.actorId);
      if (already && !check.seat.fullAccess) return fail(QNC_REFUSALS.alreadySigned, 'caseId', REFUSAL('already-signed'));

      const disposition = typeof input.disposition === 'string' && QNC_DISPOSITION_BY_KEY[input.disposition]
        ? input.disposition : null;
      if (!disposition) return fail('Choose the disposition: rework, return, scrap or use-as-is under a written concession.', 'disposition', REFUSAL('disposition-invalid'));
      const reason = prose(input.reason);
      if (!reason) return fail(`Write the reason for this disposition, in at least ${L.textMin} characters. The signature is a decision, and a decision is written.`, 'reason', REFUSAL('reason-missing'));
      const concessionRef = disposition === 'use-as-is' ? reference(input.concessionRef) : null;
      if (disposition === 'use-as-is' && !concessionRef) {
        return fail(QNC_REFUSALS.concessionMissing, 'concessionRef', REFUSAL('concession-missing'));
      }
      if (disposition !== 'use-as-is' && input.concessionRef) {
        return fail('A concession reference belongs only to a use-as-is disposition. Nothing was saved.', 'concessionRef', REFUSAL('concession-unexpected'));
      }

      const id = idFactory('qnc-decision');
      const routeKey = apexIds.join('|');
      const decisions = [...rows('qncDecisions'), {
        id,
        caseId,
        decisionRound,
        routeIds: apexIds,
        routeKey,
        disposition,
        reason,
        concessionRef,
        decidedById: check.actorId,
        decidedAt: check.at.toISOString(),
      }];
      const state = ledger();
      const stored = normalizeQncDecisions(decisions, state.cases, state.containments, check.at, []).find((item) => item.id === id) || null;
      if (!stored) return fail(QNC_REFUSALS.unreadable, 'disposition', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.qncDecisions = Array.isArray(draft.qncDecisions) ? draft.qncDecisions : [];
        draft.qncDecisions.push(stored);
      }, {
        type: QNC_EVENTS.DISPOSITION_SIGNED,
        entity: 'workspace',
        entityId: row.case.caseRef,
        summary: `Disposition ${disposition} signed on ${row.case.caseRef} in round ${decisionRound} by one of ${apexIds.length} required joint seat(s). The case state is derived on read (${QNC_ROUTE}).`.slice(0, 300),
      });

      const after = caseRow(caseId).row;
      const warning = after?.state?.key === 'awaiting-joint-approval'
        ? `Signature recorded. The decision is not complete: ${apexIds.filter((apexId) => !(after.currentGroup || []).some((item) => item.decidedById === apexId)).length} required joint seat(s) have not signed this round. Nothing may be carried out until they do.`
        : null;
      return saved({ id, decision: stored, warning });
    },

    /* ------------------------------------------------------------ the act itself */

    qncRecordDispositionAct(input = {}) {
      const check = seatFor(QNC_RIGHTS.ACT);
      if (!check.ok) return check;
      const caseId = clean(input.caseId, 120);
      const { row } = caseRow(caseId);
      if (!row) return fail(QNC_REFUSALS.notFound, 'caseId', REFUSAL('case-not-found'));
      if (!carriesCase(check, row)) return fail(QNC_REFUSALS.notYourCase, 'caseId', REFUSAL('not-your-case'));

      const kind = typeof input.kind === 'string' && QNC_ACT_KIND_BY_KEY[input.kind] ? input.kind : null;
      if (!kind) return fail('Choose the act being recorded.', 'kind', REFUSAL('act-kind-invalid'));
      if (!(row.allowedActKinds || []).includes(kind)) {
        const waiting = (row.allowedActKinds || []).map((key) => QNC_ACT_KIND_BY_KEY[key]?.label || key);
        return fail(`${QNC_REFUSALS.actNotAllowed} The register is waiting for: ${waiting.length ? waiting.join(', ') : 'no act — the current state permits none'}.`, 'kind', REFUSAL('act-not-allowed'));
      }

      const evidenceRef = reference(input.evidenceRef);
      if (!evidenceRef) return fail(`Give the evidence reference for this act, in at least ${L.refMin} characters.`, 'evidenceRef', REFUSAL('evidence-missing'));
      const note = prose(input.note);
      if (!note) return fail(`Describe what was done, in at least ${L.textMin} characters.`, 'note', REFUSAL('note-missing'));

      const sequence = (rows('qncDispositionActs') || [])
        .filter((item) => item && item.caseId === caseId && Number.isInteger(item.sequence))
        .reduce((max, item) => Math.max(max, item.sequence), 0) + 1;

      const id = idFactory('qnc-act');
      const state = ledger();
      const stored = normalizeQncDispositionActs([...rows('qncDispositionActs'), {
        id,
        caseId,
        routeKey: row.currentRouteKey,
        decisionRound: row.currentRound,
        sequence,
        kind,
        evidenceRef,
        note,
        performedById: check.actorId,
        performedAt: check.at.toISOString(),
      }], state.cases, state.decisions, check.at, []).find((item) => item.id === id) || null;
      if (!stored) return fail(QNC_REFUSALS.unreadable, 'kind', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.qncDispositionActs = Array.isArray(draft.qncDispositionActs) ? draft.qncDispositionActs : [];
        draft.qncDispositionActs.push(stored);
      }, {
        type: QNC_EVENTS.DISPOSITION_ACT_RECORDED,
        entity: 'workspace',
        entityId: row.case.caseRef,
        summary: `Disposition act ${kind} recorded on ${row.case.caseRef} in round ${row.currentRound}. Release is a separate act and is never inferred (${QNC_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, act: stored });
    },

    /* -------------------------------------------------------------- verification */

    qncVerifyRework(input = {}) {
      const check = seatFor(QNC_RIGHTS.VERIFY);
      if (!check.ok) return check;
      const caseId = clean(input.caseId, 120);
      const { row } = caseRow(caseId);
      if (!row) return fail(QNC_REFUSALS.notFound, 'caseId', REFUSAL('case-not-found'));
      const completion = row.currentCompletion;
      if (!completion) {
        return fail('That case has no recorded rework completion, so there is nothing to re-verify.', 'caseId', REFUSAL('no-completion'));
      }
      if (row.state.key !== 'reverification-pending') {
        return fail(`${QNC_REFUSALS.actNotAllowed} Re-verification is recorded only while the register is waiting for exactly that. Current state: ${row.state.label}.`, 'caseId', REFUSAL('verification-not-owed'));
      }

      const outcome = input.outcome === 'pass' || input.outcome === 'fail' ? input.outcome : null;
      if (!outcome) return fail(QNC_REFUSALS.outcomeInvalid, 'outcome', REFUSAL('outcome-invalid'));
      const evidenceRef = reference(input.evidenceRef);
      if (!evidenceRef) return fail(`Give the evidence reference for the re-verification, in at least ${L.refMin} characters.`, 'evidenceRef', REFUSAL('evidence-missing'));
      const note = prose(input.note);
      if (!note) return fail(`Describe what was re-verified and how, in at least ${L.textMin} characters.`, 'note', REFUSAL('note-missing'));

      // STRICT SENIORITY, ON THE WRITE PATH. The reader applies the same rule to
      // every stored row, so an imported self-verification is printed and never
      // counted — but nothing this door accepts was ever allowed to be one.
      let matrix = null;
      try { matrix = buildMatrix(store.state, { now: check.at, settings: { ...check.cfg, activeSeatId: null } }); } catch { matrix = null; }
      if (!check.seat.fullAccess) {
        const seniority = qncVerificationSeniority(matrix, completion, { performedById: completion.performedById, verifiedById: check.actorId });
        if (!seniority.ok) return fail(`${QNC_REFUSALS.verifierNotSenior} ${seniority.reason}`, 'caseId', REFUSAL('verifier-not-senior'));
      }

      const id = idFactory('qnc-verify');
      const state = ledger();
      const stored = normalizeQncVerifications([...rows('qncVerifications'), {
        id,
        caseId,
        routeKey: completion.routeKey,
        decisionRound: completion.decisionRound,
        completionId: completion.id,
        outcome,
        evidenceRef,
        note,
        verifiedById: check.actorId,
        verifiedAt: check.at.toISOString(),
      }], state.cases, state.acts, check.at, []).find((item) => item.id === id) || null;
      if (!stored) return fail(QNC_REFUSALS.unreadable, 'outcome', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.qncVerifications = Array.isArray(draft.qncVerifications) ? draft.qncVerifications : [];
        draft.qncVerifications.push(stored);
      }, {
        type: QNC_EVENTS.REVERIFICATION_RECORDED,
        entity: 'workspace',
        entityId: row.case.caseRef,
        summary: `Re-verification ${outcome} recorded on ${row.case.caseRef} by a strictly senior independent hand. A pass does not release the output; release is its own act (${QNC_ROUTE}).`.slice(0, 300),
      });

      const after = caseRow(caseId).row;
      const warning = outcome === 'fail'
        ? 'The output FAILED re-verification. The failure is retained on the record and the lot stays held: the register now owes a new disposition round (rework again, return or scrap).'
        : after?.state?.key === 'release-pending'
          ? 'Re-verification passed. The output is NOT released by this act: record the separate release act.'
          : null;
      return saved({ id, verification: stored, warning });
    },

    /* ------------------------------------------------------------------- reads */

    qncReport() {
      const check = readCheck();
      if (!check.ok) return check;
      return { ok: true, report: buildProductNonconformance(store.state, { now: check.at, settings: check.cfg, seat: check.seat }) };
    },

    qncAttention() {
      const check = readCheck();
      if (!check.ok) return check;
      const report = buildProductNonconformance(store.state, { now: check.at, settings: check.cfg, seat: check.seat });
      return { ok: true, attention: report.attention, totals: report.totals, asOf: report.asOf };
    },

    qncCandidates() {
      const check = readCheck();
      if (!check.ok) return check;
      const people = rows('people')
        .filter((row) => row && row.id && row.status !== 'archived')
        .filter((row) => holdsPerson(check, row.id))
        .map((row) => ({ id: row.id, name: row.name || row.id, role: row.role || '' }))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
      return { ok: true, people };
    },

    /* ------------------------------------------------------------- conventions */

    qncSetConventions(patch = {}) {
      const check = seatFor(QNC_RIGHTS.GOVERN);
      if (!check.ok) return check;
      const current = normalizeQncSettings(settings());
      const known = new Set(Object.values(QNC_SETTING_KEYS));
      for (const key of Object.keys(patch || {})) {
        if (!known.has(key)) return fail(`Unknown convention “${String(key).slice(0, 60)}”. Nothing was saved.`, key, REFUSAL('unknown-setting'));
      }
      const next = { ...current };
      for (const [key, value] of Object.entries(patch || {})) {
        if (key === QNC_SETTING_KEYS.autoPropagate) { next[key] = value !== false; continue; }
      }
      writeDraft((draft) => {
        draft.settings = { ...(draft.settings || {}), ...next };
      }, {
        type: QNC_EVENTS.CONVENTIONS_SET,
        entity: 'workspace',
        entityId: QNC_ROUTE,
        summary: `Product-nonconformance conventions re-declared: whether the rule may file asks (${QNC_ROUTE}). No disposition, containment or release default exists to set.`.slice(0, 300),
      });
      return saved({ conventions: normalizeQncSettings(store.state.settings || {}) });
    },

    qncScan() {
      const check = seatFor(QNC_RIGHTS.GOVERN);
      if (!check.ok) return check;
      writeDraft((draft) => {
        draft.qncMarkers = Array.isArray(draft.qncMarkers) ? draft.qncMarkers : [];
        normalizeQncMarkers(draft.qncMarkers, check.at, []);
      }, {
        type: QNC_EVENTS.SCANNED,
        entity: 'workspace',
        entityId: QNC_ROUTE,
        summary: `Product-nonconformance register scanned; the rule re-reads every case, containment attestation, signature, act and re-verification (${QNC_ROUTE}).`.slice(0, 300),
      });
      return saved({});
    },
  };
}

export default createProductNonconformanceActions;
