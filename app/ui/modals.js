/**
 * app/ui/modals.js — the capture dialogs.
 *
 * Each function opens one dialog, validates on submit, and reports the result
 * through a toast. Titles say what actually happens ("Log a 1:1", not "New
 * record"), and destructive or irreversible actions confirm first.
 */

import { h, openModal, buildForm, toast, confirmDialog, uid } from './dom.js';
import { validateSBI, QUALITY_LABELS } from '../core/domain/feedback.js';
import { buildMeetingAgendaCandidates, reconciliationCandidates } from '../core/domain/oneonone.js';
import {
  COMPETENCIES,
  openWillActions,
  linkedDelegationForWill,
  unlinkedDelegationsForPerson,
} from '../core/domain/growth.js';
import { PULSE_DIMENSIONS, PULSE_LABELS, PULSE_PROMPTS, LEVEL_LABELS, LEVELS, READINESS_LABELS, READINESS, normalizeTalkingPoints } from '../core/schema.js';
import { addDays, dayKey, formatDate } from '../core/time.js';
import { personOptions } from './options.js';
import { SELF_REFLECTION_PROMPTS, MANAGER_PROMPTS, REVIEW_RATINGS, REVIEW_RATING_LABELS } from '../core/domain/reviews.js';
import { DELEGATION_AUTHORITY, authorityFor } from '../core/domain/delegations.js';
import {
  ONBOARDING_HORIZONS,
  ONBOARDING_CATEGORIES,
  ONBOARDING_KINDS,
  KIND_LABELS,
  HORIZON_LABELS,
  CATEGORY_LABELS,
} from '../core/domain/onboarding.js';
import { tenureDays } from '../core/domain/people.js';

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
      {
        name: 'talkingPoints',
        label: 'Topics they want to raise',
        type: 'textarea',
        rows: 3,
        value: (person?.talkingPoints || []).join('\n'),
        placeholder: 'One per line — what they have asked to discuss.',
        help: 'You are the scribe: this app has no employee login, so record what they raised. Listed first on the printable prep sheet.',
      },
    ],
    onSubmit: submitter(
      (payload) => (isEdit ? ctx.api.updatePerson(person.id, payload) : ctx.api.addPerson(payload)),
      (v) => ({
        ...v,
        talkingPoints: normalizeTalkingPoints(String(v.talkingPoints || '').split('\n')),
      }),
    ),
  });
}

/* ---------------------------------------------------------------- 1:1s */

