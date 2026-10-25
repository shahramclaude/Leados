/** Conflict workspace. Case detail is opened deliberately; overview reminders expose only counts. */
import { h } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, emptyState } from '../ui/components.js';
import {
  CONFLICT_SAFETY, PARTICIPATION, CONFLICT_STATUS, CONFLICT_OUTCOMES, currentAgreement,
  conflictHealth, conflictSummary, agreementReadiness, resolutionReadiness,
} from '../core/domain/conflicts.js';
import { formatDate } from '../core/time.js';
import {
  openConflictDialog, openConflictAgreementDialog, openConflictFollowUpDialog,
  openConflictResultDialog, openConflictTransitionDialog,
} from '../ui/conflict-modals.js';

const button = (label, onClick, primary = false, disabled = false) => h('button', {
  type: 'button', class: `btn ${primary ? 'btn-primary' : 'btn-ghost'}`, onClick, disabled,
}, label);
const privacyNotice = (ctx) => banner({
  tone: 'caution', title: 'A working record, not a confidential HR case system',
  body: `${ctx?.isEncrypted ? 'This browser copy is encrypted at rest, while plain-text JSON and CSV exports remain unencrypted.' : 'Notes and full JSON exports are unencrypted unless you enable passphrase encryption in Settings.'} Store only information you are authorised to keep. Nothing here is automatically added to 1:1 agendas, person records, readiness scores or performance-review evidence. General reminders contain counts/status only. This app does not contact anyone.`,
});
function dataNotices(ctx) {
  return [ctx.persistError ? banner({ tone: 'bad', title: 'Changes are not saved', body: ctx.persistError, actions: [h('a', { href: '#/settings', class: 'btn btn-ghost' }, 'Export now')] }) : null,
    ...(ctx.warnings || []).filter((w) => w.startsWith('Conflicts:')).map((w) => banner({ tone: 'caution', title: 'Check repaired conflict data', body: w }))];
}

export function renderConflicts(ctx) {
  const summary = conflictSummary(ctx.state, ctx.now);
  const requested = ctx.query.get('filter');
  const filter = ['active', 'attention', 'resolved', 'all'].includes(requested) ? requested : 'active';
  const rows = summary.rows.filter(({ record, health }) => filter === 'all' || (filter === 'resolved' ? record.status === 'resolved' : filter === 'attention' ? health.attention : health.active))
    .sort((a, b) => Number(b.health.attention) - Number(a.health.attention) || b.record.updatedAt.localeCompare(a.record.updatedAt));
  return h('div', { class: 'page' },
    pageHeader({ eyebrow: 'Team relationships', title: 'Work through disagreement',
      subtitle: 'Hear each perspective. Find the underlying interests. Agree what changes, then check whether it holds. An agreement is not yet a resolution.',
      actions: [button('Start a conflict record', () => openConflictDialog(ctx), true)] }),
    ...dataNotices(ctx), privacyNotice(ctx),
    h('div', { class: 'stat-row' },
      stat({ label: 'Active records', value: summary.active, hint: 'includes support handoffs' }),
      stat({ label: 'Follow-ups due', value: summary.followUpDue.length, hint: 'today, overdue or unscheduled', tone: summary.followUpDue.length ? 'warn' : '' }),
      stat({ label: 'Support route to check', value: summary.needsSupport.length, hint: 'unsure, serious or declined participation', tone: summary.needsSupport.length ? 'warn' : '' }),
      stat({ label: 'Resolved after follow-up', value: summary.resolved, hint: 'manager-recorded, not an independent finding' })),
    h('div', { class: 'tabs', role: 'group', 'aria-label': 'Conflict record views' }, ...[
      ['active', 'Active', summary.active], ['attention', 'Needs attention', summary.attention.length],
      ['resolved', 'Resolved', summary.resolved], ['all', 'All', summary.rows.length],
    ].map(([key, label, count]) => h('button', { type: 'button', class: `tab ${key === filter ? 'is-active' : ''}`, 'aria-pressed': String(key === filter),
      onClick: () => ctx.navigate(`#/conflicts?filter=${key}`) }, label, h('span', { class: 'tab-count' }, String(count))))),
    rows.length ? h('div', { class: 'conflict-list' }, ...rows.map(({ record, health }) => card({
      title: record.title, subtitle: `${CONFLICT_STATUS[record.status]} · opened ${formatDate(record.openedOn)}`,
      actions: [badge(health.label, health.tone)],
      body: h('div', { class: 'row-gap' },
        h('p', { class: 'muted small' }, record.status === 'resolved' ? 'Closure and earlier agreements are kept as history.' : `Next follow-up: ${formatDate(record.nextFollowUpOn)}${!record.nextFollowUpOn ? ' — needs scheduling' : ''}`),
        h('a', { class: 'btn btn-ghost', href: `#/conflicts/${encodeURIComponent(record.id)}` }, 'Open working record')),
    }))) : emptyState({ title: summary.rows.length ? 'No records in this view' : 'Start with listening, not a verdict',
      body: 'Record an ordinary disagreement using neutral language. You can start with unknown perspectives and participation, but you cannot call a proposal an agreement.',
      action: button('Start a conflict record', () => openConflictDialog(ctx), true) }),
    card({ title: 'Know when to ask for help', body: h('div', { class: 'prose small' },
      h('p', null, 'Serious misconduct, harassment, discrimination, retaliation, threats, safeguarding concerns or an unsafe power imbalance need appropriate qualified support and your organisation’s procedures. Do not use informal discussion to avoid an investigation or someone’s right to raise a concern.'),
      h('p', { class: 'muted' }, 'No conflict-style diagnosis, blame assignment, automatic employee rating or forced reconciliation is made here. No universal resolution deadline is assumed.')) }),
  );
}

