/**
 * app/views/spanCalibration.js — `#/span-calibration`, the Discretion Calibrator
 * (ADR-0100, Schema v102).
 *
 * Six panels, six different questions:
 *   Desk           "What does my altitude need to do about the ladder?"
 *   The ladder     "Does the span I declared match the span the record supports?"
 *   The record     "What sample is this built from, and what was excluded?"
 *   Counterfactual "What would change if this workspace routed on the measured ladder?"
 *   Roll-up        "How does the sample sit across the spans of my chain?"
 *   Readings       "What have I frozen, adopted and graded — and did the claim hold?"
 *
 * Nothing on this screen names a person, rates one, or changes a horizon without
 * a dated declaration. The curve is drawn from the workspace's own record.
 */
import { h, toast, confirmDialog } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import { SPAN_PANELS, SPAN_VERDICTS, SPAN_PREMISE } from '../core/domain/spanCalibrationRegistry.js';

const CSV_COLUMNS = ['row_kind', 'altitude', 'altitude_rank', 'declared_days', 'declared_source',
  'coverage_pct', 'decided_n', 'censored_n', 'censoring_pct', 'measured_days', 'pooled_measured_days',
  'interval_low_days', 'interval_high_days', 'survival_at_declared_pct', 'survival_low_pct',
  'survival_high_pct', 'verdict', 'withheld', 'n', 'change_n'];

const panelFor = (q) => {
  const key = q?.get?.('panel');
  return SPAN_PANELS.some((item) => item.key === key) ? key : 'desk';
};
const go = (ctx, panel) => ctx.navigate(`#/span-calibration?panel=${panel}`);
const pct = (value) => (value === null || value === undefined ? 'refused' : `${value}%`);
const days = (value) => (Number.isFinite(value) ? `${value}d` : 'not bounded');

function verdictBadge(verdict) {
  const meta = SPAN_VERDICTS[verdict] || { label: verdict || 'unmeasured', tone: 'neutral', meaning: '' };
  return badge(meta.label, meta.tone, meta.meaning || '');
}

function notify(result, message) {
  if (!result?.ok) {
    toast(result?.error || 'The calibration action was refused.', 'bad');
    return false;
  }
  toast(result.warning || message, result.warning ? 'bad' : 'good');
  return true;
}

function exportCsv(ctx) {
  const result = ctx.api.spanCalibrationCsvRows();
  if (!result?.ok) {
    toast(result?.error || 'The calibration export was refused.', 'bad');
    return;
  }
  const columns = CSV_COLUMNS.map((key) => ({ key, header: key }));
  downloadText({
    filename: `leados-span-calibration-${new Date().toISOString().slice(0, 10)}.csv`,
    text: serializeCsv({ columns, rows: result.rows }),
    mime: 'text/csv',
  });
}

function copyBrief(ctx) {
  const result = ctx.api.spanCalibrationBriefText();
  if (!result?.ok) {
    toast(result?.error || 'No brief is available.', 'bad');
    return;
  }
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(result.text).then(
      () => toast('Brief copied to the clipboard.', 'good'),
      () => toast('The clipboard is unavailable; the brief is on the Desk panel.', 'neutral'),
    );
  } else {
    toast('The clipboard is unavailable; the brief is on the Desk panel.', 'neutral');
  }
}

/* --------------------------------------------------------------- chart */

/**
 * One rung's survival curve, drawn as a step function with its log–log band, the
 * declared span as a vertical rule and the coverage target as a horizontal one.
 * The chart is decorative only for assistive technology: the accessible table on
 * the same card carries every figure, so nothing depends on reading the shape.
 */
