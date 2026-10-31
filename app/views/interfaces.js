/**
 * app/views/interfaces.js — Cross-Boundary Interface, Queue-Network &
 * Operating Pact Terminal (`#/interfaces`, Schema v68, ADR-0058).
 *
 * Six accessible tabs:
 *   1. Overview & Network Map  — executive KPIs, SVG queueing-network &
 *                                externality flow map, harvested hotspots, signals
 *   2. Queue & Bullwhip        — Jackson/Whitt QNA table, Naor congestion
 *                                externalities, +20% Upstream Surge Paradox
 *   3. Operating Pacts         — symmetric give-get clauses, Clean-Hands Gate,
 *                                Wilson 95% compliance intervals, exchange ledger
 *   4. Conway & Pareto Redesign— Team Topologies mismatch audit + 4-lever
 *                                Pareto-undominated boundary interventions
 *   5. Falsifiable Audits      — freeze prospective compliance forecasts,
 *                                grade irreversibly with Brier (1950) & skill
 *   6. Method & Refusals       — named academic frameworks & explicit refusals
 */

import { h, toast } from '../ui/dom.js';
import {
  pageHeader,
  card,
  stat,
  badge,
  banner,
  tabs,
  emptyState,
  table,
  findingCard,
} from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { dayKey } from '../core/time.js';
import { linksForEntity, LINK_RELATION_LABELS } from '../core/domain/cases.js';
import { severityLabel } from '../core/domain/insights.js';
import {
  INTERFACE_MODE_LABELS,
  interfaceBrief,
  interfaceReport,
} from '../core/domain/interfaces.js';
import {
  openExchangeDialog,
  openFreezeInterfaceAuditDialog,
  openPactDialog,
  openResetScriptDialog,
} from '../ui/interface-modals.js';

const PANELS = [
  { key: 'overview', label: 'Overview & map' },
  { key: 'network', label: 'Queue & bullwhip' },
  { key: 'pacts', label: 'Operating pacts' },
  { key: 'redesign', label: 'Conway & redesign' },
  { key: 'audits', label: 'Falsifiable audits' },
  { key: 'method', label: 'Method & refusals' },
];

const pct = (val) =>
  val === null || val === undefined || !Number.isFinite(val)
    ? 'withheld'
    : `${Math.round(val * 1000) / 10}%`;

const money = (val, cur) =>
  val === null || val === undefined || !Number.isFinite(val) || !cur
    ? 'unpriced'
    : `${cur} ${Number(val).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

function verdictBadge(verdict) {
  switch (verdict) {
    case 'mutual-fidelity':
      return badge('Mutual fidelity (≥80%)', 'good');
    case 'within-guardrails':
      return badge('Within guardrails', 'info');
    case 'clean-hands-counterparty-breach':
      return badge('Credible SLA breach (clean hands)', 'warn');
    case 'dirty-hands-asymmetry':
      return badge('Clean-Hands Gate blocked (fix our intake first)', 'bad');
    case 'our-intake-breach':
      return badge('Our intake below floor', 'warn');
    default:
      return badge('Counts only (< floor)', 'neutral');
  }
}

function panelRoute(ctx, panel, pactId = null, auditId = null) {
  const q = new URLSearchParams({ panel });
  const chosenPact = pactId !== null ? pactId : ctx.query.get('pact');
  if (chosenPact) q.set('pact', chosenPact);
  if (auditId) q.set('audit', auditId);
  return `#/interfaces?${q.toString()}`;
}

