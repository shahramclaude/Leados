/**
 * app/views/financeInvestmentCasePanel.js — `#/finance?panel=cases`, the
 * Investment Case Register: appraisal, ratification and post-completion review
 * (Fisher 1930 / Dean 1951 net present value; Lorie & Savage 1955; Fama & Jensen
 * 1983 decision control; Kahneman & Lovallo 1993 outside view) (ADR-0208, Schema
 * v162, CSV scope #150, `RULE-ICA-01`).
 *
 * One reader (`buildInvestmentCases`) is behind the totals, every case card,
 * every review row, the brief and the CSV. Nothing is recomputed here: this file
 * formats whole cents, whole basis points and whole permille that the reader
 * already computed, so what the screen prints is what was computed, and a figure
 * that cannot be claimed prints a dash with its sentence — never a zero.
 *
 * THE THREE THINGS THIS SCREEN KEEPS APART, because merging them is how a
 * business case lies:
 *   1. what was PROMISED (the dated flows, at the declared hurdle);
 *   2. what the organisation's own track record says such promises are worth;
 *   3. what actually MOVED (a review, to a cut-off).
 * The second is always printed beside the first, never instead of it.
 */
import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import {
  investmentCaseBriefText,
  investmentDuration,
  investmentMoney,
  investmentRateBp,
  investmentRateMicro,
  investmentRatio,
} from '../core/domain/investmentCase.js';
import { investmentFlowLines } from '../core/domain/investmentCaseSchema.js';
import {
  INVESTMENT_BASES,
  INVESTMENT_CASE_BOUNDS,
  INVESTMENT_CASE_CSV_COLUMNS,
  INVESTMENT_CASE_HREF,
  INVESTMENT_CASE_LIMITS,
  INVESTMENT_CASE_METHOD,
  INVESTMENT_CASE_REFUSALS,
  INVESTMENT_CASE_RIGHTS,
  INVESTMENT_CASE_RULE_ID,
  INVESTMENT_CASE_SETTING_KEYS,
  INVESTMENT_FLOW_KIND_BY_KEY,
  INVESTMENT_FLOW_KINDS,
  INVESTMENT_IRR_STATE_BY_KEY,
  INVESTMENT_PAYBACK_STATE_BY_KEY,
} from '../core/domain/investmentCaseRegistry.js';

const DIAGRAM_URL = './app/assets/investment-case-appraisal.jpg';
const L = INVESTMENT_CASE_LIMITS;

const VIEWS = Object.freeze([
  Object.freeze({ key: 'register', label: 'Register' }),
  Object.freeze({ key: 'track', label: 'Track record' }),
  Object.freeze({ key: 'method', label: 'Method' }),
]);

const FLOWS_EXAMPLE = '2027-01-01 outlay 420000\n2028-01-01 benefit 150000\n2029-01-01 benefit 150000\n2030-01-01 benefit 150000\n2030-01-01 residual 40000';

function refresh(ctx) {
  if (typeof ctx?.refresh === 'function') ctx.refresh();
  else if (typeof ctx?.rerender === 'function') ctx.rerender();
  else if (typeof ctx?.render === 'function') ctx.render();
}

/** A refused act prints its sentence on the field it concerns and saves nothing. */
function finish(ctx, result, message, form = null) {
  if (!result?.ok) {
    if (form && result?.field) form.setFieldError(result.field === 'flows' ? 'flowsText' : result.field, result.error || '');
    toast(result?.error || 'The investment-case act was refused.', 'bad');
    return false;
  }
  closeAllModals();
  toast(result.warning || message, result.warning ? 'bad' : 'good');
  refresh(ctx);
  return true;
}

/* ------------------------------------------------------------- formatting */

function irrText(appraisal, meta) {
  return appraisal.irr.state === 'unique' ? investmentRateMicro(appraisal.irr.micro) : `— (${meta?.label || appraisal.irr.state})`;
}

function paybackText(payback, meta) {
  return payback.state === 'pays-back' ? `${investmentDuration(payback.days)} · ${payback.on}` : `— (${meta?.label || payback.state})`;
}