function survivalChart(rung) {
  const points = Array.isArray(rung.curve) ? rung.curve : [];
  if (points.length < 2) return h('p', { class: 'muted tiny' }, 'No curve: this rung has no observation to draw.');
  const width = 460;
  const height = 170;
  const padL = 34;
  const padB = 22;
  const maxT = Math.max(rung.declaredDays * 1.4, points[points.length - 1].t, 1);
  const x = (t) => padL + (t / maxT) * (width - padL - 8);
  const y = (s) => 8 + (1 - s) * (height - padB - 8);
  const stepPath = () => {
    let d = `M ${padL} ${y(1)}`;
    let previous = null;
    for (const point of points) {
      const px = x(point.t);
      const py = y(point.s);
      if (previous === null) d += ` L ${px} ${py}`;
      else d += ` L ${px} ${previous} L ${px} ${py}`;
      previous = py;
    }
    return `${d} L ${width - 8} ${previous}`;
  };
  const band = `M ${padL} ${y(1)} ${points.map((p) => `L ${x(p.t)} ${y(p.hi)}`).join(' ')} ${[...points].reverse().map((p) => `L ${x(p.t)} ${y(p.lo)}`).join(' ')} Z`;
  const target = 1 - rung.coveragePct / 100;
  return h('div', { class: 'stack' },
    h('svg', {
      viewBox: `0 0 ${width} ${height}`, width: '100%', height, role: 'img',
      'aria-label': `${rung.label} survival curve: ${rung.decidedN} decided and ${rung.censoredN} still open; declared span ${rung.declaredDays} days.`,
    },
    h('title', null, `${rung.label}: share of work still open by age, with a ${rung.coveragePct}% coverage target.`),
    h('line', { x1: padL, y1: y(0), x2: width - 8, y2: y(0), stroke: 'var(--line, #d6d3cd)', 'stroke-width': 1 }),
    h('line', { x1: padL, y1: 8, x2: padL, y2: y(0), stroke: 'var(--line, #d6d3cd)', 'stroke-width': 1 }),
    h('path', { d: band, fill: 'rgba(74,111,165,0.14)', stroke: 'none' }),
    h('path', { d: stepPath(), fill: 'none', stroke: '#1f4e79', 'stroke-width': 2 }),
    h('line', {
      x1: x(rung.declaredDays), y1: 8, x2: x(rung.declaredDays), y2: y(0),
      stroke: '#a02f29', 'stroke-width': 1.6, 'stroke-dasharray': '4 3',
    }),
    h('line', {
      x1: padL, y1: y(target), x2: width - 8, y2: y(target),
      stroke: '#8a5609', 'stroke-width': 1, 'stroke-dasharray': '2 3',
    }),
    h('text', { x: padL - 4, y: y(1) + 4, 'text-anchor': 'end', 'font-size': 9, fill: 'currentColor' }, '100%'),
    h('text', { x: padL - 4, y: y(0) - 2, 'text-anchor': 'end', 'font-size': 9, fill: 'currentColor' }, '0%'),
    h('text', { x: x(rung.declaredDays) + 3, y: height - padB - 2, 'font-size': 9, fill: '#a02f29' }, `declared ${rung.declaredDays}d`),
    h('text', { x: width - 8, y: y(0) + 12, 'text-anchor': 'end', 'font-size': 9, fill: 'currentColor' }, `${Math.round(maxT)} days`),
    h('text', { x: padL + 2, y: y(target) - 3, 'font-size': 9, fill: '#8a5609' }, `${rung.targetPct}% target`)),
    h('p', { class: 'muted tiny' },
      'Blue line: share of this rung’s work still open at that age (Kaplan–Meier). Shaded: the 90% log–log band. Red rule: the declared span. Amber rule: the coverage target.'));
}

/* --------------------------------------------------------------- panels */

