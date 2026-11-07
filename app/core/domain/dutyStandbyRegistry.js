/**
 * app/core/domain/dutyStandbyRegistry.js — Cover acknowledgement, or "the
 * answerable person was never actually asked" (ADR-0127, Schema v116).
 *
 * THE GAP THIS CLOSES
 * -------------------
 * ADR-0121 built the register that names who answers for each duty line when the
 * holder is absent. It opens with a citation that is, in effect, the accusation:
 * Kahn (1990) — *a responsibility nobody was told about is not a responsibility*.
 * Then the code records the declaration and never records the telling. The
 * consequence is structural, not cosmetic:
 *
 *   - the register DERIVES "covered" from dated work evidence, so it can show a
 *     cover is exercised, but it can NEVER distinguish a cover who accepted the
 *     duty from one who was named without being asked;
 *   - the dated plan (ADR-0122) prints "available" for any cover with no absence
 *     of their own overlapping the window — "no declared absence" is read as
 *     "will be there", which is exactly the assumption a named stand-in breaks;
 *   - the person who IS the stand-in has no surface in the product at all. A
 *     manager naming a director as cover for a leave week produces a row, an
 *     edge and a governed decision that the *holder* sees; the named person
 *     learns it by opening the register of a seat they do not operate.
 *
 * THE REAL DUTY THIS SERVES
 * -------------------------
 * A director approving a leave week across two managers is not asking "is a name
 * in the cell". They are asking the only question that survives contact with a
 * Monday: *of the people I have named answerable this fortnight, who has said
 * yes, who has said no, and who has not answered at all?* A named-but-unasked
 * cover is an unrecorded responsibility wearing a green badge.
 *
 * WHAT IS DECLARED HERE AND WHAT IS DERIVED
 * -----------------------------------------
 * DECLARED: the cover declaration itself is already the ASK (ADR-0121 writes it
 * as a dated human act). ADR-0127 adds exactly one more declared thing — the
 * cover's own ANSWER: accepted or declined, the window they answered for, the
 * day and instant, the words they wrote, and the governed decision opened when
 * the answer is a refusal.
 *
 * DERIVED, never stored: whether an active cover is awaiting an answer, whether
 * it is OVERDUE against the declared response deadline, whether its answer is
 * closed (the response window has passed, or the cover row was revoked), the
 * standby window it is being asked about, and the count of duties in a span
 * whose only declared covers have refused. A stored "acknowledged" flag would
 * be a second, decaying record of the same fact — the exact failure ADR-0121
 * refused for "exercised".
 *
 * WHY NO NEW AUTOMATION RULE
 * --------------------------
 * Nothing here should be engine-assigned. The workspace does not chase people,
 * send reminders, re-assign a refused cover, or escalate on its own: it PRINTS
 * the overdue answer and the refusal with their reasons, rolls the exposure up
 * the chain, and leaves the two human acts — declaring and answering — where
 * they belong. A machine that "confirms" a stand-in on someone's behalf is an
 * invented responsibility, and inventing one is what this register exists to
 * make impossible.
 */

export const DUTY_STANDBY_ENGINE_VERSION = 'duty-standby-2026.11-v1';

export const DUTY_STANDBY_EVENTS = Object.freeze({
  ACCEPT: 'dutyStandby.accepted',
  DECLINE: 'dutyStandby.declined',
  SCAN: 'dutyStandby.scan',
});

export const DUTY_STANDBY_ANSWERS = Object.freeze(['accepted', 'declined']);

/**
 * The one typed relation this module writes: an acknowledgement ACCEPTS STANDBY
 * FOR the cover declaration it answers. It is deliberately a new relation rather
 * than a re-use of ADR-0121's `prepares-for`: that edge says a person prepares
 * for a duty, while this one says a specific person answered a specific ask about
 * a specific window. Two facts, two edges, and the answer can be revoked without
 * erasing the declaration it answered.
 */
export const DUTY_STANDBY_RELATION = 'accepts-standby-for';

export const DUTY_STANDBY_LIMITS = Object.freeze({
  /** Acknowledgement rows the board will load in one read. */
  answerCap: 600,
  /** Answers printed per duty-line card before the remainder is counted. */
  rowCap: 40,
  /** Text clamps — the answerer's own words, never summarised. */
  noteChars: 300,
  /** Longest standby window a cover can be asked to answer for (days). */
  maxStandbyDays: 120,
});

/**
 * The two declared conventions this module adds. Both are printed, clamped,
 * re-declarable only by the same rank-4+/full-access seat that declares the rest
 * of the register's conventions, and neither is fitted from the record.
 */
export const DUTY_STANDBY_DEFAULTS = Object.freeze({
  /**
   * Days after a cover is declared within which an answer is expected. Not a
   * reminder schedule and not a scoring clock: it is the line at which the
   * register stops saying "waiting" and starts saying "overdue", because on a
   * Monday a fortnight later, "waiting" is the same word as "nobody asked".
   */
  dutyStandbyResponseDays: 3,
  /**
   * How far ahead a standby window runs when the holder has NOT declared a
   * dated absence. A cover who says yes is saying yes to a bounded window, not
   * to a lifetime: "I am your stand-in, indefinitely" is a sentence nobody
   * should be able to type on someone else's behalf.
   */
  dutyStandbyWindowDays: 14,
});

export const DUTY_STANDBY_BOUNDS = Object.freeze({
  dutyStandbyResponseDays: [1, 30],
  dutyStandbyWindowDays: [3, 90],
});

export const DUTY_STANDBY_PREMISE = 'A declared cover is an ask, not an answer. Every named stand-in is asked to accept or refuse a bounded window in their own words, the refusal opens a governed decision naming what stops, and a named cover who has not answered is printed as overdue rather than counted as ready. Nothing here chases anyone: the register can show you who has not answered, and it will not answer for them.';

/**
 * The four derived standby states a declared cover can be in. None of them is
 * stored; each is a function of the cover row, the answers on it, today's date
 * and the two declared conventions above.
 *
 *   accepted  the cover answered yes for a window that still covers the ask
 *   declined  the cover answered no, with the reason they wrote
 *   lapsed    a "yes" that no longer covers the current ask — the answered
 *             window ended, or the holder's absence moved and the answer did
 *             not move with it. Re-asking is the human act; the register will
 *             not silently extend someone else's yes.
 *   overdue   no answer yet, and the declared response deadline has passed
 *   awaiting  no answer yet, inside the declared response deadline
 */
export const DUTY_STANDBY_STATES = Object.freeze(['accepted', 'declined', 'lapsed', 'overdue', 'awaiting']);

/**
 * Why a reading refuses to grade standby at all. Refusals are printed, never
 * zeroed: "nobody is waiting" and "this register cannot see who is waiting" are
 * different claims and are never allowed to look alike.
 */
export const DUTY_STANDBY_REFUSALS = Object.freeze({
  noCovers: 'No duty line in this span has a declared cover, so there is no one to ask and no standby reading to grade. Declaring cover is a dated human act; the register will not infer an ask.',
  noDuties: 'This seat holds no declared duty line, so it can be named as a cover but has nothing of its own to ask about.',
  unresolvedSeat: 'The declared seat is unresolved and read-only, so the standby board cannot say whose answers are whose.',
});
