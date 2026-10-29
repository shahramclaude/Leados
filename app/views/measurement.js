/**
 * app/views/measurement.js — the Scorecard Integrity Lab (`#/measurement`,
 * Schema v47, ADR-0035).
 *
 * The question this page answers: *if I pay attention to these numbers, what
 * will people actually do differently — and what would a better-designed
 * scorecard buy for the same hours?*
 *
 * Everything is derived from the leader's declared parameters. The page prints
 * the assumptions next to the numbers, never scores a person, and keeps the
 * frozen prediction visible when the later observation arrives.
 */

import { h, toast, confirmDialog, openModal } from '../ui/dom.js';
import {
  pageHeader, card, stat, badge, banner, table, emptyState, kv,
} from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { addDays, dayKey, formatDate } from '../core/time.js';
import {
  MEASUREMENT_DESIGN_LABELS,
  MEASUREMENT_FALSIFIER_MARGIN_PP,
  MEASUREMENT_MIN_SCORED,
} from '../core/domain/measurement.js';

const TONE_BY_BADGE = { sound: 'good', leaky: 'warn', distorted: 'bad' };

const TASK_DEFAULTS = [
  { name: 'Volume the team can move quickly', kind: 'measured', weightPct: 60, trueValue: 35, effortCost: 25, gamingEase: 70, noisePct: 20, ratchetPct: 40 },
  { name: 'The outcome you actually care about', kind: 'measured', weightPct: 40, trueValue: 85, effortCost: 60, gamingEase: 15, noisePct: 35, ratchetPct: 10 },
  { name: 'Work nobody counts', kind: 'unmeasured', weightPct: 0, trueValue: 75, effortCost: 45, gamingEase: 0, noisePct: 10, ratchetPct: 0 },
];

function fmt(value, unit = '') {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  const text = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(n);
  return unit ? `${text} ${unit}` : text;
}

function pct(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `${Math.round(Number(value))}%`;
}

function hours(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `${fmt(value)}h`;
}

function goodhartTone(index) {
  if (index >= 75) return 'bad';
  if (index >= 45) return 'warn';
  return 'good';
}

/* --------------------------------------------------------------- summary */

function summaryStats(report) {
  const t = report.totals;
  return h('div', { class: 'stat-grid' },
    stat({ label: 'Committed scorecards', value: fmt(t.active), hint: `${t.drafts} draft(s) · ${t.distorted} distorted` }),
    stat({ label: 'Modelled genuine value', value: t.meanEfficiencyPct === null ? '—' : pct(t.meanEfficiencyPct), hint: 'Share of first-best value the same hours would deliver', tone: t.meanEfficiencyPct !== null && t.meanEfficiencyPct < 55 ? 'bad' : 'good' }),
    stat({ label: 'Mean Goodhart index', value: t.meanGoodhart === null ? '—' : `${fmt(t.meanGoodhart)}/100`, hint: 'Weighted composite of gaming share, stakes and detection' }),
    stat({ label: 'Recoverable effort', value: hours(t.recoverableHoursPerWeek), hint: `${hours(t.misdirectedHoursPerWeek)}/week buys behaviour the cards do not reward` }));
}

/* ------------------------------------------------------------ assumptions */

function assumptionsCard(report) {
  const items = [
    ['Holmström & Milgrom (1991), multitask principal–agent: ', 'with linear rewards and convex effort cost, effort goes where the weight is, in proportion to weight ÷ marginal cost. Work the scorecard does not count receives none of the incentive-driven effort.'],
    ['Baker (1992), distortion: ', 'a measure can be distorted even when nobody is dishonest, if it responds as strongly to a cheap action as to the valuable one.'],
    ['Banker & Datar (1989), LEN risk: ', 'a noisy metric buys less behaviour per unit of weight and imposes a risk premium. Noise is a price on the metric, not a footnote.'],
    ['Weitzman (1980) ratchet; Freixas, Guesnerie & Tirole (1985): ', 'when today’s result becomes tomorrow’s target, the agent withholds output. Modelled as a discount on genuine effort.'],
    ['Kerr (1975) · Campbell (1979) · Goodhart (1975): ', 'stakes amplify distortion. The same metric is riskier when pay, ranking or promotion rests on it.'],
  ];
  const body = h('div', { class: 'stack-sm' },
    h('ul', { class: 'list-plain stack-xs' },
      ...items.map(([label, text]) => h('li', null, h('strong', null, label), text))),
    h('p', { class: 'small muted' }, 'Equations used: ŵ = w/Σw · ρ = ŵ/(1 + rσ²) · c = 1 + 3·cost · k = 0.25 + 2(1 − ease)² · genuine = ρ/c × (1 − 0.6·ratchet) · gaming = ρ·ease·(0.6 + 0.8·stakes)/k. First-best allocates effort ∝ value ÷ cost across measured and uncounted work alike.'),
    ...report.assumptions.map((line) => h('p', { class: 'small muted' }, `· ${line}`)));
  return card({
    title: 'What this model is, and what it is not',
    subtitle: 'Read this before quoting any number on the page. The algebra is printed so you can check it with a calculator.',
    body,
  });
}