/** The appraisal as rows of figure / value / what it says. Shared by cards and the preview. */
function appraisalRows(currency, a, row = null) {
  const money = (cents) => investmentMoney(currency, cents);
  // A preview has no reader row yet, so the reasons are read from the same
  // registry the reader uses — never re-worded here.
  const extra = {
    irrMeta: row?.irrMeta || INVESTMENT_IRR_STATE_BY_KEY[a.irr.state] || null,
    paybackMeta: row?.paybackMeta || INVESTMENT_PAYBACK_STATE_BY_KEY[a.payback.state] || null,
    discountedPaybackMeta: row?.discountedPaybackMeta || INVESTMENT_PAYBACK_STATE_BY_KEY[a.discountedPayback.state] || null,
  };
  const rows = [
    { key: 'npv', figure: 'Net present value at the hurdle', value: money(a.npvCents), tone: a.npvSign < 0 ? 'bad' : a.npvSign > 0 ? 'good' : '', says: a.npvSign < 0 ? 'Worth less than zero at the declared hurdle: the money earns more left where it is.' : a.npvSign > 0 ? 'Worth more than zero at the declared hurdle — if the promise is kept.' : 'Worth exactly zero at the declared hurdle.' },
    { key: 'outlay', figure: 'Present value of outlays', value: money(a.pvOutlayCents), says: `Undiscounted: ${money(a.undiscounted.outlayCents)}.` },
    { key: 'benefit', figure: 'Present value of benefits', value: money(a.pvBenefitCents), says: `Undiscounted: ${money(a.undiscounted.benefitCents)}.` },
    { key: 'pi', figure: 'Profitability index', value: investmentRatio(a.piPermille), says: 'Present value returned per unit of present value put in. The order proposals are listed in when capital is rationed.' },
    { key: 'irr', figure: 'Internal rate of return', value: irrText(a, extra.irrMeta), says: a.irr.state === 'unique' ? `Unique: the dated net flows change sign once. Floored, so it never overstates. Room over the hurdle: ${investmentRateMicro(a.marginMicro)}.` : (extra.irrMeta?.says || 'No unique rate exists for this stream.') },
    { key: 'payback', figure: 'Payback', value: paybackText(a.payback, extra.paybackMeta), says: a.payback.state === 'pays-back' ? 'The first flow day the running total is no longer negative, from the first outlay. Not interpolated.' : (extra.paybackMeta?.says || '') },
    { key: 'dpayback', figure: 'Discounted payback', value: paybackText(a.discountedPayback, extra.discountedPaybackMeta), says: a.discountedPayback.state === 'pays-back' ? 'The same reading on flows discounted at the hurdle.' : (extra.discountedPaybackMeta?.says || '') },
    { key: 'exposure', figure: 'Peak cash exposure', value: money(a.peakExposureCents), says: a.peakExposureOn ? `How far the running undiscounted total falls; deepest on ${a.peakExposureOn}.` : 'The running total is never negative.' },
  ];
  if (a.undiscounted.residualCents !== 0) {
    rows.push({ key: 'residual', figure: 'Residual value (present value)', value: money(a.pvResidualCents), says: a.residualSharePermille === null ? 'A removal cost, not a value.' : `${investmentRatio(a.residualSharePermille)} of the promised return is the residual alone.` });
    rows.push({ key: 'npv-ex-residual', figure: 'Net present value without the residual', value: money(a.npvExResidualCents), tone: a.npvExResidualSign < 0 && a.npvSign >= 0 ? 'bad' : '', says: a.npvExResidualSign < 0 && a.npvSign >= 0 ? 'This case clears its hurdle ONLY on what the asset might be worth at the end.' : 'The case’s value from its operating benefits alone.' });
  }
  return rows;
}

function appraisalTable(caption, rows) {
  return table({
    caption,
    columns: [
      { label: 'Figure', render: (row) => row.figure },
      { label: 'Value', className: 'num', render: (row) => (row.tone ? h('strong', { class: `text-${row.tone}` }, row.value) : row.value) },
      { label: 'What it says', render: (row) => h('span', { class: 'muted small' }, row.says) },
    ],
    rows: rows.map((row) => ({ ...row, attrs: { 'data-testid': `investment-figure-${row.key}` } })),
    emptyMessage: 'No figure is printed.',
  });
}

function flowsTable(caption, currency, flows) {
  return table({
    caption,
    columns: [
      { label: 'Day', render: (flow) => flow.on },
      { label: 'Kind', render: (flow) => INVESTMENT_FLOW_KIND_BY_KEY[flow.kind]?.label || flow.kind },
      { label: 'Amount', className: 'num', render: (flow) => investmentMoney(currency, flow.cents) },
    ],
    rows: flows,
    emptyMessage: 'No flow was recorded.',
  });
}

/* ----------------------------------------------------------------- dialogs */

