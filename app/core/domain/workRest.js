/**
 * app/core/domain/workRest.js — the one reader of the Cross-Line Work/Rest
 * Recovery Ledger (ADR-0209, Schema v163, `#/standard-work?panel=rest`).
 *
 * Everything the panel, the brief, the CSV, the navigation counter, the door's
 * preview and `RULE-WRR-01` print comes from ONE evaluation per person
 * (`evaluateWorkRest`, the integer kernel), so no two surfaces can disagree
 * about a rest. Nothing is stored: every spell, rest, total and verdict is
 * recomputed from the declared shifts, their amendments, the coverage
 * attestations and the live policies.
 *
 * MATRIX. A person's shifts are merged across EVERY reporting line before
 * anything is measured. The person is counted once in every span, however many
 * lines lead to it. A conflict made inside one line is owed to that line's
 * holder; one made by two lines is owed to the lowest seat above both.
 */

import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import { canAct } from './seat.js';
import { evaluateWorkRest, intersectRangeLists, mergeRanges, rangeCovered } from './workRestMath.js';
import {
  WORK_REST_ENGINE_VERSION,
  WORK_REST_FINDING_BY_KEY,
  WORK_REST_FINDING_KEYS,
  WORK_REST_FRAMEWORKS,
  WORK_REST_LIMITS,
  WORK_REST_METHOD,
  WORK_REST_RIGHTS,
  WORK_REST_ROUTE_BY_KEY,
  WORK_REST_SETTING_KEYS,
  WORK_REST_SHIFT_STATE_BY_KEY,
  WORK_REST_SOURCE_BY_KEY,
  WORK_REST_THRESHOLDS,
  WORK_REST_UNPROVEN_BY_KEY,
  WORK_REST_VERDICT_BY_KEY,
  WORK_REST_VERDICT_KEYS,
} from './workRestRegistry.js';
import {
  normalizeWorkRestActs,
  normalizeWorkRestCoverage,
  normalizeWorkRestPolicies,
  normalizeWorkRestSettings,
  normalizeWorkRestShifts,
  readEffectiveShifts,
  workRestSignature,
} from './workRestSchema.js';
import {
  dayStartMinutes,
  formatInstant,
  formatMinutes,
  instantMinutes,
  minutesToDay,
  storedOffsetHolds,
} from './workRestTime.js';

const L = WORK_REST_LIMITS;
const DAY = 1440;
const VERDICT_ORDER = new Map(['conflict', 'unproven', 'policy-conflict', 'no-policy', 'clear', 'no-record'].map((key, index) => [key, index]));

/* ------------------------------------------------------------------ record */

/** The four ledgers, read exactly, with shifts as they are read today. */
export function readWorkRestRecord(state = {}, warnings = []) {
  const shifts = normalizeWorkRestShifts(state.workRestShifts, warnings);
  const acts = normalizeWorkRestActs(state.workRestActs, shifts, warnings);
  return {
    shifts: readEffectiveShifts(shifts, acts),
    acts,
    coverage: normalizeWorkRestCoverage(state.workRestCoverage, warnings),
    policies: normalizeWorkRestPolicies(state.workRestPolicies, warnings),
  };
}

/** The stretch that is read: whole UTC days, `backDays` behind today through `aheadDays` ahead. */
export function workRestHorizon(now, conv) {
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const today = dayKey(at) || new Date().toISOString().slice(0, 10);
  const todayStart = dayStartMinutes(today);
  const backDays = conv[WORK_REST_SETTING_KEYS.backDays];
  const aheadDays = conv[WORK_REST_SETTING_KEYS.aheadDays];
  const from = todayStart - backDays * DAY;
  const to = todayStart + (aheadDays + 1) * DAY;
  return {
    today, nowMin: Math.floor(at.getTime() / 60000), from, to, backDays, aheadDays,
    fromDay: minutesToDay(from), toDay: minutesToDay(to - DAY), days: backDays + aheadDays + 1,
  };
}

/**
 * The ONE live policy that governs a person, or the reason there is none. A
 * policy naming the person outranks the workspace policy; two of the same rank
 * are a conflict nobody resolved, and the ledger does not resolve it for them.
 */
export function governingWorkRestPolicy(policies, personId) {
  const live = policies.filter((row) => !row.retiredAt);
  const named = live.filter((row) => row.scope === 'people' && row.personIds.includes(personId));
  if (named.length === 1) return { state: 'declared', policy: named[0], basis: 'named' };
  if (named.length > 1) return { state: 'conflict', policy: null, basis: 'named', candidates: named.map((row) => row.id) };
  const workspace = live.filter((row) => row.scope === 'workspace');
  if (workspace.length === 1) return { state: 'declared', policy: workspace[0], basis: 'workspace' };
  if (workspace.length > 1) return { state: 'conflict', policy: null, basis: 'workspace', candidates: workspace.map((row) => row.id) };
  return { state: 'none', policy: null, basis: null };
}

const thresholdsOf = (policy) => (policy ? {
  minRestMin: policy.minRestMin, maxSpellMin: policy.maxSpellMin,
  longRestMin: policy.longRestMin, longRestWithinMin: policy.longRestWithinMin,
  workCapMin: policy.workCapMin, workCapWindowMin: policy.workCapWindowMin,
} : null);

/** One line's attested stretches for one person, as merged `[from, to)` minute ranges. */
function lineCoverage(coverage, personId, lineManagerId) {
  return mergeRanges(coverage
    .filter((row) => !row.withdrawnAt && row.personId === personId && row.lineManagerId === lineManagerId)
    .map((row) => ({ from: dayStartMinutes(row.fromDay), to: dayStartMinutes(row.toDay) + DAY })));
}

