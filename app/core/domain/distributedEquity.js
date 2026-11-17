/**
 * app/core/domain/distributedEquity.js — the pure reader of the Distributed-Work
 * Equity Register (ADR-0238, Schema v193, `#/distributed-equity`).
 *
 * ONE READER. Every burden figure, share, verdict, refusal, coverage gap and
 * attention number the screen prints is computed here from the stored windows,
 * the stored sittings and the live matrix. Nothing derived is stored; a
 * hand-edited file cannot carry an equity verdict its own rows do not imply.
 *
 * WHAT IS KEPT APART, ALWAYS:
 *
 *   1. MINUTES HELD AND MINUTES PLACED. A person's total sitting minutes are a
 *      fact of attendance. Whether they fell outside the person's declared
 *      working window is a second fact that needs the window, the zones and
 *      the calendar to agree. The reader prints the first whenever the record
 *      supports it and refuses the second, with its reason, whenever it does
 *      not — a refusal is never rendered as a zero.
 *   2. THE VERDICT AND THE COVERAGE. "This scope's burden is concentrated" is
 *      a claim about the people who were measured. Whether every attendee
 *      carried a readable window is a separate claim, printed separately. A
 *      concentrated verdict beside an incomplete coverage note is the honest
 *      output; one collapsed into the other is not.
 *   3. ONE PERSON, ONCE. A person with several reporting lines is measured
 *      once, at the person. Their burden is never divided between their lines,
 *      because no human agreed a division.
 *   4. ATTRIBUTION WITHOUT INVENTION. A sitting's burden is attributed to the
 *      chair's line only when the chair holds exactly one of that attendee's
 *      active declared lines. A chair holding two of the attendee's lines, or
 *      none, falls to the named "no declared line" bucket — counted, never
 *      split, never silently assigned to whichever line came first.
 *   5. THE DISCLOSURE LADDER. Below the executive altitude the reader returns
 *      per-person rows with names. At VP/CEO altitude (rank 4+) without full
 *      access it returns the same aggregates with names withheld — counts at
 *      the top, not a second register that pretends the names are not there.
 *
 * DISCLOSURE OF METHOD. Every placement is integer arithmetic over instants
 * resolved by `workRestTime.js`: the sitting start in the sitting's zone, the
 * window boundaries in the attendee's zone on the attendee's local day. No
 * rounded offset, no device default, no pooled conversion.
 */

import { addDays, dayKey } from '../time.js';
import { buildMatrix } from './matrix.js';
import {
  DWE_ADR,
  DWE_DEFAULTS,
  DWE_ENGINE_VERSION,
  DWE_HREF,
  DWE_LIMITS as L,
  DWE_METHOD,
  DWE_ROUTE,
  DWE_SITTING_REFUSALS,
  DWE_WINDOW_REFUSALS,
} from './distributedEquityRegistry.js';
import {
  normalizeDweMarkers,
  normalizeDweSettings as normalizeSettingsFromState,
  normalizeDweSittings,
  normalizeDweWindows,
} from './distributedEquitySchema.js';
import { resolveSittingStart, sittingOutsideMinutes } from './distributedEquityTime.js';

const isInt = (v) => typeof v === 'number' && Number.isInteger(v);

export function distributedEquityMatrix(state, now, settings) {
  return buildMatrix(state, { now, settings: { ...(settings || {}), activeSeatId: null } });
}

const nameOf = (matrix, id) => {
  if (!id) return null;
  const node = matrix?.nodes?.get(id);
  return (node && node.name) || id;
};

/** The active people on the roster, keyed by id. */
function activePeople(state) {
  const map = new Map();
  for (const row of Array.isArray(state?.people) ? state.people : []) {
    if (row && typeof row.id === 'string' && row.status !== 'archived') map.set(row.id, row);
  }
  return map;
}

