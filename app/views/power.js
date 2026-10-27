/**
 * app/views/power.js — Coalition & Incentive War Room (`#/power`, `#/power/:id`).
 *
 * A browser-native front end over the pure computational political-economy
 * engine in `core/domain/power.js`. Every number is derived from the leader's
 * own recorded players, weights and payoff estimates; this file only renders
 * and routes writes through `ctx.api`. Deterministic — no network, no LLM.
 */

import { powerStressBrief } from '../core/domain/powerStress.js';
import { h, toast, openModal, confirmDialog, closeAllModals } from '../ui/dom.js';
import {
  pageHeader, card, stat, badge, banner, tabs, table, emptyState, timeline, kv,
} from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { formatDate } from '../core/time.js';
import {
  POWER_ENGINE_VERSION,
  POWER_RULES,
  POWER_STATUSES,
  POWER_STATUS_LABELS,
  POWER_STANCES,
  POWER_STANCE_LABELS,
  POWER_CONFIDENCE,
  POWER_CONFIDENCE_LABELS,
  POWER_CELLS,
  POWER_VERDICT_META,
  POWER_MIN_PLAYERS,
  POWER_MAX_PLAYERS,
  POWER_STRATEGY_AXES,
  analyzePowerGame,
  buildPowerReport,
  buildInfluenceScript,
  buildPowerBrief,
} from '../core/domain/power.js';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'coalitions', label: 'Voting power & coalitions' },
  { key: 'game', label: 'Strategic game (2×2)' },
  { key: 'incentives', label: 'Incentive design' },
  { key: 'stress', label: 'Robust strategy lab' },
  { key: 'script', label: 'Influence script & board pack' },
];

/* ------------------------------------------------------------------ utils */
function num(v, dp = 2) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: dp }).format(Number(v));
}
function pct(v) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return '—';
  return `${Math.round(Number(v) * 100)}%`;
}
function verdictBadge(a) {
  const m = a.verdictMeta || POWER_VERDICT_META.stable;
  return badge(m.label, m.tone, `Severity ${m.severity} of 5 · engine ${POWER_ENGINE_VERSION}`);
}
function confBadge(a) {
  return badge(`${a.confidenceBand} confidence`, a.confidenceBand === 'high' ? 'good' : a.confidenceBand === 'medium' ? 'caution' : 'warn');
}
function cellLabel(game, cell) {
  const [r, c] = [Number(cell[0]), Number(cell[1])];
  const s = game.strategies || POWER_STRATEGY_AXES;
  return `${(s.leader || POWER_STRATEGY_AXES.leader)[r] || `Row ${r}`} × ${(s.rival || POWER_STRATEGY_AXES.rival)[c] || `Col ${c}`}`;
}
function enriched(game, ctx) {
  return { ...game, settingsStaleDays: ctx.state.settings?.powerStaleDays, settingsFragileMargin: ctx.state.settings?.powerFragileMargin };
}
function analyze(game, ctx) {
  return analyzePowerGame(enriched(game, ctx), ctx.state, ctx.now);
}
function currentRow(report, ctx) {
  const id = ctx.query.get('game');
  return report.games.find((r) => r.game.id === id) || report.games[0] || null;
}
function gamePicker(ctx, report, row, tab) {
  if (report.games.length < 2) return null;
  return h('div', { class: 'field field-inline' },
    h('label', { for: 'power-game-select', class: 'field-label' }, 'Situation'),
    h('select', {
      id: 'power-game-select', class: 'input',
      onChange: (e) => ctx.navigate(`#/power?tab=${tab}&game=${encodeURIComponent(e.target.value)}`),
      'aria-label': 'Choose which coalition situation to analyze',
    }, ...report.games.map((r) => h('option', { value: r.game.id, selected: r.game.id === row.game.id }, r.game.title))),
  );
}

/* --------------------------------------------------------------- SVG charts */
function powerChart(a) {
  const players = a.voting.players;
  const W = 640; const rowH = 46; const padL = 168; const padR = 74;
  const H = players.length * rowH + 26;
  const max = Math.max(0.001, ...players.map((p) => Math.max(p.banzhaf, p.shapleyShubik)));
  const x = (v) => padL + (W - padL - padR) * (v / max);
  const rows = players.flatMap((p, i) => {
    const y = 14 + i * rowH;
    return [
      h('text', { x: padL - 10, y: y + 15, 'text-anchor': 'end', class: 'power-axis-label' }, p.name.slice(0, 22)),
      h('rect', { x: padL, y: y + 2, width: Math.max(0, x(p.banzhaf) - padL), height: 10, rx: 2, class: 'power-bar-banzhaf' }),
      h('rect', { x: padL, y: y + 16, width: Math.max(0, x(p.shapleyShubik) - padL), height: 10, rx: 2, class: 'power-bar-shapley' }),
      h('text', { x: W - padR + 8, y: y + 13, class: 'power-axis-label' }, `${pct(p.banzhaf)} / ${pct(p.shapleyShubik)}`),
    ];
  });
  return h('div', { class: 'power-chart' },
    h('svg', {
      viewBox: `0 0 ${W} ${H}`, class: 'power-chart-svg', role: 'img', preserveAspectRatio: 'xMidYMid meet',
      'aria-label': `Voting power by stakeholder. ${players.map((p) => `${p.name}: Banzhaf ${pct(p.banzhaf)}, Shapley-Shubik ${pct(p.shapleyShubik)}`).join('; ')}.`,
    }, ...rows),
    h('ul', { class: 'power-legend' },
      h('li', null, h('span', { class: 'power-swatch power-swatch-banzhaf' }), 'Banzhaf (swing coalitions)'),
      h('li', null, h('span', { class: 'power-swatch power-swatch-shapley' }), 'Shapley-Shubik (pivotal orderings)'),
    ),
    h('p', { class: 'muted tiny' }, 'Exact enumeration over all 2ⁿ coalitions and n! orderings (players capped at 8). Power ≠ weight: a veto player can hold more power than their vote share.'),
  );
}

