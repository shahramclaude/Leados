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

import { caseCreatedRule } from './caseLifecycle.js';
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
import { earlyWarningRule } from './earlyWarning.js';

export const DEFAULT_POST_COMMIT_RULES = Object.freeze([
  // One handler for both user-entered cases and cases created by another rule.
  caseCreatedRule,
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
  // Schema v39: the Early-Warning Watch. The scan is the *sensing* layer: it
  // re-tests monitored series using a nominal BH-style screening heuristic,
  // records promotions AND suppressions, freezes future-week predictions,
  // and — only on a recorded human verdict — opens one
  // operational case, plus at most one decision per governor. It runs before
  // decision tempo so a triage decision receives a timing position in the same
  // atomic transaction.
  earlyWarningRule,
  // Schema v28: decision timeboxes settle themselves, overdue calls become one
  // owned delegation, priced decisions get a proposal and value drift refreshes
  // the derived economics — all inside the source transaction (RULE-DLY-01..05).
  decisionTempoRule,
]);

/** Maximum distinct events, including the originating action, per transaction. */
export const MAX_AUTOMATION_EVENTS = 64;

// Existing rule producers do not all know their subscribers. Detect genuinely
// new first-class records at a successful rule boundary and publish their
// lifecycle events. Explicit emissions win (and can carry safe options).
const CREATED_RECORD_EVENTS = Object.freeze([
  ['cases', 'case'], ['decisions', 'decision'], ['delegations', 'delegation'], ['portfolio', 'portfolio'],
]);

function createdRecordEvents(before, after) {
  const out = [];
  for (const [collection, entity] of CREATED_RECORD_EVENTS) {
    const oldIds = new Set((Array.isArray(before?.[collection]) ? before[collection] : [])
      .map((item) => item?.id).filter((id) => typeof id === 'string' && id));
    for (const item of (Array.isArray(after?.[collection]) ? after[collection] : [])) {
      if (item && typeof item.id === 'string' && item.id && !oldIds.has(item.id)) {
        out.push({ type: `${entity}.created`, entity, entityId: item.id });
        oldIds.add(item.id);
      }
    }
  }
  return out;
}

/**
 * Drain a bounded, breadth-first queue inside the source transaction. A rule
 * may emit a typed event using `ctx.emitEvent`. Emissions, logs, warnings and
 * writes are all held behind the emitting rule's savepoint. A subscriber sees
 * the emitted event only after the producer commits, and subscribers may emit
 * further events. Newly created cases, decisions, delegations and portfolio
 * records also publish lifecycle events automatically. Duplicate (type, entity, entityId) tuples are processed once
 * per transaction; this bounds cycles without equating separate entities.
 *
 * This is deliberately synchronous: source, downstream writes and audit log
 * are published in the same store write. It is not a background job or a
 * guarantee that all effects succeed: an isolated subscriber failure is logged.
 */
export function runPostCommitRules(draft, context = {}) {
  const rules = Array.isArray(context.rules) ? context.rules : DEFAULT_POST_COMMIT_RULES;
  const results = [];
  const queue = [{ event: context.event || null, derived: false }];
  const eventKey = (event) => JSON.stringify([event.type, event.entity, event.entityId]);
  const seen = new Set();
  if (context.event && typeof context.event.type === 'string') seen.add(eventKey(context.event));
  // The source action may itself have created secondary records inline. Send
  // their lifecycle events too, while never exposing the prior workspace to
  // subscribers. The root event takes precedence when it describes a record.
  if (context.event && context.previousState) {
    let omitted = 0;
    for (const event of createdRecordEvents(context.previousState, draft)) {
      const key = eventKey(event);
      if (seen.has(key)) continue;
      if (seen.size >= MAX_AUTOMATION_EVENTS) { omitted += 1; continue; }
      seen.add(key);
      queue.push({ event, derived: true });
      if (typeof context.logEvent === 'function') context.logEvent({
        ...event, summary: `Derived ${event.type} from ${context.event.type} via source action`.slice(0, 300),
      });
    }
    if (omitted) {
      const message = `Automation event limit (${MAX_AUTOMATION_EVENTS}) reached; ${omitted} source-created event(s) were not delivered.`;
      if (typeof context.logEvent === 'function') context.logEvent({ type: 'automation.rule_error', entity: 'workspace', entityId: '', summary: message });
      if (Array.isArray(context.warnings)) context.warnings.push(message);
    }
  }
  const ruleContext = { ...context };
  delete ruleContext.previousState;

  for (let next = 0; next < queue.length; next += 1) {
    const current = queue[next];
    for (const rule of rules) {
      if (typeof rule !== 'function') continue;
      const bufferedEvents = [];
      const bufferedWarnings = [];
      const bufferedEmissions = [];
      const pendingKeys = new Set();
      try {
        const candidate = JSON.parse(JSON.stringify(draft));
        const emitEvent = (emission) => {
          if (!emission || typeof emission.type !== 'string'
            || !/^[a-z][a-zA-Z0-9.-]{0,79}$/.test(emission.type)
            || typeof emission.entity !== 'string' || !emission.entity
            || typeof emission.entityId !== 'string' || !emission.entityId) {
            throw new Error('A derived event needs a valid type, entity and entityId.');
          }
          // Copy immediately so a producer cannot modify a queued event later.
          const event = JSON.parse(JSON.stringify(emission));
          const key = eventKey(event);
          if (seen.has(key) || pendingKeys.has(key)) return false;
          if (seen.size + pendingKeys.size >= MAX_AUTOMATION_EVENTS) {
            throw new Error(`Automation event limit (${MAX_AUTOMATION_EVENTS}) reached; this rule was rolled back.`);
          }
          pendingKeys.add(key);
          bufferedEmissions.push(event);
          return true;
        };
        const result = rule(candidate, {
          ...ruleContext,
          event: current.event,
          derived: current.derived,
          logEvent: (entry) => bufferedEvents.push(entry),
          warnings: bufferedWarnings,
          emitEvent,
        });
        if (result && typeof result.then === 'function') {
          throw new Error('Automation rules must be synchronous.');
        }
        for (const event of createdRecordEvents(draft, candidate)) emitEvent(event);
        if (Array.isArray(context.trace)) {
          context.trace.push({ rule: rule.name || 'anonymous', event: current.event?.type || null,
            derived: current.derived, status: 'committed',
            collections: Object.keys(candidate).filter((key) => Array.isArray(candidate[key])
              && !['events', 'conflicts', 'pulses'].includes(key)
              && JSON.stringify(candidate[key]) !== JSON.stringify(draft[key])),
            effects: Array.isArray(result) ? result.length : 0,
            emitted: bufferedEmissions.length });
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
        for (const event of bufferedEmissions) {
          seen.add(eventKey(event));
          queue.push({ event, derived: true });
          if (typeof context.logEvent === 'function') {
            context.logEvent({ type: event.type, entity: event.entity, entityId: event.entityId,
              summary: `Derived ${event.type} from ${current.event?.type || 'an action'} via ${rule.name || 'a rule'}`.slice(0, 300) });
          }
        }
      } catch (error) {
        if (Array.isArray(context.trace)) context.trace.push({
          rule: rule.name || 'anonymous', event: current.event?.type || null,
          derived: current.derived, status: 'rolled-back', collections: [], effects: 0, emitted: 0,
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
  }
  return results;
}
