/**
 * app/views/watch.js — the Early-Warning Watch (`#/watch`).
 *
 * Five tabs in the order a leader actually uses them:
 *   Queue      → signals waiting for a verdict (the only place work is created)
 *   Scan       → every monitored series, its chart, its p value and its rank
 *   Forecasts  → the frozen predictions and how they scored out of sample
 *   Calibration→ what the detector has earned: precision and skill
 *   Policy     → the conventions, the rule catalogue and the α table
 *
 * Rendering and explaining only. Every mutation goes through `ctx.api`; the
 * post-commit spine owns cross-module propagation.
 */

import { h, toast } from '../ui/dom.js';
import {
  pageHeader, card, stat, badge, banner, emptyState, tabs, table,
} from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import {
  EW_ENGINE_VERSION,
  EW_MIN_VERDICTS,
  EW_RULE_IDS,
  EW_STATUS_LABELS,
  EW_SUPPRESSION_REASONS,
  EW_VERDICT_LABELS,
  buildWatchReport,
  nominalAlpha,
  normalCdf,
  watchBrief,
  watchSignals,
} from '../core/domain/earlyWarning.js';
import { openVerdictDialog, openWatchPolicyDialog } from '../ui/watch-modals.js';

const TABS = [
  { key: 'queue', label: 'Queue' },
  { key: 'scan', label: 'Scan' },
  { key: 'forecasts', label: 'Forecast ledger' },
  { key: 'calibration', label: 'Calibration' },
  { key: 'policy', label: 'Policy & rules' },
];
const TAB_KEYS = new Set(TABS.map((t) => t.key));

const fmt = (v, d = 2) => (v === null || v === undefined || !Number.isFinite(Number(v))
  ? '—'
  : new Intl.NumberFormat('en-US', { maximumFractionDigits: d }).format(Number(v)));
const pct = (v, d = 0) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : `${(Number(v) * 100).toFixed(d)}%`);

function statusBadge(status) {
  const tone = status === 'confirmed' ? 'bad'
    : status === 'false-alarm' ? 'warn'
      : status === 'open' ? 'caution'
        : status === 'suppressed' ? 'neutral'
          : 'info';
  return badge(EW_STATUS_LABELS[status] || status, tone);
}

function copyBrief(ctx) {
  const text = watchBrief(ctx.state, ctx.now);
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => toast('Brief copied', 'good'))
      .catch(() => toast('Copy failed — use Download instead', 'bad'));
  } else {
    toast('Clipboard unavailable — use Download instead', 'bad');
  }
}

function downloadBrief(ctx) {
  const ok = downloadText({
    filename: `leados-early-warning-${ctx.now.toISOString().slice(0, 10)}.md`,
    text: watchBrief(ctx.state, ctx.now),
    mime: 'text/markdown',
  });
  if (!ok) toast('This browser blocked the download — use Copy instead', 'bad');
}

/* ------------------------------------------------------------------ queue */

