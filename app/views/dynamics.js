/**
 * app/views/dynamics.js — the Operating System Dynamics Lab (`#/dynamics`).
 *
 * Session 57, Schema v37. Four tabs in the order a leader has to think:
 *   Structure   → what the system is made of now: capacity, work, quality debt,
 *                 dependency, and where the integrated trajectory goes
 *   Loops       → which feedback is currently moving the system, named and
 *                 ranked by measured gain, with the archetype it implies
 *   Policy lab  → what each intervention does *before* anyone commits to it,
 *                 ranked, with the frozen prediction on adoption
 *   Calibration → what the model is made of (measured / estimated / assumed)
 *                 and whether it beats “tomorrow equals today” on your history
 *
 * Nothing here is a forecast and the screen says so. The value is the
 * counterfactual: two honest structures, compared.
 */

import { h, toast, svg } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, emptyState, tabs, table, kv } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { DYN_LEVERS, dynamicsBrief } from '../core/domain/dynamics.js';
import { openExperimentDialog, openAdoptDialog, openRetireDialog, openConventionsDialog } from '../ui/dynamics-modals.js';

const TABS = [
  { key: 'structure', label: 'Structure' },
  { key: 'loops', label: 'Loops' },
  { key: 'lab', label: 'Policy lab' },
  { key: 'calibration', label: 'Calibration' },
];
const TAB_KEYS = new Set(TABS.map((t) => t.key));

function provenanceBadge(source) {
  return source === 'measured'
    ? badge('Measured', 'good')
    : source === 'estimated'
      ? badge('Estimated', 'warn')
      : badge('Convention', 'neutral');
}

function polarityBadge(loop) {
  return loop.polarity === 'reinforcing' ? badge('Reinforcing', 'bad') : badge('Balancing', 'good');
}

function verdictBadge(verdict) {
  if (verdict === 'improves') return badge('Improves', 'good');
  if (verdict === 'investment') return badge('Investment', 'info');
  if (verdict === 'worsens') return badge('Worsens', 'bad');
  return badge('Neutral', 'neutral');
}

/* ------------------------------------------------------------- charts */

/**
 * A compact saturation trajectory. 100% is the “fully committed” reference;
 * the shaded band is the region above it, where the reinforcing loops live.
 * A table fallback is always rendered for screen readers and printing.
 */
