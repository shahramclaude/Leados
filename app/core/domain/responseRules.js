/** Generalized-spine rules for Response Studio. No module-to-module UI glue. */
import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { resolveLinkedEntity } from './cases.js';
import { resolveOwner } from './survival.js';
import { RESPONSE_RULE_IDS } from './response.js';

export const RESPONSE_EVENTS = Object.freeze({
  REHEARSED: 'response.rehearsed', SCHEDULED: 'response.scheduled',
  COMMITTED: 'response.committed', SCAN: 'response.scan', ARCHIVED: 'response.archived',
});
const effect = (ruleId, action, targetType, targetId, summary) => ({ ruleId, action, targetType, targetId, summary });
const marker = (id) => `[RSP-02:${id}]`;

export function responseRule(draft, context = {}) {
  const event = context.event;
  if (!event) return [];
  const scan = event.type === RESPONSE_EVENTS.SCAN;
  if (!scan && ![RESPONSE_EVENTS.REHEARSED, RESPONSE_EVENTS.SCHEDULED, RESPONSE_EVENTS.ARCHIVED, 'case.created'].includes(event.type)) return [];
  if (event.type === 'case.created' && !event.responsePlanId) return [];
  const plans = draft.responsePlans || [];
  const selected = scan ? plans : plans.filter((p) => p.id === (event.responsePlanId || event.entityId));
  const effects = [];
  const opts = { idFactory: context.idFactory, todayStr: dayKey(context.now), nowIso: context.now.toISOString() };
  const link = (plan, targetType, targetId, relation, ruleId) => {
    const result = ensureEntityLink(draft, { sourceType: 'response', sourceId: plan.id, targetType, targetId, relation, ruleId,
      summary: relation === 'rehearses' ? 'Response rehearsal of a pending situation note' : relation === 'responds-to' ? 'Adopted response case' : 'Response review follow-up' }, opts);
    if (result.created) effects.push(effect(ruleId, 'linked', targetType, targetId, relation));
  };
  for (const plan of selected) {
    if ((draft.intakeDrafts || []).some((d) => d.id === plan.intakeDraftId)) link(plan, 'intake', plan.intakeDraftId, 'rehearses', RESPONSE_RULE_IDS.LINK);
    if (plan.caseId && (draft.cases || []).some((c) => c.id === plan.caseId)) link(plan, 'case', plan.caseId, 'responds-to', RESPONSE_RULE_IDS.ADOPT);
    if (plan.status !== 'scheduled' || !plan.reviewOn || draft.settings?.responseAutoPropagate === false) continue;
    const tag = marker(plan.id);
    const existingTask = (draft.delegations || []).find((d) => (d.support || '').includes(tag));
    const existingDecision = (draft.decisions || []).find((d) => (d.rationale || '').includes(tag));
    if (existingTask) { link(plan, 'delegation', existingTask.id, 'tracks-followup', RESPONSE_RULE_IDS.FOLLOWUP); continue; }
    if (existingDecision) { link(plan, 'decision', existingDecision.id, 'decides', RESPONSE_RULE_IDS.FOLLOWUP); continue; }
    const ownerId = resolveOwner(draft, { ownerId: plan.caseInput?.ownerId });
    if (ownerId) {
      const task = {
        id: context.idFactory('delegation'), personId: ownerId,
        title: 'Review the rehearsed leadership response',
        expectedOutcome: 'Re-read the current facts, then commit, revise or explicitly reschedule the response. A rehearsal is not permission to act on stale facts.',
        authority: 'recommend', support: `Open Response Studio and rehearse current facts before adoption. ${tag}`,
        delegatedOn: dayKey(context.now), dueOn: plan.reviewOn, status: 'active', checkins: [],
        completedOn: null, completionNote: '', returnedOn: null, returnReason: '',
        createdAt: context.now.toISOString(), updatedAt: context.now.toISOString(),
      };
      draft.delegations.push(task);
      link(plan, 'delegation', task.id, 'tracks-followup', RESPONSE_RULE_IDS.FOLLOWUP);
      effects.push(effect(RESPONSE_RULE_IDS.FOLLOWUP, 'created', 'delegation', task.id, 'One owned response-review checkpoint'));
    } else {
      const decision = {
        id: context.idFactory('dec'), title: 'Review the delayed leadership response',
        question: 'Commit the reviewed response, revise it from current facts, or explicitly extend the wait?',
        date: dayKey(context.now), reversibility: 'reversible', driver: 'Workspace leader', approver: 'Workspace leader',
        contributors: '', informed: '', options: [
          { id: context.idFactory('dopt'), label: 'Commit after a fresh rehearsal', pros: 'Coordinated action', cons: 'Uses the declared mitigation budget' },
          { id: context.idFactory('dopt'), label: 'Revise the response', pros: 'Uses new evidence', cons: 'Requires another review' },
          { id: context.idFactory('dopt'), label: 'Extend the wait explicitly', pros: 'Buys time', cons: 'Carrying cost continues' },
        ], chosen: '', rationale: `No accountable roster owner could be resolved; no owner was invented. ${tag}`,
        reviewOn: plan.reviewOn, reviewedOn: null, outcome: 'pending', outcomeNotes: '',
        forecastProbability: null, decidedOn: null, portfolioNotes: [], createdAt: context.now.toISOString(),
      };
      draft.decisions.push(decision);
      link(plan, 'decision', decision.id, 'decides', RESPONSE_RULE_IDS.FOLLOWUP);
      effects.push(effect(RESPONSE_RULE_IDS.FOLLOWUP, 'created', 'decision', decision.id, 'One governed response-review decision'));
    }
  }
  if (scan) {
    const ids = new Set(plans.map((p) => p.id));
    const before = (draft.links || []).length;
    draft.links = (draft.links || []).filter((l) => l.sourceType !== 'response'
      || (ids.has(l.sourceId) && resolveLinkedEntity(draft, l.targetType, l.targetId)));
    if (draft.links.length !== before) effects.push(effect(RESPONSE_RULE_IDS.SCAN, 'reconciled', 'link', '', 'Removed edges to deleted response plans'));
  }
  return effects;
}
