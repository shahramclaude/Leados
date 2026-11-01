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
import { warGameRule } from './warGameRules.js';
import { parityRule } from './parityRules.js';

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
