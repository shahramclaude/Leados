/**
 * app/core/domain/freezeLine.js — the Freeze-Line Continuity Audit
 * (Schema v101, ADR-0099).
 *
 * A committed or reverted structural design is a FREEZE LINE: a dated boundary
 * in the declared reporting tree. Every frozen reading taken before that day
 * was measured against a different tree, so the question "is this series still
 * comparable?" has a real answer or a refusal — never a silent continuation.
 *
 * This module measures DATED CARRIAGE across the line using the same artefacts
 * the Programme Federation Reading (ADR-0090) counts, mapped through the tree
 * as it stood BEFORE the line (reporting lines restored from the design's frozen
 * `previousManagers`) and the tree as it stands AFTER it (today's roster). For
 * every declared edge present in both trees it classifies continuity as held /
 * lost / gained / still-silent, aggregates by altitude with small-cell
 * complementary suppression, and states a verdict — held / degraded / refused —
 * on Wilson (1927) intervals, REFUSED below the declared edge floor.
 *
 * It also runs the TIMING GUARD: a suppressed row must never carry the date of
 * its last carriage (temporal differencing of a withheld cell), and legacy
 * frozen snapshots that still carry one are counted here so RULE-FRZ-03 can
 * open redaction work.
 *
 * Pure module: no DOM, no storage, no network, no Math.random and no wall
 * clock beyond the injected `now`. Every figure is re-derived on read.
 */

