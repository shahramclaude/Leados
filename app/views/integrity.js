/**
 * app/views/integrity.js — the Signal Integrity Board (`#/integrity`, Schema
 * v70, ADR-0061).
 *
 * Five panels over the record of the product's own detecting:
 *   Overview      The error budget, the bar for the next look, measured
 *                 precision and the gap between the two
 *   Inventory     Every signal family, what it reads, what it fired today and
 *                 how well its verdicts say it performs
 *   Verdicts      The triage queue (today's findings, one click to judge) and
 *                 the verdict ledger
 *   Ledger        Recorded looks with their p values and survivors, and the
 *                 frozen programme reviews with their grades
 *   Method        The arithmetic, printed in full, with every refusal
 *
 * The screen never manufactures a p-value for a deterministic rule, never
 * prints a precision figure below the declared verdict floor, and always says
 * which direction an unmeasured quantity would err.
 */

import { h, toast, openModal, confirmDialog } from '../ui/dom.js';
import {
  pageHeader, card, stat, badge, banner, tabs, table, emptyState, kv,
} from '../ui/components.js';
import { progressBar } from '../ui/charts.js';
import { downloadText } from '../ui/download.js';
import { dayKey } from '../core/time.js';
import { buildInsights } from '../core/domain/insights.js';
import { SIGNAL_FAMILIES } from '../core/domain/integrityRegistry.js';
import { lookBoundary, normalInv } from '../core/domain/integrity.js';
import {
  openVerdictDialog,
  openDeclarePlanDialog,
  openFreezeReviewDialog,
} from '../ui/integrity-modals.js';

const PANELS = [
  { key: 'overview', label: 'Overview' },
  { key: 'inventory', label: 'Test inventory' },
  { key: 'verdicts', label: 'Verdicts' },
  { key: 'ledger', label: 'Ledger' },
  { key: 'method', label: 'Method' },
];

const STATUS_TONE = {
  calibrated: 'good',
  indeterminate: 'warn',
  'over-claiming': 'bad',
  insufficient: 'neutral',
  unscored: 'neutral',
};

const STATUS_TEXT = {
  calibrated: 'Calibrated',
  indeterminate: 'Unresolved',
  'over-claiming': 'Over-claiming',
  insufficient: 'Too few verdicts',
  unscored: 'Never judged',
};

function fmtPct(v, dp = 1) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return '—';
  return `${Number(v).toFixed(dp)}%`;
}

function fmtThreshold(v) {
  if (!Number.isFinite(Number(v))) return '—';
  const n = Number(v);
  if (n <= 0) return 'unreachable';
  if (n < 1e-4) return n.toExponential(2);
  return n.toFixed(5);
}

function fmtCI(lo, hi, dp = 1) {
  if (lo === null || hi === null || lo === undefined || hi === undefined) return '—';
  return `${Number(lo).toFixed(dp)}–${Number(hi).toFixed(dp)}%`;
}

function nav(ctx, panel, extra = {}) {
  const q = new URLSearchParams();
  q.set('panel', panel);
  for (const [k, v] of Object.entries(extra)) {
    if (v !== null && v !== undefined && v !== '') q.set(k, String(v));
  }
  ctx.navigate(`#/integrity?${q.toString()}`);
}

/* ---------------------------------------------------------------- overview */

