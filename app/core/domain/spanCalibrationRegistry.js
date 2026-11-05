/**
 * app/core/domain/spanCalibrationRegistry.js — the Discretion Calibrator
 * (`#/span-calibration`, Schema v102, ADR-0100).
 *
 * THE QUESTION, AND WHY IT IS THE ONE NOBODY ANSWERS
 * -------------------------------------------------
 * The Command Chain (ADR-0075) gave this workspace an altitude axis built on
 * Jaques' time span of discretion: 7 / 30 / 90 / 180 / 365 days. That table is a
 * DECLARATION. Every escalation, every "past its own horizon" count, every
 * over-bar drift finding in the product is computed against it — and nothing has
 * ever tested it against the record the workspace itself holds.
 *
 * That is backwards. The workspace knows, for every piece of work it has ever
 * carried, the day it opened and the day it was actually decided. Those pairs are
 * a survival sample of REAL discretion per rung. This module reads them back
 * against the declared ladder and answers one question per altitude:
 *
 *   Does the span you declared match the span you actually run?
 *
 * Market position (2026): span-of-control analytics (Orgvue, Visier, Workday,
 * Viva Insights, SAP) measure the STRUCTURE — reports per manager, layers,
 * cost. Decision-latency research (JISEM 2026; the _decision latency_ working
 * model published May 2026 and explicitly labelled "not independently
 * validated") argues latency should be a first-class measure, and offers no
 * per-altitude survival estimate, no censoring, no calibration of a leadership
 * ladder and no way to feed a measured span back into routing. A survey of the
 * category finds no product whose hierarchy model is calibrated by its own
 * decision record. Vendor and literature claims are benchmarks from public
 * snippets, not audited capabilities.
 *
 * WHAT THIS MODULE REFUSES TO DO
 * ------------------------------
 *  - It never moves a declared horizon by itself. A calibration is a READING;
 *    adoption is a dated, human, append-only declaration that names the reading
 *    that justified it. The engine prints the tension; a person resolves it.
 *  - It never names, rates or ranks a person. The unit is the SPAN and the RUNG.
 *  - It never measures a sensitive source. `performanceConcerns` is excluded by
 *    name and the exclusion is printed on the page.
 *  - It never scores a median it cannot bound. A survival curve that never
 *    reaches the requested coverage has no quantile, and this module says so
 *    instead of printing the largest time it happens to have seen.
 *
 * Statistically, it is deliberately conventional and named: Kaplan–Meier (1958)
 * with Greenwood (1926) variance and a log–log transformed band, a quantile
 * obtained by inverting that band (the Brookmeyer–Crowley 1982 test-inversion
 * idea at any coverage, not only the median), a declared minimum-risk-set rule
 * so the tail is never read on three observations, and isotonic (PAVA) pooling
 * when the measured rungs cross — because a ladder that runs downhill is not a
 * ladder, and silently reordering it would be inventing an organisation.
 *
 * This file is vocabulary only: zero imports, so `schema.js`, the engine, the
 * rules, `csv.js` and the view share one canonical vocabulary.
 */

export const SPAN_ENGINE_VERSION = 'discretion-calibrator-2026.11-v1';

/* ------------------------------------------------------------------ */
/* 1. Verdicts                                                         */
/* ------------------------------------------------------------------ */

/**
 * One verdict per rung, decided on the INTERVAL, never on the point estimate.
 *
 *  calibrated   the declared span sits inside the record's interval
 *  too-narrow   the whole interval is BELOW the declared span: this rung's work
 *               closes faster than its span allows — the span is generous, and
 *               a rung holding work it could have decided is the cheap version
 *               of a bureaucracy
 *  too-wide     the whole interval is ABOVE the declared span: work at this rung
 *               routinely runs past the review horizon its own span promises —
 *               either the work belongs a rung higher, or the span is wrong
 *  insufficient the record cannot place the declared span: too few decided
 *               items, too much censoring, no observation past the span, or an
 *               interval too wide to decide anything
 */
export const SPAN_VERDICTS = Object.freeze({
  calibrated: Object.freeze({
    key: 'calibrated',
    label: 'Calibrated',
    tone: 'good',
    meaning: 'The declared span sits inside the interval this record supports. Nothing to change.',
  }),
  'too-narrow': Object.freeze({
    key: 'too-narrow',
    label: 'Declared too narrow',
    tone: 'bad',
    meaning: 'More work is still open at the declared span than the coverage promise allows: work here runs past the clock it was given, so it escalates by surprise. Either the work belongs a rung higher, or the span is wrong.',
  }),
  'too-wide': Object.freeze({
    key: 'too-wide',
    label: 'Declared too wide',
    tone: 'warn',
    meaning: 'The span allows more time than the work needs: the rung is holding work below its altitude. Either push the work down, or shorten the declared span.',
  }),
  insufficient: Object.freeze({
    key: 'insufficient',
    label: 'Not estimable',
    tone: 'neutral',
    meaning: 'The record cannot place the declared span. The reason is printed, never a point estimate.',
  }),
});

export const SPAN_VERDICT_KEYS = Object.freeze(Object.keys(SPAN_VERDICTS));

export function spanVerdictMeta(key) {
  return SPAN_VERDICTS[key] || null;
}

/* ------------------------------------------------------------------ */
/* 2. Conventions (declared, clamped, printed)                         */
/* ------------------------------------------------------------------ */

