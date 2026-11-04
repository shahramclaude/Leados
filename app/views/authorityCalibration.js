/**
 * app/views/authorityCalibration.js — Authority Calibration Ledger panel
 * (Schema v85, ADR-0079).
 *
 * One surface, altitude-specific duties: accepted mandate contracts graded
 * against delivered outcomes — hold rate, Wilson interval, Brier score and
 * calibration skill by action class and receiver altitude — with no person
 * rated or ranked. A terminal mandate is one Bernoulli trial: completed means
 * the authority held; returned, expired or revoked means it did not.
 *
 * Every figure is re-derived on read, so nothing here can drift from the
 * record it describes.
 */

import { h, toast, openModal, closeAllModals } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, kv, table, findingCard } from '../ui/components.js';
import { dayKey, formatDate } from '../core/time.js';
import {
  calibrateAuthority,
  authorityCalibrationSignals,
  authorityCalibrationBrief,
} from '../core/domain/authorityCalibration.js';

const PANELS = [
  { key: 'overview', label: 'Overview' },
  { key: 'altitude', label: 'By altitude' },
  { key: 'signals', label: 'Signals' },
  { key: 'settings', label: 'Settings' },
  { key: 'brief', label: 'Brief' },
];
const panelFor = (q) => {
  const p = q?.get?.('panel');
  return PANELS.some((x) => x.key === p) ? p : 'overview';
};
const go = (ctx, panel) => ctx.navigate(`#/authority-calibration?panel=${panel}`);
const pct = (v) => (v === null ? 'refused' : `${v}%`);
const interval = (cell) => cell.refused ? 'refused (<5 trials)' : `${cell.wilsonLo}%–${cell.wilsonHi}%`;

function verdictBadge(cell) {
  if (cell.refused) return badge('Insufficient evidence', 'neutral', 'Fewer than 5 terminal contracts in this cell; the hold rate is refused.');
  if (cell.belowFloor) return badge('Below floor', 'bad', `Hold rate ${cell.holdRatePct}% is below the ${cell.reliabilityFloorPct}% reliability floor.`);
  return badge('Holding', 'good', `Hold rate ${cell.holdRatePct}% is at or above the ${cell.reliabilityFloorPct}% reliability floor.`);
}

function cellMembersModal(cell) {
  const rows = cell.members.map((m) => h('tr', null,
    h('td', null, m.mandateId.slice(-6)),
    h('td', null, m.actionClass),
    h('td', null, m.held ? 'Held (completed)' : `Not held (${m.terminalStatus})`),
    h('td', null, m.forecastPct === null ? 'no prior' : `${m.forecastPct}%`),
    h('td', null, formatDate(m.closedOn)),
  ));
  const body = h('div', { class: 'stack-tight' },
    h('p', null, `Each row is one terminal contract in the “${cell.actionLabel}” × ${cell.altitudeLabel} cell. The forecast is the cell’s hold rate from strictly-prior terminals — out-of-sample by construction.`),
    h('table', { class: 'table' },
      h('thead', null, h('tr', null,
        h('th', { scope: 'col' }, 'Contract'),
        h('th', { scope: 'col' }, 'Action'),
        h('th', { scope: 'col' }, 'Outcome'),
        h('th', { scope: 'col' }, 'Forecast (held)'),
        h('th', { scope: 'col' }, 'Closed'))),
      h('tbody', null, ...rows)));
  openModal({ title: `Contracts behind “${cell.actionLabel}” at ${cell.altitudeLabel}`, body, actions: [h('button', { class: 'btn btn-ghost', type: 'button', onClick: closeAllModals }, 'Close')] });
}

