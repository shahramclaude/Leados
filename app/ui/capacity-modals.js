/**
 * app/ui/capacity-modals.js — operating-plan dialogs.
 *
 *  - `openPortfolioItemDialog`    add or edit a piece of work, with a live
 *    three-point estimate readout, value density, and the utilisation the plan
 *    would land on if this item were funded.
 *  - `openPortfolioDecisionDialog` record the fund/defer/cut decision with the
 *    reason, showing the exact capacity (and goal) consequence before saving.
 *  - `openReleasePortfolioItemDialog` stop work explicitly, with a reason.
 *
 * Every dialog validates through the action layer (`ctx.api`), so the same
 * rules that protect a hand-edited import protect the UI. Nothing here writes
 * to the store directly.
 */

import { h, openModal, buildForm, toast } from './dom.js';
import { badge, kv } from './components.js';
import { formatDate, dayKey } from '../core/time.js';
import { personOptions } from './options.js';
import {
  PORTFOLIO_KINDS,
  PORTFOLIO_KIND_LABELS,
  PORTFOLIO_DECISIONS,
  PORTFOLIO_DECISION_LABELS,
  buildCapacityModel,
  pertTriple,
} from '../core/domain/capacity.js';
import { portfolioSource } from '../core/domain/capacity.js';

function footer(form, { submitLabel = 'Save', onClose }) {
  const cancel = h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => onClose() }, 'Cancel');
  const submit = h('button', { class: 'btn btn-primary', type: 'button', onClick: () => form.__submit() }, submitLabel);
  form.node.addEventListener('submit', (event) => {
    event.preventDefault();
    form.__submit();
  });
  return [cancel, submit];
}

function pctLabel(value) {
  return value === null || value === undefined ? 'not measured' : `${Math.round(value * 100)}%`;
}

/** Source picker: manual work, or a live goal / case / delegation. */
function sourceOptions(state) {
  const options = [{ value: '', label: 'Not linked to a record (manual work)' }];
  for (const goal of (state.goals || []).filter((g) => g.status === 'active')) {
    options.push({ value: `goal:${goal.id}`, label: `Goal — ${goal.title}` });
  }
  for (const c of (state.cases || []).filter((c) => ['open', 'mitigating', 'monitoring'].includes(c.status))) {
    options.push({ value: `case:${c.id}`, label: `Operational case — ${c.title}` });
  }
  for (const d of (state.delegations || []).filter((d) => d.status === 'active')) {
    options.push({ value: `delegation:${d.id}`, label: `Delegation — ${d.title}` });
  }
  return options;
}

