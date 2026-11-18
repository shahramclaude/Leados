/**
 * app/views/incidents.js — `#/incidents`, the Major-Incident Command &
 * Notification-Clock Register (ADR-0240, Schema v194).
 *
 * ONE reader (`incidentReport`, standing on the `buildIncidents` kernel) behind
 * every state, interval, deadline, overrun and count this page prints. The page
 * formats what the reader returned; it computes no deadline, no overrun and no
 * command state of its own.
 *
 * THE FOUR THINGS THIS SCREEN KEEPS APART
 * ---------------------------------------
 *   1. COMMAND — who holds it, since when, every handover in order, and whether
 *      the incident has been formally released (or is `command-standing`).
 *   2. THE CLOCKS — every declared notification clock with its exact deadline,
 *      its source, and the minutes remaining. A passed deadline is printed as
 *      passed with the duration; it is never converted to met.
 *   3. THE NOTIFICATIONS — each obligation on its OWN clock, with the instant it
 *      went out, the reference it went out under, and the exact overrun where it
 *      went out late. Both facts survive together.
 *   4. THE LINES — the duties of the incident and which of them anyone has
 *      actually accepted. An assigned line is not a led line.
 *
 * THE INTEGRITY CLAIMS ARE PRINTED, NOT IMPLIED. `figuresComplete` (nothing was
 * withheld or unreadable) and `auditClean` (the printed counts re-add to the
 * rows) are two separate banners, because they are two separate facts.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, table, emptyState } from '../ui/components.js';
import {
  MIC_HREF,
  MIC_LIMITS,
  MIC_METHOD,
  MIC_RESPONSE_DUTIES,
  MIC_SEVERITIES,
  MIC_CLOCK_SOURCES,
  MIC_CLOCK_ORIGINS,
  MIC_NOTIFY_PARTIES,
  MIC_SECTION_TITLES,
} from '../core/domain/incidentCommandRegistry.js';

const L = MIC_LIMITS;
const DIAGRAM_URL = './app/assets/incident-command-method.jpg';
const VIEWS = [
  { key: 'live', label: MIC_SECTION_TITLES.live },
  { key: 'clocks', label: MIC_SECTION_TITLES.clocks },
  { key: 'lines', label: MIC_SECTION_TITLES.lines },
  { key: 'history', label: MIC_SECTION_TITLES.history },
  { key: 'method', label: MIC_SECTION_TITLES.method },
];
const STATE_TONE = { 'stood-down': 'good', commanding: 'info', declared: 'warn', 'no-commander': 'bad', 'command-standing': 'bad' };
const NOTIFY_TONE = { recorded: 'good', due: 'info', 'no-clock': 'warn', lapsed: 'bad', 'recorded-late': 'bad' };
const LINE_TONE = { led: 'good', assigned: 'warn', unassigned: 'bad' };

const fmtMinutes = (minutes) => {
  if (minutes === null || minutes === undefined) return '—';
  const sign = minutes < 0 ? '-' : '';
  const abs = Math.abs(minutes);
  if (abs < 60) return `${sign}${abs} min`;
  const hours = Math.floor(abs / 60);
  const rest = abs % 60;
  if (hours < 24) return `${sign}${hours}h ${String(rest).padStart(2, '0')}m`;
  const days = Math.floor(hours / 24);
  return `${sign}${days}d ${hours % 24}h`;
};
const fmtInstant = (iso) => (iso ? String(iso).replace('T', ' ').replace('.000Z', ' UTC') : '—');

function button(label, onClick, { primary = false, testid = null } = {}) {
  return h('button', {
    type: 'button',
    class: `btn btn-small ${primary ? 'btn-primary' : 'btn-ghost'}`,
    ...(testid ? { 'data-testid': testid } : {}),
    onClick,
  }, label);
}

const options = (rows, { blank = null } = {}) => [
  ...(blank ? [{ value: '', label: blank }] : []),
  ...rows.map((row) => ({ value: row.value, label: row.label })),
];

/* ------------------------------------------------------------------ dialogs */

