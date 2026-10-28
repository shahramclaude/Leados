/**
 * app/ui/model-modals.js — the challenge dialog for Evidence Governance.
 *
 * One job: record a dated observation against a registered claim with a
 * declared likelihood ratio, and show the leader the posterior move *before*
 * they commit it. Nothing here writes; the action owns validation and the
 * post-commit spine owns the fan-out.
 */

import { h, toast, openModal } from './dom.js';
import { badge } from './components.js';
import {
  MODEL_MAX_LIKELIHOOD_RATIO,
  MODEL_MIN_LIKELIHOOD_RATIO,
  MODEL_TRUST_GRADES,
} from '../core/domain/claimRegistry.js';

/** The same log-odds arithmetic the engine uses, mirrored for the preview. */
function previewPosterior(priorPct, direction, ratio) {
  const prior = Math.min(99.5, Math.max(0.5, Number(priorPct) || 50)) / 100;
  const lr = Math.min(MODEL_MAX_LIKELIHOOD_RATIO, Math.max(MODEL_MIN_LIKELIHOOD_RATIO, Number(ratio) || 1));
  const multiplier = direction === 'supports' ? lr : 1 / lr;
  const logOdds = Math.log(prior / (1 - prior)) + Math.log(multiplier);
  const e = Math.exp(Math.min(20, Math.max(-20, logOdds)));
  return Math.round((e / (1 + e)) * 1000) / 10;
}

export function openChallengeDialog(ctx, { claim, onDone = null } = {}) {
  if (!claim) return;
  const directionSelect = h('select', { name: 'direction', id: 'mch-direction' },
    h('option', { value: 'challenges' }, 'Challenges the claim'),
    h('option', { value: 'supports' }, 'Supports the claim'));
  const ratioInput = h('input', {
    type: 'number', id: 'mch-ratio', name: 'likelihoodRatio',
    min: String(MODEL_MIN_LIKELIHOOD_RATIO), max: String(MODEL_MAX_LIKELIHOOD_RATIO),
    step: '0.05', value: '3',
  });
  const observation = h('textarea', {
    id: 'mch-observation', name: 'observation', rows: 4,
    placeholder: 'What did you observe, and when? A dated fact beats a feeling — e.g. “the vendor’s rate-limit error appeared twice in the 12 Oct incident review, both times on the same endpoint.”',
  });
  const preview = h('p', { class: 'small', 'aria-live': 'polite' });

  const renderPreview = () => {
    const after = previewPosterior(claim.priorPct, directionSelect.value, ratioInput.value);
    preview.replaceChildren(
      h('span', { class: 'muted' }, `Neutral prior ${claim.priorPct}% → `),
      h('strong', null, `${after}%`),
      h('span', { class: 'muted' }, ` · direction: ${directionSelect.value === 'supports' ? 'supports' : 'challenges'}`),
    );
  };
  directionSelect.addEventListener('change', renderPreview);
  ratioInput.addEventListener('input', renderPreview);
  renderPreview();

  let close = () => {};
  const submit = () => {
    const result = ctx.api.recordModelChallenge({
      claimId: claim.id,
      observation: observation.value,
      direction: directionSelect.value,
      likelihoodRatio: Number(ratioInput.value),
    });
    if (!result.ok) {
      toast(result.error || 'The challenge could not be recorded.', 'bad');
      return;
    }
    const moved = result.posteriorPct != null ? ` Posterior now ${result.posteriorPct}%.` : '';
    const propagated = Array.isArray(result.propagations) ? result.propagations.length : 0;
    toast(`Challenge recorded.${moved}${propagated ? ` ${propagated} cross-module effect(s) propagated.` : ''}`, 'good');
    close();
    if (onDone) onDone();
    else if (ctx.refresh) ctx.refresh();
  };

  const errorNode = h('div', { class: 'view-stack', 'aria-live': 'assertive' });

  const body = h('div', { class: 'view-stack' },
    h('div', { class: 'card-flat' },
      h('p', { class: 'small' }, h('strong', null, claim.statement)),
      h('div', { class: 'row row-wrap' },
        badge(claim.trustLabel, MODEL_TRUST_GRADES[claim.trustGrade]?.tone === 'bad' ? 'bad'
          : MODEL_TRUST_GRADES[claim.trustGrade]?.tone === 'warn' ? 'warn'
            : MODEL_TRUST_GRADES[claim.trustGrade]?.tone === 'good' ? 'good' : 'neutral'),
        badge(`${claim.evidenceCount} record(s)`, 'neutral'),
        badge(claim.module, 'info'))),
    h('p', { class: 'small muted' },
      'Recording this does not rewrite anything. The observation is appended to a ledger, the posterior is recomputed at read time, and one DACI re-decision, one verification delegation and one blameless 1:1 prompt are opened in the same transaction.'),
    errorNode,
    h('div', { class: 'field' },
      h('label', { class: 'field-label', for: 'mch-observation' }, 'What did you observe?'),
      observation,
      h('p', { class: 'field-help' }, 'Kept local. Do not record anything you would not put in a written board pack.')),
    h('div', { class: 'grid-2' },
      h('div', { class: 'field' },
        h('label', { class: 'field-label', for: 'mch-direction' }, 'Direction'),
        directionSelect),
      h('div', { class: 'field' },
        h('label', { class: 'field-label', for: 'mch-ratio' }, 'Likelihood ratio'),
        ratioInput,
        h('p', { class: 'field-help' },
          `How much more likely this observation is if the claim is false than if it is true. ${MODEL_MIN_LIKELIHOOD_RATIO}–${MODEL_MAX_LIKELIHOOD_RATIO}. A “confidence score” belongs nowhere in this field.`))),
    h('div', { class: 'card-flat' }, preview,
      h('p', { class: 'muted tiny' },
        'Bayes in log-odds form (Good 1950). The neutral prior is a declared convention, not a measurement — the posterior measures your declared evidence, not the world.')),
  );

  const handle = openModal({
    title: 'Challenge a claim with dated evidence',
    description: claim.subjectLabel || claim.id,
    body,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => close() }, 'Cancel'),
      h('button', { class: 'btn btn-primary', type: 'button', onClick: submit }, 'Record challenge'),
    ],
  });
  close = handle && typeof handle.close === 'function' ? handle.close : () => {};
}
