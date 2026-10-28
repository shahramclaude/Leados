/**
 * app/ui/strategy-modals.js — capture dialogs for the Strategy Coherence
 * Terminal (Schema v42).
 *
 * Design rule carried from the rest of LeadOS: a dialog asks for what only a
 * human can supply (the diagnosis, the refusal, the stop rule, the verdict) and
 * never asks for a number the engine can derive. The bet dialog therefore has
 * no "alignment score" field, and the verdict dialog has no "was the strategy
 * right?" toggle — it asks what the stop rule actually showed.
 */

import { h, buildForm, openModal, toast } from './dom.js';
import { badge } from './components.js';
import {
  ADVANTAGE_TYPES,
  BET_VERDICTS,
  SCO_CHECKS,
  STRATEGY_KINDS,
  WORK_SOURCES,
  buildStrategyReport,
} from '../core/domain/strategy.js';

function formDialog({ title, description, fields, submitLabel = 'Save', size = 'md', bodyExtra = null, onSubmit }) {
  const form = buildForm(fields);
  let closeFn = null;
  form.__close = () => closeFn && closeFn();
  form.__onSubmit = () => onSubmit(form.getValues(), form, () => closeFn && closeFn());
  const cancelBtn = h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => form.__close() }, 'Cancel');
  const submitBtn = h('button', { class: 'btn btn-primary', type: 'button', onClick: () => form.__onSubmit() }, submitLabel);
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
  dialog.__form = form;
  return dialog;
}

function ownerOptions(ctx, value) {
  const options = [{ value: '', label: 'No owner yet — a bet cannot be adopted without one' }];
  for (const person of (ctx.state.people || []).filter((p) => p && p.status !== 'archived')) {
    options.push({ value: person.id, label: `${person.name}${person.role ? ` · ${person.role}` : ''}` });
  }
  return options.map((option) => ({ ...option, selected: option.value === value }));
}

/** Every open record a tag could point at, flattened into one labelled list. */
function workOptions(ctx, selected = '') {
  const rows = [{ value: '', label: 'Choose an open record…' }];
  const seen = [];
  for (const spec of WORK_SOURCES) {
    for (const record of ctx.state[spec.collection] || []) {
      if (!record || !record.id || !spec.isOpen(record)) continue;
      const scaffold = `${record.title || ''} ${record.question || ''} ${record.expectedOutcome || ''}`.includes('[RULE-SCO-');
      if (scaffold) continue;
      seen.push({
        value: `${spec.entityType}:${record.id}`,
        label: `${spec.label} · ${String(spec.title(record)).slice(0, 80)}`,
      });
    }
  }
  seen.sort((a, b) => a.label.localeCompare(b.label));
  return rows.concat(seen).map((option) => ({ ...option, selected: option.value === selected }));
}

