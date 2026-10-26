/**
 * app/views/forecasts.js — Forecast Integrity Terminal (`#/forecasts`).
 *
 * One terminal over every prediction the workspace has made: scored promises,
 * open commitments, distribution-free outside-view bands, reviewable
 * challenges and a board-ready brief. All reads come from the pure engine; all
 * writes go through ctx.api. No conflict or anonymous pulse record is read.
 */

import { h, toast, openModal, closeAllModals } from '../ui/dom.js';
import {
  pageHeader, card, stat, badge, banner, tabs, table, emptyState,
} from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { formatDate } from '../core/time.js';
import {
  FORECAST_CHALLENGE_LABELS,
  FORECAST_MIN_SAMPLES,
  forecastIntegrityReport,
} from '../core/domain/forecastIntegrity.js';
import { openForecastChallengeDialog } from '../ui/forecast-modals.js';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'ledgers', label: 'Ledgers & gaps' },
  { key: 'classes', label: 'Reference classes' },
  { key: 'challenges', label: 'Challenges' },
  { key: 'brief', label: 'Board brief' },
];

function fmt(value, unit = '') {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  const text = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n);
  return unit ? `${text} ${unit}` : text;
}

function pct(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `${Math.round(Number(value) * 100)}%`;
}

function toneForConfidence(confidence) {
  if (confidence === 'high') return 'bad';
  if (confidence === 'medium') return 'caution';
  return 'neutral';
}

function sourceLink(ctx, row, label = null) {
  return h('a', {
    class: 'link',
    href: row.sourceRoute || '#/forecasts',
    onClick: (e) => { e.preventDefault(); ctx.navigate(row.sourceRoute || '#/forecasts'); },
  }, label || row.title);
}

function verdictBanner(report) {
  const flagged = report.flaggedClasses.length;
  return banner({
    tone: flagged ? 'bad' : 'info',
    title: report.verdict.label,
    body: report.verdict.detail,
    actions: [
      h('a', { class: 'btn btn-small btn-ghost', href: '#/forecasts?tab=classes' }, flagged ? `${flagged} flagged class(es)` : 'Inspect classes'),
    ],
  });
}

function methodCard(ctx, report) {
  const coverageSelect = h(
    'select',
    {
      id: 'forecast-coverage-target',
      'aria-label': 'Conformal coverage target',
      onChange: () => {
        const result = ctx.api.updateSettings({ forecastCoveragePct: Number(coverageSelect.value) });
        if (!result.ok) toast(result.error, 'bad');
        else { toast('Coverage target updated; bands were recomputed', 'good'); ctx.refresh(); }
      },
    },
    ...[50, 60, 70, 80, 90, 95].map((value) => h('option', { value: String(value) }, `${value}%`)),
  );
  coverageSelect.value = String(Math.round(report.coverageTarget * 100));
  return card({
    title: 'Method — what the numbers mean',
    subtitle: 'Named statistics, visible assumptions, no cloud model.',
    body: h('div', { class: 'prose small stack-sm' },
      h('p', null, h('strong', null, 'Brier (1950) & Murphy (1973): '), 'decision probabilities are scored as proper forecasts and decomposed into reliability, resolution and uncertainty. Probabilities are never mixed with money or days.'),
      h('p', null, h('strong', null, 'Reference-class forecasting: '), 'dimensionless actual ÷ forecast ratios are segmented by quantity, currency and deal direction. Amounts are never pooled across currencies; no FX rate is invented.'),
      h('p', null, h('strong', null, 'Split conformal prediction: '), `the k = ⌈(n+1)(1−α)⌉-th ordered relative residual yields an ${Math.round(report.coverageTarget * 100)}% band with finite-sample coverage ≥ k/(n+1), if future errors are exchangeable with past errors. Below n=${FORECAST_MIN_SAMPLES} only counts are shown.`),
      h('div', { class: 'field' },
        h('label', { class: 'field-label', for: 'forecast-coverage-target' }, 'Coverage target (a team convention, not a truth)'),
        coverageSelect,
      ),
      h('p', { class: 'muted' }, 'The exact sign test, 1.25×/0.80× bias edges and 80% default coverage are explicit operational guardrails. A process change can break exchangeability — that is a reason to re-score, not to claim certainty.'),
    ),
  });
}

