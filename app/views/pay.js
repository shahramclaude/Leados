/**
 * app/views/pay.js — the Pay Architecture & Equity Terminal (`#/pay`, Schema v51).
 *
 * Three questions, in the order a compensation committee actually asks them:
 *
 *   1. ARCHITECTURE — where does each person sit in their range, and which
 *      placements are defects rather than decisions?
 *   2. EQUITY — once the recorded controls are taken into account, what
 *      difference remains, how precise is the estimate, and which categories
 *      cross the assessment threshold?
 *   3. FORWARD — does the merit matrix we are about to run preserve or widen
 *      that difference?
 *
 * The page never prints a number without the thing it is conditional on: an
 * adjusted gap without its control set, a grade without its coverage, a
 * projection without its assumption. Where the data cannot support a model, it
 * says so and names what is missing.
 */

import { h, toast, confirmDialog, openModal } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, table, emptyState, kv, tabs } from '../ui/components.js';
import { progressBar } from '../ui/charts.js';
import { downloadText } from '../ui/download.js';
import { formatDate } from '../core/time.js';
import {
  DEFAULT_MERIT_MATRIX,
  EUR_DIRECTIVE_JPA_GAP_PCT,
  PAY_CONTRAST_GROUPS,
  PAY_GROUP_BY_ID,
  PAY_GROUPS,
  PAY_REASONS,
  PAY_GROUP_IDS,
  exampleGapAudit,
  payArchitecture,
  payGapAudit,
  payPortfolio,
  positionFactor,
  remediationOptions,
  simulateMeritRound,
  totalTargetPay,
} from '../core/domain/pay.js';
import { LEVELS, LEVEL_LABELS, REVIEW_RATING_LABELS } from '../core/schema.js';
import { resolveLinkedEntity, linksForEntity } from '../core/domain/cases.js';

const TONE_BY_GRADE = { 'in-band': 'good', 'below-min': 'bad', 'above-max': 'warn', unbanded: 'warn', 'invalid-band': 'bad' };
const STATUS_LABEL = {
  'in-band': 'In range',
  'below-min': 'Below minimum',
  'above-max': 'Red-circled',
  unbanded: 'No band',
  'invalid-band': 'Band invalid',
};

function money(value, currency = '') {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const text = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
  return currency ? `${text} ${currency}` : text;
}

function pctText(value, places = 1) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  return `${n > 0 ? '+' : ''}${Math.round(n * 10 ** places) / 10 ** places}%`;
}

function short(text, n = 90) {
  const value = String(text || '').trim();
  return value.length > n ? `${value.slice(0, n - 1)}…` : value;
}

function groupLabel(id) {
  return PAY_GROUP_BY_ID[id]?.label || 'Not recorded';
}

/* --------------------------------------------------------------- dialogs */

function openBandDialog(ctx, existing = null) {
  const active = (ctx.state.people || []).filter((person) => person.status !== 'archived' && person.payFamilyHint);
  const families = [...new Set((ctx.state.payAssignments || []).map((row) => row.family).filter(Boolean))].sort();
  const family = h('input', { id: 'pay-band-family', type: 'text', maxlength: '80', value: existing?.family || families[0] || '', required: 'required', list: 'pay-family-list' });
  const level = h('select', { id: 'pay-band-level' },
    ...LEVELS.map((key) => h('option', { value: key, ...(existing?.level === key ? { selected: 'selected' } : {}) }, LEVEL_LABELS[key])));
  const currency = h('input', { id: 'pay-band-currency', type: 'text', maxlength: '3', value: existing?.currency || 'USD' });
  const min = h('input', { id: 'pay-band-min', type: 'number', min: '1', step: '100', value: existing?.min ?? '' });
  const mid = h('input', { id: 'pay-band-mid', type: 'number', min: '1', step: '100', value: existing?.mid ?? '' });
  const max = h('input', { id: 'pay-band-max', type: 'number', min: '1', step: '100', value: existing?.max ?? '' });
  const effectiveFrom = h('input', { id: 'pay-band-from', type: 'date', value: existing?.effectiveFrom || ctx.today });
  const note = h('textarea', { id: 'pay-band-note', rows: '2', maxlength: '600' });
  void active;

  const dialog = openModal({
    title: 'Declare a pay band',
    description: 'A band is a range with a minimum, a midpoint and a maximum. Every placement figure on this page is read against it, so the range has to be real: minimum below midpoint, midpoint at or below maximum.',
    body: h('div', { class: 'view-stack' },
      h('datalist', { id: 'pay-family-list' }, ...families.map((name) => h('option', { value: name }))),
      h('div', { class: 'form-grid' },
        h('div', { class: 'stack-xs' }, h('label', { for: 'pay-band-family' }, 'Role family'), family),
        h('div', { class: 'stack-xs' }, h('label', { for: 'pay-band-level' }, 'Level'), level),
        h('div', { class: 'stack-xs' }, h('label', { for: 'pay-band-currency' }, 'Currency (ISO)'), currency),
        h('div', { class: 'stack-xs' }, h('label', { for: 'pay-band-from' }, 'Effective from'), effectiveFrom),
        h('div', { class: 'stack-xs' }, h('label', { for: 'pay-band-min' }, 'Minimum'), min),
        h('div', { class: 'stack-xs' }, h('label', { for: 'pay-band-mid' }, 'Midpoint'), mid),
        h('div', { class: 'stack-xs' }, h('label', { for: 'pay-band-max' }, 'Maximum'), max)),
      h('p', { class: 'muted small' }, 'Re-declaring the same family, level and currency on a later date is how a band moves. The earlier band is kept, so a past placement stays explicable.'),
      h('div', { class: 'stack-xs' }, h('label', { for: 'pay-band-note' }, 'Note (optional)'), note)),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const res = ctx.api.addPayBand({
            family: family.value,
            level: level.value,
            currency: currency.value,
            min: min.value,
            mid: mid.value,
            max: max.value,
            effectiveFrom: effectiveFrom.value,
            note: note.value,
          });
          if (!res.ok) return toast(res.error, 'bad');
          dialog.close();
          toast('Band declared.', 'good');
          ctx.refresh();
          return null;
        },
      }, 'Declare band'),
    ],
  });
}

