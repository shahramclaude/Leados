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
import { networkRule } from './orgNetwork.js';
import { impactRule } from './impactRules.js';
import { commsRule } from './comms.js';
import { allocationRule } from './allocation.js';
import { loadRule } from './load.js';
import { premiseRule } from './premises.js';
import { dynamicsRule } from './dynamics.js';
import { policyPortfolioRule } from './policyPortfolio.js';

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
  // Session 48 (additive, schema v30): influence-network intelligence fans one
  // analysis into typed links, a cross-training delegation, a DACI org-design
  // decision, blameless 1:1 talking points and signals. Runs before decision
  // tempo so the org-design decision receives a timing position identically.
  networkRule,
  // Schema v31: a scored Impact Ledger study fans out into typed links, a
  // scale/stop DACI decision, a blameless process check-in and a proposed
  // replication. Runs before decision tempo so the scale/stop decision can
  // receive a timing position in the same atomic transaction.
  impactRule,
  // Schema v32: stakeholder comms outbox. Drafts a brief for key and opposing
  // stakeholders on every case event, owes a closure note to anyone briefed,
  // and marks drafts sent when a stakeholder touch is logged. Runs after the
  // case-level engines so it always reads the case as it was just committed.
  commsRule,
  // Schema v33: the Allocation Governor. Portfolio events re-measure the
  // explore/exploit mix; an exploration-floor breach opens one DACI
  // rebalancing decision. Runs before decision tempo so that decision
  // receives a timing position in the same atomic transaction.
  allocationRule,
  // Schema v34: the Cognitive Load & Attention Governor. Commitment,
  // delegation, dependency and roster events re-measure per-person
  // saturation; crossing the threshold opens one DACI load-shedding
  // decision plus blameless 1:1 prompts. Runs before decision tempo so the
  // load-shedding decision receives a timing position in the same transaction.
  loadRule,
  // Schema v36: premise outcomes append typed calibration lineage on the same
  // generalized rule spine; evidence-quality metrics remain a derived read model.
  // Schema v35: the Premise Sentinel senses evidence created by every rule
  // above and fans a breached signpost into one DACI re-decision, one owner
  // verification delegation and one blameless 1:1 prompt. It must run before
  // decision tempo so that re-decision is priced in the same transaction.
  premiseRule,
  // Schema v37: the Operating System Dynamics Lab senses structural risk from
  // the committed records, opens at most one DACI structural decision, queues
  // one blameless archetype talking point and — when an experiment is adopted —
  // one owned checkpoint with the prediction frozen. Runs before decision tempo
  // so the structural decision is priced in the same atomic transaction.
  dynamicsRule,
  // Schema v38: the Structural Capital Allocation terminal. An adopted
  // portfolio opens exactly one DACI commitment decision and one owned
  // out-of-sample checkpoint — both frozen from the attribution and baseline
  // captured at adoption, so the rule never re-runs the optimizer. It runs
  // before decision tempo so the commitment is priced in the same transaction.
  policyPortfolioRule,
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
    // A rule is a savepoint: publish neither its writes nor its success log
    // until it returns. Earlier successful rules remain visible to later ones.
    // JSON matches the store's persisted, JSON-only data contract.
    const bufferedEvents = [];
    const bufferedWarnings = [];
    try {
      const candidate = JSON.parse(JSON.stringify(draft));
      const result = rule(candidate, {
        ...context,
        logEvent: (entry) => bufferedEvents.push(entry),
        warnings: bufferedWarnings,
      });
      if (Array.isArray(context.trace)) {
        context.trace.push({ rule: rule.name || 'anonymous', status: 'committed',
          collections: Object.keys(candidate).filter((key) => Array.isArray(candidate[key])
            && !['events', 'conflicts', 'pulses'].includes(key)
            && JSON.stringify(candidate[key]) !== JSON.stringify(draft[key])),
          effects: Array.isArray(result) ? result.length : 0 });
      }
      for (const key of Object.keys(draft)) {
        if (!Object.hasOwn(candidate, key)) delete draft[key];
      }
      Object.assign(draft, candidate);
      if (typeof context.logEvent === 'function') {
        for (const entry of bufferedEvents) context.logEvent(entry);
      }
      if (Array.isArray(context.warnings)) context.warnings.push(...bufferedWarnings);
      if (Array.isArray(result)) results.push(...result);
    } catch (error) {
      if (Array.isArray(context.trace)) context.trace.push({
        rule: rule.name || 'anonymous', status: 'rolled-back', collections: [], effects: 0,
      });
      const message = error && error.message ? error.message : String(error);
      if (typeof context.logEvent === 'function') {
        context.logEvent({
          type: 'automation.rule_error',
          entity: 'workspace',
          entityId: '',
          summary: `Post-commit rule ${rule.name || 'anonymous'} rolled back: ${message}`.slice(0, 300),
        });
      }
      if (Array.isArray(context.warnings)) {
        context.warnings.push(`Post-commit rule ${rule.name || 'anonymous'} rolled back: ${message}`);
      }
    }
  }
  return results;
}