function payoffChart(a, game) {
  const cells = a.game2x2.cells;
  const ls = []; const rs = [];
  for (const cell of POWER_CELLS) { const [l, r] = cells[Number(cell[0])][Number(cell[1])]; ls.push(l); rs.push(r); }
  const minL = Math.min(...ls, 0); const maxL = Math.max(...ls, 1);
  const minR = Math.min(...rs, 0); const maxR = Math.max(...rs, 1);
  const W = 560; const H = 300; const pad = 46;
  const X = (l) => pad + (W - 2 * pad) * ((l - minL) / ((maxL - minL) || 1));
  const Y = (r) => H - pad - (H - 2 * pad) * ((r - minR) / ((maxR - minR) || 1));
  const order = ['00', '01', '11', '10'];
  const poly = order.map((c) => `${X(cells[Number(c[0])][Number(c[1])][0]).toFixed(1)},${Y(cells[Number(c[0])][Number(c[1])][1]).toFixed(1)}`).join(' ');
  const ne = new Set(a.game2x2.pureNE);
  const points = POWER_CELLS.map((c) => {
    const [l, r] = cells[Number(c[0])][Number(c[1])];
    const isNe = ne.has(c);
    const isTarget = c === a.targetCell;
    return h('g', null,
      h('circle', { cx: X(l), cy: Y(r), r: isTarget ? 11 : 8, class: `power-point ${isNe ? 'is-ne' : ''} ${isTarget ? 'is-target' : ''}` }),
      h('text', { x: X(l), y: Y(r) + 3, 'text-anchor': 'middle', class: 'power-point-label' }, c),
    );
  });
  return h('div', { class: 'power-chart' },
    h('svg', {
      viewBox: `0 0 ${W} ${H}`, class: 'power-chart-svg', role: 'img', preserveAspectRatio: 'xMidYMid meet',
      'aria-label': `2x2 payoff space. Pure Nash equilibria: ${ne.size ? [...ne].join(', ') : 'none (mixed only)'}. Target cell ${a.targetCell}. Leader payoff on the horizontal axis, counterparty payoff on the vertical.`,
    },
      h('line', { x1: pad, y1: H - pad, x2: W - pad, y2: H - pad, class: 'power-axis' }),
      h('line', { x1: pad, y1: pad, x2: pad, y2: H - pad, class: 'power-axis' }),
      h('polygon', { points: poly, class: 'power-payoff-poly' }),
      ...points,
      h('text', { x: W - pad, y: H - pad + 20, 'text-anchor': 'end', class: 'power-axis-label' }, 'leader payoff →'),
      h('text', { x: pad - 8, y: pad - 10, 'text-anchor': 'start', class: 'power-axis-label' }, '↑ rival payoff'),
    ),
    h('ul', { class: 'power-legend' },
      h('li', null, h('span', { class: 'power-swatch power-swatch-ne' }), 'Pure Nash equilibrium'),
      h('li', null, h('span', { class: 'power-swatch power-swatch-target' }), 'Leader’s target'),
    ),
    h('p', { class: 'muted tiny' }, `Each point is one outcome cell (${POWER_CELLS.join(', ')}) placed by its (leader, rival) payoffs — your own estimates on a −100…100 utility scale.`),
  );
}

/* ------------------------------------------------------------------- tabs */
function overviewTab(ctx, report) {
  const t = report.totals;
  const stats = h('div', { class: 'stat-grid' },
    stat({ label: 'Situations', value: String(t.count), hint: `${t.stable} stable`, tone: '' }),
    stat({ label: 'Need attention', value: String(t.attention), hint: 'verdict other than stable', tone: t.attention ? 'bad' : 'good' }),
    stat({ label: 'Blocked coalitions', value: String(t.blocked), hint: 'no ally/neutral winning coalition', tone: t.blocked ? 'warn' : '' }),
    stat({ label: 'Misaligned targets', value: String(t.misaligned), hint: 'need an incentive transfer', tone: t.misaligned ? 'caution' : '' }),
  );
  const rows = report.games.map((r) => ({ r, a: r.analysis }));
  const queue = table({
    caption: 'Coalition & incentive situations with their computed verdict',
    columns: [
      { label: 'Situation', render: ({ r, a }) => h('div', { class: 'stack-xs' },
        h('a', { class: 'link', href: `#/power/${r.game.id}`, onClick: (e) => { e.preventDefault(); ctx.navigate(`#/power/${r.game.id}`); } }, r.game.title),
        h('span', { class: 'muted tiny' }, `${POWER_STATUS_LABELS[a.status] || a.status} · ${r.game.players.length} players · quota ${a.voting.quotaPct}%`)) },
      { label: 'Verdict', render: ({ a }) => verdictBadge(a) },
      { label: 'Confidence', render: ({ a }) => confBadge(a) },
      { label: 'Coalition', render: ({ a }) => a.voting.coalitionFeasible ? badge('feasible', 'good') : badge('blocked', 'bad') },
      { label: 'Alignment cost', className: 'num', render: ({ a }) => num(a.alignment.alignmentCost) },
      { label: 'Nash', render: ({ a }) => a.game2x2.hasPureNE ? `${a.game2x2.pureNE.length} pure` : 'mixed only' },
      { label: 'Action', render: ({ r }) => h('a', { class: 'btn btn-small btn-ghost', href: `#/power?tab=game&game=${encodeURIComponent(r.game.id)}` }, 'Analyze') },
    ],
    rows,
    emptyMessage: 'No coalition situations yet.',
  });

  const frameworks = card({
    title: 'The mathematics behind this war room',
    subtitle: 'Named, exact frameworks — not generic "best practice"',
    body: h('div', { class: 'stack-sm' },
      h('p', { class: 'small' }, 'Three disciplines, one model. Every number below is computed from the players, weights and payoff estimates you record — nothing is inferred from prose or invented.'),
      h('ul', { class: 'plain-list' },
        h('li', null, h('strong', null, 'Cooperative game theory — '), 'exact Banzhaf & Shapley-Shubik power indices, minimum winning coalitions (Riker), Tsebelis veto players, dummy players and dictator detection over a weighted voting game.'),
        h('li', null, h('strong', null, 'Non-cooperative game theory — '), 'pure & mixed Nash equilibria for the 2×2 leader-vs-counterparty game, dominant strategies, Pareto frontier, social welfare and price of anarchy / coordination loss.'),
        h('li', null, h('strong', null, 'Mechanism design — '), 'the minimal transfer that makes your target outcome (Nash-)incentive-compatible, with a feasibility bound, plus an equilibrium robustness margin that confidence-scores the recommendation.'),
      ),
      h('p', { class: 'muted tiny' }, `Engine ${POWER_ENGINE_VERSION}. Deterministic and local: no language model, no network call, no confidential conflict or anonymous pulse data is ever read.`),
    ),
  });

  const rules = card({
    title: 'Cross-module automation (RULE-PWR-01..06)',
    subtitle: 'One registered situation fans out across the workspace atomically',
    body: h('div', { class: 'stack-sm' },
      ...POWER_RULES.map((rule) => h('div', { class: 'power-rule' },
        h('div', { class: 'row-between' },
          h('strong', { class: 'small' }, `${rule.id} · ${rule.name}`),
          h('span', { class: 'muted tiny' }, rule.targetModule)),
        h('p', { class: 'muted tiny' }, rule.description),
        h('p', { class: 'muted tiny' }, h('em', null, rule.framework)),
      )),
      h('p', { class: 'muted tiny' }, `Automatic propagation is ${ctx.state.settings?.powerAutoPropagate === false ? 'PAUSED — use Reanalyze on a situation to run it explicitly' : 'ON — rules run inside the store transaction'}. Toggle in Settings.`),
    ),
  });

  return h('div', { class: 'stack' }, stats, queue, frameworks, rules);
}