/** The reading of one person: the kernel's evaluation, then the verdict. */
function readPerson({ personId, shifts, policies, lineRanges, horizon }) {
  const working = shifts.filter((shift) => !shift.cancelled);
  const governing = governingWorkRestPolicy(policies, personId);
  const coverage = lineRanges === null ? [] : (lineRanges.length ? intersectRangeLists(lineRanges) : []);
  const evaluation = evaluateWorkRest({
    intervals: working.map((shift) => ({ id: shift.id, s: shift.s, e: shift.e, line: shift.lineManagerId })),
    policy: governing.state === 'declared' ? thresholdsOf(governing.policy) : null,
    coverage,
    horizon,
  });
  const inHorizon = working.filter((shift) => shift.e > horizon.from && shift.s < horizon.to);
  let verdict;
  if (evaluation.findings.length) verdict = 'conflict';
  else if (!inHorizon.length) verdict = 'no-record';
  else if (governing.state === 'conflict') verdict = 'policy-conflict';
  else if (governing.state === 'none') verdict = 'no-policy';
  else if (evaluation.unproven.length) verdict = 'unproven';
  else verdict = 'clear';
  return { personId, working, inHorizon, governing, evaluation, verdict, coverage };
}

/* ------------------------------------------------------------ presentation */

/** The stored offset of the shift end nearest an instant — so a printed time is unambiguous. */
function offsetNear(at, ids, shiftById) {
  let best = null;
  for (const shiftId of ids) {
    const shift = shiftById.get(shiftId);
    if (!shift) continue;
    for (const [instant, offsetMin] of [[shift.s, shift.effStartOffsetMin], [shift.e, shift.effEndOffsetMin]]) {
      const distance = Math.abs(instant - at);
      if (!best || distance < best.distance) best = { distance, offsetMin };
    }
  }
  return best ? best.offsetMin : 0;
}

/** One kernel finding, in words, with the exact change that would remove it. */
export function presentWorkRestFinding(finding, { personId, shiftById, nameOf, nowMin, policy = null }) {
  const when = (at) => formatInstant(at, offsetNear(at, finding.ids, shiftById));
  const lineIds = [...new Set(finding.lines.filter(Boolean))];
  const lineNames = lineIds.map((lineId) => nameOf(lineId));
  const crossLine = lineIds.length > 1;
  const across = crossLine ? ` across ${lineIds.length} lines (${lineNames.join(' · ')})` : '';
  let sentence;
  let fix;
  if (finding.kind === 'double-booked') {
    sentence = `Two recorded shifts overlap for ${formatMinutes(finding.measure)}, from ${when(finding.from)} to ${when(finding.to)}${across}.`;
    fix = 'One of the two has to move or be cancelled. The ledger does not choose which.';
  } else if (finding.kind === 'short-rest') {
    sentence = `${formatMinutes(finding.measure)} of rest between work ending ${when(finding.from)} and work starting ${when(finding.to)}${across}; the declared minimum is ${formatMinutes(finding.limit)} — ${formatMinutes(finding.excess)} short.`;
    fix = `Start the later shift no earlier than ${when(finding.earliestStart)}, or end the earlier one by ${when(finding.latestEnd)}.`;
  } else if (finding.kind === 'long-spell') {
    sentence = `An unbroken spell of ${formatMinutes(finding.measure)} from ${when(finding.from)} to ${when(finding.to)}, made of ${finding.ids.length} shift(s)${across}; the declared maximum is ${formatMinutes(finding.limit)} — ${formatMinutes(finding.excess)} over.`;
    fix = `The spell passes the maximum at ${when(finding.at)}. Ending it there, or opening a rest inside it, removes the conflict.`;
  } else if (finding.kind === 'long-rest-overdue') {
    const anchor = finding.anchor === 'observed' ? `the previous long rest ended ${when(finding.from)}` : `the first recorded spell began ${when(finding.from)} (the most favourable reading of an unknown history)`;
    sentence = `No rest of at least ${formatMinutes(policy?.longRestMin)} began within ${formatMinutes(finding.limit)} after ${anchor}; the earliest one the record allows begins ${when(finding.to)} — ${formatMinutes(finding.excess)} late${across}.`;
    fix = `A rest of at least ${formatMinutes(policy?.longRestMin)} had to begin by ${when(finding.at)}.`;
  } else {
    sentence = `${formatMinutes(finding.measure)} of work inside the ${formatMinutes(policy?.workCapWindowMin)} window ending ${when(finding.to)}${across}; the declared cap is ${formatMinutes(finding.limit)} — ${formatMinutes(finding.excess)} over.`;
    fix = `The cap is passed at ${when(finding.at)}. Work after that minute inside this window is over the cap.`;
  }
  return {
    kind: finding.kind,
    kindLabel: WORK_REST_FINDING_BY_KEY[finding.kind]?.label || finding.kind,
    at: finding.at,
    atLabel: when(finding.at),
    ahead: finding.at > nowMin,
    crossLine,
    lineIds,
    lineNames,
    measureMinutes: finding.measure,
    limitMinutes: finding.limit,
    excessMinutes: finding.excess,
    shiftIds: [...finding.ids],
    sentence,
    fix,
    signature: workRestSignature({ personId, kind: finding.kind, at: finding.at, ids: finding.ids }),
  };
}

/* ------------------------------------------------------------------ owners */

/**
 * Who a preventable conflict is owed to, on today's reporting graph.
 *
 * One line → that line's holder. Several lines → the lowest seat above ALL of
 * them (`matrixJointApex`), never one line's manager on behalf of another. A
 * line whose manager has left the roster falls back to the person's current
 * lines. The workspace leader is never sent a delegation; a diamond with no
 * single apex is `ambiguous` and nobody is chosen.
 */
