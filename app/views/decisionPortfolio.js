/**
 * app/views/decisionPortfolio.js — Decision Portfolio Terminal (`#/portfolio`).
 *
 * Five tabs:
 *  1. Overview — load index, total carrying cost, priority queue, cluster summary
 *  2. Coupling — decision-to-decision coupling matrix with shared resources
 *  3. Sequencing — optimal order with dependency arrows and CD3 rankings
 *  4. What-if — deferral simulation
 *  5. Board pack — deterministic plain-text summary
 */

import { h } from '../ui/dom.js';
import {
  pageHeader, card, stat, badge, tabs, table, emptyState, timeline,
} from '../ui/components.js';
import { formatDate } from '../core/time.js';
import {
  buildDecisionPortfolioReport,
  PORTFOLIO_MIN_DECISIONS,
  PORTFOLIO_SIGNALS,
  simulateDeferral,
  portfolioBoardBrief,
} from '../core/domain/decisionPortfolio.js';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'coupling', label: 'Coupling' },
  { key: 'sequencing', label: 'Sequencing' },
  { key: 'whatif', label: 'What-if' },
  { key: 'board', label: 'Board pack' },
];

function money(currency, amount) {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return '—';
  return `${currency || ''} ${Math.round(Number(amount)).toLocaleString('en-US')}`.trim();
}

function num(value, unit = '') {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const text = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(value));
  return unit ? `${text} ${unit}` : text;
}

function pct(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `${Math.round(Number(value) * 100)}%`;
}

const BAND_TONE = {
  light: 'good',
  moderate: 'neutral',
  elevated: 'caution',
  heavy: 'bad',
  critical: 'bad',
};

const SIGNAL_TONE = {
  1: 'neutral',
  2: 'caution',
  3: 'bad',
  4: 'bad',
  5: 'bad',
};

export function renderDecisionPortfolio(ctx) {
  const { state, now } = ctx;
  const report = buildDecisionPortfolioReport(state, now);
  const tab = ctx.query.get('tab') || 'overview';
  const activeTab = TABS.find((t) => t.key === tab) ? tab : 'overview';

  const header = pageHeader({
    title: 'Decision Portfolio',
    subtitle: 'Sequence your open decisions by delay cost, coupling and dependencies — not by inbox order.',
    actions: [],
  });

  if (report.totals.open < PORTFOLIO_MIN_DECISIONS) {
    return h('div', { class: 'page' },
      header,
      emptyState({
        title: 'Not enough open decisions',
        body: `Portfolio intelligence requires at least ${PORTFOLIO_MIN_DECISIONS} open decisions. Record decisions at #/decisions and price their timing at #/tempo.`,
      }),
    );
  }

  const tabNav = tabs({
    tabs: TABS,
    active: activeTab,
    baseUrl: '#/portfolio',
  });

  let body;
  switch (activeTab) {
    case 'overview': body = renderOverview(report); break;
    case 'coupling': body = renderCoupling(report, state); break;
    case 'sequencing': body = renderSequencing(report, state); break;
    case 'whatif': body = renderWhatIf(report); break;
    case 'board': body = renderBoard(report); break;
    default: body = renderOverview(report);
  }

  return h('div', { class: 'page' }, header, tabNav, body);
}

/* ------------------------------------------------------------------ */
/* Overview Tab                                                         */
/* ------------------------------------------------------------------ */

