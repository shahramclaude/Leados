/**
 * app/views/benchRegressionPanel.js — the Regression Watch section inside
 * `#/succession?panel=evidence` (ADR-0172, Schema v137).
 *
 * ONE SECTION, ONE QUESTION: did the ground move under an unchanged claim? Each
 * consecutive pair of a bench claim's completed reviews compares the previous
 * window's FROZEN reading with the later window read LIVE, under a rating gate
 * (the previous window's frozen rating against the CURRENT rating). Only a
 * `regressed` LATEST pair issues an ask, and only once per pair.
 *
 * WHAT THIS SECTION REFUSES TO PRINT
 * ----------------------------------
 *  - A trend over an unreadable pair: `uncomparable` names its reason on its row.
 *  - A regression rate. A regression is a dated event on a named claim, not a
 *    proportion — the board prints counts, never a percentage.
 *  - A person's score or rank. Findings are on BENCH CLAIMS and WINDOW PAIRS.
 *    Above the matrix detail ceiling the pair rows print no name at all.
 */
import { h, toast } from '../ui/dom.js';
import { card, stat, badge, banner, table, kv, emptyState } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import {
  BENCH_REGRESSION_CONVENTIONS,
  BENCH_REGRESSION_FRAMEWORKS,
  BENCH_REGRESSION_REFUSALS,
  BENCH_REGRESSION_VERDICTS,
  BENCH_REGRESSION_LIMITS,
} from '../core/domain/benchRegressionRegistry.js';

const toneFor = (tone) => (tone === 'bad' ? 'bad' : tone === 'warn' ? 'warn' : tone === 'good' ? 'good' : 'neutral');
const cols = (rows) => rows.map((row) => ({
  ...row,
  render: row.render || ((record) => {
    const value = record[row.key];
    if (value === null || value === undefined) return '—';
    return String(value);
  }),
}));

/**
 * Resolve the watch reading. The section prefers the API (so it reads exactly
 * what the brief and the export read) and falls back to a prebuilt report the
 * focused suite hands in.
 */
export function readRegressionFor(ctx) {
  try {
    if (ctx?.api?.benchRegressionRead) {
      const res = ctx.api.benchRegressionRead();
      if (res && res.ok && res.report) return { report: res.report, attempted: true };
      return { report: null, attempted: true };
    }
    if (typeof ctx?.benchRegression === 'function') {
      return { report: ctx.benchRegression(), attempted: true };
    }
  } catch {
    return { report: null, attempted: true };
  }
  return { report: null, attempted: false };
}

function header(report) {
  const t = report.totals;
  return h('div', { class: 'stack-tight', 'data-testid': 'bench-regression-header' },
    h('div', { class: 'row-gap' },
      badge(report.verdictLabel, toneFor(report.verdictTone)),
      badge(`${t.pairsN} consecutive pair(s)`, 'neutral'),
      t.regressedLatestN ? badge(`${t.regressedLatestN} regressed`, 'bad') : null,
      t.asksPendingN ? badge(`${t.asksPendingN} ask(s) pending`, 'warn') : null,
      (t.verdictCounts.uncomparable || 0) ? badge(`${t.verdictCounts.uncomparable} uncomparable`, 'warn') : null,
      t.singleWindowN ? badge(`${t.singleWindowN} watched, no pair yet`, 'neutral') : null),
    h('p', { class: 'small muted' }, report.verdictDetail));
}

function statsSection(report) {
  const t = report.totals;
  const c = t.verdictCounts || {};
  return h('div', { class: 'stat-row', 'data-testid': 'bench-regression-stats' },
    stat({
      label: 'Pairs compared',
      value: t.pairsN,
      hint: `${t.pairedN} paired claim(s) · ${t.singleWindowN} watched with a single window`,
      tone: '',
    }),
    stat({
      label: 'Regressed latest pairs',
      value: t.regressedLatestN,
      hint: `${t.asksMatchedN} with an issued ask · ${t.asksPendingN} pending · ${t.asksNotedN} noted without a seat`,
      tone: t.regressedLatestN ? 'bad' : '',
    }),
    stat({
      label: 'Stable or improved',
      value: (c.stable || 0) + (c.improved || 0) + (c['stable-single'] || 0),
      hint: `${c.improved || 0} improved · ${c.stable || 0} stable · ${c['stable-single'] || 0} single-line throughout`,
      tone: '',
    }),
    stat({
      label: 'Refused pairs',
      value: (c.uncomparable || 0) + (c.open || 0) + (c.unresolved || 0),
      hint: `${c.uncomparable || 0} uncomparable · ${c.open || 0} open · ${c.unresolved || 0} unresolved · ${c['structure-changed'] || 0} structure-changed · ${c['rating-moved'] || 0} rating-moved`,
      tone: (c.uncomparable || 0) ? 'warn' : '',
    }));
}

