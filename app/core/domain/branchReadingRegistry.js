/**
 * app/core/domain/branchReadingRegistry.js — the Branch Reading hand-off
 * (ADR-0129, Schema v118, Session 175).
 *
 * THE GAP THIS CLOSES
 * -------------------
 * ADR-0126 gave the chief a disclosure floor on the direct-branch comparison,
 * and it worked: a cell describing fewer contributing seats than the declared
 * floor prints WITHHELD with its reason, one further released cell is withheld
 * beside it, and the pooled rate is refused. The chief's table became safe.
 *
 * It also became blind. A withheld branch now carries NO continuity signal at
 * all, so the chief reviewing cross-division exposure either guesses, walks the
 * corridor, or quietly asks an analyst to read the file out of band — which is
 * the disclosure the floor was supposed to stop, minus the audit trail.
 *
 * The missing piece is the one the floor forces into existence: a GOVERNED
 * HAND-OFF. The chief asks the branch's own leader for a reading of their own
 * register. The leader answers with a band — computed by the register, not
 * typed — and their own words, on a dated day. The chief receives the band and
 * the words, never a count. The signal is restored without the figure.
 *
 * WHAT MAKES THIS A DISCLOSURE LEDGER AND NOT A DASHBOARD
 * -------------------------------------------------------
 *   - The BAND IS DERIVED AT PUBLISH TIME from the publisher's own register and
 *     frozen with the day. `branchReadingPublish` accepts no band at all, so a
 *     leader cannot type \"we are fine\" into a field; and the band does not drift
 *     afterwards, because a published statement is a dated act, not a view.
 *   - IT LAPSES. A reading published in July is not a reading about September:
 *     after `dutyCoverageReadingValidDays` the chief's cell prints LAPSED and
 *     the signal must be asked for again. Consent to disclose is bounded in
 *     time or it is not bounded at all (the ADR-0127 `lapsed` reasoning).
 *   - DECLINING IS AN ANSWER. A branch leader who declines is recorded, printed
 *     and counted — and opens NO governed decision. A refusal that automatically
 *     escalates is not a refusal, and this module exists inside an organisation
 *     where a director is allowed to say \"not this one, ask me directly\".
 *   - NOTHING IS ATTRIBUTED DOWNWARD AS AN OBLIGATION. The ask carries a
 *     deadline so the CHIEF knows whether to chase; the deadline does not
 *     authorise anything, assign anything, or grade anyone.
 *
 * THE ABSENCE THIS TEACHES (named, not paraphrased)
 * ------------------------------------------------
 *   - Statistical disclosure control: primary + complementary cell suppression
 *     (Willenborg & de Waal 2001) protects the figure and destroys the analytic
 *     value; the standard remedy is a governed, coarser release request — which
 *     is what this module is, with the requester and releaser kept apart.
 *   - Subsidiarity (Aghion & Tirole 1997; the ADR-0075 ladder): the seat that
 *     holds the detail answers for releasing it. The chief never reads the
 *     cell; the branch's own leader states its condition.
 *   - Kahn (1990) / Weick & Sutcliffe (2007): a signal nobody is asked for is a
 *     signal nobody gives. Silence was never the same thing as \"holding\".
 *   - Edmondson (1999): a decline that is safe to give is the reason the
 *     published readings can be believed.
 */

export const BRANCH_READING_ENGINE_VERSION = 'branch-reading-2026.11-v1';

export const BRANCH_READING_EVENTS = Object.freeze({
  REQUEST: 'branchReading.requested',
  WITHDRAW: 'branchReading.withdrawn',
  PUBLISH: 'branchReading.published',
  DECLINE: 'branchReading.declined',
  REVOKE: 'branchReading.revoked',
});

export const BRANCH_READING_ASK_STATUSES = Object.freeze(['open', 'withdrawn']);

/** The only two answers a named branch leader can give. */
export const BRANCH_READING_ANSWERS = Object.freeze(['published', 'declined']);

/**
 * The disclosed vocabulary. Deliberately FOUR coarse states over the whole
 * branch, never a count: the band is the coarsest statement that still carries
 * the continuity signal a chief needs to act on.
 */
export const BRANCH_READING_BANDS = Object.freeze(['holding', 'thin', 'exposed', 'unknown']);

export const BRANCH_READING_BAND_LABELS = Object.freeze({
  holding: 'holding',
  thin: 'thin',
  exposed: 'exposed',
  unknown: 'cannot say',
});

/** Derived on every read; never stored. */
export const BRANCH_READING_STATES = Object.freeze([
  'not-asked', 'asked', 'overdue', 'published', 'declined', 'withdrawn', 'lapsed',
]);

export const BRANCH_READING_STATE_LABELS = Object.freeze({
  'not-asked': 'not asked',
  asked: 'asked',
  overdue: 'overdue',
  published: 'reading published',
  declined: 'declined',
  withdrawn: 'withdrawn',
  lapsed: 'reading lapsed',
});

/** The two typed relations this module writes. */
export const BRANCH_READING_RELATIONS = Object.freeze({
  /** ask → the person whose branch it is about. */
  ASKS: 'requests-reading-from',
  /** reading/decline → the ask it answers. */
  ANSWERS: 'answers-reading-ask',
});

export const BRANCH_READING_LIMITS = Object.freeze({
  /** Minimum words for an ask, a publish and a decline. A wordless act is a tick. */
  minWords: 8,
  minReasonWords: 6,
  noteChars: 400,
  reasonChars: 300,
  askCap: 300,
  readingCap: 300,
});

export const BRANCH_READING_PREMISE = 'A branch cell below the disclosure floor is withheld so that no rate can describe the few people inside it — and that leaves the chief holding no continuity signal at all, which is arithmetic privacy bought with blindness. A branch reading is the governed hand-off that restores the signal without the figure: the branch’s own leader reads their own register and publishes the BAND it grades into — holding, thin, exposed or cannot say — in their own words, on a dated day. The band is computed by the register and never typed; the chief receives the band and the words and no count; the reading lapses after a declared number of days, because a reading published in July is not a reading about September. Declining is a legitimate answer, it is printed as one, and it opens no decision: this module never turns a chief’s question into a branch leader’s obligation.';

export const BRANCH_READING_REFUSALS = Object.freeze({
  unresolvedSeat: 'The declared seat is unresolved and read-only; a reading cannot be requested or given from a boundary that does not resolve.',
  operatorView: 'The undeclared operator view reads every seat’s register directly, so no cell is withheld from it. A reading exists only where a floor withholds a cell.',
  notAChiefOfThatBranch: 'A branch reading is requested by the seat whose own table withholds the cell, one level above the branch. A peer or a lower seat cannot ask across.',
});
