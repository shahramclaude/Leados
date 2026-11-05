/**
 * app/views/prospective.js — `#/prospective`, the Prospective Intervention
 * Contract (ADR-0094).
 *
 * Five panels, five different questions at five altitudes:
 *   Desk         "What should I pre-register at this altitude, and what is withheld?"
 *   Contracts    "Which frozen bets reached their declared threshold, and which are refused?"
 *   Instruments  "Which dated records does the grade read, and who wrote them?"
 *   Calibration  "Is this cell's Brier skill above the floor, with what interval?"
 *   Certificate  "What can travel upward without naming a person or a cohort?"
 *
 * Nothing on this screen rates a person, asserts causality or sends anything to
 * anyone. A title is shown only to the altitude that declared the bet.
 */
import { h, toast, openModal, uid } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import { dayKey } from '../core/time.js';
import { PROSPECTIVE_ALTITUDE_HORIZONS } from '../core/domain/prospectiveRegistry.js';

const PANELS = [
  { key: 'desk', label: 'Desk' },
  { key: 'contracts', label: 'Contracts' },
  { key: 'instruments', label: 'Instruments' },
  { key: 'calibration', label: 'Calibration' },
  { key: 'certificate', label: 'Certificate' },
];

const CSV_COLUMNS = [
  'row_kind', 'altitude', 'rank', 'instrument', 'contracts_n', 'graded_n', 'reached_n',
  'observed_pct', 'mean_brier', 'mean_reference_brier', 'skill_pct',
  'interval_low_pct', 'interval_high_pct', 'refused', 'reason',
];

const panelFor = (q) => {
  const p = q?.get?.('panel');
  return PANELS.some((item) => item.key === p) ? p : 'desk';
};
const go = (ctx, panel) => ctx.navigate(`#/prospective?panel=${panel}`);
const pct = (value) => (value === null || value === undefined ? 'withheld' : `${value}%`);
const blank = (value) => (value === null || value === undefined ? '—' : String(value));

const STATUS_META = {
  open: { label: 'Inside horizon', tone: 'neutral', hint: 'The outcome is not observable yet.' },
  due: { label: 'Due to grade', tone: 'warn', hint: 'The horizon has passed; an explicit scan grades it from the frozen cohort.' },
  overdue: { label: 'Past review window', tone: 'bad', hint: 'An outcome-integrity finding is owed, not a silent dismissal.' },
  graded: { label: 'Graded once', tone: 'good', hint: 'Scored with the Brier proper scoring rule; never re-graded.' },
};

function notify(result, message) {
  if (!result?.ok) {
    toast(result?.error || 'The prospective action was refused.', 'bad');
    return false;
  }
  toast(result.warning || message, result.warning ? 'bad' : 'good');
  return true;
}

function fallback(title, text, label) {
  openModal({
    title,
    body: h('textarea', { rows: 16, readonly: true, value: text, class: 'input', 'aria-label': label }),
  });
}

function exportCsv(ctx) {
  const result = ctx.api.prospectiveCsvRows();
  if (!result.ok) return toast(result.error, 'bad');
  const text = serializeCsv(CSV_COLUMNS, result.rows);
  const filename = `leados-prospective-contracts-${dayKey(ctx.now)}.csv`;
  if (!downloadText({ filename, text, mime: 'text/csv' })) fallback('Copy prospective contracts CSV', text, 'Prospective contracts CSV');
}

function exportBrief(ctx) {
  const result = ctx.api.prospectiveBriefText();
  if (!result.ok) return toast(result.error, 'bad');
  const filename = `leados-prospective-brief-${dayKey(ctx.now)}.md`;
  if (!downloadText({ filename, text: result.text, mime: 'text/markdown' })) fallback('Copy upward brief', result.text, 'Upward brief');
}

