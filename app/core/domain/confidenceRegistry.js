/**
 * app/core/domain/confidenceRegistry.js — the vocabulary of the Confidence
 * Transport Terminal (Schema v72, ADR-0064).
 *
 * A leaf module with no imports, for the same practical reason
 * `credibilityRegistry.js`, `integrityRegistry.js` and `watchRegistry.js` are
 * leaves: `schema.js` validates certificate records with this vocabulary while
 * the read model that produces them is imported by `insights.js`. Keeping the
 * words here means the normaliser, the engine, the rules and the insights
 * roll-up can never disagree about which source families exist, which rule id
 * is which, or what a verdict is called.
 *
 * THE IDEA THIS FILE ENCODES
 * --------------------------
 * Every other terminal in this workspace grades *something the leader did*.
 * This one grades the leader's measuring instrument: the probability words they
 * write into decisions, assumptions, studies, recovery plans, timing calls and
 * monitoring reviews. Those words are not neutral — they are used as inputs to
 * arithmetic elsewhere in the product (expected value, cost of carry, value of
 * information, queue forecasts). If "80%" actually resolves 62% of the time, then
 * every number built on it is wrong in a direction, systematically.
 *
 * The terminal answers three questions no leadership product answers:
 *
 *   1. What does my "80%" mean, measured on my own record? Not a personality
 *      claim — a frequency, with an interval.
 *   2. Would translating my words have helped? Measured out of sample, in the
 *      order reality arrived (prequential), not by fitting the past to itself.
 *   3. What would today's open promises read as, if the certificate travels?
 *
 * Nothing here rewrites a declaration. The declared number is the record; the
 * transported number is a second reading shown beside it, and the only thing
 * that ever changes is a decision the leader makes.
 */

export const CONFIDENCE_ENGINE_VERSION = 'confidence-transport-2026.11-v1';

/** Rule ids. Four rules on the post-commit spine (ADR-0008). */
export const CONFIDENCE_RULE_IDS = Object.freeze({
  CERTIFY: 'RULE-CTR-01',
  READ: 'RULE-CTR-02',
  GRADE: 'RULE-CTR-03',
  RECONCILE: 'RULE-CTR-04',
});

/** Lifecycle events this module publishes. */
export const CONFIDENCE_EVENTS = Object.freeze({
  SCAN: 'confidence.scan',
  FROZEN: 'confidence.certificate.frozen',
  GRADED: 'confidence.certificate.graded',
  DECLARED: 'confidence.declared',
  REFUSED: 'confidence.refused',
});

/** Signal ids contributed to the recommendation engine. */
export const CONFIDENCE_SIGNAL_IDS = Object.freeze({
  SUPPORTED: 'CFI-01',
  READ: 'CFI-02',
  LOST: 'CFI-03',
  DUE: 'CFI-04',
  THIN: 'CFI-05',
});

/** The domain label this module's own signals are filed under. */
export const CONFIDENCE_DOMAIN = 'Confidence';

/**
 * The three candidate instruments. `identity` is the leader's own words
 * unchanged, and it is the incumbent: a map has to beat it out of sample before
 * this terminal will call transport supported.
 *   - identity  p ↦ p. No parameters, so it never overfits.
 *   - platt     p ↦ σ(a·logit(p) + b). Two parameters, smooth, monotone
 *               (Platt 1999). Cannot express a non-monotone bias, which is a
 *               feature when the record is thin.
 *   - isotonic  monotone least-squares over binned declared probabilities
 *               (Zadrozny & Elkan 2002; Barlow et al. 1972). Flexible, and
 *               therefore the map most able to fit noise — which is why it is
 *               only ever chosen on an out-of-sample score, and never trusted
 *               without a frozen certificate.
 */
export const CONFIDENCE_MAPS = Object.freeze(['identity', 'platt', 'isotonic']);

export const CONFIDENCE_MAP_LABELS = Object.freeze({
  identity: 'Declared (no transport)',
  platt: 'Platt sigmoid',
  isotonic: 'Isotonic (binned)',
});

