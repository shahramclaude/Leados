/**
 * Human 1:1 holder attribution on the existing store/event spine.
 * The seat is a local declaration, not authenticated identity. A scoped seat
 * may claim only its own current line and may never overwrite another claim.
 */
import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { activeSeat, buildSeats, canAct, canSee } from './seat.js';
import { buildMatrix, matrixLineScope } from './matrix.js';
import { buildProtectedOneOnOneLines } from './oneOnOneLines.js';
import { validateOneOnOneLineConventions } from './oneOnOneLineSchema.js';
import {
  ONE_ON_ONE_LINE_EVENTS,
  ONE_ON_ONE_LINE_LIMITS,
  ONE_ON_ONE_LINE_RIGHTS,
  ONE_ON_ONE_LINE_RULE_ID,
} from './oneOnOneLineRegistry.js';

const fail = (error, field = 'scope') => ({ ok: false, error, field });
const text = (value) => typeof value === 'string' ? value.trim() : '';

function resolve(state, at) {
  const settings = state.settings || {};
  const matrix = buildMatrix(state, { now: at, settings });
  const scope = matrixLineScope(matrix);
  const built = buildSeats(state, { now: at, settings, lineScope: scope.byManager });
  return { matrix, built, seat: activeSeat(built) };
}

/** The writer, never caller-provided basis or timestamp, establishes a holder. */
export function oneOnOneHolderForLog(state, data, status, at) {
  const { seat, built } = resolve(state, at);
  if (seat.readOnly) return fail('The operating seat is unresolved and read-only.');
  const personId = text(data.personId);
  const requested = text(data.heldById);
  if (!seat.fullAccess) {
    const right = canAct(ONE_ON_ONE_LINE_RIGHTS.LOG, seat);
    if (!right.allow) return fail(right.reason);
    if (!seat.scope.has(personId) && !seat.lineScope?.has(personId)) return fail('That person is outside this seat’s tree and active reporting lines.');
    if (seat.id === personId) return fail('A person cannot be recorded as holding their own 1:1.', 'personId');
    if (requested && requested !== seat.id) return fail('A declared seat can log only its own holder attribution.', 'heldById');
    return {
      ok: true, seat, built,
      holder: status === 'held'
        ? { heldById: seat.id, heldByBasis: 'seat', heldByAt: at.toISOString() }
        : { heldById: null, heldByBasis: null, heldByAt: null },
    };
  }
  if (requested && (requested.length > ONE_ON_ONE_LINE_LIMITS.holderIdMax || requested === personId
    || (requested !== LEADER_ID && !(state.people || []).some((p) => p.id === requested && p.status !== 'archived')))) {
    return fail('Choose an active roster member other than the person, the workspace leader, or leave the holder unknown.', 'heldById');
  }
  return {
    ok: true, seat, built,
    holder: status === 'held' && requested
      ? { heldById: requested, heldByBasis: 'declared', heldByAt: at.toISOString() }
      : { heldById: null, heldByBasis: null, heldByAt: null },
  };
}

// An encrypted save is queued, not yet proven durable; the store later notifies
// success/failure. A failed synchronous save remains in memory and is explicit.
function saved(store, extra = {}) {
  return {
    ok: true, ...extra,
    saved: store.isEncrypted ? null : !store.persistError,
    warning: store.persistError || (store.isEncrypted ? 'Encrypted save queued; watch the workspace save status before leaving.' : null),
    propagations: store.lastPropagations || [],
  };
}

