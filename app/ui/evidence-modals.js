/**
 * app/ui/evidence-modals.js — the two dialogs of the Evidence Terminal
 * (Schema v66, ADR-0055).
 *
 *   openFreezeReviewDialog   freeze what the pooled evidence says today, with a
 *                            live preview of exactly which cells and which
 *                            ranking will be frozen — and of what the scan that
 *                            follows will write
 *   openGradeReviewDialog    grade a frozen review by interval coverage against
 *                            the terminal as it reads today
 *
 * Both dialogs show their consequence before committing. A freeze is a
 * prediction, and a prediction the leader cannot see the shape of before
 * making it is not a prediction, it is a surprise.
 */

import { h, toast, openModal } from './dom.js';
import { addDays, dayKey } from '../core/time.js';
import {
  buildEvidenceReview,
  evidenceConventionsFromSettings,
  evidenceReport,
  gradeEvidenceReview,
} from '../core/domain/evidence.js';
import { evidenceReviewById } from '../core/domain/evidenceSchema.js';

function field(id, label, control, hint = null) {
  return h('div', { class: 'stack-xs' },
    h('label', { for: id }, label),
    control,
    hint ? h('span', { class: 'muted small' }, hint) : null);
}

function pctText(value) {
  if (!Number.isFinite(value)) return '—';
  const rounded = Math.round(value * 100) / 100;
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

export function openFreezeReviewDialog(ctx) {
  const report = evidenceReport(ctx.state, ctx.now, ctx.state.settings || {});
  const conventions = report.conventions;
  const today = dayKey(ctx.now);

  const label = h('input', {
    id: 'ev-label',
    type: 'text',
    maxlength: '200',
    value: `Evidence review, week of ${report.week}`,
  });
  const outcomeSelect = h('select', { id: 'ev-outcome' },
    ...report.effects.outcomes.map((outcome) => h('option', { value: outcome.outcomeId || '' },
      `${outcome.label} (${outcome.eligible} poolable cell(s), ${outcome.n} study(ies))`)));
  if (!report.effects.outcomes.length) {
    outcomeSelect.appendChild(h('option', { value: '' }, 'No outcome has any scored study yet'));
    outcomeSelect.disabled = true;
  }
  const reviewOn = h('input', {
    id: 'ev-reviewon',
    type: 'date',
    value: addDays(today, conventions.reviewDays),
  });
  const preview = h('div', { class: 'stack-xs' });

  function renderPreview() {
    preview.replaceChildren();
    const outcomeId = outcomeSelect.value || null;
    const focus = outcomeId && outcomeId !== report.effects.focusOutcomeId
      ? outcomeId
      : report.effects.focusOutcomeId;
    const draft = buildEvidenceReview(report, { id: 'preview', label: label.value, reviewOn: reviewOn.value, nowIso: ctx.now.toISOString(), focusOutcomeId: focus });
    const head = h('p', { class: 'muted' },
      `${draft.cells.length} pooled cell(s) and ${draft.ranking.length} ranked lever(s) would be frozen for ${draft.outcomeLabel || 'this workspace'}. `,
      h('strong', null, 'Aggregates only'),
      ' — no study title, hypothesis, note or identifier is stored in a review, so a later edit to a study cannot rewrite what this review said.');
    preview.appendChild(head);
    if (!draft.cells.length) {
      preview.appendChild(h('p', { class: 'muted' },
        'Nothing is poolable yet. A review with no cells cannot be graded, so the freeze is refused: a prediction about nothing is not a prediction.'));
    } else {
      preview.appendChild(h('ul', { class: 'small muted' },
        ...draft.cells.slice(0, 6).map((cell) => h('li', null,
          `${cell.interventionType} → ${cell.outcomeId}: ${pctText(cell.pooled)} [${pctText(cell.lo)}, ${pctText(cell.hi)}], n=${cell.nConfirmatory}, I²=${cell.i2}% — ${cell.verdict}`))));
    }
    const date = reviewOn.value;
    if (!date || date <= today) {
      preview.appendChild(h('p', { class: 'muted small' }, 'The review date must be in the future; a review graded the day it is frozen tests nothing.'));
    }
  }

  for (const control of [label, outcomeSelect, reviewOn]) control.addEventListener('input', renderPreview);
  renderPreview();

  const dialog = openModal({
    title: 'Freeze an evidence review',
    description: 'A review is a dated claim about what the pooled evidence says today. It is graded later by checking how many of its intervals still hold — which is the only way to know whether the practice you standardised on was ever real.',
    body: h('div', { class: 'stack' },
      field('ev-label', 'Label', label),
      field('ev-outcome', 'Focus outcome', outcomeSelect, 'Which question the ranking answers. The cells frozen are every poolable cell, not only this outcome.'),
      field('ev-reviewon', 'Review on', reviewOn, `How long before the review is graded (convention: ${conventions.reviewDays} days).`),
      preview),
    footer: [
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const result = ctx.api.freezeEvidenceReview({
            label: label.value,
            outcomeId: outcomeSelect.value || null,
            reviewOn: reviewOn.value,
          });
          if (result && result.ok) {
            dialog.close();
            toast(`Froze the review with ${result.review.cells.length} pooled cell(s). The scan has already cascaded it.`, 'good');
            ctx.navigate(`#/evidence?panel=reviews&review=${encodeURIComponent(result.review.id)}`);
          } else {
            toast((result && result.error) || 'Could not freeze the review.', 'bad');
          }
        },
      }, 'Freeze the review'),
    ],
  });
}

