/**
 * app/views/impact.js — the Impact Ledger (`#/impact`).
 *
 * Five tabs over one engine:
 *   Vitals      what actually happened, reconstructed from dated records
 *   Studies     the pre-registered hypotheses and their windows
 *   Evaluation  one study examined properly: counterfactual, gates, fragility
 *   Design      what this workspace can and cannot detect, before you start
 *   Brief       the prediction record, the board brief, the verdict glossary
 *
 * This file renders. It computes nothing: every number comes from the pure
 * modules in `core/domain/`, which are tested on their own. Writes go through
 * `ctx.api` and never touch the store directly.
 */

import { h, toast, confirmDialog } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, table, emptyState, progressBar } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { formatDate } from '../core/time.js';
import {
  IMPACT_ENGINE_VERSION,
  VERDICTS,
  buildImpactBrief,
  buildImpactReport,
  designPower,
  gradeOf,
  studyHorizonEnd,
  vitalChoices,
} from '../core/domain/impact.js';
import { VITAL_BY_ID, buildVitalPanel, detectStructuralBreaks } from '../core/domain/vitals.js';
import { openDeclareStudyDialog, openScoreStudyDialog } from '../ui/impact-modals.js';

const TABS = [
  { key: 'vitals', label: 'Vitals' },
  { key: 'studies', label: 'Studies' },
  { key: 'evaluate', label: 'Evaluation' },
  { key: 'design', label: 'Design & power' },
  { key: 'brief', label: 'Calibration & brief' },
];
const TAB_KEYS = new Set(TABS.map((t) => t.key));

/* ------------------------------------------------------------------ format */

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });

function num(v, dp = 3) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: dp }).format(Number(v));
}
function fmtP(p) {
  if (p === null || p === undefined || !Number.isFinite(Number(p))) return '—';
  const n = Number(p);
  if (n === 0) return '< 0.0001';
  return n < 0.001 ? n.toExponential(1) : nf.format(Math.round(n * 1000) / 1000);
}
function shortDate(d) {
  return d ? formatDate(d, { withYear: false }) : '—';
}
function vitalUnit(id) {
  return VITAL_BY_ID[id]?.unit || '';
}
function toneOf(verdict) {
  return VERDICTS[verdict]?.tone || 'neutral';
}

/* ------------------------------------------------------------------- chart */

/**
 * The module in one picture.
 *
 * Solid = the recorded series. Dashed = the counterfactual implied by the donor
 * pool, rescaled into this metric's units. Shaded = pre-period. Vertical rule =
 * the intervention. When the two lines simply continue together there is
 * nothing to see, and the chart says so by showing them lying on top of each
 * other rather than hiding the counterfactual in a tooltip.
 */
function impactChart({ points, treatmentIndex, counterfactual = null, unit = '', height = 250, label = 'Metric history' }) {
  const measured = (points || []).filter((p) => p && p.value !== null && Number.isFinite(Number(p.value)));
  if (measured.length < 3) {
    return h('p', { class: 'muted small' }, 'Not enough measured periods to draw this series.');
  }
  const W = 780;
  const H = height;
  const padL = 56;
  const padR = 20;
  const padT = 18;
  const padB = 34;
  const T = Math.max(1, Math.min(measured.length - 1, treatmentIndex ?? Math.floor(measured.length / 2)));

  const cf = Array.isArray(counterfactual) && counterfactual.length === measured.length ? counterfactual : null;
  const all = measured.map((p) => Number(p.value)).concat(cf ? cf.filter((v) => Number.isFinite(Number(v))).map(Number) : []);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const yMin = min - span * 0.14;
  const yMax = max + span * 0.14;
  const X = (i) => padL + (i / Math.max(1, measured.length - 1)) * (W - padL - padR);
  const Y = (v) => padT + (1 - (Number(v) - yMin) / (yMax - yMin)) * (H - padT - padB);

  const linePath = measured.map((p, i) => `${i === 0 ? 'M' : 'L'}${X(i).toFixed(1)},${Y(p.value).toFixed(1)}`).join(' ');
  const cfPath = cf
    ? cf.map((v, i) => (Number.isFinite(Number(v)) ? `${i === 0 ? 'M' : 'L'}${X(i).toFixed(1)},${Y(v).toFixed(1)}` : '')).join('')
    : null;

  const grid = [0, 0.25, 0.5, 0.75, 1].flatMap((f) => {
    const v = yMin + f * (yMax - yMin);
    return [
      h('line', { x1: padL, y1: Y(v).toFixed(1), x2: W - padR, y2: Y(v).toFixed(1), class: 'impact-grid' }),
      h('text', { x: padL - 10, y: (Y(v) + 4).toFixed(1), 'text-anchor': 'end', class: 'impact-axis' }, num(v, 2)),
    ];
  });

  const treatmentX = X(T);
  const dots = measured.map((p, i) => h('circle', {
    cx: X(i).toFixed(1),
    cy: Y(p.value).toFixed(1),
    r: 2.8,
    class: `impact-dot ${i >= T ? 'is-post' : ''}`,
  }));

  const aria = `${label}. ${measured.length} periods from ${shortDate(measured[0].date)} to ${shortDate(measured[measured.length - 1].date)}. `
    + `Intervention after ${shortDate(measured[T].date)}. `
    + (cf ? 'Dashed line is the donor counterfactual. ' : '')
    + measured.map((p) => `${shortDate(p.date)}: ${num(p.value, 2)}`).join('; ');

  return h('div', { class: 'impact-chart' },
    h('svg', { viewBox: `0 0 ${W} ${H}`, class: 'impact-chart-svg', role: 'img', 'aria-label': aria, preserveAspectRatio: 'xMidYMid meet' },
      ...grid,
      h('rect', { x: padL, y: padT, width: Math.max(0, treatmentX - padL), height: H - padT - padB, class: 'impact-preshade' }),
      h('line', { x1: treatmentX.toFixed(1), y1: padT, x2: treatmentX.toFixed(1), y2: H - padB, class: 'impact-treatline' }),
      h('text', { x: (treatmentX + 7).toFixed(1), y: padT + 12, class: 'impact-treatlabel' }, 'intervention'),
      cfPath ? h('path', { d: cfPath, class: 'impact-cf', fill: 'none' }) : null,
      h('path', { d: linePath, class: 'impact-line', fill: 'none' }),
      ...dots,
      h('text', { x: padL, y: H - 8, class: 'impact-axis' }, shortDate(measured[0].date)),
      h('text', { x: W - padR, y: H - 8, 'text-anchor': 'end', class: 'impact-axis' }, shortDate(measured[measured.length - 1].date)),
      unit ? h('text', { x: padL - 10, y: padT - 4, 'text-anchor': 'end', class: 'impact-axis' }, unit) : null,
    ),
    h('ul', { class: 'impact-legend' },
      h('li', null, h('span', { class: 'impact-swatch is-actual', 'aria-hidden': 'true' }), 'Recorded'),
      cfPath ? h('li', null, h('span', { class: 'impact-swatch is-cf', 'aria-hidden': 'true' }), 'Counterfactual — equal-weight donor composite') : null,
      h('li', null, h('span', { class: 'impact-swatch is-pre', 'aria-hidden': 'true' }), 'Pre-intervention period'),
    ),
  );
}

