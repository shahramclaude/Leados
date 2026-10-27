/**
 * app/views/resilience.js — Operational Resilience, Dependency & Continuity
 * Terminal (`#/resilience` & `#/resilience/:id`).
 *
 * Synthesizes Simchi-Levi TTS/TTR/REI supply-chain resilience, Avelino minimal
 * hitting-set Bus Factor, Herfindahl-Hirschman concentration (HHI), Williamson
 * supplier hold-up risk, EU DORA Art. 11/26/29 continuity testing & Nth-party
 * choke-point visibility, and split-conformal drill calibration.
 *
 * Pure view over `app/core/domain/resilience.js`; all mutations route through
 * `ctx.api.*`. Zero network calls, zero `innerHTML`, full keyboard & screen-
 * reader support.
 */

import { h, confirmDialog, toast } from '../ui/dom.js';
import {
  badge,
  banner,
  card,
  emptyState,
  kv,
  pageHeader,
  stat,
  table,
  tabs,
  timeline,
} from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { exportWorkspaceCsv } from '../core/csv.js';
import { formatDate } from '../core/time.js';
import { resolveLinkedEntity, LINK_RELATION_LABELS } from '../core/domain/cases.js';
import {
  DEPENDENCY_CRITICALITY_LABELS,
  DEPENDENCY_KIND_LABELS,
  DEPENDENCY_STATUS_LABELS,
  DRILL_KIND_LABELS,
  DRILL_OUTCOME_LABELS,
  RESILIENCE_ENGINE_VERSION,
  RESILIENCE_MIN_DRILL_SAMPLES,
  RESILIENCE_RULES,
  SUBSTITUTABILITY_LABELS,
  buildResilienceReport,
  simulateDisruptionScenario,
} from '../core/domain/resilience.js';
import {
  openContinuityDrillModal,
  openDependencyModal,
  openRetireDependencyModal,
  openVerifyStewardModal,
} from '../ui/resilience-modals.js';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'topology', label: 'Cascade topology' },
  { key: 'stress', label: 'Stress lab' },
  { key: 'concentration', label: 'Bus factor & HHI' },
  { key: 'drills', label: 'Drills & board pack' },
];

function resolveNow(ctx) {
  if (!ctx) return new Date();
  if (ctx.now instanceof Date) return ctx.now;
  if (typeof ctx.now === 'function') return ctx.now();
  return new Date(ctx.now || Date.now());
}

function resolveQueryTab(ctx) {
  if (!ctx || !ctx.query) return null;
  if (typeof ctx.query.get === 'function') return ctx.query.get('tab');
  return ctx.query.tab || null;
}

function money(currency, amount) {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return '—';
  return `${currency || 'USD'} ${Math.round(Number(amount)).toLocaleString('en-US')}`.trim();
}

function daysText(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `${Number(value)}d`;
}

function critTone(crit) {
  if (crit === 'critical') return 'bad';
  if (crit === 'important') return 'warn';
  return 'neutral';
}

function busFactorBadge(st) {
  const tone = st.busFactor === 0 ? 'bad' : st.busFactor === 1 ? 'warn' : 'good';
  const suffix = st.inTrainingCount > 0 ? ` (+${st.inTrainingCount} shadow)` : '';
  return badge(
    `BF ${st.busFactor}${suffix}`,
    tone,
    `Verified active stewards: ${st.busFactor}. Unverified backups/trainees (${st.inTrainingCount}) do not count toward Bus Factor.`,
  );
}

function shortfallBadge(metrics) {
  if (metrics.ttsDays === null || (metrics.effectiveTtrDays === null && metrics.worstIncomingOutageDays <= 0)) {
    return badge('unmeasured', 'neutral', 'Record both TTS and TTR to compute survival shortfall');
  }
  if (metrics.hasAnyShortfall) {
    return badge(`+${metrics.cascadingShortfallDays}d gap`, 'bad', 'Worst recovery duration exceeds survival tolerance (TTR > TTS)');
  }
  return badge('buffered', 'good', 'Effective recovery sits within survival tolerance (TTR ≤ TTS)');
}

/* ------------------------------------------------------------------ */
/* SVG Visualization 1: Simchi-Levi TTS vs TTR Survival Matrix         */
/* ------------------------------------------------------------------ */