function openAssignmentDialog(ctx) {
  const active = (ctx.state.people || []).filter((person) => person.status !== 'archived');
  if (!active.length) return toast('Add people to the roster before recording pay.', 'warn');
  const families = [...new Set((ctx.state.payBands || []).map((row) => row.family).filter(Boolean))].sort();
  const person = h('select', { id: 'pay-person' }, ...active.map((row) => h('option', { value: row.id }, row.name)));
  const familyInput = h('input', { id: 'pay-family', type: 'text', maxlength: '80', list: 'pay-family-list-2', value: families[0] || '' });
  const level = h('select', { id: 'pay-level' }, ...LEVELS.map((key) => h('option', { value: key }, LEVEL_LABELS[key])));
  const currency = h('input', { id: 'pay-currency', type: 'text', maxlength: '3', value: 'USD' });
  const base = h('input', { id: 'pay-base', type: 'number', min: '1', step: '100' });
  const variable = h('input', { id: 'pay-variable', type: 'number', min: '0', max: '100', step: '0.5', placeholder: 'e.g. 10' });
  const effectiveFrom = h('input', { id: 'pay-from', type: 'date', value: ctx.today, max: ctx.today });
  const reason = h('select', { id: 'pay-reason' }, ...PAY_REASONS.map((row) => h('option', { value: row.id }, row.label)));
  const note = h('textarea', { id: 'pay-note', rows: '2', maxlength: '600' });

  const dialog = openModal({
    title: 'Record a pay rate',
    description: 'This is an append-only ledger. A new rate is a new record with its own effective date — it never edits the old one, because the old one is the evidence of what was paid and when.',
    body: h('div', { class: 'view-stack' },
      h('datalist', { id: 'pay-family-list-2' }, ...families.map((name) => h('option', { value: name }))),
      h('div', { class: 'form-grid' },
        h('div', { class: 'stack-xs' }, h('label', { for: 'pay-person' }, 'Person'), person),
        h('div', { class: 'stack-xs' }, h('label', { for: 'pay-family' }, 'Role family'), familyInput),
        h('div', { class: 'stack-xs' }, h('label', { for: 'pay-level' }, 'Level'), level),
        h('div', { class: 'stack-xs' }, h('label', { for: 'pay-currency' }, 'Currency (ISO)'), currency),
        h('div', { class: 'stack-xs' }, h('label', { for: 'pay-base' }, 'Annual base'), base),
        h('div', { class: 'stack-xs' }, h('label', { for: 'pay-variable' }, 'Variable target (%)'), variable),
        h('div', { class: 'stack-xs' }, h('label', { for: 'pay-from' }, 'Effective from'), effectiveFrom),
        h('div', { class: 'stack-xs' }, h('label', { for: 'pay-reason' }, 'Why'), reason)),
      h('p', { class: 'muted small' }, 'Total target pay is computed as base × (1 + variable target). Recording a rate does not change anyone else’s pay, and the pay rules only ever open work — they never adjust a number.'),
      h('div', { class: 'stack-xs' }, h('label', { for: 'pay-note' }, 'Note (optional)'), note)),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const res = ctx.api.addPayAssignment({
            personId: person.value,
            family: familyInput.value,
            level: level.value,
            currency: currency.value,
            base: base.value,
            variableTargetPct: variable.value,
            effectiveFrom: effectiveFrom.value,
            reason: reason.value,
            note: note.value,
          });
          if (!res.ok) return toast(res.error, 'bad');
          dialog.close();
          toast('Pay rate recorded.', 'good');
          ctx.refresh();
          return null;
        },
      }, 'Record rate'),
    ],
  });
}

function openAuditDialog(ctx) {
  const currencies = payPortfolio(ctx.state, ctx.now).architecture.currencies;
  if (!currencies.length) return toast('Record pay before filing an audit — there is nothing to compare yet.', 'warn');
  const label = h('input', { id: 'pay-audit-label', type: 'text', maxlength: '120', value: `Pay equity review ${ctx.today}` });
  const currency = h('select', { id: 'pay-audit-currency' }, ...currencies.map((code) => h('option', { value: code }, code)));
  const groupA = h('select', { id: 'pay-audit-a' }, ...PAY_CONTRAST_GROUPS.map((id) => h('option', { value: id, ...(id === 'woman' ? { selected: 'selected' } : {}) }, groupLabel(id))));
  const groupB = h('select', { id: 'pay-audit-b' }, ...PAY_CONTRAST_GROUPS.map((id) => h('option', { value: id, ...(id === 'man' ? { selected: 'selected' } : {}) }, groupLabel(id))));
  const cLevel = h('input', { id: 'pay-ctl-level', type: 'checkbox', checked: 'checked' });
  const cFamily = h('input', { id: 'pay-ctl-family', type: 'checkbox', checked: 'checked' });
  const cTenure = h('input', { id: 'pay-ctl-tenure', type: 'checkbox', checked: 'checked' });
  const note = h('textarea', { id: 'pay-audit-note', rows: '2', maxlength: '600' });

  const dialog = openModal({
    title: 'File a pay equity audit',
    description: 'Filing freezes the model as it stands today. Later corrections will not rewrite it: the filed snapshot is the record of what was assessed and decided on this date.',
    body: h('div', { class: 'view-stack' },
      h('div', { class: 'form-grid' },
        h('div', { class: 'stack-xs' }, h('label', { for: 'pay-audit-label' }, 'Label'), label),
        h('div', { class: 'stack-xs' }, h('label', { for: 'pay-audit-currency' }, 'Currency cohort'), currency),
        h('div', { class: 'stack-xs' }, h('label', { for: 'pay-audit-a' }, 'Group A'), groupA),
        h('div', { class: 'stack-xs' }, h('label', { for: 'pay-audit-b' }, 'Group B'), groupB)),
      h('fieldset', { class: 'stack-xs' },
        h('legend', null, 'Controls in the adjusted model'),
        h('label', { class: 'check-row', for: 'pay-ctl-level' }, cLevel, h('span', null, 'Job level')),
        h('label', { class: 'check-row', for: 'pay-ctl-family' }, cFamily, h('span', null, 'Role family')),
        h('label', { class: 'check-row', for: 'pay-ctl-tenure' }, cTenure, h('span', null, 'Tenure'))),
      h('p', { class: 'muted small' }, 'At least one control is required. A raw mean difference across different job titles is not a pay-equity finding, it is a resumé of who works where.'),
      h('div', { class: 'stack-xs' }, h('label', { for: 'pay-audit-note' }, 'Note (optional)'), note)),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const res = ctx.api.filePayAudit({
            label: label.value,
            currency: currency.value,
            groupA: groupA.value,
            groupB: groupB.value,
            controls: { level: cLevel.checked, family: cFamily.checked, tenure: cTenure.checked },
            note: note.value,
          });
          if (!res.ok) return toast(res.error, 'bad');
          dialog.close();
          toast('Audit filed.', 'good');
          ctx.refresh();
          return null;
        },
      }, 'File audit'),
    ],
  });
}

