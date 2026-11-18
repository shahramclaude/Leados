/**
 * app/core/domain/calRegistry.js — the closed vocabulary of the Performance
 * Calibration Decision Register (ADR-0261, Schema v213,
 * `#/performance-calibration`, `RULE-CAL-01`, CSV scope #197).
 *
 * THE DUTY, IN A DIRECTOR'S WORDS. *"I run calibration with six managers. Each
 * of them rated their own people against the same four-point scale. One manager
 * rated everyone 'often-exceeds', another rated no one above 'meets-expectations',
 * and two managers who both had the same person on their teams gave ratings two
 * steps apart. The packets sit side by side. Nothing in the workspace says
 * whether the ratings are comparable, whether the distribution is biased, or
 * what the calibrated rating actually is — the decision the committee made, with
 * its rationale, on a dated record. The proposed rating is stored on the review.
 * The calibrated rating — the one pay and promotion will read — is nowhere."*
 *
 * No surface in this workspace could answer any part of that. The reviews
 * terminal (ADR-0147 stewardship, ADR-0151 reconciliation) records which lines
 * were asked, which answered, and whether two lines' signals diverge — and
 * explicitly refuses to change a rating: *"This is not a rating; it is a prompt
 * for the calibration conversation."* The merit terminal (comp.js) reads
 * `review.manager.rating` directly as the final rating for pay decisions, with
 * no calibration layer between proposed and final. The calibration warnings
 * (reviews.js CAL-03..05) challenge unsupported ratings. None records the
 * committee's decision.
 *
 * THE GAP CLAIM, QUOTED FROM THE RECORD RATHER THAN ASSERTED. A word-boundary
 * census of `app/core/domain`, `app/views`, `docs/adr/` and `ROADMAP.md`
 * returned ZERO files for `performance calibration`, `calibration committee`,
 * `calibratedRating`, `finalRating`, `calibrationSession` and
 * `calibrationOutcome`. The only `calibration` hits are forecast calibration
 * (Brier, PERT), authority calibration (mandate contracts) and span calibration
 * (leadership ladder) — three different duties. Wider absence **[UNVERIFIED]**.
 *
 * THE FRAMEWORK THIS REGISTER APPLIES. Performance calibration as practised in
 * every large organisation, grounded in:
 *
 *   - **Inter-rater reliability (Cohen 1960, Cohen's kappa).** Where two lines
 *     rated the same person, the agreement between them is measured exactly —
 *     observed agreement, chance agreement, kappa — and refused below a
 *     declared floor or where one cell carries the table. A divergent pair is
 *     a prompt for calibration, never an averaged rating.
 *   - **Adverse impact (four-fifths rule, US EEOC Uniform Guidelines 1978).**
 *     The favourable-decision rate (often-exceeds + sets-standard) is compared
 *     across declared groups; a ratio below 0.8 flags for review. It is a
 *     screening heuristic, not a legal conclusion — the register prints the
 *     ratio and the counts, never a verdict on discrimination.
 *   - **Tournament theory (Lazear & Rosen 1981) and incentive compatibility.**
 *     Calibration exists because managers inflate their own people's ratings
 *     when the budget is shared. The register makes the inflation visible as
 *     distribution drift and records the committee's correction with rationale.
 *   - **Procedural justice (Leventhal 1980, Colquitt et al. 2001).** Consistency,
 *     accuracy, correctability and bias suppression are mapped to facts the
 *     record contains: was every line asked, did every line answer, does the
 *     calibrated rating cite evidence, is the rationale written.
 *
 * WHAT THIS REGISTER ADDS THAT A SPREADSHEET CANNOT. A spreadsheet holds a
 * proposed rating somebody typed and a calibrated rating somebody overwrote.
 * This register keeps both, derives the distribution from the dated record,
 * measures inter-rater agreement exactly, flags adverse impact as a ratio with
 * its counts, and files a dated ask to the joint seat above every responsible
 * line when a divergent matrix person sits uncalibrated. Five facts it
 * expresses that a typed row cannot:
 *
 *   - **A proposed rating is not a calibrated rating.** The review stores the
 *     manager's proposal. The register stores the committee's decision beside
 *     it, with rationale. Comp still reads the proposal; the calibrated rating
 *     is printed apart, never silently substituted.
 *   - **Two proposed ratings two steps apart are `divergent-uncalibrated`.**
 *     The register never averages them. A human reconciles them with written
 *     rationale, or the divergence stays printed.
 *   - **Agreement is measured, not asserted.** Kappa is computed from the
 *     declared pairs and refused below the floor. "The managers agreed" is
 *     never printed without the arithmetic.
 *   - **Bias is a ratio with counts, not a colour.** Four-fifths is printed
 *     with both groups' favourable counts and totals, or refused with its
 *     reason below the floor.
 *   - **An uncalibrated person in an open session past the warn horizon is
 *     `overdue-session`.** The absence of a decision is printed as one.
 *
 * THE SIX THINGS THAT MUST NEVER HAPPEN, AND ARE PREVENTED BY CONSTRUCTION:
 *   - **No stored distribution, no stored kappa, no stored bias ratio.** Every
 *     figure is derived on read from sessions, decisions and reviews.
 *   - **No averaged rating.** Two divergent proposals are never averaged into
 *     a calibrated rating. The committee declares one, with rationale.
 *   - **No auto-calibration.** The register never moves a rating. A human
 *     records the calibrated rating with rationale, or it stays uncalibrated.
 *   - **No person scored on worth.** The calibrated rating is a decision about
 *     the review's evidence, not a verdict on the person's value. No nine-box,
 *     no potential rating, no ranking, no league table.
 *   - **No proposed rating overwritten.** The review's `manager.rating` is
 *     never changed by calibration. The calibrated rating lives beside it.
 *   - **No calibration without rationale.** A decision with no written
 *     rationale is refused at the door.
 *
 * MATRIX CORRECTNESS (ADR-0140/0141). A person with two managers has two
 * proposed ratings from two lines. The reader resolves every ACTIVE line that
 * holds the person through the ONE matrix engine, counts a person ONCE, and
 * derives the joint apex over every line as the seat whose authority answers
 * for the calibration. Where the record names several hands the duty sits
 * above all of them and the screen says so; it never silently promotes one
 * manager to "owner of the rating". Where a hand is off the graph the row is
 * printed as an orphan rather than dropped, because deleting it would erase a
 * live calibration duty from the record.
 */

