/**
 * app/views/survival.js — the Delivery Survival Terminal (`#/survival`).
 *
 * Four panels over one derived curve:
 *
 *   Queue      every open item, ranked by the frozen chance it finishes soon
 *   Classes    the Kaplan–Meier steps, the competing-risk incidence and the
 *              empirical hazard, class by class
 *   Readings   the predictions this workspace has frozen, and how they scored
 *   Method     the estimators, the assumptions and — prominently — the limits
 *
 * The page deliberately refuses more than it prints. A class below the at-risk
 * floor shows no probability; a curve that never reaches 50% says "not reached"
 * rather than extrapolating one; a reading with fewer than five settled items
 * withholds its skill score. Each refusal is written on the screen beside the
 * place the number would have been.
 */

import { h, toast } from '../ui/dom.js';
import {
  pageHeader, card, stat, badge, banner, tabs, emptyState, kv, barRow,
} from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { dayKey } from '../core/time.js';
import { DECOMP_VERDICT_LABELS, logRank, survivalReport } from '../core/domain/survival.js';
import { READING_STATUS_LABELS } from '../core/domain/survivalSchema.js';
import { openFreezeReadingDialog, openGradeReadingDialog, confirmDeleteReading } from '../ui/survival-modals.js';

const PANELS = [
  { key: 'queue', label: 'Queue' },
  { key: 'classes', label: 'Classes' },
  { key: 'readings', label: 'Readings' },
  { key: 'method', label: 'Method' },
];

const TONE = { bad: 'bad', warn: 'warn', caution: 'caution', good: 'good', neutral: 'neutral' };

function pct(value, dp = 1) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `${Number(value).toFixed(dp)}%`;
}

function days(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  return `${n} day${Math.abs(n) === 1 ? '' : 's'}`;
}

function ratio(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `${Number(value).toFixed(2)}×`;
}

function probabilityTone(probabilityPct, floorPct) {
  if (probabilityPct === null) return 'neutral';
  if (probabilityPct < floorPct) return 'bad';
  if (probabilityPct < 60) return 'warn';
  return 'good';
}

function selectedClass(ctx, report) {
  const key = ctx.query?.get?.('class') || '';
  const fromQuery = report.classes.find((row) => row.key === key);
  if (fromQuery) return fromQuery;
  return report.classes.find((row) => row.counts.total > 0) || report.classes[0];
}

function selectedReading(ctx, report) {
  const key = ctx.query?.get?.('reading') || '';
  const fromQuery = report.readings.find((row) => row.reading.id === key);
  if (fromQuery) return fromQuery;
  return report.readings[0] || null;
}

function navigate(ctx, panel, params = {}) {
  const query = new URLSearchParams({ panel });
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  ctx.navigate(`#/survival?${query.toString()}`);
}

/* ----------------------------------------------------------------- queue */

/**
 * The queue table is built explicitly rather than through the generic `table`
 * helper: the first cell carries a link and a sub-line, and a per-column
 * renderer would have to re-derive it. One `<td>` per `<th>` is asserted below
 * by construction.
 */
function queueTable(ctx, report) {
  const { conventions } = report;
  if (!report.openItems.length) return emptyState({ title: 'No open item exists yet' });
  const head = ['Item', 'Age', 'Class 50%', `P(finish ≤ ${conventions.horizonDays}d)`, 'At risk', 'Age percentile', 'Owner', 'Position'];
  const body = report.openItems.map((row) => {
    const cells = [
      h('td', { 'data-label': 'Item' },
        row.item.route ? h('a', { href: row.item.route }, row.item.title) : h('strong', null, row.item.title),
        h('div', { class: 'muted small' }, `${row.klass.label} · opened ${row.item.startedOn}`)),
      h('td', { 'data-label': 'Age', class: 'num' }, days(row.item.elapsedDays)),
      h('td', { 'data-label': 'Class 50%' }, row.klass.completionQuantile.reached ? days(row.klass.completionQuantile.days) : 'not reached'),
      h('td', { 'data-label': `P(finish ≤ ${conventions.horizonDays}d)` },
        row.reading.available
          ? badge(pct(row.reading.probabilityPct), probabilityTone(row.reading.probabilityPct, conventions.riskFloorPct))
          : badge('no reading', 'neutral', row.reading.reason || '')),
      h('td', { 'data-label': 'At risk', class: 'num' }, row.reading.atRisk === null || row.reading.atRisk === undefined ? '—' : String(row.reading.atRisk)),
      h('td', { 'data-label': 'Age percentile' },
        row.percentile && row.percentile.available
          ? badge(`${pct(row.percentile.percentile, 0)} slower`, row.percentile.percentile >= 90 ? 'bad' : row.percentile.percentile >= 75 ? 'warn' : 'good', `${row.percentile.sooner} of ${row.percentile.n} past exits were faster`)
          : badge('no comparison', 'neutral', row.percentile ? row.percentile.reason : '')),
      h('td', { 'data-label': 'Owner' }, row.item.ownerId ? 'Recorded' : 'Unassigned'),
      h('td', { 'data-label': 'Position' },
        row.pastMedian
          ? badge(`+${row.overdueBy}d past median`, row.overdueBy > conventions.horizonDays ? 'bad' : 'warn')
          : badge('inside the class', 'good')),
    ];
    return h('tr', null, ...cells);
  });
  return h('div', { class: 'table-wrap' },
    h('table', { class: 'table', 'aria-label': 'Open work items with elapsed age and conditional completion probability' },
      h('caption', { class: 'sr-only' }, 'Open work items, ranked by the conditional probability of finishing inside the horizon'),
      h('thead', null, h('tr', null, ...head.map((label) => h('th', { scope: 'col' }, label)))),
      h('tbody', null, ...body)));
}

