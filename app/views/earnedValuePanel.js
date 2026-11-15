/**
 * app/views/earnedValuePanel.js — Earned-Value Delivery & Estimate-at-Completion
 * Register (ADR-0217, Schema v171). Eighth panel of `#/finance`.
 *
 * ONE READER, ONE SET OF NUMBERS. Every figure comes from `buildEarnedValue`
 * through the seat-checked `earnedValueReport` command, and every money cell
 * carries the same whole cents in `data-cents` that the reader returned. The
 * panel computes nothing — not a ratio, not a total, not a state. A refused
 * figure prints a dash with its reason, never a zero; and the two facts the
 * reader keeps apart — `reconciles` (the printed identities hold) and
 * `figuresComplete` (every open case reads complete against the CURRENT
 * baseline) — are printed in their own banners, because the Bulletproof
 * Reliability Mandate makes them different claims.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { serializeCsv } from '../core/csv.js';
import { formatMoney } from '../core/domain/finance.js';
import {
  EV_BOUNDS,
  EV_CASE_STATE_BY_KEY,
  EV_CSV_COLUMNS,
  EV_FRAMEWORKS,
  EV_HREF,
  EV_LIMITS,
  EV_METHOD,
  EV_METHODS,
  EV_REFUSALS,
  EV_VIEWS,
  EV_SETTING_KEYS,
  EV_SETTING_LABELS,
} from '../core/domain/earnedValueRegistry.js';

const L = EV_LIMITS;
const BASE_HREF = EV_HREF;
const DIAGRAM_URL = './app/assets/earned-value-method.jpg';

function refresh(ctx) {
  if (typeof ctx?.refresh === 'function') ctx.refresh();
  else if (typeof ctx?.rerender === 'function') ctx.rerender();
  else if (typeof ctx?.render === 'function') ctx.render();
}

function button(label, onClick, { primary = false, testid = null } = {}) {
  return h('button', {
    type: 'button',
    class: `btn btn-small ${primary ? 'btn-primary' : 'btn-ghost'}`,
    ...(testid ? { 'data-testid': testid } : {}),
    onClick,
  }, label);
}

/** A refused act prints its sentence on the field it concerns and saves nothing. */
function finish(ctx, result, message, form = null) {
  if (!result?.ok) {
    if (form && result?.field) form.setFieldError(result.field, result.error || '');
    toast(result?.error || 'The earned-value act was refused.', 'bad');
    return false;
  }
  closeAllModals();
  toast(result.warning || message, result.warning ? 'bad' : 'good');
  refresh(ctx);
  return true;
}

/** A money cell: the printed text, and the same whole cents as data. */
function moneyCell(currency, cents, testid) {
  const claimed = Number.isSafeInteger(cents);
  return h('span', {
    class: 'num',
    'data-testid': testid,
    'data-cents': claimed ? String(cents) : '',
    ...(claimed ? {} : { title: 'Refused or not applicable — see the reason printed beside it.' }),
  }, claimed ? formatMoney(currency, cents / 100) : '—');
}

const pctFromPpm = (value) => (Number.isSafeInteger(value) ? `${(value / 100).toFixed(1)}%` : '—');
const indexFromPpm = pctFromPpm;

const ledgerTable = (labels, rows, { testid = '' } = {}) => {
  const columns = labels.map((label, index) => ({ key: `c${index}`, label }));
  const objects = rows.map((cells) => (Array.isArray(cells)
    ? Object.fromEntries(columns.map((column, index) => [column.key, cells[index]]))
    : cells));
  const element = table({ columns, rows: objects });
  return testid ? h('div', { 'data-testid': testid }, element) : element;
};

function stateBadge(row) {
  const state = EV_CASE_STATE_BY_KEY[row.stateKey] || { label: row.stateKey, tone: 'neutral', says: '' };
  return h('span', { title: state.says || '', 'data-testid': `ev-state-${row.id}`, 'data-state': row.stateKey }, badge(state.label, state.tone));
}

/* ------------------------------------------------------------------- dialogs */