function declareDialog(ctx, report, onDone) {
  const people = (ctx.state?.people || []).filter((row) => row && row.status !== 'archived');
  const form = buildForm([
    { name: 'title', label: 'What is happening', type: 'text', required: true,
      help: `At least ${L.titleMin} characters. Name the consequence, not the code path.` },
    { name: 'severity', label: 'Declared severity', type: 'select', required: true,
      options: MIC_SEVERITIES.map((row) => ({ value: row.key, label: `${row.label} — ${row.criterion}` })),
      help: 'When unsure between two levels, take the higher one. Raising is cheap; declaring late is not.' },
    { name: 'criterion', label: 'The criterion you declared it against', type: 'textarea', required: true,
      help: `At least ${L.textMin} characters. Write the sentence a review will read back to you — “it felt like a P1” is not a criterion.` },
    { name: 'detectedAt', label: 'When was it first detected?', type: 'datetime-local', required: true,
      help: 'The instant the entity first knew. This is EARLIER than the declaration in almost every real incident, and the interval between the two is the first figure a review asks for.' },
    { name: 'declaredAt', label: 'When was it declared?', type: 'datetime-local', required: true,
      help: 'The instant somebody actually said “this is an incident”. Never back-dated to make the interval look better.' },
    { name: 'clockSource', label: 'A notification clock — the instrument', type: 'select',
      options: options(MIC_CLOCK_SOURCES.map((row) => ({ value: row.key, label: row.label })), { blank: 'No external clock on this one' }),
      help: 'A clock is DECLARED and sourced. The register holds no legal library and will never assume 72 hours.' },
    { name: 'clockMinutes', label: 'The period, in whole minutes', type: 'number',
      help: 'e.g. 4320 for 72 hours, 1440 for 24 hours. Read it off the instrument; the register does not know it.' },
    { name: 'clockOrigin', label: 'Measured from', type: 'select', options: MIC_CLOCK_ORIGINS.map((row) => ({ value: row.key, label: row.label })) },
    { name: 'clockBasis', label: 'What the instrument says', type: 'textarea',
      help: `At least ${L.textMin} characters. Which instrument, which period, and why it applies here.` },
    { name: 'party', label: 'Who must be told on that clock', type: 'select',
      options: options(MIC_NOTIFY_PARTIES.map((row) => ({ value: row.key, label: row.label })), { blank: 'No notification on this one' }) },
    { name: 'notifBasis', label: 'The basis of that notification', type: 'textarea',
      help: `At least ${L.textMin} characters. The duty that requires this party to be told.` },
  ]);
  openModal({
    title: 'Declare a major incident',
    description: 'A declaration is the record a review reads first. Both instants are kept, the criterion is printed beside the severity, and every clock you declare is computed from the instant its own instrument names.',
    body: form.node,
    footer: [
      h('button', { type: 'button', class: 'btn btn-ghost', onClick: closeAllModals }, 'Cancel'),
      h('button', {
        type: 'button', class: 'btn btn-primary', 'data-testid': 'mic-declare-submit',
        onClick: () => {
          const values = form.values();
          const clocks = values.clockSource && values.clockMinutes
            ? [{ clockSource: values.clockSource, clockMinutes: Number(values.clockMinutes), clockOrigin: values.clockOrigin || 'awareness', basis: values.clockBasis }]
            : [];
          // The obligation is declared WITH its clock in the same act: the action
          // links an obligation to the first declared clock by position, so no
          // second write and no store access from the view is needed.
          const notifications = values.party && values.notifBasis
            ? [{ party: values.party, basis: values.notifBasis, clockKey: clocks.length ? 'first' : null }]
            : [];
          const result = ctx.api.incidentDeclare({
            title: values.title,
            severity: values.severity,
            criterion: values.criterion,
            detectedAt: values.detectedAt ? new Date(values.detectedAt).toISOString() : undefined,
            declaredAt: values.declaredAt ? new Date(values.declaredAt).toISOString() : undefined,
            lines: [{ duty: 'operations-impact' }],
            clocks,
            notifications,
          });
          if (!result?.ok) { toast(result?.error || 'The register refused the declaration.', 'bad'); return; }
          closeAllModals();
          toast('Declared. Staff the lines, take command, and record each notification against its own clock.', 'good');
          onDone();
        },
      }, 'Declare'),
    ],
  });
}

function assumeCommandDialog(ctx, report, onDone) {
  const open = report.incidents.filter((row) => !row.commanderId && row.state !== 'stood-down');
  if (!open.length) { toast('No live incident is waiting for a commander.', 'info'); return; }
  const form = buildForm([
    { name: 'incidentId', label: 'Which incident', type: 'select', required: true,
      options: open.map((row) => ({ value: row.id, label: `${row.title} · ${row.severityRow?.label || row.severity}` })) },
  ]);
  openModal({
    title: 'Take command',
    description: 'Command is taken by an explicit act, in your name, at this instant. The register never infers a commander from who is talking, and never picks one to fill a column.',
    body: form.node,
    footer: [
      h('button', { type: 'button', class: 'btn btn-ghost', onClick: closeAllModals }, 'Cancel'),
      h('button', {
        type: 'button', class: 'btn btn-primary', 'data-testid': 'mic-assume-submit',
        onClick: () => {
          const result = ctx.api.incidentAssumeCommand({ incidentId: form.values().incidentId });
          if (!result?.ok) { toast(result?.error || 'The register refused the act.', 'bad'); return; }
          closeAllModals(); toast('Command taken. You now own the bridge and every open obligation on it.', 'good'); onDone();
        },
      }, 'Take command'),
    ],
  });
}

