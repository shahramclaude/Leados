/**
 * app/views/network.js — Influence Network Intelligence (`#/network`).
 *
 * A browser-native front end over the pure ONA engine in
 * `core/domain/orgNetwork.js`. Every number is derived from the leader's own
 * typed records; this file only renders, reads settings, and routes the two
 * writes (tie-strength focus, follow-through scan) through `ctx.api`.
 * Deterministic — no network, no LLM, no telemetry.
 */

import { h, toast } from '../ui/dom.js';
import {
  pageHeader, card, stat, badge, banner, tabs, table, emptyState, kv,
} from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import {
  ORG_ENGINE_VERSION,
  ORG_FLAG_LABELS,
  ORG_RULES,
  ORG_CENTRALIZATION_WARN,
  ORG_HOLE_CONSTRAINT,
  buildNetworkReport,
  networkLayout,
  networkSignals,
  buildNetworkBrief,
  connectedComponents,
} from '../core/domain/orgNetwork.js';

const TABS = [
  { key: 'map', label: 'Network map' },
  { key: 'positions', label: 'Positions & centrality' },
  { key: 'holes', label: 'Brokers & structural holes' },
  { key: 'stress', label: 'Key-person stress test' },
  { key: 'followthrough', label: 'Follow-through & board pack' },
];

/* ------------------------------------------------------------------ utils */
function fmt(v, dp = 2) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: dp }).format(Number(v));
}
function pctf(v) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return '—';
  return `${Math.round(Number(v) * 100)}%`;
}
function short(name) {
  const parts = String(name || '').trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : (parts[0] || '?');
}

const FLAG_PRIORITY = ['key-person', 'bridge', 'broker', 'isolated', 'structural-hole', 'hub', 'peripheral'];
const FLAG_COLOR = {
  'key-person': '#b6472f',
  bridge: '#c07a1f',
  broker: '#a9761b',
  isolated: '#b23b48',
  'structural-hole': '#6b46a8',
  hub: '#1f7a68',
  peripheral: '#5b7080',
  default: '#3d7d84',
};
function primaryFlag(p) {
  for (const f of FLAG_PRIORITY) if (p.flags.includes(f)) return f;
  return 'default';
}
function nodeColor(p) { return FLAG_COLOR[primaryFlag(p)] || FLAG_COLOR.default; }
function flagTone(f) {
  if (f === 'key-person' || f === 'isolated' || f === 'bridge') return 'bad';
  if (f === 'broker' || f === 'structural-hole') return 'caution';
  if (f === 'hub') return 'good';
  return 'neutral';
}
function personById(report, id) { return report.analysis.perPerson.find((p) => p.id === id) || null; }

/* ------------------------------------------------------- network map (SVG) */
/** Build a sub-graph with one node removed, for the stress-test mini-map. */
function withoutGraph(graph, removedId) {
  const ids = graph.ids.filter((id) => id !== removedId);
  const edges = graph.edges.filter((e) => e.a !== removedId && e.b !== removedId);
  const adjacency = new Map(ids.map((id) => [id, new Map()]));
  for (const e of edges) { adjacency.get(e.a)?.set(e.b, e.weight); adjacency.get(e.b)?.set(e.a, e.weight); }
  return { ids, edges, adjacency };
}

