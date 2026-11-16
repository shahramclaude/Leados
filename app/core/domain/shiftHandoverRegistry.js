/**
 * app/core/domain/shiftHandoverRegistry.js — the closed vocabulary of the
 * Shift Handover & Two-Key Readback Ledger (ADR-0223, Schema v178,
 * `RULE-SHO-01`, CSV scope #165, `#/shift-handover`).
 *
 * THE DUTY, IN AN OPERATOR'S WORDS. The day crew leaves a station abnormal:
 * a waiver that expires at 02:00, an interlock jumpered and tagged out, an
 * action owned by "maintenance, Wednesday". The night crew — often on a
 * SECOND, matrix line (shared-services or on-call cover) — walks in, clocks
 * in, and works the board it was handed by the clock, not by a handover. The
 * workspace already models the routine the shift runs (`standardWork.js`),
 * whether the station can be manned (`stationCoverage.js`), the rest between
 * shifts (`workRest.js`) and designating leave cover (`dutyCoverage.js`) — but
 * nothing models the HANDOVER ITSELF: the dated outgoing brief, and the
 * incoming operator's explicit, two-key acceptance of it.
 *
 * THE TWO-KEY RULE, AND NOTHING BEYOND IT. A handover is not complete because
 * time passed, because somebody clocked in, or because the outgoing operator
 * typed a note. It is complete when the INCOMING operator — a different human
 * — records a dated readback: either a synthesis ("I understand the station is
 * abnormal because of X; I own actions A and B; if Y happens I will do Z") or a
 * formal dispute ("this handover is uncontained — the abnormality named here
 * has no safe contingency"). Both are I-PASS (Starmer et al., 2014, NEJM —
 * receiver synthesis) and HRO boundary-transfer practice (Patterson et al.,
 * 2004; Reason, 1990) applied to operational changeovers. The register never
 * infers the readback from a clock event, never scores an operator on handover
 * volume, and never treats an unsigned-for shift as a valid handover.
 *
 * THE GAP THIS CLOSES, QUOTED FROM THE RECORD RATHER THAN ASSERTED.
 *   - `altitudeRouter.js` names missed night-shift handovers in prose; no
 *     module models one.
 *   - `standardWork.js` models routines and their tiers; `stationCoverage.js`
 *     proves simultaneous staffing feasibility; `workRest.js` measures rest
 *     BETWEEN shifts; `dutyCoverage.js` designates absence cover. None of them
 *     holds a station-to-station boundary transfer with a receiver's key.
 *   - Word-boundary search of `app/` and `ROADMAP.md` for `shift handover`,
 *     `shift handoff`, `shift changeover`, `I-PASS`, `SBAR` and
 *     `turnaround handover` returns ZERO implementations before this build;
 *     broader semantic absence **[UNVERIFIED]**.
 *
 * THE FRAMEWORKS THIS ENCODES, AND NOTHING BEYOND THEM.
 *   1. I-PASS Handoff Bundle (Starmer et al., 2014, *NEJM*): illness SEVERITY,
 *      patient SUMMARY, ACTION list, SITUATION awareness & CONTINGENCY plan,
 *      receiver SYNTHESIS. Encoded as a severity declaration, a station
 *      summary, a structured open-action list, a written contingency and a
 *      receiver readback. [Citation details from memory, UNVERIFIED.]
 *   2. High-reliability organising — preoccupation with failure and reluctance
 *      to simplify (Weick & Sutcliffe, 2001/2015; Patterson et al., 2004):
 *      the dispute path exists because an abnormal handover that nobody can
 *      accept safely is a fact the system must surface, not absorb.
 *   3. Reason (1990) — boundary loss at shift change is where defences fail
 *      silently. The two-key readback is the engineered barrier; a missing
 *      readback past its due instant is the failed barrier, and it is
 *      escalated, never waved through.
 *   4. Matrix accountability (ADR-0140/ADR-0141): day shift on the plant line,
 *      night cover on a shared-services line — the handover is counted ONCE;
 *      an overdue or disputed handover escalates to the lowest seat above
 *      EVERY line of both operators (`matrixJointApex`), never to one peer
 *      line over another.
 *   5. Just Culture (ADR-0217/0218 posture): the ledger records what was said
 *      at the boundary. It is never used to rate, rank or score an operator —
 *      handover counts are context for a changeover debrief, not a league
 *      table, and this register prints no per-person score.
 *
 * WHAT IT NEVER DOES. It never clocks anybody in or out; never infers a
 * handover from a roster, a calendar or a clock event; never auto-closes an
 * uncontained handover; never assigns or re-assigns an action's owner (an
 * unowned action is printed as unowned); never converts a disputed handover
 * into a contained one; never rates a person; and never edits history — a
 * cancelled or contained brief is immutable.
 */

