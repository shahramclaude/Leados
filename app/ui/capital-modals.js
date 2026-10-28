/**
 * app/ui/capital-modals.js — capture dialogs for Structural Capital Allocation.
 *
 * The portfolio dialog is deliberately a funder, not a form: every lever shows
 * its effort cost per unit and its Meadows leverage class, and the dialog
 * recomputes the modelled outcome live against the frozen budget. The
 * checkpoint dialog records observations only — it never accepts a score, so a
 * leader cannot type the answer they want the model to have earned.
 */

import { h, buildForm, openModal, toast } from './dom.js';
import { badge } from './components.js';
import {
  CAP_DEFAULT_BUDGET_UNITS,
  CAP_EFFORT_BOOK,
  CAP_MAX_BUDGET_UNITS,
  CAP_MIN_BUDGET_UNITS,
  CAP_OBJECTIVE_LABELS,
} from '../core/domain/policyPortfolio.js';
import { DYN_LEVERS, DYN_MAX_HORIZON_WEEKS, DYN_MIN_HORIZON_WEEKS } from '../core/domain/dynamics.js';
import { CHECKPOINT_STOCKS } from '../core/domain/checkpointScoring.js';

function formDialog({ title, description, fields, submitLabel = 'Save', size = 'md', bodyExtra = null, onSubmit }) {
  const form = buildForm(fields);
  let closeFn = null;
  form.__close = () => closeFn && closeFn();
  form.__onSubmit = () => onSubmit(form.getValues(), form, () => closeFn && closeFn());
  const cancelBtn = h('button', {
    class: 'btn btn-ghost', type: 'button', onClick: () => form.__close(),
  }, 'Cancel');
  const submitBtn = h('button', {
    class: 'btn btn-primary', type: 'button', onClick: () => form.__onSubmit(),
  }, submitLabel);
  form.node.addEventListener('submit', (event) => {
    event.preventDefault();
    form.__onSubmit();
  });
  const body = h('div', { class: 'view-stack' }, form.node, bodyExtra);
  const dialog = openModal({
    title,
    description,
    body,
    footer: [cancelBtn, submitBtn],
    size,
    onClose: () => form.clearErrors(),
  });
  closeFn = dialog.close;
  // The live-preview dialogs need the form instance, not a DOM query: a modal
  // query would pick up whichever dialog happens to be first in the document.
  dialog.__form = form;
  return dialog;
}

function ownerOptions(ctx, value) {
  const options = [{ value: '', label: 'No owner yet — a portfolio cannot be adopted without one' }];
  for (const person of (ctx.state.people || []).filter((p) => p && p.status !== 'archived')) {
    options.push({ value: person.id, label: `${person.name}${person.role ? ` · ${person.role}` : ''}` });
  }
  return options.map((option) => ({ ...option, selected: option.value === value }));
}

function readLevers(values) {
  const levers = {};
  for (const lever of DYN_LEVERS) levers[lever.key] = Number(values[`lever_${lever.key}`] || 0);
  return levers;
}

function readWeights(values) {
  return {
    saturation: Number(values.weight_saturation || 0),
    throughput: Number(values.weight_throughput || 0),
    capacity: Number(values.weight_capacity || 0),
    wip: Number(values.weight_wip || 0),
  };
}

function effortOfLevers(levers) {
  let total = 0;
  for (const lever of DYN_LEVERS) {
    const entry = CAP_EFFORT_BOOK[lever.key];
    total += (Number(levers[lever.key]) || 0) * entry.effortPerUnit;
  }
  return Math.round(total * 100) / 100;
}

function previewNode() {
  return h('div', { class: 'callout callout-subtle' },
    h('p', { class: 'small' }, 'Evaluating the portfolio against the structural model…'));
}

