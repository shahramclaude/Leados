/**
 * app/core/domain/distributedEquityActions.js — the seat-checked commands of
 * the Distributed-Work Equity Register (ADR-0238).
 *
 * FOUR human acts and a scan, and nothing else: DECLARE a working window,
 * WITHDRAW it, DECLARE an unsociable-hour sitting, RETRACT it — plus the
 * conventions and the explicit scan. Every burden figure, share and verdict is
 * re-derived on read by `distributedEquity.js`; nothing derived is stored.
 *
 * THE DOOR IS THE PRODUCT, AND EVERY REFUSAL IS A CONTROL.
 *  - A window is a claim about a human being's daily life: it carries a
 *    written source or it is refused. The register never accepts an unsourced
 *    window, and never infers one from behaviour.
 *  - A window is declared by a seat that HOLDS the person — through the span,
 *    a declared line, or the person themselves. One line does not write
 *    another line's people.
 *  - A sitting is declared by a seat that holds the CHAIR (or, when no chair
 *    is named, every attendee). The burden is convened by the chair's line;
 *    the door refuses a room no seat can account for.
 *  - A sitting's start is resolved in its own zone at the door. A start that
 *    does not exist in that zone is refused with the offsets either side; one
 *    that occurs twice must say which occurrence is meant.
 *  - A withdrawal and a retraction are final and carry a written reason; they
 *    never resurrect an older row and never rewrite history.
 *  - Every write is run through the loader and the stored row is the row the
 *    loader returns. A write the loader would refuse on reload is refused now.
 */

import { dayKey } from '../time.js';
import { buildSeats, activeSeat, canAct } from './seat.js';
import { matrixLineScopeFor } from './matrix.js';
import { buildDistributedEquity, distributedEquityAttentionCount, distributedEquityMatrix } from './distributedEquity.js';
import {
  normalizeDweSettings,
  normalizeDweSittings,
  normalizeDweWindows,
  dweDay,
  dweFold,
  dweId,
  dweSittingMinutes,
  dweText,
  dweWallClock,
  dweZone,
  wallClockSpanMinutes,
} from './distributedEquitySchema.js';
import {
  DWE_BOUNDS,
  DWE_DEFAULTS,
  DWE_EVENTS,
  DWE_LIMITS as L,
  DWE_REFUSALS,
  DWE_RIGHTS,
  DWE_ROUTE,
  DWE_RULE_ID,
  DWE_SETTING_KEYS,
} from './distributedEquityRegistry.js';

const REFUSAL = (key) => `distributedEquity:${key}`;