function renderNetworkSvg(report) {
  const { units } = report.network;
  const rows = report.rows;
  if (!units.length || !rows.length) return null;

  const width = 760;
  const height = Math.max(220, Math.min(440, 90 + units.length * 54));
  const sources = units.filter((u) => u.outboundCount > 0 && u.inboundCount === 0);
  const relays = units.filter((u) => u.outboundCount > 0 && u.inboundCount > 0);
  const sinks = units.filter((u) => u.outboundCount === 0 && u.inboundCount > 0);
  const cols = [
    sources.length ? sources : units.slice(0, Math.ceil(units.length / 2)),
    ...(relays.length ? [relays] : []),
    sinks.length ? sinks : units.slice(Math.ceil(units.length / 2)),
  ].filter((c) => c.length > 0);

  const coords = new Map();
  cols.forEach((col, cIdx) => {
    const x = cols.length === 1 ? width / 2 : 120 + (cIdx * (width - 240)) / (cols.length - 1);
    col.forEach((u, rIdx) => {
      const y = ((rIdx + 1) * height) / (col.length + 1);
      coords.set(u.key, { x, y, unit: u });
    });
  });

  const edgeNodes = rows.map((row) => {
    const a = coords.get(String(row.pact.sourceUnit || '').trim().toLowerCase());
    const b = coords.get(String(row.pact.targetUnit || '').trim().toLowerCase());
    if (!a || !b) return null;
    const stroke = row.queue.unstable
      ? '#dc2626'
      : (row.queue.rho ?? 0) >= report.conventions.highUtil
        ? '#d97706'
        : '#2563eb';
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2 - 8;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const tipX = b.x - ux * 46;
    const tipY = b.y - uy * 18;
    const p1 = `${tipX},${tipY}`;
    const p2 = `${tipX - ux * 9 - uy * 5},${tipY - uy * 9 + ux * 5}`;
    const p3 = `${tipX - ux * 9 + uy * 5},${tipY - uy * 9 - ux * 5}`;
    return h(
      'g',
      null,
      h('line', {
        x1: a.x + ux * 44,
        y1: a.y + uy * 16,
        x2: tipX,
        y2: tipY,
        stroke,
        'stroke-width': row.queue.unstable ? '3' : '2',
      }),
      h('polygon', { points: `${p1} ${p2} ${p3}`, fill: stroke }),
      h(
        'text',
        { x: mx, y: my, 'text-anchor': 'middle', 'font-size': '11', fill: 'currentColor' },
        `${row.effectiveArrival ?? '—'}/wk${row.queue.socialToPrivateRatio ? ` · ${row.queue.socialToPrivateRatio}×` : ''}`,
      ),
    );
  });

  const unitBoxes = [...coords.values()].map(({ x, y, unit }) => {
    const rho = unit.gate?.rho ?? null;
    const fill = unit.gate?.unstable
      ? 'rgba(220,38,38,0.14)'
      : rho !== null && rho >= report.conventions.highUtil
        ? 'rgba(217,119,6,0.14)'
        : 'rgba(37,99,235,0.10)';
    const border = unit.gate?.unstable ? '#dc2626' : '#64748b';
    return h(
      'g',
      null,
      h('rect', {
        x: x - 62,
        y: y - 20,
        width: 124,
        height: 40,
        rx: 8,
        fill,
        stroke: border,
        'stroke-width': '1.5',
      }),
      h(
        'text',
        { x, y: y - 3, 'text-anchor': 'middle', 'font-size': '11', 'font-weight': '600', fill: 'currentColor' },
        String(unit.name).slice(0, 18),
      ),
      h(
        'text',
        { x, y: y + 12, 'text-anchor': 'middle', 'font-size': '10', fill: 'currentColor' },
        rho !== null ? `ρ=${Math.round(rho * 100)}%` : 'source unit',
      ),
    );
  });

  return h(
    'figure',
    { class: 'stack-xs' },
    h(
      'svg',
      {
        viewBox: `0 0 ${width} ${height}`,
        role: 'img',
        'aria-label': `Directed cross-boundary queueing network across ${units.length} units and ${rows.length} active pacts`,
        style: { width: '100%', maxHeight: '360px', display: 'block' },
      },
      h(
        'title',
        null,
        `Cross-boundary queueing network: ${rows.length} active pacts across ${units.length} organizational units.`,
      ),
      ...edgeNodes,
      ...unitBoxes,
    ),
    h(
      'figcaption',
      { class: 'muted small' },
      'Edge labels show rework-adjusted arrival rate (λ_eff/wk) and Naor social-to-private congestion multiplier ((2−ρ)/(1−ρ)). Full accessible table is on the Queue & bullwhip tab.',
    ),
  );
}

function renderLinkedFor(state, entityType, entityId) {
  const linked = linksForEntity(state, entityType, entityId);
  if (!linked.length) return h('span', { class: 'muted small' }, 'No cross-module links yet');
  return h(
    'div',
    { class: 'cluster' },
    ...linked.slice(0, 6).map((item) =>
      h(
        'a',
        { class: 'badge badge-neutral', href: item.peer.route },
        `${LINK_RELATION_LABELS[item.link.relation] || item.link.relation}: ${item.peer.title}`,
      ),
    ),
  );
}