/* ------------------------------------------------------------- declaring */

function taskRow(task = {}, { removable = true } = {}) {
  const field = (name, attrs, width) => h('td', { style: `min-width:${width}px` }, h('input', {
    type: 'number', ...attrs, ...(attrs.type === 'number' ? { min: 0, max: 100 } : {}),
    class: 'input', 'data-field': name, 'aria-label': attrs['aria-label'] || name,
  }));
  const row = h('tr', { class: 'mtx-task-row' },
    h('td', { style: 'min-width:190px' }, h('input', { type: 'text', class: 'input', 'data-field': 'name', value: task.name || '', placeholder: 'What the work is', 'aria-label': 'Task name' })),
    h('td', null, h('select', { class: 'input', 'data-field': 'kind', 'aria-label': 'Measured or uncounted' },
      h('option', { value: 'measured', selected: task.kind !== 'unmeasured' }, 'Counted'),
      h('option', { value: 'unmeasured', selected: task.kind === 'unmeasured' }, 'Uncounted'))),
    field('weightPct', { value: task.weightPct ?? 0, 'aria-label': 'Reward weight (%)' }, 80),
    field('trueValue', { value: task.trueValue ?? 50, 'aria-label': 'True value (1–100)' }, 80),
    field('effortCost', { value: task.effortCost ?? 50, 'aria-label': 'Effort cost (1–100)' }, 80),
    field('gamingEase', { value: task.gamingEase ?? 20, 'aria-label': 'Gaming ease (0–100)' }, 80),
    field('noisePct', { value: task.noisePct ?? 20, 'aria-label': 'Measurement noise (0–100)' }, 80),
    field('ratchetPct', { value: task.ratchetPct ?? 0, 'aria-label': 'Ratchet risk (0–100)' }, 80),
    h('td', null, removable
      ? h('button', {
        class: 'btn btn-ghost btn-sm',
        type: 'button',
        'aria-label': 'Remove this task',
        onClick: (event) => {
          event.preventDefault();
          row.remove();
        },
      }, '×')
      : null));
  return row;
}

function readTaskRows(tbody) {
  return [...tbody.querySelectorAll('tr.mtx-task-row')].map((row) => {
    const value = (name) => {
      const node = row.querySelector(`[data-field="${name}"]`);
      return node ? node.value : '';
    };
    return {
      id: row.dataset.taskId || undefined,
      name: String(value('name') || '').trim(),
      kind: value('kind') === 'unmeasured' ? 'unmeasured' : 'measured',
      weightPct: Number(value('weightPct')) || 0,
      trueValue: Number(value('trueValue')) || 50,
      effortCost: Number(value('effortCost')) || 50,
      gamingEase: Number(value('gamingEase')) || 0,
      noisePct: Number(value('noisePct')) || 0,
      ratchetPct: Number(value('ratchetPct')) || 0,
    };
  }).filter((row) => row.name);
}

/**
 * The declare card. It edits a DRAFT only; a committed design is the record its
 * prediction was frozen against and is never rewritten in place.
 */
