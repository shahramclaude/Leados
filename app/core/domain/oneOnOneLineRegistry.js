/**
 * app/core/domain/oneOnOneLineRegistry.js — closed vocabulary, conventions,
 * limits, CSV schema and named method of Matrix 1:1 Line Coverage
 * (Schema v132; ADR-0164, `#/matrix?panel=one-on-ones`, `RULE-OOL-01`,
 * and CSV scope #123 are reserved, not yet shipped).
 *
 * THE DEFECT THIS NAMES. A 1:1 was stored as `{ personId, date, status }` —
 * who it was WITH, never who HELD it. The cadence engine therefore answered
 * "when did anybody last sit down with this person?", and in a matrix that is
 * the wrong question: the functional manager's weekly meeting turned the
 * person green for the project manager who had not spoken to them in two
 * months, and the other way round. A silent line was masked by a busy one.
 *
 * Session 227 wires the holder, API-level human corrections and conventions;
 * Session 232 mounts the read-only coverage card on `#/oneonones`. The separate
 * `#/matrix` tab, RULE-OOL-01 and a registered CSV scope remain unbuilt; no
 * automatic silent-line tasks or CSV export are implied.
 *
 * Leaf module: no storage, no clock, no DOM, and no import with side effects,
 * so `schema.js`, the read model, the rule, the actions, `csv.js` and the
 * panel all read one source of truth.
 */

export const ONE_ON_ONE_LINE_ENGINE_VERSION = 'one-on-one-lines-2026.11-v1';
export const ONE_ON_ONE_LINE_RULE_ID = 'RULE-OOL-01';
export const ONE_ON_ONE_LINE_PANEL = 'one-on-ones';

export const ONE_ON_ONE_LINE_EVENTS = Object.freeze({
  CLAIMED: 'oneonone.line.claimed',
  RELEASED: 'oneonone.line.released',
  CONVENTIONS: 'oneonone.line.conventions.set',
  SCAN: 'oneonone.line.scan',
});

export const ONE_ON_ONE_LINE_RIGHTS = Object.freeze({
  /** Logging, claiming and releasing are the same class of first-person act. */
  LOG: 'log-oneonone',
  GOVERN: 'govern-oneonone-lines',
});

/**
 * How a holder came to be on the record. Closed: a holder whose basis is not
 * one of these is not an attributed act and is cleared on load, never kept.
 *   seat      stamped from the declared operating seat at the moment of logging
 *   claimed   a first-person claim by the manager who held it, after the fact
 *   declared  named by the undeclared operator view (a record, not a signature)
 */
export const ONE_ON_ONE_HOLDER_BASES = Object.freeze(['seat', 'claimed', 'declared']);
export const ONE_ON_ONE_HOLDER_BASIS_LABELS = Object.freeze({
  seat: 'logged under this manager’s seat',
  claimed: 'claimed by this manager afterwards',
  declared: 'named by the workspace operator',
});

/** Every held 1:1 of a person on more than one line lands in exactly one. */
export const ONE_ON_ONE_ATTRIBUTIONS = Object.freeze({
  home: 'home',
  line: 'line',
  other: 'other',
  dangling: 'dangling',
  unattributed: 'unattributed',
});
export const ONE_ON_ONE_ATTRIBUTION_KEYS = Object.freeze(Object.values(ONE_ON_ONE_ATTRIBUTIONS));
export const ONE_ON_ONE_ATTRIBUTION_LABELS = Object.freeze({
  home: 'Held by the home line',
  line: 'Held by an additional line',
  other: 'Held by somebody who holds no line today',
  dangling: 'Holder is no longer on the roster',
  unattributed: 'No holder recorded',
});