function mapSvg(graph, report, { focusId = null, dimmed = false, componentColors = null } = {}) {
  const W = 720; const H = 460; const pad = 46;
  const layout = networkLayout(graph, { iterations: dimmed ? 90 : 130 });
  const pr = new Map(report.analysis.perPerson.map((p) => [p.id, p.pageRank]));
  const maxPr = Math.max(0.0001, ...pr.values());
  const maxW = Math.max(1, ...graph.edges.map((e) => e.weight));
  const X = (x) => pad + x * (W - 2 * pad);
  const Y = (y) => pad + y * (H - 2 * pad);
  const nodes = new Set(graph.ids);

  const edgeEls = graph.edges.map((e) => {
    if (!nodes.has(e.a) || !nodes.has(e.b)) return null;
    const a = layout.get(e.a); const b = layout.get(e.b);
    if (!a || !b) return null;
    const isFocus = focusId && (e.a === focusId || e.b === focusId);
    return h('line', {
      x1: X(a.x).toFixed(1), y1: Y(a.y).toFixed(1), x2: X(b.x).toFixed(1), y2: Y(b.y).toFixed(1),
      class: 'net-edge',
      style: {
        stroke: isFocus ? '#b6472f' : '#9db8b4',
        'stroke-width': String(0.6 + 3.4 * (e.weight / maxW)),
        'stroke-opacity': dimmed ? '0.28' : (isFocus ? '0.9' : '0.55'),
      },
    });
  });

  const nodeEls = graph.ids.map((id) => {
    const pos = layout.get(id); if (!pos) return null;
    const p = personById(report, id);
    const r = p ? 7 + 20 * Math.sqrt((pr.get(id) || 0) / maxPr) : 10;
    const isFocus = focusId === id;
    const color = componentColors ? (componentColors.get(id) || '#7a8b88') : (p ? nodeColor(p) : FLAG_COLOR.default);
    return h('g', null,
      isFocus ? h('circle', { cx: X(pos.x).toFixed(1), cy: Y(pos.y).toFixed(1), r: (r + 6).toFixed(1), class: 'net-node-ring' }) : null,
      h('circle', {
        cx: X(pos.x).toFixed(1), cy: Y(pos.y).toFixed(1), r: r.toFixed(1),
        class: 'net-node',
        style: {
          fill: color, 'fill-opacity': dimmed ? '0.35' : '0.9',
          stroke: '#0f2b28', 'stroke-width': isFocus ? '2.6' : '1.2',
        },
      }, h('title', null, p ? `${p.name} — ${p.flags.length ? p.flags.join(', ') : 'connected'} · PageRank ${fmt(p.pageRank, 3)}` : id)),
      h('text', {
        x: X(pos.x).toFixed(1), y: (Y(pos.y) + r + 13).toFixed(1),
        'text-anchor': 'middle', class: 'net-node-label',
      }, p ? short(p.name) : ''),
    );
  });

  const aria = `Influence network map. ${graph.ids.length} people, ${graph.edges.length} collaboration ties. `
    + report.analysis.perPerson.slice(0, 6).map((p) => `${p.name}: influence ${fmt(p.pageRank, 3)}, betweenness ${fmt(p.betweenness, 3)}`).join('; ')
    + '. Node size reflects weighted PageRank influence; colour reflects structural role. A full data table is on the Positions tab.';

  return h('div', { class: 'net-map' },
    h('svg', {
      viewBox: `0 0 ${W} ${H}`, class: 'net-map-svg', role: 'img', preserveAspectRatio: 'xMidYMid meet',
      'aria-label': aria,
    }, ...edgeEls, ...nodeEls),
    h('ul', { class: 'net-legend' },
      ...Object.entries(FLAG_COLOR).map(([key, color]) => h('li', null,
        h('span', { class: 'net-swatch', style: { background: color } }),
        key === 'default' ? 'Connected' : (ORG_FLAG_LABELS[key] ? ORG_FLAG_LABELS[key].split(' — ')[0] : key),
      )),
    ),
    h('p', { class: 'muted tiny' }, 'Deterministic force-directed layout over the co-affiliation projection (Newman, 2001). Edges = shared work contexts; thickness = tie strength. Position is illustrative, not geographic.'),
  );
}

