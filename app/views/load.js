/**
 * app/views/load.js — the Cognitive Load & Attention Governor (`#/load`).
 *
 * Session 52, Schema v34. Four tabs in the order a leader needs to act:
 *   Board        → who is saturated right now, and which component of load
 *                  is doing it (intrinsic effort, switching, coordination)
 *   Queues       → per-person Little's Law / Kingman congestion math from
 *                  recorded throughput — counts-only until evidence exists
 *   Coordination → Brooks channels, strong-tie degree, stewardship and span
 *   Policy       → the thresholds and weights the leader owns, in plain words
 *
 * Every mutation goes through the validated `ctx.api`; this file renders and
 * explains, it does not decide. Propagation counts in toasts come from the
 * store's post-commit results, so the leader sees what one click caused.
 */

import { h, toast } from '../ui/dom.js';
import {
  pageHeader, card, stat, badge, banner, emptyState, tabs, table, kv,
} from '../ui/components.js';
import { progressBar } from '../ui/charts.js';
import { downloadText } from '../ui/download.js';
import { dayKey } from '../core/time.js';
import {
  LOAD_BAND_LABELS,
  LOAD_COORDINATION_BUDGET,
  LOAD_KINGMAN_VARIABILITY,
  LOAD_MIN_CYCLE_SAMPLES,
  LOAD_MIN_THROUGHPUT_SAMPLES,
  LOAD_WEIGHTS,
  loadBrief,
  loadSignals,
  buildLoadReport,
} from '../core/domain/load.js';

const TABS = [
  { key: 'board', label: 'Saturation board' },
  { key: 'queues', label: 'Queue lab' },
  { key: 'coordination', label: 'Coordination tax' },
  { key: 'policy', label: 'Policy' },
];
const TAB_KEYS = new Set(TABS.map((t) => t.key));

function bandTone(band) {
  if (band === 'overloaded' || band === 'saturated') return 'bad';
  if (band === 'elevated') return 'warn';
  if (band === 'managed') return 'info';
  return 'good';
}

function propagationToast(prefix, res) {
  const n = Array.isArray(res?.propagations) ? res.propagations.length : 0;
  toast(n ? `${prefix} ${n} follow-up${n === 1 ? '' : 's'} propagated automatically (see Signals).` : prefix, 'good');
}

function pct(value, digits = 0) {
  return value === null || value === undefined ? '—' : `${(value * 100).toFixed(digits)}%`;
}

/* ------------------------------------------------------------------ board */

function scoreBar(label, value) {
  return h('div', { class: 'view-stack', style: 'gap:2px' },
    h('span', { class: 'muted small' }, `${label} ${value}/100`),
    progressBar(value, { label, tone: value >= 80 ? 'bad' : value >= 65 ? 'warn' : 'neutral' }));
}

