/**
 * app/views/authorisations.js — `#/authorisations`, the Statutory Authorisation &
 * Licence-to-Operate Register (ADR-0247, Schema v201).
 *
 * ONE reader (`buildAuthorisations`) stands behind every state, effective expiry,
 * lapsed minute, day to expiry, condition verdict, regulator action, renewal
 * position and count this page prints. The page formats what the reader returned;
 * it computes no expiry, no lapse and no verdict of its own.
 *
 * THE FIVE THINGS THIS SCREEN KEEPS APART
 *  - whether an authority is IN FORCE, inside its renewal window, lapsed, not yet in
 *    force, suspended, revoked or prohibited BY A NOTICE — seven different facts;
 *  - whether a renewal was SUBMITTED or DECIDED, and that only a decision extends;
 *  - whether each declared CONDITION is evidenced, stale or unevidenced — never a
 *    blanket “compliant”;
 *  - whether a regulator action still STANDS, what day it set, and how it closed;
 *  - whose duty it is: every accountable hand, every active line holding each of
 *    them, and the joint seat above them all.
 *
 * WHAT THE SCREEN REFUSES TO SAY. It does not say a site is operating unlawfully
 * because its authority lapsed: the record proves the lapse and cannot prove what
 * happened on the ground. It prints that sentence beside the state. It never scores
 * a site, a person or a line.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table, kv } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { exportWorkspaceCsv } from '../core/csv.js';
import {
  LTO_ACTION_KINDS,
  LTO_ACTION_KIND_BY_KEY,
  LTO_CSV_SCOPE,
  LTO_HREF,
  LTO_LIMITS,
  LTO_METHOD,
  LTO_RENEWAL_DECISIONS,
  LTO_SECTION_TITLES,
} from '../core/domain/authorisationRegistry.js';
import { dayLabel, durationLabel } from '../core/domain/authorisationMath.js';

const L = LTO_LIMITS;
const DIAGRAM_URL = './app/assets/statutory-authorisation-method.jpg';
const VIEWS = [
  { key: 'register', label: LTO_SECTION_TITLES.register },
  { key: 'conditions', label: LTO_SECTION_TITLES.conditions },
  { key: 'actions', label: LTO_SECTION_TITLES.actions },
  { key: 'method', label: LTO_SECTION_TITLES.method },
];

const TONE = { bad: 'bad', warn: 'warn', good: 'good', neutral: 'neutral' };
const options = (rows, { blank = null } = {}) => [
  ...(blank ? [{ value: '', label: blank }] : []),
  ...rows.map((row) => ({ value: row.value, label: row.label })),
];

/** A stored instant, printed as the record stores it. The header says it is UTC. */
const instantLabel = (value) => (typeof value === 'string' && value.length >= 16 ? `${value.slice(0, 10)} ${value.slice(11, 16)}` : '—');
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
    'data-testid': `lto-state-${state.key}`,
  }, state.label);
}

function conditionBadge(state) {
  return h('span', {
    class: `badge badge-${TONE[state.tone] || 'neutral'}`,
    title: state.says,
    'data-testid': `lto-condition-${state.key}`,
  }, state.label);
}

const authorityLabel = (authorisation) => `${authorisation.siteRef} — ${authorisation.activityRef}`;

/* ------------------------------------------------------------------ dialogs */

