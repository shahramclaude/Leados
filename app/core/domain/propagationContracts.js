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
import { responseRule } from './responseRules.js';
import { actionBundleRule } from './actionBundleRules.js';
import { forecastIntegrityRule } from './forecastIntegrity.js';
import { resilienceRule } from './resilience.js';
import { decisionTempoRule } from './decisionTempo.js';
import { retentionRule } from './retention.js';
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
import { settlementRule } from './settlementRules.js';
import { counterfactualRule } from './counterfactualPolicyRules.js';
import { reliabilityRule } from './reliabilityRules.js';
import { couplingLedgerRule } from './couplingLedgerRules.js';
import { supplyRule } from './supplyRules.js';
import { solvencyRule } from './solvencyRules.js';
import { scepticRule } from './scepticRules.js';
import { chainRule } from './chainRules.js';
import { warGameRule } from './warGameRules.js';
import { parityRule } from './parityRules.js';
// ADR-0076: the derived vertical roll-up declares its contract like every
// other rule on the spine. It is inert unless a seat is explicitly declared.
import { seatRule } from './seatRules.js';
import { sealRule } from './sealRules.js';
// ADR-0092: the Differencing Defender declares its contract like every other rule.
import { differencingRule } from './differencingRules.js';
// ADR-0094: the Prospective Intervention Contract.
import { prospectiveRule } from './prospectiveRules.js';
// ADR-0095: the Robust Allocation Terminal.
import { robustAllocationRule } from './robustAllocationRules.js';
// ADR-0098: the Internal Clearinghouse rule suite.
import { clearingRule } from './clearingRules.js';
import { successionRule } from './successionRules.js';
import { mandateRule } from './mandateRules.js';
import { authorityCalibrationRule } from './authorityCalibrationRules.js';
import { missionRule } from './missionRules.js';
import { altitudeRouterRule } from './altitudeRouterRules.js';
import { catchballRule } from './catchballRules.js';
import { strategyCycleRule } from './strategyCycleRules.js';
// ADR-0090: the federation reading's three rules.
import { federationRule } from './federationRules.js';
import { freezeLineRule } from './freezeLineRules.js';
import { spanCalibrationRule } from './spanCalibrationRules.js';
import { reputationalCapitalRule } from './reputationalCapitalRules.js';
import { hindsightRule } from './hindsightRules.js';
import { epistemicRule } from './epistemicRules.js';
import { diligenceRule } from './diligenceRules.js';
import { cadenceRule } from './cadenceRules.js';
import { carryoverRule } from './carryoverRules.js';


import { escalationRule } from './escalationRules.js';


import { valueStreamRule } from './valueStreamRules.js';


import { concordanceRule } from './concordanceRules.js';
import { operatingModelRule } from './operatingModelRules.js';
import { disclosureRule } from './disclosureRules.js';
import { boardRule } from './boardRules.js';
// ADR-0088: the Federated Envoy.
import { envoyRule } from './envoyRules.js';
import { identityRule } from './identityRules.js';

/**
 * One entry per rule, in the order the engine evaluates them. `writes` and
 * `emits` are documentation for the console, not a gate; the engine's own
 * `createdRecordEvents` remains the source of truth for lifecycle publishing.
 */