function renderContinuityMatrixSvg(activeRows, ctx) {
  const measured = activeRows.filter(
    (r) => r.metrics.ttsDays !== null && (r.metrics.effectiveTtrDays !== null || r.metrics.worstIncomingOutageDays > 0),
  );
  if (!measured.length) {
    return emptyState({
      title: 'No measured TTS/TTR pairs yet',
      body: 'Record Time-to-Survive (TTS) and Time-to-Recover (TTR) on at least one capability to plot the Simchi-Levi continuity boundary.',
    });
  }

  const W = 720;
  const H = 260;
  const pad = { left: 56, right: 24, top: 20, bottom: 38 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const points = measured.map((r) => {
    const worstOutage = Math.max(r.metrics.effectiveTtrDays || 0, r.metrics.worstIncomingOutageDays || 0);
    return {
      row: r,
      tts: r.metrics.ttsDays,
      ttr: worstOutage,
      breach: worstOutage > r.metrics.ttsDays,
      radius: 7 + Math.round((r.metrics.rei ?? 0.35) * 9),
    };
  });

  const maxAxis = Math.max(5, ...points.flatMap((p) => [p.tts, p.ttr])) * 1.12;
  const x = (val) => pad.left + (plotW * Math.min(maxAxis, Math.max(0, val))) / maxAxis;
  const y = (val) => pad.top + plotH - (plotH * Math.min(maxAxis, Math.max(0, val))) / maxAxis;

  const breachCount = points.filter((p) => p.breach).length;
  const titleId = 'res-matrix-svg-title';

  return h(
    'div',
    { class: 'resilience-chart-wrap' },
    h(
      'svg',
      {
        viewBox: `0 0 ${W} ${H}`,
        class: 'resilience-svg',
        role: 'img',
        'aria-labelledby': titleId,
      },
      h(
        'title',
        { id: titleId },
        `Simchi-Levi TTS versus TTR survival matrix across ${points.length} measured nodes; ${breachCount} sit above the TTR = TTS breach boundary.`,
      ),
      // Shaded shortfall region above diagonal y = x
      h('polygon', {
        points: `${x(0)},${y(0)} ${x(0)},${y(maxAxis)} ${x(maxAxis)},${y(maxAxis)}`,
        class: 'resilience-zone-shortfall',
      }),
      // Shaded safe buffered region below diagonal y = x
      h('polygon', {
        points: `${x(0)},${y(0)} ${x(maxAxis)},${y(0)} ${x(maxAxis)},${y(maxAxis)}`,
        class: 'resilience-zone-buffered',
      }),
      // Axes
      h('line', { x1: pad.left, y1: pad.top, x2: pad.left, y2: pad.top + plotH, class: 'resilience-axis' }),
      h('line', { x1: pad.left, y1: pad.top + plotH, x2: pad.left + plotW, y2: pad.top + plotH, class: 'resilience-axis' }),
      // Diagonal survival boundary TTR = TTS
      h('line', {
        x1: x(0),
        y1: y(0),
        x2: x(maxAxis),
        y2: y(maxAxis),
        class: 'resilience-boundary-line',
      }),
      h('text', { x: pad.left + 10, y: pad.top + 16, class: 'resilience-svg-note' }, 'Shortfall zone (effective TTR > TTS)'),
      h('text', { x: pad.left + plotW - 190, y: pad.top + plotH - 10, class: 'resilience-svg-note' }, 'Buffered zone (TTR ≤ TTS)'),
      h('text', { x: pad.left + plotW / 2 - 75, y: H - 8, class: 'resilience-svg-axis-label' }, 'Time-to-Survive — TTS (days)'),
      h(
        'text',
        {
          x: 16,
          y: pad.top + plotH / 2 + 45,
          transform: `rotate(-90 16 ${pad.top + plotH / 2 + 45})`,
          class: 'resilience-svg-axis-label',
        },
        'Worst outage TTR (d)',
      ),
      ...points.map((pt) =>
        h(
          'g',
          {
            class: 'resilience-node-group',
            onClick: () => ctx.navigate(`/resilience/${pt.row.dependency.id}`),
          },
          h('circle', {
            cx: x(pt.tts).toFixed(1),
            cy: y(pt.ttr).toFixed(1),
            r: String(pt.radius),
            class: pt.breach ? 'resilience-dot-breach' : 'resilience-dot-safe',
          }),
          h(
            'text',
            {
              x: (x(pt.tts) + pt.radius + 4).toFixed(1),
              y: (y(pt.ttr) + 4).toFixed(1),
              class: 'resilience-svg-label',
            },
            pt.row.dependency.name.slice(0, 26),
          ),
        ),
      ),
    ),
    h(
      'p',
      { class: 'muted small' },
      `Plotting ${points.length} measured node(s): bubble radius reflects Simchi-Levi Risk Exposure Index (REI). Nodes above the dashed diagonal exhaust their survival buffer before recovery completes.`,
    ),
  );
}

/* ------------------------------------------------------------------ */
/* SVG Visualization 2: Multi-Tier Cascade Topology Map                */
/* ------------------------------------------------------------------ */

function renderTopologySvg(report, ctx) {
  const rows = report.activeRows;
  if (!rows.length) {
    return emptyState({
      title: 'No active topology nodes',
      body: 'Register services, vendors, systems or processes to inspect multi-tier cascades.',
    });
  }

  const maxTier = Math.max(1, ...rows.map((r) => r.metrics.tier || 1));
  const tiers = new Map();
  for (let t = maxTier; t >= 1; t -= 1) tiers.set(t, []);
  for (const r of rows) {
    const t = r.metrics.tier || 1;
    if (!tiers.has(t)) tiers.set(t, []);
    tiers.get(t).push(r);
  }

  const maxPerCol = Math.max(1, ...[...tiers.values()].map((list) => list.length));
  const W = 780;
  const H = Math.max(240, maxPerCol * 74 + 60);
  const colEntries = [...tiers.entries()].sort((a, b) => b[0] - a[0]); // Upstream (highest tier) on left -> Tier 1 on right
  const colCount = colEntries.length;
  const padX = 110;
  const usableW = Math.max(1, W - padX * 2);

  const posById = new Map();
  colEntries.forEach(([tierNum, list], colIdx) => {
    const cx = colCount === 1 ? W / 2 : padX + (usableW * colIdx) / (colCount - 1);
    list.forEach((row, rowIdx) => {
      const cy = 50 + ((H - 80) * (rowIdx + 0.5)) / Math.max(1, list.length);
      posById.set(row.dependency.id, { x: cx, y: cy, tier: tierNum, row });
    });
  });

  const edges = [];
  for (const row of rows) {
    const targetPos = posById.get(row.dependency.id);
    if (!targetPos) continue;
    for (const upId of row.dependency.upstreamIds || []) {
      const sourcePos = posById.get(upId);
      if (!sourcePos) continue;
      const downImpact = sourcePos.row.metrics.impactedDownstream.find((d) => d.id === row.dependency.id);
      edges.push({
        from: sourcePos,
        to: targetPos,
        breach: Boolean(downImpact?.breachesTolerance),
      });
    }
  }

  const titleId = 'res-topology-svg-title';
  return h(
    'div',
    { class: 'resilience-chart-wrap' },
    h(
      'svg',
      {
        viewBox: `0 0 ${W} ${H}`,
        class: 'resilience-svg',
        role: 'img',
        'aria-labelledby': titleId,
      },
      h(
        'title',
        { id: titleId },
        `Multi-tier dependency cascade map across ${rows.length} nodes and ${edges.length} directed upstream-to-downstream links.`,
      ),
      ...colEntries.map(([tierNum], colIdx) => {
        const cx = colCount === 1 ? W / 2 : padX + (usableW * colIdx) / (colCount - 1);
        const label = tierNum === 1
          ? 'Tier 1 · Services & Runbooks'
          : tierNum === 2
            ? 'Tier 2 · Direct Vendors & Platforms'
            : `Tier ${tierNum} · Sub-Tier / Nth-Party`;
        return h('text', { x: cx, y: 22, 'text-anchor': 'middle', class: 'resilience-svg-tier' }, label);
      }),
      ...edges.map((e) => {
        const midX = (e.from.x + e.to.x) / 2;
        const d = `M ${e.from.x} ${e.from.y} C ${midX} ${e.from.y}, ${midX} ${e.to.y}, ${e.to.x} ${e.to.y}`;
        return h('path', {
          d,
          class: e.breach ? 'resilience-edge-breach' : 'resilience-edge-safe',
        });
      }),
      ...[...posById.values()].map((p) => {
        const m = p.row.metrics;
        const st = p.row.stewardship;
        const isDanger = m.hasAnyShortfall || st.isHumanSpof;
        return h(
          'g',
          {
            class: 'resilience-node-group',
            onClick: () => ctx.navigate(`/resilience/${p.row.dependency.id}`),
          },
          m.isCommonModeChokePoint
            ? h('circle', { cx: p.x, cy: p.y, r: '20', class: 'resilience-choke-halo' })
            : null,
          h('circle', {
            cx: p.x,
            cy: p.y,
            r: '13',
            class: isDanger ? 'resilience-dot-breach' : 'resilience-dot-safe',
          }),
          h(
            'text',
            { x: p.x, y: p.y + 4, 'text-anchor': 'middle', class: 'resilience-svg-bf' },
            `BF${st.busFactor}`,
          ),
          h(
            'text',
            { x: p.x, y: p.y + 28, 'text-anchor': 'middle', class: 'resilience-svg-label' },
            p.row.dependency.name.slice(0, 24),
          ),
        );
      }),
    ),
    h(
      'p',
      { class: 'muted small' },
      'Disruptions propagate left-to-right from upstream platforms/vendors to Tier-1 capabilities. Dashed outer rings highlight common-mode choke points feeding ≥ 2 critical/important capabilities.',
    ),
  );
}

/* ------------------------------------------------------------------ */
/* Tab 3: Interactive Zero-Write Stress Lab                            */
/* ------------------------------------------------------------------ */

function renderStressLabTab(report, ctx) {
  const activePeople = (ctx.state.people || []).filter((p) => p.status !== 'archived');
  const activeDeps = report.activeRows.map((r) => r.dependency);

  const selectedPeople = new Set();
  const selectedDeps = new Set();

  // Pre-seed default counterfactual with minimal cut set if available so the
  // leader sees an immediate, honest simulation on open without writing state.
  for (const cut of report.teamBus.minimalCutSet.slice(0, 1)) {
    selectedPeople.add(cut.personId);
  }
  if (!selectedPeople.size && report.chokePoints[0]) {
    selectedDeps.add(report.chokePoints[0].dependency.id);
  }

  const durationInput = h('input', {
    id: 'res-stress-duration',
    type: 'number',
    min: '0.5',
    step: '0.5',
    placeholder: 'Use each node’s recorded TTR',
    value: '',
  });

  const resultsBox = h('div', { class: 'stack-md', 'aria-live': 'polite' });

  const personCheckboxes = new Map();
  const depCheckboxes = new Map();

  const refreshSimulation = () => {
    const durRaw = durationInput.value.trim();
    const durationDaysOverride = durRaw === '' ? null : Number(durRaw);
    const sim = simulateDisruptionScenario(
      ctx.state,
      {
        unavailablePersonIds: [...selectedPeople],
        disruptedDependencyIds: [...selectedDeps],
        durationDaysOverride: Number.isFinite(durationDaysOverride) ? durationDaysOverride : null,
      },
      resolveNow(ctx),
    );

    resultsBox.replaceChildren();
    if (!sim.activeSelection) {
      resultsBox.appendChild(
        emptyState({
          title: 'Select team members or upstream nodes above',
          body: 'Stress tests run strictly in memory — zero records are modified.',
        }),
      );
      return;
    }

    const primaryLoss = sim.lossByCurrency[0]
      ? money(sim.lossByCurrency[0].currency, sim.lossByCurrency[0].amount)
      : 'unpriced';

    resultsBox.appendChild(
      h(
        'div',
        { class: 'stats-grid' },
        stat({
          label: 'Capabilities breaching tolerance',
          value: String(sim.breachingCount),
          hint: `${sim.humanStalledCount} stalled on zero remaining stewards`,
          tone: sim.breachingCount > 0 ? 'bad' : 'good',
        }),
        stat({
          label: 'Counterfactual shortfall loss',
          value: primaryLoss,
          hint: sim.lossByCurrency.length > 1
            ? `Other currencies kept separate: ${sim.lossByCurrency.slice(1).map((c) => money(c.currency, c.amount)).join(' · ')}`
            : 'Summed within currency over shortfall days',
          tone: sim.lossByCurrency.length ? 'warn' : '',
        }),
        stat({
          label: 'Active goals exposed',
          value: String(sim.stalledGoals.length),
          hint: sim.stalledGoals.slice(0, 2).map((g) => g.title).join(' · ') || 'None stalled',
          tone: sim.stalledGoals.length ? 'warn' : 'good',
        }),
        stat({
          label: 'Overloaded backup stewards',
          value: String(sim.overloadedBackupWarnings.length),
          hint: sim.overloadedBackupWarnings.length
            ? 'Surviving backups ≥ 90% allocated in Capacity'
            : 'Surviving backups have capacity headroom',
          tone: sim.overloadedBackupWarnings.length ? 'warn' : 'good',
        }),
      ),
    );

    if (sim.overloadedBackupWarnings.length) {
      resultsBox.appendChild(
        banner({
          tone: 'warn',
          title: 'Capacity contention on surviving backup stewards',
          body: sim.overloadedBackupWarnings
            .map((w) => `${w.personName} is already ${w.utilisationPct}% allocated while covering “${w.dependencyName}”`)
            .join(' · '),
        }),
      );
    }

    resultsBox.appendChild(
      table({
        caption: 'Counterfactual disruption impact across capabilities',
        emptyMessage: 'Selected shock is fully absorbed within TTS buffers and backup stewards.',
        columns: [
          {
            label: 'Capability / Node',
            render: (r) =>
              h(
                'div',
                null,
                h(
                  'button',
                  { class: 'link-btn', type: 'button', onClick: () => ctx.navigate(`/resilience/${r.dependency.id}`) },
                  r.dependency.name,
                ),
                h('div', { class: 'muted tiny' }, `${r.dependency.criticality} ${r.dependency.kind}`),
              ),
          },
          {
            label: 'Stewardship status',
            render: (r) =>
              r.humanStalled
                ? badge('0 stewards left', 'bad')
                : h('span', { class: 'small' }, `${r.remainingStewards.length} active (${r.remainingStewards.map((s) => s.personName).join(', ') || 'external'})`),
          },
          {
            label: 'Outage vs TTS',
            render: (r) => `${daysText(r.combinedOutageDays)} vs TTS ${daysText(r.ttsDays)}`,
          },
          {
            label: 'Shortfall',
            render: (r) => (r.shortfallDays > 0 ? badge(`+${r.shortfallDays}d`, 'bad') : badge('0d', 'good')),
          },
          {
            label: 'Estimated loss',
            render: (r) => (r.estimatedLoss !== null ? money(r.currency, r.estimatedLoss) : 'unpriced'),
          },
        ],
        rows: sim.impactedRows,
      }),
    );
  };

  durationInput.addEventListener('input', refreshSimulation);

  const applyPreset = (peopleIds, depIds) => {
    selectedPeople.clear();
    selectedDeps.clear();
    for (const pid of peopleIds) selectedPeople.add(pid);
    for (const did of depIds) selectedDeps.add(did);
    for (const [pid, cb] of personCheckboxes.entries()) cb.checked = selectedPeople.has(pid);
    for (const [did, cb] of depCheckboxes.entries()) cb.checked = selectedDeps.has(did);
    refreshSimulation();
  };

  const controlsCard = card({
    title: 'Counterfactual Disruption & Departure Stress Lab (Zero-Write)',
    subtitle: 'Test simultaneous key-person leave/departure and upstream vendor/platform outages against your real TTS tolerances and Capacity allocations.',
    actions: [
      report.teamBus.minimalCutSet.length
        ? h(
            'button',
            {
              class: 'btn btn-secondary btn-sm',
              type: 'button',
              onClick: () => applyPreset(report.teamBus.minimalCutSet.map((p) => p.personId), []),
            },
            `Preset: Minimal cut (${report.teamBus.minimalCutSet.map((p) => p.personName).join(', ')})`,
          )
        : null,
      report.chokePoints[0]
        ? h(
            'button',
            {
              class: 'btn btn-secondary btn-sm',
              type: 'button',
              onClick: () => applyPreset([], [report.chokePoints[0].dependency.id]),
            },
            `Preset: Choke point (${report.chokePoints[0].dependency.name.slice(0, 22)})`,
          )
        : null,
      h(
        'button',
        { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => applyPreset([], []) },
        'Clear',
      ),
    ].filter(Boolean),
    body: h(
      'div',
      { class: 'stack-md' },
      h(
        'div',
        { class: 'resilience-stress-columns' },
        h(
          'div',
          { class: 'stack-sm' },
          h('h3', { class: 'section-subhead' }, 'Unavailable people (leave / attrition / on-call collision)'),
          activePeople.length
            ? h(
                'div',
                { class: 'resilience-check-grid', role: 'group', 'aria-label': 'Unavailable people' },
                ...activePeople.map((p) => {
                  const cid = `stress-p-${p.id}`;
                  const cb = h('input', {
                    id: cid,
                    type: 'checkbox',
                    checked: selectedPeople.has(p.id),
                    onChange: () => {
                      if (cb.checked) selectedPeople.add(p.id);
                      else selectedPeople.delete(p.id);
                      refreshSimulation();
                    },
                  });
                  personCheckboxes.set(p.id, cb);
                  return h('label', { class: 'resilience-check-item', for: cid }, cb, h('span', null, `${p.name}${p.role ? ` · ${p.role}` : ''}`));
                }),
              )
            : h('p', { class: 'muted small' }, 'No active people in roster.'),
        ),
        h(
          'div',
          { class: 'stack-sm' },
          h('h3', { class: 'section-subhead' }, 'Disrupted vendors / systems / services'),
          activeDeps.length
            ? h(
                'div',
                { class: 'resilience-check-grid', role: 'group', 'aria-label': 'Disrupted dependencies' },
                ...activeDeps.map((d) => {
                  const cid = `stress-d-${d.id}`;
                  const cb = h('input', {
                    id: cid,
                    type: 'checkbox',
                    checked: selectedDeps.has(d.id),
                    onChange: () => {
                      if (cb.checked) selectedDeps.add(d.id);
                      else selectedDeps.delete(d.id);
                      refreshSimulation();
                    },
                  });
                  depCheckboxes.set(d.id, cb);
                  return h('label', { class: 'resilience-check-item', for: cid }, cb, h('span', null, `${d.name} (${d.kind})`));
                }),
              )
            : h('p', { class: 'muted small' }, 'No active dependencies registered.'),
        ),
      ),
      h(
        'div',
        { class: 'field', style: { maxWidth: '300px' } },
        h('label', { class: 'field-label', for: 'res-stress-duration' }, 'Optional outage / absence horizon override (days)'),
        durationInput,
      ),
      resultsBox,
    ),
  });

  refreshSimulation();
  return controlsCard;
}

/* ------------------------------------------------------------------ */
/* Main Terminal View (`#/resilience`)                                 */
/* ------------------------------------------------------------------ */

export function renderResilience(ctx) {
  const state = ctx.state;
  const now = resolveNow(ctx);
  const report = buildResilienceReport(state, now);
  const queryTab = resolveQueryTab(ctx);
  const activeTab = TABS.some((t) => t.key === queryTab) ? queryTab : 'overview';
  const autoOn = state.settings?.resilienceAutoPropagate !== false;

  const header = pageHeader({
    eyebrow: 'Operations · Continuity & Concentration Governance',
    title: 'Operational Resilience & Continuity',
    subtitle: 'Simchi-Levi TTS/TTR survival tolerances, Avelino Bus Factor, multi-tier Nth-party cascades, HHI concentration and conformal continuity-drill calibration.',
    actions: [
      h(
        'button',
        {
          class: 'btn btn-ghost btn-sm',
          type: 'button',
          onClick: () => {
            const res = ctx.api.setResilienceAutoPropagate(!autoOn);
            if (res.ok) {
              toast(autoOn ? 'Resilience auto-propagation paused' : 'Resilience auto-propagation active', 'good');
              ctx.refresh();
            }
          },
        },
        autoOn ? 'Auto-rules: On' : 'Auto-rules: Paused',
      ),
      h(
        'button',
        {
          class: 'btn btn-secondary btn-sm',
          type: 'button',
          onClick: () => {
            const res = ctx.api.scanOperationalResilience();
            if (res.ok) {
              const n = (res.propagations || []).length;
              toast(n ? `Continuity scan applied ${n} propagation(s)` : 'All continuity links & rules already in sync', 'good');
              ctx.refresh();
            }
          },
        },
        'Run continuity scan',
      ),
      h(
        'button',
        {
          class: 'btn btn-primary',
          type: 'button',
          onClick: () => openDependencyModal(ctx),
        },
        '+ Register dependency',
      ),
    ],
  });

  if (!report.totals.total) {
    return h(
      'div',
      { class: 'page stack-lg' },
      header,
      emptyState({
        title: 'Map your first important capability, vendor or critical runbook',
        body: 'Record Time-to-Survive (TTS), Time-to-Recover (TTR), verified stewards and upstream vendors. LeadOS automatically computes Bus Factor, cascading blast radius, supplier hold-up exposure, and opens cross-training delegations or DACI trade-off decisions where continuity is unbuffered.',
        action: h(
          'button',
          { class: 'btn btn-primary', type: 'button', onClick: () => openDependencyModal(ctx) },
          '+ Register dependency',
        ),
      }),
    );
  }

  const vc = report.concentration.primaryVendorCohort;
  const kpiStrip = h(
    'div',
    { class: 'stats-grid' },
    stat({
      label: 'Active nodes',
      value: String(report.totals.active),
      hint: `${report.totals.critical} critical · ${report.totals.retired} retired`,
    }),
    stat({
      label: 'Portfolio Bus Factor',
      value: report.teamBus.measured ? String(report.teamBus.portfolioBusFactor) : '—',
      hint: report.teamBus.minimalCutSet.length
        ? `Minimal cut: ${report.teamBus.minimalCutSet.map((p) => p.personName).join(', ')}`
        : `${report.totals.humanSpofs} node(s) at BF ≤ 1`,
      tone: report.teamBus.measured && report.teamBus.portfolioBusFactor <= 1 ? 'bad' : report.totals.humanSpofs > 0 ? 'warn' : 'good',
    }),
    stat({
      label: 'Survival shortfalls',
      value: String(report.totals.shortfalls),
      hint: `${report.criticalShortfalls.length} critical (effective TTR > TTS)`,
      tone: report.criticalShortfalls.length > 0 ? 'bad' : report.totals.shortfalls > 0 ? 'warn' : 'good',
    }),
    stat({
      label: 'Common-mode choke points',
      value: String(report.totals.chokePoints),
      hint: `${report.totals.subTierChokePoints} hidden sub-tier (depth ≥ 2)`,
      tone: report.totals.subTierChokePoints > 0 ? 'warn' : 'neutral',
    }),
    stat({
      label: 'Vendor HHI',
      value: vc && vc.hhi !== null ? `${vc.hhi}` : '—',
      hint: vc ? `${vc.currency} (${vc.band}, CR1 ${vc.cr1Pct}%)` : 'No priced vendors yet',
      tone: vc && (vc.band === 'high' || vc.band === 'monopoly') ? 'warn' : 'neutral',
    }),
  );

  const tabBar = tabs({
    ariaLabel: 'Operational resilience views',
    active: activeTab,
    items: TABS.map((t) => ({
      ...t,
      count:
        t.key === 'overview' ? report.totals.active
          : t.key === 'topology' ? report.totals.chokePoints
            : t.key === 'drills' ? report.calibration.totalDrills
              : undefined,
    })),
    onSelect: (key) => ctx.navigate(key === 'overview' ? '/resilience' : `/resilience?tab=${key}`),
  });

  let tabContent = null;

  if (activeTab === 'overview') {
    tabContent = h(
      'div',
      { class: 'stack-lg' },
      report.network.cycleNodeIds.length
        ? banner({
            tone: 'warn',
            title: 'Circular dependency detected in imported state',
            body: `Bounded relaxation prevented infinite propagation across ${report.network.cycleNodeIds.length} node(s). Open and edit upstream pointers to break the loop.`,
          })
        : null,
      card({
        title: 'Simchi-Levi Continuity Tolerance Matrix (TTS vs Worst Outage TTR)',
        subtitle: 'Capabilities above the dashed diagonal exhaust survival buffers before recovery completes.',
        body: renderContinuityMatrixSvg(report.activeRows, ctx),
      }),
      card({
        title: 'Active Dependency & Continuity Ledger',
        subtitle: 'Sorted by survival shortfall, Simchi-Levi Risk Exposure Index (REI) and criticality. Currencies are never mixed.',
        body: table({
          caption: 'Active operational dependencies and continuity posture',
          columns: [
            {
              label: 'Capability / Node',
              render: (r) =>
                h(
                  'div',
                  null,
                  h(
                    'button',
                    { class: 'link-btn', type: 'button', onClick: () => ctx.navigate(`/resilience/${r.dependency.id}`) },
                    r.dependency.name,
                  ),
                  h(
                    'div',
                    { class: 'muted tiny' },
                    `Tier ${r.metrics.tier} · ${DEPENDENCY_KIND_LABELS[r.dependency.kind]} · ${SUBSTITUTABILITY_LABELS[r.dependency.substitutability]}`,
                  ),
                ),
            },
            {
              label: 'Criticality',
              render: (r) => badge(r.dependency.criticality, critTone(r.dependency.criticality)),
            },
            {
              label: 'TTS / Eff. TTR',
              render: (r) => `${daysText(r.metrics.ttsDays)} / ${daysText(Math.max(r.metrics.effectiveTtrDays ?? 0, r.metrics.worstIncomingOutageDays || 0) || r.metrics.effectiveTtrDays)}`,
            },
            {
              label: 'Continuity',
              render: (r) => shortfallBadge(r.metrics),
            },
            {
              label: 'Bus Factor',
              render: (r) => busFactorBadge(r.stewardship),
            },
            {
              label: 'Blast Exposure (REI)',
              render: (r) =>
                r.metrics.primaryBlastExposure !== null
                  ? `${money(r.metrics.primaryBlastCurrency, r.metrics.primaryBlastExposure)} (${r.metrics.rei ?? '—'})`
                  : r.valuation.priced
                    ? `${money(r.valuation.currency, r.valuation.dailyImpact)}/d (0d gap)`
                    : 'unpriced',
            },
            {
              label: 'Actions',
              render: (r) =>
                h(
                  'div',
                  { class: 'row-actions' },
                  h(
                    'button',
                    { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => openContinuityDrillModal(ctx, r.dependency) },
                    'Log drill',
                  ),
                  h(
                    'button',
                    { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => openDependencyModal(ctx, r.dependency) },
                    'Edit',
                  ),
                ),
            },
          ],
          rows: report.activeRows,
        }),
      }),
      report.retiredRows.length
        ? card({
            title: `Retired Nodes (${report.retiredRows.length})`,
            subtitle: 'Excluded from active Bus Factor and shortfall alarms; drill history retained.',
            body: table({
              caption: 'Retired operational dependencies',
              columns: [
                {
                  label: 'Name',
                  render: (r) =>
                    h(
                      'button',
                      { class: 'link-btn', type: 'button', onClick: () => ctx.navigate(`/resilience/${r.dependency.id}`) },
                      r.dependency.name,
                    ),
                },
                { label: 'Kind', render: (r) => DEPENDENCY_KIND_LABELS[r.dependency.kind] },
                { label: 'Retired on', render: (r) => r.dependency.retiredOn || '—' },
                { label: 'Reason', render: (r) => r.dependency.retiredReason || '—' },
                {
                  label: 'Action',
                  render: (r) =>
                    h(
                      'button',
                      {
                        class: 'btn btn-ghost btn-sm',
                        type: 'button',
                        onClick: () => {
                          ctx.api.reopenDependency(r.dependency.id);
                          ctx.refresh();
                        },
                      },
                      'Reopen',
                    ),
                },
              ],
              rows: report.retiredRows,
            }),
          })
        : null,
    );
  } else if (activeTab === 'topology') {
    tabContent = h(
      'div',
      { class: 'stack-lg' },
      card({
        title: 'Multi-Tier Cascade Topology',
        subtitle: 'Click any node to inspect upstream propagation, downstream blast radius and linked governance records.',
        body: renderTopologySvg(report, ctx),
      }),
      card({
        title: 'Shared Upstream & Hidden Nth-Party Choke Points (EU DORA Art. 29)',
        subtitle: 'Upstream vendors, platforms or runbooks whose failure hits two or more critical/important downstream capabilities simultaneously.',
        body: table({
          caption: 'Common-mode and sub-tier dependency choke points',
          emptyMessage: 'No shared multi-service choke points detected in the current topology.',
          columns: [
            {
              label: 'Upstream choke point',
              render: (r) =>
                h(
                  'button',
                  { class: 'link-btn', type: 'button', onClick: () => ctx.navigate(`/resilience/${r.dependency.id}`) },
                  r.dependency.name,
                ),
            },
            {
              label: 'Tier & Depth',
              render: (r) =>
                h(
                  'span',
                  null,
                  `Tier ${r.metrics.tier} · ${r.metrics.maxCascadeHops} hop(s) `,
                  r.metrics.isSubTierChokePoint ? badge('Nth-party sub-tier', 'warn') : null,
                ),
            },
            {
              label: 'Downstream fan-out',
              render: (r) => `${r.metrics.criticalDownstreamCount} critical/important (${r.metrics.breachingDownstreamCount} breaching TTS)`,
            },
            {
              label: 'Affected downstream capabilities',
              render: (r) => r.metrics.impactedDownstream.map((d) => `${d.name} (${d.breachesTolerance ? `+${d.shortfallDays}d` : 'buffered'})`).join(' · '),
            },
          ],
          rows: report.chokePoints,
        }),
      }),
    );
  } else if (activeTab === 'stress') {
    tabContent = renderStressLabTab(report, ctx);
  } else if (activeTab === 'concentration') {
    const sc = report.concentration.stewardshipHhi;
    tabContent = h(
      'div',
      { class: 'stack-lg' },
      card({
        title: 'Key-Person Blast Radius & Avelino Minimal-Cut Stewardship',
        subtitle: report.teamBus.measured
          ? `Portfolio Bus Factor = ${report.teamBus.portfolioBusFactor} across ${report.teamBus.scopedCapabilityCount} critical/important capabilities (stall threshold ≥ ${report.teamBus.stallThresholdCount}). Stewardship HHI: ${sc.hhi ?? '—'} (${sc.band}).`
          : 'Assign stewards on critical/important capabilities to measure team Bus Factor.',
        body: table({
          caption: 'Per-person operational stewardship and Bus-Factor-1 concentration',
          emptyMessage: 'No active people on the roster.',
          columns: [
            {
              label: 'Team member',
              render: (r) =>
                h(
                  'button',
                  { class: 'link-btn', type: 'button', onClick: () => ctx.navigate(`/people/${r.personId}`) },
                  `${r.personName}${r.personRole ? ` (${r.personRole})` : ''}`,
                ),
            },
            { label: 'Primary', render: (r) => String(r.primaryCount) },
            { label: 'Verified backup', render: (r) => String(r.backupCount) },
            {
              label: 'Sole steward (BF = 1)',
              render: (r) =>
                r.soleStewardCount > 0
                  ? badge(`${r.soleStewardCount} SPOF (${r.soleStewardFor.map((d) => d.name).join(', ')})`, r.criticalSoleCount > 0 ? 'bad' : 'warn')
                  : badge('0', 'good'),
            },
            {
              label: '1:1 Prep',
              render: (r) =>
                h(
                  'button',
                  { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => ctx.navigate(`/prep/${r.personId}`) },
                  'Open 1:1 prep',
                ),
            },
          ],
          rows: report.teamBus.personRows,
        }),
      }),
      card({
        title: 'Supplier Spend Concentration (Herfindahl-Hirschman Index by Currency)',
        subtitle: `DOJ/FTC HHI bands: < 1,500 unconcentrated · 1,500–${report.concentration.highThreshold} moderate · > ${report.concentration.highThreshold} high. Currencies are never converted or summed.`,
        body: report.concentration.vendorByCurrency.length
          ? h(
              'div',
              { class: 'stack-md' },
              ...report.concentration.vendorByCurrency.map((cohort) =>
                h(
                  'div',
                  { class: 'stack-sm' },
                  h(
                    'p',
                    { class: 'small' },
                    h('strong', null, `${cohort.currency} cohort (n = ${cohort.count} priced vendor${cohort.count === 1 ? '' : 's'})`),
                    ` · HHI ${cohort.hhi} (${cohort.band}) · Effective suppliers: ${cohort.effectiveCount} · CR1: ${cohort.cr1Pct}% · CR3: ${cohort.cr3Pct}%`,
                  ),
                  table({
                    caption: `Vendor share breakdown in ${cohort.currency}`,
                    columns: [
                      { label: 'Vendor', render: (s) => s.label },
                      { label: `Annual exposure (${cohort.currency})`, render: (s) => money(cohort.currency, s.weight) },
                      { label: 'Share', render: (s) => `${s.sharePct}%` },
                      { label: 'HHI points (s²)', render: (s) => String(s.hhiContribution) },
                    ],
                    rows: cohort.shares,
                  }),
                ),
              ),
            )
          : emptyState({
              title: 'No priced vendor dependencies yet',
              body: 'Record annual spend or link a budget/negotiation on vendor nodes to compute supplier HHI.',
            }),
      }),
      card({
        title: 'Williamson Supplier Hold-Up & Exit-Strategy Audit',
        subtitle: 'Vendors combining sole-source lock-in, switching shortfalls (TTR > TTS) and missing exit plans carry asymmetric renewal leverage.',
        body: table({
          caption: 'Vendor hold-up exposure and exit plan readiness',
          emptyMessage: 'No active vendor dependencies registered.',
          columns: [
            {
              label: 'Vendor',
              render: (r) =>
                h(
                  'button',
                  { class: 'link-btn', type: 'button', onClick: () => ctx.navigate(`/resilience/${r.dependency.id}`) },
                  r.dependency.name,
                ),
            },
            { label: 'Substitutability', render: (r) => SUBSTITUTABILITY_LABELS[r.dependency.substitutability] },
            {
              label: 'Hold-up score',
              render: (r) => badge(`${r.holdUp.score}/100 (${r.holdUp.level})`, r.holdUp.level === 'high' ? 'bad' : r.holdUp.level === 'moderate' ? 'warn' : 'good'),
            },
            {
              label: 'Exit strategy (DORA Art. 28)',
              render: (r) => (r.dependency.exitPlanSummary ? badge('Documented', 'good') : badge('Missing', 'warn')),
            },
            {
              label: 'Linked negotiation',
              render: (r) =>
                r.dependency.linkedNegotiationId
                  ? h(
                      'button',
                      { class: 'link-btn', type: 'button', onClick: () => ctx.navigate(`/negotiations/${r.dependency.linkedNegotiationId}`) },
                      'Open negotiation',
                    )
                  : '—',
            },
          ],
          rows: report.activeRows.filter((r) => r.dependency.kind === 'vendor'),
        }),
      }),
    );
  } else {
    const cal = report.calibration;
    tabContent = h(
      'div',
      { class: 'stack-lg' },
      card({
        title: 'Split-Conformal Recovery-Time (TTR) Calibration',
        subtitle: `Compares realized recovery duration against prior estimated TTR across recorded drills & incidents. Evidence floor: n ≥ ${RESILIENCE_MIN_DRILL_SAMPLES}.`,
        body: !cal.sufficient
          ? banner({
              tone: 'info',
              title: `Counts-only below ${cal.minSamples} scored drills (${cal.n}/${cal.minSamples} recorded with estimate + actual)`,
              body: `Total drills logged: ${cal.totalDrills} (${cal.withinCount} within tolerance, ${cal.breachedCount} breached). LeadOS refuses to compute conformal recovery bands on fewer than ${cal.minSamples} empirical pairs.`,
            })
          : h(
              'div',
              { class: 'stats-grid' },
              stat({
                label: 'Scored drill pairs (n)',
                value: String(cal.n),
                hint: `${cal.breachedCount} breached tolerance`,
              }),
              stat({
                label: 'Median realized ÷ estimated TTR',
                value: `${cal.medianRatio}×`,
                hint: cal.optimisticBias ? 'Systematic TTR optimism detected' : 'Aligned with estimates',
                tone: cal.optimisticBias ? 'warn' : 'good',
              }),
              stat({
                label: '80% conformal TTR multiplier band',
                value: `[${cal.band.lowFactor}×, ${cal.band.highFactor}×]`,
                hint: `Finite-sample coverage ≥ ${cal.band.coverageBound}`,
              }),
              stat({
                label: 'Sign-test p-value (realized > est.)',
                value: cal.signTest ? String(cal.signTest.pValue) : '—',
                hint: cal.signTest ? `${cal.signTest.over} slower · ${cal.signTest.under} faster` : '',
              }),
            ),
      }),
      cal.untestedCritical.length || cal.staleCritical.length
        ? card({
            title: 'Untested & Stale Continuity Assumptions (EU DORA Art. 26)',
            subtitle: `Critical and important nodes lacking a continuity drill within the ${cal.drillWindowDays}-day cadence.`,
            body: table({
              caption: 'Untested or stale critical and important dependencies',
              columns: [
                {
                  label: 'Capability / Node',
                  render: (item) => {
                    const dep = item.dep || item;
                    return h(
                      'button',
                      { class: 'link-btn', type: 'button', onClick: () => ctx.navigate(`/resilience/${dep.id}`) },
                      dep.name,
                    );
                  },
                },
                {
                  label: 'Gap',
                  render: (item) =>
                    item.ageDays !== undefined
                      ? badge(`Stale (${item.ageDays}d since ${item.lastDrillOn})`, 'warn')
                      : badge('Never tested (paper TTR)', 'bad'),
                },
                {
                  label: 'Action',
                  render: (item) => {
                    const dep = item.dep || item;
                    return h(
                      'button',
                      { class: 'btn btn-secondary btn-sm', type: 'button', onClick: () => openContinuityDrillModal(ctx, dep) },
                      'Log continuity drill',
                    );
                  },
                },
              ],
              rows: [...cal.untestedCritical, ...cal.staleCritical],
            }),
          })
        : null,
      card({
        title: 'Recorded Continuity Drills & Live Incidents',
        body: table({
          caption: 'Continuity drills and incident recovery history',
          emptyMessage: 'No continuity drills recorded yet.',
          columns: [
            { label: 'Date', render: (d) => d.date },
            {
              label: 'Dependency',
              render: (d) =>
                h(
                  'button',
                  { class: 'link-btn', type: 'button', onClick: () => ctx.navigate(`/resilience/${d.dependencyId}`) },
                  d.dependencyName,
                ),
            },
            { label: 'Kind', render: (d) => DRILL_KIND_LABELS[d.kind] || d.kind },
            { label: 'Est. vs Realized TTR', render: (d) => `${daysText(d.estimatedTtrDays)} → ${daysText(d.realizedTtrDays)}` },
            {
              label: 'Outcome',
              render: (d) =>
                badge(
                  DRILL_OUTCOME_LABELS[d.outcome] || d.outcome,
                  d.outcome === 'breached-tolerance' ? 'bad' : d.outcome === 'partial' ? 'warn' : 'good',
                ),
            },
          ],
          rows: cal.allDrills,
        }),
      }),
      card({
        title: 'Deterministic Board & DORA Continuity Brief',
        subtitle: `Engine ${RESILIENCE_ENGINE_VERSION} · Zero generative hallucination; every figure traces to workspace records.`,
        actions: [
          h(
            'button',
            {
              class: 'btn btn-ghost btn-sm',
              type: 'button',
              onClick: async () => {
                try {
                  await navigator.clipboard?.writeText(report.boardBrief);
                  toast('Continuity brief copied to clipboard', 'good');
                } catch {
                  toast('Select and copy the brief text below', 'info');
                }
              },
            },
            'Copy brief',
          ),
          h(
            'button',
            {
              class: 'btn btn-secondary btn-sm',
              type: 'button',
              onClick: () => {
                downloadText(`leados-resilience-brief-${report.generatedAt.slice(0, 10)}.txt`, report.boardBrief, 'text/plain;charset=utf-8');
                toast('Continuity brief downloaded', 'good');
              },
            },
            'Download .txt',
          ),
          h(
            'button',
            {
              class: 'btn btn-secondary btn-sm',
              type: 'button',
              onClick: () => {
                const csvOut = exportWorkspaceCsv(state, 'resilience', { now });
                if (csvOut.ok) {
                  downloadText(csvOut.filename, csvOut.csv, 'text/csv;charset=utf-8');
                  toast(`Exported ${csvOut.rowCount} resilience row(s) to CSV`, 'good');
                }
              },
            },
            'Export CSV',
          ),
        ],
        body: h('pre', { class: 'resilience-brief-pre' }, report.boardBrief),
      }),
      card({
        title: 'Active Post-Commit Resilience Rules (ADR-0008 / ADR-0012)',
        body: table({
          caption: 'Automated operational resilience rules',
          columns: [
            { label: 'Rule', render: (r) => h('strong', null, r.id) },
            { label: 'Name & Framework', render: (r) => h('div', null, h('div', null, r.name), h('div', { class: 'muted tiny' }, r.framework)) },
            { label: 'Target modules', render: (r) => r.targetModule },
            { label: 'What it enforces', render: (r) => r.description },
          ],
          rows: [...RESILIENCE_RULES],
        }),
      }),
    );
  }

  return h('div', { class: 'page stack-lg' }, header, kpiStrip, tabBar, tabContent);
}

/* ------------------------------------------------------------------ */
/* Detail View (`#/resilience/:id`)                                    */
/* ------------------------------------------------------------------ */

export function renderResilienceDetail(ctx, explicitId = null) {
  const depId = explicitId || ctx.segments?.[1] || ctx.params?.id;
  const state = ctx.state;
  const now = resolveNow(ctx);
  const report = buildResilienceReport(state, now);
  const row = report.allRows.find((r) => r.dependency.id === depId);

  if (!row) {
    return h(
      'div',
      { class: 'page stack-lg' },
      pageHeader({
        eyebrow: 'Operational Resilience',
        title: 'Dependency not found',
        actions: [
          h('button', { class: 'btn btn-secondary', type: 'button', onClick: () => ctx.navigate('/resilience') }, '← Back to Resilience'),
        ],
      }),
      emptyState({
        title: 'That operational dependency does not exist in this workspace',
        body: 'It may have been deleted or belongs to a cleared demo dataset.',
      }),
    );
  }

  const dep = row.dependency;
  const m = row.metrics;
  const st = row.stewardship;

  const header = pageHeader({
    eyebrow: `Operational Resilience · Tier ${m.tier} ${DEPENDENCY_KIND_LABELS[dep.kind]}`,
    title: dep.name,
    subtitle: dep.summary || 'No operational summary recorded yet.',
    meta: h(
      'div',
      { class: 'badge-row' },
      badge(DEPENDENCY_CRITICALITY_LABELS[dep.criticality], critTone(dep.criticality)),
      badge(DEPENDENCY_STATUS_LABELS[dep.status], dep.status === 'retired' ? 'neutral' : 'good'),
      busFactorBadge(st),
      shortfallBadge(m),
      m.isCommonModeChokePoint ? badge(m.isSubTierChokePoint ? 'Sub-tier choke point' : 'Common-mode choke point', 'warn') : null,
    ),
    actions: [
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => ctx.navigate('/resilience') }, '← All nodes'),
      h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onClick: () => openContinuityDrillModal(ctx, dep) }, 'Log drill'),
      h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onClick: () => openVerifyStewardModal(ctx, dep) }, 'Verify steward'),
      h('button', { class: 'btn btn-primary btn-sm', type: 'button', onClick: () => openDependencyModal(ctx, dep) }, 'Edit'),
      dep.status !== 'retired'
        ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => openRetireDependencyModal(ctx, dep) }, 'Retire')
        : h(
            'button',
            {
              class: 'btn btn-ghost btn-sm',
              type: 'button',
              onClick: () => {
                ctx.api.reopenDependency(dep.id);
                ctx.refresh();
              },
            },
            'Reopen',
          ),
      h(
        'button',
        {
          class: 'btn btn-ghost btn-sm',
          type: 'button',
          onClick: () =>
            confirmDialog({
              title: `Delete “${dep.name}”?`,
              message: 'Retiring preserves continuity drill history; deleting removes this node and its graph links permanently.',
              confirmLabel: 'Delete permanently',
              danger: true,
              onConfirm: () => {
                const res = ctx.api.deleteDependency(dep.id);
                if (res.ok) {
                  toast('Dependency deleted', 'good');
                  ctx.navigate('/resilience');
                }
              },
            }),
        },
        'Delete',
      ),
    ],
  });

  const stats = h(
    'div',
    { class: 'stats-grid' },
    stat({
      label: 'Time-to-Survive (TTS)',
      value: daysText(m.ttsDays),
      hint: 'Max outage absorbed before SLA/goal loss',
    }),
    stat({
      label: 'Effective TTR',
      value: daysText(m.effectiveTtrDays),
      hint: row.calibratedTtr
        ? `Conformal 80% range: [${row.calibratedTtr.lowDays}d, ${row.calibratedTtr.highDays}d]`
        : SUBSTITUTABILITY_LABELS[dep.substitutability],
    }),
    stat({
      label: 'Cascading shortfall',
      value: daysText(m.cascadingShortfallDays),
      hint: m.worstIncomingSourceName ? `Worst upstream: ${m.worstIncomingSourceName} (${m.worstIncomingOutageDays}d)` : 'Direct tolerance comparison',
      tone: m.hasAnyShortfall ? 'bad' : 'good',
    }),
    stat({
      label: 'Verified Bus Factor',
      value: String(st.busFactor),
      hint: `${st.inTrainingCount} unverified/trainee · ${st.archivedCount} archived`,
      tone: st.isHumanSpof ? 'warn' : 'good',
    }),
    stat({
      label: 'Blast-radius exposure',
      value: m.primaryBlastExposure !== null ? money(m.primaryBlastCurrency, m.primaryBlastExposure) : 'unpriced',
      hint: m.rei !== null ? `Simchi-Levi REI ${m.rei} · ${row.valuation.source}` : `Daily: ${row.valuation.priced ? money(row.valuation.currency, row.valuation.dailyImpact) : 'unpriced'}`,
    }),
    stat({
      label: 'Expected annual loss',
      value: row.economics.available ? money(row.economics.currency, row.economics.expectedAnnualLoss) : '—',
      hint: row.economics.roiMultiple !== null
        ? `Mitigation ROI: ${row.economics.roiMultiple}× (${money(row.economics.currency, row.economics.mitigationCost)} cost)`
        : 'Set failure % & mitigation cost to price ROI',
    }),
  );

  const stewardshipCard = card({
    title: 'Human Stewardship & Verification Firewall',
    subtitle: 'Backup and trainee stewards do not raise Bus Factor until independent operation is explicitly verified.',
    actions: [
      h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onClick: () => openVerifyStewardModal(ctx, dep) }, 'Verify steward'),
    ],
    body: table({
      caption: 'Assigned stewards and verification status',
      emptyMessage: 'No stewards assigned yet (Bus Factor = 0).',
      columns: [
        {
          label: 'Person',
          render: (s) =>
            h(
              'button',
              { class: 'link-btn', type: 'button', onClick: () => ctx.navigate(`/people/${s.personId}`) },
              `${s.personName}${s.personRole ? ` (${s.personRole})` : ''}`,
            ),
        },
        { label: 'Role', render: (s) => s.roleLabel },
        {
          label: 'Continuity qualification',
          render: (s) =>
            !s.active
              ? badge('Archived on roster', 'bad')
              : s.qualified
                ? h('span', null, badge('Verified operator', 'good'), s.ramping ? badge('Ramping (<30d)', 'caution') : null)
                : badge('In training — excluded from BF', 'warn'),
        },
        { label: 'Verified on', render: (s) => s.verifiedOn || 'Not yet verified' },
        {
          label: 'Action',
          render: (s) =>
            s.active && !s.qualified
              ? h(
                  'button',
                  { class: 'btn btn-secondary btn-sm', type: 'button', onClick: () => openVerifyStewardModal(ctx, dep, s.personId) },
                  'Verify now',
                )
              : '—',
        },
      ],
      rows: st.stewards,
    }),
  });

  const upstreams = (dep.upstreamIds || [])
    .map((uid) => (state.dependencies || []).find((d) => d.id === uid))
    .filter(Boolean);

  const topologyCard = card({
    title: 'Cascade Position, Exit Strategy & Hold-Up Assessment',
    body: h(
      'div',
      { class: 'stack-md' },
      h(
        'div',
        { class: 'kv-grid' },
        kv('Substitutability', SUBSTITUTABILITY_LABELS[dep.substitutability]),
        kv('Exit / fallback plan', dep.exitPlanSummary || 'None documented (DORA Art. 28/29 gap)'),
        kv('Next review', dep.reviewOn ? formatDate(dep.reviewOn) : 'Not scheduled'),
        dep.kind === 'vendor'
          ? kv('Williamson hold-up risk', `${row.holdUp.score}/100 (${row.holdUp.level})${row.holdUp.reasons.length ? ` — ${row.holdUp.reasons.join('; ')}` : ''}`)
          : null,
      ),
      h(
        'div',
        { class: 'stack-sm' },
        h('h3', { class: 'section-subhead' }, `Direct upstream dependencies (${upstreams.length})`),
        upstreams.length
          ? h(
              'div',
              { class: 'badge-row' },
              ...upstreams.map((u) =>
                h(
                  'button',
                  { class: 'btn btn-secondary btn-sm', type: 'button', onClick: () => ctx.navigate(`/resilience/${u.id}`) },
                  `↑ ${u.name} (TTR ${u.ttrDays ?? '—'}d)`,
                ),
              ),
            )
          : h('p', { class: 'muted small' }, 'Root node — no upstream dependencies recorded.'),
      ),
      h(
        'div',
        { class: 'stack-sm' },
        h('h3', { class: 'section-subhead' }, `Transitive downstream blast radius (${m.impactedDownstream.length})`),
        m.impactedDownstream.length
          ? table({
              caption: 'Downstream capabilities impacted if this node fails',
              columns: [
                {
                  label: 'Downstream capability',
                  render: (d) =>
                    h('button', { class: 'link-btn', type: 'button', onClick: () => ctx.navigate(`/resilience/${d.id}`) }, d.name),
                },
                { label: 'Hops', render: (d) => String(d.hops) },
                { label: 'Propagated outage vs TTS', render: (d) => `${daysText(d.propagatedOutageDays)} vs ${daysText(d.ttsDays)}` },
                {
                  label: 'Shortfall',
                  render: (d) => (d.breachesTolerance ? badge(`+${d.shortfallDays}d`, 'bad') : badge('Buffered', 'good')),
                },
              ],
              rows: m.impactedDownstream,
            })
          : h('p', { class: 'muted small' }, 'Leaf capability — no downstream nodes depend on this node.'),
      ),
    ),
  });

  const linksResolved = row.links
    .map((edge) => ({
      edge,
      resolved: resolveLinkedEntity(state, edge.peer.type, edge.peer.id),
    }))
    .filter((item) => item.resolved);

  const linksCard = card({
    title: `Connected Operational Graph (${linksResolved.length})`,
    subtitle: 'Cross-module records linked automatically by RULE-RES-01..05 or explicitly by the leader.',
    body: linksResolved.length
      ? table({
          caption: 'Connected cross-module records',
          columns: [
            { label: 'Relation', render: (x) => LINK_RELATION_LABELS[x.edge.relation] || x.edge.relation },
            { label: 'Module', render: (x) => x.resolved.type },
            {
              label: 'Record',
              render: (x) =>
                h(
                  'button',
                  {
                    class: 'link-btn',
                    type: 'button',
                    onClick: () => ctx.navigate(x.resolved.route.replace(/^#/, '')),
                  },
                  x.resolved.title,
                ),
            },
            { label: 'Rule', render: (x) => x.edge.ruleId || 'manual' },
          ],
          rows: linksResolved,
        })
      : emptyState({ title: 'No cross-module links yet' }),
  });

  const drillsCard = card({
    title: `Continuity Drills & Live Incidents (${row.drills.length})`,
    actions: [
      h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onClick: () => openContinuityDrillModal(ctx, dep) }, '+ Log drill'),
    ],
    body: table({
      caption: 'Continuity drills for this node',
      emptyMessage: 'No continuity drills recorded for this node yet — recovery duration is currently an untested assumption.',
      columns: [
        { label: 'Date', render: (d) => d.date },
        { label: 'Kind', render: (d) => DRILL_KIND_LABELS[d.kind] || d.kind },
        { label: 'Est. → Realized TTR', render: (d) => `${daysText(d.estimatedTtrDays)} → ${daysText(d.realizedTtrDays)}` },
        {
          label: 'Outcome',
          render: (d) =>
            badge(
              DRILL_OUTCOME_LABELS[d.outcome] || d.outcome,
              d.outcome === 'breached-tolerance' ? 'bad' : d.outcome === 'partial' ? 'warn' : 'good',
            ),
        },
        { label: 'Scenario & Gap', render: (d) => [d.scenario, d.gapNote].filter(Boolean).join(' — ') || '—' },
      ],
      rows: row.drills,
    }),
  });

  const historyCard = card({
    title: 'Append-Only Continuity History',
    body: timeline(
      (dep.history || [])
        .slice()
        .reverse()
        .map((entry) => ({
          date: entry.on,
          kind: entry.action,
          title: entry.note || entry.action,
        })),
      { empty: 'No history entries yet.' },
    ),
  });

  return h('div', { class: 'page stack-lg' }, header, stats, stewardshipCard, topologyCard, drillsCard, linksCard, historyCard);
}