function openMeritDialog(ctx) {
  const currencies = payPortfolio(ctx.state, ctx.now).architecture.currencies;
  const label = h('input', { id: 'merit-label', type: 'text', maxlength: '120', placeholder: 'e.g. 2027 annual cycle' });
  const currency = h('select', { id: 'merit-currency' }, ...(currencies.length ? currencies : ['USD']).map((code) => h('option', { value: code }, code)));
  const basePct = h('input', { id: 'merit-base', type: 'number', min: '0', max: '100', step: '0.5', value: String(ctx.state.settings?.payEnvelopePct ?? 3) });
  const envelope = h('input', { id: 'merit-envelope', type: 'number', min: '0', max: '100', step: '0.5', value: String(ctx.state.settings?.payEnvelopePct ?? 3) });
  const ranges = {};
  const inputs = {};
  for (const [key, value] of Object.entries(DEFAULT_MERIT_MATRIX)) {
    const input = h('input', { type: 'number', min: '0', max: '3', step: '0.05', value: String(value), id: `merit-m-${key || 'none'}` });
    inputs[key] = input;
    ranges[key] = h('div', { class: 'stack-xs' },
      h('label', { for: `merit-m-${key || 'none'}` }, key ? REVIEW_RATING_LABELS[key] : 'No rating on record'),
      input);
  }

  const dialog = openModal({
    title: 'Declare a merit round',
    description: 'The multiplier is applied to the base percentage. Position in range then scales it: people below midpoint receive a larger percentage on a smaller base, which is why a fair-looking matrix can preserve a gap.',
    body: h('div', { class: 'view-stack' },
      h('div', { class: 'form-grid' },
        h('div', { class: 'stack-xs' }, h('label', { for: 'merit-label' }, 'Round name'), label),
        h('div', { class: 'stack-xs' }, h('label', { for: 'merit-currency' }, 'Currency cohort'), currency),
        h('div', { class: 'stack-xs' }, h('label', { for: 'merit-base' }, 'Matrix base (%)'), basePct),
        h('div', { class: 'stack-xs' }, h('label', { for: 'merit-envelope' }, 'Envelope (% of payroll)'), envelope)),
      h('div', { class: 'form-grid' }, ...Object.values(ranges)),
      h('p', { class: 'muted small' }, 'With an envelope, the allocation is scaled down proportionally if the matrix would exceed it. Nothing is written to anyone’s pay: committing a round records the decision and freezes the projection.')),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const matrix = {};
          for (const [key, input] of Object.entries(inputs)) matrix[key] = input.value;
          const res = ctx.api.declareMeritRound({
            label: label.value,
            currency: currency.value,
            basePct: basePct.value,
            envelopePct: envelope.value,
            matrix,
          });
          if (!res.ok) return toast(res.error, 'bad');
          dialog.close();
          toast('Merit round declared.', 'good');
          ctx.refresh();
          return null;
        },
      }, 'Declare round'),
    ],
  });
}

/* ---------------------------------------------------------------- sections */

function architectureSection(ctx, report) {
  const arch = report.architecture;
  if (!arch.counts.paid) {
    return card({
      title: 'No pay recorded yet',
      body: emptyState({
        title: 'Declare a band, then record what people are paid',
        body: 'LeadOS holds pay locally in this browser. Nothing leaves the workspace, and no figure is ever benchmarked against an external market source it cannot cite.',
        action: h('div', { class: 'row-actions' },
          h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openBandDialog(ctx) }, 'Declare a band'),
          h('button', { class: 'btn btn-secondary', type: 'button', onClick: () => openAssignmentDialog(ctx) }, 'Record a pay rate')),
      }),
    });
  }

  const currencyBlocks = Object.entries(arch.byCurrency).map(([currency, bucket]) => card({
    title: `${currency} architecture`,
    subtitle: 'Pay is never converted between currencies, so every figure below is inside one currency cohort.',
    className: 'card-tight',
    body: h('div', { class: 'stat-grid' },
      stat({ label: 'Paid people', value: String(bucket.headcount), hint: `${bucket.banded} placed in a band` }),
      stat({ label: 'Payroll (total target)', value: money(bucket.payroll, currency), hint: 'Base × (1 + variable target)' }),
      stat({ label: 'Median compa-ratio', value: bucket.medianCompa === null ? '—' : bucket.medianCompa.toFixed(3), hint: '1.000 is exactly at midpoint', tone: bucket.medianCompa !== null && bucket.medianCompa < 0.95 ? 'warn' : '' }),
      stat({ label: 'Cost to move all to midpoint', value: money(bucket.costToMidpoint, currency), hint: 'Only people below midpoint contribute', tone: bucket.belowMin ? 'bad' : '' }),
      stat({ label: 'Below minimum', value: String(bucket.belowMin), hint: 'A structural defect unless documented as an exception', tone: bucket.belowMin ? 'bad' : '' }),
      stat({ label: 'Red-circled', value: String(bucket.aboveMax), hint: 'Legitimate after a market move; corrosive undocumented', tone: bucket.aboveMax ? 'warn' : '' })),
  }));

  const rows = arch.rows.map((row) => ({
    className: row.placement && ['below-min', 'invalid-band'].includes(row.placement.status) ? 'row-bad' : '',
    attrs: {},
    row,
  }));

  const placementTable = card({
    title: 'Placement by person',
    subtitle: 'Every active person is listed, including those with no pay record — a missing record is a coverage gap, not a zero.',
    actions: [
      h('button', { class: 'btn btn-small btn-secondary', type: 'button', onClick: () => openAssignmentDialog(ctx) }, 'Record rate'),
      h('button', { class: 'btn btn-small btn-secondary', type: 'button', onClick: () => openBandDialog(ctx) }, 'Declare band'),
      h('button', {
        class: 'btn btn-small btn-ghost',
        type: 'button',
        onClick: () => {
          const res = ctx.api.scanPay();
          if (!res.ok) return toast(res.error, 'bad');
          toast(res.changed ? 'Scan opened new work — check Decisions and Delegation.' : 'Scan complete: nothing new to open.', res.changed ? 'good' : 'neutral');
          ctx.refresh();
          return null;
        },
      }, 'Scan for defects'),
    ],
    body: table({
      caption: 'Pay placement by person',
      columns: [
        { label: 'Person', render: ({ row }) => h('div', { class: 'stack-xxs' }, h('strong', null, row.person.name), h('span', { class: 'muted small' }, `${row.family || 'no family'} · ${row.level ? LEVEL_LABELS[row.level] || row.level : 'no level'}`)) },
        { label: 'Total target', render: ({ row }) => (row.placement ? money(row.placement.pay, row.currency) : '—') },
        { label: 'Compa-ratio', render: ({ row }) => (row.placement?.compaRatio !== null && row.placement?.compaRatio !== undefined ? row.placement.compaRatio.toFixed(3) : '—') },
        { label: 'In range', render: ({ row }) => (row.placement?.rangePenetration !== null && row.placement?.rangePenetration !== undefined
          ? progressBar(Math.max(0, Math.min(100, row.placement.rangePenetration * 100)), { tone: TONE_BY_GRADE[row.placement.status] || null, label: 'Range penetration', thin: true })
          : '—') },
        { label: 'Status', render: ({ row }) => (row.placement
          ? badge(STATUS_LABEL[row.placement.status] || row.placement.status, TONE_BY_GRADE[row.placement.status] || 'neutral', row.placement.reason)
          : badge('No pay record', 'neutral')) },
        { label: 'Group', render: ({ row }) => (row.group === 'unrecorded' ? badge('Not recorded', 'warn') : h('span', { class: 'muted small' }, groupLabel(row.group))) },
        { label: 'Current since', render: ({ row }) => (row.assignment
          ? h('span', { class: row.stale ? 'text-warn' : 'muted small' }, `${formatDate(row.assignment.effectiveFrom)}${row.stale ? ' · stale' : ''}`)
          : '—') },
      ],
      rows,
      emptyMessage: 'No people on the roster yet.',
    }),
  });

  const defects = card({
    title: 'What the architecture says',
    body: h('div', { class: 'view-stack' },
      arch.counts.belowMin
        ? banner({
            tone: 'bad',
            title: `${arch.counts.belowMin} person(s) are paid below the band minimum`,
            body: 'Below-minimum pay is normally a missed correction, not a decision. If it is deliberate, it needs a written reason and a review date; otherwise it compounds every year it is left alone. “Scan for defects” opens one owned task per person — it never changes a number.',
          })
        : null,
      arch.counts.aboveMax
        ? banner({
            tone: 'warn',
            title: `${arch.counts.aboveMax} person(s) are red-circled`,
            body: 'Above-maximum pay is legitimate after a market move or a level correction, and corrosive when undocumented: every future increase then compounds a number nobody has defended. A scan opens one decision per person.',
          })
        : null,
      arch.bandGaps.length
        ? banner({
            tone: 'warn',
            title: `${arch.bandGaps.length} staffed family/level combination(s) have no band`,
            body: h('ul', { class: 'list-plain' }, ...arch.bandGaps.slice(0, 6).map((gap) => h('li', null, `${gap.family} · ${LEVEL_LABELS[gap.level] || gap.level} — ${gap.headcount} person(s) cannot be placed`))),
          })
        : null,
      !arch.counts.belowMin && !arch.counts.aboveMax && !arch.bandGaps.length
        ? banner({ tone: 'good', title: 'Every placement is inside a declared range', body: 'That is the happy path, and it is worth knowing it is real rather than assumed: it is derived from the dated records, not from a status field.' })
        : null,
      arch.counts.unbanded
        ? banner({ tone: 'warn', title: `${arch.counts.unbanded} paid person(s) cannot be placed`, body: 'A band is looked up by role family, level and currency. Where one of those is missing or has no band, the placement is reported as unbanded rather than guessed.' })
        : null),
  });

  const bandTable = card({
    title: 'Declared bands',
    subtitle: 'The latest band per family, level and currency is the one in force. Earlier bands are kept so a past placement stays explicable.',
    body: table({
      caption: 'Declared pay bands',
      columns: [
        { label: 'Family', render: ({ row }) => row.family },
        { label: 'Level', render: ({ row }) => LEVEL_LABELS[row.level] || row.level },
        { label: 'Currency', render: ({ row }) => row.currency },
        { label: 'Minimum', render: ({ row }) => money(row.min, row.currency) },
        { label: 'Midpoint', render: ({ row }) => money(row.mid, row.currency) },
        { label: 'Maximum', render: ({ row }) => money(row.max, row.currency) },
        { label: 'Effective', render: ({ row }) => formatDate(row.effectiveFrom) },
        { label: 'Actions', className: 'sr-only', render: ({ row }) => h('button', {
          class: 'btn btn-tiny btn-ghost',
          type: 'button',
          'aria-label': `Delete band ${row.family} ${row.level}`,
          onClick: () => {
            const res = ctx.api.deletePayBand(row.id);
            if (!res.ok) return toast(res.error, 'bad');
            toast('Band deleted.', 'good');
            ctx.refresh();
            return null;
          },
        }, 'Delete') },
      ],
      rows: [...(ctx.state.payBands || [])]
        .sort((a, b) => (a.family + a.level < b.family + b.level ? -1 : 1))
        .map((row) => ({ row })),
      emptyMessage: 'No band has been declared yet.',
    }),
  });

  return h('div', { class: 'view-stack' }, ...currencyBlocks, placementTable, defects, bandTable);
}