/* ---------------------------------------------------------------- vitals */

function vitalsTab(ctx) {
  const panel = buildVitalPanel(ctx.state, { asOf: ctx.now, buckets: 22 });
  const breaks = buildBreaks(ctx);

  if (!panel.usable.length) {
    return card({
      title: 'Nothing to reconstruct yet',
      subtitle: 'Vitals are rebuilt from the dates already on your records. No new data entry, no telemetry.',
      body: emptyState({
        icon: '◷',
        title: 'Not enough dated history',
        body: 'A metric can only be reconstructed once it has been observed across several weeks — 1:1s held, feedback given, delegations completed, cases opened and resolved, pulses answered. Log ordinary work for a few weeks and this fills itself in.',
      }),
    });
  }

  const wanted = ctx.query.get('vital');
  const selected = panel.usable.find((r) => r.id === wanted) || panel.usable[0];
  const vital = VITAL_BY_ID[selected.id];
  const measured = selected.points.filter((p) => p.value !== null);
  const first = measured[0]?.value ?? null;
  const last = measured[measured.length - 1]?.value ?? null;
  const delta = first !== null && last !== null ? last - first : null;
  const better = delta === null ? null : vital.direction === 'up-good' ? delta > 0 : delta < 0;
  const ownBreaks = breaks.filter((b) => b.vitalId === selected.id).slice(0, 3);

  const picker = h('div', { class: 'impact-chips', role: 'group', 'aria-label': 'Choose a metric' },
    ...panel.rows.map((row) => {
      const usable = row.measured >= 6;
      return h('button', {
        type: 'button',
        class: `impact-chip ${row.id === selected.id ? 'is-active' : ''} ${usable ? '' : 'is-muted'}`,
        'aria-pressed': row.id === selected.id ? 'true' : 'false',
        title: usable ? `${row.measured} measured periods` : (row.reason || 'Not enough history to study'),
        onClick: () => ctx.navigate(`#/impact?tab=vitals&vital=${encodeURIComponent(row.id)}`),
      }, row.label);
    }),
  );

  return h('div', { class: 'stack' },
    card({ title: 'Choose a metric', subtitle: 'Every series is reconstructed from dates already in the record. A week with no observation is a gap, never a zero.', body: picker }),
    card({
      title: selected.label,
      subtitle: `${vital.framework} · ${vital.description}`,
      actions: [
        h('button', {
          class: 'btn btn-small btn-primary',
          type: 'button',
          onClick: () => openDeclareStudyDialog({ ctx, vitalId: selected.id }),
        }, 'Pre-register a study'),
      ],
      body: h('div', { class: 'stack' },
        h('div', { class: 'stat-row' },
          stat({ label: 'Measured periods', value: `${selected.measured}/${selected.n}`, hint: `weekly buckets · ${selected.undated || 0} undated record(s) excluded` }),
          stat({ label: 'Latest', value: last === null ? '—' : `${num(last, 2)} ${vital.unit}`, hint: shortDate(measured[measured.length - 1]?.date) }),
          stat({
            label: 'Movement over the window',
            value: delta === null ? '—' : `${delta > 0 ? '+' : ''}${num(delta, 2)}`,
            hint: better === null ? 'no movement' : better ? 'in the good direction' : 'the wrong way',
            tone: better === true ? 'good' : better === false ? 'caution' : '',
          }),
          stat({ label: 'Suppressed windows', value: String(selected.privacyBlocked || 0), hint: 'pulse anonymity floor' }),
        ),
        impactChart({
          points: selected.points,
          treatmentIndex: Math.max(1, Math.floor(selected.points.length / 2)),
          unit: vital.unit,
          height: 230,
          label: `${selected.label} history`,
        }),
        h('p', { class: 'muted small' },
          `Direction: ${vital.direction === 'up-good' ? 'higher is better' : 'lower is better'}. `,
          'The shaded half is history only — there is no intervention here. To find out whether something worked, pre-register a study against this metric.',
        ),
      ),
    }),
    ownBreaks.length
      ? card({
        title: 'Something changed here',
        subtitle: 'Tabular CUSUM on the recorded series, used as a prompt rather than a conclusion.',
        body: h('div', { class: 'stack' },
          h('ul', { class: 'impact-breaks' }, ...ownBreaks.map((b) => h('li', null,
            h('span', { class: 'impact-break-date' }, shortDate(b.date)),
            h('span', null, ` ${b.side === 'up' ? 'Upward' : 'Downward'} step of ${num(b.shift, 2)} ${vital.unit} (${num(b.statistic, 1)}σ).`),
          ))),
          h('p', { class: 'muted small' },
            'Two-sided tabular CUSUM (Page, 1954) with a moving-range σ̂, slack k = 0.5σ and decision interval h = 4σ. ',
            'If you ran something around that date, you can still record it — but a study declared now will be filed as retrospective, because the data has already spoken.',
          ),
        ),
      })
      : null,
    card({
      title: 'Metrics that cannot be reconstructed',
      subtitle: 'Listed rather than hidden. A metric the app silently dropped is a metric you would assume was fine.',
      body: table({
        caption: 'Metrics with insufficient dated history',
        columns: [
          { label: 'Metric', render: (r) => r.label },
          { label: 'Measured', render: (r) => `${r.measured} period(s)` },
          { label: 'Why', render: (r) => r.reason },
        ],
        rows: panel.unavailable,
        emptyMessage: 'Every tracked metric has enough history to be studied.',
      }),
    }),
  );
}

