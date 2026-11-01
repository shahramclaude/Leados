/**
 * app/core/domain/credibilityRegistry.js — the vocabulary of the Borrowed
 * Evidence Engine (Schema v71, ADR-0062).
 *
 * A leaf module with no imports, for the same practical reason
 * `integrityRegistry.js` and `watchRegistry.js` are leaves: `schema.js` must
 * validate credibility records, and the read model that produces them is
 * imported by `insights.js`. Keeping the vocabulary here means the normaliser,
 * the engine and the insights roll-up can never disagree about which groups
 * exist, which rule id is which, or what a regime is called — and it breaks the
 * import cycle that would otherwise exist (insights → credibility → schema →
 * insights).
 *
 * THE IDEA THIS FILE ENCODES
 * --------------------------
 * By Session 100 the workspace held dozens of small samples, each of which its
 * own terminal correctly refused to judge: "too few verdicts", "below the
 * floor", "insufficient". Correct, and useless. A pile of small samples that
 * measure *the same kind of thing* is exactly what a hierarchical model is for:
 * each unit borrows strength from the pool, by an amount the data determines,
 * and the leader is told how much of each number is theirs.
 *
 * A `group` is the exchangeability class — the set of units that a leader is
 * willing to claim are draws from one Beta distribution. That claim cannot be
 * read off the data, so it is made structural here and printed on the page; the
 * engine will not pool across groups, ever.
 *
 * Each group declares the ONE Bernoulli quantity its units measure. Two
 * different quantities (a detector's truth rate and a delegation's on-time
 * rate) are never mixed, because a pool of unlike things is not a prior, it is
 * an average.
 */

export const CREDIBILITY_ENGINE_VERSION = 'borrowed-evidence-2026.10-v1';

/** Rule ids. Three rules on the post-commit spine (ADR-0008). */
export const CREDIBILITY_RULE_IDS = Object.freeze({
  GRADUATE: 'RULE-CRE-01',
  GOVERN: 'RULE-CRE-02',
  GRADE: 'RULE-CRE-03',
});

/** Lifecycle events this module publishes. */
export const CREDIBILITY_EVENTS = Object.freeze({
  SCAN: 'credibility.scan',
  FROZEN: 'credibility.frame.frozen',
  GRADED: 'credibility.frame.graded',
  DECLARED: 'credibility.declared',
  REFUSED: 'credibility.refused',
});

/** Signal ids contributed to the recommendation engine. */
export const CREDIBILITY_SIGNAL_IDS = Object.freeze({
  BORROWED: 'CRE-01',
  LOST: 'CRE-02',
  HETEROGENEOUS: 'CRE-03',
  INFLUENTIAL: 'CRE-04',
  DUE: 'CRE-05',
});

/** The domain label this module's own signals are filed under. */
export const CREDIBILITY_DOMAIN = 'Credibility';

/**
 * The regimes a group can be in. Three are refusals; three describe what the
 * posterior actually does with the evidence, read from the mean credibility
 * weight E[Z] across the units — never from a significance test, because "the
 * test could not detect spread" is a statement about power, not about how much
 * each unit's estimate is its own.
 *   - `no-units`    fewer units than the floor: there is no pool to estimate
 *   - `too-thin`    too few outcomes across the group to fit a prior
 *   - `degenerate`  every unit sits at 0% or 100%: no Beta fits, and under the
 *                   hyperprior the posterior would be improper
 *   - `pool-led`    mean E[Z] under 40%: the pool carries most of every number
 *   - `balanced`    mean E[Z] from 40% to 70%: part own record, part pool
 *   - `own-led`     mean E[Z] over 70%: units differ, so each estimate is
 *                   mostly its own record and borrowing mainly narrows it
 * Heterogeneity (Pearson χ² with I²) is reported beside the regime as its own
 * test and is what the exchangeability governance rule reads.
 */
export const CREDIBILITY_REGIMES = Object.freeze([
  'no-units', 'too-thin', 'degenerate', 'pool-led', 'balanced', 'own-led',
]);

export const CREDIBILITY_REGIME_LABELS = Object.freeze({
  'no-units': 'No pool — too few units to estimate one',
  'too-thin': 'No pool — too few outcomes to fit a prior',
  degenerate: 'No pool — every unit sits at 0% or 100%',
  'pool-led': 'Pool-led — the pool carries most of every estimate',
  balanced: 'Balanced — each estimate is part own record, part pool',
  'own-led': 'Own-led — units differ, so each estimate is mostly its own record',
});

/** Whether a regime permits borrowing at all. */
export const BORROWING_REGIMES = Object.freeze(['pool-led', 'balanced', 'own-led']);

/** Mean-E[Z] cut points between the three borrowing regimes. */
export const REGIME_Z_CUTS = Object.freeze({ poolLed: 0.4, ownLed: 0.7 });

/**
 * The three evidence groups. `source` names the ledger each adapter reads; the
 * adapter itself lives in `credibility.js`, so a new module plugs in by adding
 * one entry here and one reader there — never by special-casing the engine.
 */
