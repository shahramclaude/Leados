/**
 * ADR-0107 — the Outcome Learning Loop panel (Mission Control, all altitudes).
 *
 * ONE panel, FIVE genuinely different readings:
 *   rank 1  own frozen expectations, one-shot quadrants and next action
 *   rank 2  the same detail across its span, with stale flags
 *   rank 3+ pooled intervals, refused cells, conformal band and governed asks;
 *           no bundle id, case id, person, note or proof pointer is rendered.
 *
 * The shell's disclosure compiler already serves an aggregate posture above a
 * route ceiling; this panel additionally enforces its OWN `detail` flag inside
 * `buildOutcomeReport`, so calling a different API method cannot leak detail.
 */
import { h, toast, openModal, closeAllModals } from './dom.js';
import { downloadText } from './download.js';
import { card, badge, banner, stat, table, emptyState, kv } from './components.js';
import { serializeCsv } from '../core/csv.js';
import {
  displayBound, OUTCOME_CSV_COLUMNS, outcomeBriefText,
} from '../core/domain/outcomeLearning.js';
import { OUTCOME_VERDICT_LABELS } from '../core/domain/outcomeRegistry.js';

const verdictTone = { earned: 'good', lucky: 'caution', variance: 'neutral', fixable: 'bad', ungradable: 'warn' };
const notify = (result, message) => {
  if (!result?.ok) { toast(result?.error || 'The outcome-learning command was refused.', 'bad'); return false; }
  toast(message, 'good'); return true;
};
const num = (v) => v === null || v === undefined || v === '' ? '—' : String(v);
const pct = (v) => v === null || v === undefined ? 'refused' : `${v}%`;

