/** Capture dialogs for a manager's conflict working record. No employee attestations are implied. */
import { h, buildForm, openModal, toast } from './dom.js';
import { CONFLICT_SAFETY, PARTICIPATION, CONFLICT_OUTCOMES } from '../core/domain/conflicts.js';
import { dayKey, addDays } from '../core/time.js';

const options = (labels) => Object.entries(labels).map(([value, label]) => ({ value, label }));

function repeatingFields({ title, initial, fields, max, addLabel }) {
  const group = h('div', { class: 'conflict-repeat field-wide' });
  const rowsNode = h('div', { class: 'stack' });
  const rows = [];
  const add = (value = {}) => {
    const row = buildForm(fields(value));
    const fieldset = h('fieldset', { class: 'conflict-fields' }, h('legend', null, title));
    // Move fields out of their helper form: there must be no nested <form>.
    const grid = h('div', { class: 'conflict-field-grid' });
    while (row.node.firstChild) grid.appendChild(row.node.firstChild);
    const item = { form: row, node: fieldset };
    fieldset.appendChild(grid);
    fieldset.appendChild(h('button', { type: 'button', class: 'btn btn-small btn-ghost', onClick: () => {
      rows.splice(rows.indexOf(item), 1); fieldset.remove(); addButton.disabled = rows.length >= max; addButton.focus();
    } }, `Remove ${title.toLowerCase()}`));
    rows.push(item); rowsNode.appendChild(fieldset); addButton.disabled = rows.length >= max;
  };
  const addButton = h('button', { type: 'button', class: 'btn btn-small btn-ghost', onClick: () => {
    if (rows.length < max) { add(); rows.at(-1).node.querySelector('input, textarea, select')?.focus(); }
  } }, addLabel);
  group.append(rowsNode, addButton);
  for (const value of initial) add(value);
  return { node: group, values: () => rows.map((row) => row.form.getValues()) };
}

function dialog(ctx, { title, description, fields, repeating = null, submitLabel, submit, onSuccess = null }) {
  const form = buildForm(fields);
  const error = h('p', { class: 'field-error conflict-form-error', role: 'alert', tabindex: '-1' });
  if (repeating) form.node.appendChild(repeating.node);
  let modal;
  const save = () => {
    form.clearErrors(); error.textContent = '';
    const result = submit(form.getValues(), repeating?.values());
    if (!result.ok) {
      error.textContent = result.error;
      if (result.field) form.setFieldError(result.field, result.error);
      const field = result.field && form.field(result.field);
      (field || error).focus();
      return;
    }
    modal.close();
    toast(result.warning ? 'Changes are in memory only. Export your workspace before reloading.' : 'Conflict record updated', result.warning ? 'bad' : 'good');
    if (onSuccess) onSuccess(result);
    const heading = document.querySelector('#view h1');
    if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus(); }
  };
  form.node.addEventListener('submit', (event) => { event.preventDefault(); save(); });
  modal = openModal({
    title, description, size: 'lg', body: h('div', null, error, form.node),
    footer: [h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => modal.close() }, 'Cancel'),
      h('button', { class: 'btn btn-primary', type: 'button', onClick: save }, submitLabel)],
  });
  return modal;
}

