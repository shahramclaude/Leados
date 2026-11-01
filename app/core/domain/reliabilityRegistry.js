/**
 * app/core/domain/reliabilityRegistry.js — leaf vocabulary for the Measurement
 * Reliability Terminal (Schema v77, ADR-0069).
 *
 * Leaf module with zero imports so `schema.js`, `reliability.js`,
 * `reliabilityRules.js`, `propagationContracts.js`, `csv.js`, `insights.js` and
 * `cases.js` share one canonical vocabulary without circular dependencies.
 *
 * THE QUESTION THIS TERMINAL ANSWERS — AND THE ONLY ONE IT MAY ANSWER
 * ------------------------------------------------------------------
 * Every people module in this workspace consumes the same two things: a manager's
 * ordinal rating of a person, and a handful of derived observations (goal
 * attainment, feedback balance, delivery timeliness). Comp, succession, promotion
 * readiness, performance support, parity and the board brief all then reason as
 * if those numbers were measurements.
 *
 * They are not measurements. They are *observations with error*, and the size of
 * that error is estimable from the record itself. So the question is:
 *
 *   "How much of what I believe about my team survives its own measurement
 *    error — and how many more observations would it take before I could
 *    defensibly tell two people apart?"
 *
 * That is a question about the leader's *instrument*, never about a person's
 * worth. The terminal therefore rates nothing and ranks nobody: it publishes a
 * variance decomposition, credibility-weighted readings with intervals, a
 * partial order (tiers the evidence supports, not a leaderboard), a decision
 * study, and an explicit refusal wherever the record cannot separate two people.
 *
 * CROSS-DOMAIN FOUNDATIONS ENCODED IN THIS VOCABULARY
 * ---------------------------------------------------
 *  - **Generalizability theory** (Cronbach, Gleser, Nanda & Rajaratnam 1972;
 *    Brennan 2001): a score is a sample from a universe of admissible
 *    observations. Variance is decomposed across facets — *person*
 *    (the object of measurement) and *occasion* (the review cycle) — and the
 *    G-coefficient is the ratio that survives for a stated decision. A **D-study**
 *    then asks how many occasions a decision needs.
 *  - **Intraclass correlation** (Shrout & Fleiss 1979; McGraw & Wong 1996):
 *    ICC(1) for the one-way random-effects model, with the Shrout–Fleiss
 *    confidence interval and the F test of τ² = 0.
 *  - **Spearman–Brown (1910) prophecy**: the reliability of the mean of k
 *    observations, ρ_k = kρ / (1 + (k−1)ρ), and its inverse for the sample a
 *    decision requires.
 *  - **Actuarial credibility** (Bühlmann 1967; Bühlmann & Straub 1970;
 *    Bailey 1963): a person's own mean earns credibility Z = n/(n + K) with
 *    K = σ²_within / τ²_between. The complement (1 − Z) is the team's mean. This
 *    is the same arithmetic insurers have used for a century to price a risk
 *    with a thin record, and it is exactly what a manager needs before
 *    differentiating pay on three reviews.
 *  - **Empirical Bayes / shrinkage** (James & Stein 1961; Efron & Morris 1975):
 *    the posterior mean under a normal–normal hierarchy is the credibility
 *    estimate, and its variance is 1/(1/τ² + n/σ²). Shrinkage is not a
 *    judgement about a person; it is the arithmetic of small samples.
 *  - **Regression to the mean** (Galton 1886; Kahneman 2011; Mauboussin 2012):
 *    the expected next observation for a selected extreme is
 *    μ + ρ(x − μ). A star regressing is not a star declining.
 *  - **Minimum detectable effect / statistical power** (Cascio & Aguinis 2011;
 *    Cohen 1988): with n observations per person, a two-person comparison of
 *    within-person standard deviation σ can only detect gaps near
 *    2·(z_{1−α/2} + z_{power})·σ/√n. A calibration conversation that cannot see
 *    the gap is a conversation about noise.
 *  - **Fairness as measurement, not sentiment** (Murphy & DeShon 2000;
 *    Sackett, Zhang, Berry & Lievens 2022; Viswesvaran, Schmidt & Ones 2005):
 *    supervisory ratings carry systematic rater effects, so an interrater
 *    correlation is not a reliability coefficient. The terminal says so and
 *    never forms a composite from instruments it has not shown to converge.
 *
 * WHAT THIS TERMINAL WILL NEVER DO
 * --------------------------------
 *  - Score, grade, rank or profile a person. No stored record names a person's
 *    "true" performance, potential, or league position.
 *  - Print a leaderboard. The output is a *partial order* (tiers), and the pairs
 *    inside a tier are printed as indistinguishable on purpose.
 *  - Compute a composite score across instruments that do not converge.
 *  - Take an adverse action. It can open a governed decision for the leader and
 *    a blameless process task; it cannot change a rating, pay, role or status.
 *  - Infer anything from prose, sentiment, demographics or protected
 *    characteristics. Instruments are declared, ordinal or bounded, and nothing
 *    else enters the model.
 */

export const RELIABILITY_ENGINE_VERSION = 'measurement-reliability-2026.11-v1';

