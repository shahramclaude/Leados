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
import { executionRule } from './executionRules.js';
// ADR-0107: the Outcome Learning Loop (87th rule / 87th contract).
import { outcomeRule } from './outcomeRules.js';
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
import { matrixRule } from './matrixRules.js';
import { matrixCoordinationRule } from './matrixCoordinationRules.js';
import { sodRegisterRule } from './sodRegisterRules.js';
import { priorityArbitrationRule } from './priorityArbitrationRules.js';
import { contradictionRule } from './contradictionRules.js';
// ADR-0147: Matrix Multi-Line Review Stewardship declares its contract like
// every other rule on the spine.
import { reviewStewardshipRule } from './reviewStewardshipRules.js';
import { lineConsentRule } from './lineConsentRules.js';
import { lineReaffirmationRule } from './lineReaffirmationRules.js';
import { structureHistoryRule } from './structureHistoryRules.js';
import { onboardingMatrixRule } from './onboardingMatrixRules.js';
import { lineExitRule } from './lineExitRules.js';
import { authorityContinuityRule } from './authorityContinuityRules.js';
import { matrixInterfaceRule } from './matrixInterfaceRules.js';
import { doaScheduleRule } from './doaScheduleRules.js';
import { meritEvidenceRule } from './meritEvidenceRules.js';
import { benchEvidenceRule } from './benchEvidenceRules.js';
import { benchRegressionRule } from './benchRegressionRules.js';
import { oneOnOneLineRule } from './oneOnOneLineRules.js';
import { hiringLineRule } from './hiringLineRules.js';
import { transferPriceRule } from './transferPriceRules.js';
import { chargebackPostingRule } from './chargebackPostingRules.js';
import { delegationLineRule } from './delegationLineRules.js';
import { lineHorizonRule } from './lineHorizonRules.js';
import { workTurnRule } from './workTurnRules.js';
import { pausePermitRule } from './pausePermitRules.js';
import { workforceFlowRule } from './workforceFlowRules.js';
import { changeSaturationRule } from './changeSaturationRules.js';
import { aarCorroborationRule } from './aarCorroborationRules.js';
import { dependencyCycleRule } from './dependencyCycleRules.js';
import { interfaceAlignmentRule } from './interfaceAlignmentRules.js';
import { standardWorkRule } from './standardWorkRules.js';
import { priorityRule } from './priorityRankingRules.js';
import { goalCommitmentRule } from './goalCommitmentRules.js';
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
import { comparisonRule } from './comparisonRules.js';
import { decisionFitRule } from './decisionFitRules.js';
import { jurisdictionRule } from './jurisdictionRules.js';
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
    rule: executionRule, module: 'executionRules.js', purpose: 'RULE-EXE-01: registry-subscribed source events re-derive each adopted bundle from dated terminal evidence, write rests-on proof pointers and one rolls-up-to edge per leadership ancestor, and close only the engine-authored review checkpoint when the human-resolved case and every action agree. Missing, returned, cancelled and deleted records are never counted as delivered. Pausable; explicit scans always run.', writes: ['actionBundles', 'delegations', 'links', 'events'], emits: [], scansWorkspace: true,
  },
  {
    rule: outcomeRule, module: 'outcomeRules.js', purpose: 'RULE-OLN-01..04: keeps the 87th contract on the shared spine. FREEZE one immutable expectation per adopted bundle with typed rests-on pointers to every touched module and one rolls-up-to edge per leadership ancestor; GRADE exactly once from CLOSED terminal evidence plus a dated human outcome (Brier / fidelity / lateness / direction-first quadrant), refusing hindsight forecasts; open at most one governed stale-window review and one governed recalibration review per span per ISO week when pooled confidence is material. Root-event gated, marker-idempotent, pausable by outcomeAutoLearn; explicit scans always run. Never rates a person, auto-closes a human decision or overwrites a declared forecast.', writes: ['outcomeContracts', 'outcomeGrades', 'outcomeMarkers', 'decisions', 'links', 'events'], emits: [], scansWorkspace: true,
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
    rule: missionRule, module: 'missionRules.js', purpose: 'RULE-MIS-01: a frozen identity-free brief opens one governed review and typed summarizes-span provenance; an adopted Command Flow capture (including an LCA cross-span consolidation) links its source case, atomic bundle and any merged constituent captures, then writes one rolls-up-to edge per leadership ancestor without copying any note upward. Runs before the final vertical fan-out.', writes: ['decisions', 'links'], emits: [], scansWorkspace: false,
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
    rule: comparisonRule,
    module: 'comparisonRules.js',
    purpose: 'RULE-CMP-01 registers a recorded portfolio arbitration as a graph node in the SAME atomic transaction as the receipt: one `rehearses` edge to each of the two candidate responses that were replayed from the same frozen revision, one `informs` edge to the governed decision the human recorded, and one `rolls-up-to` edge per leadership rung above the recording seat (frontline → manager → director → VP → chief). It writes LINKS ONLY: it never edits the receipt, never adopts either response, never chooses for the human, never rates a response or a person and never invents a benefit score. Idempotent by construction — `ensureEntityLink` is exact on (source, target, relation) — so a rescan or a re-run cannot duplicate an edge and no marker ledger is needed. It never scans the workspace and is inert unless a `comparison.recorded` event arrives.',
    writes: ['links'],
    emits: [],
    scansWorkspace: false,
  },
  {
    rule: decisionFitRule,
    module: 'decisionFitRules.js',
    purpose: 'RULE-FIT-01 FREEZE classifies every open, governed call into one of five authority classes, each with a FLOOR (a floor, not a ceiling: above it any rung may hold the call, which is what makes delegation an option at all), and freezes the classification as an immutable snapshot keyed on (decision, class) — never on the rung that happens to hold it, so a rescan converges instead of appending. It writes one `prices-authority` edge to the decision it priced. RULE-FIT-02 PROPOSE opens exactly ONE governed delegation proposal per call per ISO week when the call has outlived its rung declared expected hold AND a material, non-provisional saving exists; it never moves work, and it never prices a call held BELOW its class floor as delegable — that call is priced as an ESCALATION to the floor, tagged as a compliance fix whose net is usually negative and printed honestly as such. RULE-FIT-03 GRADE grades the forecast that priced a settled delegation exactly ONCE, out of sample, against the dated contract outcome. RULE-FIT-04 ROLLUP publishes one identity-free span reading per (span, ISO week) as `rolls-up-to` per leadership ancestor IN THE SAME ATOMIC TRANSACTION, with a contested share that REFUSES below its disclosure floor rather than printing a share of two. Governed findings are audit output, never operational work: the rule excludes every module own governed decisions by three state-only provenance tests plus the structural test that a call with neither driver nor approver has no authority holder to price — the Session-143 second-order-decision regression, which reappeared here as 13 -> 40 -> 67 snapshots. The module never rates or names a person, never infers authority from a title, never back-fills a price at upgrade, and never auto-accepts its own proposal. Marker-idempotent, bounded, pausable by fitAutoPropagate, and an explicit fit.scan always runs.',
    writes: ['fitSnapshots', 'fitProposals', 'fitReadings', 'fitMarkers', 'decisions', 'links'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: jurisdictionRule,
    module: 'jurisdictionRules.js',
    purpose: 'RULE-JUR-01 DETECT harvests the workspace’s OWN open work records (cases, open calls and funded work) that name the SAME objective via field or `impacts-goal` graph edge, validates every goal pointer against `state.goals` (ADR-0111: counting unanchored work and refusing dangling/dropped goal ids rather than pricing phantom objectives, superseding frozen findings when a goal is dropped), and — when responsible spans sit in different reporting branches — freezes ONE immutable governance finding per (objective, ISO week). It writes one `spans-work` edge to EVERY member record (cross-module propagation) and one `rolls-up-to` edge per distinct leadership ancestor of its spans (vertical roll-up) IN THE SAME ATOMIC TRANSACTION, so the write that registers or anchors a record also prices who can lawfully resolve the objective it joined and makes that gap visible above every span holding a piece of it. The finding computes the lowest common ancestor, the MINIMAL covering coalition (Riker 1962 size principle: the smallest antichain of branches, never a grand coalition), the escalation rungs, and three Coase (1937) / Williamson (1975) governance routes priced in declared coordination units — coalition handoffs k(k-1)/2, per-rung escalation, one-off boundary redraw — with Wilson (1927) lower bounds on attribution and objective-anchoring completeness (Heckman 1979 sample-selection framing) and a Luce (1959) softmax route probability. RULE-JUR-02 GOVERN opens exactly ONE governed who-holds-this decision per priced finding per ISO week at the common ancestor’s rung; it NEVER moves a reporting line, reassigns a case or accepts itself — silence is never consent. RULE-JUR-03 GRADE grades a frozen finding EXACTLY ONCE, out of sample, by Brier against a strictly-prior 0.5 base, from the dated choice a human actually made; a missing choice, missing date or postdated review is a STORED REFUSAL (ungradable), never a zero. RULE-JUR-04 ROLLUP freezes one identity-free span reading per (span, ISO week) with small-cell suppression below the declared floor (suppression is not differential privacy and is labelled as such). Governed findings are audit output, never work: the harvest excludes every `[RULE-XXXX-NN]` engine-authored decision by a state-only structural test, and detection is ROOT-EVENT GATED so a scan can never price the engine’s own output — the Session-143 second-order-decision regression. RULE-JUR-05 DRIFT (ADR-0115) runs only on the explicit `jur.drift` command: a distribution-free split-conformal band grades the ISO-week series of cross-branch share and median coalition size over the identity-free readings RULE-JUR-04 froze, prints the pooled rate beside the mean of unit rates (Yule/Simpson aggregation bias), refuses below the declared week floor and never interpolates an unsampled week; a published band crossing opens exactly ONE governed, marker-idempotent decision per ISO week with one `rolls-up-to` edge per executive ancestor seat in the same atomic transaction. Marker-idempotent, bounded, pausable by jurAutoPropagate; an explicit jur.scan always runs.',
    writes: ['jurFindings', 'jurReadings', 'jurMarkers', 'decisions', 'links'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: epistemicRule,
    module: 'epistemicRules.js',
    purpose: 'RULE-EPI-01 harvests every signal the record ALREADY holds — an unclosed constructive-feedback follow-up, an ageing risk case, a stalled performance conversation, a breached premise, an at-risk or overdue goal, an overdue delegation, a decision with a bad outcome, work absorbed without review, and the opportunity signals (a finished goal nobody recognised, a closed case no lesson was drawn from, ninety days without a named contribution) — into ONE unknown per source record, with an id hashed from that record so a rescan cannot duplicate it. Each unknown becomes a graph node with one `rests-on` edge to the record it was read from (a pointer, never a copy) and one `rolls-up-to` edge per leadership ancestor of the owning span, in the SAME atomic transaction: the transaction that notices a missed signal also makes the MISSED signal visible above the span that missed it. RULE-EPI-02 opens exactly ONE governed decision per unopened danger/defect unknown that has passed the declared escalation age, naming the record, the age and the two honest routes — and at most the declared weekly escalation budget per owning span per ISO week (ADR-0117): oldest condition first, every transaction respecting the remaining weekly quota, and the over-budget remainder deferred and PRINTED (one dated deferral marker per span per week plus a live count with its renewal week), never silently dropped. RULE-EPI-03 marks a harvested unknown `expired` when its declared evidence-bound expiry passes with no human answer and opens at most ONE bounded prompt per unknown per ISO week — expiry is never recorded as resolution. RULE-EPI-04 opens at most ONE calibration review per span per ISO week where the span\'s pooled belief-versus-record kappa over-predicts good outcomes above the declared band; under-confidence is deliberately NOT escalated, because its owner is the span itself. RULE-EPI-05 grades a frozen belief observation exactly ONCE against the record\'s own resolved outcomes. The module never asks for a sentiment score, never infers that something is wrong from a title, never closes an unknown because time passed, never rates, ranks or names a person, and never edits another module\'s record. Marker-idempotent, bounded, pausable by epistemicAutoPropagate, and an explicit scan always runs.',
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
    purpose: 'RULE-CAD-01 writes one idempotent `queued-for` edge from every reviewable open item to the standing forum competent to close it (kind competence AND time-span of discretion AND class horizon) — refusing to pick by interval when concurrent accountable matrix forums compete (`ambiguous-matrix-authority`), reconciling stale edges when routes change or become ambiguous, and writing one `rolls-up-to` edge per leadership ancestor across every accountable reporting line in the SAME atomic transaction; a sensitive source contributes a count and never an edge. RULE-CAD-02 opens exactly one governed DACI decision per ISO week when the named binding constraint is forum capacity, a competence gap, ambiguous matrix authority (escalated to the joint apex), or service time, fanned up every ancestor. RULE-CAD-03 writes bounded `fit-gap` edges naming the accountable seats a forum’s membership is missing (and prunes resolved gaps). RULE-CAD-04 grades each due frozen reading exactly once and records one maturity marker when a forum’s sitting history reaches the evidence floor. Never rates a person, never invents a waiting time below the floor, never auto-declares a forum.',
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
    rule: matrixRule,
    module: 'matrixRules.js',
    purpose: 'RULE-MTX-01 fans one typed `rolls-up-to` edge from every open work item to EVERY manager in the reporting set of each person it touches who is accountable to more than one manager — the project, product, cross-functional and administrative lines the primary `person.managerId` tree does not contain — so the second manager sees the work in the SAME atomic transaction as the declaration that created the line. It runs immediately before the Operating Seat so one commit carries both fans. Idempotent by exact-edge uniqueness, marker-ledgered, pausable by matrixAutoPropagate, and INERT in a single-chain workspace: a workspace that declares no additional line gains no edges and no decisions. A confidential source contributes a count and never an edge, because a second manager is not a wider audience for a sensitive people record. It never edits a reporting line, an allocation, a roster record or a decision right, never resolves which of two managers OWNS an item (it names both and the ledger prints the ambiguity), and never asserts that work moved.',
    writes: ['links', 'matrixMarkers'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: matrixCoordinationRule,
    module: 'matrixCoordinationRules.js',
    purpose: 'RULE-MCO-01 reads the SAME live matrix graph, allocation-completeness gate and reporting-line lifecycle event as RULE-MTX-01. When a line declaration, retune, end, convention change or explicit coordination scan leaves a manager span fragmented across the declared counterpart floor or incomplete because a line allocation cannot be read, it appends exactly ONE identity-free, marker-idempotent structural trace to the shared automation ledger for that topology on that day. It never opens a case, creates a delegation, selects a counterpart, changes a reporting line, fills a missing allocation or recommends a reorganisation. The topology itself remains a pure seat-scoped read and is inert in a single-chain workspace.',
    writes: ['matrixMarkers'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: sodRegisterRule,
    module: 'sodRegisterRules.js',
    purpose: 'RULE-SOD-01 records a segregation-of-duties REVIEW on the shared ledger. It runs on exactly one event — an explicit, human-requested review — and never when a decision is logged, decided or edited. It re-reads the Cross-Line Segregation-of-Duties Register (ADR-0170) on the whole workspace with the operator view: every decided decision whose Driver and Approver resolve to one roster person each, tested for one hand holding both roles, for an Approver who reported to the Driver on the decision day over the home chain or only through a declared second line (the same matrix graph RULE-MTX-01 fans work through, read as of that day), and for an Approver who owns a typed-linked case. It then appends exactly ONE identity-free, marker-idempotent trace carrying the counts — read, tested, conflicted, irreversible, by class, with no seat above the hand, unreadable and not testable — for that reading on that day. It opens no case, issues no delegation, edits no decision, revokes no right and names no person, decision or line.',
    writes: ['matrixMarkers'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: priorityArbitrationRule,
    module: 'priorityArbitrationRules.js',
    purpose: 'RULE-ARB-01: an AGREED cross-line precedence becomes owned work. One dated delegation per demand the agreement sequenced, addressed to the person whose capacity the case froze; one governed decision recording the precedence, its window, its review date and the arbiter\u2019s own reasoning; and typed provenance only (`concerns`, `decides`, `issues-obligation`, `rolls-up-to` per leadership ancestor in the matrix DAG). It never fires on a PROPOSAL, never issues work for a demand the agreement deferred, reshaped or released, never edits the case, and is idempotent through a per-agreement marker plus exact-edge deduplication. Inert unless an agreement exists.',
    writes: ['delegations', 'decisions', 'links', 'priorityArbitrationMarkers', 'priorityArbitrations'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: contradictionRule,
    module: 'contradictionRules.js',
    purpose: 'RULE-CNT-01: a recorded ruling on a cross-line contradiction becomes a governed record. Exactly ONE decision per ruling — the finding kind, its severity, the declared integers that produced it and the chief\u2019s own reasoning — and, ONLY when the verdict is a resequence, exactly one dated delegation to the single named line to revise its charter, plus typed provenance (`concerns`, `decides`, `issues-obligation`, `rolls-up-to` per leadership ancestor in the matrix DAG). It never fires on a declaration, never issues work for an acceptance or a withholding, never edits a charter, never rules on its own, refuses to act when the declarations have changed so the finding no longer reproduces (the ruling stands as history), and is idempotent through a per-review and a per-review-per-line marker plus exact-edge deduplication. Inert unless a ruling exists.',
    writes: ['contradictionMarkers', 'contradictionReviews', 'delegations', 'decisions', 'links'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: reviewStewardshipRule,
    module: 'reviewStewardshipRules.js',
    purpose: 'RULE-SRV-01: a COMPLETED review in a matrix is reconciled against the lines the person actually sat on. One owned, dated delegation per line the packet never consulted, addressed to the manager who holds that line, pointing at the review rather than copying its content; typed provenance only (`concerns` to every period line, `issues-obligation` from the review to the task, `rolls-up-to` per leadership ancestor in the matrix DAG). It never fires on a declaration, never issues work when the assessor is contested or undeclared (a task addressed to nobody could never close), never assesses anybody, never edits a rating, never marks a line answered, and is idempotent through a per-review-per-line marker plus exact-edge deduplication, bounded by a per-transaction cap whose remainder is counted and retried by an explicit scan. Inert in a single-chain workspace.',
    writes: ['delegations', 'links', 'reviewStewardshipMarkers', 'reviews'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: lineConsentRule,
    module: 'lineConsentRules.js',
    purpose: 'RULE-LCN-01: a DECLARED reporting line is an ask until two humans answer it. One owned, dated delegation is issued to the manager the line was given to (accept or decline the share, with a stated window), and one to the PERSON once an acceptance has stood past its window unacknowledged — because a manager accepting a share of somebody else\u2019s hours is not the person being told. Typed provenance only (`concerns` from the person to the manager, `issues-obligation` from the person to the task, `rolls-up-to` per leadership ancestor in the matrix DAG). It fires on a declaration, a retune or an explicit scan — never on an acceptance, which is an answer and not a reason to ask again. It never accepts, declines, acknowledges, edits a share or ends a declaration on anybody\u2019s behalf; it is idempotent through a per-line marker plus exact-edge deduplication, bounded by a per-transaction cap whose remainder is counted and retried, and inert in a single-chain workspace.',
    writes: ['delegations', 'links', 'lineConsentMarkers'],
    emits: [],
    scansWorkspace: true,
  },

  {
    rule: lineReaffirmationRule,
    module: 'lineReaffirmationRules.js',
    purpose: 'RULE-LRF-01: a declared line has a TERM, and both sides answer inside it. A line nobody ever termed, a term that ran out and a term inside its declared warning window each put ONE owned, dated delegation in front of the manager who HOLDS the line (re-affirm it for a stated term, or release it with a reason); a manager re-affirmation the PERSON has not answered puts one in front of the PERSON; a person OBJECTION is escalated to the person\u2019s HOME line, because ending somebody else\u2019s accountability is not the informed party\u2019s act; and a RELEASED line still charging a share puts one in front of the manager to date the declaration out with the governed End action. Typed provenance only (`concerns` from the person to the manager, `issues-obligation` from the person to the task, `rolls-up-to` per leadership ancestor in the matrix DAG). It fires on a declaration, a retune, any answer or an explicit scan \u2014 never on a read. It never re-affirms, releases, accepts, objects, edits a share or ends a declaration on anybody\u2019s behalf; it is idempotent through a per-line marker plus exact-edge deduplication, bounded by a per-transaction cap whose remainder is counted and retried, and inert in a single-chain workspace.',
    writes: ['delegations', 'links', 'lineReaffirmationMarkers'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: structureHistoryRule,
    module: 'structureHistoryRules.js',
    purpose: 'RULE-SHR-01: a stored act that names a manager is reconciled against the structure of the ACT\u2019S OWN DAY. When a home line moves, every stored act about that person that no longer reads against the structure its day recorded is reported, and ONE owned, dated delegation is issued to the manager who now holds the person\u2019s home line, naming the affected records. Typed provenance only (`issues-obligation` from the person to the task, `rolls-up-to` per leadership ancestor). It fires on a home-line move, a committed-design import and an explicit scan — never on a read. It NEVER edits, re-points, migrates or withdraws a stored act, because rewriting a historical record to match today\u2019s roster is precisely the drift this reconciliation surfaces; it issues NOTHING when nothing drifts; it is idempotent through a per-person-per-drift-set marker plus exact-edge deduplication, bounded by a per-transaction cap whose remainder is counted and retried, and inert in a workspace with no recorded structure history.',
    writes: ['delegations', 'links', 'structureHistoryMarkers'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: onboardingMatrixRule,
    module: 'onboardingMatrixRules.js',
    purpose: 'RULE-ONB-01: onboarding a person into a matrix is reconciled against the lines they actually landed on. One owned, dated delegation per line that has written no brief, addressed to the manager who HOLDS that line, naming the person, the window and a due date that is the plan\u2019s own deadline when it is still ahead and a fresh window when it has passed; plus one dated acknowledgement ask to the PERSON for every brief that stands unacknowledged \u2014 because an expectation set by one party is not an agreement between two. Typed provenance only (`concerns` from the person to each line\u2019s manager, `issues-obligation` from the person to the task, `rolls-up-to` per leadership ancestor in the matrix DAG). It fires on a created or updated plan, on a declared second line and on an explicit scan \u2014 never on a read and never on an acknowledgement. It issues NOTHING for two concurrent plans (which plan owns the onboarding is a declaration only a leader can settle) and NOTHING for a presumed home line (a presumption is printed, not chased); it never writes a brief, never acknowledges one, never invents a plan and never rates the person. Idempotent through a per-obligation marker (keyed on the BRIEF for acknowledgements, so a re-brief re-asks), bounded by a per-transaction cap whose remainder is counted and retried, and inert in a single-chain workspace.',
    writes: ['delegations', 'links', 'onboardingLineBriefMarkers'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: lineExitRule,
    module: 'lineExitRules.js',
    purpose: 'RULE-LEX-01: a reporting line that has been DATED OUT is reconciled against the obligations it left open. For every ended line that still carries an open obligation (an unacknowledged line onboarding brief, an unanswered review input ask), ONE owned, dated settlement ask is issued to the manager who HELD that line, naming the obligations, the day the line ended and the declared settlement window. Typed provenance only (`concerns` from the person to the manager, `issues-obligation` from the person to the task, `rolls-up-to` per leadership ancestor in the matrix DAG). It fires on a line being dated out, on a completed review and on an explicit scan — never on a read. It issues NOTHING for a line key that resolves to no declaration (a task addressed to nobody could never close) and NOTHING for a manager no longer on the roster (an invented heir is the reassignment the module refuses); it never retires an obligation, never carries one, never edits an ask and never rates a person. Idempotent through a marker keyed on the LINE plus the exact open-obligation set, so a settled obligation is not re-chased and a newly opened one on the same line is; bounded by a per-transaction cap whose remainder is counted and retried, and inert in a single-chain workspace.',
    writes: ['delegations', 'links', 'lineExitMarkers'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: authorityContinuityRule,
    module: 'authorityContinuityRules.js',
    purpose: 'RULE-ACR-01: drifted frozen decisions (`merit-cycle`, `decision`, `board-memo`) whose settlement is `unsettled` or `stale` are reconciled against today\u2019s live matrix authority. Issues ONE owned, dated delegation to the unique current right holder or unique `matrixJointApex` principal above contesting/multi-principal holders (refusing to guess on diamond ties or unowned rights), closes superseded tasks once settled, and writes typed provenance only (`issues-obligation`, `rolls-up-to` per leadership ancestor in the matrix DAG). Never edits a frozen decision record; idempotent via `authorityReaffirmationMarkers`; bounded by a per-commit cap; inert on automatic commits in single-chain workspaces.',
    writes: ['delegations', 'links', 'authorityReaffirmationMarkers'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: meritEvidenceRule,
    module: 'meritEvidenceRules.js',
    purpose: 'RULE-MEV-01: a pay decision\u2019s evidence base is joined to the review it reads. For a decision whose review had a second line in force that was never asked, never answered in its window, or had a contested or unowned assessor, it issues ONE owned, dated delegation \u2014 \u201cobtain the missing line input\u201d before finalisation, \u201crecord the correction path\u201d after it, because a frozen decision cannot be re-opened and one word for both would be the collapse this workspace refuses. Typed provenance only (`issues-obligation` from the review to the task, `rolls-up-to` per leadership ancestor in the matrix DAG). Contested, unowned or unreadable assessors issue NOTHING and are counted, because an ask addressed to nobody can never close. It never reopens a review, edits a rating, re-runs a merit decision, changes a pay figure or marks a line asked; it is idempotent through a per-cycle-per-decision marker, bounded by a per-transaction cap whose remainder is counted and retried by the scan, and inert on every other event and in a single-chain workspace.',
    writes: ['delegations', 'links', 'meritEvidenceMarkers'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: benchEvidenceRule,
    module: 'benchEvidenceRules.js',
    purpose: 'RULE-BNE-01: a current bench claim (a succession readiness reading) is joined to the review its evidence window reads and to the per-line states ADR-0147 already stores. For a claim whose review had a second line in force that was never asked, was asked and went silent, or had a contested or unowned assessor, it issues ONE owned, dated delegation to the manager who held the person\u2019s HOME line as of the evidence window \u2014 \u201cobtain the missing observation\u201d, or \u201cobtain the outstanding line answer\u201d where the line\u2019s own window is still open. Typed provenance only (`concerns` from the person to the ask, `issues-obligation` from the review to the ask, `rolls-up-to` per leadership ancestor in the matrix DAG). Contested, unowned or unreadable assessors and claims with no readable as-of home line issue NOTHING and are counted, because an ask addressed to nobody can never close. It never edits a readiness rating, a review, a line or a succession reading; it is idempotent through a per-claim-per-state marker, bounded by a per-transaction cap whose remainder is counted and retried by the scan, and inert on every other event and in a single-chain workspace.',
    writes: ['delegations', 'links', 'benchEvidenceMarkers'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: benchRegressionRule,
    module: 'benchRegressionRules.js',
    purpose: 'RULE-BRG-01: a bench claim\u2019s consecutive review windows are compared \u2014 the previous window\u2019s FROZEN reading against the later window read LIVE, under a rating gate (the frozen rating against the current one). On `review.completed` and on scan it freezes one dated reading per watched claim per completed review (never rewritten), and for a LATEST pair reading `regressed` it issues ONE owned, dated delegation \u2014 \u201cre-ground this bench claim\u201d, with both windows, both states and the unchanged rating printed \u2014 to the manager holding the home line as of the later window\u2019s end. Typed provenance only (`concerns` from the person to the ask, `issues-obligation` from the later review to the ask, `rolls-up-to` per leadership ancestor in the matrix DAG). Older pairs, open questions, contested or unowned assessors, single-line pairs and unreadable windows issue NOTHING and are counted; a claim with no readable home line is NOTED under a key that never blocks the ask, so the scan issues it when the seat appears. It never edits a rating, a review, a line or a frozen reading; it is idempotent through a per-pair marker carrying the pair snapshot, bounded by per-transaction caps whose remainder is counted and retried by the scan, and inert on every other event. In a single-chain workspace it freezes history and issues no ask.',
    writes: ['delegations', 'links', 'benchRegressionReadings', 'benchRegressionMarkers'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: matrixInterfaceRule,
    module: 'matrixInterfaceRules.js',
    purpose: 'RULE-MIA-01: reads every active deduplicated unordered manager pair across multi-line people against bilateral management-interface operating agreements (`matrixInterfaceAgreements`), live `matrixJointApex` escalation topology, and active `cadenceForums`. Closes prior review asks once a pair reaches `current` (or disappears / loses its unique apex), issues at most ONE bounded dated review delegation per uncovered pair to its unique `matrixJointApex` principal with typed provenance (`issues-obligation`, `rolls-up-to` per leadership ancestor), and refuses to guess a review owner on diamond ties or disconnected pairs. Never invents an agreement, edits a reporting line, or modifies terms; idempotent via `matrixInterfaceMarkers`; bounded per commit; inert on automatic triggers in single-chain workspaces.',
    writes: ['delegations', 'links', 'matrixInterfaceMarkers'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: doaScheduleRule,
    module: 'doaScheduleRules.js',
    purpose: 'RULE-DOA-01: evaluates spending mandates, committed/spent budget lines and priced decided decisions against dated integer-cent standing Delegation-of-Authority limits (`doaSchedule`) across the canonical single-chain or matrix DAG (`buildMatrix` / `buildMatrixAsOf`), including grantor nemo-dat, cross-line anti-splitting (`second-line-limit`), and one-over-one covering escalation. Closes prior open ratification asks once resolved or superseded, issues at most ONE bounded dated ratification delegation per open breach to the unique covering senior seat or unique `matrixJointApex` principal with typed provenance (`issues-obligation`, `rolls-up-to` per leadership ancestor), and abstains cleanly on diamond ties, above-apex breaches or unreadable as-of graphs. Never blocks, revokes or mutates an underlying commitment; idempotent via `doaMarkers`; fast-exits in O(1) when no standing schedule is declared.',
    writes: ['delegations', 'links', 'doaMarkers'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: oneOnOneLineRule,
    module: 'oneOnOneLineRules.js',
    purpose: 'RULE-OOL-01: reads the Matrix 1:1 Line Coverage board (`buildOneOnOneLines`) on meeting, reporting-line, roster, and convention commits plus explicit `oneonone.line.scan` scans. Closes prior open cadence asks when a line settles/exempts/disappears or becomes unproven/off-roster, issues at most ONE bounded dated ask per proven silent on-roster pair per commit (capped at 8) with typed provenance (`concerns`, `issues-obligation`, `rolls-up-to` per leadership ancestor in the matrix DAG), records bounded observation markers for unproven/off-roster/unattributed lines without opening blame tasks, never creates meetings or edits attribution, is marker-idempotent, pausable via `oneOnOneLineAutoPropagate` (explicit scan always runs), and is strictly inert in single-chain workspaces.',
    writes: ['delegations', 'links', 'oneOnOneLineMarkers'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: hiringLineRule,
    module: 'hiringLineRules.js',
    purpose: 'RULE-HLC-01: reads the Cross-Line Selection Corroboration register (`buildHiringLines`, ADR-0176) with the whole-workspace operator view on line-plan acts, candidate evidence / stage / decision events, requisition updates and explicit `hiring.line.scan` scans. For every decision-stage candidate on an in-flight requisition whose DECLARED line plan names a manager that is on the panel but silent, or was never asked, it issues at most ONE dated delegation per (candidate, manager, plan act) to that named manager, with typed `concerns` (requisition), `issues-obligation` (candidate) and `rolls-up-to` (every roster ancestor of the manager in the matrix DAG) provenance, bounded per commit with the remainder counted. It closes its own asks once the line is heard or represented, the candidate leaves the final/offer stage, the plan is re-declared or withdrawn, or the requisition stops being in flight, and records an observation — never a task — for a declared manager who left the roster. It never blocks an offer, moves a candidate, records evidence, edits a plan or substitutes one manager for another, and it is inert until a line plan exists.',
    writes: ['delegations', 'links', 'hiringLineMarkers'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: delegationLineRule,
    module: 'delegationLineRules.js',
    purpose: 'RULE-DLA-01 derives cross-line ask attribution and shared-contributor overload from append-only acts and the canonical matrix graph; it issues one bounded reconciliation ask to the unique joint apex, closes it when resolved, and never guesses a line, share, or owner.',
    writes: ['delegations', 'links', 'delegationLineMarkers'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: transferPriceRule,
    module: 'transferPriceRules.js',
    purpose: 'RULE-TPL-01: reads the Cross-Line Labour Chargeback & Internal Transfer-Price Ledger (`buildTransferPriceLedger`, ADR-0177) with the whole-workspace operator view over the LAST COMPLETED CALENDAR QUARTER on transfer-price acts (propose / confirm / retire) and explicit `transfer.price.scan` scans. For every price proposal still holding ONE key it issues at most one dated delegation to the NAMED manager who holds the missing key; for every directed pair of lines that consumed share-days in the closed quarter with no agreed price and no proposal covering them it keeps at most one open dated delegation per (pair, quarter) with the BORROWING manager, and issues one more only after a price between that pair has died (declined, withdrawn or voided). Asks carry typed `issues-obligation` (counterpart manager) and matrix-DAG `rolls-up-to` provenance, are idempotent through `transferPriceMarkers`, bounded at 8 per commit with the remainder counted, and close themselves — with the actual reason written on the task — once the key is turned, the proposal is declined or withdrawn, or every share-day of that pair’s quarter is under a proposed or agreed price; an ask about an older quarter is re-read against its own quarter, so the calendar rolling over closes nothing. A key held by the workspace leader or by a manager who left the roster is recorded as an observation, never reassigned. Inert until the first price act exists; pausable via `transferPriceAutoPropagate`. Never signs a key, posts a charge, edits a budget, a reporting line or an agreement.',
    writes: ['delegations', 'links', 'transferPriceMarkers'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: chargebackPostingRule,
    module: 'chargebackPostingRules.js',
    purpose: 'RULE-CBP-01: reads the whole-workspace chargeback statement (`buildTransferPriceLedger`, ADR-0177) and the posting ledger (ADR-0194) over the LAST COMPLETED CALENDAR QUARTER, on transfer-price keys turning or dying (confirm / retire), posting acts (post / reverse) and explicit `chargeback.posting.scan` scans. For each currency whose quarter statement holds EVERY claim (complete, zero-sum, reconciled partition, period-ledger identity, exact arithmetic), carries a charged cent and has no live posting, it keeps at most one open dated delegation per (quarter, currency) per posting generation with the LOWEST JOINT APEX of every line account the statement names — the one seat both sides of every internal charge roll up to; a reversal opens a new generation. An ambiguous apex, the workspace leader, or an apex off the roster records an identity-free observation through `chargebackPostingMarkers`; nobody is substituted. Asks carry matrix-DAG `rolls-up-to` provenance, are idempotent per subject, bounded at 4 per commit with the remainder counted, and close themselves with the actual reason written on the task — the quarter was posted; its statement regressed (the missing prices are RULE-TPL-01’s asks, not this rule’s); the currency no longer carries a charge; or the apex seat moved. An ask about an older quarter is re-read against its own quarter, bounded per commit, so the calendar rolling over closes nothing. Inert in O(1) until the first transfer-price act exists; pausable via `chargebackPostingAutoPropagate` (an explicit scan still runs). It never posts, never reverses, never binds an envelope, never signs a key, never writes a budget line and never blocks a human decision.',
    writes: ['delegations', 'links', 'chargebackPostingMarkers'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: workTurnRule,
    module: 'workTurnRules.js',
    purpose: 'RULE-NPW-01: reads the Non-Promotable Work Turn Ledger (`buildWorkTurns`, ADR-0181) with the whole-workspace operator view on classification acts, convention changes, explicit `work.turn.scan` scans, ask attribution / edit / hand-back, reporting-line acts and roster changes (a person updated, archived or restored). For a manager pool that concentrates its non-promotable asks on one person it keeps at most one open dated delegation with THAT manager; for a person on two or more lines who is within a fair turn on each line and over the per-person average in sum it keeps at most one with the single roster seat above every line they hold (the joint apex). It asks at most once per finding signature, closes its own ask when the reading clears, is capped at 8 asks per commit with the remainder counted, and records an observation instead of an ask when the owner is the workspace leader, off the roster or tied between incomparable seats. It corrects the old unconditional next-turn sentence on its open asks at the next triggering event, preserving other text. It never classifies or reassigns an ask, never stores a turn, share or verdict, never rates a person, and is INERT until the first classification act exists.',
    writes: ['delegations', 'links', 'workTurnMarkers'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: pausePermitRule,
    module: 'pausePermitRules.js',
    purpose: 'RULE-PMP-01: reads the Automation Pause Permit Register (`buildPausePermits`, ADR-0182) with the whole-workspace operator view on settings writes, permit grant / revoke, convention changes, explicit `automation.pause.scan` scans, reporting-line acts and roster changes. For every declared automatic switch that is OFF with no permit in force — whether the permit ran out (`expired`) or none was ever recorded (`unpermitted`) — and whose off-period has stood past the declared grace, it keeps at most ONE open dated delegation with the single seat that can authorise a workspace-wide pause (the joint apex of the reporting graph), naming the consequence and the two ways to resolve it. Asks carry matrix-DAG `rolls-up-to` provenance, are idempotent per pause signature, bounded at 6 per commit with the remainder counted, and close themselves when the pause is permitted or the switch comes back on. A pause whose authorising seat is the workspace leader, off the roster or tied between incomparable seats is recorded as an observation; nobody is substituted. It never flips a switch, never writes or revokes a permit, never rates a person and never judges why somebody paused; pausable via `pausePermitAutoPropagate`; INERT while every switch is on and no permit exists.',
    writes: ['delegations', 'links', 'pausePermitMarkers'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: workforceFlowRule,
    module: 'workforceFlowRules.js',
    purpose: 'RULE-WFS-01: reads the Workforce Stock-Flow (Markov manpower) Plan (`buildWorkforceFlow`, ADR-0184) with the whole-workspace operator view on recorded moves, withdrawn moves, declared or retired intended shapes, convention changes, explicit `workforce.flow.scan` scans and every roster or departure act. It raises at most ONE open dated ask per finding, bounded at 4 per commit with the remainder counted: (a) `history-missing` — a roster at or above the declared minimum with NO move ever recorded, so every projection is refused for want of a history the record never held; (b) `target-missing` — a projection that is printable while no intended shape has been declared, so the comparison claim is refused rather than made against the projection itself; (c) `exposure-thin` — a level whose moves exist but whose exposure sits below the declared floor, so its headcount is carried forward unchanged and the row says so. Asks name the single seat above every reporting line (the joint apex), carry matrix-DAG `rolls-up-to` provenance and `issues-obligation` to the owner, are idempotent per finding signature, and close themselves when the finding clears. A leader-held, off-roster or tied apex is observed once and nobody is substituted. It never writes a move, a target or a rate, never fills a thin cell with a borrowed rate, asks about the RECORD and the declared SHAPE rather than any person, and is inert with nobody on the roster; pausable via `workforceFlowAutoPropagate`.',
    writes: ['delegations', 'links', 'workforceFlowMarkers'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: changeSaturationRule,
    module: 'changeSaturationRules.js',
    purpose: 'RULE-CSA-01: reads the Cross-Line Change Saturation & Absorptive-Capacity Ledger (`buildChangeSaturation`, ADR-0186) with the whole-workspace operator view on declared demands, withdrawals, declared or retired ceilings, convention changes, explicit `change.saturation.scan` scans, change-record writes and every reporting-line or roster act. It raises at most ONE open dated ask per finding, bounded at 4 per commit with the remainder counted: (a) `saturation-over` — people carrying more concurrent change weight on at least one day than their own declared ceiling allows, or lines whose declarations of one impact disagree; (b) `ceilings-missing` — demands are charged against people and no capacity ceiling is in force for anybody, so the register cannot make a saturation claim in principle; (c) `demand-unattributable` — a stored demand whose declaring line is no longer an active line of that person, so the burden is in the ledger and no pool owns it; (d) `ceilings-expired` — a ceiling window has passed while demands are still being charged, and an expired limit is not a limit that was met. Asks name the single seat above every reporting line of the affected people (the joint apex), carry matrix-DAG `rolls-up-to` provenance and `issues-obligation` to the owner, are idempotent per finding, and close themselves when the finding clears. A leader-held, off-roster or tied apex is observed once and nobody is substituted. It never declares a demand or a ceiling, never defers or blocks a change, never infers a capacity from level, pay or meeting load, asks about the RECORD and the declared LIMIT rather than any person’s stamina, and is inert with nobody on the roster; pausable via `changeSaturationAutoPropagate`.',
    writes: ['delegations', 'links', 'changeSaturationMarkers'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: lineHorizonRule,
    module: 'lineHorizonRules.js',
    purpose: 'RULE-LHZ-01: reads the Matrix Forward Allocation Horizon (`buildLineHorizon`, ADR-0179) on every reporting-line act, convention change and roster change, on explicit `matrix.horizon.scan` / `matrix.scan` scans, and on any other operational write while a declared line boundary sits inside the lead window (`matrixExpiringDays`) or one of its own asks is open. For each exposure that begins inside that window it issues at most ONE dated ask per commit (capped at 8, remainder counted) to the ONE roster seat that owns the fix — the lowest seat above every line in force for an over-booking, above the lines with no declared share for an unknown split, or the home-line manager for an unallocated remainder — with typed `issues-obligation` (the person) and matrix-DAG `rolls-up-to` (every roster ancestor of the owner) provenance. A leader-held, tied or off-roster owner is observed in one identity-free `matrixMarkers` entry and nobody is substituted. It closes its own ask — with the reason written on the task — when the ledger no longer reads the exposure or the owning seat changed, never because the day arrived, and never re-asks an exposure a person answered while it stands. It never edits a line, a share, a date or a roster record; pausable via `matrixAutoPropagate` (an explicit scan always runs); strictly inert in single-chain workspaces.',
    writes: ['delegations', 'links', 'matrixMarkers'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: dependencyCycleRule,
    module: 'dependencyCycleRules.js',
    purpose: 'RULE-CYC-01: reads the Cross-Boundary & Single-Line Dependency Feedback-Cycle Register (`buildDependencyCycles`, ADR-0183 / ADR-0187) with the whole-workspace operator view on declared-link writes, operational work-record writes, reporting-line and roster changes, convention changes and explicit `matrix.cycles.scan` / `matrix.scan` scans. For every coupled feedback block (`feedback-cycle`) whose line reach resolves to ONE active roster seat — the sole line manager for a `single-line` loop (serving both single-chain and matrix workspaces) or the unique `matrixJointApex` for a `cross-line` loop — it keeps at most ONE open dated sequencing ask (bounded at 6 per commit, remainder counted) carrying the exact counterfactual single-arc tear census without ever tearing an edge or choosing which commitment yields, linked by `issues-obligation` and fanned up the matrix DAG via `rolls-up-to`. Leader-held, ambiguous-apex, unattributed or off-roster blocks record one identity-free `matrixMarkers` observation (`kind: \'dependency-cycle\'`) and substitute nobody. It closes its own asks when the cycle clears or its owning seat moves, never re-asks a cycle a human closed while it stands, is fast-exit O(|links|) when no precedence arc or cycle obligation exists, and is pausable via `dependencyCycleAutoPropagate` (an explicit scan always runs).',
    writes: ['delegations', 'links', 'matrixMarkers'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: aarCorroborationRule,
    module: 'aarCorroborationRules.js',
    purpose: 'RULE-AAC-01: reads the Cross-Line After-Action Corroboration & Lesson-Adoption Parity register (`buildAarCorroborationReport`, ADR-0188) with the whole-workspace operator view on corroboration requests, first-person answers, per-line adoption acts, convention changes, explicit `learning.aar.corroboration.scan` scans, and every review, roster or reporting-line act that can move a held review\'s participant line set. It raises at most ONE open dated ask per condition, bounded at 8 per commit with the remainder printed in a marker: (a) `corroboration-overdue` — a dated request to a line holder passed its due date with no first-person answer, because silence is never corroboration; (b) `lesson-parity` — a lesson\'s adoption parity is `parity-broken` (a touched line recorded a reasoned refusal) or `parity-open` past the declared `aarCorroborationAdoptWarnDays` window. Asks name the joint apex (`matrixJointApex`) of the line holders who owe the answer or the adoption — never the affected person, who cannot rule on their own review, and never one holder alone, who cannot rule on a peer — carry typed `tracks-followup` to the lesson and `escalates-from` to the apex, are idempotent per deterministic condition signature, and close themselves when the condition clears. An ambiguous, disconnected, unattributed or self-addressed apex records ONE identity-free `matrixMarkers` observation (`kind: \'aar-corroboration\'`) and nobody is substituted. It never edits a review, an answer, an adoption or a lesson state, never reads silence as agreement, and is inert with nobody on the roster; pausable via `aarCorroborationAutoPropagate` (an explicit scan always runs).',
    writes: ['delegations', 'links', 'matrixMarkers'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: interfaceAlignmentRule,
    module: 'interfaceAlignmentRules.js',
    purpose: 'RULE-OIA-01: reads the Product–Organisation Interface Alignment Matrix (`buildInterfaceAlignment`, ADR-0189) with the whole-workspace operator view on declared-link writes, operational work-record writes, reporting-line and roster changes, interface-agreement and cadence-forum acts, convention changes and explicit `matrix.alignment.scan` / `matrix.scan` scans. For every pair finding whose `matrixJointApex` resolves to ONE active roster seat it keeps at most ONE open dated ask (bounded at 6 per commit, remainder counted): (a) `interface-unattended` — declared work depends across two spans whose holders hold no live coordination channel (printed as `unattended-interface` or `channel-not-live`, never collapsed) — asking the apex to open or renew an interface agreement or shared cadence forum, or record why the dependency stands without one; (b) `agreement-idle` — an ACTIVE interface agreement whose two spans carry zero live shared people and zero in-window cross-span dependency — asking the apex to retire it or record what it stands ready for. Asks carry typed `issues-obligation` and matrix-DAG `rolls-up-to` provenance, are idempotent per deterministic finding signature (`ifa1:…`), and close themselves when the finding clears or its owning seat moves. A leader-held, ambiguous-apex, unattributed or off-roster finding records ONE identity-free `matrixMarkers` observation (`kind: \'interface-alignment\'`) and substitutes nobody. It never opens a channel, never signs or retires an agreement, never edits a dependency, never rates a manager, and is inert with nobody on the roster; pausable via `interfaceAlignmentAutoPropagate` (the pause governs EVERY path, including explicit scans).',
    writes: ['delegations', 'links', 'matrixMarkers'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: standardWorkRule,
    module: 'standardWorkRules.js',
    purpose: 'RULE-LSW-01: reads Leader Standard Work & Tiered Daily Management (`buildStandardWork`, ADR-0190) with the whole-workspace view on every operational write. A routine whose most recent closed slots — at least the declared lapse run — hold no completed check becomes ONE dated go-and-see ask to the manager of the line the routine is owed under; an abnormality escalated to a leader becomes ONE dated ask in that leader’s queue, due at the end of the declared tier window. Asks are idempotent per condition signature, carry matrix-DAG `rolls-up-to` provenance, close themselves when the condition clears or its seat moves, and are bounded per commit. Where the owner holds several lines and named none, the named line ended, the holder left the roster or the next tier is the workspace leader, it records an identity-free `matrixMarkers` observation and asks nobody. It never records a check, never acts for a tier and never rates a leader.',
    writes: ['delegations', 'links', 'matrixMarkers'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: priorityRule,
    module: 'priorityRankingRules.js',
    purpose: 'RULE-SOC-01: reads the Cross-Line Priority Ballot & Social-Choice Aggregation register (`buildPriorityRanking`, ADR-0191) with the whole-workspace view on round, ballot and withdrawal writes, reporting-line and roster changes, convention changes and explicit `priority.scan` / `matrix.scan` scans. It files at most ONE open dated ask per condition (bounded at 6 per commit, remainder counted): (a) `overdue-ballot` — a frozen line holder has not cast a ballot by the round deadline — addressed to THAT frozen holder only (never to a later holder of the same line and never to the person being ranked); (b) `cycle` — the cast ballots hold a majority cycle, so no Condorcet winner exists — addressed to the LOWEST joint apex of the lines that were asked, naming the Schwartz top cycle and the beatpath completion. Asks carry typed `issues-obligation` and matrix-DAG `rolls-up-to` provenance, are idempotent per deterministic condition signature (`soc1:…`), and close themselves when the condition clears or its seat moves. An ambiguous-apex, leader-held or off-roster condition records ONE identity-free `matrixMarkers` observation (`kind: \'priority-ballot\'`) and substitutes nobody. It never casts a ballot, never edits a ranking, never withdraws a round, never breaks a cycle silently and never rates a person; pausable via `priorityBallotAutoPropagate` (the pause governs EVERY path, including explicit scans).',
    writes: ['delegations', 'links', 'matrixMarkers'],
    emits: [],
    scansWorkspace: true,
  },
  {
    rule: goalCommitmentRule,
    module: 'goalCommitmentRules.js',
    purpose: "RULE-GCC-01: reads the Cross-Line Goal Commitment Conflict register ('buildGoalCommitments', ADR-0193 + ADR-0195) with the whole-workspace view on commitment declaration, re-baseline and release writes, goal writes, reporting-line and roster changes, convention changes and explicit `goalCommitment.scan` / `matrix.scan` scans. It files at most ONE open dated ask per condition (bounded at 6 per commit, remainder counted), partitioned so one fact files exactly one ask: (a) `target-conflict` — two lines committed the same person over at least the declared minimum of overlapping days and named the SAME measure in OPPOSITE directions — addressed to the LOWEST joint apex of the two holders, because neither promise can be kept by working harder; (b) `magnitude-conflict` — two lines named the SAME measure in the SAME direction over the same days, with the SAME declared unit, but their exact target-magnitude divergence meets the declared floor — addressed to that same joint apex; missing magnitudes and mismatched units are printed refusals, never inferred, converted or routed; (c) `capacity-overcommit` — on the exact peak day inside the declared horizon the live commitments this person carries add up to more than one whole person — with named peak declarations only, addressed to the lowest joint apex of EVERY holder carrying a commitment on that day; an explicit `no-line` contribution remains in the capacity arithmetic but records an identity-free unattributed observation rather than routing a partial named-holder set; (d) `line-share-exceeded` — one named line's own commitments peak above that line's OWN declared share while the person's whole week still fits — addressed to THAT line's holder and never escalated above them, and filed only where (c) did not fire so the same week is never double-asked. A bare window collision is printed on the panel and never escalated. Asks carry typed `issues-obligation` and matrix-DAG `rolls-up-to` provenance, are idempotent per deterministic condition signature ('gcc1:…'), and close themselves when the condition clears or its seat moves. An ambiguous-apex, leader-held, off-roster or explicit-`no-line`/unattributed condition records ONE identity-free `goalCommitmentMarkers` observation (kind: 'goal-commitment') and substitutes nobody. It never edits a commitment, narrows a window, re-points a goal, releases a promise, infers a measure, target magnitude, target unit or conversion from a goal's text or key results, or rates a person; pausable via `goalCommitmentAutoPropagate` (the pause governs EVERY path, including explicit scans).",
    writes: ['delegations', 'links', 'goalCommitmentMarkers'],
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
