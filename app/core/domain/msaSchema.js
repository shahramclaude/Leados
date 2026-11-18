/**
 * app/core/domain/msaSchema.js — the fail-closed storage contract of the Modern
 * Slavery & Supply-Chain Due-Diligence Statement Register (ADR-0260, Schema
 * v212).
 *
 * TEN COLLECTIONS, ALL EMPTY AT UPGRADE: `msaStatements`, `msaDeadlines`,
 * `msaApprovals`, `msaPublications`, `msaSuppliers`, `msaAssessments`,
 * `msaFindings`, `msaRemediations`, `msaTraining` and the rule's
 * `msaMarkers`. Nothing derived is stored — no state, no element verdict, no
 * claim, no day count, no open-remediation figure. Each is recomputed on read,
 * because a stored state is a verdict that can disagree with the statement, the
 * deadline and the evidence beside it, and the disagreement would surface as a
 * board being told its statement was supported when the assessments say
 * otherwise.
 *
 * THE RULE THIS FILE ENFORCES. A stored row is the row its own loader returns.
 * Nothing here invents a deadline, completes a missing evidence reference,
 * rescues a finding with no assessment, upgrades a risk to an instance, closes
 * a remediation, or rescues a row that names a person off the roster. A row
 * that cannot be read exactly is DROPPED with a counted warning, and the screen
 * prints the count.
 *
 * THE LOADER RULES THAT CARRY THE MANDATE:
 *   1. A STATEMENT carries the statement reference, the entity name, the
 *      financial-year label and end day as declared, the regime from the closed
 *      vocabulary, one to four responsible hands, and the recording hand and
 *      instant. A regime this register does not carry is DROPPED — the kind is
 *      the verdict, and a guessed one is a statement nobody classified. The
 *      structure, policy and effectiveness references are optional: their
 *      absence is DERIVED as a missing element, never repaired here.
 *   2. A DEADLINE carries the statement, the deadline day and a written basis.
 *      ONE per statement. A deadline with no basis is DROPPED — a date nobody
 *      cited is the deadline this register exists to refuse.
 *   3. An APPROVAL carries the statement, the approved day and the approval
 *      reference (the board minute or written authority). ONE per statement.
 *      Approval is a fact and publication is another.
 *   4. A PUBLICATION carries the statement, the published day and the
 *      publication reference (the URL or document path the statement went live
 *      at). ONE per statement.
 *   5. A SUPPLIER carries the supplier reference, the name, the declared tier
 *      (a whole number from 1 to 5), the country and the category as declared,
 *      the added day and one to four responsible hands. A tier outside 1..5 is
 *      DROPPED — a tier nobody declared is a supplier nobody placed.
 *   6. An ASSESSMENT carries the statement, the supplier, its kind and outcome
 *      from the closed vocabularies, the assessed day, the assessor reference
 *      and the evidence reference. An assessment with no evidence reference is
 *      DROPPED — an unevidenced assessment is an intention, not due diligence.
 *   7. A FINDING carries the assessment, its kind and declared severity, the
 *      identified day and a written description. A finding whose assessment is
 *      not on the register is DROPPED.
 *   8. A REMEDIATION act carries the finding, its kind and status from the
 *      closed vocabularies, the declared day, and — for a COMPLETE act — the
 *      completed day and the evidence reference. A complete act with no
 *      evidence reference is DROPPED: a closure nobody can prove is not a
 *      closure.
 *   9. A TRAINING record carries the statement, the training day, the
 *      population reference, the delivery reference and the evidence reference.
 *
 * A NOTE ON WHAT IS NOT DROPPED. A statement or supplier whose responsible
 * hands are no longer on the roster is NOT dropped here — the reader prints it
 * as an orphan with its reason, because dropping it would silently delete a
 * live due-diligence duty from the record. A child row pointing at a parent
 * that does not exist IS dropped: an assessment cannot be attached to a
 * statement that was never recorded.
 */