export function openStrategyBetDialog(ctx, { bet = null, onSaved = null } = {}) {
  const kill = bet?.killCriterion || {};
  const fields = [
    { name: 'title', label: 'The bet', type: 'text', required: true, value: bet?.title || '', placeholder: 'Win the mid-market with a faster first value' },
    {
      name: 'kind',
      label: 'What kind of choice is this?',
      type: 'select',
      value: bet?.kind || 'where-to-play',
      options: STRATEGY_KINDS.map((kind) => ({ value: kind.key, label: `${kind.label} — ${kind.help}` })),
      help: 'A bet is a choice, not a project. If it could be funded alongside everything else, it is a project.',
    },
    {
      name: 'advantage',
      label: 'The advantage that makes it pay',
      type: 'select',
      value: bet?.advantage || 'unclear',
      options: ADVANTAGE_TYPES.map((type) => ({ value: type.key, label: `${type.label} — ${type.help}` })),
    },
    { name: 'ownerId', label: 'Accountable owner', type: 'select', value: bet?.ownerId || '', options: ownerOptions(ctx, bet?.ownerId || ''), help: 'One person. A bet owned by a committee has no owner.' },
    {
      name: 'diagnosis',
      label: 'Diagnosis — the obstacle',
      type: 'textarea',
      rows: 3,
      value: bet?.diagnosis || '',
      help: 'Rumelt’s kernel starts here: what is actually happening that makes the obvious move fail? At least 20 characters, or the bet is graded partially falsifiable.',
    },
    {
      name: 'guidingPolicy',
      label: 'Guiding policy — how you deal with it',
      type: 'textarea',
      rows: 3,
      value: bet?.guidingPolicy || '',
      help: 'The approach, not the plan. Still one or two sentences.',
    },
    {
      name: 'notDoing',
      label: 'What this bet means the team will NOT do',
      type: 'textarea',
      rows: 3,
      value: (bet?.notDoing || []).join('\n'),
      help: 'One refusal per line. Porter’s test: a strategy with no negative space cannot constrain anything.',
    },
    { type: 'divider', label: 'Declared share' },
    {
      name: 'weightPct',
      label: 'Share of team effort this bet declares (%)',
      type: 'number',
      min: 0,
      max: 100,
      step: 1,
      value: bet?.weightPct ?? 0,
      help: 'Declared, not measured. The gap between this and the tagged work is what the terminal computes. Shares do not have to sum to 100 — they are normalised for comparison and the basis is shown.',
    },
    { name: 'horizonWeeks', label: 'Horizon (weeks)', type: 'number', min: 4, max: 104, step: 1, value: bet?.horizonWeeks ?? 26 },
    { type: 'divider', label: 'Stop rule — what would make you stop' },
    { name: 'killMetric', label: 'Metric', type: 'text', value: kill.metric || '', placeholder: 'Median time to first value' },
    { name: 'killThreshold', label: 'Threshold (optional)', type: 'number', step: 0.01, value: kill.threshold ?? '' },
    {
      name: 'killDirection',
      label: 'The bet is failing when the metric is',
      type: 'select',
      value: kill.direction || 'below',
      options: [{ value: 'below', label: 'Below the threshold' }, { value: 'above', label: 'Above the threshold' }],
    },
    { name: 'killOn', label: 'Judgement date', type: 'date', value: kill.checkOn || '', help: 'The date a human will judge it. Without a date the rule cannot fire, and the bet is graded unfalsifiable.' },
    { name: 'killNote', label: 'What you expect to see (optional)', type: 'textarea', rows: 2, value: kill.note || '' },
    { type: 'divider', label: 'Notes' },
    { name: 'notes', label: 'Anything else worth recording', type: 'textarea', rows: 2, value: bet?.notes || '' },
  ];

  return formDialog({
    title: bet ? 'Edit the bet' : 'Declare a strategic bet',
    description: 'This is the only place in LeadOS where the strategy is written down. Everything else measures what actually got funded.',
    fields,
    submitLabel: bet ? 'Save changes' : 'Create draft',
    size: 'lg',
    onSubmit: (values, form, close) => {
      const result = ctx.api.saveStrategyBet({
        id: bet?.id,
        title: values.title,
        kind: values.kind,
        advantage: values.advantage,
        ownerId: values.ownerId || null,
        diagnosis: values.diagnosis,
        guidingPolicy: values.guidingPolicy,
        notDoing: String(values.notDoing || '').split('\n').map((line) => line.trim()).filter(Boolean),
        weightPct: Number(values.weightPct || 0),
        horizonWeeks: Number(values.horizonWeeks || 26),
        notes: values.notes,
        killCriterion: (values.killMetric || values.killOn)
          ? {
              metric: values.killMetric,
              threshold: values.killThreshold === '' ? null : Number(values.killThreshold),
              direction: values.killDirection,
              checkOn: values.killOn || null,
              note: values.killNote,
            }
          : null,
      });
      if (!result || !result.ok) {
        form.setErrors({ [result?.field || 'title']: result?.error || 'That bet could not be saved.' });
        return;
      }
      close();
      toast(bet ? 'Bet updated.' : 'Bet recorded as a draft. Adopt it when you are ready to be measured against it.');
      if (onSaved) onSaved(result);
      ctx.refresh && ctx.refresh();
    },
  });
}

export function openStrategyAdoptDialog(ctx, { bet, onSaved = null } = {}) {
  const report = buildStrategyReport(ctx.state, ctx.now, ctx.state.settings);
  const row = report.bets.find((entry) => entry.id === bet.id)
    || (bet.status === 'draft' ? null : null);
  const checks = SCO_CHECKS.map((check) => {
    const passed = row ? row.grade.checks.find((c) => c.key === check.key)?.passed : false;
    return h('div', { class: 'kv' },
      h('span', { class: 'kv-label' }, check.label),
      h('span', { class: passed ? 'text-good' : 'text-warn' }, passed ? 'Passes' : 'Missing'),
      h('span', { class: 'small muted' }, `${check.detail}${!passed && check.key === 'committedAction' ? ' — you can tag work immediately after adopting.' : ''}`));
  });
  const soonest = (ctx.state.decisions || []).filter((d) => !d.chosen && String(d.question || '').includes('[RULE-SCO-')).length;
  return formDialog({
    title: `Adopt “${String(bet.title).slice(0, 70)}”`,
    description: 'Adoption starts the measurement: from this date, open work is compared with the declared share, and the stop rule becomes judgeable.',
    fields: [
      {
        name: 'adoptedOn',
        label: 'Adoption date',
        type: 'date',
        required: true,
        value: ctx.now.toISOString().slice(0, 10),
        max: ctx.now.toISOString().slice(0, 10),
        help: 'This date is the vintage. Work that predates it is excluded from the gap, because funding it was not a choice this bet caused.',
      },
      {
        type: 'static',
        label: 'Falsifiability of this bet today',
        wide: true,
        value: h('div', { class: 'view-stack', style: 'gap:4px' }, ...checks),
      },
      {
        type: 'static',
        wide: true,
        value: h('p', { class: 'small muted' },
          `Adopting fans out in one transaction: a DACI commitment decision${soonest ? ' (which Decision Tempo can price)' : ''}, an owned delegation to tag the work already in flight, and a blameless 1:1 talking point.`),
      },
    ],
    submitLabel: 'Adopt the bet',
    size: 'md',
    onSubmit: (values, form, close) => {
      const result = ctx.api.adoptStrategyBet(bet.id, { adoptedOn: values.adoptedOn });
      if (!result || !result.ok) {
        form.setErrors({ [result?.field || 'adoptedOn']: result?.error || 'That bet could not be adopted.' });
        return;
      }
      close();
      const n = Array.isArray(result.propagations) ? result.propagations.length : 0;
      toast(n ? `Bet adopted. ${n} follow-up${n === 1 ? '' : 's'} propagated automatically (see Signals).` : 'Bet adopted.', 'good');
      if (onSaved) onSaved(result);
      ctx.refresh && ctx.refresh();
    },
  });
}

