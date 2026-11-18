/**
 * app/core/domain/modernSlavery.js — the ONE reader of the Modern Slavery &
 * Supply-Chain Due-Diligence Statement Register (ADR-0260, Schema v212,
 * `#/modern-slavery`).
 *
 * Every state, element verdict, claim, day count and open-remediation figure
 * this module prints is derived here, on read, from stored declarations and the
 * injected clock. Nothing derived is stored anywhere, so the same workspace
 * read twice gives the same answer and a hand-edited file cannot carry a
 * statement recorded as supported whose assessments say otherwise.
 *
 * THE ONE QUESTION THIS READER ANSWERS PER STATEMENT: *is the statutory clock
 * on the record, is the statement published, and does the evidence beneath it
 * support what it says?* The answer is one of six states, and each is a
 * DIFFERENT fact:
 *
 *   deadline-undeclared     the statement is on the record and no publication
 *                           deadline is declared. The register holds no
 *                           calendar and will not invent one.
 *   awaiting-publication    a deadline is declared and has not passed, and no
 *                           publication is on the record yet.
 *   overdue-unpublished     the declared deadline has passed and nothing is
 *                           published. The statutory failure has happened.
 *   approved-unpublished    the board approval is on the record and the
 *                           statement is not published. Approval is a fact and
 *                           publication is another.
 *   published-with-gaps     published, but an element is unevidenced, the claim
 *                           was refused, or a finding has no complete
 *                           remediation act.
 *   published               published and fully supported by the record.
 *
 * WHY THE STATE IS DERIVED AND NOT STORED. A state is the product of a
 * statement, its deadline, its approval, its publication and the evidence
 * beneath it. Storing the product would let it disagree with its own inputs;
 * the reader recomputes it on every read.
 *
 * WHY THE CLAIM IS DERIVED AND NEVER TYPED. "No instances identified" is a
 * finding, and a finding needs evidence. With no assessment on the record the
 * reader REFUSES the claim and prints the refusal; with findings it prints the
 * risks beside the sentence; with instances it prints them. Nobody types the
 * claim into this register.
 *
 * WHY AN ELEMENT IS A SEPARATE VERDICT. Six statutory content areas, six
 * verdicts. One reassuring word for the whole statement is the collapse this
 * register exists to refuse: the structure element can be evidenced while the
 * training element is not, and a reader must see which.
 *
 * MATRIX CORRECTNESS (ADR-0140/0141). A statement and a supplier name one to
 * four responsible hands. The reader resolves every ACTIVE line that holds each
 * of them through the ONE matrix engine, prints each hand's line position,
 * counts a person ONCE, and exposes the joint apex over every manager of every
 * holder. Where a hand is off the graph the row is printed as an orphan rather
 * than dropped, because deleting it would erase a live due-diligence duty from
 * the record.
 */

import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import {
  MSA_CLAIM_BY_KEY,
  MSA_CLAIM_KEYS,
  MSA_ELEMENT_BY_KEY,
  MSA_ELEMENT_KEYS,
  MSA_STATE_BY_KEY,
  MSA_STATE_KEYS,
} from './msaRegistry.js';
import {
  normalizeMsaApprovals,
  normalizeMsaAssessments,
  normalizeMsaDeadlines,
  normalizeMsaFindings,
  normalizeMsaMarkers,
  normalizeMsaPublications,
  normalizeMsaRemediations,
  normalizeMsaSettings,
  normalizeMsaStatements,
  normalizeMsaSuppliers,
  normalizeMsaTraining,
} from './msaSchema.js';
import { wholeDaysBetween } from './msaMath.js';

const list = (value) => (Array.isArray(value) ? value : []);

/** A readable label for a hand. The raw id `leader` never reaches a screen. */
export function msaPersonLabel(matrix, personId) {
  if (personId === LEADER_ID) return 'Workspace leader';
  const node = matrix?.nodes?.get(personId);
  if (node?.name) return node.name;
  const person = matrix?.roster?.get(personId);
  return person?.name || personId;
}

/**
 * Every ACTIVE line that holds a person, as `{ managerId, kind, shareH, lineId }`.
 * Read from the ONE matrix engine, so this register cannot drift from every
 * other roll-up in the workspace.
 */