function overviewPanel(ctx, report) {
  const { summary } = report;
  const curSummary = summary.exposureByCurrency.length
    ? summary.exposureByCurrency
        .map((c) => `${c.currency} ${c.weeklyExternalityCost.toLocaleString('en-US')}/wk`)
        .join(' · ')
    : 'unpriced';

  return h(
    'div',
    { class: 'stack' },
    h(
      'div',
      { class: 'stat-row' },
      stat({
        label: 'Active boundaries',
        value: String(summary.activePacts),
        hint: `${summary.totalSyncHours}h/wk standing coordination`,
      }),
      stat({
        label: 'Unstable / high-ρ gates',
        value: `${summary.unstableCount} / ${summary.highUtilCount}`,
        hint: `ρ ≥ 100% / ρ ≥ ${report.conventions.highUtilPct}%`,
        tone: summary.unstableCount > 0 ? 'bad' : summary.highUtilCount > 0 ? 'warn' : '',
      }),
      stat({
        label: 'Weekly congestion externality',
        value: curSummary,
        hint: 'Imposed on downstream queues (currencies never summed)',
        tone: summary.exposureByCurrency.length ? 'warn' : '',
      }),
      stat({
        label: 'Clean-Hands blocks / breaches',
        value: `${summary.dirtyHandsCount} / ${summary.credibleBreachCount}`,
        hint: `Floor ${report.conventions.cleanHandsFloorPct}% our intake fidelity`,
        tone: summary.dirtyHandsCount > 0 ? 'bad' : summary.credibleBreachCount > 0 ? 'warn' : '',
      }),
    ),
    summary.paradoxCount > 0
      ? banner({
          tone: 'warn',
          title: `Local-Acceleration Paradox active on ${summary.paradoxCount} boundary gate(s)`,
          body: 'Speeding up upstream output by +20% without scaling boundary capacity μ or cutting rework r pushes downstream queue wait up by more than the upstream time saved — reproducing the 2026 LinearB/Faros delivery slowdown.',
          actions: [
            h('a', { class: 'btn btn-small', href: panelRoute(ctx, 'network') }, 'Inspect surge math'),
          ],
        })
      : null,
    report.rows.length
      ? card({
          title: 'Directed Queue-Network & Congestion Externality Map',
          subtitle: 'Jackson (1957) / Whitt (1983) open network superposition with Naor (1969) marginal delay multipliers.',
          body: renderNetworkSvg(report),
        })
      : emptyState({
          title: 'No cross-boundary Operating Pact declared yet',
          body: 'Declare an Operating Pact for any recurring cross-team dependency (Security review, Legal gate, Platform API, Data handoff) — or promote one of the harvested workspace hotspots below in one click.',
          action: h(
            'button',
            { class: 'btn btn-primary', type: 'button', onClick: () => openPactDialog(ctx) },
            'Declare first Operating Pact',
          ),
        }),
    report.signals.length
      ? card({
          title: 'Active Boundary & Pact Signals',
          subtitle: 'Surfaced into #/insights and Today’s Brief with full evidence provenance.',
          body: h(
            'div',
            { class: 'stack-sm' },
            ...report.signals.map((sig) =>
              findingCard(
                { ...sig, severityLabel: sig.severityLabel || severityLabel(sig.severity) },
                {
                  onAction: sig.action?.route ? () => ctx.navigate(sig.action.route) : null,
                },
              ),
            ),
          ),
        })
      : null,
    report.harvested.all.length
      ? card({
          title: 'Empirical Cross-Boundary Friction Harvested from Workspace Records',
          subtitle: 'Automatically scanned across open cases, dependencies, negotiations, cross-unit decisions and delegations — zero duplicate entry.',
          body: table({
            caption: 'Cross-boundary operational traffic discovered across workspace modules',
            columns: [
              { label: 'Boundary', render: (r) => `${r.sourceUnit} → ${r.targetUnit}` },
              { label: 'Records', render: (r) => `${r.totalSignals} (${r.cases} case · ${r.dependencies} dep · ${r.decisions} dec · ${r.negotiations} neg)` },
              { label: 'Status', render: (r) => (r.coveredByPact ? badge('Covered by pact', 'good') : badge('Ungoverned hotspot', 'warn')) },
              {
                label: 'Action',
                render: (r) =>
                  r.coveredByPact
                    ? h('a', { href: panelRoute(ctx, 'pacts') }, 'View pacts')
                    : h(
                        'button',
                        {
                          class: 'btn btn-small',
                          type: 'button',
                          onClick: () =>
                            openPactDialog(ctx, null, {
                              title: `${r.sourceUnit} ↔ ${r.targetUnit} Operating Pact`,
                              sourceUnit: r.sourceUnit,
                              targetUnit: r.targetUnit,
                              mode: 'x-as-a-service',
                            }),
                        },
                        'Codify pact',
                      ),
              },
            ],
            rows: report.harvested.all,
          }),
        })
      : null,
  );
}