function queueTab(ctx, report) {
  const open = report.queue;
  const judged = report.alerts.filter((a) => ['confirmed', 'false-alarm', 'explained', 'dismissed'].includes(a.status));
  const suppressed = report.alerts.filter((a) => a.status === 'suppressed');

  const queueBody = open.length
    ? h('div', { class: 'view-stack' }, ...open.map((alert) => h(
      'article',
      { class: 'card', 'aria-labelledby': `ew-${alert.id}` },
      h('div', { class: 'row row-between row-wrap' },
        h('div', null,
          h('h3', { id: `ew-${alert.id}`, class: 'card-title' }, `${alert.label} · ${alert.rule}`),
          h('p', { class: 'muted small' },
            `Detected ${alert.detectedOn} · open ${alert.ageDays} day(s) · series p ${fmt(alert.pValue, 4)} · `
            + `BH rank ${alert.bhRank ?? '—'} of ${alert.m ?? '—'} at q ${alert.q ?? '—'}`)),
        h('div', { class: 'row' },
          statusBadge(alert.status),
          h('button', {
            class: 'btn btn-primary btn-small',
            type: 'button',
            onClick: () => openVerdictDialog(ctx, alert),
          }, 'Record verdict'))),
      h('p', { class: 'small' }, alert.summary || ''),
      h('p', { class: 'muted small' },
        `Value ${fmt(alert.latestValue)} · centre ${fmt(alert.mean)} · natural limits ${fmt(alert.lnpl)}–${fmt(alert.unpl)}`
        + (alert.frozen
          ? ` · frozen next week ${fmt(alert.frozen.point)} (${fmt(alert.frozen.lo)}–${fmt(alert.frozen.hi)}) due ${alert.frozen.dueOn}`
          : ' · no frozen prediction')),
      alert.ageDays > report.scan.policy.triageDays
        ? banner({
          tone: 'warn',
          title: 'Past the triage deadline',
          body: 'One DACI decision has been opened for this alert. An untriaged signal is not neutral — it teaches you to ignore the next one.',
        })
        : null,
    )))
    : emptyState({
      icon: '✓',
      title: 'No signal is waiting for you',
      body: report.scan.testedCount
        ? `The scan tested ${report.scan.testedCount} series at q = ${report.scan.policy.q} and promoted nothing the false-discovery procedure did not reject. That is not proof of stability — it is the absence of a claim.`
        : 'No monitored series can be reconstructed yet. Record dated cases, decisions, 1:1s, feedback, recognition or pulse responses and the watch will start testing them.',
    });

  return h('div', { class: 'view-stack' },
    card({
      title: `Waiting for a verdict (${open.length})`,
      subtitle: 'A p value creates nothing. Your verdict is the only trigger for a case, a decision or a note.',
      body: queueBody,
    }),
    suppressed.length
      ? card({
        title: `Suppressed candidates (${suppressed.length})`,
        subtitle: 'Recorded, not hidden: the statistics fired and a governor stopped it from reaching you.',
        body: table({
          caption: 'Candidates suppressed by the alert budget, a per-series cooldown or the noisy-series rule',
          columns: [
            { label: 'Series', render: (r) => r.label },
            { label: 'Date', render: (r) => r.detectedOn },
            { label: 'Reason', render: (r) => EW_SUPPRESSION_REASONS[r.suppressedReason] || r.suppressedReason },
            { label: 'Series p', render: (r) => fmt(r.pValue, 4) },
            { label: 'BH rank', render: (r) => `${r.bhRank ?? '—'} of ${r.m ?? '—'}` },
          ],
          rows: suppressed,
        }),
      })
      : null,
    judged.length
      ? card({
        title: `Judged alerts (${judged.length})`,
        subtitle: 'Append-only. A verdict can never be edited, which is what makes the precision figure worth reading.',
        body: table({
          caption: 'Alerts with a recorded human verdict',
          columns: [
            { label: 'Series', render: (r) => r.label },
            { label: 'Detected', render: (r) => r.detectedOn },
            { label: 'Verdict', render: (r) => statusBadge(r.status) },
            { label: 'Rule', render: (r) => r.rule || '—' },
            { label: 'Scored', render: (r) => (r.scoredForecast.scored
              ? `model ${fmt(r.scoredForecast.absErrorModel)} vs naive ${fmt(r.scoredForecast.absErrorNaive)}`
              : (r.scoredForecast.reason === 'pending' ? 'pending' : 'never scored')) },
            { label: 'Case', render: (r) => (r.linkedCaseId ? h('a', { class: 'link', href: `#/cases/${encodeURIComponent(r.linkedCaseId)}` }, 'Open case') : '—') },
          ],
          rows: judged,
        }),
      })
      : null,
  );
}

/* ------------------------------------------------------------------- scan */