function buildBreaks(ctx) {
  try {
    const result = detectStructuralBreaks(ctx.state, { asOf: ctx.now, buckets: 22 });
    return result.breaks || [];
  } catch (error) {
    return [];
  }
}

/* --------------------------------------------------------------- studies */

function studyCard(ctx, row) {
  const { study, evaluation, status, vital } = row;
  const grade = gradeOf(study);
  const verdict = status === 'scored' ? (study.verdict || evaluation?.verdict) : (evaluation?.verdict || 'unmeasurable');
  const horizon = studyHorizonEnd(study);
  const decisive = verdict === 'supported' || verdict === 'not-supported';

  const actions = [];
  if (status === 'running' || status === 'window-closed') {
    actions.push(h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => openScoreStudyDialog({ ctx, study, evaluation }) }, 'Score & lock'));
  }
  actions.push(h('button', {
    class: 'btn btn-small',
    type: 'button',
    onClick: () => ctx.navigate(`#/impact?tab=evaluate&study=${encodeURIComponent(study.id)}`),
  }, 'Examine'));
  if (status === 'running') {
    actions.push(h('button', {
      class: 'btn btn-small btn-ghost',
      type: 'button',
      onClick: () => confirmDialog({
        title: 'Abandon this study?',
        message: 'The study stays in the ledger marked abandoned. Recording what you chose not to look at is itself information — deleting it would not be.',
        confirmLabel: 'Abandon',
        onConfirm: () => {
          const result = ctx.api.abandonImpactStudy(study.id, 'abandoned from the ledger');
          if (!result.ok) { toast(result.error, 'bad'); return; }
          toast('Study abandoned before scoring.', 'neutral');
          ctx.refresh?.();
        },
      }),
    }, 'Abandon'));
  }

  return card({
    title: study.title,
    subtitle: `${vital?.label || study.vitalId} · intervention ${shortDate(study.windowStart)} · ${study.baselineWeeks} wk baseline + ${study.windowWeeks} wk window · α ${study.alpha}`,
    actions,
    className: 'impact-study',
    body: h('div', { class: 'stack-tight' },
      h('div', { class: 'impact-study-meta' },
        badge(grade === 'confirmatory' ? 'Pre-registered' : 'Retrospective', grade === 'confirmatory' ? 'good' : 'caution',
          grade === 'confirmatory'
            ? 'The hypothesis was recorded before the window closed, so the result counts as confirmatory.'
            : 'The hypothesis was recorded after the intervention started. It can generate a hypothesis; it cannot confirm one.'),
        badge(status === 'window-closed' ? 'Window closed — unscored' : status === 'scored' ? 'Scored' : status === 'abandoned' ? 'Abandoned' : 'Running',
          status === 'window-closed' ? 'caution' : status === 'scored' && decisive ? toneOf(verdict) : 'neutral'),
        study.lockedOn ? badge(`Locked ${shortDate(study.lockedOn)}`, 'neutral', 'Locking freezes the evaluation permanently.') : null,
        study.replicationOfId ? badge('Replication', 'neutral', 'Created automatically from an earlier supported study.') : null,
      ),
      study.hypothesis ? h('p', { class: 'impact-hypothesis' }, `“${study.hypothesis}”`) : null,
      status === 'scored' && evaluation
        ? h('ul', { class: 'impact-facts' },
          h('li', null, h('span', null, 'Verdict'), h('strong', { class: `tone-${toneOf(verdict)}` }, VERDICTS[verdict]?.label || verdict)),
          evaluation.ok
            ? h('li', null, h('span', null, 'Level shift'), h('strong', null, `${num(evaluation.estimate)} ${evaluation.unit}${evaluation.estimatePct !== null && evaluation.estimatePct !== undefined ? ` (${evaluation.estimatePct > 0 ? '+' : ''}${num(evaluation.estimatePct, 1)}% of baseline)` : ''}`))
            : h('li', null, h('span', null, 'Why not measured'), h('strong', null, evaluation.reason || '—')),
          evaluation.ok ? h('li', null, h('span', null, 'Noise floor'), h('strong', null, `${num(evaluation.its?.mde)} ${evaluation.unit}`)) : null,
          evaluation.ok
            ? h('li', null, h('span', null, 'Placebo test'), h('strong', null, evaluation.placeboSource ? `p = ${fmtP(evaluation.placeboP)} (${evaluation.placeboSource})` : 'none could bind at this α'))
            : null,
        )
        : h('ul', { class: 'impact-facts' },
          h('li', null, h('span', null, 'Window closes'), h('strong', null, horizon ? formatDate(horizon) : '—')),
          h('li', null, h('span', null, 'Live reading'), h('strong', null,
            evaluation?.ok
              ? `${num(evaluation.estimate)} ${evaluation.unit} vs MDE ${num(evaluation.its?.mde)} — ${VERDICTS[verdict]?.label || verdict}`
              : (evaluation?.reason || 'not yet evaluable'))),
          h('li', null, h('span', null, 'You predicted'), h('strong', null,
            study.expectedEffect !== null && study.expectedEffect !== undefined
              ? `${num(study.expectedEffect)} ${vital?.unit || ''}${study.expectedConfidence ? ` at ${study.expectedConfidence}%` : ''}`
              : 'a direction, with no magnitude')),
        ),
      status === 'scored' && VERDICTS[verdict] ? h('p', { class: 'impact-plain' }, VERDICTS[verdict].plain) : null,
      study.outcomeNotes ? h('p', { class: 'muted small' }, `Your note: ${study.outcomeNotes}`) : null,
      (study.history || []).length > 1
        ? h('details', { class: 'impact-history' },
          h('summary', null, `History (${study.history.length} entries)`),
          h('ul', null, ...study.history.slice().reverse().map((entry) => h('li', null,
            h('span', { class: 'muted tiny' }, formatDate(entry.at)), ' ', entry.summary,
          ))),
        )
        : null,
    ),
  });
}

