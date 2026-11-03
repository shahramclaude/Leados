/** RULE-MND-01..03 on the existing transactional post-commit spine. */
import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildSeats } from './seat.js';
import { MANDATE_EVENTS, MANDATE_RULE_IDS } from './mandateRegistry.js';
import { connectMandate, isOpenMandate, makeDecision, makeTask, sourceCatalog, sourceFingerprint, transitionMandate } from './mandates.js';

const effect = (ruleId, action, targetType, targetId, summary) => ({ ruleId, action, targetType, targetId, summary });
const terminal = (status) => ['expired', 'revoked', 'returned'].includes(status);

function closeTask(draft, mandate, ctx, reason) {
  const task = (draft.delegations || []).find((d) => d.id === mandate.taskId);
  if (task?.status === 'active') {
    task.status = 'returned'; task.returnedOn = dayKey(ctx.now); task.returnReason = reason; task.updatedAt = ctx.now.toISOString();
  }
}

/** Every loss of authority has a recovery owner; the workspace root gets a DACI call. */
export function recoverAuthority(draft, mandate, ctx, reason) {
  closeTask(draft, mandate, ctx, reason);
  if (mandate.recoveryTaskId || mandate.recoveryDecisionId) return [];
  const acceptance = (draft.decisions || []).find((d) => d.id === mandate.decisionId);
  if (acceptance && acceptance.outcome === 'pending') { acceptance.reviewedOn = dayKey(ctx.now); acceptance.outcome = 'bad'; acceptance.outcomeNotes = `Authority ${mandate.status}: ${reason}`.slice(0, 2000); }
  const built = buildSeats(draft, { now: ctx.now });
  const sender = built.byId.get(mandate.fromSeatId);
  const title = `Recover authority: ${mandate.title}`;
  if (sender && sender.id !== LEADER_ID) {
    const task = makeTask(ctx, sender.id, title, `The contract ${mandate.id} is ${mandate.status}. ${reason} Reassign within the original span, narrow the rights, or record why the source no longer needs action.`, mandate.expiresOn, `RULE-MND-03:${mandate.id}`);
    draft.delegations.unshift(task); mandate.recoveryTaskId = task.id;
    return [effect(MANDATE_RULE_IDS.RECOVER, 'created', 'delegation', task.id, 'Authority returned to a named recovery owner.')];
  }
  const decision = makeDecision(ctx, title, `${reason} Contract ${mandate.id}. Choose a new receiver or close the source explicitly. Silence does not extend authority.`, sender?.name || 'Workspace leader');
  draft.decisions.unshift(decision); mandate.recoveryDecisionId = decision.id;
  return [effect(MANDATE_RULE_IDS.RECOVER, 'created', 'decision', decision.id, 'Recovery decision opened at the workspace root.')];
}

/** Commitment accounting: acceptance encumbers; verification records actual;
 * loss of authority releases the unused encumbrance. Never infer an actual. */
export function reconcileBudget(draft, mandate, ctx) {
  if (!mandate.budgetId || !mandate.actions.includes('spend')) return;
  const budget = (draft.budgets || []).find((b) => b.id === mandate.budgetId);
  if (!budget) return;
  budget.lines = Array.isArray(budget.lines) ? budget.lines : [];
  let line = budget.lines.find((l) => l.id === mandate.budgetLineId);
  if (!line && ['active', 'delivered'].includes(mandate.status)) {
    line = { id: ctx.idFactory('bline'), title: `Authority reserve: ${mandate.title}`.slice(0, 200), category: 'other', status: 'committed',
      committedAmount: mandate.spendCeiling, actualAmount: null, committedOn: dayKey(ctx.now), expectedOn: mandate.expiresOn,
      spentOn: null, releasedOn: null, releasedReason: '', actualsDueOn: mandate.expiresOn,
      sourceType: 'decision', sourceId: mandate.decisionId, ownerId: mandate.toSeatId,
      note: `Encumbered by mandate ${mandate.id}; ceiling, not a prediction of spend.` };
    budget.lines.push(line); mandate.budgetLineId = line.id;
  }
  if (!line) return;
  if ((mandate.status === 'completed' || terminal(mandate.status)) && mandate.actualSpend !== null) {
    // A rejected outcome does not erase money already spent. Post the recorded
    // actual even when authority is returned/expired/revoked after delivery.
    line.status = 'spent'; line.actualAmount = mandate.actualSpend; line.spentOn = dayKey(ctx.now); line.actualsDueOn = null;
  } else if (terminal(mandate.status) && ['planned', 'committed'].includes(line.status)) {
    line.status = 'released'; line.releasedOn = dayKey(ctx.now); line.releasedReason = `Authority ${mandate.status}; no actual inferred.`; line.actualsDueOn = null;
  }
}

