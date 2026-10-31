/**
 * app/views/evidence.js — the Evidence Terminal (`#/evidence`, Schema v66).
 *
 * Six panels over one question: **what has actually worked here, and what is
 * the next experiment worth?**
 *
 *   Overview     what the workspace can and cannot say yet, and the findings
 *                at severity 3 or above
 *   What works   every pooled (intervention × outcome) cell with its forest
 *                plot, heterogeneity, small-study asymmetry and leave-one-out
 *   Recommend    every lever ranked by expected effect plus the *priced* value
 *                of what one more trial would teach
 *   My judgement how the leader's own pre-registered probabilities have scored,
 *                against the single average they were trying to beat
 *   Reviews      frozen reviews and their interval-coverage grades
 *   Method       the estimators, the floors, and every refusal, prominently
 *
 * The page refuses what it cannot support: a cell below the pooling floor is a
 * count; heterogeneity outranks the point estimate; exploratory hypotheses are
 * displayed and never pooled; no person is scored anywhere on this screen.
 */

import { h, svg, toast } from '../ui/dom.js';
import {
  pageHeader, card, stat, badge, banner, tabs, emptyState, kv, table,
} from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { dayKey } from '../core/time.js';
import {
  EVIDENCE_FAMILY_LABELS,
  RESOLUTION_SOURCE_LABELS,
  evidenceReport,
} from '../core/domain/evidence.js';
import { openFreezeReviewDialog, openGradeReviewDialog } from '../ui/evidence-modals.js';

const PANELS = [
  { key: 'overview', label: 'Overview' },
  { key: 'works', label: 'What works' },
  { key: 'recommend', label: 'What next' },
  { key: 'judgement', label: 'My judgement' },
  { key: 'reviews', label: 'Reviews' },
  { key: 'method', label: 'Method' },
];

function num(value, dp = 2) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return Number(value).toFixed(dp);
}

function pctText(value, dp = 2) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  return `${n > 0 ? '+' : ''}${n.toFixed(dp)}%`;
}

function verdictTone(verdict) {
  if (verdict === 'works-here') return 'good';
  if (verdict === 'harms-here') return 'bad';
  if (verdict === 'heterogeneous') return 'warn';
  return 'neutral';
}

function navigate(ctx, panel, params = {}) {
  const query = new URLSearchParams({ panel });
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  ctx.navigate(`#/evidence?${query.toString()}`);
}

/* ------------------------------------------------------------ forest plot */

/**
 * A forest plot drawn as inline SVG: one row per study with its confidence
 * interval, then the pooled diamond. It is drawn in data coordinates and
 * scaled once, so the geometry cannot disagree with the numbers in the table
 * beside it.
 */