export const CAL_ENGINE_VERSION = 'performance-calibration-2026.11-v1';
export const CAL_ADR = 'ADR-0261';
export const CAL_RULE_ID = 'RULE-CAL-01';
export const CAL_ROUTE = 'performance-calibration';
export const CAL_HREF = '#/performance-calibration';
export const CAL_CSV_SCOPE = 'performance-calibration';
export const CAL_MARKER_KIND = 'performance-calibration';
export const CAL_EVENT_PREFIX = 'cal.';

/**
 * THE AGGREGATE EXPORT SHAPE (CSV scope #197). Every figure is a COUNT over
 * the whole register or a PUBLISHED-vocabulary key — the rating keys and state
 * keys are the same closed set the screen prints. No session reference, cycle
 * label, scope text, person, manager, review reference, rating-as-a-sentence
 * or day crosses this boundary. A per-state count below the declared privacy
 * floor exports BLANK with its reason, never as a small number.
 */
export const CAL_CSV_COLUMNS = Object.freeze([
  'as_of', 'row_kind', 'key', 'sessions_n', 'open_sessions_n', 'closed_sessions_n',
  'total_persons_n', 'total_decisions_n', 'calibrated_n', 'adjusted_n', 'uncalibrated_n',
  'divergent_uncalibrated_n', 'overdue_n',
  'proposed_needs_development_n', 'proposed_meets_expectations_n', 'proposed_often_exceeds_n',
  'proposed_sets_standard_n', 'proposed_unknown_n', 'proposed_total_n',
  'calibrated_needs_development_n', 'calibrated_meets_expectations_n', 'calibrated_often_exceeds_n',
  'calibrated_sets_standard_n', 'calibrated_unknown_n', 'calibrated_total_n',
  'bias_ratio', 'bias_flagged', 'bias_refused',
  'privacy_floor', 'complete', 'blank_reason',
]);

export const CAL_CSV_DESCRIPTOR = Object.freeze({
  key: CAL_CSV_SCOPE,
  label: 'Performance calibration decision register (aggregate)',
  group: 'governance',
  sensitive: true,
  filenameSlug: 'performance-calibration',
  description: 'One summary row, one row per session and one row per printed person state. Counts of sessions (open and closed), persons, decisions, and the calibrated/adjusted/uncalibrated/divergent/overdue split; the proposed and calibrated distributions as counts per published rating key with their totals; the four-fifths bias ratio with its flag and refusal; the declared privacy floor. No session reference, cycle label, scope text, person, manager, review reference, rationale text or day is exported. A per-state count below the declared privacy floor is withheld BLANK with its reason, never printed as a small number.',
});

export const CAL_EVENTS = Object.freeze({
  SESSION_RECORDED: 'cal.session.recorded',
  DECISION_RECORDED: 'cal.decision.recorded',
  SESSION_CLOSED: 'cal.session.closed',
  CONVENTIONS_SET: 'cal.conventions.set',
  SCANNED: 'cal.scan',
});

export const CAL_RIGHTS = Object.freeze({
  READ: 'read-performance-calibration',
  MANAGE: 'manage-performance-calibration',
});

export const CAL_SETTING_KEYS = Object.freeze({
  autoPropagate: 'calAutoPropagate',
  privacyFloor: 'calPrivacyFloor',
  warnHorizonDays: 'calWarnHorizonDays',
});

export const CAL_BOUNDS = Object.freeze({
  privacyFloor: { min: 2, max: 20 },
  warnHorizonDays: { min: 1, max: 365 },
});

export const CAL_DEFAULTS = Object.freeze({
  autoPropagate: true,
  privacyFloor: 3,
  warnHorizonDays: 30,
});