export function mandateRule(draft, ctx = {}) {
  if (!draft || !ctx.event) return [];
  const explicit = Object.values(MANDATE_EVENTS).includes(ctx.event.type);
  if (!explicit && draft.settings?.mandateAutoPropagate === false) return [];
  // Cheap guard before reading any large collection on unrelated writes.
  if (!Array.isArray(draft.mandates) || !draft.mandates.length) return [];
  const effects = [];
  const catalog = new Map(sourceCatalog(draft, { now: ctx.now }).map((i) => [`${i.type}:${i.entityId}`, i]));
  const built = buildSeats(draft, { now: ctx.now });
  for (const mandate of draft.mandates) {
    if (isOpenMandate(mandate)) {
      const item = catalog.get(`${mandate.sourceType}:${mandate.sourceId}`);
      const receiver = built.byId.get(mandate.toSeatId);
      const scopeChanged = item && (!receiver || !item.people.every((id) => receiver.scope.has(id)) || sourceFingerprint(item) !== mandate.sourceFingerprint);
      const task = (draft.delegations || []).find((d) => d.id === mandate.taskId);
      const taskEscalated = mandate.status !== 'proposed' && task && (task.personId !== mandate.toSeatId || task.authority !== 'recommend' || (task.dueOn && task.dueOn > mandate.expiresOn));
      const budget = mandate.actions.includes('spend') ? (draft.budgets || []).find((b) => b.id === mandate.budgetId) : null;
      const budgetChanged = mandate.actions.includes('spend') && (!budget || budget.status !== 'active' || budget.currency !== mandate.currency || (budget.endsOn && budget.endsOn < mandate.expiresOn));
      let reason = null;
      if (!item) reason = 'The source closed or left the open registry; authority is withdrawn, not silently retained.';
      else if (scopeChanged || taskEscalated) reason = 'The source fingerprint, scope or delegated task moved outside the accepted contract. Authority was revoked.';
      else if (budgetChanged) reason = 'The funding envelope closed, changed currency or no longer covers the expiry. Spending authority was revoked.';
      else if (mandate.expiresOn <= dayKey(ctx.now) && mandate.status !== 'delivered') reason = 'The expiry passed without a verified outcome. Silence is not an extension.';
      if (reason) {
        const status = !item || scopeChanged || taskEscalated || budgetChanged ? 'revoked' : 'expired';
        transitionMandate(draft, mandate, status, mandate.fromSeatId, reason, ctx, { closedAt: ctx.now.toISOString() });
        effects.push(effect(MANDATE_RULE_IDS.RECONCILE, status, 'mandate', mandate.id, reason));
        effects.push(...recoverAuthority(draft, mandate, ctx, reason));
        ctx.logEvent?.({ type: status === 'expired' ? MANDATE_EVENTS.EXPIRE : MANDATE_EVENTS.REVOKE, entity: 'mandate', entityId: mandate.id, summary: reason });
      } else if (mandate.status === 'active' && task?.status === 'done') {
        transitionMandate(draft, mandate, 'delivered', mandate.toSeatId, task.completionNote || 'Linked task completed; sender verification still required.', ctx, {
          deliveredAt: ctx.now.toISOString(), evidence: task.completionNote || '', evidenceRefs: [{ type: 'delegation', id: task.id }],
        });
        effects.push(effect(MANDATE_RULE_IDS.RECONCILE, 'delivered', 'mandate', mandate.id, 'Task completion is evidence, not sender verification.'));
      } else if (mandate.status === 'active' && task?.status === 'returned') {
        transitionMandate(draft, mandate, 'returned', mandate.toSeatId, task.returnReason || 'Linked task returned.', ctx, { closedAt: ctx.now.toISOString() });
        effects.push(...recoverAuthority(draft, mandate, ctx, 'The receiver returned the linked task.'));
      }
    }
    reconcileBudget(draft, mandate, ctx);
    if (explicit || terminal(mandate.status)) effects.push(...connectMandate(draft, mandate, ctx));
  }
  return effects;
}
