/**
 * app/views/distributedEquity.js — `#/distributed-equity`, the Distributed-Work
 * Equity Register (ADR-0238, Schema v193).
 *
 * ONE reader (`buildDistributedEquity`) stands behind every burden figure,
 * share, verdict, refusal and coverage gap this page prints. The page formats
 * what the reader returned; it computes no outside-minute, no share and no
 * verdict of its own.
 *
 * THE THREE THINGS THIS SCREEN KEEPS APART:
 *   1. the minutes a person HELD (attendance — a fact of the sitting record);
 *   2. the minutes that fell OUTSIDE their declared working window (a second
 *      fact, placed exactly in the person's own day, or refused with its
 *      reason — never a zero);
 *   3. whether the WHOLE population was placed (a separate, printed claim,
 *      because a concentrated verdict over half the attendees is not
 *      reassurance).
 *
 * DISCLOSURE LADDER. The reader narrows this page: below the executive
 * altitude it shows per-person rows with names; at VP/CEO altitude it shows
 * the same aggregates with names withheld — counts at the top, and the page
 * says so instead of implying a permission system the workspace cannot enforce.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import {
  DWE_HREF,
  DWE_LIMITS,
  DWE_METHOD,
  DWE_SECTION_TITLES,
} from '../core/domain/distributedEquityRegistry.js';
import { knownZones } from '../core/domain/workRestTime.js';
import { formatDweMinutes } from '../core/domain/distributedEquityTime.js';

const L = DWE_LIMITS;
const DIAGRAM_URL = './app/assets/distributed-equity-method.jpg';
const VIEWS = [
  { key: 'register', label: DWE_SECTION_TITLES.register },
  { key: 'burden', label: DWE_SECTION_TITLES.burden },
  { key: 'lines', label: DWE_SECTION_TITLES.lines },
  { key: 'method', label: DWE_SECTION_TITLES.method },
];
const VERDICT_TONE = { concentrated: 'bad', distributed: 'good' };
const VERDICT_SHORT = { concentrated: 'Concentrated', distributed: 'Shared' };
const bp = (value) => `${(value / 100).toFixed(1)}%`;

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

function figureOrWithheld(row, testid) {
  if (row.outsideMinutes === null || row.outsideMinutes === undefined) {
    return h('span', { class: 'small text-warn', 'data-testid': testid }, 'withheld', row.unreadableReason ? h('span', { class: 'small muted' }, ` — ${row.unreadableReason}`) : null);
  }
  return h('span', { 'data-testid': testid, 'data-minutes': String(row.outsideMinutes) }, formatDweMinutes(row.outsideMinutes));
}

/* ------------------------------------------------------------------ dialogs */

function declareWindowDialog(ctx, report, onDone) {
  const form = buildForm([
    {
      name: 'personId', label: 'Whose working window?', type: 'select', required: true,
      options: options(report.windowRows.map((row) => ({ value: row.personId, label: row.personName || row.personId })), { blank: 'Choose a person' }),
      help: 'A window is declared by a seat that holds the person — through the span, a declared line, or the person themselves.',
    },
    {
      name: 'zone', label: 'Time zone the window is lived in', type: 'select', required: true,
      options: options(knownZones().map((zone) => ({ value: zone, label: zone })), { blank: 'Choose an IANA zone' }),
      help: 'The register never assumes a zone — not even this device’s. An unknown zone is refused, never read as UTC.',
    },
    { name: 'start', label: 'Window starts (local wall clock)', type: 'time', required: true, help: 'HH:MM in the person’s own zone. `09:60` is not a quarter past ten; it is nothing.' },
    { name: 'end', label: 'Window ends (local wall clock)', type: 'time', required: true, help: 'An end at or before the start reads as an overnight window and ends on the next day.' },
    { name: 'declaredOn', label: 'Declared on', type: 'date', value: report.asOf, required: true, help: 'Cannot be after today. Declaring supersedes any active window — one live window per person, the older rows kept as history.' },
    { name: 'source', label: 'Where does this window come from?', type: 'textarea', required: true, help: `At least ${L.textMin} characters. A window is a claim about a human being’s daily life; an unsourced one is refused.` },
    { name: 'note', label: 'Note (optional)', type: 'textarea', help: 'Context a successor will need — shift pattern, agreed exception, review date.' },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.distributedEquityDeclareWindow(form.getValues());
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The window was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Working window declared. The person’s unsociable minutes can now be placed in their own day.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Declare a working window',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'A window is a sourced declaration, never an inference', body: 'The register never derives a window from observed behaviour. You declare the zone and the daily span, and where it comes from.' }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Declare', onClick: submit }],
  });
}