export const PROPAGATION_CONTRACTS = Object.freeze([
  {
    rule: responseRule,
    module: 'responseRules.js',
    purpose: 'Links a rehearsed response to its privacy-safe intake pointer and adopted case; opens one owned review checkpoint or governed decision for a scheduled response.',
    writes: ['links', 'delegations', 'decisions'],
    emits: [], scansWorkspace: false,
  },
  {
    rule: actionBundleRule, module: 'actionBundleRules.js', purpose: 'RULE-BND-01..03: typed provenance for every adopted action, one owned review checkpoint, and orphan-edge reconciliation. Explicit scans inspect the bounded bundle ledger. Compensation is a separate all-or-nothing transaction and never overwrites touched work.', writes: ['links', 'delegations'], emits: [], scansWorkspace: true,
  },
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
    rule: valueStreamRule,
    module: 'valueStreamRules.js',
    purpose: 'RULE-VS-01 writes two-branch peer supplier/consumer rolls-up-to provenance through the existing reporting tree plus LCA mediation and strategy/pact links; RULE-VS-02 opens at most one governed SLA recovery decision per overdue directional miss per ISO week without changing the outcome; RULE-VS-03 links each immutable stop-rule carryover receipt to its settled sources, proposed receiving pact, surviving bet and planned budget. Catchball consumes valuestream.reallocated later in the same transaction, Decision Tempo prices the breach decision, and the seal covers all writes.',
    writes: ['valueStreamMarkers', 'decisions', 'links', 'events'],
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
    rule: mandateRule, module: 'mandateRules.js', purpose: 'RULE-MND-01..03: connect bounded authority to its source, receiver, budget and follow-through; reconcile expiry/scope drift; open an owned recovery path and release unused encumbrances.', writes: ['mandates', 'delegations', 'decisions', 'budgets', 'links'], emits: [], scansWorkspace: true,
  },
  { rule: retentionRule, module: 'retention.js', purpose: 'Retention scans create governed follow-up work and provenance for retention exposures.', writes: ['retentionPlans', 'departures', 'decisions', 'links'], emits: [], scansWorkspace: true },
  {
    rule: attentionMarketRule,
    module: 'attentionMarketRules.js',
    purpose: 'Turns a committed attention plan into structure: RULE-ATT-01 attaches typed `allocates`/`forgoes` edges; RULE-ATT-02 opens one owned, dated delegation per named hand-off; RULE-ATT-03 writes one DACI decision for the forgone set and price; RULE-ATT-04 attributes a missed plan; RULE-ATT-05 reconciles typed same-barrier case edges on case create/edit without copying RCA text. All writes are idempotent or desired-state reconciliations.',
    writes: ['attentionPlans', 'delegations', 'decisions', 'links'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: performanceRule,
    module: 'performanceRules.js',
    purpose: 'RULE-PERF-01..05 turn a due-process gap into support work: one owned task and one blameless 1:1 prompt for a missing expectation, the two-way conversation once the evidence floor is met without it, one decision on the support mechanism plus typed concern/person/decision edges and a dated check-in at adoption, exactly one next-process-step decision after a not-met review with no exit option, and one task per passed review on an explicit scan. It never rates a person and never takes an adverse action.',
    writes: ['delegations', 'decisions', 'links', 'people', 'performanceConcerns'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: survivalRule,
    module: 'survivalRules.js',
    purpose: 'RULE-SURV-01 links a frozen survival reading to every item it does not expect to finish and opens owned decision work for the first few whose real owner resolves (never an invented one); RULE-SURV-02 opens one repair task when a graded reading lost to its own base rate and has enough settled items to say so; RULE-SURV-03 opens exactly one decision per class per week when abandonment reaches the declared share of exits; RULE-SURV-04 opens one task to record why a delegation came back; RULE-SURV-05 opens one task to grade a stale reading; RULE-SURV-06 opens one forecast-transport review per class per week when calendar-cohort drift fires; RULE-SURV-07 frames that same weekly review by the drift component that moved (intake when abandonment leads, with recent abandonments linked as exhibits; completion when finishing leads) and opens one learning task for a significant improvement; RULE-SURV-08 challenges what is already frozen when a class loses transport on an axis — an appended note on frozen readings whose predictions ride on the class (frozen probabilities never change), and one owned re-freeze task for the newest exposure certificate only when the timing axis failed. It never rates a person and never extends a deadline.',
    writes: ['links', 'delegations', 'decisions', 'survivalReadings', 'survivalMarkers'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: waitCostRule,
    module: 'waitCostRules.js',
    purpose: 'RULE-WAIT-01..05 turn a priced wait into structure: typed `prices-delay` edges from the week\'s exposure certificate to each priced overdue item (RULE-WAIT-01), exactly one triage DACI decision per currency per week when overdue priced exposure clears the declared threshold (RULE-WAIT-02), one owned task per top priced overdue item for its recorded owner (RULE-WAIT-03), one declare-a-price task per unpriced overdue class (RULE-WAIT-04), and one frozen weekly certificate plus stale-edge reconciliation per scan (RULE-WAIT-05). All writes are marker-idempotent; it never rates a person and never closes an item.',
    writes: ['waitExposures', 'waitCostMarkers', 'links', 'decisions', 'delegations'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: consequenceRule,
    module: 'consequenceRules.js',
    purpose: 'RULE-CSQ-01..05 map a frozen decision-future reading into typed source and context edges, leader-owned premise verification and one priced coupling coordination choice, then open one grading task on an explicit scan and one blameless learning task after a material forecast miss. Never chooses an option or claims a typed link is causal.',
    writes: ['consequenceMarkers', 'links', 'decisions', 'delegations'],
    emits: [],
    scansWorkspace: false,
  },
  {
    rule: deferralRule,
    module: 'deferralOptionRules.js',
    purpose: 'RULE-DRO-01 maps a frozen deferral frame to the call it prices with a `defers-decision` edge and, only when the binomial tree says holding the option pays, opens exactly one owned task watching the exercise boundary. RULE-DRO-02 reconciles this module\'s stale edges on an explicit scan, opens due grading work, and turns a window that expired with the call still open into ONE governed decision per ISO week. RULE-DRO-03 opens one blameless process task after a graded surprise (Brier ≥ 0.25). Every write is marker-idempotent; it never chooses an option, moves a date or rates a person.',
    writes: ['deferralMarkers', 'links', 'delegations', 'decisions'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: deferralPortfolioRule,
    module: 'deferralPortfolioRules.js',
    purpose: 'RULE-DPO-01 maps a frozen deferral-portfolio reading to every member call with `aggregates-deferral` edges, to every shared premise it stresses with `stresses-premise` edges, and — only when the tail concentrates past the declared convention — opens exactly one owned concentration-watch task. RULE-DPO-02 reconciles this module\'s stale edges on an explicit scan, opens due grading work, and turns a window that expired with member calls still open into ONE governed decision per ISO week. RULE-DPO-03 opens one blameless process task after a graded surprise (Brier ≥ 0.25). RULE-DPO-04 appends a challenge note (never a rewrite) to every frozen reading resting on a premise that moved, and opens exactly one re-price decision per premise per ISO week on a breach or a dated human outcome. Every write is marker-idempotent; it never chooses an option, rewrites a frozen figure or rates a person.',
    writes: ['deferralPortfolioMarkers', 'links', 'delegations', 'decisions', 'deferralPortfolioReadings'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: integrityRule,
    module: 'integrityRules.js',
    purpose: 'RULE-INT-01 records one look per day, with the plan in force and the p values that look produced, so the family-wise error budget is charged rather than assumed. RULE-INT-02 re-scores a family on a human verdict, appends one challenge note (never a rewrite) to the newest ungraded review when the Wilson interval for actionable precision sits entirely below the declared floor, and opens exactly one owned calibration task per family per ISO week. RULE-INT-03 opens exactly one governed monitoring-plan decision per ISO week when the spending function has spent the warning share of alpha inside the warning share of the looks. RULE-INT-04 grades frozen reviews whose windows have closed from the verdicts recorded inside them, opens one blameless process task after a wide miss, and reconciles edges to reviews that no longer exist. Every write is marker-idempotent; no p-value is manufactured for a deterministic rule, no correlation is estimated, and no person is scored.',
    writes: ['integrityLooks', 'integrityReviews', 'integrityMarkers', 'links', 'decisions', 'delegations'],
    emits: [],
    scansWorkspace: false,
  },
  {
    rule: credibilityRule,
    module: 'credibilityRules.js',
    purpose: 'RULE-CRE-01 re-reads the evidence group an event can change (signal verdicts, premise registrations and outcomes, delegation creation and closure) through a Beta-binomial hierarchy fitted by full Bayes on a deterministic grid; a signal family decisively below the Signal Integrity Board\'s precision floor on borrowed evidence while its own record is too thin opens one owned re-tune task per family per ISO week, an open premise declared above its class\'s borrowed hold rate opens one governed outside-view decision per class per week with typed `outside-view` edges, and an authority class decisively below the on-time floor opens one leader-owned checkpoint task per class per week linked to the delegations falling due; every unit acted on gets a frozen frame (`borrows-evidence`, `governs-pooling`). RULE-CRE-02 opens one exchangeability decision per group per week when I² passes the convention or one unit carries the pool, unless the leader ruled in the last 90 days. RULE-CRE-03 grades due frames once (Brier for the borrowed and the own-data forecaster on the same outcomes), lapses untested ones, opens a blameless process task after a borrowed miss own data would have avoided and one skill decision per group per week when borrowing loses, and reconciles edges to deleted frames. Marker-idempotent; refused groups are never pooled; no person is a unit.',
    writes: ['credibilityFrames', 'credibilityMarkers', 'links', 'decisions', 'delegations'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: confidenceRule,
    module: 'confidenceRules.js',
    purpose: 'RULE-CTR-01 freezes exactly one calibration certificate when transport of the leader\'s declared probabilities is supported out of sample and no certificate is open, storing the map parameters and the prequential scores at issue and attaching it to the three open promises it reads furthest from (`recalibrates-belief`); RULE-CTR-02 opens one owned re-read task per source module per ISO week for open declarations at least `confidenceGapPct` points from the certified reading, linked to each declaration. RULE-CTR-03 grades due certificates once from the forecasts that resolved inside the window, lapses a window that closed empty, and after a transported loss opens one blameless process task and, at most once per ISO week, one governed decision about whether to keep transporting. RULE-CTR-04 reconciles edges to deleted certificates on an explicit scan. Marker-idempotent; it never rewrites a declared probability and never scores a person.',
    writes: ['confidenceCertificates', 'confidenceMarkers', 'links', 'delegations', 'decisions'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: settlementRule,
    module: 'settlementRules.js',
    purpose: 'RULE-STL-01 attaches typed `settles-loop`, `exonerates-delivery` and `flags-bottleneck` provenance edges to loop settlement receipts. RULE-STL-02 separates clean team execution from a falsified thesis (`thesis-falsified-clean-execution`), queueing one blameless delivery-credit prompt on the delegate\'s 1:1 queue, opening one governed DACI double-loop pivot decision (priced by Decision Tempo), and seeding a dated After-Action Review draft when the source case is closed. RULE-STL-03 flags unchosen leader-gated decisions when a loop breaches into the Red critical-chain fever zone. RULE-STL-04 opens one single-loop delivery unblocking task and records an untested-thesis Type-III guard note on open premises when execution drifts below the fidelity floor. RULE-STL-05 grades frozen loop closure forecasts once out of sample (Brier score), opens one calibration task on wide misses, and reconciles dangling settlement edges.',
    writes: ['settlements', 'links', 'decisions', 'delegations', 'people', 'premises', 'retros'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: counterfactualRule,
    module: 'counterfactualPolicyRules.js',
    purpose: 'RULE-CFP-01 captures a decision point (assumption, DACI call, delegation or case) BEFORE its outcome is known, flagging as `late` any log written on or after the outcome it describes; RULE-CFP-02 resolves each captured point once against its recorded outcome and never re-scores it; RULE-CFP-03 opens at most one governed policy-ruling DACI decision plus one blameless process task per ISO week when a named policy beats the record robustly (and one process task only when the record beats the rule), priced downstream by Decision Tempo in the same transaction; RULE-CFP-04 reconciles on an explicit scan — dropping decision points whose source record was deleted, pruning stale `evaluates-policy` edges, and grading or lapsing frozen evaluations once from strictly later evidence (a window that closes with too few new decision points LAPSES, never credited). Marker-idempotent, pausable by `counterfactualAutoPropagate` (an explicit scan always runs), and it never adopts a policy or writes a finding about a person.',
    writes: ['policyMarkers', 'policyEvaluations', 'links', 'decisions', 'delegations'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: reliabilityRule,
    module: 'reliabilityRules.js',
    purpose: 'RULE-REL-01 records each completed rating as one observation of the leader\'s measurement instrument, once and only once, so the people × cycle design is auditable and a reopened-then-recompleted review is never counted twice; RULE-REL-02 opens at most one governed DACI decision per ISO week plus one blameless process task when the instrument sits below its declared separability floor while the workspace is being asked to differentiate (a merit cycle exists or a calibration decision is open), priced downstream by Decision Tempo in the same transaction; RULE-REL-03 compares a just-completed rating against that person\'s credibility-weighted reading with the review removed, and when the gap reaches a full scale point appends an advisory note to the review and opens one leader-owned verification task — the rating itself is never rewritten; RULE-REL-04 opens at most one blameless task per month when two instruments that should describe the same people do not converge; RULE-REL-05 reconciles markers and edges and grades or lapses a frozen reading once from strictly later observations (a window that closes with too few new observations LAPSES, never credited). Marker-idempotent, pausable by `reliabilityAutoPropagate` (an explicit scan always runs), it writes no person-level figure anywhere and never rates a person.',
    writes: ['reliabilityMarkers', 'reliabilityReadings', 'links', 'decisions', 'delegations'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: couplingLedgerRule,
    module: 'couplingLedgerRules.js',
    purpose: 'RULE-CPL-01 maps a frozen coupling review onto the record it audited — one `calibrates-coupling` edge per surviving member call and one `measures-coupling` edge per premise that nominated a pair — and opens exactly one leader-owned reconciliation task when a band\'s declaration is contradicted AND the finding does not flip between the two printed rank mappings; RULE-CPL-02 opens grading work for a review whose window has closed ungraded and turns a contradicted frozen review into at most one governed re-declaration decision per ISO week, with three printed options the leader chooses between; RULE-CPL-03 appends a challenge note to the standing review when a new ρ is declared into a band the record contradicts, and opens at most one advisory task per band per ISO week. Marker-idempotent, pausable by `couplingLedgerAutoPropagate` (an explicit scan always runs). It never writes, clamps, defaults or derives a `correlationDeclarations` row, never rewrites a frozen figure, and never reads a person field: the leader declares, the record comments.',
    writes: ['links', 'decisions', 'delegations', 'couplingMarkers'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: supplyRule,
    module: 'supplyRules.js',
    purpose: 'RULE-SUP-01 turns a frozen evidence-supply plan into at most `supplyMaxTasks` leader-owned capture tasks — one per planned line, each stating the missing count, the measured arrival rate, the median wait and the hours it will take — with a `supplies-evidence` edge from the plan to every task and an `unblocks-judgement` edge to the open records the line\'s output is for; RULE-SUP-02 turns a binding constraint into exactly one governed evidence-capacity DACI decision per ISO week, with the three Theory-of-Constraints moves printed as options; RULE-SUP-03 opens one blameless leader-owned retirement task per starved line per 30-day bucket (capped at two per scan), phrased as close-or-re-scope so the sunk-cost discipline is applied to open questions; RULE-SUP-04 opens exactly one "read the answer now" task, once per line ever, when a line reaches its floor while open work still waits on it — the refusal becoming a clickable destination; RULE-SUP-05 queues grading for a frozen plan whose review date passed ungraded and reconciles stale plan edges. Marker-idempotent, pausable by `supplyAutoPropagate` (an explicit scan always runs). It never manufactures a unit, never marks a line full, never invents a refused judgement and never rates, ranks or names a person.',
    writes: ['supplyMarkers', 'supplyPlans', 'links', 'decisions', 'delegations'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: solvencyRule,
    module: 'solvencyRules.js',
    purpose: 'RULE-SLV-01 turns a frozen promise-solvency reading into at most `solvencyMaxTasks` leader-owned repair tasks — one per exposure the reading itself ranked as worth the ask, each carrying the sentence to say — with an `endangers-promise` edge from the reading to every promise it priced and exactly one governed DACI capacity decision per ISO week when coverage is below 1; RULE-SLV-02 turns already-overdue promises into one acknowledgement task per promise ever (capped at two per scan) and a promise that has reached its move cap into ONE governed decision, because a fourth date is not a renegotiation; RULE-SLV-03 opens one blameless process question per 30-day bucket when the share of the forward book expected to break crosses the leader\'s alarm; RULE-SLV-04 queues grading for a frozen reading whose window closed ungraded; RULE-SLV-05 reconciles stale reading edges. Marker-idempotent, pausable by `solvencyAutoPropagate` (an explicit scan always runs). It never moves a promise date, never rewrites a frozen reading and never rates, ranks or names a person.',
    writes: ['solvencyMarkers', 'solvencyReadings', 'links', 'decisions', 'delegations'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: scepticRule,
    module: 'scepticRules.js',
    purpose: 'RULE-SCP-01 turns a frozen cross-examination round into at most `scepticMaxTasks` leader-owned cross-examination tasks — one per priced claim the round itself ranked highest, each carrying the single observation (its refuter) that would settle it — with a `cross-examines` edge from the round to every claim it priced (capped at eight beyond the tasks) and a `finds-against` edge to the counter-record where the record reaches one; RULE-SCP-02 turns a family whose whole 90% credible interval sits above the declared tolerance into ONE governed DACI decision per family per 30-day bucket, phrased as a process question with three process options; RULE-SCP-03 writes a `records-verdict` edge from each human verdict to the record whose claim it settles and reconciles stale round edges; RULE-SCP-04 queues grading for a frozen round whose review date passed ungraded; RULE-SCP-05 opens one blameless question per 30-day bucket when the dismissal rate crosses the leader\'s own cap, because a terminal that is mostly dismissed is either broken or being closed. Marker-idempotent, pausable by `scepticAutoPropagate` (an explicit scan always runs). It never records, rewrites or infers a verdict, never re-scores a round, never edits a claim and never rates, ranks or names a person.',
    writes: ['scepticMarkers', 'scepticRounds', 'links', 'decisions', 'delegations'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: chainRule,
    module: 'chainRules.js',
    purpose: 'RULE-CHN-01 escalates every open record that has outlived the time span of the altitude that owns it to ONE task for the nearest ancestor whose altitude can decide it (capped per scan, marker-idempotent per record), writing an `escalates-to` edge from the record and a `rolls-up-to` edge to the altitude that now holds it — it never closes, edits, re-types or re-prioritises the record; RULE-CHN-02 opens at most two span briefs per ISO week so a span carrying work past its own horizon reaches the level above as a scheduled hand-up rather than a surprise; RULE-CHN-03 turns hard reporting defects (a cycle, a self-manager, a level inversion) into exactly one governed structural DACI decision per ISO week with three printed moves, moving no line and re-titling nobody; RULE-CHN-04 turns leader altitude drift above the declared share into exactly one governed decision per ISO week about what to hand down, formalise or stop, delegating nothing on the leader\'s behalf; RULE-CHN-05 queues grading for a frozen reading whose window closed ungraded and reconciles stale chain edges. Every altitude, span, rate and clock is derived on read from the roster and the dated records other modules already keep. Marker-idempotent, pausable by `chainAutoPropagate` (an explicit scan always runs), and it never rates, ranks, scores or names a person as a subject of judgement; it never reads `conflicts` or `pulses`, which are forbidden link endpoints.',
    writes: ['chainMarkers', 'chainReadings', 'links', 'decisions', 'delegations'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: evidenceRule,
    module: 'evidenceRules.js',
    purpose: 'RULE-EBM-01 opens exactly one DACI decision per pooled cell, ever, when the random-effects interval stays on the harmful side of zero (`grounds-practice`); RULE-EBM-02 opens one replication task when a supported pre-registered result stands alone; RULE-EBM-03 opens a study task when an intervention\'s information value exceeds its expected effect; RULE-EBM-04 attaches the newest frozen review to open cases with `recommends-for` edges and one owned delegation; RULE-EBM-05 reconciles stale evidence edges and opens grading work for reviews past their review date. All writes are marker-idempotent; it never scores a person and never alters a study.',
    writes: ['evidenceMarkers', 'decisions', 'delegations', 'links'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: couplingRule,
    module: 'couplingRules.js',
    purpose: 'RULE-COUP-01 discovers the other decisions that share a decision\'s approver and records a `shares-approver` typed edge (RULE-COUP-01); RULE-COUP-02 opens exactly one DACI approval-mechanism decision when an approver serves at least `couplingBottleneckActors` distinct drivers; RULE-COUP-03 opens exactly one DACI decision to shorten or batch an over-long hand-off chain; RULE-COUP-04 opens exactly one DACI re-sequence decision when a shared approver\'s priced Kingman delay clears `couplingDelayThresholdDays` for any stream. All writes are marker-idempotent typed links and decisions; it never rates a person.',
    writes: ['links', 'decisions', 'delegations', 'couplingMarkers'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: warGameRule,
    module: 'warGameRules.js',
    purpose: 'RULE-WG-01 writes typed `stresses` edges from a committed war game to each strategy bet whose say–do gap worsens by more than 10pp under an evaluated scenario; RULE-WG-02 opens one DACI decision about coalition repair when a scenario breaks coalition stability; RULE-WG-03 opens one owned re-planning delegation when attention reallocation exceeds 50% under any scenario; RULE-WG-04 writes typed `prefigures` edges to cases whose severity rises by at least 1.0 under a scenario. All writes are marker-idempotent typed links, decisions or delegations.',
    writes: ['links', 'decisions', 'delegations', 'warGameMarkers'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: parityRule,
    module: 'parityRules.js',
    purpose: 'RULE-PAR-01 opens at most one DACI standard-consistency calibration decision per ISO week when adopted performance plans, succession nominations or rated reviews invert recorded evidentiary bars (`audits-consistency`); RULE-PAR-02 queues blameless re-engagement prompts and leader-owned tasks (`rebalances-attention`) for post-ramp teammates in the structural fringe; RULE-PAR-03 queues accountability prompts and recovery actions (`repairs-contract`) for repeated overdue leader promises; RULE-PAR-04 prompts career check-ins for overlooked 4/5+ bench members; RULE-PAR-05 reconciles stale parity edges and opens grading work for due parity audits. Never scores or assigns homework to an employee.',
    writes: ['parityMarkers', 'links', 'decisions', 'delegations', 'people'],
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

  {
    rule: successionRule,
    module: 'successionRules.js',
    purpose: 'RULE-SUC-01 opens ONE leader-owned notice task per span per 30-day bucket when a span\'s collective blanket sits inside the notice window; RULE-SUC-02 opens ONE governed DACI decision per span per 30-day bucket when the maximum-flow test certifies that a holder\'s obligations cannot be reabsorbed, plus at most `successionMaxTasks` owned tasks carrying the min-cut certificate (`certifies-gap` from the obligation, `understudies-for` to the seat); RULE-SUC-03 opens ONE development commitment per span per 90-day bucket when work is concentrated behind a single holder above the declared cap (`hedges-departure`); RULE-SUC-04 queues grading for a frozen reading whose review date passed ungraded (`benches-for`); RULE-SUC-05 reconciles dead certificate edges after a deletion or reorganisation. Reads only dated records the workspace already keeps; never rates, ranks, scores or names a person as a subject, never moves a reporting line, never reads conflicts or pulses, and is marker-idempotent and pausable by `successionAutoPropagate` (an explicit scan always runs).',
    writes: ['successionMarkers', 'delegations', 'decisions', 'links', 'events'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: authorityCalibrationRule, module: 'authorityCalibrationRules.js', purpose: 'RULE-ACL-01 opens one governed DACI decision per action-class × receiver-altitude cell below the reliability floor per ISO week and writes rolls-up-to edges from each breaching mandate to every leadership ancestor of the receiver seat; RULE-ACL-02 writes one advisory maturity marker when a cell reaches the evidence floor. Advisory only: no contract, setting or seat is auto-applied.', writes: ['authorityCalibrationMarkers', 'decisions', 'links'], emits: [], scansWorkspace: true,
  },
  {
    rule: missionRule, module: 'missionRules.js', purpose: 'RULE-MIS-01: a frozen identity-free brief opens one governed review and typed summarizes-span provenance to child leadership seats. Runs before the final vertical fan-out.', writes: ['decisions', 'links'], emits: [], scansWorkspace: false,
  },
  {
    rule: concordanceRule, module: 'concordanceRules.js', purpose: 'RULE-ECN-01 writes one rolls-up-to edge per leadership ancestor above the pair\'s leader for every closed two-sided expectation round, plus a re-tests edge when the round re-tests an earlier re-contracting decision; RULE-ECN-02 opens ONE governed DACI re-contracting decision per pair per ISO week when weighted κ sits below the declared floor or any dimension is two whole steps apart, and places ONE generated agenda line on the pair\'s most recent 1:1 so the conversation has a place to happen; RULE-ECN-03 writes one advisory maturity marker at the evidence floor. The subject of every write is a PAIR and an EXPECTATION: no person is rated, ranked or scored, no performance record is edited, and no expectation is changed without a human decision. Marker-idempotent, pausable by concordanceAutoPropagate, and an explicit scan always runs.', writes: ['concordanceMarkers', 'decisions', 'links', 'oneOnOnes'], emits: [], scansWorkspace: true,
  },

  {
    rule: operatingModelRule, module: 'operatingModelRules.js', purpose: 'RULE-OMD-01 opens ONE governed DACI design decision per congested span per ISO week, addressed to the nearest ancestor whose altitude can author the change, with the options being the levers the lever engine actually priced (never a hire first, and never a hire at all below the continuity floor); RULE-OMD-02 writes typed rolls-up-to edges from a congested span to every leadership ancestor in the SAME transaction and one relieves edge from the decision to the span it is about; RULE-OMD-03 writes one advisory fragility marker per distinct fragile set (a fingerprint, not the set, so the marker ledger is not a second unredacted copy) and opens at most ONE governed continuity decision per ISO week. The subject of every write is a POSITION DESIGN, a SPAN or a frozen reading: no person is rated, ranked, scored or compared, no reporting line is edited, no work is reassigned and no commitment is cut. Marker-idempotent, pausable by omAutoPropagate, and an explicit scan always runs.', writes: ['omMarkers', 'decisions', 'links'], emits: [], scansWorkspace: true,
  },
  {
    rule: altitudeRouterRule, module: 'altitudeRouterRules.js', purpose: 'RULE-AR-01 writes one routes-through edge, one discloses-to edge to the owning seat and one rolls-up-to edge per leadership ancestor (frontline → manager → director → executive) in the SAME atomic transaction as the adopted case; RULE-AR-02 opens one governed DACI re-routing decision per detected-altitude cell below the reliability floor per ISO week and fans it up every ancestor; RULE-AR-03 writes one advisory maturity marker. Marker-idempotent, pausable, and never auto-corrects a plan, setting or reporting line.', writes: ['altitudeRoutingMarkers', 'decisions', 'links'], emits: [], scansWorkspace: true,
  },
  {
    rule: boardRule, module: 'boardRules.js', purpose: 'RULE-BRD-01 opens exactly ONE governed DACI decision per failing claim per committed memo revision, and — where the failing reading is attributable to a span — exactly ONE owned obligation delegated to that span\'s holder, so an enterprise finding becomes a named directorate obligation in the SAME atomic transaction; RULE-BRD-02 writes one typed summarizes-span edge from the memo to every span whose records produced its figures and one escalates-from edge per generated decision, so provenance is walkable in both directions; RULE-BRD-03 writes one advisory marker when the workspace freezes its first memo. The rules take the FROZEN snapshot as given: no claim is edited, no threshold changed, no verdict rewritten, and no person is rated. Marker-idempotent, pausable by boardAutoPropagate, and an explicit scan always runs.', writes: ['boardMarkers', 'decisions', 'delegations', 'links'], emits: [], scansWorkspace: true,
  },
  {
    rule: catchballRule,
    module: 'catchballRules.js',
    purpose: 'RULE-HK-01 writes idempotent Hoshin Catchball provenance (deploys-strategy, cascades-to, counters-upward, trades-off, funds) and one rolls-up-to edge per leadership ancestor in the reporting tree in the SAME atomic transaction; RULE-HK-02 opens one governed DACI decision + 1:1 prompt on Watermelon divergence and one upstream Double-Loop Strategy Review decision (exonerating execution) when leading adherence holds while lagging outcomes stall; RULE-HK-03 records calibration maturity markers and opens one governed review decision per altitude cell below the delivery hold floor.',
    writes: ['catchballMarkers', 'decisions', 'people', 'links'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: strategyCycleRule,
    module: 'strategyCycleRules.js',
    purpose: 'RULE-SCR-01 links an identity-reduced cycle to its Catchball cohort, declared strategy bets and leadership ancestors, opens one human renewal decision for carryover/stop-rule exposure, and grades only settled outcomes inside the frozen review window above the evidence floor; RULE-SCR-02 creates one owner-consent reconciliation decision when a human stop-rule verdict retires a bet that still has active Catchball work. Both rules are bounded, marker-idempotent and pausable; no bet, budget, owner, date or pact is changed automatically.',
    writes: ['strategyCycleMarkers', 'strategyCycles', 'decisions', 'links'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: escalationRule,
    module: 'escalationRules.js',
    purpose: 'RULE-ESC-01 writes one typed `escalates-to` edge to the receiving seat, one `originates-from` edge to the recorded source item, and one `rolls-up-to` edge per leadership ancestor of BOTH the originating and the receiving span, so a single frontline hand-off reaches manager, director, VP and chief in the SAME atomic transaction; RULE-ESC-02 opens one governed absorption-capacity DACI decision plus one owned task per saturated or unstable receiving span per ISO week (exact M/M/1 utilisation with a Kingman variability bound, and a refusal rather than a large number when rho >= 1); RULE-ESC-03 opens one governed intervention-rate commitment decision per span per ISO week plus one blameless talking point when escalation yield sits below the declared floor over at least the cell floor of settled escalations; RULE-ESC-04 writes a `reconciles-authority` edge and one owned reconciliation task for a graded commitment the span breached; RULE-ESC-05 opens one owned return-the-monkey task per escalation left open above where it arose past the declared return window. Marker-idempotent, pausable by escalationAutoPropagate, an explicit scan always runs, and no rule rates, ranks or scores a person: every subject is a DECISION CLASS and a SPAN.',
    writes: ['escalationMarkers', 'decisions', 'delegations', 'people', 'links'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: federationRule,
    module: 'federationRules.js',
    purpose: 'RULE-FED-01 writes one summarizes-span edge from a frozen federation assessment to the seat it assessed and one to every leadership ancestor above that seat in the SAME atomic transaction, plus one idempotent measurement marker — so the reading rolls up like any other record. RULE-FED-02 measures every declared child→parent edge from DATED CARRIAGE already written by other modules (envoy packet carriage, frozen renewal and cadence readings, accepted Catchball commitments, closed two-sided expectation rounds) and opens exactly ONE governed DACI decision per edge per ISO week when the edge is silent, bypassed or stale, owned at the span above the edge — naming the edge by altitude and typed id, never by a person. RULE-FED-03 records one reconnects edge and one marker when measured carriage resumes on an edge that once produced a silent-edge finding, and deliberately does NOT close the human decision. The module writes no measured channel, sends no message, changes no reporting line and rates no person. Marker-idempotent, pausable by federationAutoPropagate, and an explicit scan always runs.',
    writes: ['federationMarkers', 'decisions', 'links'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: spanCalibrationRule,
    module: 'spanCalibrationRules.js',
    purpose: 'RULE-SPC-01 registers a frozen discretion calibration as a graph node: one `calibrates` edge to the spans running the ladder and one `rolls-up-to` edge per leadership ancestor, in the SAME atomic transaction. RULE-SPC-02 measures each rung\'s survival at its declared span against the declared coverage promise and opens at most ONE governed DACI decision per falsified rung per ISO week, owned by the workspace leader and stating the interval and the two honest options — re-route the work or revise the span. RULE-SPC-03 opens one bounded review task per ISO week when the ladder has not been re-measured inside the declared review window, and one governed re-decision per ISO week when a calibrated ladder in force no longer matches the record. RULE-SPC-04 grades a due frozen reading ONCE, out of sample, on items opened after the freeze. The module never moves a horizon (adoption is a dated human command), never reads an individual-sensitive source, never rates or names a person and never edits the work it measures. Marker-idempotent, pausable by spanCalibrationAutoPropagate, and an explicit scan always runs.',
    writes: ['spanMarkers', 'spanReadings', 'decisions', 'delegations', 'links'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: freezeLineRule,
    module: 'freezeLineRules.js',
    purpose: 'RULE-FRZ-01 registers a frozen freeze-line continuity reading as a graph node: one `freezes` edge to the committed/reverted org design, up to twelve `re-projects` edges to the pre-freeze federation assessments (aggregate only), and one `rolls-up-to` edge per leadership ancestor of the design owner\'s span — all in the SAME atomic transaction. RULE-FRZ-02 measures dated carriage on both sides of each freeze line (the same artefacts the federation rule reads) and opens at most ONE governed DACI decision per line per ISO week when the connected share of declared edges degrades beyond the declared threshold, owned at the span above the design owner and named by date and kind, never by a person. RULE-FRZ-03 audits frozen federation snapshots for suppressed rows still carrying a carriage date (a timing side channel on a withheld cell) and opens at most one redaction decision per snapshot per ISO week. The module never changes a reporting line, never closes a human decision, never re-projects per-span detail across a line, and never rates a person. Marker-idempotent, pausable by freezeLineAutoPropagate, and an explicit scan always runs.',
    writes: ['freezeMarkers', 'decisions', 'links'],
  },
  {
    rule: reputationalCapitalRule,
    module: 'reputationalCapitalRules.js',
    purpose: 'RULE-RCL-01 registers every reputational cell the workspace can already evidence as a graph node: one `rests-on` edge per distinct dated source record it was read from (never a copy) and one `rolls-up-to` edge per leadership ancestor of the span, in the SAME atomic transaction. RULE-RCL-02 opens at most ONE governed DACI decision per span per act class per ISO week when the interval has fallen below the obstacle or the class is disputed, owned at the span above the person and naming the class, the interval and the two honest routes (bank a repair, move down the tier ladder). RULE-RCL-03 opens at most ONE governed decision per open guarantee per ISO week when its cell is not solvent: the engine never withdraws authority a human offered. RULE-RCL-04 closes a due repair once the acts it declared are actually banked, and otherwise opens one governed decision — never a silent expiry. RULE-RCL-05 grades a tagged guarantee exactly ONCE against the claim frozen at open time and prints the platform\'s own squared error, so the ledger answers to the same discipline it asks of leaders. The subject of every write is a PERSON-AS-COUNTER-PARTY, an ACT CLASS and a TIER: no person is rated, ranked or scored, no performance record is edited, no decision is closed, no reporting line changes and no message is sent. Marker-idempotent, pausable by reputationAutoPropagate, and an explicit scan always runs.',
    writes: ['reputationMarkers', 'reputationPositions', 'decisions', 'links'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: hindsightRule,
    module: 'hindsightRules.js',
    purpose: 'RULE-HND-01 freezes one information set per decision: the records the shared link spine had ALREADY tied to it on or before the decision date (each link carries `createdOn`, so a retrospective lock reconstructs the same set exactly), plus the decision record\'s own quality bar as it stood then. The lock becomes a graph node with one `locks` edge to the decision, up to twenty `consults` edges to the facts it rested on, and one `rolls-up-to` edge per leadership ancestor of the owning span, in the SAME atomic transaction. RULE-HND-02 opens exactly ONE governed process review, ever, for a decision whose frozen process was thin and whose recorded outcome was nevertheless good — the successful mistake nobody reviews. RULE-HND-03 opens one governed decision when a lock consulted less than the declared share of the facts already on the record at decision time, naming the missed COUNT and never the missing content. RULE-HND-04 opens at most one bounded review prompt per lock per ISO week when a decision passes its own review date plus the declared grace ungraded. The module never edits a decision, never rewrites a lock, never infers relevance, never charges a decision for a fact that arrived after it, never rates or names a person, and never closes a human decision. Marker-idempotent, pausable by hindsightAutoPropagate, and an explicit scan always runs.',
    writes: ['decisionLocks', 'decisionLockMarkers', 'decisions', 'links'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: diligenceRule,
    module: 'diligenceRules.js',
    purpose: 'RULE-DLG-01 FREEZE reads five evidence classes other modules OWN (cases, premises, delegations, goals and strictly-earlier settled decisions) and freezes one typed-pointer knowable set per decision at the moment the decision is committed. It writes one `diligence-for` edge to that decision, one `deliberates-on` edge per fact pointer, and one `rolls-up-to` edge per leadership ancestor of the owning span IN THE SAME ATOMIC TRANSACTION: the transaction that records a call also makes the frontier it leapt over visible above the span. RULE-DLG-02 GAP opens exactly ONE governed decision per span per ISO week when a settled frontier sits below the declared diligence floor. RULE-DLG-03 DARK opens exactly ONE governed decision per class per ISO week when the whole Jeffreys Beta(1/2,1/2) 90% credible interval on the consulted share of a class sits below the declared ceiling — the class the organisation systematically walks past. RULE-DLG-04 GRADE grades a pre-declared process forecast exactly ONCE, out of sample, after settlement, by Brier skill against a strictly-prior 0.5 base rate; an overconfident forecast is printed, not hidden. Consultation is append-only evidence that a leader LOOKED: `used`, `deferred` and `ruled-out` (with a required reason) all count as diligence, so a dismissed fact is not silently charged as a miss. The module never edits the records of another module, never infers relevance from a title, never back-fills a frontier at upgrade, never rates or names a person, and never closes a human decision. Marker-idempotent, bounded, pausable by diligenceAutoPropagate, and an explicit scan always runs.',
    writes: ['diligenceChecklists', 'diligenceConsults', 'diligenceGrades', 'diligenceMarkers', 'decisions', 'links'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: epistemicRule,
    module: 'epistemicRules.js',
    purpose: 'RULE-EPI-01 harvests every signal the record ALREADY holds — an unclosed constructive-feedback follow-up, an ageing risk case, a stalled performance conversation, a breached premise, an at-risk or overdue goal, an overdue delegation, a decision with a bad outcome, work absorbed without review, and the opportunity signals (a finished goal nobody recognised, a closed case no lesson was drawn from, ninety days without a named contribution) — into ONE unknown per source record, with an id hashed from that record so a rescan cannot duplicate it. Each unknown becomes a graph node with one `rests-on` edge to the record it was read from (a pointer, never a copy) and one `rolls-up-to` edge per leadership ancestor of the owning span, in the SAME atomic transaction: the transaction that notices a missed signal also makes the MISSED signal visible above the span that missed it. RULE-EPI-02 opens exactly ONE governed decision per unopened danger/defect unknown that has passed the declared escalation age, naming the record, the age and the two honest routes. RULE-EPI-03 marks a harvested unknown `expired` when its declared evidence-bound expiry passes with no human answer and opens at most ONE bounded prompt per unknown per ISO week — expiry is never recorded as resolution. RULE-EPI-04 opens at most ONE calibration review per span per ISO week where the span\'s pooled belief-versus-record kappa over-predicts good outcomes above the declared band; under-confidence is deliberately NOT escalated, because its owner is the span itself. RULE-EPI-05 grades a frozen belief observation exactly ONCE against the record\'s own resolved outcomes. The module never asks for a sentiment score, never infers that something is wrong from a title, never closes an unknown because time passed, never rates, ranks or names a person, and never edits another module\'s record. Marker-idempotent, bounded, pausable by epistemicAutoPropagate, and an explicit scan always runs.',
    writes: ['epistemicUnknowns', 'epistemicObservations', 'epistemicGrades', 'epistemicMarkers', 'decisions', 'links'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: carryoverRule,
    module: 'carryoverRules.js',
    purpose: 'RULE-CO-01 creates one carryover record per Catchball pact settled as thesis-invalidated (frozen resource bundle: person-days + encumbered budget line), writes carries-over/settles edges and one rolls-up-to edge per leadership ancestor of the receiving span in the SAME atomic transaction, and opens ONE governed stop-rule settlement decision per resolved bet (retire / revise stop rule / reaffirm) with the bundle printed in the question; RULE-CO-02 on decision.made records the verdict and — for retire — releases the encumbered budget line (committed to released, never erasing a spent actual) and returns the person-day commitment in the same transaction, writing releases-resource edges; RULE-CO-03 settles pending records when a bet is retired or a retire verdict is recorded by a human; RULE-CO-04 grades settled records once, later, against the prediction frozen at decision time and opens one governed review decision per altitude cell below the reliability floor per ISO week. Marker-idempotent, pausable by carryoverAutoPropagate, and an explicit scan always runs.',
    writes: ['carryoverRecords', 'carryoverMarkers', 'carryoverGradings', 'decisions', 'delegations', 'people', 'budgets', 'links'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: disclosureRule,
    module: 'disclosureRules.js',
    purpose: 'RULE-DSC-01 turns one recorded release request into ONE governed DACI decision (release / refuse-and-share-the-aggregate / narrow), ONE consent task addressed to the span leader whose records would be widened, and the typed edges that make it navigable (`authorizes` from the decision, `discloses-to` the requesting altitude, `tracks-followup` to the consent task). The rule grants nothing: only the consenting span leader creates authority, and only the compiler reads it. RULE-DSC-02 sweeps expiries — a lapsed window stops authorising reads, opens ONE review task on whether the released detail changed the decision, and reconciles edges to releases that no longer exist. Marker-idempotent, pausable by disclosureAutoPropagate, and an explicit scan always runs.',
    writes: ['disclosureGrants', 'disclosureMarkers', 'decisions', 'delegations', 'links'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: cadenceRule,
    module: 'cadenceRules.js',
    purpose: 'RULE-CAD-01 writes one idempotent `queued-for` edge from every reviewable open item to the single standing forum competent to close it (kind competence AND time-span of discretion AND class horizon), plus one `rolls-up-to` edge per leadership ancestor of the owning span, in the SAME atomic transaction; a sensitive source contributes a count and never an edge. RULE-CAD-02 opens exactly one governed DACI decision per ISO week when the named binding constraint is forum capacity, a competence gap or service time, owned at the seat that can relieve it and fanned up every ancestor. RULE-CAD-03 writes bounded `fit-gap` edges naming the owning seats a forum’s membership is missing. RULE-CAD-04 grades each due frozen reading exactly once and records one maturity marker when a forum’s sitting history reaches the evidence floor. Never rates a person, never invents a waiting time below the floor, never auto-declares a forum.',
    writes: ['links', 'decisions', 'cadenceReadings', 'cadenceMarkers'],
    emits: [], scansWorkspace: true,
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: identityRule,
    module: 'identityRules.js',
    purpose: 'RULE-IDN-01 appends one `identity.attested` event per qualifying commit, whose entityId is HMAC-SHA256(seatKey, seat|keyId|revision|digest of the transaction\u2019s events-so-far) under the unlocked seat credential \u2014 no key, no attestation, never a declared fallback; idempotent by revision and deliberately NOT pausable. RULE-IDN-02 logs one `identity.unattributed` event per unattributed commit under enforcement (revision-idempotent) and opens ONE governed DACI authorship-boundary decision per acting seat per ISO week with a typed rolls-up-to edge to every leadership ancestor in the SAME transaction. RULE-IDN-03 records explicit-scan verification verdicts with honest three-valued outcomes (verified / FAILED / digest-verified-key-unavailable). Marker-idempotent; session-lifecycle events are never flagged unattributed; it rates no person and touches no performance record.',
    writes: ['seatIdentities', 'identityMarkers', 'decisions', 'links', 'events'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: envoyRule,
    module: 'envoyRules.js',
    purpose: 'RULE-ENV-01 writes one `carries` edge from an ingested packet to the receiving leadership span AND every ancestor of it, in the same atomic transaction as the ingestion, so a span’s attested pack is visible at each altitude in the form that altitude may hold; RULE-ENV-02 opens exactly ONE governed DACI reconciliation decision per divergent origin record per ISO week and links it to the packet (`reconciles`) — the local record is never overwritten by a foreign packet; RULE-ENV-03 opens ONE governed review when a verified packet’s own attested open-critical share clears the declared floor and records an advisory marker below the 3-item floor where no share may be published. Every figure in every decision comes from the packet’s own attestation. Marker-idempotent, pausable by envoyAutoPropagate, an explicit scan always runs, and no rule edits a foreign record, rates a person or accepts an unverified packet.',
    writes: ['exchangeMarkers', 'decisions', 'links'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: seatRule,
    module: 'seatRules.js',
    purpose: 'RULE-SEAT-01 fans one typed `rolls-up-to` edge per leadership ancestor for every open work item in the declarative SIGNAL_SOURCES registry, so a frontline case reaches manager, director, VP and chief spans in the same atomic transaction (idempotent by exact-edge uniqueness); RULE-SEAT-02 opens at most one auditable seat handover per seat per ISO week carrying the boundary disclosure; RULE-SEAT-03 records one explicit boundary audit naming how many records were withheld and why. Runs last so it reads the finished workspace. Never reads conflicts or pulses, never rates or names a person, never writes to a staged collection, and is INERT until a seat is explicitly declared (the undeclared operator view writes nothing). Sensitive individual records contribute to aggregate counts but are never identified by a typed roll-up edge.',
    writes: ['links', 'delegations', 'events'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: differencingRule,
    module: 'differencingRules.js',
    purpose: 'Registers a published aggregate as a graph node with vertical roll-up edges, opens one governed publication-integrity decision per module per ISO week when exact integer arithmetic determines a withheld value, records what a protected release removed with one owned explanation, and opens one publication-rhythm decision when a module\'s published totals are not a stationary series.',
    writes: ['links', 'decisions', 'delegations', 'differenceMarkers'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: prospectiveRule,
    module: 'prospectiveRules.js',
    purpose: 'RULE-PIC-01 freezes a pre-registered bet as a graph node with one governed DACI decision, one owned outcome task, a typed `pre-registers` edge and a vertical `rolls-up-to` edge for every leadership ancestor in the same atomic write; RULE-PIC-02 grades each due cohort exactly ONCE from dated records other modules own (Brier proper scoring against a strictly-prior base rate), refuses unobservable cohorts loudly with one owned reconciliation task, and fans the grade up the same tree; RULE-PIC-03 opens at most one governed calibration decision per altitude-by-instrument cell per ISO week when Brier skill falls below the declared floor; RULE-PIC-04 opens one outcome-integrity decision per ISO week for overdue ungraded contracts. Never adjusts a declared probability, never closes a human decision, never rates a person and never asserts causality.',
    writes: ['links', 'decisions', 'delegations', 'prospectiveGrades', 'prospectiveMarkers'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: robustAllocationRule,
    module: 'robustAllocationRules.js',
    purpose: 'RULE-RAL-01 freezes an adopted robust allocation as a graph node with one governed DACI decision, one owned delivery task per funded line, `allocates`/`consumes-capacity`/`rests-on` provenance and a vertical `rolls-up-to` edge for every leadership ancestor in the same atomic write; RULE-RAL-02 opens at most one governed re-allocation decision per plan per ISO week when a linked prospective contract grades below its pre-registered threshold; RULE-RAL-03 opens one delivery-integrity decision per plan per ISO week for a funded line that outlived the horizon; RULE-RAL-04 opens one evidence-integrity decision per plan per ISO week for a linked contract that was never graded; RULE-RAL-05 (ADR-0097) reads the graded prospective record by altitude × instrument cell and opens at most one governed premise–evidence tension decision per cell per ISO week — with counts and a Wilson interval only — when the settled record is more falsified than reached, while never adjusting a declared range itself. Never auto-adopts a plan, never closes a human decision, never rates a person, never asserts causality and never pools money across currencies.',
    writes: ['links', 'decisions', 'delegations', 'robustMarkers'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: clearingRule,
    module: 'clearingRules.js',
    purpose: 'RULE-CLR-01..05 turn a committed internal clearing round into one governed delivery decision, one owned delegation per funded span, same-currency encumbrance and typed provenance; settle deficits, overdue horizons, resource-mix bottlenecks and chronic altitude-cell misses into idempotent, blameless governed work. The rule never rates a person, never edits a bid or closes a human decision, and keeps the exact frozen solver certificate as the source of truth.',
    writes: ['clearingMarkers', 'decisions', 'delegations', 'budgets', 'links'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: sealRule,
    module: 'sealRules.js',
    purpose: 'RULE-SEAL-01 appends one `audit.seal` event per sealed transaction, committing to (previous seal, SHA-256 digest of every event appended in that transaction, revision) — HMAC-SHA256 keyed when the vault is unlocked, plain SHA-256 otherwise. It runs LAST so the seal covers the whole cross-module propagation of the same atomic commit; RULE-SEAL-02 records the verification verdict on an explicit `seal.scan`. INERT unless `sealEnabled` (automatic pass) or the event is an explicit `seal.*` request; idempotent by revision; writes only to the append-only event log, never to records.',
    writes: ['events'],
    emits: [],
    scansWorkspace: true,
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