function transferDialog(ctx, report, onDone) {
  const commanded = report.incidents.filter((row) => row.commanderId && row.state !== 'stood-down');
  if (!commanded.length) { toast('No incident has a commander to hand over.', 'info'); return; }
  const people = (ctx.state?.people || []).filter((row) => row && row.status !== 'archived');
  const form = buildForm([
    { name: 'incidentId', label: 'Which incident', type: 'select', required: true,
      options: commanded.map((row) => ({ value: row.id, label: `${row.title} · commanded by ${row.commanderName}` })) },
    { name: 'toId', label: 'Hand command to', type: 'select', required: true,
      options: options(people.map((row) => ({ value: row.id, label: row.name || row.id })), { blank: 'Choose a successor' }),
      help: 'The successor must reach every response line on the reporting graph — a commander who cannot reach a line is a commander in name only.' },
    { name: 'reason', label: 'Why is command moving?', type: 'textarea', required: true,
      help: `At least ${L.textMin} characters. The shift change, the relief, the escalation — this is the sentence the review reads.` },
  ]);
  openModal({
    title: 'Hand over command',
    description: 'A handover is a dated act naming the successor and the reason. Nobody changes a commander by overwriting a field.',
    body: form.node,
    footer: [
      h('button', { type: 'button', class: 'btn btn-ghost', onClick: closeAllModals }, 'Cancel'),
      h('button', {
        type: 'button', class: 'btn btn-primary', 'data-testid': 'mic-transfer-submit',
        onClick: () => {
          const v = form.values();
          const result = ctx.api.incidentTransferCommand({ incidentId: v.incidentId, toId: v.toId, reason: v.reason });
          if (!result?.ok) { toast(result?.error || 'The register refused the handover.', 'bad'); return; }
          closeAllModals(); toast('Command handed over. The successor holds the bridge from this instant.', 'good'); onDone();
        },
      }, 'Hand over'),
    ],
  });
}

function notifyDialog(ctx, report, onDone) {
  const rows = [];
  for (const incident of report.incidents) {
    if (incident.state === 'stood-down') continue;
    for (const notif of incident.notifications) {
      if (notif.recordedAt) continue;
      rows.push({ incident, notif });
    }
  }
  if (!rows.length) { toast('Every notification obligation on the record is either recorded or none is open.', 'info'); return; }
  const form = buildForm([
    { name: 'key', label: 'Which obligation was met', type: 'select', required: true,
      options: rows.map(({ incident, notif }) => ({
        value: `${incident.id}::${notif.notifId}`,
        label: `${incident.title} → ${notif.partyLabel}${notif.deadlineAt ? ` (deadline ${fmtInstant(notif.deadlineAt)})` : ' (no clock)'}`,
      })) },
    { name: 'notifiedAt', label: 'When did it go out?', type: 'datetime-local', required: true,
      help: 'The real instant. A notification recorded after its deadline keeps both facts: it went out, and it went out late.' },
    { name: 'reference', label: 'The reference it went out under', type: 'text', required: true,
      help: `At least ${L.refMin} characters — a case number, a submission receipt, a message id. “We told them” with nothing behind it is not a record.` },
  ]);
  openModal({
    title: 'Record a notification',
    description: 'The register records that a human says the party was told, under a reference. It does not send anything, and it does not erase a deadline that had already passed.',
    body: form.node,
    footer: [
      h('button', { type: 'button', class: 'btn btn-ghost', onClick: closeAllModals }, 'Cancel'),
      h('button', {
        type: 'button', class: 'btn btn-primary', 'data-testid': 'mic-notify-submit',
        onClick: () => {
          const v = form.values();
          const [incidentId, notifId] = String(v.key || '').split('::');
          const result = ctx.api.incidentRecordNotification({
            incidentId, notifId, reference: v.reference,
            notifiedAt: v.notifiedAt ? new Date(v.notifiedAt).toISOString() : undefined,
          });
          if (!result?.ok) { toast(result?.error || 'The register refused the record.', 'bad'); return; }
          closeAllModals();
          toast(result.state === 'recorded-late'
            ? `Recorded — and it went out ${fmtMinutes(result.overrunMinutes)} after the declared deadline. Both facts are kept.`
            : 'Recorded inside the declared deadline.', result.state === 'recorded-late' ? 'bad' : 'good');
          onDone();
        },
      }, 'Record'),
    ],
  });
}

function resolveDialog(ctx, report, onDone) {
  const open = report.incidents.filter((row) => !row.resolvedAt && row.state !== 'stood-down');
  if (!open.length) { toast('No live incident is open to close.', 'info'); return; }
  const form = buildForm([
    { name: 'incidentId', label: 'Which incident is closed', type: 'select', required: true,
      options: open.map((row) => ({ value: row.id, label: row.title })) },
    { name: 'resolvedAt', label: 'When did the consequence stop?', type: 'datetime-local', required: true },
    { name: 'evidenceText', label: 'The evidence it stopped', type: 'textarea', required: true,
      help: `At least ${L.textMin} characters — what you checked, not what you believe. This is the one act a review will read.` },
  ]);
  openModal({
    title: 'Close the operational incident',
    description: 'This closes the consequence, NOT the command. The bridge stays open, and the commander stays held, until a separate stand-down act releases it — that separation is the point.',
    body: form.node,
    footer: [
      h('button', { type: 'button', class: 'btn btn-ghost', onClick: closeAllModals }, 'Cancel'),
      h('button', {
        type: 'button', class: 'btn btn-primary', 'data-testid': 'mic-resolve-submit',
        onClick: () => {
          const v = form.values();
          const result = ctx.api.incidentResolve({
            incidentId: v.incidentId, evidenceText: v.evidenceText,
            resolvedAt: v.resolvedAt ? new Date(v.resolvedAt).toISOString() : undefined,
          });
          if (!result?.ok) { toast(result?.error || 'The register refused the closure.', 'bad'); return; }
          closeAllModals();
          toast('Closed. Command is still standing — stand it down when the bridge is released.', 'info');
          onDone();
        },
      }, 'Close incident'),
    ],
  });
}

