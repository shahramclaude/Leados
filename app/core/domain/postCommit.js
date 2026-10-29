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

import { createSavepointDraft } from './savepoint.js';
import { isDeclineMemoizable, ruleLabel } from './propagationContracts.js';
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
import { strategyRule } from './strategy.js';
import { learningRule } from './learning.js';
import { mitigationReviewRule } from './mitigationReview.js';
import { continuityCouplingRule } from './continuityCouplingRule.js';
import { leaderContinuityRule } from './leaderContinuityRule.js';
import { measurementRule } from './measurementRule.js';

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
  // Schema v42: the Strategy Coherence Terminal. Adopting a bet fans out into a
  // commitment decision, a tagging delegation and a blameless talking point; an
  // explicit audit evaluates the say–do gap, missing stop rules and overdue
  // verdicts. It runs before decision tempo so any decision it opens that
  // carries a value at stake receives a timing position (cost of delay, option
  // to wait) in the same atomic transaction, which is the point of the spine.
  strategyRule,
  // Schema v43: the After-Action Review & Learning Ledger. The cheap path runs
  // on the case/change/decision/delegation close events and writes exactly one
  // empty review from the closing record — the pre-filled intention and outcome,
  // no cause and no lesson. The expensive path runs only on `learning.*`, so no
  // other module's write pays for a workspace scan here.
  learningRule,
  // Human-requested robust evidence gates publish real decisions and owned
  // verification work; derived lifecycle events reach the same subscribers.
  mitigationReviewRule,
  // Continuity-coupled ("all-weather") portfolio simulation: senses when
  // service/vendor outage shocks and dual-hat steward contention break a
  // fair-weather plan, opening one DACI continuity-delivery decision and
  // blameless steward relief before decisionTempoRule prices the timebox.
  continuityCouplingRule,
  // Schema v45: the Leader Continuity Drill. A human-commissioned hand-over
  // becomes one DACI decision plus owned deputy delegations, and a closed drill
  // can open one calibration decision. It runs before decision tempo so the
  // hand-over and calibration calls receive a timing position in the same
  // atomic transaction.
  leaderContinuityRule,
  // Schema v47: the Scorecard Integrity Lab. A committed scorecard whose declared
  // incentives are modelled to pay mostly for gaming opens one DACI redesign
  // decision, owned counter-metric work and a single blameless 1:1 prompt; a
  // falsified observation opens one calibration decision and a pre-filled review.
  // It runs before decision tempo so the redesign decision receives a timing
  // position in the same atomic transaction.
  measurementRule,
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

/**
 * New first-class records that appeared between `before` and `after`.
 *
 * `afterOf` is a key reader rather than an object so the caller can pass the
 * savepoint's non-materialising `peek`. Reading through a lazy draft is what
 * keeps this check from cloning every collection just to prove nothing was
 * created: an untouched collection is by definition identical to `before`.
 */
function createdRecordEvents(before, afterOf) {
  const out = [];
  for (const [collection, entity] of CREATED_RECORD_EVENTS) {
    const prior = Array.isArray(before?.[collection]) ? before[collection] : [];
    const next = afterOf(collection);
    if (!Array.isArray(next) || next === prior) continue;
    const oldIds = new Set(prior.map((item) => item?.id).filter((id) => typeof id === 'string' && id));
    for (const item of next) {
      if (item && typeof item.id === 'string' && item.id && !oldIds.has(item.id)) {
        out.push({ type: `${entity}.created`, entity, entityId: item.id });
        oldIds.add(item.id);
      }
    }
  }
  return out;
}

/**
 * Per-transaction instrumentation. ADR-0026: the engine used to be opaque — a
 * leader could not see which automations ran, which declined, what each one
 * cost, or where the wall-clock time went. Every (rule, event) pair now records
 * an outcome and a duration, so the Propagation Ledger can price the chain and
 * the Cost Governor can name its hotspots with measured numbers rather than an
 * opinion.
 *
 * The recorder is opt-in through `context.metrics`; when no recorder is
 * supplied the engine allocates nothing and behaves exactly as before.
 */