/**
 * The active declared lines per person, from the live matrix, as LINE RECORDS
 * (not distinct manager ids): the attribution rule needs to know when one
 * manager holds TWO declared lines of the same attendee — a genuine ambiguity
 * the meeting-load ledger also refuses to split. A workspace that declares no
 * matrix lines behaves exactly like a single chain: one line per person, read
 * from the same engine.
 */
function linesByPerson(matrix) {
  const map = new Map();
  if (!matrix?.linesByPerson) return map;
  for (const [personId, lines] of matrix.linesByPerson.entries()) {
    const active = (Array.isArray(lines) ? lines : [])
      .filter((line) => line && line.active !== false && typeof line.managerId === 'string' && line.managerId);
    map.set(personId, active);
  }
  return map;
}

/** Which refusal a person's active window state produces, if any. */
function windowStateFor(activeWindows, zoneKnowability) {
  if (!activeWindows.length) return { readable: false, code: 'none', reason: DWE_WINDOW_REFUSALS.none, window: null };
  if (activeWindows.length > 1) return { readable: false, code: 'ambiguous', reason: DWE_WINDOW_REFUSALS.ambiguous, window: null };
  const window = activeWindows[0];
  if (!zoneKnowability.has(window.zone)) return { readable: false, code: 'badZone', reason: DWE_WINDOW_REFUSALS.badZone, window };
  return { readable: true, code: null, reason: null, window };
}

/** Whether a sitting can be placed at all, before any window is consulted. */
function sittingPlacement(sitting, roster, windowZoneKnowability) {
  for (const attendeeId of sitting.attendeeIds) {
    if (!roster.has(attendeeId)) {
      return { ok: false, code: 'unknownAttendee', reason: `${DWE_SITTING_REFUSALS.unknownAttendee} (attendee ${attendeeId} is not on this roster)` };
    }
  }
  const resolved = resolveSittingStart(sitting.zone, sitting.day, sitting.start, sitting.fold);
  if (!resolved.ok) {
    return { ok: false, code: resolved.code, reason: `${DWE_SITTING_REFUSALS[resolved.code] || resolved.reason}` };
  }
  void windowZoneKnowability;
  return { ok: true, utcStart: resolved.utcMin, ambiguousStart: resolved.ambiguous };
}

/**
 * The whole register, read. Pure over (state, now, settings, seat): no DOM,
 * no storage, no mutation. `seat` only narrows disclosure; with no seat the
 * register is read whole (this is what the CSV and the rule use).
 */