function forestPlot(cell) {
  const rows = cell.units.filter((u) => u.grade === 'confirmatory');
  if (!rows.length || !cell.pool) return null;
  const width = 720;
  const rowHeight = 26;
  const top = 26;
  const bottom = 42;
  const height = top + rows.length * rowHeight + bottom;
  const padLeft = 150;
  const padRight = 24;

  const values = rows.flatMap((row) => [row.effect - 1.96 * row.se, row.effect + 1.96 * row.se]);
  values.push(cell.pool.reportedLo, cell.pool.reportedHi, 0);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const scale = (value) => padLeft + ((value - lo) / span) * (width - padLeft - padRight);
  const zeroX = scale(0);

  const children = [];
  children.push(svg('line', {
    x1: zeroX, y1: top - 10, x2: zeroX, y2: height - bottom + 14,
    stroke: 'var(--line, #3a4152)', 'stroke-width': 1, 'stroke-dasharray': '4 3',
  }));
  children.push(svg('text', {
    x: zeroX, y: top - 14, 'text-anchor': 'middle', class: 'chart-label',
  }, '0'));

  rows.forEach((row, index) => {
    const y = top + index * rowHeight + rowHeight / 2;
    const x1 = scale(row.effect - 1.96 * row.se);
    const x2 = scale(row.effect + 1.96 * row.se);
    const xc = scale(row.effect);
    const weight = Math.max(3, Math.min(11, 220 / (row.se || 1)));
    children.push(svg('line', { x1, y1: y, x2, y2: y, stroke: 'var(--muted, #8b93a7)', 'stroke-width': 1.5 }));
    children.push(svg('line', { x1: x1, y1: y - 4, x2: x1, y2: y + 4, stroke: 'var(--muted, #8b93a7)', 'stroke-width': 1.5 }));
    children.push(svg('line', { x1: x2, y1: y - 4, x2: x2, y2: y + 4, stroke: 'var(--muted, #8b93a7)', 'stroke-width': 1.5 }));
    children.push(svg('rect', {
      x: xc - weight / 2, y: y - weight / 2, width: weight, height: weight,
      fill: row.effect >= 0 ? 'var(--good, #35a56f)' : 'var(--bad, #d4553f)', opacity: 0.85,
    }));
    children.push(svg('text', {
      x: padLeft - 10, y: y + 4, 'text-anchor': 'end', class: 'chart-label',
    }, String(row.at || `#${index + 1}`)));
  });

  const pooledY = top + rows.length * rowHeight + rowHeight / 2;
  const pl = scale(cell.pool.pooled);
  const half = Math.abs(scale(cell.pool.reportedHi) - scale(cell.pool.reportedLo)) / 2;
  const halfSe = Math.abs(scale(cell.pool.pooled + cell.pool.se) - pl);
  children.push(svg('line', {
    x1: scale(cell.pool.reportedLo), y1: pooledY, x2: scale(cell.pool.reportedHi), y2: pooledY,
    stroke: 'var(--accent, #6ea8fe)', 'stroke-width': 2,
  }));
  children.push(svg('polygon', {
    points: `${pl - halfSe},${pooledY} ${pl},${pooledY - 7} ${pl + halfSe},${pooledY} ${pl},${pooledY + 7}`,
    fill: 'var(--accent, #6ea8fe)',
  }));
  children.push(svg('text', {
    x: padLeft - 10, y: pooledY + 4, 'text-anchor': 'end', class: 'chart-label',
  }, 'Pooled'));
  children.push(svg('text', {
    x: pl, y: pooledY + 20, 'text-anchor': 'middle', class: 'chart-label',
  }, `${pctText(cell.pool.pooled)} [${pctText(cell.pool.reportedLo)}, ${pctText(cell.pool.reportedHi)}]`));

  return svg('svg', {
    viewBox: `0 0 ${width} ${height}`,
    class: 'chart-svg',
    role: 'img',
    'aria-label': `Forest plot for ${cell.interventionLabel} on ${cell.outcomeLabel}: ${rows.length} pre-registered studies pooling to ${pctText(cell.pool.pooled)} percent with an interval from ${pctText(cell.pool.reportedLo)} to ${pctText(cell.pool.reportedHi)}.`,
    preserveAspectRatio: 'xMidYMid meet',
  }, ...children);
}

/* --------------------------------------------------------------- overview */

function overviewPanel(ctx, report) {
  const blocks = [];
  const { conventions, counts } = report;

  if (!counts.effectUnits && !counts.resolutionUnits) {
    blocks.push(banner({
      tone: 'info',
      title: 'There is no evidence in this workspace yet — and that is a fact, not a gap to fill with confidence',
      body: 'A finding needs a hypothesis written before the window closed and a study scored after it. Everything on this page is derived from those two things; none of it is inferred from what the records look like today.',
      actions: [h('button', {
        class: 'btn',
        type: 'button',
        onClick: () => ctx.navigate('#/impact'),
      }, 'Pre-register a study')],
    }));
  }

  blocks.push(h('div', { class: 'stat-grid' },
    stat({
      label: 'Scored studies',
      value: String(counts.effectUnits),
      hint: `${counts.confirmatoryUnits} pre-registered · ${counts.exploratoryUnits} retrospective (never pooled)`,
    }),
    stat({
      label: 'Poolable cells',
      value: `${counts.eligibleCells} / ${counts.cells}`,
      hint: `A cell pools at ${conventions.minPoolStudies} pre-registered studies`,
    }),
    stat({
      label: 'Reliable positives',
      value: String(counts.reliablePositive),
      tone: counts.reliablePositive ? 'good' : '',
      hint: 'Intervals entirely on the useful side of zero',
    }),
    stat({
      label: 'Reliable negatives',
      value: String(counts.reliableNegative),
      tone: counts.reliableNegative ? 'bad' : '',
      hint: 'Intervals entirely on the harmful side',
    }),
    stat({
      label: 'Unreplicated results',
      value: String(counts.unreplicated),
      tone: counts.unreplicated ? 'warn' : '',
      hint: 'One independent result, zero replications',
    }),
    stat({
      label: 'Resolved predictions',
      value: String(counts.resolutionUnits),
      hint: counts.resolutionUnits >= conventions.minResolutions
        ? `Scored · skill ${num(report.resolutions.skill, 2)}`
        : `Counts only below ${conventions.minResolutions}`,
    })));

  if (counts.eligibleCells) {
    const best = report.effects.eligibleCells
      .filter((cell) => cell.verdict === 'works-here')
      .sort((a, b) => b.pool.pooled - a.pool.pooled)[0];
    const worst = report.effects.eligibleCells
      .filter((cell) => cell.verdict === 'harms-here')
      .sort((a, b) => a.pool.pooled - b.pool.pooled)[0];
    const lines = [];
    if (best) lines.push(`${best.interventionLabel} on ${best.outcomeLabel.toLowerCase()} pools to ${pctText(best.pool.pooled)} across ${best.nConfirmatory} pre-registered studies — the best-evidenced thing this workspace knows.`);
    if (worst) lines.push(`${worst.interventionLabel} on ${worst.outcomeLabel.toLowerCase()} pools to ${pctText(worst.pool.pooled)} — a reason to stop, not to try harder.`);
    if (lines.length) {
      blocks.push(card({
        title: 'The two sentences the evidence supports',
        body: h('ul', { class: 'stack-xs' }, ...lines.map((line) => h('li', null, line))),
      }));
    }
  }

  const signals = (report.signals || []);
  if (signals.length) {
    blocks.push(card({
      title: 'Findings',
      subtitle: 'Every sentence here is about a practice, never about a person.',
      body: h('ul', { class: 'stack' },
        ...signals.map((signal) => h('li', null,
          h('div', { class: 'row gap-xs wrap' },
            badge(signal.id, verdictTone(signal.verdict || '') || 'neutral'),
            badge(`severity ${signal.severity}`, signal.severity >= 4 ? 'bad' : signal.severity >= 3 ? 'warn' : 'neutral'),
            h('strong', null, signal.title)),
          h('p', { class: 'muted small' }, signal.detail)))),
    }));
  }

  blocks.push(card({
    title: 'What this page will not do',
    body: h('ul', { class: 'muted small stack-xs' },
      h('li', null, `Pool a cell with fewer than ${conventions.minPoolStudies} pre-registered studies. Below the floor it prints counts.`),
      h('li', null, 'Pool an exploratory hypothesis. A hypothesis declared after the window closed is displayed and never enters a pooled estimate.'),
      h('li', null, 'Mix designs. An interrupted time series and a probability forecast are separate panels with separate methods.'),
      h('li', null, `Present a pooled average as a policy when heterogeneity is large (I² ≥ 75% and Q significant at 0.10).`),
      h('li', null, 'Score, rank or name a person. Every figure attaches to an intervention in a system.')),
  }));

  return h('div', { class: 'stack' }, ...blocks);
}