import { dayKey } from '../time.js';
import {
  MSA_ASSESSMENT_KIND_BY_KEY,
  MSA_ASSESSMENT_OUTCOME_BY_KEY,
  MSA_BOUNDS,
  MSA_DEFAULTS,
  MSA_FINDING_KIND_BY_KEY,
  MSA_LIMITS as L,
  MSA_REGIME_BY_KEY,
  MSA_REMEDIATION_KIND_BY_KEY,
  MSA_REMEDIATION_STATUS_BY_KEY,
  MSA_SEVERITY_BY_KEY,
  MSA_SETTING_KEYS,
} from './msaRegistry.js';
import { instantMs, wholeCount } from './msaMath.js';

const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const list = (value) => (Array.isArray(value) ? value : []);
const text = (value, max = L.textMax) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const id = (value) => { const candidate = text(value, L.idMax); return ID_RE.test(candidate) ? candidate : null; };

/** An ISO instant, normalised through Date so it is exactly comparable, or null. */
export function msaInstant(value) {
  const ms = instantMs(value);
  return ms === null ? null : new Date(ms).toISOString();
}

/** A statement reference, an approval reference, an evidence reference: bounded and non-empty. */
export function msaShort(value) {
  const candidate = text(value, L.shortMax + 40);
  if (candidate.length < L.shortMin) return null;
  return candidate.slice(0, L.shortMax);
}

/** A written basis: long enough to be a source, bounded. */
export function msaReason(value) {
  const candidate = text(value, L.textMax + 80);
  if (candidate.length < L.textMin) return null;
  return candidate.slice(0, L.textMax);
}

/** An entity or supplier name as declared: bounded and non-empty. */
export function msaName(value) {
  const candidate = text(value, L.nameMax + 20);
  if (candidate.length < L.nameMin) return null;
  return candidate.slice(0, L.nameMax);
}

/** A country or category label as declared. Never a risk score. */
export function msaLabel(value) {
  const candidate = text(value, L.labelMax + 20);
  if (candidate.length < L.labelMin) return null;
  return candidate.slice(0, L.labelMax);
}

/** An evidence document reference: long enough to identify a document. */
export function msaInstrument(value) {
  const candidate = text(value, L.shortMax + 80);
  if (candidate.length < L.instrumentMin) return null;
  return candidate.slice(0, L.shortMax);
}

/** A `YYYY-MM-DD` day, normalised to UTC, or null. */
export function msaDayKey(value) {
  const candidate = text(value, 40);
  if (!DAY_RE.test(candidate)) return null;
  if (dayKey(`${candidate}T00:00:00.000Z`) !== candidate) return null;
  return candidate;
}

/** A declared tier: a whole number from 1 to 5, or null. Never computed from a spend. */
export function msaTier(value) {
  const tier = wholeCount(Number(value));
  if (tier === null || tier < 1 || tier > 5) return null;
  return tier;
}

/**
 * One to four responsible hands, every one a valid id, none repeated.
 * Read WHOLE or not at all: a partial holder list is the exact matrix failure
 * the mandate names — one line would silently be invisible to every roll-up.
 */
export function msaHolders(value) {
  if (!Array.isArray(value)) return null;
  const out = [];
  for (const raw of value) {
    const holderId = id(raw);
    if (!holderId) return null;
    if (!out.includes(holderId)) out.push(holderId);
  }
  if (!out.length || out.length > L.holdersMax) return null;
  return out;
}

/* ----------------------------------------------------------------- statements */

/**
 * Statements. A row that cannot be read exactly is DROPPED with a counted
 * warning: no invented regime, no guessed entity, no repaired holder list.
 *
 * A statement whose responsible hands are off the roster is KEPT and printed as
 * an orphan by the reader — deleting it would erase a live statement. The
 * optional structure, policy and effectiveness references are read as declared
 * or left null: their absence is a DERIVED missing element, never a dropped row.
 */