function networkPanel(ctx, report) {
  if (!report.rows.length) {
    return emptyState({
      title: 'Declare an Operating Pact to solve queue-network & bullwhip physics',
      action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openPactDialog(ctx) }, 'Declare pact'),
    });
  }
  return h(
    'div',
    { class: 'stack' },
    banner({
      tone: 'info',
      title: 'Why local utilization lies: Rework × Variability × Naor Externalities',
      body: 'In a GI/G/1 boundary gate, rework r multiplies effective demand by 1/(1−r), departure burstiness propagates as C_d² = (1−ρ²)C_a² + ρ²C_s², and sending one extra item imposes W_q/(1−ρ) of external wait on everyone else in the queue.',
    }),
    card({
      title: 'Jackson / Whitt Open Queue-Network & Naor Externality Ledger',
      subtitle: 'Shared target gates superpose all inbound pacts automatically. Unstable gates (ρ ≥ 100%) refuse finite wait estimates.',
      body: table({
        caption: 'Per-boundary queue utilization, departure bullwhip, marginal externality and +20% surge test',
        columns: [
          {
            label: 'Boundary pact',
            render: (r) =>
              h(
                'a',
                { href: panelRoute(ctx, 'pacts', r.pact.id) },
                `${r.pact.sourceUnit} → ${r.pact.targetUnit}`,
              ),
          },
          {
            label: 'λ₀ → λ_eff / μ',
            render: (r) =>
              r.parameterized
                ? `${r.baseArrival}/wk × ${r.reworkMultiplier}× = ${r.effectiveArrival}/wk vs ${r.pact.serviceCapacityPerWeek}/wk`
                : 'unparameterized',
          },
          {
            label: 'Gate ρ',
            render: (r) =>
              r.queue.rho === null
                ? '—'
                : r.queue.unstable
                  ? badge(`${Math.round(r.queue.rho * 100)}% UNSTABLE`, 'bad')
                  : badge(`${Math.round(r.queue.rho * 100)}%`, r.queue.rho >= report.conventions.highUtil ? 'warn' : 'good'),
          },
          {
            label: 'Bullwhip (C_a²→C_d²)',
            render: (r) =>
              r.queue.departureCv2 !== null
                ? `${r.queue.arrivalCv2} → ${r.queue.departureCv2} (${r.queue.bullwhipRatio ?? '—'}×)`
                : '—',
          },
          {
            label: 'Private vs external wait',
            render: (r) =>
              r.queue.unstable
                ? '∞ (queue diverges)'
                : r.queue.privateWaitDays !== null
                  ? `${r.queue.privateWaitDays}d private · +${r.queue.marginalExternalityDaysPerItem}d external (${r.queue.socialToPrivateRatio}×)`
                  : '—',
          },
          {
            label: 'Weekly externality cost',
            render: (r) => money(r.queue.weeklyExternalityCost, r.queue.currency),
          },
          {
            label: '+20% upstream surge',
            render: (r) =>
              !r.surgeParadox
                ? '—'
                : r.surgeParadox.blowup
                  ? badge('Tips ρ ≥ 100%', 'bad')
                  : r.surgeParadox.paradoxTriggered
                    ? badge(`Net +${r.surgeParadox.netLeadTimeDeltaDays}d slower`, 'warn')
                    : badge('Absorbed safely', 'good'),
          },
        ],
        rows: report.rows,
      }),
    }),
  );
}