function declareDialog(ctx, report, candidates, onDone) {
  const form = buildForm([
    { name: 'siteRef', label: 'Site or location', type: 'text', required: true, help: `At least ${L.shortMin} characters. The site this authority covers — one record per site per instrument.` },
    { name: 'activityRef', label: 'Activity the authority permits', type: 'text', required: true, help: `At least ${L.shortMin} characters. “Tanker loading, day shift” rather than “operations”.` },
    { name: 'issuingAuthority', label: 'Issuing body', type: 'text', required: true, help: 'The regulator, council or board that granted it.' },
    { name: 'instrumentRef', label: 'Written instrument', type: 'text', required: true, help: `At least ${L.instrumentMin} characters: reference, number and revision. An authority with no instrument is refused.` },
    { name: 'grantedAt', label: 'Granted (stored instant, UTC)', type: 'datetime-local', required: true, value: localInput(report.nowIso) },
    { name: 'expiresAt', label: 'Expires (stored instant, UTC)', type: 'datetime-local', required: true },
    { name: 'renewalLeadDays', label: 'Renewal lead (whole days before expiry)', type: 'number', min: 0, max: L.leadDaysMax, required: true, value: 90, help: `Between 0 and ${L.leadDaysMax}. This is when the register says the next responsible start has arrived — you declare it, the workspace never defaults it.` },
    {
      name: 'accountableIds', label: 'Accountable hands (one to four)', type: 'boolean-block', required: true,
      options: candidates.map((row) => ({ value: row.id, label: `${row.name}${row.role ? ` — ${row.role}` : ''}` })),
      help: 'Every hand answerable for this authority, across every reporting line. The ask goes above ALL of them, so name all of them.',
    },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.authorisationDeclare({
      ...values,
      renewalLeadDays: Number(values.renewalLeadDays),
      accountableIds: values.accountableIds,
    });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The authority was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Authority declared on its written instrument. Its state is derived from the grant, expiry, conditions, actions and renewals — never typed.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Declare a statutory authority',
    description: 'The power to operate, the instrument it was granted on, when it expires, when renewal work must start, and who answers for it.',
    size: 'lg',
    body: h('div', { class: 'stack' },
      banner({
        tone: 'caution',
        title: 'No status is stored',
        body: 'Every state on the register — in force, expiring, lapsed, suspended, revoked, prohibited — is computed from dated acts. A status somebody can type is a status that can lie; this register has no field for one.',
      }),
      form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Declare authority', onClick: submit, primary: true }],
  });
}

function conditionDialog(ctx, report, onDone) {
  const authorities = report.rows.map((row) => ({ value: row.authorisation.id, label: authorityLabel(row.authorisation) }));
  const form = buildForm([
    { name: 'authorisationId', label: 'Authority', type: 'select', required: true, options: options(authorities, { blank: 'Choose an authority' }) },
    { name: 'conditionKey', label: 'Condition key', type: 'text', required: true, help: 'A short stable key — e.g. bund-inspection — so evidence is never attached to the wrong window.' },
    { name: 'conditionRef', label: 'The condition, as the instrument states it', type: 'textarea', required: true, rows: 3, help: `At least ${L.textMin} characters. Quote the condition; “comply with the conditions” is not one.` },
    { name: 'maxAgeDays', label: 'Re-evidence window (whole days; 0 = none)', type: 'number', min: 0, max: L.conditionMaxAgeDays, required: true, value: 0, help: `Between 0 and ${L.conditionMaxAgeDays}. This window is the condition’s own; the workspace never infers one from the instrument type.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.authorisationDeclareCondition({ ...values, maxAgeDays: Number(values.maxAgeDays) });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The condition was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Condition declared. It reads “no evidence” until dated evidence is recorded against it — never “met” because the licence exists.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Declare a licence condition',
    description: 'One condition broken out from the instrument, with its own re-evidence window.',
    body: h('div', { class: 'stack' }, form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Declare condition', onClick: submit, primary: true }],
  });
}

function evidenceDialog(ctx, report, presetConditionId, onDone) {
  const conditions = report.rows.flatMap((row) => row.conditionRows.map((condition) => ({
    value: condition.condition.id,
    label: `${authorityLabel(row.authorisation)} — ${condition.condition.conditionKey}`,
  })));
  const form = buildForm([
    { name: 'conditionId', label: 'Condition', type: 'select', required: true, options: options(conditions, { blank: 'Choose a condition' }), value: presetConditionId || '' },
    { name: 'evidenceRef', label: 'Evidence reference', type: 'text', required: true, help: `At least ${L.instrumentMin} characters: a report, certificate or inspection record reference. The register stores the reference, never the document.` },
    { name: 'at', label: 'Evidence dated (stored instant, UTC)', type: 'datetime-local', required: true, value: localInput(report.nowIso) },
    { name: 'note', label: 'Note', type: 'textarea', rows: 2, help: 'Optional. What the evidence shows, in your words.' },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.authorisationRecordEvidence(values);
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The evidence was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Evidence recorded against the condition. It is dated, so its age is computed against the condition’s own window.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Record condition evidence',
    description: 'A dated reference that something was actually done — not a tick, and not the certificate itself.',
    body: h('div', { class: 'stack' }, form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record evidence', onClick: submit, primary: true }],
  });
}

function actionDialog(ctx, report, onDone) {
  const authorities = report.rows.map((row) => ({ value: row.authorisation.id, label: authorityLabel(row.authorisation) }));
  const form = buildForm([
    { name: 'authorisationId', label: 'Authority', type: 'select', required: true, options: options(authorities, { blank: 'Choose an authority' }) },
    { name: 'kind', label: 'Kind of action', type: 'select', required: true, options: options(LTO_ACTION_KINDS.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose a kind' }), help: 'A prohibition stops an activity; a suspension takes the authority away until lifted; a revocation is terminal.' },
    { name: 'servedAt', label: 'Served (stored instant, UTC)', type: 'datetime-local', required: true, value: localInput(report.nowIso), help: 'Cannot be in the future: the register records what a regulator did.' },
    { name: 'effectiveFrom', label: 'Effective from (stored instant, UTC)', type: 'datetime-local', required: true, help: 'May be ahead of today. The action does not stand until this instant.' },
    { name: 'noticeRef', label: 'Notice reference', type: 'text', help: 'Optional. The regulator’s own reference for the notice.' },
    { name: 'scopeRef', label: 'Activity or plant the notice names', type: 'text', help: 'Optional. Where the notice restricts only part of the activity, name that part.' },
    { name: 'dueOn', label: 'Compliance day (improvement notices)', type: 'date', help: 'Required for an improvement notice: the day the notice itself set.' },
    { name: 'basisRef', label: 'Written basis', type: 'textarea', rows: 3, required: true, help: `At least ${L.textMin} characters, in the regulator’s own terms. A notice with no stated basis cannot be answered.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.authorisationRecordAction(values);
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The action was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Regulator action recorded. Its standing is derived at every read, and it stays standing until a dated close with its own basis.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Record a regulator action',
    description: 'What the regulator did, when it was served, when it takes effect and the basis it gave.',
    size: 'lg',
    body: h('div', { class: 'stack' }, form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record action', onClick: submit, primary: true }],
  });
}

function closeActionDialog(ctx, actionRow, onDone) {
  const definition = LTO_ACTION_KIND_BY_KEY[actionRow.action.kind];
  const form = buildForm([
    { name: 'closeKind', label: 'How it ended', type: 'select', required: true, options: options((definition?.closeKinds || []).map((key) => ({ value: key, label: key })), { blank: 'Choose a close' }), help: `This kind of action permits: ${(definition?.closeKinds || []).join(', ') || 'no close'}.` },
    { name: 'closedAt', label: 'Closed (stored instant, UTC)', type: 'datetime-local', required: true },
    { name: 'closeBasisRef', label: 'Basis of the close', type: 'textarea', rows: 3, required: true, help: `At least ${L.textMin} characters: the compliance evidence reference or the regulator’s written withdrawal.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.authorisationCloseAction({ actionId: actionRow.action.id, ...values });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The close was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Action closed with its basis. A revocation can never be closed this way; only a new declaration restores a power to operate.', 'good');
    onDone?.();
  };
  openModal({
    title: `Close a ${definition?.label?.toLowerCase() || 'regulator action'}`,
    description: 'A close names what ended the action and the written basis for saying so.',
    body: h('div', { class: 'stack' },
      banner({ tone: 'caution', title: 'Closing is not editing history', body: 'The action stays on the record exactly as it was served. The close adds a dated fact; it does not make the notice not have happened.' }),
      form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Close action', onClick: submit, primary: true }],
  });
}

function renewalDialog(ctx, report, onDone) {
  const authorities = report.rows.map((row) => ({
    value: row.authorisation.id,
    label: `${authorityLabel(row.authorisation)} — effective expiry ${instantLabel(row.effectiveExpiresAt)}`,
  }));
  const form = buildForm([
    { name: 'authorisationId', label: 'Authority', type: 'select', required: true, options: options(authorities, { blank: 'Choose an authority' }) },
    { name: 'submittedAt', label: 'Submitted (stored instant, UTC)', type: 'datetime-local', required: true, value: localInput(report.nowIso) },
    { name: 'basisRef', label: 'What was submitted, and where', type: 'textarea', rows: 3, required: true, help: `At least ${L.textMin} characters: the application reference and the route.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.authorisationSubmitRenewal(values);
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The renewal was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Renewal submitted. It does NOT extend the authority: the state stays exactly where the expiry puts it until a decision is recorded.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Submit a renewal',
    description: 'A submission is a dated act with a written basis. Only a decision changes the expiry.',
    body: h('div', { class: 'stack' }, form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Submit renewal', onClick: submit, primary: true }],
  });
}

function decideRenewalDialog(ctx, row, authority, onDone) {
  const form = buildForm([
    { name: 'decision', label: 'Decision', type: 'select', required: true, options: options(LTO_RENEWAL_DECISIONS.map((item) => ({ value: item.key, label: item.label })), { blank: 'Choose a decision' }) },
    { name: 'decidedAt', label: 'Decided (stored instant, UTC)', type: 'datetime-local', required: true },
    { name: 'grantedExpiresAt', label: 'New expiry (granted only)', type: 'datetime-local', help: `Must be strictly after the effective expiry of ${instantLabel(authority.effectiveExpiresAt)} and after the decision instant. A refused renewal takes no expiry.` },
    { name: 'note', label: 'Reason on the record', type: 'textarea', rows: 3, required: true, help: `At least ${L.textMin} characters. A decision with no reason cannot be reviewed or defended.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.authorisationDecideRenewal({ renewalId: row.id, ...values });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The decision was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Renewal decided. The effective expiry is recomputed from the record on every read.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Decide a renewal',
    description: 'Granted with a new expiry, or refused with a reason. Nothing else.',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'A grant must extend', body: `The effective expiry at this instant is ${instantLabel(authority.effectiveExpiresAt)}. A “new” expiry on or before it would shorten validity, and the door refuses it.` }),
      form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record decision', onClick: submit, primary: true }],
  });
}

function conventionsDialog(ctx, report, onDone) {
  const conv = report.conventions;
  const form = buildForm([
    { name: 'ltoPrivacyFloor', label: 'Privacy floor for per-state exports', type: 'number', min: 2, max: 20, required: true, value: conv.ltoPrivacyFloor, help: 'A per-state count below this floor is exported BLANK with its reason, never as a small number.' },
    { name: 'ltoHorizonDays', label: 'Planning horizon (days)', type: 'number', min: 1, max: 365, required: true, value: conv.ltoHorizonDays, help: 'How far ahead this register will accept a declared grant or effective instant.' },
    { name: 'ltoAutoPropagate', label: 'The rule may file dated asks', type: 'checkbox', value: conv.ltoAutoPropagate !== false, checkboxLabel: 'ON — a pause is a pause that hides a lapsed consent from the seat that owes the answer', help: 'Pause-governed on every path, including the explicit scan.' },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.authorisationSetConventions({
      ltoPrivacyFloor: Number(values.ltoPrivacyFloor),
      ltoHorizonDays: Number(values.ltoHorizonDays),
      ltoAutoPropagate: Boolean(values.ltoAutoPropagate),
    });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The conventions were refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Conventions re-declared.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Register conventions',
    description: 'Three declared switches. None of them is a validity, a lead time or a condition window — those are declared per authority.',
    body: h('div', { class: 'stack' }, form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Save conventions', onClick: submit, primary: true }],
  });
}

/* ------------------------------------------------------------------- panels */

function summaryCard(report) {
  const t = report.totals;
  return card({
    title: 'What the register holds at this instant',
    subtitle: 'Every figure is derived on read from dated grants, expiries, conditions, evidence, regulator actions and renewals. No status is stored, and a lapse is never upgraded into an allegation about what happened on site.',
    body: h('div', { class: 'stat-grid' },
      stat({ label: 'Authorities held', value: h('span', { 'data-testid': 'lto-count-authorisations' }, String(t.authorisations)), hint: `${t.holders} accountable hand(s) · ${t.linesN} line(s)` }),
      stat({ label: 'In force', value: h('span', { 'data-testid': 'lto-count-inforce' }, String(t.inForce)), hint: `${t.notYetGranted} not yet in force` }),
      stat({ label: 'Inside renewal window', value: h('span', { 'data-testid': 'lto-count-expiring' }, String(t.expiring)), hint: `${t.renewalInFlight} renewal(s) in flight` }),
      stat({ label: 'Lapsed', value: h('span', { 'data-testid': 'lto-count-lapsed' }, String(t.lapsed + t.lapsedAwaiting)), hint: `${t.lapsedMinutesTotal} whole minute(s) lapsed · ${t.noStopRecordedN} with no stop recorded` }),
      stat({ label: 'Suspended', value: h('span', { 'data-testid': 'lto-count-suspended' }, String(t.suspended)), hint: 'not in force until lifted' }),
      stat({ label: 'Prohibited by notice', value: h('span', { 'data-testid': 'lto-count-prohibited' }, String(t.prohibited)), hint: `${t.improvementOpen} improvement notice(s) open` }),
      stat({ label: 'Conditions unevidenced', value: h('span', { 'data-testid': 'lto-count-unevidenced' }, String(t.conditionsUnevidenced)), hint: `${t.conditionsStale} stale · ${t.conditions} declared` }),
      stat({ label: 'Your attention', value: h('span', { 'data-testid': 'lto-count-attention' }, String(report.attention.total)), hint: 'lapsed, suspended, revoked, prohibited, expiring, overdue' }),
    ),
  });
}

function claimsBanners(report) {
  const parts = report.balances.statesReconcile && report.balances.conditionsReconcile && report.balances.evidenceReconcile
    && report.balances.actionsReconcile && report.balances.renewalsReconcile;
  return h('div', { class: 'stack' },
    banner({
      tone: parts ? 'info' : 'bad',
      title: parts
        ? 'The parts re-add: every state, condition, evidence row, action and renewal ties to the record it summarises'
        : 'The printed counts do NOT re-add to the rows they summarise',
      body: `States ${report.stateTotal} of ${report.totals.authorisations} authorit(ies) · ${report.totals.conditions} condition(s) · ${report.totals.actions} regulator action(s) · ${report.totals.renewalSubmitted} renewal(s). This is the first claim. It says nothing about whether the register could see everything.`,
    }),
    banner({
      tone: report.figuresComplete ? 'good' : 'caution',
      title: report.figuresComplete
        ? 'Coverage is complete: every stored row was read exactly and every accountable hand has a resolvable line position'
        : 'NOT CERTIFIED — the register could not see the whole picture',
      body: report.figuresComplete
        ? 'The second claim, separate from the first: no unreadable row, no orphan hand and no unresolvable reporting graph is outstanding.'
        : report.incompleteReasons.join(' '),
    }),
    banner({
      tone: 'info',
      title: 'A lapsed authority is not proof that the site stopped',
      body: 'The record proves the authority is not in force. It holds no operating log, so it cannot say what happened afterwards — and it never asserts that an activity continued. Where nothing stopped it, the row says precisely that: no suspension, revocation or stand-down is recorded.',
    }),
    report.detailed ? null : banner({ tone: 'caution', title: 'Accountable hands withheld at this altitude', body: report.disclosure.reason }),
  );
}

function authorityFlags(row) {
  const flags = [];
  if (row.unevidencedN) flags.push(badge(`${row.unevidencedN} unevidenced`, 'bad'));
  if (row.staleN) flags.push(badge(`${row.staleN} stale`, 'warn'));
  if (row.improvementOpenN) flags.push(badge(`${row.improvementOpenN} improvement open`, 'warn'));
  if (row.improvementOverdueN) flags.push(badge(`${row.improvementOverdueN} overdue`, 'bad'));
  if (row.variationOnRecordN) flags.push(badge(`${row.variationOnRecordN} variation`, 'neutral'));
  if (row.closeIgnoredN) flags.push(badge(`${row.closeIgnoredN} ineffective close`, 'warn'));
  return flags.length ? h('div', { class: 'row-actions' }, ...flags) : '—';
}

function registerTable(ctx, report, onDone) {
  return card({
    title: 'Authorities, by site and activity',
    subtitle: 'The effective expiry is derived from the declared expiry and every granted renewal. A submitted renewal never moves it. The renewal window opens at the lead time the declaration itself set.',
    body: report.rows.length
      ? table({
        columns: [
          { label: 'Site / activity', render: (row) => h('div', null, h('div', null, row.authorisation.siteRef), h('div', { class: 'small muted' }, row.authorisation.activityRef)) },
          { label: 'Instrument', render: (row) => h('div', null, h('div', null, row.authorisation.instrumentRef), h('div', { class: 'small muted' }, row.authorisation.issuingAuthority)) },
          { label: 'Accountable', render: (row) => (report.detailed ? row.holderRows.map((holder) => holder.name || 'Not on the graph').join(', ') : 'withheld') },
          { label: 'Granted / expires (UTC)', render: (row) => h('div', null, h('div', null, instantLabel(row.authorisation.grantedAt)), h('div', { class: 'small muted' }, `declared → ${instantLabel(row.authorisation.expiresAt)}`)) },
          { label: 'Effective expiry (UTC)', render: (row) => h('div', null, h('div', null, instantLabel(row.effectiveExpiresAt)), h('div', { class: 'small muted' }, row.latestGrant ? `granted ${instantLabel(row.latestGrant.decidedAt)}` : 'no grant on record')) },
          { label: 'Renewal window / lead', render: (row) => h('div', null, h('div', null, instantLabel(row.renewalWindowOpensAt)), h('div', { class: 'small muted' }, `${row.renewalLeadDays} day(s) before expiry`)) },
          { label: 'State', render: (row) => stateBadge(row.state) },
          {
            label: 'Exact',
            render: (row) => {
              if ((row.lapsedMinutes || 0) > 0) return badge(`${durationLabel(row.lapsedMinutes)} lapsed`, 'bad');
              if (Number.isInteger(row.daysToExpiry)) return badge(dayLabel(row.daysToExpiry), row.daysToExpiry <= row.renewalLeadDays ? 'warn' : 'neutral');
              return '—';
            },
          },
          { label: 'Flags', render: (row) => authorityFlags(row) },
          {
            label: '',
            render: (row) => h('div', { class: 'row-actions' },
              button('Condition', () => conditionDialogFor(ctx, report, row, onDone), { testid: 'lto-action-condition' }),
              button('Regulator action', () => actionDialog(ctx, report, onDone), { testid: 'lto-action-record-action' }),
              button('Submit renewal', () => renewalDialog(ctx, report, onDone), { testid: 'lto-action-renewal' })),
          },
        ],
        rows: report.rows,
        caption: 'Statutory authorities',
        emptyMessage: 'No authority is on the record. An empty register is a fact, not a clean bill: it means nothing has been declared, not that no consent is needed.',
      })
      : emptyState({
        title: 'No statutory authority has been declared',
        body: 'This register only knows what was declared against a written instrument. If the site holds consents nobody entered, the record cannot see them — and that is the finding, not an empty page.',
      }),
  });
}

function conditionDialogFor(ctx, report, row, onDone) {
  const conditions = row.conditionRows.map((condition) => ({ value: condition.condition.id, label: condition.condition.conditionKey }));
  const form = buildForm([
    { name: 'conditionKey', label: 'Condition key', type: 'text', required: true, help: 'A short stable key, e.g. bund-inspection.' },
    { name: 'conditionRef', label: 'The condition, as the instrument states it', type: 'textarea', required: true, rows: 3, help: `At least ${L.textMin} characters.` },
    { name: 'maxAgeDays', label: 'Re-evidence window (whole days; 0 = none)', type: 'number', min: 0, max: L.conditionMaxAgeDays, required: true, value: 0 },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.authorisationDeclareCondition({ authorisationId: row.authorisation.id, ...values, maxAgeDays: Number(values.maxAgeDays) });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The condition was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Condition declared against this authority.', 'good');
    onDone?.();
  };
  openModal({
    title: `Declare a condition — ${authorityLabel(row.authorisation)}`,
    description: conditions.length ? `${conditions.length} condition(s) already declared on this authority.` : 'The first condition on this authority.',
    body: h('div', { class: 'stack' }, form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Declare condition', onClick: submit, primary: true }],
  });
}

function conditionsPanel(ctx, report, onDone) {
  const flat = report.rows.flatMap((row) => row.conditionRows.map((condition) => ({ ...condition, authority: row.authorisation })));
  return card({
    title: 'Declared conditions and their evidence',
    subtitle: 'A condition is never “met” because the licence exists. It is current, stale against its own re-evidence window, or unevidenced — and each of those is a different fact.',
    body: flat.length
      ? table({
        columns: [
          { label: 'Authority', render: (row) => h('div', null, h('div', null, row.authority.siteRef), h('div', { class: 'small muted' }, row.authority.activityRef)) },
          { label: 'Condition', render: (row) => h('div', null, h('div', null, row.condition.conditionKey), h('div', { class: 'small muted' }, row.condition.conditionRef)) },
          { label: 'Re-evidence window', render: (row) => (row.condition.maxAgeDays ? `${row.condition.maxAgeDays} day(s)` : 'none declared') },
          { label: 'Latest evidence', render: (row) => (row.latestEvidence ? h('div', null, h('div', null, instantLabel(row.latestEvidence.at)), h('div', { class: 'small muted' }, row.latestEvidence.evidenceRef)) : 'never') },
          { label: 'Age', render: (row) => (Number.isInteger(row.ageDays) ? `${row.ageDays} day(s)` : '—') },
          { label: 'State', render: (row) => conditionBadge(row.state) },
          {
            label: '',
            render: (row) => button('Record evidence', () => evidenceDialog(ctx, report, row.condition.id, onDone), { testid: 'lto-action-evidence' }),
          },
        ],
        rows: flat,
        caption: 'Licence conditions',
        emptyMessage: 'No condition has been declared on any authority. Until conditions are broken out, the register can see the licence and not what it requires.',
      })
      : emptyState({
        title: 'No condition has been declared',
        body: 'A licence with conditions nobody entered is a licence the register can only date. Break the instrument’s conditions out here and each one gets its own evidence and its own window.',
      }),
  });
}

function actionsPanel(ctx, report, onDone) {
  const actionRows = report.rows.flatMap((row) => row.actionRows.map((action) => ({ ...action, authority: row.authorisation })));
  const allRenewals = report.renewals.map((renewal) => {
    const authority = report.rows.find((row) => row.authorisation.id === renewal.authorisationId) || null;
    return { renewal, authority };
  }).filter((row) => row.authority);
  return h('div', { class: 'stack' },
    card({
      title: 'Regulator actions',
      subtitle: 'A prohibition notice stops an activity; a suspension takes the authority away; a revocation is terminal. Each stands until a dated close of a kind its own action permits.',
      body: actionRows.length
        ? table({
          columns: [
            { label: 'Authority', render: (row) => h('div', null, h('div', null, row.authority.siteRef), h('div', { class: 'small muted' }, row.authority.activityRef)) },
            { label: 'Kind', render: (row) => row.definition?.label || row.action.kind },
            { label: 'Served / effective (UTC)', render: (row) => h('div', null, h('div', null, instantLabel(row.action.servedAt)), h('div', { class: 'small muted' }, instantLabel(row.action.effectiveFrom))) },
            { label: 'Compliance day', render: (row) => row.action.dueOn || '—' },
            { label: 'Written basis', render: (row) => h('span', { class: 'small' }, row.action.basisRef) },
            { label: 'Standing', render: (row) => (row.action.closeIgnored ? badge('closure has no effect', 'warn') : row.standing ? badge('standing', 'bad') : badge(`closed${row.action.closeKind ? `: ${row.action.closeKind}` : ''}`, 'neutral')) },
            {
              label: '',
              render: (row) => (row.definition?.closable && row.standing
                ? button('Close', () => closeActionDialog(ctx, row, onDone), { testid: 'lto-action-close' })
                : '—'),
            },
          ],
          rows: actionRows,
          caption: 'Regulator actions',
          emptyMessage: 'No regulator action is on the record. That is not the same as no action ever having been served.',
        })
        : emptyState({ title: 'No regulator action recorded', body: 'A notice, suspension, revocation or variation belongs here the day it is served — not in a folder.' }),
    }),
    card({
      title: 'Renewals',
      subtitle: 'A submission is dated and does not extend anything. Only a decision with a new expiry does, and a grant must extend.',
      body: allRenewals.length
        ? table({
          columns: [
            { label: 'Authority', render: (row) => h('div', null, h('div', null, row.authority.authorisation.siteRef), h('div', { class: 'small muted' }, row.authority.authorisation.activityRef)) },
            { label: 'Submitted (UTC)', render: (row) => instantLabel(row.renewal.submittedAt) },
            { label: 'Decision', render: (row) => (row.renewal.decision ? badge(row.renewal.decision, row.renewal.decision === 'granted' ? 'good' : 'warn') : badge('undecided', 'warn')) },
            { label: 'Decided (UTC)', render: (row) => instantLabel(row.renewal.decidedAt) },
            { label: 'New expiry (UTC)', render: (row) => instantLabel(row.renewal.grantedExpiresAt) },
            { label: 'Reason', render: (row) => h('span', { class: 'small' }, row.renewal.note || '—') },
            {
              label: '',
              render: (row) => (row.renewal.decision
                ? '—'
                : button('Decide', () => decideRenewalDialog(ctx, row.renewal, row.authority, onDone), { testid: 'lto-action-decide' })),
            },
          ],
          rows: allRenewals,
          caption: 'Renewal submissions and decisions',
          emptyMessage: 'No renewal has been submitted. That is either because none is due — or because the window opened and nobody filed one.',
        })
        : emptyState({ title: 'No renewal submitted', body: 'A renewal is an act with a date and a written basis. File it here the day it goes in.' }),
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
          alt: 'A method figure showing a statutory authority declared on a written instrument, its declared and effective expiry, the renewal window and the difference between a submission and a grant, each condition evidenced or unevidenced, a prohibition notice standing against an activity, and the joint reporting seat above every accountable hand — with the register refusing to claim that a lapsed authority stopped the activity.',
          class: 'method-figure',
        }),
        kv('Engine', LTO_METHOD.engine),
        kv('Decision record', LTO_METHOD.adr),
        kv('CSV scope', LTO_CSV_SCOPE),
        kv('As at', `${report.asOf} (${report.nowIso})`),
        h('h3', null, 'Frameworks applied'),
        h('ul', null, ...LTO_METHOD.frameworks.map((line) => h('li', null, line))),
        h('h3', null, 'What is printed'),
        h('ul', null, ...LTO_METHOD.printed.map((line) => h('li', null, line))),
        h('h3', null, 'Deliberately absent'),
        h('ul', null, ...LTO_METHOD.deliberatelyAbsent.map((line) => h('li', null, line))),
        h('h3', null, 'Disclosure'),
        banner({ tone: 'caution', title: 'A rendering contract, not an authentication boundary', body: 'Seats in this workspace are workflow declarations, not logins. The reader withholds accountable hands above rank 3, and this page says so rather than implying a permission system the workspace cannot enforce.' }),
      ),
    }),
  );
}

/* --------------------------------------------------------------------- page */

export function renderAuthorisations(ctx) {
  const view = ctx.query?.get?.('view') || 'register';
  let report;
  try {
    const result = ctx.api.authorisationReport();
    if (!result?.ok) {
      return h('div', { class: 'stack' },
        pageHeader({ eyebrow: 'Operations · authorisations', title: 'Statutory authorisations', subtitle: 'Which power to operate is held, on what instrument, and whether it is in force.' }),
        banner({ tone: 'bad', title: 'The register could not be read', body: result?.error || 'The seat could not be resolved.' }));
    }
    report = result.report;
  } catch (error) {
    return h('div', { class: 'stack' },
      pageHeader({ eyebrow: 'Operations · authorisations', title: 'Statutory authorisations' }),
      banner({ tone: 'bad', title: 'The register could not be read', body: error?.message || 'Unknown error.' }));
  }

  let candidates = [];
  try {
    const result = ctx.api.authorisationCandidates();
    if (result?.ok) candidates = result.people;
  } catch { candidates = []; }

  const onDone = () => {
    document.dispatchEvent(new CustomEvent('leados:navigate', { detail: { route: LTO_HREF } }));
    ctx.rerender?.();
  };
  const local = { api: ctx.api };
  const viewKey = VIEWS.some((row) => row.key === view) ? view : 'register';

  const exportCsv = () => {
    try {
      const file = exportWorkspaceCsv(ctx.api.getState ? ctx.api.getState() : ctx.state, LTO_CSV_SCOPE);
      if (!file?.ok) { toast(file?.error || 'The export produced no file.', 'bad'); return; }
      downloadText(file.filename, file.csv, 'text/csv');
      toast('Exported. Counts and exact minute totals only: no site, activity, issuing body, instrument, notice, person or instant crosses this boundary.', 'good');
    } catch (error) {
      toast(error?.message || 'The export failed.', 'bad');
    }
  };

  const header = pageHeader({
    eyebrow: 'Operations · authorisations',
    title: 'Statutory authorisations',
    subtitle: 'Which power to operate is held, on what written instrument, what each condition requires and whether it has been evidenced, which regulator actions stand, and whose duty it is to answer.',
    actions: [
      { label: 'Declare an authority', onClick: () => declareDialog(local, report, candidates, onDone), primary: true },
      { label: 'Export (counts)', onClick: exportCsv },
      { label: 'Conventions', onClick: () => conventionsDialog(local, report, onDone) },
    ],
    meta: [
      `As at ${report.asOf}`,
      `${report.totals.authorisations} authorit(ies) · ${report.totals.holders} accountable hand(s)`,
      `${report.totals.conditions} condition(s) · ${report.totals.conditionsUnevidenced} unevidenced`,
      report.detailed ? 'names shown' : 'counts only at this altitude',
    ],
  });

  const body = h('div', { class: 'stack' },
    summaryCard(report),
    claimsBanners(report),
    tabs({ items: VIEWS, active: viewKey, onSelect: (key) => { window.location.hash = `${LTO_HREF}?view=${key}`; }, ariaLabel: 'Authorisation sections' }),
    viewKey === 'conditions' ? conditionsPanel(local, report, onDone)
      : viewKey === 'actions' ? actionsPanel(local, report, onDone)
        : viewKey === 'method' ? methodView(report)
          : registerTable(local, report, onDone),
    viewKey !== 'method' ? h('div', { class: 'row-actions' },
      button('Record a regulator action', () => actionDialog(local, report, onDone)),
      button('Submit a renewal', () => renewalDialog(local, report, onDone)),
      button('Declare a condition', () => conditionDialog(local, report, onDone)),
      button('Record condition evidence', () => evidenceDialog(local, report, null, onDone))) : null,
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