function overviewTab(ctx, report) {
  const global = report.global;
  const band = global.band;
  const prob = report.probability;
  const stats = h('div', { class: 'stat-row' },
    stat({ label: 'Scored outcomes', value: report.scored.length, hint: 'settled, explicit actuals' }),
    stat({ label: 'Open promises', value: report.open.length, hint: 'still awaiting outcome' }),
    stat({ label: 'Flagged classes', value: report.flaggedClasses.length, tone: report.flaggedClasses.length ? 'bad' : 'good', hint: 'sign test + bias guardrail' }),
    stat({ label: 'Open challenges', value: report.openChallenges, tone: report.openChallenges ? 'warn' : 'good', hint: 'awaiting leader response' }),
    stat({ label: 'Missing actuals', value: report.missingActuals.length, tone: report.missingActuals.length ? 'warn' : 'good', hint: 'never treated as zero' }),
    stat({ label: 'Range coverage', value: report.coverage.rate === null ? `${report.coverage.covered}/${report.coverage.n}` : pct(report.coverage.rate), hint: 'actuals inside recorded P10–P90' }),
  );

  const globalBand = card({
    title: 'Pooled outside-view band',
    subtitle: 'Descriptive across mixed quantities — never applied to one class automatically.',
    body: band.sufficient
      ? h('div', { class: 'stack-sm' },
          h('div', { class: 'fi-band' },
            h('span', { class: 'fi-band-label' }, `${band.lowFactor}× recorded`),
            h('div', { class: 'fi-band-track', 'aria-hidden': 'true' }, h('span', { class: 'fi-band-fill' })),
            h('span', { class: 'fi-band-label' }, `${band.highFactor}× recorded`),
          ),
          h('p', { class: 'small' }, `From ${band.n} scored ratio outcomes. Finite-sample coverage bound ${pct(band.coverageBound)} for the next exchangeable outcome; observed median ${global.medianRatio}×; exact sign test p=${global.signP}.`),
          h('p', { class: 'muted small' }, 'Mixed quantities are shown for board context only. Challenges use class-specific bands, not this pooled one.'),
        )
      : emptyState({ title: 'Collecting calibration evidence', body: `${band.n} of ${FORECAST_MIN_SAMPLES} scored ratio outcomes. Counts are visible; a band renders only after the sample floor.`, icon: '⌁' }),
  });

  const probabilityCard = card({
    title: 'Decision probability ledger',
    subtitle: 'Brier / Murphy proper scoring — separate from all magnitude forecasts.',
    body: h('div', { class: 'stack-sm' },
      h('div', { class: 'stat-row' },
        stat({ label: 'Reviewed forecasts', value: prob.n, hint: `${prob.openCount} still open` }),
        stat({ label: 'Brier score', value: prob.brier ?? '—', hint: '0 is perfect; 0.25 = always 50%' }),
        stat({ label: 'Mean forecast', value: prob.meanForecast === null ? '—' : pct(prob.meanForecast), hint: 'confidence when decided' }),
        stat({ label: 'Observed rate', value: prob.observedRate === null ? '—' : pct(prob.observedRate), hint: 'good=1, mixed=½, bad=0' }),
      ),
      prob.sufficient
        ? h('p', { class: 'small' }, `Bias ${prob.biasPp} percentage points. Murphy decomposition: reliability ${prob.murphy?.reliability ?? '—'} (lower is better), resolution ${prob.murphy?.resolution ?? '—'} (higher is better), uncertainty ${prob.murphy?.uncertainty ?? '—'}.`)
        : h('p', { class: 'muted small' }, `Counts only below ${FORECAST_MIN_SAMPLES} reviewed forecasts; no calibration verdict is rendered.`),
    ),
  });

  const flagged = card({
    title: 'Classes that need a decision',
    subtitle: 'Systematic bias with an exact sign test, not one dramatic outlier.',
    body: report.flaggedClasses.length
      ? h('div', { class: 'stack-sm' }, ...report.flaggedClasses.slice(0, 5).map((cls) =>
          h('div', { class: 'card fi-class-row' },
            h('div', { class: 'row-between' },
              h('strong', null, cls.label),
              badge(cls.confidence, toneForConfidence(cls.confidence)),
            ),
            h('p', { class: 'small' }, `${cls.verdict.label} · n=${cls.n} · median ${cls.medianRatio}× · p=${cls.signP} · ${cls.openCount} open forecast(s).`),
            h('p', { class: 'muted tiny' }, `Band ${cls.band.lowFactor}×–${cls.band.highFactor}× recorded · coverage bound ${pct(cls.band.coverageBound)}.`),
          )))
      : emptyState({ title: 'No flagged reference class', body: 'Either the evidence is below the sample floor or no directional bias cleared the sign-test guardrail.', icon: '✓' }),
  });

  return h('div', { class: 'stack-md' }, verdictBanner(report), stats, globalBand, probabilityCard, flagged, methodCard(ctx, report));
}

