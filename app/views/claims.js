/**
 * app/views/claims.js — `#/claims`, the Claim, Limitation & Settlement-Authority
 * Register (ADR-0248, Schema v202).
 *
 * ONE reader (`buildClaims`) stands behind every state, deadline, day count,
 * suspension contribution, authority ceiling, settlement gap and total this page
 * prints. The page formats what the reader returned; it computes no deadline, no day
 * count and no verdict of its own.
 *
 * THE FIVE THINGS THIS SCREEN KEEPS APART
 *  - the ACCRUAL that started the clock and the RULE that made that day the right one —
 *    never the incident date by default;
 *  - whether the clock is PROVABLE at all: a matter with no readable accrual prints
 *    `clock-unprovable` and NO day count;
 *  - the declared period, the base deadline and the effective deadline after every
 *    PROVED suspension, with each suspension's exact contribution;
 *  - whether a suspension was PROVED or merely ALLEGED, and that an allegation moves
 *    nothing;
 *  - the authority COMPUTED above every responsible line, and the exact gap where the
 *    number paid exceeded it.
 *
 * WHAT THE SCREEN REFUSES TO SAY. It does not say the organisation lost a claim because
 * its deadline passed: the record proves the deadline and holds no court feed, so it
 * cannot say whether proceedings were issued. It prints that sentence beside the state.
 * It gives no legal advice and never scores a person, a line or a fee earner.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table, kv } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { exportWorkspaceCsv } from '../core/csv.js';
import {
  LFG_CLAIM_TYPES,
  LFG_CONCESSION_KINDS,
  LFG_CSV_SCOPE,
  LFG_HREF,
  LFG_LIMITS,
  LFG_METHOD,
  LFG_RESOLUTION_KINDS,
  LFG_SECTION_TITLES,
  LFG_STAY_KINDS,
} from '../core/domain/lfgRegistry.js';
import { dayLabel, moneyLabel } from '../core/domain/lfgMath.js';

const L = LFG_LIMITS;
const DIAGRAM_URL = './app/assets/claim-limitation-method.jpg';
const VIEWS = [
  { key: 'matters', label: LFG_SECTION_TITLES.matters },
  { key: 'clocks', label: LFG_SECTION_TITLES.clocks },
  { key: 'settlements', label: LFG_SECTION_TITLES.settlements },
  { key: 'method', label: LFG_SECTION_TITLES.method },
];

const TONE = { bad: 'bad', warn: 'warn', good: 'good', neutral: 'neutral' };
const options = (rows, { blank = null } = {}) => [
  ...(blank ? [{ value: '', label: blank }] : []),
  ...rows.map((row) => ({ value: row.value, label: row.label })),
];
const todayIso = () => new Date().toISOString().slice(0, 10);

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
    'data-testid': `lfg-state-${state.key}`,
  }, state.label);
}

function stayBadge(stay) {
  const tone = stay.proved ? 'good' : 'warn';
  return h('span', {
    class: `badge badge-${tone}`,
    title: stay.proved ? 'Proved: counted in the deadline arithmetic.' : `Alleged only: ${stay.missing.join('; ')}. It moves no deadline.`,
    'data-testid': `lfg-stay-${stay.proved ? 'proved' : 'alleged'}`,
  }, stay.proved ? 'Proved' : 'Alleged');
}

const matterLabel = (matter) => `${matter.partyRef} — ${matter.matterRef}`;
const moneyIn = (report, minor) => moneyLabel(minor, report.totals.currency || 'GBP');

/* -------------------------------------------------------------------- dialogs */