function boardTab(ctx, report) {
  const sorted = [...report.people].sort((a, b) => b.index - a.index || a.personId.localeCompare(b.personId));
  const rows = sorted.map((p) => ({
    person: h('span', null,
      h('a', { href: `#/people/${p.personId}` }, p.name),
      p.bottleneck ? ' ' : null,
      p.bottleneck ? badge('System constraint', 'bad') : null,
      p.germane.ramping ? ' ' : null,
      p.germane.ramping ? badge('Ramping', 'info') : null),
    band: badge(LOAD_BAND_LABELS[p.band], bandTone(p.band)),
    index: h('strong', null, String(p.index)),
    load: h('div', { class: 'view-stack', style: 'gap:2px;min-width:180px' },
      scoreBar('Effort economics', p.scores.utilization),
      scoreBar('Switching (WIP)', p.scores.wip),
      scoreBar('Coordination', p.scores.coordination),
      scoreBar('Other commitments', p.scores.commitments)),
    overload: p.mc.overloadProbability === null
      ? h('span', { class: 'muted small' }, 'no measured effort')
      : h('span', { class: p.mc.flagged ? 'text-bad' : '' }, pct(p.mc.overloadProbability)),
    wip: `${p.queue.wip}/${p.queue.wipLimit}${p.queue.wip > p.queue.wipLimit ? ' ⚠' : ''}`,
    confidence: badge(p.confidence === 'high' ? 'High confidence' : p.confidence === 'medium' ? 'Medium' : 'Counts only',
      p.confidence === 'high' ? 'good' : p.confidence === 'medium' ? 'warn' : 'neutral'),
  }));

  const unquantified = report.people.filter((p) => p.effort.unquantifiedCount > 0);
  const germane = report.people.filter((p) => p.germane.ramping || p.germane.growthPlanCount > 0);

  return h('div', { class: 'view-stack' },
    card({
      title: 'Per-person cognitive saturation',
      subtitle: 'Sweller (1988), operationalised by Skelton & Pais Team Topologies: intrinsic effort, extraneous switching and coordination, with germane learning load reported separately and never penalised. The index is a transparent four-part blend — weights are on the Policy tab.',
      body: table({
        caption: 'Cognitive saturation across the active roster',
        columns: [
          { label: 'Person', render: (r) => r.person },
          { label: 'Band', render: (r) => r.band },
          { label: 'Index', render: (r) => r.index },
          { label: 'Component scores', render: (r) => r.load },
          { label: 'P(overload)', render: (r) => r.overload },
          { label: 'WIP vs limit', render: (r) => r.wip },
          { label: 'Confidence', render: (r) => r.confidence },
        ],
        rows,
      }),
    }),
    unquantified.length
      ? card({
        title: 'Unquantified commitments — counted, never sampled as zero',
        body: h('div', { class: 'view-stack' },
          ...unquantified.map((p) => h('p', { class: 'small' },
            `${p.name}: ${p.effort.unquantifiedCount} open funded commitment(s) have no measured PERT effort estimate, so the Monte Carlo excludes them. Add estimates in Capacity & flow to close the gap.`))),
      })
      : null,
    germane.length
      ? card({
        title: 'Germane load — learning being carried (protected, not penalised)',
        body: h('div', { class: 'view-stack' },
          ...germane.map((p) => h('p', { class: 'small' },
            `${p.name}: ${[
              p.germane.ramping ? `ramping (${p.germane.rampKey}, availability factor ${p.germane.rampFactor})` : null,
              p.germane.growthPlanCount ? `${p.germane.growthPlanCount} active growth plan(s)` : null,
              p.germane.traineeStewardships ? `${p.germane.traineeStewardships} trainee stewardship(s)` : null,
            ].filter(Boolean).join('; ')}.`))),
      })
      : null,
    card({
      title: 'How to read the bands',
      body: h('div', { class: 'view-stack' },
        h('p', { class: 'small' }, 'Headroom (under 40), Managed (40–64), Elevated (65 to your threshold), Saturated (threshold to 94) and Overloaded (95+). A saturated band means the system is asking one person to hold more than the recorded structure supports — it is not a performance rating and never will be. A short, deliberate spike can read as elevated; sustained saturation is the design failure Team Topologies warns about.'),
        h('p', { class: 'small muted' }, 'The Monte Carlo draws Beta-PERT effort for each measured open commitment against the person’s own ramp-adjusted supply (same seeded engine as the Capacity terminal). Queue statistics on the next tab need completed work before they say anything.')),
    }),
  );
}

/* ------------------------------------------------------------------ queues */

