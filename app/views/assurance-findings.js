/**
 * app/views/assurance-findings.js — `#/findings`, the Assurance Finding &
 * Remediation Register (ADR-0232, Schema v187).
 *
 * ONE reader (`buildAssuranceReport`, standing on the `buildAssuranceFindings`
 * kernel) behind every state, flag, count and rate this page prints. The page
 * formats what the reader returned; it computes no state, no overdue flag, no
 * recurrence and no rate of its own.
 *
 * THE THREE THINGS THIS SCREEN KEEPS APART:
 *   1. THE FINDING — what failed, against what criteria, on which accountable
 *      lines, and by when the fix and the test are owed;
 *   2. THE ACTS — the holder's assignment, the owner's assertion, the
 *      independent verification, and (only if it comes to it) an executive
 *      acceptance of the residual risk. Nothing closes by the passage of time and
 *      nothing closes on the owner's word;
 *   3. THE CLAIMS — "the rows add up" (`partitionReconciles`) and "no refused
 *      act, no dropped row" (`figuresComplete`), printed apart.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, table } from '../ui/components.js';
import {
  AFR_HREF,
  AFR_LIMITS,
  AFR_METHOD,
  AFR_SEVERITIES,
  AFR_SOURCES,
  AFR_STATES,
} from '../core/domain/assuranceRegistry.js';

const L = AFR_LIMITS;
const DIAGRAM_URL = './app/assets/assurance-finding-method.jpg';
const VIEWS = [
  { key: 'rows', label: 'Findings' },
  { key: 'lines', label: 'By accountable line' },
  { key: 'counts', label: 'Counts, aging & on-time' },
  { key: 'refusals', label: 'Refused acts' },
  { key: 'method', label: 'Method' },
];

const STATE_TONE = {
  'open-unassigned': 'bad',
  'open-partially-assigned': 'caution',
  remediating: 'caution',
  'asserted-awaiting-verification': 'info',
  'rejected-remediation-owed': 'bad',
  'closed-verified': 'good',
  'closed-accepted': 'neutral',
};
const STATE_SHORT = Object.fromEntries(AFR_STATES.map((row) => [row.key, row.label.split(' — ')[0]]));
const LINE_TONE = {
  unassigned: 'bad',
  remediating: 'caution',
  asserted: 'info',
  verified: 'good',
  rejected: 'bad',
};
const SEVERITY_TONE = {
  observation: 'neutral',
  deficiency: 'caution',
  'significant-deficiency': 'caution',
  'material-weakness': 'bad',
};
const SOURCE_SHORT = Object.fromEntries(AFR_SOURCES.map((row) => [row.key, row.label]));
const SEVERITY_SHORT = Object.fromEntries(AFR_SEVERITIES.map((row) => [row.key, row.label.split(' — ')[0]]));

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

const when = (day) => (day ? String(day) : '—');
const pct = (bp) => (bp === null || bp === undefined ? '—' : `${(bp / 100).toFixed(2)}%`);

/* ------------------------------------------------------------------ dialogs */