export function msaActiveLinesFor(matrix, personId) {
  const lines = matrix?.linesByPerson?.get(personId) || [];
  return lines
    .filter((line) => line && line.active !== false && line.managerId && line.managerId !== personId)
    .map((line) => ({
      lineId: line.id || null,
      managerId: line.managerId,
      kind: line.kind || null,
      shareH: Number.isInteger(line.shareH) ? line.shareH : null,
    }))
    .sort((a, b) => String(a.managerId).localeCompare(String(b.managerId)));
}

/**
 * THE STATEMENT KERNEL. Pure over (statement, deadline, approval, publication,
 * suppliers, assessments, findings, remediations, training, todayDay,
 * conventions), exported so the suite can pin every branch without a store and
 * so the rule and the screen cannot disagree about a state.
 */
export function deriveModernSlavery({
  statement = null,
  deadline = null,
  approval = null,
  publication = null,
  suppliers = [],
  assessments = [],
  findings = [],
  remediations = [],
  training = [],
  todayDay = null,
  warnHorizonDays = 90,
  assessmentCycleDays = 365,
} = {}) {
  const supplierRows = [...list(suppliers)];
  const assessmentRows = [...list(assessments)].sort((a, b) => String(a.assessedOn).localeCompare(String(b.assessedOn)) || String(a.id).localeCompare(String(b.id)));
  const findingRows = [...list(findings)].sort((a, b) => String(a.identifiedOn).localeCompare(String(b.identifiedOn)) || String(a.id).localeCompare(String(b.id)));
  const remediationRows = [...list(remediations)].sort((a, b) => String(a.declaredOn).localeCompare(String(b.declaredOn)) || String(a.id).localeCompare(String(b.id)));
  const trainingRows = [...list(training)].sort((a, b) => String(a.trainingDay).localeCompare(String(b.trainingDay)) || String(a.id).localeCompare(String(b.id)));

  const remediationsByFinding = new Map();
  for (const row of remediationRows) {
    const held = remediationsByFinding.get(row.findingId) || [];
    held.push(row);
    remediationsByFinding.set(row.findingId, held);
  }

  /* ------------------------------------------------------------------ state */

  let state;
  let daysToDeadline = null;
  let daysOverdue = null;
  let dueSoon = false;

  if (!deadline) {
    state = { key: 'deadline-undeclared', ...MSA_STATE_BY_KEY['deadline-undeclared'] };
  } else {
    const remaining = wholeDaysBetween(todayDay, deadline.deadlineDay);
    daysToDeadline = remaining;
    if (!publication) {
      if (remaining !== null && remaining < 0) {
        state = { key: 'overdue-unpublished', ...MSA_STATE_BY_KEY['overdue-unpublished'] };
        daysOverdue = -remaining;
      } else if (approval) {
        state = { key: 'approved-unpublished', ...MSA_STATE_BY_KEY['approved-unpublished'] };
      } else {
        state = { key: 'awaiting-publication', ...MSA_STATE_BY_KEY['awaiting-publication'] };
      }
      dueSoon = remaining !== null && remaining >= 0 && Number.isInteger(warnHorizonDays) && remaining <= warnHorizonDays;
    } else {
      // Published: the state depends on whether the record supports it. The
      // deadline arithmetic still prints (a publication after its deadline is a
      // late publication, and the days figure says so).
      if (remaining !== null && remaining < 0) daysOverdue = -remaining;
      state = { key: 'published', ...MSA_STATE_BY_KEY.published };
    }
  }
  if (approval && !publication && state.key === 'deadline-undeclared') {
    // An approval with no deadline is still `deadline-undeclared` — the missing
    // clock is the more dangerous fact and outranks the approval.
    state = { key: 'deadline-undeclared', ...MSA_STATE_BY_KEY['deadline-undeclared'] };
  }
  const publishedLate = Boolean(publication && deadline && wholeDaysBetween(deadline.deadlineDay, publication.publishedDay) !== null
    && wholeDaysBetween(deadline.deadlineDay, publication.publishedDay) > 0);
  const publishedLateByDays = publishedLate ? wholeDaysBetween(deadline.deadlineDay, publication.publishedDay) : null;

  /* ---------------------------------------------------------- supplier coverage */

  const assessmentsBySupplier = new Map();
  for (const row of assessmentRows) {
    const held = assessmentsBySupplier.get(row.supplierId) || [];
    held.push(row);
    assessmentsBySupplier.set(row.supplierId, held);
  }

  const supplierStates = [];
  let assessedN = 0;
  let unassessedN = 0;
  let staleN = 0;
  for (const supplier of supplierRows) {
    const supplierAssessments = assessmentsBySupplier.get(supplier.id) || [];
    const latest = supplierAssessments[supplierAssessments.length - 1] || null;
    let coverage;
    if (!latest) {
      coverage = 'unassessed';
      unassessedN += 1;
    } else {
      const ageDays = wholeDaysBetween(latest.assessedOn, todayDay);
      if (Number.isInteger(assessmentCycleDays) && ageDays !== null && ageDays > assessmentCycleDays) {
        coverage = 'assessed-stale';
        staleN += 1;
      } else {
        coverage = 'assessed-current';
      }
      assessedN += 1;
    }
    supplierStates.push({ supplier, assessments: supplierAssessments, latest, coverage });
  }

  /* ---------------------------------------------------------------- findings */

  const findingsByAssessment = new Map();
  for (const row of findingRows) {
    const held = findingsByAssessment.get(row.assessmentId) || [];
    held.push(row);
    findingsByAssessment.set(row.assessmentId, held);
  }

  let instanceN = 0;
  let remediationOpenN = 0;
  const findingStates = [];
  for (const finding of findingRows) {
    const acts = remediationsByFinding.get(finding.id) || [];
    const completeActs = acts.filter((act) => act.status === 'complete');
    const open = completeActs.length === 0;
    if (open) remediationOpenN += 1;
    if (finding.findingKind === 'instance') instanceN += 1;
    findingStates.push({ finding, remediations: acts, completeActs, open });
  }

  // An assessment that reported issues but carries no finding printed beneath
  // it is a gap the reader names — the issues exist somewhere the record is not.
  const adverseOutcomes = new Set(['issues-found', 'unable-to-assess', 'refused-access']);
  const issuesWithoutFinding = assessmentRows.filter((row) => adverseOutcomes.has(row.outcome) && !(findingsByAssessment.get(row.id) || []).length);

  /* ---------------------------------------------------------------- elements */

  const trainingN = trainingRows.length;
  const assessmentsN = assessmentRows.length;

  const elements = MSA_ELEMENT_KEYS.map((key) => {
    const definition = MSA_ELEMENT_BY_KEY[key];
    if (key === 'structure') {
      const hasPopulation = supplierRows.length > 0;
      const hasRef = Boolean(statement?.structureRef);
      const evidenced = hasPopulation && hasRef;
      return {
        key, label: definition.label, says: definition.says, evidenced, count: supplierRows.length,
        reason: evidenced ? null
          : !hasRef && !hasPopulation ? 'No structure description is declared and no supplier population is on the record.'
            : !hasRef ? 'No structure description is declared; the supplier population alone does not describe the chains.'
              : 'No supplier is on the population; a description with no population describes nothing this record can check.',
      };
    }
    if (key === 'policies') {
      const evidenced = Boolean(statement?.policyRef);
      return {
        key, label: definition.label, says: definition.says, evidenced, count: evidenced ? 1 : 0,
        reason: evidenced ? null : 'No policy reference is declared on the statement.',
      };
    }
    if (key === 'due-diligence') {
      const evidenced = assessmentsN > 0;
      return {
        key, label: definition.label, says: definition.says, evidenced, count: assessmentsN,
        reason: evidenced ? null : 'No assessment is on the record for this statement, so no due diligence is evidenced.',
      };
    }
    if (key === 'risk-management') {
      const evidenced = assessmentsN > 0 && issuesWithoutFinding.length === 0 && remediationOpenN === 0;
      return {
        key, label: definition.label, says: definition.says, evidenced,
        count: findingStates.filter((row) => !row.open).length,
        reason: evidenced ? null
          : assessmentsN === 0 ? 'No assessment is on the record, so no risk management is evidenced.'
            : issuesWithoutFinding.length ? `${issuesWithoutFinding.length} assessment(s) reported an adverse outcome with no finding recorded beneath it.`
              : `${remediationOpenN} finding(s) have no complete remediation act on the record.`,
      };
    }
    if (key === 'effectiveness') {
      const evidenced = Boolean(statement?.effectivenessRef);
      return {
        key, label: definition.label, says: definition.says, evidenced, count: evidenced ? 1 : 0,
        reason: evidenced ? null : 'No effectiveness-measurement reference is declared on the statement.',
      };
    }
    // training
    const evidenced = trainingN > 0;
    return {
      key, label: definition.label, says: definition.says, evidenced, count: trainingN,
      reason: evidenced ? null : 'No training record is on the statement, so training is unevidenced.',
    };
  });

  const elementsEvidencedN = elements.filter((row) => row.evidenced).length;
  const elementsMissingN = elements.length - elementsEvidencedN;

  /* ------------------------------------------------------------------- claim */

  let claim;
  if (assessmentsN === 0) {
    claim = { key: 'refused', ...MSA_CLAIM_BY_KEY.refused };
  } else if (instanceN > 0) {
    claim = { key: 'instances-identified', ...MSA_CLAIM_BY_KEY['instances-identified'] };
  } else if (findingRows.length > 0) {
    claim = { key: 'risks-only', ...MSA_CLAIM_BY_KEY['risks-only'] };
  } else {
    claim = { key: 'none-identified', ...MSA_CLAIM_BY_KEY['none-identified'] };
  }

  /* --------------------------------------------- published-state refinement */

  const contentGaps = elementsMissingN > 0 || claim.key === 'refused' || remediationOpenN > 0;
  if (state.key === 'published' && contentGaps) {
    state = { key: 'published-with-gaps', ...MSA_STATE_BY_KEY['published-with-gaps'] };
  }

  return {
    state,
    deadline,
    approval,
    publication,
    daysToDeadline,
    daysOverdue,
    dueSoon,
    publishedLate,
    publishedLateByDays,
    supplierStates,
    assessedN,
    unassessedN,
    staleN,
    assessments: assessmentRows,
    findings: findingRows,
    findingStates,
    remediations: remediationRows,
    instanceN,
    remediationOpenN,
    issuesWithoutFinding,
    training: trainingRows,
    trainingN,
    elements,
    elementsEvidencedN,
    elementsMissingN,
    claim,
    contentGaps,
  };
}