function declareCase(ctx) {
  const candidates = ctx.api.investmentCaseCandidates();
  if (!candidates?.ok) { toast(candidates?.error || 'Declaring a case was refused.', 'bad'); return; }
  if (!candidates.owners.length) { toast('Nobody on the active roster sits in this seat’s reporting tree or declared lines, so there is nobody to name as a benefit owner.', 'bad'); return; }
  const form = buildForm([
    { name: 'title', label: 'What is this case?', type: 'text', required: true, placeholder: 'Second filling line, Aarhus', help: `${L.titleMin}–${L.titleMax} characters. The register never parses it.` },
    { name: 'ownerId', label: 'Benefit owner', type: 'select', required: true, options: candidates.owners.map((owner) => ({ value: owner.id, label: owner.via === 'declared-line' ? `${owner.name} (through a declared line)` : owner.name })), value: candidates.owners[0].id, help: 'The one person accountable for the return this case promises. They can never ratify or review it.' },
    { name: 'currency', label: 'Currency (three-letter code)', type: 'text', required: true, value: candidates.currencies[0] || '', placeholder: 'DKK', help: 'One case, one currency. Nothing is converted and currencies are never pooled.' },
    { name: 'basis', label: 'Price basis', type: 'select', required: true, options: INVESTMENT_BASES.map((row) => ({ value: row.key, label: `${row.label} — ${row.says}` })), value: 'nominal' },
    { name: 'hurdlePct', label: 'Hurdle rate, % a year', type: 'text', required: true, placeholder: '8.5', help: 'The rate this money could earn elsewhere, in the same price basis as the flows. No rate is assumed for you.' },
    { name: 'flowsText', label: 'Dated flows — one per line: day, kind, amount', type: 'textarea', rows: 8, required: true, wide: true, placeholder: FLOWS_EXAMPLE, help: `Kinds: ${INVESTMENT_FLOW_KINDS.map((row) => row.key).join(', ')}. An outlay is typed as a positive amount going out. Amounts carry no thousands separator and at most two decimals. Up to ${L.flowsPerCase} flows; a column pasted from a spreadsheet reads as it stands.` },
    { name: 'baseOn', label: 'Valuation day (optional)', type: 'date', help: 'The day every flow is discounted to. Empty means the day of the first flow.' },
    { name: 'reviewOn', label: 'Review day', type: 'date', required: true, help: 'The day this promise will be checked against what actually moved. On or after the first promised benefit.' },
    { name: 'note', label: 'Note (optional)', type: 'textarea', help: `At least ${L.reasonMin} characters if you write one.` },
  ]);
  const preview = h('div', { class: 'stack', 'data-testid': 'investment-preview', 'aria-live': 'polite' });
  const showPreview = () => {
    form.clearErrors();
    const result = ctx.api.investmentCasePreview(form.getValues());
    preview.replaceChildren();
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field === 'flows' ? 'flowsText' : result.field, result.error || '');
      preview.appendChild(banner({ tone: 'bad', title: 'Not a case yet', body: result?.error || 'The draft was refused.' }));
      return;
    }
    const { draft, appraisal } = result;
    preview.appendChild(h('p', { class: 'small' }, h('strong', null, 'Appraisal of this draft: '), `${draft.flows.length} flow(s) in ${draft.currency}, valued on ${draft.baseOn} at ${investmentRateBp(draft.hurdleBp)} (${draft.basis}). Nothing is saved until you declare it.`));
    if (result.retrospective) preview.appendChild(banner({ tone: 'warn', title: 'Declared after the money started to move', body: 'The first outlay is dated before today, so this promise is being written with hindsight. It will be appraised and reviewable like any other, and it will be left out of the track record.' }));
    preview.appendChild(appraisalTable('Appraisal of the draft', appraisalRows(draft.currency, appraisal)));
  };
  openModal({
    title: 'Declare an investment case',
    size: 'lg',
    body: h('div', { class: 'stack' },
      form.node,
      preview,
      h('p', { class: 'muted small' }, 'A declared case is immutable: a changed promise is a new case, never an edit of the one that was ratified. Declaring moves no money and reserves no budget.')),
    footer: [
      h('button', { type: 'button', class: 'btn btn-ghost', onClick: closeAllModals }, 'Cancel'),
      h('button', { type: 'button', class: 'btn', 'data-testid': 'investment-preview-run', onClick: showPreview }, 'Appraise this draft'),
      h('button', {
        type: 'button', class: 'btn btn-primary', 'data-testid': 'investment-declare-save',
        onClick: () => { form.clearErrors(); finish(ctx, ctx.api.investmentCaseDeclare(form.getValues()), 'Case declared. It now awaits ratification by a seat above its benefit owner.', form); },
      }, 'Declare the case'),
    ],
  });
}

function decideCase(ctx, row, decision) {
  const approving = decision === 'approve';
  const negative = row.appraisal.npvSign < 0;
  const form = buildForm([
    { name: 'reason', label: approving ? (negative ? 'Why ratify a case worth less than zero at its own hurdle?' : 'Basis of the ratification (optional)') : 'Why is the case refused?', type: 'textarea', required: !approving || negative, help: `At least ${L.reasonMin} characters${approving && !negative ? ' if you write one' : ''}.` },
  ]);
  openModal({
    title: approving ? 'Ratify this investment case' : 'Refuse this investment case',
    size: 'lg',
    body: h('div', { class: 'stack' },
      banner({
        tone: approving ? (negative ? 'bad' : 'info') : 'warn',
        title: `${row.title} — ${investmentMoney(row.currency, row.appraisal.npvCents)} at ${investmentRateBp(row.hurdleBp)} (${row.basis})`,
        body: approving
          ? (negative
            ? 'At its own declared hurdle this case is worth less than zero. Ratifying it is a decision to spend that on purpose for a reason the arithmetic cannot see, so the reason is required in writing.'
            : `Benefit owner: ${row.ownerName}. Ratifying records that a seat above the owner accepted this promise; a review falls due on ${row.reviewOn} and is owed to you.`)
          : 'A refused case stays on the record with its reason. What an organisation refuses to fund is part of its funded mix.',
      }),
      appraisalTable(`Appraisal of ${row.title}`, appraisalRows(row.currency, row.appraisal, row)),
      form.node),
    footer: [
      h('button', { type: 'button', class: 'btn btn-ghost', onClick: closeAllModals }, 'Cancel'),
      h('button', {
        type: 'button', class: 'btn btn-primary', 'data-testid': `investment-${decision}-save`,
        onClick: () => { form.clearErrors(); finish(ctx, ctx.api.investmentCaseDecide({ caseId: row.caseId, decision, reason: form.getValues().reason }), approving ? 'Case ratified. Its review day is now on the record.' : 'Case refused, with its reason.', form); },
      }, approving ? 'Ratify' : 'Refuse'),
    ],
  });
}

