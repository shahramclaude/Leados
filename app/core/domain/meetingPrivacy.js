/**
 * app/core/domain/meetingPrivacy.js — ADR-0165: a declared reporting line is
 * an accountability, NOT a readership of the conversation.
 *
 * THE QUESTION, IN AN OPERATOR'S WORDS. "Sam sits 60% on my team and 40% on
 * Priya's programme. Priya's declared line gives her a real responsibility for
 * Sam's work — and before this rule existed it also gave her Sam's private
 * 1:1 notes from MY conversations with him, byte for byte, on every screen
 * that renders a 1:1. An accountability is not a copy of the room."
 *
 * WHAT THIS MODULE DECIDES (pure, no storage, no clock)
 *   For any stored `oneOnOnes` row and any resolved Operating Seat:
 *     body readable   — THIS SEAT is the recorded holder
 *                       (`heldById === seat.id`): it is the seat's own record
 *                       of its own conversation, whatever anyone's line is.
 *                       Undeclared operator: unchanged, always.
 *     body withheld   — the meeting names a DIFFERENT holder. The room is
 *                       identified (the stored holder), so nobody outside it
 *                       reads inside it — not the person's home manager, not a
 *                       peer on the tree, not an additional-line holder.
 *     unattributable  — the meeting has NO recorded holder (every historical
 *                       row, and any row the operator logs without naming one).
 *                       The room cannot be identified, so the pre-ADR-0165
 *                       rule stands: the reporting TREE reads it (nothing
 *                       about single-chain workspaces changes), and a seat
 *                       reaching the person ONLY through a declared additional
 *                       line is shown the FACT of the meeting: id, person,
 *                       date, dateUncertain, status, holder fields — never
 *                       notes, mood, agenda, resolvedTopics or promises.
 *
 * WHAT IS AND IS NOT A REGRESSION HERE
 *   A workspace with no declared additional lines behaves exactly as before:
 *   the undeclared operator view is byte-for-byte unchanged; seat-logged
 *   meetings (holder = the logging seat) stay readable by their holder;
 *   legacy unattributed rows stay readable through the tree. Historical
 *   meetings with no recorded holder are withheld from ADDITIONAL-LINE
 *   readers — never attributed by inference — and carry the reason printed.
 *
 * DISPLAY == STORED, BY CONSTRUCTION
 *   Nothing in this module is stored. The stub keeps the stored identity keys
 *   VERBATIM (id, personId, date, dateUncertain, status, heldBy*) and empties
 *   only conversational fields, so every cadence/coverage reading that keys off
 *   dates and statuses still computes from exactly the stored record. The
 *   withheld marker (`bodyWithheld` + `bodyWithheldReason`) exists only in the
 *   per-render projection; persisted bytes are never touched.
 *
 * THE SAME RULE GUARDS THE WRITE DOORS
 *   `toggleMeetingAction`, `addMeetingAction` and `setActionOwner` all mutate a
 *   meeting's body. They ask `meetingBodyVerdictForState` first and refuse a
 *   withheld meeting outright — the read boundary is not decoration if a
 *   crafted call can still rewrite the record behind it.
 */

import { buildSeats, activeSeat } from './seat.js';
import { matrixLineScopeFor } from './matrix.js';

export const MEETING_PRIVACY_ENGINE_VERSION = 'meeting-privacy-2026.11-v1';

/** Fields a withheld stub preserves verbatim from the stored row. */
export const HELD_MEETING_FACT_KEYS = Object.freeze([
  'id', 'personId', 'date', 'dateUncertain', 'status',
  'heldById', 'heldByBasis', 'heldByAt', 'createdAt',
]);

const fail = (error) => ({ ok: false, error });

/**
 * Verdict for one stored meeting under one resolved seat.
 * `seat` is the seat object from `buildSeats` (it carries `scope`, `lineScope`,
 * `id`, `fullAccess`, `readOnly`). `built` is unused today but kept in the
 * signature so callers cannot accidentally pass a seat from another build.
 *
 * Returns { withheld, reason } — reason is null when readable, a printed
 * sentence when withheld. Never throws; an unreadable row fails CLOSED.
 */
