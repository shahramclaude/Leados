/**
 * app/core/domain/dutyAbsenceRegistry.js — the Dated Absence Plan
 * (ADR-0122, Schema v115, Session 167).
 *
 * THE GAP THIS CLOSES
 * -------------------
 * ADR-0121 answered "if I am not here, WHO is answerable for each duty?" — and
 * then stopped, because "not here" had no dates. A frontline lead who knows
 * she is out on 2027-07-05 through 2027-07-09 cannot learn from the register
 * whether her declared cover is available ON THOSE DATES: the cover may be the
 * very manager who is also out that week, and nothing in the workspace
 * recorded that. Session 166 named the five missing pieces explicitly:
 * absence dates, cover availability, overlap/conflict checks, a durable plan
 * and a dated roll-up.
 *
 * WHAT IS DECLARED HERE AND WHAT IS DERIVED
 * -----------------------------------------
 * DECLARED: one absence plan per seat — a window (`from`/`to`, inclusive ISO
 * day keys), the reason the seat holder wrote, the day it was declared, the
 * governed decision that names what stops during the window, and the
 * revocation day and reason. It is a dated human act, exactly like ADR-0121's
 * cover declaration: the workspace does not invent an absence, and it does not
 * auto-assign one.
 *
 * DERIVED, never stored: whether a declared cover is AVAILABLE during a
 * specific window (a cover with their own active absence plan overlapping the
 * window is not), whether the duty is covered / thin / cover-absent / gap on
 * those dates, and whether an unavailable cover's own absence is itself
 * covered (the cascade). Availability is a function of two declared windows,
 * re-derived on every read — a stored "available" flag would be a number that
 * drifts the moment either window changes.
 *
 * WHY NO NEW RULE ID
 * ------------------
 * Declaring an absence is the ADR-0113/ADR-0121 human-act pattern: one row,
 * one `declares-absence-of` edge, one governed decision, one `rolls-up-to`
 * edge per leadership ancestor, all in a single `store.update`. There is no
 * automation that "should" schedule an absence; an engine-assigned leave
 * calendar is an invented responsibility, and inventing one is precisely the
 * failure this register exists to prevent.
 */

export const DUTY_ABSENCE_ENGINE_VERSION = 'duty-absence-2026.11-v1';

export const DUTY_ABSENCE_EVENTS = Object.freeze({
  DECLARE: 'dutyAbsence.declared',
  REVOKE: 'dutyAbsence.revoked',
  SCAN: 'dutyAbsence.scan',
});

export const DUTY_ABSENCE_STATUSES = Object.freeze(['active', 'revoked']);

/**
 * The one typed relation this module writes: an absence plan DECLARES THE
 * ABSENCE OF the seat that will not be at it. It is deliberately not
 * `prepares-for` (ADR-0121's stand-in vocabulary): a stand-in prepares for a
 * duty, while an absence plan states a window in which a seat is unavailable.
 * Two relations because they are two different questions.
 */
export const DUTY_ABSENCE_RELATION = 'declares-absence-of';

export const DUTY_ABSENCE_LIMITS = Object.freeze({
  /** Absence plans the ledger will load in one read. */
  planCap: 400,
  /** The longest declared absence window (days, inclusive). A quarter is the
   *  longest absence a frontline horizon can honestly plan around; a longer
   *  window is refused at declaration and dropped at load rather than silently
   *  clamped, because a clamped window would grade the wrong dates. */
  maxSpanDays: 90,
  /** Text clamps. */
  reasonChars: 300,
  noteChars: 300,
  /** Overlapping windows the concurrency read will grade in one pass. A span
   *  with more simultaneous absences than this is not summarised into a
   *  comfortable number: the remainder is counted and printed as deferred. */
  concurrentWindowCap: 24,
});

/**
 * The absence premise, printed in the product. One sentence, no score: the
 * register will say which duty lines are exposed during a specific window,
 * and it will print the conflict (a cover who is themselves absent) rather
 * than reassuring the reader.
 */
