/**
 * app/core/domain/meritStructureRegistry.js — the declared vocabulary of the
 * as-of home-line authority read (ADR-0155, Schema v128 unchanged,
 * `#/merit?panel=matrix`, CSV #116).
 *
 * THE DUTY, IN THE OPERATOR'S WORDS. The merit cycle was finalised in November
 * and Sam was paid 2.5%. In February the reorganisation moved Sam's home line
 * from Dana to Marcus. In March an auditor opens the November packet and asks
 * the only question that matters about it: *who held the pay right when that
 * money landed?* Before this module existed the product answered with today's
 * chart — Marcus, as if he had set a number he had never seen — and there was
 * no surface anywhere that said the answer had changed since the decision.
 *
 * THE THREE FACTS THIS MODULE KEEPS APART
 * ---------------------------------------
 *   1. THE DAY. The cycle's own effective date, never today.
 *   2. THE RECORD. Whether the workspace's home-line ledger (ADR-0149) actually
 *      covers that day for that person. Four states, never collapsed:
 *        observed         a recorded home-line period covers the day. A FACT.
 *        projected        the day is in the FUTURE and a recorded period is
 *                         still open across it. A PRESUMPTION that the current
 *                         line continues; the money has not landed yet.
 *        presumed-current the person has NO recorded home-line history at all,
 *                         so today's pointer is used and printed as a
 *                         presumption. A workspace with an empty ledger reads
 *                         exactly as it did before this module existed.
 *        unrecorded       the ledger holds history for this person and NONE of
 *                         it covers the day. The home line that day is not in
 *                         the record. Every figure that depends on it is
 *                         WITHHELD — never projected backwards from today.
 *   3. THE CONSEQUENCE. What the reading is allowed to say. `observed` and
 *      `presumed-current` and `projected` are readable. `unrecorded` blocks the
 *      comparison and forces the pay authority to `unknown`.
 *
 * WHY `presumed-current` IS NOT A HOLE. ADR-0149 records MOVES. A workspace that
 * has never recorded a move has no evidence that a home line ever changed, and
 * treating "no evidence of a change" as "unknown" would blank every existing
 * workspace's merit reading the day this shipped — the loudest possible way to
 * be useless. So the presumption is printed, counted, and named on every surface
 * it touches. What is refused is the case where the record EXISTS and does not
 * reach the day: that is not ignorance, it is an unreadable period, and
 * projecting today's chart across it is the exact defect this module removes.
 *
 * WHAT IS NEVER BUILT. No second hierarchy: the as-of reading substitutes each
 * person's home pointer for the day and then runs the SAME `buildMatrix` engine
 * every other matrix module uses, so line classification, cycle refusal and
 * right presumptions are all derived by one implementation. No stored figure:
 * every count and every state is re-derived on read from the ledger, the roster
 * and the cycle. Nothing is written by a read.
 *
 * FRAMEWORK BASIS. Valid time versus transaction time in bitemporal records
 * (Snodgrass 1999): the day a fact was TRUE and the day it was RECORDED are
 * different facts, and a report that conflates them silently rewrites history.
 * Audit-trail integrity for frozen decisions (COSO 2013, control activities;
 * IIA Global Internal Audit Standard on evidence sufficiency): a decision record
 * that cannot reproduce the authority in force at the decision date does not
 * support the decision. Statistical disclosure control (house convention, as
 * ADR-0139 / ADR-0126): a withheld figure is BLANK with its reason, never zero.
 */

export const MERIT_STRUCTURE_ENGINE_VERSION = 'merit-structure-2026.11-v1';

/* ------------------------------------------------------------------- states */

/**
 * Home-line reading states, WORST FIRST. `unrecorded` outranks everything: a
 * period the ledger does not cover is not a presumption, it is an absence, and
 * an absence may not be filled in.
 */
export const MERIT_STRUCTURE_STATES = Object.freeze([
  Object.freeze({
    key: 'unrecorded',
    label: 'Home line not in the record on that day',
    rank: 0,
    tone: 'bad',
    blocks: true,
    detail: 'This person has recorded home-line history, but no recorded period covers the day the money takes effect. The manager they reported to that day was never recorded, and today’s roster is not evidence about it. Every figure that depends on the home line is withheld.',
  }),
  Object.freeze({
    key: 'presumed-current',
    label: 'Home line presumed as today’s',
    rank: 1,
    tone: 'neutral',
    blocks: false,
    detail: 'This person has no recorded home-line history at all, so nothing in the record says the line ever changed. Today’s pointer is used and printed as a PRESUMPTION. Recording a move is what turns this into an observation.',
  }),
  Object.freeze({
    key: 'projected',
    label: 'Home line projected to that day',
    rank: 2,
    tone: 'neutral',
    blocks: false,
    detail: 'The day the money takes effect is in the future and the recorded home-line period is still open across it. The current line is presumed to continue. This is a presumption about a day nobody has lived through, and it is printed as one.',
  }),
  Object.freeze({
    key: 'observed',
    label: 'Home line recorded on that day',
    rank: 3,
    tone: 'good',
    blocks: false,
    detail: 'A recorded home-line period (ADR-0149) covers the day the money takes effect. The manager printed is what the record says, not what today’s roster says.',
  }),
]);