function downloadCard(ctx, r) {
  const result = ctx.api.outcomeBriefText(r.seat.id);
  if (!result.ok) { toast(result.error, 'bad'); return; }
  downloadText({ filename: `leados-outcome-learning-${r.outcome.generatedOn}.md`, mime: 'text/markdown', text: result.text });
}
function downloadCsv(ctx) {
  const result = ctx.api.outcomeCsvRows();
  if (!result.ok) { toast(result.error, 'bad'); return; }
  downloadText({ filename: 'leados-outcome-learning-aggregate.csv', mime: 'text/csv', text: serializeCsv(OUTCOME_CSV_COLUMNS, result.rows) });
}
function priorModal(ctx, row) {
  const pctInput = h('input', { id: 'ol-prior', name: 'prior', type: 'number', min: 5, max: 95, step: 1, value: 70, required: true, 'aria-label': 'Response confidence percent' });
  const error = h('p', { class: 'form-error', role: 'alert' });
  const modal = openModal({ title: 'Pre-register one reviewed probability', body: h('form', { class: 'stack-sm', onSubmit: (e) => {
    e.preventDefault();
    const result = ctx.api.outcomeDeclarePrior(row.bundleId, pctInput.value);
    if (!result.ok) { error.textContent = result.error; return; }
    closeAllModals(); notify(result, 'Probability frozen before any outcome review. The loop will grade it once.'); ctx.refresh();
  } }, h('p', { class: 'muted small' }, 'This is YOUR declaration, not a classifier estimate. It is refused once a human outcome is reviewed: a forecast written after the result is hindsight, not foresight.'),
  h('label', { class: 'field' }, h('span', null, 'Response confidence (5–95%)'), pctInput), error,
  h('div', { class: 'form-actions' }, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Freeze declaration'))) });
  return modal;
}
function receipt(ctx, row) {
  const result = ctx.api.outcomeReceipt(row.bundleId);
  if (!result.ok) { toast(result.error, 'bad'); return; }
  downloadText({ filename: `leados-outcome-${row.bundleId}.md`, mime: 'text/markdown', text: result.text });
}

export function renderOutcomePanel(ctx, r) {
  const o = r.outcome;
  if (!o?.ok) return banner({ tone: 'bad', title: 'The learning ledger is unavailable', body: o?.error || 'Declare a valid operating seat.' });
  const auto = ctx.store.state.settings.outcomeAutoLearn !== false;
  const outside = o.outside; const pooled = o.pooled; const band = o.band; const hiers = o.hierarchy;
  return h('div', { class: 'stack-sm outcome-panel' },
    banner({ tone: 'info', title: `Altitude ${o.rank}: ${o.question}`,
      body: 'The atomic transaction that adopts a reviewed response freezes its expectation and rolls it up the same reporting tree. The transaction that records terminal evidence grades it exactly once. No person is scored, no outcome is invented and no human forecast is overwritten.' }),
    h('div', { class: 'stat-row' },
      o.detail ? [
        stat({ label: 'Frozen expectations', value: num(o.counts.contracts) }),
        stat({ label: 'Graded once', value: num(o.counts.graded), tone: 'good' }),
        stat({ label: 'Open', value: num(o.counts.open) }),
        stat({ label: 'Stale / refused', value: `${num(o.counts.stale)} / ${num(o.counts.ungradable)}`, tone: o.counts.stale ? 'caution' : '' }),
      ] : [
        stat({ label: 'Loops in scope', value: displayBound(hiers.totals.loops), hint: 'Suppression-safe interval' }),
        stat({ label: 'Graded once', value: displayBound(hiers.totals.graded) }),
        stat({ label: 'Good or mixed', value: displayBound(hiers.totals.good) }),
        stat({ label: 'Past horizon', value: displayBound(hiers.totals.late) }),
      ]),
    h('div', { class: 'form-actions' },
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => { if (notify(ctx.api.outcomeScan(), 'Outcome-learning scan complete.')) ctx.refresh(); } }, 'Run learning scan'),
      h('label', { class: 'check-row' }, h('input', { type: 'checkbox', checked: auto, onChange: (ev) => { if (notify(ctx.api.setOutcomeAutoLearn(ev.target.checked), ev.target.checked ? 'Automatic learning resumed.' : 'Automatic learning paused; explicit scans still work.')) ctx.refresh(); } }), h('span', null, 'Automatic freeze / grade')),
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => downloadCard(ctx, r) }, 'Identity-free brief'),
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => downloadCsv(ctx) }, 'Aggregate CSV'),
      h('a', { class: 'btn btn-ghost', href: '#/tempo' }, 'Decision tempo →')),
    card({ title: 'Calibration, or an honest refusal', subtitle: o.method.scoring,
      actions: [badge(outside.status === 'published' ? outside.direction : 'refused', outside.status === 'published' && outside.material ? 'caution' : 'neutral')],
      body: h('div', { class: 'stack-sm' },
        outside.status === 'published'
          ? h('div', { class: 'stat-row' },
            stat({ label: 'Outside view', value: pct(outside.pct), hint: `95% Wilson ${pct(outside.loPct)}–${pct(outside.hiPct)}` }),
            stat({ label: 'Declared', value: pct(outside.declaredPct) }),
            stat({ label: 'Realised', value: pct(outside.observedPct) }),
            stat({ label: 'Gap', value: `${outside.gapPp} pp`, tone: outside.material ? 'caution' : '' }))
          : banner({ tone: 'warn', title: 'Outside view refused', body: outside.reason }),
        pooled.status === 'published'
          ? kv('Pooled Brier / base / skill', `${pooled.brier} / ${pooled.baseBrier} / ${pooled.skill === null ? 'undefined' : pooled.skill}`)
          : banner({ tone: 'warn', title: 'Pooled skill refused', body: pooled.reason }),
        band.status === 'published'
          ? kv('One-sided conformal lateness bound', `${band.upperDays} day(s) · finite-sample coverage ${band.coverage} over ${band.n} graded loops · median ${band.medianDays}d · worst observed ${band.worstObservedDays}d`)
          : banner({ tone: 'warn', title: 'Conformal band refused', body: band.reason }),
        h('p', { class: 'tiny muted' }, o.method.outsideView),
        h('p', { class: 'tiny muted' }, o.method.conformal)) }),
    o.detail ? card({ title: 'Frozen expectations in this span', subtitle: 'One row per adopted response. A refused grade is stored, so hindsight can never be re-scored as foresight.',
      body: o.rows.length ? table({ caption: 'Frozen expectations and one-shot grades', rows: o.rows, columns: [
        { label: 'Response', render: (row) => h('a', { href: row.route }, row.id) },
        { label: 'Frozen', render: (row) => `${row.declaredOn} · ${row.forecastPct === null ? 'no declaration' : pct(row.forecastPct)}` },
        { label: 'Horizon', render: (row) => row.horizonOn || '—' },
        { label: 'Verdict', render: (row) => row.verdict ? badge(OUTCOME_VERDICT_LABELS[row.verdict] || row.verdict, verdictTone[row.verdict] || 'neutral') : badge(row.stale ? 'Past stale window' : 'Open', row.stale ? 'caution' : 'info') },
        { label: 'Brier', render: (row) => num(row.brier) },
        { label: 'Delivered', render: (row) => row.fidelityPct === null ? '—' : pct(row.fidelityPct) },
        { label: 'Late', render: (row) => row.delayDays === null ? '—' : `${row.delayDays}d` },
        { label: 'Action', render: (row) => h('div', { class: 'row-actions' },
          row.status === 'open' && row.forecastPct === null ? h('button', { class: 'btn btn-tiny btn-ghost', type: 'button', onClick: () => priorModal(ctx, row) }, 'Pre-register') : null,
          h('button', { class: 'btn btn-tiny btn-ghost', type: 'button', onClick: () => receipt(ctx, row) }, 'Receipt')) },
      ] }) : emptyState({ title: 'No frozen expectations yet', body: 'Describe a situation in Command Flow, rehearse it and adopt the reviewed response. Its expectation is frozen in the same atomic transaction.', action: h('a', { class: 'btn btn-primary', href: '#/mission?panel=capture' }, 'Open Command Flow') }) }) : null,
    card({ title: 'Vertical learning roll-up', subtitle: hiers.method, body: table({ caption: 'Child-span learning cells', rows: hiers.cells, columns: [
      { label: 'Span', render: (c) => h('div', null, h('strong', null, c.label), c.suppressed ? h('p', { class: 'tiny muted' }, c.reason) : null) },
      { label: 'Altitude', render: (c) => c.rank === null ? '—' : `Rank ${c.rank}` },
      { label: 'Loops', render: (c) => displayBound(c.loops) },
      { label: 'Graded', render: (c) => displayBound(c.graded) },
      { label: 'Good / mixed', render: (c) => displayBound(c.good) },
      { label: 'Late', render: (c) => displayBound(c.late) },
      { label: 'Drill', render: (c) => c.seatId ? h('a', { class: 'btn btn-tiny btn-ghost', href: `#/mission?panel=learning&span=${encodeURIComponent(c.seatId)}` }, 'Open span →') : h('span', { class: 'muted' }, 'This altitude') },
    ] }) }),
    o.rank >= 4 && o.enforced === false ? conventionsCard(ctx, o) : null,
    h('p', { class: 'tiny muted' }, o.method.disclosure),
    h('p', { class: 'tiny muted' }, o.method.causal));
}

