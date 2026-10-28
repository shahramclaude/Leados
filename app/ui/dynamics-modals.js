/**
 * app/ui/dynamics-modals.js — Operating System Dynamics capture dialogs.
 *
 * The experiment dialog is a *policy designer*, not a form: every lever shows
 * its Meadows leverage class and the dialog recomputes the trajectory live, so
 * a leader sees the trade-off before committing to it. The adopt dialog shows
 * exactly what will be frozen, because the frozen prediction is what makes the
 * later review a comparison instead of a rewrite.
 */

import { h, buildForm, openModal, toast } from './dom.js';
import { badge } from './components.js';
import { DYN_LEVERS, DYN_MAX_HORIZON_WEEKS, DYN_MIN_HORIZON_WEEKS } from '../core/domain/dynamics.js';

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
  return dialog;
}

function ownerOptions(ctx, value) {
  const options = [{ value: '', label: 'No owner yet — the experiment cannot be adopted without one' }];
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

function previewNode() {
  return h('div', { class: 'callout callout-subtle' },
    h('p', { class: 'small' }, 'Loading the live preview…'));
}

function renderPreview(node, ctx, levers, weeks) {
  const result = ctx.api.dynamicPreview(levers, { weeks });
  if (!result || !result.ok) {
    node.replaceChildren(h('p', { class: 'small' }, result?.error || 'The model cannot be evaluated yet.'));
    return;
  }
  const { delta, scenario, verdict, strongestLeverage } = result.evaluation;
  node.replaceChildren(
    h('p', { class: 'small' },
      h('strong', null, 'Live model: '),
      `saturation ends at ${scenario.summary.endSaturationPct}% (${delta.saturationPct > 0 ? '+' : ''}${delta.saturationPct} points vs doing nothing), `,
      `work in progress ${delta.wipDays > 0 ? '+' : ''}${delta.wipDays} person-days, `,
      `dependency ${delta.dependencyPct > 0 ? '+' : ''}${delta.dependencyPct} points.`),
    h('div', { class: 'badge-row' },
      badge(verdict === 'improves' ? 'Improves the structure' : verdict === 'worsens' ? 'Makes it worse inside this horizon' : verdict === 'investment' ? 'Investment — pays back after this horizon' : 'Neutral', verdict === 'improves' ? 'good' : verdict === 'worsens' ? 'bad' : 'warn'),
      strongestLeverage ? badge(strongestLeverage.leverageLabel, 'neutral') : null),
    strongestLeverage ? h('p', { class: 'small muted' }, strongestLeverage.mechanism) : null,
  );
}

/** Create or edit a structural policy experiment. */
export function openExperimentDialog(ctx, { experiment = null, onSaved = null } = {}) {
  const levers = experiment?.levers || {};
  const fields = [
    { name: 'name', label: 'Experiment name', type: 'text', required: true, value: experiment?.name || '', placeholder: 'Cap WIP before hiring' },
    {
      name: 'hypothesis',
      label: 'Falsifiable expectation',
      type: 'textarea',
      required: true,
      rows: 3,
      value: experiment?.hypothesis || '',
      help: 'Write what you expect to happen and by when, in a form a later review could contradict. “Things will improve” is not testable.',
    },
    { name: 'ownerId', label: 'Owner', type: 'select', options: ownerOptions(ctx, experiment?.ownerId || ''), help: 'An experiment without an owner cannot be adopted.' },
    { name: 'horizonWeeks', label: 'Horizon (weeks)', type: 'number', min: DYN_MIN_HORIZON_WEEKS, max: DYN_MAX_HORIZON_WEEKS, step: 1, value: experiment?.horizonWeeks ?? 26 },
    { name: 'checkpointOn', label: 'Checkpoint date (optional)', type: 'date', value: experiment?.checkpointOn || '', help: 'The date the review compares the frozen prediction with what happened. Defaults to the end of the horizon.' },
    { name: 'notes', label: 'Notes (optional)', type: 'textarea', rows: 2, value: experiment?.notes || '' },
    { type: 'divider', label: 'Policy levers — Meadows’ leverage hierarchy, weakest first' },
  ];
  for (const lever of DYN_LEVERS) {
    fields.push({
      name: `lever_${lever.key}`,
      label: `${lever.label} (${lever.unit})`,
      type: 'number',
      min: lever.min,
      max: lever.max,
      step: lever.step,
      value: levers[lever.key] ?? lever.default,
      help: `Leverage class ${lever.leverageClass} — ${lever.leverageLabel}. ${lever.mechanism}`,
    });
  }
  const preview = previewNode();
  const dialog = formDialog({
    title: experiment ? 'Edit structural experiment' : 'Design a structural experiment',
    description: 'A policy experiment changes how the system behaves, not how hard people work. Nothing is applied to the real workspace: it is simulated against the model derived from your own records, and adopted only when you say so.',
    fields,
    submitLabel: experiment ? 'Save changes' : 'Create experiment',
    size: 'lg',
    bodyExtra: preview,
    onSubmit: (values, form, close) => {
      const payload = {
        id: experiment?.id,
        name: values.name,
        hypothesis: values.hypothesis,
        ownerId: values.ownerId || null,
        horizonWeeks: values.horizonWeeks,
        checkpointOn: values.checkpointOn || null,
        notes: values.notes,
        levers: readLevers(values),
      };
      const result = ctx.api.saveDynamicsExperiment(payload);
      if (!result.ok) {
        form.setErrors({ [result.field || 'name']: result.error });
        return;
      }
      close();
      toast(experiment ? 'Experiment updated.' : 'Experiment created as a draft.', 'good');
      if (typeof onSaved === 'function') onSaved();
    },
  });
  const form = dialog.body.querySelector('form');
  if (form) {
    const update = () => {
      const values = Object.fromEntries(new FormData(form).entries());
      renderPreview(preview, ctx, readLevers(values), Number(values.horizonWeeks) || 26);
    };
    form.addEventListener('input', update);
    form.addEventListener('change', update);
  }
  renderPreview(preview, ctx, readLevers(experiment ? Object.fromEntries(DYN_LEVERS.map((l) => [`lever_${l.key}`, l.default])) : {}), experiment?.horizonWeeks || 26);
  return dialog;
}

/** Adopt an experiment and freeze its prediction. */
export function openAdoptDialog(ctx, experiment, { onDone = null } = {}) {
  const preview = ctx.api.dynamicPreview(experiment.levers, { weeks: experiment.horizonWeeks });
  const body = h('div', { class: 'view-stack' },
    h('p', { class: 'small' }, 'Adopting freezes the modelled end-state below. Later, the checkpoint compares that frozen expectation with what actually happened — you will not be able to revise it after the fact.'),
    preview.ok
      ? h('div', { class: 'callout callout-subtle' },
        h('p', { class: 'small' }, h('strong', null, 'Prediction to be frozen: '),
          `${preview.evaluation.scenario.summary.endSaturationPct}% saturation, ${preview.evaluation.scenario.summary.endWipDays} person-days of WIP, ${preview.evaluation.scenario.summary.endCapacityPerWeek} person-days/week capacity at week ${preview.evaluation.scenario.horizonWeeks}.`),
        h('p', { class: 'small muted' }, `Against doing nothing: ${preview.evaluation.delta.saturationPct > 0 ? '+' : ''}${preview.evaluation.delta.saturationPct} saturation points. Verdict: ${preview.evaluation.verdict}.`))
      : h('p', { class: 'small' }, preview.error || 'The model cannot be evaluated yet.'),
    h('p', { class: 'small muted' }, 'Adoption also opens one owned checkpoint delegation carrying this prediction, so the review happens even if this screen is never opened again.'),
  );
  const cancel = h('button', { class: 'btn btn-ghost', type: 'button' }, 'Cancel');
  const confirm = h('button', { class: 'btn btn-primary', type: 'button' }, 'Adopt and freeze the prediction');
  const dialog = openModal({
    title: `Adopt “${experiment.name}”?`,
    description: 'Adoption is a commitment with a date, not a toggle.',
    body,
    footer: [cancel, confirm],
    size: 'md',
  });
  cancel.addEventListener('click', () => dialog.close());
  confirm.addEventListener('click', () => {
    const result = ctx.api.adoptDynamicsExperiment(experiment.id, { checkpointOn: experiment.checkpointOn });
    if (!result.ok) {
      toast(result.error, 'bad');
      return;
    }
    dialog.close();
    const propagated = Array.isArray(result.propagations) ? result.propagations.length : 0;
    toast(`Experiment adopted.${propagated ? ` ${propagated} follow-up${propagated === 1 ? '' : 's'} propagated automatically.` : ''}`, 'good');
    if (typeof onDone === 'function') onDone();
  });
  return dialog;
}

/** Retire an experiment with a dated reason. */
export function openRetireDialog(ctx, experiment, { onDone = null } = {}) {
  const dialog = formDialog({
    title: `Retire “${experiment.name}”?`,
    description: 'Retirement keeps the record. The reason is what makes the next person’s experiment smarter.',
    fields: [
      {
        name: 'note', label: 'Why is this being retired?', type: 'textarea', required: true, rows: 3,
        help: 'What did you learn? “Did not work” is a start; “the cap cost us a customer commitment” is learning.',
      },
    ],
    submitLabel: 'Retire experiment',
    onSubmit: (values, form, close) => {
      const result = ctx.api.retireDynamicsExperiment(experiment.id, { note: values.note });
      if (!result.ok) {
        form.setErrors({ [result.field || 'note']: result.error });
        return;
      }
      close();
      toast('Experiment retired with its reason on the record.', 'good');
      if (typeof onDone === 'function') onDone();
    },
  });
  return dialog;
}

/** Model conventions — the leader's own, not constants. */
export function openConventionsDialog(ctx, report, { onDone = null } = {}) {
  const s = ctx.state.settings || {};
  return formDialog({
    title: 'Model conventions',
    description: 'These are the assumptions the model cannot derive from your records. Every one of them is labelled “assumed” in the provenance table, so changing them is visible rather than hidden.',
    fields: [
      { name: 'horizonWeeks', label: 'Simulated horizon (weeks)', type: 'number', min: 4, max: 52, step: 1, value: s.dynamicsHorizonWeeks ?? 26 },
      { name: 'targetWipWeeks', label: 'Healthy work in progress (weeks of capacity)', type: 'number', min: 1, max: 12, step: 1, value: s.dynamicsTargetWipWeeks ?? 4, help: 'Pressure is WIP ÷ (capacity × this). 100% means fully committed; above that means overloaded.' },
      { name: 'pressureLagWeeks', label: 'Delay before pressure becomes errors and exits (weeks)', type: 'number', min: 1, max: 12, step: 1, value: s.dynamicsPressureLagWeeks ?? 3 },
      { name: 'qualityFixWeeks', label: 'Quality debt repayment (weeks of repair capacity)', type: 'number', min: 2, max: 26, step: 1, value: s.dynamicsQualityFixWeeks ?? 6 },
      { name: 'rampWeeks', label: 'New-joiner ramp window (weeks)', type: 'number', min: 2, max: 26, step: 1, value: s.dynamicsRampWeeks ?? 12 },
      { name: 'structuralRiskPct', label: 'Structural-risk threshold for opening a decision', type: 'number', min: 30, max: 95, step: 1, value: s.dynamicsStructuralRiskPct ?? 65 },
      { name: 'autoPropagate', label: 'Respond automatically to operational events', type: 'checkbox', value: s.dynamicsAutoPropagate !== false, help: 'Off means only an explicit scan runs. An explicit scan always runs.' },
    ],
    submitLabel: 'Save conventions',
    onSubmit: (values, form, close) => {
      const result = ctx.api.setDynamicsPolicy({
        horizonWeeks: values.horizonWeeks,
        targetWipWeeks: values.targetWipWeeks,
        pressureLagWeeks: values.pressureLagWeeks,
        qualityFixWeeks: values.qualityFixWeeks,
        rampWeeks: values.rampWeeks,
        structuralRiskPct: values.structuralRiskPct,
        autoPropagate: values.autoPropagate === 'on' || values.autoPropagate === true,
      });
      if (!result.ok) {
        form.setErrors({ [result.field || 'horizonWeeks']: result.error });
        return;
      }
      close();
      toast('Model conventions saved.', 'good');
      if (typeof onDone === 'function') onDone();
    },
  });
}
