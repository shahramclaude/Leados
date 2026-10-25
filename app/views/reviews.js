/**
 * app/views/reviews.js — performance review list and printable evidence packet.
 */

import { h, toast, confirmDialog } from '../ui/dom.js';
import { pageHeader, card, stat, badge, table, personChip, emptyState, banner } from '../ui/components.js';
import { formatDate } from '../core/time.js';
import {
  SELF_REFLECTION_PROMPTS, MANAGER_PROMPTS, REVIEW_RATING_LABELS,
  summarizeReviewEvidence, calibrateReview, reviewReadiness, reviewSourceLabel,
} from '../core/domain/reviews.js';
import { openPerformanceReviewDialog, openReflectionDialog, openAssessmentDialog, openGoalDialog, openGrowthPlanDialog } from '../ui/modals.js';

export function renderReviews(ctx) {
  const { state } = ctx;
  const reviews = (state.reviews || []).slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const rows = reviews.map((review) => ({
    review,
    person: state.people.find((p) => p.id === review.personId) || null,
    warnings: calibrateReview(review),
    readiness: reviewReadiness(review),
  }));
  const drafts = rows.filter((row) => row.review.status === 'draft');
  const complete = rows.filter((row) => row.review.status === 'complete');
  const flagged = rows.filter((row) => row.warnings.length > 0);

  const columns = [
    {
      label: 'Person',
      render: ({ person, review }) => person
        ? personChip(person, { sub: person.role || null, onClick: () => ctx.navigate(`#/reviews/${encodeURIComponent(review.id)}`) })
        : h('span', { class: 'text-warn' }, 'Person missing from roster'),
    },
    { label: 'Period', render: ({ review }) => h('span', null, `${formatDate(review.periodStart)} → ${formatDate(review.periodEnd)}`) },
    {
      label: 'Evidence',
      render: ({ review }) => {
        const summary = summarizeReviewEvidence(review.evidence, review.periodStart, review.periodEnd);
        return h('span', null, h('strong', null, String(summary.dated)), h('span', { class: 'muted tiny' }, ` dated · ${summary.sourceTypes} source types`));
      },
    },
    {
      label: 'Calibration',
      render: ({ warnings }) => warnings.length ? badge(`${warnings.length} check${warnings.length === 1 ? '' : 's'}`, 'warn') : badge('no warnings', 'good'),
    },
    {
      label: 'Status',
      render: ({ review, readiness }) => review.status === 'complete'
        ? badge('Complete', 'good')
        : readiness.canComplete ? badge('Ready to complete', 'good') : badge('Draft', 'neutral'),
    },
    {
      label: '',
      render: ({ review }) => h('a', { class: 'btn btn-tiny btn-ghost', href: `#/reviews/${encodeURIComponent(review.id)}` }, review.status === 'complete' ? 'Open packet' : 'Continue'),
    },
  ];

  return h(
    'div',
    { class: 'page' },
    pageHeader({
      eyebrow: 'Performance',
      title: 'Reviews built from the whole period',
      subtitle: 'A printable packet of real records, the person’s reflection and your assessment. No invented score, no annual memory test.',
      actions: [h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openPerformanceReviewDialog(ctx) }, 'Prepare a review')],
    }),
    h(
      'div',
      { class: 'stat-row' },
      stat({ label: 'Review packets', value: rows.length, hint: `${drafts.length} draft` }),
      stat({ label: 'Ready to complete', value: drafts.filter((row) => row.readiness.canComplete).length, hint: 'required sections present', tone: drafts.some((row) => row.readiness.canComplete) ? 'good' : '' }),
      stat({ label: 'Completed', value: complete.length, hint: 'evidence frozen at completion' }),
      stat({ label: 'Need a calibration check', value: flagged.length, hint: 'a prompt to inspect, not a verdict', tone: flagged.length ? 'warn' : 'good' }),
    ),
    rows.length
      ? card({
          title: 'Review workspace',
          subtitle: 'Drafts can refresh their evidence. Completed packets keep the snapshot used at completion.',
          body: table({ columns, rows }),
        })
      : card({
          body: emptyState({
            title: 'No performance reviews yet',
            body: 'Choose a person and a period. LeadOS will assemble their goals, feedback, 1:1 notes, delegations, development and recognition, then show you where the evidence is thin.',
            action: state.people.some((p) => p.status !== 'archived')
              ? h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openPerformanceReviewDialog(ctx) }, 'Prepare the first review')
              : h('a', { class: 'btn btn-primary', href: '#/people' }, 'Add your team first'),
          }),
        }),
    card({
      title: 'What a useful review contains',
      subtitle: 'The structure is deliberately consistent across people.',
      body: h(
        'div',
        { class: 'grid grid-2' },
        h('div', null, h('h3', { class: 'card-title' }, 'Evidence before adjectives'), h('p', { class: 'muted small' }, 'Dated source excerpts cover the entire period. Current goal and development values are labelled “at capture” because LeadOS does not invent historical values it never stored.')),
        h('div', null, h('h3', { class: 'card-title' }, 'Reflection before a rating'), h('p', { class: 'muted small' }, 'Four self-reflection prompts give the person a voice without a self-score. Manager ratings are optional and anchored; calibration warnings challenge unsupported or recency-skewed assessments.')),
      ),
    }),
  );
}

