/**
 * app/core/domain/workNight.js — the one reader of the Night-Work & In-Shift
 * Break Reading (ADR-0226, Schema v181, `#/standard-work?panel=night`).
 *
 * Everything the panel, the brief, the CSV, the navigation counter, the door's
 * preview and `RULE-WNR-01` print comes from ONE evaluation per person
 * (`evaluateWorkNight`, the integer kernel), so no two surfaces can disagree
 * about a night minute. Nothing is stored: every night minute, share, streak,
 * continuous stretch and verdict is recomputed from the declared shifts (the
 * SAME ledger ADR-0209 reads), the declared breaks, the declared night policies
 * and the coverage attestations.
 *
 * MATRIX. A person's shifts are merged across EVERY reporting line before
 * anything is measured. The person is counted once in every span, however many
 * lines lead to it. A breach made inside one line is owed to that line's
 * holder; one made by two lines is owed to the lowest seat above both.
 */

import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import { canAct } from './seat.js';
import { readWorkRestRecord, resolveWorkRestOwner } from './workRest.js';
import {
  continuousSegments,
  cleanIntervals,
  fatigueIndex,
  longestConsecutiveRun,
  mergeSpells,
  nightDaysOfShift,
  nightMinutesOfShift,
  nightShareOver,
  nightSharePct,
  nightWindowSet,
} from './workNightMath.js';
import {
  WORK_NIGHT_ENGINE_VERSION,
  WORK_NIGHT_FINDING_BY_KEY,
  WORK_NIGHT_FINDING_KEYS,
  WORK_NIGHT_FRAMEWORKS,
  WORK_NIGHT_LIMITS,
  WORK_NIGHT_METHOD,
  WORK_NIGHT_RIGHTS,
  WORK_NIGHT_ROUTE_BY_KEY,
  WORK_NIGHT_SETTING_KEYS,
  WORK_NIGHT_THRESHOLDS,
  WORK_NIGHT_UNPROVEN_BY_KEY,
  WORK_NIGHT_UNREADABLE_BY_KEY,
  WORK_NIGHT_VERDICT_BY_KEY,
  WORK_NIGHT_VERDICT_KEYS,
} from './workNightRegistry.js';
import {
  normalizeWorkNightBreaks,
  normalizeWorkNightMarkers,
  normalizeWorkNightPolicies,
  normalizeWorkNightSettings,
  workNightSignature,
} from './workNightSchema.js';
import {
  dayStartMinutes,
  formatInstant,
  formatMinutes,
  instantMinutes,
  minutesToDay,
  storedOffsetHolds,
} from './workRestTime.js';

const L = WORK_NIGHT_LIMITS;
const DAY = 1440;
const VERDICT_ORDER = new Map(['breach', 'unproven', 'policy-conflict', 'no-policy', 'clear', 'no-record'].map((key, index) => [key, index]));

/* ------------------------------------------------------------------ record */

/** The night ledgers, read exactly; the shifts are the SAME ledger ADR-0209 reads. */
export function readWorkNightRecord(state = {}, warnings = []) {
  const rest = readWorkRestRecord(state, warnings);
  return {
    shifts: rest.shifts,
    coverage: rest.coverage,
    breaks: normalizeWorkNightBreaks(state.workBreaks, rest.shifts, normalizeWorkNightPolicies(state.workNightPolicies, []), warnings),
    policies: normalizeWorkNightPolicies(state.workNightPolicies, warnings),
    markers: normalizeWorkNightMarkers(state.workNightMarkers, warnings),
  };
}

/** The stretch that is read: the SAME horizon the work/rest ledger reads. */
export function workNightHorizon(now, conv) {
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const today = dayKey(at) || new Date().toISOString().slice(0, 10);
  const todayStart = dayStartMinutes(today);
  const restConv = normalizeWorkRestSettingsShared(conv);
  const backDays = restConv.workRestBackDays;
  const aheadDays = restConv.workRestAheadDays;
  const from = todayStart - backDays * DAY;
  const to = todayStart + (aheadDays + 1) * DAY;
  return {
    today, nowMin: Math.floor(at.getTime() / 60000), from, to, backDays, aheadDays,
    fromDay: minutesToDay(from), toDay: minutesToDay(to - DAY), days: backDays + aheadDays + 1,
  };
}

// The night reading shares the work/rest horizon conventions; imported here to
// avoid a circular import with workRest.js (which imports nothing from here).
import { normalizeWorkRestSettings as normalizeWorkRestSettingsShared } from './workRestSchema.js';

/**
 * The ONE live night policy that governs a person, or the reason there is none.
 * A policy naming the person outranks the workspace policy; two of the same
 * rank are a conflict nobody resolved, and the reading does not resolve it.
 */
export function governingWorkNightPolicy(policies, personId) {
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
  nightFromMin: policy.nightFromMin, nightToMin: policy.nightToMin,
  nightMaxSharePct: policy.nightMaxSharePct, nightMaxConsecutiveNights: policy.nightMaxConsecutiveNights,
  breakAfterMin: policy.breakAfterMin, breakMinMin: policy.breakMinMin,
} : null);

/** One line's attested stretches for one person, as merged `[from, to)` minute ranges. */
function lineCoverage(coverage, personId, lineManagerId) {
  return (coverage || [])
    .filter((row) => !row.withdrawnAt && row.personId === personId && row.lineManagerId === lineManagerId)
    .map((row) => ({ from: dayStartMinutes(row.fromDay), to: dayStartMinutes(row.toDay) + DAY }))
    .sort((a, b) => a.from - b.from || a.to - b.to);
}

/** Merge sorted `[from, to)` ranges into disjoint sorted ranges. */
function mergeRangesLocal(ranges) {
  const sorted = (ranges || []).filter((r) => r && Number.isFinite(r.from) && Number.isFinite(r.to) && r.to > r.from)
    .map((r) => ({ from: r.from, to: r.to })).sort((a, b) => a.from - b.from || a.to - b.to);
  const out = [];
  for (const range of sorted) {
    const last = out[out.length - 1];
    if (last && range.from <= last.to) { if (range.to > last.to) last.to = range.to; } else out.push(range);
  }
  return out;
}

