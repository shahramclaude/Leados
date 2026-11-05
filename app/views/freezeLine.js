/**
 * app/views/freezeLine.js — `#/freeze-line`, the Freeze-Line Continuity Audit
 * (ADR-0099).
 *
 * Five panels, five different questions:
 *   Desk         "What should I do at this altitude, and what is withheld?"
 *   Freeze lines "Which reorganisations has this workspace crossed?"
 *   Continuity   "Did measured carriage hold across each line?"
 *   Comparability "Are pre-freeze readings still comparable?"
 *   Timing guard "Did any withheld cell ever leak WHEN it was withheld?"
 *
 * Nothing on this screen names a person, rates one, or changes a reporting
 * line. A degraded line is a finding about the STRUCTURE.
 */
import { h, toast } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import { CONTINUITY_META, FREEZE_VERDICT_META } from '../core/domain/freezeLineRegistry.js';

const PANELS = [
  { key: 'desk', label: 'Desk' },
  { key: 'lines', label: 'Freeze lines' },
  { key: 'continuity', label: 'Continuity' },
  { key: 'comparability', label: 'Comparability' },
  { key: 'timing', label: 'Timing guard' },
];

const CSV_COLUMNS = ['row_kind', 'kind', 'line_on', 'altitude', 'continuity_class', 'n', 'suppressed',
  'moves_n', 'verdict', 'before_edges_n', 'before_connected_n', 'before_coverage_pct',
  'before_interval_low_pct', 'before_interval_high_pct', 'after_edges_n', 'after_connected_n',
  'after_coverage_pct', 'after_interval_low_pct', 'after_interval_high_pct', 'delta_pct_points',
  'pre_freeze_assessments_n', 'assessments_n', 'suppressed_rows_with_dates_n'];

const panelFor = (q) => {
  const p = q?.get?.('panel');
  return PANELS.some((item) => item.key === p) ? p : 'desk';
};
const go = (ctx, panel) => ctx.navigate(`#/freeze-line?panel=${panel}`);
const pct = (value) => (value === null || value === undefined ? 'refused' : `${value}%`);
const verdictBadge = (verdict) => {
  const meta = FREEZE_VERDICT_META[verdict] || { label: verdict || 'unmeasured', tone: 'neutral' };
  return badge(meta.label, meta.tone, meta.meaning || '');
};
const classBadge = (cls) => {
  const meta = CONTINUITY_META[cls] || { label: cls, tone: 'neutral' };
  return badge(meta.label, meta.tone, meta.meaning || '');
};

function notify(result, message) {
  if (!result?.ok) {
    toast(result?.error || 'The freeze-line action was refused.', 'bad');
    return false;
  }
  toast(result.warning || message, result.warning ? 'bad' : 'good');
  return true;
}

function exportCsv(ctx) {
  const result = ctx.api.freezeLineCsvRows();
  if (!result?.ok) {
    toast(result?.error || 'The freeze-line export was refused.', 'bad');
    return;
  }
  const columns = CSV_COLUMNS.map((key) => ({ key, header: key }));
  downloadText({
    filename: `leados-freeze-line-${result.rows.find((r) => r.row_kind === 'freeze-line')?.line_on || 'export'}.csv`,
    text: serializeCsv({ columns, rows: result.rows }),
    mime: 'text/csv',
  });
}

function copyBrief(ctx) {
  const result = ctx.api.freezeLineBriefText();
  if (!result?.ok) {
    toast(result?.error || 'No brief available.', 'bad');
    return;
  }
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(result.text).then(
      () => toast('Brief copied to the clipboard.', 'good'),
      () => toast('The clipboard is unavailable in this browser; the brief is shown in the Desk panel.', 'neutral'),
    );
  } else {
    toast('The clipboard is unavailable in this browser; the brief is shown in the Desk panel.', 'neutral');
  }
}

function deskPanel(ctx, report) {
  const pb = report.playbook;
  return h('div', { class: 'stack' },
    banner({ tone: 'info', title: pb.title, body: `${pb.question} Horizon: ${pb.horizon}.` }),
    card({
      title: 'What you can see at this altitude',
      body: h('div', { class: 'stack' },
        h('p', null, pb.see),
        h('p', null, h('strong', null, 'Act: '), pb.act),
        h('p', null, h('strong', null, 'Hand up: '), pb.hand)),
    }),
    card({
      title: 'Position',
      body: h('div', { class: 'stat-row' },
        stat({ label: 'Freeze lines crossed', value: String(report.lines.length), hint: 'Committed or reverted structural designs' }),
        stat({ label: 'Degraded lines', value: String(report.degradedN), tone: report.degradedN ? 'bad' : 'good', hint: 'Connected share fell beyond the declared threshold' }),
        stat({ label: 'Timing leaks in stored snapshots', value: String(report.timingGuard.suppressedRowsWithDatesN), tone: report.timingGuard.suppressedRowsWithDatesN ? 'bad' : 'good', hint: 'Suppressed rows still carrying a carriage date' }),
        stat({ label: 'Open governed decisions', value: String(report.openDecisions.length), hint: 'RULE-FRZ-02/03 findings awaiting a human' })),
    }),
    card({
      title: 'Method and honest limits',
      body: h('div', { class: 'stack' },
        h('p', { class: 'muted' }, report.premise),
        h('ul', { class: 'list' }, ...Object.values(report.disclosure).map((line) => h('li', null, line)))),
    }));
}