/* --------------------------------------------------------------- classes */

function curveTable(klass) {
  const steps = klass.curve.steps;
  if (!steps.length) return emptyState({ title: 'No dated record in this class', body: 'Nothing has a start date here, so there is no curve and no reading.' });
  const head = ['Day', 'At risk', 'Completed', 'Abandoned', 'Censored', 'Survival', '95% band', 'Completion incidence', 'Incidence 95% band', 'Abandonment incidence'];
  const rows = steps.map((step) => h('tr', null,
    h('td', { 'data-label': 'Day', class: 'num' }, String(step.time)),
    h('td', { 'data-label': 'At risk', class: 'num' }, String(step.atRisk)),
    h('td', { 'data-label': 'Completed', class: 'num' }, String(step.completions)),
    h('td', { 'data-label': 'Abandoned', class: 'num' }, String(step.abandonments)),
    h('td', { 'data-label': 'Censored', class: 'num' }, String(step.censored)),
    h('td', { 'data-label': 'Survival', class: 'num' }, pct(step.survival * 100)),
    h('td', { 'data-label': '95% band', class: 'num' }, `${pct(step.lo * 100)}–${pct(step.hi * 100)}`),
    h('td', { 'data-label': 'Completion incidence', class: 'num' }, pct(step.cif * 100)),
    h('td', { 'data-label': 'Incidence 95% band', class: 'num' }, `${pct(step.cifLo * 100)}–${pct(step.cifHi * 100)}`),
    h('td', { 'data-label': 'Abandonment incidence', class: 'num' }, pct(step.cifA * 100))));
  return h('div', { class: 'table-wrap' },
    h('table', { class: 'table', 'aria-label': `Kaplan–Meier steps for ${klass.label}` },
      h('caption', { class: 'sr-only' }, `Kaplan–Meier product-limit steps for ${klass.label}, with the Greenwood log–log band and the Aalen–Johansen completion and abandonment incidences. Survival plus the two incidences sum to 100% at every step.`),
      h('thead', null, h('tr', null, ...head.map((label) => h('th', { scope: 'col' }, label)))),
      h('tbody', null, ...rows)));
}

const DECOMP_SENTENCES = Object.freeze({
  substitution: 'Work exits just as fast as before — it just is not finishing. By day 30 the recent cohort completes less and is abandoned more. No cycle-time view can see this, because exit speed did not change; what an exit *is* changed.',
  'completion-decline': 'By day 30, a smaller share of recent work has finished. The change is on the finishing side, not the dropping side — look for blockers and capacity, not intake.',
  'abandonment-rise': 'By day 30, a larger share of recent work has been abandoned. Finishing held; what changed is how much of what starts gets given up. Look at intake and triage.',
  stall: 'Both finishes and give-ups fell by day 30. Nothing is being dropped more — work is simply sitting open longer.',
  churn: 'Work exits faster both ways by day 30: more finishes and more give-ups. Faster is not the same as better; the give-ups are part of the speed.',
  'completion-gain': 'A larger share of recent work finishes by day 30 than the prior cohort managed.',
  'abandonment-decline': 'A smaller share of recent work is abandoned by day 30 than the prior cohort.',
  'broad-improvement': 'Recent work both finishes more and is abandoned less by day 30.',
  'no-attributable-shift': 'No tested component of the day-30 exit mix showed a significant change. An untested component cannot be assumed stable; consult the table and its refusals.',
});