/**
 * THE READER. Builds the whole register from stored declarations and the
 * injected clock. Every count it prints is recomputed here; nothing is cached.
 */
export function buildModernSlavery(state, { now = new Date(), settings = null, seat = null } = {}) {
  const warnings = [];
  const at = now instanceof Date ? now : new Date(now);
  const asOf = dayKey(at) || at.toISOString().slice(0, 10);
  const cfg = { ...(state?.settings || {}), ...(settings || {}) };
  const conventions = normalizeMsaSettings(cfg);

  const statements = normalizeMsaStatements(state?.msaStatements, warnings);
  const deadlines = normalizeMsaDeadlines(state?.msaDeadlines, statements, warnings);
  const approvals = normalizeMsaApprovals(state?.msaApprovals, statements, warnings);
  const publications = normalizeMsaPublications(state?.msaPublications, statements, warnings);
  const suppliers = normalizeMsaSuppliers(state?.msaSuppliers, warnings);
  const assessments = normalizeMsaAssessments(state?.msaAssessments, statements, suppliers, warnings);
  const findings = normalizeMsaFindings(state?.msaFindings, assessments, warnings);
  const remediations = normalizeMsaRemediations(state?.msaRemediations, findings, warnings);
  const training = normalizeMsaTraining(state?.msaTraining, statements, warnings);
  const markers = normalizeMsaMarkers(state?.msaMarkers, warnings);

  const deadlineByStatement = new Map(deadlines.map((row) => [row.statementId, row]));
  const approvalByStatement = new Map(approvals.map((row) => [row.statementId, row]));
  const publicationByStatement = new Map(publications.map((row) => [row.statementId, row]));

  const assessmentsByStatement = new Map();
  for (const row of assessments) {
    const held = assessmentsByStatement.get(row.statementId) || [];
    held.push(row);
    assessmentsByStatement.set(row.statementId, held);
  }
  const trainingByStatement = new Map();
  for (const row of training) {
    const held = trainingByStatement.get(row.statementId) || [];
    held.push(row);
    trainingByStatement.set(row.statementId, held);
  }
  const supplierIds = new Set(suppliers.map((row) => row.id));

  let matrix = null;
  let matrixError = null;
  try {
    matrix = buildMatrix(state, { now: at, settings: { ...cfg, activeSeatId: null } });
  } catch (error) {
    matrixError = `The reporting graph could not be read, so no line can be resolved and no joint seat can be asked: ${error?.message || 'unknown error'}.`;
  }
  const matrixNodeIds = new Set([...(matrix?.nodes?.keys?.() || []), ...(matrix?.roster?.keys?.() || []), LEADER_ID]);

  /* -------------------------------------------------------------------- rows */

  const rows = [];
  let orphanHolderN = 0;
  for (const statement of statements) {
    const responsibleIds = statement.responsibleIds || [];

    const holderRows = responsibleIds.map((personId) => {
      const onGraph = matrixNodeIds.has(personId);
      const lines = onGraph ? msaActiveLinesFor(matrix, personId) : [];
      return {
        personId,
        name: onGraph ? msaPersonLabel(matrix, personId) : null,
        onGraph,
        lines: lines.map((line) => ({ ...line, name: msaPersonLabel(matrix, line.managerId) })),
      };
    });
    const orphanHolders = holderRows.filter((row) => !row.onGraph);
    orphanHolderN += orphanHolders.length;

    const managerIds = [...new Set(holderRows.flatMap((row) => row.lines.map((line) => line.managerId)))].sort();
    const apex = managerIds.length ? matrixJointApex(matrix, managerIds) : null;
    const apexIds = list(apex?.apexIds).filter(Boolean);
    const apexId = apexIds.length === 1 ? apexIds[0] : null;
    const apexName = apexId ? msaPersonLabel(matrix, apexId) : null;

    const statementAssessments = (assessmentsByStatement.get(statement.id) || []).filter((row) => supplierIds.has(row.supplierId));
    const statementAssessmentIds = new Set(statementAssessments.map((row) => row.id));
    const statementFindings = findings.filter((row) => statementAssessmentIds.has(row.assessmentId));
    const statementFindingIds = new Set(statementFindings.map((row) => row.id));
    const statementRemediations = remediations.filter((row) => statementFindingIds.has(row.findingId));

    const derived = deriveModernSlavery({
      statement,
      deadline: deadlineByStatement.get(statement.id) || null,
      approval: approvalByStatement.get(statement.id) || null,
      publication: publicationByStatement.get(statement.id) || null,
      suppliers,
      assessments: statementAssessments,
      findings: statementFindings,
      remediations: statementRemediations,
      training: trainingByStatement.get(statement.id) || [],
      todayDay: asOf,
      warnHorizonDays: conventions.msaWarnHorizonDays,
      assessmentCycleDays: conventions.msaAssessmentCycleDays,
    });

    rows.push({
      statement,
      holderRows,
      orphan: holderRows.length > 0 && holderRows.every((row) => !row.onGraph),
      orphanHolders: orphanHolders.map((row) => row.personId),
      managerIds,
      managerRows: managerIds.map((managerId) => ({ managerId, name: msaPersonLabel(matrix, managerId) })),
      apex,
      apexIds,
      apexId,
      apexName,
      apexAmbiguous: Boolean(apex?.ambiguous) || apexIds.length > 1,
      ...derived,
    });
  }
  rows.sort((a, b) => {
    const urgency = [MSA_STATE_KEYS.indexOf(a.state.key), MSA_STATE_KEYS.indexOf(b.state.key)];
    if (urgency[0] !== urgency[1]) return urgency[0] - urgency[1];
    return String(a.statement.statementRef).localeCompare(String(b.statement.statementRef));
  });

  /* ------------------------------------------------------------------ totals */

  const states = Object.fromEntries(MSA_STATE_KEYS.map((key) => [key, 0]));
  for (const row of rows) states[row.state.key] = (states[row.state.key] || 0) + 1;

  // Supplier coverage is a PROGRAMME figure, printed once: the population is
  // declared once and each statement reads the same population. A supplier is
  // counted ONCE here no matter how many statements assess them.
  const supplierCoverage = new Map();
  for (const supplier of suppliers) {
    const supplierAssessments = assessments.filter((row) => row.supplierId === supplier.id);
    const latest = supplierAssessments[supplierAssessments.length - 1] || null;
    let coverage;
    if (!latest) coverage = 'unassessed';
    else {
      const ageDays = wholeDaysBetween(latest.assessedOn, asOf);
      coverage = Number.isInteger(conventions.msaAssessmentCycleDays) && ageDays !== null && ageDays > conventions.msaAssessmentCycleDays
        ? 'assessed-stale'
        : 'assessed-current';
    }
    supplierCoverage.set(supplier.id, coverage);
  }
  const supplierTotals = {
    suppliers: suppliers.length,
    assessed: [...supplierCoverage.values()].filter((value) => value !== 'unassessed').length,
    unassessed: [...supplierCoverage.values()].filter((value) => value === 'unassessed').length,
    stale: [...supplierCoverage.values()].filter((value) => value === 'assessed-stale').length,
    tierCounts: new Map(),
  };
  for (const supplier of suppliers) {
    supplierTotals.tierCounts.set(supplier.tier, (supplierTotals.tierCounts.get(supplier.tier) || 0) + 1);
  }

  const findingTotals = {
    findings: findings.length,
    instances: findings.filter((row) => row.findingKind === 'instance').length,
    remediations: remediations.length,
    remediationOpen: rows.reduce((sum, row) => sum + row.remediationOpenN, 0),
  };
  const elementTotals = Object.fromEntries(MSA_ELEMENT_KEYS.map((key) => [key, { evidenced: 0, missing: 0 }]));
  for (const row of rows) {
    for (const element of row.elements) {
      elementTotals[element.key][element.evidenced ? 'evidenced' : 'missing'] += 1;
    }
  }

  const totals = {
    statements: rows.length,
    deadlineUndeclared: states['deadline-undeclared'] || 0,
    overdueUnpublished: states['overdue-unpublished'] || 0,
    awaitingPublication: states['awaiting-publication'] || 0,
    approvedUnpublished: states['approved-unpublished'] || 0,
    publishedWithGaps: states['published-with-gaps'] || 0,
    published: states.published || 0,
    suppliers: supplierTotals.suppliers,
    assessed: supplierTotals.assessed,
    unassessed: supplierTotals.unassessed,
    stale: supplierTotals.stale,
    assessments: assessments.length,
    findings: findingTotals.findings,
    instances: findingTotals.instances,
    remediations: findingTotals.remediations,
    remediationOpen: findingTotals.remediationOpen,
    training: training.length,
    holders: new Set(rows.flatMap((row) => row.holderRows.map((holder) => holder.personId))).size,
    linesN: new Set(rows.flatMap((row) => row.managerIds)).size,
  };

  /* ------------------------------------------------------------- reconciliation */

  const statementIds = new Set(statements.map((row) => row.id));
  const supplierIdSet = new Set(suppliers.map((row) => row.id));
  const assessmentIdSet = new Set(assessments.map((row) => row.id));
  const findingIdSet = new Set(findings.map((row) => row.id));
  const balances = {
    // The FIRST claim: the printed state counts re-add to the statements they
    // summarise.
    statesReconcile: Object.values(states).reduce((sum, value) => sum + value, 0) === rows.length,
    // The SECOND claim, held apart: every child row ties to a parent on the
    // record.
    deadlinesReconcile: deadlines.every((row) => statementIds.has(row.statementId)),
    approvalsReconcile: approvals.every((row) => statementIds.has(row.statementId)),
    publicationsReconcile: publications.every((row) => statementIds.has(row.statementId)),
    assessmentsReconcile: assessments.every((row) => statementIds.has(row.statementId) && supplierIdSet.has(row.supplierId)),
    findingsReconcile: findings.every((row) => assessmentIdSet.has(row.assessmentId)),
    remediationsReconcile: remediations.every((row) => findingIdSet.has(row.findingId)),
    trainingReconcile: training.every((row) => statementIds.has(row.statementId)),
    oneDeadlinePerStatement: deadlines.length === new Set(deadlines.map((row) => row.statementId)).size,
    oneApprovalPerStatement: approvals.length === new Set(approvals.map((row) => row.statementId)).size,
    onePublicationPerStatement: publications.length === new Set(publications.map((row) => row.statementId)).size,
    oneStatementPerRef: statements.length === new Set(statements.map((row) => row.statementRef)).size,
    oneSupplierPerRef: suppliers.length === new Set(suppliers.map((row) => row.supplierRef)).size,
  };

  const incompleteReasons = [];
  if (warnings.length) incompleteReasons.push(`${warnings.length} stored row(s) were unreadable and were refused with a count; no figure was repaired.`);
  if (orphanHolderN) incompleteReasons.push(`${orphanHolderN} responsible hand(s) are not on the reporting graph; their line position cannot be resolved and the joint seat above them cannot be asked.`);
  if (matrixError) incompleteReasons.push(matrixError);
  if (!balances.statesReconcile) incompleteReasons.push('The printed state counts do not re-add to the statements they summarise.');
  if (!balances.deadlinesReconcile || !balances.approvalsReconcile || !balances.publicationsReconcile
    || !balances.assessmentsReconcile || !balances.findingsReconcile || !balances.remediationsReconcile || !balances.trainingReconcile) {
    incompleteReasons.push('A child row does not tie to a parent on the record.');
  }
  if (!balances.oneDeadlinePerStatement) incompleteReasons.push('A statement carries more than one deadline.');
  if (!balances.oneApprovalPerStatement) incompleteReasons.push('A statement carries more than one approval.');
  if (!balances.onePublicationPerStatement) incompleteReasons.push('A statement carries more than one publication.');
  if (!balances.oneStatementPerRef) incompleteReasons.push('A statement reference carries more than one statement.');
  if (!balances.oneSupplierPerRef) incompleteReasons.push('A supplier reference carries more than one supplier.');

  /* ----------------------------------------------------------------- disclosure */

  const detailed = !seat || seat.fullAccess || (Number.isInteger(seat.rank) ? seat.rank <= 4 : true);
  const disclosure = detailed
    ? { level: 'detail', reason: null, rank: seat?.rank ?? null }
    : {
      level: 'aggregate',
      reason: 'Responsible hands and supplier detail are withheld above rank 4; the statement states, the element matrix and the counts are organisational facts and stay printed. Which named supplier or individual is behind a particular finding is commercial and individual material, not enterprise reading.',
      rank: seat?.rank ?? null,
    };

  const attention = {
    deadlineUndeclaredN: states['deadline-undeclared'] || 0,
    overdueUnpublishedN: states['overdue-unpublished'] || 0,
    publishedWithGapsN: states['published-with-gaps'] || 0,
    remediationOpenN: totals.remediationOpen,
    claimRefusedN: rows.filter((row) => row.claim.key === 'refused').length,
    total: (states['deadline-undeclared'] || 0) + (states['overdue-unpublished'] || 0)
      + (states['published-with-gaps'] || 0) + totals.remediationOpen
      + rows.filter((row) => row.claim.key === 'refused').length,
  };

  return {
    ok: true,
    engineVersion: 'modern-slavery-2026.11-v1',
    matrix,
    asOf,
    nowIso: at.toISOString(),
    conventions,
    statements,
    deadlines,
    approvals,
    publications,
    suppliers,
    assessments,
    findings,
    remediations,
    training,
    markers,
    deadlineByStatement,
    approvalByStatement,
    publicationByStatement,
    supplierCoverage,
    supplierTotals,
    elementTotals,
    rows,
    detailed: Boolean(detailed),
    disclosure,
    warnings,
    matrixError,
    orphanHolderN,
    states,
    stateTotal: Object.values(states).reduce((sum, value) => sum + value, 0),
    balances,
    figuresComplete: incompleteReasons.length === 0,
    incompleteReasons,
    totals,
    stateRows: MSA_STATE_KEYS.map((key) => ({ key, label: MSA_STATE_BY_KEY[key].label, count: states[key] || 0 })),
    elementRows: MSA_ELEMENT_KEYS.map((key) => ({
      key,
      label: MSA_ELEMENT_BY_KEY[key].label,
      evidenced: elementTotals[key].evidenced,
      missing: elementTotals[key].missing,
    })),
    attention,
    seat: seat
      ? { rank: seat.rank ?? null, fullAccess: Boolean(seat.fullAccess), label: seat.label || '' }
      : { rank: null, fullAccess: true, label: 'whole register (no seat)' },
  };
}

