/**
 * app/views/parity.js — the Leadership Parity & Standard Consistency Terminal
 * (`#/parity`, Schema v65, ADR-0054).
 *
 * Six accessible panels over the leader's own working records:
 *   Overview             Channel disparity cards, Lorenz curves & alerts
 *   Allocation & LMX     Gini / Atkinson / Theil (Variety vs Disparity) + per-person receipt ledger
 *   Promise ledger       Leader-owed commitments, Wilson 95% CIs & breach asymmetry
 *   Standard consistency Cross-concern bars, succession halo/overlooked bench & review Kendall τ_b
 *   Rebalance & audits   14-day counterfactual rebalancing solver + frozen parity audits
 *   Method               Named frameworks, statistical floors, privacy wall & refusals
 */

import { h, svg, toast, openModal, confirmDialog } from '../ui/dom.js';
import {
  pageHeader, card, stat, badge, banner, tabs, table, emptyState, kv,
} from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { dayKey } from '../core/time.js';
import { linksForEntity } from '../core/domain/cases.js';
import { PARITY_CHANNEL_KEYS } from '../core/domain/paritySchema.js';
import {
  parityReport,
  planParityRebalance,
} from '../core/domain/parity.js';
import {
  openFreezeParityAuditDialog,
  openGradeParityAuditDialog,
} from '../ui/parity-modals.js';

const PANELS = [
  { key: 'overview', label: 'Overview' },
  { key: 'allocation', label: 'Allocation & LMX' },
  { key: 'promises', label: 'Promise ledger' },
  { key: 'consistency', label: 'Standard consistency' },
  { key: 'rebalance', label: 'Rebalance & audits' },
  { key: 'method', label: 'Method' },
];

function fmtPct(v, dp = 1) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return '—';
  return `${Number(v).toFixed(dp)}%`;
}

function fmtNum(v, dp = 3) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return '—';
  return Number(v).toFixed(dp);
}

function navParity(ctx, panel, extra = {}) {
  const q = new URLSearchParams();
  q.set('panel', panel);
  for (const [k, v] of Object.entries(extra)) {
    if (v !== null && v !== undefined && v !== '') q.set(k, String(v));
  }
  ctx.navigate(`#/parity?${q.toString()}`);
}

/**
 * Accessible inline SVG Lorenz curve comparing cumulative team share (x) vs.
 * cumulative managerial capital share (y) against the 45-degree parity diagonal.
 */
