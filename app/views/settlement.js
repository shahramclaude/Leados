/**
 * app/views/settlement.js — Outcome Attribution & Loop Settlement Terminal
 * (`#/attribution`, Schema v75, ADR-0067).
 *
 * Six interconnected panels over coordinated operational loops (adopted Action
 * Bundles, adopted Response Plans, and multi-channel Case Control Loops):
 *  - Cockpit:  Goldratt Critical-Chain Fever Chart (SVG), Lipke Earned Schedule
 *              metrics, 2x2 Thesis-vs-Execution Matrix, and filterable loop table.
 *  - X-Ray:    Pressman & Wildavsky sequential clearance breakdown separating
 *              leader-owned gates from delegated execution and premise states.
 *  - Variance: Brinson & Fachler exact 3-way economic variance waterfall
 *              (Schedule + Rate/Spend + Interaction = Delta C) plus Savage
 *              ex-post policy regret across rehearsed Response Studio branches.
 *  - What-if:  Read-only attribution & variance simulator (zero storage writes).
 *  - Ledger:   Out-of-sample Brier calibration, Wilson 95% intervals, and
 *              append-only settlement receipts with typed graph links.
 *  - Method:   Explicit equations, guardrails, and refusal rules.
 */

import { h, toast, openModal, confirmDialog } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, table, emptyState } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { linksForEntity } from '../core/domain/cases.js';
import { rehearseLoopWhatIf, settlementReport } from '../core/domain/settlement.js';
import {
  SETTLEMENT_CHANNEL_LABELS,
  SETTLEMENT_FEVER_LABELS,
  SETTLEMENT_LOOP_LABELS,
  SETTLEMENT_REGIMES,
  SETTLEMENT_REGIME_META,
  SETTLEMENT_RULES,
} from '../core/domain/settlementRegistry.js';
import {
  openFreezeSettlementDialog,
  openRecordSettlementDialog,
} from '../ui/settlement-modals.js';

const PANELS = [
  { key: 'cockpit', label: 'Cockpit & fever chart' },
  { key: 'xray', label: 'Clearance X-ray' },
  { key: 'variance', label: 'Variance & regret' },
  { key: 'whatif', label: 'What-if rehearsal' },
  { key: 'ledger', label: 'Brier ledger' },
  { key: 'method', label: 'Method & guardrails' },
];

const ZONE_TONE = { green: 'good', watch: 'caution', red: 'bad', unscheduled: 'neutral' };
const OWNER_SIDE_LABEL = { leader: 'Leader gate', delegate: 'Delegate delivery', shared: 'Shared / epistemic' };

const uiState = {
  kindFilter: 'all',
  whatIfLoopKey: '',
  clearLeaderGates: false,
  clearDelegateGates: false,
  thesisState: '',
  actualDays: '',
  actualMitigation: '',
};

const pct = (v) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : `${v}%`);
const num = (v, dp = 2) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : Number(v).toFixed(dp));
const money = (v, cur) => (v === null || v === undefined || !cur ? '—' : `${cur} ${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const signedMoney = (v, cur) => {
  if (v === null || v === undefined || !cur) return '—';
  const sign = v > 0 ? '+' : '';
  return `${sign}${cur} ${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

function nav(ctx, panel, extra = {}) {
  const q = new URLSearchParams();
  q.set('panel', panel);
  const currentLoop = extra.loop !== undefined ? extra.loop : ctx.query.get('loop');
  if (currentLoop) q.set('loop', currentLoop);
  for (const [k, v] of Object.entries(extra)) {
    if (k === 'loop') continue;
    if (v !== null && v !== undefined && v !== '') q.set(k, String(v));
  }
  ctx.navigate(`#/attribution?${q.toString()}`);
}

function svgEl(tag, attrs = {}, ...children) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v !== null && v !== undefined) el.setAttribute(k, String(v));
  }
  for (const ch of children) {
    if (ch == null) continue;
    el.appendChild(typeof ch === 'string' ? document.createTextNode(ch) : ch);
  }
  return el;
}

