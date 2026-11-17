/**
 * app/views/loneWorking.js — `#/lone-working`, the Lone-Working Welfare Check
 * Register (ADR-0242, Schema v196).
 *
 * ONE reader (`buildLoneWorking`) stands behind every state, deadline, late
 * minute, overrun, line position and count this page prints. The page formats
 * what the reader returned; it computes no deadline, no lateness and no verdict
 * of its own.
 *
 * THE FOUR THINGS THIS SCREEN KEEPS APART
 *  - who is alone RIGHT NOW, where, since when, and when the next contact is due;
 *  - whether the record has contact, a concern nobody answered, an escalation, or
 *    nothing at all — four different facts, four different states;
 *  - whether a deployment ran past the end it was declared to, and by exactly how
 *    many minutes;
 *  - whose duty it is: every active reporting line that holds the person, with the
 *    joint seat above them, because the line that sent them out is often not the
 *    line that owns the site.
 *
 * WHAT THE SCREEN REFUSES TO SAY. It never says a person is missing, never prints
 * a location, and never rates anybody. The strongest claim it makes is that
 * welfare is unconfirmed, and it prints that sentence beside the state so nobody
 * reads more into it than the record holds.
 *
 * DISCLOSURE LADDER. The reader narrows this page: below the executive altitude it
 * shows per-person rows with names; above it the same counts with names withheld.
 * The page prints that it is a rendering contract and not an authentication
 * boundary, because this workspace has no authentication and implying otherwise
 * would be the lie that hurts people.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table, kv } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { exportWorkspaceCsv } from '../core/csv.js';
import {
  LWK_CHANNELS,
  LWK_CHECKIN_OUTCOMES,
  LWK_CLOSE_OUTCOMES,
  LWK_CSV_SCOPE,
  LWK_ESCALATION_BASES,
  LWK_ESCALATION_OUTCOMES,
  LWK_HREF,
  LWK_LIMITS,
  LWK_METHOD,
  LWK_SECTION_TITLES,
  LWK_STATE_BY_KEY,
} from '../core/domain/loneWorkingRegistry.js';
import { durationLabel } from '../core/domain/loneWorkingMath.js';

const L = LWK_LIMITS;
const DIAGRAM_URL = './app/assets/lone-working-welfare-method.jpg';
const VIEWS = [
  { key: 'now', label: LWK_SECTION_TITLES.now },
  { key: 'lines', label: LWK_SECTION_TITLES.lines },
  { key: 'history', label: LWK_SECTION_TITLES.history },
  { key: 'method', label: LWK_SECTION_TITLES.method },
];

const TONE = { bad: 'bad', warn: 'warn', good: 'good', neutral: 'neutral' };
const options = (rows, { blank = null } = {}) => [
  ...(blank ? [{ value: '', label: blank }] : []),
  ...rows.map((row) => ({ value: row.value, label: row.label })),
];

/** A stored instant, printed as the record stores it. The header says it is UTC. */
const instantLabel = (value) => (typeof value === 'string' && value.length >= 16 ? `${value.slice(0, 10)} ${value.slice(11, 16)}` : '—');
const clockLabel = (ms) => (Number.isFinite(ms) ? `${new Date(ms).toISOString().slice(0, 10)} ${new Date(ms).toISOString().slice(11, 16)}` : '—');
/** A `datetime-local` value from a stored instant, so a dialog can prefill honestly. */
const localInput = (iso) => (typeof iso === 'string' && iso.length >= 16 ? iso.slice(0, 16) : '');

function button(label, onClick, { primary = false, testid = null } = {}) {
  return h('button', {
    type: 'button',
    class: `btn btn-small ${primary ? 'btn-primary' : 'btn-ghost'}`,
    ...(testid ? { 'data-testid': testid } : {}),
    onClick,
  }, label);
}