export const CREDIBILITY_GROUPS = Object.freeze([
  Object.freeze({
    id: 'detectors',
    label: 'Signal families',
    groupLabel: 'The detector suite',
    unitLabel: 'family',
    unitPlural: 'families',
    quantity: 'actionable precision — of the decisive verdicts, the share that were worth acting on',
    shortQuantity: 'actionable precision',
    source: 'Signal Integrity Board verdicts and early-warning triage',
    // The SAME quantity the Signal Integrity Board scores, against the SAME
    // declared floor (`integrityPrecisionFloorPct`), so the Board's "too few
    // verdicts" and this engine's borrowed estimate are two readings of one
    // question rather than two different questions that happen to share a page.
    successDefinition: 'the verdict was “confirmed”; a “false alarm” is a failure; “explained” and “dismissed” are excluded from the denominator exactly as the Board excludes them',
    floorSetting: 'integrityPrecisionFloorPct',
    floorDefault: 60,
  }),
  Object.freeze({
    id: 'premises',
    label: 'Assumption classes',
    groupLabel: 'The assumption ledger',
    unitLabel: 'criticality class',
    unitPlural: 'criticality classes',
    quantity: 'share of settled assumptions that held',
    shortQuantity: 'assumption hold rate',
    source: 'date-stamped premise outcomes (held / failed)',
    successDefinition: 'the premise settled as “held”; inconclusive outcomes are excluded, not counted as failure',
    floorSetting: 'credibilityPremiseFloorPct',
    floorDefault: 70,
  }),
  Object.freeze({
    id: 'delegation',
    label: 'Authority classes',
    groupLabel: 'The delegation ledger',
    unitLabel: 'authority class',
    unitPlural: 'authority classes',
    quantity: 'share of closed delegations delivered by their due date',
    shortQuantity: 'on-time completion rate',
    source: 'closed delegations that carried a due date',
    successDefinition: 'completed on or before the recorded due date; returned work and work already past its due date count as not delivered; work not yet due is censored, never counted either way',
    floorSetting: 'credibilityDelegationFloorPct',
    floorDefault: 70,
  }),
]);

export const CREDIBILITY_GROUP_IDS = Object.freeze(CREDIBILITY_GROUPS.map((g) => g.id));

export function credibilityGroup(groupId) {
  return CREDIBILITY_GROUPS.find((g) => g.id === groupId) || null;
}

/**
 * Conventions. Every one of these is a number the leader can change, and every
 * page that uses one prints it beside the figure it produced.
 */
export const CREDIBILITY_DEFAULTS = Object.freeze({
  credibilityAutoPropagate: true,
  // The posterior probability a borrowed verdict must reach before the engine
  // calls a unit above or below its floor. 95% is deliberately strict: a
  // borrowed number is allowed to speak early, never loosely.
  credibilityDecisivePct: 95,
  // Own-data verdicts below this many decisive observations are "insufficient"
  // — the same refusal every terminal already prints. Borrowing exists for
  // exactly these units.
  credibilityMinUnitN: 4,
  // The heterogeneity screen's alpha. Below this, between-unit spread is read
  // as real rather than as sampling noise.
  credibilityHeterogeneityAlphaPct: 5,
  // Higgins & Thompson's "substantial" I² convention.
  credibilityI2WarnPct: 50,
  // How far another unit's estimate may move when ONE unit is removed from the
  // hyperprior before the pool is called "carried by one unit".
  credibilityInfluenceTolerancePct: 15,
  credibilityMinUnits: 3,
  credibilityMinObservations: 8,
  credibilityHorizonN: 8,
  credibilityReviewDays: 28,
  credibilitySkillFloor: 6,
  credibilitySurpriseBrier: 0.25,
  credibilityPremiseFloorPct: 70,
  credibilityDelegationFloorPct: 70,
  // Delegations due within this many days are the ones a checkpoint can still
  // change; later ones are forecast but not acted on.
  credibilityCheckpointDays: 21,
});

export const CREDIBILITY_CLAMPS = Object.freeze({
  credibilityDecisivePct: [80, 99],
  credibilityMinUnitN: [2, 20],
  credibilityHeterogeneityAlphaPct: [1, 20],
  credibilityI2WarnPct: [25, 90],
  credibilityInfluenceTolerancePct: [5, 50],
  credibilityMinUnits: [3, 12],
  credibilityMinObservations: [4, 200],
  credibilityHorizonN: [1, 40],
  credibilityReviewDays: [7, 120],
  credibilitySkillFloor: [3, 40],
  credibilitySurpriseBrier: [0.05, 0.49],
  credibilityPremiseFloorPct: [20, 95],
  credibilityDelegationFloorPct: [20, 95],
  credibilityCheckpointDays: [3, 90],
});

/** Storage caps, exported so the normaliser and the docs agree. */
export const CREDIBILITY_FRAME_CAP = 40;
export const CREDIBILITY_DECLARATION_CAP = 24;
export const CREDIBILITY_MARKER_CAP = 400;

/** The credibility weights the graduation panel always prints. */
export const CREDIBILITY_Z_TARGETS = Object.freeze([50, 80]);

/** A frame forecast is a probability; these are the Cromwell bounds. */
export const CREDIBILITY_MIN_PCT = 0.5;
export const CREDIBILITY_MAX_PCT = 99.5;