function declareCard(ctx, report, { editing = null } = {}) {
  const source = editing || {};
  const today = report.asOf;
  const title = h('input', { id: 'mtx-title', class: 'input', type: 'text', maxlength: 200, value: source.title || '', placeholder: 'e.g. Support throughput' });
  const objective = h('input', { id: 'mtx-objective', class: 'input', type: 'text', maxlength: 600, value: source.objective || '', placeholder: 'The outcome you actually want, in one sentence' });
  const owner = h('select', { id: 'mtx-owner', class: 'input' },
    h('option', { value: '' }, 'No single owner'),
    ...((ctx.state.people || []).filter((p) => p.status !== 'archived').map((p) => h('option', { value: p.id, selected: source.ownerId === p.id }, p.name))));
  const stakes = h('input', { id: 'mtx-stakes', class: 'input', type: 'number', min: 0, max: 100, value: String(source.stakesPct ?? 60) });
  const detection = h('input', { id: 'mtx-detection', class: 'input', type: 'number', min: 0, max: 100, value: String(source.detectionPct ?? 25) });
  const professionalism = h('input', { id: 'mtx-prof', class: 'input', type: 'number', min: 0, max: 100, value: String(source.professionalismPct ?? 25) });
  const risk = h('input', { id: 'mtx-risk', class: 'input', type: 'number', min: 0, max: 100, value: String(source.riskAversionPct ?? 40) });
  const hoursInput = h('input', { id: 'mtx-hours', class: 'input', type: 'number', min: 1, max: 80, value: String(source.effortHoursPerWeek ?? 35) });
  const reviewOn = h('input', { id: 'mtx-review', class: 'input', type: 'date', value: source.reviewOn || addDays(today, 42), min: today });

  const tbody = h('tbody', null, ...(source.tasks?.length ? source.tasks : TASK_DEFAULTS).map((task) => taskRow(task)));
  const addRow = () => tbody.appendChild(taskRow({ name: '', kind: 'measured', weightPct: 0, trueValue: 50, effortCost: 50, gamingEase: 30, noisePct: 20, ratchetPct: 0 }));

  const submit = (event) => {
    event.preventDefault();
    const tasks = readTaskRows(tbody);
    if (tasks.length < 2) {
      toast('Declare at least two tasks — one you count and one you care about.', 'bad');
      return;
    }
    if (editing) {
      const res = ctx.api.updateScorecard(editing.id, {
        title: title.value, objective: objective.value, ownerId: owner.value || null, tasks,
        stakesPct: Number(stakes.value), detectionPct: Number(detection.value),
        professionalismPct: Number(professionalism.value), riskAversionPct: Number(risk.value),
        effortHoursPerWeek: Number(hoursInput.value), reviewOn: reviewOn.value || null,
      });
      if (!res.ok) { toast(res.error, 'bad'); return; }
      toast('Draft updated', 'good');
      ctx.navigate('#/measurement');
      return;
    }
    const res = ctx.api.createScorecard({
      title: title.value, objective: objective.value, ownerId: owner.value || null, tasks,
      stakesPct: Number(stakes.value), detectionPct: Number(detection.value),
      professionalismPct: Number(professionalism.value), riskAversionPct: Number(risk.value),
      effortHoursPerWeek: Number(hoursInput.value), reviewOn: reviewOn.value || null,
    });
    if (!res.ok) { toast(res.error, 'bad'); return; }
    toast('Declared. Review the model before committing.', 'good');
    ctx.navigate(`#/measurement?edit=${encodeURIComponent(res.id)}`);
  };

  return card({
    title: editing ? `Edit the draft “${editing.title}”` : 'Declare a scorecard',
    subtitle: 'Declare the work, then declare what is true about it. Nothing propagates until you commit; every parameter is a 0–100 convention you can defend.',
    body: h('form', { class: 'stack-md', onSubmit: submit },
      h('div', { class: 'form-grid' },
        h('div', { class: 'stack-xs' }, h('label', { for: 'mtx-title' }, 'Name'), title),
        h('div', { class: 'stack-xs' }, h('label', { for: 'mtx-objective' }, 'The objective it stands in for'), objective),
        h('div', { class: 'stack-xs' }, h('label', { for: 'mtx-owner' }, 'Owner'), owner)),
      h('div', { class: 'table-wrap' },
        h('table', { class: 'table', 'aria-label': 'Tasks the scorecard counts and the work it does not' },
          h('caption', { class: 'sr-only' }, 'Tasks, weights, true value, effort cost, gaming ease, noise and ratchet risk'),
          h('thead', null, h('tr', null,
            h('th', { scope: 'col' }, 'Task'),
            h('th', { scope: 'col' }, 'Kind'),
            h('th', { scope: 'col' }, 'Weight %'),
            h('th', { scope: 'col' }, 'True value'),
            h('th', { scope: 'col' }, 'Effort cost'),
            h('th', { scope: 'col' }, 'Gaming ease'),
            h('th', { scope: 'col' }, 'Noise'),
            h('th', { scope: 'col' }, 'Ratchet'),
            h('th', { scope: 'col' }, h('span', { class: 'sr-only' }, 'Remove')))),
          tbody)),
      h('p', { class: 'small muted' }, 'Gaming ease: 0 means the number cannot be moved without moving the work; 100 means it is purely cosmetic. Ratchet: how much hitting the number raises next period’s target.'),
      h('div', { class: 'form-grid' },
        h('div', { class: 'stack-xs' }, h('label', { for: 'mtx-stakes' }, 'Stakes (%)'), stakes,
          h('p', { class: 'small muted' }, 'How much pay, ranking or promotion rests on it.')),
        h('div', { class: 'stack-xs' }, h('label', { for: 'mtx-detection' }, 'Detection (%)'), detection,
          h('p', { class: 'small muted' }, 'How much gaming you would actually notice.')),
        h('div', { class: 'stack-xs' }, h('label', { for: 'mtx-prof' }, 'Uncounted-work floor (%)'), professionalism,
          h('p', { class: 'small muted' }, 'Effort that goes to uncounted work regardless of incentives.')),
        h('div', { class: 'stack-xs' }, h('label', { for: 'mtx-risk' }, 'Risk aversion (%)'), risk,
          h('p', { class: 'small muted' }, 'How much a noisy metric costs the person carrying it.')),
        h('div', { class: 'stack-xs' }, h('label', { for: 'mtx-hours' }, 'Team hours / week'), hoursInput),
        h('div', { class: 'stack-xs' }, h('label', { for: 'mtx-review' }, 'Review on'), reviewOn)),
      h('div', { class: 'page-actions' },
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: (event) => { event.preventDefault(); addRow(); } }, 'Add a task'),
        h('button', { class: 'btn btn-primary', type: 'submit' }, editing ? 'Save the draft' : 'Declare the scorecard'))),
  });
}