function scanTab(ctx, report) {
  const scan = report.scan;
  const testedIds = scan.series.filter((x) => x.hasChart).map((x) => x.id);
  const rejectedIds = new Set(scan.fdr.rejected.map((i) => testedIds[i]));
  const rows = scan.series.map((s) => {
    let outcome = 'No special-cause signal';
    if (!s.hasChart) outcome = 'Not reconstructable';
    else if (s.strongestRule && rejectedIds.has(s.id) && s.strongestPolarity === 'adverse') outcome = 'Promoted or governed';
    else if (s.strongestRule) outcome = `${s.strongestRule} (${s.strongestPolarity})`;
    return { ...s, outcome };
  });
  return h('div', { class: 'view-stack' },
    card({
      title: 'The scan',
      subtitle: 'Every monitored series, tested together. Multiple testing is the reason one chart is not surveillance.',
      body: h('div', { class: 'view-stack' },
        h('div', { class: 'stats-row' },
          stat({ label: 'Series tested', value: scan.testedCount, hint: `${scan.unavailable} not reconstructable` }),
          stat({ label: 'False-discovery target', value: fmt(scan.policy.q, 2), hint: `expected false discoveries ≤ ${fmt(scan.fdr.expectedFalseDiscoveries, 2)}` }),
          stat({ label: 'Step-up cutoff', value: scan.fdr.threshold === null ? '—' : `p ≤ ${fmt(scan.fdr.threshold, 4)}`, hint: `${scan.fdr.rejected.length} of ${scan.fdr.m} rejected` }),
          stat({ label: 'Promoted today', value: scan.promotions.length, hint: `${scan.suppressions.length} suppressed` }),
          stat({ label: 'Budget', value: `${scan.budget.used}/${scan.budget.cap}`, hint: `last ${scan.budget.windowDays} days` })),
        h('p', { class: 'small' }, scan.fdrMethod),
        table({
          caption: 'Monitored series with their control-chart values, nominal p and Benjamini–Hochberg rank',
          columns: [
            { label: 'Series', render: (r) => r.label },
            { label: 'Latest', render: (r) => (r.hasChart ? `${fmt(r.latestValue)} · ${r.latestDate}` : '—') },
            { label: 'Centre', render: (r) => fmt(r.mean) },
            { label: 'Natural limits', render: (r) => (r.hasChart ? `${fmt(r.lnpl)}–${fmt(r.unpl)}` : '—') },
            { label: 'Strongest rule', render: (r) => r.strongestRule || '—' },
            { label: 'Polarity', render: (r) => (r.strongestPolarity || '—') },
            { label: 'Series p', render: (r) => (r.hasChart ? fmt(r.pValue, 4) : '—') },
            { label: 'Outcome', render: (r) => r.outcome },
            { label: 'Record', render: (r) => (r.noisy ? `${r.falseAlarms} false alarm(s) — noisy` : `${r.falseAlarms} false alarm(s)`) },
          ],
          rows,
        }),
        scan.unreducedSeries.length
          ? h('div', null,
            h('p', { class: 'muted small' }, 'Not reconstructable yet — the reason is printed rather than shown as a flat zero line:'),
            h('ul', { class: 'evidence-list' }, ...scan.unreducedSeries.map((s) => h('li', null, `${s.label}: ${s.reason}`))))
          : null),
    }),
    card({
      title: 'What the procedure did today',
      body: scan.candidates.length
        ? h('ul', { class: 'evidence-list' },
          ...scan.candidates
            .slice()
            .sort((a, b) => a.pValue - b.pValue)
            .map((c) => h('li', null,
              `${c.label}: p ${fmt(c.pValue, 4)} · rank ${c.rank ?? '—'} · threshold ${c.threshold === null ? '—' : fmt(c.threshold, 4)} · `
              + `${c.rejected ? 'rejected by the step-up' : 'not rejected'}${c.polarity === 'adverse' ? ' · adverse' : c.polarity ? ` · ${c.polarity}` : ''}`)))
        : h('p', { class: 'small' }, 'No series produced a latest-point signal at all.'),
    }),
  );
}

/* -------------------------------------------------------------- forecasts */