export function buildDistributedEquity(state, { now = new Date(), settings = null, seat = null } = {}) {
  const warnings = [];
  const at = now instanceof Date ? now : new Date(now);
  const asOf = dayKey(at) || L.dayMin;
  const conventions = normalizeSettingsFromState({ ...(state?.settings || {}), ...(settings || {}) });
  const cfg = { ...(state?.settings || {}), ...(settings || {}) };

  const windows = normalizeDweWindows(state?.dweWindows, warnings);
  const sittings = normalizeDweSittings(state?.dweSittings, warnings);
  const markers = normalizeDweMarkers(state?.dweMarkers, warnings);
  const roster = activePeople(state);

  let matrix = null;
  let matrixError = null;
  try {
    matrix = distributedEquityMatrix(state, at, cfg);
  } catch (error) {
    matrixError = `The reporting graph could not be read, so convening lines cannot be attributed: ${error?.message || 'unknown error'}.`;
  }
  const lineMap = linesByPerson(matrix);

  /* -------------------------------------------------------------- windows */
  const activeByPerson = new Map();
  for (const window of windows) {
    if (window.status !== 'active') continue;
    const list = activeByPerson.get(window.personId) || [];
    list.push(window);
    activeByPerson.set(window.personId, list);
  }

  // A zone is knowable when at least one stored window resolves in it. The
  // reader never consults the device's own zone for a person.
  const zoneKnowability = new Set(windows.map((row) => row.zone));

  const windowRows = [];
  const windowStateByPerson = new Map();
  for (const personId of [...roster.keys()].sort((a, b) => String(roster.get(a).name || a).localeCompare(String(roster.get(b).name || b)))) {
    const active = activeByPerson.get(personId) || [];
    const state0 = windowStateFor(active, zoneKnowability);
    windowStateByPerson.set(personId, state0);
    const person = roster.get(personId);
    windowRows.push({
      personId,
      personName: person?.name || personId,
      window: state0.window
        ? { id: state0.window.id, zone: state0.window.zone, start: state0.window.start, end: state0.window.end, declaredOn: state0.window.declaredOn, source: state0.window.source, note: state0.window.note }
        : null,
      readable: state0.readable,
      refusalCode: state0.code,
      refusalReason: state0.reason,
      supersededN: windows.filter((row) => row.personId === personId && row.status === 'superseded').length,
    });
  }
  const windowAmbiguityN = [...windowStateByPerson.values()].filter((row) => row.code === 'ambiguous').length;

  /* ------------------------------------------------------------- sittings */
  const validSittings = [];
  const refusedSittings = [];
  for (const sitting of sittings) {
    if (sitting.status !== 'active') continue;
    const placement = sittingPlacement(sitting, roster, zoneKnowability);
    if (!placement.ok) {
      refusedSittings.push({
        id: sitting.id,
        day: sitting.day,
        zone: sitting.zone,
        attendeesN: sitting.attendeeIds.length,
        code: placement.code,
        reason: placement.reason,
      });
      continue;
    }
    validSittings.push({ ...sitting, utcStart: placement.utcStart, ambiguousStart: placement.ambiguousStart });
  }

  /* ------------------------------------------------------- person readings */
  const detailed = !seat || seat.fullAccess || (isInt(seat.rank) ? seat.rank <= 3 : true);
  const trailingFrom = addDays(asOf, -(conventions.dweWindowDays - 1));

  // Each valid sitting's attendee list, in one pass, so every attendance is
  // counted exactly once.
  const attendance = new Map(); // personId -> [{ sitting, utcStart }]
  for (const sitting of validSittings) {
    for (const attendeeId of sitting.attendeeIds) {
      const list = attendance.get(attendeeId) || [];
      list.push({ sitting, utcStart: sitting.utcStart });
      attendance.set(attendeeId, list);
    }
  }

  // Only people who actually ATTENDED a valid sitting are a measured
  // population. A roster member with no attendance is covered by the window
  // ledger, not by a zero-filled burden row — a row of zeros for people who
  // never sat would invent a population nobody measured.
  const personIds = [...attendance.keys()];
  const peopleRows = [];
  let unreadablePersonN = 0;
  let boundaryFoldNotesN = 0;

  for (const personId of personIds.sort()) {
    const attendances = attendance.get(personId) || [];
    if (!roster.has(personId)) continue; // an off-roster attendee refused the whole sitting already
    const person = roster.get(personId);
    const win = windowStateByPerson.get(personId) || windowStateFor([], zoneKnowability);
    const minutesTotal = attendances.reduce((sum, row) => sum + row.sitting.minutes, 0);
    const trailingSittings = attendances.filter((row) => row.sitting.day >= trailingFrom);
    const trailingMinutesTotal = trailingSittings.reduce((sum, row) => sum + row.sitting.minutes, 0);

    let outsideMinutes = null;
    let trailingOutsideMinutes = null;
    let unreadableSittingsN = 0;
    let unreadableReason = win.readable ? null : win.reason;
    let lastUnreadableCode = win.readable ? null : win.code;

    if (win.readable) {
      let totalOutside = 0;
      let trailingOutside = 0;
      let placed = 0;
      for (const { sitting, utcStart } of attendances) {
        const placed1 = sittingOutsideMinutes(win.window, sitting, utcStart);
        if (!placed1.ok) {
          unreadableSittingsN += 1;
          lastUnreadableCode = placed1.code;
          unreadableReason = placed1.reason;
          continue;
        }
        boundaryFoldNotesN += placed1.foldedN;
        totalOutside += placed1.outside;
        placed += 1;
        if (sitting.day >= trailingFrom) trailingOutside += placed1.outside;
      }
      if (placed === attendances.length) {
        outsideMinutes = totalOutside;
        trailingOutsideMinutes = trailingOutside;
      } else {
        unreadableReason = `${unreadableSittingsN} of ${attendances.length} sitting(s) could not be placed in this window: ${unreadableReason || DWE_WINDOW_REFUSALS.badBounds}`;
      }
    }

    if (outsideMinutes === null) unreadablePersonN += 1;
    peopleRows.push({
      personId,
      personName: detailed ? (person?.name || personId) : null,
      minutesTotal,
      sittingsN: attendances.length,
      trailingMinutesTotal,
      trailingSittingsN: trailingSittings.length,
      outsideMinutes,
      trailingOutsideMinutes,
      overCeiling: outsideMinutes !== null && trailingOutsideMinutes !== null
        ? trailingOutsideMinutes > conventions.dweOutsideMinutesCeiling
        : false,
      windowReadable: win.readable,
      windowRefusalCode: win.code,
      unreadableSittingsN,
      unreadableReason: outsideMinutes === null ? (unreadableReason || DWE_WINDOW_REFUSALS.none) : null,
      window: win.window
        ? { zone: win.window.zone, start: win.window.start, end: win.window.end, declaredOn: win.window.declaredOn, source: win.window.source }
        : null,
    });
  }

  const readablePeople = peopleRows.filter((row) => row.outsideMinutes !== null);
  const workspaceOutside = readablePeople.reduce((sum, row) => sum + row.outsideMinutes, 0);

  /* ------------------------------------------------------- line attribution */
  // A sitting's burden is attributed to the chair's line ONLY when the chair
  // holds exactly one of that attendee's active declared lines. Everything
  // else falls to the named bucket, counted and never split.
  const lineStats = new Map(); // managerId -> { convenedMinutes, convenedOutside, sittings:Set, people:Set, ambiguityN }
  const noDeclaredLine = { convenedMinutes: 0, convenedOutside: 0, sittings: new Set(), people: new Set(), selfConvenedMinutes: 0, selfConvenedOutside: 0, unknownChairMinutes: 0, unknownChairOutside: 0, ambiguousChairMinutes: 0, ambiguousChairOutside: 0, offGraphChairMinutes: 0, offGraphChairOutside: 0 };

  for (const sitting of validSittings) {
    for (const attendeeId of sitting.attendeeIds) {
      const win = windowStateByPerson.get(attendeeId);
      if (!win || !win.readable) {
        // The attendee's burden cannot be placed; the sitting still convened,
        // but nothing is attributed that the record cannot support.
        continue;
      }
      const placed = sittingOutsideMinutes(win.window, sitting, sitting.utcStart);
      if (!placed.ok) continue;
      const chairId = sitting.chairId;
      const isSelf = !chairId || chairId === attendeeId;
      const chairOnRoster = !isSelf && roster.has(chairId);
      const attendeeLines = lineMap.get(attendeeId) || [];
      // One manager may hold TWO declared lines of one attendee (two project
      // lines, two shares). Attributing that sitting to "the" line would pick
      // one of them by array accident, so it falls to the named bucket —
      // the meeting-load ledger's rule, applied to burden.
      const heldLines = chairOnRoster ? attendeeLines.filter((line) => line.managerId === chairId) : [];

      let bucket = null;
      if (isSelf) bucket = { key: 'self', minutes: sitting.minutes, outside: placed.outside };
      else if (!chairOnRoster) bucket = { key: 'unknownChair', minutes: sitting.minutes, outside: placed.outside };
      else if (!heldLines.length) bucket = { key: 'offGraphChair', minutes: sitting.minutes, outside: placed.outside };
      else if (heldLines.length > 1) bucket = { key: 'ambiguousChair', minutes: sitting.minutes, outside: placed.outside };
      if (bucket) {
        noDeclaredLine[bucket.key === 'self' ? 'selfConvenedMinutes' : `${bucket.key}Minutes`] += bucket.minutes;
        noDeclaredLine[bucket.key === 'self' ? 'selfConvenedOutside' : `${bucket.key}Outside`] += bucket.outside;
        noDeclaredLine.sittings.add(sitting.id);
        noDeclaredLine.people.add(attendeeId);
        noDeclaredLine.convenedMinutes += bucket.minutes;
        noDeclaredLine.convenedOutside += bucket.outside;
        continue;
      }
      const managerId = heldLines[0].managerId;
      const stats = lineStats.get(managerId) || { convenedMinutes: 0, convenedOutside: 0, sittings: new Set(), people: new Set() };
      stats.convenedMinutes += sitting.minutes;
      stats.convenedOutside += placed.outside;
      stats.sittings.add(sitting.id);
      stats.people.add(attendeeId);
      lineStats.set(managerId, stats);
    }
  }

  const lineRows = [...lineStats.entries()]
    .map(([managerId, stats]) => ({
      lineId: managerId,
      managerName: nameOf(matrix, managerId) || managerId,
      convenedMinutes: stats.convenedMinutes,
      convenedOutsideMinutes: stats.convenedOutside,
      sittingsN: stats.sittings.size,
      peopleN: stats.people.size,
    }))
    .sort((a, b) => b.convenedOutsideMinutes - a.convenedOutsideMinutes || String(a.managerName).localeCompare(String(b.managerName)));

  /* ----------------------------------------------------------- equity reads */
  const equityFloorReason = (n, sittingsN, total) => {
    const reasons = [];
    if (n < conventions.dweEquityMinPeople) reasons.push(`${n} readable member(s) is below the ${conventions.dweEquityMinPeople}-person floor`);
    if (sittingsN < conventions.dweEquityMinSittings) reasons.push(`${sittingsN} valid sitting(s) is below the ${conventions.dweEquityMinSittings}-sitting floor`);
    if (total < conventions.dweEquityMinOutsideMinutes) reasons.push(`${total} outside minute(s) is below the ${conventions.dweEquityMinOutsideMinutes}-minute floor`);
    return reasons;
  };

  function equityRead(scopePeopleIds, scopeSittingIds) {
    const members = readablePeople.filter((row) => scopePeopleIds.has(row.personId) && row.sittingsN > 0);
    const sittingsN = validSittings.filter((row) => scopeSittingIds.has(row.id)).length;
    const total = members.reduce((sum, row) => sum + row.outsideMinutes, 0);
    const n = members.length;
    const floors = equityFloorReason(n, sittingsN, total);
    if (floors.length || !n) {
      return { measured: false, reason: floors.join('; ') || 'no readable member in this scope', peopleN: n, sittingsN, outsideMinutes: total, evenShareBp: null, topShareBp: null, topPersonId: null, verdict: null };
    }
    const top = members.reduce((best, row) => (row.outsideMinutes > best.outsideMinutes ? row : best), members[0]);
    const evenShareBp = Math.round(10_000 / n);
    const topShareBp = Math.round((10_000 * top.outsideMinutes) / total);
    return {
      measured: true,
      reason: null,
      peopleN: n,
      sittingsN,
      outsideMinutes: total,
      evenShareBp,
      topShareBp,
      topPersonId: detailed ? top.personId : null,
      topPersonName: detailed ? (roster.get(top.personId)?.name || top.personId) : null,
      verdict: evenShareBp > 0 && topShareBp >= 2 * evenShareBp ? 'concentrated' : 'distributed',
    };
  }

  const workspaceScopePeople = new Set(readablePeople.filter((row) => row.sittingsN > 0).map((row) => row.personId));
  const workspaceScopeSittings = new Set(validSittings.map((row) => row.id));
  const workspaceEquity = equityRead(workspaceScopePeople, workspaceScopeSittings);

  const lineEquity = lineRows.map((row) => {
    const scopeSittings = new Set();
    const scopePeople = new Set();
    for (const sitting of validSittings) {
      if (!sitting.attendeeIds.some((attendeeId) => (lineMap.get(attendeeId) || []).some((line) => line.managerId === row.lineId))) continue;
      scopeSittings.add(sitting.id);
      for (const attendeeId of sitting.attendeeIds) scopePeople.add(attendeeId);
    }
    return { ...row, equity: equityRead(scopePeople, scopeSittings) };
  });

  /* ------------------------------------------------------------ over-ceiling */
  const overCeiling = readablePeople
    .filter((row) => row.overCeiling)
    .map((row) => {
      const chairManagerIds = new Set();
      for (const { sitting } of (attendance.get(row.personId) || [])) {
        if (sitting.day < trailingFrom) continue;
        const chairId = sitting.chairId;
        if (chairId && chairId !== row.personId && roster.has(chairId) && (lineMap.get(row.personId) || []).some((line) => line.managerId === chairId)) {
          chairManagerIds.add(chairId);
        }
      }
      const ownManagers = [...new Set((lineMap.get(row.personId) || []).map((line) => line.managerId))];
      return {
        personId: row.personId,
        personName: detailed ? (roster.get(row.personId)?.name || row.personId) : null,
        trailingOutsideMinutes: row.trailingOutsideMinutes,
        trailingMinutesTotal: row.trailingMinutesTotal,
        ceiling: conventions.dweOutsideMinutesCeiling,
        windowDays: conventions.dweWindowDays,
        sittingsN: row.trailingSittingsN,
        ownManagerIds: ownManagers,
        chairManagerIds: [...chairManagerIds].sort(),
      };
    });

  /* ----------------------------------------------------------- reconciliation */
  const validSittingAttendanceMinutes = validSittings.reduce((sum, row) => sum + row.minutes * row.attendeeIds.length, 0);
  const personAttendanceMinutes = peopleRows.reduce((sum, row) => sum + row.minutesTotal, 0);
  const countsReconcile = validSittingAttendanceMinutes === personAttendanceMinutes;
  const coverageReasons = [];
  if (refusedSittings.length) coverageReasons.push(`${refusedSittings.length} sitting(s) refused whole (each refusal is printed with its reason)`);
  if (unreadablePersonN) coverageReasons.push(`${unreadablePersonN} attendee(s) have unreadable burden cells`);
  if (windowAmbiguityN) coverageReasons.push(`${windowAmbiguityN} person(s) carry more than one active working window`);
  const figuresComplete = coverageReasons.length === 0;

  const totals = {
    windowsDeclared: activeByPerson.size,
    windowsSuperseded: windows.filter((row) => row.status === 'superseded').length,
    windowsWithdrawn: windows.filter((row) => row.status === 'withdrawn').length,
    sittingsValid: validSittings.length,
    sittingsRefused: refusedSittings.length,
    sittingsRetracted: sittings.filter((row) => row.status === 'retracted').length,
    attendanceMinutes: personAttendanceMinutes,
    outsideMinutes: workspaceOutside,
    readablePeopleN: readablePeople.length,
    unreadablePeopleN: unreadablePersonN,
    boundaryFoldNotesN,
    windowAmbiguityN,
    overCeilingN: overCeiling.length,
    concentratedN: [lineEquity.filter((row) => row.equity.verdict === 'concentrated').length, workspaceEquity.verdict === 'concentrated' ? 1 : 0].reduce((a, b) => a + b, 0),
  };

  const attention = totals.overCeilingN + (workspaceEquity.verdict === 'concentrated' ? 1 : 0);
  const attentionReason = attention
    ? [
        totals.overCeilingN ? `${totals.overCeilingN} person(s) over the declared unsociable-hour ceiling` : null,
        workspaceEquity.verdict === 'concentrated' ? 'the workspace burden is concentrated' : null,
      ].filter(Boolean).join('; ')
    : 'nothing over the declared ceiling or concentrated';

  return {
    ok: true,
    engine: DWE_ENGINE_VERSION,
    adr: DWE_ADR,
    route: DWE_ROUTE,
    href: DWE_HREF,
    method: DWE_METHOD,
    asOf,
    conventions,
    warnings,
    matrixError,
    windowRows,
    refusedSittings,
    validSittings: validSittings.map((row) => ({
      id: row.id,
      day: row.day,
      start: row.start,
      minutes: row.minutes,
      zone: row.zone,
      attendeesN: row.attendeeIds.length,
      chairName: detailed && row.chairId ? (nameOf(matrix, row.chairId) || row.chairId) : (row.chairId ? (detailed ? row.chairId : null) : null),
      note: row.note,
      ambiguousStart: row.ambiguousStart,
    })),
    people: peopleRows,
    lines: lineEquity,
    noDeclaredLine: {
      ...noDeclaredLine,
      sittingsN: noDeclaredLine.sittings.size,
      peopleN: noDeclaredLine.people.size,
      sittings: undefined,
      people: undefined,
    },
    workspaceEquity,
    overCeiling,
    markers,
    totals,
    countsReconcile,
    figuresComplete,
    coverageReasons,
    disclosure: {
      detailed,
      reason: detailed
        ? 'This seat reads per-person rows: names at the line altitude, counts at the top.'
        : 'Above the director altitude this register prints counts and lines, not people: the ladder runs from names at the frontline to counts at the top.',
    },
    attention,
    attentionReason,
    seat: seat
      ? { rank: seat.rank ?? null, fullAccess: Boolean(seat.fullAccess), label: seat.label || '' }
      : { rank: null, fullAccess: true, label: 'whole register (no seat)' },
  };
}