function linesPanel(ctx, report) {
  const freeze = (designId) => notify(ctx.api.freezeLineFreeze({ designId }), 'Continuity reading frozen.');
  return h('div', { class: 'stack' },
    card({
      title: 'Freeze lines crossed',
      subtitle: 'A committed or reverted structural design is a dated boundary in the reporting tree. Freeze a continuity reading to register the line and roll it up.',
      actions: [h('button', { class: 'btn', type: 'button', onClick: () => notify(ctx.api.freezeLineScan(), 'Scan complete.') }, 'Scan all lines')],
      body: report.lines.length
        ? table({
          caption: 'Freeze lines: structural changes that moved reporting lines',
          columns: [
            { label: 'Line', render: (row) => h('strong', null, row.on) },
            { label: 'Kind', render: (row) => row.kind },
            { label: 'Moves', render: (row) => String(row.movesN) },
            { label: 'Movers by altitude', render: (row) => Object.entries(row.movedByAltitude || {}).map(([k, v]) => `${k}:${v}`).join(' ') || '—' },
            { label: 'Frozen reading', render: (row) => (row.frozen ? verdictBadge(row.frozen.verdict) : badge('not frozen', 'neutral', 'Freeze a reading to register the line')) },
            { label: 'Live verdict', render: (row) => verdictBadge(row.live?.verdict) },
            { label: 'Action', render: (row) => h('button', { class: 'btn small', type: 'button', onClick: () => freeze(row.designId) }, 'Freeze reading') },
          ],
          rows: report.lines,
          emptyMessage: 'No structural design has been committed or reverted yet, so there is no freeze line.',
        })
        : emptyState({ title: 'No freeze line yet', body: 'Commit a structural design in Org design; the day it lands is a freeze line this screen will measure across.' }),
    }));
}

function continuityPanel(ctx, report) {
  const lines = report.lines.filter((line) => line.live || line.frozen);
  return h('div', { class: 'stack' },
    card({
      title: 'Continuity across each freeze line',
      subtitle: 'Dated carriage measured on the tree as it stood before the line and as it stands after it. Refused below the declared edge floor; a suppressed cell is blank, never zero.',
      body: lines.length
        ? table({
          caption: 'Before/after connected share of declared leadership edges across each freeze line',
          columns: [
            { label: 'Line', render: (row) => h('strong', null, `${row.on} · ${row.kind}`) },
            { label: 'Before', render: (row) => {
              const b = row.live?.before || row.frozen?.before;
              return b?.refused ? 'refused' : `${pct(b?.coveragePct)} (${b?.connectedN}/${b?.edgesN}, Wilson ${pct(b?.wilsonLowPct)}–${pct(b?.wilsonHighPct)})`;
            } },
            { label: 'After', render: (row) => {
              const a = row.live?.after || row.frozen?.after;
              return a?.refused ? 'refused' : `${pct(a?.coveragePct)} (${a?.connectedN}/${a?.edgesN}, Wilson ${pct(a?.wilsonLowPct)}–${pct(a?.wilsonHighPct)})${row.live?.partialAfter ? ' · partial' : ''}`;
            } },
            { label: 'Δ points', render: (row) => (row.live?.deltaPctPoints ?? row.frozen?.deltaPctPoints ?? '—') },
            { label: 'Verdict', render: (row) => verdictBadge(row.frozen?.verdict || row.live?.verdict) },
            { label: 'Reading', render: (row) => (row.live?.reason || '') },
          ],
          rows: lines,
          emptyMessage: 'Nothing measurable yet.',
        })
        : emptyState({ title: 'Nothing to measure', body: 'No freeze line has been crossed yet.' }),
    }),
    ...lines.map((line) => card({
      title: `Continuity classes — ${line.on}`,
      subtitle: 'Per-edge continuity aggregated by altitude, with small-cell complementary suppression.',
      body: table({
        caption: `Continuity classes by altitude for the ${line.on} line`,
        columns: [
          { label: 'Altitude', render: (row) => row.altitudeKey || '—' },
          { label: 'Class', render: (row) => classBadge(row.cls) },
          { label: 'Edges', render: (row) => (row.suppressed ? 'suppressed' : String(row.n)) },
        ],
        rows: (line.live?.cells || line.frozen?.cells || []),
        emptyMessage: 'No cells.',
      }),
    })));
}

