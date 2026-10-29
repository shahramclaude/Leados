/**
 * app/core/domain/payVocabulary.js — the closed vocabularies for Schema v51.
 *
 * This file exists to break an import cycle, and the cycle is worth explaining
 * because it is structural rather than accidental:
 *
 *   schema.js  →  paySchema.js  →  pay.js  →  schema.js
 *
 * `schema.js` owns the data contract and normalises loaded workspaces, so it must
 * import the store-side normalisers. `pay.js` needs the level and rating
 * vocabularies that live in `schema.js`. Without a shared leaf module, one of the
 * two would evaluate a constant before it was initialised.
 *
 * Every value here is a literal frozen list. Nothing in this module imports
 * anything, so it can be loaded first by any participant without ordering risk.
 */

export const PAY_GROUPS = Object.freeze([
  { id: 'woman', label: 'Woman' },
  { id: 'man', label: 'Man' },
  { id: 'other', label: 'Another recorded group' },
  { id: 'undisclosed', label: 'Recorded as not to be analysed' },
  { id: 'unrecorded', label: 'Not recorded' },
]);

export const PAY_GROUP_IDS = Object.freeze(PAY_GROUPS.map((row) => row.id));
export const PAY_GROUP_BY_ID = Object.freeze(Object.fromEntries(PAY_GROUPS.map((row) => [row.id, row])));
/** Groups that may be placed in a contrast. `unrecorded`/`undisclosed` never are. */
export const PAY_CONTRAST_GROUPS = Object.freeze(['woman', 'man', 'other']);

export const PAY_REASONS = Object.freeze([
  { id: 'hire', label: 'Starting pay' },
  { id: 'promotion', label: 'Promotion or level change' },
  { id: 'merit', label: 'Merit or annual review' },
  { id: 'market', label: 'Market or retention adjustment' },
  { id: 'correction', label: 'Correction' },
  { id: 'other', label: 'Other' },
]);
export const PAY_REASON_IDS = Object.freeze(PAY_REASONS.map((row) => row.id));

export const PAY_AUDIT_STATUSES = Object.freeze(['draft', 'filed']);
export const MERIT_ROUND_STATUSES = Object.freeze(['declared', 'committed', 'cancelled']);

/** The Directive's own threshold. Shown as law, not as a tunable convention. */
export const EUR_DIRECTIVE_JPA_GAP_PCT = 5;

/**
 * Minimum cohort for a modelled gap. Below this the interval is so wide that the
 * point estimate is decorative, and above five controls a ten-person team has
 * almost no residual degrees of freedom to estimate a variance with.
 */
export const PAY_MIN_COHORT = 8;
export const PAY_MIN_PER_GROUP = 3;
export const PAY_MAX_CONTROLS = 6;

/** A pay record older than this is flagged as stale (a convention, not a law). */
export const PAY_STALE_DAYS_DEFAULT = 365;

export const PAY_SIGNAL_IDS = Object.freeze({
  GAP: 'PAY-01',
  JPA: 'PAY-02',
  BELOW_MIN: 'PAY-03',
  COVERAGE: 'PAY-04',
  MERIT_WIDENS: 'PAY-05',
});

/** Default merit matrix: a multiplier applied to the round's base percentage. */
export const DEFAULT_MERIT_MATRIX = Object.freeze({
  'sets-standard': 1.4,
  'often-exceeds': 1.2,
  'meets-expectations': 1,
  'needs-development': 0.4,
  '': 0,
});
