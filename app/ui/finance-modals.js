/**
 * app/ui/finance-modals.js — Budget & Financial Commitments dialogs.
 *
 * Capture forms for the Schema v24 budget collection:
 *  - openBudgetDialog: create/edit an envelope (single currency, optional
 *    ceiling — blank means tracking-only, never a ceiling of zero)
 *  - openBudgetLineDialog: create/edit a commitment line, optionally linked
 *    to the record it funds (RULE-FIN-02 creates the graph edge and goal
 *    telemetry in the same transaction)
 *  - openBudgetActualDialog: record evidenced spend (RULE-FIN-03 scores it);
 *    the actual is never pre-filled from the committed amount
 *
 * All writes go through ctx.api; this layer never touches the store.
 */

import { h, openModal, buildForm, toast } from './dom.js';
import { dayKey } from '../core/time.js';
import { personOptions } from './options.js';
import {
  BUDGET_CATEGORIES,
  BUDGET_CATEGORY_LABELS,
  BUDGET_LINE_STATUSES,
  BUDGET_LINE_STATUS_LABELS,
  BUDGET_SOURCE_LABELS,
  BUDGET_STATUSES,
  BUDGET_STATUS_LABELS,
  evaluateBudget,
  formatMoney,
} from '../core/domain/finance.js';

function modalFooter(form, { submitLabel = 'Save', onClose } = {}) {
  const cancelBtn = h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => onClose() }, 'Cancel');
  const submitBtn = h('button', { class: 'btn btn-primary', type: 'button', onClick: () => form.__submit() }, submitLabel);
  form.node.addEventListener('submit', (e) => {
    e.preventDefault();
    form.__submit();
  });
  return [cancelBtn, submitBtn];
}

/** Funded-record picker covering every BUDGET_SOURCE_TYPES collection. */
function sourceSelect(state, seed = {}) {
  const groups = [
    ['case', state.cases || [], (r) => r.title],
    ['negotiation', state.negotiations || [], (r) => r.title],
    ['portfolio', (state.portfolio || []).filter((r) => r.kind !== 'capacity-reserve'), (r) => r.title],
    ['requisition', state.requisitions || [], (r) => r.title],
    ['goal', state.goals || [], (r) => r.title],
    ['decision', state.decisions || [], (r) => r.title],
    ['change', state.changes || [], (r) => r.title],
  ];
  const options = [h('option', { value: '' }, 'No linked record (standalone spend)')];
  for (const [type, records, labelOf] of groups) {
    if (!records.length) continue;
    const group = h('optgroup', { label: BUDGET_SOURCE_LABELS[type] || type });
    for (const record of records.slice(0, 50)) {
      group.appendChild(h('option', { value: `${type}:${record.id}` }, String(labelOf(record) || record.id).slice(0, 120)));
    }
    options.push(group);
  }
  const select = h('select', { id: 'bud-line-source', 'aria-label': 'Record this line funds' }, ...options);
  if (seed.sourceType && seed.sourceId) select.value = `${seed.sourceType}:${seed.sourceId}`;
  return select;
}

function parseSource(select) {
  const value = select.value || '';
  if (!value) return { sourceType: null, sourceId: null };
  const [sourceType, sourceId] = value.split(/:(.+)/);
  return { sourceType: sourceType || null, sourceId: sourceId || null };
}