export function resolveWorkRestOwner(matrix, personId, lineIds) {
  if (!matrix) return { state: 'ambiguous', seatId: null, basis: null };
  if (!matrix.roster.has(personId)) return { state: 'off-roster', seatId: null, basis: null };
  const current = [...new Set(matrix.nodes.get(personId)?.managerIds || [])];
  const known = (lineId) => lineId === LEADER_ID || matrix.roster.has(lineId);
  let lines = [...new Set((lineIds || []).filter(Boolean))];
  if (!lines.length || lines.some((lineId) => !known(lineId))) lines = [...new Set([...lines.filter(known), ...current])];
  lines = lines.filter((lineId) => lineId !== personId);
  if (!lines.length) return { state: 'off-roster', seatId: null, basis: null };
  if (lines.length === 1) {
    return lines[0] === LEADER_ID
      ? { state: 'leader-held', seatId: null, basis: 'line-holder' }
      : { state: 'seat', seatId: lines[0], basis: 'line-holder' };
  }
  const apex = matrixJointApex(matrix, lines);
  if (!apex.unique || !apex.apexId) return { state: 'ambiguous', seatId: null, basis: 'joint-apex' };
  if (apex.apexId === LEADER_ID) return { state: 'leader-held', seatId: null, basis: 'joint-apex' };
  if (apex.apexId === personId) return { state: 'ambiguous', seatId: null, basis: 'joint-apex' };
  return { state: 'seat', seatId: apex.apexId, basis: 'joint-apex' };
}

/* ------------------------------------------------------------- whole record */

const peopleOf = (state) => (Array.isArray(state.people) ? state.people : []).filter((p) => p && p.id && p.status !== 'archived');

function groupShifts(shifts) {
  const byPerson = new Map();
  for (const shift of shifts) {
    if (!byPerson.has(shift.personId)) byPerson.set(shift.personId, []);
    byPerson.get(shift.personId).push(shift);
  }
  return byPerson;
}

/**
 * Every provable conflict whose decisive minute is still ahead, with the seat it
 * is owed to. `RULE-WRR-01` reads exactly this list. Coverage is not consulted:
 * a conflict does not need it.
 */
export function workRestConflictsAhead(state = {}, { now = new Date(), matrix = null } = {}) {
  const conv = normalizeWorkRestSettings(state.settings || {});
  const horizon = workRestHorizon(now, conv);
  const record = readWorkRestRecord(state, []);
  const byPerson = groupShifts(record.shifts);
  const names = new Map(peopleOf(state).map((p) => [p.id, p.name || p.id]));
  const nameOf = (personId) => (personId === LEADER_ID ? (matrix?.nodes?.get(LEADER_ID)?.name || 'Workspace leader') : (names.get(personId) || 'Someone no longer on the roster'));
  const out = [];
  for (const [personId, shifts] of byPerson) {
    const reading = readPerson({ personId, shifts, policies: record.policies, lineRanges: null, horizon });
    if (!reading.evaluation.findings.length) continue;
    const shiftById = new Map(reading.working.map((shift) => [shift.id, shift]));
    for (const finding of reading.evaluation.findings) {
      if (!(finding.at > horizon.nowMin)) continue;
      const shown = presentWorkRestFinding(finding, { personId, shiftById, nameOf, nowMin: horizon.nowMin, policy: reading.governing.policy });
      out.push({
        ...shown,
        personId,
        personName: nameOf(personId),
        dueOn: minutesToDay(finding.at) < horizon.today ? horizon.today : minutesToDay(finding.at),
        owner: resolveWorkRestOwner(matrix, personId, shown.lineIds),
      });
    }
  }
  out.sort((a, b) => a.at - b.at || a.personId.localeCompare(b.personId) || a.kind.localeCompare(b.kind));
  return out;
}

/* ------------------------------------------------------------------- reader */

/**
 * What one seat holds and reaches. ONE definition, read by the register, the
 * door and the navigation counter.
 */
export function workRestSeatProjection(seat) {
  const operator = !seat || seat.fullAccess === true;
  const actorId = operator ? LEADER_ID : (seat.nodeId || seat.id || null);
  const may = (right) => operator || (Number.isInteger(seat?.rank) && canAct(right, seat).allow === true);
  const reachOf = (personId) => {
    if (operator) return 'operator';
    if (personId === actorId) return 'self';
    if (seat.scope instanceof Set && seat.scope.has(personId)) return 'tree';
    if (seat.lineScope instanceof Set && seat.lineScope.has(personId)) return 'line';
    return null;
  };
  /** How this seat holds the LINE a shift is worked for — the route that carries the right to roster it. */
  const holdsLine = (lineManagerId) => {
    if (operator) return 'operator';
    if (!lineManagerId || lineManagerId === LEADER_ID) return null;
    if (lineManagerId === actorId) return 'line-holder';
    if (seat.scope instanceof Set && seat.scope.has(lineManagerId)) return 'above-line';
    return null;
  };
  return {
    operator, actorId, rank: operator ? 5 : (Number.isInteger(seat?.rank) ? seat.rank : 0),
    canRoster: may(WORK_REST_RIGHTS.ROSTER), canPolicy: may(WORK_REST_RIGHTS.POLICY), canGovern: may(WORK_REST_RIGHTS.GOVERN),
    reachOf, holdsLine,
  };
}

