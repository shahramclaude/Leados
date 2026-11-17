/**
 * app/views/insurance.js — `#/insurance`, the Insurance Notification & Recovery
 * Register (ADR-0249, Schema v203).
 *
 * ONE reader (`buildInsurance`) stands behind every state, deadline, day count,
 * cover verdict, recovery total and net cost this page prints. The page formats
 * what the reader returned; it computes no deadline, no day count and no verdict
 * of its own.
 *
 * THE FIVE THINGS THIS SCREEN KEEPS APART
 *  - the POLICY that answers for the matter, with its class, basis, period,
 *    limit, deductible and DECLARED notification window — never a default;
 *  - whether the notification deadline is PROVABLE at all: a coverage with no
 *    readable trigger day or window prints `notification-unprovable` and NO day
 *    count;
 *  - the trigger day, the derived deadline and the exact whole days remaining or
 *    over, with whether the insurer was told in time;
 *  - whether the policy RESPONDS at all: a trigger day outside the period prints
 *    `no-cover` with the reason;
 *  - the gross exposure, the insurance asset and the DERIVED net cost, printed
 *    apart so a provision is never confused with money spent.
 *
 * WHAT THE SCREEN REFUSES TO SAY. It does not say cover was lost because the
 * deadline passed: the record proves the deadline and holds no insurer feed, so
 * it cannot say whether the insurer accepted the late notice. It prints that
 * sentence beside the state. It gives no coverage advice and never scores a
 * person, a line, a broker or a claims handler.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table, kv } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { exportWorkspaceCsv } from '../core/csv.js';
import {
  INS_CSV_SCOPE,
  INS_HREF,
  INS_LIMITS,
  INS_METHOD,
  INS_NOTIFICATION_METHODS,
  INS_POLICY_BASES,
  INS_POLICY_CLASSES,
  INS_RECOVERY_KINDS,
  INS_SECTION_TITLES,
} from '../core/domain/insRegistry.js';
import { dayLabel, moneyLabel } from '../core/domain/insMath.js';

const L = INS_LIMITS;
const DIAGRAM_URL = './app/assets/insurance-notification-method.jpg';
const VIEWS = [
  { key: 'coverages', label: INS_SECTION_TITLES.coverages },
  { key: 'notifications', label: INS_SECTION_TITLES.notifications },
  { key: 'recoveries', label: INS_SECTION_TITLES.recoveries },
  { key: 'method', label: INS_SECTION_TITLES.method },
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
    'data-testid': `ins-state-${state.key}`,
  }, state.label);
}

const coverageLabel = (row) => `${row.policy.insurerRef} — ${row.policy.policyRef}`;
const moneyIn = (report, minor) => moneyLabel(minor, report.totals.currency || 'GBP');

/* -------------------------------------------------------------------- dialogs */