function pairsSection(report, { namesVisible }) {
  const rows = report.printedRows.map((row) => ({
    claim: namesVisible ? `${row.personName} · ${row.seat}` : `pair ${String(row.pairKey).replace(/[^|]/g, '#').slice(0, 18)}`,
    windows: `${row.prevWindowStart || '?'}–${row.prevWindowEnd || '?'} → ${row.laterWindowStart || '?'}–${row.laterWindowEnd || '?'}`,
    states: `${row.prevState || '?'} → ${row.laterState || '?'}`,
    basis: `${row.prevBasis || ''} · ${row.laterBasis || ''}${row.laterFrozenState ? ` · as frozen ${row.laterFrozenOn || '?'}: ${row.laterFrozenState}` : ''}`,
    rating: `${row.prevRatingLabel || row.prevRating || '?'} then · ${row.currentRatingLabel || row.currentRating || '?'} now`,
    verdict: row.verdictLabel,
    tone: row.verdictTone,
    ask: row.askMarker
      ? (row.askMarker.kind === 'ask'
        ? `asked${row.askMarker.recordedOn ? ` ${row.askMarker.recordedOn}` : ''}`
        : `noted, no seat${row.askMarker.recordedOn ? ` ${row.askMarker.recordedOn}` : ''} — scan retries`)
      : (row.asks ? 'pending — the scan issues it' : '—'),
    detail: row.verdictDetail,
  }));
  return card({
    title: `Consecutive pairs (${report.printedRows.length} of ${report.totals.pairsN})`,
    subtitle: namesVisible
      ? 'Worst verdict first. The previous window is frozen history; the latest window is read live so late evidence lands. Only the claim’s latest pair can issue, and only once per pair.'
      : `Names are withheld above the matrix detail ceiling, so each row is identified by a stable pair reference only. ${report.totals.pairsN} pair(s) are counted in every figure above.`,
    body: rows.length
      ? table({
        caption: 'Consecutive evidence-window pairs and whether the ground moved',
        columns: cols([
          { key: 'claim', label: namesVisible ? 'Person · seat' : 'Pair' },
          { key: 'windows', label: 'Windows (previous → later)' },
          { key: 'states', label: 'States (previous → later)' },
          { key: 'rating', label: 'Rating (then · now)' },
          { key: 'verdict', label: 'Verdict', render: (r) => badge(r.verdict, toneFor(r.tone)) },
          { key: 'ask', label: 'Ask' },
          { key: 'basis', label: 'Basis of each side' },
          { key: 'detail', label: 'Why' },
        ]),
        rows,
      })
      : emptyState({ title: 'No consecutive pair to compare', body: 'No claim holds two completed reviews yet. A single window is watched as the baseline the second will be read against — not compared with itself.' }),
  });
}

function claimsSection(report) {
  return card({
    title: 'Two claims kept apart, because they are different facts',
    subtitle: 'That the printed verdicts add up to the printed pairs and that every pair was comparable are not the same sentence, and this screen never merges them into one reassuring word.',
    body: h('div', { class: 'stack-tight', 'data-testid': 'bench-regression-claims' },
      kv('Counts reconcile', `${report.reconciles ? 'yes' : 'no'} — ${report.reconcilesDetail}`, report.reconciles ? 'good' : 'bad'),
      kv('Pair population complete', `${report.figuresComplete ? 'yes' : 'no'} — ${report.figuresCompleteDetail}`, report.figuresComplete ? 'good' : 'warn')),
  });
}