function coalitionsTab(ctx, report, row) {
  if (!row) return emptyState({ title: 'No situation modeled', body: 'Add a coalition situation to see its voting-power analysis.' });
  const { game } = row;
  const a = analyze(game, ctx);
  const v = a.voting;
  const stats = h('div', { class: 'stat-grid' },
    stat({ label: 'Quota', value: `${v.quota} / ${v.total}`, hint: `${v.quotaPct}% of weighted votes`, tone: '' }),
    stat({ label: 'Coalition of allies/neutrals', value: v.coalitionFeasible ? 'feasible' : 'BLOCKED', hint: `${v.nonOpposedWeight} / ${v.quota} votes held`, tone: v.coalitionFeasible ? 'good' : 'bad' }),
    stat({ label: 'Min. winning coalitions', value: String(v.minimumWinningCoalitions.length), hint: `${v.minimumWinningCoalitions.filter((c) => !c.hasOpposed).length} without opposition`, tone: '' }),
    stat({ label: 'Power concentration (HHI)', value: num(v.powerHhi, 3), hint: 'Σ Banzhaf² — 1.0 = one dictator', tone: v.powerHhi > 0.4 ? 'warn' : '' }),
  );
  const feasibility = v.coalitionFeasible
    ? banner({ tone: 'good', title: 'A winning coalition exists without the opposition', body: v.cheapestFeasible ? `Cheapest: ${v.cheapestFeasible.names.join(' + ')} (${v.cheapestFeasible.weight} votes). Sequence these conversations first.` : '' })
    : banner({ tone: 'bad', title: 'No winning coalition can be formed from allies and neutrals', body: v.opposedVetoPlayers.length ? `An opposed veto player blocks every coalition — RULE-PWR-02 opens a DACI decision to choose persuasion, redesign, an alternative coalition or an explicit delay.` : `You must move at least one opposed stakeholder, redesign the proposal, or change the quota. RULE-PWR-02 opens a DACI decision automatically.` });

  const powerTable = table({
    caption: 'Voting power by stakeholder — exact Banzhaf and Shapley-Shubik indices',
    columns: [
      { label: 'Stakeholder', render: (p) => h('span', null, p.name, p.veto ? h('span', { class: 'muted tiny' }, ' · veto') : p.dictator ? h('span', { class: 'muted tiny' }, ' · dictator') : '') },
      { label: 'Weight', className: 'num', render: (p) => String(p.weight) },
      { label: 'Stance', render: (p) => badge(POWER_STANCE_LABELS[p.stance].split(' ')[0], p.stance === 'opposed' ? 'bad' : p.stance === 'ally' ? 'good' : 'neutral') },
      { label: 'Banzhaf', className: 'num', render: (p) => pct(p.banzhaf) },
      { label: 'Shapley-Shubik', className: 'num', render: (p) => pct(p.shapleyShubik) },
      { label: 'Swings', className: 'num', render: (p) => String(p.swings) },
      { label: 'Role', render: (p) => p.veto ? badge('veto', 'warn') : p.dummy ? badge('dummy', 'neutral') : p.dictator ? badge('dictator', 'bad') : badge('pivotal', 'good') },
    ],
    rows: v.players,
  });

  const mwc = card({
    title: 'Minimum winning coalitions',
    subtitle: 'Riker: the smallest coalitions that reach quota, where every member is critical',
    body: v.minimumWinningCoalitions.length
      ? h('ol', { class: 'plain-list' }, ...v.minimumWinningCoalitions.slice(0, 12).map((c) =>
          h('li', { class: 'row-between' },
            h('span', null, c.names.join(' + '), h('span', { class: 'muted tiny' }, ` · ${c.weight} votes (excess ${c.excess})`)),
            c.hasOpposed ? badge('needs opposition', 'warn') : badge('opposition-free', 'good'))))
      : h('p', { class: 'muted small' }, 'No coalition reaches this quota.'),
  });

  return h('div', { class: 'stack' }, gamePicker(ctx, report, row, 'coalitions'), stats, feasibility,
    card({ title: 'Voting power distribution', subtitle: `${v.players.length} stakeholders · ${v.total} weighted votes`, body: powerChart(a) }),
    card({ title: 'Power index table', body: powerTable }), mwc);
}

function gameTab(ctx, report, row) {
  if (!row) return emptyState({ title: 'No situation modeled', body: 'Add a coalition situation to see its 2×2 strategic game.' });
  const { game } = row;
  const a = analyze(game, ctx);
  const sol = a.game2x2;
  const stats = h('div', { class: 'stat-grid' },
    stat({ label: 'Pure Nash equilibria', value: sol.hasPureNE ? sol.pureNE.join(', ') : 'none', hint: sol.hasPureNE ? 'stable outcomes' : 'mixed-strategy game', tone: sol.hasPureNE ? 'good' : 'caution' }),
    stat({ label: 'Dominant strategy', value: sol.dominant.leader !== null ? `leader → row ${sol.dominant.leader}` : sol.dominant.rival !== null ? `rival → col ${sol.dominant.rival}` : 'none', tone: '' }),
    stat({ label: 'Mixed equilibrium', value: sol.mixed ? `p=${num(sol.mixed.pLeaderRow0)} / q=${num(sol.mixed.qRivalCol0)}` : '—', hint: 'leader row-0 / rival col-0 mix', tone: '' }),
    stat({ label: 'Coordination loss', value: num(sol.coordinationLoss), hint: `price of anarchy ${num(sol.priceOfAnarchy)}`, tone: sol.hasConflict ? 'warn' : '' }),
  );

  const matrix = table({
    caption: '2×2 normal-form payoff matrix (leader payoff, counterparty payoff)',
    columns: [
      { label: 'Leader ↓ / Rival →', render: (r) => h('strong', null, r.label) },
      { label: (game.strategies?.rival || POWER_STRATEGY_AXES.rival)[0], render: (r) => h('div', { class: `power-cell ${r.c0.ne ? 'is-ne' : ''} ${r.c0.target ? 'is-target' : ''}` },
        h('span', { class: 'power-cell-pay' }, `you ${num(r.c0.l)} · them ${num(r.c0.rp)}`),
        h('span', { class: 'muted tiny' }, `${r.c0.ne ? 'Nash · ' : ''}${r.c0.target ? 'your target' : ''}`)) },
      { label: (game.strategies?.rival || POWER_STRATEGY_AXES.rival)[1], render: (r) => h('div', { class: `power-cell ${r.c1.ne ? 'is-ne' : ''} ${r.c1.target ? 'is-target' : ''}` },
        h('span', { class: 'power-cell-pay' }, `you ${num(r.c1.l)} · them ${num(r.c1.rp)}`),
        h('span', { class: 'muted tiny' }, `${r.c1.ne ? 'Nash · ' : ''}${r.c1.target ? 'your target' : ''}`)) },
    ],
    rows: [0, 1].map((r) => {
      const mk = (c) => {
        const [l, rp] = sol.cells[r][c];
        const cell = `${r}${c}`;
        return { l, rp, ne: sol.pureNE.includes(cell), target: cell === a.targetCell };
      };
      return { label: (game.strategies?.leader || POWER_STRATEGY_AXES.leader)[r], c0: mk(0), c1: mk(1) };
    }),
  });

  const notes = card({
    title: 'What the equilibrium means',
    body: h('div', { class: 'stack-sm' },
      h('p', { class: 'small' }, sol.hasPureNE
        ? `There are ${sol.pureNE.length} pure Nash equilibrium outcome(s): at ${sol.pureNE.join(', ')}, no player can improve their payoff by unilaterally changing strategy. ${a.targetIsNE ? 'Your target is one of them — protect it with a credible commitment.' : 'Your target is NOT a Nash equilibrium — see Incentive design to make it self-enforcing.'}`
        : `No pure Nash equilibrium exists. ${sol.mixed ? `The unique mixed equilibrium has you play your first strategy ${pct(sol.mixed.pLeaderRow0)} of the time and the counterparty play their first ${pct(sol.mixed.qRivalCol0)} of the time. ` : ''}This is a coordination problem: settle on a focal commitment, a public signal, or a sequencing device rather than guessing.`),
      h('p', { class: 'small' }, `Pareto-efficient cells: ${sol.efficientCells.join(', ') || '—'}. ${sol.coordinationLoss !== null ? `The best equilibrium leaves ${num(sol.coordinationLoss)} utility units of social welfare on the table versus the efficient outcome (coordination loss).` : ''}`),
      h('p', { class: 'muted tiny' }, 'Payoffs are your own estimates on an arbitrary utility scale (−100…100), not measured money or welfare. Price of anarchy / coordination loss are only meaningful when all payoffs are positive-value maximization — treat them as directional, not financial.'),
    ),
  });

  return h('div', { class: 'stack' }, gamePicker(ctx, report, row, 'game'), stats,
    card({ title: 'Strategic game', subtitle: 'Leader (rows) vs the pivotal counterparty (columns)', body: matrix }),
    card({ title: 'Payoff space', subtitle: 'Each outcome plotted by (leader, rival) payoff', body: payoffChart(a, game) }), notes);
}