/* ------------------------------------------------------------------ works */

function worksPanel(ctx, report) {
  const focus = ctx.query.get('cell') || report.effects.focusOutcomeId;
  const cells = report.effects.cells;
  if (!cells.length) {
    return emptyState({
      title: 'No intervention has been scored against a metric yet',
      body: 'Pooling needs at least one pre-registered study. Declare the hypothesis before the window closes, then score it when the window ends — those are the only two steps, and neither can be done afterwards.',
      action: h('button', { class: 'btn', type: 'button', onClick: () => ctx.navigate('#/impact') }, 'Open the impact ledger'),
    });
  }

  const rows = table({
    columns: [
      { label: 'Intervention', render: (row) => h('strong', null, row.interventionLabel) },
      { label: 'Outcome', render: (row) => row.outcomeLabel },
      { label: 'Studies', render: (row) => `${row.nConfirmatory} pre / ${row.nExploratory} retro` },
      { label: 'Pooled', render: (row) => (row.pool ? h('strong', null, pctText(row.pool.pooled)) : badge('counts only', 'neutral')) },
      { label: 'Interval', render: (row) => (row.pool ? `${pctText(row.pool.reportedLo)} … ${pctText(row.pool.reportedHi)}` : '—') },
      { label: 'I²', render: (row) => (row.pool && row.pool.heterogeneity.reportable ? `${num(row.pool.heterogeneity.i2, 0)}%` : '—') },
      { label: 'Verdict', render: (row) => badge(row.verdictMeta.label, verdictTone(row.verdict)) },
    ],
    rows: cells.map((cell) => ({ ...cell, className: cell.key === focus ? 'is-active' : '' })),
    caption: 'Pooled intervention effects by outcome',
  });

  const eligible = cells.filter((cell) => cell.pool);
  const plots = eligible.length
    ? h('div', { class: 'stack' }, ...eligible.slice(0, 8).map((cell) => card({
      title: `${cell.interventionLabel} → ${cell.outcomeLabel}`,
      subtitle: cell.refusalReason || `${cell.nConfirmatory} pre-registered stud${cell.nConfirmatory === 1 ? 'y' : 'ies'} · ${cell.roots} independent result(s), ${cell.replications} replication(s)`,
      actions: [badge(cell.verdictMeta.label, verdictTone(cell.verdict))],
      body: h('div', { class: 'stack' },
        forestPlot(cell),
        h('div', { class: 'row gap wrap small muted' },
          h('span', null, `τ² ${num(cell.pool.heterogeneity.tau2, 3)} · τ ${num(cell.pool.heterogeneity.tau)}`),
          h('span', null, `Q ${num(cell.pool.heterogeneity.q, 2)} on ${cell.pool.heterogeneity.df} df, p ${num(cell.pool.heterogeneity.pQ)}`),
          h('span', null, `Hartung–Knapp ${pctText(cell.pool.hkLo)} … ${pctText(cell.pool.hkHi)}`),
          cell.egger
            ? h('span', null, `Egger intercept ${num(cell.egger.intercept)} (p ${num(cell.egger.p)})`)
            : h('span', null, cell.eggerRefusal || `Egger needs ${report.conventions.minEggerStudies} studies`),
          cell.overlap && cell.overlap.count > 0
            ? h('span', { title: 'Two interrupted time series over the same metric whose windows overlap share observations, so their estimates are not independent and the pooled standard error is optimistic by an unmeasured amount.' },
              `${cell.overlap.count} overlapping window pair(s) — pooled SE optimistic`)
            : null),
        cell.leaveOneOut.length
          ? h('details', null,
            h('summary', { class: 'small' }, 'Leave-one-out sensitivity'),
            h('ul', { class: 'small muted stack-xs' },
              ...cell.leaveOneOut.map((entry) => h('li', { class: entry.influential ? 'ev-loo-influential' : null },
                `without ${entry.id}: ${pctText(entry.pooled)} [${pctText(entry.ciLo)}, ${pctText(entry.ciHi)}]`
                + (entry.influential ? ` — that one study moves the pooled answer by ${num(entry.shift)} points` : '')))))
          : null,
        cell.cumulative && cell.cumulative.length > 2
          ? h('details', null,
            h('summary', { class: 'small' }, 'Cumulative pooling (in the order the evidence arrived)'),
            h('ul', { class: 'small muted stack-xs' },
              ...cell.cumulative.map((entry) => h('li', null, entry.insufficient
                ? `after ${entry.k} study(ies): not poolable`
                : `after ${entry.k} studies: ${pctText(entry.pooled)} [${pctText(entry.ciLo)}, ${pctText(entry.ciHi)}]`))))
          : null,
        h('p', { class: 'muted small' }, cell.verdictMeta.plain)),
    })))
    : banner({
      tone: 'info',
      title: 'Nothing is poolable yet',
      body: `Every cell on this page has fewer than ${report.conventions.minPoolStudies} pre-registered studies. The table above shows counts; the pooled estimates appear when the evidence is there.`,
    });

  return h('div', { class: 'stack' },
    banner({
      tone: 'info',
      title: 'Heterogeneity outranks the point estimate',
      body: 'When the studies disagree by more than sampling noise allows, the pooled average is a statement about the arithmetic rather than about your team. That cell is labelled “depends where you use it” and it is the most useful row on the page.',
    }),
    card({ title: 'Every cell', subtitle: 'Pre-registered studies pool; retrospective ones are counted and shown.', body: rows }),
    plots);
}