function quartileCard(audit) {
  if (!audit?.quartiles?.length) return null;
  return card({
    title: 'Distribution by pay quartile',
    subtitle: `Share of each group in each quarter of the pay distribution. This is the transparency metric most reporting regimes ask for, and it is the one a headline gap hides: two groups can have similar means and very different distributions.`,
    body: h('div', { class: 'view-stack' },
      ...audit.quartiles.map((row) => h('div', { class: 'stack-xxs' },
        h('div', { class: 'row-between' },
          h('span', { class: 'muted small' }, `${row.label || `Q${row.quartile}`} · ${row.headcount} people`),
          h('span', { class: 'small' }, `${audit.groupALabel} ${row.shareAPct ?? '—'}% · ${audit.groupBLabel} ${row.shareBPct ?? '—'}%`)),
        progressBar(row.shareAPct, { tone: row.shareAPct > row.shareBPct + 15 ? 'good' : null, label: `${audit.groupALabel} share in quartile ${row.quartile}`, thin: true })))),
  });
}

function auditDetailCard(ctx, audit, source) {
  const snap = audit.snapshot || audit;
  const synthetic = source === 'example';
  if (snap.status !== 'ok') {
    return card({
      title: synthetic ? 'Worked example — cohort not modellable' : 'The filed cohort could not be modelled',
      body: h('div', { class: 'view-stack' },
        banner({ tone: 'warn', title: 'No gap is published', body: snap.reason || 'The cohort did not meet the minimum for a modelled comparison.' }),
        h('p', { class: 'muted small' }, 'This is the correct outcome, not a failure: a point estimate from a cohort this small would be wider than any difference it could detect, and would describe individuals. Record more comparable pay, or compare across a currency cohort with enough people.')),
    });
  }

  const ci = snap.adjustedCiPct;
  const tone = snap.significant ? 'bad' : 'neutral';
  return card({
    title: synthetic ? 'Worked example — synthetic cohort' : `${snap.groupALabel} vs ${snap.groupBLabel} (${snap.currency})`,
    subtitle: synthetic
      ? 'A generated 28-person cohort with a deliberately planted structural effect, shown so the model can be judged before it is trusted with real pay. It is not your data and it never enters a filed audit.'
      : `Filed ${audit.filedOn ? formatDate(audit.filedOn) : ''} · frozen snapshot. Later corrections do not rewrite it.`,
    body: h('div', { class: 'view-stack' },
      h('div', { class: 'stat-grid' },
        stat({ label: 'Raw difference', value: pctText(snap.rawGapPct), hint: 'Unadjusted mean difference in log pay', tone: 'neutral' }),
        stat({ label: 'Adjusted difference', value: pctText(snap.adjustedGapPct), hint: `Controlling for ${snap.controlLabels?.join(', ') || 'nothing'}`, tone }),
        stat({ label: '95% interval', value: ci ? `${pctText(ci.low)} to ${pctText(ci.high)}` : '—', hint: snap.significant ? 'Excludes zero' : 'Includes zero — consistent with no difference', tone }),
        stat({ label: 'Comparable people', value: String(snap.n), hint: `${snap.nA} vs ${snap.nB} · ${snap.df} residual df` }),
        stat({ label: 'R²', value: snap.r2 === null || snap.r2 === undefined ? '—' : String(snap.r2), hint: 'How much of the pay variation the controls explain' }),
        stat({ label: 'p-value', value: snap.pValue === null || snap.pValue === undefined ? '—' : String(snap.pValue), hint: 'Two-sided, Student t' })),
      ci
        ? h('div', { class: 'stack-xxs' },
            h('span', { class: 'muted small' }, `Adjusted difference with its 95% interval (percent)`),
            h('div', { class: 'ci-strip' },
              h('span', { class: 'ci-label' }, `${pctText(ci.low)}`),
              progressBar(Math.max(0, Math.min(100, ((snap.adjustedGapPct - ci.low) / Math.max(0.001, ci.high - ci.low)) * 100)), { tone: tone === 'bad' ? 'bad' : 'warn', label: 'Point estimate within interval', thin: true }),
              h('span', { class: 'ci-label' }, `${pctText(ci.high)}`)))
        : null,
      snap.droppedBecause ? banner({ tone: 'warn', title: 'The requested controls could not all be used', body: snap.droppedBecause }) : null,
      banner({
        tone: 'info',
        title: 'What the adjusted number is, and is not',
        body: h('ul', { class: 'list-plain' },
          h('li', null, 'It is the difference these controls do not explain. It is not a finding of discrimination, a legal opinion, or a job evaluation.'),
          h('li', null, 'Omitted variables — prior pay, negotiation, scarce-skill premia, location, performance — can move it in either direction.'),
          h('li', null, 'The interval covers sampling noise in this cohort only. It is not a population inference, and it assumes the pay records are accurate.'),
          h('li', null, 'A joint pay assessment compares work of equal value. That requires a documented job-evaluation study; this screen records that one exists, it does not perform one.')),
      }),
      snap.flaggedCategories?.length
        ? h('div', { class: 'view-stack' },
            h('h3', { class: 'subhead' }, `Categories at or above the ${snap.triggerPct}% threshold`),
            table({
              caption: 'Categories at or above the assessment threshold',
              columns: [
                { label: 'Category (job level)', render: ({ row }) => row.label },
                { label: 'Difference', render: ({ row }) => badge(pctText(row.gapPct), 'bad') },
                { label: 'People', render: ({ row }) => `${row.nA} vs ${row.nB}` },
                { label: 'Basis', render: () => h('span', { class: 'muted small' }, 'Unadjusted within level') },
              ],
              rows: snap.flaggedCategories.map((row) => ({ row })),
              emptyMessage: '',
            }),
            h('p', { class: 'muted small' }, `A justified difference is fine. An unexplained one needs a documented, owned assessment with objective, gender-neutral criteria — and the criteria have to exist before the conclusion does. Filing this audit opens that decision and the owned work to prepare the criteria.`))
        : null,
      h('div', { class: 'row-actions' },
        h('button', {
          class: 'btn btn-secondary',
          type: 'button',
          onClick: () => {
            const lines = [
              `# ${synthetic ? 'Worked example' : audit.label || 'Pay equity audit'} — ${snap.currency}`,
              '',
              `${snap.groupALabel} vs ${snap.groupBLabel}. Raw difference ${pctText(snap.rawGapPct)}; adjusted ${pctText(snap.adjustedGapPct)} (95% interval ${ci ? `${pctText(ci.low)} to ${pctText(ci.high)}` : '—'}), controlling for ${snap.controlLabels?.join(', ') || 'nothing'}.`,
              `${snap.n} comparable people (${snap.nA} vs ${snap.nB}), ${snap.df} residual degrees of freedom, R² ${snap.r2 ?? '—'}.`,
              `Categories at or above ${snap.triggerPct}%: ${snap.flaggedCategories?.length ? snap.flaggedCategories.map((row) => `${row.label} (${pctText(row.gapPct)}, ${row.nA} vs ${row.nB})`).join('; ') : 'none'}.`,
              '',
              'The adjusted figure is the difference the recorded controls do not explain. It is not a finding of discrimination, a legal opinion, or a job evaluation, and omitted variables can move it either way.',
            ];
            downloadText(`${synthetic ? 'worked-example' : 'pay-equity-audit'}-${snap.currency || 'report'}.md`, lines.join('\n'));
            toast('Audit summary downloaded.', 'good');
          },
        }, 'Download summary'),
        h('span', { class: 'muted small' }, `Trigger threshold: ${snap.triggerPct}%${snap.triggerPct === EUR_DIRECTIVE_JPA_GAP_PCT ? ' (the Directive’s joint-assessment threshold)' : ' (a local convention, stricter or looser than the Directive’s 5%)'}.`))),
  });
}