function standDownDialog(ctx, report, onDone) {
  const open = report.incidents.filter((row) => row.state === 'command-standing' || (row.resolvedAt && !row.stoodDownAt));
  if (!open.length) { toast('No closed incident is holding command open.', 'info'); return; }
  const form = buildForm([
    { name: 'incidentId', label: 'Which command is released', type: 'select', required: true,
      options: open.map((row) => ({ value: row.id, label: `${row.title} · commander ${row.commanderName || 'unnamed'}` })) },
    { name: 'stoodDownAt', label: 'When was command released?', type: 'datetime-local', required: true },
    { name: 'reason', label: 'The reason command is released', type: 'textarea', required: true,
      help: `At least ${L.textMin} characters — all lines released, the review handed over, the record frozen.` },
  ]);
  openModal({
    title: 'Stand command down',
    description: 'Only the hand that holds command may release it. The clock facts and every notification row remain printed afterwards — standing down closes the bridge, not the record.',
    body: form.node,
    footer: [
      h('button', { type: 'button', class: 'btn btn-ghost', onClick: closeAllModals }, 'Cancel'),
      h('button', {
        type: 'button', class: 'btn btn-primary', 'data-testid': 'mic-standdown-submit',
        onClick: () => {
          const v = form.values();
          const result = ctx.api.incidentStandDown({
            incidentId: v.incidentId, reason: v.reason,
            stoodDownAt: v.stoodDownAt ? new Date(v.stoodDownAt).toISOString() : undefined,
          });
          if (!result?.ok) { toast(result?.error || 'The register refused the stand-down.', 'bad'); return; }
          closeAllModals(); toast('Command released. The record remains.', 'good'); onDone();
        },
      }, 'Stand down'),
    ],
  });
}

function severityDialog(ctx, report, onDone) {
  const open = report.incidents.filter((row) => row.state !== 'stood-down');
  if (!open.length) { toast('No live incident to change.', 'info'); return; }
  const form = buildForm([
    { name: 'incidentId', label: 'Which incident', type: 'select', required: true,
      options: open.map((row) => ({ value: row.id, label: `${row.title} · now ${row.severityRow?.label || row.severity}` })) },
    { name: 'severity', label: 'The new declared severity', type: 'select', required: true,
      options: MIC_SEVERITIES.map((row) => ({ value: row.key, label: row.label })),
      help: 'Raising is open to anyone holding a line; lowering is the commanding seat alone.' },
    { name: 'reason', label: 'Why the severity changed', type: 'textarea', required: true, help: `At least ${L.textMin} characters.` },
  ]);
  openModal({
    title: 'Change the declared severity',
    description: 'A severity change is a dated act with a written reason, never a silent field edit. The peak severity ever declared stays printed.',
    body: form.node,
    footer: [
      h('button', { type: 'button', class: 'btn btn-ghost', onClick: closeAllModals }, 'Cancel'),
      h('button', {
        type: 'button', class: 'btn btn-primary',
        onClick: () => {
          const v = form.values();
          const result = ctx.api.incidentChangeSeverity({ incidentId: v.incidentId, severity: v.severity, reason: v.reason });
          if (!result?.ok) { toast(result?.error || 'The register refused the change.', 'bad'); return; }
          closeAllModals(); toast('Severity changed, with its reason on the record.', 'good'); onDone();
        },
      }, 'Change severity'),
    ],
  });
}

/* ------------------------------------------------------------------ sections */

function summaryCard(report) {
  const t = report.totals;
  return card({
    title: 'The register at this instant',
    subtitle: 'Counts printed exactly as the reader computed them. No incident scores a person, a team or a line.',
    body: h('div', { class: 'stat-row' },
      stat({ label: 'Incidents on this record', value: String(t.incidents), hint: `${t.major} declared major` }),
      stat({ label: 'Live', value: String(t.live), hint: `${t.commanding} commanded · ${t.noCommander} uncommanded`, tone: t.noCommander ? 'bad' : '' }),
      stat({ label: 'Resolved, still commanded', value: String(t.commandStanding), hint: 'Command was never released', tone: t.commandStanding ? 'bad' : '' }),
      stat({ label: 'Notifications lapsed', value: String(t.notificationsLapsed), hint: `of ${t.notificationsRequired} required`, tone: t.notificationsLapsed ? 'bad' : '' }),
      stat({ label: 'Notifications late', value: String(t.notificationsLate), hint: 'Recorded after their deadline' }),
      stat({ label: 'Detection → declaration', value: report.interval ? fmtMinutes(report.interval.value) : 'withheld', hint: report.interval ? `${report.interval.kind}, n=${report.interval.n}` : report.intervalReason }),
    ),
  });
}

