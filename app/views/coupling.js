/**
 * app/views/coupling.js — Coupled Load Terminal (Schema v61).
 *
 * The screen answers one question no other terminal answers: *when two
 * people's work is coupled — a shared approver, a hand-off, a co-owned
 * obligation — how much delay does that coupling add, and where is the
 * workspace's coupling hotspot?* Capacity prices independent queues; Load
 * prices one mind. Neither prices the coupling between them.
 *
 *   Map         the coupling graph: actors, typed edges and clusters
 *   Bottlenecks  shared approvers and delegates, ranked by coupled load
 *   Delay        the priced Kingman delay each shared approver imposes
 *   Hand-offs    measured hand-off paths and the long ones
 *   Method       the frameworks, the declared conventions and the limits
 *
 * Every figure is traced back to a record the leader entered. Nothing is
 * invented to fill space, and an unmeasured input stays `—` rather than a
 * plausible default.
 */

import { h, toast } from '../ui/dom.js';
import {
  pageHeader, card, stat, badge, banner, emptyState, table, tabs, findingCard,
} from '../ui/components.js';
import {
  buildCouplingReport,
  buildCouplingGraph,
  couplingSignals,
  couplingBrief,
  COUPLING_EDGE_LABELS,
  COUPLING_DEFAULTS,
} from '../core/domain/coupling.js';

const EDGE_TONE = {
  'shares-approver': 'warn',
  'hands-off': 'caution',
  'co-owns': 'neutral',
  'reports-to': 'good',
};

function numOrDash(value, suffix = '', dp = 1) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `${Number(value).toFixed(dp)}${suffix}`;
}

function actorName(graph, key) {
  const a = graph.byKey.get(key);
  return a ? a.name : key;
}

/**
 * Main render entry point. Called from main.js route handler.
 */
export function renderCoupling(ctx) {
  const { state, navigate } = ctx;
  const settings = { ...COUPLING_DEFAULTS, ...(state.settings || {}) };
  const report = buildCouplingReport(state, ctx.now, settings);
  const brief = couplingBrief(state, ctx.now, settings);
  const signals = couplingSignals(state, ctx.now, settings);

  const header = pageHeader({
    title: 'Coupled Load',
    subtitle: `Where your team's attention and decisions couple — and what that costs in delay. ${brief.summary}`,
    actions: [
      stat({ label: 'Coupled actors', value: report.actorCount, hint: `${report.obligationCount} live obligations` }),
      stat({ label: 'Shared bottlenecks', value: report.bottlenecks.length, tone: report.bottlenecks.length ? 'warn' : '' }),
      stat({ label: 'Coupling clusters', value: report.clusterCount }),
      stat({ label: 'Worst wait multiplier', value: `${report.maxMultiplier}×`, tone: report.maxMultiplier >= 3 ? 'warn' : '', hint: 'vs the independent wait' }),
    ],
  });

  const tabItems = [
    { key: 'map', label: 'Map' },
    { key: 'bottlenecks', label: `Bottlenecks (${report.bottlenecks.length})` },
    { key: 'delay', label: 'Delay' },
    { key: 'handoffs', label: 'Hand-offs' },
    { key: 'method', label: 'Method' },
  ];
  const activeTab = ctx.params?.tab || 'map';

  const content = activeTab === 'bottlenecks'
    ? renderBottlenecks(report, settings)
    : activeTab === 'delay'
      ? renderDelay(report, settings)
      : activeTab === 'handoffs'
        ? renderHandoffs(state, report, ctx, settings)
        : activeTab === 'method'
          ? renderMethod(settings)
          : renderMap(state, ctx, settings);

  return h('div', { className: 'space-y-6' }, [
    header,
    signals.length
      ? h('div', { className: 'space-y-3' }, signals.slice(0, 4).map((s) => findingCard(s, { onAction: () => navigate(s.action.route) })))
      : null,
    tabs({ items: tabItems, active: activeTab, onSelect: (key) => navigate(`coupling?tab=${key}`), ariaLabel: 'Coupled Load sections' }),
    content,
  ]);
}