function renderPreview(node, ctx, levers, budget, weights, weeks) {
  const result = ctx.api.capitalPreview(levers, { weeks, budgetUnits: budget });
  if (!result || !result.ok) {
    node.replaceChildren(h('p', { class: 'small' }, result?.error || 'The model cannot be evaluated yet.'));
    return;
  }
  const { evaluation, effort } = result;
  const over = effort.total > budget + 0.01;
  node.replaceChildren(
    h('p', { class: 'small' },
      h('strong', null, 'Live model: '),
      `pressure ends at ${evaluation.scenario.summary.endSaturationPct}% (${evaluation.delta.saturationPct > 0 ? '+' : ''}${evaluation.delta.saturationPct} points vs doing nothing), `,
      `WIP ${evaluation.delta.wipDays > 0 ? '+' : ''}${evaluation.delta.wipDays} person-days, `,
      `throughput ${evaluation.delta.throughputDays > 0 ? '+' : ''}${evaluation.delta.throughputDays} person-days, `,
      `capacity ${evaluation.delta.capacityPerWeek > 0 ? '+' : ''}${evaluation.delta.capacityPerWeek} pd/week.`),
    h('div', { class: 'badge-row' },
      badge(`Effort ${effort.total} / ${budget} weeks`, over ? 'bad' : 'good'),
      badge(over ? 'Over budget — raise the budget or remove a lever' : 'Inside the effort budget', over ? 'bad' : 'good'),
      badge(evaluation.verdict === 'improves' ? 'Improves the structure'
        : evaluation.verdict === 'investment' ? 'Investment — pays back later'
          : evaluation.verdict === 'worsens' ? 'Makes it worse inside this horizon' : 'Neutral',
      evaluation.verdict === 'improves' ? 'good' : evaluation.verdict === 'worsens' ? 'bad' : 'warn')),
    h('p', { class: 'small muted' }, 'Effort costs are stated conventions. Change them in Model conventions if your implementation cost is different.'),
  );
}