export function normalizeMsaStatements(rows, warnings = []) {
  const warn = (message) => warnings.push(`[modern-slavery] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the statement ledger was not an array; it was read as empty');
    return [];
  }
  const out = [];
  const seenId = new Set();
  const seenRef = new Set();
  let dropped = 0;
  for (const row of rows) {
    if (out.length >= L.statements) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }

    const rowId = id(row.id);
    const statementRef = msaShort(row.statementRef);
    const entityName = msaName(row.entityName);
    const fyLabel = msaShort(row.fyLabel);
    const fyEndDay = msaDayKey(row.fyEndDay);
    const regime = text(row.regime, 60) || null;
    const regimeDefinition = regime ? MSA_REGIME_BY_KEY[regime] : null;
    const structureRef = row.structureRef === undefined || row.structureRef === null || row.structureRef === '' ? null : msaShort(row.structureRef);
    const policyRef = row.policyRef === undefined || row.policyRef === null || row.policyRef === '' ? null : msaShort(row.policyRef);
    const effectivenessRef = row.effectivenessRef === undefined || row.effectivenessRef === null || row.effectivenessRef === '' ? null : msaShort(row.effectivenessRef);
    const basisRef = msaReason(row.basisRef);
    const responsibleIds = msaHolders(row.responsibleIds);
    const recordedById = id(row.recordedById);
    const recordedAt = msaInstant(row.recordedAt);
    const recordedDay = msaDayKey(row.recordedDay);

    if (!rowId || seenId.has(rowId) || !statementRef || !entityName || !fyLabel || !fyEndDay
      || !regimeDefinition || !basisRef || !responsibleIds || !recordedById || !recordedAt || !recordedDay) {
      dropped += 1;
      continue;
    }
    if (row.structureRef !== undefined && row.structureRef !== null && row.structureRef !== '' && structureRef === null) {
      dropped += 1;
      continue;
    }
    if (row.policyRef !== undefined && row.policyRef !== null && row.policyRef !== '' && policyRef === null) {
      dropped += 1;
      continue;
    }
    if (row.effectivenessRef !== undefined && row.effectivenessRef !== null && row.effectivenessRef !== '' && effectivenessRef === null) {
      dropped += 1;
      continue;
    }
    // Two statements with one reference would make the programme ambiguous.
    if (seenRef.has(statementRef)) { dropped += 1; continue; }

    seenId.add(rowId);
    seenRef.add(statementRef);
    out.push({
      id: rowId,
      statementRef,
      entityName,
      fyLabel,
      fyEndDay,
      regime,
      basisRef,
      structureRef,
      policyRef,
      effectivenessRef,
      responsibleIds,
      recordedById,
      recordedAt,
      recordedDay,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
      updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : '',
    });
  }
  if (dropped) warn(`${dropped} statement row(s) could not be read exactly — an unreadable id, statement reference, entity name, financial-year label or end day, regime, written basis, an optional reference that is not a document reference, responsible hand, recording hand, recording instant or recording day, or a second statement for one reference — and were dropped. Nothing was repaired.`);
  return out;
}

/* ------------------------------------------------------------------ deadlines */

/**
 * Publication deadlines. ONE per statement. A deadline carries the deadline
 * day and a written basis. A deadline with no basis is DROPPED: a date nobody
 * cited is the deadline this register exists to refuse.
 */
export function normalizeMsaDeadlines(rows, statements = [], warnings = []) {
  const warn = (message) => warnings.push(`[modern-slavery] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the deadline ledger was not an array; it was read as empty');
    return [];
  }
  const statementIds = new Set(list(statements).map((row) => row.id));
  const out = [];
  const seenStatement = new Set();
  const seenId = new Set();
  let dropped = 0;
  let orphan = 0;
  for (const row of rows) {
    if (out.length >= L.deadlines) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const statementId = id(row.statementId);
    const deadlineDay = msaDayKey(row.deadlineDay);
    const basisRef = msaReason(row.basisRef);
    const declaredById = id(row.declaredById);
    const declaredAt = msaInstant(row.declaredAt);
    const declaredDay = msaDayKey(row.declaredDay);

    if (!rowId || seenId.has(rowId) || !statementId || !deadlineDay || !basisRef
      || !declaredById || !declaredAt || !declaredDay) {
      dropped += 1;
      continue;
    }
    if (!statementIds.has(statementId)) { orphan += 1; continue; }
    if (seenStatement.has(statementId)) { dropped += 1; continue; }

    seenId.add(rowId);
    seenStatement.add(statementId);
    out.push({
      id: rowId,
      statementId,
      deadlineDay,
      basisRef,
      declaredById,
      declaredAt,
      declaredDay,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    });
  }
  if (orphan) warn(`${orphan} deadline row(s) name a statement that is not on the register and were dropped. A deadline cannot be attached to a statement that was never recorded.`);
  if (dropped) warn(`${dropped} deadline row(s) could not be read exactly — an unreadable id, statement, deadline day, written basis, declaring hand, declaration instant or declaration day, or a second deadline for one statement — and were dropped. Nothing was repaired.`);
  return out;
}