function incentivesTab(ctx, report, row) {
  if (!row) return emptyState({ title: 'No situation modeled', body: 'Add a coalition situation to design incentives.' });
  const { game } = row;
  const a = analyze(game, ctx);
  const al = a.alignment;
  const targetPicker = h('div', { class: 'field field-inline' },
    h('label', { for: 'power-target', class: 'field-label' }, 'Target outcome'),
    h('select', {
      id: 'power-target', class: 'input',
      'aria-label': 'Choose the outcome you want to make incentive-compatible',
      onChange: (e) => { const res = ctx.api.setPowerTarget(game.id, e.target.value); if (res && res.ok) toast('Target updated', 'good'); },
    }, ...POWER_CELLS.map((c) => h('option', { value: c, selected: c === a.targetCell }, `${c} — ${cellLabel(game, c)}`))),
  );
  const stats = h('div', { class: 'stat-grid' },
    stat({ label: 'Target', value: a.targetCell, hint: cellLabel(game, a.targetCell), tone: '' }),
    stat({ label: 'Already a Nash equilibrium?', value: a.targetIsNE ? 'yes' : 'no', tone: a.targetIsNE ? 'good' : 'warn' }),
    stat({ label: 'Alignment cost', value: num(al.alignmentCost), hint: 'minimal transfer to the counterparty', tone: al.alignmentCost > 0 ? 'caution' : 'good' }),
    stat({ label: 'Implementable by transfer?', value: al.feasible ? 'yes' : 'no', hint: `leader headroom ${num(al.leaderHeadroom)}`, tone: al.feasible ? 'good' : 'bad' }),
  );
  const rec = al.alreadyEquilibrium
    ? banner({ tone: 'good', title: 'Incentive-compatible as modeled', body: al.recommendation })
    : al.feasible
      ? banner({ tone: 'caution', title: `A verifiable concession of ≈ ${num(al.alignmentCost)} units realigns incentives`, body: al.recommendation })
      : banner({ tone: 'bad', title: 'A simple transfer cannot implement this target', body: al.recommendation });

  const deviations = al.deviations.length
    ? table({
        caption: 'Incentive-compatibility deviations that must be neutralized',
        columns: [
          { label: 'Who', render: (d) => d.who === 'leader' ? 'You' : 'Counterparty' },
          { label: 'Would deviate to', render: (d) => d.to },
          { label: 'Gain from deviating', className: 'num', render: (d) => num(d.gain) },
          { label: 'Fix', render: (d) => d.fix },
        ],
        rows: al.deviations,
      })
    : h('p', { class: 'muted small' }, 'No profitable unilateral deviation from the target — it is already self-enforcing.');

  const confidence = card({
    title: 'Confidence-scored recommendation',
    subtitle: 'Flat advice is dishonest when the inputs are estimates',
    body: h('div', { class: 'stack-sm' },
      h('div', { class: 'row-gap wrap' },
        badge(`declared estimate: ${a.estimateConfidence}`, a.estimateConfidence === 'high' ? 'good' : 'caution'),
        badge(`robustness: ${a.robustness.band} (${num(a.robustness.relativeRobustness)})`, a.robustness.band === 'high' ? 'good' : a.robustness.band === 'medium' ? 'caution' : 'warn'),
        badge(`combined: ${a.confidenceBand}`, a.confidenceBand === 'high' ? 'good' : a.confidenceBand === 'medium' ? 'caution' : 'warn')),
      h('p', { class: 'small' }, `The combined confidence is the weaker of your declared estimate quality and the equilibrium's structural robustness — the smallest absolute gap to a best-response boundary is ${num(a.robustness.minAbsSlack)} on a payoff scale of ${num(a.robustness.payoffScale, 0)}${a.robustness.weakNE ? ' (a weak equilibrium sits exactly on the boundary)' : ''}. A low margin means a small estimate error could flip the recommended move.`),
      h('p', { class: 'muted tiny' }, 'This is a heuristic management convention, not a statistical confidence interval. Verify low-confidence payoffs in a 1:1 (RULE-PWR-04 queues the prompt) before you commit political capital.'),
    ),
  });

  return h('div', { class: 'stack' }, gamePicker(ctx, report, row, 'incentives'), targetPicker, stats, rec,
    card({ title: 'Incentive-compatibility audit', subtitle: 'Mechanism design: making the target (Nash-)incentive-compatible', body: h('div', { class: 'stack-sm' },
      h('div', { class: 'power-kv-grid' },
        kv('Rival payoff at target', num(al.rivalTargetPayoff)),
        kv('Rival payoff if it deviates', num(al.rivalDeviationPayoff)),
        kv('Your payoff at target', num(al.leaderTargetPayoff)),
        kv('Your payoff if you deviate', num(al.leaderDeviationPayoff)),
        kv('Rival deviation gap', num(al.rivalDeficit)),
        kv('Your headroom to pay', num(al.leaderHeadroom)),
        kv('Your net payoff after transfer', num(al.netLeaderPayoff)),
        kv('Alignment cost', num(al.alignmentCost))),
      deviations) }),
    confidence);
}

function scriptTab(ctx, report, row) {
  if (!row) return emptyState({ title: 'No situation modeled', body: 'Add a coalition situation to generate a tailored influence script.' });
  const { game } = row;
  const a = analyze(game, ctx);
  const script = buildInfluenceScript(a, game);
  const brief = buildPowerBrief(a, game);

  const honesty = banner({ tone: 'info', title: 'Deterministic — not a language model', body: 'This script is generated by fixed templates from your recorded players, weights, stances and the exact computed numbers. It invents no facts. It is a rehearsal aid, not a substitute for your judgment — and it never draws on confidential conflict records or anonymous pulse responses.' });

  const opening = card({
    title: 'Framing (DESC — Situation first)',
    body: h('ol', { class: 'plain-list' }, ...script.opening.map((line) => h('li', { class: 'small' }, line))),
  });
  const points = card({
    title: 'Per-stakeholder talking points (SBI)',
    subtitle: 'Ordered by the conversation that matters, not by org chart',
    body: h('div', { class: 'stack-sm' }, ...script.talkingPoints.map((tp) =>
      h('div', { class: 'power-talk' },
        h('div', { class: 'row-between' },
          h('strong', { class: 'small' }, tp.name),
          h('span', { class: 'row-gap' }, badge(`${tp.powerPct}% power`, tp.stance === 'opposed' ? 'bad' : tp.stance === 'ally' ? 'good' : 'neutral'), badge(tp.stance, 'neutral'))),
        h('p', { class: 'small' }, tp.point)))),
  });
  const askCard = card({
    title: 'The ask & the fallback',
    body: h('div', { class: 'stack-sm' },
      h('p', { class: 'small' }, h('strong', null, 'Ask: '), script.ask),
      h('p', { class: 'small' }, h('strong', null, 'Fallback: '), script.fallback),
      h('div', { class: 'stack-xs' }, h('strong', { class: 'small' }, 'Guardrails'), ...script.guardrails.map((g) => h('p', { class: 'muted tiny' }, '• ', g)))),
  });
  const board = card({
    title: 'Board-ready brief',
    subtitle: 'Deterministic, copyable, no free-text PII',
    actions: [h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => {
      const ok = downloadText({ filename: `leados-war-room-${game.id}.txt`, text: brief, mime: 'text/plain' });
      toast(ok ? 'Board brief saved' : 'Download unavailable — select and copy the text below', ok ? 'good' : 'neutral');
    } }, 'Download brief')],
    body: h('pre', { class: 'fi-brief', tabindex: '0', 'aria-label': 'Board-ready coalition and incentive brief' }, brief),
  });

  return h('div', { class: 'stack' }, gamePicker(ctx, report, row, 'script'), honesty, opening, points, askCard, board);
}