/** Create or edit a funded capital portfolio. */
export function openCapitalPolicyDialog(ctx, {
  policy = null,
  preset = null,
  budgetUnits = CAP_DEFAULT_BUDGET_UNITS,
  weights = null,
  horizonWeeks = 26,
  onSaved = null,
} = {}) {
  const levers = policy?.levers || preset || {};
  const baseWeights = policy?.weights || weights || { saturation: 0.35, throughput: 0.25, capacity: 0.2, wip: 0.2 };
  const initialBudget = policy?.budgetUnits ?? budgetUnits;
  const fields = [
    { name: 'name', label: 'Portfolio name', type: 'text', required: true, value: policy?.name || '', placeholder: 'Cap intake and protect learning for two quarters' },
    {
      name: 'hypothesis',
      label: 'What this portfolio is expected to do',
      type: 'textarea',
      required: true,
      rows: 3,
      value: policy?.hypothesis || '',
      help: 'Write it so a later checkpoint could contradict it. “Things will improve” cannot be scored.',
    },
    { name: 'ownerId', label: 'Owner', type: 'select', options: ownerOptions(ctx, policy?.ownerId || ''), help: 'A portfolio without an owner cannot be adopted.' },
    { name: 'budgetUnits', label: 'Effort budget (weeks)', type: 'number', min: CAP_MIN_BUDGET_UNITS, max: CAP_MAX_BUDGET_UNITS, step: 1, value: initialBudget, help: 'The binding constraint. The allocator never recommends spending more than this.' },
    { name: 'horizonWeeks', label: 'Horizon (weeks)', type: 'number', min: DYN_MIN_HORIZON_WEEKS, max: DYN_MAX_HORIZON_WEEKS, step: 1, value: policy?.horizonWeeks ?? horizonWeeks },
    { name: 'checkpointOn', label: 'Checkpoint date (optional)', type: 'date', value: policy?.checkpointOn || '', help: 'The date the frozen prediction is scored. Defaults to the end of the horizon.' },
    { type: 'divider', label: 'Objective weights — conventions, normalised when saved' },
  ];
  for (const key of Object.keys(CAP_OBJECTIVE_LABELS)) {
    fields.push({
      name: `weight_${key}`,
      label: CAP_OBJECTIVE_LABELS[key],
      type: 'number', min: 0, max: 1, step: 0.05,
      value: baseWeights[key] ?? 0,
      help: 'Relative importance. The raw deltas are always reported beside the composite, so the weights cannot hide a trade-off.',
    });
  }
  fields.push({ type: 'divider', label: 'Funded levers — Meadows’ leverage hierarchy, weakest first' });
  for (const lever of DYN_LEVERS) {
    fields.push({
      name: `lever_${lever.key}`,
      label: `${lever.label} (${lever.unit})`,
      type: 'number',
      min: lever.min,
      max: lever.max,
      step: lever.step,
      value: levers[lever.key] ?? lever.default,
      help: `Leverage class ${lever.leverageClass} — ${lever.leverageLabel}. Effort ${CAP_EFFORT_BOOK[lever.key].effortPerUnit} weeks per unit.`,
    });
  }
  fields.push({ name: 'notes', label: 'Notes (optional)', type: 'textarea', rows: 2, value: policy?.notes || '' });

  const preview = previewNode();
  const dialog = formDialog({
    title: policy ? 'Edit capital portfolio' : 'Fund a structural portfolio',
    description: 'Only inputs are stored; the trajectory is recomputed from your records on every read. Nothing is applied to the workspace — the portfolio becomes a commitment only when you adopt it.',
    fields,
    submitLabel: policy ? 'Save changes' : 'Save draft portfolio',
    size: 'lg',
    bodyExtra: preview,
    onSubmit: (values, form, close) => {
      const payload = {
        id: policy?.id,
        name: values.name,
        hypothesis: values.hypothesis,
        ownerId: values.ownerId || null,
        budgetUnits: Number(values.budgetUnits),
        horizonWeeks: Number(values.horizonWeeks),
        checkpointOn: values.checkpointOn || null,
        weights: readWeights(values),
        levers: readLevers(values),
        notes: values.notes,
      };
      const result = ctx.api.saveCapitalPolicy(payload);
      if (!result.ok) {
        form.setErrors({ [result.field || 'name']: result.error });
        return;
      }
      close();
      toast('Portfolio saved as a draft. Adopt it to freeze the prediction.', 'good');
      if (typeof onSaved === 'function') onSaved(result.id);
    },
  });
  // Live preview: re-read the bound form on every change. The preview is a
  // convenience, so a failure here must never block saving the portfolio.
  const refresh = () => {
    try {
      const values = dialog.__form.getValues();
      renderPreview(
        preview,
        ctx,
        readLevers(values),
        Number(values.budgetUnits || initialBudget),
        readWeights(values),
        Number(values.horizonWeeks || horizonWeeks),
      );
    } catch {
      preview.replaceChildren(h('p', { class: 'small' }, 'The live preview is unavailable; the portfolio can still be saved.'));
    }
  };
  dialog.__form.node.addEventListener('change', refresh);
  dialog.__form.node.addEventListener('input', refresh);
  refresh();
  return dialog;
}