/* ------------------------------------------------------------------- tabs */
function mapTab(ctx, report) {
  const a = report.analysis; const m = a.metrics;
  const cards = h('div', { class: 'stat-grid' },
    stat({ label: 'People in network', value: a.nodeCount, hint: `${a.contextCount} multi-person work contexts` }),
    stat({ label: 'Collaboration ties', value: m.edgeCount, hint: `density ${fmt(m.density, 2)} · tie floor ${a.tieFloor} shared contexts` }),
    stat({ label: 'Clusters', value: m.componentCount, tone: m.fragmented ? 'caution' : '', hint: `largest ${m.largestComponent}/${a.nodeCount}` }),
    stat({ label: 'Brokerage concentration', value: pctf(m.topBrokerShare), tone: m.concentrated ? 'caution' : '', hint: `Freeman centralization ${fmt(m.betweennessCentralization, 2)}` }),
  );
  const shapeNotes = h('ul', { class: 'plain-list' },
    h('li', null, h('strong', null, 'Free of surveillance: '), 'this network is derived only from your own records — cases, decisions, delegations, dependencies, war-room games and typed links. No email, chat, calendar or sentiment data.'),
    h('li', null, h('strong', null, 'Strong-tie backbone: '), `a tie must be at least ${a.tie.pct}% as strong as the strongest tie (≥ ${a.tie.floor} of a maximum ${a.tie.maxWeight} shared contexts). Adjust the focus below.`),
    h('li', null, h('strong', null, 'Blameless: '), 'a structural position is a fact about the work graph, never a rating of a person.'),
  );
  return h('div', { class: 'stack' },
    cards,
    card({ title: 'Collaboration topology', subtitle: 'Who is connected to whom, and who holds the structure together.', body: mapSvg(a.graph, report) }),
    card({ title: 'How to read this map', body: shapeNotes }),
    tieFocusCard(ctx, report),
  );
}

function tieFocusCard(ctx, report) {
  const current = ctx.state.settings?.networkTiePct ?? 50;
  const options = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];
  return card({
    title: 'Tie-strength focus',
    subtitle: 'Incidental co-appearance can hide real structure. Focus on stronger ties to reveal brokers, bridges and holes.',
    body: h('div', { class: 'field field-inline' },
      h('label', { for: 'net-tie-focus', class: 'field-label' }, 'Show ties at least', ),
      h('select', {
        id: 'net-tie-focus', class: 'input',
        'aria-label': 'Tie-strength focus percentage',
        onChange: (e) => {
          const r = ctx.api.setNetworkTiePct(Number(e.target.value));
          if (!r.ok) toast(r.error, 'bad');
        },
      }, ...options.map((v) => h('option', { value: String(v), selected: Number(current) === v },
        v === 0 ? '0% (every real tie)' : `${v}% as strong as the strongest tie`))),
      h('span', { class: 'muted small' }, `Current floor: ${report.analysis.tieFloor} shared context(s).`),
    ),
  });
}

function positionsTab(ctx, report) {
  const a = report.analysis;
  const columns = [
    { label: 'Person', render: (r) => h('span', { class: 'net-person-cell' },
      h('span', { class: 'net-dot', style: { background: nodeColor(r) } }), h('strong', null, r.name)) },
    { label: 'Influence (PageRank)', render: (r) => fmt(r.pageRank, 3) },
    { label: 'Degree', render: (r) => `${r.degree} (${fmt(r.degreeNorm, 2)})` },
    { label: 'Betweenness', render: (r) => fmt(r.betweenness, 3) },
    { label: 'Closeness', render: (r) => fmt(r.closeness, 3) },
    { label: 'Burt constraint', render: (r) => r.constraint === null ? '—' : fmt(r.constraint, 3) },
    { label: 'Clustering', render: (r) => fmt(r.clustering, 3) },
    { label: 'Structural role', render: (r) => r.flags.length
      ? h('span', { class: 'net-flags' }, ...r.flags.map((f) => badge(ORG_FLAG_LABELS[f].split(' — ')[0], flagTone(f), ORG_FLAG_LABELS[f])))
      : h('span', { class: 'muted small' }, 'connected') },
  ];
  return h('div', { class: 'stack' },
    banner({
      tone: 'info',
      title: 'Six named network measures, one row per person',
      body: 'Degree (Freeman 1979) = direct ties. Betweenness (Brandes 2001) = share of shortest paths. Closeness (Wasserman–Faust) = reach. PageRank = influence over the weighted graph. Burt constraint = structural holes (low = brokerage). Clustering = how interconnected a person’s neighbours are. All are facts about the recorded graph.',
    }),
    card({ title: 'Influence & centrality', subtitle: `Tie floor ${a.tieFloor} · ${a.graph.edges.length} ties · engine ${ORG_ENGINE_VERSION}`,
      body: table({ columns, rows: a.perPerson, caption: 'Influence and centrality by person', emptyMessage: 'No people to analyse.' }) }),
    card({ title: 'Work-context coverage', body: table({
      columns: [
        { label: 'Person', render: (r) => r.name },
        { label: 'Recorded work contexts', render: (r) => r.contextCount },
        { label: 'Direct ties', render: (r) => r.neighbors.length },
        { label: 'Connected to', render: (r) => r.neighbors.length ? r.neighbors.map((id) => short(personById(report, id)?.name || id)).join(', ') : '—' },
      ],
      rows: a.perPerson, caption: 'Work context coverage by person', emptyMessage: 'No contexts recorded.',
    }) }),
  );
}