function policyRow(policy, { nameOf, reachOf, canPolicy, operator, rank }) {
  const visiblePeople = policy.personIds.filter((personId) => reachOf(personId));
  const reachesAll = policy.scope === 'people' && policy.personIds.every((personId) => ['operator', 'tree', 'line'].includes(reachOf(personId)));
  return {
    policyId: policy.id,
    label: policy.label,
    scope: policy.scope,
    scopeLabel: policy.scope === 'workspace' ? 'Whole workspace' : `${policy.personIds.length} named ${policy.personIds.length === 1 ? 'person' : 'people'}`,
    peopleN: policy.personIds.length,
    peopleNames: visiblePeople.map(nameOf),
    peopleWithheldN: policy.personIds.length - visiblePeople.length,
    source: policy.source,
    minRestMin: policy.minRestMin, maxSpellMin: policy.maxSpellMin,
    longRestMin: policy.longRestMin, longRestWithinMin: policy.longRestWithinMin,
    workCapMin: policy.workCapMin, workCapWindowMin: policy.workCapWindowMin,
    thresholds: thresholdLines(policy),
    declaredOn: policy.declaredOn,
    declaredByName: nameOf(policy.declaredById),
    live: !policy.retiredAt,
    retiredOn: policy.retiredAt ? policy.retiredAt.slice(0, 10) : null,
    retiredByName: policy.retiredById ? nameOf(policy.retiredById) : null,
    retireReason: policy.retireReason,
    canRetire: !policy.retiredAt && canPolicy && (operator || (policy.scope === 'people' ? reachesAll : rank >= 4)),
  };
}

/** A policy's thresholds as printed lines; an undeclared one says so. */
export function thresholdLines(policy) {
  return WORK_REST_THRESHOLDS.map((threshold) => {
    const values = threshold.fields.map((field) => policy?.[field] ?? null);
    const declared = values.every((value) => Number.isInteger(value));
    let text = 'not declared — not tested';
    if (declared) {
      if (threshold.key === 'minRest') text = `at least ${formatMinutes(values[0])}`;
      else if (threshold.key === 'maxSpell') text = `at most ${formatMinutes(values[0])}`;
      else if (threshold.key === 'longRest') text = `at least ${formatMinutes(values[0])}, beginning within ${formatMinutes(values[1])} of the previous one ending`;
      else text = `at most ${formatMinutes(values[0])} inside any ${formatMinutes(values[1])}`;
    }
    return { key: threshold.key, label: threshold.label, declared, text };
  });
}

/**
 * The whole ledger, projected for one seat. `seat: null` is the undeclared
 * operator view — the whole workspace.
 */
