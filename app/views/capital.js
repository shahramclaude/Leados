/**
 * app/views/capital.js — Structural Capital Allocation (`#/capital`, Schema v38).
 *
 * Four tabs in the order a leader actually has to think:
 *
 *   Plan        → what the effort budget buys, what the next effort-week would
 *                 have bought, and what the model's trust grade permits anyone
 *                 to claim about it
 *   Attribution → which lever owns the gain, which pairs compete for the same
 *                 constrained resource, and whether the shares add up
 *   Robustness  → how the plan behaves across seeded parameter draws, and
 *                 whether a simpler option has a better worst case
 *   Checkpoints → the out-of-sample ledger: score the frozen prediction, see
 *                 what the model has earned, and read exactly what would
 *                 promote it
 *
 * Nothing here is a forecast and the screen says so on every tab. The product
 * claim is narrower and more useful: *this comparison is priced, attributed and
 * graded, and here is the evidence that would change it.*
 */

import { h, svg, toast } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, emptyState, tabs, table, kv } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import {
  CAP_TRUST_GRADES,
  capitalBrief,
} from '../core/domain/policyPortfolio.js';
import {
  openCapitalPolicyDialog,
  openCapitalAdoptDialog,
  openCapitalRetireDialog,
  openCapitalConventionsDialog,
  openCheckpointDialog,
} from '../ui/capital-modals.js';

const TABS = [
  { key: 'plan', label: 'Plan' },
  { key: 'attribution', label: 'Attribution' },
  { key: 'robustness', label: 'Robustness' },
  { key: 'checkpoints', label: 'Checkpoints' },
];
const TAB_KEYS = new Set(TABS.map((tab) => tab.key));

function money(n, unit = '') {
  return `${n}${unit ? ` ${unit}` : ''}`;
}

function signed(n, unit = '') {
  const value = Number(n) || 0;
  return `${value > 0 ? '+' : ''}${value}${unit ? ` ${unit}` : ''}`;
}

function trustBadge(trust) {
  return badge(trust?.label || 'Unvalidated', trust?.tone || 'bad');
}

function statusBadge(status) {
  if (status === 'adopted') return badge('Adopted', 'good');
  if (status === 'retired') return badge('Retired', 'neutral');
  return badge('Draft', 'info');
}

function verdictBadge(verdict) {
  if (verdict === 'beats-persistence') return badge('Beats persistence', 'good');
  if (verdict === 'no-better-than-persistence') return badge('Lost to persistence', 'bad');
  if (verdict === 'indistinguishable') return badge('Indistinguishable', 'warn');
  if (verdict === 'no-baseline') return badge('No baseline frozen', 'warn');
  return badge('Unscorable', 'neutral');
}

/* ------------------------------------------------------------- charts */

/**
 * The efficient frontier traced by the allocation path: composite utility
 * against effort-weeks. The slope is the marginal return on the binding
 * constraint, which is the whole argument for allocating rather than ranking.
 */
