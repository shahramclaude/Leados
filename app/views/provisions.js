/**
 * app/views/provisions.js — `#/provisions`, the Provision & Reimbursement
 * Register (ADR-0250, Schema v204).
 *
 * ONE reader (`buildProvisions`) stands behind every state, best estimate,
 * provision, reimbursement asset, net exposure and reconciliation verdict this
 * page prints. The page formats what the reader returned; it computes no
 * provision, no asset and no gap of its own.
 *
 * THE FIVE THINGS THIS SCREEN KEEPS APART
 *  - the CLASSIFICATION (probable / possible / remote) and the best-estimate
 *    method, which are declared accounting judgments — never inferred;
 *  - the PROVISION the record supports, derived from the classification and the
 *    best estimate;
 *  - the REIMBURSEMENT ASSET, recognized only when it is virtually certain and
 *    capped at the provision, with any excess printed;
 *  - the NET EXPOSURE, printed apart from both;
 *  - the RECONCILIATION against the figure finance declares it is carrying, with
 *    the exact gap printed.
 *
 * WHAT THE SCREEN REFUSES TO SAY. It does not say a matter with no assessment has
 * no provision: it prints `unassessed` and files an ask. It does not round an
 * expected value. It does not recognize an asset above the provision. It gives no
 * accounting advice and never scores a person or a line.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table, kv } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { exportWorkspaceCsv } from '../core/csv.js';
import {
  PROV_CSV_SCOPE,
  PROV_HREF,
  PROV_LIMITS,
  PROV_CLASSIFICATIONS,
  PROV_ESTIMATE_METHODS,
  PROV_METHOD,
  PROV_SECTION_TITLES,
} from '../core/domain/prvRegistry.js';
import { moneyLabel } from '../core/domain/prvMath.js';

const L = PROV_LIMITS;
const DIAGRAM_URL = './app/assets/provision-reimbursement-method.jpg';
const VIEWS = [
  { key: 'provisions', label: PROV_SECTION_TITLES.provisions },
  { key: 'scenarios', label: PROV_SECTION_TITLES.scenarios },
  { key: 'reimbursements', label: PROV_SECTION_TITLES.reimbursements },
  { key: 'reconciliation', label: PROV_SECTION_TITLES.reconciliation },
  { key: 'method', label: PROV_SECTION_TITLES.method },
];

const TONE = { bad: 'bad', warn: 'warn', good: 'good', neutral: 'neutral' };
const options = (rows, { blank = null } = {}) => [
  ...(blank ? [{ value: '', label: blank }] : []),
  ...rows.map((row) => ({ value: row.value, label: row.label })),
];
const todayIso = () => new Date().toISOString().slice(0, 10);

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
    'data-testid': `prv-state-${state.key}`,
  }, state.label);
}

const matterLabel = (row) => `${row.matter.matterRef}`;
const moneyIn = (report, minor, currency) => moneyLabel(minor, currency || report.totals.currencies[0] || 'GBP');

/* -------------------------------------------------------------------- dialogs */

