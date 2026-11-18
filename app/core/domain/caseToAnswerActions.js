/**
 * app/core/domain/caseToAnswerActions.js — the seat-checked commands of the
 * Fair-Process Discipline & Grievance Register (ADR-0254, Schema v207).
 *
 * EIGHT human acts and a scan: OPEN a case with its written allegation(s),
 * ASSIGN an independent investigator holding terms of reference, RECORD a
 * direction, RECORD a written finding against one allegation, DECIDE the sanction,
 * LODGE an appeal, DECIDE the appeal, WITHDRAW a case — plus re-declare the
 * conventions and run the explicit scan. Every state, verdict and count is
 * re-derived on read by `caseToAnswer.js`; nothing derived is stored, and no
 * command below can write a state.
 *
 * THE DOOR IS THE PRODUCT, AND EVERY REFUSAL HERE IS A CONTROL:
 *
 *  - A CASE needs a declared kind, a subject, a written basis reference, the
 *    standard of proof it will be judged on, and at least one written allegation
 *    carrying its class, its written statement, the WRITTEN STANDARD it is tested
 *    against and an evidence reference. An allegation with no standard is an
 *    opinion; an allegation with no evidence is a rumour.
 *
 *  - INDEPENDENCE IS COMPUTED AT THE DOOR, NOT DECLARED BY THE CALLER. The
 *    investigator must hold neither party on an active line, must not be held by
 *    either party, must not be a party, and must be STRICTLY SENIOR to the
 *    subject on the live graph. This is the same pure rule the reader applies, so
 *    an imported row that offends it is kept, printed and marked unreliable — but
 *    a human using this workspace cannot create one.
 *
 *  - A FINDING IS ONE PER ALLEGATION, ON THE CASE'S OWN STANDARD. A second finding
 *    for the same allegation is refused (a revision is a new case); a finding that
 *    names any other standard of proof is refused, because a case that moves its
 *    burden after seeing the evidence has changed the test.
 *
 *  - A DECISION NEEDS EVERY ALLEGATION FINDING COMPLETE and a decider STRICTLY
 *    SENIOR to the investigator. The computed ladder rung is returned to the
 *    caller and recorded WITH the departure and its written reason, so a
 *    consistency departure is a fact on the record and not a silent choice.
 *
 *  - AN APPEAL NEEDS A DECISION, AND ITS DECIDER MUST BE A DIFFERENT HAND STRICTLY
 *    SENIOR TO THE DECISION-MAKER. The appeal outcome is a separate ledger row and
 *    never mutates the decision.
 *
 *  - A WITHDRAWAL NEEDS A DECLARED REASON AND A WRITTEN BASIS, and never clears the
 *    subject.
 *
 * WHAT NO COMMAND CAN DO. There is no command that sets a case state, marks a
 * person guilty, infers a sanction from a finding, overwrites a decision, deletes
 * a finding (even an unreliable one), decides an appeal by the hand that decided
 * the case, or records a withdrawal with no reason. There is no score, rank or
 * rate for any person anywhere in this file.
 */

import { dayKey } from '../time.js';
import { buildSeats, activeSeat, canAct } from './seat.js';
import { buildMatrix, matrixLineScopeFor } from './matrix.js';
import { buildCaseToAnswer, dgiIndependence, dgiStrictlySeniorTo } from './caseToAnswer.js';
import {
  DGI_ALLEGATION_CLASS_BY_KEY,
  DGI_CASE_KIND_BY_KEY,
  DGI_DIRECTION_KIND_BY_KEY,
  DGI_EVENTS,
  DGI_FINDING_BY_KEY,
  DGI_LIMITS as L,
  DGI_REFUSALS,
  DGI_RIGHTS,
  DGI_ROUTE,
  DGI_SANCTION_BY_KEY,
  DGI_STANDARD_BY_KEY,
  DGI_WITHDRAWAL_REASON_BY_KEY,
} from './caseToAnswerRegistry.js';
import {
  normalizeDgiAllegations,
  normalizeDgiAppealOutcomes,
  normalizeDgiAppeals,
  normalizeDgiCases,
  normalizeDgiDecisions,
  normalizeDgiDirections,
  normalizeDgiFindings,
  normalizeDgiInvestigators,
  normalizeDgiSettings,
  normalizeDgiWithdrawals,
} from './caseToAnswerSchema.js';

const REFUSAL = (key) => `fair-process:${key}`;
const clean = (value, max) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const shortText = (value, min = L.shortMin, max = L.shortMax) => {
  const text = clean(value, max + 1);
  return text.length >= min && text.length <= max ? text : null;
};
const reference = (value) => shortText(value, L.refMin, L.refMax);
const prose = (value) => shortText(value, L.textMin, L.textMax);

