/**
 * app/views/modernSlavery.js — `#/modern-slavery`, the Modern Slavery &
 * Supply-Chain Due-Diligence Statement Register (ADR-0260, Schema v212).
 *
 * ONE reader (`buildModernSlavery`) stands behind every state, element
 * verdict, claim, day count and open-remediation figure this page prints. The
 * page formats what the reader returned; it computes no state, no element and
 * no claim of its own.
 *
 * THE THINGS THIS SCREEN KEEPS APART
 *  - the STATEMENT (entity, financial year as declared, regime, the declared
 *    structure/policy/effectiveness references) and the DEADLINE (with its
 *    written basis — never computed from a financial-year end);
 *  - the APPROVAL and the PUBLICATION, two different dated acts;
 *  - the six CONTENT ELEMENTS, six evidenced-or-missing verdicts, never one
 *    reassuring word;
 *  - the CLAIM about instances — derived, never typed — and its REFUSAL where
 *    no assessment supports any claim;
 *  - the SUPPLIER population, the ASSESSMENTS behind each element, the FINDINGS
 *    and the REMEDIATION acts, with a plan never printed as a remedy.
 *
 * WHAT THE SCREEN REFUSES TO SAY. It does not say a statement with no declared
 * deadline has no deadline: it prints `deadline-undeclared` and files an ask.
 * It never prints "no instances identified" without assessments to support it.
 * It authors no statement text, gives no legal advice, and never scores a
 * supplier, a person or a line.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table, kv } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { exportWorkspaceCsv } from '../core/csv.js';
import {
  MSA_ASSESSMENT_KINDS,
  MSA_ASSESSMENT_OUTCOMES,
  MSA_CSV_SCOPE,
  MSA_FINDING_KINDS,
  MSA_HREF,
  MSA_LIMITS,
  MSA_METHOD,
  MSA_REGIMES,
  MSA_REMEDIATION_KINDS,
  MSA_SEVERITIES,
  MSA_SECTION_TITLES,
} from '../core/domain/msaRegistry.js';
import { dayLabel } from '../core/domain/msaMath.js';

const L = MSA_LIMITS;
const DIAGRAM_URL = './app/assets/modern-slavery-method.jpg';
const VIEWS = [
  { key: 'statements', label: MSA_SECTION_TITLES.statements },
  { key: 'supply', label: MSA_SECTION_TITLES.supply },
  { key: 'findings', label: MSA_SECTION_TITLES.findings },
  { key: 'training', label: MSA_SECTION_TITLES.training },
  { key: 'method', label: MSA_SECTION_TITLES.method },
];

const TONE = { bad: 'bad', warn: 'warn', good: 'good', neutral: 'neutral' };
const options = (rows, { blank = null } = {}) => [
  ...(blank ? [{ value: '', label: blank }] : []), ...rows.map((row) => ({ value: row.value, label: row.label })),
];

function button(label, onClick, { primary = false, testid = null } = {}) {
  return h('button', {
    type: 'button',
    class: `btn btn-small ${primary ? 'btn-primary' : 'btn-ghost'}`,
    ...(testid ? { 'data-testid': testid } : {}),
    onClick,
  }, label);
}

function stateBadge(state) {
  return h('span', {
    class: `badge badge-${TONE[state.tone] || 'neutral'}`,
    title: state.says,
    'data-testid': `msa-state-${state.key}`,
  }, state.label);
}

function elementBadge(element) {
  return h('span', {
    class: `badge badge-${element.evidenced ? 'good' : 'bad'}`,
    title: element.evidenced ? element.says : (element.reason || element.says),
    'data-testid': `msa-element-${element.key}`,
  }, element.evidenced ? `${element.label}: evidenced` : `${element.label}: not evidenced`);
}

/* -------------------------------------------------------------------- dialogs */

