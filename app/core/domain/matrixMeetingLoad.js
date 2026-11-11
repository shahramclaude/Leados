/**
 * app/core/domain/matrixMeetingLoad.js — the Matrix Meeting-Load & Coordination
 * Tax Ledger (ADR-0169, Schema v135 unchanged, `#/matrix?panel=meeting-load`,
 * CSV scope #124).
 *
 * THE DUTY, IN A DIRECTOR'S WORDS
 * -------------------------------
 * *"How much of my people's week is being consumed by meetings — and how much of
 * it is convened by lines that are not mine?"* LeadOS can answer neither today,
 * and the record to answer it has been sitting in the workspace since Schema
 * v93: every sitting logged on `#/cadence` stores the day it sat, its duration
 * and who attended. Nothing had ever multiplied those three fields together.
 *
 * THE ARITHMETIC, SAID PLAINLY
 * ----------------------------
 *   person-minutes   Σ over sittings of (recorded minutes × recorded attendees)
 *   cross-line       the same sum restricted to sittings chaired by anyone other
 *                    than the person's own (home) manager
 *   tax rate         cross-line ÷ total, in whole per-mille, printed only above
 *                    the declared floor
 *
 * Every figure is an exact integer number of minutes. Nothing is rounded, nothing
 * is estimated, and no sitting without a duration is given one.
 *
 * WHAT IT REFUSES, AND WHY THAT IS THE PRODUCT
 * --------------------------------------------
 *  - A sitting with no readable duration refuses the totals of everyone who
 *    attended it: a partial sum printed as a total understates the load.
 *  - A sitting naming an attendee who is not on the roster is refused whole.
 *    Charging the attendees we recognise would silently shrink the room.
 *  - A chair's minutes are attributed to a line ONLY when the chair holds
 *    exactly one of the person's active declared lines. A record that broke the
 *    one-line-per-manager invariant falls to "no declared line" — counted as
 *    cross-line and attributed to nobody — never split between two lines.
 *  - The home manager's sittings are printed and never charged to a second line.
 *  - A rate below the declared floor is BLANK with its reason, never a zero.
 *  - Above the acting seat's scope, a sitting is counted as withheld and its
 *    minutes are not folded into any figure.
 *
 * NOTHING IS STORED and nothing is scheduled. This module writes no collection,
 * cancels no forum and grades no person.
 */

import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixLineScope } from './matrix.js';
import { activeSeat, buildSeats } from './seat.js';
import { buildLinePeriodAllocation, resolveAllocationWindow } from './linePeriodAllocation.js';
import { FORUM_CADENCE_LABELS, FORUM_KIND_LABELS } from './cadenceRegistry.js';
import {
  MATRIX_MEETING_LOAD_BOUNDS,
  MATRIX_MEETING_LOAD_CONVENTIONS,
  MATRIX_MEETING_LOAD_ENGINE_VERSION,
  MATRIX_MEETING_LOAD_METHOD,
  MATRIX_MEETING_LOAD_PLACEMENTS,
  MATRIX_MEETING_LOAD_PERSON_STATES,
  MATRIX_MEETING_LOAD_SESSION_REFUSALS,
  MATRIX_MEETING_LOAD_SESSION_REFUSAL_KEYS,
  meetingLoadPersonState,
  meetingLoadSessionRefusal,
  meetingLoadSeverity,
} from './matrixMeetingLoadRegistry.js';

const isInt = (v) => typeof v === 'number' && Number.isFinite(v);

/** Whole minutes a sitting consumed, or null when the record cannot support one. */
export function sittingMinutes(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (!Number.isInteger(value)) return null;
  if (value <= 0 || value > MATRIX_MEETING_LOAD_BOUNDS.minutesCeiling) return null;
  return value;
}

/** One decimal hour figure derived from exact minutes. Display only, labelled so. */
export function minutesToHours(minutes) {
  if (!isInt(minutes) || minutes < 0) return null;
  return Math.round((minutes / 60) * 10) / 10;
}

/**
 * Exact integer per-mille of `part` in `whole`. `null` when there is no
 * denominator — an absence, never a set of zeros dressed as a rate.
 */
export function permilleOf(part, whole) {
  if (!isInt(part) || !isInt(whole) || whole <= 0) return null;
  return Math.round((part * 1000) / whole);
}