import { addDays, dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { activeSeat, buildSeats } from './seat.js';
import { altitudeByKey } from './chainRegistry.js';
import {
  extractRawCarriage,
  leadershipOwnerOf,
  parentSeatOf,
  wilsonInterval,
} from './federation.js';
import { freezeLineConventions } from './freezeLineSchema.js';
import {
  CONTINUITY_CLASSES,
  CONTINUITY_META,
  FREEZE_DEFAULTS,
  FREEZE_DISCLOSURE,
  FREEZE_ENGINE_VERSION,
  FREEZE_LIMITS,
  FREEZE_PLAYBOOK,
  FREEZE_PREMISE,
  FREEZE_VERDICTS,
} from './freezeLineRegistry.js';

/* ------------------------------------------------------------ freeze lines */

/**
 * Detect the freeze lines a workspace has actually crossed: every committed
 * structural design (the line is its commit date) and every reverted one (the
 * line is the revert date recorded in its history, falling back to the commit
 * date). Identity-free by construction: a line carries counts and dates of
 * STRUCTURAL events, never a person's name.
 */
export function detectFreezeLines(state, { now = new Date() } = {}) {
  const designs = Array.isArray(state?.orgDesigns) ? state.orgDesigns : [];
  const people = Array.isArray(state?.people) ? state.people : [];
  const byId = new Map(people.map((p) => [p.id, p]));
  const lines = [];
  for (const design of designs) {
    if (!design || !design.id) continue;
    if (design.status === 'committed' && design.committedOn) {
      lines.push(lineRecord(design, 'committed', design.committedOn, byId));
    } else if (design.status === 'reverted') {
      const revertEntry = [...(Array.isArray(design.history) ? design.history : [])]
        .reverse()
        .find((entry) => entry && entry.type === 'reverted' && entry.at);
      const on = revertEntry ? dayKey(revertEntry.at) : design.committedOn;
      if (on) lines.push(lineRecord(design, 'reverted', on, byId));
    }
  }
  lines.sort((a, b) => a.on.localeCompare(b.on) || String(a.designId).localeCompare(String(b.designId)));
  return lines.slice(-FREEZE_LIMITS.lines);
}

function lineRecord(design, kind, on, peopleById) {
  const moves = Array.isArray(design.moves) ? design.moves : [];
  const movedByAltitude = {};
  for (const move of moves) {
    const person = peopleById.get(move?.personId);
    const level = person?.level || 'ic';
    const key = altitudeByKey(level)?.key || 'frontline';
    movedByAltitude[key] = (movedByAltitude[key] || 0) + 1;
  }
  return {
    designId: design.id,
    kind,
    on,
    label: typeof design.label === 'string' ? design.label.slice(0, 140) : 'Untitled structural design',
    ownerId: design.ownerId || null,
    movesN: moves.length,
    movedByAltitude,
    reviewOn: design.reviewOn || null,
  };
}

/** The roster as it stood before a design was committed (frozen evidence). */
export function preFreezeState(state, design) {
  const previous = Array.isArray(design?.previousManagers) && design.previousManagers.length
    ? design.previousManagers
    : (Array.isArray(design?.snapshot?.appliedMoves) ? design.snapshot.appliedMoves.map((m) => ({
      personId: m.personId, managerId: m.fromManagerId ?? null,
    })) : []);
  if (!previous.length) return state;
  const restore = new Map(previous.map((row) => [row.personId, row.managerId || null]));
  const people = (Array.isArray(state?.people) ? state.people : []).map((person) => (
    restore.has(person.id) ? { ...person, managerId: restore.get(person.id) } : person
  ));
  return { ...state, people };
}

/* ------------------------------------------------------------- measurement */

function mapEvents(rawEvents, built) {
  const events = [];
  for (const raw of rawEvents) {
    if (!raw.on || !raw.fromSeatId) continue;
    const origin = leadershipOwnerOf(built, raw.fromSeatId);
    if (!origin) continue;
    const target = raw.toSeatId === LEADER_ID ? LEADER_ID : leadershipOwnerOf(built, raw.toSeatId);
    if (!target) continue;
    events.push({ channel: raw.channel, fromSeatId: origin, toSeatId: target, on: raw.on });
  }
  return events;
}

function isAboveSeat(built, candidateId, seatId) {
  if (!candidateId || !seatId) return false;
  if (candidateId === LEADER_ID) return true;
  let cursor = built.chain.nodes.get(seatId)?.parentId || null;
  let guard = 0;
  while (cursor && guard < 64) {
    if (cursor === candidateId) return true;
    if (cursor === LEADER_ID) return false;
    cursor = built.chain.nodes.get(cursor)?.parentId || null;
    guard += 1;
  }
  return false;
}

/**
 * One measured side of a freeze line: per declared edge of the given tree, how
 * much dated carriage reached the span above (direct) or a level above it
 * (bypass) inside [windowStart, windowEnd). An edge is `connected` when it
 * carried at least one direct artefact.
 */
export function measureSide(state, built, rawEvents, windowStart, windowEnd, { now } = {}) {
  const events = mapEvents(rawEvents, built);
  const byOrigin = new Map();
  for (const event of events) {
    if (event.on < windowStart || event.on > windowEnd) continue;
    if (!byOrigin.has(event.fromSeatId)) byOrigin.set(event.fromSeatId, []);
    byOrigin.get(event.fromSeatId).push(event);
  }
  const rows = [];
  for (const seat of built.seats) {
    if (seat.isLeader || !seat.altitudeKey) continue;
    const parentId = parentSeatOf(built, seat.id);
    if (!parentId) continue; // root rows carry no edge to measure
    const own = byOrigin.get(seat.id) || [];
    let directN = 0;
    let bypassN = 0;
    let lastCarriageOn = null;
    for (const event of own) {
      if (lastCarriageOn === null || event.on > lastCarriageOn) lastCarriageOn = event.on;
      if (event.toSeatId === parentId) directN += 1;
      else if (isAboveSeat(built, event.toSeatId, parentId)) bypassN += 1;
    }
    rows.push({
      seatId: seat.id,
      parentId,
      altitudeKey: seat.altitudeKey,
      rank: seat.rank,
      connected: directN > 0,
      directN,
      bypassN,
      evidenceN: directN + bypassN,
      lastCarriageOn,
      suppressed: false,
    });
  }
  rows.sort((a, b) => b.rank - a.rank || String(a.seatId).localeCompare(String(b.seatId)));
  const edgesN = rows.length;
  const connectedN = rows.filter((row) => row.connected).length;
  const wilson = wilsonInterval(connectedN, edgesN);
  return {
    windowStart,
    windowEnd,
    rows,
    edgesN,
    connectedN,
    coveragePct: edgesN > 0 ? Math.round((connectedN / edgesN) * 1000) / 10 : null,
    wilsonLowPct: wilson.low === null ? null : Math.round(wilson.low * 1000) / 10,
    wilsonHighPct: wilson.high === null ? null : Math.round(wilson.high * 1000) / 10,
  };
}

/* -------------------------------------------------------------- continuity */

function continuityClass(beforeRow, afterRow) {
  if (beforeRow?.connected && afterRow?.connected) return 'held';
  if (beforeRow?.connected && !afterRow?.connected) return 'lost';
  if (!beforeRow?.connected && afterRow?.connected) return 'gained';
  return 'still-silent';
}

/**
 * The full continuity measurement across one freeze line. `design` is the
 * orgDesign record the line comes from; both sides reuse the declared window.
 */
export function measureContinuity(state, { now = new Date(), settings = null, design } = {}) {
  const conv = freezeLineConventions(settings || state?.settings || {});
  const lineOn = design?.committedOn || null;
  const raw = extractRawCarriage(state, {});
  const builtAfter = buildSeats(state, { now, settings: settings || state?.settings || {} });
  const builtBefore = buildSeats(preFreezeState(state, design), { now, settings: settings || state?.settings || {} });
  const today = dayKey(now);
  const beforeStart = addDays(lineOn, -conv.freezeLineWindowDays);
  // The before window ends the day BEFORE the line: carriage on the line day
  // itself belongs to the after side, so no artefact is counted twice.
  const beforeEnd = addDays(lineOn, -1);
  const afterEnd = addDays(lineOn, conv.freezeLineWindowDays);
  const afterWindowEnd = afterEnd && afterEnd < today ? afterEnd : today;
  const partialAfter = Boolean(afterEnd && today < afterEnd);

  const before = measureSide(state, builtBefore, raw, beforeStart, beforeEnd, { now });
  const after = measureSide(state, builtAfter, raw, lineOn, afterWindowEnd, { now });

  const afterByEdge = new Map(after.rows.map((row) => [`${row.seatId}>${row.parentId}`, row]));
  const beforeByEdge = new Map(before.rows.map((row) => [`${row.seatId}>${row.parentId}`, row]));
  const classes = [];
  for (const [edge, beforeRow] of beforeByEdge) {
    const afterRow = afterByEdge.get(edge) || null;
    classes.push({ edge, seatId: beforeRow.seatId, altitudeKey: beforeRow.altitudeKey, rank: beforeRow.rank, cls: continuityClass(beforeRow, afterRow), suppressed: false });
  }
  for (const [edge, afterRow] of afterByEdge) {
    if (beforeByEdge.has(edge)) continue;
    classes.push({ edge, seatId: afterRow.seatId, altitudeKey: afterRow.altitudeKey, rank: afterRow.rank, cls: continuityClass(null, afterRow), suppressed: false, remapped: true });
  }

  // Aggregate by altitude with small-cell complementary suppression — the same
  // publication surface rule as federation: a small group blanks a partner cell.
  const groups = new Map();
  for (const entry of classes) {
    if (!groups.has(entry.altitudeKey)) groups.set(entry.altitudeKey, []);
    groups.get(entry.altitudeKey).push(entry);
  }
  const cells = [];
  for (const [altitudeKey, group] of groups) {
    const counts = {};
    for (const cls of CONTINUITY_CLASSES) counts[cls] = group.filter((entry) => entry.cls === cls).length;
    const small = group.length > 0 && group.length < conv.freezeLineCellFloor;
    if (small) {
      for (const entry of group) entry.suppressed = true;
      // Complementary: blank the largest other class cell in the same group so
      // the group total cannot be differenced back to the small one.
      const partnerCls = CONTINUITY_CLASSES.filter((c) => c !== 'still-silent')
        .sort((a, b) => (counts[b] || 0) - (counts[a] || 0))[0];
      cells.push({ altitudeKey, cls: partnerCls, n: null, suppressed: true });
    }
    for (const cls of CONTINUITY_CLASSES) {
      cells.push({ altitudeKey, cls, n: small ? null : counts[cls], suppressed: small });
    }
  }

  // Verdict on the two sides' Wilson intervals, refused below the edge floor.
  const floor = conv.freezeLineMinEdges;
  let verdict = 'refused';
  let deltaPctPoints = null;
  let reason = '';
  if (before.edgesN < floor || after.edgesN < floor) {
    reason = `Refused: ${Math.max(before.edgesN, after.edgesN)} of at least ${floor} declared edges are measurable on each side of the line; a rate below the floor is not stated.`;
  } else {
    deltaPctPoints = Math.round((after.coveragePct - before.coveragePct) * 10) / 10;
    if (deltaPctPoints <= -conv.freezeLineDropPct) {
      verdict = 'degraded';
      reason = `The connected share of declared edges fell ${Math.abs(deltaPctPoints)} points across the line (${before.coveragePct}% → ${after.coveragePct}%, Wilson 95% ${before.wilsonLowPct}–${before.wilsonHighPct}% → ${after.wilsonLowPct}–${after.wilsonHighPct}%), beyond the declared ${conv.freezeLineDropPct}-point threshold.`;
    } else {
      verdict = 'held';
      reason = `The connected share of declared edges moved ${deltaPctPoints} points across the line (${before.coveragePct}% → ${after.coveragePct}%, Wilson 95% ${before.wilsonLowPct}–${before.wilsonHighPct}% → ${after.wilsonLowPct}–${after.wilsonHighPct}%), within the declared ${conv.freezeLineDropPct}-point threshold.`;
    }
    if (partialAfter) {
      reason += ` The after-window is partial (${after.windowStart} → ${after.windowEnd}); the verdict compares what is measurable today.`;
    }
  }

  // Comparability: pre-freeze frozen federation assessments, re-projected only
  // in aggregate. Identity-free by construction — counts, never span lists.
  const assessments = Array.isArray(state?.federationAssessments) ? state.federationAssessments : [];
  const pre = assessments.filter((row) => row && row.frozenOn && row.frozenOn < lineOn);
  const comparability = {
    preAssessmentsN: pre.length,
    inWindowN: pre.filter((row) => row.frozenOn >= beforeStart).length,
    suppressed: pre.length > 0 && pre.length < conv.freezeLineCellFloor,
    note: pre.length
      ? `${pre.length} frozen federation reading(s) predate the line; their per-span detail is NOT re-projected — only the aggregate above is comparable.`
      : 'No frozen federation reading predates this line, so there is no pre-freeze series to compare against.',
  };

  return {
    lineOn,
    windowDays: conv.freezeLineWindowDays,
    before: sideForStore(before, floor, 'before'),
    after: sideForStore({ ...after, windowEnd: afterWindowEnd }, floor, 'after'),
    partialAfter,
    deltaPctPoints,
    verdict,
    reason,
    cells: cells.slice(0, FREEZE_LIMITS.cellsPerReading),
    comparability,
  };
}

function sideForStore(side, floor, which) {
  return {
    windowStart: side.windowStart,
    windowEnd: side.windowEnd,
    edgesN: side.edgesN,
    connectedN: side.connectedN,
    coveragePct: side.edgesN < floor ? null : side.coveragePct,
    wilsonLowPct: side.edgesN < floor ? null : side.wilsonLowPct,
    wilsonHighPct: side.edgesN < floor ? null : side.wilsonHighPct,
    refused: side.edgesN < floor,
    reason: which === 'before'
      ? `Measured on the tree as it stood before the line, over ${side.windowStart} → ${side.windowEnd}.`
      : `Measured on the tree as it stands now, over ${side.windowStart} → ${side.windowEnd}.`,
  };
}

/* ------------------------------------------------------------ timing guard */

/**
 * Count legacy frozen federation snapshots that still carry a carriage date on
 * a suppressed row. New freezes never write one (suppression is applied at
 * freeze time and the date blanked); RULE-FRZ-03 opens redaction work for
 * every one found here.
 */
export function timingGuardAudit(state) {
  const assessments = Array.isArray(state?.federationAssessments) ? state.federationAssessments : [];
  let rowsWithDates = 0;
  let assessmentsAffected = 0;
  for (const assessment of assessments) {
    const rows = Array.isArray(assessment?.rows) ? assessment.rows : [];
    const leaks = rows.filter((row) => row && row.suppressed === true && row.lastCarriageOn).length;
    if (leaks > 0) {
      rowsWithDates += leaks;
      assessmentsAffected += 1;
    }
  }
  return { assessmentsN: assessments.length, assessmentsAffected, suppressedRowsWithDatesN: rowsWithDates };
}

/* ------------------------------------------------------------------ report */

function scopeEdges(state, built, seat, edges) {
  if (!seat || seat.fullAccess) return edges;
  const scope = seat.scope instanceof Set ? seat.scope : new Set();
  return edges.filter((entry) => scope.has(entry.seatId));
}

/**
 * The full report: every detected freeze line with its latest frozen reading
 * (if any) and a live continuity preview, the timing-guard audit, and the
 * altitude playbook for the reading seat.
 */
export function buildFreezeLineReport(state = {}, { now = new Date(), settings = null, seatId = null } = {}) {
  const conv = freezeLineConventions(settings || state.settings || {});
  const built = buildSeats(state, { now, settings: settings || state.settings || {} });
  const seat = (seatId && built.byId.get(seatId)) || [...built.seats].find((s) => s.isActive) || [...built.seats][0] || null;
  const designs = Array.isArray(state.orgDesigns) ? state.orgDesigns : [];
  const readings = Array.isArray(state.freezeReadings) ? state.freezeReadings : [];
  const lines = detectFreezeLines(state, { now });

  const lineReports = lines.map((line) => {
    const design = designs.find((row) => row && row.id === line.designId) || null;
    const frozen = readings
      .filter((row) => row && row.designId === line.designId)
      .sort((a, b) => String(b.frozenOn).localeCompare(String(a.frozenOn)) || String(b.id).localeCompare(String(a.id)))[0] || null;
    let live = null;
    if (design) {
      const measurement = measureContinuity(state, { now, settings: settings || state.settings, design });
      live = {
        verdict: measurement.verdict,
        deltaPctPoints: measurement.deltaPctPoints,
        reason: measurement.reason,
        before: measurement.before,
        after: measurement.after,
        partialAfter: measurement.partialAfter,
        cells: measurement.cells,
        comparability: measurement.comparability,
      };
    }
    return { ...line, frozen, live };
  });

  const guard = timingGuardAudit(state);
  const degraded = lineReports.filter((line) => (line.frozen?.verdict || line.live?.verdict) === 'degraded');
  const openDecisions = (Array.isArray(state.decisions) ? state.decisions : [])
    .filter((d) => d && d.outcome === 'pending' && typeof d.rationale === 'string' && d.rationale.includes('RULE-FRZ-02'))
    .slice(0, 20)
    .map((d) => ({ id: d.id, title: d.title, reviewOn: d.reviewOn }));

  const withheld = [];
  if (seat && !seat.fullAccess) {
    withheld.push({ reason: `Continuity cells are scoped to the ${seat.altitudeKey || 'declared'} span; peer spans appear only as aggregates.`, n: lineReports.length });
  }
  const suppressedCells = lineReports.flatMap((line) => (line.live?.cells || []).filter((c) => c.suppressed));
  if (suppressedCells.length) {
    withheld.push({ reason: `Small-cell suppression: ${suppressedCells.length} altitude cell(s) blanked at the floor of ${conv.freezeLineCellFloor}, each with a complementary cell where the group had one to blank.`, n: suppressedCells.length });
  }
  if (guard.suppressedRowsWithDatesN > 0) {
    withheld.push({ reason: `Timing guard: ${guard.suppressedRowsWithDatesN} suppressed row(s) in ${guard.assessmentsAffected} legacy frozen snapshot(s) still carry a carriage date; redaction work is opened by RULE-FRZ-03 and the live view withholds the date regardless.`, n: guard.suppressedRowsWithDatesN });
  }
  const refused = lineReports.filter((line) => (line.frozen?.verdict || line.live?.verdict) === 'refused');
  if (refused.length) {
    withheld.push({ reason: `${refused.length} freeze line(s) are REFUSED: fewer than ${conv.freezeLineMinEdges} declared edges are measurable on a side, so no rate is stated.`, n: refused.length });
  }

  return {
    ok: true,
    engineVersion: FREEZE_ENGINE_VERSION,
    today: dayKey(now),
    premise: FREEZE_PREMISE,
    seat: seat ? {
      id: seat.id,
      label: seat.label,
      altitudeKey: seat.altitudeKey || 'chief',
      rank: seat.rank,
      fullAccess: Boolean(seat.fullAccess),
      readOnly: Boolean(seat.readOnly),
    } : null,
    playbook: FREEZE_PLAYBOOK[seat?.altitudeKey] || FREEZE_PLAYBOOK.chief,
    disclosure: FREEZE_DISCLOSURE,
    conventions: conv,
    lines: lineReports.slice(0, FREEZE_LIMITS.lines),
    timingGuard: guard,
    degradedN: degraded.length,
    openDecisions,
    withheld,
  };
}

/** Build the stored reading record for one freeze line (used by the action). */
export function buildFreezeReading(state, { id, designId, now = new Date(), settings = null } = {}) {
  const designs = Array.isArray(state?.orgDesigns) ? state.orgDesigns : [];
  const design = designs.find((row) => row && row.id === designId) || null;
  if (!design) return { ok: false, error: 'That structural design no longer exists, so there is no freeze line to freeze.' };
  const line = detectFreezeLines(state, { now }).find((entry) => entry.designId === designId) || null;
  if (!line) return { ok: false, error: 'That design has not crossed a freeze line yet (only a committed or reverted design does).' };
  const measurement = measureContinuity(state, { now, settings: settings || state.settings, design });
  const reading = {
    id,
    designId,
    kind: line.kind,
    lineOn: line.on,
    frozenOn: dayKey(now),
    windowDays: measurement.windowDays,
    verdict: measurement.verdict,
    deltaPctPoints: measurement.deltaPctPoints,
    before: measurement.before,
    after: measurement.after,
    cells: measurement.cells,
    comparability: measurement.comparability,
    engineVersion: FREEZE_ENGINE_VERSION,
    createdAt: now.toISOString(),
  };
  return { ok: true, reading, live: measurement };
}

/* --------------------------------------------------------------- exports */

export function freezeLineBriefText(report) {
  if (!report || !report.ok) return 'No freeze-line reading is available.';
  const lines = report.lines.map((line) => {
    const verdict = line.frozen?.verdict || line.live?.verdict || 'unmeasured';
    const before = line.live?.before || line.frozen?.before;
    const after = line.live?.after || line.frozen?.after;
    const b = before?.refused ? 'refused' : `${before?.coveragePct}%`;
    const a = after?.refused ? 'refused' : `${after?.coveragePct}%`;
    return `• ${line.on} ${line.kind} (${line.movesN} line move(s)) — verdict ${verdict}: connected share ${b} → ${a} across the line.`;
  });
  return [
    `Freeze-line continuity audit — ${report.today} — ${report.seat?.label || 'workspace'}`,
    ...(lines.length ? lines : ['No structural design has been committed or reverted yet, so there is no freeze line.']),
    `Timing guard: ${report.timingGuard.suppressedRowsWithDatesN} suppressed row(s) in legacy snapshots still carry a carriage date (redaction work open); the live view withholds those dates regardless.`,
    `Degraded lines: ${report.degradedN}. Refusals and suppressions are printed on screen, never zeroed.`,
    'No person is named, rated or ranked. A degraded line is a property of the STRUCTURE, measured on edges — never of the people inside them.',
  ].join('\n');
}

/** CSV scope #95: aggregate-only, identity-free, refusal-honest. */
export function freezeLineCsvRows(report) {
  if (!report || !report.ok) return [];
  const rows = [];
  for (const line of report.lines) {
    const verdict = line.frozen?.verdict || line.live?.verdict || 'unmeasured';
    const before = line.live?.before || line.frozen?.before || {};
    const after = line.live?.after || line.frozen?.after || {};
    rows.push({
      row_kind: 'freeze-line',
      kind: line.kind,
      line_on: line.on,
      moves_n: line.movesN,
      verdict,
      before_edges_n: before.edgesN ?? '',
      before_connected_n: before.refused ? '' : (before.connectedN ?? ''),
      before_coverage_pct: before.refused ? '' : (before.coveragePct ?? ''),
      before_interval_low_pct: before.refused ? '' : (before.wilsonLowPct ?? ''),
      before_interval_high_pct: before.refused ? '' : (before.wilsonHighPct ?? ''),
      after_edges_n: after.edgesN ?? '',
      after_connected_n: after.refused ? '' : (after.connectedN ?? ''),
      after_coverage_pct: after.refused ? '' : (after.coveragePct ?? ''),
      after_interval_low_pct: after.refused ? '' : (after.wilsonLowPct ?? ''),
      after_interval_high_pct: after.refused ? '' : (after.wilsonHighPct ?? ''),
      delta_pct_points: line.live?.deltaPctPoints ?? line.frozen?.deltaPctPoints ?? '',
      pre_freeze_assessments_n: (line.live?.comparability || line.frozen?.comparability)?.preAssessmentsN ?? '',
    });
    const cells = line.live?.cells || line.frozen?.cells || [];
    for (const cell of cells) {
      rows.push({
        row_kind: 'continuity-cell',
        kind: line.kind,
        line_on: line.on,
        altitude: cell.altitudeKey || '',
        continuity_class: cell.cls || '',
        n: cell.suppressed ? '' : (cell.n ?? ''),
        suppressed: cell.suppressed ? 'yes' : 'no',
      });
    }
  }
  rows.push({
    row_kind: 'timing-guard',
    kind: '',
    line_on: '',
    moves_n: '',
    verdict: report.timingGuard.suppressedRowsWithDatesN > 0 ? 'leak-found' : 'clean',
    assessments_n: report.timingGuard.assessmentsN,
    suppressed_rows_with_dates_n: report.timingGuard.suppressedRowsWithDatesN,
  });
  return rows;
}

export function freezeLineAttentionCount(state = {}, { now = new Date(), settings = null } = {}) {
  const report = buildFreezeLineReport(state, { now, settings: settings || state.settings });
  if (!report.ok) return 0;
  return Math.min(99, report.degradedN + report.timingGuard.suppressedRowsWithDatesN + report.openDecisions.length);
}

export { CONTINUITY_META, FREEZE_VERDICTS, FREEZE_DEFAULTS };
