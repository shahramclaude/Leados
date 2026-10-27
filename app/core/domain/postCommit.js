/**
 * app/core/domain/postCommit.js — the generalized post-commit rules hook.
 *
 * ADR-0008: the store owns the atomic transaction boundary; pure domain rules
 * own what a committed event MEANS across modules. `createStore` calls this
 * once after the mutator and the audit event, before persistence, so any new
 * rule plugs into the same event-driven spine without editing the data layer
 * again. Rules receive a draft, the event, an injected clock/id factory and
 * the same `logEvent` function as actions.
 *
 * A rule failure is recorded in the append-only event log and surfaced in
 * warnings; it is never swallowed as a silent no-op.
 */

import { forecastIntegrityRule } from './forecastIntegrity.js';
import { resilienceRule } from './resilience.js';
import { decisionTempoRule } from './decisionTempo.js';
import { powerRule } from './power.js';

export const DEFAULT_POST_COMMIT_RULES = Object.freeze([
  forecastIntegrityRule,
  // Schema v29: operational resilience & continuity propagation runs before
  // decision tempo so any DACI continuity decision opened on a priced
  // survival shortfall can immediately receive a decision-tempo proposal in
  // the same atomic transaction (RULE-RES-01..06 -> RULE-DLY-03).
  resilienceRule,
  // Schema v30: coalition & incentive propagation runs before decision tempo
  // so a DACI coalition-strategy decision opened by RULE-PWR-02 can receive a
  // decision-tempo timing position in the same atomic transaction.
  powerRule,
  // Schema v28: decision timeboxes settle themselves, overdue calls become one
  // owned delegation, priced decisions get a proposal and value drift refreshes
  // the derived economics — all inside the source transaction (RULE-DLY-01..05).
  decisionTempoRule,
]);

export function runPostCommitRules(draft, context = {}) {
  const rules = Array.isArray(context.rules) ? context.rules : DEFAULT_POST_COMMIT_RULES;
  const results = [];
  for (const rule of rules) {
    if (typeof rule !== 'function') continue;
    try {
      const result = rule(draft, context);
      if (Array.isArray(result)) results.push(...result);
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      if (typeof context.logEvent === 'function') {
        context.logEvent({
          type: 'automation.rule_error',
          entity: 'workspace',
          entityId: '',
          summary: `A post-commit rule failed and was skipped: ${message}`.slice(0, 300),
        });
      }
      if (Array.isArray(context.warnings)) {
        context.warnings.push(`A post-commit rule failed and was skipped: ${message}`);
      }
    }
  }
  return results;
}
