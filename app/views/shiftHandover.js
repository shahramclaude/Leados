/**
 * app/views/shiftHandover.js — `#/shift-handover`, the Shift Handover &
 * Two-Key Readback Ledger (ADR-0223, Schema v178).
 *
 * ONE reader (`buildShiftHandover`) stands behind every state, figure, count
 * and escalation this page prints. The page formats what the reader returned;
 * it computes no state, no overdue flag and no apex of its own.
 *
 * THE THREE THINGS THIS SCREEN KEEPS APART:
 *   1. THE BRIEF — the outgoing operator's dated declaration of the station;
 *   2. THE READBACK — the incoming operator's own key: a synthesis, or a
 *      dispute with its named reason. Neither is inferable from a clock;
 *   3. THE CLAIMS — "the rows add up" (`countsReconcile`) and "nothing is
 *      overdue or emergency-uncontained" (`figuresComplete`), printed apart.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import {
  SHO_HREF,
  SHO_LIMITS,
  SHO_METHOD,
  SHO_READBACK_KINDS,
  SHO_SEVERITIES,
} from '../core/domain/shiftHandoverRegistry.js';

const L = SHO_LIMITS;
const DIAGRAM_URL = './app/assets/shift-handover-two-key.jpg';
const VIEWS = [
  { key: 'briefs', label: 'Briefs' },
  { key: 'readbacks', label: 'Readbacks & disputes' },
  { key: 'escalations', label: 'Escalations' },
  { key: 'method', label: 'Method' },
];
const STATE_TONE = { contained: 'good', disputed: 'bad', 'awaiting-readback': 'caution', cancelled: 'neutral' };
const STATE_SHORT = { contained: 'Contained', disputed: 'Disputed', 'awaiting-readback': 'Awaiting', cancelled: 'Cancelled' };
const SEV_TONE = { routine: 'neutral', watch: 'info', abnormal: 'caution', emergency: 'bad' };

function button(label, onClick, { primary = false, testid = null, danger = false } = {}) {
  return h('button', {
    type: 'button',
    class: `btn btn-small ${primary ? 'btn-primary' : danger ? 'btn-ghost text-warn' : 'btn-ghost'}`,
    ...(testid ? { 'data-testid': testid } : {}),
    onClick,
  }, label);
}

const options = (rows, { blank = null } = {}) => [
  ...(blank ? [{ value: '', label: blank }] : []),
  ...rows.map((row) => ({ value: row.value, label: row.label })),
];

const personOptions = (ctx) => (ctx.state?.people || [])
  .filter((row) => row && row.id && row.status !== 'archived')
  .map((row) => ({ value: row.id, label: `${row.name || row.id} · ${row.role || row.level || 'team'}` }));

/* ------------------------------------------------------------------ dialogs */