/** Accessible Goldratt Critical-Chain Fever Chart plotting Window Burn % vs Clearance %. */
function renderFeverChartSvg(loops, focusedKey) {
  const scheduled = loops.filter((l) => l.schedule.scheduled && l.schedule.windowBurnPct !== null);
  const W = 540;
  const H = 240;
  const padL = 46;
  const padR = 20;
  const padT = 18;
  const padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  // X: Window burn % [0..120], Y: Clearance % [0..100] (top = 100%, bottom = 0%)
  const xOf = (burnPct) => padL + (Math.max(0, Math.min(120, burnPct)) / 120) * plotW;
  const yOf = (clearPct) => padT + (1 - Math.max(0, Math.min(100, clearPct)) / 100) * plotH;

  // Goldratt boundary lines across clearance P in [0, 100]:
  // Watch boundary: burn = 25 + 0.60 * P  (at P=0 -> 25%, at P=100 -> 85%)
  // Red boundary:   burn = 45 + 0.55 * P  (at P=0 -> 45%, at P=100 -> 100%)
  const greenPoly = `${xOf(0)},${yOf(0)} ${xOf(25)},${yOf(0)} ${xOf(85)},${yOf(100)} ${xOf(0)},${yOf(100)}`;
  const watchPoly = `${xOf(25)},${yOf(0)} ${xOf(45)},${yOf(0)} ${xOf(100)},${yOf(100)} ${xOf(85)},${yOf(100)}`;
  const redPoly = `${xOf(45)},${yOf(0)} ${xOf(120)},${yOf(0)} ${xOf(120)},${yOf(100)} ${xOf(100)},${yOf(100)}`;

  const dots = scheduled.map((loop) => {
    const cx = xOf(loop.schedule.windowBurnPct);
    const cy = yOf(loop.overallClearancePct);
    const isFocused = loop.loopKey === focusedKey;
    const fill = loop.fever.zone === 'red'
      ? '#d64545'
      : loop.fever.zone === 'watch'
        ? '#d99026'
        : '#2a9d6f';
    return svgEl(
      'g',
      null,
      svgEl('circle', {
        cx: cx.toFixed(1),
        cy: cy.toFixed(1),
        r: isFocused ? 7 : 5,
        fill,
        stroke: isFocused ? '#ffffff' : '#0f172a',
        'stroke-width': isFocused ? 2.2 : 1.2,
      }),
      svgEl('title', null, `${loop.title}: ${loop.schedule.windowBurnPct}% window burn, ${loop.overallClearancePct}% clearance (${loop.fever.label})`),
    );
  });

  return svgEl(
    'svg',
    {
      viewBox: `0 0 ${W} ${H}`,
      class: 'stl-fever-svg',
      role: 'img',
      'aria-label': `Critical-chain fever chart with ${scheduled.length} scheduled loop(s): Green buffer, Amber watch, and Red breach corridors.`,
    },
    svgEl('polygon', { points: greenPoly, fill: 'rgba(42, 157, 111, 0.14)' }),
    svgEl('polygon', { points: watchPoly, fill: 'rgba(217, 144, 38, 0.16)' }),
    svgEl('polygon', { points: redPoly, fill: 'rgba(214, 69, 69, 0.16)' }),
    svgEl('line', { x1: xOf(25), y1: yOf(0), x2: xOf(85), y2: yOf(100), stroke: '#d99026', 'stroke-dasharray': '4 3', 'stroke-width': 1.2 }),
    svgEl('line', { x1: xOf(45), y1: yOf(0), x2: xOf(100), y2: yOf(100), stroke: '#d64545', 'stroke-width': 1.5 }),
    svgEl('line', { x1: xOf(100), y1: padT, x2: xOf(100), y2: padT + plotH, stroke: 'rgba(148, 163, 184, 0.45)', 'stroke-dasharray': '2 2' }),
    svgEl('rect', { x: padL, y: padT, width: plotW, height: plotH, fill: 'none', stroke: 'rgba(148, 163, 184, 0.35)' }),
    svgEl('text', { x: padL + 8, y: padT + 16, fill: 'currentColor', 'font-size': '10' }, 'Green buffer'),
    svgEl('text', { x: xOf(58), y: yOf(45), fill: 'currentColor', 'font-size': '10' }, 'Watch'),
    svgEl('text', { x: xOf(88), y: yOf(22), fill: 'currentColor', 'font-size': '10' }, 'Red breach'),
    svgEl('text', { x: padL + plotW / 2, y: H - 6, 'text-anchor': 'middle', fill: 'currentColor', 'font-size': '11' }, 'Window elapsed (% of review horizon, capped at 120%)'),
    svgEl('text', { x: 14, y: padT + plotH / 2, 'text-anchor': 'middle', transform: `rotate(-90 14 ${padT + plotH / 2})`, fill: 'currentColor', 'font-size': '11' }, 'Clearance (%)'),
    svgEl('text', { x: padL, y: H - 18, fill: 'currentColor', 'font-size': '9' }, '0%'),
    svgEl('text', { x: xOf(100) - 10, y: H - 18, fill: 'currentColor', 'font-size': '9' }, '100%'),
    svgEl('text', { x: padL - 26, y: yOf(100) + 4, fill: 'currentColor', 'font-size': '9' }, '100%'),
    svgEl('text', { x: padL - 18, y: yOf(0), fill: 'currentColor', 'font-size': '9' }, '0%'),
    ...dots,
  );
}