/** The seven states one (person, line) pair can be in. Mutually exclusive. */
export const ONE_ON_ONE_LINE_STATES = Object.freeze({
  ok: 'ok',
  due: 'due',
  overdue: 'overdue',
  never: 'never',
  fresh: 'new',
  unproven: 'unproven',
  exempt: 'exempt',
});
export const ONE_ON_ONE_LINE_STATE_KEYS = Object.freeze(Object.values(ONE_ON_ONE_LINE_STATES));
export const ONE_ON_ONE_LINE_STATE_LABELS = Object.freeze({
  ok: 'On cadence',
  due: 'Due',
  overdue: 'Overdue',
  never: 'Never held',
  new: 'New line',
  unproven: 'Cannot be read',
  exempt: 'No standing 1:1 owed',
});
export const ONE_ON_ONE_LINE_STATE_TONES = Object.freeze({
  ok: 'good', due: 'warn', overdue: 'bad', never: 'bad', new: 'neutral', unproven: 'warn', exempt: 'neutral',
});
/** A line in one of these states is PROVEN silent: the record itself says so. */
export const ONE_ON_ONE_LINE_SILENT_STATES = Object.freeze(['overdue', 'never']);

export const ONE_ON_ONE_PERSON_VERDICTS = Object.freeze({
  masked: 'masked',
  silent: 'silent',
  unproven: 'unproven',
  due: 'due',
  new: 'new',
  covered: 'covered',
});
export const ONE_ON_ONE_PERSON_VERDICT_LABELS = Object.freeze({
  masked: 'Masked silent line',
  silent: 'Silent line',
  unproven: 'Cannot be read',
  due: 'A line is due',
  new: 'New line awaiting its first 1:1',
  covered: 'Every owing line on cadence',
});
export const ONE_ON_ONE_PERSON_VERDICT_TONES = Object.freeze({
  masked: 'bad', silent: 'bad', unproven: 'warn', due: 'warn', new: 'neutral', covered: 'good',
});

/**
 * Person verdict, worst first. `masked` outranks `silent` because it is the
 * case every other screen gets wrong: the people list prints on-track.
 */
export function oneOnOnePersonVerdict({ masked = false, silentN = 0, unprovenN = 0, dueN = 0, newN = 0 } = {}) {
  if (masked) return ONE_ON_ONE_PERSON_VERDICTS.masked;
  if (silentN > 0) return ONE_ON_ONE_PERSON_VERDICTS.silent;
  if (unprovenN > 0) return ONE_ON_ONE_PERSON_VERDICTS.unproven;
  if (dueN > 0) return ONE_ON_ONE_PERSON_VERDICTS.due;
  if (newN > 0) return ONE_ON_ONE_PERSON_VERDICTS.new;
  return ONE_ON_ONE_PERSON_VERDICTS.covered;
}

/**
 * Declared conventions. Printed on the panel, clamped on load, refused (not
 * clamped) when re-declared, and never fitted from the record.
 *
 * The overdue threshold is the SAME 3/2 the per-person cadence engine has
 * always used (`oneonone.js`), written as an exact integer comparison
 * (2 x days > 3 x interval) so the two readings cannot disagree by rounding.
 */
export const ONE_ON_ONE_LINE_DEFAULTS = Object.freeze({
  lineCadenceDays: 28,
  minSharePct: 20,
  askDueDays: 7,
  autoPropagate: true,
});
export const ONE_ON_ONE_LINE_BOUNDS = Object.freeze({
  lineCadenceDays: Object.freeze([7, 180]),
  minSharePct: Object.freeze([0, 100]),
  askDueDays: Object.freeze([1, 60]),
});
export const ONE_ON_ONE_LINE_OVERDUE = Object.freeze({ numerator: 3, denominator: 2, label: '1.5 x the interval' });

export const ONE_ON_ONE_LINE_LIMITS = Object.freeze({
  /** Idempotency markers kept; the oldest is displaced first. */
  markers: 800,
  /** Dated asks RULE-OOL-01 may issue in ONE transaction; the rest is counted and retried. */
  asksPerCommit: 8,
  /** Unattributed meetings listed for attribution on one page; the remainder is counted. */
  claimableList: 40,
  reasonMin: 3,
  reasonMax: 280,
  holderIdMax: 80,
});