export function createCaseToAnswerActions(store, { now, idFactory }) {
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
    if (check.seat.readOnly) return fail(DGI_REFUSALS.notSeated);
    const verdict = canAct(right, check.seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, ...check };
  }

  /** A read is a SAFE_READ at the gateway, so the right is re-proved HERE. */
  function readCheck() {
    const check = seatContext();
    if (check.seat.readOnly) return fail(DGI_REFUSALS.notSeated);
    const verdict = canAct(DGI_RIGHTS.READ, check.seat);
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

  function matrixNow(check) {
    try {
      return buildMatrix(store.state, { now: check.at, settings: { ...check.cfg, activeSeatId: null } });
    } catch {
      return null;
    }
  }

  /* ------------------------------------------------------- loaded in dependency order */

  function ledger() {
    const at = clock();
    const allegations = normalizeDgiAllegations(rows('dgiAllegations'), at, []);
    const cases = normalizeDgiCases(rows('dgiCases'), allegations, rows('people'), at, []);
    const investigators = normalizeDgiInvestigators(rows('dgiInvestigators'), cases, at, []);
    const findings = normalizeDgiFindings(rows('dgiFindings'), cases, allegations, at, []);
    const decisions = normalizeDgiDecisions(rows('dgiDecisions'), cases, at, []);
    const appeals = normalizeDgiAppeals(rows('dgiAppeals'), cases, decisions, at, []);
    return { at, allegations, cases, investigators, findings, decisions, appeals };
  }

  /** The derived row for one case, from the same reader the panel and CSV use. */
  function caseRow(caseId) {
    const report = buildCaseToAnswer(store.state, { now: clock(), settings: settings(), seat: null });
    return { report, row: (report.rows || []).find((item) => item.case?.id === caseId) || null };
  }

  /** The actor must declare the case, hold a party, carry a duty on it, or be its apex. */
  function carriesCase(check, row) {
    if (!row) return false;
    if (check.seat.fullAccess) return true;
    const actorId = check.actorId;
    if (!actorId) return false;
    if (row.case.declaredById === actorId) return true;
    if (row.case.subjectId === actorId || row.case.raisedById === actorId) return true;
    if (row.investigator?.investigatorId === actorId) return true;
    if (row.decision?.decidedById === actorId) return true;
    if (row.appealOutcome?.decidedById === actorId) return true;
    if ((row.authority?.apexIds || []).includes(actorId)) return true;
    if (holdsPerson(check, row.case.subjectId) || holdsPerson(check, row.case.raisedById)) return true;
    return false;
  }

  /** A day the event already happened on, and therefore cannot be in the future. */
  function pastDay(check, value, field) {
    const day = clean(value, 40);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || dayKey(`${day}T00:00:00.000Z`) !== day) {
      return { error: fail('Give a real calendar day (YYYY-MM-DD).', field, REFUSAL('day-invalid')) };
    }
    if (day > check.today) {
      return { error: fail(DGI_REFUSALS.dayFuture, field, REFUSAL('day-future')) };
    }
    return { day };
  }

  /** Read one allegation from free input, refusing rather than defaulting. */
  function allegationInput(raw, index) {
    const field = (name) => (raw && typeof raw === 'object' ? raw[name] : undefined);
    const classKey = DGI_ALLEGATION_CLASS_BY_KEY[field('classKey')] ? field('classKey') : null;
    if (!classKey) {
      return { error: fail(`Allegation ${index + 1}: declare its class from the closed list. The register never guesses a class from the words used.`, `allegations.${index}.classKey`, REFUSAL('allegation-class-invalid')) };
    }
    const statement = prose(field('statement'));
    if (!statement) {
      return { error: fail(`Allegation ${index + 1}: state what is said to have happened, in at least ${L.textMin} characters.`, `allegations.${index}.statement`, REFUSAL('allegation-statement-missing')) };
    }
    const standardRef = reference(field('standardRef'));
    if (!standardRef) {
      return { error: fail(`Allegation ${index + 1}: give the reference of the WRITTEN standard it is tested against, in at least ${L.refMin} characters. An allegation with no standard has nothing to fall short of.`, `allegations.${index}.standardRef`, REFUSAL('allegation-standard-ref-missing')) };
    }
    const standardText = prose(field('standardText'));
    if (!standardText) {
      return { error: fail(`Allegation ${index + 1}: quote the standard in written terms, in at least ${L.textMin} characters.`, `allegations.${index}.standardText`, REFUSAL('allegation-standard-text-missing')) };
    }
    const evidenceRef = reference(field('evidenceRef'));
    if (!evidenceRef) {
      return { error: fail(`Allegation ${index + 1}: give the evidence reference it rests on, in at least ${L.refMin} characters. The register stores a pointer to evidence, never the evidence itself.`, `allegations.${index}.evidenceRef`, REFUSAL('allegation-evidence-missing')) };
    }
    return { ok: true, value: { classKey, statement, standardRef, standardText, evidenceRef } };
  }

  function writeDraft(mutate, event) {
    store.update((draft) => { mutate(draft); }, event);
  }

  return {
    /* ---------------------------------------------------------------------- open */

    dgiOpen(input = {}) {
      const check = seatFor(DGI_RIGHTS.OPEN);
      if (!check.ok) return check;
      const { cases, allegations } = ledger();
      if (cases.length >= L.cases) return fail(DGI_REFUSALS.ledgerFull, null, REFUSAL('ledger-full'));

      const caseRef = shortText(input.caseRef);
      if (!caseRef) return fail(`Give the case reference, in ${L.shortMin}–${L.shortMax} characters.`, 'caseRef', REFUSAL('ref-invalid'));
      if (cases.some((row) => row.caseRef.toLocaleLowerCase('en-US') === caseRef.toLocaleLowerCase('en-US'))) {
        return fail('That case reference is already on the register. One case per matter; a second case with the same reference makes every act ambiguous.', 'caseRef', REFUSAL('ref-duplicate'));
      }
      const caseKind = DGI_CASE_KIND_BY_KEY[input.caseKind] ? input.caseKind : null;
      if (!caseKind) return fail('Declare whether this is a conduct case, a grievance about treatment, or a grievance about an earlier decision.', 'caseKind', REFUSAL('kind-invalid'));
      const standardOfProof = DGI_STANDARD_BY_KEY[input.standardOfProof] ? input.standardOfProof : null;
      if (!standardOfProof) {
        return fail('Declare the standard of proof this case will be judged on. It is fixed at opening and cannot change afterwards — a case that swaps its burden after seeing the evidence has changed the test.', 'standardOfProof', REFUSAL('standard-invalid'));
      }

      const subjectId = clean(input.subjectId, 120);
      const subject = rows('people').find((row) => row && row.id === subjectId) || null;
      if (!subject) return fail(DGI_REFUSALS.partyInvalid, 'subjectId', REFUSAL('subject-not-found'));
      if (!holdsPerson(check, subjectId)) return fail(`${subject.name || subjectId} is not on a line this seat holds. ${DGI_REFUSALS.noReach}`, 'subjectId', REFUSAL('subject-not-your-person'));

      const raisedRaw = clean(input.raisedById, 120);
      let raisedById = null;
      if (raisedRaw) {
        const raiser = rows('people').find((row) => row && row.id === raisedRaw) || null;
        if (!raiser) return fail(DGI_REFUSALS.partyInvalid, 'raisedById', REFUSAL('raiser-not-found'));
        if (raisedRaw === subjectId) {
          return fail('One person cannot be both the subject of a case and the person who raised it. Name the two different people, or leave the raiser blank where nobody is named.', 'raisedById', REFUSAL('parties-same'));
        }
        raisedById = raisedRaw;
      }

      const basisRef = reference(input.basisRef);
      if (!basisRef) return fail(`Give the reference of the written instruction, procedure or report this case rests on, in at least ${L.refMin} characters. A case with no written basis is somebody’s recollection.`, 'basisRef', REFUSAL('basis-missing'));

      const opened = pastDay(check, input.openedOn || check.today, 'openedOn');
      if (opened.error) return opened.error;

      // AT LEAST ONE ALLEGATION, EACH WITH ITS OWN STANDARD AND EVIDENCE.
      const rawAllegations = Array.isArray(input.allegations) ? input.allegations : [];
      if (!rawAllegations.length) return fail(DGI_REFUSALS.nonEmptyStart, 'allegations', REFUSAL('allegations-empty'));
      if (rawAllegations.length > L.allegationsPerCaseMax) {
        return fail(`A case carries at most ${L.allegationsPerCaseMax} allegations. Split it into separate cases.`, 'allegations', REFUSAL('allegations-too-many'));
      }
      const parsed = [];
      for (let index = 0; index < rawAllegations.length; index += 1) {
        const one = allegationInput(rawAllegations[index], index);
        if (!one.ok) return one.error;
        parsed.push(one.value);
      }

      const caseId = idFactory('dgi-case');
      const caseRowNew = {
        id: caseId,
        caseRef,
        caseKind,
        // The hand that opened the case is the supervisor who set the standard and
        // the directions. It is declared, never read off the org chart.
        supervisorRef: reference(input.supervisorRef) || null,
        standardOfProof,
        subjectId,
        raisedById,
        basisRef,
        basisText: prose(input.basisText) || '',
        openedOn: opened.day,
        declaredById: check.actorId,
        createdAt: check.at.toISOString(),
      };
      const allegationRows = parsed.map((value, index) => ({
        id: idFactory('dgi-alleg'),
        caseId,
        classKey: value.classKey,
        statement: value.statement,
        standardRef: value.standardRef,
        standardText: value.standardText,
        evidenceRef: value.evidenceRef,
        raisedOn: opened.day,
        sequence: index + 1,
        createdAt: check.at.toISOString(),
      }));

      const storedCases = normalizeDgiCases([...rows('dgiCases'), caseRowNew], [...rows('dgiAllegations'), ...allegationRows], rows('people'), check.at, []);
      const storedCase = storedCases.find((row) => row.id === caseId) || null;
      if (!storedCase) return fail(DGI_REFUSALS.unreadable, 'caseRef', REFUSAL('unreadable'));
      const storedAllegations = normalizeDgiAllegations([...rows('dgiAllegations'), ...allegationRows], check.at, [])
        .filter((row) => row.caseId === caseId);
      if (storedAllegations.length !== allegationRows.length) return fail(DGI_REFUSALS.unreadable, 'allegations', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.dgiCases = Array.isArray(draft.dgiCases) ? draft.dgiCases : [];
        draft.dgiCases.push(storedCase);
        draft.dgiAllegations = Array.isArray(draft.dgiAllegations) ? draft.dgiAllegations : [];
        draft.dgiAllegations.push(...storedAllegations);
      }, {
        type: DGI_EVENTS.OPENED,
        entity: 'workspace',
        entityId: caseRef,
        summary: `Fair-process ${DGI_CASE_KIND_BY_KEY[caseKind].label} ${caseRef} opened on ${opened.day} with ${storedAllegations.length} written allegation(s) against ${DGI_STANDARD_BY_KEY[standardOfProof].label}. State is derived on read (${DGI_ROUTE}).`.slice(0, 300),
      });
      return saved({ id: caseId, case: storedCase, allegations: storedAllegations, ladderHint: null });
    },

    /**
     * The allegations of one case, for the panel's own display, already scoped by
     * the same reader that scopes the case. Never a second registry read.
     */
    dgiCaseDetail(input = {}) {
      const check = readCheck();
      if (!check.ok) return check;
      const caseId = clean(input.caseId, 120);
      const { row } = caseRow(caseId);
      if (!row) return fail(DGI_REFUSALS.notFound, 'caseId', REFUSAL('case-not-found'));
      if (!carriesCase(check, row) && !row.authority.apexIds.includes(check.actorId)) {
        return fail(DGI_REFUSALS.notYourCase, 'caseId', REFUSAL('not-your-case'));
      }
      return { ok: true, row };
    },

    /* ---------------------------------------------------------------- assignment */

    dgiAssignInvestigator(input = {}) {
      const check = seatFor(DGI_RIGHTS.ASSIGN);
      if (!check.ok) return check;
      const caseId = clean(input.caseId, 120);
      const { row } = caseRow(caseId);
      if (!row) return fail(DGI_REFUSALS.notFound, 'caseId', REFUSAL('case-not-found'));
      if (!carriesCase(check, row)) return fail(DGI_REFUSALS.notYourCase, 'caseId', REFUSAL('not-your-case'));
      if (row.terminal) return fail('That case is closed. A closed case accepts no new investigator; a revised finding needs a new case.', 'caseId', REFUSAL('case-terminal'));

      const investigatorId = clean(input.investigatorId, 120);
      const person = rows('people').find((item) => item && item.id === investigatorId) || null;
      if (!person) return fail('That person is not on this workspace.', 'investigatorId', REFUSAL('investigator-not-found'));
      if (person.status === 'archived') return fail(`${person.name || investigatorId} is archived and cannot be assigned a live case.`, 'investigatorId', REFUSAL('investigator-archived'));

      const matrix = matrixNow(check);
      const parties = [row.case.subjectId, row.case.raisedById].filter(Boolean);
      const independence = dgiIndependence(matrix, investigatorId, parties);
      if (!independence.ok) {
        return fail(`${DGI_REFUSALS.investigatorNotIndependent} ${independence.reason}`, 'investigatorId', REFUSAL('investigator-not-independent'));
      }
      const seniority = dgiStrictlySeniorTo(matrix, investigatorId, row.case.subjectId);
      if (!seniority.ok) {
        return fail(`${DGI_REFUSALS.investigatorNotSenior} ${seniority.reason}`, 'investigatorId', REFUSAL('investigator-not-senior'));
      }

      const termsRef = reference(input.termsRef);
      if (!termsRef) return fail(`Give the reference of the written terms of reference, in at least ${L.refMin} characters. An investigator without terms is investigating something nobody defined.`, 'termsRef', REFUSAL('terms-missing'));
      const termsText = prose(input.termsText);
      if (!termsText) return fail(`State what the investigator is asked to decide, in at least ${L.textMin} characters.`, 'termsText', REFUSAL('terms-text-missing'));
      const assigned = pastDay(check, input.assignedOn || check.today, 'assignedOn');
      if (assigned.error) return assigned.error;
      if (assigned.day < row.case.openedOn) {
        return fail('The investigation cannot be assigned before the case was opened.', 'assignedOn', REFUSAL('assign-before-open'));
      }

      const id = idFactory('dgi-inv');
      const stored = normalizeDgiInvestigators([...rows('dgiInvestigators'), {
        id,
        caseId,
        investigatorId,
        termsRef,
        termsText,
        assignedOn: assigned.day,
        assignedById: check.actorId,
        createdAt: check.at.toISOString(),
      }], rows('dgiCases'), check.at, []).find((item) => item.id === id) || null;
      if (!stored) return fail(DGI_REFUSALS.unreadable, 'investigatorId', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.dgiInvestigators = Array.isArray(draft.dgiInvestigators) ? draft.dgiInvestigators : [];
        draft.dgiInvestigators.push(stored);
      }, {
        type: DGI_EVENTS.INVESTIGATOR_SET,
        entity: 'workspace',
        entityId: row.case.caseRef,
        summary: `An investigator independent of both parties and strictly senior to the subject was assigned to ${row.case.caseRef} on ${assigned.day}. Independence and seniority were computed from the live graph, not declared. (${DGI_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, investigator: stored });
    },

    dgiRecordDirection(input = {}) {
      const check = seatFor(DGI_RIGHTS.ASSIGN);
      if (!check.ok) return check;
      const caseId = clean(input.caseId, 120);
      const { row } = caseRow(caseId);
      if (!row) return fail(DGI_REFUSALS.notFound, 'caseId', REFUSAL('case-not-found'));
      if (!carriesCase(check, row)) return fail(DGI_REFUSALS.notYourCase, 'caseId', REFUSAL('not-your-case'));
      if (row.terminal) return fail('That case is closed. A closed case accepts no new direction.', 'caseId', REFUSAL('case-terminal'));
      const kind = DGI_DIRECTION_KIND_BY_KEY[input.kind] ? input.kind : null;
      if (!kind) return fail('Declare which direction was recorded, from the closed list.', 'kind', REFUSAL('direction-kind-invalid'));
      const note = prose(input.note);
      if (!note) return fail(`Describe what was recorded, in at least ${L.textMin} characters.`, 'note', REFUSAL('direction-note-missing'));
      const recorded = pastDay(check, input.recordedOn || check.today, 'recordedOn');
      if (recorded.error) return recorded.error;
      if (recorded.day < row.case.openedOn) return fail('A direction cannot be dated before the case was opened.', 'recordedOn', REFUSAL('direction-before-open'));

      const id = idFactory('dgi-dir');
      const stored = normalizeDgiDirections([...rows('dgiDirections'), {
        id, caseId, kind, note, recordedOn: recorded.day, recordedById: check.actorId, createdAt: check.at.toISOString(),
      }], rows('dgiCases'), check.at, []).find((item) => item.id === id) || null;
      if (!stored) return fail(DGI_REFUSALS.unreadable, 'kind', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.dgiDirections = Array.isArray(draft.dgiDirections) ? draft.dgiDirections : [];
        draft.dgiDirections.push(stored);
      }, {
        type: DGI_EVENTS.DIRECTIONS_SET,
        entity: 'workspace',
        entityId: row.case.caseRef,
        summary: `A ${DGI_DIRECTION_KIND_BY_KEY[kind].label.toLowerCase()} was recorded on ${row.case.caseRef} for ${recorded.day}. It is a declaration, not a finding and not a sanction. (${DGI_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, direction: stored });
    },

    /* ------------------------------------------------------------------- findings */

    dgiRecordFinding(input = {}) {
      const check = seatFor(DGI_RIGHTS.FIND);
      if (!check.ok) return check;
      const caseId = clean(input.caseId, 120);
      const { row } = caseRow(caseId);
      if (!row) return fail(DGI_REFUSALS.notFound, 'caseId', REFUSAL('case-not-found'));
      if (!carriesCase(check, row)) return fail(DGI_REFUSALS.notYourCase, 'caseId', REFUSAL('not-your-case'));
      if (row.terminal) return fail(DGI_REFUSALS.findingAfterClose, 'caseId', REFUSAL('case-terminal'));
      if (!row.investigator) return fail('No investigator is assigned to this case, so no finding can be recorded. Assign an independent investigator first.', 'caseId', REFUSAL('no-investigator'));
      if (row.state.key === 'investigator-invalid') {
        return fail(`The recorded investigator is not independent of the parties or not senior to the subject: ${row.investigatorInvalidReason} Reassign the case before recording a finding; a finding from that hand would not count.`, 'caseId', REFUSAL('investigator-invalid'));
      }

      const allegationId = clean(input.allegationId, 120);
      const target = row.allegations.find((item) => item.allegation.id === allegationId) || null;
      if (!target) return fail('That allegation is not on this case. Nothing was saved.', 'allegationId', REFUSAL('allegation-not-found'));
      if (target.finding) return fail(DGI_REFUSALS.findingDuplicate, 'allegationId', REFUSAL('finding-duplicate'));

      const outcome = DGI_FINDING_BY_KEY[input.outcome] ? input.outcome : null;
      if (!outcome) return fail('Record whether the allegation was upheld, partly upheld, not upheld, or no case to answer. The register never infers a verdict from the presence of evidence.', 'outcome', REFUSAL('outcome-invalid'));
      const standardOfProof = clean(input.standardOfProof, 80) || row.case.standardOfProof;
      if (standardOfProof !== row.case.standardOfProof) {
        return fail(`${DGI_REFUSALS.standardLocked} This case is decided on ${DGI_STANDARD_BY_KEY[row.case.standardOfProof].label}; the finding named ${DGI_STANDARD_BY_KEY[standardOfProof]?.label || standardOfProof}.`, 'standardOfProof', REFUSAL('standard-locked'));
      }
      const reason = prose(input.reason);
      if (!reason) return fail(`Write the finding in at least ${L.textMin} characters. A verdict with no written reason cannot be appealed and cannot be reviewed.`, 'reason', REFUSAL('reason-missing'));
      const evidenceRef = reference(input.evidenceRef);
      if (!evidenceRef) return fail(`Give the evidence reference the finding rests on, in at least ${L.refMin} characters.`, 'evidenceRef', REFUSAL('evidence-missing'));
      const found = pastDay(check, input.foundOn || check.today, 'foundOn');
      if (found.error) return found.error;
      if (found.day < row.case.openedOn) return fail('A finding cannot be dated before the case was opened.', 'foundOn', REFUSAL('finding-before-open'));
      if (found.day < row.investigator.assignedOn) return fail('A finding cannot be dated before the investigator was assigned.', 'foundOn', REFUSAL('finding-before-assignment'));

      const id = idFactory('dgi-find');
      const stored = normalizeDgiFindings([...rows('dgiFindings'), {
        id,
        caseId,
        allegationId,
        outcome,
        standardOfProof,
        reason,
        evidenceRef,
        foundOn: found.day,
        foundById: check.actorId,
        createdAt: check.at.toISOString(),
      }], rows('dgiCases'), rows('dgiAllegations'), check.at, []).find((item) => item.id === id) || null;
      if (!stored) return fail(DGI_REFUSALS.unreadable, 'outcome', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.dgiFindings = Array.isArray(draft.dgiFindings) ? draft.dgiFindings : [];
        draft.dgiFindings.push(stored);
      }, {
        type: DGI_EVENTS.FINDING_RECORDED,
        entity: 'workspace',
        entityId: row.case.caseRef,
        summary: `One written finding (${DGI_FINDING_BY_KEY[outcome].label.toLowerCase()}) on one allegation of ${row.case.caseRef}, on ${DGI_STANDARD_BY_KEY[standardOfProof].label}, dated ${found.day}. It is a finding, not a sanction. (${DGI_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, finding: stored });
    },

    /* ------------------------------------------------------------------- decision */

    dgiDecideSanction(input = {}) {
      const check = seatFor(DGI_RIGHTS.DECIDE);
      if (!check.ok) return check;
      const caseId = clean(input.caseId, 120);
      const { row } = caseRow(caseId);
      if (!row) return fail(DGI_REFUSALS.notFound, 'caseId', REFUSAL('case-not-found'));
      if (!carriesCase(check, row)) return fail(DGI_REFUSALS.notYourCase, 'caseId', REFUSAL('not-your-case'));
      if (row.terminal) return fail('That case is closed and accepts no new decision.', 'caseId', REFUSAL('case-terminal'));
      if (row.decision) return fail(DGI_REFUSALS.decisionUnaffected, 'caseId', REFUSAL('decision-exists'));
      if (!row.investigator) return fail('No investigator is assigned, so there is no finding to decide on.', 'caseId', REFUSAL('no-investigator'));
      if (!row.findingsComplete) {
        return fail(`${DGI_REFUSALS.decisionBeforeFindings} ${row.findingsOwedN} allegation(s) still carry no reliable written finding.`, 'caseId', REFUSAL('findings-incomplete'));
      }
      if (!row.caseUpheld) {
        return fail('Every allegation was found not upheld or with no case to answer, so there is nothing to sanction. This case needs no decision — and the register will not manufacture one, because a decision here would read as a sanction that was imposed.', 'caseId', REFUSAL('nothing-to-sanction'));
      }

      const sanction = DGI_SANCTION_BY_KEY[input.sanction] ? input.sanction : null;
      if (!sanction) return fail('Record the sanction from the declared ladder, including “no sanction” where that is the decision.', 'sanction', REFUSAL('sanction-invalid'));
      const reason = prose(input.reason);
      if (!reason) return fail(`Write the decision in at least ${L.textMin} characters. A sanction with no written reason cannot be appealed and cannot be reviewed.`, 'reason', REFUSAL('reason-missing'));
      const decided = pastDay(check, input.decidedOn || check.today, 'decidedOn');
      if (decided.error) return decided.error;
      if (decided.day < row.case.openedOn) return fail('A decision cannot be dated before the case was opened.', 'decidedOn', REFUSAL('decision-before-open'));

      // THE DECIDER MUST BE STRICTLY SENIOR TO THE INVESTIGATOR, AND INDEPENDENT.
      const matrix = matrixNow(check);
      const parties = [row.case.subjectId, row.case.raisedById].filter(Boolean);
      const seniority = dgiStrictlySeniorTo(matrix, check.actorId, row.investigator.investigatorId);
      if (!seniority.ok) {
        return fail(`${DGI_REFUSALS.decisionNotSenior} ${seniority.reason}`, null, REFUSAL('decision-not-senior'));
      }
      const independence = dgiIndependence(matrix, check.actorId, parties);
      if (!independence.ok) {
        return fail(`The decision-maker must also be independent of both parties. ${independence.reason}`, null, REFUSAL('decision-not-independent'));
      }

      // A WARNING RUNG CARRIES ITS OWN END, WHERE THE DECIDER DECLARES ONE.
      //
      // These two days are the ONLY dates in this file that may legitimately be in
      // the future: a warning expires later, and a dismissal often takes effect on a
      // notice date. They are therefore validated as REAL calendar days and ordered
      // against the decision day, not refused as future dates — the register records
      // what was decided on the decision day, and an end date that had already
      // passed on that day is not an end date at all.
      const futureDay = (value, field, label) => {
        const day = clean(value, 40);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || dayKey(`${day}T00:00:00.000Z`) !== day) {
          return { error: fail(`Give ${label} as a real calendar day (YYYY-MM-DD).`, field, REFUSAL('day-invalid')) };
        }
        if (day <= decided.day) {
          return { error: fail(`${label} must fall AFTER the decision day (${decided.day}). A date on or before the decision is not an end date and does not carry the rung.`, field, REFUSAL('day-before-decision')) };
        }
        return { day };
      };
      const expiresOn = input.expiresOn ? futureDay(input.expiresOn, 'expiresOn', 'the expiry day') : null;
      if (expiresOn?.error) return expiresOn.error;
      const effectiveOn = input.effectiveOn ? futureDay(input.effectiveOn, 'effectiveOn', 'the effective day of termination') : null;
      if (effectiveOn?.error) return effectiveOn.error;
      if (sanction === 'dismissal' && !effectiveOn?.day) {
        return fail('A dismissal decision must declare the effective day of termination. That day is the accrual the limitation register reads, and a dismissal with no end date has no clock.', 'effectiveOn', REFUSAL('dismissal-needs-effective-day'));
      }

      // The computed rung is returned AND recorded, so a departure is a fact on
      // the record rather than a choice made quietly.
      const ladder = row.ladder || null;

      const id = idFactory('dgi-dec');
      const stored = normalizeDgiDecisions([...rows('dgiDecisions'), {
        id,
        caseId,
        sanction,
        reason,
        decidedOn: decided.day,
        decidedById: check.actorId,
        expiresOn: expiresOn?.day || null,
        effectiveOn: effectiveOn?.day || null,
        createdAt: check.at.toISOString(),
      }], rows('dgiCases'), check.at, []).find((item) => item.id === id) || null;
      if (!stored) return fail(DGI_REFUSALS.unreadable, 'sanction', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.dgiDecisions = Array.isArray(draft.dgiDecisions) ? draft.dgiDecisions : [];
        draft.dgiDecisions.push(stored);
      }, {
        type: DGI_EVENTS.SANCTION_DECIDED,
        entity: 'workspace',
        entityId: row.case.caseRef,
        summary: `A sanction decision (${DGI_SANCTION_BY_KEY[sanction].label.toLowerCase()}) was recorded on ${row.case.caseRef} for ${decided.day} by a hand strictly senior to the investigator.${ladder?.isDeparture ? ' It departs from the computed ladder rung.' : ''} (${DGI_ROUTE}).`.slice(0, 300),
      });
      // Re-derive so the caller sees the ladder reading AS RECORDED, not as guessed.
      const after = caseRow(caseId).row;
      return saved({
        id,
        decision: stored,
        ladder: after?.ladder || ladder,
        departure: Boolean(after?.ladder?.isDeparture),
        // A late or out-of-ladder choice is a warning, never a silent accept.
        warning: after?.ladder?.isDeparture
          ? `Recorded. The chosen rung is ${after.ladder.chosenRank}; the ladder from this person’s own live record computes rung ${after.ladder.computedRank} (${after.ladder.computed?.label || 'n/a'}). The departure is printed and counted.`
          : null,
      });
    },

    /* --------------------------------------------------------------------- appeal */

    dgiLodgeAppeal(input = {}) {
      const check = seatFor(DGI_RIGHTS.LODGE);
      if (!check.ok) return check;
      const caseId = clean(input.caseId, 120);
      const { row } = caseRow(caseId);
      if (!row) return fail(DGI_REFUSALS.notFound, 'caseId', REFUSAL('case-not-found'));
      // Only a party, the hand that decided, the investigator or the apex may
      // lodge. A seat with no relationship to the case cannot start an appeal on
      // somebody else's behalf.
      const parties = [row.case.subjectId, row.case.raisedById].filter(Boolean);
      const isParty = parties.includes(check.actorId);
      if (!isParty && !check.seat.fullAccess && !carriesCase(check, row)) {
        return fail(DGI_REFUSALS.notYourCase, 'caseId', REFUSAL('not-your-case'));
      }
      if (row.terminal) return fail('That case is closed. A closed case accepts no appeal.', 'caseId', REFUSAL('case-terminal'));
      if (!row.decision) return fail(DGI_REFUSALS.appealNeedsDecision, 'caseId', REFUSAL('no-decision'));
      if (row.appeal) return fail('An appeal is already on the record for this case.', 'caseId', REFUSAL('appeal-exists'));
      const grounds = prose(input.grounds);
      if (!grounds) return fail(`State the grounds of the appeal in at least ${L.textMin} characters. An appeal with no stated grounds asks a senior hand to re-decide without saying what was wrong.`, 'grounds', REFUSAL('grounds-missing'));
      const lodged = pastDay(check, input.lodgedOn || check.today, 'lodgedOn');
      if (lodged.error) return lodged.error;
      if (lodged.day < row.decision.decidedOn) return fail('An appeal cannot be dated before the decision it appeals.', 'lodgedOn', REFUSAL('appeal-before-decision'));

      const id = idFactory('dgi-appeal');
      const stored = normalizeDgiAppeals([...rows('dgiAppeals'), {
        id,
        caseId,
        grounds,
        lodgedOn: lodged.day,
        lodgedById: check.actorId,
        createdAt: check.at.toISOString(),
      }], rows('dgiCases'), rows('dgiDecisions'), check.at, []).find((item) => item.id === id) || null;
      if (!stored) return fail(DGI_REFUSALS.unreadable, 'grounds', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.dgiAppeals = Array.isArray(draft.dgiAppeals) ? draft.dgiAppeals : [];
        draft.dgiAppeals.push(stored);
      }, {
        type: DGI_EVENTS.APPEAL_LODGED,
        entity: 'workspace',
        entityId: row.case.caseRef,
        summary: `An appeal was lodged on ${row.case.caseRef} for ${lodged.day} with written grounds. It now waits for a DIFFERENT hand strictly senior to the decision-maker. (${DGI_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, appeal: stored, late: Boolean(row.appealDaysLeft !== null && lodged.day > row.case.openedOn && row.appealDaysLeft < 0) });
    },

    dgiDecideAppeal(input = {}) {
      const check = seatFor(DGI_RIGHTS.APPEAL);
      if (!check.ok) return check;
      const caseId = clean(input.caseId, 120);
      const { row } = caseRow(caseId);
      if (!row) return fail(DGI_REFUSALS.notFound, 'caseId', REFUSAL('case-not-found'));
      if (!row.investigator || !row.decision) return fail(DGI_REFUSALS.appealNeedsDecision, 'caseId', REFUSAL('no-decision'));
      if (!row.appeal) return fail('No appeal is on the record for this case. Nothing was saved.', 'caseId', REFUSAL('no-appeal'));
      if (row.appealOutcome) return fail(DGI_REFUSALS.appealDecided, 'caseId', REFUSAL('appeal-decided'));

      // INDEPENDENCE AND SENIORITY OF THE APPEAL DECIDER, COMPUTED AT THE DOOR.
      if (row.decision.decidedById === check.actorId) {
        return fail(`${DGI_REFUSALS.appealNotIndependent} This seat recorded the decision.`, null, REFUSAL('appeal-same-hand'));
      }
      const matrix = matrixNow(check);
      const seniority = dgiStrictlySeniorTo(matrix, check.actorId, row.decision.decidedById);
      if (!seniority.ok) {
        return fail(`${DGI_REFUSALS.appealNotIndependent} ${seniority.reason}`, null, REFUSAL('appeal-not-senior'));
      }
      const parties = [row.case.subjectId, row.case.raisedById].filter(Boolean);
      const independence = dgiIndependence(matrix, check.actorId, parties);
      if (!independence.ok) {
        return fail(`${DGI_REFUSALS.appealNotIndependent} ${independence.reason}`, null, REFUSAL('appeal-not-independent'));
      }

      const outcome = input.outcome === 'allowed' || input.outcome === 'refused' || input.outcome === 'varied' ? input.outcome : null;
      if (!outcome) return fail('Record whether the appeal was allowed, refused or varied. The register never infers an outcome from the existence of an appeal.', 'outcome', REFUSAL('appeal-outcome-invalid'));
      const sanction = input.sanction === null || input.sanction === undefined || input.sanction === '' ? null : input.sanction;
      if (outcome === 'varied') {
        if (!DGI_SANCTION_BY_KEY[sanction]) {
          return fail('A varied appeal must substitute a sanction from the declared ladder. A variation with no substituted sanction does not say what was varied.', 'sanction', REFUSAL('appeal-varied-needs-sanction'));
        }
      } else if (sanction) {
        return fail('Only a varied appeal carries a substituted sanction. Allowing an appeal removes the sanction; refusing it leaves the decision standing.', 'sanction', REFUSAL('appeal-sanction-unexpected'));
      }
      const reason = prose(input.reason);
      if (!reason) return fail(`Write the appeal decision in at least ${L.textMin} characters.`, 'reason', REFUSAL('reason-missing'));
      const decided = pastDay(check, input.decidedOn || check.today, 'decidedOn');
      if (decided.error) return decided.error;
      if (decided.day < row.appeal.lodgedOn) return fail('An appeal decision cannot be dated before the appeal was lodged.', 'decidedOn', REFUSAL('appeal-outcome-before-lodging'));

      const id = idFactory('dgi-appeal-out');
      const stored = normalizeDgiAppealOutcomes([...rows('dgiAppealOutcomes'), {
        id,
        appealId: row.appeal.id,
        outcome,
        sanction: outcome === 'varied' ? sanction : null,
        reason,
        decidedOn: decided.day,
        decidedById: check.actorId,
        createdAt: check.at.toISOString(),
      }], rows('dgiAppeals'), check.at, []).find((item) => item.id === id) || null;
      if (!stored) return fail(DGI_REFUSALS.unreadable, 'outcome', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.dgiAppealOutcomes = Array.isArray(draft.dgiAppealOutcomes) ? draft.dgiAppealOutcomes : [];
        draft.dgiAppealOutcomes.push(stored);
      }, {
        type: DGI_EVENTS.APPEAL_DECIDED,
        entity: 'workspace',
        entityId: row.case.caseRef,
        summary: `An appeal on ${row.case.caseRef} was ${outcome} for ${decided.day} by a different hand strictly senior to the decision-maker. The decision below is unchanged; the appeal outcome stands. (${DGI_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, appealOutcome: stored });
    },

    /* ----------------------------------------------------------------- withdrawal */

    dgiWithdraw(input = {}) {
      const check = seatFor(DGI_RIGHTS.WITHDRAW);
      if (!check.ok) return check;
      const caseId = clean(input.caseId, 120);
      const { row } = caseRow(caseId);
      if (!row) return fail(DGI_REFUSALS.notFound, 'caseId', REFUSAL('case-not-found'));
      if (!carriesCase(check, row)) return fail(DGI_REFUSALS.notYourCase, 'caseId', REFUSAL('not-your-case'));
      if (row.terminal) return fail('That case is already closed.', 'caseId', REFUSAL('case-terminal'));
      if (row.decision) return fail('A case with a decision is ended by an appeal, not by a withdrawal. The register will not erase a decision somebody made.', 'caseId', REFUSAL('withdrawal-after-decision'));
      const reasonKey = DGI_WITHDRAWAL_REASON_BY_KEY[input.reasonKey] ? input.reasonKey : null;
      if (!reasonKey) return fail(DGI_REFUSALS.withdrawalNeedsReason, 'reasonKey', REFUSAL('withdrawal-reason-invalid'));
      const basis = prose(input.basis);
      if (!basis) return fail(`Write the basis of the withdrawal in at least ${L.textMin} characters.`, 'basis', REFUSAL('withdrawal-basis-missing'));
      const withdrawn = pastDay(check, input.withdrawnOn || check.today, 'withdrawnOn');
      if (withdrawn.error) return withdrawn.error;
      if (withdrawn.day < row.case.openedOn) return fail('A withdrawal cannot be dated before the case was opened.', 'withdrawnOn', REFUSAL('withdrawal-before-open'));
      const successorRef = reasonKey === 'superseded' ? reference(input.successorRef) : null;
      if (reasonKey === 'superseded' && !successorRef) {
        return fail('A case that was superseded names the case that replaced it. “Superseded” with no reference is the case quietly disappearing.', 'successorRef', REFUSAL('successor-missing'));
      }

      const id = idFactory('dgi-wd');
      const stored = normalizeDgiWithdrawals([...rows('dgiWithdrawals'), {
        id,
        caseId,
        reasonKey,
        basis,
        successorRef,
        withdrawnOn: withdrawn.day,
        withdrawnById: check.actorId,
        createdAt: check.at.toISOString(),
      }], rows('dgiCases'), check.at, []).find((item) => item.id === id) || null;
      if (!stored) return fail(DGI_REFUSALS.unreadable, 'reasonKey', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.dgiWithdrawals = Array.isArray(draft.dgiWithdrawals) ? draft.dgiWithdrawals : [];
        draft.dgiWithdrawals.push(stored);
      }, {
        type: DGI_EVENTS.WITHDRAWN,
        entity: 'workspace',
        entityId: row.case.caseRef,
        summary: `${row.case.caseRef} was ${DGI_WITHDRAWAL_REASON_BY_KEY[reasonKey].label.toLowerCase()} on ${withdrawn.day}, with a written basis. No finding was made and the subject is not cleared. (${DGI_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, withdrawal: stored });
    },

    /* ---------------------------------------------------------------- conventions */

    dgiSetConventions(input = {}) {
      const check = seatFor(DGI_RIGHTS.GOVERN);
      if (!check.ok) return check;
      const current = normalizeDgiSettings(settings());
      const next = normalizeDgiSettings({
        ...current,
        dgiAutoPropagate: input.dgiAutoPropagate === undefined ? current.dgiAutoPropagate : input.dgiAutoPropagate === true,
        dgiPrivacyFloor: input.dgiPrivacyFloor === undefined ? current.dgiPrivacyFloor : input.dgiPrivacyFloor,
        dgiAppealWindowDays: input.dgiAppealWindowDays === undefined ? current.dgiAppealWindowDays : input.dgiAppealWindowDays,
        dgiDecisionWindowDays: input.dgiDecisionWindowDays === undefined ? current.dgiDecisionWindowDays : input.dgiDecisionWindowDays,
        dgiFindingWindowDays: input.dgiFindingWindowDays === undefined ? current.dgiFindingWindowDays : input.dgiFindingWindowDays,
      });
      // The DOOR refuses an out-of-band value rather than clamping it: a silently
      // clamped privacy floor is a lower floor nobody chose.
      for (const key of ['dgiPrivacyFloor', 'dgiAppealWindowDays', 'dgiDecisionWindowDays', 'dgiFindingWindowDays']) {
        if (input[key] === undefined) continue;
        const bounds = { dgiPrivacyFloor: [2, 20], dgiAppealWindowDays: [0, 90], dgiDecisionWindowDays: [0, 60], dgiFindingWindowDays: [1, 180] }[key];
        const n = Math.round(Number(input[key]));
        if (!Number.isFinite(n) || n < bounds[0] || n > bounds[1]) {
          return fail(`${key} must be a whole number between ${bounds[0]} and ${bounds[1]}. It was not saved.`, key, REFUSAL('setting-out-of-band'));
        }
      }
      writeDraft((draft) => {
        draft.settings = { ...(draft.settings || {}), ...next };
      }, {
        type: DGI_EVENTS.CONVENTIONS_SET,
        entity: 'workspace',
        entityId: DGI_ROUTE,
        summary: `Fair-process conventions re-declared: the appeal window, the decision and finding windows, the privacy floor and whether the rule may file asks.`.slice(0, 300),
      });
      return saved({ conventions: next });
    },

    /** The people this seat may name as a subject or an investigator. */
    dgiCandidates() {
      const check = readCheck();
      if (!check.ok) return check;
      const people = rows('people').filter((person) => person && person.status !== 'archived');
      const visible = check.seat.fullAccess ? people : people.filter((person) => holdsPerson(check, person.id));
      return {
        ok: true,
        people: visible.map((person) => ({ id: person.id, name: person.name, role: person.role, level: person.level })),
      };
    },

    /** The reader the panel consumes. Never a second derivation. */
    dgiReport() {
      const check = readCheck();
      if (!check.ok) return check;
      try {
        return { ok: true, report: buildCaseToAnswer(store.state, { now: clock(), settings: settings(), seat: check.seat }) };
      } catch (error) {
        return fail(`The fair-process register could not be read: ${String(error?.message || 'unknown error').slice(0, 200)}`);
      }
    },

    dgiAttention() {
      const check = seatContext();
      try {
        const report = buildCaseToAnswer(store.state, { now: check.at, settings: check.cfg, seat: check.seat });
        return { ok: true, count: report?.attention?.total || 0 };
      } catch {
        return { ok: true, count: 0 };
      }
    },
  };
}

export default createCaseToAnswerActions;
