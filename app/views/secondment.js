/**
 * app/views/secondment.js — `#/secondment`, the Secondment / Assignment
 * Return & Handover Register (ADR-0262, Schema v214).
 *
 * ONE reader (`buildAssignmentReport`) stands behind every state, day count,
 * timeliness verdict, coverage gap and handback completeness this page
 * prints. The page formats what the reader returned; it computes no state and
 * no day count of its own.
 *
 * THE THINGS THIS SCREEN KEEPS APART
 *  - the DECLARED return day (what the terms instrument said) and the RETURN
 *    DAY IN FORCE (moved only by recorded extend acts — drift is printed,
 *    never absorbed);
 *  - the RETURN DECISION (a dated act with rationale) and the passage of time
 *    (an overdue day is a state, never a decision);
 *  - the CONVERSION DECISION and the HOME LINE'S CONSENT (a separate dated
 *    act — nobody is transferred by silence);
 *  - the two HANDBACKS (home and host evidence, both required).
 *
 * WHAT THE SCREEN REFUSES TO SAY. It does not say a person "came back"
 * because a date passed: it prints `return-decision-overdue` with the exact
 * days. It never prints `transferred` without the home line's consent and
 * both handbacks. It never scores the person, never infers coverage from the
 * org chart, and never shows a state the reader did not derive.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { exportWorkspaceCsv } from '../core/csv.js';
import {
  ASG_COVER_KINDS,
  ASG_COVER_BY_KEY,
  ASG_CSV_SCOPE,
  ASG_DECISION_KEYS,
  ASG_DECISION_BY_KEY,
  ASG_HREF,
  ASG_SIDE_KEYS,
  ASG_STATE_BY_KEY,
} from '../core/domain/asgRegistry.js';
import { dayLabel } from '../core/domain/asgMath.js';

const DIAGRAM_URL = './app/assets/secondment-method.jpg';
const VIEWS = [
  { key: 'assignments', label: 'Assignments' },
  { key: 'coverage', label: 'Coverage & handback' },
  { key: 'decisions', label: 'Decisions' },
  { key: 'method', label: 'Method' },
];

const TONE = { bad: 'bad', warn: 'warn', good: 'good', neutral: 'neutral' };
const options = (rows, { blank = null } = {}) => [
  ...(blank ? [{ value: '', label: blank }] : []), ...rows.map((row) => ({ value: row.value, label: row.label })),
];

function button(label, onClick, { primary = false, testid = null } = {}) {
  return h('button', {
    type: 'button',
    class: `btn btn-small ${primary ? 'btn-primary' : 'btn-ghost'}`,
    ...(testid ? { 'data-testid': testid } : {}),
    onClick,
  }, label);
}

function stateBadge(stateKey) {
  const state = ASG_STATE_BY_KEY[stateKey];
  if (!state) return h('span', { class: 'badge badge-neutral' }, stateKey);
  return h('span', {
    class: `badge badge-${TONE[state.tone] || 'neutral'}`,
    title: state.detail,
    'data-testid': `asg-state-${state.key}`,
  }, state.label);
}

function peopleOptions(ctx) {
  return (ctx.state?.people || []).map((p) => ({ value: p.id, label: `${p.name}${p.role ? ` — ${p.role}` : ''}` }));
}

/* -------------------------------------------------------------------- dialogs */