function assessmentDialog(ctx, report, candidates, onDone) {
  const openMatters = report.rows.map((row) => ({ value: row.matter.id, label: `${row.matter.matterRef} — ${row.matter.claimType || 'matter'}` }));
  const form = buildForm([
    { name: 'matterId', label: 'Open matter (from the claim register)', type: 'select', required: true, options: options(openMatters, { blank: 'Choose a matter' }), help: 'Only open matters need an assessment. A resolved or merged matter carries no open obligation.' },
    { name: 'classification', label: 'Classification', type: 'select', required: true, options: options(PROV_CLASSIFICATIONS.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose a classification' }), help: 'Probable, possible and remote are three different accounting verdicts. The register never infers one from an amount.' },
    { name: 'estimateMethod', label: 'Best-estimate method', type: 'select', required: true, options: options(PROV_ESTIMATE_METHODS.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose a method' }), help: 'A single most-likely outcome, or a probability-weighted expected value over declared scenarios.' },
    { name: 'mostLikelyMinor', label: 'Most-likely amount, minor units', type: 'number', min: 0, help: 'Required for a most-likely assessment. A whole number of minor units — 2500000 is £25,000.00. A fractional value is refused, never rounded.' },
    { name: 'currency', label: 'Currency', type: 'text', required: true, value: 'GBP', help: 'Three letters. Amounts in this register are exact minor units in one named currency.' },
    { name: 'basisRef', label: 'Basis for the assessment', type: 'textarea', rows: 3, required: true, help: `At least ${L.textMin} characters — the accounting judgement, the regime applied, the evidence behind the classification.` },
    {
      name: 'responsibleIds', label: 'Responsible hands (one to four)', type: 'boolean-block', required: true,
      options: candidates.map((row) => ({ value: row.id, label: `${row.name}${row.role ? ` — ${row.role}` : ''}` })),
      help: 'Every hand answerable for this provision, across every reporting line. The authority to answer for it is computed above ALL of them, so name all of them.',
    },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.provisionDeclareAssessment({
      ...values,
      mostLikelyMinor: values.mostLikelyMinor === '' || values.mostLikelyMinor === undefined ? null : Number(values.mostLikelyMinor),
      responsibleIds: values.responsibleIds,
    });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The assessment was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Assessment declared. The provision, any reimbursement asset and the reconciliation are derived on read.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Declare a provision assessment',
    description: 'The classification, the best-estimate method and the hands responsible for it. The provision is derived on read.',
    size: 'lg',
    body: h('div', { class: 'stack' },
      banner({
        tone: 'caution',
        title: 'A classification is a declared judgement, never inferred',
        body: 'Probable, possible and remote are three different verdicts. A most-likely assessment must carry its exact amount; an expected-value assessment gets its figure from the scenarios you declare next.',
      }),
      form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Declare assessment', onClick: submit, primary: true }],
  });
}

function scenarioDialog(ctx, report, onDone) {
  const assessed = report.rows.filter((row) => row.assessment).map((row) => ({ value: row.matter.id, label: `${row.matter.matterRef} — ${row.assessment.estimateMethod}` }));
  const form = buildForm([
    { name: 'matterId', label: 'Matter (must carry an assessment)', type: 'select', required: true, options: options(assessed, { blank: 'Choose a matter' }), help: 'A scenario belongs to an assessed matter. The expected value is computed only for an expected-value assessment.' },
    { name: 'outcome', label: 'Outcome', type: 'text', required: true, help: `At least ${L.shortMin} characters — the outcome this scenario represents.` },
    { name: 'probabilityBps', label: 'Probability (basis points, 0–10000)', type: 'number', min: 0, max: L.probabilityBpsMax, required: true, help: '10000 is 100%. The set must sum to exactly 100% or the reader refuses the expected value.' },
    { name: 'amountMinor', label: 'Amount, minor units', type: 'number', min: 0, required: true, help: 'A whole number of minor units. A fractional value is refused, never rounded.' },
    { name: 'currency', label: 'Currency', type: 'text', required: true, value: 'GBP' },
    { name: 'basisRef', label: 'Basis for the scenario', type: 'textarea', rows: 3, required: true, help: `At least ${L.textMin} characters — the evidence behind the outcome and its probability.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.provisionDeclareScenario({
      matterId: values.matterId,
      outcome: values.outcome,
      probabilityBps: Number(values.probabilityBps),
      amountMinor: Number(values.amountMinor),
      currency: values.currency,
      basisRef: values.basisRef,
    });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The scenario was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Scenario declared. The expected value is derived on read and a set that is not exactly 100% is refused.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Declare a scenario',
    description: 'One outcome of an expected-value best estimate, with its probability and its exact amount.',
    size: 'lg',
    body: h('div', { class: 'stack' }, form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Declare scenario', onClick: submit, primary: true }],
  });
}

function reimbursementDialog(ctx, report, presetMatterId, onDone) {
  const assessed = report.rows.filter((row) => row.assessment).map((row) => ({ value: row.matter.id, label: `${row.matter.matterRef} — ${row.state.label}` }));
  const form = buildForm([
    { name: 'matterId', label: 'Matter (must carry an assessment)', type: 'select', required: true, options: options(assessed, { blank: 'Choose a matter' }), value: presetMatterId || '' },
    { name: 'virtuallyCertain', label: 'Virtually certain?', type: 'select', required: true, options: options([
      { value: 'true', label: 'Yes — the recovery is virtually certain' },
      { value: 'false', label: 'No — not virtually certain' },
    ], { blank: 'Choose' }), help: 'Cash the insurer has paid is derived from the insurance register and needs no declaration. A pending claim is not virtually certain unless you declare it so in writing.' },
    { name: 'basisRef', label: 'Basis for the recognition', type: 'textarea', rows: 3, required: true, help: `At least ${L.textMin} characters — the coverage opinion, the insurer’s admission, the cash received.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.provisionDeclareReimbursement({
      matterId: values.matterId,
      virtuallyCertain: values.virtuallyCertain === 'true',
      basisRef: values.basisRef,
    });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The reimbursement was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Reimbursement recognition declared. The asset amount is derived from the insurance register and capped at the provision.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Declare a reimbursement recognition',
    description: 'Whether the recovery is virtually certain, with a written basis. The amount is derived, never typed.',
    size: 'lg',
    body: h('div', { class: 'stack' }, form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Declare recognition', onClick: submit, primary: true }],
  });
}

function carryingDialog(ctx, report, onDone) {
  const form = buildForm([
    { name: 'currency', label: 'Currency', type: 'text', required: true, value: report.totals.currencies[0] || 'GBP', help: 'Three letters. One carrying per currency.' },
    { name: 'carriedMinor', label: 'Finance carrying, minor units', type: 'number', min: 0, required: true, help: 'The figure the finance seat declares it is carrying as the provision. A whole number of minor units.' },
    { name: 'carriedRef', label: 'Finance record reference', type: 'text', required: true, help: `At least ${L.instrumentMin} characters — the sub-ledger, the general ledger account, the close pack reference.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.provisionDeclareCarrying({
      currency: values.currency,
      carriedMinor: Number(values.carriedMinor),
      carriedRef: values.carriedRef,
    });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The carrying was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Carrying declared. The register reconciles its computed provision against it and prints the exact gap.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Declare a finance carrying',
    description: 'The figure finance says it is carrying as the provision, with a written reference to the finance record.',
    size: 'lg',
    body: h('div', { class: 'stack' }, form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Declare carrying', onClick: submit, primary: true }],
  });
}

function conventionsDialog(ctx, report, onDone) {
  const conv = report.conventions;
  const form = buildForm([
    { name: 'provPrivacyFloor', label: 'Privacy floor for per-state exports', type: 'number', min: 2, max: 20, required: true, value: conv.provPrivacyFloor, help: 'A per-state count below this floor is exported BLANK with its reason, never as a small number.' },
    { name: 'provAutoPropagate', label: 'The rule may file dated asks', type: 'checkbox', value: conv.provAutoPropagate !== false, checkboxLabel: 'ON — a pause is a pause that leaves an unassessed matter and an unreconciled carrying unanswered', help: 'Pause-governed on every path, including the explicit scan.' },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.provisionSetConventions({
      provPrivacyFloor: Number(values.provPrivacyFloor),
      provAutoPropagate: Boolean(values.provAutoPropagate),
    });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The conventions were refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Conventions re-declared.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Register conventions',
    description: 'Two declared switches. A provision carries no clock, so there is no warning horizon in this register.',
    body: h('div', { class: 'stack' }, form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Save conventions', onClick: submit, primary: true }],
  });
}

/* --------------------------------------------------------------------- panels */

function summaryCard(report) {
  const t = report.totals;
  const firstCurrency = t.currencies[0];
  const firstRow = report.currencyRows[0];
  return card({
    title: 'What the record supports at this instant',
    subtitle: 'Every figure is derived on read from declared classifications, best estimates, scenarios, reimbursement recognitions and the insurance register. No state is stored, and a matter with no assessment is never printed as a zero.',
    body: h('div', { class: 'stat-grid' },
      stat({ label: 'Open matters', value: h('span', { 'data-testid': 'prv-count-matters' }, String(t.matters)), hint: `${t.closedMatters} closed matter(s) excluded` }),
      stat({ label: 'Provided', value: h('span', { 'data-testid': 'prv-count-provided' }, String(t.provided + t.providedWithAsset + t.providedAssetCapped)), hint: `${t.providedWithAsset} with an asset · ${t.providedAssetCapped} capped` }),
      stat({ label: 'Disclosed only', value: h('span', { 'data-testid': 'prv-count-disclosed' }, String(t.disclosedOnly)), hint: 'contingent liabilities, not provided' }),
      stat({ label: 'Unassessed', value: h('span', { 'data-testid': 'prv-count-unassessed' }, String(t.unassessed)), hint: 'gross exposure, no assessment' }),
      stat({ label: 'Remote', value: h('span', { 'data-testid': 'prv-count-remote' }, String(t.remote)), hint: 'no provision, no disclosure' }),
      stat({ label: 'Net exposure', value: h('span', { 'data-testid': 'prv-count-net' }, firstRow ? moneyIn(report, firstRow.netExposureMinor, firstCurrency) : '—'), hint: firstCurrency ? `${firstCurrency} · provision less asset` : 'no assessed matter' }),
      stat({ label: 'Unreconciled', value: h('span', { 'data-testid': 'prv-count-unreconciled' }, String(report.attention.unreconciledN)), hint: 'currency(ies) where carrying ≠ computed' }),
      stat({ label: 'Your attention', value: h('span', { 'data-testid': 'prv-count-attention' }, String(report.attention.total)), hint: 'unassessed, disclosed, capped, unreconciled' }),
    ),
  });
}

function provisionBanners(report) {
  const parts = report.balances.statesReconcile && report.balances.scenariosReconcile
    && report.balances.reimbursementsReconcile && report.balances.oneAssessmentPerMatter
    && report.balances.oneReimbursementPerMatter && report.balances.oneCarryingPerCurrency;
  return h('div', { class: 'stack' },
    banner({
      tone: parts ? 'info' : 'bad',
      title: parts
        ? 'The parts re-add: every state, scenario, reimbursement and carrying ties to the assessment it summarises'
        : 'The printed counts do NOT re-add to the rows they summarise',
      body: `States ${report.stateTotal} of ${report.totals.matters} open matter(s) · ${report.scenarios.length} scenario(s) · ${report.reimbursements.length} reimbursement recognition(s) · ${report.carryings.length} finance carrying(s). This is the first claim. It says nothing about whether the register could see everything.`,
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
      title: 'A provision is three facts, never one',
      body: 'The provision, the reimbursement asset and the net exposure are printed apart. A recovery is never netted into the provision until it is virtually certain, and the asset never exceeds the provision.',
    }),
    report.detailed ? null : banner({ tone: 'caution', title: 'Responsible hands withheld at this altitude', body: report.disclosure.reason }),
  );
}

function provisionFlags(row) {
  const flags = [];
  if (row.estimateUnprovable) flags.push(badge('estimate refused', 'bad'));
  if (row.assetCapped) flags.push(badge(`asset capped · excess ${row.assetExcessMinor}`, 'warn'));
  if (row.assetWithoutCash) flags.push(badge('asset without cash', 'warn'));
  if (row.assetNotRecognized) flags.push(badge('no asset recognized', 'neutral'));
  if (row.orphan) flags.push(badge('orphan — no resolvable line', 'warn'));
  return flags.length ? h('div', { class: 'row-actions' }, ...flags) : '—';
}

function provisionsTable(ctx, report, candidates, onDone) {
  return card({
    title: 'Open matters, by provision urgency',
    subtitle: 'Sorted by the provision verdict, then by the provision the record can prove. The classification and the best estimate are declared; the provision, the asset and the net exposure are derived.',
    body: report.rows.length
      ? table({
        columns: [
          { label: 'Matter', render: (row) => h('div', null, h('div', null, row.matter.matterRef), h('div', { class: 'small muted' }, row.matter.claimType || '')) },
          { label: 'Classification', render: (row) => (row.classificationDefinition ? row.classificationDefinition.label : badge('none', 'bad')) },
          { label: 'Best estimate', render: (row) => (row.estimateMethodDefinition ? h('div', null, h('div', null, row.estimateMethodDefinition.label), h('div', { class: 'small muted' }, Number.isInteger(row.bestEstimateMinor) ? moneyIn(report, row.bestEstimateMinor, row.currency) : (row.bestEstimateReason || 'refused'))) : '—') },
          { label: 'Provision', render: (row) => (row.provisionRecognized ? moneyIn(report, row.provisionMinor, row.currency) : '—') },
          { label: 'Asset', render: (row) => (Number.isInteger(row.assetMinor) && row.assetMinor > 0 ? moneyIn(report, row.assetMinor, row.currency) : '—') },
          { label: 'Net exposure', render: (row) => (row.provisionRecognized ? moneyIn(report, row.netExposureMinor, row.currency) : '—') },
          { label: 'State', render: (row) => stateBadge(row.state) },
          { label: 'Flags', render: (row) => provisionFlags(row) },
          {
            label: '',
            render: (row) => button(
              row.assessment ? 'Declare reimbursement' : 'Declare assessment',
              () => (row.assessment ? reimbursementDialog(ctx, report, row.matter.id, onDone) : assessmentDialog(ctx, report, candidates, onDone)),
              { testid: 'prv-action-next' },
            ),
          },
        ],
        rows: report.rows,
        caption: 'Provision schedule',
        emptyMessage: 'No open matter is on the schedule. That is either a workspace with no live obligations — or a claim register nobody has read.',
      })
      : emptyState({
        title: 'No open matter on the schedule',
        body: 'Every matter on the claim register is closed, or the claim register is empty. A provision can only be derived for an open matter with an assessment.',
      }),
  });
}

function scenariosPanel(ctx, report, candidates, onDone) {
  const rows = report.rows.filter((row) => row.scenarios.length);
  return h('div', { class: 'stack' },
    card({
      title: 'Scenarios and the expected value they produce',
      subtitle: 'Each scenario is a declared outcome with a probability and an exact amount. The reader sums them and REFUSES a set whose probabilities are not exactly 100%, or whose weighted sum is not a whole minor unit — never rounded.',
      body: rows.length
        ? table({
          columns: [
            { label: 'Matter', render: (row) => row.matter.matterRef },
            { label: 'Scenarios', render: (row) => `${row.scenarios.length}` },
            { label: 'Probability total', render: (row) => `${row.scenarios.reduce((sum, scenario) => sum + scenario.probabilityBps, 0)} bps` },
            { label: 'Expected value', render: (row) => (Number.isInteger(row.bestEstimateMinor) ? moneyIn(report, row.bestEstimateMinor, row.currency) : badge('refused', 'bad')) },
            { label: 'Reason', render: (row) => (row.bestEstimateReason ? h('span', { class: 'small muted' }, row.bestEstimateReason) : '—') },
          ],
          rows,
          caption: 'Expected values',
          emptyMessage: 'No scenario is declared. An expected-value assessment with no scenarios is refused, never treated as zero.',
        })
        : emptyState({ title: 'No scenario declared', body: 'Declare an expected-value assessment, then declare its scenarios. The expected value is derived on read.' }),
    }),
    report.rows.length ? h('div', { class: 'row-actions' },
      button('Declare a scenario', () => scenarioDialog(ctx, report, onDone))) : null,
  );
}

function reimbursementsPanel(ctx, report, candidates, onDone) {
  const rows = report.rows.filter((row) => row.cashReceivedMinor > 0 || row.claimedMinor > 0 || row.reimbursement);
  return h('div', { class: 'stack' },
    card({
      title: 'Reimbursement assets, recognized only when virtually certain',
      subtitle: 'Cash the insurer has paid is derived from the insurance register. A pending claim is not virtually certain unless a seat declares it so in writing. The asset is capped at the provision and the excess is printed.',
      body: rows.length
        ? table({
          columns: [
            { label: 'Matter', render: (row) => row.matter.matterRef },
            { label: 'Cash received', render: (row) => (row.cashReceivedMinor ? moneyIn(report, row.cashReceivedMinor, row.currency) : '—') },
            { label: 'Claimed', render: (row) => (row.claimedMinor ? moneyIn(report, row.claimedMinor, row.currency) : '—') },
            { label: 'Expected', render: (row) => (Number.isInteger(row.expectedMinor) ? moneyIn(report, row.expectedMinor, row.currency) : '—') },
            { label: 'Asset', render: (row) => (Number.isInteger(row.assetMinor) && row.assetMinor > 0 ? moneyIn(report, row.assetMinor, row.currency) : '—') },
            { label: 'Excess', render: (row) => (row.assetCapped ? moneyIn(report, row.assetExcessMinor, row.currency) : '—') },
            { label: 'Rest on', render: (row) => (row.assetWithoutCash ? badge('declared judgement', 'warn') : (row.assetMinor > 0 ? badge('cash', 'good') : '—')) },
            { label: 'State', render: (row) => stateBadge(row.state) },
          ],
          rows,
          caption: 'Reimbursement assets',
          emptyMessage: 'No matter carries cash, a claimed amount or a reimbursement recognition.',
        })
        : emptyState({ title: 'No reimbursement on the record', body: 'Link a policy to a matter on the insurance register and record what the insurer paid; the asset is derived here.' }),
    }),
    report.rows.length ? h('div', { class: 'row-actions' },
      button('Declare a reimbursement', () => reimbursementDialog(ctx, report, null, onDone))) : null,
  );
}

function reconciliationPanel(ctx, report, candidates, onDone) {
  return h('div', { class: 'stack' },
    card({
      title: 'Reconciliation against the figure finance carries',
      subtitle: 'The computed provision is compared with the declared finance carrying. Where they differ, the exact gap is printed and an ask is filed. The register never silently adopts either number.',
      body: report.currencyRows.length
        ? table({
          columns: [
            { label: 'Currency', render: (row) => row.currency },
            { label: 'Computed provision', render: (row) => moneyIn(report, row.provisionMinor, row.currency) },
            { label: 'Reimbursement asset', render: (row) => moneyIn(report, row.assetMinor, row.currency) },
            { label: 'Net exposure', render: (row) => moneyIn(report, row.netExposureMinor, row.currency) },
            { label: 'Finance carrying', render: (row) => (row.carriedMinor === null ? badge('not declared', 'bad') : moneyIn(report, row.carriedMinor, row.currency)) },
            {
              label: 'Gap',
              render: (row) => (row.gapMinor === null
                ? '—'
                : (row.reconciled
                  ? badge('reconciled', 'good')
                  : badge(`${moneyIn(report, row.gapMinor, row.currency)} (${row.gapMinor} minor units)`, 'bad'))),
            },
          ],
          rows: report.currencyRows,
          caption: 'Reconciliation',
          emptyMessage: 'No currency carries a computed provision, so there is nothing to reconcile.',
        })
        : emptyState({ title: 'Nothing to reconcile', body: 'Once a matter is assessed, its currency appears here with the computed provision.' }),
    }),
    report.rows.length ? h('div', { class: 'row-actions' },
      button('Declare a finance carrying', () => carryingDialog(ctx, report, onDone))) : null,
  );
}

function methodView(report) {
  return h('div', { class: 'stack' },
    card({
      title: 'What this register is, and what it refuses to be',
      body: h('div', { class: 'stack' },
        h('img', {
          src: DIAGRAM_URL,
          alt: 'A method figure showing an open matter classified as probable, possible or remote; a best estimate computed as the most likely outcome or a probability-weighted expected value over scenarios; the provision recognized where the outflow is probable and the estimate reliable; a reimbursement asset recognized only when virtually certain and capped at the provision with the excess printed; and the computed provision reconciled against the declared finance carrying with the exact gap.',
          class: 'method-figure',
        }),
        kv('Engine', PROV_METHOD.engine),
        kv('Decision record', PROV_METHOD.adr),
        kv('CSV scope', PROV_CSV_SCOPE),
        kv('As at', `${report.asOf} (${report.nowIso})`),
        h('h3', null, 'Frameworks applied'),
        h('ul', null, ...PROV_METHOD.frameworks.map((line) => h('li', null, line))),
        h('h3', null, 'What is printed'),
        h('ul', null, ...PROV_METHOD.printed.map((line) => h('li', null, line))),
        h('h3', null, 'Deliberately absent'),
        h('ul', null, ...PROV_METHOD.deliberatelyAbsent.map((line) => h('li', null, line))),
        h('h3', null, 'Disclosure'),
        banner({ tone: 'caution', title: 'A rendering contract, not an authentication boundary', body: 'Seats in this workspace are workflow declarations, not logins. The reader withholds responsible hands above rank 3, and this page says so rather than implying a permission system the workspace cannot enforce. A provision schedule is as sensitive as the claim export: the export carries counts, currencies and per-currency minor-unit totals only.' }),
      ),
    }),
  );
}

/* ------------------------------------------------------------------------ page */

export function renderProvisions(ctx) {
  const view = ctx.query?.get?.('view') || 'provisions';
  let report;
  try {
    const result = ctx.api.provisionReport();
    if (!result?.ok) {
      return h('div', { class: 'stack' },
        pageHeader({ eyebrow: 'Finance · provisions', title: 'Provision & reimbursement', subtitle: 'What the organisation must carry on the balance sheet for each obligation, what it may recognize as a reimbursement asset, and what the net exposure is.' }),
        banner({ tone: 'bad', title: 'The register could not be read', body: result?.error || 'The seat could not be resolved.' }));
    }
    report = result.report;
  } catch (error) {
    return h('div', { class: 'stack' },
      pageHeader({ eyebrow: 'Finance · provisions', title: 'Provision & reimbursement' }),
      banner({ tone: 'bad', title: 'The register could not be read', body: error?.message || 'Unknown error.' }));
  }

  let candidates = [];
  try {
    const result = ctx.api.provisionCandidates();
    if (result?.ok) candidates = result.people;
  } catch { candidates = []; }

  const onDone = () => {
    document.dispatchEvent(new CustomEvent('leados:navigate', { detail: { route: PROV_HREF } }));
    ctx.rerender?.();
  };
  const local = { api: ctx.api };
  const viewKey = VIEWS.some((row) => row.key === view) ? view : 'provisions';

  const exportCsv = () => {
    try {
      const file = exportWorkspaceCsv(ctx.api.getState ? ctx.api.getState() : ctx.state, PROV_CSV_SCOPE);
      if (!file?.ok) { toast(file?.error || 'The export produced no file.', 'bad'); return; }
      downloadText({ filename: file.filename, text: file.csv, mime: 'text/csv' });
      toast('Exported. Counts, currencies and per-currency minor-unit totals only: no matter reference, party, person or day crosses this boundary.', 'good');
    } catch (error) {
      toast(error?.message || 'The export failed.', 'bad');
    }
  };

  const header = pageHeader({
    eyebrow: 'Finance · provisions',
    title: 'Provision & reimbursement',
    subtitle: 'What the organisation must carry for each obligation, what it may recognize as a reimbursement asset against it, and whether the figure finance carries agrees with the figure the record supports.',
    actions: [
      { label: 'Declare an assessment', onClick: () => assessmentDialog(local, report, candidates, onDone), primary: true },
      { label: 'Export (counts)', onClick: exportCsv },
      { label: 'Conventions', onClick: () => conventionsDialog(local, report, onDone) },
    ],
    meta: [
      `As at ${report.asOf}`,
      `${report.totals.matters} open matter(s)`,
      `${report.totals.unassessed} unassessed`,
      `${report.attention.unreconciledN} unreconciled`,
      report.detailed ? 'names shown' : 'counts only at this altitude',
    ],
  });

  const body = h('div', { class: 'stack' },
    summaryCard(report),
    provisionBanners(report),
    tabs({ items: VIEWS, active: viewKey, onSelect: (key) => { window.location.hash = `${PROV_HREF}?view=${key}`; }, ariaLabel: 'Provision sections' }),
    viewKey === 'scenarios' ? scenariosPanel(local, report, candidates, onDone)
      : viewKey === 'reimbursements' ? reimbursementsPanel(local, report, candidates, onDone)
        : viewKey === 'reconciliation' ? reconciliationPanel(local, report, candidates, onDone)
          : viewKey === 'method' ? methodView(report)
            : provisionsTable(local, report, candidates, onDone),
    viewKey !== 'method' ? h('div', { class: 'row-actions' },
      button('Declare an assessment', () => assessmentDialog(local, report, candidates, onDone)),
      button('Declare a scenario', () => scenarioDialog(local, report, onDone)),
      button('Declare a reimbursement', () => reimbursementDialog(local, report, null, onDone)),
      button('Declare a finance carrying', () => carryingDialog(local, report, onDone))) : null,
    report.warnings.length
      ? card({
        title: 'Unreadable rows, counted and refused',
        subtitle: 'Nothing here was repaired: a stored row this register cannot read exactly is dropped with a count rather than guessed at.',
        body: h('ul', null, ...report.warnings.slice(0, 20).map((line) => h('li', { class: 'small' }, line))),
      })
      : null,
    report.lineRows.length
      ? card({
        title: 'By reporting line, with each person counted once',
        subtitle: 'An assessment names hands across lines. Every active line that holds a hand is counted here, and a person appears once on each line that genuinely holds them — never doubled because they have two managers.',
        body: table({
          columns: [
            { label: 'Line', render: (row) => row.managerName },
            { label: 'Matters', render: (row) => `${row.mattersN}` },
            { label: 'Provided', render: (row) => `${row.providedN}` },
            { label: 'Disclosed', render: (row) => (row.disclosedN ? badge(String(row.disclosedN), 'warn') : '—') },
            { label: 'Unassessed', render: (row) => (row.unassessedN ? badge(String(row.unassessedN), 'bad') : '—') },
            { label: 'Provision', render: (row) => moneyIn(report, row.provisionMinor, report.totals.currencies[0]) },
            { label: 'Responsible hands', render: (row) => `${row.holdersN}` },
          ],
          rows: report.lineRows,
          caption: 'By line',
          emptyMessage: 'No line holds a responsible hand on this register.',
        }),
      })
      : null,
  );

  return h('div', { class: 'stack' }, header, body);
}
