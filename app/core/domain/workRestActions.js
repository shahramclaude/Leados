/**
 * app/core/domain/workRestActions.js — the doors of the Cross-Line Work/Rest
 * Recovery Ledger (ADR-0209, Schema v163).
 *
 * WHO MAY ROSTER. A shift, its actual times, its cancellation and a coverage
 * attestation are all acts on ONE reporting line of ONE person. They belong to
 * whoever holds that line: its manager, a seat with that manager in its own
 * tree, or the workspace leader from the operator view. A manager cannot roster,
 * amend or attest for a line they do not hold — however clearly they can see
 * the person. The act records the route that carried the right.
 *
 * WHAT THE DOOR RESOLVES. A wall-clock time in a named zone is resolved to its
 * UTC offset HERE, once, against the device's zone rules, and stored. A time
 * the clocks skipped is refused; a time that occurs twice must say which. Every
 * later reading is integer arithmetic on what was stored.
 *
 * WHAT THE DOOR DOES NOT REFUSE. A shift that creates a provable conflict is
 * still a fact about the roster, and refusing to record it would hide it. A
 * conflict that can still be prevented is admitted only with the reason in
 * writing; one that already happened is admitted as it is.
 */

import { dayKey } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixLineScopeFor } from './matrix.js';
import {
  buildWorkRest,
  previewWorkRestShift,
  workRestAttentionCount as countAttention,
  workRestBriefText,
  workRestCsvRows,
  workRestSeatProjection,
} from './workRest.js';
import {
  WORK_REST_BOUNDS,
  WORK_REST_EVENTS,
  WORK_REST_FOLDS,
  WORK_REST_HREF,
  WORK_REST_LIMITS,
  WORK_REST_POLICY_SCOPES,
  WORK_REST_RIGHTS,
  WORK_REST_RULE_ID,
  WORK_REST_SETTING_KEYS,
  WORK_REST_SETTING_LABELS,
  WORK_REST_SOURCE_KEYS,
  WORK_REST_THRESHOLD_BOUNDS,
  WORK_REST_THRESHOLD_FIELDS,
} from './workRestRegistry.js';
import {
  normalizeWorkRestActs,
  normalizeWorkRestCoverage,
  normalizeWorkRestPolicies,
  normalizeWorkRestSettings,
  normalizeWorkRestShifts,
  readEffectiveShifts,
  readShiftSpan,
  readWorkRestThresholds,
  workRestDay,
  workRestLabel,
  workRestReason,
  workRestZone,
} from './workRestSchema.js';
import { dayStartMinutes, deviceZone, formatInstant, formatMinutes, knownZones, resolveShiftEnd } from './workRestTime.js';

const L = WORK_REST_LIMITS;

