/**
 * app/views/standardWork.js — `#/standard-work`, Leader Standard Work & Tiered
 * Daily Management (ADR-0190, Schema v150).
 *
 * Three panels:
 *
 *   Board    "What do I owe today, what is owed to me, and what has risen to my
 *            tier?" — the acting seat's own routines with their slot strip and a
 *            real Record button, the routines one tier below, and every
 *            escalated abnormality the seat raised or holds.
 *
 *   Spans    the roll-up: every leadership span with routines beneath it on ANY
 *            line, counted once however many lines lead there, and each
 *            leader's structured time against Mann's reference band.
 *
 *   Method   what is declared, what is derived, what is refused, the
 *            conventions and their re-declaration gate.
 *
 * The view computes nothing. Every figure is a field of the report returned by
 * `standardWorkReport`; a withheld figure prints a dash and its reason, never a
 * zero. Nothing here rates a person: adherence describes a ROUTINE'S record.
 */
import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import {
  STANDARD_WORK_BOUNDS,
  STANDARD_WORK_CADENCES,
  STANDARD_WORK_CSV_COLUMNS,
  STANDARD_WORK_FRAMEWORKS,
  STANDARD_WORK_KINDS,
  STANDARD_WORK_LIMITS,
  STANDARD_WORK_METHOD,
  STANDARD_WORK_OUTCOMES,
  STANDARD_WORK_RULE_ID,
  STANDARD_WORK_SETTING_KEYS,
  STANDARD_WORK_SETTING_LABELS,
  STANDARD_WORK_SLOT_STATES,
} from '../core/domain/standardWorkRegistry.js';

const DIAGRAM_URL = './app/assets/standard-work-tiers.jpg';

const PANELS = Object.freeze([
  Object.freeze({ key: 'board', label: 'Board' }),
  Object.freeze({ key: 'spans', label: 'Spans & structured time' }),
  Object.freeze({ key: 'method', label: 'Method' }),
]);
const WEEKDAYS = Object.freeze([['1', 'Mon'], ['2', 'Tue'], ['3', 'Wed'], ['4', 'Thu'], ['5', 'Fri'], ['6', 'Sat'], ['0', 'Sun']]);

const panelFor = (query) => {
  const key = query?.get?.('panel');
  return PANELS.some((p) => p.key === key) ? key : 'board';
};
const dash = (value, suffix = '') => (value === null || value === undefined ? '—' : `${value}${suffix}`);
const rateText = (row) => (row.adherenceWithheld ? '—' : `${row.adherencePct}%`);
const rateHint = (row) => (row.adherenceWithheld ? row.adherenceReason : `95% Wilson ${row.adherenceLowPct}–${row.adherenceHighPct}%`);

function notify(result, message) {
  if (!result?.ok) { toast(result?.error || 'The standard-work action was refused.', 'bad'); return false; }
  toast(result.warning || message, result.warning ? 'bad' : 'good');
  return true;
}

/** Submit a dialog: a refusal stays on the form, against the field that caused it. */
function submit(ctx, form, result, message) {
  if (!result?.ok) {
    // The action names domain fields; the dialogs fold some of them into one control.
    const at = { ownerId: 'ownerLine', lineKey: 'ownerLine', toId: form.field('act') ? 'act' : 'disposition' }[result?.field] || result?.field;
    if (at) form.setErrors({ [at]: result.error });
    toast(result?.error || 'The standard-work action was refused.', 'bad');
    return;
  }
  notify(result, message);
  closeAllModals();
  ctx.refresh();
}

/* ------------------------------------------------------------------ dialogs */