function statementDialog(ctx, report, candidates, onDone) {
  const form = buildForm([
    { name: 'statementRef', label: 'Statement reference', type: 'text', required: true, help: `At least ${L.shortMin} characters — the reference the programme files the statement under.` },
    { name: 'entityName', label: 'Reporting entity', type: 'text', required: true, help: `At least ${L.nameMin} characters — the entity the statement is published for.` },
    { name: 'fyLabel', label: 'Financial-year label', type: 'text', required: true, help: 'As declared — for example FY2025-26.' },
    { name: 'fyEndDay', label: 'Financial-year end (YYYY-MM-DD)', type: 'text', required: true, help: 'The declared year end. It is recorded, never used to compute a deadline.' },
    { name: 'regime', label: 'Reporting regime', type: 'select', required: true, options: options(MSA_REGIMES.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose a regime' }), help: 'The register never infers the regime of a statement from an entity or a date.' },
    { name: 'structureRef', label: 'Structure description reference (optional)', type: 'text', help: `At least ${L.shortMin} characters if given — the published description of the business and supply chains.` },
    { name: 'policyRef', label: 'Policy instrument reference (optional)', type: 'text', help: 'The anti-slavery policy the statement refers to. Its absence is printed as a missing element, never repaired.' },
    { name: 'effectivenessRef', label: 'Effectiveness-measurement reference (optional)', type: 'text', help: 'The KPIs or review mechanism. Its absence is printed as a missing element.' },
    {
      name: 'responsibleIds', label: 'Responsible hands (one to four)', type: 'boolean-block', required: true,
      options: candidates.map((row) => ({ value: row.id, label: `${row.name}${row.role ? ` — ${row.role}` : ''}` })),
      help: 'Every hand answerable for this statement, across every reporting line. The authority to answer for it is computed above ALL of them, so name all of them.',
    },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.msaRecordStatement({ ...form.getValues() });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The statement was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Statement recorded. The state, the elements and the claim are derived on read.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Record a statement',
    description: 'The entity, the financial year as declared and the regime. The publication deadline is declared separately, with its written basis.',
    size: 'lg',
    body: h('div', { class: 'stack' },
      banner({
        tone: 'caution',
        title: 'The financial-year end is recorded, never used to compute a deadline',
        body: 'The register holds no corporate calendar. The publication deadline is declared next, with the written basis that sets the window.',
      }),
      form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record statement', onClick: submit, primary: true }],
  });
}

function deadlineDialog(ctx, report, onDone) {
  const undecided = report.rows.filter((row) => !row.deadline).map((row) => ({ value: row.statement.id, label: `${row.statement.statementRef} — ${row.statement.entityName}` }));
  const form = buildForm([
    { name: 'statementId', label: 'Statement (no deadline declared yet)', type: 'select', required: true, options: options(undecided, { blank: 'Choose a statement' }), help: 'Only statements with no declared deadline need one. A second deadline for one statement would make the window ambiguous.' },
    { name: 'deadlineDay', label: 'Declared publication deadline (YYYY-MM-DD)', type: 'text', required: true, help: 'The day the regime’s window closes. The register never computes this from the financial-year end.' },
    { name: 'basisRef', label: 'Written basis', type: 'textarea', rows: 3, required: true, help: `At least ${L.textMin} characters — the instrument and the window it gives. A date nobody cited is refused.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.msaDeclareDeadline(form.getValues());
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The deadline was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Deadline declared with its written basis. The days remaining are derived on read.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Declare the publication deadline',
    description: 'The day and the written basis that sets the window. A deadline with no basis is refused.',
    body: h('div', { class: 'stack' }, form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Declare deadline', onClick: submit, primary: true }],
  });
}

function approvalDialog(ctx, report, onDone) {
  const undecided = report.rows.filter((row) => !row.approval).map((row) => ({ value: row.statement.id, label: `${row.statement.statementRef} — ${row.statement.entityName}` }));
  const form = buildForm([
    { name: 'statementId', label: 'Statement (no approval recorded yet)', type: 'select', required: true, options: options(undecided, { blank: 'Choose a statement' }) },
    { name: 'approvedDay', label: 'Approved day (YYYY-MM-DD)', type: 'text', required: true, help: 'The day the board approved the statement.' },
    { name: 'approvalRef', label: 'Board minute / written authority', type: 'text', required: true, help: `At least ${L.shortMin} characters. An approval with no reference is not a recorded act.` },
    { name: 'basisRef', label: 'Basis of the approval', type: 'textarea', rows: 3, required: true, help: `At least ${L.textMin} characters.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.msaRecordApproval(form.getValues());
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The approval was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Approval recorded. Approval is a fact and publication is another.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Record the board approval',
    description: 'The approved day and the minute reference. The register never treats an approval as a publication.',
    body: h('div', { class: 'stack' }, form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record approval', onClick: submit, primary: true }],
  });
}

function publicationDialog(ctx, report, onDone) {
  const undecided = report.rows.filter((row) => !row.publication).map((row) => ({ value: row.statement.id, label: `${row.statement.statementRef} — ${row.statement.entityName}` }));
  const form = buildForm([
    { name: 'statementId', label: 'Statement (not yet published)', type: 'select', required: true, options: options(undecided, { blank: 'Choose a statement' }) },
    { name: 'publishedDay', label: 'Published day (YYYY-MM-DD)', type: 'text', required: true },
    { name: 'publicationRef', label: 'Publication reference (URL or document path)', type: 'text', required: true, help: `At least ${L.shortMin} characters. A statement nobody can find is not a published statement.` },
    { name: 'basisRef', label: 'Basis of the publication', type: 'textarea', rows: 3, required: true, help: `At least ${L.textMin} characters.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.msaRecordPublication(form.getValues());
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The publication was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Publication recorded. The supported claim and the element matrix are derived on read.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Record the publication',
    description: 'The published day and the reference the statement went live at. The register prints whether the record supports what was published.',
    body: h('div', { class: 'stack' }, form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record publication', onClick: submit, primary: true }],
  });
}

function supplierDialog(ctx, report, candidates, onDone) {
  const form = buildForm([
    { name: 'supplierRef', label: 'Supplier reference', type: 'text', required: true, help: `At least ${L.shortMin} characters.` },
    { name: 'supplierName', label: 'Supplier name', type: 'text', required: true, help: `At least ${L.nameMin} characters.` },
    { name: 'tier', label: 'Declared tier (1–5)', type: 'number', min: 1, max: 5, required: true, help: 'The tier a human declared. The register computes no tier from spend and accepts no guessed one.' },
    { name: 'country', label: 'Country of operation (as declared)', type: 'text', required: true },
    { name: 'category', label: 'Supply category (as declared)', type: 'text', required: true },
    {
      name: 'responsibleIds', label: 'Responsible hands (one to four)', type: 'boolean-block', required: true,
      options: candidates.map((row) => ({ value: row.id, label: `${row.name}${row.role ? ` — ${row.role}` : ''}` })),
    },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.msaRecordSupplier({ ...values, tier: values.tier === '' || values.tier === undefined ? null : Number(values.tier) });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The supplier was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Supplier added to the declared population. Unassessed suppliers are printed, never silently absent.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Record a supplier',
    description: 'The declared population the statement describes. The tier is declared, never computed.',
    body: h('div', { class: 'stack' }, form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record supplier', onClick: submit, primary: true }],
  });
}

function assessmentDialog(ctx, report, onDone) {
  const suppliers = report.suppliers.map((row) => ({ value: row.id, label: `${row.supplierRef} — ${row.supplierName} (tier ${row.tier})` }));
  const statements = report.rows.map((row) => ({ value: row.statement.id, label: `${row.statement.statementRef} — ${row.statement.fyLabel}` }));
  const form = buildForm([
    { name: 'statementId', label: 'Statement (the cycle this assessment feeds)', type: 'select', required: true, options: options(statements, { blank: 'Choose a statement' }) },
    { name: 'supplierId', label: 'Supplier', type: 'select', required: true, options: options(suppliers, { blank: 'Choose a supplier' }) },
    { name: 'assessmentKind', label: 'Assessment kind', type: 'select', required: true, options: options(MSA_ASSESSMENT_KINDS.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose a kind' }), help: 'A signed clause is not an audit; the register never treats one as another.' },
    { name: 'outcome', label: 'Outcome', type: 'select', required: true, options: options(MSA_ASSESSMENT_OUTCOMES.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose an outcome' }), help: 'An outcome is never inferred from a kind. “Unable to assess” is never recorded as “no issues”.' },
    { name: 'assessedOn', label: 'Assessed day (YYYY-MM-DD)', type: 'text', required: true },
    { name: 'assessorRef', label: 'Assessor', type: 'text', required: true, help: `At least ${L.shortMin} characters.` },
    { name: 'evidenceRef', label: 'Evidence document reference', type: 'text', required: true, help: `At least ${L.instrumentMin} characters. An assessment with no evidence reference is refused: an unevidenced assessment is an intention, not due diligence.` },
    { name: 'basisRef', label: 'Basis of the assessment', type: 'textarea', rows: 3, required: true, help: `At least ${L.textMin} characters.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.msaRecordAssessment(form.getValues());
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The assessment was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Assessment recorded with its evidence reference.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Record a due-diligence assessment',
    description: 'One dated act of due diligence, bound to a supplier and a statement, with the evidence it rests on.',
    size: 'lg',
    body: h('div', { class: 'stack' }, form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record assessment', onClick: submit, primary: true }],
  });
}

function findingDialog(ctx, report, onDone) {
  const assessmentRows = [];
  for (const row of report.rows) {
    for (const assessment of row.assessments) {
      const supplier = report.suppliers.find((s) => s.id === assessment.supplierId);
      assessmentRows.push({ value: assessment.id, label: `${row.statement.statementRef} · ${supplier ? supplier.supplierName : assessment.supplierId} · ${assessment.assessmentKind} · ${assessment.assessedOn}` });
    }
  }
  const form = buildForm([
    { name: 'assessmentId', label: 'Assessment', type: 'select', required: true, options: options(assessmentRows, { blank: 'Choose an assessment' }) },
    { name: 'findingKind', label: 'Finding kind', type: 'select', required: true, options: options(MSA_FINDING_KINDS.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose a kind' }), help: 'A risk indicator is never recorded as an instance; the vocabulary refuses to blur them.' },
    { name: 'severity', label: 'Declared severity', type: 'select', required: true, options: options(MSA_SEVERITIES.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose a severity' }) },
    { name: 'identifiedOn', label: 'Identified day (YYYY-MM-DD)', type: 'text', required: true },
    { name: 'findingRef', label: 'Finding reference', type: 'text', required: true },
    { name: 'basisRef', label: 'Written description', type: 'textarea', rows: 3, required: true, help: `At least ${L.textMin} characters. A finding with no description is an assertion the register cannot audit.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.msaRecordFinding(form.getValues());
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The finding was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Finding recorded. An identified instance now owes a remediation act.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Record a finding',
    description: 'What the assessment identified, in writing, with the kind and severity a human declared.',
    body: h('div', { class: 'stack' }, form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record finding', onClick: submit, primary: true }],
  });
}

function remediationDialog(ctx, report, onDone) {
  const findingRows = [];
  for (const row of report.rows) {
    for (const findingState of row.findingStates) {
      findingRows.push({ value: findingState.finding.id, label: `${row.statement.statementRef} · ${findingState.finding.findingRef} · ${findingState.finding.findingKind} · ${findingState.open ? 'open' : 'remediated'}` });
    }
  }
  const form = buildForm([
    { name: 'findingId', label: 'Finding', type: 'select', required: true, options: options(findingRows, { blank: 'Choose a finding' }) },
    { name: 'remediationKind', label: 'Remediation kind', type: 'select', required: true, options: options(MSA_REMEDIATION_KINDS.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose a kind' }) },
    { name: 'status', label: 'Status', type: 'select', required: true, options: options([{ value: 'planned', label: 'Planned — a promise, closes nothing' }, { value: 'complete', label: 'Complete — an evidenced act' }], { blank: 'Choose a status' }), help: 'A plan is not a remedy. Only `complete` closes the finding, and it carries its evidence reference.' },
    { name: 'declaredOn', label: 'Declared day (YYYY-MM-DD)', type: 'text', required: true },
    { name: 'completedOn', label: 'Completed day (YYYY-MM-DD) — complete acts only', type: 'text' },
    { name: 'evidenceRef', label: 'Evidence document reference — complete acts only', type: 'text', help: `At least ${L.instrumentMin} characters. A closure nobody can prove is refused.` },
    { name: 'basisRef', label: 'Basis of the act', type: 'textarea', rows: 3, required: true, help: `At least ${L.textMin} characters.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.msaRecordRemediation(form.getValues());
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The remediation act was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Remediation act recorded.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Record a remediation act',
    description: 'What is being done for the workers and the chain. A planned act is a promise; a complete act is an evidenced fact.',
    body: h('div', { class: 'stack' }, form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record act', onClick: submit, primary: true }],
  });
}

function trainingDialog(ctx, report, onDone) {
  const statements = report.rows.map((row) => ({ value: row.statement.id, label: `${row.statement.statementRef} — ${row.statement.fyLabel}` }));
  const form = buildForm([
    { name: 'statementId', label: 'Statement', type: 'select', required: true, options: options(statements, { blank: 'Choose a statement' }) },
    { name: 'trainingDay', label: 'Training day (YYYY-MM-DD)', type: 'text', required: true },
    { name: 'populationRef', label: 'Population covered', type: 'text', required: true, help: `At least ${L.shortMin} characters — who was trained.` },
    { name: 'deliveryRef', label: 'Delivery reference', type: 'text', required: true, help: 'The course or session.' },
    { name: 'evidenceRef', label: 'Evidence document reference', type: 'text', required: true },
    { name: 'basisRef', label: 'Basis of the record', type: 'textarea', rows: 3, required: true },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.msaRecordTraining(form.getValues());
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The training record was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Training record recorded.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Record a training act',
    description: 'The training about modern slavery given to staff — the population, the delivery and the evidence.',
    body: h('div', { class: 'stack' }, form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record training', onClick: submit, primary: true }],
  });
}

function conventionsDialog(ctx, report, onDone) {
  const c = report.conventions;
  const form = buildForm([
    { name: 'msaWarnHorizonDays', label: 'Warning horizon (days)', type: 'number', min: 30, max: 730, value: c.msaWarnHorizonDays, help: 'Inside this band an unpublished statement is flagged as due.' },
    { name: 'msaAssessmentCycleDays', label: 'Assessment cycle (days)', type: 'number', min: 90, max: 3650, value: c.msaAssessmentCycleDays, help: 'Beyond this age an assessment is printed as stale.' },
    { name: 'msaPrivacyFloor', label: 'Privacy floor', type: 'number', min: 2, max: 20, value: c.msaPrivacyFloor, help: 'Below this count a per-state export is withheld BLANK with its reason.' },
    { name: 'msaAutoPropagate', label: 'Rule asks (RULE-MSA-01)', type: 'select', options: options([{ value: 'on', label: 'On — asks are filed' }, { value: 'off', label: 'Paused — no asks' }], { blank: null }), value: c.msaAutoPropagate === false ? 'off' : 'on' },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.msaSetConventions({
      msaWarnHorizonDays: values.msaWarnHorizonDays === '' ? undefined : Number(values.msaWarnHorizonDays),
      msaAssessmentCycleDays: values.msaAssessmentCycleDays === '' ? undefined : Number(values.msaAssessmentCycleDays),
      msaPrivacyFloor: values.msaPrivacyFloor === '' ? undefined : Number(values.msaPrivacyFloor),
      msaAutoPropagate: values.msaAutoPropagate !== 'off',
    });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The conventions were refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Conventions saved. Out-of-bounds values are refused at the door, never clamped.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Register conventions',
    description: 'Three bounded conventions and the rule switch. The register holds no corporate calendar, so there is no deadline default and no regime window.',
    body: h('div', { class: 'stack' }, form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Save conventions', onClick: submit, primary: true }],
  });
}

/* --------------------------------------------------------------------- panels */

function summaryCard(report) {
  const t = report.totals;
  return card({
    title: 'What the record supports at this instant',
    subtitle: 'Every figure is derived on read from declared statements, acts and evidence. No state is stored, no claim is typed, and a statement with no declared deadline is never printed as though it had none.',
    body: h('div', { class: 'stat-grid' },
      stat({ label: 'Statements', value: h('span', { 'data-testid': 'msa-count-statements' }, String(t.statements)), hint: `${t.published} published` }),
      stat({ label: 'Deadline undeclared', value: h('span', { 'data-testid': 'msa-count-undeclared' }, String(t.deadlineUndeclared)), hint: 'no clock on the record' }),
      stat({ label: 'Overdue, unpublished', value: h('span', { 'data-testid': 'msa-count-overdue' }, String(t.overdueUnpublished)), hint: 'window already closed' }),
      stat({ label: 'Published with gaps', value: h('span', { 'data-testid': 'msa-count-gaps' }, String(t.publishedWithGaps)), hint: `${t.published} fully supported` }),
      stat({ label: 'Suppliers', value: h('span', { 'data-testid': 'msa-count-suppliers' }, String(t.suppliers)), hint: `${t.assessed} assessed · ${t.unassessed} unassessed` }),
      stat({ label: 'Findings', value: h('span', { 'data-testid': 'msa-count-findings' }, String(t.findings)), hint: `${t.instances} identified instance(s)` }),
      stat({ label: 'Remediation open', value: h('span', { 'data-testid': 'msa-count-open' }, String(t.remediationOpen)), hint: 'a plan is not a remedy' }),
      stat({ label: 'Your attention', value: h('span', { 'data-testid': 'msa-count-attention' }, String(report.attention.total)), hint: 'clock, gaps, open acts, refused claims' }),
    ),
  });
}

function msaBanners(report) {
  const b = report.balances;
  const parts = b.statesReconcile && b.deadlinesReconcile && b.approvalsReconcile && b.publicationsReconcile
    && b.assessmentsReconcile && b.findingsReconcile && b.remediationsReconcile && b.trainingReconcile
    && b.oneDeadlinePerStatement && b.oneApprovalPerStatement && b.onePublicationPerStatement
    && b.oneStatementPerRef && b.oneSupplierPerRef;
  return h('div', { class: 'stack' },
    banner({
      tone: parts ? 'info' : 'bad',
      title: parts
        ? 'The parts re-add: every deadline, approval, publication, assessment, finding, remediation act and training record ties to the parent it summarises'
        : 'The printed counts do NOT re-add to the rows they summarise',
      body: `States ${report.stateTotal} of ${report.totals.statements} statement(s) · ${report.deadlines.length} deadline(s) · ${report.approvals.length} approval(s) · ${report.publications.length} publication(s) · ${report.assessments.length} assessment(s) · ${report.findings.length} finding(s) · ${report.remediations.length} remediation act(s) · ${report.training.length} training record(s). This is the first claim. It says nothing about whether the register could see everything.`,
    }),
    banner({
      tone: report.figuresComplete ? 'good' : 'caution',
      title: report.figuresComplete
        ? 'Coverage is complete: every stored row was read exactly and every responsible hand has a resolvable line position'
        : 'NOT CERTIFIED — the register could not see the whole picture',
      body: report.figuresComplete
        ? 'The second claim, separate from the first: no unreadable row, no orphan hand and no unresolvable reporting graph is outstanding.'
        : report.incompleteReasons.join(' '),
    }),
    banner({
      tone: 'info',
      title: 'The claim about instances is derived, never typed',
      body: 'With no assessment on the record the claim is REFUSED: “no instances identified” is a finding, and a finding needs evidence. Risks without instances and instances themselves are different claims, printed apart.',
    }),
    report.detailed ? null : banner({ tone: 'caution', title: 'Responsible hands withheld at this altitude', body: report.disclosure.reason }),
  );
}

function statementFlags(row) {
  const flags = [];
  if (row.claim.key === 'refused') flags.push(badge('claim refused', 'bad'));
  if (row.elementsMissingN) flags.push(badge(`${row.elementsMissingN} element(s) unevidenced`, 'warn'));
  if (row.remediationOpenN) flags.push(badge(`${row.remediationOpenN} remediation open`, 'warn'));
  if (row.publishedLate) flags.push(badge(`published ${row.publishedLateByDays} day(s) late`, 'warn'));
  if (row.orphan) flags.push(badge('orphan — no resolvable line', 'warn'));
  return flags.length ? h('div', { class: 'row-actions' }, ...flags) : '—';
}

function statementsTable(ctx, report, candidates, onDone) {
  return card({
    title: 'Statements, by clock urgency',
    subtitle: 'Sorted by the derived state. The statement, the deadline, the approval, the publication and the evidence are declared; the state, the six element verdicts and the claim are derived.',
    body: report.rows.length
      ? table({
        columns: [
          { label: 'Statement', render: (row) => h('div', null, h('div', null, row.statement.statementRef), h('div', { class: 'small muted' }, `${row.statement.entityName} · ${row.statement.fyLabel}`)) },
          { label: 'Deadline', render: (row) => (row.deadline ? h('div', null, h('div', null, row.deadline.deadlineDay), h('div', { class: 'small muted' }, row.daysToDeadline !== null ? dayLabel(row.daysToDeadline) : (row.daysOverdue !== null ? `${row.daysOverdue} days overdue` : ''))) : badge('none declared', 'bad')) },
          { label: 'Approval', render: (row) => (row.approval ? row.approval.approvedDay : '—') },
          { label: 'Published', render: (row) => (row.publication ? row.publication.publishedDay : '—') },
          { label: 'Elements', render: (row) => `${row.elementsEvidencedN}/6 evidenced` },
          { label: 'Claim', render: (row) => (row.claim.key === 'refused' ? badge('refused', 'bad') : badge(row.claim.key, row.claim.key === 'instances-identified' ? 'warn' : 'neutral')) },
          { label: 'State', render: (row) => stateBadge(row.state) },
          { label: 'Flags', render: (row) => statementFlags(row) },
          {
            label: '',
            render: (row) => button(
              row.deadline ? (row.approval ? 'Record publication' : 'Record approval') : 'Declare a deadline',
              () => (row.deadline ? (row.approval ? publicationDialog(ctx, report, onDone) : approvalDialog(ctx, report, onDone)) : deadlineDialog(ctx, report, onDone)),
              { testid: 'msa-action-next' },
            ),
          },
        ],
        rows: report.rows,
        caption: 'Statement schedule',
        emptyMessage: 'No statement is on the register. Record a statement to begin; the deadline is declared next, with its written basis.',
      })
      : emptyState({
        title: 'No statement on the register',
        body: 'Record a statement to begin the programme record. The deadline, the approval, the publication and the evidence are declared as separate dated acts.',
      }),
  });
}

function elementMatrix(report) {
  return card({
    title: 'The six content elements, each its own verdict',
    subtitle: 'Six statutory content areas, six evidenced-or-missing facts, each with its count and its reason. One reassuring word for the whole statement is the collapse this register exists to refuse.',
    body: report.rows.length
      ? table({
        columns: [
          { label: 'Statement', render: (row) => row.statement.statementRef },
          ...report.elementRows.map((element) => ({
            label: element.label,
            render: (row) => {
              const verdict = row.elements.find((entry) => entry.key === element.key);
              return verdict.evidenced
                ? badge(`evidenced (${verdict.count})`, 'good')
                : h('span', { class: 'small', title: verdict.reason || '' }, badge('not evidenced', 'bad'));
            },
          })),
          { label: 'Claim', render: (row) => (row.claim.key === 'refused' ? h('span', { class: 'small', title: row.claim.says }, badge('refused', 'bad')) : h('span', { class: 'small', title: row.claim.says }, badge(row.claim.key, 'neutral'))) },
        ],
        rows: report.rows,
        caption: 'Element matrix',
        emptyMessage: 'No statement is on the register.',
      })
      : emptyState({ title: 'No element matrix yet', body: 'Record a statement; its six elements are derived from the evidence beneath it.' }),
  });
}

function supplyPanel(ctx, report, candidates, onDone) {
  return h('div', { class: 'stack' },
    card({
      title: 'The declared supplier population',
      subtitle: 'The tier is declared by a human, never computed from spend. A supplier with no assessment in the cycle is printed as unassessed, never silently absent from the statement’s coverage.',
      body: report.suppliers.length
        ? table({
          columns: [
            { label: 'Supplier', render: (row) => h('div', null, h('div', null, row.supplierRef), h('div', { class: 'small muted' }, row.supplierName)) },
            { label: 'Tier', render: (row) => `Tier ${row.tier}` },
            { label: 'Country', render: (row) => row.country },
            { label: 'Category', render: (row) => row.category },
            { label: 'Coverage', render: (row) => {
              const coverage = report.supplierCoverage.get(row.id);
              return coverage === 'assessed-current' ? badge('assessed', 'good')
                : coverage === 'assessed-stale' ? badge('assessed — stale', 'warn')
                  : badge('unassessed', 'bad');
            } },
          ],
          rows: report.suppliers,
          caption: 'Supply chain population',
          emptyMessage: 'No supplier is on the population. A statement with no population cannot evidence its supply-chain element.',
        })
        : emptyState({ title: 'No supplier on the population', body: 'Record the suppliers the statement describes; assessments are recorded against them.' }),
    }),
    report.suppliers.length ? h('div', { class: 'row-actions' },
      button('Record a supplier', () => supplierDialog(ctx, report, candidates, onDone)),
      button('Record an assessment', () => assessmentDialog(ctx, report, onDone))) : null,
  );
}

function findingsPanel(ctx, report, candidates, onDone) {
  const rows = [];
  for (const row of report.rows) {
    for (const findingState of row.findingStates) {
      rows.push({ ...findingState, statement: row.statement, managerIds: row.managerIds });
    }
  }
  return h('div', { class: 'stack' },
    card({
      title: 'Findings and the remediation acts behind them',
      subtitle: 'A risk indicator is never printed as an instance. A planned act is a promise; only a complete act with its evidence reference closes a finding.',
      body: rows.length
        ? table({
          columns: [
            { label: 'Statement', render: (row) => row.statement.statementRef },
            { label: 'Finding', render: (row) => h('div', null, h('div', null, row.finding.findingRef), h('div', { class: 'small muted' }, `${row.finding.findingKind} · ${row.finding.severity} · ${row.finding.identifiedOn}`)) },
            { label: 'Remediation acts', render: (row) => `${row.remediations.length}` },
            { label: 'Status', render: (row) => (row.open ? badge('remediation open', 'bad') : badge('remediated', 'good')) },
            { label: 'Latest act', render: (row) => (row.remediations.length ? `${row.remediations[row.remediations.length - 1].remediationKind} · ${row.remediations[row.remediations.length - 1].status}` : '—') },
          ],
          rows,
          caption: 'Findings & remediation',
          emptyMessage: 'No finding is on the register. A finding is recorded against an assessment; an identified instance then owes a remediation act.',
        })
        : emptyState({ title: 'No finding on the register', body: 'Record findings against assessments. The open count is derived: a plan closes nothing.' }),
    }),
    rows.length ? h('div', { class: 'row-actions' },
      button('Record a finding', () => findingDialog(ctx, report, onDone)),
      button('Record a remediation act', () => remediationDialog(ctx, report, onDone))) : null,
  );
}

function trainingPanel(ctx, report, candidates, onDone) {
  const rows = [];
  for (const row of report.rows) {
    for (const record of row.training) rows.push({ ...record, statement: row.statement });
  }
  return h('div', { class: 'stack' },
    card({
      title: 'Training records',
      subtitle: 'The training about modern slavery given to staff — the population covered, the delivery and the evidence. The training element is evidenced by dated records, never by a promise.',
      body: rows.length
        ? table({
          columns: [
            { label: 'Statement', render: (row) => row.statement.statementRef },
            { label: 'Day', render: (row) => row.trainingDay },
            { label: 'Population', render: (row) => row.populationRef },
            { label: 'Delivery', render: (row) => row.deliveryRef },
            { label: 'Evidence', render: (row) => row.evidenceRef },
          ],
          rows,
          caption: 'Training',
          emptyMessage: 'No training record is on the register, so the training element is unevidenced wherever it is claimed.',
        })
        : emptyState({ title: 'No training record', body: 'Record a training act with its population and evidence.' }),
    }),
    report.rows.length ? h('div', { class: 'row-actions' },
      button('Record a training act', () => trainingDialog(ctx, report, onDone))) : null,
  );
}

function methodView(report) {
  return h('div', { class: 'stack' },
    card({
      title: 'What this register is, and what it refuses to be',
      body: h('div', { class: 'stack' },
        h('img', {
          src: DIAGRAM_URL,
          alt: 'A method figure showing a modern slavery statement bound to its declared supplier population; six content elements each evidenced or named as missing; a publication deadline declared with its written basis and never computed from the financial-year end; the derived claim about instances beside the assessments behind it; and an identified instance with the remediation act that closes it only when evidenced.',
          class: 'method-figure',
        }),
        kv('Engine', MSA_METHOD.engine),
        kv('Decision record', MSA_METHOD.adr),
        kv('CSV scope', MSA_CSV_SCOPE),
        kv('As at', `${report.asOf} (${report.nowIso})`),
        h('h3', null, 'Frameworks applied'),
        h('ul', null, ...MSA_METHOD.frameworks.map((line) => h('li', null, line))),
        h('h3', null, 'What is printed'),
        h('ul', null, ...MSA_METHOD.printed.map((line) => h('li', null, line))),
        h('h3', null, 'Deliberately absent'),
        h('ul', null, ...MSA_METHOD.deliberatelyAbsent.map((line) => h('li', null, line))),
        h('h3', null, 'Disclosure'),
        banner({ tone: 'caution', title: 'A rendering contract, not an authentication boundary', body: 'Seats in this workspace are workflow declarations, not logins. The reader withholds responsible hands and supplier detail above rank 4, and this page says so rather than implying a permission system the workspace cannot enforce. The export carries counts and published-vocabulary keys only.' }),
      ),
    }),
  );
}

/* ------------------------------------------------------------------------ page */

export function renderModernSlavery(ctx) {
  const view = ctx.query?.get?.('view') || 'statements';
  let report;
  try {
    const result = ctx.api.msaReport();
    if (!result?.ok) {
      return h('div', { class: 'stack' },
        pageHeader({ eyebrow: 'Governance · modern slavery', title: 'Modern slavery & supply-chain due diligence', subtitle: 'What the statement says, and what the record supports.' }),
        banner({ tone: 'bad', title: 'The register could not be read', body: result?.error || 'The seat could not be resolved.' }));
    }
    report = result.report;
  } catch (error) {
    return h('div', { class: 'stack' },
      pageHeader({ eyebrow: 'Governance · modern slavery', title: 'Modern slavery & supply-chain due diligence' }),
      banner({ tone: 'bad', title: 'The register could not be read', body: error?.message || 'Unknown error.' }));
  }

  let candidates = [];
  try {
    const result = ctx.api.msaCandidates();
    if (result?.ok) candidates = result.people;
  } catch { candidates = []; }

  const onDone = () => {
    document.dispatchEvent(new CustomEvent('leados:navigate', { detail: { route: MSA_HREF } }));
    ctx.rerender?.();
  };
  const local = { api: ctx.api };
  const viewKey = VIEWS.some((row) => row.key === view) ? view : 'statements';

  const exportCsv = () => {
    try {
      const file = exportWorkspaceCsv(ctx.api.getState ? ctx.api.getState() : ctx.state, MSA_CSV_SCOPE);
      if (!file?.ok) { toast(file?.error || 'The export produced no file.', 'bad'); return; }
      downloadText({ filename: file.filename, text: file.csv, mime: 'text/csv' });
      toast('Exported. Counts and published-vocabulary keys only: no statement reference, entity, supplier, country, finding, person or day crosses this boundary.', 'good');
    } catch (error) {
      toast(error?.message || 'The export failed.', 'bad');
    }
  };

  const header = pageHeader({
    eyebrow: 'Governance · modern slavery',
    title: 'Modern slavery & supply-chain due-diligence statement register',
    subtitle: 'Each statement bound to its declared publication deadline and written basis, the board approval, the publication act, the declared supplier population, the dated assessments behind each content element, the findings and their remediation acts — with the claim about instances derived from the evidence, never typed.',
    actions: [
      { label: 'Record a statement', onClick: () => statementDialog(local, report, candidates, onDone), primary: true },
      { label: 'Export (counts)', onClick: exportCsv },
      { label: 'Conventions', onClick: () => conventionsDialog(local, report, onDone) },
    ],
    meta: [
      `As at ${report.asOf}`,
      `${report.totals.statements} statement(s)`,
      `${report.totals.deadlineUndeclared} undeclared`,
      `${report.totals.overdueUnpublished} overdue`,
      report.detailed ? 'names shown' : 'counts only at this altitude',
    ],
  });

  const body = h('div', { class: 'stack' },
    summaryCard(report),
    msaBanners(report),
    tabs({ items: VIEWS, active: viewKey, onSelect: (key) => { window.location.hash = `${MSA_HREF}?view=${key}`; }, ariaLabel: 'Modern slavery register sections' }),
    viewKey === 'supply' ? supplyPanel(local, report, candidates, onDone)
      : viewKey === 'findings' ? findingsPanel(local, report, candidates, onDone)
        : viewKey === 'training' ? trainingPanel(local, report, candidates, onDone)
          : viewKey === 'method' ? methodView(report)
            : h('div', { class: 'stack' }, statementsTable(local, report, candidates, onDone), elementMatrix(report)),
    viewKey !== 'method' ? h('div', { class: 'row-actions' },
      button('Record a statement', () => statementDialog(local, report, candidates, onDone)),
      button('Declare a deadline', () => deadlineDialog(local, report, onDone)),
      button('Record an approval', () => approvalDialog(local, report, onDone)),
      button('Record a publication', () => publicationDialog(local, report, onDone)),
      button('Record an assessment', () => assessmentDialog(local, report, onDone)),
      button('Record a finding', () => findingDialog(local, report, onDone)),
      button('Record a remediation act', () => remediationDialog(ctx, report, onDone)),
      button('Record a training act', () => trainingDialog(local, report, onDone))) : null,
    report.warnings.length
      ? card({
        title: 'Unreadable rows, counted and refused',
        subtitle: 'Nothing here was repaired: a stored row this register cannot read exactly is dropped with a count rather than guessed at.',
        body: h('ul', null, ...report.warnings.slice(0, 20).map((line) => h('li', { class: 'small' }, line))),
      })
      : null,
  );

  return h('div', { class: 'stack' }, header, body);
}
