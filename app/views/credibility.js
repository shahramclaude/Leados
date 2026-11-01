/**
 * app/views/credibility.js — the Borrowed Evidence terminal (`#/credibility`,
 * Schema v71, ADR-0062).
 *
 * Six panels over every small sample the workspace holds:
 *   Overview      Each evidence group: its regime, pooled rate, how much the
 *                 units share, the heterogeneity screen and the leader's
 *                 exchangeability ruling — plus what this module raises
 *   Shrinkage     The Efron–Morris display: every unit drawn from its own rate
 *                 to its borrowed rate, with the floor and the pooled mean
 *   Graduation    How much of each number is the unit's own, when its own
 *                 record takes over at the current pace, and how many outcomes
 *                 would flip its verdict — with a live what-if
 *   Outside view  Every open assumption against its reference class, every
 *                 active delegation's borrowed chance of landing on time, and
 *                 what an unjudged signal family inherits
 *   Ledger        Frozen borrowing forecasts, graded against what followed —
 *                 borrowed versus own data, on the same outcomes
 *   Method        The arithmetic, the grid, the conventions and every refusal
 *
 * Nothing on this screen scores a person, and nothing borrowed is printed for a
 * group the leader has refused to pool.
 */

import { h, toast, openModal, confirmDialog } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, table } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { breakEven, credibilitySignals, groupFit, CREDIBILITY_GRID } from '../core/domain/credibility.js';
import { CREDIBILITY_REGIME_LABELS } from '../core/domain/credibilityRegistry.js';
import {
  openConventionsDialog,
  openDeclareDialog,
  openFreezeFrameDialog,
} from '../ui/credibility-modals.js';

const PANELS = [
  { key: 'overview', label: 'Overview' },
  { key: 'shrinkage', label: 'Shrinkage' },
  { key: 'graduation', label: 'Graduation' },
  { key: 'outside', label: 'Outside view' },
  { key: 'ledger', label: 'Ledger' },
  { key: 'method', label: 'Method' },
];

const VERDICT_TONE = { below: 'bad', above: 'good', unresolved: 'neutral' };
const VERDICT_TEXT = {
  below: 'Below floor',
  above: 'Clears floor',
  unresolved: 'Unresolved',
  insufficient: 'Too few to judge',
  none: 'No outcomes',
};
const REGIME_TONE = {
  'no-units': 'neutral',
  'too-thin': 'neutral',
  degenerate: 'warn',
  'pool-led': 'caution',
  balanced: 'good',
  'own-led': 'good',
};

const fmt = (v, suffix = '%') => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : `${v}${suffix}`);
const fmtRange = (lo, hi) => (lo === null || hi === null || lo === undefined || hi === undefined ? '—' : `${lo}–${hi}%`);

function nav(ctx, panel, extra = {}) {
  const q = new URLSearchParams();
  q.set('panel', panel);
  for (const [k, v] of Object.entries(extra)) {
    if (v !== null && v !== undefined && v !== '') q.set(k, String(v));
  }
  ctx.navigate(`#/credibility?${q.toString()}`);
}

function verdictBadge(verdict) {
  return badge(VERDICT_TEXT[verdict] || verdict || '—', VERDICT_TONE[verdict] || 'neutral');
}

/* --------------------------------------------------------- shrinkage chart */

/**
 * The Efron–Morris shrinkage display. Top axis: each unit's own raw rate x/n —
 * what the hierarchy actually shrinks. Bottom axis: its borrowed rate. The line
 * between them IS the borrowing, and it always points toward the pool.
 */