function deskPanel(ctx, report) {
  const pb = report.playbook;
  return h('div', { class: 'stack' },
    banner({ tone: 'info', title: pb.title, body: `${pb.question} Horizon: ${pb.horizon}` }),
    card({
      title: 'Position',
      body: h('div', { class: 'stat-row' },
        stat({ label: 'Items in the record', value: String(report.totals.itemsN), hint: `${report.totals.decidedN} decided · ${report.totals.openN} still open (censored)` }),
        stat({ label: 'Rungs measurable', value: `${report.totals.measurableRungs} of ${report.rungs.length}`, hint: 'Above the decided floor and below the censoring ceiling' }),
        stat({ label: 'Rungs falsified', value: String(report.totals.falsifiedN), tone: report.totals.falsifiedN ? 'bad' : 'good', hint: 'The declared span sits outside the interval the record supports' }),
        stat({ label: 'Ladder in force', value: report.ladder.source === 'calibrated' ? 'Calibrated' : 'Declared', tone: report.ladder.source === 'calibrated' ? 'warn' : '', hint: report.ladder.source === 'calibrated' ? `Adopted ${report.ladder.adoptedOn || 'date unrecorded'}` : 'The convention table: 7/30/90/180/365 days' })),
    }),
    card({
      title: 'What you can see, act on, and owe upward',
      body: h('div', { class: 'stack' },
        h('p', null, pb.see),
        h('p', null, h('strong', null, 'Act: '), pb.act),
        h('p', null, h('strong', null, 'Hand up: '), pb.hand)),
    }),
    card({
      title: 'Method and honest limits',
      body: h('div', { class: 'stack' },
        h('p', { class: 'muted' }, SPAN_PREMISE),
        h('ul', { class: 'list' }, ...Object.values(report.disclosure).map((line) => h('li', null, line)))),
    }),
    report.withheld.length
      ? card({
        title: 'What is withheld, and why',
        body: h('ul', { class: 'list' }, ...report.withheld.slice(0, 12).map((item) => h('li', null, item.reason))),
      })
      : null,
    report.openDecisions.length
      ? card({
        title: 'Open governed decisions this screen opened',
        subtitle: 'RULE-SPC-02/03. The engine opens the decision; a human decides, and the engine never moves a horizon.',
        body: h('ul', { class: 'list' }, ...report.openDecisions.slice(0, 8).map((row) => h('li', null,
          h('strong', null, `${row.title}. `), row.question ? `${row.question.slice(0, 220)}…` : '',
          h('a', { href: `#/decisions?id=${encodeURIComponent(row.id)}` }, ' Open decision')))),
      })
      : null);
}

