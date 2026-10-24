/**
 * app/ui/modals.js — the capture dialogs.
 *
 * Each function opens one dialog, validates on submit, and reports the result
 * through a toast. Titles say what actually happens ("Log a 1:1", not "New
 * record"), and destructive or irreversible actions confirm first.
 */

import { h, openModal, buildForm, toast, confirmDialog, uid } from './dom.js';
import { validateSBI, QUALITY_LABELS } from '../core/domain/feedback.js';
import { suggestAgenda } from '../core/domain/oneonone.js';
import { COMPETENCIES } from '../core/domain/growth.js';
import { PULSE_DIMENSIONS, PULSE_LABELS, PULSE_PROMPTS, LEVEL_LABELS, LEVELS, READINESS_LABELS, READINESS } from '../core/schema.js';
import { addDays, dayKey, formatDate } from '../core/time.js';
import { personOptions } from './options.js';
import { SELF_REFLECTION_PROMPTS, MANAGER_PROMPTS, REVIEW_RATINGS, REVIEW_RATING_LABELS } from '../core/domain/reviews.js';
import { DELEGATION_AUTHORITY } from '../core/domain/delegations.js';

function submitter(api, build) {
  return (values, form, close) => {
    form.clearErrors();
    const payload = build(values);
    const result = api(payload);
    if (!result.ok) {
      if (result.field) form.setFieldError(result.field, result.error);
      toast(result.error, 'bad');
      return false;
    }
    close();
    return true;
  };
}

function submitBar(form, { label = 'Save', cancel = 'Cancel', extra = null } = {}) {
  // These buttons live in the modal footer, outside <form>, so they must call
  // the submit handler explicitly rather than relying on native form submission.
  const cancelBtn = h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => form.__close() }, cancel);
  const submitBtn = h('button', { class: 'btn btn-primary', type: 'button', onClick: () => form.__onSubmit() }, label);
  form.node.addEventListener('submit', (event) => {
    event.preventDefault();
    form.__onSubmit();
  });
  return extra ? [extra, cancelBtn, submitBtn] : [cancelBtn, submitBtn];
}

/** Generic form dialog used by every capture flow. */
function formDialog({ title, description, fields, submitLabel = 'Save', size = 'md', onSubmit, footerExtra = null }) {
  const form = buildForm(fields);
  let closeFn = null;
  form.__close = () => closeFn && closeFn();
  form.__onSubmit = () => {
    onSubmit(form.getValues(), form, () => closeFn && closeFn());
  };
  const dialog = openModal({
    title,
    description,
    body: form.node,
    footer: submitBar(form, { label: submitLabel, extra: footerExtra }),
    size,
    onClose: () => form.clearErrors(),
  });
  closeFn = dialog.close;
  return dialog;
}

/* --------------------------------------------------------------- people */

export function openPersonDialog(ctx, { person = null } = {}) {
  const isEdit = Boolean(person);
  formDialog({
    title: isEdit ? `Edit ${person.name}` : 'Add a person',
    description: isEdit ? 'Changes are logged in the event history.' : 'Only a name is required. Everything else can be filled in later.',
    submitLabel: isEdit ? 'Save changes' : 'Add person',
    fields: [
      { name: 'name', label: 'Name', required: true, value: person?.name || '', placeholder: 'Jordan Alvarez' },
      { name: 'role', label: 'Role', value: person?.role || '', placeholder: 'Product Manager' },
      {
        name: 'level',
        label: 'Level',
        type: 'select',
        value: person?.level || 'ic',
        options: LEVELS.map((l) => ({ value: l, label: LEVEL_LABELS[l] })),
        help: 'Drives which succession seats are suggested.',
      },
      { name: 'team', label: 'Team', value: person?.team || ctx.state.settings.teamName },
      { name: 'startDate', label: 'Start date', type: 'date', value: person?.startDate || dayKey(ctx.now) },
      {
        name: 'focus',
        label: 'Focus right now',
        type: 'textarea',
        rows: 2,
        value: person?.focus || '',
        placeholder: 'What is this person trying to achieve in the next few months?',
        help: 'Shows on their page and in the 1:1 agenda.',
      },
    ],
    onSubmit: submitter(
      (payload) => (isEdit ? ctx.api.updatePerson(person.id, payload) : ctx.api.addPerson(payload)),
      (v) => v,
    ),
  });
}

/* ---------------------------------------------------------------- 1:1s */