function assignmentDialog(ctx, onDone) {
  const people = peopleOptions(ctx);
  const form = buildForm([
    { name: 'personId', label: 'Person (the one who moves)', type: 'select', required: true, options: options(people, { blank: 'Choose a person' }), help: 'The seconded person. They stay counted once, on every line that holds them.' },
    { name: 'homeManagerId', label: 'Home manager (the line they return to)', type: 'select', required: true, options: options(people, { blank: 'Choose the home manager' }), help: 'One named side. The home line names duty coverage and consents to any conversion.' },
    { name: 'hostManagerId', label: 'Host manager (the line they join)', type: 'select', required: true, options: options(people, { blank: 'Choose the host manager' }), help: 'The other named side. Both sides hand back; the register never picks one on the other’s behalf.' },
    { name: 'startDay', label: 'Start day (YYYY-MM-DD)', type: 'text', required: true, help: 'The day the assignment begins. A past day records what already happened.' },
    { name: 'declaredReturnDay', label: 'Declared return day (YYYY-MM-DD)', type: 'text', required: true, help: 'What the terms instrument said. It is never moved except by a recorded extend, and never by the passage of time.' },
    { name: 'termsRef', label: 'Terms instrument reference', type: 'text', required: true, help: 'The written instrument that sets the terms — a policy, a letter, a secondment agreement. Declared, never checked.' },
    { name: 'note', label: 'Note (optional)', type: 'textarea', rows: 2, help: 'Anything the record should carry.' },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.asgDeclareAssignment({ ...form.getValues() });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The assignment was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Assignment declared. States are derived on read.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Declare an assignment',
    description: 'A person, two named sides, the window and the written terms. The register never edits the roster.',
    size: 'lg',
    body: h('div', { class: 'stack' },
      banner({
        tone: 'caution',
        title: 'A return day is not a return decision',
        body: 'The declared return day is a target. What happens at it — extend, return or convert — must be recorded as a dated act, or the register prints the gap.',
      }),
      form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Declare assignment', onClick: submit, primary: true }],
  });
}

function coverDialog(ctx, report, onDone) {
  const open = report.rows.filter((r) => r.state !== 'returned' && r.state !== 'transferred').map((r) => ({
    value: r.assignment.assignmentId,
    label: `${r.personName} — home ${r.homeManagerName} → host ${r.hostManagerName}`,
  }));
  const form = buildForm([
    { name: 'assignmentId', label: 'Assignment', type: 'select', required: true, options: options(open, { blank: 'Choose an assignment' }), help: 'Coverage is named per duty on one assignment.' },
    { name: 'dutyLabel', label: 'Duty', type: 'text', required: true, help: 'One duty the person carries — named as the home line names it. Never inferred from goals or the org chart.' },
    {
      name: 'coverKind', label: 'Coverage kind', type: 'select', required: true,
      options: options(ASG_COVER_KINDS.map((k) => ({ value: k, label: ASG_COVER_BY_KEY[k].label }))),
      help: 'Named cover (a hand carries it), retained by home (the home line keeps it), or uncovered (a printed hole).',
    },
    { name: 'coverHandId', label: 'Cover hand (named cover only)', type: 'select', options: options(peopleOptions(ctx), { blank: 'Choose the covering hand' }), help: 'The named hand that carries the duty while the person is away.' },
    { name: 'note', label: 'Note (optional)', type: 'textarea', rows: 2 },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.asgDeclareDutyCover({ ...form.getValues(), coverHandId: form.getValues().coverHandId || null });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The cover was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Duty coverage declared.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Declare duty coverage',
    description: 'One duty, one kind, named by the home line. An uncovered duty is printed as a hole.',
    size: 'lg',
    body: h('div', { class: 'stack' }, form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Declare cover', onClick: submit, primary: true }],
  });
}

function decisionDialog(ctx, report, onDone) {
  const open = report.rows.filter((r) => !r.finalDecision).map((r) => ({
    value: r.assignment.assignmentId,
    label: `${r.personName} — return day in force ${r.returnDayInForce} (${r.state})`,
  }));
  const form = buildForm([
    { name: 'assignmentId', label: 'Assignment', type: 'select', required: true, options: options(open, { blank: 'Choose an assignment' }), help: 'Only assignments whose question is still open take a decision.' },
    {
      name: 'decisionKind', label: 'Decision', type: 'select', required: true,
      options: options(ASG_DECISION_KEYS.map((k) => ({ value: k, label: ASG_DECISION_BY_KEY[k].label }))),
      help: 'Extend (a new declared return day), return (both lines hand back), or convert (the home line must consent, separately).',
    },
    { name: 'newDeclaredReturnDay', label: 'New declared return day (extend only)', type: 'text', help: 'Strictly after the day in force and the decided day. An extend that does not move the day forward is refused.' },
    { name: 'rationale', label: 'Written rationale', type: 'textarea', rows: 4, required: true, help: 'Why this decision. A decision nobody justified is refused.' },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.asgRecordReturnDecision({
      assignmentId: values.assignmentId,
      decisionKind: values.decisionKind,
      newDeclaredReturnDay: values.newDeclaredReturnDay || null,
      rationale: values.rationale,
    });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The decision was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Return decision recorded. Nothing was ended or transferred by it.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Record a return decision',
    description: 'Extend, return or convert — one dated answer per question, with written rationale.',
    size: 'lg',
    body: h('div', { class: 'stack' },
      banner({
        tone: 'caution',
        title: 'A conversion never completes silently',
        body: 'Convert needs the home line’s own dated consent and both handbacks before the register prints transferred. Silence converts nothing.',
      }),
      form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record decision', onClick: submit, primary: true }],
  });
}

function consentDialog(ctx, report, onDone) {
  const open = report.rows.filter((r) => r.finalDecision && r.finalDecision.decisionKind === 'convert' && !r.consent).map((r) => ({
    value: r.assignment.assignmentId,
    label: `${r.personName} — home ${r.homeManagerName} (${r.state})`,
  }));
  const form = buildForm([
    { name: 'assignmentId', label: 'Assignment (convert decided)', type: 'select', required: true, options: options(open, { blank: 'Choose an assignment' }), help: 'Only a decided conversion takes a consent.' },
    { name: 'basis', label: 'Written basis', type: 'textarea', rows: 3, required: true, help: 'Why the home line consents to the move becoming permanent.' },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.asgRecordHomeConsent({ ...form.getValues() });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The consent was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Home-line consent recorded.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Record the home line’s consent',
    description: 'The home manager — or a hand proved strictly above them — consents by name, with a written basis.',
    size: 'md',
    body: h('div', { class: 'stack' }, form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record consent', onClick: submit, primary: true }],
  });
}

function handbackDialog(ctx, report, onDone) {
  const open = report.rows.filter((r) => r.finalDecision && (!r.handbacks.home || !r.handbacks.host)).map((r) => ({
    value: r.assignment.assignmentId,
    label: `${r.personName} — ${r.handbacks.home ? 'host' : 'home'}${!r.handbacks.home && !r.handbacks.host ? ' + host' : ''} handback owed (${r.state})`,
  }));
  const form = buildForm([
    { name: 'assignmentId', label: 'Assignment', type: 'select', required: true, options: options(open, { blank: 'Choose an assignment' }), help: 'A handback is recorded after the return or convert decision.' },
    { name: 'side', label: 'Side', type: 'select', required: true, options: options(ASG_SIDE_KEYS.map((k) => ({ value: k, label: k === 'home' ? 'Home line' : 'Host line' }))), help: 'Each line evidences its own handback. One side’s word is not a handback.' },
    { name: 'evidenceRef', label: 'Evidence reference', type: 'text', required: true, help: 'The written evidence that the duties came back — a handover note, a signed schedule, a closure record.' },
    { name: 'note', label: 'Note (optional)', type: 'textarea', rows: 2 },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.asgRecordHandback({ ...form.getValues() });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The handback was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Handback recorded with its evidence.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Record a handback',
    description: 'One side, one receiving hand, one evidence reference.',
    size: 'md',
    body: h('div', { class: 'stack' }, form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record handback', onClick: submit, primary: true }],
  });
}

/** A named hand, resolved from the roster the caller passes. A person id is
 * never printed when a name exists. */
function personName(state, personId) {
  if (!personId) return '—';
  const person = (state?.people || []).find((p) => p && p.id === personId);
  return person?.name || personId;
}

/* -------------------------------------------------------------------- panels */

function assignmentsPanel(ctx, report) {
  const rows = report.rows.map((r) => ({
    person: r.personName,
    sides: `${r.homeManagerName} → ${r.hostManagerName}`,
    window: `${dayLabel(r.startDay)} → ${dayLabel(r.returnDayInForce)}${r.extends > 0 ? ` (was ${dayLabel(r.originalReturnDay)}, ${r.extends} extend${r.extends === 1 ? '' : 's'})` : ''}`,
    state: stateBadge(r.state),
    answers: [
      r.jointApex && r.jointApex.apexId ? `joint apex ${personName(ctx.state, r.jointApex.apexId)}` : 'joint apex unresolved — nobody to ask, an identity-free marker is written',
      r.orphans.length > 0 ? `${r.orphans.length} named hand(s) off graph` : '',
      r.sideLineMismatch.length > 0 ? `side-line mismatch: ${r.sideLineMismatch.join(', ')}` : '',
    ].filter(Boolean).join(' · '),
    facts: r.state === 'return-decision-overdue'
      ? `${r.overdueDays} day(s) overdue — silence changed nothing`
      : r.decidedLate
        ? `decided ${r.lateDays} day(s) late — kept as recorded`
        : r.state === 'decision-due'
          ? `${r.daysToReturn} day(s) to the return day in force`
          : r.uncoveredLabels.length > 0
            ? `${r.uncoveredLabels.length} uncovered dut${r.uncoveredLabels.length === 1 ? 'y' : 'ies'}`
            : '—',
  }));
  return h('div', { class: 'stack' },
    card({
      title: 'Assignments (states derived on read)',
      body: rows.length === 0
        ? emptyState({ title: 'No assignments', body: 'Declare an assignment to begin. Nothing is inferred, ended or transferred by the register.' })
        : table({
            columns: [
              { label: 'Person', key: 'person' }, { label: 'Sides', key: 'sides' }, { label: 'Window', key: 'window' },
              { label: 'State', key: 'state' }, { label: 'Answers for the move', key: 'answers' }, { label: 'Facts', key: 'facts' },
            ],
            rows,
          }),
    }),
  );
}

function coveragePanel(ctx, report) {
  const rows = [];
  for (const r of report.rows) {
    for (const cover of r.coverageRows) {
      rows.push({
        person: r.personName,
        duty: cover.dutyLabel,
        kind: badge(cover.coverKindLabel, cover.coverKind === 'uncovered' ? 'bad' : cover.coverKind === 'named-cover' ? 'good' : 'neutral'),
        hand: cover.coverKind === 'named-cover' ? (cover.coverHandOrphan ? `${cover.coverHandName} (off graph)` : cover.coverHandName) : '—',
        declared: dayLabel(cover.declaredDay),
      });
    }
  }
  const acts = [];
  for (const r of report.rows) {
    for (const side of ['home', 'host']) {
      const act = r.handbacks[side];
      acts.push({
        person: r.personName,
        act: side === 'home' ? 'Home handback' : 'Host handback',
        status: act ? badge('On file', 'good') : badge('Missing', r.finalDecision ? 'warn' : 'neutral'),
        hand: act ? personName(ctx.state, act.receivedById) : '—',
        day: act ? dayLabel(act.day) : '—',
        evidence: act ? act.evidenceRef : '—',
      });
    }
    if (r.finalDecision && r.finalDecision.decisionKind === 'convert') {
      acts.push({
        person: r.personName,
        act: 'Home consent',
        status: r.consent ? badge('On file', 'good') : badge('Owed', 'warn'),
        hand: r.consent ? personName(ctx.state, r.consent.consentById) : '—',
        day: r.consent ? dayLabel(r.consent.day) : '—',
        evidence: r.consent ? r.consent.basis : '—',
      });
    }
  }
  return h('div', { class: 'stack' },
    card({
      title: 'Duty coverage (named per duty, never inferred)',
      body: rows.length === 0
        ? emptyState({ title: 'No duty coverage declared', body: 'The home line names coverage per duty. An uncovered duty is printed as a hole, never smoothed over.' })
        : table({
            columns: [
              { label: 'Person', key: 'person' }, { label: 'Duty', key: 'duty' }, { label: 'Kind', key: 'kind' },
              { label: 'Cover hand', key: 'hand' }, { label: 'Declared', key: 'declared' },
            ],
            rows,
          }),
    }),
    card({
      title: 'Handback & consent evidence',
      body: acts.length === 0
        ? emptyState({ title: 'No handback or consent acts', body: 'Both lines hand back, and a conversion needs the home line’s own consent. One side’s word is not a handback.' })
        : table({
            columns: [
              { label: 'Person', key: 'person' }, { label: 'Act', key: 'act' }, { label: 'Status', key: 'status' },
              { label: 'Hand', key: 'hand' }, { label: 'Day', key: 'day' }, { label: 'Evidence / basis', key: 'evidence' },
            ],
            rows: acts,
          }),
    }),
  );
}

function decisionsPanel(ctx, report) {
  const rows = [];
  for (const r of report.rows) {
    for (const d of r.decisions) {
      rows.push({
        person: r.personName,
        decision: badge(ASG_DECISION_BY_KEY[d.decisionKind]?.label || d.decisionKind, d.decisionKind === 'convert' ? 'warn' : d.decisionKind === 'return' ? 'good' : 'neutral'),
        decided: dayLabel(d.day),
        timeliness: d.decidedLate ? badge(`decided ${d.lateDays} day(s) late`, 'bad') : badge('on time', 'good'),
        newDay: d.decisionKind === 'extend' ? `→ ${dayLabel(d.newDeclaredReturnDay)}` : '—',
        rationale: d.rationale,
      });
    }
  }
  return h('div', { class: 'stack' },
    card({
      title: 'Return decisions (one answer per question, never re-dated)',
      body: rows.length === 0
        ? emptyState({ title: 'No return decisions', body: 'A return decision is a dated act with written rationale. A late decision keeps its day and prints as late.' })
        : table({
            columns: [
              { label: 'Person', key: 'person' }, { label: 'Decision', key: 'decision' }, { label: 'Decided', key: 'decided' },
              { label: 'Timeliness', key: 'timeliness' }, { label: 'New return day', key: 'newDay' }, { label: 'Rationale', key: 'rationale' },
            ],
            rows,
          }),
    }),
  );
}

function methodPanel(ctx, report) {
  const c = report.conventions || {};
  return h('div', { class: 'stack' },
    card({
      title: 'Method',
      body: h('div', { class: 'stack' },
        h('img', { src: DIAGRAM_URL, alt: 'Secondment and assignment-return method illustration (illustrative, not operational evidence)', class: 'method-diagram' }),
        h('p', { class: 'muted small' }, 'Method illustration — illustrative, not operational evidence. Higgsfield is not connected in this environment; the figure is generated and recorded as such in ADR-0262.'),
        h('p', null, 'Repatriation failure (Black, Gregersen & Mendenhall 1992). Incomplete contracts (Hart & Moore 1988). Fail-safe design: an overdue day is a state, never a decision. Segregation of duties: both lines hand back; the accountable seat is the matrix joint apex.'),
        h('p', { class: 'muted' }, 'A return day is not a return decision. A conversion never completes silently. Coverage is named, never inferred. A person is counted once. Nothing here edits the roster or scores the person.'),
        h('p', { class: 'muted small' }, `Conventions: warn horizon ${c.asgWarnHorizonDays} day(s), handback horizon ${c.asgHandbackHorizonDays} day(s), privacy floor ${c.asgPrivacyFloor}. Rule switch ${c.asgAutoPropagate === false ? 'paused (printed, never silent)' : 'on'}.`),
      ),
    }),
  );
}

/* -------------------------------------------------------------------- render */

export function renderSecondment(ctx) {
  const report = ctx.secondmentReport || { rows: [], markers: [], warnings: [], conventions: {}, today: '', totals: {}, counts: {} };
  const view = ctx.query?.get?.('view') || 'assignments';
  const active = VIEWS.find((v) => v.key === view) || VIEWS[0];

  const header = pageHeader({
    title: 'Secondment & assignment return',
    subtitle: 'The person who moved across lines — the named cover for each duty, the return decision before the day, and both lines’ handback. States derived on read; nothing is ended or transferred by silence.',
    actions: [
      button('Declare assignment', () => assignmentDialog(ctx, () => ctx.refresh?.()), { primary: true, testid: 'asg-declare-assignment' }),
      button('Duty cover', () => coverDialog(ctx, report, () => ctx.refresh?.()), { testid: 'asg-declare-cover' }),
      button('Return decision', () => decisionDialog(ctx, report, () => ctx.refresh?.()), { testid: 'asg-record-decision' }),
      button('Home consent', () => consentDialog(ctx, report, () => ctx.refresh?.()), { testid: 'asg-record-consent' }),
      button('Handback', () => handbackDialog(ctx, report, () => ctx.refresh?.()), { testid: 'asg-record-handback' }),
      button('Export CSV', () => {
        const csv = exportWorkspaceCsv(ctx.state, ASG_CSV_SCOPE, { now: new Date() });
        downloadText(csv, 'secondment.csv', 'text/csv');
        toast('CSV exported (aggregate, identity-free, floored).', 'good');
      }, { testid: 'asg-export' }),
    ],
  });

  const t = report.totals || {};
  const stats = h('div', { class: 'stat-grid' },
    stat({ label: 'Assignments', value: String(t.total || 0), hint: 'on the register' }),
    stat({ label: 'Overdue decisions', value: String(t.returnDecisionOverdue || 0), hint: 'return day passed, no decision' }),
    stat({ label: 'Uncovered duties', value: String(t.uncovered || 0), hint: 'named as holes, never inferred' }),
    stat({ label: 'Returned / transferred', value: `${t.returned || 0} / ${t.transferred || 0}`, hint: 'both handbacks evidenced' }),
  );

  let panel;
  if (active.key === 'assignments') panel = assignmentsPanel(ctx, report);
  else if (active.key === 'coverage') panel = coveragePanel(ctx, report);
  else if (active.key === 'decisions') panel = decisionsPanel(ctx, report);
  else panel = methodPanel(ctx, report);

  return h('div', { class: 'page', 'data-testid': 'secondment-page' },
    header,
    stats,
    tabs({ items: VIEWS, active: active.key, onSelect: (key) => { window.location.hash = `${ASG_HREF}?view=${key}`; }, ariaLabel: 'Assignment register sections' }),
    panel,
  );
}