function pactsPanel(ctx, report) {
  const focusedId = ctx.query.get('pact');
  const allPacts = ctx.state.interfacePacts || [];
  if (!allPacts.length) {
    return emptyState({
      title: 'No Operating Pacts on file',
      body: 'Turn recurring cross-team friction into symmetric, auditable give-get commitments with a Clean-Hands Escalation Gate.',
      action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openPactDialog(ctx) }, 'Declare Operating Pact'),
    });
  }

  return h(
    'div',
    { class: 'stack' },
    ...report.rows.map((row) => {
      const { pact, compliance } = row;
      const isFocused = focusedId === pact.id;
      return card({
        id: `pact-${pact.id}`,
        title: `${pact.title} (${pact.sourceUnit} → ${pact.targetUnit})`,
        subtitle: `${INTERFACE_MODE_LABELS[pact.mode] || pact.mode} · Turnaround SLA ≤${pact.turnaroundDays}d${pact.wipCap ? ` · WIP cap ${pact.wipCap}` : ''}${isFocused ? ' · Focused' : ''}`,
        actions: [
          h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => openExchangeDialog(ctx, pact) }, 'Log exchange'),
          h('button', { class: 'btn btn-small', type: 'button', onClick: () => openResetScriptDialog(ctx, row) }, 'Principled reset script'),
          h('button', { class: 'btn btn-small', type: 'button', onClick: () => openFreezeInterfaceAuditDialog(ctx, row) }, 'Freeze forecast'),
          h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => openPactDialog(ctx, pact) }, 'Edit'),
          h(
            'button',
            {
              class: 'btn btn-small btn-ghost',
              type: 'button',
              onClick: () => {
                const res = ctx.api.deleteInterfacePact(pact.id);
                if (!res?.ok) {
                  toast(res?.error || 'Could not remove pact.', 'bad');
                  return;
                }
                toast('Operating Pact removed.', 'good');
                ctx.rerender();
              },
            },
            'Delete',
          ),
        ],
        body: h(
          'div',
          { class: 'stack-sm' },
          h(
            'div',
            { class: 'cluster' },
            verdictBadge(compliance.verdict),
            compliance.ourIntake
              ? badge(
                  `Our intake clean: ${pct(compliance.ourIntake.rate)} (95% CI ${pct(compliance.ourIntake.lo)}–${pct(compliance.ourIntake.hi)})`,
                  compliance.ourIntake.rate >= report.conventions.cleanHandsFloor ? 'good' : 'bad',
                )
              : badge(`Our intake clean: ${compliance.cleanCount}/${compliance.totalExchanges} (<${report.conventions.minExchanges} floor)`, 'neutral'),
            compliance.theirSla
              ? badge(
                  `Counterparty SLA: ${pct(compliance.theirSla.rate)} (95% CI ${pct(compliance.theirSla.lo)}–${pct(compliance.theirSla.hi)})`,
                  compliance.theirSla.rate >= report.conventions.counterpartySlaFloor ? 'good' : 'warn',
                )
              : badge(`Counterparty SLA: ${compliance.slaMetCount}/${compliance.settledExchanges} (<${report.conventions.minExchanges} floor)`, 'neutral'),
          ),
          h(
            'div',
            { class: 'grid-2' },
            h('div', { class: 'stack-xs' }, h('strong', null, `Our Give (${pact.sourceUnit})`), h('p', { class: 'small' }, pact.ourGive || 'Not yet specified.')),
            h('div', { class: 'stack-xs' }, h('strong', null, `Their Give (${pact.targetUnit})`), h('p', { class: 'small' }, pact.theirGive || 'Not yet specified.')),
          ),
          pact.escalationRule
            ? h('p', { class: 'muted small' }, `Graduated escalation rule: ${pact.escalationRule}`)
            : null,
          pact.exchanges.length
            ? table({
                caption: `Dated bilateral exchanges on ${pact.title}`,
                columns: [
                  { label: 'Date', render: (ex) => ex.recordedOn },
                  { label: 'Summary', render: (ex) => ex.summary || '—' },
                  {
                    label: 'Our intake spec',
                    render: (ex) => (ex.intakeClean ? badge('Clean', 'good') : badge('Incomplete / rush', 'bad')),
                  },
                  {
                    label: 'Turnaround',
                    render: (ex) => (ex.turnaroundDays === null ? 'Open' : `${ex.turnaroundDays}d`),
                  },
                  {
                    label: 'SLA',
                    render: (ex) =>
                      ex.metSla === null
                        ? badge('In flight', 'neutral')
                        : ex.metSla
                          ? badge('Met', 'good')
                          : badge('Missed', 'warn'),
                  },
                  { label: 'Bounce', render: (ex) => (ex.bounced ? badge('Bounced', 'warn') : 'Single pass') },
                ],
                rows: pact.exchanges.slice().reverse().slice(0, 12),
              })
            : h('p', { class: 'muted small' }, `Zero exchanges logged yet. At least ${report.conventions.minExchanges} settled exchanges are required before compliance verdicts activate.`),
          h('div', { class: 'stack-xs' }, h('strong', { class: 'small' }, 'Cross-module provenance'), renderLinkedFor(ctx.state, 'interface', pact.id)),
        ),
      });
    }),
  );
}