export function shrinkageChart(group, { compact = false } = {}) {
  const live = group.units.filter((u) => u.n > 0 && u.borrowedPct !== null && u.rawPct !== null);
  if (!live.length) {
    return h('p', { class: 'muted small' }, 'Nothing to draw: this group borrows nothing yet.');
  }
  const width = 560;
  const height = compact ? 132 : 236;
  const pad = { left: 24, right: 24, top: compact ? 26 : 34, bottom: compact ? 30 : 58 };
  const topY = pad.top;
  const botY = height - pad.bottom;
  const x = (pctValue) => pad.left + (Math.min(100, Math.max(0, pctValue)) / 100) * (width - pad.left - pad.right);
  const maxN = Math.max(...live.map((u) => u.n));
  const r = (n) => 3 + 6 * Math.sqrt(n / maxN);
  const tone = (u) => (u.borrowedVerdict === 'below' ? 'var(--bad)' : u.borrowedVerdict === 'above' ? 'var(--good)' : 'var(--accent)');
  const moved = live.slice().sort((a, b) => Math.abs(b.shrinkPp || 0) - Math.abs(a.shrinkPp || 0))[0];
  const aria = [
    `Shrinkage plot for ${group.groupLabel.toLowerCase()}: ${live.length} unit(s), each drawn from its own ${group.shortQuantity} (top axis) to its borrowed estimate (bottom axis).`,
    group.pooled ? `Pooled rate ${group.pooled.meanPct}%.` : '',
    `Floor ${group.floorPct}%.`,
    moved ? `Largest move: ${moved.label}, ${moved.rawPct}% to ${moved.borrowedPct}% (${moved.shrinkPp > 0 ? '+' : ''}${moved.shrinkPp} points).` : '',
  ].filter(Boolean).join(' ');

  const ticks = [0, 25, 50, 75, 100];
  const labels = [];
  if (!compact) {
    // Stagger labels on two rows so neighbouring units do not overprint.
    const sorted = live.slice().sort((a, b) => a.borrowedPct - b.borrowedPct);
    sorted.forEach((u, index) => {
      labels.push(h('text', {
        x: x(u.borrowedPct),
        y: botY + 30 + (index % 2) * 14,
        class: 'chart-tick',
        'text-anchor': 'middle',
      }, u.label.length > 18 ? `${u.label.slice(0, 17)}…` : u.label));
    });
  }

  const svgNode = h('svg', {
    viewBox: `0 0 ${width} ${height}`,
    class: 'chart-svg cre-shrinkage',
    role: 'img',
    'aria-label': aria,
    preserveAspectRatio: 'xMidYMid meet',
  },
  h('title', null, aria),
  h('line', { x1: pad.left, y1: topY, x2: width - pad.right, y2: topY, class: 'chart-grid' }),
  h('line', { x1: pad.left, y1: botY, x2: width - pad.right, y2: botY, class: 'chart-grid' }),
  ...ticks.map((t) => h('text', { x: x(t), y: botY + 14, class: 'chart-tick', 'text-anchor': 'middle' }, `${t}%`)),
  h('text', { x: pad.left, y: topY - 10, class: 'chart-tick' }, 'Own record'),
  h('text', { x: pad.left, y: botY - 8, class: 'chart-tick' }, 'Borrowed'),
  h('line', {
    x1: x(group.floorPct), y1: topY - 6, x2: x(group.floorPct), y2: botY + 4,
    stroke: 'var(--bad)', 'stroke-width': 1.25, 'stroke-dasharray': '3 3',
  }),
  h('text', { x: x(group.floorPct), y: topY - 10, class: 'chart-tick', 'text-anchor': 'middle' }, `floor ${group.floorPct}%`),
  group.pooled ? h('line', {
    x1: x(group.pooled.meanPct), y1: topY, x2: x(group.pooled.meanPct), y2: botY,
    stroke: 'var(--accent)', 'stroke-width': 1, 'stroke-dasharray': '6 4', opacity: 0.6,
  }) : null,
  ...live.map((u) => h('line', {
    x1: x(u.rawPct), y1: topY, x2: x(u.borrowedPct), y2: botY,
    stroke: tone(u), 'stroke-width': 1.5, opacity: 0.85,
  })),
  ...live.map((u) => h('circle', {
    cx: x(u.rawPct), cy: topY, r: r(u.n), fill: 'var(--panel)', stroke: tone(u), 'stroke-width': 1.5,
  })),
  ...live.map((u) => h('circle', {
    cx: x(u.borrowedPct), cy: botY, r: r(u.n), fill: tone(u), stroke: 'var(--panel)', 'stroke-width': 1,
  })),
  ...labels);

  return h('figure', { class: 'chart' },
    svgNode,
    compact ? null : h('figcaption', { class: 'chart-legend' },
      h('span', null, '○ own record (dot size ∝ outcomes)'),
      h('span', null, '● borrowed estimate'),
      h('span', null, '┆ red: declared floor'),
      h('span', null, '┆ green: pooled rate')),
    compact ? null : h('details', { class: 'chart-table-details' },
      h('summary', null, 'Show the numbers behind this chart'),
      table({
        caption: `Shrinkage data for ${group.groupLabel}`,
        columns: [
          { key: 'u', label: group.unitLabel, render: (u) => u.label },
          { key: 'own', label: 'Own record', render: (u) => `${u.x}/${u.n} · ${fmt(u.rawPct)}` },
          { key: 'b', label: 'Borrowed', render: (u) => fmt(u.borrowedPct) },
          { key: 's', label: 'Move', render: (u) => (u.shrinkPp === null ? '—' : `${u.shrinkPp > 0 ? '+' : ''}${u.shrinkPp} pp`) },
        ],
        rows: live,
      })));
}

/* ---------------------------------------------------------------- overview */