/* -------------------------------------------------------------- recommend */

function recommendPanel(ctx, report) {
  const recommendation = report.recommendation;
  if (!recommendation) {
    return emptyState({
      title: 'No outcome has enough evidence to rank anything',
      body: 'The recommendation panel ranks every lever on one metric. It appears once at least one intervention has been scored against something.',
      action: h('button', { class: 'btn', type: 'button', onClick: () => ctx.navigate('#/impact') }, 'Open the impact ledger'),
    });
  }

  const outcomeSelect = h('select', {
    'aria-label': 'Outcome to rank against',
    onChange: (event) => {
      const params = new URLSearchParams(ctx.search || '');
      params.set('outcome', event.target.value);
      ctx.navigate(`#/evidence?panel=recommend&${params.toString()}`);
    },
  }, ...report.effects.outcomes.map((outcome) => h('option', {
    value: outcome.outcomeId || '',
    selected: outcome.outcomeId === recommendation.outcomeId,
  }, outcome.label)));

  const rows = table({
    columns: [
      { label: '#', render: (row) => String(row.position) },
      { label: 'Lever', render: (row) => h('strong', null, row.label) },
      { label: 'Evidence', render: (row) => (row.tested ? `${row.nConfirmatory} pre-registered` : badge('untested', 'neutral')) },
      { label: 'Expected effect', render: (row) => (Number.isFinite(row.mean) ? h('strong', null, pctText(row.mean)) : '—') },
      { label: 'Lower bound', render: (row) => (Number.isFinite(row.lcb) ? pctText(row.lcb) : '—') },
      { label: 'Value of one trial', render: (row) => (Number.isFinite(row.evsi) ? num(row.evsi) : '—') },
      { label: 'Information ceiling', render: (row) => (Number.isFinite(row.evpi) ? num(row.evpi) : '—') },
      { label: 'Rank', render: (row) => (Number.isFinite(row.rank) ? num(row.rank) : '—') },
      { label: 'Reading', render: (row) => badge(row.verdictMeta.label, verdictTone(row.verdict)) },
    ],
    rows: recommendation.rows,
    caption: `Ranked levers for ${recommendation.outcomeLabel}`,
  });

  return h('div', { class: 'stack' },
    banner({
      tone: 'info',
      title: `Ranked on expected effect plus the priced value of finding out, over the next ${recommendation.horizonDecisions} decisions`,
      body: `The exploitation term is the cell's empirical-Bayes posterior mean — the random-effects model's own shrinkage, not a penalty anyone chose. The exploration term is the expected value of one more pre-registered trial, priced over ${recommendation.horizonDecisions} future applications, because a lever you will use six more times is worth learning about six times over. An untested lever is not given zero: it is given this outcome's grand mean (${num(recommendation.prior.grandMean)}%) and the between-lever spread (${num(recommendation.prior.sd)}) as its prior.`,
    }),
    card({
      title: `What to do about ${recommendation.outcomeLabel.toLowerCase()}`,
      subtitle: 'Change the outcome, or change the horizon in Settings — the horizon is the one number that decides how much experimenting is worth.',
      actions: [outcomeSelect],
      body: rows,
    }),
    h('div', { class: 'stat-grid' },
      stat({ label: 'Grand mean across tested levers', value: pctText(recommendation.prior.grandMean), hint: 'The prior an untested lever is priced at' }),
      stat({ label: 'Between-lever spread', value: num(recommendation.prior.sd), hint: 'How much levers actually differ on this outcome' }),
      stat({ label: 'Typical study noise', value: num(recommendation.prior.noise), hint: 'Median within-study standard error' }),
      stat({ label: 'Exploration weight', value: num(recommendation.exploreWeight), hint: 'How much a point of learning counts against a point of effect' })),
    card({
      title: 'Why an untested lever can outrank a tested one',
      body: h('p', { class: 'muted' },
        'Because “we have not tried it” is not the same as “it does not work”. When a lever has never been tested on this outcome, the only honest claim available is the value of the information a trial would buy — and over enough future decisions that value can exceed the expected effect of a lever you already know is mediocre. The terminal says which case it is in the Reading column.'),
    }));
}