function redesignPanel(ctx, report) {
  if (!report.rows.length) {
    return emptyState({
      title: 'Declare a parameterized Operating Pact to compare Pareto redesigns',
      action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openPactDialog(ctx) }, 'Declare pact'),
    });
  }
  return h(
    'div',
    { class: 'stack' },
    banner({
      tone: 'info',
      title: 'Conway / Team-Topologies Alignment & Multi-Objective Pareto Frontier',
      body: 'Interventions are compared by exact Pareto dominance across expected queue wait (days), weekly externality item-days, and standing sync hours — never collapsed into an arbitrary weighted score.',
    }),
    ...report.rows.map((row) =>
      card({
        title: `${row.pact.sourceUnit} → ${row.pact.targetUnit}: ${row.modeAudit.headline}`,
        subtitle: row.modeAudit.detail,
        body: row.redesigns.length
          ? table({
              caption: `Counterfactual boundary interventions for ${row.pact.title}`,
              columns: [
                { label: 'Intervention lever', render: (lv) => h('div', null, h('strong', null, lv.label), h('p', { class: 'muted small' }, lv.summary)) },
                { label: 'Counterfactual ρ', render: (lv) => `${Math.round(lv.rho * 100)}%` },
                { label: 'Queue wait', render: (lv) => (lv.stabilizes ? `${lv.waitDays}d` : 'Unstable (≥100%)') },
                { label: 'Externality item-days/wk', render: (lv) => (lv.stabilizes ? `${lv.externalityItemDays}` : '—') },
                { label: 'Sync hrs/wk', render: (lv) => `${lv.syncHours}h` },
                { label: 'Externality saved/wk', render: (lv) => money(lv.weeklyExternalitySaved, lv.currency) },
                {
                  label: 'Frontier',
                  render: (lv) =>
                    !lv.stabilizes
                      ? badge('Insufficient alone', 'bad')
                      : lv.paretoOptimal
                        ? badge('Pareto-optimal', 'good')
                        : badge('Dominated', 'neutral'),
                },
              ],
              rows: row.redesigns,
            })
          : h('p', { class: 'muted small' }, 'Declare arrival rate λ₀ and gate capacity μ on this pact to evaluate counterfactual levers.'),
      }),
    ),
  );
}