export function createDistributedEquityActions(store, { now, idFactory }) {
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
    if (seat.readOnly) return fail(DWE_REFUSALS.notSeated);
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
   * check — so the right is re-proved HERE, exactly as the risk-appetite
   * register re-proves it. Without this, the burden of a person would be
   * readable by a seat the record class denies under enforcement.
   */
  function readCheck() {
    const resolved = readSeat();
    if (resolved.seat.readOnly) return fail(DWE_REFUSALS.notSeated);
    const verdict = canAct(DWE_RIGHTS.READ, resolved.seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, ...resolved };
  }

  /** Does the acting seat hold this person (span, declared line, or itself)? */
  function holdsPerson(check, personId) {
    if (!personId) return false;
    if (check.seat.fullAccess) return true;
    const nodeId = check.seat.nodeId || check.seat.id || null;
    if (personId === nodeId) return true;
    if (check.seat.scope?.has?.(personId)) return true;
    if (check.seat.lineScope?.has?.(personId)) return true;
    return false;
  }

  function personContext(check, personId) {
    const id = dweId(personId);
    if (!id) return fail('Name the person this window describes.', 'personId');
    const roster = rows('people');
    const person = roster.find((row) => row && row.id === id) || null;
    if (!person) return fail('That person is not on this record. Nothing was saved.', 'personId', REFUSAL('person-not-found'));
    if (person.status === 'archived') return fail('That person is archived. An archived person has no working window to declare.', 'personId', REFUSAL('person-archived'));
    if (!holdsPerson(check, id)) {
      return fail('This seat neither holds this person through the span nor through a declared line, and is not the person. One line does not write another line’s people.', 'personId', REFUSAL('not-your-person'));
    }
    return { ok: true, personId: id, person };
  }

  function dayNotFuture(check, value, field, fallback) {
    const day = value === undefined || value === null || value === '' ? fallback : dweDay(value);
    if (!day) return { error: fail('Give a real calendar day.', field, REFUSAL('day-invalid')) };
    if (day > check.today) return { error: fail('That day is in the future. The register records what has been declared, not what will be.', field, REFUSAL('day-future')) };
    return { day };
  }

  function writeDraft(mutate, event) {
    let stored = null;
    store.update((draft) => {
      mutate(draft);
      stored = true;
    }, event);
    return stored;
  }

  return {
    /* ----------------------------------------------------------- windows */

    distributedEquityDeclareWindow(input = {}) {
      const check = seatFor(DWE_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const person = personContext(check, input.personId);
      if (!person.ok) return person;
      const zone = dweZone(input.zone);
      if (!zone) return fail('Name the time zone the window is lived in — an IANA name such as Europe/Copenhagen. The register never assumes one, not even this device’s.', 'zone', REFUSAL('zone-invalid'));
      const start = dweWallClock(input.start);
      const end = dweWallClock(input.end);
      if (!start || !end) return fail('Give the window as two wall clocks, HH:MM. `24:00`, `09:60` and `9.30` are not wall clocks.', 'start', REFUSAL('wall-clock-invalid'));
      const span = wallClockSpanMinutes(start, end);
      if (!span || span < 1 || span > L.windowMinutesMax) {
        return fail(`The window must read as a forward daily span of at most ${Math.round(L.windowMinutesMax / 60)} hours (an overnight window ends on the next day). This one reads as ${span || 'nothing'}.`, 'end', REFUSAL('window-span-invalid'));
      }
      const source = dweText(input.source);
      if (source.length < L.textMin) {
        return fail('Write where this window comes from — the person stated it, the contract names it, the roster declares it. A window with no source is a claim about a human being nobody wrote down.', 'source', REFUSAL('source-missing'));
      }
      const note = dweText(input.note);
      const declared = dayNotFuture(check, input.declaredOn, 'declaredOn', check.today);
      if (declared.error) return declared.error;

      const existing = normalizeDweWindows(rows('dweWindows'), []);
      if (existing.length >= L.windows) return fail('The window ledger is full. Nothing was saved.', null, REFUSAL('ledger-full'));
      const id = idFactory('dwe-win');
      const row = {
        id,
        personId: person.personId,
        zone,
        start,
        end,
        declaredOn: declared.day,
        declaredById: check.actorId,
        source,
        note,
        status: 'active',
        withdrawnOn: null,
        withdrawalReason: '',
        createdAt: check.at.toISOString(),
        updatedAt: check.at.toISOString(),
      };
      const loaded = normalizeDweWindows([...rows('dweWindows'), row], []);
      const storedRow = loaded.find((candidate) => candidate.id === id) || null;
      if (!storedRow) return fail('The window could not be stored as a row this register can read back. Nothing was saved.', 'start', REFUSAL('unreadable'));
      writeDraft((draft) => {
        draft.dweWindows = Array.isArray(draft.dweWindows) ? draft.dweWindows : [];
        // Declaring supersedes: one ACTIVE window per person, the older rows
        // kept as history. Two live windows would leave every reading of the
        // person refused as ambiguous, so the door resolves it in the open.
        for (const existingRow of draft.dweWindows) {
          if (existingRow && existingRow.personId === person.personId && existingRow.status === 'active') {
            existingRow.status = 'superseded';
            existingRow.updatedAt = check.at.toISOString();
          }
        }
        draft.dweWindows.push(storedRow);
      }, {
        type: DWE_EVENTS.WINDOW_DECLARED,
        entity: 'person',
        entityId: person.personId,
        summary: `Working window declared for ${person.person.name || person.personId}: ${start}–${end} ${zone}, sourced (${DWE_RULE_ID.split('-')[0]} register ${DWE_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, window: storedRow });
    },

    distributedEquityWithdrawWindow(input = {}) {
      const check = seatFor(DWE_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const windowId = dweId(input.windowId);
      if (!windowId) return fail('Name the window being withdrawn.', 'windowId');
      const loaded = normalizeDweWindows(rows('dweWindows'), []);
      const window = loaded.find((row) => row.id === windowId) || null;
      if (!window) return fail(DWE_REFUSALS.notFound, 'windowId', REFUSAL('window-not-found'));
      if (window.status !== 'active') return fail('Only the active window can be withdrawn. A superseded or withdrawn row is history, and history is never rewritten.', 'windowId', REFUSAL('window-not-active'));
      if (!holdsPerson(check, window.personId)) return fail('This seat neither holds this person through the span nor through a declared line. One line does not withdraw another line’s people.', 'windowId', REFUSAL('not-your-person'));
      const reason = dweText(input.reason);
      if (reason.length < L.textMin) return fail('Write why the window is being withdrawn, in at least a sentence. A withdrawal with no reason is a gap nobody can later explain.', 'reason', REFUSAL('reason-missing'));
      const on = dayNotFuture(check, input.on, 'on', check.today);
      if (on.error) return on.error;
      if (on.day < window.declaredOn) return fail('The withdrawal cannot be before the day the window was declared.', 'on', REFUSAL('withdraw-before-declaration'));
      writeDraft((draft) => {
        for (const row of draft.dweWindows || []) {
          if (row && row.id === windowId) {
            row.status = 'withdrawn';
            row.withdrawnOn = on.day;
            row.withdrawalReason = reason;
            row.updatedAt = check.at.toISOString();
          }
        }
      }, {
        type: DWE_EVENTS.WINDOW_WITHDRAWN,
        entity: 'person',
        entityId: window.personId,
        summary: `Working window ${windowId} withdrawn for ${window.personId}: the person's unsociable minutes become unreadable, not zero.`.slice(0, 300),
      });
      return saved({ id: windowId });
    },

    /* ---------------------------------------------------------- sittings */

    distributedEquityDeclareSitting(input = {}) {
      const check = seatFor(DWE_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const day = dweDay(input.day);
      if (!day) return fail('Give the day the sitting took place.', 'day', REFUSAL('day-invalid'));
      if (day > check.today) return fail('That day is in the future. The register records sittings that happened, not invitations.', 'day', REFUSAL('day-future'));
      const start = dweWallClock(input.start);
      if (!start) return fail('Give the sitting’s start as a wall clock, HH:MM, in the zone the sitting was convened in.', 'start', REFUSAL('wall-clock-invalid'));
      const minutes = dweSittingMinutes(typeof input.minutes === 'string' ? Number(input.minutes) : input.minutes);
      if (!minutes) return fail(`Give the duration as whole minutes, 1 to ${L.minutesMax}. A sitting with no duration is refused, never estimated.`, 'minutes', REFUSAL('minutes-invalid'));
      const zone = dweZone(input.zone);
      if (!zone) return fail('Name the time zone the sitting was convened in — an IANA name such as Europe/Copenhagen. No zone is assumed.', 'zone', REFUSAL('zone-invalid'));
      const fold = input.fold === undefined || input.fold === null || input.fold === '' ? null : dweFold(input.fold);
      if (fold === null && input.fold) return fail('Say which occurrence of the start is meant: `first` or `second`.', 'fold', REFUSAL('fold-invalid'));

      const rawAttendees = Array.isArray(input.attendeeIds)
        ? input.attendeeIds
        : String(input.attendeeIds || '').split(',');
      const attendeeIds = [...new Set(rawAttendees.map((raw) => dweId(raw)).filter(Boolean))];
      if (!attendeeIds.length) return fail('Name the people who attended. A sitting with no attendee convenes nothing.', 'attendeeIds', REFUSAL('attendees-missing'));
      if (attendeeIds.length > L.attendeesMax) return fail(`A sitting names at most ${L.attendeesMax} attendees.`, 'attendeeIds', REFUSAL('attendees-too-many'));

      const roster = rows('people');
      const offRoster = attendeeIds.filter((id) => {
        const person = roster.find((row) => row && row.id === id);
        return !person || person.status === 'archived';
      });
      if (offRoster.length) return fail(`Every attendee must be on the active roster. Not on it: ${offRoster.join(', ')}. Charging the attendees we recognise would silently shrink the room.`, 'attendeeIds', REFUSAL('attendee-not-on-roster'));

      const chairId = input.chairId === undefined || input.chairId === null || input.chairId === '' ? '' : dweId(input.chairId);
      if (input.chairId && !chairId) return fail('The chair named is not readable.', 'chairId', REFUSAL('chair-invalid'));
      let chair = null;
      if (chairId) {
        chair = roster.find((row) => row && row.id === chairId) || null;
        if (!chair || chair.status === 'archived') return fail('The chair must be on the active roster. The burden a sitting convenes is attributed through the chair’s line.', 'chairId', REFUSAL('chair-not-on-roster'));
        if (!holdsPerson(check, chairId)) {
          return fail('This seat neither holds the chair through the span nor through a declared line. A sitting is declared by a seat that can account for the room it convened.', 'chairId', REFUSAL('chair-not-held'));
        }
      } else if (!attendeeIds.every((id) => holdsPerson(check, id))) {
        return fail('With no chair named, this seat must hold every attendee. Name the chair instead: the burden a sitting convenes belongs to the chair’s line.', 'attendeeIds', REFUSAL('attendees-not-held'));
      }

      const note = dweText(input.note);
      const existing = normalizeDweSittings(rows('dweSittings'), []);
      if (existing.length >= L.sittings) return fail('The sitting ledger is full. Nothing was saved.', null, REFUSAL('ledger-full'));
      const id = idFactory('dwe-sit');
      const row = {
        id,
        day,
        start,
        minutes,
        zone,
        attendeeIds,
        chairId,
        fold,
        declaredById: check.actorId,
        note,
        status: 'active',
        retractedOn: null,
        retractionReason: '',
        createdAt: check.at.toISOString(),
        updatedAt: check.at.toISOString(),
      };
      const loaded = normalizeDweSittings([...rows('dweSittings'), row], []);
      const storedRow = loaded.find((candidate) => candidate.id === id) || null;
      if (!storedRow) return fail('The sitting could not be stored as a row this register can read back. Nothing was saved.', 'start', REFUSAL('unreadable'));
      writeDraft((draft) => {
        draft.dweSittings = Array.isArray(draft.dweSittings) ? draft.dweSittings : [];
        draft.dweSittings.push(storedRow);
      }, {
        type: DWE_EVENTS.SITTING_DECLARED,
        entity: 'workspace',
        entityId: `${DWE_ROUTE}:${id}`,
        summary: `Unsociable-hour sitting declared: ${day} ${start} ${zone}, ${minutes} min, ${attendeeIds.length} attendee(s)${chairId ? `, chaired by ${chairId}` : ', no chair'}.`.slice(0, 300),
      });
      return saved({ id, sitting: storedRow });
    },

    distributedEquityRetractSitting(input = {}) {
      const check = seatFor(DWE_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const sittingId = dweId(input.sittingId);
      if (!sittingId) return fail('Name the sitting being retracted.', 'sittingId');
      const loaded = normalizeDweSittings(rows('dweSittings'), []);
      const sitting = loaded.find((row) => row.id === sittingId) || null;
      if (!sitting) return fail(DWE_REFUSALS.notFound, 'sittingId', REFUSAL('sitting-not-found'));
      if (sitting.status !== 'active') return fail('Only an active sitting can be retracted. A retracted sitting is history, and history is never rewritten.', 'sittingId', REFUSAL('sitting-not-active'));
      if (!holdsPerson(check, sitting.chairId || sitting.attendeeIds[0])) {
        return fail('This seat neither holds the chair nor any attendee of this sitting. One line does not retract another line’s record.', 'sittingId', REFUSAL('not-your-sitting'));
      }
      const reason = dweText(input.reason);
      if (reason.length < L.textMin) return fail('Write why the sitting is being retracted, in at least a sentence. A retraction with no reason is a gap nobody can later explain.', 'reason', REFUSAL('reason-missing'));
      writeDraft((draft) => {
        for (const row of draft.dweSittings || []) {
          if (row && row.id === sittingId) {
            row.status = 'retracted';
            row.retractedOn = check.today;
            row.retractionReason = reason;
            row.updatedAt = check.at.toISOString();
          }
        }
      }, {
        type: DWE_EVENTS.SITTING_RETRACTED,
        entity: 'workspace',
        entityId: `${DWE_ROUTE}:${sittingId}`,
        summary: `Sitting ${sittingId} retracted: its minutes count for nobody, and the retraction is counted on the register.`.slice(0, 300),
      });
      return saved({ id: sittingId });
    },

    /* ------------------------------------------------------- conventions */

    distributedEquitySetConventions(input = {}) {
      const check = seatFor(DWE_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const current = normalizeDweSettings(check.cfg);
      const next = {};
      const bounds = {
        [DWE_SETTING_KEYS.outsideMinutesCeiling]: DWE_BOUNDS.outsideMinutesCeiling,
        [DWE_SETTING_KEYS.windowDays]: DWE_BOUNDS.windowDays,
        [DWE_SETTING_KEYS.equityMinPeople]: DWE_BOUNDS.equityMinPeople,
        [DWE_SETTING_KEYS.equityMinSittings]: DWE_BOUNDS.equityMinSittings,
        [DWE_SETTING_KEYS.equityMinOutsideMinutes]: DWE_BOUNDS.equityMinOutsideMinutes,
      };
      const labels = {
        [DWE_SETTING_KEYS.outsideMinutesCeiling]: 'the unsociable-hour ceiling (minutes per person per window)',
        [DWE_SETTING_KEYS.windowDays]: 'the trailing window (days)',
        [DWE_SETTING_KEYS.equityMinPeople]: 'the equity people floor',
        [DWE_SETTING_KEYS.equityMinSittings]: 'the equity sitting floor',
        [DWE_SETTING_KEYS.equityMinOutsideMinutes]: 'the equity minutes floor',
      };
      for (const [key, bound] of Object.entries(bounds)) {
        const raw = input[key];
        if (raw === undefined || raw === null || raw === '') continue;
        const value = Math.round(Number(raw));
        if (!Number.isFinite(value)) return fail(`${labels[key]} must be a whole number.`, key, REFUSAL('convention-invalid'));
        if (value < bound.min || value > bound.max) {
          return fail(`${labels[key]} must be between ${bound.min} and ${bound.max}. A convention outside its bounds is refused, never clamped.`, key, REFUSAL('convention-out-of-bounds'));
        }
        next[key] = value;
      }
      if (!Object.keys(next).length) return fail('Name at least one convention to set.', null, REFUSAL('convention-empty'));
      writeDraft((draft) => {
        draft.settings = draft.settings && typeof draft.settings === 'object' ? draft.settings : {};
        for (const [key, value] of Object.entries(next)) draft.settings[key] = value;
      }, {
        type: DWE_EVENTS.CONVENTIONS_SET,
        entity: 'workspace',
        entityId: DWE_ROUTE,
        summary: `Distributed-work equity conventions set: ${Object.entries(next).map(([key, value]) => `${key}=${value}`).join(', ')}.`.slice(0, 300),
      });
      return saved({ conventions: { ...current, ...next } });
    },

    distributedEquityScan() {
      const check = seatFor(DWE_RIGHTS.DECLARE);
      if (!check.ok) return check;
      store.update(() => {}, {
        type: DWE_EVENTS.SCANNED,
        entity: 'workspace',
        entityId: `${DWE_ROUTE}#${DWE_RULE_ID}`,
        summary: `Distributed-work equity scan requested (${DWE_RULE_ID}): over-ceiling burdens and unreadable windows re-read from the record.`,
      });
      return saved({ propagations: store.lastPropagations || [] });
    },

    /* ------------------------------------------------------------- reads */

    distributedEquityReport() {
      const check = readCheck();
      if (!check.ok) return check;
      return buildDistributedEquity(store.state, { now: check.at, settings: check.cfg, seat: check.seat });
    },

    distributedEquityAttentionCount() {
      const check = readCheck();
      if (!check.ok) return 0;
      return distributedEquityAttentionCount(store.state, { now: check.at, settings: check.cfg, seat: check.seat });
    },
  };
}

export default createDistributedEquityActions;