/* ------------------------------------------------------------------ */
/* Map                                                                 */
/* ------------------------------------------------------------------ */

function renderMap(state, ctx, settings) {
  const graph = buildCouplingGraph(state, ctx.now, settings);
  const byType = new Map();
  for (const e of graph.edges) {
    if (!byType.has(e.type)) byType.set(e.type, []);
    byType.get(e.type).push(e);
  }

  const edgeSections = [...byType.entries()].map(([type, edges]) => {
    const rows = edges.slice(0, 40).map((e) => ({
      a: actorName(graph, e.a),
      b: actorName(graph, e.b),
      summary: e.summary,
    }));
    return card(`${COUPLING_EDGE_LABELS[type] || type} (${edges.length})`, [
      table({
        caption: `${COUPLING_EDGE_LABELS[type] || type} coupling edges`,
        columns: [
          { label: 'From', render: (r) => r.a },
          { label: 'To', render: (r) => r.b },
          { label: 'Why', render: (r) => r.summary || '—' },
        ],
        rows,
        emptyMessage: `No ${COUPLING_EDGE_LABELS[type] || type} edges.`,
      }),
    ]);
  });

  const clusterCard = graph.clusters.length
    ? card('Attention clusters', [
        h('p', { className: 'text-sm text-gray-600 mb-3' }, 'Connected components of the coupling graph. Work inside one cluster is not independent: a delay anywhere in it can propagate.'),
        table({
          caption: 'Coupling clusters',
          columns: [
            { label: 'Actors', render: (r) => r.size, className: 'num' },
            { label: 'Edges', render: (r) => r.edgeCount, className: 'num' },
            { label: 'Members', render: (r) => r.actors.map((k) => actorName(graph, k)).join(', ') },
          ],
          rows: graph.clusters.map((c) => ({ ...c })),
        }),
      ])
    : card('Attention clusters', [emptyState({ title: 'No clusters', body: 'With fewer than two coupled actors there is no cluster to form. Add decisions that share an approver, or delegations that hand work between people.' })]);

  return h('div', { className: 'space-y-6' }, [
    card('Coupling graph', [
      h('p', { className: 'text-sm text-gray-600' }, `${graph.actors.length} attention-bearing actor(s), ${graph.edges.length} typed coupling edge(s) across ${graph.clusters.length} cluster(s). Edges are derived from your decisions, delegations, cases and roster — never stored as a separate graph.`),
    ]),
    edgeSections.length
      ? edgeSections
      : card('Coupling graph', [emptyState({ title: 'No coupling edges', body: 'No two decisions share an approver yet, and no delegation hands work between people. Coupling is measured, never assumed.' })]),
    clusterCard,
  ]);
}

/* ------------------------------------------------------------------ */
/* Bottlenecks                                                         */
/* ------------------------------------------------------------------ */

function renderBottlenecks(report, settings) {
  if (!report.bottlenecks.length) {
    return card('Shared bottlenecks', [emptyState({ title: 'No shared bottleneck detected', body: `An approver serving at least ${settings.couplingBottleneckActors} distinct drivers, or ${settings.couplingBottleneckDecisions} decisions in ${settings.couplingWindowDays} days, is a shared bottleneck. None cleared that bar.` })]);
  }
  return card('Shared bottlenecks', [
    h('p', { className: 'text-sm text-gray-600 mb-3' }, 'An actor who bears attention for obligations belonging to several other actors. Ranked by how many actors they serve — the workspace throughput is set by its most coupled bottleneck (Goldratt).'),
    table({
      caption: 'Shared bottlenecks',
      columns: [
        { label: 'Actor', render: (r) => r.actor },
        { label: 'Kind', render: (r) => r.kind },
        { label: 'Actors served', render: (r) => r.actorsServed, className: 'num' },
        { label: 'Decisions / items', render: (r) => r.decisions, className: 'num' },
      ],
      rows: report.bottlenecks.map((b) => ({ ...b })),
    }),
  ]);
}

/* ------------------------------------------------------------------ */
/* Delay                                                               */
/* ------------------------------------------------------------------ */

