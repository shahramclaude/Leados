/**
 * app/views/matrixIntakePanel.js — `#/matrix?panel=intake`, the Matrix Line
 * Intake Gate and Share-Day WIP Ceiling (ADR-0171, Schema v136).
 *
 * The accountability ledger can SEE a line charged past its share; nothing
 * acted when the work was taken on. This panel is the control at the point of
 * admission: record a dated intake act against a declared line and its
 * running period, and the gate refuses an intake that would breach the
 * line's declared share-day ceiling unless a human decides otherwise
 * (accept the over-share with a reason, re-route to another line, or retune
 * the declaration).
 *
 * WHAT THIS SCREEN REFUSES TO PRINT
 * ---------------------------------
 *  - A ceiling projected from today's share where the timeline cannot prove
 *    a day. An unprovable ceiling is printed as a refusal, and the gate
 *    admits nothing against it.
 *  - A consumed total that pretends pre-gate work was zero. The ledger
 *    starts empty; the panel says so.
 *  - A breach smoothed into a pass. An over-share is recorded as a fact.
 */

import { h, toast } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { badge, banner, card, emptyState, stat, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import {
  buildLineIntakeGate,
  lineIntakeBriefText,
  lineIntakeCsvRows,
} from '../core/domain/lineIntake.js';
import {
  LINE_INTAKE_CSV_COLUMNS,
  LINE_INTAKE_CONVENTIONS,
  LINE_INTAKE_FRAMEWORKS,
  LINE_INTAKE_VERDICTS,
} from '../core/domain/lineIntakeRegistry.js';

const num = (value) => (value === null || value === undefined || value === '' ? '—' : String(value));
const pd = (hundredths) => (hundredths === null || hundredths === undefined ? '—' : (hundredths / 100).toFixed(2));
const toneFor = (tone) => (tone === 'bad' ? 'bad' : tone === 'warn' ? 'warn' : tone === 'good' ? 'good' : 'neutral');

function boardPanel(report) {
  const b = report.board;
  if (!b.periodKey) {
    return banner({
      tone: 'bad',
      title: 'The period is unreadable',
      body: 'No ceiling can be priced for an unreadable period. The gate admits nothing until the period is readable.',
    });
  }
  const stats = [
    stat({ label: 'Lines in scope', value: num(b.linesN) }),
    stat({ label: 'Live intakes', value: num(b.intakesN), hint: `${b.recordedN} recorded · ${b.overShareN} over share · ${b.reRoutedN} re-routed` }),
    stat({ label: 'Transfer reservations', value: num(b.transferReservationsN), hint: 'Accepted ADR-0196 work-turn transfers reserve receiving-line capacity' }),
    stat({ label: 'Within ceiling', value: num(b.withinCeilingN), tone: b.withinCeilingN ? 'good' : '' }),
    stat({ label: 'Exhausted', value: num(b.exhaustedN), tone: b.exhaustedN ? 'warn' : '' }),
    stat({ label: 'Over share', value: num(b.overShareLinesN), tone: b.overShareLinesN ? 'bad' : '' }),
    stat({ label: 'Ceiling unprovable', value: num(b.ceilingUnprovableN), tone: b.ceilingUnprovableN ? 'bad' : '' }),
  ];
  const totals = b.figuresComplete
    ? h('p', { class: 'muted small' }, `Declared ceilings total ${pd(b.ceilingH)} person-days; recorded intakes consume ${pd(b.consumedH)}; headroom ${pd(b.ceilingH - b.consumedH)}. Counts ${b.countsReconcile ? 'reconcile' : 'do NOT reconcile — the discrepancy is printed, not smoothed'}.`)
    : h('p', { class: 'muted small' }, `Recorded intakes consume ${pd(b.consumedH)} person-days, but at least one ceiling could not be priced, so no workspace ceiling or headroom is printed — a total over the priced lines would understate the claim. Counts ${b.countsReconcile ? 'reconcile' : 'do NOT reconcile'}.`);
  return h('div', { class: 'stack' },
    h('div', { class: 'grid grid-3' }, stats),
    totals,
    b.overShareLinesN
      ? banner({
        tone: 'bad',
        title: `${b.overShareLinesN} line(s) are over their declared share-day ceiling`,
        body: 'Each over-share was admitted by an explicit human override with a printed reason. The breach is on the record; the gate did not absorb it silently.',
      })
      : null,
    b.ceilingUnprovableN
      ? banner({
        tone: 'warn',
        title: `${b.ceilingUnprovableN} line(s) have no provable ceiling`,
        body: 'The gate admits nothing against an unprovable ceiling. The lines table prints each refusal with its reason.',
      })
      : null,
  );
}

function linesPanel(report) {
  const rows = report.lines.map((l) => ({
    person: l.personName,
    line: l.managerName,
    ceiling: l.ceilingH === null ? '—' : pd(l.ceilingH),
    consumed: pd(l.consumedH),
    headroom: l.headroomH === null ? '—' : pd(l.headroomH),
    verdict: h('span', {}, badge(l.verdictLabel, toneFor(lineIntakeVerdictTone(l.verdict)))),
    intakes: num(l.intakesN),
    reason: l.ceilingH === null ? (l.ceiling.reason || '') : '',
  }));
  return card({
    title: `Lines in scope — ${report.board.periodKey || 'unreadable period'}`,
    subtitle: 'One row per declared line: its declared share-day ceiling, what recorded intakes have consumed, the headroom, and the gate verdict. A refused ceiling prints its reason, never a zero.',
    body: table({
      columns: [
        { key: 'person', label: 'Person' },
        { key: 'line', label: 'Funding line' },
        { key: 'ceiling', label: 'Ceiling (person-days)' },
        { key: 'consumed', label: 'Consumed' },
        { key: 'headroom', label: 'Headroom' },
        { key: 'verdict', label: 'Verdict' },
        { key: 'intakes', label: 'Intakes' },
        { key: 'reason', label: 'Refusal reason' },
      ],
      rows,
      caption: 'Per-line gate readings for the period',
      emptyMessage: 'No declared line overlaps this period. Declare a reporting line, or choose another period.',
    }),
  });
}

function lineIntakeVerdictTone(verdict) {
  const v = LINE_INTAKE_VERDICTS.find((x) => x.key === verdict);
  return v ? v.tone : 'neutral';
}

function intakesPanel(report, ctx) {
  const rows = report.intakes.map((r) => ({
    title: r.title,
    person: report.lines.find((l) => l.personId === r.personId && l.managerId === r.managerId)?.personName || r.personId,
    line: report.lines.find((l) => l.personId === r.personId && l.managerId === r.managerId)?.managerName || r.managerId,
    date: r.date,
    shareDays: pd(r.shareDaysH),
    status: r.status === 'over-share' ? badge('Over share', 'bad') : badge('Recorded', 'good'),
    override: r.overrideReason || '',
    action: h('button', {
      class: 'btn btn-small', type: 'button',
      onclick: () => reroute(r, ctx),
    }, 'Re-route'),
  }));
  return card({
    title: 'Recorded intakes in the period',
    subtitle: 'Every intake admitted through the gate, with the line funding it. Re-routing voids the old intake and records a new one on the target line through the same gate check.',
    body: table({
      columns: [
        { key: 'title', label: 'Work' },
        { key: 'person', label: 'Person' },
        { key: 'line', label: 'Funding line' },
        { key: 'date', label: 'Intake date' },
        { key: 'shareDays', label: 'Person-days' },
        { key: 'status', label: 'Status' },
        { key: 'override', label: 'Override reason' },
        { key: 'action', label: '' },
      ],
      rows,
      caption: 'Live intakes for the period',
      emptyMessage: 'No intake has been recorded through the gate in this period. The ledger starts empty — record the first one below.',
    }),
  });
}

function reroute(intake, ctx) {
  const candidates = ctx?.api?.matrixIntakeCandidates?.();
  if (!candidates?.ok) {
    toast(candidates?.error || 'The candidate list could not be read.', 'bad');
    return;
  }
  const managers = candidates.managers.filter((m) => m.managerId !== intake.managerId);
  if (!managers.length) {
    toast('There is no other line to re-route this intake to.', 'warn');
    return;
  }
  const select = h('select', { 'aria-label': 'Target line' },
    managers.map((m) => h('option', { value: m.managerId }, m.name)));
  const doReroute = () => {
    const result = ctx?.api?.matrixRerouteIntake?.({ intakeId: intake.id, toManagerId: select.value });
    if (!result?.ok) {
      toast(result?.error || 'The re-route could not be recorded.', 'bad');
      return;
    }
    toast('Intake re-routed. The old intake is voided on the record; the new one carries the same work on the target line.', 'good');
    ctx.refresh?.();
  };
  // Inline confirm: replace the button's row is complex; use a simple prompt-free
  // two-step via toast guidance and a confirm dialog when available.
  if (typeof window !== 'undefined' && window.confirm) {
    const name = managers.find((m) => m.managerId === select.value)?.name || select.value;
    if (window.confirm(`Re-route "${intake.title}" to ${name}? The old intake is voided and a new one is recorded on that line through the gate.`)) {
      doReroute();
    }
  } else {
    doReroute();
  }
}

function recordPanel(ctx, report) {
  const candidates = ctx?.api?.matrixIntakeCandidates?.();
  if (!candidates?.ok) {
    return card({
      title: 'Record an intake',
      body: h('p', { class: 'muted' }, candidates?.error || 'The candidate list could not be read.'),
    });
  }
  const personSel = h('select', { 'aria-label': 'Person' },
    candidates.people.map((p) => h('option', { value: p.personId }, p.name)));
  const managerSel = h('select', { 'aria-label': 'Funding line (manager)' },
    candidates.managers.map((m) => h('option', { value: m.managerId }, m.name)));
  const titleInput = h('input', { type: 'text', placeholder: 'The work being taken on', 'aria-label': 'Work title' });
  const daysInput = h('input', { type: 'number', min: '0.01', step: '0.01', placeholder: 'Person-days', 'aria-label': 'Share-days (person-days)' });
  const dateInput = h('input', { type: 'date', value: report.today, 'aria-label': 'Intake date' });
  const overrideCheck = h('input', { type: 'checkbox', 'aria-label': 'Accept an over-share with a reason' });
  const reasonInput = h('input', { type: 'text', placeholder: 'Override reason (required if over share)', 'aria-label': 'Override reason' });

  const submit = () => {
    const result = ctx?.api?.matrixRecordIntake?.({
      personId: personSel.value,
      managerId: managerSel.value,
      title: titleInput.value,
      shareDays: daysInput.value,
      date: dateInput.value,
      override: overrideCheck.checked,
      overrideReason: reasonInput.value,
    });
    if (!result?.ok) {
      toast(result?.error || 'The intake could not be recorded.', 'bad');
      return;
    }
    toast(result.status === 'over-share'
      ? 'Recorded over share by human override. The breach is on the record.'
      : 'Intake recorded within the ceiling.', result.status === 'over-share' ? 'warn' : 'good');
    ctx.refresh?.();
  };

  return card({
    title: 'Record an intake',
    subtitle: 'A dated intake act against a declared line and its running period. The gate refuses a breaching intake unless you accept the over-share with a reason.',
    body: h('div', { class: 'stack-sm' },
      h('div', { class: 'row gap' },
        h('label', {}, 'Person ', personSel),
        h('label', {}, 'Funding line ', managerSel),
      ),
      h('div', { class: 'row gap' },
        h('label', {}, 'Work ', titleInput),
        h('label', {}, 'Person-days ', daysInput),
        h('label', {}, 'Date ', dateInput),
      ),
      h('div', { class: 'row gap' },
        h('label', {}, overrideCheck, ' Accept over-share'),
        h('label', {}, 'Reason ', reasonInput),
      ),
      h('div', { class: 'row gap' },
        h('button', { class: 'btn btn-primary', type: 'button', onclick: submit }, 'Record intake'),
      ),
      h('p', { class: 'muted small' }, 'Re-route and retune are the other two human decisions: re-route an intake from the table above, or retune the declaration on the Lines panel — the gate re-reads the ceiling on the next intake.'),
    ),
  });
}

function conventionsPanel() {
  return card({
    title: 'What the gate assumes (printed, not hidden)',
    subtitle: 'Conventions and frameworks. A convention is a declaration, not a measurement.',
    body: h('div', { class: 'stack-sm' },
      LINE_INTAKE_CONVENTIONS.map((c) => h('div', { class: 'stack-sm' },
        h('strong', {}, c.label),
        h('p', { class: 'muted small' }, c.detail),
      )),
      h('h4', {}, 'Frameworks'),
      LINE_INTAKE_FRAMEWORKS.map((f) => h('div', { class: 'stack-sm' },
        h('strong', {}, f.label),
        h('p', { class: 'muted small' }, f.detail),
      )),
    ),
  });
}

export function renderMatrixIntakePanel(ctx, opts = {}) {
  const state = ctx?.state || {};
  const now = opts.now || new Date();
  const report = buildLineIntakeGate(state, { now, settings: state.settings || null });
  const brief = lineIntakeBriefText(report);
  const csvRows = lineIntakeCsvRows(report);

  const downloadCsv = () => {
    const csv = serializeCsv(csvRows, LINE_INTAKE_CSV_COLUMNS);
    downloadText(csv, `matrix-intake-${report.board.periodKey || 'unreadable'}.csv`, 'text/csv');
  };

  return h('div', { class: 'stack' },
    h('p', { class: 'lede' }, 'The accountability ledger can see a line charged past its share; nothing acted when the work was taken on. This gate is the control at the point of admission: a dated intake act names the line funding the work and the share-days it consumes, and the gate refuses an intake that would breach that line\u2019s declared share-day ceiling for the running period — unless a human decides otherwise.'),
    boardPanel(report),
    linesPanel(report),
    intakesPanel(report, ctx),
    recordPanel(ctx, report),
    card({
      title: 'The brief (identity-free)',
      subtitle: 'The paragraph that goes upward. It names no person, no line and no intake.',
      actions: [
        h('button', { class: 'btn btn-small', type: 'button', onclick: downloadCsv }, 'Download CSV (aggregate-only)'),
      ],
      body: h('div', { class: 'stack-sm' },
        h('p', {}, brief),
        h('p', { class: 'muted small' }, 'The export carries counts only — no person, no name, no intake title, no date, no free text. A refused ceiling or headroom is BLANK with its flag set, never a zero.'),
      ),
    }),
    conventionsPanel(),
  );
}