function decompCard(selected) {
  const d = selected.decomp;
  const ppText = (value) => (value === null || value === undefined ? '—' : `${value > 0 ? '+' : ''}${(value * 100).toFixed(1)}pp`);
  if (!d || !d.available) {
    return card({
      title: 'Exit-mix decomposition — which exit moved?',
      subtitle: 'Day-30 cumulative incidence by cause, recent vs prior start cohort',
      body: h('p', { class: 'muted' }, d ? d.reason : 'Not computed for this class.'),
    });
  }
  const causeRow = (label, block) => {
    if (block.refused && block.prior === null) {
      return h('tr', null,
        h('td', { 'data-label': 'Outcome by day 30' }, label),
        h('td', { 'data-label': 'Prior cohort', class: 'num' }, `${block.events.prior} event(s)`),
        h('td', { 'data-label': 'Recent cohort', class: 'num' }, `${block.events.recent} event(s)`),
        h('td', { 'data-label': 'Change' }, badge('untested', 'neutral', block.reason)),
        h('td', { 'data-label': '95% CI', class: 'num' }, '—'),
        h('td', { 'data-label': 'Holm p', class: 'num' }, '—'));
    }
    return h('tr', null,
      h('td', { 'data-label': 'Outcome by day 30' }, label),
      h('td', { 'data-label': 'Prior cohort', class: 'num' }, pct(block.prior * 100)),
      h('td', { 'data-label': 'Recent cohort', class: 'num' }, pct(block.recent * 100)),
      h('td', { 'data-label': 'Change', class: 'num' }, ppText(block.delta)),
      h('td', { 'data-label': '95% CI', class: 'num' }, block.lo === null ? '—' : `${ppText(block.lo)} to ${ppText(block.hi)}`),
      h('td', { 'data-label': 'Holm p', class: 'num' }, block.adjustedP === null ? badge('untested', 'neutral', block.reason) : String(block.adjustedP)));
  };
  const tone = d.verdict === 'substitution' ? 'bad' : d.adverse ? 'warn' : d.favorable ? 'good' : 'neutral';
  const head = ['Outcome by day 30', 'Prior cohort', 'Recent cohort', 'Change', '95% CI', 'Holm p'];
  return card({
    title: 'Exit-mix decomposition — which exit moved?',
    subtitle: `Day-30 cumulative incidence by cause · recent n=${d.recentN} vs prior n=${d.priorN} · the three rows sum to 100% in each cohort`,
    body: h('div', { class: 'stack-sm' },
      h('div', { class: 'row-between' },
        h('strong', null, DECOMP_VERDICT_LABELS[d.verdict] || d.verdict),
        badge(d.verdict, tone)),
      h('p', null, DECOMP_SENTENCES[d.verdict] || ''),
      h('div', { class: 'table-wrap' },
        h('table', { class: 'table', 'aria-label': `Day-30 exit-mix decomposition for ${selected.label}` },
          h('caption', { class: 'sr-only' }, 'Aalen–Johansen cumulative incidence of completion and abandonment at day 30 for the recent and prior start cohorts, with the change in percentage points, its 95% interval and the Holm-adjusted landmark p-value. Still-open is the exact remainder.'),
          h('thead', null, h('tr', null, ...head.map((label) => h('th', { scope: 'col' }, label)))),
          h('tbody', null,
            causeRow('Completed', d.completion),
            causeRow('Abandoned', d.abandonment),
            h('tr', null,
              h('td', { 'data-label': 'Outcome by day 30' }, 'Still open (exact remainder)'),
              h('td', { 'data-label': 'Prior cohort', class: 'num' }, pct(d.stillOpen.prior * 100)),
              h('td', { 'data-label': 'Recent cohort', class: 'num' }, pct(d.stillOpen.recent * 100)),
              h('td', { 'data-label': 'Change', class: 'num' }, ppText(d.stillOpen.delta)),
              h('td', { 'data-label': '95% CI', class: 'num' }, '—'),
              h('td', { 'data-label': 'Holm p', class: 'num' }, '—'))))),
      h('p', { class: 'muted small' }, 'Landmark test on the day-30 incidence difference (Wald with delta-method variances; Fisher’s exact test at the 0%/100% boundary when both cohorts were fully observable), Holm-controlled across six classes × two causes per scan. The decomposition is exact: the change in “still open” is the completion change plus the abandonment change, with no remainder. It attributes a recorded shift; it does not explain it, and it is not a score about any person.')),
  });
}

function transportCard(selected) {
  const t = selected.transport;
  if (!t) return null;
  const ppText = (value) => (value === null || value === undefined ? '—' : `${value > 0 ? '+' : ''}${(value * 100).toFixed(1)}pp`);
  const toneFor = (status) => (status === 'undermined' ? 'bad' : status === 'favorable-shift' ? 'good' : status === 'supported' ? 'neutral' : 'warn');
  const cell = (block) => (!block || block.prior === null
    ? 'untested'
    : `${ppText(block.delta)}${block.adjustedP !== null && block.adjustedP !== undefined ? ` (Holm p=${block.adjustedP})` : ''}`);
  const landmarkRow = (row) => {
    if (!row?.available) {
      return h('tr', null,
        h('td', { 'data-label': 'Landmark' }, `Day ${row ? row.horizonDays : '—'}`),
        h('td', { 'data-label': 'Completed Δ (recent − prior)', class: 'num' }, '—'),
        h('td', { 'data-label': 'Abandoned Δ (recent − prior)', class: 'num' }, '—'),
        h('td', { 'data-label': 'Still open Δ', class: 'num' }, '—'),
        h('td', { 'data-label': 'Cohorts' }, row ? badge('refused', 'neutral', row.reason) : '—'));
    }
    return h('tr', null,
      h('td', { 'data-label': 'Landmark' }, `Day ${row.horizonDays}`),
      h('td', { 'data-label': 'Completed Δ (recent − prior)', class: 'num' }, cell(row.completion)),
      h('td', { 'data-label': 'Abandoned Δ (recent − prior)', class: 'num' }, cell(row.abandonment)),
      h('td', { 'data-label': 'Still open Δ', class: 'num' }, ppText(row.stillOpen.delta)),
      h('td', { 'data-label': 'Cohorts' }, `recent n=${row.recentN} · prior n=${row.priorN}`));
  };
  const byTau = new Map((selected.profile?.landmarks || []).map((row) => [row.horizonDays, row]));
  const head = ['Landmark', 'Completed Δ (recent − prior)', 'Abandoned Δ (recent − prior)', 'Still open Δ', 'Cohorts'];
  return card({
    title: 'Transport, decomposed — which numbers may still be read?',
    subtitle: 'Two axes over fixed start cohorts · landmarks 14 / 30 / 60 days · the pooled curve is never adjusted, only labelled',
    body: h('div', { class: 'stack-sm' },
      h('p', null,
        h('strong', null, 'Timing: '), badge(t.timing.status, toneFor(t.timing.status)), ' ', t.timing.basis, '.'),
      h('p', null,
        h('strong', null, 'Completion: '), badge(t.completion.status, toneFor(t.completion.status)), ' ', t.completion.basis, '.'),
      h('p', null, h('strong', null, 'Landmark shape: '), `${t.shapeLabel}.`),
      t.mix ? h('div', { class: 'stack-sm' },
        h('p', null, h('strong', null, 'Case-type overlap: '), badge(t.mix.challenged ? 'review' : t.mix.available ? 'no alert' : 'not assessed', t.mix.challenged ? 'warn' : 'neutral'), ' ', t.mix.reason),
        t.mix.available ? h('p', { class: 'small' }, ...Object.keys(t.mix.prior).map((kind) => `${kind}: prior ${t.mix.prior[kind]}/${t.mix.priorN}, recent ${t.mix.recent[kind]}/${t.mix.recentN} · `)) : null,
        h('p', { class: 'muted small' }, 'Current labels can have changed since intake. A 25 percentage-point total-variation difference or a recent type absent from the prior cohort triggers review; this is a descriptive convention, not a statistical test or proof of causal transport. Other work classes do not yet have a case-mix check.')) : null,
      h('div', { class: 'table-wrap' },
        h('table', { class: 'table', 'aria-label': `Multi-landmark exit-mix profile for ${selected.label}` },
          h('caption', { class: 'sr-only' }, 'Change in the Aalen–Johansen cumulative incidence of completion and abandonment between the recent and prior fixed start cohorts at the 14, 30 and 60 day landmarks, in percentage points, with Holm-adjusted landmark p-values. Day 30 is the primary decomposition; days 14 and 60 are the flanking profile.'),
          h('thead', null, h('tr', null, ...head.map((label) => h('th', { scope: 'col' }, label)))),
          h('tbody', null,
            landmarkRow(byTau.get(14)),
            landmarkRow(selected.decomp),
            landmarkRow(byTau.get(60))))),
      h('p', { class: 'muted small' }, 'Timing carries every still-open and waiting-cost figure; completion carries completion probabilities, the “50% complete by” quantile and overdue framing. Three Holm families run per scan — drift (6), day-30 decomposition (12), landmark profile (24) — each controlled within itself; joint control across families and across repeated scans is not claimed. This is a stability audit of a reference class, not causal transportability.')),
  });
}

