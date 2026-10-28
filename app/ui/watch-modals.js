/**
 * app/ui/watch-modals.js — Early-Warning Watch capture dialogs.
 *
 * Two dialogs, both intentionally blunt:
 *
 *  - `openVerdictDialog` asks the one question the whole module exists to ask:
 *    is this signal real? It shows the exact statistics that promoted the alert
 *    and the prediction frozen at detection, then records an irreversible
 *    verdict. The confirm option is worded with its consequence ("opens an
 *    operational case") so nobody can click it casually.
 *  - `openWatchPolicyDialog` edits the detection policy and previews the
 *    trade-off in plain words: a looser q catches more and cries wolf more.
 */

import { h, buildForm, openModal, toast } from './dom.js';
import { EW_VERDICT_LABELS, EW_VERDICTS } from '../core/domain/watchRegistry.js';
import { readWatchPolicy } from '../core/domain/earlyWarning.js';

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
  const dialog = openModal({
    title,
    description,
    body: h('div', { class: 'view-stack' }, form.node, bodyExtra),
    footer: [cancelBtn, submitBtn],
    size,
    onClose: () => form.clearErrors(),
  });
  closeFn = dialog.close;
  return dialog;
}

function fieldError(form, result) {
  if (result.field && form.field(result.field)) form.setFieldError(result.field, result.error);
  else toast(result.error || 'Could not save.', 'bad');
}

const num = (v, d = 2) => (Number.isFinite(v) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: d }).format(v) : '—');

/** Record the one-way verdict on a promoted alert. */
export function openVerdictDialog(ctx, alert) {
  const frozen = alert.frozen || null;
  const evidence = h('div', { class: 'callout' },
    h('strong', null, 'What the detector actually claimed'),
    h('p', { class: 'small' },
      `${alert.rule} on ${alert.detectedOn}: value ${num(alert.latestValue)}, centre line ${num(alert.mean)}, `
      + `natural limits ${num(alert.lnpl)}–${num(alert.unpl)}. Series p ${num(alert.pValue, 4)}, `
      + `Benjamini–Hochberg rank ${alert.bhRank ?? '—'} of ${alert.m ?? '—'} at q ${alert.q ?? '—'}.`),
    h('p', { class: 'small' },
      frozen
        ? `Frozen next-week prediction: ${num(frozen.point)} (band ${num(frozen.lo)}–${num(frozen.hi)}), due ${frozen.dueOn}. `
          + `Naive baseline (this week repeats): ${num(frozen.baselinePoint)}.`
        : 'No prediction was frozen for this alert, so it can never be scored.'),
    h('p', { class: 'muted small' },
      'You are grading the detector, not the team. “Explained” and “dismissed” are excluded from the precision score '
      + 'because neither is a claim about whether the statistics were right.'),
  );
  const fields = [
    {
      name: 'verdict',
      label: 'What is this signal?',
      type: 'select',
      required: true,
      value: 'confirmed',
      options: EW_VERDICTS.map((v) => ({
        value: v,
        label: v === 'confirmed'
          ? `${EW_VERDICT_LABELS[v]} — opens one operational case`
          : v === 'false-alarm'
            ? `${EW_VERDICT_LABELS[v]} — counts against the detector`
            : EW_VERDICT_LABELS[v],
      })),
      help: 'Confirming is the only option that creates work elsewhere. The rest only correct the record.',
    },
    {
      name: 'note',
      label: 'Why (optional, 600 characters)',
      type: 'textarea',
      rows: 3,
      value: '',
      placeholder: 'e.g. The migration shipped that week; the queue drained after the rollback.',
      help: 'Kept locally in the alert ledger and never exported by any CSV scope.',
    },
  ];
  return formDialog({
    title: `Judge the ${alert.label} signal`,
    description: 'One way only: a verdict cannot be edited later, because a detector whose history can be rewritten measures nothing.',
    fields,
    submitLabel: 'Record verdict',
    size: 'md',
    bodyExtra: evidence,
    onSubmit: (values, form, close) => {
      form.clearErrors();
      const result = ctx.api.triageWatchAlert(alert.id, { verdict: values.verdict, note: values.note });
      if (!result.ok) { fieldError(form, result); return; }
      if (values.verdict === 'confirmed') {
        const propagated = Array.isArray(result.propagations) ? result.propagations.length : 0;
        toast(propagated
          ? `Confirmed. An operational case was opened and ${propagated} cross-module effect(s) propagated.`
          : 'Confirmed. The case and its follow-through were created.', 'good');
      } else {
        toast('Verdict recorded. The precision ledger is updated.', 'good');
      }
      close();
      ctx.refresh();
    },
  });
}

/** Edit the detection policy, with the trade-off written out. */
export function openWatchPolicyDialog(ctx) {
  const settings = ctx.state.settings || {};
  const policy = readWatchPolicy(settings);
  const fields = [
    {
      name: 'q',
      label: 'False-discovery target q (0.01–0.5)',
      type: 'number',
      min: 0.01,
      max: 0.5,
      step: 0.01,
      value: policy.q,
      help: 'The share of promoted alerts you are willing to have turn out to be noise. This is a scan-level rate, not a per-chart α.',
    },
    {
      name: 'budget',
      label: 'Alert budget (1–20 per window)',
      type: 'number',
      min: 1,
      max: 20,
      step: 1,
      value: policy.budget,
      help: 'Candidates beyond the budget are recorded as suppressed, not discarded — you will see them in the ledger.',
    },
    {
      name: 'windowDays',
      label: 'Budget window (days)',
      type: 'number',
      min: 7,
      max: 90,
      step: 1,
      value: policy.windowDays,
    },
    {
      name: 'triageDays',
      label: 'Triage deadline (days)',
      type: 'number',
      min: 1,
      max: 30,
      step: 1,
      value: policy.triageDays,
      help: 'An alert left open past this opens one DACI decision, because a signal nobody judges trains you to ignore the next one.',
    },
    {
      name: 'cooldownDays',
      label: 'Per-series cooldown (days)',
      type: 'number',
      min: 0,
      max: 60,
      step: 1,
      value: policy.cooldownDays,
    },
    {
      name: 'autoPropagate',
      label: 'Cross-module propagation',
      type: 'select',
      value: policy.autoPropagate ? 'on' : 'off',
      options: [{ value: 'on', label: 'On — verdicts and deadlines create records' }, { value: 'off', label: 'Paused — sensing only' }],
      help: 'Pausing never hides a signal: the scan, the ledger and the verdict buttons all keep working. An explicit scan always runs.',
    },
  ];
  return formDialog({
    title: 'Early-warning policy',
    description: 'These are conventions, not measurements. They are shown on screen, clamped on load, and every effect is printed.',
    fields,
    submitLabel: 'Save policy',
    size: 'lg',
    onSubmit: (values, form, close) => {
      form.clearErrors();
      const result = ctx.api.setWatchPolicy({
        q: Number(values.q),
        budget: Number(values.budget),
        windowDays: Number(values.windowDays),
        triageDays: Number(values.triageDays),
        cooldownDays: Number(values.cooldownDays),
        autoPropagate: values.autoPropagate === 'on',
      });
      if (!result.ok) { fieldError(form, result); return; }
      toast('Policy saved. The next scan uses it immediately.', 'good');
      close();
      ctx.refresh();
    },
  });
}