export const SHO_ENGINE_VERSION = 'shift-handover-2026.11-v1';
export const SHO_ADR = 'ADR-0223';
export const SHO_RULE_ID = 'RULE-SHO-01';
export const SHO_ROUTE = 'shift-handover';
export const SHO_HREF = '#/shift-handover';
export const SHO_CSV_SCOPE = 'shift-handover';
export const SHO_MARKER_KIND = 'shift-handover';

export const SHO_EVENTS = Object.freeze({
  DECLARED: 'shiftHandover.brief.declared',
  CANCELLED: 'shiftHandover.brief.cancelled',
  READBACK: 'shiftHandover.readback.recorded',
  SCANNED: 'shiftHandover.scan',
});
export const SHO_EVENT_PREFIX = 'shiftHandover.';

/**
 * Three rights. Both the brief and the readback are FIRST-PERSON acts: the
 * outgoing operator writes the brief they hand over, and only the declared
 * incoming operator turns their key. Any seat on the chain may read the
 * register (at the redaction band its rank earns); the scan that files the
 * rule's asks requires the declare right, because it is the writer's scan.
 */
export const SHO_RIGHTS = Object.freeze({
  READ: 'read-shift-handover',
  DECLARE: 'declare-shift-handover',
  READBACK: 'readback-shift-handover',
});

export const SHO_LIMITS = Object.freeze({
  briefs: 400,
  readbacks: 800,
  markers: 400,
  stationRefMin: 3,
  stationRefMax: 120,
  textMin: 24,
  textMax: 600,
  abnormalitiesMax: 600,
  actionTextMin: 8,
  actionTextMax: 300,
  actionsMax: 12,
  reasonMin: 24,
  /** A readback is owed at changeover; 72h is the outside bound for a cover gap. */
  dueMaxHours: 72,
  briefsShown: 40,
  readbacksShown: 60,
  yearMin: 2000,
  yearMax: 2100,
  dayMin: '2000-01-01',
  dayMax: '2100-12-31',
});

export const SHO_SETTING_KEYS = Object.freeze({
  autoPropagate: 'shiftHandoverAutoPropagate',
});

export const SHO_DEFAULTS = Object.freeze({
  autoPropagate: true,
});

export const SHO_BOUNDS = Object.freeze({
  autoPropagate: 'boolean',
});

/* ------------------------------------------------------------- vocabulary */

/**
 * I-PASS severity, operationalised. A closed list on purpose: a free-text
 * severity makes every total a matter of spelling. `emergency` means the
 * station is not safely operable without active containment right now.
 */
export const SHO_SEVERITIES = Object.freeze([
  Object.freeze({ key: 'routine', label: 'Routine — no abnormalities; standard board handed over' }),
  Object.freeze({ key: 'watch', label: 'Watch — an abnormality exists and is stable; eyes on it' }),
  Object.freeze({ key: 'abnormal', label: 'Abnormal — outside standard; active mitigation in place' }),
  Object.freeze({ key: 'emergency', label: 'Emergency — station not safely operable without containment now' }),
]);
export const SHO_SEVERITY_KEYS = Object.freeze(SHO_SEVERITIES.map((row) => row.key));

export const SHO_READBACK_KINDS = Object.freeze([
  Object.freeze({ key: 'synthesized', label: 'Synthesized — receiver reads back the situation, the actions and the contingency in their own words' }),
  Object.freeze({ key: 'disputed', label: 'Disputed — receiver cannot safely accept the station; named reason required' }),
]);
export const SHO_READBACK_KEYS = Object.freeze(SHO_READBACK_KINDS.map((row) => row.key));

/** Derived states, never stored. `overdue` is a modifier printed beside the state. */
export const SHO_STATES = Object.freeze([
  Object.freeze({ key: 'awaiting-readback', label: 'Awaiting readback — the incoming key has not turned' }),
  Object.freeze({ key: 'disputed', label: 'Disputed — the incoming operator refused safe acceptance, with a reason' }),
  Object.freeze({ key: 'contained', label: 'Contained — the incoming operator synthesized the handover; two keys turned' }),
  Object.freeze({ key: 'cancelled', label: 'Cancelled — the changeover did not happen; the brief never took effect' }),
]);
export const SHO_STATE_KEYS = Object.freeze(SHO_STATES.map((row) => row.key));

