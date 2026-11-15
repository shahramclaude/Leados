/**
 * app/views/flexBudgetPanel.js — Flexible-Budget Variance Statement
 * (ADR-0213, Session 286). Fifth panel of `#/finance`.
 *
 * One reader (`buildFlexBudget`, reached through the seat-checked
 * `flexBudgetReport` command) is behind every figure here. Nothing is computed
 * in this file: a cell prints the whole cents the reader returned and carries
 * the same integer in `data-cents`, so the screen can be checked against the
 * report cell by cell. A withheld figure prints a dash with its sentence —
 * never a zero.
 *
 * Direction is always spelled out ("unfavourable" / "favourable"); colour is
 * never the only signal. The chart has a text alternative and a data table.
 */

import { h, svg, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import {
  flexMoney,
  flexPercent,
  flexPrice,
  flexQuantity,
  flexVarianceText,
} from '../core/domain/flexBudget.js';
import {
  FLEX_BUDGET_BOUNDS,
  FLEX_BUDGET_CSV_COLUMNS,
  FLEX_BUDGET_LIMITS,
  FLEX_BUDGET_REFUSALS,
  FLEX_BUDGET_SETTING_KEYS,
  FLEX_LINE_BEHAVIOURS,
  FLEX_STATEMENT_STATES,
} from '../core/domain/flexBudgetRegistry.js';

const DIAGRAM_URL = './app/assets/flex-budget-variance-bridge.jpg';
const L = FLEX_BUDGET_LIMITS;
const BASE_HREF = '#/finance?panel=variance';

const VIEWS = Object.freeze([
  Object.freeze({ key: 'statements', label: 'Statements' }),
  Object.freeze({ key: 'owners', label: 'Who answers for what' }),
  Object.freeze({ key: 'method', label: 'Method' }),
]);

function refresh(ctx) {
  if (typeof ctx?.refresh === 'function') ctx.refresh();
  else if (typeof ctx?.rerender === 'function') ctx.rerender();
  else if (typeof ctx?.render === 'function') ctx.render();
}

/** A refused act prints its sentence on the field it concerns and saves nothing. */
function finish(ctx, result, message, form = null) {
  if (!result?.ok) {
    if (form && result?.field) form.setFieldError(result.field, result.error || '');
    toast(result?.error || 'The variance-statement act was refused.', 'bad');
    return false;
  }
  closeAllModals();
  toast(result.warning || message, result.warning ? 'bad' : 'good');
  refresh(ctx);
  return true;
}

/* ------------------------------------------------------------------- cells */

/** A money cell: the printed text, and the same whole cents as data. */
function moneyCell(currency, cents, testid, { variance = false } = {}) {
  const claimed = cents !== null && cents !== undefined;
  return h('span', {
    class: 'num',
    'data-testid': testid,
    'data-cents': claimed ? String(cents) : '',
    ...(claimed ? {} : { title: 'Withheld or not applicable — see “What this statement refuses to print”.' }),
  }, variance ? flexVarianceText(currency, claimed ? cents : null) : flexMoney(currency, claimed ? cents : null));
}

const yes = (value) => (value === null || value === undefined ? '—' : (value ? 'yes' : 'no'));

/* ----------------------------------------------------------------- dialogs */

const LINES_PLACEHOLDER = [
  'variable; Senior engineers; 1200 h; 650; labour; rate=<person id>; usage=<person id>',
  'variable; Engineers; 2400 h; 380; labour',
  'variable; Cloud compute; 90000 vCPU-h; 0.42',
  'fixed; Tooling licences; 180000',
].join('\n');

function declarePlan(ctx, candidates) {
  const today = candidates.today;
  const monthStart = `${today.slice(0, 7)}-01`;
  const ownerOptions = [{ value: '', label: '— undeclared —' }, ...candidates.owners.map((row) => ({ value: row.id, label: `${row.name} (${row.id})${row.via === 'self' ? ' — this seat' : ''}` }))];
  const form = buildForm([
    { name: 'title', label: 'Cost object', type: 'text', required: true, placeholder: 'Service desk — November', help: 'The function, service or product whose cost this standard is for. One cost object, one period, one currency.' },
    { name: 'ownerId', label: 'Budget holder', type: 'select', required: true, options: candidates.holders.length ? candidates.holders.map((row) => ({ value: row.id, label: `${row.name} — held through the ${row.via === 'declared-line' ? 'declared reporting line' : row.via === 'operator' ? 'operator view' : 'reporting tree'}` })) : [{ value: '', label: '— this seat holds nobody —' }], value: candidates.holders[0]?.id || '', help: 'The person who runs the cost object and records its actuals. Never this seat: a standard set by the person it measures is a target they chose.' },
    { name: 'currency', label: 'Currency', type: 'text', required: true, value: candidates.currencies[0] || '', placeholder: 'DKK', help: 'Three-letter code. Nothing is converted and currencies are never pooled.' },
    { name: 'periodFrom', label: 'Period starts', type: 'date', required: true, value: monthStart },
    { name: 'periodTo', label: 'Period ends', type: 'date', required: true, value: today, help: `At most ${L.periodMaxDays} days. Actuals recorded on this last day are FINAL; anything earlier is interim.` },
    { name: 'driverLabel', label: 'Activity driver', type: 'text', required: true, placeholder: 'tickets resolved', help: 'The unit of work the variable cost flexes with.' },
    { name: 'volume', label: 'Planned volume of that activity', type: 'text', required: true, placeholder: '4000', help: 'A positive number with at most three decimals. No separator, no exponent.' },
    { name: 'linesText', label: 'The standard, one line per row', type: 'textarea', rows: 6, required: true, wide: true, placeholder: LINES_PLACEHOLDER, help: `variable; label; budgeted quantity and unit; standard price per unit; [pool]; [rate=person id]; [usage=person id] — or — fixed; label; lump; [usage=person id]. Lines sharing a pool name are substitutable inputs in ONE unit and get a mix and a yield variance. At most ${L.linesPerPlan} lines. Owner ids are listed in the three selects below.` },
    { name: 'rateOwnerId', label: 'Who agreed the prices (default for every line)', type: 'select', options: ownerOptions, value: '', help: 'Answers for the PRICE variance. In a matrix this is often the line that lends the people. Left undeclared, the amount prints as undeclared — nobody is guessed.' },
    { name: 'usageOwnerId', label: 'Who directs the usage (default for every line)', type: 'select', options: ownerOptions, value: '', help: 'Answers for EFFICIENCY, mix, yield and fixed spending.' },
    { name: 'volumeOwnerId', label: 'Who set the planned volume', type: 'select', options: ownerOptions, value: '', help: 'Answers for the ACTIVITY variance.' },
    { name: 'materialityAmount', label: 'Materiality floor (amount)', type: 'text', value: '0', help: 'A variance smaller than this is never flagged. Zero switches the floor off.' },
    { name: 'materialityPercent', label: 'Materiality share (% of the flexible budget)', type: 'text', value: '5', help: 'Both thresholds must be reached. Zero switches the share test off. Tested on the exact figure, never the rounded one.' },
    { name: 'basis', label: 'The basis of this standard', type: 'textarea', required: true, wide: true, help: `At least ${L.reasonMin} characters — the approved budget, the rate card, the study the quantities come from.` },
  ]);
  openModal({
    title: 'Declare a cost standard',
    size: 'lg',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'A standard is declared, never inferred', body: 'Nothing here is read from a budget envelope, a transfer price or a posted period. Quantities and prices are typed with their basis, by a seat above the budget holder, and every variance is re-derived from them on each read.' }),
      form.node),
    footer: [
      h('button', { type: 'button', class: 'btn btn-ghost', onClick: closeAllModals }, 'Cancel'),
      h('button', {
        type: 'button', class: 'btn btn-primary', 'data-testid': 'flex-plan-save',
        onClick: () => {
          form.clearErrors();
          const v = form.getValues();
          finish(ctx, ctx.api.flexBudgetDeclarePlan({
            title: v.title, ownerId: v.ownerId, currency: v.currency, periodFrom: v.periodFrom, periodTo: v.periodTo,
            driverLabel: v.driverLabel, volume: v.volume, linesText: v.linesText,
            rateOwnerId: v.rateOwnerId, usageOwnerId: v.usageOwnerId, volumeOwnerId: v.volumeOwnerId,
            materialityAmount: v.materialityAmount, materialityPercent: v.materialityPercent, basis: v.basis,
          }), 'Standard declared. No variance is printed until actuals are recorded against it.', form);
        },
      }, 'Declare the standard'),
    ],
  });
}