function groupCard(ctx, group, signalsByGroup) {
  const refusal = !group.borrowing;
  const sourceRoute = group.id === 'detectors' ? '#/integrity?panel=verdicts'
    : group.id === 'premises' ? '#/premises' : '#/delegations';
  const sourceLabel = group.id === 'detectors' ? 'Judge signals' : group.id === 'premises' ? 'Open the assumption ledger' : 'Open delegations';
  const ruling = group.declaration;
  const body = h('div', { class: 'stack' },
    h('div', { class: 'row-wrap gap-xs' },
      badge(group.refused ? 'Borrowing refused by you' : CREDIBILITY_REGIME_LABELS[group.regime], group.refused ? 'warn' : REGIME_TONE[group.regime] || 'neutral'),
      group.heterogeneity.flagged ? badge(`Heterogeneous · I² ${group.heterogeneity.i2Pct}%`, 'warn') : null,
      group.carriers.length ? badge('One unit carries the pool', 'warn') : null,
      group.prior && !group.prior.identified ? badge('Sharing weakly identified', 'caution') : null),
    h('p', { class: 'muted small' }, `Measures ${group.quantity}. Source: ${group.source}. Success means ${group.successDefinition}.`),
    refusal && !group.refused
      ? h('div', { class: 'callout stack-xs' },
        h('strong', null, `Nothing is borrowed yet — it needs ${group.missing}.`),
        h('span', { class: 'muted small' }, `${group.counts.units} ${group.counts.units === 1 ? group.unitLabel : group.unitPlural} with outcomes and ${group.counts.observations} decisive outcome${group.counts.observations === 1 ? '' : 's'} so far (floors: ${ctx.report.conventions.minUnits} units, ${ctx.report.conventions.minObservations} outcomes). The engine would rather print this than an estimate fitted to nothing.`),
        h('a', { class: 'btn btn-small btn-ghost', href: sourceRoute }, sourceLabel))
      : null,
    group.refused
      ? h('div', { class: 'callout stack-xs' },
        h('strong', null, 'You declared these units are not one kind of thing, so nothing here is borrowed.'),
        ruling ? h('span', { class: 'muted small' }, `“${ruling.reason}” — ${String(ruling.declaredAt).slice(0, 10)}`) : null)
      : null,
    group.borrowing
      ? h('div', { class: 'stat-row' },
        stat({ label: 'Pooled rate', value: fmt(group.pooled.meanPct), hint: `90% ${fmtRange(group.pooled.loPct, group.pooled.hiPct)} · raw ${fmt(group.pooledRawPct)}` }),
        stat({
          label: 'The pool is worth',
          value: `~${group.prior.strengthMedian}`,
          hint: `outcomes (80% ${group.prior.strengthLo}–${group.prior.strengthHi})${group.prior.identified ? '' : ' — weakly identified'}`,
        }),
        stat({ label: 'Mean own weight', value: fmt(group.meanZPct), hint: 'how much of each number is the unit’s own' }),
        stat({
          label: 'Heterogeneity',
          value: group.heterogeneity.i2Pct === null ? '—' : `I² ${group.heterogeneity.i2Pct}%`,
          hint: group.heterogeneity.x2 === null ? 'not testable' : `χ² ${group.heterogeneity.x2} on ${group.heterogeneity.df} df · p ${group.heterogeneity.pValue}${group.heterogeneity.approximate ? ' · approximate' : ''}`,
          tone: group.heterogeneity.flagged ? 'warn' : '',
        }))
      : null,
    group.borrowing ? shrinkageChart(group, { compact: true }) : null,
    group.borrowing && group.neverJudged
      ? h('p', { class: 'muted small' },
        `A ${group.unitLabel} with no outcomes yet inherits `, h('strong', null, `${group.neverJudged.meanPct}%`),
        ` (90% ${group.neverJudged.loPct}–${group.neverJudged.hiPct}%) — honest about how little that says, and better than “unknown”.`)
      : null,
    (signalsByGroup.get(group.id) || []).length
      ? h('ul', { class: 'evidence-list' }, ...(signalsByGroup.get(group.id) || []).map((s) => h('li', null, s.title)))
      : null,
    h('div', { class: 'row-wrap gap-xs' },
      group.borrowing ? h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => nav(ctx, 'shrinkage', { group: group.id }) }, 'Shrinkage') : null,
      group.borrowing ? h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => nav(ctx, 'graduation', { group: group.id }) }, 'Graduation') : null,
      h('button', {
        class: 'btn btn-small btn-ghost',
        type: 'button',
        onClick: () => openDeclareDialog(ctx, group),
      }, ruling ? 'Change exchangeability ruling' : 'Declare exchangeability')),
  );
  return card({
    title: group.groupLabel,
    subtitle: `${group.label} · ${group.counts.units} unit(s) · ${group.counts.observations} decisive outcome(s) · floor ${group.floorPct}%`,
    body,
  });
}

function overviewPanel(ctx, report, signals) {
  const signalsByGroup = new Map();
  for (const signal of signals) {
    const match = signal.action?.route?.match(/group=([a-z]+)/);
    const key = match ? match[1] : signal.action?.route?.includes('outside') ? 'premises' : null;
    if (!key) continue;
    signalsByGroup.set(key, [...(signalsByGroup.get(key) || []), signal]);
  }
  const borrowedOnly = report.groups.reduce((n, g) => n + g.rescued.length, 0);
  const skillRows = report.ledger.byGroup.filter((row) => row.graded > 0);
  const graded = skillRows.reduce((n, row) => n + row.graded, 0);
  const wins = skillRows.reduce((n, row) => n + row.wins, 0);
  return h('div', { class: 'stack' },
    card({
      title: 'Every small sample, priced with the evidence it shares',
      subtitle: 'Each unit borrows strength from its group by an amount the data decide — and every borrowed claim the workspace acts on is frozen and graded against what follows.',
      body: h('div', { class: 'stat-row' },
        stat({
          label: 'Units priced',
          value: report.totals.pricedUnits,
          hint: `${report.totals.pricedObservations} decisive outcome${report.totals.pricedObservations === 1 ? '' : 's'} in ${report.totals.borrowingGroups} borrowing group${report.totals.borrowingGroups === 1 ? '' : 's'}`
            + (report.totals.units > report.totals.pricedUnits ? ` · ${report.totals.units - report.totals.pricedUnits} more waiting on thin groups` : ''),
        }),
        stat({
          label: 'Decisive on borrowed evidence only',
          value: borrowedOnly,
          hint: 'units whose own record cannot yet say what the pool can',
          tone: borrowedOnly ? 'warn' : '',
        }),
        stat({
          label: 'Assumptions above their class',
          value: report.totals.flaggedPremises,
          hint: 'open premises declared more confidently than their class has delivered',
          tone: report.totals.flaggedPremises ? 'bad' : '',
        }),
        stat({
          label: 'Borrowing vs own data',
          value: graded ? `${wins}/${graded}` : 'not graded yet',
          hint: graded ? 'graded frames where borrowing scored the better Brier' : 'frames are graded once their window closes',
        })),
    }),
    ...report.groups.map((group) => groupCard(ctx, group, signalsByGroup)),
    signals.length
      ? card({
        title: `Signals (${signals.length})`,
        subtitle: 'What this module raises. Each carries its evidence and one next step.',
        body: h('div', { class: 'stack' },
          ...signals.map((signal) => h('div', { class: 'callout stack-xs' },
            h('div', { class: 'row-between' },
              h('strong', null, `${signal.ruleId} · ${signal.title}`),
              badge(`Severity ${signal.severity}`, signal.severity >= 4 ? 'bad' : signal.severity >= 3 ? 'warn' : 'neutral')),
            h('p', { class: 'muted small' }, signal.detail),
            h('ul', { class: 'evidence-list' }, ...signal.evidence.map((line) => h('li', null, line))),
            h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => ctx.navigate(signal.action.route) }, signal.action.label)))),
      })
      : null,
  );
}