function comparabilityPanel(ctx, report) {
  const lines = report.lines.filter((line) => line.live?.comparability || line.frozen?.comparability);
  return h('div', { class: 'stack' },
    banner({ tone: 'info', title: 'Comparability is a verdict, not an assumption', body: 'Every reading taken before a freeze line was measured against a different reporting tree. This panel states, per line, how many pre-freeze frozen readings exist and that their per-span detail is never re-projected — only the aggregate. A series that cannot be compared is said so, not silently continued.' }),
    card({
      title: 'Pre-freeze readings vs each freeze line',
      body: lines.length
        ? table({
          caption: 'Comparability of pre-freeze frozen readings against each freeze line',
          columns: [
            { label: 'Line', render: (row) => h('strong', null, `${row.on} · ${row.kind}`) },
            { label: 'Pre-freeze readings', render: (row) => String((row.live?.comparability || row.frozen?.comparability)?.preAssessmentsN ?? 0) },
            { label: 'Inside the before-window', render: (row) => String((row.live?.comparability || row.frozen?.comparability)?.inWindowN ?? 0) },
            { label: 'Suppressed', render: (row) => ((row.live?.comparability || row.frozen?.comparability)?.suppressed ? badge('yes', 'warn', 'Below the cell floor: counts only') : badge('no', 'neutral')) },
            { label: 'Statement', render: (row) => (row.live?.comparability || row.frozen?.comparability)?.note || '' },
          ],
          rows: lines,
          emptyMessage: 'No freeze line crossed yet.',
        })
        : emptyState({ title: 'No freeze line yet', body: 'Comparability across a reorganisation appears here once a structural design is committed.' }),
    }));
}

function timingPanel(ctx, report) {
  const g = report.timingGuard;
  return h('div', { class: 'stack' },
    banner({
      tone: g.suppressedRowsWithDatesN ? 'warn' : 'good',
      title: g.suppressedRowsWithDatesN ? `${g.suppressedRowsWithDatesN} suppressed row(s) in legacy snapshots still carry a carriage date` : 'Timing channel clean',
      body: 'A withheld count must not disclose WHEN it was withheld. The live view, the CSV and every new freeze withhold the date on suppressed rows; RULE-FRZ-03 opens one redaction decision per affected legacy snapshot per ISO week.',
    }),
    card({
      title: 'Timing-guard audit',
      body: h('div', { class: 'stat-row' },
        stat({ label: 'Frozen snapshots audited', value: String(g.assessmentsN) }),
        stat({ label: 'Snapshots affected', value: String(g.assessmentsAffected), tone: g.assessmentsAffected ? 'warn' : 'good' }),
        stat({ label: 'Suppressed rows with dates', value: String(g.suppressedRowsWithDatesN), tone: g.suppressedRowsWithDatesN ? 'bad' : 'good' })),
    }),
    report.withheld.length
      ? card({
        title: 'What is withheld here, and why',
        body: h('ul', { class: 'list' }, ...report.withheld.map((item) => h('li', null, h('strong', null, `${item.n} item(s): `), item.reason))),
      })
      : null);
}

export function renderFreezeLine(ctx) {
  const panel = panelFor(ctx.query);
  const report = ctx.api.freezeLineReport();
  if (!report?.ok) {
    return h('div', { class: 'stack' }, emptyState({ title: 'The freeze-line audit could not be built', body: report?.error || 'No report is available.' }));
  }
  const body = panel === 'desk'
    ? deskPanel(ctx, report)
    : panel === 'lines'
      ? linesPanel(ctx, report)
      : panel === 'continuity'
        ? continuityPanel(ctx, report)
        : panel === 'comparability'
          ? comparabilityPanel(ctx, report)
          : timingPanel(ctx, report);

  return h('div', { class: 'stack' },
    pageHeader({
      eyebrow: 'Programme',
      title: 'Freeze-line continuity',
      subtitle: 'Did the declared hierarchy keep its measured information channels across each reorganisation — and is every pre-freeze series still comparable?',
      actions: [
        badge(`${report.lines.length} freeze line(s)`, 'neutral', 'Committed or reverted structural designs'),
        report.degradedN ? badge(`${report.degradedN} degraded`, 'bad', 'Continuity fell beyond the declared threshold') : badge('no degraded line', 'good'),
        report.timingGuard.suppressedRowsWithDatesN ? badge(`${report.timingGuard.suppressedRowsWithDatesN} timing leak(s)`, 'bad', 'Suppressed rows still carrying a carriage date in legacy snapshots') : badge('timing clean', 'good'),
        h('button', { class: 'btn small', type: 'button', onClick: () => notify(ctx.api.freezeLineScan(), 'Scan complete.') }, 'Scan'),
        h('button', { class: 'btn small', type: 'button', onClick: () => exportCsv(ctx) }, 'Export CSV'),
        h('button', { class: 'btn small', type: 'button', onClick: () => copyBrief(ctx) }, 'Copy brief'),
      ],
      meta: h('p', { class: 'muted' }, report.premise),
    }),
    tabs({ items: PANELS.map((item) => ({ key: item.key, label: item.label })), active: panel, onSelect: (key) => go(ctx, key), ariaLabel: 'Freeze-line panels' }),
    body,
  );
}
