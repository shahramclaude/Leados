/**
 * app/ui/performance-modals.js — the dialogs of the Performance Recovery
 * terminal (Schema v62).
 *
 * Seven dialogs, each changing exactly one kind of record:
 *
 *   openConcernDialog           declare or edit the gap and the analysis answers
 *   openObservationDialog       add one dated, specific instance
 *   openConversationDialog      record (or refuse to record) a conversation
 *   openSupportDialog           record what was actually changed to help
 *   openAdoptPlanDialog         objectives, a review date and a frozen probability
 *   openReviewPlanDialog        met / partial / not met, once
 *   openWithdrawConcernDialog   close the concern with a written reason
 *
 * Two design rules run through all of them. First, the app refuses to save a
 * record it cannot audit — no separate "reason" field is invented to paper over
 * the refusal. Second, an override is written, stored verbatim and shown
 * beside the plan for as long as the record exists; it is not a checkbox.
 */

import { h, toast, openModal } from './dom.js';
import {
  ANSWER_KEYS,
  CONVERSATION_KINDS,
  CONVERSATION_KIND_LABELS,
  EXPECTATION_SOURCES,
  EXPECTATION_SOURCE_LABELS,
  OBSERVATION_SOURCES,
  OBSERVATION_SOURCE_LABELS,
  SUPPORT_KINDS,
  SUPPORT_KIND_LABELS,
} from '../core/domain/performanceSchema.js';
import { assessConcern } from '../core/domain/performance.js';
import { validateSBI } from '../core/domain/feedback.js';
import { addDays, dayKey } from '../core/time.js';

const QUESTIONS = [
  ['couldDoIfTried', 'Could they do it if their life depended on it?', 'A “no” points at skill or knowledge; a “yes” points at something in the system.'],
  ['knowsWhat', 'Do they know exactly what “good” looks like?', 'If not, the gap may be in the instruction rather than the person.'],
  ['knowsWhen', 'Do they know when it is due?', 'Deadlines nobody stated are not deadlines.'],
  ['obstacle', 'Is something or someone in the way?', 'A blocked path is not a performance problem.'],
  ['consequenceMissing', 'Does good performance here bring no visible consequence — or cost them?', 'Incentives explain more behaviour than effort does.'],
  ['capacity', 'Are they out of time given everything else they own?', 'This is a portfolio question before it is a performance question.'],
  ['feedbackLoop', 'Have they had usable feedback close enough to the event to act on?', 'People cannot correct what they were never shown.'],
];

function activePeople(ctx) {
  return (ctx.state.people || []).filter((person) => person && person.status !== 'archived');
}

function field(id, label, control, hint = null) {
  return h('div', { class: 'stack-xs' },
    h('label', { for: id }, label),
    control,
    hint ? h('span', { class: 'muted small' }, hint) : null);
}

function triSelect(id, value) {
  return h('select', { id },
    h('option', { value: '', selected: value === null || value === undefined }, 'Unanswered'),
    h('option', { value: 'true', selected: value === true }, 'Yes'),
    h('option', { value: 'false', selected: value === false }, 'No'));
}

/* ------------------------------------------------------------- the concern */

