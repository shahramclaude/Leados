/**
 * app/core/domain/shiftHandoverActions.js — the seat-checked commands of the
 * Shift Handover & Two-Key Readback Ledger (ADR-0223).
 *
 * FOUR human acts and a scan, and nothing else: DECLARE the outgoing brief,
 * CANCEL it (only before any readback exists), record the READBACK (synthesis
 * or dispute) and SCAN. Every figure, state and count is re-derived on read by
 * `shiftHandover.js`; nothing derived is stored.
 *
 * THE DOOR IS THE PRODUCT, AND EVERY REFUSAL IS A CONTROL.
 *  - The brief is a FIRST-PERSON act. `outgoingId` is the acting seat's own
 *    identity; one operator cannot write another operator's handover.
 *  - The incoming operator must be a different, ACTIVE person on the roster —
 *    an archived or unknown person cannot receive a station.
 *  - The readback is FIRST-PERSON too, and it is the ONLY write the incoming
 *    operator gets: the actor must BE the declared incoming operator. A manager
 *    cannot "accept" a station on a subordinate's behalf — that would be the
 *    silent assumption this register exists to prevent.
 *  - A synthesis requires the receiver's own words (at least the declared
 *    minimum); a dispute requires its named reason. Half a readback is
 *    refused.
 *  - A contained handover is immutable history; a cancelled one is never
 *    revived. An act is refused, loudly, never repaired.
 *  - Cancellation is the outgoing operator's own act, only before any readback
 *    exists — a changeover that did not happen leaves no phantom board.
 *  - Every write is run through the loader and the stored row is the row the
 *    loader returns. A write the loader would refuse on reload is refused now.
 */

import { dayKey } from '../time.js';
import { buildSeats, activeSeat, canAct, canSee } from './seat.js';
import { matrixLineScopeFor } from './matrix.js';
import {
  buildShiftHandover,
  readShoBrief,
} from './shiftHandover.js';
import {
  normalizeShiftHandoverReadbacks,
  normalizeShiftHandovers,
  shoDay,
  shoInstant,
  shoLabel,
  shoReason,
  shoText,
} from './shiftHandoverSchema.js';
import {
  SHO_EVENTS,
  SHO_LIMITS as L,
  SHO_READBACK_KEYS,
  SHO_REFUSALS,
  SHO_RIGHTS,
  SHO_ROUTE,
  SHO_RULE_ID,
  SHO_SEVERITY_KEYS,
} from './shiftHandoverRegistry.js';

const REFUSAL = (key) => `shiftHandover:${key}`;

