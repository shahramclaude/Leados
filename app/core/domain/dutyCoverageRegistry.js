/**
 * app/core/domain/dutyCoverageRegistry.js — the Duty Coverage Register
 * (ADR-0121, Schema v114, Session 163).
 *
 * THE GAP THIS CLOSES
 * -------------------
 * ADR-0075 declared, for every altitude, the duties that altitude is supposed
 * to perform: `frontline.coach` ("did every person get a real conversation
 * inside the cadence?"), `manager.coordination` ("is a blocker crossing two
 * teams actually moving?"), `chief.board` ("can the board read a conclusion?").
 * ADR-0076 then built the enforcement half — a seat sees its span, nothing
 * sideways — and ADR-0106 made the nav duties-first.
 *
 * What none of them built is the register: *when the seat holder is not there,
 * WHO IS ANSWERABLE FOR EACH DUTY, AND DOES THAT PERSON KNOW?* The duty table
 * was a rendering contract. On a Tuesday when the shift lead calls in sick, the
 * workspace could tell you the duty existed and could not tell you who holds it,
 * whether that person had the span to perform it, whether their access had ever
 * been exercised, or what the consequence would be of a day without coverage.
 *
 * The absence this teaches (named, not paraphrased)
 * - Kahn (1990), psychological conditions of engagement — a responsibility
 *   nobody was told about is not a responsibility.
 * - Weick & Sutcliffe (2007), managing the unexpected — pooled coverage beats a
 *   single point that everyone assumes is watching.
 * - Jaques (1956), time-span of discretion — a stand-in answers a duty only if
 *   they sit at or above the altitude whose horizon the duty occupies.
 * - Subsidiarity (Aghion & Tirole 1997; the ADR-0075 ladder) — the cover rises
 *   to the lowest leadership ancestor whose span contains the duty, never
 *   sideways to a peer.
 * - Edmondson (1999) psychological safety, used ONLY as the reason the register
 *   prints its own refusals out loud rather than a silent blank.
 *
 * WHAT IS DECLARED HERE AND WHAT IS DERIVED
 * ----------------------------------------
 * DECLARED: the altitude table above (already in chainRegistry), the duty → span
 * requirement, and the conventions below (defaults, clamps, names). Every one
 * of these is printed in the product and can be re-declared by a rank-4/5 seat.
 *
 * DERIVED, never stored: the duty's span holder (the reporting tree's owner of
 * the duty's work), the eligible pool, the named stand-in's altitude fitness,
 * whether a cover was *declared*, whether the cover's access was ever
 * *exercised* on a date, and the concentration of that exercise. There is no
 * "coverage score": this module rates the REGISTER (does the duty have a
 * designated, capable, exercised stand-in), never the person holding it.
 *
 * WHY NO NEW RULE ID
 * ------------------
 * Provisioning cover is a human, dated, atomic act on one duty (record + typed
 * `prepares-for` edge + audit event + the governed decision that names the
 * consequence), exactly like ADR-0113's agenda filing. There is no automation
 * that "should" assign cover: a machine-assigned stand-in is an invented
 * responsibility, and inventing one is precisely the failure this register
 * exists to prevent. The dangerous pattern — a duty worked by one hand for too
 * long — is surfaced as a *printed refusal-free reading* on the Desk and rolls
 * up through the existing seat digest, not through a second decision engine.
 */

export const DUTY_COVERAGE_ENGINE_VERSION = 'duty-coverage-2026.11-v1';

export const DUTY_COVERAGE_EVENTS = Object.freeze({
  DESIGNATE: 'dutyCoverage.designated',
  REVOKE: 'dutyCoverage.revoked',
  VERIFIED: 'dutyCoverage.verified',
  SCAN: 'dutyCoverage.scan',
  SETTINGS: 'dutyCoverage.settings_updated',
});

export const DUTY_COVERAGE_STATUSES = Object.freeze(['active', 'revoked']);

/** The one typed relation this module writes. It is the same `prepares-for`
 * relation ADR-0113 already registers: a stand-in PREPARES FOR the duty they
 * are answerable for. Reusing it is deliberate — a new relation for "this
 * person holds this duty" would be a second vocabulary for one fact. */
export const DUTY_COVERAGE_RELATION = 'prepares-for';

export const DUTY_COVERAGE_PANELS = Object.freeze([
  Object.freeze({ key: 'desk', label: 'Desk' }),
  Object.freeze({ key: 'register', label: 'Register' }),
  Object.freeze({ key: 'gaps', label: 'Gaps & refusals' }),
  Object.freeze({ key: 'concentration', label: 'Concentration' }),
  Object.freeze({ key: 'plan', label: 'Absence plan' }),
  // ADR-0129: the governed hand-off that restores the signal a withheld cell
  // costs the chief. Both chairs in one panel: what was asked of me, and what I
  // have asked of my own span.
  Object.freeze({ key: 'readings', label: 'Branch readings' }),
  Object.freeze({ key: 'method', label: 'Method' }),
]);

