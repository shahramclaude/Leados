/**
 * app/core/domain/contradictionRegistry.js — the declared vocabulary of the
 * Cross-Line Contradiction Audit (ADR-0144, Schema v121, `#/contradiction`).
 *
 * THE DUTY. Session 194 built the instrument that settles WHICH of two lines'
 * dated demands goes first — today, on one person, for one window. It is an
 * adjudication. What it cannot do, and what a CEO actually needs before the next
 * quarter is planned, is the reverse question:
 *
 *   "Two lines of my matrix are each chartered to optimise something. Do their
 *    charters, as written, make one another permanently unachievable for the
 *    people who sit on both lines — and if so, will the precedence we arbitrate
 *    this quarter be re-fought every quarter for the rest of the year?"
 *
 * A precedence agreement answers "who goes first". It cannot answer "the game is
 * rigged against the loser", because that is a property of the DESIGN, not of a
 * demand. No single-chain tool can see it at all: with one manager there is one
 * charter. The contradiction only exists in the matrix.
 *
 * WHY THIS IS NOT A RATING. Every finding below is a statement about a PAIR of
 * declared charters, or about the arithmetic of a person's declared incentive
 * weights. It is never a score of a manager, a leader or a team, and the module
 * refuses to rank people by it. A contradiction is a design fact a chief can fix
 * in a minute; a "conflict score" would be a judgement about colleagues that no
 * record can support.
 *
 * WHAT IS DECLARED HERE, AND WHY NOTHING HERE IS DERIVED
 * ------------------------------------------------------
 * A panel, a CSV column and a rule must never disagree about what a word means.
 * Everything below is a constant imported by all three. Nothing is a total, a
 * severity verdict about a workspace or a person's rank: findings are re-derived
 * on read from the stored declarations and the live matrix, so a printed finding
 * cannot drift from the rows it claims to describe.
 *
 * THREE HONESTY AXES, ENCODED AS VOCABULARY
 * -----------------------------------------
 *  1. NOT EVERY TRADE-OFF IS PROVABLE. `incompatible` is reserved for pairs that
 *     can be shown from declared integers (a lever pushed two ways at once, an
 *     incentive weight above 100%, two claims above 100% of one envelope, or a
 *     utilisation target past the queueing knee). Everything else is `tension`.
 *  2. A PAIR OF LINES THAT SHARES NOBODY IS NOT A CONTRADICTION. It is
 *     `isolated` and counted separately, so an audit cannot inflate its own
 *     severity by pairing every line with every other line.
 *  3. A FIGURE THAT IS NOT DECLARED IS NOT ZERO. A missing utilisation target
 *     yields `insufficient-evidence` naming the missing figure, never a
 *     favourable default.
 */

export const CONTRADICTION_ENGINE_VERSION = 'contradiction-audit-2026.11-v1';

/** The declared events. Each is one human act, or one consequence of one. */
export const CONTRADICTION_EVENTS = Object.freeze({
  DECLARE: 'mandate.declared',
  WITHDRAW: 'mandate.withdrawn',
  REVIEW: 'contradiction.reviewed',
  CONVENTIONS: 'contradiction.conventions.set',
});

export const CONTRADICTION_SCAN_EVENT = 'contradiction.scan';

/** RULE-CNT-01 is the only rule that issues work from this module. */
export const CONTRADICTION_RULE_ID = 'RULE-CNT-01';

/* ------------------------------------------------------------------ levers */

/**
 * The operating levers an objective can pull. A fixed taxonomy on purpose: a
 * free-text metric name can never be compared with another line's metric,
 * because "cost per ticket" and "unit cost" are the same lever spelled two ways
 * and "cost" and "quality" are two levers that trade off against each other.
 * The engine can only reason about a closed vocabulary.
 *
 * `unit` is the unit the lever's target is declared in. `higherIsBetter` is the
 * DIRECTION THAT IS GOOD FOR THE ENTERPRISE, printed on the Method panel so a
 * reader can disagree with the taxonomy explicitly rather than silently.
 */