function classesPanel(ctx, report) {
  const { conventions } = report;
  const selected = selectedClass(ctx, report);
  const list = card({
    title: 'Classes of dated work',
    subtitle: 'Each class is harvested from records you already keep. No estimate is invented and no undated record is assumed.',
    body: h('div', { class: 'stack-sm' },
      ...report.classes.map((klass) => barRow({
        label: `${klass.label} (${klass.counts.total})`,
        value: klass.completionQuantile.reached ? klass.completionQuantile.days : 0,
        hint: klass.completionQuantile.reached
          ? `50% complete by ${days(klass.completionQuantile.days)} · ${klass.counts.censored} censored · abandonment ${klass.abandonSharePct ?? '—'}%`
          : `50% never reached · ${klass.counts.censored} censored · abandonment ${klass.abandonSharePct ?? '—'}%`,
        onClick: () => navigate(ctx, 'classes', { class: klass.key }),
      }))),
  });

  const stats = h('div', { class: 'stat-grid' }, ...[
    stat({ label: 'Dated items', value: selected.counts.total, hint: `${selected.counts.censored} still open (censored, not dropped)` }),
    stat({ label: 'Completed', value: selected.counts.completed }),
    stat({ label: 'Abandoned', value: selected.counts.abandoned, tone: selected.counts.abandoned ? 'warn' : '', hint: 'a competing risk, not a censoring' }),
    stat({
      label: '50% completion',
      value: selected.completionQuantile.reached ? days(selected.completionQuantile.days) : 'not reached',
      hint: selected.completionQuantile.reached
        ? `bracket ${days(selected.completionQuantile.lo)}–${selected.completionQuantile.hi === null ? '∞' : days(selected.completionQuantile.hi)}`
        : 'the observed record never reaches 50%, so no date is printed',
    }),
    stat({
      label: 'Naive “eventually completes”',
      value: pct((1 - selected.curve.survivalAt(selected.curve.maxObservedDays)) * 100),
      hint: 'Kaplan–Meier all-cause survival, which treats abandonment as if it had not happened yet',
    }),
  ]);

  const detail = h('div', { class: 'view-stack' }, [
    stats,
    card({ title: 'Calendar-cohort transport check',
      subtitle: 'Fixed start cohorts · recent 30–89 days ago vs prior 90–149 · equal 30-day follow-up',
      body: h('div', { class: 'stack-sm' },
        h('p', null, selected.drift.available
          ? `Recent n=${selected.drift.recentN}, prior n=${selected.drift.priorN}. Restricted mean time to any exit: ${selected.drift.recentDays} vs ${selected.drift.priorDays} days (Δ ${selected.drift.deltaDays}). Holm-adjusted p=${selected.drift.adjustedP}. ${selected.drift.changed ? 'Shift detected: review whether historical forecasts still apply.' : 'No shift detected; this does not prove stability.'}`
          : selected.drift.reason),
        h('p', { class: 'muted small' }, 'Mantel–Cox log-rank; Holm correction across six work classes per scan, not across repeated scans. Abandonment counts as exit: faster is not necessarily better. Independence and comparable case mix are assumed; this is not a causal diagnosis.'),
        h('a', { href: '#/wait' }, 'Inspect financial exposure confidence')) }),
    decompCard(selected),
    transportCard(selected),
    banner({
      tone: 'info',
      title: 'Two numbers, on purpose',
      body: `“Eventually completes” is one minus the Kaplan–Meier survival on all exits — it counts an abandoned item as still on its way. The completion incidence is the Aalen–Johansen cumulative incidence, which treats abandonment as a competing risk. For ${selected.label.toLowerCase()} the gap is ${selected.abandonSharePct === null ? 'not measurable yet' : `${selected.abandonSharePct}% of exits`}, and the second number is the honest one.`,
    }),
    card({ title: `${selected.label} — product-limit steps`, subtitle: selected.unit, body: curveTable(selected) }),
    card({
      title: 'Empirical hazard by elapsed time',
      subtitle: 'Exits per 100 item-days at risk inside each bucket (Nelson–Aalen, differenced)',
      body: h('div', { class: 'stack-sm' },
        ...selected.hazard.buckets.map((bucket) => barRow({
          label: `${bucket.from}–${bucket.to ?? '∞'} days`,
          value: bucket.rate ?? 0,
          hint: `${bucket.events} exit(s) over ${bucket.exposure} item-day(s) at risk · ${bucket.rate === null ? 'no exposure' : `${bucket.rate} per 100 item-days`}`,
        })),
        selected.hazard.ratio
          ? banner({
            tone: selected.hazard.ratio.value >= 2 ? 'caution' : 'info',
            title: `Rate ratio ${selected.hazard.ratio.value} (95% CI ${selected.hazard.ratio.lo}–${selected.hazard.ratio.hi})`,
            body: selected.hazard.ratio.value >= 2
              ? `Exit is much more likely early than late. An item that has survived this long is less likely to exit next week, not more — so “it will close soon” is contradicted by your own record, and escalation is the cheaper option.`
              : 'The hazard does not fall sharply with age here, so waiting is not obviously the wrong strategy for this class. That is an answer too.',
          })
          : banner({
            tone: 'info',
            title: 'The hazard ratio cannot be computed',
            body: 'At least one bucket has no exits or no exposure. A rate ratio needs events at both ends; the crossing bucket counts are printed instead.',
          }),
      ),
    }),
    card({
      title: 'Declared effort against recorded actual effort',
      subtitle: 'Same unit only — a team-effort estimate is never divided by a calendar duration',
      body: selected.bias.available
        ? h('div', { class: 'stack-sm' },
          kv('Median actual ÷ declared', ratio(selected.bias.medianRatio)),
          kv('Pairs', String(selected.bias.n)),
          kv('Exact sign test', `p = ${selected.bias.p} · ${selected.bias.direction === 'over' ? 'systematically under-estimated' : 'no upward bias'}`),
          h('p', { class: 'muted small' }, 'This is the planning fallacy measured on your own record rather than cited from a survey. The sign test is exact and two-sided; below the declared floor nothing is printed.'))
        : h('p', { class: 'muted' }, selected.bias.reason),
    }),
    logRankCard(report, selected),
  ]);

  return h('div', { class: 'view-stack' }, [list, detail]);
}