function ledgersTab(ctx, report) {
  const ledgerTable = table({
    columns: [
      { key: 'label', label: 'Ledger', render: (row) => row.label },
      { key: 'family', label: 'Scoring', render: (row) => row.family === 'probability' ? 'Brier / Murphy' : 'ratio + conformal' },
      { key: 'total', label: 'Atoms', render: (row) => row.total },
      { key: 'scored', label: 'Scored', render: (row) => row.scored },
      { key: 'open', label: 'Open', render: (row) => row.open },
    ],
    rows: report.ledgers,
    caption: 'Forecast atoms by source ledger',
    emptyMessage: 'No ledger records yet.',
  });

  const gaps = table({
    columns: [
      { key: 'title', label: 'Record', render: (row) => sourceLink(ctx, row) },
      { key: 'ledger', label: 'Ledger', render: (row) => row.ledger },
      { key: 'reason', label: 'Why it matters', render: (row) => row.reason },
    ],
    rows: report.missingActuals,
    caption: 'Settled records with no actual outcome',
    emptyMessage: 'Every settled forecast has a recorded actual.',
  });

  const atoms = table({
    columns: [
      { key: 'title', label: 'Forecast', render: (row) => sourceLink(ctx, row) },
      { key: 'quantityLabel', label: 'Quantity', render: (row) => row.quantityLabel },
      { key: 'forecast', label: 'Recorded', render: (row) => fmt(row.forecast, row.unit) },
      { key: 'actual', label: 'Actual', render: (row) => row.actual === null ? 'open' : fmt(row.actual, row.unit) },
      { key: 'ratio', label: 'Actual ÷ forecast', render: (row) => row.ratio === null ? '—' : `${fmt(row.ratio)}×` },
      { key: 'status', label: 'State', render: (row) => badge(row.status, row.status === 'scored' ? 'good' : 'neutral') },
      { key: 'evidenceSource', label: 'Evidence', render: (row) => row.evidenceSource },
    ],
    rows: report.atoms.slice(0, 160),
    caption: 'Typed prediction atoms across every source module',
    emptyMessage: 'No quantified forecasts recorded yet.',
  });

  return h('div', { class: 'stack-md' },
    card({ title: 'Cross-module ledger coverage', subtitle: 'One adapter per source module; new modules join the engine through the same registry.', body: ledgerTable }),
    card({ title: 'Measurement gaps', subtitle: `${report.missingActuals.length} settled record(s) without an actual — never inferred, never zero-filled.`, body: gaps }),
    card({ title: 'Prediction atoms', subtitle: report.atoms.length > 160 ? 'Showing the first 160 atoms; the CSV contains all of them.' : 'Every recorded forecast and outcome behind the analysis.', body: atoms }),
  );
}

function classesTab(report) {
  const rows = table({
    columns: [
      { key: 'label', label: 'Reference class', render: (row) => h('strong', null, row.label) },
      { key: 'n', label: 'Scored', render: (row) => row.n },
      { key: 'openCount', label: 'Open', render: (row) => row.openCount },
      { key: 'medianRatio', label: 'Median ratio', render: (row) => row.medianRatio === null ? 'counts only' : `${row.medianRatio}×` },
      { key: 'signP', label: 'Sign p', render: (row) => row.signP ?? '—' },
      { key: 'band', label: 'Conformal band', render: (row) => row.band.sufficient ? `${row.band.lowFactor}×–${row.band.highFactor}×` : '—' },
      { key: 'coverageBound', label: 'Coverage bound', render: (row) => pct(row.band.coverageBound) },
      { key: 'verdict', label: 'Verdict', render: (row) => row.verdict.label },
      { key: 'confidence', label: 'Confidence', render: (row) => badge(row.confidence, toneForConfidence(row.confidence)) },
    ],
    rows: report.classes,
    caption: 'Reference classes with counts-only guardrails and distribution-free bands',
    emptyMessage: 'No reference classes yet — record a quantified forecast and its outcome.',
  });

  const details = report.classes.length
    ? h('div', { class: 'stack-sm' }, ...report.classes.slice(0, 12).map((cls) => card({
        title: cls.label,
        subtitle: cls.verdict.label,
        body: h('div', { class: 'prose small' },
          h('p', null, cls.verdict.detail),
          h('p', null, `${cls.n} scored outcome(s), ${cls.openCount} open forecast(s), ${cls.signGreater} above and ${cls.signLess} below the recorded estimate. Mean ratio ${cls.meanRatio ?? '—'}×, P80 ${cls.p80Ratio ?? '—'}×.`),
          cls.band.sufficient
            ? h('p', null, `The ${Math.round(cls.band.coverageTarget * 100)}% band spans ${cls.band.lowFactor}×–${cls.band.highFactor}× a recorded estimate; finite-sample marginal coverage is at least ${pct(cls.band.coverageBound)} under exchangeability.`)
            : h('p', { class: 'muted' }, cls.band.reason),
          h('p', { class: 'muted' }, 'The source estimate is never rewritten. Only a leader can accept, adapt or dismiss the outside view.'),
        ),
      })))
    : emptyState({ title: 'No classes to analyse', body: 'Classes appear when a quantified forecast is recorded.', icon: '⌁' });

  return h('div', { class: 'stack-md' },
    card({ title: 'Reference-class scoreboard', subtitle: 'Ratios are dimensionless; currency, quantity and deal direction stay segmented.', body: rows }),
    details,
  );
}