export const CONTRADICTION_LEVERS = Object.freeze([
  Object.freeze({ key: 'throughput', label: 'Throughput / output volume', unit: 'units', higherIsBetter: true, hint: 'How much work leaves the system per period.' }),
  Object.freeze({ key: 'lead-time', label: 'Lead time / cycle time', unit: 'days', higherIsBetter: false, hint: 'How long a unit of work takes from accepted to delivered.' }),
  Object.freeze({ key: 'utilisation', label: 'Resource utilisation', unit: 'percent', higherIsBetter: true, hint: 'Share of available capacity that is committed to work (0–99%).' }),
  Object.freeze({ key: 'inventory', label: 'Inventory / work in progress', unit: 'units', higherIsBetter: false, hint: 'Work accepted but not yet delivered — the buffer a lead time is bought with.' }),
  Object.freeze({ key: 'service-level', label: 'Service level / availability', unit: 'percent', higherIsBetter: true, hint: 'Share of demand met within the promised window.' }),
  Object.freeze({ key: 'cost', label: 'Unit cost', unit: 'money', higherIsBetter: false, hint: 'Cost per delivered unit, in the line’s own currency.' }),
  Object.freeze({ key: 'quality', label: 'Quality / defect rate', unit: 'percent', higherIsBetter: false, hint: 'Defects, rework or escapes per delivered unit.' }),
  Object.freeze({ key: 'growth', label: 'Growth / new revenue', unit: 'money', higherIsBetter: true, hint: 'New revenue won in the period.' }),
  Object.freeze({ key: 'margin', label: 'Margin / profitability', unit: 'percent', higherIsBetter: true, hint: 'Contribution or operating margin on what is delivered.' }),
  Object.freeze({ key: 'risk', label: 'Risk exposure', unit: 'index', higherIsBetter: false, hint: 'Declared risk the line is carrying.' }),
]);

export const CONTRADICTION_LEVER_KEYS = Object.freeze(CONTRADICTION_LEVERS.map((l) => l.key));
const LEVER_BY_KEY = new Map(CONTRADICTION_LEVERS.map((l) => [l.key, l]));
export function contradictionLever(key) {
  return LEVER_BY_KEY.get(key) || null;
}
export function contradictionLeverLabel(key) {
  return LEVER_BY_KEY.get(key)?.label || key || '—';
}

/** The only two directions a charter can declare. */
export const CONTRADICTION_DIRECTIONS = Object.freeze([
  Object.freeze({ key: 'increase', label: 'Increase it', verb: 'up' }),
  Object.freeze({ key: 'decrease', label: 'Decrease it', verb: 'down' }),
]);
export const CONTRADICTION_DIRECTION_KEYS = Object.freeze(CONTRADICTION_DIRECTIONS.map((d) => d.key));

/* ------------------------------------------------------- coupled trade-offs */

/**
 * The declared couplings between levers, each named from the literature that
 * actually describes it. `provable` is the honest distinction:
 *
 *  - `queueing` couplings have an ARITHMETIC test. Given a declared utilisation
 *    target τ (whole percent), the Kingman / VUT approximation puts the expected
 *    wait-to-processing ratio at τ / (100 − τ). That is a computable number from
 *    a declared integer, so above the declared ceiling the pair is
 *    `incompatible` with the multiplier printed beside it — not an opinion.
 *  - every other coupling is a TRADE-OFF, not an impossibility: cost and quality
 *    can both improve through a process change, so claiming impossibility would
 *    be false. It is `tension`, and the panel says which is which.
 */
