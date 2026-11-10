/**
 * Per-line feedback-body confidentiality. A reporting line is accountability,
 * not automatic access to another manager's coaching conversation. The stored
 * author is a local operating-seat attestation, not authenticated identity.
 */
import { buildSeats, activeSeat } from './seat.js';
import { matrixLineScopeFor } from './matrix.js';

const fail = (error) => ({ ok: false, error });

export function feedbackBodyVerdict(item, seat) {
  if (!seat || seat.fullAccess) return { withheld: false, reason: null };
  if (seat.readOnly) return { withheld: true, reason: 'The operating seat is unresolved and read-only; feedback content is not readable.' };
  if (!item || typeof item !== 'object') return { withheld: true, reason: 'The feedback record cannot be read, so its content is not disclosed.' };
  const personId = typeof item.personId === 'string' ? item.personId.trim() : '';
  const authoredById = typeof item.authoredById === 'string' ? item.authoredById.trim() : '';
  if (authoredById && authoredById === seat.id) return { withheld: false, reason: null };
  if (authoredById) return { withheld: true, reason: 'This feedback was recorded by another manager. This seat sees that feedback exists, never its conversation body.' };
  if (personId && seat.scope?.has(personId)) return { withheld: false, reason: null };
  if (personId && seat.lineScope?.has(personId)) return { withheld: true, reason: 'No author is recorded for this feedback, so no additional line can be shown its content; this seat sees that it exists.' };
  return { withheld: true, reason: 'The person is outside this seat’s reporting tree and declared lines.' };
}

export function stubFeedbackBody(item, reason) {
  const stub = {};
  for (const key of ['id', 'personId', 'direction', 'kind', 'date', 'observedOn', 'followUpOn', 'followUpDone', 'followUpCompletedOn', 'createdAt', 'authoredById', 'authoredByBasis', 'authoredAt']) {
    if (Object.prototype.hasOwnProperty.call(item, key)) stub[key] = item[key];
  }
  stub.situation = '';
  stub.behavior = '';
  stub.impact = '';
  stub.tags = [];
  stub.bodyWithheld = true;
  stub.bodyWithheldReason = reason || 'The feedback body is withheld from this seat.';
  return stub;
}

export function feedbackBodyVerdictForState(state, item, at) {
  if (!state || typeof state !== 'object') return fail('No workspace state was provided.');
  if (!item || typeof item !== 'object') return fail('That feedback record no longer exists.');
  const settings = state.settings || {};
  try {
    const lineScope = matrixLineScopeFor(state, { now: at, settings });
    const built = buildSeats(state, { now: at, settings, ...(lineScope ? { lineScope } : {}) });
    const seat = activeSeat(built);
    const verdict = feedbackBodyVerdict(item, seat);
    return { ok: true, ...verdict, seat };
  } catch (error) {
    return fail(`The operating boundary could not be resolved: ${error?.message || 'unknown error'}`);
  }
}

/** Writer stamps the active declared seat; never accepts author identity from the caller. */
export function feedbackAuthorForCreate(state, personId, at) {
  const settings = state?.settings || {};
  try {
    const lineScope = matrixLineScopeFor(state, { now: at, settings });
    const built = buildSeats(state, { now: at, settings, ...(lineScope ? { lineScope } : {}) });
    const seat = activeSeat(built);
    if (seat.readOnly) return fail('The operating seat is unresolved and read-only.');
    if (!seat.fullAccess && !seat.scope.has(personId) && !seat.lineScope?.has(personId)) {
      return fail('That person is outside this seat’s reporting tree and active lines.');
    }
    return { ok: true, author: seat.fullAccess ? { authoredById: null, authoredByBasis: null, authoredAt: null }
      : { authoredById: seat.id, authoredByBasis: 'seat', authoredAt: at.toISOString() } };
  } catch (error) {
    return fail(`The operating boundary could not be resolved: ${error?.message || 'unknown error'}`);
  }
}
