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
import {
  appendPropagationLineage,
  isTraceablePropagationEvent,
  makePropagationLineageStep,
  PROPAGATION_LINEAGE_EVENT_CAP,
  PROPAGATION_LINEAGE_LINK_CAP,
  PROPAGATION_LINEAGE_STEP_CAP,
  PROPAGATION_LINEAGE_TARGET_CAP,
} from './automationLineage.js';
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
import { fidelityRule } from './fidelityRules.js';
import { compRule } from './compRules.js';
import { transitionRule } from './transitionRules.js';
import { orgDesignRule } from './orgDesignRules.js';
import { valueOfInformationRule } from './valueOfInformationRules.js';
import { sequentialInvestigationRule } from './sequentialInvestigationRules.js';
import { decisionPortfolioRule } from './decisionPortfolioRules.js';
import { leaderCalibrationRule } from './leaderCalibrationRules.js';
import { attentionMarketRule } from './attentionMarketRules.js';
import { autopilotRule } from './autopilot.js';
import { signalPathRule } from './signalPathRules.js';
import { warGameRule } from './warGameRules.js';
import { couplingRule } from './couplingRules.js';
import { performanceRule } from './performanceRules.js';
import { survivalRule } from './survivalRules.js';
import { waitCostRule } from './waitCostRules.js';
import { evidenceRule } from './evidenceRules.js';
import { consequenceRule } from './consequenceRules.js';
import { deferralRule } from './deferralOptionRules.js';
import { deferralPortfolioRule } from './deferralPortfolioRules.js';
import { integrityRule } from './integrityRules.js';
import { credibilityRule } from './credibilityRules.js';
import { confidenceRule } from './confidenceRules.js';
import { parityRule } from './parityRules.js';