export const CONTRADICTION_COUPLINGS = Object.freeze([
  Object.freeze({
    key: 'utilisation-leadtime',
    a: 'utilisation', aDirection: 'increase',
    b: 'lead-time', bDirection: 'decrease',
    law: 'Kingman / VUT queueing approximation (Kingman 1961; Hopp & Spearman 2001)',
    provable: 'queueing',
    why: 'Utilisation and lead time are not two dials. In any system with variability, waiting time grows as τ/(1−τ): the cost of the last few points of utilisation is not linear, it is asymptotic. A line chartered to push utilisation up and a line chartered to pull lead time down are trading the same buffer against one another, and above the knee the lead-time target stops being expensive and starts being arithmetically unavailable.',
  }),
  Object.freeze({
    key: 'inventory-service',
    a: 'inventory', aDirection: 'decrease',
    b: 'service-level', bDirection: 'increase',
    law: 'Little’s Law and the newsvendor critical fractile (Silver, Pyke & Peterson)',
    provable: null,
    why: 'Service level is bought with buffer. A line chartered to run inventory down and a line chartered to raise availability are drawing on the same stock; the trade-off is real, but a reshaped supply chain can move the frontier, so this is a tension rather than a proof of impossibility.',
  }),
  Object.freeze({
    key: 'cost-quality',
    a: 'cost', aDirection: 'decrease',
    b: 'quality', bDirection: 'increase',
    law: 'Cost–quality frontier and the cost of poor quality (Juran)',
    provable: null,
    why: 'Cutting unit cost while raising quality is possible — prevention often pays for itself — but only through a deliberate change in the process. Absent that change, the two charters are pulling the same spend in opposite directions.',
  }),
  Object.freeze({
    key: 'growth-margin',
    a: 'growth', aDirection: 'increase',
    b: 'margin', bDirection: 'increase',
    law: 'Growth–margin frontier (Porter; the BCG investment frontier)',
    provable: null,
    why: 'Winning new revenue usually costs margin, and defending margin usually costs growth. A matrix where one line is paid on growth and another on margin is a well-known way to make two colleagues fight over the same discount.',
  }),
  Object.freeze({
    key: 'throughput-quality',
    a: 'throughput', aDirection: 'increase',
    b: 'quality', bDirection: 'increase',
    law: 'Speed–quality trade-off (Deming; the Toyota andon counter-example)',
    provable: null,
    why: 'Pushing volume up while defect rate is pushed down is achievable with the right system — Toyota did it — but not when both are declared as independent targets on the same constrained people. The tension is in the simultaneity, not in the levers.',
  }),
  Object.freeze({
    key: 'utilisation-quality',
    a: 'utilisation', aDirection: 'increase',
    b: 'quality', bDirection: 'increase',
    law: 'Overload and error rate (Hockey’s compensatory control model)',
    provable: null,
    why: 'Loaded systems make more mistakes. A utilisation charter above the knee and a zero-defect charter on the same people are answering different questions about the same hours.',
  }),
]);

/**
 * Index a coupling by the unordered lever pair, so a charter declared the other
 * way round is found by the same law. Direction is checked separately.
 */
export function contradictionCoupling(leverA, leverB) {
  if (!leverA || !leverB || leverA === leverB) return null;
  return CONTRADICTION_COUPLINGS.find((c) => (c.a === leverA && c.b === leverB) || (c.a === leverB && c.b === leverA)) || null;
}

/* ----------------------------------------------------------------- findings */

/**
 * The finding kinds. `severity` is the DEFAULT severity; the engine may print
 * `insufficient-evidence` or `isolated` instead, and always prints why.
 *
 *  incompatible  can be shown from declared integers or from the queueing law.
 *  tension       a declared trade-off; real, but not a proof of impossibility.
 *  isolated      two charters pull against each other, but no person sits on
 *                both lines — so it is a design note, not a live contradiction.
 *  insufficient  a figure the finding needs was not declared; nothing inferred.
 */
export const CONTRADICTION_FINDINGS = Object.freeze([
  Object.freeze({ key: 'lever-opposition', label: 'Two lines declare opposite directions on the same lever', severity: 'incompatible' }),
  Object.freeze({ key: 'coupled-trade-off', label: 'Two lines push coupled levers against one another', severity: 'tension' }),
  Object.freeze({ key: 'incentive-oversubscription', label: 'One person’s declared incentive weights exceed 100%', severity: 'incompatible' }),
  Object.freeze({ key: 'incentive-opposition', label: 'One person is paid, materially, to do both', severity: 'incompatible' }),
  Object.freeze({ key: 'envelope-overclaim', label: 'Lines claim more than 100% of one budget envelope', severity: 'incompatible' }),
]);