function conventionsDialog(ctx, report, onDone) {
  const c = report.conventions;
  const form = buildForm([
    {
      name: EV_SETTING_KEYS.staleDays,
      label: EV_SETTING_LABELS.staleDays,
      type: 'number',
      value: String(c.staleDays),
      help: `Whole number ${EV_BOUNDS.staleDays[0]}–${EV_BOUNDS.staleDays[1]} days. A reading older than this is printed as stale and the owner is asked for a current one.`,
    },
    {
      name: EV_SETTING_KEYS.cpiFloorPpm,
      label: EV_SETTING_LABELS.cpiFloorPpm,
      type: 'number',
      value: String(c.cpiFloorPpm),
      help: `Whole number ${EV_BOUNDS.cpiFloorPpm[0]}–${EV_BOUNDS.cpiFloorPpm[1]}. 10000 is a CPI of 1.0. A complete reading below the floor owes the owner a dated decision.`,
    },
  ]);
  const save = () => {
    const values = form.getValues();
    const result = ctx.api.earnedValueSetConventions({
      [EV_SETTING_KEYS.staleDays]: Number(values[EV_SETTING_KEYS.staleDays]),
      [EV_SETTING_KEYS.cpiFloorPpm]: Number(values[EV_SETTING_KEYS.cpiFloorPpm]),
    });
    if (finish(ctx, result, 'Conventions saved.', form)) onDone?.();
  };
  openModal({
    title: 'Earned-value conventions',
    body: h('div', { class: 'stack' },
      banner({
        tone: 'info',
        title: 'Two declarations, and neither is clamped',
        body: 'A value outside its bounds is refused rather than clamped, because a clamp would let a typo move the staleness window or the cost floor the board reads. Changing a convention re-derives every state on the next read; no stored figure moves.',
      }),
      form.node),
    actions: [
      { label: 'Cancel', onClick: () => closeAllModals() },
      { label: 'Save', primary: true, onClick: save },
    ],
  });
}

function caseDialog(ctx, view, onDone) {
  const form = buildForm([
    { name: 'label', label: 'The work, in a sentence a reader recognises', type: 'text', required: true, help: `At least ${L.labelMin} characters. Never used as a key.` },
    { name: 'currency', label: 'Currency', type: 'text', required: true, value: 'DKK', help: 'Three letters. Every package, reading and actual on this case is in this currency; nothing is converted.' },
    { name: 'methodKey', label: 'How progress is measured', type: 'select', required: true, options: EV_METHODS.map((row) => ({ value: row.key, label: row.label })), value: 'halves', help: 'A closed list. The loader and the writer both refuse shares the declared method does not admit.' },
    { name: 'ownerId', label: 'Accountable delivery owner', type: 'select', required: true, options: view.people || [], help: 'One person. You may only declare for somebody you hold on the home line or a declared line.' },
    { name: 'source', label: 'Where this case came from (optional)', type: 'text', help: 'The steering-group minute, the board paper, the programme charter.' },
    { name: 'note', label: 'Note (optional)', type: 'textarea', help: 'Anything a reader needs to weigh the plan.' },
  ]);
  openModal({
    title: 'Declare an earned-value case',
    body: h('div', { class: 'stack' },
      banner({
        tone: 'info',
        title: 'A plan on the record, not a hope',
        body: 'A case names the work, its unit of money and the way progress will be measured. The packages and increments that follow are what the owner signs up to — and the register will not move a single figure that the increments do not re-add to.',
      }),
      form.node),
    actions: [
      { label: 'Cancel', onClick: () => closeAllModals() },
      { label: 'Declare', primary: true, onClick: () => {
        const result = ctx.api.earnedValueDeclareCase(form.getValues());
        if (finish(ctx, result, 'Case declared.', form)) onDone?.();
      } },
    ],
  });
}

function packageDialog(ctx, view, caseRow, onDone) {
  const form = buildForm([
    { name: 'code', label: 'WBS code', type: 'text', required: true, help: 'Unique among this case’s live packages. A re-baseline supersedes; it does not clone a code.' },
    { name: 'name', label: 'The work package', type: 'text', required: true, help: 'Name the work, not the budget line.' },
    { name: 'plannedAmount', label: 'Budget for this package', type: 'text', required: true, help: 'Positive amount, to the cent, in the case currency. No commas — a comma is a decimal separator in half of Europe.' },
    { name: 'plannedStart', label: 'Planned start', type: 'date', required: true },
    { name: 'plannedFinish', label: 'Planned finish', type: 'date', required: true, help: 'On or after the start.' },
    { name: 'phasesText', label: 'Increments of planned value', type: 'textarea', required: true, help: 'One per line: `YYYY-MM-DD <amount>` — e.g. `2026-06-30 1000000.00`. They must sum EXACTLY to the budget; otherwise the package is refused whole.' },
    { name: 'lineSharesText', label: 'Line split (optional)', type: 'textarea', help: 'One line per share: `personId <percent>` — e.g. `mia 60`. Declared shares must sum to exactly 100. Leave empty for no attribution; nothing is ever estimated.' },
    { name: 'note', label: 'Note (optional)', type: 'textarea' },
  ]);
  openModal({
    title: `Add a package — ${caseRow.label}`,
    body: h('div', { class: 'stack' },
      banner({
        tone: 'info',
        title: 'The increments ARE the baseline',
        body: 'There is no default curve and no interpolation. Planned value before the start, after the finish and in between is exactly the sum of the increments dated on or before each cut-off — nothing is assumed between them.',
      }),
      form.node),
    actions: [
      { label: 'Cancel', onClick: () => closeAllModals() },
      { label: 'Add package', primary: true, onClick: () => {
        const result = ctx.api.earnedValueAddPackage({ caseId: caseRow.id, ...form.getValues() });
        if (finish(ctx, result, 'Package baselined.', form)) onDone?.();
      } },
    ],
  });
}

