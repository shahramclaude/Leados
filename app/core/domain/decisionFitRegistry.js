/**
 * app/core/domain/decisionFitRegistry.js — zero-import vocabulary for the
 * Decision-Fit Ledger (ADR-0108, Schema v110, `#/fit`).
 *
 * THE QUESTION
 * ------------
 * Decision Tempo measures how long a call took. The Escalation Economy prices
 * what an escalation costs. The Decision Rights Exchange records a bounded
 * transfer of authority once a human has decided to make one. None of them
 * answers the allocation question a leader is actually judged on:
 *
 *   "I am holding this call at my rung. What would it cost — and what would it
 *    risk — to have it held one rung down? And on my own dated record, is my
 *    judgement of what I must personally hold better than a rule that does not
 *    use my judgement at all?"
 *
 * Every ingredient exists in the workspace already: Jaques horizons (ADR-0075),
 * the rights ladder and record classes (ADR-0076), bounded-authority contracts
 * (ADR-0078), measured latency (Decision Tempo) and priced cost of delay
 * (Decision Portfolio). This registry declares the vocabulary that joins them,
 * and nothing else. Pure data and pure functions: no imports, no clock, no DOM.
 */

export const FIT_ENGINE_VERSION = 'decision-fit-2026.11-v1';

/**
 * Five authority classes. A class is a statement about WHO COULD HOLD a call,
 * not about how important it is — importance is priced separately and in the
 * call's own currency.
 *
 *   floorRank   the lowest altitude that may hold a call of this class. This is
 *               a FLOOR, not a ceiling: above it, any rung may hold the call.
 *               That asymmetry is what makes delegation a real option: a chief
 *               may hold a sequencing call (and probably should not).
 *   defaultRank the rung a call of this class is normally held at when nobody
 *               has said otherwise. Used only to label an alternative, never to
 *               move work.
 *   holdPenaltyPts how much a provisional recommendation is discounted when its
 *               alternative was classified by weak evidence (declared, printed).
 *   cues        weighted evidence lexicon. Matched as stemmed token runs with a
 *               three-token negation window (Chapman et al. 2001), exactly as
 *               `intake.js` and the Altitude Router do.
 *   structural  named structural cues read off the record itself rather than
 *               off prose. These outrank a lexical hit, because an amount of
 *               money in an option is not an adjective.
 */