function logRankCard(report, selected) {
  const others = report.harvest.items.filter((item) => item.kind !== selected.key);
  const group = (item) => (item.kind === selected.key ? selected.key : 'other');
  const test = logRank(report.harvest.items, group);
  const withEvidence = report.classes.filter((row) => row.evidenceFloorMet && row.counts.exits > 0);
  return card({
    title: 'Does this class survive longer than the rest?',
    subtitle: 'Mantel–Cox log-rank test on one degree of freedom',
    body: test
      ? h('div', { class: 'stack-sm' },
        kv('Observed exits in this class', `${test.observedA} vs ${test.expectedA} expected`),
        kv('χ²', `${test.chi2} · p = ${test.p}`),
        h('p', { class: 'muted small' }, (test.significant
          ? 'The difference is unlikely to be chance at the 5% level. '
          : 'The difference is consistent with chance at the 5% level. ')
          + `Other classes contribute ${others.length} item(s) to the comparison. Classes with evidence: ${withEvidence.map((row) => row.label).join(', ') || 'none yet'}. A log-rank test assumes independent censoring, which the Method panel states rather than proves.`))
      : h('p', { class: 'muted' }, 'The test needs exits in both groups; with no exit on one side there is no hazard to compare, and this page will not invent one.'),
  });
}

/* -------------------------------------------------------------- readings */

function frozenTable(reading, outcomes) {
  const head = ['Item', 'Age at freeze', 'Frozen probability', 'At risk', 'Outcome'];
  const rows = outcomes.map(({ prediction, verdict, tone }) => h('tr', null,
    h('td', { 'data-label': 'Item' },
      h('strong', null, prediction.title || prediction.sourceId),
      h('div', { class: 'muted small' }, `${prediction.classKey || prediction.kind} · ${prediction.sourceType}`)),
    h('td', { 'data-label': 'Age at freeze', class: 'num' }, days(prediction.elapsedDays)),
    h('td', { 'data-label': 'Frozen probability', class: 'num' }, pct(prediction.probabilityPct)),
    h('td', { 'data-label': 'At risk', class: 'num' }, prediction.atRisk === null || prediction.atRisk === undefined ? '—' : String(prediction.atRisk)),
    h('td', { 'data-label': 'Outcome' }, badge(verdict, tone))));
  return h('div', { class: 'table-wrap' },
    h('table', { class: 'table', 'aria-label': `Frozen predictions for ${reading.label}` },
      h('caption', { class: 'sr-only' }, 'Frozen per-item completion probability, the at-risk count it was conditioned on, and the graded outcome'),
      h('thead', null, h('tr', null, ...head.map((label) => h('th', { scope: 'col' }, label)))),
      h('tbody', null, ...rows)));
}