function declareDialog(ctx) {
  const found = ctx.api.standardWorkCandidates();
  if (!found?.ok) { toast(found?.error || 'Declaring a routine was refused.', 'bad'); return; }
  // One option per (leader, line) the seat may actually declare under, so the
  // form cannot offer a line the action would refuse.
  const options = [];
  for (const c of found.candidates) {
    const who = c.self ? `${c.ownerName} (me)` : c.ownerName;
    if (!c.lineRequired) options.push({ value: `${c.ownerId}|`, label: c.lines.length ? `${who} — next tier ${c.lines[0].managerName}` : `${who} — top tier` });
    else for (const line of c.lines) options.push({ value: `${c.ownerId}|${line.lineKey}`, label: `${who} — under the ${line.kind} line of ${line.managerName}` });
  }
  if (!options.length) { toast('No leader on the roster is within this seat’s lines.', 'warn'); return; }
  const [minM, maxM] = STANDARD_WORK_LIMITS.minutes;
  const form = buildForm([
    { name: 'ownerLine', label: 'Whose routine, and under which line', type: 'select', options, value: options[0].value,
      help: 'A leader with several reporting lines has several next tiers. The routine names the line it is owed under; nothing is inferred.' },
    { name: 'title', label: 'Routine', type: 'text', value: '', placeholder: 'e.g. Start-of-shift gemba walk, cell 3' },
    { name: 'standard', label: 'The standard — what “done” looks like', type: 'textarea', rows: 3, value: '',
      help: 'Observable, so a deviation is visible. A routine with no standard cannot find an abnormality.' },
    { name: 'kind', label: 'Kind', type: 'select', options: STANDARD_WORK_KINDS.map((k) => ({ value: k.key, label: k.label })), value: 'gemba' },
    { name: 'cadence', label: 'Cadence', type: 'select', options: STANDARD_WORK_CADENCES.map((c) => ({ value: c.key, label: c.label })), value: 'daily' },
    { name: 'weekdays', label: 'Working weekdays (daily routines only)', type: 'boolean-block', options: WEEKDAYS.map(([value, label]) => ({ value, label })), value: ['1', '2', '3', '4', '5'] },
    { name: 'minutes', label: `Minutes per occurrence (${minM}–${maxM})`, type: 'number', value: '15' },
    { name: 'fromDay', label: 'In force from', type: 'date', value: '', help: 'Blank means today. A routine cannot be back-dated, and owes a weekly or monthly slot only for a whole period.' },
  ]);
  openModal({
    title: 'Declare a standard-work routine',
    description: 'A declared routine owes one check per calendar slot. Only its owner can record that check.',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', { class: 'btn btn-primary', type: 'button', 'data-testid': 'lsw-declare-save', onClick: () => {
        const v = form.getValues();
        const [ownerId, lineKey] = String(v.ownerLine).split('|');
        submit(ctx, form, ctx.api.standardWorkDeclareRoutine({
          ownerId, lineKey: lineKey || null, title: v.title, standard: v.standard, kind: v.kind, cadence: v.cadence,
          weekdays: (v.weekdays || []).map(Number), minutes: Number(v.minutes), fromDay: v.fromDay || null,
        }), 'Routine declared.');
      } }, 'Declare routine'),
    ],
  });
}

function recordDialog(ctx, row) {
  const dispositions = [{ value: 'contained', label: 'Contained at my tier' },
    ...row.escalateTo.map((line) => ({ value: `escalated|${line.managerId}`, label: `Escalate to ${line.managerName} (${line.kind} line)` }))];
  const form = buildForm([
    { name: 'slotKey', label: 'Slot', type: 'select', value: row.recordable[0].slotKey,
      options: row.recordable.map((slot) => ({ value: slot.slotKey, label: slot.late ? `${slot.label} — previous slot, recorded late` : `${slot.label} — current slot` })),
      help: 'Only the current slot, or the one before it while still unrecorded, can be recorded. Older slots stay unrecorded.' },
    { name: 'outcome', label: 'Outcome', type: 'select', value: 'done', options: STANDARD_WORK_OUTCOMES.map((o) => ({ value: o.key, label: o.label })) },
    { name: 'note', label: 'What was seen, or why it was missed', type: 'textarea', rows: 3, value: '',
      help: 'Required for an abnormality (what deviated from the standard) and for a miss (why). Optional when done as standard.' },
    { name: 'disposition', label: 'If an abnormality was found: where does it go?', type: 'select', value: 'contained', options: dispositions,
      help: 'Contain it at the lowest tier able to. An escalation goes to ONE named line manager and becomes a dated ask in their queue.' },
  ]);
  openModal({
    title: `Record — “${row.title}”`,
    description: `Standard: ${row.standard}`,
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', { class: 'btn btn-primary', type: 'button', 'data-testid': 'lsw-record-save', onClick: () => {
        const v = form.getValues();
        const [disposition, toId] = String(v.disposition).split('|');
        const abnormal = v.outcome === 'abnormal';
        submit(ctx, form, ctx.api.standardWorkRecordCheck({
          routineId: row.routineId, slotKey: v.slotKey, outcome: v.outcome, note: v.note,
          disposition: abnormal ? disposition : null, toId: abnormal ? (toId || null) : null,
        }), 'Check recorded.');
      } }, 'Record check'),
    ],
  });
}