function queuesTab(ctx, report) {
  const rows = [...report.people]
    .sort((a, b) => b.queue.wip - a.queue.wip || a.personId.localeCompare(b.personId))
    .map((p) => ({
      person: h('a', { href: `#/people/${p.personId}` }, p.name),
      wip: `${p.queue.wip} (limit ${p.queue.wipLimit})`,
      throughput: p.queue.throughputPerWeek === null ? '—' : `${p.queue.throughputPerWeek}/week`,
      medianCycle: p.queue.medianCycleDays === null ? '—' : `${p.queue.medianCycleDays}d`,
      rho: p.queue.rho === null ? '—' : p.queue.unstable ? badge('Unstable (ρ≥1)', 'bad') : p.queue.rho.toFixed(2),
      expectedWait: p.queue.unstable
        ? badge('Queue unstable — no finite wait', 'bad')
        : p.queue.waitWeeks === null
          ? h('span', { class: 'muted small' }, `counts only (n=${p.queue.samples})`)
          : `~${p.queue.waitWeeks} week(s)`,
      evidence: badge(p.queue.confidence === 'high'
        ? `Learned (n=${p.queue.samples})`
        : p.queue.confidence === 'provisional'
          ? `Provisional (n=${p.queue.samples})`
          : `Counts only (n=${p.queue.samples})`,
        p.queue.confidence === 'high' ? 'good' : p.queue.confidence === 'provisional' ? 'warn' : 'neutral'),
    }));

  return h('div', { class: 'view-stack' },
    card({
      title: 'Per-person queue congestion',
      subtitle: `Little's Law (1961): cycle time = WIP ÷ throughput. Kingman's formula: expected wait ≈ (ρ/(1−ρ))·c·cycle, with c=${LOAD_KINGMAN_VARIABILITY} as the house variability convention, shared with Capacity & flow. Measured over each person's own completed items in the last ${report.policy.windowWeeks} weeks.`,
      body: table({
        caption: 'Queueing statistics per person',
        columns: [
          { label: 'Person', render: (r) => r.person },
          { label: 'Open WIP', render: (r) => r.wip },
          { label: 'Throughput', render: (r) => r.throughput },
          { label: 'Median cycle', render: (r) => r.medianCycle },
          { label: 'Utilisation ρ', render: (r) => r.rho },
          { label: 'Expected wait', render: (r) => r.expectedWait },
          { label: 'Evidence', render: (r) => r.evidence },
        ],
        rows,
      }),
    }),
    card({
      title: 'What the queue lab will and will not say',
      body: h('div', { class: 'view-stack' },
        h('p', { class: 'small' }, `Fewer than ${LOAD_MIN_CYCLE_SAMPLES} completed items in the window: no rate exists yet, so every wait is counts-only. At ${LOAD_MIN_CYCLE_SAMPLES}–${LOAD_MIN_THROUGHPUT_SAMPLES - 1} completions the wait is provisional. From ${LOAD_MIN_THROUGHPUT_SAMPLES} it is treated as learned. When utilisation reaches ρ≥1 the queue is mathematically unstable — Kingman's formula has no finite answer, which is itself the finding: incoming work matches or exceeds this person's recorded capacity.`),
        h('p', { class: 'small muted' }, 'Throughput counts operating-plan items only — delegations and cases have their own ledgers and averaging them would produce a rate describing neither. WIP uses the same unit convention as the Capacity & flow terminal.'),
      ),
    }),
  );
}

/* ------------------------------------------------------------ coordination */

