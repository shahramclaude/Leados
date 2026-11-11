/**
 * app/core/domain/lineHorizon.js — the Matrix Forward Allocation Horizon
 * (ADR-0179, Schema v143 unchanged, `#/matrix?panel=horizon`, CSV scope #134).
 *
 * A pure read model. It stores nothing and it is not a second allocation
 * engine: the declared line set can only change on a day a line starts or on
 * the day after one ends, so `buildMatrix` + `matrixAllocations` — the exact
 * functions behind the live ledger — are evaluated once per such day, and every
 * figure here is an integer sum over those evaluations. The first evaluation is
 * today, so the first figures are the live ledger's figures by construction.
 *
 * WHY EVALUATING A FUTURE DAY IS SOUND HERE (and a past day was not)
 * -----------------------------------------------------------------
 * `buildMatrix` reads three things: the roster, the settings and the dated
 * declarations. Only the declarations carry dates. A PAST day would pair old
 * declarations with today's home pointers, which have moved — that is why the
 * as-of read was withdrawn (Session 207). A FUTURE day pairs the declarations
 * already on record with today's roster, and "today's roster, continuing" is a
 * declared convention of this reading, printed on the panel. Nothing is
 * projected: no share is ramped, no hire is assumed, no line is renewed.
 */

import { addDays, dayKey, daysBetween, weekStart } from '../time.js';
import { LEADER_ID } from './chain.js';
import { activeSeat, buildSeats } from './seat.js';
import {
  buildMatrix, formatDeltaH, formatShareH, matrixAllocations, matrixJointApex, matrixLineScope,
} from './matrix.js';
import { MATRIX_FLOORS, MATRIX_SHARE_STATES, matrixLineKind } from './matrixRegistry.js';
import { normalizeMatrixSettings } from './matrixSchema.js';
import {
  LINE_HORIZON_BOUNDS,
  LINE_HORIZON_CONVENTIONS,
  LINE_HORIZON_ENGINE_VERSION,
  LINE_HORIZON_FULL_H,
  LINE_HORIZON_LIMITS,
  LINE_HORIZON_LIMITS_TEXT,
  LINE_HORIZON_METHOD,
  LINE_HORIZON_OWNER_STATE_KEYS,
  LINE_HORIZON_RULE_ID,
  LINE_HORIZON_VERDICTS,
  LINE_HORIZON_VERDICT_KEYS,
  lineHorizonEventKind,
  lineHorizonOutcome,
  lineHorizonVerdict,
} from './lineHorizonRegistry.js';

const S = MATRIX_SHARE_STATES;
const FULL = LINE_HORIZON_FULL_H;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const STATE_KEYS = Object.freeze([S.balanced, S.over, S.under, S.undeclared]);
const EXPOSED = new Set([S.over, S.under, S.undeclared]);
const STATE_LABELS = Object.freeze({
  [S.balanced]: 'Balanced',
  [S.over]: 'Over-committed',
  [S.under]: 'Under-allocated',
  [S.undeclared]: 'Split unknown',
});
const VERDICT_OF_AHEAD = Object.freeze({
  [S.over]: 'double-booked-ahead',
  [S.undeclared]: 'split-unknown-ahead',
  [S.under]: 'unallocated-ahead',
});

const isoDay = (value) => (typeof value === 'string' && ISO_DAY.test(value) ? value : null);
const noon = (iso) => new Date(`${iso}T12:00:00.000Z`);
const zeroStates = () => Object.fromEntries(STATE_KEYS.map((key) => [key, 0]));

export function lineHorizonStateLabel(state) {
  return STATE_LABELS[state] || String(state || '');
}

/** Share-days (hundredths × days) as exact person-days. Two decimals, no rounding. */
export function formatPersonDays(shareDaysH) {
  return Number.isInteger(shareDaysH) ? formatShareH(shareDaysH) : null;
}

/* ------------------------------------------------------- exposure provenance */

/**
 * The exact sentence RULE-LHZ-01 writes on the typed edge from a person to the
 * ask it issued about them. It is the durable identity of an exposure — a typed
 * edge outlives the capped marker ledger — and it is compared for equality or
 * parsed by the one pattern below, never matched loosely.
 */
export function lineHorizonExposureSummary(state, fromISO) {
  return `Forward allocation exposure: ${state} from ${fromISO}.`;
}

const EXPOSURE_SUMMARY = new RegExp(`^Forward allocation exposure: (${[S.over, S.under, S.undeclared].join('|')}) from (\\d{4}-\\d{2}-\\d{2})\\.$`);

export function parseLineHorizonExposureSummary(summary) {
  const match = EXPOSURE_SUMMARY.exec(String(summary || ''));
  return match ? { state: match[1], fromISO: match[2] } : null;
}

/* -------------------------------------------------------------- the window */

/**
 * Resolve the horizon: `weeks` ISO calendar weeks starting with the one that
 * contains today. The first bucket runs from today to this Sunday. A value
 * outside the declared bounds is REFUSED, never clamped.
 */
export function resolveLineHorizon(now, weeksInput = null) {
  const bounds = LINE_HORIZON_BOUNDS.weeks;
  const today = dayKey(now);
  const refused = (refuseReason) => ({
    valid: false, refuseReason, weeks: null, source: 'refused', from: today, to: null, days: 0, buckets: [],
  });
  if (!today) return refused('The clock could not be read as a calendar day, so no horizon was built.');
  let weeks = bounds.fallback;
  let source = 'default';
  if (weeksInput !== null && weeksInput !== undefined && weeksInput !== '') {
    const text = String(weeksInput).trim();
    const value = typeof weeksInput === 'number' ? weeksInput : (/^\d{1,3}$/.test(text) ? Number(text) : NaN);
    if (!Number.isInteger(value) || value < bounds.min || value > bounds.max) {
      return refused(`A horizon is a whole number of weeks from ${bounds.min} to ${bounds.max}. “${text.slice(0, 24)}” is not one. Nothing was clamped and no other horizon was read in its place.`);
    }
    weeks = value;
    source = 'named';
  }
  const monday = weekStart(today);
  const buckets = [];
  let from = today;
  for (let i = 0; i < weeks; i += 1) {
    const to = i === 0 ? addDays(monday, 6) : addDays(from, 6);
    buckets.push({ index: i + 1, from, to, days: daysBetween(from, to) + 1, partial: i === 0 && from !== monday });
    from = addDays(to, 1);
  }
  const to = buckets[buckets.length - 1].to;
  return { valid: true, refuseReason: '', weeks, source, from: today, to, days: daysBetween(today, to) + 1, buckets };
}

/* --------------------------------------------------------------- the sweep */

function compactAllocation(allocation, refusedN) {
  const lines = allocation.lines.map((line) => ({
    lineId: line.lineId,
    declarationId: line.declarationId || null,
    managerId: line.managerId,
    role: line.role,
    kind: line.kind,
    shareH: Number.isInteger(line.shareH) ? line.shareH : null,
    declaredShareH: Number.isInteger(line.declaredShareH) ? line.declaredShareH : null,
    fromISO: line.fromISO || null,
    toISO: line.toISO || null,
  }));
  const sig = [
    allocation.shareState, allocation.totalH, refusedN,
    ...lines.map((l) => [l.lineId, l.declarationId, l.managerId, l.shareH, l.declaredShareH, l.fromISO, l.toISO].join(':')),
  ].join('|');
  return {
    state: allocation.shareState,
    totalH: Number.isInteger(allocation.totalH) ? allocation.totalH : null,
    lineN: allocation.lineN,
    shareSource: allocation.shareSource,
    refusedN,
    lines,
    sig,
  };
}