/** Adopt a portfolio: freeze the prediction, the baseline and the attribution. */
export function openCapitalAdoptDialog(ctx, policy, { onDone = null } = {}) {
  const report = ctx.api.capitalReport();
  const preview = report.adequate ? ctx.api.capitalPreview(policy.levers, { weeks: policy.horizonWeeks, budgetUnits: policy.budgetUnits }) : null;
  const consent = preview && preview.ok
    ? h('div', { class: 'callout callout-subtle' },
      h('p', { class: 'small' }, h('strong', null, 'Frozen at adoption: '),
        `${preview.evaluation.scenario.summary.endSaturationPct}% pressure, ${preview.evaluation.scenario.summary.endWipDays} person-days of WIP, ${preview.evaluation.scenario.summary.endCapacityPerWeek} person-days/week capacity at week ${preview.evaluation.scenario.horizonWeeks}.`),
      h('p', { class: 'small muted' },
        `Do-nothing baseline frozen alongside it: ${preview.evaluation.baseline.summary.endSaturationPct}% pressure, ${preview.evaluation.baseline.summary.endWipDays} person-days of WIP. Without that baseline the later checkpoint could report error but not skill.`),
      h('p', { class: 'small muted' }, `Model trust at adoption: ${report.trust.label}. ${report.trust.recommendation === 'actionable' ? 'The model has earned an actionable reading.' : 'Treat the numbers as a comparison, not a result.'}`))
    : h('p', { class: 'small' }, preview?.error || 'The model cannot be evaluated yet.');

  const fields = [
    {
      name: 'checkpointOn',
      label: 'Checkpoint date',
      type: 'date',
      value: policy.checkpointOn || '',
      help: 'When the realised stocks will be recorded and the prediction scored. Leave empty to default to the end of the horizon.',
    },
  ];
  return formDialog({
    title: `Adopt “${policy.name}”?`,
    description: 'Adoption is a dated commitment, not a toggle. It opens one DACI decision, one owned checkpoint and one review talking point in the same transaction.',
    fields,
    submitLabel: 'Adopt and freeze the prediction',
    bodyExtra: consent,
    onSubmit: (values, form, close) => {
      const result = ctx.api.adoptCapitalPolicy(policy.id, { checkpointOn: values.checkpointOn || null });
      if (!result.ok) {
        form.setErrors({ [result.field || 'checkpointOn']: result.error });
        return;
      }
      close();
      const propagated = Array.isArray(result.propagations) ? result.propagations.length : 0;
      toast(`Portfolio adopted.${propagated ? ` ${propagated} follow-up${propagated === 1 ? '' : 's'} propagated automatically.` : ''}`, 'good');
      if (typeof onDone === 'function') onDone();
    },
  });
}

/** Retire a portfolio with a dated reason. */
export function openCapitalRetireDialog(ctx, policy, { onDone = null } = {}) {
  return formDialog({
    title: `Retire “${policy.name}”?`,
    description: 'Retirement keeps the record, the frozen prediction and every checkpoint. The reason is what makes the next allocation smarter.',
    fields: [{
      name: 'note',
      label: 'Why is this being retired?',
      type: 'textarea',
      required: true,
      rows: 3,
      help: '“Did not work” is a start; “the intake cap cost us a regulatory commitment” is learning.',
    }],
    submitLabel: 'Retire portfolio',
    onSubmit: (values, form, close) => {
      const result = ctx.api.retireCapitalPolicy(policy.id, { note: values.note });
      if (!result.ok) {
        form.setErrors({ [result.field || 'note']: result.error });
        return;
      }
      close();
      toast('Portfolio retired with its reason on the record.', 'good');
      if (typeof onDone === 'function') onDone();
    },
  });
}