function declareDialog(ctx, candidates, onDone) {
  const lineRows = (candidates?.lines || []).map((line) => ({
    value: `${line.personId}|${line.id}`,
    label: `${line.personName} · ${line.kind} line under ${line.managerName}`,
  }));
  const form = buildForm([
    { name: 'controlRef', label: 'The control that did not operate', type: 'text', required: true, help: `At least ${L.refMin} characters — the control, process or check, named so a reviewer could go and look at it.` },
    { name: 'scopeRef', label: 'Where it applies', type: 'text', required: true, help: `At least ${L.refMin} characters — the unit, entity, site or system in scope.` },
    { name: 'criteriaRef', label: 'What it should have been', type: 'text', required: true, help: `At least ${L.refMin} characters — the standard, policy or control it departed from. A finding without criteria is an opinion.` },
    {
      name: 'source', label: 'Who found it', type: 'select', required: true,
      options: options(AFR_SOURCES.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose the source' }),
      help: 'A closed list, so “an audit said so” and “the person doing the work said so” stay different facts.',
    },
    {
      name: 'severity', label: 'Declared severity', type: 'select', required: true,
      options: options(AFR_SEVERITIES.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose the severity' }),
      help: 'A human judgement about magnitude and likelihood (COSO 2013; PCAOB AS 2201). This register never derives it from a count, a figure or a date.',
    },
    { name: 'statement', label: 'What was found', type: 'textarea', required: true, help: `At least ${L.textMin} characters — what happened, not what it means.` },
    {
      name: 'accountable', label: 'Accountable lines', type: 'boolean-block', required: true,
      options: lineRows,
      help: `Between ${L.accountableMin} and ${L.accountableMax} — the person who holds the accountability and the line they hold it on. A cross-functional failure usually has more than one.`,
    },
    {
      name: 'remediationDays', label: 'Fix owed within (days)', type: 'select', required: true,
      options: options([7, 14, 30, 60, 90, 180, 365].map((d) => ({ value: String(d), label: `${d} day${d === 1 ? '' : 's'}` })), { blank: 'Choose the window' }),
      help: `A commitment the record can break visibly — between ${L.remediationMinDays} and ${L.remediationMaxDays} days.`,
    },
    {
      name: 'verificationDays', label: 'Verification owed within (days after the fix date)', type: 'select', required: true,
      options: options([7, 14, 30, 60, 90, 180, 365].map((d) => ({ value: String(d), label: `${d} day${d === 1 ? '' : 's'}` })), { blank: 'Choose the window' }),
      help: `The day an INDEPENDENT test is owed by — between ${L.verificationMinDays} and ${L.verificationMaxDays} days after the remediation target.`,
    },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const accountable = (Array.isArray(values.accountable) ? values.accountable : [])
      .map((entry) => {
        const [personId, lineId] = String(entry).split('|');
        return { personId, lineId };
      });
    const result = ctx.api.assuranceFindingDeclare({
      ...values,
      accountable,
      remediationDays: values.remediationDays ? Number(values.remediationDays) : undefined,
      verificationDays: values.verificationDays ? Number(values.verificationDays) : undefined,
    });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The finding was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Finding declared. Each accountable line now owes an owner and a day; the register prints it if they miss it.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Declare an assurance finding',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'Named, dated and accountable', body: 'You are putting this on the record in your own name. The accountable lines you name must then assign the work themselves — being named is an ask, not a verdict.' }),
      lineRows.length ? null : banner({ tone: 'caution', title: 'No declared reporting line exists yet', body: 'A finding names the line a person is accountable on. Declare the reporting line first; the register will not invent one.' }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Declare finding', onClick: submit }],
  });
}

function assignDialog(ctx, row, entry, onDone) {
  const owners = (ctx.assuranceFindingCandidates?.owners || []).map((p) => ({ value: p.id, label: `${p.name}${p.role ? ` · ${p.role}` : ''}` }));
  const form = buildForm([
    {
      name: 'ownerId', label: 'Who owns the fix', type: 'select', required: true,
      options: options(owners, { blank: 'Choose the person' }),
      help: 'The owner must be someone this seat reaches — on your tree or on a line you hold. They will assert the fix, and they can never verify it.',
    },
    { name: 'dueOn', label: 'The fix is owed by', type: 'date', required: true, help: `No later than the finding's own remediation date (${row.remediationDueOn}). A line that needs longer is a new finding, not a silent extension.` },
    { name: 'note', label: 'Why this owner and this day', type: 'textarea', required: true, help: `At least ${L.textMin} characters — the reason is what makes the assignment readable a year from now.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.assuranceFindingAssign({ findingId: row.id, lineId: entry.lineId, ...values });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The assignment was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Owner named. The fix is owed by the day you declared, and an independent verification is owed after it.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Name the remediation owner on this line',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'One assignment per line', body: 'A second never overwrites the first. If the owner changes, the record shows both and the later one governs.' }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Name the owner', onClick: submit }],
  });
}

function assertDialog(ctx, row, entry, onDone) {
  const form = buildForm([
    { name: 'changeText', label: 'What actually changed', type: 'textarea', required: true, help: `At least ${L.textMin} characters — the control, the step, the system.` },
    { name: 'evidenceRef', label: 'The evidence you would show a reviewer', type: 'text', required: true, help: `At least ${L.refMin} characters — a record, a report, a test, a sample. Named, not attached: this register does not check that it exists.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.assuranceFindingAssert({ findingId: row.id, lineId: entry.lineId, ...values });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The assertion was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Fix asserted. It closes nothing — an independent verification is now owed.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Assert the fix',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'An assertion is a claim, not a closure', body: 'Only a seat strictly above you can test this. That separation is the whole point: a remediation that closes on its owner’s word is not a remediation.' }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Assert the fix', onClick: submit }],
  });
}

function verifyDialog(ctx, row, entry, onDone) {
  const form = buildForm([
    {
      name: 'decision', label: 'Your verdict', type: 'select', required: true,
      options: options([
        { value: 'confirm', label: 'Confirm — the fix works' },
        { value: 'reject', label: 'Reject — the fix does not hold' },
      ], { blank: 'Choose the verdict' }),
      help: 'A closed list, so the counts mean one thing.',
    },
    { name: 'methodText', label: 'How you tested it', type: 'textarea', required: true, help: `At least ${L.textMin} characters — what you looked at, over what period, and what you saw.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.assuranceFindingVerify({ findingId: row.id, lineId: entry.lineId, ...values });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The verification was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast(values.decision === 'confirm'
      ? 'Verified. The line is closed on an independent reading, not on the owner’s word.'
      : 'Rejected. The line owes the fix again — a rejection closes nothing.', values.decision === 'confirm' ? 'good' : 'caution');
    onDone?.();
  };
  openModal({
    title: 'Verify the fix independently',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'Independence is the control', body: 'You may take this act because you sit strictly above the remediation owner on the reporting graph. The owner never grades their own fix, and neither does anybody below them.' }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record the verdict', onClick: submit }],
  });
}

function acceptDialog(ctx, row, onDone) {
  const form = buildForm([
    { name: 'reason', label: 'Why the residual risk is acceptable', type: 'textarea', required: true, help: `At least ${L.textMin} characters — what it would cost to fix, and what the enterprise is choosing instead.` },
    { name: 'reviewOn', label: 'Revisit this acceptance on', type: 'date', required: true, help: 'A future day. An acceptance with no review date is a decision to forget.' },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.assuranceFindingAccept({ findingId: row.id, ...values });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The acceptance was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Residual risk accepted, dated and owned. This is not a verification and the register prints it as one.', 'caution');
    onDone?.();
  };
  openModal({
    title: 'Accept the residual risk',
    body: h('div', { class: 'stack' },
      banner({ tone: 'caution', title: 'An executive act, never the owner’s', body: 'Acceptance closes the finding without a verified fix. It is refused from anyone who owns remediation on this finding: the party who failed to fix it does not decide that the enterprise can live with the risk.' }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Accept the residual risk', onClick: submit }],
  });
}

/* -------------------------------------------------------------------- views */

function summaryCard(report) {
  const c = report.counts;
  return card({
    title: 'The register in six numbers',
    subtitle: 'States, flags and counts are re-derived on every read; nothing here is stored.',
    body: h('div', { class: 'stat-row' },
      stat({ label: 'Findings', value: String(c.findings) }),
      stat({ label: 'Open', value: String(c.open), tone: c.open ? 'warn' : undefined }),
      stat({ label: 'Remediation overdue', value: String(c.overdue.remediation), tone: c.overdue.remediation ? 'warn' : undefined }),
      stat({ label: 'Verification overdue', value: String(c.overdue.verification), tone: c.overdue.verification ? 'warn' : undefined }),
      stat({ label: 'Repeat after a verified fix', value: c.recurrence?.withheld ? 'withheld' : String(c.recurrence?.recurrent ?? 0), tone: c.recurrence?.recurrent ? 'warn' : undefined }),
      stat({ label: 'Dropped rows', value: String(c.droppedRows || 0), tone: c.droppedRows ? 'warn' : undefined }),
    ),
  });
}

function claimsBanners(report) {
  return h('div', { class: 'stack' },
    report.partitionReconciles
      ? banner({ tone: 'good', title: 'The rows add up', body: 'Every printed state count sums to the finding total (`partitionReconciles`).' })
      : banner({ tone: 'bad', title: 'The rows do NOT add up', body: 'The printed state counts do not sum to the finding total. Do not read a figure from this page until the record is repaired.' }),
    report.figuresComplete
      ? banner({ tone: 'good', title: 'Nothing refused, nothing dropped', body: 'No dropped row sits behind these figures (`figuresComplete`).' })
      : banner({ tone: 'caution', title: 'Figures carry dropped rows behind them', body: `${report.counts.droppedRows} stored row(s) were refused by the loader and are counted, not repaired. Nothing on this page was invented from them.` }),
    report.counts.unresolvedLines
      ? banner({ tone: 'caution', title: `${report.counts.unresolvedLines} accountable line(s) no longer resolve`, body: 'A line the reporting graph no longer carries is printed on the finding it belongs to. The register never moves that accountability to another line by itself — a human declares the change.' })
      : null,
  );
}

function rowsView(ctx, report, onDone) {
  const self = ctx.state?.settings?.activeSeatId || null;
  const columns = [
    {
      label: 'Control / scope',
      render: (r) => h('div', { class: 'stack-tight' },
        h('strong', null, r.controlRef),
        h('span', { class: 'small muted' }, r.scopeRef),
        h('span', { class: 'small muted' }, `against ${r.criteriaRef}`)),
    },
    { label: 'Found by', render: (r) => h('span', { class: 'small' }, SOURCE_SHORT[r.source] || r.source) },
    { label: 'Severity', render: (r) => badge(SEVERITY_SHORT[r.severity] || r.severity, SEVERITY_TONE[r.severity] || 'neutral') },
    { label: 'Opened', render: (r) => when(r.openedOn) },
    { label: 'Fix owed', render: (r) => h('span', { class: r.overdue.includes('remediation-overdue') ? 'text-warn' : '' }, when(r.remediationDueOn), r.overdue.includes('remediation-overdue') ? ' · OVERDUE' : '') },
    { label: 'Test owed', render: (r) => h('span', { class: r.overdue.includes('verification-overdue') ? 'text-warn' : '' }, when(r.verifyDueOn), r.overdue.includes('verification-overdue') ? ' · OVERDUE' : '') },
    {
      label: 'Accountable lines',
      render: (r) => h('div', { class: 'stack-tight' }, ...r.accountable.map((entry) => h('div', { class: 'small' },
        badge(entry.lineState, LINE_TONE[entry.lineState] || 'neutral'),
        ` ${entry.personId}${entry.ownerId ? ` → ${entry.ownerId}` : ''}`,
        entry.assignDueOn ? h('span', { class: 'muted' }, ` · by ${entry.assignDueOn}`) : null,
        entry.resolved ? null : h('span', { class: 'text-warn' }, ' · line unresolved')))),
    },
    {
      label: 'State',
      render: (r) => h('div', { class: 'stack-tight' },
        badge(STATE_SHORT[r.state] || r.state, STATE_TONE[r.state] || 'neutral'),
        r.recurrence?.recurrent
          ? h('span', { class: 'small text-warn' }, `repeat of ${r.recurrence.priorFindingId} (verified ${r.recurrence.priorClosedOn || '—'})`)
          : null,
        r.recurrence?.reobserved
          ? h('span', { class: 'small muted' }, `seen again after acceptance in ${r.recurrence.priorFindingId}`)
          : null,
        r.acceptedOn ? h('span', { class: 'small muted' }, `accepted ${r.acceptedOn} · revisit ${r.acceptReviewOn || '—'}`) : null),
    },
    {
      label: '',
      render: (r) => h('div', { class: 'row gap-s' },
        ...r.accountable.map((entry) => h('div', { class: 'row gap-s' },
          entry.lineState === 'unassigned' && entry.personId === self
            ? button('Name owner', () => assignDialog(ctx, r, entry, onDone), { primary: true, testid: `afr-assign-${r.id}-${entry.lineId}` })
            : null,
          (entry.lineState === 'remediating' || entry.lineState === 'rejected') && entry.ownerId === self
            ? button('Assert fix', () => assertDialog(ctx, r, entry, onDone), { primary: true, testid: `afr-assert-${r.id}-${entry.lineId}` })
            : null,
          entry.lineState === 'asserted' && entry.ownerId && entry.ownerId !== self
            ? button('Verify', () => verifyDialog(ctx, r, entry, onDone), { primary: true, testid: `afr-verify-${r.id}-${entry.lineId}` })
            : null)),
        !r.closed && self && !r.accountable.some((entry) => entry.ownerId === self)
          ? button('Accept risk', () => acceptDialog(ctx, r, onDone), { testid: `afr-accept-${r.id}` })
          : null),
    },
  ];
  return h('div', { class: 'stack', 'data-testid': 'afr-rows' },
    h('div', { class: 'row gap-s' },
      button('Declare a finding', () => declareDialog(ctx, ctx.assuranceFindingCandidates, onDone), { primary: true, testid: 'afr-declare' }),
      button('Scan the register', () => {
        const result = ctx.api.assuranceFindingScan();
        if (!result?.ok) { toast(result?.error || 'The scan was refused.', 'bad'); return; }
        toast('Register scanned. Overdue remediation, overdue verification and repeat findings were re-read from the record.', 'good');
        onDone?.();
      }, { testid: 'afr-scan' })),
    report.counts.hidden > 0
      ? banner({ tone: 'info', title: `${report.counts.hidden} finding(s) withheld from this seat`, body: 'A finding is readable by its parties and by the span or lines that hold them. Everything else is withheld and counted — never printed and never dropped.' })
      : null,
    table({
      caption: 'Findings — the control, the accountable lines, what is owed and what came back',
      columns,
      rows: report.rows.map((row) => ({
        ...row,
        attrs: {
          'data-testid': `afr-row-${row.id}`,
          'data-state': row.state,
          'data-recurrent': String(Boolean(row.recurrence?.recurrent)),
          'data-overdue': String(row.overdue.length > 0),
        },
      })),
      emptyMessage: 'No finding is readable from this seat. Until one is declared, a control that failed quietly stays quiet.',
    }),
  );
}

function linesView(report) {
  if (report.ratesWithheld) {
    return h('div', { class: 'stack', 'data-testid': 'afr-lines' },
      banner({ tone: 'caution', title: 'The line table is withheld from this seat', body: report.ratesWithheldReason || 'A rate built from part of the population would read as the enterprise’s.' }));
  }
  const columns = [
    { label: 'Line', render: (r) => h('strong', null, r.code) },
    { label: 'Findings', render: (r) => (r.suppressed ? '—' : String(r.findings)) },
    { label: 'Open', render: (r) => (r.suppressed ? '—' : String(r.open)) },
    { label: 'Overdue', render: (r) => (r.suppressed ? '—' : String(r.overdue)) },
    { label: 'Lines unresolved', render: (r) => (r.suppressed ? '—' : String(r.unresolved)) },
    { label: '', render: (r) => (r.suppressed ? h('span', { class: 'small muted' }, r.suppressedReason) : null) },
  ];
  return h('div', { class: 'stack', 'data-testid': 'afr-lines' },
    banner({ tone: 'info', title: 'This table does not add up on purpose', body: report.lines?.nonAdditiveNote || 'Non-additive: a finding naming two accountable lines is counted under both.' }),
    table({
      caption: 'Accountable-line roll-up — exact integer counts, opaque line codes',
      columns,
      rows: (report.lines?.cells || []).map((cell) => ({
        ...cell,
        attrs: { 'data-testid': `afr-line-${cell.code}`, 'data-suppressed': String(Boolean(cell.suppressed)) },
      })),
      emptyMessage: 'No accountable line is on the record yet.',
    }),
  );
}

function countsView(report) {
  const c = report.counts;
  const rates = report.rates || {};
  const ratesWithheld = Boolean(report.ratesWithheld);
  return h('div', { class: 'stack', 'data-testid': 'afr-counts' },
    ratesWithheld
      ? banner({ tone: 'caution', title: 'The rates are withheld from this seat', body: report.ratesWithheldReason || 'A rate built from part of the population would read as the enterprise’s.' })
      : h('div', { class: 'stat-row' },
        stat({ label: 'Remediation owed (dates passed)', value: String(rates.remediation?.owed ?? 0) }),
        stat({ label: 'Remediated on time', value: String(rates.remediation?.onTime ?? 0) }),
        stat({ label: 'On-time rate', value: pct(rates.remediation?.onTimeBp), hint: 'denominator is the owed count above' }),
        stat({ label: 'Verification owed (dates passed)', value: String(rates.verification?.owed ?? 0) }),
        stat({ label: 'Verified on time', value: String(rates.verification?.onTime ?? 0) }),
        stat({ label: 'On-time rate', value: pct(rates.verification?.onTimeBp), hint: 'denominator is the owed count above' })),
    card({
      title: 'Findings by state',
      body: h('div', { class: 'stat-row' }, ...Object.entries(c.byState || {}).map(([key, value]) => stat({ label: STATE_SHORT[key] || key, value: String(value) }))),
    }),
    card({
      title: 'By declared severity',
      body: h('div', { class: 'stat-row' }, ...Object.entries(c.bySeverity || {}).map(([key, value]) => stat({ label: SEVERITY_SHORT[key] || key, value: String(value) }))),
    }),
    card({
      title: 'By source',
      body: h('div', { class: 'stat-row' }, ...Object.entries(c.bySource || {}).map(([key, value]) => stat({ label: SOURCE_SHORT[key] || key, value: String(value) }))),
    }),
    card({
      title: 'Age of the open findings',
      subtitle: 'Age is printed; it closes nothing and decides nothing.',
      body: h('div', { class: 'stat-row' }, ...Object.entries(c.aging || {}).map(([key, value]) => stat({ label: key, value: String(value) }))),
    }),
    card({
      title: 'Recurrence — two different facts, never added together',
      body: h('div', { class: 'stack' },
        h('div', { class: 'stat-row' },
          stat({ label: 'Repeat after a VERIFIED fix', value: c.recurrence?.withheld ? 'withheld' : String(c.recurrence?.recurrent ?? 0) }),
          stat({ label: 'Seen again after ACCEPTANCE', value: c.recurrence?.withheld ? 'withheld' : String(c.recurrence?.reobserved ?? 0) })),
        c.recurrence?.withheld ? banner({ tone: 'caution', title: 'Recurrence withheld', body: c.recurrence.reason }) : null,
        h('p', { class: 'small muted' }, 'The first is a tested fix that did not hold. The second is a risk somebody agreed to carry and then saw again. Counting them as one number would call a failed fix a decision.')),
    }),
  );
}

function refusalsView(report) {
  return h('div', { class: 'stack', 'data-testid': 'afr-refusals' },
    banner({ tone: 'info', title: 'Refused acts are never applied', body: 'Every act the door refused is counted and printed with its reason. A second assignment never overwrites the first; a verifier who is not independent is refused rather than recorded; the refusal is the control.' }),
    report.warnings?.length
      ? card({ title: 'Rows the loader refused at the door', subtitle: 'Malformed or duplicate rows are dropped and counted; nothing is repaired', body: h('ul', { class: 'list' }, ...report.warnings.map((w) => h('li', { class: 'small' }, w))) })
      : null,
    card({
      title: 'Identity-free observations from RULE-AFR-01',
      subtitle: 'Where the record owes an ask and the reporting graph names nobody who can be asked',
      body: (report.markers || []).length
        ? h('ul', { class: 'list' }, ...report.markers.map((m) => h('li', { class: 'small' }, `${m.at.slice(0, 10)} — ${m.detail}`)))
        : h('p', { class: 'small muted' }, 'No observation recorded.'),
    }),
  );
}

function methodView() {
  return h('div', { class: 'stack', 'data-testid': 'afr-method' },
    card({
      title: 'One finding, four acts, and the hand that tests is never the hand that fixed',
      subtitle: 'Declare → assign → assert → verify. Acceptance is the fifth door, and it is an executive one.',
      body: h('figure', { class: 'figure' },
        h('img', {
          src: DIAGRAM_URL,
          alt: 'Assurance finding flow: a finding is declared with the control, the criteria it departed from and the accountable lines. Each accountable line holder names a remediation owner and a day; the owner asserts what changed and the evidence; a seat strictly above the owner on the reporting graph independently confirms or rejects. A rejection returns the line to remediation owed. A finding closes only when every line is independently verified, or when an executive who does not own the remediation accepts the residual risk with a review date. A repeat finding on the same control and scope after a verified closure is printed as a fix that did not hold.',
          class: 'figure-img',
          'data-testid': 'afr-diagram',
        }),
        h('figcaption', { class: 'small muted' }, 'A remediation that closes on its owner’s word is a claim. The register does not print claims as closures.')),
    }),
    card({ title: 'Frameworks encoded', body: h('ul', { class: 'list' }, ...AFR_METHOD.frameworks.map((f) => h('li', null, f))) }),
    card({ title: 'Invariants', body: h('ul', { class: 'list' }, ...AFR_METHOD.invariants.map((f) => h('li', null, f))) }),
    card({ title: 'What it deliberately does not do', body: h('ul', { class: 'list' }, ...AFR_METHOD.deliberatelyAbsent.map((f) => h('li', null, f))) }),
  );
}

export function renderAssuranceFindings(ctx) {
  const report = ctx.api.assuranceFindingReport ? ctx.api.assuranceFindingReport() : null;
  if (!report || report.ok === false || !report.counts) {
    return h('div', { class: 'page' },
      pageHeader({ eyebrow: 'CEO / C-suite · matrix', title: 'Assurance findings', subtitle: 'Did the thing we said we would fix actually get fixed — and is this the third time?' }),
      banner({ tone: 'bad', title: 'The register could not be read', body: report?.error || 'The seat refused the read.' }));
  }
  ctx.assuranceFindingCandidates = ctx.api.assuranceFindingCandidates ? ctx.api.assuranceFindingCandidates() : null;
  const requested = ctx.query?.get?.('view');
  const view = VIEWS.some((row) => row.key === requested) ? requested : 'rows';
  const onDone = () => ctx.refresh?.();
  return h('div', { class: 'page', 'data-testid': 'findings-panel' },
    pageHeader({
      eyebrow: 'CEO / C-suite primary · single-chain and matrix',
      title: 'Did the fix hold — or is this the third time?',
      subtitle: 'A finding is declared against a control and the criteria it departed from, on every line accountable for it. Each line names its own owner and day; the owner asserts the fix; a seat strictly above the owner tests it. A finding closes only on an independent verification on every line, or on a dated executive acceptance of the residual risk — never on the owner’s word, and never by the passage of time.',
    }),
    ctx.persistError ? card({ body: h('p', { class: 'text-warn small' }, `Changes are not being saved: ${ctx.persistError}`) }) : null,
    ...(report.warnings || []).map((warning) => banner({ tone: 'caution', title: 'A stored row was refused', body: warning })),
    summaryCard(report),
    claimsBanners(report),
    tabs({
      items: VIEWS.map((row) => ({
        key: row.key,
        label: row.label,
        count: row.key === 'rows' ? report.rows.length : row.key === 'lines' ? (report.lines?.cells || []).length : undefined,
      })),
      active: view,
      ariaLabel: 'Assurance finding views',
      onSelect: (key) => ctx.navigate(`${AFR_HREF}?view=${key}`),
    }),
    view === 'rows' ? rowsView(ctx, report, onDone) : null,
    view === 'lines' ? linesView(report) : null,
    view === 'counts' ? countsView(report) : null,
    view === 'refusals' ? refusalsView(report) : null,
    view === 'method' ? methodView() : null,
  );
}

export default renderAssuranceFindings;