function studiesTab(ctx) {
  const report = buildImpactReport(ctx.state, ctx.now);
  if (!report.rows.length) {
    return card({
      title: 'No studies declared',
      body: h('div', { class: 'stack' },
        emptyState({
          icon: '◎',
          title: 'Write the prediction down before you start',
          body: 'A study is one sentence — “if I do X, this metric should move this way by about this much” — plus the day the change began and how long you will wait. Written before you know the answer it counts as evidence. Written afterwards the app still evaluates it, but it labels it retrospective forever.',
        }),
        h('div', null, h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openDeclareStudyDialog({ ctx }) }, 'Declare the first study')),
      ),
    });
  }

  return h('div', { class: 'stack' },
    h('div', { class: 'stat-row' },
      stat({ label: 'Pre-registered', value: String(report.totals.confirmatory), hint: 'counted as evidence' }),
      stat({ label: 'Retrospective', value: String(report.totals.retrospective), hint: 'hypothesis generation only' }),
      stat({ label: 'Supported', value: String(report.totals.supported), hint: 'confirmatory only', tone: 'good' }),
      stat({ label: 'Not supported', value: String(report.totals.notSupported), hint: 'confirmatory only', tone: report.totals.notSupported ? 'bad' : '' }),
      stat({ label: 'Awaiting scoring', value: String(report.totals.awaitingEvaluation), hint: 'window closed', tone: report.totals.awaitingEvaluation ? 'caution' : '' }),
    ),
    h('div', { class: 'row-actions' },
      h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openDeclareStudyDialog({ ctx }) }, 'Declare a study'),
      h('button', {
        class: 'btn',
        type: 'button',
        onClick: () => {
          const result = ctx.api.scanImpact();
          if (!result.ok) { toast(result.error, 'bad'); return; }
          toast(result.changed ? 'Ledger scanned — follow-through applied.' : 'Nothing new to propagate.', result.changed ? 'good' : 'neutral');
          ctx.refresh?.();
        },
      }, 'Run follow-through scan'),
    ),
    ...report.rows.map((row) => studyCard(ctx, row)),
  );
}

/* ------------------------------------------------------------ evaluation */