/* ----------------------------------------------------------------- dialogs */
function stressTab(ctx, report, row) {
  const game = row.game;
  const stress = analyze(game, ctx).stress;
  const body = stress ? h('div', { class: 'stack-sm' },
    banner({ tone: stress.needsReview ? 'warn' : 'good', title: stress.needsReview ? 'Your plan needs a robustness review' : 'Within the supplied bounds', body: 'These are worst-case guarantees conditional on your model, not predicted outcomes. Utility units are not money. Every payoff varies independently; correlated or unmodelled risks are outside this test.' }),
    h('div', { class: 'stat-grid' },
      stat({ label: 'Uncertainty bound', value: `±${num(stress.radius)}`, hint: 'Utility units per payoff' }),
      stat({ label: 'Target Nash guarantee', value: stress.targetGuaranteed ? 'Yes' : 'No', hint: 'Across the full continuous box' }),
      stat({ label: 'Fixed transfer interval', value: stress.transferFeasible ? `${num(stress.minimumTransfer)}–${num(stress.maximumTransfer)}` : 'Infeasible', hint: 'Conditional payment, leader → counterparty' }),
      stat({ label: 'Transfer break point', value: num(stress.transferRadius), hint: 'Largest ± bound allowing a fixed transfer; — means infeasible even at zero' })),
    h('h3', null, 'Savage minimax regret vs Wald maximin'),
    h('p', { class: 'small' }, 'Regret compares your choice with the best row after observing the same counterparty response. Security maximises your worst payoff. Pure strategies only; no probability distribution, mixed-policy optimisation, or prediction of their response.'),
    table({ caption: 'Robust strategy criteria', columns: [
      { label: 'Your strategy', render: s => (game.strategies?.leader || POWER_STRATEGY_AXES.leader)[s.row] },
      { label: 'Worst regret ↓', render: s => num(s.worstRegret) },
      { label: 'Security payoff ↑', render: s => num(s.worstPayoff) },
      { label: 'Criteria', render: s => [stress.minimaxRows.includes(s.row) ? 'Minimax regret' : '', stress.maximinRows.includes(s.row) ? 'Maximin' : ''].filter(Boolean).join(' · ') || '—' },
    ], rows: stress.strategies }),
    h('h3', null, 'One stakeholder changes to opposition'),
    h('p', { class: 'small' }, 'Quota and electorate stay fixed. Neutral stakeholders count as potentially persuadable, not committed support. This is a stress test, not an attrition forecast.'),
    table({ caption: 'Single stakeholder opposition stress tests', columns: [
      { label: 'Stakeholder', render: s => s.name },
      { label: 'Remaining non-opposed weight', render: s => num(s.remainingWeight) },
      { label: 'Quota reachable?', render: s => s.blocks ? 'No — verify commitment' : 'Yes' },
    ], rows: stress.oppositionShocks }),
    h('details', null, h('summary', null, 'Exact mathematics & board brief'),
      h('p', { class: 'small' }, 'With leader target slack L, rival target slack R, and uncertainty d: a fixed transfer t must satisfy max(0, −R + 2d) ≤ t ≤ L − 2d. The target without transfer is guaranteed Nash iff min(L,R) ≥ 2d. Equality gives weak Nash, not unique implementation. Independent payoff bounds are not clipped to the input scale.'),
      h('pre', { class: 'fi-brief', tabindex: '0' }, powerStressBrief(stress))))
    : h('p', { class: 'small' }, 'No uncertainty bound recorded. Edit the situation and supply a defensible ± payoff bound. Blank disables the test; zero explicitly tests only your point estimates. LeadOS will not invent uncertainty from a confidence label.');
  return h('div', { class: 'stack' }, gamePicker(ctx, report, row, 'stress'), card({
    title: 'Robust strategy lab', subtitle: 'Decision Making under Deep Uncertainty • exact box bounds • no simulation sampling',
    actions: [h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => openPowerGameDialog(ctx, game) }, 'Edit uncertainty bound')], body,
  }));
}

function defaultGame() {
  return {
    title: '', context: '', status: 'modeling', quotaPct: 50, targetCell: '00', estimateConfidence: 'medium',
    strategies: { leader: ['Propose', 'Defer'], rival: ['Support', 'Block'] },
    cells: { '00': [5, 5], '01': [0, 6], '10': [6, 0], '11': [1, 1] },
    players: [
      { id: 'pl1', name: '', weight: 4, stance: 'ally' },
      { id: 'pl2', name: '', weight: 3, stance: 'neutral' },
      { id: 'pl3', name: '', weight: 3, stance: 'opposed' },
    ],
    counterpartyId: 'pl3', linkedStakeholderIds: [], linkedGoalIds: [], ownerId: null,
    linkedCaseId: null, linkedDecisionId: null, linkedNegotiationId: null, notes: '',
  };
}
function cellValue(g, cell, which) {
  if (Array.isArray(g.cells)) {
    const c = g.cells[Number(cell[0])] && g.cells[Number(cell[0])][Number(cell[1])];
    return c ? c[which] : 0;
  }
  const c = g.cells && g.cells[cell];
  if (Array.isArray(c)) return c[which];
  return c ? (which === 0 ? c.leader : c.rival) : 0;
}
function option(value, label, selected) { return h('option', { value, selected }, label); }

