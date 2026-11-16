/**
 * app/views/workStop.js — `#/work-stop`, Stop-Work Authority & Safe Restart
 * (ADR-0224, Schema v179).
 *
 * The page formats one derived reader. It never decides that work is safe:
 * controls and physical evidence are human-entered declarations; every frozen
 * Director+ joint apex must assess the same mitigation; one affected operator
 * then turns the separate restart key. The hold is not a permit or interlock.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import {
  SWP_HAZARDS,
  SWP_HREF,
  SWP_LIMITS as L,
  SWP_METHOD,
  SWP_STATES,
} from '../core/domain/workStopRegistry.js';

const DIAGRAM_URL = './app/assets/work-stop-safe-restart.jpg';
const VIEWS = [
  { key: 'holds', label: 'Holds & keys' },
  { key: 'acts', label: 'Act history' },
  { key: 'method', label: 'Method & limits' },
];
const STATE_LABEL = Object.fromEntries(SWP_STATES.map((row) => [row.key, row.label]));
const STATE_TONE = {
  'awaiting-mitigation': 'caution',
  'awaiting-independent-clearance': 'caution',
  'clearance-refused': 'bad',
  'awaiting-operator-check': 'info',
  'restart-contested': 'bad',
  'no-independent-authority': 'bad',
  'record-integrity-defect': 'bad',
  restarted: 'good',
};
const HAZARD_LABEL = Object.fromEntries(SWP_HAZARDS.map((row) => [row.key, row.label]));

function button(label, onClick, { primary = false, danger = false, testid = null } = {}) {
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

function selfAttestationFields(report, fieldName, label, allowedIds = null) {
  if (!report.seat?.fullAccess) return [];
  const allowed = allowedIds ? new Set(allowedIds) : null;
  const people = (report.peopleOptions || []).filter((person) => !allowed || allowed.has(person.id));
  return [
    {
      name: fieldName, label, type: 'select', required: true,
      options: options(people.map((person) => ({ value: person.id, label: `${person.name || person.id} · ${person.role || 'roster'}` })), { blank: 'Choose the person making this act' }),
      help: 'The undeclared operator view must select an active roster person. This is a local self-attestation, not authentication.',
    },
    {
      name: 'identityAttested', label: 'First-person identity', type: 'checkbox', value: false, required: true,
      checkboxLabel: `I am ${label === 'Reporter' ? 'the selected reporter' : 'the selected person'} and am recording my own act.`,
    },
  ];
}

function dateLabel(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? new Date(time).toLocaleString() : 'unreadable date';
}

function localDateTimeValue(date) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function formatPeople(names, empty = 'withheld at this altitude') {
  return Array.isArray(names) && names.length ? names.join(', ') : empty;
}

function showResult(result, onDone, successText) {
  if (!result?.ok) {
    toast(result?.error || 'The work-stop action was refused. The hold remains in force.', 'bad');
    return false;
  }
  closeAllModals();
  toast(successText, 'good');
  onDone?.();
  return true;
}

/* ----------------------------------------------------------------- dialogs */