export function openConcernDialog(ctx, existing = null) {
  const people = activePeople(ctx);
  if (!existing && !people.length) {
    toast('Add a team member first. A concern about nobody is not a record.', 'caution');
    return;
  }
  const person = h('select', { id: 'perf-person', required: true },
    ...(existing ? [] : [h('option', { value: '' }, 'Choose a team member…')]),
    ...people.map((p) => h('option', { value: p.id, selected: existing?.personId === p.id }, p.role ? `${p.name} — ${p.role}` : p.name)));
  const label = h('input', { id: 'perf-label', type: 'text', maxlength: '200', required: true, value: existing?.label || '' });
  const expectation = h('textarea', { id: 'perf-expectation', rows: '3', maxlength: '1200', value: existing?.standard?.expectation || '' });
  const source = h('select', { id: 'perf-source' },
    ...EXPECTATION_SOURCES.map((key) => h('option', { value: key, selected: (existing?.standard?.source || 'verbal') === key }, EXPECTATION_SOURCE_LABELS[key])));
  const recordedOn = h('input', { id: 'perf-recorded-on', type: 'date', value: existing?.standard?.recordedOn || '' });
  const observed = h('textarea', { id: 'perf-observed', rows: '3', maxlength: '1200', value: existing?.gap?.observed || '' });
  const impact = h('textarea', { id: 'perf-impact', rows: '2', maxlength: '1200', value: existing?.gap?.impact || '' });
  const gapShare = h('input', { id: 'perf-gap-share', type: 'number', min: '0', max: '100', step: '1', value: existing?.gap?.gapSharePct ?? '' });
  const hours = h('input', { id: 'perf-team-hours', type: 'number', min: '0', max: '168', step: '0.5', value: existing?.gap?.teamHoursPerWeek ?? '' });
  const currency = h('input', { id: 'perf-currency', type: 'text', maxlength: '3', pattern: '[A-Za-z]{3}', value: existing?.gap?.currency || 'USD' });
  const answerControls = QUESTIONS.map(([key, text, hint]) => ({
    key,
    control: triSelect(`perf-answer-${key}`, existing?.answers?.[key] ?? null),
    text,
    hint,
  }));

  const dialog = openModal({
    title: existing ? 'Edit the concern' : 'Open a performance concern',
    description: 'A concern is your own record of a gap and the process you ran about it. It never rates the person, and nothing here is shared automatically.',
    size: 'lg',
    body: h('div', { class: 'view-stack' }, [
      h('div', { class: 'form-grid' }, [
        field('perf-person', 'Who is this about?', person),
        field('perf-label', 'Name the concern in plain language', label, '“Handover notes arriving late” — not “attitude problem”.'),
      ]),
      h('div', { class: 'stack-xs' },
        field('perf-expectation', 'What was expected of them?', expectation, 'Specific and observable. If you cannot write it, it was probably never stated.'),
        h('div', { class: 'form-grid' }, [
          field('perf-source', 'Where was it recorded?', source),
          field('perf-recorded-on', 'The date you communicated it', recordedOn, 'The notice test compares this date with the first observation.'),
        ])),
      h('div', { class: 'stack-xs' },
        field('perf-observed', 'What did you actually observe?', observed, 'Behaviour, not character. What could someone have filmed?'),
        field('perf-impact', 'What changed as a result?', impact)),
      h('div', { class: 'form-grid' }, [
        field('perf-gap-share', 'Share of expected output missing (%)', gapShare, 'Used only to price the carrying cost. Leave blank and the gap stays unpriced.'),
        field('perf-team-hours', 'Team hours absorbed per week', hours),
        field('perf-currency', 'Currency', currency),
      ]),
      h('h3', { class: 'subhead' }, 'The analysis questions'),
      h('p', { class: 'muted small' }, 'Answer from what you have seen. “Unanswered” is honest; a guess is not. The diagnosis stays unnamed until enough are answered.'),
      ...answerControls.map(({ key, control, text, hint }) => h('div', { class: 'stack-xs' },
        field(`perf-answer-${key}`, text, control, hint))),
    ]),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const answers = {};
          for (const { key, control } of answerControls) {
            answers[key] = control.value === 'true' ? true : control.value === 'false' ? false : null;
          }
          const payload = {
            personId: person.value,
            label: label.value,
            expectation: expectation.value,
            source: source.value,
            recordedOn: recordedOn.value || null,
            observed: observed.value,
            impact: impact.value,
            gapSharePct: gapShare.value === '' ? null : Number(gapShare.value),
            teamHoursPerWeek: hours.value === '' ? null : Number(hours.value),
            currency: currency.value.toUpperCase(),
            answers,
          };
          const result = existing
            ? ctx.api.updatePerformanceConcern(existing.id, payload)
            : ctx.api.addPerformanceConcern(payload);
          if (!result.ok) { toast(result.error, 'bad'); return; }
          dialog.close();
          toast(existing ? 'Concern updated. The audit re-ran against the new record.' : 'Concern opened. The audit shows exactly what is still missing.', 'good');
          ctx.navigate(`#/performance?panel=evidence&concern=${encodeURIComponent(existing ? existing.id : result.id)}`);
        },
      }, existing ? 'Save changes' : 'Open the concern'),
    ],
  });
}

/* ------------------------------------------------------------ observation */