function lorenzSvg(channel) {
  if (!channel.available || !channel.lorenz.length) return null;
  const w = 180;
  const ht = 110;
  const pad = 14;
  const plotW = w - pad * 2;
  const plotH = ht - pad * 2;
  const pts = channel.lorenz.map((p) => {
    const x = pad + (p.popPct / 100) * plotW;
    const y = ht - pad - (p.sharePct / 100) * plotH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const areaPts = `${pad},${ht - pad} ${pts} ${w - pad},${ht - pad}`;

  return svg('svg', {
    viewBox: `0 0 ${w} ${ht}`,
    width: String(w),
    height: String(ht),
    role: 'img',
    'aria-label': `Lorenz curve for ${channel.label}: corrected Gini ${channel.giniPct}%`,
    style: { display: 'block', maxWidth: '100%' },
  },
    svg('rect', { x: pad, y: pad, width: plotW, height: plotH, fill: 'none', stroke: 'currentColor', 'stroke-opacity': '0.18' }),
    svg('line', {
      x1: pad, y1: ht - pad, x2: w - pad, y2: pad,
      stroke: 'currentColor', 'stroke-opacity': '0.35', 'stroke-dasharray': '3,3',
    }),
    svg('polygon', { points: areaPts, fill: 'currentColor', 'fill-opacity': '0.08' }),
    svg('polyline', {
      points: pts,
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
    }),
  );
}

/* --------------------------------------------------------------- overview */

function overviewPanel(ctx, report) {
  const blocks = [];

  if (report.counts.eligiblePostRamp < report.conventions.minTeam) {
    blocks.push(banner({
      tone: 'info',
      title: `Inequality indices withheld below ${report.conventions.minTeam} post-ramp team members`,
      body: `Currently ${report.counts.activePeople} active person(s), of whom ${report.counts.eligiblePostRamp} have at least ${report.conventions.rampFloorDays} days on the roster. Raw per-person receipts and leader promises are still shown without computing Gini, Atkinson or Theil ratios on too small a denominator.`,
    }));
  } else if (report.counts.rampProtected > 0) {
    blocks.push(banner({
      tone: 'info',
      title: `${report.counts.rampProtected} recent joiner(s) protected by the ${report.conventions.rampFloorDays}-day ramp floor`,
      body: 'Early-ramp joiners are excluded from deficit flags so onboarding check-in intensity is not misread as peer favouritism, while 30-60-90 manager promises owed to them are still audited on the Promise Ledger.',
    }));
  }

  if (report.counts.fringe > 0) {
    blocks.push(banner({
      tone: 'bad',
      title: `${report.counts.fringe} post-ramp teammate(s) sit in the structural invisibility fringe`,
      body: 'They simultaneously have overdue or repeatedly skipped 1:1s, zero recorded SBI feedback, and zero stretch delegations or recognition inside the window while peers receive multi-channel investment.',
      actions: [h('a', { class: 'btn btn-small btn-ghost', href: '#/parity?panel=allocation' }, 'Inspect allocation')],
    }));
  }

  if (report.promises.asymmetric || report.promises.breachRows.length > 0) {
    blocks.push(banner({
      tone: 'caution',
      title: report.promises.asymmetric
        ? `Leader promise fulfillment varies by ${report.promises.promiseGapPp}pp across teammates`
        : `${report.promises.breachRows.length} teammate(s) wait on repeated overdue or carried leader commitments`,
      body: 'Psychological-contract breaches track what the leader promised and slipped on — never employee performance.',
      actions: [h('a', { class: 'btn btn-small btn-ghost', href: '#/parity?panel=promises' }, 'Open promise ledger')],
    }));
  }

  if (report.standardConsistency.inversionsCount > 0) {
    blocks.push(banner({
      tone: 'caution',
      title: `${report.standardConsistency.inversionsCount} intra-leader standard inversion(s) detected`,
      body: 'Evaluative thresholds across recovery plans, succession nominations or review ratings diverge from recorded evidence.',
      actions: [h('a', { class: 'btn btn-small btn-ghost', href: '#/parity?panel=consistency' }, 'Audit standards')],
    }));
  }

  const channelCards = PARITY_CHANNEL_KEYS.map((key) => {
    const ch = report.channels[key];
    return card({
      title: ch.label,
      subtitle: `${ch.code} · ${ch.unit}`,
      actions: [
        ch.available
          ? badge(ch.concentrated ? `Gini ${fmtPct(ch.giniPct)}` : `Gini ${fmtPct(ch.giniPct)}`, ch.concentrated ? 'warn' : 'good')
          : badge('withheld', 'neutral'),
      ],
      body: ch.available
        ? h('div', { class: 'stack-sm' },
            lorenzSvg(ch),
            kv('Corrected Gini / Atkinson (ε=0.5)', `${fmtPct(ch.giniPct)} / ${fmtPct(ch.atkinsonPct)}`, ch.concentrated ? 'warn' : ''),
            kv('Theil T total', fmtNum(ch.theil, 4)),
            kv('Within-cohort peer disparity (LMX Disparity)', `${fmtNum(ch.withinTheil, 4)} (${fmtPct(ch.withinSharePct)})`, (ch.withinSharePct ?? 0) >= 60 && ch.concentrated ? 'warn' : ''),
            kv('Between-cohort role/ramp variety (LMX Variety)', `${fmtNum(ch.betweenTheil, 4)} (${fmtPct(ch.betweenSharePct)})`),
            kv('Top-1 share / Zero-receipt count', `${fmtPct(ch.topOneSharePct)} · ${ch.zeroCount} with 0`),
          )
        : h('p', { class: 'muted small' }, ch.reason),
    });
  });

  blocks.push(card({
    title: 'Four currencies of managerial capital — never collapsed into one score',
    subtitle: `Window: ${report.windowStart} to ${report.today} (${report.conventions.windowDays} days, tenure-prorated per 30 active days).`,
    body: h('div', { class: 'grid-cards' }, ...channelCards),
  }));

  return h('div', { class: 'view-stack' }, ...blocks);
}

/* --------------------------------------------------------- allocation/LMX */

function allocationPanel(ctx, report) {
  const channelRows = PARITY_CHANNEL_KEYS.map((k) => report.channels[k]);
  const summaryCard = card({
    title: 'Channel inequality & additive Theil decomposition',
    subtitle: 'T = T_between (structural level × ramp variety) + T_within (unexplained within-peer disparity).',
    body: table({
      caption: 'Inequality and Theil entropy decomposition by leadership channel',
      rows: channelRows,
      columns: [
        { label: 'Channel', render: (c) => h('div', null, h('strong', null, c.label), h('div', { class: 'muted small' }, c.code)) },
        { label: 'Corrected Gini', render: (c) => c.available ? badge(fmtPct(c.giniPct), c.concentrated ? 'warn' : 'good') : badge('withheld', 'neutral', c.reason || '') },
        { label: 'Atkinson (ε=0.5)', render: (c) => c.available ? fmtPct(c.atkinsonPct) : '—' },
        { label: 'Theil T', render: (c) => c.available ? fmtNum(c.theil, 4) : '—' },
        { label: 'T_within (Disparity)', render: (c) => c.available ? `${fmtNum(c.withinTheil, 4)} (${fmtPct(c.withinSharePct)})` : '—' },
        { label: 'T_between (Variety)', render: (c) => c.available ? `${fmtNum(c.betweenTheil, 4)} (${fmtPct(c.betweenSharePct)})` : '—' },
        { label: 'Zero-receipt peers', render: (c) => `${c.zeroCount} / ${c.eligibleCount}` },
      ],
    }),
  });

  const fringeSet = new Set(report.fringeRows.map((r) => r.personId));
  const ledgerCard = card({
    title: 'Per-person leader allocation ledger (tenure-prorated per 30 active days)',
    subtitle: 'Describes what the leader delivered to each person — never a score of the person.',
    body: table({
      caption: 'Leader managerial capital receipts per active person',
      rows: report.personRows,
      emptyMessage: 'Add active team members to inspect leader allocation parity.',
      columns: [
        {
          label: 'Person & structural cohort',
          render: (r) => h('div', null,
            h('a', { href: `#/people/${encodeURIComponent(r.personId)}` }, r.name),
            h('div', { class: 'muted small' }, `${r.cohort} · ${r.activeDays}d in window`),
          ),
        },
        {
          label: 'Status',
          render: (r) => r.inEarlyRamp
            ? badge('Ramp-protected', 'neutral')
            : fringeSet.has(r.personId)
              ? badge('Structural fringe', 'bad')
              : badge('Post-ramp', 'good'),
        },
        {
          label: '1:1 presence',
          render: (r) => `${r.meetings.heldCount} held · ${r.meetings.skippedCount} skip · ${r.meetings.movedCount} moved (${r.units.coaching}/30d)`,
        },
        {
          label: 'SBI feedback',
          render: (r) => `${r.feedback.count} (${r.feedback.praiseCount}+ / ${r.feedback.constructiveCount}Δ · ${r.units.feedback}/30d)`,
        },
        {
          label: 'Stretch authority',
          render: (r) => `${r.delegations.stretchCount} stretch / ${r.delegations.count} total (${r.units.authority})`,
        },
        {
          label: 'Sponsorship',
          render: (r) => `${r.sponsorship.recognitionCount} rec · ${r.sponsorship.readinessRating} (${r.units.sponsorship})`,
        },
      ],
    }),
  });

  return h('div', { class: 'view-stack' }, summaryCard, ledgerCard);
}

/* -------------------------------------------------------- promise ledger */

function promisesPanel(ctx, report) {
  const p = report.promises;
  const stats = h('div', { class: 'stat-row' },
    stat({ label: 'Leader promises tracked', value: p.totalPromises, hint: `${p.totalDue} due or settled` }),
    stat({
      label: 'Fulfillment rate',
      value: p.overallFulfillmentPct !== null ? fmtPct(p.overallFulfillmentPct) : '—',
      hint: p.overallFulfillmentPct !== null ? `95% Wilson [${fmtPct(p.overallWilsonLowPct)}, ${fmtPct(p.overallWilsonHighPct)}]` : 'no due promises yet',
      tone: p.overallFulfillmentPct !== null && p.overallFulfillmentPct < 60 ? 'warn' : '',
    }),
    stat({
      label: 'Cross-person spread',
      value: p.promiseGapPp !== null ? `${p.promiseGapPp}pp` : 'withheld',
      hint: p.promiseGapPp !== null ? `${p.comparableCount} people with ≥2 due` : 'needs ≥2 people with ≥2 due',
      tone: p.asymmetric ? 'warn' : '',
    }),
    stat({
      label: 'Overdue open (leader)',
      value: p.totalOverdueOpen,
      hint: `${p.breachRows.length} breach-risk relationship(s)`,
      tone: p.totalOverdueOpen > 0 ? 'bad' : '',
    }),
  );

  const ledger = card({
    title: 'Leader promise reliability by person (Rousseau psychological-contract audit)',
    subtitle: 'Counts ONLY commitments owed by the leader (leader/shared 1:1 actions, 30-60-90 managerSupport, feedback follow-ups, and repeatedly deferred GROW reviews).',
    body: table({
      caption: 'Leader promise fulfillment and 95% Wilson score intervals by person',
      rows: p.rows,
      emptyMessage: 'No active team members recorded.',
      columns: [
        { label: 'Person', render: (r) => h('a', { href: `#/people/${encodeURIComponent(r.personId)}` }, r.name) },
        { label: 'Due / Total', render: (r) => `${r.duePromises} / ${r.totalPromises}` },
        { label: 'Fulfilled (on time)', render: (r) => `${r.fulfilledCount} (${r.fulfilledOnTime})` },
        {
          label: 'Fulfillment (95% Wilson CI)',
          render: (r) => r.fulfillmentPct !== null
            ? `${fmtPct(r.fulfillmentPct)} [${fmtPct(r.wilsonLowPct)}–${fmtPct(r.wilsonHighPct)}]`
            : 'withheld (0 due)',
        },
        { label: 'Overdue open', render: (r) => r.overdueOpen > 0 ? badge(String(r.overdueOpen), 'bad') : '0' },
        { label: 'Carried 2+ / Dropped', render: (r) => `${r.carriedTwicePlus} / ${r.droppedCount}` },
        { label: '1:1 skips', render: (r) => `${r.skippedMeetings} skip / ${r.heldMeetings} held` },
        { label: 'Contract status', render: (r) => r.breachRisk ? badge('Repair needed', 'bad') : badge('Steady', 'good') },
      ],
    }),
  });

  return h('div', { class: 'view-stack' }, stats, ledger);
}

/* -------------------------------------------------- standard consistency */

function consistencyPanel(ctx, report) {
  const { concerns, readiness, reviews } = report.standardConsistency;

  const concernCard = card({
    title: '1. Formal performance-plan threshold consistency (Leventhal consistency rule)',
    subtitle: 'Are formal recovery plans adopted at the same evidentiary floor across concerns?',
    actions: [
      concerns.available
        ? badge(concerns.inconsistent ? 'Unequal bar' : 'Consistent bar', concerns.inconsistent ? 'bad' : 'good')
        : badge('withheld', 'neutral'),
    ],
    body: h('div', { class: 'stack-sm' },
      concerns.available
        ? h('p', { class: 'small' },
            `Across ${concerns.adoptedCount} adopted plans: pre-adoption observations ranged ${concerns.minObservations}–${concerns.maxObservations} (MAD ${concerns.obsMad}), assessment span range ${concerns.daysRange ?? '—'} days, written overrides ${concerns.overrideCount}/${concerns.adoptedCount}.`)
        : h('p', { class: 'muted small' }, concerns.reason),
      concerns.records.length
        ? table({
            caption: 'Evidentiary bar recorded prior to formal plan adoption',
            rows: concerns.records,
            columns: [
              { label: 'Concern', render: (r) => h('a', { href: `#/performance?panel=plan&concern=${encodeURIComponent(r.concernId)}` }, r.concernId) },
              { label: 'Adopted on', render: (r) => r.adoptedOn },
              { label: 'Pre-plan observations', render: (r) => `${r.observationsAtAdoption} (${r.distinctDatesAtAdoption} dates)` },
              { label: 'Assessment days', render: (r) => r.assessmentDays !== null ? `${r.assessmentDays}d` : '—' },
              { label: 'Supports / 2-way voice', render: (r) => `${r.supportsAtAdoption} / ${r.twoWayBeforeAdoption ? 'yes' : 'no'}` },
              { label: 'Gate override', render: (r) => r.overrideUsed ? badge('Written override', 'warn') : badge('Full gate met', 'good') },
            ],
          })
        : null,
    ),
  });

  const readinessRows = [
    ...readiness.haloNominations.map((r) => ({ ...r, kind: 'Halo nomination', detail: `Nominated ${r.rating} with ${r.evidenceCount}/5 behavioural signals` })),
    ...readiness.overlookedBench.map((r) => ({ ...r, kind: 'Overlooked bench', detail: `Unnominated despite ${r.evidenceCount}/5 behavioural signals` })),
  ];
  const readinessCard = card({
    title: '2. Succession sponsorship vs. behavioural evidence',
    subtitle: 'Compares ready-now / ready-later nominations against the 5-signal behavioural rubric.',
    actions: [
      readiness.available
        ? badge(readiness.inversionCount ? `${readiness.inversionCount} inversion(s)` : 'Aligned', readiness.inversionCount ? 'warn' : 'good')
        : badge('withheld', 'neutral'),
    ],
    body: !readiness.available
      ? h('p', { class: 'muted small' }, readiness.reason)
      : table({
          caption: 'Succession nomination vs behavioural evidence inversions',
          rows: readinessRows,
          emptyMessage: 'No halo nominations or overlooked 4/5+ bench members detected.',
          columns: [
            { label: 'Finding', render: (r) => badge(r.kind, r.kind === 'Halo nomination' ? 'warn' : 'caution') },
            { label: 'Person', render: (r) => h('a', { href: `#/people/${encodeURIComponent(r.personId)}` }, r.name) },
            { label: 'Evidence vs status', render: (r) => r.detail },
            { label: 'Action', render: () => h('a', { href: '#/readiness' }, 'Open succession') },
          ],
        }),
  });

  const reviewCard = card({
    title: '3. Performance review evidence-to-rating concordance (Kendall’s τ_b & recency check)',
    subtitle: 'Tests whether recorded ratings invert captured goal, delegation and SBI evidence within comparable cohorts, and flags >65% final-quarter recency weighting.',
    actions: [
      reviews.available
        ? badge(`τ_b = ${reviews.tauB}`, reviews.discordantPairs.length ? 'warn' : 'good')
        : badge('withheld', 'neutral'),
    ],
    body: h('div', { class: 'stack-sm' },
      reviews.available
        ? h('p', { class: 'small' }, `Rated reviews: ${reviews.ratedCount} · Concordant pairs: ${reviews.concordant} · Discordant pairs: ${reviews.discordant} · Cohort inversions: ${reviews.discordantPairs.length} · Recency-heavy (>65% final quarter): ${reviews.recencyBiasedCount}.`)
        : h('p', { class: 'muted small' }, reviews.reason),
      reviews.reviews.length
        ? table({
            caption: 'Rated performance reviews and period evidence distribution',
            rows: reviews.reviews,
            columns: [
              { label: 'Review', render: (r) => h('a', { href: `#/reviews/${encodeURIComponent(r.reviewId)}` }, r.personName || r.reviewId) },
              { label: 'Level', render: (r) => r.level || 'unclassified' },
              { label: 'Rating', render: (r) => r.rating },
              { label: 'Evidence items', render: (r) => `${r.evidenceCount} (${r.positiveCount}+ / ${r.constructiveCount}Δ)` },
              { label: 'Composite evidence', render: (r) => String(r.evidenceScore) },
              { label: 'Final-quarter share', render: (r) => r.recencySharePct !== null ? badge(fmtPct(r.recencySharePct), r.recencyBiased ? 'warn' : 'neutral') : 'withheld (<3 dated)' },
            ],
          })
        : null,
    ),
  });

  return h('div', { class: 'view-stack' }, concernCard, readinessCard, reviewCard);
}

/* -------------------------------------------------- rebalance & audits */

function rebalancePanel(ctx, report) {
  const budgetParam = Number(ctx.query?.get('budget') || 4);
  const budget = [2, 4, 6, 8].includes(budgetParam) ? budgetParam : 4;
  const plan = planParityRebalance(ctx.state, ctx.now, { hourBudget: budget });
  const focusedAuditId = ctx.query?.get('audit') || null;
  const audits = Array.isArray(ctx.state.parityAudits) ? ctx.state.parityAudits : [];
  const today = dayKey(ctx.now);

  const budgetButtons = [2, 4, 6, 8].map((b) => h('button', {
    type: 'button',
    class: `btn btn-small ${b === budget ? 'btn-primary' : 'btn-ghost'}`,
    'aria-pressed': b === budget ? 'true' : 'false',
    onClick: () => navParity(ctx, 'rebalance', { budget: b, audit: focusedAuditId }),
  }, `${b}h / 14d`));

  const plannerCard = card({
    title: 'Counterfactual 14-day rebalancing planner',
    subtitle: 'Greedy marginal solver ranking concrete leader moves by reduction in within-cohort Theil disparity, overdue leader promises and standard inversions per hour.',
    actions: budgetButtons,
    body: h('div', { class: 'stack-sm' },
      h('div', { class: 'stat-row' },
        stat({ label: 'Hours allocated', value: `${plan.hoursPlanned}h / ${plan.hourBudget}h`, hint: `${plan.chosen.length} move(s) selected` }),
        stat({ label: 'Mean T_within (before → after)', value: `${plan.before.withinTheilMean ?? '—'} → ${plan.after.withinTheilMean ?? '—'}` }),
        stat({ label: 'Overdue promises (before → after)', value: `${plan.before.overdueLeaderPromises} → ${plan.after.overdueLeaderPromises}` }),
        stat({ label: 'Inversions (before → after)', value: `${plan.before.inversionsCount} → ${plan.after.inversionsCount}` }),
      ),
      table({
        caption: `Recommended rebalancing moves within ${plan.hourBudget} leader hours`,
        rows: plan.chosen,
        emptyMessage: 'No disparity, promise-breach or standard-inversion moves needed right now.',
        columns: [
          { label: 'Move', render: (m) => h('a', { href: m.route }, m.title) },
          { label: 'Hours', render: (m) => `${m.hours}h` },
          { label: 'Why selected', render: (m) => m.rationale },
        ],
      }),
    ),
  });

  const auditsCard = card({
    title: 'Frozen parity & consistency audits',
    subtitle: report.calibration.brierMean !== null
      ? `${report.calibration.gradedCount} graded · Mean Brier score ${report.calibration.brierMean}`
      : report.calibration.brierWithheldReason,
    actions: [
      h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => openFreezeParityAuditDialog(ctx) }, 'Freeze parity audit'),
    ],
    body: audits.length === 0
      ? emptyState({
          title: 'No parity audit frozen yet',
          body: 'Freeze today’s LMX disparity, promise reliability and standard-consistency baseline with a future review date to test whether your rebalancing commitments actually land.',
          action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openFreezeParityAuditDialog(ctx) }, 'Freeze first audit'),
        })
      : table({
          caption: 'Frozen and graded parity audits',
          rows: audits,
          columns: [
            {
              label: 'Audit',
              render: (a) => h('div', null,
                h('strong', null, a.id === focusedAuditId ? `▸ ${a.label}` : a.label),
                a.commitment ? h('div', { class: 'muted small' }, a.commitment) : null,
                (() => {
                  const linked = linksForEntity(ctx.state, 'parity', a.id);
                  return linked.length
                    ? h('div', { class: 'muted small' }, `${linked.length} linked cross-module record(s)`)
                    : null;
                })(),
              ),
            },
            { label: 'Frozen → Review', render: (a) => `${a.frozenOn} → ${a.reviewOn}` },
            { label: 'Baseline snapshot', render: (a) => `T_w=${a.withinTheilMean ?? '—'} · fringe=${a.fringeCount} · overdue=${a.overdueLeaderPromises} · inv=${a.inversionsCount}` },
            {
              label: 'Status / Grade',
              render: (a) => a.status === 'graded' && a.grade
                ? badge(`${a.grade.improved ? 'Improved' : 'Missed'}${a.grade.brier !== null ? ` · Brier ${a.grade.brier}` : ''}`, a.grade.improved ? 'good' : 'warn')
                : badge(a.reviewOn <= today ? 'Due to grade' : 'Frozen', a.reviewOn <= today ? 'caution' : 'neutral'),
            },
            {
              label: 'Actions',
              render: (a) => a.status === 'graded'
                ? h('span', { class: 'muted small' }, `Graded ${a.grade?.gradedOn || ''}`)
                : h('div', { class: 'row-gap' },
                    a.reviewOn <= today
                      ? h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => openGradeParityAuditDialog(ctx, a) }, 'Grade')
                      : h('span', { class: 'muted small' }, `Opens ${a.reviewOn}`),
                    h('button', {
                      class: 'btn btn-small btn-ghost',
                      type: 'button',
                      onClick: () => confirmDialog({
                        title: `Delete ungraded audit “${a.label}”?`,
                        message: 'Graded audits cannot be deleted; ungraded frozen audits can be removed if declared in error.',
                        confirmLabel: 'Delete',
                        danger: true,
                        onConfirm: () => {
                          const res = ctx.api.deleteParityAudit(a.id);
                          if (res.ok) toast('Audit deleted', 'good');
                          else toast(res.error || 'Could not delete audit.', 'bad');
                        },
                      }),
                    }, 'Delete'),
                  ),
            },
          ],
        }),
  });

  return h('div', { class: 'view-stack' }, plannerCard, auditsCard);
}