/* -------------------------------------------------------------- one card */

function effortTable(card) {
  const rows = card.equilibrium.rows.map((row) => ({ row }));
  return table({
    columns: [
      { key: 'name', label: 'Task', render: ({ row }) => h('span', null, row.name, row.kind === 'unmeasured' ? h('span', { class: 'small muted' }, ' · uncounted') : null) },
      { key: 'weight', label: 'Weight', render: ({ row }) => row.kind === 'measured' ? `${fmt(row.weightPct)}%` : '—' },
      { key: 'effort', label: 'Modelled effort', render: ({ row }) => `${fmt(row.effortPct)}%` },
      { key: 'genuine', label: 'Genuine', render: ({ row }) => `${fmt(row.genuineEffortPct)}%` },
      {
        key: 'gaming',
        label: 'Cosmetic',
        render: ({ row }) => (row.kind === 'measured'
          ? badge(`${fmt(row.gamingSharePct)}%`, row.gamingSharePct >= 50 ? 'bad' : row.gamingSharePct >= 25 ? 'warn' : 'good', 'Share of this task’s rewarded effort that is modelled as moving the metric without moving the work')
          : '—'),
      },
    ],
    rows,
    caption: 'Modelled effort allocation',
    emptyMessage: 'No tasks declared.',
  });
}

function redesignTable(card) {
  const rows = card.ranking.ranked.map((design) => ({
    design,
    className: design.id === 'current' ? 'row-current' : '',
  }));
  return table({
    columns: [
      { key: 'design', label: 'Design', render: ({ design }) => h('span', null, design.label, design.id === 'current' ? h('span', { class: 'small muted' }, ' · baseline') : null) },
      { key: 'efficiency', label: 'Genuine value', render: ({ design }) => pct(design.efficiencyPct) },
      { key: 'gaming', label: 'Gaming', render: ({ design }) => pct(design.gamingSharePct) },
      { key: 'metrics', label: 'Metrics', render: ({ design }) => fmt(design.metricCount) },
      { key: 'cost', label: 'Measurement cost', render: ({ design }) => fmt(design.measurementCost, 'pts') },
      { key: 'net', label: 'Net value', render: ({ design }) => badge(fmt(design.netValue), design.id === card.ranking.best.id ? 'good' : 'neutral') },
    ],
    rows,
    caption: 'Modelled redesign frontier',
  });
}