export function openObservationDialog(ctx, concern) {
  const date = h('input', { id: 'perf-obs-date', type: 'date', value: dayKey(ctx.now), max: dayKey(ctx.now), required: true });
  const source = h('select', { id: 'perf-obs-source' },
    ...OBSERVATION_SOURCES.map((key) => h('option', { value: key }, OBSERVATION_SOURCE_LABELS[key])));
  const situation = h('textarea', { id: 'perf-obs-situation', rows: '2', maxlength: '600' });
  const behavior = h('textarea', { id: 'perf-obs-behavior', rows: '3', maxlength: '900', required: true });
  const impact = h('textarea', { id: 'perf-obs-impact', rows: '2', maxlength: '600' });
  const note = h('textarea', { id: 'perf-obs-note', rows: '2', maxlength: '600' });
  const quality = h('p', { class: 'muted small', 'aria-live': 'polite' }, 'Specificity: 0/4. Fill all three fields with enough detail for the person to recognise the moment.');

  const refresh = () => {
    const check = validateSBI({ situation: situation.value, behavior: behavior.value, impact: impact.value });
    const tips = check.tips.length ? ` ${check.tips.join(' ')}` : '';
    quality.textContent = `Specificity: ${check.quality}/4. ${check.missing.length ? `Missing: ${check.missing.join(', ')}.` : check.quality === 4 ? 'Specific and repeatable.' : 'Add detail until it is answerable.'}${tips}`;
  };
  for (const control of [situation, behavior, impact]) control.addEventListener('input', refresh);

  const dialog = openModal({
    title: 'Add a dated observation',
    description: 'One instance, with a date. A pattern is several of these, not a feeling about one.',
    size: 'lg',
    body: h('div', { class: 'view-stack' }, [
      h('div', { class: 'form-grid' }, [
        field('perf-obs-date', 'When did it happen?', date),
        field('perf-obs-source', 'How do you know?', source),
      ]),
      field('perf-obs-situation', 'Situation — where, when, who was there', situation),
      field('perf-obs-behavior', 'Behaviour — what they did, observably', behavior),
      field('perf-obs-impact', 'Impact — what changed as a result', impact),
      field('perf-obs-note', 'Anything else worth keeping', note),
      quality,
    ]),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const result = ctx.api.addPerformanceObservation(concern.id, {
            date: date.value,
            source: source.value,
            situation: situation.value,
            behavior: behavior.value,
            impact: impact.value,
            note: note.value,
          });
          if (!result.ok) { toast(result.error, 'bad'); return; }
          dialog.close();
          toast('Observation recorded. The audit counted it.', 'good');
          ctx.navigate(`#/performance?panel=evidence&concern=${encodeURIComponent(concern.id)}`);
        },
      }, 'Record the observation'),
    ],
  });
  refresh();
}

/* ----------------------------------------------------------- conversation */

export function openConversationDialog(ctx, concern) {
  const date = h('input', { id: 'perf-conv-date', type: 'date', value: dayKey(ctx.now), max: dayKey(ctx.now), required: true });
  const kind = h('select', { id: 'perf-conv-kind' },
    ...CONVERSATION_KINDS.map((key) => h('option', { value: key }, CONVERSATION_KIND_LABELS[key])));
  const note = h('textarea', { id: 'perf-conv-note', rows: '5', maxlength: '900' });
  const dialog = openModal({
    title: 'Record the conversation',
    description: 'A two-way conversation is one where they spoke too. Write what they said in their words — a summary of your own position does not satisfy the voice test.',
    body: h('div', { class: 'view-stack' }, [
      h('div', { class: 'form-grid' }, [field('perf-conv-date', 'When?', date), field('perf-conv-kind', 'What kind?', kind)]),
      field('perf-conv-note', 'What did they say?', note, 'Ask before telling: what do you see, what is in the way, what would help?'),
    ]),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const result = ctx.api.recordPerformanceConversation(concern.id, { date: date.value, kind: kind.value, note: note.value });
          if (!result.ok) { toast(result.error, 'bad'); return; }
          dialog.close();
          toast('Conversation recorded.', 'good');
          ctx.navigate(`#/performance?panel=evidence&concern=${encodeURIComponent(concern.id)}`);
        },
      }, 'Record it'),
    ],
  });
}

/* ---------------------------------------------------------------- support */

