/**
 * app/ui/hiring-modals.js — Selection & hiring capture dialogs.
 *
 *  - `openRequisitionDialog`  — define a role, its competencies, its
 *    interviewers and (optionally) the interview effort it will consume.
 *  - `openCandidateDialog`    — add or edit a candidate in the process.
 *  - `openEvidenceDialog`     — record one piece of evidence, with a live
 *    posterior readout so the leader can see what the observation does to the
 *    estimate before saving it.
 *  - `openHiringDecisionDialog` — advance, hold, offer or reject, with the
 *    evidence gaps and the "what would change my mind" test on screen.
 *  - `openAcceptOfferDialog`  — the handoff that creates the roster record and
 *    the 30-60-90 plan in one step.
 *
 * Every dialog validates through the action layer; the dialog never writes to
 * the store directly.
 */

import { h, openModal, buildForm, toast } from './dom.js';
import { personOptions } from './options.js';
import { addDays, dayKey, formatDate } from '../core/time.js';
import {
  CANDIDATE_OUTCOMES,
  CANDIDATE_OUTCOME_LABELS,
  CANDIDATE_STAGE_LABELS,
  EVIDENCE_KINDS,
  EVIDENCE_KIND_BY_ID,
  EVIDENCE_RATING_ANCHORS,
  REQUISITION_REASONS,
  REQUISITION_REASON_LABELS,
  REQUISITION_STATUSES,
  REQUISITION_STATUS_LABELS,
  assessCandidate,
  suggestedEffortDays,
} from '../core/domain/hiring.js';
import { LEVEL_LABELS, LEVELS } from '../core/schema.js';
import { previewHiringPropagations } from '../core/domain/automation.js';

function competencyText(requisition) {
  return (requisition?.competencies || [])
    .map((c) => `${c.name} | ${c.weight}${c.required === false ? ' | optional' : ''}`)
    .join('\n');
}

function pctLabel(value) {
  return value === null || value === undefined ? 'not measured' : `${value}%`;
}

/** Shared footer: the buttons live outside <form>, so they call submit directly. */
function modalFooter(form, { submitLabel = 'Save', onClose } = {}) {
  const cancelBtn = h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => onClose() }, 'Cancel');
  const submitBtn = h('button', { class: 'btn btn-primary', type: 'button', onClick: () => form.__submit() }, submitLabel);
  form.node.addEventListener('submit', (event) => {
    event.preventDefault();
    form.__submit();
  });
  return [cancelBtn, submitBtn];
}

function dialog({ title, description, fields, submitLabel, size = 'md', onSubmit, extraBody = null }) {
  const form = buildForm(fields);
  let closeFn = () => {};
  form.__submit = () => {
    form.clearErrors();
    const result = onSubmit(form.getValues(), form);
    if (result && result.ok === false) {
      if (result.field) form.setFieldError(result.field, result.error);
      toast(result.error, 'bad');
      return;
    }
    closeFn();
  };
  const body = extraBody ? h('div', { class: 'stack-sm' }, extraBody, form.node) : form.node;
  const modal = openModal({
    title,
    description,
    body,
    footer: modalFooter(form, { submitLabel, onClose: () => closeFn() }),
    size,
    onClose: () => form.clearErrors(),
  });
  closeFn = modal.close;
  return { modal, form };
}

/* ----------------------------------------------------------- requisition */