export const DUTY_ABSENCE_PREMISE = 'An absence is a date range, not a feeling: the register grades every duty line the seat holds against the exact days the seat will not be there — and it prints the conflict out loud when the declared cover is themselves absent on those dates.';

/**
 * CONCURRENT ABSENCE EXPOSURE (ADR-0123)
 * --------------------------------------
 * The register grades one absence against the declared covers. It does not
 * grade the everyday case a manager and a director actually manage: two or
 * three seats out on the SAME dates, and the declared cover for both of them
 * is one person — or is themselves one of the absentees. Concurrency is
 * DERIVED from the declared windows, never stored and never scheduled: the
 * reading names the overlap, counts the exposed duty lines and prints the
 * single point of failure instead of averaging it away.
 */
export const DUTY_CONCURRENCY_ENGINE_VERSION = 'duty-concurrency-2026.11-v1';

export const DUTY_CONCURRENCY_PREMISE = 'Two absences on the same dates are not two absences: they are one window with less capacity. The register sweeps the declared windows, prints every shared date range, and names the cover who would be the only answerable person for more than one absent seat — a single point of failure that no per-absence reading can show.';

/**
 * COVER CAPACITY INSIDE THE SHARED WINDOW (ADR-0124)
 * --------------------------------------------------
 * ADR-0123 prints the single point of failure — one person declared as the
 * only cover for two or more absent seats. It deliberately said nothing about
 * whether that person has room for the work. A manager approving a week's
 * cover is the seat who must answer that, and the workspace already holds the
 * evidence: the open work items inside each duty line's span, harvested by the
 * SAME shared harvester that drives the chain, the register and the roll-up.
 *
 * DECLARED: nothing new. The absence windows, the covers and the duty table
 * are already declared. The capacity envelope is DERIVED from the peak open
 * work any seat in this span is currently carrying — a revealed upper bound,
 * not a fitted productivity constant and not an invented WIP target. Little's
 * Law (1961) is the reason work-in-progress is the unit, and the reason the
 * reading refuses when no open work exists: zero observed work is not spare
 * capacity.
 *
 * DERIVED, never stored: the cover's own open work, the open work inherited
 * from the absent seats they alone would answer for, the overlap between them
 * (counted once, because an ancestor's span already contains the descendant's
 * work), the union, the ratio against the observed envelope and the band. A
 * stored verdict would drift the moment one case, one delegation or one
 * absence window changed.
 *
 * WHY NO NEW RULE / EVENT / SCHEMA: this is a read-side projection of the same
 * concurrency sweep. The governed decision, the audit event, the upward brief
 * and the duty-absence scan already carry that sweep; the capacity reading
 * travels with it rather than opening a second automation path.
 */
export const DUTY_COVER_LOAD_ENGINE_VERSION = 'duty-cover-load-2026.11-v1';

export const DUTY_COVER_LOAD_PREMISE = 'A named cover is not spare capacity. On the shared dates the register counts the open work the cover already carries, the open work they alone would inherit from the absent seats, and the items that sit in both spans — once, not twice — then grades the union against the highest open-work load any seat in this span is actually carrying today. With no open work on the record there is no envelope, and the reading refuses instead of printing a reassuring zero.';

export const DUTY_COVER_LOAD_LIMITS = Object.freeze({
  /** Distinct available covers graded per overlap window. The remainder is
   *  counted and printed as deferred, never folded into a comfortable number. */
  coverCap: 24,
});

export const DUTY_COVER_LOAD_REFUSALS = Object.freeze({
  noEnvelope: 'No comparable seat in this span currently carries a recorded open work item inside its declared duty lines, so the record contains no observed capacity envelope. Zero open work is not spare capacity: the reading refuses rather than grading against an invented limit.',
  noComparableSeat: 'The reporting tree holds no other seat at or below this cover’s altitude inside this span, so there is no like-for-like load to compare against and the reading refuses.',
  noDuties: 'This cover holds no declared duty line in the reporting tree, so their own workload has no denominator and a capacity reading would be a guess.',
});