/**
 * Who a forward exposure is put in front of — decided on the first exposed day,
 * from that day's graph, and never by choosing among several managers.
 *
 *   over-committed   every manager holding a line that day created it together,
 *                    so it belongs to the lowest seat above all of them;
 *   split unknown    the lines carrying no declared share are the ones that
 *                    must speak, so it belongs to the lowest seat above them
 *                    (one line: that line's own manager);
 *   under-allocated  the remainder falls back to the home line, whose manager
 *                    is unique by construction.
 */
function resolveOwner(matrix, allocation) {
  let ids;
  if (allocation.state === S.under) {
    const home = allocation.lines.find((line) => line.role === 'primary');
    ids = home ? [home.managerId] : allocation.lines.map((line) => line.managerId);
  } else if (allocation.state === S.undeclared) {
    ids = allocation.lines.filter((line) => line.declaredShareH === null).map((line) => line.managerId);
  } else {
    ids = allocation.lines.map((line) => line.managerId);
  }
  const managerIds = [...new Set(ids)].sort();
  if (!managerIds.length) return { state: 'ambiguous', id: null, managerIds };
  const apex = matrixJointApex(matrix, managerIds);
  if (apex.isLeaderOnly) return { state: 'leader-held', id: LEADER_ID, managerIds };
  if (apex.unique && apex.apexId) {
    return { state: matrix.roster.has(apex.apexId) ? 'unique' : 'off-roster', id: apex.apexId, managerIds };
  }
  return { state: 'ambiguous', id: null, managerIds };
}

/**
 * Evaluate the live engine once per day on which the declared line set can
 * change, over the WHOLE workspace. Seat scoping is applied by the caller.
 */
function sweep(state, { now, settings, endISO }) {
  const today = dayKey(now);
  const rawLines = (Array.isArray(state?.reportingLines) ? state.reportingLines : [])
    .filter((row) => row && typeof row === 'object');
  const rawById = new Map(rawLines.filter((row) => row.id).map((row) => [row.id, row]));

  const boundary = new Set();
  const mark = (day) => { if (day && day > today && day <= endISO) boundary.add(day); };
  for (const row of rawLines) {
    const from = isoDay(row.fromISO);
    const to = isoDay(row.toISO);
    mark(from);
    if (to) mark(addDays(to, 1));
    // A declaration that ends before it starts names two days and no window.
    // It is refused on every day between them (see `inForce`), so those two
    // days bound a segment as well.
    if (from && to && to < from) { mark(to); mark(addDays(from, 1)); }
  }
  const starts = [today, ...[...boundary].sort()];
  if (starts.length > LINE_HORIZON_LIMITS.segments) {
    return {
      refused: true,
      refuseReason: `The declared line set changes on ${starts.length - 1} separate day(s) inside this horizon, and the reading evaluates the ledger on at most ${LINE_HORIZON_LIMITS.segments}. The horizon is REFUSED rather than read over part of it; name a shorter one.`,
    };
  }
  const segments = starts.map((from, index) => {
    const to = index + 1 < starts.length ? addDays(starts[index + 1], -1) : endISO;
    return { index, from, to, days: daysBetween(from, to) + 1 };
  });

  const people = new Map();
  const names = new Map();
  const refusedLines = new Map();
  let todayMatrix = null;

  for (const segment of segments) {
    const matrix = buildMatrix(state, { now: segment.index === 0 ? now : noon(segment.from), settings });
    if (segment.index === 0) {
      todayMatrix = matrix;
      for (const [id, node] of matrix.nodes) names.set(id, node.name || id);
    }
    const inForce = (row) => {
      const from = isoDay(row.fromISO);
      const to = isoDay(row.toISO);
      if (!from) return false;
      // Reversed dates: nobody can say which days were meant, so the row is
      // treated as touching every day between the two it names. It can only
      // ever be REFUSED on those days — the ledger never wires it.
      if (to && to < from) return to <= segment.from && segment.from <= from;
      return from <= segment.from && (!to || to >= segment.from);
    };
    const allocations = matrixAllocations(matrix);

    /* Lines the engine does NOT read on this day although they are inside
       their dated window: refused by name (a defect), or silently unwired. A
       refused row outside its window is not this day's problem. */
    const refusedByPerson = new Map();
    const noteRefused = (lineKey, defect, detail, personId, managerId, kind, row) => {
      const key = `${lineKey}|${defect}`;
      const entry = refusedLines.get(key) || {
        key, lineId: row?.id || null, defect, detail, personId, managerId, kind,
        fromISO: isoDay(row?.fromISO), toISO: isoDay(row?.toISO),
        firstDay: segment.from, lastDay: segment.to, days: 0,
        personOnRoster: matrix.roster.has(personId),
      };
      entry.lastDay = segment.to;
      entry.days += segment.days;
      refusedLines.set(key, entry);
      if (matrix.roster.has(personId)) refusedByPerson.set(personId, (refusedByPerson.get(personId) || 0) + 1);
    };
    const defectIds = new Set();
    for (const defect of matrix.defects || []) {
      if (defect.lineId) defectIds.add(defect.lineId);
      const row = defect.lineId ? rawById.get(defect.lineId) : null;
      if (defect.lineId && (!row || !inForce(row))) continue;
      noteRefused(defect.lineId || `home:${defect.personId}`, defect.defect, defect.detail, defect.personId, defect.managerId, defect.kind, row);
    }
    const readIds = new Set();
    const managersOf = new Map();
    for (const allocation of allocations) {
      managersOf.set(allocation.personId, new Set(allocation.lines.map((line) => line.managerId)));
      for (const line of allocation.lines) if (line.declarationId) readIds.add(line.declarationId);
    }
    for (const row of rawLines) {
      if (!row.id || readIds.has(row.id) || defectIds.has(row.id) || !inForce(row)) continue;
      const sameManager = managersOf.get(row.personId)?.has(row.managerId);
      noteRefused(row.id, 'not-read', sameManager
        ? 'This declaration is inside its dated window and the ledger does not read it: the person already holds a line to the same manager, and one line per person and manager is wired.'
        : 'This declaration is inside its dated window and the ledger does not read it on this day.',
      row.personId, row.managerId, row.kind, row);
    }

    for (const allocation of allocations) {
      let person = people.get(allocation.personId);
      if (!person) {
        person = { personId: allocation.personId, name: allocation.name, segs: [], owners: new Map() };
        people.set(allocation.personId, person);
      }
      const fresh = compactAllocation(allocation, refusedByPerson.get(allocation.personId) || 0);
      const previous = person.segs.length ? person.segs[person.segs.length - 1] : null;
      // Structural sharing: an unchanged allocation is the same object, so a
      // long horizon costs memory in proportion to what actually changes.
      const current = previous && previous.sig === fresh.sig ? previous : fresh;
      person.segs.push(current);
      if (segment.index > 0 && previous && EXPOSED.has(current.state) && previous.state !== current.state) {
        person.owners.set(segment.index, resolveOwner(matrix, current));
      }
    }
  }

  for (const person of people.values()) derivePerson(person, segments);

  return {
    refused: false, refuseReason: '', today, endISO, segments, people, names, todayMatrix,
    refusedLines: [...refusedLines.values()].sort((a, b) => a.firstDay.localeCompare(b.firstDay) || a.key.localeCompare(b.key)),
  };
}

