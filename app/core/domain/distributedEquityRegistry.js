/**
 * app/core/domain/distributedEquityRegistry.js — the closed vocabulary of the
 * Distributed-Work Equity Register (ADR-0238, Schema v193, `#/distributed-equity`,
 * CSV scope #179, `RULE-DWE-01`).
 *
 * THE DUTY, IN A FRONTLINE MANAGER'S WORDS. *"My team spans four time zones.
 * Somebody is always on the 23:00 call — and it is always the same somebody.
 * Who is carrying the unsociable hour, which line convenes it, and is the
 * burden shared or concentrated?"* No surface in the workspace could answer
 * any part of that. The meeting-load ledger (ADR-0169) counts how MANY minutes
 * a person sat in; it reads no clock and no calendar of when those minutes
 * fell in the attendee's own day. The work/rest recovery ledger (ADR-0209)
 * reads wall clocks, but only for rostered shifts of consented shift workers —
 * a salaried engineer in another zone is not a shift and must not be forced
 * into that register's vocabulary. The recognition ledger counts praise, never
 * the clock under which the praised work was done.
 *
 * THE GAP THIS CLOSES, QUOTED FROM THE RECORD RATHER THAN ASSERTED.
 *   - Word-boundary searches of `app/` before this build return ZERO files for
 *     `unsociable`, ZERO for `proximity bias`, ZERO for `after-hours` as a
 *     burden figure, and ZERO for a per-person working window in any collection.
 *     The only time-zone machinery in the workspace is `workRestTime.js`, which
 *     serves the shift registers. Wider absence **[UNVERIFIED]**.
 *   - ROADMAP.md's planned ledger list carried no distributed-work item before
 *     Session 250's work/rest recovery discovery, and that item is shift-work.
 *
 * THE FRAMEWORKS THIS ENCODES, AND NOTHING BEYOND THEM.
 *   1. Fatigue-science "unsociable hours" convention — work outside a person's
 *      declared daily working window is counted as burden; the window is a
 *      DECLARATION with a written source, never an inference from observed
 *      behaviour [citation details UNVERIFIED].
 *   2. Concentration measurement — the share of a scope's burden carried by its
 *      single most-burdened member, compared with the even share (1/n) at a
 *      declared 2× threshold, below declared evidence floors it refuses. A
 *      Herfindahl-style concentration reading was considered and deliberately
 *      NOT taken: with the small n a real team has, the top-share against the
 *      even share says the same thing and can be checked in the leader's head.
 *   3. Matrix accountability (ADR-0140/ADR-0141) — a person with several lines
 *      is measured ONCE; the burden a sitting convenes is attributed to the
 *      chair's line ONLY when the chair holds exactly one of that attendee's
 *      active declared lines; a genuine ambiguity is named, never split.
 *   4. Bulletproof Reliability Mandate — "the figures add up" and "the printed
 *      figures are the computed figures" are two claims, reported separately;
 *      a cell the record cannot support is refused with its reason, never a
 *      zero, a blank that reads as reassurance, or a plausible default.
 *
 * WHAT THE REGISTER HOLDS. Two ledgers and identity-free rule markers: working
 * windows (one active declaration per person: IANA zone + daily wall-clock
 * start/end + written source), unsociable-hour sittings (one dated sitting:
 * wall-clock start, whole minutes, IANA zone, attendees, chair), and markers
 * the rule writes when nobody can be asked. Every burden figure, share and
 * verdict is re-derived on read. Nothing derived is stored.
 *
 * WHAT IT NEVER DOES. It never infers a window from observed behaviour; never
 * assumes a zone from the device; never splits a person's burden across their
 * lines; never converts a wall time between zones by a rounded offset; never
 * rates, ranks or scores a person; never cancels or reschedules a sitting; and
 * never decides that a burden is acceptable — it prints what the record shows.
 */

export const DWE_ENGINE_VERSION = 'distributed-equity-2026.11-v1';
export const DWE_ADR = 'ADR-0238';
export const DWE_RULE_ID = 'RULE-DWE-01';
export const DWE_ROUTE = 'distributed-equity';
export const DWE_HREF = '#/distributed-equity';
export const DWE_CSV_SCOPE = 'distributed-equity';
export const DWE_MARKER_KIND = 'distributed-equity';