function frontierChart(path, { height = 230 } = {}) {
  const points = (path?.points || []).filter((p) => Number.isFinite(p.effort) && Number.isFinite(p.score));
  if (points.length < 2) return null;
  const width = 640;
  const pad = { top: 16, right: 18, bottom: 30, left: 42 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const maxEffort = Math.max(1, ...points.map((p) => p.effort));
  const maxScore = Math.max(1, ...points.map((p) => p.score));
  const x = (effort) => pad.left + (effort / maxEffort) * plotW;
  const y = (score) => pad.top + plotH - (Math.max(0, score) / maxScore) * plotH;
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.effort).toFixed(1)},${y(p.score).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points[points.length - 1].effort).toFixed(1)},${pad.top + plotH} L${x(points[0].effort).toFixed(1)},${pad.top + plotH} Z`;
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const value = Math.round(maxScore * f);
    return svg('g', null,
      svg('line', { x1: pad.left, x2: width - pad.right, y1: y(value), y2: y(value), class: 'chart-grid' }),
      svg('text', { x: pad.left - 6, y: y(value) + 4, class: 'chart-tick', 'text-anchor': 'end' }, String(value)));
  });
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const value = Math.round(maxEffort * f * 10) / 10;
    return svg('text', { x: x(value), y: height - 8, class: 'chart-tick', 'text-anchor': 'middle' }, `${value}w`);
  });
  return h('div', { class: 'chart-frame' },
    svg('svg', {
      class: 'chart-svg',
      viewBox: `0 0 ${width} ${height}`,
      role: 'img',
      'aria-label': `Efficient frontier: composite utility rises from 0 to ${Math.round(maxScore)} as effort rises from 0 to ${maxEffort} effort-weeks across ${points.length} accepted increments.`,
      preserveAspectRatio: 'none',
    },
    svg('path', { d: area, fill: 'var(--accent-soft, rgba(79,107,237,0.10))' }),
    ...grid,
    ...ticks,
    svg('path', { d: line, fill: 'none', stroke: 'var(--accent, #4f6bed)', 'stroke-width': 2.2 }),
    ...points.slice(1).map((p) => svg('circle', { cx: x(p.effort), cy: y(p.score), r: 2.4, fill: 'var(--accent, #4f6bed)' }))),
    h('div', { class: 'chart-legend' },
      h('span', { class: 'small' }, h('span', { 'aria-hidden': 'true' }, '━ '), 'Composite utility vs effort spent'),
      h('span', { class: 'small muted' }, 'Slope = marginal return on the binding constraint')),
    h('details', { class: 'chart-table-details' },
      h('summary', { class: 'small' }, 'Read the numbers instead'),
      table({
        caption: 'Efficient frontier',
        columns: [
          { label: 'Effort-weeks', render: (row) => String(row.effort) },
          { label: 'Composite utility', render: (row) => String(row.score) },
        ],
        rows: points,
      })));
}

/* ------------------------------------------------------------- trust banner */

function trustBanner(trust, { compact = false } = {}) {
  const tone = trust?.tone === 'good' ? 'success' : trust?.tone === 'warn' || trust?.tone === 'info' ? 'caution' : 'danger';
  return banner({
    tone,
    title: `Model trust: ${trust?.label || 'Unvalidated'} — ${trust?.recommendation === 'actionable' ? 'actionable' : trust?.recommendation === 'directional' ? 'directional only' : 'comparative only'}`,
    body: h('div', { class: 'view-stack' },
      h('p', { class: 'small' }, trust?.meaning || ''),
      !compact && trust?.blockers?.length
        ? h('div', null,
          h('p', { class: 'small' }, h('strong', null, 'What would promote it')),
          h('ul', { class: 'compact-list' }, ...trust.blockers.map((line) => h('li', { class: 'small' }, line))))
        : null),
  });
}

/* ------------------------------------------------------------- plan tab */

function planTab(ctx, report) {
  const allocation = report.allocation;
  const evaluation = report.evaluation;
  const objective = report.objective;
  const delta = evaluation.delta;
  const steps = allocation.steps;
  const marginalByLever = new Map();
  for (const step of steps) {
    const row = marginalByLever.get(step.key) || { key: step.key, label: step.label, effort: 0, gain: 0 };
    row.effort = Math.round((row.effort + step.effort) * 100) / 100;
    row.gain = Math.round((row.gain + step.gain) * 100) / 100;
    marginalByLever.set(step.key, row);
  }
  const leverRows = (allocation.effortRows || []).map((row) => {
    const marginal = marginalByLever.get(row.key) || { effort: 0, gain: 0 };
    return {
      ...row,
      marginalGain: marginal.gain,
      returnPerEffort: row.effort > 0 ? Math.round((marginal.gain / row.effort) * 100) / 100 : null,
    };
  });

  return h('div', { class: 'view-stack' },
    trustBanner(report.trust),
    h('div', { class: 'stat-grid' },
      stat({
        label: 'Effort allocated',
        value: `${allocation.effort} / ${report.budgetUnits}`,
        hint: `${allocation.remaining} effort-weeks unspent`,
        tone: allocation.remaining >= report.budgetUnits * 0.25 ? 'warn' : '',
      }),
      stat({ label: 'Composite utility', value: String(objective.score), hint: 'Weighted relative gain, 0 = doing nothing' }),
      stat({
        label: 'Perceived pressure',
        value: `${evaluation.scenario.summary.endSaturationPct}%`,
        hint: `${signed(delta.saturationPct, 'pts')} vs doing nothing`,
        tone: delta.saturationPct < 0 ? 'good' : delta.saturationPct > 0 ? 'bad' : '',
      }),
      stat({
        label: 'Throughput',
        value: signed(delta.throughputDays),
        hint: 'Cumulative person-days over the horizon — reported even when it falls',
        tone: delta.throughputDays < 0 ? 'warn' : 'good',
      }),
      stat({
        label: 'Capacity',
        value: `${evaluation.scenario.summary.endCapacityPerWeek}`,
        hint: `${signed(delta.capacityPerWeek)} person-days/week at week ${evaluation.scenario.horizonWeeks}`,
      }),
      stat({
        label: 'Work in progress',
        value: `${evaluation.scenario.summary.endWipDays}`,
        hint: `${signed(delta.wipDays)} person-days`,
        tone: delta.wipDays < 0 ? 'good' : '',
      })),

    // The four weighted components, so the composite cannot hide a trade-off.
    h('div', { class: 'callout callout-subtle' },
      h('p', { class: 'small' }, h('strong', null, 'How the composite is built. '),
        'Each outcome is expressed as a relative gain against doing nothing, clamped to ±1 so no single metric owns the result, then weighted. The weights are conventions you can change; the raw deltas above are not.'),
      table({
        caption: 'Composite components',
        columns: [
          { label: 'Objective', render: (row) => row.label },
          { label: 'Weight', render: (row) => String(row.weight) },
          { label: 'Relative gain (×100)', render: (row) => String(row.value) },
          { label: 'Contribution', render: (row) => String(row.contribution) },
        ],
        rows: [
          { label: 'Perceived pressure', weight: objective.weights.saturation, value: objective.parts.saturation, contribution: Math.round(objective.weights.saturation * objective.parts.saturation * 100) / 100 },
          { label: 'Throughput', weight: objective.weights.throughput, value: objective.parts.throughput, contribution: Math.round(objective.weights.throughput * objective.parts.throughput * 100) / 100 },
          { label: 'Capacity', weight: objective.weights.capacity, value: objective.parts.capacity, contribution: Math.round(objective.weights.capacity * objective.parts.capacity * 100) / 100 },
          { label: 'Work in progress', weight: objective.weights.wip, value: objective.parts.wip, contribution: Math.round(objective.weights.wip * objective.parts.wip * 100) / 100 },
        ],
      })),

    card({
      title: 'The portfolio the budget buys',
      subtitle: 'Ranked by marginal return on the binding constraint, not by raw return. Effort costs are stated conventions, editable in Model conventions.',
      actions: [
        h('button', {
          class: 'btn btn-primary btn-small',
          type: 'button',
          onClick: () => openCapitalPolicyDialog(ctx, {
            preset: allocation.levers,
            budgetUnits: report.budgetUnits,
            weights: report.weights,
            horizonWeeks: report.horizonWeeks,
            onSaved: () => ctx.navigate('#/capital?tab=checkpoints'),
          }),
        }, 'Save this portfolio'),
      ],
      body: leverRows.length
        ? table({
          caption: 'Funded levers',
          columns: [
            { label: 'Lever', render: (row) => h('div', null, h('strong', null, row.label), h('p', { class: 'small muted' }, row.leverageLabel)) },
            { label: 'Funded', render: (row) => `${row.value} ${row.unit}`, className: 'num' },
            { label: 'Effort', render: (row) => money(row.effort, 'weeks'), className: 'num' },
            { label: 'Modelled gain', render: (row) => String(row.marginalGain), className: 'num' },
            { label: 'Gain per week', render: (row) => (row.returnPerEffort === null ? '—' : String(row.returnPerEffort)), className: 'num' },
          ],
          rows: leverRows,
        })
        : emptyState({
          title: 'No lever clears its cost at this budget',
          body: 'Every increment costs more effort than the modelled gain returns. That is an answer: this structure does not repay parameter relief inside this horizon. Raise the budget, change the horizon, or intervene at the loop rather than the lever.',
          action: h('button', { class: 'btn btn-secondary btn-small', type: 'button', onClick: () => openCapitalConventionsDialog(ctx, report, { onDone: () => ctx.navigate('#/capital?tab=plan') }) }, 'Change the budget or weights'),
        }),
    }),

    card({
      title: 'Marginal return curve',
      subtitle: 'Every accepted increment, plotted as utility against effort. The flat tail is where the model stops rewarding more spending — the honest place to stop.',
      body: h('div', { class: 'view-stack' },
        frontierChart(allocation.path),
        h('p', { class: 'small muted' }, allocation.note)),
    }),

    h('div', { class: 'callout callout-subtle' },
      h('p', { class: 'small' }, h('strong', null, 'Why this and not the playbook? '),
        'A playbook ranks one lever at a time. The allocation spends a fixed budget across levers and prices the complementarities — the reason two moderate moves can beat one large one. The Robustness tab shows whether that still holds when the coefficients move.')),
  );
}

/* ------------------------------------------------------------- attribution tab */

function attributionTab(ctx, report) {
  const attribution = report.attribution;
  const pairs = report.pairs;
  return h('div', { class: 'view-stack' },
    card({
      title: 'Who owns the gain',
      subtitle: `Exact Shapley values over all ${attribution.coalitions} coalitions of the funded levers. This attributes gain inside the model — it is not observed causality.`,
      body: attribution.contributions.length
        ? h('div', { class: 'view-stack' },
          table({
            caption: 'Shapley attribution',
            columns: [
              { label: 'Lever', render: (row) => h('div', null, h('strong', null, row.label), h('p', { class: 'small muted' }, row.leverageLabel)) },
              { label: 'Funded', render: (row) => String(row.value), className: 'num' },
              { label: 'Marginal gain', render: (row) => String(row.marginal), className: 'num' },
              { label: 'Share', render: (row) => (row.sharePct === null ? '—' : `${row.sharePct}%`), className: 'num' },
            ],
            rows: attribution.contributions,
          }),
          h('div', { class: 'badge-row' },
            badge(`Joint gain ${attribution.total}`, 'info'),
            badge(`Attributed total ${Math.round(attribution.contributions.reduce((sum, row) => sum + row.marginal, 0) * 100) / 100}`, 'neutral'),
            badge(`Efficiency gap ${attribution.efficiencyGap}`, Math.abs(attribution.efficiencyGap) < 0.05 ? 'good' : 'warn')),
          h('p', { class: 'small muted' }, 'The efficiency identity is the check: if the attributed values do not add up to the joint gain, the attribution is wrong. A negative marginal value is real — a lever can pay only in combination, or cost throughput inside this horizon.'))
        : emptyState({ title: 'Nothing funded to attribute', body: 'Save a portfolio or raise the budget so the allocator funds a lever.' }),
    }),

    card({
      title: 'Substitutes and complements',
      subtitle: 'Interaction = joint gain − the two gains measured separately. Negative means the levers compete for the same constrained resource; positive means neither pays alone.',
      body: pairs?.pairs?.length
        ? h('div', { class: 'view-stack' },
          table({
            caption: 'Pair interactions',
            columns: [
              { label: 'Pair', render: (row) => `${row.aLabel} × ${row.bLabel}` },
              { label: 'Solo A', render: (row) => String(row.soloA), className: 'num' },
              { label: 'Solo B', render: (row) => String(row.soloB), className: 'num' },
              { label: 'Joint', render: (row) => String(row.joint), className: 'num' },
              { label: 'Interaction', render: (row) => signed(row.interaction), className: 'num' },
              { label: 'Reading', render: (row) => (row.kind === 'substitute' ? badge('Substitutes', 'warn') : row.kind === 'complement' ? badge('Complements', 'good') : badge('Additive', 'neutral')) },
            ],
            rows: pairs.pairs,
          }),
          h('p', { class: 'small muted' }, pairs.note))
        : emptyState({ title: 'Two levers are needed', body: 'Fund at least two levers before substitutability can be measured.' }),
    }),
  );
}

/* ------------------------------------------------------------- robustness tab */

function robustnessTab(ctx, report) {
  const robust = report.robustness;
  return h('div', { class: 'view-stack' },
    h('div', { class: 'stat-grid' },
      stat({ label: 'Win rate', value: `${robust.portfolio.winRatePct}%`, hint: `Best or tied in ${robust.draws} seeded parameter draws`, tone: robust.portfolio.winRatePct >= 50 ? 'good' : 'warn' }),
      stat({ label: 'Worst-case regret', value: String(robust.portfolio.maxRegret), hint: 'Utility points lost against the best option in the worst draw' }),
      stat({
        label: 'Regret rank',
        value: `#${robust.portfolio.regretRank}`,
        hint: robust.portfolio.isMinimax ? 'The minimax-regret choice' : `Minimax choice: ${robust.minimax.label}`,
        tone: robust.portfolio.isMinimax ? 'good' : 'warn',
      }),
      stat({ label: 'P10 / P90 score', value: `${robust.portfolio.p10} / ${robust.portfolio.p90}`, hint: 'Seeded lognormal parameter draws' })),

    card({
      title: 'Savage minimax regret across the options',
      subtitle: 'Regret is measured against the best option available in each draw, so an option that is average everywhere is distinguishable from one that is brilliant in a single world.',
      body: h('div', { class: 'view-stack' },
        table({
          caption: 'Options under parameter uncertainty',
          columns: [
            { label: 'Option', render: (row) => h('div', null, h('strong', null, row.label), h('p', { class: 'small muted' }, row.kind === 'baseline' ? 'Do nothing' : `${row.effort} effort-weeks`)) },
            { label: 'Mean', render: (row) => String(row.meanScore), className: 'num' },
            { label: 'P10', render: (row) => String(row.p10), className: 'num' },
            { label: 'P90', render: (row) => String(row.p90), className: 'num' },
            { label: 'Max regret', render: (row) => String(row.maxRegret), className: 'num' },
            { label: 'Mean regret', render: (row) => String(row.meanRegret), className: 'num' },
            { label: 'Wins', render: (row) => `${row.winRatePct}%`, className: 'num' },
          ],
          rows: robust.options,
        }),
        h('p', { class: 'small muted' }, robust.note)),
    }),

    card({
      title: 'What a bad draw looks like',
      subtitle: 'The portfolio’s P10 outcome is what happens when the structural coefficients move against it. If the P10 is worse than doing nothing, the plan is a bet, not a hedge.',
      body: h('div', { class: 'view-stack' },
        h('div', { class: 'badge-row' },
          badge(`P10 ${robust.portfolio.p10}`, robust.portfolio.p10 >= 0 ? 'good' : 'bad'),
          badge(`Median ${robust.portfolio.meanScore}`, 'neutral'),
          badge(`P90 ${robust.portfolio.p90}`, 'neutral'),
          badge(`Options compared ${robust.options.length}`, 'neutral')),
        h('p', { class: 'small muted' }, `Assumed coefficients moved with a lognormal CV of ${robust.cv}, seed ${robust.seed}: ${robust.assumedKeys.join(', ')}. Regret is sensitivity to those assumptions, not a probability of the future.`)),
    }),
  );
}

