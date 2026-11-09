/**
 * app/ui/onboarding-brief-modals.js — the three dialogs of Matrix Onboarding
 * Completeness (ADR-0150).
 *
 *   openOnboardingBriefDialog       "This is what MY line expects of this person —
 *                                   the scope, their first piece of work on it, and
 *                                   who they must meet." Only ever offered for a
 *                                   line the acting seat holds; the action refuses
 *                                   any other seat and the dialog never pretends
 *                                   otherwise.
 *
 *   openOnboardingDeclineDialog     "My line carries no onboarding obligation for
 *                                   this person yet, and here is why." A decline is
 *                                   an ANSWER and needs a reason; without one it
 *                                   would be indistinguishable from a missed
 *                                   deadline.
 *
 *   openOnboardingAcknowledgeDialog "I have read what this line expects of me."
 *                                   The person's own act, on the CURRENT brief,
 *                                   once. The action refuses any other seat.
 *
 * None of these rates the person. Every one records what a LINE or a PERSON said,
 * on a date, in their own words.
 */
import { h, openModal, closeAllModals, buildForm, toast } from './dom.js';
import { ONBOARDING_MATRIX_LIMITS } from '../core/domain/onboardingMatrixRegistry.js';

const notify = (result, message) => {
  if (!result?.ok) {
    toast(result?.error || 'The onboarding action was refused.', 'bad');
    return false;
  }
  toast(result.warning || message, result.warning ? 'bad' : 'good');
  return true;
};

/** One stakeholder name per line — a textarea rather than a widget that can invent ids. */
const parseNames = (value) => String(value || '')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .slice(0, ONBOARDING_MATRIX_LIMITS.stakeholders);

export function openOnboardingBriefDialog(ctx, { planId, line }) {
  if (!line) {
    toast('Choose a reporting line first.', 'bad');
    return;
  }
  const existing = line.brief && line.brief.outcome === 'brief' ? line.brief : null;
  const form = buildForm([
    {
      name: 'scope',
      label: `What does ${line.managerName}’s ${line.kind} line expect of this person?`,
      type: 'textarea',
      rows: 5,
      wide: true,
      value: existing?.scope || '',
      help: 'Required, in words (at least a sentence). Name the job on THIS line: what they own, what \"good\" looks like at 90 days, and what this line will not ask of them. The 30-60-90 plan written by another line cannot speak for this one.',
    },
    {
      name: 'firstWork',
      label: 'Their first piece of work on this line (optional)',
      type: 'textarea',
      rows: 3,
      wide: true,
      value: existing?.firstWork || '',
      help: 'A concrete, scoped first deliverable on this line. Optional — a vague first task is not better than none — but naming one is what turns a brief into something a person can start on Monday.',
    },
    {
      name: 'stakeholders',
      label: 'People this line requires them to meet (one per line)',
      type: 'textarea',
      rows: 3,
      wide: true,
      value: existing ? (existing.stakeholders || []).join('\n') : '',
      help: `Names only, one per line, up to ${ONBOARDING_MATRIX_LIMITS.stakeholders}. These are THIS line’s introductions; the plan’s own stakeholder list belongs to whoever wrote the plan.`,
    },
  ]);
  openModal({
    title: `Write the ${line.kind}-line onboarding brief`,
    description: `One dated statement about one line. It is stored in your words, shown beside the plan, and the person is asked to acknowledge it — an expectation set by one party is not an agreement between two, and this workspace will not record it as one.${existing ? ' Writing a different brief creates a NEW row: the earlier text and any acknowledgement of it stay readable.' : ''}`,
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const values = form.getValues();
          const result = ctx.api.onboardingMatrixBriefLine({
            planId,
            lineKey: line.key,
            scope: values.scope,
            firstWork: values.firstWork,
            stakeholders: parseNames(values.stakeholders),
          });
          if (!notify(result, 'Line brief recorded. The person will be asked to acknowledge it.')) return;
          closeAllModals();
          ctx.refresh();
        },
      }, existing ? 'Record the new brief' : 'Record the brief'),
    ],
  });
}

export function openOnboardingDeclineDialog(ctx, { planId, line }) {
  if (!line) {
    toast('Choose a reporting line first.', 'bad');
    return;
  }
  const form = buildForm([
    {
      name: 'reason',
      label: `Why does ${line.managerName}’s ${line.kind} line carry no onboarding obligation for this person yet?`,
      type: 'textarea',
      rows: 4,
      wide: true,
      help: 'Required. A bare refusal is indistinguishable from a missed deadline, and the record would read as considered when nothing was considered. Naming the reason is what makes this an answer.',
    },
  ]);
  openModal({
    title: `Decline the ${line.kind}-line onboarding brief`,
    description: 'This is an answer, not a deletion: it stays on the record, it is printed as a decline rather than as coverage, and the line can write a brief later if the situation changes.',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const result = ctx.api.onboardingMatrixDeclineLine({
            planId,
            lineKey: line.key,
            reason: form.getValues().reason,
          });
          if (!notify(result, 'Decline recorded with its reason.')) return;
          closeAllModals();
          ctx.refresh();
        },
      }, 'Record the decline'),
    ],
  });
}

export function openOnboardingAcknowledgeDialog(ctx, { planId, line }) {
  if (!line?.brief || line.brief.outcome !== 'brief') {
    toast('There is no current brief on this line to acknowledge.', 'bad');
    return;
  }
  if (line.brief.acknowledgedOn) {
    toast(`You acknowledged this brief on ${line.brief.acknowledgedOn}.`, 'info');
    return;
  }
  const form = buildForm([
    {
      name: 'acknowledgement',
      label: 'Anything you want on the record (optional)',
      type: 'textarea',
      rows: 3,
      wide: true,
      help: 'Optional. What does not fit, or what you need from this line to own it? This is your own statement; nobody else can give it for you, and a manager acknowledging on your behalf is exactly the shadow accountability this step exists to prevent.',
    },
  ]);
  openModal({
    title: `Acknowledge ${line.managerName}’s onboarding brief`,
    description: `You are acknowledging the text written on ${line.brief.declaredOn}. The brief itself is not editable here and the acknowledgement covers this text only — if the line writes a different brief, you will be asked again.`,
    body: h('div', null,
      h('blockquote', { class: 'muted small' }, line.brief.scope),
      form.node),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const result = ctx.api.onboardingMatrixAcknowledge({
            planId,
            lineKey: line.key,
            acknowledgement: form.getValues().acknowledgement,
          });
          if (!notify(result, 'Acknowledged, and dated on the brief.')) return;
          closeAllModals();
          ctx.refresh();
        },
      }, 'Acknowledge this brief'),
    ],
  });
}