export function openRequisitionDialog(ctx, { requisition = null } = {}) {
  const isEdit = Boolean(requisition);
  const todayStr = dayKey(ctx.now);
  const settings = ctx.state.settings || {};
  const candidates = (ctx.state.candidates || []).filter((c) => c.reqId === requisition?.id);
  const suggestion = requisition ? suggestedEffortDays(requisition, candidates, { settings }) : { measured: false };

  const preview = previewHiringPropagations(
    {
      id: requisition?.id,
      status: requisition?.status || 'open',
      effortDays: {
        optimistic: requisition?.effortDays?.optimistic || 0,
        mostLikely: requisition?.effortDays?.mostLikely || 0,
        pessimistic: requisition?.effortDays?.pessimistic || 0,
      },
    },
    ctx.state,
  );

  const fields = [
    { name: 'title', label: 'Role', required: true, wide: true, value: requisition?.title || '', placeholder: 'Senior backend engineer — billing platform' },
    {
      name: 'level',
      label: 'Level',
      type: 'select',
      value: requisition?.level || 'ic',
      options: LEVELS.map((value) => ({ value, label: LEVEL_LABELS[value] })),
    },
    {
      name: 'reason',
      label: 'Why this role exists',
      type: 'select',
      value: requisition?.reason || 'growth',
      options: REQUISITION_REASONS.map((value) => ({ value, label: REQUISITION_REASON_LABELS[value] })),
      help: 'A backfill and a growth role fail differently: a backfill transfers existing load, growth adds scope that has never been done.',
    },
    { name: 'team', label: 'Team', value: requisition?.team || settings.teamName || '' },
    {
      name: 'status',
      label: 'Status',
      type: 'select',
      value: requisition?.status || 'open',
      options: REQUISITION_STATUSES.map((value) => ({ value, label: REQUISITION_STATUS_LABELS[value] })),
      help: 'Filled completes the interview reserve as delivered; on hold and cancelled release it back to the plan.',
    },
    { name: 'openedOn', label: 'Opened on', type: 'date', value: requisition?.openedOn || todayStr },
    {
      name: 'targetStartOn',
      label: 'Target start',
      type: 'date',
      value: requisition?.targetStartOn || '',
      help: 'What the plan assumes. A gap between this and the fill date is a capacity problem the team absorbs silently if nobody records it.',
    },
    {
      name: 'competencies',
      label: 'What this role must be able to do',
      type: 'textarea',
      rows: 5,
      wide: true,
      required: true,
      value: competencyText(requisition),
      placeholder: 'Designs idempotent billing workflows | 4\nExplains tradeoffs to non-engineers | 3 | optional',
      help: 'One per line: “Name”, “Name | weight 1–5”, or “Name | weight | optional”. Every candidate is assessed against the same list — that is what makes the process structured and defensible.',
    },
    {
      name: 'interviewers',
      label: 'Who will interview',
      type: 'boolean-block',
      wide: true,
      value: requisition?.interviewers || [],
      options: personOptions(ctx.state).map((p) => ({ value: p.value, label: p.label })),
      help: 'Their time is what the capacity plan reserves, and one interviewer alone cannot provide independent evidence.',
    },
    {
      name: 'dailyVacancyCost',
      label: 'Cost of the seat being empty (per day)',
      type: 'number',
      min: 0,
      value: requisition?.dailyVacancyCost ?? '',
      help: 'Optional, in whole currency units. Only what you can justify — for example the gross margin the seat would generate per working day. Left blank, delay stays unpriced instead of guessed.',
    },
    { name: 'currency', label: 'Currency', value: requisition?.currency || 'USD' },
    { type: 'divider', label: 'Interview effort (capacity plan)' },
    {
      name: 'effortOptimistic',
      label: 'Effort — optimistic (person-days)',
      type: 'number',
      min: 0,
      step: '0.1',
      value: requisition?.effortDays?.optimistic ?? '',
    },
    {
      name: 'effortMostLikely',
      label: 'Effort — most likely',
      type: 'number',
      min: 0,
      step: '0.1',
      value: requisition?.effortDays?.mostLikely ?? '',
      help: suggestion.measured
        ? `Suggestion from the current pipeline: ≈${suggestion.mostLikely} day(s) (${suggestion.basis}). It is a suggestion only — nothing is reserved unless you enter it.`
        : 'No active candidates yet, so there is nothing to estimate from. Blank reserves nothing; the plan will not guess.',
    },
    {
      name: 'effortPessimistic',
      label: 'Effort — pessimistic',
      type: 'number',
      min: 0,
      step: '0.1',
      value: requisition?.effortDays?.pessimistic ?? '',
    },
    { name: 'notes', label: 'Notes', type: 'textarea', wide: true, value: requisition?.notes || '' },
  ];

  return dialog({
    title: isEdit ? `Edit ${requisition.title}` : 'Open a role',
    description: isEdit
      ? 'Changes are logged. Editing the competencies keeps existing evidence attached to the same names.'
      : 'A requisition is a decision to spend the team’s interview capacity on a seat. Define what the role must do before you meet anyone.',
    fields,
    submitLabel: isEdit ? 'Save role' : 'Open role',
    size: 'lg',
    extraBody: h(
      'div',
      { class: 'banner banner-info', role: 'status' },
      h('strong', null, 'What saving will propagate'),
      preview.length
        ? h('ul', { class: 'list-tight' }, ...preview.map((line) => h('li', null, line)))
        : h('p', null, 'Nothing yet: add an effort estimate to reserve capacity for interviews.'),
    ),
    onSubmit: (values) => {
      const payload = {
        ...values,
        interviewers: Array.isArray(values.interviewers) ? values.interviewers : [],
      };
      return isEdit ? ctx.api.updateRequisition(requisition.id, payload) : ctx.api.addRequisition(payload);
    },
  });
}