function coordinationTab(ctx, report) {
  const t = report.team;
  const rows = [...report.people]
    .sort((a, b) => b.coordination.rawCoordination - a.coordination.rawCoordination || a.personId.localeCompare(b.personId))
    .map((p) => ({
      person: h('span', null,
        h('a', { href: `#/people/${p.personId}` }, p.name),
        p.bottleneck ? ' ' : null,
        p.bottleneck ? badge('Constraint', 'bad') : null),
      strongTies: String(p.coordination.strongTieDegree),
      criticalStewardships: p.coordination.criticalStewardships
        ? badge(String(p.coordination.criticalStewardships), 'bad') : '0',
      otherStewardships: String(p.coordination.otherStewardships),
      directReports: String(p.coordination.directReports),
      rawLoad: `${p.coordination.rawCoordination} / ${LOAD_COORDINATION_BUDGET}`,
      score: p.scores.coordination,
    }));

  return h('div', { class: 'view-stack' },
    h('div', { class: 'stat-grid' },
      stat({ label: 'Active people', value: t.activeCount, hint: 'Roster size used below' }),
      stat({ label: 'Brooks channels n(n−1)/2', value: t.brooksChannels, hint: 'Communication paths if everyone coordinates with everyone' }),
      stat({ label: 'Strong-tie network density', value: `${Math.round(t.networkDensity * 100)}%`, hint: 'From the Influence Network backbone' }),
      stat({
        label: 'Team WIP vs limit',
        value: `${t.totalWip}/${t.totalWipLimit}`,
        hint: t.wipBreach ? 'Team WIP convention breached' : 'Within convention',
        tone: t.wipBreach ? 'warn' : '',
      })),
    card({
      title: 'Extraneous load per person',
      subtitle: 'Critical-dependency primary stewardship counts double; other stewardships, strong-tie degree and 1.5 per direct report sum to a raw coordination count, scored against the policy-tab budget.',
      body: table({
        caption: 'Coordination and stewardship load per person',
        columns: [
          { label: 'Person', render: (r) => r.person },
          { label: 'Strong ties', render: (r) => r.strongTies },
          { label: 'Critical stewardships', render: (r) => r.criticalStewardships },
          { label: 'Other stewardships', render: (r) => r.otherStewardships },
          { label: 'Direct reports', render: (r) => r.directReports },
          { label: 'Raw / budget', render: (r) => r.rawLoad },
          { label: 'Score', render: (r) => r.score },
        ],
        rows,
      }),
    }),
    card({
      title: 'Why coordination is load, not prestige',
      body: h('div', { class: 'view-stack' },
        h('p', { class: 'small' }, 'Brooks (1975): every added person adds communication channels before they add output, which is why staffing a late system can make it later. Goldratt (1997): the single most saturated person is the system constraint — relieving anyone else cannot raise throughput. The Influence Network terminal explains where the ties come from; this tab prices their cognitive cost.'),
        h('p', { class: 'small muted' }, "Stewardship overlaps with the Operational Resilience terminal by design: resilience owns single-dependency SPOFs and cross-training, while this terminal counts total stewardship as one component of a person's whole load. No cross-training delegation is created here."),
      ),
    }),
  );
}

/* ------------------------------------------------------------------ policy */

