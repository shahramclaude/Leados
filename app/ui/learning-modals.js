/**
 * app/ui/learning-modals.js — capture dialogs for the After-Action Review &
 * Learning Ledger (Schema v44).
 *
 * Design rule carried from the rest of LeadOS: a dialog asks for what only a
 * human can supply. Here that is unusually sharp, because the whole module is
 * about not fooling yourself:
 *
 *  - The review dialog never pre-fills the cause. Intention and outcome arrive
 *    from the frozen record, the why is blank, and the submit button refuses a
 *    "why" of three characters.
 *  - The lesson dialog has no "learned" toggle. It asks what class the lesson is
 *    (so recurrence is countable) and what changes (with `none` as a first-class
 *    answer that is stored as an observation).
 *  - The close-change dialog will not accept "done" as evidence that a practice
 *    changed. It wants the date and a sentence about what is now different.
 */

import { h, buildForm, openModal, toast } from './dom.js';
import { badge } from './components.js';
import {
  AAR_QUESTIONS,
  CHANGE_TYPES,
  LESSON_CLASSES,
  LESSON_CLASS_KEYS,
  lessonClassLabel,
  lessonEvidenceCandidates,
  subjectEvidence,
  subjectTypeSpec,
} from '../core/domain/learning.js';

function formDialog({ title, description, fields, submitLabel = 'Save', size = 'md', bodyExtra = null, onSubmit }) {
  const form = buildForm(fields);
  let closeFn = null;
  form.__close = () => closeFn && closeFn();
  form.__onSubmit = () => onSubmit(form.getValues(), form, () => closeFn && closeFn());
  const cancelBtn = h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => form.__close() }, 'Cancel');
  const submitBtn = h('button', { class: 'btn btn-primary', type: 'button', onClick: () => form.__onSubmit() }, submitLabel);
  form.node.addEventListener('submit', (event) => {
    event.preventDefault();
    form.__onSubmit();
  });
  const dialog = openModal({
    title,
    description,
    body: h('div', { class: 'view-stack' }, form.node, bodyExtra),
    footer: [cancelBtn, submitBtn],
    size,
    onClose: () => form.clearErrors(),
  });
  closeFn = dialog.close;
  dialog.__form = form;
  return dialog;
}

function today(ctx) {
  return ctx.now.toISOString().slice(0, 10);
}

function rosterOptions(ctx, { blank = 'No owner yet', value = '' } = {}) {
  const options = [{ value: '', label: blank }];
  for (const person of (ctx.state.people || []).filter((p) => p && p.status !== 'archived')) {
    options.push({ value: person.id, label: `${person.name}${person.role ? ` · ${person.role}` : ''}` });
  }
  return options.map((option) => ({ ...option, selected: option.value === value }));
}

function evidenceBlock(evidence) {
  if (!evidence || !evidence.lines.length) return null;
  return h('div', { class: 'view-stack', style: 'gap:6px' },
    h('p', { class: 'small muted' }, 'Read from the record. The first two questions are pre-filled from these numbers, which is what stops the review from becoming a hindsight story.'),
    h('ul', { class: 'prep-list' }, ...evidence.lines.map((line) => h('li', { class: 'small' },
      h('strong', null, `${line.label}: `),
      `${line.value} `,
      h('span', { class: 'muted' }, `(${line.source})`)))));
}

/**
 * Hold (or save a draft of) a review.
 *
 * `mode` is 'hold' when the leader is finishing the review and 'draft' when they
 * are stopping partway; the same fields are used because the four questions are
 * the same four questions either way.
 */