function recordActuals(ctx, statement, today) {
  const cutOff = today < statement.periodTo ? today : statement.periodTo;
  const guide = statement.planLines.map((line) => (line.behaviour === 'variable'
    ? `${line.key}; <${line.unit} consumed>; <cost>   — ${line.label}`
    : `${line.key}; <cost>   — ${line.label}`));
  const form = buildForm([
    { name: 'asOf', label: 'Cut-off — the last day these figures cover', type: 'date', required: true, value: cutOff, help: `${statement.periodTo} (the last day of the period) makes this the FINAL recording. An earlier day is interim: the activity variance and fixed-cost variances are withheld. A day after today is refused.` },
    { name: 'volume', label: `${statement.driverLabel} actually done to the cut-off`, type: 'text', required: true, help: `Planned for the period: ${flexQuantity(statement.plannedVolumeE3)}.` },
    { name: 'linesText', label: 'Actuals, one plan line per row', type: 'textarea', rows: Math.min(12, statement.planLines.length + 2), required: true, wide: true, placeholder: statement.planLines.map((line) => (line.behaviour === 'variable' ? `${line.key}; 0; 0` : `${line.key}; 0`)).join('\n'), help: `EVERY line is recorded or nothing is. ${guide.join(' · ')} · Cost with no plan line: “unplanned; label; cost” (at most ${L.unplannedPerActual}).` },
    { name: 'basis', label: 'Where these figures come from', type: 'textarea', required: true, wide: true, help: `At least ${L.reasonMin} characters — the ledger extract, the timesheet close, the invoice run.` },
  ]);
  openModal({
    title: `Record actuals — ${statement.title}`,
    size: 'lg',
    body: h('div', { class: 'stack' },
      statement.actualId ? banner({ tone: 'warn', title: 'This supersedes the recording on file', body: `The statement is read from the latest recording that is not withdrawn. The one dated ${statement.asOf} stays on the ledger.` }) : null,
      form.node),
    footer: [
      h('button', { type: 'button', class: 'btn btn-ghost', onClick: closeAllModals }, 'Cancel'),
      h('button', {
        type: 'button', class: 'btn btn-primary', 'data-testid': 'flex-actuals-save',
        onClick: () => {
          form.clearErrors();
          const v = form.getValues();
          finish(ctx, ctx.api.flexBudgetRecordActuals({ planId: statement.planId, asOf: v.asOf, volume: v.volume, linesText: v.linesText, basis: v.basis }), 'Actuals recorded. The statement below is re-derived from them.', form);
        },
      }, 'Record the actuals'),
    ],
  });
}