export function openGradeReviewDialog(ctx, reviewId) {
  const review = evidenceReviewById(ctx.state, reviewId);
  if (!review) {
    toast('That review no longer exists.', 'bad');
    return;
  }
  const report = evidenceReport(ctx.state, ctx.now, ctx.state.settings || {});
  const grading = gradeEvidenceReview(review, report);
  const body = h('div', { class: 'stack' });

  if (!grading.ok) {
    body.appendChild(h('p', { class: 'muted' }, grading.reason));
  } else {
    body.appendChild(h('p', { class: 'muted' },
      `${grading.cellsCovered} of ${grading.cellsGraded} interval(s) frozen in this review still contain today's pooled estimate. Mean absolute error ${grading.meanAbsoluteError} percentage points.`));
    body.appendChild(h('p', { class: 'muted small' },
      'Coverage is not accuracy: an interval wide enough covers almost anything. The absolute error is shown beside it, and a review that covered everything by predicting nothing useful is visible as a wide interval with a large error.'));
    body.appendChild(h('table', { class: 'table' },
      h('thead', null, h('tr', null,
        h('th', null, 'Cell'),
        h('th', null, 'Frozen'),
        h('th', null, 'Interval'),
        h('th', null, 'Today'),
        h('th', null, 'Covered'))),
      h('tbody', null,
        ...grading.pairs.map((pair) => h('tr', null,
          h('td', null, pair.key),
          h('td', null, pctText(pair.frozenPooled)),
          h('td', null, `n=${pair.nThen}`),
          h('td', null, pctText(pair.realisedPooled), ` (n=${pair.nNow})`),
          h('td', null, pair.covered ? 'yes' : 'no'))))));
  }

  const dialog = openModal({
    title: `Grade the review frozen ${String(review.frozenAt || '').slice(0, 10)}`,
    description: grading.ok
      ? 'Grading re-derives today’s pooled estimates from the live studies and checks them against the intervals this review froze. Nothing stored is trusted; every figure is recomputed.'
      : grading.reason,
    body,
    footer: grading.ok
      ? [
        h('button', {
          class: 'btn btn-primary',
          type: 'button',
          onClick: () => {
            const result = ctx.api.gradeEvidenceReview(review.id);
            if (result && result.ok) {
              dialog.close();
              toast(`Graded: ${result.grade.cellsCovered}/${result.grade.cellsGraded} interval(s) still hold.`, 'good');
              ctx.navigate(`#/evidence?panel=reviews&review=${encodeURIComponent(review.id)}`);
            } else {
              toast((result && result.error) || 'Could not grade the review.', 'bad');
            }
          },
        }, 'Record the grade'),
      ]
      : [],
  });
}

const evidenceDialogs = { openFreezeReviewDialog, openGradeReviewDialog };

export default evidenceDialogs;