/* ------------------------------------------------------------- checkpoint tab */

function checkpointTab(ctx, report) {
  const adopted = report.policies.filter((policy) => policy.status === 'adopted');
  const ladder = Object.entries(CAP_TRUST_GRADES)
    .sort((a, b) => b[1].rank - a[1].rank)
    .map(([key, meta]) => ({ key, ...meta, current: key === report.trust.grade }));
  const firstWithReason = report.checkpoints.find((row) => row.scoring?.reason);
  const scoredCount = report.checkpoints.filter((row) => Number.isFinite(row.scoring?.skill)).length;

  return h('div', { class: 'view-stack' },
    trustBanner(report.trust),

    card({
      title: 'The trust ladder',
      subtitle: 'A comparison can be useful on an unvalidated model. Only an out-of-sample-validated model earns the word “actionable”, and every rung names what it needs.',
      body: table({
        caption: 'Model trust ladder',
        columns: [
          { label: 'Grade', render: (row) => h('div', { class: 'badge-row' }, badge(row.label, row.tone), row.current ? badge('Current', 'info') : null) },
          { label: 'What it means', render: (row) => h('p', { class: 'small' }, row.meaning) },
          { label: 'Recommendation', render: (row) => row.recommendation },
        ],
        rows: ladder,
      }),
    }),

    card({
      title: 'Portfolios',
      subtitle: 'Adoption freezes the prediction, the do-nothing baseline and the attribution. The checkpoint is how the model earns the right to be believed.',
      actions: [
        h('button', {
          class: 'btn btn-secondary btn-small',
          type: 'button',
          onClick: () => openCapitalPolicyDialog(ctx, {
            preset: report.allocation.levers,
            budgetUnits: report.budgetUnits,
            weights: report.weights,
            horizonWeeks: report.horizonWeeks,
            onSaved: () => ctx.navigate('#/capital?tab=checkpoints'),
          }),
        }, 'New portfolio'),
      ],
      body: report.policies.length
        ? table({
          caption: 'Capital portfolios',
          columns: [
            { label: 'Portfolio', render: (row) => h('div', null, h('strong', null, row.name), h('p', { class: 'small muted' }, row.hypothesis)) },
            { label: 'Status', render: (row) => statusBadge(row.status) },
            { label: 'Budget / spend', render: (row) => `${row.budgetUnits} / ${row.effort}`, className: 'num' },
            { label: 'Checkpoint', render: (row) => row.checkpointOn || '—' },
            { label: 'Scored', render: (row) => (row.scoring.n < 2 ? `${row.scoring.n} (counts only)` : `${row.scoring.n} · skill ${row.scoring.skill}`) },
            {
              label: 'Actions',
              render: (row) => h('div', { class: 'button-row' },
                row.status === 'draft'
                  ? h('button', { class: 'btn btn-primary btn-small', type: 'button', onClick: () => openCapitalAdoptDialog(ctx, row, { onDone: () => ctx.navigate('#/capital?tab=checkpoints') }) }, 'Adopt')
                  : null,
                row.status === 'adopted'
                  ? h('button', { class: 'btn btn-secondary btn-small', type: 'button', onClick: () => openCheckpointDialog(ctx, { subjectType: 'policy', subjectId: row.id, label: row.name, checkpointOn: row.checkpointOn }, { onDone: () => ctx.navigate('#/capital?tab=checkpoints') }) }, 'Record checkpoint')
                  : null,
                row.status !== 'retired'
                  ? h('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => openCapitalRetireDialog(ctx, row, { onDone: () => ctx.navigate('#/capital?tab=checkpoints') }) }, 'Retire')
                  : null,
                row.status === 'draft'
                  ? h('button', {
                    class: 'btn btn-danger-text btn-small',
                    type: 'button',
                    onClick: () => {
                      const result = ctx.api.deleteCapitalPolicy(row.id);
                      if (!result.ok) {
                        toast(result.error, 'bad');
                        return;
                      }
                      toast('Draft portfolio deleted.', 'good');
                      ctx.navigate('#/capital?tab=checkpoints');
                    },
                  }, 'Delete draft')
                  : null),
            },
          ],
          rows: report.policies,
        })
        : emptyState({
          title: 'No portfolio on the record yet',
          body: 'The allocator computes a recommendation on every visit, but a recommendation is not a commitment. Save one to freeze a prediction and open its checkpoint.',
          action: h('button', {
            class: 'btn btn-primary btn-small',
            type: 'button',
            onClick: () => openCapitalPolicyDialog(ctx, {
              preset: report.allocation.levers,
              budgetUnits: report.budgetUnits,
              weights: report.weights,
              horizonWeeks: report.horizonWeeks,
              onSaved: () => ctx.navigate('#/capital?tab=checkpoints'),
            }),
          }, 'Save the recommended portfolio'),
        }),
    }),

    card({
      title: 'Out-of-sample ledger',
      subtitle: 'Each row is a human-recorded observation scored against the prediction frozen at adoption. Skill = 1 − model error ÷ naive-persistence error; positive means it beat “tomorrow equals today”.',
      body: report.checkpoints.length
        ? h('div', { class: 'view-stack' },
          table({
            caption: 'Checkpoint ledger',
            columns: [
              { label: 'Recorded', render: (row) => row.recordedOn },
              { label: 'Grades', render: (row) => row.subjectLabel },
              { label: 'Kind', render: (row) => row.subjectType },
              { label: 'Mean abs error', render: (row) => (row.scoring?.mae === null ? '—' : String(row.scoring.mae)), className: 'num' },
              { label: 'Naive error', render: (row) => (row.scoring?.naiveMae === null ? '—' : String(row.scoring.naiveMae)), className: 'num' },
              { label: 'Skill', render: (row) => (row.scoring?.skill === null || row.scoring?.skill === undefined ? 'withheld' : String(row.scoring.skill)), className: 'num' },
              { label: 'Verdict', render: (row) => verdictBadge(row.scoring?.verdict) },
            ],
            rows: report.checkpoints,
          }),
          firstWithReason ? h('p', { class: 'small muted' }, firstWithReason.scoring.reason) : null,
          h('p', { class: 'small muted' }, scoredCount < 2
            ? `Pooled skill is counts-only: ${scoredCount} scored checkpoint${scoredCount === 1 ? '' : 's'} is below the two required. ${report.experimentScoring.checked} checkpoint(s) grade structural experiments.`
            : `Pooled out-of-sample skill across all checkpoints: ${report.checkpoints.length} recorded, ${scoredCount} scored.`))
        : emptyState({
          title: 'Nothing has been graded yet',
          body: 'A prediction nobody checked is a story. Adopt a portfolio, then record what actually happened at its checkpoint.',
        }),
    }),

    adopted.length && report.dynamics?.experiments?.length
      ? card({
        title: 'Experiments graded in the same ledger',
        subtitle: 'Structural experiments adopted in the Dynamics Lab are scored against the same frozen-prediction rule and contribute to the same out-of-sample pool.',
        body: table({
          caption: 'Experiment checkpoints',
          columns: [
            { label: 'Experiment', render: (row) => row.name },
            { label: 'Status', render: (row) => statusBadge(row.status) },
            { label: 'Checkpoint', render: (row) => row.checkpointOn || '—' },
            {
              label: 'Score it',
              render: (row) => (row.status === 'adopted'
                ? h('button', {
                  class: 'btn btn-secondary btn-small',
                  type: 'button',
                  onClick: () => openCheckpointDialog(ctx, { subjectType: 'experiment', subjectId: row.id, label: row.name, checkpointOn: row.checkpointOn }, { onDone: () => ctx.navigate('#/capital?tab=checkpoints') }),
                }, 'Record checkpoint')
                : '—'),
            },
          ],
          rows: report.dynamics.experiments,
        }),
      })
      : null,
  );
}

/* ------------------------------------------------------------- page */

export function renderCapital(ctx) {
  const requested = ctx.query && typeof ctx.query.get === 'function' ? ctx.query.get('tab') : null;
  const active = TAB_KEYS.has(requested) ? requested : 'plan';
  const report = ctx.api.capitalReport();

  let body;
  if (!report.adequate) {
    body = emptyState({
      icon: '⚖',
      title: 'The allocator needs a system to allocate inside',
      body: report.reason,
      action: h('button', { class: 'btn btn-secondary btn-small', type: 'button', onClick: () => ctx.navigate('#/people') }, 'Open the roster'),
    });
  } else if (active === 'attribution') body = attributionTab(ctx, report);
  else if (active === 'robustness') body = robustnessTab(ctx, report);
  else if (active === 'checkpoints') body = checkpointTab(ctx, report);
  else body = planTab(ctx, report);

  return h('div', { class: 'page' },
    pageHeader({
      eyebrow: 'Schema v38 · constrained allocation · exact Shapley · minimax regret',
      title: 'Structural capital allocation',
      subtitle: 'Your attention is the scarce resource. This terminal spends a fixed effort budget across structural levers, prices what each lever actually contributed, and tells you how much the model has earned the right to be believed.',
      meta: report.adequate
        ? h('div', { class: 'badge-row' },
          badge(`${report.budgetUnits}-week budget`, 'neutral'),
          badge(`${report.allocation.effort} spent`, report.allocation.remaining > 0 ? 'warn' : 'good'),
          trustBadge(report.trust),
          badge(`${report.totals.checkpoints} checkpoint${report.totals.checkpoints === 1 ? '' : 's'}`, 'neutral'))
        : null,
      actions: [
        h('button', {
          class: 'btn btn-ghost btn-small',
          type: 'button',
          onClick: () => {
            downloadText({
              filename: `leados-capital-brief-${report.today}.md`,
              text: capitalBrief(ctx.state, ctx.now),
              mime: 'text/markdown',
            });
            toast('Allocation brief downloaded.', 'good');
          },
        }, 'Board brief'),
        h('button', {
          class: 'btn btn-secondary btn-small',
          type: 'button',
          onClick: () => openCapitalConventionsDialog(ctx, report, { onDone: () => ctx.navigate(`#/capital?tab=${active}`) }),
        }, 'Model conventions'),
        h('button', {
          class: 'btn btn-secondary btn-small',
          type: 'button',
          onClick: () => {
            const result = ctx.api.scanCapital();
            if (!result.ok) {
              toast(result.reason || result.error || 'The scan could not run.', 'bad');
              return;
            }
            const propagated = Array.isArray(result.propagations) ? result.propagations.length : 0;
            toast(propagated
              ? `Scan complete — ${propagated} follow-up${propagated === 1 ? '' : 's'} propagated automatically.`
              : 'Scan complete — no new follow-up was needed.', propagated ? 'good' : 'neutral');
            ctx.navigate(`#/capital?tab=${active}`);
          },
        }, 'Scan now'),
      ],
    }),
    ctx.warnings && ctx.warnings.length
      ? banner({ tone: 'caution', title: 'Workspace warnings', body: h('ul', { class: 'compact-list' }, ...ctx.warnings.slice(0, 4).map((warning) => h('li', { class: 'small' }, String(warning)))) })
      : null,
    report.adequate
      ? tabs({ items: TABS, active, ariaLabel: 'Capital allocation sections', onSelect: (key) => ctx.navigate(`#/capital?tab=${key}`) })
      : null,
    body,
    report.adequate
      ? h('p', { class: 'disclosure small muted' },
        `Engine ${report.engineVersion}. Effort costs are stated conventions, not measurements. Shapley shares attribute gain inside a structural model; they are not observed causality. Regret is sensitivity to assumed coefficients, not a probability of the future. Nothing here is a judgement about a person — the unit of allocation is a structural lever.`)
      : null);
}
