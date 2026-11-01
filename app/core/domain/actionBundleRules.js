/** RULE-BND-01..03: provenance, one review checkpoint, and safe reconciliation. */
import { dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { resolveLinkedEntity } from './cases.js';
import { BUNDLE_EVENTS, BUNDLE_RULES } from './actionBundleRegistry.js';

export function actionBundleRule(draft, ctx = {}) {
  const event = ctx.event;
  if (!event || ![BUNDLE_EVENTS.COMMITTED, BUNDLE_EVENTS.WITHDRAWN, BUNDLE_EVENTS.ARCHIVED, BUNDLE_EVENTS.SCAN, 'case.automation.refresh'].includes(event.type)) return [];
  const scan = event.type === BUNDLE_EVENTS.SCAN;
  const effects = [];
  const opts = { idFactory: ctx.idFactory, todayStr: dayKey(ctx.now), nowIso: ctx.now.toISOString() };
  const link = (b, type, id, relation, ruleId) => {
    const r = ensureEntityLink(draft, { sourceType: 'bundle', sourceId: b.id, targetType: type, targetId: id, relation, ruleId,
      summary: relation === 'coordinates' ? 'Target of a human-reviewed atomic action bundle' : 'Source or review checkpoint of an action bundle' }, opts);
    if (r.created) effects.push({ ruleId, action: 'linked', targetType: type, targetId: id, summary: relation });
  };
  for (const b of draft.actionBundles || []) {
    if (!scan && event.entityId !== b.id && !(event.type === 'case.automation.refresh' && event.entityId === b.sourceId && b.status === 'committed')) continue;
    link(b, 'case', b.sourceId, 'responds-to', BUNDLE_RULES.LINK);
    for (const output of b.outputs || []) if (resolveLinkedEntity(draft, output.type, output.id)) link(b, output.type, output.id, 'coordinates', BUNDLE_RULES.LINK);
    if (!['committed', 'withdrawn'].includes(b.status)) continue;
    const token = `[BND-02:${b.id}]`;
    let task = (draft.delegations || []).find((d) => (d.support || '').includes(token));
    if (!task && b.status === 'committed' && draft.settings?.bundleAutoPropagate !== false) {
      const owner = (draft.people || []).find((p) => p.id === b.commands.find((a) => a.ownerId)?.ownerId && p.status !== 'archived');
      if (owner) {
        task = { id: ctx.idFactory('del'), personId: owner.id, title: `Close the action-bundle review: ${b.name}`.slice(0, 200),
          expectedOutcome: 'Review the delivered work, assumption evidence, budget and stakeholder briefs together. Record what changed and the next decision.',
          authority: 'recommend', support: `Open Action bundles and inspect the adopted receipt. ${token}`,
          delegatedOn: dayKey(ctx.now), dueOn: b.reviewOn, status: 'active', checkins: [], completedOn: null, completionNote: '', returnedOn: null, returnReason: '',
          createdAt: ctx.now.toISOString(), updatedAt: ctx.now.toISOString() };
        draft.delegations.push(task);
        effects.push({ ruleId: BUNDLE_RULES.FOLLOWUP, action: 'created', targetType: 'delegation', targetId: task.id, summary: 'One owned cross-module review checkpoint' });
      }
    }
    if (task) {
      if (b.status === 'withdrawn' && task.status === 'active' && !task.checkins.length) {
        task.status = 'returned'; task.returnedOn = dayKey(ctx.now); task.returnReason = 'The untouched action bundle was withdrawn; review work returned to the leader.'; task.updatedAt = ctx.now.toISOString();
      }
      link(b, 'delegation', task.id, 'tracks-followup', BUNDLE_RULES.FOLLOWUP);
    }
  }
  if (scan || event.type === BUNDLE_EVENTS.WITHDRAWN || event.type === BUNDLE_EVENTS.ARCHIVED) {
    const ids = new Set((draft.actionBundles || []).map((b) => b.id));
    const before = (draft.links || []).length;
    draft.links = (draft.links || []).filter((l) => l.sourceType !== 'bundle' || (ids.has(l.sourceId) && resolveLinkedEntity(draft, l.targetType, l.targetId)));
    if (before !== draft.links.length) effects.push({ ruleId: BUNDLE_RULES.RECONCILE, action: 'reconciled', targetType: 'link', targetId: '', summary: 'Removed edges to deleted bundle targets' });
  }
  return effects;
}