export function openSupportDialog(ctx, concern) {
  const assessment = assessConcern(ctx.state, concern, ctx.now, ctx.state.settings || {});
  const expected = assessment.diagnosis.expectedSupport || [];
  const date = h('input', { id: 'perf-supp-date', type: 'date', value: dayKey(ctx.now), max: dayKey(ctx.now), required: true });
  const kind = h('select', { id: 'perf-supp-kind' },
    ...SUPPORT_KINDS.map((key) => h('option', {
      value: key,
      selected: expected.length && expected.includes(key),
    }, SUPPORT_KIND_LABELS[key])));
  const note = h('textarea', { id: 'perf-supp-note', rows: '4', maxlength: '900' });
  const dialog = openModal({
    title: 'Record support provided',
    description: expected.length
      ? `This cause implies: ${expected.map((k) => SUPPORT_KIND_LABELS[k] || k).join(', ')}. The default is the matching remedy, not the easiest one.`
      : 'Record what you actually changed to make the expectation achievable.',
    body: h('div', { class: 'view-stack' }, [
      assessment.support.status === 'mismatch'
        ? h('div', { class: 'banner banner-caution', role: 'status' },
            h('div', { class: 'banner-text' },
              h('strong', null, 'The support on record does not match the diagnosis.'),
              h('p', null, assessment.support.detail)))
        : null,
      h('div', { class: 'form-grid' }, [field('perf-supp-date', 'When?', date), field('perf-supp-kind', 'What did you provide?', kind)]),
      field('perf-supp-note', 'What exactly changed?', note, '“Moved the Friday rota off them for four weeks” is support. “Told them to prioritise” is not.'),
    ]),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const result = ctx.api.recordPerformanceSupport(concern.id, { date: date.value, kind: kind.value, note: note.value });
          if (!result.ok) { toast(result.error, 'bad'); return; }
          dialog.close();
          toast('Support recorded. It now counts in the audit.', 'good');
          ctx.navigate(`#/performance?panel=evidence&concern=${encodeURIComponent(concern.id)}`);
        },
      }, 'Record support'),
    ],
  });
}

/* ------------------------------------------------------------------- plan */

export function openAdoptPlanDialog(ctx, concern) {
  const assessment = assessConcern(ctx.state, concern, ctx.now, ctx.state.settings || {});
  const objectives = [{ text: '', measure: '', byWhen: '' }];
  const list = h('div', { class: 'stack-sm' });
  const reviewOn = h('input', { id: 'perf-plan-review', type: 'date', required: true, min: addDays(ctx.now, 1), value: addDays(ctx.now, 45) });
  const probability = h('input', { id: 'perf-plan-probability', type: 'number', min: '5', max: '95', step: '5', required: true, value: '60' });
  const cadence = h('input', { id: 'perf-plan-cadence', type: 'number', min: '1', max: '90', value: '14' });
  const override = h('textarea', { id: 'perf-plan-override', rows: '3', maxlength: '1200' });

  const renderRows = () => {
    list.replaceChildren(...objectives.map((row, index) => {
      const text = h('input', { id: `perf-obj-text-${index}`, type: 'text', maxlength: '500', value: row.text, placeholder: 'Specific objective' });
      const measure = h('input', { id: `perf-obj-measure-${index}`, type: 'text', maxlength: '500', value: row.measure, placeholder: 'How it is measured' });
      const byWhen = h('input', { id: `perf-obj-when-${index}`, type: 'date', value: row.byWhen });
      text.addEventListener('input', () => { row.text = text.value; });
      measure.addEventListener('input', () => { row.measure = measure.value; });
      byWhen.addEventListener('input', () => { row.byWhen = byWhen.value; });
      return h('div', { class: 'form-grid' }, [
        field(`perf-obj-text-${index}`, `Objective ${index + 1}`, text),
        field(`perf-obj-measure-${index}`, 'Measure', measure),
        field(`perf-obj-when-${index}`, 'By when', byWhen),
      ]);
    }));
  };
  renderRows();

  const addRow = h('button', {
    class: 'btn btn-small btn-ghost',
    type: 'button',
    onClick: () => {
      if (objectives.length >= 4) { toast('Four objectives is the ceiling. A plan nobody can hold in their head is not a plan.', 'caution'); return; }
      objectives.push({ text: '', measure: '', byWhen: '' });
      renderRows();
    },
  }, 'Add an objective');

  const dialog = openModal({
    title: 'Adopt a recovery plan',
    description: 'A plan is specific, measurable and time-bounded, and it names the support it depends on. Your probability is frozen the moment you save it.',
    size: 'lg',
    body: h('div', { class: 'view-stack' }, [
      assessment.canFormalPlan
        ? h('div', { class: 'banner banner-good', role: 'status' }, h('div', { class: 'banner-text' },
            h('strong', null, 'The record supports a formal plan.'),
            h('p', null, 'Every due-process rule is met. A plan is still a choice, not an obligation — a clear conversation is sometimes the better instrument.')))
        : h('div', { class: 'banner banner-caution', role: 'status' }, h('div', { class: 'banner-text' },
            h('strong', null, `${assessment.blockers.length} due-process gap(s) remain.`),
            h('p', null, assessment.justice.verdict),
            h('ul', null, ...assessment.blockers.map((b) => h('li', null, `${b.label}: ${b.detail}`))))),
      list,
      addRow,
      h('div', { class: 'form-grid' }, [
        field('perf-plan-review', 'Review date', reviewOn, 'The date the frozen prediction is scored. It must be in the future.'),
        field('perf-plan-probability', 'Your probability the plan meets the expectation (%)', probability, 'Between 5% and 95%. 0% and 100% are not probabilities anyone can defend.'),
        field('perf-plan-cadence', 'Check-in cadence (days)', cadence),
      ]),
      assessment.canFormalPlan ? null : h('div', { class: 'stack-xs' },
        h('label', { for: 'perf-plan-override' }, 'Or record a written override'),
        override,
        h('span', { class: 'muted small' }, 'At least 40 characters. This is stored verbatim, shown beside the plan for as long as the record exists, and cannot be edited away. Use it when you hold evidence the app cannot see.')),
    ]),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const result = ctx.api.adoptPerformancePlan(concern.id, {
            objectives: objectives.filter((row) => row.text.trim()),
            reviewOn: reviewOn.value,
            probabilityPct: Number(probability.value),
            cadenceDays: Number(cadence.value),
            overrideReason: assessment.canFormalPlan ? '' : override.value,
          });
          if (!result.ok) { toast(result.error, 'bad'); return; }
          dialog.close();
          toast('Plan adopted. The support decision and the review task were opened with it.', 'good');
          ctx.navigate(`#/performance?panel=plan&concern=${encodeURIComponent(concern.id)}`);
        },
      }, 'Adopt and freeze the prediction'),
    ],
  });
}

