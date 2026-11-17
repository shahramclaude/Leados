/**
 * app/core/domain/standardRevisionRegistry.js — closed vocabulary for the
 * Standard-Work Revision Register (ADR-0237, Schema v192,
 * `#/standard-work?panel=revisions`).
 *
 * THE DUTY. A written standard is changed in a workplace all the time: the
 * walk moves from 07:00 to 06:30, the checklist gains a step, the board is
 * re-laid out. Each change is reasonable. The failure is the one ISO 9001:2015
 * clause 8.5.6 (control of changes) and clause 7.5.3 (control of documented
 * information) exist to prevent: the change takes effect on a day nobody
 * recorded, nobody can say what the previous text was, the approver is the
 * person who owes the work, and the people who now owe the new standard were
 * never told before it applied. Clause 7.3 (awareness) makes the last point
 * an obligation rather than a courtesy. Mann (*Creating a Lean Culture*,
 * 2005) treats the standard as the reference every later improvement is
 * measured against, which means an unrecorded change silently moves the
 * reference under everybody's feet.
 *
 * The register therefore stores three human acts and nothing else:
 *
 *   1. an APPROVED REVISION of one routine's written standard — the new text,
 *      the changed step, the reason, the approver, the day it takes effect,
 *      and the people who owe the new text (the owner is always one of them);
 *   2. a dated BRIEFING of one or more of those people, recorded by the
 *      approver who owns the change.
 *
 * The previous text is not typed in by anyone: it is the text the routine's
 * chain already holds, and the loader refuses any revision whose recorded
 * prior text does not match. Every state, verdict, coverage figure and count
 * is DERIVED on read from those rows plus the routine they name.
 *
 * WHAT IT IS NOT. It does not judge whether the change was a good one, does
 * not rate anybody's compliance with it, and does not rewrite a routine. The
 * routine record keeps its declared text, as written on the day it was
 * declared; the reader prints that text beside the text in force, so the two
 * can never be silently treated as one.
 *
 * Leaf module: NO imports, so schema, reader, actions and view can all depend
 * on it without a cycle.
 */

export const STANDARD_REVISION_ENGINE_VERSION = 'standard-revision-2026.11-v1';
export const STANDARD_REVISION_ADR = 'ADR-0237';
export const STANDARD_REVISION_ROUTE = 'standard-work';
export const STANDARD_REVISION_PANEL = 'revisions';

export const STANDARD_REVISION_EVENTS = Object.freeze({
  APPROVED: 'standardrevision.approved',
  BRIEFED: 'standardrevision.briefed',
});
export const STANDARD_REVISION_EVENT_PREFIX = 'standardrevision.';

/**
 * Two human acts with two different holders. The line holder over the owner
 * approves a change to the owner's standard; the same holder records who was
 * briefed on it. Neither right lets the owner approve their own change, and
 * the action re-proves the line on every call.
 */
export const STANDARD_REVISION_RIGHTS = Object.freeze({
  READ: 'read-standard-revisions',
  APPROVE: 'approve-standard-revision',
  BRIEF: 'brief-standard-revision',
});

export const STANDARD_REVISION_LIMITS = Object.freeze({
  revisions: 2000,
  briefs: 20000,
  /** Same bounds as the routine's own declared standard (`STANDARD_WORK_LIMITS`). */
  standardMin: 12,
  standardMax: 600,
  changedStepMin: 12,
  changedStepMax: 300,
  /** The reason for a change. A change with no reason is not a decision. */
  basisMin: 20,
  basisMax: 400,
  idMax: 80,
  /** Every person a single revision names as owing the new text. */
  briefeesMax: 60,
  /** Briefings recorded in one act. */
  briefsPerAct: 60,
  /** A change may take effect at most this many days after it is approved. */
  aheadMax: 90,
  rowsShown: 200,
});

/**
 * The state of one REVISION, derived on read. Closed and in precedence order.
 * `lapsed` takes precedence: a revision whose routine ended on or before its
 * effective day never took effect, so it is not owed a briefing either.
 */
export const STANDARD_REVISION_STATES = Object.freeze([
  Object.freeze({
    key: 'lapsed', label: 'Lapsed — the routine ended first', tone: 'neutral',
    says: 'The routine was retired on or before the day this text was to take effect. The text never applied, so nobody was owed a briefing on it.',
  }),
  Object.freeze({
    key: 'pending', label: 'Approved, not yet in force', tone: 'warn',
    says: 'The revision is on the record and takes effect on a later day. Until then the previous text is the standard.',
  }),
  Object.freeze({
    key: 'in-force', label: 'In force', tone: 'good',
    says: 'This is the text the routine is held to today, and no later revision has taken effect.',
  }),
  Object.freeze({
    key: 'superseded', label: 'Superseded by a later revision', tone: 'neutral',
    says: 'This text was in force for a period and a later revision has since taken effect. Its briefing record is kept as it stands.',
  }),
]);
export const STANDARD_REVISION_STATE_KEYS = Object.freeze(STANDARD_REVISION_STATES.map((row) => row.key));
export const STANDARD_REVISION_STATE_BY_KEY = Object.freeze(Object.fromEntries(STANDARD_REVISION_STATES.map((row) => [row.key, row])));