/**
 * The badge figure: over-ceiling people and a concentrated workspace verdict.
 * Pure, seat-free, and the same conditions RULE-DWE-01 reads.
 */
export function distributedEquityAttentionCount(state, { now = new Date(), settings = null, seat = null } = {}) {
  try {
    const report = buildDistributedEquity(state, { now, settings, seat });
    if (!report?.ok) return 0;
    return report.attention;
  } catch {
    return 0;
  }
}

/* ------------------------------------------------------------------ CSV #179 */

const blankIf = (value) => (value === null || value === undefined ? '' : value);

/**
 * CSV #179 (ADR-0238, Schema v193). Built from the SAME reader the panel
 * renders, with no seat — so the export is the whole register, aggregate and
 * identity-free: one summary row and one row per convening line as `L01…`
 * codes in a stable order. A figure the reader refused exports BLANK with its
 * reason, never a zero.
 */
export function distributedEquityCsvRows(report) {
  if (!report?.ok) return [];
  const rows = [];
  const blankReason = report.coverageReasons.join('; ').slice(0, 300);
  rows.push({
    as_of: report.asOf,
    row_kind: 'summary',
    key: 'workspace',
    people_n: report.totals.readablePeopleN,
    sittings_n: report.totals.sittingsValid,
    minutes_total: report.totals.attendanceMinutes,
    outside_minutes: blankIf(report.totals.outsideMinutes),
    convened_outside_minutes: '',
    even_share_bp: blankIf(report.workspaceEquity.evenShareBp),
    top_share_bp: blankIf(report.workspaceEquity.topShareBp),
    verdict: report.workspaceEquity.verdict || '',
    ceiling: report.conventions.dweOutsideMinutesCeiling,
    over_ceiling_n: report.totals.overCeilingN,
    unreadable_n: report.totals.unreadablePeopleN,
    refused_sittings_n: report.totals.sittingsRefused,
    complete: report.figuresComplete ? 'yes' : 'no',
    blank_reason: report.workspaceEquity.measured ? blankReason : `${report.workspaceEquity.reason}${blankReason ? `; ${blankReason}` : ''}`,
  });
  const ordered = [...report.lines].sort((a, b) => String(a.lineId).localeCompare(String(b.lineId)));
  ordered.forEach((row, index) => {
    const code = `L${String(index + 1).padStart(2, '0')}`;
    const eq = row.equity;
    rows.push({
      as_of: report.asOf,
      row_kind: 'line',
      key: code,
      people_n: eq.peopleN,
      sittings_n: eq.sittingsN,
      minutes_total: row.convenedMinutes,
      outside_minutes: blankIf(row.convenedOutsideMinutes),
      convened_outside_minutes: blankIf(row.convenedOutsideMinutes),
      even_share_bp: blankIf(eq.evenShareBp),
      top_share_bp: blankIf(eq.topShareBp),
      verdict: eq.verdict || '',
      ceiling: report.conventions.dweOutsideMinutesCeiling,
      over_ceiling_n: '',
      unreadable_n: '',
      refused_sittings_n: '',
      complete: eq.measured ? 'yes' : 'no',
      blank_reason: eq.measured ? '' : (eq.reason || ''),
    });
  });
  return rows;
}