/* -------------------------------------------------------------- candidate */

export function openCandidateDialog(ctx, { requisition, candidate = null } = {}) {
  if (!requisition) return null;
  const isEdit = Boolean(candidate);
  const todayStr = dayKey(ctx.now);
  const fields = [
    { name: 'name', label: 'Candidate name', required: true, wide: true, value: candidate?.name || '', placeholder: 'Alex Meyer' },
    {
      name: 'appliedOn',
      label: 'In the process since',
      type: 'date',
      value: candidate?.appliedOn || todayStr,
    },
    {
      name: 'stage',
      label: 'Stage',
      type: 'select',
      value: candidate?.stage || 'sourced',
      options: ['sourced', 'screening', 'interviewing', 'final'].map((value) => ({
        value,
        label: CANDIDATE_STAGE_LABELS[value],
      })),
      help: 'Move stages through the decision dialog so the reason is recorded with the move.',
    },
    {
      name: 'source',
      label: 'Where they came from',
      value: candidate?.source || '',
      placeholder: 'Referral — Priya / careers page',
      help: 'Sourcing channel is a fact worth keeping: it is how you learn which channels produce hires rather than volume.',
    },
    {
      name: 'startOn',
      label: 'Planned start (if known)',
      type: 'date',
      value: candidate?.startOn || '',
      help: 'Used when an offer is accepted. Left blank, the role’s target start is used.',
    },
    {
      name: 'keepInTouch',
      label: 'Consented to stay in touch',
      type: 'checkbox',
      value: candidate?.keepInTouch || false,
      checkboxLabel: 'They said it is fine to contact them about future roles',
      help: 'Only tick this if they actually said so. Otherwise the record should be deleted when the process ends.',
    },
  ];

  return dialog({
    title: isEdit ? `Edit ${candidate.name}` : `Add a candidate to ${requisition.title}`,
    description: 'A candidate record holds evidence and a decision, nothing about protected characteristics.',
    fields,
    submitLabel: isEdit ? 'Save candidate' : 'Add candidate',
    onSubmit: (values) => (isEdit
      ? ctx.api.updateCandidate(candidate.id, values)
      : ctx.api.addCandidate({ ...values, reqId: requisition.id })),
  });
}

/* --------------------------------------------------------------- evidence */