/** Runs, dated events, forward exposures and the one verdict, for one person. */
function derivePerson(person, segments) {
  const runs = [];
  const events = [];
  const returns = [];
  let flipN = 0;

  person.segs.forEach((allocation, index) => {
    const segment = segments[index];
    const last = runs[runs.length - 1];
    if (last && last.state === allocation.state) {
      last.to = segment.to;
      last.days += segment.days;
      if (allocation.totalH !== null) {
        last.minTotalH = last.minTotalH === null ? allocation.totalH : Math.min(last.minTotalH, allocation.totalH);
        last.maxTotalH = last.maxTotalH === null ? allocation.totalH : Math.max(last.maxTotalH, allocation.totalH);
      }
    } else {
      runs.push({
        state: allocation.state, fromIndex: index, from: segment.from, to: segment.to, days: segment.days,
        minTotalH: allocation.totalH, maxTotalH: allocation.totalH, first: allocation,
      });
    }
    if (index === 0) return;
    const previous = person.segs[index - 1];
    if (previous === allocation) return;

    const outcomeFor = (kind) => {
      if (allocation.state !== S.balanced) return allocation.state;
      const backHome = kind === 'roll-off' && allocation.lineN === 1 && allocation.lines[0]?.role === 'primary';
      return backHome ? 'returns-to-home' : 'balanced';
    };
    const push = (kind, line) => events.push({
      day: segment.from, segmentIndex: index, kind, line,
      outcome: outcomeFor(kind), totalAfterH: allocation.totalH, lineNAfter: allocation.lineN,
    });
    const before = new Map(previous.lines.map((line) => [line.lineId, line]));
    const after = new Map(allocation.lines.map((line) => [line.lineId, line]));
    for (const [lineId, line] of before) {
      if (line.role === 'primary' || after.has(lineId)) continue;
      // Only a line's OWN last day is a roll-off. The ledger can also stop
      // wiring a line because another line's dates closed a loop; that is
      // counted apart and never dressed up as an agreed end.
      if (line.toISO && addDays(line.toISO, 1) === segment.from) push('roll-off', line); else flipN += 1;
    }
    for (const [lineId, line] of after) {
      if (line.role === 'primary' || before.has(lineId)) continue;
      if (line.fromISO === segment.from) push('roll-on', line); else flipN += 1;
    }
    const homeBefore = previous.lines.find((line) => line.role === 'primary') || null;
    const homeAfter = allocation.lines.find((line) => line.role === 'primary') || null;
    if (homeBefore && homeAfter && homeBefore.declarationId !== homeAfter.declarationId) {
      if (homeBefore.declarationId) {
        if (homeBefore.toISO && addDays(homeBefore.toISO, 1) === segment.from) push('home-share-end', homeBefore); else flipN += 1;
      }
      if (homeAfter.declarationId) {
        if (homeAfter.fromISO === segment.from) push('home-share-start', homeAfter); else flipN += 1;
      }
    }
    // A return is a transition of the PERSON, not of a line: two lines ending
    // on one day hand one person back, once.
    if (previous.lineN >= 2 && allocation.lineN === 1 && allocation.lines[0]?.role === 'primary') {
      returns.push({ day: segment.from, managerId: allocation.lines[0].managerId, whole: allocation.state === S.balanced });
    }
  });

  const exposures = runs
    .filter((run) => run.fromIndex > 0 && EXPOSED.has(run.state))
    .map((run) => ({
      key: `${person.personId}|${run.state}|${run.from}`,
      personId: person.personId,
      state: run.state,
      from: run.from,
      to: run.to,
      days: run.days,
      totalH: run.first.totalH,
      lines: run.first.lines,
      owner: person.owners.get(run.fromIndex) || { state: 'ambiguous', id: null, managerIds: [] },
    }));

  const ahead = new Set(exposures.map((exposure) => exposure.state));
  let verdict = 'steady';
  if (ahead.has(S.over)) verdict = VERDICT_OF_AHEAD[S.over];
  else if (ahead.has(S.undeclared)) verdict = VERDICT_OF_AHEAD[S.undeclared];
  else if (ahead.has(S.under)) verdict = VERDICT_OF_AHEAD[S.under];
  else if (EXPOSED.has(person.segs[0].state)) verdict = 'exposed-now';
  else if (events.length || flipN) verdict = 'changes-ahead';

  person.runs = runs;
  person.events = events;
  person.returns = returns;
  person.flipN = flipN;
  person.exposures = exposures;
  person.verdict = verdict;
}

/**
 * The forward exposures of the whole workspace up to `endISO`, for the rule.
 * Reads only `people`, `reportingLines` and `settings` — the same three keys
 * `buildMatrix` reads — so a caller holding a copy-on-write draft copies three
 * collections, not the workspace.
 */
export function lineHorizonExposures(state, { now = new Date(), settings = null, endISO = null } = {}) {
  const today = dayKey(now);
  const end = isoDay(endISO) && endISO >= today ? endISO : today;
  const core = sweep(state, { now, settings: settings || state?.settings || null, endISO: end });
  if (core.refused) return { ok: false, refuseReason: core.refuseReason, today, endISO: end, exposures: [], stateOn: () => null, matrix: null };
  const exposures = [];
  for (const person of core.people.values()) {
    for (const exposure of person.exposures) exposures.push({ ...exposure, personName: person.name });
  }
  exposures.sort((a, b) => a.from.localeCompare(b.from) || a.key.localeCompare(b.key));
  /** The ledger's state for one person on one day inside the swept window. */
  const stateOn = (personId, day) => {
    const person = core.people.get(personId);
    if (!person || !isoDay(day) || day < today || day > end) return null;
    const index = core.segments.findIndex((segment) => segment.from <= day && day <= segment.to);
    return index >= 0 ? person.segs[index].state : null;
  };
  return { ok: true, refuseReason: '', today, endISO: end, exposures, stateOn, matrix: core.todayMatrix };
}

/* -------------------------------------------------------------- the report */

function scopeLabelFor(seat) {
  return !seat || seat.fullAccess ? 'the whole workspace' : `${seat.label || seat.id}’s span and its declared lines`;
}

function emptyBoard() {
  const verdicts = Object.fromEntries(LINE_HORIZON_VERDICT_KEYS.map((key) => [key, 0]));
  return {
    peopleN: 0, verdicts, verdictsReconcile: true,
    personDaysN: 0, statePersonDays: zeroStates(), personDaysReconcile: true,
    todayStates: zeroStates(), lastDayStates: zeroStates(),
    readingComplete: true, withheldReason: '',
    undeclaredPersonDaysN: 0, refusedLinePersonDaysN: 0,
    attributedShareDaysH: 0, capacityShareDaysH: 0, overShareDaysH: 0, unallocatedShareDaysH: 0, driftShareDaysH: 0,
    shareDaysReconcile: true, fanOutShareDaysH: 0, fanOutReconcile: true, weeksReconcile: true,
    statePeople: zeroStates(),
    rollOffN: 0, rollOnN: 0, homeShareChangeN: 0, returnsToHomeN: 0, returnsWholeN: 0,
    additionalLineN: 0, openEndedLineN: 0, refusedLineN: 0, engineFlipN: 0,
    exposureN: 0, segmentN: 0,
  };
}