export function openRetroDialog(ctx, { retro, mode = 'hold', onSaved = null }) {
  const evidence = retro.subjectId ? subjectEvidence(ctx.state, retro.subjectType, retro.subjectId) : null;
  const fields = [];
  if (retro.subjectType === 'other') {
    fields.push({
      name: 'subjectLabel',
      label: 'What is this review about?',
      type: 'text',
      required: true,
      value: retro.subjectLabel || '',
      help: 'The event or piece of work. It is kept even if the underlying record is later deleted.',
    });
  }
  fields.push({ type: 'divider', label: 'The four questions' });
  for (const question of AAR_QUESTIONS) {
    fields.push({
      name: question.key,
      label: question.label,
      type: 'textarea',
      rows: question.key === 'sustain' || question.key === 'improve' ? 2 : 3,
      value: retro[question.key] || '',
      required: question.min > 0,
      help: question.min > 0 ? `${question.help} At least ${question.min} characters.` : question.help,
    });
  }
  fields.push({ type: 'divider', label: 'The record of when' });
  fields.push({
    name: 'heldOn',
    label: 'Review held on',
    type: 'date',
    required: mode === 'hold',
    value: retro.heldOn || today(ctx),
    max: today(ctx),
    min: retro.outcomeOn || undefined,
    help: retro.outcomeOn ? `The event closed on ${retro.outcomeOn}; a review cannot precede it.` : 'When the conversation actually happened.',
  });
  if ((ctx.state.people || []).length) {
    fields.push({
      name: 'participants',
      label: 'Who was in the room',
      type: 'boolean-block',
      value: Array.isArray(retro.participants) ? retro.participants : [],
      options: (ctx.state.people || []).filter((p) => p && p.status !== 'archived').map((p) => ({ value: p.id, label: p.name })),
      help: 'Optional. A review held with the people who did the work is a different review from one held about them.',
    });
  }

  return formDialog({
    title: `After-action review — ${String(retro.subjectLabel || 'record').slice(0, 60)}`,
    description: retro.outcomeOn
      ? `This ${subjectTypeSpec(retro.subjectType)?.label?.toLowerCase() || 'event'} ended on ${retro.outcomeOn}. ${mode === 'hold' ? 'Holding it records what the room concluded, and every committed change becomes real work.' : 'Saving keeps the review open — the cause can wait, the draft cannot be closed without it.'}`
      : 'A review of an event with no closing date is a story, so the date is required.',
    fields,
    size: 'lg',
    submitLabel: mode === 'hold' ? 'Hold the review' : 'Save draft',
    bodyExtra: evidenceBlock(evidence),
    onSubmit: (values, form, close) => {
      const payload = {};
      for (const question of AAR_QUESTIONS) payload[question.key] = values[question.key];
      payload.heldOn = values.heldOn;
      payload.participants = Array.isArray(values['participants[]'])
        ? values['participants[]']
        : Array.isArray(values.participants)
          ? values.participants
          : [];
      if (retro.subjectType === 'other') payload.subjectLabel = values.subjectLabel;
      const result = mode === 'hold'
        ? ctx.api.holdRetro(retro.id, payload)
        : ctx.api.saveRetro(retro.id, payload);
      if (!result || !result.ok) {
        form.setErrors({ [result?.field || 'cause']: result?.error || 'That review could not be saved.' });
        return;
      }
      close();
      const n = Array.isArray(result.propagations) ? result.propagations.length : 0;
      toast(mode === 'hold'
        ? `Review held.${n ? ` ${n} follow-up${n === 1 ? '' : 's'} opened for the committed changes.` : ' Record a lesson to commit a change.'}`
        : 'Draft saved. The review is not held until the cause is written.', 'good');
      if (onSaved) onSaved(result);
      ctx.refresh && ctx.refresh();
    },
  });
}