function nonEmptyId(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** The seat's visibility, stated once so the screen, the brief and the export agree. */
function seatScope(state, matrix, now, settings) {
  const lineScope = matrixLineScope(matrix);
  const built = buildSeats(state, { now, settings, lineScope: lineScope.byManager });
  const seat = activeSeat(built);
  if (!seat || seat.fullAccess) {
    return { seat, visible: () => true, scopeLabel: 'the whole workspace', fullAccess: true };
  }
  const inTree = (personId) => Boolean(seat.scope?.has?.(personId));
  const inLines = (personId) => Boolean(seat.lineScope?.has?.(personId));
  return {
    seat,
    visible: (personId) => personId === seat.id || inTree(personId) || inLines(personId),
    scopeLabel: `${seat.label || seat.id}’s span and its declared lines`,
    fullAccess: false,
  };
}

/** The person's own chain-of-command manager, taken from the canonical matrix DAG. */
function homeManagerOf(matrix, personId) {
  const lines = matrix.linesByPerson.get(personId) || [];
  const primary = lines.find((line) => line.role === 'primary' && line.active !== false);
  if (primary?.managerId) return primary.managerId;
  const person = matrix.chain.byId.get(personId);
  if (person?.managerId) return person.managerId;
  return personId === LEADER_ID ? null : LEADER_ID;
}

/** The person's active declared second lines (never the home allocation row). */
function declaredLinesOf(matrix, personId) {
  return (matrix.linesByPerson.get(personId) || [])
    .filter((line) => line.role !== 'primary' && line.active !== false);
}

function emptyPlacements() {
  const out = {};
  for (const placement of MATRIX_MEETING_LOAD_PLACEMENTS) out[placement.key] = 0;
  return out;
}

/**
 * The whole ledger for one named window, under the acting seat.
 *
 * Reads: `cadenceForums` (chair, kind, status) and `cadenceSessions` (day,
 * status, minutes, attendee list), the live matrix DAG and the operating seat.
 */
export function buildMatrixMeetingLoad(state = {}, {
  from = null, to = null, now = new Date(), settings = null,
} = {}) {
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const today = dayKey(at) || new Date().toISOString().slice(0, 10);
  const cfg = settings || state.settings || {};
  const window = resolveAllocationWindow({ from, to, now: at, source: (from || to) ? 'query' : 'default' });
  const matrix = buildMatrix(state, { now: at, settings: cfg });
  const { seat, visible, scopeLabel, fullAccess } = seatScope(state, matrix, at, cfg);

  const forumsAll = Array.isArray(state?.cadenceForums) ? state.cadenceForums : [];
  const forumById = new Map();
  for (const forum of forumsAll) {
    const id = nonEmptyId(forum?.id);
    if (id && !forumById.has(id)) forumById.set(id, forum);
  }
  const sessionsAll = Array.isArray(state?.cadenceSessions) ? state.cadenceSessions : [];
  const sessionsRead = sessionsAll.slice(0, MATRIX_MEETING_LOAD_BOUNDS.sessions);
  const sessionsOmittedN = Math.max(0, sessionsAll.length - sessionsRead.length);

  const sessionRefusals = new Map();
  for (const key of MATRIX_MEETING_LOAD_SESSION_REFUSAL_KEYS) {
    sessionRefusals.set(key, { key, sittingN: 0, personN: 0 });
  }
  const refuseSitting = (key, personIds = []) => {
    const bucket = sessionRefusals.get(key);
    if (!bucket) return;
    bucket.sittingN += 1;
    bucket.personN += personIds.length;
  };

  /* --------------------------------------------------------- person records */
  const people = new Map();
  const personIds = new Set([...matrix.chain.byId.keys(), ...matrix.nodes.keys()]);
  for (const personId of personIds) {
    const node = matrix.nodes.get(personId);
    const homeManagerId = homeManagerOf(matrix, personId);
    const lines = declaredLinesOf(matrix, personId);
    people.set(personId, {
      personId,
      personName: node?.name || personId,
      rank: node?.depth ?? null,
      altitude: node?.altitude || null,
      homeManagerId,
      homeManagerName: homeManagerId ? (matrix.nodes.get(homeManagerId)?.name || homeManagerId) : null,
      linesN: lines.length,
      lines: lines.map((line) => ({
        declarationId: line.declarationId || line.id || null,
        managerId: line.managerId,
        managerName: matrix.nodes.get(line.managerId)?.name || line.managerId,
        kind: line.kind || null,
      })),
      sittingsN: 0,
      chargedSittingsN: 0,
      chargedMinutes: 0,
      placements: emptyPlacements(),
      placementMinutes: emptyPlacements(),
      chairs: new Map(),
      lineManagerMinutes: new Map(),
      forums: new Map(),
      durationRefusalN: 0,
      attendanceRefusalN: 0,
      outsideScope: !visible(personId),
    });
  }

  /* -------------------------------------------------------------- sittings */
  const counted = {
    heldInWindowN: 0,
    cancelledInWindowN: 0,
    cancelledVisibleN: 0,
    scheduledInWindowN: 0,
    outsideWindowN: 0,
    unreadableDayN: 0,
    withheldSittingsN: 0,
    withheldAttendancesN: 0,
  };
  let sessionMinutes = 0;
  let sessionAttendeeSittings = 0;
  const placementMinutesTotal = emptyPlacements();
  const forumRows = new Map();

  const ordered = sessionsRead
    .filter((s) => s && nonEmptyId(s.id))
    .slice()
    .sort((a, b) => (String(a.heldOn || '') < String(b.heldOn || '') ? -1
      : String(a.heldOn || '') > String(b.heldOn || '') ? 1
        : String(a.id).localeCompare(String(b.id))));

  for (const sitting of ordered) {
    const on = dayKey(sitting.heldOn);
    if (!on) { counted.unreadableDayN += 1; continue; }
    if (!window.valid || on < window.from || on > window.to) {
      if (window.valid) counted.outsideWindowN += 1;
      continue;
    }
    if (sitting.status === 'cancelled') {
      counted.cancelledInWindowN += 1;
      const forum = forumById.get(nonEmptyId(sitting.forumId)) || null;
      const chairId = nonEmptyId(forum?.chairSeatId);
      if ((chairId && visible(chairId)) || (sitting.attendeeIds || []).some((id) => visible(id))) {
        counted.cancelledVisibleN += 1;
      }
      continue;
    }
    if (sitting.status !== 'held') {
      counted.scheduledInWindowN += 1;
      continue;
    }
    counted.heldInWindowN += 1;

    const forum = forumById.get(nonEmptyId(sitting.forumId)) || null;
    const chairId = nonEmptyId(forum?.chairSeatId);
    const rawAttendees = Array.isArray(sitting.attendeeIds) ? sitting.attendeeIds : [];
    const attendees = [];
    const seenAttendees = new Set();
    for (const raw of rawAttendees) {
      const id = nonEmptyId(raw);
      if (!id || seenAttendees.has(id)) continue;
      seenAttendees.add(id);
      attendees.push(id);
    }
    const unknownAttendees = attendees.filter((id) => !matrix.nodes.has(id));
    const resolvedAttendees = attendees.filter((id) => matrix.nodes.has(id));
    const visibleAttendees = resolvedAttendees.filter((id) => visible(id));
    const chairVisible = Boolean(chairId && visible(chairId));
    const sittingVisible = chairVisible || visibleAttendees.length > 0;
    if (!sittingVisible) {
      counted.withheldSittingsN += 1;
      counted.withheldAttendancesN += resolvedAttendees.length;
      continue;
    }
    counted.withheldAttendancesN += Math.max(0, resolvedAttendees.length - visibleAttendees.length);

    const minutes = sittingMinutes(sitting.minutes);
    const refusalKey = !forum
      ? 'no-forum'
      : minutes === null
        ? 'no-minutes'
        : attendees.length === 0
          ? 'no-attendees'
          : unknownAttendees.length > 0
            ? 'unknown-attendee'
            : null;

    if (refusalKey) {
      refuseSitting(refusalKey, visibleAttendees);
      const descriptor = meetingLoadSessionRefusal(refusalKey);
      for (const personId of visibleAttendees) {
        const person = people.get(personId);
        if (!person) continue;
        person.sittingsN += 1;
        if (descriptor?.blamesDuration) person.durationRefusalN += 1;
        if (descriptor?.blamesAttendance) person.attendanceRefusalN += 1;
      }
      continue;
    }

    /* ------------------------------------------------ the charge, correctly */
    sessionMinutes += minutes * visibleAttendees.length;
    sessionAttendeeSittings += visibleAttendees.length;

    let forumRow = forumRows.get(forum.id);
    if (!forumRow) {
      forumRow = {
        forumId: forum.id,
        title: forum.title || 'Untitled forum',
        kind: forum.kind || null,
        kindLabel: FORUM_KIND_LABELS[forum.kind] || forum.kind || 'Unclassified forum',
        cadence: forum.cadence || null,
        cadenceLabel: FORUM_CADENCE_LABELS[forum.cadence] || forum.cadence || 'undeclared',
        status: forum.status || 'active',
        chairId,
        chairName: chairId ? (matrix.nodes.get(chairId)?.name || chairId) : null,
        chairResolved: Boolean(chairId && matrix.nodes.has(chairId)),
        heldN: 0,
        cancelledN: 0,
        refusedSittingN: 0,
        minutes: 0,
        personMinutes: 0,
        attendeeSittingsN: 0,
        people: new Set(),
        placements: emptyPlacements(),
        placementMinutes: emptyPlacements(),
      };
      forumRows.set(forum.id, forumRow);
    }
    forumRow.heldN += 1;
    forumRow.minutes += minutes;
    forumRow.personMinutes += minutes * visibleAttendees.length;
    forumRow.attendeeSittingsN += visibleAttendees.length;

    for (const personId of visibleAttendees) {
      const person = people.get(personId);
      if (!person) continue;
      let placementKey = 'other';
      if (chairId && chairId === personId) placementKey = 'self';
      else if (chairId && chairId === person.homeManagerId) placementKey = 'home';
      else if (chairId) {
        // EXACTLY one active declared line or nothing. The matrix engine stores
        // at most one line per (person, manager), so a second match would mean
        // the invariant broke; the minutes then fall through to `other` —
        // counted as cross-line and attributed to no line — never split.
        const matches = declaredLinesOf(matrix, personId).filter((line) => line.managerId === chairId);
        placementKey = matches.length === 1 ? 'line' : 'other';
      } else {
        placementKey = 'no-chair';
      }

      person.sittingsN += 1;
      person.chargedSittingsN += 1;
      person.chargedMinutes += minutes;
      person.placements[placementKey] += 1;
      person.placementMinutes[placementKey] += minutes;
      if (placementKey === 'line' && chairId) {
        person.lineManagerMinutes.set(chairId, (person.lineManagerMinutes.get(chairId) || 0) + minutes);
      }
      person.forums.set(forum.id, {
        forumId: forum.id,
        title: forum.title || 'Untitled forum',
        minutes: (person.forums.get(forum.id)?.minutes || 0) + minutes,
      });
      const chairKey = chairId || 'unresolved';
      const chairEntry = person.chairs.get(chairKey) || {
        chairId,
        chairName: chairId ? (matrix.nodes.get(chairId)?.name || chairId) : null,
        minutes: 0,
      };
      chairEntry.minutes += minutes;
      person.chairs.set(chairKey, chairEntry);

      forumRow.people.add(personId);
      forumRow.placements[placementKey] += 1;
      forumRow.placementMinutes[placementKey] += minutes;
      placementMinutesTotal[placementKey] += minutes;
    }
  }

  // A cancelled sitting is a fact about the forum, not about a person's time.
  for (const sitting of ordered) {
    if (sitting.status !== 'cancelled') continue;
    const on = dayKey(sitting.heldOn);
    if (!on || !window.valid || on < window.from || on > window.to) continue;
    const forum = forumById.get(nonEmptyId(sitting.forumId)) || null;
    if (!forum) continue;
    const row = forumRows.get(forum.id);
    if (row) row.cancelledN += 1;
  }

  /* ---------------------------------------------------------- person totals */
  const personRows = [];
  const crossLinePlacements = new Set(
    MATRIX_MEETING_LOAD_PLACEMENTS.filter((p) => p.crossLine).map((p) => p.key),
  );
  for (const person of people.values()) {
    if (person.outsideScope) continue;
    // The acting seat's own leader node is not a person in the span unless the
    // record puts them on a line or in a room. Otherwise every workspace would
    // carry one permanent "no recorded attendance" row.
    if (person.personId === LEADER_ID && person.sittingsN === 0 && person.linesN === 0) continue;
    const refused = person.durationRefusalN > 0 || person.attendanceRefusalN > 0;
    const crossLineMinutes = MATRIX_MEETING_LOAD_PLACEMENTS.reduce(
      (acc, p) => acc + (p.crossLine ? person.placementMinutes[p.key] : 0),
      0,
    );
    const stateKey = refused ? 'refused' : person.sittingsN === 0 ? 'no-attendance' : 'measured';
    const stateDef = meetingLoadPersonState(stateKey);
    const minutes = refused ? null : person.chargedMinutes;
    const taxPermille = stateKey === 'measured' && minutes >= MATRIX_MEETING_LOAD_BOUNDS.taxFloorMinutes
      ? permilleOf(crossLineMinutes, minutes)
      : null;
    let taxRefusedReason = null;
    if (stateKey === 'refused') {
      taxRefusedReason = 'The meeting total is refused, so no share of it is printed.';
    } else if (stateKey === 'no-attendance') {
      taxRefusedReason = 'No recorded sitting inside the window; there is no denominator and no rate is manufactured.';
    } else if (minutes < MATRIX_MEETING_LOAD_BOUNDS.taxFloorMinutes) {
      taxRefusedReason = `Below the declared floor of ${MATRIX_MEETING_LOAD_BOUNDS.taxFloorMinutes} recorded minutes; a rate on this little time would be arithmetic, not a reading.`;
    }
    const reasons = [];
    if (person.durationRefusalN > 0) {
      reasons.push(`${person.durationRefusalN} sitting(s) this person attended carry no readable duration`);
    }
    if (person.attendanceRefusalN > 0) {
      reasons.push(`${person.attendanceRefusalN} sitting(s) this person attended could not be read as a validated room`);
    }
    personRows.push({
      personId: person.personId,
      personName: person.personName,
      rank: person.rank,
      altitude: person.altitude,
      homeManagerId: person.homeManagerId,
      homeManagerName: person.homeManagerName,
      linesN: person.linesN,
      lines: person.lines,
      sittingsN: person.sittingsN,
      chargedSittingsN: person.chargedSittingsN,
      minutes,
      hours: minutes === null ? null : minutesToHours(minutes),
      knownMinutes: person.chargedMinutes,
      placements: person.placements,
      placementMinutes: person.placementMinutes,
      crossLineMinutes: refused ? null : crossLineMinutes,
      homeMinutes: refused ? null : person.placementMinutes.home,
      selfMinutes: refused ? null : person.placementMinutes.self,
      lineMinutes: refused ? null : person.placementMinutes.line,
      lineManagerMinutes: refused ? null : Object.fromEntries(person.lineManagerMinutes),
      otherMinutes: refused ? null : person.placementMinutes.other,
      noChairMinutes: refused ? null : person.placementMinutes['no-chair'],
      forumsN: person.forums.size,
      chairs: [...person.chairs.values()]
        .sort((a, b) => b.minutes - a.minutes || String(a.chairName || '').localeCompare(String(b.chairName || ''))),
      taxPermille,
      taxRefusedReason,
      state: stateKey,
      stateLabel: stateDef?.label || stateKey,
      stateTone: stateDef?.tone || 'neutral',
      refusedSittingsN: person.durationRefusalN + person.attendanceRefusalN,
      reason: refused
        ? `${reasons.join('; ')}. The total is BLANK rather than a partial sum: this person’s load is at least ${person.chargedMinutes} known minute(s), and printing that as their total would understate it.`
        : stateKey === 'no-attendance'
          ? 'No held sitting inside the window names this person. Zero is a count of the record, not a claim that they attended no meetings.'
          : `Every one of the ${person.sittingsN} recorded sitting(s) this person attended carries a duration and a resolved room, so the total is the exact sum of those sittings.`,
    });
  }
  personRows.sort((a, b) => meetingLoadSeverity(a.state) - meetingLoadSeverity(b.state)
    || (b.minutes ?? -1) - (a.minutes ?? -1)
    || String(a.personName).localeCompare(String(b.personName)));

  /* ----------------------------------------------------------- forum totals */
  const forumList = [...forumRows.values()].map((row) => {
    const crossLine = MATRIX_MEETING_LOAD_PLACEMENTS.reduce(
      (acc, p) => acc + (p.crossLine ? row.placementMinutes[p.key] : 0),
      0,
    );
    const meanMinutes = row.heldN >= MATRIX_MEETING_LOAD_BOUNDS.sittingsFloor
      ? Math.round(row.minutes / row.heldN)
      : null;
    return {
      ...row,
      peopleN: row.people.size,
      people: undefined,
      crossLineMinutes: crossLine,
      crossLinePermille: row.personMinutes > 0 ? permilleOf(crossLine, row.personMinutes) : null,
      meanMinutesPerSitting: meanMinutes,
      meanRefusedReason: meanMinutes === null
        ? `Only ${row.heldN} readable sitting(s); a mean below the declared floor of ${MATRIX_MEETING_LOAD_BOUNDS.sittingsFloor} is not printed.`
        : null,
    };
  }).sort((a, b) => b.crossLineMinutes - a.crossLineMinutes
    || b.personMinutes - a.personMinutes
    || String(a.title).localeCompare(String(b.title)));

  /* ----------------------------------------------------------- chair totals */
  const chairMap = new Map();
  for (const row of forumList) {
    if (!row.chairResolved || !row.chairId) continue;
    if (!visible(row.chairId)) continue;
    const entry = chairMap.get(row.chairId) || {
      chairId: row.chairId,
      chairName: row.chairName,
      forumN: 0,
      heldN: 0,
      minutes: 0,
      personMinutes: 0,
      people: new Set(),
      lineMinutes: 0,
      otherMinutes: 0,
      homeMinutes: 0,
      selfMinutes: 0,
    };
    entry.forumN += 1;
    entry.heldN += row.heldN;
    entry.minutes += row.minutes;
    entry.personMinutes += row.personMinutes;
    for (const placement of MATRIX_MEETING_LOAD_PLACEMENTS) {
      if (placement.key === 'line') entry.lineMinutes += row.placementMinutes.line;
      else if (placement.key === 'other') entry.otherMinutes += row.placementMinutes.other;
      else if (placement.key === 'home') entry.homeMinutes += row.placementMinutes.home;
      else if (placement.key === 'self') entry.selfMinutes += row.placementMinutes.self;
    }
    chairMap.set(row.chairId, entry);
  }
  const chairRows = [...chairMap.values()]
    .map((row) => ({ ...row, peopleN: row.people.size }))
    .sort((a, b) => b.personMinutes - a.personMinutes || String(a.chairName).localeCompare(String(b.chairName)));

  /* ---------------------------------------------------------------- board */
  const measured = personRows.filter((p) => p.state === 'measured');
  const refusedPeople = personRows.filter((p) => p.state === 'refused');
  const noAttendance = personRows.filter((p) => p.state === 'no-attendance');
  // THREE FIGURES THAT MUST NEVER BE COLLAPSED INTO ONE:
  //   chargedMinutes      every minute the sitting log records in scope, charged
  //                       once to exactly one person row — the exact total;
  //   printableMinutes    the sums that can be printed as a person's total;
  //   refusedKnownMinutes the known part of the people whose total is refused,
  //                       printed as a count of minutes and NEVER as a total.
  // charged = printable + refusedKnown, and the identity is asserted as a claim.
  const chargedMinutes = sessionMinutes;
  const printableMinutes = measured.reduce((acc, p) => acc + p.minutes, 0);
  const refusedKnownMinutes = refusedPeople.reduce((acc, p) => acc + p.knownMinutes, 0);
  const crossLineMinutes = MATRIX_MEETING_LOAD_PLACEMENTS.reduce(
    (acc, p) => acc + (p.crossLine ? placementMinutesTotal[p.key] : 0),
    0,
  );
  const homeMinutes = placementMinutesTotal.home;
  const selfMinutes = placementMinutesTotal.self;
  const lineMinutes = placementMinutesTotal.line;
  const otherMinutes = placementMinutesTotal.other;

  const refusalList = MATRIX_MEETING_LOAD_SESSION_REFUSALS.map((descriptor) => {
    const bucket = sessionRefusals.get(descriptor.key);
    return { ...descriptor, sittingN: bucket?.sittingN || 0, personN: bucket?.personN || 0 };
  });
  const refusedSittingsN = refusalList.reduce((acc, r) => acc + r.sittingN, 0);

  const measuredPeopleN = measured.length;
  const spanRateReady = measuredPeopleN >= MATRIX_MEETING_LOAD_BOUNDS.taxFloorPeople
    && chargedMinutes >= MATRIX_MEETING_LOAD_BOUNDS.taxFloorMinutes
    && refusedSittingsN === 0
    && !refusedPeople.length;
  const spanTaxPermille = spanRateReady ? permilleOf(crossLineMinutes, chargedMinutes) : null;
  let spanTaxRefusedReason = null;
  if (!measuredPeopleN) {
    spanTaxRefusedReason = 'No person in scope has a measured meeting total, so there is nothing to divide.';
  } else if (measuredPeopleN < MATRIX_MEETING_LOAD_BOUNDS.taxFloorPeople) {
    spanTaxRefusedReason = `Only ${measuredPeopleN} measured person(s); the declared floor for a span rate is ${MATRIX_MEETING_LOAD_BOUNDS.taxFloorPeople}.`;
  } else if (refusedSittingsN > 0) {
    spanTaxRefusedReason = `${refusedSittingsN} sitting(s) in scope could not be read, so a share of the recorded minutes would understate or overstate the tax. The refusal is printed rather than the ratio.`;
  } else if (refusedPeople.length > 0) {
    spanTaxRefusedReason = `${refusedPeople.length} person(s) carry a refused total, so a share over the printable minutes would misstate the tax. The refusal is printed rather than the ratio.`;
  } else if (chargedMinutes < MATRIX_MEETING_LOAD_BOUNDS.taxFloorMinutes) {
    spanTaxRefusedReason = `Only ${chargedMinutes} recorded person-minute(s) in scope, below the declared floor of ${MATRIX_MEETING_LOAD_BOUNDS.taxFloorMinutes}.`;
  }

  const board = {
    forumsN: forumList.length,
    activeForumsN: forumList.filter((f) => f.status === 'active').length,
    retiredForumsN: forumList.filter((f) => f.status === 'retired').length,
    heldN: counted.heldInWindowN,
    cancelledN: counted.cancelledVisibleN,
    scheduledN: counted.scheduledInWindowN,
    outsideWindowN: counted.outsideWindowN,
    unreadableDayN: counted.unreadableDayN,
    withheldSittingsN: counted.withheldSittingsN,
    withheldAttendancesN: counted.withheldAttendancesN,
    refusedSittingsN,
    refusalCounts: Object.fromEntries(refusalList.map((r) => [r.key, r.sittingN])),
    attendeeSittingsN: sessionAttendeeSittings,
    sessionMinutes,
    chargedMinutes,
    printableMinutes,
    crossLineMinutes,
    homeMinutes,
    selfMinutes,
    lineMinutes,
    otherMinutes,
    refusedKnownMinutes,
    presentations: placementMinutesTotal,
    peopleN: personRows.length,
    measuredPeopleN,
    refusedPeopleN: refusedPeople.length,
    noAttendancePeopleN: noAttendance.length,
    peopleWithheldN: [...people.values()].filter((p) => p.outsideScope).length,
    spanTaxPermille,
    spanTaxRefusedReason,
    taxFloorMinutes: MATRIX_MEETING_LOAD_BOUNDS.taxFloorMinutes,
    taxFloorPeople: MATRIX_MEETING_LOAD_BOUNDS.taxFloorPeople,
    // TWO SEPARATE CLAIMS, never one reassuring word:
    //   minutesReconcile  every recorded minute was charged to exactly one
    //                     in-scope person row, and the two independently
    //                     accumulated totals agree;
    //   figuresComplete   every sitting in the window could be read and every
    //                     in-scope person's total is measured.
    minutesReconcile: sessionMinutes === chargedMinutes
      && chargedMinutes === (printableMinutes + refusedKnownMinutes)
      && sessionAttendeeSittings === personRows.reduce((acc, p) => acc + p.chargedSittingsN, 0),
    figuresComplete: refusedSittingsN === 0 && refusedPeople.length === 0,
    rowsOmittedN: Math.max(0, personRows.length - MATRIX_MEETING_LOAD_BOUNDS.rows),
    sessionsOmittedN,
  };

  // Compare each current additional line's declared share-days with the share
  // of that person's recorded meeting minutes chaired by the same line manager.
  // The parity claim is deliberately refused for partial-period line histories:
  // this ledger's sitting placement is a current-structure reading, so using it
  // as historical attribution would manufacture a time-travel hierarchy.
  const allocation = buildLinePeriodAllocation(state, { from: window.from, to: window.to, now: at, settings: cfg });
  const parityRows = [];
  const parityReasons = new Set();
  for (const allocPerson of allocation.persons || []) {
    const meetingPerson = personRows.find((row) => row.personId === allocPerson.personId);
    const uniqueManagers = new Map();
    for (const line of allocPerson.lines || []) {
      if (!line.managerId || line.state === 'out-of-scope-home' || !line.inWindow) continue;
      const existing = uniqueManagers.get(line.managerId) || [];
      existing.push(line);
      uniqueManagers.set(line.managerId, existing);
    }
    for (const [managerId, lines] of uniqueManagers) {
      const line = lines[0];
      const reasons = [];
      if (lines.length !== 1) reasons.push('More than one declaration for this person names the same manager; meeting minutes cannot be split between them.');
      if (line.state !== 'computed') reasons.push(line.reason || `The declared share is ${line.state}; no parity figure is supported.`);
      if (line.fromISO > window.from || (line.toISO && line.toISO < window.to)) reasons.push('The line was not in force for the whole requested period; sitting attribution is not projected across a changed reporting structure.');
      if (!meetingPerson || meetingPerson.state !== 'measured') reasons.push(meetingPerson?.reason || 'No complete measured meeting total supports the observed share.');
      const totalMinutes = meetingPerson?.minutes;
      const observedMinutes = meetingPerson?.lineManagerMinutes?.[managerId] ?? 0;
      if (meetingPerson?.state === 'measured' && totalMinutes < MATRIX_MEETING_LOAD_BOUNDS.taxFloorMinutes) {
        reasons.push(`The person has ${totalMinutes} recorded minute(s), below the declared ${MATRIX_MEETING_LOAD_BOUNDS.taxFloorMinutes}-minute comparison floor.`);
      }
      const valid = reasons.length === 0 && window.valid && Number.isInteger(line.shareDaysH);
      const declaredPermille = valid ? Math.round((line.shareDaysH * 10) / line.daysInWindow) : null;
      const observedPermille = valid ? permilleOf(observedMinutes, totalMinutes) : null;
      parityRows.push({
        personId: allocPerson.personId, personName: allocPerson.personName, managerId, managerName: line.managerName,
        declarationId: line.declarationId, declaredShareDaysH: valid ? line.shareDaysH : null,
        declaredDays: valid ? line.daysInWindow : null, declaredPermille,
        observedMinutes: valid ? observedMinutes : null, totalMinutes: valid ? totalMinutes : null, observedPermille,
        deltaPermille: valid ? observedPermille - declaredPermille : null,
        state: valid ? 'computed' : 'refused', reason: valid ? null : reasons.join(' '),
      });
    }
  }
  const parityBoard = {
    rowsN: parityRows.length,
    rowsOmittedN: Math.max(0, parityRows.length - MATRIX_MEETING_LOAD_BOUNDS.rows),
    computedN: parityRows.filter((row) => row.state === 'computed').length,
    refusedN: parityRows.filter((row) => row.state === 'refused').length,
    observedMinutes: parityRows.reduce((sum, row) => sum + (row.observedMinutes || 0), 0),
    printedObservedMinutes: parityRows.filter((row) => row.state === 'computed').reduce((sum, row) => sum + row.observedMinutes, 0),
    rowsReconcile: false,
    figuresComplete: parityRows.length > 0 && parityRows.length <= MATRIX_MEETING_LOAD_BOUNDS.rows
      && parityRows.every((row) => row.state === 'computed'),
  };
  parityBoard.rowsReconcile = parityBoard.computedN + parityBoard.refusedN === parityBoard.rowsN
    && parityBoard.printedObservedMinutes === parityRows.filter((row) => row.state === 'computed').reduce((sum, row) => sum + row.observedMinutes, 0);
  for (const row of parityRows) if (row.reason) parityReasons.add(row.reason);
  parityRows.sort((a, b) => (a.state === 'refused' ? -1 : 0) - (b.state === 'refused' ? -1 : 0)
    || Math.abs(b.deltaPermille || 0) - Math.abs(a.deltaPermille || 0)
    || String(a.personName).localeCompare(String(b.personName))
    || String(a.managerName).localeCompare(String(b.managerName)));

  const hasLines = matrix.lines.some((line) => line.role !== 'primary' && line.active !== false);
  const seatView = seat
    ? { id: seat.id, label: seat.label || seat.id, rank: seat.rank ?? null, fullAccess: Boolean(seat.fullAccess) }
    : { id: null, label: 'No operating seat', rank: null, fullAccess: false };

  return {
    engineVersion: MATRIX_MEETING_LOAD_ENGINE_VERSION,
    generatedOn: today,
    window,
    seat: seatView,
    scopeLabel,
    fullAccess,
    hasLines,
    isMatrix: hasLines,
    lineShareParity: { rows: parityRows.slice(0, MATRIX_MEETING_LOAD_BOUNDS.rows), board: parityBoard, reasons: [...parityReasons] },
    conventions: MATRIX_MEETING_LOAD_CONVENTIONS,
    method: MATRIX_MEETING_LOAD_METHOD,
    placements: MATRIX_MEETING_LOAD_PLACEMENTS,
    personStates: MATRIX_MEETING_LOAD_PERSON_STATES,
    sessionRefusals: refusalList,
    forums: forumList,
    chairs: chairRows,
    people: personRows.slice(0, MATRIX_MEETING_LOAD_BOUNDS.rows),
    board,
    singleChainNote: hasLines
      ? null
      : 'No second reporting line reaches this seat, so no meeting minute is attributed to a declared line. The burden itself is exact: every minute in a sitting chaired by someone other than the person’s own manager is printed as cross-line and charged to no line.',
    emptyNote: forumList.length
      ? null
      : 'No held sitting with a recorded duration lands in this window and this seat. Declare a forum on #/cadence and record each sitting with its minutes and who attended — this ledger reads what the sitting log proves and refuses everything else.',
  };
}

/* ------------------------------------------------------------------ brief */

/** The identity-free brief. Counts and claims only. */
export function matrixMeetingLoadBriefText(report) {
  if (!report) return '';
  const b = report.board;
  const w = report.window;
  const lines = [];
  lines.push(`Matrix meeting load — read from ${report.scopeLabel} on ${report.generatedOn} for the period ${w.from || '?'} to ${w.to || '?'}.`);
  if (!w.valid) {
    lines.push(`The period itself is refused: ${w.refuseReason}`);
    return lines.join(' ');
  }
  if (!b.forumsN && !b.heldN) {
    lines.push(report.emptyNote || 'No recorded sitting in scope.');
    return lines.join(' ');
  }
  lines.push(`${b.heldN} held sitting(s) across ${b.forumsN} forum(s) consumed ${b.chargedMinutes} recorded person-minute(s) in ${b.attendeeSittingsN} attendee-sitting(s); ${b.printableMinutes} of those can be printed as person totals and ${b.refusedKnownMinutes} belong to ${b.refusedPeopleN} person(s) whose totals are refused.`);
  lines.push(`Of the ${b.chargedMinutes} recorded person-minutes: ${b.crossLineMinutes} were convened by someone other than the person's home manager (cross-line), ${b.homeMinutes} by the home manager, ${b.selfMinutes} in the person's own forums. Of the cross-line minutes, ${b.lineMinutes} were chaired by a manager holding exactly one declared line and ${b.otherMinutes} by someone holding no declared line for the person.`);
  if (b.spanTaxPermille === null) {
    lines.push(`The span coordination-tax rate is REFUSED: ${b.spanTaxRefusedReason}`);
  } else {
    lines.push(`The span coordination-tax rate is ${b.spanTaxPermille} per-mille — ${b.crossLineMinutes} of ${b.chargedMinutes} recorded person-minutes convened outside the home line, over ${b.measuredPeopleN} measured person(s).`);
  }
  const parity = report.lineShareParity?.board;
  if (parity) lines.push(`Line meeting-share parity: ${parity.computedN} of ${parity.rowsN} line/person comparison(s) computed and ${parity.refusedN} refused; these compare each line’s declared share-days with the recorded meeting-minute share chaired by that manager, and are not a measure of work output.`);
  if (b.refusedSittingsN) {
    const parts = report.sessionRefusals.filter((r) => r.sittingN > 0).map((r) => `${r.sittingN} ${r.label.toLowerCase()}`);
    lines.push(`${b.refusedSittingsN} sitting(s) were refused rather than charged: ${parts.join(', ')}.`);
  }
  if (b.withheldSittingsN) {
    lines.push(`${b.withheldSittingsN} sitting(s) sit outside the acting seat's scope and are counted, not shown.`);
  }
  lines.push(`Minutes reconcile: ${b.minutesReconcile ? 'verified' : 'NOT verified — treat every figure here as unverified and report it'}. Figures complete: ${b.figuresComplete ? 'verified' : 'NOT verified'}.`);
  lines.push('This is a calendar reading, not a performance measure: no person is ranked on meeting volume, no forum is cancelled, and nothing in the workspace was changed by reading it.');
  return lines.join(' ');
}

/* -------------------------------------------------------------------- CSV */

/** Aggregate-only export: one summary row plus one row per forum kind. */
export function matrixMeetingLoadCsvRows(report) {
  if (!report) return [];
  const b = report.board;
  const w = report.window;
  const base = {
    period_from: w.from || '',
    period_to: w.to || '',
    period_days: w.valid ? w.days : '',
    tax_floor_minutes: b.taxFloorMinutes,
    tax_floor_people: b.taxFloorPeople,
  };
  const kinds = [...new Set(report.forums.map((f) => f.kind).filter(Boolean))].sort();
  const bucket = (kind) => {
    const forums = kind === null ? report.forums : report.forums.filter((f) => f.kind === kind);
    const sum = (key) => forums.reduce((acc, f) => acc + (isInt(f[key]) ? f[key] : 0), 0);
    const placement = (key) => forums.reduce((acc, f) => acc + (f.placementMinutes[key] || 0), 0);
    const isSummary = kind === null;
    const crossLine = isSummary ? b.crossLineMinutes : sum('crossLineMinutes');
    const personMinutes = isSummary ? b.chargedMinutes : sum('personMinutes');
    // A kind-level rate is only a slice of a span rate that the span itself is
    // entitled to publish. If the span rate is refused (too few measured people,
    // or an unreadable sitting anywhere in scope), the slice is refused too:
    // a tidy-looking denominator would hide the refusing sitting.
    const taxPermille = isSummary
      ? b.spanTaxPermille
      : b.spanTaxPermille !== null && personMinutes > 0
        ? permilleOf(crossLine, personMinutes)
        : null;
    return {
      ...base,
      scope: isSummary ? 'workspace' : 'forum-kind',
      forum_kind: isSummary ? 'all' : kind,
      forums_n: forums.length,
      active_forums_n: forums.filter((f) => f.status === 'active').length,
      retired_forums_n: forums.filter((f) => f.status === 'retired').length,
      // The workspace row counts EVERY held sitting in scope, including the ones
      // that could not be read: those carry no forum row, so the per-kind rows
      // sum to (held_n − refused sittings), and the refusal columns say exactly
      // how many are missing. The difference is auditable, never hidden.
      sittings_n: isSummary ? b.heldN + b.cancelledN : sum('heldN') + sum('cancelledN'),
      held_n: isSummary ? b.heldN : sum('heldN'),
      cancelled_n: isSummary ? b.cancelledN : sum('cancelledN'),
      sittings_no_minutes_n: isSummary ? b.refusalCounts['no-minutes'] || 0 : '',
      sittings_no_attendees_n: isSummary ? b.refusalCounts['no-attendees'] || 0 : '',
      sittings_unknown_attendee_n: isSummary ? b.refusalCounts['unknown-attendee'] || 0 : '',
      sittings_no_forum_n: isSummary ? b.refusalCounts['no-forum'] || 0 : '',
      sittings_outside_window_n: isSummary ? b.outsideWindowN : '',
      person_minutes: personMinutes,
      cross_line_minutes: crossLine,
      home_minutes: isSummary ? b.homeMinutes : placement('home'),
      line_minutes: isSummary ? b.lineMinutes : placement('line'),
      other_minutes: isSummary ? b.otherMinutes : placement('other'),
      self_minutes: isSummary ? b.selfMinutes : placement('self'),
      attendee_sittings_n: isSummary ? b.attendeeSittingsN : sum('attendeeSittingsN'),
      people_n: isSummary ? b.peopleN : '',
      people_measured_n: isSummary ? b.measuredPeopleN : '',
      people_refused_n: isSummary ? b.refusedPeopleN : '',
      people_no_attendance_n: isSummary ? b.noAttendancePeopleN : '',
      people_withheld_n: isSummary ? b.peopleWithheldN : '',
      coordination_tax_permille: taxPermille === null ? '' : taxPermille,
      tax_withheld: taxPermille === null,
      withheld_reason: taxPermille === null
        ? (isSummary
          ? b.spanTaxRefusedReason || ''
          : 'No rate is published for this forum kind: the declared floor or a refusing sitting blocks it. Counts are still printed.')
        : '',
      minutes_reconcile: isSummary ? b.minutesReconcile : '',
      figures_complete: isSummary ? b.figuresComplete : b.figuresComplete,
      line_parity_rows_n: isSummary ? report.lineShareParity?.board.rowsN ?? 0 : '',
      line_parity_rows_omitted_n: isSummary ? report.lineShareParity?.board.rowsOmittedN ?? 0 : '',
      line_parity_computed_n: isSummary ? report.lineShareParity?.board.computedN ?? 0 : '',
      line_parity_refused_n: isSummary ? report.lineShareParity?.board.refusedN ?? 0 : '',
      line_parity_rows_reconcile: isSummary ? report.lineShareParity?.board.rowsReconcile ?? false : '',
      line_parity_figures_complete: isSummary ? report.lineShareParity?.board.figuresComplete ?? false : '',
    };
  };
  return [bucket(null), ...kinds.map((kind) => bucket(kind))];
}