/* --------------------------------------------------------------- method */

function methodPanel(report) {
  return card({
    title: 'Method, cross-domain estimators & hard refusals',
    subtitle: 'Grades the leader’s allocation, promises and threshold consistency — never an employee. This is not legal advice.',
    body: h('div', { class: 'prose small' },
      h('h3', null, 'Named frameworks & exact formulas'),
      h('ul', null,
        h('li', null, 'Finite-sample-corrected Gini (Gini 1912) — G = min(1, G_raw · n/(n−1)), correcting downward bias on small teams so complete single-person monopoly equals 100%.'),
        h('li', null, 'Zero-safe Atkinson inequality index at ε = 0.5 (Atkinson 1970) — A_0.5 = 1 − (1/μ)·((1/n)∑√x_i)², remaining exact when channel receipts contain zeros.'),
        h('li', null, 'Additive Theil T entropy decomposition (Theil 1967; Buengeler, Piccolo & Locklear 2021) — T = T_between + T_within across recorded level × ramp cohorts, separating structural role/onboarding scaffolding (LMX Variety) from unexplained within-peer skew (LMX Disparity).'),
        h('li', null, 'Psychological Contract Promise Ledger (Rousseau 1989, 1995; Wilson 1927) — tracks only leader-owed promises with 95% Wilson score intervals so a 1/1 record is never misread as certainty.'),
        h('li', null, 'Intra-Leader Standard Consistency & Noise Audit (Kahneman, Sibony & Sunstein 2021; Leventhal 1980; Kendall 1938 τ_b) — tests whether recovery plan adoptions, succession nominations and review ratings invert recorded evidence.'),
        h('li', null, 'Brier (1950) Verification — frozen parity audits score declared improvement probabilities once after reviewOn; mean Brier is withheld below 5 graded probability-bearing audits.'),
      ),
      h('h3', null, 'Hard privacy & statistical refusals'),
      h('ul', null,
        h('li', null, `Inequality indices refused below ${report.conventions.minTeam} post-ramp team members or when channel volume is zero.`),
        h('li', null, `Joiners under ${report.conventions.rampFloorDays} days on the roster are protected from deficit flags while their 30-60-90 manager promises remain audited.`),
        h('li', null, 'Cross-concern threshold dispersion refused below 2 adopted formal plans; review Kendall τ_b refused below 3 rated reviews.'),
        h('li', null, 'Confidential conflict records and anonymous pulse responses are never read by this module or its post-commit rules.'),
        h('li', null, 'Zero protected demographic attributes are stored, requested or inferred. Not legal or HR compliance advice.'),
      ),
    ),
  });
}