export function openEvidenceDialog(ctx, { requisition, candidate } = {}) {
  if (!requisition || !candidate) return null;
  const todayStr = dayKey(ctx.now);
  const competencyOptions = [
    { value: '', label: 'General (not tied to one competency)' },
    ...(requisition.competencies || []).map((c) => ({ value: c.id, label: c.name })),
  ];
  const prior = ctx.state.settings?.hiringBaseRate;

  // Live readout: shows what this one observation does to the estimate, using
  // the same domain function the view and the export use.
  const readout = h('p', { class: 'muted small', 'aria-live': 'polite' }, 'Choose a rating to preview the effect.');
  let latest = { kind: 'structured-interview', rating: null, competencyId: '' };

  const renderReadout = () => {
    if (!latest.rating) {
      readout.textContent = 'Choose a rating to preview the effect.';
      return;
    }
    const hypothetical = {
      ...candidate,
      signals: [
        ...(candidate.signals || []),
        {
          id: '__preview',
          kind: latest.kind,
          rating: Number(latest.rating),
          competencyId: latest.competencyId || null,
          interviewerId: null,
          date: todayStr,
        },
      ],
    };
    const assessment = assessCandidate(hypothetical, requisition, { prior });
    const direction = assessment.direction === 'leans-yes'
      ? 'leans toward a strong hire'
      : assessment.direction === 'leans-no'
        ? 'leans against'
        : 'is inconclusive';
    readout.textContent = `With this observation the evidence estimate ${direction}: ${Math.round(assessment.audit.posterior * 100)}% (band: ${assessment.audit.band}, weight ${assessment.audit.totalWeight.toFixed(2)}). ${assessment.ready ? 'The recorded evidence would meet the offer convention.' : 'It would still be short of the offer convention.'} This is decision support from the recorded evidence, not a prediction about a person.`;
  };

  const fields = [
    {
      name: 'kind',
      label: 'Evidence method',
      type: 'select',
      value: 'structured-interview',
      options: EVIDENCE_KINDS.map((k) => ({ value: k.id, label: `${k.label} · validity ≈ ${k.validity}` })),
      help: 'Validity weights come from Sackett et al.’s (2022) re-analysis of the selection meta-analyses — structured interviews .42, job-knowledge tests .40, work samples .33, unstructured conversations .19. Structured methods are also fairer, because they measure the work rather than the impression.',
      wide: true,
    },
    { name: 'competencyId', label: 'Competency assessed', type: 'select', value: '', options: competencyOptions, wide: true },
    {
      name: 'rating',
      label: 'Rating',
      type: 'scale',
      min: 1,
      max: 5,
      value: null,
      help: EVIDENCE_RATING_ANCHORS.map((a) => `${a.rating} = ${a.label}`).join(' · '),
    },
    { name: 'interviewerId', label: 'Who observed it', type: 'select', value: '', options: [{ value: '', label: 'Not attributed' }, ...personOptions(ctx.state)] },
    { name: 'date', label: 'Observed on', type: 'date', value: todayStr },
    {
      name: 'note',
      label: 'What you actually saw or heard',
      type: 'textarea',
      rows: 3,
      wide: true,
      value: '',
      placeholder: 'Designed the retry path unprompted, then explained the trade-off against idempotency keys without prompting.',
      help: 'Specific observed behaviour, not an adjective. This is the line you will re-read when the decision is challenged.',
    },
  ];

  const { form, modal } = dialog({
    title: `Record evidence — ${candidate.name}`,
    description: 'One observation at a time. Repeated ratings of the same competency by the same person are deliberately discounted.',
    fields,
    submitLabel: 'Record evidence',
    size: 'lg',
    extraBody: h('div', { class: 'banner banner-info', role: 'status' }, h('strong', null, 'Effect on the estimate'), readout),
    onSubmit: (values) => {
      const result = ctx.api.recordEvidence(candidate.id, values);
      if (result.ok) {
        toast(`Evidence recorded. Evidence weight now ${result.assessment.audit.totalWeight.toFixed(2)} across ${result.assessment.audit.signalCount} observation(s).`, 'good');
      }
      return result;
    },
  });

  const kindField = form.field('kind');
  const competencyField = form.field('competencyId');
  const ratingField = form.field('rating');
  if (kindField) {
    kindField.addEventListener('change', () => {
      latest = { ...latest, kind: kindField.value };
      renderReadout();
    });
  }
  if (competencyField) {
    competencyField.addEventListener('change', () => {
      latest = { ...latest, competencyId: competencyField.value };
      renderReadout();
    });
  }
  if (ratingField) {
    ratingField.addEventListener('change', () => {
      const picked = ratingField.querySelector('input:checked');
      latest = { ...latest, rating: picked ? Number(picked.value) : null };
      renderReadout();
    });
  }
  return { modal, form };
}

/* --------------------------------------------------------------- decision */