function holesTab(ctx, report) {
  const a = report.analysis; const m = a.metrics;
  const namesOf = (ids) => ids.map((id) => personById(report, id)?.name || id);
  const brokers = m.brokers.length ? m.brokers : [];
  const summary = h('div', { class: 'stat-grid' },
    stat({ label: 'Brokers', value: m.brokers.length, tone: m.brokers.length ? 'caution' : '', hint: `betweenness ≥ 0.12` }),
    stat({ label: 'Bridges (articulation points)', value: m.articulation.length, tone: m.articulation.length ? 'caution' : '', hint: `${m.bridges.length} bridge edges` }),
    stat({ label: 'Structural holes spanned', value: m.holes.length, hint: `Burt constraint ≤ ${ORG_HOLE_CONSTRAINT}` }),
    stat({ label: 'Freeman centralization', value: fmt(m.betweennessCentralization, 3), tone: m.concentrated ? 'caution' : '', hint: `warning ≥ ${ORG_CENTRALIZATION_WARN}` }),
  );
  const brokerTable = table({
    columns: [
      { label: 'Person', render: (r) => h('strong', null, r.name) },
      { label: 'Betweenness', render: (r) => fmt(r.betweenness, 3) },
      { label: 'Burt constraint', render: (r) => r.constraint === null ? '—' : fmt(r.constraint, 3) },
      { label: 'Clustering', render: (r) => fmt(r.clustering, 3) },
      { label: 'Role', render: (r) => r.flags.includes('bridge') ? badge('Bridge', 'bad') : badge('Broker', 'caution') },
      { label: 'Action', render: (r) => h('button', { class: 'btn btn-tiny btn-ghost', type: 'button', onClick: () => ctx.navigate(`#/network?tab=stress&person=${encodeURIComponent(r.id)}`) }, 'Stress test') },
    ],
    rows: brokers, caption: 'Brokers and structural-hole spanners', emptyMessage: 'No single person dominates shortest paths — brokerage is distributed.',
  });
  const bridgeList = m.articulation.length
    ? h('ul', { class: 'plain-list' }, ...m.articulation.map((id) => {
        const p = personById(report, id);
        return h('li', null, h('strong', null, p?.name || id), ` — removing them disconnects the collaboration graph (Tarjan articulation point). ${p?.impact.fragmentsBy || 0} extra component(s) would form.`);
      }))
    : h('p', { class: 'muted' }, 'No articulation points: the network stays connected if any one person is removed.');
  return h('div', { class: 'stack' },
    summary,
    card({ title: 'Betweenness centralization', subtitle: `Top-broker share ${pctf(m.topBrokerShare)} of all shortest-path brokerage.`,
      body: h('p', null, m.concentrated
        ? `Brokerage is concentrated (Freeman index ${fmt(m.betweennessCentralization, 3)} ≥ ${ORG_CENTRALIZATION_WARN}). One or two people are the conduit for most cross-team information — a coordination bottleneck and a continuity risk. Distribute connections and confirm the load is sustainable.`
        : `Brokerage is distributed (Freeman index ${fmt(m.betweennessCentralization, 3)} < ${ORG_CENTRALIZATION_WARN}). No single person dominates information flow.`) }),
    card({ title: 'Brokers & structural-hole spanners', body: brokerTable }),
    card({ title: 'Articulation points (single points of connection)', body: bridgeList }),
    card({ title: 'Fused with operational stewardship', subtitle: 'Burt structural holes × Simchi-Levi continuity bus factor.',
      body: table({
        columns: [
          { label: 'Person', render: (r) => r.name },
          { label: 'Primary steward of', render: (r) => `${r.stewardship.primaryOf} dependency(ies)` },
          { label: 'Without verified backup', render: (r) => r.stewardship.unverifiedBackup
            ? h('span', { class: 'cell-bad' }, String(r.stewardship.unverifiedBackup)) : String(r.stewardship.unverifiedBackup) },
          { label: 'Betweenness', render: (r) => fmt(r.betweenness, 3) },
          { label: 'Structural key-person', render: (r) => r.keyPerson ? badge('Yes', 'bad') : badge('No', 'neutral') },
        ],
        rows: a.perPerson.filter((p) => p.stewardship.primaryOf > 0 || p.keyPerson),
        caption: 'Structural position fused with operational stewardship',
        emptyMessage: 'No dependency stewards recorded yet — add them in Operational Resilience to fuse the two lenses.',
      }) }),
  );
}