/* --------------------------------------------------------------- shrinkage */

function groupPicker(ctx, report, panel, activeId) {
  return tabs({
    items: report.groups.map((g) => ({ key: g.id, label: g.label, count: g.counts.units })),
    active: activeId,
    ariaLabel: 'Evidence groups',
    onSelect: (key) => nav(ctx, panel, { group: key }),
  });
}

function chosenGroup(ctx, report) {
  const requested = ctx.query?.get('group');
  return report.groups.find((g) => g.id === requested)
    || report.groups.find((g) => g.borrowing)
    || report.groups[0];
}

function notBorrowing(group) {
  return banner({
    tone: 'info',
    title: group.refused ? 'Borrowing refused for this group' : `${group.groupLabel} does not borrow yet`,
    body: group.refused
      ? 'You declared these units are not one kind of thing. Each is judged on its own record only.'
      : `${CREDIBILITY_REGIME_LABELS[group.regime]}. It needs ${group.missing}.`,
  });
}

function shrinkagePanel(ctx, report) {
  const group = chosenGroup(ctx, report);
  const rows = group.units.filter((u) => u.n > 0);
  return h('div', { class: 'stack' },
    groupPicker(ctx, report, 'shrinkage', group.id),
    !group.borrowing ? notBorrowing(group) : null,
    group.borrowing ? card({
      title: `How far each ${group.unitLabel} was pulled toward the pool`,
      subtitle: `Own record on top, borrowed estimate below. Units with fewer outcomes move further — that is the whole idea, and the arithmetic decides how far.`,
      body: shrinkageChart(group),
    }) : null,
    card({
      title: `Every ${group.unitLabel}, own record against borrowed`,
      subtitle: `Floor ${group.floorPct}%. A verdict needs ${report.conventions.decisivePct}% posterior probability on one side of it; own-data verdicts use a Wilson 95% interval and refuse below ${report.conventions.minUnitN} outcomes.`,
      body: table({
        caption: `Own and borrowed estimates for ${group.groupLabel}`,
        emptyMessage: 'No unit in this group has a decisive outcome yet.',
        columns: [
          { key: 'u', label: group.unitLabel, render: (u) => h('strong', null, u.label) },
          { key: 'own', label: 'Own record', render: (u) => `${u.x}/${u.n} · ${fmt(u.rawPct)} (95% ${fmtRange(u.wilsonLoPct, u.wilsonHiPct)})` },
          { key: 'ov', label: 'Own verdict', render: (u) => verdictBadge(u.ownVerdict) },
          { key: 'b', label: 'Borrowed (90%)', render: (u) => (u.borrowedPct === null ? '—' : `${u.borrowedPct}% (${fmtRange(u.loPct, u.hiPct)})`) },
          { key: 'z', label: 'Own weight', render: (u) => fmt(u.zPct) },
          { key: 'p', label: `P(< ${group.floorPct}%)`, render: (u) => fmt(u.pBelowPct) },
          { key: 'bv', label: 'Borrowed verdict', render: (u) => (u.borrowedVerdict ? h('span', { class: 'cre-inline' }, verdictBadge(u.borrowedVerdict), u.rescued ? badge('borrowed only', 'caution') : null) : '—') },
          { key: 'i', label: 'Influence', render: (u) => (u.influencePp === null ? '—' : `${u.influencePp} pp (${u.influenceSd}×SD)`) },
        ],
        rows,
      }),
    }),
  );
}

/* -------------------------------------------------------------- graduation */