export const DWE_EVENTS = Object.freeze({
  WINDOW_DECLARED: 'distributedEquity.window.declared',
  WINDOW_WITHDRAWN: 'distributedEquity.window.withdrawn',
  SITTING_DECLARED: 'distributedEquity.sitting.declared',
  SITTING_RETRACTED: 'distributedEquity.sitting.retracted',
  CONVENTIONS_SET: 'distributedEquity.conventions.set',
  SCANNED: 'distributedEquity.scan',
});
export const DWE_EVENT_PREFIX = 'distributedEquity.';

/**
 * Two rights. Reading who carries the unsociable hour is individual material:
 * open at every rank, with the reader disclosing per-person rows only below the
 * executive altitude and counts above it. Declaring a window for another
 * person, a sitting, or the conventions is a leader's act — narrowed inside
 * the action to a seat that can reach the person through the tree or a
 * declared line.
 */
export const DWE_RIGHTS = Object.freeze({
  READ: 'read-distributed-equity',
  DECLARE: 'declare-distributed-equity',
});

export const DWE_LIMITS = Object.freeze({
  windows: 400,
  sittings: 800,
  markers: 400,
  textMin: 24,
  textMax: 600,
  idMax: 120,
  /** One sitting is a meeting, not a shift: it cannot run past eight hours. */
  minutesMax: 480,
  attendeesMax: 40,
  /** A working window is one day's span; overnight windows end on the next day. */
  windowMinutesMax: 900,
  dayMin: '2000-01-01',
  dayMax: '2100-12-31',
  rowsShown: 60,
});

export const DWE_SETTING_KEYS = Object.freeze({
  autoPropagate: 'dweAutoPropagate',
  outsideMinutesCeiling: 'dweOutsideMinutesCeiling',
  windowDays: 'dweWindowDays',
  equityMinPeople: 'dweEquityMinPeople',
  equityMinSittings: 'dweEquityMinSittings',
  equityMinOutsideMinutes: 'dweEquityMinOutsideMinutes',
});

export const DWE_DEFAULTS = Object.freeze({
  autoPropagate: true,
  /** Unsociable-hour ceiling per person per trailing window, whole minutes. */
  outsideMinutesCeiling: 600,
  /** The trailing window the ceiling and the verdicts are measured over. */
  windowDays: 28,
  equityMinPeople: 3,
  equityMinSittings: 3,
  equityMinOutsideMinutes: 120,
});

export const DWE_BOUNDS = Object.freeze({
  outsideMinutesCeiling: { min: 0, max: 3_000 },
  windowDays: { min: 7, max: 90 },
  equityMinPeople: { min: 2, max: 20 },
  equityMinSittings: { min: 1, max: 30 },
  equityMinOutsideMinutes: { min: 0, max: 3_000 },
});

/* ------------------------------------------------------------- vocabulary */

export const DWE_REFUSALS = Object.freeze({
  notSeated: 'The declared seat is unresolved and read-only. Choose a valid seat first.',
  notFound: 'That row is not on this record. Nothing was saved.',
});

/**
 * Why a working window can make a person's cells unreadable. Every reason is
 * printed beside the blank it causes — never folded into a zero.
 */
export const DWE_WINDOW_REFUSALS = Object.freeze({
  none: 'No working window is declared for this person. Their unsociable minutes are unknown, not zero.',
  ambiguous: 'More than one active working window is on the record for this person. The register refuses to choose between them.',
  badZone: 'The declared window names a time zone this device does not know. The window is unreadable until it is re-declared with an IANA zone.',
  badBounds: 'The declared window’s wall times do not read as a real daily span. The window is unreadable until it is re-declared.',
});

/**
 * Why a sitting can be refused whole. A refused sitting contributes to nobody’s
 * totals: a partial sum printed as a total understates the burden.
 */