/** The stretches present in EVERY one of several disjoint sorted range lists. */
function intersectRangeListsLocal(lists) {
  if (!Array.isArray(lists) || !lists.length) return [];
  let current = mergeRangesLocal(lists[0]);
  for (let k = 1; k < lists.length; k += 1) {
    const other = mergeRangesLocal(lists[k]);
    const next = [];
    let i = 0;
    let j = 0;
    while (i < current.length && j < other.length) {
      const from = Math.max(current[i].from, other[j].from);
      const to = Math.min(current[i].to, other[j].to);
      if (to > from) next.push({ from, to });
      if (current[i].to < other[j].to) i += 1; else j += 1;
    }
    current = next;
  }
  return current;
}

/** Whether `[from, to]` lies wholly inside one of the disjoint sorted ranges. */
function rangeCoveredLocal(ranges, from, to) {
  for (const range of ranges || []) {
    if (range.from <= from && range.to >= to) return true;
    if (range.from > from) return false;
  }
  return false;
}

/* ------------------------------------------------------------- the kernel */

/**
 * The whole evaluation for one person.
 *
 *   intervals  [{ id, s, e, line, breaks }]   recorded work with its breaks
 *   policy     the governing thresholds, or null
 *   coverage   disjoint sorted `[from, to)` stretches EVERY line attested
 *   horizon    { from, to }
 */
export function evaluateWorkNight({ intervals, policy = null, coverage = [], horizon }) {
  const sorted = cleanIntervals(intervals);
  const spells = mergeSpells(sorted);
  const from = horizon.from;
  const to = horizon.to;
  const inHorizon = (at) => at >= from && at <= to;
  const byId = new Map(sorted.map((row) => [row.id, row]));
  const linesOf = (ids) => [...new Set(ids.map((id) => byId.get(id)?.line ?? null))];
  const findings = [];
  const unproven = [];
  const tested = { nightShare: false, nightStreak: false, breakAfter: false };
  const p = policy || {};
  const nightSet = nightWindowSet(p.nightFromMin, p.nightToMin);

  /* 1. Night minutes per shift and the night-share limit. */
  const shiftReadings = sorted.map((row) => {
    const read = nightMinutesOfShift(row, nightSet);
    const over = (Number.isInteger(p.nightMaxSharePct) && read.coverage !== null)
      ? nightShareOver(read.minutes, read.coverage, p.nightMaxSharePct) : null;
    return {
      id: row.id, s: row.s, e: row.e, line: row.line,
      nightMinutes: read.minutes, coverageMinutes: read.coverage,
      sharePct: read.coverage ? nightSharePct(read.minutes, read.coverage) : null,
      shareOver: over,
    };
  });

  if (Number.isInteger(p.nightMaxSharePct) && nightSet) {
    tested.nightShare = true;
    for (const row of shiftReadings) {
      if (!row.shareOver || !inHorizon(row.s)) continue;
      findings.push({
        kind: 'night-share-breach', at: row.s, measure: row.nightMinutes, coverage: row.coverageMinutes,
        limit: p.nightMaxSharePct, excess: row.nightMinutes * 100 - row.coverageMinutes * p.nightMaxSharePct,
        ids: [row.id], lines: [row.line], from: row.s, to: row.e,
      });
    }
  }

  /* 2. The night streak: the longest run of consecutive UTC days with night
        work, and the limit on it. A shift whose offsets disagree cannot be
        mapped to days exactly; it is refused for the streak with its reason. */
  let dstUnreadableN = 0;
  const nightDays = new Set();
  // The streak reads the WALL-CLOCK fields, which live on the cleaned
  // intervals (`sorted`) — `shiftReadings` above is a print-shaped projection
  // that drops them.
  for (const row of sorted) {
    const days = nightDaysOfShift(row, nightSet);
    if (days === null) { dstUnreadableN += 1; continue; }
    for (const day of days) nightDays.add(day);
  }
  const sortedNightDays = [...nightDays].sort((a, b) => a - b);
  const streak = longestConsecutiveRun(sortedNightDays);
  let streakBreachAt = null;
  let streakBreachMeasure = 0;
  if (Number.isInteger(p.nightMaxConsecutiveNights) && sortedNightDays.length) {
    tested.nightStreak = true;
    if (streak > p.nightMaxConsecutiveNights) {
      // The decisive minute: the start of the first shift on the night that
      // takes the streak past the limit.
      const limitNight = sortedNightDays[p.nightMaxConsecutiveNights];
      const firstShift = sorted.filter((row) => Math.floor(row.s / DAY) === limitNight).sort((a, b) => a.s - b.s)[0];
      streakBreachAt = firstShift ? firstShift.s : null;
      streakBreachMeasure = streak;
      if (streakBreachAt !== null && inHorizon(streakBreachAt)) {
        findings.push({
          kind: 'night-streak-breach', at: streakBreachAt, measure: streak, limit: p.nightMaxConsecutiveNights,
          excess: streak - p.nightMaxConsecutiveNights,
          ids: sorted.filter((row) => Math.floor(row.s / DAY) >= limitNight).map((row) => row.id),
          lines: linesOf(sorted.filter((row) => Math.floor(row.s / DAY) >= limitNight).map((row) => row.id)),
          from: streakBreachAt, to: streakBreachAt,
        });
      }
    }
  }

  /* 3. Continuous work inside every spell, and the break-after limit. */
  const missingBreaks = [];
  let longestContinuous = null;
  for (const spell of spells) {
    const { segments, longest } = continuousSegments(spell, spell.breaks || []);
    if (longestContinuous === null || longest > longestContinuous) longestContinuous = longest;
    if (!Number.isInteger(p.breakAfterMin)) continue;
    tested.breakAfter = true;
    for (const segment of segments) {
      if (segment.minutes <= p.breakAfterMin) continue;
      const shiftIds = spell.ids.filter((shiftId) => {
        const row = byId.get(shiftId);
        return row && row.s < segment.to && row.e > segment.from;
      });
      if (!shiftIds.length) continue;
      missingBreaks.push({
        shiftIds, from: segment.from, to: segment.to, minutes: segment.minutes,
        limit: p.breakAfterMin, excess: segment.minutes - p.breakAfterMin,
      });
    }
  }
  if (missingBreaks.length) unproven.push('break-record-missing');

  /* 4. The schedule fatigue index: a declared convention over the factors the
        policy declares. Every factor is printed; nothing is stored. */
  const factors = [];
  if (Number.isInteger(p.nightMaxSharePct)) {
    for (const row of shiftReadings) {
      if (row.coverageMinutes === null || row.coverageMinutes <= 0) continue;
      factors.push({
        key: 'night-share', label: 'Night share', measure: row.nightMinutes, coverage: row.coverageMinutes,
        limit: p.nightMaxSharePct, ratio: (row.nightMinutes * 100) / (row.coverageMinutes * p.nightMaxSharePct),
      });
    }
  }
  if (Number.isInteger(p.nightMaxConsecutiveNights) && streak > 0) {
    factors.push({ key: 'night-streak', label: 'Night streak', measure: streak, limit: p.nightMaxConsecutiveNights, ratio: streak / p.nightMaxConsecutiveNights });
  }
  if (Number.isInteger(p.breakAfterMin) && longestContinuous !== null && longestContinuous > 0) {
    factors.push({ key: 'continuous-work', label: 'Continuous work', measure: longestContinuous, limit: p.breakAfterMin, ratio: longestContinuous / p.breakAfterMin });
  }
  const index = fatigueIndex(factors);

  const coverageComplete = rangeCoveredLocal(coverage, from, to);
  if (!coverageComplete) unproven.unshift('coverage-gap');
  if (policy && !tested.nightShare && !tested.nightStreak && !tested.breakAfter) unproven.push('no-threshold-tested');

  findings.sort((a, b) => a.at - b.at || a.kind.localeCompare(b.kind) || String(a.ids[0]).localeCompare(String(b.ids[0])));

  const touching = spells.filter((spell) => spell.e > from && spell.s < to);
  return {
    shiftReadings,
    nightDays: sortedNightDays,
    streak,
    streakBreachAt,
    streakBreachMeasure,
    dstUnreadableN,
    findings,
    unproven: [...new Set(unproven)],
    tested,
    coverageComplete,
    missingBreaks,
    longestContinuousMinutes: longestContinuous,
    fatigueIndex: index,
    spellsInHorizon: touching.length,
    nightShiftsN: shiftReadings.filter((row) => row.nightMinutes > 0).length,
  };
}