function reviewCase(ctx, row, today) {
  const last = row.reviews.length ? row.reviews[row.reviews.length - 1] : null;
  const form = buildForm([
    { name: 'cutoffOn', label: 'Cut-off — the last day this review accounts for', type: 'date', required: true, value: today, help: last ? `After ${last.cutoffOn}, the last review’s cut-off, and not after today.` : 'Not after today. A review states what happened, never what is expected.' },
    { name: 'flowsText', label: 'Every actual flow from the valuation day to the cut-off', type: 'textarea', rows: 8, wide: true, value: last ? investmentFlowLines(last.flows) : '', placeholder: FLOWS_EXAMPLE, help: `One per line: day, kind, amount — the same grammar as the promise. Restate the whole record to the cut-off${last ? ' (the last review’s flows are pre-filled; add what moved since)' : ''}. Up to ${L.flowsPerReview} flows.` },
    { name: 'outlayComplete', label: 'Is the outlay complete?', type: 'select', required: true, options: [{ value: '', label: '— choose —' }, { value: 'no', label: 'No — money is still going out' }, { value: 'yes', label: 'Yes — nothing further will be spent to create it' }], value: last?.outlayComplete ? 'yes' : '', help: 'While the outlay is open no cost ratio is printed: spending less than planned so far cannot be told apart from running late.' },
    { name: 'nextReviewOn', label: 'Next review day (leave empty to close the case)', type: 'date', help: `A review that closes the case must reach the review day the case declared (${row.reviewOn}).` },
    { name: 'note', label: 'Note (optional — required if no flow has moved)', type: 'textarea', help: `At least ${L.reasonMin} characters if you write one.` },
  ]);
  openModal({
    title: 'Record a post-completion review',
    size: 'lg',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: `${row.title} — promised in ${row.currency} at ${investmentRateBp(row.hurdleBp)}`, body: 'The review is compared with the dated promise at the same rate, to the same valuation day. Whatever is not yet evidence is carried at exactly the promised figure; no new forecast is asked for and none is invented.' }),
      h('details', { class: 'chart-table-details' }, h('summary', null, `The promise: ${row.flows.length} dated flow(s)`), flowsTable(`Promised flows of ${row.title}`, row.currency, row.flows)),
      form.node),
    footer: [
      h('button', { type: 'button', class: 'btn btn-ghost', onClick: closeAllModals }, 'Cancel'),
      h('button', {
        type: 'button', class: 'btn btn-primary', 'data-testid': 'investment-review-save',
        onClick: () => {
          form.clearErrors();
          const values = form.getValues();
          const outlayComplete = values.outlayComplete === 'yes' ? true : values.outlayComplete === 'no' ? false : null;
          finish(ctx, ctx.api.investmentCaseReview({ caseId: row.caseId, cutoffOn: values.cutoffOn, flowsText: values.flowsText, outlayComplete, nextReviewOn: values.nextReviewOn, note: values.note }), 'Review recorded against the promise.', form);
        },
      }, 'Record the review'),
    ],
  });
}

function withdrawCase(ctx, row) {
  const form = buildForm([{ name: 'reason', label: 'Why is the case withdrawn?', type: 'textarea', required: true, help: `At least ${L.reasonMin} characters.` }]);
  openModal({
    title: 'Withdraw this case',
    body: h('div', { class: 'stack' },
      h('p', null, `“${row.title}” is still awaiting ratification. Withdrawing keeps it on the record with your reason; it can no longer be ratified.`),
      form.node),
    footer: [
      h('button', { type: 'button', class: 'btn btn-ghost', onClick: closeAllModals }, 'Cancel'),
      h('button', { type: 'button', class: 'btn btn-primary', 'data-testid': 'investment-withdraw-save', onClick: () => { form.clearErrors(); finish(ctx, ctx.api.investmentCaseWithdraw({ caseId: row.caseId, reason: form.getValues().reason }), 'Case withdrawn, with its reason.', form); } }, 'Withdraw'),
    ],
  });
}

function conventionsDialog(ctx, report) {
  const K = INVESTMENT_CASE_SETTING_KEYS;
  const [min, max] = INVESTMENT_CASE_BOUNDS.askDueDays;
  const form = buildForm([
    { name: 'askDueDays', label: 'Days a review ask is due within', type: 'number', min, max, step: 1, value: report.conventions[K.askDueDays], help: `A whole number from ${min} to ${max}. A value outside it is refused, never clamped.` },
    { name: 'autoPropagate', label: `Review automation (${INVESTMENT_CASE_RULE_ID})`, type: 'select', options: [{ value: 'on', label: 'On — a due review becomes one dated ask' }, { value: 'off', label: 'Paused — due reviews are printed here only' }], value: report.conventions[K.autoPropagate] ? 'on' : 'off', help: 'A pause governs every path, including the explicit scan. This rule reads the reporting graph, so pausing it reaches every reporting line a benefit owner holds.' },
  ]);
  openModal({
    title: 'Investment-case conventions',
    body: form.node,
    footer: [
      h('button', { type: 'button', class: 'btn btn-ghost', onClick: closeAllModals }, 'Cancel'),
      h('button', {
        type: 'button', class: 'btn btn-primary', 'data-testid': 'investment-conventions-save',
        onClick: () => {
          const values = form.getValues();
          const days = /^\d+$/.test(String(values.askDueDays).trim()) ? Number(values.askDueDays) : NaN;
          finish(ctx, ctx.api.investmentCaseSetConventions({ [K.askDueDays]: days, [K.autoPropagate]: values.autoPropagate === 'on' }), 'Conventions saved.');
        },
      }, 'Save'),
    ],
  });
}

function downloadCsv(ctx, today) {
  const result = ctx.api.investmentCaseCsvRows();
  if (!result?.ok) { toast(result?.error || 'The investment-case export was refused.', 'bad'); return; }
  downloadText({
    filename: `leados-investment-case-appraisals-${today}.csv`,
    text: serializeCsv(INVESTMENT_CASE_CSV_COLUMNS.map((key) => ({ key, header: key })), result.rows),
    mime: 'text/csv;charset=utf-8',
  });
  toast('Identity-free CSV downloaded — the same figures this screen printed.', 'good');
}