export function renderAuthorityCalibration(ctx) {
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const settings = ctx.state.settings || {};
  const report = calibrateAuthority(ctx.state, { now, settings });
  const panel = panelFor(ctx.query);
  const signals = authorityCalibrationSignals(report);

  const stats = [
    stat({ label: 'Terminal contracts', value: String(report.totalTrials), hint: 'completed, returned, expired or revoked' }),
    stat({ label: 'Authority held', value: String(report.totalCompleted), hint: 'completed (verified outcome)' }),
    stat({ label: 'Overall hold rate', value: pct(report.overallHoldRatePct), hint: report.overallRefused ? 'refused below the evidence floor' : 'pooled across cells' }),
    stat({ label: 'Pooled Brier', value: report.overallBrier === null ? '—' : String(report.overallBrier), hint: `${report.scoringCells} scorable cell(s)`, tone: report.overallBrier === null ? 'neutral' : 'good' }),
    stat({ label: 'Cells below floor', value: String(report.scoredBelowFloor), hint: 'each opens a governed decision above' }),
    stat({ label: 'Cells refused', value: String(report.refusedCells), hint: 'fewer than 5 trials' }),
  ];

  const cellsTable = table({
    columns: [
      { label: 'Action class', render: (row) => row.cell.actionLabel },
      { label: 'Receiver altitude', render: (row) => row.cell.altitudeLabel },
      { label: 'Trials', render: (row) => String(row.cell.n) },
      { label: 'Held', render: (row) => String(row.cell.completedN) },
      { label: 'Not held', render: (row) => String(row.cell.returnedN + row.cell.expiredN + row.cell.revokedN) },
      { label: 'Hold rate', render: (row) => pct(row.cell.holdRatePct) },
      { label: '95% interval', render: (row) => interval(row.cell) },
      { label: 'Brier', render: (row) => String(row.cell.brier === null ? '—' : row.cell.brier) },
      { label: 'Skill vs base rate', render: (row) => String(row.cell.brierSkill === null ? '—' : `${row.cell.brierSkill * 100}pp`) },
      { label: 'Verdict', render: (row) => verdictBadge(row.cell) },
    ],
    rows: report.cells.map((c) => ({ className: '', attrs: { onClick: () => cellMembersModal(c) } })),
    caption: 'Calibration cells by action class and receiver altitude. Click a cell to see the terminal contracts behind it.',
    emptyMessage: 'No terminal mandate contracts yet — accepted authority has nothing to grade until a contract reaches completed, returned, expired or revoked.',
  });

  const altitudeTable = table({
    columns: [
      { label: 'Receiver altitude', render: (row) => row.altitudeLabel },
      { label: 'Trials', render: (row) => String(row.n) },
      { label: 'Held', render: (row) => String(row.completedN) },
      { label: 'Hold rate (pooled)', render: (row) => pct(row.holdRatePct) },
      { label: '95% interval', render: (row) => interval(row) },
      { label: 'Fréchet lower bound', render: (row) => pct(row.frechetLowerBoundPct) },
      { label: 'Independence reference', render: (row) => pct(row.independencePct) },
    ],
    rows: report.altitudeReadings,
    caption: 'Pooled by receiver altitude: what each level actually holds, without any re-entry from the levels below.',
    emptyMessage: 'No terminal mandate contracts yet.',
  });

  const floorInput = h('input', { id: 'acl-floor-n', class: 'input', type: 'number', min: '1', max: '50', value: String(report.conv.floorN) });
  const floorPctInput = h('input', { id: 'acl-floor-pct', class: 'input', type: 'number', min: '1', max: '100', value: String(report.conv.reliabilityFloorPct) });
  const autoToggle = h('input', { id: 'acl-auto', class: 'input', type: 'checkbox', ...(report.conv.autoPropagate ? { checked: true } : {}) });

  const applySettings = () => {
    const floorN = Math.max(1, Math.min(50, Number(floorInput.value) || report.conv.floorN));
    const floorPct = Math.max(1, Math.min(100, Number(floorPctInput.value) || report.conv.reliabilityFloorPct));
    const result = ctx.api.updateSettings({ authorityCalibrationFloorN: floorN, authorityCalibrationReliabilityFloorPct: floorPct, authorityCalibrationAutoPropagate: autoToggle.checked });
    toast(result.ok ? 'Calibration settings saved.' : (result.error || 'Settings not saved.'), result.ok ? 'good' : 'bad');
    if (result.ok) ctx.refresh();
  };

  const runScan = () => {
    const res = ctx.api.calibrationScan();
    toast(res.ok ? `Calibration scan complete. ${res.propagations?.length || 0} propagation(s).` : (res.error || 'Scan failed.'), res.ok ? 'good' : 'bad');
    if (res.ok) ctx.refresh();
  };

  const downloadBrief = () => {
    const ok = downloadText({ filename: `leados-authority-calibration-brief-${dayKey(now)}.txt`, text: authorityCalibrationBrief(report), mime: 'text/plain;charset=utf-8' });
    toast(ok ? 'Brief downloaded' : 'Brief not available', ok ? 'good' : 'bad');
  };

  const exportCsv = () => {
    let res;
    try {
      res = ctx.exportCSV('authority-calibration');
    } catch (err) {
      toast(err?.message || 'Export is not available from a declared seat.', 'warn');
      return;
    }
    if (res.ok && res.csv) {
      const ok = downloadText({ filename: res.filename, text: res.csv, mime: 'text/csv;charset=utf-8' });
      toast(ok ? 'CSV downloaded' : 'Download not available', ok ? 'good' : 'bad');
    } else {
      toast(res.error || 'Export failed', 'bad');
    }
  };

  const headerActions = [
    h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => runScan() }, 'Run calibration scan'),
    h('button', { class: 'btn btn-primary', type: 'button', onClick: () => downloadBrief() }, 'Download brief'),
  ];

  const floorCard = card({
    title: 'Evidence & reliability floors',
    body: h('div', { class: 'stack-tight' },
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Trials per cell before a rate is printed'), floorInput, h('span', { class: 'field-hint' }, 'Below this, counts only — the rate is refused.')),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Hold-rate floor (%)'), floorPctInput, h('span', { class: 'field-hint' }, 'Cells below it open a governed decision above.')),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Automatic propagation'), autoToggle, h('span', { class: 'field-hint' }, 'Paused: measurement still works; no decisions are opened until resumed.')),
      h('div', { class: 'form-actions' },
        h('button', { class: 'btn btn-primary', type: 'button', onClick: applySettings }, 'Apply settings'),
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => runScan() }, 'Run calibration scan now')))});

  const aboutCard = card({
    title: 'What this ledger is',
    body: h('div', { class: 'stack-tight' },
      h('p', null, 'Each accepted mandate contract is one trial. “Completed” means the authority the sender granted held; “returned”, “expired” or “revoked” means it did not. Trials group by action class and the receiver’s altitude, never by person.'),
      h('p', null, 'Each trial is graded against the cell’s hold rate from strictly-prior terminals — an out-of-sample forecast. The Brier score and skill vs the base-rate show whether the workspace’s expectation of authority is calibrated to its results.'),
      h('p', null, 'Calibration is advisory: no rule changes a contract, a setting or anyone’s seat. A span decides what to do about a cell below its floor.'))});

  const briefCard = card({
    title: 'Identity-free brief',
    body: h('div', { class: 'stack-tight' },
      h('div', { class: 'brief-text' }, authorityCalibrationBrief(report)),
      h('div', { class: 'form-actions' },
        h('button', { class: 'btn btn-primary', type: 'button', onClick: () => downloadBrief() }, 'Download brief'),
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => exportCsv() }, 'Export CSV (aggregate)')))});

  const panels = {
    overview: h('div', { class: 'stack' },
      h('div', { class: 'stat-grid' }, ...stats),
      cellsTable,
      report.cells.length ? h('p', { class: 'muted' }, 'A cell refuses its rate below 5 trials; below the reliability floor it opens one governed decision for the span above — never a person rating.') : null,
    ),
    altitude: h('div', { class: 'stack' },
      report.altitudeReadings.some((r) => r.n > 0) ? altitudeTable : emptyState({ title: 'No altitude readings yet' }),
      h('p', { class: 'muted' }, 'Pooled reading per receiver altitude. Fréchet lower bound is assumption-free (“at least one cell holds”); the independence reference is printed beside it, never substituted for it.')),
    signals: h('div', { class: 'stack' },
      signals.length ? h('div', null, ...signals.map((s) => findingCard(s, { onAction: s.action && s.action.route ? () => ctx.navigate(s.action.route) : null }))) : emptyState({ title: 'No calibration signals', body: 'Every cell is at or above its floor, or the record cannot yet say.' })),
    settings: h('div', { class: 'stack' }, floorCard, aboutCard),
    brief: h('div', { class: 'stack' }, briefCard),
  };

  return h('div', { class: 'page' },
    pageHeader({
      eyebrow: 'Authority Calibration Ledger · Schema v85 · ADR-0079',
      title: 'Authority calibration',
      subtitle: 'Which spans reliably hold which rights — graded by action class and receiver altitude, no person rated.',
      actions: headerActions,
      meta: h('div', null, kv('Generated', formatDate(now)), kv('Engine', report.engineVersion)),
    }),
    tabs({ items: PANELS, active: panel, onSelect: (key) => go(ctx, key) }),
    h('div', { class: 'stack' }, panels[panel]),
  );
}