function renderOverview(report) {
  const loadIndex = report.loadIndex;
  const stats = h('div', { class: 'stats-grid' },
    stat({ label: 'Open decisions', value: report.totals.open, help: 'Decisions awaiting a choice.' }),
    stat({ label: 'Priced', value: report.totals.priced, help: 'Decisions with a delay cost from Decision Tempo.' }),
    stat({ label: 'Unpriced', value: report.totals.unpriced, help: 'Decisions without a delay cost — sequencing is incomplete.' }),
    stat({
      label: 'Weekly carrying cost',
      value: report.totals.totalWeeklyDelayCost !== null
        ? money(report.totals.currency, report.totals.totalWeeklyDelayCost)
        : '—',
      help: 'Additive total of all priced decisions\' weekly cost of delay. Currencies are never summed.',
    }),
    stat({
      label: 'Decision load index',
      value: loadIndex ? pct(loadIndex.value) : '—',
      help: loadIndex ? `${loadIndex.band.label}: ${loadIndex.band.help}` : '',
    }),
    stat({
      label: 'Sequencing regret',
      value: report.sequencing.regret !== null ? num(report.sequencing.regret, 'units') : '—',
      help: 'Weighted-delay units saved by reordering the queue from date-first to CD3-optimal.',
    }),
  );

  // Signals panel.
  const signalsPanel = report.signals.length > 0
    ? card({
        title: 'Signals',
        body: h('ul', { class: 'signal-list' },
          ...report.signals.map((s) =>
            h('li', { class: `signal-item severity-${s.severity}` },
              badge(s.id, SIGNAL_TONE[s.severity] || 'neutral'),
              h('span', null, s.summary),
            ),
          ),
        ),
      })
    : card({
        title: 'Signals',
        body: h('p', { class: 'muted' }, 'No portfolio-level signals at severity 2 or above.'),
      });

  // Load index breakdown.
  const loadPanel = loadIndex
    ? card({
        title: 'Decision load breakdown',
        body: h('div', { class: 'load-components' },
          ...Object.entries(loadIndex.components).map(([key, comp]) =>
            h('div', { class: 'load-component' },
              h('div', { class: 'load-label' }, key.charAt(0).toUpperCase() + key.slice(1)),
              h('div', { class: 'load-bar' },
                h('div', {
                  class: `load-fill ${comp.score > 0.6 ? 'is-bad' : comp.score > 0.3 ? 'is-caution' : 'is-good'}`,
                  style: `width: ${Math.round(comp.score * 100)}%`,
                }),
              ),
              h('div', { class: 'load-value' }, `${pct(comp.score)} (×${comp.weight})`),
              h('div', { class: 'load-raw muted tiny' }, `raw: ${num(comp.raw)}`),
            ),
          ),
        ),
      })
    : null;

  // Priority queue (optimal sequencing, top 10).
  const topN = report.sequencing.optimal.slice(0, 10);
  const queueTable = topN.length > 0
    ? card({
        title: 'Priority queue (top 10)',
        body: table({
          columns: [
            { key: 'pos', label: '#', width: '3em' },
            { key: 'title', label: 'Decision' },
            { key: 'cd3', label: 'CD3' },
            { key: 'weeklyCoD', label: 'Weekly CoD' },
            { key: 'age', label: 'Age' },
            { key: 'type', label: 'Type' },
          ],
          rows: topN.map((e, idx) => ({
            pos: String(e.position),
            title: h('a', { href: `#/decisions?decision=${e.decision.id}` }, e.decision.title),
            cd3: e.cd3 !== null ? num(e.cd3) : h('span', { class: 'muted' }, 'unpriced'),
            weeklyCoD: e.priced ? money(e.currency, e.weeklyCoD) : h('span', { class: 'muted' }, '—'),
            age: `${e.ageDays}d`,
            type: e.type || '—',
          })),
        }),
      })
    : null;

  // Clusters summary.
  const nonSingletonClusters = report.coupling.clusters.filter((c) => !c.isSingleton);
  const clustersPanel = nonSingletonClusters.length > 0
    ? card({
        title: `Decision clusters (${nonSingletonClusters.length})`,
        subtitle: 'Coupled decisions that should be addressed together.',
        body: h('div', { class: 'cluster-list' },
          ...nonSingletonClusters.map((cluster) =>
            h('div', { class: 'cluster-item' },
              h('div', { class: 'cluster-head' },
                badge(`${cluster.size} decisions`, 'neutral'),
                cluster.totalWeeklyCoD !== null
                  ? h('span', { class: 'cluster-cost' }, money(report.totals.currency, cluster.totalWeeklyCoD) + '/wk')
                  : h('span', { class: 'muted' }, 'unpriced'),
                cluster.unpricedCount > 0
                  ? badge(`${cluster.unpricedCount} unpriced`, 'caution')
                  : null,
              ),
              h('ul', { class: 'cluster-decisions' },
                ...cluster.decisionIds.map((id) => {
                  const e = report.decisions.find((d) => d.decision.id === id);
                  return h('li', null,
                    h('a', { href: `#/decisions?decision=${id}` }, e?.decision.title || id),
                  );
                }),
              ),
            ),
          ),
        ),
      })
    : null;

  // Bottleneck panel.
  const bottleneckPanel = report.bottlenecks.approvers.length > 0
    ? card({
        title: 'Approver bottleneck',
        body: h('div', null,
          h('p', null, `Most-loaded approver: "${report.bottlenecks.approvers[0].name}" with ${report.bottlenecks.maxApproverLoad} open decisions.`),
          report.bottlenecks.approverHHI !== null
            ? h('p', { class: 'muted' }, `Approver concentration HHI: ${report.bottlenecks.approverHHI} (1.0 = one person approves everything).`)
            : null,
          h('ul', null,
            ...report.bottlenecks.approvers.slice(0, 5).map((a) =>
              h('li', null, `${a.name}: ${a.count} decision${a.count === 1 ? '' : 's'}`),
            ),
          ),
        ),
      })
    : null;

  return h('div', { class: 'portfolio-overview' },
    stats,
    signalsPanel,
    loadPanel,
    queueTable,
    clustersPanel,
    bottleneckPanel,
  );
}