function retireDialog(ctx, row) {
  const form = buildForm([{ name: 'reason', label: 'Why is this routine retired?', type: 'textarea', rows: 3, value: '', help: 'Its recorded checks are kept. The routine owes no slot from the retirement day on.' }]);
  openModal({
    title: `Retire — “${row.title}”`,
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', { class: 'btn btn-danger', type: 'button', onClick: () => submit(ctx, form, ctx.api.standardWorkRetireRoutine({ routineId: row.routineId, reason: form.getValues().reason }), 'Routine retired; its history is kept.') }, 'Retire routine'),
    ],
  });
}

function tierActDialog(ctx, esc) {
  const acts = [{ value: 'contained', label: 'Contained at my tier' }, { value: 'returned', label: 'Returned with a reason' },
    ...esc.escalateTo.map((line) => ({ value: `escalated|${line.managerId}`, label: `Escalate one tier to ${line.managerName} (${line.kind} line)` }))];
  const form = buildForm([
    { name: 'act', label: 'Your act', type: 'select', value: 'contained', options: acts },
    { name: 'note', label: 'What was done, or why', type: 'textarea', rows: 3, value: '', help: 'Required. The leader who raised it reads this.' },
  ]);
  openModal({
    title: `Abnormality from “${esc.routineTitle}”`,
    description: `Raised ${esc.raisedOn} by ${esc.ownerName}; at your tier since ${esc.hops[esc.hops.length - 1].addressedOn} (hop ${esc.hopN}). “${esc.finding}”`,
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', { class: 'btn btn-primary', type: 'button', 'data-testid': 'lsw-tier-save', onClick: () => {
        const v = form.getValues();
        const [act, toId] = String(v.act).split('|');
        submit(ctx, form, ctx.api.standardWorkTierAct({ checkId: esc.checkId, act, toId: toId || null, note: v.note }), 'Tier act recorded.');
      } }, 'Record act'),
    ],
  });
}

function conventionsDialog(ctx, conventions) {
  const numeric = ['windowDays', 'minSlots', 'lapseRun', 'tierDays', 'weekMinutes'];
  const form = buildForm([
    ...numeric.map((name) => ({
      name: STANDARD_WORK_SETTING_KEYS[name], type: 'number', value: String(conventions[name]),
      label: `${STANDARD_WORK_SETTING_LABELS[name]} (${STANDARD_WORK_BOUNDS[name][0]}–${STANDARD_WORK_BOUNDS[name][1]})`,
    })),
    { name: STANDARD_WORK_SETTING_KEYS.autoPropagate, type: 'checkbox', value: conventions.autoPropagate, label: STANDARD_WORK_SETTING_LABELS.autoPropagate },
  ]);
  openModal({
    title: 'Re-declare standard-work conventions',
    description: 'A value outside its bounds is refused, never clamped.',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', { class: 'btn btn-primary', type: 'button', onClick: () => {
        const v = form.getValues();
        const patch = Object.fromEntries(numeric.map((name) => [STANDARD_WORK_SETTING_KEYS[name], Number(v[STANDARD_WORK_SETTING_KEYS[name]])]));
        patch[STANDARD_WORK_SETTING_KEYS.autoPropagate] = Boolean(v[STANDARD_WORK_SETTING_KEYS.autoPropagate]);
        submit(ctx, form, ctx.api.standardWorkSetConventions(patch), 'Conventions re-declared.');
      } }, 'Save conventions'),
    ],
  });
}

/* ------------------------------------------------------------------- pieces */

function exportCsv(ctx, report) {
  const result = ctx.api.standardWorkCsvRows();
  if (!result?.ok) { toast(result?.error || 'The standard-work export was refused.', 'bad'); return; }
  downloadText({
    filename: `leados-standard-work-${report.today}.csv`,
    text: serializeCsv(STANDARD_WORK_CSV_COLUMNS.map((key) => ({ key, header: key })), result.rows),
    mime: 'text/csv;charset=utf-8',
  });
  toast('Aggregate CSV downloaded — the same figures this screen printed.', 'good');
}