/** Accessible pre-registration dialog — no blocking window.prompt. */
function openDeclareDialog(ctx, report) {
  const instrument = h('select', { class: 'input', id: uid('pic-instrument'), 'aria-label': 'Observable instrument' },
    ...report.instruments.map((item) => h('option', { value: item.key }, item.label)));
  const probability = h('input', { class: 'input', type: 'number', min: '1', max: '99', step: '1', value: '70', 'aria-label': 'Declared probability percent' });
  const threshold = h('input', { class: 'input', type: 'number', min: '1', max: '100', step: '1', value: '60', 'aria-label': 'Declared threshold percent' });
  const defaultHorizon = PROSPECTIVE_ALTITUDE_HORIZONS[report.seat.altitudeKey] || 30;
  const horizon = h('input', { class: 'input', type: 'number', min: '7', max: '365', step: '1', value: String(defaultHorizon), 'aria-label': 'Horizon in days' });
  const title = h('input', { class: 'input', type: 'text', maxLength: '120', placeholder: 'One short line naming the work', 'aria-label': 'Name the bet' });
  const status = h('p', { class: 'muted small', role: 'status', 'aria-live': 'polite' });
  const submit = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Freeze the bet');

  const body = h('form', { class: 'stack', onSubmit: (event) => {
    event.preventDefault();
    submit.disabled = true;
    const result = ctx.api.prospectiveDeclare({
      instrumentKey: instrument.value,
      probabilityPct: Number(probability.value),
      thresholdPct: Number(threshold.value),
      horizonDays: Number(horizon.value),
      title: title.value,
    });
    if (!result.ok) {
      status.textContent = result.error;
      submit.disabled = false;
      return;
    }
    dialog.close();
    notify(result, result.existing ? 'An identical bet is already frozen today.' : `Frozen over ${result.cohortN} record(s); governed work, typed links and vertical roll-up propagated.`);
    ctx.refresh();
  } },
    banner({ tone: 'info', title: 'Declare before you act', body: 'The probability, threshold, horizon and the exact cohort of record ids are frozen now. The engine grades the bet later from the workspace\u2019s own dated records. No one re-enters an outcome and no causality is claimed.' }),
    h('label', { class: 'field' }, h('span', null, 'Observable instrument'), instrument),
    h('div', { class: 'grid grid-2' },
      h('label', { class: 'field' }, h('span', null, 'Probability (%)'), probability),
      h('label', { class: 'field' }, h('span', null, 'Threshold (%)'), threshold)),
    h('div', { class: 'grid grid-2' },
      h('label', { class: 'field' }, h('span', null, 'Horizon (days)'), horizon),
      h('label', { class: 'field' }, h('span', null, 'Name'), title)),
    h('p', { class: 'muted small' }, `With probability p, at least T% of the frozen cohort will reach its terminal state by the horizon. Brier score = (p − outcome)². Evidence floor ${report.conventions.prospectiveEvidenceFloor}; a smaller cohort is refused.`),
    status,
    h('div', { class: 'form-actions' }, submit),
  );

  const dialog = openModal({
    title: 'Pre-register one intervention bet',
    description: 'The cohort is frozen at declaration so the evaluated population cannot be re-selected after the outcome is known.',
    body,
    footer: [h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel')],
    size: 'md',
  });
}

function openConventionDialog(ctx, report, key) {
  const config = {
    evidenceFloor: { label: 'Evidence floor', key: 'prospectiveEvidenceFloor', min: 2, max: 20, value: report.conventions.prospectiveEvidenceFloor },
    cellFloor: { label: 'Calibration cell floor', key: 'prospectiveCellFloor', min: 2, max: 20, value: report.conventions.prospectiveCellFloor },
    skillFloorPct: { label: 'Brier skill floor (%)', key: 'prospectiveSkillFloorPct', min: 0, max: 100, value: report.conventions.prospectiveSkillFloorPct },
    reviewDays: { label: 'Outcome review window (days)', key: 'prospectiveReviewDays', min: 1, max: 90, value: report.conventions.prospectiveReviewDays },
  }[key];
  const input = h('input', {
    class: 'input', type: 'number', min: String(config.min), max: String(config.max), step: '1',
    value: String(config.value), 'aria-label': config.label,
  });
  const dialog = openModal({
    title: `Set ${config.label.toLowerCase()}`,
    description: 'These conventions bound what every altitude below reads. They are set at director rank and above.',
    body: h('label', { class: 'field' }, h('span', null, config.label), input),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const result = ctx.api.prospectiveSetConventions({ [key]: Number(input.value) });
          dialog.close();
          if (notify(result, `${config.label} set.`)) ctx.refresh();
        },
      }, 'Save'),
    ],
    size: 'sm',
  });
}

/* -------------------------------------------------------------------- panels */

