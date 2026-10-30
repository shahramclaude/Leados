/**
 * app/core/domain/propagationContracts.js — the auditable contract for every
 * post-commit rule.
 *
 * WHAT PROBLEM THIS SOLVES
 * ------------------------
 * ADR-0008 gave LeadOS one generalized rule spine, and by Session 60 fourteen
 * rules hung off it. That spine had a property nobody could see: on a single
 * `case.created` transaction the engine considered 42 (rule, event) pairs, of
 * which five did anything. `earlyWarningRule`, `dynamicsRule` and `loadRule`
 * together spent ~198 ms of a 305 ms write recomputing full analytical scans
 * that concluded "nothing to do" — every time, on every write. The cost grows
 * with the workspace and the leader has no way to see it.
 *
 * Two things were missing, and they are the same thing: *provenance* and
 * *price*. This module supplies both.
 *
 *   1. DECLARED PURPOSE. Each rule states, in data, what it is for and which
 *      module it lives in, so the console can explain the chain instead of
 *      showing fourteen function names.
 *   2. A PROVEN DECLINE PROPERTY. To skip a redundant re-scan the engine must
 *      know that a rule's *decision to decline* depends on the workspace
 *      content and the event type, and not on which entity the event named.
 *      That is a real claim about real code, so it is declared here, and
 *      `tests/app/propagation-ledger.test.mjs` proves it by running every
 *      declared rule against two different entities of the same type at the
 *      same workspace version and requiring identical verdicts.
 *
 * A rule absent from `DECLINE_MEMO_RULES` is never skipped. That is the safe
 * default: the optimisation is opt-in per rule and each opt-in carries a test.
 *
 * WHY NOT DECLARE TRIGGER LISTS HERE
 * ----------------------------------
 * Trigger prefixes live inside each rule module and already drift as features
 * land. Copying them into a second table would create exactly the silent
 * divergence this codebase keeps failing itself for. The engine therefore
 * never uses this file to decide whether a rule *runs*. It is used only to
 * explain, price and — for rules that have proven the decline property —
 * collapse a provably identical re-run.
 */

import { autopilotRule } from './autopilot.js';
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
import { signalPathRule } from './signalPathRules.js';

/**
 * One entry per rule, in the order the engine evaluates them. `writes` and
 * `emits` are documentation for the console, not a gate; the engine's own
 * `createdRecordEvents` remains the source of truth for lifecycle publishing.
 */