export const RELIABILITY_RULE_IDS = Object.freeze({
  CAPTURE: 'RULE-REL-01',
  QUALIFY: 'RULE-REL-02',
  TEMPER: 'RULE-REL-03',
  CONVERGE: 'RULE-REL-04',
  RECONCILE: 'RULE-REL-05',
});

export const RELIABILITY_EVENTS = Object.freeze({
  OBSERVED: 'reliability.observation',
  FROZEN: 'reliability.frozen',
  SCAN: 'reliability.scan',
  QUALIFIED: 'reliability.qualified',
});

/**
 * Instruments. `review` is the only one with a declared, bounded, comparable
 * scale across people and cycles, so it is the only one the variance
 * decomposition and the credibility model may use. The other three are
 * *convergence instruments*: they are correlated against `review` to test
 * whether the leader's instruments are measuring the same construct. Using
 * them inside the model would mix constructs and manufacture precision.
 */
export const RELIABILITY_INSTRUMENTS = Object.freeze(['review', 'goal', 'feedback', 'delegation']);

export const RELIABILITY_INSTRUMENT_META = Object.freeze({
  review: Object.freeze({
    label: 'Performance review rating',
    scale: '4-point declared scale, mapped to 0 … 1',
    source: 'reviews (completed, with a manager rating)',
    facet: 'occasion = review period end',
    role: 'primary',
    note: 'The only instrument with a fixed, comparable scale, so it is the only one allowed to carry the model.',
  }),
  goal: Object.freeze({
    label: 'Goal attainment',
    scale: 'mean key-result progress, 0 … 100%',
    source: 'goals (person-scoped, with key results)',
    facet: 'no occasion — one reading per person',
    role: 'convergence',
    note: 'Measures delivery against declared objectives, not behaviour. Correlated, never pooled.',
  }),
  feedback: Object.freeze({
    label: 'Feedback balance',
    scale: 'share of praise in given feedback, 0 … 1',
    source: 'feedback (direction: given)',
    facet: 'no occasion',
    role: 'convergence',
    note: 'Measures what the leader chose to write down, which is a record of attention as much as of behaviour.',
  }),
  delegation: Object.freeze({
    label: 'Delivery timeliness',
    scale: 'share delivered on or before the due date, 0 … 1',
    source: 'delegations (terminal records with a due date)',
    facet: 'no occasion',
    role: 'convergence',
    note: 'Measures whether work landed on time, under the difficulty the leader assigned.',
  }),
});

/** Verdict ladder for the instrument. Ordered from strongest claim to refusal. */
export const RELIABILITY_VERDICTS = Object.freeze([
  'insufficient',
  'unbalanced',
  'noise-dominated',
  'weakly-separable',
  'separable',
  'strongly-separable',
]);

export const RELIABILITY_VERDICT_META = Object.freeze({
  insufficient: Object.freeze({
    label: 'Too thin to say anything',
    tone: 'neutral',
    summary: 'Counts are printed; no variance component, coefficient or reading is estimated.',
  }),
  unbalanced: Object.freeze({
    label: 'Design too unbalanced to decompose',
    tone: 'neutral',
    summary: 'The record has people with very different numbers of observations. The decomposition is refused rather than reported with an interval it cannot support.',
  }),
  'noise-dominated': Object.freeze({
    label: 'Mostly noise',
    tone: 'bad',
    summary: 'Within-person variation is as large as between-person variation. The differences you can see are mostly not there to see.',
  }),
  'weakly-separable': Object.freeze({
    label: 'Weakly separable',
    tone: 'caution',
    summary: 'Some real between-person signal exists, but adjacent people cannot be told apart at the declared bar.',
  }),
  separable: Object.freeze({
    label: 'Separable for a decision',
    tone: 'good',
    summary: 'The instrument supports distinguishing people at the declared separation bar, with tiers named rather than ranks printed.',
  }),
  'strongly-separable': Object.freeze({
    label: 'Strongly separable',
    tone: 'good',
    summary: 'Between-person variance dominates. Even a single observation carries most of the ranking, and the tiers are stable.',
  }),
});

export const RELIABILITY_LIMITS = Object.freeze({
  maxReadings: 60,
  maxMarkers: 4000,
  maxHistory: 40,
  maxLabel: 160,
  maxNotes: 800,
  // Evidence floors. Every one is printed beside the figure it withholds.
  minPersons: 4,
  minObservations: 12,
  minObsPerPerson: 2,
  minOccasions: 2,
  // The design is refused when the largest person's observation count exceeds
  // this multiple of the median. Above it, the method-of-moments coefficient is
  // dominated by one person and the interval would lie.
  maxImbalanceRatio: 3,
  // Convergence needs enough people for a rank correlation to mean anything.
  // Two items per person is deliberate: thin per-person evidence *attenuates* a
  // rank correlation toward zero, so it can hide a real relationship but cannot
  // invent one. The bias therefore runs toward refusing convergence, which is
  // the safe direction, and the report says so beside the figure.
  minConvergencePersons: 5,
  minConvergencePerPerson: 2,
  convergenceAlpha: 0.05,
  // Separation: the posterior probability two adjacent people differ that the
  // leader must demand before the terminal calls them separable.
  separationPct: 90,
  // Reliability the decision study aims at (Spearman–Brown target).
  targetReliabilityPct: 80,
  // The declared separability floor for the instrument as a whole (ICC).
  iccFloorPct: 50,
  // Decision study: two-person comparison.
  alpha: 0.05,
  power: 0.8,
  // A surprise is a rating at least this far (in rating points on the 4-point
  // scale) from the person's credibility reading before the terminal asks the
  // leader to verify it with one more observation.
  surprisePoints: 1,
  // RULE-REL-02 opens at most one governed decision per this many days.
  qualifyEveryDays: 7,
  // Grading: a frozen reading needs at least this many new observations inside
  // its window to be graded rather than lapsed.
  minNewObservations: 4,
});