function conventionsCard(ctx, o) {
  const c = o.conventions;
  const fields = [
    ['outcomeMinGrades', 'Grade floor', c.minGrades, 3, 25],
    ['outcomeMinCell', 'Cell floor', c.minCell, 3, 25],
    ['outcomeShrinkK', 'Shrinkage k', c.shrinkK, 2, 40],
    ['outcomeStaleDays', 'Stale days', c.staleDays, 1, 90],
    ['outcomeMaterialityPp', 'Materiality (pp)', c.materialityPp, 5, 50],
    ['outcomeConformalCoverage', 'Coverage', c.conformalCoverage, 0.5, 0.95],
    ['outcomeFidelityFloorPct', 'Delivery floor (%)', c.fidelityFloorPct, 50, 95],
  ];
  const inputs = Object.fromEntries(fields.map(([key, , value, min, max]) => [key, h('input', { id: `ol-${key}`, name: key, type: 'number', min, max, step: key === 'outcomeConformalCoverage' ? 0.05 : 1, value, 'aria-label': key })]));
  const error = h('p', { class: 'form-error', role: 'alert' });
  return card({ title: 'Declared conventions', subtitle: 'Clamped on read; never fitted from the record. Governance requires the enterprise root seat.',
    body: h('form', { class: 'stack-sm', onSubmit: (e) => {
      e.preventDefault();
      const patch = Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, Number(input.value)]));
      const result = ctx.api.outcomeSetConventions(patch);
      if (!result.ok) { error.textContent = result.error; return; }
      notify(result, 'Outcome-learning conventions re-declared.'); ctx.refresh();
    } }, h('div', { class: 'form-grid' }, ...fields.map(([key, label]) => h('label', { class: 'field' }, h('span', null, label), inputs[key]))), error,
    h('button', { class: 'btn btn-ghost', type: 'submit' }, 'Re-declare conventions')) });
}
