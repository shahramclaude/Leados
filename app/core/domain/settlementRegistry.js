/**
 * app/core/domain/settlementRegistry.js — leaf vocabulary for the Outcome
 * Attribution & Loop Settlement Terminal (Schema v75, ADR-0067).
 *
 * Leaf module with zero imports so `schema.js`, `settlement.js`,
 * `settlementRules.js`, `propagationContracts.js` and `insights.js` share one
 * canonical vocabulary without circular dependencies.
 *
 * Cross-domain foundations encoded in this vocabulary:
 *  - Lipke (2003) Earned Schedule: time-domain ES, SPI(t), SV(t), IEAC(t).
 *  - Goldratt (1997) Critical-Chain Buffer Management: Fever-Chart zones
 *    plotting window burn % against multi-channel clearance %.
 *  - Pressman & Wildavsky (1973) Joint Clearance Complexity: separating
 *    leader-gated governance clearances from delegated execution clearances.
 *  - Argyris (1977) Single- vs Double-Loop Learning, Fixsen et al. (2005)
 *    Implementation vs Intervention failure, and Holmström (1979) / Kerr (1975)
 *    informativeness & anti-scapegoating attribution.
 *  - Brinson & Fachler (1985) exact 3-way additive economic variance partition
 *    (schedule drift + rate/intensity revision + interaction = total variance).
 *  - Savage (1951) ex-post policy regret over rehearsed Response Studio plans
 *    and Brier (1950) strictly proper out-of-sample forecast scoring.
 */

export const SETTLEMENT_ENGINE_VERSION = 'settlement-attribution-2026.11-v1';

export const SETTLEMENT_RULE_IDS = Object.freeze({
  LINK: 'RULE-STL-01',
  THESIS_PIVOT: 'RULE-STL-02',
  LEADER_BOTTLENECK: 'RULE-STL-03',
  DELIVERY_REPAIR: 'RULE-STL-04',
  GRADE_RECONCILE: 'RULE-STL-05',
});

export const SETTLEMENT_EVENTS = Object.freeze({
  FROZEN: 'settlement.frozen',
  RECORDED: 'settlement.recorded',
  ARCHIVED: 'settlement.archived',
  SCAN: 'settlement.scan',
});

export const SETTLEMENT_STATUSES = Object.freeze(['frozen', 'settled', 'archived']);

export const SETTLEMENT_LOOP_KINDS = Object.freeze(['bundle', 'response', 'case-loop']);

export const SETTLEMENT_LOOP_LABELS = Object.freeze({
  bundle: 'Action bundle',
  response: 'Response plan',
  'case-loop': 'Coordinated case loop',
});

export const SETTLEMENT_CHANNELS = Object.freeze([
  'decision',
  'comms',
  'coaching',
  'delegation',
  'premise',
  'budget',
]);

export const SETTLEMENT_CHANNEL_LABELS = Object.freeze({
  decision: 'Governed DACI decision',
  comms: 'Stakeholder brief loop',
  coaching: '1:1 support & coaching',
  delegation: 'Delegated execution',
  premise: 'Falsifiable assumption',
  budget: 'Budget encumbrance & spend',
});

/**
 * Who controls clearing the gate:
 *  - `leader`: choosing a DACI option, approving/sending a stakeholder brief,
 *    or holding the queued 1:1 coaching check-in.
 *  - `delegate`: progressing and completing delegated operational work.
 *  - `shared`: reviewing/settling testable premises and reconciling spend.
 */
export const SETTLEMENT_CHANNEL_OWNER_SIDE = Object.freeze({
  decision: 'leader',
  comms: 'leader',
  coaching: 'leader',
  delegation: 'delegate',
  premise: 'shared',
  budget: 'shared',
});

export const SETTLEMENT_FEVER_ZONES = Object.freeze([
  'green',
  'watch',
  'red',
  'unscheduled',
]);

export const SETTLEMENT_FEVER_LABELS = Object.freeze({
  green: 'In buffer (Green)',
  watch: 'Buffer watch (Amber)',
  red: 'Buffer breached (Red)',
  unscheduled: 'No dated window',
});

export const SETTLEMENT_THESIS_STATES = Object.freeze([
  'corroborated',
  'falsified',
  'untested',
]);

export const SETTLEMENT_THESIS_LABELS = Object.freeze({
  corroborated: 'Corroborated by dated outcome',
  falsified: 'Falsified / signpost breached',
  untested: 'Open / untested',
});

export const SETTLEMENT_REGIMES = Object.freeze([
  'validated-win',
  'thesis-falsified-clean-execution',
  'execution-stalled-leader-gated',
  'execution-drift-untested-thesis',
  'confounded-refused',
  'in-flight-on-pace',
]);