function trajectoryChart(runs, { height = 210 } = {}) {
  const width = 640;
  const pad = { top: 14, right: 16, bottom: 26, left: 38 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const series = runs.filter((run) => run && run.trajectory?.length);
  if (!series.length) return null;
  const maxWeek = Math.max(...series.map((run) => run.trajectory.length - 1), 1);
  const maxValue = Math.max(120, ...series.flatMap((run) => run.trajectory.map((row) => row.saturationPct)));
  const x = (week) => pad.left + (week / maxWeek) * plotW;
  const y = (value) => pad.top + plotH - (Math.min(value, maxValue) / maxValue) * plotH;
  const line = (rows) => rows.map((row, i) => `${i === 0 ? 'M' : 'L'}${x(row.week).toFixed(1)},${y(row.saturationPct).toFixed(1)}`).join(' ');
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const value = Math.round(maxValue * f);
    return svg('g', null,
      svg('line', { x1: pad.left, x2: width - pad.right, y1: y(value), y2: y(value), class: 'chart-grid' }),
      svg('text', { x: pad.left - 6, y: y(value) + 4, class: 'chart-tick', 'text-anchor': 'end' }, `${value}%`));
  });
  const ticks = [0, Math.round(maxWeek / 4), Math.round(maxWeek / 2), Math.round((3 * maxWeek) / 4), maxWeek]
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .map((week) => svg('text', { x: x(week), y: height - 8, class: 'chart-tick', 'text-anchor': 'middle' }, `w${week}`));

  const chart = svg('svg', {
    class: 'chart-svg',
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': `Modelled saturation over ${maxWeek} weeks for ${series.length} structure${series.length === 1 ? '' : 's'}. 100% is fully committed.`,
    preserveAspectRatio: 'none',
  },
  // overload band
  svg('rect', {
    x: pad.left, y: pad.top, width: plotW, height: Math.max(0, y(100) - pad.top),
    fill: 'var(--danger-soft, rgba(190,60,60,0.08))',
  }),
  ...grid,
  svg('line', {
    x1: pad.left, x2: width - pad.right, y1: y(100), y2: y(100),
    stroke: 'var(--muted, #888)', 'stroke-dasharray': '4 3', 'stroke-width': 1,
  }),
  ...series.map((run, index) => svg('path', {
    d: line(run.trajectory),
    class: 'chart-series-line',
    fill: 'none',
    stroke: index === 0 ? 'var(--accent, #4f6bed)' : 'var(--good, #2f8f5b)',
    'stroke-width': index === 0 ? 2.2 : 1.8,
    'stroke-dasharray': index === 0 ? '' : '5 3',
  })),
  ...ticks);

  const rows = series[0].trajectory
    .filter((row) => row.week % Math.max(1, Math.round(maxWeek / 8)) === 0)
    .map((row) => ({
      week: row.week,
      yours: `${row.saturationPct}%`,
      alternative: series[1]?.trajectory?.[row.week] ? `${series[1].trajectory[row.week].saturationPct}%` : '—',
    }));

  return h('div', { class: 'chart-frame' },
    chart,
    h('div', { class: 'chart-legend' },
      h('span', { class: 'small' }, h('span', { 'aria-hidden': 'true' }, '━ '), 'Current structure'),
      series[1] ? h('span', { class: 'small' }, h('span', { 'aria-hidden': 'true' }, '┅ '), 'With the policy applied') : null),
    h('details', { class: 'chart-table-details' },
      h('summary', { class: 'small' }, 'Read the numbers instead'),
      table({
        caption: 'Modelled saturation by week',
        columns: [
          { label: 'Week', render: (r) => String(r.week) },
          { label: 'Current structure', render: (r) => r.yours },
          { label: 'With policy', render: (r) => r.alternative },
        ],
        rows,
      })));
}

/* ------------------------------------------------------------- tabs */