export const CAL_LIMITS = Object.freeze({
  idMax: 120,
  textMax: 2000,
  shortMax: 200,
  shortMin: 1,
  rationaleMax: 2000,
  titleMax: 200,
  cycleMax: 80,
  scopeMax: 500,
  distributionMax: 500,
  holdersMax: 4,
  holdersMin: 1,
  asksPerCommit: 4,
});

export const CAL_RATING_KEYS = Object.freeze([
  'needs-development',
  'meets-expectations',
  'often-exceeds',
  'sets-standard',
]);

export const CAL_RATING_BY_KEY = Object.freeze({
  'needs-development': { key: 'needs-development', label: 'Needs development', rank: 1 },
  'meets-expectations': { key: 'meets-expectations', label: 'Meets expectations', rank: 2 },
  'often-exceeds': { key: 'often-exceeds', label: 'Often exceeds', rank: 3 },
  'sets-standard': { key: 'sets-standard', label: 'Sets standard', rank: 4 },
});

export const CAL_RATING_LABELS = Object.freeze({
  'needs-development': 'Needs development',
  'meets-expectations': 'Meets expectations',
  'often-exceeds': 'Often exceeds',
  'sets-standard': 'Sets standard',
});

export const CAL_SESSION_STATUS_KEYS = Object.freeze(['open', 'closed']);

export const CAL_SESSION_STATUS_BY_KEY = Object.freeze({
  open: { key: 'open', label: 'Open', tone: 'warn' },
  closed: { key: 'closed', label: 'Closed', tone: 'neutral' },
});

export const CAL_STATE_KEYS = Object.freeze([
  'uncalibrated',
  'calibrated',
  'adjusted',
  'divergent-uncalibrated',
  'overdue-session',
]);

export const CAL_STATE_BY_KEY = Object.freeze({
  uncalibrated: { key: 'uncalibrated', label: 'Uncalibrated', tone: 'neutral', detail: 'No calibrated rating recorded for this person in this session. The proposed rating stands until a human records a decision with rationale.' },
  calibrated: { key: 'calibrated', label: 'Calibrated', tone: 'good', detail: 'A calibrated rating is recorded and equals the proposed rating. The committee confirmed the proposal.' },
  adjusted: { key: 'adjusted', label: 'Adjusted', tone: 'warn', detail: 'A calibrated rating is recorded and differs from the proposed rating. The rationale is printed beside both ratings.' },
  'divergent-uncalibrated': { key: 'divergent-uncalibrated', label: 'Divergent — uncalibrated', tone: 'bad', detail: 'Two or more lines proposed ratings two or more steps apart and no calibrated rating reconciles them. The register never averages them.' },
  'overdue-session': { key: 'overdue-session', label: 'Overdue session', tone: 'bad', detail: 'The session is open past the declared warn horizon with uncalibrated persons. The absence of a decision is printed as one.' },
});

export const CAL_CONDITION_KEYS = Object.freeze([
  'divergent-uncalibrated',
  'overdue-session',
  'distribution-flag',
  'uncalibrated-person',
]);

export const CAL_CONDITION_BY_KEY = Object.freeze({
  'divergent-uncalibrated': { key: 'divergent-uncalibrated', label: 'Divergent — uncalibrated', detail: 'Two or more lines proposed ratings two or more steps apart with no calibrated rating reconciling them.' },
  'overdue-session': { key: 'overdue-session', label: 'Overdue session', detail: 'The session is open past the declared warn horizon.' },
  'distribution-flag': { key: 'distribution-flag', label: 'Distribution flag', detail: 'The four-fifths ratio is below 0.8 or the distribution drifts beyond the declared target.' },
  'uncalibrated-person': { key: 'uncalibrated-person', label: 'Uncalibrated person', detail: 'A person in an open session has no calibrated rating past the warn horizon.' },
});

export const CAL_REFUSALS = Object.freeze({
  badSession: 'performance-calibration:bad-session',
  badDecision: 'performance-calibration:bad-decision',
  badRating: 'performance-calibration:bad-rating',
  missingRationale: 'performance-calibration:missing-rationale',
  duplicateSession: 'performance-calibration:duplicate-session',
  duplicateDecision: 'performance-calibration:duplicate-decision',
  unknownSession: 'performance-calibration:unknown-session',
  unknownPerson: 'performance-calibration:unknown-person',
  unknownReview: 'performance-calibration:unknown-review',
  closedSession: 'performance-calibration:closed-session',
  futureDay: 'performance-calibration:future-day',
  outsideSeat: 'performance-calibration:outside-seat',
  noRight: 'performance-calibration:no-right',
});

export const CAL_PAUSE_SWITCH = 'calAutoPropagate';

export function calRatingRank(rating) {
  return CAL_RATING_BY_KEY[rating]?.rank ?? null;
}

export function calRatingLabel(rating) {
  return CAL_RATING_BY_KEY[rating]?.label ?? null;
}

export function calState(key) {
  return CAL_STATE_BY_KEY[key] ?? null;
}

export function calCondition(key) {
  return CAL_CONDITION_BY_KEY[key] ?? null;
}
