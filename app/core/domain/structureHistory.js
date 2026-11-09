/**
 * app/core/domain/structureHistory.js — Matrix Reorganisation Reconciliation &
 * As-Of Structure Reads (ADR-0149, Schema v124, `#/structure-history`).
 *
 * THE QUESTION, IN AN OPERATOR'S WORDS. "Before I hand this re-org to the board I
 * need last quarter's span of control. Today's chart is not it — eleven people
 * moved in March. And when I open Priya's line acceptance from February, is it
 * telling me who Sam reported to in February, or who she reports to now?"
 *
 * Today the answer to both is "whoever `person.managerId` points at right now",
 * applied to every date, silently. That is the defect. This module reads the
 * structure that was RECORDED for a day, reconciles every stored act that names
 * a manager against the structure of its OWN day, and refuses to print a figure
 * when the record does not cover the day being asked about.
 *
 * THE THREE CLAIMS IT KEEPS SEPARATE (Bulletproof Reliability Mandate)
 * --------------------------------------------------------------------
 *   1. "The structure on this day is recorded"      → `verdict`
 *   2. "The figures below are derived from it"      → `reading.refused` + spans
 *   3. "The stored acts still mean what they meant" → `acts.*` counts
 *
 * These are three different facts and are printed as three different facts. A
 * reading that adds up over the wrong structure is exactly the reassuring lie
 * this terminal refuses to produce: when `verdict` is not `observed`, the spans
 * and every figure derived from them are WITHHELD with the reason, never shown
 * as a smaller-but-clean list.
 *
 * Pure module: no DOM, no storage, no implicit clock.
 */

import { dayKey, daysBetween, addDays } from '../time.js';
import { LEADER_ID } from './chain.js';
import { activeSeat, buildSeats } from './seat.js';
import { matrixLineScopeFor } from './matrix.js';
import { normalizeStructureHistorySettings } from './structureHistorySchema.js';
import {
  STRUCTURE_ACT_SOURCES,
  STRUCTURE_ACT_STATES,
  STRUCTURE_CHANGE_KINDS,
  STRUCTURE_HISTORY_CSV_COLUMNS,
  STRUCTURE_HISTORY_ENGINE_VERSION,
  STRUCTURE_HISTORY_LIMITS,
  STRUCTURE_HISTORY_METHOD,
  STRUCTURE_OBSERVATION_LABELS,
  STRUCTURE_OBSERVATION_STATES,
  STRUCTURE_OBSERVATION_TONES,
  STRUCTURE_VERDICTS,
  structureActState,
  structureVerdict,
} from './structureHistoryRegistry.js';

/* ------------------------------------------------------------ small helpers */