export function openPortfolioItemDialog(ctx, { item = null } = {}) {
  const editing = Boolean(item);
  const today = dayKey(ctx.now);
  const sourceValue = item && item.sourceType !== 'manual' && item.sourceId
    ? `${item.sourceType}:${item.sourceId}`
    : '';

  const form = buildForm([
    { name: 'title', label: 'What is the work?', value: item?.title || '', required: true, wide: true, placeholder: 'Warehouse metrics migration' },
    {
      name: 'kind',
      label: 'Work type',
      type: 'select',
      value: item?.kind || 'project',
      options: PORTFOLIO_KINDS.filter((k) => k !== 'capacity-reserve').map((k) => ({ value: k, label: PORTFOLIO_KIND_LABELS[k] })),
      help: 'Capacity reserves are created from operational cases automatically and cannot be added by hand.',
    },
    { name: 'ownerId', label: 'Accountable owner', type: 'select', value: item?.ownerId || '', options: [{ value: '', label: 'Unassigned' }, ...personOptions(ctx.state)] },
    { name: 'source', label: 'Link to a record', type: 'select', value: sourceValue, options: sourceOptions(ctx.state), wide: true, help: 'Linking a goal lets a deferral write an explainable check-in on that goal (RULE-CAP-03).' },
    { type: 'divider', label: 'Effort — person-days (three-point PERT)' },
    { name: 'effortOptimistic', label: 'Optimistic', type: 'number', min: 0, step: '0.5', value: item?.effortDays?.optimistic ?? '' },
    { name: 'effortMostLikely', label: 'Most likely', type: 'number', min: 0, step: '0.5', value: item?.effortDays?.mostLikely ?? '' },
    { name: 'effortPessimistic', label: 'Pessimistic', type: 'number', min: 0, step: '0.5', value: item?.effortDays?.pessimistic ?? '' },
    { type: 'divider', label: 'Expected value — what the work is worth (optional)' },
    { name: 'valueOptimistic', label: 'Optimistic', type: 'number', min: 0, step: '100', value: item?.value?.optimistic || '' },
    { name: 'valueMostLikely', label: 'Most likely', type: 'number', min: 0, step: '100', value: item?.value?.mostLikely || '' },
    { name: 'valuePessimistic', label: 'Pessimistic', type: 'number', min: 0, step: '100', value: item?.value?.pessimistic || '' },
    { name: 'currency', label: 'Currency', value: item?.currency || 'USD', help: 'Leave value blank if you cannot estimate it. A guess is worse than a gap.' },
    { name: 'targetOn', label: 'Target date', type: 'date', value: item?.targetOn || '' },
    { name: 'createdOn', label: 'Started on', type: 'date', value: item?.createdOn || today },
    {
      name: 'decision',
      label: 'Funding decision',
      type: 'select',
      value: item?.decision || 'undecided',
      options: PORTFOLIO_DECISIONS.map((d) => ({ value: d, label: PORTFOLIO_DECISION_LABELS[d] })),
      help: 'Undecided is an honest state: it means nobody has chosen yet, and the plan counts it as demand without pretending it is committed.',
    },
    { name: 'rationale', label: 'Why (required when deferring or cutting)', type: 'textarea', rows: 2, value: item?.rationale || '', wide: true },
    { name: 'preview', type: 'static', wide: true, label: 'Live plan impact', value: h('div', { class: 'capacity-preview' }) },
  ]);

  const previewNode = form.node.querySelector('.capacity-preview');
  const readNumbers = () => {
    const values = form.getValues();
    const triple = (prefix) => ({
      optimistic: values[`${prefix}Optimistic`] === '' ? 0 : Number(values[`${prefix}Optimistic`]),
      mostLikely: values[`${prefix}MostLikely`] === '' ? 0 : Number(values[`${prefix}MostLikely`]),
      pessimistic: values[`${prefix}Pessimistic`] === '' ? 0 : Number(values[`${prefix}Pessimistic`]),
    });
    return { values, effort: triple('effort'), value: triple('value') };
  };

  const renderPreview = () => {
    if (!previewNode) return;
    const { values, effort, value } = readNumbers();
    const effortPert = pertTriple(effort);
    const valuePert = pertTriple(value);
    const model = buildCapacityModel(ctx.state, { now: ctx.now });
    const wasCommitted = editing && item && item.status === 'open' &&
      (item.kind === 'capacity-reserve' || item.decision === 'funded');
    const willCommit = values.decision === 'funded';
    const delta = (willCommit ? 1 : 0) - (wasCommitted ? 1 : 0);
    const projectedCommitted = model.demand.committedDays + delta * effortPert.expected;
    const projected = model.supply.allocatableDays > 0 ? projectedCommitted / model.supply.allocatableDays : null;
    const density = valuePert.measured && effortPert.expected > 0 ? valuePert.expected / effortPert.expected : null;

    previewNode.replaceChildren(
      h(
        'div',
        { class: 'kv-row kv-row-wrap' },
        kv('PERT effort', effortPert.measured ? `${effortPert.expected} person-days (P10 ${effortPert.p10} – P90 ${effortPert.p90})` : 'not estimated'),
        kv('Value density', density === null ? '—' : `${values.currency || 'USD'} ${density.toLocaleString('en-US', { maximumFractionDigits: 0 })} per person-day`),
        kv('Plan after saving', projected === null ? 'not measured' : `${pctLabel(projected)} committed`),
      ),
      h(
        'p',
        { class: 'muted tiny' },
        projected !== null && projected > 1
          ? 'This would put committed work above allocatable capacity. The engine will open one capacity trade-off decision (RULE-CAP-02) rather than let the plan quietly become fiction.'
          : 'Committed work stays inside allocatable capacity at this estimate.',
      ),
    );
  };

  renderPreview();
  for (const name of ['effortOptimistic', 'effortMostLikely', 'effortPessimistic', 'valueOptimistic', 'valueMostLikely', 'valuePessimistic', 'decision', 'currency']) {
    const field = form.field(name);
    if (field) field.addEventListener('input', renderPreview);
    if (field) field.addEventListener('change', renderPreview);
  }

  form.__submit = () => {
    form.clearErrors();
    const { effort, value, values } = readNumbers();
    const [sourceType, sourceId] = String(values.source || '').includes(':')
      ? String(values.source).split(':')
      : ['manual', null];
    const payload = {
      title: values.title,
      kind: values.kind,
      ownerId: values.ownerId || null,
      sourceType,
      sourceId,
      effortDays: effort,
      value,
      currency: values.currency,
      targetOn: values.targetOn || null,
      createdOn: values.createdOn,
      decision: values.decision,
      rationale: values.rationale,
    };
    const result = editing
      ? ctx.api.updatePortfolioItem(item.id, {
          title: payload.title,
          kind: payload.kind,
          ownerId: payload.ownerId,
          effortDays: effort,
          value,
          currency: payload.currency,
          targetOn: payload.targetOn,
        })
      : ctx.api.addPortfolioItem(payload);
    if (!result.ok) {
      if (result.field) form.setFieldError(result.field, result.error);
      else toast(result.error, 'bad');
      return;
    }
    close();
    const propagated = (result.propagations || []).length;
    toast(
      editing
        ? 'Plan item updated'
        : propagated
          ? `Added to the plan — ${propagated} cross-module update(s) applied`
          : 'Added to the plan',
      'good',
    );
  };

  const { close } = openModal({
    title: editing ? 'Edit plan item' : 'Add work to the operating plan',
    description: 'Effort is what the work costs the team; value is what it is worth. Ranking uses value per person-day, so an honest low value is more useful than an inflated one.',
    body: form.node,
    footer: footer(form, { submitLabel: editing ? 'Save item' : 'Add to plan', onClose: () => close() }),
    size: 'lg',
  });
}