/** Start a review of a closed record from the queue. */
export function openStartRetroDialog(ctx, { row, onSaved = null }) {
  const retro = {
    id: null,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    subjectLabel: row.label,
    outcomeOn: row.outcomeOn,
    status: 'draft',
  };
  const evidence = subjectEvidence(ctx.state, row.subjectType, row.subjectId);
  return formDialog({
    title: `Start a review — ${String(row.label).slice(0, 60)}`,
    description: `${row.typeLabel} closed ${row.outcomeOn} (${row.outcomeDays ?? row.waitingDays} day(s) ago). The intention and outcome arrive from the frozen record; the why is yours.`,
    size: 'md',
    fields: [
      { type: 'static', wide: true, value: evidenceBlock(evidence) },
      {
        name: 'intended',
        label: AAR_QUESTIONS[0].label,
        type: 'textarea',
        rows: 3,
        required: true,
        value: evidence?.intended || '',
        help: 'Pre-filled from the record. Correct it only if the record is wrong — rewriting it to match the outcome is the exact hindsight this pre-fill exists to prevent.',
      },
      {
        name: 'actual',
        label: AAR_QUESTIONS[1].label,
        type: 'textarea',
        rows: 3,
        required: true,
        value: evidence?.actual || '',
        help: 'What the record shows happened, including what did not happen.',
      },
      {
        name: 'cause',
        label: AAR_QUESTIONS[2].label,
        type: 'textarea',
        rows: 3,
        required: true,
        help: 'The mechanism, not the mood. At least 12 characters.',
      },
    ],
    submitLabel: 'Open the review',
    onSubmit: (values, form, close) => {
      const result = ctx.api.startRetro({
        subjectType: row.subjectType,
        subjectId: row.subjectId,
        outcomeOn: row.outcomeOn,
        intended: values.intended,
        actual: values.actual,
        cause: values.cause,
      });
      if (!result || !result.ok) {
        form.setErrors({ [result?.field || 'cause']: result?.error || 'That review could not be opened.' });
        return;
      }
      close();
      toast('Review opened. Record the lessons, then hold it.', 'good');
      if (onSaved) onSaved(result);
      ctx.refresh && ctx.refresh();
    },
  });
}

/** Start a review of something that is not a record in the workspace. */
export function openAdHocRetroDialog(ctx, { onSaved = null } = {}) {
  return formDialog({
    title: 'Review an event outside the workspace',
    description: 'A team offsite, a conference talk, a failed experiment, a competitor move. It is a review like any other; the workspace simply has no frozen forecast to compare against, so both answers are yours.',
    fields: [
      { name: 'subjectLabel', label: 'What happened', type: 'text', required: true, help: 'The event or piece of work. At least 4 characters.' },
      { name: 'outcomeOn', label: 'When did it end', type: 'date', required: true, value: today(ctx), max: today(ctx) },
      { name: 'intended', label: AAR_QUESTIONS[0].label, type: 'textarea', rows: 2, required: true, help: 'At least 12 characters.' },
      { name: 'actual', label: AAR_QUESTIONS[1].label, type: 'textarea', rows: 2, required: true, help: 'At least 12 characters.' },
      { name: 'cause', label: AAR_QUESTIONS[2].label, type: 'textarea', rows: 2, required: true, help: 'At least 12 characters.' },
    ],
    submitLabel: 'Open the review',
    onSubmit: (values, form, close) => {
      const result = ctx.api.startRetro({
        subjectType: 'other',
        subjectLabel: values.subjectLabel,
        outcomeOn: values.outcomeOn,
        intended: values.intended,
        actual: values.actual,
        cause: values.cause,
      });
      if (!result || !result.ok) {
        form.setErrors({ [result?.field || 'subjectLabel']: result?.error || 'That review could not be opened.' });
        return;
      }
      close();
      toast('Review opened.', 'good');
      if (onSaved) onSaved(result);
      ctx.refresh && ctx.refresh();
    },
  });
}

/**
 * Record a lesson on a held review.
 *
 * The class selector is the load-bearing field: recurrence — the only outcome
 * measure learning has — is counted per class, so a lesson with the wrong class
 * silently breaks the one number that makes this terminal worth opening.
 */