function goodhartTable(card) {
  const rows = card.goodhart.metrics.map((metric) => ({ metric }));
  return table({
    columns: [
      { key: 'name', label: 'Metric', render: ({ metric }) => metric.name },
      { key: 'weight', label: 'Weight', render: ({ metric }) => pct(metric.weightPct) },
      { key: 'gaming', label: 'Cosmetic share', render: ({ metric }) => pct(metric.gamingSharePct) },
      { key: 'index', label: 'Goodhart index', render: ({ metric }) => badge(`${fmt(metric.goodhartIndex)}/100`, goodhartTone(metric.goodhartIndex)) },
      { key: 'yield', label: 'Value per rewarded unit', render: ({ metric }) => fmt(metric.valuePerRewardedUnit) },
    ],
    rows,
    caption: 'Per-metric distortion profile',
    emptyMessage: 'No measured metric is declared.',
  });
}

function observationBlock(ctx, record) {
  const score = record.observationScore;
  if (!score) {
    if (record.status !== 'committed') return null;
    return record.observation?.recordedOn
      ? h('p', { class: 'small muted' }, `Observation recorded ${record.observation.recordedOn} (${record.observation.source}).`)
      : h('div', { class: 'stack-sm' },
        h('p', { class: 'small muted' }, `No observation recorded. The frozen prediction is ${record.frozen?.prediction?.gamingSharePct ?? '—'}% gaming; an observation within ${MEASUREMENT_FALSIFIER_MARGIN_PP} points counts as called, above that the model was too kind.`),
        h('button', {
          class: 'btn btn-ghost',
          type: 'button',
          onClick: () => openObservationDialog(ctx, record),
        }, 'Record what happened'));
  }
  return h('div', { class: 'stack-sm', 'data-testid': 'mtx-observation' },
    kv('Predicted gaming (frozen)', pct(score.predictedGamingPct)),
    kv('Recorded gaming', pct(score.observedGamingPct)),
    kv('Error', `${score.errorPp > 0 ? '+' : ''}${fmt(score.errorPp)} pp`, score.band === 'called' ? 'good' : 'warn'),
    kv('Metric moved / true outcome', `${fmt(score.metricMovedPct)}pp / ${fmt(score.trueOutcomePct)}pp`),
    kv('Cosmetic gap', `${fmt(score.cosmeticGapPp)} pp`, score.cosmeticGapPp > 15 ? 'bad' : 'neutral'),
    h('p', { class: 'small muted' }, `Recorded ${score.recordedOn}: ${score.note || 'no note'}`),
    h('p', { class: 'small muted' }, score.sufficient ? '' : 'One observation is an anecdote. The ledger prints it as one until there are three.'));
}

function observationCard(ctx, record) {
  if (record.status !== 'committed') return null;
  return card({
    title: 'Did the model call it?',
    subtitle: 'Your own recorded estimate of how much measured movement was cosmetic. The app has no telemetry and does not infer this.',
    body: observationBlock(ctx, record),
  });
}