/** The rating scale is declared, not inferred: 4 ordered levels mapped to [0,1]. */
export const REVIEW_SCALE_POINTS = Object.freeze([0, 1 / 3, 2 / 3, 1]);

export function reviewRatingValue(rating) {
  const index = ['needs-development', 'meets-expectations', 'often-exceeds', 'sets-standard'].indexOf(rating);
  return index >= 0 ? REVIEW_SCALE_POINTS[index] : null;
}

export function ratingPointFromValue(value) {
  if (!Number.isFinite(value)) return null;
  let best = 0;
  for (let i = 1; i < REVIEW_SCALE_POINTS.length; i += 1) {
    if (Math.abs(REVIEW_SCALE_POINTS[i] - value) < Math.abs(REVIEW_SCALE_POINTS[best] - value)) best = i;
  }
  return best;
}

/** Named signals surfaced in the `Measurement reliability` Insights bucket. */
export const RELIABILITY_SIGNAL_IDS = Object.freeze([
  'REL-01',
  'REL-02',
  'REL-03',
  'REL-04',
  'REL-05',
  'REL-06',
]);

export const RELIABILITY_BLAME_PATTERN = /\b(careless|lazy|incompetent|negligent|stupid|blamed?|fault of|human error|sloppy|poor performer|dead ?weight|low ?performer)\b/i;

export function hasReliabilityBlameLanguage(text) {
  return typeof text === 'string' && RELIABILITY_BLAME_PATTERN.test(text);
}

export const RELIABILITY_RULES = Object.freeze([
  {
    id: RELIABILITY_RULE_IDS.CAPTURE,
    name: 'Observation capture',
    framework: 'Generalizability theory (Cronbach et al. 1972) — facet bookkeeping',
    trigger: 'review.completed / reliability.scan',
    targetModule: 'reliabilityMarkers',
    description: 'Records that one completed review entered the observation set, once and only once, so the design (people × occasions) is auditable and a reopened-then-recompleted review is never counted twice.',
  },
  {
    id: RELIABILITY_RULE_IDS.QUALIFY,
    name: 'Differentiation qualification',
    framework: 'Bühlmann (1967) credibility & Leventhal (1980) consistency',
    trigger: 'reliability.scan',
    targetModule: 'decisions / delegations',
    description: 'When the instrument is below its declared separability floor while the workspace is being asked to differentiate (a merit cycle exists, or tiers were recorded), opens exactly one governed DACI decision per week and one blameless process task. Never a finding about a person.',
  },
  {
    id: RELIABILITY_RULE_IDS.TEMPER,
    name: 'Surprise guard',
    framework: 'Kahneman (2011) regression to the mean & Efron–Morris (1975) shrinkage',
    trigger: 'review.completed',
    targetModule: 'reviews / delegations',
    description: 'When a new rating sits a full scale point or more away from that person’s credibility-weighted reading, appends a dated advisory note to the review and opens one owned verification task. The rating itself is never rewritten.',
  },
  {
    id: RELIABILITY_RULE_IDS.CONVERGE,
    name: 'Instrument convergence watch',
    framework: 'Construct validity (Cronbach & Meehl 1955)',
    trigger: 'reliability.scan',
    targetModule: 'delegations',
    description: 'When two instruments that are supposed to describe the same people rank them differently (or not at all), opens one blameless process task and states that no composite score will be formed. At most once a month.',
  },
  {
    id: RELIABILITY_RULE_IDS.RECONCILE,
    name: 'Ledger reconciliation & grading',
    framework: 'Brier (1950) proper scoring of the instrument’s own forecast',
    trigger: 'reliability.scan',
    targetModule: 'links / reliabilityReadings',
    description: 'Drops observation markers whose review no longer exists, repairs dangling edges, and grades a frozen reading once its window closes — or lapses it when too few new observations arrived. A window that closes empty is never credited.',
  },
]);

/** Relations written only by the rule spine, never asserted by hand. */
export const RELIABILITY_RELATIONS = Object.freeze({
  QUALIFIES: 'qualifies-differentiation',
  TEMPERS: 'tempers-rating',
});

export const RELIABILITY_RELATION_LABELS = Object.freeze({
  'qualifies-differentiation': 'Qualifies the differentiation being asked for',
  'tempers-rating': 'Tempered by the instrument’s own reliability',
});
