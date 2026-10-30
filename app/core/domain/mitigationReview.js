/** Human-requested evidence gate on the shared event spine. No mitigation is
 * applied. One request freezes numeric assumptions into an existing DACI record,
 * assigns verification, and queues a blameless 1:1 prompt in one savepoint.
 * Existing decision/delegation schemas keep migration/export/undo boundaries.
 */
import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import {
  analyzeMitigationRobustness, robustnessDecision,
  robustnessEvidenceKey, robustnessMarker, ROBUSTNESS_EVENT, ROBUSTNESS_RULE_ID,
} from './mitigationRobustness.js';

export function mitigationReviewRule(draft, ctx = {}) {
  if (ctx.event?.type !== ROBUSTNESS_EVENT) return [];
  const source = (draft.cases || []).find((row) => row.id === ctx.event.entityId);
  if (!source || !['open', 'mitigating', 'monitoring'].includes(source.status)) throw new Error('An open operational case is required.');
  if (source.autoPropagate === false) return [];
  const request = ctx.event.automationOptions || {};
  const owner = (draft.people || []).find((row) => row.id === request.ownerId && row.status !== 'archived');
  if (!owner) throw new Error('Choose an active verification owner.');
  const report = analyzeMitigationRobustness(source, request.input);
  if (!report.ok) throw new Error(report.error);
  const key = robustnessEvidenceKey(source.id, report, owner.id);
  // A durable retry recomputes against current facts, but may never quietly
  // commission different work from a request whose numeric basis has changed.
  if (request.evidenceKey !== key) throw new Error('The numeric evidence changed. Run a fresh review.');
  if (robustnessDecision(draft, key)) return [];
  const today = dayKey(ctx.now);
  const stamp = ctx.now.toISOString();
  const due = addDays(today, Math.min(7, report.input.horizonDays));
  const marker = robustnessMarker(key);
  const effectBasis = report.input.constrainEffects
    ? `Declared effects: current-minus-proposed event probability ${report.input.probabilityReductionLow} to ${report.input.probabilityReductionHigh} percentage points; proposed-minus-current conditional loss ${report.input.conditionalLossChangeLow} to ${report.input.conditionalLossChangeHigh}, clipped to nonnegative proposed loss.`
    : 'Rectangular independent probability ranges; common conditional loss.';
  const question = [
    marker,
    `Human evidence gate — no mitigation applied. Horizon ${report.input.horizonDays} days; currency ${report.currency}; additional cost ${report.input.incrementalCost}.`,
    `Current event probability ${report.input.currentLow}–${report.input.currentHigh}%; proposed ${report.input.proposedLow}–${report.input.proposedHigh}%. Conditional loss (optimistic / most likely / pessimistic): ${report.losses.join(' / ')}.`,
    ...(report.input.constrainEffects ? [effectBasis, `Feasible proposed conditional loss: ${report.proposedLossLow} to ${report.proposedLossHigh}.`] : []),
    `Exact saving range ${report.savingLow} to ${report.savingHigh}. ${report.verdict}. Savage minimax-regret preference: ${report.preference}. Worst regret: hold ${report.holdRegret}; proposed ${report.proposedRegret}. Model-only perfect-information ceiling ${report.perfectInformationCeiling}; not EVSI or a research budget.`,
    `Captured declared assumptions in an editable decision record, not measured probabilities. ${effectBasis} Additional cost paid once; past costs sunk. No delay/research costs or causal proof. Verify denominator, comparable horizon, conditional severity and intervention evidence before choosing. Safety and compliance override financial rankings. Re-run if the facts change.`,
  ].join('\n\n');
  if (question.length > 2000) throw new Error('Numeric provenance exceeds the decision record limit. Shorten source identifiers before requesting a review.');
  const decision = {
    id: ctx.idFactory('dec'), title: `Evidence gate: ${source.title}`.slice(0, 200),
    question,
    date: today, chosen: '', rationale: '',
    driver: String(owner.name || '').slice(0, 120),
    approver: String(draft.settings?.leaderName || '').slice(0, 120),
    contributors: '', informed: '',
    options: [
      ['Hold current plan', 'No additional mitigation spend.', 'Retains the current exposure; validate safety duties separately.'],
      ['Fund proposed mitigation after evidence review', 'May reduce exposure under the declared assumptions.', 'Conditional economics are not causal evidence or permission to compromise safety.'],
      ['Gather discriminating evidence first', 'Test the ranges, horizon and conditional loss before committing.', `Delay has costs not priced here. Research spend is not justified merely by the model-only ceiling of ${report.perfectInformationCeiling} ${report.currency}.`],
    ].map(([label, pros, cons]) => ({ id: ctx.idFactory('opt'), label, pros, cons })),
    reviewOn: due, reviewedOn: null, outcome: 'pending', outcomeNotes: '',
    forecastProbability: null, decidedOn: null, reversibility: 'reversible', createdAt: stamp,
    portfolioNotes: [],
  };
  const delegation = {
    id: ctx.idFactory('delegation'), personId: owner.id,
    title: `Verify mitigation assumptions: ${source.title}`.slice(0, 200),
    expectedOutcome: [
      `Return evidence for the current ${report.input.currentLow}–${report.input.currentHigh}% and proposed ${report.input.proposedLow}–${report.input.proposedHigh}% event-probability ranges over ${report.input.horizonDays} days.`,
      'Name the exposure denominator, comparable observation window, source, limitations and what evidence would falsify the reduction. Verify that loss is conditional on the same event. Do not translate FMEA ratings into probabilities.',
      `Re-run robustness, then record a human verdict on decision ${decision.id}. Completion of this task is not proof of effectiveness.`,
    ].join(' '),
    authority: 'recommend',
    support: `Provide access to incident counts and intervention evidence, not private employee narratives. Additional proposed cost ${report.input.incrementalCost} ${report.currency}. ${marker}`,
    delegatedOn: today, dueOn: due, status: 'active', checkins: [],
    completedOn: null, completionNote: '', returnedOn: null, returnReason: '',
    createdAt: stamp, updatedAt: stamp,
  };
  draft.decisions.push(decision);
  draft.delegations.push(delegation);
  const linkCtx = { idFactory: ctx.idFactory, todayStr: today, nowIso: stamp };
  for (const [sourceType, sourceId, targetType, targetId, relation] of [
    ['case', source.id, 'decision', decision.id, 'decides'],
    ['case', source.id, 'delegation', delegation.id, 'mitigates'],
    ['decision', decision.id, 'delegation', delegation.id, 'tracks-followup'],
  ]) {
    ensureEntityLink(draft, { sourceType, sourceId, targetType, targetId, relation,
      ruleId: ROBUSTNESS_RULE_ID, summary: 'Human-requested numeric mitigation evidence gate; no mitigation applied.' }, linkCtx);
  }
  const topic = `[ROB:${decision.id}] What evidence would change our mitigation choice? Check the shared horizon and exposure denominator, not who to blame.`;
  // Never evict an employee's waiting topics to fit an automatic prompt.
  owner.talkingPoints = Array.isArray(owner.talkingPoints) ? owner.talkingPoints : [];
  const coached = owner.talkingPoints.length < 12;
  if (coached) {
    owner.talkingPoints.push(topic.slice(0, 200));
    ensureEntityLink(draft, { sourceType: 'case', sourceId: source.id, targetType: 'person', targetId: owner.id,
      relation: 'coaches', ruleId: ROBUSTNESS_RULE_ID, summary: 'Blameless evidence-gathering prompt; never a performance rating.' }, linkCtx);
  }
  const effects = [
    { targetType: 'decision', targetId: decision.id, summary: 'Opened a human mitigation evidence gate with frozen numeric assumptions.' },
    { targetType: 'delegation', targetId: delegation.id, summary: 'Assigned verification with a dated return of evidence.' },
    { targetType: 'person', targetId: owner.id, action: coached ? 'updated' : 'skipped', summary: coached ? 'Queued a blameless evidence prompt.' : 'Talking-point queue full; no existing topic removed. Verification remains in the delegation.' },
  ].map((effect) => ({ ruleId: ROBUSTNESS_RULE_ID, action: 'created', ...effect }));
  for (const effect of effects) ctx.logEvent?.({ type: 'automation.propagated', entity: effect.targetType, entityId: effect.targetId, summary: `${ROBUSTNESS_RULE_ID}: ${effect.summary}` });
  return effects;
}