function focusSelectorBar(ctx, report, panel) {
  if (!report.loops.length) return null;
  const focused = report.focused;
  return h(
    'div',
    { class: 'card stl-focus-bar' },
    h(
      'div',
      { class: 'card-body stl-focus-row' },
      h(
        'div',
        { class: 'field stl-focus-field' },
        h('label', { for: 'stl-loop-picker' }, 'Focused coordinated loop'),
        h(
          'select',
          {
            id: 'stl-loop-picker',
            onChange: (e) => nav(ctx, panel, { loop: e.target.value }),
          },
          ...report.loops.map((l) =>
            h(
              'option',
              { value: l.loopKey, selected: focused?.loopKey === l.loopKey },
              `[${l.loopKindLabel}] ${l.title} — ${l.overallClearancePct}% (${l.fever.zone})`,
            ),
          ),
        ),
      ),
      focused
        ? h(
            'div',
            { class: 'page-actions' },
            focused.settlementRecord?.status !== 'settled' && !focused.closedOutcome && focused.settlementRecord?.status !== 'frozen'
              ? h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => openFreezeSettlementDialog(ctx, focused) }, 'Freeze forecast')
              : null,
            focused.settlementRecord?.status !== 'settled'
              ? h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => openRecordSettlementDialog(ctx, focused) }, 'Settle loop')
              : badge('Settled', 'good'),
            h('a', { class: 'btn btn-small btn-ghost', href: focused.sourceRoute }, 'Open source →'),
          )
        : null,
    ),
  );
}

function cockpitPanel(ctx, report) {
  if (!report.loops.length) {
    return emptyState({
      title: 'No coordinated loops on record yet',
      body: 'Adopt an Action Bundle, adopt a Response Plan, or link decisions, delegations and assumptions to an Operational Case. This terminal will automatically track Earned Schedule, clearance bottlenecks and variance without duplicate entry.',
      action: h('a', { class: 'btn btn-primary', href: '#/bundles' }, 'Open Action bundles'),
    });
  }

  const filtered = uiState.kindFilter === 'all'
    ? report.loops
    : report.loops.filter((l) => l.loopKind === uiState.kindFilter);

  const matrixGrid = h(
    'div',
    { class: 'stl-regime-grid' },
    ...SETTLEMENT_REGIMES.map((key) => {
      const meta = SETTLEMENT_REGIME_META[key];
      const count = report.byRegime[key] || 0;
      return h(
        'div',
        { class: 'stl-regime-cell' },
        h('div', { class: 'stl-regime-head' }, badge(meta.label, meta.tone), h('strong', null, String(count))),
        h('p', { class: 'muted tiny' }, meta.summary),
      );
    }),
  );

  const filterBar = h(
    'div',
    { class: 'field stl-inline-filter' },
    h('label', { for: 'stl-kind-filter' }, 'Loop family'),
    h(
      'select',
      {
        id: 'stl-kind-filter',
        onChange: (e) => {
          uiState.kindFilter = e.target.value;
          ctx.refresh();
        },
      },
      h('option', { value: 'all', selected: uiState.kindFilter === 'all' }, `All coordinated loops (${report.counts.loops})`),
      h('option', { value: 'bundle', selected: uiState.kindFilter === 'bundle' }, `Action bundles (${report.counts.bundles})`),
      h('option', { value: 'response', selected: uiState.kindFilter === 'response' }, `Response plans (${report.counts.responses})`),
      h('option', { value: 'case-loop', selected: uiState.kindFilter === 'case-loop' }, `Case control loops (${report.counts.caseLoops})`),
    ),
  );

  return h(
    'div',
    { class: 'stack-md' },
    h(
      'div',
      { class: 'stl-two-col' },
      card({
        title: 'Critical-Chain Buffer Fever Chart (Goldratt 1997)',
        subtitle: 'Window elapsed % vs multi-channel clearance %. Loops crossing into Red burn their review window faster than gates clear.',
        body: renderFeverChartSvg(report.loops, report.focused?.loopKey),
      }),
      card({
        title: '2×2 Thesis × Execution Attribution Matrix',
        subtitle: 'Separates false governing assumptions from stalled execution — and refuses attribution when both fail together.',
        body: matrixGrid,
      }),
    ),
    card({
      title: 'Coordinated execution loops',
      subtitle: 'Lipke (2003) Earned Schedule SPI(t) = ES / AT stays honest at and past deadlines, unlike dollar/count SPI.',
      actions: [filterBar],
      body: table({
        caption: 'Coordinated loops with Earned Schedule and attribution regime',
        rows: filtered,
        columns: [
          {
            label: 'Loop',
            render: (l) => h(
              'div',
              null,
              h('a', { href: `#/attribution?panel=xray&loop=${encodeURIComponent(l.loopKey)}` }, l.title),
              h('div', { class: 'muted tiny' }, `${l.loopKindLabel} · opened ${l.openedOn}${l.reviewOn ? ` → review ${l.reviewOn}` : ''}`),
            ),
          },
          { label: 'Fever', render: (l) => badge(l.fever.zone, ZONE_TONE[l.fever.zone] || 'neutral') },
          {
            label: 'Lipke SPI(t) / SV(t)',
            render: (l) => l.schedule.scheduled
              ? `${num(l.schedule.spiT, 2)} · ${l.schedule.svDays > 0 ? '+' : ''}${num(l.schedule.svDays, 1)}d`
              : 'Unscheduled',
          },
          {
            label: 'Leader / Delegate',
            render: (l) => `${pct(l.leaderClearancePct)} / ${pct(l.delegateClearancePct)}`,
          },
          {
            label: 'Attribution regime',
            render: (l) => badge(l.attribution.meta.label, l.attribution.meta.tone),
          },
          {
            label: 'Next step',
            render: (l) => h(
              'div',
              { class: 'page-actions' },
              h('button', { class: 'btn btn-tiny btn-ghost', type: 'button', onClick: () => nav(ctx, 'xray', { loop: l.loopKey }) }, 'X-ray'),
              l.settlementRecord?.status === 'settled'
                ? badge('Settled', 'good')
                : h('button', { class: 'btn btn-tiny btn-primary', type: 'button', onClick: () => openRecordSettlementDialog(ctx, l) }, 'Settle'),
            ),
          },
        ],
      }),
    }),
  );
}