export const CONTRADICTION_FINDING_KEYS = Object.freeze(CONTRADICTION_FINDINGS.map((f) => f.key));
const FINDING_BY_KEY = new Map(CONTRADICTION_FINDINGS.map((f) => [f.key, f]));
export function contradictionFinding(key) {
  return FINDING_BY_KEY.get(key) || null;
}
export function contradictionFindingLabel(key) {
  return FINDING_BY_KEY.get(key)?.label || key || '—';
}
const FINDING_RANK = new Map(CONTRADICTION_FINDINGS.map((f, i) => [f.key, i]));
export function contradictionFindingRank(key) {
  const rank = FINDING_RANK.get(key);
  return typeof rank === 'number' ? rank : FINDING_RANK.size;
}

/** The severity vocabulary a rendered finding can carry. */
export const CONTRADICTION_SEVERITIES = Object.freeze([
  Object.freeze({ key: 'incompatible', label: 'Incompatible', hint: 'Shown from declared figures or from the queueing law. A leader cannot hold both, whoever they are.' }),
  Object.freeze({ key: 'tension', label: 'Tension', hint: 'A declared trade-off. Real, but a deliberate process change can move the frontier — this module does not claim impossibility.' }),
  Object.freeze({ key: 'isolated', label: 'Isolated', hint: 'The charters pull against each other, but no person sits on both lines, so nobody is caught today. Counted, never counted as a contradiction.' }),
  Object.freeze({ key: 'insufficient', label: 'Insufficient evidence', hint: 'A figure the finding needs was not declared. Nothing was inferred and no verdict is offered.' }),
]);
export const CONTRADICTION_SEVERITY_KEYS = Object.freeze(CONTRADICTION_SEVERITIES.map((s) => s.key));

/* ------------------------------------------------------------------ reviews */

/**
 * The CEO's dispositions. Deliberately three, and none of them "resolved",
 * because a contradiction between two charters is not something an audit can
 * close — it can only be knowingly accepted, deliberately changed, or explicitly
 * withheld with a reason.
 */
export const CONTRADICTION_VERDICTS = Object.freeze([
  Object.freeze({
    key: 'accepted',
    label: 'Run both knowingly',
    hint: 'The chief records that both charters stand, with the reasoning and a date to look again. Nothing is issued as work; the decision record is the point.',
    issuesWork: false,
  }),
  Object.freeze({
    key: 'resequenced',
    label: 'Change one line’s charter',
    hint: 'One named line must revise its objective or its weight. RULE-CNT-01 issues the dated obligation to that line in the same transaction and records a governed decision.',
    issuesWork: true,
  }),
  Object.freeze({
    key: 'withheld',
    label: 'Cannot judge yet',
    hint: 'A reason is required and printed. Withholding is a recorded fact, not a gap: the finding stays on the board as undecided rather than silently closing.',
    issuesWork: false,
  }),
]);

export const CONTRADICTION_VERDICT_KEYS = Object.freeze(CONTRADICTION_VERDICTS.map((v) => v.key));
const VERDICT_BY_KEY = new Map(CONTRADICTION_VERDICTS.map((v) => [v.key, v]));
export function contradictionVerdict(key) {
  return VERDICT_BY_KEY.get(key) || null;
}

/** Finding state is derived from the review ledger, never stored on a finding. */
export const CONTRADICTION_STATES = Object.freeze({
  undecided: 'undecided',
  accepted: 'accepted',
  resequenced: 'resequenced',
  withheld: 'withheld',
});
export const CONTRADICTION_STATE_LABELS = Object.freeze({
  undecided: 'Undecided — nobody has ruled on this contradiction',
  accepted: 'Accepted — both charters stand, knowingly, until the review date',
  resequenced: 'Resequenced — one line was told, in writing, to change its charter',
  withheld: 'Withheld — a reason is printed; the finding stays open',
});
/** States that still count as live attention. `accepted` counts only when due. */
export const CONTRADICTION_OPEN_STATES = Object.freeze(['undecided', 'withheld']);

/* -------------------------------------------------------------- conventions */