export function buildWorkRest(state = {}, { now = new Date(), settings = null, seat = null } = {}) {
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const cfg = settings || state.settings || {};
  const conv = normalizeWorkRestSettings(cfg);
  const horizon = workRestHorizon(at, conv);
  const warnings = [];
  const record = readWorkRestRecord(state, warnings);
  const projection = workRestSeatProjection(seat);
  const { operator, actorId, canRoster, canPolicy, canGovern, reachOf, holdsLine, rank } = projection;

  let matrix = null;
  try {
    matrix = buildMatrix(state, { now: at, settings: { ...cfg, activeSeatId: null } });
  } catch {
    matrix = null;
  }
  const roster = peopleOf(state);
  const names = new Map(roster.map((p) => [p.id, p.name || p.id]));
  const nameOf = (personId) => (personId === LEADER_ID
    ? (matrix?.nodes?.get(LEADER_ID)?.name || 'Workspace leader')
    : (names.get(personId) || 'Someone no longer on the roster'));
  const linesOfPerson = (personId) => (matrix?.nodes?.get(personId)?.lines || []).map((line) => ({ managerId: line.managerId, kind: line.kind, declared: line.source === 'declared' }));

  const byPerson = groupShifts(record.shifts);
  const refusals = [];
  if (!matrix) refusals.push('The reporting graph could not be read, so no person’s lines are known. No clearance is given to anyone and no conflict is routed.');

  /* 1. One reading per person this seat reaches. */
  const reached = roster.filter((person) => reachOf(person.id));
  const outsideN = roster.length - reached.length;
  const readings = new Map();
  for (const person of reached) {
    const lines = linesOfPerson(person.id);
    const lineRanges = matrix ? lines.map((line) => lineCoverage(record.coverage, person.id, line.managerId)) : [];
    readings.set(person.id, {
      lines, lineRanges,
      ...readPerson({ personId: person.id, shifts: byPerson.get(person.id) || [], policies: record.policies, lineRanges, horizon }),
    });
  }

  /* 2. One row per person with anything to print. */
  const rows = [];
  const counts = Object.fromEntries(WORK_REST_VERDICT_KEYS.map((key) => [key, 0]));
  const byKind = Object.fromEntries(WORK_REST_FINDING_KEYS.map((key) => [key, 0]));
  const totals = { findingsN: 0, aheadN: 0, crossLineN: 0, shiftsN: 0, cancelledN: 0, unconfirmedPastN: 0, zoneDriftN: 0, multiLineN: 0 };
  const pairs = new Map();
  for (const person of reached) {
    const reading = readings.get(person.id);
    counts[reading.verdict] += 1;
    if (reading.lines.length > 1) totals.multiLineN += 1;
    const all = byPerson.get(person.id) || [];
    const shown = all.filter((shift) => shift.e > horizon.from && shift.s < horizon.to);
    if (reading.verdict === 'no-record' && !shown.length) continue;

    const shiftById = new Map(all.map((shift) => [shift.id, shift]));
    const findings = reading.evaluation.findings.slice(0, L.findingsPerPerson).map((finding) => {
      const row = presentWorkRestFinding(finding, { personId: person.id, shiftById, nameOf, nowMin: horizon.nowMin, policy: reading.governing.policy });
      const owner = row.ahead ? resolveWorkRestOwner(matrix, person.id, row.lineIds) : null;
      return { ...row, owner, ownerName: owner?.state === 'seat' ? nameOf(owner.seatId) : null };
    });
    for (const finding of findings) {
      totals.findingsN += 1;
      byKind[finding.kind] += 1;
      if (finding.ahead) totals.aheadN += 1;
      if (finding.crossLine) {
        totals.crossLineN += 1;
        const sortedLines = [...finding.lineIds].sort();
        for (let i = 0; i < sortedLines.length; i += 1) {
          for (let j = i + 1; j < sortedLines.length; j += 1) {
            const key = `${sortedLines[i]}|${sortedLines[j]}`;
            if (!pairs.has(key)) pairs.set(key, { a: sortedLines[i], b: sortedLines[j], people: new Set(), findingsN: 0, aheadN: 0 });
            const pair = pairs.get(key);
            pair.people.add(person.id);
            pair.findingsN += 1;
            if (finding.ahead) pair.aheadN += 1;
          }
        }
      }
    }

    let driftN = 0;
    let unconfirmedPastN = 0;
    let cancelledN = 0;
    const shiftRows = shown.map((shift) => {
      const drift = shift.cancelled ? false
        : (storedOffsetHolds(shift.zone, shift.effStart, shift.effStartOffsetMin) === false || storedOffsetHolds(shift.zone, shift.effEnd, shift.effEndOffsetMin) === false);
      if (drift) driftN += 1;
      if (shift.cancelled) cancelledN += 1;
      const ended = shift.e <= horizon.nowMin;
      if (!shift.cancelled && ended && !shift.confirmed) unconfirmedPastN += 1;
      const held = ['operator', 'tree', 'line'].includes(reachOf(person.id));
      const route = held ? holdsLine(shift.lineManagerId) : null;
      const seesNote = operator || Boolean(route);
      return {
        shiftId: shift.id,
        lineManagerId: shift.lineManagerId,
        lineName: nameOf(shift.lineManagerId),
        zone: shift.zone,
        startLabel: formatInstant(shift.s, shift.effStartOffsetMin),
        endLabel: formatInstant(shift.e, shift.effEndOffsetMin),
        startWall: shift.effStart,
        endWall: shift.effEnd,
        startUtcMin: shift.s,
        endUtcMin: shift.e,
        minutes: shift.minutes,
        state: shift.state,
        stateLabel: WORK_REST_SHIFT_STATE_BY_KEY[shift.state]?.label || shift.state,
        amended: shift.amended,
        rosteredLabel: shift.amended
          ? `${formatInstant(instantMinutes(shift.start, shift.startOffsetMin), shift.startOffsetMin)} → ${formatInstant(instantMinutes(shift.end, shift.endOffsetMin), shift.endOffsetMin)}`
          : null,
        source: shift.source,
        sourceLabel: WORK_REST_SOURCE_BY_KEY[shift.source]?.label || shift.source,
        via: shift.via,
        viaLabel: WORK_REST_ROUTE_BY_KEY[shift.via]?.label || shift.via,
        note: seesNote ? shift.note : '',
        noteWithheld: !seesNote && Boolean(shift.note),
        cancelReason: shift.cancelled && seesNote ? (shift.lastAct?.reason || '') : '',
        ended,
        ahead: shift.s > horizon.nowMin,
        zoneDrift: drift,
        inConflict: findings.some((finding) => finding.shiftIds.includes(shift.id)),
        canAmend: canRoster && Boolean(route) && !shift.cancelled && shift.actsN < L.actsPerShift,
      };
    });
    totals.shiftsN += shiftRows.length;
    totals.cancelledN += cancelledN;
    totals.unconfirmedPastN += unconfirmedPastN;
    totals.zoneDriftN += driftN;

    const rests = reading.evaluation.rests
      .filter((rest) => rest.to > horizon.from && rest.from < horizon.to)
      .map((rest) => {
        const minRest = reading.governing.policy?.minRestMin ?? null;
        const short = Number.isInteger(minRest) && rest.minutes < minRest;
        return {
          fromUtcMin: rest.from, toUtcMin: rest.to, minutes: rest.minutes, proven: rest.proven,
          state: short ? 'short' : rest.proven ? 'proven' : 'unproven',
        };
      });

    const lineRows = reading.lines.map((line, index) => {
      const ranges = reading.lineRanges[index] || [];
      const complete = rangeCovered(ranges, horizon.from, horizon.to);
      const coveredMinutes = ranges.reduce((sum, range) => sum + Math.max(0, Math.min(range.to, horizon.to) - Math.max(range.from, horizon.from)), 0);
      const route = ['operator', 'tree', 'line'].includes(reachOf(person.id)) ? holdsLine(line.managerId) : null;
      return {
        managerId: line.managerId,
        managerName: nameOf(line.managerId),
        kind: line.kind,
        declared: line.declared,
        complete,
        missingDays: Math.round((horizon.to - horizon.from - coveredMinutes) / DAY),
        ranges: ranges.filter((range) => range.to > horizon.from && range.from < horizon.to).map((range) => ({ fromDay: minutesToDay(range.from), toDay: minutesToDay(range.to - DAY) })),
        attestations: record.coverage
          .filter((entry) => !entry.withdrawnAt && entry.personId === person.id && entry.lineManagerId === line.managerId)
          .map((entry) => ({
            coverageId: entry.id, fromDay: entry.fromDay, toDay: entry.toDay, attestedOn: entry.attestedOn,
            attestedByName: nameOf(entry.attestedById), viaLabel: WORK_REST_ROUTE_BY_KEY[entry.via]?.label || entry.via,
            canWithdraw: canRoster && Boolean(route),
          })),
        canAttest: canRoster && Boolean(route),
        canRoster: canRoster && Boolean(route),
      };
    });

    const policy = reading.governing.policy;
    const unproven = reading.verdict === 'unproven' ? reading.evaluation.unproven.map((key) => ({ key, says: WORK_REST_UNPROVEN_BY_KEY[key]?.says || key })) : [];
    const verdictSays = WORK_REST_VERDICT_BY_KEY[reading.verdict];
    rows.push({
      personId: person.id,
      name: nameOf(person.id),
      reach: reachOf(person.id),
      verdict: reading.verdict,
      verdictLabel: verdictSays.label,
      verdictTone: verdictSays.tone,
      verdictSays: verdictSays.says,
      unproven,
      policyState: reading.governing.state,
      policyId: policy?.id || null,
      policyLabel: policy?.label || null,
      policyBasis: reading.governing.basis,
      tested: reading.evaluation.tested,
      thresholds: thresholdLines(policy),
      lines: lineRows,
      linesN: lineRows.length,
      coverageComplete: Boolean(matrix) && reading.evaluation.coverageComplete,
      actualsComplete: unconfirmedPastN === 0,
      unconfirmedPastN,
      shifts: shiftRows,
      shiftsN: shiftRows.length,
      cancelledN,
      zoneDriftN: driftN,
      rests,
      findings,
      findingsOmittedN: Math.max(0, reading.evaluation.findings.length - findings.length),
      aheadN: findings.filter((finding) => finding.ahead).length,
      crossLineN: findings.filter((finding) => finding.crossLine).length,
      workMinutes: reading.evaluation.workMinutes,
      longestSpellMinutes: reading.evaluation.longestSpellMinutes,
      shortestRestMinutes: reading.evaluation.shortestRestMinutes,
    });
  }
  rows.sort((a, b) => VERDICT_ORDER.get(a.verdict) - VERDICT_ORDER.get(b.verdict)
    || (b.aheadN - a.aheadN) || a.name.localeCompare(b.name) || a.personId.localeCompare(b.personId));

  /* 3. The roll-up: every span this seat can see, each person counted ONCE in it. */
  const spans = [];
  if (matrix) {
    for (const [nodeId, node] of matrix.nodes) {
      if (!node.descendants || !node.descendants.size) continue;
      const visible = operator || nodeId === actorId || (seat?.scope instanceof Set && seat.scope.has(nodeId));
      if (!visible) continue;
      const span = { managerId: nodeId, name: nameOf(nodeId), depth: node.depth ?? 0, peopleN: 0, notReadN: 0, findingsN: 0, aheadN: 0, crossLineN: 0, ...Object.fromEntries(WORK_REST_VERDICT_KEYS.map((key) => [key, 0])) };
      for (const personId of node.descendants) {
        const reading = readings.get(personId);
        // Someone under this span on a line the reading seat does not hold: counted, never read.
        if (!reading) { if (names.has(personId)) span.notReadN += 1; continue; }
        span.peopleN += 1;
        span[reading.verdict] += 1;
      }
      for (const row of rows) {
        if (!node.descendants.has(row.personId)) continue;
        span.findingsN += row.findings.length;
        span.aheadN += row.aheadN;
        span.crossLineN += row.crossLineN;
      }
      if (span.peopleN || span.notReadN) spans.push(span);
    }
    spans.sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name) || a.managerId.localeCompare(b.managerId));
  }

  const linePairs = [...pairs.values()]
    .map((pair) => ({ aId: pair.a, bId: pair.b, aName: nameOf(pair.a), bName: nameOf(pair.b), peopleN: pair.people.size, findingsN: pair.findingsN, aheadN: pair.aheadN }))
    .sort((a, b) => b.findingsN - a.findingsN || a.aName.localeCompare(b.aName) || a.bName.localeCompare(b.bName));

  /* 4. Reconciliation — two claims, reported apart. */
  const verdictSum = WORK_REST_VERDICT_KEYS.reduce((sum, key) => sum + counts[key], 0);
  const balances = verdictSum === reached.length;
  const recount = rows.reduce((acc, row) => {
    acc.findings += row.findings.length;
    acc.ahead += row.findings.filter((finding) => finding.ahead).length;
    acc.shifts += row.shifts.length;
    return acc;
  }, { findings: 0, ahead: 0, shifts: 0 });
  const kindSum = WORK_REST_FINDING_KEYS.reduce((sum, key) => sum + byKind[key], 0);
  const auditClean = recount.findings === totals.findingsN && recount.ahead === totals.aheadN && recount.shifts === totals.shiftsN
    && kindSum === totals.findingsN && rows.every((row) => row.findingsOmittedN === 0);

  const shownRows = rows.slice(0, L.peopleRowsShown);
  if (rows.length > shownRows.length) refusals.push(`${rows.length - shownRows.length} person row(s) are counted in every total and not listed: the panel lists ${L.peopleRowsShown} at most.`);
  if (rows.some((row) => row.findingsOmittedN)) refusals.push(`At least one person carries more than ${L.findingsPerPerson} conflicts; the first ${L.findingsPerPerson} are listed and the rest are not counted in the conflict totals. The printed totals are therefore a floor.`);
  for (const warning of warnings) refusals.push(warning);
  if (counts['policy-conflict']) refusals.push(`${counts['policy-conflict']} person(s) are claimed by more than one live policy. No threshold is tested for them until one policy is retired.`);
  if (totals.zoneDriftN) refusals.push(`${totals.zoneDriftN} shift(s) carry a UTC offset that this device’s time-zone rules no longer give for that wall time. They are read at the offset that was recorded; re-declare them if the zone’s rules really changed.`);

  const livePolicies = record.policies.filter((row) => !row.retiredAt);
  const policyArgs = { nameOf, reachOf, canPolicy, operator, rank };
  return {
    engineVersion: WORK_REST_ENGINE_VERSION,
    today: horizon.today,
    nowMin: horizon.nowMin,
    horizon,
    scope: operator ? 'workspace' : 'seat',
    actorId,
    actorName: nameOf(actorId),
    canRoster,
    canPolicy,
    canPolicyWorkspace: canPolicy && (operator || rank >= 4),
    canGovern,
    conventions: conv,
    automationOn: conv[WORK_REST_SETTING_KEYS.autoPropagate] !== false,
    policies: record.policies.map((policy) => policyRow(policy, policyArgs)).sort((a, b) => Number(b.live) - Number(a.live) || a.label.localeCompare(b.label)),
    livePoliciesN: livePolicies.length,
    people: shownRows,
    allPeople: rows,
    spans,
    linePairs,
    totals: {
      peopleN: reached.length,
      outsideN,
      listedN: rows.length,
      conflictN: counts.conflict,
      policyConflictN: counts['policy-conflict'],
      noPolicyN: counts['no-policy'],
      unprovenN: counts.unproven,
      clearN: counts.clear,
      noRecordN: counts['no-record'],
      multiLineN: totals.multiLineN,
      findingsN: totals.findingsN,
      aheadN: totals.aheadN,
      crossLineN: totals.crossLineN,
      byKind,
      shiftsN: totals.shiftsN,
      cancelledN: totals.cancelledN,
      unconfirmedPastN: totals.unconfirmedPastN,
      zoneDriftN: totals.zoneDriftN,
    },
    reconciliation: {
      balances,
      auditClean,
      says: `${balances ? 'The readings add up' : 'The readings do NOT add up'}: ${verdictSum} reading(s) for ${reached.length} person(s) in reach. ${auditClean ? 'The printed totals are the recounted rows.' : 'The printed totals could not be confirmed against the rows.'}`,
    },
    refusals,
    method: WORK_REST_METHOD,
    frameworks: WORK_REST_FRAMEWORKS,
  };
}