/**
 * The state of one PERSON owed a revision, derived on read. The distinction
 * that matters is before/after the effective day: a person briefed after the
 * text applied worked to it without being told, and that is recorded as such.
 */
export const STANDARD_REVISION_BRIEF_STATES = Object.freeze([
  Object.freeze({ key: 'briefed-before', label: 'Briefed before it took effect', tone: 'good', says: 'A briefing is on the record dated on or before the effective day.' }),
  Object.freeze({ key: 'briefed-after', label: 'Briefed after it took effect', tone: 'warn', says: 'The briefing is on the record, but it is dated after the text already applied.' }),
  Object.freeze({ key: 'due', label: 'Briefing due before the effective day', tone: 'warn', says: 'The text is not yet in force and no briefing is on the record yet.' }),
  Object.freeze({ key: 'overdue', label: 'Not briefed — the text is in force', tone: 'bad', says: 'The text applies now and no briefing of this person is on the record.' }),
  Object.freeze({ key: 'not-owed', label: 'Not owed — the revision lapsed', tone: 'neutral', says: 'The revision never took effect, so no briefing was owed.' }),
]);
export const STANDARD_REVISION_BRIEF_STATE_KEYS = Object.freeze(STANDARD_REVISION_BRIEF_STATES.map((row) => row.key));
export const STANDARD_REVISION_BRIEF_STATE_BY_KEY = Object.freeze(Object.fromEntries(STANDARD_REVISION_BRIEF_STATES.map((row) => [row.key, row])));

/**
 * The verdict on one REVISION, read across its briefings. Counted, and every
 * verdict is a sum over the same briefee rows the figures are printed from.
 */
export const STANDARD_REVISION_VERDICTS = Object.freeze([
  Object.freeze({ key: 'ready', label: 'Ready — everyone briefed before it applies', tone: 'good', says: 'Approved, not yet in force, and every owed person is already briefed.' }),
  Object.freeze({ key: 'briefing-due', label: 'Briefing still owed before it applies', tone: 'warn', says: 'Approved and not yet in force, with at least one owed person not yet briefed.' }),
  Object.freeze({ key: 'briefed-in-time', label: 'In force, everyone briefed in time', tone: 'good', says: 'Every owed person was briefed on or before the day the text applied.' }),
  Object.freeze({ key: 'briefed-late', label: 'In force, some briefed late', tone: 'warn', says: 'Everyone owed has a briefing, but at least one was dated after the text already applied.' }),
  Object.freeze({ key: 'briefing-overdue', label: 'In force, someone never briefed', tone: 'bad', says: 'At least one owed person has no briefing on the record while the text applies.' }),
  Object.freeze({ key: 'not-owed', label: 'Lapsed — nothing owed', tone: 'neutral', says: 'The routine ended before the text applied, so no briefing was owed.' }),
]);
export const STANDARD_REVISION_VERDICT_KEYS = Object.freeze(STANDARD_REVISION_VERDICTS.map((row) => row.key));
export const STANDARD_REVISION_VERDICT_BY_KEY = Object.freeze(Object.fromEntries(STANDARD_REVISION_VERDICTS.map((row) => [row.key, row])));

/** Plain statements of what the panel prints, for its Method view. */
export const STANDARD_REVISION_METHOD = Object.freeze([
  'A revision is approved by the holder of the line the routine is owed under — never by the owner of the standard.',
  'The previous text is read from the routine’s chain. Nobody types it in, and the loader refuses a revision whose recorded prior text does not match the chain.',
  'A revision takes effect on a declared day that is not in the past, not earlier than the routine starts, not after the routine ends, and strictly after the previous revision’s day.',
  'The owner of the standard is always among the people owed the new text. Anyone else owed it must be within the approver’s reach.',
  'Briefings are dated. A briefing dated on or before the effective day is “before”; a later one is “after”, and is shown as such rather than merged into “briefed”.',
  'Silence is never read as briefed. A person with no briefing on the record is due until the day the text applies, and overdue from that day on.',
  'The routine record keeps its declared text. The panel prints the declared text and the text in force side by side, so a revised standard is never shown under the old wording.',
  'Figures are derived on read. The panel prints the counts it computed; it does not store a total, a verdict or a percentage.',
]);

export const STANDARD_REVISION_FRAMEWORKS = Object.freeze([
  Object.freeze({ name: 'ISO 9001:2015 §8.5.6 — control of changes', says: 'Changes to production or service provision are reviewed and controlled, and their consequences are recorded and acted on.' }),
  Object.freeze({ name: 'ISO 9001:2015 §7.5.3 — control of documented information', says: 'Each controlled document has an identifiable version, and the version in use is the version that is approved.' }),
  Object.freeze({ name: 'ISO 9001:2015 §7.3 — awareness', says: 'Persons doing work under the organisation’s control are aware of the relevant policy, objectives and their own contribution — including changes to it.' }),
  Object.freeze({ name: 'Mann (2005), Creating a Lean Culture — standard work', says: 'Standard work is the reference against which an abnormality is seen; a silently moved reference hides abnormalities.' }),
]);