/* ------------------------------------------------------------------- approvals */

/**
 * Board approvals. ONE per statement. An approval carries the approved day and
 * the approval reference — the board minute or written authority. Approval is
 * a fact and publication is another; the register never treats one as the other.
 */
export function normalizeMsaApprovals(rows, statements = [], warnings = []) {
  const warn = (message) => warnings.push(`[modern-slavery] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the approval ledger was not an array; it was read as empty');
    return [];
  }
  const statementIds = new Set(list(statements).map((row) => row.id));
  const out = [];
  const seenStatement = new Set();
  const seenId = new Set();
  let dropped = 0;
  let orphan = 0;
  for (const row of rows) {
    if (out.length >= L.approvals) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const statementId = id(row.statementId);
    const approvedDay = msaDayKey(row.approvedDay);
    const approvalRef = msaShort(row.approvalRef);
    const basisRef = msaReason(row.basisRef);
    const recordedById = id(row.recordedById);
    const recordedAt = msaInstant(row.recordedAt);
    const recordedDay = msaDayKey(row.recordedDay);

    if (!rowId || seenId.has(rowId) || !statementId || !approvedDay || !approvalRef || !basisRef
      || !recordedById || !recordedAt || !recordedDay) {
      dropped += 1;
      continue;
    }
    if (!statementIds.has(statementId)) { orphan += 1; continue; }
    if (seenStatement.has(statementId)) { dropped += 1; continue; }

    seenId.add(rowId);
    seenStatement.add(statementId);
    out.push({
      id: rowId,
      statementId,
      approvedDay,
      approvalRef,
      basisRef,
      recordedById,
      recordedAt,
      recordedDay,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    });
  }
  if (orphan) warn(`${orphan} approval row(s) name a statement that is not on the register and were dropped.`);
  if (dropped) warn(`${dropped} approval row(s) could not be read exactly — an unreadable id, statement, approved day, approval reference, written basis, recording hand, recording instant or recording day, or a second approval for one statement — and were dropped. Nothing was repaired.`);
  return out;
}

/* ---------------------------------------------------------------- publications */

/**
 * Publications. ONE per statement. A publication carries the published day and
 * the publication reference — the URL or document path the statement went live
 * at. A publication with no reference is DROPPED: a statement nobody can find
 * is not a published statement.
 */
export function normalizeMsaPublications(rows, statements = [], warnings = []) {
  const warn = (message) => warnings.push(`[modern-slavery] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the publication ledger was not an array; it was read as empty');
    return [];
  }
  const statementIds = new Set(list(statements).map((row) => row.id));
  const out = [];
  const seenStatement = new Set();
  const seenId = new Set();
  let dropped = 0;
  let orphan = 0;
  for (const row of rows) {
    if (out.length >= L.publications) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const statementId = id(row.statementId);
    const publishedDay = msaDayKey(row.publishedDay);
    const publicationRef = msaShort(row.publicationRef);
    const basisRef = msaReason(row.basisRef);
    const recordedById = id(row.recordedById);
    const recordedAt = msaInstant(row.recordedAt);
    const recordedDay = msaDayKey(row.recordedDay);

    if (!rowId || seenId.has(rowId) || !statementId || !publishedDay || !publicationRef || !basisRef
      || !recordedById || !recordedAt || !recordedDay) {
      dropped += 1;
      continue;
    }
    if (!statementIds.has(statementId)) { orphan += 1; continue; }
    if (seenStatement.has(statementId)) { dropped += 1; continue; }

    seenId.add(rowId);
    seenStatement.add(statementId);
    out.push({
      id: rowId,
      statementId,
      publishedDay,
      publicationRef,
      basisRef,
      recordedById,
      recordedAt,
      recordedDay,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    });
  }
  if (orphan) warn(`${orphan} publication row(s) name a statement that is not on the register and were dropped.`);
  if (dropped) warn(`${dropped} publication row(s) could not be read exactly — an unreadable id, statement, published day, publication reference, written basis, recording hand, recording instant or recording day, or a second publication for one statement — and were dropped. Nothing was repaired.`);
  return out;
}