function policyTab(ctx, report) {
  const satInput = h('input', {
    type: 'number', min: 50, max: 100, step: 1, value: report.policy.saturationPct,
    'aria-label': 'Saturation threshold percent', style: 'max-width:120px',
  });
  const probInput = h('input', {
    type: 'number', min: 50, max: 99, step: 1, value: report.policy.overloadProbPct,
    'aria-label': 'Monte Carlo overload probability threshold percent', style: 'max-width:120px',
  });
  const windowInput = h('input', {
    type: 'number', min: 4, max: 26, step: 1, value: report.policy.windowWeeks,
    'aria-label': 'Throughput window in weeks', style: 'max-width:120px',
  });
  const autoInput = h('input', { type: 'checkbox', 'aria-label': 'Automatic load propagation' });
  autoInput.checked = report.policy.autoPropagate;

  return h('div', { class: 'view-stack' },
    card({
      title: 'Load policy',
      subtitle: 'Conventions you own, applied consistently. The WIP convention itself is shared with Capacity & flow and is edited there.',
      body: h('div', { class: 'view-stack' },
        h('label', { class: 'small' }, 'Saturation threshold (index that enters the saturated band): ', satInput),
        h('p', { class: 'muted small' }, 'Default 80. Lower it to get earlier warnings; raise it only if the bands cry wolf on measured, short spikes.'),
        h('label', { class: 'small' }, 'Monte Carlo overload action threshold (P%): ', probInput),
        h('p', { class: 'muted small' }, `When P(overload) crosses this inside the WIP limit, RULE-LOAD-03 treats the problem as commitment SIZE rather than switching. Default 80.`),
        h('label', { class: 'small' }, 'Throughput window (weeks): ', windowInput),
        h('p', { class: 'muted small' }, 'How far back per-person completed items measure throughput and cycle time. 4–26 weeks; default 8.'),
        h('label', { class: 'small' }, autoInput, ' Automatic propagation (RULE-LOAD-01..04). Pausing stops new decisions and talking points; an explicit scan still runs, and every measurement tab keeps working.'),
        h('div', null, h('button', {
          class: 'btn btn-primary', type: 'button',
          onClick: () => {
            const res = ctx.api.setLoadPolicy({
              saturationPct: Number(satInput.value),
              overloadProbPct: Number(probInput.value),
              windowWeeks: Number(windowInput.value),
              autoPropagate: autoInput.checked,
            });
            if (res.ok) { toast('Load policy saved', 'good'); ctx.refresh(); } else toast(res.error, 'bad');
          },
        }, 'Save policy'))),
    }),
    card({
      title: `The saturation index, with nothing hidden (weights sum to 1)`,
      body: h('div', { class: 'view-stack' },
        kv('Effort economics (intrinsic)', `weight ${LOAD_WEIGHTS.utilization} — measured PERT effort vs ramp-adjusted allocatable supply`),
        kv('Switching (extraneous, WIP)', `weight ${LOAD_WEIGHTS.wip} — open funded commitments vs the WIP convention; twice the limit is the maximum`),
        kv('Coordination (extraneous)', `weight ${LOAD_WEIGHTS.coordination} — stewardships, strong-tie degree and span vs a budget of ${LOAD_COORDINATION_BUDGET}`),
        kv('Other commitments', `weight ${LOAD_WEIGHTS.commitments} — active delegations and open owned cases vs a budget of 6`),
        h('p', { class: 'muted small' }, 'Germane (learning) load never enters the index: onboarding, growth plans and trainee stewardship are reported on the Board tab and protected by RULE-LOAD-04. There is no hidden model, no machine learning and no personnel rating anywhere in this terminal.')),
    }),
    card({
      title: 'Fixed guardrails (not settings)',
      body: h('p', { class: 'small' }, `Queue statistics are counts-only below ${LOAD_MIN_CYCLE_SAMPLES} completions and learned only from ${LOAD_MIN_THROUGHPUT_SAMPLES}. Commitments without measured effort are counted but never Monte-Carlo-sampled as zero. The Monte Carlo is deterministic for the shared simulation seed (Settings) and uses each person's independent stream. Nothing is reassigned, deferred or hired automatically: RULE-LOAD-01 opens a DACI decision and a human makes it.`),
    }),
  );
}

/* ------------------------------------------------------------------ view */

