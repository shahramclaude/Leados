/**
 * Historical trigger catalog, retained for inspection only. It is incomplete:
 * cross-domain and custom rules cannot safely be excluded from a known prefix.
 * The post-commit spine does not use this catalog to filter deliveries. A
 * future index needs an enforceable trigger contract and equivalence tests.
 */

export const RULE_TRIGGER_PREFIXES = Object.freeze({
  // Core operational cases
  'case.': ['caseCreatedRule', 'forecastIntegrityRule', 'resilienceRule', 'decisionTempoRule', 'retentionRule', 'powerRule', 'networkRule', 'impactRule', 'commsRule', 'allocationRule', 'loadRule', 'premiseRule', 'dynamicsRule', 'attentionMarketRule'],
  'delegation.': ['retentionRule', 'resilienceRule', 'impactRule', 'allocationRule', 'loadRule', 'decisionTempoRule'],
  'decision.': ['resilienceRule', 'decisionTempoRule', 'powerRule', 'impactRule', 'diligenceRule'],
  'goal.': ['resilienceRule', 'fidelityRule'],
  'oneonone.': ['retentionRule', 'resilienceRule'],
  'feedback.': ['retentionRule', 'resilienceRule'],
  'pulse.': ['retentionRule'],
  'person.': ['retentionRule', 'resilienceRule', 'matrixRule', 'powerRule'],
  // Finance / capacity
  'portfolio.': ['allocationRule', 'loadRule', 'capacity'],
  'budget.': ['allocationRule'],
  'hiring.': ['hiringRule'],
  // Matrix family — high churn, indexed explicitly
  'matrix.': ['matrixRule', 'matrixCoordinationRule', 'priorityArbitrationRule', 'contradictionRule', 'lineConsentRule', 'lineReaffirmationRule', 'lineExitRule', 'structureHistoryRule', 'onboardingMatrixRule', 'authorityContinuityRule', 'matrixInterfaceRule', 'reviewStewardshipRule', 'sodRegisterRule', 'delegationLineRule', 'workTurnRule', 'oneOnOneLineRule', 'hiringLineRule', 'transferPriceRule', 'chargebackPostingRule'],
  'reportingline.': ['matrixRule', 'matrixCoordinationRule', 'structureHistoryRule'],
  'orgdesign.': ['orgDesignRule', 'freezeLineRule', 'spanCalibrationRule', 'federationRule'],
  // Attestation / sealing (run last, rare)
  'seal.': ['sealRule'],
  'attest.': ['attestRule'],
  // Disclosure / board
  'disclosure.': ['disclosureRule'],
  'board.': ['boardRule'],
  'envoy.': ['envoyRule'],
  // Catchball / cadence
  'catchball.': ['catchballRule'],
  'cadence.': ['cadenceRule'],
  'strategy.': ['strategyRule', 'strategyCycleRule'],
  'carryover.': ['carryoverRule'],
  'valueStream.': ['valueStreamRule'],
  // Escalation
  'escalation.': ['escalationRule'],
  'concordance.': ['concordanceRule'],
  'operatingModel.': ['operatingModelRule'],
  // Epistemic / diligence
  'epistemic.': ['epistemicRule'],
  'diligence.': ['diligenceRule'],
  'hindsight.': ['hindsightRule'],
  'reputation.': ['reputationalCapitalRule'],
  // VOI family
  'voi.': ['valueOfInformationRule', 'sequentialInvestigationRule', 'decisionPortfolioRule', 'leaderCalibrationRule'],
  'inquiry.': ['sequentialInvestigationRule', 'valueOfInformationRule'],
  // Other terminals
  'prospective.': ['prospectiveRule'],
  'robustAllocation.': ['robustAllocationRule'],
  'clearing.': ['clearingRule'],
  'performance.': ['performanceRule'],
  'survival.': ['survivalRule'],
  'waitCost.': ['waitCostRule'],
  'evidence.': ['evidenceRule'],
  'consequence.': ['consequenceRule'],
  'deferral.': ['deferralRule', 'deferralPortfolioRule'],
  'integrity.': ['integrityRule'],
  'credibility.': ['credibilityRule'],
  'confidence.': ['confidenceRule'],
  'settlement.': ['settlementRule', 'outcomeRule'],
  'counterfactual.': ['counterfactualRule'],
  'reliability.': ['reliabilityRule'],
  'couplingLedger.': ['couplingLedgerRule'],
  'supply.': ['supplyRule'],
  'solvency.': ['solvencyRule'],
  'sceptic.': ['scepticRule'],
  'chain.': ['chainRule'],
  'wargame.': ['warGameRule'],
  'parity.': ['parityRule'],
  'coupling.': ['couplingRule'],
  'signalPath.': ['signalPathRule'],
  'autopilot.': ['autopilotRule'],
  'actionBundle.': ['actionBundleRule'],
  'execution.': ['executionRule'],
  'mission.': ['missionRule', 'altitudeRouterRule'],
  'response.': ['responseRule'],
  'forecast.': ['forecastIntegrityRule'],
  'watch.': ['earlyWarningRule'],
  // Automation lineage / generic
  'automation.': [],
  'workspace.': [],
});

/**
 * Return the list of rule names that declare interest in an event type.
 * Returns null for "unknown prefix — run all" (conservative fallback).
 */
export function relevantRuleNamesFor(eventType) {
  if (!eventType || typeof eventType !== 'string') return null;
  for (const [prefix, names] of Object.entries(RULE_TRIGGER_PREFIXES)) {
    if (eventType.startsWith(prefix)) return names;
  }
  // Scan events are explicit derived events like 'diligence.scan' — they
  // are caught by the prefix above (e.g. 'diligence.'). If not, fall back.
  return null;
}

/**
 * Filter a rules array to only those relevant for the event.
 * When the index has no entry for the event type, returns the original
 * array (no filtering — correctness over speed).
 */
export function filterRulesForEvent(rules, eventType) {
  const relevant = relevantRuleNamesFor(eventType);
  if (relevant === null) return rules;
  if (relevant.length === 0) return [];
  const set = new Set(relevant);
  return rules.filter((r) => set.has(r.name));
}

/**
 * Quick check: does this event type have any interested rules?
 * Used to avoid creating a savepoint at all when the answer is no.
 */
export function hasRelevantRules(eventType) {
  const relevant = relevantRuleNamesFor(eventType);
  if (relevant === null) return true; // unknown — assume yes
  return relevant.length > 0;
}

/**
 * Build a compact stats object for perf instrumentation: how many rules
 * were considered vs skipped for each event in a cascade.
 */
export function indexStatsFor(rules, events) {
  let considered = 0;
  let skipped = 0;
  for (const ev of events) {
    const relevant = relevantRuleNamesFor(ev?.event?.type || ev?.type || '');
    if (relevant === null) considered += rules.length;
    else {
      considered += relevant.length;
      skipped += rules.length - relevant.length;
    }
  }
  return { totalRules: rules.length, considered, skipped, skipRate: rules.length ? Math.round((skipped / (considered + skipped || 1)) * 100) : 0 };
}