function stressTab(ctx, report) {
  const a = report.analysis;
  const focusId = ctx.query.get('person') || (a.perPerson[0]?.id ?? null);
  const ranked = a.perPerson.slice().sort((x, y) =>
    y.impact.efficiencyLoss - x.impact.efficiencyLoss || y.impact.fragmentsBy - x.impact.fragmentsBy || y.betweenness - x.betweenness);

  const tableEl = table({
    columns: [
      { label: 'Person', render: (r) => h('strong', null, r.name) },
      { label: 'Components (before → after)', render: (r) => `${r.impact.componentsBefore} → ${r.impact.componentsAfter}${r.impact.fragmentsBy ? ` (+${r.impact.fragmentsBy})` : ''}` },
      { label: 'Largest cluster', render: (r) => `${r.impact.largestBefore} → ${r.impact.largestAfter}` },
      { label: 'Efficiency', render: (r) => `${fmt(r.impact.efficiencyBefore, 3)} → ${fmt(r.impact.efficiencyAfter, 3)}` },
      { label: 'Efficiency loss', render: (r) => r.impact.efficiencyLoss >= 0.18 ? badge(pctf(r.impact.efficiencyLoss), 'bad') : pctf(r.impact.efficiencyLoss) },
      { label: 'Load-bearing', render: (r) => r.loadBearing ? badge('Yes', 'caution') : badge('No', 'neutral') },
      { label: 'Action', render: (r) => h('button', { class: 'btn btn-tiny btn-ghost', type: 'button', onClick: () => ctx.navigate(`#/network?tab=stress&person=${encodeURIComponent(r.id)}`) }, 'Simulate') },
    ],
    rows: ranked,
    caption: 'Node-removal structural criticality by person',
    emptyMessage: 'No people to stress test.',
  });

  // Simulate the focused person's removal and colour the surviving graph by
  // its resulting connected components, so fragmentation is visible at a glance.
  let simulation = null;
  const focusP = focusId ? personById(report, focusId) : null;
  if (focusP && a.graph.ids.length > 1) {
    const wg = withoutGraph(a.graph, focusId);
    const comps = connectedComponents(wg);
    const palette = ['#1f7a68', '#6b46a8', '#c07a1f', '#3d7d84', '#b23b48', '#5b7080', '#8a6d1f'];
    const compColor = new Map();
    comps.forEach((comp, i) => comp.forEach((id) => compColor.set(id, palette[i % palette.length])));
    const before = focusP.impact.efficiencyBefore; const after = focusP.impact.efficiencyAfter;
    simulation = h('div', { class: 'stack' },
      banner({
        tone: focusP.loadBearing ? 'caution' : 'info',
        title: `If ${focusP.name} were unavailable`,
        body: `Network efficiency ${fmt(before, 3)} → ${fmt(after, 3)} (${pctf(focusP.impact.efficiencyLoss)} loss). Connected components ${focusP.impact.componentsBefore} → ${focusP.impact.componentsAfter}. Largest cluster ${focusP.impact.largestBefore} → ${focusP.impact.largestAfter}. ${focusP.loadBearing ? 'This person is structurally load-bearing — open a blameless cross-training follow-through.' : 'Removing them does not materially fragment the recorded network.'}`,
      }),
      card({ title: `Network without ${focusP.name}`, subtitle: 'Surviving people coloured by resulting connected component (Latora–Marchiori efficiency).',
        body: mapSvg(wg, report, { focusId: null, dimmed: false, componentColors: compColor }) }),
      card({ title: 'Continuity cross-check', body: h('div', { class: 'kv-grid' },
        kv('Structural role', focusP.flags.length ? focusP.flags.map((f) => ORG_FLAG_LABELS[f].split(' — ')[0]).join(', ') : 'connected'),
        kv('Betweenness', fmt(focusP.betweenness, 3)),
        kv('Primary steward of', `${focusP.stewardship.primaryOf} dependency(ies)`),
        kv('Dependencies without verified backup', focusP.stewardship.unverifiedBackup),
        kv('Extra components on removal', focusP.impact.fragmentsBy),
        kv('People isolated on removal', focusP.impact.isolatesAfter),
      ) }),
    );
  }

  return h('div', { class: 'stack' },
    banner({ tone: 'info', title: 'A deterministic structural key-person stress test',
      body: 'For each person, LeadOS removes them from the collaboration graph and recomputes connected components and Latora–Marchiori global efficiency (Σ 1/shortest-path over all pairs). A large efficiency loss or extra components means the person is load-bearing. This is a what-if on the recorded graph — not a prediction about anyone — and it is fused with the continuity Bus Factor (verified dependency backups).' }),
    card({ title: 'Removal impact ranking', subtitle: 'Sorted by efficiency loss, then fragmentation, then betweenness.', body: tableEl }),
    simulation,
  );
}