function briefDialog(ctx) {
  const result = ctx.api.investmentCaseBriefText();
  if (!result?.ok) { toast(result?.error || 'The brief was refused.', 'bad'); return; }
  openModal({
    title: 'Investment cases — brief',
    body: h('pre', { class: 'brief-text', tabindex: '0', 'data-testid': 'investment-brief' }, investmentCaseBriefText(result.report) || result.text),
    footer: [h('button', { type: 'button', class: 'btn btn-ghost', onClick: closeAllModals }, 'Close')],
  });
}

/* ------------------------------------------------------------------- cards */

function reviewTable(row) {
  return table({
    caption: `Post-completion reviews of ${row.title}`,
    columns: [
      { label: 'Cut-off', render: (review) => review.cutoffOn },
      { label: 'Benefit vs promise to date', className: 'num', render: (review) => (review.reading ? (review.reading.benefitPermille === null ? '— (nothing promised yet)' : investmentRatio(review.reading.benefitPermille)) : '—') },
      { label: 'Cost vs promise', className: 'num', render: (review) => (review.reading ? (review.reading.outlayComplete ? investmentRatio(review.reading.costPermille) : '— (outlay open)') : '—') },
      { label: 'Net present value on the evidence', className: 'num', render: (review) => (review.reading ? (review.reading.outlayComplete ? investmentMoney(row.currency, review.reading.evidenceNpvCents) : '— (outlay open)') : '—') },
      { label: 'Recorded', render: (review) => `${review.actedOn} · ${review.actedByName} · ${review.viaLabel || '—'}` },
      { label: 'Next review', render: (review) => review.nextReviewOn || 'closes the case' },
    ],
    rows: row.reviews.map((review) => ({ ...review, attrs: { 'data-testid': `investment-review-${review.actId}` } })),
    emptyMessage: 'No review is on the record.',
  });
}

function caseCard(ctx, row, report) {
  const a = row.appraisal;
  const subtitle = `${row.code} · ${row.ownerName}${row.ownerOnRoster ? '' : ' (no longer on the roster)'} · ${row.currency} at ${investmentRateBp(row.hurdleBp)} ${row.basis} · valued ${row.baseOn} · review ${row.reviewOn}`;
  const actions = [
    badge(row.statusMeta.label, row.statusMeta.tone),
    row.matrix.multiLine ? badge(`${row.matrix.ownerLinesN} reporting lines`, 'neutral', 'The benefit owner holds more than one active reporting line. The case is counted once and never split between them.') : null,
    row.matrix.reach === 'line' ? badge('through a declared line', 'neutral', 'This seat holds the benefit owner on a declared matrix line, not in its own reporting tree.') : null,
    row.retrospective ? badge('declared with hindsight', 'warn', 'Declared after its first outlay day. Left out of the track record.') : null,
    row.can.decide ? h('button', { type: 'button', class: 'btn btn-small btn-primary', 'data-testid': `investment-approve-${row.caseId}`, onClick: () => decideCase(ctx, row, 'approve') }, 'Ratify') : null,
    row.can.decide ? h('button', { type: 'button', class: 'btn btn-small', 'data-testid': `investment-reject-${row.caseId}`, onClick: () => decideCase(ctx, row, 'reject') }, 'Refuse') : null,
    row.can.review ? h('button', { type: 'button', class: `btn btn-small ${row.status === 'review-due' ? 'btn-primary' : ''}`, 'data-testid': `investment-review-open-${row.caseId}`, onClick: () => reviewCase(ctx, row, report.today) }, 'Record review') : null,
    row.can.withdraw ? h('button', { type: 'button', class: 'btn btn-small btn-ghost', 'data-testid': `investment-withdraw-${row.caseId}`, onClick: () => withdrawCase(ctx, row) }, 'Withdraw') : null,
  ].filter(Boolean);

  const monitorLine = row.monitor
    ? (row.monitor.state === 'seat'
      ? `The review is owed to ${row.monitor.seatName} — ${row.monitor.basis === 'ratifier' ? 'the seat that ratified' : 'the lowest seat above every one of the benefit owner’s reporting lines'}.`
      : row.monitor.state === 'leader-held'
        ? 'The review is owed to the workspace leader, who holds decision control over this case.'
        : row.monitor.state === 'off-roster'
          ? 'Neither the seat that ratified nor the benefit owner is on the active roster. Nobody is substituted.'
          : 'The benefit owner’s reporting lines share no single seat above them that holds the altitude to ratify. Nobody is chosen by arithmetic.')
    : null;

  return card({
    title: row.title,
    subtitle,
    attrs: { 'data-testid': `investment-case-${row.caseId}` },
    actions,
    body: h('div', { class: 'stack' },
      row.status === 'review-due'
        ? banner({ tone: 'bad', title: `Review due since ${row.dueOn}`, body: `${row.statusMeta.says} ${monitorLine || ''}` })
        : null,
      row.status === 'proposed'
        ? h('p', { class: 'muted small' }, `${row.statusMeta.says} Declared ${row.declaredOn} by ${row.declaredByName}.${row.can.decide ? '' : ' Ratifying is decision control: it belongs to a seat above the benefit owner, never to the owner.'}`)
        : null,
      a.npvSign < 0 && (row.status === 'proposed' || row.live)
        ? banner({ tone: 'warn', title: 'Worth less than zero at its own hurdle', body: `At ${investmentRateBp(row.hurdleBp)} this promise is worth ${investmentMoney(row.currency, a.npvCents)} — even if every flow arrives as promised.` })
        : null,
      appraisalTable(`Appraisal of ${row.title}`, appraisalRows(row.currency, a, row)),
      row.adjusted.state === 'adjusted'
        ? h('p', { class: 'small', 'data-testid': `investment-adjusted-${row.caseId}` },
          h('strong', null, 'At this organisation’s own track record: '),
          `${investmentMoney(row.currency, row.adjusted.npvCents)} — the same promise with its outlays at ${investmentRatio(report.trackRecord.costMedianPermille)} and its benefits at ${investmentRatio(report.trackRecord.benefitMedianPermille)}, the medians of ${report.trackRecord.costN} and ${report.trackRecord.benefitN} reviewed cases. Shown beside the promised figure, never instead of it.`)
        : row.adjusted.state === 'below-floor'
          ? h('p', { class: 'muted small', 'data-testid': `investment-adjusted-${row.caseId}` }, `No reading at the organisation’s own track record: ${report.trackRecord.reason}`)
          : null,
      h('details', { class: 'chart-table-details' },
        h('summary', null, `The promise: ${row.flows.length} dated flow(s)`),
        flowsTable(`Promised flows of ${row.title}`, row.currency, row.flows)),
      row.decision
        ? h('p', { class: 'small' }, h('strong', null, row.decision.kind === 'approve' ? 'Ratified ' : 'Refused '),
          `${row.decision.actedOn} by ${row.decision.actedByName}, through the ${String(row.decision.viaLabel || '').toLowerCase()} route.${row.decision.reason ? ` ${row.decision.reason}` : ''}`)
        : null,
      row.withdrawal ? h('p', { class: 'small' }, h('strong', null, 'Withdrawn '), `${row.withdrawal.actedOn} by ${row.withdrawal.actedByName}. ${row.withdrawal.reason}`) : null,
      row.reviews.length ? reviewTable(row) : null,
      row.reviews.filter((review) => review.reason).map((review) => h('p', { class: 'muted small' }, `Review to ${review.cutoffOn}: ${review.reason}`)),
      row.live && row.status !== 'review-due' && row.dueOn
        ? h('p', { class: 'muted small' }, `Next review ${row.dueOn}${Number.isInteger(row.dueInDays) ? ` (in ${row.dueInDays} day(s))` : ''}. ${monitorLine || ''}`)
        : null,
      row.note ? h('p', { class: 'small' }, h('strong', null, 'Note: '), row.note) : null,
    ),
  });
}