/* -------------------------------------------------------------- presentation */

/** One kernel finding, in words, with the exact change that would remove it. */
export function presentWorkNightFinding(finding, { personId, shiftById, nameOf, nowMin, policy = null }) {
  const when = (at) => formatInstant(at, shiftById.get(finding.ids[0])?.effStartOffsetMin ?? 0);
  const lineIds = [...new Set(finding.lines.filter(Boolean))];
  const lineNames = lineIds.map((lineId) => nameOf(lineId));
  const crossLine = lineIds.length > 1;
  const across = crossLine ? ` across ${lineIds.length} lines (${lineNames.join(' · ')})` : '';
  let sentence;
  let fix;
  if (finding.kind === 'night-share-breach') {
    sentence = `${formatMinutes(finding.measure)} of ${formatMinutes(finding.coverage)} inside the night window — ${(finding.measure * 1000 / finding.coverage / 10).toFixed(1)}% of the shift, over the declared maximum of ${finding.limit}%${across}.`;
    fix = `Move the shift so at most ${finding.limit}% of its minutes fall in the night window, or declare a different limit with its source. The reading does not choose.`;
  } else {
    sentence = `${finding.measure} consecutive nights with night work, over the declared maximum of ${finding.limit}${across}.`;
    fix = `The streak passes the maximum at ${when(finding.at)}. Moving or cancelling the shift that begins that night, or declaring a different limit with its source, removes the breach.`;
  }
  return {
    kind: finding.kind,
    kindLabel: WORK_NIGHT_FINDING_BY_KEY[finding.kind]?.label || finding.kind,
    at: finding.at,
    atLabel: when(finding.at),
    ahead: finding.at > nowMin,
    crossLine,
    lineIds,
    lineNames,
    measureMinutes: finding.kind === 'night-share-breach' ? finding.measure : null,
    coverageMinutes: finding.coverage ?? null,
    measure: finding.measure,
    limit: finding.limit,
    excess: finding.excess,
    shiftIds: [...finding.ids],
    sentence,
    fix,
    signature: workNightSignature({ personId, kind: finding.kind, at: finding.at, ids: finding.ids }),
  };
}

/* ------------------------------------------------------------------ owners */

/**
 * Who a provable breach is owed to — the same joint-apex routing the work/rest
 * ledger uses: one line → that line's holder; several lines → the lowest seat
 * above ALL of them. Reused verbatim so the two ledgers never disagree about
 * who stands above two lines.
 */
export const resolveWorkNightOwner = resolveWorkRestOwner;

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
 * Every provable night breach whose decisive minute is still ahead, and every
 * missing break record on an ended shift, with the seat each is owed to.
 * `RULE-WNR-01` reads exactly this list.
 */