export const ONE_ON_ONE_LINE_METHOD = Object.freeze([
  Object.freeze({
    name: 'A 1:1 credits the line whose manager held it',
    why: 'In a matrix a person owes — and is owed — a conversation on every line that takes a meaningful share of their week. One manager’s meeting says nothing about another manager’s. Each (person, line) pair is read from the held 1:1s attributed to that line’s manager and from nothing else.',
  }),
  Object.freeze({
    name: 'The masked line is the finding',
    why: 'The people list asks when anybody last met this person. When that reads on track while one of the person’s lines is overdue or has never met them, the line is masked: the roster is green and a manager who holds part of this person’s week has gone silent. That count is printed first.',
  }),
  Object.freeze({
    name: 'Unknown is not never',
    why: 'A 1:1 with no recorded holder might belong to any line. When such a meeting could change a line’s reading, the line is printed “cannot be read” — never “never held” and never “on cadence”. The remedy is a human act: the manager who held it claims it.',
  }),
  Object.freeze({
    name: 'One convention per line type, both declared',
    why: 'The home line is held to the workspace’s existing 1:1 interval. An additional line is held to its own declared interval, and one below the declared share floor owes no standing 1:1 and is printed as exempt. A line with no declared share cannot be exempted: there is no evidence it is small.',
  }),
  Object.freeze({
    name: 'A finding is not an automated reminder',
    why: 'This slice reports silent lines but does not create or close reminder tasks. The planned RULE-OOL-01 remains unimplemented.',
  }),
]);

export const ONE_ON_ONE_LINE_LIMITS_TEXT = Object.freeze([
  'A 1:1 logged before holders were recorded carries no holder. It is never back-filled: it is counted as unattributed, credits no line, and makes a line “cannot be read” rather than “never held” whenever it could have been that line’s meeting.',
  'A holder is whoever the record says held the meeting — the declared seat at the moment of logging, a first-person claim, or an operator declaration. LeadOS has no authentication, so a holder is an attributed act, not a verified identity.',
  'Attribution is read against the lines in force TODAY. A meeting held by a manager whose line has since ended is counted under “no line today”, and a 1:1 between a person and a manager credits that pair even when it predates the line’s declared start — the pair was in conversation.',
  'A cadence is a recorded conversation, not its quality. An on-cadence line says a 1:1 was logged, not that it was useful, and a skipped or moved meeting credits nothing.',
  'Only people on more than one line are read here. A person on a single line is fully served by the existing 1:1 cadence, which this register does not change.',
  'The report adapter withholds aggregate coverage at higher altitudes or in mixed-detail scopes until small-cell and repeated-release disclosure protection exists. Existing per-line confidentiality is not yet enforced.',
]);

/**
 * Reserved, unregistered CSV scope #123: one workspace summary row plus one row per
 * line role and declared kind. NO person id, NO name, NO manager id, NO
 * meeting id, NO meeting date and NO free text.
 */
export const ONE_ON_ONE_LINE_CSV_COLUMNS = Object.freeze([
  'row_type',
  'line_role',
  'line_kind',
  'generated_on',
  'scope',
  'disclosure',
  'people_on_several_lines',
  'people_withheld',
  'masked_people',
  'pairs',
  'pairs_owing',
  'on_cadence',
  'due',
  'overdue',
  'never_held',
  'new_line',
  'cannot_be_read',
  'exempt',
  'pair_states_reconcile',
  'held_meetings',
  'held_by_home_line',
  'held_by_additional_line',
  'held_by_no_line_today',
  'holder_not_on_roster',
  'no_holder_recorded',
  'meeting_classes_reconcile',
  'home_cadence_days',
  'line_cadence_days',
  'min_share_pct',
  'engine_version',
]);

export const ONE_ON_ONE_LINE_CSV_DESCRIPTOR = Object.freeze({
  key: 'one-on-one-lines',
  label: 'Matrix 1:1 line coverage (aggregate)',
  group: 'analytics',
  sensitive: false,
  filenameSlug: 'one-on-one-lines',
  description: 'One workspace summary row plus one row per line role and declared kind for people on more than one reporting line: how many (person, line) pairs owe a standing 1:1 and how many read on cadence, due, overdue, never held, new, cannot-be-read or exempt (the seven counts reconcile to the pair total, and the row says whether they do); how many people have a silent line MASKED by another line’s meeting; and how the held 1:1s divide between the home line, an additional line, a holder with no line today, a holder no longer on the roster, and no recorded holder. The declared home interval, additional-line interval and share floor are printed in every row. NO person id, NO name, NO manager id, NO meeting id, NO meeting date and NO free text; a count the acting seat may not read is not exported.',
});