function forecastsTab(report) {
  const rows = report.forecasts.slice(0, 120).map((f) => ({
    ...f,
    status: f.scoring.scored ? 'scored' : (f.scoring.reason === 'pending' ? 'pending' : 'unmeasured'),
  }));
  return h('div', { class: 'view-stack' },
    card({
      title: 'Frozen predictions',
      subtitle: 'One prediction per series per day, frozen before the week it describes. Skill is derived at read time, never stored.',
      body: h('div', { class: 'view-stack' },
        h('div', { class: 'stats-row' },
          stat({ label: 'Scored', value: report.skill.scored, hint: report.skill.reliable ? 'above the evidence floor' : 'below the floor' }),
          stat({ label: 'Pending', value: report.skill.pending }),
          stat({ label: 'Never scorable', value: report.skill.unmeasured, hint: 'a gap is not a zero' }),
          stat({ label: 'Mean skill', value: report.skill.reliable ? fmt(report.skill.meanSkill, 3) : 'counts only' }),
          stat({ label: 'MAE model / naive', value: report.skill.reliable ? `${fmt(report.skill.maeModel)} / ${fmt(report.skill.maeNaive)}` : '—' })),
        h('p', { class: 'small' }, report.skill.note),
        table({
          caption: 'Frozen next-week predictions and their out-of-sample scores',
          columns: [
            { label: 'Series', render: (r) => r.seriesId },
            { label: 'Issued', render: (r) => r.issuedOn },
            { label: 'Due', render: (r) => r.dueOn },
            { label: 'Predicted', render: (r) => `${fmt(r.point)} (${fmt(r.lo)}–${fmt(r.hi)})` },
            { label: 'Naive baseline', render: (r) => fmt(r.baselinePoint) },
            { label: 'Observed', render: (r) => (Number.isFinite(r.scoring.observed) ? fmt(r.scoring.observed) : '—') },
            { label: 'Error model / naive', render: (r) => (r.scoring.scored ? `${fmt(r.scoring.absErrorModel)} / ${fmt(r.scoring.absErrorNaive)}` : '—') },
            { label: 'Skill', render: (r) => (Number.isFinite(r.scoring.skill) ? fmt(r.scoring.skill, 3) : '—') },
            { label: 'Status', render: (r) => r.status },
          ],
          rows,
          emptyMessage: 'No prediction has been frozen yet.',
        })),
    }),
  );
}

/* ------------------------------------------------------------ calibration */

function calibrationTab(report) {
  const { precision, skill } = report;
  const judged = precision.confirmed + precision.falseAlarms;
  const verdictRows = [
    { label: EW_VERDICT_LABELS.confirmed, count: precision.confirmed, note: 'Counts as a true alarm in the precision score' },
    { label: EW_VERDICT_LABELS['false-alarm'], count: precision.falseAlarms, note: 'Counts against the detector; repeated false alarms make a series noisy' },
    { label: EW_VERDICT_LABELS.explained, count: precision.explained, note: 'Excluded: a known cause is not a verdict on the statistics' },
    { label: EW_VERDICT_LABELS.dismissed, count: precision.dismissed, note: 'Excluded: “real but not worth acting on” is not a detection error' },
    { label: 'Awaiting a verdict', count: precision.open, note: 'Unjudged alerts are never counted as successes' },
    { label: 'Suppressed by a governor', count: precision.suppressed, note: 'Never reached a human, so it can never be scored' },
  ];
  return h('div', { class: 'view-stack' },
    banner({
      tone: precision.badlyTuned ? 'warn' : 'info',
      title: precision.reliable
        ? `Measured precision ${pct(precision.precision)} (Wilson 95% ${pct(precision.lo)}–${pct(precision.hi)})`
        : `Precision: counts only (${judged} judged)`,
      body: precision.note,
    }),
    card({
      title: 'What the detector has earned',
      body: h('div', { class: 'stats-row' },
        stat({ label: 'Confirmed', value: precision.confirmed, tone: 'good' }),
        stat({ label: 'False alarms', value: precision.falseAlarms, tone: precision.falseAlarms ? 'bad' : '' }),
        stat({ label: 'Precision', value: precision.reliable ? pct(precision.precision) : 'counts only', hint: precision.reliable ? `Wilson ${pct(precision.lo)}–${pct(precision.hi)}` : `needs ${EW_MIN_VERDICTS} judged verdicts` }),
        stat({ label: 'Forecast skill', value: skill.reliable ? fmt(skill.meanSkill, 3) : 'counts only', hint: `${skill.scored} scored` }),
        stat({ label: 'Direction accuracy', value: skill.reliable ? pct(skill.directionAccuracy) : '—' })),
    }),
    card({
      title: 'Verdict ledger',
      subtitle: 'The accounting is deliberately conservative: unjudged and suppressed alerts are never treated as wins.',
      body: table({
        caption: 'Human verdict counts and how each one is treated in the precision score',
        columns: [
          { label: 'Verdict', render: (r) => r.label },
          { label: 'Count', render: (r) => r.count },
          { label: 'Treatment', render: (r) => r.note },
        ],
        rows: verdictRows,
      }),
    }),
    card({
      title: 'Per-series record',
      subtitle: 'A series with repeated false alarms is demoted, not silently dropped: its candidates are still tested and still counted in m.',
      body: table({
        caption: 'Monitored series and their false-alarm history',
        columns: [
          { label: 'Series', render: (r) => r.label },
          { label: 'False alarms (90 d)', render: (r) => r.falseAlarms },
          { label: 'Status', render: (r) => (r.noisy ? badge('noisy — suppressed', 'warn') : badge('normal', 'good')) },
          { label: 'Last alert', render: (r) => r.lastAlertOn || '—' },
        ],
        rows: report.series,
      }),
    }),
  );
}