function openPowerGameDialog(ctx, existing = null) {
  const s = ctx.state;
  const g = existing ? JSON.parse(JSON.stringify(existing)) : defaultGame();
  const people = s.people.filter((p) => p.status !== 'archived');
  const stakeholders = s.stakeholders || [];
  const cases = s.cases || [];
  const decisions = s.decisions || [];
  const negotiations = s.negotiations || [];
  const goals = s.goals || [];

  const form = h('form', { class: 'form power-form', novalidate: true, onSubmit: (e) => { e.preventDefault(); save(); } });

  const field = (label, control, help = null) => h('div', { class: 'field' },
    h('label', { class: 'field-label' }, label), control, help ? h('p', { class: 'field-help' }, help) : null);

  form.appendChild(field('Situation title', h('input', { class: 'input', name: 'title', value: g.title || '', maxlength: 180, 'aria-label': 'Situation title' })));
  form.appendChild(field('Context (optional)', h('textarea', { class: 'input', name: 'context', rows: 2, 'aria-label': 'Context' }, g.context || '')));
  form.appendChild(h('div', { class: 'form-row' },
    field('Voting quota (%)', h('input', { class: 'input', name: 'quotaPct', type: 'number', min: 1, max: 100, value: g.quotaPct || 50, 'aria-label': 'Voting quota percent' })),
    field('Estimate confidence', h('select', { class: 'input', name: 'estimateConfidence', 'aria-label': 'Estimate confidence' },
      ...POWER_CONFIDENCE.map((c) => option(c, POWER_CONFIDENCE_LABELS[c], c === g.estimateConfidence))), 'How well-evidenced are the payoffs & weights?'),
    field('Status', h('select', { class: 'input', name: 'status', 'aria-label': 'Status' },
      ...POWER_STATUSES.map((c) => option(c, POWER_STATUS_LABELS[c], c === g.status))))));

  // Players editor
  const playersWrap = h('div', { class: 'stack-xs' });
  function addPlayerRow(p) {
    const row = h('div', { class: 'power-player-row form-row' },
      h('input', { class: 'input', name: 'p_name', placeholder: 'Name', value: p.name || '', maxlength: 80, 'aria-label': 'Stakeholder name' }),
      h('input', { class: 'input', name: 'p_id', type: 'hidden', value: p.id || '' }),
      h('input', { class: 'input power-w', name: 'p_weight', type: 'number', min: 1, max: 100, value: p.weight || 1, 'aria-label': 'Voting weight' }),
      h('select', { class: 'input', name: 'p_stance', 'aria-label': 'Stance' }, ...POWER_STANCES.map((st) => option(st, POWER_STANCE_LABELS[st], st === (p.stance || 'neutral')))),
      h('select', { class: 'input', name: 'p_stakeholder', 'aria-label': 'Link to stakeholder register (optional)' },
        option('', '— no register link —', false), ...stakeholders.map((st) => option(st.id, st.name, st.id === p.stakeholderId))),
      h('button', { type: 'button', class: 'btn btn-ghost btn-small', 'aria-label': 'Remove this stakeholder', onClick: () => row.remove() }, '✕'),
    );
    playersWrap.appendChild(row);
  }
  (g.players || []).forEach(addPlayerRow);
  const addBtn = h('button', { type: 'button', class: 'btn btn-small btn-ghost', onClick: () => {
    if (playersWrap.querySelectorAll('.power-player-row').length >= POWER_MAX_PLAYERS) { toast(`At most ${POWER_MAX_PLAYERS} stakeholders`, 'neutral'); return; }
    addPlayerRow({ id: `pl${playersWrap.querySelectorAll('.power-player-row').length + 1}`, name: '', weight: 1, stance: 'neutral' });
  } }, '+ Add stakeholder');
  form.appendChild(h('div', { class: 'field field-wide' },
    h('span', { class: 'field-label' }, `Stakeholders & voting weight (${POWER_MIN_PLAYERS}–${POWER_MAX_PLAYERS})`),
    playersWrap, addBtn,
    h('p', { class: 'field-help' }, 'Weight = voting power in the coalition (1–100). Stance is situation-specific and editable; linking to the register is optional and never overwrites your choice.')));

  // Strategy labels
  form.appendChild(h('div', { class: 'field field-wide' },
    h('span', { class: 'field-label' }, 'Strategy labels'),
    h('div', { class: 'form-row' },
      h('input', { class: 'input', name: 'l0', value: (g.strategies?.leader || [])[0] || 'Strategy A', 'aria-label': 'Leader strategy A' }),
      h('input', { class: 'input', name: 'l1', value: (g.strategies?.leader || [])[1] || 'Strategy B', 'aria-label': 'Leader strategy B' }),
      h('input', { class: 'input', name: 'r0', value: (g.strategies?.rival || [])[0] || 'Response A', 'aria-label': 'Rival response A' }),
      h('input', { class: 'input', name: 'r1', value: (g.strategies?.rival || [])[1] || 'Response B', 'aria-label': 'Rival response B' })),
    h('p', { class: 'field-help' }, 'First two are your strategies (rows); last two are the pivotal counterparty’s responses (columns).')));

  // Payoff grid
  const payoffGrid = h('div', { class: 'power-payoff-edit' }, ...POWER_CELLS.map((cell) =>
    h('div', { class: 'power-payoff-edit-cell' },
      h('span', { class: 'muted tiny' }, `Cell ${cell}`),
      h('label', { class: 'tiny' }, 'you', h('input', { class: 'input', name: `pay_${cell}_l`, type: 'number', min: -100, max: 100, value: cellValue(g, cell, 0), 'aria-label': `Your payoff for cell ${cell}` })),
      h('label', { class: 'tiny' }, 'them', h('input', { class: 'input', name: `pay_${cell}_r`, type: 'number', min: -100, max: 100, value: cellValue(g, cell, 1), 'aria-label': `Counterparty payoff for cell ${cell}` })))));
  form.appendChild(h('div', { class: 'field field-wide' },
    h('span', { class: 'field-label' }, '2×2 payoffs (your estimate, −100…100 utility units each)'),
    payoffGrid,
    h('p', { class: 'field-help' }, 'Cell “rc”: r = your strategy (0 or 1), c = their response (0 or 1). These are relative preferences on a common scale — not money.'),
    field('Target outcome', h('select', { class: 'input', name: 'targetCell', 'aria-label': 'Target outcome cell' },
      ...POWER_CELLS.map((c) => option(c, `${c} — ${cellLabel({ strategies: g.strategies }, c)}`, c === g.targetCell))))));

  // Links
  form.appendChild(h('div', { class: 'form-row' },
    field('Coalition owner', h('select', { class: 'input', name: 'ownerId', 'aria-label': 'Coalition owner' },
      option('', '— none —', false), ...people.map((p) => option(p.id, p.name, p.id === g.ownerId)))),
    field('Linked case', h('select', { class: 'input', name: 'linkedCaseId', 'aria-label': 'Linked operational case' },
      option('', '— none —', false), ...cases.map((c) => option(c.id, c.title, c.id === g.linkedCaseId)))),
    field('Linked decision', h('select', { class: 'input', name: 'linkedDecisionId', 'aria-label': 'Linked decision' },
      option('', '— none —', false), ...decisions.map((d) => option(d.id, d.title, d.id === g.linkedDecisionId)))),
    field('Linked negotiation', h('select', { class: 'input', name: 'linkedNegotiationId', 'aria-label': 'Linked negotiation' },
      option('', '— none —', false), ...negotiations.map((n) => option(n.id, n.title, n.id === g.linkedNegotiationId))))));
  const stkSel = h('select', { class: 'input', name: 'linkedStakeholderIds', multiple: true, size: 4, 'aria-label': 'Linked stakeholders (hold Ctrl/Cmd to select several)' },
    ...stakeholders.map((st) => option(st.id, st.name, (g.linkedStakeholderIds || []).includes(st.id))));
  const goalSel = h('select', { class: 'input', name: 'linkedGoalIds', multiple: true, size: 4, 'aria-label': 'Linked goals (hold Ctrl/Cmd to select several)' },
    ...goals.map((gl) => option(gl.id, gl.title, (g.linkedGoalIds || []).includes(gl.id))));
  form.appendChild(h('div', { class: 'form-row' }, field('Linked stakeholders', stkSel), field('Linked goals', goalSel)));
  form.appendChild(field('Payoff uncertainty ± (utility units)', h('input', { class: 'input', type: 'number', min: '0', max: '100', step: 'any', name: 'stressRadius', value: g.stressRadius ?? '', 'aria-label': 'Payoff uncertainty bound' }), 'Optional: a defensible error bound for EACH payoff, not a probability. Blank disables robust testing. Saving a vulnerable model automatically opens one strategy decision and an owner 1:1 verification prompt.'));
  form.appendChild(field('Notes', h('textarea', { class: 'input', name: 'notes', rows: 2, 'aria-label': 'Notes' }, g.notes || '')));

  const errNode = h('p', { class: 'field-error', role: 'alert' }, '');
  form.appendChild(errNode);

  function selectedVals(sel) { return [...(sel.selectedOptions || [])].map((o) => o.value).filter(Boolean); }
  function val(name) { const el = form.querySelector(`[name="${name}"]`); return el ? el.value : ''; }
  function save() {
    const playerRows = [...playersWrap.querySelectorAll('.power-player-row')];
    const players = playerRows.map((row, i) => ({
      id: row.querySelector('[name=p_id]').value || `pl${i + 1}`,
      name: row.querySelector('[name=p_name]').value.trim(),
      weight: Number(row.querySelector('[name=p_weight]').value),
      stance: row.querySelector('[name=p_stance]').value,
      stakeholderId: row.querySelector('[name=p_stakeholder]').value || null,
    })).filter((p) => p.name);
    if (players.length < POWER_MIN_PLAYERS) { errNode.textContent = `Add at least ${POWER_MIN_PLAYERS} named stakeholders.`; return; }
    const cells = {};
    for (const cell of POWER_CELLS) {
      cells[cell] = [Number(val(`pay_${cell}_l`)) || 0, Number(val(`pay_${cell}_r`)) || 0];
    }
    const payload = {
      title: val('title').trim(),
      context: val('context'),
      quotaPct: Number(val('quotaPct')),
      estimateConfidence: val('estimateConfidence'),
      stressRadius: val('stressRadius') === '' ? null : Number(val('stressRadius')),
      status: val('status'),
      targetCell: val('targetCell'),
      strategies: { leader: [val('l0'), val('l1')], rival: [val('r0'), val('r1')] },
      players, cells,
      counterpartyId: players.some((p) => p.id === g.counterpartyId) ? g.counterpartyId : players[0].id,
      ownerId: val('ownerId') || null,
      linkedCaseId: val('linkedCaseId') || null,
      linkedDecisionId: val('linkedDecisionId') || null,
      linkedNegotiationId: val('linkedNegotiationId') || null,
      linkedStakeholderIds: selectedVals(stkSel),
      linkedGoalIds: selectedVals(goalSel),
      notes: val('notes'),
    };
    const res = existing ? ctx.api.updatePowerGame(existing.id, payload) : ctx.api.addPowerGame(payload);
    if (!res || !res.ok) { errNode.textContent = (res && res.error) || 'Could not save the situation.'; return; }
    closeAllModals();
    toast(existing ? 'Situation updated' : 'Situation modeled — cross-module analysis ran', 'good');
    if (!existing) ctx.navigate(`#/power/${res.id}`);
  }

  const cancel = h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => closeAllModals() }, 'Cancel');
  const submit = h('button', { type: 'button', class: 'btn btn-primary', onClick: () => save() }, existing ? 'Save changes' : 'Model situation');
  openModal({
    title: existing ? 'Edit coalition situation' : 'New coalition situation',
    description: 'Record who holds power, how they lean, and what each outcome is worth. The engine does the rest.',
    body: form, footer: [cancel, submit], size: 'lg',
  });
}

