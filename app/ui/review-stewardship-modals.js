/**
 * app/ui/review-stewardship-modals.js — the two dialogs of Matrix Multi-Line
 * Review Stewardship (ADR-0147).
 *
 *   openStewardshipAskDialog     "Ask THIS line for its input into THIS review."
 *                                The due date defaults to the declared answer
 *                                window; the note is required, because an ask with
 *                                no subject returns an answer nobody can use.
 *
 *   openStewardshipAnswerDialog  "This is what MY line saw in the period — or
 *                                there is nothing to add, and here is why."
 *                                Offered only for a line the acting seat holds;
 *                                the action refuses any other seat, and the dialog
 *                                never offers to answer for a line that is not
 *                                yours.
 *
 * Neither dialog sets a rating. The assessor decides; the line informs. A form
 * that quietly collected an assessment from a second line would be the very
 * dual-appraisal conflict the matrix ledger exists to name.
 */
import { h, openModal, closeAllModals, buildForm, toast } from './dom.js';
import { REVIEW_STEWARDSHIP_LIMITS } from '../core/domain/reviewStewardshipRegistry.js';

const notify = (result, message) => {
  if (!result?.ok) {
    toast(result?.error || 'The stewardship action was refused.', 'bad');
    return false;
  }
  toast(result.warning || message, result.warning ? 'bad' : 'good');
  return true;
};

export function openStewardshipAskDialog(ctx, { reviewId, line }) {
  if (!line) {
    toast('Choose a reporting line first.', 'bad');
    return;
  }
  const conv = ctx.api.reviewStewardshipRead?.(reviewId)?.report?.conventions || {};
  const defaultDays = conv.reviewStewardshipAnswerDays || 10;
  const form = buildForm([
    {
      name: 'reviewId', label: '', type: 'hidden', value: reviewId,
    },
    { name: 'lineKey', label: '', type: 'hidden', value: line.key },
    {
      name: 'dueOn',
      label: 'Answer due by (YYYY-MM-DD)',
      type: 'text',
      value: (() => {
        const d = new Date(ctx.now || Date.now());
        d.setUTCDate(d.getUTCDate() + defaultDays);
        return d.toISOString().slice(0, 10);
      })(),
      help: `Defaults to the declared ${defaultDays}-day answer window. Before this date the ask reads "within window"; after it, "overdue" with the late days printed.`,
    },
    {
      name: 'note',
      label: `What should ${line.managerName} speak to?`,
      type: 'textarea',
      rows: 4,
      wide: true,
      help: 'At least a sentence. An ask with no subject returns a vague answer, which is worse than no answer because it looks like evidence. This is not a prompt to write an assessment — the assessment right belongs to whoever the matrix declares.',
    },
  ]);
  openModal({
    title: `Ask ${line.managerName} for their ${line.kind}-line input`,
    description: `This asks ONE line — ${line.role === 'primary' ? 'the home line' : `the ${line.kind} line`} — for what it observed of this person inside the review period. The ask is dated, owned and visible on the packet; asking a line is not the same act as assessing the person.`,
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const result = ctx.api.reviewStewardshipAsk({ ...form.getValues(), reviewId, lineKey: line.key });
          if (!notify(result, `Ask recorded, due ${result.dueOn || 'as stated'}.`)) return;
          closeAllModals();
          ctx.refresh();
        },
      }, 'Record the ask'),
    ],
  });
}

export function openStewardshipAnswerDialog(ctx, { reviewId, line }) {
  if (!line?.request) {
    toast('Nothing has been asked of this line, so there is nothing to answer.', 'bad');
    return;
  }
  const form = buildForm([
    {
      name: 'outcome',
      label: 'Do you have something to add?',
      type: 'select',
      options: [
        { value: 'input', label: 'Yes — here is what this line observed' },
        { value: 'declined', label: 'No — there is nothing material to add' },
      ],
      help: 'A decline is a dated human act, not a gap: it is counted as settled and counted as NOT evidence. Both answers are kept on the record in your own words.',
    },
    {
      name: 'text',
      label: 'What did this line observe in the period?',
      type: 'textarea',
      rows: 6,
      wide: true,
      help: `Required when you have something to add (at least a sentence, up to ${REVIEW_STEWARDSHIP_LIMITS.answerChars} characters). Name outcomes and behaviours with their impact — "owned the incident review on 12 Aug and the postmortem changed our on-call policy" beats "good teammate".`,
    },
    {
      name: 'signal',
      label: 'How does this line see the period, on the shared scale? (optional)',
      type: 'select',
      options: [
        { value: '', label: 'No signal — prose only; the calibration lens will read “unrated”' },
        { value: 'needs-support', label: 'Needs support' },
        { value: 'as-expected', label: 'As expected' },
        { value: 'strong', label: 'Strong' },
        { value: 'exceptional', label: 'Exceptional' },
      ],
      help: 'The ONLY field the reconciliation compares for divergence, because it is a declared human judgement on a shared scale. Two paragraphs are never auto-compared. Leave blank if the prose is the whole answer — it will still count as answered, and the packet will read “unrated-pair” rather than inventing a signal from the prose.',
    },
    {
      name: 'reason',
      label: 'If there is nothing to add, say why',
      type: 'text',
      wide: true,
      help: 'Required for a decline. A bare refusal is indistinguishable from a missed deadline, and the record would read as considered when nothing was considered.',
    },
  ]);
  openModal({
    title: `Your ${line.kind}-line input`,
    description: `Asked on ${line.request.askedOn}${line.request.dueOn ? `, due ${line.request.dueOn}` : ''}. This is recorded as YOUR line's first-person answer, under your seat — nobody else can answer for it, and it does not set a rating. The assessor decides; your line informs.`,
    size: 'lg',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const result = ctx.api.reviewStewardshipAnswer({ ...form.getValues(), reviewId, lineKey: line.key });
          if (!notify(result, 'Line input recorded.')) return;
          closeAllModals();
          ctx.refresh();
        },
      }, 'Record my answer'),
    ],
  });
}
