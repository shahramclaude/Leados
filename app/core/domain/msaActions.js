/**
 * app/core/domain/msaActions.js — the seat-checked commands of the Modern
 * Slavery & Supply-Chain Due-Diligence Statement Register (ADR-0260).
 *
 * NINE human acts and a scan: RECORD a statement (the entity, the financial
 * year as declared, the regime), DECLARE a publication deadline (with its
 * written basis), RECORD a board approval (the minute reference), RECORD a
 * publication (its reference), RECORD a supplier (the declared tier), RECORD an
 * assessment (its kind, outcome and evidence reference), RECORD a finding (its
 * kind and declared severity), RECORD a remediation act (planned, or complete
 * with its evidence reference), RECORD a training act — re-declare the
 * conventions — plus the explicit scan. Every state, element verdict, claim and
 * open count is re-derived on read by `modernSlavery.js`; nothing derived is
 * stored.
 *
 * THE DOOR IS THE PRODUCT, AND EVERY REFUSAL IS A CONTROL.
 *  - A STATEMENT carries the statement reference, the entity name, the
 *    financial-year label and end day, the regime from the closed vocabulary
 *    and one to four responsible hands. A regime this register does not carry
 *    is refused: the kind is the verdict.
 *  - A DEADLINE carries the deadline day and a written basis. A deadline with
 *    no basis is refused — a date nobody cited is the deadline this register
 *    exists to refuse. The register computes no window from a financial-year
 *    end; there is no calendar in this record.
 *  - AN APPROVAL carries the approved day and the board minute reference. An
 *    approval with no reference is refused: approval is a recorded act.
 *  - A PUBLICATION carries the published day and the reference the statement
 *    went live at. A publication with no reference is refused: a statement
 *    nobody can find is not published.
 *  - A SUPPLIER carries the declared tier — a whole number from 1 to 5. The
 *    register computes no tier from spend and accepts no guessed one.
 *  - AN ASSESSMENT carries its kind and outcome from the closed vocabularies,
 *    the assessor reference and the evidence reference. An assessment with no
 *    evidence reference is refused: an unevidenced assessment is an intention,
 *    not due diligence.
 *  - A FINDING carries its kind and declared severity. A risk indicator is
 *    never recorded as an instance; the vocabulary refuses to blur them.
 *  - A REMEDIATION act carries its kind and status. A COMPLETE act carries the
 *    completed day and the evidence reference; one without them is refused — a
 *    closure nobody can prove is not a closure.
 *  - Every write is run through the loader and the stored row is the row the
 *    loader returns. A write the loader would refuse on reload is refused now.
 *
 * WHAT NO COMMAND CAN DO. There is no command that sets a state, asserts an
 * element verdict, writes the claim about instances, computes a deadline,
 * closes a remediation without evidence, authors statement text, upgrades a
 * risk to an instance, or scores a supplier, a person or a line.
 */

import { dayKey } from '../time.js';
import { buildSeats, activeSeat, canAct } from './seat.js';
import { matrixLineScopeFor } from './matrix.js';
import { buildModernSlavery, msaAttentionCount } from './modernSlavery.js';
import {
  MSA_ASSESSMENT_KIND_KEYS,
  MSA_ASSESSMENT_OUTCOME_KEYS,
  MSA_BOUNDS,
  MSA_EVENTS,
  MSA_FINDING_KIND_KEYS,
  MSA_LIMITS as L,
  MSA_REFUSALS,
  MSA_REGIME_KEYS,
  MSA_REMEDIATION_KIND_KEYS,
  MSA_REMEDIATION_STATUS_KEYS,
  MSA_RIGHTS,
  MSA_ROUTE,
  MSA_SEVERITY_KEYS,
  MSA_SETTING_KEYS,
} from './msaRegistry.js';
import {
  normalizeMsaApprovals,
  normalizeMsaAssessments,
  normalizeMsaDeadlines,
  normalizeMsaFindings,
  normalizeMsaPublications,
  normalizeMsaRemediations,
  normalizeMsaSettings,
  normalizeMsaStatements,
  normalizeMsaSuppliers,
  normalizeMsaTraining,
  msaDayKey,
  msaHolders,
  msaInstrument,
  msaLabel,
  msaName,
  msaReason,
  msaShort,
  msaTier,
} from './msaSchema.js';
import { instantMs } from './msaMath.js';