export const SHO_REFUSALS = Object.freeze({
  notSeated: 'The declared seat is unresolved and read-only. Choose a valid seat first.',
  notFound: 'That row is not on this record. Nothing was saved.',
  cancelled: 'This handover was cancelled. A cancelled changeover is history and is never revived; declare a new brief at the next changeover.',
  contained: 'This handover is already contained — the incoming key turned. History is never edited afterwards.',
  superseded: 'That readback is already history. Only the latest act decides the state; earlier acts are never withdrawn or edited.',
});

export const shoSeverity = (key) => SHO_SEVERITIES.find((row) => row.key === key) || null;
export const shoReadbackKind = (key) => SHO_READBACK_KINDS.find((row) => row.key === key) || null;
export const shoState = (key) => SHO_STATES.find((row) => row.key === key) || null;

/* ------------------------------------------------------------------ method */

export const SHO_METHOD = Object.freeze({
  engine: SHO_ENGINE_VERSION,
  adr: SHO_ADR,
  frameworks: Object.freeze([
    'I-PASS Handoff Bundle (Starmer et al., 2014, NEJM) — severity, summary, action list, situation awareness & contingency, receiver synthesis [citation details UNVERIFIED]',
    'High-reliability organising (Weick & Sutcliffe, 2001/2015; Patterson et al., 2004) — preoccupation with failure; the dispute path keeps an unacceptable handover visible instead of absorbed',
    'Reason (1990) — boundary loss at shift change is a latent-failure site; the two-key readback is the engineered barrier',
    'Matrix accountability (ADR-0140/ADR-0141) — one handover is counted once; an uncontained one escalates to the lowest seat above EVERY line of both operators, never to one peer line',
    'Just Culture (ADR-0218 posture) — the ledger records what was said at the boundary; it never rates a person and prints no per-operator score',
  ]),
  printed: Object.freeze([
    'A handover is contained only when the DECLARED incoming operator records a dated synthesis — never by clock-in, never by silence, never by the outgoing operator.',
    'A disputed handover stays disputed until the incoming operator records a later synthesis; nothing converts a refusal into acceptance.',
    'An overdue, uncontained handover escalates to the joint seat above EVERY line of both operators; a disconnected graph escalates to nobody and says so.',
    'Unowned open actions are counted and printed as unowned; the register never invents an owner.',
    '“Counts reconcile” (the rows add up) and “the figures are complete” (nothing is overdue) are different claims and are reported separately.',
    'Handover volume is printed as context for a changeover debrief, never as a per-person score.',
  ]),
  deliberatelyAbsent: Object.freeze([
    'No clock-in/clock-out inference — a roster event is never treated as a readback.',
    'No rating, ranking or league table of operators by handover counts or wording.',
    'No automatic assignment or re-assignment of an action’s owner.',
    'No conversion of a disputed handover into a contained one, ever.',
    'No editing of history — contained and cancelled briefs are immutable.',
    'No pooling or inventing of cross-line coverage: a cover arrangement is declared by a human or it does not exist here.',
  ]),
});

/* ------------------------------------------------------------------ CSV #165 */

export const SHO_CSV_COLUMNS = Object.freeze([
  'as_of', 'row_kind', 'key', 'severity', 'state',
  'declared', 'contained', 'disputed', 'awaiting', 'overdue',
  'unowned_actions', 'blank_reason',
]);

/**
 * CSV #165 (ADR-0223, Schema v178). IDENTITY-FREE BY CONSTRUCTION. One summary
 * row, one row per severity and one row per state. No outgoing operator, no
 * incoming operator, no station reference, no action text and no dispute reason
 * crosses this boundary. A figure the reader cannot compute exports BLANK with
 * its reason, never a zero.
 */
export const SHO_CSV_DESCRIPTOR = Object.freeze({
  key: SHO_CSV_SCOPE,
  label: 'Shift handover & two-key readback (aggregate)',
  group: 'operations',
  sensitive: true,
  filenameSlug: 'shift-handover',
  description: 'One summary row, one row per severity and one row per state. Every figure is an exact integer count over the whole record. No operator, station, action, synthesis or dispute reason is exported; an uncomputable figure is blank with its reason, never zero.',
});

export const SHO_SECTION_TITLES = Object.freeze({
  briefs: 'Briefs',
  readbacks: 'Readbacks & disputes',
  escalations: 'Escalations',
  method: 'Method',
});