export function workNightConditions(state = {}, { now = new Date(), matrix = null } = {}) {
  const conv = normalizeWorkNightSettings(state.settings || {});
  const horizon = workNightHorizon(now, conv);
  const record = readWorkNightRecord(state, []);
  const byPerson = groupShifts(record.shifts);
  const breaksByShift = new Map();
  for (const breakRow of record.breaks) {
    if (!breaksByShift.has(breakRow.shiftId)) breaksByShift.set(breakRow.shiftId, []);
    breaksByShift.get(breakRow.shiftId).push(breakRow);
  }
  const names = new Map(peopleOf(state).map((p) => [p.id, p.name || p.id]));
  const nameOf = (personId) => (personId === LEADER_ID ? (matrix?.nodes?.get(LEADER_ID)?.name || 'Workspace leader') : (names.get(personId) || 'Someone no longer on the roster'));
  const out = [];
  for (const [personId, shifts] of byPerson) {
    const governing = governingWorkNightPolicy(record.policies, personId);
    const working = shifts.filter((shift) => !shift.cancelled);
      const intervals = working.map((shift) => ({
        id: shift.id, s: shift.s, e: shift.e, line: shift.lineManagerId,
        effStart: shift.effStart, effEnd: shift.effEnd,
        effStartOffsetMin: shift.effStartOffsetMin, effEndOffsetMin: shift.effEndOffsetMin,
        breaks: (breaksByShift.get(shift.id) || []).map((row) => ({ from: row.s, to: row.e })),
      }));
    const evaluation = evaluateWorkNight({
      intervals,
      policy: governing.state === 'declared' ? thresholdsOf(governing.policy) : null,
      coverage: [],
      horizon: { from: horizon.from, to: horizon.to },
    });
    const shiftById = new Map(working.map((shift) => [shift.id, shift]));
    for (const finding of evaluation.findings) {
      if (!(finding.at > horizon.nowMin)) continue;
      const shown = presentWorkNightFinding(finding, { personId, shiftById, nameOf, nowMin: horizon.nowMin, policy: governing.policy });
      out.push({
        ...shown, personId, personName: nameOf(personId), condition: 'night-breach-ahead',
        dueOn: minutesToDay(finding.at) < horizon.today ? horizon.today : minutesToDay(finding.at),
        owner: resolveWorkNightOwner(matrix, personId, shown.lineIds),
      });
    }
    // A missing break record on an ENDED shift: the ask is for the record.
    for (const missing of evaluation.missingBreaks) {
      const ended = missing.shiftIds.every((shiftId) => {
        const shift = shiftById.get(shiftId);
        return shift && shift.e <= horizon.nowMin;
      });
      if (!ended) continue;
      const first = missing.shiftIds[0];
      const shift = shiftById.get(first);
      const lineIds = [...new Set(missing.shiftIds.map((shiftId) => shiftById.get(shiftId)?.lineManagerId).filter(Boolean))];
      const owner = resolveWorkNightOwner(matrix, personId, lineIds);
      out.push({
        kind: 'break-record-missing',
        kindLabel: 'Break record missing',
        at: missing.to,
        atLabel: formatInstant(missing.to, shift?.effEndOffsetMin ?? 0),
        ahead: false,
        crossLine: lineIds.length > 1,
        lineIds,
        lineNames: lineIds.map((lineId) => nameOf(lineId)),
        measure: missing.minutes,
        limit: missing.limit,
        excess: missing.excess,
        shiftIds: [...missing.shiftIds],
        sentence: `${formatMinutes(missing.minutes)} of continuous work from ${formatInstant(missing.from, shift?.effStartOffsetMin ?? 0)} to ${formatInstant(missing.to, shift?.effEndOffsetMin ?? 0)} with no break recorded; the declared limit requires a break record every ${formatMinutes(missing.limit)}.`,
        fix: 'Record the break(s) actually taken inside that stretch, or state on the record that none was taken. The reading never assumes a break and never scores the person.',
        signature: workNightSignature({ personId, kind: 'break-record-missing', at: missing.to, ids: missing.shiftIds }),
        personId,
        personName: nameOf(personId),
        condition: 'break-record-missing',
        dueOn: horizon.today,
        owner,
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
export function workNightSeatProjection(seat) {
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
  /** How this seat holds the LINE a shift is worked for — the route that carries the right to record a break on it. */
  const holdsLine = (lineManagerId) => {
    if (operator) return 'operator';
    if (!lineManagerId || lineManagerId === LEADER_ID) return null;
    if (lineManagerId === actorId) return 'line-holder';
    if (seat.scope instanceof Set && seat.scope.has(lineManagerId)) return 'above-line';
    return null;
  };
  return {
    operator, actorId, rank: operator ? 5 : (Number.isInteger(seat?.rank) ? seat.rank : 0),
    canRoster: may(WORK_NIGHT_RIGHTS.ROSTER), canPolicy: may(WORK_NIGHT_RIGHTS.POLICY), canGovern: may(WORK_NIGHT_RIGHTS.GOVERN),
    reachOf, holdsLine,
  };
}

/** A policy's thresholds as printed lines; an undeclared one says so. */
export function nightThresholdLines(policy) {
  return WORK_NIGHT_THRESHOLDS.map((threshold) => {
    const values = threshold.fields.map((field) => policy?.[field] ?? null);
    const declared = values.every((value) => Number.isInteger(value));
    let text;
    if (!declared) text = 'not declared — not tested';
    else if (threshold.key === 'nightWindow') {
      text = `${String(Math.floor(values[0] / 60)).padStart(2, '0')}:${String(values[0] % 60).padStart(2, '0')} → ${String(Math.floor(values[1] / 60)).padStart(2, '0')}:${String(values[1] % 60).padStart(2, '0')} (wall clock, wraps at midnight)`;
    } else if (threshold.key === 'nightShare') text = `at most ${values[0]}% of a shift’s minutes`;
    else if (threshold.key === 'nightStreak') text = `at most ${values[0]} consecutive nights`;
    else if (threshold.key === 'breakAfter') text = `a break record every ${formatMinutes(values[0])} of continuous work`;
    else text = `at least ${formatMinutes(values[0])} per recorded break`;
    return { key: threshold.key, label: threshold.label, declared, text };
  });
}

/**
 * The whole reading, projected for one seat. `seat: null` is the undeclared
 * operator view — the whole workspace.
 */
export function buildWorkNight(state = {}, { now = new Date(), settings = null, seat = null } = {}) {
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const cfg = settings || state.settings || {};
  const conv = normalizeWorkNightSettings(cfg);
  const horizon = workNightHorizon(at, conv);
  const warnings = [];
  const record = readWorkNightRecord(state, warnings);
  const projection = workNightSeatProjection(seat);
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
  const breaksByShift = new Map();
  for (const breakRow of record.breaks) {
    if (!breaksByShift.has(breakRow.shiftId)) breaksByShift.set(breakRow.shiftId, []);
    breaksByShift.get(breakRow.shiftId).push(breakRow);
  }
  const refusals = [];
  if (!matrix) refusals.push('The reporting graph could not be read, so no person’s lines are known. No night clearance is given to anyone and no breach is routed.');

  /* 1. One reading per person this seat reaches. */
  const reached = roster.filter((person) => reachOf(person.id));
  const outsideN = roster.length - reached.length;
  const readings = new Map();
  for (const person of reached) {
    const lines = linesOfPerson(person.id);
    const lineRanges = matrix ? lines.map((line) => lineCoverage(record.coverage, person.id, line.managerId)) : [];
    readings.set(person.id, {
      lines, lineRanges,
      governing: governingWorkNightPolicy(record.policies, person.id),
      evaluation: null,
    });
  }
  for (const [personId, shifts] of byPerson) {
    const reading = readings.get(personId);
    if (!reading) continue;
    const working = shifts.filter((shift) => !shift.cancelled);
    const coverage = reading.lineRanges.length ? intersectRangeListsLocal(reading.lineRanges) : [];
    reading.evaluation = evaluateWorkNight({
      intervals: working.map((shift) => ({
        id: shift.id, s: shift.s, e: shift.e, line: shift.lineManagerId,
        effStart: shift.effStart, effEnd: shift.effEnd,
        effStartOffsetMin: shift.effStartOffsetMin, effEndOffsetMin: shift.effEndOffsetMin,
        breaks: (breaksByShift.get(shift.id) || []).map((row) => ({ from: row.s, to: row.e })),
      })),
      policy: reading.governing.state === 'declared' ? thresholdsOf(reading.governing.policy) : null,
      coverage,
      horizon: { from: horizon.from, to: horizon.to },
    });
  }

  /* 2. One row per person with anything to print. */
  const rows = [];
  const counts = Object.fromEntries(WORK_NIGHT_VERDICT_KEYS.map((key) => [key, 0]));
  const byKind = Object.fromEntries(WORK_NIGHT_FINDING_KEYS.map((key) => [key, 0]));
  const totals = { findingsN: 0, aheadN: 0, crossLineN: 0, shiftsN: 0, nightShiftsN: 0, nightPeopleN: 0, missingBreakRecordsN: 0, dstUnreadableN: 0, fatigueIndexMax: null, unconfirmedPastN: 0, nightShareMaxPct: null, maxConsecutiveNights: null };
  for (const person of reached) {
    const reading = readings.get(person.id);
    const evaluation = reading.evaluation;
    if (!evaluation) continue;
    counts[readingVerdict(evaluation, reading.governing)] += 1;
    const all = byPerson.get(person.id) || [];
    const shown = all.filter((shift) => shift.e > horizon.from && shift.s < horizon.to);
    if (readingVerdict(evaluation, reading.governing) === 'no-record' && !shown.length) continue;

    const shiftById = new Map(all.map((shift) => [shift.id, shift]));
    const findings = evaluation.findings.slice(0, L.findingsPerPerson).map((finding) => {
      const row = presentWorkNightFinding(finding, { personId: person.id, shiftById, nameOf, nowMin: horizon.nowMin, policy: reading.governing.policy });
      const owner = row.ahead ? resolveWorkNightOwner(matrix, person.id, row.lineIds) : null;
      return { ...row, owner, ownerName: owner?.state === 'seat' ? nameOf(owner.seatId) : null };
    });
    for (const finding of findings) {
      totals.findingsN += 1;
      byKind[finding.kind] += 1;
      if (finding.ahead) totals.aheadN += 1;
      if (finding.crossLine) totals.crossLineN += 1;
    }

    let unconfirmedPastN = 0;
    let dstUnreadableN = 0;
    const shiftRows = shown.map((shift) => {
      const ended = shift.e <= horizon.nowMin;
      if (!shift.cancelled && ended && !shift.confirmed) unconfirmedPastN += 1;
      const read = evaluation.shiftReadings.find((row) => row.id === shift.id) || null;
      const drift = shift.cancelled ? false
        : (storedOffsetHolds(shift.zone, shift.effStart, shift.effStartOffsetMin) === false || storedOffsetHolds(shift.zone, shift.effEnd, shift.effEndOffsetMin) === false);
      if (!shift.cancelled && shift.effStartOffsetMin !== shift.effEndOffsetMin) dstUnreadableN += 1;
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
        amended: shift.amended,
        nightMinutes: read ? read.nightMinutes : 0,
        coverageMinutes: read ? read.coverageMinutes : null,
        sharePct: read ? read.sharePct : null,
        shareOver: read ? read.shareOver : null,
        nightUnreadable: !shift.cancelled && shift.effStartOffsetMin !== shift.effEndOffsetMin,
        breaks: (breaksByShift.get(shift.id) || []).map((row) => ({
          breakId: row.id, startLabel: formatInstant(row.s, row.startOffsetMin), endLabel: formatInstant(row.e, row.endOffsetMin),
          minutes: row.minutes, declaredOn: row.declaredOn, viaLabel: WORK_NIGHT_ROUTE_BY_KEY[row.via]?.label || row.via,
        })),
        note: seesNote ? shift.note : '',
        noteWithheld: !seesNote && Boolean(shift.note),
        ended,
        ahead: shift.s > horizon.nowMin,
        zoneDrift: drift,
        inConflict: findings.some((finding) => finding.shiftIds.includes(shift.id)),
        canRecordBreak: canRoster && Boolean(route) && !shift.cancelled && (breaksByShift.get(shift.id) || []).length < L.breaksPerShift,
      };
    });
    totals.shiftsN += shiftRows.length;
    totals.unconfirmedPastN += unconfirmedPastN;
    totals.dstUnreadableN += dstUnreadableN;

    const lineRows = reading.lines.map((line, index) => {
      const ranges = reading.lineRanges[index] || [];
      const complete = rangeCoveredLocal(ranges, horizon.from, horizon.to);
      const coveredMinutes = ranges.reduce((sum, range) => sum + Math.max(0, Math.min(range.to, horizon.to) - Math.max(range.from, horizon.from)), 0);
      const route = ['operator', 'tree', 'line'].includes(reachOf(person.id)) ? holdsLine(line.managerId) : null;
      return {
        managerId: line.managerId,
        managerName: nameOf(line.managerId),
        kind: line.kind,
        declared: line.declared,
        complete,
        missingDays: Math.round((horizon.to - horizon.from - coveredMinutes) / DAY),
        canAttest: canRoster && Boolean(route),
      };
    });

    const policy = reading.governing.policy;
    const verdict = readingVerdict(evaluation, reading.governing);
    const unproven = verdict === 'unproven' ? evaluation.unproven.map((key) => ({ key, says: WORK_NIGHT_UNPROVEN_BY_KEY[key]?.says || key })) : [];
    const verdictSays = WORK_NIGHT_VERDICT_BY_KEY[verdict];
    const missingBreaks = evaluation.missingBreaks.map((row) => ({
      shiftIds: row.shiftIds,
      fromLabel: formatInstant(row.from, shiftById.get(row.shiftIds[0])?.effStartOffsetMin ?? 0),
      toLabel: formatInstant(row.to, shiftById.get(row.shiftIds[0])?.effEndOffsetMin ?? 0),
      minutes: row.minutes, limit: row.limit, excess: row.excess,
    }));
    if (missingBreaks.length) totals.missingBreakRecordsN += missingBreaks.length;
    if (evaluation.nightShiftsN > 0) totals.nightPeopleN += 1;
    if (evaluation.fatigueIndex && (totals.fatigueIndexMax === null || evaluation.fatigueIndex.index > totals.fatigueIndexMax)) {
      totals.fatigueIndexMax = evaluation.fatigueIndex.index;
    }
    if (rowNightShareMax(evaluation) !== null && (totals.nightShareMaxPct === null || rowNightShareMax(evaluation) > totals.nightShareMaxPct)) {
      totals.nightShareMaxPct = rowNightShareMax(evaluation);
    }
    if (evaluation.streak > 0 && (totals.maxConsecutiveNights === null || evaluation.streak > totals.maxConsecutiveNights)) {
      totals.maxConsecutiveNights = evaluation.streak;
    }
    rows.push({
      personId: person.id,
      name: nameOf(person.id),
      reach: reachOf(person.id),
      verdict,
      verdictLabel: verdictSays.label,
      verdictTone: verdictSays.tone,
      verdictSays: verdictSays.says,
      unproven,
      policyState: reading.governing.state,
      policyId: policy?.id || null,
      policyLabel: policy?.label || null,
      policyBasis: reading.governing.basis,
      tested: evaluation.tested,
      thresholds: nightThresholdLines(policy),
      lines: lineRows,
      linesN: lineRows.length,
      coverageComplete: Boolean(matrix) && evaluation.coverageComplete,
      actualsComplete: unconfirmedPastN === 0,
      unconfirmedPastN,
      shifts: shiftRows,
      shiftsN: shiftRows.length,
      nightShiftsN: evaluation.nightShiftsN,
      nightShareMaxPct: evaluation.shiftReadings.reduce((max, row) => (row.sharePct === null ? max : Math.max(max, row.sharePct)), null),
      consecutiveNights: evaluation.streak,
      longestContinuousMinutes: evaluation.longestContinuousMinutes,
      dstUnreadableN,
      missingBreaks,
      missingBreakRecordsN: missingBreaks.length,
      fatigueIndex: evaluation.fatigueIndex,
      findings,
      findingsOmittedN: Math.max(0, evaluation.findings.length - findings.length),
      aheadN: findings.filter((finding) => finding.ahead).length,
      crossLineN: findings.filter((finding) => finding.crossLine).length,
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
      const span = { managerId: nodeId, name: nameOf(nodeId), depth: node.depth ?? 0, peopleN: 0, notReadN: 0, findingsN: 0, aheadN: 0, crossLineN: 0, ...Object.fromEntries(WORK_NIGHT_VERDICT_KEYS.map((key) => [key, 0])) };
      for (const personId of node.descendants) {
        const reading = readings.get(personId);
        if (!reading) { if (names.has(personId)) span.notReadN += 1; continue; }
        span.peopleN += 1;
        // A person with no shift on record has no evaluation: their verdict is
        // no-record, counted in the span like any other.
        span[reading.evaluation ? readingVerdict(reading.evaluation, reading.governing) : 'no-record'] += 1;
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

  /* 4. Reconciliation — two claims, reported apart. */
  const verdictSum = WORK_NIGHT_VERDICT_KEYS.reduce((sum, key) => sum + counts[key], 0);
  const balances = verdictSum === reached.length;
  const recount = rows.reduce((acc, row) => {
    acc.findings += row.findings.length;
    acc.ahead += row.findings.filter((finding) => finding.ahead).length;
    acc.shifts += row.shifts.length;
    return acc;
  }, { findings: 0, ahead: 0, shifts: 0 });
  const kindSum = WORK_NIGHT_FINDING_KEYS.reduce((sum, key) => sum + byKind[key], 0);
  const auditClean = recount.findings === totals.findingsN && recount.ahead === totals.aheadN && recount.shifts === totals.shiftsN
    && kindSum === totals.findingsN && rows.every((row) => row.findingsOmittedN === 0);

  const shownRows = rows.slice(0, L.peopleRowsShown);
  if (rows.length > shownRows.length) refusals.push(`${rows.length - shownRows.length} person row(s) are counted in every total and not listed: the panel lists ${L.peopleRowsShown} at most.`);
  if (rows.some((row) => row.findingsOmittedN)) refusals.push(`At least one person carries more than ${L.findingsPerPerson} night breaches; the first ${L.findingsPerPerson} are listed and the rest are not counted in the breach totals. The printed totals are therefore a floor.`);
  for (const warning of warnings) refusals.push(warning);
  if (counts['policy-conflict']) refusals.push(`${counts['policy-conflict']} person(s) are claimed by more than one live night policy. No limit is tested for them until one policy is retired.`);
  if (totals.dstUnreadableN) refusals.push(`${totals.dstUnreadableN} shift(s) straddle a clock change: their two stored offsets disagree, so their night minutes cannot be mapped to days exactly. Their night share is still printed; the streak reading refuses them with this reason rather than re-timing them.`);

  const livePolicies = record.policies.filter((row) => !row.retiredAt);
  return {
    engineVersion: WORK_NIGHT_ENGINE_VERSION,
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
    automationOn: conv[WORK_NIGHT_SETTING_KEYS.autoPropagate] !== false,
    policies: record.policies.map((policy) => ({
      policyId: policy.id,
      label: policy.label,
      scope: policy.scope,
      scopeLabel: policy.scope === 'workspace' ? 'Whole workspace' : `${policy.personIds.length} named ${policy.personIds.length === 1 ? 'person' : 'people'}`,
      peopleN: policy.personIds.length,
      source: policy.source,
      nightFromMin: policy.nightFromMin,
      nightToMin: policy.nightToMin,
      nightMaxSharePct: policy.nightMaxSharePct,
      nightMaxConsecutiveNights: policy.nightMaxConsecutiveNights,
      breakAfterMin: policy.breakAfterMin,
      breakMinMin: policy.breakMinMin,
      thresholds: nightThresholdLines(policy),
      declaredOn: policy.declaredOn,
      declaredByName: nameOf(policy.declaredById),
      live: !policy.retiredAt,
      retiredOn: policy.retiredAt ? policy.retiredAt.slice(0, 10) : null,
      retiredByName: policy.retiredById ? nameOf(policy.retiredById) : null,
      retireReason: policy.retireReason,
      canRetire: !policy.retiredAt && canPolicy && (operator || (policy.scope === 'people' ? true : rank >= 4)),
    })).sort((a, b) => Number(b.live) - Number(a.live) || a.label.localeCompare(b.label)),
    livePoliciesN: livePolicies.length,
    people: shownRows,
    allPeople: rows,
    spans,
    totals: {
      peopleN: reached.length,
      outsideN,
      listedN: rows.length,
      breachN: counts.breach,
      policyConflictN: counts['policy-conflict'],
      noPolicyN: counts['no-policy'],
      unprovenN: counts.unproven,
      clearN: counts.clear,
      noRecordN: counts['no-record'],
      findingsN: totals.findingsN,
      aheadN: totals.aheadN,
      crossLineN: totals.crossLineN,
      byKind,
      shiftsN: totals.shiftsN,
      nightShiftsN: totals.nightShiftsN,
      nightPeopleN: totals.nightPeopleN,
      nightShareMaxPct: totals.nightShareMaxPct,
      maxConsecutiveNights: totals.maxConsecutiveNights,
      missingBreakRecordsN: totals.missingBreakRecordsN,
      dstUnreadableN: totals.dstUnreadableN,
      unconfirmedPastN: totals.unconfirmedPastN,
      fatigueIndexMax: totals.fatigueIndexMax,
    },
    reconciliation: {
      balances,
      auditClean,
      says: `${balances ? 'The readings add up' : 'The readings do NOT add up'}: ${verdictSum} reading(s) for ${reached.length} person(s) in reach. ${auditClean ? 'The printed totals are the recounted rows.' : 'The printed totals could not be confirmed against the rows.'}`,
    },
    refusals,
    method: WORK_NIGHT_METHOD,
    frameworks: WORK_NIGHT_FRAMEWORKS,
  };
}

/** The largest night share (whole percentage points) over one person's shifts, or null. */
function rowNightShareMax(evaluation) {
  return evaluation.shiftReadings.reduce((max, row) => (row.sharePct === null ? max : Math.max(max, row.sharePct)), null);
}

/** The verdict of one person's night reading, decided in one place. */
function readingVerdict(evaluation, governing) {
  if (evaluation.findings.length) return 'breach';
  if (!evaluation.spellsInHorizon) return 'no-record';
  if (governing.state === 'conflict') return 'policy-conflict';
  if (governing.state === 'none') return 'no-policy';
  if (evaluation.unproven.length) return 'unproven';
  return 'clear';
}

/* -------------------------------------------------------------------- brief */

export function workNightBriefText(report) {
  const t = report.totals;
  const lines = [
    `Night-work & in-shift break reading — ${report.today} (${report.scope === 'workspace' ? 'whole workspace' : `seat of ${report.actorName}`})`,
    `Horizon ${report.horizon.fromDay} → ${report.horizon.toDay} (${report.horizon.days} UTC days). ${t.peopleN} person(s) in reach${t.outsideN ? `, ${t.outsideN} outside it and not read` : ''}.`,
    `${t.breachN} with a provable night breach · ${t.unprovenN} unproven · ${t.clearN} clear on the record · ${t.noPolicyN} with no night policy · ${t.policyConflictN} claimed by two policies · ${t.noRecordN} with no shift on record.`,
    `${t.findingsN} breach(es): ${WORK_NIGHT_FINDING_KEYS.map((key) => `${t.byKind[key]} ${WORK_NIGHT_FINDING_BY_KEY[key].label.toLowerCase()}`).join(', ')}. ${t.aheadN} still ahead; ${t.crossLineN} made by two lines.`,
    `${t.shiftsN} shift(s) read (${t.nightShiftsN} with night minutes, ${t.nightPeopleN} person(s) with night work); ${t.missingBreakRecordsN} break record(s) missing where a declared limit requires one; ${t.dstUnreadableN} shift(s) refused for the streak reading.`,
    t.fatigueIndexMax === null ? 'No schedule fatigue index: no factor a policy declares is in the record.' : `Highest schedule fatigue index in reach: ${t.fatigueIndexMax} (a declared convention over the printed factors, not a rating of anyone).`,
    report.reconciliation.says,
  ];
  for (const row of report.people.filter((person) => person.verdict === 'breach').slice(0, 12)) {
    for (const finding of row.findings.slice(0, 3)) {
      lines.push(`- ${row.name}: ${finding.sentence} ${finding.ahead ? finding.fix : 'Already past.'}`);
    }
  }
  for (const refusal of report.refusals) lines.push(`! ${refusal}`);
  lines.push('This compares the clock with declared numbers. It measures nobody’s fatigue and rates nobody.');
  return lines.join('\n');
}

/* ---------------------------------------------------------------------- CSV */

const blank = (value) => (value === null || value === undefined ? '' : value);
const flag = (value) => (value ? 'yes' : 'no');

/** CSV scope #168. Identity-free: positional codes, counts and whole minutes only. */
export function workNightCsvRows(report) {
  const t = report.totals;
  const base = { generated_on: report.today, horizon_from: report.horizon.fromDay, horizon_to: report.horizon.toDay, engine_version: report.engineVersion };
  const policyCode = new Map(report.policies.map((policy, index) => [policy.policyId, `P${String(index + 1).padStart(2, '0')}`]));
  const out = [{
    ...base,
    row_type: 'workspace', key: report.scope,
    people_n: t.peopleN, breach_n: t.breachN, policy_conflict_n: t.policyConflictN, no_policy_n: t.noPolicyN, unproven_n: t.unprovenN, clear_n: t.clearN, no_record_n: t.noRecordN,
    night_shifts_n: t.nightShiftsN, night_people_n: t.nightPeopleN,
    max_night_share_pct: blank(t.nightShareMaxPct ?? null), max_consecutive_nights_n: blank(t.maxConsecutiveNights ?? null),
    missing_break_records_n: t.missingBreakRecordsN, fatigue_index_max: blank(t.fatigueIndexMax),
    balances: flag(report.reconciliation.balances), audit_clean: flag(report.reconciliation.auditClean),
    claim_reason: report.refusals.length ? `${report.refusals.length} refusal(s) printed on the panel` : '',
  }];
  for (const policy of report.policies) {
    out.push({
      ...base,
      row_type: 'policy', key: policyCode.get(policy.policyId),
      night_from_min: policy.nightFromMin, night_to_min: policy.nightToMin,
      night_max_share_pct: blank(policy.nightMaxSharePct), night_max_consecutive_nights: blank(policy.nightMaxConsecutiveNights),
      break_after_min: blank(policy.breakAfterMin), break_min_min: blank(policy.breakMinMin),
      policy_scope: policy.scope, policy_people_n: policy.scope === 'people' ? policy.peopleN : '',
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
      shifts_n: row.shiftsN, night_shifts_n_person: row.nightShiftsN,
      night_share_pct: blank(row.nightShareMaxPct), consecutive_nights_n: row.consecutiveNights,
      longest_continuous_min: blank(row.longestContinuousMinutes),
      missing_break_records_n_person: row.missingBreakRecordsN,
      fatigue_index: blank(row.fatigueIndex?.index ?? null),
      fatigue_factors: row.fatigueIndex ? row.fatigueIndex.factors.map((factor) => `${factor.key}:${factor.measure}/${factor.limit}`).join(';') : '',
      claim_reason: row.verdict === 'unproven' ? row.unproven.map((reason) => reason.key).join('; ')
        : row.verdict === 'no-policy' ? 'no live night policy applies; no night window was assumed'
          : row.verdict === 'policy-conflict' ? 'more than one live night policy applies'
            : '',
    });
  });
  return out;
}

/* ------------------------------------------------------------------ counter */

/**
 * How many people in this seat's reach carry a provable night breach that is
 * still ahead. Sits in the navigation of every route, so it reads shifts,
 * breaks and policies only — never the reporting graph and never coverage,
 * which a breach does not depend on.
 */
export function workNightAttentionCount(state = {}, { now = new Date(), seat = null } = {}) {
  if (!Array.isArray(state?.workRestShifts) || !state.workRestShifts.length) return 0;
  try {
    const conv = normalizeWorkNightSettings(state.settings || {});
    const horizon = workNightHorizon(now, conv);
    const record = readWorkNightRecord(state, []);
    const { reachOf } = workNightSeatProjection(seat);
    const active = new Set(peopleOf(state).map((person) => person.id));
    const breaksByShift = new Map();
    for (const breakRow of record.breaks) {
      if (!breaksByShift.has(breakRow.shiftId)) breaksByShift.set(breakRow.shiftId, []);
      breaksByShift.get(breakRow.shiftId).push(breakRow);
    }
    let owed = 0;
    for (const [personId, shifts] of groupShifts(record.shifts)) {
      if (!active.has(personId) || !reachOf(personId)) continue;
      const governing = governingWorkNightPolicy(record.policies, personId);
      const working = shifts.filter((shift) => !shift.cancelled);
      const evaluation = evaluateWorkNight({
        intervals: working.map((shift) => ({
          id: shift.id, s: shift.s, e: shift.e, line: shift.lineManagerId,
          effStart: shift.effStart, effEnd: shift.effEnd,
          effStartOffsetMin: shift.effStartOffsetMin, effEndOffsetMin: shift.effEndOffsetMin,
          breaks: (breaksByShift.get(shift.id) || []).map((row) => ({ from: row.s, to: row.e })),
        })),
        policy: governing.state === 'declared' ? thresholdsOf(governing.policy) : null,
        coverage: [],
        horizon: { from: horizon.from, to: horizon.to },
      });
      if (evaluation.findings.some((finding) => finding.at > horizon.nowMin)) owed += 1;
    }
    return owed;
  } catch {
    return 0;
  }
}

/* ------------------------------------------------------------------ preview */

/**
 * What ONE candidate break would change on a person's record: the continuous
 * stretches it removes and the missing-break refusals it clears. Read over all
 * time, not the horizon. `shiftId` is the shift the break would be recorded on.
 */
export function previewWorkNightBreak(state = {}, { now = new Date(), personId, shiftId, candidate, names = null } = {}) {
  const record = readWorkNightRecord(state, []);
  const shift = record.shifts.find((row) => row.id === shiftId && row.personId === personId);
  if (!shift) return { ok: false, error: 'That shift is not on the record for this person.' };
  const governing = governingWorkNightPolicy(record.policies, personId);
  const others = record.shifts.filter((row) => row.personId === personId && !row.cancelled && row.id !== shiftId);
  const everywhere = { from: Number.MIN_SAFE_INTEGER, to: Number.MAX_SAFE_INTEGER };
  const policy = governing.state === 'declared' ? thresholdsOf(governing.policy) : null;
  const breaksOf = (id) => (id === shiftId ? [{ from: candidate.s, to: candidate.e }] : (record.breaks.filter((row) => row.shiftId === id).map((row) => ({ from: row.s, to: row.e }))));
  const toIntervals = (shifts) => shifts.map((row) => ({ id: row.id, s: row.s, e: row.e, line: row.lineManagerId, breaks: breaksOf(row.id) }));
  const before = evaluateWorkNight({ intervals: toIntervals(others), policy, coverage: [], horizon: everywhere });
  const withBreak = evaluateWorkNight({ intervals: toIntervals([...others, shift]), policy, coverage: [], horizon: everywhere });
  const missingBefore = before.missingBreaks.map((row) => `${row.shiftIds.join(',')}|${row.from}|${row.to}`);
  const missingAfter = withBreak.missingBreaks.map((row) => `${row.shiftIds.join(',')}|${row.from}|${row.to}`);
  const cleared = missingBefore.filter((key) => !missingAfter.includes(key));
  const people = names || new Map(peopleOf(state).map((p) => [p.id, p.name || p.id]));
  return {
    ok: true,
    policyState: governing.state,
    policyLabel: governing.policy?.label || null,
    breaksBeforeN: before.missingBreaks.length,
    breaksAfterN: withBreak.missingBreaks.length,
    cleared,
    shiftMinutes: shift.minutes,
    candidateMinutes: candidate.e - candidate.s,
    personName: people.get(personId) || personId,
  };
}