function deskPanel(ctx, report) {
  const playbook = report.playbook;
  const coverage = report.coverage;
  return h('div', { class: 'stack' },
    banner({ tone: 'info', title: `What this ledger measures at ${report.seat.label.toLowerCase()}`, body: report.premise }),
    h('div', { class: 'stat-grid' },
      stat({ label: 'Frozen contracts', value: report.summary.declared, hint: `cohorts frozen before the work`, tone: 'neutral' }),
      stat({ label: 'Graded once', value: report.summary.graded, hint: 'from dated records, out of sample', tone: 'good' }),
      stat({ label: 'Due / overdue', value: `${report.summary.due} / ${report.summary.overdue}`, hint: 'an explicit scan grades them', tone: report.summary.overdue ? 'bad' : '' }),
      stat({ label: 'Realised rate', value: coverage.refused ? 'withheld' : pct(coverage.pct), hint: coverage.refused ? `below the ${coverage.floor}-contract floor` : `Wilson 95% ${coverage.lowPct}–${coverage.highPct}%` }),
    ),
    card({
      title: playbook.title,
      subtitle: `${playbook.horizon} · the ${report.seat.label.toLowerCase()} decision this ledger exists to support`,
      body: h('div', { class: 'stack' },
        h('p', null, h('strong', null, 'Question: '), playbook.question),
        h('p', null, h('strong', null, 'What you can see here: '), playbook.see),
        h('p', null, h('strong', null, 'What this altitude can do: '), playbook.act),
        h('p', null, h('strong', null, 'What travels upward: '), playbook.hand),
        h('div', { class: 'form-actions' },
          h('button', { type: 'button', class: 'btn btn-primary', disabled: report.seat.readOnly, onClick: () => openDeclareDialog(ctx, report) }, 'Pre-register a bet'),
          h('button', { type: 'button', class: 'btn btn-ghost', disabled: report.seat.readOnly, onClick: () => {
            const result = ctx.api.prospectiveScan();
            if (notify(result, 'Due contracts graded from their frozen cohorts; bounded governed findings opened.')) ctx.refresh();
          } }, 'Grade due contracts'),
          h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => exportBrief(ctx) }, 'Copy upward brief'),
          h('a', { class: 'btn btn-ghost', href: '#/seat' }, 'Change altitude'),
        ),
      ),
    }),
    card({
      title: 'Open governed findings',
      subtitle: 'Each is a governed decision owned at an altitude that can change the practice. The engine opens them; only a human resolves them.',
      body: report.openDecisions.length
        ? table({
          caption: 'Open prospective findings',
          columns: [
            { label: 'Finding', render: (d) => d.title },
            { label: 'Rule', render: (d) => badge(d.ruleId, 'warn', 'The rule that opened this finding') },
            { label: 'Review on', render: (d) => d.reviewOn || '—' },
            { label: 'Decision', render: () => h('a', { href: '#/decisions' }, 'Open in Decisions') },
          ],
          rows: report.openDecisions,
        })
        : emptyState({ title: 'No open calibration or outcome-integrity finding', body: 'Either every due cohort graded cleanly, or nothing has been declared yet. The ledger itself is still live above.' }),
    }),
    card({
      title: 'What this ledger deliberately does not do',
      body: h('ul', { class: 'list' },
        h('li', null, report.disclosure.cohort),
        h('li', null, report.disclosure.engine),
        h('li', null, report.disclosure.local)),
    }),
  );
}

function contractsPanel(ctx, report, focusedId) {
  if (!report.rows.length) {
    return emptyState({
      title: 'No frozen contract in this span',
      body: 'Pre-register a bet on the Desk panel. A contract needs a frozen cohort of dated records from cases, delegations, decisions or 1:1s; an empty cohort is refused rather than scored.',
    });
  }
  return h('div', { class: 'stack' },
    banner({ tone: 'info', title: 'One frozen cohort, one grade, once', body: report.disclosure.cohort }),
    card({
      title: 'Frozen pre-registrations',
      subtitle: 'The declared assumptions are frozen separately from the governed operational work. A grade says only whether the threshold was reached.',
      body: table({
        caption: 'Frozen pre-registered intervention contracts',
        columns: [
          { label: 'Declared', render: (r) => r.declaredOn },
          { label: 'Instrument', render: (r) => r.instrumentLabel },
          { label: 'Bet', render: (r) => `${r.probabilityPct}% · ≥ ${r.thresholdPct}%` },
          { label: 'Cohort', render: (r) => String(r.cohortN) },
          { label: 'Horizon', render: (r) => r.horizonOn },
          { label: 'State', render: (r) => badge(STATUS_META[r.status]?.label || r.status, STATUS_META[r.status]?.tone || 'neutral', STATUS_META[r.status]?.hint || '') },
          { label: 'Observed', render: (r) => r.grade ? pct(r.observedPct) : (r.status === 'open' ? 'not due' : 'refused') },
          { label: 'Brier', render: (r) => blank(r.brier) },
          { label: 'Refusal', render: (r) => r.reason || '—' },
        ],
        rows: report.rows.map((row) => ({ ...row, _focused: row.id === focusedId })),
        emptyMessage: 'No contract in this span.',
      }),
    }),
    report.detailAllowed
      ? card({
        title: 'Your own declarations',
        subtitle: 'Titles are visible only at the altitude that declared the bet. They never enter a brief, a CSV or an upward edge.',
        body: table({
          caption: 'Contract names at this altitude',
          columns: [
            { label: 'Name', render: (r) => r.title || '(withheld above the manager rank)' },
            { label: 'Declared on', render: (r) => r.declaredOn },
            { label: 'Frozen cohort', render: (r) => `${r.cohortN} ${r.instrumentKey}` },
          ],
          rows: report.rows,
        }),
      })
      : null,
    report.withheld.length
      ? card({ title: 'What is withheld here, and why', body: h('ul', { class: 'list' }, ...report.withheld.map((item) => h('li', null, h('strong', null, `${item.n} item(s): `), item.reason))) })
      : null,
  );
}

