/**
 * app/core/domain/workNightActions.js — the doors of the Night-Work & In-Shift
 * Break Reading (ADR-0226, Schema v181).
 *
 * WHO MAY RECORD A BREAK. A break is a statement about ONE shift of ONE line.
 * It belongs to whoever holds that line: its manager, a seat with that manager
 * in its own tree, or the workspace leader from the operator view. A manager
 * cannot record a break on a shift of a line they do not hold — however
 * clearly they can see the person. The act records the route that carried the
 * right.
 *
 * WHAT THE DOOR RESOLVES. A break's two wall times are resolved to their UTC
 * offsets HERE, once, against the device's zone rules, and stored. A time the
 * clocks skipped is refused; a time that occurs twice must say which. The door
 * then proves the break lies inside the shift's coverage and is at least the
 * governing policy's declared break minimum. Every later reading is integer
 * arithmetic on what was stored.
 *
 * WHAT THE DOOR DOES NOT REFUSE. A shift that creates a provable night breach
 * is still a fact about the roster, and refusing to record it would hide it. A
 * breach that can still be prevented is admitted only with the reason in
 * writing; one that already happened is admitted as it is.
 */

import { dayKey } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixLineScopeFor } from './matrix.js';
import {
  buildWorkNight,
  previewWorkNightBreak,
  workNightAttentionCount as countAttention,
  workNightBriefText,
  workNightCsvRows,
  workNightSeatProjection,
} from './workNight.js';
import {
  WORK_NIGHT_DEFAULTS,
  WORK_NIGHT_EVENTS,
  WORK_NIGHT_HREF,
  WORK_NIGHT_LIMITS,
  WORK_NIGHT_POLICY_SCOPES,
  WORK_NIGHT_RIGHTS,
  WORK_NIGHT_ROUTE_BY_KEY,
  WORK_NIGHT_RULE_ID,
  WORK_NIGHT_SETTING_KEYS,
  WORK_NIGHT_SETTING_LABELS,
  WORK_NIGHT_THRESHOLD_BOUNDS,
  WORK_NIGHT_THRESHOLD_FIELDS,
} from './workNightRegistry.js';
import {
  normalizeWorkNightBreaks,
  normalizeWorkNightPolicies,
  normalizeWorkNightSettings,
  readNightWindow,
  readWorkNightThresholds,
  workNightLabel,
  workNightReason,
} from './workNightSchema.js';
import { deviceZone, formatMinutes, knownZones, resolveShiftEnd } from './workRestTime.js';
import { normalizeWorkRestActs, normalizeWorkRestShifts, readEffectiveShifts, readShiftSpan, workRestZone } from './workRestSchema.js';

const L = WORK_NIGHT_LIMITS;