export const AUTHORITY_CLASSES = Object.freeze([
  Object.freeze({
    key: 'assignment',
    label: 'Assignment & coaching',
    rank: 1,
    floorRank: 1,
    defaultRank: 1,
    horizonHint: 'the week',
    discipline: 'operations / lean',
    question: 'Who does what this week, and what does each person need from me to be able to do it?',
    note: 'Any rung may hold it; almost none should. This is the class with the largest delegation yield in most organisations and the smallest error price.',
    structural: Object.freeze([]),
    cues: Object.freeze({
      'shift': 3, 'roster': 3, 'on call': 3, 'on-call': 3, 'handover': 2, 'standup': 2,
      'assign': 2, 'pair': 2, 'coach': 2, 'training': 2, 'cover': 2, 'cover for': 3,
      'who does': 3, 'who takes': 3, 'task': 1, 'workload': 2, 'one to one': 2, '1:1': 2,
    }),
  }),
  Object.freeze({
    key: 'sequencing',
    label: 'Sequencing & resource split',
    rank: 2,
    floorRank: 1,
    defaultRank: 2,
    horizonHint: 'the cycle',
    discipline: 'operations research / scheduling',
    question: 'In what order do these run, and which team gets the next unit of capacity?',
    note: 'A frontline lead can hold a sequencing call inside their own span — the floor is 1 — but the information it needs is usually a cycle wide. This is the class where an information deficit is cheapest to close by writing the sequence down.',
    structural: Object.freeze(['priority', 'sequence']),
    cues: Object.freeze({
      'sequence': 3, 'order of work': 3, 'priority': 2, 'prioritise': 2, 'prioritize': 2,
      'backlog': 2, 'sprint': 2, 'capacity': 2, 'staffing': 2, 'queue': 2, 'throughput': 2,
      'trade off between': 2, 'tradeoff': 2, 'which team first': 3, 'resourcing': 2,
    }),
  }),
  Object.freeze({
    key: 'structural',
    label: 'Structure, process & standards',
    rank: 3,
    floorRank: 3,
    defaultRank: 3,
    horizonHint: 'the quarter',
    discipline: 'organisation design / systems',
    question: 'Which boundary, process, standard or reporting line makes the next quarter add up?',
    note: 'Below the director altitude a structural call is not merely unwise — it is not this rung’s to make. The ledger refuses it outright rather than pricing it as expensive.',
    structural: Object.freeze(['reporting line', 'headcount']),
    cues: Object.freeze({
      'restructure': 3, 'reorganis': 3, 'reorganiz': 3, 'org design': 3, 'reporting line': 3,
      'boundary': 2, 'process': 2, 'standard': 2, 'policy': 2, 'operating model': 3,
      'merge team': 3, 'split team': 3, 'pods': 2, 'matrix': 2, 'governance': 2,
      'cross functional': 2, 'cross-functional': 2, 'interface': 2,
    }),
  }),
  Object.freeze({
    key: 'capital',
    label: 'Money, headcount & vendors',
    rank: 4,
    floorRank: 4,
    defaultRank: 4,
    horizonHint: 'the half',
    discipline: 'finance / capital allocation',
    question: 'What do we fund, what do we refuse, and what are we buying with it?',
    note: 'A money call below the executive altitude is outside the rights ladder (ADR-0076, enterprise class). The ledger prices the WAIT but refuses the delegation, and says which of the two it refused.',
    structural: Object.freeze(['amount']),
    cues: Object.freeze({
      'budget': 3, 'fund': 3, 'funding': 3, 'investment': 3, 'capital': 3, 'vendor': 3,
      'contract': 3, 'purchase': 3, 'procure': 3, 'headcount': 3, 'hire': 3, 'salary': 3,
      'signature threshold': 3, 'renewal': 2, 'cost': 2, 'spend': 2, 'roi': 3,
      'pricing': 2, 'licence': 2, 'license': 2,
    }),
  }),
  Object.freeze({
    key: 'enterprise',
    label: 'Enterprise disclosure & bets',
    rank: 5,
    floorRank: 5,
    defaultRank: 5,
    horizonHint: 'the year',
    discipline: 'corporate strategy / governance',
    question: 'What must be true for the year to hold, and what do we tell the board?',
    note: 'The floor is the chief. Delegating an enterprise call cannot be priced as an option because no lower rung can hold it at all; the ledger prints that as a rights refusal, never as an expensive option.',
    structural: Object.freeze([]),
    cues: Object.freeze({
      'board': 3, 'investor': 4, 'shareholder': 4, 'acquisition': 4, 'merger': 4,
      'disclosure': 3, 'annual report': 4, 'company wide': 4, 'company-wide': 4,
      'enterprise': 3, 'group wide': 3, 'group-wide': 3, 'strategic bet': 3,
      'five year': 4, 'market entry': 3,
    }),
  }),
]);

export const AUTHORITY_CLASS_KEYS = Object.freeze(AUTHORITY_CLASSES.map((c) => c.key));

export const CLASS_BY_KEY = Object.freeze(Object.fromEntries(AUTHORITY_CLASSES.map((c) => [c.key, c])));

/** The rank below which a call of this class may never be delegated. */
export function classFloorRank(key) {
  return CLASS_BY_KEY[key] ? CLASS_BY_KEY[key].floorRank : 5;
}

/**
 * Declared conventions. Every one is printed on the page with its bound, and
 * none is fitted to data. A convention that could not be explained to the
 * leader whose work it prices would be a hidden policy.
 */