function readingsPanel(ctx, report) {
  const selected = selectedReading(ctx, report);
  const canFreeze = report.openItems.some((row) => row.reading.available);
  const header = card({
    title: 'Frozen readings',
    subtitle: 'A reading is computed once, from the records at that instant, and then graded on its own review date. It is never rewritten.',
    actions: [
      h('button', {
        class: 'btn btn-primary btn-small',
        type: 'button',
        onClick: () => {
          if (!canFreeze) {
            toast('No open item has a reading yet, so there is nothing to freeze.', 'caution');
            return;
          }
          openFreezeReadingDialog(ctx);
        },
      }, 'Freeze a reading'),
    ],
    body: report.readings.length
      ? h('div', { class: 'stack-sm' }, ...report.readings.map(({ reading, grade }) => h('div', {
        class: `stack-xs${selected && selected.reading.id === reading.id ? ' is-selected' : ''}`,
        style: { cursor: 'pointer' },
        onClick: () => navigate(ctx, 'readings', { reading: reading.id }),
      },
      h('div', { class: 'row-between' },
        h('strong', null, reading.label),
        badge(READING_STATUS_LABELS[reading.status] || reading.status, reading.status === 'graded' ? 'good' : 'caution')),
      h('div', { class: 'muted small' },
        `${(reading.predictions || []).length} prediction(s) · horizon ${reading.horizonDays}d · review ${reading.reviewOn || '—'}`
        + (grade.available ? ` · Brier ${grade.brier} vs base ${grade.baselineBrier}${grade.belowFloor ? ' (sample below the floor)' : ''}` : '')))))
      : emptyState({
        title: 'No reading has been frozen',
        body: 'A reading freezes the current per-item completion probabilities so that, on a chosen date, the workspace can score them against what actually happened. Without one, the curve can never be shown to be any good.',
      }),
  });

  if (!selected) return header;
  const { reading, grade } = selected;
  const outcomes = (reading.predictions || []).map((prediction) => {
    const outcome = prediction.outcome;
    let verdict = 'Unsettled';
    let tone = 'neutral';
    if (outcome && (outcome.completedOn || outcome.abandonedOn)) {
      if (outcome.abandonedOn) { verdict = 'Abandoned'; tone = 'bad'; }
      else if (reading.reviewOn && outcome.completedOn <= reading.reviewOn) { verdict = 'Completed in time'; tone = 'good'; }
      else { verdict = 'Completed late'; tone = 'warn'; }
    }
    return { prediction, verdict, tone };
  });

  const detail = h('div', { class: 'view-stack' }, [
    h('div', { class: 'stat-grid' }, ...[
      stat({ label: 'Frozen', value: reading.frozenOn || '—', hint: `sample n=${reading.curveDigest?.n ?? 0}` }),
      stat({ label: 'Horizon', value: days(reading.horizonDays) }),
      stat({ label: 'Review', value: reading.reviewOn || '—', hint: reading.status === 'graded' ? 'graded' : 'not yet graded' }),
      stat({
        label: 'Brier',
        value: grade.available ? String(grade.brier) : '—',
        hint: grade.available ? `base rate ${pct(grade.baseRatePct)} → ${grade.baselineBrier}` : grade.reason,
        tone: grade.available && grade.beatsBaseRate === false ? 'warn' : '',
      }),
      stat({
        label: 'Skill score',
        value: grade.available && !grade.belowFloor && grade.skillScore !== null ? String(grade.skillScore) : 'withheld',
        hint: grade.available
          ? (grade.belowFloor ? `needs five settled items; ${grade.settledCount} so far` : '1 − Brier ÷ base-rate Brier')
          : 'not graded',
      }),
    ]),
    card({
      title: 'What was frozen, and what happened',
      subtitle: 'Probabilities are read back exactly as stored. The outcome column is filled only by grading.',
      actions: [
        reading.status === 'frozen'
          ? h('button', {
            class: 'btn btn-primary btn-small',
            type: 'button',
            onClick: () => openGradeReadingDialog(ctx, reading),
          }, 'Grade now')
          : null,
        reading.status === 'frozen'
          ? h('button', {
            class: 'btn btn-ghost btn-small',
            type: 'button',
            onClick: () => confirmDeleteReading(ctx, reading),
          }, 'Delete')
          : null,
      ],
      body: frozenTable(reading, outcomes),
    }),
    card({
      title: 'How this reading is scored',
      body: h('div', { class: 'stack-sm' },
        h('p', { class: 'muted' }, 'Each frozen probability is scored with the Brier (1950) rule against whether the item actually completed on or before the review date. An abandoned item scores zero, because "it will finish" is exactly the claim that turned out to be false. The base-rate comparison is the same score with every item given the pooled completion rate.'),
        kv('Settled items', grade.available ? String(grade.settledCount) : '—'),
        kv('Hits / misses', grade.available ? `${grade.hits} / ${grade.misses}` : '—'),
        kv('Skill score', grade.available && !grade.belowFloor && grade.skillScore !== null ? String(grade.skillScore) : 'withheld'),
        h('p', { class: 'muted small' }, 'Below five settled items the skill score is withheld: a model that "beat" the base rate on four items has not demonstrated anything.'),
      ),
    }),
  ]);
  return h('div', { class: 'view-stack' }, [header, detail]);
}