export function openOneOnOneDialog(ctx, { personId = null } = {}) {
  const active = ctx.state.people.filter((p) => p.status !== 'archived');
  if (!active.length) {
    toast('Add someone to your roster first.', 'bad');
    return;
  }
  const selected = personId || active[0].id;
  const state = ctx.state;
  const settings = state.settings;

  const suggestions = suggestAgenda(state, selected, ctx.now, settings);
  const agendaBox = h('div', { class: 'agenda-picks' });
  const selectedAgenda = new Set(suggestions.slice(0, 3).map((s) => s.text));

  function renderAgenda() {
    agendaBox.replaceChildren(
      ...suggestions.map((s) =>
        h(
          'label',
          { class: `agenda-pick ${selectedAgenda.has(s.text) ? 'is-picked' : ''}` },
          h('input', {
            type: 'checkbox',
            checked: selectedAgenda.has(s.text),
            onChange: (e) => {
              if (e.target.checked) selectedAgenda.add(s.text);
              else selectedAgenda.delete(s.text);
              e.target.closest('.agenda-pick').classList.toggle('is-picked', e.target.checked);
            },
          }),
          h('span', null, h('span', { class: 'agenda-text' }, s.text), h('span', { class: 'agenda-reason' }, s.reason)),
        ),
      ),
    );
  }
  renderAgenda();

  const personField = {
    name: 'personId',
    label: 'Who with',
    type: 'select',
    value: selected,
    options: personOptions(active),
    required: true,
  };

  const form = buildForm([
    personField,
    { name: 'date', label: 'Date', type: 'date', value: dayKey(ctx.now), required: true },
    {
      name: 'status',
      label: 'Outcome',
      type: 'select',
      value: 'held',
      options: [
        { value: 'held', label: 'Held' },
        { value: 'skipped', label: 'Skipped' },
        { value: 'moved', label: 'Moved' },
      ],
      help: 'Skipped and moved meetings still count — a pattern is a signal.',
    },
    { name: 'mood', label: 'How did it feel? (1 low – 5 high)', type: 'scale', value: 3 },
    { type: 'static', label: 'Suggested agenda', value: agendaBox },
    { name: 'notes', label: 'Notes', type: 'textarea', rows: 3, placeholder: 'What was said that matters?', help: 'A meeting with no notes cannot be followed up on.' },
    {
      name: 'action',
      label: 'One next action (optional)',
      placeholder: 'What will one of you do before the next meeting?',
      help: 'Actions appear on the 1:1 board and are tracked to completion.',
    },
    { name: 'actionDue', label: 'Action due', type: 'date', value: addDays(dayKey(ctx.now), 7) },
  ]);

  const selectedPerson = () => active.find((p) => p.id === form.getValues().personId) || active[0];
  form.field('personId').addEventListener('change', (event) => {
    const next = event.target.value;
    suggestions.splice(0, suggestions.length, ...suggestAgenda(state, next, ctx.now, settings));
    selectedAgenda.clear();
    for (const s of suggestions.slice(0, 3)) selectedAgenda.add(s.text);
    renderAgenda();
  });

  form.__close = () => dialog.close();
  form.__onSubmit = () => {
    const values = form.getValues();
    const person = selectedPerson();
    const actions = values.action
      ? [{ text: values.action, due: values.actionDue || null }]
      : [];
    const result = ctx.api.logOneOnOne({
      personId: person.id,
      date: values.date,
      status: values.status,
      mood: values.mood,
      notes: values.notes,
      agenda: [...selectedAgenda].map((text) => ({ text, done: values.status === 'held', source: 'suggestion' })),
      actions,
    });
    if (!result.ok) {
      toast(result.error, 'bad');
      return;
    }
    dialog.close();
    toast(values.status === 'held' ? `1:1 with ${person.name} logged` : `Marked as ${values.status}`, 'good');
  };
  form.node.addEventListener('submit', (event) => {
    event.preventDefault();
    form.__onSubmit();
  });

  const dialog = openModal({
    title: 'Log a 1:1',
    description: 'The agenda is built from that person’s open items. Keep it to a few minutes — the point is that it happens.',
    body: form.node,
    footer: [h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'), h('button', { class: 'btn btn-primary', type: 'button', onClick: () => form.__onSubmit() }, 'Log it')],
    size: 'lg',
  });
  return dialog;
}

export function openActionDialog(ctx, { meetingId }) {
  formDialog({
    title: 'Add an action',
    fields: [
      { name: 'text', label: 'Action', required: true, placeholder: 'Send the revised draft by Thursday' },
      { name: 'due', label: 'Due', type: 'date', value: addDays(dayKey(ctx.now), 7) },
    ],
    submitLabel: 'Add action',
    size: 'sm',
    onSubmit: (values, form, close) => {
      const result = ctx.api.addMeetingAction(meetingId, values.text, values.due);
      if (!result.ok) return form.setFieldError(result.field || 'text', result.error);
      close();
      toast('Action added', 'good');
    },
  });
}

/* ------------------------------------------------------------ feedback */

export function openFeedbackDialog(ctx, { personId = null, kind = 'praise' } = {}) {
  const active = ctx.state.people.filter((p) => p.status !== 'archived');
  if (!active.length) {
    toast('Add someone to your roster first.', 'bad');
    return;
  }

  const preview = h('div', { class: 'sbi-preview', 'aria-live': 'polite' });
  const form = buildForm([
    { name: 'personId', label: 'Who', type: 'select', value: personId || active[0].id, options: personOptions(active), required: true },
    {
      name: 'kind',
      label: 'Type',
      type: 'select',
      value: kind,
      options: [
        { value: 'praise', label: 'Praise — reinforce something that worked' },
        { value: 'constructive', label: 'Constructive — change something that did not' },
      ],
    },
    {
      name: 'situation',
      label: 'Situation',
      placeholder: 'In Thursday’s roadmap review…',
      help: 'When and where. Enough that the moment is identifiable.',
    },
    {
      name: 'behavior',
      label: 'Behaviour',
      required: true,
      type: 'textarea',
      rows: 2,
      placeholder: 'you brought two options with the trade-offs written down…',
      help: 'What someone could have filmed. Not an interpretation.',
    },
    {
      name: 'impact',
      label: 'Impact',
      type: 'textarea',
      rows: 2,
      placeholder: 'the decision took ten minutes instead of another week…',
      help: 'What changed because of it — for the work, the team, or you.',
    },
    { name: 'tags', label: 'Tags', placeholder: 'ownership, candor (comma separated)' },
    {
      name: 'observedOn',
      label: 'When did you observe the behaviour?',
      type: 'date',
      help: 'Optional. Leave blank when you cannot establish the date; LeadOS will report the delay as unmeasured, never as zero.',
    },
    { name: 'date', label: 'When was the feedback conversation?', type: 'date', value: dayKey(ctx.now) },
    {
      name: 'followUpOn',
      label: 'Follow up on',
      type: 'date',
      help: 'For constructive feedback: the date you will check whether anything changed.',
    },
  ]);

  function refreshPreview() {
    const values = form.getValues();
    const result = validateSBI(values);
    preview.replaceChildren(
      h('div', { class: 'sbi-score' }, h('span', { class: 'sbi-score-label' }, 'Specificity'), h('strong', null, QUALITY_LABELS[result.quality])),
      result.tips.length
        ? h('ul', { class: 'sbi-tips' }, ...result.tips.map((t) => h('li', null, t)))
        : h('p', { class: 'sbi-ok' }, result.complete ? 'Specific enough to be repeated by the person who receives it.' : 'Fill in all three parts to make this usable.'),
    );
    if (values.kind === 'constructive' && !form.getValues().followUpOn) {
      preview.appendChild(h('p', { class: 'sbi-hint' }, 'Tip: set a follow-up date. Constructive feedback without a second conversation reads as a verdict.'));
    }
  }

  for (const name of ['situation', 'behavior', 'impact', 'kind', 'followUpOn']) {
    form.field(name).addEventListener('input', refreshPreview);
    form.field(name).addEventListener('change', refreshPreview);
  }
  refreshPreview();

  form.node.appendChild(preview);

  form.__close = () => dialog.close();
  form.__onSubmit = () => {
    const values = form.getValues();
    form.clearErrors();
    const result = ctx.api.addFeedback({
      personId: values.personId,
      kind: values.kind,
      situation: values.situation,
      behavior: values.behavior,
      impact: values.impact,
      tags: (values.tags || '').split(',').map((t) => t.trim()).filter(Boolean),
      date: values.date,
      observedOn: values.observedOn || null,
      followUpOn: values.followUpOn || null,
    });
    if (!result.ok) {
      form.setFieldError(result.field || 'behavior', result.error);
      toast(result.error, 'bad');
      return;
    }
    dialog.close();
    toast(values.kind === 'praise' ? 'Praise recorded' : 'Constructive feedback recorded', 'good');
  };
  form.node.addEventListener('submit', (event) => {
    event.preventDefault();
    form.__onSubmit();
  });

  const dialog = openModal({
    title: 'Record feedback',
    description: 'Situation → Behaviour → Impact. Separate the observation from the judgement and the person can act on it.',
    body: form.node,
    footer: [h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'), h('button', { class: 'btn btn-primary', type: 'button', onClick: () => form.__onSubmit() }, 'Save feedback')],
    size: 'lg',
  });
  return dialog;
}

export function openFeedbackDatesDialog(ctx, { feedback }) {
  formDialog({
    title: 'Edit feedback dates',
    description: 'Correct the observation or conversation date without rewriting the feedback itself. Leave observation blank if it cannot be established.',
    submitLabel: 'Save dates',
    fields: [
      { name: 'observedOn', label: 'Behaviour observed on', type: 'date', value: feedback.observedOn || '', help: 'Blank remains explicitly unmeasured.' },
      { name: 'date', label: 'Feedback discussed on', type: 'date', required: true, value: feedback.date },
    ],
    onSubmit: (values, form, close) => {
      const result = ctx.api.updateFeedback(feedback.id, { observedOn: values.observedOn || null, date: values.date });
      if (!result.ok) {
        form.setFieldError(result.field || 'observedOn', result.error);
        return;
      }
      close();
      toast('Feedback dates updated', 'good');
    },
  });
}

/* --------------------------------------------------------------- goals */

export function openGoalDialog(ctx, { personId = null, goal = null } = {}) {
  const active = ctx.state.people.filter((p) => p.status !== 'archived');
  const isEdit = Boolean(goal);
  formDialog({
    title: isEdit ? 'Edit goal' : 'Set a goal',
    description: isEdit
      ? 'Correct the objective or authorship without replacing its identity, owner, key results or check-in history.'
      : 'An objective with at least one number attached. Record whether the owner helped shape it; if you do not know, leave authorship unknown.',
    submitLabel: isEdit ? 'Save changes' : 'Create goal',
    size: 'lg',
    fields: [
      { name: 'title', label: 'Objective', required: true, wide: true, value: goal?.title || '', placeholder: 'Cut activation time to first value below 10 minutes' },
      ...(isEdit
        ? [
            { name: 'ownerId', type: 'hidden', value: goal.ownerId || '' },
            { type: 'static', label: 'Owner', value: goal.ownerId ? active.find((person) => person.id === goal.ownerId)?.name || 'Person no longer in active roster' : 'Team goal (no single owner)' },
          ]
        : [{ name: 'ownerId', label: 'Owner', type: 'select', value: personId || '', options: [{ value: '', label: 'Team goal (no single owner)' }, ...personOptions(active)] }]),
      {
        name: 'coAuthored',
        label: 'Who shaped the objective?',
        type: 'select',
        value: goal?.coAuthored === true ? 'true' : goal?.coAuthored === false ? 'false' : '',
        options: [
          { value: '', label: 'Not recorded / unknown' },
          { value: 'true', label: 'Owner and leader shaped it together' },
          { value: 'false', label: 'Leader set it without recorded co-authorship' },
        ],
        help: 'Applies to person-owned goals. Team goals store this as not applicable. Unknown is preserved as unknown.',
      },
      { name: 'dueDate', label: 'Due', type: 'date', value: goal?.dueDate || addDays(dayKey(ctx.now), 60) },
      ...(isEdit ? [] : [
        { name: 'krTitle', label: 'Key result', required: true, wide: true, placeholder: 'Median time to first value' },
        { name: 'krStart', label: 'Starting value', type: 'number', value: 0, step: 'any' },
        { name: 'krTarget', label: 'Target value', type: 'number', value: 10, step: 'any' },
        { name: 'krCurrent', label: 'Current value', type: 'number', value: 0, step: 'any' },
        { name: 'krUnit', label: 'Unit', placeholder: 'min, %, count' },
      ]),
      { name: 'description', label: 'Why this matters', type: 'textarea', rows: 2, wide: true, value: goal?.description || '' },
    ],
    onSubmit: (values, form, close) => {
      const payload = {
        title: values.title,
        description: values.description,
        ownerId: values.ownerId || null,
        scope: values.ownerId ? 'person' : 'team',
        coAuthored: values.ownerId ? (values.coAuthored === 'true' ? true : values.coAuthored === 'false' ? false : null) : null,
        dueDate: values.dueDate || null,
      };
      const result = isEdit
        ? ctx.api.updateGoal(goal.id, payload)
        : ctx.api.addGoal({
            ...payload,
            keyResults: values.krTitle
              ? [{ title: values.krTitle, start: Number(values.krStart), target: Number(values.krTarget), current: Number(values.krCurrent), unit: values.krUnit }]
              : [],
          });
      if (!result.ok) {
        form.setFieldError(result.field || 'title', result.error);
        return;
      }
      close();
      toast(isEdit ? 'Goal updated' : 'Goal created', 'good');
    },
  });
}

export function openCheckInDialog(ctx, { goal }) {
  const fields = [
    {
      name: 'note',
      label: 'What moved?',
      type: 'textarea',
      rows: 2,
      placeholder: 'What changed since the last check-in, and what is in the way?',
      wide: true,
    },
    {
      name: 'confidence',
      label: 'Confidence',
      type: 'select',
      value: goal.confidence,
      options: [
        { value: 'on-track', label: 'On track' },
        { value: 'at-risk', label: 'At risk' },
        { value: 'off-track', label: 'Off track' },
      ],
    },
    { type: 'divider', label: 'Update key results' },
    ...goal.keyResults.map((kr) => ({
      name: `kr_${kr.id}`,
      label: `${kr.title}${kr.unit ? ` (${kr.unit})` : ''}`,
      type: 'number',
      step: 'any',
      value: kr.current,
      help: `Start ${kr.start} → target ${kr.target}`,
    })),
  ];
  formDialog({
    title: `Check in: ${goal.title}`,
    description: 'Progress is computed from the key results, so update the numbers rather than a percentage.',
    submitLabel: 'Save check-in',
    fields,
    onSubmit: (values, form, close) => {
      const keyResults = goal.keyResults
        .filter((kr) => values[`kr_${kr.id}`] !== '' && values[`kr_${kr.id}`] !== undefined)
        .map((kr) => ({ id: kr.id, current: values[`kr_${kr.id}`] }));
      const result = ctx.api.checkInGoal(goal.id, { note: values.note, confidence: values.confidence, keyResults });
      if (!result.ok) return form.setFieldError('note', result.error);
      close();
      toast('Check-in saved', 'good');
    },
  });
}

export function openKeyResultDialog(ctx, { goalId }) {
  formDialog({
    title: 'Add a key result',
    size: 'sm',
    fields: [
      { name: 'title', label: 'Key result', required: true },
      { name: 'start', label: 'Start', type: 'number', value: 0, step: 'any' },
      { name: 'target', label: 'Target', type: 'number', value: 100, step: 'any' },
      { name: 'unit', label: 'Unit' },
    ],
    onSubmit: (values, form, close) => {
      const result = ctx.api.addKeyResult(goalId, {
        title: values.title,
        start: Number(values.start),
        target: Number(values.target),
        current: Number(values.start),
        unit: values.unit,
      });
      if (!result.ok) return form.setFieldError('title', result.error);
      close();
      toast('Key result added', 'good');
    },
  });
}

/* ----------------------------------------------------------- delegation */

export function openDelegationDialog(ctx, { personId = null, delegation = null } = {}) {
  const active = ctx.state.people.filter((p) => p.status !== 'archived');
  if (!active.length) {
    toast('Add someone to your roster before delegating an outcome.', 'bad');
    return;
  }
  const isEdit = Boolean(delegation);
  const owner = isEdit ? ctx.state.people.find((p) => p.id === delegation.personId) : null;
  formDialog({
    title: isEdit ? 'Edit delegation' : 'Delegate an outcome',
    description: 'Delegation transfers a clear result and a decision boundary—not just a task. Record the support and checkpoint that make follow-through possible.',
    submitLabel: isEdit ? 'Save changes' : 'Delegate outcome',
    size: 'lg',
    fields: [
      ...(isEdit
        ? [{ name: 'personId', type: 'hidden', value: delegation.personId }, { type: 'static', label: 'Accountable owner', value: owner?.name || 'Person no longer in roster' }]
        : [{ name: 'personId', label: 'Accountable owner', type: 'select', value: personId || active[0].id, options: personOptions(active), required: true }]),
      { name: 'title', label: 'Outcome or responsibility', required: true, wide: true, value: delegation?.title || '', placeholder: 'Own the monthly customer-risk review' },
      {
        name: 'expectedOutcome',
        label: 'What does success look like?',
        type: 'textarea',
        rows: 3,
        required: true,
        wide: true,
        value: delegation?.expectedOutcome || '',
        placeholder: 'By the due date, we will see…',
      },
      {
        name: 'authority',
        label: 'Decision authority',
        type: 'select',
        required: true,
        value: delegation?.authority || 'act-inform',
        options: Object.entries(DELEGATION_AUTHORITY).map(([value, item]) => ({ value, label: `${item.label} — ${item.description}` })),
        help: 'Choose the boundary explicitly. This is the owner’s authority, not an inferred permission level.',
      },
      {
        name: 'support',
        label: 'Resources, context and support',
        type: 'textarea',
        rows: 2,
        required: true,
        wide: true,
        value: delegation?.support || '',
        placeholder: 'Budget, access, people, constraints, and when you will help…',
      },
      { name: 'delegatedOn', label: 'Delegated on', type: 'date', required: true, value: delegation?.delegatedOn || dayKey(ctx.now) },
      { name: 'dueOn', label: 'Outcome due', type: 'date', required: true, value: delegation?.dueOn || addDays(dayKey(ctx.now), 14) },
    ],
    onSubmit: (values, form, close) => {
      const payload = {
        personId: values.personId,
        title: values.title,
        expectedOutcome: values.expectedOutcome,
        authority: values.authority,
        support: values.support,
        delegatedOn: values.delegatedOn,
        dueOn: values.dueOn,
      };
      const result = isEdit ? ctx.api.updateDelegation(delegation.id, payload) : ctx.api.addDelegation(payload);
      if (!result.ok) {
        form.setFieldError(result.field || 'title', result.error);
        toast(result.error, 'bad');
        return;
      }
      close();
      toast(isEdit ? 'Delegation updated' : 'Outcome delegated', 'good');
    },
  });
}

export function openDelegationCheckInDialog(ctx, { delegation }) {
  formDialog({
    title: `Check in: ${delegation.title}`,
    description: 'Ask about progress and support without taking the outcome back. A blocked checkpoint stays visible until a later checkpoint or terminal result.',
    submitLabel: 'Save check-in',
    fields: [
      { name: 'date', label: 'Check-in date', type: 'date', required: true, value: dayKey(ctx.now) },
      {
        name: 'progress', label: 'Current state', type: 'select', required: true, value: 'on-track',
        options: [{ value: 'on-track', label: 'On track' }, { value: 'blocked', label: 'Blocked / support needed' }],
      },
      { name: 'note', label: 'What changed, and what happens next?', type: 'textarea', rows: 4, required: true, wide: true },
    ],
    onSubmit: (values, form, close) => {
      const result = ctx.api.checkInDelegation(delegation.id, values);
      if (!result.ok) return form.setFieldError(result.field || 'note', result.error);
      close();
      toast('Delegation check-in saved', 'good');
    },
  });
}

export function openCompleteDelegationDialog(ctx, { delegation }) {
  formDialog({
    title: `Complete: ${delegation.title}`,
    description: 'Close the loop with the result actually delivered. The completed record remains available to review evidence and history.',
    submitLabel: 'Mark completed',
    fields: [
      { name: 'completedOn', label: 'Completed on', type: 'date', required: true, value: dayKey(ctx.now) },
      { name: 'completionNote', label: 'Outcome delivered and any remaining follow-up', type: 'textarea', rows: 4, required: true, wide: true },
    ],
    onSubmit: (values, form, close) => {
      const result = ctx.api.completeDelegation(delegation.id, values);
      if (!result.ok) return form.setFieldError(result.field || 'completionNote', result.error);
      close();
      toast('Delegation completed', 'good');
    },
  });
}

export function openReturnDelegationDialog(ctx, { delegation }) {
  formDialog({
    title: `Accept work back: ${delegation.title}`,
    description: 'Use this when accountability returns to you rather than pretending the delegation is still active. Record why and the next step.',
    submitLabel: 'Accept back',
    fields: [
      { name: 'returnedOn', label: 'Returned on', type: 'date', required: true, value: dayKey(ctx.now) },
      { name: 'returnReason', label: 'Why is it coming back, and what happens next?', type: 'textarea', rows: 4, required: true, wide: true },
    ],
    onSubmit: (values, form, close) => {
      const result = ctx.api.returnDelegation(delegation.id, values);
      if (!result.ok) return form.setFieldError(result.field || 'returnReason', result.error);
      close();
      toast('Work returned to the leader; history kept', 'good');
    },
  });
}

/* -------------------------------------------------------------- growth */

export function openGrowthPlanDialog(ctx, { personId = null, plan = null } = {}) {
  const active = ctx.state.people.filter((p) => p.status !== 'archived');
  if (!active.length) {
    toast('Add someone to your roster first.', 'bad');
    return;
  }
  const isEdit = Boolean(plan);
  if (isEdit) personId = plan.personId;
  formDialog({
    title: isEdit ? 'Edit development plan' : 'Start a GROW plan',
    description: isEdit
      ? 'Update the coaching record without replacing its identity or commitments. Development actions are managed separately below the plan.'
      : 'Goal → Reality → Options → Will. The last one is the only part that changes anything, so it is required.',
    submitLabel: isEdit ? 'Save changes' : 'Save plan',
    size: 'lg',
    fields: [
      ...(isEdit
        ? [
            { name: 'personId', type: 'hidden', value: plan.personId },
            { type: 'static', label: 'Who', value: ctx.state.people.find((person) => person.id === plan.personId)?.name || 'Person no longer in roster' },
          ]
        : [{ name: 'personId', label: 'Who', type: 'select', value: personId || active[0].id, options: personOptions(active), required: true }]),
      { name: 'competencies', label: 'Focus competencies', type: 'boolean-block', wide: true, value: plan?.competencies || [], options: COMPETENCIES.map((c) => ({ value: c, label: c })) },
      {
        name: 'goal',
        label: 'Goal — what does better look like?',
        type: 'textarea',
        rows: 2,
        required: true,
        wide: true,
        value: plan?.goal || '',
        placeholder: 'In six months, owning cross-team technical direction, not just the hardest code.',
      },
      {
        name: 'reality',
        label: 'Reality — what is actually happening now?',
        type: 'textarea',
        rows: 2,
        wide: true,
        value: plan?.reality || '',
        placeholder: 'Strongest debugger on the team; the gap is written communication and bringing others along.',
      },
      {
        name: 'options',
        label: 'Options — at least two routes',
        type: 'textarea',
        rows: 2,
        wide: true,
        value: (plan?.options || []).map((option) => typeof option === 'string' ? option : option.text).join('\n'),
        placeholder: 'Write a one-page decision memo per design choice; shadow the architecture review for two cycles.',
      },
      ...(isEdit ? [] : [
        {
          name: 'willText',
          label: 'Will — what will they do, by when?',
          required: true,
          wide: true,
          placeholder: 'Publish a decision memo format and use it on the billing migration',
        },
        { name: 'willDue', label: 'Action due', type: 'date', value: addDays(dayKey(ctx.now), 14) },
      ]),
      { name: 'reviewOn', label: 'Review on', type: 'date', value: plan?.reviewOn || addDays(dayKey(ctx.now), 30) },
    ],
    onSubmit: (values, form, close) => {
      const patch = {
        goal: values.goal,
        reality: values.reality,
        options: (values.options || '').split('\n').map((o) => o.trim()).filter(Boolean),
        competencies: values.competencies || [],
        reviewOn: values.reviewOn || null,
      };
      const result = isEdit
        ? ctx.api.updateGrowthPlan(plan.id, patch)
        : ctx.api.saveGrowthPlan({
            personId: values.personId,
            ...patch,
            will: [{ text: values.willText, due: values.willDue }],
          });
      if (!result.ok) {
        form.setFieldError(result.field || 'goal', result.error);
        return;
      }
      close();
      toast(isEdit ? 'Development plan updated' : 'Growth plan saved', 'good');
    },
  });
}

export function openWillActionDialog(ctx, { planId }) {
  formDialog({
    title: 'Add a development action',
    size: 'sm',
    fields: [
      { name: 'text', label: 'Commitment', required: true, placeholder: 'Co-run one architecture review with Priya' },
      { name: 'due', label: 'Due', type: 'date', value: addDays(dayKey(ctx.now), 14) },
    ],
    onSubmit: (values, form, close) => {
      const result = ctx.api.addWillAction(planId, values.text, values.due);
      if (!result.ok) return form.setFieldError('text', result.error);
      close();
      toast('Action added', 'good');
    },
  });
}

/* --------------------------------------------------------------- pulse */

export function openPulseDialog(ctx) {
  const active = ctx.state.people.filter((p) => p.status !== 'archived');
  const fields = [
    { type: 'static', value: h('p', { class: 'muted small' }, 'Rate each statement for the last two weeks. Answers are aggregated and never shown individually below the anonymity floor.') },
    ...PULSE_DIMENSIONS.map((dim) => ({
      name: dim,
      label: PULSE_PROMPTS[dim],
      type: 'scale',
      value: 3,
      wide: true,
      help: PULSE_LABELS[dim],
    })),
    {
      name: 'anonymity',
      label: 'Attribution',
      type: 'select',
      value: 'anonymous',
      options: [
        { value: 'anonymous', label: 'Anonymous (recommended — no name stored)' },
        { value: 'named', label: 'Named (attach this response to a person)' },
      ],
      help: 'Anonymous responses are stored with no personId at all, so they cannot be leaked later.',
    },
    ...(active.length
      ? [{ name: 'personId', label: 'Whose response (only used when named)', type: 'select', value: '', options: [{ value: '', label: '— not attributed —' }, ...personOptions(active)] }]
      : []),
    { name: 'comment', label: 'Anything else (optional)', type: 'textarea', rows: 2, wide: true },
  ];

  formDialog({
    title: 'Record a pulse response',
    description: `Four questions, fifteen seconds. Aggregates need ${ctx.state.settings.pulseMinResponses} responses before they are shown.`,
    submitLabel: 'Save response',
    size: 'md',
    fields,
    onSubmit: (values, form, close) => {
      const result = ctx.api.submitPulse({
        scores: Object.fromEntries(PULSE_DIMENSIONS.map((d) => [d, values[d]])),
        comment: values.comment,
        anonymity: values.anonymity,
        personId: values.personId || null,
      });
      if (!result.ok) {
        toast(result.error, 'bad');
        return;
      }
      close();
      toast('Pulse response saved', 'good');
    },
  });
}

/* ----------------------------------------------------------- decisions */

export function openDecisionDialog(ctx) {
  const active = ctx.state.people.filter((p) => p.status !== 'archived');
  const peopleOptions = active.map((p) => p.name);
  formDialog({
    title: 'Log a decision',
    description: 'The point is not the record — it is knowing who decided and when to look again.',
    submitLabel: 'Save decision',
    size: 'lg',
    fields: [
      { name: 'title', label: 'Decision', required: true, wide: true, placeholder: 'Restructure support into product pods' },
      { name: 'question', label: 'The question in one sentence', type: 'textarea', rows: 2, wide: true, placeholder: 'Should support move from one queue to three product-aligned pods this quarter?' },
      {
        name: 'reversibility',
        label: 'Reversibility',
        type: 'select',
        value: 'reversible',
        options: [
          { value: 'reversible', label: 'Reversible — decide fast' },
          { value: 'irreversible', label: 'Irreversible — slow down and write it up' },
        ],
      },
      { name: 'date', label: 'Date', type: 'date', value: dayKey(ctx.now) },
      { name: 'driver', label: 'Driver (DACI)', placeholder: peopleOptions[0] || 'Who makes this happen?' },
      { name: 'approver', label: 'Approver (DACI)', placeholder: 'Exactly one person says yes or no' },
      { name: 'contributors', label: 'Contributors', placeholder: 'Consulted before the call' },
      { name: 'informed', label: 'Informed', placeholder: 'Told afterwards — not consulted' },
      { name: 'optionA', label: 'Option A', wide: true },
      { name: 'optionB', label: 'Option B', wide: true },
      { name: 'rationale', label: 'Rationale (if already decided)', type: 'textarea', rows: 2, wide: true },
      { name: 'reviewOn', label: 'Review on', type: 'date', value: addDays(dayKey(ctx.now), ctx.state.settings.decisionReviewDays), help: 'When to look at this again. A decision with no review is never learned from.' },
    ],
    onSubmit: (values, form, close) => {
      const options = [values.optionA, values.optionB]
        .map((label) => (label || '').trim())
        .filter(Boolean)
        .map((label) => ({ label }));
      const result = ctx.api.addDecision({
        title: values.title,
        question: values.question,
        reversibility: values.reversibility,
        date: values.date,
        driver: values.driver,
        approver: values.approver,
        contributors: values.contributors,
        informed: values.informed,
        options,
        rationale: values.rationale,
        reviewOn: values.reviewOn || null,
      });
      if (!result.ok) {
        form.setFieldError(result.field || 'title', result.error);
        return;
      }
      close();
      toast('Decision logged', 'good');
    },
  });
}

export function openDecideDialog(ctx, { decision }) {
  formDialog({
    title: `Decide: ${decision.title}`,
    description: 'Record what was chosen and why. The rationale is the part you will want in six months.',
    submitLabel: 'Record decision',
    fields: [
      { name: 'chosen', label: 'What was decided', required: true, wide: true, value: decision.options?.[0]?.label || '' },
      { name: 'rationale', label: 'Why', type: 'textarea', rows: 3, wide: true, help: 'At least a couple of sentences. Future-you will not remember the trade-off.' },
    ],
    onSubmit: (values, form, close) => {
      const result = ctx.api.decideDecision(decision.id, { chosen: values.chosen, rationale: values.rationale });
      if (!result.ok) return form.setFieldError(result.field || 'chosen', result.error);
      close();
      toast('Decision recorded', 'good');
    },
  });
}

export function openReviewDialog(ctx, { decision }) {
  formDialog({
    title: `Review: ${decision.title}`,
    description: 'Was it the right call with the information available at the time? Judge the decision, not just the outcome.',
    submitLabel: 'Save review',
    fields: [
      {
        name: 'outcome',
        label: 'Outcome',
        type: 'select',
        value: 'good',
        options: [
          { value: 'good', label: 'Good — I would decide the same again' },
          { value: 'mixed', label: 'Mixed — right call, poor execution' },
          { value: 'bad', label: 'Bad — I would decide differently' },
        ],
      },
      { name: 'outcomeNotes', label: 'What happened?', type: 'textarea', rows: 3, wide: true },
    ],
    onSubmit: (values, form, close) => {
      const result = ctx.api.reviewDecision(decision.id, { outcome: values.outcome, outcomeNotes: values.outcomeNotes });
      if (!result.ok) return form.setFieldError('outcome', result.error);
      close();
      toast('Review saved', 'good');
    },
  });
}

/* --------------------------------------------------------- recognition */

export function openRecognitionDialog(ctx, { personId = null } = {}) {
  const active = ctx.state.people.filter((p) => p.status !== 'archived');
  if (!active.length) {
    toast('Add someone to your roster first.', 'bad');
    return;
  }
  formDialog({
    title: 'Recognise someone',
    description: 'Specific and timely beats grand and annual. Name the act, not the trait.',
    submitLabel: 'Record recognition',
    fields: [
      { name: 'personId', label: 'Who', type: 'select', value: personId || active[0].id, options: personOptions(active), required: true },
      { name: 'what', label: 'What they did', type: 'textarea', rows: 3, required: true, wide: true, placeholder: 'Owned the billing outage call end to end and published the postmortem within 24 hours.' },
      { name: 'values', label: 'Values shown', placeholder: 'Ownership, Candor (comma separated)' },
      {
        name: 'visibility',
        label: 'Visibility',
        type: 'select',
        value: 'public',
        options: [
          { value: 'public', label: 'Public — say it in front of the team' },
          { value: 'private', label: 'Private — one to one' },
        ],
      },
      { name: 'date', label: 'Date', type: 'date', value: dayKey(ctx.now) },
    ],
    onSubmit: (values, form, close) => {
      const result = ctx.api.addRecognition({
        personId: values.personId,
        what: values.what,
        values: (values.values || '').split(',').map((v) => v.trim()).filter(Boolean),
        visibility: values.visibility,
        date: values.date,
      });
      if (!result.ok) return form.setFieldError(result.field || 'what', result.error);
      close();
      toast('Recognition recorded', 'good');
    },
  });
}

/* ----------------------------------------------------------- readiness */

export function openReadinessDialog(ctx, { personId = null, seat = '' } = {}) {
  const active = ctx.state.people.filter((p) => p.status !== 'archived');
  if (!active.length) {
    toast('Add someone to your roster first.', 'bad');
    return;
  }
  formDialog({
    title: 'Set a readiness rating',
    description: 'The rating is stored, but the app also shows the evidence behind it. A "ready now" claim without evidence is flagged, not displayed as fact.',
    submitLabel: 'Save rating',
    fields: [
      { name: 'personId', label: 'Who', type: 'select', value: personId || active[0].id, options: personOptions(active), required: true },
      { name: 'seat', label: 'Seat', required: true, value: seat, placeholder: 'Principal engineer' },
      { name: 'rating', label: 'Readiness', type: 'select', value: 'ready-later', options: READINESS.map((r) => ({ value: r, label: READINESS_LABELS[r] })) },
    ],
    onSubmit: (values, form, close) => {
      const result = ctx.api.setReadiness(values);
      if (!result.ok) return form.setFieldError(result.field || 'seat', result.error);
      close();
      toast('Readiness saved', 'good');
    },
  });
}

/* ---------------------------------------------------- performance reviews */

export function openPerformanceReviewDialog(ctx, { personId = null } = {}) {
  const active = ctx.state.people.filter((p) => p.status !== 'archived');
  if (!active.length) {
    toast('Add someone to your roster first.', 'bad');
    return;
  }
  formDialog({
    title: 'Prepare a performance review',
    description: 'Choose the whole period you want to assess. LeadOS will gather dated 1:1s, feedback, goals, development and recognition — never anonymous pulse answers.',
    submitLabel: 'Create review packet',
    fields: [
      { name: 'personId', label: 'Who', type: 'select', value: personId || active[0].id, options: personOptions(active), required: true },
      { name: 'periodStart', label: 'Period starts', type: 'date', value: addDays(dayKey(ctx.now), -89), required: true },
      { name: 'periodEnd', label: 'Period ends', type: 'date', value: dayKey(ctx.now), required: true, help: 'Both dates are included. You can refresh the evidence while the review is a draft.' },
    ],
    onSubmit: (values, form, close) => {
      const result = ctx.api.createReview(values);
      if (!result.ok) {
        form.setFieldError(result.field || 'periodStart', result.error);
        return;
      }
      close();
      toast(`Review packet created with ${result.evidenceCount} source record${result.evidenceCount === 1 ? '' : 's'}`, 'good');
      ctx.navigate(`#/reviews/${encodeURIComponent(result.id)}`);
    },
  });
}

export function openReflectionDialog(ctx, { review }) {
  formDialog({
    title: 'Record the person’s self-reflection',
    description: 'These are the person’s own words, pasted or recorded with them. LeadOS does not send a form or claim they submitted one. There is deliberately no self-rating.',
    submitLabel: 'Save self-reflection',
    size: 'lg',
    fields: SELF_REFLECTION_PROMPTS.map((prompt) => ({
      name: prompt.key,
      label: prompt.label,
      type: 'textarea',
      rows: 3,
      wide: true,
      value: review.selfReflection?.[prompt.key] || '',
    })),
    onSubmit: (values, form, close) => {
      const result = ctx.api.updateReflection(review.id, values);
      if (!result.ok) {
        toast(result.error, 'bad');
        return;
      }
      close();
      toast('Self-reflection saved', 'good');
    },
  });
}

export function openAssessmentDialog(ctx, { review }) {
  formDialog({
    title: 'Write the manager assessment',
    description: 'Use the linked records, not a general impression. A rating is optional; the narrative and next commitments are what make the review useful.',
    submitLabel: 'Save assessment',
    size: 'lg',
    fields: [
      ...MANAGER_PROMPTS.map((prompt) => ({
        name: prompt.key,
        label: prompt.label,
        type: 'textarea',
        rows: 3,
        wide: true,
        value: review.manager?.[prompt.key] || '',
        required: true,
      })),
      {
        name: 'rating',
        label: 'Optional overall rating',
        type: 'select',
        value: review.manager?.rating || '',
        options: [
          { value: '', label: 'No overall rating' },
          ...REVIEW_RATINGS.map((rating) => ({ value: rating, label: REVIEW_RATING_LABELS[rating] })),
        ],
        help: 'Calibration warnings appear when the selected rating and the dated evidence do not line up. No score is calculated for you.',
      },
    ],
    onSubmit: (values, form, close) => {
      const result = ctx.api.updateAssessment(review.id, values);
      if (!result.ok) {
        if (result.field) form.setFieldError(result.field, result.error);
        toast(result.error, 'bad');
        return;
      }
      close();
      toast('Manager assessment saved', 'good');
    },
  });
}

/* ------------------------------------------------------------- settings */

export function openSettingsDialog(ctx) {
  const s = ctx.state.settings;
  formDialog({
    title: 'Cadences and thresholds',
    description: 'These drive every "due" and "overdue" judgement in the app. Set them to what your team can actually sustain, not to an aspiration.',
    submitLabel: 'Save settings',
    size: 'lg',
    fields: [
      { name: 'leaderName', label: 'Your name', value: s.leaderName },
      { name: 'teamName', label: 'Team name', value: s.teamName },
      { name: 'orgName', label: 'Organisation', value: s.orgName },
      { name: 'oneOnOneCadenceDays', label: '1:1 cadence (days)', type: 'number', value: s.oneOnOneCadenceDays, min: 1, max: 90 },
      { name: 'feedbackTargetDays', label: 'Feedback target (days)', type: 'number', value: s.feedbackTargetDays, min: 1, max: 365 },
      { name: 'feedbackLatencyTargetDays', label: 'Observation → feedback conversation convention (days)', type: 'number', value: s.feedbackLatencyTargetDays, min: 1, max: 90, help: 'A team convention for timely discussion, not a validated universal score. Missing observation dates stay unmeasured.' },
      { name: 'goalCheckinDays', label: 'Goal check-in (days)', type: 'number', value: s.goalCheckinDays, min: 1, max: 180 },
      { name: 'delegationCheckinDays', label: 'Delegation check-in convention (days)', type: 'number', value: s.delegationCheckinDays, min: 1, max: 90, help: 'How often an active delegated outcome should have a real checkpoint. Due dates and blocked states are tracked separately.' },
      { name: 'recognitionTargetDays', label: 'Recognition target (days)', type: 'number', value: s.recognitionTargetDays, min: 1, max: 365 },
      { name: 'decisionReviewDays', label: 'Decision review default (days)', type: 'number', value: s.decisionReviewDays, min: 1, max: 365 },
      { name: 'growthReviewDays', label: 'Growth plan review (days)', type: 'number', value: s.growthReviewDays, min: 1, max: 365 },
      { name: 'onboardingDays', label: 'Onboarding window (days)', type: 'number', value: s.onboardingDays, min: 7, max: 365 },
      { name: 'maxReportsPerManager', label: 'Max direct reports before a warning', type: 'number', value: s.maxReportsPerManager, min: 1, max: 30 },
      {
        name: 'pulseMinResponses',
        label: 'Pulse anonymity floor',
        type: 'number',
        value: s.pulseMinResponses,
        min: 3,
        max: 25,
        help: 'Complete responses required before reporting (3–25; default 5). Lower floors increase identification risk; none guarantees anonymity.',
      },
      {
        name: 'idleLockMinutes',
        label: 'Lock after inactivity (minutes)',
        type: 'number',
        value: s.idleLockMinutes,
        min: 0,
        max: 480,
        help: 'An unlocked tab holding encrypted notes is readable by anyone who uses the browser. Lock after this many minutes of inactivity; the app warns first and locks automatically after one minute. 0 disables it. Only applies when the workspace is encrypted.',
      },
    ],
    onSubmit: (values, form, close) => {
      const numeric = [
        'oneOnOneCadenceDays', 'feedbackTargetDays', 'feedbackLatencyTargetDays', 'goalCheckinDays', 'delegationCheckinDays', 'recognitionTargetDays',
        'decisionReviewDays', 'growthReviewDays', 'onboardingDays', 'maxReportsPerManager', 'pulseMinResponses', 'idleLockMinutes',
      ];
      const patch = { leaderName: values.leaderName, teamName: values.teamName, orgName: values.orgName };
      for (const key of numeric) {
        const n = Number(values[key]);
        if (!Number.isFinite(n) || n < 1) {
          form.setFieldError(key, 'Enter a number of at least 1.');
          return;
        }
        patch[key] = Math.round(n);
      }
      const result = ctx.api.updateSettings(patch);
      if (!result.ok) {
        if (result.field) form.setFieldError(result.field, result.error);
        else toast(result.error, 'bad');
        return;
      }
      close();
      toast(result.warning ? 'Settings are in memory only. Export before reloading.' : 'Settings saved', result.warning ? 'bad' : 'good');
    },
  });
}

export function confirmArchive(ctx, person) {
  confirmDialog({
    title: `Archive ${person.name}?`,
    message: 'They leave the active roster and all scores. Their 1:1 history, feedback and goals are kept, and you can restore them later.',
    confirmLabel: 'Archive',
    danger: true,
    onConfirm: () => {
      const result = ctx.api.archivePerson(person.id);
      if (result.ok) {
        toast(`${person.name} archived`, 'good');
        ctx.navigate('#/people');
      } else {
        toast(result.error, 'bad');
      }
    },
  });
}

export { formatDate, uid };