export function openStrategyRetireDialog(ctx, { bet, onSaved = null } = {}) {
  return formDialog({
    title: `Retire “${String(bet.title).slice(0, 70)}”`,
    description: 'Retiring keeps the bet in the ledger with its declared share, measured share and history. Nothing is deleted, and tags stay attached as evidence.',
    fields: [{
      name: 'reason',
      label: 'Why is it being retired?',
      type: 'textarea',
      rows: 3,
      required: true,
      help: 'A silent retirement is indistinguishable from drift. At least 5 characters.',
    }],
    submitLabel: 'Retire the bet',
    onSubmit: (values, form, close) => {
      const result = ctx.api.retireStrategyBet(bet.id, { reason: values.reason });
      if (!result || !result.ok) {
        form.setErrors({ [result?.field || 'reason']: result?.error || 'That bet could not be retired.' });
        return;
      }
      close();
      toast('Bet retired and kept in the ledger.');
      if (onSaved) onSaved(result);
      ctx.refresh && ctx.refresh();
    },
  });
}

export function openStrategyTagDialog(ctx, { bet = null, betId = null, onSaved = null } = {}) {
  const candidates = (ctx.state.strategyBets || []).filter((row) => row && row.status !== 'retired');
  if (!candidates.length) {
    toast('Declare a bet first — there is nothing to fund yet.', 'warn');
    return null;
  }
  const chosenBet = betId || bet?.id || candidates.find((row) => row.status === 'active')?.id || candidates[0].id;
  return formDialog({
    title: 'Link work to a bet',
    description: 'A tag asserts that this open record is funded by that bet. Tag honestly: inflating the tag set makes the gap disappear without changing what the team does.',
    fields: [
      {
        name: 'betId',
        label: 'Bet',
        type: 'select',
        value: chosenBet,
        options: candidates.map((row) => ({
          value: row.id,
          label: `${row.title.slice(0, 70)}${row.status === 'draft' ? ' (draft — tags do not count until adopted)' : ''}`,
          selected: row.id === chosenBet,
        })),
      },
      {
        name: 'record',
        label: 'Open record',
        type: 'select',
        value: '',
        required: true,
        options: workOptions(ctx, ''),
        help: 'Closed records are not listed: history is not current allocation.',
      },
      {
        name: 'effortWeeks',
        label: 'Effort (weeks, optional)',
        type: 'number',
        min: 0,
        max: 104,
        step: 0.5,
        help: 'Leave blank if you do not know. A blank is counted as one record and reported as missing effort coverage — never as zero effort.',
      },
      { name: 'note', label: 'Note (optional)', type: 'text', help: 'What part of this record the bet is actually paying for.' },
    ],
    submitLabel: 'Link the work',
    onSubmit: (values, form, close) => {
      const [entityType, entityId] = String(values.record || '').split(':');
      const result = ctx.api.tagStrategyWork({
        betId: values.betId,
        entityType,
        entityId,
        effortWeeks: values.effortWeeks === '' || values.effortWeeks === undefined ? null : Number(values.effortWeeks),
        note: values.note,
      });
      if (!result || !result.ok) {
        form.setErrors({ [result?.field || 'record']: result?.error || 'That work could not be linked.' });
        return;
      }
      close();
      toast('Work linked to the bet.');
      if (onSaved) onSaved(result);
      ctx.refresh && ctx.refresh();
    },
  });
}