export const CONFIDENCE_MAP_SHORT = Object.freeze({
  identity: 'declared',
  platt: 'sigmoid',
  isotonic: 'isotonic',
});

/**
 * What the terminal concludes about transport. Three are refusals.
 *   - insufficient  the record cannot identify a map at all (floor not met)
 *   - no-gain       maps were fitted and none beat the declared numbers by a
 *                   material, statistically visible margin — keep your words
 *   - harmful       every fitted map did materially WORSE than the declared
 *                   numbers: correcting this record would damage it
 *   - supported     one map beat the declared numbers out of sample, with a
 *                   bootstrap interval excluding zero
 */
export const CONFIDENCE_VERDICTS = Object.freeze(['insufficient', 'no-gain', 'harmful', 'supported']);

export const CONFIDENCE_VERDICT_LABELS = Object.freeze({
  insufficient: 'Not enough settled forecasts to identify a map',
  'no-gain': 'No measurable gain — keep your numbers as written',
  harmful: 'Every map did worse than your numbers — do not transport',
  supported: 'Transport supported out of sample',
});

/**
 * Horizon bands. A 90% call due in a week and a 90% call due in a quarter are
 * not the same claim, and over a year of record they often bend differently.
 * A band is fitted on its own record only when it clears the floor; otherwise the
 * pooled map is printed beside the band and labelled as pooled.
 */
export const CONFIDENCE_BANDS = Object.freeze(['short', 'medium', 'long']);

export const CONFIDENCE_BAND_LABELS = Object.freeze({
  short: 'Short — resolved within 14 days',
  medium: 'Medium — 15 to 60 days',
  long: 'Long — over 60 days',
});

/**
 * Where declared probabilities are harvested from, and where the live ones are
 * read. One entry per module: adding a module that stores a probability and
 * later learns the answer means adding one row here and one reader in
 * `confidence.js` — never special-casing the engine. `sample` is what the
 * record contributes once settled; `live` is what it contributes while open.
 */
export const CONFIDENCE_SOURCES = Object.freeze([
  Object.freeze({
    id: 'assumptions',
    label: 'Assumption ledger',
    module: 'premises',
    route: '#/premises',
    entityType: 'premise',
    quantity: 'the declared probability that the assumption would hold',
    outcome: 'held = 1, failed = 0, inconclusive excluded',
    live: true,
  }),
  Object.freeze({
    id: 'calls',
    label: 'Decision calls',
    module: 'decisions',
    route: '#/decisions',
    entityType: 'decision',
    quantity: 'P(this works out well), recorded when the call was made',
    outcome: 'good = 1, bad = 0, mixed excluded (a half-outcome is not a binomial)',
    live: true,
  }),
  Object.freeze({
    id: 'studies',
    label: 'Impact studies',
    module: 'impact',
    route: '#/impact',
    entityType: 'impact',
    quantity: 'the expected confidence declared before the study was scored',
    outcome: 'supported = 1, not-supported = 0; pre-trend, underpowered and unmeasurable excluded',
    live: true,
  }),
  Object.freeze({
    id: 'recoveries',
    label: 'Recovery plans',
    module: 'performance',
    route: '#/performance',
    entityType: 'perfconcern',
    quantity: 'the probability frozen when a support plan was adopted',
    outcome: 'met = 1, not-met = 0, partial excluded',
    live: true,
  }),
  Object.freeze({
    id: 'timing',
    label: 'Deferral timing',
    module: 'deferral',
    route: '#/deferral',
    entityType: 'optionframe',
    quantity: 'P(the call is committed by its deadline)',
    outcome: 'committed by the deadline = 1, otherwise 0',
    live: true,
  }),
  Object.freeze({
    id: 'signals',
    label: 'Monitoring reviews',
    module: 'integrity',
    route: '#/integrity',
    entityType: 'integrityreview',
    quantity: 'P(any false alarm among the alerts in the window)',
    outcome: 'a false alarm occurred = 1, none = 0',
    live: true,
  }),
  Object.freeze({
    id: 'delivery',
    label: 'Delivery survival',
    module: 'survival',
    route: '#/survival',
    entityType: 'reading',
    quantity: 'P(this item is still open at the horizon)',
    outcome: 'still open at the horizon = 1, exited on or before it = 0; undated exits excluded',
    live: false,
  }),
]);