function auditsPanel(ctx, report) {
  const { audits, calibration } = report;
  const pactById = new Map((ctx.state.interfacePacts || []).map((p) => [p.id, p]));
  const today = dayKey(ctx.now);

  return h(
    'div',
    { class: 'stack' },
    h(
      'div',
      { class: 'stat-row' },
      stat({ label: 'Frozen / total audits', value: `${audits.filter((a) => !a.grade).length} / ${audits.length}`, hint: 'Content-free aggregate snapshots' }),
      stat({ label: 'Graded audits', value: String(calibration.gradedCount), hint: 'Scored once after reviewOn' }),
      stat({ label: 'Mean Brier score', value: calibration.meanBrier !== null ? String(calibration.meanBrier) : 'withheld', hint: '0 = perfect, 0.25 = coin-flip' }),
      stat({
        label: 'Brier skill vs base rate',
        value: calibration.skillReportable ? String(calibration.brierSkill) : 'withheld (<5)',
        hint: `Requires ≥${report.conventions.minSkillAudits} graded audits`,
      }),
    ),
    audits.length
      ? card({
          title: 'Prospective Operating Pact Forecasts',
          subtitle: 'Each forecast locks ex-ante probability that ≥80% of settled exchanges in (frozenOn, reviewOn] are jointly clean & on-time.',
          body: table({
            caption: 'Frozen and graded Operating Pact compliance forecasts',
            columns: [
              {
                label: 'Boundary pact',
                render: (a) => {
                  const p = pactById.get(a.pactId);
                  return p ? `${p.sourceUnit} → ${p.targetUnit}` : `Deleted pact (${a.pactId})`;
                },
              },
              { label: 'Window', render: (a) => `${a.frozenOn} → ${a.reviewOn} (${a.horizonDays}d)` },
              { label: 'Forecast P(≥80%)', render: (a) => pct(a.predictedComplianceProb) },
              {
                label: 'Outcome & Brier',
                render: (a) =>
                  a.grade
                    ? `${pct(a.grade.realizedRate)} (${a.grade.jointCleanCount}/${a.grade.windowExchanges}) · Brier ${a.grade.brier}`
                    : a.reviewOn <= today
                      ? badge('Due for grading', 'warn')
                      : badge('Frozen', 'neutral'),
              },
              {
                label: 'Actions',
                render: (a) =>
                  a.grade
                    ? renderLinkedFor(ctx.state, 'interfaceAudit', a.id)
                    : h(
                        'div',
                        { class: 'cluster' },
                        a.reviewOn <= today
                          ? h(
                              'button',
                              {
                                class: 'btn btn-small btn-primary',
                                type: 'button',
                                onClick: () => {
                                  const res = ctx.api.gradeInterfaceAudit(a.id);
                                  if (!res?.ok) {
                                    toast(res?.error || 'Cannot grade audit yet.', 'bad');
                                    return;
                                  }
                                  toast(`Graded once · Brier ${res.grade.brier}.`, 'good');
                                  ctx.rerender();
                                },
                              },
                              'Grade once',
                            )
                          : null,
                        h(
                          'button',
                          {
                            class: 'btn btn-small btn-ghost',
                            type: 'button',
                            onClick: () => {
                              const res = ctx.api.deleteInterfaceAudit(a.id);
                              if (!res?.ok) {
                                toast(res?.error || 'Cannot delete audit.', 'bad');
                                return;
                              }
                              toast('Removed ungraded forecast.', 'good');
                              ctx.rerender();
                            },
                          },
                          'Remove',
                        ),
                      ),
              },
            ],
            rows: audits,
          }),
        })
      : emptyState({
          title: 'No Operating Pact forecasts frozen yet',
          body: 'Open the Operating pacts tab and freeze a prospective compliance forecast before changing an interface.',
          action: h('a', { class: 'btn btn-primary', href: panelRoute(ctx, 'pacts') }, 'Choose a pact to freeze'),
        }),
  );
}

