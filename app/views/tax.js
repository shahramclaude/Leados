/**
 * app/views/tax.js — `#/tax`, the Tax Controversy & Appeal-Control Register
 * (ADR-0257, Schema v209).
 *
 * ONE reader (`buildTaxControversy`) stands behind every state, timeliness
 * verdict, days-remaining figure, swing and attention count this page prints.
 * The page formats what the reader returned; it computes no state, no
 * timeliness and no swing of its own.
 *
 * THE FIVE THINGS THIS SCREEN KEEPS APART
 *  - the NOTICE (the authority reference, the disputed position, the
 *    jurisdiction as declared, the tax type, the disputed amount);
 *  - the DEADLINE (the jurisdiction-declared objection day with its written
 *    basis — never computed from the notice day);
 *  - the FILING (its kind, its filed day, the authority's receipt reference)
 *    and the TIMELINESS derived by comparing the two declared days;
 *  - the EVIDENCE packet bound to the disputed position;
 *  - the RESOLUTION (the closed-vocabulary outcome, the amount finally
 *    payable) and the SWING printed apart from both figures.
 *
 * WHAT THE SCREEN REFUSES TO SAY. It does not say a notice with no declared
 * deadline has no deadline: it prints `deadline-undeclared` and files an ask.
 * It does not compute a deadline from a notice day. It does not re-date a late
 * filing. It gives no tax advice and never scores a person or a line.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table, kv } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { exportWorkspaceCsv } from '../core/csv.js';
import {
  TAX_CSV_SCOPE,
  TAX_HREF,
  TAX_LIMITS,
  TAX_FILING_KINDS,
  TAX_METHOD,
  TAX_OUTCOMES,
  TAX_SECTION_TITLES,
  TAX_TYPES,
} from '../core/domain/taxRegistry.js';
import { moneyLabel, dayLabel } from '../core/domain/taxMath.js';

const L = TAX_LIMITS;
const DIAGRAM_URL = './app/assets/tax-controversy-method.jpg';
const VIEWS = [
  { key: 'controversies', label: TAX_SECTION_TITLES.controversies },
  { key: 'filings', label: TAX_SECTION_TITLES.filings },
  { key: 'evidence', label: TAX_SECTION_TITLES.evidence },
  { key: 'resolutions', label: TAX_SECTION_TITLES.resolutions },
  { key: 'method', label: TAX_SECTION_TITLES.method },
];

const TONE = { bad: 'bad', warn: 'warn', good: 'good', neutral: 'neutral' };
const options = (rows, { blank = null } = {}) => [
  ...(blank ? [{ value: '', label: blank }] : []),
  ...rows.map((row) => ({ value: row.value, label: row.label })),
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
    'data-testid': `tax-state-${state.key}`,
  }, state.label);
}

const noticeLabel = (row) => `${row.notice.noticeRef}`;
const moneyIn = (report, minor, currency) => moneyLabel(minor, currency || report.totals.currencies[0] || 'GBP');

/* -------------------------------------------------------------------- dialogs */