export function openStrategyVerdictDialog(ctx, { bet, onSaved = null } = {}) {
  const kill = bet.killCriterion || {};
  return formDialog({
    title: `Judge “${String(bet.title).slice(0, 70)}”`,
    description: kill.metric
      ? `The recorded stop rule: ${kill.metric} ${kill.direction === 'above' ? 'above' : 'below'} ${kill.threshold ?? 'the recorded threshold'} by ${kill.checkOn || 'no date'}. Record what it actually showed — the app never decides this.`
      : 'No stop rule was recorded for this bet. A verdict without a rule is a mood, so consider writing the rule first.',
    fields: [
      {
        name: 'verdict',
        label: 'Verdict',
        type: 'select',
        value: 'continue',
        options: BET_VERDICTS.map((option) => ({ value: option.key, label: `${option.label} — ${option.help}` })),
      },
      { name: 'recordedOn', label: 'Judged on', type: 'date', required: true, value: ctx.now.toISOString().slice(0, 10), max: ctx.now.toISOString().slice(0, 10) },
      {
        name: 'note',
        label: 'What the evidence showed',
        type: 'textarea',
        rows: 3,
        required: true,
        help: 'At least 5 characters. This is what the next review reads, and what a new leader inherits.',
      },
    ],
    submitLabel: 'Record the verdict',
    onSubmit: (values, form, close) => {
      const result = ctx.api.recordStrategyVerdict(bet.id, {
        verdict: values.verdict,
        recordedOn: values.recordedOn,
        note: values.note,
      });
      if (!result || !result.ok) {
        form.setErrors({ [result?.field || 'note']: result?.error || 'That verdict could not be recorded.' });
        return;
      }
      close();
      toast(values.verdict === 'retire'
        ? 'Verdict recorded and the bet retired.'
        : 'Verdict recorded. The bet stays active and the rule can be judged again at its next date.', 'good');
      if (onSaved) onSaved(result);
      ctx.refresh && ctx.refresh();
    },
  });
}

export function openStrategyConventionsDialog(ctx, { onSaved = null } = {}) {
  const settings = ctx.state.settings || {};
  return formDialog({
    title: 'Strategy conventions',
    description: 'These are management conventions this workspace owns, not laws. They change when a rebalancing decision is opened and when the terminal calls work “strategy-blind”.',
    fields: [
      {
        name: 'gapThresholdPct',
        label: 'Say–do gap that opens a decision (percentage points)',
        type: 'number',
        min: 5,
        max: 60,
        step: 1,
        value: settings.strategyGapThresholdPct ?? 20,
        help: 'The divergence is half the L1 distance between declared and measured shares. 0 means perfect agreement; 60 would only ever fire on a strategy nobody is executing.',
      },
      {
        name: 'blindWipThresholdPct',
        label: 'Strategy-blind work that raises a signal (%)',
        type: 'number',
        min: 5,
        max: 100,
        step: 5,
        value: settings.strategyBlindWipThresholdPct ?? 40,
      },
      {
        name: 'driftWindowDays',
        label: 'Recent-flow window (days)',
        type: 'number',
        min: 7,
        max: 90,
        step: 1,
        value: settings.strategyDriftWindowDays ?? 28,
        help: 'The recent-flow view compares the standing mix with the newest commitments. Direction leads the balance sheet.',
      },
      {
        name: 'autoPropagate',
        label: 'Open governance follow-ups automatically',
        type: 'checkbox',
        value: settings.strategyAutoPropagate !== false,
        help: 'On: an explicit audit (and any bet change) opens at most one decision per finding, plus a tagging or stop-rule delegation. Off: the report still computes; nothing is opened. You can always run the audit later.',
      },
      {
        type: 'static',
        wide: true,
        value: h('div', { class: 'badge-row' },
          badge('RULE-SCO-01 adoption fan-out', 'info'),
          badge('RULE-SCO-02 say–do gap', 'info'),
          badge('RULE-SCO-03 missing stop rule', 'info'),
          badge('RULE-SCO-04 overdue verdict', 'info')),
      },
    ],
    submitLabel: 'Save conventions',
    onSubmit: (values, form, close) => {
      const result = ctx.api.updateStrategyPolicy({
        gapThresholdPct: Number(values.gapThresholdPct),
        blindWipThresholdPct: Number(values.blindWipThresholdPct),
        driftWindowDays: Number(values.driftWindowDays),
        autoPropagate: Boolean(values.autoPropagate),
      });
      if (!result || !result.ok) {
        form.setErrors({ [result?.field || 'gapThresholdPct']: result?.error || 'Those conventions could not be saved.' });
        return;
      }
      close();
      toast('Strategy conventions saved.');
      if (onSaved) onSaved(result);
      ctx.refresh && ctx.refresh();
    },
  });
}