function placeboChart(evaluation) {
  const space = evaluation.inSpace;
  if (!space || !space.ok || !Array.isArray(space.placebos) || !space.placebos.length) return null;
  const values = space.placebos.map((p) => Math.abs(p.standardisedEffect));
  const actual = Math.abs(space.actual?.standardisedEffect ?? 0);
  const max = Math.max(actual, ...values) * 1.18 || 1;
  const W = 520;
  const H = 160;
  const slot = (W - 70) / (values.length + 1);
  const barW = Math.max(10, Math.min(40, slot - 8));
  const bars = values.map((v, i) => h('rect', {
    x: 44 + i * slot,
    y: H - 30 - (v / max) * (H - 56),
    width: barW,
    height: Math.max(1, (v / max) * (H - 56)),
    class: 'impact-placebo-bar',
    rx: 2,
  }));
  const actualX = 44 + values.length * slot;

  return h('div', { class: 'impact-placebo' },
    h('svg', {
      viewBox: `0 0 ${W} ${H}`,
      class: 'impact-placebo-svg',
      role: 'img',
      'aria-label': `In-space placebo distribution: ${values.length} donors treated in turn, magnitudes ${values.map((v) => num(v, 2)).join(', ')}; the actual study's standardised effect is ${num(actual, 2)}.`,
    },
      h('line', { x1: 32, y1: H - 30, x2: W - 8, y2: H - 30, class: 'impact-grid' }),
      ...bars,
      h('rect', {
        x: actualX,
        y: H - 30 - (actual / max) * (H - 56),
        width: barW,
        height: Math.max(1, (actual / max) * (H - 56)),
        class: 'impact-placebo-bar is-actual',
        rx: 2,
      }),
      h('text', { x: 44, y: H - 10, class: 'impact-axis' }, 'each donor treated in turn'),
      h('text', { x: actualX + barW / 2, y: H - 10, 'text-anchor': 'middle', class: 'impact-axis' }, 'actual'),
    ),
    h('p', { class: 'muted small' }, space.note),
  );
}

function gatesList(evaluation) {
  if (!Array.isArray(evaluation?.gates) || !evaluation.gates.length) return null;
  return h('ul', { class: 'impact-gates' }, ...evaluation.gates.map((gate) => h('li', { class: gate.passed ? 'is-pass' : gate.soft ? 'is-soft' : 'is-fail' },
    h('span', { class: 'impact-gate-icon', 'aria-hidden': 'true' }, gate.passed ? '✓' : gate.soft ? '·' : '✕'),
    h('span', null, h('strong', null, gate.gate), gate.detail ? h('span', { class: 'muted' }, ` — ${gate.detail}`) : null),
  )));
}

