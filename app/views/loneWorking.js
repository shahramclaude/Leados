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
import { serializeCsv } from '../core/csv.js';
import { loneWorkingCsvRows } from '../core/domain/loneWorkingReport.js';
import {
  LWK_CHANNELS,
  LWK_CHECKIN_OUTCOMES,
  LWK_CLOSE_OUTCOMES,
  LWK_CHRONOLOGY_LABELS,
  LWK_CSV_COLUMNS,
  LWK_CSV_DESCRIPTOR,
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
const localInput = (iso) => (typeof iso === 'string' && iso.endsWith('Z') ? iso.slice(0, -1) : '');

function button(label, onClick, { primary = false, testid = null } = {}) {
  return h('button', {
    type: 'button',
    class: `btn btn-small ${primary ? 'btn-primary' : 'btn-ghost'}`,
    ...(testid ? { 'data-testid': testid } : {}),
    onClick,
  }, label);
}

function formFooter(label, submit) {
  return [button('Cancel', closeAllModals), button(label, submit, { primary: true })];
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
    { name: 'intervalMinutes', label: 'Check-in interval (whole minutes)', type: 'number', min: L.intervalMin, max: L.intervalMax, required: true, help: `Between ${L.intervalMin} and ${L.intervalMax}. This is the number the whole register runs on.` },
    { name: 'graceMinutes', label: 'Grace before it is overdue (whole minutes)', type: 'number', min: 0, max: L.graceMax, required: true, help: `Between 0 and ${L.graceMax}. Zero is legitimate — “ring immediately”.` },
    { name: 'startAt', label: 'Starts (stored instant, UTC)', type: 'datetime-local', step: 0.001, required: true, value: nowInput },
    { name: 'expectedEndAt', label: 'Declared end (stored instant, UTC)', type: 'datetime-local', step: 0.001, required: true },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.loneWorkingDeclareDeployment(values);
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The deployment was refused.', 'bad');
      return;
    }
    closeAllModals();
    if (!result.saved) toast('Recorded in memory only. The workspace storage refused the save.', 'bad');
    else toast('Deployment declared. Check-ins run from the recorded start.', 'good');
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
    footer: formFooter('Declare deployment', submit),
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
    { name: 'at', label: 'Instant of contact (stored instant, UTC)', type: 'datetime-local', step: 0.001, required: true, value: localInput(new Date().toISOString()) },
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
    footer: formFooter('Record contact', submit),
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
    { name: 'raisedAt', label: 'Instant the escalation was raised (stored instant, UTC)', type: 'datetime-local', step: 0.001, required: true, value: localInput(new Date().toISOString()) },
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
    footer: formFooter('Record escalation', submit),
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
    { name: 'at', label: 'Actual close time (UTC)', type: 'datetime-local', step: 0.001, required: true, help: 'Use the supported actual time, not the planned end. It must not precede a logged check-in or escalation.' },
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
    if (!result.saved) toast('Close recorded in memory only. The workspace storage refused the save.', 'bad');
    else toast('Actual close recorded. Review chronology in History.', 'good');
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
    footer: formFooter('Close deployment', submit),
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
    footer: formFooter('Set conventions', submit),
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
        ? 'No unresolved person or unreadable source was reported for this reading'
        : 'NOT CERTIFIED — the register could not see the whole picture',
      body: report.figuresComplete
        ? 'This is a coverage check of the readable workspace, not proof the activity log is complete or conflict-free.'
        : report.incompleteReasons.join(' '),
    }),
    banner({
      tone: 'info',
      title: 'This register does not monitor or dispatch',
      body: 'It records what people enter, not where anybody is. Use your site’s contact and emergency procedures; this local audit is not a welfare clearance.',
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
            render: (row) => row.deployment.closedAt ? 'Review the future-dated close in History' : h('div', { class: 'row-actions' },
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

function historyCallout({ chronology }) {
  if (!chronology.findingsN && !chronology.sourceIncomplete) return null;
  return banner({ tone: 'caution', title: 'Review the deployment chronology',
    body: h('span', null, `${chronology.findingsN} finding(s) on readable records. `,
      h('a', { href: `${LWK_HREF}?view=history` }, 'Open History')),
  });
}

const exactTime = (value) => h('time', { datetime: value }, value);

function windowCell(span) {
  return h('div', { class: 'stack compact' },
    h('div', null, span.siteRef, h('span', { class: 'muted small' }, ` · ${span.id}`)),
    h('div', null, 'Start: ', exactTime(span.startAt)),
    span.usedRecordedClose
      ? h('div', null, 'Recorded close: ', exactTime(span.recordedCloseAt))
      : h('div', null, 'Expected end: ', exactTime(span.expectedEndAt),
        h('div', { class: 'small' }, span.recordedCloseAt
          ? ['Recorded close not used: ', exactTime(span.recordedCloseAt)] : 'No close recorded')),
  );
}

function chronologyCard({ chronology: audit, nowIso, detailed, scoped }) {
  const hist = `${LWK_HREF}?view=history`;
  const { page, pages, firstFinding, lastFinding } = audit;
  const review = audit.findingsN ? 'Review required'
    : audit.sourceIncomplete ? 'Chronology not established'
      : audit.deploymentsN ? 'No findings on readable records' : 'No deployments to compare';
  return card({
    title: 'Deployment chronology',
    subtitle: `Review time ${nowIso} · ${scoped ? 'people in current reporting scope' : 'local operator’s register'}. Checks records, not whereabouts or welfare.`,
    body: h('div', { class: 'stack', 'data-testid': 'lwk-chronology' },
      h('p', null, h('strong', null, review), ' · ',
        h('span', { 'data-testid': 'lwk-chronology-total' }, String(audit.findingsN)), ' finding(s) on ',
        h('span', { 'data-testid': 'lwk-chronology-reviewed' }, String(audit.deploymentsN)), ' readable deployment(s).'),
      h('ul', null, ...Object.entries(LWK_CHRONOLOGY_LABELS).map(([kind, label]) => h('li', null, `${label}: `,
        h('span', { 'data-testid': `lwk-chronology-${kind}` }, String(audit.counts[kind]))))),
      h('p', { class: 'muted small' }, 'One finding per conflicting pair or flagged event. Counts can include several findings on one deployment. A planned end does not prove a return. Close at next start is allowed when both records support it.'),
      audit.sourceIncomplete ? banner({ tone: 'caution', title: 'Source coverage not established',
        body: 'Some inputs were refused. Counts describe readable evidence only and cannot rule out additional findings.' }) : null,
      !detailed ? h('p', { class: 'muted' }, 'Only counts are available at this altitude.')
        : !audit.findingsN ? null : h('div', { class: 'stack' },
          audit.findings.length ? table({
            caption: 'Chronology findings',
            columns: [
              { label: 'Finding', render: (row) => h('div', null, LWK_CHRONOLOGY_LABELS[row.kind], h('div', { class: 'small' }, row.personName || 'Person not on the reporting graph')) },
              { label: 'Deployment', render: (row) => windowCell(row.first) },
              { label: 'Compared with', render: (row) => row.second ? windowCell(row.second)
                : h('div', null, `${row.event}: `, exactTime(row.eventAt), row.eventId ? ` · ${row.eventId}` : '') },
              { label: 'Exact evidence (UTC)', render: (row) => row.overlapMs > 0
                ? h('div', null, h('strong', { 'data-testid': 'lwk-overlap-ms' }, `${row.overlapMs} ms`),
                  h('div', null, exactTime(row.from), ' to ', exactTime(row.to)))
                : row.kind === 'separation-unproved' ? 'Cannot measure overlap without a supported close.'
                  : row.kind === 'after-close' ? 'This act is kept on the record but not used by the welfare clock.'
                    : 'Not yet usable as past evidence.' },
            ],
            rows: audit.findings.map((row) => ({ ...row, attrs: { 'data-kind': row.kind } })),
          }) : h('p', null, 'This page is outside the current findings. ', h('a', { href: hist }, 'Return to the first page')),
          audit.findings.length ? h('nav', { class: 'row-actions', 'aria-label': 'Chronology finding pages' },
            page > 1 ? h('a', { class: 'btn btn-small', href: `${hist}&page=${page - 1}` }, 'Previous findings') : null,
            h('span', { class: 'small' }, `Showing ${firstFinding}–${lastFinding} of ${audit.findingsN}`),
            page < pages ? h('a', { class: 'btn btn-small', href: `${hist}&page=${page + 1}` }, 'Next findings') : null) : null,
          h('p', null, 'Check the source log. If an open deployment really ended, ', h('a', { href: LWK_HREF }, 'record its actual close in Now'),
            '. Do not enter an estimated close or change history to remove a finding.'),
        ),
    ),
  });
}

function historyView(report) {
  const closed = report.closedRows;
  const deployments = new Map(report.deployments.map((entry) => [entry.id, entry]));
  const escalations = report.escalations
    .slice()
    .sort((a, b) => String(b.raisedAt).localeCompare(String(a.raisedAt)) || String(a.id).localeCompare(String(b.id)))
    .slice(0, L.rowsShown);
  return h('div', { class: 'stack' },
    chronologyCard(report),
    card({
      title: 'Closed deployments',
      subtitle: `Showing ${Math.min(closed.length, L.rowsShown)} of ${closed.length} recorded closes, newest-start first. A close is not confirmation of welfare.`,
      body: closed.length
        ? table({
          columns: [
            { label: 'Person', render: (row) => (report.detailed ? (row.personName || 'Not on the graph') : 'withheld') },
            { label: 'Where', render: (row) => row.deployment.siteRef },
            { label: 'Started (UTC)', render: (row) => instantLabel(row.deployment.startAt) },
            { label: 'Closed (UTC)', render: (row) => instantLabel(row.deployment.closedAt) },
            { label: 'In-window contacts', render: (row) => String(row.contactsN) },
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
      subtitle: `Showing ${escalations.length} of ${report.escalations.length} recorded escalations, newest first. An act outside the deployment window is not used by the welfare clock.`,
      body: escalations.length
        ? table({
          columns: [
            { label: 'Raised (UTC)', render: (row) => instantLabel(row.raisedAt) },
            { label: 'Deployment', render: (row) => deployments.get(row.deploymentId)?.siteRef || 'Not on this reading' },
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
          alt: 'A worker returns a radio at the staffed sign-out desk while the supervisor records the return in a log.',
          width: 768, height: 512, loading: 'lazy', class: 'method-figure',
        }),
        h('p', { class: 'muted small' }, 'Illustration of recording a return. It is not a workplace record or evidence of a close.'),
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
    const result = ctx.api.loneWorkingReport({ chronologyPage: view === 'history' ? Number(ctx.query?.get?.('page') || 1) : 1 });
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
    const result = report.detailed ? ctx.api.loneWorkingCandidates() : null;
    if (result?.ok) candidates = result.people;
  } catch { candidates = []; }

  const onDone = () => {
    document.dispatchEvent(new CustomEvent('leados:navigate', { detail: { route: view === 'history' ? `${LWK_HREF}?view=history` : LWK_HREF } }));
    ctx.rerender?.();
  };
  const local = { api: ctx.api, candidates };

  const exportCsv = () => {
    try {
      // Use the displayed, seat-scoped report and its review instant. The generic
      // projected store contains no raw lone-working rows by design.
      const text = serializeCsv(LWK_CSV_COLUMNS, loneWorkingCsvRows(report));
      const filename = `leados-${LWK_CSV_DESCRIPTOR.filenameSlug}-${report.asOf}.csv`;
      if (downloadText({ filename, text, mime: 'text/csv' })) return;
      openModal({ title: 'Lone-working aggregate CSV', description: 'This environment could not start a download. Copy the report below.',
        body: h('textarea', { 'aria-label': 'Lone-working aggregate CSV', readonly: true, rows: 10, class: 'input' }, text),
        footer: [button('Done', closeAllModals)],
      });
    } catch (error) {
      toast(error?.message || 'The export failed.', 'bad');
    }
  };

  const header = pageHeader({
    eyebrow: 'Operations · lone working',
    title: 'Lone working',
    subtitle: 'Who is working alone right now, when they were last heard from, what the record proves at this minute, whose duty the response is — and what nobody has said yet.',
    actions: [
      ...(report.detailed ? [button('Declare a lone deployment', () => declareDialog(local, report, candidates, onDone), { primary: true }),
        button('Conventions', () => conventionsDialog(local, report, onDone))] : []),
      button('Export (counts)', exportCsv),
    ],
    meta: [
      `As at ${report.asOf}`,
      `${report.totals.open} open · ${report.totals.people} person(s)`,
      `${report.totals.checkins} contact(s) recorded`,
      report.detailed ? (report.scoped ? 'current reporting scope' : 'local operator · whole register') : 'counts only at this altitude',
    ],
  });

  const body = h('div', { class: 'stack' },
    summaryCard(report),
    claimsBanners(report),
    tabs({ items: VIEWS, active: VIEWS.some((row) => row.key === view) ? view : 'now', onSelect: (key) => { window.location.hash = `${LWK_HREF}?view=${key}`; }, ariaLabel: 'Lone-working sections' }),
    view === 'method' ? methodView(report)
      : view === 'history' ? (report.detailed ? historyView(report) : chronologyCard(report))
        : h('div', { class: 'stack' },
          historyCallout(report),
          report.detailed && (view === 'lines' ? linesView(report) : openTable(local, report, onDone))),
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