function followthroughTab(ctx, report) {
  const a = report.analysis; const m = a.metrics;
  const signals = networkSignals(ctx.state, ctx.now);
  const brief = buildNetworkBrief(report);
  const auto = ctx.state.settings?.networkAutoPropagate !== false;

  const scanBtn = h('button', {
    class: 'btn btn-primary', type: 'button',
    onClick: () => {
      const r = ctx.api.rescanNetwork();
      if (!r.ok) toast(r.error, 'bad');
      else toast(r.changed ? 'Follow-through applied across Decisions, Delegations, 1:1s and the graph.' : 'Network is already in sync — no new follow-through needed.', 'good');
    },
  }, 'Run influence-network follow-through');

  const toggle = h('label', { class: 'toggle-row' },
    h('input', {
      type: 'checkbox', class: 'input', checked: auto,
      'aria-label': 'Automatic influence-network follow-through for declared network events',
      onChange: (e) => { const r = ctx.api.setNetworkAutoPropagate(e.target.checked); if (!r.ok) toast(r.error, 'bad'); },
    }),
    h('span', null, h('strong', null, 'Automatic follow-through '), h('span', { class: 'muted small' }, '— when another module declares a network-significant event, fan the analysis out inside the store transaction. An explicit scan always runs.')),
  );

  const signalList = signals.length
    ? h('ul', { class: 'plain-list' }, ...signals.map((s) => h('li', { class: 'row-between' },
        h('div', null, h('strong', null, `${s.ruleId} · ${s.title}`), h('p', { class: 'muted small' }, s.detail.slice(0, 180) + (s.detail.length > 180 ? '…' : ''))),
        badge(`Severity ${s.severity}`, s.severity >= 4 ? 'bad' : s.severity >= 3 ? 'caution' : 'neutral'))))
    : h('p', { class: 'muted' }, 'No structural network findings right now. Keep recording work and the network will surface brokers, isolates and fragmentation as they emerge.');

  return h('div', { class: 'stack' },
    card({ title: 'Atomic cross-module follow-through', subtitle: 'One analysis → typed links, a cross-training delegation, a DACI org-design decision, blameless 1:1 talking points and signals — all in one store transaction (RULE-ORG-01..05).',
      body: h('div', { class: 'stack' },
        h('div', { class: 'row-gap' }, scanBtn),
        toggle,
        h('p', { class: 'muted small' }, `Currently: ${m.keyPersons.length} structural key-person(s), ${m.isolates.length} isolate(s), ${m.componentCount} cluster(s), ${m.concentrated ? 'concentrated' : 'distributed'} brokerage. A repeated scan is idempotent and clears resolved 1:1 prompts.`),
      ) }),
    card({ title: 'Automation rules on this spine', body: h('ul', { class: 'plain-list' },
      ...ORG_RULES.map((r) => h('li', null, h('strong', null, `${r.id} · ${r.name}`), h('span', { class: 'muted small' }, ` — ${r.framework}`), h('p', { class: 'muted small' }, r.description)))) }),
    card({ title: 'Live structural findings', body: signalList }),
    card({
      title: 'Board-ready brief', subtitle: 'Deterministic, privacy-safe, no invented numbers.',
      actions: [h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => {
        const ok = downloadText({ filename: `leados-influence-network-${new Date().toISOString().slice(0, 10)}.txt`, text: brief, mime: 'text/plain' });
        toast(ok ? 'Board brief downloaded.' : 'Your browser blocked the download — the brief is shown below; copy it instead.', ok ? 'good' : 'neutral');
      } }, 'Download brief')],
      body: h('div', null,
        h('pre', { class: 'net-brief' }, brief),
        h('p', { class: 'muted tiny' }, 'Also available as a data-minimised CSV scope (counts and dimensionless scores only, no names or free text) in Settings → Export.'),
      ),
    }),
  );
}