function structureTab(ctx, report) {
  const m = report.model;
  const s = report.simulation;
  const riskTone = report.structuralRiskPct >= 80 ? 'bad' : report.structuralRiskPct >= 65 ? 'warn' : 'good';
  const stabilityTone = report.stability.verdict === 'divergent' ? 'bad'
    : report.stability.verdict === 'weakly divergent' ? 'warn' : 'good';

  const stockRows = [
    { key: 'capacity', label: 'Delivery capacity', unit: 'person-days / week', value: m.stocks.capacity, param: 'capacityPerWeek', note: m.sources.capacityPerWeek.note },
    { key: 'wip', label: 'Work in progress', unit: 'person-days', value: m.stocks.wip, param: 'wipDays', note: m.sources.wipDays.note },
    { key: 'qualityDebt', label: 'Quality debt', unit: 'person-days owed', value: m.stocks.qualityDebt, param: 'qualityDebt', note: m.sources.qualityDebt.note },
    { key: 'pressure', label: 'Pressure', unit: '% of fully committed', value: Math.round(m.stocks.pressure * 100), param: 'pressure', note: m.sources.pressure.note },
    { key: 'dependency', label: 'Dependency concentration', unit: '% held by the top person', value: Math.round(m.stocks.dependency * 100), param: 'dependency', note: m.sources.dependency.note },
  ];

  return h('div', { class: 'view-stack' },
    h('div', { class: 'stat-grid' },
      stat({ label: 'Structural risk', value: `${report.structuralRiskPct}/100`, hint: report.structuralRiskPct >= 65 ? 'Above the threshold that opens a decision' : 'Below the decision threshold', tone: riskTone }),
      stat({ label: 'Saturation now → end', value: `${s.summary.startSaturationPct}% → ${s.summary.endSaturationPct}%`, hint: `${report.horizonWeeks}-week horizon · peak ${s.summary.peakSaturationPct}%`, tone: s.summary.saturationDeltaPct > 0 ? 'warn' : 'good' }),
      stat({ label: 'Dominant loop', value: report.simulation.summary.dominantOverall || '—', hint: `${report.loops.find((l) => l.id === report.simulation.summary.dominantOverall)?.name || 'no loop dominates'} · ${report.simulation.summary.meanSharePct[report.simulation.summary.dominantOverall] ?? 0}% of measured gain`, tone: 'neutral' }),
      stat({ label: 'Stability', value: report.stability.verdict, hint: `λ max ${report.stability.maxRealPart?.toFixed(3) ?? '—'} · characteristic time ${report.stability.characteristicTimeWeeks ?? '—'} weeks`, tone: stabilityTone }),
    ),
    card({
      title: 'The stocks that decide what is possible',
      subtitle: `Derived from your records on ${report.today}. A stock is an accumulation, not a rate: you can hire into capacity next month, but you cannot hire into this quarter’s capacity.`,
      body: table({
        caption: 'Model stocks with their provenance',
        columns: [
          { label: 'Stock', render: (r) => h('strong', null, r.label) },
          { label: 'Value', render: (r) => `${r.value === null ? '—' : r.value}` },
          { label: 'Unit', render: (r) => h('span', { class: 'muted small' }, r.unit) },
          { label: 'Provenance', render: (r) => provenanceBadge(m.sources[r.param]?.source) },
          { label: 'How it was derived', render: (r) => h('span', { class: 'small' }, r.note) },
        ],
        rows: stockRows,
      }),
    }),
    card({
      title: 'Where the current structure goes',
      subtitle: 'The solid line integrates your records forward with no intervention. The dashed line is the strongest modelled policy. Neither is a forecast — they are two consistent answers to “if this structure persists, what does it do?”',
      body: h('div', { class: 'view-stack' },
        trajectoryChart([
          s,
          report.policies.best?.scenario || null,
        ]),
        s.summary.hasSaturationClamp
          ? h('p', { class: 'small muted' }, `Bounds were hit in ${s.clampedWeeks} week(s): the linear extrapolation stops meaning anything past roughly 40% capacity loss, so the model clamps instead of inventing a cliff.`)
          : null,
        h('p', { class: 'small' }, report.stability.note)),
    }),
    card({
      title: 'What the model is, and is not',
      body: h('div', { class: 'view-stack' },
        h('p', { class: 'small' }, 'LeadOS now integrates five stocks — capacity, work in progress, quality debt, perceived pressure and dependency concentration — with Runge–Kutta 4 over weekly steps. Every flow term is tagged with the loop that owns it, which is how the next tab can measure loop dominance instead of asserting it.'),
        h('p', { class: 'small' }, 'It is calibrated by hindcasting your own work-in-progress history and scoring that hindcast against “tomorrow equals today”. If it cannot beat that, the Calibration tab says so and the curves are only a way to ask better questions.'),
        h('p', { class: 'small muted' }, 'No morale, sentiment or attrition prediction is inferred from sparse records. Departures are a rate you can see and change. The bottleneck is a system constraint, never a judgement about a person.')),
    }));
}