const parseNightMinuteOfDay = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  // A whole minute of the day (1320), or a wall-clock reading (22:00, 6:00).
  const asInt = Number(raw);
  if (Number.isInteger(asInt) && asInt >= 0 && asInt <= 1439) return asInt;
  const clock = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (clock) {
    const h = Number(clock[1]);
    const m = Number(clock[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return h * 60 + m;
  }
  return null;
};

/** A typed duration → whole minutes, or null. `11`, `11h`, `11:30`, `45m`. */
export function parseWorkNightDuration(value) {
  if (typeof value === 'number') return Number.isInteger(value) && value >= 0 ? value : null;
  const raw = String(value ?? '').trim().toLowerCase().replace(/\s+/g, '');
  if (!raw) return null;
  let match = /^(\d{1,5})m(?:in)?$/.exec(raw);
  if (match) return Number(match[1]);
  match = /^(\d{1,4})(?:h)?$/.exec(raw);
  if (match) return Number(match[1]) * 60;
  match = /^(\d{1,4})(?::|h)(\d{1,2})m?$/.exec(raw);
  if (match && Number(match[2]) < 60) return Number(match[1]) * 60 + Number(match[2]);
  match = /^(\d{1,3})d$/.exec(raw);
  if (match) return Number(match[1]) * 1440;
  return null;
}

export function createWorkNightActions(store, { now, idFactory }) {
  const fail = (error, field = null, extra = {}) => ({ ok: false, error, ...(field ? { field } : {}), ...extra });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  const text = (value, max) => String(value ?? '').trim().slice(0, max);
  const saved = (extra = {}) => ({ ...extra, saved: !store.persistError, warning: store.persistError || null, propagations: store.lastPropagations || [], ok: true });
  const rows = (key) => (Array.isArray(store.state[key]) ? store.state[key] : []);
  const people = () => (Array.isArray(store.state.people) ? store.state.people : []).filter((person) => person && person.id && person.status !== 'archived');
  const nameOf = (personId) => (personId === LEADER_ID ? 'the workspace leader' : (people().find((person) => person.id === personId)?.name || personId));

  function seatFor(right) {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    const seat = activeSeat(built);
    if (seat.readOnly) return fail('The declared seat is unresolved and read-only. Choose a valid seat before reading or acting on the night-work reading.');
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    const projection = workNightSeatProjection(seat.fullAccess ? null : seat);
    return { ok: true, seat, at, cfg, today: dayKey(at), nowMin: Math.floor(at.getTime() / 60000), ...projection };
  }
  const read = (check) => buildWorkNight(store.state, { now: check.at, settings: check.cfg, seat: check.seat });
  const matrixAt = (check) => buildMatrix(store.state, { now: check.at, settings: { ...check.cfg, activeSeatId: null } });

  /** The person's current reporting lines, read from the one matrix engine. */
  function linesOf(check, personId) {
    let matrix;
    try { matrix = matrixAt(check); } catch { return null; }
    const node = matrix.roster.has(personId) ? matrix.nodes.get(personId) : null;
    return node ? [...new Set(node.managerIds || [])] : null;
  }

  /** One person × one of their lines, held by this seat — or the refusal. */
  function lineAuthority(check, input, verb) {
    const personId = text(input.personId, 120);
    if (!personId) return fail('Name the person.', 'personId');
    if (!people().some((person) => person.id === personId)) return fail('That person is not on the active roster.', 'personId');
    if (!check.reachOf(personId) || check.reachOf(personId) === 'self') return fail(check.reachOf(personId) === 'self' ? 'Nobody records a break on their own shift: the holder of the line the shift is worked for records it.' : 'That person sits outside this seat’s reporting tree and declared lines.', 'personId');
    const lines = linesOf(check, personId);
    if (!lines) return fail('The reporting graph could not be read, so this person’s lines are unknown. Nothing was saved.', 'personId');
    const lineManagerId = text(input.lineManagerId, 120) || (lines.length === 1 ? lines[0] : '');
    if (!lineManagerId) return fail(`${nameOf(personId)} reports on ${lines.length} lines (${lines.map(nameOf).join(' · ')}). Say which line this shift is worked for — the reading will not pick one.`, 'lineManagerId');
    if (!lines.includes(lineManagerId)) return fail(`${nameOf(lineManagerId)} does not hold a current reporting line over ${nameOf(personId)}. A break is recorded on a shift of one of the person’s own lines.`, 'lineManagerId');
    const via = check.holdsLine(lineManagerId);
    if (!via) return fail(`This seat does not hold the line of ${nameOf(lineManagerId)} and does not sit above it, so it cannot ${verb} for that line. The line’s own holder records it.`, 'lineManagerId');
    return { ok: true, personId, lineManagerId, via, lines };
  }

  /** Two wall times in one zone → stored ends, or the refusal against the field that caused it. */
  function resolveEnds(input, zone) {
    const start = resolveShiftEnd(zone, text(input.start, 20), null);
    if (!start.ok) return fail(`The start ${start.error}.`, start.code === 'bad-zone' ? 'zone' : 'start', { code: start.code });
    const end = resolveShiftEnd(zone, text(input.end, 20), null);
    if (!end.ok) return fail(`The end ${end.error}.`, end.code === 'bad-zone' ? 'zone' : 'end', { code: end.code });
    const span = readShiftSpan({ start: text(input.start, 20), end: text(input.end, 20), startOffsetMin: start.offsetMin, endOffsetMin: end.offsetMin });
    if (!span.ok) return fail(`These times make ${span.error}. Nothing was guessed and nothing was saved.`, 'end');
    return { ok: true, span };
  }

  /** The shift as it is read today, for the break door. */
  function standingShift(shiftId) {
    const shifts = normalizeWorkRestShifts(store.state.workRestShifts, []);
    const acts = normalizeWorkRestActs(store.state.workRestActs, shifts);
    return readEffectiveShifts(shifts, acts).find((row) => row.id === shiftId) || null;
  }

  function governingPolicyFor(personId) {
    const live = normalizeWorkNightPolicies(store.state.workNightPolicies, []).filter((row) => !row.retiredAt);
    const named = live.filter((row) => row.scope === 'people' && row.personIds.includes(personId));
    if (named.length === 1) return named[0];
    const workspace = live.filter((row) => row.scope === 'workspace');
    if (workspace.length === 1) return workspace[0];
    return null;
  }

  return {
    /* ---------------------------------------------------------------- reads */

    workNightReport() {
      const check = seatFor(WORK_NIGHT_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, report: read(check) };
    },

    workNightBriefText() {
      const check = seatFor(WORK_NIGHT_RIGHTS.READ);
      if (!check.ok) return check;
      const report = read(check);
      return { ok: true, text: workNightBriefText(report), report };
    },

    workNightCsvRows() {
      const check = seatFor(WORK_NIGHT_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, rows: workNightCsvRows(read(check)) };
    },

    workNightAttentionCount() {
      const check = seatFor(WORK_NIGHT_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, count: countAttention(store.state, { now: check.at, seat: check.seat.fullAccess ? null : check.seat }) };
    },

    /** Who this seat may record breaks for, on which of their lines, and the dialog's bounds. */
    workNightCandidates() {
      const check = seatFor(WORK_NIGHT_RIGHTS.ROSTER);
      if (!check.ok) return check;
      let matrix = null;
      try { matrix = matrixAt(check); } catch { matrix = null; }
      const out = [];
      for (const person of people()) {
        const node = matrix?.roster?.has(person.id) ? matrix.nodes.get(person.id) : null;
        if (!node) continue;
        if (!['operator', 'tree', 'line'].includes(check.reachOf(person.id))) continue;
        const lines = [...new Set(node.managerIds || [])]
          .map((managerId) => ({ managerId, managerName: nameOf(managerId), via: check.holdsLine(managerId) }))
          .filter((line) => line.via);
        if (lines.length) out.push({ personId: person.id, name: person.name || person.id, linesN: (node.managerIds || []).length, lines });
      }
      out.sort((a, b) => a.name.localeCompare(b.name) || a.personId.localeCompare(b.personId));
      return {
        ok: true,
        today: check.today,
        actorId: check.actorId,
        people: out,
        zones: knownZones(),
        deviceZone: deviceZone(),
        policyPeople: check.canPolicy
          ? people().filter((person) => ['operator', 'tree', 'line'].includes(check.reachOf(person.id))).map((person) => ({ personId: person.id, name: person.name || person.id })).sort((a, b) => a.name.localeCompare(b.name))
          : [],
        bounds: { ...L, thresholds: WORK_NIGHT_THRESHOLD_BOUNDS },
      };
    },

    /* --------------------------------------------------------------- breaks */

    /** What a candidate break would change on the person's record — nothing is written. */
    workNightPreviewBreak(input = {}) {
      const check = seatFor(WORK_NIGHT_RIGHTS.ROSTER);
      if (!check.ok) return check;
      const authority = lineAuthority(check, input, 'record a break');
      if (!authority.ok) return authority;
      const shiftId = text(input.shiftId, 120);
      const shift = standingShift(shiftId);
      if (!shift || shift.personId !== authority.personId || shift.lineManagerId !== authority.lineManagerId) {
        return fail('That shift is not on the record for this person on this line.', 'shiftId');
      }
      if (shift.cancelled) return fail('That shift is cancelled. A break is recorded on a shift that is read as work.', 'shiftId');
      if ((store.state.workBreaks || []).filter((row) => row && row.shiftId === shiftId).length >= L.breaksPerShift) {
        return fail(`This shift already carries its maximum of ${L.breaksPerShift} breaks.`, 'shiftId');
      }
      const zone = workRestZone(input.zone);
      if (!zone) return fail('Name the time zone the clock on the wall was in — an IANA name such as Europe/Copenhagen. No zone is assumed.', 'zone');
      const ends = resolveEnds(input, zone);
      if (!ends.ok) return ends;
      const candidate = { s: ends.span.s, e: ends.span.e };
      const preview = previewWorkNightBreak(store.state, { now: check.at, personId: authority.personId, shiftId, candidate });
      if (!preview.ok) return fail(preview.error, 'shiftId');
      return {
        ok: true,
        via: authority.via,
        lineManagerId: authority.lineManagerId,
        resolved: { start: ends.span.start, end: ends.span.end, minutes: ends.span.minutes },
        policyState: preview.policyState,
        policyLabel: preview.policyLabel,
        breaksBeforeN: preview.breaksBeforeN,
        breaksAfterN: preview.breaksAfterN,
        cleared: preview.cleared,
        shiftMinutes: preview.shiftMinutes,
        personName: preview.personName,
      };
    },

    /** Record one break on one shift of one line this seat holds. */
    workNightRecordBreak(input = {}) {
      const check = seatFor(WORK_NIGHT_RIGHTS.ROSTER);
      if (!check.ok) return check;
      const authority = lineAuthority(check, input, 'record a break');
      if (!authority.ok) return authority;
      if (rows('workBreaks').length >= L.breaks) return fail(`The break ledger reached its ${L.breaks}-row cap. Export the workspace first.`);
      const shiftId = text(input.shiftId, 120);
      const shift = standingShift(shiftId);
      if (!shift || shift.personId !== authority.personId || shift.lineManagerId !== authority.lineManagerId) {
        return fail('That shift is not on the record for this person on this line.', 'shiftId');
      }
      if (shift.cancelled) return fail('That shift is cancelled. A break is recorded on a shift that is read as work.', 'shiftId');
      if ((store.state.workBreaks || []).filter((row) => row && row.shiftId === shiftId).length >= L.breaksPerShift) {
        return fail(`This shift already carries its maximum of ${L.breaksPerShift} breaks.`, 'shiftId');
      }
      const zone = workRestZone(input.zone);
      if (!zone) return fail('Name the time zone the clock on the wall was in — an IANA name such as Europe/Copenhagen. No zone is assumed.', 'zone');
      const ends = resolveEnds(input, zone);
      if (!ends.ok) return ends;
      const span = ends.span;
      if (span.s >= shift.e || span.e <= shift.s) {
        return fail(`This break does not lie inside the shift (${formatMinutes(shift.e - shift.s)} from ${shift.effStart} to ${shift.effEnd}). A break is a stretch of the shift itself.`, 'end');
      }
      const policy = governingPolicyFor(authority.personId);
      if (policy && Number.isInteger(policy.breakMinMin) && span.minutes < policy.breakMinMin) {
        return fail(`The governing policy “${policy.label}” requires every recorded break to be at least ${formatMinutes(policy.breakMinMin)}; this one is ${formatMinutes(span.minutes)}. Nothing was saved.`, 'end');
      }
      const breakId = idFactory('wnb');
      const row = {
        id: breakId, shiftId, personId: authority.personId, lineManagerId: authority.lineManagerId,
        start: span.start, end: span.end, startOffsetMin: span.startOffsetMin, endOffsetMin: span.endOffsetMin,
        declaredOn: check.today, declaredAt: check.at.toISOString(), declaredById: check.actorId, via: authority.via,
        note: text(input.note, L.reasonMax),
      };
      if (normalizeWorkNightBreaks([row], [shift], policy ? [policy] : []).length !== 1) {
        return fail('The break could not be stored exactly as read. Nothing was saved.', 'end');
      }
      const preview = previewWorkNightBreak(store.state, { now: check.at, personId: authority.personId, shiftId, candidate: { s: span.s, e: span.e } });
      store.update((d) => {
        d.workBreaks = Array.isArray(d.workBreaks) ? d.workBreaks : [];
        d.workBreaks.push(row);
      }, {
        type: WORK_NIGHT_EVENTS.BREAK_DECLARED,
        entity: 'person',
        entityId: authority.personId,
        summary: `Break recorded through the ${authority.via} route on shift ${shiftId}: ${span.start} → ${span.end} (${formatMinutes(span.minutes)}); ${preview.cleared.length} missing-break refusal(s) cleared.`.slice(0, 300),
      });
      return saved({ breakId, via: authority.via, minutes: span.minutes, cleared: preview.cleared });
    },

    /* -------------------------------------------------------------- policies */

    /** Declare the night window and the limits that apply, with their source. No limit is built in. */
    workNightDeclarePolicy(input = {}) {
      const check = seatFor(WORK_NIGHT_RIGHTS.POLICY);
      if (!check.ok) return check;
      if (rows('workNightPolicies').length >= L.nightPolicies) return fail(`The night policy ledger reached its ${L.nightPolicies}-row cap.`);
      const label = workNightLabel(input.label);
      if (!label) return fail(`Name the policy in ${L.labelMin}–${L.labelMax} characters — “Plant night-work rules 2026”, not a sentence.`, 'label');
      const scope = WORK_NIGHT_POLICY_SCOPES.includes(input.scope) ? input.scope : null;
      if (!scope) return fail('Say who the policy applies to: the whole workspace, or named people.', 'scope');
      const source = workNightReason(input.source);
      if (!source) return fail(`Write where these limits come from — the statute, agreement or site rule, with enough to find it again (at least ${L.reasonMin} characters). A limit with no source is a number someone typed.`, 'source');
      const window = readNightWindow({ nightFromMin: parseNightMinuteOfDay(input.nightFromMin), nightToMin: parseNightMinuteOfDay(input.nightToMin) });
      if (!window.ok) return fail(`The night window ${window.error}. State it as two whole minutes of the day, for example 1320 → 360 for 22:00 → 06:00.`, window.field);
      const typed = { nightFromMin: window.nightFromMin, nightToMin: window.nightToMin };
      for (const field of WORK_NIGHT_THRESHOLD_FIELDS) {
        if (field === 'nightFromMin' || field === 'nightToMin') continue;
        const raw = input[field];
        if (raw === null || raw === undefined || String(raw).trim() === '') { typed[field] = null; continue; }
        if (field === 'nightMaxSharePct') {
          const pct = Number(raw);
          if (!Number.isInteger(pct) || pct < WORK_NIGHT_THRESHOLD_BOUNDS.nightMaxSharePct[0] || pct > WORK_NIGHT_THRESHOLD_BOUNDS.nightMaxSharePct[1]) {
            return fail(`The night-share maximum must be a whole percentage from ${WORK_NIGHT_THRESHOLD_BOUNDS.nightMaxSharePct[0]} to ${WORK_NIGHT_THRESHOLD_BOUNDS.nightMaxSharePct[1]}. Nothing was saved.`, field);
          }
          typed[field] = pct;
          continue;
        }
        if (field === 'nightMaxConsecutiveNights') {
          const n = Number(raw);
          if (!Number.isInteger(n) || n < WORK_NIGHT_THRESHOLD_BOUNDS.nightMaxConsecutiveNights[0] || n > WORK_NIGHT_THRESHOLD_BOUNDS.nightMaxConsecutiveNights[1]) {
            return fail(`The night-streak maximum must be a whole number of nights from ${WORK_NIGHT_THRESHOLD_BOUNDS.nightMaxConsecutiveNights[0]} to ${WORK_NIGHT_THRESHOLD_BOUNDS.nightMaxConsecutiveNights[1]}. Nothing was saved.`, field);
          }
          typed[field] = n;
          continue;
        }
        const minutes = parseWorkNightDuration(raw);
        if (minutes === null) return fail('Write a duration as hours (11), hours and minutes (11:30 or 11h30), minutes (45m) or days (7d). Nothing was rounded and nothing was saved.', field);
        typed[field] = minutes;
      }
      const read = readWorkNightThresholds(typed);
      if (!read.ok) return fail(`That limit ${read.error}.`, read.field);
      const existing = normalizeWorkNightPolicies(store.state.workNightPolicies, []).filter((row) => !row.retiredAt);
      let personIds = [];
      if (scope === 'workspace') {
        if (!check.operator && check.rank < 4) return fail('A night policy for the whole workspace is declared from the executive altitude or by the workspace leader. Declare one for named people in your own span instead.', 'scope');
        const clash = existing.find((row) => row.scope === 'workspace');
        if (clash) return fail(`“${clash.label}” already applies to the whole workspace. Two workspace policies would leave every person claimed twice; retire that one first.`, 'scope');
      } else {
        personIds = [...new Set((Array.isArray(input.personIds) ? input.personIds : []).map((value) => text(value, 120)).filter(Boolean))].sort();
        if (!personIds.length) return fail('Name at least one person the policy applies to.', 'personIds');
        if (personIds.length > L.peoplePerPolicy) return fail(`One policy names at most ${L.peoplePerPolicy} people.`, 'personIds');
        const roster = new Set(people().map((person) => person.id));
        const unknown = personIds.find((personId) => !roster.has(personId));
        if (unknown) return fail('A named person is not on the active roster.', 'personIds');
        const outside = personIds.find((personId) => !['operator', 'tree', 'line'].includes(check.reachOf(personId)));
        if (outside) return fail(`${nameOf(outside)} sits outside this seat’s reporting tree and declared lines. A policy is declared by a seat that holds the person.`, 'personIds');
        const clash = existing.find((row) => row.scope === 'people' && row.personIds.some((personId) => personIds.includes(personId)));
        if (clash) {
          const who = clash.personIds.find((personId) => personIds.includes(personId));
          return fail(`${nameOf(who)} is already named by the live policy “${clash.label}”. One person, one governing night policy: retire that one or leave them out.`, 'personIds');
        }
      }
      const policy = {
        id: idFactory('wnp'), label, scope, personIds, source, ...read.thresholds,
        declaredOn: check.today, declaredAt: check.at.toISOString(), declaredById: check.actorId,
        retiredAt: null, retiredById: null, retireReason: '',
      };
      if (normalizeWorkNightPolicies([policy], []).length !== 1) return fail('The policy could not be stored exactly as read. Nothing was saved.');
      store.update((d) => {
        d.workNightPolicies = Array.isArray(d.workNightPolicies) ? d.workNightPolicies : [];
        d.workNightPolicies.push(policy);
      }, {
        type: WORK_NIGHT_EVENTS.POLICY_DECLARED,
        entity: 'workspace',
        entityId: WORK_NIGHT_HREF,
        summary: `Night policy declared for ${scope === 'workspace' ? 'the whole workspace' : `${personIds.length} named person(s)`}: window ${typed.nightFromMin} → ${typed.nightToMin}, ${WORK_NIGHT_THRESHOLD_FIELDS.filter((field) => field !== 'nightFromMin' && field !== 'nightToMin' && read.thresholds[field] !== null).length} limit(s), with a written source.`,
      });
      return saved({ policyId: policy.id, thresholds: read.thresholds });
    },

    /** Retire a night policy, with the reason. People it governed fall back to the workspace policy, or to none. */
    workNightRetirePolicy(input = {}) {
      const check = seatFor(WORK_NIGHT_RIGHTS.POLICY);
      if (!check.ok) return check;
      const policyId = text(input.policyId, 120);
      const policy = normalizeWorkNightPolicies(store.state.workNightPolicies, []).find((row) => row.id === policyId);
      if (!policy) return fail('That policy is not on the record.', 'policyId');
      if (policy.retiredAt) return fail('That policy is already retired.', 'policyId');
      const holds = check.operator || (policy.scope === 'people'
        ? policy.personIds.every((personId) => ['operator', 'tree', 'line'].includes(check.reachOf(personId)))
        : check.rank >= 4);
      if (!holds) return fail('This seat does not hold everyone that policy governs, so it cannot retire it.', 'policyId');
      const reason = workNightReason(input.reason);
      if (!reason) return fail(`Write why the policy is retired (at least ${L.reasonMin} characters). The people it governed are tested against nothing until another applies.`, 'reason');
      store.update((d) => {
        const target = (d.workNightPolicies || []).find((entry) => entry && entry.id === policyId);
        if (target) { target.retiredAt = check.at.toISOString(); target.retiredById = check.actorId; target.retireReason = reason; }
      }, { type: WORK_NIGHT_EVENTS.POLICY_RETIRED, entity: 'workspace', entityId: WORK_NIGHT_HREF, summary: 'Night policy retired with a written reason. Nobody is tested against it from now on.' });
      return saved({ policyId });
    },

    /* ------------------------------------------------------------- governing */

    /** Re-run RULE-WNR-01 on the shared spine. A pause still governs: this retries the cap, it does not override the switch. */
    workNightScan() {
      const check = seatFor(WORK_NIGHT_RIGHTS.GOVERN);
      if (!check.ok) return check;
      store.update(() => {}, {
        type: WORK_NIGHT_EVENTS.SCAN,
        entity: 'workspace',
        entityId: WORK_NIGHT_HREF,
        summary: `Night-work scan requested (${WORK_NIGHT_RULE_ID}).`,
      });
      return saved({ report: read(check), effects: (store.lastPropagations || []).filter((effect) => effect && effect.ruleId === WORK_NIGHT_RULE_ID) });
    },

    /** Set the night conventions. A value outside its declared bounds is REFUSED, never clamped. */
    workNightSetConventions(patch = {}) {
      const check = seatFor(WORK_NIGHT_RIGHTS.GOVERN);
      if (!check.ok) return check;
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return fail('Night conventions must be supplied as a plain object. Nothing was saved.', 'settings');
      const names = new Map(Object.entries(WORK_NIGHT_SETTING_KEYS).map(([name, key]) => [key, name]));
      const keys = Object.keys(patch);
      if (!keys.length) return fail('State at least one night convention to update. Nothing was saved.', 'settings');
      for (const key of keys) {
        const name = names.get(key);
        if (!name) return fail(`“${key}” is not a declared night convention. Nothing was saved.`, key);
        if (name === 'autoPropagate') {
          if (typeof patch[key] !== 'boolean') return fail(`${WORK_NIGHT_SETTING_LABELS.autoPropagate} must be true or false. Nothing was saved.`, key);
        }
      }
      const next = normalizeWorkNightSettings({ ...settings(), ...patch });
      store.update((d) => { d.settings = { ...(d.settings || {}), ...next }; }, {
        type: WORK_NIGHT_EVENTS.CONVENTIONS,
        entity: 'settings',
        entityId: WORK_NIGHT_HREF,
        summary: `Night conventions set: automation ${next.workNightAutoPropagate ? 'on' : 'off'}.`.slice(0, 300),
      });
      return saved({ conventions: next });
    },
  };
}