/* ------------------------------------------------------------- judgement */

function judgementPanel(ctx, report) {
  const { resolutions, conventions } = report;
  if (!resolutions.n) {
    return emptyState({
      title: 'No pre-registered probability has resolved yet',
      body: 'Three places in this workspace record a probability before the answer is known: an intervention hypothesis, an assumption’s prior, and a support plan frozen at adoption. When any of them resolves, it is scored here against the one number it was trying to beat — the base rate.',
    });
  }

  const blocks = [];
  if (!resolutions.scored) {
    blocks.push(banner({
      tone: 'info',
      title: `Counts only below ${conventions.minResolutions} resolved predictions`,
      body: `${resolutions.n} resolved so far. Calibration and skill are withheld until there are ${conventions.minResolutions}, because a Brier score over three forecasts is a description of three forecasts, not of a forecaster.`,
    }));
  }

  blocks.push(h('div', { class: 'stat-grid' },
    stat({ label: 'Resolved predictions', value: String(resolutions.n), hint: `${resolutions.k} came true` }),
    stat({
      label: 'Brier score',
      value: resolutions.scored ? num(resolutions.brier, 3) : '—',
      hint: resolutions.scored ? `Base-rate reference ${num(resolutions.referenceBrier, 3)}` : 'Below the floor',
    }),
    stat({
      label: 'Skill vs base rate',
      value: resolutions.scored && resolutions.skill !== null ? num(resolutions.skill * 100, 1) : '—',
      tone: resolutions.scored && resolutions.skill !== null ? (resolutions.skill > 0 ? 'good' : 'bad') : '',
      hint: 'Negative means the numbers carry less information than their own average',
    }),
    stat({
      label: 'Confidence minus reality',
      value: resolutions.scored ? `${num(resolutions.gapPp, 1)}pp` : '—',
      tone: resolutions.scored && resolutions.overconfident ? 'bad' : '',
      hint: 'Calibration in the large',
    })));

  if (resolutions.scored && resolutions.calibrationZ !== null) {
    blocks.push(card({
      title: 'Is the gap chance or habit?',
      body: h('p', { class: 'muted' },
        `Observed against expected: z = ${num(resolutions.calibrationZ)}, two-sided p = ${num(resolutions.calibrationP)}. `,
        resolutions.overconfident
          ? 'That is a habit, and every EVPI figure in the Information Value terminal is an upper bound over beliefs like these.'
          : (resolutions.underconfident
            ? 'The confidences are running behind reality, which makes every “is it worth finding out?” answer too eager.'
            : 'The gap is inside what chance alone would produce, so the honest reading is “no detected miscalibration”.')),
    }));
  }

  blocks.push(card({
    title: 'By source',
    subtitle: 'Resolved rates are descriptive; the pooled rate uses a log-odds random-effects model with the Haldane–Anscombe correction.',
    body: table({
      columns: [
        { label: 'Source', render: (row) => row.label },
        { label: 'Resolved', render: (row) => String(row.n) },
        { label: 'Came true', render: (row) => `${num(row.observedRatePct, 0)}%` },
        { label: 'Wilson 90%', render: (row) => (row.scored ? `${num(row.wilson.lo, 0)} … ${num(row.wilson.hi, 0)}` : '—') },
        { label: 'Mean stated', render: (row) => (row.scored ? `${num(row.meanPredictedPct, 0)}%` : '—') },
        { label: 'Gap', render: (row) => (row.scored ? `${num(row.calibrationGapPp, 1)}pp` : '—') },
        { label: 'Brier', render: (row) => (row.scored ? num(row.brier, 3) : '—') },
        { label: 'Skill', render: (row) => (row.scored && row.skill !== null ? num(row.skill * 100, 1) : '—') },
      ],
      rows: resolutions.cells,
      caption: 'Resolved pre-registered probabilities by source',
    }),
  }));

  if (resolutions.pool) {
    blocks.push(card({
      title: 'Pooled resolution rate',
      subtitle: resolutions.pool.note,
      body: h('p', { class: 'muted' },
        `Across ${resolutions.pool.n} sources the pooled log-odds gives a resolution rate of ${num(resolutions.pool.pooledRatePct, 1)}% `
        + `[${num(resolutions.pool.rateLoPct, 1)}%, ${num(resolutions.pool.rateHiPct, 1)}%], τ² ${num(resolutions.pool.heterogeneity.tau2, 3)}.`),
    }));
  }

  blocks.push(card({
    title: 'Funnel',
    subtitle: 'Effect size against precision. Asymmetry is only read above the study floor; below it, a funnel is a shape, not a signal.',
    body: h('p', { class: 'muted small' },
      'Small-study asymmetry is tested per cell on the What works panel with Egger’s regression intercept, which needs at least '
      + `${report.conventions.minEggerStudies} studies before it is allowed to speak.`),
  }));

  return h('div', { class: 'stack' }, ...blocks);
}