/* -------------------------------------------------------------------- suppliers */

/**
 * The supplier population. Each row is a DECLARED placement in the chain — the
 * tier a human declared, never one computed from spend or a guess. A supplier
 * whose responsible hands are off the roster is KEPT and printed as an orphan.
 */
export function normalizeMsaSuppliers(rows, warnings = []) {
  const warn = (message) => warnings.push(`[modern-slavery] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the supplier ledger was not an array; it was read as empty');
    return [];
  }
  const out = [];
  const seenId = new Set();
  const seenRef = new Set();
  let dropped = 0;
  for (const row of rows) {
    if (out.length >= L.suppliers) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const supplierRef = msaShort(row.supplierRef);
    const supplierName = msaName(row.supplierName);
    const tier = msaTier(row.tier);
    const country = msaLabel(row.country);
    const category = msaLabel(row.category);
    const addedDay = msaDayKey(row.addedDay);
    const responsibleIds = msaHolders(row.responsibleIds);
    const recordedById = id(row.recordedById);
    const recordedAt = msaInstant(row.recordedAt);
    const recordedDay = msaDayKey(row.recordedDay);

    if (!rowId || seenId.has(rowId) || !supplierRef || !supplierName || tier === null || !country
      || !category || !addedDay || !responsibleIds || !recordedById || !recordedAt || !recordedDay) {
      dropped += 1;
      continue;
    }
    if (seenRef.has(supplierRef)) { dropped += 1; continue; }

    seenId.add(rowId);
    seenRef.add(supplierRef);
    out.push({
      id: rowId,
      supplierRef,
      supplierName,
      tier,
      country,
      category,
      addedDay,
      responsibleIds,
      recordedById,
      recordedAt,
      recordedDay,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    });
  }
  if (dropped) warn(`${dropped} supplier row(s) could not be read exactly — an unreadable id, supplier reference, name, declared tier (a whole number from 1 to 5), country, category, added day, responsible hand, recording hand, recording instant or recording day, or a second supplier for one reference — and were dropped. Nothing was repaired.`);
  return out;
}

/* ------------------------------------------------------------------ assessments */

/**
 * Assessments. Each is one dated act of due diligence bound to a supplier AND a
 * statement, with its kind and outcome from the closed vocabularies, the
 * assessor reference and the evidence reference. An assessment with no
 * evidence reference is DROPPED: an unevidenced assessment is an intention,
 * not due diligence.
 */
export function normalizeMsaAssessments(rows, statements = [], suppliers = [], warnings = []) {
  const warn = (message) => warnings.push(`[modern-slavery] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the assessment ledger was not an array; it was read as empty');
    return [];
  }
  const statementIds = new Set(list(statements).map((row) => row.id));
  const supplierIds = new Set(list(suppliers).map((row) => row.id));
  const out = [];
  const seen = new Set();
  let dropped = 0;
  let orphan = 0;
  for (const row of rows) {
    if (out.length >= L.assessments) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const statementId = id(row.statementId);
    const supplierId = id(row.supplierId);
    const assessmentKind = text(row.assessmentKind, 60) || null;
    const kindDefinition = assessmentKind ? MSA_ASSESSMENT_KIND_BY_KEY[assessmentKind] : null;
    const outcome = text(row.outcome, 60) || null;
    const outcomeDefinition = outcome ? MSA_ASSESSMENT_OUTCOME_BY_KEY[outcome] : null;
    const assessedOn = msaDayKey(row.assessedOn);
    const assessorRef = msaShort(row.assessorRef);
    const evidenceRef = msaInstrument(row.evidenceRef);
    const basisRef = msaReason(row.basisRef);
    const recordedById = id(row.recordedById);
    const recordedAt = msaInstant(row.recordedAt);
    const recordedDay = msaDayKey(row.recordedDay);

    if (!rowId || seen.has(rowId) || !statementId || !supplierId || !kindDefinition || !outcomeDefinition
      || !assessedOn || !assessorRef || !evidenceRef || !basisRef || !recordedById || !recordedAt || !recordedDay) {
      dropped += 1;
      continue;
    }
    if (!statementIds.has(statementId) || !supplierIds.has(supplierId)) { orphan += 1; continue; }

    seen.add(rowId);
    out.push({
      id: rowId,
      statementId,
      supplierId,
      assessmentKind,
      outcome,
      assessedOn,
      assessorRef,
      evidenceRef,
      basisRef,
      recordedById,
      recordedAt,
      recordedDay,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    });
  }
  if (orphan) warn(`${orphan} assessment row(s) name a statement or supplier that is not on the register and were dropped. An assessment cannot be attached to a record that was never made.`);
  if (dropped) warn(`${dropped} assessment row(s) could not be read exactly — an unreadable id, statement, supplier, assessment kind, outcome, assessed day, assessor reference, evidence reference, written basis, recording hand, recording instant or recording day, a kind or outcome this register does not carry, or an assessment with no evidence reference — and were dropped. Nothing was repaired.`);
  return out;
}