function openObservationDialog(ctx, card) {
  const gaming = h('input', { class: 'input', type: 'number', min: 0, max: 100, value: String(Math.round(card.frozen?.prediction?.gamingSharePct ?? 0)), id: 'mtx-obs-gaming' });
  const metric = h('input', { class: 'input', type: 'number', min: 0, max: 100, value: '0', id: 'mtx-obs-metric' });
  const truth = h('input', { class: 'input', type: 'number', min: 0, max: 100, value: '0', id: 'mtx-obs-truth' });
  const on = h('input', { class: 'input', type: 'date', value: dayKey(ctx.now), max: dayKey(ctx.now), id: 'mtx-obs-on' });
  const source = h('select', { class: 'input', id: 'mtx-obs-source' },
    ...['conversation', 'review', 'metric', 'audit', 'other'].map((value) => h('option', { value }, value)));
  const note = h('textarea', { class: 'input', rows: 3, id: 'mtx-obs-note', maxlength: 600, placeholder: 'How do you know? Name the conversation, the audit or the number you compared.' });
  const dialog = openModal({
    title: `Record an observation — ${card.title}`,
    description: `Frozen prediction: ${card.frozen?.prediction?.gamingSharePct}% gaming, ${card.frozen?.prediction?.efficiencyPct}% genuine value. The frozen record is never rewritten.`,
    body: h('div', { class: 'stack-sm' },
      h('div', { class: 'form-grid' },
        h('div', { class: 'stack-xs' }, h('label', { for: 'mtx-obs-on' }, 'Observed on'), on),
        h('div', { class: 'stack-xs' }, h('label', { for: 'mtx-obs-gaming' }, 'Gaming share (%)'), gaming),
        h('div', { class: 'stack-xs' }, h('label', { for: 'mtx-obs-metric' }, 'How far the metric moved (pp)'), metric),
        h('div', { class: 'stack-xs' }, h('label', { for: 'mtx-obs-truth' }, 'How far the outcome moved (pp)'), truth),
        h('div', { class: 'stack-xs' }, h('label', { for: 'mtx-obs-source' }, 'Where this came from'), source)),
      h('div', { class: 'stack-xs' }, h('label', { for: 'mtx-obs-note' }, 'What you saw'), note)),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const res = ctx.api.recordScorecardObservation(card.id, {
            recordedOn: on.value,
            gamingSharePct: Number(gaming.value),
            metricMovedPct: Number(metric.value),
            trueOutcomePct: Number(truth.value),
            source: source.value,
            note: note.value,
          });
          if (!res.ok) { toast(res.error, 'bad'); return; }
          dialog.close();
          toast(res.score?.falsified ? 'Recorded — that beats the frozen prediction, so the model was too kind' : 'Observation recorded', res.score?.falsified ? 'warn' : 'good');
          ctx.refresh();
        },
      }, 'Record it'),
    ],
  });
}