function challengesTab(ctx, report) {
  const challenges = (ctx.state.forecastChallenges || []).slice().sort((a, b) =>
    Number(b.status === 'open') - Number(a.status === 'open') || String(b.createdAt).localeCompare(String(a.createdAt)));
  const open = challenges.filter((c) => c.status === 'open');
  const paused = ctx.state.settings?.forecastAutoPropagate === false;

  const controls = h('div', { class: 'row-gap wrap' },
    h('button', {
      class: 'btn btn-ghost', type: 'button',
      onClick: () => {
        const result = ctx.api.syncForecastIntegrity();
        toast(result.ok
          ? `Scan complete: ${result.created} new challenge(s), ${result.openChallenges} open, ${result.flaggedClasses} flagged class(es)`
          : result.error, result.ok ? 'good' : 'bad');
        ctx.refresh();
      },
    }, 'Re-run integrity scan'),
    h('button', {
      class: 'btn btn-ghost', type: 'button',
      onClick: () => {
        const result = ctx.api.updateSettings({ forecastAutoPropagate: paused });
        toast(result.ok ? (paused ? 'Automatic outside-view challenges resumed' : 'Automatic outside-view challenges paused') : result.error, result.ok ? 'good' : 'bad');
        ctx.refresh();
      },
    }, paused ? 'Resume automatic propagation' : 'Pause automatic propagation'),
    h('a', { class: 'btn btn-ghost', href: '#/forecasts?tab=brief' }, 'Open board brief'),
  );

  const rows = table({
    columns: [
      { key: 'title', label: 'Source forecast', render: (row) => sourceLink(ctx, row) },
      { key: 'recordedForecast', label: 'Recorded', render: (row) => fmt(row.recordedForecast, row.unit) },
      { key: 'referenceClassCentral', label: 'Outside view', render: (row) => fmt(row.referenceClassCentral, row.unit) },
      { key: 'band', label: 'Conformal band', render: (row) => `${fmt(row.bandLow)}–${fmt(row.bandHigh)} ${row.unit || ''}` },
      { key: 'coverageBound', label: 'Coverage', render: (row) => pct(row.coverageBound) },
      { key: 'bandScope', label: 'Band source', render: (row) => row.bandScope === 'mixed-quantity-global' ? 'pooled prior (low confidence)' : 'own class' },
      { key: 'evidenceN', label: 'n', render: (row) => row.evidenceN },
      { key: 'confidence', label: 'Confidence', render: (row) => badge(row.confidence, toneForConfidence(row.confidence)) },
      { key: 'status', label: 'Response', render: (row) => badge(FORECAST_CHALLENGE_LABELS[row.status] || row.status, row.status === 'open' ? 'caution' : 'good') },
      { key: 'action', label: 'Action', render: (row) => row.status === 'open'
        ? h('button', {
            class: 'btn btn-small btn-primary', type: 'button',
            onClick: () => openForecastChallengeDialog(ctx, row, () => ctx.refresh()),
          }, 'Respond')
        : h('span', { class: 'muted tiny' }, formatDate(row.respondedOn) || 'recorded') },
    ],
    rows: challenges,
    caption: 'Outside-view challenges and leader responses',
    emptyMessage: 'No challenges yet. A scan or a new settled outcome will create them only when evidence is sufficient.',
  });

  const notes = h('ul', { class: 'plain-list' }, ...open.slice(0, 6).map((c) =>
    h('li', null,
      h('strong', null, c.title),
      h('span', { class: 'muted tiny' }, ` · ${c.note || 'Outside-view challenge'}`),
    )));

  return h('div', { class: 'stack-md' },
    paused
      ? banner({ tone: 'caution', title: 'Automatic propagation is paused', body: 'Existing challenges remain readable. A manual scan still re-scores the workspace; no new records are created by outcome events while paused.' })
      : null,
    card({ title: 'Challenge controls', subtitle: `${open.length} open · ${challenges.length} total · rules RULE-FCI-01..03`, body: controls }),
    card({ title: 'Outside-view challenges', subtitle: 'Recorded estimate, reference-class central estimate and distribution-free band are stored separately.', body: rows }),
    open.length ? card({ title: 'What each challenge is saying', body: notes }) : null,
  );
}