function xrayPanel(ctx, report) {
  const loop = report.focused;
  if (!loop) return cockpitPanel(ctx, report);

  const regimeBanner = banner({
    tone: loop.attribution.regime === 'thesis-falsified-clean-execution' ? 'good' : loop.attribution.meta.tone,
    title: loop.attribution.meta.label,
    body: `${loop.attribution.meta.summary} ${loop.attribution.meta.actionGuidance}`,
  });

  return h(
    'div',
    { class: 'stack-md' },
    focusSelectorBar(ctx, report, 'xray'),
    regimeBanner,
    h(
      'div',
      { class: 'stat-row' },
      stat({ label: 'Overall clearance', value: pct(loop.overallClearancePct), sub: `${loop.counts.cleared}/${loop.counts.total} gates cleared` }),
      stat({ label: 'Pressman–Wildavsky joint pass', value: pct(loop.jointClearancePct), sub: 'Sequential gate product' }),
      stat({ label: 'Leader-owned gates', value: pct(loop.leaderClearancePct), sub: `${loop.counts.leaderCleared}/${loop.counts.leader} cleared` }),
      stat({ label: 'Delegated gates', value: pct(loop.delegateClearancePct), sub: `${loop.counts.delegateCleared}/${loop.counts.delegate} cleared` }),
      stat({ label: 'Lipke Earned Schedule', value: loop.schedule.scheduled ? `${num(loop.schedule.earnedScheduleDays, 1)}d` : '—', sub: loop.schedule.scheduled ? `SPI(t) ${num(loop.schedule.spiT, 2)} · IEAC(t) ${loop.schedule.ieacDays ? `${loop.schedule.ieacDays}d` : 'withheld'}` : 'No reviewOn date' }),
    ),
    card({
      title: 'Clearance-point breakdown by gate',
      subtitle: 'Distinguishes leader governance latency (unchosen decisions, unsent briefs, unheld 1:1 support) from delegated work and epistemic signposts.',
      body: loop.items.length
        ? table({
            caption: 'Clearance gates for focused loop',
            rows: loop.items,
            columns: [
              { label: 'Channel', render: (i) => SETTLEMENT_CHANNEL_LABELS[i.kind] || i.kind },
              { label: 'Gate owner side', render: (i) => badge(OWNER_SIDE_LABEL[i.ownerSide] || i.ownerSide, i.ownerSide === 'leader' && !i.cleared ? 'caution' : 'neutral') },
              { label: 'Record', render: (i) => h('a', { href: i.route }, i.title) },
              { label: 'Status', render: (i) => i.statusLabel },
              { label: 'Score', render: (i) => `${Math.round(i.score * 100)}%` },
            ],
          })
        : h('p', { class: 'muted' }, 'No individual clearance items remain attached to this loop.'),
    }),
  );
}

