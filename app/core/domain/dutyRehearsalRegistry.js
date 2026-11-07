/**
 * app/core/domain/dutyRehearsalRegistry.js — Explicit rehearsal records, or
 * "the evidence of practice was never an act anyone recorded" (ADR-0128,
 * Schema v117).
 *
 * THE GAP THIS CLOSES
 * -------------------
 * ADR-0121 derives "exercised" from dated work: a record of the duty's
 * declared sources touching the holder's span with the cover's name on it.
 * ADR-0125 tightened that derivation to the exact preparation window ending
 * the day before an absence starts. Both readings are INFERENCES. A cover who
 * was cc'd on one case in the span grades identically to a cover the holder
 * personally walked through the shift checklist — because the only evidence
 * the register can see is work that happened to name them. Nobody ever
 * recorded the act of practising the duty itself.
 *
 * THE REAL DUTY THIS SERVES
 * -------------------------
 * A frontline lead handing the shift to a declared cover does not ask "has
 * Jordan's name been on anything in my span lately". They ask: *did Jordan
 * actually walk this duty with me or under my eyes, on a dated day, before I
 * leave — and if we found gaps, what changes before the window opens?* That
 * is a rehearsal, and rehearsal practice (drills, tabletop walkthroughs,
 * shadowing, supervised practice — the fire-service and aviation tradition
 * where an unexercised plan is treated as unproven, and Klein's
 * recognition-primed decision work on practised patterns) says the drill is
 * worth exactly as much as its record: a rehearsal nobody wrote down is a
 * rehearsal the next leader cannot rely on, re-derive or re-run.
 *
 * WHAT IS DECLARED HERE AND WHAT IS DERIVED
 * -----------------------------------------
 * DECLARED: the rehearsal itself — one dated human act recording that a
 * specific declared cover practised a specific duty line on a specific day,
 * in a specific mode, with an outcome (ready, or gaps found and named), in
 * the recorder's own words, plus the governed decision a gaps-found
 * rehearsal opens.
 *
 * DERIVED, never stored: whether the rehearsal falls inside a given
 * absence's preparation window, the `rehearsed` / `gaps` window-exercise
 * statuses, the attestation strength (holder / supervisor / self), every
 * count in the plan, roll-up, concurrency sweep, brief and CSV. A stored
 * "rehearsed" flag would be a second, decaying record of the same fact — the
 * exact failure ADR-0121 refused for "exercised".
 *
 * WHY AN EXPLICIT RECORD OUTRANKS INFERRED WORK — BUT NEVER ERASES IT
 * -------------------------------------------------------------------
 * A ready rehearsal inside the preparation window grades ABOVE dated-work
 * evidence (`rehearsed` beats `valid`) because it is a deliberate act of
 * attestation rather than a side-effect of workflow. Inferred work evidence
 * is not deleted or demoted: a workspace with no rehearsal records reads
 * exactly as it did under ADR-0125. The register distinguishes the two and
 * prints which is which — it never silently upgrades a cc'd case into a
 * certified rehearsal, and never downgrades honest dated work to nothing.
 *
 * A GAPS-FOUND REHEARSAL IS NOT READINESS
 * ---------------------------------------
 * Recording outcome `gaps` is the drill doing its job: the exposure is found
 * BEFORE the absence instead of during it. A gaps rehearsal therefore does
 * NOT make the cover exercised — it prints its own `gaps` status, keeps the
 * duty line thin-on-certified-evidence, and opens a governed decision naming
 * what must change before the window. A machine that turned every drill into
 * a green badge would make rehearsing counter-productive.
 *
 * WHY NO NEW AUTOMATION RULE
 * --------------------------
 * Nothing here should be engine-assigned. The workspace does not schedule
 * rehearsals, remind anyone to run one, mark a cover "rehearsed" from a
 * calendar invite, or infer an attestation from a cc list: it RECORDS the
 * dated human act when a seat that could have been there performs it, PRINTS
 * what the record proves and what it does not, and rolls the counts up the
 * chain. An attestation written by nobody present is an invented
 * observation, and inventing one is what this ledger exists to make
 * impossible.
 */

export const DUTY_REHEARSAL_ENGINE_VERSION = 'duty-rehearsal-2026.11-v1';

export const DUTY_REHEARSAL_EVENTS = Object.freeze({
  RECORD: 'dutyRehearsal.recorded',
  GAPS: 'dutyRehearsal.gapsFound',
  REVOKE: 'dutyRehearsal.revoked',
  SCAN: 'dutyRehearsal.scan',
});