function rebaselineDialog(ctx, view, caseRow, onDone) {
  const live = caseRow.packages || [];
  if (!live.length) { toast('There is no live package to re-baseline.', 'bad'); return; }
  const form = buildForm([
    { name: 'packageId', label: 'Package to re-baseline', type: 'select', required: true, options: live.map((pkg) => ({ value: pkg.id, label: `${pkg.code} — ${pkg.name}` })) },
    { name: 'reason', label: 'Why is the baseline changing?', type: 'textarea', required: true, help: `At least ${L.reasonMin} characters. A re-baseline is a dated, reasoned, append-only act — the old package stays on the record, marked superseded.` },
    { name: 'name', label: 'New name (optional)', type: 'text', help: 'Leave blank to carry over.' },
    { name: 'plannedAmount', label: 'New budget (optional)', type: 'text', help: 'Leave blank to carry over.' },
    { name: 'plannedStart', label: 'New start (optional)', type: 'date' },
    { name: 'plannedFinish', label: 'New finish (optional)', type: 'date' },
    { name: 'phasesText', label: 'New increments (optional)', type: 'textarea', help: 'Leave blank to carry over. When given, they must sum exactly to the budget.' },
    { name: 'lineSharesText', label: 'New line split (optional)', type: 'textarea', help: 'Leave blank to carry over. When given, shares must sum to exactly 100.' },
  ]);
  const submit = () => {
    const values = form.getValues();
    const payload = { caseId: caseRow.id, packageId: values.packageId, reason: values.reason };
    for (const key of ['name', 'plannedAmount', 'plannedStart', 'plannedFinish', 'phasesText', 'lineSharesText']) {
      if (values[key] !== undefined && String(values[key]).trim() !== '') payload[key] = values[key];
    }
    const result = ctx.api.earnedValueRebaselinePackage(payload);
    if (finish(ctx, result, 'Baseline revised. The old package stays on the record.', form)) onDone?.();
  };
  openModal({
    title: `Re-baseline — ${caseRow.label}`,
    body: h('div', { class: 'stack' },
      banner({
        tone: 'warn',
        title: 'The plan moves, and the record says so',
        body: 'Readings cut against the old baseline are kept and print as baseline-moved — their figures re-derive against the CURRENT baseline and the panel says so. Nothing is silently re-phased.',
      }),
      form.node),
    actions: [
      { label: 'Cancel', onClick: () => closeAllModals() },
      { label: 'Re-baseline', primary: true, onClick: submit },
    ],
  });
}

function readingDialog(ctx, view, caseRow, onDone) {
  const live = caseRow.packages || [];
  if (!live.length) { toast('This case has no live baseline yet. Add packages before reading progress.', 'bad'); return; }
  const method = EV_METHODS.find((row) => row.key === caseRow.methodKey) || EV_METHODS[2];
  const shareFields = live.map((pkg) => (method.admits
    ? {
        name: `share_${pkg.id}`,
        label: `${pkg.code} — earned share`,
        type: 'select',
        required: true,
        value: '0',
        options: method.admits.map((pct) => ({ value: String(pct), label: `${pct}%` })),
      }
    : {
        name: `share_${pkg.id}`,
        label: `${pkg.code} — earned share (whole percent)`,
        type: 'number',
        required: true,
        value: '0',
        help: 'Whole percent, 0–100.',
      }));
  const form = buildForm([
    { name: 'cutoffDay', label: 'Cut-off day', type: 'date', required: true, help: `The date the whole board reads against. Not in the future (today is ${view.asOf}); not before the case was declared.` },
    ...shareFields,
    { name: 'evidenceNote', label: 'Evidence read', type: 'textarea', required: true, help: `At least ${L.evidenceMin} characters. The percent-complete review, the milestone ticked, the minutes — numbers with no source are a mood.` },
  ]);
  const submit = () => {
    const values = form.getValues();
    const shares = {};
    for (const field of shareFields) {
      const raw = values[field.name];
      const pct = Number(raw);
      shares[field.name.slice('share_'.length)] = Number.isInteger(pct) ? pct : NaN;
    }
    const result = ctx.api.earnedValueRecordReading({ caseId: caseRow.id, cutoffDay: values.cutoffDay, shares, evidenceNote: values.evidenceNote });
    if (finish(ctx, result, 'Reading recorded.', form)) onDone?.();
  };
  openModal({
    title: `Record a reading — ${caseRow.label}`,
    body: h('div', { class: 'stack' },
      banner({
        tone: 'info',
        title: 'One cut-off, every live package, named evidence',
        body: `Under the declared method (${method.label}) a package earns ${method.admits ? method.admits.join(' or ') : 'a declared whole percent'}. A reading that does not name EVERY live package is refused whole — EV is never zero-filled.`,
      }),
      form.node),
    actions: [
      { label: 'Cancel', onClick: () => closeAllModals() },
      { label: 'Record', primary: true, onClick: submit },
    ],
  });
}