/** A typed duration → whole minutes, or null. `11`, `11h`, `11:30`, `11h30`, `45m`, `660m`. Never rounded. */
export function parseWorkRestDuration(value) {
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

export function createWorkRestActions(store, { now, idFactory }) {
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
    if (seat.readOnly) return fail('The declared seat is unresolved and read-only. Choose a valid seat before reading or acting on the work/rest ledger.');
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    const projection = workRestSeatProjection(seat.fullAccess ? null : seat);
    return { ok: true, seat, at, cfg, today: dayKey(at), nowMin: Math.floor(at.getTime() / 60000), ...projection };
  }
  const read = (check) => buildWorkRest(store.state, { now: check.at, settings: check.cfg, seat: check.seat });
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
    if (!check.reachOf(personId) || check.reachOf(personId) === 'self') return fail(check.reachOf(personId) === 'self' ? 'Nobody rosters or attests their own record: the holder of the line you work for records it.' : 'That person sits outside this seat’s reporting tree and declared lines.', 'personId');
    const lines = linesOf(check, personId);
    if (!lines) return fail('The reporting graph could not be read, so this person’s lines are unknown. Nothing was saved.', 'personId');
    const lineManagerId = text(input.lineManagerId, 120) || (lines.length === 1 ? lines[0] : '');
    if (!lineManagerId) return fail(`${nameOf(personId)} reports on ${lines.length} lines (${lines.map(nameOf).join(' · ')}). Say which line this is for — the ledger will not pick one.`, 'lineManagerId');
    if (!lines.includes(lineManagerId)) return fail(`${nameOf(lineManagerId)} does not hold a current reporting line over ${nameOf(personId)}. A shift is worked for one of the person’s own lines.`, 'lineManagerId');
    const via = check.holdsLine(lineManagerId);
    if (!via) return fail(`This seat does not hold the line of ${nameOf(lineManagerId)} and does not sit above it, so it cannot ${verb} for that line. The line’s own holder records it; a gap between two lines goes to the seat above both.`, 'lineManagerId');
    return { ok: true, personId, lineManagerId, via, lines };
  }

  /** Two wall times in one zone → stored ends, or the refusal against the field that caused it. */
  function resolveEnds(input, zone) {
    const fold = (value) => (WORK_REST_FOLDS.includes(value) ? value : null);
    const start = resolveShiftEnd(zone, text(input.start, 20), fold(input.startFold));
    if (!start.ok) return fail(`The start ${start.error}.`, start.code === 'bad-zone' ? 'zone' : start.code === 'ambiguous' ? 'startFold' : 'start', { code: start.code });
    const end = resolveShiftEnd(zone, text(input.end, 20), fold(input.endFold));
    if (!end.ok) return fail(`The end ${end.error}.`, end.code === 'bad-zone' ? 'zone' : end.code === 'ambiguous' ? 'endFold' : 'end', { code: end.code });
    const span = readShiftSpan({ start: text(input.start, 20), end: text(input.end, 20), startOffsetMin: start.offsetMin, endOffsetMin: end.offsetMin });
    if (!span.ok) return fail(`These times make ${span.error}. Nothing was guessed and nothing was saved.`, 'end');
    return { ok: true, span };
  }

  function standingShift(shiftId) {
    const shifts = normalizeWorkRestShifts(store.state.workRestShifts, []);
    const acts = normalizeWorkRestActs(store.state.workRestActs, shifts, []);
    return readEffectiveShifts(shifts, acts).find((row) => row.id === shiftId) || null;
  }

  const candidateOf = (lineManagerId, span, idValue = '__candidate__') => ({
    id: idValue, lineManagerId, s: span.s, e: span.e,
    effStartOffsetMin: span.startOffsetMin, effEndOffsetMin: span.endOffsetMin,
  });

  /** Read a shift draft exactly, and what it would add to the person's record. */
  function readShiftDraft(check, input = {}, candidateId = '__candidate__') {
    const authority = lineAuthority(check, input, 'roster a shift');
    if (!authority.ok) return authority;
    const zone = workRestZone(input.zone);
    if (!zone) return fail('Name the time zone the clock on the wall was in — an IANA name such as Europe/Copenhagen. No zone is assumed.', 'zone');
    const ends = resolveEnds(input, zone);
    if (!ends.ok) return ends;
    const source = WORK_REST_SOURCE_KEYS.includes(input.source) ? input.source : null;
    if (!source) return fail('Say where these times come from: the published roster, a time clock, or the line holder’s own statement.', 'source');
    const noteRaw = String(input.note ?? '').trim();
    if (noteRaw && !workRestReason(noteRaw)) return fail(`A note must be at least ${L.reasonMin} characters if you write one.`, 'note');
    const preview = previewWorkRestShift(store.state, { now: check.at, personId: authority.personId, candidate: candidateOf(authority.lineManagerId, ends.span, candidateId) });
    return { ok: true, authority, zone, span: ends.span, source, note: noteRaw.slice(0, L.reasonMax), preview };
  }

  const describeSpan = (span) => `${formatInstant(span.s, span.startOffsetMin)} → ${formatInstant(span.e, span.endOffsetMin)} (${formatMinutes(span.minutes)})`;

  return {
    /* ---------------------------------------------------------------- reads */

    workRestReport() {
      const check = seatFor(WORK_REST_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, report: read(check) };
    },

    workRestBriefText() {
      const check = seatFor(WORK_REST_RIGHTS.READ);
      if (!check.ok) return check;
      const report = read(check);
      return { ok: true, text: workRestBriefText(report), report };
    },

    workRestCsvRows() {
      const check = seatFor(WORK_REST_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, rows: workRestCsvRows(read(check)) };
    },

    workRestAttentionCount() {
      const check = seatFor(WORK_REST_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, count: countAttention(store.state, { now: check.at, seat: check.seat.fullAccess ? null : check.seat }) };
    },

    /** Who this seat may roster, on which of their lines, and the dialog's bounds. */
    workRestCandidates() {
      const check = seatFor(WORK_REST_RIGHTS.ROSTER);
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
        sources: WORK_REST_SOURCE_KEYS,
        policyPeople: check.canPolicy
          ? people().filter((person) => ['operator', 'tree', 'line'].includes(check.reachOf(person.id))).map((person) => ({ personId: person.id, name: person.name || person.id })).sort((a, b) => a.name.localeCompare(b.name))
          : [],
        bounds: { ...L, thresholds: WORK_REST_THRESHOLD_BOUNDS },
      };
    },

    /** What a shift would add to the person's record — nothing is written. */
    workRestPreviewShift(input = {}) {
      const check = seatFor(WORK_REST_RIGHTS.ROSTER);
      if (!check.ok) return check;
      const draft = readShiftDraft(check, input);
      if (!draft.ok) return draft;
      const preventable = draft.span.s > check.nowMin && draft.preview.created.length > 0;
      return {
        ok: true,
        resolved: { start: draft.span.start, end: draft.span.end, startOffsetMin: draft.span.startOffsetMin, endOffsetMin: draft.span.endOffsetMin, minutes: draft.span.minutes, label: describeSpan(draft.span) },
        via: draft.authority.via,
        lineManagerId: draft.authority.lineManagerId,
        policyState: draft.preview.policyState,
        policyLabel: draft.preview.policyLabel,
        created: draft.preview.created,
        needsReason: preventable,
      };
    },

    /* --------------------------------------------------------------- shifts */

    /** Record one shift for one person on one line this seat holds. */
    workRestDeclareShift(input = {}) {
      const check = seatFor(WORK_REST_RIGHTS.ROSTER);
      if (!check.ok) return check;
      if (rows('workRestShifts').length >= L.shifts) return fail(`The shift ledger reached its ${L.shifts}-row cap. Export the workspace first.`);
      const shiftId = idFactory('wrs');
      const draft = readShiftDraft(check, input, shiftId);
      if (!draft.ok) return draft;
      const { authority, span, preview } = draft;
      const preventable = span.s > check.nowMin && preview.created.length > 0;
      if (preventable && !draft.note) {
        const first = preview.created[0];
        return fail(`This shift would create ${preview.created.length} provable conflict(s) for ${nameOf(authority.personId)} that can still be prevented. ${first.sentence} ${first.fix} Recording it anyway is a decision: write why (at least ${L.reasonMin} characters) in the note. Nothing was saved.`, 'note', { created: preview.created });
      }
      const shift = {
        id: shiftId, personId: authority.personId, lineManagerId: authority.lineManagerId, zone: draft.zone,
        start: span.start, end: span.end, startOffsetMin: span.startOffsetMin, endOffsetMin: span.endOffsetMin,
        source: draft.source, note: draft.note,
        declaredOn: check.today, declaredAt: check.at.toISOString(), declaredById: check.actorId, via: authority.via,
      };
      if (normalizeWorkRestShifts([shift], []).length !== 1) return fail('The shift could not be stored exactly as read. Nothing was saved.');
      store.update((d) => {
        d.workRestShifts = Array.isArray(d.workRestShifts) ? d.workRestShifts : [];
        d.workRestShifts.push(shift);
      }, {
        type: WORK_REST_EVENTS.SHIFT_DECLARED,
        entity: 'person',
        entityId: authority.personId,
        summary: `Shift recorded through the ${authority.via} route: ${describeSpan(span)} in ${draft.zone}; ${preview.created.length} provable conflict(s) created.`.slice(0, 300),
      });
      return saved({ shiftId: shift.id, via: authority.via, minutes: span.minutes, created: preview.created });
    },

    /** Record the times actually worked, or cancel the shift. The rostered row is never edited. */
    workRestAmendShift(input = {}) {
      const check = seatFor(WORK_REST_RIGHTS.ROSTER);
      if (!check.ok) return check;
      const shift = standingShift(text(input.shiftId, 120));
      if (!shift) return fail('That shift is not on the record.', 'shiftId');
      const via = ['operator', 'tree', 'line'].includes(check.reachOf(shift.personId)) ? check.holdsLine(shift.lineManagerId) : null;
      if (!via) return fail(`This shift is worked for the line of ${nameOf(shift.lineManagerId)}. This seat does not hold that line and does not sit above it, so it cannot amend the shift.`, 'shiftId');
      if (shift.cancelled) return fail('This shift is cancelled. A cancelled shift is not amended; record a new one.', 'shiftId');
      if (shift.actsN >= L.actsPerShift) return fail(`This shift already carries its maximum of ${L.actsPerShift} amendments.`, 'shiftId');
      if (rows('workRestActs').length >= L.acts) return fail(`The amendment ledger reached its ${L.acts}-row cap. Export the workspace first.`);
      const kind = input.kind === 'cancel' ? 'cancel' : input.kind === 'actual' ? 'actual' : null;
      if (!kind) return fail('Say what is being recorded: the times actually worked, or a cancellation.', 'kind');
      const reason = workRestReason(input.reason);
      if (String(input.reason ?? '').trim() && !reason) return fail(`A written reason must be at least ${L.reasonMin} characters.`, 'reason');
      const base = { id: idFactory('wra'), shiftId: shift.id, kind, actedOn: check.today, actedAt: check.at.toISOString(), actedById: check.actorId, via, reason: reason || '' };
      let act = base;
      let created = [];
      let summary;
      if (kind === 'cancel') {
        if (!reason) return fail(`Write why the shift is cancelled (at least ${L.reasonMin} characters). A cancelled shift stays on the record with its reason.`, 'reason');
        summary = `Shift cancelled through the ${via} route. It is no longer read as work, and it is not read as rest either.`;
      } else {
        const ends = resolveEnds(input, shift.zone);
        if (!ends.ok) return ends;
        if (ends.span.s > check.nowMin) return fail('These “actual” times have not happened yet. Actual times state what was worked; to change a plan, cancel this shift and record the new one.', 'start');
        act = { ...base, start: ends.span.start, end: ends.span.end, startOffsetMin: ends.span.startOffsetMin, endOffsetMin: ends.span.endOffsetMin };
        created = previewWorkRestShift(store.state, {
          now: check.at, personId: shift.personId, excludeShiftId: shift.id, candidate: candidateOf(shift.lineManagerId, ends.span, shift.id),
        }).created;
        summary = `Actual times recorded through the ${via} route: ${describeSpan(ends.span)}; the record now proves ${created.length} conflict(s) involving this shift.`;
      }
      const shifts = normalizeWorkRestShifts(store.state.workRestShifts, []);
      const before = normalizeWorkRestActs(store.state.workRestActs, shifts, []);
      const after = normalizeWorkRestActs([...rows('workRestActs'), act], shifts, []);
      if (after.length !== before.length + 1) return fail('The amendment could not be stored exactly as read. Nothing was saved.');
      store.update((d) => {
        d.workRestActs = Array.isArray(d.workRestActs) ? d.workRestActs : [];
        d.workRestActs.push(act);
      }, { type: WORK_REST_EVENTS.SHIFT_AMENDED, entity: 'person', entityId: shift.personId, summary: summary.slice(0, 300) });
      return saved({ shiftId: shift.id, actId: act.id, kind, via, created });
    },

    /* ------------------------------------------------------------- coverage */

    /** A line holder states that the record of one person's work for that line is complete for a range of days. */
    workRestAttestCoverage(input = {}) {
      const check = seatFor(WORK_REST_RIGHTS.ROSTER);
      if (!check.ok) return check;
      const authority = lineAuthority(check, input, 'attest the record');
      if (!authority.ok) return authority;
      if (rows('workRestCoverage').length >= L.coverage) return fail(`The coverage ledger reached its ${L.coverage}-row cap. Export the workspace first.`);
      const fromDay = workRestDay(input.fromDay);
      const toDay = workRestDay(input.toDay);
      if (!fromDay) return fail('State the first day the attestation covers as a real calendar day.', 'fromDay');
      if (!toDay) return fail('State the last day the attestation covers as a real calendar day.', 'toDay');
      const days = (dayStartMinutes(toDay) - dayStartMinutes(fromDay)) / 1440 + 1;
      if (days < 1) return fail('The last day is before the first.', 'toDay');
      if (days > L.coverageMaxDays) return fail(`One attestation covers at most ${L.coverageMaxDays} days; this one spans ${days}. A statement that long is a habit, not a check.`, 'toDay');
      if (input.complete !== true) return fail('Confirm the statement itself: that every shift this person works for this line on those days is on this record. Without that sentence there is nothing to attest.', 'complete');
      const row = {
        id: idFactory('wrc'), personId: authority.personId, lineManagerId: authority.lineManagerId, fromDay, toDay,
        attestedOn: check.today, attestedAt: check.at.toISOString(), attestedById: check.actorId, via: authority.via,
        withdrawnAt: null, withdrawnBy: null, withdrawReason: '',
      };
      if (normalizeWorkRestCoverage([row], []).length !== 1) return fail('The attestation could not be stored exactly as read. Nothing was saved.');
      store.update((d) => {
        d.workRestCoverage = Array.isArray(d.workRestCoverage) ? d.workRestCoverage : [];
        d.workRestCoverage.push(row);
      }, {
        type: WORK_REST_EVENTS.COVERAGE_ATTESTED,
        entity: 'person',
        entityId: authority.personId,
        summary: `Record attested complete for one line, ${fromDay} → ${toDay} (${days} day(s)), through the ${authority.via} route.`,
      });
      return saved({ coverageId: row.id, via: authority.via, days });
    },

    /** Take an attestation back, with the reason. The row stays; it stops counting. */
    workRestWithdrawCoverage(input = {}) {
      const check = seatFor(WORK_REST_RIGHTS.ROSTER);
      if (!check.ok) return check;
      const coverageId = text(input.coverageId, 120);
      const row = normalizeWorkRestCoverage(store.state.workRestCoverage, []).find((entry) => entry.id === coverageId);
      if (!row) return fail('That attestation is not on the record.', 'coverageId');
      if (row.withdrawnAt) return fail('That attestation was already withdrawn.', 'coverageId');
      if (!['operator', 'tree', 'line'].includes(check.reachOf(row.personId)) || !check.holdsLine(row.lineManagerId)) return fail('This seat does not hold the line that attestation was made for.', 'coverageId');
      const reason = workRestReason(input.reason);
      if (!reason) return fail(`Write why the attestation is withdrawn (at least ${L.reasonMin} characters).`, 'reason');
      store.update((d) => {
        const target = (d.workRestCoverage || []).find((entry) => entry && entry.id === coverageId);
        if (target) { target.withdrawnAt = check.at.toISOString(); target.withdrawnBy = check.actorId; target.withdrawReason = reason; }
      }, { type: WORK_REST_EVENTS.COVERAGE_WITHDRAWN, entity: 'person', entityId: row.personId, summary: `Coverage attestation ${row.fromDay} → ${row.toDay} withdrawn; clearances that leaned on it are withheld again.` });
      return saved({ coverageId });
    },

    /* -------------------------------------------------------------- policies */

    /** Declare which thresholds apply, to whom, and where they come from. No limit is built in. */
    workRestDeclarePolicy(input = {}) {
      const check = seatFor(WORK_REST_RIGHTS.POLICY);
      if (!check.ok) return check;
      if (rows('workRestPolicies').length >= L.policies) return fail(`The policy ledger reached its ${L.policies}-row cap.`);
      const label = workRestLabel(input.label);
      if (!label) return fail(`Name the policy in ${L.labelMin}–${L.labelMax} characters — “Plant collective agreement 2026”, not a sentence.`, 'label');
      const scope = WORK_REST_POLICY_SCOPES.includes(input.scope) ? input.scope : null;
      if (!scope) return fail('Say who the policy applies to: the whole workspace, or named people.', 'scope');
      const source = workRestReason(input.source);
      if (!source) return fail(`Write where these limits come from — the statute, agreement or site rule, with enough to find it again (at least ${L.reasonMin} characters). A limit with no source is a number someone typed.`, 'source');
      const typed = {};
      for (const field of WORK_REST_THRESHOLD_FIELDS) {
        const raw = input[field];
        if (raw === null || raw === undefined || String(raw).trim() === '') { typed[field] = null; continue; }
        const minutes = parseWorkRestDuration(raw);
        if (minutes === null) return fail('Write a duration as hours (11), hours and minutes (11:30 or 11h30), minutes (45m) or days (7d). Nothing was rounded and nothing was saved.', field);
        typed[field] = minutes;
      }
      const read = readWorkRestThresholds(typed);
      if (!read.ok) return fail(`That threshold ${read.error}.`, read.field);
      const existing = normalizeWorkRestPolicies(store.state.workRestPolicies, []).filter((row) => !row.retiredAt);
      let personIds = [];
      if (scope === 'workspace') {
        if (!check.operator && check.rank < 4) return fail('A policy for the whole workspace is declared from the executive altitude or by the workspace leader. Declare one for named people in your own span instead.', 'scope');
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
          return fail(`${nameOf(who)} is already named by the live policy “${clash.label}”. One person, one governing policy: retire that one or leave them out.`, 'personIds');
        }
      }
      const policy = {
        id: idFactory('wrp'), label, scope, personIds, source, ...read.thresholds,
        declaredOn: check.today, declaredAt: check.at.toISOString(), declaredById: check.actorId,
        retiredAt: null, retiredById: null, retireReason: '',
      };
      if (normalizeWorkRestPolicies([policy], []).length !== 1) return fail('The policy could not be stored exactly as read. Nothing was saved.');
      store.update((d) => {
        d.workRestPolicies = Array.isArray(d.workRestPolicies) ? d.workRestPolicies : [];
        d.workRestPolicies.push(policy);
      }, {
        type: WORK_REST_EVENTS.POLICY_DECLARED,
        entity: 'workspace',
        entityId: WORK_REST_HREF,
        summary: `Work/rest policy declared for ${scope === 'workspace' ? 'the whole workspace' : `${personIds.length} named person(s)`}: ${WORK_REST_THRESHOLD_FIELDS.filter((field) => read.thresholds[field] !== null).length} threshold field(s), with a written source.`,
      });
      return saved({ policyId: policy.id, thresholds: read.thresholds });
    },

    /** Retire a policy, with the reason. People it governed fall back to the workspace policy, or to none. */
    workRestRetirePolicy(input = {}) {
      const check = seatFor(WORK_REST_RIGHTS.POLICY);
      if (!check.ok) return check;
      const policyId = text(input.policyId, 120);
      const policy = normalizeWorkRestPolicies(store.state.workRestPolicies, []).find((row) => row.id === policyId);
      if (!policy) return fail('That policy is not on the record.', 'policyId');
      if (policy.retiredAt) return fail('That policy is already retired.', 'policyId');
      const holds = check.operator || (policy.scope === 'people'
        ? policy.personIds.every((personId) => ['operator', 'tree', 'line'].includes(check.reachOf(personId)))
        : check.rank >= 4);
      if (!holds) return fail('This seat does not hold everyone that policy governs, so it cannot retire it.', 'policyId');
      const reason = workRestReason(input.reason);
      if (!reason) return fail(`Write why the policy is retired (at least ${L.reasonMin} characters). The people it governed are tested against nothing until another applies.`, 'reason');
      store.update((d) => {
        const target = (d.workRestPolicies || []).find((entry) => entry && entry.id === policyId);
        if (target) { target.retiredAt = check.at.toISOString(); target.retiredById = check.actorId; target.retireReason = reason; }
      }, { type: WORK_REST_EVENTS.POLICY_RETIRED, entity: 'workspace', entityId: WORK_REST_HREF, summary: 'Work/rest policy retired with a written reason. Nobody is tested against it from now on.' });
      return saved({ policyId });
    },

    /* ------------------------------------------------------------ governing */

    /** Re-run RULE-WRR-01 on the shared spine. A pause still governs: this retries the cap, it does not override the switch. */
    workRestScan() {
      const check = seatFor(WORK_REST_RIGHTS.GOVERN);
      if (!check.ok) return check;
      store.update(() => {}, {
        type: WORK_REST_EVENTS.SCAN,
        entity: 'workspace',
        entityId: WORK_REST_HREF,
        summary: `Work/rest conflict scan requested (${WORK_REST_RULE_ID}).`,
      });
      return saved({ report: read(check), effects: (store.lastPropagations || []).filter((effect) => effect && effect.ruleId === WORK_REST_RULE_ID) });
    },

    /** Set the conventions. A value outside its declared bounds is REFUSED, never clamped. */
    workRestSetConventions(patch = {}) {
      const check = seatFor(WORK_REST_RIGHTS.GOVERN);
      if (!check.ok) return check;
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return fail('Work/rest conventions must be supplied as a plain object. Nothing was saved.', 'settings');
      const names = new Map(Object.entries(WORK_REST_SETTING_KEYS).map(([name, key]) => [key, name]));
      const keys = Object.keys(patch);
      if (!keys.length) return fail('State at least one work/rest convention to update. Nothing was saved.', 'settings');
      for (const key of keys) {
        const name = names.get(key);
        if (!name) return fail(`“${key}” is not a declared work/rest convention. Nothing was saved.`, key);
        if (name === 'autoPropagate') {
          if (typeof patch[key] !== 'boolean') return fail(`${WORK_REST_SETTING_LABELS.autoPropagate} must be true or false. Nothing was saved.`, key);
        } else {
          const [min, max] = WORK_REST_BOUNDS[name];
          if (!Number.isInteger(patch[key]) || patch[key] < min || patch[key] > max) {
            return fail(`${WORK_REST_SETTING_LABELS[name]} must be a whole number from ${min} to ${max}. Nothing was clamped and nothing was saved.`, key);
          }
        }
      }
      const next = normalizeWorkRestSettings({ ...settings(), ...patch });
      store.update((d) => { d.settings = { ...(d.settings || {}), ...next }; }, {
        type: WORK_REST_EVENTS.CONVENTIONS,
        entity: 'settings',
        entityId: WORK_REST_HREF,
        summary: `Work/rest conventions set: ${next.workRestBackDays} d behind, ${next.workRestAheadDays} d ahead, automation ${next.workRestAutoPropagate ? 'on' : 'off'}.`.slice(0, 300),
      });
      return saved({ conventions: next });
    },
  };
}