export function openPortfolioDecisionDialog(ctx, { item }) {
  if (!item) return;
  const model = buildCapacityModel(ctx.state, { now: ctx.now });
  const effort = pertTriple(item.effortDays);
  const currentlyCommitted = item.kind === 'capacity-reserve' || item.decision === 'funded';
  const projectedCommitted = model.demand.committedDays - (currentlyCommitted ? effort.expected : 0) + effort.expected;
  const source = portfolioSource(ctx.state, item);

  const form = buildForm([
    {
      name: 'decision',
      label: 'Decision',
      type: 'select',
      value: item.decision === 'undecided' ? 'funded' : item.decision,
      options: PORTFOLIO_DECISIONS.map((d) => ({ value: d, label: PORTFOLIO_DECISION_LABELS[d] })),
    },
    {
      name: 'rationale',
      label: 'Why',
      type: 'textarea',
      rows: 3,
      value: item.rationale || '',
      wide: true,
      required: true,
      help: 'This reason is the decision. "Deferred" without a reason is the same as forgetting it.',
    },
    {
      type: 'static',
      label: 'Cross-module effect',
      wide: true,
      value: h(
        'div',
        null,
        h('div', { class: 'kv-row kv-row-wrap' },
          kv('Effort', `${effort.expected} person-days`),
          kv('Plan impact', `${effort.expected} day(s) ${currentlyCommitted ? 'released' : 'committed'}`),
          kv('Goal link', source && source.type === 'goal' ? source.title : 'none'),
        ),
        h('p', { class: 'muted tiny' },
          'Deferring or cutting goal-backed work writes an explainable check-in on that goal (RULE-CAP-03) so the decision cannot be silently detached from the objective it starves.'),
      ),
    },
  ]);

  form.__submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.setPortfolioDecision(item.id, {
      decision: values.decision,
      rationale: values.rationale,
    });
    if (!result.ok) {
      if (result.field) form.setFieldError(result.field, result.error);
      else toast(result.error, 'bad');
      return;
    }
    close();
    const propagated = (result.propagations || []).length;
    toast(propagated ? `Decision recorded — ${propagated} cross-module update(s)` : 'Decision recorded', 'good');
  };

  const { close } = openModal({
    title: `Funding decision — ${item.title}`,
    description: `The plan currently commits ${model.demand.committedDays} of ${model.supply.allocatableDays} allocatable person-days (${pctLabel(model.utilisation)}). ${badge(item.decision, item.decision === 'funded' ? 'good' : item.decision === 'undecided' ? 'neutral' : 'caution')}`,
    body: form.node,
    footer: footer(form, { submitLabel: 'Record decision', onClose: () => close() }),
  });
}

export function openReleasePortfolioItemDialog(ctx, { item }) {
  if (!item) return;
  const form = buildForm([
    { name: 'releasedOn', label: 'Released on', type: 'date', value: dayKey(ctx.now) },
    {
      name: 'reason',
      label: 'Why is this stopping?',
      type: 'textarea',
      rows: 3,
      required: true,
      wide: true,
      help: 'A silent stop is how the same work gets promised again next quarter. The reason stays in the record.',
    },
  ]);
  form.__submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.releasePortfolioItem(item.id, values);
    if (!result.ok) {
      if (result.field) form.setFieldError(result.field, result.error);
      else toast(result.error, 'bad');
      return;
    }
    close();
    toast('Work released — capacity returned to the plan', 'good');
  };
  const { close } = openModal({
    title: `Release “${item.title}”`,
    description: `This closes the item without delivering it on ${formatDate(ctx.now)}. The history and the reason stay in the plan.`,
    body: form.node,
    footer: footer(form, { submitLabel: 'Release work', onClose: () => close() }),
  });
}