export function renderLoad(ctx) {
  const tab = TAB_KEYS.has(ctx.query.get('tab')) ? ctx.query.get('tab') : 'board';
  const report = buildLoadReport(ctx.state, ctx.now);
  const signals = loadSignals(ctx.state, ctx.now);

  if (report.empty) {
    return h('div', { class: 'view-stack' },
      pageHeader({
        eyebrow: 'Cognitive load governor',
        title: 'Can one mind hold all of this?',
        subtitle: 'Saturation measured from the records you already keep — commitments, WIP, stewardships, collaboration structure and ramp — with Little/Kingman queue waits and a deterministic overload probability.',
      }),
      emptyState({
        icon: '⏳',
        title: 'No active people in the roster yet',
        body: 'Add the team in People, record funded work in Capacity & flow and stewardships in Operational resilience. The Governor then measures cognitive load per person without any calendar or message monitoring.',
        action: h('a', { class: 'btn btn-primary', href: '#/people' }, 'Add your team'),
      }));
  }

  const signalCards = signals.map((s) => banner({
    tone: s.severity >= 3 ? 'warn' : 'info',
    title: s.title,
    body: s.detail,
    actions: s.action ? [h('a', { class: 'btn btn-ghost', href: s.action.route }, s.action.label)] : [],
  }));

  const bottleneck = report.team.bottleneckId
    ? report.people.find((p) => p.personId === report.team.bottleneckId) : null;

  const body = tab === 'board'
    ? boardTab(ctx, report)
    : tab === 'queues'
      ? queuesTab(ctx, report)
      : tab === 'coordination'
        ? coordinationTab(ctx, report)
        : policyTab(ctx, report);

  return h('div', { class: 'view-stack' },
    pageHeader({
      eyebrow: 'Cognitive load governor',
      title: 'Can one mind hold all of this?',
      subtitle: 'Role load, not performance ratings: a transparent saturation index, seeded Monte Carlo overload probability and per-person queueing science — local-first, surveillance-free, with every weight named.',
      actions: [
        h('button', {
          class: 'btn btn-ghost', type: 'button',
          onClick: () => {
            const res = ctx.api.scanLoad();
            if (res.ok) { propagationToast('Load scan complete.', res); ctx.refresh(); } else toast(res.error || 'Scan failed', 'bad');
          },
        }, 'Run load scan'),
        h('button', {
          class: 'btn btn-ghost', type: 'button',
          onClick: () => {
            const ok = downloadText({
              filename: `leados-cognitive-load-${dayKey(ctx.now)}.txt`,
              text: loadBrief(ctx.state, ctx.now),
              mime: 'text/plain;charset=utf-8',
            });
            toast(ok ? 'Brief downloaded' : 'Download was not available in this browser', ok ? 'good' : 'bad');
          },
        }, 'Download brief'),
      ],
    }),
    report.policy.autoPropagate
      ? null
      : banner({
        tone: 'warn',
        title: 'Automatic load propagation is paused',
        body: 'Measurement still works, but RULE-LOAD-01..04 will not open decisions or talking points until you resume it in the Policy tab. An explicit scan still runs.',
        actions: [h('a', { class: 'btn btn-ghost', href: '#/load?tab=policy' }, 'Open policy')],
      }),
    h('div', { class: 'stat-grid' },
      stat({
        label: 'Saturated or overloaded',
        value: report.team.saturatedOrWorse,
        hint: `of ${report.team.activeCount} active people`,
        tone: report.team.saturatedOrWorse ? 'warn' : '',
      }),
      stat({ label: 'Mean saturation index', value: report.team.meanIndex ?? '—', hint: '0–100 across the roster' }),
      stat({
        label: 'WIP breaches',
        value: report.totals.wipBreaches,
        hint: `Team WIP ${report.team.totalWip}/${report.team.totalWipLimit}`,
        tone: report.totals.wipBreaches ? 'warn' : '',
      }),
      stat({
        label: 'Monte Carlo flags',
        value: report.totals.mcFlags,
        hint: `P(overload) ≥ ${report.policy.overloadProbPct}%`,
        tone: report.totals.mcFlags ? 'warn' : '',
      }),
      stat({
        label: 'System constraint',
        value: bottleneck ? bottleneck.name.split(' ')[0] : 'None',
        hint: bottleneck ? `index ${bottleneck.index} — Goldratt bottleneck` : 'No measured load yet',
      })),
    signalCards.length ? h('div', { class: 'view-stack' }, ...signalCards) : null,
    tabs({
      items: TABS.map((t) => ({
        ...t,
        count: t.key === 'board' ? report.team.saturatedOrWorse : t.key === 'queues' ? report.totals.wipBreaches : undefined,
      })),
      active: tab,
      onSelect: (key) => ctx.navigate(`#/load?tab=${key}`),
      ariaLabel: 'Cognitive load governor sections',
    }),
    body);
}