function scorecardCard(ctx, record) {
  const frozen = record.frozen?.prediction;
  const actions = [
    record.status === 'draft'
      ? h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: async () => {
          const accepted = await confirmDialog({
            title: 'Commit this scorecard?',
            message: `Freezes the prediction (${record.equilibrium.efficiencyPct}% genuine value, ${record.equilibrium.gamingSharePct}% gaming) and lets the rule spine open at most one redesign decision, up to two owned counter-metric tasks and one 1:1 question. It does not rate a person, send anything or change pay.`,
            confirmLabel: 'Commit and freeze',
          });
          if (!accepted) return;
          const res = ctx.api.commitScorecard(record.id, { designKey: record.designKey, expectedRevision: ctx.state.meta.revision });
          if (!res.ok) { toast(res.error, 'bad'); return; }
          toast('Committed. The prediction is frozen.', 'good');
          ctx.refresh();
        },
      }, 'Commit')
      : null,
    record.status === 'draft'
      ? h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => ctx.navigate(`#/measurement?edit=${encodeURIComponent(record.id)}`) }, 'Edit')
      : null,
    record.status === 'committed' && record.ranking.recommend
      ? h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        onClick: async () => {
          const accepted = await confirmDialog({
            title: 'Fork the recommended redesign?',
            message: `Creates a NEW draft: “${record.ranking.best.label}”. The committed scorecard is kept exactly as it is, so its frozen prediction stays scorable.`,
            confirmLabel: 'Fork the design',
          });
          if (!accepted) return;
          const res = ctx.api.forkScorecard(record.id, { designId: record.ranking.best.id });
          if (!res.ok) { toast(res.error, 'bad'); return; }
          toast('Redesign forked into a draft. Review and commit it when you are ready.', 'good');
          ctx.navigate(`#/measurement?edit=${encodeURIComponent(res.id)}`);
        },
      }, 'Fork the redesign')
      : null,
    record.status === 'committed' && card.observation?.recordedOn
      ? h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        onClick: () => {
          const res = ctx.api.reviewScorecard(record.id, { note: 'Cycle closed from the lab.' });
          toast(res.ok ? 'Cycle closed' : res.error, res.ok ? 'good' : 'bad');
          if (res.ok) ctx.refresh();
        },
      }, 'Close the cycle')
      : null,
    ['draft', 'committed'].includes(record.status)
      ? h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        onClick: async () => {
          const accepted = await confirmDialog({
            title: 'Retire this scorecard?',
            message: 'The record and its frozen prediction are kept. Retiring removes it from the active model and from the attention count.',
            confirmLabel: 'Retire',
            danger: true,
          });
          if (!accepted) return;
          const res = ctx.api.retireScorecard(record.id, { note: 'Retired from the lab.' });
          toast(res.ok ? 'Retired' : res.error, res.ok ? 'good' : 'bad');
          if (res.ok) ctx.refresh();
        },
      }, 'Retire')
      : null,
  ].filter(Boolean);

  return card({
    title: record.title,
    subtitle: record.objective || 'No objective declared — the number is standing in for something, and nobody wrote down what.',
    id: `mtx-card-${record.id}`,
    actions: [badge(record.badge.label, TONE_BY_BADGE[record.badge.id] || 'neutral'), ...actions],
    body: h('div', { class: 'stack-md', 'data-testid': `mtx-card-${record.id}` },
      h('div', { class: 'stat-grid' },
        stat({ label: 'Modelled genuine value', value: pct(record.equilibrium.efficiencyPct), hint: `${fmt(record.equilibrium.valueDelivered)} of ${fmt(record.equilibrium.idealValue)} first-best points`, tone: record.equilibrium.efficiencyPct < 55 ? 'bad' : 'good' }),
        stat({ label: 'Cosmetic share', value: pct(record.equilibrium.gamingSharePct), hint: 'Of all measured effort' }),
        stat({ label: 'Goodhart index', value: `${fmt(record.goodhart.portfolioIndex)}/100`, hint: `Stakes ×${record.goodhart.stakesFactor} · detection ${pct(record.goodhart.detectionPct)}` }),
        stat({ label: 'Uncounted work neglected', value: `${fmt(record.equilibrium.unmeasuredNeglectPct)} pp`, hint: 'Shortfall against first-best on tasks you did not count' })),
      record.status === 'committed' && frozen
        ? banner({
          tone: 'info',
          title: `Prediction frozen ${formatDate(record.frozen.at)}`,
          body: `${frozen.efficiencyPct}% genuine value · ${frozen.gamingSharePct}% gaming · falsified if a recorded observation beats that by ${frozen.falsifierMarginPp ?? MEASUREMENT_FALSIFIER_MARGIN_PP} points${frozen.recommendedDesign && frozen.recommendedDesign !== 'current' ? ` · a redesign was on the table (${MEASUREMENT_DESIGN_LABELS[frozen.recommendedDesign] || frozen.recommendedDesign})` : ''}.`,
        })
        : null,
      effortTable(record),
      h('div', { class: 'grid-2' },
        card({ title: 'Where the metric would be gamed', subtitle: 'Baker distortion with a Campbell stakes amplifier and your declared detection rate.', body: goodhartTable(record) }),
        card({
          title: 'What a better design would buy',
          subtitle: record.ranking.reason,
          actions: [badge(record.ranking.recommend ? `+${fmt(record.ranking.lift)} net` : 'no lift', record.ranking.recommend ? 'good' : 'neutral')],
          body: redesignTable(record),
        })),
      observationCard(ctx, record))
  });
}

/* ------------------------------------------------------------ calibration */

function calibrationCard(report) {
  const c = report.calibration;
  if (!c.rows.length) {
    return card({
      title: 'Calibration ledger',
      subtitle: 'Every frozen prediction is scored against a recorded observation. Until there are three, the lab refuses to claim calibration.',
      body: emptyState({
        title: 'No observation has been recorded yet',
        body: `A prediction that is never compared with what happened is a decoration. ${MEASUREMENT_MIN_SCORED} observations is the floor before the lab prints an error average.`,
      }),
    });
  }
  return card({
    title: 'Calibration ledger',
    subtitle: c.sufficient ? c.message : `${c.message} These are individual errors, not a calibration claim.`,
    body: h('div', { class: 'stack-sm' },
      table({
        columns: [
          { key: 'on', label: 'Recorded', render: (row) => row.recordedOn },
          { key: 'predicted', label: 'Predicted gaming', render: (row) => pct(row.predictedGamingPct) },
          { key: 'observed', label: 'Recorded gaming', render: (row) => pct(row.observedGamingPct) },
          { key: 'error', label: 'Error', render: (row) => badge(`${row.errorPp > 0 ? '+' : ''}${fmt(row.errorPp)} pp`, row.band === 'called' ? 'good' : 'warn') },
          { key: 'gap', label: 'Cosmetic gap', render: (row) => `${fmt(row.cosmeticGapPp)} pp` },
          { key: 'note', label: 'Note', render: (row) => h('span', { class: 'small muted' }, row.note || '—') },
        ],
        rows: c.rows.map((row) => ({ ...row })),
        caption: 'Frozen predictions scored against recorded observations',
      })),
  });
}