export function renderReviewDetail(ctx, reviewId) {
  const { state } = ctx;
  const review = (state.reviews || []).find((r) => r.id === reviewId);
  if (!review) {
    return h('div', { class: 'page' }, pageHeader({ title: 'Review not found', subtitle: 'It may belong to a different workspace export.' }), card({ body: emptyState({ title: 'No such review', action: h('a', { class: 'btn btn-primary', href: '#/reviews' }, 'Back to reviews') }) }));
  }
  const person = state.people.find((p) => p.id === review.personId) || null;
  const evidence = review.evidence || [];
  const summary = summarizeReviewEvidence(evidence, review.periodStart, review.periodEnd);
  const warnings = calibrateReview(review, evidence);
  const readiness = reviewReadiness(review, evidence);
  const isDraft = review.status === 'draft';

  const completeAction = () => {
    if (!readiness.canComplete) {
      toast(`Not ready: ${readiness.missing.map((check) => check.label).join('; ')}`, 'bad');
      return;
    }
    confirmDialog({
      title: 'Complete and freeze this review?',
      message: `${summary.dated} dated source records will be recaptured and frozen. ${warnings.length ? `${warnings.length} calibration check${warnings.length === 1 ? '' : 's'} remain visible: ${warnings.map((w) => `${w.id} ${w.title}`).join('; ')}.` : 'No calibration warnings are currently firing.'} Completion is audited; you can reopen it later for a correction.`,
      confirmLabel: warnings.length ? `Complete with ${warnings.length} check${warnings.length === 1 ? '' : 's'}` : 'Complete review',
      onConfirm: () => {
        const result = ctx.api.completeReview(review.id);
        if (!result.ok) toast(result.error, 'bad');
        else toast(result.warnings.length ? `Review completed; ${result.warnings.length} calibration check${result.warnings.length === 1 ? '' : 's'} remain visible` : 'Review completed with no calibration warnings', result.warnings.length ? 'neutral' : 'good');
      },
    });
  };

  const reopenAction = () => confirmDialog({
    title: 'Reopen this completed review?',
    message: 'The packet returns to draft and the change is logged. Its evidence stays frozen until you explicitly refresh it.',
    confirmLabel: 'Reopen review',
    onConfirm: () => {
      const result = ctx.api.reopenReview(review.id);
      toast(result.ok ? 'Review reopened as a draft' : result.error, result.ok ? 'good' : 'bad');
    },
  });

  return h(
    'div',
    { class: 'page review-page' },
    h('a', { class: 'back-link no-print', href: '#/reviews' }, '← Performance reviews'),
    pageHeader({
      eyebrow: 'Performance review',
      title: person?.name || 'Person no longer in roster',
      subtitle: `${person?.role ? `${person.role} · ` : ''}${formatDate(review.periodStart)} → ${formatDate(review.periodEnd)} · ${summary.periodDays} days`,
      meta: h(
        'div',
        { class: 'person-meta' },
        badge(isDraft ? 'Draft' : 'Complete', isDraft ? 'neutral' : 'good'),
        review.manager.rating ? badge(REVIEW_RATING_LABELS[review.manager.rating], 'neutral') : badge('No overall rating', 'neutral'),
        review.completedAt ? h('span', { class: 'muted small' }, `Completed ${formatDate(review.completedAt)}`) : null,
      ),
      actions: [
        h('button', { class: 'btn btn-ghost no-print', type: 'button', onClick: () => window.print() }, 'Print / save PDF'),
        isDraft ? h('button', { class: 'btn btn-ghost no-print', type: 'button', onClick: () => openAssessmentDialog(ctx, { review }) }, 'Write assessment') : null,
        isDraft
          ? h('button', { class: 'btn btn-primary no-print', type: 'button', onClick: completeAction }, 'Complete review')
          : h('button', { class: 'btn btn-ghost no-print', type: 'button', onClick: reopenAction }, 'Reopen'),
      ].filter(Boolean),
    }),
    banner({
      tone: 'info',
      title: isDraft ? 'Review the packet before sharing it' : 'Completed evidence snapshot',
      body: isDraft
        ? `Evidence was captured ${formatDate(review.evidenceCapturedAt)}. It can include private 1:1 notes. Anonymous pulse answers and upward feedback about the manager are excluded. Goal, development and delegation values say “at capture” rather than pretending to be period-end history.`
        : `This packet keeps the ${evidence.length} source excerpt${evidence.length === 1 ? '' : 's'} frozen at completion. Source links open the live record, which may since have changed.`,
    }),
    h(
      'div',
      { class: 'stat-row' },
      stat({ label: 'Dated evidence', value: summary.dated, hint: `${summary.early} earlier · ${summary.late} later in period` }),
      stat({ label: 'Source types', value: summary.sourceTypes, hint: Object.entries(summary.byType).map(([type, count]) => `${count} ${reviewSourceLabel(type)}`).join(' · ') || 'none yet' }),
      stat({ label: 'Self-reflection', value: readiness.selfReflectionPresent ? 'Recorded' : 'Not recorded', hint: 'invited, never required or self-scored', tone: readiness.selfReflectionPresent ? 'good' : '' }),
      stat({ label: 'Calibration checks', value: warnings.length, hint: warnings.length ? 'inspect before completing' : 'no current warnings', tone: warnings.length ? 'warn' : 'good' }),
    ),
    card({
      title: 'Preparation checklist',
      subtitle: 'Required for completion. The person’s reflection remains optional because this local app cannot collect it directly.',
      className: 'no-print',
      actions: isDraft ? [h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => openReflectionDialog(ctx, { review }) }, readiness.selfReflectionPresent ? 'Edit self-reflection' : 'Record self-reflection')] : [],
      body: h(
        'ul',
        { class: 'review-checklist' },
        ...readiness.checks.map((check) => h('li', { class: check.met ? 'is-met' : '' }, h('span', { 'aria-hidden': 'true' }, check.met ? '✓' : '○'), h('span', null, check.label))),
        h('li', { class: readiness.selfReflectionPresent ? 'is-met' : 'is-optional' }, h('span', { 'aria-hidden': 'true' }, readiness.selfReflectionPresent ? '✓' : '○'), h('span', null, 'Employee self-reflection (optional, but recommended)')),
      ),
    }),
    warnings.length
      ? card({
          title: 'Calibration: inspect before you rely on this assessment',
          subtitle: 'These are prompts about the evidence and your draft, not automated judgements about the person.',
          body: h(
            'ul',
            { class: 'calibration-list' },
            ...warnings.map((warning) => h('li', { class: `calibration-item calibration-${warning.tone}` }, h('div', null, badge(warning.id, warning.tone === 'bad' ? 'bad' : warning.tone === 'caution' ? 'caution' : 'warn'), h('h3', null, warning.title)), h('p', null, warning.detail))),
          ),
        })
      : card({ title: 'Calibration checks clear', body: h('p', { class: 'good-text small' }, 'No thin-evidence, recency, balance, or rating-support warnings are firing. That is not proof of fairness; it means these explicit checks found nothing to challenge.') }),
    reflectionCard(ctx, review, isDraft),
    assessmentCard(ctx, review, isDraft),
    reviewFollowThroughCard(ctx, review, person),
    evidenceCard(ctx, review, evidence, summary, isDraft),
  );
}

