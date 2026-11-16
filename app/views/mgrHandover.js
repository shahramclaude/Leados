/**
 * app/views/mgrHandover.js — `#/manager-handover`, the Managerial Portfolio
 * Handover & Successor-Acceptance Register (ADR-0225, Schema v180).
 *
 * Four panels, and the whole reason the screen exists is the sentence printed
 * above every transition:
 *
 *   Board  "Which roles are being transitioned, what portfolio is on the
 *           record, and which human key is owed?"
 *   Case   ONE transition at a time: the portfolio the record actually holds
 *           beside what the outgoing manager stated in the brief, the two-key
 *           act stream, the frozen joint seat above every line of both
 *           managers, and the acts that complete or contest it.
 *   Log    the append-only act stream across transitions, newest first.
 *   Method what is declared, derived and refused, and the conventions.
 *
 * WHAT THIS SCREEN REFUSES TO PRINT
 * ---------------------------------
 *  - A completed handover without both keys. `released` requires the outgoing
 *    brief AND the successor acceptance (or a governor settlement of a
 *    recorded dispute); no stored flag and no elapsed date completes it.
 *  - An acceptance as a transfer. The successor's acceptance is their own
 *    first-person key; nobody records it for them, and a shortfall against the
 *    read portfolio is printed, never absorbed.
 *  - A dispute resolved by silence. A dispute routes to every minimal
 *    Director+ joint apex above EVERY line of both managers; a graph that
 *    cannot name such a seat is printed with its reason and asks nobody.
 *  - A portfolio that is not on the record. The register reads delegations,
 *    goals, cases, escalations and forums; a category that cannot be read is
 *    refused with its reason and counted, never rendered as a zero.
 *  - A person performance score. The register measures transitions, never
 *    people; no handover volume, acceptance rate or ranking is produced.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import { recordFocus, isFocused, focusRowProps, focusCardClass, focusAbsentNote } from '../ui/recordFocus.js';
import { serializeCsv } from '../core/csv.js';
import {
  MHH_LIMITS as L,
  MHH_METHOD,
  MHH_PORTFOLIO_CATEGORIES,
  MHH_REASON_KINDS,
  MHH_STATES,
} from '../core/domain/mgrHandoverRegistry.js';

const DIAGRAM_URL = './app/assets/mgr-handover-method.jpg';
const VIEWS = [
  { key: 'board', label: 'Transitions' },
  { key: 'case', label: 'Case' },
  { key: 'log', label: 'Act history' },
  { key: 'method', label: 'Method' },
];
const STATE_LABEL = Object.fromEntries(MHH_STATES.map((row) => [row.key, row.label]));
const STATE_TONE = {
  declared: 'neutral',
  briefed: 'info',
  accepted: 'info',
  released: 'good',
  disputed: 'bad',
  lapsed: 'warn',
  'record-integrity-defect': 'bad',
};
const REASON_LABEL = Object.fromEntries(MHH_REASON_KINDS.map((row) => [row.key, row.label]));
const CATEGORY_LABEL = Object.fromEntries(MHH_PORTFOLIO_CATEGORIES.map((row) => [row.key, row.label]));

const panelFor = (query) => {
  const key = query?.get?.('panel');
  return VIEWS.some((p) => p.key === key) ? key : 'board';
};
const caseIdFor = (query) => query?.get?.('case') || null;
const go = (ctx, panel, caseId = null) => ctx.navigate(`#/manager-handover?panel=${encodeURIComponent(panel)}${caseId ? `&case=${encodeURIComponent(caseId)}` : ''}`);
const dash = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));

function button(label, onClick, { primary = false, danger = false, testid = null } = {}) {
  return h('button', {
    type: 'button',
    class: `btn ${primary ? 'btn-primary' : ''} ${danger ? 'btn-danger' : ''}`,
    onClick,
    'data-testid': testid,
  }, label);
}

function options(values, { blank } = {}) {
  const rows = blank ? [{ value: '', label: blank }] : [];
  return [...rows, ...values];
}

function dateLabel(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? new Date(time).toLocaleString() : 'unreadable date';
}

function localDateTimeValue(date) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 10);
}

function showResult(result, onDone, successText) {
  if (!result?.ok) {
    toast(result?.error || 'The managerial-handover action was refused. The transition remains open.', 'bad');
    return false;
  }
  closeAllModals();
  toast(successText, 'good');
  onDone?.();
  return true;
}

/* ----------------------------------------------------------------- dialogs */