function overviewPanel(ctx, report) {
  const { looks, precision, conventions, suite } = report;
  const pooled = precision.pooled;
  const boundary = looks.nextBoundary;
  const barTone = looks.exhausted ? 'bad' : looks.spendPct >= conventions.spendWarnPct ? 'warn' : 'good';

  return h('div', { class: 'stack' },
    card({
      title: 'The two numbers that disagree',
      subtitle: 'What the plan claims about error, and what your own verdicts say actually happened.',
      body: h('div', { class: 'stack' },
        h('div', { class: 'stat-row' },
          stat({
            label: 'Error budget left',
            value: `${fmtPct(looks.remainingAlphaPct, 2)}`,
            hint: `${fmtPct(looks.spendPct, 1)} of the ${conventions.alphaPct}% budget spent · ${looks.used} of ${looks.planned} looks`,
            tone: looks.exhausted ? 'bad' : looks.spendPct >= conventions.spendWarnPct ? 'warn' : '',
          }),
          stat({
            label: 'Your next look’s bar',
            value: boundary.exhausted ? 'none' : fmtThreshold(boundary.perTestThreshold),
            hint: boundary.exhausted
              ? 'The budget is spent; a further look buys no nominal significance'
              : `any candidate must clear p < ${fmtThreshold(boundary.perTestThreshold)} (z ${boundary.zBoundary ?? '—'})`,
            tone: barTone,
          }),
          stat({
            label: 'Actionable precision',
            value: pooled.actionablePct === null ? 'withheld' : fmtPct(pooled.actionablePct),
            hint: pooled.n
              ? `95% CI ${fmtCI(pooled.actionableLoPct, pooled.actionableHiPct)} · n=${pooled.n}`
              : 'no verdicts recorded, so nothing is claimed',
            tone: pooled.actionablePct !== null && pooled.actionablePct < conventions.precisionFloorPct ? 'bad' : '',
          }),
          stat({
            label: 'Families over-claiming',
            value: precision.overClaiming.length,
            hint: precision.overClaiming.length
              ? precision.overClaiming.slice(0, 3).map((f) => f.domain).join(', ')
              : `${precision.scoredFamilies} family(ies) scored at the ${conventions.precisionFloorPct}% floor`,
            tone: precision.overClaiming.length ? 'bad' : '',
          }),
        ),
        h('div', { class: 'stack-xs' },
          h('div', { class: 'row-between' },
            h('span', { class: 'muted small' }, `Family-wise error budget: ${fmtPct(looks.cumulativeAlphaPct, 2)} of ${conventions.alphaPct}% spent`),
            h('span', { class: 'muted small' }, `${looks.used} look(s) recorded${looks.lowerBound ? ` · ${looks.reconstructedDays} reconstructed from the alert ledger` : ''}`)),
          progressBar(Math.min(100, looks.spendPct), {
            tone: looks.exhausted ? 'bad' : looks.spendPct >= conventions.spendWarnPct ? 'warn' : 'good',
            label: 'Share of the family-wise error budget already spent',
          })),
        looks.lowerBound
          ? h('p', { class: 'muted small' },
            'The look count is a LOWER BOUND: ',
            `${looks.reconstructedDays} look(s) were reconstructed from the alert ledger, and a day scanned with no candidate leaves no trace there. `,
            'Under-counting looks under-states the spend, so the direction of that error is optimistic — never safe. Record a look explicitly, or let the watch scan record one, to close the gap.')
          : null,
      ),
    }),

    card({
      title: 'What this screen is actually measuring',
      subtitle: 'Every render of the workspace runs the whole suite below. That is a multiple-testing procedure, and it has a price.',
      body: h('div', { class: 'stack' },
        h('div', { class: 'stat-row' },
          stat({ label: 'Deterministic rule families', value: suite.ruleFamilies, hint: 'audited by measured precision — no p-value is manufactured for them' }),
          stat({ label: 'P-valued scan', value: suite.statisticalFamilies, hint: suite.statisticalDomains.join(', ') || 'none registered' }),
          stat({
            label: 'Findings surfaced today',
            value: suite.findingsToday === null ? 'not evaluated' : suite.findingsToday,
            hint: suite.findingsToday === null ? 'the API read model does not run the recommendation engine' : `across ${suite.domainsFiringToday} family(ies)`,
          }),
          stat({ label: 'Families never judged', value: suite.unscoredFamilies, hint: `of ${suite.families} registered` }),
        ),
        h('p', { class: 'muted' },
          'The Board does not treat these as equals. A rule that reads your records and fires when a predicate holds has no null distribution, so ',
          h('strong', null, 'no p-value is invented for it'), '. Those families are audited the only honest way available: by counting how often you judged them right. The one p-valued scan (Early warning) gets the full correction.'),
      ),
    }),

    report.signals.length
      ? card({
        title: `Signals (${report.signals.length})`,
        subtitle: 'What the Board raises about the detector suite itself.',
        body: h('div', { class: 'stack' },
          ...report.signals.map((signal) => h('div', { class: 'callout stack-xs' },
            h('div', { class: 'row-between' },
              h('strong', null, `${signal.ruleId} · ${signal.title}`),
              badge(`Severity ${signal.severity}`, signal.severity >= 4 ? 'bad' : 'warn')),
            h('p', { class: 'muted small' }, signal.detail),
            h('ul', { class: 'evidence-list' }, ...signal.evidence.map((line) => h('li', null, line))),
            h('button', {
              class: 'btn btn-small btn-ghost',
              type: 'button',
              onClick: () => ctx.navigate(signal.action.route),
            }, signal.action.label)))),
      })
      : card({
        title: 'No integrity signals',
        subtitle: 'Nothing about the procedure itself needs you right now.',
        body: h('p', { class: 'muted' },
          'The budget is inside its plan, no scored family is measurably over-claiming, and no review is due. That is a statement about the detector suite, not about the team.'),
      }),
  );
}