/* --------------------------------------------------------------- reviews */

function reviewCard(ctx, review, focus) {
  const meta = h('div', { class: 'row gap wrap small muted' },
    h('span', null, `${review.cells.length} pooled cell(s)`),
    h('span', null, `focus: ${review.outcomeLabel || '\u2014'}`),
    h('span', null, `engine ${review.engineVersion || '\u2014'}`));

  const cellsTable = review.cells.length
    ? table({
      columns: [
        { label: 'Cell', render: (row) => row.key },
        { label: 'n', render: (row) => String(row.nConfirmatory) },
        { label: 'Frozen', render: (row) => pctText(row.pooled) },
        { label: 'Interval', render: (row) => `${pctText(row.lo)} \u2026 ${pctText(row.hi)}` },
        { label: 'I\u00b2', render: (row) => `${num(row.i2, 0)}%` },
        { label: 'Verdict', render: (row) => badge(row.verdict, verdictTone(row.verdict)) },
      ],
      rows: review.cells,
      caption: 'Cells frozen in this review',
    })
    : h('p', { class: 'muted small' }, 'This review froze no pooled cell.');

  const rankingBlock = review.ranking.length
    ? h('details', null,
      h('summary', { class: 'small' }, 'Frozen ranking'),
      table({
        columns: [
          { label: '#', render: (row) => String(row.position) },
          { label: 'Lever', render: (row) => row.interventionType },
          { label: 'Effect', render: (row) => (Number.isFinite(row.mean) ? pctText(row.mean) : '\u2014') },
          { label: 'Value of a trial', render: (row) => (Number.isFinite(row.evsi) ? num(row.evsi) : '\u2014') },
        ],
        rows: review.ranking,
        caption: 'Ranking frozen in this review',
      }))
    : null;

  const gradeNote = review.graded
    ? h('p', { class: 'muted small' }, `Mean absolute error ${num(review.graded.meanAbsoluteError)} percentage points; median frozen interval width ${num(review.graded.medianFrozenWidth)}. Coverage is not accuracy \u2014 a wide interval covers almost anything, which is why the error is shown beside it.`)
    : null;

  const gradeButton = review.graded
    ? null
    : h('button', {
      class: 'btn btn-sm',
      type: 'button',
      onClick: () => openGradeReviewDialog(ctx, review.id),
    }, 'Grade it');

  const deleteButton = h('button', {
    class: 'btn btn-sm btn-quiet',
    type: 'button',
    onClick: () => {
      const result = ctx.api.deleteEvidenceReview(review.id);
      if (result && result.ok) {
        toast('Review deleted; the audit log kept the reason.', 'neutral');
        ctx.navigate('#/evidence?panel=reviews');
      } else {
        toast((result && result.error) || 'Could not delete the review.', 'bad');
      }
    },
  }, 'Delete');

  return card({
    title: review.label,
    subtitle: review.graded
      ? `Graded ${String(review.graded.gradedAt).slice(0, 10)} \u00b7 ${review.graded.cellsCovered}/${review.graded.cellsGraded} interval(s) still hold`
      : `Frozen ${String(review.frozenAt).slice(0, 10)} \u00b7 review due ${review.reviewOn || '\u2014'}`,
    className: review.id === focus ? 'card is-active' : 'card',
    actions: [
      badge(review.graded ? 'graded' : 'frozen', review.graded ? 'good' : 'neutral'),
      gradeButton,
      deleteButton,
    ].filter(Boolean),
    body: h('div', { class: 'stack' }, meta, cellsTable, rankingBlock, gradeNote),
  });
}