export const DWE_SITTING_REFUSALS = Object.freeze({
  unknownAttendee: 'A named attendee is not on the active roster. Charging the attendees we recognise would silently shrink the room.',
  archivedAttendee: 'A named attendee is archived. An archived person cannot have attended, and charging the rest would shrink the room.',
  badZone: 'The sitting’s time zone is not one this device knows. No attendee’s burden can be placed in their own day.',
  badTime: 'The sitting’s start is not a real wall-clock time. No attendee’s burden can be placed in their own day.',
  nonexistent: 'The sitting’s start does not exist in its zone: the clocks moved forward across it. Declare the time the clock actually showed.',
  unresolvable: 'The sitting’s start occurs twice in its zone and the record does not say which occurrence is meant.',
  badMinutes: 'The sitting carries no readable whole-minute duration. No attendee’s burden can be counted from it.',
});

/* ------------------------------------------------------------------ method */

export const DWE_METHOD = Object.freeze({
  engine: DWE_ENGINE_VERSION,
  adr: DWE_ADR,
  frameworks: Object.freeze([
    'Unsociable hours (fatigue science) — work outside a person’s declared daily working window is burden; the window is a sourced declaration, never inferred from behaviour [citation details UNVERIFIED]',
    'Concentration — the top share of a scope’s burden against the even share (1/n) at a declared 2× threshold, refused below declared evidence floors',
    'Matrix accountability (ADR-0140/ADR-0141) — a person with several lines is measured once; convening is attributed to a chair’s line only when it holds exactly one of the attendee’s active declared lines',
    'Bulletproof Reliability Mandate — the parts re-add, and the printed figures are the computed figures, as two separate printed claims',
  ]),
  printed: Object.freeze([
    'Every burden figure is an exact whole minute placed in the attendee’s own day with DST-safe integer arithmetic; nothing is rounded.',
    'A sitting is placed by resolving its wall-clock start in its own zone, and the attendee’s window by resolving the window’s wall times in the attendee’s zone on the attendee’s local day.',
    'A window boundary that falls in a DST gap is refused for that reading with its reason; one that occurs twice resolves to the FIRST occurrence and says so.',
    'A person with no declared window, an ambiguous window pair, or an unreadable zone has BLANK cells with the reason — never a zero.',
    'A sitting with an unknown or archived attendee is refused whole, and the refusal is counted.',
    'The equity verdict prints the top share and the even share it is compared against, and the floors it needed.',
  ]),
  deliberatelyAbsent: Object.freeze([
    'No window inferred from observed calendar or behaviour, and no device zone assumed for a person.',
    'No proximity-bias cross-read (recognition, delegation and growth flows by zone) in this register — that is a logged separate gap.',
    'No rating, scoring or judgement of a person: the register measures the clock, not the human.',
    'No pooled offset arithmetic: a wall time is resolved in its own zone or the reading is refused.',
    'No cancellation, rescheduling or attendance tracking: the register reads declared sittings, not invitations.',
  ]),
});

/* ------------------------------------------------------------------ CSV #179 */

export const DWE_CSV_COLUMNS = Object.freeze([
  'as_of', 'row_kind', 'key', 'people_n', 'sittings_n',
  'minutes_total', 'outside_minutes', 'convened_outside_minutes',
  'even_share_bp', 'top_share_bp', 'verdict',
  'ceiling', 'over_ceiling_n', 'unreadable_n', 'refused_sittings_n',
  'complete', 'blank_reason',
]);

/**
 * CSV #179 (ADR-0238, Schema v193). IDENTITY-FREE BY CONSTRUCTION. One summary
 * row and one row per convening line, exported as `L01…` codes in a stable
 * order. No person id, no person name, no window, no wall time, no zone, no
 * note and no sitting detail crosses this boundary: the person rows exist only
 * on the screen, below the executive altitude. A figure the reader cannot
 * compute exports BLANK with its reason, never a zero.
 */
export const DWE_CSV_DESCRIPTOR = Object.freeze({
  key: DWE_CSV_SCOPE,
  label: 'Distributed-work equity (aggregate)',
  group: 'people',
  sensitive: true,
  filenameSlug: 'distributed-equity',
  description: 'One summary row and one row per convening line (as a stable L-code): people with declared windows, sittings read, exact minutes total and outside the declared working window, the top share against the even share, the verdict, the ceiling, and the counts that make the coverage claim. No person, window, wall time, zone or note is exported; an uncomputable figure is blank with its reason, never zero.',
});

export const DWE_SECTION_TITLES = Object.freeze({
  register: 'Register',
  burden: 'Burden',
  lines: 'Lines',
  method: 'Method',
});