function ladderPanel(ctx, report) {
  const measurable = report.rungs.filter((rung) => rung.verdict !== 'insufficient' && (rung.curve || []).length > 1);
  const canAdopt = report.ladder.proposed.some((row) => row.days !== row.declaredDays)
    || report.ladder.source === 'calibrated';
  const adopt = async () => {
    const latest = report.latestReading;
    if (!latest) {
      toast('Freeze a reading first: an adoption must name the reading that justified it.', 'bad');
      return;
    }
    const proposal = latest.proposedLadder.map((row) => `${row.key} ${row.days}d`).join(' / ');
    const confirmed = await confirmDialog({
      title: 'Put this ladder in force?',
      message: `Adopt the ladder from reading ${latest.id} (frozen ${latest.frozenOn}): ${proposal}. Every escalation clock in the workspace moves to this table, the before/after is kept in the append-only ledger, and restoring the declared ladder is one dated click.`,
      confirmLabel: 'Adopt the measured ladder',
    });
    if (confirmed) {
      notify(
        ctx.api.spanCalibrationAdopt({ readingId: latest.id, note: 'Adopted from the calibration screen.' }),
        'Ladder adopted; every escalation clock now reads the measured table.',
      );
    }
  };
  return h('div', { class: 'stack' },
    banner({
      tone: report.totals.falsifiedN ? 'warn' : 'good',
      title: report.totals.falsifiedN
        ? `${report.totals.falsifiedN} rung(s) are falsified by the record`
        : 'No rung is falsified by the record',
      body: `The test is the survival estimate at the declared span, against the ${report.conventions.coveragePct}% coverage promise (${report.rungs[0]?.targetPct ?? 15}% still open allowed). The verdict is read off the interval, never the point estimate, and it is refused when the interval is wider than ${report.conventions.maxWidthPct} points.`,
    }),
    card({
      title: 'The ladder against the record',
      subtitle: 'Declared span, the share of work still open at that span, the span the record implies, and the verdict.',
      body: table({
        caption: 'Each leadership altitude: declared span versus the span the record supports',
        columns: [
          { label: 'Rung', render: (row) => h('strong', null, row.label) },
          { label: 'Declared', render: (row) => `${row.declaredDays}d` },
          { label: 'Decided / open', render: (row) => `${row.decidedN} / ${row.censoredN}` },
          { label: 'Still open at span', render: (row) => (row.survivalAtDeclaredPct === null ? 'refused' : `${row.survivalAtDeclaredPct}% (${row.survivalAtDeclaredLoPct ?? '—'}–${row.survivalAtDeclaredHiPct ?? '—'})`) },
          { label: 'Span the record implies', render: (row) => (row.measuredDays === null ? (row.quantileRefused ? 'not bounded' : '—') : `${days(row.measuredDays)}${row.ciLo === null || row.ciHi === null ? ' (band not bounded)' : ` (${row.ciLo}–${row.ciHi}d)`}`) },
          { label: 'Verdict', render: (row) => verdictBadge(row.verdict) },
          { label: 'Why', render: (row) => h('span', { class: 'muted tiny' }, row.reason) },
        ],
        rows: report.rungs,
        emptyMessage: 'No rung exists yet.',
      }),
    }),
    measurable.length
      ? card({
        title: 'The curves',
        subtitle: 'One chart per measurable rung. A flat line that never reaches the target is a span that has not been tested; a line that stays high past the red rule is work outrunning its clock.',
        body: h('div', { class: 'stack' }, ...measurable.map((rung) => h('div', { class: 'stack' },
          h('h4', null, `${rung.label} · declared ${rung.declaredDays}d · ${rung.decidedN} decided, ${rung.censoredN} open`),
          survivalChart(rung)))),
      })
      : emptyState({
        title: 'No rung can be drawn yet',
        body: `A rung needs ${report.conventions.decidedFloor} decided items and fewer than ${report.conventions.censoringPct}% still open before a curve is readable. Close work at the rung you lead and this becomes a measurement.`,
      }),
    card({
      title: 'The ladder this record proposes',
      subtitle: 'Clamped to a declared move band and forced monotone (pooled where measured rungs cross). Nothing is in force until a human dates an adoption.',
      actions: canAdopt
        ? [h('button', { class: 'btn small', type: 'button', onClick: () => adopt() }, 'Adopt from latest reading')]
        : [],
      body: h('div', { class: 'stack' },
        table({
          caption: 'Declared versus proposed span per rung',
          columns: [
            { label: 'Rung', render: (row) => row.label },
            { label: 'In force', render: (row) => `${report.ladder.effective.find((entry) => entry.key === row.key)?.days ?? row.declaredDays}d` },
            { label: 'Proposed', render: (row) => h('strong', null, `${row.days}d`) },
            { label: 'Move', render: (row) => (row.days === row.declaredDays ? '—' : `${row.days > row.declaredDays ? '+' : ''}${row.days - row.declaredDays}d`) },
            { label: 'Basis', render: (row) => row.source },
            { label: 'Clamped', render: (row) => (row.clampedMonotone || row.clampedStep ? badge('yes', 'warn', 'The proposal was forced monotone; the printed interval is unchanged') : badge('no', 'neutral')) },
          ],
          rows: report.ladder.proposed,
        }),
        h('p', { class: 'muted tiny' }, `A rung may move at most to ${report.conventions.adoptMinPct}%–${report.conventions.adoptMaxPct}% of its declared span per adoption. Two rungs may not cross, and no rung may exceed ${report.conventions.ladderStepMax}× the rung below it.`)),
    }),
    report.adoptions.length
      ? card({
        title: 'The ladder ledger',
        subtitle: 'Every adoption and every restore, dated, with the before table and the reading that justified it.',
        body: table({
          caption: 'Adoption history',
          columns: [
            { label: 'Date', render: (row) => h('strong', null, row.adoptedOn) },
            { label: 'Action', render: (row) => badge(row.action, row.action === 'restore' ? 'neutral' : 'warn') },
            { label: 'Reading', render: (row) => row.readingId || '—' },
            { label: 'Before', render: (row) => row.priorTable.map((entry) => `${entry.key} ${entry.days}d`).join(' / ') },
            { label: 'After', render: (row) => row.table.map((entry) => `${entry.key} ${entry.days}d`).join(' / ') },
            { label: 'Note', render: (row) => row.note || '—' },
          ],
          rows: report.adoptions,
        }),
      })
      : null);
}