function remediationCard(ctx, audit) {
  const plan = remediationOptions(ctx.state, audit, ctx.now);
  if (plan.status !== 'ok' || !plan.options.length) return null;
  return card({
    title: 'What would it cost to close it',
    subtitle: 'The price of three different designs, each re-fitted rather than assumed. This is not a remediation plan, an approved budget or a legal conclusion — it is the trade-off stated in numbers so it can be argued with.',
    body: h('div', { class: 'view-stack' },
      h('div', { class: 'stat-grid' },
        stat({ label: 'Current adjusted difference', value: pctText(plan.currentGapPct), hint: `${plan.currency} · threshold ${plan.triggerPct}%`, tone: 'bad' }),
        ...plan.options.slice(0, 2).map((option) => stat({
          label: option.label.length > 42 ? `${option.label.slice(0, 41)}…` : option.label,
          value: money(option.cost, option.currency),
          hint: option.estimable
            ? `Projects to ${pctText(option.projectedGapPct)}${option.meetsThreshold ? ' — below the threshold' : ' — still above the threshold'}`
            : option.reason,
          tone: option.meetsThreshold ? 'good' : 'warn',
        }))),
      table({
        caption: 'Remediation options and their projected difference',
        columns: [
          { label: 'Design', render: ({ row }) => h('div', { class: 'stack-xxs' }, h('strong', null, row.label), h('span', { class: 'muted small' }, row.note)) },
          { label: 'Annual cost', render: ({ row }) => money(row.cost, row.currency) },
          { label: 'Projected difference', render: ({ row }) => (row.estimable ? pctText(row.projectedGapPct) : '—') },
          { label: 'Below threshold', render: ({ row }) => (row.estimable
            ? badge(row.meetsThreshold ? 'Yes' : 'No', row.meetsThreshold ? 'good' : 'warn')
            : badge('Not estimable', 'neutral', row.reason)) },
        ],
        rows: plan.options.map((row) => ({ row })),
        emptyMessage: '',
      }),
      h('p', { class: 'muted small' }, plan.note)),
  });
}