function openSettleDialog(ctx, game) {
  const body = h('form', { class: 'form', novalidate: true },
    h('div', { class: 'field' }, h('label', { class: 'field-label' }, 'Realised outcome'),
      h('select', { class: 'input', name: 'cell', 'aria-label': 'Realised outcome cell' },
        option('', '— outcome not recorded —', false), ...POWER_CELLS.map((c) => option(c, `${c} — ${cellLabel(game, c)}`, false)))),
    h('div', { class: 'field' }, h('label', { class: 'field-label' }, 'What actually happened (optional)'),
      h('textarea', { class: 'input', name: 'note', rows: 3, 'aria-label': 'Outcome note' }, '')));
  const save = h('button', { type: 'button', class: 'btn btn-primary', onClick: () => {
    const cell = body.querySelector('[name=cell]').value;
    const note = body.querySelector('[name=note]').value;
    const res = ctx.api.settlePowerGame(game.id, cell, note);
    if (!res || !res.ok) { toast((res && res.error) || 'Could not settle', 'bad'); return; }
    closeAllModals(); toast('Situation settled for calibration', 'good');
  } }, 'Record outcome');
  openModal({ title: `Settle “${game.title}”`, description: 'Capture the realised outcome for future calibration. The opening analysis stays frozen.', body, footer: [h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => closeAllModals() }, 'Cancel'), save] });
}

/* --------------------------------------------------------------- main view */
export function renderPower(ctx) {
  const report = buildPowerReport(ctx.state, ctx.now);
  const tab = TABS.some((t) => t.key === ctx.query.get('tab')) ? ctx.query.get('tab') : 'overview';
  const row = currentRow(report, ctx);

  const header = pageHeader({
    eyebrow: 'Coalition & incentive intelligence',
    title: 'War Room',
    subtitle: 'Exact voting-power indices × Nash equilibria × mechanism design — confidence-scored, propagated across every module.',
    meta: h('span', { class: 'muted tiny' }, `Engine ${POWER_ENGINE_VERSION} · Schema v30`),
    actions: [h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openPowerGameDialog(ctx, null) }, '+ New situation')],
  });

  const tabBar = tabs({
    items: TABS, active: tab, ariaLabel: 'War room sections',
    onSelect: (key) => {
      const gameParam = row ? `&game=${encodeURIComponent(row.game.id)}` : '';
      ctx.navigate(`#/power?tab=${key}${gameParam}`);
    },
  });

  let body;
  if (report.games.length === 0) {
    body = card({ body: emptyState({
      title: 'Model your first coalition situation',
      body: 'Name the stakeholders, give each a voting weight and stance, and estimate what each outcome is worth. LeadOS computes exact power indices, finds the Nash equilibria, prices the incentive alignment, and writes a tailored influence script — then fans the result out across decisions, delegations and 1:1s automatically.',
      action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openPowerGameDialog(ctx, null) }, '+ New situation'),
      icon: '♛',
    }) });
  } else if (tab === 'overview') body = overviewTab(ctx, report);
  else if (tab === 'coalitions') body = coalitionsTab(ctx, report, row);
  else if (tab === 'stress') body = stressTab(ctx, report, row);
  else if (tab === 'game') body = gameTab(ctx, report, row);
  else if (tab === 'incentives') body = incentivesTab(ctx, report, row);
  else body = scriptTab(ctx, report, row);

  return h('div', { class: 'page' }, header, tabBar, body);
}