function dayOf(value) {
  const s = typeof value === 'string' ? value.trim().slice(0, 10) : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function nameOf(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function readPath(obj, path) {
  if (!obj || !path) return undefined;
  return String(path).split('.').reduce((acc, key) => (acc === null || acc === undefined ? undefined : acc[key]), obj);
}

/** The first readable day among a source's declared date paths. */
function firstDay(record, paths) {
  for (const path of paths || []) {
    const value = dayOf(readPath(record, path));
    if (value) return value;
  }
  return null;
}

/** Is `day` inside the half-open period [fromISO, toISO]? An open end never closes. */
function coversDay(record, day) {
  if (!record || !day) return false;
  if (record.fromISO > day) return false;
  if (record.toISO && record.toISO < day) return false;
  return true;
}

/* --------------------------------------------------------------- the ledger */

/**
 * Index the stored records by person, sorted by start day.
 *
 * Two records overlapping in time for the SAME person are a contradiction: two
 * managers cannot both be the home line on one day. They are REPORTED as a
 * defect rather than resolved by picking the later one, because picking is a
 * decision about somebody's reporting line that this module is not entitled to
 * make and that a reader could never see.
 */
export function buildStructureLedger(state = {}) {
  const records = Array.isArray(state.structureHistory) ? state.structureHistory : [];
  const byPerson = new Map();
  for (const record of records) {
    if (!record || !record.personId) continue;
    if (!byPerson.has(record.personId)) byPerson.set(record.personId, []);
    byPerson.get(record.personId).push(record);
  }
  const defects = [];
  for (const [personId, rows] of byPerson) {
    rows.sort((a, b) => String(a.fromISO).localeCompare(String(b.fromISO)) || String(a.id).localeCompare(String(b.id)));
    for (let i = 1; i < rows.length; i += 1) {
      const previous = rows[i - 1];
      const current = rows[i];
      // Overlap iff the previous period has not closed before this one starts.
      if (!previous.toISO || previous.toISO >= current.fromISO) {
        defects.push({
          defect: 'overlapping-period',
          personId,
          recordIds: [previous.id, current.id],
          detail: `${personId} carries two home-line records covering ${current.fromISO}: ${previous.managerId} from ${previous.fromISO}${previous.toISO ? ` to ${previous.toISO}` : ' (open)'} and ${current.managerId} from ${current.fromISO}. Two managers cannot both hold the home line on one day; neither was picked.`,
        });
      }
    }
  }
  const firstRecordedDay = records.reduce((min, r) => (r && r.fromISO && (!min || r.fromISO < min) ? r.fromISO : min), null);
  return { records, byPerson, defects, firstRecordedDay };
}

/**
 * The home line a person had on `day`, as recorded.
 *
 * Returns `{ state, managerId, record }`. The three states are the module's
 * central distinction and are never collapsed:
 *
 *   observed      a record covers the day; `managerId` is a fact.
 *   unknown       no record covers the day. The manager is NOT today's pointer:
 *                 it is unknown, and the caller must withhold derived figures.
 */
export function homeLineOn(ledger, personId, day) {
  const rows = ledger.byPerson.get(personId) || [];
  const hit = rows.find((record) => coversDay(record, day)) || null;
  if (hit) {
    return {
      state: STRUCTURE_OBSERVATION_STATES.observed,
      managerId: hit.managerId,
      record: hit,
    };
  }
  return {
    state: STRUCTURE_OBSERVATION_STATES.unknown,
    managerId: null,
    record: null,
  };
}

/**
 * Was this person on the roster on `day`?
 *
 * A person who had not started yet, or who had been archived before that day, is
 * a FACT, not a gap — and it is a different fact from "we do not know". Collapsing
 * the two is how a re-org report overstates headcount movement.
 */
export function rosterStatusOn(person, day) {
  const started = dayOf(person?.startDate) || dayOf(person?.createdAt);
  if (started && started > day) return STRUCTURE_OBSERVATION_STATES.notOnRoster;
  const archivedOn = dayOf(person?.archivedAt);
  if (person?.status === 'archived' && archivedOn && archivedOn <= day) {
    return STRUCTURE_OBSERVATION_STATES.notOnRoster;
  }
  return null;
}

/* ------------------------------------------------------------- as-of reading */

/**
 * The as-of reading: the structure as it was recorded on one day.
 *
 * `verdict` is decided from the OBSERVATIONS, not from a count of records, so a
 * workspace whose ledger covers only half its roster reads `partial` — never
 * `observed` over the half it happens to hold.
 */
export function readStructureAsOf(state = {}, asOf, { now = new Date(), settings = null, ledger = null } = {}) {
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const today = dayKey(at) || new Date().toISOString().slice(0, 10);
  const day = dayOf(asOf) || today;
  const cfg = settings || state.settings || {};
  const conv = normalizeStructureHistorySettings(cfg);
  const book = ledger || buildStructureLedger(state);

  const people = (Array.isArray(state.people) ? state.people : []).filter((p) => p && p.id);
  const roster = new Map(people.map((p) => [p.id, p]));

  const observations = [];
  for (const person of people) {
    const notOnRoster = rosterStatusOn(person, day);
    if (notOnRoster) {
      observations.push({
        personId: person.id,
        personName: nameOf(person.name, person.id),
        state: notOnRoster,
        stateLabel: STRUCTURE_OBSERVATION_LABELS[notOnRoster],
        tone: STRUCTURE_OBSERVATION_TONES[notOnRoster],
        managerId: null,
        managerName: null,
        recordId: null,
        reason: person.status === 'archived'
          ? `Archived on ${dayOf(person.archivedAt) || 'an unrecorded day'}, which is at or before ${day}.`
          : `Started ${dayOf(person.startDate) || dayOf(person.createdAt) || 'on an unrecorded day'}, which is after ${day}.`,
      });
      continue;
    }
    const line = homeLineOn(book, person.id, day);
    if (line.state === STRUCTURE_OBSERVATION_STATES.observed) {
      const managerName = line.managerId === LEADER_ID
        ? nameOf(cfg.leaderName, 'You (workspace leader)')
        : nameOf(roster.get(line.managerId)?.name, line.managerId);
      observations.push({
        personId: person.id,
        personName: nameOf(person.name, person.id),
        state: line.state,
        stateLabel: STRUCTURE_OBSERVATION_LABELS[line.state],
        tone: STRUCTURE_OBSERVATION_TONES[line.state],
        managerId: line.managerId,
        managerName,
        recordId: line.record?.id || null,
        periodFrom: line.record?.fromISO || null,
        periodTo: line.record?.toISO || null,
        reason: `Recorded from ${line.record?.fromISO}${line.record?.toISO ? ` to ${line.record.toISO}` : ' and still open'}.`,
      });
      continue;
    }
    observations.push({
      personId: person.id,
      personName: nameOf(person.name, person.id),
      state: STRUCTURE_OBSERVATION_STATES.unknown,
      stateLabel: STRUCTURE_OBSERVATION_LABELS[STRUCTURE_OBSERVATION_STATES.unknown],
      tone: STRUCTURE_OBSERVATION_TONES[STRUCTURE_OBSERVATION_STATES.unknown],
      managerId: null,
      managerName: null,
      recordId: null,
      reason: book.firstRecordedDay
        ? `No home-line record covers ${day}. The ledger begins on ${book.firstRecordedDay}; the manager this person had on ${day} was never recorded, and today's roster is not evidence about it.`
        : `No home-line record exists for this person at all, so the manager they had on ${day} was never recorded. Today's pointer is not evidence about ${day}.`,
    });
  }
  observations.sort((a, b) => String(a.personName).localeCompare(String(b.personName)) || String(a.personId).localeCompare(String(b.personId)));

  const observedN = observations.filter((o) => o.state === STRUCTURE_OBSERVATION_STATES.observed).length;
  const unknownN = observations.filter((o) => o.state === STRUCTURE_OBSERVATION_STATES.unknown).length;
  const notOnRosterN = observations.filter((o) => o.state === STRUCTURE_OBSERVATION_STATES.notOnRoster).length;

  // The verdict is the WORST of three facts, in the declared precedence order.
  let verdictKey = 'observed';
  if (day > today) verdictKey = 'future';
  else if (observedN === 0) verdictKey = 'unrecorded';
  else if (unknownN > 0) verdictKey = 'partial';
  const verdictMeta = structureVerdict(verdictKey) || structureVerdict('observed');

  // THE REFUSAL. Everything derived from the observation set is withheld the
  // moment the observation set is not complete — never printed as a smaller,
  // clean-looking list over the part that happens to be recorded.
  const readingRefused = verdictKey !== 'observed';
  const refusedReason = readingRefused
    ? (verdictKey === 'future'
      ? `The date ${day} is after today (${today}). A structure that has not happened cannot be read.`
      : verdictKey === 'unrecorded'
        ? `No person in this workspace has a recorded home line covering ${day}. Every span and every comparability figure is withheld rather than projected backwards from today's roster.`
        : `${unknownN} of ${observations.length} person(s) have no recorded home line covering ${day}. A span computed over the other ${observedN} would understate the structure while reading as complete, so the spans are withheld.`)
    : null;

  /* ---- spans, withheld entirely unless the reading is complete ---- */
  const spanRows = [];
  if (!readingRefused) {
    const byManager = new Map();
    for (const obs of observations) {
      if (obs.state !== STRUCTURE_OBSERVATION_STATES.observed) continue;
      if (!byManager.has(obs.managerId)) byManager.set(obs.managerId, []);
      byManager.get(obs.managerId).push(obs);
    }
    for (const [managerId, reports] of byManager) {
      spanRows.push({
        managerId,
        managerName: reports[0].managerName,
        isLeader: managerId === LEADER_ID,
        spanN: reports.length,
        reportIds: reports.map((r) => r.personId).sort(),
      });
    }
    spanRows.sort((a, b) => (a.isLeader ? 1 : 0) - (b.isLeader ? 1 : 0)
      || b.spanN - a.spanN
      || String(a.managerName).localeCompare(String(b.managerName)));
  }
  // The identity the panel can print as an equality rather than a reassurance:
  // every person observed on this day is counted in exactly one span.
  const spanTotal = spanRows.reduce((acc, r) => acc + r.spanN, 0);
  const spansReconcile = readingRefused ? null : spanTotal === observedN;

  return {
    asOf: day,
    today,
    daysAgo: daysBetween(day, today),
    verdict: verdictKey,
    verdictMeta,
    verdictLabel: verdictMeta.label,
    verdictTone: verdictMeta.tone,
    readingRefused,
    refusedReason,
    observations,
    rowN: observations.length,
    observedN,
    unknownN,
    notOnRosterN,
    spans: spanRows.slice(0, STRUCTURE_HISTORY_LIMITS.rows),
    spansRemainderN: Math.max(0, spanRows.length - STRUCTURE_HISTORY_LIMITS.rows),
    managerN: spanRows.length,
    spanTotal,
    spansReconcile,
    coverageStart: book.firstRecordedDay,
    conventions: conv,
  };
}

/* ---------------------------------------------------- reorganisation diffing */

/**
 * What changed between two recorded readings.
 *
 * `appeared` and `disappeared` are kept apart from `moved` on purpose: a person
 * who joined between the dates did not change manager, and a report that lumps
 * the three together overstates reorganisation and understates turnover. A
 * person who is UNKNOWN on either date is not counted as a change at all — they
 * are counted as uncomparable, with the number printed.
 */
export function diffStructures(fromReading, toReading) {
  if (!fromReading || !toReading) return null;
  const fromById = new Map(fromReading.observations.map((o) => [o.personId, o]));
  const toById = new Map(toReading.observations.map((o) => [o.personId, o]));
  const ids = [...new Set([...fromById.keys(), ...toById.keys()])].sort();

  const rows = [];
  let movedN = 0;
  let appearedN = 0;
  let disappearedN = 0;
  let heldN = 0;
  let uncomparableN = 0;

  for (const personId of ids) {
    const before = fromById.get(personId) || null;
    const after = toById.get(personId) || null;
    const beforeObserved = before?.state === STRUCTURE_OBSERVATION_STATES.observed;
    const afterObserved = after?.state === STRUCTURE_OBSERVATION_STATES.observed;
    const beforeGone = before?.state === STRUCTURE_OBSERVATION_STATES.notOnRoster || !before;
    const afterGone = after?.state === STRUCTURE_OBSERVATION_STATES.notOnRoster || !after;

    let kind = null;
    let reason = '';
    if (afterGone && !beforeGone) {
      kind = 'disappeared';
      reason = after?.reason || 'No longer on the roster on the later date.';
    } else if (beforeGone && !afterGone) {
      kind = 'appeared';
      reason = before?.reason || 'Not yet on the roster on the earlier date.';
    } else if (beforeObserved && afterObserved) {
      if (before.managerId === after.managerId) {
        kind = 'held';
        reason = `Home line unchanged: ${after.managerName}.`;
      } else {
        kind = 'moved';
        reason = `${before.managerName} → ${after.managerName}.`;
      }
    } else {
      uncomparableN += 1;
      rows.push({
        personId,
        personName: after?.personName || before?.personName || personId,
        kind: 'uncomparable',
        fromManagerName: before?.managerName || null,
        toManagerName: after?.managerName || null,
        reason: `${before?.stateLabel || 'not on either reading'} on ${fromReading.asOf} and ${after?.stateLabel || 'not on either reading'} on ${toReading.asOf}: the two readings cannot be compared for this person, so no change is claimed.`,
      });
      continue;
    }

    if (kind === 'moved') movedN += 1;
    else if (kind === 'appeared') appearedN += 1;
    else if (kind === 'disappeared') disappearedN += 1;
    else if (kind === 'held') heldN += 1;

    rows.push({
      personId,
      personName: after?.personName || before?.personName || personId,
      kind,
      kindLabel: STRUCTURE_CHANGE_KINDS.find((c) => c.key === kind)?.label || kind,
      fromManagerId: before?.managerId || null,
      fromManagerName: before?.managerName || null,
      toManagerId: after?.managerId || null,
      toManagerName: after?.managerName || null,
      reason,
    });
  }

  rows.sort((a, b) => String(a.kind).localeCompare(String(b.kind))
    || String(a.personName).localeCompare(String(b.personName)));

  const comparable = fromReading.verdict === 'observed' && toReading.verdict === 'observed';
  return {
    fromISO: fromReading.asOf,
    toISO: toReading.asOf,
    comparable,
    comparableReason: comparable
      ? null
      : `The change set is not a complete account: ${fromReading.asOf} reads ${fromReading.verdict} and ${toReading.asOf} reads ${toReading.verdict}. People with an unrecorded structure on either date are counted as uncomparable and no change is claimed for them.`,
    rows: rows.slice(0, STRUCTURE_HISTORY_LIMITS.rows),
    rowsRemainderN: Math.max(0, rows.length - STRUCTURE_HISTORY_LIMITS.rows),
    movedN,
    appearedN,
    disappearedN,
    heldN,
    uncomparableN,
    // A restructure that moved nobody is a legitimate, common and often
    // misreported answer: it is printed as `no movement`, not as a failure.
    anyMovement: movedN > 0,
  };
}

/* ------------------------------------------------- act reconciliation */

/**
 * Reconcile every stored act that names a manager against the structure of the
 * act's OWN day.
 *
 * This is the comparison the audit-trail argument turns on. An act is not
 * rewritten, re-pointed or withdrawn here: it is read, and the four outcomes are
 * counted separately, because "this still means what it meant", "this now reads
 * against a structure that never existed", "nobody can tell" and "this has no
 * date" are four different facts about the record.
 */
export function reconcileActs(state = {}, { now = new Date(), settings = null, ledger = null } = {}) {
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const cfg = settings || state.settings || {};
  const book = ledger || buildStructureLedger(state);
  const roster = new Map((Array.isArray(state.people) ? state.people : []).filter((p) => p && p.id).map((p) => [p.id, p]));

  const sources = [];
  let totalActs = 0;
  let consistentN = 0;
  let driftedN = 0;
  let unverifiableN = 0;
  let undatedN = 0;

  for (const source of STRUCTURE_ACT_SOURCES) {
    const rows = Array.isArray(state[source.collection]) ? state[source.collection] : [];
    const counts = {
      key: source.key,
      label: source.label,
      collection: source.collection,
      why: source.why,
      actsN: 0,
      consistentN: 0,
      driftedN: 0,
      unverifiableN: 0,
      undatedN: 0,
      drifted: [],
    };

    for (const record of rows) {
      if (!record || !record.id) continue;
      const personId = readPath(record, source.personPath);
      const managerId = readPath(record, source.managerPath);
      // A row that names neither a person nor a manager is not this module's
      // business; it is counted by its own module's normalizer, not swept in here.
      if (!personId || !managerId) continue;
      const day = firstDay(record, source.datePaths);
      counts.actsN += 1;

      if (!day) {
        counts.undatedN += 1;
        continue;
      }
      // A person who was not on the roster on the act's own day is a different
      // problem from an unrecorded structure, and it is NOT counted as drift:
      // the act is about somebody the workspace says was not there.
      if (rosterStatusOn(roster.get(personId), day) === STRUCTURE_OBSERVATION_STATES.notOnRoster) {
        counts.unverifiableN += 1;
        continue;
      }
      const line = homeLineOn(book, personId, day);
      if (line.state !== STRUCTURE_OBSERVATION_STATES.observed) {
        counts.unverifiableN += 1;
        continue;
      }
      // The manager NAMED by the act against the structure RECORDED for that day.
      //
      // It is deliberately NOT an equality test against the home manager: a
      // secondary (project/product) line manager was never the home manager, so
      // requiring equality would report every legitimate project line as drift
      // and bury the real finding in noise. The question this asks is the one the
      // audit-trail argument actually turns on — "was the manager this act names
      // part of the structure this person had on that day" — and the answer is
      // yes when either the home line OR a declared line covering that day
      // joined them.
      const wasHomeManager = line.managerId === managerId;
      const onDeclaredLineThatDay = (Array.isArray(state.reportingLines) ? state.reportingLines : [])
        .some((l) => l
          && l.personId === personId
          && l.managerId === managerId
          && (!l.fromISO || l.fromISO <= day)
          && (!l.toISO || l.toISO >= day));
      const managerOnRoster = managerId === LEADER_ID || roster.has(managerId);

      if (!wasHomeManager && !onDeclaredLineThatDay) {
        counts.driftedN += 1;
        counts.drifted.push({
          actId: record.id,
          personId,
          personName: nameOf(roster.get(personId)?.name, personId),
          actDay: day,
          namedManagerId: managerId,
          namedManagerName: nameOf(roster.get(managerId)?.name, managerId),
          recordedManagerId: line.managerId,
          recordedManagerName: line.managerId === LEADER_ID
            ? nameOf(cfg.leaderName, 'You (workspace leader)')
            : nameOf(roster.get(line.managerId)?.name, line.managerId),
          detail: `This ${source.label.toLowerCase()} entry was written on ${day} and names ${nameOf(roster.get(managerId)?.name, managerId)}. On ${day} the recorded structure had ${nameOf(roster.get(line.managerId)?.name, line.managerId)} as this person's home line, and no declared line to the named manager existed.`,
        });
      } else if (!managerOnRoster) {
        counts.unverifiableN += 1;
      } else {
        counts.consistentN += 1;
      }
    }

    totalActs += counts.actsN;
    consistentN += counts.consistentN;
    driftedN += counts.driftedN;
    unverifiableN += counts.unverifiableN;
    undatedN += counts.undatedN;
    sources.push(counts);
  }

  // The exact identity the panel prints as an equality. Every counted act lands
  // in exactly one of four buckets, and the sum is checked before it is shown.
  const countedN = consistentN + driftedN + unverifiableN + undatedN;
  const actsReconcile = totalActs === countedN;
  const coverageStart = book.firstRecordedDay;

  return {
    generatedOn: dayKey(at),
    coverageStart,
    actsN: totalActs,
    consistentN,
    driftedN,
    unverifiableN,
    undatedN,
    countedN,
    actsReconcile,
    // A separate claim from `actsReconcile`: the buckets add up AND every act
    // reached a bucket. Two facts, printed as two facts.
    clean: driftedN === 0 && unverifiableN === 0 && undatedN === 0 && actsReconcile,
    sources,
    drifted: sources.flatMap((s) => s.drifted.map((d) => ({ ...d, sourceKey: s.key, sourceLabel: s.label }))),
    acts: {
      consistent: structureActState(STRUCTURE_ACT_STATES.consistent)?.label,
      drifted: structureActState(STRUCTURE_ACT_STATES.drifted)?.label,
      unverifiable: structureActState(STRUCTURE_ACT_STATES.unverifiable)?.label,
      undated: structureActState(STRUCTURE_ACT_STATES.undated)?.label,
    },
    readings: STRUCTURE_ACT_STATES,
  };
}

/* --------------------------------------------------------------- the report */

/** The seat scope. A scoped seat reads its own span and its declared lines. */
function scopeFilter(state, now, settings) {
  const built = buildSeats(state, {
    now,
    settings,
    lineScope: matrixLineScopeFor(state, { now, settings }),
  });
  const seat = activeSeat(built);
  if (seat.fullAccess) return { seat, visible: () => true, scopeLabel: 'the whole workspace' };
  const inTree = (personId) => Boolean(seat.scope?.has?.(personId));
  const inLines = (personId) => Boolean(seat.lineScope?.has?.(personId));
  return {
    seat,
    visible: (personId) => personId === seat.id || inTree(personId) || inLines(personId),
    scopeLabel: `${seat.label || seat.id}’s span and its declared lines`,
  };
}

/**
 * The whole report under the acting seat.
 *
 * Every figure is derived here, on read, from the stored ledger and the roster.
 * Nothing is written. A scoped seat sees the people it already reaches on the
 * tree or a declared line, and the rest are COUNTED as withheld — never silently
 * dropped, and never widened sideways.
 */
export function buildStructureHistoryReport(state = {}, { now = new Date(), settings = null, asOf = null, fromISO = null, toISO = null } = {}) {
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const today = dayKey(at) || new Date().toISOString().slice(0, 10);
  const cfg = settings || state.settings || {};
  const conv = normalizeStructureHistorySettings(cfg);
  const book = buildStructureLedger(state);
  const { seat, visible, scopeLabel } = scopeFilter(state, at, cfg);

  const allPeople = (Array.isArray(state.people) ? state.people : []).filter((p) => p && p.id);
  const visiblePeople = allPeople.filter((p) => visible(p.id));
  const withheldN = allPeople.length - visiblePeople.length;

  // The as-of reading is scoped by rebuilding the state view the reader sees,
  // so a scoped seat's denominator is its own span — never the workspace's.
  const scopedState = { ...state, people: visiblePeople };
  const targetDay = dayOf(asOf) || today;
  const reading = readStructureAsOf(scopedState, targetDay, { now: at, settings: cfg, ledger: book });

  const compareFrom = dayOf(fromISO) || addDays(targetDay, -conv.structureHistoryReviewDays);
  const compareTo = dayOf(toISO) || targetDay;
  const fromReading = compareFrom && compareFrom !== compareTo
    ? readStructureAsOf(scopedState, compareFrom, { now: at, settings: cfg, ledger: book })
    : null;
  const diff = fromReading ? diffStructures(fromReading, readStructureAsOf(scopedState, compareTo, { now: at, settings: cfg, ledger: book })) : null;

  const acts = reconcileActs(
    { ...state, people: visiblePeople },
    { now: at, settings: cfg, ledger: book },
  );

  // Recent moves inside the declared review window — the reader's attention
  // list, decided from the stored periods, never from a heuristic.
  const windowStart = addDays(today, -conv.structureHistoryReviewDays);
  const recentMoves = book.records
    .filter((r) => visible(r.personId) && r.fromISO >= windowStart && r.fromISO <= today)
    .map((r) => ({
      recordId: r.id,
      personId: r.personId,
      personName: nameOf((Array.isArray(state.people) ? state.people : []).find((p) => p.id === r.personId)?.name, r.personId),
      managerId: r.managerId,
      managerName: r.managerId === LEADER_ID
        ? nameOf(cfg.leaderName, 'You (workspace leader)')
        : nameOf((Array.isArray(state.people) ? state.people : []).find((p) => p.id === r.managerId)?.name, r.managerId),
      fromISO: r.fromISO,
      daysAgo: daysBetween(r.fromISO, today) ?? 0,
      reason: r.reason,
      recordedOn: r.recordedOn,
    }))
    .sort((a, b) => String(b.fromISO).localeCompare(String(a.fromISO)) || String(a.personName).localeCompare(String(b.personName)))
    .slice(0, STRUCTURE_HISTORY_LIMITS.rows);

  const board = {
    peopleN: visiblePeople.length,
    withheldN,
    recordedPeopleN: [...book.byPerson.keys()].filter((pid) => visible(pid)).length,
    unrecordedPeopleN: visiblePeople.length - [...book.byPerson.keys()].filter((pid) => visible(pid)).length,
    recordsN: book.records.filter((r) => visible(r.personId)).length,
    defectsN: book.defects.filter((d) => visible(d.personId)).length,
    coverageStart: book.firstRecordedDay,
    recentMoveN: recentMoves.length,
    actsN: acts.actsN,
    driftedN: acts.driftedN,
    unverifiableN: acts.unverifiableN,
    undatedN: acts.undatedN,
    consistentN: acts.consistentN,
  };

  return {
    engineVersion: STRUCTURE_HISTORY_ENGINE_VERSION,
    generatedOn: today,
    conventions: conv,
    seat: { id: seat.id, label: seat.label || seat.id, rank: seat.rank ?? null, fullAccess: Boolean(seat.fullAccess) },
    scopeLabel,
    method: STRUCTURE_HISTORY_METHOD,
    verdicts: STRUCTURE_VERDICTS,
    changes: STRUCTURE_CHANGE_KINDS,
    isRecorded: Boolean(book.firstRecordedDay),
    board,
    reading,
    comparison: diff,
    acts,
    recentMoves,
    defects: book.defects.filter((d) => visible(d.personId)),
    singleChainNote: !book.firstRecordedDay
      ? 'No home-line history has been recorded in this workspace yet. The structure of every day before today is genuinely unknown, not “probably like today”, and this reading says so rather than projecting.'
      : null,
  };
}

/** The identity-free brief. Counts only: no person, no manager, no act id. */
export function structureHistoryBriefText(report) {
  if (!report) return '';
  const b = report.board;
  const lines = [];
  lines.push(`Structure history — read from ${report.scopeLabel} on ${report.generatedOn}.`);
  if (!report.isRecorded) {
    lines.push('No home-line history is recorded, so the structure of every past day is unknown. Nothing is projected backwards from today’s roster.');
  } else {
    lines.push(`The home-line ledger begins ${b.coverageStart} and holds ${b.recordsN} recorded period(s) across ${b.recordedPeopleN} of ${b.peopleN} person(s) in scope.`);
    lines.push(`${b.unrecordedPeopleN} person(s) have no recorded home-line history at all; the structure on any past day is unknown for them.`);
  }
  lines.push(`${b.recentMoveN} home-line move(s) fall inside the declared ${report.conventions.structureHistoryReviewDays}-day review window.`);
  if (report.reading) {
    lines.push(`As of ${report.reading.asOf} the reading is “${report.reading.verdict}”: ${report.reading.verdictMeta.detail}`);
    if (report.reading.readingRefused) lines.push(`Every span is withheld: ${report.reading.refusedReason}`);
    else lines.push(`${report.reading.observedN} person(s) observed across ${report.reading.managerN} manager span(s); the spans ${report.reading.spansReconcile ? 'reconcile exactly against the observed headcount' : 'DO NOT reconcile and must not be relied on'}.`);
  }
  const a = report.acts;
  lines.push(`${a.actsN} stored act(s) name a manager. ${a.consistentN} read against the structure of their own day, ${a.driftedN} read against a structure that was not there, ${a.unverifiableN} cannot be checked, ${a.undatedN} carry no date.`);
  if (a.driftedN) lines.push('Drift is reported, not corrected: no act is re-pointed, migrated or withdrawn.');
  if (b.withheldN) lines.push(`${b.withheldN} person(s) sit outside this seat and are counted, not shown.`);
  return lines.join(' ');
}

/**
 * CSV scope #111 — aggregate only. One summary row per requested as-of date plus
 * one row per act source. No person, no name, no manager id, no act id, no free
 * text. A refused figure is BLANK with the reason in its own column, never a
 * zero.
 */
export function structureHistoryCsvRows(report) {
  if (!report) return [];
  const blank = (v) => (v === null || v === undefined ? '' : String(v));
  const rows = [];
  const r = report.reading;

  rows.push({
    row_kind: 'as-of',
    as_of: r?.asOf || '',
    days_ago: blank(r?.daysAgo),
    roster_n: blank(report.board.peopleN),
    observed_n: blank(r?.observedN),
    unknown_n: blank(r?.unknownN),
    not_on_roster_n: blank(r?.notOnRosterN),
    verdict: r?.verdict || '',
    reading_refused: r ? (r.readingRefused ? 'true' : 'false') : '',
    refused_reason: r?.readingRefused ? r.refusedReason || '' : '',
    moves_n: blank(report.comparison?.movedN),
    gained_n: blank(report.comparison?.appearedN),
    lost_n: blank(report.comparison?.disappearedN),
    held_n: blank(report.comparison?.heldN),
    manager_n: r?.readingRefused ? '' : blank(r?.managerN),
    act_source: '',
    acts_n: '',
    acts_consistent_n: '',
    acts_drifted_n: '',
    acts_unverifiable_n: '',
    acts_undated_n: '',
    uncovered_from: blank(report.comparison?.comparable === false ? report.comparison.fromISO : ''),
    coverage_start: report.board.coverageStart || '',
  });

  for (const source of report.acts.sources) {
    rows.push({
      row_kind: 'act-source',
      as_of: '',
      days_ago: '',
      roster_n: '',
      observed_n: '',
      unknown_n: '',
      not_on_roster_n: '',
      verdict: '',
      reading_refused: '',
      refused_reason: '',
      moves_n: '',
      gained_n: '',
      lost_n: '',
      held_n: '',
      manager_n: '',
      act_source: source.key,
      acts_n: blank(source.actsN),
      acts_consistent_n: blank(source.consistentN),
      acts_drifted_n: blank(source.driftedN),
      acts_unverifiable_n: blank(source.unverifiableN),
      acts_undated_n: blank(source.undatedN),
      uncovered_from: '',
      coverage_start: '',
    });
  }

  return rows.slice(0, STRUCTURE_HISTORY_LIMITS.rows);
}

/** Attention badge: moves inside the review window plus drifted acts. */
export function structureHistoryAttentionCount(state = {}, { now = new Date(), settings = null } = {}) {
  const report = buildStructureHistoryReport(state, { now, settings });
  return report.board.recentMoveN + report.acts.driftedN + report.board.defectsN;
}