function variancePanel(ctx, report) {
  const loop = report.focused;
  if (!loop) return cockpitPanel(ctx, report);
  const ev = loop.economicVariance;
  const pr = loop.policyRegret;

  const waterfallRows = ev?.status === 'settled'
    ? [
        { step: '1 · Planned baseline (M₀ + T₀·r₀)', formula: `${money(ev.plannedMitigation, ev.currency)} + ${ev.plannedDays}d × ${money(ev.plannedDailyCarry, ev.currency)}/d`, amount: money(ev.plannedCost, ev.currency) },
        { step: '2 · Schedule / duration drift effect', formula: `(T₁ − T₀)·r₀ = (${ev.actualDays} − ${ev.plannedDays}) × ${money(ev.plannedDailyCarry, ev.currency)}/d`, amount: signedMoney(ev.scheduleEffect, ev.currency) },
        { step: '3 · Rate & direct-spend revision effect', formula: `T₀·(r₁ − r₀) + (M₁ − M₀)`, amount: signedMoney(ev.rateEffect, ev.currency) },
        { step: '4 · Joint schedule × rate interaction', formula: `(T₁ − T₀)·(r₁ − r₀)`, amount: signedMoney(ev.interactionEffect, ev.currency) },
        { step: '5 · Realized total (M₁ + T₁·r₁)', formula: `Total variance ΔC = ${signedMoney(ev.varianceTotal, ev.currency)} · residual ${money(ev.residual, ev.currency)}`, amount: money(ev.realizedCost, ev.currency) },
      ]
    : [];

  return h(
    'div',
    { class: 'stack-md' },
    focusSelectorBar(ctx, report, 'variance'),
    card({
      title: 'Brinson–Fachler 3-Way Economic Variance Partition (1985)',
      subtitle: 'Exact additive decomposition of realized vs planned loop cost. Currencies are never converted, and committed encumbrance is never treated as actual spend.',
      body: ev?.status === 'settled'
        ? table({
            caption: 'Brinson-Fachler additive cost variance decomposition',
            rows: waterfallRows,
            columns: [
              { label: 'Component', render: (r) => h('strong', null, r.step) },
              { label: 'Algebraic basis', render: (r) => h('span', { class: 'muted small' }, r.formula) },
              { label: 'Amount', render: (r) => r.amount },
            ],
          })
        : banner({
            tone: ev?.status === 'mixed-currency-refused' ? 'bad' : 'info',
            title: `Variance ${ev?.status || 'unavailable'}`,
            body: ev?.reason || 'Record dated actual spend on the linked budget line or case actuals to unlock exact Brinson–Fachler variance.',
          }),
    }),
    pr
      ? card({
          title: 'Savage Ex-Post Policy Regret (Response Studio Rehearsal vs Realized Window)',
          subtitle: pr.caveat,
          body: h(
            'div',
            { class: 'stack-sm' },
            h(
              'div',
              { class: 'stat-row' },
              stat({ label: 'Adopted policy', value: pr.chosenLabel, sub: money(pr.chosenCost, pr.currency) }),
              stat({ label: 'Hindsight lowest-cost policy', value: pr.hindsightBestLabel, sub: money(pr.hindsightBestCost, pr.currency) }),
              stat({ label: 'Realized policy regret', value: money(pr.realizedRegret, pr.currency), sub: pr.realizedRegret === 0 ? 'Zero regret ex-post' : 'Gap vs hindsight optimum' }),
            ),
            table({
              caption: 'Ex-post counterfactual cost across rehearsed response policies',
              rows: pr.policies,
              columns: [
                { label: 'Policy branch', render: (r) => `${r.label}${r.strategy === pr.chosenStrategy ? ' (adopted)' : ''}` },
                { label: 'Ex-post modeled cost', render: (r) => money(r.cost, pr.currency) },
                { label: 'Status', render: (r) => badge(r.strategy === pr.hindsightBestStrategy ? 'Hindsight optimum' : r.strategy === pr.chosenStrategy ? 'Chosen' : 'Alternative', r.strategy === pr.hindsightBestStrategy ? 'good' : 'neutral') },
              ],
            }),
          ),
        })
      : null,
    report.varianceByCurrency.length
      ? card({
          title: 'Settled variance roll-up by currency',
          subtitle: report.mixedVarianceCurrencies
            ? 'Multiple currencies present — grouped strictly per ISO currency with zero cross-currency summation.'
            : 'Single-currency workspace roll-up across loops with dated actuals.',
          body: table({
            caption: 'Workspace economic variance grouped by currency',
            rows: report.varianceByCurrency,
            columns: [
              { label: 'Currency', render: (r) => r.currency },
              { label: 'Loops', render: (r) => r.loops },
              { label: 'Planned', render: (r) => money(r.plannedCost, r.currency) },
              { label: 'Realized', render: (r) => money(r.realizedCost, r.currency) },
              { label: 'Total ΔC', render: (r) => signedMoney(r.varianceTotal, r.currency) },
              { label: 'Schedule effect', render: (r) => signedMoney(r.scheduleEffect, r.currency) },
              { label: 'Rate/spend effect', render: (r) => signedMoney(r.rateEffect, r.currency) },
              { label: 'Interaction', render: (r) => signedMoney(r.interactionEffect, r.currency) },
            ],
          }),
        })
      : null,
  );
}

