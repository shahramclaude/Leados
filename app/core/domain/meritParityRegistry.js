/**
 * app/core/domain/meritParityRegistry.js — the declared vocabulary of the Matrix
 * Merit Pool Stewardship & Cohort Parity Reading (ADR‑0154, Schema v128 unchanged,
 * `#/merit?panel=matrix`, CSV scope #116).
 *
 * THE DUTY, IN THE OPERATOR'S WORDS. It is the first week of November and the
 * merit pool is being finalised. Sam sits on two lines: Dana's functional team
 * (her home line, which sets pay) and Priya's migration programme. Priya's line
 * also declared the `pay` right when it was set up, because in that programme a
 * pay decision without the delivery manager in the room was always wrong. Nobody
 * has ever put the two declarations next to a pay decision. The cycle reads
 * "inside budget, no finding", Sam gets 2.5% while the rest of Dana's team gets
 * 4%, and there is no surface in the product that says: *the people carrying a
 * second line were paid differently from the people who were not, and in this
 * cycle nobody can say who owned that decision*.
 *
 * That is the "matrix tax": the systematic under-recognition of people whose
 * work is visible to two managers and attributable to neither. It is not
 * misconduct and it is not a person's performance — it is an accounting
 * artefact of a structure that reports headcount by home line and money by
 * whatever line happens to hold the pay right.
 *
 * WHAT THIS REGISTRY DECLARES (and what it never computes)
 * -------------------------------------------------------
 *  - The TWO COHORTS: a pay row is `matrix` when the person sat on more than one
 *    reporting line on the day the money takes effect, and `single-line`
 *    otherwise. The classification is read from the shared matrix engine at that
 *    DATE, never from today's shape.
 *  - The PAY-AUTHORITY reading: how many distinct managers held the declared
 *    `pay` right for that person on that date — `clear` (exactly one), `contested`
 *    (two or more), `unowned` (nobody; printed, never repaired).
 *  - A DECLARED CELL FLOOR (3 people per cohort) below which no median and no gap
 *    is printed at all. A two-person cohort is an anecdote, not a rate.
 *  - A DECLARED PRACTICAL-SIGNIFICANCE BAND (50 basis points, i.e. half a
 *    percentage point) inside which the two cohort medians read `parity`. The
 *    band is a CONVENTION, printed so a reader can disagree with it explicitly;
 *    it is not fitted to this workspace and is never described as statistical
 *    significance.
 *  - The exact integer arithmetic of every figure (basis points from integer
 *    cents, lower median for even counts, truncated division with the remainder
 *    FLAGGED rather than rounded away).
 *  - The verdict ladders and their precedence, so the panel, the brief and the
 *    CSV cannot disagree about a word.
 *
 * FRAMEWORK BASIS. Holmström & Milgrom (1991) multi-task agency: when a person's
 * output is observed by two principals who each own part of the signal, effort
 * is allocated to the task whose principal can reward it, and the un-rewarded
 * task is quietly starved — the mechanism, not the motive. Baker, Gibbons &
 * Murphy (1994) subjective performance measurement: pay attached to a supervisor
 * who sees only part of the job prices the part they see. Oaxaca (1973) /
 * Blinder (1973) as the discipline this reading deliberately does NOT claim: it
 * prints an UNADJUSTED descriptive gap and says so, because an adjusted
 * decomposition on three people per cell is a computation, not a finding.
 * Goold & Campbell (1993) on matrix design costs and Galbraith (1973) on
 * information processing as the reason a second line is expensive at all.
 * Statistical disclosure control (cell floors, never zero for withheld) follows
 * the same house convention as ADR‑0139 and ADR‑0126.
 */

export const MERIT_PARITY_ENGINE_VERSION = 'merit-parity-2026.11-v2';

/* ------------------------------------------------------------- conventions */

/**
 * The declared conventions. Printed on the panel and in every brief. There are
 * no workspace settings for them on purpose: a floor and a tolerance that can be
 * lowered until the reading agrees with the reader are not a check.
 */
export const MERIT_PARITY_CONVENTIONS = Object.freeze({
  /** Minimum people per cohort before a median, a gap or a pool share is printed. */
  cellFloor: 3,
  /** |gap| below this many basis points reads `parity`. Declared, never fitted. */
  toleranceBps: 50,
  /** Even counts use the LOWER median: an integer, never an interpolated recruit. */
  median: 'lower',
  /** One basis point = one hundredth of a percentage point of the person's pay. */
  basis: 'basis-points',
});