/* ----------------------------------------------------------------- policy */

function policyTab(ctx, report) {
  const p = report.policy;
  const alphaRows = [
    { rule: 'beyond-limit (1 point outside 3σ)', alpha: nominalAlpha('beyond-limit'), model: 'Two-sided normal tail' },
    { rule: 'range-spike (moving range beyond D4)', alpha: nominalAlpha('range-spike'), model: 'Nominal 3σ (MR is skewed — approximation, stated)' },
    { rule: 'near-limit-cluster (3 of 4 beyond 2σ)', alpha: nominalAlpha('near-limit-cluster'), model: `One-sided binomial tail, a = ${fmt(1 - normalCdf(2), 5)}` },
    { rule: 'sustained-shift (8 on one side)', alpha: nominalAlpha('sustained-shift'), model: `Two-sided run probability 0.5^7` },
  ];
  return h('div', { class: 'view-stack' },
    card({
      title: 'Detection policy',
      subtitle: 'Conventions, not measurements. Every number here is on screen, clamped on load, and re-derivable by hand.',
      actions: [h('button', { class: 'btn btn-small', type: 'button', onClick: () => openWatchPolicyDialog(ctx) }, 'Edit policy')],
      body: h('div', { class: 'stats-row' },
        stat({ label: 'False-discovery target', value: fmt(p.q, 2) }),
        stat({ label: 'Alert budget', value: `${p.budget} / ${p.windowDays} d` }),
        stat({ label: 'Triage deadline', value: `${p.triageDays} d` }),
        stat({ label: 'Series cooldown', value: `${p.cooldownDays} d` }),
        stat({ label: 'Propagation', value: p.autoPropagate ? 'on' : 'paused' })),
    }),
    card({
      title: 'Nominal α per rule',
      subtitle: 'The p value entering the step-up is the strongest rule’s α on the latest point, multiplied by four for the rules tested.',
      body: table({
        caption: 'Shewhart rules with their nominal false-alarm probability and null model',
        columns: [
          { label: 'Rule', render: (r) => r.rule },
          { label: 'Nominal α', render: (r) => fmt(r.alpha, 7) },
          { label: 'Null model', render: (r) => r.model },
        ],
        rows: alphaRows,
      }),
    }),
    card({
      title: 'The five rules',
      subtitle: 'Sensing is automatic. Only a human verdict creates work elsewhere.',
      body: table({
        caption: 'Early-warning automation catalogue',
        columns: [
          { label: 'Rule', render: (r) => r.id },
          { label: 'Does', render: (r) => r.does },
          { label: 'Trigger', render: (r) => r.trigger },
        ],
        rows: [
          { id: EW_RULE_IDS.SENSE, does: 'Scan, control the false-discovery rate, record promotions and suppressions, freeze predictions', trigger: 'any watchable event, or an explicit scan' },
          { id: EW_RULE_IDS.PROMOTE, does: 'Open exactly one operational case and one typed escalates-from edge', trigger: 'verdict = confirmed' },
          { id: EW_RULE_IDS.STALE, does: 'Open exactly one four-option DACI triage decision', trigger: 'alert past the triage deadline' },
          { id: EW_RULE_IDS.BUDGET, does: 'Open exactly one monitoring-scope decision per budget window', trigger: 'a real candidate suppressed for budget' },
          { id: EW_RULE_IDS.PRECISION, does: 'Open exactly one re-tuning decision per quarter', trigger: 'measured precision below tolerance' },
        ],
      }),
    }),
    card({
      title: 'Export & brief',
      body: h('div', { class: 'row row-wrap' },
        h('button', { class: 'btn btn-small', type: 'button', onClick: () => downloadBrief(ctx) }, 'Download brief (Markdown)'),
        h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => copyBrief(ctx) }, 'Copy brief'),
        h('a', { class: 'btn btn-small btn-ghost', href: '#/settings' }, 'CSV export lives in Settings & data')),
    }),
    card({
      title: 'Known limits, stated here rather than buried',
      body: h('ul', { class: 'evidence-list' },
        h('li', null, 'A 26-week series supports a single-week prediction and nothing longer; no multi-week projection is drawn.'),
        h('li', null, 'The moving-range α is a normal approximation; the moving-range distribution is skewed, so that one constant is nominal rather than derived.'),
        h('li', null, 'Benjamini–Hochberg assumes independence or positive dependence across tests. Series derived from the same records are correlated, so the true FDR can be above the target. This is stated, not corrected.'),
        h('li', null, 'XmR limits are in-sample. A level shift contaminates the centre line; the chart is a screening device, not a model of the process.'),
        h('li', null, 'Nothing here observes people. Every series is a workspace-level rate reconstructed from dates the leader typed.')),
    }),
  );
}