function whatIfCard(ctx, report, group) {
  const units = group.units.filter((u) => u.liveIndex >= 0);
  if (!units.length) return null;
  const select = h('select', { id: 'cre-whatif-unit', 'aria-label': `Choose a ${group.unitLabel}` },
    ...units.map((u) => h('option', { value: u.id }, `${u.label} (${u.x}/${u.n})`)));
  const successes = h('input', { id: 'cre-whatif-s', type: 'number', min: '0', max: '40', step: '1', value: '0', 'aria-label': 'Hypothetical successes' });
  const failures = h('input', { id: 'cre-whatif-f', type: 'number', min: '0', max: '40', step: '1', value: '3', 'aria-label': 'Hypothetical failures' });
  const out = h('div', { class: 'callout stack-xs', 'aria-live': 'polite' });
  const run = () => {
    const result = ctx.api.credibilityWhatIf({
      groupId: group.id, unitId: select.value, successes: successes.value, failures: failures.value,
    });
    out.replaceChildren();
    if (!result.ok) {
      out.append(h('span', null, result.error || 'Could not compute the what-if.'));
      return;
    }
    const unit = units.find((u) => u.id === select.value);
    out.append(
      h('strong', null, `${unit.label}: ${unit.borrowedPct}% now → ${result.borrowedPct}% after ${successes.value || 0} more success(es) and ${failures.value || 0} more failure(s)`),
      h('span', { class: 'muted small' }, `P(below the ${result.floorPct}% floor) becomes ${result.pBelowPct}% — verdict: ${VERDICT_TEXT[result.verdict]}. The hyperprior is re-weighted exactly on the grid, so the other units' evidence still counts.`),
    );
  };
  for (const node of [select, successes, failures]) node.addEventListener('change', run);
  run();
  return card({
    title: 'What would change the verdict?',
    subtitle: 'A scenario, not a forecast: add hypothetical outcomes to one unit and watch its borrowed reading move.',
    body: h('div', { class: 'stack' },
      h('div', { class: 'row-wrap gap-xs' },
        h('label', { class: 'stack-xs', for: 'cre-whatif-unit' }, h('span', { class: 'muted small' }, group.unitLabel), select),
        h('label', { class: 'stack-xs', for: 'cre-whatif-s' }, h('span', { class: 'muted small' }, 'More successes'), successes),
        h('label', { class: 'stack-xs', for: 'cre-whatif-f' }, h('span', { class: 'muted small' }, 'More failures'), failures)),
      out),
  });
}

function graduationPanel(ctx, report) {
  const group = chosenGroup(ctx, report);
  const fit = group.borrowing ? groupFit(report, group.id) : null;
  const rows = group.units.filter((u) => u.n > 0).map((u) => ({
    ...u,
    flip: fit && u.liveIndex >= 0 ? breakEven(fit, u.liveIndex, group.floorPct / 100, report.conventions.decisive) : null,
  }));
  const target = (u, zPct) => u.graduation.find((g) => g.zPct === zPct) || null;
  const when = (g) => {
    if (!g || g.needed === null) return '—';
    if (g.remaining === 0) return 'already';
    return `${g.remaining} more · ${g.date ? `≈ ${g.date}` : 'not at the current pace'}`;
  };
  return h('div', { class: 'stack' },
    groupPicker(ctx, report, 'graduation', group.id),
    !group.borrowing ? notBorrowing(group) : null,
    group.borrowing ? card({
      title: 'When does each unit’s own record take over?',
      subtitle: `Own weight Z = n / (n + M). With the pool worth ~${group.prior.strengthMedian} outcomes, a unit carries half its own estimate at ${Math.ceil(group.prior.strengthMedian)} outcomes and 80% at ${Math.ceil(group.prior.strengthMedian * 4)}. Dates assume the last 13 weeks' pace continues.`,
      body: table({
        caption: `Graduation for ${group.groupLabel}`,
        columns: [
          { key: 'u', label: group.unitLabel, render: (u) => h('strong', null, u.label) },
          { key: 'n', label: 'Outcomes', render: (u) => String(u.n) },
          { key: 'z', label: 'Own weight', render: (u) => fmt(u.zPct) },
          { key: 'pace', label: 'Pace / week', render: (u) => (u.pacePerWeek ? String(u.pacePerWeek) : '0') },
          { key: 'g50', label: '50% own', render: (u) => when(target(u, 50)) },
          { key: 'g80', label: '80% own', render: (u) => when(target(u, 80)) },
          {
            key: 'flip',
            label: 'Flips the verdict',
            render: (u) => (!u.flip ? '—' : h('span', { class: 'stack-xs' },
              h('span', null, u.flip.failuresToBelow === 0 ? 'already below' : u.flip.failuresToBelow === null ? `> ${u.flip.cap} failures to fall below` : `${u.flip.failuresToBelow} failure(s) → below`),
              h('span', { class: 'muted small' }, u.flip.successesToAbove === 0 ? 'already clears' : u.flip.successesToAbove === null ? `> ${u.flip.cap} successes to clear` : `${u.flip.successesToAbove} success(es) → clears`))),
          },
        ],
        rows,
      }),
    }) : null,
    group.borrowing ? whatIfCard(ctx, report, group) : null,
  );
}

/* ------------------------------------------------------------ outside view */

