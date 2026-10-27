/**
 * app/ui/premise-modals.js — Assumption Ledger capture dialogs.
 *
 * The register dialog uses a pre-mortem frame ("assume this already failed")
 * rather than a generic risk prompt. The evidence dialog previews the exact
 * posterior before the observation is committed, so a leader can see what a
 * strong claim will do. The review dialog forces a dated human disposition:
 * reaffirm, retire or reopen. Every mutation goes through `ctx.api`.
 */

import { h, buildForm, openModal, toast } from './dom.js';
import { addDays, dayKey } from '../core/time.js';
import {
  PREMISE_CRITICALITIES,
  PREMISE_CRITICALITY_LABELS,
  PREMISE_EVIDENCE_STRENGTH_LABELS,
  PREMISE_EVIDENCE_STRENGTHS,
  PREMISE_SOURCE_COLLECTIONS,
  PREMISE_SOURCE_TYPES,
  PREMISE_STATUS_LABELS,
  evaluatePremiseCore,
  previewPremiseEvidence,
} from '../core/domain/premises.js';

const SOURCE_LABELS = {
  case: 'Case', dependency: 'Dependency', budget: 'Budget', portfolio: 'Work item',
  stakeholder: 'Stakeholder', forecast: 'Forecast challenge', person: 'Person',
  goal: 'Goal', negotiation: 'Negotiation', change: 'Change', delegation: 'Delegation',
  impact: 'Impact study',
};

function sourceOptions(state) {
  const options = [{ value: '', label: 'No extra source — use the decision’s typed graph' }];
  for (const type of PREMISE_SOURCE_TYPES) {
    if (type === 'decision') continue;
    const collection = PREMISE_SOURCE_COLLECTIONS[type];
    const records = Array.isArray(state[collection]) ? state[collection] : [];
    for (const record of records.slice(0, 80)) {
      if (!record || !record.id) continue;
      const label = record.title || record.name || record.subject || record.id;
      options.push({ value: `${type}::${record.id}`, label: `${SOURCE_LABELS[type] || type} · ${String(label).slice(0, 100)}` });
    }
  }
  return options;
}

function parseSourceRef(value) {
  const text = String(value || '');
  const split = text.indexOf('::');
  if (split <= 0) return null;
  return { sourceType: text.slice(0, split), sourceId: text.slice(split + 2) };
}

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

function fieldError(form, result) {
  if (result.field && form.field(result.field)) form.setFieldError(result.field, result.error);
  else if (result.field === 'sourceRefs' && form.field('sourceRef')) form.setFieldError('sourceRef', result.error);
  toast(result.error || 'Could not save the premise.', 'bad');
}