function actualDialog(ctx, view, caseRow, onDone) {
  const live = caseRow.packages || [];
  const options = [{ value: '', label: 'Not allocated to a package (carried as its own bucket)' }]
    .concat(live.map((pkg) => ({ value: pkg.id, label: `${pkg.code} — ${pkg.name}` })));
  const form = buildForm([
    { name: 'packageId', label: 'Package', type: 'select', options, value: '', help: 'An actual that belongs to no package is counted in the case, attributed to no package and no line — never dropped.' },
    { name: 'date', label: 'Day the cost was incurred', type: 'date', required: true, help: `Not in the future (today is ${view.asOf}).` },
    { name: 'amount', label: 'Amount', type: 'text', required: true, help: 'Positive, to the cent, in the case currency. No commas.' },
    { name: 'source', label: 'Source (optional)', type: 'text', help: 'The timesheet, the invoice, the posted period.' },
    { name: 'note', label: 'Note (optional)', type: 'textarea' },
  ]);
  openModal({
    title: `Record an actual cost — ${caseRow.label}`,
    body: h('div', { class: 'stack' },
      banner({
        tone: 'info',
        title: 'Cost is its own dated act',
        body: 'Recording an actual never infers progress: the two ledgers are independent, and the ratio between them is the whole point of this register.',
      }),
      form.node),
    actions: [
      { label: 'Cancel', onClick: () => closeAllModals() },
      { label: 'Record', primary: true, onClick: () => {
        const values = form.getValues();
        const result = ctx.api.earnedValueRecordActual({ caseId: caseRow.id, packageId: values.packageId || null, date: values.date, amount: values.amount, source: values.source, note: values.note });
        if (finish(ctx, result, 'Actual recorded.', form)) onDone?.();
      } },
    ],
  });
}

function reasonDialog(ctx, { title, label, note, action, onDone }) {
  const form = buildForm([
    { name: 'reason', label, type: 'textarea', required: true, help: 'At least a sentence. Nothing is deleted — the reason stays on the record and the exclusion is counted.' },
  ]);
  openModal({
    title,
    body: h('div', { class: 'stack' },
      banner({ tone: 'warn', title: 'Nothing is deleted', body: note }),
      form.node),
    actions: [
      { label: 'Cancel', onClick: () => closeAllModals() },
      { label: 'Withdraw', primary: true, onClick: () => {
        const result = action(form.getValues().reason);
        if (finish(ctx, result, 'Withdrawn.', form)) onDone?.();
      } },
    ],
  });
}

/* ------------------------------------------------------------------ sections */