function whatIfPanel(ctx, report) {
  const loop = report.focused;
  if (!loop) return cockpitPanel(ctx, report);
  if (uiState.whatIfLoopKey !== loop.loopKey) {
    uiState.whatIfLoopKey = loop.loopKey;
    uiState.clearLeaderGates = false;
    uiState.clearDelegateGates = false;
    uiState.thesisState = loop.thesisState;
    uiState.actualDays = String(loop.schedule.elapsedDays);
    uiState.actualMitigation = loop.economicVariance?.actualMitigation != null
      ? String(loop.economicVariance.actualMitigation)
      : (loop.economicVariance?.plannedMitigation != null ? String(loop.economicVariance.plannedMitigation) : '');
  }

  const sim = rehearseLoopWhatIf(loop, {
    clearLeaderGates: uiState.clearLeaderGates,
    clearDelegateGates: uiState.clearDelegateGates,
    thesisState: uiState.thesisState || loop.thesisState,
    actualDays: uiState.actualDays === '' ? null : Number(uiState.actualDays),
    actualMitigation: uiState.actualMitigation === '' ? null : Number(uiState.actualMitigation),
  }, ctx.state.settings);

  const comparisonRows = [
    { metric: 'Overall clearance', live: pct(loop.overallClearancePct), simulated: pct(sim.overallClearancePct) },
    { metric: 'Pressman–Wildavsky joint pass', live: pct(loop.jointClearancePct), simulated: pct(sim.jointClearancePct) },
    { metric: 'Leader / Delegate clearance', live: `${pct(loop.leaderClearancePct)} / ${pct(loop.delegateClearancePct)}`, simulated: `${pct(sim.leaderClearancePct)} / ${pct(sim.delegateClearancePct)}` },
    { metric: 'Lipke SPI(t) / SV(t)', live: loop.schedule.scheduled ? `${num(loop.schedule.spiT, 2)} / ${num(loop.schedule.svDays, 1)}d` : '—', simulated: sim.spiT !== null ? `${num(sim.spiT, 2)} / ${num(sim.svDays, 1)}d` : '—' },
    { metric: 'Critical-chain fever zone', live: SETTLEMENT_FEVER_LABELS[loop.fever.zone], simulated: SETTLEMENT_FEVER_LABELS[sim.fever.zone] },
    { metric: '2×2 Attribution regime', live: loop.attribution.meta.label, simulated: sim.attribution.meta.label },
    {
      metric: 'Brinson–Fachler variance ΔC',
      live: loop.economicVariance?.status === 'settled' ? signedMoney(loop.economicVariance.varianceTotal, loop.economicVariance.currency) : loop.economicVariance?.status || '—',
      simulated: sim.economicVariance?.status === 'settled' ? signedMoney(sim.economicVariance.varianceTotal, sim.economicVariance.currency) : sim.economicVariance?.status || '—',
    },
  ];

  return h(
    'div',
    { class: 'stack-md' },
    focusSelectorBar(ctx, report, 'whatif'),
    card({
      title: 'Read-only attribution & variance simulator',
      subtitle: 'Test how clearing leader bottlenecks, completing delegated tasks, or settling spend changes the fever zone and attribution regime. Zero records are modified.',
      body: h(
        'div',
        { class: 'stack-md' },
        h(
          'div',
          { class: 'bundle-form-grid' },
          h(
            'div',
            { class: 'field' },
            h(
              'label',
              { for: 'stl-wi-leader', class: 'prep-check-row' },
              h('input', {
                id: 'stl-wi-leader',
                type: 'checkbox',
                checked: uiState.clearLeaderGates,
                onChange: (e) => { uiState.clearLeaderGates = e.target.checked; ctx.refresh(); },
              }),
              h('span', null, 'Clear all leader-owned gates today'),
            ),
          ),
          h(
            'div',
            { class: 'field' },
            h(
              'label',
              { for: 'stl-wi-delegate', class: 'prep-check-row' },
              h('input', {
                id: 'stl-wi-delegate',
                type: 'checkbox',
                checked: uiState.clearDelegateGates,
                onChange: (e) => { uiState.clearDelegateGates = e.target.checked; ctx.refresh(); },
              }),
              h('span', null, 'Complete all delegated execution gates'),
            ),
          ),
          h(
            'div',
            { class: 'field' },
            h('label', { for: 'stl-wi-thesis' }, 'Hypothetical thesis outcome'),
            h(
              'select',
              {
                id: 'stl-wi-thesis',
                onChange: (e) => { uiState.thesisState = e.target.value; ctx.refresh(); },
              },
              h('option', { value: 'untested', selected: uiState.thesisState === 'untested' }, 'Open / untested'),
              h('option', { value: 'corroborated', selected: uiState.thesisState === 'corroborated' }, 'Corroborated'),
              h('option', { value: 'falsified', selected: uiState.thesisState === 'falsified' }, 'Falsified / signpost breached'),
            ),
          ),
          h(
            'div',
            { class: 'field' },
            h('label', { for: 'stl-wi-days' }, 'Simulated elapsed days (AT)'),
            h('input', {
              id: 'stl-wi-days',
              type: 'number',
              min: 0,
              max: 365,
              value: uiState.actualDays,
              onChange: (e) => { uiState.actualDays = e.target.value; ctx.refresh(); },
            }),
          ),
          loop.economicVariance?.currency
            ? h(
                'div',
                { class: 'field' },
                h('label', { for: 'stl-wi-spend' }, `Simulated direct spend (${loop.economicVariance.currency})`),
                h('input', {
                  id: 'stl-wi-spend',
                  type: 'number',
                  min: 0,
                  step: 'any',
                  value: uiState.actualMitigation,
                  onChange: (e) => { uiState.actualMitigation = e.target.value; ctx.refresh(); },
                }),
              )
            : null,
        ),
        table({
          caption: 'Live versus simulated loop attribution comparison',
          rows: comparisonRows,
          columns: [
            { label: 'Dimension', render: (r) => h('strong', null, r.metric) },
            { label: 'Live record', render: (r) => r.live },
            { label: 'What-if rehearsal', render: (r) => r.simulated },
          ],
        }),
      ),
    }),
  );
}