/** Record observed stocks — never a score. */
export function openCheckpointDialog(ctx, { subjectType, subjectId, label, checkpointOn = null }, { onDone = null } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const fields = [
    {
      name: 'recordedOn',
      label: 'Date the observations were taken',
      type: 'date',
      required: true,
      value: checkpointOn && checkpointOn <= today ? checkpointOn : today,
      help: 'A checkpoint cannot be dated in the future, and it cannot predate adoption.',
    },
    { type: 'divider', label: 'Observed end-state — leave blank anything you did not measure' },
  ];
  for (const stock of CHECKPOINT_STOCKS) {
    fields.push({
      name: `observed_${stock.key}`,
      label: `${stock.label} (${stock.unit})`,
      type: 'number',
      min: stock.min,
      max: stock.max,
      step: stock.dp === 0 ? 1 : 0.1,
      value: '',
      help: 'Recorded by a person, from the actual record. Blank stays blank; the score withholds any stock it cannot compute.',
    });
  }
  fields.push({ name: 'note', label: 'What happened (optional)', type: 'textarea', rows: 2, help: 'Context a future reader needs to interpret the score — a departure, a lost customer, a scope change.' });

  return formDialog({
    title: `Score the checkpoint for “${label}”`,
    description: 'The app scores this against the prediction and the do-nothing baseline frozen at adoption. You record what happened; the arithmetic is not negotiable.',
    fields,
    submitLabel: 'Record and score',
    size: 'lg',
    onSubmit: (values, form, close) => {
      const observed = {};
      for (const stock of CHECKPOINT_STOCKS) {
        const raw = values[`observed_${stock.key}`];
        if (raw === '' || raw === null || raw === undefined) continue;
        observed[stock.key] = Number(raw);
      }
      const result = ctx.api.recordDynamicsCheckpoint({
        subjectType,
        subjectId,
        recordedOn: values.recordedOn,
        observed,
        note: values.note,
      });
      if (!result.ok) {
        form.setErrors({ [result.field || 'recordedOn']: result.error });
        return;
      }
      const verdict = result.scoring?.verdict;
      toast(verdict === 'beats-persistence'
        ? 'Checkpoint scored: the frozen prediction beat naive persistence.'
        : verdict === 'no-better-than-persistence'
          ? 'Checkpoint scored: the prediction lost to “tomorrow equals today”. That is what the ledger is for.'
          : verdict === 'no-baseline'
            ? 'Checkpoint recorded. No frozen baseline, so the skill score is withheld.'
            : 'Checkpoint recorded and scored.', verdict === 'beats-persistence' ? 'good' : 'neutral');
      if (typeof onDone === 'function') onDone();
    },
  });
}

/** The allocation conventions: effort budget, objective weights, pause switch. */
export function openCapitalConventionsDialog(ctx, report, { onDone = null } = {}) {
  const settings = ctx.state.settings || {};
  const weights = {
    saturation: settings.capitalWeightSaturation ?? 0.35,
    throughput: settings.capitalWeightThroughput ?? 0.25,
    capacity: settings.capitalWeightCapacity ?? 0.2,
    wip: settings.capitalWeightWip ?? 0.2,
  };
  const fields = [
    {
      name: 'budgetUnits',
      label: 'Improvement budget (effort-weeks)',
      type: 'number', min: CAP_MIN_BUDGET_UNITS, max: CAP_MAX_BUDGET_UNITS, step: 1,
      value: settings.capitalEffortBudget ?? CAP_DEFAULT_BUDGET_UNITS,
      help: 'How much structured implementation effort you are willing to spend. The allocator treats it as a hard constraint.',
    },
    { type: 'divider', label: 'Objective weights (normalised when saved)' },
    ...Object.keys(CAP_OBJECTIVE_LABELS).map((key) => ({
      name: `weight_${key}`,
      label: CAP_OBJECTIVE_LABELS[key],
      type: 'number', min: 0, max: 1, step: 0.05,
      value: weights[key],
      help: key === 'throughput' ? 'Protecting throughput inside the horizon usually conflicts with investing in prevention. Both costs are reported.' : '',
    })),
    { type: 'divider', label: 'Automation' },
    {
      name: 'autoPropagate',
      label: 'Respond automatically when a portfolio is adopted',
      type: 'checkbox',
      value: settings.capitalAutoPropagate !== false,
      help: 'Off means only an explicit scan or an adoption you trigger runs the rules. Adoption always propagates; the switch pauses background scans.',
    },
  ];
  return formDialog({
    title: 'Allocation conventions',
    description: 'These are your declared preferences and effort costs, not measurements. They are shown on screen and stored with every portfolio, so a later reader can see what the answer depended on.',
    fields,
    submitLabel: 'Save conventions',
    onSubmit: (values, form, close) => {
      const result = ctx.api.setCapitalPolicy({
        budgetUnits: Number(values.budgetUnits),
        weights: readWeights(values),
        autoPropagate: values.autoPropagate === 'on' || values.autoPropagate === true,
      });
      if (!result.ok) {
        form.setErrors({ [result.field || 'budgetUnits']: result.error });
        return;
      }
      close();
      toast('Allocation conventions saved.', 'good');
      if (typeof onDone === 'function') onDone();
    },
  });
}