function reasonDialog(ctx, { title, label, help, testid, confirm, run, done }) {
  const form = buildForm([{ name: 'reason', label, type: 'textarea', required: true, help }]);
  openModal({
    title,
    body: form.node,
    footer: [
      h('button', { type: 'button', class: 'btn btn-ghost', onClick: closeAllModals }, 'Cancel'),
      h('button', {
        type: 'button', class: 'btn btn-danger', 'data-testid': testid,
        onClick: () => { form.clearErrors(); finish(ctx, run(form.getValues().reason), done, form); },
      }, confirm),
    ],
  });
}

function conventionsDialog(ctx, report) {
  const K = FLEX_BUDGET_SETTING_KEYS;
  const [min, max] = FLEX_BUDGET_BOUNDS.actualsDueDays;
  const form = buildForm([
    { name: K.actualsDueDays, label: 'Days after a period ends within which its final actuals are due', type: 'text', required: true, value: String(report.conventions[K.actualsDueDays]), help: `A whole number from ${min} to ${max}. A value outside the bounds is refused, never clamped.` },
  ]);
  openModal({
    title: 'Variance-statement conventions',
    body: form.node,
    footer: [
      h('button', { type: 'button', class: 'btn btn-ghost', onClick: closeAllModals }, 'Cancel'),
      h('button', {
        type: 'button', class: 'btn btn-primary', 'data-testid': 'flex-conventions-save',
        onClick: () => {
          form.clearErrors();
          const raw = String(form.getValues()[K.actualsDueDays]).trim();
          finish(ctx, ctx.api.flexBudgetSetConventions({ [K.actualsDueDays]: /^\d+$/.test(raw) ? Number(raw) : NaN }), 'Conventions saved.', form);
        },
      }, 'Save'),
    ],
  });
}

function downloadCsv(ctx, today) {
  const result = ctx.api.flexBudgetCsvRows();
  if (!result?.ok) { toast(result?.error || 'The variance export was refused.', 'bad'); return; }
  downloadText({
    filename: `leados-flex-budget-variance-statements-${today}.csv`,
    text: serializeCsv(FLEX_BUDGET_CSV_COLUMNS.map((key) => ({ key, header: key })), result.rows),
    mime: 'text/csv;charset=utf-8',
  });
  toast('Identity-free CSV downloaded — the same whole cents this screen printed.', 'good');
}

function briefDialog(ctx) {
  const result = ctx.api.flexBudgetBriefText();
  if (!result?.ok) { toast(result?.error || 'The brief was refused.', 'bad'); return; }
  openModal({
    title: 'Flexible-budget variance — brief',
    body: h('pre', { class: 'brief-text', tabindex: '0', 'data-testid': 'flex-brief' }, result.text),
    footer: [h('button', { type: 'button', class: 'btn btn-ghost', onClick: closeAllModals }, 'Close')],
  });
}

/* ------------------------------------------------------------------- chart */

/**
 * The causes, as a diverging bar chart from a zero line: right is
 * unfavourable (cost above the standard), left is favourable. Bars share one
 * linear scale from zero, so their lengths are comparable and nothing is
 * truncated. Every bar carries its amount and direction in words.
 */