function currencyBook(report) {
  return card({
    title: 'The book, per currency',
    subtitle: 'Counts and promised outlay. Currencies are never pooled, and net present values valued on different days are never added.',
    body: table({
      caption: 'Investment cases per currency',
      columns: [
        { label: 'Currency', render: (row) => row.currency },
        { label: 'Ratified book', className: 'num', render: (row) => String(row.ratified.n) },
        { label: 'Promised outlay', className: 'num', render: (row) => investmentMoney(row.currency, row.ratified.outlayCents) },
        { label: 'Worth more than zero', className: 'num', render: (row) => String(row.ratified.npvPositiveN) },
        { label: 'Worth less than zero', className: 'num', render: (row) => String(row.ratified.npvNegativeN) },
        { label: 'Proposals', className: 'num', render: (row) => String(row.proposed.n) },
        { label: 'Asking', className: 'num', render: (row) => investmentMoney(row.currency, row.proposed.outlayCents) },
      ],
      rows: report.currencies.map((row) => ({ ...row, attrs: { 'data-testid': `investment-currency-${row.currency}` } })),
      emptyMessage: 'No case is in view.',
    }),
  });
}

function registerView(ctx, report) {
  const t = report.totals;
  return h('div', { class: 'stack' },
    t['review-dueN']
      ? banner({ tone: 'bad', title: `${t['review-dueN']} ratified promise(s) have reached their review day unexamined`, body: `${INVESTMENT_CASE_RULE_ID} asks the seat holding decision control over each — never its benefit owner — to record what actually moved. A due review is not a verdict on the case; it is the absence of one.` })
      : null,
    report.currencies.length ? currencyBook(report) : null,
    report.cases.length
      ? h('div', { class: 'stack' }, ...report.cases.map((row) => caseCard(ctx, row, report)))
      : emptyState({
        title: 'No investment case is in view',
        body: 'An envelope says how much may be spent and a delegation limit says who may sign. Neither says whether the money is worth more spent here than left where it is — or, afterwards, whether it delivered. Declare the case: dated money out, dated money back, a hurdle rate and a review day.',
      }),
    t.remainderN ? h('p', { class: 'muted small' }, `${t.remainderN} further case(s) are not listed here; the totals above count them.`) : null,
    report.refusals.length
      ? card({ title: `What this page will not print (${report.refusals.length})`, body: h('div', { class: 'stack' },
        ...report.refusals.map((refusal) => h('p', { class: 'small', 'data-testid': `investment-refusal-${refusal.key}` }, h('strong', null, `${refusal.key}: `), refusal.says))) })
      : null);
}