function exportSection(ctx, report) {
  return card({
    title: 'Watch brief and aggregate export',
    subtitle: 'Both read the SAME report this section printed, so an exported figure is provably the figure that was on screen.',
    body: h('div', { class: 'stack-tight' },
      h('div', { class: 'row-gap' },
        h('button', {
          class: 'btn btn-ghost',
          type: 'button',
          onClick: () => {
            const res = ctx?.api?.benchRegressionBriefText ? ctx.api.benchRegressionBriefText() : null;
            if (!res || !res.ok) { toast('The brief could not be built from this surface.', 'bad'); return; }
            const saved = downloadText({ filename: 'leados-bench-regression-brief.txt', text: res.text, mime: 'text/plain' });
            if (saved) toast('Brief downloaded — identity-free, every refusal printed.', 'good');
          },
        }, 'Download the watch brief'),
        h('button', {
          class: 'btn btn-ghost',
          type: 'button',
          onClick: () => {
            const res = ctx?.api?.scanBenchRegression ? ctx.api.scanBenchRegression() : null;
            if (!res || !res.ok) { toast('The scan is not available from this surface.', 'bad'); return; }
            const n = res.propagations?.length || 0;
            toast(n ? `Scan complete — ${n} effect(s) through RULE-BRG-01.` : 'Scan complete — nothing was deferred for this watch.', 'good');
          },
        }, 'Re-run the deferred freezes and asks')),
      h('p', { class: 'small muted' },
        'The export is CSV scope #127 (`succession-bench-regression`): one aggregate summary row with no person, no name, no manager, no seat, no rating, no review id and no window date. No regression rate is printed or exported.'),
      report.refusals.length
        ? h('ul', { class: 'list' }, ...report.refusals.map((r) => h('li', { class: 'small' }, r.detail)))
        : null),
  });
}

function methodSection() {
  return h('div', { class: 'stack' },
    card({
      title: 'The comparison this watch applies',
      subtitle: 'Frozen history against a live question — each figure’s basis printed beside it.',
      body: h('div', { class: 'stack-tight' },
        kv('Comparison', BENCH_REGRESSION_CONVENTIONS.comparison),
        kv('Frozen open windows', BENCH_REGRESSION_CONVENTIONS.frozenOpenRule),
        kv('Rating gate', BENCH_REGRESSION_CONVENTIONS.ratingGate),
        kv('Ask scope', BENCH_REGRESSION_CONVENTIONS.askScope),
        kv('Pair order', BENCH_REGRESSION_CONVENTIONS.pairOrder),
        kv('Ask due in', `${BENCH_REGRESSION_CONVENTIONS.taskDays} days`),
        kv('Row bound', `${BENCH_REGRESSION_LIMITS.rows} pair rows printed; the remainder is counted, never dropped`)),
    }),
    card({
      title: 'The verdicts, and what each one means',
      subtitle: 'Declared precedence, worst first. One pair is exactly one verdict.',
      body: table({
        caption: 'Pair verdicts',
        columns: cols([
          { key: 'label', label: 'Verdict' },
          { key: 'asks', label: 'Asks', render: (r) => (r.asks ? 'yes — latest pair, once' : 'never') },
          { key: 'detail', label: 'What it means' },
        ]),
        rows: BENCH_REGRESSION_VERDICTS.map((v) => ({ ...v })),
      }),
    }),
    card({
      title: 'The frameworks behind the watch',
      body: table({
        caption: 'Named methods and what each one does here',
        columns: cols([
          { key: 'label', label: 'Framework' },
          { key: 'source', label: 'Source' },
          { key: 'applied', label: 'How it is applied' },
        ]),
        rows: BENCH_REGRESSION_FRAMEWORKS.map((f) => ({ ...f })),
      }),
    }),
    card({
      title: 'What this watch refuses, by name',
      body: h('ul', { class: 'list' }, ...BENCH_REGRESSION_REFUSALS.map((r) => h('li', null, r.text))),
    }));
}

/**
 * Render the regression section for the evidence tab.
 *
 * @param {object} ctx the shell context (state, now, api)
 * @param {object|null} regression an already-built watch report (used by focused renders)
 * @param {boolean} namesVisible whether names may be printed at this seat
 */
export function renderBenchRegressionSection(ctx, regression = null, namesVisible = true) {
  const resolved = regression ? { report: regression, attempted: true } : readRegressionFor(ctx);
  const r = resolved.report;
  if (!r) {
    if (!resolved.attempted) return null;
    return h('div', { class: 'stack' }, banner({
      tone: 'warn',
      title: 'The regression watch could not be built on this surface',
      body: 'No watch report is available here. Nothing is printed rather than a partial reading that would look like a verdict — the point-in-time register above is unaffected.',
    }));
  }
  return h('div', { class: 'stack', 'data-testid': 'bench-regression-section' },
    header(r),
    banner({
      tone: 'info',
      title: 'The question is not “what does the latest window show” — it is “did the ground move”',
      body: 'A claim that was corroborated in June and is one line wide in December, under an unchanged rating, is a decay the point-in-time register cannot see. Each consecutive pair below compares the previous window’s frozen reading with the later window read live, and only a regressed latest pair issues an ask.',
    }),
    statsSection(r),
    pairsSection(r, { namesVisible }),
    claimsSection(r),
    exportSection(ctx, r),
    methodSection());
}