function reflectionCard(ctx, review, isDraft) {
  const present = SELF_REFLECTION_PROMPTS.some((prompt) => (review.selfReflection?.[prompt.key] || '').trim());
  return card({
    title: 'The person’s self-reflection',
    subtitle: present ? `Recorded ${formatDate(review.selfReflectionRecordedAt)} · their perspective, not a self-rating` : 'Not recorded. Ask the person to answer in their own words; do not invent a response for them.',
    actions: isDraft ? [h('button', { class: 'btn btn-small btn-ghost no-print', type: 'button', onClick: () => openReflectionDialog(ctx, { review }) }, present ? 'Edit reflection' : 'Record reflection')] : [],
    body: present
      ? h('div', { class: 'review-responses' }, ...SELF_REFLECTION_PROMPTS.map((prompt) => h('section', { class: 'review-response' }, h('h3', null, prompt.label), h('p', { class: 'review-text' }, review.selfReflection[prompt.key] || 'Not answered.'))))
      : emptyState({ title: 'No self-reflection recorded', body: 'This does not block completion, but the packet will say so rather than implying the person participated.' }),
  });
}

function assessmentCard(ctx, review, isDraft) {
  const present = MANAGER_PROMPTS.some((prompt) => (review.manager?.[prompt.key] || '').trim());
  return card({
    title: 'Manager assessment',
    subtitle: review.manager.rating ? REVIEW_RATING_LABELS[review.manager.rating] : 'No overall rating',
    actions: isDraft ? [h('button', { class: 'btn btn-small btn-primary no-print', type: 'button', onClick: () => openAssessmentDialog(ctx, { review }) }, present ? 'Edit assessment' : 'Write assessment')] : [],
    body: present
      ? h('div', { class: 'review-responses' }, ...MANAGER_PROMPTS.map((prompt) => h('section', { class: 'review-response' }, h('h3', null, prompt.label), h('p', { class: 'review-text' }, review.manager[prompt.key] || 'Not answered.'))))
      : emptyState({ title: 'No manager assessment yet', body: 'Read the evidence first, then name outcomes, development and what happens next.', action: isDraft ? h('button', { class: 'btn btn-primary no-print', type: 'button', onClick: () => openAssessmentDialog(ctx, { review }) }, 'Write assessment') : null }),
  });
}