function integrityBanners(report) {
  const out = [];
  if (report.matrixError) out.push(banner({ tone: 'bad', title: 'The reporting graph could not be read', body: `No accountable seat was computed for any incident: ${report.matrixError}` }));
  if (report.hidden) out.push(banner({ tone: 'caution', title: `${report.hidden} incident(s) are outside this seat’s reach`, body: 'The whole-register figures are withheld rather than printed over a partial record. Declare the seat that holds the lines, or read the register from a seat that does.' }));
  for (const warning of report.warnings) out.push(banner({ tone: 'caution', title: 'A stored row was refused', body: warning }));
  if (!report.auditClean && !report.warnings.length && !report.hidden && !report.matrixError) {
    out.push(banner({ tone: 'bad', title: 'The printed counts do not re-add', body: 'The state, severity or notification counts failed to reconcile with the rows they summarise. Every figure on this screen is suspect until the record is repaired.' }));
  }
  if (report.figuresComplete) {
    out.push(banner({ tone: 'good', title: 'Every printed figure was computed from a readable row', body: 'Nothing was withheld, nothing was refused, and the counts re-add to the rows they summarise. These are two separate claims and both hold here.' }));
  }
  return out;
}

function liveTable(report, ctx, onDone) {
  if (!report.incidents.length) {
    return emptyState({
      title: 'No incident on the record',
      body: 'Nothing has been declared in this workspace yet. A declaration is not a formality: it freezes the detection instant, the declared criterion and every clock the entity owes — before anybody knows how the day ends.',
      action: button('Declare an incident', () => declareDialog(ctx, report, onDone), { primary: true }),
    });
  }
  return table({
    caption: 'Incidents and their command state',
    columns: [
      { key: 'title', label: 'Incident', render: (row) => h('div', null,
        h('strong', null, row.title),
        h('div', { class: 'small muted' }, `${row.severityRow?.label || row.severity}${row.peakSeverity !== row.severity ? ` · peak ${row.peakSeverityRow?.label}` : ''}`),
        h('div', { class: 'small muted' }, row.criterion)) },
      { key: 'state', label: 'State', render: (row) => h('div', null, badge(row.stateLabel, STATE_TONE[row.state] || 'neutral'), row.stateSays ? h('div', { class: 'small muted' }, row.stateSays) : null) },
      { key: 'commander', label: 'Command', render: (row) => h('div', null,
        row.commanderName ? h('span', null, row.commanderName) : h('span', { class: 'text-warn' }, 'nobody'),
        row.commandedSince ? h('div', { class: 'small muted' }, `since ${fmtInstant(row.commandedSince)}`) : null,
        row.stoodDownAt ? h('div', { class: 'small muted' }, `released ${fmtInstant(row.stoodDownAt)} by ${row.stoodDownByName}`) : null) },
      { key: 'intervals', label: 'Intervals', render: (row) => h('div', null,
        h('div', { class: 'small' }, `detect → declare: ${fmtMinutes(row.detectToDeclareMinutes)}`),
        row.resolvedMinutes !== null ? h('div', { class: 'small' }, `declare → close: ${fmtMinutes(row.resolvedMinutes)}`) : null,
        row.commandedMinutes !== null ? h('div', { class: 'small' }, `declare → release: ${fmtMinutes(row.commandedMinutes)}`) : null) },
      { key: 'obligations', label: 'Obligations', render: (row) => h('div', null,
        h('div', { class: 'small' }, `${row.counts.lines} line(s) · ${row.linesUnled} not yet accepted`),
        h('div', { class: 'small' }, `${row.counts.notificationsRecorded}/${row.counts.notificationsRequired} notified`),
        row.counts.notificationsLapsed ? h('div', { class: 'small text-warn' }, `${row.counts.notificationsLapsed} lapsed`) : null,
        row.counts.notificationsLate ? h('div', { class: 'small text-warn' }, `${row.counts.notificationsLate} late`) : null,
        row.counts.notificationsNoClock ? h('div', { class: 'small text-warn' }, `${row.counts.notificationsNoClock} without a clock`) : null) },
      { key: 'apex', label: 'Accountable seat', render: (row) => (row.apex
        ? h('div', null, row.apex.ambiguous
          ? h('span', null, `${row.apex.ids.length} joint seats — the register names none`)
          // `leader-held` is printed as a finding, not as a person: the only seat
          // above these lines is the workspace itself, and the register says so
          // rather than presenting the operator as somebody's manager.
          : (row.apex.isLeaderOnly
            ? h('div', null,
              h('span', null, 'leader-held'),
              h('div', { class: 'small muted' }, 'The only seat above every response line is the workspace leader.'))
            : h('span', null, row.apex.name || row.apex.id)))
        : h('div', { class: 'small text-warn' }, 'no-authority', row.apexReason ? h('div', { class: 'small muted' }, row.apexReason) : null)) },
    ],
    rows: report.incidents.map((row) => ({
      ...row,
      className: row.state === 'stood-down' ? 'row-muted' : '',
      attrs: { 'data-testid': `mic-incident-${row.id}` },
    })),
  });
}