function outsidePanel(ctx, report) {
  const premises = report.groups.find((g) => g.id === 'premises');
  const delegation = report.groups.find((g) => g.id === 'delegation');
  const detectors = report.groups.find((g) => g.id === 'detectors');
  const premiseById = new Map((ctx.state.premises || []).map((p) => [p.id, p]));
  const delegationById = new Map((ctx.state.delegations || []).map((d) => [d.id, d]));
  const unitLabel = (group, id) => group.units.find((u) => u.id === id)?.label || id;
  const thinFamilies = detectors.units.filter((u) => u.n > 0 && (u.ownVerdict === 'insufficient' || u.ownVerdict === 'unresolved'));
  return h('div', { class: 'stack' },
    card({
      title: 'Open assumptions against their reference class',
      subtitle: 'The outside view, computed: is each declared prior more confident than its criticality class has ever been right?',
      body: !premises.borrowing
        ? notBorrowing(premises)
        : table({
          caption: 'Open premises and the borrowed hold rate of their class',
          emptyMessage: 'No open premise to check.',
          columns: [
            { key: 't', label: 'Assumption', render: (r) => h('a', { href: `#/premises?premise=${encodeURIComponent(r.premiseId)}` }, premiseById.get(r.premiseId)?.title || 'Open premise') },
            { key: 'c', label: 'Class', render: (r) => unitLabel(premises, r.classId) },
            { key: 'p', label: 'Declared prior', render: (r) => `${r.priorPct}%` },
            { key: 'b', label: 'Class has delivered', render: (r) => `${fmt(r.classBorrowedPct)} (up to ${fmt(r.classHiPct)})` },
            { key: 'x', label: 'P(class below prior)', render: (r) => fmt(r.pBelowPriorPct) },
            { key: 'f', label: 'Outside view', render: (r) => (r.flagged ? badge('Declared above its class', 'bad') : badge('Consistent', 'good')) },
          ],
          rows: premises.outsideView,
        }),
    }),
    card({
      title: 'Active delegations: the borrowed chance each lands on time',
      subtitle: `The authority class's posterior predictive for one more outcome. Due inside ${report.conventions.checkpointDays} days and in a class below the ${delegation.floorPct}% floor means a checkpoint is worth agreeing now.`,
      body: !delegation.borrowing
        ? notBorrowing(delegation)
        : table({
          caption: 'Active delegations and their borrowed on-time probability',
          emptyMessage: 'No active delegation with a future due date.',
          columns: [
            { key: 't', label: 'Delegation', render: (r) => h('a', { href: `#/delegations?delegation=${encodeURIComponent(r.delegationId)}` }, delegationById.get(r.delegationId)?.title || 'Delegation') },
            { key: 'c', label: 'Authority', render: (r) => unitLabel(delegation, r.classId) },
            { key: 'd', label: 'Due', render: (r) => `${r.dueOn} (${r.daysToDue} d)` },
            { key: 'p', label: 'P(on time)', render: (r) => fmt(r.pOnTimePct) },
            { key: 'z', label: 'Own weight', render: (r) => fmt(r.zPct) },
            { key: 'v', label: 'Class', render: (r) => (r.classVerdict ? verdictBadge(r.classVerdict) : '—') },
            { key: 'w', label: 'Checkpoint window', render: (r) => (r.withinCheckpoint ? badge('inside', r.classVerdict === 'below' ? 'warn' : 'neutral') : 'later') },
          ],
          rows: delegation.forecasts,
        }),
    }),
    card({
      title: 'Signal families the Board cannot judge yet',
      subtitle: 'What the detector suite\'s own pool says about a family with too few verdicts — and what a never-judged family inherits.',
      body: !detectors.borrowing
        ? notBorrowing(detectors)
        : h('div', { class: 'stack' },
          detectors.neverJudged ? h('p', { class: 'muted' },
            'A family with no decisive verdict inherits ', h('strong', null, `${detectors.neverJudged.meanPct}%`),
            ` actionable precision (90% ${detectors.neverJudged.loPct}–${detectors.neverJudged.hiPct}%), with a ${detectors.neverJudged.pBelowPct}% chance it sits below the ${detectors.floorPct}% floor.`) : null,
          table({
            caption: 'Thinly judged signal families with their borrowed precision',
            emptyMessage: 'Every judged family already has a decisive own-data verdict.',
            columns: [
              { key: 'u', label: 'Family', render: (u) => h('a', { href: '#/integrity?panel=inventory' }, u.label) },
              { key: 'o', label: 'Own', render: (u) => `${u.x}/${u.n} · ${VERDICT_TEXT[u.ownVerdict]}` },
              { key: 'b', label: 'Borrowed (90%)', render: (u) => `${fmt(u.borrowedPct)} (${fmtRange(u.loPct, u.hiPct)})` },
              { key: 'v', label: 'Borrowed verdict', render: (u) => verdictBadge(u.borrowedVerdict) },
            ],
            rows: thinFamilies,
          })),
    }),
  );
}

/* ------------------------------------------------------------------ ledger */

function frameStatus(frame, today) {
  if (frame.graded) {
    const borrowedWon = frame.graded.brierBorrowed < frame.graded.brierRaw;
    return badge(borrowedWon ? 'Graded · borrowing won' : frame.graded.brierBorrowed === frame.graded.brierRaw ? 'Graded · tie' : 'Graded · own data won', borrowedWon ? 'good' : 'warn');
  }
  if (frame.lapsedOn) return badge('Lapsed untested', 'neutral');
  if (frame.reviewOn <= today) return badge('Due for grading', 'caution');
  return badge(`Open until ${frame.reviewOn}`, 'neutral');
}