function briefTab(ctx, report) {
  const brief = report.boardBrief;
  const fallback = (title, text) => openModal({
    title,
    description: 'The browser blocked a direct file download. Select all and copy the text below.',
    body: h('textarea', { class: 'fi-brief-input', rows: 16, 'aria-label': `${title} text`, readonly: true }, text),
    footer: [h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Close')],
    size: 'lg',
  });

  const downloadBrief = () => {
    const ok = downloadText({ filename: `leados-forecast-integrity-${report.generatedOn}.txt`, text: brief, mime: 'text/plain;charset=utf-8' });
    if (ok) toast('Board brief downloaded', 'good');
    else fallback('Forecast integrity brief', brief);
  };
  const copyBrief = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(brief);
        toast('Board brief copied to clipboard', 'good');
      } else {
        fallback('Copy forecast integrity brief', brief);
      }
    } catch {
      fallback('Copy forecast integrity brief', brief);
    }
  };
  const downloadCsv = () => {
    const result = ctx.exportCSV('forecasts');
    if (!result.ok) { toast(result.error || 'Could not export the forecast CSV.', 'bad'); return; }
    const ok = downloadText({ filename: result.filename, text: result.csv, mime: 'text/csv;charset=utf-8' });
    if (ok) toast('Forecast integrity CSV downloaded', 'good');
    else fallback('Forecast integrity CSV', result.csv);
  };

  return h('div', { class: 'stack-md' },
    card({
      title: 'Board-ready forecast integrity brief',
      subtitle: `Generated ${formatDate(ctx.now)} · deterministic plain language · no network call`,
      actions: [
        h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: copyBrief }, 'Copy brief'),
        h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: downloadCsv }, 'Download CSV'),
        h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: downloadBrief }, 'Download brief'),
      ],
      body: h('pre', { class: 'fi-brief', tabindex: '0', 'aria-label': 'Board-ready forecast integrity brief' }, brief),
    }),
    card({
      title: 'What this brief does not claim',
      body: h('div', { class: 'prose small' },
        h('p', null, 'It is not an AI prediction, an invoice reconciliation, a person-performance score, or proof that one intervention caused an outcome. It is a transparent, local record of promises made and outcomes explicitly recorded.'),
        h('p', null, 'Confidential conflict records and anonymous pulse responses are never read by this engine. Source estimates remain immutable; only the leader can change a plan.'),
      ),
    }),
  );
}

export function renderForecasts(ctx) {
  const { state, now } = ctx;
  const report = forecastIntegrityReport(state, now);
  const requested = ctx.query.get('tab') || 'overview';
  const active = TABS.some((t) => t.key === requested) ? requested : 'overview';
  const header = pageHeader({
    eyebrow: 'Decision intelligence',
    title: 'Forecast integrity',
    subtitle: 'Every promise, every outcome, one confidence-labelled outside view.',
    meta: `Schema v26 · ${report.atoms.length} prediction atoms · ${report.classes.length} reference classes`,
    actions: [
      h('a', { class: 'btn btn-ghost', href: '#/decisions' }, 'Decision calibration'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const result = ctx.api.syncForecastIntegrity();
          toast(result.ok ? `Integrity scan complete · ${result.flaggedClasses} flagged class(es)` : result.error, result.ok ? 'good' : 'bad');
          ctx.refresh();
        },
      }, 'Run integrity scan'),
    ],
  });
  const tabBar = tabs({
    items: TABS.map((t) => ({ ...t, count: t.key === 'challenges' ? report.openChallenges : undefined })),
    active,
    onSelect: (key) => ctx.navigate(key === 'overview' ? '#/forecasts' : `#/forecasts?tab=${key}`),
    ariaLabel: 'Forecast integrity sections',
  });
  const body = active === 'overview' ? overviewTab(ctx, report)
    : active === 'ledgers' ? ledgersTab(ctx, report)
      : active === 'classes' ? classesTab(report)
        : active === 'challenges' ? challengesTab(ctx, report)
          : briefTab(ctx, report);
  return h('div', { class: 'page' }, header, tabBar, body);
}