function equitySection(ctx, report) {
  const preview = payGapAudit(ctx.state, {}, ctx.now);
  const filed = report.audits.filter((row) => row.status === 'filed').sort((a, b) => (String(a.filedOn) < String(b.filedOn) ? 1 : -1));
  const focusedId = ctx.query?.get?.('audit') || null;
  const focused = focusedId ? report.audits.find((row) => row.id === focusedId) : filed[0];
  const currencyCount = report.architecture.currencies.length;

  return h('div', { class: 'view-stack' },
    card({
      title: 'Live preview',
      subtitle: 'Computed now, from the current records. A preview is not an assessment: it is not filed, it is not frozen, and no rule fires from it.',
      actions: [
        h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => openAuditDialog(ctx) }, 'File an audit'),
      ],
      body: h('div', { class: 'view-stack' },
        preview.status === 'ok'
          ? h('div', { class: 'stack' },
              h('p', null, `${preview.groupALabel} vs ${preview.groupBLabel} in ${preview.currency}: raw difference ${pctText(preview.rawGapPct)}, adjusted ${pctText(preview.adjustedGapPct)} (95% interval ${preview.adjustedCiPct ? `${pctText(preview.adjustedCiPct.low)} to ${pctText(preview.adjustedCiPct.high)}` : '—'}) across ${preview.n} comparable people.`),
              h('p', { class: 'muted small' }, `Controls: ${preview.controlLabels?.join(', ') || 'none'} · ${preview.df} residual df · R² ${preview.r2 ?? '—'}.`),
              preview.requiresJointAssessment
                ? badge(`${preview.flaggedCategories.length} categor${preview.flaggedCategories.length === 1 ? 'y' : 'ies'} at or above ${preview.triggerPct}%`, 'bad')
                : badge('No category at or above the threshold', 'good'))
          : banner({ tone: 'warn', title: 'The live cohort cannot be modelled yet', body: preview.reason }),
        currencyCount > 1
          ? h('p', { class: 'muted small' }, `This workspace holds pay in ${currencyCount} currencies. File one audit per currency — a pooled gap across currencies would be a fabricated number.`)
          : null,
        h('p', { class: 'muted small' }, `Excluded from this cohort: ${preview.excluded.noPay} without pay, ${preview.excluded.otherCurrency} in another currency, ${preview.excluded.noGroup} with no recorded group, ${preview.excluded.undisclosed} recorded as not to be analysed, ${preview.excluded.otherGroup} in another group. Every exclusion is counted so the denominator can never shrink silently.`)),
    }),
    focused
      ? auditDetailCard(ctx, focused, 'filed')
      : emptyState({ title: 'No audit has been filed', body: 'Filing freezes the model and, where a category crosses the threshold, opens the joint-assessment decision and the owned criteria work in the same transaction.' }),
    focused && focused.snapshot?.status === 'ok' ? quartileCard(focused.snapshot) : null,
    focused && focused.snapshot?.status === 'ok' ? remediationCard(ctx, focused.snapshot) : null,
    card({
      title: 'Worked example — how the model behaves',
      subtitle: 'The honest answer on a five-person roster is “this cannot be modelled”. So the model is demonstrated on a generated cohort with a planted structural effect, and the difference between the naive and adjusted number is visible before anything real is filed.',
      body: (() => {
        const example = exampleGapAudit();
        return h('div', { class: 'view-stack' },
          example.status === 'ok'
            ? h('div', { class: 'stack' },
                h('div', { class: 'stat-grid' },
                  stat({ label: 'Naive (raw) difference', value: pctText(example.rawGapPct), hint: 'What a spreadsheet pivot would report', tone: 'warn' }),
                  stat({ label: 'Adjusted difference', value: pctText(example.adjustedGapPct), hint: `Controlling for ${example.controlLabels?.join(', ')}`, tone: 'bad' }),
                  stat({ label: '95% interval', value: example.adjustedCiPct ? `${pctText(example.adjustedCiPct.low)} to ${pctText(example.adjustedCiPct.high)}` : '—', hint: `${example.df} residual df` }),
                  stat({ label: 'Quartile 1 share', value: `${example.quartiles[0]?.shareAPct ?? '—'}% / ${example.quartiles[0]?.shareBPct ?? '—'}%`, hint: `${example.groupALabel} / ${example.groupBLabel} in the lowest pay quarter` })),
                h('p', { class: 'muted small' }, `The naive figure and the adjusted figure differ because the groups are not distributed identically across levels, families and tenure. Reporting only the first is the most common error in this analysis; reporting only the second without its interval is the second most common.`))
            : banner({ tone: 'warn', title: 'The worked example could not be generated', body: example.reason || 'Unknown failure.' }),
          h('button', { class: 'btn btn-small btn-secondary', type: 'button', onClick: () => auditDetailCard(ctx, example, 'example') && openModal({ title: 'Worked example detail', body: auditDetailCard(ctx, example, 'example'), footer: [h('button', { class: 'btn btn-primary', type: 'button', onClick: () => document.querySelectorAll('.modal-backdrop').forEach((n) => n.remove()) }, 'Close')] }) }, 'Show the full worked example'));
      })(),
    }),
    filed.length
      ? card({
          title: 'Filed audits',
          subtitle: 'A filed audit is the record of an assessment that happened. It cannot be deleted, and later corrections do not rewrite it.',
          body: table({
            caption: 'Filed pay equity audits',
            columns: [
              { label: 'Filed', render: ({ row }) => formatDate(row.filedOn) },
              { label: 'Label', render: ({ row }) => row.label },
              { label: 'Currency', render: ({ row }) => row.currency || '—' },
              { label: 'Adjusted', render: ({ row }) => (row.snapshot?.status === 'ok' ? badge(pctText(row.snapshot.adjustedGapPct), row.snapshot.significant ? 'bad' : 'neutral') : badge('Not modellable', 'warn')) },
              { label: 'Flagged', render: ({ row }) => String(row.snapshot?.flaggedCategories?.length ?? 0) },
              { label: 'Linked work', render: ({ row }) => {
                const links = linksForEntity(ctx.state, 'payAudit', row.id);
                return links.length ? h('span', { class: 'muted small' }, links.map((link) => resolveLinkedEntity(ctx.state, link.targetType, link.targetId)?.title || link.relation).join(' · ')) : h('span', { class: 'muted small' }, '—');
              } },
            ],
            rows: filed.map((row) => ({ row })),
            emptyMessage: '',
          }),
        })
      : null);
}