function cohortsPanel(ctx, report) {
  const conventions = report.conventions;
  const save = (event) => {
    event.preventDefault();
    const form = event.currentTarget.form || event.currentTarget.closest('form');
    const data = new FormData(form);
    const patch = {
      spanCalibrationCoveragePct: Number(data.get('coverage')),
      spanCalibrationDecidedFloor: Number(data.get('floor')),
      spanCalibrationCensoringPct: Number(data.get('censoring')),
      spanCalibrationMaxWidthPct: Number(data.get('width')),
      spanCalibrationReviewDays: Number(data.get('review')),
    };
    notify(ctx.api.spanCalibrationSetConventions(patch), 'Conventions saved and clamped.');
  };
  return h('div', { class: 'stack' },
    card({
      title: 'The sample, by source',
      subtitle: 'The same harvester the Command Chain uses — including closed records, which the chain ignores. Nothing here is a new data entry.',
      body: table({
        caption: 'Items per registered source: decided and still open',
        columns: [
          { label: 'Source', render: (row) => h('strong', null, row.label) },
          { label: 'Decided', render: (row) => String(row.decidedN) },
          { label: 'Still open', render: (row) => String(row.censoredN) },
          { label: 'Total', render: (row) => String(row.decidedN + row.censoredN) },
        ],
        rows: report.cohorts,
        emptyMessage: 'The workspace holds no item from any registered source yet.',
      }),
    }),
    report.excludedSources.length
      ? card({
        title: 'Excluded by name',
        subtitle: 'An organisational measurement never reads an individual-sensitive record, however useful the sample would be.',
        body: h('ul', { class: 'list' }, ...report.excludedSources.map((source) => h('li', null, h('strong', null, `${source.label}: `), source.reason))),
      })
      : null,
    card({
      title: 'Estimator and conventions',
      body: h('div', { class: 'stack' },
        h('p', null, `Kaplan–Meier with Greenwood variance and a ${conventions.bandPct}% log–log band. Coverage promise ${conventions.coveragePct}% — a rung whose work is still ${100 - conventions.coveragePct}% open at its declared span is at the edge of its promise.`),
        h('p', { class: 'muted tiny' }, `A rung is refused below ${conventions.decidedFloor} decided items, at or above ${conventions.censoringPct}% censoring, past ${conventions.maxWidthPct} points of interval width, or where nothing has been observed as old as the declared span. Refusals print their reason; they are never zero.`),
        report.defects.negativeDuration || report.defects.unowned
          ? h('p', { class: 'muted tiny' }, `Data defects skipped: ${report.defects.negativeDuration} record(s) closed before they opened, ${report.defects.unowned} item(s) with no resolvable owner span.`)
          : null),
    }),
    card({
      title: 'Change the conventions',
      subtitle: 'Declared, clamped and printed. Loosening the floor or the width buys a verdict with a weaker sample; the page says what it bought.',
      body: h('form', { class: 'stack', onSubmit: (event) => { event.preventDefault(); save(event); } },
        h('div', { class: 'grid grid-2' },
          h('label', { class: 'field' }, 'Coverage promise (%)',
            h('input', { type: 'number', name: 'coverage', min: '50', max: '99', value: String(conventions.coveragePct) })),
          h('label', { class: 'field' }, 'Decided floor per rung',
            h('input', { type: 'number', name: 'floor', min: '4', max: '40', value: String(conventions.decidedFloor) })),
          h('label', { class: 'field' }, 'Censoring ceiling (%)',
            h('input', { type: 'number', name: 'censoring', min: '30', max: '90', value: String(conventions.censoringPct) })),
          h('label', { class: 'field' }, 'Maximum interval width (points)',
            h('input', { type: 'number', name: 'width', min: '20', max: '90', value: String(conventions.maxWidthPct) })),
          h('label', { class: 'field' }, 'Review window (days)',
            h('input', { type: 'number', name: 'review', min: '14', max: '365', value: String(conventions.reviewDays) }))),
        h('div', { class: 'row' },
          h('button', { class: 'btn', type: 'submit' }, 'Save conventions'),
          h('button', { class: 'btn ghost', type: 'button', onClick: () => notify(ctx.api.spanCalibrationScan(), 'Scan complete.') }, 'Re-measure now'))),
    }));
}

function counterfactualPanel(ctx, report) {
  const cf = report.counterfactual;
  return h('div', { class: 'stack' },
    banner({
      tone: cf.riseN || cf.aboveTopN ? 'warn' : 'info',
      title: cf.changed ? 'Routing on the proposed ladder would move work' : 'The proposed ladder is the declared ladder',
      body: cf.note,
    }),
    card({
      title: 'Exactly what would move',
      subtitle: 'Every OPEN item re-placed on the proposed ladder. Counts are exact: an item is counted once, in the rung it would demand.',
      body: table({
        caption: 'Open items by the rung they would demand on the proposed ladder',
        columns: [
          { label: 'Rung', render: (row) => h('strong', null, row.label) },
          { label: 'Items', render: (row) => String(row.itemsN) },
          { label: 'Would rise', render: (row) => (row.riseN ? badge(String(row.riseN), 'warn') : '—') },
          { label: 'Would fall', render: (row) => (row.fallN ? badge(String(row.fallN), 'neutral') : '—') },
          { label: 'Unchanged', render: (row) => String(row.unchangedN) },
          { label: 'Above this chain', render: (row) => (row.aboveTopN ? badge(String(row.aboveTopN), 'bad', 'Demands a rung the roster does not contain') : '—') },
        ],
        rows: cf.rows,
        emptyMessage: 'No open item exists to re-place yet.',
      }),
    }),
    card({
      title: 'Why this is a counterfactual and not a plan',
      body: h('p', { class: 'muted' },
        'Nothing on this panel has happened. Adoption changes the clock every escalation, drift and survival figure in the Command Chain is measured against; this panel is what that change would cost in moved work, computed from today’s record. The workspace refuses to route on a ladder nobody declared.'),
    }));
}