export const SPAN_DEFAULTS = Object.freeze({
  // The coverage a span implies: the share of this rung's work that should be
  // decided inside its own horizon. 85% is a convention, not a finding.
  spanCalibrationCoveragePct: 85,
  // Below this many DECIDED items at a rung, no quantile is printed.
  spanCalibrationDecidedFloor: 8,
  // At or above this censoring share at the declared horizon, the curve is
  // dominated by items that have not resolved yet: refuse rather than read it.
  spanCalibrationCensoringPct: 60,
  // The minimum number of items at risk for a tail to be read at all.
  spanCalibrationRiskFloor: 3,
  // Small-cell floor for the per-span roll-up.
  spanCalibrationCellFloor: 3,
  // Days a frozen reading waits before it is graded against post-freeze work.
  spanCalibrationReviewDays: 90,
  // The widest interval at a declared span that still supports a verdict, in
  // percentage points of "still open". Beyond it the record cannot separate the
  // declaration from noise, and the rung is refused rather than called calibrated.
  spanCalibrationMaxWidthPct: 45,
  // How far adoption may move a declared span, in either direction.
  spanCalibrationAdoptMinPct: 25,
  spanCalibrationAdoptMaxPct: 400,
  spanCalibrationAutoPropagate: true,
});

export const SPAN_LIMITS = Object.freeze({
  readings: 60,
  markers: 600,
  cohortsPerReading: 48,
  decisionsPerScan: 24,
  coverageMin: 50,
  coverageMax: 99,
  decidedFloorMin: 4,
  decidedFloorMax: 40,
  censoringPctMin: 30,
  censoringPctMax: 90,
  riskFloorMin: 2,
  riskFloorMax: 12,
  cellFloorMin: 2,
  cellFloorMax: 10,
  reviewDaysMin: 14,
  reviewDaysMax: 365,
  maxWidthPctMin: 20,
  maxWidthPctMax: 90,
  adoptMinPctMin: 10,
  adoptMinPctMax: 90,
  adoptMaxPctMin: 110,
  adoptMaxPctMax: 1000,
  // A rung's span may never exceed this multiple of the rung below it after
  // adoption: a ladder is a geometric progression of discretion, not a cliff.
  ladderStepMax: 24,
});

/* ------------------------------------------------------------------ */
/* 3. Events, rules, CSV                                               */
/* ------------------------------------------------------------------ */

export const SPAN_EVENTS = Object.freeze({
  FROZEN: 'spancalibration.frozen',
  SCAN: 'spancalibration.scan',
  ADOPTED: 'spancalibration.adopted',
});

export const SPAN_TRIGGER_PREFIX = 'spancalibration.';

export const SPAN_RULE_IDS = Object.freeze({
  register: 'RULE-SPC-01',
  falsified: 'RULE-SPC-02',
  staleness: 'RULE-SPC-03',
});

export const SPAN_CSV_SCOPE = Object.freeze({
  key: 'span-calibration',
  label: 'Discretion calibration (aggregate)',
  group: 'analytics',
  sensitive: false,
  filenameSlug: 'span-calibration',
  description: 'One row per altitude rung (declared span, decided and censored counts, censoring share, the measured span at the declared coverage with its test-inverted interval, survival at the declared span, verdict), one row per leadership span roll-up (counts only, suppressed cells blank) and one counterfactual row per rung (open items that would move rung). NO reading id, node id, person, item title, decision text or date of an individual item.',
});

/** Route aliases. `calibration` is taken by the forecast module; keep these distinct. */
export const SPAN_ROUTE_ALIASES = Object.freeze([
  'span-calibration', 'discretion', 'spancalibration', 'spancal', 'time-span',
  'ladder-calibration', 'discretion-calibrator', 'span-calibrator',
]);

/** The panel list, in reading order. */
export const SPAN_PANELS = Object.freeze([
  Object.freeze({ key: 'desk', label: 'Desk' }),
  Object.freeze({ key: 'ladder', label: 'The ladder' }),
  Object.freeze({ key: 'cohorts', label: 'The record' }),
  Object.freeze({ key: 'counterfactual', label: 'Counterfactual' }),
  Object.freeze({ key: 'rollup', label: 'Roll-up' }),
  Object.freeze({ key: 'readings', label: 'Readings' }),
]);

export const SPAN_PANEL_KEYS = Object.freeze(SPAN_PANELS.map((p) => p.key));

/* ------------------------------------------------------------------ */
/* 4. The one paragraph the screen must state                          */
/* ------------------------------------------------------------------ */

export const SPAN_PREMISE =
  'The ladder on this screen is a declaration. The curve beside it is your own record: every item this workspace carries, the day it opened and the day it was actually decided — with items still open counted as censored, not as successes. A span is calibrated when the declared horizon sits inside the interval a survival curve supports, and no span is changed here until a person dates the decision.';

export const SPAN_DISCLOSURE = Object.freeze({
  names: 'A calibration is about rungs and spans, never about people: no person is named, rated or ranked anywhere on this screen.',
  detail: 'Rung cells below the declared decided floor are refused with their reason; per-span roll-up cells below the small-cell floor are blank, never zero.',
  sources: 'Only the sources the Command Chain already counts. Individual-sensitive records (performance concerns, conflicts, pulses) are excluded by name and the exclusion is printed.',
  adoption: 'Adoption is an append-only, dated declaration naming the reading that justified it. The engine proposes; the leader decides; the workspace remembers the before and after.',
});

/** How long the adoption note stays on the chain page, in days. */
export const SPAN_ADOPTION_NOTE_DAYS = 120;