export function openConflictDialog(ctx, record = null) {
  const participants = repeatingFields({
    title: 'Participant', initial: record?.participants || [{}, {}], max: 8, addLabel: 'Add participant',
    fields: (p) => [
      { name: 'name', label: 'Name or agreed identifier', value: p.name || '', required: true, help: 'May include you or someone outside the roster. Keep identifiers distinct.' },
      { name: 'participation', label: 'Participation in informal discussion', type: 'select', value: p.participation || 'unknown', options: options(PARTICIPATION) },
      { name: 'perspective', label: 'Their perspective — what they said happened', type: 'textarea', rows: 2, value: p.perspective || '', help: 'Leave unknown rather than guessing. A manager-entered account is not independent testimony.' },
      { name: 'interest', label: 'Their underlying interest — what matters to them', type: 'textarea', rows: 2, value: p.interest || '', help: 'Ask why the issue matters, not only which solution they demand.' },
    ],
  });
  return dialog(ctx, {
    title: record ? 'Edit conflict context' : 'Start a conflict record',
    description: 'For ordinary working disagreements, not an investigation. Unknown participation is okay while listening; it is never treated as consent. Store only notes you are authorised to keep.',
    fields: [
      { name: 'title', label: 'Neutral reference', value: record?.title || '', required: true, placeholder: 'Handoff expectations', help: 'Avoid names or allegations in the title.' },
      { name: 'coordinator', label: 'Who owns the next step?', value: record?.coordinator || ctx.state.settings.leaderName || '', required: true },
      { name: 'openedOn', label: 'Opening date', type: 'date', value: record?.openedOn || dayKey(ctx.now), max: dayKey(ctx.now) },
      { name: 'nextFollowUpOn', label: 'Next follow-up', type: 'date', value: record?.nextFollowUpOn || addDays(ctx.now, 7), help: 'A date you choose, not a universal resolution deadline. Reminders appear when the app is opened.' },
      { name: 'safety', label: 'Which route is appropriate?', type: 'select', value: record?.safety || 'unknown', options: options(CONFLICT_SAFETY), wide: true, help: 'If unsure, or if there are threats, harassment, discrimination, retaliation or an unsafe power imbalance, seek qualified help. Do not force informal reconciliation.' },
      { name: 'summary', label: 'Observable situation and impact', type: 'textarea', value: record?.summary || '', required: true, help: 'Describe the work and the disagreement, not a character judgement or a verdict.' },
      { name: 'process', label: 'Discussion process and ground rules', type: 'textarea', rows: 2, value: record?.process || '', placeholder: 'Listen separately first; joint discussion only if everyone is willing; an impartial facilitator if needed.' },
      { name: 'sharing', label: 'Agreed information-sharing limits', type: 'textarea', rows: 2, value: record?.sharing || '', help: 'What may be recorded/shared, with whom and for what purpose? Do not promise absolute confidentiality.' },
    ],
    repeating: participants, submitLabel: record ? 'Save context' : 'Create conflict record',
    submit: (values, parties) => record ? ctx.api.updateConflict(record.id, { ...values, participants: parties }) : ctx.api.addConflict({ ...values, participants: parties }),
    onSuccess: (result) => ctx.navigate(`#/conflicts/${encodeURIComponent(result.id)}`),
  });
}

export function openConflictAgreementDialog(ctx, record) {
  const actions = repeatingFields({
    title: 'Commitment', initial: [{}], max: 12, addLabel: 'Add commitment',
    fields: (action) => [
      { name: 'owner', label: 'Accountable owner', required: true, value: action.owner || '', help: 'One named person or role. This is not an automatic assignment.' },
      { name: 'dueOn', label: 'Due date', type: 'date', value: action.dueOn || addDays(ctx.now, 7) },
      { name: 'text', label: 'Observable commitment', type: 'textarea', rows: 2, required: true, value: action.text || '' },
    ],
  });
  return dialog(ctx, {
    title: 'Record a confirmed agreement',
    description: 'Write what everyone actually agreed, not what you want them to accept. A new version keeps earlier agreements and their outcomes as history.',
    fields: [
      { name: 'date', label: 'Agreement date', type: 'date', value: dayKey(ctx.now), max: dayKey(ctx.now) },
      { name: 'reviewOn', label: 'Review the agreement on', type: 'date', value: addDays(ctx.now, 7) },
      { name: 'text', label: 'Agreement and what better will look like', type: 'textarea', required: true, rows: 3 },
      { name: 'confirmedByAll', label: 'Explicit agreement', type: 'checkbox', checkboxLabel: 'Everyone explicitly confirmed this agreement and these commitments.', help: 'Recorded by you; not an employee signature or independent verification. Leave unchecked if confirmation is unknown.' },
    ],
    repeating: actions, submitLabel: 'Record agreement', submit: (values, commitments) => ctx.api.agreeConflict(record.id, { ...values, actions: commitments }),
  });
}