function trackView(report) {
  const track = report.trackRecord;
  const reviewed = report.allCases.filter((row) => row.latestReading);
  return h('div', { class: 'stack' },
    card({
      title: 'What this organisation’s promises have been worth',
      subtitle: `Evidence floor ${track.floorN} — below it, counts only.`,
      attrs: { 'data-testid': 'investment-track-record' },
      body: h('div', { class: 'stack' },
        h('div', { class: 'stat-row' },
          stat({ label: 'Cost against promise (median)', value: track.costSufficient ? investmentRatio(track.costMedianPermille) : '—', hint: `${track.costN} of ${track.floorN} completed-outlay reviews`, tone: track.costSufficient && track.costMedianPermille > 1000 ? 'warn' : '' }),
          stat({ label: 'Benefit against promise to date (median)', value: track.benefitSufficient ? investmentRatio(track.benefitMedianPermille) : '—', hint: `${track.benefitN} of ${track.floorN} reviews with a promised benefit`, tone: track.benefitSufficient && track.benefitMedianPermille < 1000 ? 'warn' : '' }),
          stat({ label: 'Left out — declared with hindsight', value: track.retrospectiveN, hint: 'reviewed, but written after the money moved' })),
        track.sufficient
          ? h('p', { class: 'small' }, 'Each open promise on the register is re-read at these two medians, beside its promised figure. The residual value is carried as promised: the register holds no evidence about residuals.')
          : h('p', { class: 'small' }, track.reason),
        h('p', { class: 'muted small' }, 'Ratios are dimensionless — present value against present value at the case’s own rate — so they pool across currencies where amounts never could. The track record is the whole workspace’s, not this seat’s span, and names nobody.')),
    }),
    card({
      title: `Reviewed cases in view (${reviewed.length})`,
      body: table({
        caption: 'Latest review of each reviewed case',
        columns: [
          { label: 'Case', render: (row) => `${row.code} · ${row.title}` },
          { label: 'Cut-off', render: (row) => row.latestReading.cutoffOn },
          { label: 'Benefit vs promise to date', className: 'num', render: (row) => (row.latestReading.benefitPermille === null ? '—' : investmentRatio(row.latestReading.benefitPermille)) },
          { label: 'Cost vs promise', className: 'num', render: (row) => (row.latestReading.outlayComplete ? investmentRatio(row.latestReading.costPermille) : '— (outlay open)') },
          { label: 'In the track record', render: (row) => (row.retrospective ? 'No — declared with hindsight' : 'Yes') },
        ],
        rows: reviewed,
        emptyMessage: 'No case has been reviewed yet. The track record begins with the first review.',
      }),
    }));
}

function methodView(ctx, report) {
  const method = INVESTMENT_CASE_METHOD;
  const K = INVESTMENT_CASE_SETTING_KEYS;
  return h('div', { class: 'stack' },
    card({
      title: 'Conceptual method illustration',
      subtitle: 'A dated promise, weighed at a declared rate, ratified by someone else, and checked against what moved — generated asset, never workspace data.',
      body: h('figure', {},
        h('img', { src: DIAGRAM_URL, loading: 'lazy', alt: 'Conceptual method illustration: a horizontal timeline with evenly spaced tick marks. At its left end stands a two-pan balance scale holding a slate block in one pan and a teal block in the other, its beam tipped toward the slate side. Near the start of the line two tall slate bars hang below it — money going out — and beside them hangs a shorter dashed outline marked by a bracket. Further along, five bars rise above the line, each one shorter and paler than the one before — money coming back, worth less the later it arrives. On top of each rising bar a dashed outline continues upward to where that bar was promised to reach, and a bracket beside it marks the gap between what was promised and what arrived, so neither is drawn over the other. At the right end a dashed line climbs from the timeline to a figure standing on the higher of two steps, above a second figure on the lower step: the check is owed to the seat above the one who made the promise.' }),
        h('figcaption', { class: 'muted small' }, 'Conceptual method illustration (generated asset) — not workspace data, and no figure in it is a figure from this workspace.')),
    }),
    card({
      title: 'How a case is appraised, ratified and reviewed',
      subtitle: `${INVESTMENT_CASE_RULE_ID} · ask window ${report.conventions[K.askDueDays]} day(s) · automation ${report.conventions[K.autoPropagate] ? 'on' : 'paused'}`,
      actions: report.seat.canGovern
        ? [
          h('button', { type: 'button', class: 'btn btn-small', 'data-testid': 'investment-conventions-open', onClick: () => conventionsDialog(ctx, report) }, 'Conventions'),
          h('button', { type: 'button', class: 'btn btn-small', 'data-testid': 'investment-scan', onClick: () => finish(ctx, ctx.api.investmentCaseScan(), 'Scan run on the shared spine.') }, 'Run the review scan'),
        ]
        : [],
      body: h('div', { class: 'stack' },
        ...[['unit', 'Unit'], ['discounting', 'Discounting'], ['value', 'Value'], ['rate', 'Rate of return'], ['payback', 'Payback'], ['residual', 'Residual'], ['control', 'Decision control'], ['review', 'Review'], ['trackRecord', 'Track record'], ['matrix', 'Matrix'], ['refusal', 'Refusals'], ['notSaid', 'Not said']]
          .map(([key, label]) => h('p', null, h('strong', null, `${label}: `), method[key])),
        h('p', { class: 'muted small' }, `Arithmetic: ${report.math.fractionBits}-bit binary fixed point, ${report.math.dayCount}; ${report.math.rounding}. Rates in ${report.math.rateUnit}; the internal rate is ${report.math.irrRounding}.`),
        h('p', { class: 'muted small' }, 'Three limits, printed rather than hidden: a ratification is not yet tested against the ratifier’s standing delegation limit; a case is not yet tied to the budget envelope that funds it; and proposals are ordered for rationing but not cut off against a declared capital budget.')),
    }),
    card({
      title: 'Frameworks this register applies',
      body: h('div', { class: 'stack' }, ...(report.frameworks || []).map((framework) => h('p', null,
        h('strong', null, `${framework.label}. `), framework.says))),
    }),
    card({
      title: 'Refusals this register can print',
      body: h('div', { class: 'stack' }, ...INVESTMENT_CASE_REFUSALS.map((refusal) => h('p', { class: 'small' }, h('strong', null, `${refusal.key}: `), refusal.says))),
    }),
    card({
      title: 'What is never done here',
      body: h('ul', null,
        h('li', null, 'No money is moved, no envelope is edited and no commitment is posted by this register or its rule.'),
        h('li', null, 'No case is ratified or reviewed by its own benefit owner — at the door, and again when the file is loaded.'),
        h('li', null, 'No currency is pooled with another, and no net present values are added across cases.'),
        h('li', null, 'No internal rate of return is printed unless it is provably the only one.'),
        h('li', null, 'No forecast is invented: what is not yet evidence is carried at exactly the promised figure.'),
        h('li', null, 'No person is scored, ranked or charged with a shortfall. A ratio is a fact about a promise.')),
    }),
  );
}