function policyDialog(ctx, candidates, onDone) {
  const form = buildForm([
    { name: 'policyRef', label: 'Policy reference (declaration page)', type: 'text', required: true, help: `At least ${L.instrumentMin} characters — a policy number, a cover note reference, a renewal certificate. The register refuses a policy it cannot trace to a document.` },
    { name: 'insurerRef', label: 'Insurer', type: 'text', required: true, help: `At least ${L.shortMin} characters. The insurer that answers for this policy.` },
    { name: 'policyClass', label: 'Policy class', type: 'select', required: true, options: options(INS_POLICY_CLASSES.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose a class' }), help: 'The class determines the trigger this policy must state. “Other” is legitimate — it just obliges the policy to write its own trigger.' },
    { name: 'basis', label: 'Policy basis', type: 'select', required: true, options: options(INS_POLICY_BASES.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose a basis' }), help: 'Occurrence answers for an occurrence during the period; claims-made answers only for a claim made during the period. The register tests the trigger day against the period for both.' },
    { name: 'periodStartDay', label: 'Period start (UTC, YYYY-MM-DD)', type: 'text', required: true, value: todayIso() },
    { name: 'periodEndDay', label: 'Period end (UTC, YYYY-MM-DD)', type: 'text', required: true, help: 'Both ends are inclusive: the trigger day on either end is inside the period.' },
    { name: 'notificationWindowDays', label: 'Notification window (whole days)', type: 'number', min: 0, max: L.notificationWindowMaxDays, required: true, help: `Between 0 and ${L.notificationWindowMaxDays}. There is no default window in this register: a window belongs to the policy and the insurer, and you declare it.` },
    { name: 'triggerRef', label: 'Trigger (unsupported classes only)', type: 'textarea', rows: 2, help: `Required for “other”: the fact that starts the notification window, in at least ${L.textMin} characters.` },
    { name: 'currency', label: 'Currency', type: 'text', required: true, value: 'GBP', help: 'Three letters. Amounts in this register are exact minor units in one named currency.' },
    { name: 'limitMinor', label: 'Limit, minor units (optional)', type: 'number', min: 0, help: 'Optional. A whole number of minor units — 5000000 is £50,000.00. A fractional value is refused, never rounded.' },
    { name: 'deductibleMinor', label: 'Deductible / excess, minor units (optional)', type: 'number', min: 0, help: 'Optional. A whole number of minor units. A fractional value is refused, never rounded.' },
    {
      name: 'responsibleIds', label: 'Responsible hands (one to four)', type: 'boolean-block', required: true,
      options: candidates.map((row) => ({ value: row.id, label: `${row.name}${row.role ? ` — ${row.role}` : ''}` })),
      help: 'Every hand answerable for this policy, across every reporting line. The authority to answer for the notification is computed above ALL of them, so name all of them.',
    },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.insuranceDeclarePolicy({
      ...values,
      notificationWindowDays: Number(values.notificationWindowDays),
      limitMinor: values.limitMinor === '' || values.limitMinor === undefined ? null : Number(values.limitMinor),
      deductibleMinor: values.deductibleMinor === '' || values.deductibleMinor === undefined ? null : Number(values.deductibleMinor),
      triggerRef: values.triggerRef || null,
      responsibleIds: values.responsibleIds,
    });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The policy was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Policy declared. No deadline exists yet: the register derives one only once a coverage is linked.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Declare an insurance policy',
    description: 'The declaration-page reference, the insurer, the class, the basis, the period, the declared window, and who answers for it.',
    size: 'lg',
    body: h('div', { class: 'stack' },
      banner({
        tone: 'caution',
        title: 'No notification window is stored, and none is defaulted',
        body: 'Every day count on this register is derived from the trigger day and the window the policy itself declares. A coverage with no readable window prints “notification unprovable” and no day count — it never falls back on the opening date.',
      }),
      form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Declare policy', onClick: submit, primary: true }],
  });
}

function coverageDialog(ctx, report, onDone) {
  const matters = report.policies.map(() => null);
  const matterOptions = (report.claimRows || []).map((row) => ({ value: row.matter.id, label: `${row.matter.partyRef} — ${row.matter.matterRef}` }));
  const policyOptions = report.policies.map((policy) => ({ value: policy.id, label: `${policy.insurerRef} — ${policy.policyRef}` }));
  const form = buildForm([
    { name: 'matterId', label: 'Matter (from the claim register)', type: 'select', required: true, options: options(matterOptions, { blank: 'Choose a matter' }), help: 'The matter on the claim register whose gross exposure this policy may answer for.' },
    { name: 'policyId', label: 'Policy', type: 'select', required: true, options: options(policyOptions, { blank: 'Choose a policy' }), help: 'One link per (matter, policy) pair. The cover test — trigger day against period — is derived on read.' },
    { name: 'coveredMinor', label: 'Covered amount, minor units (optional)', type: 'number', min: 0, help: 'Optional. Where the policy answers for part of the loss only. A whole number of minor units; a fractional value is refused.' },
    { name: 'currency', label: 'Currency (with the covered amount)', type: 'text' },
    { name: 'basisRef', label: 'Basis for the link', type: 'textarea', rows: 3, required: true, help: `At least ${L.textMin} characters — the policy wording, the broker advice, the coverage opinion. A link with no basis is a guess.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.insuranceDeclareCoverage({
      matterId: values.matterId,
      policyId: values.policyId,
      coveredMinor: values.coveredMinor === '' || values.coveredMinor === undefined ? null : Number(values.coveredMinor),
      currency: values.currency || null,
      basisRef: values.basisRef,
    });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The coverage was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Coverage declared. The cover test and the notification deadline are derived on read.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Declare a coverage',
    description: 'Link a matter on the claim register to a policy on this register.',
    size: 'lg',
    body: h('div', { class: 'stack' }, form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Declare coverage', onClick: submit, primary: true }],
  });
}

function notificationDialog(ctx, report, presetCoverageId, onDone) {
  const coverages = report.rows
    .filter((row) => !row.notification)
    .map((row) => ({ value: row.coverage.id, label: coverageLabel(row) }));
  const form = buildForm([
    { name: 'coverageId', label: 'Coverage', type: 'select', required: true, options: options(coverages, { blank: 'Choose a coverage with no notification' }), value: presetCoverageId || '' },
    { name: 'method', label: 'Notification method', type: 'select', required: true, options: options(INS_NOTIFICATION_METHODS.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose a method' }), help: 'A broker notification, a direct notice to the insurer and a notice of circumstances are different acts and are printed apart.' },
    { name: 'notifiedDay', label: 'Notified on (UTC, YYYY-MM-DD)', type: 'text', required: true, value: todayIso() },
    { name: 'referenceRef', label: 'Reference that proves it', type: 'text', required: true, help: `At least ${L.instrumentMin} characters — the broker reference, the insurer reference, the circumstances reference.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.insuranceRecordNotification(values);
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The notification was refused.', 'bad');
      return;
    }
    closeAllModals();
    if (result.warning) toast(result.warning, 'warn');
    else toast('Notification recorded. Timeliness is derived on read against the policy’s own window.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Record a notification',
    description: 'The insurer was told, on a stated day, by a stated method, with a stated reference. A late notification is kept as a breach fact.',
    size: 'lg',
    body: h('div', { class: 'stack' }, form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record notification', onClick: submit, primary: true }],
  });
}

function recoveryDialog(ctx, report, presetCoverageId, onDone) {
  const coverages = report.rows.map((row) => ({ value: row.coverage.id, label: coverageLabel(row) }));
  const form = buildForm([
    { name: 'coverageId', label: 'Coverage', type: 'select', required: true, options: options(coverages, { blank: 'Choose a coverage' }), value: presetCoverageId || '' },
    { name: 'kind', label: 'Kind of recovery', type: 'select', required: true, options: options(INS_RECOVERY_KINDS.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose a kind' }), help: 'A claim opens the recovery, a payment reduces the net cost, a denial moves it back to gross. They are printed apart.' },
    { name: 'atDay', label: 'Dated (UTC, YYYY-MM-DD)', type: 'text', required: true, value: todayIso() },
    { name: 'amountMinor', label: 'Amount, minor units (all kinds except denial)', type: 'number', min: 0, help: 'A whole number of minor units. A fractional value is refused rather than rounded into a total. A denial takes no amount.' },
    { name: 'currency', label: 'Currency (with the amount)', type: 'text' },
    { name: 'basisRef', label: 'Basis on the record', type: 'textarea', rows: 3, required: true, help: `At least ${L.textMin} characters — the insurer letter, the settlement, the denial reason.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.insuranceRecordRecovery({
      coverageId: values.coverageId,
      kind: values.kind,
      atDay: values.atDay,
      amountMinor: values.amountMinor === '' || values.amountMinor === undefined ? null : Number(values.amountMinor),
      currency: values.currency || null,
      basisRef: values.basisRef,
    });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The recovery was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Recovery recorded as its own dated instrument. The net cost is derived on read.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Record a recovery',
    description: 'The insurer’s answer moving, dated, based and exact.',
    size: 'lg',
    body: h('div', { class: 'stack' }, form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record recovery', onClick: submit, primary: true }],
  });
}

function conventionsDialog(ctx, report, onDone) {
  const conv = report.conventions;
  const form = buildForm([
    { name: 'insPrivacyFloor', label: 'Privacy floor for per-state exports', type: 'number', min: 2, max: 20, required: true, value: conv.insPrivacyFloor, help: 'A per-state count below this floor is exported BLANK with its reason, never as a small number.' },
    { name: 'insWarningHorizonDays', label: 'Warning horizon (days)', type: 'number', min: 1, max: 365, required: true, value: conv.insWarningHorizonDays, help: 'How far ahead the bench wants to see a notification deadline. This is a PLANNING convention and is never a notification window — the window is declared on each policy.' },
    { name: 'insAutoPropagate', label: 'The rule may file dated asks', type: 'checkbox', value: conv.insAutoPropagate !== false, checkboxLabel: 'ON — a pause is a pause that leaves a notification window running out unanswered', help: 'Pause-governed on every path, including the explicit scan. A notification window runs out on the calendar with nobody having written anything.' },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.insuranceSetConventions({
      insPrivacyFloor: Number(values.insPrivacyFloor),
      insWarningHorizonDays: Number(values.insWarningHorizonDays),
      insAutoPropagate: Boolean(values.insAutoPropagate),
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
    description: 'Three declared switches. None of them is a notification window — those are declared per policy and never defaulted.',
    body: h('div', { class: 'stack' }, form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Save conventions', onClick: submit, primary: true }],
  });
}

/* --------------------------------------------------------------------- panels */

function summaryCard(report) {
  const t = report.totals;
  return card({
    title: 'What the register holds at this instant',
    subtitle: 'Every figure is derived on read from declared policies, windows, trigger days, notifications and recoveries. No state is stored, and a passed deadline is never upgraded into an allegation about what the insurer did.',
    body: h('div', { class: 'stat-grid' },
      stat({ label: 'Coverages', value: h('span', { 'data-testid': 'ins-count-coverages' }, String(t.coverages)), hint: `${t.holders} responsible hand(s) · ${t.linesN} line(s)` }),
      stat({ label: 'Open', value: h('span', { 'data-testid': 'ins-count-open' }, String(t.open)), hint: `${t.unnotified} unnotified` }),
      stat({ label: 'Notification urgent', value: h('span', { 'data-testid': 'ins-count-urgent' }, String(t.notificationUrgent)), hint: 'inside the narrow bands' }),
      stat({ label: 'Notification late', value: h('span', { 'data-testid': 'ins-count-late' }, String(t.notificationLate)), hint: `${t.daysOverTotal} whole day(s) over in total` }),
      stat({ label: 'No cover', value: h('span', { 'data-testid': 'ins-count-nocover' }, String(t.noCover)), hint: 'trigger day outside the period' }),
      stat({ label: 'Recovered', value: h('span', { 'data-testid': 'ins-count-recovered' }, String(t.recovered)), hint: `${t.partiallyRecovered} partially · ${t.recoveryDenied} denied` }),
      stat({ label: 'Net cost', value: h('span', { 'data-testid': 'ins-count-net' }, t.netTotalMinor === null ? 'withheld' : moneyIn(report, t.netTotalMinor)), hint: 'gross less what the insurer paid' }),
      stat({ label: 'Your attention', value: h('span', { 'data-testid': 'ins-count-attention' }, String(report.attention.total)), hint: 'late, urgent, unprovable, no cover, denied' }),
    ),
  });
}

function insuranceBanners(report) {
  const parts = report.balances.statesReconcile && report.balances.notificationsReconcile
    && report.balances.recoveriesReconcile && report.balances.oneNotificationPerCoverage;
  return h('div', { class: 'stack' },
    banner({
      tone: parts ? 'info' : 'bad',
      title: parts
        ? 'The parts re-add: every state, notification and recovery ties to the coverage it summarises'
        : 'The printed counts do NOT re-add to the rows they summarise',
      body: `States ${report.stateTotal} of ${report.totals.coverages} coverage(s) · ${report.notifications.length} notification(s) · ${report.recoveries.length} recovery(ies). This is the first claim. It says nothing about whether the register could see everything.`,
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
      title: 'A passed deadline is not proof that cover was lost',
      body: 'The record proves the deadline this coverage’s own trigger day and policy window produce. It holds no insurer feed, no broker acknowledgement and no coverage opinion, so it cannot say whether the insurer accepted the late notice — and it never asserts that cover was lost.',
    }),
    report.detailed ? null : banner({ tone: 'caution', title: 'Responsible hands withheld at this altitude', body: report.disclosure.reason }),
  );
}

function coverageFlags(row) {
  const flags = [];
  if (!row.deadlineProvable) flags.push(badge('no deadline derivable', 'bad'));
  if (!row.hasCover && row.coverTest === false) flags.push(badge('outside period', 'bad'));
  if (row.lateBy !== null && row.lateBy > 0) flags.push(badge(`${row.lateBy} day(s) late`, 'bad'));
  if (row.denied) flags.push(badge('denied', 'bad'));
  if (row.orphan) flags.push(badge('orphan — no resolvable line', 'warn'));
  return flags.length ? h('div', { class: 'row-actions' }, ...flags) : '—';
}

function coveragesTable(ctx, report, candidates, onDone) {
  return card({
    title: 'Coverages, by urgency of the notification clock',
    subtitle: 'Sorted by how close the notification deadline is, then by the net cost the record can prove. The deadline is derived from the trigger day and the window the policy itself declares. Cover is tested against the period.',
    body: report.rows.length
      ? table({
        columns: [
          { label: 'Insurer · policy', render: (row) => h('div', null, h('div', null, row.policy.insurerRef), h('div', { class: 'small muted' }, row.policy.policyRef)) },
          { label: 'Class · basis', render: (row) => (row.classDefinition ? row.classDefinition.label : badge('unsupported class', 'neutral')) },
          { label: 'Period', render: (row) => h('div', null, h('div', null, `${row.policy.periodStartDay} → ${row.policy.periodEndDay}`), h('div', { class: 'small muted' }, `${row.policy.basis}`)) },
          { label: 'Trigger', render: (row) => (row.triggerDay ? h('div', null, h('div', null, row.triggerDay), h('div', { class: 'small muted' }, row.triggerIsClaimMade ? 'claim-made' : 'occurrence')) : badge('not derivable', 'bad')) },
          { label: 'Deadline', render: (row) => (row.deadlineDay ? h('div', null, h('div', null, row.deadlineDay), h('div', { class: 'small muted' }, `window ${row.windowDays} d`)) : '—') },
          { label: 'Days', render: (row) => (Number.isInteger(row.daysRemaining) ? (row.daysRemaining < 0 ? `${row.daysOver} overdue` : dayLabel(row.daysRemaining)) : '—') },
          { label: 'Net cost', render: (row) => (Number.isInteger(row.netMinor) ? moneyIn(report, row.netMinor) : 'not derivable') },
          { label: 'State', render: (row) => stateBadge(row.state) },
          { label: 'Flags', render: (row) => coverageFlags(row) },
          {
            label: '',
            render: (row) => button(
              row.notification ? 'Record recovery' : 'Record notification',
              () => (row.notification ? recoveryDialog(ctx, report, row.coverage.id, onDone) : notificationDialog(ctx, report, row.coverage.id, onDone)),
              { testid: 'ins-action-next' },
            ),
          },
        ],
        rows: report.rows,
        caption: 'Insurance coverages',
        emptyMessage: 'No coverage has been declared. That is either a year with no claims — or a policy nobody linked to the claim it answers for.',
      })
      : emptyState({
        title: 'No coverage on the record',
        body: 'Declare a policy, then link it to a matter on the claim register. No deadline can be derived until the link exists.',
        action: { label: 'Declare a policy', onClick: () => policyDialog(ctx, candidates, onDone) },
      }),
  });
}

function notificationsPanel(ctx, report, candidates, onDone) {
  const rows = report.rows.filter((row) => row.deadlineDay || row.state.key === 'notification-unprovable');
  const notifications = report.notifications.map((notification) => ({
    notification,
    row: report.rows.find((candidate) => candidate.coverage.id === notification.coverageId) || null,
  })).filter((entry) => entry.row);
  return h('div', { class: 'stack' },
    card({
      title: 'Notification clocks, with the arithmetic printed',
      subtitle: 'Trigger day + declared window = deadline. The deadline day itself is the last day the insurer may be told. A notification on that day is in time; the day after is one day over.',
      body: rows.length
        ? table({
          columns: [
            { label: 'Insurer · policy', render: (row) => h('div', null, h('div', null, row.policy.insurerRef), h('div', { class: 'small muted' }, row.policy.policyRef)) },
            { label: 'Trigger day', render: (row) => row.triggerDay || '—' },
            { label: 'Window', render: (row) => (Number.isInteger(row.windowDays) ? `${row.windowDays} day(s)` : '—') },
            { label: 'Deadline', render: (row) => row.deadlineDay || h('span', { class: 'small muted' }, 'not derivable') },
            { label: 'Notified', render: (row) => (row.notification ? row.notification.notifiedDay : '—') },
            { label: 'Whole days', render: (row) => (Number.isInteger(row.daysRemaining) ? (row.daysRemaining < 0 ? badge(`${row.daysOver} over`, 'bad') : badge(dayLabel(row.daysRemaining), row.daysRemaining <= report.conventions.insWarningHorizonDays ? 'warn' : 'good')) : badge('refused', 'bad')) },
            { label: 'Late by', render: (row) => (row.lateBy !== null && row.lateBy > 0 ? badge(`${row.lateBy} day(s)`, 'bad') : (row.lateBy === 0 ? 'in time' : '—')) },
            { label: 'State', render: (row) => stateBadge(row.state) },
          ],
          rows,
          caption: 'Notification arithmetic',
          emptyMessage: 'No coverage carries a derivable deadline yet, so no clock is derivable on this register.',
        })
        : emptyState({ title: 'No clock to show', body: 'Declare a coverage against a policy and its deadline is derived here, with the trigger day and the window printed beside it.' }),
    }),
    card({
      title: 'Notifications recorded',
      subtitle: 'The insurer was told, on a stated day, by a stated method, with a stated reference. A late notification is kept as a breach fact and prints its exact days over.',
      body: notifications.length
        ? table({
          columns: [
            { label: 'Insurer · policy', render: (entry) => h('div', null, h('div', null, entry.row.policy.insurerRef), h('div', { class: 'small muted' }, entry.row.policy.policyRef)) },
            { label: 'Method', render: (entry) => entry.notification.method },
            { label: 'Notified', render: (entry) => entry.notification.notifiedDay },
            { label: 'Reference', render: (entry) => h('span', { class: 'small' }, entry.notification.referenceRef) },
            { label: 'Deadline', render: (entry) => entry.row.deadlineDay || '—' },
            { label: 'Timeliness', render: (entry) => (entry.row.lateBy !== null && entry.row.lateBy > 0 ? badge(`${entry.row.lateBy} day(s) late`, 'bad') : badge('in time', 'good')) },
          ],
          rows: notifications,
          caption: 'Notifications',
          emptyMessage: 'No notification is recorded. If the insurer was told, it belongs here the day it was told.',
        })
        : emptyState({ title: 'No notification recorded', body: 'A notification that was given and was not recorded is a notification that will be read as never having been sent.' }),
    }),
    report.rows.length ? h('div', { class: 'row-actions' },
      button('Record a notification', () => notificationDialog(ctx, report, null, onDone)),
      button('Record a recovery', () => recoveryDialog(ctx, report, null, onDone)),
    ) : null,
  );
}

function recoveriesPanel(ctx, report, candidates, onDone) {
  const rows = report.rows.filter((row) => row.recoveries.length || row.grossMinor !== null);
  return h('div', { class: 'stack' },
    card({
      title: 'Gross, recovery and the derived net cost',
      subtitle: 'The gross exposure is the provision; the recovery is the insurance asset; the net cost is the figure finance carries. The three are printed apart so a provision is never confused with money spent.',
      body: rows.length
        ? table({
          columns: [
            { label: 'Insurer · policy', render: (row) => h('div', null, h('div', null, row.policy.insurerRef), h('div', { class: 'small muted' }, row.policy.policyRef)) },
            { label: 'Gross', render: (row) => (Number.isInteger(row.grossMinor) ? moneyIn(report, row.grossMinor) : '—') },
            { label: 'Claimed', render: (row) => (row.claimedMinor ? moneyIn(report, row.claimedMinor) : '—') },
            { label: 'Recovered', render: (row) => (row.recoveredMinor ? moneyIn(report, row.recoveredMinor) : '—') },
            { label: 'Net cost', render: (row) => (Number.isInteger(row.netMinor) ? moneyIn(report, row.netMinor) : badge('not derivable', 'bad')) },
            { label: 'State', render: (row) => stateBadge(row.state) },
          ],
          rows,
          caption: 'Recoveries and net cost',
          emptyMessage: 'No coverage carries a gross exposure or a recovery yet.',
        })
        : emptyState({ title: 'Nothing to recover yet', body: 'Link a policy to a matter with a gross exposure and this panel derives the net cost the organisation carries.' }),
    }),
    report.rows.length ? h('div', { class: 'row-actions' },
      button('Record a recovery', () => recoveryDialog(ctx, report, null, onDone)),
      button('Record a notification', () => notificationDialog(ctx, report, null, onDone))) : null,
  );
}

function methodView(report) {
  return h('div', { class: 'stack' },
    card({
      title: 'What this register is, and what it refuses to be',
      body: h('div', { class: 'stack' },
        h('img', {
          src: DIAGRAM_URL,
          alt: 'A method figure showing an insurance policy with the trigger day that starts the notification window and the window the policy itself declares, the derived deadline, a notification recorded in time and a late one printed as a breach, the cover test against the policy period, and the gross exposure less the recovery derived as the net cost the organisation carries.',
          class: 'method-figure',
        }),
        kv('Engine', INS_METHOD.engine),
        kv('Decision record', INS_METHOD.adr),
        kv('CSV scope', INS_CSV_SCOPE),
        kv('As at', `${report.asOf} (${report.nowIso})`),
        h('h3', null, 'Frameworks applied'),
        h('ul', null, ...INS_METHOD.frameworks.map((line) => h('li', null, line))),
        h('h3', null, 'What is printed'),
        h('ul', null, ...INS_METHOD.printed.map((line) => h('li', null, line))),
        h('h3', null, 'Deliberately absent'),
        h('ul', null, ...INS_METHOD.deliberatelyAbsent.map((line) => h('li', null, line))),
        h('h3', null, 'Disclosure'),
        banner({ tone: 'caution', title: 'A rendering contract, not an authentication boundary', body: 'Seats in this workspace are workflow declarations, not logins. The reader withholds responsible hands above rank 3, and this page says so rather than implying a permission system the workspace cannot enforce. An insurance register is commercially sensitive: the export carries counts, day extremes and whole-register minor-unit totals only.' }),
      ),
    }),
  );
}

/* ------------------------------------------------------------------------ page */

export function renderInsurance(ctx) {
  const view = ctx.query?.get?.('view') || 'coverages';
  let report;
  try {
    const result = ctx.api.insuranceReport();
    if (!result?.ok) {
      return h('div', { class: 'stack' },
        pageHeader({ eyebrow: 'Governance · insurance', title: 'Insurance & recovery', subtitle: 'Which policy answers for each claim, when the insurer must be told, whether it was told in time, and what the organisation actually carries.' }),
        banner({ tone: 'bad', title: 'The register could not be read', body: result?.error || 'The seat could not be resolved.' }));
    }
    report = result.report;
  } catch (error) {
    return h('div', { class: 'stack' },
      pageHeader({ eyebrow: 'Governance · insurance', title: 'Insurance & recovery' }),
      banner({ tone: 'bad', title: 'The register could not be read', body: error?.message || 'Unknown error.' }));
  }

  let candidates = [];
  try {
    const result = ctx.api.insuranceCandidates();
    if (result?.ok) candidates = result.people;
  } catch { candidates = []; }

  // The claim register's matters, for the coverage dialog. Read through the
  // claim register's own reader so this view cannot drift from it.
  let claimRows = [];
  try {
    const claimResult = ctx.api.claimReport();
    if (claimResult?.ok) claimRows = claimResult.report.rows || [];
  } catch { claimRows = []; }
  report.claimRows = claimRows;

  const onDone = () => {
    document.dispatchEvent(new CustomEvent('leados:navigate', { detail: { route: INS_HREF } }));
    ctx.rerender?.();
  };
  const local = { api: ctx.api };
  const viewKey = VIEWS.some((row) => row.key === view) ? view : 'coverages';

  const exportCsv = () => {
    try {
      const file = exportWorkspaceCsv(ctx.api.getState ? ctx.api.getState() : ctx.state, INS_CSV_SCOPE);
      if (!file?.ok) { toast(file?.error || 'The export produced no file.', 'bad'); return; }
      downloadText(file.filename, file.csv, 'text/csv');
      toast('Exported. Counts, day extremes and whole-register minor-unit totals only: no insurer, policy reference, matter reference, person or day crosses this boundary.', 'good');
    } catch (error) {
      toast(error?.message || 'The export failed.', 'bad');
    }
  };

  const header = pageHeader({
    eyebrow: 'Governance · insurance',
    title: 'Insurance & recovery',
    subtitle: 'Which policy answers for each claim, the trigger day that starts the notification window and the window the policy itself declares, whether the insurer was told in time, what the insurer paid, and the net cost the organisation actually carries.',
    actions: [
      { label: 'Declare a policy', onClick: () => policyDialog(local, candidates, onDone), primary: true },
      { label: 'Export (counts)', onClick: exportCsv },
      { label: 'Conventions', onClick: () => conventionsDialog(local, report, onDone) },
    ],
    meta: [
      `As at ${report.asOf}`,
      `${report.totals.coverages} coverage(s) · ${report.totals.open} open`,
      `${report.totals.notificationLate} late · ${report.totals.noCover} no cover`,
      report.detailed ? 'names shown' : 'counts only at this altitude',
    ],
  });

  const body = h('div', { class: 'stack' },
    summaryCard(report),
    insuranceBanners(report),
    tabs({ items: VIEWS, active: viewKey, onSelect: (key) => { window.location.hash = `${INS_HREF}?view=${key}`; }, ariaLabel: 'Insurance sections' }),
    viewKey === 'notifications' ? notificationsPanel(local, report, candidates, onDone)
      : viewKey === 'recoveries' ? recoveriesPanel(local, report, candidates, onDone)
        : viewKey === 'method' ? methodView(report)
          : coveragesTable(local, report, candidates, onDone),
    viewKey !== 'method' ? h('div', { class: 'row-actions' },
      button('Declare a coverage', () => coverageDialog(local, report, onDone)),
      button('Record a notification', () => notificationDialog(local, report, null, onDone)),
      button('Record a recovery', () => recoveryDialog(local, report, null, onDone))) : null,
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
        subtitle: 'A policy names hands across lines. Every active line that holds a hand is counted here, and a person appears once on each line that genuinely holds them — never doubled because they have two managers.',
        body: table({
          columns: [
            { label: 'Line', render: (row) => row.managerName },
            { label: 'Coverages', render: (row) => `${row.coveragesN}` },
            { label: 'Open', render: (row) => `${row.openN}` },
            { label: 'Urgent', render: (row) => (row.urgentN ? badge(String(row.urgentN), 'warn') : '—') },
            { label: 'Late', render: (row) => (row.lateN ? badge(String(row.lateN), 'bad') : '—') },
            { label: 'No cover', render: (row) => (row.noCoverN ? badge(String(row.noCoverN), 'bad') : '—') },
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