function clocksSection(report) {
  const rows = [];
  for (const incident of report.incidents) {
    for (const clock of incident.clocks) rows.push({ incident, clock });
  }
  if (!rows.length) {
    return emptyState({ title: 'No clock has been declared', body: 'A notification deadline exists only where someone declares the instrument and the period it carries. The register holds no legal library and will never assume 72 hours: an undeclared clock is printed as missing, not filled in.' });
  }
  return card({
    title: 'Declared notification clocks',
    subtitle: 'Each deadline is the exact instant its own instrument produces — from awareness or from declaration, whichever the declaration names. A passed deadline is printed as passed, with the duration, and is never converted to met.',
    body: table({
      caption: 'Declared notification clocks and their deadlines',
      columns: [
        { key: 'incident', label: 'Incident', render: (row) => h('div', null, h('strong', null, row.incident.title), h('div', { class: 'small muted' }, row.incident.severityRow?.label || row.incident.severity)) },
        { key: 'source', label: 'Instrument', render: (row) => h('div', null, row.clock.sourceLabel, row.clock.external ? badge('external', 'bad') : badge('internal', 'neutral')) },
        { key: 'period', label: 'Declared period', render: (row) => h('div', null, fmtMinutes(row.clock.clockMinutes), h('div', { class: 'small muted' }, `from ${row.clock.clockOrigin} (${fmtInstant(row.clock.originAt)})`)) },
        { key: 'deadline', label: 'Deadline', render: (row) => h('div', null,
          h('span', { 'data-testid': `mic-deadline-${row.clock.key}` }, fmtInstant(row.clock.deadlineAt)),
          row.clock.passed ? badge('passed', 'bad') : badge(`${fmtMinutes(row.clock.remainingMinutes)} left`, 'good')) },
        { key: 'basis', label: 'What the instrument says', render: (row) => h('div', { class: 'small' }, row.clock.basis) },
        { key: 'obligations', label: 'Obligations on this clock', render: (row) => {
          const on = row.incident.notifications.filter((notif) => notif.clockKey === row.clock.key);
          if (!on.length) return h('span', { class: 'small muted' }, 'none');
          return h('div', null, ...on.map((notif) => h('div', { class: 'small' }, `${notif.partyLabel} — ${notif.stateLabel}`)));
        } },
      ],
      rows,
    }),
  });
}

function notificationsSection(report, ctx, onDone) {
  const rows = [];
  for (const incident of report.incidents) {
    for (const notif of incident.notifications) rows.push({ incident, notif });
  }
  if (!rows.length) {
    return emptyState({ title: 'No notification obligation declared', body: 'An obligation names who had to be told and on which of the incident’s own clocks. Until one is declared, no deadline exists and none is invented.' });
  }
  return card({
    title: 'Notification obligations, each on its own clock',
    subtitle: 'A notification that went out after its deadline keeps both facts: the instant it went out and the exact minutes it overran. An obligation with no clock reads no-clock and is never given a deadline.',
    actions: [button('Record a notification', () => notifyDialog(ctx, report, onDone), { primary: true, testid: 'mic-record-notification' })],
    body: table({
      caption: 'Notification obligations with deadlines and outcomes',
      columns: [
        { key: 'incident', label: 'Incident', render: (row) => h('div', null, h('strong', null, row.incident.title)) },
        { key: 'party', label: 'Who had to be told', render: (row) => h('div', null, row.notif.partyLabel, row.notif.external ? badge('external', 'bad') : badge('internal', 'neutral')) },
        { key: 'state', label: 'State', render: (row) => h('div', null,
          badge(row.notif.stateLabel, NOTIFY_TONE[row.notif.state] || 'neutral'),
          row.notif.closing ? badge('closing', 'warn') : null,
          row.notif.refusal ? h('div', { class: 'small muted' }, row.notif.refusal) : null) },
        { key: 'deadline', label: 'Deadline', render: (row) => h('div', null,
          row.notif.deadlineAt ? fmtInstant(row.notif.deadlineAt) : h('span', { class: 'text-warn' }, 'no clock'),
          row.notif.minutesToDeadline !== null ? h('div', { class: 'small muted' }, row.notif.minutesToDeadline >= 0 ? `${fmtMinutes(row.notif.minutesToDeadline)} left` : `${fmtMinutes(Math.abs(row.notif.minutesToDeadline))} past`) : null) },
        { key: 'recorded', label: 'Recorded', render: (row) => (row.notif.recordedAt
          ? h('div', null, fmtInstant(row.notif.recordedAt), h('div', { class: 'small muted' }, row.notif.reference))
          : h('span', { class: 'small muted' }, '—')) },
        { key: 'overrun', label: 'Overrun', render: (row) => (row.notif.overrunMinutes === null
          ? h('span', { class: 'small muted' }, '—')
          : (row.notif.late
            ? h('span', { class: 'text-warn', 'data-testid': `mic-overrun-${row.notif.notifId}` }, fmtMinutes(row.notif.overrunMinutes))
            : h('span', null, `inside by ${fmtMinutes(Math.abs(row.notif.overrunMinutes))}`))) },
        { key: 'basis', label: 'Basis', render: (row) => h('div', { class: 'small' }, row.notif.basis) },
      ],
      rows,
    }),
  });
}