export function openLessonDialog(ctx, { retro, onSaved = null }) {
  const known = new Set((retro.lessons || []).map((lesson) => lesson.class));
  const classOptions = LESSON_CLASS_KEYS.map((key) => {
    const entry = LESSON_CLASSES.find((c) => c.key === key);
    return { value: key, label: `${entry.label}${known.has(key) ? ' — already a lesson in this review' : ''}` };
  });
  const fields = [
    {
      name: 'class',
      label: 'What kind of failure or success was this?',
      type: 'select',
      required: true,
      value: '',
      options: [{ value: '', label: 'Choose a class…' }, ...classOptions],
      help: 'Classes are what make recurrence countable. Choose the system failure mode; "other" is legitimate but cannot ever show a pattern.',
    },
    {
      name: 'text',
      label: 'The lesson',
      type: 'textarea',
      rows: 3,
      required: true,
      help: 'One sentence a new joiner would understand. At least 10 characters.',
    },
    {
      name: 'changeType',
      label: 'What changes as a result?',
      type: 'select',
      required: true,
      value: 'none',
      options: CHANGE_TYPES.map((entry) => ({ value: entry.key, label: `${entry.label} — ${entry.help}` })),
      help: 'An honest "nothing" is a real answer and is stored as an observation. It is counted separately and never counted as learning.',
    },
    {
      name: 'changeNote',
      label: 'What exactly will be different',
      type: 'textarea',
      rows: 2,
      help: 'Required when something changes. Describe the new practice, not the intention to have one.',
    },
    {
      name: 'ownerId',
      label: 'Who owns the change',
      type: 'select',
      options: rosterOptions(ctx, { blank: 'Nobody yet — an unowned change is a wish' }),
      help: 'Required for a change that becomes a delegation. A delegation-type change opens an owned commitment automatically.',
    },
    {
      type: 'static',
      wide: true,
      value: h('div', { class: 'badge-row' },
        badge('RULE-AAR-02 opens the change', 'info'),
        badge('RULE-AAR-03 breaks a silent loop', 'info')),
    },
  ];
  return formDialog({
    title: `Lesson from “${String(retro.subjectLabel || 'the review').slice(0, 50)}”`,
    description: 'A lesson names a system, a decision or a practice. It never names a person — the review is blameless or it is not a review.',
    fields,
    submitLabel: 'Record the lesson',
    onSubmit: (values, form, close) => {
      const result = ctx.api.addLesson(retro.id, {
        class: values.class,
        text: values.text,
        changeType: values.changeType,
        changeNote: values.changeNote,
        ownerId: values.ownerId || null,
      });
      if (!result || !result.ok) {
        form.setErrors({ [result?.field || 'text']: result?.error || 'That lesson could not be recorded.' });
        return;
      }
      close();
      const n = Array.isArray(result.propagations) ? result.propagations.length : 0;
      toast(values.changeType === 'none'
        ? 'Observation recorded. It is counted separately from learning until something changes.'
        : `Change committed.${n ? ' The follow-up was opened automatically.' : ''}`, 'good');
      if (onSaved) onSaved(result);
      ctx.refresh && ctx.refresh();
    },
  });
}

/** Mark a committed change applied, dropped, or reopen it. */
export function openLessonStateDialog(ctx, { retro, lesson, onSaved = null }) {
  const firstOption = lesson.state === 'open' ? 'applied' : 'open';
  return formDialog({
    title: `${firstOption === 'applied' ? 'Close' : 'Reopen'} the change — ${String(lesson.text).slice(0, 50)}`,
    description: `[${lessonClassLabel(lesson.class)}] ${lesson.changeNote || 'No change note was recorded.'}`,
    fields: [
      {
        name: 'state',
        label: 'What happened to the change',
        type: 'select',
        required: true,
        value: firstOption,
        options: [
          { value: 'applied', label: 'Applied — the practice actually changed' },
          { value: 'dropped', label: 'Dropped — we decided not to make it' },
          { value: 'open', label: 'Reopen — it is still to be done' },
        ],
      },
      { name: 'on', label: 'Date', type: 'date', required: true, value: today(ctx), max: today(ctx), min: retro.heldOn || undefined },
      {
        name: 'note',
        label: 'What is now different',
        type: 'textarea',
        rows: 3,
        help: 'Required unless you are reopening. "Done" is not evidence; a sentence describing the new practice is. Closing the related delegation is not evidence either.',
      },
    ],
    submitLabel: 'Record it',
    onSubmit: (values, form, close) => {
      const result = ctx.api.recordLessonState(retro.id, lesson.id, {
        state: values.state,
        on: values.on,
        note: values.note,
      });
      if (!result || !result.ok) {
        form.setErrors({ [result?.field || 'note']: result?.error || 'That could not be recorded.' });
        return;
      }
      close();
      toast(values.state === 'applied'
        ? 'Change marked applied. The recurrence measure reads this, so the honest answer is the valuable one.'
        : values.state === 'dropped' ? 'Change dropped and recorded. An honest drop beats a silent loop.' : 'Change reopened.', 'good');
      if (onSaved) onSaved(result);
      ctx.refresh && ctx.refresh();
    },
  });
}