function createRecorder() {
  return { pairs: [], events: 0, rules: 0, skipped: 0, elapsedMs: 0 };
}

function recordPair(reporter, entry) {
  if (!reporter) return;
  reporter.pairs.push(entry);
}

/**
 * ADR-0026 — durable failure receipts (Schema v41).
 *
 * Before this, a rule that threw was written to the audit log and reported as a
 * warning, and then the transaction carried on. The downstream artifacts that
 * rule existed to create were simply absent, with no way to discover that after
 * the toast faded or to ask for them again. A receipt keeps the triggering
 * event and the error so the propagation can be retried against current state.
 *
 * The receipt is written straight into the live draft, outside the failed
 * rule's savepoint, because the savepoint is precisely what was rolled back.
 * It is deliberately content-free: event identity and an error message only.
 */
export const PROPAGATION_RECEIPT_CAP = 50;

function recordReceipt(draft, context, event, rule, message) {
  if (!draft || !Array.isArray(draft.propagationReceipts)) return;
  const idFactory = typeof context.idFactory === 'function' ? context.idFactory : null;
  const now = context.now instanceof Date ? context.now : new Date(context.now || Date.now());
  draft.propagationReceipts.push({
    id: idFactory ? idFactory('rcpt') : `rcpt-${now.getTime()}-${draft.propagationReceipts.length}`,
    at: now.toISOString(),
    rule: String(rule && rule.name ? rule.name : 'anonymous').slice(0, 80),
    eventType: String(event?.type || '').slice(0, 80),
    entity: String(event?.entity || '').slice(0, 40),
    entityId: String(event?.entityId || '').slice(0, 60),
    error: String(message || '').slice(0, 300),
    status: 'open',
    attempts: [],
    resolvedAt: null,
  });
  if (draft.propagationReceipts.length > PROPAGATION_RECEIPT_CAP) {
    draft.propagationReceipts.splice(0, draft.propagationReceipts.length - PROPAGATION_RECEIPT_CAP);
  }
}