function rollupPanel(ctx, report) {
  return h('div', { class: 'stack' },
    banner({
      tone: 'info',
      title: 'One sample, read up every span of the chain',
      body: `Every item in the sample belongs to exactly one span. A cell below ${report.conventions.cellFloor} observation(s) is blank, and a single blank beside an exact total is blanked too — a share of one identifies a lead, and a difference of two exact totals recovers it.`,
    }),
    card({
      title: 'Observations per span',
      body: table({
        caption: 'Decided and still-open observations per leadership span, with small cells suppressed',
        columns: [
          { label: 'Span', render: (row) => h('strong', null, row.suppressed ? 'suppressed' : row.name) },
          { label: 'Rung', render: (row) => row.altitudeKey },
          { label: 'Observations', render: (row) => (row.suppressed ? '—' : String(row.itemsN)) },
          { label: 'Decided', render: (row) => (row.suppressed ? '—' : String(row.decidedN)) },
          { label: 'Still open', render: (row) => (row.suppressed ? '—' : String(row.censoredN)) },
          { label: 'Open share', render: (row) => (row.suppressed ? '—' : pct(row.censoringPct)) },
          { label: 'Note', render: (row) => h('span', { class: 'muted tiny' }, row.reason || '') },
        ],
        rows: report.rollup,
        emptyMessage: 'No span holds an observation yet.',
      }),
    }));
}

function readingsPanel(ctx, report) {
  const freeze = () => notify(ctx.api.spanCalibrationFreeze(), 'Calibration reading frozen.');
  const grade = (readingId) => notify(ctx.api.spanCalibrationGrade({ readingId }), 'Reading graded.');
  const restore = async () => {
    const confirmed = await confirmDialog({
      title: 'Restore the declared ladder?',
      message: 'The declared table (7/30/90/180/365 days) returns to force. The adopted table stays in the append-only ledger with the date and the reading that justified it.',
      confirmLabel: 'Restore the declared ladder',
    });
    if (confirmed) notify(ctx.api.spanCalibrationRestoreLadder({ note: 'Restored from the calibration screen.' }), 'Declared ladder restored.');
  };
  return h('div', { class: 'stack' },
    card({
      title: 'Frozen calibration readings',
      subtitle: 'A reading is a dated claim: the verdicts, the intervals, the proposed table and one probability per rung. It is graded once, later, on items opened after the freeze.',
      actions: [
        h('button', { class: 'btn small', type: 'button', onClick: freeze }, 'Freeze reading'),
        report.ladder.source === 'calibrated'
          ? h('button', { class: 'btn small ghost', type: 'button', onClick: restore }, 'Restore declared ladder')
          : null,
      ].filter(Boolean),
      body: report.readings.length
        ? table({
          caption: 'Frozen calibration readings and their grades',
          columns: [
            { label: 'Frozen', render: (row) => h('strong', null, row.frozenOn) },
            { label: 'Review', render: (row) => row.reviewOn },
            { label: 'Ladder', render: (row) => row.ladderSource },
            { label: 'Quoted rungs', render: (row) => String(row.rungs.filter((rung) => rung.survivalAtDeclaredPct !== null).length) },
            { label: 'Verdicts', render: (row) => row.rungs.filter((rung) => rung.verdict !== 'insufficient').map((rung) => `${rung.key}: ${rung.verdict}`).join(' · ') || 'none measurable' },
            { label: 'Proposed', render: (row) => row.proposedLadder.map((entry) => `${entry.key} ${entry.days}d`).join(' / ') },
            { label: 'Grade', render: (row) => (row.gradedAt ? badge(`graded ${row.gradedAt}`, 'good', `Mean Brier ${row.grade?.meanBrier ?? '—'}`) : badge('ungraded', 'neutral', 'Graded once after the review date')) },
            { label: 'Action', render: (row) => (row.gradedAt ? '—' : h('button', { class: 'btn small', type: 'button', onClick: () => grade(row.id) }, 'Grade now')) },
          ],
          rows: report.readings,
        })
        : emptyState({ title: 'No reading frozen yet', body: 'Freeze a reading to date the claim and start the grading clock.' }),
    }),
    report.readings.filter((row) => row.grade).length
      ? card({
        title: 'Did the claim hold?',
        subtitle: 'Per rung: the probability quoted at the freeze, the share observed on items opened afterwards, and the Brier score.',
        body: table({
          caption: 'Graded calibration claims',
          columns: [
            { label: 'Reading', render: (row) => h('strong', null, row.id) },
            { label: 'Rung', render: (row) => row.key },
            { label: 'Predicted', render: (row) => (row.predictedPct === null ? 'refused' : pct(row.predictedPct)) },
            { label: 'Observed', render: (row) => (row.observedPct === null ? '—' : pct(row.observedPct)) },
            { label: 'Brier', render: (row) => (row.brier === null ? '—' : String(row.brier)) },
            { label: 'Observable', render: (row) => String(row.n) },
            { label: 'Note', render: (row) => h('span', { class: 'muted tiny' }, row.reason || '') },
          ],
          rows: report.readings.filter((row) => row.grade).flatMap((row) => (row.grade.rows || []).map((gradeRow) => ({ ...gradeRow, id: row.id }))),
        }),
      })
      : null);
}