function summaryCard(report) {
  const rows = report.totals;
  if (!rows.length) {
    return card({
      title: 'No earned-value case has been declared',
      body: emptyState({
        title: 'Nothing is measured, so nothing is claimed',
        body: 'Declare the case — the work, its currency and the way progress will be measured — then baseline the packages and their increments. The register will not infer either from a budget envelope or an investment case.',
      }),
    });
  }
  if (rows.length > 1) {
    return card({
      title: 'More than one currency is held',
      body: h('div', { class: 'stack' },
        banner({
          tone: 'warn',
          title: 'No single total is printed',
          body: 'Currencies are never converted and never pooled. Each is printed with its own totals below; a grand total would require an exchange rate nobody declared on this record.',
        }),
        ledgerTable(
          ['Currency', 'Open cases', 'BAC', 'EV', 'AC', 'CPI', 'EAC at CPI'],
          rows.map((bucket) => [
            bucket.currency,
            String(bucket.casesOpenN),
            moneyCell(bucket.currency, bucket.bacCents, `ev-cur-${bucket.currency}-bac`),
            moneyCell(bucket.currency, bucket.evCents, `ev-cur-${bucket.currency}-ev`),
            moneyCell(bucket.currency, bucket.acCents, `ev-cur-${bucket.currency}-ac`),
            indexFromPpm(bucket.cpiPpm),
            moneyCell(bucket.currency, bucket.eacAtCpiCents, `ev-cur-${bucket.currency}-eac`),
          ]),
          { testid: 'ev-currency-totals' },
        )),
    });
  }
  const bucket = rows[0];
  return card({
    title: `${bucket.currency} — the whole register`,
    body: h('div', { class: 'grid grid-4' },
      stat({ label: 'BAC (live baseline)', value: moneyCell(bucket.currency, bucket.bacCents, 'ev-total-bac'), hint: 'budget of the live packages, re-proved to the cent' }),
      stat({ label: 'Planned value', value: moneyCell(bucket.currency, bucket.pvCents, 'ev-total-pv'), hint: 'increments come due on or before the cut-off' }),
      stat({ label: 'Earned value', value: moneyCell(bucket.currency, bucket.evCents, 'ev-total-ev'), hint: 'declared shares, under the case’s method' }),
      stat({ label: 'Actual cost', value: moneyCell(bucket.currency, bucket.acCents, 'ev-total-ac'), hint: 'incurred on or before the cut-off' }),
      stat({ label: 'Cost variance', value: moneyCell(bucket.currency, bucket.cvCents, 'ev-total-cv'), hint: 'EV − AC, to the cent' }),
      stat({ label: 'Schedule variance', value: moneyCell(bucket.currency, bucket.svCents, 'ev-total-sv'), hint: 'EV − PV, to the cent' }),
      stat({ label: 'CPI', value: indexFromPpm(bucket.cpiPpm), hint: 'EV ÷ AC — withheld when AC is zero' }),
      stat({ label: 'SPI', value: indexFromPpm(bucket.spiPpm), hint: 'EV ÷ PV — withheld when PV is zero' }),
      stat({ label: 'EAC at plan', value: moneyCell(bucket.currency, bucket.eacAtPlanCents, 'ev-total-eac-plan'), hint: 'AC + remaining at the budgeted rate' }),
      stat({ label: 'EAC at CPI', value: moneyCell(bucket.currency, bucket.eacAtCpiCents, 'ev-total-eac-cpi'), hint: 'current efficiency persists; refused when EV is zero' }),
      stat({ label: 'EAC at CPI×SPI', value: moneyCell(bucket.currency, bucket.eacAtCpiSpiCents, 'ev-total-eac-cpispi'), hint: 'both persist; refused when EV or PV is zero' }),
      stat({ label: 'Needs a reading or a decision', value: String(report.counts.casesStale + report.counts.casesOverrun), tone: (report.counts.casesStale + report.counts.casesOverrun) ? 'bad' : '', hint: 'stale cases plus complete readings under the cost floor' }),
    ),
  });
}

function latestReadingBlock(report, row) {
  const latest = row.latestReading;
  if (!latest) return h('p', { class: 'muted small' }, 'Never read yet — no dated evidence of progress is on the record.');
  return h('div', { class: 'stack-xs' },
    h('p', { class: 'small' }, `Latest reading: cut-off ${latest.cutoffDay}, decided ${latest.decidedOn}${latest.baselineMoved ? ' — baseline moved since this reading; figures re-derived against the current plan' : ''}.`),
    latest.missingShares?.length
      ? h('p', { class: 'small text-warn' }, `The reading names no share for: ${latest.missingShares.join(', ')} — EV and everything derived from it is refused.`)
      : null,
    h('p', { class: 'muted small' }, latest.evidenceNote
      ? `Evidence: ${latest.evidenceNote}`
      : 'Evidence note recorded.'),
  );
}