function selfAttestationFields(report, name, label, allowedIds = null) {
  const people = (report.peopleOptions || []).map((person) => ({
    value: person.id,
    label: `${person.name || person.id} · ${person.role || 'roster'}`,
  }));
  return [
    {
      name, label, type: 'select', required: true,
      options: options(people, { blank: 'Choose the person making this act' }),
      help: 'A first-person act needs an active roster person. This is a local self-attestation, not authentication.',
    },
    {
      name: 'identityAttested', label: 'First-person identity', type: 'checkbox', value: false, required: true,
      checkboxLabel: `I am the selected ${label} and am recording my own act.`,
    },
  ];
}

function declareDialog(ctx, report, onDone) {
  const roster = (report.peopleOptions || []).map((person) => ({
    value: person.id,
    label: `${person.name || person.id} · ${person.role || 'roster'}`,
  }));
  const form = buildForm([
    { name: 'roleRef', label: 'Role being transitioned', type: 'text', required: true, help: `At least ${L.roleRefMin} characters. Use the role or seat name the workspace knows.` },
    {
      name: 'departingManagerId', label: 'Outgoing manager', type: 'select', required: true,
      options: options(roster, { blank: 'Choose the manager leaving the role' }),
      help: 'The portfolio brief is their own first-person act, or a manager strictly above them.',
    },
    {
      name: 'successorId', label: 'Successor', type: 'select', required: true,
      options: options(roster, { blank: 'Choose the incoming manager' }),
      help: 'The acceptance is the successor’s own first-person key. Nobody records it for them.',
    },
    {
      name: 'declaredById', label: 'Declaring governor', type: 'select', required: true,
      options: options(roster, { blank: 'Choose the authority declaring the transition' }),
      help: 'Releases the outgoing authority only after the successor acceptance is on the record.',
    },
    { name: 'declaredOn', label: 'Declared on', type: 'date', required: true, value: localDateTimeValue(new Date()) },
    { name: 'plannedEffectiveOn', label: 'Planned effective date', type: 'date', required: true, help: 'The date the successor is expected to hold the portfolio. Passing it without the keys prints `lapsed`; it never transfers anything.' },
    {
      name: 'scopeKeys', label: 'Portfolio categories to transfer', type: 'boolean-block', required: true, wide: true,
      options: MHH_PORTFOLIO_CATEGORIES.map((row) => ({ value: row.key, label: row.label })),
      help: 'The register reads each category from the record; nothing is re-entered and nothing is invented.',
    },
    {
      name: 'reasonKind', label: 'Reason kind', type: 'select', required: true,
      options: options(MHH_REASON_KINDS.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose the transition reason' }),
      help: 'A closed vocabulary. The system never infers a reason from prose.',
    },
    { name: 'note', label: 'Transition note', type: 'textarea', help: `Optional, up to ${L.noteMax} characters.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.mgrHandoverDeclare({
      ...values,
      scopeKeys: (values.scopeKeys || []).filter(Boolean),
    });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The transition declaration was refused.', 'bad');
      return;
    }
    showResult(result, onDone, 'Transition declared. The portfolio brief, the successor acceptance and the governor release are all still owed as dated human acts.');
  };
  openModal({
    title: 'Declare a managerial transition',
    body: h('div', { class: 'stack' },
      banner({ tone: 'caution', title: 'A declaration is not a handover', body: 'The transition is complete only when the outgoing brief, the successor’s own acceptance and the governor release are recorded in order. A planned date that passes prints `lapsed`; it transfers nothing.' }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Declare transition', onClick: submit }],
  });
}

function briefDialog(ctx, handover, report, onDone) {
  const form = buildForm([
    ...selfAttestationFields(report, 'actorId', 'Outgoing manager'),
    {
      name: 'portfolioCount', label: 'Portfolio items you hold', type: 'number', required: true, min: 0, max: L.handovers,
      help: 'The number you declare. The register prints its own read of the same portfolio beside yours; the two are never collapsed into one figure.',
    },
    { name: 'briefText', label: 'The portfolio you are handing over', type: 'textarea', required: true, help: `At least ${L.briefMin} characters. Describe the delegations, goals, cases, escalations and forums you hold.` },
    { name: 'openItemsText', label: 'Open items', type: 'textarea', help: 'Unfinished work the successor must know about.' },
    { name: 'evidenceText', label: 'Evidence you checked before briefing', type: 'textarea', required: true, help: `At least ${L.evidenceMin} characters.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.mgrHandoverBrief({
      handoverId: handover.id,
      actorId: values.actorId,
      identityAttested: Boolean(values.identityAttested),
      portfolioCount: Number(values.portfolioCount),
      briefText: values.briefText,
      openItemsText: values.openItemsText,
      evidenceText: values.evidenceText,
    });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The portfolio brief was refused.', 'bad');
      return;
    }
    showResult(result, onDone, 'Portfolio brief recorded. The successor acceptance is now the owed key.');
  };
  openModal({
    title: `Record outgoing portfolio brief · ${handover.roleRef}`,
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'Your own act', body: 'The brief is recorded by the outgoing manager, or by a manager strictly above them. It states what you hold; it does not transfer anything.' }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record brief', onClick: submit }],
  });
}

function acceptDialog(ctx, handover, report, onDone) {
  const form = buildForm([
    ...selfAttestationFields(report, 'actorId', 'Successor'),
    {
      name: 'acceptedCount', label: 'Portfolio items you accept', type: 'number', required: true, min: 0, max: L.handovers,
      help: `The register reads ${handover.portfolioTotal} item(s) across the declared categories. Accepting fewer prints a shortfall; it is never absorbed into silence.`,
    },
    { name: 'note', label: 'Acceptance note', type: 'textarea', help: 'Optional. State any conditions you are accepting under.' },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.mgrHandoverAccept({
      handoverId: handover.id,
      actorId: values.actorId,
      identityAttested: Boolean(values.identityAttested),
      acceptedCount: Number(values.acceptedCount),
      note: values.note,
    });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The acceptance was refused.', 'bad');
      return;
    }
    showResult(result, onDone, 'Acceptance recorded. The governor release is now the owed key.');
  };
  openModal({
    title: `Accept the transferred portfolio · ${handover.roleRef}`,
    body: h('div', { class: 'stack' },
      banner({ tone: 'caution', title: 'Your own key', body: 'Only the named successor may record the acceptance. A manager above you cannot take this key for you, and elapsed time cannot.' }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record acceptance', onClick: submit }],
  });
}

function releaseDialog(ctx, handover, report, onDone) {
  const form = buildForm([
    ...selfAttestationFields(report, 'actorId', 'Governor'),
    {
      name: 'note', label: 'Release note', type: 'textarea',
      help: handover.hasDispute && !handover.hasAcceptance
        ? `A governor settlement of a dispute must state its ground in at least ${L.textMin} characters.`
        : 'Optional. The release releases the outgoing manager’s authority; it does not itself transfer obligations.',
    },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.mgrHandoverRelease({
      handoverId: handover.id,
      actorId: values.actorId,
      identityAttested: Boolean(values.identityAttested),
      note: values.note,
    });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The release was refused.', 'bad');
      return;
    }
    showResult(result, onDone, 'Outgoing authority released. The handover is complete on the record.');
  };
  openModal({
    title: `Release the outgoing authority · ${handover.roleRef}`,
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'The last key', body: 'The release requires the successor acceptance already on the record — or a recorded dispute that you settle with a stated ground. It completes the handover; it does not move a single obligation by itself.' }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record release', onClick: submit }],
  });
}

function disputeDialog(ctx, handover, report, onDone) {
  const form = buildForm([
    ...selfAttestationFields(report, 'actorId', 'Successor'),
    { name: 'reasonText', label: 'Ground of the dispute', type: 'textarea', required: true, help: `At least ${L.textMin} characters. A dispute without a stated ground is refused; the register never infers one.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.mgrHandoverDispute({
      handoverId: handover.id,
      actorId: values.actorId,
      identityAttested: Boolean(values.identityAttested),
      reasonText: values.reasonText,
    });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The dispute was refused.', 'bad');
      return;
    }
    showResult(result, onDone, 'Dispute recorded. The frozen joint seat above every line of both managers is now the owed review.');
  };
  openModal({
    title: `Dispute the handover · ${handover.roleRef}`,
    body: h('div', { class: 'stack' },
      banner({ tone: 'caution', title: 'The joint seat is asked, never a winner', body: 'A dispute routes to every minimal Director+ joint apex above EVERY reporting line of both managers. A graph that cannot name such a seat prints its reason and asks nobody.' }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record dispute', onClick: submit }],
  });
}

/* ----------------------------------------------------------------- views */

function summaryCard(report) {
  const t = report.totals;
  return card({
    title: 'Transitions measured against the record, not against a form',
    subtitle: 'The portfolio is read from delegations, goals, cases, escalations and forums the workspace already stores; every figure is re-derived on read.',
    body: h('div', { class: 'stack' },
      h('div', { class: 'stats-grid' },
        stat({ label: 'Transitions declared', value: t.handoversDeclared, hint: 'No deadline completes a handover', tone: t.handoversDeclared ? '' : 'good' }),
        stat({ label: 'Owed human keys', value: t.overdueN, hint: 'Brief, acceptance, release or dispute review', tone: t.overdueN ? 'bad' : 'good' }),
        stat({ label: 'Disputed', value: t.disputedN, hint: 'Routed to the joint seat above both lines', tone: t.disputedN ? 'warn' : '' }),
        stat({ label: 'Lapsed', value: t.lapsedN, hint: 'Effective date passed; nothing transferred', tone: t.lapsedN ? 'warn' : 'good' }),
      ),
      banner({
        tone: t.countsReconcile ? 'good' : 'bad',
        title: t.countsReconcile ? 'Displayed partitions reconcile' : 'Displayed partitions do not reconcile',
        body: `The visible state partition adds to ${t.handoversDeclared} readable transition(s), and the portfolio read (${t.portfolioItems} item(s)) is the sum of the printed category rows. Acts attached to readable transitions: ${t.actsReferenced || report.totals.actsN || 0}.`,
      }),
      banner({
        tone: t.figuresComplete ? 'good' : 'caution',
        title: t.figuresComplete ? 'Read claims are complete for this scope' : 'A complete handover claim is withheld',
        body: t.figuresComplete
          ? 'No malformed rows, hidden scope, refused category, unresolved authority, cross-line obligation or acceptance shortfall was found in this read.'
          : `Scope complete: ${t.scopeComplete ? 'yes' : 'no'}. Warnings: ${report.warnings.length}. Refused categories: ${t.refusedCategoryN}. Cross-line obligations: ${t.crossLineN}. Acceptance shortfall: ${t.shortfallN}. Integrity defects: ${t.integrityDefectN}. None of these is counted as zero.`,
      }),
    ),
  });
}

function portfolioTable(handover) {
  return table({
    caption: 'The portfolio the record holds, beside what the brief stated',
    columns: [
      { label: 'Category', render: (row) => CATEGORY_LABEL[row.key] || row.key },
      { label: 'Items read', render: (row) => dash(row.count) },
    ],
    rows: MHH_PORTFOLIO_CATEGORIES.map((row) => ({ key: row.key, count: handover.portfolio[row.key] ?? 0 })),
    emptyMessage: 'No declared portfolio categories.',
  });
}

function actLabel(act) {
  if (act.kind === 'portfolio-brief') return 'Outgoing portfolio brief';
  if (act.kind === 'acceptance') return 'Successor acceptance';
  if (act.kind === 'release') return 'Governor release';
  return 'Successor dispute';
}

function actDetail(act) {
  if (act.kind === 'portfolio-brief') return [act.briefText, `Stated ${act.portfolioCount} item(s)`, `Evidence: ${act.evidenceText}`].filter(Boolean).join(' · ');
  if (act.kind === 'acceptance') return [`Accepted ${act.acceptedCount} item(s)`, act.note].filter(Boolean).join(' · ');
  if (act.kind === 'release') return [act.note || 'Release recorded'].join(' · ');
  return act.reasonText;
}

function actHistory(acts) {
  if (!acts.length) return emptyState({ title: 'No immutable acts have been recorded yet.' });
  const rows = acts.map((act) => ({ ...act, className: act.valid ? '' : 'row-warn' }));
  return table({
    caption: 'Append-only brief, acceptance, release and dispute acts',
    columns: [
      { label: 'When', render: (row) => dateLabel(row.at) },
      { label: 'Act', render: (row) => h('span', { class: 'stack-inline' }, actLabel(row), row.valid ? null : badge('role / sequence invalid', 'bad')) },
      { label: 'By', render: (row) => row.actorName || 'withheld at this altitude' },
      { label: 'Detail', render: (row) => h('span', { class: 'small' }, actDetail(row)) },
    ],
    rows,
    emptyMessage: 'No acts have been recorded.',
  });
}

function handoverCard(ctx, handover, report, onDone) {
  const actions = [];
  if (report.seat?.fullAccess || report.peopleOptions?.length) {
    if (!handover.hasBrief) actions.push(button('Record portfolio brief', () => briefDialog(ctx, handover, report, onDone), { primary: true, testid: 'mhh-brief' }));
    if (handover.hasBrief && !handover.hasAcceptance && !handover.hasRelease) actions.push(button('Accept the portfolio', () => acceptDialog(ctx, handover, report, onDone), { testid: 'mhh-accept' }));
    if (handover.hasBrief && !handover.hasRelease && (handover.hasAcceptance || handover.hasDispute)) actions.push(button('Release outgoing authority', () => releaseDialog(ctx, handover, report, onDone), { testid: 'mhh-release' }));
    if (handover.hasBrief && !handover.hasRelease) actions.push(button('Dispute the handover', () => disputeDialog(ctx, handover, report, onDone), { danger: true, testid: 'mhh-dispute' }));
  }
  const authorityStatus = handover.apexResolved
    ? `Joint seat above every line of both managers: ${handover.apexNames.length ? handover.apexNames.join(', ') : 'identities withheld at this altitude'}`
    : `No askable joint seat could be proved (${handover.apexReason || 'unresolved'}); nobody is substituted.`;
  return card({
    title: handover.roleRef,
    subtitle: `${REASON_LABEL[handover.reasonKind] || handover.reasonKind} · declared ${dateLabel(`${handover.declaredOn}T00:00:00.000Z`)} · effective ${handover.plannedEffectiveOn}`,
    actions,
    attrs: { 'data-testid': 'mhh-handover-card' },
    body: h('div', { class: 'stack' },
      h('div', { class: 'stack-inline' },
        badge(STATE_LABEL[handover.state] || handover.state, STATE_TONE[handover.state] || 'neutral'),
        handover.overdue ? badge('a human key is owed', 'bad') : null,
      ),
      h('div', { class: 'stats-grid' },
        stat({ label: 'Outgoing manager', value: handover.departingManagerName || 'withheld at this altitude' }),
        stat({ label: 'Successor', value: handover.successorName || 'withheld at this altitude' }),
        stat({ label: 'Governor', value: handover.governorName || 'withheld at this altitude' }),
        stat({ label: 'Portfolio read', value: handover.portfolioTotal, hint: `${handover.crossLineN} cross-line obligation(s) printed` }),
      ),
      handover.briefStatedTotal !== null
        ? banner({
          tone: handover.briefDelta === 0 ? 'good' : 'caution',
          title: 'Brief vs record — two claims, never collapsed',
          body: `The outgoing brief stated ${handover.briefStatedTotal} item(s); the record reads ${handover.portfolioTotal}. The delta of ${handover.briefDelta > 0 ? '+' : ''}${handover.briefDelta} is printed, not reconciled away.`,
        })
        : banner({ tone: 'info', title: 'No portfolio brief yet', body: 'The outgoing manager — or a manager strictly above them — must record the brief. Nothing transfers before it exists.' }),
      handover.hasAcceptance
        ? banner({
          tone: handover.shortfall > 0 ? 'caution' : 'good',
          title: handover.shortfall > 0 ? `Acceptance shortfall of ${handover.shortfall} item(s)` : 'Acceptance matches the read portfolio',
          body: `The successor accepted ${handover.visibleActions.find((act) => act.kind === 'acceptance')?.acceptedCount ?? 0} of ${handover.portfolioTotal} item(s). A shortfall is printed; it is never absorbed into a reassuring total.`,
        })
        : null,
      handover.refusedCategories.length
        ? banner({ tone: 'bad', title: 'Refused portfolio categories', body: `${handover.refusedCategories.map((row) => `${CATEGORY_LABEL[row.key] || row.key} (${row.reason})`).join('; ')}. A category that cannot be read is refused with its reason and counted, never rendered as a zero.` })
        : null,
      handover.apexResolved
        ? banner({ tone: handover.disputeN ? 'caution' : 'info', title: 'Frozen joint seat', body: authorityStatus })
        : handover.disputeN
          ? banner({ tone: 'bad', title: 'Dispute with no askable joint seat', body: authorityStatus })
          : null,
      portfolioTable(handover),
      handover.visibleActions.length ? card({ title: 'Append-only acts', body: actHistory(handover.visibleActions) }) : null,
    ),
  });
}

function boardView(ctx, report, onDone) {
  const transitions = report.handovers.map((handover) => handoverCard(ctx, handover, report, onDone));
  return h('div', { class: 'stack', 'data-testid': 'mhh-board' },
    report.handoversCapped ? banner({ tone: 'caution', title: `${report.handoversCapped} further transition(s) not shown`, body: `The reader is capped at ${L.handoversShown} highest-priority transitions. Summary counts cover the full readable scope.` }) : null,
    transitions.length ? h('div', { class: 'stack' }, ...transitions) : emptyState({ title: 'No readable managerial transitions in this span.', body: 'A director or VP declares a transition when a role’s holder changes. The register never infers one from a reorganisation or a roster edit.' }),
  );
}

function caseView(ctx, report, onDone) {
  const requested = caseIdFor(ctx.query);
  const handover = report.handovers.find((row) => row.id === requested) || null;
  if (!handover) {
    return h('div', { class: 'stack', 'data-testid': 'mhh-case' },
      banner({ tone: 'caution', title: 'No transition selected', body: 'Choose a transition from the Transitions panel to read its portfolio, act stream and frozen joint seat.' }),
      h('div', { class: 'stack' }, ...report.handovers.slice(0, 8).map((row) => button(row.roleRef, () => go(ctx, 'case', row.id), { testid: `mhh-case-${row.id}` }))),
    );
  }
  return h('div', { class: 'stack', 'data-testid': 'mhh-case' },
    h('div', { class: 'stack-inline' },
      button('Back to transitions', () => go(ctx, 'board'), { testid: 'mhh-case-back' }),
    ),
    handoverCard(ctx, handover, report, onDone),
  );
}

function logView(report) {
  return h('div', { class: 'stack', 'data-testid': 'mhh-log' },
    actHistory(report.acts),
    report.actsCapped ? banner({ tone: 'caution', title: `${report.actsCapped} further act(s) not shown`, body: `The act-history view is capped at ${L.actsShown} most recent acts.` }) : null,
    report.markers.length
      ? card({ title: 'Identity-free observations', body: h('ul', { class: 'list' }, ...report.markers.map((marker) => h('li', null, `${dateLabel(marker.at)} · ${marker.detail}`))) })
      : null,
  );
}

function methodView() {
  return h('div', { class: 'stack', 'data-testid': 'mhh-method' },
    card({
      title: 'The handover chain',
      subtitle: 'A declaration is the first act. The brief and the acceptance are the two keys; the governor release completes the record.',
      body: h('figure', { class: 'figure' },
        h('img', {
          src: DIAGRAM_URL,
          alt: 'Four managerial handover stages: a governor declares the transition, the outgoing manager records the portfolio brief, the successor accepts in their own name, and the governor releases the outgoing authority — with a dispute routing to the joint seat above every line of both managers.',
          class: 'figure-img',
          'data-testid': 'mhh-diagram',
        }),
        h('figcaption', { class: 'small muted' }, 'This software records dated human acts; it never transfers an obligation or inherits authority by date.')),
    }),
    card({ title: 'Frameworks encoded', body: h('ul', { class: 'list' }, ...MHH_METHOD.frameworks.map((item) => h('li', null, item))) }),
    card({ title: 'Non-negotiable invariants', body: h('ul', { class: 'list' }, ...MHH_METHOD.invariants.map((item) => h('li', null, item))) }),
    card({ title: 'Deliberately absent', body: h('ul', { class: 'list' }, ...MHH_METHOD.deliberatelyAbsent.map((item) => h('li', null, item))) }),
  );
}

function scan(ctx, onDone) {
  const result = ctx.api.mgrHandoverScan();
  if (!result?.ok) {
    toast(result?.error || 'The managerial-handover scan was refused.', 'bad');
    return;
  }
  toast('Scan requested. The rule never records a key or transfers an obligation.', 'good');
  onDone?.();
}

export function renderMgrHandover(ctx) {
  const report = ctx.api.mgrHandoverReport ? ctx.api.mgrHandoverReport() : null;
  if (!report || report.ok === false || !report.totals) {
    return h('div', { class: 'page', 'data-testid': 'mgr-handover-panel' },
      pageHeader({ eyebrow: 'Director / VP through CEO · single-chain and matrix', title: 'Managerial portfolio handover', subtitle: 'A declared transition, an outgoing portfolio brief, a successor acceptance, and a governor release.' }),
      banner({ tone: 'bad', title: 'The register could not be read', body: report?.error || 'The declared seat refused the read.' }));
  }
  const view = panelFor(ctx.query);
  const onDone = () => ctx.refresh?.();
  const actorId = report.seat?.actorId || null;
  const canDeclare = report.seat?.fullAccess
    ? Boolean(report.peopleOptions?.length)
    : Boolean(actorId && actorId !== 'leader' && report.peopleOptions?.some((person) => person.id === actorId));
  const headerActions = [
    ...(canDeclare ? [button('Declare a transition', () => declareDialog(ctx, report, onDone), { primary: true, testid: 'mhh-declare' })] : []),
    button('Scan owed keys', () => scan(ctx, onDone), { testid: 'mhh-scan' }),
    button('Export CSV', () => {
      if (ctx.exportCSV) { ctx.exportCSV('mgrHandover'); return; }
      downloadText({ filename: `leados-mgr-handover-${report.nowIso.slice(0, 10)}.csv`, text: serializeCsv(report), mime: 'text/csv;charset=utf-8' });
    }, { testid: 'mhh-csv' }),
  ];
  return h('div', { class: 'page', 'data-testid': 'mgr-handover-panel' },
    pageHeader({
      eyebrow: 'Director / VP through CEO · single-chain and matrix',
      title: 'A role does not expire with its holder',
      subtitle: 'When a manager leaves a role, the portfolio they hold — delegations, goals, cases, escalations, forums — is transferred by dated human acts: the outgoing brief, the successor’s own acceptance, and the governor release. No date and no automation completes it.',
      actions: headerActions,
    }),
    ctx.persistError ? card({ body: h('p', { class: 'text-warn small' }, `Changes are not being saved: ${ctx.persistError}`) }) : null,
    !canDeclare ? banner({ tone: 'info', title: 'A named active roster person is required', body: 'Switch to a valid human leadership seat or add the real managers to the active roster. The synthetic workspace operator cannot declare a transition or hold a key.' }) : null,
    report.matrixError ? banner({ tone: 'bad', title: 'Matrix routing cannot be proved', body: report.matrixError }) : null,
    ...(report.warnings || []).map((warning) => banner({ tone: 'caution', title: 'A stored row was refused', body: warning })),
    summaryCard(report),
    tabs({
      items: VIEWS.map((row) => ({
        key: row.key,
        label: row.label,
        count: row.key === 'board' ? report.totals.handoversDeclared : row.key === 'log' ? report.totals.actsN : undefined,
      })),
      active: view,
      ariaLabel: 'Managerial handover views',
      onSelect: (key) => go(ctx, key, key === 'case' ? caseIdFor(ctx.query) : null),
    }),
    view === 'board' ? boardView(ctx, report, onDone) : null,
    view === 'case' ? caseView(ctx, report, onDone) : null,
    view === 'log' ? logView(report) : null,
    view === 'method' ? methodView() : null,
  );
}

export default renderMgrHandover;