function evaluationTab(ctx) {
  const report = buildImpactReport(ctx.state, ctx.now);
  if (!report.rows.length) {
    return card({
      title: 'Nothing to examine',
      body: emptyState({ icon: '◫', title: 'No studies', body: 'Declare a study first. Then this tab shows the counterfactual, every gate the result had to pass, and how large a drift would overturn it.' }),
    });
  }
  const wanted = ctx.query.get('study');
  const row = report.rows.find((r) => r.study.id === wanted) || report.rows[0];
  const evaluation = row.study.status === 'scored' && row.study.evaluation
    ? { ...row.study.evaluation, verdict: row.study.verdict || row.study.evaluation.verdict }
    : row.evaluation;
  const vital = row.vital;

  const selector = h('div', { class: 'impact-chips', role: 'group', 'aria-label': 'Choose a study' },
    ...report.rows.map((r) => h('button', {
      type: 'button',
      class: `impact-chip ${r.study.id === row.study.id ? 'is-active' : ''}`,
      'aria-pressed': r.study.id === row.study.id ? 'true' : 'false',
      onClick: () => ctx.navigate(`#/impact?tab=evaluate&study=${encodeURIComponent(r.study.id)}`),
    }, r.study.title)),
  );

  const preTrend = evaluation?.preTrend;
  const breakdown = evaluation?.breakdown;

  return h('div', { class: 'stack' },
    card({ title: 'Choose a study', body: selector }),
    card({
      title: row.study.title,
      subtitle: `${vital?.label || row.study.vitalId} · ${evaluation?.grade === 'confirmatory' ? 'pre-registered' : 'retrospective'} · α ${row.study.alpha} · window ${shortDate(row.study.windowStart)} for ${row.study.windowWeeks} wk`,
      actions: row.study.status === 'scored'
        ? [badge('Locked — cannot be rescored', 'neutral')]
        : [h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => openScoreStudyDialog({ ctx, study: row.study, evaluation }) }, 'Score & lock')],
      body: h('div', { class: 'stack' },
        evaluation?.ok
          ? h('div', { class: 'stat-row' },
            stat({
              label: 'Level shift at intervention',
              value: `${num(evaluation.estimate)} ${evaluation.unit}`,
              hint: evaluation.estimatePct !== null && evaluation.estimatePct !== undefined ? `${evaluation.estimatePct > 0 ? '+' : ''}${num(evaluation.estimatePct, 1)}% of baseline` : '',
              tone: toneOf(evaluation.verdict) === 'good' ? 'good' : '',
            }),
            stat({ label: 'HAC standard error', value: num(evaluation.its?.seLevel), hint: `Newey–West lag ${evaluation.its?.hacLag}` }),
            stat({ label: 'Noise floor (MDE)', value: num(evaluation.its?.mde), hint: evaluation.meetsMde ? 'effect clears the floor' : 'effect is inside the noise' }),
            stat({ label: 'Verdict', value: VERDICTS[evaluation.verdict]?.label || evaluation.verdict, hint: `placebo: ${evaluation.placeboSource || 'none'}`, tone: toneOf(evaluation.verdict) }),
          )
          : banner({ tone: 'caution', title: 'Not measurable over this window', body: evaluation?.reason || 'The evaluator could not read this study.' }),

        impactChart({
          points: evaluation?.series || [],
          treatmentIndex: evaluation?.grid?.treatmentIndex ?? 0,
          counterfactual: evaluation?.inSpace?.ok ? evaluation.inSpace.actual?.counterfactual : null,
          unit: vital?.unit || '',
          height: 270,
          label: `${row.study.title} against its counterfactual`,
        }),

        gatesList(evaluation),

        preTrend?.caveat ? h('p', { class: 'muted small' }, preTrend.caveat) : null,

        evaluation?.ok && breakdown?.ok
          ? h('div', { class: 'impact-breakdown' },
            h('p', { class: 'impact-breakdown-head' }, 'How fragile is this result?'),
            h('p', null,
              'A differential trend of ',
              h('strong', null, `${num(breakdown.breakPerWeek)} ${evaluation.unit} per week`),
              ` sustained across the whole post-period would reproduce the entire estimate${breakdown.pctOfPreMean !== null && breakdown.pctOfPreMean !== undefined ? ` — ${num(breakdown.pctOfPreMean, 1)}% of the baseline mean every week` : ''}. `,
              breakdown.fragile
                ? h('strong', { class: 'tone-caution' }, 'That is small enough to be plausible, so read the result as fragile.')
                : 'That is a large drift to explain away, which makes the estimate harder to dismiss.',
            ),
            h('p', { class: 'muted small' }, breakdown.note),
          )
          : null,

        evaluation?.inSpace?.ok
          ? h('div', null,
            h('p', { class: 'impact-subhead' }, 'In-space placebo distribution'),
            placeboChart(evaluation),
            h('p', { class: 'muted small' },
              `Finest attainable p-value with ${evaluation.inSpace.placeboCount} placebo fits is ${num(evaluation.inSpace.resolution, 3)}. `,
              evaluation.placeboInformative
                ? 'That clears this study’s α, so the placebo test was used as a gate.'
                : 'That does not clear this study’s α, so the placebo test could not have rejected anything and was not used as a gate. The limitation is recorded rather than hidden.',
            ),
          )
          : null,

        evaluation?.inTime?.ok
          ? h('div', null,
            h('p', { class: 'impact-subhead' }, 'In-time placebo — fake interruption dates inside the pre-period'),
            h('p', null,
              `${evaluation.inTime.count} placebo fits. Median |t| ${num(evaluation.inTime.medianPlaceboT, 2)}, largest ${num(evaluation.inTime.maxPlaceboT, 2)}. This study's |t| is ${num(Math.abs(evaluation.its?.tLevel || 0), 2)}.`,
            ),
            h('p', { class: 'muted small' }, evaluation.inTime.note),
          )
          : null,

        Array.isArray(evaluation?.donors) && evaluation.donors.length
          ? h('p', { class: 'muted small' },
            'Counterfactual donor pool: ',
            evaluation.donors.map((d) => d.label).join(', '),
            '. ',
            'Donors are equal-weighted and deliberately unfitted: a synthetic control tuned on the pre-period can always be made to look convincing, which is precisely why it should not be trusted.',
          )
          : h('p', { class: 'muted small' }, 'No donor metric was measurable across this exact window, so only the interrupted-time-series estimate is available.'),
      ),
    }),
  );
}

/* ---------------------------------------------------------------- design */

