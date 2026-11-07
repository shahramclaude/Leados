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
});

/**
 * The absence premise, printed in the product. One sentence, no score: the
 * register will say which duty lines are exposed during a specific window,
 * and it will print the conflict (a cover who is themselves absent) rather
 * than reassuring the reader.
 */
export const DUTY_ABSENCE_PREMISE = 'An absence is a date range, not a feeling: the register grades every duty line the seat holds against the exact days the seat will not be there — and it prints the conflict out loud when the declared cover is themselves absent on those dates.';