function renderDelay(report, settings) {
  const priced = report.delay.filter((d) => !d.unstable);
  const unstable = report.delay.filter((d) => d.unstable);

  const convention = card('The model, in one place', [
    h('p', { className: 'text-sm text-gray-700' }, [
      'Arrival rates are counted from the decisions you already recorded over the last ',
      h('strong', null, `${settings.couplingWindowDays} days`),
      ', divided by that window (Little). Each shared approver is one server for k driver-streams; the wait is Kingman\'s diffusion approximation ',
      h('code', { className: 'mono' }, 'E[W] = (ρ/(1−ρ))·c·E[T]'),
      ' with c = 1.0 (the same convention Capacity uses). The service time ',
      h('strong', null, `${settings.couplingServiceDays} days`),
      ' is a DECLARED convention, printed here and on every row — it is not derived from the decisions it prices, because that would be circular. The headline is the multiplier: it is scale-free and approaches k as load falls, so it never pretends to know the absolute scale.',
    ]),
  ]);

  if (!report.delay.length) {
    return h('div', { className: 'space-y-6' }, [
      convention,
      card('Priced coupling delay', [emptyState({ title: 'No shared approver to price', body: 'Coupling delay needs at least two decisions sharing one approver in the window. One decision cannot couple.' })]),
    ]);
  }

  const delayRows = priced.map((d) => ({
    approver: d.approver,
    streams: d.streams,
    decisions: d.decisions,
    rho: d.rhoTotal,
    waitShared: d.waitSharedDays,
    worstDelay: Math.max(...d.perStream.map((s) => s.delayDays)),
    worstMultiplier: Math.max(...d.perStream.map((s) => s.multiplier || 0)),
  }));

  const detailCards = priced.map((d) => card(`"${d.approver}" — ${d.streams} stream(s), ${d.decisions} decisions`, [
    table({
      caption: `Streams waiting on ${d.approver}`,
      columns: [
        { label: 'Driver', render: (r) => r.driver },
        { label: 'Decisions', render: (r) => r.count, className: 'num' },
        { label: 'Alone (d)', render: (r) => numOrDash(r.waitIndependentDays, ' d', 2) },
        { label: 'Shared (d)', render: (r) => numOrDash(r.waitSharedDays, ' d', 2) },
        { label: 'Delay (d)', render: (r) => numOrDash(r.delayDays, ' d', 2) },
        { label: 'Multiplier', render: (r) => r.multiplier != null ? `${r.multiplier}×` : '—' },
      ],
      rows: d.perStream.map((s) => ({ ...s })),
    }),
  ]));

  return h('div', { className: 'space-y-6' }, [
    convention,
    unstable.length
      ? banner({ tone: 'bad', title: `${unstable.length} approver(s) at or beyond capacity`, body: 'ρ ≥ 1 means the Kingman wait diverges: this is structural overload, not a busy week.' })
      : null,
    card('Priced coupling delay', [
      table({
        caption: 'Coupling delay by shared approver',
        columns: [
          { label: 'Approver', render: (r) => r.approver },
          { label: 'Streams', render: (r) => r.streams, className: 'num' },
          { label: 'Decisions', render: (r) => r.decisions, className: 'num' },
          { label: 'ρ', render: (r) => numOrDash(r.rho, '', 3) },
          { label: 'Shared wait (d)', render: (r) => numOrDash(r.waitShared, ' d', 2) },
          { label: 'Worst delay (d)', render: (r) => numOrDash(r.worstDelay, ' d', 2) },
          { label: 'Worst multiplier', render: (r) => `${numOrDash(r.worstMultiplier, '×', 2)}` },
        ],
        rows: delayRows,
      }),
    ]),
    ...detailCards,
  ]);
}

/* ------------------------------------------------------------------ */
/* Hand-offs                                                           */
/* ------------------------------------------------------------------ */