function reviewFollowThroughCard(ctx, review, person) {
  if (review.status !== 'complete') return null;
  const linkedGoals = (ctx.state.goals || []).filter((goal) => goal.sourceReviewId === review.id);
  const linkedPlans = (ctx.state.growthPlans || []).filter((plan) => plan.sourceReviewId === review.id);
  const canStart = person && person.status !== 'archived';

  return card({
    title: 'Choose a follow-through',
    subtitle: 'A review focus is not an agreement. Start a draft only when you choose; edit the focus, measure it, and agree next steps with the person before saving.',
    actions: canStart ? [
      h('button', { class: 'btn btn-small btn-ghost no-print', type: 'button', onClick: () => openGrowthPlanDialog(ctx, { personId: review.personId, sourceReview: review }) }, 'Start GROW plan'),
      h('button', { class: 'btn btn-small btn-primary no-print', type: 'button', onClick: () => openGoalDialog(ctx, { personId: review.personId, sourceReview: review }) }, 'Create goal'),
    ] : [],
    body: h('div', { class: 'stack' },
      canStart
        ? h('p', { class: 'muted small' }, review.manager?.development?.trim()
          ? 'The development focus is prefilled as editable draft text. The goal requires you to add a measurable key result; GROW requires a new Will commitment. Neither is created until you submit.'
          : 'No development focus was recorded. Both forms start without an invented objective; write and agree one before saving.')
        : h('p', { class: 'muted small' }, 'This person is archived or no longer in the roster, so new follow-through cannot be started here.'),
      linkedGoals.length || linkedPlans.length
        ? h('div', null,
            h('h3', { class: 'card-title' }, 'Already linked to this review'),
            h('ul', { class: 'review-followthrough-list' },
              ...linkedGoals.map((goal) => h('li', null, h('a', { href: `#/goals?goal=${encodeURIComponent(goal.id)}` }, `Goal · ${goal.title}`))),
              ...linkedPlans.map((plan) => h('li', null, h('a', { href: `#/growth?plan=${encodeURIComponent(plan.id)}` }, `GROW plan · ${plan.goal}`))),
            ),
          )
        : h('p', { class: 'muted tiny' }, 'No goal or GROW plan has been created from this review.'),
    ),
  });
}