function briefDialog(ctx) {
  const result = ctx.api.standardWorkBriefText();
  if (!result?.ok) { toast(result?.error || 'The brief was refused.', 'bad'); return; }
  openModal({
    title: 'Standard-work brief',
    description: 'Generated from the same report as this screen.',
    size: 'lg',
    body: h('pre', { class: 'brief-text', 'data-testid': 'lsw-brief' }, result.text),
    footer: [h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Close')],
  });
}

const strip = (row) => h('span', { class: 'lsw-strip', role: 'img', 'aria-label': `Last ${row.strip.length} slot(s): ${row.strip.map((slot) => slot.label).join('; ')}` },
  ...row.strip.map((slot) => h('span', { class: `lsw-slot lsw-slot-${slot.state}`, title: slot.label }, slot.glyph)));

function statGrid(report) {
  const t = report.totals;
  return h('div', { class: 'stat-grid', 'data-testid': 'lsw-stats' },
    stat({ label: 'Routines in force', value: String(t.routinesN), hint: `${t.ownersN} leader(s) · window ${report.window.fromDay} → ${report.window.toDay}` }),
    stat({ label: 'Closed slots', value: String(t.closedN), hint: `done ${t.doneN} · abnormality ${t.abnormalN} · missed ${t.missedN} · unrecorded ${t.unrecordedN}` }),
    stat({ label: 'Adherence', value: rateText(t), hint: rateHint(t), tone: t.adherenceWithheld ? '' : 'good' }),
    stat({ label: 'Lapsed routines', value: String(t.lapsedN), hint: `${report.conventions.lapseRun} closed slot(s) in a row not done`, tone: t.lapsedN ? 'bad' : '' }),
    stat({ label: 'Escalations open', value: String(t.escalationsOpenN), hint: `${t.escalationCounts.overdue} past the ${report.conventions.tierDays}-day tier window`, tone: t.escalationCounts.overdue ? 'bad' : t.escalationsOpenN ? 'warn' : '' }),
    stat({ label: 'Next tier unknown', value: String(t.tierUnresolvedN), hint: 'line not named, or the named line ended', tone: t.tierUnresolvedN ? 'warn' : '' }),
  );
}

function refusalList(report) {
  if (!report.refusals.length) return h('p', { class: 'small muted' }, 'This read raised no refusal.');
  return h('ul', { class: 'plain-list', 'data-testid': 'lsw-refusals' }, ...report.refusals.map((row) => h('li', null, badge(String(row.n), 'neutral'), ' ', row.says)));
}

/* ------------------------------------------------------------------- panels */

function boardPanel(ctx, report) {
  const mine = report.routines.filter((row) => row.isOwner);
  const others = report.routines.filter((row) => !row.isOwner);
  const routineColumns = (own) => [
    { label: 'Routine', render: (row) => h('div', null, h('strong', null, row.title), h('div', { class: 'small muted' }, `${row.kindLabel} · ${row.cadenceLabel} · ${row.minutes} min${row.retired ? ` · retired ${row.retiredOn}` : ''}`)) },
    ...(own ? [] : [{ label: 'Owner', render: (row) => row.ownerName }]),
    { label: 'Next tier', render: (row) => (row.nextTierName
      ? h('span', null, row.nextTierName, row.lineKind ? h('span', { class: 'small muted' }, ` · ${row.lineKind} line`) : null)
      : badge(row.tierStateLabel, row.tierState === 'top-tier' ? 'neutral' : 'warn', row.tierReason)) },
    { label: 'Slots', render: strip },
    { label: 'Closed', render: (row) => `${row.doneN + row.abnormalN}/${row.closedN}` },
    { label: 'Adherence', render: (row) => h('span', { title: rateHint(row) }, rateText(row), row.adherenceWithheld ? null : h('span', { class: 'small muted' }, ` (${row.adherenceLowPct}–${row.adherenceHighPct})`)) },
    { label: 'Findings', render: (row) => {
      const y = row.yield;
      if (!y || !y.checksN) return '—';
      if (y.question) return badge(`${y.abnormalN}/${y.checksN} — below its kind`, 'warn', `Fisher exact, Bonferroni-adjusted p = ${y.adjustedP.toFixed(3)} against ${y.restRatePct}% over ${y.restChecksN} checks of the same kind. A question for the next go-and-see, not a finding.`);
      return h('span', { title: y.zeroUpperPct === null ? '' : `Zero findings in ${y.checksN} checks: the true finding rate is below ${y.zeroUpperPct}% (exact one-sided 95% bound).` },
        `${y.abnormalN}/${y.checksN}`, y.zeroUpperPct === null ? null : h('span', { class: 'small muted' }, ` (≤ ${y.zeroUpperPct}%)`));
    } },
    { label: 'Record', render: (row) => badge(row.verdictLabel, row.verdictTone, row.verdictReason) },
    { label: '', render: (row) => h('div', { class: 'row-actions' },
      row.canRecord ? h('button', { class: 'btn btn-small btn-primary', type: 'button', 'data-testid': `lsw-record-${row.routineId}`, onClick: () => recordDialog(ctx, row) }, 'Record') : null,
      row.canRetire ? h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => retireDialog(ctx, row) }, 'Retire') : null) },
  ];

  return h('div', { class: 'view-stack' },
    statGrid(report),
    banner({
      tone: report.claims.countsReconcile && report.claims.figuresComplete ? 'info' : 'warn',
      title: `Two claims, apart: the figures add up — ${report.claims.countsReconcile ? 'yes' : 'NO'}; every printed figure is complete — ${report.claims.figuresComplete ? 'yes' : 'no'}`,
      body: report.claims.reasons.length ? report.claims.reasons.join(' ') : 'Closed slots = done + done with abnormality + missed + unrecorded. Adherence is not performance: a held routine says the leader looked, not that the process is healthy.',
    }),
    card({
      title: `Risen to a tier (${report.escalations.length})`,
      subtitle: 'An abnormality a routine found and the tier could not contain. Each hop is dated; nothing skips a tier.',
      body: report.escalations.length ? table({
        caption: 'Escalated abnormalities',
        columns: [
          { label: 'Raised', render: (row) => row.raisedOn },
          { label: 'From', render: (row) => h('div', null, row.ownerName, h('div', { class: 'small muted' }, row.routineTitle)) },
          { label: 'Abnormality', render: (row) => row.finding },
          { label: 'Path', render: (row) => row.hops.map((hop) => `${hop.holderName}${hop.act ? ` (${hop.act} ${hop.actedOn})` : ''}`).join(' → ') },
          { label: 'State', render: (row) => badge(row.open ? `${row.stateLabel} · ${row.ageDays} d` : `${row.stateLabel} ${row.closedOn}`, row.stateTone) },
          { label: '', render: (row) => (row.canAct ? h('button', { class: 'btn btn-small btn-primary', type: 'button', 'data-testid': `lsw-act-${row.checkId}`, onClick: () => tierActDialog(ctx, row) }, 'Act') : null) },
        ],
        rows: report.escalations,
      }) : h('p', { class: 'small muted' }, 'No escalated abnormality is raised by, or addressed to, this seat.'),
    }),
    card({
      title: `My standard work (${mine.length})`,
      subtitle: `Recording as ${report.actorName}. A check is first-person: nobody else can record yours.`,
      actions: [h('button', { class: 'btn btn-small', type: 'button', 'data-testid': 'lsw-declare', onClick: () => declareDialog(ctx) }, 'Declare routine')],
      body: mine.length ? table({ caption: 'My routines', columns: routineColumns(true), rows: mine })
        : emptyState({ title: 'No routine declared for this seat', body: 'Declare the repeatable part of the job — the walk, the huddle, the confirmation — and what “done” looks like.' }),
    }),
    card({
      title: `Owed to my tier (${others.length})`,
      subtitle: 'Routines one tier below, on the line they name. A lapsed routine is an abnormality: go and see.',
      body: others.length ? table({ caption: 'Routines owed to this tier', columns: routineColumns(false), rows: others })
        : h('p', { class: 'small muted' }, 'No routine names this seat as its next tier.'),
    }),
    h('p', { class: 'small muted' }, `Slot strip: ${STANDARD_WORK_SLOT_STATES.map((s) => `${s.glyph} ${s.label}`).join(' · ')}.`),
    card({ title: 'What this read refused to print', body: refusalList(report) }),
  );
}