function stateBadge(state) {
  return h('span', {
    class: `badge badge-${TONE[state.tone] || 'neutral'}`,
    title: state.says,
    'data-testid': `lwk-state-${state.key}`,
  }, state.label);
}

/* ------------------------------------------------------------------ dialogs */

function declareDialog(ctx, report, candidates, onDone) {
  const nowInput = localInput(report.nowIso);
  const form = buildForm([
    {
      name: 'personId', label: 'Who is working alone?', type: 'select', required: true,
      options: options(candidates.map((row) => ({ value: row.id, label: `${row.name}${row.role ? ` — ${row.role}` : ''}` })), { blank: 'Choose a person' }),
      help: 'Only people this seat holds through the span or a declared line are listed. Nobody declares themselves alone.',
    },
    { name: 'siteRef', label: 'Where will they be alone?', type: 'text', required: true, help: `At least ${L.shortMin} characters — the substation, the tank room, the far yard. A place somebody could actually go to.` },
    { name: 'task', label: 'What are they alone to do?', type: 'text', required: true, help: `At least ${L.shortMin} characters.` },
    {
      name: 'protocolRef', label: 'The written lone-working assessment', type: 'text', required: true,
      help: `At least ${L.protocolMin} characters: the reference and revision, e.g. “LWA-2026-114 rev 2 — substation isolation”. A deployment with no assessment is refused.`,
    },
    { name: 'intervalMinutes', label: 'Check-in interval (whole minutes)', type: 'number', min: L.intervalMin, max: L.intervalMax, required: true, value: L.intervalMin * 12, help: `Between ${L.intervalMin} and ${L.intervalMax}. This is the number the whole register runs on.` },
    { name: 'graceMinutes', label: 'Grace before it is overdue (whole minutes)', type: 'number', min: 0, max: L.graceMax, required: true, value: 10, help: `Between 0 and ${L.graceMax}. Zero is legitimate — “ring immediately”.` },
    { name: 'startAt', label: 'Starts (stored instant, UTC)', type: 'datetime-local', required: true, value: nowInput },
    { name: 'expectedEndAt', label: 'Declared end (stored instant, UTC)', type: 'datetime-local', required: true },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.loneWorkingDeclareDeployment({
      ...values,
      intervalMinutes: Number(values.intervalMinutes),
      graceMinutes: Number(values.graceMinutes),
    });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The deployment was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Deployment declared. The clock starts from the declared start, and every line holding this person now owes an answer if it lapses.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Declare a lone deployment',
    description: 'Who is alone, where, against which written assessment, and how often they will be heard from.',
    body: h('div', { class: 'stack' },
      banner({
        tone: 'caution',
        title: 'The interval is a decision, not a default',
        body: 'Nothing in this workspace infers a check-in interval from a rota, a site or history. The number you declare is the number every deadline on the screen is computed from — which is why the door refuses a fraction and a blank.',
      }),
      form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Declare deployment', onClick: submit, primary: true }],
  });
}

function checkInDialog(ctx, row, onDone) {
  const form = buildForm([
    { type: 'static', label: 'Deployment', value: h('p', null, `${row.deployment.siteRef} — ${row.deployment.task}`) },
    { type: 'static', label: 'Last contact', value: h('p', null, row.lastContactAt ? instantLabel(row.lastContactAt) : 'none recorded') },
    {
      name: 'channel', label: 'How was contact made?', type: 'select', required: true,
      options: options(LWK_CHANNELS.map((channel) => ({ value: channel.key, label: channel.label })), { blank: 'Choose the channel' }),
      help: LWK_CHANNELS.map((channel) => `${channel.label}: ${channel.says}`).join(' '),
    },
    {
      name: 'outcome', label: 'What did they say?', type: 'select', required: true,
      options: options(LWK_CHECKIN_OUTCOMES.map((outcome) => ({ value: outcome.key, label: outcome.label })), { blank: 'Choose the outcome' }),
      help: '“All well” resets the clock. “Concern raised” ALSO resets it — and opens a duty nobody has answered until an escalation records the response.',
    },
    { name: 'at', label: 'Instant of contact (stored instant, UTC)', type: 'datetime-local', required: true, value: localInput(new Date().toISOString()) },
    { name: 'note', label: 'Note (optional)', type: 'textarea' },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.loneWorkingCheckIn({ deploymentId: row.deployment.id, ...form.getValues() });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The contact was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast(result.concernRaised
      ? 'Contact recorded, and the concern is now owed a response. The clock reset; the concern did not close itself.'
      : 'Contact recorded. The clock reset from this instant.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Record a check-in',
    description: 'Contact made, on the channel it was made on.',
    body: h('div', { class: 'stack' },
      banner({
        tone: 'info',
        title: 'Contact is not a clean bill of health',
        body: 'A check-in resets the clock. It does not answer a concern the person raised, and it is never recorded on somebody else’s word at an instant that has not happened.',
      }),
      form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record contact', onClick: submit, primary: true }],
  });
}

function escalateDialog(ctx, row, onDone) {
  const form = buildForm([
    { type: 'static', label: 'Deployment', value: h('p', null, `${row.deployment.siteRef} — ${row.deployment.task}`) },
    { type: 'static', label: 'Recorded state', value: h('p', null, LWK_STATE_BY_KEY[row.state.key]?.says || row.state.key) },
    {
      name: 'basis', label: 'Why is this being raised?', type: 'select', required: true,
      options: options(LWK_ESCALATION_BASES.map((basis) => ({ value: basis.key, label: basis.label })), { blank: 'Choose the basis' }),
      help: LWK_ESCALATION_BASES.map((basis) => `${basis.label}: ${basis.says}`).join(' '),
    },
    {
      name: 'outcome', label: 'What did the escalation actually do?', type: 'select', required: true,
      options: options(LWK_ESCALATION_OUTCOMES.map((outcome) => ({ value: outcome.key, label: outcome.label })), { blank: 'Choose the outcome' }),
      help: 'Only “welfare confirmed” clears the unconfirmed state — and it clears nothing else: the exact late minutes stay on the record.',
    },
    { name: 'detail', label: 'What was done', type: 'textarea', required: true, help: `At least ${L.textMin} characters. The next hand needs to know what you tried before they try it again.` },
    { name: 'raisedAt', label: 'Instant the escalation was raised (stored instant, UTC)', type: 'datetime-local', required: true, value: localInput(new Date().toISOString()) },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.loneWorkingEscalate({ deploymentId: row.deployment.id, ...form.getValues() });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The escalation was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Escalation recorded. The register re-reads the state from the record — a confirmation does not erase the minutes that were late.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Record a welfare escalation',
    description: 'The response to a failed or concerning contact.',
    body: h('div', { class: 'stack' },
      banner({
        tone: 'bad',
        title: 'The register never says “missing”',
        body: 'It says welfare is unconfirmed, because that is what the record knows. What you did about it is the fact it can hold, and the next hand reads it verbatim.',
      }),
      form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record escalation', onClick: submit, primary: true }],
  });
}

function closeDialog(ctx, row, onDone) {
  const form = buildForm([
    { type: 'static', label: 'Deployment', value: h('p', null, `${row.deployment.siteRef} — ${row.deployment.task}`) },
    {
      name: 'closeOutcome', label: 'How did it end?', type: 'select', required: true,
      options: options(LWK_CLOSE_OUTCOMES.map((outcome) => ({ value: outcome.key, label: outcome.label })), { blank: 'Choose how it ended' }),
      help: LWK_CLOSE_OUTCOMES.map((outcome) => `${outcome.label}: ${outcome.says}`).join(' '),
    },
    { name: 'note', label: 'What happened', type: 'textarea', required: true, help: `At least ${L.textMin} characters. This is the sentence the next hand and any later review will read.` },
    { name: 'at', label: 'Instant of close-out (stored instant, UTC)', type: 'datetime-local', required: true, value: localInput(new Date().toISOString()) },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.loneWorkingCloseDeployment({ deploymentId: row.deployment.id, ...form.getValues() });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The close-out was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast(row.contactsN === 0
      ? 'Closed out — with no contact ever recorded. The register prints that state rather than treating the close as confirmation.'
      : 'Deployment closed out.', row.contactsN === 0 ? 'caution' : 'good');
    onDone?.();
  };
  openModal({
    title: 'Close the deployment out',
    description: 'What happened, and when somebody said so.',
    body: h('div', { class: 'stack' },
      banner({
        tone: 'caution',
        title: 'Time cannot end a deployment',
        body: 'A passed declared end is printed as its own state, never closed automatically. Closing this out with no contact on the record will be printed as exactly that.',
      }),
      form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Close deployment', onClick: submit, primary: true }],
  });
}

function conventionsDialog(ctx, report, onDone) {
  const form = buildForm([
    { name: 'lwkHorizonDays', label: 'Planning horizon (days)', type: 'number', min: 1, max: 90, required: true, value: report.conventions.lwkHorizonDays, help: 'How far ahead a deployment may be declared. Beyond it the responder has not been set, so the register refuses the declaration rather than printing a deadline nobody is watching.' },
    { name: 'lwkPrivacyFloor', label: 'Privacy floor for the per-state export', type: 'number', min: 2, max: 20, required: true, value: report.conventions.lwkPrivacyFloor, help: 'A per-state count below this is exported BLANK with its reason. One unconfirmed deployment in a one-shift site is one row away from naming a person.' },
    { name: 'lwkAutoPropagate', label: 'File the rule’s asks automatically', type: 'checkbox', value: report.conventions.lwkAutoPropagate, help: 'Silencing this stops the asks for an unconfirmed welfare check, an unanswered concern and an unclosed overrun. Those are cross-line duties, so the switch carries a pause permit.' },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.loneWorkingSetConventions({
      lwkHorizonDays: Number(form.getValues().lwkHorizonDays),
      lwkPrivacyFloor: Number(form.getValues().lwkPrivacyFloor),
      lwkAutoPropagate: Boolean(form.getValues().lwkAutoPropagate),
    });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The conventions were refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Conventions set. Every finding on this page is re-read against them.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Set the register’s conventions',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'Declared, not fitted', body: 'The horizon and the floor are declarations. Neither is inferred from the record, and the register prints the value it used.' }),
      form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Set conventions', onClick: submit, primary: true }],
  });
}

/* -------------------------------------------------------------------- views */

function summaryCard(report) {
  const t = report.totals;
  return card({
    title: 'What the register holds at this minute',
    subtitle: 'Every figure is derived on read from dated declarations, recorded contacts and the live reporting graph. A deadline is never stored, and silence is never converted into safety.',
    body: h('div', { class: 'stat-grid' },
      stat({ label: 'Open deployments', value: h('span', { 'data-testid': 'lwk-count-open' }, String(t.open)), hint: `${t.people} person(s) · ${t.closed} closed out` }),
      stat({ label: 'Welfare unconfirmed', value: h('span', { 'data-testid': 'lwk-count-unconfirmed' }, String(t.unconfirmedN)), hint: `${t.unconfirmedMinutes} whole minute(s) past the declared deadline` }),
      stat({ label: 'Concerns unanswered', value: h('span', { 'data-testid': 'lwk-count-concern' }, String(t.concernN)), hint: 'contact made, nobody answered it' }),
      stat({ label: 'Past declared end', value: h('span', { 'data-testid': 'lwk-count-overran' }, String(t.overranN)), hint: `${t.overrunMinutes} whole minute(s) unclosed` }),
      stat({ label: 'Checks due now', value: h('span', { 'data-testid': 'lwk-count-due' }, String(t.checkDueN)), hint: 'inside the declared grace' }),
      stat({ label: 'Escalations open', value: h('span', { 'data-testid': 'lwk-count-escalating' }, String(t.escalationOpenN)), hint: `${t.confirmedLateN} confirmed late` }),
      stat({ label: 'Closed, never contacted', value: h('span', { 'data-testid': 'lwk-count-uncontacted' }, String(t.closedWithoutContactN)), hint: `${t.selfClosedN} close-out(s) by the deployed person` }),
      stat({ label: 'Your attention', value: h('span', { 'data-testid': 'lwk-count-attention' }, String(report.attention.total)), hint: 'unconfirmed, unanswered, overran, due' }),
    ),
  });
}

function claimsBanners(report) {
  const parts = report.balances.statesReconcile && report.balances.contactsReconcile && report.balances.escalationsReconcile;
  return h('div', { class: 'stack' },
    banner({
      tone: parts ? 'info' : 'bad',
      title: parts
        ? 'The parts re-add: every state count, contact and escalation ties to the deployments it summarises'
        : 'The printed counts do NOT re-add to the rows they summarise',
      body: `States ${report.stateTotal} of ${report.totals.deployments} deployment(s) · contacts ${report.totals.checkins} · escalations ${report.totals.escalations}. This is the first claim. It says nothing about whether the register could see everything.`,
    }),
    banner({
      tone: report.figuresComplete ? 'good' : 'caution',
      title: report.figuresComplete
        ? 'Coverage is complete: every stored row was read exactly and every deployment has a resolvable line position'
        : 'NOT CERTIFIED — the register could not see the whole picture',
      body: report.figuresComplete
        ? 'The second claim, separate from the first: no unreadable row, no orphan and no unresolvable reporting graph is outstanding.'
        : report.incompleteReasons.join(' '),
    }),
    banner({
      tone: 'info',
      title: 'This register does not know where anybody is',
      body: 'There is a declared site reference written by a supervisor and no coordinate, no movement trail and no device telemetry. The strongest claim the record can make is that welfare is unconfirmed — never that a person is missing.',
    }),
    report.detailed ? null : banner({ tone: 'caution', title: 'Names withheld at this altitude', body: report.disclosure.reason }),
  );
}

function openTable(ctx, report, onDone) {
  const rows = report.openRows;
  return card({
    title: 'Open deployments, most recent first',
    subtitle: 'The state is derived from the last contact, the declared interval and grace, the declared end and the recorded escalations. Nothing on this table is stored.',
    body: rows.length
      ? table({
        columns: [
          { label: 'Person', render: (row) => (report.detailed ? (row.personName || 'Not on the graph') : 'withheld') },
          { label: 'Where / what', render: (row) => h('div', null, h('div', null, row.deployment.siteRef), h('div', { class: 'small muted' }, row.deployment.task)) },
          { label: 'Declared by', render: (row) => h('div', null, h('div', null, row.declaringLineName), h('div', { class: 'small muted' }, row.declaringLineIsActive ? `${row.lines.length} active line(s) hold them` : 'that line no longer holds them')) },
          { label: 'Interval', render: (row) => `${row.deployment.intervalMinutes} min + ${row.deployment.graceMinutes} grace` },
          { label: 'Last contact (UTC)', render: (row) => (row.lastContact ? `${instantLabel(row.lastContact.at)} · ${row.lastContact.channel}` : 'never') },
          { label: 'Deadline / grace to (UTC)', render: (row) => h('div', null, h('div', null, clockLabel(row.dueAtMs)), h('div', { class: 'small muted' }, clockLabel(row.overdueAtMs))) },
          { label: 'State', render: (row) => stateBadge(row.state) },
          {
            label: 'Exact',
            render: (row) => {
              if (row.latenessMinutes > 0) return badge(`${durationLabel(row.latenessMinutes)} late`, 'bad');
              if (row.overrunMinutes > 0) return badge(`${durationLabel(row.overrunMinutes)} past end`, 'warn');
              if (Number.isInteger(row.minutesSinceContact)) return badge(`${durationLabel(row.minutesSinceContact)} since`, 'neutral');
              return '—';
            },
          },
          {
            label: '',
            render: (row) => h('div', { class: 'row-actions' },
              button('Check in', () => checkInDialog(ctx, row, onDone), { testid: 'lwk-action-checkin' }),
              button('Escalate', () => escalateDialog(ctx, row, onDone), { testid: 'lwk-action-escalate' }),
              button('Close out', () => closeDialog(ctx, row, onDone), { testid: 'lwk-action-close' })),
          },
        ],
        rows,
        caption: 'Open lone deployments',
        emptyMessage: 'Nobody is currently declared to be working alone. An empty register is a fact, not a reassurance: it means nothing has been declared, not that nobody is out.',
      })
      : emptyState({
        title: 'Nobody is currently declared to be working alone',
        body: 'This register only knows what was declared against a written assessment. If people are working alone without a declaration, the record cannot see them — and that is the finding, not an empty page.',
      }),
  });
}

function linesView(report) {
  return h('div', { class: 'stack' },
    card({
      title: 'Every reporting line that holds a lone worker',
      subtitle: 'The line that declared the deployment is marked. The ask for a lapsed check goes to the JOINT SEAT above every line holding the person — never to one line on another’s behalf, and never to the person.',
      body: report.lineRows.length
        ? table({
          columns: [
            { label: 'Line holder', render: (row) => (report.detailed ? row.managerName : 'withheld') },
            { label: 'Deployments', key: 'deploymentsN' },
            { label: 'Open', key: 'openN' },
            { label: 'Declaring line', key: 'declaringN' },
            { label: 'Unconfirmed', key: 'unconfirmedN' },
            { label: 'Past end', key: 'overranN' },
            { label: 'Concerns', key: 'concernN' },
            { label: 'People', key: 'peopleN' },
          ],
          rows: report.lineRows,
          caption: 'Line positions',
          emptyMessage: 'No line holds a deployment on this record.',
        })
        : emptyState({ title: 'No line position to read', body: 'Either nothing is declared, or the reporting graph could not be read.' }),
    }),
    card({
      title: 'Deployments past their declared end',
      subtitle: 'Time cannot end a deployment a human did not end. Each of these owes a close-out act, and the exact overrun is printed rather than summarised.',
      body: report.rows.filter((row) => row.state.key === 'overran').length
        ? table({
          columns: [
            { label: 'Person', render: (row) => (report.detailed ? (row.personName || 'Not on the graph') : 'withheld') },
            { label: 'Where', render: (row) => row.deployment.siteRef },
            { label: 'Declared end (UTC)', render: (row) => instantLabel(row.deployment.expectedEndAt) },
            { label: 'Overrun', render: (row) => badge(durationLabel(row.overrunMinutes), 'warn') },
            { label: 'Line holder(s)', render: (row) => row.lines.map((line) => (report.detailed ? line.name : 'withheld')).join(', ') || 'none active' },
          ],
          rows: report.rows.filter((row) => row.state.key === 'overran'),
          caption: 'Unclosed overruns',
        })
        : emptyState({ title: 'Nothing is past its declared end', body: 'Every open deployment is still inside the span it was declared to.' }),
    }),
    report.declaringLineGoneN
      ? banner({
        tone: 'caution',
        title: `${report.declaringLineGoneN} open deployment(s) whose declaring line no longer holds the person`,
        body: 'The deployment was declared by a hand that has since stopped holding this person. The record keeps naming it, because “who sent them out” is a historical fact — but the duty now sits with the lines that hold them today, which is why the ask goes to the joint seat above those.',
      })
      : null,
  );
}

function historyView(report) {
  const closed = report.closedRows;
  const escalations = report.escalations
    .slice()
    .sort((a, b) => String(b.raisedAt).localeCompare(String(a.raisedAt)) || String(a.id).localeCompare(String(b.id)))
    .slice(0, L.rowsShown);
  return h('div', { class: 'stack' },
    card({
      title: 'Closed deployments',
      subtitle: 'A close-out names what happened. A close with no contact on the record is its own state and is never read as a confirmation of welfare.',
      body: closed.length
        ? table({
          columns: [
            { label: 'Person', render: (row) => (report.detailed ? (row.personName || 'Not on the graph') : 'withheld') },
            { label: 'Where', render: (row) => row.deployment.siteRef },
            { label: 'Started (UTC)', render: (row) => instantLabel(row.deployment.startAt) },
            { label: 'Closed (UTC)', render: (row) => instantLabel(row.deployment.closedAt) },
            { label: 'Contacts', render: (row) => String(row.contactsN) },
            { label: 'State', render: (row) => stateBadge(row.state) },
            { label: 'Close overrun', render: (row) => (row.closeOverrunMinutes > 0 ? badge(`${durationLabel(row.closeOverrunMinutes)} past end`, 'warn') : '—') },
            { label: 'Closed by the deployed person', render: (row) => (row.selfClosed ? badge('yes', 'warn') : 'no') },
          ],
          rows: closed.slice(0, L.rowsShown),
          caption: 'Closed deployments',
          emptyMessage: 'No deployment has been closed out yet.',
        })
        : emptyState({ title: 'No deployment has been closed out yet', body: 'Nothing has ended, which is either because nothing ran or because nobody ended it.' }),
    }),
    card({
      title: 'Escalation ledger',
      subtitle: 'Who raised a welfare escalation, on what basis, and what it actually did. A confirmation recorded here clears the state but never the minutes that were late.',
      body: escalations.length
        ? table({
          columns: [
            { label: 'Raised (UTC)', render: (row) => instantLabel(row.raisedAt) },
            { label: 'Deployment', render: (row) => (report.detailed ? row.deployment.siteRef : 'withheld') },
            { label: 'Basis', key: 'basis' },
            { label: 'Outcome', key: 'outcome' },
            { label: 'What was done', render: (row) => h('span', { class: 'small' }, row.detail) },
          ],
          rows: escalations,
          caption: 'Escalations, newest first',
          emptyMessage: 'No welfare escalation has ever been recorded. That is either because no check ever lapsed — or because nobody wrote it down.',
        })
        : emptyState({ title: 'No escalation has been recorded', body: 'A silent register is not a safe one; it means no lapse has been recorded, which is not the same as no lapse.' }),
    }),
  );
}

function methodView(report) {
  return h('div', { class: 'stack' },
    card({
      title: 'What this register is, and what it refuses to be',
      body: h('div', { class: 'stack' },
        h('img', {
          src: DIAGRAM_URL,
          alt: 'A method figure showing a lone deployment declared against a written assessment, a check-in interval and grace running from the last contact, the exact deadline, the states that follow a missed contact, and the joint reporting seat that owes the response — with the register refusing to say a person is missing.',
          class: 'method-figure',
        }),
        kv('Engine', LWK_METHOD.engine),
        kv('Decision record', LWK_METHOD.adr),
        kv('As at', `${report.asOf} (${report.nowIso})`),
        h('h3', null, 'Frameworks applied'),
        h('ul', null, ...LWK_METHOD.frameworks.map((line) => h('li', null, line))),
        h('h3', null, 'What is printed'),
        h('ul', null, ...LWK_METHOD.printed.map((line) => h('li', null, line))),
        h('h3', null, 'Deliberately absent'),
        h('ul', null, ...LWK_METHOD.deliberatelyAbsent.map((line) => h('li', null, line))),
        h('h3', null, 'Disclosure'),
        banner({ tone: 'caution', title: 'A rendering contract, not an authentication boundary', body: 'Seats in this workspace are workflow declarations, not logins. The reader withholds person-level rows above rank 3, and this page says so rather than implying a permission system the workspace cannot enforce.' }),
      ),
    }),
  );
}

/* --------------------------------------------------------------------- page */

export function renderLoneWorking(ctx) {
  const view = ctx.query?.get?.('view') || 'now';
  let report;
  try {
    const result = ctx.api.loneWorkingReport();
    if (!result?.ok) {
      return h('div', { class: 'stack' },
        pageHeader({ eyebrow: 'Operations · lone working', title: 'Lone working', subtitle: 'Who is alone, when they were last heard from, and whether welfare is confirmed.' }),
        banner({ tone: 'bad', title: 'The register could not be read', body: result?.error || 'The seat could not be resolved.' }));
    }
    report = result.report;
  } catch (error) {
    return h('div', { class: 'stack' },
      pageHeader({ eyebrow: 'Operations · lone working', title: 'Lone working' }),
      banner({ tone: 'bad', title: 'The register could not be read', body: error?.message || 'Unknown error.' }));
  }

  let candidates = [];
  try {
    const result = ctx.api.loneWorkingCandidates();
    if (result?.ok) candidates = result.people;
  } catch { candidates = []; }

  const onDone = () => {
    document.dispatchEvent(new CustomEvent('leados:navigate', { detail: { route: LWK_HREF } }));
    ctx.rerender?.();
  };
  const local = { api: ctx.api, candidates };

  const exportCsv = () => {
    try {
      const file = exportWorkspaceCsv(ctx.api.getState ? ctx.api.getState() : ctx.state, LWK_CSV_SCOPE);
      if (!file?.ok) { toast(file?.error || 'The export produced no file.', 'bad'); return; }
      downloadText(file.filename, file.csv, 'text/csv');
      toast('Exported. Counts and exact minute totals only: no person, manager, site, task, reference or instant crosses this boundary.', 'good');
    } catch (error) {
      toast(error?.message || 'The export failed.', 'bad');
    }
  };

  const header = pageHeader({
    eyebrow: 'Operations · lone working',
    title: 'Lone working',
    subtitle: 'Who is working alone right now, when they were last heard from, what the record proves at this minute, whose duty the response is — and what nobody has said yet.',
    actions: [
      { label: 'Declare a lone deployment', onClick: () => declareDialog(local, report, candidates, onDone), primary: true },
      { label: 'Export (counts)', onClick: exportCsv },
      { label: 'Conventions', onClick: () => conventionsDialog(local, report, onDone) },
    ],
    meta: [
      `As at ${report.asOf}`,
      `${report.totals.open} open · ${report.totals.people} person(s)`,
      `${report.totals.checkins} contact(s) recorded`,
      report.detailed ? 'names shown' : 'counts only at this altitude',
    ],
  });

  const body = h('div', { class: 'stack' },
    summaryCard(report),
    claimsBanners(report),
    tabs({ items: VIEWS, active: VIEWS.some((row) => row.key === view) ? view : 'now', onSelect: (key) => { window.location.hash = `${LWK_HREF}?view=${key}`; }, ariaLabel: 'Lone-working sections' }),
    view === 'lines' ? linesView(report)
      : view === 'history' ? historyView(report)
        : view === 'method' ? methodView(report)
          : openTable(local, report, onDone),
    report.warnings.length
      ? card({
        title: 'Unreadable rows, counted and refused',
        subtitle: 'Nothing here was repaired: a stored row this register cannot read exactly is dropped with a count rather than guessed at.',
        body: h('ul', null, ...report.warnings.slice(0, 20).map((line) => h('li', { class: 'small' }, line))),
      })
      : null,
  );

  return h('div', { class: 'stack' }, header, body);
}