function designTab(ctx) {
  const choices = vitalChoices(ctx.state, ctx.now).filter((c) => c.usable);
  if (!choices.length) {
    return card({
      title: 'Design planner',
      body: emptyState({ icon: '◬', title: 'No metric has enough history yet', body: 'A power calculation needs a noise estimate, and a noise estimate needs recorded weeks. Log a few weeks of ordinary work first.' }),
    });
  }

  const wanted = ctx.query.get('vital');
  const chosenId = choices.some((c) => c.id === wanted) ? wanted : choices[0].id;
  const preWeeks = Math.max(4, Math.min(26, Number(ctx.query.get('pre')) || 8));
  const postWeeks = Math.max(2, Math.min(26, Number(ctx.query.get('post')) || 4));
  const rawTarget = Number(ctx.query.get('target'));
  const targetEffect = Number.isFinite(rawTarget) && rawTarget > 0 ? rawTarget : null;
  const plan = designPower(ctx.state, chosenId, { preWeeks, postWeeks, targetEffect, asOf: ctx.now });

  const picker = h('div', { class: 'impact-chips', role: 'group', 'aria-label': 'Choose a metric' },
    ...choices.map((c) => h('button', {
      type: 'button',
      class: `impact-chip ${c.id === chosenId ? 'is-active' : ''}`,
      'aria-pressed': c.id === chosenId ? 'true' : 'false',
      onClick: () => ctx.navigate(`#/impact?tab=design&vital=${encodeURIComponent(c.id)}&pre=${preWeeks}&post=${postWeeks}${targetEffect ? `&target=${encodeURIComponent(String(targetEffect))}` : ''}`),
    }, c.label)),
  );

  const grid = [];
  for (const pre of [4, 6, 8, 12]) {
    for (const post of [2, 4, 6, 8]) {
      const cell = designPower(ctx.state, chosenId, { preWeeks: pre, postWeeks: post, targetEffect, asOf: ctx.now });
      grid.push({
        design: `${pre} + ${post}`,
        mde: cell.ok ? `${num(cell.mde)} ${cell.unit}` : '—',
        pct: cell.ok ? `${num(cell.mdePctOfMean, 1)}%` : '—',
        verdict: cell.ok
          ? (targetEffect === null ? '—' : cell.mde <= targetEffect ? '✓ detects your target' : '✕ too coarse')
          : (cell.reason || '—'),
        className: cell.ok && targetEffect !== null ? (cell.mde <= targetEffect ? 'is-detectable' : '') : '',
      });
    }
  }

  return h('div', { class: 'stack' },
    card({ title: 'Choose a metric', body: picker }),
    card({
      title: 'What can this design detect?',
      subtitle: 'The smallest level shift a given number of pre- and post-intervention weeks could distinguish from this metric’s own week-to-week noise.',
      body: plan?.ok
        ? h('div', { class: 'stack' },
          h('div', { class: 'stat-row' },
            stat({ label: 'Week-to-week noise (σ̂)', value: num(plan.sigma), hint: `${plan.unit} · moving-range estimator` }),
            stat({ label: 'Design', value: `${plan.preWeeks} pre + ${plan.postWeeks} post`, hint: `α = ${plan.alpha}, 80% power` }),
            stat({ label: 'Smallest detectable shift', value: `${num(plan.mde)} ${plan.unit}`, hint: plan.mdePctOfMean !== null ? `${num(plan.mdePctOfMean, 1)}% of the mean` : '' }),
            targetEffect !== null
              ? stat({
                label: `Detect ${num(targetEffect)} ${plan.unit}?`,
                value: plan.detectable ? 'Yes' : 'No',
                hint: plan.requiredPostWeeks ? `needs about ${plan.requiredPostWeeks} post weeks` : 'not reachable inside 26 weeks',
                tone: plan.detectable ? 'good' : 'caution',
              })
              : stat({ label: 'Recorded history', value: `${plan.historyWeeks} wk`, hint: 'basis for σ̂' }),
          ),
          h('p', null, plan.note),
          h('p', { class: 'muted small' },
            'This is the calculation most before-and-after studies skip. A design that cannot detect the effect you care about returns a null result whether or not the intervention worked — which is why the ledger reports “underpowered” instead of “no effect”.',
          ),
        )
        : banner({ tone: 'caution', title: 'Cannot compute a power estimate', body: plan?.reason || 'Pick a metric with recorded history.' }),
    }),
    card({
      title: 'Design grid',
      subtitle: targetEffect === null
        ? 'Add a target effect to see which designs could detect it. Each cell is the smallest shift that design could distinguish from noise.'
        : `Cells marked ✓ could detect a ${num(targetEffect)} ${plan?.unit || ''} shift at α = ${plan?.alpha ?? 0.1} with 80% power.`,
      body: h('div', { class: 'stack' },
        table({
          caption: 'Minimum detectable effect by design',
          columns: [
            { label: 'Pre + post weeks', render: (r) => r.design },
            { label: 'MDE', render: (r) => r.mde },
            { label: 'Share of mean', render: (r) => r.pct },
            { label: targetEffect === null ? 'Note' : 'Against your target', render: (r) => r.verdict },
          ],
          rows: grid,
        }),
        h('form', {
          class: 'impact-inline-form',
          onSubmit: (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const t = String(data.get('target') || '').trim();
            const params = new URLSearchParams({ tab: 'design', vital: chosenId, pre: String(preWeeks), post: String(postWeeks) });
            if (t && Number(t) > 0) params.set('target', t);
            ctx.navigate(`#/impact?${params.toString()}`);
          },
        },
          h('label', { class: 'field-label', for: 'impact-target' }, 'Effect you would want to detect, in the metric’s own unit'),
          h('div', { class: 'row-actions' },
            h('input', {
              id: 'impact-target',
              name: 'target',
              type: 'number',
              step: 'any',
              min: '0.0001',
              value: targetEffect ?? '',
              placeholder: 'e.g. 0.5',
            }),
            h('button', { class: 'btn', type: 'submit' }, 'Compare'),
          ),
          h('p', { class: 'field-hint' }, 'Not sure? Halve the number you first thought of. The calibration tab will show you why.'),
        ),
      ),
    }),
  );
}

/* ----------------------------------------------------------------- brief */