export const CONTRADICTION_DEFAULTS = Object.freeze({
  /**
   * The utilisation above which the queueing knee is treated as passed. This is
   * a DECLARED operating convention, not a law: the knee's position depends on
   * the variability of arrival and service, which this workspace does not
   * measure. 85% is the common service-operations planning figure (ITIL's
   * capacity guidance; Hopp & Spearman's variability law). Above it, the
   * queueing coupling is `incompatible` and the multiplier is printed.
   */
  ctrUtilisationCeiling: 85,
  /**
   * The combined declared incentive weight, in basis points, below which an
   * opposite-direction pair is treated as immaterial rather than printed as a
   * contradiction. 2000 bp = 20% of a scorecard. Below that a leader has a
   * rounding error, not a conflict.
   */
  ctrMaterialityBp: 2000,
  /** Default horizon at which an accepted contradiction comes back for review. */
  ctrReviewDays: 90,
  /** Pause RULE-CNT-01's automatic obligation issue; an explicit scan still runs. */
  ctrAutoPropagate: true,
});

export const CONTRADICTION_BOUNDS = Object.freeze({
  utilisationCeiling: Object.freeze({ min: 50, max: 95, step: 1 }),
  materialityBp: Object.freeze({ min: 0, max: 10000, step: 100 }),
  reviewDays: Object.freeze({ min: 7, max: 365, step: 1 }),
});

export const CONTRADICTION_LIMITS = Object.freeze({
  /** Mandates one line may hold before the remainder is refused with a reason. */
  mandatesPerLine: 24,
  mandatesMax: 400,
  /** Findings carried on the board before the rest are counted, never dropped. */
  boardFindings: 40,
  /** Reviews kept in the read model; older ones are counted. */
  reviewsKept: 60,
  titleChars: 160,
  noteChars: 1200,
  rationaleChars: 1200,
  reasonChars: 600,
  /** Declared target values are integers in the lever's declared unit. */
  targetMin: 0,
  targetMax: 100000,
  /** Weight and claim are basis points of 100%. */
  bpMax: 10000,
  /** Marker ledger bound, same discipline as every other rule's. */
  markers: 800,
});

/** Reweight: 100% expressed in the integer unit everything is measured in. */
export const CONTRADICTION_FULL_BP = 10000;

/* ---------------------------------------------------------------- graph */

/**
 * Typed relations reused from the existing graph, never a second graph. Every
 * one of them already exists in `LINK_RELATIONS`; this module adds a node TYPE
 * and no relation.
 */
export const CONTRADICTION_RELATIONS = Object.freeze({
  /** review → the line manager whose charter it is about */
  line: 'concerns',
  /** review → the leadership ancestor it rolls up to */
  rollup: 'rolls-up-to',
  /** review → the governed decision it opened */
  decision: 'decides',
  /** review → the dated task it issued under a resequence */
  issued: 'issues-obligation',
});

/** The graph node type. */
export const CONTRADICTION_ENTITY_TYPE = 'contradiction';

/* --------------------------------------------------------------------- csv */

/**
 * CSV scope #107. Identity-free by construction: no person, no line manager id,
 * no objective title, no rationale text. A row names a KIND, a SEVERITY and the
 * declared integers that produced it — which is what a board pack can carry.
 */
export const CONTRADICTION_CSV_COLUMNS = Object.freeze([
  'row_kind', 'scope', 'altitude', 'lever_a', 'lever_b', 'direction_a', 'direction_b',
  'findings_n', 'board_shown_n', 'findings_deferred_n', 'incompatible_n', 'tension_n', 'isolated_n', 'insufficient_n',
  'undecided_n', 'accepted_n', 'resequenced_n', 'withheld_n', 'overdue_review_n',
  'caught_people_n', 'line_n', 'mandate_n', 'objective_n',
  'finding_kind', 'severity', 'state',
  'weight_a_bp', 'weight_b_bp', 'weight_sum_bp', 'materiality_bp',
  'claim_a_bp', 'claim_b_bp', 'claim_sum_bp',
  'utilisation_target_pct', 'queue_multiplier', 'utilisation_ceiling_pct',
  'review_on', 'days_to_review', 'obligation_n',
  'band', 'withheld', 'withheld_reason',
]);