function loopsTab(ctx, report) {
  const dominance = report.simulation.dominance;
  const step = Math.max(1, Math.round(dominance.length / 8));
  const dominanceRows = dominance
    .filter((row, i) => i % step === 0 || i === dominance.length - 1)
    .map((row) => ({
      week: row.week,
      dominant: row.dominant ? `${row.dominant} · ${report.loops.find((l) => l.id === row.dominant)?.name || ''}` : '—',
      share: `${row.dominantSharePct}%`,
      reinforcing: `${row.shares.filter((s) => s.polarity === 'reinforcing').reduce((sum, s) => sum + s.sharePct, 0)}%`,
    }));

  const loopCards = report.loops
    .slice()
    .sort((a, b) => b.sharePct - a.sharePct)
    .map((loop) => card({
      title: `${loop.id} · ${loop.name}`,
      subtitle: `${loop.archetype} · delay ≈ ${loop.delayWeeks} week${loop.delayWeeks === 1 ? '' : 's'} · affects ${loop.fields}`,
      actions: [polarityBadge(loop), badge(`${loop.sharePct}% of gain`, loop.sharePct >= 25 ? 'warn' : 'neutral')],
      body: h('div', { class: 'view-stack' },
        h('p', { class: 'small' }, loop.description),
        loop.dominant
          ? h('p', { class: 'small' }, badge('Dominant at week 0', 'info'), ' This loop is currently the strongest feedback in the system, which is why effort spent against it feels like pushing a door that pulls.')
          : null),
    }));

  const archetypeCards = report.archetypes.findings.map((finding) => card({
    title: finding.label,
    subtitle: `Severity ${finding.severity} · detection confidence: ${report.archetypes.confidence}`,
    actions: [badge(finding.severity >= 4 ? 'Act now' : finding.severity >= 3 ? 'Watch closely' : 'Informational', finding.severity >= 4 ? 'bad' : finding.severity >= 3 ? 'warn' : 'neutral')],
    body: h('div', { class: 'view-stack' },
      h('p', { class: 'small' }, finding.summary),
      h('p', { class: 'small' }, h('strong', null, 'Repair: '), finding.repair),
      h('ul', { class: 'compact-list' }, ...finding.evidence.map((line) => h('li', { class: 'small muted' }, line)))),
  }));

  return h('div', { class: 'view-stack' },
    banner({
      tone: report.archetypes.reinforcingSharePct >= 40 ? 'caution' : 'info',
      title: `Reinforcing loops hold ${report.archetypes.reinforcingSharePct}% of measured loop gain`,
      body: 'Loop gain is measured by elasticity: how strongly each loop’s own flow responds to its own driving stock. A flow that is merely large is not dominant — a classic error when reading a systems diagram.',
    }),
    h('div', { class: 'card-grid' }, ...loopCards),
    card({
      title: 'Dominance over the horizon',
      subtitle: 'Which loop owns the system, week by week. A regime change matters more than any single number: a policy judged on its first weeks is judged on the wrong loop.',
      body: table({
        caption: 'Dominant loop by week',
        columns: [
          { label: 'Week', render: (r) => String(r.week) },
          { label: 'Dominant loop', render: (r) => r.dominant },
          { label: 'Share of gain', render: (r) => r.share },
          { label: 'Reinforcing share', render: (r) => r.reinforcing },
        ],
        rows: dominanceRows,
      }),
    }),
    h('div', { class: 'view-stack' }, ...archetypeCards),
    card({
      title: 'Leverage hierarchy (Meadows, 1999)',
      subtitle: 'Implemented as an ordered property of every lever, so the terminal can say when a leader is intervening at the weakest level — the most common structural mistake.',
      body: table({
        caption: 'Leverage classes available in the policy lab',
        columns: [
          { label: 'Class', render: (r) => String(r.leverageClass) },
          { label: 'Leverage', render: (r) => h('strong', null, r.label) },
          { label: 'Moves', render: (r) => r.leverageLabel },
          { label: 'Mechanism', render: (r) => h('span', { class: 'small' }, r.mechanism) },
        ],
        rows: DYN_LEVERS,
      }),
    }));
}