function instrumentsPanel(ctx, report) {
  return h('div', { class: 'stack' },
    banner({ tone: 'info', title: 'Four instruments, all of them other modules\u2019 dated records', body: 'This ledger writes into none of them. A span cannot improve its grade by using this screen, and a channel that stops producing dated records degrades the reading instead of hiding it.' }),
    card({
      title: 'Observable instruments',
      body: table({
        caption: 'Instruments and the collections they read',
        columns: [
          { label: 'Instrument', render: (i) => i.label },
          { label: 'Collection', render: (i) => i.collection },
          { label: 'Terminal state', render: (i) => i.terminalLabel },
          { label: 'Written by', render: (i) => i.source },
        ],
        rows: report.instruments,
      }),
    }),
    h('div', { class: 'grid-2' }, ...report.instruments.map((i) => card({
      title: i.label,
      subtitle: i.question,
      body: h('p', { class: 'muted' }, i.detail),
    }))),
  );
}

function calibrationPanel(ctx, report) {
  const coverage = report.coverage;
  return h('div', { class: 'stack' },
    card({
      title: 'Calibration by altitude × instrument',
      subtitle: 'Brier skill is against each cell\u2019s own strictly-prior base rate. A refused figure is blank, never zero.',
      body: report.cells.length
        ? table({
          caption: 'Prospective calibration cells',
          columns: [
            { label: 'Altitude', render: (c) => c.altitudeKey },
            { label: 'Instrument', render: (c) => c.instrumentKey },
            { label: 'Bets', render: (c) => String(c.contractsN) },
            { label: 'Graded', render: (c) => String(c.gradedN) },
            { label: 'Mean Brier', render: (c) => c.refused || c.suppressed ? 'withheld' : blank(c.meanBrier) },
            { label: 'Skill', render: (c) => c.refused || c.suppressed ? 'withheld' : pct(c.skillPct) },
            { label: '95% interval', render: (c) => c.refused || c.suppressed ? 'withheld' : `${c.lowPct}–${c.highPct}%` },
            { label: 'Why', render: (c) => c.reason || 'published' },
          ],
          rows: report.cells,
        })
        : emptyState({ title: 'No calibration cell yet', body: 'A cell appears once a contract is declared in this span. Rates are refused below the declared evidence floor.' }),
    }),
    card({
      title: 'Realised-threshold rate',
      subtitle: 'The share of graded contracts whose declared threshold was actually reached — a property of the instrument, not of any person.',
      body: h('div', { class: 'stack' },
        coverage.refused
          ? banner({ tone: 'warn', title: 'Rate withheld', body: coverage.reason })
          : banner({ tone: 'info', title: `${coverage.reachedN} of ${coverage.gradedN} graded contracts reached their threshold`, body: `${coverage.pct}% (Wilson 95% interval ${coverage.lowPct}–${coverage.highPct}%). The interval is published because a point estimate on a small ledger reads as more certainty than the ledger can support.` }),
        h('div', { class: 'stat-grid' },
          stat({ label: 'Graded', value: coverage.gradedN, hint: `floor ${coverage.floor}` }),
          stat({ label: 'Reached', value: coverage.refused ? 'withheld' : coverage.reachedN }),
          stat({ label: 'Point estimate', value: coverage.refused ? 'withheld' : pct(coverage.pct) }),
          stat({ label: '95% interval', value: coverage.refused ? 'withheld' : `${coverage.lowPct}–${coverage.highPct}%` })),
      ),
    }),
    card({
      title: 'By altitude',
      subtitle: 'Above the manager rank the unit of analysis is the span; below the director rank a pooled rate is withheld.',
      body: table({
        caption: 'Declared and graded contracts by altitude',
        columns: [
          { label: 'Altitude', render: (a) => a.altitudeKey },
          { label: 'Declared', render: (a) => String(a.declared) },
          { label: 'Graded', render: (a) => String(a.graded) },
          { label: 'Reached', render: (a) => String(a.reached) },
          { label: 'Rate', render: (a) => a.refused ? 'withheld' : pct(a.ratePct) },
          { label: 'Reason', render: (a) => a.reason || 'published' },
        ],
        rows: report.byAltitude,
      }),
    }),
    card({
      title: 'Conventions',
      subtitle: `Evidence floor ${report.conventions.prospectiveEvidenceFloor} · cell floor ${report.conventions.prospectiveCellFloor} · skill floor ${report.conventions.prospectiveSkillFloorPct}% · review window ${report.conventions.prospectiveReviewDays}d · automatic propagation ${report.conventions.prospectiveAutoPropagate ? 'on' : 'off (an explicit scan still runs)'}`,
      body: report.seat.rank >= 3
        ? h('div', { class: 'form-actions' },
          ...['evidenceFloor', 'cellFloor', 'skillFloorPct', 'reviewDays'].map((key) => h('button', {
            type: 'button', class: 'btn btn-ghost', disabled: report.seat.readOnly,
            onClick: () => openConventionDialog(ctx, report, key),
          }, `Set ${key.replace(/([A-Z])/g, ' $1').toLowerCase()}`)))
        : h('p', { class: 'muted' }, 'These conventions are set at director rank and above. Below that rank only counts and your own contracts are shown.'),
    }),
  );
}