function ledgerPanel(ctx, report) {
  const focus = ctx.query?.get('frame') || '';
  const frames = report.ledger.frames;
  return h('div', { class: 'stack' },
    card({
      title: 'Has borrowing helped here?',
      subtitle: `Two forecasters frozen side by side and scored on the same outcomes (Brier 1950). Skill = 1 − Σ Brier borrowed / Σ Brier own, withheld below ${report.conventions.skillFloor} graded frames per group.`,
      body: h('div', { class: 'stat-row' },
        ...report.ledger.byGroup.map((row) => {
          const group = report.groups.find((g) => g.id === row.groupId);
          return stat({
            label: group.groupLabel,
            value: row.skill === null ? (row.graded ? 'withheld' : 'no grades') : `skill ${row.skill}`,
            hint: row.graded
              ? `${row.wins}/${row.graded} won · Brier ${row.meanBrierBorrowed} vs ${row.meanBrierRaw}${row.skill === null ? ` · ${row.needed} more to score` : ''}`
              : 'frames are graded once their window closes',
            tone: row.skill !== null && row.skill < 0 ? 'bad' : '',
          });
        })),
    }),
    card({
      title: `Frozen frames (${frames.length})`,
      subtitle: 'Every borrowed claim the rules acted on is frozen automatically; you can freeze any unit by hand. A frame is graded once and never rewritten.',
      actions: [h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => openFreezeFrameDialog(ctx, report) }, 'Freeze a forecast')],
      body: table({
        caption: 'Frozen borrowing forecasts',
        emptyMessage: 'No frame yet. Freeze one, or let the rules freeze the claims they act on.',
        columns: [
          { key: 'l', label: 'Frame', render: (f) => h('span', { class: 'stack-xs' }, h('strong', null, f.label), h('span', { class: 'muted small' }, `frozen ${String(f.frozenAt).slice(0, 10)} · ${f.nAtFreeze} own outcome(s) · own weight ${fmt(f.zAtFreeze)}`)) },
          { key: 'f', label: 'Borrowed vs own', render: (f) => `${f.borrowedPct}% vs ${f.rawPct}%` },
          { key: 'h', label: 'Window', render: (f) => `next ${f.horizonN} by ${f.reviewOn}` },
          { key: 's', label: 'Status', render: (f) => frameStatus(f, report.today) },
          { key: 'g', label: 'Brier (borrowed / own)', render: (f) => (f.graded ? `${f.graded.brierBorrowed.toFixed(3)} / ${f.graded.brierRaw.toFixed(3)} on ${f.graded.successes}/${f.graded.observed}` : '—') },
          {
            key: 'x',
            label: 'Actions',
            render: (f) => h('button', {
              class: 'btn btn-small btn-ghost',
              type: 'button',
              'aria-label': `Delete frame ${f.label}`,
              onClick: () => confirmDialog({
                title: 'Delete this frame?',
                message: 'The frozen claim and its edges are removed. The event log keeps the deletion.',
                confirmLabel: 'Delete frame',
                danger: true,
                onConfirm: () => {
                  const result = ctx.api.deleteCredibilityFrame(f.id);
                  toast(result.ok ? 'Frame deleted.' : result.error, result.ok ? 'good' : 'bad');
                },
              }),
            }, 'Delete'),
          },
        ],
        rows: frames.map((f) => ({ ...f, className: f.id === focus ? 'is-focused' : '' })),
      }),
    }),
  );
}

/* ------------------------------------------------------------------ method */

function methodPanel(ctx, report) {
  const c = report.conventions;
  return h('div', { class: 'stack' },
    card({
      title: 'The model, printed so it can be checked',
      body: h('div', { class: 'stack' },
        h('p', { class: 'muted' }, h('strong', null, 'Beta-binomial hierarchy. '), 'Unit i has n_i decisive outcomes and x_i successes; p_i ~ Beta(α, β) and x_i | p_i ~ Binomial(n_i, p_i). In (μ, M) form, μ = α/(α+β) is the pooled rate and M = α+β is the prior’s worth in outcomes.'),
        h('p', { class: 'muted' }, h('strong', null, 'Credibility (Bühlmann 1967; exact here, Jewell 1974). '), 'Posterior mean = Z·(x/n) + (1−Z)·μ with Z = n/(n+M). The “own weight” on every screen is the posterior expectation of Z.'),
        h('p', { class: 'muted' }, h('strong', null, 'Full Bayes, not plug-in (BDA3 §5.3). '), `The hyperparameters are integrated over, under p(α, β) ∝ (α+β)^(−5/2), on a ${CREDIBILITY_GRID.coarse}×${CREDIBILITY_GRID.coarse} coarse grid over logit μ ∈ [${CREDIBILITY_GRID.logitMin}, ${CREDIBILITY_GRID.logitMax}] and M ∈ [0.25, 10⁶], refined to ${CREDIBILITY_GRID.fine}×${CREDIBILITY_GRID.fine} over the region holding the mass of the full and every leave-one-out posterior. Deterministic: the same records always give the same numbers.`),
        h('p', { class: 'muted' }, h('strong', null, 'Intervals and verdicts. '), `The 90% interval is a Beta moment-matched to the posterior mixture (within about a point of the exact mixture quantiles on the suite’s fixtures). The verdict uses the exact mixture probability P(p < floor) and needs ${c.decisivePct}% on one side.`),
        h('p', { class: 'muted' }, h('strong', null, 'Heterogeneity. '), `Pearson χ² homogeneity on k−1 df with I² = (χ² − df)/χ² (Higgins & Thompson 2002). Flagged only when p < ${c.heterogeneityAlphaPct}% AND I² ≥ ${c.i2WarnPct}%; marked approximate whenever an expected cell count is under five.`),
        h('p', { class: 'muted' }, h('strong', null, 'Influence. '), `Each unit is removed from the hyperprior in turn. It “carries the pool” only if another unit’s estimate then moves by ≥ ${c.influenceTolerancePct} points AND by more than that unit’s own posterior SD.`),
        h('p', { class: 'muted' }, h('strong', null, 'Graduation and break-even. '), 'Outcomes needed for own weight z: ⌈M·z/(1−z)⌉ at the posterior median M; the date assumes the last 13 weeks’ pace. Break-even counts re-weight the hyperposterior exactly by the ratio of the unit’s new and old marginal likelihoods.'),
        h('p', { class: 'muted' }, h('strong', null, 'Grading. '), 'A frame freezes the borrowed estimate and the own-data Jeffreys estimate (x+½)/(n+1) — so the contest tests borrowing, not smoothing — and scores both by Brier on the first outcomes inside its window.'),
      ),
    }),
    card({
      title: 'Declared conventions',
      subtitle: 'Each is a number you can change, and every page that uses one prints it.',
      actions: [h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => openConventionsDialog(ctx, c) }, 'Change conventions')],
      body: table({
        caption: 'Borrowed evidence conventions',
        columns: [
          { key: 'k', label: 'Convention', render: (r) => r.label },
          { key: 'v', label: 'Value', render: (r) => r.value },
        ],
        rows: [
          { label: 'Posterior probability for a borrowed verdict', value: `${c.decisivePct}%` },
          { label: 'Own-data verdict refused below', value: `${c.minUnitN} outcomes` },
          { label: 'Units / outcomes needed to fit a pool', value: `${c.minUnits} / ${c.minObservations}` },
          { label: 'Floors (detectors / assumptions / delegation)', value: `${c.detectorFloorPct}% (the Board’s) / ${c.premiseFloorPct}% / ${c.delegationFloorPct}%` },
          { label: 'Heterogeneity alpha / I² flag', value: `${c.heterogeneityAlphaPct}% / ${c.i2WarnPct}%` },
          { label: 'Influence tolerance', value: `${c.influenceTolerancePct} points and > 1 SD` },
          { label: 'Frame horizon / review period', value: `${c.horizonN} outcomes / ${c.reviewDays} days` },
          { label: 'Graded frames before skill is scored', value: String(c.skillFloor) },
          { label: 'Checkpoint window for delegations', value: `${c.checkpointDays} days` },
          { label: 'Automatic propagation', value: c.autoPropagate ? 'on' : 'off (explicit scans only)' },
        ],
      }),
    }),
    card({
      title: 'What this screen refuses to do',
      body: h('ul', { class: 'evidence-list' },
        h('li', null, 'It never pools across groups, and never pools a group you have refused — whatever the arithmetic says.'),
        h('li', null, 'It never makes a person a unit. Units are signal families, assumption criticality classes and delegation authority classes.'),
        h('li', null, 'It prints no estimate below the unit and outcome floors, and none when every unit sits at 0% or 100% (no Beta fits, and the posterior would be improper).'),
        h('li', null, 'It never changes a prior, a precision figure or a due date. It opens one decision or task and freezes the claim it acted on.'),
        h('li', null, 'It never claims borrowing works here until the graded record says so — and opens the decision to stop when it says otherwise.'),
        h('li', null, 'A borrowed estimate is decision support from a model, not a measurement. Whether units are alike is your judgement, recorded with a reason.')),
    }),
  );
}