function labTab(ctx, report) {
  const playbookRows = report.policies.ranked.map((row) => ({
    ...row,
    leverage: row.strongestLeverage ? `${row.strongestLeverage.leverageClass} · ${row.strongestLeverage.label}` : '—',
  }));

  const experimentCards = report.experiments.length
    ? report.experiments.map((experiment) => card({
      title: experiment.name,
      subtitle: `${experiment.horizonWeeks}-week horizon · ${experiment.status === 'adopted' ? `adopted ${experiment.adoptedOn}` : experiment.status}${experiment.checkpointOn ? ` · checkpoint ${experiment.checkpointOn}` : ''}`,
      actions: [
        badge(experiment.status === 'adopted' ? 'Adopted' : experiment.status === 'retired' ? 'Retired' : 'Draft', experiment.status === 'adopted' ? 'info' : experiment.status === 'retired' ? 'neutral' : 'warn'),
        verdictBadge(experiment.evaluation.verdict),
      ],
      body: h('div', { class: 'view-stack' },
        h('p', { class: 'small' }, h('strong', null, 'Expectation: '), experiment.hypothesis),
        h('p', { class: 'small' },
          `Modelled: saturation ${experiment.evaluation.delta.saturationPct > 0 ? '+' : ''}${experiment.evaluation.delta.saturationPct} points, WIP ${experiment.evaluation.delta.wipDays > 0 ? '+' : ''}${experiment.evaluation.delta.wipDays} person-days, throughput ${experiment.evaluation.delta.throughputDays > 0 ? '+' : ''}${experiment.evaluation.delta.throughputDays} person-days over the horizon.`),
        experiment.predicted
          ? h('p', { class: 'small muted' }, `Frozen at adoption: ${experiment.predicted.endSaturationPct}% saturation and ${experiment.predicted.endWipDays} person-days of WIP at week ${experiment.predicted.horizonWeeks}.`)
          : null,
        experiment.checkpointDue
          ? banner({ tone: 'caution', title: 'Checkpoint passed without a review', body: 'Compare the frozen prediction with what actually happened before the memory of it softens.' })
          : null,
        h('div', { class: 'row-gap' },
          experiment.status === 'draft'
            ? h('button', { class: 'btn btn-primary btn-small', type: 'button', onClick: () => openAdoptDialog(ctx, experiment, { onDone: () => ctx.navigate('#/dynamics?tab=lab') }) }, 'Adopt…')
            : null,
          experiment.status !== 'retired'
            ? h('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => openExperimentDialog(ctx, { experiment, onSaved: () => ctx.navigate('#/dynamics?tab=lab') }) }, 'Edit')
            : null,
          experiment.status !== 'retired'
            ? h('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => openRetireDialog(ctx, experiment, { onDone: () => ctx.navigate('#/dynamics?tab=lab') }) }, 'Retire…')
            : null,
          experiment.status === 'draft'
            ? h('button', { class: 'btn btn-danger-text btn-small', type: 'button', onClick: () => { const res = ctx.api.deleteDynamicsExperiment(experiment.id); if (res.ok) { toast('Draft experiment deleted.', 'good'); ctx.navigate('#/dynamics?tab=lab'); } else toast(res.error, 'bad'); } }, 'Delete draft')
            : null),
      ),
    }))
    : [emptyState({
      icon: '◈',
      title: 'No structural experiments yet',
      body: 'An experiment is a named policy with a falsifiable expectation and a horizon. Start from one of the playbooks below, or design your own levers.',
      action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openExperimentDialog(ctx, { onSaved: () => ctx.navigate('#/dynamics?tab=lab') }) }, 'Design an experiment'),
    })];

  return h('div', { class: 'view-stack' },
    card({
      title: 'Your experiments',
      subtitle: 'Only the inputs are stored. Every trajectory is recomputed from your records on each read, so an experiment can never drift away from the data it describes.',
      actions: [h('button', { class: 'btn btn-primary btn-small', type: 'button', onClick: () => openExperimentDialog(ctx, { onSaved: () => ctx.navigate('#/dynamics?tab=lab') }) }, 'New experiment')],
      body: h('div', { class: 'view-stack' }, ...experimentCards),
    }),
    card({
      title: 'Playbook: six structural interventions, ranked on your own model',
      subtitle: 'These are simulated, not recommended. A playbook that helps another team can make yours worse, and the ranking is only as good as the provenance split on the calibration tab.',
      body: table({
        caption: 'Playbook interventions compared with doing nothing',
        columns: [
          { label: 'Intervention', render: (r) => h('strong', null, r.name) },
          { label: 'Hypothesis', render: (r) => h('span', { class: 'small muted' }, r.hypothesis) },
          { label: 'Strongest leverage', render: (r) => h('span', { class: 'small' }, r.leverage) },
          { label: 'Δ saturation', render: (r) => `${r.delta.saturationPct > 0 ? '+' : ''}${r.delta.saturationPct} pts` },
          { label: 'Δ WIP', render: (r) => `${r.delta.wipDays > 0 ? '+' : ''}${r.delta.wipDays}d` },
          { label: 'Δ throughput', render: (r) => `${r.delta.throughputDays > 0 ? '+' : ''}${r.delta.throughputDays}d` },
          { label: 'Verdict', render: (r) => verdictBadge(r.verdict) },
          {
            label: 'Action',
            render: (r) => h('button', {
              class: 'btn btn-ghost btn-tiny',
              type: 'button',
              onClick: () => openExperimentDialog(ctx, {
                experiment: {
                  name: r.name,
                  hypothesis: r.hypothesis,
                  horizonWeeks: report.horizonWeeks,
                  levers: r.levers,
                  ownerId: '',
                  notes: `Started from the ${r.name} playbook.`,
                },
                onSaved: () => ctx.navigate('#/dynamics?tab=lab'),
              }),
            }, 'Start from this'),
          },
        ],
        rows: playbookRows,
      }),
    }),
    card({
      title: 'Model conventions',
      subtitle: 'The assumptions the model cannot derive from records. Every one is labelled “convention” in the provenance table.',
      actions: [h('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => openConventionsDialog(ctx, report, { onDone: () => ctx.navigate('#/dynamics?tab=lab') }) }, 'Edit conventions…')],
      body: table({
        caption: 'Model conventions',
        columns: [
          { label: 'Convention', render: (r) => r.label },
          { label: 'Value', render: (r) => String(r.value) },
          { label: 'Meaning', render: (r) => h('span', { class: 'small muted' }, r.note) },
        ],
        rows: [
          { label: 'Simulated horizon', value: `${report.horizonWeeks} weeks`, note: 'How far the integrator runs. Longer horizons show regime changes; shorter ones flatter parameter fixes.' },
          { label: 'Healthy WIP', value: `${report.model.params.targetWipWeeks} weeks`, note: report.model.sources.targetWipWeeks.note },
          { label: 'Pressure delay', value: `${report.model.params.pressureLagWeeks} weeks`, note: report.model.sources.pressureLagWeeks.note },
          { label: 'Quality-debt repayment', value: `${report.model.params.qualityFixWeeks} weeks`, note: report.model.sources.qualityFixWeeks.note },
          { label: 'Ramp window', value: `${report.model.params.rampWeeks} weeks`, note: report.model.sources.rampWeeks.note },
          { label: 'Structural-risk threshold', value: `${ctx.state.settings?.dynamicsStructuralRiskPct ?? 65}/100`, note: 'The score at which the post-commit rule opens a DACI structural decision. It never changes the system by itself.' },
        ],
      }),
    }));
}

function calibrationTab(ctx, report) {
  const provenanceRows = Object.entries(report.model.sources).map(([key, source]) => ({
    key,
    value: source.value,
    source: source.source,
    note: source.note,
  }));
  const cal = report.calibration;
  const coverage = report.provenance.assumedPct;

  const hindcastBody = cal && cal.status === 'scored'
    ? h('div', { class: 'view-stack' },
      h('div', { class: 'stat-grid' },
        stat({ label: 'Hindcast skill', value: `${cal.skill}`, hint: '1 = perfect, 0 = no better than persistence, negative = worse', tone: cal.skill > 0.2 ? 'good' : cal.skill > 0 ? 'warn' : 'bad' }),
        stat({ label: 'MASE', value: `${cal.mase}`, hint: 'Model error ÷ naive-persistence error', tone: cal.mase !== null && cal.mase < 1 ? 'good' : 'bad' }),
        stat({ label: 'RMSE', value: `${cal.rmse} pd`, hint: `Naive baseline ${cal.naiveRmse} pd`, tone: 'neutral' }),
        stat({ label: 'Bias', value: `${cal.bias} pd`, hint: cal.bias > 0 ? 'Model over-predicts WIP' : cal.bias < 0 ? 'Model under-predicts WIP' : 'No systematic bias', tone: 'neutral' }),
      ),
      h('p', { class: 'small' }, `Verdict: ${cal.verdict}. ${cal.note}`),
      table({
        caption: 'Hindcast: modelled versus observed weekly work in progress',
        columns: [
          { label: 'Week', render: (r) => String(r.week) },
          { label: 'Observed WIP (pd)', render: (r) => String(r.actual) },
          { label: 'Modelled WIP (pd)', render: (r) => String(r.predicted) },
          { label: 'Error', render: (r) => `${r.error > 0 ? '+' : ''}${r.error}` },
        ],
        rows: cal.predicted.map((value, index) => ({
          week: cal.observed.series[index]?.weekStart || index,
          actual: cal.actual[index],
          predicted: value,
          error: Math.round((value - cal.actual[index]) * 100) / 100,
        })),
      }),
      h('p', { class: 'small muted' }, `Completeness: ${cal.observed.completenessPct}% of portfolio records carry dated lifecycle information (${cal.observed.undatedRecords} undated, ${cal.observed.closedWithoutDate} closed without a delivery date).`))
    : h('div', { class: 'view-stack' },
      banner({ tone: 'info', title: 'Not enough dated history to score the model', body: cal?.reason || 'The Lab needs dated lifecycle records before it will claim any accuracy.' }),
      h('p', { class: 'small muted' }, 'An unscored model is not a broken model — it is an unproven one. The terminal refuses to draw a confidence claim it cannot support.'));

  return h('div', { class: 'view-stack' },
    banner({
      tone: coverage >= 40 ? 'caution' : 'good',
      title: `${coverage}% of the model's parameters are conventions, not measurements`,
      body: `${report.provenance.measured} measured · ${report.provenance.estimated} estimated · ${report.provenance.assumed} assumed. Each assumption is listed below with the note explaining what it is standing in for.`,
    }),
    card({
      title: 'Does the model beat “tomorrow equals today”?',
      subtitle: 'A structural model earns authority by hindcasting your own history, not by looking convincing.',
      body: hindcastBody,
    }),
    card({
      title: 'Every parameter, with its provenance',
      subtitle: 'Measured means derived from a record. Estimated means derived from a small sample. Convention means a stated assumption you can change in Model conventions.',
      body: table({
        caption: 'Model parameters and their provenance',
        columns: [
          { label: 'Parameter', render: (r) => h('code', null, r.key) },
          { label: 'Value', render: (r) => String(r.value) },
          { label: 'Provenance', render: (r) => provenanceBadge(r.source) },
          { label: 'Basis', render: (r) => h('span', { class: 'small' }, r.note) },
        ],
        rows: provenanceRows,
      }),
    }),
    card({
      title: 'How to make this model better',
      body: h('div', { class: 'view-stack' },
        h('p', { class: 'small' }, 'The trajectory is only as good as its weakest assumption, and most of the weak ones are evidence debts rather than code problems:'),
        h('ul', { class: 'compact-list' },
          h('li', { class: 'small' }, 'Record delivered effort and value on settled work — that converts demand and throughput from estimates into measurements.'),
          h('li', { class: 'small' }, 'Log departures with a date so attrition stops being a convention.'),
          h('li', { class: 'small' }, 'Keep incident reserves open while the incident is live: they are the only record of quality debt the model trusts.'),
          h('li', { class: 'small' }, 'Record critical stewardships on operational dependencies so concentration is measured, not assumed.')),
        h('p', { class: 'small muted' }, 'None of this is telemetry. It is the same record-keeping the rest of the workspace already asks for.')),
    }));
}

/* ------------------------------------------------------------- page */

export function renderDynamics(ctx) {
  const report = ctx.api.dynamicsReport ? ctx.api.dynamicsReport() : null;
  // The view reads the same derived report the actions use; computing it here
  // keeps a render side-effect free and guarantees the numbers on screen are
  // the numbers the rules act on.
  const dynamicReport = report && report.adequate !== undefined ? report : null;
  if (!dynamicReport) {
    return h('div', { class: 'page' },
      h('p', { class: 'muted' }, 'The dynamics engine could not be loaded for this screen.'));
  }
  // `ctx.query` is a URLSearchParams on every route (see main.js parseRoute).
  const requested = ctx.query && typeof ctx.query.get === 'function' ? ctx.query.get('tab') : ctx.query?.tab;
  const active = TAB_KEYS.has(requested) ? requested : 'structure';

  const body = !dynamicReport.adequate
    ? emptyState({
      icon: '∿',
      title: 'Not enough of a system to simulate yet',
      body: dynamicReport.reason,
      action: h('a', { class: 'btn btn-secondary', href: '#/people' }, 'Open the roster'),
    })
    : active === 'loops' ? loopsTab(ctx, dynamicReport)
      : active === 'lab' ? labTab(ctx, dynamicReport)
        : active === 'calibration' ? calibrationTab(ctx, dynamicReport)
          : structureTab(ctx, dynamicReport);

  return h('div', { class: 'page' },
    pageHeader({
      eyebrow: 'Schema v37 · stock-and-flow · loop dominance · policy lab',
      title: 'Operating system dynamics',
      subtitle: 'Your team is a system, not a list. This terminal accumulates what you already record into stocks, integrates the loops those stocks create, and lets you test a structural intervention before you spend a quarter on it.',
      meta: dynamicReport.adequate
        ? h('div', { class: 'badge-row' },
          badge(`Structural risk ${dynamicReport.structuralRiskPct}/100`, dynamicReport.structuralRiskPct >= 65 ? 'warn' : 'good'),
          badge(`${dynamicReport.provenance.assumedPct}% conventions`, dynamicReport.provenance.assumedPct >= 40 ? 'warn' : 'neutral'),
          dynamicReport.experiments.length ? badge(`${dynamicReport.experiments.length} experiment${dynamicReport.experiments.length === 1 ? '' : 's'}`, 'neutral') : null)
        : null,
      actions: [
        h('button', {
          class: 'btn btn-ghost btn-small',
          type: 'button',
          onClick: () => {
            downloadText({
              filename: `leados-dynamics-brief-${dynamicReport.today}.md`,
              text: dynamicsBrief(ctx.state, ctx.now),
              mime: 'text/markdown',
            });
            toast('Brief downloaded.', 'good');
          },
        }, 'Board brief'),
        h('button', {
          class: 'btn btn-secondary btn-small',
          type: 'button',
          onClick: () => {
            const result = ctx.api.scanDynamics();
            if (!result.ok) {
              toast(result.reason || result.error || 'The scan could not run.', 'bad');
              return;
            }
            const propagated = Array.isArray(result.propagations) ? result.propagations.length : 0;
            toast(propagated
              ? `Scan complete — ${propagated} structural follow-up${propagated === 1 ? '' : 's'} propagated automatically.`
              : 'Scan complete — no new structural follow-up was needed.', propagated ? 'good' : 'neutral');
            ctx.navigate(`#/dynamics?tab=${active}`);
          },
        }, 'Scan now'),
      ],
    }),
    ctx.warnings && ctx.warnings.length
      ? banner({ tone: 'caution', title: 'Workspace warnings', body: h('ul', { class: 'compact-list' }, ...ctx.warnings.slice(0, 4).map((w) => h('li', { class: 'small' }, String(w)))) })
      : null,
    dynamicReport.adequate
      ? tabs({
        items: TABS,
        active,
        ariaLabel: 'Dynamics sections',
        onSelect: (key) => ctx.navigate(`#/dynamics?tab=${key}`),
      })
      : null,
    body,
    dynamicReport.adequate
      ? h('p', { class: 'disclosure small muted' },
        `Engine ${dynamicReport.engineVersion}. RK4 weekly integration of five stocks; loop gain by elasticity; stability from the numerically linearised system (Faddeev–LeVerrier plus Durand–Kerner). A structural model, not a forecast, and never a judgement about a person.`)
      : null);
}