function noticeDialog(ctx, report, candidates, onDone) {
  const form = buildForm([
    { name: 'noticeRef', label: 'Authority notice reference', type: 'text', required: true, help: `At least ${L.shortMin} characters — the reference the authority put on the notice.` },
    { name: 'position', label: 'Disputed position', type: 'text', required: true, help: `At least ${L.shortMin} characters — the treatment the authority has reassessed.` },
    { name: 'jurisdiction', label: 'Jurisdiction (as declared)', type: 'text', required: true, help: `At least ${L.jurisdictionMin} characters. The register holds no jurisdiction calendar and will not guess one from a label.` },
    { name: 'taxType', label: 'Tax type', type: 'select', required: true, options: options(TAX_TYPES.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose a tax type' }), help: 'The register never infers the kind of a dispute from an amount or a jurisdiction.' },
    { name: 'noticeDay', label: 'Notice day (YYYY-MM-DD)', type: 'text', required: true, help: 'The day the authority issued the notice. It is recorded, never used to compute a deadline.' },
    { name: 'disputedMinor', label: 'Disputed amount, minor units', type: 'number', min: 0, required: true, help: 'A whole number of minor units — 2500000 is £25,000.00. A fractional value is refused, never rounded.' },
    { name: 'currency', label: 'Currency', type: 'text', required: true, value: 'GBP', help: 'Three letters. Amounts in this register are exact minor units in one named currency.' },
    { name: 'basisRef', label: 'Basis for the notice', type: 'textarea', rows: 3, required: true, help: `At least ${L.textMin} characters — what the authority asserts and why the position is disputed.` },
    { name: 'provisionRef', label: 'Finance record reference (optional)', type: 'text', help: `At least ${L.instrumentMin} characters if given — where the uncertain-tax provision for this position is carried. The register references the provision; it never restates it.` },
    {
      name: 'responsibleIds', label: 'Responsible hands (one to four)', type: 'boolean-block', required: true,
      options: candidates.map((row) => ({ value: row.id, label: `${row.name}${row.role ? ` — ${row.role}` : ''}` })),
      help: 'Every hand answerable for this controversy, across every reporting line. The authority to answer for it is computed above ALL of them, so name all of them.',
    },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.taxRecordNotice({
      ...values,
      disputedMinor: values.disputedMinor === '' || values.disputedMinor === undefined ? null : Number(values.disputedMinor),
      responsibleIds: values.responsibleIds,
    });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The notice was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Notice recorded. The deadline, the filing, the evidence and the resolution are derived on read.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Record an authority notice',
    description: 'The authority reference, the disputed position and the hands responsible for it. The deadline is declared separately, with its written basis.',
    size: 'lg',
    body: h('div', { class: 'stack' },
      banner({
        tone: 'caution',
        title: 'The notice day is recorded, never used to compute a deadline',
        body: 'The register holds no jurisdiction calendar. The objection deadline is declared next, with the written basis that sets the window.',
      }),
      form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record notice', onClick: submit, primary: true }],
  });
}

function deadlineDialog(ctx, report, onDone) {
  const undecided = report.rows.filter((row) => !row.deadline).map((row) => ({ value: row.notice.id, label: `${row.notice.noticeRef} — ${row.notice.jurisdiction}` }));
  const form = buildForm([
    { name: 'noticeId', label: 'Notice (no deadline declared yet)', type: 'select', required: true, options: options(undecided, { blank: 'Choose a notice' }), help: 'Only notices with no declared deadline need one. A second deadline for one notice would make the window ambiguous.' },
    { name: 'deadlineDay', label: 'Declared objection deadline (YYYY-MM-DD)', type: 'text', required: true, help: 'The day the jurisdiction-declared window closes. The register never computes this from the notice day.' },
    { name: 'basisRef', label: 'Written jurisdictional basis', type: 'textarea', rows: 3, required: true, help: `At least ${L.textMin} characters — the statute, regulation or authority guidance that sets the window. A date nobody cited is refused.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.taxDeclareDeadline({
      noticeId: values.noticeId,
      deadlineDay: values.deadlineDay,
      basisRef: values.basisRef,
    });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The deadline was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Deadline declared. Timeliness is derived on read by comparing the two declared days.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Declare an objection deadline',
    description: 'The jurisdiction-declared objection day, with the written basis that sets the window.',
    size: 'lg',
    body: h('div', { class: 'stack' }, form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Declare deadline', onClick: submit, primary: true }],
  });
}

function filingDialog(ctx, report, onDone) {
  const open = report.rows.filter((row) => !row.resolution).map((row) => ({ value: row.notice.id, label: `${row.notice.noticeRef} — ${row.state.label}` }));
  const form = buildForm([
    { name: 'noticeId', label: 'Notice (still open)', type: 'select', required: true, options: options(open, { blank: 'Choose a notice' }), help: 'A filing belongs to an open notice. A resolved notice carries no further filing.' },
    { name: 'filingKind', label: 'Filing kind', type: 'select', required: true, options: options(TAX_FILING_KINDS.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose a kind' }), help: 'An objection, an appeal, a response and an information supply are four different acts.' },
    { name: 'filedDay', label: 'Filed day (YYYY-MM-DD)', type: 'text', required: true, help: 'The day the filing was made. A filing after the deadline is recorded as late, never re-dated.' },
    { name: 'receiptRef', label: 'Authority receipt reference', type: 'text', required: true, help: `At least ${L.shortMin} characters — the reference the authority put on the receipt. An unreceipted filing is refused.` },
    { name: 'basisRef', label: 'Basis for the filing', type: 'textarea', rows: 3, required: true, help: `At least ${L.textMin} characters — what was filed and why.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.taxRecordFiling({
      noticeId: values.noticeId,
      filingKind: values.filingKind,
      filedDay: values.filedDay,
      receiptRef: values.receiptRef,
      basisRef: values.basisRef,
    });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The filing was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Filing recorded. Timeliness is derived on read.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Record a filing',
    description: 'One act in the dispute path, with its kind, its filed day and the authority’s receipt reference.',
    size: 'lg',
    body: h('div', { class: 'stack' }, form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record filing', onClick: submit, primary: true }],
  });
}

function evidenceDialog(ctx, report, onDone) {
  const open = report.rows.filter((row) => !row.resolution).map((row) => ({ value: row.notice.id, label: `${row.notice.noticeRef} — ${row.evidence.length} item(s)` }));
  const form = buildForm([
    { name: 'noticeId', label: 'Notice (still open)', type: 'select', required: true, options: options(open, { blank: 'Choose a notice' }), help: 'Evidence binds to the notice whose disputed position it supports.' },
    { name: 'itemLabel', label: 'Evidence item', type: 'text', required: true, help: `At least ${L.shortMin} characters — what the item is.` },
    { name: 'itemRef', label: 'Document reference', type: 'text', required: true, help: `At least ${L.shortMin} characters — the reference the item is drawn from. A bare label is refused.` },
    { name: 'suppliedDay', label: 'Supplied day (YYYY-MM-DD)', type: 'text', required: true, help: 'The day the item was supplied.' },
    { name: 'basisRef', label: 'Basis for the item', type: 'textarea', rows: 3, required: true, help: `At least ${L.textMin} characters — what it proves about the disputed position.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.taxRecordEvidence({
      noticeId: values.noticeId,
      itemLabel: values.itemLabel,
      itemRef: values.itemRef,
      suppliedDay: values.suppliedDay,
      basisRef: values.basisRef,
    });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The evidence item was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Evidence recorded. The packet is derived on read.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Record an evidence item',
    description: 'One item of the packet behind a disputed position, with its document reference.',
    size: 'lg',
    body: h('div', { class: 'stack' }, form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record evidence', onClick: submit, primary: true }],
  });
}

function resolutionDialog(ctx, report, onDone) {
  const filed = report.rows.filter((row) => row.firstFiling && !row.resolution).map((row) => ({ value: row.notice.id, label: `${row.notice.noticeRef} — ${row.state.label}` }));
  const form = buildForm([
    { name: 'noticeId', label: 'Notice (filed, still open)', type: 'select', required: true, options: options(filed, { blank: 'Choose a notice' }), help: 'A resolution closes a filed controversy. A notice with no filing is conceded or withdrawn by a filing, not by a resolution.' },
    { name: 'outcome', label: 'Outcome', type: 'select', required: true, options: options(TAX_OUTCOMES.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose an outcome' }), help: 'The register never infers an outcome from an amount or a payment.' },
    { name: 'resolvedDay', label: 'Resolved day (YYYY-MM-DD)', type: 'text', required: true, help: 'The day the controversy closed.' },
    { name: 'resolvedMinor', label: 'Amount finally payable, minor units', type: 'number', min: 0, required: true, help: 'A whole number of minor units. The swing against the disputed amount is derived on read.' },
    { name: 'currency', label: 'Currency', type: 'text', required: true, value: 'GBP', help: 'Three letters.' },
    { name: 'basisRef', label: 'Basis for the resolution', type: 'textarea', rows: 3, required: true, help: `At least ${L.textMin} characters — the authority's decision, the settlement terms, the concession.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.taxRecordResolution({
      noticeId: values.noticeId,
      outcome: values.outcome,
      resolvedDay: values.resolvedDay,
      resolvedMinor: Number(values.resolvedMinor),
      currency: values.currency,
      basisRef: values.basisRef,
    });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The resolution was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Resolution recorded. The swing against the disputed amount is derived on read.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Record a resolution',
    description: 'The closed-vocabulary outcome and the amount finally payable. The swing is derived, never typed.',
    size: 'lg',
    body: h('div', { class: 'stack' }, form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record resolution', onClick: submit, primary: true }],
  });
}

function conventionsDialog(ctx, report, onDone) {
  const conv = report.conventions;
  const form = buildForm([
    { name: 'taxPrivacyFloor', label: 'Privacy floor for per-state exports', type: 'number', min: 2, max: 20, required: true, value: conv.taxPrivacyFloor, help: 'A per-state count below this floor is exported BLANK with its reason, never as a small number.' },
    { name: 'taxResolutionHorizonDays', label: 'Resolution horizon, days', type: 'number', min: 30, max: 3650, required: true, value: conv.taxResolutionHorizonDays, help: 'A filed-but-unresolved controversy past this horizon is asked for a status review. A declared convention, never a jurisdiction calendar.' },
    { name: 'taxAutoPropagate', label: 'The rule may file dated asks', type: 'checkbox', value: conv.taxAutoPropagate !== false, checkboxLabel: 'ON — a pause is a pause that leaves an undeclared deadline and an overdue filing unanswered', help: 'Pause-governed on every path, including the explicit scan.' },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.taxSetConventions({
      taxPrivacyFloor: Number(values.taxPrivacyFloor),
      taxResolutionHorizonDays: Number(values.taxResolutionHorizonDays),
      taxAutoPropagate: Boolean(values.taxAutoPropagate),
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
    description: 'Three declared switches. The register holds no jurisdiction calendar, so there is no warning horizon derived from one.',
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
    subtitle: 'Every figure is derived on read from declared notices, deadlines, filings, evidence items and resolutions. No state is stored, and a notice with no declared deadline is never printed as though it had none.',
    body: h('div', { class: 'stat-grid' },
      stat({ label: 'Notices', value: h('span', { 'data-testid': 'tax-count-notices' }, String(t.notices)), hint: `${t.resolved} resolved` }),
      stat({ label: 'Deadline undeclared', value: h('span', { 'data-testid': 'tax-count-undeclared' }, String(t.deadlineUndeclared)), hint: 'no window on the record' }),
      stat({ label: 'Overdue, unfiled', value: h('span', { 'data-testid': 'tax-count-overdue' }, String(t.overdueUnfiled)), hint: 'final by default' }),
      stat({ label: 'Filed late', value: h('span', { 'data-testid': 'tax-count-late' }, String(t.filedLate)), hint: `${t.filedOnTime} on time` }),
      stat({ label: 'Awaiting filing', value: h('span', { 'data-testid': 'tax-count-awaiting' }, String(t.awaitingFiling)), hint: 'window still open' }),
      stat({ label: 'Evidence empty', value: h('span', { 'data-testid': 'tax-count-evidence-empty' }, String(t.evidenceEmpty)), hint: 'filed, no packet' }),
      stat({ label: 'Swing', value: h('span', { 'data-testid': 'tax-count-swing' }, firstRow ? moneyIn(report, firstRow.swingMinor, firstCurrency) : '—'), hint: firstCurrency ? `${firstCurrency} · disputed less resolved` : 'no resolved notice' }),
      stat({ label: 'Your attention', value: h('span', { 'data-testid': 'tax-count-attention' }, String(report.attention.total)), hint: 'undeclared, overdue, late, empty, aging' }),
    ),
  });
}

function taxBanners(report) {
  const parts = report.balances.statesReconcile && report.balances.filingsReconcile
    && report.balances.evidenceReconcile && report.balances.deadlinesReconcile
    && report.balances.resolutionsReconcile && report.balances.oneDeadlinePerNotice
    && report.balances.oneResolutionPerNotice && report.balances.oneNoticePerRef;
  return h('div', { class: 'stack' },
    banner({
      tone: parts ? 'info' : 'bad',
      title: parts
        ? 'The parts re-add: every state, filing, evidence item, deadline and resolution ties to the notice it summarises'
        : 'The printed counts do NOT re-add to the rows they summarise',
      body: `States ${report.stateTotal} of ${report.totals.notices} notice(s) · ${report.filings.length} filing(s) · ${report.evidence.length} evidence item(s) · ${report.deadlines.length} deadline(s) · ${report.resolutions.length} resolution(s). This is the first claim. It says nothing about whether the register could see everything.`,
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
      title: 'A controversy is five facts, never one',
      body: 'The notice, the declared deadline, the filing and its timeliness, the evidence packet and the resolution are printed apart. The swing — disputed less resolved — is printed apart from both.',
    }),
    report.detailed ? null : banner({ tone: 'caution', title: 'Responsible hands withheld at this altitude', body: report.disclosure.reason }),
  );
}

function taxFlags(row) {
  const flags = [];
  if (row.evidenceEmpty) flags.push(badge('evidence empty', 'warn'));
  if (row.agingUnresolved) flags.push(badge('aging unresolved', 'warn'));
  if (row.swingMinor !== null && row.swingMinor !== 0) flags.push(badge(`swing ${row.swingMinor}`, 'neutral'));
  if (row.orphan) flags.push(badge('orphan — no resolvable line', 'warn'));
  return flags.length ? h('div', { class: 'row-actions' }, ...flags) : '—';
}

function controversiesTable(ctx, report, candidates, onDone) {
  return card({
    title: 'Notices, by controversy urgency',
    subtitle: 'Sorted by the controversy verdict, then by the disputed amount. The notice, the deadline, the filings, the evidence and the resolution are declared; the state, the timeliness and the swing are derived.',
    body: report.rows.length
      ? table({
        columns: [
          { label: 'Notice', render: (row) => h('div', null, h('div', null, row.notice.noticeRef), h('div', { class: 'small muted' }, `${row.notice.jurisdiction} · ${row.typeDefinition ? row.typeDefinition.label : row.notice.taxType}`)) },
          { label: 'Disputed', render: (row) => moneyIn(report, row.disputedMinor, row.currency) },
          { label: 'Deadline', render: (row) => (row.deadline ? h('div', null, h('div', null, row.deadline.deadlineDay), h('div', { class: 'small muted' }, row.daysToDeadline !== null ? dayLabel(row.daysToDeadline) : (row.daysOverdue !== null ? `${row.daysOverdue} days overdue` : ''))) : badge('none declared', 'bad')) },
          { label: 'First filing', render: (row) => (row.firstFiling ? h('div', null, h('div', null, row.firstFiling.filedDay), h('div', { class: 'small muted' }, row.timeliness === 'on-time' ? 'on time' : (row.timeliness === 'late' ? 'late' : (row.timelinessReason || '')))) : '—') },
          { label: 'Evidence', render: (row) => `${row.evidence.length}` },
          { label: 'State', render: (row) => stateBadge(row.state) },
          { label: 'Flags', render: (row) => taxFlags(row) },
          {
            label: '',
            render: (row) => button(
              row.deadline ? 'Record a filing' : 'Declare a deadline',
              () => (row.deadline ? filingDialog(ctx, report, onDone) : deadlineDialog(ctx, report, onDone)),
              { testid: 'tax-action-next' },
            ),
          },
        ],
        rows: report.rows,
        caption: 'Controversy schedule',
        emptyMessage: 'No authority notice is on the register. That is either a workspace with no live disputes — or a tax department nobody has recorded.',
      })
      : emptyState({
        title: 'No notice on the register',
        body: 'Record an authority notice to begin a controversy. The deadline is declared next, with its written basis.',
      }),
  });
}

function filingsPanel(ctx, report, candidates, onDone) {
  const rows = report.rows.filter((row) => row.filings.length);
  return h('div', { class: 'stack' },
    card({
      title: 'Filings and the timeliness derived from them',
      subtitle: 'Each filing is a declared act with its kind, its filed day and the authority’s receipt reference. Timeliness is derived by comparing the first filing day with the declared deadline day — never asserted, never re-dated.',
      body: rows.length
        ? table({
          columns: [
            { label: 'Notice', render: (row) => row.notice.noticeRef },
            { label: 'Filings', render: (row) => `${row.filings.length}` },
            { label: 'First filing', render: (row) => (row.firstFiling ? `${row.firstFiling.filingKind} · ${row.firstFiling.filedDay}` : '—') },
            { label: 'Timeliness', render: (row) => (row.timeliness === 'on-time' ? badge('on time', 'good') : (row.timeliness === 'late' ? badge(`late by ${row.daysOverdue} day(s)`, 'warn') : (row.timelinessReason ? badge('unprovable', 'bad') : '—'))) },
            { label: 'State', render: (row) => stateBadge(row.state) },
          ],
          rows,
          caption: 'Filings',
          emptyMessage: 'No filing is on the record. A declared deadline with no filing is `awaiting-filing` until it passes, then `overdue-unfiled`.',
        })
        : emptyState({ title: 'No filing declared', body: 'Declare a deadline, then record the filing that meets it. Timeliness is derived on read.' }),
    }),
    report.rows.length ? h('div', { class: 'row-actions' },
      button('Record a filing', () => filingDialog(ctx, report, onDone))) : null,
  );
}

function evidencePanel(ctx, report, candidates, onDone) {
  const rows = report.rows.filter((row) => row.evidence.length || row.firstFiling);
  return h('div', { class: 'stack' },
    card({
      title: 'Evidence packets, bound to the disputed position',
      subtitle: 'Each item names the notice whose position it supports and carries the document reference it is drawn from. A filed notice with no packet is flagged `evidence-empty`; the register never infers evidence from a filing.',
      body: rows.length
        ? table({
          columns: [
            { label: 'Notice', render: (row) => row.notice.noticeRef },
            { label: 'Items', render: (row) => `${row.evidence.length}` },
            { label: 'Latest', render: (row) => (row.evidence.length ? `${row.evidence[row.evidence.length - 1].itemLabel} · ${row.evidence[row.evidence.length - 1].suppliedDay}` : '—') },
            { label: 'Flag', render: (row) => (row.evidenceEmpty ? badge('evidence empty', 'warn') : badge('packet on record', 'good')) },
            { label: 'State', render: (row) => stateBadge(row.state) },
          ],
          rows,
          caption: 'Evidence packets',
          emptyMessage: 'No filed notice is on the register, so no packet is owed yet.',
        })
        : emptyState({ title: 'No packet owed yet', body: 'Once a notice is filed, its evidence packet is recorded here item by item.' }),
    }),
    report.rows.length ? h('div', { class: 'row-actions' },
      button('Record an evidence item', () => evidenceDialog(ctx, report, onDone))) : null,
  );
}

function resolutionsPanel(ctx, report, candidates, onDone) {
  const rows = report.rows.filter((row) => row.resolution);
  return h('div', { class: 'stack' },
    card({
      title: 'Resolutions and the swing they moved',
      subtitle: 'Each resolution carries the closed-vocabulary outcome and the amount finally payable. The swing — disputed less resolved — is derived and printed apart from both figures, per currency.',
      body: rows.length
        ? table({
          columns: [
            { label: 'Notice', render: (row) => row.notice.noticeRef },
            { label: 'Outcome', render: (row) => (row.resolution ? row.resolution.outcome : '—') },
            { label: 'Disputed', render: (row) => moneyIn(report, row.disputedMinor, row.currency) },
            { label: 'Resolved', render: (row) => (row.resolution ? moneyIn(report, row.resolution.resolvedMinor, row.resolution.currency) : '—') },
            { label: 'Swing', render: (row) => (row.swingMinor !== null ? moneyIn(report, row.swingMinor, row.currency) : (row.swingReason ? badge('unprovable', 'bad') : '—')) },
            { label: 'State', render: (row) => stateBadge(row.state) },
          ],
          rows,
          caption: 'Resolutions',
          emptyMessage: 'No notice carries a resolution. The swing is printed only where both figures are on the record.',
        })
        : emptyState({ title: 'No resolution on the record', body: 'Record a resolution on a filed notice; the swing is derived here.' }),
    }),
    report.rows.length ? h('div', { class: 'row-actions' },
      button('Record a resolution', () => resolutionDialog(ctx, report, onDone))) : null,
  );
}

function methodView(report) {
  return h('div', { class: 'stack' },
    card({
      title: 'What this register is, and what it refuses to be',
      body: h('div', { class: 'stack' },
        h('img', {
          src: DIAGRAM_URL,
          alt: 'A method figure showing an authority notice bound to a disputed position; a jurisdiction-declared objection deadline with its written basis, never computed from the notice day; the filing that met it with the authority’s receipt reference and the timeliness derived by comparing the two declared days; the evidence packet bound to the position; and the resolution with the amount finally payable and the swing printed apart from the disputed amount.',
          class: 'method-figure',
        }),
        kv('Engine', TAX_METHOD.engine),
        kv('Decision record', TAX_METHOD.adr),
        kv('CSV scope', TAX_CSV_SCOPE),
        kv('As at', `${report.asOf} (${report.nowIso})`),
        h('h3', null, 'Frameworks applied'),
        h('ul', null, ...TAX_METHOD.frameworks.map((line) => h('li', null, line))),
        h('h3', null, 'What is printed'),
        h('ul', null, ...TAX_METHOD.printed.map((line) => h('li', null, line))),
        h('h3', null, 'Deliberately absent'),
        h('ul', null, ...TAX_METHOD.deliberatelyAbsent.map((line) => h('li', null, line))),
        h('h3', null, 'Disclosure'),
        banner({ tone: 'caution', title: 'A rendering contract, not an authentication boundary', body: 'Seats in this workspace are workflow declarations, not logins. The reader withholds responsible hands above rank 3, and this page says so rather than implying a permission system the workspace cannot enforce. A controversy schedule is as sensitive as the provision export: the export carries counts, currencies and per-currency minor-unit totals only.' }),
      ),
    }),
  );
}

/* ------------------------------------------------------------------------ page */

export function renderTax(ctx) {
  const view = ctx.query?.get?.('view') || 'controversies';
  let report;
  try {
    const result = ctx.api.taxReport();
    if (!result?.ok) {
      return h('div', { class: 'stack' },
        pageHeader({ eyebrow: 'Finance · tax controversy', title: 'Tax controversy & appeal control', subtitle: 'Every authority notice bound to the disputed position, the jurisdiction-declared objection deadline, the filing that met it, the evidence packet behind it and the resolution.' }),
        banner({ tone: 'bad', title: 'The register could not be read', body: result?.error || 'The seat could not be resolved.' }));
    }
    report = result.report;
  } catch (error) {
    return h('div', { class: 'stack' },
      pageHeader({ eyebrow: 'Finance · tax controversy', title: 'Tax controversy & appeal control' }),
      banner({ tone: 'bad', title: 'The register could not be read', body: error?.message || 'Unknown error.' }));
  }

  let candidates = [];
  try {
    const result = ctx.api.taxCandidates();
    if (result?.ok) candidates = result.people;
  } catch { candidates = []; }

  const onDone = () => {
    document.dispatchEvent(new CustomEvent('leados:navigate', { detail: { route: TAX_HREF } }));
    ctx.rerender?.();
  };
  const local = { api: ctx.api };
  const viewKey = VIEWS.some((row) => row.key === view) ? view : 'controversies';

  const exportCsv = () => {
    try {
      const file = exportWorkspaceCsv(ctx.api.getState ? ctx.api.getState() : ctx.state, TAX_CSV_SCOPE);
      if (!file?.ok) { toast(file?.error || 'The export produced no file.', 'bad'); return; }
      downloadText({ filename: file.filename, text: file.csv, mime: 'text/csv' });
      toast('Exported. Counts, currencies and per-currency minor-unit totals only: no notice reference, jurisdiction, position, person or day crosses this boundary.', 'good');
    } catch (error) {
      toast(error?.message || 'The export failed.', 'bad');
    }
  };

  const header = pageHeader({
    eyebrow: 'Finance · tax controversy',
    title: 'Tax controversy & appeal control',
    subtitle: 'Every authority notice bound to the disputed position, the jurisdiction-declared objection deadline, the filing that met it, the evidence packet behind it and the resolution — with the swing between what was disputed and what was finally payable printed apart.',
    actions: [
      { label: 'Record a notice', onClick: () => noticeDialog(local, report, candidates, onDone), primary: true },
      { label: 'Export (counts)', onClick: exportCsv },
      { label: 'Conventions', onClick: () => conventionsDialog(local, report, onDone) },
    ],
    meta: [
      `As at ${report.asOf}`,
      `${report.totals.notices} notice(s)`,
      `${report.totals.deadlineUndeclared} undeclared`,
      `${report.totals.overdueUnfiled} overdue`,
      report.detailed ? 'names shown' : 'counts only at this altitude',
    ],
  });

  const body = h('div', { class: 'stack' },
    summaryCard(report),
    taxBanners(report),
    tabs({ items: VIEWS, active: viewKey, onSelect: (key) => { window.location.hash = `${TAX_HREF}?view=${key}`; }, ariaLabel: 'Tax controversy sections' }),
    viewKey === 'filings' ? filingsPanel(local, report, candidates, onDone)
      : viewKey === 'evidence' ? evidencePanel(local, report, candidates, onDone)
        : viewKey === 'resolutions' ? resolutionsPanel(local, report, candidates, onDone)
          : viewKey === 'method' ? methodView(report)
            : controversiesTable(local, report, candidates, onDone),
    viewKey !== 'method' ? h('div', { class: 'row-actions' },
      button('Record a notice', () => noticeDialog(local, report, candidates, onDone)),
      button('Declare a deadline', () => deadlineDialog(local, report, onDone)),
      button('Record a filing', () => filingDialog(local, report, onDone)),
      button('Record an evidence item', () => evidenceDialog(local, report, onDone)),
      button('Record a resolution', () => resolutionDialog(local, report, onDone))) : null,
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
        subtitle: 'A notice names hands across lines. Every active line that holds a hand is counted here, and a person appears once on each line that genuinely holds them — never doubled because they have two managers.',
        body: table({
          columns: [
            { label: 'Line', render: (row) => row.managerName },
            { label: 'Notices', render: (row) => `${row.noticesN}` },
            { label: 'Undeclared', render: (row) => (row.undeclaredN ? badge(String(row.undeclaredN), 'bad') : '—') },
            { label: 'Overdue', render: (row) => (row.overdueN ? badge(String(row.overdueN), 'bad') : '—') },
            { label: 'Filed', render: (row) => `${row.filedN}` },
            { label: 'Resolved', render: (row) => `${row.resolvedN}` },
            { label: 'Disputed', render: (row) => moneyIn(report, row.disputedMinor, report.totals.currencies[0]) },
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