/* --------------------------------------------------------------- render */

export function renderSpanCalibration(ctx) {
  const panel = panelFor(ctx.query);
  const report = ctx.api.spanCalibrationReport();
  if (!report?.ok) {
    return h('div', { class: 'stack' }, emptyState({ title: 'The calibration could not be built', body: report?.error || 'No report is available.' }));
  }
  const body = panel === 'ladder'
    ? ladderPanel(ctx, report)
    : panel === 'cohorts'
      ? cohortsPanel(ctx, report)
      : panel === 'counterfactual'
        ? counterfactualPanel(ctx, report)
        : panel === 'rollup'
          ? rollupPanel(ctx, report)
          : panel === 'readings'
            ? readingsPanel(ctx, report)
            : deskPanel(ctx, report);

  return h('div', { class: 'stack' },
    pageHeader({
      eyebrow: 'Organisation',
      title: 'Discretion calibration',
      subtitle: 'Does the leadership ladder you declared match the one your record actually runs? Kaplan–Meier on your own decision history, per altitude, with the interval and the refusal.',
      actions: [
        badge(`${report.totals.itemsN} observation(s)`, 'neutral', `${report.totals.decidedN} decided, ${report.totals.openN} still open`),
        report.totals.falsifiedN
          ? badge(`${report.totals.falsifiedN} falsified rung(s)`, 'bad', 'The declared span sits outside the interval the record supports')
          : badge('no falsified rung', 'good'),
        report.ladder.source === 'calibrated'
          ? badge(`calibrated ladder · ${report.ladder.adoptedOn || 'date unrecorded'}`, 'warn', 'A human adoption is in force; the declared table is one click away')
          : badge('declared ladder in force', 'neutral', 'The convention table, unchanged by the engine'),
        h('button', { class: 'btn small', type: 'button', onClick: () => notify(ctx.api.spanCalibrationFreeze(), 'Calibration reading frozen.') }, 'Freeze reading'),
        h('button', { class: 'btn small', type: 'button', onClick: () => notify(ctx.api.spanCalibrationScan(), 'Scan complete.') }, 'Scan'),
        h('button', { class: 'btn small', type: 'button', onClick: () => exportCsv(ctx) }, 'Export CSV'),
        h('button', { class: 'btn small', type: 'button', onClick: () => copyBrief(ctx) }, 'Copy brief'),
      ],
      meta: h('p', { class: 'muted' }, SPAN_PREMISE),
    }),
    tabs({ items: SPAN_PANELS.map((item) => ({ key: item.key, label: item.label })), active: panel, onSelect: (key) => go(ctx, key), ariaLabel: 'Discretion calibration panels' }),
    body,
  );
}