/**
 * The one typed relation this module writes: a rehearsal record ATTESTS THE
 * REHEARSAL OF the declared cover row it is evidence for. Deliberately a new
 * relation rather than a re-use of `prepares-for` (a person prepares for a
 * duty) or `accepts-standby-for` (a person answered an ask): this edge says a
 * dated practice of a specific duty by a specific declared cover was observed
 * and recorded. Three facts, three edges, and a rehearsal can be revoked
 * without erasing the declaration or the answer it sits beside.
 */
export const DUTY_REHEARSAL_RELATION = 'attests-rehearsal-of';

/**
 * The declared rehearsal modes. This is a small declared vocabulary, not free
 * text, because the strength of the evidence depends on what kind of practice
 * happened — and "we did a rehearsal" without a mode is a claim no reader can
 * weigh. The labels name the practice traditions they come from.
 */
export const DUTY_REHEARSAL_MODES = Object.freeze(['walkthrough', 'shadow', 'supervised', 'handover']);

export const DUTY_REHEARSAL_MODE_LABELS = Object.freeze({
  walkthrough: 'tabletop walkthrough of the duty',
  shadow: 'shadowing the holder on the duty',
  supervised: 'supervised practice — the cover performed the duty under observation',
  handover: 'live handover run for the declared window',
});

/**
 * The two outcomes. `ready` is an attestation that the cover can answer the
 * duty; `gaps` is an attestation that the rehearsal FOUND something that must
 * change first, and it opens a governed decision in the same transaction.
 * There is no third state and no "partial": a rehearsal either certifies or
 * it names what it found.
 */
export const DUTY_REHEARSAL_OUTCOMES = Object.freeze(['ready', 'gaps']);

/**
 * The derived attestation strength. Never stored — re-derived on every read
 * from the recorder seat against the roster:
 *
 *   holder      the duty holder recorded it (the strongest: the person who
 *               owns the duty says the cover practised it)
 *   supervisor  a leadership ancestor of the holder recorded it (observed
 *               from the span above)
 *   self        the cover recorded their own rehearsal — an accountable dated
 *               claim, printed as self-reported and never as an attestation
 *   third-party anyone else — refused at the action and DROPPED by the schema
 *               on reload, because a person with no seat at the duty could
 *               not have observed its rehearsal
 */
export const DUTY_REHEARSAL_ATTESTATIONS = Object.freeze(['holder', 'supervisor', 'self', 'third-party']);

export const DUTY_REHEARSAL_LIMITS = Object.freeze({
  /** Rehearsal rows the ledger will load in one read. */
  rehearsalCap: 600,
  /** Rehearsals printed per card before the remainder is counted. */
  rowCap: 40,
  /** Text clamps — the recorder's own words, never summarised. */
  noteChars: 300,
  /**
   * Longest accepted lag between the rehearsal day and the recording day.
   * Attesting a drill from memory months later is not an observation any
   * reader can weigh; the record must follow the act inside a bounded window.
   */
  maxRecordLagDays: 60,
});

export const DUTY_REHEARSAL_PREMISE = 'Practice nobody recorded is practice the next leader cannot rely on. A rehearsal is one dated human act: a seat that was there — the duty holder, a leader above them, or the cover themselves — records that a declared cover walked a specific duty on a specific day, in a declared mode, and says whether the cover is ready or what the rehearsal found. A ready rehearsal inside the preparation window grades above inferred dated work; a rehearsal that found gaps opens a governed decision instead of a green badge. Nothing here schedules, reminds or certifies on anyone\u2019s behalf.';

/**
 * Why a reading refuses to grade rehearsals at all. Refusals are printed,
 * never zeroed: "no rehearsal was recorded" and "this seat cannot see the
 * rehearsal ledger" are different claims and are never allowed to look alike.
 */
export const DUTY_REHEARSAL_REFUSALS = Object.freeze({
  unresolvedSeat: 'The declared seat is unresolved and read-only, so the rehearsal ledger cannot say who observed what. Declare a seat before recording a rehearsal.',
  operatorView: 'A rehearsal is an attestation by a seat that was there — the duty holder, a leader above the holder, or the cover. The undeclared operator view observed nothing, so it records nothing.',
  noCovers: 'No active declared cover exists for that duty line, so there is nobody whose rehearsal could be attested. Declare the cover first; the rehearsal is evidence for an ask, not a substitute for one.',
});
