/**
 * app/core/domain/valueBridgeActions.js — the commands of the Enterprise Value
 * Bridge (ADR-0214, Session 287, Schema v168).
 *
 * WHO MAY DO WHAT, PROVED HERE AND NOT IN THE SCREEN.
 *
 *   RECORD A READING — an executive-altitude seat (rank 4+), which is the
 *     enterprise record class. A valuation input is the owners' claim on the
 *     whole company; a director's line does not have one of its own and must not
 *     be able to assert the company's. The undeclared operator view is the
 *     workspace owner.
 *
 *   RESTATE A READING — the new row must NAME the reading it supersedes, on the
 *     same day and in the same currency. A silently overwritten reading is how
 *     two board packs become one number nobody can reproduce.
 *
 *   CLAIM A LEG FOR A PERSON — only a person the declaring seat holds through
 *     its reporting tree or a declared line, or the seat itself. One line never
 *     attributes a value leg to a peer line's manager; where two lines both
 *     claim it, the reader prints CONTESTED and the register divides nothing.
 *
 *   WITHDRAW A CLAIM — the person who declared it, the person it names, or a
 *     seat that holds that person. The row is kept; only its life ends.
 *
 *   SET THE CONVENTIONS — the chief's act (rank 5). A value outside the declared
 *     bounds is refused, never clamped: a typo must not shorten or lengthen the
 *     window in which a stale reading still reads as news.
 *
 * Every write stores the row its own loader returns, so the record is identical
 * before and after a reload, and nothing derived is stored.
 */

import { dayKey } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { LEADER_ID } from './chain.js';
import { matrixLineScopeFor } from './matrix.js';
import {
  buildValueBridge,
  valueBridgeAttentionCount,
  valueBridgeBriefText,
  valueBridgeCsvRows,
} from './valueBridge.js';
import { BRIDGE_LEGS, BRIDGE_LEG_KEYS } from './valueBridgeMath.js';
import {
  VALUE_BRIDGE_BOUNDS,
  VALUE_BRIDGE_ENGINE_VERSION,
  VALUE_BRIDGE_EVENTS,
  VALUE_BRIDGE_LIMITS,
  VALUE_BRIDGE_PERIMETERS,
  VALUE_BRIDGE_RIGHTS,
  VALUE_BRIDGE_SETTING_KEYS,
  VALUE_BRIDGE_SETTING_LABELS,
} from './valueBridgeRegistry.js';
import {
  normalizeValueBridgeLeverClaims,
  normalizeValueBridgeReadings,
  normalizeValueBridgeSettings,
  parseValueBridgeMoney,
  parseValueBridgeMultiple,
  readingIsLive,
  vbCurrency,
  vbDay,
  vbDaysBetween,
  vbPersonId,
  vbReason,
} from './valueBridgeSchema.js';

const L = VALUE_BRIDGE_LIMITS;
const PERIMETER_KEYS = VALUE_BRIDGE_PERIMETERS.map((row) => row.key);