/* ----------------------------------------------------------- entry point */

export function renderParity(ctx) {
  const report = parityReport(ctx.state, ctx.now);
  const requested = ctx.query?.get('panel') || 'overview';
  const activePanel = PANELS.some((p) => p.key === requested) ? requested : 'overview';

  const header = pageHeader({
    eyebrow: 'GRADE THE LEADER’S CONSISTENCY · NEVER THE TEAM',
    title: 'Leadership parity & standard consistency',
    subtitle: 'LMX disparity decomposition, leader promise reliability, and intra-leader evidentiary consistency across your own dated records.',
    actions: [
      h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        onClick: () => {
          const text = ctx.api.parityBriefText();
          if (!downloadText({ filename: `leados-parity-brief-${report.today}.txt`, text, mime: 'text/plain' })) {
            const modal = openModal({
              title: 'Copy leadership parity brief (no names)',
              body: h('textarea', { readOnly: true, rows: 16, 'aria-label': 'Leadership parity brief' }, text),
              footer: [h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => modal.close() }, 'Close')],
            });
          } else {
            toast('No-names parity brief downloaded.', 'good');
          }
        },
      }, 'Export brief'),
      h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        onClick: () => openFreezeParityAuditDialog(ctx),
      }, 'Freeze audit'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const res = ctx.api.scanParity();
          if (!res.ok) {
            toast(res.error || 'Parity scan failed.', 'bad');
            return;
          }
          toast(res.changed ? 'Parity scan propagated follow-through across modules.' : 'Parity scan complete — follow-through already up to date.', 'good');
        },
      }, 'Run parity scan'),
    ],
  });

  const stats = h('div', { class: 'stat-row' },
    stat({ label: 'Post-ramp team', value: report.counts.eligiblePostRamp, hint: `${report.counts.activePeople} active (${report.counts.rampProtected} ramp-protected)` }),
    stat({ label: 'Mean within-cohort Theil', value: report.withinTheilMean !== null ? fmtNum(report.withinTheilMean, 4) : 'withheld', hint: `${report.counts.concentratedChannels} concentrated channel(s)`, tone: report.counts.concentratedChannels > 0 ? 'warn' : '' }),
    stat({ label: 'Structural fringe', value: report.counts.fringe, hint: '0 feedback + 0 stretch + weak 1:1', tone: report.counts.fringe > 0 ? 'bad' : '' }),
    stat({ label: 'Overdue leader promises', value: report.counts.overdueLeaderPromises, hint: report.promises.promiseGapPp !== null ? `${report.promises.promiseGapPp}pp team spread` : 'promise ledger', tone: report.counts.overdueLeaderPromises > 0 ? 'warn' : '' }),
    stat({ label: 'Standard inversions', value: report.counts.inversions, hint: 'plans, bench & reviews', tone: report.counts.inversions > 0 ? 'warn' : '' }),
  );

  const tabBar = tabs({
    items: PANELS,
    active: activePanel,
    ariaLabel: 'Leadership parity sections',
    onSelect: (key) => navParity(ctx, key),
  });

  const body = activePanel === 'allocation'
    ? allocationPanel(ctx, report)
    : activePanel === 'promises'
      ? promisesPanel(ctx, report)
      : activePanel === 'consistency'
        ? consistencyPanel(ctx, report)
        : activePanel === 'rebalance'
          ? rebalancePanel(ctx, report)
          : activePanel === 'method'
            ? methodPanel(report)
            : overviewPanel(ctx, report);

  return h('div', { class: 'page view-stack' }, header, stats, tabBar, body);
}