function linesSection(report) {
  const rows = [];
  for (const incident of report.incidents) {
    for (const line of incident.lines) rows.push({ incident, line });
  }
  if (!rows.length) return emptyState({ title: 'No response line', body: 'An incident carries the duties somebody has to hold on the bridge.' });
  return card({
    title: 'Response lines — the duties on the bridge, and whether anyone accepted them',
    subtitle: 'An assigned line is not a led line. A duty is owned when the named lead accepts it in their own name, and the register prints the difference.',
    body: table({
      caption: 'Response lines and their acceptance state',
      columns: [
        { key: 'incident', label: 'Incident', render: (row) => h('div', null, h('strong', null, row.incident.title)) },
        { key: 'duty', label: 'Duty', render: (row) => {
          const meta = MIC_RESPONSE_DUTIES.find((item) => item.key === row.line.duty);
          return h('div', null, h('span', null, meta?.label || row.line.duty), h('div', { class: 'small muted' }, row.line.dutyText));
        } },
        { key: 'lead', label: 'Lead', render: (row) => (row.line.leadName
          ? h('div', null, row.line.leadName, row.line.leadArchived ? badge('archived', 'bad') : null)
          : h('span', { class: 'text-warn' }, 'nobody')) },
        { key: 'state', label: 'State', render: (row) => h('div', null,
          badge(row.line.stateLabel, LINE_TONE[row.line.state] || 'neutral'),
          row.line.acceptedAt ? h('div', { class: 'small muted' }, `accepted ${fmtInstant(row.line.acceptedAt)}`) : null,
          row.line.refusal ? h('div', { class: 'small muted' }, row.line.refusal) : null) },
      ],
      rows,
    }),
  });
}

function historySection(report) {
  const byDuty = report.byLine;
  const byParty = report.byParty;
  return card({
    title: 'The record, by state, severity, duty and party',
    subtitle: 'Every count here is an exact integer over the rows on the screen, and the register re-adds them: the states and severities sum to the incident count, and the notification states sum to the obligations printed.',
    body: h('div', { class: 'stack' },
      table({
        caption: 'Incident states',
        columns: [
          { key: 'state', label: 'Command state', render: (row) => row.label },
          { key: 'count', label: 'Incidents', render: (row) => h('span', { 'data-testid': `mic-state-${row.key}` }, String(row.count)) },
        ],
        rows: [
          { key: 'commanding', label: 'Commanding', count: report.states.commanding || 0 },
          { key: 'no-commander', label: 'No commander', count: report.states['no-commander'] || 0 },
          { key: 'declared', label: 'Declared', count: report.states.declared || 0 },
          { key: 'command-standing', label: 'Resolved, still commanded', count: report.states['command-standing'] || 0 },
          { key: 'stood-down', label: 'Stood down', count: report.states['stood-down'] || 0 },
        ],
      }),
      table({
        caption: 'Notification outcomes',
        columns: [
          { key: 'state', label: 'Notification state', render: (row) => row.label },
          { key: 'count', label: 'Obligations', render: (row) => h('span', { 'data-testid': `mic-notifstate-${row.key}` }, String(row.count)) },
        ],
        rows: [
          { key: 'recorded', label: 'Recorded inside the deadline', count: report.notifStates.recorded || 0 },
          { key: 'recorded-late', label: 'Recorded after the deadline', count: report.notifStates['recorded-late'] || 0 },
          { key: 'due', label: 'Due', count: report.notifStates.due || 0 },
          { key: 'lapsed', label: 'Lapsed — nothing recorded', count: report.notifStates.lapsed || 0 },
          { key: 'no-clock', label: 'No clock declared', count: report.notifStates['no-clock'] || 0 },
        ],
      }),
      byParty.length ? table({
        caption: 'Obligations by party',
        columns: [
          { key: 'party', label: 'Party', render: (row) => h('span', null, row.partyLabel, row.external ? badge('external', 'bad') : null) },
          { key: 'required', label: 'Required', render: (row) => String(row.required) },
          { key: 'recorded', label: 'Recorded', render: (row) => String(row.recorded) },
          { key: 'late', label: 'Late', render: (row) => String(row.late) },
          { key: 'lapsed', label: 'Lapsed', render: (row) => String(row.lapsed) },
          { key: 'noClock', label: 'No clock', render: (row) => String(row.noClock) },
        ],
        rows: byParty,
      }) : null,
      byDuty.length ? table({
        caption: 'Response lines by duty',
        columns: [
          { key: 'duty', label: 'Duty', render: (row) => MIC_RESPONSE_DUTIES.find((item) => item.key === row.duty)?.label || row.duty },
          { key: 'lines', label: 'Lines', render: (row) => String(row.lines) },
          { key: 'led', label: 'Accepted', render: (row) => String(row.led || 0) },
          { key: 'assigned', label: 'Assigned', render: (row) => String(row.assigned || 0) },
          { key: 'unassigned', label: 'Unled', render: (row) => String(row.unassigned || 0) },
        ],
        rows: byDuty,
      }) : null,
      h('p', { class: 'small muted', 'data-testid': 'mic-reconcile' },
        report.balances.statesReconcile && report.balances.severitiesReconcile && report.balances.notificationsReconcile
          ? `The printed counts re-add: ${report.balances.statesSum} state rows, ${report.balances.severitiesSum} severity rows, ${report.balances.notificationsSum} notification rows.`
          : `The printed counts DO NOT re-add: ${report.balances.statesSum} state rows, ${report.balances.severitiesSum} severity rows, ${report.balances.notificationsSum} notification rows.`),
    ),
  });
}