/* ------------------------------------------------------------------ */
/* Coupling Tab                                                         */
/* ------------------------------------------------------------------ */

function renderCoupling(report, state) {
  const nonSingleton = report.coupling.clusters.filter((c) => !c.isSingleton);
  if (nonSingleton.length === 0 && report.coupling.pairs === 0) {
    return card({
      title: 'No coupling detected',
      body: h('p', { class: 'muted' }, 'No open decisions share premises, resources or approvers. Each decision can be addressed independently.'),
    });
  }

  // Build a coupling detail table.
  const rows = [];
  const seen = new Set();
  for (const e of report.decisions) {
    const peers = report.coupling.matrix.get(e.decision.id);
    if (!peers) continue;
    for (const [peerId, pair] of peers) {
      const key = [e.decision.id, peerId].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      const peer = report.decisions.find((d) => d.decision.id === peerId);
      rows.push({
        a: h('a', { href: `#/decisions?decision=${e.decision.id}` }, e.decision.title),
        b: h('a', { href: `#/decisions?decision=${peerId}` }, peer?.decision.title || peerId),
        shared: pair.sharedResources.map((r) => r.type).join(', ') || '—',
        approver: pair.sharedApprover ? badge('shared approver', 'caution') : null,
        premises: pair.sharedPremises.length > 0
          ? badge(`${pair.sharedPremises.length} shared`, 'caution')
          : null,
      });
    }
  }

  return h('div', null,
    card({
      title: `Coupling matrix (${report.coupling.pairs} pairs)`,
      subtitle: 'Two decisions are coupled when they share a premise, resource or approver in the typed link graph.',
      body: table({
        columns: [
          { key: 'a', label: 'Decision A' },
          { key: 'b', label: 'Decision B' },
          { key: 'shared', label: 'Shared resources' },
          { key: 'approver', label: 'Approver' },
          { key: 'premises', label: 'Premises' },
        ],
        rows,
      }),
    }),
    card({
      title: 'What coupling means',
      body: h('div', { class: 'prose' },
        h('p', null, 'Coupled decisions should be addressed in sequence or together because:'),
        h('ul', null,
          h('li', null, 'A shared premise means one decision\'s outcome may resolve or contradict the other\'s assumption.'),
          h('li', null, 'A shared resource (case, goal, budget) means the decisions compete for the same operational attention.'),
          h('li', null, 'A shared approver creates a bottleneck — both decisions wait on the same person.'),
        ),
        h('p', null, 'The Sequencing tab uses coupling to batch decisions into clusters and order them by delay cost.'),
      ),
    }),
  );
}

/* ------------------------------------------------------------------ */
/* Sequencing Tab                                                      */
/* ------------------------------------------------------------------ */

function renderSequencing(report, state) {
  const optimal = report.sequencing.optimal;
  if (optimal.length === 0) {
    return emptyState({ title: 'No sequencing data', body: 'Price decisions at #/tempo to enable sequencing.' });
  }

  // Build the sequencing table with layer indicators.
  const rows = optimal.map((e) => {
    const layerIdx = e.layer;
    const prevLayer = optimal.findIndex((o) => o.layer === layerIdx);
    const isFirst = optimal[prevLayer]?.decision.id === e.decision.id;
    return {
      pos: h('div', { class: `seq-pos layer-${layerIdx}` },
        isFirst ? h('span', { class: 'layer-badge' }, `L${layerIdx}`) : null,
        String(e.position),
      ),
      title: h('div', null,
        h('a', { href: `#/decisions?decision=${e.decision.id}` }, e.decision.title),
        e.decision.reversibility === 'irreversible' ? badge('irreversible', 'caution') : null,
      ),
      cd3: e.cd3 !== null ? num(e.cd3) : h('span', { class: 'muted' }, '—'),
      weeklyCoD: e.priced ? money(e.currency, e.weeklyCoD) : h('span', { class: 'muted' }, '—'),
      age: `${e.ageDays}d`,
      type: e.type || '—',
      approver: e.approver || '—',
    };
  });

  const regretNote = report.sequencing.regret > 0
    ? card({
        title: 'Sequencing regret',
        body: h('p', null,
          `Your current date-first ordering accumulates ${num(report.sequencing.currentOrderCost)} weighted-delay units. `,
          `The CD3-optimal order accumulates ${num(report.sequencing.optimalOrderCost)}. `,
          h('strong', null, `Reordering saves ${num(report.sequencing.regret)} units.`),
          ` This is an additive approximation — coupling and dependencies may change the real figure.`,
        ),
      })
    : null;

  const dependencyNote = report.dependencies.edges > 0
    ? card({
        title: 'Dependencies',
        body: h('div', null,
          h('p', null, `${report.dependencies.edges} decision ${report.dependencies.edges === 1 ? 'dependency' : 'dependencies'} across ${report.dependencies.maxChainLength} topological layer${report.dependencies.maxChainLength === 1 ? '' : 's'}.`),
          h('p', { class: 'muted' }, 'Dependencies are derived from shared premises: when two decisions rest on the same assumption, the higher-CD3 decision is scheduled first. The layer badge (L0, L1, …) shows the topological order.'),
        ),
      })
    : null;

  return h('div', null,
    regretNote,
    dependencyNote,
    card({
      title: 'Optimal sequence',
      subtitle: 'Topological layers (L0 first), sorted by CD3 within each layer. Unpriced decisions are listed last within their layer.',
      body: table({
        columns: [
          { key: 'pos', label: '#', width: '4em' },
          { key: 'title', label: 'Decision' },
          { key: 'cd3', label: 'CD3' },
          { key: 'weeklyCoD', label: 'Weekly CoD' },
          { key: 'age', label: 'Age' },
          { key: 'type', label: 'Type' },
          { key: 'approver', label: 'Approver' },
        ],
        rows,
      }),
    }),
  );
}