function renderHandoffs(state, report, ctx, settings) {
  const { paths, longPaths } = report.handoffs;
  if (!paths.length) {
    return card('Hand-off paths', [emptyState({ title: 'No measured hand-off paths', body: 'A hand-off is a decision handed from its driver to its approver, or a delegation handed from you to a person. None were measured long enough to form a path.' })]);
  }
  const graph = buildCouplingGraph(state, ctx.now, settings);
  return h('div', { className: 'space-y-6' }, [
    longPaths.length
      ? banner({ tone: 'warn', title: `${longPaths.length} hand-off chain(s) of ${settings.couplingHandoffMaxChain}+ hops`, body: 'Each hop adds queue delay. A long chain finishes later than a short one even at the same total work.' })
      : null,
    card('Hand-off paths', [
      table({
        caption: 'Measured hand-off paths',
        columns: [
          { label: 'Hops', render: (r) => r.edges, className: 'num' },
          { label: 'Path', render: (r) => r.actors.map((k) => actorName(graph, k)).join(' → ') },
        ],
        rows: paths.map((p) => ({ ...p })),
      }),
    ]),
  ]);
}

/* ------------------------------------------------------------------ */
/* Method                                                             */
/* ------------------------------------------------------------------ */

function renderMethod(settings) {
  return card('Method, conventions and limits', [
    h('div', { className: 'prose-tight' }, [
      h('h3', { className: 'card-sub' }, 'Frameworks, implemented'),
      h('ul', { className: 'method-list' }, [
        h('li', null, ['Kingman (1961) diffusion approximation: ', h('code', { className: 'mono' }, 'E[W] ≈ (ρ/(1−ρ))·c·E[T]'), '. Sharing one server drives ρ up and the wait grows hyperbolically, so a coupled wait is larger than the sum of independent ones.']),
        h('li', null, ['Little (1961) L = λW: arrival rates are counted from recorded decisions over a declared window, never sampled or invented.']),
        h('li', null, ['Goldratt (1997) Theory of Constraints: the workspace throughput is set by its most coupled bottleneck, so the report names bottlenecks rather than colouring every card.']),
        h('li', null, ['Graicunas (1933) / Brooks (1975): the reporting line is one coupling edge, because coordination channels grow with the graph.']),
      ]),
      h('h3', { className: 'card-sub' }, 'Declared conventions (printed beside every figure)'),
      h('ul', { className: 'method-list' }, [
        h('li', null, `Service time ${settings.couplingServiceDays} days — declared, not measured.`),
        h('li', null, `Window ${settings.couplingWindowDays} days — the arrival-rate look-back.`),
        h('li', null, `Bottleneck floor: an approver serving ≥ ${settings.couplingBottleneckActors} distinct drivers or ≥ ${settings.couplingBottleneckDecisions} decisions.`),
        h('li', null, `Delay threshold ${settings.couplingDelayThresholdDays} days · multiplier threshold ${settings.couplingMultiplierThreshold}× · hand-off chain cap ${settings.couplingHandoffMaxChain} hops.`),
      ]),
      h('h3', { className: 'card-sub' }, 'Guarantees'),
      h('ul', { className: 'method-list' }, [
        h('li', null, 'Every arrival rate is a count of recorded decisions divided by the window. Nothing is seeded, sampled or back-filled.'),
        h('li', null, 'A shared approver with fewer than two decisions in the window is not a bottleneck — one decision cannot couple.'),
        h('li', null, 'No person is scored, rated or blamed. Coupling is measured on a role, never a performance judgement.'),
      ]),
      h('h3', { className: 'card-sub' }, 'Limits — stated, not hidden'),
      h('ul', { className: 'method-list' }, [
        h('li', null, 'The service time is a convention. If approvals actually take longer, every delay figure scales with it.'),
        h('li', null, 'Arrival rates are estimated from history, not observed live; a changing cadence changes the picture.'),
        h('li', null, 'The coupling multiplier is scale-free and approaches the stream count as load falls — it is a ratio, not an absolute wait.'),
        h('li', null, 'No correlation between obligations is modelled; two cases that share a root cause are still priced as two streams.'),
        h('li', null, 'Real-browser and assistive-technology behaviour of this terminal remains [UNVERIFIED].'),
      ]),
    ]),
  ]);
}