export const DUTY_COVERAGE_LIMITS = Object.freeze({
  /** Drafts shown on the Desk; the register is capped, the count is not. */
  rowCap: 60,
  /** Declared covers per duty (a duty is not a committee). */
  coversPerDuty: 3,
  /** Ledger rows the register will render in one read. */
  ledgerCap: 400,
  /** Distinct dates of recorded work consulted per duty holder. */
  exerciseDaysCap: 400,
  /** Text clamps. */
  noteChars: 300,
  reasonChars: 300,
});

/**
 * Declared conventions. `dutyCoverageExerciseDays` is the window inside which a
 * stand-in's *recorded work inside the duty's span* counts as evidence their
 * access is real; `dutyCoverageConcentrationPct` is the share above which one
 * hand doing all the duty's recorded work reads as a single point of failure.
 * Both are printed, both are clamped, both are re-declarable only by a rank-4/5
 * full-access seat, and neither is fitted from the record.
 */
export const DUTY_COVERAGE_DEFAULTS = Object.freeze({
  dutyCoverageExerciseDays: 30,
  dutyCoverageConcentrationPct: 90,
  // ADR-0126: the disclosure floor for the direct-branch comparison. A branch
  // cell smaller than this is withheld (primary suppression) and one more
  // released cell is withheld beside it (complementary suppression) so the
  // blanked cell cannot be recovered by subtracting from the parent total.
  // Denominated in the LEADERSHIP SEATS that contribute duty lines to the
  // branch — the number of people the cell is a statement about. The altitude
  // duty table declares five duty lines per seat, so the two are proportional;
  // seats is the quantity a reader reasons about, so the floor is declared in
  // seats and the duty count is printed beside it.
  //
  // Three: a two-seat branch is the whole register of a director and one
  // manager, and "50% covered" over those two is a sentence about two people.
  dutyCoverageBranchFloorN: 3,
  // A rate is quoted only at or above this many contributing seats — a
  // proportion over two or three people is a rumour with a percent sign.
  dutyCoverageBranchRateFloorN: 4,
  // How many child spans the comparison table will render in one read.
  dutyCoverageBranchCap: 24,
  // ADR-0129: the response window a branch leader is given to answer a reading
  // request, and how long a published reading stands before it LAPSES. Both are
  // printed, both are clamped, and both are re-declarable only by the same
  // rank-4+ full-access seat that declares the disclosure floors above.
  //
  // Five working days: a reading is a considered statement about a branch, not
  // a reflex, and a deadline short enough to fire on a leave week teaches
  // people to answer with the reassuring band.
  dutyCoverageReadingResponseDays: 5,
  // Thirty days: long enough that a chief is not re-asking every fortnight,
  // short enough that a reading about last month is not read as today's
  // condition. A stale band is more dangerous than a blank cell, because it
  // looks like a signal.
  dutyCoverageReadingValidDays: 30,
});

export const DUTY_COVERAGE_BOUNDS = Object.freeze({
  dutyCoverageExerciseDays: [7, 180],
  dutyCoverageConcentrationPct: [50, 100],
  dutyCoverageBranchFloorN: [2, 25],
  dutyCoverageBranchRateFloorN: [2, 40],
  dutyCoverageBranchCap: [4, 64],
  dutyCoverageReadingResponseDays: [1, 30],
  dutyCoverageReadingValidDays: [7, 180],
});

export const DUTY_PREMISE = 'A duty with no named, capable, exercised stand-in is a duty one absence away from stopping. LeadOS can name the cover because it already knows the reporting tree, the duty table and the dated work records — but it will not invent a stand-in: declaring cover is a dated human act, and every gap prints the reason it is a gap instead of a reassuring blank.';

/**
 * ADR-0126 — the disclosure floor on the branch comparison.
 *
 * The comparison table is the one surface in this register that separates a
 * unit by NAME-bearing structure (which branch) while printing an exact count
 * of the people inside it. A branch with one duty line and one cover prints
 * "100% covered", and the chief reading it knows exactly which person that
 * sentence is about — the partition key is in the roster they are holding. The
 * same reasoning the workspace already applies to pulse cells and outcome
 * loops (small-cell suppression, primary + complementary) applies here; it had
 * simply never been wired to this table.
 *
 * This is explicitly NOT differential privacy, and the reading says so.
 */
export const DUTY_BRANCH_DISCLOSURE_PREMISE = 'A per-branch rate is a statement about the few people inside that branch. Below the declared floor a branch cell is WITHHELD rather than printed small, one more released cell is withheld beside it so the blanked cell cannot be recovered by subtracting from the parent total, and a rate is quoted only above its own floor. Withheld is never zero: the cell prints why it is blank. This is primary + complementary suppression, not differential privacy, and the reading never claims otherwise.';