export const FIT_CONVENTION_DEFAULTS = Object.freeze({
  // A class estimate of latency is REFUSED below this many settled calls.
  fitClassFloorN: 4,
  // A span's contested share is REFUSED below this many eligible calls.
  fitShareFloorN: 6,
  // The delegation yield is REFUSED below this many priced open calls.
  fitPricedFloorN: 3,
  // Expected hold at a rung is at most this fraction of that rung's horizon.
  // Below 1.0 because a rung that must decide inside 30 days does not use 30.
  fitHorizonUtilisationPct: 80,
  // Probability the receiving rung gets a delegated call wrong, by points of
  // information deficit. Declared schedule, linearly interpolated and clamped:
  //   deficit 0 pts -> 8%     (it holds every record the call rests on)
  //   deficit 40 pts -> 38%   (it is deciding on a summary)
  //   deficit 80 pts -> 68%   (it is deciding on a rumour)
  fitBaseErrorPct: 8,
  fitErrorPerDeficitPointPct: 0.75,
  // Expected rework cost as a fraction of the value at stake, when the receiving
  // rung gets it wrong. A re-decide is cheaper than the original error.
  fitReworkCostPct: 35,
  // Principal–agent monitoring cost (Jensen & Meckling 1976): every rung of
  // authority distance adds a return path, a check-in and an escalation to
  // police. Charged as a declared share of the wait saved per rung beyond the
  // nearest delegable rung. Without it, a large enough value at stake makes the
  // model recommend delegating everything to the most junior rung in the
  // building — which is exactly the advice a naive "delegation saves time"
  // dashboard gives, and it is wrong.
  fitMonitoringCostPctPerRung: 14,
  // A call that rests on NO typed evidence cannot be shown to be safe to move:
  // the deficit is UNKNOWN, not zero. A zero here would price every delegation
  // as risk-free. The declared default is applied and the alternative is
  // labelled provisional on the page.
  fitNoEvidenceDeficitPts: 25,
  // A recommended alternative is WITHHELD as provisional when its net weekly
  // benefit is below this fraction of the value at stake. Noise, not a saving.
  fitMaterialityPct: 5,
  // FIT-02 opens one governed delegation proposal per call per ISO week when a
  // call has outlived its rung's utilisable horizon and a material saving exists.
  fitProposalAfterDays: 7,
  // A frozen reading must be graded inside this window.
  fitReviewDays: 21,
  fitAutoPropagate: true,
});

export const FIT_CONVENTION_BOUNDS = Object.freeze({
  fitClassFloorN: [2, 20],
  fitShareFloorN: [3, 30],
  fitPricedFloorN: [2, 20],
  fitHorizonUtilisationPct: [50, 100],
  fitBaseErrorPct: [1, 40],
  fitErrorPerDeficitPointPct: [0, 2],
  fitReworkCostPct: [10, 80],
  fitMonitoringCostPctPerRung: [0, 40],
  fitNoEvidenceDeficitPts: [0, 60],
  fitMaterialityPct: [1, 50],
  fitProposalAfterDays: [3, 60],
  fitReviewDays: [7, 90],
});

/** Declared caps. A cap is a refusal to grow without bound, not a silent drop. */
export const FIT_LIMITS = Object.freeze({
  snapshots: 400,
  proposals: 400,
  readings: 200,
  markers: 900,
  alternativesPerCall: 5,
  callsPerReport: 40,
  ancestorsCap: 16,
  sourceChars: 2400,
  titleChars: 200,
  reasonChars: 400,
  // An AUTOMATIC spine pass must stay cheap. An explicit `fit.scan` is bounded
  // by the ledger's own size instead, so two identical scans converge (the
  // non-idempotence failure the Epistemic Ledger's merge exposed).
  freezePerPass: 5,
  proposalsPerPass: 2,
  minOpenDecisions: 1,
});

export const FIT_EVENTS = Object.freeze({
  SCAN: 'fit.scan',
  CONVENTIONS: 'fit.conventions',
  PROPOSED: 'fit.delegation_proposed',
});

/** Only a real decision write may wake this module on an automatic pass. */
export const FIT_DECISION_EVENTS = Object.freeze([
  'decision.created', 'decision.updated', 'decision.made', 'decision.decided',
  'decision.reviewed', 'decision.withdrawn', 'decision.reclassified',
]);