/* --------------------------------------------------------------------- findings */

/**
 * Findings. Each is bound to an assessment, carries its kind and declared
 * severity from the closed vocabularies and a written description. A finding
 * whose assessment is not on the register is DROPPED: a risk nobody assessed is
 * not a finding on this record.
 */
export function normalizeMsaFindings(rows, assessments = [], warnings = []) {
  const warn = (message) => warnings.push(`[modern-slavery] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the finding ledger was not an array; it was read as empty');
    return [];
  }
  const assessmentIds = new Set(list(assessments).map((row) => row.id));
  const out = [];
  const seen = new Set();
  let dropped = 0;
  let orphan = 0;
  for (const row of rows) {
    if (out.length >= L.findings) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const assessmentId = id(row.assessmentId);
    const findingKind = text(row.findingKind, 60) || null;
    const kindDefinition = findingKind ? MSA_FINDING_KIND_BY_KEY[findingKind] : null;
    const severity = text(row.severity, 60) || null;
    const severityDefinition = severity ? MSA_SEVERITY_BY_KEY[severity] : null;
    const identifiedOn = msaDayKey(row.identifiedOn);
    const findingRef = msaShort(row.findingRef);
    const basisRef = msaReason(row.basisRef);
    const recordedById = id(row.recordedById);
    const recordedAt = msaInstant(row.recordedAt);
    const recordedDay = msaDayKey(row.recordedDay);

    if (!rowId || seen.has(rowId) || !assessmentId || !kindDefinition || !severityDefinition
      || !identifiedOn || !findingRef || !basisRef || !recordedById || !recordedAt || !recordedDay) {
      dropped += 1;
      continue;
    }
    if (!assessmentIds.has(assessmentId)) { orphan += 1; continue; }

    seen.add(rowId);
    out.push({
      id: rowId,
      assessmentId,
      findingKind,
      severity,
      identifiedOn,
      findingRef,
      basisRef,
      recordedById,
      recordedAt,
      recordedDay,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    });
  }
  if (orphan) warn(`${orphan} finding row(s) name an assessment that is not on the register and were dropped.`);
  if (dropped) warn(`${dropped} finding row(s) could not be read exactly — an unreadable id, assessment, finding kind, severity, identified day, finding reference, written description, recording hand, recording instant or recording day, or a kind or severity this register does not carry — and were dropped. Nothing was repaired.`);
  return out;
}

/* ----------------------------------------------------------------- remediations */

/**
 * Remediation acts. Each is bound to a finding and carries its kind and status
 * from the closed vocabularies. A COMPLETE act must carry the completed day and
 * the evidence reference and is DROPPED without them: a closure nobody can
 * prove is not a closure. A PLANNED act is a promise and closes nothing.
 */
export function normalizeMsaRemediations(rows, findings = [], warnings = []) {
  const warn = (message) => warnings.push(`[modern-slavery] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the remediation ledger was not an array; it was read as empty');
    return [];
  }
  const findingIds = new Set(list(findings).map((row) => row.id));
  const out = [];
  const seen = new Set();
  let dropped = 0;
  let orphan = 0;
  for (const row of rows) {
    if (out.length >= L.remediations) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const findingId = id(row.findingId);
    const remediationKind = text(row.remediationKind, 60) || null;
    const kindDefinition = remediationKind ? MSA_REMEDIATION_KIND_BY_KEY[remediationKind] : null;
    const status = text(row.status, 60) || null;
    const statusDefinition = status ? MSA_REMEDIATION_STATUS_BY_KEY[status] : null;
    const declaredOn = msaDayKey(row.declaredOn);
    const completedOn = row.completedOn === undefined || row.completedOn === null || row.completedOn === '' ? null : msaDayKey(row.completedOn);
    const evidenceRef = row.evidenceRef === undefined || row.evidenceRef === null || row.evidenceRef === '' ? null : msaInstrument(row.evidenceRef);
    const basisRef = msaReason(row.basisRef);
    const recordedById = id(row.recordedById);
    const recordedAt = msaInstant(row.recordedAt);
    const recordedDay = msaDayKey(row.recordedDay);

    if (!rowId || seen.has(rowId) || !findingId || !kindDefinition || !statusDefinition
      || !declaredOn || !basisRef || !recordedById || !recordedAt || !recordedDay) {
      dropped += 1;
      continue;
    }
    if (!findingIds.has(findingId)) { orphan += 1; continue; }
    if (status === 'complete') {
      // A complete act proves its closure: day and document, or it is not read.
      if (!completedOn || !evidenceRef) { dropped += 1; continue; }
      if (row.evidenceRef !== undefined && row.evidenceRef !== null && row.evidenceRef !== '' && evidenceRef === null) { dropped += 1; continue; }
    } else if (row.completedOn !== undefined && row.completedOn !== null && row.completedOn !== '' && completedOn === null) {
      dropped += 1;
      continue;
    }

    seen.add(rowId);
    out.push({
      id: rowId,
      findingId,
      remediationKind,
      status,
      declaredOn,
      completedOn,
      evidenceRef,
      basisRef,
      recordedById,
      recordedAt,
      recordedDay,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    });
  }
  if (orphan) warn(`${orphan} remediation row(s) name a finding that is not on the register and were dropped.`);
  if (dropped) warn(`${dropped} remediation row(s) could not be read exactly — an unreadable id, finding, remediation kind, status, declared day, written basis, recording hand, recording instant or recording day, a kind or status this register does not carry, or a COMPLETE act without its completed day and evidence reference — and were dropped. Nothing was repaired.`);
  return out;
}