function causesChart(statement) {
  const rows = statement.bridge.filter((step) => step.kind === 'delta');
  if (!rows.length) return null;
  const headline = statement.final ? statement.totals.cents.total : statement.totals.cents.flexVariance;
  const all = [...rows, { key: 'headline', label: statement.final ? 'Total (static-budget variance)' : 'Flexible-budget variance', cents: headline }]
    .filter((row) => row.cents !== null && row.cents !== undefined);
  const max = Math.max(1, ...all.map((row) => Math.abs(row.cents)));
  const width = 720;
  const rowH = 28;
  const top = 26;
  const height = top + all.length * rowH + 10;
  const plotLeft = 170;
  const plotRight = 500;
  const centre = (plotLeft + plotRight) / 2;
  const half = (plotRight - plotLeft) / 2;
  const summary = `Causes of the cost variance for ${statement.title}: ${all.map((row) => `${row.label} ${flexVarianceText(statement.currency, row.cents)}`).join('; ')}.`;
  const marks = all.map((row, index) => {
    const y = top + index * rowH;
    const length = Math.abs(row.cents) / max * half;
    const x = row.cents >= 0 ? centre : centre - length;
    const isHeadline = row.key === 'headline';
    return svg('g', null,
      svg('text', { x: plotLeft - 8, y: y + 15, class: 'chart-tick', 'text-anchor': 'end', ...(isHeadline ? { 'font-weight': '700' } : {}) }, row.label),
      row.cents === 0
        ? null
        : svg('rect', { x, y: y + 4, width: Math.max(1.5, length), height: rowH - 12, rx: 2, class: `flex-bar ${row.cents > 0 ? 'flex-bar-unfavourable' : 'flex-bar-favourable'}${isHeadline ? ' flex-bar-headline' : ''}` }),
      svg('text', { x: plotRight + 10, y: y + 15, class: 'chart-value' }, flexVarianceText(statement.currency, row.cents)));
  });
  return h('figure', { class: 'chart chart-figure', 'data-testid': `flex-chart-${statement.code}` },
    svg('svg', { class: 'chart-svg', viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': summary },
      svg('text', { x: centre - 8, y: 14, class: 'chart-tick', 'text-anchor': 'end' }, '← favourable'),
      svg('text', { x: centre + 8, y: 14, class: 'chart-tick' }, 'unfavourable →'),
      svg('line', { x1: centre, x2: centre, y1: top - 4, y2: height - 6, class: 'chart-axis' }),
      ...marks),
    h('p', { class: 'sr-only' }, summary),
    h('figcaption', { class: 'muted small' }, `One linear scale from zero; the longest bar is ${flexMoney(statement.currency, max)}. ${statement.final ? 'The causes add to the total.' : 'Interim: the activity variance and fixed-cost variances are withheld, so the causes add to the flexible-budget variance of the variable lines and unplanned cost.'}`),
    h('details', { class: 'chart-table-details' },
      h('summary', null, 'The bridge as a table'),
      table({
        caption: `Bridge for ${statement.title}, in whole cents as printed`,
        columns: [
          { label: 'Step', render: (row) => row.label },
          { label: 'Kind', render: (row) => (row.kind === 'level' ? 'level' : 'cause') },
          { label: 'Amount', render: (row) => (row.kind === 'level' ? flexMoney(statement.currency, row.cents) : flexVarianceText(statement.currency, row.cents)) },
        ],
        rows: statement.bridge,
      })));
}

/* -------------------------------------------------------------- statements */

function ownerText(owner) {
  return owner ? owner.name : 'undeclared';
}

function linesTable(statement) {
  const c = statement.currency;
  const id = (line, key) => `flex-cell-${statement.code}-${line.key}-${key}`;
  const flag = (line, key) => (line.material[key] ? badge('material', 'warn', 'Reaches both declared materiality thresholds, tested on the exact figure.') : null);
  return table({
    caption: `Lines of ${statement.title}. Money in ${c}; a dash is a figure that is withheld or does not apply.`,
    columns: [
      { label: 'Line', render: (line) => h('div', { class: 'stack-xs' },
        h('strong', null, `${line.key} · ${line.label}`),
        h('span', { class: 'muted small' }, line.kind === 'variable'
          ? `variable${line.pooled ? ` · pool “${line.pool}”` : (line.pool ? ` · pool “${line.pool}” has one line — no mix or yield` : '')}${line.split === 'combined' ? ' · no quantity consumed — price not split' : ''}`
          : line.kind === 'fixed' ? 'fixed lump' : 'unplanned — no plan line')) },
      { label: 'Quantity: allowed → actual', render: (line) => (line.kind === 'variable'
        ? h('span', { class: 'num', 'data-testid': id(line, 'qty') }, `${flexQuantity(line.stdQtyAllowedE3)}${line.stdQtyAllowedExact === false ? '≈' : ''} → ${flexQuantity(line.actualQtyE3)} ${line.unit}`)
        : '—') },
      { label: 'Price: standard → actual', render: (line) => (line.kind === 'variable'
        ? h('span', { class: 'num' }, `${flexPrice(line.stdPriceE4)} → ${line.actualPriceE4 === null ? '—' : `${flexPrice(line.actualPriceE4)}${line.actualPriceExact === false ? '≈' : ''}`}`)
        : '—') },
      { label: 'Flexible budget', render: (line) => moneyCell(c, line.cents.flex, id(line, 'flex')) },
      { label: 'Price', render: (line) => h('div', { class: 'stack-xs' }, moneyCell(c, line.cents.price, id(line, 'price'), { variance: true }), flag(line, 'price')) },
      { label: 'Joint', render: (line) => h('div', { class: 'stack-xs' }, moneyCell(c, line.cents.joint, id(line, 'joint'), { variance: true }), flag(line, 'joint')) },
      { label: 'Efficiency', render: (line) => h('div', { class: 'stack-xs' },
        moneyCell(c, line.cents.efficiency, id(line, 'efficiency'), { variance: true }),
        line.pooled ? h('span', { class: 'muted small' }, 'mix ', moneyCell(c, line.cents.mix, id(line, 'mix'), { variance: true }), ' · yield ', moneyCell(c, line.cents.yield, id(line, 'yield'), { variance: true })) : null,
        flag(line, 'efficiency')) },
      { label: 'Fixed spending / unplanned', render: (line) => (line.kind === 'fixed'
        ? h('div', { class: 'stack-xs' }, moneyCell(c, line.cents.spending, id(line, 'spending'), { variance: true }), flag(line, 'spending'))
        : line.kind === 'unplanned'
          ? h('div', { class: 'stack-xs' }, moneyCell(c, line.cents.unplanned, id(line, 'unplanned'), { variance: true }), flag(line, 'unplanned'))
          : '—') },
      { label: 'Actual', render: (line) => moneyCell(c, line.cents.actual, id(line, 'actual')) },
      { label: 'Answers: rate · usage', render: (line) => (line.kind === 'unplanned'
        ? h('span', { class: 'small' }, `budget holder (${statement.ownerName})`)
        : h('div', { class: 'stack-xs small' },
          line.kind === 'variable' ? h('span', null, `rate: ${ownerText(line.owners.rate)}`) : null,
          h('span', null, `usage: ${ownerText(line.owners.usage)}`),
          line.jointShared ? badge('joint term shared', 'info', 'The rate and the usage of this line answer to two different people, so the joint price × quantity term is added to neither.') : null)) },
    ],
    rows: statement.lines,
  });
}

function attributionTable(currency, rows, { caption, testPrefix }) {
  return table({
    caption,
    columns: [
      { label: 'Answers for it', render: (row) => h('div', { class: 'stack-xs' },
        h('strong', null, row.label),
        row.kind === 'shared' ? h('span', { class: 'muted small' }, 'Added to neither person’s own total.') : null,
        row.kind === 'undeclared' ? h('span', { class: 'muted small' }, 'No owner was declared for this role. Nobody is guessed.') : null) },
      { label: 'Activity', render: (row) => flexVarianceText(currency, row.cents.activity) },
      { label: 'Price', render: (row) => flexVarianceText(currency, row.cents.price) },
      { label: 'Joint', render: (row) => flexVarianceText(currency, row.cents.joint) },
      { label: 'Efficiency', render: (row) => flexVarianceText(currency, row.cents.efficiency) },
      { label: 'Fixed spending', render: (row) => flexVarianceText(currency, row.cents.spending) },
      { label: 'Unplanned', render: (row) => flexVarianceText(currency, row.cents.unplanned) },
      { label: 'Total', render: (row) => moneyCell(currency, row.totalCents, `${testPrefix}-${row.key}`, { variance: true }) },
    ],
    rows,
  });
}

function statementCard(ctx, statement, today) {
  const c = statement.currency;
  const t = statement.totals?.cents || null;
  const computed = statement.stateKey === 'final' || statement.stateKey === 'interim';
  const tid = (key) => `flex-total-${statement.code}-${key}`;
  const actions = [
    badge(statement.stateMeta.label, statement.stateMeta.tone, statement.stateMeta.says),
    statement.finalOverdue ? badge('final actuals overdue', 'warn', `Final actuals were due by ${statement.finalDueOn}.`) : null,
    computed ? badge(statement.balances ? 'printed cents add up' : 'DOES NOT ADD UP', statement.balances ? 'good' : 'bad', 'Every row, column, pool and bridge identity re-added from the printed whole cents.') : null,
    statement.canRecord ? h('button', { type: 'button', class: 'btn btn-sm', 'data-testid': `flex-actuals-open-${statement.code}`, onClick: () => recordActuals(ctx, statement, today) }, statement.actualId ? 'Record again' : 'Record actuals') : null,
    statement.canWithdraw ? h('button', { type: 'button', class: 'btn btn-sm btn-ghost', 'data-testid': `flex-withdraw-open-${statement.code}`, onClick: () => reasonDialog(ctx, {
      title: 'Withdraw this recording', label: 'Why is this recording withdrawn?', help: `At least ${L.reasonMin} characters. The row stays on the ledger; the statement falls back to the recording before it, if there is one.`,
      testid: 'flex-withdraw-save', confirm: 'Withdraw', done: 'Recording withdrawn.',
      run: (reason) => ctx.api.flexBudgetWithdrawActuals({ actualId: statement.actualId, reason }),
    }) }, 'Withdraw recording') : null,
    statement.canRetire ? h('button', { type: 'button', class: 'btn btn-sm btn-ghost', 'data-testid': `flex-retire-open-${statement.code}`, onClick: () => reasonDialog(ctx, {
      title: 'Retire this standard', label: 'Why is this standard retired?', help: `At least ${L.reasonMin} characters. The declaration and its recordings are kept.`,
      testid: 'flex-retire-save', confirm: 'Retire', done: 'Standard retired.',
      run: (reason) => ctx.api.flexBudgetRetirePlan({ planId: statement.planId, reason }),
    }) }, 'Retire standard') : null,
  ].filter(Boolean);

  const header = h('p', { class: 'small muted' },
    `Budget holder ${statement.ownerName} · ${statement.period} · driver: ${statement.driverLabel}, planned ${flexQuantity(statement.plannedVolumeE3)} · standard declared ${statement.declaredOn} by ${statement.declaredByName} · you see this through: ${statement.reachLabel}.`);

  if (!computed) {
    return card({
      title: `${statement.code} · ${statement.title}`,
      subtitle: `${c} · ${statement.period}`,
      actions,
      attrs: { 'data-testid': `flex-statement-${statement.code}`, 'data-state': statement.stateKey },
      body: h('div', { class: 'stack' },
        header,
        banner({ tone: statement.stateKey === 'unreadable' ? 'bad' : 'info', title: statement.stateMeta.label, body: statement.stateMeta.says }),
        table({
          caption: `The declared standard for ${statement.title}`,
          columns: [
            { label: 'Line', render: (line) => `${line.key} · ${line.label}` },
            { label: 'Behaviour', render: (line) => line.behaviour },
            { label: 'Budgeted quantity', render: (line) => (line.behaviour === 'variable' ? `${flexQuantity(line.qtyE3)} ${line.unit}` : '—') },
            { label: 'Standard price', render: (line) => (line.behaviour === 'variable' ? flexPrice(line.priceE4) : '—') },
            { label: 'Lump', render: (line) => (line.behaviour === 'fixed' ? flexMoney(c, line.budgetCents) : '—') },
            { label: 'Pool', render: (line) => line.pool || '—' },
          ],
          rows: statement.planLines,
        })),
    });
  }

  const r = statement.rounding;
  return card({
    title: `${statement.code} · ${statement.title}`,
    subtitle: `${c} · ${statement.period} · actuals to ${statement.asOf}`,
    actions,
    attrs: { 'data-testid': `flex-statement-${statement.code}`, 'data-state': statement.stateKey },
    body: h('div', { class: 'stack' },
      header,
      statement.final ? null : banner({ tone: 'info', title: statement.stateMeta.label, body: statement.stateMeta.says }),
      h('div', { class: 'stat-row' },
        stat({ label: 'Static budget', value: moneyCell(c, t.static, tid('static')), hint: statement.final ? 'the standard at the planned volume' : 'withheld until the period ends' }),
        stat({ label: 'Activity variance', value: moneyCell(c, t.activity, tid('activity'), { variance: true }), hint: statement.final ? `activity at ${flexPercent(statement.volume.ratioBp)}${statement.volume.ratioExact ? '' : '≈'} of plan — more work is not overspending` : 'withheld until the period ends' }),
        stat({ label: statement.final ? 'Flexible budget' : 'Flexible budget (variable lines)', value: moneyCell(c, statement.final ? t.flex : t.comparedFlex, tid('flex')), hint: 'the standard restated for the work done' }),
        stat({ label: 'Flexible-budget variance', value: moneyCell(c, t.flexVariance, tid('flexVariance'), { variance: true }), tone: statement.totals.material.flexVariance ? 'warn' : '', hint: 'what price, usage and unplanned cost explain' }),
        stat({ label: statement.final ? 'Actual cost' : 'Actual cost compared', value: moneyCell(c, statement.final ? t.actual : t.comparedActual, tid('actual')), hint: `recorded ${statement.recordedOn} by ${statement.recordedByName}` }),
        stat({ label: 'Total variance', value: moneyCell(c, t.total, tid('total'), { variance: true }), hint: statement.final ? `${flexPercent(statement.totals.shareBp.total)} of the static budget` : 'withheld until the period ends' })),
      causesChart(statement),
      h('div', { class: 'stack-sm', 'data-testid': `flex-commentary-${statement.code}` },
        h('h3', { class: 'small' }, 'What the figures say — every amount below is one printed on this card'),
        ...statement.commentary.map((sentence) => h('p', { class: 'small' }, sentence))),
      linesTable(statement),
      statement.pools.some((pool) => pool.pooled)
        ? table({
          caption: 'Pools of substitutable inputs: efficiency = mix + yield',
          columns: [
            { label: 'Pool', render: (pool) => pool.key },
            { label: 'Lines', render: (pool) => pool.lineKeys.join(', ') },
            { label: 'Efficiency', render: (pool) => moneyCell(c, pool.cents.efficiency, `flex-pool-${statement.code}-${pool.key}-efficiency`, { variance: true }) },
            { label: 'Mix', render: (pool) => moneyCell(c, pool.cents.mix, `flex-pool-${statement.code}-${pool.key}-mix`, { variance: true }) },
            { label: 'Yield', render: (pool) => moneyCell(c, pool.cents.yield, `flex-pool-${statement.code}-${pool.key}-yield`, { variance: true }) },
          ],
          rows: statement.pools.filter((pool) => pool.pooled),
        })
        : null,
      h('h3', { class: 'small' }, 'Who answers for what — by declaration only'),
      statement.attribution.length
        ? attributionTable(c, statement.attribution, { caption: `Declared ownership of the variances of ${statement.title}`, testPrefix: `flex-owner-${statement.code}` })
        : h('p', { class: 'small muted' }, 'Every variance on this statement is zero, so there is nothing to attribute.'),
      h('p', { class: 'small', 'data-testid': `flex-integrity-${statement.code}` },
        `Two claims, kept apart. (1) The printed cents add up: ${statement.balances ? 'yes' : 'NO — read this card as a defect'} (${statement.checks.filter((check) => check.ok).length} of ${statement.checks.length} identities re-added from the printed integers); the attribution re-adds to the ${statement.final ? 'total' : 'flexible-budget'} variance: ${yes(statement.attributionBalances)}. `,
        `(2) The printed figures are the computed figures: ${r.exactCells} of ${r.cells} derived cells are exact whole cents; ${r.roundedCells} are exact rationals shown to the cent by largest-remainder apportionment (${r.apportionedCells} of them differ from plain rounding so that the rows still add). No printed cell is a whole cent away from its exact value.`),
      h('details', { class: 'chart-table-details' },
        h('summary', null, 'Basis and sources'),
        h('p', { class: 'small' }, h('strong', null, 'Standard: '), statement.basis),
        h('p', { class: 'small' }, h('strong', null, 'Actuals: '), statement.actualBasis),
        h('p', { class: 'small muted' }, `Materiality: ${flexMoney(c, statement.materialityCents)} and ${flexPercent(statement.materialityBp)} of the base — both must be reached. ${statement.recordingsN} recording(s) on the ledger, ${statement.withdrawnN} withdrawn.`))),
  });
}

function refusalsCard(report) {
  return card({
    title: 'What this page refuses to print',
    subtitle: 'Every row below is a dash, a blank or a count somewhere on this page.',
    body: report.refusals.length
      ? h('ul', { class: 'stack-sm', 'data-testid': 'flex-refusals' }, ...report.refusals.map((row) => h('li', { class: 'small', 'data-refusal': row.key }, row.says)))
      : h('p', { class: 'small muted' }, 'Nothing on this page is withheld: every statement shown is final, fully declared and in one currency.'),
  });
}

/* ------------------------------------------------------------------- views */

function ownersSection(report) {
  if (!report.currencies.length) {
    return card({ body: emptyState({ title: 'No statement in this span', body: 'Ownership of a variance exists only on a declared standard with recorded actuals.' }) });
  }
  return h('div', { class: 'stack' },
    banner({ tone: 'info', title: 'A roll-up of FINAL statements, one currency at a time', body: 'A cost object is counted once however many reporting lines reach its budget holder. Interim statements are listed on the Statements view and never added here. Where the rate and the usage of an input answer to two people, the joint term has its own shared row and is added to neither.' }),
    ...report.currencies.map((row) => card({
      title: `${row.currency} — ${row.finalN} final of ${row.statementsN} statement(s)`,
      subtitle: row.finalN ? `Static budget ${flexMoney(row.currency, row.cents.static)} · flexible budget ${flexMoney(row.currency, row.cents.flex)} · actual ${flexMoney(row.currency, row.cents.actual)} · total ${flexVarianceText(row.currency, row.cents.total)}` : 'No final statement — nothing is rolled up.',
      attrs: { 'data-testid': `flex-rollup-${row.currency}` },
      body: row.finalN
        ? h('div', { class: 'stack' },
          h('div', { class: 'stat-row' },
            stat({ label: 'Activity', value: moneyCell(row.currency, row.cents.activity, `flex-rollup-${row.currency}-activity`, { variance: true }) }),
            stat({ label: 'Price', value: moneyCell(row.currency, row.cents.price, `flex-rollup-${row.currency}-price`, { variance: true }) }),
            stat({ label: 'Joint', value: moneyCell(row.currency, row.cents.joint, `flex-rollup-${row.currency}-joint`, { variance: true }) }),
            stat({ label: 'Efficiency', value: moneyCell(row.currency, row.cents.efficiency, `flex-rollup-${row.currency}-efficiency`, { variance: true }) }),
            stat({ label: 'Fixed spending', value: moneyCell(row.currency, row.cents.spending, `flex-rollup-${row.currency}-spending`, { variance: true }) }),
            stat({ label: 'Unplanned', value: moneyCell(row.currency, row.cents.unplanned, `flex-rollup-${row.currency}-unplanned`, { variance: true }) }),
            stat({ label: 'Total', value: moneyCell(row.currency, row.cents.total, `flex-rollup-${row.currency}-total`, { variance: true }) })),
          row.attribution.length
            ? attributionTable(row.currency, row.attribution, { caption: `Declared ownership across ${row.finalN} final ${row.currency} statement(s)`, testPrefix: `flex-rollup-owner-${row.currency}` })
            : h('p', { class: 'small muted' }, 'Every variance in this roll-up is zero.'),
          h('p', { class: 'small' }, `The roll-up re-adds from its statements’ printed cents: ${yes(row.balances)}; its attribution re-adds to the total: ${yes(row.attributionBalances)}. ${row.printedExact ? 'Every statement in it prints exact whole cents.' : `${row.roundedCells} cell(s) across its statements are exact rationals shown to the cent.`} Undeclared ownership: ${flexMoney(row.currency, row.undeclaredCents)}. Joint term shared: ${flexMoney(row.currency, row.sharedCents)}.`))
        : h('p', { class: 'small muted' }, `${row.interimN} interim, ${row.noActualsN} with no actuals, ${row.unreadableN} unreadable.`),
    })),
    refusalsCard(report));
}

function methodCards(ctx, report) {
  const K = FLEX_BUDGET_SETTING_KEYS;
  return h('div', { class: 'stack' },
    card({
      title: 'The method, illustrated',
      subtitle: 'A plan restated for the work actually done, and the gap divided by cause — generated asset, never workspace data.',
      body: h('figure', {},
        h('img', {
          src: DIAGRAM_URL,
          loading: 'lazy',
          alt: 'Conceptual method illustration: seven flat rectangular blocks on a pale background, read left to right like a staircase bridge. A dark slate block stands on a thin baseline at the left; beside it a taller teal block stands on the same baseline. Four smaller blocks float above, each starting where the previous one ends and joined to it by a hairline: two amber blocks step upward, then two teal blocks step downward. A tall dark slate block stands on the baseline at the right, taller than the first. There are no numbers, labels or people in the picture.',
        }),
        h('figcaption', { class: 'muted small' }, 'Conceptual method illustration (generated asset) — not workspace data, and no shape in it is a figure from this workspace.')),
    }),
    card({
      title: 'How a statement is derived',
      body: h('dl', { class: 'stack-sm' }, ...Object.entries({
        'The standard': report.method.standard,
        'The actuals': report.method.actuals,
        'The flexible budget': report.method.flexible,
        'The bridge': report.method.bridge,
        'An interim reading': report.method.interim,
        Materiality: report.method.materiality,
        'Who answers': report.method.owners,
        'In a matrix': report.method.matrix,
        'Printed cents': report.method.rounding,
        'What it does not say': report.method.notSaid,
      }).flatMap(([term, says]) => [h('dt', { class: 'small' }, h('strong', null, term)), h('dd', { class: 'small' }, says)])),
    }),
    card({
      title: 'The variance classes',
      body: table({
        caption: 'Each class, its formula in words, and the declared role that answers for it',
        columns: [
          { label: 'Class', render: (row) => row.label },
          { label: 'What it measures', render: (row) => row.says },
          { label: 'Answers', render: (row) => ({ volume: 'who set the planned volume', rate: 'who agreed the price', usage: 'who directs the usage', shared: 'rate and usage owners — shared when they differ', holder: 'the budget holder' }[row.owner] || row.owner) },
        ],
        rows: report.classes,
      }),
    }),
    card({
      title: 'Line behaviours and statement states',
      body: h('div', { class: 'stack-sm' },
        ...FLEX_LINE_BEHAVIOURS.map((row) => h('p', { class: 'small' }, h('strong', null, `${row.label}. `), row.says)),
        ...FLEX_STATEMENT_STATES.map((row) => h('p', { class: 'small' }, badge(row.label, row.tone), ' ', row.says))),
    }),
    card({
      title: 'Where the method comes from',
      body: h('div', { class: 'stack-sm' }, ...report.frameworks.map((row) => h('p', { class: 'small' }, h('strong', null, `${row.label}. `), row.says))),
    }),
    card({
      title: 'Everything this register can refuse',
      body: h('ul', { class: 'stack-sm' }, ...FLEX_BUDGET_REFUSALS.map((row) => h('li', { class: 'small' }, row.says))),
    }),
    card({
      title: 'Conventions',
      actions: report.seat.canGovern ? [h('button', { type: 'button', class: 'btn btn-sm', 'data-testid': 'flex-conventions-open', onClick: () => conventionsDialog(ctx, report) }, 'Edit')] : [],
      body: h('p', { class: 'small' }, `Final actuals are due ${report.conventions[K.actualsDueDays]} day(s) after a period ends. Past that day the statement is counted on the Finance badge for every seat that may record against it. Engine ${report.engineVersion}.`),
    }));
}

/* -------------------------------------------------------------------- page */

export function renderFinanceFlexBudgetPanel(ctx, { tabs: panelTabs = null } = {}) {
  const result = ctx.api.flexBudgetReport();
  const requested = ctx.query?.get?.('view');
  const view = VIEWS.some((row) => row.key === requested) ? requested : 'statements';

  if (!result?.ok) {
    return h('div', { class: 'page' },
      pageHeader({ eyebrow: 'Finance & budgetary control', title: 'Flexible-budget variance', subtitle: 'Why cost differs from budget: more work, a different price, or different usage.' }),
      panelTabs,
      card({ body: banner({ tone: 'bad', title: 'The statements could not be read', body: result?.error || 'The read was refused.' }) }));
  }
  const report = result.report;

  const head = pageHeader({
    eyebrow: 'Finance & budgetary control',
    title: 'Flexible-budget variance statements',
    subtitle: '“Cost is over budget” is three different facts with three different owners: more work was done, the price per unit moved, or more was used per unit of work. This restates the standard for the work actually done and divides the gap exactly — and names an owner only where one was declared.',
    actions: [
      report.seat.canDeclare
        ? h('button', { type: 'button', class: 'btn btn-primary', 'data-testid': 'flex-plan-open', onClick: () => {
          const candidates = ctx.api.flexBudgetCandidates();
          if (!candidates?.ok) { toast(candidates?.error || 'Declaring a standard was refused.', 'bad'); return; }
          declarePlan(ctx, candidates);
        } }, 'Declare a standard')
        : null,
      h('button', { type: 'button', class: 'btn btn-ghost', 'data-testid': 'flex-brief-open', onClick: () => briefDialog(ctx) }, 'Brief'),
      h('button', { type: 'button', class: 'btn btn-ghost', 'data-testid': 'flex-csv', onClick: () => downloadCsv(ctx, report.today) }, 'CSV'),
    ].filter(Boolean),
  });

  const viewTabs = tabs({
    ariaLabel: 'Variance statement views',
    active: view,
    items: VIEWS.map((row) => ({ key: row.key, label: row.label })),
    onSelect: (key) => ctx.navigate(`${BASE_HREF}${key === 'statements' ? '' : `&view=${key}`}`),
  });

  if (view === 'method') return h('div', { class: 'page' }, head, panelTabs, viewTabs, methodCards(ctx, report));
  if (view === 'owners') return h('div', { class: 'page' }, head, panelTabs, viewTabs, ownersSection(report));

  const t = report.totals;
  return h('div', { class: 'page' },
    head,
    panelTabs,
    viewTabs,
    ctx.persistError ? card({ body: h('p', { class: 'text-warn small' }, `Changes are not being saved: ${ctx.persistError}`) }) : null,
    report.warnings.length ? card({ body: banner({ tone: 'warn', title: 'Rows that could not be read exactly were dropped', body: report.warnings.join(' ') }) }) : null,
    h('div', { class: 'stat-row', 'data-testid': 'flex-summary' },
      stat({ label: 'Statements in this span', value: h('span', { 'data-testid': 'flex-count-statements' }, String(t.statementsN)), hint: `in ${t.currenciesN} currency(ies), never pooled` }),
      stat({ label: 'Final', value: h('span', { 'data-testid': 'flex-count-final' }, String(t.finalN)), hint: 'full bridge printed' }),
      stat({ label: 'Interim', value: h('span', { 'data-testid': 'flex-count-interim' }, String(t.interimN)), hint: 'activity and fixed variances withheld' }),
      stat({ label: 'No actuals', value: h('span', { 'data-testid': 'flex-count-no-actuals' }, String(t.noActualsN)), tone: t.noActualsN ? 'warn' : '', hint: 'no variance printed' }),
      stat({ label: 'Final actuals overdue', value: h('span', { 'data-testid': 'flex-count-overdue' }, String(t.overdueN)), tone: t.overdueN ? 'warn' : '', hint: `due ${report.conventions[FLEX_BUDGET_SETTING_KEYS.actualsDueDays]} day(s) after period end` }),
      stat({ label: 'Material causes', value: h('span', { 'data-testid': 'flex-count-exceptions' }, String(t.exceptionsN)), tone: t.exceptionsN ? 'warn' : '', hint: `in ${t.materialN} statement(s), on declared thresholds` }),
      stat({ label: 'Outside this span', value: h('span', { 'data-testid': 'flex-count-outside' }, String(t.outsideN)), hint: 'counted, not shown' })),
    report.statements.length
      ? null
      : card({
        body: emptyState({
          title: 'No cost standard is declared in this span',
          body: report.seat.canDeclare
            ? 'Declare a standard for a budget holder you hold: an activity driver with its planned volume, a budgeted quantity and a standard price per variable input, and a lump per fixed input. Nothing is inferred from the budget envelopes.'
            : 'A standard is declared by a seat above the budget holder. Until one exists, cost cannot be divided into volume, price and usage — and nothing is inferred from the budget envelopes.',
        }),
      }),
    ...report.statements.map((statement) => statementCard(ctx, statement, report.today)),
    report.statementsNotShown ? card({ body: h('p', { class: 'small text-warn' }, `${report.statementsNotShown} further statement(s) are beyond the ${L.statementsShown} this page prints. They are in the CSV.`) }) : null,
    refusalsCard(report));
}