function certificatePanel(ctx, report) {
  return h('div', { class: 'stack' },
    card({
      title: 'Upward certificate',
      subtitle: 'What an executive may carry upward from this ledger without exposing a person, a cohort id or a title.',
      body: h('div', { class: 'stack' },
        h('ul', { class: 'list' },
          h('li', null, `Measured ${report.today} at ${report.seat.label.toLowerCase()} (rank ${report.seat.rank}).`),
          h('li', null, `${report.summary.declared} frozen contract(s): ${report.summary.graded} graded, ${report.summary.due} due, ${report.summary.overdue} overdue, ${report.summary.ungradable} refused as unobservable.`),
          h('li', null, report.coverage.refused ? `Realised-threshold rate WITHHELD: ${report.coverage.reason}` : `Realised-threshold rate ${report.coverage.pct}% (Wilson 95% ${report.coverage.lowPct}–${report.coverage.highPct}%).`),
          h('li', null, `${report.summary.cellsPublished} calibration cell(s) published; ${report.summary.cellsRefused} refused or complementarily suppressed.`),
          h('li', null, report.disclosure.score),
          h('li', null, report.disclosure.rollup)),
        h('div', { class: 'form-actions' },
          h('button', { type: 'button', class: 'btn btn-primary', onClick: () => exportBrief(ctx) }, 'Download brief (Markdown)'),
          h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => exportCsv(ctx) }, 'Download aggregate CSV')),
      ),
    }),
    card({ title: 'Boundary statement', body: h('p', { class: 'muted' }, report.disclosure.premise) }),
  );
}

export function renderProspective(ctx) {
  const panel = panelFor(ctx.query);
  const report = ctx.api.prospectiveRead();
  if (!report?.ok) {
    return h('div', { class: 'stack' }, emptyState({ title: 'The prospective ledger could not be built', body: report?.error || 'No report is available.' }));
  }
  const focusedId = ctx.query?.get?.('contract') || null;
  const body = panel === 'desk'
    ? deskPanel(ctx, report)
    : panel === 'contracts'
      ? contractsPanel(ctx, report, focusedId)
      : panel === 'instruments'
        ? instrumentsPanel(ctx, report)
        : panel === 'calibration'
          ? calibrationPanel(ctx, report)
          : certificatePanel(ctx, report);

  return h('div', { class: 'stack' },
    pageHeader({
      eyebrow: 'Judgment',
      title: 'Prospective contracts',
      subtitle: 'Freeze a bet before the work, grade it once from the workspace\u2019s own dated records, and roll the calibration signal up every level of the chain of command.',
      actions: [
        badge(`${report.summary.declared} frozen`, 'neutral', 'Pre-registered contracts in this span'),
        report.summary.overdue ? badge(`${report.summary.overdue} overdue`, 'bad', 'Contracts past their outcome review window') : badge('no overdue contract', 'good'),
      ],
      meta: h('p', { class: 'muted' }, report.premise),
    }),
    tabs({ items: PANELS.map((item) => ({ key: item.key, label: item.label })), active: panel, onSelect: (key) => go(ctx, key), ariaLabel: 'Prospective contract panels' }),
    body,
  );
}