/**
 * The navigation badge count. Counts DECISION-SHAPED duty — a statement with no
 * declared deadline, an overdue-unpublished statement, a published statement
 * the record does not support, an open remediation on a finding and a refused
 * claim — and never every statement on the register, so the badge reads as
 * "work owed now" rather than "how many statements we publish".
 */
export function msaAttentionCount(state, { now = new Date(), settings = null, seat = null } = {}) {
  try {
    const report = buildModernSlavery(state, { now, settings, seat });
    if (!report?.ok) return 0;
    return report.attention.total;
  } catch {
    return 0;
  }
}

/**
 * Insights signals. Five facts worth a leader's attention, each with the printed
 * evidence and a route — and none of them a score on a supplier or a person.
 */
export function msaSignals(state, now = new Date(), settings = null) {
  let report;
  try {
    report = buildModernSlavery(state, { now, settings, seat: null });
  } catch {
    return [];
  }
  if (!report?.ok) return [];
  const signals = [];
  const add = (signal) => signals.push({ domain: 'Modern slavery & due diligence', route: '#/modern-slavery', ...signal });
  const t = report.totals;

  if (t.deadlineUndeclared || t.overdueUnpublished) {
    add({
      ruleId: 'MSA-01',
      severity: 5,
      confidence: 'high',
      title: `${t.deadlineUndeclared} statement(s) carry no declared publication deadline and ${t.overdueUnpublished} are overdue and unpublished`,
      detail: 'The register holds no corporate calendar and will not invent one. A statutory publication window that nobody put on the record is a failure nobody can see coming; a deadline that passed with nothing published is a failure that has already happened.',
      action: { label: 'Open the statements', route: '#/modern-slavery' },
      evidence: [`${t.statements} statement(s) on the register`, `${report.deadlines.length} deadline(s) declared`],
    });
  }

  if (t.publishedWithGaps) {
    add({
      ruleId: 'MSA-02',
      severity: 4,
      confidence: 'high',
      title: `${t.publishedWithGaps} published statement(s) are not fully supported by the record`,
      detail: 'At least one content element is unevidenced, the claim about instances was refused, or a finding has no complete remediation act. The element matrix prints which; the headline never smooths it over.',
      action: { label: 'Open the statement evidence', route: '#/modern-slavery' },
      evidence: [`${t.published} fully supported statement(s)`],
    });
  }

  if (t.remediationOpen) {
    add({
      ruleId: 'MSA-03',
      severity: 5,
      confidence: 'high',
      title: `${t.remediationOpen} finding(s), including ${t.instances} identified instance(s), have no complete remediation act`,
      detail: 'A planned remediation is a promise, not a remedy. The finding stays open until an act is recorded complete with the document reference that proves it — and an identified instance is the finding the statement must speak to.',
      action: { label: 'Open findings & remediation', route: '#/modern-slavery?view=findings' },
      evidence: [`${t.findings} finding(s) on the record`, `${t.remediations} remediation act(s)`],
    });
  }

  if (t.unassessed) {
    add({
      ruleId: 'MSA-04',
      severity: 3,
      confidence: 'high',
      title: `${t.unassessed} supplier(s) on the declared population carry no assessment`,
      detail: 'A supplier on the population with no assessment in the cycle is printed as unassessed, never silently absent from the statement’s coverage. The population is what the statement describes; the gap is what it cannot yet evidence.',
      action: { label: 'Open the supply chain', route: '#/modern-slavery?view=supply' },
      evidence: [`${t.suppliers} supplier(s) on the population`, `${t.assessed} assessed`, `${t.stale} assessed but stale`],
    });
  }

  const refusedClaims = report.rows.filter((row) => row.claim.key === 'refused').length;
  if (refusedClaims) {
    add({
      ruleId: 'MSA-05',
      severity: 4,
      confidence: 'high',
      title: `${refusedClaims} statement(s) cannot support any claim about identified instances`,
      detail: 'With no assessment on the record the claim is REFUSED: "no instances identified" is a finding, and a finding needs evidence. The register prints the refusal rather than a reassurance.',
      action: { label: 'Open the statements', route: '#/modern-slavery' },
      evidence: [`${t.assessments} assessment(s) on the record`],
    });
  }

  return signals;
}