function openMatterDialog(ctx, candidates, onDone) {
  const form = buildForm([
    { name: 'matterRef', label: 'Document that started the clock', type: 'text', required: true, help: `At least ${L.instrumentMin} characters — a letter reference, a claim form number, a demand reference. The register refuses a claim it cannot trace to a document.` },
    { name: 'partyRef', label: 'Party asserting the claim', type: 'text', required: true, help: `At least ${L.shortMin} characters. The claimant, the regulator, the counterparty.` },
    { name: 'claimType', label: 'Claim type', type: 'select', required: true, options: options(LFG_CLAIM_TYPES.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose a claim type' }), help: 'The type determines the accrual rule the matter must state next. “Other” is legitimate — it just obliges the matter to write its own rule.' },
    { name: 'forumRef', label: 'Forum or arena', type: 'text', required: true, help: `At least ${L.shortMin} characters — a court, a tribunal, an arbitrator, a regulator.` },
    { name: 'currency', label: 'Currency', type: 'text', required: true, value: 'GBP', help: 'Three letters. Amounts in this register are exact minor units in one named currency.' },
    { name: 'claimedMinor', label: 'Sum claimed, in minor units (pence)', type: 'number', min: 0, help: 'Optional at opening. A whole number of minor units — 1250000 is £12,500.00. A fractional value is refused, never rounded.' },
    {
      name: 'responsibleIds', label: 'Responsible hands (one to four)', type: 'boolean-block', required: true,
      options: candidates.map((row) => ({ value: row.id, label: `${row.name}${row.role ? ` — ${row.role}` : ''}` })),
      help: 'Every hand answerable for this matter, across every reporting line. The authority to settle is computed above ALL of them, so name all of them.',
    },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.claimOpenMatter({
      ...values,
      claimedMinor: values.claimedMinor === '' || values.claimedMinor === undefined ? null : Number(values.claimedMinor),
      responsibleIds: values.responsibleIds,
    });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The matter was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Matter opened. No deadline exists yet: the register derives one only once the accrual and the period are declared.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Open a claim matter',
    description: 'The document that started the clock, the party, the claim type, the forum, and who answers for it.',
    size: 'lg',
    body: h('div', { class: 'stack' },
      banner({
        tone: 'caution',
        title: 'No deadline is stored, and none exists yet',
        body: 'Every day count on this register is derived from the accrual, the declared period and the proved suspensions. A matter with no accrual prints “clock unprovable” and no day count — it never falls back on the opening date.',
      }),
      form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Open matter', onClick: submit, primary: true }],
  });
}

function accrualDialog(ctx, report, presetMatterId, onDone) {
  const openMatters = report.rows
    .filter((row) => !row.accrual && !['resolved', 'settled-beyond-authority', 'merged'].includes(row.state.key))
    .map((row) => ({ value: row.matter.id, label: matterLabel(row.matter) }));
  const selected = presetMatterId ? report.rows.find((row) => row.matter.id === presetMatterId) : null;
  const form = buildForm([
    { name: 'matterId', label: 'Matter', type: 'select', required: true, options: options(openMatters, { blank: 'Choose a matter with no accrual' }), value: presetMatterId || '' },
    { name: 'accrualDay', label: 'Accrual day (UTC, YYYY-MM-DD)', type: 'text', required: true, value: todayIso(), help: selected ? `This matter is “${selected.typeDefinition?.label || selected.matter.claimType}”. Accrual rule: ${selected.typeDefinition?.accrual || 'the matter states its own rule.'}` : 'The day the clock started — not the incident date unless the rule says so.' },
    { name: 'accrualRule', label: 'The rule that makes that the accrual day', type: 'textarea', rows: 3, required: true, help: `At least ${L.textMin} characters. The day alone is a date somebody typed; the rule is what makes it a derived deadline.` },
    { name: 'knowledgeDay', label: 'Date of knowledge (knowledge-based types only)', type: 'text', help: 'Required for negligence, personal injury and latent property damage: the day the organisation first knew, or ought reasonably to have known, the facts that make the claim arguable. It cannot precede the damage.' },
    { name: 'periodMonths', label: 'Limitation period (whole months)', type: 'number', min: 1, max: L.periodMonthsMax, required: true, help: `Between 1 and ${L.periodMonthsMax}. There is no default period in this register: a period belongs to the cause of action and the jurisdiction, and you declare it.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.claimDeclareAccrual({
      matterId: values.matterId,
      accrualDay: values.accrualDay,
      accrualRule: values.accrualRule,
      knowledgeDay: values.knowledgeDay || null,
      periodMonths: Number(values.periodMonths),
    });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The accrual was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Accrual declared. The deadline is derived on read from this day, the period, and every PROVED suspension.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Declare the accrual',
    description: 'The fact that starts the limitation clock, and the period this cause of action carries.',
    size: 'lg',
    body: h('div', { class: 'stack' },
      banner({
        tone: 'info',
        title: 'Accrual is not the incident date',
        body: 'Limitation runs from accrual — the breach, the act, the termination date, or the date of knowledge. Those are different days. The register requires the day AND the rule, because dating the clock from the incident is the commonest way this duty is lost.',
      }),
      form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Declare accrual', onClick: submit, primary: true }],
  });
}

function stayDialog(ctx, report, presetMatterId, onDone) {
  const matters = report.rows.map((row) => ({ value: row.matter.id, label: matterLabel(row.matter) }));
  const form = buildForm([
    { name: 'matterId', label: 'Matter', type: 'select', required: true, options: options(matters, { blank: 'Choose a matter' }), value: presetMatterId || '' },
    { name: 'kind', label: 'Kind of suspension', type: 'select', required: true, options: options(LFG_STAY_KINDS.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose a kind' }), help: 'Each kind is proved by different evidence. What is missing is printed on the row and the stay moves no deadline until it is present.' },
    { name: 'instrumentRef', label: 'Instrument reference', type: 'text', required: true, help: `At least ${L.instrumentMin} characters — the agreement, the certificate reference and issue day, or the order.` },
    { name: 'parties', label: 'Parties (comma-separated; a standstill needs both)', type: 'text', help: 'A standstill agreement is proved only when both sides are named as signatories.' },
    { name: 'fromDay', label: 'Suspended from (UTC, YYYY-MM-DD)', type: 'text', required: true, value: todayIso() },
    { name: 'toDay', label: 'Suspended to (UTC, YYYY-MM-DD)', type: 'text', required: true, help: 'Both ends are inclusive: 1 March to 30 April suspends 61 days.' },
    { name: 'note', label: 'Note', type: 'textarea', rows: 2, help: 'Optional.' },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.claimRecordStay(values);
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The stay was refused.', 'bad');
      return;
    }
    closeAllModals();
    if (result.warning) toast(result.warning, 'warn');
    else toast('Suspension proved and counted in the deadline arithmetic.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Record a suspension of the clock',
    description: 'A dated act by a named party over a stated span. Proof is computed from the evidence, never declared.',
    size: 'lg',
    body: h('div', { class: 'stack' }, form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record stay', onClick: submit, primary: true }],
  });
}

function resolutionDialog(ctx, report, presetMatterId, onDone) {
  const openMatters = report.rows
    .filter((row) => !row.resolution && row.state.key !== 'merged')
    .map((row) => ({ value: row.matter.id, label: matterLabel(row.matter) }));
  const form = buildForm([
    { name: 'matterId', label: 'Matter', type: 'select', required: true, options: options(openMatters, { blank: 'Choose an unresolved matter' }), value: presetMatterId || '' },
    { name: 'kind', label: 'How it ended', type: 'select', required: true, options: options(LFG_RESOLUTION_KINDS.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose an outcome' }), help: 'A settlement and a judgment take an exact amount; a withdrawal and a dismissal take none.' },
    { name: 'resolvedDay', label: 'Resolved on (UTC, YYYY-MM-DD)', type: 'text', required: true, value: todayIso() },
    { name: 'amountMinor', label: 'Amount, minor units (settlement or judgment only)', type: 'number', min: 0, help: 'A whole number of minor units. A settlement with no number is refused — “it settled” is not a record of a settlement.' },
    { name: 'currency', label: 'Currency (with the amount)', type: 'text' },
    { name: 'mergedIntoId', label: 'Merged into matter (mergers only)', type: 'text', help: 'The matter id this one merged into. A merger that names nobody leaves the clock belonging to no matter at all.' },
    { name: 'basisRef', label: 'Basis on the record', type: 'textarea', rows: 3, required: true, help: `At least ${L.textMin} characters — the agreement, the order, the discontinuance.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.claimRecordResolution({
      matterId: values.matterId,
      kind: values.kind,
      resolvedDay: values.resolvedDay,
      amountMinor: values.amountMinor === '' || values.amountMinor === undefined ? null : Number(values.amountMinor),
      currency: values.currency || null,
      mergedIntoId: values.mergedIntoId || null,
      basisRef: values.basisRef,
    });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The resolution was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Resolution recorded. The authority gap, where any, is derived on read against the reporting graph.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Record a resolution',
    description: 'One close per matter, with a day, a basis, and an exact amount where the outcome takes one.',
    size: 'lg',
    body: h('div', { class: 'stack' }, form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record resolution', onClick: submit, primary: true }],
  });
}

function concessionDialog(ctx, report, presetMatterId, onDone) {
  const matters = report.rows.map((row) => ({ value: row.matter.id, label: matterLabel(row.matter) }));
  const form = buildForm([
    { name: 'matterId', label: 'Matter', type: 'select', required: true, options: options(matters, { blank: 'Choose a matter' }), value: presetMatterId || '' },
    { name: 'kind', label: 'Kind of concession', type: 'select', required: true, options: options(LFG_CONCESSION_KINDS.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose a kind' }), help: 'A reserve is a provision, an offer is a number on the table, a payment is money gone. They are printed apart.' },
    { name: 'atDay', label: 'Dated (UTC, YYYY-MM-DD)', type: 'text', required: true, value: todayIso() },
    { name: 'amountMinor', label: 'Amount, minor units', type: 'number', min: 0, help: 'A whole number of minor units. A fractional value is refused rather than rounded into a total.' },
    { name: 'currency', label: 'Currency (with the amount)', type: 'text' },
    { name: 'basisRef', label: 'Basis on the record', type: 'textarea', rows: 3, required: true, help: `At least ${L.textMin} characters. Money moved on the record and nobody said why is worse than no row at all.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.claimRecordConcession({
      matterId: values.matterId,
      kind: values.kind,
      atDay: values.atDay,
      amountMinor: values.amountMinor === '' || values.amountMinor === undefined ? null : Number(values.amountMinor),
      currency: values.currency || null,
      basisRef: values.basisRef,
    });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The concession was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Concession recorded as its own dated instrument. The totals are derived on read.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Record a concession',
    description: 'A reserve, an offer received, an offer made, a payment on account, costs or interest.',
    size: 'lg',
    body: h('div', { class: 'stack' }, form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record concession', onClick: submit, primary: true }],
  });
}

function authorityDialog(ctx, candidates, onDone) {
  const form = buildForm([
    { name: 'personId', label: 'Person the authority is given to', type: 'select', required: true, options: options(candidates.map((row) => ({ value: row.id, label: `${row.name}${row.role ? ` — ${row.role}` : ''}` })), { blank: 'Choose a person' }) },
    { name: 'scopeRef', label: 'Scope this authority covers', type: 'text', required: true, help: `At least ${L.shortMin} characters — a category of claim, a portfolio, a business unit. Authority with no scope is authority over everything.` },
    { name: 'currency', label: 'Currency', type: 'text', required: true, value: 'GBP' },
    { name: 'ceilingMinor', label: 'Ceiling, minor units', type: 'number', min: 0, required: true, help: 'A whole number of minor units. A ceiling of 0 is a legitimate declaration that this person may settle nothing.' },
    { name: 'basisRef', label: 'Basis on the record', type: 'textarea', rows: 3, required: true, help: `At least ${L.textMin} characters — the delegation, the board resolution, the standing instruction.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.claimDeclareAuthority({ ...values, ceilingMinor: Number(values.ceilingMinor) });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The authority was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Authority declared. The register computes the ceiling above a matter’s lines from these grants and compares every settlement against it.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Declare a settlement authority',
    description: 'Records the authority a human was actually given. The reader computes the ceiling and compares; it never derives the grant.',
    body: h('div', { class: 'stack' }, form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Declare authority', onClick: submit, primary: true }],
  });
}

function conventionsDialog(ctx, report, onDone) {
  const conv = report.conventions;
  const form = buildForm([
    { name: 'lfgPrivacyFloor', label: 'Privacy floor for per-state exports', type: 'number', min: 2, max: 20, required: true, value: conv.lfgPrivacyFloor, help: 'A per-state count below this floor is exported BLANK with its reason, never as a small number.' },
    { name: 'lfgWarningHorizonDays', label: 'Warning horizon (days)', type: 'number', min: 1, max: 365, required: true, value: conv.lfgWarningHorizonDays, help: 'How far ahead the bench wants to see. This is a PLANNING convention and is never a limitation period — the period is declared on each matter.' },
    { name: 'lfgAutoPropagate', label: 'The rule may file dated asks', type: 'checkbox', value: conv.lfgAutoPropagate !== false, checkboxLabel: 'ON — a pause is a pause that leaves a claim running out unanswered', help: 'Pause-governed on every path, including the explicit scan. A limitation period runs out on the calendar with nobody having written anything.' },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.claimSetConventions({
      lfgPrivacyFloor: Number(values.lfgPrivacyFloor),
      lfgWarningHorizonDays: Number(values.lfgWarningHorizonDays),
      lfgAutoPropagate: Boolean(values.lfgAutoPropagate),
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
    description: 'Three declared switches. None of them is a limitation period — those are declared per matter and never defaulted.',
    body: h('div', { class: 'stack' }, form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Save conventions', onClick: submit, primary: true }],
  });
}

/* --------------------------------------------------------------------- panels */

function summaryCard(report) {
  const t = report.totals;
  return card({
    title: 'What the register holds at this instant',
    subtitle: 'Every figure is derived on read from declared accruals, periods, proved suspensions, concessions and resolutions. No state is stored, and a passed deadline is never upgraded into an allegation about what the forum did.',
    body: h('div', { class: 'stat-grid' },
      stat({ label: 'Matters', value: h('span', { 'data-testid': 'lfg-count-matters' }, String(t.matters)), hint: `${t.holders} responsible hand(s) · ${t.linesN} line(s)` }),
      stat({ label: 'Open', value: h('span', { 'data-testid': 'lfg-count-open' }, String(t.open)), hint: `${t.inTime} in time` }),
      stat({ label: 'Approaching', value: h('span', { 'data-testid': 'lfg-count-approaching' }, String(t.approaching)), hint: `inside the ${t.matters ? report.conventions.lfgWarningHorizonDays : report.conventions.lfgWarningHorizonDays}-day horizon` }),
      stat({ label: 'Urgent / critical', value: h('span', { 'data-testid': 'lfg-count-urgent' }, String(t.urgent + t.critical)), hint: 'inside the narrow bands' }),
      stat({ label: 'Deadline passed', value: h('span', { 'data-testid': 'lfg-count-timebarred' }, String(t.timeBarred)), hint: `${t.daysOverTotal} whole day(s) over in total` }),
      stat({ label: 'Clock unprovable', value: h('span', { 'data-testid': 'lfg-count-unprovable' }, String(t.clockUnprovable)), hint: 'no accrual basis on the record' }),
      stat({ label: 'Resolved', value: h('span', { 'data-testid': 'lfg-count-resolved' }, String(t.resolved)), hint: `${t.settled} settled · ${t.settledBeyondAuthority} beyond authority` }),
      stat({ label: 'Your attention', value: h('span', { 'data-testid': 'lfg-count-attention' }, String(report.attention.total)), hint: 'urgent, passed, unprovable, beyond authority' }),
    ),
  });
}

function claimsBanners(report) {
  const parts = report.balances.statesReconcile && report.balances.accrualsReconcile && report.balances.staysReconcile
    && report.balances.resolutionsReconcile && report.balances.concessionsReconcile
    && report.balances.oneAccrualPerMatter && report.balances.oneResolutionPerMatter;
  return h('div', { class: 'stack' },
    banner({
      tone: parts ? 'info' : 'bad',
      title: parts
        ? 'The parts re-add: every state, accrual, stay, resolution and concession ties to the matter it summarises'
        : 'The printed counts do NOT re-add to the rows they summarise',
      body: `States ${report.stateTotal} of ${report.totals.matters} matter(s) · ${report.accruals.length} accrual(s) · ${report.stays.length} suspension(s) · ${report.concessions.length} concession(s) · ${report.resolutions.length} resolution(s). This is the first claim. It says nothing about whether the register could see everything.`,
    }),
    banner({
      tone: report.figuresComplete ? 'good' : 'caution',
      title: report.figuresComplete
        ? 'Coverage is complete: every stored row was read exactly and every responsible hand has a resolvable line position'
        : 'NOT CERTIFIED — the register could not see the whole picture',
      body: report.figuresComplete
        ? 'The second claim, separate from the first: no unreadable row, no orphan hand and no unresolvable reporting graph is outstanding.'
        : report.incompleteReasons.join(' '),
    }),
    banner({
      tone: 'info',
      title: 'A passed deadline is not proof that proceedings were not issued',
      body: 'The record proves the deadline this matter’s own accrual and period produce. It holds no court feed, no filing acknowledgement and no docket, so it cannot say what happened on or before that day — and it never asserts that a claim was lost.',
    }),
    report.detailed ? null : banner({ tone: 'caution', title: 'Responsible hands withheld at this altitude', body: report.disclosure.reason }),
  );
}

function matterFlags(row) {
  const flags = [];
  if (!row.clockProvable) flags.push(badge('no deadline derivable', 'bad'));
  if (row.ungrouped) flags.push(badge('ungrouped', 'neutral'));
  for (const stay of row.allegedStays) flags.push(badge(`${stay.kind}: alleged`, 'warn'));
  if (row.suspendedDays) flags.push(badge(`${row.suspendedDays} day(s) suspended`, 'neutral'));
  if (row.resolution) flags.push(badge(row.resolution.kind, 'neutral'));
  if (row.beyondAuthorityMinor > 0) flags.push(badge('beyond authority', 'bad'));
  if (row.orphan) flags.push(badge('orphan — no resolvable line', 'warn'));
  return flags.length ? h('div', { class: 'row-actions' }, ...flags) : '—';
}

function mattersTable(ctx, report, candidates, onDone) {
  return card({
    title: 'Matters, by urgency of the clock',
    subtitle: 'Sorted by how close the clock is, then by the exposure the record can prove. The effective deadline is derived from the accrual, the declared period and every PROVED suspension. An alleged suspension moves nothing.',
    body: report.rows.length
      ? table({
        columns: [
          { label: 'Party · document', render: (row) => h('div', null, h('div', null, row.matter.partyRef), h('div', { class: 'small muted' }, row.matter.matterRef)) },
          { label: 'Type', render: (row) => (row.typeDefinition ? row.typeDefinition.label : badge('unsupported type', 'neutral')) },
          { label: 'Forum', render: (row) => row.matter.forumRef },
          { label: 'Accrual', render: (row) => (row.accrual ? h('div', null, h('div', null, row.accrual.accrualDay), h('div', { class: 'small muted' }, `${row.accrual.periodMonths} month(s)${row.accrual.knowledgeDay ? ` · known ${row.accrual.knowledgeDay}` : ''}`)) : badge('not declared', 'bad')) },
          { label: 'Deadline', render: (row) => (row.deadlineDay ? h('div', null, h('div', null, row.deadlineDay), row.suspendedDays ? h('div', { class: 'small muted' }, `+${row.suspendedDays} d suspended`) : null) : '—') },
          { label: 'Days', render: (row) => (Number.isInteger(row.daysRemaining) ? (row.daysRemaining < 0 ? `${row.daysOver} overdue` : dayLabel(row.daysRemaining)) : '—') },
          { label: 'Exposure', render: (row) => (Number.isInteger(row.exposureMinor) ? moneyIn(report, row.exposureMinor) : 'not stated') },
          { label: 'State', render: (row) => stateBadge(row.state) },
          { label: 'Flags', render: (row) => matterFlags(row) },
          {
            label: '',
            render: (row) => button(
              row.accrual ? 'Add concession' : 'Declare accrual',
              () => (row.accrual ? concessionDialog(ctx, report, row.matter.id, onDone) : accrualDialog(ctx, report, row.matter.id, onDone)),
              { testid: 'lfg-action-next' },
            ),
          },
        ],
        rows: report.rows,
        caption: 'Claim matters',
        emptyMessage: 'No claim has been opened. That is either a quiet year — or a letter nobody recognised as a claim.',
      })
      : emptyState({
        title: 'No claim matter on the record',
        body: 'Open the matter the day the document arrives, not the day legal sees it. No deadline can be derived until the accrual is declared.',
        action: { label: 'Open a matter', onClick: () => openMatterDialog(ctx, candidates, onDone) },
      }),
  });
}

function clocksPanel(ctx, report, candidates, onDone) {
  const rows = report.rows.filter((row) => row.accrual || row.state.key === 'clock-unprovable');
  const stays = report.stays.map((stay) => ({
    stay,
    matter: report.mattersById.get(stay.matterId) || null,
  })).filter((row) => row.matter);
  return h('div', { class: 'stack' },
    card({
      title: 'Limitation clocks, with the arithmetic printed',
      subtitle: 'Accrual + declared period = base deadline. Every PROVED suspension adds its exact whole days. An allegation adds nothing and says what it is missing.',
      body: rows.length
        ? table({
          columns: [
            { label: 'Party · document', render: (row) => h('div', null, h('div', null, row.matter.partyRef), h('div', { class: 'small muted' }, row.matter.matterRef)) },
            { label: 'Accrual day', render: (row) => row.accrual?.accrualDay || '—' },
            { label: 'Rule relied on', render: (row) => h('span', { class: 'small' }, row.accrual?.accrualRule || 'no accrual declared') },
            { label: 'Period', render: (row) => (row.periodMonths ? `${row.periodMonths} month(s)` : '—') },
            { label: 'Base deadline', render: (row) => row.baseDeadlineDay || '—' },
            { label: 'Suspended', render: (row) => (Number.isInteger(row.suspendedDays) ? `${row.suspendedDays} day(s)` : '—') },
            { label: 'Effective deadline', render: (row) => row.deadlineDay || h('span', { class: 'small muted' }, 'not derivable') },
            { label: 'Whole days', render: (row) => (Number.isInteger(row.daysRemaining) ? (row.daysRemaining < 0 ? badge(`${row.daysOver} over`, 'bad') : badge(dayLabel(row.daysRemaining), row.daysRemaining <= report.conventions.lfgWarningHorizonDays ? 'warn' : 'good')) : badge('refused', 'bad')) },
            { label: 'State', render: (row) => stateBadge(row.state) },
          ],
          rows,
          caption: 'Limitation arithmetic',
          emptyMessage: 'No matter carries an accrual yet, so no clock is derivable on this register.',
        })
        : emptyState({ title: 'No clock to show', body: 'Declare an accrual against a matter and its deadline is derived here, with the period and every suspension printed beside it.' }),
    }),
    card({
      title: 'Suspensions of the clock',
      subtitle: 'Proof is computed from the evidence each kind requires. A standstill needs both sides named; the other three need their instrument. What is missing is printed.',
      body: stays.length
        ? table({
          columns: [
            { label: 'Party · document', render: (row) => h('div', null, h('div', null, row.matter.partyRef), h('div', { class: 'small muted' }, row.matter.matterRef)) },
            { label: 'Kind', render: (row) => row.stay.kind },
            { label: 'Span', render: (row) => `${row.stay.fromDay} → ${row.stay.toDay}` },
            { label: 'Days', render: (row) => `${row.stay.spanDays}` },
            { label: 'Instrument', render: (row) => h('span', { class: 'small' }, row.stay.instrumentRef) },
            { label: 'Parties', render: (row) => (row.stay.parties.length ? row.stay.parties.join(', ') : '—') },
            { label: 'State', render: (row) => stayBadge(row.stay) },
            { label: 'What is missing', render: (row) => (row.stay.missing.length ? h('span', { class: 'small' }, row.stay.missing.join('; ')) : '—') },
          ],
          rows: stays,
          caption: 'Suspensions',
          emptyMessage: 'No suspension is recorded. If a standstill or a conciliation certificate exists, it belongs here the day it is signed.',
        })
        : emptyState({ title: 'No suspension recorded', body: 'A clock that was suspended and was not recorded is a clock that will be read as never having stopped.' }),
    }),
    report.rows.length ? h('div', { class: 'row-actions' },
      button('Record a suspension', () => stayDialog(ctx, report, null, onDone)),
      button('Record a resolution', () => resolutionDialog(ctx, report, null, onDone)),
    ) : null,
  );
}

function settlementsPanel(ctx, report, candidates, onDone) {
  const rows = report.rows.filter((row) => row.resolution || row.concessions.length || row.claimedMinor !== null);
  return h('div', { class: 'stack' },
    card({
      title: 'Computed authority, and what was actually conceded',
      subtitle: 'The ceiling is the authority the reporting graph supports above every responsible line — the joint apex over all of them, never one hand the record promoted to “owner”. A settlement above it is kept and the gap is printed.',
      body: rows.length
        ? table({
          columns: [
            { label: 'Party · document', render: (row) => h('div', null, h('div', null, row.matter.partyRef), h('div', { class: 'small muted' }, row.matter.matterRef)) },
            { label: 'Claimed', render: (row) => (Number.isInteger(row.claimedMinor) ? moneyIn(report, row.claimedMinor) : '—') },
            { label: 'Reserved', render: (row) => moneyIn(report, row.reserveTotalMinor) },
            { label: 'Paid', render: (row) => moneyIn(report, row.paidTotalMinor) },
            { label: 'Costs', render: (row) => moneyIn(report, row.costsTotalMinor) },
            { label: 'Authority ceiling', render: (row) => (row.ceilingResolvable ? moneyIn(report, row.ceilingMinor) : (row.mixedCurrency ? badge('mixed currency', 'warn') : badge('no grant at the apex', 'bad'))) },
            { label: 'Joint apex', render: (row) => (row.apexAmbiguous ? badge('ambiguous', 'warn') : (row.apexName || '—')) },
            { label: 'Resolved for', render: (row) => (Number.isInteger(row.resolutionMinor) ? moneyIn(report, row.resolutionMinor) : '—') },
            { label: 'Gap', render: (row) => (row.beyondAuthorityMinor > 0 ? badge(moneyIn(report, row.beyondAuthorityMinor), 'bad') : '—') },
          ],
          rows,
          caption: 'Settlement authority',
          emptyMessage: 'No matter carries a claim amount, a reserve or a resolution yet.',
        })
        : emptyState({ title: 'Nothing to settle yet', body: 'Record a claimed sum, a reserve or an offer and this panel computes the authority above the matter’s lines against it.' }),
    }),
    report.rows.length ? h('div', { class: 'row-actions' },
      button('Declare settlement authority', () => authorityDialog(ctx, candidates, onDone), { testid: 'lfg-action-authority' }),
      button('Record a concession', () => concessionDialog(ctx, report, null, onDone)),
      button('Record a resolution', () => resolutionDialog(ctx, report, null, onDone))) : null,
  );
}

function methodView(report) {
  return h('div', { class: 'stack' },
    card({
      title: 'What this register is, and what it refuses to be',
      body: h('div', { class: 'stack' },
        h('img', {
          src: DIAGRAM_URL,
          alt: 'A method figure showing a claim matter with the accrual day that starts the limitation clock and the rule that makes it the right day, the base deadline derived from the declared period, a proved suspension adding its exact days and an alleged one adding none, the computed settlement-authority ceiling above every responsible line, and the register refusing to claim that a passed deadline means the claim was lost.',
          class: 'method-figure',
        }),
        kv('Engine', LFG_METHOD.engine),
        kv('Decision record', LFG_METHOD.adr),
        kv('CSV scope', LFG_CSV_SCOPE),
        kv('As at', `${report.asOf} (${report.nowIso})`),
        h('h3', null, 'Frameworks applied'),
        h('ul', null, ...LFG_METHOD.frameworks.map((line) => h('li', null, line))),
        h('h3', null, 'What is printed'),
        h('ul', null, ...LFG_METHOD.printed.map((line) => h('li', null, line))),
        h('h3', null, 'Deliberately absent'),
        h('ul', null, ...LFG_METHOD.deliberatelyAbsent.map((line) => h('li', null, line))),
        h('h3', null, 'Disclosure'),
        banner({ tone: 'caution', title: 'A rendering contract, not an authentication boundary', body: 'Seats in this workspace are workflow declarations, not logins. The reader withholds responsible hands above rank 3, and this page says so rather than implying a permission system the workspace cannot enforce. A claim register is privileged material: the export carries counts, day extremes and whole-register minor-unit totals only.' }),
      ),
    }),
  );
}

/* ------------------------------------------------------------------------ page */

export function renderClaims(ctx) {
  const view = ctx.query?.get?.('view') || 'matters';
  let report;
  try {
    const result = ctx.api.claimReport();
    if (!result?.ok) {
      return h('div', { class: 'stack' },
        pageHeader({ eyebrow: 'Governance · claims', title: 'Claims & limitation', subtitle: 'Which claims run against us, when their clocks stop, and who may settle them.' }),
        banner({ tone: 'bad', title: 'The register could not be read', body: result?.error || 'The seat could not be resolved.' }));
    }
    report = result.report;
  } catch (error) {
    return h('div', { class: 'stack' },
      pageHeader({ eyebrow: 'Governance · claims', title: 'Claims & limitation' }),
      banner({ tone: 'bad', title: 'The register could not be read', body: error?.message || 'Unknown error.' }));
  }

  let candidates = [];
  try {
    const result = ctx.api.claimCandidates();
    if (result?.ok) candidates = result.people;
  } catch { candidates = []; }

  const onDone = () => {
    document.dispatchEvent(new CustomEvent('leados:navigate', { detail: { route: LFG_HREF } }));
    ctx.rerender?.();
  };
  const local = { api: ctx.api };
  const viewKey = VIEWS.some((row) => row.key === view) ? view : 'matters';

  const exportCsv = () => {
    try {
      const file = exportWorkspaceCsv(ctx.api.getState ? ctx.api.getState() : ctx.state, LFG_CSV_SCOPE);
      if (!file?.ok) { toast(file?.error || 'The export produced no file.', 'bad'); return; }
      downloadText(file.filename, file.csv, 'text/csv');
      toast('Exported. Counts, day extremes and whole-register minor-unit totals only: no party, claim type, forum, instrument, person or day crosses this boundary.', 'good');
    } catch (error) {
      toast(error?.message || 'The export failed.', 'bad');
    }
  };

  const header = pageHeader({
    eyebrow: 'Governance · claims',
    title: 'Claims & limitation',
    subtitle: 'Which claims run against the organisation, the day each clock started and the rule that makes it the right day, whether it is still provable, and whose authority reaches the number it may settle for.',
    actions: [
      { label: 'Open a matter', onClick: () => openMatterDialog(local, candidates, onDone), primary: true },
      { label: 'Export (counts)', onClick: exportCsv },
      { label: 'Conventions', onClick: () => conventionsDialog(local, report, onDone) },
    ],
    meta: [
      `As at ${report.asOf}`,
      `${report.totals.matters} matter(s) · ${report.totals.open} open`,
      `${report.totals.timeBarred} past deadline · ${report.totals.clockUnprovable} unprovable`,
      report.detailed ? 'names shown' : 'counts only at this altitude',
    ],
  });

  const body = h('div', { class: 'stack' },
    summaryCard(report),
    claimsBanners(report),
    tabs({ items: VIEWS, active: viewKey, onSelect: (key) => { window.location.hash = `${LFG_HREF}?view=${key}`; }, ariaLabel: 'Claims sections' }),
    viewKey === 'clocks' ? clocksPanel(local, report, candidates, onDone)
      : viewKey === 'settlements' ? settlementsPanel(local, report, candidates, onDone)
        : viewKey === 'method' ? methodView(report)
          : mattersTable(local, report, candidates, onDone),
    viewKey !== 'method' ? h('div', { class: 'row-actions' },
      button('Declare an accrual', () => accrualDialog(local, report, null, onDone)),
      button('Record a concession', () => concessionDialog(local, report, null, onDone)),
      button('Declare settlement authority', () => authorityDialog(local, candidates, onDone))) : null,
    report.warnings.length
      ? card({
        title: 'Unreadable rows, counted and refused',
        subtitle: 'Nothing here was repaired: a stored row this register cannot read exactly is dropped with a count rather than guessed at.',
        body: h('ul', null, ...report.warnings.slice(0, 20).map((line) => h('li', { class: 'small' }, line))),
      })
      : null,
    report.lineRows.length
      ? card({
        title: 'By reporting line, with each person counted once',
        subtitle: 'A matter names hands across lines. Every active line that holds a hand is counted here, and a person appears once on each line that genuinely holds them — never doubled because they have two managers.',
        body: table({
          columns: [
            { label: 'Line', render: (row) => row.managerName },
            { label: 'Matters', render: (row) => `${row.mattersN}` },
            { label: 'Open', render: (row) => `${row.openN}` },
            { label: 'Urgent', render: (row) => (row.urgentN ? badge(String(row.urgentN), 'warn') : '—') },
            { label: 'Past deadline', render: (row) => (row.timeBarredN ? badge(String(row.timeBarredN), 'bad') : '—') },
            { label: 'Unprovable clock', render: (row) => (row.unprovableN ? badge(String(row.unprovableN), 'bad') : '—') },
            { label: 'Responsible hands', render: (row) => `${row.holdersN}` },
          ],
          rows: report.lineRows,
          caption: 'By line',
          emptyMessage: 'No line holds a responsible hand on this register.',
        }),
      })
      : null,
  );

  return h('div', { class: 'stack' }, header, body);
}