function emptyAsks(leadWindowDays, autoPropagate) {
  return {
    leadWindowDays, autoPropagate, insideLeadWindowN: 0,
    owners: Object.fromEntries(LINE_HORIZON_OWNER_STATE_KEYS.map((key) => [key, 0])),
    ownersReconcile: true, openN: 0, answeredN: 0, notIssuedN: 0,
  };
}

/**
 * Build the seat-scoped forward reading.
 *
 * @param {object} state  normalized workspace
 * @param {{ now?: Date, settings?: object|null, weeks?: number|string|null }} opts
 */
export function buildLineHorizon(state, { now = new Date(), settings = null, weeks = null } = {}) {
  const effective = settings || state?.settings || null;
  const conv = normalizeMatrixSettings(effective || {});
  const window = resolveLineHorizon(now, weeks);
  const today = dayKey(now);
  const leadWindowDays = conv.matrixExpiringDays;
  const base = {
    engineVersion: LINE_HORIZON_ENGINE_VERSION,
    generatedOn: today,
    today,
    window,
    conventions: {
      balanceHundredths: conv.matrixBalanceHundredths,
      leadWindowDays,
      autoPropagate: conv.matrixAutoPropagate,
      weeksMin: LINE_HORIZON_BOUNDS.weeks.min,
      weeksMax: LINE_HORIZON_BOUNDS.weeks.max,
      weeksDefault: LINE_HORIZON_BOUNDS.weeks.fallback,
      detailRank: MATRIX_FLOORS.detailRank,
    },
    conventionRows: LINE_HORIZON_CONVENTIONS,
    method: LINE_HORIZON_METHOD,
    limitsText: LINE_HORIZON_LIMITS_TEXT,
    verdictDefs: LINE_HORIZON_VERDICTS,
    limits: LINE_HORIZON_LIMITS,
    seat: { id: null, label: 'Undeclared operator view', rank: null, fullAccess: true },
    scope: 'workspace',
    scopeLabel: 'the whole workspace',
    managerNamesWithheld: false,
    isMatrix: false,
    singleChainNote: '',
    board: emptyBoard(),
    weeks: [],
    people: [], peopleAllN: 0, peopleRemainderN: 0,
    events: [], eventsAllN: 0, eventsRemainderN: 0,
    managers: [], managersAllN: 0, managersRemainderN: 0,
    exposures: [], exposuresAllN: 0, exposuresRemainderN: 0,
    incoming: [], incomingAllN: 0, incomingRemainderN: 0,
    refusedLines: [], refusedLinesAllN: 0, refusedLinesRemainderN: 0,
    asks: emptyAsks(leadWindowDays, conv.matrixAutoPropagate),
  };
  if (!window.valid) return base;

  const core = sweep(state, { now, settings: effective, endISO: window.to });
  if (core.refused) {
    return { ...base, window: { ...window, valid: false, refuseReason: core.refuseReason, buckets: [] } };
  }

  /* The seat. Scope is TODAY's wall — the tree span plus the lines in force
     today — exactly as the live ledger draws it, so the two pages count the
     same people. A line that has not started does not move the wall. */
  const lineScope = matrixLineScope(core.todayMatrix);
  const built = buildSeats(state, { now, settings: effective, lineScope: lineScope.byManager });
  const seat = activeSeat(built);
  const scope = seat?.fullAccess ? null : new Set([...(seat?.scope || []), ...(seat?.lineScope || [])]);
  const inScope = (personId) => !scope || scope.has(personId);
  const managerNamesWithheld = Boolean(seat) && !seat.fullAccess && Number(seat.rank) >= MATRIX_FLOORS.detailRank;
  const nameOf = (id) => core.names.get(id) || id;
  const managerName = (id) => (managerNamesWithheld ? null : nameOf(id));

  const buckets = window.buckets;
  const segments = core.segments;
  const lastIndex = segments.length - 1;
  const segBuckets = segments.map((segment) => {
    const out = [];
    buckets.forEach((bucket, bi) => {
      const from = segment.from > bucket.from ? segment.from : bucket.from;
      const to = segment.to < bucket.to ? segment.to : bucket.to;
      if (from <= to) out.push({ bi, days: daysBetween(from, to) + 1 });
    });
    return out;
  });
  const bucketOf = (day) => buckets.findIndex((bucket) => bucket.from <= day && day <= bucket.to);

  const weekAcc = buckets.map((bucket) => ({
    ...bucket,
    personDaysN: 0, statePersonDays: zeroStates(),
    statePeople: { [S.over]: new Set(), [S.under]: new Set(), [S.undeclared]: new Set() },
    undeclaredPersonDaysN: 0, refusedLinePersonDaysN: 0,
    attributedH: 0, capacityH: 0, overH: 0, underH: 0, driftH: 0,
    rollOffN: 0, rollOnN: 0, homeShareChangeN: 0, returnsToHomeN: 0,
  }));
  const managerAcc = new Map();
  const managerOf = (managerId) => {
    let entry = managerAcc.get(managerId);
    if (!entry) {
      entry = {
        managerId,
        weeks: buckets.map(() => ({ shareDaysH: 0, unresolvedPersonDaysN: 0 })),
        today: { people: new Set(), shareH: 0, unresolvedN: 0 },
        last: { people: new Set(), shareH: 0, unresolvedN: 0 },
        rollOnN: 0, rollOffN: 0, returnsN: 0,
      };
      managerAcc.set(managerId, entry);
    }
    return entry;
  };

  const peopleRows = [];
  const eventRows = [];
  const exposureRows = [];
  const board = emptyBoard();
  const additionalLines = new Set();
  const openEndedLines = new Set();

  /* The asks RULE-LHZ-01 issued, read back from the typed graph. */
  const asksByPerson = new Map();
  const delegationById = new Map((Array.isArray(state?.delegations) ? state.delegations : []).map((d) => [d.id, d]));
  for (const link of Array.isArray(state?.links) ? state.links : []) {
    if (!link || link.ruleId !== LINE_HORIZON_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const list = asksByPerson.get(link.sourceId) || [];
    list.push({ summary: link.summary, task: delegationById.get(link.targetId) || null });
    asksByPerson.set(link.sourceId, list);
  }
  const askFor = (exposure) => {
    const wanted = lineHorizonExposureSummary(exposure.state, exposure.from);
    const tasks = (asksByPerson.get(exposure.personId) || []).filter((ask) => ask.summary === wanted && ask.task);
    const open = tasks.find((ask) => ask.task.status === 'active');
    if (open) return { state: 'open', dueOn: open.task.dueOn || null };
    if (tasks.length) return { state: 'answered', dueOn: null };
    return { state: 'none', dueOn: null };
  };
  const leadEnd = addDays(today, leadWindowDays);
  const asks = emptyAsks(leadWindowDays, conv.matrixAutoPropagate);

  for (const person of core.people.values()) {
    if (!inScope(person.personId)) continue;
    board.peopleN += 1;
    board.verdicts[person.verdict] += 1;
    board.engineFlipN += person.flipN;
    board.todayStates[person.segs[0].state] += 1;
    board.lastDayStates[person.segs[lastIndex].state] += 1;

    const own = { stateDays: zeroStates(), attributedH: 0, overH: 0, underH: 0, unattributableDaysN: 0 };
    person.segs.forEach((allocation, index) => {
      const attributable = allocation.totalH !== null && allocation.refusedN === 0;
      const segment = segments[index];
      own.stateDays[allocation.state] += segment.days;
      if (!attributable) own.unattributableDaysN += segment.days;
      else {
        own.attributedH += allocation.totalH * segment.days;
        if (allocation.state === S.over) own.overH += (allocation.totalH - FULL) * segment.days;
        if (allocation.state === S.under) own.underH += (FULL - allocation.totalH) * segment.days;
      }
      for (const line of allocation.lines) {
        if (line.role === 'primary') continue;
        additionalLines.add(line.lineId);
        if (!line.toISO) openEndedLines.add(line.lineId);
      }
      for (const { bi, days } of segBuckets[index]) {
        const week = weekAcc[bi];
        week.personDaysN += days;
        week.statePersonDays[allocation.state] += days;
        if (week.statePeople[allocation.state]) week.statePeople[allocation.state].add(person.personId);
        if (!attributable) {
          if (allocation.totalH === null) week.undeclaredPersonDaysN += days; else week.refusedLinePersonDaysN += days;
        } else {
          week.attributedH += allocation.totalH * days;
          week.capacityH += FULL * days;
          if (allocation.state === S.over) week.overH += (allocation.totalH - FULL) * days;
          else if (allocation.state === S.under) week.underH += (FULL - allocation.totalH) * days;
          else week.driftH += (allocation.totalH - FULL) * days;
        }
        for (const line of allocation.lines) {
          const slot = managerOf(line.managerId).weeks[bi];
          if (attributable && line.shareH !== null) slot.shareDaysH += line.shareH * days;
          else slot.unresolvedPersonDaysN += days;
        }
      }
      for (const [edge, at] of [[0, 'today'], [lastIndex, 'last']]) {
        if (index !== edge) continue;
        for (const line of allocation.lines) {
          const snapshot = managerOf(line.managerId)[at];
          snapshot.people.add(person.personId);
          if (attributable && line.shareH !== null) snapshot.shareH += line.shareH; else snapshot.unresolvedN += 1;
        }
      }
    });

    // Distinct people who are in a state on at least one day of the horizon.
    for (const key of STATE_KEYS) if (own.stateDays[key] > 0) board.statePeople[key] += 1;

    for (const event of person.events) {
      const bi = bucketOf(event.day);
      const kind = lineHorizonEventKind(event.kind);
      const outcome = lineHorizonOutcome(event.outcome);
      if (event.kind === 'roll-off') { board.rollOffN += 1; weekAcc[bi].rollOffN += 1; managerOf(event.line.managerId).rollOffN += 1; }
      else if (event.kind === 'roll-on') { board.rollOnN += 1; weekAcc[bi].rollOnN += 1; managerOf(event.line.managerId).rollOnN += 1; }
      else { board.homeShareChangeN += 1; weekAcc[bi].homeShareChangeN += 1; }
      eventRows.push({
        day: event.day,
        daysUntil: daysBetween(today, event.day),
        weekIndex: buckets[bi].index,
        kind: event.kind,
        kindLabel: kind?.label || event.kind,
        personId: person.personId,
        personName: person.name,
        managerId: managerNamesWithheld ? null : event.line.managerId,
        managerName: managerName(event.line.managerId),
        lineKind: event.line.kind,
        lineKindLabel: matrixLineKind(event.line.kind)?.label || event.line.kind,
        declaredShareH: event.line.declaredShareH,
        shareDisplay: formatShareH(event.line.declaredShareH),
        lastDay: event.kind === 'roll-off' || event.kind === 'home-share-end' ? event.line.toISO : null,
        outcome: event.outcome,
        outcomeLabel: outcome?.label || event.outcome,
        outcomeTone: outcome?.tone || 'neutral',
        totalAfterH: event.totalAfterH,
        totalAfterDisplay: formatShareH(event.totalAfterH),
        lineNAfter: event.lineNAfter,
      });
    }
    for (const back of person.returns) {
      board.returnsToHomeN += 1;
      if (back.whole) board.returnsWholeN += 1;
      weekAcc[bucketOf(back.day)].returnsToHomeN += 1;
      managerOf(back.managerId).returnsN += 1;
    }

    for (const exposure of person.exposures) {
      const insideLeadWindow = exposure.from <= leadEnd;
      const ask = askFor(exposure);
      if (insideLeadWindow) {
        asks.insideLeadWindowN += 1;
        asks.owners[exposure.owner.state] += 1;
        if (exposure.owner.state === 'unique') {
          if (ask.state === 'open') asks.openN += 1;
          else if (ask.state === 'answered') asks.answeredN += 1;
          else asks.notIssuedN += 1;
        }
      }
      exposureRows.push({
        key: exposure.key,
        personId: person.personId,
        personName: person.name,
        state: exposure.state,
        stateLabel: lineHorizonStateLabel(exposure.state),
        from: exposure.from,
        to: exposure.to,
        days: exposure.days,
        reachesHorizonEnd: exposure.to === window.to,
        daysUntil: daysBetween(today, exposure.from),
        insideLeadWindow,
        totalH: exposure.totalH,
        totalDisplay: formatShareH(exposure.totalH),
        deviationDisplay: exposure.totalH === null ? null : formatDeltaH(exposure.totalH - FULL),
        lines: exposure.lines.map((line) => ({
          managerId: managerNamesWithheld ? null : line.managerId,
          managerName: managerName(line.managerId),
          role: line.role,
          kindLabel: matrixLineKind(line.kind)?.label || line.kind,
          shareH: line.declaredShareH,
          shareDisplay: formatShareH(line.declaredShareH),
          toISO: line.toISO,
        })),
        ownerState: exposure.owner.state,
        ownerName: exposure.owner.state === 'unique' ? managerName(exposure.owner.id) : null,
        ownerWithheld: exposure.owner.state === 'unique' && managerNamesWithheld,
        askState: ask.state,
        askDueOn: ask.dueOn,
      });
    }

    const first = person.exposures[0] || null;
    const verdictDef = lineHorizonVerdict(person.verdict);
    peopleRows.push({
      personId: person.personId,
      name: person.name,
      verdict: person.verdict,
      verdictLabel: verdictDef?.label || person.verdict,
      verdictTone: verdictDef?.tone || 'neutral',
      stateToday: person.segs[0].state,
      stateTodayLabel: lineHorizonStateLabel(person.segs[0].state),
      totalTodayH: person.segs[0].totalH,
      totalTodayDisplay: formatShareH(person.segs[0].totalH),
      lineNToday: person.segs[0].lineN,
      stateLastDay: person.segs[lastIndex].state,
      totalLastDayH: person.segs[lastIndex].totalH,
      totalLastDayDisplay: formatShareH(person.segs[lastIndex].totalH),
      lineNLastDay: person.segs[lastIndex].lineN,
      runs: person.runs.slice(0, LINE_HORIZON_LIMITS.runsPerPerson).map((run) => ({
        state: run.state,
        stateLabel: lineHorizonStateLabel(run.state),
        from: run.from,
        to: run.to,
        days: run.days,
        minTotalH: run.minTotalH,
        maxTotalH: run.maxTotalH,
        totalDisplay: run.minTotalH === null ? null
          : run.minTotalH === run.maxTotalH ? formatShareH(run.maxTotalH)
            : `${formatShareH(run.minTotalH)}–${formatShareH(run.maxTotalH)}`,
      })),
      runsRemainderN: Math.max(0, person.runs.length - LINE_HORIZON_LIMITS.runsPerPerson),
      firstExposureOn: first ? first.from : null,
      firstExposureInDays: first ? daysBetween(today, first.from) : null,
      eventN: person.events.length,
      stateDays: own.stateDays,
      attributedShareDaysH: own.unattributableDaysN ? null : own.attributedH,
      overShareDaysH: own.unattributableDaysN ? null : own.overH,
      unallocatedShareDaysH: own.unattributableDaysN ? null : own.underH,
      unattributableDaysN: own.unattributableDaysN,
    });
  }

  /* --------------------------------------------------------------- weeks */
  const reasonFor = (undeclaredDays, refusedDays) => {
    const parts = [];
    if (undeclaredDays) parts.push(`${undeclaredDays} person-day(s) on which a person’s split is undeclared`);
    if (refusedDays) parts.push(`${refusedDays} person-day(s) under a declaration the ledger does not read`);
    return parts.length
      ? `Share-day totals are WITHHELD: ${parts.join(' and ')}. Counts of people and person-days are complete; a total over the remainder would be a smaller number wearing the whole name.`
      : '';
  };
  const weekRows = weekAcc.map((week) => {
    const complete = week.undeclaredPersonDaysN === 0 && week.refusedLinePersonDaysN === 0;
    return {
      index: week.index, from: week.from, to: week.to, days: week.days, partial: week.partial,
      peopleN: board.peopleN,
      personDaysN: week.personDaysN,
      statePersonDays: week.statePersonDays,
      overPeopleN: week.statePeople[S.over].size,
      underPeopleN: week.statePeople[S.under].size,
      undeclaredPeopleN: week.statePeople[S.undeclared].size,
      undeclaredPersonDaysN: week.undeclaredPersonDaysN,
      refusedLinePersonDaysN: week.refusedLinePersonDaysN,
      complete,
      withheldReason: reasonFor(week.undeclaredPersonDaysN, week.refusedLinePersonDaysN),
      attributedShareDaysH: complete ? week.attributedH : null,
      capacityShareDaysH: complete ? week.capacityH : null,
      overShareDaysH: complete ? week.overH : null,
      unallocatedShareDaysH: complete ? week.underH : null,
      driftShareDaysH: complete ? week.driftH : null,
      personDaysReconcile: STATE_KEYS.reduce((sum, key) => sum + week.statePersonDays[key], 0) === week.personDaysN
        && week.personDaysN === board.peopleN * week.days,
      shareDaysReconcile: complete ? week.attributedH - week.capacityH === week.overH - week.underH + week.driftH : null,
      rollOffN: week.rollOffN, rollOnN: week.rollOnN, homeShareChangeN: week.homeShareChangeN, returnsToHomeN: week.returnsToHomeN,
    };
  });

  /* --------------------------------------------------------------- board */
  for (const week of weekAcc) {
    board.personDaysN += week.personDaysN;
    for (const key of STATE_KEYS) board.statePersonDays[key] += week.statePersonDays[key];
    board.undeclaredPersonDaysN += week.undeclaredPersonDaysN;
    board.refusedLinePersonDaysN += week.refusedLinePersonDaysN;
  }
  board.readingComplete = board.undeclaredPersonDaysN === 0 && board.refusedLinePersonDaysN === 0;
  board.withheldReason = reasonFor(board.undeclaredPersonDaysN, board.refusedLinePersonDaysN);
  const sumWeeks = (field) => weekAcc.reduce((sum, week) => sum + week[field], 0);
  const totals = {
    attributedH: sumWeeks('attributedH'), capacityH: sumWeeks('capacityH'),
    overH: sumWeeks('overH'), underH: sumWeeks('underH'), driftH: sumWeeks('driftH'),
  };
  let fanOutH = 0;
  for (const entry of managerAcc.values()) for (const slot of entry.weeks) fanOutH += slot.shareDaysH;
  // An independent second sum over the PERSON rows, so "the weeks add to the
  // board" is a comparison of two different paths and not a number with itself.
  const peopleAttributedH = peopleRows.reduce((sum, row) => sum + (row.attributedShareDaysH || 0), 0);
  board.verdictsReconcile = LINE_HORIZON_VERDICT_KEYS.reduce((sum, key) => sum + board.verdicts[key], 0) === board.peopleN;
  board.personDaysReconcile = STATE_KEYS.reduce((sum, key) => sum + board.statePersonDays[key], 0) === board.personDaysN
    && board.personDaysN === board.peopleN * window.days;
  if (board.readingComplete) {
    board.attributedShareDaysH = totals.attributedH;
    board.capacityShareDaysH = totals.capacityH;
    board.overShareDaysH = totals.overH;
    board.unallocatedShareDaysH = totals.underH;
    board.driftShareDaysH = totals.driftH;
    board.shareDaysReconcile = totals.attributedH - totals.capacityH === totals.overH - totals.underH + totals.driftH;
    board.fanOutShareDaysH = fanOutH;
    board.fanOutReconcile = fanOutH === totals.attributedH;
    board.weeksReconcile = peopleAttributedH === totals.attributedH;
  } else {
    board.attributedShareDaysH = null;
    board.capacityShareDaysH = null;
    board.overShareDaysH = null;
    board.unallocatedShareDaysH = null;
    board.driftShareDaysH = null;
    board.shareDaysReconcile = null;
    board.fanOutShareDaysH = null;
    board.fanOutReconcile = null;
    board.weeksReconcile = null;
  }
  board.additionalLineN = additionalLines.size;
  board.openEndedLineN = openEndedLines.size;
  board.exposureN = exposureRows.length;
  board.segmentN = segments.length;

  /* ------------------------------------------------------- refused lines */
  const refusedAll = core.refusedLines
    .filter((line) => (line.personOnRoster ? inScope(line.personId) : !scope))
    .map((line) => ({
      ...line,
      personName: line.personOnRoster ? nameOf(line.personId) : null,
      managerName: core.names.has(line.managerId) ? managerName(line.managerId) : null,
      managerId: managerNamesWithheld ? null : line.managerId,
      kindLabel: matrixLineKind(line.kind)?.label || line.kind || '',
    }));
  board.refusedLineN = refusedAll.length;

  /* ------------------------------------------------------------ managers */
  const managerRows = [...managerAcc.values()].map((entry) => {
    const unresolvedDays = entry.weeks.reduce((sum, slot) => sum + slot.unresolvedPersonDaysN, 0);
    const shareDaysH = unresolvedDays ? null : entry.weeks.reduce((sum, slot) => sum + slot.shareDaysH, 0);
    const weeks = entry.weeks.map((slot, bi) => ({
      index: buckets[bi].index,
      days: buckets[bi].days,
      shareDaysH: slot.unresolvedPersonDaysN ? null : slot.shareDaysH,
      unresolvedPersonDaysN: slot.unresolvedPersonDaysN,
    }));
    // Lowest and highest week by AVERAGE share held (share-days ÷ days), compared
    // by integer cross-multiplication because the first bucket can be short.
    let low = null;
    let high = null;
    for (const week of weeks) {
      if (week.shareDaysH === null) continue;
      if (!low || week.shareDaysH * low.days < low.shareDaysH * week.days) low = week;
      if (!high || week.shareDaysH * high.days > high.shareDaysH * week.days) high = week;
    }
    return {
      managerId: managerNamesWithheld ? null : entry.managerId,
      sortId: entry.managerId,
      name: managerName(entry.managerId),
      withheld: managerNamesWithheld,
      isLeader: entry.managerId === LEADER_ID,
      todayPeopleN: entry.today.people.size,
      todayShareH: entry.today.unresolvedN ? null : entry.today.shareH,
      todayShareDisplay: entry.today.unresolvedN ? null : formatShareH(entry.today.shareH),
      todayUnresolvedN: entry.today.unresolvedN,
      lastPeopleN: entry.last.people.size,
      lastShareH: entry.last.unresolvedN ? null : entry.last.shareH,
      lastShareDisplay: entry.last.unresolvedN ? null : formatShareH(entry.last.shareH),
      lastUnresolvedN: entry.last.unresolvedN,
      changeH: entry.today.unresolvedN || entry.last.unresolvedN ? null : entry.last.shareH - entry.today.shareH,
      changeDisplay: entry.today.unresolvedN || entry.last.unresolvedN ? null : formatDeltaH(entry.last.shareH - entry.today.shareH),
      rollOnN: entry.rollOnN,
      rollOffN: entry.rollOffN,
      returnsN: entry.returnsN,
      shareDaysH,
      personDaysDisplay: formatPersonDays(shareDaysH),
      unresolvedPersonDaysN: unresolvedDays,
      weeks,
      lowWeek: low,
      highWeek: high,
    };
  }).sort((a, b) => (b.rollOffN + b.rollOnN + b.returnsN) - (a.rollOffN + a.rollOnN + a.returnsN)
    || (a.name || '').localeCompare(b.name || '') || a.sortId.localeCompare(b.sortId));

  /* ------------------------------------------------- incoming (own lines) */
  // A scoped seat is a party to a line declared TO it. Until the line starts
  // the person is outside the wall, so only that one line is shown — never the
  // person's other lines, total or state.
  const incomingAll = [];
  if (scope && seat?.id) {
    for (const person of core.people.values()) {
      if (inScope(person.personId)) continue;
      for (const event of person.events) {
        if (event.kind !== 'roll-on' || event.line.managerId !== seat.id) continue;
        incomingAll.push({
          day: event.day,
          daysUntil: daysBetween(today, event.day),
          personName: person.name,
          lineKindLabel: matrixLineKind(event.line.kind)?.label || event.line.kind,
          shareDisplay: formatShareH(event.line.declaredShareH),
          toISO: event.line.toISO,
        });
      }
    }
    incomingAll.sort((a, b) => a.day.localeCompare(b.day) || a.personName.localeCompare(b.personName));
  }

  /* ---------------------------------------------------------------- order */
  const verdictRank = new Map(LINE_HORIZON_VERDICT_KEYS.map((key, index) => [key, index]));
  peopleRows.sort((a, b) => verdictRank.get(a.verdict) - verdictRank.get(b.verdict)
    || (a.firstExposureOn || '9999').localeCompare(b.firstExposureOn || '9999')
    || a.name.localeCompare(b.name) || a.personId.localeCompare(b.personId));
  eventRows.sort((a, b) => a.day.localeCompare(b.day) || a.personName.localeCompare(b.personName)
    || a.kind.localeCompare(b.kind) || String(a.lineKind).localeCompare(String(b.lineKind)));
  exposureRows.sort((a, b) => a.from.localeCompare(b.from) || a.key.localeCompare(b.key));
  asks.ownersReconcile = LINE_HORIZON_OWNER_STATE_KEYS.reduce((sum, key) => sum + asks.owners[key], 0) === asks.insideLeadWindowN;

  const cap = (rows, limit) => ({ rows: rows.slice(0, limit), all: rows.length, rest: Math.max(0, rows.length - limit) });
  const people = cap(peopleRows, LINE_HORIZON_LIMITS.people);
  const events = cap(eventRows, LINE_HORIZON_LIMITS.events);
  const managers = cap(managerRows, LINE_HORIZON_LIMITS.managers);
  const exposures = cap(exposureRows, LINE_HORIZON_LIMITS.events);
  const incoming = cap(incomingAll, LINE_HORIZON_LIMITS.incoming);
  const refused = cap(refusedAll, LINE_HORIZON_LIMITS.refusedLines);

  const isMatrix = board.additionalLineN > 0 || board.refusedLineN > 0 || board.homeShareChangeN > 0 || incomingAll.length > 0;
  return {
    ...base,
    seat: {
      id: seat?.id || null,
      label: seat?.label || 'Undeclared operator view',
      rank: seat?.rank ?? null,
      fullAccess: Boolean(seat?.fullAccess),
    },
    scope: !seat || seat.fullAccess ? 'workspace' : 'seat-span',
    scopeLabel: scopeLabelFor(seat),
    managerNamesWithheld,
    isMatrix,
    singleChainNote: isMatrix ? '' : 'No additional reporting line is in force for anybody in this scope on any day of the horizon, so there is nothing to roll on or off: every person holds one line and is whole by arithmetic. A single-chain workspace gains no row here.',
    board,
    weeks: weekRows,
    people: people.rows, peopleAllN: people.all, peopleRemainderN: people.rest,
    events: events.rows, eventsAllN: events.all, eventsRemainderN: events.rest,
    managers: managers.rows, managersAllN: managers.all, managersRemainderN: managers.rest,
    exposures: exposures.rows, exposuresAllN: exposures.all, exposuresRemainderN: exposures.rest,
    incoming: incoming.rows, incomingAllN: incoming.all, incomingRemainderN: incoming.rest,
    refusedLines: refused.rows, refusedLinesAllN: refused.all, refusedLinesRemainderN: refused.rest,
    asks,
  };
}

/* -------------------------------------------------------------- csv + brief */

const blank = (value) => (value === null || value === undefined ? '' : value);
const yesNo = (value) => (value === null || value === undefined ? '' : value ? 'yes' : 'no');

/** CSV scope #134. Aggregate only — see LINE_HORIZON_CSV_DESCRIPTOR. */
export function lineHorizonCsvRows(report) {
  if (!report?.window?.valid) {
    return [{
      row_kind: 'workspace', scope: report?.scope || 'workspace',
      horizon_from: blank(report?.window?.from), horizon_to: '', horizon_days: '',
      week_index: '', week_from: '', week_to: '', week_days: '', verdict: '',
      people_n: '', person_days_n: '', balanced_person_days_n: '', over_person_days_n: '', under_person_days_n: '',
      undeclared_person_days_n: '', over_people_n: '', under_people_n: '', undeclared_people_n: '',
      attributed_share_days_h: '', capacity_share_days_h: '', over_share_days_h: '', unallocated_share_days_h: '',
      roll_off_n: '', roll_on_n: '', home_share_change_n: '', returns_to_home_n: '',
      open_ended_line_n: '', refused_line_n: '', lead_window_days: blank(report?.conventions?.leadWindowDays),
      ahead_inside_lead_window_n: '', owner_unique_n: '', owner_unresolved_n: '',
      person_days_reconcile: '', verdicts_reconcile: '', share_days_reconcile: '', fan_out_reconcile: '',
      reading_complete: 'no', withheld_reason: report?.window?.refuseReason || 'The horizon was refused.',
    }];
  }
  const b = report.board;
  const w = report.window;
  const common = { scope: report.scope, horizon_from: w.from, horizon_to: w.to, horizon_days: w.days };
  const empty = {
    week_index: '', week_from: '', week_to: '', week_days: '', verdict: '',
    people_n: '', person_days_n: '', balanced_person_days_n: '', over_person_days_n: '', under_person_days_n: '',
    undeclared_person_days_n: '', over_people_n: '', under_people_n: '', undeclared_people_n: '',
    attributed_share_days_h: '', capacity_share_days_h: '', over_share_days_h: '', unallocated_share_days_h: '',
    roll_off_n: '', roll_on_n: '', home_share_change_n: '', returns_to_home_n: '',
    open_ended_line_n: '', refused_line_n: '', lead_window_days: '',
    ahead_inside_lead_window_n: '', owner_unique_n: '', owner_unresolved_n: '',
    person_days_reconcile: '', verdicts_reconcile: '', share_days_reconcile: '', fan_out_reconcile: '',
    reading_complete: '', withheld_reason: '',
  };
  const rows = [{
    row_kind: 'workspace', ...common, ...empty,
    people_n: b.peopleN,
    person_days_n: b.personDaysN,
    balanced_person_days_n: b.statePersonDays[S.balanced],
    over_person_days_n: b.statePersonDays[S.over],
    under_person_days_n: b.statePersonDays[S.under],
    undeclared_person_days_n: b.statePersonDays[S.undeclared],
    over_people_n: b.statePeople[S.over],
    under_people_n: b.statePeople[S.under],
    undeclared_people_n: b.statePeople[S.undeclared],
    attributed_share_days_h: blank(b.attributedShareDaysH),
    capacity_share_days_h: blank(b.capacityShareDaysH),
    over_share_days_h: blank(b.overShareDaysH),
    unallocated_share_days_h: blank(b.unallocatedShareDaysH),
    roll_off_n: b.rollOffN,
    roll_on_n: b.rollOnN,
    home_share_change_n: b.homeShareChangeN,
    returns_to_home_n: b.returnsToHomeN,
    open_ended_line_n: b.openEndedLineN,
    refused_line_n: b.refusedLineN,
    lead_window_days: report.asks.leadWindowDays,
    ahead_inside_lead_window_n: report.asks.insideLeadWindowN,
    owner_unique_n: report.asks.owners.unique,
    owner_unresolved_n: report.asks.insideLeadWindowN - report.asks.owners.unique,
    person_days_reconcile: yesNo(b.personDaysReconcile),
    verdicts_reconcile: yesNo(b.verdictsReconcile),
    share_days_reconcile: yesNo(b.shareDaysReconcile),
    fan_out_reconcile: yesNo(b.fanOutReconcile),
    reading_complete: yesNo(b.readingComplete),
    withheld_reason: b.withheldReason,
  }];
  for (const week of report.weeks) {
    rows.push({
      row_kind: 'week', ...common, ...empty,
      week_index: week.index, week_from: week.from, week_to: week.to, week_days: week.days,
      people_n: week.peopleN,
      person_days_n: week.personDaysN,
      balanced_person_days_n: week.statePersonDays[S.balanced],
      over_person_days_n: week.statePersonDays[S.over],
      under_person_days_n: week.statePersonDays[S.under],
      undeclared_person_days_n: week.statePersonDays[S.undeclared],
      over_people_n: week.overPeopleN,
      under_people_n: week.underPeopleN,
      undeclared_people_n: week.undeclaredPeopleN,
      attributed_share_days_h: blank(week.attributedShareDaysH),
      capacity_share_days_h: blank(week.capacityShareDaysH),
      over_share_days_h: blank(week.overShareDaysH),
      unallocated_share_days_h: blank(week.unallocatedShareDaysH),
      roll_off_n: week.rollOffN,
      roll_on_n: week.rollOnN,
      home_share_change_n: week.homeShareChangeN,
      returns_to_home_n: week.returnsToHomeN,
      person_days_reconcile: yesNo(week.personDaysReconcile),
      share_days_reconcile: yesNo(week.shareDaysReconcile),
      reading_complete: yesNo(week.complete),
      withheld_reason: week.withheldReason,
    });
  }
  for (const verdict of LINE_HORIZON_VERDICTS) {
    rows.push({ row_kind: 'verdict', ...common, ...empty, verdict: verdict.key, people_n: b.verdicts[verdict.key] });
  }
  return rows;
}

/** The identity-free paragraph. Names no person, manager, line or seat. */
export function lineHorizonBriefText(report) {
  if (!report?.window?.valid) {
    return `Matrix forward allocation horizon: REFUSED. ${report?.window?.refuseReason || 'The horizon could not be read.'}`;
  }
  const b = report.board;
  const w = report.window;
  const a = report.asks;
  const scope = report.scope === 'workspace' ? 'the whole workspace' : 'one seat’s span and its declared lines';
  const parts = [
    `Matrix forward allocation horizon, ${w.from} to ${w.to} (${w.weeks} ISO week(s), ${w.days} day(s)), read over ${scope}: ${b.peopleN} person(s), the live ledger evaluated on ${b.segmentN} day(s).`,
  ];
  if (!report.isMatrix) {
    parts.push('No person in this scope holds an additional reporting line on any day of the horizon; nothing rolls on or off.');
    return parts.join(' ');
  }
  parts.push(`Verdicts: ${b.verdicts['double-booked-ahead']} double-booked ahead, ${b.verdicts['split-unknown-ahead']} with a split that becomes unknown, ${b.verdicts['unallocated-ahead']} unallocated ahead, ${b.verdicts['exposed-now']} exposed today, ${b.verdicts['changes-ahead']} changing and staying balanced, ${b.verdicts.steady} steady (${b.verdictsReconcile ? 'the six add to the headcount' : 'the six do NOT add to the headcount — treat this brief as unverified'}).`);
  parts.push(`${b.rollOffN} roll-off(s) and ${b.rollOnN} roll-on(s) are dated inside the horizon; ${b.returnsToHomeN} time(s) a person is left holding only their home line (${b.returnsWholeN} whole, ${b.returnsToHomeN - b.returnsWholeN} with a share nobody holds); ${b.openEndedLineN} of ${b.additionalLineN} additional line(s) in force carry no declared last day.`);
  parts.push(`Person-days: ${b.statePersonDays[S.balanced]} balanced, ${b.statePersonDays[S.over]} over-committed, ${b.statePersonDays[S.under]} under-allocated, ${b.statePersonDays[S.undeclared]} with an unknown split, of ${b.personDaysN}.`);
  if (b.readingComplete) {
    parts.push(`Declared load is ${formatPersonDays(b.attributedShareDaysH)} person-days against ${formatPersonDays(b.capacityShareDaysH)} of capacity: ${formatPersonDays(b.overShareDaysH)} over-committed and ${formatPersonDays(b.unallocatedShareDaysH)} held by nobody (integer identity ${b.shareDaysReconcile ? 'verified' : 'NOT verified'}; manager fan-out ${b.fanOutReconcile ? 'equal to the person total' : 'NOT equal to the person total'}).`);
  } else {
    parts.push(b.withheldReason);
  }
  parts.push(`${a.insideLeadWindowN} exposure(s) begin inside the declared ${a.leadWindowDays}-day lead window: ${a.owners.unique} with one accountable seat (${a.openN} ask(s) open, ${a.answeredN} closed with the exposure still standing, ${a.notIssuedN} not issued), ${a.owners['leader-held']} held by the workspace leader, ${a.owners.ambiguous} with no single seat, ${a.owners['off-roster']} whose owner is off the roster.`);
  if (b.refusedLineN) parts.push(`${b.refusedLineN} declaration(s) inside their dated window are not read by the ledger and are listed by reason.`);
  parts.push('Shares are declarations, not hours; today’s roster is held constant and no line is renewed or ramped.');
  return parts.join(' ');
}