/* -------------------------------------------------------------------- brief */

export function workRestBriefText(report) {
  const t = report.totals;
  const lines = [
    `Work/rest recovery ledger — ${report.today} (${report.scope === 'workspace' ? 'whole workspace' : `seat of ${report.actorName}`})`,
    `Horizon ${report.horizon.fromDay} → ${report.horizon.toDay} (${report.horizon.days} UTC days). ${t.peopleN} person(s) in reach${t.outsideN ? `, ${t.outsideN} outside it and not read` : ''}.`,
    `${t.conflictN} with a provable conflict · ${t.unprovenN} unproven · ${t.clearN} clear on the record · ${t.noPolicyN} with no policy · ${t.policyConflictN} claimed by two policies · ${t.noRecordN} with no shift on record.`,
    `${t.findingsN} conflict(s): ${WORK_REST_FINDING_KEYS.map((key) => `${t.byKind[key]} ${WORK_REST_FINDING_BY_KEY[key].label.toLowerCase()}`).join(', ')}. ${t.aheadN} still ahead; ${t.crossLineN} made by two lines.`,
    `${t.shiftsN} shift(s) read (${t.cancelledN} cancelled); ${t.unconfirmedPastN} ended shift(s) are read as rostered because no actual times were recorded.`,
    report.reconciliation.says,
  ];
  for (const row of report.people.filter((person) => person.verdict === 'conflict').slice(0, 12)) {
    for (const finding of row.findings.slice(0, 3)) {
      lines.push(`- ${row.name}: ${finding.sentence} ${finding.ahead ? finding.fix : 'Already past.'}`);
    }
  }
  for (const refusal of report.refusals) lines.push(`! ${refusal}`);
  lines.push('This compares elapsed clock time with declared numbers. It measures nobody’s fatigue and rates nobody.');
  return lines.join('\n');
}