function ledgerPanel(ctx, report) {
  const cal = report.calibration;
  return h(
    'div',
    { class: 'stack-md' },
    h(
      'div',
      { class: 'stat-row' },
      stat({ label: 'Settled receipts', value: cal.settledCount, sub: `${cal.frozenCount} frozen awaiting review` }),
      stat({ label: 'Brier-graded forecasts', value: cal.gradedCount, sub: `Mean Brier ${cal.meanBrier ?? '—'}` }),
      stat({ label: 'Brier skill vs base rate', value: cal.skillSupported ? num(cal.brierSkill, 3) : 'Withheld', sub: cal.skillSupported ? `Base-rate Brier ${cal.referenceBrier}` : `Requires ≥ ${cal.minSkillSamples} graded` }),
      stat({
        label: 'Clean closure rate (Wilson 95%)',
        value: cal.cleanClosureInterval ? `${cal.cleanClosureInterval.ratePct}%` : '—',
        sub: cal.cleanClosureInterval ? `[${cal.cleanClosureInterval.loPct}%, ${cal.cleanClosureInterval.hiPct}%]` : 'No settled loops yet',
      }),
      stat({
        label: 'Team exoneration share',
        value: cal.exonerationInterval ? `${cal.exonerationInterval.ratePct}%` : '—',
        sub: cal.exonerationInterval ? `Wilson [${cal.exonerationInterval.loPct}%, ${cal.exonerationInterval.hiPct}%]` : 'No settled loops yet',
      }),
    ),
    report.settlements.length
      ? card({
          title: 'Prospective forecasts & immutable settlement receipts',
          subtitle: 'Brier-graded receipts are locked as calibration evidence. Ungraded forecasts may be archived.',
          body: table({
            caption: 'Frozen loop forecasts and settled attribution receipts',
            rows: report.settlements,
            columns: [
              { label: 'Loop', render: (s) => h('a', { href: `#/attribution?panel=xray&loop=${encodeURIComponent(s.loopKey)}` }, s.label) },
              { label: 'Status', render: (s) => badge(s.status, s.status === 'settled' ? 'good' : 'neutral') },
              { label: 'Forecast', render: (s) => pct(s.predictedCleanClosurePct) },
              { label: 'Verdict', render: (s) => s.verdict ? SETTLEMENT_REGIME_META[s.verdict.regime]?.label || s.verdict.regime : `Review ${s.reviewOn || '—'}` },
              { label: 'Brier', render: (s) => s.verdict?.brier != null ? num(s.verdict.brier, 4) : '—' },
              {
                label: 'Typed links',
                render: (s) => `${linksForEntity(ctx.state, 'settlement', s.id).length} edge(s)`,
              },
              {
                label: 'Action',
                render: (s) => (s.status === 'settled' && s.verdict?.brier !== null)
                  ? h('span', { class: 'muted tiny' }, 'Calibration locked')
                  : h('button', {
                      class: 'btn btn-tiny btn-ghost',
                      type: 'button',
                      onClick: async () => {
                        if (!(await confirmDialog({
                          title: `Archive "${s.label}"?`,
                          message: 'This removes the ungraded record from the active ledger and reconciles its graph edges.',
                          confirmLabel: 'Archive',
                        }))) return;
                        const res = ctx.api.archiveLoopSettlement(s.id);
                        if (!res.ok) { toast(res.error, 'bad'); return; }
                        toast('Settlement record archived.', 'neutral');
                        ctx.refresh();
                      },
                    }, 'Archive'),
              },
            ],
          }),
        })
      : emptyState({
          title: 'No frozen forecasts or settled receipts yet',
          body: 'Freeze a clean-closure forecast on an open loop to start your out-of-sample Brier record, or settle a due loop from the Cockpit.',
          action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => nav(ctx, 'cockpit') }, 'Open cockpit'),
        }),
  );
}