function spansPanel(report) {
  return h('div', { class: 'view-stack' },
    card({
      title: 'Span roll-up',
      subtitle: 'Every leadership span with routines beneath it on any line. A leader reached through two lines is in the span once.',
      body: table({
        caption: 'Span roll-up',
        emptyMessage: 'No span in reach holds a declared routine.',
        columns: [
          { label: 'Span of', render: (row) => (row.isLeader ? `${row.name} (workspace)` : row.name) },
          { label: 'Leaders', render: (row) => row.ownersN },
          { label: 'Routines', render: (row) => row.routinesN },
          { label: 'Via a dotted line only', render: (row) => row.viaLineOnlyN },
          { label: 'Closed slots', render: (row) => `${row.doneN + row.abnormalN}/${row.closedN}` },
          { label: 'Adherence', render: (row) => h('span', { title: rateHint(row) }, rateText(row), row.adherenceWithheld ? null : h('span', { class: 'small muted' }, ` (${row.adherenceLowPct}–${row.adherenceHighPct})`)) },
          { label: 'Lapsed', render: (row) => (row.lapsedN ? badge(String(row.lapsedN), 'bad') : '0') },
          { label: 'Open escalations', render: (row) => row.openEscalationsN },
        ],
        rows: report.spans,
      }),
    }),
    card({
      title: 'Structured time per leader',
      subtitle: `Declared routine minutes as a share of a ${report.conventions.weekMinutes}-minute working week, beside Mann’s reference band for the altitude. A reference, never a target and never a trigger.`,
      body: table({
        caption: 'Structured time',
        emptyMessage: 'No live routine in this view.',
        columns: [
          { label: 'Leader', render: (row) => row.ownerName },
          { label: 'Altitude', render: (row) => dash(row.altitude) },
          { label: 'Routines', render: (row) => row.routinesN },
          { label: 'Minutes / week', render: (row) => row.weekMinutes },
          { label: 'Share of week', render: (row) => `${row.sharePct}%` },
          { label: 'Reference band', render: (row) => (row.bandLowPct === null ? '—' : h('span', { title: row.bandBasis }, `${row.bandLowPct}–${row.bandHighPct}%`)) },
          { label: 'Reading', render: (row) => badge(row.verdictLabel, row.verdictTone) },
        ],
        rows: report.owners,
      }),
    }),
    card({
      title: 'By routine kind',
      body: table({
        caption: 'By routine kind',
        emptyMessage: 'No routine in scope.',
        columns: [
          { label: 'Kind', render: (row) => row.label },
          { label: 'Routines', render: (row) => row.routinesN },
          { label: 'Closed slots', render: (row) => `${row.doneN + row.abnormalN}/${row.closedN}` },
          { label: 'Abnormalities found', render: (row) => row.abnormalN },
          { label: 'Adherence', render: (row) => h('span', { title: rateHint(row) }, rateText(row)) },
        ],
        rows: report.kinds,
      }),
    }),
  );
}