/* ---------------------------------------------------------------- render */

function attentionCard(ctx, report) {
  if (!report.attention.length) return null;
  return card({
    title: 'What needs a decision',
    subtitle: 'Distortion, overdue measurement and falsified predictions — in that order of urgency.',
    body: h('ul', { class: 'list-plain stack-xs' },
      ...report.attention.slice(0, 8).map((row) => h('li', null,
        badge(`S${row.severity}`, row.severity >= 4 ? 'bad' : 'warn'),
        ' ',
        h('a', { class: 'link', href: row.route, onClick: (event) => { event.preventDefault(); ctx.navigate(row.route); } }, row.title)))),
  });
}

export function renderMeasurement(ctx) {
  const report = ctx.api.measurementReport();
  const editId = ctx.query?.get?.('edit') || null;
  const editing = editId ? (report.scorecards || []).find((row) => row.id === editId && row.status === 'draft') : null;

  const brief = () => {
    const text = ctx.api.measurementBriefText();
    if (!downloadText({ filename: 'leados-scorecard-integrity.txt', text, mime: 'text/plain' })) {
      openModal({ title: 'Copy the scorecard brief', body: h('textarea', { readOnly: true, rows: 18, 'aria-label': 'Scorecard integrity brief' }, text) });
    }
  };

  const activeCards = report.scorecards.filter((s) => s.status === 'committed' || s.status === 'reviewed');
  const draftCards = report.scorecards.filter((s) => s.status === 'draft');

  return h('div', { class: 'page', 'data-testid': 'measurement-page' },
    pageHeader({
      eyebrow: 'Measurement · Schema v47',
      title: 'Scorecard integrity',
      subtitle: 'What the numbers you reward will actually make people do — modelled from your declared parameters, priced in hours, and frozen before the evidence arrives.',
      actions: [
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: brief }, 'Export the brief'),
      ],
    }),
    report.totals.total
      ? banner({
        tone: report.totals.distorted ? 'bad' : report.totals.leaky ? 'warn' : 'good',
        title: report.totals.distorted
          ? `${report.totals.distorted} committed scorecard(s) are modelled to pay mostly for gaming`
          : report.totals.leaky
            ? `${report.totals.leaky} scorecard(s) are leaky`
            : report.totals.active
              ? 'The declared scorecards hold up under the declared model'
              : 'No committed scorecard yet',
        body: `${report.totals.active} committed · ${report.totals.drafts} draft · ${report.totals.overdue} overdue for measurement. ${report.totals.recoverableHoursPerWeek ? `≈${hours(report.totals.recoverableHoursPerWeek)} a week recoverable by a modelled redesign.` : ''}`,
      })
      : banner({
        tone: 'info',
        title: 'No scorecard has been declared',
        body: 'Most leadership tools ask you to set goals. This one asks what the goal will make people do — including the person who is not being cynical at all. Declare one scorecard below to see the model.',
      }),
    report.totals.total ? summaryStats(report) : null,
    attentionCard(ctx, report),
    declareCard(ctx, report, { editing }),
    draftCards.length && !editing
      ? card({ title: 'Drafts', subtitle: 'Modelled but not committed. A draft freezes nothing and opens no work.', body: h('div', { class: 'stack-sm' }, ...draftCards.map((row) => h('div', { class: 'stack-xs' }, scorecardCard(ctx, row)))) })
      : null,
    h('div', { class: 'stack-lg' }, ...activeCards.map((row) => scorecardCard(ctx, row))),
    calibrationCard(report),
    assumptionsCard(report));
}