/* ---------------------------------------------------------------- method */

function methodPanel(report) {
  const { conventions } = report;
  return h('div', { class: 'view-stack' }, [
    card({
      title: 'Estimators used, named',
      body: h('ul', { class: 'stack-sm' }, ...[
        h('li', null, h('strong', null, 'Kaplan & Meier (1958), product-limit estimator. '), 'Time-to-exit for each class of work, with open items right-censored at today rather than dropped.'),
        h('li', null, h('strong', null, 'Greenwood (1926) variance + Kalbfleisch & Prentice (2002) log–log transform. '), 'The band around the survival curve. The transform keeps the interval inside [0, 1], which the plain linear band does not.'),
        h('li', null, h('strong', null, 'Aalen & Johansen (1978), cumulative incidence. '), 'Completion as one of two competing risks. Abandonment is not censoring: treating it as censoring is what makes a queue look like it eventually empties.'),
        h('li', null, h('strong', null, 'Nelson (1972) / Aalen (1978), cumulative hazard. '), 'Differenced into elapsed-time buckets to show whether exit becomes more or less likely with age, with a Katz log-rate interval on the ratio.'),
        h('li', null, h('strong', null, 'Mantel (1966) / Cox (1972), log-rank test. '), 'Whether one class survives materially longer than the rest, on one degree of freedom.'),
        h('li', null, h('strong', null, 'Landmark incidence comparison at day 30 (Wald test, delta-method variances). '), 'The drift decomposition differences each cause’s cumulative incidence between the fixed start cohorts, so a slowdown is attributed to finishing less or giving up more instead of pooling both into “exit”. Holm step-down controls the six-class × two-cause family. The integrated curve difference of Pepe & Mori (1993) is computed as an effect size in incidence-days. Where an incidence sits exactly on 0% or 100% in both cohorts the Wald variance is zero and undefined as a test; if every item was observable for the full 30 days, Fisher’s (1935) exact test on the counts is used instead, and otherwise the cause is refused rather than given an invented p-value.'),
        h('li', null, h('strong', null, 'Multi-landmark profile and two-axis transport (Session 95). '), 'The same decomposition runs at 14 and 60 days on their own fixed cohorts (recent started τ–τ+59 days ago, prior τ+60–τ+119, follow-up capped at τ), one Holm family of 24. The pattern across landmarks is named as a shape — early-only, sustained, crossing, and so on — because a shift visible only at day 14 is a different operational fact from one that persists to day 60. Transport then reads two axes: timing (the any-exit log-rank) governs still-open and waiting-cost outputs; completion (the day-30 verdict) governs completion probabilities and the completion median. An axis failing means “stop quoting those outputs”, never “the curve was adjusted”. This is a descriptive stability audit of your reference class, not causal transportability in the Bareinboim–Pearl sense.'),
        h('li', null, h('strong', null, 'Brier (1950) proper scoring. '), 'The frozen reading is scored against the base rate, so "the curve is better than the pooled rate" is a measured claim rather than an assertion.'),
        h('li', null, h('strong', null, 'Kahneman & Tversky (1979) / Flyvbjerg (2006), reference class. '), 'The outside view is the class median from your own record. It is printed beside the inside view, never in place of it.'),
      ]),
    }),
    card({
      title: 'Conventions in force',
      body: h('div', { class: 'stack-sm' },
        kv('Forward horizon', days(conventions.horizonDays)),
        kv('At-risk floor for a reading', `${conventions.minAtRisk} item(s)`),
        kv('Owned work below', `${conventions.riskFloorPct}% completion probability`),
        kv('Class decision at', `${conventions.abandonSharePct}% abandonment share of exits`),
        kv('Paired-estimate floor', `${conventions.biasFloor} item(s)`),
        kv('Hazard buckets', `${conventions.hazardBuckets.join(', ')} days`),
        kv('Stale reading margin', days(conventions.staleDays)),
        kv('Automatic propagation', conventions.autoPropagate ? 'on' : 'paused (an explicit scan still runs)')),
    }),
    card({
      title: 'Assumptions, stated rather than assumed',
      body: h('ul', { class: 'stack-sm' }, ...[
        h('li', null, 'Censoring is assumed independent of outcome. A leader who abandons the slowest work first violates it. That is why abandonment is a competing risk here and not a censoring, and it is still not a complete correction — the class decision exists for exactly that reason.'),
        h('li', null, 'Items within a class are assumed exchangeable. A 30-day delay on an irreversible decision and a 30-day delay on a reversible one are pooled if both live in the decisions class. Narrowing the class is the fix, and the readings panel shows whether the pooled answer scored better than the base rate.'),
        h('li', null, 'A conditional probability past the longest observed duration is extrapolated. The page says so on the row rather than clipping silently.'),
        h('li', null, 'A same-day completion and a same-day abandonment both count at day zero, which is why the first step of a curve can move a long way on one item.'),
      ]),
    }),
    card({
      title: 'What this page refuses to do',
      body: h('ul', { class: 'stack-sm' }, ...[
        h('li', null, 'It does not score, rank or profile a person. A survival curve is a property of a class of work inside a system; the page never ranks team members by it, and no rule writes a judgement about anyone.'),
        h('li', null, 'It does not print a probability below the at-risk floor. "Unknown" is a finding; a percentage built on two surviving comparables is not.'),
        h('li', null, 'It does not extend a deadline, reassign work or close an item on your behalf. Every intervention it opens is owned work with a real owner, or it is not opened at all.'),
        h('li', null, 'It does not rewrite a frozen reading. The probabilities stay exactly as they were printed, including the ones that were wrong.'),
        h('li', null, 'It does not compare your durations to another company’s benchmark. There is no vendor dataset here and no external base rate — the outside view is your own record or nothing.'),
        h('li', null, 'It does not run Gray’s (1988) subdistribution-hazard test for the decomposition. That test’s variance under risk sets that retain work after a competing exit is not approximated here; the day-30 landmark test is used because its variance comes exactly from the estimator already on this page. A curve-wide difference that cancels by day 30 is therefore described by the integrated difference, not given a p-value it has not earned.'),
        h('li', null, 'It does not name a cause for a drift. The decomposition says whether finishing or giving up moved; why either moved is the question the review it opens is for.'),
      ]),
    }),
  ]);
}