function declareDialog(ctx, report, onDone) {
  const roster = (report.peopleOptions || []).map((person) => ({
    value: person.id,
    label: `${person.name || person.id} · ${person.role || 'roster'}`,
  }));
  const form = buildForm([
    ...selfAttestationFields(report, 'reporterId', 'Reporter'),
    { name: 'areaRef', label: 'Work area / asset / boundary', type: 'text', required: true, help: `At least ${L.areaMin} characters. Use the site’s established name; this is an operational hold, not an emergency channel.` },
    { name: 'workSummary', label: 'Work being held', type: 'textarea', required: true, help: `At least ${L.textMin} characters. Describe the specific work that must not continue.` },
    {
      name: 'hazardKind', label: 'Observed hazard category', type: 'select', required: true,
      options: options(SWP_HAZARDS.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose the observed category' }),
      help: 'A closed category. The system never infers hazard type or severity from your words.',
    },
    { name: 'hazardText', label: 'Specific condition observed', type: 'textarea', required: true, help: `At least ${L.textMin} characters. Record what was actually observed, not a risk score.` },
    { name: 'immediateControls', label: 'Immediate stop / control already applied', type: 'textarea', required: true, help: `At least ${L.textMin} characters. Do not claim lockout, isolation or a physical control that this record cannot verify.` },
    {
      name: 'workLeadId', label: 'Named work lead', type: 'select', required: true,
      options: options(roster, { blank: 'Choose the person responsible for the work' }),
      help: 'This may be a supervisor who is not personally exposed. They may record controls but cannot clear or restart the work.',
    },
    {
      name: 'affectedPersonIds', label: 'Affected operators', type: 'boolean-block', required: true, wide: true,
      options: roster.map((row) => ({ value: row.value, label: row.label })),
      help: `Select at least one active operator (maximum ${L.participantsMax}). A different affected operator—not the work lead or any reviewer—must personally turn the second key; matrix ownership is resolved from every named role, never inferred from work shares.`,
    },
    {
      name: 'reviewByAt', label: 'First formal review due', type: 'datetime-local', required: true,
      value: localDateTimeValue(new Date(Date.now() + 24 * 60 * 60 * 1000)),
      help: `Within ${L.reviewMaxHours} hours. This is a review deadline, not an expiry: the hold never expires automatically.`,
    },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    let reviewByAt;
    try { reviewByAt = values.reviewByAt ? new Date(values.reviewByAt).toISOString() : undefined; } catch { reviewByAt = undefined; }
    const result = ctx.api.workStopDeclare({ ...values, reviewByAt });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The hold was refused. Use the established site safety process.', 'bad');
      return;
    }
    showResult(result, onDone,
      result.authorityReason === 'resolved'
        ? 'Hold recorded. Work stays stopped until every independent review and an affected operator’s separate key are recorded.'
        : 'Hold recorded without an askable joint authority. Nobody was substituted; the hold stays in force.');
  };
  openModal({
    title: 'Declare a first-person stop-work hold',
    body: h('div', { class: 'stack' },
      banner({ tone: 'caution', title: 'Stop first; record second', body: 'If anyone faces immediate danger, use the site’s emergency and safety procedures now. This ledger records a human-declared hold; it cannot isolate equipment, inspect a site or protect anyone from retaliation by itself.' }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Declare hold', onClick: submit }],
  });
}

function mitigationDialog(ctx, stop, report, onDone) {
  const form = buildForm([
    ...selfAttestationFields(report, 'actorId', 'Work-control actor', stop.eligibleMitigationActorIds),
    { name: 'actionText', label: 'Work control / corrective action taken', type: 'textarea', required: true, help: `At least ${L.textMin} characters. State what changed; a promise or a status label is not a control.` },
    { name: 'evidenceText', label: 'Physical or documentary evidence checked', type: 'textarea', required: true, help: `At least ${L.evidenceMin} characters. The application cannot inspect the work area or validate an isolation.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.workStopMitigate({ stopId: stop.id, ...form.getValues() });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The mitigation was refused. The hold remains in force.', 'bad');
      return;
    }
    showResult(result, onDone, 'Work-control act recorded. Independent review and the operator’s own key are still required.');
  };
  openModal({
    title: `Record work control · ${stop.areaRef}`,
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'This is not clearance', body: 'The named work lead or a manager above that lead records the control and the evidence they checked. This act cannot declare the work safe or restart it.' }),
      h('p', { class: 'small' }, stop.hazardText),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record control', onClick: submit }],
  });
}

function assessmentDialog(ctx, stop, report, onDone) {
  const form = buildForm([
    ...selfAttestationFields(report, 'actorId', 'Joint-apex reviewer', stop.authorityIds),
    {
      name: 'assessment', label: 'Independent decision', type: 'select', required: true,
      options: options([
        { value: 'safe', label: 'Safe to offer for the affected operator’s check' },
        { value: 'hold', label: 'Keep the hold in force' },
      ], { blank: 'Choose your own decision' }),
      help: 'Only `safe` from every frozen Director+ joint apex on the same mitigation makes the operator key available. One `hold` keeps the work stopped.',
    },
    { name: 'assessmentText', label: 'What you personally reviewed', type: 'textarea', required: true, help: `At least ${L.textMin} characters. You must be one of the frozen joint apexes and must not be a reporter, work lead or affected operator.` },
    { name: 'evidenceText', label: 'Physical / documentary evidence inspected', type: 'textarea', required: true, help: `At least ${L.evidenceMin} characters. This is your attestation; the application cannot inspect a site or certify physical safety.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.workStopAssess({ stopId: stop.id, ...form.getValues() });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The independent assessment was refused. The hold remains in force.', 'bad');
      return;
    }
    showResult(result, onDone, 'Your independent decision is immutable. The hold remains until every required key is recorded.');
  };
  openModal({
    title: `Independent review · ${stop.areaRef}`,
    body: h('div', { class: 'stack' },
      banner({ tone: 'caution', title: `Latest control · round ${stop.currentRound}`, body: stop.currentMitigation?.actionText || 'No valid control is available to assess.' }),
      stop.currentMitigation?.evidenceText ? card({ title: 'Work-lead evidence', body: stop.currentMitigation.evidenceText }) : null,
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record assessment', onClick: submit }],
  });
}

function operatorDialog(ctx, stop, report, onDone) {
  const choices = stop.canRestart
    ? [
      { value: 'restart', label: 'I personally checked; restart may proceed under the site procedure' },
      { value: 'hold', label: 'Keep the hold in force' },
    ]
    : [{ value: 'hold', label: 'Keep the hold in force' }];
  const form = buildForm([
    ...selfAttestationFields(report, 'actorId', 'Affected operator', stop.affectedPersonIds.filter((id) => id !== stop.workLeadId && !stop.authorityIds.includes(id))),
    {
      name: 'decision', label: 'Affected-operator key', type: 'select', required: true,
      options: options(choices, { blank: 'Choose your own decision' }),
      help: stop.canRestart
        ? 'Restart is only a second human key after every independent joint-apex clearance. Follow the site’s restart procedure as well.'
        : 'Independent clearance is not complete, so this screen permits only a continue-hold decision.',
    },
    { name: 'operatorText', label: 'Your own work-area check', type: 'textarea', required: true, help: `At least ${L.textMin} characters. Only a named affected operator may record this act.` },
    { name: 'evidenceText', label: 'Evidence you personally observed', type: 'textarea', required: true, help: `At least ${L.evidenceMin} characters. This does not replace a competent person’s physical inspection or permit.` },
    { name: 'reason', label: 'Why the hold must continue (required for hold)', type: 'textarea', help: `At least ${L.textMin} characters when keeping the hold.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.workStopOperatorDecision({ stopId: stop.id, ...form.getValues() });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The operator decision was refused. The hold remains in force.', 'bad');
      return;
    }
    showResult(result, onDone, form.getValues().decision === 'restart'
      ? 'Your second key is recorded. Continue only under the site’s authorized restart procedure.'
      : 'Your continue-hold key is recorded. No restart has been authorized.');
  };
  openModal({
    title: `Affected operator · ${stop.areaRef}`,
    body: h('div', { class: 'stack' },
      banner({ tone: stop.canRestart ? 'info' : 'caution', title: 'Only your own key', body: 'The named work lead, an independent reviewer or automation cannot make this decision for you. A continue-hold act never cancels the existing stop.' }),
      h('p', { class: 'small' }, stop.currentMitigation?.actionText || ''),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record my decision', onClick: submit }],
  });
}

/* ----------------------------------------------------------------- views */

function summaryCard(report) {
  const t = report.totals;
  return card({
    title: 'One hold, one work event — no share-based allocation',
    subtitle: 'A stop belongs to its named work area and the full set of affected lines. Matrix ties stay joint; they are never split or resolved by seniority.',
    body: h('div', { class: 'stack' },
      h('div', { class: 'stats-grid' },
        stat({ label: 'Active holds', value: t.activeStopsN, hint: 'No deadline or acknowledgement releases a hold', tone: t.activeStopsN ? 'warn' : 'good' }),
        stat({ label: 'Review overdue', value: t.overdueReviewsN, hint: 'The record asks; work remains stopped', tone: t.overdueReviewsN ? 'bad' : 'good' }),
        stat({ label: 'No current joint authority', value: t.unroutableN, hint: 'Nobody substituted; no restart key', tone: t.unroutableN ? 'bad' : '' }),
        stat({ label: 'Restarted after both keys', value: t.restartedN, hint: 'Derived from append-only acts', tone: t.restartedN ? 'good' : '' }),
      ),
      banner({
        tone: t.countsReconcile ? 'good' : 'bad',
        title: t.countsReconcile ? 'Displayed partitions reconcile' : 'Displayed partitions do not reconcile',
        body: `The visible state partition and hazard partition each add to ${t.stopsDeclared} readable hold(s). Acts attached to readable holds: ${t.actsReferenced} of ${t.actsN}.`,
      }),
      banner({
        tone: t.figuresComplete ? 'good' : 'caution',
        title: t.figuresComplete ? 'Read claims are complete for this scope' : 'A complete safe-restart claim is withheld',
        body: t.figuresComplete
          ? 'No malformed rows, hidden scope, missing participant, unresolved authority or invalid act was found in this read.'
          : `Scope complete: ${t.scopeComplete ? 'yes' : 'no'}. Warnings: ${report.warnings.length}. Invalid acts: ${t.invalidActN + t.invalidRestartN}. Incomplete rows or authority are not counted as zero.`,
      }),
    ),
  });
}

function actLabel(act) {
  if (act.kind === 'mitigation') return 'Work control recorded';
  if (act.kind === 'assessment') return `Independent assessment · ${act.assessment === 'safe' ? 'safe' : 'hold'}`;
  return `Affected-operator key · ${act.decision === 'restart' ? 'restart' : 'continue hold'}`;
}

function actDetail(act) {
  if (act.kind === 'mitigation') return [act.actionText, `Evidence: ${act.evidenceText}`].filter(Boolean).join(' · ');
  if (act.kind === 'assessment') return [act.assessmentText, `Evidence: ${act.evidenceText}`].filter(Boolean).join(' · ');
  return [act.operatorText, act.reason, `Evidence: ${act.evidenceText}`].filter(Boolean).join(' · ');
}

function actHistory(acts) {
  if (!acts.length) return emptyState({ title: 'No immutable acts have been recorded yet.' });
  const rows = acts.map((act) => ({
    ...act,
    className: act.valid ? '' : 'row-warn',
  }));
  return table({
    caption: 'Stop-work mitigation, independent assessment and affected-operator act history',
    columns: [
      { label: 'When', render: (row) => dateLabel(row.at) },
      { label: 'Work area', render: (row) => row.areaRef || 'withheld' },
      { label: 'Act', render: (row) => h('span', { class: 'stack-inline' }, actLabel(row), row.valid ? null : badge('role / sequence invalid', 'bad')) },
      { label: 'By', render: (row) => row.actorName || 'withheld at this altitude' },
      { label: 'What was checked', render: (row) => h('span', { class: 'small' }, actDetail(row)) },
    ],
    rows,
    emptyMessage: 'No acts have been recorded.',
  });
}

function stopCard(ctx, stop, report, onDone) {
  const authorityStatus = stop.authorityAvailable
    ? `${stop.currentSafeAssessmentN} of ${stop.requiredAssessmentsN} joint apex clearance(s) recorded`
    : stop.authorityReason === 'resolved'
      ? 'Matrix authority changed or cannot be proved; no replacement reviewer is inferred.'
      : `No askable joint authority at declaration (${stop.authorityReason || 'unresolved'}); the hold remains.`;
  const actions = [];
  if (stop.canMitigate) actions.push(button('Record work control', () => mitigationDialog(ctx, stop, report, onDone), { primary: true, testid: 'swp-mitigate' }));
  if (stop.canAssess) actions.push(button('Independent assessment', () => assessmentDialog(ctx, stop, report, onDone), { testid: 'swp-assess' }));
  if (stop.canDecide) actions.push(button(report.seat?.fullAccess ? 'Affected-operator key' : 'My affected-operator key', () => operatorDialog(ctx, stop, report, onDone), { testid: 'swp-operator-key' }));

  return card({
    title: stop.areaRef,
    subtitle: `${HAZARD_LABEL[stop.hazardKind] || stop.hazardKind} · declared ${dateLabel(stop.declaredAt)}`,
    actions,
    attrs: { 'data-testid': 'swp-stop-card' },
    body: h('div', { class: 'stack' },
      h('div', { class: 'stack-inline' },
        badge(STATE_LABEL[stop.state] || stop.state, STATE_TONE[stop.state] || 'neutral'),
        stop.overdue ? badge('review overdue · hold remains', 'bad') : null,
      ),
      h('p', null, stop.workSummary),
      card({ title: 'Observed condition', body: stop.hazardText }),
      card({ title: 'Immediate hold / control declared', body: stop.immediateControls }),
      h('div', { class: 'stats-grid' },
        stat({ label: 'Work lead', value: stop.workLeadName || 'withheld at this altitude', hint: 'Can record controls; cannot clear or restart' }),
        stat({ label: 'Reporter', value: stop.reporterName || 'withheld at this altitude' }),
        stat({ label: 'Affected operators', value: formatPeople(stop.affectedNames), hint: 'One affected operator must turn the second key' }),
        stat({ label: 'Review deadline', value: dateLabel(stop.reviewByAt), hint: 'Deadline never releases the hold' }),
      ),
      banner({ tone: stop.authorityAvailable ? 'info' : 'bad', title: 'Independent authority', body: authorityStatus }),
      stop.authorityAvailable && stop.authorityNames.length
        ? h('p', { class: 'small muted' }, `Joint apex set: ${formatPeople(stop.authorityNames, 'identities withheld at this altitude')}`)
        : null,
      !stop.eligibleAffectedOperatorAvailable
        ? banner({ tone: 'bad', title: 'No separate active affected operator can turn the second key', body: 'The named work lead and every independent reviewer are barred from providing the affected-operator key. This release cannot amend participants; preserve the hold and use the established site process.' })
        : stop.state === 'awaiting-operator-check' && !stop.canDecide
          ? banner({ tone: 'info', title: 'The affected operator must turn the key', body: 'Switch to the active seat of a named affected operator, or to the undeclared operator view for explicit local self-attestation. A manager cannot turn this key.' })
          : null,
      stop.currentMitigation
        ? card({
          title: `Latest work control · round ${stop.currentRound}`,
          subtitle: `Recorded ${dateLabel(stop.currentMitigation.at)} by ${stop.currentMitigation.actorName || 'withheld at this altitude'}`,
          body: h('div', { class: 'stack' },
            h('p', null, stop.currentMitigation.actionText),
            h('p', { class: 'small' }, `Evidence checked: ${stop.currentMitigation.evidenceText}`),
            h('p', { class: 'small muted' }, `${stop.currentSafeAssessmentN} safe · ${stop.currentHoldAssessmentN} hold · ${stop.currentOperatorDecisionN} affected-operator decision(s)`),
          ),
        })
        : banner({ tone: 'caution', title: 'No valid work-control act yet', body: 'The initial control is only the first-person declaration. The named work lead must record the changed control and the evidence checked.' }),
      stop.invalidActN || stop.invalidRestartN
        ? banner({ tone: 'bad', title: 'Record integrity defect — hold remains', body: `${stop.invalidActN} malformed or role-invalid act(s) and ${stop.invalidRestartN} invalid restart key(s) were refused. No new key is accepted; this release has no record-editing repair path. Preserve the physical hold and use the supported data-recovery process.` })
        : null,
      stop.visibleActions.length ? card({ title: 'Append-only acts', body: actHistory(stop.visibleActions) }) : null,
    ),
  });
}

function holdsView(ctx, report, onDone) {
  const stops = report.stops.map((stop) => stopCard(ctx, stop, report, onDone));
  return h('div', { class: 'stack', 'data-testid': 'swp-holds' },
    report.stopsCapped ? banner({ tone: 'caution', title: `${report.stopsCapped} further hold(s) not shown`, body: `The reader is capped at ${L.stopsShown} highest-priority holds. Summary counts cover the full readable scope; the Act history tab shows the most recent immutable acts.` }) : null,
    stops.length ? h('div', { class: 'stack' }, ...stops) : emptyState({ title: 'No readable stop-work holds in this span.', body: 'A human must declare a stop. The system never infers one from a case, incident, or schedule.' }),
  );
}

function methodView() {
  return h('div', { class: 'stack', 'data-testid': 'swp-method' },
    card({
      title: 'The safe-restart chain',
      subtitle: 'A hold is the first act. Independent review is not a restart. The affected operator’s own check is the second key.',
      body: h('figure', { class: 'figure' },
        h('img', {
          src: DIAGRAM_URL,
          alt: 'Three stop-work stages: any operator declares a hold, a named work lead records controls, every independent joint apex reviews the same mitigation, then an affected operator separately decides whether work may restart under site procedure.',
          class: 'figure-img',
          'data-testid': 'swp-diagram',
        }),
        h('figcaption', { class: 'small muted' }, 'This software records human acts; it does not operate a physical worksite or verify a control.')),
    }),
    card({ title: 'Frameworks encoded', body: h('ul', { class: 'list' }, ...SWP_METHOD.frameworks.map((item) => h('li', null, item))) }),
    card({
      title: 'Source and benchmark limits',
      body: h('div', { class: 'stack' },
        h('p', null, 'OSHA / FCC, Communication Tower Best Practices (2017) is advisory guidance, not a standard or regulation. It informs a stop-work, reporting and prove-before-restart process bar; this app cannot enforce non-retaliation or certify compliance.'),
        h('a', { href: 'https://www.osha.gov/sites/default/files/publications/OSHA3877.pdf', target: '_blank', rel: 'noopener noreferrer' }, 'Open the OSHA / FCC advisory PDF'),
        h('p', null, 'SafetyCulture / Mitti feature material is vendor-published. Competitive parity is [BENCHMARK-UNVERIFIED]; this ledger is not an EHS inspection or safety-management platform.'),
        h('a', { href: 'https://mitti.com/manufacturing/manufacturing-safety-management', target: '_blank', rel: 'noopener noreferrer' }, 'Open SafetyCulture / Mitti manufacturing-safety overview')),
    }),
    card({ title: 'Non-negotiable invariants', body: h('ul', { class: 'list' }, ...SWP_METHOD.invariants.map((item) => h('li', null, item))) }),
    card({ title: 'Deliberately absent', body: h('ul', { class: 'list' }, ...SWP_METHOD.deliberatelyAbsent.map((item) => h('li', null, item))) }),
  );
}

function scan(ctx, onDone) {
  const result = ctx.api.workStopScan();
  if (!result?.ok) {
    toast(result?.error || 'The stop-work scan was refused.', 'bad');
    return;
  }
  toast('Review scan requested. The rule never clears a hold or restarts work.', 'good');
  onDone?.();
}

export function renderWorkStop(ctx) {
  const report = ctx.api.workStopReport ? ctx.api.workStopReport() : null;
  if (!report || report.ok === false || !report.totals) {
    return h('div', { class: 'page', 'data-testid': 'work-stop-panel' },
      pageHeader({ eyebrow: 'Frontline through enterprise · single-chain and matrix', title: 'Stop-work authority & safe restart', subtitle: 'A first-person hold, every independent joint apex, then the affected operator’s own key.' }),
      banner({ tone: 'bad', title: 'The register could not be read', body: report?.error || 'The declared seat refused the read.' }));
  }
  const requested = ctx.query?.get?.('view');
  const view = VIEWS.some((row) => row.key === requested) ? requested : 'holds';
  const onDone = () => ctx.refresh?.();
  const actorId = report.seat?.actorId || null;
  const canDeclare = report.seat?.fullAccess
    ? Boolean(report.peopleOptions?.length)
    : Boolean(actorId && actorId !== 'leader' && report.peopleOptions?.some((person) => person.id === actorId));
  const headerActions = [
    ...(canDeclare ? [button('Declare a stop-work hold', () => declareDialog(ctx, report, onDone), { primary: true, testid: 'swp-declare' })] : []),
    button('Scan review queue', () => scan(ctx, onDone), { testid: 'swp-scan' }),
  ];
  return h('div', { class: 'page', 'data-testid': 'work-stop-panel' },
    pageHeader({
      eyebrow: 'Frontline through enterprise · single-chain and matrix',
      title: 'Stop work on the first signal. Restart only after two human keys.',
      subtitle: 'Any named operator may raise a hold. The work lead records a control; every Director+ joint apex independently reviews the same mitigation; a separate affected operator then checks the work area and records their own decision.',
      actions: headerActions,
    }),
    ctx.persistError ? card({ body: h('p', { class: 'text-warn small' }, `Changes are not being saved: ${ctx.persistError}`) }) : null,
    !canDeclare ? banner({ tone: 'info', title: 'A named active roster person is required', body: 'Switch to a valid human leadership seat or add the real operator to the active roster. The synthetic workspace operator cannot declare a hold or turn a key.' }) : null,
    report.seat?.fullAccess && canDeclare ? banner({ tone: 'info', title: 'Local first-person identity is self-attested', body: 'With no leadership seat declared, the operator selects a roster person and confirms “I am this person.” This is not authentication; enable the workspace identity-enforcement flow if signed identity is required.' }) : null,
    banner({ tone: 'caution', title: 'Not a permit, isolation, inspection or emergency channel', body: 'Use established site safety and emergency procedures. This local-first ledger cannot verify a physical control, guarantee non-retaliation, replace a legal permit-to-work / lockout-tagout system, or operate an interlock. A deadline, acknowledgement or automation never restarts work.' }),
    report.matrixError ? banner({ tone: 'bad', title: 'Matrix authority cannot be proved', body: report.matrixError }) : null,
    ...(report.warnings || []).map((warning) => banner({ tone: 'caution', title: 'A stored row was refused', body: warning })),
    summaryCard(report),
    tabs({
      items: VIEWS.map((row) => ({
        key: row.key,
        label: row.label,
        count: row.key === 'holds' ? report.totals.activeStopsN : row.key === 'acts' ? report.totals.actsN : undefined,
      })),
      active: view,
      ariaLabel: 'Stop-work ledger views',
      onSelect: (key) => ctx.navigate(`${SWP_HREF}?view=${key}`),
    }),
    view === 'holds' ? holdsView(ctx, report, onDone) : null,
    view === 'acts' ? h('div', { class: 'stack', 'data-testid': 'swp-acts' }, actHistory(report.acts), report.actsCapped ? banner({ tone: 'caution', title: `${report.actsCapped} further act(s) not shown`, body: `The act-history view is capped at ${L.actsShown} most recent acts.` }) : null) : null,
    view === 'method' ? methodView() : null,
  );
}

export default renderWorkStop;