/* ------------------------------------------------------------------ panels */

export const CONTRADICTION_PANELS = Object.freeze([
  Object.freeze({ key: 'board', label: 'Board', hint: 'Every contradiction in this span, worst first, with what was declared and whether a chief has ruled on it.' }),
  Object.freeze({ key: 'finding', label: 'Finding', hint: 'One finding at a time: the two charters side by side, the arithmetic that produced the severity, and the act that records a ruling.' }),
  Object.freeze({ key: 'log', label: 'Log', hint: 'Every recorded ruling, append-only, with the reason and any obligation it issued.' }),
  Object.freeze({ key: 'method', label: 'Method', hint: 'The lever taxonomy, the declared couplings, what is provable and what is not, and the conventions a chief can re-declare.' }),
]);

export const CONTRADICTION_PANEL_KEYS = Object.freeze(CONTRADICTION_PANELS.map((p) => p.key));

/**
 * Machinery finding codes for the bounded attention queue. Kept separate from
 * CONTRADICTION_FINDINGS: a finding is a property of two charters, an attention
 * code is a reason this screen wants five minutes.
 */
export const CONTRADICTION_ATTENTION = Object.freeze([
  Object.freeze({ key: 'incompatible-undecided', label: 'An incompatible pair nobody has ruled on' }),
  Object.freeze({ key: 'incentive-over', label: 'A person whose declared weights exceed 100%' }),
  Object.freeze({ key: 'envelope-overclaim', label: 'Lines claiming more than one envelope' }),
  Object.freeze({ key: 'review-overdue', label: 'An accepted contradiction past its review date' }),
  Object.freeze({ key: 'withheld-reason', label: 'A finding withheld without a direction to follow' }),
]);

/* ------------------------------------------------------------------ method */

/** Printed on the Method panel and carried in the brief. Never paraphrased. */
export const CONTRADICTION_METHOD = Object.freeze([
  Object.freeze({
    name: 'Queueing: the utilisation–lead-time law (Kingman 1961; Hopp & Spearman 2001)',
    why: 'The only coupling this module can PROVE from declared integers. At utilisation τ the expected wait-to-processing ratio is τ/(100−τ), so the last few points of utilisation are not linearly expensive — they are asymptotically expensive. Above the declared ceiling the pair is incompatible and the multiplier is printed beside it.',
  }),
  Object.freeze({
    name: 'Little’s Law (Little 1961) and the newsvendor fractile',
    why: 'Work in progress equals throughput × lead time, and service level is bought with buffer. Inventory and service level are drawn from the same stock. This is a tension, not a proof: a reshaped process moves the frontier.',
  }),
  Object.freeze({
    name: 'Cost–quality frontier and the cost of poor quality (Juran 1951)',
    why: 'Prevention spending can reduce both cost and defects, so declaring the pair impossible would be false. The audit says `tension` and names the frontier rather than pretending to a theorem.',
  }),
  Object.freeze({
    name: 'Agency and incentive alignment (Holmström & Milgrom 1991; Kerr 1975)',
    why: 'A person’s scorecard is the sum of the charters of every line they sit on. Above 100% at least one component is unachievable by construction, and on-the-wrong-metric incentives (Kerr’s “on the folly of rewarding A while hoping for B”) are a design defect in the scorecard, not a character defect in the person. Every weight is an integer in basis points so the total is checkable exactly.',
  }),
  Object.freeze({
    name: 'Common-pool resource contention (Ostrom 1990)',
    why: 'Two lines claiming shares of one budget envelope that sum above 100% is a common-pool over-allocation. Claims are integer basis points of the envelope’s own recorded ceiling, so the over-claim is arithmetic rather than opinion.',
  }),
]);

/** The ordering used to dispatch attention worst-first. Exported as data. */
export const CONTRADICTION_SEVERITY_RANK = Object.freeze({
  incompatible: 0,
  insufficient: 1,
  tension: 2,
  isolated: 3,
});