/* ---------------------------------------------------------------- render */

export function renderSurvival(ctx) {
  const { state, now } = ctx;
  const report = survivalReport(state, now, state.settings || {});
  const requested = ctx.query?.get?.('panel') || 'queue';
  const panel = PANELS.some((row) => row.key === requested) ? requested : 'queue';

  const header = pageHeader({
    title: 'Delivery Survival',
    subtitle: 'Time-to-finish for every dated record you keep — censored honestly, with abandonment modelled as a competing risk.',
    actions: [
      stat({ label: 'Dated items', value: report.counts.items, hint: `${report.counts.undated} undated, excluded` }),
      stat({ label: 'Open', value: report.counts.open, hint: 'censored, never dropped' }),
      stat({ label: 'Abandoned', value: report.counts.abandoned, tone: report.counts.abandoned ? 'warn' : '' }),
      stat({
        label: `Below ${report.conventions.riskFloorPct}%`,
        value: report.openItems.filter((row) => row.reading.available && row.reading.probabilityPct < report.conventions.riskFloorPct).length,
        tone: 'warn',
        hint: `next ${report.conventions.horizonDays} days`,
      }),
      h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        onClick: () => {
          const result = ctx.api.scanSurvival();
          if (result && result.ok) {
            toast(result.changed ? 'Scan complete — catch-up work was written.' : 'Scan complete — nothing was missing.', result.changed ? 'good' : 'neutral');
          } else if (result && result.error) {
            toast(result.error, 'bad');
          }
        },
      }, 'Scan now'),
      h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        onClick: () => {
          const text = ctx.api.survivalBriefText();
          if (!downloadText({ filename: `leados-delivery-survival-${dayKey(now)}.txt`, text, mime: 'text/plain' })) {
            toast('Could not start the download. Use Data & export instead.', 'bad');
          }
        },
      }, 'Export brief'),
    ],
  });

  const tabBar = tabs({
    items: PANELS.map((row) => ({ key: row.key, label: row.label })),
    active: panel,
    ariaLabel: 'Delivery survival panels',
    onSelect: (key) => navigate(ctx, key, {
      class: key === 'classes' ? selectedClass(ctx, report).key : '',
      reading: key === 'readings' ? selectedReading(ctx, report)?.reading.id : '',
    }),
  });

  const notices = [];
  if (!report.counts.items) {
    notices.push(banner({
      tone: 'info',
      title: 'No dated record exists yet',
      body: 'This terminal reads the portfolio, cases, requisitions, org changes, delegations and decisions you already keep. Nothing here is invented: with no start dates there is no time at risk, and therefore no curve.',
      actions: [h('a', { class: 'btn btn-small btn-ghost', href: '#/cases' }, 'Open operational cases')],
    }));
  }

  const content = panel === 'classes'
    ? classesPanel(ctx, report)
    : panel === 'readings'
      ? readingsPanel(ctx, report)
      : panel === 'method'
        ? methodPanel(report)
        : h('div', { class: 'view-stack' }, [
          ...[
            report.openItems.some((row) => row.reading.available && row.reading.probabilityPct < report.conventions.riskFloorPct)
              ? banner({
                tone: 'bad',
                title: `${report.openItems.filter((row) => row.reading.available && row.reading.probabilityPct < report.conventions.riskFloorPct).length} item(s) are past the point where comparable work usually finishes`,
                body: `Each probability is conditional on the item having already survived this long, and is computed from your own closed records inside ${report.conventions.horizonDays} days. It is not a class average and not a verdict about anyone holding the work.`,
              })
              : null,
            report.counts.atRiskBelowFloor
              ? banner({
                tone: 'caution',
                title: `${report.counts.atRiskBelowFloor} item(s) have no reading at all`,
                body: `Below ${report.conventions.minAtRisk} comparable items still at risk, no probability is printed. The item's age is still a fact and is shown; the estimate would be a guess wearing a percentage.`,
              })
              : null,
          ].filter(Boolean),
          card({
            title: `Open items, ranked by the chance of finishing inside ${report.conventions.horizonDays} days`,
            subtitle: 'Kaplan–Meier with right-censoring; the conditional probability divides by survival at the item’s current age. The age percentile is an empirical share of past exits and is not a probability.',
            body: queueTable(ctx, report),
          }),
        ]);

  return h('div', { class: 'view-stack' }, [header, ...notices, tabBar, content]);
}

export default renderSurvival;