function reviewsPanel(ctx, report) {
  const reviews = ctx.state.evidenceReviews || [];
  const focus = ctx.query.get('review');

  function runScan() {
    const result = ctx.api.scanEvidence();
    toast(result && result.changed
      ? 'Scan complete: the cascade has already landed.'
      : 'Scan complete: nothing new to write.', result && result.changed ? 'good' : 'neutral');
    ctx.navigate('#/evidence?panel=reviews');
  }

  const body = reviews.length
    ? h('div', { class: 'stack' }, ...reviews.map((review) => reviewCard(ctx, review, focus)))
    : emptyState({
      title: 'No review has been frozen',
      body: 'Freezing a review is what lets the rules attach a recommendation to open cases: an edge needs a durable source, and a page view is not one.',
    });

  return h('div', { class: 'stack' },
    card({
      title: 'Frozen evidence reviews',
      subtitle: 'A review stores aggregates only \u2014 no title, hypothesis, note or identifier \u2014 so a later edit to a study cannot rewrite what it said.',
      actions: [
        h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openFreezeReviewDialog(ctx) }, 'Freeze a review'),
        h('button', { class: 'btn', type: 'button', onClick: runScan }, 'Run a scan'),
      ],
      body,
    }));
}

/* ---------------------------------------------------------------- method */

function methodPanel(ctx, report) {
  const { conventions } = report;
  const rows = [
    ['Pooling model', 'DerSimonian & Laird (1986) random effects, inverse-variance'],
    ['Interval reported', 'The wider of the DerSimonian–Laird interval and the Hartung–Knapp–Sidik–Jonkman interval (Hartung & Knapp 2001; Sidik & Jonkman 2002)'],
    ['Heterogeneity', 'Cochran’s Q with a chi-square test, τ² by the method-of-moments estimator, I² (Higgins & Thompson 2002)'],
    ['Shrinkage', 'The random-effects posterior mean (y/se² + μ/τ²)/(1/se² + 1/τ²) — the model’s own shrinkage, not a tuning knob'],
    ['Small-study asymmetry', 'Egger’s regression intercept (Egger et al. 1997), refused below ten studies'],
    ['Proportions', 'Logit random effects with the Haldane–Anscombe 0.5 correction; Wilson (1927) score intervals as the descriptive interval'],
    ['Forecast scoring', 'Brier (1950) against the realised base rate as the reference forecast; calibration-in-the-large by a normal approximation to the binomial test'],
    ['Value of information', 'Normal prior with linear loss (Raiffa & Schlaifer 1961): EVSI = N·(g(μ, v) − max(0, μ)) with g(μ, s) = μΦ(μ/s) + sφ(μ/s) and v = √(s² − s′²)'],
    ['Replication discipline', 'A supported result with one independent study and zero replications is a hypothesis (Ioannidis 2005; Open Science Collaboration 2015)'],
  ];
  return h('div', { class: 'stack' },
    card({
      title: 'Conventions in force',
      body: h('div', { class: 'stat-grid' },
        stat({ label: 'Pooling floor', value: `${conventions.minPoolStudies} studies`, hint: 'Below this a cell is a count' }),
        stat({ label: 'Heterogeneity floor', value: `${conventions.minHeterogeneity} studies`, hint: 'Below this τ² and I² are not printed' }),
        stat({ label: 'Egger floor', value: `${conventions.minEggerStudies} studies`, hint: 'Below this the funnel is a shape' }),
        stat({ label: 'Judgement floor', value: `${conventions.minResolutions} predictions`, hint: 'Below this Brier and skill are withheld' }),
        stat({ label: 'Decision horizon', value: `${conventions.horizonDecisions}`, hint: 'How many more times you expect to face this' }),
        stat({ label: 'Exploration weight', value: num(conventions.exploreWeight), hint: 'Learning against effect in the ranking' }),
        stat({ label: 'Interval level', value: `${Math.round((1 - conventions.alpha) * 100)}%`, hint: 'Two-sided' }),
        stat({ label: 'Review horizon', value: `${conventions.reviewDays} days`, hint: 'Before a frozen review is due for grading' })),
    }),
    card({
      title: 'Named methods implemented',
      body: table({
        columns: [
          { label: 'Concern', render: (row) => h('strong', null, row[0]) },
          { label: 'Method', render: (row) => row[1] },
        ],
        rows,
        caption: 'Methods and their citations',
      }),
    }),
    card({
      title: 'Refusals, stated in advance',
      body: h('ul', { class: 'muted small stack-xs' },
        h('li', null, 'A cell below the pooling floor is never pooled — meta-analysis of two noisy studies produces a number with an interval shaped like a guess.'),
        h('li', null, 'Retrospective hypotheses are counted and displayed, never pooled: pooling them would let a leader improve the evidence base by declaring hypotheses after seeing the answer.'),
        h('li', null, 'An untested lever is not scored zero. It is priced at the outcome’s grand mean with the between-lever spread as its prior, and the number shown is the value of finding out.'),
        h('li', null, 'Designs are never mixed. An interrupted time series and a probability forecast live in separate panels.'),
        h('li', null, 'A pooled association is not a causal claim, and this page says so on every row where it matters.'),
        h('li', null, 'No person is scored, ranked or named anywhere in this terminal.')),
    }),
    card({
      title: 'Evidence families',
      body: table({
        columns: [
          { label: 'Family', render: (row) => h('strong', null, row[0]) },
          { label: 'What it pools', render: (row) => row[1] },
        ],
        rows: Object.entries(EVIDENCE_FAMILY_LABELS).map(([key, label]) => [key, label])
          .concat([['resolution sources', Object.values(RESOLUTION_SOURCE_LABELS).join(' · ')]]),
        caption: 'The two families and where they come from',
      }),
    }));
}