/* ------------------------------------------------------------------- view */

export function renderWatch(ctx) {
  const state = ctx.store && typeof ctx.store.getState === 'function' ? ctx.store.getState() : ctx.state;
  const report = buildWatchReport(state, ctx.now);
  const signals = watchSignals(state, ctx.now);
  const tab = TAB_KEYS.has(ctx.query.get('tab')) ? ctx.query.get('tab') : 'queue';
  const refresh = () => {
    const target = state && state.settings ? `#/watch?tab=${tab}` : '#/watch';
    if (ctx.refresh) ctx.refresh();
    else if (ctx.navigate) ctx.navigate(target);
  };

  const body = tab === 'scan'
    ? scanTab(ctx, report)
    : tab === 'forecasts'
      ? forecastsTab(report)
      : tab === 'calibration'
        ? calibrationTab(report)
        : tab === 'policy'
          ? policyTab(ctx, report)
          : queueTab(ctx, report);

  const signalBars = signals.slice(0, 2).map((s) => banner({
    tone: s.severity >= 4 ? 'bad' : s.severity >= 3 ? 'warn' : 'info',
    title: s.title,
    body: s.detail,
    actions: s.action ? [h('a', { class: 'btn btn-ghost btn-small', href: s.action.route }, s.action.label)] : [],
  }));

  return h('div', { class: 'view-stack' },
    pageHeader({
      eyebrow: `Early-Warning Watch · ${EW_ENGINE_VERSION} · Schema v39`,
      title: 'What changed, before it costs you?',
      subtitle: 'Twelve reconstructed series, one false-discovery rate across the whole scan, a frozen prediction for every test, and a detector that grades its own precision. No signal creates work until a named person judges it.',
      actions: [
        h('button', {
          class: 'btn btn-small',
          type: 'button',
          onClick: () => {
            const result = ctx.api.scanWatch();
            if (result.ok) {
              const propagated = Array.isArray(result.propagations) ? result.propagations.length : 0;
              toast(propagated ? `Scanned; ${propagated} cross-module effect(s).` : 'Scanned. Nothing crossed the threshold.', 'good');
            } else {
              toast(result.error || 'The scan could not run.', 'bad');
            }
            if (ctx.refresh) ctx.refresh();
          },
        }, 'Scan now'),
        h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => openWatchPolicyDialog(ctx) }, 'Policy'),
      ],
      meta: h('div', { class: 'row row-wrap' },
        badge(`${report.queue.length} awaiting verdict`, report.queue.length ? 'caution' : 'good'),
        badge(`q = ${fmt(report.policy.q, 2)}`, 'info'),
        badge(`budget ${report.budget.used}/${report.budget.cap}`, report.budget.exhausted ? 'warn' : 'neutral'),
        badge(report.precision.reliable ? `precision ${pct(report.precision.precision)}` : 'precision: counts only', report.precision.badlyTuned ? 'warn' : 'neutral'),
        badge(report.skill.reliable ? `skill ${fmt(report.skill.meanSkill, 2)}` : 'skill: counts only', 'neutral')),
    }),
    ...signalBars,
    h('div', { class: 'view-stack' },
      tabs({
        items: TABS.map((t) => (t.key === 'queue' ? { ...t, count: report.queue.length } : t)),
        active: tab,
        onSelect: (key) => {
          if (ctx.navigate) ctx.navigate(`#/watch?tab=${key}`);
          else refresh();
        },
        ariaLabel: 'Early-warning sections',
      })),
    body,
  );
}