/** Register or edit one load-bearing assumption and its signpost. */
export function openPremiseDialog(ctx, { premise = null } = {}) {
  const state = ctx.state;
  const settings = state.settings || {};
  const isEdit = Boolean(premise);
  const today = dayKey(ctx.now) || new Date().toISOString().slice(0, 10);
  const decisionOptions = [
    { value: '', label: 'No decision anchor — use an attached evidence source' },
    ...(state.decisions || []).map((d) => ({ value: d.id, label: d.title || d.question?.slice(0, 80) || d.id })),
  ];
  const ownerOptions = [
    { value: '', label: 'Unassigned (leader owns the signpost)' },
    ...(state.people || []).filter((p) => p && p.status !== 'archived')
      .map((p) => ({ value: p.id, label: p.name || p.id })),
  ];
  const sources = sourceOptions(state);
  const firstRef = Array.isArray(premise?.sourceRefs) ? premise.sourceRefs[0] : null;
  const currentSource = firstRef ? `${firstRef.sourceType}::${firstRef.sourceId}` : '';
  const fields = [
    { name: 'title', label: 'Assumption name', required: true, value: premise?.title || '', placeholder: 'e.g. Vendor failover survives a regional outage' },
    { name: 'statement', label: 'Falsifiable premise', type: 'textarea', rows: 3, required: true, value: premise?.statement || '', placeholder: 'State what must remain true for the decision to keep working — in a form a record could disprove.', help: 'A premise is not a value or a goal. “The failover runbook works in under two hours” is falsifiable; “we care about reliability” is not.' },
    { name: 'signpost', label: 'Pre-mortem signpost', type: 'textarea', rows: 3, required: true, value: premise?.signpost || '', placeholder: 'Assume this premise already failed. Which dated case, budget, dependency, stakeholder or review record would have warned you first?', help: 'Klein/Kahneman prospective hindsight: imagining the failure as certain legitimises doubts before commitment. This is a prompt, not evidence that the plan is safer.' },
    { name: 'decisionId', label: 'Decision this premise supports', type: 'select', value: premise?.decisionId || '', options: decisionOptions },
    { name: 'sourceRef', label: 'Attach an evidence source', type: 'select', value: currentSource, options: sources, help: 'The engine also walks two hops of the typed relationship graph from the decision, so linked records are discovered without re-entry.' },
    { name: 'ownerId', label: 'Signpost owner', type: 'select', value: premise?.ownerId || '', options: ownerOptions },
    { name: 'criticality', label: 'Criticality', type: 'select', value: premise?.criticality || 'load-bearing', options: PREMISE_CRITICALITIES.map((c) => ({ value: c, label: PREMISE_CRITICALITY_LABELS[c] })) },
    { name: 'priorPct', label: 'Prior belief (%)', type: 'number', min: 5, max: 95, step: 1, value: premise?.priorPct ?? 70, help: '5–95% (Cromwell’s rule). This is your pre-registered belief before the evidence below arrives — not a score the app invents.' },
    { name: 'watchPct', label: 'Watch threshold (%)', type: 'number', min: 10, max: 90, step: 1, value: premise?.watchPct ?? settings.premiseWatchPct ?? 55 },
    { name: 'breachPct', label: 'Breach threshold (%)', type: 'number', min: 5, max: 85, step: 1, value: premise?.breachPct ?? settings.premiseBreachPct ?? 30, help: 'Must be below the watch threshold. Crossing it opens one governed re-decision, not an automatic reversal.' },
    { name: 'halfLifeDays', label: 'Evidence half-life (days)', type: 'number', min: 7, max: 365, step: 1, value: premise?.halfLifeDays ?? settings.premiseHalfLifeDays ?? 90 },
    { name: 'reviewBy', label: 'Next signpost review', type: 'date', value: premise?.reviewBy || addDays(today, settings.premiseReviewDays ?? 30) },
  ];
  const explainer = h('div', { class: 'callout' },
    h('strong', null, 'What happens after you save'),
    h('p', { class: 'small' }, 'The sensor registry reads dated facts from scoped records and turns each into one likelihood-ratio observation. Your belief is updated in log-odds; older evidence is discounted by the half-life. A fresh breach opens one four-option DACI re-decision, one verification delegation and one blameless 1:1 prompt. Nothing reverses the original decision automatically.'),
    h('p', { class: 'muted small' }, 'Wald-style boundaries use α=0.10, β=0.20. They are a sequential-evidence discipline on heterogeneous records, not a formal p-value.'),
  );
  return formDialog({
    title: isEdit ? `Edit “${premise.title}”` : 'Pre-register a load-bearing assumption',
    description: isEdit ? 'Edits are audited; evidence history is never rewritten.' : 'Write down what would have to stay true before the next commitment.',
    fields,
    submitLabel: isEdit ? 'Save changes' : 'Register premise',
    size: 'lg',
    bodyExtra: explainer,
    onSubmit: (values, form, close) => {
      form.clearErrors();
      const selectedRef = parseSourceRef(values.sourceRef);
      const existingRefs = isEdit && Array.isArray(premise.sourceRefs) ? premise.sourceRefs : [];
      const sourceRefs = selectedRef
        ? [selectedRef, ...existingRefs.filter((r) => `${r.sourceType}::${r.sourceId}` !== values.sourceRef)].slice(0, 12)
        : existingRefs;
      const payload = {
        title: values.title,
        statement: values.statement,
        signpost: values.signpost,
        decisionId: values.decisionId,
        ownerId: values.ownerId,
        criticality: values.criticality,
        priorPct: Number(values.priorPct),
        watchPct: Number(values.watchPct),
        breachPct: Number(values.breachPct),
        halfLifeDays: Number(values.halfLifeDays),
        reviewBy: values.reviewBy,
        sourceRefs,
      };
      const result = isEdit ? ctx.api.updatePremise(premise.id, payload) : ctx.api.addPremise(payload);
      if (!result.ok) { fieldError(form, result); return; }
      const n = Array.isArray(result.propagations) ? result.propagations.length : 0;
      toast(n ? `Premise saved; ${n} cross-module effect(s) propagated.` : 'Premise saved; signpost sensing is live.', 'good');
      close();
      ctx.refresh();
    },
  });
}