/* --------------------------------------------------------------- inventory */

function inventoryPanel(ctx, report) {
  const filter = ctx.query?.get('status') || 'all';
  // Schema v71: the Borrowed Evidence Engine pools the same actionable
  // precision against the same floor, so a family the Board must call "too few
  // verdicts" or "unresolved" can still show what the rest of the suite says —
  // labelled as borrowed, with how much of it is the family's own.
  const detectors = ctx.api.credibilityRead
    ? (ctx.api.credibilityRead().groups || []).find((g) => g.id === 'detectors')
    : null;
  const borrowedByDomain = new Map((detectors && detectors.borrowing ? detectors.units : [])
    .map((u) => [u.id, u]));
  const inherits = detectors && detectors.borrowing ? detectors.neverJudged : null;
  const borrowedCell = (row) => {
    if (row.status === 'calibrated' || row.status === 'over-claiming') return '—';
    const unit = borrowedByDomain.get(row.domain);
    if (unit && unit.borrowedPct !== null) {
      return h('a', { href: `#/credibility?panel=shrinkage&group=detectors`, class: 'stack-xs' },
        h('span', null, `${unit.borrowedPct}% · ${unit.loPct}–${unit.hiPct}%`),
        h('span', { class: 'muted small' }, `${unit.zPct}% own · ${unit.borrowedVerdict === 'below' ? 'below floor' : unit.borrowedVerdict === 'above' ? 'clears floor' : 'unresolved'}`));
    }
    if (inherits && row.n === 0) {
      return h('span', { class: 'muted small' }, `inherits ${inherits.meanPct}% (${inherits.loPct}–${inherits.hiPct}%)`);
    }
    return '—';
  };
  const rows = report.inventory
    .filter((row) => (filter === 'all' ? true : row.status === filter))
    .sort((a, b) => {
      const order = ['over-claiming', 'indeterminate', 'insufficient', 'unscored', 'calibrated'];
      return order.indexOf(a.status) - order.indexOf(b.status) || a.domain.localeCompare(b.domain);
    });

  const chips = ['all', 'over-claiming', 'indeterminate', 'calibrated', 'insufficient', 'unscored']
    .map((key) => ({
      key,
      label: key === 'all' ? `All (${report.inventory.length})` : `${STATUS_TEXT[key] || key} (${report.inventory.filter((r) => r.status === key).length})`,
    }));

  return h('div', { class: 'stack' },
    tabs({
      items: chips,
      active: filter,
      ariaLabel: 'Filter signal families by measured status',
      onSelect: (key) => nav(ctx, 'inventory', { status: key === 'all' ? '' : key }),
    }),

    card({
      title: 'The whole suite, family by family',
      subtitle: `${report.inventory.length} families. "Fired today" is blank when the read model was asked without the recommendation engine — blank is not zero.`,
      body: table({
        caption: 'Signal families: what each reads, what it fired today, how many verdicts exist and what the measured precision is',
        columns: [
          { key: 'domain', label: 'Family', render: (row) => h('div', { class: 'stack-xs' },
            h('strong', null, row.domain),
            h('span', { class: 'muted small' }, row.reads)) },
          { key: 'tier', label: 'Tier', render: (row) => badge(row.tier === 'statistical' ? 'p-valued' : 'rule', row.tier === 'statistical' ? 'good' : 'neutral') },
          { key: 'fired', label: 'Fired today', render: (row) => (row.firedToday === null ? '—' : row.firedToday) },
          { key: 'verdicts', label: 'Verdicts', render: (row) => row.n },
          { key: 'detection', label: 'Detection precision', render: (row) => (row.detection.p === null ? '—' : `${fmtPct(row.detection.p * 100)} · ${fmtCI(row.detection.lo * 100, row.detection.hi * 100, 0)}`) },
          { key: 'actionable', label: 'Actionable precision', render: (row) => (row.actionable.p === null ? '—' : `${fmtPct(row.actionable.p * 100)} · ${fmtCI(row.actionable.lo * 100, row.actionable.hi * 100, 0)}`) },
          { key: 'nn', label: 'Alerts per useful alert', render: (row) => (row.nnAlert === null ? '—' : row.nnAlert) },
          { key: 'status', label: 'Status', render: (row) => badge(STATUS_TEXT[row.status] || row.status, STATUS_TONE[row.status] || 'neutral') },
          { key: 'borrowed', label: 'Borrowed (90%)', render: borrowedCell },
        ],
        rows,
        emptyMessage: 'No family matches that filter.',
      }),
    }),

    card({
      title: 'Why a family can be "unresolved" rather than right or wrong',
      body: h('p', { class: 'muted' },
        'A family is judged over-claiming only when the ',
        h('em', null, 'upper'),
        ` end of the Wilson 95% interval for actionable precision is below the ${report.conventions.precisionFloorPct}% floor, and calibrated only when the `,
        h('em', null, 'lower'),
        ' end clears it. Everything between is printed as unresolved with its interval intact. Calling a 62% observation with a 40–80% interval "good" would be the exact over-claiming this Board exists to catch.'),
    }),
  );
}