/* ---------------------------------------------------------------------- CSV */

const blank = (value) => (value === null || value === undefined ? '' : value);
const flag = (value) => (value ? 'yes' : 'no');

/** CSV scope #151. Identity-free: positional codes, counts and whole minutes only. */
export function workRestCsvRows(report) {
  const t = report.totals;
  const base = { generated_on: report.today, horizon_from: report.horizon.fromDay, horizon_to: report.horizon.toDay, engine_version: report.engineVersion };
  const policyCode = new Map(report.policies.map((policy, index) => [policy.policyId, `P${String(index + 1).padStart(2, '0')}`]));
  const out = [{
    ...base,
    row_type: 'workspace', key: report.scope,
    people_n: t.peopleN, conflict_n: t.conflictN, policy_conflict_n: t.policyConflictN, no_policy_n: t.noPolicyN, unproven_n: t.unprovenN, clear_n: t.clearN, no_record_n: t.noRecordN,
    shifts_n: t.shiftsN, cancelled_n: t.cancelledN, unconfirmed_past_n: t.unconfirmedPastN, zone_drift_n: t.zoneDriftN,
    findings_n: t.findingsN, ahead_n: t.aheadN, cross_line_n: t.crossLineN,
    double_booked_n: t.byKind['double-booked'], short_rest_n: t.byKind['short-rest'], long_spell_n: t.byKind['long-spell'], long_rest_overdue_n: t.byKind['long-rest-overdue'], work_cap_n: t.byKind['work-cap'],
    balances: flag(report.reconciliation.balances), audit_clean: flag(report.reconciliation.auditClean),
    claim_reason: report.refusals.length ? `${report.refusals.length} refusal(s) printed on the panel` : '',
  }];
  for (const policy of report.policies) {
    out.push({
      ...base,
      row_type: 'policy', key: policyCode.get(policy.policyId),
      policy_scope: policy.scope, policy_people_n: policy.scope === 'people' ? policy.peopleN : '',
      min_rest_minutes: blank(policy.minRestMin), max_spell_minutes: blank(policy.maxSpellMin),
      long_rest_minutes: blank(policy.longRestMin), long_rest_within_minutes: blank(policy.longRestWithinMin),
      work_cap_minutes: blank(policy.workCapMin), work_cap_window_minutes: blank(policy.workCapWindowMin),
      claim_reason: policy.live ? '' : 'retired',
    });
  }
  report.allPeople.forEach((row, index) => {
    const kind = (key) => row.findings.filter((finding) => finding.kind === key).length;
    out.push({
      ...base,
      row_type: 'person', key: `W${String(index + 1).padStart(2, '0')}`,
      verdict: row.verdict, policy_key: row.policyId ? policyCode.get(row.policyId) : '',
      lines_n: row.linesN, coverage_complete: flag(row.coverageComplete), actuals_complete: flag(row.actualsComplete),
      shifts_n: row.shiftsN, cancelled_n: row.cancelledN, unconfirmed_past_n: row.unconfirmedPastN, zone_drift_n: row.zoneDriftN,
      work_minutes: row.workMinutes, longest_spell_minutes: blank(row.longestSpellMinutes), shortest_rest_minutes: blank(row.shortestRestMinutes),
      findings_n: row.findings.length, ahead_n: row.aheadN, cross_line_n: row.crossLineN,
      double_booked_n: kind('double-booked'), short_rest_n: kind('short-rest'), long_spell_n: kind('long-spell'), long_rest_overdue_n: kind('long-rest-overdue'), work_cap_n: kind('work-cap'),
      claim_reason: row.verdict === 'unproven' ? row.unproven.map((reason) => reason.key).join('; ')
        : row.verdict === 'no-policy' ? 'no live policy applies; no threshold was assumed'
          : row.verdict === 'policy-conflict' ? 'more than one live policy applies'
            : row.shortestRestMinutes === null ? 'one spell only: no rest to measure' : '',
    });
  });
  return out;
}