function meritSection(ctx, report) {
  const focusedId = ctx.query?.get?.('round') || null;
  const rounds = [...report.rounds].sort((a, b) => (String(a.createdAt) < String(b.createdAt) ? 1 : -1));
  const focused = focusedId ? rounds.find((row) => row.id === focusedId) : rounds.find((row) => row.status === 'declared') || rounds[0] || null;

  if (!report.architecture.counts.paid) {
    return emptyState({ title: 'Record pay before simulating a merit round', body: 'A merit matrix distributes an envelope across people who already have a pay record and a band. Without both, there is nothing to project.' });
  }

  const projection = focused ? simulateMeritRound(ctx.state, focused, ctx.now) : null;
  const audit = report.latestFiled?.snapshot?.status === 'ok' ? report.latestFiled : null;
  const after = focused && audit
    ? (() => {
        try {
          const live = payGapAudit(ctx.state, {
            currency: audit.snapshot.currency,
            groupA: audit.snapshot.groupA,
            groupB: audit.snapshot.groupB,
          }, ctx.now);
          if (live.status !== 'ok') return { status: 'unavailable', reason: live.reason };
          return null;
        } catch {
          return { status: 'unavailable', reason: 'Projection unavailable.' };
        }
      })()
    : null;
  void after;

  return h('div', { class: 'view-stack' },
    card({
      title: 'Merit round simulator',
      subtitle: 'A matrix pays by rating and position in range. The people furthest below midpoint receive the largest percentage on the smallest base, which is how a fair-looking cycle preserves a gap indefinitely. This runs the projection before you commit.',
      actions: [h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => openMeritDialog(ctx) }, 'Declare a round')],
      body: rounds.length
        ? tabs({
            items: rounds.slice(0, 6).map((row) => ({ key: row.id, label: short(row.label, 34) })),
            active: focused?.id,
            onSelect: (key) => {
              window.location.hash = `#/pay?tab=merit&round=${encodeURIComponent(key)}`;
            },
            ariaLabel: 'Merit rounds',
          })
        : emptyState({ title: 'No merit round declared', body: 'Declaring one freezes the matrix, the envelope and the baseline so the projection can be compared with what actually happens.' }),
    }),
    projection && focused
      ? card({
          title: `${focused.label} — projection`,
          subtitle: `Declared ${formatDate(focused.createdAt)}${focused.status === 'committed' ? ` · committed ${formatDate(focused.committedOn)}` : ''}. A projection, not a promise: it assumes every proposed increase is enacted exactly as simulated.`,
          body: h('div', { class: 'view-stack' },
            h('div', { class: 'stat-grid' },
              stat({ label: 'People in scope', value: String(projection.headcount), hint: `${projection.noRating} have no completed review rating` }),
              stat({ label: 'Payroll', value: money(projection.payroll, projection.currency) }),
              stat({ label: 'Cost at matrix', value: money(projection.cost, projection.currency), hint: `${projection.basePct}% base · mean ${projection.headcount ? Math.round((projection.cost / projection.payroll) * 1000) / 10 : 0}% of payroll` }),
              stat({ label: 'Envelope', value: projection.envelopeAmount === null ? '—' : money(projection.envelopeAmount, projection.currency), hint: projection.envelopePct === null ? 'No envelope declared' : `${projection.envelopePct}% of payroll`, tone: projection.overBudget ? 'warn' : '' }),
              stat({ label: 'Scaled cost', value: money(projection.scaledCost, projection.currency), hint: projection.overBudget ? `Proportionally scaled by ${projection.scale}` : 'Within the envelope' }),
              stat({ label: 'Below minimum', value: `${projection.belowMinBefore} → ${projection.belowMinAfter}`, hint: 'A merit matrix is not a mechanism for fixing placements', tone: projection.belowMinAfter ? 'bad' : 'good' })),
            projection.noRating
              ? banner({ tone: 'warn', title: `${projection.noRating} person(s) have no completed review rating`, body: 'The matrix pays them zero unless a "no rating" multiplier is declared. That is a real decision with a real consequence, so it is shown rather than defaulted away.' })
              : null,
            h('h3', { class: 'subhead' }, 'Mean increase by group'),
            table({
              caption: 'Mean proposed increase by group',
              columns: [
                { label: 'Group', render: ({ row }) => groupLabel(row.group) },
                { label: 'People', render: ({ row }) => String(row.headcount) },
                { label: 'Mean increase %', render: ({ row }) => `${row.meanPct ?? '—'}%` },
                { label: 'Mean amount', render: ({ row }) => money(row.meanIncrease, projection.currency) },
              ],
              rows: Object.values(projection.byGroup).map((row) => ({ row })),
              emptyMessage: '',
            }),
            h('p', { class: 'muted small' }, 'Equal mean percentage increases are not the same thing as closing a gap: they scale an existing difference. The projection below the matrix is what tells you which one you are doing.'),
            focused.status === 'declared'
              ? h('div', { class: 'row-actions' },
                  h('button', {
                    class: 'btn btn-primary',
                    type: 'button',
                    onClick: () => {
                      const res = ctx.api.commitMeritRound(focused.id);
                      if (!res.ok) return toast(res.error, 'bad');
                      toast('Round committed. Its projection is now frozen, and any resulting decision is in Decisions.', 'good');
                      ctx.refresh();
                      return null;
                    },
                  }, 'Commit this round'),
                  h('button', {
                    class: 'btn btn-ghost',
                    type: 'button',
                    onClick: () => {
                      const res = ctx.api.cancelMeritRound(focused.id);
                      if (!res.ok) return toast(res.error, 'bad');
                      toast('Round cancelled.', 'neutral');
                      ctx.refresh();
                      return null;
                    },
                  }, 'Cancel round'))
              : null,
            focused.snapshot && focused.snapshot.gapAfterPct !== null && focused.snapshot.gapAfterPct !== undefined
              ? banner({
                  tone: focused.snapshot.gapAfterPct > focused.snapshot.gapBeforePct ? 'bad' : 'good',
                  title: `Projected adjusted gap: ${pctText(focused.snapshot.gapBeforePct)} → ${pctText(focused.snapshot.gapAfterPct)}`,
                  body: 'Frozen at commitment. The next filed audit will show what actually happened, which is the only thing that can falsify this.',
                })
              : null),
        })
      : null,
    focused && projection
      ? card({
          title: 'Proposed increases',
          body: table({
            caption: 'Proposed increases by person',
            columns: [
              { label: 'Person', render: ({ row }) => h('div', { class: 'stack-xxs' }, h('strong', null, row.name), h('span', { class: 'muted small' }, `${row.level ? LEVEL_LABELS[row.level] || row.level : '—'} · ${row.ratingLabel}`)) },
              { label: 'Current', render: ({ row }) => money(row.currentPay, projection.currency) },
              { label: 'Compa-ratio', render: ({ row }) => (row.compaRatio === null ? '—' : row.compaRatio.toFixed(3)) },
              { label: 'Position factor', render: ({ row }) => `×${row.positionFactor}` },
              { label: 'Proposed', render: ({ row }) => badge(`${row.proposedPct}%`, row.proposedPct === 0 ? 'warn' : row.proposedPct > (projection.basePct || 0) * 1.2 ? 'good' : 'neutral') },
              { label: 'New pay', render: ({ row }) => money(row.newPay, projection.currency) },
              { label: 'Increase', render: ({ row }) => money(row.increase, projection.currency) },
            ],
            rows: [...projection.scaled].sort((a, b) => (a.proposedPct === b.proposedPct ? (a.name < b.name ? -1 : 1) : b.proposedPct - a.proposedPct)).map((row) => ({ row })),
            emptyMessage: '',
          }),
        })
      : null);
}