export function openOneOnOneDialog(
  ctx,
  { personId = null, preparedTopics = null, preparedAgenda = null, useFullAgenda = false } = {},
) {
  const active = ctx.state.people.filter((p) => p.status !== 'archived');
  if (!active.length) {
    toast('Add someone to your roster first.', 'bad');
    return;
  }
  const selected = personId && active.some((p) => p.id === personId) ? personId : active[0].id;
  const state = ctx.state;
  const settings = state.settings;

  let currentCandidates = buildMeetingAgendaCandidates(state, selected, ctx.now, settings);
  const agendaBox = h('div', { class: 'agenda-picks' });
  const selectedAgenda = new Set();
  let clearCoveredTopics = true;
  let form = null;

  function seedAgendaSelection(forPersonId, isInitial = false) {
    currentCandidates = buildMeetingAgendaCandidates(state, forPersonId, ctx.now, settings);
    selectedAgenda.clear();
    if (isInitial && Array.isArray(preparedTopics)) {
      for (const t of preparedTopics) selectedAgenda.add(t);
    } else {
      for (const t of currentCandidates.theirTopics) selectedAgenda.add(t.text);
    }
    if (isInitial && Array.isArray(preparedAgenda)) {
      for (const a of preparedAgenda) selectedAgenda.add(a);
    } else if (isInitial && useFullAgenda) {
      for (const s of currentCandidates.suggestions) selectedAgenda.add(s.text);
    } else {
      for (const s of currentCandidates.suggestions.slice(0, 3)) selectedAgenda.add(s.text);
    }
  }
  seedAgendaSelection(selected, true);

  function currentStatus() {
    return form ? form.getValues().status : 'held';
  }

  function renderAgenda() {
    const held = currentStatus() === 'held';
    const rows = currentCandidates.all.map((s) =>
      h(
        'label',
        { class: `agenda-pick ${selectedAgenda.has(s.text) ? 'is-picked' : ''} ${s.isTheirTopic ? 'is-their-topic' : ''}` },
        h('input', {
          type: 'checkbox',
          checked: selectedAgenda.has(s.text),
          onChange: (e) => {
            if (e.target.checked) selectedAgenda.add(s.text);
            else selectedAgenda.delete(s.text);
            e.target.closest('.agenda-pick').classList.toggle('is-picked', e.target.checked);
          },
        }),
        h(
          'span',
          null,
          h('span', { class: 'agenda-text' }, s.text),
          h('span', { class: 'agenda-reason' }, `${s.isTheirTopic ? 'their topic · ' : ''}${s.reason}`),
        ),
      ),
    );
    if (currentCandidates.theirTopics.length > 0) {
      rows.push(
        h(
          'label',
          { class: `agenda-pick agenda-clear-topics ${clearCoveredTopics && held ? 'is-picked' : ''}` },
          h('input', {
            type: 'checkbox',
            name: 'clearCoveredTopics',
            checked: clearCoveredTopics && held,
            disabled: !held,
            onChange: (e) => {
              clearCoveredTopics = Boolean(e.target.checked);
              e.target.closest('.agenda-pick').classList.toggle('is-picked', clearCoveredTopics && held);
            },
          }),
          h(
            'span',
            null,
            h('span', { class: 'agenda-text' }, 'Clear covered employee topics from their waiting list'),
            h(
              'span',
              { class: 'agenda-reason' },
              held
                ? 'Checked topics they raised are removed once covered; anything unchecked stays for next time.'
                : 'Skipped or moved meetings never clear employee topics.',
            ),
          ),
        ),
      );
    }
    agendaBox.replaceChildren(...rows);
  }
  renderAgenda();

  /* -------------------------------------------------- follow-through panel */
  /**
   * Every promise from an earlier 1:1 gets an explicit outcome here: done,
   * still open, carried into a later meeting, or dropped with a reason.
   * Nothing is carried automatically — a commitment that silently reappears
   * every week hides the blocker that is actually stopping it.
   */
  const settled = new Map();
  const reconBox = h('div', { class: 'recon-panel' });

  const candidateKey = (c) => c.sourceType === 'managerSupport'
    ? `managerSupport|${c.managerSupportId}`
    : `oneOnOne|${c.meetingId}|${c.actionId}`;

  function readSelection() {
    if (form) return form.getValues();
    return { personId: selected, date: dayKey(ctx.now), status: 'held' };
  }

  function candidatesFor(personIdValue, dateValue) {
    if (!personIdValue) return [];
    return reconciliationCandidates(state, personIdValue, dateValue || dayKey(ctx.now), ctx.now);
  }

  function renderReconciliation() {
    const values = readSelection();
    const person = active.find((p) => p.id === values.personId) || active[0];
    const candidates = candidatesFor(person.id, values.date);
    const held = values.status === 'held';
    // A decision about a commitment that is no longer in scope (the date moved
    // before it was agreed) must not survive invisibly.
    const liveKeys = new Set(candidates.map(candidateKey));
    for (const key of [...settled.keys()]) if (!liveKeys.has(key)) settled.delete(key);

    if (!candidates.length) {
      reconBox.replaceChildren(
        h('p', { class: 'recon-empty muted small' }, `No open commitments from earlier 1:1s with ${person.name}. New actions from this meeting are tracked from here on.`),
      );
      return;
    }

    const overdue = candidates.filter((c) => c.overdue).length;
    const carried = candidates.filter((c) => c.carryCount > 0).length;
    const summary = [
      `${candidates.length} open commitment${candidates.length === 1 ? '' : 's'}`,
      overdue ? `${overdue} overdue` : null,
      carried ? `${carried} carried forward before` : null,
    ].filter(Boolean).join(' · ');

    const children = [
      h('p', { class: 'recon-summary' }, summary),
      h('p', { class: 'recon-hint muted small' }, held
        ? 'Decide what happened to each one. Anything left as “still open” stays on the board.'
        : `${values.status === 'moved' ? 'Moved' : 'Skipped'}: a meeting that did not happen cannot settle these. Log them when you actually meet.`),
    ];

    const visible = candidates.slice(0, 8);
    for (const candidate of visible) children.push(renderReconRow(candidate, held));
    if (candidates.length > visible.length) {
      children.push(h('p', { class: 'muted small' }, `+${candidates.length - visible.length} more open commitments — see the prep sheet for the full list.`));
    }
    reconBox.replaceChildren(...children);
  }

  function renderReconRow(candidate, enabled) {
    const key = candidateKey(candidate);
    const entry = settled.get(key) || { outcome: 'still-open', due: '', reason: '' };
    const radioName = `recon-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
    const meta = [`agreed ${formatDate(candidate.firstAgreedOn, { withYear: false })}`];
    if (candidate.owner) meta.push(candidate.owner === 'leader' ? 'you owe it' : candidate.owner === 'shared' ? 'shared' : 'they owe it');
    else meta.push('owner not recorded');
    if (candidate.sourceType === 'managerSupport') meta.push(`manager follow-up from Day ${candidate.sourceHorizon} check-in`);
    if (candidate.carryCount) meta.push(`carried forward ${candidate.carryCount}×`);
    if (candidate.due) {
      meta.push(candidate.overdue
        ? `was due ${formatDate(candidate.due, { withYear: false })} · ${Math.abs(candidate.daysUntilDue)}d late`
        : `due ${formatDate(candidate.due, { withYear: false })}`);
    } else {
      meta.push('no due date');
    }

    const extra = h('div', { class: 'recon-extra' });
    function syncExtra() {
      extra.replaceChildren();
      if (entry.outcome === 'carried') {
        extra.appendChild(
          h(
            'label',
            { class: 'recon-field' },
            h('span', { class: 'muted tiny' }, 'New due date (optional)'),
            h('input', {
              type: 'date',
              value: entry.due || '',
              disabled: !enabled,
              'aria-label': `New due date for “${candidate.text}”`,
              onChange: (event) => { entry.due = event.target.value; },
            }),
            h('span', { class: 'muted tiny' }, candidate.owner === 'leader'
              ? 'The new copy stays with you.'
              : candidate.owner === 'them'
                ? 'The new copy stays with them.'
                : candidate.owner === 'shared'
                  ? 'The new copy stays shared between you.'
                  : 'Owner not recorded — set it on the board after this meeting.'),
          ),
        );
      } else if (entry.outcome === 'dropped') {
        extra.appendChild(
          h(
            'label',
            { class: 'recon-field' },
            h('span', { class: 'muted tiny' }, 'Why is it no longer needed? (kept in the record)'),
            h('input', {
              type: 'text',
              value: entry.reason || '',
              maxlength: 300,
              disabled: !enabled,
              placeholder: 'The exec review cut this priority',
              'aria-label': `Reason for dropping “${candidate.text}”`,
              onChange: (event) => { entry.reason = event.target.value; },
            }),
          ),
        );
      }
    }

    const optionLabels = [];
    for (const [value, label] of [['done', 'Done'], ['still-open', 'Still open'], ['carried', 'Carry forward'], ['dropped', 'Drop']]) {
      const input = h('input', {
        type: 'radio',
        name: radioName,
        value,
        checked: entry.outcome === value,
        disabled: !enabled,
        onChange: () => {
          entry.outcome = value;
          settled.set(key, entry);
          for (const node of optionLabels) node.classList.toggle('is-picked', node.querySelector('input').value === value);
          syncExtra();
        },
      });
      const wrapper = h('label', { class: `recon-opt ${entry.outcome === value ? 'is-picked' : ''}` }, input, h('span', null, label));
      optionLabels.push(wrapper);
    }
    syncExtra();

    return h(
      'div',
      { class: 'recon-row', dataset: { actionKey: key } },
      h(
        'div',
        { class: 'recon-main' },
        h('span', { class: 'recon-text' }, candidate.text),
        h('span', { class: `recon-meta ${candidate.overdue ? 'text-bad' : ''}` }, meta.join(' · ')),
        candidate.sourceType === 'managerSupport'
          ? candidate.sourceLinkValid
            ? h('a', { class: 'link tiny', href: `#/onboarding?plan=${encodeURIComponent(candidate.sourcePlanId || '')}` }, `Source: Day ${candidate.sourceHorizon} check-in · ${formatDate(candidate.sourceHeldOn, { withYear: false })}`)
            : h('span', { class: 'muted tiny' }, 'Source check-in link unavailable')
          : null,
      ),
      h('div', { class: 'recon-opts', role: 'radiogroup', 'aria-label': `Outcome for “${candidate.text}”` }, ...optionLabels),
      extra,
    );
  }

  const personField = {
    name: 'personId',
    label: 'Who with',
    type: 'select',
    value: selected,
    options: personOptions(active),
    required: true,
  };

  form = buildForm([
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
    { type: 'divider', label: 'Last time’s promises' },
    {
      type: 'static',
      label: 'Follow-through',
      value: reconBox,
    },
    { type: 'divider', label: 'This conversation' },
    {
      type: 'static',
      label: 'Suggested agenda',
      value: agendaBox,
      wide: true,
      help: 'Built from open items and topics. Uncheck anything you did not cover.',
    },
    { name: 'notes', label: 'Notes', type: 'textarea', rows: 3, placeholder: 'What was said that matters?', help: 'A meeting with no notes cannot be followed up on.' },
    {
      name: 'action',
      label: 'One next action (optional)',
      placeholder: 'What will one of you do before the next meeting?',
      help: 'Actions appear on the 1:1 board and are tracked to completion.',
    },
    {
      name: 'actionOwner',
      label: 'Who owes it?',
      type: 'select',
      value: '',
      options: [
        { value: '', label: 'Not decided yet' },
        { value: 'them', label: 'They do it' },
        { value: 'leader', label: 'I do it' },
        { value: 'shared', label: 'Both of us' },
      ],
      help: 'A promise with no owner is the one that quietly disappears. Naming yourself matters most: teams copy what you do with your own commitments.',
    },
    { name: 'actionDue', label: 'Action due', type: 'date', value: addDays(dayKey(ctx.now), 7) },
  ]);
  renderReconciliation();

  const selectedPerson = () => active.find((p) => p.id === form.getValues().personId) || active[0];
  form.field('personId').addEventListener('change', (event) => {
    const next = event.target.value;
    seedAgendaSelection(next, false);
    renderAgenda();
    // A decision about one person's promise must never travel to another.
    settled.clear();
    renderReconciliation();
  });
  form.field('date').addEventListener('change', renderReconciliation);
  form.field('status').addEventListener('change', () => {
    renderAgenda();
    renderReconciliation();
  });

  form.__close = () => dialog.close();
  form.__onSubmit = () => {
    const values = form.getValues();
    const person = selectedPerson();
    const actions = values.action
      ? [{ text: values.action, due: values.actionDue || null, owner: values.actionOwner || null }]
      : [];
    const date = values.date || dayKey(ctx.now);
    const reconciliations = (values.status === 'held' ? candidatesFor(person.id, date) : [])
      .map((candidate) => {
        const entry = settled.get(candidateKey(candidate));
        if (!entry || entry.outcome === 'still-open') return null;
        return {
          sourceType: candidate.sourceType || 'oneOnOne',
          ...(candidate.sourceType === 'managerSupport'
            ? { managerSupportId: candidate.managerSupportId }
            : { meetingId: candidate.meetingId, actionId: candidate.actionId }),
          outcome: entry.outcome,
          due: entry.outcome === 'carried' ? entry.due || null : null,
          reason: entry.outcome === 'dropped' ? entry.reason || '' : '',
        };
      })
      .filter(Boolean);
    const sourceByText = new Map(currentCandidates.all.map((item) => [item.text, item.source]));
    const resolvedTalkingPoints = values.status === 'held' && clearCoveredTopics
      ? currentCandidates.theirTopics
          .filter((item) => selectedAgenda.has(item.text))
          .map((item) => item.text)
      : [];
    const result = ctx.api.logOneOnOne({
      personId: person.id,
      date,
      status: values.status,
      mood: values.mood,
      notes: values.notes,
      agenda: currentCandidates.all
        .filter((item) => selectedAgenda.has(item.text))
        .map((item) => ({
          text: item.text,
          done: values.status === 'held',
          source: sourceByText.get(item.text) || 'suggestion',
        })),
      actions,
      reconciliations,
      resolvedTalkingPoints,
    });
    if (!result.ok) {
      toast(result.error, 'bad');
      if (result.field && form.field(result.field)) form.setFieldError(result.field, result.error);
      else reconBox.prepend(h('p', { class: 'note note-bad', role: 'alert' }, result.error));
      return;
    }
    dialog.close();
    const parts = [];
    if (result.closed) parts.push(`${result.closed} closed`);
    if (result.carried) parts.push(`${result.carried} carried forward`);
    if (result.dropped) parts.push(`${result.dropped} dropped`);
    if (result.topicsCleared) parts.push(`${result.topicsCleared} employee topic${result.topicsCleared === 1 ? '' : 's'} covered`);
    const ownPromise = actions.some((a) => a.owner === 'leader');
    toast(
      values.status === 'held'
        ? `1:1 with ${person.name} logged${parts.length ? ` — ${parts.join(', ')}` : ''}${ownPromise ? ' · added to what you owe' : ''}`
        : `Marked as ${values.status}`,
      'good',
    );
  };
  form.node.addEventListener('submit', (event) => {
    event.preventDefault();
    form.__onSubmit();
  });

  const dialog = openModal({
    title: 'Log a 1:1',
    description: 'Open with what you promised last time. The agenda is built from that person’s records — keep it to a few minutes; the point is that it happens.',
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
      {
        name: 'owner',
        label: 'Who owes it?',
        type: 'select',
        value: '',
        options: [
          { value: '', label: 'Not decided yet' },
          { value: 'them', label: 'They do it' },
          { value: 'leader', label: 'I do it' },
          { value: 'shared', label: 'Both of us' },
        ],
      },
      { name: 'due', label: 'Due', type: 'date', value: addDays(dayKey(ctx.now), 7) },
    ],
    submitLabel: 'Add action',
    size: 'sm',
    onSubmit: (values, form, close) => {
      const result = ctx.api.addMeetingAction(meetingId, values.text, values.due, values.owner || null);
      if (!result.ok) return form.setFieldError(result.field || 'text', result.error);
      close();
      toast(values.owner === 'leader' ? 'Action added to what you owe' : 'Action added', 'good');
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

export function openGoalDialog(ctx, { personId = null, goal = null, sourceReview = null } = {}) {
  const active = ctx.state.people.filter((p) => p.status !== 'archived');
  const isEdit = Boolean(goal);
  const reviewHandoff = !isEdit && sourceReview?.status === 'complete' && sourceReview.personId === personId;
  const handoffPerson = reviewHandoff ? ctx.state.people.find((person) => person.id === personId) : null;
  formDialog({
    title: isEdit ? 'Edit goal' : 'Set a goal',
    description: isEdit
      ? 'Correct the objective or authorship without replacing its identity, owner, key results or check-in history.'
      : reviewHandoff
        ? 'Refine the review focus into a measurable goal. The owner stays linked to the source review; authorship remains unknown until you record it.'
        : 'An objective with at least one number attached. Record whether the owner helped shape it; if you do not know, leave authorship unknown.',
    submitLabel: isEdit ? 'Save changes' : 'Create goal',
    size: 'lg',
    fields: [
      ...(reviewHandoff ? [
        { name: 'sourceReviewId', type: 'hidden', value: sourceReview.id },
        { type: 'static', label: 'Source review', value: h('a', { href: `#/reviews/${encodeURIComponent(sourceReview.id)}` }, `Completed review · ${formatDate(sourceReview.periodStart)} → ${formatDate(sourceReview.periodEnd)}`) },
        ...(sourceReview.manager?.nextSteps?.trim() ? [{ type: 'static', label: 'Review next steps (discussion prompt, not an agreement)', wide: true, value: sourceReview.manager.nextSteps }] : []),
      ] : []),
      { name: 'title', label: 'Objective', required: true, wide: true, value: goal?.title || (reviewHandoff ? sourceReview.manager?.development?.trim().slice(0, 200) || '' : ''), placeholder: 'Cut activation time to first value below 10 minutes' },
      ...(isEdit
        ? [

            { name: 'ownerId', type: 'hidden', value: goal.ownerId || '' },
            { type: 'static', label: 'Owner', value: goal.ownerId ? active.find((person) => person.id === goal.ownerId)?.name || 'Person no longer in active roster' : 'Team goal (no single owner)' },
          ]
        : reviewHandoff
          ? [
              { name: 'ownerId', type: 'hidden', value: personId },
              { type: 'static', label: 'Owner', value: handoffPerson?.name || 'Person no longer in active roster' },
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
        ...(reviewHandoff ? { sourceReviewId: values.sourceReviewId } : {}),
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

export function openGrowthPlanDialog(ctx, { personId = null, plan = null, delegation = null, sourceReview = null } = {}) {
  const active = ctx.state.people.filter((p) => p.status !== 'archived');
  if (!active.length) {
    toast('Add someone to your roster first.', 'bad');
    return;
  }
  const isEdit = Boolean(plan);
  if (isEdit) personId = plan.personId;
  else if (delegation?.personId) personId = delegation.personId;
  const reviewHandoff = !isEdit && !delegation && sourceReview?.status === 'complete' && sourceReview.personId === personId;
  const handoffPerson = reviewHandoff ? ctx.state.people.find((person) => person.id === personId) : null;
  const existingActivePlan = reviewHandoff
    ? (ctx.state.growthPlans || []).find((existing) => existing.personId === personId && existing.status === 'active') || null
    : null;

  const today = dayKey(ctx.now);
  const seededWillText = !isEdit && delegation
    ? `Deliver delegated outcome: ${delegation.title}`.slice(0, 240)
    : '';
  const seededWillDue = !isEdit && delegation && delegation.dueOn && delegation.dueOn >= today
    ? delegation.dueOn
    : addDays(today, 14);
  const seededCompetencies = plan?.competencies
    || (!isEdit && delegation
      ? (['own', 'act-inform'].includes(delegation.authority) ? ['Decision-making', 'Delegation'] : ['Prioritisation'])
      : []);

  formDialog({
    title: isEdit ? 'Edit development plan' : 'Start a GROW plan',
    description: isEdit
      ? 'Update the coaching record without replacing its identity or commitments. Development actions are managed separately below the plan.'
      : reviewHandoff
        ? 'Use the review focus as a starting point, then write Reality, Options and a new Will commitment together. Nothing is agreed or created until you complete this form.'
        : delegation
          ? 'Turn this delegated outcome into a coached GROW plan. Goal, Reality and Options stay yours to write honestly; the Will action links directly to the delegation.'
          : 'Goal → Reality → Options → Will. The last one is the only part that changes anything, so it is required.',
    submitLabel: isEdit ? 'Save changes' : 'Save plan',
    size: 'lg',
    fields: [
      ...(reviewHandoff ? [
        { name: 'sourceReviewId', type: 'hidden', value: sourceReview.id },
        { type: 'static', label: 'Source review', value: h('a', { href: `#/reviews/${encodeURIComponent(sourceReview.id)}` }, `Completed review · ${formatDate(sourceReview.periodStart)} → ${formatDate(sourceReview.periodEnd)}`) },
        ...(sourceReview.manager?.nextSteps?.trim() ? [{ type: 'static', label: 'Review next steps (discussion prompt, not an agreement)', wide: true, value: sourceReview.manager.nextSteps }] : []),
        ...(existingActivePlan ? [{
          type: 'static',
          label: 'Existing active plan',
          wide: true,
          value: `Saving this new plan will close the current active GROW plan (“${existingActivePlan.goal}”). Review it before continuing if you do not intend to replace it.`,
        }] : []),
      ] : []),
      ...(isEdit
        ? [
            { name: 'personId', type: 'hidden', value: plan.personId },
            { type: 'static', label: 'Who', value: ctx.state.people.find((person) => person.id === plan.personId)?.name || 'Person no longer in roster' },
          ]
        : reviewHandoff
          ? [
              { name: 'personId', type: 'hidden', value: personId },
              { type: 'static', label: 'Who', value: handoffPerson?.name || 'Person no longer in roster' },
            ]
          : delegation
            ? [
              { name: 'personId', type: 'hidden', value: delegation.personId },
              {
                type: 'static',
                label: 'Who',
                value: ctx.state.people.find((person) => person.id === delegation.personId)?.name || 'Team member',
              },
              {
                type: 'static',
                label: 'Linked stretch delegation',
                wide: true,
                value: h(
                  'p',
                  { class: 'muted small' },
                  `“${delegation.title}” · ${authorityFor(delegation).label}. Completing the delegation will prompt a coaching reflection rather than closing the GROW commitment silently.`,
                ),
              },
            ]
          : [{ name: 'personId', label: 'Who', type: 'select', value: personId || active[0].id, options: personOptions(active), required: true }]),
      { name: 'competencies', label: 'Focus competencies', type: 'boolean-block', wide: true, value: seededCompetencies, options: COMPETENCIES.map((c) => ({ value: c, label: c })) },
      {
        name: 'goal',
        label: 'Goal — what does better look like?',
        type: 'textarea',
        rows: 2,
        required: true,
        wide: true,
        value: plan?.goal || (reviewHandoff ? sourceReview.manager?.development?.trim() || '' : ''),
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
          value: seededWillText,
          placeholder: 'Publish a decision memo format and use it on the billing migration',
        },
        { name: 'willDue', label: 'Action due', type: 'date', value: seededWillDue },
      ]),
      { name: 'reviewOn', label: 'Review on', type: 'date', value: plan?.reviewOn || addDays(today, 30) },
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
            ...(reviewHandoff ? { sourceReviewId: values.sourceReviewId } : {}),
            ...patch,
            will: [{
              text: values.willText,
              due: values.willDue,
              delegationId: delegation?.id || null,
            }],
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

export function openWillActionDialog(ctx, { planId, delegation = null } = {}) {
  const plan = (ctx.state.growthPlans || []).find((p) => p.id === planId) || null;
  const today = dayKey(ctx.now);
  const eligible = plan ? unlinkedDelegationsForPerson(ctx.state, plan.personId) : [];
  if (delegation && !eligible.some((d) => d.id === delegation.id)) {
    eligible.unshift(delegation);
  }
  const hasDelegationPicker = eligible.length > 0;
  const initialText = delegation ? `Deliver delegated outcome: ${delegation.title}`.slice(0, 240) : '';
  const initialDue = delegation && delegation.dueOn && delegation.dueOn >= today
    ? delegation.dueOn
    : addDays(today, 14);

  const form = buildForm([
    ...(hasDelegationPicker
      ? [{
          name: 'delegationId',
          label: 'Link to delegated outcome (optional)',
          type: 'select',
          value: delegation?.id || '',
          options: [
            { value: '', label: 'None — standalone development action' },
            ...eligible.map((d) => ({
              value: d.id,
              label: `${d.title} (${d.status === 'done' ? 'completed' : authorityFor(d).shortLabel})`,
            })),
          ],
          help: 'Links this GROW commitment to an owned delegation without silently auto-closing either record.',
        }]
      : []),
    {
      name: 'text',
      label: 'Commitment',
      required: true,
      value: initialText,
      placeholder: 'Co-run one architecture review with Priya',
    },
    { name: 'due', label: 'Due', type: 'date', value: initialDue },
  ]);

  if (hasDelegationPicker) {
    form.field('delegationId').addEventListener('change', (event) => {
      const chosen = eligible.find((d) => d.id === event.target.value);
      if (!chosen) return;
      const textInput = form.field('text');
      const dueInput = form.field('due');
      if (textInput && !textInput.value.trim()) {
        textInput.value = `Deliver delegated outcome: ${chosen.title}`.slice(0, 240);
      }
      if (dueInput && chosen.dueOn && chosen.dueOn >= today) {
        dueInput.value = chosen.dueOn;
      }
    });
  }

  let dialog = null;
  form.__close = () => dialog?.close();
  form.__onSubmit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.addWillAction(planId, values.text, values.due, {
      delegationId: values.delegationId || null,
    });
    if (!result.ok) {
      form.setFieldError(result.field || 'text', result.error);
      toast(result.error, 'bad');
      return;
    }
    dialog.close();
    toast(values.delegationId ? 'Linked development action added' : 'Action added', 'good');
  };

  dialog = openModal({
    title: delegation ? 'Track delegated outcome in GROW' : 'Add a development action',
    description: delegation
      ? 'Adds a dated commitment on their active GROW plan linked to this delegated outcome.'
      : null,
    body: form.node,
    footer: submitBar(form, { label: 'Save' }),
    size: 'sm',
  });
  return dialog;
}

/**
 * Move one commitment instead of quietly letting it lapse.
 *
 * Renegotiating a promise is keeping it; silently missing the date is breaking
 * it. The dialog is separate from "done" so the record can tell the difference
 * a month later, and the new date is required — "carried forward, no date" is
 * how a plan becomes wallpaper.
 */
export function openCarryWillDialog(ctx, { plan, action }) {
  formDialog({
    title: 'Carry this commitment forward',
    description: 'The old date stays in the record. The commitment keeps its original agreement date, so the plan can show how long it has really been open.',
    size: 'sm',
    submitLabel: 'Carry forward',
    fields: [
      { type: 'static', label: 'Commitment', value: h('span', { class: 'recon-text' }, action.text) },
      {
        name: 'due',
        label: 'New due date',
        type: 'date',
        required: true,
        value: addDays(dayKey(ctx.now), 14),
        help: 'Pick a date you can actually keep. Another miss is worse than a later date.',
      },
    ],
    onSubmit: (values, form, close) => {
      const result = ctx.api.carryWillAction(plan.id, action.id, values.due);
      if (!result.ok) {
        form.setFieldError(result.field || 'due', result.error);
        return;
      }
      close();
      toast(`Carried forward to ${formatDate(values.due)}`, 'good');
    },
  });
}

/** Drop a commitment, with a reason that survives the conversation. */
export function openDropWillDialog(ctx, { plan, action }) {
  formDialog({
    title: 'Drop this commitment',
    description: 'Dropped is not the same as done, and both are visible in the record. This is the honest way to close something that no longer matters.',
    size: 'sm',
    submitLabel: 'Drop it',
    fields: [
      { type: 'static', label: 'Commitment', value: h('span', { class: 'recon-text' }, action.text) },
      {
        name: 'reason',
        label: 'Why is it no longer worth doing?',
        type: 'textarea',
        rows: 2,
        required: true,
        maxlength: 300,
        placeholder: 'The role moved to platform work and this skill is no longer on the path',
        help: 'Kept in the plan history. A drop with no reason looks the same as a failure.',
      },
    ],
    onSubmit: (values, form, close) => {
      const result = ctx.api.dropWillAction(plan.id, action.id, values.reason);
      if (!result.ok) {
        form.setFieldError(result.field || 'reason', result.error);
        return;
      }
      close();
      toast('Commitment dropped', 'good');
    },
  });
}

/**
 * Record a development review — the conversation, not the date.
 *
 * The decisions panel is the same interaction the 1:1 dialog uses for last
 * time's promises, deliberately: a development commitment is a promise, and it
 * should be possible to say "done", "still open", "moved to March" or "we
 * decided not to bother" in exactly one place and in exactly one way.
 *
 * Moving the review date is what makes a plan look managed without anyone
 * developing; requiring a note is the smallest possible defence against that.
 */
export function openGrowthReviewDialog(ctx, { plan }) {
  const open = openWillActions(plan, ctx.now);
  const settled = new Map();
  const panel = h('div', { class: 'recon-panel' });

  const candidateKey = (action) => action.id;

  function renderPanel() {
    if (!open.length) {
      panel.replaceChildren(
        h('p', { class: 'recon-empty muted small' }, 'No open commitments to settle. Still write down what you discussed — the review is the point.'),
      );
      return;
    }
    const children = [
      h('p', { class: 'recon-summary' }, `${open.length} open commitment${open.length === 1 ? '' : 's'} · ${open.filter((a) => a.overdue).length} past due`),
      h('p', { class: 'recon-hint muted small' }, 'Decide what happened to each one. Anything left as “still open” stays on the plan.'),
    ];
    for (const candidate of open.slice(0, 8)) children.push(renderRow(candidate));
    if (open.length > 8) {
      children.push(h('p', { class: 'muted small' }, `+${open.length - 8} more open commitments — settle them in the next review.`));
    }
    panel.replaceChildren(...children);
  }

  function renderRow(candidate) {
    const key = candidateKey(candidate);
    const entry = settled.get(key) || { outcome: 'still-open', due: '', reason: '' };
    const radioName = `will-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
    const delLink = linkedDelegationForWill(ctx.state, candidate, ctx.now);
    const meta = [];
    if (delLink) meta.push(`delegation: ${delLink.health.label.toLowerCase()}`);
    if (candidate.carryCount) meta.push(`carried forward ${candidate.carryCount}×`);
    if (candidate.firstAgreedOn) meta.push(`since ${formatDate(candidate.firstAgreedOn, { withYear: false })}`);
    if (candidate.due) {
      meta.push(candidate.overdue
        ? `was due ${formatDate(candidate.due, { withYear: false })} · ${Math.abs(candidate.daysUntilDue)}d late`
        : `due ${formatDate(candidate.due, { withYear: false })}`);
    } else {
      meta.push('no due date');
    }

    const extra = h('div', { class: 'recon-extra' });
    function syncExtra() {
      extra.replaceChildren();
      if (entry.outcome === 'carried') {
        extra.appendChild(
          h(
            'label',
            { class: 'recon-field' },
            h('span', { class: 'muted tiny' }, 'New due date'),
            h('input', {
              type: 'date',
              value: entry.due || '',
              'aria-label': `New due date for “${candidate.text}”`,
              onChange: (event) => { entry.due = event.target.value; },
            }),
          ),
        );
      } else if (entry.outcome === 'dropped') {
        extra.appendChild(
          h(
            'label',
            { class: 'recon-field' },
            h('span', { class: 'muted tiny' }, 'Why is it no longer worth doing? (kept in the record)'),
            h('input', {
              type: 'text',
              value: entry.reason || '',
              maxlength: 300,
              placeholder: 'The role changed and this skill is no longer on the path',
              'aria-label': `Reason for dropping “${candidate.text}”`,
              onChange: (event) => { entry.reason = event.target.value; },
            }),
          ),
        );
      }
    }

    const optionLabels = [];
    for (const [value, label] of [['done', 'Done'], ['still-open', 'Still open'], ['carried', 'Carry forward'], ['dropped', 'Drop']]) {
      const input = h('input', {
        type: 'radio',
        name: radioName,
        value,
        checked: entry.outcome === value,
        onChange: () => {
          entry.outcome = value;
          settled.set(key, entry);
          for (const node of optionLabels) node.classList.toggle('is-picked', node.querySelector('input').value === value);
          syncExtra();
        },
      });
      const wrapper = h('label', { class: `recon-opt ${entry.outcome === value ? 'is-picked' : ''}` }, input, h('span', null, label));
      optionLabels.push(wrapper);
    }
    syncExtra();

    return h(
      'div',
      { class: 'recon-row', dataset: { actionKey: key } },
      h(
        'div',
        { class: 'recon-main' },
        h('span', { class: 'recon-text' }, candidate.text),
        h('span', { class: `recon-meta ${candidate.overdue ? 'text-bad' : ''}` }, meta.join(' · ')),
        delLink?.awaitingReflection
          ? h('span', { class: 'tiny good-text' }, `Delegated outcome completed ${formatDate(delLink.delegation.completedOn, { withYear: false })} — confirm what was learned before marking done.`)
          : delLink?.wasReturned
            ? h('span', { class: 'tiny text-warn' }, `Delegation returned to leader ${formatDate(delLink.delegation.returnedOn, { withYear: false })} — re-scope or drop this commitment.`)
            : null,
      ),
      h('div', { class: 'recon-opts', role: 'radiogroup', 'aria-label': `Outcome for “${candidate.text}”` }, ...optionLabels),
      extra,
    );
  }

  const form = buildForm([
    { name: 'date', label: 'When did you hold it?', type: 'date', value: dayKey(ctx.now), required: true },
    {
      type: 'divider',
      label: 'What you decided',
    },
    { type: 'static', label: 'Commitments', value: panel },
    {
      name: 'notes',
      label: 'What did you actually discuss?',
      type: 'textarea',
      rows: 3,
      required: true,
      placeholder: 'Reviewed the memo format; she is writing it in practice now. The architecture review moved because Priya was on call.',
      help: 'A review with no record is a checkbox. One sentence is enough.',
    },
    {
      name: 'nextReviewOn',
      label: 'Next review',
      type: 'date',
      value: plan.reviewOn && plan.reviewOn > dayKey(ctx.now) ? plan.reviewOn : addDays(dayKey(ctx.now), 30),
      help: 'Agree it now, while you are both here. Leave it blank only if development is genuinely paused.',
    },
  ]);
  renderPanel();

  form.__close = () => dialog.close();
  function submitReview() {
    const values = form.getValues();
    const decisions = open
      .map((candidate) => {
        const entry = settled.get(candidateKey(candidate));
        if (!entry || entry.outcome === 'still-open') return null;
        return {
          actionId: candidate.id,
          outcome: entry.outcome,
          due: entry.outcome === 'carried' ? entry.due || null : null,
          reason: entry.outcome === 'dropped' ? entry.reason || '' : '',
        };
      })
      .filter(Boolean);
    const result = ctx.api.logGrowthReview(plan.id, {
      date: values.date || dayKey(ctx.now),
      notes: values.notes,
      nextReviewOn: values.nextReviewOn || null,
      decisions,
    });
    if (!result.ok) {
      toast(result.error, 'bad');
      if (result.field && form.field(result.field)) form.setFieldError(result.field, result.error);
      else panel.prepend(h('p', { class: 'note note-bad', role: 'alert' }, result.error));
      return;
    }
    dialog.close();
    const parts = [];
    if (result.closed) parts.push(`${result.closed} closed`);
    if (result.carried) parts.push(`${result.carried} carried forward`);
    if (result.dropped) parts.push(`${result.dropped} dropped`);
    toast(
      `Review recorded${parts.length ? ` — ${parts.join(', ')}` : ''}${result.nextReviewOn ? ` · next ${formatDate(result.nextReviewOn)}` : ''}`,
      'good',
    );
  }
  form.node.addEventListener('submit', (event) => {
    event.preventDefault();
    submitReview();
  });

  const dialog = openModal({
    title: `Review ${plan.goal ? 'this plan' : 'the plan'}`.trim(),
    description: 'A development review is a conversation with a record and a next date. Moving the date without holding one is not a review, and this app counts the difference.',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', { class: 'btn btn-primary', type: 'button', onClick: () => submitReview() }, 'Record review'),
    ],
    size: 'lg',
  });
  return dialog;
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

export function openDecisionDialog(ctx, { decision = null } = {}) {
  const isEdit = Boolean(decision);
  const active = ctx.state.people.filter((p) => p.status !== 'archived');
  const peopleNames = active.map((p) => p.name);
  const existingOptions = decision?.options || [];
  formDialog({
    title: isEdit ? 'Edit decision' : 'Log a decision',
    description: isEdit
      ? 'Refine DACI accountability, options, rationale or review date without erasing the decision record.'
      : 'The point is not the record — it is knowing who decided and when to look again.',
    submitLabel: isEdit ? 'Save changes' : 'Save decision',
    size: 'lg',
    fields: [
      { name: 'title', label: 'Decision', required: true, wide: true, value: decision?.title || '', placeholder: 'Restructure support into product pods' },
      { name: 'question', label: 'The question in one sentence', type: 'textarea', rows: 2, wide: true, value: decision?.question || '', placeholder: 'Should support move from one queue to three product-aligned pods this quarter?' },
      {
        name: 'reversibility',
        label: 'Reversibility',
        type: 'select',
        value: decision?.reversibility || 'reversible',
        options: [
          { value: 'reversible', label: 'Reversible — decide fast' },
          { value: 'irreversible', label: 'Irreversible — slow down and write it up' },
        ],
      },
      { name: 'date', label: 'Date', type: 'date', value: decision?.date || dayKey(ctx.now) },
      { name: 'driver', label: 'Driver (DACI)', value: decision?.driver || '', placeholder: peopleNames[0] || 'Who makes this happen?' },
      { name: 'approver', label: 'Approver (DACI)', value: decision?.approver || '', placeholder: 'Exactly one person says yes or no' },
      { name: 'contributors', label: 'Contributors', value: decision?.contributors || '', placeholder: 'Consulted before the call' },
      { name: 'informed', label: 'Informed', value: decision?.informed || '', placeholder: 'Told afterwards — not consulted' },
      { name: 'optionA', label: 'Option A', wide: true, value: existingOptions[0]?.label || '' },
      { name: 'optionB', label: 'Option B', wide: true, value: existingOptions[1]?.label || '' },
      ...(existingOptions.length > 2
        ? [{
            name: 'extraOptions',
            label: 'Additional options (one per line)',
            type: 'textarea',
            rows: 2,
            wide: true,
            value: existingOptions.slice(2).map((o) => o.label).join('\n'),
          }]
        : []),
      { name: 'rationale', label: 'Rationale (if already decided)', type: 'textarea', rows: 2, wide: true, value: decision?.rationale || '' },
      // A forecast can still be added or revised while the outcome is
      // unreviewed (every change is audit-logged); after review it is frozen
      // by the action layer so calibration cannot be gamed in hindsight.
      ...(isEdit && decision.chosen && !decision.reviewedOn
        ? [{
            name: 'forecastProbability',
            label: 'Forecast: chance this works out well (%)',
            type: 'number',
            min: 5,
            max: 95,
            step: 1,
            value: decision.forecastProbability ?? '',
            placeholder: 'e.g. 70',
            help: 'Recorded now, scored at the outcome review (Brier). Revising it as evidence arrives is legitimate forecasting — revising it after the outcome is known is not, and the app will refuse.',
          }]
        : []),
      {
        name: 'reviewOn',
        label: 'Review on',
        type: 'date',
        value: decision ? (decision.reviewOn || '') : addDays(dayKey(ctx.now), ctx.state.settings.decisionReviewDays),
        help: 'When to look at this again. A decision with no review is never learned from.',
      },
    ],
    onSubmit: (values, form, close) => {
      const extraLabels = values.extraOptions
        ? String(values.extraOptions).split('\n').map((s) => s.trim()).filter(Boolean)
        : [];
      const labels = [values.optionA, values.optionB, ...extraLabels]
        .map((label) => (label || '').trim())
        .filter(Boolean);
      const prevByLabel = new Map(existingOptions.map((o) => [o.label.toLowerCase(), o]));
      const options = labels.map((label) => {
        const prev = prevByLabel.get(label.toLowerCase());
        return prev ? { id: prev.id, label, pros: prev.pros, cons: prev.cons } : { label };
      });
      const payload = {
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
      };
      if (values.forecastProbability !== undefined) {
        payload.forecastProbability = values.forecastProbability === '' ? null : values.forecastProbability;
      }
      const result = isEdit
        ? ctx.api.updateDecision(decision.id, payload)
        : ctx.api.addDecision(payload);
      if (!result.ok) {
        form.setFieldError(result.field || 'title', result.error);
        return;
      }
      close();
      toast(isEdit ? 'Decision updated' : 'Decision logged', 'good');
    },
  });
}

export function openDecideDialog(ctx, { decision }) {
  // Outside view first (Kahneman): show the leader their own base rate before
  // they state a probability for this specific call.
  const reviewed = (ctx.state.decisions || []).filter((d) => d.chosen && d.reviewedOn && ['good', 'mixed', 'bad'].includes(d.outcome));
  const baseRate = reviewed.length
    ? Math.round((reviewed.reduce((s, d) => s + (d.outcome === 'good' ? 1 : d.outcome === 'mixed' ? 0.5 : 0), 0) / reviewed.length) * 100)
    : null;
  formDialog({
    title: `Decide: ${decision.title}`,
    description: 'Record what was chosen, why, and when to review the outcome. The rationale is the part you will want in six months.',
    submitLabel: 'Record decision',
    fields: [
      { name: 'chosen', label: 'What was decided', required: true, wide: true, value: decision.chosen || decision.options?.[0]?.label || '' },
      { name: 'rationale', label: 'Why', type: 'textarea', rows: 3, wide: true, value: decision.rationale || '', help: 'At least a couple of sentences. Future-you will not remember the trade-off.' },
      {
        name: 'forecastProbability',
        label: 'Forecast: chance this works out well (%)',
        type: 'number',
        min: 5,
        max: 95,
        step: 1,
        value: decision.forecastProbability ?? '',
        placeholder: 'e.g. 70',
        help: [
          'Optional, but this is how judgement measurably improves: state a probability now and the outcome review scores it (Brier score, Tetlock & Gardner 2015).',
          baseRate !== null ? `Your base rate: ${reviewed.length} reviewed decision(s) ran ${baseRate}% successful on average — start there, then adjust for this case.` : 'No reviewed decisions yet, so there is no personal base rate; 50% means a genuine coin flip.',
          'Keep it between 5% and 95% — certainty is not available for operational calls.',
        ].join(' '),
      },
      {
        name: 'reviewOn',
        label: 'Review outcome on',
        type: 'date',
        value: decision.reviewOn || addDays(dayKey(ctx.now), ctx.state.settings.decisionReviewDays),
        help: 'Pre-commit when you will judge whether the call worked.',
      },
    ],
    onSubmit: (values, form, close) => {
      const result = ctx.api.decideDecision(decision.id, {
        chosen: values.chosen,
        rationale: values.rationale,
        reviewOn: values.reviewOn || null,
        forecastProbability: values.forecastProbability === '' || values.forecastProbability === undefined ? null : values.forecastProbability,
      });
      if (!result.ok) return form.setFieldError(result.field || 'chosen', result.error);
      close();
      toast('Decision recorded', 'good');
    },
  });
}

export function openReviewDialog(ctx, { decision }) {
  formDialog({
    title: `Review: ${decision.title}`,
    description: 'Was it the right call with the information available at the time? Judge the decision process, not luck alone.',
    submitLabel: 'Save review',
    fields: [
      ...(decision.chosen
        ? [{
            type: 'static',
            label: 'Call made',
            wide: true,
            value: h(
              'p',
              { class: 'muted small' },
              `${decision.chosen}${decision.rationale ? ` — ${decision.rationale}` : ''}`,
            ),
          }]
        : []),
      ...(decision.forecastProbability !== null && decision.forecastProbability !== undefined
        ? [{
            type: 'static',
            label: 'Forecast being scored',
            wide: true,
            value: h(
              'p',
              { class: 'muted small' },
              `When this was decided, the recorded forecast was ${decision.forecastProbability}% that it would work out well. This review scores that number (good = 100%, mixed = 50%, bad = 0%) into your Brier calibration record — judge the outcome honestly, not to protect the forecast.`,
            ),
          }]
        : []),
      {
        name: 'reviewedOn',
        label: 'Reviewed on',
        type: 'date',
        required: true,
        value: decision.reviewedOn || dayKey(ctx.now),
      },
      {
        name: 'outcome',
        label: 'Outcome',
        type: 'select',
        value: ['good', 'mixed', 'bad'].includes(decision.outcome) ? decision.outcome : 'good',
        options: [
          { value: 'good', label: 'Good — I would decide the same again' },
          { value: 'mixed', label: 'Mixed — right call, poor execution' },
          { value: 'bad', label: 'Bad — I would decide differently' },
        ],
      },
      { name: 'outcomeNotes', label: 'What happened?', type: 'textarea', rows: 3, wide: true, value: decision.outcomeNotes || '' },
    ],
    onSubmit: (values, form, close) => {
      const result = ctx.api.reviewDecision(decision.id, {
        outcome: values.outcome,
        outcomeNotes: values.outcomeNotes,
        reviewedOn: values.reviewedOn || dayKey(ctx.now),
      });
      if (!result.ok) return form.setFieldError(result.field || 'outcome', result.error);
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
  const selectedPersonId = personId || active[0].id;
  const existing = seat
    ? ctx.state.readiness.find((r) => r.personId === selectedPersonId && r.seat === seat)
    : null;
  formDialog({
    title: existing ? 'Update readiness rating' : 'Set a readiness rating',
    description: 'The rating is stored, but the app also shows the evidence behind it. A "ready now" claim without evidence is flagged, not displayed as fact.',
    submitLabel: 'Save rating',
    fields: [
      { name: 'personId', label: 'Who', type: 'select', value: selectedPersonId, options: personOptions(active), required: true },
      { name: 'seat', label: 'Seat', required: true, value: seat, placeholder: 'Principal engineer' },
      { name: 'rating', label: 'Readiness', type: 'select', value: existing ? existing.rating : 'ready-later', options: READINESS.map((r) => ({ value: r, label: READINESS_LABELS[r] })) },
      {
        name: 'notes',
        label: 'Development gaps & stretch context (optional)',
        type: 'textarea',
        rows: 2,
        maxlength: 1200,
        wide: true,
        value: existing?.notes || '',
        placeholder: 'Needs cross-team budgeting exposure and to lead one quarterly planning cycle before stepping in.',
      },
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
      { name: 'caseReviewDays', label: 'Operational case review default (days)', type: 'number', value: s.caseReviewDays ?? 14, min: 1, max: 365, help: 'Default review horizon for open incidents, risks, escalations, and initiatives.' },
      { name: 'changeReviewDays', label: 'Organizational change review default (days)', type: 'number', value: s.changeReviewDays ?? 21, min: 3, max: 180, help: 'Default review cadence for active pod splits, charters, and process redesigns.' },
      { name: 'growthReviewDays', label: 'Growth plan review (days)', type: 'number', value: s.growthReviewDays, min: 1, max: 365 },
      { name: 'onboardingDays', label: 'Onboarding window (days)', type: 'number', value: s.onboardingDays, min: 7, max: 365 },
      { name: 'maxReportsPerManager', label: 'Max direct reports before a warning', type: 'number', value: s.maxReportsPerManager, min: 1, max: 30 },
      { type: 'divider', label: 'Capacity & flow planning conventions' },
      {
        name: 'capacityHoursPerWeek',
        label: 'Focused hours per person per week',
        type: 'number',
        value: s.capacityHoursPerWeek ?? 32,
        min: 1,
        max: 60,
        help: 'Hours genuinely available for planned work. Meetings, support and interrupts are modelled separately by the operational reserve, so do not deduct them twice.',
      },
      {
        name: 'planningHorizonWeeks',
        label: 'Planning horizon (weeks)',
        type: 'number',
        value: s.planningHorizonWeeks ?? 4,
        min: 1,
        max: 26,
        help: 'The window the capacity plan commits against. Beyond ~6 weeks, forecasts age faster than they help.',
      },
      {
        name: 'operationalLoadPct',
        label: 'Operational reserve (% of capacity)',
        type: 'number',
        value: s.operationalLoadPct ?? 20,
        min: 0,
        max: 80,
        help: 'Capacity held back for interrupts, support and meetings. Zero makes every plan look feasible; 20–30% is where most teams actually land.',
      },
      {
        name: 'wipLimitPerPerson',
        label: 'Work-in-progress limit per person',
        type: 'number',
        value: s.wipLimitPerPerson ?? 2,
        min: 1,
        max: 12,
        help: 'Little’s Law: cycle time rises with work in progress. Two concurrent funded items per person is a common constraint, not a universal rule.',
      },
      {
        name: 'simulationSeed',
        label: 'Monte Carlo deterministic seed',
        type: 'number',
        value: s.simulationSeed ?? 42,
        min: 1,
        max: 999999999,
        help: 'Fixes the pseudo-random number stream for portfolio and J-curve Beta-PERT simulations so every probability is reproducible.',
      },
      {
        name: 'simulationTrials',
        label: 'Monte Carlo trial count',
        type: 'number',
        value: s.simulationTrials ?? 1000,
        min: 200,
        max: 5000,
        help: 'Number of simulated scenarios per forecast (200–5,000). 1,000 trials stabilize P50/P80/P90 within ~1–2% in milliseconds.',
      },
      { type: 'divider', label: 'Selection & hiring conventions' },
      {
        name: 'hiringStallDays',
        label: 'Days without movement before a role is “stalled”',
        type: 'number',
        value: s.hiringStallDays ?? 30,
        min: 7,
        max: 180,
        help: 'A stalled role raises one operational case automatically, so vacancy exposure inherits risk tracking instead of sitting in a tab nobody opens. It is raised once per role, even if that case is later closed.',
      },
      {
        name: 'interviewHoursPerStage',
        label: 'Interviewer hours per stage',
        type: 'number',
        value: s.interviewHoursPerStage ?? 3,
        min: 1,
        max: 12,
        help: 'Used only to suggest an effort estimate for a role. The suggestion is never saved on your behalf — a capacity reserve needs an estimate you actually made.',
      },
      {
        name: 'candidateRetentionDays',
        label: 'Candidate record retention reminder (days, 0 = off)',
        type: 'number',
        value: s.candidateRetentionDays ?? 180,
        min: 0,
        max: 3650,
        help: 'How long a closed or settled candidate record is useful for. LeadOS will list records past this window so you can delete them — it never deletes anything itself, because an automatic timer can destroy the reasoning behind a decision someone is still asking about. 0 disables the reminder.',
      },
      {
        name: 'hiringBaseRatePct',
        label: 'Prior: % of candidates who clear the bar and succeed',
        type: 'number',
        value: Math.round((s.hiringBaseRate ?? 0.45) * 100),
        min: 5,
        max: 95,
        help: 'An explicit assumption, not a measured constant. Evidence moves it up or down; a 45% default means a hire is roughly a coin flip before you have looked at anyone.',
      },
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
      const zeroAllowed = new Set(['idleLockMinutes', 'operationalLoadPct', 'candidateRetentionDays']);
      const numeric = [
        'oneOnOneCadenceDays', 'feedbackTargetDays', 'feedbackLatencyTargetDays', 'goalCheckinDays', 'delegationCheckinDays', 'recognitionTargetDays',
        'decisionReviewDays', 'caseReviewDays', 'changeReviewDays', 'growthReviewDays', 'onboardingDays', 'maxReportsPerManager', 'pulseMinResponses', 'idleLockMinutes',
        'capacityHoursPerWeek', 'planningHorizonWeeks', 'operationalLoadPct', 'wipLimitPerPerson', 'simulationSeed', 'simulationTrials',
        'hiringStallDays', 'interviewHoursPerStage', 'candidateRetentionDays',
      ];
      const patch = { leaderName: values.leaderName, teamName: values.teamName, orgName: values.orgName };
      for (const key of numeric) {
        const rawVal = String(values[key] ?? '').trim();
        const n = rawVal === '' ? Number.NaN : Number(rawVal);
        const min = zeroAllowed.has(key) ? 0 : 1;
        if (!Number.isFinite(n) || n < min) {
          form.setFieldError(key, min === 0 ? 'Enter 0 or a positive number.' : 'Enter a number of at least 1.');
          return;
        }
        patch[key] = Math.round(n);
      }
      const basePct = Number(String(values.hiringBaseRatePct ?? '').trim());
      if (!Number.isFinite(basePct) || basePct < 5 || basePct > 95) {
        form.setFieldError('hiringBaseRatePct', 'Enter a percentage between 5 and 95.');
        return;
      }
      patch.hiringBaseRate = Math.round(basePct) / 100;
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

/* ----------------------------------------------------- onboarding 30-60-90 */

function parseStakeholderLines(rawText) {
  if (typeof rawText !== 'string' || !rawText.trim()) return [];
  return rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const sep = line.includes('|') ? '|' : line.includes('—') ? '—' : null;
      if (!sep) return { name: line, purpose: '', met: false };
      const [first, ...rest] = line.split(sep);
      return {
        name: first.trim(),
        purpose: rest.join(sep).trim(),
        met: false,
      };
    })
    .filter((item) => item.name);
}

export function openOnboardingPlanDialog(ctx, { plan = null, personId = null, kind = null, label = '', handoffContext = null } = {}) {
  const editing = Boolean(plan);
  const selectedPersonId = plan?.personId || personId || '';
  const selectedPerson = ctx.state.people.find((p) => p.id === selectedPersonId) || null;
  // A plan started for someone well past their onboarding window is almost
  // certainly a role transition unless an explicit kind (such as 'reboarding')
  // was requested, and anchors to today — never to the day they joined.
  const selectedTenure = selectedPerson ? tenureDays(selectedPerson, ctx.now) : null;
  const initialKind = editing
    ? (ONBOARDING_KINDS.includes(plan.kind) ? plan.kind : 'new-hire')
    : kind && ONBOARDING_KINDS.includes(kind)
      ? kind
      : selectedTenure !== null && selectedTenure > (ctx.state.settings?.onboardingDays ?? 90)
        ? 'role-transition'
        : 'new-hire';
  const defaultStart = plan?.startDate
    || (initialKind === 'role-transition' || initialKind === 'reboarding'
      ? dayKey(ctx.now)
      : (selectedPerson?.startDate || dayKey(ctx.now)));
  const buddyChoices = [
    { value: '', label: 'None assigned yet' },
    ...personOptions(ctx.state.people.filter((p) => p.id !== selectedPersonId)),
  ];

  const handoffNotice = !editing && handoffContext
    ? h(
        'div',
        { class: 'note' },
        h(
          'p',
          { class: 'small' },
          h('strong', null, `Stepping into tracked seat: ${handoffContext.seat}. `),
          `Readiness status: ${handoffContext.ratingLabel} (${handoffContext.metCount}/${handoffContext.totalEvidence} behavioural evidence checks). Their original start date and tenure remain unchanged.`,
        ),
        handoffContext.warning
          ? h('p', { class: 'tiny text-warn' }, handoffContext.warning)
          : null,
        handoffContext.notes
          ? h('p', { class: 'tiny muted' }, `Readiness notes on record: “${handoffContext.notes}”`)
          : null,
      )
    : null;

  const fields = [
    ...(handoffNotice
      ? [{
          type: 'static',
          label: 'Succession handoff',
          value: handoffNotice,
          wide: true,
        }]
      : []),
    editing
      ? {
          type: 'static',
          label: 'Team member',
          value: selectedPerson ? selectedPerson.name : 'Unknown person',
        }
      : {
          name: 'personId',
          label: 'Team member',
          type: 'select',
          required: true,
          value: selectedPersonId,
          options: [{ value: '', label: 'Choose a team member…' }, ...personOptions(ctx.state)],
        },
    {
      name: 'kind',
      label: 'Plan type',
      type: 'select',
      required: true,
      value: initialKind,
      options: [
        { value: 'new-hire', label: `${KIND_LABELS['new-hire']} — joining the team` },
        { value: 'role-transition', label: `${KIND_LABELS['role-transition']} — promotion or new scope` },
        { value: 'reboarding', label: `${KIND_LABELS.reboarding} — re-entry & pacing after extended leave` },
      ],
      help: 'Role transitions and return-to-work plans anchor to today without changing the person’s original start date. Return-to-work plans focus on context catch-up and load pacing — never record medical or personal leave reasons.',
    },
    {
      name: 'label',
      label: 'New role / scope (required for role transitions; optional context)',
      type: 'text',
      value: plan?.label || label || '',
      placeholder: 'e.g. Team Lead · Platform (or optional return label, e.g. Q4 return)',
      help: 'Required for a role transition so the plan reads as the move it is. Optional for return to work — never enter medical, health, or family leave details.',
    },
    {
      name: 'startDate',
      label: 'Plan start date',
      type: 'date',
      required: true,
      value: defaultStart,
      help: 'Day 30, Day 60 and Day 90 horizons are anchored to this date. For a role transition or return to work this is day one of the new phase — never the person’s original start date.',
    },
    {
      name: 'buddyId',
      label: 'Peer buddy (from roster)',
      type: 'select',
      value: plan?.buddyId || '',
      options: buddyChoices,
      help: 'Someone already doing similar work who can answer unwritten day-to-day questions without making them feel evaluated.',
    },
    {
      name: 'buddyName',
      label: 'External buddy (if outside your roster)',
      type: 'text',
      value: plan?.buddyName || '',
      placeholder: 'Optional — e.g. Samira Patel (Design)',
    },
    {
      name: 'roleClarity',
      label: 'Role clarity, context & 90-day expectations',
      type: 'textarea',
      rows: 3,
      span: 2,
      value: plan?.roleClarity || '',
      placeholder: 'What does this person own, what decisions are theirs to make, and what does good look like by Day 90?',
      help: 'Written clarity prevents guessing at unstated expectations. For a transition, name what changes from the old role; for return to work, summarise what changed while away and agreed load pacing (no health/leave details).',
    },
    {
      name: 'earlyWin',
      label: 'Scoped early win (by ~Day 60)',
      type: 'textarea',
      rows: 2,
      span: 2,
      value: plan?.earlyWin || '',
      placeholder: 'One bounded, meaningful deliverable that builds confidence and introduces them to the team’s workflow.',
    },
  ];

  if (!editing) {
    fields.push(
      {
        name: 'stakeholderLines',
        label: 'Key stakeholder introductions (one per line)',
        type: 'textarea',
        rows: 3,
        span: 2,
        value: '',
        placeholder: 'Priya Natarajan | Incident handoffs and on-call pairing\nJordan Alvarez | Product priorities this quarter',
        help: 'Optional — format as "Name | why this connection matters". You can add or check them off anytime.',
      },
      {
        name: 'useTemplate',
        label: 'Seed starter checkpoints',
        type: 'checkbox',
        boxLabel: 'Include 6 editable 30 / 60 / 90 checkpoints for the plan type above (handover & scope for transitions; context catch-up & load pacing for return to work; role scope & norms for new joiners)',
        value: true,
        span: 2,
      },
    );
  }

  formDialog({
    title: editing
      ? 'Edit 30-60-90 plan'
      : handoffContext
        ? `Start role-transition plan: ${handoffContext.seat}`
        : 'Start a 30-60-90 plan',
    description: 'Explicit scaffolding for someone joining the team, moving into a new role, or returning from extended leave — role clarity, a peer buddy, introductions and checkpoints, never a personality grade or medical record.',
    size: 'lg',
    submitLabel: editing ? 'Save changes' : 'Create 30-60-90 plan',
    fields,
    onSubmit: (values, form, close) => {
      form.clearErrors();
      if (editing) {
        const result = ctx.api.updateOnboardingPlan(plan.id, {
          kind: values.kind,
          label: values.label,
          startDate: values.startDate,
          buddyId: values.buddyId || null,
          buddyName: values.buddyName,
          roleClarity: values.roleClarity,
          earlyWin: values.earlyWin,
        });
        if (!result.ok) {
          if (result.field) form.setFieldError(result.field, result.error);
          toast(result.error, 'bad');
          return;
        }
        close();
        toast('30-60-90 plan updated', 'good');
        return;
      }

      const result = ctx.api.createOnboardingPlan({
        personId: values.personId,
        kind: values.kind,
        label: values.label,
        startDate: values.startDate,
        buddyId: values.buddyId || null,
        buddyName: values.buddyName,
        roleClarity: values.roleClarity,
        earlyWin: values.earlyWin,
        stakeholders: parseStakeholderLines(values.stakeholderLines),
        useTemplate: Boolean(values.useTemplate),
      });
      if (!result.ok) {
        if (result.field) form.setFieldError(result.field, result.error);
        toast(result.error, 'bad');
        return;
      }
      close();
      toast(
        values.kind === 'role-transition'
          ? 'Role-transition 30-60-90 plan created'
          : values.kind === 'reboarding'
            ? 'Return-to-work 30-60-90 plan created'
            : '30-60-90 onboarding plan created',
        'good',
      );
    },
  });

  // Keep the suggested anchor honest while the leader changes person or plan
  // type: transitions and return-to-work plans anchor to today, while a
  // new-joiner plan anchors to the day they joined — until the leader picks a
  // date themselves, after which the field is theirs and never overwritten.
  if (!editing) {
    const root = document.getElementById('modal-root');
    const kindSelect = root?.querySelector('select[name="kind"]');
    const personSelect = root?.querySelector('select[name="personId"]');
    const startInput = root?.querySelector('input[name="startDate"]');
    if (kindSelect && startInput) {
      let startTouched = false;
      startInput.addEventListener('change', () => { startTouched = true; });
      const syncStart = () => {
        if (startTouched) return;
        if (kindSelect.value === 'role-transition' || kindSelect.value === 'reboarding') {
          startInput.value = dayKey(ctx.now);
          return;
        }
        const chosen = ctx.state.people.find((p) => p.id === (personSelect?.value || selectedPersonId));
        startInput.value = chosen?.startDate || dayKey(ctx.now);
      };
      kindSelect.addEventListener('change', syncStart);
      personSelect?.addEventListener('change', syncStart);
    }
  }
}

export function openOnboardingCheckpointDialog(ctx, plan, { horizon = 30 } = {}) {
  const initialHorizon = ONBOARDING_HORIZONS.includes(Number(horizon)) ? Number(horizon) : 30;
  formDialog({
    title: plan?.kind === 'role-transition'
      ? 'Add a transition checkpoint'
      : plan?.kind === 'reboarding'
        ? 'Add a return-to-work checkpoint'
        : 'Add an onboarding checkpoint',
    description: 'Keep checkpoints observable and manager-supported — not administrative HR paperwork.',
    submitLabel: 'Add checkpoint',
    fields: [
      {
        name: 'horizon',
        label: 'Horizon',
        type: 'select',
        required: true,
        value: String(initialHorizon),
        options: ONBOARDING_HORIZONS.map((hVal) => ({ value: String(hVal), label: HORIZON_LABELS[hVal] })),
      },
      {
        name: 'category',
        label: 'Focus area',
        type: 'select',
        value: initialHorizon === 30 ? 'clarity' : initialHorizon === 60 ? 'contribution' : 'ownership',
        options: ONBOARDING_CATEGORIES.map((cat) => ({ value: cat, label: CATEGORY_LABELS[cat] })),
      },
      {
        name: 'title',
        label: 'Observable checkpoint',
        type: 'text',
        required: true,
        span: 2,
        placeholder: 'e.g. Pair on two customer escalations and document the handoff checklist',
      },
      {
        name: 'due',
        label: 'Target date',
        type: 'date',
        value: addDays(plan.startDate, initialHorizon),
      },
      {
        name: 'notes',
        label: 'Context or support needed (optional)',
        type: 'text',
        placeholder: 'Optional note',
      },
    ],
    onSubmit: submitter(
      (payload) => {
        const res = ctx.api.addOnboardingCheckpoint(plan.id, payload);
        if (res.ok) toast('Checkpoint added', 'good');
        return res;
      },
      (values) => ({
        horizon: Number(values.horizon),
        category: values.category,
        title: values.title,
        due: values.due,
        notes: values.notes,
      }),
    ),
  });
}

export function openOnboardingStakeholderDialog(ctx, plan) {
  formDialog({
    title: 'Add a stakeholder introduction',
    description: 'Cross-team social capital rarely forms by accident. List who they need to meet and why.',
    submitLabel: 'Add stakeholder',
    fields: [
      {
        name: 'name',
        label: 'Person or team',
        type: 'text',
        required: true,
        placeholder: 'e.g. Mei Lin Chen — Staff Engineer',
      },
      {
        name: 'purpose',
        label: 'Why this introduction matters',
        type: 'text',
        placeholder: 'e.g. Align on billing incident escalation thresholds',
      },
      {
        name: 'met',
        label: 'Status',
        type: 'checkbox',
        boxLabel: 'Introduction has already happened',
        value: false,
        span: 2,
      },
    ],
    onSubmit: submitter(
      (payload) => {
        const res = ctx.api.addOnboardingStakeholder(plan.id, payload);
        if (res.ok) toast('Stakeholder added', 'good');
        return res;
      },
      (values) => ({
        name: values.name,
        purpose: values.purpose,
        met: Boolean(values.met),
      }),
    ),
  });
}

export function openManagerSupportDialog(ctx, plan, { horizon = 30 } = {}) {
  const hVal = ONBOARDING_HORIZONS.includes(Number(horizon)) ? Number(horizon) : 30;
  const checkin = plan.reviews?.[hVal] || null;
  if (!checkin?.heldOn || !checkin.id) {
    toast('Record the check-in conversation before adding a manager follow-up.', 'bad');
    return null;
  }
  const person = ctx.state.people.find((p) => p.id === plan.personId);
  formDialog({
    title: `Add a manager follow-up · Day ${hVal}`,
    description: 'Create a specific action you personally own. This is separate from the check-in notes and from any real 1:1; blockers are not copied into the commitment.',
    submitLabel: 'Add follow-up',
    size: 'md',
    fields: [
      { type: 'static', label: 'Source check-in', value: `${person?.name || 'Team member'} · Day ${hVal} · held ${formatDate(checkin.heldOn)}` },
      {
        name: 'text',
        label: 'What will you do?',
        type: 'textarea',
        rows: 2,
        required: true,
        maxlength: 300,
        placeholder: 'Book the product-context session and share the decision map',
        help: 'Name your concrete action, not the employee’s candid blocker or a general intention.',
      },
      {
        name: 'due',
        label: 'Due date',
        type: 'date',
        value: '',
        required: true,
        help: 'Choose the date that fits this commitment; no standard follow-up interval is assumed.',
      },
    ],
    onSubmit: (values, form, close) => {
      const result = ctx.api.addManagerSupportCommitment({
        planId: plan.id,
        horizon: hVal,
        checkinId: checkin.id,
        text: values.text,
        due: values.due,
      });
      if (!result.ok) {
        form.setFieldError(result.field || 'text', result.error);
        return;
      }
      close();
      toast('Manager follow-up added to what you owe', 'good');
    },
  });
}

export function openOnboardingReviewDialog(ctx, plan, { horizon = 30 } = {}) {
  const hVal = ONBOARDING_HORIZONS.includes(Number(horizon)) ? Number(horizon) : 30;
  const existing = plan.reviews?.[hVal] || null;
  const kindWord = plan?.kind === 'role-transition'
    ? 'transition'
    : plan?.kind === 'reboarding'
      ? 're-boarding'
      : 'onboarding';
  const person = ctx.state.people.find((p) => p.id === plan.personId);
  formDialog({
    title: `Log Day ${hVal} ${kindWord} check-in`,
    description: `${person?.name || 'Team member'}${plan.label ? ` · ${plan.label}` : ''}. Record a conversation that actually happened — opening this dialog does not mark it held. A two-way calibration conversation, never a performance grade.${plan.kind === 'reboarding' ? ' Keep medical and leave reasons out of these notes.' : ''}`,
    submitLabel: 'Log check-in',
    size: 'lg',
    fields: [
      {
        name: 'heldOn',
        label: 'Conversation date',
        type: 'date',
        required: true,
        value: existing?.heldOn || dayKey(ctx.now),
        help: `Cannot be before start date (${plan.startDate}) or in the future.`,
      },
      {
        type: 'static',
        label: 'Horizon',
        value: HORIZON_LABELS[hVal],
      },
      {
        name: 'summary',
        label: 'What is clear and working so far',
        type: 'textarea',
        rows: 3,
        required: true,
        span: 2,
        value: existing?.summary || '',
        placeholder: hVal === 30
          ? 'Are role expectations, team norms and key relationships clear? What surprised them in month one?'
          : hVal === 60
            ? 'How is the early win progressing, and what two-way calibration feedback did you exchange?'
            : 'Which recurring responsibility do they now own, and how are you handing off to steady-state goals and growth?',
      },
      {
        name: 'blockers',
        label: 'Open questions, blockers or manager air-cover needed (optional)',
        type: 'textarea',
        rows: 2,
        span: 2,
        value: existing?.blockers || '',
        placeholder: 'Missing context, unmade introductions, or friction you committed to remove.',
      },
    ],
    onSubmit: submitter(
      (payload) => {
        const res = ctx.api.recordOnboardingReview(plan.id, payload);
        if (res.ok) toast(`Day ${hVal} check-in recorded`, 'good');
        return res;
      },
      (values) => ({
        horizon: hVal,
        heldOn: values.heldOn,
        summary: values.summary,
        blockers: values.blockers,
      }),
    ),
  });
}

export { formatDate, uid };
export {
  openCaseDialog,
  openCaseStakeholderCommsDialog,
  openResolveCaseDialog,
  openLinkCaseEntityDialog,
} from './case-modals.js';