const STATE_BY_KEY = new Map(MERIT_STRUCTURE_STATES.map((s) => [s.key, s]));
export function meritStructureState(key) {
  return STATE_BY_KEY.get(String(key || '')) || null;
}

/* ------------------------------------------------------------- declarations */

/**
 * The declared conventions. Printed on the panel and in every brief. There is no
 * workspace setting for any of them: a reading that can be relaxed until it
 * agrees with the reader is not a check.
 */
export const MERIT_STRUCTURE_CONVENTIONS = Object.freeze({
  /** Today's pointer is used only when the person has NO recorded history. */
  presumption: 'no-recorded-history',
  /** A day after today is never `observed`; an open period reads `projected`. */
  future: 'never-observed',
  /** A day the ledger does not cover, for a person it does cover, is refused. */
  gap: 'withhold-never-project',
  /** The date is the cycle's effective date, never the read date. */
  asOf: 'cycle-effective-date',
});

/** Bounded read: at most this many person rows are rendered in the table. */
export const MERIT_STRUCTURE_LIMITS = Object.freeze({ rows: 400, findings: 60 });

/* --------------------------------------------------------------- freezes */

/**
 * The frozen-structure comparison verdicts, declared precedence top to bottom so
 * the panel, the brief and the CSV cannot disagree about a word.
 */
export const MERIT_STRUCTURE_FREEZE_VERDICTS = Object.freeze([
  Object.freeze({
    key: 'not-frozen',
    label: 'No structure frozen with this cycle',
    rank: 0,
    tone: 'neutral',
    detail: 'This cycle was finalised before the structure freeze existed, or the snapshot carries no readable structure block. Nothing is claimed about the structure the decision was made under — that is an absence, not a match.',
  }),
  Object.freeze({
    key: 'unreadable',
    label: 'The frozen structure cannot be compared',
    rank: 1,
    tone: 'warn',
    detail: 'The frozen structure block or the live reading is not readable, so no comparison is made. A failed comparison is never reported as agreement.',
  }),
  Object.freeze({
    key: 'drifted',
    label: 'The recorded structure has changed since finalisation',
    rank: 2,
    tone: 'warn',
    detail: 'The live reading over today’s records no longer reproduces the structure frozen at finalisation. The FROZEN record governs what the decision was made under; the live reading describes the organisation as it stands now. Both are printed; neither is edited.',
  }),
  Object.freeze({
    key: 'identical',
    label: 'The live reading reproduces the frozen structure',
    rank: 3,
    tone: 'good',
    detail: 'Every frozen figure the comparison uses is reproduced exactly by the reading taken now. That is a claim about reproduction, not about the pool being fair.',
  }),
]);

const FREEZE_BY_KEY = new Map(MERIT_STRUCTURE_FREEZE_VERDICTS.map((v) => [v.key, v]));
export function meritStructureFreezeVerdict(key) {
  return FREEZE_BY_KEY.get(String(key || '')) || null;
}

/* --------------------------------------------------------------- frameworks */

export const MERIT_STRUCTURE_FRAMEWORKS = Object.freeze([
  Object.freeze({
    key: 'bitemporal',
    name: 'Snodgrass (1999), valid time vs transaction time',
    applied: 'The day a reporting line was TRUE and the day it was RECORDED are different facts. This reading asks the ledger about the day the money takes effect, so a later move cannot rewrite what the earlier decision was made under.',
  }),
  Object.freeze({
    key: 'audit-trail',
    name: 'COSO (2013) control activities; IIA evidence sufficiency',
    applied: 'A frozen decision record that cannot reproduce the authority in force on the decision date does not support the decision. The structure is frozen beside the money, not beside the calendar.',
  }),
  Object.freeze({
    key: 'disclosure-control',
    name: 'Statistical disclosure control (house convention, ADR-0139 / ADR-0126)',
    applied: 'A figure the record cannot support is BLANK with its printed reason, never a zero and never a plausible default.',
  }),
]);
