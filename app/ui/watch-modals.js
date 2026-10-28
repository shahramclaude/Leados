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
      + `natural limits ${num(alert.lnpl)}–${num(alert.unpl)}. Nominal score ${num(alert.pValue, 4)}, `
      + `step-up rank ${alert.bhRank ?? '—'} of ${alert.m ?? '—'} at q ${alert.q ?? '—'}. These are heuristic screening scores, not a verified error rate.`),
    h('p', { class: 'small' },
      frozen
        ? `Frozen prediction: ${num(frozen.point)} (band ${num(frozen.lo)}–${num(frozen.hi)}), due ${frozen.dueOn}. `
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
      help: 'Only confirmation opens a case. Separate monitoring-governance rules may create decisions.',
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
  const optionList = (rows, label) => [{ value: '', label }, ...rows];
  fields.push(
    { name: 'responseHeading', type: 'static', label: 'Optional response context — only for Confirmed',
      value: h('p', { class: 'small' }, 'Use recorded context to connect this case. Nothing is inferred from the chart. Leave any section blank if unknown.') },
    { name: 'ownerId', label: 'Response owner', type: 'select', options: optionList(
      (ctx.state.people || []).filter((p) => p.status === 'active').map((p) => ({ value: p.id, label: p.name })), 'No owner selected'),
      help: 'An active owner can receive a linked delegation and coaching topic.' },
    { name: 'goalId', label: 'Affected goal', type: 'select', options: optionList(
      (ctx.state.goals || []).filter((g) => g.status === 'active').map((g) => ({ value: g.id, label: g.title })), 'No goal selected') },
    { name: 'stakeholderId', label: 'Stakeholder to involve', type: 'select', options: optionList(
      (ctx.state.stakeholders || []).filter((s) => s.status === 'active').map((s) => ({ value: s.id, label: s.name })), 'No stakeholder selected'),
      help: 'A relevant high-power or opposing stakeholder may receive a local, unsent brief draft.' },
    { name: 'responseAction', label: 'First response action (optional)', type: 'text', value: '',
      help: 'Used for the case and any delegation; a generic investigation is suggested when blank.' },
    { name: 'createDecision', label: 'Prepare a response decision', type: 'checkbox', value: false,
      checkboxLabel: 'Create an open DACI decision for this response',
      help: 'This records options; it does not choose or execute one.' },
    { name: 'fmeaHeading', type: 'static', label: 'Optional FMEA and capacity',
      value: h('p', { class: 'small' }, 'If rating, enter all three whole numbers (1–10). A three-point person-day estimate requires all three ratings; never guess to fill a field.') },
    { name: 'severity', label: 'Severity (1–10)', type: 'number', min: 1, max: 10, step: 1, value: '' },
    { name: 'probability', label: 'Occurrence (1–10)', type: 'number', min: 1, max: 10, step: 1, value: '' },
    { name: 'detectability', label: 'Detection difficulty (1–10)', type: 'number', min: 1, max: 10, step: 1, value: '' },
    { name: 'capacityOptimistic', label: 'Capacity: optimistic person-days', type: 'number', min: 0, step: 0.1, value: '' },
    { name: 'capacityMostLikely', label: 'Capacity: most likely person-days', type: 'number', min: 0, step: 0.1, value: '' },
    { name: 'capacityPessimistic', label: 'Capacity: pessimistic person-days', type: 'number', min: 0, step: 0.1, value: '',
      help: 'All three must be non-negative and ordered. A real estimate can reserve capacity; an empty field is not zero evidence.' },
  );
  return formDialog({
    title: `Judge the ${alert.label} signal`,
    description: 'One way only: a verdict cannot be edited later, because a detector whose history can be rewritten measures nothing.',
    fields,
    submitLabel: 'Record verdict',
    size: 'lg',
    bodyExtra: evidence,
    onSubmit: (values, form, close) => {
      form.clearErrors();
      const result = ctx.api.triageWatchAlert(alert.id, {
        verdict: values.verdict, note: values.note,
        response: {
          ownerId: values.ownerId, goalId: values.goalId, stakeholderId: values.stakeholderId,
          responseAction: values.responseAction, createDecision: values.createDecision,
          fmea: { severity: values.severity, probability: values.probability, detectability: values.detectability },
          capacity: { optimistic: values.capacityOptimistic, mostLikely: values.capacityMostLikely, pessimistic: values.capacityPessimistic },
        },
      });
      if (!result.ok) { fieldError(form, result); return; }
      if (values.verdict === 'confirmed' && result.linkedCaseId && result.automationWarnings) {
        toast('Case saved, but some follow-through failed. Use Refresh follow-through in Judged alerts; no message was sent.', 'bad');
      } else if (values.verdict === 'confirmed' && result.linkedCaseId) {
        const propagated = Array.isArray(result.propagations) ? result.propagations.length : 0;
        toast(`Confirmed. A case was opened with ${propagated} recorded automation effect(s).`, 'good');
      } else if (values.verdict === 'confirmed') {
        toast('Verdict saved, but case promotion failed. Use Retry in Judged alerts; your response context is retained.', 'bad');
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
      label: 'Nominal step-up q (0.01–0.5)',
      type: 'number',
      min: 0.01,
      max: 0.5,
      step: 0.01,
      value: policy.q,
      help: 'A ranking threshold, not a guaranteed share of false alerts. Repeated scans and overlapping series invalidate a simple error-rate interpretation.',
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
      options: [{ value: 'on', label: 'On — automatic scans and governance' }, { value: 'off', label: 'Paused — automatic scans stop' }],
      help: 'Existing alerts and verdicts remain visible. Explicit scans still run sensing and governance; human confirmation still opens a case.',
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