/** Attach one dated, completed, distinct workspace record as corroboration. */
export function openLessonEvidenceDialog(ctx, { retro, lesson, onSaved = null }) {
  const candidates = lessonEvidenceCandidates(ctx.state, retro, lesson);
  if (!candidates.length) {
    const modal = openModal({
      title: 'No eligible corroborating record yet',
      description: 'LeadOS will only offer a different completed record dated between the review and the claimed application. The event being reviewed, open work, undated work and records outside that window do not qualify. This is a record-presence check, not proof that the change worked or caused an outcome.',
      body: h('p', { class: 'small muted' }, `This lesson was held ${retro.heldOn || '—'} and marked applied ${lesson.appliedOn || '—'}. Create or complete a relevant workspace record in that period, then return here.`),
      footer: [h('button', { class: 'btn btn-primary', type: 'button', onClick: () => modal.close() }, 'Close')],
    });
    return null;
  }
  return formDialog({
    title: `Corroborate the applied lesson`,
    description: 'Choose a separate completed workspace artifact whose dated record sits between the review and the claimed application. LeadOS rechecks its status and snapshot when rendering; later edits make this link stale. A record link is not external verification, practice-quality assessment or proof of causal impact.',
    fields: [
      { name: 'sourceKey', label: 'Completed record', type: 'select', required: true,
        options: candidates.map((item) => ({ value: item.key, label: item.label })) },
      { name: 'note', label: 'What does this record corroborate?', type: 'textarea', rows: 3, required: true,
        help: 'At least 15 characters. State the specific practice or step the artifact shows; do not claim it caused a business outcome.' },
    ],
    submitLabel: 'Attach corroborating record',
    onSubmit: (values, form, close) => {
      const result = ctx.api.recordLessonEvidence(retro.id, lesson.id, { sourceKey: values.sourceKey, note: values.note });
      if (!result || !result.ok) {
        form.setErrors({ [result?.field || 'sourceKey']: result?.error || 'That record could not be attached.' });
        return;
      }
      close();
      const n = Array.isArray(result.propagations) ? result.propagations.length : 0;
      toast(`Record attached.${n ? ' A 30-day practice-persistence check was opened automatically.' : ''}`, 'good');
      if (onSaved) onSaved(result);
      ctx.refresh && ctx.refresh();
    },
  });
}

/** Skip a review, deliberately and with a reason. */
export function openSkipRetroDialog(ctx, { retro, onSaved = null }) {
  return formDialog({
    title: `Skip the review of “${String(retro.subjectLabel || 'this record').slice(0, 60)}”`,
    description: 'A skip is not a gap — it is a dated decision that this closure did not merit a review. It is counted separately from a held review in every rate.',
    fields: [
      { name: 'reason', label: 'Why does this not need a review', type: 'textarea', rows: 3, required: true, help: 'At least 10 characters. A silent skip is indistinguishable from forgetting.' },
    ],
    submitLabel: 'Skip the review',
    onSubmit: (values, form, close) => {
      const result = ctx.api.skipRetro(retro.id, { reason: values.reason });
      if (!result || !result.ok) {
        form.setErrors({ reason: result?.error || 'That could not be recorded.' });
        return;
      }
      close();
      toast('Review skipped, with the reason on the record.', 'good');
      if (onSaved) onSaved(result);
      ctx.refresh && ctx.refresh();
    },
  });
}