/* ------------------------------------------------------------------ */
/* What-if Tab                                                          */
/* ------------------------------------------------------------------ */

function renderWhatIf(report) {
  const priced = report.decisions.filter((e) => e.priced);
  if (priced.length === 0) {
    return card({
      title: 'What-if deferral simulation',
      body: h('p', { class: 'muted' }, 'Price at least one decision at #/tempo to simulate deferral costs.'),
    });
  }

  // Show deferral costs for 1, 2, and 4 weeks for each cluster.
  const clusters = report.coupling.clusters.filter((c) => c.size >= 1);
  const rows = [];

  for (const cluster of clusters) {
    const sim1 = simulateDeferral(report, cluster.decisionIds, 1);
    const sim2 = simulateDeferral(report, cluster.decisionIds, 2);
    const sim4 = simulateDeferral(report, cluster.decisionIds, 4);

    const label = cluster.size === 1
      ? (report.decisions.find((e) => e.decision.id === cluster.decisionIds[0])?.decision.title || 'Solo')
      : `Cluster (${cluster.size} decisions)`;

    rows.push({
      target: h('div', null,
        h('strong', null, label),
        cluster.size > 1
          ? h('div', { class: 'muted tiny' }, cluster.decisionIds.map((id) =>
              report.decisions.find((e) => e.decision.id === id)?.decision.title || id,
            ).join(', '))
          : null,
      ),
      week1: sim1.additionalCost !== null ? money(sim1.currency, sim1.additionalCost) : h('span', { class: 'muted' }, '—'),
      week2: sim2.additionalCost !== null ? money(sim2.currency, sim2.additionalCost) : h('span', { class: 'muted' }, '—'),
      week4: sim4.additionalCost !== null ? money(sim4.currency, sim4.additionalCost) : h('span', { class: 'muted' }, '—'),
      cascade: sim1.cascadeIds.length > 0 ? badge(`${sim1.cascadeIds.length} cascaded`, 'caution') : '—',
    });
  }

  return h('div', null,
    card({
      title: 'Deferral cost by cluster',
      subtitle: 'What does waiting cost? Additional delay cost if the entire cluster is deferred by N weeks.',
      body: table({
        columns: [
          { key: 'target', label: 'Decision / cluster' },
          { key: 'week1', label: '1 week' },
          { key: 'week2', label: '2 weeks' },
          { key: 'week4', label: '4 weeks' },
          { key: 'cascade', label: 'Cascade' },
        ],
        rows,
      }),
    }),
    card({
      title: 'How to read this',
      body: h('div', { class: 'prose' },
        h('p', null, 'The additional cost is the delay cost accumulated by waiting N weeks beyond today. A linear delay profile doubles when you double the wait; a fixed-date profile stays zero until the date passes.'),
        h('p', null, '"Cascade" counts decisions in later topological layers that would also stall if this cluster is deferred. These are downstream dependencies, not independent items.'),
        h('p', { class: 'muted' }, 'Currencies are never summed. Each row shows the cost in the decision\'s own currency.'),
      ),
    }),
  );
}

/* ------------------------------------------------------------------ */
/* Board Pack Tab                                                       */
/* ------------------------------------------------------------------ */

function renderBoard(report) {
  const brief = portfolioBoardBrief(report);
  return card({
    title: 'Board pack — Decision Portfolio',
    subtitle: 'A deterministic plain-text summary for a leadership update. No names, no prose — just the numbers.',
    body: h('pre', { class: 'board-brief' }, brief),
  });
}