export function createValueBridgeActions(store, { now, idFactory }) {
  const fail = (error, field = null) => ({ ok: false, error, ...(field ? { field } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  const text = (value, max = 200) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const saved = (extra = {}) => ({ ...extra, saved: !store.persistError, warning: store.persistError || null, propagations: store.lastPropagations || [], ok: true });
  const rows = (key) => (Array.isArray(store.state[key]) ? store.state[key] : []);

  function seatFor(right) {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    const seat = activeSeat(built);
    if (seat.readOnly) return fail('The declared seat is unresolved and read-only. Choose a valid seat before reading or acting on equity value.');
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    const actorId = seat.fullAccess ? LEADER_ID : (seat.nodeId || seat.id);
    return { ok: true, seat, at, cfg, actorId, today: dayKey(at) };
  }
  const read = (check) => buildValueBridge(store.state, { now: check.at, settings: check.cfg, seat: check.seat });

  /** How this seat holds a person: the route, or null. */
  function reachOf(check, personId) {
    if (check.seat.fullAccess) return 'operator';
    if (check.seat.scope instanceof Set && check.seat.scope.has(personId)) return 'home-line';
    if (check.seat.lineScope instanceof Set && check.seat.lineScope.has(personId)) return 'declared-line';
    return null;
  }
  const activePerson = (personId) => rows('people').find((person) => person && person.id === personId && person.status !== 'archived') || null;
  const liveReadings = () => normalizeValueBridgeReadings(rows('valueBridgeReadings'), []).filter(readingIsLive);
  const loadClaims = (value) => normalizeValueBridgeLeverClaims(value, []);
  const liveClaims = () => loadClaims(rows('valueBridgeLeverClaims')).filter((claim) => claim.withdrawnOn === null);

  return {
    /* ---------------------------------------------------------------- reads */

    valueBridgeReport() {
      const check = seatFor(VALUE_BRIDGE_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, report: read(check) };
    },

    valueBridgeBriefText() {
      const check = seatFor(VALUE_BRIDGE_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, text: valueBridgeBriefText(read(check)) };
    },

    valueBridgeCsvRows() {
      const check = seatFor(VALUE_BRIDGE_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, rows: valueBridgeCsvRows(read(check)) };
    },

    valueBridgeAttentionCount() {
      const check = seatFor(VALUE_BRIDGE_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, count: valueBridgeAttentionCount(store.state, { now: check.at, settings: check.cfg, seat: check.seat }) };
    },

    /** Who this seat could name, and what it may do. A read; the write re-proves the right. */
    valueBridgeCandidates() {
      const check = seatFor(VALUE_BRIDGE_RIGHTS.READ);
      if (!check.ok) return check;
      const people = rows('people').filter((person) => person && person.id && person.status !== 'archived');
      const held = people
        .map((person) => ({ id: person.id, name: person.name || person.id, via: reachOf(check, person.id) }))
        .filter((row) => row.via)
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
      const self = !check.seat.fullAccess ? people.find((person) => person.id === check.actorId) || null : null;
      const currencies = [];
      for (const reading of liveReadings()) if (!currencies.includes(reading.currency)) currencies.push(reading.currency);
      return {
        ok: true,
        today: check.today,
        canRecord: canAct(VALUE_BRIDGE_RIGHTS.RECORD, check.seat).allow === true,
        canClaim: canAct(VALUE_BRIDGE_RIGHTS.CLAIM, check.seat).allow === true,
        canGovern: canAct(VALUE_BRIDGE_RIGHTS.GOVERN, check.seat).allow === true,
        claimable: self && !held.some((row) => row.id === self.id)
          ? [{ id: self.id, name: self.name || self.id, via: 'self' }, ...held]
          : held,
        currencies: currencies.sort(),
        legs: BRIDGE_LEGS.map((row) => ({ key: row.key, label: row.label })),
        perimeters: VALUE_BRIDGE_PERIMETERS.map((row) => ({ key: row.key, label: row.label })),
        limits: L,
        readings: liveReadings()
          .slice()
          .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))
          .map((reading) => ({ id: reading.id, day: reading.day, currency: reading.currency })),
      };
    },

    /* --------------------------------------------------------------- writes */

    /** Record a dated reading of EBITDA, the multiple and net debt. */
    valueBridgeRecordReading(input = {}) {
      const check = seatFor(VALUE_BRIDGE_RIGHTS.RECORD);
      if (!check.ok) return check;
      if (rows('valueBridgeReadings').length >= L.readings) {
        return fail(`The reading ledger reached its ${L.readings}-row cap. Export the workspace before recording another reading.`);
      }
      const day = vbDay(input.day);
      if (!day) return fail('State the date of the reading as a real calendar day (YYYY-MM-DD).', 'day');
      if (day > check.today) {
        return fail(`The reading is dated ${day}, after today (${check.today}). Nobody has read the market’s view of the future; a projection is a forecast, not a reading.`, 'day');
      }
      const currency = vbCurrency(input.currency);
      if (!currency) return fail('State the currency as its three-letter code (DKK, EUR, USD). One chain, one currency; nothing is converted.', 'currency');
      const ebitdaCents = parseValueBridgeMoney(input.ebitda);
      if (ebitdaCents === null) {
        return fail('State the reported EBITDA in whole currency units with at most two decimals, no separators and no exponent. Zero is typed as 0; a blank is not a zero.', 'ebitda');
      }
      const multipleE4 = parseValueBridgeMultiple(input.multiple);
      if (multipleE4 === null) {
        return fail('State the multiple as a decimal from above zero to one hundred, with at most four decimals (8.5, 8.25). Zero, a negative and a blank are refused — a multiple of zero is not a valuation.', 'multiple');
      }
      const netDebtCents = parseValueBridgeMoney(input.netDebt);
      if (netDebtCents === null) {
        return fail('State net debt in whole currency units with at most two decimals. A negative figure is a net cash position and is recorded as its own fact, never floored at zero.', 'netDebt');
      }
      const perimeter = PERIMETER_KEYS.includes(input.perimeter) ? input.perimeter : null;
      if (!perimeter) {
        return fail('State how the perimeter stands: organic (already like-for-like), reported (with a declared adjustment), or unseparated (reported, not separated). It cannot be left blank.', 'perimeter');
      }
      let perimeterAdjCents = 0;
      if (perimeter === 'reported') {
        const adjustment = parseValueBridgeMoney(input.perimeterAdjustment);
        if (adjustment === null) {
          return fail('A reported perimeter must declare the EBITDA inside it that belongs to a changed perimeter, in whole currency units with at most two decimals. An absent adjustment is not a zero adjustment — if you cannot separate it, choose “unseparated” and the register will refuse the attribution instead of inventing one.', 'perimeterAdjustment');
        }
        perimeterAdjCents = adjustment;
      }
      const basis = vbReason(input.basis, L.basisMax);
      if (!basis) {
        return fail(`Write where these figures come from (at least ${L.reasonMin} characters) — the board pack, the valuation memo, the signed-off model. A bridge is only as good as the source of its two ends.`, 'basis');
      }

      const sameDay = liveReadings().filter((reading) => reading.day === day && reading.currency === currency);
      let superseded = null;
      const supersedesId = text(input.supersedesId, 120);
      if (supersedesId) {
        superseded = liveReadings().find((reading) => reading.id === supersedesId) || null;
        if (!superseded) return fail('The reading named as superseded is not a live reading. Nothing was saved.', 'supersedesId');
        if (superseded.day !== day || superseded.currency !== currency) {
          return fail(`A reading is restated for its own day and currency. The reading named supersedes ${superseded.day} ${superseded.currency}, not ${day} ${currency}.`, 'supersedesId');
        }
      } else if (sameDay.length) {
        return fail(`A live reading already exists for ${day} ${currency}. Restate it by naming the reading it supersedes, so the restatement is visible instead of silent.`, 'day');
      }

      const draftRecord = {
        id: idFactory('vbrdg'),
        day,
        currency,
        ebitdaCents,
        multipleE4,
        netDebtCents,
        perimeter,
        perimeterAdjCents,
        basis,
        recordedOn: check.today,
        recordedAt: check.at.toISOString(),
        recordedById: check.actorId,
        supersedesId: superseded ? superseded.id : null,
        supersededOn: null,
        supersededById: null,
        withdrawnOn: null,
        withdrawnById: null,
        withdrawReason: null,
        engineVersion: VALUE_BRIDGE_ENGINE_VERSION,
      };
      const [record] = normalizeValueBridgeReadings([draftRecord], []);
      if (!record) return fail('The reading could not be stored exactly as read. Nothing was saved.');

      store.update((draft) => {
        draft.valueBridgeReadings = Array.isArray(draft.valueBridgeReadings) ? draft.valueBridgeReadings : [];
        if (superseded) {
          const index = draft.valueBridgeReadings.findIndex((row) => row && row.id === superseded.id);
          if (index >= 0) {
            draft.valueBridgeReadings[index] = {
              ...draft.valueBridgeReadings[index],
              supersededOn: check.today,
              supersededById: check.actorId,
            };
          }
        }
        draft.valueBridgeReadings.push(record);
      }, {
        type: VALUE_BRIDGE_EVENTS.READING_RECORDED,
        entity: 'valueBridgeReading',
        entityId: record.id,
        summary: `Valuation reading recorded on ${check.today}: ${currency} ${day}, perimeter ${perimeter}${superseded ? `, restating ${superseded.id}` : ''}.`.slice(0, 300),
      });
      return saved({ readingId: record.id, supersededId: superseded ? superseded.id : null });
    },

    /** Withdraw a reading. The row stays; the bridge that used it falls back. */
    valueBridgeWithdrawReading(input = {}) {
      const check = seatFor(VALUE_BRIDGE_RIGHTS.RECORD);
      if (!check.ok) return check;
      const readingId = text(input.readingId, 120);
      const reading = normalizeValueBridgeReadings(rows('valueBridgeReadings'), []).find((row) => row.id === readingId) || null;
      if (!reading) return fail('That reading is not on the record.', 'readingId');
      if (reading.withdrawnOn) return fail(`That reading was already withdrawn on ${reading.withdrawnOn}.`, 'readingId');
      if (reading.supersededOn) return fail(`That reading was restated on ${reading.supersededOn}. Withdraw the reading that replaced it instead.`, 'readingId');
      const reason = vbReason(input.reason);
      if (!reason) return fail(`Write why this reading is withdrawn (at least ${L.reasonMin} characters) — the wrong pack, a restated model, a mis-keyed multiple.`, 'reason');
      const [record] = normalizeValueBridgeReadings([{ ...reading, withdrawnOn: check.today, withdrawnById: check.actorId, withdrawReason: reason }], []);
      if (!record) return fail('The withdrawal could not be stored exactly as read. Nothing was saved.');
      store.update((draft) => {
        const index = (draft.valueBridgeReadings || []).findIndex((row) => row && row.id === readingId);
        if (index >= 0) draft.valueBridgeReadings[index] = record;
      }, {
        type: VALUE_BRIDGE_EVENTS.READING_WITHDRAWN,
        entity: 'valueBridgeReading',
        entityId: readingId,
        summary: `Valuation reading withdrawn on ${check.today} (${reason.slice(0, 160)}).`.slice(0, 300),
      });
      return saved({ readingId });
    },

    /** Declare that a person answers for one leg over one period, and what it promised. */
    valueBridgeClaimLever(input = {}) {
      const check = seatFor(VALUE_BRIDGE_RIGHTS.CLAIM);
      if (!check.ok) return check;
      if (rows('valueBridgeLeverClaims').length >= L.claims) {
        return fail(`The claim ledger reached its ${L.claims}-row cap. Export the workspace before claiming another leg.`);
      }
      const leg = BRIDGE_LEG_KEYS.includes(input.leg) ? input.leg : null;
      if (!leg) return fail('Name the leg this person answers for: operating, perimeter, re-rating or net debt.', 'leg');
      const personId = vbPersonId(input.personId);
      if (!personId) return fail('Name the person whose leg this is.', 'personId');
      if (!activePerson(personId)) return fail('That person is not an active member of the roster. A leg attributed to nobody answers for nothing.', 'personId');
      const holdsIt = personId === check.actorId && !check.seat.fullAccess ? 'self' : reachOf(check, personId);
      if (!holdsIt) {
        return fail('This seat does not hold that person in its reporting tree or on a declared reporting line. A seat names a leg owner only among the people it holds — one line never attributes a value leg to a peer line’s manager. Leave it undeclared, or have the seat above both declare it.', 'personId');
      }
      const fromDay = vbDay(input.fromDay);
      if (!fromDay) return fail('State the first day of the period this claim covers, as a real calendar day.', 'fromDay');
      const toDay = vbDay(input.toDay);
      if (!toDay) return fail('State the last day of the period this claim covers, as a real calendar day.', 'toDay');
      const span = vbDaysBetween(fromDay, toDay);
      if (span === null || span < 1) return fail('A claim covers at least one whole day: the last day must be after the first.', 'toDay');
      if (span > L.claimedPeriodMaxDays) return fail(`The claim covers ${span} days; a claim covers at most ${L.claimedPeriodMaxDays}.`, 'toDay');
      const promisedCents = parseValueBridgeMoney(input.promised);
      if (promisedCents === null) {
        return fail('State what this leg was promised to deliver over the period, in whole currency units with at most two decimals. A promise of zero is typed as 0; a blank is not a promise.', 'promised');
      }
      const basis = vbReason(input.basis, L.basisMax);
      if (!basis) return fail(`Write the basis of this promise (at least ${L.reasonMin} characters) — the value-creation plan, the board paper, the agreed target.`, 'basis');

      const duplicate = liveClaims().find((claim) => claim.leg === leg && claim.personId === personId && claim.fromDay === fromDay && claim.toDay === toDay);
      if (duplicate) return fail('That person already has a live claim on this leg for exactly this period. Withdraw the earlier claim to restate it.', 'personId');

      const draftRecord = {
        id: idFactory('vbclaim'),
        leg,
        personId,
        fromDay,
        toDay,
        promisedCents,
        basis,
        declaredOn: check.today,
        declaredAt: check.at.toISOString(),
        declaredById: check.actorId,
        withdrawnOn: null,
        withdrawnById: null,
        withdrawReason: null,
        engineVersion: VALUE_BRIDGE_ENGINE_VERSION,
      };
      const [record] = normalizeValueBridgeLeverClaims([draftRecord], []);
      if (!record) return fail('The claim could not be stored exactly as read. Nothing was saved.');
      store.update((draft) => {
        draft.valueBridgeLeverClaims = Array.isArray(draft.valueBridgeLeverClaims) ? draft.valueBridgeLeverClaims : [];
        draft.valueBridgeLeverClaims.push(record);
      }, {
        type: VALUE_BRIDGE_EVENTS.LEVER_CLAIMED,
        entity: 'valueBridgeLeverClaim',
        entityId: record.id,
        summary: `Value leg claimed on ${check.today}: ${leg} from ${fromDay} to ${toDay}, declared by a seat that holds the claimant.`.slice(0, 300),
      });
      return saved({ claimId: record.id });
    },

    /** Withdraw a claim. The row stays; the leg returns to undeclared or to its other claimant. */
    valueBridgeWithdrawClaim(input = {}) {
      const check = seatFor(VALUE_BRIDGE_RIGHTS.CLAIM);
      if (!check.ok) return check;
      const claimId = text(input.claimId, 120);
      const claim = loadClaims(rows('valueBridgeLeverClaims')).find((row) => row.id === claimId) || null;
      if (!claim) return fail('That claim is not on the record.', 'claimId');
      if (claim.withdrawnOn) return fail(`That claim was already withdrawn on ${claim.withdrawnOn}.`, 'claimId');
      if (claim.declaredById !== check.actorId && claim.personId !== check.actorId && !reachOf(check, claim.personId)) {
        return fail('A claim is withdrawn by the seat that declared it, by the person it names, or by a seat that holds that person. This seat is none of those.', 'claimId');
      }
      const reason = vbReason(input.reason);
      if (!reason) return fail(`Write why this claim is withdrawn (at least ${L.reasonMin} characters) — the wrong owner, a merged span, a plan that was cancelled.`, 'reason');
      const [record] = normalizeValueBridgeLeverClaims([{ ...claim, withdrawnOn: check.today, withdrawnById: check.actorId, withdrawReason: reason }], []);
      if (!record) return fail('The withdrawal could not be stored exactly as read. Nothing was saved.');
      store.update((draft) => {
        const index = (draft.valueBridgeLeverClaims || []).findIndex((row) => row && row.id === claimId);
        if (index >= 0) draft.valueBridgeLeverClaims[index] = record;
      }, {
        type: VALUE_BRIDGE_EVENTS.LEVER_WITHDRAWN,
        entity: 'valueBridgeLeverClaim',
        entityId: claimId,
        summary: `Value leg claim withdrawn on ${check.today} (${reason.slice(0, 160)}).`.slice(0, 300),
      });
      return saved({ claimId });
    },

    /** Set the staleness window. A value outside its bounds is REFUSED, never clamped. */
    valueBridgeSetConventions(patch = {}) {
      const check = seatFor(VALUE_BRIDGE_RIGHTS.GOVERN);
      if (!check.ok) return check;
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return fail('Value-bridge conventions must be supplied as a plain object. Nothing was saved.', 'settings');
      const names = new Map(Object.entries(VALUE_BRIDGE_SETTING_KEYS).map(([name, key]) => [key, name]));
      const keys = Object.keys(patch);
      if (!keys.length) return fail('State at least one convention to update. Nothing was saved.', 'settings');
      for (const key of keys) {
        const name = names.get(key);
        if (!name) return fail(`“${key}” is not a declared value-bridge convention. Nothing was saved.`, key);
        const [min, max] = VALUE_BRIDGE_BOUNDS[name];
        if (!Number.isInteger(patch[key]) || patch[key] < min || patch[key] > max) {
          return fail(`${VALUE_BRIDGE_SETTING_LABELS[name]} must be a whole number from ${min} to ${max}. Nothing was clamped and nothing was saved.`, key);
        }
      }
      const next = normalizeValueBridgeSettings({ ...settings(), ...patch });
      store.update((draft) => {
        draft.settings = { ...(draft.settings || {}), ...next };
      }, {
        type: VALUE_BRIDGE_EVENTS.CONVENTIONS,
        entity: 'settings',
        entityId: 'valueBridge',
        summary: `Value-bridge conventions set: ${keys.map((key) => `${key}=${patch[key]}`).join(', ')}.`.slice(0, 300),
      });
      return saved({ conventions: next });
    },
  };
}