function methodSection() {
  return card({
    title: 'Method — what this register holds and what it refuses',
    body: h('div', { class: 'stack' },
      h('figure', { class: 'method-figure' },
        h('img', { src: DIAGRAM_URL, alt: 'The incident command method: declare with a written criterion, staff the response lines, take command, watch each declared clock separately, record every notification against its own deadline, close the incident and then release command as a separate act.', loading: 'lazy' }),
        h('figcaption', { class: 'small muted' }, 'Declare → staff the lines → take command → each clock runs on its own instrument → record every notification against its own deadline → close the incident → release command, as a separate dated act.')),
      card({ title: 'The frameworks this encodes', body: h('ul', null, ...MIC_METHOD.frameworks.map((row) => h('li', { class: 'small' }, row))) }),
      card({ title: 'What is printed, and how', body: h('ul', null, ...MIC_METHOD.printed.map((row) => h('li', { class: 'small' }, row))) }),
      card({ title: 'What it deliberately does not do', body: h('ul', null, ...MIC_METHOD.deliberatelyAbsent.map((row) => h('li', { class: 'small text-warn' }, row))) }),
      h('div', { class: 'small muted' },
        h('p', null, `${MIC_METHOD.engine} · ${MIC_METHOD.adr} · route ${MIC_HREF} · limits: ${L.incidents} incidents, ${L.acts} acts, ${L.linesMax} response lines each, ${L.notifMax} notification obligations each, clock ${L.clockMinMinutes}–${L.clockMaxMinutes} minutes.`),
        h('p', null, 'Seats are workflow declarations, not authentication: this is a local-first workspace and the register says so rather than implying an access boundary it cannot enforce.')),
    ),
  });
}

/* ------------------------------------------------------------------ render */

export function renderIncidents(ctx) {
  const read = ctx.api.incidentReport ? ctx.api.incidentReport() : null;
  const report = read?.ok === false ? null : read?.report || read;
  if (!report || !report.totals) {
    return h('div', { class: 'page' },
      pageHeader({ eyebrow: 'Every altitude · matrix and single-chain', title: 'Major incidents' }),
      banner({ tone: 'bad', title: 'The register could not be read', body: read?.error || 'The seat refused the read.' }));
  }
  const requested = ctx.query?.get?.('view');
  const view = VIEWS.some((row) => row.key === requested) ? requested : 'live';
  const onDone = () => ctx.refresh?.();

  const actions = [
    button('Declare', () => declareDialog(ctx, report, onDone), { primary: true, testid: 'mic-declare' }),
    button('Take command', () => assumeCommandDialog(ctx, report, onDone)),
    button('Hand over', () => transferDialog(ctx, report, onDone)),
    button('Record notification', () => notifyDialog(ctx, report, onDone)),
    button('Close incident', () => resolveDialog(ctx, report, onDone)),
    button('Stand down', () => standDownDialog(ctx, report, onDone)),
    button('Severity', () => severityDialog(ctx, report, onDone)),
    (!ctx.seatContext?.seat || ctx.seatContext.seat.rank >= 3)
      ? h('a', { class: 'btn btn-small btn-ghost', href: '#/service-error-budget' }, 'Review service error budget') : null,
  ];

  return h('div', { class: 'page', 'data-testid': 'incident-command-panel' },
    pageHeader({
      eyebrow: 'Every altitude primary at the bridge · matrix and single-chain',
      title: 'Who was in command, and whether the clock that started is still running',
      subtitle: 'An incident is the one event where every external consequence is created in the interval before anybody writes it up. This register holds the command record while it runs: who declared it and on what written criterion, who took command and when they handed it over, every notification clock the entity owes and its exact deadline, whether each party was in fact told — and whether command was ever formally released. Nothing here guesses a legal deadline, converts a passed one into a met one, or rates a responder.',
      actions,
    }),
    ctx.persistError ? banner({ tone: 'bad', title: 'Changes are not being saved', body: String(ctx.persistError) }) : null,
    summaryCard(report),
    ...integrityBanners(report),
    tabs({
      items: VIEWS.map((row) => ({
        key: row.key,
        label: row.label,
        count: row.key === 'live' ? report.incidents.length
          : row.key === 'clocks' ? report.totals.notificationsRequired
            : row.key === 'lines' ? report.totals.lines
              : undefined,
      })),
      active: view,
      onSelect: (key) => ctx.navigate?.(`${MIC_HREF}?view=${key}`),
      ariaLabel: 'Incident command sections',
    }),
    view === 'live' ? h('div', { class: 'stack' }, liveTable(report, ctx, onDone)) : null,
    view === 'clocks' ? h('div', { class: 'stack' }, clocksSection(report), notificationsSection(report, ctx, onDone)) : null,
    view === 'lines' ? h('div', { class: 'stack' }, linesSection(report)) : null,
    view === 'history' ? h('div', { class: 'stack' }, historySection(report)) : null,
    view === 'method' ? h('div', { class: 'stack' }, methodSection()) : null,
  );
}

export default renderIncidents;