/**
 * Render the panel. `shell.tabs` is the Budget & finance tab strip, supplied by
 * the finance view so the three finance panels share one navigation.
 */
export function renderFinanceInvestmentCasePanel(ctx, shell = {}) {
  const result = ctx.api.investmentCaseReport();
  if (!result?.ok) {
    return h('div', { class: 'page' },
      pageHeader({ eyebrow: 'Finance & budgetary control', title: 'Investment cases', subtitle: 'What the money is promised to return, and whether it did.' }),
      shell.tabs || null,
      banner({ tone: 'bad', title: 'The register could not be read', body: result?.error || 'The seat refused the read.' }));
  }
  const report = result.report;
  const requested = ctx.query?.get?.('view');
  const view = VIEWS.some((row) => row.key === requested) ? requested : 'register';
  const t = report.totals;
  const track = report.trackRecord;

  return h('div', { class: 'page', 'data-testid': 'investment-case-panel' },
    pageHeader({
      eyebrow: 'Finance & budgetary control',
      title: 'Is it worth it — and did it deliver?',
      subtitle: 'An envelope says how much may be spent. A case says what the spending is promised to return: dated money out, dated money back, weighed at a declared rate, ratified by a seat above its owner, and checked afterwards against what actually moved.',
      actions: [
        h('button', { type: 'button', class: 'btn btn-small', 'data-testid': 'investment-brief-open', onClick: () => briefDialog(ctx) }, 'Brief'),
        h('button', { type: 'button', class: 'btn btn-small', 'data-testid': 'investment-csv', onClick: () => downloadCsv(ctx, report.today) }, 'Download CSV'),
        report.seat.canDeclare
          ? h('button', { type: 'button', class: 'btn btn-primary', 'data-testid': 'investment-declare-open', onClick: () => declareCase(ctx) }, 'Declare a case')
          : null,
      ].filter(Boolean),
    }),
    shell.tabs || null,
    ctx.persistError ? card({ body: h('p', { class: 'text-warn small' }, `Changes are not being saved: ${ctx.persistError}`) }) : null,

    h('div', { class: 'stat-row' },
      stat({ label: 'Awaiting ratification', value: t.proposedN, hint: t.awaitingThisSeatN ? `${t.awaitingThisSeatN} this seat may ratify` : 'declared, undecided', tone: t.proposedN ? 'warn' : '' }),
      stat({ label: 'Review due', value: t['review-dueN'], hint: 'ratified, unexamined', tone: t['review-dueN'] ? 'bad' : '' }),
      stat({ label: 'Ratified book', value: t.liveN, hint: 'ratified and not yet closed' }),
      stat({ label: 'Closed with a final review', value: t.closedN, hint: 'evidence about promises' }),
      stat({ label: 'Track record', value: track.sufficient ? `${investmentRatio(track.benefitMedianPermille)} benefit` : `${Math.min(track.costN, track.benefitN)} of ${track.floorN}`, hint: track.sufficient ? `${investmentRatio(track.costMedianPermille)} cost — medians of reviewed cases` : 'reviewed cases needed before a median is shown' })),

    tabs({
      items: VIEWS.map((row) => ({ key: row.key, label: row.label })),
      active: view,
      ariaLabel: 'Investment case views',
      onSelect: (key) => ctx.navigate(key === 'register' ? INVESTMENT_CASE_HREF : `${INVESTMENT_CASE_HREF}&view=${encodeURIComponent(key)}`),
    }),

    view === 'register' ? registerView(ctx, report) : view === 'track' ? trackView(report) : methodView(ctx, report),

    h('p', { class: 'muted small' }, `Read at ${report.today} from ${report.seat.label || 'this seat'}. ${INVESTMENT_CASE_RIGHTS.READ} is open at every altitude for a seat’s own span; declaring requires ${INVESTMENT_CASE_RIGHTS.DECLARE}; ratifying and reviewing require ${INVESTMENT_CASE_RIGHTS.RATIFY} and are refused to a case’s own benefit owner.${t.outsideN ? ` ${t.outsideN} case(s) outside this seat’s span are counted, not listed.` : ''}`),
  );
}

export default renderFinanceInvestmentCasePanel;