export const MERIT_PARITY_FLOOR = MERIT_PARITY_CONVENTIONS.cellFloor;
export const MERIT_PARITY_TOLERANCE_BPS = MERIT_PARITY_CONVENTIONS.toleranceBps;

/** Bounded read: at most this many pay rows are read for one cycle. */
export const MERIT_PARITY_LIMITS = Object.freeze({ rows: 500, levels: 6, findings: 60 });

/* ----------------------------------------------------------------- cohorts */

export const MERIT_PARITY_COHORTS = Object.freeze([
  Object.freeze({
    key: 'matrix',
    label: 'Second line',
    hint: 'The person sat on more than one reporting line on the day this money takes effect.',
  }),
  Object.freeze({
    key: 'single-line',
    label: 'Home line only',
    hint: 'The person sat on one reporting line on that day. The comparison group, not the norm.',
  }),
]);

export const MERIT_PARITY_COHORT_KEYS = Object.freeze(MERIT_PARITY_COHORTS.map((c) => c.key));
const COHORT_BY_KEY = new Map(MERIT_PARITY_COHORTS.map((c) => [c.key, c]));
export function meritParityCohort(key) {
  return COHORT_BY_KEY.get(String(key || '')) || null;
}

/* --------------------------------------------------------------- authority */

/**
 * Pay-authority states, WORST FIRST. `unknown` outranks `unowned`, and `unowned`
 * outranks `contested`: a contested right at least means two people believe they
 * own the decision, while an unowned one means the money moved with no declared
 * authority, and an unknown one means the structure could not be read at all.
 */
export const MERIT_PARITY_AUTHORITY_STATES = Object.freeze([
  Object.freeze({
    key: 'unknown',
    label: 'Pay authority cannot be read',
    rank: -1,
    tone: 'bad',
    detail: 'A recipient is not on the roster, a row has no readable recipient, or the bounded read omitted decisions; the full set of pay authorities cannot be read. This is an UNKNOWN, never an unowned right and never a cleared one.',
  }),
  Object.freeze({
    key: 'unowned',
    label: 'No line holds the pay right',
    rank: 0,
    tone: 'bad',
    detail: 'Not one declared line for this person carries the `pay` right on the day the money takes effect. The decision exists and no line is accountable for it.',
  }),
  Object.freeze({
    key: 'contested',
    label: 'Two or more lines hold the pay right',
    rank: 1,
    tone: 'warn',
    detail: 'More than one manager declared the `pay` right for this person. Both may believe they own the decision; this reading names the ambiguity and never picks a winner.',
  }),
  Object.freeze({
    key: 'clear',
    label: 'One line holds the pay right',
    rank: 2,
    tone: 'good',
    detail: 'Exactly one declared line carries the `pay` right on the effective date.',
  }),
]);

const AUTHORITY_BY_KEY = new Map(MERIT_PARITY_AUTHORITY_STATES.map((s) => [s.key, s]));
export function meritParityAuthorityState(key) {
  return AUTHORITY_BY_KEY.get(String(key || '')) || null;
}

/** The right this module reads. It is the matrix register's own right key. */
export const MERIT_PARITY_RIGHT = 'pay';

/* ----------------------------------------------------------------- verdicts */

/**
 * The PARITY ladder, declared precedence top to bottom. It answers one question:
 * *is there a printed, supportable difference between the two cohorts?* — not
 * "is this fair". `incomplete` deliberately outranks every substantive reading:
 * an unpriced row, an empty cohort or a pool that moved no money all mean the
 * comparison cannot be made, and a partial comparison rendered as a whole one is
 * the failure this module exists to refuse.
 */