function withdrawWindowDialog(ctx, row, onDone) {
  const form = buildForm([
    { name: 'on', label: 'Withdrawn on', type: 'date', value: '', required: true, help: 'Cannot be before the declaration, nor after today.' },
    { name: 'reason', label: 'Why is it being withdrawn?', type: 'textarea', required: true, help: `At least ${L.textMin} characters. The person becomes unreadable — printed as unknown, never as zero.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.distributedEquityWithdrawWindow({ windowId: row.window.id, ...form.getValues() });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The withdrawal was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Window withdrawn. The person’s burden reads as unknown until a new window is declared.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Withdraw this working window',
    body: h('div', { class: 'stack' },
      banner({ tone: 'caution', title: 'A withdrawal is final', body: 'After this the person carries no declared window: their unsociable minutes are unknown. The register prints that as a coverage gap, not as a clean slate.' }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Withdraw', onClick: submit }],
  });
}

function declareSittingDialog(ctx, report, onDone) {
  const rosterRows = report.windowRows
    .map((row) => ({ value: row.personId, label: row.personName || row.personId }));
  const form = buildForm([
    { name: 'day', label: 'Day the sitting took place', type: 'date', value: report.asOf, required: true, help: 'Cannot be after today. The register records sittings that happened, not invitations.' },
    { name: 'start', label: 'Start (wall clock where it was convened)', type: 'time', required: true, help: 'Resolved in the sitting’s own zone. A start the clocks skipped is refused with the offsets either side; one that occurs twice must say which occurrence is meant.' },
    { name: 'minutes', label: 'Duration (whole minutes)', type: 'number', min: 1, max: L.minutesMax, required: true, help: `1 to ${L.minutesMax}. A sitting with no duration is refused, never estimated.` },
    { name: 'zone', label: 'Time zone it was convened in', type: 'select', required: true, options: options(knownZones().map((zone) => ({ value: zone, label: zone })), { blank: 'Choose an IANA zone' }), help: 'No zone is assumed. Each attendee’s burden is placed in THEIR own day, not in this one.' },
    { name: 'attendeeIds', label: 'Who attended?', type: 'boolean-block', options: rosterRows.slice(0, 40), help: 'A sitting with no attendee convenes nothing; an attendee not on the roster refuses the whole sitting.' },
    { name: 'chairId', label: 'Chaired by', type: 'select', options: options(rosterRows.slice(0, 40), { blank: 'No chair (the convening line then falls to “no declared line”)' }), help: 'The burden a sitting convenes is attributed to the chair’s line — only when the chair holds exactly one of the attendee’s active declared lines.' },
    { name: 'note', label: 'Note (optional)', type: 'textarea', help: 'What the sitting was, in one line — the register prints it beside the sitting.' },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.distributedEquityDeclareSitting(form.getValues());
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The sitting was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Sitting declared. The burden is placed per attendee, exactly, on read.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Declare an unsociable-hour sitting',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'One sitting, placed once per attendee', body: 'The sitting stores its own wall clock and zone. Every attendee’s outside minutes are computed exactly, in their own day, every time the register is read.' }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Declare', onClick: submit }],
  });
}

function retractSittingDialog(ctx, row, onDone) {
  const form = buildForm([
    { name: 'reason', label: 'Why is it being retracted?', type: 'textarea', required: true, help: `At least ${L.textMin} characters. The retraction itself stays on the record and is counted.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.distributedEquityRetractSitting({ sittingId: row.id, ...form.getValues() });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The retraction was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Sitting retracted. Its minutes count for nobody, and the retraction is counted.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Retract this sitting',
    body: h('div', { class: 'stack' },
      banner({ tone: 'caution', title: 'A retraction is counted, never silent', body: 'The sitting leaves the reading, but the retraction stays on the record with its reason. Nothing is deleted.' }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Retract', onClick: submit }],
  });
}

function conventionsDialog(ctx, report, onDone) {
  const c = report.conventions;
  const form = buildForm([
    { name: 'dweOutsideMinutesCeiling', label: 'Unsociable-hour ceiling (minutes per person per window)', type: 'number', min: 0, max: 3000, value: c.dweOutsideMinutesCeiling, required: true, help: 'A person over this ceiling in the trailing window is a condition the register files. Whole minutes; refused outside its bounds, never clamped.' },
    { name: 'dweWindowDays', label: 'Trailing window (days)', type: 'number', min: 7, max: 90, value: c.dweWindowDays, required: true },
    { name: 'dweEquityMinPeople', label: 'Equity floor: readable people', type: 'number', min: 2, max: 20, value: c.dweEquityMinPeople, required: true, help: 'Below any floor the verdict is refused with its reason — a rate over one or two people is not an equity reading.' },
    { name: 'dweEquityMinSittings', label: 'Equity floor: valid sittings', type: 'number', min: 1, max: 30, value: c.dweEquityMinSittings, required: true },
    { name: 'dweEquityMinOutsideMinutes', label: 'Equity floor: outside minutes in scope', type: 'number', min: 0, max: 3000, value: c.dweEquityMinOutsideMinutes, required: true },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.distributedEquitySetConventions(form.getValues());
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The conventions were refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Conventions set. Every verdict on this page is re-read against them.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Set the register’s conventions',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'Declared conventions, not fitted ones', body: 'These are declarations, clamped on load and refused by this setter when out of bounds. None is inferred from the record.' }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Set conventions', onClick: submit }],
  });
}

/* -------------------------------------------------------------------- views */

function summaryCard(report) {
  const t = report.totals;
  return card({
    title: 'What the register holds',
    subtitle: 'Every minute is an exact whole minute placed in the attendee’s own day. A refused placement is printed with its reason, never as a zero.',
    body: h('div', { class: 'stat-grid' },
      stat({ label: 'Declared windows', value: h('span', { 'data-testid': 'dwe-count-windows' }, String(t.windowsDeclared)), hint: `${t.windowsSuperseded} superseded · ${t.windowsWithdrawn} withdrawn` }),
      stat({ label: 'Valid sittings', value: h('span', { 'data-testid': 'dwe-count-sittings' }, String(t.sittingsValid)), hint: `${t.sittingsRefused} refused whole · ${t.sittingsRetracted} retracted` }),
      stat({ label: 'Attendance minutes', value: h('span', { 'data-testid': 'dwe-count-minutes' }, formatDweMinutes(t.attendanceMinutes)), hint: 'every valid sitting × every attendee, exactly' }),
      stat({ label: 'Outside the window', value: h('span', { 'data-testid': 'dwe-count-outside' }, t.readablePeopleN ? formatDweMinutes(t.outsideMinutes) : '—'), hint: `${t.readablePeopleN} readable member(s); unknown minutes are not in this figure` }),
      stat({ label: 'Unreadable people', value: h('span', { 'data-testid': 'dwe-count-unreadable' }, String(t.unreadablePeopleN)), hint: 'no window, an ambiguous pair, or a boundary the calendar refuses' }),
      stat({ label: 'Over the ceiling', value: h('span', { 'data-testid': 'dwe-count-over' }, String(t.overCeilingN)), hint: `trailing ${report.conventions.dweWindowDays} days over ${report.conventions.dweOutsideMinutesCeiling} min` }),
      stat({ label: 'Concentrated scopes', value: h('span', { 'data-testid': 'dwe-count-concentrated' }, String(t.concentratedN)), hint: 'top share ≥ 2× the even share, above the floors' }),
      stat({ label: 'Your attention', value: h('span', { 'data-testid': 'dwe-count-attention' }, String(report.attention)), hint: report.attentionReason }),
    ),
  });
}

function claimsBanners(report) {
  const t = report.totals;
  return h('div', { class: 'stack' },
    banner({
      tone: report.countsReconcile ? 'info' : 'bad',
      title: report.countsReconcile
        ? 'The person rows re-add to the sitting rows'
        : 'The person rows do NOT re-add to the sitting rows',
      body: `This is the first claim: the parts re-add. Sum of person minutes = ${t.attendanceMinutes}; sum over valid sittings (minutes × attendees) = ${t.attendanceMinutes}. It says nothing about coverage.`,
    }),
    banner({
      tone: report.figuresComplete ? 'good' : 'caution',
      title: report.figuresComplete
        ? 'Coverage is complete: every attendee carried a readable window and every sitting was placed'
        : 'NOT CERTIFIED — the register did not place the whole population',
      body: report.figuresComplete
        ? 'The second claim, separate from the first: no sitting was refused whole and no attendee’s cells are unreadable.'
        : `${report.coverageReasons.join(' ')} Any verdict below is TRUE OF THE PLACED PEOPLE ONLY. It is not a statement that the whole team was measured.`,
    }),
    report.disclosure && !report.disclosure.detailed
      ? banner({ tone: 'info', title: 'Names are withheld at this altitude', body: report.disclosure.reason })
      : null,
  );
}

function registerView(ctx, report, onDone) {
  const canDeclare = Boolean(ctx.api.distributedEquityDeclareWindow);
  const windowColumns = [
    { label: 'Person', render: (r) => h('strong', null, r.personName || r.personId) },
    { label: 'Window', render: (r) => (r.window
      ? h('span', { 'data-testid': `dwe-window-${r.personId}` }, `${r.window.start}–${r.window.end}`, h('span', { class: 'small muted' }, ` · ${r.window.zone}`))
      : h('span', { class: 'small text-warn' }, r.refusalReason)) },
    { label: 'Declared', render: (r) => (r.window ? r.window.declaredOn : '—') },
    { label: 'Source', render: (r) => h('span', { class: 'small muted' }, r.window ? (r.window.source.length > 110 ? `${r.window.source.slice(0, 110)}…` : r.window.source) : '—') },
    { label: 'Superseded', render: (r) => (r.supersededN ? String(r.supersededN) : '—') },
    { label: '', render: (r) => (canDeclare && r.window
      ? button('Withdraw', () => withdrawWindowDialog(ctx, r, onDone), { testid: `dwe-withdraw-${r.personId}` })
      : h('span', { class: 'small muted' }, '—')) },
  ];
  const sittingColumns = [
    { label: 'Day', key: 'day' },
    { label: 'Start', render: (r) => h('span', { 'data-testid': `dwe-sitting-${r.id}` }, r.start, r.ambiguousStart ? h('span', { class: 'small muted' }, ' (resolved occurrence named)') : null) },
    { label: 'Duration', render: (r) => formatDweMinutes(r.minutes) },
    { label: 'Zone', key: 'zone' },
    { label: 'Attendees', key: 'attendeesN' },
    { label: 'Chair', render: (r) => (r.chairName || h('span', { class: 'small muted' }, 'no chair')) },
    { label: 'Note', render: (r) => h('span', { class: 'small muted' }, r.note || '—') },
    { label: '', render: (r) => (canDeclare
      ? button('Retract', () => retractSittingDialog(ctx, r, onDone), { testid: `dwe-retract-${r.id}` })
      : h('span', { class: 'small muted' }, '—')) },
  ];
  return h('div', { class: 'stack', 'data-testid': 'dwe-register' },
    canDeclare ? h('div', { class: 'row gap-s' },
      button('Declare a working window', () => declareWindowDialog(ctx, report, onDone), { primary: true, testid: 'dwe-declare-window' }),
      button('Declare a sitting', () => declareSittingDialog(ctx, report, onDone), { primary: true, testid: 'dwe-declare-sitting' }),
      button('Set conventions', () => conventionsDialog(ctx, report, onDone), { testid: 'dwe-set-conventions' }),
      button('Scan the register', () => {
        const result = ctx.api.distributedEquityScan();
        if (!result?.ok) { toast(result?.error || 'The scan was refused.', 'bad'); return; }
        toast('Register scanned. Owed decisions were re-read from the record.', 'good');
        onDone?.();
      }, { testid: 'dwe-scan' })) : null,
    table({
      caption: 'Declared working windows — one live window per person, with its written source',
      columns: windowColumns,
      rows: report.windowRows.map((row) => ({ ...row, attrs: { 'data-testid': `dwe-window-row-${row.personId}` } })),
      emptyMessage: 'No working window is declared. Until one is, every attendee’s unsociable minutes are unknown — printed as unknown, never as zero.',
    }),
    report.refusedSittings.length
      ? banner({ tone: 'caution', title: `${report.refusedSittings.length} sitting(s) refused whole`, body: 'Each refusal is printed with its reason below. A refused sitting contributes to nobody’s totals: a partial sum printed as a total understates the burden.' })
      : null,
    table({
      caption: 'Refused sittings — counted, named by their reason, contributing to nothing',
      columns: [
        { label: 'Sitting', key: 'id' },
        { label: 'Day', key: 'day' },
        { label: 'Attendees', key: 'attendeesN' },
        { label: 'Why it is refused', render: (r) => h('span', { class: 'small' }, r.reason) },
      ],
      rows: report.refusedSittings.map((row) => ({ ...row, attrs: { 'data-testid': `dwe-refused-${row.id}`, 'data-code': row.code } })),
      emptyMessage: 'No sitting was refused.',
    }),
    table({
      caption: 'Declared sittings — the exact record the burden is computed from',
      columns: sittingColumns,
      rows: report.validSittings.map((row) => ({ ...row, attrs: { 'data-testid': `dwe-sitting-row-${row.id}` } })),
      emptyMessage: 'No sitting is declared. Declare one with its own wall clock and zone, and the register places it in every attendee’s own day.',
    }),
  );
}

function burdenView(report) {
  const columns = [
    { label: report.disclosure.detailed ? 'Person' : 'Person (name withheld here)', render: (r) => h('strong', null, r.personName || h('span', { class: 'small muted' }, 'withheld at this altitude')) },
    { label: 'Window', render: (r) => (r.window
      ? h('span', { class: 'small' }, `${r.window.start}–${r.window.end} · ${r.window.zone}`)
      : h('span', { class: 'small text-warn' }, r.unreadableReason || 'none declared')) },
    { label: 'Sittings', key: 'sittingsN' },
    { label: 'Minutes held', render: (r) => h('span', { 'data-testid': `dwe-held-${r.personId}`, 'data-minutes': String(r.minutesTotal) }, formatDweMinutes(r.minutesTotal)) },
    { label: 'Outside the window', render: (r) => figureOrWithheld(r, `dwe-outside-${r.personId}`) },
    { label: `Trailing ${report.conventions.dweWindowDays}d outside`, render: (r) => (r.trailingOutsideMinutes === null
      ? h('span', { class: 'small muted' }, 'unknown')
      : h('span', { 'data-testid': `dwe-trailing-${r.personId}`, 'data-minutes': String(r.trailingOutsideMinutes) }, formatDweMinutes(r.trailingOutsideMinutes), r.overCeiling ? badge('over ceiling', 'bad') : null)) },
  ];
  return h('div', { class: 'stack', 'data-testid': 'dwe-burden' },
    banner({
      tone: 'info',
      title: 'Minutes held and minutes placed are two different facts',
      body: '“Minutes held” is attendance. “Outside the window” needs the window, both zones and the calendar to agree; where they do not, the cell is withheld with its reason — never a zero.',
    }),
    table({
      caption: 'Burden per person — exact minutes, refused cells printed with their reasons',
      columns,
      rows: report.people.filter((row) => row.sittingsN > 0 || row.window).map((row) => ({ ...row, attrs: { 'data-testid': `dwe-person-${row.personId}` } })),
      emptyMessage: 'Nobody has attended a declared sitting yet.',
    }),
    report.workspaceEquity.measured
      ? card({
          title: 'The workspace burden, as one reading',
          subtitle: 'The top share against the even share (1/n) at a declared 2× threshold, above the declared floors.',
          body: h('div', { class: 'stat-grid' },
            stat({ label: 'Verdict', value: h('span', { 'data-testid': 'dwe-workspace-verdict' }, badge(VERDICT_SHORT[report.workspaceEquity.verdict] || report.workspaceEquity.verdict, VERDICT_TONE[report.workspaceEquity.verdict] || 'neutral')), hint: `top ${bp(report.workspaceEquity.topShareBp)} vs even ${bp(report.workspaceEquity.evenShareBp)} over ${report.workspaceEquity.peopleN} readable member(s)` }),
            stat({ label: 'Measured over', value: `${report.workspaceEquity.peopleN} member(s) · ${report.workspaceEquity.sittingsN} sitting(s)`, hint: `${formatDweMinutes(report.workspaceEquity.outsideMinutes)} outside the window in scope` }),
          ),
        })
      : banner({ tone: 'caution', title: 'No workspace equity verdict is printed', body: `${report.workspaceEquity.reason}. A rate below its floor is refused, never rendered as reassuring.` }),
  );
}

function linesView(report) {
  const columns = [
    { label: 'Convening line', render: (r) => h('strong', null, r.managerName) },
    { label: 'Sittings convened', key: 'sittingsN' },
    { label: 'People reached', key: 'peopleN' },
    { label: 'Minutes convened', render: (r) => formatDweMinutes(r.convenedMinutes) },
    { label: 'Outside minutes convened', render: (r) => h('span', { 'data-testid': `dwe-line-outside-${r.lineId}`, 'data-minutes': String(r.convenedOutsideMinutes) }, formatDweMinutes(r.convenedOutsideMinutes)) },
    { label: 'Equity verdict', render: (r) => (r.equity.measured
      ? h('span', { 'data-testid': `dwe-line-verdict-${r.lineId}`, 'data-verdict': r.equity.verdict },
          badge(VERDICT_SHORT[r.equity.verdict] || r.equity.verdict, VERDICT_TONE[r.equity.verdict] || 'neutral'),
          h('span', { class: 'small muted' }, ` top ${bp(r.equity.topShareBp)} vs even ${bp(r.equity.evenShareBp)}`))
      : h('span', { class: 'small muted' }, r.equity.reason)) },
  ];
  const n = report.noDeclaredLine;
  return h('div', { class: 'stack', 'data-testid': 'dwe-lines' },
    banner({
      tone: 'info',
      title: 'Attribution without invention',
      body: 'A sitting’s burden is attributed to the chair’s line ONLY when the chair holds exactly one of that attendee’s active declared lines. A chair holding two of the attendee’s lines, none, an unknown chair, or the attendee convening their own sitting falls to the named bucket below — counted, never split.',
    }),
    table({
      caption: 'Lines that convene unsociable-hour burden, with each line’s own equity reading',
      columns,
      rows: report.lines.map((row) => ({ ...row, attrs: { 'data-testid': `dwe-line-${row.lineId}` } })),
      emptyMessage: 'No burden is attributed to a line yet.',
    }),
    card({
      title: 'No declared line',
      subtitle: 'The minutes the attribution rule cannot place, printed in their own buckets rather than folded into a line.',
      body: h('div', { class: 'stat-grid' },
        stat({ label: 'Self-convened', value: formatDweMinutes(n.selfConvenedOutside), hint: 'the attendee’s own sitting' }),
        stat({ label: 'Unknown chair', value: formatDweMinutes(n.unknownChairOutside), hint: 'no chair on the record, or not on the roster' }),
        stat({ label: 'Chair off the attendee’s graph', value: formatDweMinutes(n.offGraphChairOutside), hint: 'the chair holds no declared line of that attendee' }),
        stat({ label: 'Ambiguous chair', value: formatDweMinutes(n.ambiguousChairOutside), hint: 'the chair holds two or more of the attendee’s lines — the tie is named, never split' }),
        stat({ label: 'Total outside in this bucket', value: formatDweMinutes(n.convenedOutside), hint: `${n.peopleN} people across ${n.sittingsN} sitting(s)` }),
      ),
    }),
  );
}

function methodView() {
  return h('div', { class: 'stack', 'data-testid': 'dwe-method' },
    card({
      title: 'The register in one picture',
      subtitle: 'A sourced working window and a declared sitting, placed exactly in each attendee’s own day, with the two claims printed apart.',
      body: h('figure', { class: 'figure' },
        h('img', { src: DIAGRAM_URL, alt: 'Distributed-work equity method: a person’s declared daily window in their own time zone, a dated sitting with its own wall clock and zone, the overlap computed as exact minutes in the attendee’s day, the outside minutes compared with the declared ceiling, and a separate coverage claim printed beside the equity verdict.', class: 'figure-img', 'data-testid': 'dwe-diagram' }),
        h('figcaption', { class: 'small muted' }, 'Every placement is integer arithmetic over instants resolved in each zone. A boundary the calendar refuses stops that reading with a printed reason.')),
    }),
    card({ title: 'Frameworks encoded', body: h('ul', { class: 'list' }, ...DWE_METHOD.frameworks.map((f) => h('li', null, f))) }),
    card({ title: 'What the page prints, and how', body: h('ul', { class: 'list' }, ...DWE_METHOD.printed.map((f) => h('li', null, f))) }),
    card({ title: 'What it deliberately does not do', body: h('ul', { class: 'list' }, ...DWE_METHOD.deliberatelyAbsent.map((f) => h('li', null, f))) }),
  );
}

export function renderDistributedEquity(ctx) {
  const report = ctx.api.distributedEquityReport ? ctx.api.distributedEquityReport() : null;
  if (!report || report.ok === false || !report.totals) {
    return h('div', { class: 'page' },
      pageHeader({ eyebrow: 'Frontline · matrix and single-chain', title: 'Distributed-work equity', subtitle: 'Who carries the unsociable hour — and is it shared or concentrated?' }),
      banner({ tone: 'bad', title: 'The register could not be read', body: report?.error || 'The seat refused the read.' }));
  }
  const requested = ctx.query?.get?.('view');
  const view = VIEWS.some((row) => row.key === requested) ? requested : 'register';
  const onDone = () => ctx.refresh?.();
  return h('div', { class: 'page', 'data-testid': 'distributed-equity-panel' },
    pageHeader({
      eyebrow: 'Frontline → director · single-chain and matrix',
      title: 'Who carries the unsociable hour — and is it shared or concentrated?',
      subtitle: 'Declared working windows and declared sittings, placed exactly in each person’s own day across time zones and DST. The register prints the burden, the concentration, the coverage gap, and refuses what the record cannot support.',
    }),
    ctx.persistError ? card({ body: h('p', { class: 'text-warn small' }, `Changes are not being saved: ${ctx.persistError}`) }) : null,
    report.matrixError ? banner({ tone: 'bad', title: 'Convening lines cannot be attributed right now', body: report.matrixError }) : null,
    ...(report.warnings || []).map((warning) => banner({ tone: 'caution', title: 'A stored row was refused', body: warning })),
    summaryCard(report),
    claimsBanners(report),
    tabs({
      items: VIEWS.map((row) => ({
        key: row.key,
        label: row.label,
        count: row.key === 'register' ? report.totals.sittingsValid : row.key === 'burden' ? report.people.length : row.key === 'lines' ? report.lines.length : undefined,
      })),
      active: view,
      ariaLabel: 'Distributed-work equity views',
      onSelect: (key) => ctx.navigate(`${DWE_HREF}?view=${key}`),
    }),
    view === 'register' ? registerView(ctx, report, onDone) : null,
    view === 'burden' ? burdenView(report) : null,
    view === 'lines' ? linesView(report) : null,
    view === 'method' ? methodView() : null,
    view === 'register' && !report.totals.windowsDeclared
      ? emptyState({ title: 'No working window is declared', body: 'Declaring one fixes a zone and a daily span, with a written source. Nothing is inferred from behaviour, calendars or this device’s own zone.' })
      : null,
  );
}

export default renderDistributedEquity;