function declareDialog(ctx, report, onDone) {
  const roster = personOptions(ctx);
  const form = buildForm([
    { name: 'stationRef', label: 'Station / boundary being handed over', type: 'text', required: true, help: `At least ${L.stationRefMin} characters — the board, line or asset the incoming operator is taking.` },
    {
      name: 'incomingId', label: 'Incoming operator', type: 'select', required: true,
      options: options(roster, { blank: 'Choose the person taking the station' }),
      help: 'A different, active person on the roster — often on a second, matrix line (night or weekend cover). Never you.',
    },
    {
      name: 'severity', label: 'I-PASS severity', type: 'select', required: true,
      options: options(SHO_SEVERITIES.map((row) => ({ value: row.key, label: row.label })), { blank: 'Declare the severity' }),
      help: 'A closed list — a free-text severity makes every total a matter of spelling.',
    },
    { name: 'summary', label: 'Station summary', type: 'textarea', required: true, help: `At least ${L.textMin} characters: state, trend, what normal looks like here.` },
    { name: 'contingency', label: 'If it moves — the contingency', type: 'textarea', required: true, help: `At least ${L.textMin} characters: what the incoming operator does if the abnormality moves while they hold the station.` },
    { name: 'abnormalities', label: 'Active waivers / abnormalities (optional)', type: 'textarea', help: 'Jumpers, tagged-out interlocks, expiring permits, running maintenance — everything the incoming operator must not assume is normal.' },
    { name: 'dueAt', label: 'Readback owed by', type: 'datetime-local', help: `The instant the incoming key must turn — at changeover. At most ${L.dueMaxHours}h after the brief.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.shiftHandoverDeclare({ ...values, dueAt: values.dueAt ? new Date(values.dueAt).toISOString() : undefined });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The brief was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Brief declared. The handover completes when the incoming operator turns their key — not before.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Declare the outgoing brief',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'Two keys, one boundary', body: 'This is the outgoing key: your dated declaration of the station. It is NOT a handover yet. The handover exists when the declared incoming operator reads it back — a synthesis in their own words, or a dispute with a named reason. A clock-in is not a key.' }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Declare brief', onClick: submit }],
  });
}

function readbackDialog(ctx, brief, onDone) {
  const form = buildForm([
    {
      name: 'kind', label: 'What does your key record?', type: 'select', required: true,
      options: options(SHO_READBACK_KINDS.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose' }),
      help: 'A synthesis accepts the station with your own understanding of it. A dispute refuses safe acceptance, with a reason.',
    },
    { name: 'synthesis', label: 'Synthesis (required for "synthesized")', type: 'textarea', help: `At least ${L.textMin} characters: the situation as you understand it, the actions and their owners, and the contingency.` },
    { name: 'disputeReason', label: 'Dispute reason (required for "disputed")', type: 'textarea', help: `At least ${L.reasonMin} characters: what is uncontained and why you cannot safely take the station.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.shiftHandoverReadback({ handoverId: brief.id, ...form.getValues() });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The readback was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast(result.state === 'contained'
      ? 'Handover contained. Two keys turned — the boundary is a record, not an assumption.'
      : 'Handover disputed. The seat above both lines will be asked to adjudicate.', result.state === 'contained' ? 'good' : 'bad');
    onDone?.();
  };
  openModal({
    title: 'Turn your key — read the handover back',
    body: h('div', { class: 'stack' },
      banner({ tone: 'caution', title: `Station: ${brief.stationRef}`, body: `${brief.summary}` }),
      brief.abnormalities ? banner({ tone: 'caution', title: 'Active waivers / abnormalities', body: brief.abnormalities }) : null,
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record readback', onClick: submit }],
  });
}

function cancelDialog(ctx, brief, onDone) {
  const form = buildForm([
    { name: 'reason', label: 'Why did the changeover not happen?', type: 'textarea', required: true, help: `At least ${L.reasonMin} characters.` },
    { name: 'on', label: 'Cancelled on', type: 'date', required: true },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.shiftHandoverCancel({ handoverId: brief.id, ...form.getValues() });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The cancellation was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Brief cancelled — the changeover did not happen, and the record says so.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Cancel this brief',
    body: h('div', { class: 'stack' },
      banner({ tone: 'caution', title: 'Only before any key turns', body: 'Cancelling after a readback exists is refused: a two-key fact is never erased. This is for changeovers that did not happen — a sick call, a false start.' }),
      form.node),
    actions: [{ label: 'Keep brief', onClick: () => closeAllModals() }, { label: 'Cancel brief', onClick: submit, danger: true }],
  });
}

/* ------------------------------------------------------------------- views */

function summaryCard(report) {
  const t = report.totals;
  return card({
    title: 'What the boundary holds',
    subtitle: 'Every figure is the reader’s own exact integer, re-derived on each read.',
    body: h('div', { class: 'stat-grid' },
      stat({ label: 'Briefs declared', value: h('span', { 'data-testid': 'sho-count-briefs' }, String(t.briefsDeclared)), hint: `${t.briefsLive} live · ${t.containedN} contained · ${t.cancelledN} cancelled` }),
      stat({ label: 'Awaiting readback', value: h('span', { 'data-testid': 'sho-count-awaiting' }, String(t.awaitingN)), hint: 'the incoming key has not turned' }),
      stat({ label: 'Disputed', value: h('span', { 'data-testid': 'sho-count-disputed' }, String(t.disputedN)), hint: 'safe acceptance refused, with a named reason' }),
      stat({ label: 'Overdue uncontained', value: h('span', { 'data-testid': 'sho-count-overdue' }, String(t.overdueN)), hint: 'past the declared readback instant with no synthesis' }),
      stat({ label: 'Emergency uncontained', value: h('span', { 'data-testid': 'sho-count-emergency' }, String(t.emergencyUncontainedN)), hint: 'station not safely operable and no key turned' }),
      stat({ label: 'Cross-line handovers', value: h('span', { 'data-testid': 'sho-count-crossline' }, t.crossLineN === null ? 'not computable' : String(t.crossLineN)), hint: 'outgoing and incoming on different reporting lines' }),
      stat({ label: 'Unowned open actions', value: h('span', { 'data-testid': 'sho-count-unowned' }, String(t.unownedActionsN)), hint: 'printed as unowned — never auto-assigned' }),
      stat({ label: 'Your attention', value: h('span', { 'data-testid': 'sho-count-attention' }, String(report.attention)), hint: report.attentionReason || 'no readback owed by this seat' }),
    ),
  });
}

function claimsBanners(report) {
  const t = report.totals;
  return h('div', { class: 'stack' },
    banner({
      tone: t.countsReconcile ? 'info' : 'bad',
      title: t.countsReconcile
        ? 'The rows add up — states and severities partition the ledger exactly'
        : 'The rows do not add up — the ledger does not reconcile',
      body: 'This is the first claim: per-state and per-severity counts sum to the declared total, and every readback act references a brief this workspace holds. It says nothing about whether the boundaries are contained.',
    }),
    banner({
      tone: t.figuresComplete ? 'good' : 'caution',
      title: t.figuresComplete
        ? 'Figures are complete — nothing is overdue or emergency-uncontained'
        : 'NOT CERTIFIED — an uncontained handover is past its readback instant',
      body: t.figuresComplete
        ? 'The second claim, separate from the first: no live brief is past its due instant without a synthesis, and no emergency-severity brief stands uncontained.'
        : `${t.overdueN} uncontained brief(s) are past their readback instant; ${t.emergencyUncontainedN} of them are emergency-severity. The seat above EVERY line of both operators is asked — never one peer line over the other.`,
    }),
  );
}

function briefsView(ctx, report, onDone) {
  const rows = report.briefs.map((row) => ({
    ...row,
    attrs: {
      'data-testid': `sho-brief-${row.id}`,
      'data-state': row.state,
      'data-overdue': String(row.overdue),
      'data-severity': row.severity,
    },
  }));
  const actorId = report.seat?.actorId || null;
  const columns = [
    { label: 'Station', render: (r) => h('strong', null, r.stationRef) },
    { label: 'Severity', render: (r) => badge(r.severity, SEV_TONE[r.severity] || 'neutral') },
    { label: 'From → To', render: (r) => h('span', null, `${r.outgoingName || 'withheld'} → ${r.incomingName || 'withheld'}`, r.crossLine ? h('span', { class: 'small' }, ' · cross-line') : null) },
    { label: 'Declared', render: (r) => r.declaredAt.slice(0, 16).replace('T', ' ') },
    { label: 'Readback owed', render: (r) => h('span', { class: r.overdue ? 'text-warn' : '' }, r.dueAt.slice(0, 16).replace('T', ' '), r.overdue ? ' · OVERDUE' : '') },
    { label: 'State', render: (r) => badge(STATE_SHORT[r.state] || r.state, STATE_TONE[r.state] || 'neutral') },
    {
      label: 'Actions', render: (r) => h('span', null, `${r.openActions.length} declared`, r.unownedActionsN ? h('span', { class: 'small text-warn' }, ` · ${r.unownedActionsN} unowned`) : ''),
    },
    {
      label: '', render: (r) => h('div', { class: 'row gap-s' },
        r.incomingId === actorId && (r.state === 'awaiting-readback' || r.state === 'disputed')
          ? button('Turn your key', () => readbackDialog(ctx, r, onDone), { primary: true, testid: `sho-readback-${r.id}` })
          : null,
        r.outgoingId === actorId && r.state === 'awaiting-readback' && !r.actsN
          ? button('Cancel', () => cancelDialog(ctx, r, onDone), { testid: `sho-cancel-${r.id}` })
          : null),
    },
  ];
  return h('div', { class: 'stack', 'data-testid': 'sho-briefs' },
    h('div', { class: 'row gap-s' },
      button('Declare the outgoing brief', () => declareDialog(ctx, report, onDone), { primary: true, testid: 'sho-declare' }),
      button('Scan the register', () => {
        const result = ctx.api.shiftHandoverScan();
        if (!result?.ok) { toast(result?.error || 'The scan was refused.', 'bad'); return; }
        toast('Register scanned. Overdue and disputed handovers were re-read from the record.', 'good');
        onDone?.();
      }, { testid: 'sho-scan' })),
    report.briefsCapped > 0 ? banner({ tone: 'info', title: `Showing the ${report.briefsShown} most urgent of ${report.briefsShown + report.briefsCapped} briefs`, body: 'The cap is printed, not hidden: contained and cancelled history is counted on this page and in the export, just not all listed.' }) : null,
    table({
      caption: 'Changeover briefs — severity, the two people at the boundary, and whose key is owed',
      columns,
      rows,
      emptyMessage: 'No changeover brief has been declared. Until one is, the boundary between shifts is an assumption nobody signed.',
    }),
  );
}

function readbacksView(report) {
  const rows = report.readbacks.slice();
  const columns = [
    { label: 'At', render: (r) => r.at.slice(0, 16).replace('T', ' ') },
    { label: 'Station', render: (r) => h('strong', null, r.stationRef || '—') },
    { label: 'Key turned by', render: (r) => r.actorName || 'withheld' },
    { label: 'Kind', render: (r) => badge(r.kind, r.kind === 'synthesized' ? 'good' : 'bad') },
    { label: 'Content', render: (r) => h('span', { class: 'small' }, r.kind === 'synthesized'
      ? (r.synthesis.length > 180 ? `${r.synthesis.slice(0, 180)}…` : r.synthesis)
      : (r.disputeReason.length > 180 ? `${r.disputeReason.slice(0, 180)}…` : r.disputeReason)) },
  ];
  return h('div', { class: 'stack', 'data-testid': 'sho-readbacks' },
    banner({ tone: 'info', title: 'The receiver’s key, verbatim', body: 'Every row here is the declared incoming operator’s own act on the dated record. A synthesis is their understanding of the station; a dispute is their refusal with its named reason. Neither is edited after the fact — a later synthesis supersedes at read time, and history keeps every act.' }),
    table({
      caption: 'Readback acts — synthesis or dispute, dated and immutable',
      columns,
      rows,
      emptyMessage: 'No key has turned yet. Until one does, every changeover on this record is an assumption.',
    }),
  );
}

function escalationsView(report) {
  const overdue = report.briefsAll.filter((row) => row.overdue);
  const columns = [
    { label: 'Station', render: (r) => h('strong', null, r.stationRef) },
    { label: 'State', render: (r) => badge(STATE_SHORT[r.state] || r.state, STATE_TONE[r.state] || 'neutral') },
    { label: 'Severity', render: (r) => badge(r.severity, SEV_TONE[r.severity] || 'neutral') },
    { label: 'Readback owed', render: (r) => r.dueAt.slice(0, 16).replace('T', ' ') },
    { label: 'Asked', render: (r) => {
      const e = r.escalation;
      if (e.unique) return h('span', null, e.apexName || 'withheld');
      if (e.ambiguous) return h('span', { class: 'small' }, `joint-apex tie · ${e.apexIds.length} seats, each asked`);
      if (e.disconnected) return h('span', { class: 'small text-warn' }, 'no seat above both lines — nobody asked, printed here');
      return h('span', { class: 'small muted' }, 'no seat resolves');
    } },
  ];
  return h('div', { class: 'stack', 'data-testid': 'sho-escalations' },
    banner({ tone: 'info', title: 'Who answers when nobody took the station', body: 'An overdue, uncontained handover is asked of the lowest seat above EVERY line of both operators — `matrixJointApex`, never one peer line over the other and never either operator. Where the graph cannot name such a seat, nobody is asked and the fact is printed here.' }),
    table({
      caption: 'Uncontained handovers past their readback instant',
      columns,
      rows: overdue,
      emptyMessage: 'Nothing is overdue. Every live brief is inside its readback window or already contained.',
    }),
    report.markers.length
      ? card({ title: 'Identity-free rule observations', subtitle: 'Written when nobody could be asked — kept here, on the record, with their reason', body: h('ul', { class: 'list' }, ...report.markers.slice(-12).map((m) => h('li', { class: 'small' }, `${m.at.slice(0, 16).replace('T', ' ')} — ${m.detail}`))) })
      : null,
  );
}

function methodView() {
  return h('div', { class: 'stack', 'data-testid': 'sho-method' },
    card({
      title: 'The two-key changeover in one picture',
      subtitle: 'Severity, summary, actions, contingency from the outgoing operator; the synthesis or the dispute from the incoming operator; the joint seat above both lines when nobody turned a key.',
      body: h('figure', { class: 'figure' },
        h('img', { src: DIAGRAM_URL, alt: 'Shift handover: the outgoing operator writes a dated brief with severity, station summary, open actions and a contingency. The incoming operator turns the second key by synthesizing the handover or disputing it. If the readback instant passes uncontained, the joint seat above every line of both operators is asked.', class: 'figure-img', 'data-testid': 'sho-diagram' }),
        h('figcaption', { class: 'small muted' }, 'A handover exists when two humans have signed it, not when the clock did.')),
    }),
    card({ title: 'Frameworks encoded', body: h('ul', { class: 'list' }, ...SHO_METHOD.frameworks.map((f) => h('li', null, f))) }),
    card({ title: 'What the page prints, and how', body: h('ul', { class: 'list' }, ...SHO_METHOD.printed.map((f) => h('li', null, f))) }),
    card({ title: 'What it deliberately does not do', body: h('ul', { class: 'list' }, ...SHO_METHOD.deliberatelyAbsent.map((f) => h('li', null, f))) }),
  );
}

export function renderShiftHandover(ctx) {
  const report = ctx.api.shiftHandoverReport ? ctx.api.shiftHandoverReport() : null;
  if (!report || report.ok === false || !report.totals) {
    return h('div', { class: 'page' },
      pageHeader({ eyebrow: 'Frontline & mid-manager · matrix', title: 'Shift handover', subtitle: 'Two keys, one boundary.' }),
      banner({ tone: 'bad', title: 'The register could not be read', body: report?.error || 'The seat refused the read.' }));
  }
  const requested = ctx.query?.get?.('view');
  const view = VIEWS.some((row) => row.key === requested) ? requested : 'briefs';
  const onDone = () => ctx.refresh?.();
  return h('div', { class: 'page', 'data-testid': 'shift-handover-panel' },
    pageHeader({
      eyebrow: 'Frontline & mid-manager · single-chain and matrix',
      title: 'Did the station actually change hands — or did the clock change hands?',
      subtitle: 'The outgoing operator declares the station: severity, situation, open actions, active waivers, contingency. The incoming operator turns the second key — a synthesis, or a dispute with its named reason. Silence past the readback instant is escalated to the seat above every line of both operators.',
    }),
    ctx.persistError ? card({ body: h('p', { class: 'text-warn small' }, `Changes are not being saved: ${ctx.persistError}`) }) : null,
    report.matrixError ? banner({ tone: 'bad', title: 'Cross-line status cannot be proved right now', body: report.matrixError }) : null,
    ...(report.warnings || []).map((warning) => banner({ tone: 'caution', title: 'A stored row was refused', body: warning })),
    summaryCard(report),
    claimsBanners(report),
    tabs({
      items: VIEWS.map((row) => ({
        key: row.key,
        label: row.label,
        count: row.key === 'briefs' ? report.briefs.length : row.key === 'readbacks' ? report.readbacksShown : row.key === 'escalations' ? report.briefsAll.filter((r) => r.overdue).length : undefined,
      })),
      active: view,
      ariaLabel: 'Shift handover views',
      onSelect: (key) => ctx.navigate(`${SHO_HREF}?view=${key}`),
    }),
    view === 'briefs' ? briefsView(ctx, report, onDone) : null,
    view === 'readbacks' ? readbacksView(report) : null,
    view === 'escalations' ? escalationsView(report) : null,
    view === 'method' ? methodView() : null,
  );
}

export default renderShiftHandover;