function transparencySection(ctx, report) {
  const readiness = report.readiness;
  const toggle = (key, current) => {
    const res = ctx.api.attestPayProcess({ key, on: current ? '' : ctx.today });
    if (!res.ok) return toast(res.error, 'bad');
    toast(current ? 'Attestation withdrawn.' : 'Attestation recorded with today’s date.', current ? 'neutral' : 'good');
    ctx.refresh();
    return null;
  };

  return h('div', { class: 'view-stack' },
    banner({
      tone: 'info',
      title: 'This is not a compliance certificate',
      body: 'Directive (EU) 2023/970 requires transposition by 7 June 2026 and includes pay-reporting and joint-pay-assessment mechanics. LeadOS models two of them — the quartile distribution and the 5% assessment trigger — because they are computable from records you already keep. Everything else here is an attestation: LeadOS records what you say you did, with the date, and says that it is what it is.',
    }),
    card({
      title: 'Readiness',
      subtitle: `${readiness.counts.met} met · ${readiness.counts.gap} with a gap · ${readiness.counts.unknown} unrecorded. Deliberately not a percentage: an "80% ready" bar invites stopping at 80.`,
      body: h('div', { class: 'view-stack' },
        ...readiness.items.map((item) => h('div', { class: 'check-row-static' },
          badge(item.status === 'met' ? 'Met' : item.status === 'gap' ? 'Gap' : 'Unrecorded', item.status === 'met' ? 'good' : item.status === 'gap' ? 'bad' : 'neutral'),
          h('div', { class: 'stack-xxs' },
            h('div', { class: 'row-between' },
              h('strong', null, item.label),
              h('span', { class: 'muted small' }, item.basis === 'records' ? 'Derived from records' : 'Leader attestation')),
            h('p', { class: 'muted small' }, item.detail),
            item.route ? h('a', { class: 'link-small', href: item.route }, 'Open') : null)))),
    }),
    card({
      title: 'Process attestations',
      subtitle: 'Two facts LeadOS cannot observe. Recording them adds a date and an owner of the claim — it does not verify anything.',
      body: h('div', { class: 'view-stack' },
        h('div', { class: 'row-between' },
          h('div', { class: 'stack-xxs' },
            h('strong', null, 'A gender-neutral job-evaluation study was completed'),
            h('span', { class: 'muted small' }, ctx.state.settings?.payJobEvaluationOn ? `Attested ${formatDate(ctx.state.settings.payJobEvaluationOn)}` : 'Not recorded')),
          h('button', { class: 'btn btn-small btn-secondary', type: 'button', onClick: () => toggle('jobEvaluation', ctx.state.settings?.payJobEvaluationOn) }, ctx.state.settings?.payJobEvaluationOn ? 'Withdraw' : 'Record attestation')),
        h('div', { class: 'row-between' },
          h('div', { class: 'stack-xxs' },
            h('strong', null, 'A route for pay-information requests is in place'),
            h('span', { class: 'muted small' }, ctx.state.settings?.payInformationRouteOn ? `Attested ${formatDate(ctx.state.settings.payInformationRouteOn)}` : 'Not recorded')),
          h('button', { class: 'btn btn-small btn-secondary', type: 'button', onClick: () => toggle('informationRoute', ctx.state.settings?.payInformationRouteOn) }, ctx.state.settings?.payInformationRouteOn ? 'Withdraw' : 'Record attestation'))),
    }),
    card({
      title: 'Conventions in force',
      subtitle: 'These are local settings, not law. The threshold is shown next to the Directive’s 5% so the difference is never ambiguous.',
      body: h('div', { class: 'kv-grid' },
        kv('Assessment trigger', `${ctx.state.settings?.payGapTriggerPct}% ${ctx.state.settings?.payGapTriggerPct === EUR_DIRECTIVE_JPA_GAP_PCT ? '(the Directive’s threshold)' : `(Directive threshold is ${EUR_DIRECTIVE_JPA_GAP_PCT}%)`}`),
        kv('Stale pay record after', `${ctx.state.settings?.payStaleDays} days`),
        kv('Default merit envelope', `${ctx.state.settings?.payEnvelopePct}% of payroll`),
        kv('Single-step change prompt', `${ctx.state.settings?.payStepChangePct}%`),
        kv('Automatic propagation', ctx.state.settings?.payAutoPropagate === false ? 'Paused' : 'On')),
    }));
}

/* ------------------------------------------------------------------ page */

export function renderPay(ctx) {
  const report = payPortfolio(ctx.state, ctx.now);
  const activeTab = ctx.query?.get?.('tab') || 'architecture';
  const tab = ['architecture', 'equity', 'merit', 'transparency'].includes(activeTab) ? activeTab : 'architecture';

  const header = pageHeader({
    eyebrow: 'Pay architecture & equity',
    title: 'Compensation terminal',
    subtitle: 'Where people sit in their range, what difference the recorded controls do not explain, and whether the next merit cycle widens it. All local, all derived from your records, no market benchmark it cannot cite.',
    actions: [
      h('button', {
        class: 'btn btn-secondary',
        type: 'button',
        onClick: () => {
          const res = ctx.api.payBrief();
          if (!res.ok) return toast(res.error, 'bad');
          downloadText(`pay-brief-${ctx.today}.md`, res.text);
          toast('Brief downloaded.', 'good');
        },
      }, 'Download brief'),
      h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openAssignmentDialog(ctx) }, 'Record pay rate'),
    ],
  });

  const tabsRow = tabs({
    items: [
      { key: 'architecture', label: 'Architecture', count: report.architecture.counts.paid },
      { key: 'equity', label: 'Equity', count: report.audits.filter((row) => row.status === 'filed').length },
      { key: 'merit', label: 'Merit simulator', count: report.rounds.filter((row) => row.status === 'declared').length },
      { key: 'transparency', label: 'Transparency', count: report.readiness.counts.gap },
    ],
    active: tab,
    onSelect: (key) => {
      window.location.hash = `#/pay?tab=${key}`;
    },
    ariaLabel: 'Pay sections',
  });

  const bannerBlock = report.attention.length
    ? banner({
        tone: report.attention.some((row) => row.severity >= 5) ? 'bad' : 'warn',
        title: `${report.attention.length} thing(s) need a decision`,
        body: h('ul', { class: 'list-plain' }, ...report.attention.map((row) => h('li', null, h('a', { href: row.route }, row.title)))),
      })
    : null;

  let body = null;
  if (tab === 'equity') body = equitySection(ctx, report);
  else if (tab === 'merit') body = meritSection(ctx, report);
  else if (tab === 'transparency') body = transparencySection(ctx, report);
  else body = architectureSection(ctx, report);

  return h('div', { class: 'view-stack' }, header, tabsRow, bannerBlock, body);
}

export { totalTargetPay, positionFactor, PAY_GROUPS, PAY_GROUP_IDS };