export function meetingBodyVerdict(meeting, seat, _built = null) {
  if (!seat || seat.fullAccess) return { withheld: false, reason: null };
  if (seat.readOnly) {
    return { withheld: true, reason: 'The operating seat is unresolved and read-only; individual 1:1 content is not readable.' };
  }
  if (!meeting || typeof meeting !== 'object') {
    return { withheld: true, reason: 'The 1:1 record cannot be read, so its content is not disclosed.' };
  }
  const personId = typeof meeting.personId === 'string' ? meeting.personId.trim() : '';
  const heldById = typeof meeting.heldById === 'string' ? meeting.heldById.trim() : '';
  // This seat HELD the conversation: it may read its own record of it,
  // whoever the person's home line is. A recorded holder is recorded
  // ATTESTATION (any basis — including a claimed one, which emits its own
  // event); the room is known, so the room's occupants-at-the-keyboard read it.
  if (heldById && heldById === seat.id) return { withheld: false, reason: null };
  // The meeting names a DIFFERENT holder. The room is identified, and it is
  // not this seat's — the body is not readable through tree OR line.
  if (heldById) {
    return { withheld: true, reason: 'This 1:1 was recorded by another manager. It happened; this seat sees that it happened, never what was said.' };
  }
  // No holder recorded: the room cannot be identified, so the pre-ADR-0165
  // visibility rule stands — the reporting tree may read the row (nothing
  // about a single-chain workspace changes), an additional LINE never may.
  if (personId && seat.scope && seat.scope.has(personId)) return { withheld: false, reason: null };
  if (personId && seat.lineScope && seat.lineScope.has(personId)) {
    return { withheld: true, reason: 'No holder is recorded for this 1:1, so no line can be shown its content; this seat sees that it happened.' };
  }
  // Not reachable through tree or line. The projection never carries the row
  // at all; if one reaches here anyway, fail closed rather than open.
  return { withheld: true, reason: 'The person is outside this seat’s reporting tree and declared lines.' };
}

/**
 * The withheld projection of one meeting. The returned object is a NEW object;
 * the input is never mutated. Identity keys are preserved verbatim; every
 * conversational field is emptied; the marker keys are added.
 */
export function stubMeetingBody(meeting, reason) {
  const stub = {};
  for (const key of HELD_MEETING_FACT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(meeting, key)) stub[key] = meeting[key];
  }
  stub.mood = null;
  stub.agenda = [];
  stub.resolvedTopics = [];
  stub.notes = '';
  stub.actions = [];
  stub.bodyWithheld = true;
  stub.bodyWithheldReason = reason || 'The 1:1 body is withheld from this seat.';
  return stub;
}

/**
 * Convenience for the write doors (actions.js): resolve the acting seat for a
 * raw state at instant `at` and answer whether a given stored meeting's body is
 * withheld from it. SAME engine `viewScope` and the 1:1 line actions use — no
 * second hierarchy, no parallel rule.
 *
 * Returns { ok: true, withheld, reason, seat } — or { ok: false, error } if the
 * seat context cannot be built at all (callers refuse the mutation then:
 * an unresolvable boundary is not a courtesy invitation).
 */
export function meetingBodyVerdictForState(state, meeting, at) {
  if (!state || typeof state !== 'object') return fail('No workspace state was provided.');
  if (!meeting || typeof meeting !== 'object') return fail('That 1:1 no longer exists.');
  const settings = state.settings || {};
  try {
    const lineScope = matrixLineScopeFor(state, { now: at, settings });
    const built = buildSeats(state, { now: at, settings, ...(lineScope ? { lineScope } : {}) });
    const seat = activeSeat(built);
    const { withheld, reason } = meetingBodyVerdict(meeting, seat, built);
    return { ok: true, withheld, reason, seat };
  } catch (error) {
    return fail(`The operating boundary could not be resolved: ${error?.message || 'unknown error'}`);
  }
}

export const MEETING_PRIVACY = Object.freeze({ engineVersion: MEETING_PRIVACY_ENGINE_VERSION });