function caseCard(ctx, report, row, caps, onDone) {
  const withdrawn = row.status === 'withdrawn';
  const latest = row.latestReading;
  const unalloc = row.acUnallocatedCents;
  return card({
    title: row.label,
    actions: [
      !withdrawn && caps.canRecord ? button('Record reading', () => readingDialog(ctx, { ...report, asOf: report.asOf }, row, onDone), { testid: `ev-reading-open-${row.id}` }) : null,
      !withdrawn && caps.canRecord ? button('Record actual', () => actualDialog(ctx, { ...report, asOf: report.asOf }, row, onDone), { testid: `ev-actual-open-${row.id}` }) : null,
      !withdrawn && caps.canDeclare && (row.packages?.length > 0) ? button('Re-baseline', () => rebaselineDialog(ctx, report, row, onDone), { testid: `ev-rebaseline-${row.id}` }) : null,
      !withdrawn && caps.canDeclare ? button('Add package', () => packageDialog(ctx, report, row, onDone), { testid: `ev-add-package-${row.id}` }) : null,
      !withdrawn && caps.canDeclare ? button('Withdraw case', () => reasonDialog(ctx, {
        title: 'Withdraw the case',
        label: 'Why is this case withdrawn?',
        note: 'A withdrawn case is kept with its reason and leaves every roll-up. The reader counts the exclusion.',
        action: (reason) => ctx.api.earnedValueWithdrawCase({ caseId: row.id, reason }),
        onDone,
      }), { testid: `ev-withdraw-case-${row.id}` }) : null,
    ].filter(Boolean),
    body: h('div', { class: 'stack' },
      h('p', { class: 'muted small' }, `${row.currency} · ${row.methodLabel} · owner ${row.ownerName}${row.ownerOnRoster ? '' : ' — not on the roster'} · declared ${row.declaredOn} · baseline v${row.baselineVersion} · ${row.livePackageCount} live package(s), ${row.supersededPackageCount} superseded`),
      stateBadge(row),
      h('div', { class: 'grid grid-4' },
        stat({ label: 'BAC', value: moneyCell(row.currency, row.bacCents, `ev-case-${row.id}-bac`) }),
        stat({ label: 'PV', value: moneyCell(row.currency, latest?.pvCents ?? null, `ev-case-${row.id}-pv`) }),
        stat({ label: 'EV', value: moneyCell(row.currency, latest?.evCents ?? null, `ev-case-${row.id}-ev`) }),
        stat({ label: 'AC', value: moneyCell(row.currency, latest?.acCents ?? null, `ev-case-${row.id}-ac`), hint: Number.isSafeInteger(unalloc) && unalloc > 0 ? `incl. ${formatMoney(row.currency, unalloc / 100)} unallocated` : undefined }),
        stat({ label: 'CV', value: moneyCell(row.currency, latest?.cvCents ?? null, `ev-case-${row.id}-cv`) }),
        stat({ label: 'SV', value: moneyCell(row.currency, latest?.svCents ?? null, `ev-case-${row.id}-sv`) }),
        stat({ label: 'CPI', value: indexFromPpm(latest?.cpiPpm ?? null) }),
        stat({ label: 'SPI', value: indexFromPpm(latest?.spiPpm ?? null) }),
        stat({ label: 'TCPI', value: indexFromPpm(latest?.tcpiPpm ?? null), hint: 'withheld once the budget is spent' }),
        stat({ label: 'EAC at CPI', value: moneyCell(row.currency, latest?.eacAtCpiCents ?? null, `ev-case-${row.id}-eac-cpi`) }),
        stat({ label: 'EAC at plan', value: moneyCell(row.currency, latest?.eacAtPlanCents ?? null, `ev-case-${row.id}-eac-plan`) }),
        stat({ label: 'EAC at CPI×SPI', value: moneyCell(row.currency, latest?.eacAtCpiSpiCents ?? null, `ev-case-${row.id}-eac-cpispi`) }),
      ),
      latestReadingBlock(report, row),
      (row.packages?.length
        ? ledgerTable(
            ['Code', 'Package', 'Budget', 'Finish', 'Line split'],
            row.packages.map((pkg) => [
              h('span', { class: 'mono small' }, pkg.code),
              pkg.name,
              moneyCell(row.currency, pkg.plannedCents, `ev-pkg-${pkg.id}-bac`),
              pkg.plannedFinish,
              pkg.lineShares?.length
                ? pkg.lineShares.map((share) => `${share.lineKey} ${share.pct}%`).join(' · ')
                : h('span', { class: 'muted' }, 'no split declared'),
            ]),
            { testid: `ev-case-${row.id}-packages` },
          )
        : emptyState({ title: 'No live package', body: 'Nothing to measure. Baseline the work packages and their increments.' })),
      (row.actuals?.length
        ? ledgerTable(
            ['Date', 'Amount', 'Where', ''],
            row.actuals.slice(0, 10).map((actual) => [
              actual.date,
              moneyCell(row.currency, actual.amountCents, `ev-actual-${actual.id}-amount`),
              actual.unallocated ? h('span', { class: 'muted' }, 'unallocated') : 'a package',
              caps.canRecord ? button('Withdraw', () => reasonDialog(ctx, {
                title: 'Withdraw an actual',
                label: 'Why is this actual withdrawn?',
                note: 'A withdrawn actual stays on the record and leaves every figure. The reader counts the exclusion.',
                action: (reason) => ctx.api.earnedValueWithdrawActual({ caseId: row.id, actualId: actual.id, reason }),
                onDone,
              }), { testid: `ev-withdraw-actual-${actual.id}` }) : null,
            ]),
            { testid: `ev-case-${row.id}-actuals` },
          )
        : null),
    ),
  });
}

