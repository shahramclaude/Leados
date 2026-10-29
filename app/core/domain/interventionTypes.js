/**
 * app/core/domain/interventionTypes.js — the one intervention vocabulary.
 *
 * Before Schema v50 this list existed twice, once as `IMPACT_INTERVENTION_TYPES`
 * in the data contract and once as `INTERVENTION_TYPES` in the Impact engine,
 * held together by a comment asking future maintainers to keep them identical.
 * The fidelity ledger needs the same vocabulary for a third time, which was the
 * point at which copying became the wrong answer: a plan and a study that
 * disagree about what "oneonone" means would silently stop joining.
 *
 * `entityType` names an existing LeadOS collection so typed links, deep links
 * and demo cleanup all resolve through one registry (`domain/cases.js`) rather
 * than a parallel relationship vocabulary.
 */

export const INTERVENTION_TYPES = Object.freeze([
  { id: 'oneonone', label: '1:1 / conversation cadence', entityType: 'oneonone' },
  { id: 'feedback', label: 'Feedback push', entityType: 'feedback' },
  { id: 'delegation', label: 'Delegation reset', entityType: 'delegation' },
  { id: 'goal', label: 'Goal or OKR programme', entityType: 'goal' },
  { id: 'case', label: 'Operational case response', entityType: 'case' },
  { id: 'change', label: 'Org change intervention', entityType: 'change' },
  { id: 'decision', label: 'Decision process change', entityType: 'decision' },
  { id: 'negotiation', label: 'Negotiation campaign', entityType: 'negotiation' },
  { id: 'stakeholder', label: 'Stakeholder campaign', entityType: 'stakeholder' },
  { id: 'hiring', label: 'Hiring / selection', entityType: 'requisition' },
  { id: 'power', label: 'Coalition strategy', entityType: 'power' },
  { id: 'network', label: 'Network or cross-training', entityType: 'network' },
  { id: 'other', label: 'Something else', entityType: null },
]);

export const INTERVENTION_BY_ID = Object.freeze(
  Object.fromEntries(INTERVENTION_TYPES.map((type) => [type.id, type])),
);

export const INTERVENTION_IDS = Object.freeze(INTERVENTION_TYPES.map((type) => type.id));