/* ------------------------------------------------------------------ counter */

/**
 * How many people in this seat's reach carry a provable conflict that is still
 * ahead. Sits in the navigation of every route, so it reads shifts, amendments
 * and policies only — never the reporting graph and never coverage, which a
 * conflict does not depend on. Pinned against the register seat by seat.
 */
export function workRestAttentionCount(state = {}, { now = new Date(), seat = null } = {}) {
  if (!Array.isArray(state?.workRestShifts) || !state.workRestShifts.length) return 0;
  try {
    const conv = normalizeWorkRestSettings(state.settings || {});
    const horizon = workRestHorizon(now, conv);
    const record = readWorkRestRecord(state, []);
    const { reachOf } = workRestSeatProjection(seat);
    const active = new Set(peopleOf(state).map((person) => person.id));
    let owed = 0;
    for (const [personId, shifts] of groupShifts(record.shifts)) {
      if (!active.has(personId) || !reachOf(personId)) continue;
      const reading = readPerson({ personId, shifts, policies: record.policies, lineRanges: null, horizon });
      if (reading.evaluation.findings.some((finding) => finding.at > horizon.nowMin)) owed += 1;
    }
    return owed;
  } catch {
    return 0;
  }
}

/* ------------------------------------------------------------------ preview */

/**
 * What ONE candidate interval would add to a person's record: every conflict
 * that exists with it and did not exist without it. Read over all time, not the
 * horizon, because the door must not admit a conflict just because it is far
 * away. `excludeShiftId` removes the shift being amended from both readings.
 */
export function previewWorkRestShift(state = {}, { now = new Date(), personId, candidate, excludeShiftId = null, names = null } = {}) {
  const record = readWorkRestRecord(state, []);
  const nowMin = Math.floor((now instanceof Date ? now : new Date(now || Date.now())).getTime() / 60000);
  const governing = governingWorkRestPolicy(record.policies, personId);
  const others = record.shifts.filter((shift) => shift.personId === personId && !shift.cancelled && shift.id !== excludeShiftId);
  const everywhere = { from: Number.MIN_SAFE_INTEGER, to: Number.MAX_SAFE_INTEGER };
  const policy = governing.state === 'declared' ? thresholdsOf(governing.policy) : null;
  const toIntervals = (shifts) => shifts.map((shift) => ({ id: shift.id, s: shift.s, e: shift.e, line: shift.lineManagerId }));
  const before = evaluateWorkRest({ intervals: toIntervals(others), policy, coverage: [], horizon: everywhere });
  const withCandidate = [...others, candidate];
  const after = evaluateWorkRest({ intervals: toIntervals(withCandidate), policy, coverage: [], horizon: everywhere });
  const keyOf = (finding) => `${finding.kind}|${finding.at}|${[...finding.ids].sort().join(',')}`;
  const known = new Set(before.findings.map(keyOf));
  const shiftById = new Map(withCandidate.map((shift) => [shift.id, shift]));
  const people = names || new Map(peopleOf(state).map((p) => [p.id, p.name || p.id]));
  const nameOf = (id) => (id === LEADER_ID ? 'the workspace leader' : (people.get(id) || 'someone no longer on the roster'));
  const created = after.findings
    .filter((finding) => !known.has(keyOf(finding)))
    .map((finding) => presentWorkRestFinding(finding, { personId, shiftById, nameOf, nowMin, policy: governing.policy }));
  return {
    policyState: governing.state,
    policyLabel: governing.policy?.label || null,
    created,
    createdAheadN: created.filter((finding) => finding.ahead).length,
    othersN: others.length,
  };
}