export const DEFAULT_POST_COMMIT_RULES = Object.freeze([
  // Schema v58: user-authored agreements evaluate FIRST, against the record as
  // the triggering action left it. Built-in case propagation mutates the
  // triggering record mid-transaction (RULE-DEL-01 flips open -> mitigating),
  // so a later position would make "a case created while open" unmatchable and
  // would contradict what rehearsal showed. Agreement-created records emit
  // derived events that every rule below still processes normally; what cannot
  // happen is one agreement's output triggering another agreement (guarded in
  // autopilotRule via ctx.derived).
  autopilotRule,
  // One handler for both user-entered cases and cases created by another rule.
  caseCreatedRule,
  // Schema v59: the Signal Path senses a case that lands on a channel declared
  // blind, and a committed class or a settled probe that needs its typed chain,
  // its redesign decision or its owned follow-up. It runs after the case engine
  // so it reads the case as that engine left it, and before decision tempo so a
  // channel-redesign decision opened here receives a timing position in the
  // same atomic transaction.
  signalPathRule,
  // Schema v60: the Strategic War-Game Terminal. A committed war game cascades
  // through strategy coherence, attention markets, coalition stability and case
  // severity, writing typed links and decisions for the most stressed bets,
  // broken coalitions, high reallocation and worsening cases.
  warGameRule,
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
  // Schema v50: the Implementation Fidelity Ledger. A declared plan gains typed
  // provenance to the intervention and study it measures; a contradicting
  // attestation queues one blameless question; a settled under-delivered plan
  // opens one delivery-repair decision plus owned work; an explicit scan turns
  // overdue checkpoints into owned tasks; and a scored study freezes its own
  // delivery reading (including the per-complier correction) in the same
  // transaction. It runs before decision tempo so any decision it opens is
  // priced in the same atomic transaction.
  fidelityRule,
  // Schema v51: the Merit & Pay-Equity Terminal. A cycle's typed pay edges, a
  // flagged fairness audit (one DACI mechanism decision, never an individual
  // adjustment), relative-pay findings as one owned task, a dated outcome
  // review at finalization, and the resolved outcome that lets the retention
  // model grade itself. It runs last: it reads the people, decisions,
  // delegations and links the rules above may have just written.
  compRule,
  // Schema v52: the Workforce Transition Terminal. A declared programme gains
  // typed provenance to every person it proposes to exit; a failed selection
  // screen opens exactly one DACI decision about the criteria (never a swap of
  // two names) plus one owned evidence task; each material knowledge risk
  // becomes an owned hand-over delegation dated before the last working day;
  // at most three retained people get a blameless load prompt; and at
  // finalization one dated outcome review and one tracking task are opened so
  // the frozen survivor convention grades itself out of sample. The expensive
  // read runs only on the leader's own deliberate gates (decided / scanned /
  // finalized), so no other module's write pays for a 240-draw ensemble.
  transitionRule,
  // Schema v53: a committed structural design opens its residual span decision,
  // its owned scope task, its blameless moved-person prompts and its dated
  // outcome review in the same transaction as the reporting-line change. It runs
  // before decision tempo so any decision it opens receives a timebox in the
  // same atomic write. The expensive simulation runs only on the leader's own
  // deliberate events, never on another module's write.
  orgDesignRule,
  // Schema v54: the Information Value Terminal. Placed before decision tempo so
  // a buy-information decision opened by RULE-VOI-02 receives a timing position
  // in the same atomic write, and after the premise rule so a settled test's
  // likelihood-ratio observation lands on a premise the Sentinel has already
  // evaluated. Its arithmetic is over the frame's own payoff table, so it never
  // scans another module's records.
  valueOfInformationRule,
  // Session 81 (ADR-0046, RULE-SEQ-01..03): the Sequential Investigation Planner.
  // Re-solves the conditional plan after a test is declared or settles, writes
  // one advisory plan note, and on settlement opens exactly one commit decision
  // or one owned next-stage task. It runs before decision tempo so either item
  // receives a timing position in the same atomic write.
  sequentialInvestigationRule,
  // Schema v55: Decision Portfolio Engine (ADR-0043). Runs after the value-of-
  // information rule and before decision tempo so a coupled-decision coupling
  // link (RULE-DPF-01) and a resolution-cascade note (RULE-DPF-02) land in the
  // same atomic write as the triggering event, and a premise-scan flag
  // (RULE-DPF-03) follows any new observation the premise rule just evaluated.
  decisionPortfolioRule,
  // Schema v56: Leader Probability Calibration (ADR-0044). Runs after the
  // value-of-information rule so that a newly settled frame or newly declared
  // frame finds the current set of voiDecisions already in the draft, and so
  // that an overconfidence advisory note on a new frame lands in the same
  // atomic write as voi.declared. Never auto-adjusts declared probabilities.
  leaderCalibrationRule,
  // Schema v61: the Coupled Load Terminal. A new or updated decision discovers
  // the other decisions that share its approver and records a `shares-approver`
  // typed edge; a shared approval bottleneck, an over-long hand-off chain or a
  // priced coupling delay each open exactly one DACI decision or owned
  // delegation. It runs before decision tempo so every decision it opens
  // receives a timing position in the same atomic write, and it reads the
  // finished decision/delegation/case set the rules above may have just written.
  couplingRule,
  // Schema v62: Performance Recovery. A concern with no recorded expectation
  // gains owned support work; meeting the evidence floor without a two-way
  // conversation gains one; adopting a plan gains a support-mechanism decision
  // and an owned review date; reviewing a plan as not met gains exactly one
  // next-step decision. It runs before decision tempo so every decision it
  // opens is priced in the same atomic write.
  performanceRule,
  // Schema v63: Delivery Survival. A frozen reading attaches typed `endangers`
  // edges to the items it does not expect to finish and opens owned decision
  // work for the ones with a resolvable owner; a graded reading that lost to
  // its base rate opens one repair task; a scan opens at most one class-level
  // decision per week, one reason task per unexplained abandonment and one
  // grading task per stale reading. It runs before decision tempo so every
  // decision it opens is priced in the same atomic write, and it reads the
  // finished decision/delegation/case set the rules above may have written.
  survivalRule,
  // Schema v64: the Cost of Waiting terminal. A scan, a price declaration or a
  // frozen exposure certificate reconciles stale `prices-delay` edges, freezes
  // the week's certificate, links priced overdue items, and opens at most one
  // triage DACI decision per currency per week plus owned tasks. It runs
  // before decision tempo so the triage decision receives a timing position in
  // the same atomic transaction.
  waitCostRule,
  // Schema v65: the Leadership Parity & Standard Consistency terminal. Opens
  // at most one standard-consistency calibration decision per week when formal
  // plans, succession nominations or rated reviews invert recorded evidence,
  // and on explicit scans or frozen parity audits opens blameless coaching
  // check-in prompts, promise-repair actions and stale-audit grading work.
  // Runs before decision tempo so every decision it opens receives a timing
  // position in the same atomic transaction.
  parityRule,
  // Schema v66: the Evidence Terminal. A pooled effect that stays on the
  // harmful side of zero opens exactly one DACI decision per cell, ever
  // (RULE-EBM-01); a lone supported result opens a replication task
  // (RULE-EBM-02); and an intervention whose information value exceeds its
  // expected effect opens a study task (RULE-EBM-03). Scoring a study is the
  // moment the evidence base changes, so it is the moment these are written.
  // Runs before decision tempo so every decision it opens receives a timing
  // position in the same atomic transaction.
  evidenceRule,
  // Schema v67: a frozen decision-future reading links the original call and
  // its first-order context, opens governed premise/coordination work, and
  // grades its own forecast on explicit scan. Before Decision Tempo so a new
  // DACI coordination call is priced in the same atomic transaction.
  consequenceRule,
  // Schema v68: a frozen deferral frame prices the option to wait, links the
  // call it prices and — only when the tree says holding the option pays —
  // opens one owned boundary watch. An explicit scan grades due windows and
  // turns an expired window into one governed decision per week. Before
  // Decision Tempo so a governing call opened here is priced in the same
  // atomic transaction.
  deferralRule,
  // Schema v69: the Deferral Portfolio. A frozen book reading links every
  // member call and every shared premise it stresses, and opens one owned
  // concentration watch past the convention. A scan grades due readings and
  // turns an expired window into one governed decision per week. A premise
  // lifecycle event on a stressed premise challenges the frozen figures
  // (never rewrites them) and opens one re-price decision per premise per
  // week on a breach or a dated outcome. Before Decision Tempo so a governing
  // call opened here is priced in the same atomic transaction.
  deferralPortfolioRule,
  // Schema v70: the Signal Integrity Board records one look per day (after the
  // early-warning scan above has written the p values it charges), re-scores a
  // family on a human verdict, opens one governed monitoring-plan decision when
  // the error budget is spent ahead of plan, and grades frozen reviews whose
  // windows have closed on an explicit scan. Before Decision Tempo so a
  // monitoring decision opened here receives a timing position in the same
  // atomic transaction.
  integrityRule,
  // Schema v71: the Borrowed Evidence Engine. A verdict, a premise registration
  // or outcome, or a delegation closing re-reads its evidence group; a unit
  // that is decisively past its floor on BORROWED evidence while its own record
  // cannot say so yet opens one owned task or governed decision per unit per
  // week, and the borrowed claim it acted on is frozen so it can be graded.
  // Runs after the integrity rule so a verdict is scored by the Board before it
  // is pooled here, and before Decision Tempo so a decision opened here
  // receives a timing position in the same atomic transaction.
  credibilityRule,
  // Schema v72: the Confidence Transport Terminal. Any settled forecast re-reads
  // the leader's whole probability vocabulary; when transport is supported out of
  // sample the instrument is certified (once, prospectively) and open
  // declarations that the certificate reads differently open one owned re-read
  // task per module per week. Runs after the credibility rule — borrowing decides
  // whether a small sample may speak, transport decides what its words mean — and
  // before Decision Tempo so a ruling it opens receives a timing position in the
  // same atomic transaction. It never rewrites a declared probability.
  confidenceRule,
  // Schema v28: decision timeboxes settle themselves, overdue calls become one
  // owned delegation, priced decisions get a proposal and value drift refreshes
  // the derived economics — all inside the source transaction (RULE-DLY-01..05).
  decisionTempoRule,
  // Schema v57: the Attention Market. A committed plan attaches typed edges to
  // every obligation it bought or knowingly left, opens the owned hand-offs it
  // named, and writes ONE decision carrying the forgone list and its price. It
  // runs last because it reads the finished workspace rather than any other
  // rule's product.
  attentionMarketRule,
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
  const traceableRoot = isTraceablePropagationEvent(context.event) ? {
    type: context.event.type,
    entity: context.event.entity || '',
    entityId: context.event.entityId || '',
  } : null;
  const lineage = traceableRoot ? {
    rootEvent: traceableRoot,
    steps: [],
    truncatedSteps: 0,
    omittedTargets: 0,
    omittedLinks: 0,
    omittedEvents: 0,
    targetCount: 0,
    linkCount: 0,
    eventCount: 0,
  } : null;
  const queue = [{ event: context.event || null, derived: false, parentStepId: null, depth: 0 }];
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
      queue.push({ event, derived: true, parentStepId: null, depth: 1 });
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
          // Rules read the leader's declared conventions from the draft they are
          // given, never from module defaults. Schema v61's Coupled Load rule was
          // silently using its built-in thresholds (2 actors / 3 decisions / 2
          // days) instead of the workspace's clamped settings.
          settings: candidate.settings || {},
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
        const beforeCollections = new Map(savepoint.changed().map((key) => [key, draft[key]]));
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
        let committedStep = null;
        if (lineage && applied) {
          if (lineage.steps.length < PROPAGATION_LINEAGE_STEP_CAP) {
            committedStep = makePropagationLineageStep({
              index: lineage.steps.length + 1,
              parentStepId: current.parentStepId,
              depth: current.depth,
              event: current.event,
              rule: rule.name || 'anonymous',
              effects: result,
              collections: changedCollections,
              beforeCollections,
              afterOf: savepoint.peek,
              emittedEvents: bufferedEmissions,
              targetBudget: Math.max(0, PROPAGATION_LINEAGE_TARGET_CAP - lineage.targetCount),
              linkBudget: Math.max(0, PROPAGATION_LINEAGE_LINK_CAP - lineage.linkCount),
              eventBudget: Math.max(0, PROPAGATION_LINEAGE_EVENT_CAP - lineage.eventCount),
            });
            if (committedStep) {
              lineage.steps.push(committedStep);
              lineage.targetCount += committedStep.targets.length;
              lineage.linkCount += committedStep.links.length;
              lineage.eventCount += committedStep.emitted.length;
              lineage.omittedTargets += committedStep.omittedTargets;
              lineage.omittedLinks += committedStep.omittedLinks;
              lineage.omittedEvents += committedStep.omittedEvents;
            }
          } else {
            lineage.truncatedSteps += 1;
          }
        }
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
          queue.push({
            event,
            derived: true,
            parentStepId: committedStep?.stepId || current.parentStepId || null,
            depth: Math.min(64, (current.depth || 0) + 1),
          });
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
  if (lineage?.steps.length) {
    appendPropagationLineage(draft, {
      rootEvent: lineage.rootEvent,
      revision: Number.isSafeInteger(draft.meta?.revision) ? draft.meta.revision : null,
      steps: lineage.steps,
      truncatedSteps: lineage.truncatedSteps,
      omittedTargets: lineage.omittedTargets,
      omittedLinks: lineage.omittedLinks,
      omittedEvents: lineage.omittedEvents,
    }, { idFactory: context.idFactory, now: context.now });
  }
  if (reporter) reporter.elapsedMs = nowMs() - startedAt;
  return results;
}