function checklist(checks) {
  return h('ul', { class: 'review-checklist' }, ...checks.map((check) => h('li', { class: check.met ? 'is-met' : '' },
    h('span', { 'aria-hidden': 'true' }, check.met ? '✓' : '○'), h('span', null, check.label))));
}
function participantCards(participants) {
  return h('div', { class: 'grid grid-2' }, ...participants.map((party) => h('section', { class: 'conflict-party' },
    h('h3', null, party.name), badge(PARTICIPATION[party.participation], party.participation === 'willing' ? 'neutral' : 'warn'),
    h('dl', { class: 'conflict-notes' }, h('dt', null, 'Their perspective'), h('dd', null, party.perspective || 'Not yet heard / unknown. Do not infer.'),
      h('dt', null, 'What matters to them'), h('dd', null, party.interest || 'Not yet heard / unknown. Ask rather than guess.')))));
}
function commitmentList(ctx, record, agreement, canEdit = false) {
  return h('ol', { class: 'conflict-commitments' }, ...agreement.actions.map((action) => h('li', null,
    h('div', { class: 'conflict-commitment-head' }, h('strong', null, action.owner), badge(action.completedOn ? 'Result recorded' : 'Open commitment', action.completedOn ? 'good' : 'neutral')),
    h('p', { class: 'conflict-text' }, action.text), h('p', { class: 'muted small' }, `Due ${formatDate(action.dueOn)}`),
    action.completedOn ? h('div', { class: 'conflict-result' }, h('strong', { class: 'small' }, `Result · ${formatDate(action.completedOn)}`), h('p', { class: 'conflict-text' }, action.completionNote))
      : canEdit ? button('Record commitment result', () => openConflictResultDialog(ctx, record, action)) : null)));
}
function agreementHistory(ctx, record, agreement, index) {
  return h('details', { class: 'conflict-history-item' }, h('summary', null, `Agreement ${index + 1} · ${formatDate(agreement.date)} · preserved version`),
    h('p', { class: 'conflict-text' }, agreement.text), commitmentList(ctx, record, agreement),
    h('p', { class: 'muted small' }, `Review date at agreement: ${formatDate(agreement.reviewOn)}. Confirmation recorded by the manager; not signatures.`),
    h('h3', { class: 'small' }, 'Situation, process and participants at agreement'),
    h('p', { class: 'conflict-text small' }, agreement.context.summary || 'Situation was not captured in this imported agreement.'),
    h('p', { class: 'conflict-text small' }, `${agreement.context.coordinator} · ${agreement.context.process}`),
    h('p', { class: 'conflict-text small' }, `Sharing limits: ${agreement.context.sharing || 'Not recorded'}`), participantCards(agreement.context.participants));
}