export function openBudgetDialog(ctx, { budget = null, onSaved = null } = {}) {
  const isEdit = Boolean(budget);
  const seed = budget || {};
  const form = buildForm([
    { name: 'name', label: 'Envelope name', required: true, wide: true, value: seed.name || '', placeholder: 'Platform Q4 operating budget' },
    {
      name: 'currency', label: 'Currency (one per envelope)', value: seed.currency || 'USD', placeholder: 'USD',
      help: 'Lines inherit this currency. Amounts are never converted, so totals can never mix currencies.',
    },
    {
      name: 'limit', label: 'Ceiling / approved envelope', type: 'number', min: 0, step: 'any',
      value: seed.limit ?? '', placeholder: 'Blank = tracking only, no ceiling recorded',
      help: 'A ceiling is a limit, not a spending target. Leave blank if no formal envelope was approved.',
    },
    { name: 'periodLabel', label: 'Period label', value: seed.periodLabel || '', placeholder: '2026 Q4' },
    { name: 'startsOn', label: 'Period starts', type: 'date', value: seed.startsOn || '' },
    { name: 'endsOn', label: 'Period ends', type: 'date', value: seed.endsOn || '' },
    {
      name: 'ownerId', label: 'Budget owner', type: 'select', value: seed.ownerId || '',
      options: [{ value: '', label: 'Unassigned (leader-held)' }, ...personOptions(ctx.state)],
    },
    ...(isEdit
      ? [{
          name: 'status', label: 'Status', type: 'select', value: seed.status || 'active',
          options: BUDGET_STATUSES.map((s) => ({ value: s, label: BUDGET_STATUS_LABELS[s] })),
        }]
      : []),
    { name: 'note', label: 'Notes (approval basis, guardrails)', type: 'textarea', rows: 3, wide: true, value: seed.note || '' },
    {
      name: 'autoPropagate', label: 'Cross-module automation', type: 'checkbox', value: seed.autoPropagate !== false,
      checkboxLabel: 'Propagate automatically (funded-record links, goal telemetry, forecast-breach DACI decision)',
    },
  ]);

  let closeFn = () => {};
  form.__submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const payload = {
      name: values.name,
      currency: values.currency,
      limit: values.limit,
      periodLabel: values.periodLabel,
      startsOn: values.startsOn || null,
      endsOn: values.endsOn || null,
      ownerId: values.ownerId || null,
      note: values.note,
      autoPropagate: values.autoPropagate !== false,
      ...(isEdit ? { status: values.status } : {}),
    };
    const res = isEdit ? ctx.api.updateBudget(budget.id, payload) : ctx.api.addBudget(payload);
    if (!res.ok) {
      form.setFieldError(res.field || 'name', res.error);
      toast(res.error, 'bad');
      return;
    }
    toast(isEdit ? 'Budget envelope updated.' : 'Budget envelope created.', 'good');
    closeFn();
    if (onSaved) onSaved(res);
    else if (!isEdit) ctx.navigate(`#/finance/${res.id}`);
    else ctx.refresh();
  };

  const dialog = openModal({
    title: isEdit ? `Edit budget: ${seed.name}` : 'Create budget envelope',
    description: 'Commitment (encumbrance) accounting: planned intentions, encumbered commitments and recorded actuals are tracked separately against the ceiling.',
    body: form.node,
    footer: modalFooter(form, { submitLabel: isEdit ? 'Save budget' : 'Create budget', onClose: () => closeFn() }),
    size: 'md',
    onClose: () => form.clearErrors(),
  });
  closeFn = dialog.close;
  return dialog;
}