function casesView(ctx, report, caps, onDone) {
  const rows = report.rows.filter((row) => row.status !== 'withdrawn');
  const withdrawn = report.rows.filter((row) => row.status === 'withdrawn');
  if (!rows.length && !withdrawn.length) return summaryCard(report);
  return h('div', { class: 'stack' },
    rows.map((row) => caseCard(ctx, report, row, caps, onDone)),
    withdrawn.length
      ? card({
          title: `Withdrawn cases — ${withdrawn.length}`,
          body: h('div', { class: 'stack' },
            banner({ tone: 'info', title: 'Kept, out of every roll-up', body: 'A withdrawn case is not deleted and not counted in any total. The reason each one left the register is on its row.' }),
            ledgerTable(['Case', 'Withdrawn on', 'Reason'], withdrawn.map((row) => [
              row.label,
              row.withdrawnOn || '—',
              row.withdrawnReason || '—',
            ]), { testid: 'ev-withdrawn-cases' })),
        })
      : null,
  );
}

function linesView(report) {
  const rows = report.lines || [];
  const refused = report.counts.lineSplitRefused || 0;
  return h('div', { class: 'stack' },
    banner({
      tone: refused ? 'warn' : 'info',
      title: refused ? `${refused} case(s) print no line attribution` : 'Every printed line re-adds to its case',
      body: 'Per-line money is published only when every live package carries a split summing to exactly 100, apportioned largest-remainder so lines re-add to the case to the cent. A case that fails the test prints NOTHING per line and names itself in the refusal count — an estimated split is a fabricated allocation.',
    }),
    rows.length
      ? ledgerTable(
          ['Currency', 'Line', 'Cases', 'BAC', 'PV', 'EV', 'AC'],
          rows.map((row) => [
            row.currency,
            row.lineLabel,
            String(row.casesN),
            moneyCell(row.currency, row.bacCents, `ev-line-${row.lineKey}-bac`),
            moneyCell(row.currency, row.pvCents, `ev-line-${row.lineKey}-pv`),
            moneyCell(row.currency, row.evCents, `ev-line-${row.lineKey}-ev`),
            moneyCell(row.currency, row.acCents, `ev-line-${row.lineKey}-ac`),
          ]),
          { testid: 'ev-lines' },
        )
      : emptyState({ title: 'No line attribution on the record', body: 'Either no case has a full split declared, or there is nothing measured yet. Nothing is ever estimated.' }),
  );
}

function methodView() {
  return h('div', { class: 'stack' },
    card({
      title: 'What this register is',
      body: h('div', { class: 'stack' },
        Object.entries(EV_METHOD).map(([key, text]) => h('div', null,
          h('h4', { class: 'small' }, key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())),
          h('p', { class: 'muted small' }, text))),
      ),
    }),
    card({
      title: 'The frameworks applied, named',
      body: ledgerTable(['Framework', 'What it does here'], EV_FRAMEWORKS.map((row) => [row.label, row.says]), { testid: 'ev-frameworks' }),
    }),
    card({
      title: 'The method illustration',
      body: h('div', { class: 'stack' },
        h('img', { src: DIAGRAM_URL, alt: 'Method illustration: the baselined increments, the earned share, the CPI and SPI indices, the three assumptions behind an estimate at completion, and the two printed identities re-added from integer cents.', class: 'diagram', loading: 'lazy' }),
        h('p', { class: 'muted small' }, 'Generated method illustration, produced for this register; the provenance is recorded in the ADR and the delivery notes. It is a diagram of the method, not a screenshot of data.')),
    }),
    card({
      title: 'What it refuses, by name',
      body: h('div', { class: 'stack' },
        h('p', { class: 'muted small' }, `${EV_REFUSALS.length} named refusals, each with its own sentence. A generic "invalid" would hide which control fired.`),
        ledgerTable(['Refusal', 'What it prevents'], EV_REFUSALS.map((row) => [h('span', { class: 'mono small' }, row.key), row.says]), { testid: 'ev-refusals' })),
    }),
    card({
      title: 'What this workspace cannot do',
      body: h('p', { class: 'muted small' },
        'It does not value the programme’s benefits (that is the investment case), compute a present value, annualise a period, convert a currency, or decide whether the programme is worth funding. CPI and SPI are withheld when their denominators are zero; EAC is printed as three labelled assumptions and none of them is "the" answer. Seats are workflow declarations, not authentication: a right is a rendering and write contract enforced by the reader and the action, not a security boundary this browser can deliver. Where a case owner has left the roster, the register prints that and asks nobody.'),
    }),
  );
}

/* ------------------------------------------------------------------- render */