export function renderConflictDetail(ctx, conflictId) {
  const record = (ctx.state.conflicts || []).find((r) => r.id === conflictId);
  if (!record) return h('div', { class: 'page' }, pageHeader({ title: 'Conflict record not found' }),
    emptyState({ title: 'This record is not in the current workspace', action: h('a', { href: '#/conflicts', class: 'btn btn-primary' }, 'Back to conflicts') }));
  const health = conflictHealth(record, ctx.now);
  const agreement = currentAgreement(record);
  const readiness = agreementReadiness(record);
  const resolution = resolutionReadiness(record);
  const canEdit = ['open', 'agreed'].includes(record.status);
  return h('div', { class: 'page conflict-detail' },
    h('a', { class: 'back-link', href: '#/conflicts' }, '← Conflict records'),
    pageHeader({ eyebrow: 'Manager’s working record', title: record.title,
      subtitle: `${CONFLICT_STATUS[record.status]} · opened ${formatDate(record.openedOn)} · coordinator: ${record.coordinator || 'not recorded'}`,
      meta: h('div', { class: 'row-gap' }, badge(health.label, health.tone), record.status !== 'resolved' ? h('span', { class: 'muted small' }, `Next follow-up ${formatDate(record.nextFollowUpOn)}`) : null),
      actions: canEdit ? [button('Edit context', () => openConflictDialog(ctx, record)), button('Record follow-up', () => openConflictFollowUpDialog(ctx, record), true)]
        : [record.status === 'escalated' ? button('Record follow-up', () => openConflictFollowUpDialog(ctx, record), true) : null,
          button('Reopen record', () => openConflictTransitionDialog(ctx, record, 'reopened'))].filter(Boolean) }),
    ...dataNotices(ctx), privacyNotice(ctx),
    health.needsSupport ? banner({ tone: 'bad', title: 'Check the support route before any agreement',
      body: 'The assessment is unsure/serious, or a participant has declined. Do not pressure anyone to participate. Seek an appropriate qualified person and use the manual handoff record to keep your next step visible.' }) : null,
    record.status === 'escalated' ? banner({ tone: 'caution', title: 'Handoff recorded — not sent, not resolved', body: 'Contact the recorded support person yourself. Keep checking that support was received; the follow-up date remains in your reminders.' }) : null,
    health.changedContext ? banner({ tone: 'caution', title: 'The context changed after the agreement', body: 'The earlier agreement is kept, but it cannot support closure of a changed situation, participants, interests, participation or process. Record a new confirmed agreement.' }) : null,
    card({ title: 'Situation, process and sharing limits', subtitle: CONFLICT_SAFETY[record.safety], body: h('dl', { class: 'conflict-notes' },
      h('dt', null, 'Observable situation and impact'), h('dd', null, record.summary || 'Not recorded'),
      h('dt', null, 'Discussion process'), h('dd', null, record.process || 'Not yet agreed'),
      h('dt', null, 'Information-sharing limits'), h('dd', null, record.sharing || 'Not yet recorded — do not promise confidentiality.')) }),
    card({ title: 'Hear each perspective and interest', subtitle: 'These are manager-entered accounts. Unknown is not agreement or evidence against someone.', body: participantCards(record.participants) }),
    canEdit ? card({ title: 'Before an informal agreement', subtitle: 'Missing conditions are shown, not guessed. Serious matters can take the support route without filling an informal-process form.',
      body: h('div', { class: 'stack' }, checklist(readiness.checks), h('div', { class: 'row-gap' },
        button(agreement ? 'Record a new agreement' : 'Record agreement', () => openConflictAgreementDialog(ctx, record), true, !readiness.canAgree),
        button('Record support handoff', () => openConflictTransitionDialog(ctx, record, 'escalated')))) }) : null,
    agreement ? card({ title: 'Current agreement and commitments', subtitle: `Version ${record.agreements.length} · ${formatDate(agreement.date)} · explicitly confirmed by everyone, as recorded by the manager`,
      body: h('div', { class: 'stack' }, h('p', { class: 'conflict-text' }, agreement.text),
        h('p', { class: 'muted small' }, `Review date originally agreed: ${formatDate(agreement.reviewOn)}. The next follow-up date above may have been rescheduled by a later check-in.`),
        commitmentList(ctx, record, agreement, canEdit)) }) : null,
    canEdit ? card({ title: 'An agreement is not yet a resolution', subtitle: 'Complete commitments, then check with everyone. A same-day check-in recorded before the results cannot verify those results.',
      body: h('div', { class: 'stack' }, checklist(resolution.checks), button('Record resolution', () => openConflictTransitionDialog(ctx, record, 'resolved'), true, !resolution.canResolve)) }) : null,
    card({ title: 'Follow-up history', body: record.followUps.length ? h('ol', { class: 'conflict-history' }, ...record.followUps.slice().reverse().map((entry) => h('li', null,
      h('div', { class: 'row-gap' }, h('strong', null, formatDate(entry.date)), badge(CONFLICT_OUTCOMES[entry.outcome], entry.outcome === 'not-holding' ? 'warn' : 'neutral')),
      h('p', { class: 'conflict-text' }, entry.note), h('p', { class: 'muted tiny' }, `${entry.confirmedByAll ? 'Everyone confirmed, as recorded by manager' : 'No all-party holding confirmation'} · next follow-up then: ${formatDate(entry.nextFollowUpOn)}`))))
      : emptyState({ title: 'No follow-up recorded yet', body: 'An action being done and an agreement holding are different facts. Check both.' }) }),
    record.transitions.length ? card({ title: 'Closure, handoff and reopening history', body: h('ol', { class: 'conflict-history' }, ...record.transitions.slice().reverse().map((entry) => h('li', null,
      h('strong', null, `${formatDate(entry.date)} · ${entry.type === 'escalated' ? 'Support handoff recorded (not sent)' : entry.type === 'resolved' ? 'Resolution recorded' : 'Reopened'}`),
      entry.handoffTo ? h('p', { class: 'small' }, `Contact: ${entry.handoffTo}`) : null, h('p', { class: 'conflict-text' }, entry.note)))) }) : null,
    record.agreements.length ? card({ title: 'Agreement versions and captured context', subtitle: 'New agreements never overwrite the earlier version. Results stay with the commitment they relate to.',
      body: h('div', { class: 'stack' }, ...record.agreements.map((a, i) => agreementHistory(ctx, record, a, i))) }) : null,
  );
}