export const CONFIDENCE_SOURCE_IDS = Object.freeze(CONFIDENCE_SOURCES.map((s) => s.id));

export function confidenceSource(id) {
  return CONFIDENCE_SOURCES.find((s) => s.id === id) || null;
}

/**
 * Conventions. Every one is a number the leader can change, and every screen
 * that uses one prints it beside the figure it produced.
 */
export const CONFIDENCE_DEFAULTS = Object.freeze({
  confidenceAutoPropagate: true,
  // Settled forecasts needed before ANY map is fitted. Below this the terminal
  // prints counts and refuses, exactly as every other module does with small
  // samples — a calibration curve from nine points is an anecdote with axes.
  confidenceMinSamples: 24,
  // Warm-up: the first N settlements are training data only in the prequential
  // race, so every scored prediction had a real (if short) record behind it.
  confidenceMinTrain: 12,
  // Prequential test points required before a verdict is issued.
  confidenceMinScored: 16,
  // How much better than the declared numbers a map must be, in Brier points
  // (1 Brier point = 0.01), before the gain is called material rather than noise.
  confidenceMaterialBrierPct: 50,
  // The gap between a declared and a transported number that earns a flag on an
  // open record.
  confidenceGapPct: 15,
  // Certificate window, in days. The certificate is graded on the forecasts that
  // resolve inside it and never rewritten afterwards.
  confidenceReviewDays: 42,
  // Graded certificates needed before certificate skill is scored.
  confidenceSkillFloor: 4,
  // Bands: a call expected to resolve inside `shortDays` is short.
  confidenceShortDays: 14,
  confidenceLongDays: 60,
  // Bins for the isotonic map and the reliability table. Ten is the smallest
  // number that can show a two-parameter bend without putting one observation in
  // most cells; the prequential race is what decides whether the bend is real.
  confidenceBins: 10,
  // Deterministic bootstrap resamples for the paired Brier-difference interval.
  confidenceBootstrap: 800,
  // Most live readings to show per source module, and most the rules flag in a
  // single task.
  confidenceLiveCap: 6,
  confidenceTaskCap: 5,
});

export const CONFIDENCE_CLAMPS = Object.freeze({
  confidenceMinSamples: [8, 400],
  confidenceMinTrain: [4, 200],
  confidenceMinScored: [6, 400],
  confidenceMaterialBrierPct: [0, 500],
  confidenceGapPct: [5, 40],
  confidenceReviewDays: [7, 180],
  confidenceSkillFloor: [2, 40],
  confidenceShortDays: [3, 60],
  confidenceLongDays: [30, 365],
  confidenceBins: [3, 20],
  confidenceBootstrap: [100, 4000],
  confidenceLiveCap: [1, 20],
  confidenceTaskCap: [1, 20],
});

/** Storage caps, exported so the normaliser and the docs agree. */
export const CONFIDENCE_CERTIFICATE_CAP = 40;
export const CONFIDENCE_MARKER_CAP = 400;
export const CONFIDENCE_ISO_BLOCK_CAP = 16;
export const CONFIDENCE_SAMPLE_CAP = 600;

/** A harvested declaration is clamped to Cromwell bounds, never to 0 or 100. */
export const CONFIDENCE_MIN_PCT = 1;
export const CONFIDENCE_MAX_PCT = 99;

/** The bootstrap seed. Fixed, so the same record always prints the same interval. */
export const CONFIDENCE_BOOTSTRAP_SEED = 20261101;

/** The 45° identity line, drawn on every reliability chart. */
export const CONFIDENCE_IDENTITY_PCT = 100;