/* ----------------------------------------------------------------- verdicts */

function verdictsPanel(ctx, report) {
  const insights = buildInsights(ctx.state, ctx.now);
  const queue = insights.findings
    .filter((f) => f && f.ruleId !== 'SETUP-01' && Number(f.severity) >= 2)
    .slice()
    .sort((a, b) => (b.severity - a.severity) || a.domain.localeCompare(b.domain))
    .slice(0, 12);
  const judged = new Set(report.precision.observations
    .filter((o) => o.source === 'board' && o.day === report.today)
    .map((o) => `${o.domain}|${o.ruleId}`));
  const today = report.today;

  const verdictButtons = (finding) => h('div', { class: 'row-wrap gap-xs' },
    h('button', {
      class: 'btn btn-small btn-ghost',
      type: 'button',
      onClick: () => openVerdictDialog(ctx, finding),
    }, 'Judge this signal'));

  return h('div', { class: 'stack' },
    card({
      title: 'Triage queue — judge the signals you were shown',
      subtitle: 'A verdict is about the rule, never about a person. It is stored as a de-identified digest, so no name enters the ledger.',
      body: queue.length
        ? h('div', { class: 'stack' },
          ...queue.map((finding) => h('div', { class: 'callout stack-xs' },
            h('div', { class: 'row-between' },
              h('div', { class: 'stack-xs' },
                h('span', { class: 'muted small' }, `${finding.ruleId} · ${finding.domain}`),
                h('strong', null, finding.title)),
              badge(finding.severity >= 4 ? 'urgent' : 'watch', finding.severity >= 4 ? 'bad' : 'warn')),
            h('p', { class: 'muted small' }, finding.detail),
            h('div', { class: 'row-between' },
              finding.action ? h('a', { class: 'btn btn-small btn-ghost', href: finding.action.route }, finding.action.label) : h('span'),
              judged.has(`${finding.domain}|${finding.ruleId}`)
                ? badge('Judged today', 'good')
                : verdictButtons(finding)))))
        : emptyState({
          title: 'Nothing was surfaced to judge',
          body: 'The recommendation engine produced no findings from your records, so there is no signal to score. Add a person or a dated record and the suite will have something to test.',
        }),
    }),

    card({
      title: 'Verdict ledger',
      subtitle: `${report.precision.observations.length} verdict(s) across ${report.precision.families.length} family(ies). The early-warning ledger's own verdicts are counted here too — one vocabulary, two places.`,
      body: table({
        caption: 'Verdict ledger by signal family',
        columns: [
          { key: 'domain', label: 'Family', render: (row) => h('strong', null, row.domain) },
          { key: 'n', label: 'Verdicts', render: (row) => row.n },
          { key: 'confirmed', label: 'Real & actionable', render: (row) => row.counts.confirmed },
          { key: 'explained', label: 'Real, cause known', render: (row) => row.counts.explained },
          { key: 'dismissed', label: 'Real, not worth it', render: (row) => row.counts.dismissed },
          { key: 'false', label: 'Noise', render: (row) => row.counts['false-alarm'] },
          { key: 'last', label: 'Last verdict', render: (row) => row.lastVerdictOn || '—' },
          { key: 'status', label: 'Status', render: (row) => badge(STATUS_TEXT[row.status] || row.status, STATUS_TONE[row.status] || 'neutral') },
        ],
        rows: report.precision.families,
        emptyMessage: 'No verdicts yet. The Board cannot score a detector nobody has graded.',
      }),
    }),

    h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, 'A verdict is not a performance review')),
      h('div', { class: 'card-body' }, h('p', { class: 'muted' },
        `Verdicts are recorded for ${today} against a rule id and a digest. There is no field for a person, no per-person precision is computed anywhere in this module, and the calibration task a bad family opens is assigned to the leader — the person who can change a threshold — never to the colleague whose record tripped it.`))),
  );
}