export function openHiringDecisionDialog(ctx, { requisition, candidate } = {}) {
  if (!requisition || !candidate) return null;
  const assessment = assessCandidate(candidate, requisition, { prior: ctx.state.settings?.hiringBaseRate });
  const openOutcomes = CANDIDATE_OUTCOMES.filter((outcome) => {
    if (outcome === 'hire') return ['final', 'offer'].includes(candidate.stage);
    return true;
  });

  const summary = h(
    'div',
    { class: 'stack-sm' },
    h(
      'div',
      { class: 'kv-list' },
      h('div', { class: 'kv' }, h('span', { class: 'kv-label' }, 'Evidence estimate'), h('span', { class: 'kv-value' }, `${Math.round(assessment.audit.posterior * 100)}% (${assessment.audit.band} band)`)),
      h('div', { class: 'kv' }, h('span', { class: 'kv-label' }, 'Weight / methods'), h('span', { class: 'kv-value' }, `${assessment.audit.totalWeight.toFixed(2)} across ${assessment.audit.signalCount} observation(s), ${assessment.audit.distinctKinds} method(s) from ${assessment.audit.raterCount} rater(s)`)),
      h('div', { class: 'kv' }, h('span', { class: 'kv-label' }, 'Competency coverage'), h('span', { class: 'kv-value' }, assessment.coverage.measured ? pctLabel(assessment.coverage.pct) : 'no competencies defined')),
    ),
    assessment.blockers.length
      ? h(
          'div',
          { class: 'banner banner-warn', role: 'status' },
          h('strong', null, 'Missing evidence'),
          h('ul', { class: 'list-tight' }, ...assessment.blockers.map((b) => h('li', null, b.message))),
        )
      : h('p', { class: 'muted small' }, 'The recorded evidence meets the app’s offer convention. That is a convention, not a verdict — the decision is still yours and it is still a judgement.'),
    assessment.warnings.length
      ? h('ul', { class: 'list-tight muted small' }, ...assessment.warnings.map((w) => h('li', null, w.message)))
      : null,
    assessment.flip && assessment.flip.direction !== 'none'
      ? h(
          'p',
          { class: 'muted small' },
          `Falsification check: ${assessment.flip.count} further strong ${assessment.flip.kindLabel.toLowerCase()} observation(s) rated at the opposite extreme would move the estimate across the 50% line. If that is plausible, the estimate is not settled.`,
        )
      : null,
  );

  return dialog({
    title: `Decide — ${candidate.name}`,
    description: `${requisition.title} · currently ${CANDIDATE_STAGE_LABELS[candidate.stage].toLowerCase()}`,
    fields: [
      {
        name: 'outcome',
        label: 'Decision',
        type: 'select',
        value: candidate.stage === 'final' ? 'hire' : 'advance',
        options: openOutcomes.map((value) => ({ value, label: CANDIDATE_OUTCOME_LABELS[value] })),
      },
      {
        name: 'rationale',
        label: 'Reasoning (required for an offer or a rejection)',
        type: 'textarea',
        rows: 4,
        wide: true,
        value: candidate.decision?.rationale || '',
        help: 'The specific evidence that decided it, and what you would want to see if you were the candidate reading it back.',
      },
      {
        name: 'acknowledgeGaps',
        label: 'Proceed despite the evidence gaps',
        type: 'checkbox',
        value: candidate.decision?.evidenceGapAcknowledged || false,
        checkboxLabel: 'I have read the gaps above and am deciding anyway (recorded with the decision)',
      },
    ],
    submitLabel: 'Record decision',
    size: 'lg',
    extraBody: summary,
    onSubmit: (values) => {
      const result = ctx.api.decideCandidate(candidate.id, values);
      if (result.ok) toast(`Recorded: ${CANDIDATE_OUTCOME_LABELS[values.outcome].toLowerCase()}.`, 'good');
      return result;
    },
  });
}

/* ----------------------------------------------------------- accept offer */

export function openAcceptOfferDialog(ctx, { requisition, candidate } = {}) {
  if (!requisition || !candidate) return null;
  const todayStr = dayKey(ctx.now);
  const defaultStart = candidate.startOn || requisition.targetStartOn || addDays(todayStr, 30);

  return dialog({
    title: `${candidate.name} accepted`,
    description: 'This is the handoff: it creates the roster record and a 30-60-90 plan, closes the role and releases the interview reserve.',
    fields: [
      { name: 'startOn', label: 'Start date', type: 'date', required: true, value: defaultStart },
      { name: 'roleTitle', label: 'Role on the roster', value: requisition.title },
      {
        name: 'level',
        label: 'Level',
        type: 'select',
        value: requisition.level,
        options: LEVELS.map((value) => ({ value, label: LEVEL_LABELS[value] })),
      },
      { name: 'team', label: 'Team', value: requisition.team || ctx.state.settings?.teamName || '' },
      {
        name: 'rationale',
        label: 'Closing note',
        type: 'textarea',
        wide: true,
        value: candidate.decision?.rationale || '',
        help: 'Kept on the hire record so the decision can be explained later without reconstructing it.',
      },
    ],
    submitLabel: 'Confirm acceptance',
    size: 'lg',
    extraBody: h(
      'div',
      { class: 'banner banner-good', role: 'status' },
      h('strong', null, 'Created in the same transaction'),
      h(
        'ul',
        { class: 'list-tight' },
        h('li', null, `Roster record for ${candidate.name} (starts ${formatDate(defaultStart)})`),
        h('li', null, 'A new-hire 30-60-90 plan with the standard checkpoints'),
        h('li', null, `“${requisition.title}” marked filled, with typed links from candidate → role → person → plan`),
        h('li', null, 'The interview-effort reserve completed and its capacity freed for delivery'),
      ),
    ),
    onSubmit: (values) => {
      const result = ctx.api.acceptOffer(candidate.id, values);
      if (result.ok) {
        const n = (result.propagations || []).length;
        toast(`${candidate.name} is on the roster${result.onboardingId ? ' with a 30-60-90 plan' : ''}. ${n} cross-module link(s) recorded.`, 'good');
      }
      return result;
    },
  });
}
