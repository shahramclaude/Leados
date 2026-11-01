/**
 * app/ui/settlement-modals.js — accessible dialogs for freezing prospective
 * loop-closure forecasts and recording blameless loop settlements (Schema v75).
 */

import { h, openModal, toast } from './dom.js';
import { banner } from './components.js';
import { addDays, dayKey } from '../core/time.js';
import { SETTLEMENT_LIMITS } from '../core/domain/settlementRegistry.js';

export function openFreezeSettlementDialog(ctx, loop) {
  if (!loop) return;
  const today = dayKey(ctx.now);
  const defaultReview = loop.reviewOn && loop.reviewOn >= today
    ? loop.reviewOn
    : addDays(today, 14);
  const suggestedPct = Math.min(
    SETTLEMENT_LIMITS.maxForecastPct,
    Math.max(SETTLEMENT_LIMITS.minForecastPct, Math.round(loop.jointClearancePct || 65)),
  );

  const pctInput = h('input', {
    id: 'stl-freeze-pct',
    type: 'number',
    min: SETTLEMENT_LIMITS.minForecastPct,
    max: SETTLEMENT_LIMITS.maxForecastPct,
    step: 1,
    value: suggestedPct,
  });
  const reviewInput = h('input', {
    id: 'stl-freeze-review',
    type: 'date',
    value: defaultReview,
    min: today,
    max: addDays(today, 365),
  });
  const notesInput = h('textarea', {
    id: 'stl-freeze-notes',
    rows: 3,
    maxlength: SETTLEMENT_LIMITS.maxNotes,
    placeholder: 'Optional: which gate or signpost carries the main risk before review?',
  });

  const body = h(
    'div',
    { class: 'stack-sm' },
    banner({
      tone: 'info',
      title: 'Prospective out-of-sample forecast',
      body: `Current clearance is ${loop.overallClearancePct}% (Pressman–Wildavsky sequential joint pass ${loop.jointClearancePct}%). Once frozen, this forecast is graded once by Brier score when the loop settles.`,
    }),
    h(
      'div',
      { class: 'field' },
      h('label', { for: 'stl-freeze-pct' }, 'Predicted clean-closure probability (5–95%)'),
      pctInput,
    ),
    h(
      'div',
      { class: 'field' },
      h('label', { for: 'stl-freeze-review' }, 'Target grading / review date'),
      reviewInput,
    ),
    h(
      'div',
      { class: 'field' },
      h('label', { for: 'stl-freeze-notes' }, 'Blameless system note (optional)'),
      notesInput,
    ),
  );

  const modal = openModal({
    title: `Freeze closure forecast · ${loop.title}`,
    description: 'Cromwell’s rule bounds forecasts to 5–95%. Retroactive freezing after closure is blocked.',
    body,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => modal.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const result = ctx.api.freezeLoopSettlement({
            loopKey: loop.loopKey,
            predictedCleanClosurePct: Number(pctInput.value),
            reviewOn: reviewInput.value,
            notes: notesInput.value,
          });
          if (!result.ok) {
            toast(result.error, 'bad');
            return;
          }
          modal.close();
          toast(
            result.saved
              ? 'Prospective loop forecast frozen for out-of-sample Brier grading.'
              : 'Frozen in memory only — export a backup now.',
            result.saved ? 'good' : 'bad',
          );
          ctx.refresh();
        },
      }, 'Freeze forecast'),
    ],
  });
}

export function openRecordSettlementDialog(ctx, loop) {
  if (!loop) return;
  const today = dayKey(ctx.now);
  const early = !loop.closedOutcome && (!loop.reviewOn || loop.reviewOn > today);
  const notesInput = h('textarea', {
    id: 'stl-settle-notes',
    rows: 3,
    maxlength: SETTLEMENT_LIMITS.maxNotes,
    placeholder: 'Optional: system constraint, variance driver or next guardrail (blameless — no personal fault).',
  });
  const earlyConfirm = early
    ? h('input', { id: 'stl-settle-early', type: 'checkbox' })
    : null;

  const body = h(
    'div',
    { class: 'stack-sm' },
    banner({
      tone: loop.attribution.meta.tone === 'bad' ? 'caution' : loop.attribution.meta.tone,
      title: `Current reading: ${loop.attribution.meta.label}`,
      body: `${loop.attribution.meta.summary} ${loop.attribution.meta.actionGuidance}`,
    }),
    early
      ? h(
          'div',
          { class: 'field' },
          h(
            'label',
            { for: 'stl-settle-early', class: 'prep-check-row' },
            earlyConfirm,
            h('span', null, `Confirm early checkpoint settlement ahead of ${loop.reviewOn || 'an unscheduled review date'}`),
          ),
        )
      : null,
    h(
      'div',
      { class: 'field' },
      h('label', { for: 'stl-settle-notes' }, 'Blameless settlement note (optional)'),
      notesInput,
    ),
  );

  const modal = openModal({
    title: `Settle & attribute loop · ${loop.title}`,
    description: 'Writes an immutable attribution receipt and runs RULE-STL-01..05 across decisions, delegations, 1:1 prompts, premises and retros.',
    body,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => modal.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const result = ctx.api.recordLoopSettlement({
            loopKey: loop.loopKey,
            notes: notesInput.value,
            allowEarlySettlement: early ? Boolean(earlyConfirm?.checked) : false,
          });
          if (!result.ok) {
            toast(result.error, 'bad');
            return;
          }
          modal.close();
          toast(
            result.saved
              ? `Loop settled (${result.verdict.regime}). ${result.propagations.length} cross-module rule effect(s) recorded.`
              : 'Settled in memory only — export a backup now.',
            result.saved ? 'good' : 'bad',
          );
          ctx.refresh();
        },
      }, 'Record immutable settlement'),
    ],
  });
}
