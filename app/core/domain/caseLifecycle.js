/**
 * The common entry point for newly created operational cases.
 *
 * A case can be entered directly or produced by another domain rule. Both
 * paths use exactly the same forecast freeze and cross-module case rules.
 * The enclosing post-commit runner owns the savepoint and persistence boundary.
 */
import { freezeCaseForecast, propagateCaseEvent } from './automation.js';

export function caseCreatedRule(draft, context = {}) {
  const event = context.event;
  if (!event || !['case.created', 'case.automation.refresh'].includes(event.type) || !event.entityId) return [];
  const record = (draft.cases || []).find((item) => item && item.id === event.entityId);
  if (!record) throw new Error('The created case is missing; case automation could not run.');
  const frozen = freezeCaseForecast(draft, record, {
    now: context.now,
    logEvent: context.logEvent,
  });
  const effects = propagateCaseEvent(draft, record, {
    now: context.now,
    idFactory: context.idFactory,
    logEvent: context.logEvent,
    options: event.automationOptions || {},
  });
  if (frozen) effects.push(frozen);
  return effects;
}