function methodPanel(ctx, report) {
  const c = report.conventions;
  return h('div', { class: 'view-stack' },
    card({
      title: 'How this register reads',
      body: h('div', { class: 'stack' },
        h('figure', { class: 'stack' },
          h('img', {
            src: DIAGRAM_URL,
            alt: 'Diagram: four stacked leadership tiers, each with a board of slot marks; one amber abnormality rises a single tier at a time until a tier contains it, and one leader’s board connects upward by a solid and a dashed line to two different managers.',
            class: 'diagram', loading: 'lazy',
          }),
          h('figcaption', { class: 'muted small' }, 'A conceptual method diagram, not workspace data. Each tier checks the tier beneath it; an abnormality rises one tier at a time; a leader with two lines names which tier a routine is owed to.')),
        h('ul', { class: 'plain-list' },
          h('li', null, h('strong', null, 'Unit:'), ` ${STANDARD_WORK_METHOD.unit}.`),
          h('li', null, h('strong', null, 'Slots:'), ` ${STANDARD_WORK_METHOD.slots}`),
          h('li', null, h('strong', null, 'Adherence:'), ` ${STANDARD_WORK_METHOD.adherence}`),
          h('li', null, h('strong', null, 'Tiers:'), ` ${STANDARD_WORK_METHOD.tiers}`),
          h('li', null, h('strong', null, 'Finding yield:'), ` ${STANDARD_WORK_METHOD.yieldTest}`),
          h('li', null, h('strong', null, 'Not said:'), ` ${STANDARD_WORK_METHOD.notSaid}`))),
    }),
    card({
      title: 'Declared conventions',
      subtitle: `Automation: ${STANDARD_WORK_RULE_ID} on the shared post-commit spine — ${c.autoPropagate ? 'on' : 'PAUSED'}.`,
      body: h('div', { class: 'stack' },
        h('ul', { class: 'plain-list', 'data-testid': 'lsw-conventions' },
          h('li', null, `${STANDARD_WORK_SETTING_LABELS.windowDays}: ${c.windowDays}`),
          h('li', null, `${STANDARD_WORK_SETTING_LABELS.minSlots}: ${c.minSlots}`),
          h('li', null, `${STANDARD_WORK_SETTING_LABELS.lapseRun}: ${c.lapseRun}`),
          h('li', null, `${STANDARD_WORK_SETTING_LABELS.tierDays}: ${c.tierDays}`),
          h('li', null, `${STANDARD_WORK_SETTING_LABELS.weekMinutes}: ${c.weekMinutes}`)),
        h('div', { class: 'row-actions' },
          h('button', { class: 'btn btn-small', type: 'button', onClick: () => conventionsDialog(ctx, c) }, 'Re-declare conventions'),
          h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => {
            const result = ctx.api.standardWorkScan();
            if (notify(result, `Scan complete — ${result.effects?.length || 0} automation effect(s).`)) ctx.refresh();
          } }, 'Re-run the rule')),
        h('p', { class: 'muted small' }, 'Re-declaring conventions and re-running the rule need a rank-3 seat or above; below that the action is refused with its reason.')),
    }),
    card({
      title: 'Frameworks',
      body: h('ul', { class: 'plain-list' }, ...STANDARD_WORK_FRAMEWORKS.map((f) => h('li', null, h('strong', null, `${f.label}:`), ` ${f.says}`))),
    }),
    card({ title: 'What this read refused to print', body: refusalList(report) }),
  );
}