/* ------------------------------------------------------------------ page */

export function renderEvidence(ctx) {
  const state = ctx.state || {};
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const report = evidenceReport(state, now, state.settings || {});
  report.signals = ctx.api.evidenceSignals ? ctx.api.evidenceSignals() : [];

  const active = PANELS.some((panel) => panel.key === ctx.query.get('panel'))
    ? ctx.query.get('panel')
    : 'overview';

  const body = (() => {
    switch (active) {
      case 'works': return worksPanel(ctx, report);
      case 'recommend': return recommendPanel(ctx, report);
      case 'judgement': return judgementPanel(ctx, report);
      case 'reviews': return reviewsPanel(ctx, report);
      case 'method': return methodPanel(ctx, report);
      default: return overviewPanel(ctx, report);
    }
  })();

  return h('div', { class: 'stack page' },
    pageHeader({
      eyebrow: 'Schema v66 · ADR-0055',
      title: 'The Evidence Terminal',
      subtitle: 'What has actually worked here — pooled, heterogeneity-aware, and priced against the value of the next experiment.',
      actions: [
        h('button', {
          class: 'btn',
          type: 'button',
          onClick: () => {
            const text = ctx.api.evidenceBriefText();
            downloadText(`evidence-brief-${dayKey(now)}.txt`, text, 'text/plain');
          },
        }, 'Download brief'),
        h('button', {
          class: 'btn',
          type: 'button',
          onClick: () => {
            const result = ctx.api.scanEvidence();
            toast(result && result.changed
              ? 'Scan complete: the cascade has already landed.'
              : 'Scan complete: nothing new to write.', result && result.changed ? 'good' : 'neutral');
            ctx.navigate(`#/evidence?panel=${active}`);
          },
        }, 'Run a scan'),
      ],
      meta: h('p', { class: 'muted small' },
        `Engine ${report.engineVersion} · ${report.counts.effectUnits} scored stud${report.counts.effectUnits === 1 ? 'y' : 'ies'} · ${report.counts.eligibleCells} poolable cell(s) · ${report.counts.resolutionUnits} resolved prediction(s)`),
    }),
    tabs({
      items: PANELS.map((panel) => ({
        key: panel.key,
        label: panel.label,
        count: panel.key === 'works' ? report.counts.eligibleCells
          : (panel.key === 'reviews' ? (state.evidenceReviews || []).length : undefined),
      })),
      active,
      onSelect: (key) => navigate(ctx, key),
      ariaLabel: 'Evidence terminal sections',
    }),
    body);
}

export default renderEvidence;