function methodPanel(report) {
  return h(
    'div',
    { class: 'stack' },
    card({
      title: 'Cross-Domain Theoretical Synthesis (ADR-0058)',
      body: h(
        'div',
        { class: 'prose' },
        h(
          'ul',
          null,
          h('li', null, h('strong', null, 'Open Queueing Networks & Variability Propagation (Jackson 1957; Kingman 1961; Whitt 1983, BSTJ “The Queueing Network Analyzer”; Lee, Padmanabhan & Whang 1997): '), 'Solves rework-amplified effective flow λ_eff = λ₀/(1−r), shared-gate superposition across inbound pacts, GI/G/1 expected wait W_q = (ρ/(1−ρ))·((C_a²+C_s²)/2)·(1/μ), and departure burstiness C_d² = (1−ρ²)C_a² + ρ²C_s².'),
          h('li', null, h('strong', null, 'Pigouvian Queue Congestion Externalities (Pigou 1920; Naor 1969, Econometrica): '), 'Separates private queue delay W_q from marginal external delay imposed on all other queued items λ·∂W_q/∂λ = W_q/(1−ρ), yielding exact social-to-private ratio (2−ρ)/(1−ρ) and testing the +20% Upstream Local-Acceleration Surge Paradox.'),
          h('li', null, h('strong', null, 'Transaction Costs & Team Topologies Alignment (Coase 1937; Conway 1968; Galbraith 1973; Williamson 1985; Skelton & Pais 2019): '), 'Audits declared modes (X-as-a-Service, Collaboration, Facilitating, Gatekeeper, Ad-hoc) against empirical bounce, utilization and sync hours, and computes the exact 4-lever Pareto frontier.'),
          h('li', null, h('strong', null, 'Symmetric Relational Contracts & Clean-Hands Governance (Fisher & Ury 1981; Ostrom 1990; Gibbons & Henderson 2012; Wilson 1927; Brier 1950): '), `Tracks both Our Intake Hygiene and Counterparty Turnaround with 95% Wilson intervals (withheld below ${report.conventions.minExchanges} exchanges) and enforces a ${report.conventions.cleanHandsFloorPct}% Clean-Hands Gate via RULE-INT-03 before RULE-INT-04 permits bilateral SLA renegotiation.`),
        ),
      ),
    }),
    card({
      title: 'Explicit Honesty Boundaries & Refusals',
      body: h(
        'div',
        { class: 'prose' },
        h(
          'ul',
          null,
          h('li', null, 'At ρ ≥ 100%, stationary GI/G/1 formulas do not exist; the engine flags structural instability rather than printing a fabricated wait.'),
          h('li', null, 'Unpriced pacts remain unpriced (null, never zero), and delay exposures in different currencies are never summed.'),
          h('li', null, 'Zero employee scoring: every utilization, rework, externality and compliance figure describes an organizational boundary, never an individual.'),
          h('li', null, 'CSV Scope #58 exports opaque positional codes (IF01..) and blanks proportions below the declared sample floor — zero names, titles, clauses or notes.'),
        ),
      ),
    }),
  );
}

export function renderInterfaces(ctx) {
  const activeKey = PANELS.some((p) => p.key === ctx.query.get('panel'))
    ? ctx.query.get('panel')
    : 'overview';
  const report = interfaceReport(ctx.state, ctx.now);

  const tabItems = PANELS.map((p) => ({
    ...p,
    count:
      p.key === 'pacts'
        ? report.summary.activePacts
        : p.key === 'audits'
          ? report.audits.length
          : undefined,
  }));

  let panelNode = null;
  if (activeKey === 'overview') panelNode = overviewPanel(ctx, report);
  else if (activeKey === 'network') panelNode = networkPanel(ctx, report);
  else if (activeKey === 'pacts') panelNode = pactsPanel(ctx, report);
  else if (activeKey === 'redesign') panelNode = redesignPanel(ctx, report);
  else if (activeKey === 'audits') panelNode = auditsPanel(ctx, report);
  else panelNode = methodPanel(report);

  return h(
    'div',
    { class: 'stack' },
    pageHeader({
      eyebrow: 'Cross-boundary systems · Queue networks · Relational contracts',
      title: 'Boundary & Interface Physics',
      subtitle:
        'Whitt/Jackson open queueing network, Naor congestion externalities, Conway/Team-Topologies mode alignment, and symmetric Clean-Hands Operating Pacts.',
      actions: [
        h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openPactDialog(ctx) }, 'New Operating Pact'),
        h(
          'button',
          {
            class: 'btn',
            type: 'button',
            onClick: () => {
              const res = ctx.api.scanInterfaces();
              if (!res?.ok) {
                toast(res?.error || 'Boundary scan failed.', 'bad');
                return;
              }
              toast(
                res.propagations?.length
                  ? `Scan propagated ${res.propagations.length} cross-module action(s).`
                  : 'Boundary scan complete — all pacts reconciled.',
                'good',
              );
              ctx.rerender();
            },
          },
          'Run boundary scan',
        ),
        h(
          'button',
          {
            class: 'btn btn-ghost',
            type: 'button',
            onClick: () => {
              downloadText(
                `leados-boundary-brief-${dayKey(ctx.now)}.txt`,
                interfaceBrief(report),
                'text/plain;charset=utf-8',
              );
              toast('Downloaded executive boundary brief.', 'good');
            },
          },
          'Export brief',
        ),
      ],
    }),
    tabs({
      items: tabItems,
      active: activeKey,
      ariaLabel: 'Boundary & Interface Physics panels',
      onSelect: (nextKey) => ctx.navigate(panelRoute(ctx, nextKey)),
    }),
    panelNode,
  );
}