/* ----------------------------------------------------------------- review */

const VERDICTS = [
  ['met', 'Met the expectation', 'The objective was achieved as written, on time.'],
  ['partial', 'Partially met', 'Some movement, not the whole objective.'],
  ['not-met', 'Not met', 'The objective was not achieved. This opens a question about the process, never a recommendation about the person.'],
];

export function openReviewPlanDialog(ctx, concern) {
  const reviewedOn = h('input', { id: 'perf-review-date', type: 'date', value: dayKey(ctx.now), max: dayKey(ctx.now), required: true });
  const verdict = h('select', { id: 'perf-review-verdict' },
    ...VERDICTS.map(([key, label]) => h('option', { value: key }, label)));
  const notes = h('textarea', { id: 'perf-review-notes', rows: '4', maxlength: '1500' });
  const dialog = openModal({
    title: 'Record the review',
    description: 'This scores the probability you froze at adoption. It can be recorded once and is never rewritten.',
    body: h('div', { class: 'view-stack' }, [
      h('div', { class: 'form-grid' }, [
        field('perf-review-date', 'When was the review?', reviewedOn),
        field('perf-review-verdict', 'What actually happened?', verdict),
      ]),
      h('div', { class: 'stack-xs' },
        h('label', { for: 'perf-review-notes' }, 'What is the evidence for that verdict?'),
        notes,
        h('span', { class: 'muted small' }, 'Against the plan’s own measures, not against how it felt.')),
      ...VERDICTS.map(([key, label, detail]) => h('p', { class: 'muted small' }, `${label}: ${detail}`)),
    ]),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const result = ctx.api.reviewPerformancePlan(concern.id, {
            reviewedOn: reviewedOn.value,
            verdict: verdict.value,
            notes: notes.value,
          });
          if (!result.ok) { toast(result.error, 'bad'); return; }
          dialog.close();
          toast(verdict.value === 'not-met'
            ? 'Review recorded. One decision about the next process step was opened.'
            : 'Review recorded. The frozen prediction has been scored.', 'good');
          ctx.navigate(`#/performance?panel=plan&concern=${encodeURIComponent(concern.id)}`);
        },
      }, 'Record the review'),
    ],
  });
}

/* --------------------------------------------------------------- withdraw */

export function openWithdrawConcernDialog(ctx, concern) {
  const reason = h('textarea', { id: 'perf-withdraw-reason', rows: '3', maxlength: '900', required: true });
  const dialog = openModal({
    title: 'Withdraw this concern',
    description: 'Withdrawing is a legitimate outcome — gaps close, roles change, the leader was wrong. It is recorded with a reason instead of being deleted. A concern that already has a plan cannot be withdrawn into silence.',
    body: field('perf-withdraw-reason', 'Why are you withdrawing it?', reason, 'At least ten characters. “The gap closed when the rota changed” is a reason.'),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-danger',
        type: 'button',
        onClick: () => {
          const result = ctx.api.withdrawPerformanceConcern(concern.id, { reason: reason.value });
          if (!result.ok) { toast(result.error, 'bad'); return; }
          dialog.close();
          toast('Concern withdrawn with its reason kept.', 'good');
          ctx.navigate('#/performance?panel=concerns');
        },
      }, 'Withdraw the concern'),
    ],
  });
}

export { ANSWER_KEYS };