function briefTab(ctx) {
  const report = buildImpactReport(ctx.state, ctx.now);
  const cal = report.calibration;
  const brief = buildImpactBrief(ctx.state, ctx.now);

  return h('div', { class: 'stack' },
    card({
      title: 'Your prediction record',
      subtitle: 'A pre-registered direction is a forecast about your own intervention. With a stated confidence it is a probability, and probabilities can be scored.',
      body: cal.insufficient
        ? emptyState({ icon: '◍', title: 'Not enough scored studies yet', body: cal.note })
        : h('div', { class: 'stack' },
          h('div', { class: 'stat-row' },
            stat({ label: 'Evaluable studies', value: String(cal.studies), hint: `${cal.decisive} decisive` }),
            stat({ label: 'Direction correct', value: cal.directionAccuracy === null ? '—' : `${Math.round(cal.directionAccuracy * 100)}%`, hint: `${cal.directionCorrect} of ${cal.directionScored}` }),
            stat({ label: 'Brier score', value: cal.brier === null ? '—' : num(cal.brier), hint: cal.brier === null ? 'no stated confidence' : `${cal.brierScored} confident calls` }),
            stat({
              label: 'Effect-size realism',
              value: cal.medianEffectRatio === null ? '—' : `${Math.round(cal.medianEffectRatio * 100)}%`,
              hint: cal.medianEffectRatio === null ? 'no magnitude predictions' : 'median realised ÷ declared',
              tone: cal.medianEffectRatio !== null && cal.medianEffectRatio < 0.5 ? 'caution' : '',
            }),
          ),
          h('p', null, cal.note),
          cal.overEstimationFactor !== null && cal.overEstimationFactor > 1
            ? banner({
              tone: 'caution',
              title: `You overestimate effect size by about ${num(cal.overEstimationFactor, 1)}×`,
              body: 'This is the planning fallacy applied to your own judgement — the same bias that makes projects late. It is not a character flaw. It is a reason to halve the number you write down next time and check again after two more studies.',
            })
            : null,
          h('ul', { class: 'impact-facts' },
            h('li', null, h('span', null, 'Underpowered'), h('strong', null, String(cal.underpowered))),
            h('li', null, h('span', null, 'Broken parallel trends'), h('strong', null, String(cal.preTrend))),
          ),
        ),
    }),
    card({
      title: 'Board-ready brief',
      subtitle: 'Deterministic: the same record always produces the same document, which is what makes it citable.',
      actions: [h('button', {
        class: 'btn btn-small',
        type: 'button',
        onClick: () => downloadText({
          filename: `leados-impact-brief-${ctx.now.toISOString().slice(0, 10)}.md`,
          text: brief,
          mime: 'text/markdown',
        }),
      }, 'Download Markdown')],
      body: h('pre', { class: 'impact-brief', tabindex: '0', 'aria-label': 'Impact brief' }, brief),
    }),
    card({
      title: 'How to read a verdict',
      body: table({
        caption: 'Verdict vocabulary',
        columns: [
          { label: 'Verdict', render: (r) => r.label },
          { label: 'What it means', render: (r) => r.plain },
        ],
        rows: Object.values(VERDICTS),
      }),
    }),
    card({
      title: 'Engine',
      body: h('div', { class: 'stack' },
        h('p', { class: 'muted small' },
          `Impact engine ${IMPACT_ENGINE_VERSION}. Segmented interrupted time series with Newey–West HAC errors; in-time and in-space placebo inference with their own attainable resolution reported; minimum detectable effect from pre-period residual variance; linear breakdown bound on the parallel-trends assumption.`,
        ),
        h('p', { class: 'muted small' },
          'No study in this ledger establishes causation. The strongest claim available is “consistent with the pre-registered hypothesis under a stated design”, and that is the only claim the app makes.',
        ),
      ),
    }),
  );
}

/* ---------------------------------------------------------------- router */

export function renderImpact(ctx) {
  const tab = TAB_KEYS.has(ctx.query.get('tab')) ? ctx.query.get('tab') : 'vitals';
  let report = { totals: { awaitingEvaluation: 0, confirmatory: 0, retrospective: 0 } };
  try {
    report = buildImpactReport(ctx.state, ctx.now);
  } catch (error) {
    report = { totals: { awaitingEvaluation: 0, confirmatory: 0, retrospective: 0 } };
  }
  const attention = report.totals.awaitingEvaluation;

  const body = tab === 'vitals' ? vitalsTab(ctx)
    : tab === 'studies' ? studiesTab(ctx)
      : tab === 'evaluate' ? evaluationTab(ctx)
        : tab === 'design' ? designTab(ctx)
          : briefTab(ctx);

  return h('div', { class: 'view-stack' },
    pageHeader({
      eyebrow: 'Impact ledger',
      title: 'Did that actually work?',
      subtitle: 'Every other tool shows you the line went up. This one makes you write the prediction down first, then decides whether the record can answer the question at all.',
      actions: [
        h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openDeclareStudyDialog({ ctx }) }, 'Declare a study'),
        attention
          ? h('button', { class: 'btn', type: 'button', onClick: () => ctx.navigate('#/impact?tab=studies') }, `${attention} awaiting scoring`)
          : null,
      ].filter(Boolean),
      meta: h('p', { class: 'muted small' },
        `${report.totals.confirmatory} pre-registered · ${report.totals.retrospective} retrospective · `,
        attention ? h('strong', null, `${attention} window(s) closed and unscored`) : 'no windows waiting',
      ),
    }),
    banner({
      tone: 'info',
      title: 'Read this before trusting any number here',
      body: 'Nothing below establishes causation. Each study is an observational before/after design with a stated counterfactual, a noise floor and placebo checks. “Consistent with the hypothesis” means the pattern survived those checks under those assumptions — and a study whose hypothesis was written down after the intervention began can never count as confirmation, however good the news.',
    }),
    tabs({
      items: TABS.map((t) => ({ key: t.key, label: t.label, count: t.key === 'studies' && attention ? attention : undefined })),
      active: tab,
      onSelect: (key) => ctx.navigate(`#/impact?tab=${key}`),
      ariaLabel: 'Impact ledger sections',
    }),
    body,
  );
}