/* ------------------------------------------------------------------ render */

export function renderCredibility(ctx) {
  const report = ctx.api.credibilityRead();
  const signals = credibilitySignals(ctx.state, ctx.now, ctx.state.settings || {});
  const scoped = { ...ctx, report };
  const requested = ctx.query?.get('panel') || 'overview';
  const active = PANELS.some((p) => p.key === requested) ? requested : 'overview';

  const header = pageHeader({
    eyebrow: 'BORROW STRENGTH · GRADE THE BORROWING · NEVER SCORE A PERSON',
    title: 'Borrowed evidence',
    subtitle: 'Every small sample in this workspace, priced with the evidence it shares — with how much of each number is its own, when its own record takes over, and whether borrowing has actually helped here.',
    actions: [
      h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        onClick: () => {
          const text = ctx.api.credibilityBriefText();
          if (!downloadText({ filename: `leados-borrowed-evidence-${report.today}.txt`, text, mime: 'text/plain' })) {
            const modal = openModal({
              title: 'Copy the borrowed-evidence brief (no names)',
              body: h('textarea', { readOnly: true, rows: 20, 'aria-label': 'Borrowed evidence brief' }, text),
              footer: [h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => modal.close() }, 'Close')],
            });
          } else {
            toast('No-names borrowed-evidence brief downloaded.', 'good');
          }
        },
      }, 'Export brief'),
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openFreezeFrameDialog(scoped, report) }, 'Freeze a forecast'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const result = ctx.api.scanCredibility();
          if (!result.ok) { toast(result.error || 'Scan failed.', 'bad'); return; }
          toast(result.changed
            ? 'Scan graded what was due and propagated what the borrowed evidence supports.'
            : 'Scan complete — nothing new to grade or act on.', 'good');
        },
      }, 'Run scan'),
    ],
  });

  const body = active === 'shrinkage' ? shrinkagePanel(scoped, report)
    : active === 'graduation' ? graduationPanel(scoped, report)
      : active === 'outside' ? outsidePanel(scoped, report)
        : active === 'ledger' ? ledgerPanel(scoped, report)
          : active === 'method' ? methodPanel(scoped, report)
            : overviewPanel(scoped, report, signals);

  const empty = report.totals.observations === 0;
  return h('div', { class: 'page' },
    header,
    empty ? banner({
      tone: 'info',
      title: 'No outcome has been recorded yet — so nothing is borrowed, and nothing is invented',
      body: 'This engine reads three ledgers you already keep: signal verdicts, settled assumptions and delegations with due dates. Judge a few signals, settle an assumption or close a delegation and the first pooled estimates appear here.',
      actions: [
        h('a', { class: 'btn btn-primary btn-small', href: '#/integrity?panel=verdicts' }, 'Judge signals'),
        h('a', { class: 'btn btn-ghost btn-small', href: '#/premises' }, 'Assumption ledger'),
      ],
    }) : null,
    tabs({ items: PANELS, active, ariaLabel: 'Borrowed evidence sections', onSelect: (key) => nav(ctx, key) }),
    body,
  );
}