/** Annotate a held review — what happened after the room. */
export function openAnnotateRetroDialog(ctx, { retro, onSaved = null }) {
  return formDialog({
    title: `Annotate — ${String(retro.subjectLabel || 'review').slice(0, 60)}`,
    description: 'A held review is history and is not rewritten. This appends a dated note to the “what will we do differently” answer, which is where a leader records what happened next.',
    fields: [
      { name: 'note', label: 'Note', type: 'textarea', rows: 3, required: true, help: 'At least 5 characters. Appended, never replacing what the room concluded.' },
    ],
    submitLabel: 'Add the note',
    onSubmit: (values, form, close) => {
      const result = ctx.api.annotateRetro(retro.id, { note: values.note });
      if (!result || !result.ok) {
        form.setErrors({ note: result?.error || 'That note could not be saved.' });
        return;
      }
      close();
      toast('Note appended to the review.', 'good');
      if (onSaved) onSaved(result);
      ctx.refresh && ctx.refresh();
    },
  });
}

export function openLearningConventionsDialog(ctx, { onSaved = null } = {}) {
  const settings = ctx.state.settings || {};
  return formDialog({
    title: 'Learning conventions',
    description: 'Management conventions this workspace owns, not laws. They decide when a review is late, when coverage is called out, and whether the app drafts a review the moment work closes.',
    fields: [
      {
        name: 'windowDays',
        label: 'Review window (days)',
        type: 'number',
        min: 14,
        max: 365,
        step: 1,
        value: settings.retroWindowDays ?? 90,
        help: 'Which closures are counted in coverage and latency. A closure older than the window is history, not a missed review.',
      },
      {
        name: 'dueDays',
        label: 'Days after a close before a review is late',
        type: 'number',
        min: 1,
        max: 60,
        step: 1,
        value: settings.retroDueDays ?? 14,
        help: 'Reviewing a hot incident the same day and a long delivery at its retro both make sense; this is the point at which the app stops being patient.',
      },
      {
        name: 'coverageFloorPct',
        label: 'Coverage below which signals fire (%)',
        type: 'number',
        min: 10,
        max: 100,
        step: 5,
        value: settings.learningCoverageFloorPct ?? 60,
      },
      {
        name: 'autoDraft',
        label: 'Draft a review when work closes',
        type: 'checkbox',
        value: settings.learningAutoDraft !== false,
        help: 'Writes one empty review with the intention and outcome pre-filled from the frozen record. It never writes the cause, never records a lesson and never opens a decision. Off: the queue still lists every closure.',
      },
      {
        name: 'autoPropagate',
        label: 'Open the follow-ups a held review commits',
        type: 'checkbox',
        value: settings.learningAutoPropagate !== false,
        help: 'On: a committed delegation-type change opens an owned delegation, a decision-type change opens a DACI decision, and a repeated class opens one close-or-drop decision. Off: the ledger still measures everything; nothing is opened.',
      },
      {
        type: 'static',
        wide: true,
        value: h('div', { class: 'badge-row' },
          badge('RULE-AAR-01 draft from the closing record', 'info'),
          badge('RULE-AAR-02 commit the change', 'info'),
          badge('RULE-AAR-03 close or drop a recurring class', 'info')),
      },
    ],
    submitLabel: 'Save conventions',
    onSubmit: (values, form, close) => {
      const result = ctx.api.updateLearningPolicy({
        windowDays: Number(values.windowDays),
        dueDays: Number(values.dueDays),
        coverageFloorPct: Number(values.coverageFloorPct),
        autoDraft: Boolean(values.autoDraft),
        autoPropagate: Boolean(values.autoPropagate),
      });
      if (!result || !result.ok) {
        form.setErrors({ [result?.field || 'windowDays']: result?.error || 'Those conventions could not be saved.' });
        return;
      }
      close();
      toast('Learning conventions saved.', 'good');
      if (onSaved) onSaved(result);
      ctx.refresh && ctx.refresh();
    },
  });
}