/** These events are the OUT OF SAMPLE moment: a contract's outcome is knowable. */
export const FIT_SETTLEMENT_EVENTS = Object.freeze([
  'mandate.completed', 'mandate.delivered', 'mandate.returned', 'mandate.revoked', 'mandate.expired',
]);

export const FIT_RULE_IDS = Object.freeze({
  SNAPSHOT: 'RULE-FIT-01',
  PROPOSE: 'RULE-FIT-02',
  GRADE: 'RULE-FIT-03',
  ROLLUP: 'RULE-FIT-04',
});

export const FIT_TRIGGER_PREFIX = 'fit.';

/**
 * The reading each altitude gets. `tone` is the claim the rung is allowed to
 * make, not a decoration: a chief is never handed an item list, a frontline
 * lead is never handed a portfolio aggregate.
 */
export const FIT_ALTITUDE_QUESTIONS = Object.freeze({
  frontline: 'What am I holding this week that a deputy or a shadow could take — and what would that give me back?',
  manager: 'What is my span holding at my rung that its own leads should hold, and what is it costing this cycle?',
  director: 'Which authority is accumulating at my rung, what is a boundary change worth, and is my span’s contested share one number or five?',
  exec: 'What is this function paying to hold calls that belong a rung down — and what risk is that buying?',
  chief: 'How much of this enterprise’s decision latency is self-inflicted authority, and which classes would the board see change?',
});

/**
 * Reasons a delegation alternative can be refused, withheld or flagged. Printed
 * verbatim beside the alternative so a blank never looks like a zero.
 */
export const FIT_REFUSALS = Object.freeze({
  'rights-floor': 'This rung is below the rights floor for the call’s authority class. It cannot hold the call, so there is no option to price.',
  'no-owner': 'The call has no resolvable owner in the reporting tree, so there is no rung to delegate from.',
  'unpriced': 'The call has no priced value at stake. The wait is counted in days but its cost is unknown — never assumed to be zero.',
  'class-thin': 'This workspace has too few settled calls of this class to estimate latency; the pooled estimate is printed with its own evidence count instead.',
  'insufficient-record': 'No settled call in the workspace is old enough to estimate latency. The ledger refuses rather than inventing one.',
  'no-history': 'The rights ladder leaves no rung below the owner that may hold this class of call.',
  'immaterial': 'The priced net saving is below the declared materiality bar. It is printed as noise, not recommended.',
  'irreversible-below-floor': 'The call is one-way, and the receiving rung does not hold every record it rests on. Printed as a warning, never silently blocked.',
  'no-evidence': 'The call names no typed evidence at all, so it cannot be shown that a lower rung holds what the call rests on. A declared default deficit is applied and this alternative is provisional.',
});

export const FIT_PANELS = Object.freeze([
  Object.freeze({ key: 'book', label: 'The book', note: 'Every open call as a priced option: what holding it at this rung costs, and what one rung down would save.' }),
  Object.freeze({ key: 'ladder', label: 'The ladder', note: 'Where authority is accumulating: contested share per rung, with its interval and its evidence count.' }),
  Object.freeze({ key: 'grade', label: 'Forecast grades', note: 'Every delegation the ledger proposed, graded once against the contract that followed it.' }),
  Object.freeze({ key: 'method', label: 'Method & refusals', note: 'Every convention, every bound and every refusal this screen would print.' }),
]);

/** Deterministic key for a frozen snapshot: one per decision per classification. */
export function snapshotKey(decisionId, classKey, ownerNodeId) {
  return `fit:${String(decisionId || '')}:${String(classKey || '')}:${String(ownerNodeId || '')}`;
}

/** Deterministic idempotency marker. A rescan can never duplicate a proposal. */
export function proposalMarker(decisionId, week, targetNodeId) {
  return `[FIT-PROPSE:${decisionId}:${week}:${targetNodeId}]`;
}

/** Marker stamped on the governed decision a proposal banks its evidence in. */
export function proposalDecisionMarker(decisionId, week, targetNodeId) {
  return `[FIT-OPTION:${decisionId}:${week}:${targetNodeId}]`;
}