/* -------------------------------------------------------------------- training */

/**
 * Training records. Each is a dated act bound to a statement, with the
 * population covered, the delivery reference and the evidence reference.
 */
export function normalizeMsaTraining(rows, statements = [], warnings = []) {
  const warn = (message) => warnings.push(`[modern-slavery] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the training ledger was not an array; it was read as empty');
    return [];
  }
  const statementIds = new Set(list(statements).map((row) => row.id));
  const out = [];
  const seen = new Set();
  let dropped = 0;
  let orphan = 0;
  for (const row of rows) {
    if (out.length >= L.training) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }
    const rowId = id(row.id);
    const statementId = id(row.statementId);
    const trainingDay = msaDayKey(row.trainingDay);
    const populationRef = msaShort(row.populationRef);
    const deliveryRef = msaShort(row.deliveryRef);
    const evidenceRef = msaInstrument(row.evidenceRef);
    const basisRef = msaReason(row.basisRef);
    const recordedById = id(row.recordedById);
    const recordedAt = msaInstant(row.recordedAt);
    const recordedDay = msaDayKey(row.recordedDay);

    if (!rowId || seen.has(rowId) || !statementId || !trainingDay || !populationRef || !deliveryRef
      || !evidenceRef || !basisRef || !recordedById || !recordedAt || !recordedDay) {
      dropped += 1;
      continue;
    }
    if (!statementIds.has(statementId)) { orphan += 1; continue; }

    seen.add(rowId);
    out.push({
      id: rowId,
      statementId,
      trainingDay,
      populationRef,
      deliveryRef,
      evidenceRef,
      basisRef,
      recordedById,
      recordedAt,
      recordedDay,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    });
  }
  if (orphan) warn(`${orphan} training row(s) name a statement that is not on the register and were dropped.`);
  if (dropped) warn(`${dropped} training row(s) could not be read exactly — an unreadable id, statement, training day, population reference, delivery reference, evidence reference, written basis, recording hand, recording instant or recording day — and were dropped. Nothing was repaired.`);
  return out;
}

/* --------------------------------------------------------------------- markers */

/** Identity-free observation markers written by RULE-MSA-01. */
export function normalizeMsaMarkers(rows, warnings = []) {
  const warn = (message) => warnings.push(`[modern-slavery] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the marker ledger was not an array; it was read as empty');
    return [];
  }
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    if (!isPlainObject(row)) continue;
    const key = text(row.key, 240);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      at: msaInstant(row.at) || '',
      ruleId: text(row.ruleId, 40) || '',
      kind: text(row.kind, 40) || '',
      detail: text(row.detail, 400),
    });
    if (out.length >= L.markers) break;
  }
  return out;
}