/* ------------------------------------------------------------------- page */
export function renderNetwork(ctx) {
  const report = buildNetworkReport(ctx.state, ctx.now);
  const tab = TABS.some((t) => t.key === ctx.query.get('tab')) ? ctx.query.get('tab') : 'map';

  const header = pageHeader({
    eyebrow: 'Influence & collaboration network intelligence',
    title: 'Influence Network',
    subtitle: 'Organizational Network Analysis derived entirely from your own records — no surveillance. Exact centrality, structural holes, and a node-removal key-person stress test, propagated across every module.',
    meta: h('span', { class: 'muted tiny' }, `Engine ${ORG_ENGINE_VERSION} · Schema v30 · ONA without eavesdropping`),
    actions: [h('button', { class: 'btn btn-primary', type: 'button', onClick: () => {
      const r = ctx.api.rescanNetwork();
      if (!r.ok) toast(r.error, 'bad');
      else toast(r.changed ? 'Follow-through applied across modules.' : 'Network already in sync.', 'good');
    } }, 'Run follow-through')],
  });

  const tabBar = tabs({
    items: TABS, active: tab, ariaLabel: 'Influence network sections',
    onSelect: (key) => ctx.navigate(`#/network?tab=${key}`),
  });

  let body;
  if (!report.ok) {
    body = card({ body: emptyState({
      title: report.analysis.reason === 'too-few-people'
        ? 'Add a few people and some shared work'
        : 'The network cannot be measured yet',
      body: 'The Influence Network needs at least two active people and records that involve them together — operational cases, DACI decisions with contributors, delegations, org changes, continuity dependencies, coalition games or typed graph links. LeadOS derives the collaboration graph entirely from those records; it never reads email, chat or calendar, and never fabricates a connection. Nothing is inferred on an empty workspace.',
      action: h('a', { class: 'btn btn-primary', href: '#/people' }, 'Open your people'),
      icon: '❖',
    }) });
  } else if (tab === 'positions') body = positionsTab(ctx, report);
  else if (tab === 'holes') body = holesTab(ctx, report);
  else if (tab === 'stress') body = stressTab(ctx, report);
  else if (tab === 'followthrough') body = followthroughTab(ctx, report);
  else body = mapTab(ctx, report);

  return h('div', { class: 'page' }, header, tabBar, body);
}

export default renderNetwork;