function evidenceCard(ctx, review, evidence, summary, isDraft) {
  return card({
    title: 'Evidence appendix',
    subtitle: `${summary.dated} dated record${summary.dated === 1 ? '' : 's'} · ${evidence.length - summary.dated} current snapshot${evidence.length - summary.dated === 1 ? '' : 's'} · captured ${formatDate(review.evidenceCapturedAt)}`,
    actions: isDraft ? [h('button', {
      class: 'btn btn-small btn-ghost no-print', type: 'button',
      onClick: () => {
        const result = ctx.api.refreshReviewEvidence(review.id);
        toast(result.ok ? `Evidence refreshed: ${result.evidenceCount} source record${result.evidenceCount === 1 ? '' : 's'}` : result.error, result.ok ? 'good' : 'bad');
      },
    }, 'Refresh evidence')] : [],
    body: evidence.length
      ? h(
          'ol',
          { class: 'review-evidence-list' },
          ...evidence.map((item) => h(
            'li',
            { class: `review-evidence evidence-${item.valence}` },
            h(
              'article',
              null,
              h('div', { class: 'evidence-head' }, badge(reviewSourceLabel(item.sourceType), item.valence === 'positive' ? 'good' : item.valence === 'constructive' ? 'caution' : 'neutral'), h('span', { class: 'muted tiny' }, item.date ? formatDate(item.date) : 'Current snapshot')),
              h('h3', { class: 'evidence-title' }, item.title),
              h('p', { class: 'evidence-detail' }, item.detail),
              item.meta ? h('p', { class: 'muted small' }, item.meta) : null,
              h('p', { class: 'muted tiny' }, item.basis),
              h('div', { class: 'evidence-source' }, h('span', { class: 'muted tiny' }, `Source ${item.sourceType} · ${item.sourceId}`), h('a', { class: 'link no-print', href: item.route }, 'Open source record →')),
            ),
          )),
        )
      : emptyState({
          title: 'No source records in this packet',
          body: 'A completed review needs at least one dated record from this period. Log a real conversation, feedback note, goal check-in, delegation event or recognition, then refresh this packet.',
          action: h('div', { class: 'row-gap no-print' }, h('a', { class: 'btn btn-primary', href: `#/people/${encodeURIComponent(review.personId)}` }, 'Open person record'), h('a', { class: 'btn btn-ghost', href: `#/feedback?person=${encodeURIComponent(review.personId)}` }, 'Record feedback')),
        }),
  });
}