export function openBudgetLineDialog(ctx, { budget, line = null, onSaved = null } = {}) {
  const isEdit = Boolean(line);
  const seed = line || {};
  const todayStr = dayKey(ctx.now);
  const select = sourceSelect(ctx.state, seed);
  const liveNode = h('div', { class: 'callout callout-subtle', 'aria-live': 'polite' });

  const form = buildForm([
    { name: 'title', label: 'What is the money for?', required: true, wide: true, value: seed.title || '', placeholder: 'Aurora Cloud annual licence renewal' },
    {
      name: 'category', label: 'Category', type: 'select', value: seed.category || 'other',
      options: BUDGET_CATEGORIES.map((c) => ({ value: c, label: BUDGET_CATEGORY_LABELS[c] })),
    },
    {
      name: 'status', label: 'Commitment state', type: 'select', value: seed.status || 'planned',
      options: BUDGET_LINE_STATUSES.map((s) => ({ value: s, label: BUDGET_LINE_STATUS_LABELS[s] })),
      help: 'Planned = intention, not yet encumbered. Committed = obligation entered into (PO/contract/approval). Spent = record the evidenced actual.',
    },
    {
      name: 'committedAmount', label: `Planned / committed amount (${budget.currency})`, type: 'number', min: 0, step: 'any',
      value: seed.committedAmount ?? '', placeholder: 'Leave blank if not yet priced',
    },
    {
      name: 'actualAmount', label: `Actual amount (${budget.currency}) — spent lines only`, type: 'number', min: 0, step: 'any',
      value: seed.actualAmount ?? '', placeholder: 'From invoice / finance report — never copied from the committed figure',
    },
    { type: 'static', wide: true, label: 'Record this line funds (optional)', value: select, help: 'Linking creates a typed funds edge; linked goals receive neutral funding telemetry, and when the funded work completes the line becomes actuals-due (RULE-FIN-02).' },
    {
      name: 'ownerId', label: 'Line owner', type: 'select', value: seed.ownerId || '',
      options: [{ value: '', label: 'Unassigned' }, ...personOptions(ctx.state)],
    },
    { name: 'committedOn', label: 'Committed on', type: 'date', value: seed.committedOn || '' },
    { name: 'expectedOn', label: 'Expected spend date', type: 'date', value: seed.expectedOn || '' },
    { name: 'spentOn', label: 'Spent on (spent lines)', type: 'date', value: seed.spentOn || (seed.status === 'spent' ? todayStr : '') },
    { name: 'note', label: 'Evidence / note', type: 'textarea', rows: 2, wide: true, value: seed.note || '', placeholder: 'PO number, quote reference, approval note…' },
    { type: 'static', wide: true, label: 'Envelope forecast with this line', value: liveNode },
  ]);

  const refreshLive = () => {
    const values = form.getValues();
    const hypothetical = {
      id: seed.id || 'preview-line',
      title: values.title || 'This line',
      category: values.category,
      status: values.status,
      committedAmount: values.committedAmount === '' ? null : Number(values.committedAmount),
      actualAmount: values.actualAmount === '' ? null : Number(values.actualAmount),
      expectedOn: values.expectedOn || null,
      actualsDueOn: null,
    };
    const lines = (budget.lines || []).filter((l) => l.id !== seed.id);
    lines.push(hypothetical);
    const ev = evaluateBudget({ ...budget, lines }, ctx.now, { watchPct: ctx.state.settings?.budgetWatchPct });
    liveNode.textContent = ev.hasLimit
      ? `Forecast at completion ${formatMoney(budget.currency, ev.forecastAtCompletion)} of ${formatMoney(budget.currency, ev.limit)} ceiling (${Math.round(ev.forecastUtilisation * 100)}%)${ev.breach ? ' — this would breach the envelope and open a DACI trade-off (RULE-FIN-01).' : ev.watch ? ' — inside the watch zone.' : '.'}`
      : `Tracking-only envelope: forecast ${formatMoney(budget.currency, ev.forecastAtCompletion)} (no ceiling recorded).`;
  };
  for (const el of form.node.querySelectorAll('input, select, textarea')) {
    el.addEventListener('input', refreshLive);
    el.addEventListener('change', refreshLive);
  }
  refreshLive();

  let closeFn = () => {};
  form.__submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const payload = {
      title: values.title,
      category: values.category,
      status: values.status,
      committedAmount: values.committedAmount,
      actualAmount: values.actualAmount,
      committedOn: values.committedOn || null,
      expectedOn: values.expectedOn || null,
      spentOn: values.spentOn || null,
      ownerId: values.ownerId || null,
      note: values.note,
      ...parseSource(select),
    };
    const res = isEdit
      ? ctx.api.updateBudgetLine(budget.id, line.id, payload)
      : ctx.api.addBudgetLine(budget.id, payload);
    if (!res.ok) {
      form.setFieldError(res.field || 'title', res.error);
      toast(res.error, 'bad');
      return;
    }
    toast(isEdit ? 'Budget line updated.' : 'Budget line added.', 'good');
    closeFn();
    if (onSaved) onSaved(res);
    else ctx.refresh();
  };

  const dialog = openModal({
    title: isEdit ? `Edit commitment: ${seed.title}` : `Add commitment to ${budget.name}`,
    description: `Amounts are in ${budget.currency}. Blank means honestly unpriced — never a silent zero.`,
    body: form.node,
    footer: modalFooter(form, { submitLabel: isEdit ? 'Save line' : 'Add line', onClose: () => closeFn() }),
    size: 'lg',
    onClose: () => form.clearErrors(),
  });
  closeFn = dialog.close;
  return dialog;
}

export function openBudgetActualDialog(ctx, { budget, line, onSaved = null } = {}) {
  const todayStr = dayKey(ctx.now);
  const form = buildForm([
    {
      type: 'static', wide: true, label: 'Commitment being settled',
      value: h(
        'p',
        { class: 'small muted' },
        `“${line.title}” — committed ${line.committedAmount !== null && line.committedAmount !== undefined ? formatMoney(budget.currency, line.committedAmount) : 'unpriced'}. The actual below is scored against that figure in the calibration ledger (RULE-FIN-03); it is deliberately not pre-filled.`,
      ),
    },
    {
      name: 'actualAmount', label: `Actual amount spent (${budget.currency})`, type: 'number', min: 0, step: 'any', required: true,
      value: '', placeholder: 'From the invoice, receipt or finance report',
    },
    { name: 'spentOn', label: 'Spent on', type: 'date', required: true, value: todayStr },
    { name: 'note', label: 'Evidence note', type: 'textarea', rows: 2, wide: true, value: '', placeholder: 'Invoice number, variance reason if it differs from the committed figure…' },
  ]);

  let closeFn = () => {};
  form.__submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const res = ctx.api.recordBudgetActual(budget.id, line.id, values);
    if (!res.ok) {
      form.setFieldError(res.field || 'actualAmount', res.error);
      toast(res.error, 'bad');
      return;
    }
    toast('Actual spend recorded.', 'good');
    closeFn();
    if (onSaved) onSaved(res);
    else ctx.refresh();
  };

  const dialog = openModal({
    title: `Record actual spend: ${line.title}`,
    description: 'Encumbrance reversed, evidence recorded. Zero is a legitimate actual if that is what the evidence says.',
    body: form.node,
    footer: modalFooter(form, { submitLabel: 'Record actual', onClose: () => closeFn() }),
    size: 'md',
    onClose: () => form.clearErrors(),
  });
  closeFn = dialog.close;
  return dialog;
}