export const MERIT_PARITY_VERDICTS = Object.freeze([
  Object.freeze({
    key: 'no-cycle',
    label: 'No merit cycle to read',
    rank: 0,
    tone: 'neutral',
    open: false,
    detail: 'There is no merit cycle in this workspace, so there is no pay decision and no cohort to compare.',
  }),
  Object.freeze({
    key: 'single-line',
    label: 'No second-line pay decision',
    rank: 1,
    tone: 'neutral',
    open: false,
    detail: 'Nobody in this cycle sat on a second reporting line on the effective date. There is no matrix cohort and no difference to read — a different claim than “the pool treats the matrix fairly”.',
  }),
  Object.freeze({
    key: 'incomplete',
    label: 'The comparison cannot be made',
    rank: 2,
    tone: 'warn',
    open: true,
    detail: 'At least one figure the comparison needs is missing or too thin to print: a cohort below the declared cell floor, a pay row with no price, or a pool that moved no money. No gap and no parity claim is printed.',
  }),
  Object.freeze({
    key: 'divergent',
    label: 'The cohorts were paid differently',
    rank: 3,
    tone: 'warn',
    open: true,
    detail: 'The two cohort medians differ by at least the declared practical-significance band. This is a DESCRIPTIVE, UNADJUSTED difference and it is not a finding of unfairness or of causation.',
  }),
  Object.freeze({
    key: 'parity',
    label: 'No difference past the declared band',
    rank: 4,
    tone: 'neutral',
    open: false,
    detail: 'Both cohorts cleared the floor and their medians sit inside the declared band. A convention was met; fairness was not proven, and the reading is unadjusted for level, rating or tenure.',
  }),
]);

const VERDICT_BY_KEY = new Map(MERIT_PARITY_VERDICTS.map((v) => [v.key, v]));
export function meritParityVerdict(key) {
  return VERDICT_BY_KEY.get(String(key || '')) || null;
}

/**
 * The direction of a printed gap. `matrix-below` is the reading the module was
 * built to surface; `matrix-above` is reported with equal force rather than
 * silently treated as good news.
 */
export const MERIT_PARITY_DIRECTIONS = Object.freeze([
  Object.freeze({ key: 'matrix-below', label: 'Second-line cohort paid less', tone: 'warn' }),
  Object.freeze({ key: 'matrix-above', label: 'Second-line cohort paid more', tone: 'neutral' }),
  Object.freeze({ key: 'level', label: 'No difference past the band', tone: 'neutral' }),
]);

const DIRECTION_BY_KEY = new Map(MERIT_PARITY_DIRECTIONS.map((d) => [d.key, d]));
export function meritParityDirection(key) {
  return DIRECTION_BY_KEY.get(String(key || '')) || null;
}

/* ------------------------------------------------------------------ levels */

/** The roster's own level ladder — the same six keys `comp.js` reads. */
export const MERIT_PARITY_LEVELS = Object.freeze([
  Object.freeze({ key: 'ic', label: 'Individual contributor' }),
  Object.freeze({ key: 'senior', label: 'Senior IC' }),
  Object.freeze({ key: 'lead', label: 'Lead' }),
  Object.freeze({ key: 'manager', label: 'Manager' }),
  Object.freeze({ key: 'director', label: 'Director' }),
  Object.freeze({ key: 'vp', label: 'VP' }),
]);
const LEVEL_BY_KEY = new Map(MERIT_PARITY_LEVELS.map((l) => [l.key, l]));
export function meritParityLevelLabel(key) {
  return LEVEL_BY_KEY.get(String(key || ''))?.label || 'Unrecorded level';
}

/* ---------------------------------------------------------------- refusals */

/**
 * Every refusal this reading can print, with the reason it exists. A refused
 * figure is BLANK everywhere — panel, brief and CSV — and never a zero.
 */