export const PROPAGATION_CONTRACTS = Object.freeze([
  {
    rule: caseCreatedRule,
    module: 'caseLifecycle.js',
    purpose: 'Freezes a case opening forecast and fans one operational case into decisions, delegations, goals, coaching and capacity.',
    writes: ['cases', 'decisions', 'delegations', 'goals', 'links', 'portfolio', 'oneOnOnes'],
    emits: [],
    scansWorkspace: false,
  },
  {
    rule: signalPathRule,
    module: 'signalPathRules.js',
    purpose: 'RULE-SIG-01..04 turn a declared escalation channel into typed chain edges, a redesign decision when the probe ledger contradicts it, owned work for an adopted lever, and a link from any case that lands on a blind path.',
    writes: ['links', 'decisions', 'delegations', 'signalClasses', 'notes'],
    emits: [],
    scansWorkspace: false,
  },
  {
    rule: forecastIntegrityRule,
    module: 'forecastIntegrity.js',
    purpose: 'Challenges a new forecast against its reference class and records the outside view.',
    writes: ['forecastChallenges'],
    emits: [],
    scansWorkspace: false,
  },
  {
    rule: resilienceRule,
    module: 'resilience.js',
    purpose: 'Prices a committed change against service dependencies and opens a continuity decision when survival time is short.',
    writes: ['decisions', 'delegations', 'links'],
    emits: ['case.created'],
    scansWorkspace: true,
  },
  {
    rule: powerRule,
    module: 'power.js',
    purpose: 'Detects a coalitions-and-incentives position and opens a DACI decision plus blameless talking points.',
    writes: ['decisions', 'oneOnOnes', 'links'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: networkRule,
    module: 'orgNetwork.js',
    purpose: 'Turns structural network risk into a cross-training delegation and an org-design decision.',
    writes: ['delegations', 'decisions', 'links', 'oneOnOnes'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: impactRule,
    module: 'impactRules.js',
    purpose: 'Propagates a scored impact study into typed links, a scale/stop decision and a replication.',
    writes: ['decisions', 'links', 'portfolio'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: commsRule,
    module: 'comms.js',
    purpose: 'Drafts the unsent stakeholder brief for a case event and owes a closure note to anyone briefed.',
    writes: ['commsDrafts', 'links'],
    emits: [],
    scansWorkspace: false,
  },
  {
    rule: allocationRule,
    module: 'allocation.js',
    purpose: 'Re-measures the explore/exploit funding mix and opens a rebalancing decision on an exploration-floor breach.',
    writes: ['decisions', 'oneOnOnes', 'links'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: loadRule,
    module: 'load.js',
    purpose: 'Re-measures per-person cognitive saturation and opens a load-shedding decision when a threshold is crossed.',
    writes: ['decisions', 'oneOnOnes', 'links'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: premiseRule,
    module: 'premises.js',
    purpose: 'Senses breached assumption signposts and fans them into a re-decision, verification delegation and 1:1 prompt.',
    writes: ['decisions', 'delegations', 'oneOnOnes', 'links', 'premises'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: dynamicsRule,
    module: 'dynamics.js',
    purpose: 'Integrates the operating-system stocks and opens a structural decision when loop gain is unsafe.',
    writes: ['decisions', 'delegations', 'oneOnOnes', 'links'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: policyPortfolioRule,
    module: 'policyPortfolio.js',
    purpose: 'Freezes an adopted structural portfolio and opens its owned out-of-sample checkpoint.',
    writes: ['decisions', 'delegations', 'links'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: earlyWarningRule,
    module: 'earlyWarning.js',
    purpose: 'Re-tests monitored series, records promotions and suppressions, and only a human verdict opens a case.',
    writes: ['watchAlerts', 'watchForecasts', 'cases', 'decisions', 'links'],
    emits: ['case.created'],
    scansWorkspace: true,
  },
  {
    rule: strategyRule,
    module: 'strategy.js',
    purpose: 'Turns an adopted strategic bet into a commitment decision, a tagging delegation and a talking point, and audits the say–do gap for missing stop rules and overdue verdicts.',
    writes: ['decisions', 'delegations', 'people', 'links'],
    emits: [],
    // Only strategy events and an explicit audit reach the scan, so the cost is
    // not on the case-creation path. When it does run it reads the whole
    // portfolio, which is why `scansWorkspace` is honest rather than cheap.
    scansWorkspace: true,
  },
  {
    rule: learningRule,
    module: 'learning.js',
    purpose: 'Drafts one after-action review from a closing record, turns held lessons into owned work, governs recurrence, and opens a 30-day sustainment check after dated record corroboration.',
    writes: ['retros', 'delegations', 'decisions', 'people', 'links'],
    emits: [],
    // The draft path is an id lookup on the record that just closed. The
    // learning.* path reads every review to measure recurrence, which is a real
    // scan — so the flag is honest rather than cheap.
    scansWorkspace: true,
  },
  {
    rule: mitigationReviewRule,
    module: 'mitigationReview.js',
    purpose: 'Freezes a human-requested interval robustness review into a DACI decision, owned verification delegation and blameless coaching prompt; never applies a mitigation.',
    writes: ['decisions', 'delegations', 'people', 'links'],
    emits: [],
    scansWorkspace: false,
  },
  {
    rule: continuityCouplingRule,
    module: 'continuityCouplingRule.js',
    purpose: 'Couples active service/vendor continuity shocks into portfolio Monte Carlo and opens a DACI continuity-delivery decision plus dual-hat steward relief when fair-weather plans fail under disruption.',
    writes: ['decisions', 'delegations', 'people', 'links'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: leaderContinuityRule,
    module: 'leaderContinuityRule.js',
    purpose: 'Turns a human-commissioned absence cover plan into one DACI hand-over decision, owned deputy delegations with explicit authority, typed links and blameless prompts; re-allocates returned cover delegations to backup deputies or opens a cover-gap decision; and drafts an AAR plus calibration/execution follow-up when a drill or window closes.',
    writes: ['decisions', 'delegations', 'people', 'links', 'retros'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: decisionTempoRule,
    module: 'decisionTempo.js',
    purpose: 'Settles timeboxes, delegates overdue calls and prices open decisions in the same transaction.',
    writes: ['tempoSchedules', 'delegations', 'decisions', 'links'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: fidelityRule,
    module: 'fidelityRules.js',
    purpose: 'Links a declared implementation plan to the records it measures, turns an overdue checkpoint into one owned task, freezes the delivery reading onto a scored study and opens a repair decision when the intervention was under-delivered.',
    writes: ['fidelityPlans', 'delegations', 'decisions', 'links', 'people', 'impactStudies'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: measurementRule,
    module: 'measurementRule.js',
    purpose: 'Turns a declared scorecard into one redesign decision, owned counter-metric work and a blameless prompt when its incentives are modelled to pay for gaming, and into one calibration decision plus a pre-filled review when a frozen prediction is falsified.',
    writes: ['decisions', 'delegations', 'links', 'people', 'retros'],
    emits: [],
    scansWorkspace: false,
  },
  {
    rule: compRule,
    module: 'compRules.js',
    purpose: 'Turns a merit cycle into typed pay provenance, one mechanism decision when the fairness audit is flagged, one relative-pay task, a dated outcome review, and the resolved outcomes that score the retention model out of sample.',
    writes: ['decisions', 'delegations', 'links', 'people', 'meritCycles'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: transitionRule,
    module: 'transitionRules.js',
    purpose: 'Turns a transition programme into typed exit provenance, one mechanism decision and one evidence task when the selection screen fails, owned hand-over delegations for the knowledge that would otherwise leave, blameless survivor load prompts, a dated outcome review with a frozen prediction, and the resolved outcomes that score the survivor convention out of sample.',
    writes: ['decisions', 'delegations', 'links', 'people', 'transitionPrograms'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: orgDesignRule,
    module: 'orgDesignRules.js',
    purpose: 'Turns a declared structural design into typed placement provenance, exactly one residual span decision plus one owned scope task when a unit stays over the band, blameless prompts for the people whose reporting line moved, a dated outcome review against the frozen prediction, and the score that grades the queue model out of sample.',
    writes: ['decisions', 'delegations', 'links', 'people', 'orgDesigns'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: valueOfInformationRule,
    module: 'valueOfInformationRules.js',
    purpose: 'Turns a priced decision frame into typed premise provenance, exactly one buy-information decision plus one owned scoping task when EVPI clears its declared thresholds, one dated likelihood-ratio observation in the premise ledger when a test settles, one de-risking decision when a single premise anchors the portfolio, and a dated outcome review that holds a decided frame to its own number.',
    writes: ['decisions', 'delegations', 'links', 'premises', 'voiDecisions', 'voiStudies'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: sequentialInvestigationRule,
    module: 'sequentialInvestigationRules.js',
    purpose: 'Re-solves the conditional investigation plan from declared tests and settled results (exact backward induction over at most three stages and six tests). On a declared test it writes one advisory plan note when a second stage adds material value (RULE-SEQ-01); when a test settles and the plan says stop, it opens exactly one commit decision (RULE-SEQ-02); when the plan says test next, it opens exactly one owned task on the frame owner (RULE-SEQ-03). Every write is marker-idempotent; scans write notes only.',
    writes: ['decisions', 'delegations', 'links', 'voiDecisions'],
    emits: [],
    scansWorkspace: false,
  },
  {
    rule: decisionPortfolioRule,
    module: 'decisionPortfolioRules.js',
    purpose: 'Discovers coupling between open decisions that share a premise (RULE-DPF-01), flags coupled decisions for review when one is resolved (RULE-DPF-02), and flags sequencing review when a premise observation arrives (RULE-DPF-03). All writes are marker-idempotent typed links or append-only portfolio notes.',
    writes: ['links', 'decisions', 'portfolioMarkers'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: leaderCalibrationRule,
    module: 'leaderCalibrationRules.js',
    purpose: 'Marks settled VOI frames as calibration samples (RULE-LCAL-01), annotates mature overconfidence (RULE-LCAL-03), and on a new frame or later settlement propagates a labelled calibration-sensitivity stress with typed links to contributing settled forecasts for every newly eligible open frame (RULE-LCAL-04). Never auto-adjusts declared probabilities or frozen predictions.',
    writes: ['voiDecisions', 'calibrationMarkers', 'links'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: attentionMarketRule,
    module: 'attentionMarketRules.js',
    purpose: 'Turns a committed attention plan into structure: RULE-ATT-01 attaches typed `allocates`/`forgoes` edges; RULE-ATT-02 opens one owned, dated delegation per named hand-off; RULE-ATT-03 writes one DACI decision for the forgone set and price; RULE-ATT-04 attributes a missed plan; RULE-ATT-05 reconciles typed same-barrier case edges on case create/edit without copying RCA text. All writes are idempotent or desired-state reconciliations.',
    writes: ['attentionPlans', 'delegations', 'decisions', 'links'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: autopilotRule,
    module: 'autopilot.js',
    purpose: 'RULE-AP-01 executes human-approved declarative operating agreements through a typed source/action registry. Evaluates first, against the record as the triggering action left it, so built-in mutations cannot invalidate the rehearsal the approval was based on. Rehearsal is read-only; activation binds a current-state preview. Creates bounded decisions, owned work, coaching prompts, assumptions and communication drafts with typed provenance, durable idempotency keys and execution budgets. Never sends messages or makes personnel decisions.',
    writes: ['autopilotPolicies', 'autopilotRuns', 'decisions', 'delegations', 'people', 'premises', 'commsDrafts', 'links'],
    emits: [],
    scansWorkspace: false,
  },

]);

const CONTRACT_BY_RULE = new Map(PROPAGATION_CONTRACTS.map((c) => [c.rule, c]));

/** The contract for a rule, or null for an unregistered one. */
export function contractFor(rule) {
  return CONTRACT_BY_RULE.get(rule) || null;
}

/**
 * Rules for which a *declined* verdict has been proven to depend only on
 * (workspace version, event type) — never on the event's entity.
 *
 * Membership is a testable claim, not a comment. If a rule is added here
 * without evidence, `tests/app/propagation-ledger.test.mjs` fails on the
 * entity-independence probe rather than letting the engine silently stop
 * running it.
 */
export const DECLINE_MEMO_RULES = Object.freeze(new Set([
  earlyWarningRule,
  dynamicsRule,
  loadRule,
  powerRule,
  networkRule,
  impactRule,
  allocationRule,
  policyPortfolioRule,
]));

/** True when the engine may collapse a provably identical declined re-run. */
export function isDeclineMemoizable(rule) {
  return DECLINE_MEMO_RULES.has(rule);
}

/** Human-readable rule name for diagnostics, stable across minification. */
export function ruleLabel(rule) {
  const contract = CONTRACT_BY_RULE.get(rule);
  if (contract) return rule.name || contract.module;
  return (rule && rule.name) || 'anonymous';
}

/**
 * Flat, serialisable description for the ledger and console. Rule functions are
 * not serialisable and are not needed by a view, so the description keeps the
 * label, the module, the declared purpose and the two properties that change
 * engine behaviour.
 */
export function describePropagationContracts() {
  return PROPAGATION_CONTRACTS.map((contract) => ({
    name: ruleLabel(contract.rule),
    module: contract.module,
    purpose: contract.purpose,
    writes: contract.writes,
    emits: contract.emits,
    scansWorkspace: contract.scansWorkspace,
    declineMemoizable: DECLINE_MEMO_RULES.has(contract.rule),
  }));
}