/* ------------------------------------------------------------------- ledger */

function ledgerPanel(ctx, report) {
  const { looks, reviews } = report;
  return h('div', { class: 'stack' },
    card({
      title: 'Recorded looks',
      subtitle: `A look is one pass of the detectors. The p thresholds below are derived from the plan that was in force on that day, never stored.`,
      actions: [
        h('button', {
          class: 'btn btn-small btn-primary',
          type: 'button',
          onClick: () => {
            const result = ctx.api.scanIntegrity();
            if (!result.ok) {
              toast(result.error || 'Integrity scan failed.', 'bad');
              return;
            }
            toast(result.changed
              ? 'Integrity scan recorded today’s look and graded any due review.'
              : 'Integrity scan complete — today’s look was already recorded and no review was due.',
            'good');
          },
        }, 'Run the integrity scan'),
      ],
      body: looks.rows.length
        ? table({
          caption: 'Recorded looks: date, source, series tested, candidates and their p values, the derived per-test threshold and how many candidates survived',
          columns: [
            { key: 'lookOn', label: 'Look', render: (row) => h('div', { class: 'stack-xs' },
              h('strong', null, row.lookOn),
              h('span', { class: 'muted small' }, `#${row.lookIndex} · ${row.source}${row.planInForce ? '' : ' · plan derived from today’s settings'}`)) },
            { key: 'series', label: 'Series', render: (row) => row.seriesTested || '—' },
            { key: 'candidates', label: 'Candidates', render: (row) => row.candidates },
            { key: 'minP', label: 'Strongest p', render: (row) => (row.minP === null ? '—' : row.minP) },
            { key: 'plan', label: 'Plan in force', render: (row) => `${row.alphaPct}% / ${row.plannedLooks} ${row.spending}` },
            { key: 'nominal', label: 'Nominal alpha', render: (row) => (row.boundary.exhausted ? 'exhausted' : (row.boundary.nominalAlpha * 100).toFixed(4) + '%') },
            { key: 'threshold', label: 'Per-test threshold', render: (row) => fmtThreshold(row.boundary.perTestThreshold) },
            { key: 'survivors', label: 'Survivors', render: (row) => (row.boundary.exhausted ? '—' : `${row.survivors} of ${row.candidates}`) },
          ],
          rows: looks.rows.slice().reverse(),
          emptyMessage: 'No looks recorded yet. Run the integrity scan, or a watch scan will record one.',
        })
        : banner({
          tone: 'info',
          title: 'The error budget has never been charged',
          body: 'No look is recorded and no alert exists to reconstruct one from. Until one is, the Board has nothing to charge and nothing to grade — which is itself the honest state of a monitoring programme that has not started.',
        }),
    }),

    card({
      title: 'Frozen reviews',
      subtitle: 'Each review fixes the state of the budget and exactly one prospective claim about the next alerts — then gets graded from the verdicts that followed.',
      actions: [
        h('button', {
          class: 'btn btn-small btn-ghost',
          type: 'button',
          onClick: () => openFreezeReviewDialog(ctx),
        }, 'Freeze a review'),
      ],
      body: reviews.all.length
        ? table({
          caption: 'Frozen signal-integrity reviews with their one prediction and its grade',
          columns: [
            { key: 'label', label: 'Review', render: (row) => h('div', { class: 'stack-xs' },
              h('strong', null, row.label || row.id),
              h('span', { class: 'muted small' }, `frozen ${String(row.frozenAt).slice(0, 10)} · review ${row.reviewOn} · ${row.verdictsScored} verdict(s) at freeze`)) },
            { key: 'budget', label: 'Budget at freeze', render: (row) => `${row.cumulativeAlphaPct ?? '—'}% of ${row.alphaPct}% · ${row.looksUsed}/${row.plannedLooks} looks` },
            { key: 'predicted', label: 'Frozen claim', render: (row) => h('div', { class: 'stack-xs' },
              h('span', null, `${row.predictedAnyFalseAlarmPct}% chance of ≥1 false alarm in the next ${row.horizonAlerts}`),
              h('span', { class: 'muted small' }, row.pooledActionablePct === null ? 'pooled precision withheld' : `pooled actionable ${row.pooledActionablePct}%`)) },
            { key: 'grade', label: 'Grade', render: (row) => (row.graded
              ? h('div', { class: 'stack-xs' },
                h('span', null, row.graded.anyFalse ? 'At least one false alarm' : 'No false alarm'),
                h('span', { class: 'muted small' }, `${row.graded.scored} verdict(s) · Brier ${row.graded.brier}`))
              : badge(row.reviewOn <= report.today ? 'Due' : 'Frozen', row.reviewOn <= report.today ? 'warn' : 'neutral')) },
            { key: 'actions', label: 'Actions', render: (row) => h('div', { class: 'row-wrap gap-xs' },
              !row.graded
                ? h('button', {
                  class: 'btn btn-small btn-ghost',
                  type: 'button',
                  onClick: () => {
                    const result = ctx.api.gradeIntegrityReviewNow(row.id);
                    if (!result.ok) { toast(result.error, 'bad'); return; }
                    toast(`Graded: Brier ${result.grade.brier}.`, 'good');
                    nav(ctx, 'ledger', { review: row.id });
                  },
                }, 'Grade now')
                : null,
              !row.graded
                ? h('button', {
                  class: 'btn btn-small btn-ghost',
                  type: 'button',
                  onClick: () => {
                    confirmDialog({
                      title: 'Remove this frozen review?',
                      message: 'An ungraded review is a claim nothing has tested yet. Removing it loses the record that you expected what you expected.',
                      confirmLabel: 'Remove it',
                      danger: true,
                      onConfirm: () => {
                        const result = ctx.api.deleteIntegrityReview(row.id);
                        if (result.ok) { toast('Review removed.', 'good'); nav(ctx, 'ledger'); }
                        else toast(result.error, 'bad');
                      },
                    });
                  },
                }, 'Remove')
                : null) },
          ],
          rows: reviews.all,
          emptyMessage: 'No reviews frozen yet.',
        })
        : emptyState({
          title: 'Nothing has been frozen',
          body: 'A frozen review is how this screen avoids grading itself after the fact. Freeze one when a few verdicts exist and the claim will mean something.',
        }),
    }),

    reviews.graded.length
      ? card({
        title: 'Does the Board know what it is talking about?',
        body: h('div', { class: 'stack' },
          h('div', { class: 'stat-row' },
            stat({ label: 'Graded reviews', value: reviews.graded.length, hint: `skill is withheld below ${reviews.minGraded}` }),
            stat({ label: 'Mean Brier', value: reviews.meanBrier ?? '—', hint: 'lower is better; 0.25 is a coin flip' }),
            stat({ label: 'Naive Brier', value: reviews.naiveBrier ?? '—', hint: `constant ${reviews.baseRatePct ?? '—'}% forecast` }),
            stat({
              label: 'Skill',
              value: reviews.skillPct === null ? 'withheld' : fmtPct(reviews.skillPct),
              hint: reviews.skillPct === null ? `needs ${reviews.minGraded} graded reviews` : '1 − Brier / naive Brier',
            })),
          h('p', { class: 'muted small' },
            'Skill is measured out of sample against the naive alternative of forecasting the observed base rate every time. A positive figure means the Board’s own frozen probabilities beat repeating one number; a negative figure means they did not, and is printed as it is.'),
        ),
      })
      : null,
  );
}