export const MERIT_PARITY_REFUSALS = Object.freeze([
  Object.freeze({ key: 'malformed-row', label: 'A pay row has no readable person id', detail: 'Counted separately, never silently dropped or assigned a cohort; blocks the complete-pool reading.' }),
  Object.freeze({ key: 'duplicate-person-row', label: 'A recipient has repeated pay rows', detail: 'Every occurrence is excluded and counted. No occurrence is silently chosen and no duplicated recipient enters a median.' }),
  Object.freeze({ key: 'no-cycle', label: 'No merit cycle', detail: 'There is no cycle to read; no cohort, no gap and no verdict is invented.' }),
  Object.freeze({ key: 'no-rows', label: 'The cycle holds no pay decisions', detail: 'An empty cycle is an empty cycle. It is not a pool that treated anyone fairly.' }),
  Object.freeze({ key: 'cohort-empty', label: 'A cohort has nobody in it', detail: 'One side of the comparison has no priced person, so no difference can be computed.' }),
  Object.freeze({ key: 'cohort-below-floor', label: 'A cohort is below the printed cell floor', detail: 'A median and a gap are withheld below the declared floor; the counts are printed and the figures are BLANK.' }),
  Object.freeze({ key: 'unpriced-row', label: 'A pay decision has no price', detail: 'A current or proposed figure is missing. The row is excluded from the arithmetic, counted, and blocks the whole comparison rather than being read as a zero increase.' }),
  Object.freeze({ key: 'zero-base-row', label: 'A pay decision has a zero base', detail: 'A percentage of zero is undefined. The row is excluded and counted, never coerced into a figure.' }),
  Object.freeze({ key: 'missing-person-row', label: 'A pay row names a person who is not on the roster', detail: 'The person is gone, so their line count and pay authority cannot be read. The row is counted and excluded, never given an invented structure.' }),
  Object.freeze({ key: 'no-money-moved', label: 'The pool moved no money', detail: 'Every included decision is a zero increase. A gap of zero here is an artefact of an unspent pool, not evidence of parity.' }),
  Object.freeze({ key: 'no-effective-date', label: 'The cycle has no readable effective date', detail: 'The cohort split is read on the day the money takes effect. Without that day there is no structure to read, so no split is invented.' }),
  Object.freeze({ key: 'row-cap', label: 'Rows beyond the bounded read', detail: 'The reading is bounded. Rows past the cap are NOT included in any figure and the remainder is printed so a partial pool is never read as the whole one.' }),
]);

/* -------------------------------------------------------------- frameworks */

export const MERIT_PARITY_FRAMEWORKS = Object.freeze([
  Object.freeze({ key: 'multi-task-agency', name: 'Holmström & Milgrom (1991), multi-task principal–agent', applied: 'When two principals each observe part of a person’s output, effort follows the task whose principal can reward it. The unrewarded line is starved by the measurement, not by the person.' }),
  Object.freeze({ key: 'subjective-measurement', name: 'Baker, Gibbons & Murphy (1994), subjective performance measurement', applied: 'Pay attached to a supervisor who sees only part of the job prices the part they see. The second line’s contribution is real and unpriced.' }),
  Object.freeze({ key: 'unadjusted-gap', name: 'Oaxaca (1973) / Blinder (1973), decomposition', applied: 'Cited as the discipline NOT claimed here: this reading prints an unadjusted descriptive gap and says so. A decomposition on three people per cell is a computation, not a finding.' }),
  Object.freeze({ key: 'matrix-costs', name: 'Goold & Campbell (1993); Galbraith (1973)', applied: 'A second line is a coordination cost with a benefit nobody prices. This reading prices neither; it asks only whether the money followed the structure unevenly.' }),
  Object.freeze({ key: 'disclosure-control', name: 'Statistical disclosure control (house convention, ADR-0139/ADR-0126)', applied: 'A cell floor withholds a figure below a declared count; a withheld figure is BLANK, never zero, and its reason is printed.' }),
]);

/* --------------------------------------------------------------- CSV shape */

/**
 * Aggregate-only export. One `summary` row plus one `level` row per level that
 * appears in at least one cohort. NO person, NO name, NO manager id, NO cycle
 * label, NO salary and NO individual increase — a pay figure in a spreadsheet is
 * the most sensitive content this workspace holds, and every question this scope
 * answers is answerable in basis points and counts.
 */
export const MERIT_PARITY_CSV_COLUMNS = Object.freeze([
  'row_kind',
  'cycle_status',
  'currency',
  'effective_on',
  'cell_floor',
  'tolerance_bps',
  'rows_n',
  'matrix_rows_n',
  'single_rows_n',
  'excluded_rows_n',
  'matrix_included_n',
  'single_included_n',
  'matrix_median_bps',
  'single_median_bps',
  'gap_bps',
  'gap_direction',
  'matrix_pool_share_bps',
  'matrix_zero_increase_n',
  'single_zero_increase_n',
  'level',
  'matrix_level_n',
  'single_level_n',
  'level_gap_bps',
  'authority_verdict',
  'contested_authority_n',
  'unowned_authority_n',
  'parity_verdict',
  'reconciles',
  'figures_complete',
  'withheld_reason',
]);