const REFUSAL = (key) => `modern-slavery:${key}`;
const text = (value, max = L.textMax) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export function createMsaActions(store, { now, idFactory }) {
  const fail = (error, field = null, refusal = null) => ({ ok: false, error, ...(field ? { field } : {}), ...(refusal ? { refusal } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  const rows = (key) => (Array.isArray(store.state[key]) ? store.state[key] : []);

  /**
   * A write result. The caller's own warning is MERGED with the persist error,
   * never overwritten by it — a row stored with an unreadable child must not
   * lose its message on a clean persist.
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
    if (seat.readOnly) return fail(MSA_REFUSALS.notSeated);
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
    if (seat.readOnly) return fail(MSA_REFUSALS.notSeated);
    const verdict = canAct(MSA_RIGHTS.READ, seat);
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
    const ids = msaHolders(Array.isArray(value) ? value : text(value, 2000).split(/[,;]/).map((part) => part.trim()).filter(Boolean));
    if (!ids) {
      return fail(`Name between one and ${L.holdersMax} responsible person(s), each on this workspace once. A statement with no responsible hand has nobody to answer for it.`, 'responsibleIds', REFUSAL('holders-invalid'));
    }
    for (const holderId of ids) {
      const person = rows('people').find((row) => row && row.id === holderId) || null;
      if (!person) return fail(`“${holderId}” is not a person on this record. Nothing was saved.`, 'responsibleIds', REFUSAL('holder-not-found'));
      if (person.status === 'archived') return fail(`${person.name || holderId} is archived and cannot be made responsible for a live statement.`, 'responsibleIds', REFUSAL('holder-archived'));
      if (!holdsPerson(check, holderId)) {
        return fail(`${person.name || holderId} is not on a line this seat holds. ${MSA_REFUSALS.noReach}`, 'responsibleIds', REFUSAL('holder-not-your-person'));
      }
    }
    return { ok: true, ids };
  }

  function loadedStatements() { return normalizeMsaStatements(rows('msaStatements'), []); }
  function loadedDeadlines() { return normalizeMsaDeadlines(rows('msaDeadlines'), loadedStatements(), []); }
  function loadedApprovals() { return normalizeMsaApprovals(rows('msaApprovals'), loadedStatements(), []); }
  function loadedPublications() { return normalizeMsaPublications(rows('msaPublications'), loadedStatements(), []); }
  function loadedSuppliers() { return normalizeMsaSuppliers(rows('msaSuppliers'), []); }
  function loadedAssessments() { return normalizeMsaAssessments(rows('msaAssessments'), loadedStatements(), loadedSuppliers(), []); }
  function loadedFindings() { return normalizeMsaFindings(rows('msaFindings'), loadedAssessments(), []); }
  function loadedRemediations() { return normalizeMsaRemediations(rows('msaRemediations'), loadedFindings(), []); }
  function loadedTraining() { return normalizeMsaTraining(rows('msaTraining'), loadedStatements(), []); }

  function writeDraft(mutate, event) {
    store.update((draft) => { mutate(draft); }, event);
    return true;
  }

  /** A day an ACT that has already happened names, and therefore cannot be future. */
  function pastDay(check, value, field) {
    const day = msaDayKey(value);
    if (!day) return { error: fail('Give a real calendar day (YYYY-MM-DD).', field, REFUSAL('day-invalid')) };
    const dayMs = instantMs(`${day}T00:00:00.000Z`);
    if (dayMs > instantMs(`${check.today}T00:00:00.000Z`)) {
      return { error: fail('That day is in the future. This register records what has been decided, not what will be.', field, REFUSAL('day-future')) };
    }
    return { day };
  }

  /** The statement a child row binds to, or a refusal. */
  function statementFor(check, statementId) {
    const rowId = text(statementId, L.idMax) || null;
    const statement = loadedStatements().find((row) => row.id === rowId) || null;
    if (!statement) return fail(MSA_REFUSALS.notFound, 'statementId', REFUSAL('statement-not-found'));
    if (!holdsPerson(check, statement.responsibleIds[0]) && !statement.responsibleIds.some((holderId) => holdsPerson(check, holderId))) {
      return fail(`That statement is not on a line this seat holds. ${MSA_REFUSALS.noReach}`, 'statementId', REFUSAL('statement-not-your-person'));
    }
    return { ok: true, statement };
  }

  return {
    /* ---------------------------------------------------------------- statements */

    /**
     * RECORD a statement: the statement reference, the entity, the financial
     * year label and end day as declared, the regime and the responsible hands.
     * The optional structure, policy and effectiveness references are read as
     * declared; their absence is a DERIVED missing element, never repaired.
     */
    msaRecordStatement(input = {}) {
      const check = seatFor(MSA_RIGHTS.MANAGE);
      if (!check.ok) return check;

      const statementRef = msaShort(input.statementRef);
      if (!statementRef) return fail(`Cite the statement reference, in at least ${L.shortMin} characters.`, 'statementRef', REFUSAL('statement-ref-missing'));
      if (loadedStatements().some((row) => row.statementRef === statementRef)) {
        return fail(`A statement with reference “${statementRef}” is already on the register. Nothing was saved.`, 'statementRef', REFUSAL('statement-ref-duplicate'));
      }
      const entityName = msaName(input.entityName);
      if (!entityName) return fail(`Name the reporting entity, in at least ${L.nameMin} characters.`, 'entityName', REFUSAL('entity-missing'));
      const fyLabel = msaShort(input.fyLabel);
      if (!fyLabel) return fail(`Give the financial-year label as declared (for example FY2025-26), in at least ${L.shortMin} characters.`, 'fyLabel', REFUSAL('fy-label-missing'));
      const fyEndDay = pastDay(check, input.fyEndDay, 'fyEndDay');
      if (fyEndDay.error) return fyEndDay.error;
      const regime = text(input.regime, 60) || null;
      if (!regime || !MSA_REGIME_KEYS.includes(regime)) {
        return fail('Choose the reporting regime. The register never infers the regime of a statement from an entity or a date.', 'regime', REFUSAL('regime-invalid'));
      }
      const basisRef = msaReason(input.basisRef);
      if (!basisRef) {
        return fail(`Write the basis the statement is prepared under, in at least ${L.textMin} characters — the regime instrument and the entity it covers. A statement with no written basis is refused: a claim nobody cited is the claim this register exists to refuse.`, 'basisRef', REFUSAL('statement-basis-missing'));
      }

      const optionalRef = (value, field, label) => {
        if (value === undefined || value === null || value === '') return { ref: null };
        const ref = msaShort(value);
        if (!ref) return { error: fail(`${label}, in at least ${L.shortMin} characters — or leave it blank. A reference the register cannot read is refused rather than stored.`, field, REFUSAL(`${field}-invalid`)) };
        return { ref };
      };
      const structure = optionalRef(input.structureRef, 'structureRef', 'Cite the structure description reference');
      if (structure.error) return structure.error;
      const policy = optionalRef(input.policyRef, 'policyRef', 'Cite the policy instrument reference');
      if (policy.error) return policy.error;
      const effectiveness = optionalRef(input.effectivenessRef, 'effectivenessRef', 'Cite the effectiveness-measurement reference');
      if (effectiveness.error) return effectiveness.error;

      const holders = holdersContext(check, input.responsibleIds);
      if (!holders.ok) return holders;

      const id = idFactory('msa-stmt');
      const createdAt = check.at.toISOString();
      writeDraft((draft) => {
        draft.msaStatements = Array.isArray(draft.msaStatements) ? draft.msaStatements : [];
        draft.msaStatements.push({
          id,
          statementRef,
          entityName,
          fyLabel,
          fyEndDay: fyEndDay.day,
          regime,
          basisRef,
          structureRef: structure.ref,
          policyRef: policy.ref,
          effectivenessRef: effectiveness.ref,
          responsibleIds: holders.ids,
          recordedById: check.actorId,
          recordedAt: createdAt,
          recordedDay: check.today,
          createdAt,
          updatedAt: createdAt,
        });
      }, {
        type: MSA_EVENTS.STATEMENT_RECORDED,
        entity: 'msaStatement',
        entityId: id,
        summary: `Modern slavery statement recorded for ${entityName} (${fyLabel}) under the declared regime (${MSA_ROUTE}).`.slice(0, 300),
      });
      return saved({ id });
    },

    /**
     * DECLARE the publication deadline: the day and the written basis that
     * sets the window. ONE per statement. The register computes no window from
     * the financial-year end.
     */
    msaDeclareDeadline(input = {}) {
      const check = seatFor(MSA_RIGHTS.MANAGE);
      if (!check.ok) return check;
      const bound = statementFor(check, input.statementId);
      if (!bound.ok) return bound;
      if (loadedDeadlines().some((row) => row.statementId === bound.statement.id)) {
        return fail('That statement already carries a declared deadline. One statement, one deadline: give the basis for a change as a new statement record, not a second clock.', 'statementId', REFUSAL('deadline-duplicate'));
      }
      const deadlineDay = msaDayKey(input.deadlineDay);
      if (!deadlineDay) return fail('Give the declared publication deadline as a real calendar day (YYYY-MM-DD). The register holds no corporate calendar and will not invent one.', 'deadlineDay', REFUSAL('deadline-day-invalid'));
      const basisRef = msaReason(input.basisRef);
      if (!basisRef) {
        return fail(`Write the basis that sets this deadline, in at least ${L.textMin} characters — the instrument and the window it gives. A deadline with no written basis is refused: a date nobody cited is the deadline this register exists to refuse.`, 'basisRef', REFUSAL('deadline-basis-missing'));
      }

      const id = idFactory('msa-dl');
      const createdAt = check.at.toISOString();
      writeDraft((draft) => {
        draft.msaDeadlines = Array.isArray(draft.msaDeadlines) ? draft.msaDeadlines : [];
        draft.msaDeadlines.push({
          id,
          statementId: bound.statement.id,
          deadlineDay,
          basisRef,
          declaredById: check.actorId,
          declaredAt: createdAt,
          declaredDay: check.today,
          createdAt,
        });
      }, {
        type: MSA_EVENTS.DEADLINE_DECLARED,
        entity: 'msaStatement',
        entityId: bound.statement.id,
        summary: `A publication deadline was declared with its written basis (${MSA_ROUTE}).`.slice(0, 300),
      });
      return saved({ id });
    },

    /** RECORD the board approval: the approved day and the minute reference. */
    msaRecordApproval(input = {}) {
      const check = seatFor(MSA_RIGHTS.MANAGE);
      if (!check.ok) return check;
      const bound = statementFor(check, input.statementId);
      if (!bound.ok) return bound;
      if (loadedApprovals().some((row) => row.statementId === bound.statement.id)) {
        return fail('That statement already carries a recorded approval. Approval is a fact recorded once.', 'statementId', REFUSAL('approval-duplicate'));
      }
      const approvedDay = pastDay(check, input.approvedDay, 'approvedDay');
      if (approvedDay.error) return approvedDay.error;
      const approvalRef = msaShort(input.approvalRef);
      if (!approvalRef) return fail(`Cite the board minute or written authority, in at least ${L.shortMin} characters. An approval with no reference is not a recorded act.`, 'approvalRef', REFUSAL('approval-ref-missing'));
      const basisRef = msaReason(input.basisRef);
      if (!basisRef) return fail(`Write the basis of the approval, in at least ${L.textMin} characters.`, 'basisRef', REFUSAL('approval-basis-missing'));

      const id = idFactory('msa-apr');
      const createdAt = check.at.toISOString();
      writeDraft((draft) => {
        draft.msaApprovals = Array.isArray(draft.msaApprovals) ? draft.msaApprovals : [];
        draft.msaApprovals.push({
          id,
          statementId: bound.statement.id,
          approvedDay: approvedDay.day,
          approvalRef,
          basisRef,
          recordedById: check.actorId,
          recordedAt: createdAt,
          recordedDay: check.today,
          createdAt,
        });
      }, {
        type: MSA_EVENTS.APPROVAL_RECORDED,
        entity: 'msaStatement',
        entityId: bound.statement.id,
        summary: `A board approval was recorded with its minute reference (${MSA_ROUTE}).`.slice(0, 300),
      });
      return saved({ id });
    },

    /** RECORD the publication: the published day and the reference it went live at. */
    msaRecordPublication(input = {}) {
      const check = seatFor(MSA_RIGHTS.MANAGE);
      if (!check.ok) return check;
      const bound = statementFor(check, input.statementId);
      if (!bound.ok) return bound;
      if (loadedPublications().some((row) => row.statementId === bound.statement.id)) {
        return fail('That statement already carries a recorded publication. One statement, one publication.', 'statementId', REFUSAL('publication-duplicate'));
      }
      const publishedDay = pastDay(check, input.publishedDay, 'publishedDay');
      if (publishedDay.error) return publishedDay.error;
      const publicationRef = msaShort(input.publicationRef);
      if (!publicationRef) return fail(`Give the reference the statement went live at — the URL or document path — in at least ${L.shortMin} characters. A statement nobody can find is not a published statement.`, 'publicationRef', REFUSAL('publication-ref-missing'));
      const basisRef = msaReason(input.basisRef);
      if (!basisRef) return fail(`Write the basis of the publication, in at least ${L.textMin} characters.`, 'basisRef', REFUSAL('publication-basis-missing'));

      const id = idFactory('msa-pub');
      const createdAt = check.at.toISOString();
      writeDraft((draft) => {
        draft.msaPublications = Array.isArray(draft.msaPublications) ? draft.msaPublications : [];
        draft.msaPublications.push({
          id,
          statementId: bound.statement.id,
          publishedDay: publishedDay.day,
          publicationRef,
          basisRef,
          recordedById: check.actorId,
          recordedAt: createdAt,
          recordedDay: check.today,
          createdAt,
        });
      }, {
        type: MSA_EVENTS.PUBLICATION_RECORDED,
        entity: 'msaStatement',
        entityId: bound.statement.id,
        summary: `A statement publication was recorded with its reference (${MSA_ROUTE}).`.slice(0, 300),
      });
      return saved({ id });
    },

    /* ------------------------------------------------------------------ suppliers */

    /** RECORD a supplier on the declared population, with the declared tier. */
    msaRecordSupplier(input = {}) {
      const check = seatFor(MSA_RIGHTS.MANAGE);
      if (!check.ok) return check;

      const supplierRef = msaShort(input.supplierRef);
      if (!supplierRef) return fail(`Cite the supplier reference, in at least ${L.shortMin} characters.`, 'supplierRef', REFUSAL('supplier-ref-missing'));
      if (loadedSuppliers().some((row) => row.supplierRef === supplierRef)) {
        return fail(`A supplier with reference “${supplierRef}” is already on the population. Nothing was saved.`, 'supplierRef', REFUSAL('supplier-ref-duplicate'));
      }
      const supplierName = msaName(input.supplierName);
      if (!supplierName) return fail(`Name the supplier, in at least ${L.nameMin} characters.`, 'supplierName', REFUSAL('supplier-name-missing'));
      const tier = msaTier(input.tier);
      if (tier === null) return fail('Give the declared tier as a whole number from 1 to 5. The register computes no tier from spend and accepts no guessed one.', 'tier', REFUSAL('tier-invalid'));
      const country = msaLabel(input.country);
      if (!country) return fail(`Name the country of operation as declared, in at least ${L.labelMin} characters.`, 'country', REFUSAL('country-missing'));
      const category = msaLabel(input.category);
      if (!category) return fail(`Give the supply category as declared, in at least ${L.labelMin} characters.`, 'category', REFUSAL('category-missing'));
      const addedDay = pastDay(check, input.addedDay || check.today, 'addedDay');
      if (addedDay.error) return addedDay.error;

      const holders = holdersContext(check, input.responsibleIds);
      if (!holders.ok) return holders;

      const id = idFactory('msa-sup');
      const createdAt = check.at.toISOString();
      writeDraft((draft) => {
        draft.msaSuppliers = Array.isArray(draft.msaSuppliers) ? draft.msaSuppliers : [];
        draft.msaSuppliers.push({
          id,
          supplierRef,
          supplierName,
          tier,
          country,
          category,
          addedDay: addedDay.day,
          responsibleIds: holders.ids,
          recordedById: check.actorId,
          recordedAt: createdAt,
          recordedDay: check.today,
          createdAt,
        });
      }, {
        type: MSA_EVENTS.SUPPLIER_RECORDED,
        entity: 'msaSupplier',
        entityId: id,
        summary: `A supplier was added to the declared population at tier ${tier} (${MSA_ROUTE}).`.slice(0, 300),
      });
      return saved({ id });
    },

    /* ---------------------------------------------------------------- assessments */

    /** RECORD an assessment: its kind, outcome, day, assessor and evidence reference. */
    msaRecordAssessment(input = {}) {
      const check = seatFor(MSA_RIGHTS.MANAGE);
      if (!check.ok) return check;
      const bound = statementFor(check, input.statementId);
      if (!bound.ok) return bound;

      const supplierId = text(input.supplierId, L.idMax) || null;
      const supplier = loadedSuppliers().find((row) => row.id === supplierId) || null;
      if (!supplier) return fail(MSA_REFUSALS.notFound, 'supplierId', REFUSAL('supplier-not-found'));

      const assessmentKind = text(input.assessmentKind, 60) || null;
      if (!assessmentKind || !MSA_ASSESSMENT_KIND_KEYS.includes(assessmentKind)) {
        return fail('Choose the assessment kind. A signed clause is not an audit, and the register never treats one as another.', 'assessmentKind', REFUSAL('assessment-kind-invalid'));
      }
      const outcome = text(input.outcome, 60) || null;
      if (!outcome || !MSA_ASSESSMENT_OUTCOME_KEYS.includes(outcome)) {
        return fail('Choose the assessment outcome from the register’s vocabulary. An outcome is never inferred from a kind.', 'outcome', REFUSAL('outcome-invalid'));
      }
      const assessedOn = pastDay(check, input.assessedOn, 'assessedOn');
      if (assessedOn.error) return assessedOn.error;
      const assessorRef = msaShort(input.assessorRef);
      if (!assessorRef) return fail(`Name the assessor, in at least ${L.shortMin} characters.`, 'assessorRef', REFUSAL('assessor-ref-missing'));
      const evidenceRef = msaInstrument(input.evidenceRef);
      if (!evidenceRef) {
        return fail(`Cite the evidence document, in at least ${L.instrumentMin} characters. An assessment with no evidence reference is refused: an unevidenced assessment is an intention, not due diligence.`, 'evidenceRef', REFUSAL('evidence-ref-missing'));
      }
      const basisRef = msaReason(input.basisRef);
      if (!basisRef) return fail(`Write the basis of the assessment, in at least ${L.textMin} characters.`, 'basisRef', REFUSAL('assessment-basis-missing'));

      const id = idFactory('msa-asm');
      const createdAt = check.at.toISOString();
      writeDraft((draft) => {
        draft.msaAssessments = Array.isArray(draft.msaAssessments) ? draft.msaAssessments : [];
        draft.msaAssessments.push({
          id,
          statementId: bound.statement.id,
          supplierId,
          assessmentKind,
          outcome,
          assessedOn: assessedOn.day,
          assessorRef,
          evidenceRef,
          basisRef,
          recordedById: check.actorId,
          recordedAt: createdAt,
          recordedDay: check.today,
          createdAt,
        });
      }, {
        type: MSA_EVENTS.ASSESSMENT_RECORDED,
        entity: 'msaAssessment',
        entityId: id,
        summary: `A supplier assessment was recorded with its outcome and evidence reference (${MSA_ROUTE}).`.slice(0, 300),
      });
      return saved({ id });
    },

    /* ------------------------------------------------------------------- findings */

    /** RECORD a finding: its kind, declared severity, day and written description. */
    msaRecordFinding(input = {}) {
      const check = seatFor(MSA_RIGHTS.MANAGE);
      if (!check.ok) return check;

      const assessmentId = text(input.assessmentId, L.idMax) || null;
      const assessment = loadedAssessments().find((row) => row.id === assessmentId) || null;
      if (!assessment) return fail(MSA_REFUSALS.notFound, 'assessmentId', REFUSAL('assessment-not-found'));

      const findingKind = text(input.findingKind, 60) || null;
      if (!findingKind || !MSA_FINDING_KIND_KEYS.includes(findingKind)) {
        return fail('Choose the finding kind. A risk indicator is never recorded as an instance; the vocabulary refuses to blur them.', 'findingKind', REFUSAL('finding-kind-invalid'));
      }
      const severity = text(input.severity, 60) || null;
      if (!severity || !MSA_SEVERITY_KEYS.includes(severity)) {
        return fail('Choose the declared severity. The register computes no severity and accepts no guessed one.', 'severity', REFUSAL('severity-invalid'));
      }
      const identifiedOn = pastDay(check, input.identifiedOn, 'identifiedOn');
      if (identifiedOn.error) return identifiedOn.error;
      const findingRef = msaShort(input.findingRef);
      if (!findingRef) return fail(`Cite the finding reference, in at least ${L.shortMin} characters.`, 'findingRef', REFUSAL('finding-ref-missing'));
      const basisRef = msaReason(input.basisRef);
      if (!basisRef) return fail(`Describe the finding in writing, in at least ${L.textMin} characters. A finding with no description is an assertion the register cannot audit.`, 'basisRef', REFUSAL('finding-basis-missing'));

      const id = idFactory('msa-fnd');
      const createdAt = check.at.toISOString();
      writeDraft((draft) => {
        draft.msaFindings = Array.isArray(draft.msaFindings) ? draft.msaFindings : [];
        draft.msaFindings.push({
          id,
          assessmentId,
          findingKind,
          severity,
          identifiedOn: identifiedOn.day,
          findingRef,
          basisRef,
          recordedById: check.actorId,
          recordedAt: createdAt,
          recordedDay: check.today,
          createdAt,
        });
      }, {
        type: MSA_EVENTS.FINDING_RECORDED,
        entity: 'msaFinding',
        entityId: id,
        summary: `A finding was recorded with its kind and declared severity (${MSA_ROUTE}).`.slice(0, 300),
      });
      return saved({ id });
    },

    /* --------------------------------------------------------------- remediations */

    /**
     * RECORD a remediation act. `planned` is a promise and closes nothing.
     * `complete` carries the completed day and the evidence reference; one
     * without them is refused — a closure nobody can prove is not a closure.
     */
    msaRecordRemediation(input = {}) {
      const check = seatFor(MSA_RIGHTS.MANAGE);
      if (!check.ok) return check;

      const findingId = text(input.findingId, L.idMax) || null;
      const finding = loadedFindings().find((row) => row.id === findingId) || null;
      if (!finding) return fail(MSA_REFUSALS.notFound, 'findingId', REFUSAL('finding-not-found'));

      const remediationKind = text(input.remediationKind, 60) || null;
      if (!remediationKind || !MSA_REMEDIATION_KIND_KEYS.includes(remediationKind)) {
        return fail('Choose the remediation kind from the register’s vocabulary.', 'remediationKind', REFUSAL('remediation-kind-invalid'));
      }
      const status = text(input.status, 60) || null;
      if (!status || !MSA_REMEDIATION_STATUS_KEYS.includes(status)) {
        return fail('Choose the status. A plan is not a remedy: only `complete` closes a finding.', 'status', REFUSAL('status-invalid'));
      }
      const declaredOn = pastDay(check, input.declaredOn, 'declaredOn');
      if (declaredOn.error) return declaredOn.error;
      const basisRef = msaReason(input.basisRef);
      if (!basisRef) return fail(`Write the basis of the act, in at least ${L.textMin} characters.`, 'basisRef', REFUSAL('remediation-basis-missing'));

      let completedOn = null;
      let evidenceRef = null;
      if (status === 'complete') {
        const day = pastDay(check, input.completedOn, 'completedOn');
        if (day.error) return day.error;
        completedOn = day.day;
        evidenceRef = msaInstrument(input.evidenceRef);
        if (!evidenceRef) {
          return fail(`Cite the document that proves the act happened, in at least ${L.instrumentMin} characters. A closure nobody can prove is refused: a plan is not a remedy.`, 'evidenceRef', REFUSAL('remediation-evidence-missing'));
        }
      }

      const id = idFactory('msa-rem');
      const createdAt = check.at.toISOString();
      writeDraft((draft) => {
        draft.msaRemediations = Array.isArray(draft.msaRemediations) ? draft.msaRemediations : [];
        draft.msaRemediations.push({
          id,
          findingId,
          remediationKind,
          status,
          declaredOn: declaredOn.day,
          completedOn,
          evidenceRef,
          basisRef,
          recordedById: check.actorId,
          recordedAt: createdAt,
          recordedDay: check.today,
          createdAt,
        });
      }, {
        type: MSA_EVENTS.REMEDIATION_RECORDED,
        entity: 'msaRemediation',
        entityId: id,
        summary: `A remediation act was recorded as ${status} (${MSA_ROUTE}).`.slice(0, 300),
      });
      return saved({ id });
    },

    /* ------------------------------------------------------------------ training */

    /** RECORD a training act: the day, the population covered and the evidence. */
    msaRecordTraining(input = {}) {
      const check = seatFor(MSA_RIGHTS.MANAGE);
      if (!check.ok) return check;
      const bound = statementFor(check, input.statementId);
      if (!bound.ok) return bound;

      const trainingDay = pastDay(check, input.trainingDay, 'trainingDay');
      if (trainingDay.error) return trainingDay.error;
      const populationRef = msaShort(input.populationRef);
      if (!populationRef) return fail(`Name the population covered, in at least ${L.shortMin} characters.`, 'populationRef', REFUSAL('population-ref-missing'));
      const deliveryRef = msaShort(input.deliveryRef);
      if (!deliveryRef) return fail(`Cite the delivery reference — the course or session — in at least ${L.shortMin} characters.`, 'deliveryRef', REFUSAL('delivery-ref-missing'));
      const evidenceRef = msaInstrument(input.evidenceRef);
      if (!evidenceRef) return fail(`Cite the training evidence, in at least ${L.instrumentMin} characters.`, 'evidenceRef', REFUSAL('training-evidence-missing'));
      const basisRef = msaReason(input.basisRef);
      if (!basisRef) return fail(`Write the basis of the training record, in at least ${L.textMin} characters.`, 'basisRef', REFUSAL('training-basis-missing'));

      const id = idFactory('msa-trn');
      const createdAt = check.at.toISOString();
      writeDraft((draft) => {
        draft.msaTraining = Array.isArray(draft.msaTraining) ? draft.msaTraining : [];
        draft.msaTraining.push({
          id,
          statementId: bound.statement.id,
          trainingDay: trainingDay.day,
          populationRef,
          deliveryRef,
          evidenceRef,
          basisRef,
          recordedById: check.actorId,
          recordedAt: createdAt,
          recordedDay: check.today,
          createdAt,
        });
      }, {
        type: MSA_EVENTS.TRAINING_RECORDED,
        entity: 'msaTraining',
        entityId: id,
        summary: `A training record was recorded with its population and evidence (${MSA_ROUTE}).`.slice(0, 300),
      });
      return saved({ id });
    },

    /* -------------------------------------------------------------- conventions */

    /** Re-declare the bounded conventions. Out-of-bounds is REFUSED at the door. */
    msaSetConventions(input = {}) {
      const check = seatFor(MSA_RIGHTS.MANAGE);
      if (!check.ok) return check;

      const next = {};
      const bound = (value, spec, key, label) => {
        if (value === undefined || value === null || value === '') return null;
        const n = Number(value);
        if (!Number.isInteger(n) || n < spec.min || n > spec.max) {
          return fail(`${label} must be a whole number between ${spec.min} and ${spec.max}. The figure on the screen is always the figure somebody declared; this register clamps nothing.`, key, REFUSAL(`${key}-out-of-bounds`));
        }
        return n;
      };
      const floor = bound(input.msaPrivacyFloor, MSA_BOUNDS.privacyFloor, 'msaPrivacyFloor', 'The privacy floor');
      if (floor && floor.ok === false) return floor;
      const horizon = bound(input.msaWarnHorizonDays, MSA_BOUNDS.warnHorizonDays, 'msaWarnHorizonDays', 'The warning horizon');
      if (horizon && horizon.ok === false) return horizon;
      const cycle = bound(input.msaAssessmentCycleDays, MSA_BOUNDS.assessmentCycleDays, 'msaAssessmentCycleDays', 'The assessment cycle');
      if (cycle && cycle.ok === false) return cycle;
      if (floor !== null && floor !== undefined) next.msaPrivacyFloor = floor;
      if (horizon !== null && horizon !== undefined) next.msaWarnHorizonDays = horizon;
      if (cycle !== null && cycle !== undefined) next.msaAssessmentCycleDays = cycle;
      if (input.msaAutoPropagate !== undefined && input.msaAutoPropagate !== null) {
        next.msaAutoPropagate = input.msaAutoPropagate !== false;
      }
      if (!Object.keys(next).length) return fail('Give at least one convention to set.', null, REFUSAL('conventions-empty'));

      writeDraft((draft) => {
        draft.settings = { ...(draft.settings || {}), ...next };
      }, {
        type: MSA_EVENTS.CONVENTIONS_SET,
        entity: 'workspace',
        entityId: MSA_ROUTE,
        summary: `Modern-slavery register conventions were re-declared (${MSA_ROUTE}).`.slice(0, 300),
      });
      return saved({ conventions: next });
    },

    /* --------------------------------------------------------------------- reads */

    msaReport() {
      const check = readCheck();
      if (!check.ok) return check;
      return { ok: true, report: buildModernSlavery(store.state, { now: check.at, settings: check.cfg, seat: check.seat }) };
    },

    msaAttention() {
      const check = readCheck();
      if (!check.ok) return check;
      return { ok: true, count: msaAttentionCount(store.state, { now: check.at, settings: check.cfg, seat: check.seat }) };
    },

    /** The candidates a dialog may name, narrowed to what this seat may actually write. */
    msaCandidates() {
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
     * because an overdue-unpublished statement is a statutory window that has
     * already closed with nobody having written anything.
     */
    msaScan() {
      const check = seatFor(MSA_RIGHTS.MANAGE);
      if (!check.ok) return check;
      store.update((draft) => {
        draft.msaMarkers = Array.isArray(draft.msaMarkers) ? draft.msaMarkers : [];
      }, {
        type: MSA_EVENTS.SCANNED,
        entity: 'workspace',
        entityId: MSA_ROUTE,
        summary: `Modern slavery register scanned; the rule re-reads every statement, deadline, approval, publication, supplier, assessment, finding, remediation act and training record (${MSA_ROUTE}).`.slice(0, 300),
      });
      return saved({});
    },
  };
}

/** The read context, exported so the view can print exactly what the register claims. */
export const MSA_CONTEXT = 'Read the modern slavery & supply-chain due-diligence statement register (#/modern-slavery). It binds each statement to the declared publication deadline and its written basis, the board approval, the publication act, the declared supplier population, the dated assessments behind each content element, the findings and their remediation acts, and the training record — deriving the state, the six element verdicts and the claim the evidence supports on read. It authors no statement text, gives no legal advice and scores nobody.';
