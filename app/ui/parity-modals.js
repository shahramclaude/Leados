/**
 * app/ui/parity-modals.js — accessible dialogs for the Leadership Parity &
 * Standard Consistency Terminal (Schema v65, ADR-0054).
 */

import { h, toast, openModal } from './dom.js';
import { addDays, dayKey } from '../core/time.js';
import {
  computeParityAuditGrade,
  parityConventionsFromSettings,
  parityReport,
} from '../core/domain/parity.js';

function field(id, label, control, hint = null) {
  return h('div', { class: 'stack-xs' },
    h('label', { for: id }, label),
    control,
    hint ? h('span', { class: 'muted small' }, hint) : null,
  );
}

export function openFreezeParityAuditDialog(ctx) {
  const conventions = parityConventionsFromSettings(ctx.state.settings || {});
  const report = parityReport(ctx.state, ctx.now, conventions);
  const today = dayKey(ctx.now);
  const defaultReviewOn = addDays(today, conventions.reviewHorizonDays);

  const labelInput = h('input', {
    id: 'parity-audit-label',
    type: 'text',
    maxlength: '200',
    value: `Parity & consistency audit — ${today}`,
  });
  const commitmentInput = h('textarea', {
    id: 'parity-audit-commitment',
    rows: '3',
    maxlength: '600',
    placeholder: 'What specific leader cadence, delegation or standard change are you committing to over this window?',
  });
  const reviewInput = h('input', {
    id: 'parity-audit-review-on',
    type: 'date',
    value: defaultReviewOn,
  });
  const probInput = h('input', {
    id: 'parity-audit-prob',
    type: 'number',
    min: '5',
    max: '95',
    step: '1',
    value: '70',
  });

  const summary = h('div', { class: 'prose small' },
    h('p', null,
      `Freezing baseline over ${report.counts.eligiblePostRamp} post-ramp team member(s): `,
      `mean within-cohort Theil = ${report.withinTheilMean ?? 'withheld'}, `,
      `structural fringe = ${report.counts.fringe}, `,
      `overdue leader promises = ${report.counts.overdueLeaderPromises}, `,
      `standard inversions = ${report.counts.inversions}.`,
    ),
    h('p', { class: 'muted' }, 'Freezing also runs RULE-PAR-01..05 in the same transaction to attach typed provenance links and open bounded leader follow-through.'),
  );

  const body = h('div', { class: 'form' },
    summary,
    field('parity-audit-label', 'Audit label', labelInput),
    field('parity-audit-commitment', 'Leader commitment (optional)', commitmentInput, 'Describe your own practice change — never a target score for an employee.'),
    field('parity-audit-review-on', 'Review date (must be in the future)', reviewInput),
    field('parity-audit-prob', 'Predicted probability of narrowing gaps (5–95%, optional)', probInput, 'Scored once with Brier (1950) when graded after the review date. Clear to omit.'),
  );

  const modal = openModal({
    title: 'Freeze parity & consistency audit',
    description: 'Lock today’s allocation, promise-ledger and standard-consistency baseline against a future review date.',
    body,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => modal.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const probVal = String(probInput.value || '').trim();
          const res = ctx.api.freezeParityAudit({
            label: labelInput.value,
            commitment: commitmentInput.value,
            reviewOn: reviewInput.value,
            predictedImprovementPct: probVal === '' ? null : Number(probVal),
          });
          if (!res.ok) {
            toast(res.error || 'Could not freeze parity audit.', 'bad');
            return;
          }
          modal.close();
          toast('Parity audit frozen and linked across modules.', 'good');
          ctx.navigate(`#/parity?panel=rebalance&audit=${encodeURIComponent(res.id)}`);
        },
      }, 'Freeze audit'),
    ],
  });
}

export function openGradeParityAuditDialog(ctx, audit) {
  const report = parityReport(ctx.state, ctx.now);
  const preview = computeParityAuditGrade(audit, report, ctx.now.toISOString());
  const notesInput = h('textarea', {
    id: 'parity-grade-notes',
    rows: '3',
    maxlength: '600',
    value: audit.notes || '',
    placeholder: 'What held, what slipped, and what structural change stays?',
  });

  const body = h('div', { class: 'form' },
    h('div', { class: 'prose small' },
      h('p', null,
        h('strong', null, preview.improved ? 'Outcome: Improved without regression.' : 'Outcome: Did not narrow gaps (or regressed).'),
        preview.brier !== null ? ` · Brier score: ${preview.brier}` : '',
      ),
      h('ul', null,
        h('li', null, `Mean within-cohort Theil: ${preview.withinTheilBefore ?? '—'} → ${preview.withinTheilAfter ?? '—'}`),
        h('li', null, `Structural fringe count: ${preview.fringeBefore} → ${preview.fringeAfter}`),
        h('li', null, `Promise fulfillment spread: ${preview.promiseGapBeforePp ?? '—'}pp → ${preview.promiseGapAfterPp ?? '—'}pp`),
        h('li', null, `Standard inversions: ${preview.inversionsBefore} → ${preview.inversionsAfter}`),
      ),
    ),
    field('parity-grade-notes', 'Reflection notes (optional)', notesInput),
  );

  const modal = openModal({
    title: `Grade “${audit.label}”`,
    description: 'Grading is irreversible: a graded parity audit becomes permanent calibration evidence.',
    body,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => modal.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const res = ctx.api.gradeParityAudit(audit.id, { notes: notesInput.value });
          if (!res.ok) {
            toast(res.error || 'Could not grade parity audit.', 'bad');
            return;
          }
          modal.close();
          toast('Parity audit graded.', 'good');
          ctx.navigate(`#/parity?panel=rebalance&audit=${encodeURIComponent(audit.id)}`);
        },
      }, 'Lock grade'),
    ],
  });
}