/** Record a human observation and preview its exact effect before saving. */
export function openPremiseEvidenceDialog(ctx, { premise }) {
  const today = dayKey(ctx.now) || new Date().toISOString().slice(0, 10);
  const fields = [
    { name: 'title', label: 'Observation', required: true, value: '', placeholder: 'e.g. Regional failover drill exceeded the two-hour survival window' },
    { name: 'direction', label: 'Effect on the premise', type: 'select', value: 'against', options: [{ value: 'against', label: 'Challenges the premise' }, { value: 'for', label: 'Supports the premise' }] },
    { name: 'strength', label: 'Evidence strength', type: 'select', value: 'moderate', options: Object.keys(PREMISE_EVIDENCE_STRENGTHS).map((s) => ({ value: s, label: PREMISE_EVIDENCE_STRENGTH_LABELS[s] })), help: 'Weak LR 1.5 · moderate LR 3 · strong LR 6. These are transparent conventions, not calibrated likelihoods.' },
    { name: 'observedOn', label: 'Observed on', type: 'date', value: today },
    { name: 'note', label: 'Context (optional)', type: 'textarea', rows: 2, value: '', placeholder: 'What record or conversation is this based on?' },
  ];
  const before = evaluatePremiseCore(premise, { now: ctx.now, settings: ctx.state.settings });
  const preview = h('div', { class: 'callout', 'aria-live': 'polite' });
  const renderPreview = (values) => {
    const after = previewPremiseEvidence(premise, values, { now: ctx.now, settings: ctx.state.settings });
    preview.replaceChildren(
      h('strong', null, 'Belief preview (no write yet)'),
      h('p', { class: 'small' }, `${before.posteriorPct}% → ${after.posteriorPct}% · Bayes factor ${after.bayesFactor} · ${PREMISE_STATUS_LABELS[after.status] || after.status}`),
      h('p', { class: 'muted small' }, `Prior ${after.priorPct}% · watch ${after.watchPct}% · breach ${after.breachPct}% · ${after.evidenceCount} observation(s) · ${after.confidence} confidence.`),
    );
  };
  const dialog = formDialog({
    title: `Record evidence for “${premise.title}”`,
    description: 'Dated, directional and strength-graded. Sensor observations are added automatically by the event spine.',
    fields,
    submitLabel: 'Commit observation',
    onSubmit: (values, form, close) => {
      form.clearErrors();
      const result = ctx.api.recordPremiseEvidence(premise.id, values);
      if (!result.ok) { fieldError(form, result); return; }
      const n = Array.isArray(result.propagations) ? result.propagations.length : 0;
      toast(n ? `Observation committed; ${n} cross-module effect(s) propagated.` : 'Observation committed.', 'good');
      close();
      ctx.refresh();
    },
  });
  const form = dialog.dialog.querySelector('form');
  for (const name of ['direction', 'strength', 'observedOn', 'title', 'note']) {
    const input = form?.querySelector(`[name="${name}"]`);
    if (!input) continue;
    const read = () => Object.fromEntries(new FormData(form).entries());
    input.addEventListener('input', () => renderPreview(read()));
    input.addEventListener('change', () => renderPreview(read()));
  }
  renderPreview(Object.fromEntries(new FormData(form).entries()));
  return dialog;
}

/** Reaffirm, retire or reopen a premise with an explicit dated note. */
export function openPremiseReviewDialog(ctx, { premise }) {
  const today = dayKey(ctx.now) || new Date().toISOString().slice(0, 10);
  const evaluation = evaluatePremiseCore(premise, { now: ctx.now, settings: ctx.state.settings });
  const fields = [
    { name: 'disposition', label: 'Decision after review', type: 'select', value: 'reaffirm', options: [
      { value: 'reaffirm', label: 'Reaffirm — acknowledge evidence, keep monitoring' },
      { value: 'retire', label: 'Retire — the premise is no longer relevant' },
      { value: 'reopen', label: 'Reopen — keep the current belief and re-evaluate' },
    ] },
    { name: 'nextReviewOn', label: 'Next review date', type: 'date', value: addDays(today, ctx.state.settings?.premiseReviewDays ?? 30) },
    { name: 'note', label: 'Review note', type: 'textarea', rows: 3, required: true, value: '', placeholder: 'What did you check, and why are you reaffirming, retiring or reopening?' },
  ];
  const summary = h('div', { class: 'callout' },
    h('strong', null, `Current belief: ${evaluation.posteriorPct}% (${PREMISE_STATUS_LABELS[evaluation.status] || evaluation.status})`),
    h('p', { class: 'small' }, `${evaluation.evidenceCount} dated observation(s) · Bayes factor ${evaluation.bayesFactor} · fresh evidence since last acknowledgement: ${evaluation.freshEvidenceCount}.`),
    h('p', { class: 'muted small' }, 'Reaffirming is a human override, not evidence that the premise is true. Only genuinely new observations created after this acknowledgement can reopen the same breach.'),
  );
  return formDialog({
    title: `Review “${premise.title}”`,
    description: 'A signpost review is a dated governance act; the append-only ledger is preserved.',
    fields,
    submitLabel: 'Record review',
    bodyExtra: summary,
    onSubmit: (values, form, close) => {
      form.clearErrors();
      const result = ctx.api.reviewPremise(premise.id, {
        note: values.note,
        disposition: values.disposition,
        nextReviewOn: values.nextReviewOn,
      });
      if (!result.ok) { fieldError(form, result); return; }
      toast('Signpost review recorded; stale prompts self-clear.', 'good');
      close();
      ctx.refresh();
    },
  });
}