/** Apply small-cell, subtraction-safe, and repeated-release disclosure protection. */
export function createOneOnOneLineActions(store, { now = () => new Date() } = {}) {
  const clock = () => { const value = now(); return value instanceof Date ? value : new Date(value); };
  const context = () => resolve(store.state, clock());
  const meetingFor = (id) => (store.state.oneOnOnes || []).find((meeting) => meeting.id === id) || null;
  const canReadMeeting = (meeting, seat, built) => seat.fullAccess || canSee(meeting, 'oneOnOnes', seat, built).allow === 'full';

  return {
    oneOnOneLineReport() {
      const at = clock();
      const report = buildProtectedOneOnOneLines(store.state, { now: at, settings: store.state.settings || {} });
      if (report.seat.readOnly) return fail('The operating seat is unresolved; no 1:1 coverage can be read.');
      return { ok: true, report };
    },

    oneOnOneLineClaim(meetingId, input = {}) {
      const at = clock();
      const { seat, built, matrix } = resolve(store.state, at);
      const right = canAct(ONE_ON_ONE_LINE_RIGHTS.LOG, seat);
      if (!right.allow || seat.readOnly) return fail(right.reason || 'The operating seat is unresolved.');
      const meeting = meetingFor(meetingId);
      if (!meeting || !canReadMeeting(meeting, seat, built)) return fail('That 1:1 is missing or outside this seat’s detail boundary.');
      if (meeting.status !== 'held') return fail('Only a held 1:1 can be claimed.', 'meetingId');
      if (!meeting.dateUncertain && meeting.date > dayKey(at)) return fail('A future-dated 1:1 cannot be claimed.', 'meetingId');
      if (meeting.heldById) return fail('This 1:1 already has a holder. The holder or the operator must release the existing attribution first.', 'meetingId');
      const currentManagers = new Set((matrix.linesByPerson.get(meeting.personId) || []).map((line) => line.managerId));
      const supplied = text(input?.heldById);
      const holderId = seat.fullAccess ? supplied : seat.id;
      if (!seat.fullAccess && supplied && supplied !== seat.id) return fail('A manager can claim only their own 1:1.', 'heldById');
      if (!holderId || !currentManagers.has(holderId)) return fail('Choose a manager who currently holds a line on this person. A past holder is not inferred.', 'heldById');
      const basis = seat.fullAccess ? 'declared' : 'claimed';
      store.update((draft) => {
        const target = draft.oneOnOnes.find((row) => row.id === meetingId);
        target.heldById = holderId;
        target.heldByBasis = basis;
        target.heldByAt = at.toISOString();
      }, {
        type: ONE_ON_ONE_LINE_EVENTS.CLAIMED, entity: 'oneOnOne', entityId: meetingId,
        summary: `1:1 holder recorded as ${holderId} (${basis}); no other line is credited.`,
      });
      return saved(store, { id: meetingId, heldById: holderId, heldByBasis: basis });
    },

    oneOnOneLineRelease(meetingId, input = {}) {
      const at = clock();
      const { seat, built } = resolve(store.state, at);
      const right = canAct(ONE_ON_ONE_LINE_RIGHTS.LOG, seat);
      if (!right.allow || seat.readOnly) return fail(right.reason || 'The operating seat is unresolved.');
      const meeting = meetingFor(meetingId);
      if (!meeting || !canReadMeeting(meeting, seat, built)) return fail('That 1:1 is missing or outside this seat’s detail boundary.');
      if (!meeting.heldById) return fail('This 1:1 has no holder attribution to release.', 'meetingId');
      if (!seat.fullAccess && meeting.heldById !== seat.id) return fail('Only the recorded holder or the workspace operator may release this attribution.');
      const reason = text(input?.reason);
      if (reason.length < ONE_ON_ONE_LINE_LIMITS.reasonMin || reason.length > ONE_ON_ONE_LINE_LIMITS.reasonMax) {
        return fail(`Give a reason of ${ONE_ON_ONE_LINE_LIMITS.reasonMin}–${ONE_ON_ONE_LINE_LIMITS.reasonMax} characters.`, 'reason');
      }
      const previous = meeting.heldById;
      store.update((draft) => {
        const target = draft.oneOnOnes.find((row) => row.id === meetingId);
        target.heldById = null;
        target.heldByBasis = null;
        target.heldByAt = null;
      }, {
        type: ONE_ON_ONE_LINE_EVENTS.RELEASED, entity: 'oneOnOne', entityId: meetingId,
        summary: `1:1 holder ${previous} released: ${reason}`,
      });
      return saved(store, { id: meetingId });
    },

    oneOnOneLineSetConventions(input = {}) {
      const { seat } = context();
      const right = canAct(ONE_ON_ONE_LINE_RIGHTS.GOVERN, seat);
      if (!right.allow || seat.readOnly || !seat.fullAccess) {
        return fail('These workspace-wide conventions may be changed only in the full-access operator view.');
      }
      if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('Provide coverage conventions as a patch.', 'conventions');
      const allowed = new Set(['oneOnOneLineCadenceDays', 'oneOnOneLineMinSharePct', 'oneOnOneLineAskDueDays', 'oneOnOneLineAutoPropagate']);
      if (Object.keys(input).some((key) => !allowed.has(key))) return fail('Unrecognized matrix 1:1 line convention field.', 'conventions');
      const valid = validateOneOnOneLineConventions(input);
      if (!valid.ok) return valid;
      store.update((draft) => { draft.settings = { ...draft.settings, ...valid.patch }; }, {
        type: ONE_ON_ONE_LINE_EVENTS.CONVENTIONS, entity: 'workspace', entityId: 'one-on-one-lines',
        summary: 'Updated the matrix 1:1 coverage conventions.',
      });
      return saved(store, { conventions: valid.patch });
    },

    oneOnOneLineScan() {
      const { seat } = context();
      const right = canAct(ONE_ON_ONE_LINE_RIGHTS.GOVERN, seat);
      if (seat.readOnly || (!seat.fullAccess && !right.allow)) {
        return fail(right.reason || 'Scanning silent 1:1 lines requires director rank or the workspace operator view.');
      }
      store.update(() => {}, {
        type: ONE_ON_ONE_LINE_EVENTS.SCAN,
        entity: 'workspace',
        entityId: 'one-on-one-lines',
        summary: `Scanned matrix 1:1 line coverage for silent lines and resolved asks (${ONE_ON_ONE_LINE_RULE_ID}).`,
      });
      const effects = (store.lastPropagations || []).filter((p) => p && p.ruleId === ONE_ON_ONE_LINE_RULE_ID);
      return saved(store, { effects });
    },
  };
}