/* ------------------------------------------------------------- detail view */
export function renderPowerDetail(ctx, id) {
  const game = (ctx.state.powerGames || []).find((g) => g.id === id);
  if (!game) return h('div', { class: 'page' }, pageHeader({ title: 'Situation not found' }),
    emptyState({ title: 'That coalition situation does not exist', action: h('a', { class: 'btn btn-primary', href: '#/power' }, 'Back to War Room') }));

  const a = analyze(game, ctx);
  const script = buildInfluenceScript(a, game);
  const brief = buildPowerBrief(a, game);
  const nameOf = (idv) => (ctx.state.people || []).find((p) => p.id === idv)?.name || null;
  const caseTitle = (ctx.state.cases || []).find((c) => c.id === game.linkedCaseId)?.title || game.linkedCaseId;
  const decisionTitle = (ctx.state.decisions || []).find((d) => d.id === game.linkedDecisionId)?.title || game.linkedDecisionId;

  const header = pageHeader({
    eyebrow: 'Coalition situation',
    title: game.title,
    subtitle: game.context || 'No context recorded.',
    meta: h('div', { class: 'row-gap wrap' }, verdictBadge(a), confBadge(a), badge(POWER_STATUS_LABELS[game.status] || game.status, 'neutral')),
    actions: [
      h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => openPowerGameDialog(ctx, game) }, 'Edit'),
      h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => { const r = ctx.api.reanalyzePowerGame(game.id); toast(r && r.ok ? 'Analysis re-run' : 'Could not re-run', r && r.ok ? 'good' : 'bad'); } }, 'Reanalyze'),
    ],
  });

  const tabLinks = h('div', { class: 'row-gap wrap' },
    ...TABS.filter((t) => t.key !== 'overview').map((t) =>
      h('a', { class: 'btn btn-small btn-ghost', href: `#/power?tab=${t.key}&game=${encodeURIComponent(game.id)}` }, t.label)));

  const stats = h('div', { class: 'stat-grid' },
    stat({ label: 'Quota', value: `${a.voting.quota}/${a.voting.total}`, hint: `${a.voting.quotaPct}% of votes`, tone: '' }),
    stat({ label: 'Coalition', value: a.voting.coalitionFeasible ? 'feasible' : 'blocked', tone: a.voting.coalitionFeasible ? 'good' : 'bad' }),
    stat({ label: 'Pure Nash', value: a.game2x2.hasPureNE ? a.game2x2.pureNE.join(', ') : 'mixed only', tone: '' }),
    stat({ label: 'Alignment cost', value: num(a.alignment.alignmentCost), hint: a.alignment.feasible ? 'implementable' : 'redesign needed', tone: a.alignment.alignmentCost > 0 ? 'caution' : 'good' }),
  );

  const verdictCard = card({
    title: 'Verdict & issues',
    body: h('div', { class: 'stack-sm' },
      h('div', { class: 'row-gap wrap' }, verdictBadge(a), confBadge(a)),
      h('p', { class: 'small' }, `Primary verdict: ${a.verdictMeta.label} (severity ${a.verdictMeta.severity}/5). ${a.issues.length ? `Detected issues: ${a.issues.join(', ')}.` : 'No structural issues detected.'}`),
      h('p', { class: 'muted tiny' }, `Equilibrium robustness ${num(a.robustness.relativeRobustness)} (${a.robustness.band}) · power HHI ${num(a.voting.powerHhi, 3)} · coordination loss ${num(a.game2x2.coordinationLoss)}. Derived telemetry: ${game.derived ? game.derived.verdict : 'not yet cached'} (refreshes automatically).`),
      tabLinks),
  });

  const coalitionCard = card({
    title: 'Voting power & coalitions',
    body: h('div', { class: 'stack-sm' }, powerChart(a),
      h('p', { class: 'small' }, a.voting.coalitionFeasible
        ? `A winning coalition of allies/neutrals exists${a.voting.cheapestFeasible ? `: ${a.voting.cheapestFeasible.names.join(' + ')}.` : '.'}`
        : `No winning coalition without the opposition (${a.voting.nonOpposedWeight}/${a.voting.quota} votes). ${a.voting.opposedVetoPlayers.length ? 'An opposed veto player blocks every coalition.' : ''}`)),
  });

  const incentiveCard = card({
    title: 'Incentive design & recommendation',
    body: h('div', { class: 'stack-sm' },
      h('p', { class: 'small' }, h('strong', null, `Target ${a.targetCell}: `), a.alignment.recommendation),
      h('p', { class: 'muted tiny' }, `Rival deviation gap ${num(a.alignment.rivalDeficit)} · your headroom ${num(a.alignment.leaderHeadroom)} · net payoff after transfer ${num(a.alignment.netLeaderPayoff)}. Combined confidence ${a.confidenceBand}.`)),
  });

  const scriptCard = card({
    title: 'Influence script (deterministic, not an LLM)',
    body: h('div', { class: 'stack-sm' },
      ...script.opening.map((line) => h('p', { class: 'small' }, line)),
      h('p', { class: 'small' }, h('strong', null, 'Ask: '), script.ask),
      h('div', { class: 'stack-xs' }, ...script.talkingPoints.map((tp) => h('p', { class: 'small' }, h('strong', null, `${tp.name} (${tp.powerPct}% power): `), tp.point))),
      h('p', { class: 'muted tiny' }, script.guardrails.join(' '))),
  });

  const linksCard = card({
    title: 'Cross-module links',
    subtitle: 'Created automatically by RULE-PWR-01..05 or explicitly by the leader',
    body: h('ul', { class: 'plain-list' },
      game.ownerId ? h('li', null, 'Coalition owner: ', h('a', { class: 'link', href: `#/people` }, nameOf(game.ownerId) || game.ownerId)) : null,
      game.linkedCaseId ? h('li', null, 'Operational case: ', h('a', { class: 'link', href: `#/cases/${game.linkedCaseId}` }, caseTitle)) : null,
      game.linkedDecisionId ? h('li', null, 'Decision: ', h('a', { class: 'link', href: `#/decisions` }, decisionTitle)) : null,
      h('li', { class: 'muted tiny' }, `${(ctx.state.links || []).filter((l) => (l.sourceType === 'power' && l.sourceId === game.id) || (l.targetType === 'power' && l.targetId === game.id)).length} typed graph edge(s). RULE-PWR-02 opens a DACI decision on a blocked coalition; RULE-PWR-03 opens a blameless alignment delegation; RULE-PWR-04 queues a 1:1 estimate check.`)),
  });

  const boardCard = card({
    title: 'Board-ready brief',
    actions: [h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => {
      const ok = downloadText({ filename: `leados-war-room-${game.id}.txt`, text: brief, mime: 'text/plain' });
      toast(ok ? 'Board brief saved' : 'Download unavailable — copy the text below', ok ? 'good' : 'neutral');
    } }, 'Download brief')],
    body: h('pre', { class: 'fi-brief', tabindex: '0', 'aria-label': 'Board-ready coalition and incentive brief' }, brief),
  });

  const historyCard = card({
    title: 'History',
    body: timeline((game.history || []).slice().reverse().map((x) => ({
      date: x.on ? formatDate(x.on) : '', title: x.action, body: x.note,
    }))),
  });

  const actionsCard = card({
    title: 'Lifecycle actions',
    body: h('div', { class: 'row-gap wrap' },
      h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => { const r = ctx.api.commitPowerGame(game.id); toast(r && r.ok ? 'Strategy committed' : 'Could not commit', r && r.ok ? 'good' : 'bad'); } }, 'Commit strategy'),
      h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => openSettleDialog(ctx, game) }, 'Record outcome'),
      h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => { const r = ctx.api.archivePowerGame(game.id); toast(r && r.ok ? 'Archived' : 'Could not archive', r && r.ok ? 'good' : 'bad'); } }, 'Archive'),
      h('button', { class: 'btn btn-small btn-danger', type: 'button', onClick: () => confirmDialog({
        title: 'Delete this situation?', message: `“${game.title}” and its typed links will be removed. Decisions, delegations and cases already created by propagation are kept.`,
        confirmLabel: 'Delete', danger: true,
        onConfirm: () => { const r = ctx.api.deletePowerGame(game.id); if (r && r.ok) { toast('Situation deleted', 'good'); ctx.navigate('#/power'); } },
      }) }, 'Delete')),
  });

  return h('div', { class: 'page' }, header, stats, verdictCard, coalitionCard, incentiveCard, scriptCard, linksCard, boardCard, actionsCard, historyCard);
}