export function createShiftHandoverActions(store, { now, idFactory }) {
  const fail = (error, field = null, refusal = null) => ({ ok: false, error, ...(field ? { field } : {}), ...(refusal ? { refusal } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  const rows = (key) => (Array.isArray(store.state[key]) ? store.state[key] : []);
  const saved = (extra = {}) => ({ ...extra, saved: !store.persistError, warning: store.persistError || null, propagations: store.lastPropagations || [], ok: true });

  function seatFor(right) {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    const seat = activeSeat(built);
    if (seat.readOnly) return fail(SHO_REFUSALS.notSeated);
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, seat, at, cfg, actorId: seat.fullAccess ? 'leader' : (seat.nodeId || seat.id || null), today: dayKey(at) };
  }

  function readSeat() {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    return { seat: activeSeat(built), at, cfg };
  }

  /**
   * A read is REGISTERED as safe and therefore bypasses the gateway's rank
   * check — so the right is re-proved HERE.
   */
  function readCheck() {
    const resolved = readSeat();
    if (resolved.seat.readOnly) return fail(SHO_REFUSALS.notSeated);
    const verdict = canAct(SHO_RIGHTS.READ, resolved.seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, ...resolved };
  }

  function rosterPerson(id) {
    const key = shoText(id, L.stationRefMax);
    if (!key) return null;
    const person = rows('people').find((row) => row && row.id === key) || null;
    return person;
  }

  const isActive = (person) => Boolean(person) && person.status !== 'archived';

  function briefContext(check, briefId) {
    const key = shoText(briefId, 120);
    if (!key) return fail('Name the handover.', 'handoverId', REFUSAL('brief-id-missing'));
    const loaded = normalizeShiftHandovers(rows('shiftHandovers'), []);
    const brief = loaded.find((row) => row.id === key) || null;
    if (!brief) return fail(SHO_REFUSALS.notFound, 'handoverId', REFUSAL('brief-not-found'));
    return { ok: true, brief, loaded };
  }

  function dayNotFuture(check, value, field, fallback) {
    const day = value === undefined || value === null || value === '' ? fallback : shoDay(value);
    if (!day) return { error: fail('Give a real calendar day.', field, REFUSAL('day-invalid')) };
    if (day > check.today) return { error: fail('That day is in the future. The register records what has happened, not what will.', field, REFUSAL('day-future')) };
    return { day };
  }

  return {
    /**
     * Declare the outgoing brief. The acting seat IS the outgoing operator;
     * the incoming operator must be a different, active person on the roster.
     */
    shiftHandoverDeclare(input = {}) {
      const check = seatFor(SHO_RIGHTS.DECLARE);
      if (!check.ok) return check;
      if (!check.actorId) return fail('This seat carries no person id, so it cannot hand a station to anyone.', 'outgoingId', REFUSAL('no-actor'));
      const stationRef = shoLabel(input.stationRef);
      if (!stationRef) return fail(`Name the station or boundary being handed over — at least ${L.stationRefMin} characters.`, 'stationRef', REFUSAL('station-ref-invalid'));
      const incomingId = shoText(input.incomingId, 120);
      const incoming = rosterPerson(incomingId);
      if (!incoming) return fail('The incoming operator is not on this roster. A station cannot be handed to somebody the workspace cannot see.', 'incomingId', REFUSAL('incoming-unknown'));
      if (!isActive(incoming)) return fail('The incoming operator is archived on the roster. An archived person cannot take a station.', 'incomingId', REFUSAL('incoming-archived'));
      const reach = (id) => check.seat.fullAccess || (check.seat.scope && check.seat.scope.has(id)) || Boolean(check.seat.lineScope && check.seat.lineScope.has(id));
      if (!reach(incomingId)) {
        return fail('The incoming operator is neither in this seat’s tree nor on an active Matrix line this seat holds. Declare the line first — a station is not handed to a stranger the record cannot reach.', 'incomingId', REFUSAL('incoming-out-of-reach'));
      }
      if (incomingId === check.actorId) return fail('One operator cannot hand a station to themselves — a two-key handover needs two different people.', 'incomingId', REFUSAL('self-handover'));
      const outgoing = rosterPerson(check.actorId);
      if (!outgoing && !check.seat.fullAccess) return fail('The outgoing operator is not on this roster. Nothing was saved.', 'outgoingId', REFUSAL('outgoing-not-on-roster'));
      const severity = SHO_SEVERITY_KEYS.includes(input.severity) ? input.severity : null;
      if (!severity) return fail('Choose one of the four declared severities.', 'severity', REFUSAL('severity-invalid'));
      const summary = shoText(input.summary, L.textMax);
      if (summary.length < L.textMin) return fail(`Summarize the station in at least ${L.textMin} characters: state, trend, what normal looks like here.`, 'summary', REFUSAL('summary-missing'));
      const contingency = shoText(input.contingency, L.textMax);
      if (contingency.length < L.textMin) return fail(`Write what the incoming operator must do if the abnormality moves, in at least ${L.textMin} characters.`, 'contingency', REFUSAL('contingency-missing'));
      const abnormalities = shoText(input.abnormalities, L.abnormalitiesMax);
      const declaredAt = shoInstant(input.declaredAt) || check.at.toISOString();
      if (Date.parse(declaredAt) > check.at.getTime() + 5 * 60 * 1000) {
        return fail('A brief cannot be dated after the moment it is declared.', 'declaredAt', REFUSAL('declared-in-future'));
      }
      let dueAt = shoInstant(input.dueAt);
      if (!dueAt) {
        dueAt = new Date(Date.parse(declaredAt) + 12 * 3600 * 1000).toISOString();
      }
      if (Date.parse(dueAt) < Date.parse(declaredAt)) {
        return fail('The readback cannot be owed before the brief is declared.', 'dueAt', REFUSAL('due-before-declare'));
      }
      if (Date.parse(dueAt) - Date.parse(declaredAt) > L.dueMaxHours * 3600 * 1000) {
        return fail(`The readback is owed at changeover — at most ${L.dueMaxHours} hours after the brief. A longer fuse is not a handover, it is an assumption.`, 'dueAt', REFUSAL('due-too-far'));
      }
      // Open actions: structured, bounded, never auto-assigned.
      let openActions = [];
      if (input.openActions !== undefined && input.openActions !== null) {
        if (!Array.isArray(input.openActions)) return fail('Open actions must be a list.', 'openActions', REFUSAL('actions-invalid'));
        if (input.openActions.length > L.actionsMax) return fail(`At most ${L.actionsMax} open actions fit one brief. Split the changeover or close completed actions first.`, 'openActions', REFUSAL('actions-cap'));
        for (const [index, raw] of input.openActions.entries()) {
          const text = shoText(raw?.text, L.actionTextMax);
          if (text.length < L.actionTextMin) return fail(`Action ${index + 1}: at least ${L.actionTextMin} characters, or drop it.`, 'openActions', REFUSAL('action-text-invalid'));
          let ownerId = null;
          if (raw?.ownerId !== undefined && raw?.ownerId !== null && raw?.ownerId !== '') {
            const owner = rosterPerson(shoText(raw.ownerId, 120));
            if (!owner) return fail(`Action ${index + 1}: the named owner is not on this roster. An action is assigned to a person the workspace can see, or to nobody (leave the owner blank).`, 'openActions', REFUSAL('action-owner-unknown'));
            if (!reach(owner.id)) return fail(`Action ${index + 1}: the named owner is neither in this seat’s tree nor on an active Matrix line this seat holds. An action is owed by someone this seat can reach, or to nobody (leave the owner blank).`, 'openActions', REFUSAL('action-owner-out-of-reach'));
            ownerId = owner.id;
          }
          let dueDay = null;
          if (raw?.dueDay !== undefined && raw?.dueDay !== null && raw?.dueDay !== '') {
            dueDay = shoDay(raw.dueDay);
            if (!dueDay) return fail(`Action ${index + 1}: the due date is not a real calendar day.`, 'openActions', REFUSAL('action-day-invalid'));
          }
          openActions.push({ text, ownerId, dueDay });
        }
      }
      const existing = normalizeShiftHandovers(rows('shiftHandovers'), []);
      if (existing.length >= L.briefs) return fail('The brief ledger is full. Nothing was saved.', null, REFUSAL('ledger-full'));
      const id = idFactory('shb');
      const row = {
        id, stationRef, outgoingId: check.actorId, incomingId, severity, summary, contingency, abnormalities,
        openActions, declaredAt, dueAt,
        cancelledOn: null, cancelledById: '', cancelReason: '',
      };
      const loaded = normalizeShiftHandovers([...existing, row], []);
      const stored = loaded.find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The brief could not be stored as a row this register can read back. Nothing was saved.', 'summary', REFUSAL('unreadable'));
      store.update((draft) => {
        draft.shiftHandovers = Array.isArray(draft.shiftHandovers) ? draft.shiftHandovers : [];
        draft.shiftHandovers.push(stored);
      }, {
        type: SHO_EVENTS.DECLARED,
        entity: 'shiftHandover',
        entityId: id,
        summary: `Shift handover brief declared for ${stored.stationRef} (${severity}), readback owed by ${stored.dueAt}.`.slice(0, 300),
      });
      return saved({ briefId: id });
    },

    /** Cancel a brief that never took effect. Refused once any readback exists. */
    shiftHandoverCancel(input = {}) {
      const check = seatFor(SHO_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const ctx = briefContext(check, input.handoverId);
      if (!ctx.ok) return ctx;
      const { brief } = ctx;
      if (brief.cancelledOn) return fail(SHO_REFUSALS.cancelled, 'handoverId', REFUSAL('already-cancelled'));
      if (brief.outgoingId !== check.actorId && !check.seat.fullAccess) {
        return fail('Only the outgoing operator cancels their own brief — one operator does not undo a changeover for another.', 'handoverId', REFUSAL('not-your-brief'));
      }
      const acts = normalizeShiftHandoverReadbacks(rows('shiftHandoverReadbacks'), [])
        .filter((act) => act.handoverId === brief.id);
      if (acts.length) {
        return fail('A readback already exists for this brief. Cancellation after a key turned would erase a two-key fact; the handover stands or is resolved by a later synthesis.', 'handoverId', REFUSAL('readback-exists'));
      }
      const reason = shoReason(input.reason);
      if (!reason) return fail(`Say why the changeover did not happen, in at least ${L.reasonMin} characters.`, 'reason', REFUSAL('reason-missing'));
      const day = dayNotFuture(check, input.on, 'on', check.today);
      if (day.error) return day.error;
      if (day.day < dayKey(brief.declaredAt)) return fail('A brief cannot be cancelled before it was declared.', 'on', REFUSAL('cancel-before-declare'));
      const briefId = brief.id;
      store.update((draft) => {
        const list = Array.isArray(draft.shiftHandovers) ? draft.shiftHandovers : [];
        const row = list.find((candidate) => candidate && candidate.id === briefId);
        if (row) {
          row.cancelledOn = day.day;
          row.cancelledById = check.actorId;
          row.cancelReason = reason;
        }
      }, {
        type: SHO_EVENTS.CANCELLED,
        entity: 'shiftHandover',
        entityId: briefId,
        summary: `Shift handover brief cancelled on ${day.day}: the changeover did not happen.`.slice(0, 300),
      });
      return saved({ briefId, cancelledOn: day.day });
    },

    /**
     * Record the incoming operator's key: a synthesis ("I have it") or a
     * dispute ("I cannot safely accept this station"). The actor must BE the
     * declared incoming operator — nobody turns their key for them.
     */
    shiftHandoverReadback(input = {}) {
      const check = seatFor(SHO_RIGHTS.READBACK);
      if (!check.ok) return check;
      if (!check.actorId) return fail('This seat carries no person id, so it cannot turn an incoming key.', 'handoverId', REFUSAL('no-actor'));
      const ctx = briefContext(check, input.handoverId);
      if (!ctx.ok) return ctx;
      const { brief } = ctx;
      if (brief.cancelledOn) return fail(SHO_REFUSALS.cancelled, 'handoverId', REFUSAL('cancelled'));
      if (brief.incomingId !== check.actorId) {
        return fail('Only the declared incoming operator records this readback. A station is accepted by the person taking it, or not at all.', 'handoverId', REFUSAL('not-the-incoming'));
      }
      const loadedActs = normalizeShiftHandoverReadbacks(rows('shiftHandoverReadbacks'), []);
      const { state: stateKey, act } = (() => {
        const mine = loadedActs.filter((row) => row.handoverId === brief.id);
        const reading = readShoBrief(brief, mine);
        return { state: reading.state, act: reading.latest };
      })();
      if (stateKey === 'contained') {
        return fail(SHO_REFUSALS.contained, 'handoverId', REFUSAL('already-contained'));
      }
      const kind = SHO_READBACK_KEYS.includes(input.kind) ? input.kind : null;
      if (!kind) return fail('Choose what this key records: a synthesis, or a dispute.', 'kind', REFUSAL('kind-invalid'));
      let synthesis = '';
      let disputeReason = '';
      if (kind === 'synthesized') {
        synthesis = shoText(input.synthesis, L.textMax);
        if (synthesis.length < L.textMin) return fail(`Read the handover back in your own words — at least ${L.textMin} characters: the situation, the actions and the contingency.`, 'synthesis', REFUSAL('synthesis-missing'));
      } else {
        disputeReason = shoReason(input.disputeReason) || '';
        if (!disputeReason) return fail(`A dispute names its reason, in at least ${L.reasonMin} characters. "Cannot accept" with no reason is not a boundary transfer control, it is silence with extra steps.`, 'disputeReason', REFUSAL('dispute-reason-missing'));
      }
      const at = shoInstant(input.at) || check.at.toISOString();
      if (Date.parse(at) > check.at.getTime() + 5 * 60 * 1000) return fail('A readback cannot be dated after the moment it is recorded.', 'at', REFUSAL('at-future'));
      if (Date.parse(at) < Date.parse(brief.declaredAt)) return fail('A readback cannot precede the brief it answers.', 'at', REFUSAL('at-before-declare'));
      const id = idFactory('shr');
      const row = { id, handoverId: brief.id, actorId: check.actorId, kind, synthesis, disputeReason, at };
      const loaded = normalizeShiftHandoverReadbacks([...loadedActs, row], []);
      const stored = loaded.find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The readback could not be stored as an act this register can read back. Nothing was saved.', 'kind', REFUSAL('unreadable'));
      store.update((draft) => {
        draft.shiftHandoverReadbacks = Array.isArray(draft.shiftHandoverReadbacks) ? draft.shiftHandoverReadbacks : [];
        draft.shiftHandoverReadbacks.push(stored);
      }, {
        type: SHO_EVENTS.READBACK,
        entity: 'shiftHandoverReadback',
        entityId: id,
        summary: kind === 'synthesized'
          ? `Shift handover ${brief.id} contained by the incoming operator's synthesis.`.slice(0, 300)
          : `Shift handover ${brief.id} DISPUTED by the incoming operator.`.slice(0, 300),
      });
      return saved({ readbackId: id, state: kind === 'synthesized' ? 'contained' : 'disputed' });
    },

    /** Run the rule now. The pause governs this path exactly as it governs a commit. */
    shiftHandoverScan() {
      const check = seatFor(SHO_RIGHTS.DECLARE);
      if (!check.ok) return check;
      store.update(() => {}, {
        type: SHO_EVENTS.SCANNED,
        entity: 'workspace',
        entityId: `${SHO_ROUTE}#${SHO_RULE_ID}`,
        summary: `Shift handover register scan requested (${SHO_RULE_ID}): overdue and disputed handovers re-read from the record.`,
      });
      return saved({ propagations: store.lastPropagations || [] });
    },

    /* ----------------------------------------------------------------- reads */

    shiftHandoverReport() {
      const check = readCheck();
      if (!check.ok) return check;
      return buildShiftHandover(store.state, { now: check.at, settings: check.cfg, seat: check.seat });
    },

    shiftHandoverAttentionCount() {
      const { seat, at, cfg } = readSeat();
      return buildShiftHandover(store.state, { now: at, settings: cfg, seat }).attention;
    },

    shiftHandoverBriefGrant(briefId) {
      const check = readCheck();
      if (!check.ok) return check;
      const key = shoText(briefId, 120);
      const brief = normalizeShiftHandovers(rows('shiftHandovers'), []).find((row) => row.id === key) || null;
      if (!brief) return fail(SHO_REFUSALS.notFound, 'handoverId', REFUSAL('brief-not-found'));
      if (check.seat.fullAccess) return { ok: true, allow: 'full' };
      return { ok: true, allow: canSee({ id: brief.id, personId: brief.outgoingId }, 'shiftHandovers', check.seat, null).allow };
    },
  };
}