export function openConflictFollowUpDialog(ctx, record) {
  return dialog(ctx, {
    title: 'Check whether the agreement holds',
    description: 'Ask everyone affected. An unverified result stays unknown; a support handoff is not a resolution. This does not send messages or notifications.',
    fields: [
      { name: 'date', label: 'Follow-up date', type: 'date', value: dayKey(ctx.now), max: dayKey(ctx.now) },
      { name: 'nextFollowUpOn', label: 'Next follow-up', type: 'date', value: addDays(ctx.now, 7) },
      { name: 'outcome', label: 'What did this establish?', type: 'select', options: options(CONFLICT_OUTCOMES), value: 'unknown', wide: true },
      { name: 'note', label: 'What you checked and what changed', type: 'textarea', required: true, rows: 3 },
      { name: 'confirmedByAll', label: 'Confirmation', type: 'checkbox', checkboxLabel: 'I checked with everyone, and they confirm the agreement is holding.', help: 'Required only for a holding result. It is a manager-recorded confirmation, not a signature.' },
    ],
    submitLabel: 'Record follow-up', submit: (values) => ctx.api.followUpConflict(record.id, values),
  });
}

export function openConflictResultDialog(ctx, record, action) {
  return dialog(ctx, {
    title: 'Record a commitment result', description: 'A completed action is not proof that the relationship is repaired. Follow up separately with everyone.',
    fields: [
      { name: 'completedOn', label: 'When it was done', type: 'date', value: dayKey(ctx.now), max: dayKey(ctx.now) },
      { name: 'completionNote', label: 'What actually happened', type: 'textarea', required: true, help: action.text },
    ], submitLabel: 'Record result', submit: (values) => ctx.api.completeConflictAction(record.id, action.id, values),
  });
}

export function openConflictTransitionDialog(ctx, record, type) {
  const resolve = type === 'resolved';
  const escalate = type === 'escalated';
  return dialog(ctx, {
    title: resolve ? 'Record resolution after follow-up' : escalate ? 'Record a manual support handoff' : 'Reopen this conflict record',
    description: resolve
      ? 'The readiness checks require dated results and a later follow-up with everyone. Your account is not an independent finding; reopening is always possible.'
      : escalate ? 'Contact the appropriate HR, employee representative, safeguarding, ombuds or qualified support yourself. This app only records your next step; it sends nothing and is not the place for detailed allegations.'
        : 'Earlier agreements, follow-ups and closure notes remain as history. A fresh follow-up will be needed; the old one cannot close the loop again.',
    fields: [
      { name: 'date', label: 'Date', type: 'date', value: dayKey(ctx.now), max: dayKey(ctx.now) },
      ...(!resolve ? [{ name: 'nextFollowUpOn', label: escalate ? 'Check the handoff was received on' : 'Next follow-up', type: 'date', value: addDays(ctx.now, 7) }] : []),
      ...(escalate ? [{ name: 'handoffTo', label: 'Who will you contact?', required: true, help: 'Record a name or support role. No email or automatic delivery is implied.' }] : []),
      { name: 'note', label: resolve ? 'Why the loop can be closed' : escalate ? 'Next step and sharing boundaries' : 'What changed / why reopen?', type: 'textarea', required: true },
    ],
    submitLabel: resolve ? 'Record resolution' : escalate ? 'Record handoff (not sent)' : 'Reopen record',
    submit: (values) => resolve ? ctx.api.resolveConflict(record.id, values) : escalate ? ctx.api.escalateConflict(record.id, values) : ctx.api.reopenConflict(record.id, values),
  });
}