/* ------------------------------------------------------------------- method */

function methodPanel(ctx, report) {
  const { conventions, looks } = report;
  const rows = [];
  for (const fn of ['pocock', 'obf']) {
    for (const k of [1, Math.max(1, Math.round(conventions.plannedLooks / 2)), conventions.plannedLooks]) {
      const b = lookBoundary({
        spending: fn,
        alpha: conventions.alpha,
        plannedLooks: conventions.plannedLooks,
        lookIndex: k,
        mEff: looks.mEff,
      });
      rows.push({
        spending: fn,
        lookIndex: k,
        cumulative: b.cumulativeAlpha * 100,
        nominal: b.nominalAlpha * 100,
        z: b.zBoundary,
        perTest: b.perTestThreshold,
      });
    }
  }

  return h('div', { class: 'stack' },
    card({
      title: 'Declare the monitoring plan',
      subtitle: 'These four figures decide what the Board can and cannot tell you. Changing one changes the bar, not the truth.',
      body: h('div', { class: 'stack' },
        h('div', { class: 'stat-row' },
          stat({ label: 'Family-wise α', value: `${conventions.alphaPct}%`, hint: 'chance of any false alert across the whole plan' }),
          stat({ label: 'Planned looks', value: conventions.plannedLooks, hint: 'how many times you intend to look' }),
          stat({ label: 'Spending function', value: conventions.spending === 'pocock' ? 'Pocock-like' : 'O’Brien–Fleming-like', hint: 'how α is spread across the looks' }),
          stat({ label: 'Declared ρ', value: `${conventions.rhoPct}%`, hint: `effective tests ${looks.mEff} from ${looks.seriesTested || '—'} series` })),
        h('div', { class: 'row-wrap gap-xs' },
          h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => openDeclarePlanDialog(ctx) }, 'Declare a plan')),
        h('p', { class: 'muted small' },
          'The ρ is a declaration, not an estimate. Two detectors that read the same dates are correlated, so Bonferroni over-counts the independent tests — but nothing in a leadership record can identify that correlation, so the Board takes a number you declare and prints it wherever it is used.'),
      ),
    }),

    card({
      title: 'The arithmetic, printed so you can check it by hand',
      subtitle: `At α = ${conventions.alphaPct}% over ${conventions.plannedLooks} looks and ${looks.mEff} effective test(s).`,
      body: table({
        caption: 'Alpha-spending boundaries for both functions at the first, middle and last planned look',
        columns: [
          { key: 'fn', label: 'Function', render: (row) => (row.spending === 'pocock' ? 'Pocock-like' : 'O’Brien–Fleming-like') },
          { key: 'look', label: 'Look', render: (row) => `${row.lookIndex} of ${conventions.plannedLooks}` },
          { key: 'cum', label: 'Cumulative α*', render: (row) => `${row.cumulative.toFixed(4)}%` },
          { key: 'nom', label: 'This look’s α', render: (row) => `${row.nominal.toFixed(4)}%` },
          { key: 'z', label: 'Boundary z', render: (row) => row.z ?? 'unreachable' },
          { key: 'per', label: 'Per-test threshold', render: (row) => fmtThreshold(row.perTest) },
        ],
        rows,
      }),
    }),

    card({
      title: 'The formulas',
      body: h('div', { class: 'stack' },
        h('p', { class: 'muted' }, h('strong', null, 'O’Brien–Fleming-like spending (Lan–DeMets 1983): '), 'α*(t) = 2 − 2Φ(z_{α/2} / √t), with α*(0) = 0 and α*(1) = α. Look k of K is at t = k/K and receives α*(k/K) − α*((k−1)/K).'),
        h('p', { class: 'muted' }, h('strong', null, 'Pocock-like spending: '), 'α*(t) = α · ln(1 + (e − 1)t). Roughly a constant boundary at every look, at the cost of a weaker final-look alpha.'),
        h('p', { class: 'muted' }, h('strong', null, 'Effective tests (Galwey/Nyholt convention): '), `m_eff = 1 + (m − 1)(1 − ρ). With m = ${looks.seriesTested || '—'} series and ρ = ${conventions.rhoPct}%, that is ${looks.mEff}.`),
        h('p', { class: 'muted' }, h('strong', null, 'Per-test threshold: '), 'the look’s nominal α divided by m_eff. Both the Šidák and Bonferroni readings are available in the engine; the printed figure is the conservative bound because a false alert costs more than a missed one here.'),
        h('p', { class: 'muted' }, h('strong', null, 'Wilson interval: '), 'the score interval for a binomial proportion (1927), printed with its own sample size. It is a statement about the sample, not a guarantee about the next alert.'),
        h('p', { class: 'muted' }, h('strong', null, 'Brier score: '), 'the mean squared error of a probability forecast (1950). Skill is 1 − Brier / naive Brier where the naive forecast is the observed base rate; below three grades it is withheld.'),
      ),
    }),

    card({
      title: 'What this screen refuses to claim',
      body: h('ul', { class: 'evidence-list' },
        h('li', null, 'No p-value is manufactured for a deterministic rule. A predicate over your records has no null distribution, so a Bonferroni-corrected number for it would be arithmetic decoration.'),
        h('li', null, 'No correlation is estimated. ρ is declared; the effective-test figure is a convention with its value printed on every page that uses it.'),
        h('li', null, 'A reconstructed look count is a lower bound, and the screen says which direction that error runs.'),
        h('li', null, 'A precision figure below the verdict floor is withheld, and an interval that straddles the floor is called unresolved rather than favourable.'),
        h('li', null, 'Nothing here is a performance measure for a person. The ledger has no field for one, and no task the rules open is assigned to the colleague whose record tripped the rule.'),
        h('li', null, 'The spending functions bound the error budget of the plan they were given. If the plan is wrong — too few looks, a ρ that is not real — the arithmetic is still right and the answer is still wrong, which is why the plan is printed beside every figure.')),
    }),

    h('p', { class: 'muted small' },
      `Normal quantile for the boundary: Φ⁻¹ computed by Acklam's rational approximation with one Halley step (z(0.975) = ${normalInv(0.975).toFixed(6)}). Every figure on this page is recomputed on render from your records and the settings above — none of it is stored.`),
  );
}