/* -------------------------------------------------------------------- settings */

/**
 * The register's conventions. `msaPrivacyFloor` is the floor below which a
 * per-state export is withheld. `msaWarnHorizonDays` is the declared band
 * inside which an unpublished statement is flagged as due. `msaAssessmentCycleDays`
 * is the declared cycle beyond which an assessment is printed as stale.
 *
 * THERE IS NO DEFAULT PUBLICATION DEADLINE AND NO DEFAULT REGIME WINDOW. The
 * record holds no calendar; a deadline is a fact about one statement in one
 * regime, declared by a named hand with the written basis that sets it.
 *
 * TWO DIFFERENT REFUSALS, DELIBERATELY. At the DOOR an out-of-bounds convention
 * is REFUSED with its reason, so the figure on the screen is always the figure
 * somebody declared. Here, on load, an unreadable value falls back to the
 * declared default rather than being clamped to whatever the bound happens to
 * be — a clamp would print a number nobody chose as though it were a
 * declaration.
 */
export function normalizeMsaSettings(settings = {}) {
  const source = isPlainObject(settings) ? settings : {};
  const floorRaw = Number(source[MSA_SETTING_KEYS.privacyFloor]);
  const floor = Number.isInteger(floorRaw) && floorRaw >= MSA_BOUNDS.privacyFloor.min && floorRaw <= MSA_BOUNDS.privacyFloor.max
    ? floorRaw
    : MSA_DEFAULTS.privacyFloor;
  const horizonRaw = Number(source[MSA_SETTING_KEYS.warnHorizonDays]);
  const horizon = Number.isInteger(horizonRaw) && horizonRaw >= MSA_BOUNDS.warnHorizonDays.min && horizonRaw <= MSA_BOUNDS.warnHorizonDays.max
    ? horizonRaw
    : MSA_DEFAULTS.warnHorizonDays;
  const cycleRaw = Number(source[MSA_SETTING_KEYS.assessmentCycleDays]);
  const cycle = Number.isInteger(cycleRaw) && cycleRaw >= MSA_BOUNDS.assessmentCycleDays.min && cycleRaw <= MSA_BOUNDS.assessmentCycleDays.max
    ? cycleRaw
    : MSA_DEFAULTS.assessmentCycleDays;
  return {
    [MSA_SETTING_KEYS.autoPropagate]: source[MSA_SETTING_KEYS.autoPropagate] !== false,
    [MSA_SETTING_KEYS.privacyFloor]: floor,
    [MSA_SETTING_KEYS.warnHorizonDays]: horizon,
    [MSA_SETTING_KEYS.assessmentCycleDays]: cycle,
  };
}