export const SETTLEMENT_REGIME_META = Object.freeze({
  'validated-win': Object.freeze({
    label: 'Validated loop (scale / codify)',
    loopType: 'double-loop-confirm',
    tone: 'good',
    summary: 'Execution met the fidelity floor and the governing thesis/outcome held on dated records.',
    actionGuidance: 'Codify the barrier in After-Action Learning and release residual contingency.',
  }),
  'thesis-falsified-clean-execution': Object.freeze({
    label: 'Thesis falsified · clean execution (exonerate team & pivot)',
    loopType: 'double-loop-pivot',
    tone: 'bad',
    summary: 'Delegated work cleared at or above the fidelity floor, yet the governing premise or case outcome failed.',
    actionGuidance: 'Explicitly credit the delegate for clean execution so good delivery is never punished for a false bet; pivot the governing thesis in a DACI decision.',
  }),
  'execution-stalled-leader-gated': Object.freeze({
    label: 'Leader-gated bottleneck (clear governance)',
    loopType: 'leader-clearance',
    tone: 'caution',
    summary: 'Leader-owned clearance points (unchosen decision, unsent brief, or unheld 1:1 support) lag behind delegated execution.',
    actionGuidance: 'Clear the unchosen DACI call or stakeholder brief yourself before adding follow-up work to the team.',
  }),
  'execution-drift-untested-thesis': Object.freeze({
    label: 'Execution drift · thesis untested (Type-III guard)',
    loopType: 'single-loop-repair',
    tone: 'caution',
    summary: 'Schedule performance lags inside the review window while the governing premise has not yet been tested.',
    actionGuidance: 'Repair delivery blockers (single-loop) — refuse to declare the strategy wrong before the intervention actually lands.',
  }),
  'confounded-refused': Object.freeze({
    label: 'Confounded — causal attribution refused',
    loopType: 'refused',
    tone: 'neutral',
    summary: 'Execution fell short of the fidelity floor and the outcome missed or expired without a clean test.',
    actionGuidance: 'Do not draw a strategic lesson or assign blame from a confounded run; either complete delivery or run a bounded verification test.',
  }),
  'in-flight-on-pace': Object.freeze({
    label: 'In flight · within critical-chain buffer',
    loopType: 'monitoring',
    tone: 'good',
    summary: 'Multi-channel clearance is tracking inside the critical-chain fever corridor ahead of the review date.',
    actionGuidance: 'Maintain cadence through the review date; freeze a prospective closure forecast if you want an out-of-sample Brier check.',
  }),
});

export const SETTLEMENT_LIMITS = Object.freeze({
  maxRecords: 120,
  maxHistory: 40,
  maxLabel: 180,
  maxNotes: 1000,
  minForecastPct: 5,
  maxForecastPct: 95,
  minFidelityFloorPct: 50,
  maxFidelityFloorPct: 95,
  defaultFidelityFloorPct: 75,
  minStaleDays: 1,
  maxStaleDays: 60,
  defaultStaleDays: 7,
  minSkillSamples: 5,
  poorBrierThreshold: 0.25,
});

export const SETTLEMENT_BLAME_PATTERN = /\b(careless|lazy|incompetent|negligent|stupid|blamed?|fault of|human error|sloppy)\b/i;

export function hasBlameLanguage(text) {
  return typeof text === 'string' && SETTLEMENT_BLAME_PATTERN.test(text);
}

export const SETTLEMENT_RULES = Object.freeze([
  {
    id: SETTLEMENT_RULE_IDS.LINK,
    name: 'Typed settlement, exoneration & bottleneck provenance',
    framework: 'Pressman & Wildavsky (1973) clearance graph & Holmström (1979) informativeness',
    trigger: 'settlement.frozen / settlement.recorded / settlement.scan',
    targetModule: 'links',
    description: 'Links each frozen or settled attribution receipt to its source bundle, response plan or case (`settles-loop`), attaches `exonerates-delivery` edges when clean execution collides with a falsified thesis, and attaches `flags-bottleneck` edges to unchosen leader-gated decisions.',
  },
  {
    id: SETTLEMENT_RULE_IDS.THESIS_PIVOT,
    name: 'Double-loop thesis pivot & blameless team exoneration',
    framework: 'Argyris (1977) double-loop learning, Kerr (1975) & Edmondson (1999) psychological safety',
    trigger: 'settlement.recorded',
    targetModule: 'decisions / people / retros',
    description: 'When delegated execution meets the fidelity floor yet the governing premise or case outcome fails (`thesis-falsified-clean-execution`), queues one blameless delivery-credit prompt for the delegate, opens one governed DACI thesis-pivot decision (priced by Decision Tempo), and seeds an After-Action Review draft with the separated facts.',
  },
  {
    id: SETTLEMENT_RULE_IDS.LEADER_BOTTLENECK,
    name: 'Leader-bottleneck self-accountability escalation',
    framework: 'Goldratt (1997) Critical-Chain Fever Chart & Pressman–Wildavsky leader clearance points',
    trigger: 'settlement.frozen / settlement.recorded / settlement.scan',
    targetModule: 'decisions',
    description: 'When a loop enters the Red fever zone under `execution-stalled-leader-gated`, records a dated governance-latency prompt on the blocking unchosen DACI decision rather than delegating additional follow-up work to reports.',
  },
  {
    id: SETTLEMENT_RULE_IDS.DELIVERY_REPAIR,
    name: 'Type-III error guard & single-loop unblocking',
    framework: 'Raiffa (1968) / Mitroff & Featheringham (1974) Type-III error prevention & Fixsen et al. (2005)',
    trigger: 'settlement.recorded / settlement.scan',
    targetModule: 'delegations / premises',
    description: 'When execution drifts below the fidelity floor while the thesis remains untested (`execution-drift-untested-thesis`), opens one blameless unblocking check-in task and records an advisory guard on open linked premises so an unimplemented plan is not misclassified as a failed strategy.',
  },
  {
    id: SETTLEMENT_RULE_IDS.GRADE_RECONCILE,
    name: 'Out-of-sample Brier settlement grading & link reconciliation',
    framework: 'Brier (1950) proper scoring rule & Lipke (2003) Earned Schedule closure',
    trigger: 'settlement.scan / case.resolved / premise.outcome / settlement.archived',
    targetModule: 'settlements / delegations / links',
    description: 'Grades frozen loop forecasts once out-of-sample when their window closes or source case resolves, opens one process-calibration review task when Brier error reaches 0.25, and removes dangling settlement graph edges.',
  },
]);