function methodPanel(report) {
  return h(
    'div',
    { class: 'stack-md' },
    card({
      title: 'Mathematical & cross-domain specification',
      subtitle: `Engine ${report.engineVersion} · Fidelity floor ${report.settings.settlementFidelityFloorPct}%`,
      body: h(
        'div',
        { class: 'stack-sm' },
        h('p', null, '1. Lipke (2003) Earned Schedule: ES = P · PD, SPI(t) = ES / AT, SV(t) = ES − AT, IEAC(t) = AT / P (withheld when P ≤ 5% or when reviewOn is absent). Unlike classical dollar EVM, SPI(t) never converges falsely to 1.00 on a late loop.'),
        h('p', null, '2. Goldratt (1997) Critical-Chain Fever Chart: plots window burn W = AT / PD against multi-channel clearance P, flagging Watch at W > 0.25 + 0.60P and Red breach at W > 0.45 + 0.55P.'),
        h('p', null, '3. Pressman & Wildavsky (1973) Clearance-Point Separation: partitions gates into Leader-owned (DACI choice, stakeholder brief, 1:1 support) and Delegate-owned (operational tasks), preventing leader governance delays from misreading as team underperformance.'),
        h('p', null, '4. Argyris (1977) / Fixsen (2005) / Holmström (1979) 2×2 Attribution: exonerates clean execution when a governing premise fails (`thesis-falsified-clean-execution`), guards untested premises against Type-III premature strategy abandonment (`execution-drift-untested-thesis`), and explicitly refuses causal attribution when both execution and outcome fail (`confounded-refused`).'),
        h('p', null, '5. Brinson & Fachler (1985) 3-Way Variance: ΔC = (T₁ − T₀)r₀ + [T₀(r₁ − r₀) + (M₁ − M₀)] + (T₁ − T₀)(r₁ − r₀), with zero unexplained residual, strict ISO currency isolation, and strict encumbrance-vs-actual separation.'),
      ),
    }),
    card({
      title: 'Post-commit automation rules (RULE-STL-01..05)',
      subtitle: 'Executed synchronously inside store savepoints; pauseable via Settings (`settlementAutoPropagate`).',
      body: table({
        caption: 'Outcome attribution post-commit automation rules',
        rows: [...SETTLEMENT_RULES],
        columns: [
          { label: 'Rule ID', render: (r) => h('strong', null, r.id) },
          { label: 'Name & framework', render: (r) => h('div', null, h('div', null, r.name), h('span', { class: 'muted tiny' }, r.framework)) },
          { label: 'Trigger', render: (r) => r.trigger },
          { label: 'Effect', render: (r) => r.description },
        ],
      }),
    }),
  );
}

export function renderSettlement(ctx) {
  const panelParam = ctx.query.get('panel') || 'cockpit';
  const active = PANELS.some((p) => p.key === panelParam) ? panelParam : 'cockpit';
  const focusParam = ctx.query.get('loop') || ctx.query.get('settlement') || null;
  const report = settlementReport(ctx.state, ctx.now, ctx.state.settings, focusParam);

  const header = pageHeader({
    eyebrow: 'LEADOS · OUTCOME ATTRIBUTION & LOOP SETTLEMENT',
    title: 'Separate false bets from stalled delivery.',
    subtitle: 'Earned Schedule (Lipke), Critical-Chain Fever Charts (Goldratt), Pressman–Wildavsky clearance bottlenecks, 2×2 thesis-vs-execution attribution, and Brinson–Fachler variance.',
    actions: [
      h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        onClick: () => {
          const text = ctx.api.settlementBriefText(report.focused?.loopKey || null);
          if (!downloadText({ filename: 'leados-attribution-brief.txt', text, mime: 'text/plain' })) {
            openModal({
              title: 'Copy outcome attribution brief',
              body: h('textarea', { rows: 16, readOnly: true, 'aria-label': 'Outcome attribution brief' }, text),
            });
          }
        },
      }, 'Export brief'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const res = ctx.api.scanSettlements();
          if (!res.ok) {
            toast(res.error, 'bad');
            return;
          }
          toast(
            res.propagations.length
              ? `Scan complete — ${res.propagations.length} grading / attribution effect(s) applied.`
              : 'Scan complete — all due forecasts and settlement links are current.',
            'good',
          );
          ctx.refresh();
        },
      }, 'Scan & grade due loops'),
    ],
  });

  const stats = h(
    'div',
    { class: 'stat-row' },
    stat({ label: 'Coordinated loops', value: report.counts.loops, sub: `${report.counts.bundles} bundles · ${report.counts.responses} responses · ${report.counts.caseLoops} cases` }),
    stat({ label: 'Red fever breaches', value: report.byZone.red, sub: `Watch ${report.byZone.watch} · Green ${report.byZone.green}` }),
    stat({ label: 'Leader bottlenecks', value: report.counts.leaderGatedRed, sub: 'Red-zone leader-gated loops' }),
    stat({ label: 'Team exonerations', value: report.counts.exonerated, sub: 'Clean delivery · falsified thesis' }),
    stat({
      label: 'Out-of-sample Brier',
      value: report.calibration.meanBrier !== null ? num(report.calibration.meanBrier, 3) : '—',
      sub: report.calibration.skillSupported ? `Skill ${num(report.calibration.brierSkill, 3)}` : `Skill withheld (<${report.calibration.minSkillSamples})`,
    }),
  );

  const panelBody = active === 'xray' ? xrayPanel(ctx, report)
    : active === 'variance' ? variancePanel(ctx, report)
      : active === 'whatif' ? whatIfPanel(ctx, report)
        : active === 'ledger' ? ledgerPanel(ctx, report)
          : active === 'method' ? methodPanel(report)
            : cockpitPanel(ctx, report);

  return h(
    'div',
    { class: 'view-stack stl-view' },
    header,
    stats,
    tabs({
      items: PANELS,
      active,
      ariaLabel: 'Outcome attribution sections',
      onSelect: (key) => nav(ctx, key),
    }),
    panelBody,
  );
}