/**
 * The insights bucket's read-side signals (DWE-01..03). Pure over the same
 * reader the panel and the CSV use; it reads its own ledgers and the live
 * matrix, so it cannot recurse into the engine that is running it. A signal is
 * a COUNT with a route, never a name: the screen opens the register to read
 * the record.
 */
export function distributedEquitySignals(state, now = new Date(), settings = null) {
  let report;
  try {
    report = buildDistributedEquity(state, { now, settings, seat: null });
  } catch {
    return [];
  }
  if (!report?.ok) return [];
  const signals = [];
  const add = (signal) => signals.push({ domain: 'Distributed work', route: DWE_HREF, ...signal });
  const at = now instanceof Date ? now : new Date(now);

  if (report.totals.overCeilingN) {
    add({
      ruleId: 'DWE-01',
      severity: Math.min(5, 3 + Math.min(2, report.totals.overCeilingN - 1)),
      confidence: 'high',
      title: `${report.totals.overCeilingN} person(s) over the declared unsociable-hour ceiling`,
      detail: 'Their trailing-window minutes outside their declared working window exceed the declared ceiling. The ask, when RULE-DWE-01 files one, goes to the joint seat above every line that convenes or holds the burden — never to the person carrying it.',
      action: { label: 'Open the distributed-work equity register', route: `${DWE_HREF}?view=burden` },
      evidence: [
        `${report.totals.readablePeopleN} readable member(s) over ${report.conventions.dweWindowDays} days`,
        `${report.totals.sittingsValid} valid sitting(s) placed`,
      ],
    });
  }

  if (report.workspaceEquity.verdict === 'concentrated') {
    add({
      ruleId: 'DWE-02',
      severity: 3,
      confidence: 'high',
      title: 'The workspace unsociable-hour burden is concentrated',
      detail: `The top member carries ${report.workspaceEquity.topShareBp} bp of the placed burden against an even share of ${report.workspaceEquity.evenShareBp} bp over ${report.workspaceEquity.peopleN} readable member(s). A verdict below its floors is refused, never rendered as reassuring.`,
      action: { label: 'See the equity reading', route: `${DWE_HREF}?view=burden` },
      evidence: [`measured over ${report.workspaceEquity.sittingsN} sitting(s)`],
    });
  }

  if (report.totals.unreadablePeopleN || report.totals.sittingsRefused) {
    add({
      ruleId: 'DWE-03',
      severity: 2,
      confidence: 'high',
      title: `${report.totals.unreadablePeopleN} attendee(s) unreadable and ${report.totals.sittingsRefused} sitting(s) refused`,
      detail: 'No declared window, an ambiguous window pair, an unreadable zone, a boundary the calendar refuses, or an attendee not on the roster. The cells are blank with their reasons — never zeros — and coverage is not certified while they stand.',
      action: { label: 'Read the coverage claim', route: `${DWE_HREF}?view=register` },
      evidence: report.coverageReasons.slice(0, 3),
    });
  }
  void at;
  return signals;
}

export const DWE_DEFAULT_CONVENTIONS = DWE_DEFAULTS;