export function renderFinanceEarnedValuePanel(ctx, { tabs: sharedTabs = null } = {}) {
  const result = ctx.api.earnedValueReport();
  if (!result?.ok) {
    return h('div', { class: 'page' },
      sharedTabs,
      pageHeader({ eyebrow: 'Finance', title: 'Earned value', subtitle: 'Where the work actually is against the curve the budget will buy.' }),
      banner({ tone: 'bad', title: 'The register could not be read', body: result?.error || 'The seat refused the read.' }));
  }
  const report = result.report;
  const requested = ctx.query?.get?.('view');
  const view = EV_VIEWS.some((row) => row.key === requested) ? requested : 'cases';
  const caps = {
    canDeclare: typeof ctx.api.earnedValueDeclareCase === 'function',
    canRecord: typeof ctx.api.earnedValueRecordReading === 'function',
    canGovern: typeof ctx.api.earnedValueSetConventions === 'function',
  };
  const onDone = () => refresh(ctx);
  const candidates = typeof ctx.api.earnedValueCandidates === 'function' ? ctx.api.earnedValueCandidates() : null;
  const people = (candidates?.ok && candidates.people) ? candidates.people.map((person) => ({ value: person.id, label: `${person.name}${person.via ? ` — ${person.via}` : ''}` })) : [];
  const viewForDialogs = { ...report, people, asOf: report.asOf };

  const downloadCsv = () => {
    const rows = ctx.api.earnedValueCsvRows();
    if (!rows?.ok) { toast(rows?.error || 'The export was refused.', 'bad'); return; }
    const text = serializeCsv(EV_CSV_COLUMNS.map((key) => ({ key, header: key })), rows.rows);
    downloadText(`leados-earned-value-${report.asOf}.csv`, text);
    toast(`Exported ${rows.rows.length} aggregate row(s).`, 'good');
  };
  const openBrief = () => openModal({
    title: 'Earned value brief (identity-free)',
    body: h('pre', { class: 'pre-wrap small', 'data-testid': 'ev-brief' }, ctx.api.earnedValueBriefText()?.text || ''),
    actions: [{ label: 'Close', onClick: () => closeAllModals() }],
  });

  return h('div', { class: 'page', 'data-testid': 'earned-value-panel', 'data-as-of': report.asOf },
    sharedTabs,
    pageHeader({
      eyebrow: 'Finance',
      title: 'Earned value — the delivery curve',
      subtitle: 'A baseline of increments that re-add to budget to the cent, dated readings under the declared measure, and cost to the day. EV, CV, SV, CPI, SPI and three labelled estimates at completion — each refused with its reason when the record cannot support it, never printed as a zero.',
      actions: [
        button('Brief', openBrief, { testid: 'ev-brief-open' }),
        button('Download CSV', downloadCsv, { testid: 'ev-csv' }),
        caps.canDeclare ? button('Declare a case', () => caseDialog(ctx, viewForDialogs, onDone), { primary: true, testid: 'ev-declare-case-open' }) : null,
        caps.canGovern ? button('Conventions', () => conventionsDialog(ctx, report, onDone), { testid: 'ev-conventions-open' }) : null,
      ].filter(Boolean),
    }),
    report.figuresComplete
      ? null
      : banner({ tone: 'warn', title: 'Not every open case reads complete', body: 'A case with no live baseline, no live reading, a reading that does not name every live package, or a reading cut against a moved baseline is not complete. Every money total on this page is therefore withheld until the record is whole — counts and the BAC line still print.' }),
    banner({
      tone: report.reconciles ? 'info' : 'bad',
      title: report.reconciles ? 'The printed identities re-add' : 'The printed identities do not re-add',
      body: report.reconciles
        ? `Package EVs re-add to each case EV, allocated + unallocated re-adds to actual cost, and line rows re-add to the case where lines are printed — re-added from the printed integers on this screen (${report.asOf}). Where a figure is refused, the cell carries the reason instead of a zero.`
        : 'One of the printed identities failed. Every total on this page is therefore refused until the rows are corrected.',
    }),
    summaryCard(report),
    tabs({
      items: EV_VIEWS.map((row) => ({
        key: row.key,
        label: row.label,
        count: row.key === 'cases' ? report.rows.filter((entry) => entry.status !== 'withdrawn').length : undefined,
      })),
      active: view,
      ariaLabel: 'Earned-value views',
      onSelect: (key) => ctx.navigate(`${BASE_HREF}${BASE_HREF.includes('?') ? '&' : '?'}view=${key}`),
    }),
    view === 'cases' ? casesView(ctx, report, caps, onDone) : null,
    view === 'lines' ? linesView(report) : null,
    view === 'method' ? methodView() : null,
  );
}

export default renderFinanceEarnedValuePanel;