/* ------------------------------------------------------------------- render */

export function renderIntegrity(ctx) {
  const settings = ctx.state.settings || {};
  const insights = buildInsights(ctx.state, ctx.now);
  // The read model is asked *with* today's findings so the Board's own signals
  // can tell "nothing to judge" apart from "seven findings nobody has judged".
  const report = ctx.api.integrityRead(insights.findings);
  // The API read model deliberately runs without the recommendation engine, so
  // the view re-attaches today's fired counts from the engine it already has.
  const firedByDomain = new Map();
  for (const finding of insights.findings) {
    if (!finding || !finding.domain) continue;
    firedByDomain.set(finding.domain, (firedByDomain.get(finding.domain) || 0) + 1);
  }
  report.inventory = report.inventory.map((row) => ({
    ...row,
    firedToday: firedByDomain.get(row.domain) || 0,
  }));
  report.suite = {
    ...report.suite,
    findingsToday: insights.findings.length,
    domainsFiringToday: firedByDomain.size,
  };
  report.today = report.today || dayKey(ctx.now);

  const requested = ctx.query?.get('panel') || 'overview';
  const activePanel = PANELS.some((p) => p.key === requested) ? requested : 'overview';

  const header = pageHeader({
    eyebrow: 'GRADE THE DETECTORS · NEVER THE PEOPLE',
    title: 'Signal integrity',
    subtitle: 'The workspace runs hundreds of checks every time you open it. This is the record of what that procedure costs in false alarms, and how often it has actually been right.',
    actions: [
      h('a', { class: 'btn btn-ghost', href: '#/watch' }, 'Early-warning watch'),
      h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        onClick: () => {
          const text = ctx.api.integrityBriefText();
          if (!downloadText({ filename: `leados-signal-integrity-${report.today}.txt`, text, mime: 'text/plain' })) {
            const modal = openModal({
              title: 'Copy the signal-integrity brief (no names)',
              body: h('textarea', { readOnly: true, rows: 20, 'aria-label': 'Signal integrity brief' }, text),
              footer: [h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => modal.close() }, 'Close')],
            });
          } else {
            toast('No-names integrity brief downloaded.', 'good');
          }
        },
      }, 'Export brief'),
      h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        onClick: () => openDeclarePlanDialog(ctx),
      }, 'Declare plan'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const result = ctx.api.scanIntegrity();
          if (!result.ok) { toast(result.error || 'Integrity scan failed.', 'bad'); return; }
          toast(result.changed
            ? 'Integrity scan recorded the look and propagated what it found.'
            : 'Integrity scan complete — nothing new to record.',
          'good');
        },
      }, 'Run integrity scan'),
    ],
  });

  const emptyWorkspace = !(ctx.state.people || []).length && !(ctx.state.watchAlerts || []).length
    && !(ctx.state.signalVerdicts || []).length;

  const tabBar = tabs({
    items: PANELS,
    active: activePanel,
    ariaLabel: 'Signal integrity sections',
    onSelect: (key) => nav(ctx, key),
  });

  const body = activePanel === 'inventory'
    ? inventoryPanel(ctx, report)
    : activePanel === 'verdicts'
      ? verdictsPanel(ctx, report)
      : activePanel === 'ledger'
        ? ledgerPanel(ctx, report)
        : activePanel === 'method'
          ? methodPanel(ctx, report)
          : overviewPanel(ctx, report);

  return h('div', { class: 'page' },
    header,
    emptyWorkspace
      ? banner({
        tone: 'info',
        title: 'There is nothing to audit yet — and the Board will not invent it',
        body: 'No people, no alerts and no verdicts exist. The Board could print a beautiful empty table, but the honest statement is that a detector suite with nothing to detect has no measurable precision. Add your team, then judge the first few signals it raises.',
        actions: [
          h('a', { class: 'btn btn-primary btn-small', href: '#/people' }, 'Add your team'),
          h('a', { class: 'btn btn-ghost btn-small', href: '#/insights' }, 'See what the suite finds'),
        ],
      })
      : null,
    tabBar,
    body,
  );
}