/* ------------------------------------------------------------------- render */

export function renderStandardWork(ctx) {
  const panel = panelFor(ctx.query);
  const result = ctx.api.standardWorkReport();
  const header = (actions = [], badges = []) => pageHeader({
    eyebrow: 'Daily management · ADR-0190',
    title: 'Leader standard work',
    subtitle: 'The repeatable part of a leader’s job, declared and checked slot by slot — and the abnormalities it finds, carried one tier at a time to whoever can contain them.',
    actions: [...badges, ...actions].filter(Boolean),
  });
  if (!result?.ok) {
    return h('div', { class: 'stack standard-work-view' }, header(),
      banner({ tone: 'warn', title: 'The standard-work board was refused', body: result?.error || 'The read was refused.' }));
  }
  const { report } = result;
  const t = report.totals;
  return h('div', { class: 'stack standard-work-view' },
    header([
      h('button', { class: 'btn small', type: 'button', 'data-testid': 'lsw-csv', onClick: () => exportCsv(ctx, report) }, 'Export CSV'),
      h('button', { class: 'btn ghost small', type: 'button', 'data-testid': 'lsw-brief-open', onClick: () => briefDialog(ctx) }, 'Brief'),
    ], [
      t.attentionN ? badge(`${t.attentionN} for you`, 'warn', 'Open escalations addressed to this seat, plus lapsed routines it owns or is the next tier for') : null,
      badge(report.scope === 'workspace' ? 'whole workspace' : `seat of ${report.actorName}`, 'neutral'),
    ]),
    tabs({ items: PANELS.map((p) => ({ key: p.key, label: p.label })), active: panel, ariaLabel: 'Standard work panels',
      onSelect: (key) => ctx.navigate(`#/standard-work?panel=${encodeURIComponent(key)}`) }),
    panel === 'spans' ? spansPanel(report) : panel === 'method' ? methodPanel(ctx, report) : boardPanel(ctx, report),
  );
}