/** Monotonic clock available in browsers, workers and Node. */
const nowMs = () => (typeof performance !== 'undefined' && performance.now
  ? performance.now()
  : Date.now());

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
  const reporter = context.metrics && typeof context.metrics === 'object' ? context.metrics : null;
  const startedAt = reporter ? nowMs() : 0;
  if (reporter) {
    if (!Array.isArray(reporter.pairs)) reporter.pairs = [];
    reporter.events = 0;
    reporter.rules = rules.length;
    reporter.declined = 0;
    reporter.executed = 0;
    reporter.rolledBack = 0;
  }
  const results = [];
  /**
   * ADR-0026 decline memo. A scan rule that declined at workspace version V for
   * event type T will decline again for every later T in the same transaction,
   * because V has not moved: the rule reads no entity, only the workspace and
   * the event type. Collapsing that re-run is unobservable — it is applied only
   * to a pair that produced no write, no emission, no audit entry, no warning
   * and no effect list.
   *
   * Only rules in DECLINE_MEMO_RULES are eligible, and that membership is
   * proven by test. An unproven rule is never skipped.
   */
  let draftVersion = 0;
  const declined = new Set();
  const queue = [{ event: context.event || null, derived: false }];
  const eventKey = (event) => JSON.stringify([event.type, event.entity, event.entityId]);
  const seen = new Set();
  if (context.event && typeof context.event.type === 'string') seen.add(eventKey(context.event));
  // The source action may itself have created secondary records inline. Send
  // their lifecycle events too, while never exposing the prior workspace to
  // subscribers. The root event takes precedence when it describes a record.
  if (context.event && context.previousState) {
    let omitted = 0;
    for (const event of createdRecordEvents(context.previousState, (key) => draft[key])) {
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
    if (reporter && next > 0) reporter.events += 1;
    else if (reporter) reporter.events += 1;
    for (const rule of rules) {
      if (typeof rule !== 'function') continue;
      // `declineMemo: false` is a test seam, like `savepoint: 'clone'`: it lets
      // the equivalence suite prove that collapsing a declined re-run produces
      // the same workspace as never collapsing one. Nothing in the app sets it.
      const memoKey = context.declineMemo !== false && isDeclineMemoizable(rule)
        ? `${ruleLabel(rule)}|${current.event?.type || ''}|${draftVersion}` : null;
      if (memoKey && declined.has(memoKey)) {
        if (reporter) reporter.skipped = (reporter.skipped || 0) + 1;
        if (Array.isArray(context.trace)) {
          context.trace.push({ rule: rule.name || 'anonymous', event: current.event?.type || null,
            derived: current.derived, status: 'declined-memo', collections: [], effects: 0, emitted: 0 });
        }
        continue;
      }
      const pairStartedAt = reporter ? nowMs() : 0;
      const bufferedEvents = [];
      const bufferedWarnings = [];
      const bufferedEmissions = [];
      const pendingKeys = new Set();
      try {
        // ADR-0026: a lazy savepoint instead of a whole-workspace deep copy.
        // A rule that returns early on its event-type guard now costs nothing
        // to run, which is what most (rule, event) pairs do.
        //
        // `savepoint: 'clone'` restores the pre-ADR-0026 strategy verbatim.
        // It exists so the equivalence suite can prove the two strategies
        // produce byte-identical workspaces, and so a future regression can be
        // bisected against the old behaviour. Nothing in the app sets it.
        const savepoint = createSavepointDraft(draft, { strategy: context.savepoint });
        const candidate = savepoint.draft;
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
        for (const event of createdRecordEvents(draft, savepoint.peek)) emitEvent(event);
        const committed = savepoint.commitInto(draft);
        const changedCollections = committed.collections
          .filter((key) => !['events', 'conflicts', 'pulses'].includes(key));
        const applied = changedCollections.length > 0 || bufferedEmissions.length > 0;
        recordPair(reporter, {
          rule: rule.name || 'anonymous',
          event: current.event?.type || null,
          derived: current.derived,
          status: applied ? 'applied' : 'declined',
          collections: changedCollections,
          effects: Array.isArray(result) ? result.length : 0,
          emitted: bufferedEmissions.length,
          ms: reporter ? nowMs() - pairStartedAt : 0,
        });
        if (reporter) { if (applied) reporter.executed += 1; else reporter.declined += 1; }
        if (memoKey) {
          const inert = !applied && bufferedEvents.length === 0 && bufferedWarnings.length === 0
            && (!Array.isArray(result) || result.length === 0);
          if (inert) declined.add(memoKey);
        }
        if (applied) draftVersion += 1;
        if (Array.isArray(context.trace)) {
          context.trace.push({ rule: rule.name || 'anonymous', event: current.event?.type || null,
            derived: current.derived, status: 'committed',
            collections: committed.collections.filter((key) => !['events', 'conflicts', 'pulses'].includes(key)),
            effects: Array.isArray(result) ? result.length : 0,
            emitted: bufferedEmissions.length });
        }
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
        // Rollback: dropping the savepoint is the rollback. Nothing was ever
        // written into `draft`, so there is nothing to undo.
        if (Array.isArray(context.trace)) context.trace.push({
          rule: rule.name || 'anonymous', event: current.event?.type || null,
          derived: current.derived, status: 'rolled-back', collections: [], effects: 0, emitted: 0,
        });
        const message = error && error.message ? error.message : String(error);
        recordPair(reporter, {
          rule: rule.name || 'anonymous',
          event: current.event?.type || null,
          derived: current.derived,
          status: 'rolled-back',
          collections: [],
          effects: 0,
          emitted: 0,
          error: message.slice(0, 200),
          ms: reporter ? nowMs() - pairStartedAt : 0,
        });
        if (reporter) reporter.rolledBack += 1;
        if (context.suppressReceipt !== true) recordReceipt(draft, context, current.event, rule, message);
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
  if (reporter) reporter.elapsedMs = nowMs() - startedAt;
  return results;
}
