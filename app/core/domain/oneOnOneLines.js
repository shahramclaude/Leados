/**
 * app/core/domain/oneOnOneLines.js — Matrix 1:1 Line Coverage (Schema v132).
 * ADR-0164 and `#/matrix?panel=one-on-ones` remain reserved.
 *
 * THE QUESTION, IN AN OPERATOR'S WORDS. "Sam sits 60% in my engineering team
 * and 40% on Priya's programme. The people list says Sam's 1:1 is on track. Is
 * that MY weekly meeting, or hers? Because if Priya has not sat down with Sam
 * since the line was declared, the roster is green and nobody knows."
 *
 * The legacy person-level cadence reads "the latest meeting with this person"
 * regardless of who held it. The holder on newer meetings, or a manager's
 * explicit claim on an older meeting, lets this reader separate those lines.
 *
 * WHAT IT BUILDS. For every person on more than one live line, one row per
 * (person, line) pair, read from the held 1:1s attributed to THAT line's
 * manager and from nothing else; the per-person reading every other screen
 * prints, beside it; and the count of people for whom the two disagree.
 *
 * THE THREE CLAIMS IT KEEPS APART (Bulletproof Reliability Mandate)
 *   1. "This line met this person"      proven only by an attributed held 1:1.
 *   2. "This line is silent"            proven only when no unattributed 1:1
 *                                       could change the reading.
 *   3. "The record cannot tell"         printed as its own state — never folded
 *                                       into either of the other two.
 *
 * TWO IDENTITIES, PRINTED AND TESTED
 *   pairs          = ok + due + overdue + never + new + unproven + exempt
 *   held meetings  = home + line + other + dangling + unattributed
 *
 * Session 227 wires this reader to stored holders and a scoped API adapter.
 * The matrix panel, automatic reminder rule and CSV registration are unbuilt.
 *
 * Pure module: no DOM, no storage, no implicit clock.
 */

import { addDays, dayKey, daysBetween } from '../time.js';
import { LEADER_ID } from './chain.js';
import { cadence } from './oneonone.js';
import { activeSeat, buildSeats, canAct, canSee } from './seat.js';
import { buildMatrix, matrixLineScopeFor } from './matrix.js';
import { normalizeOneOnOneLineSettings } from './oneOnOneLineSchema.js';
import {
  ONE_ON_ONE_ATTRIBUTIONS,
  ONE_ON_ONE_LINE_CSV_COLUMNS,
  ONE_ON_ONE_LINE_ENGINE_VERSION,
  ONE_ON_ONE_LINE_LIMITS,
  ONE_ON_ONE_LINE_OVERDUE,
  ONE_ON_ONE_LINE_RIGHTS,
  ONE_ON_ONE_LINE_SILENT_STATES,
  ONE_ON_ONE_LINE_STATES,
  ONE_ON_ONE_LINE_STATE_KEYS,
  ONE_ON_ONE_LINE_STATE_LABELS,
  ONE_ON_ONE_LINE_STATE_TONES,
  ONE_ON_ONE_PERSON_VERDICT_LABELS,
  ONE_ON_ONE_PERSON_VERDICT_TONES,
  oneOnOnePersonVerdict,
} from './oneOnOneLineRegistry.js';

/* ------------------------------------------------------------ small helpers */

const S = ONE_ON_ONE_LINE_STATES;
const SEVERITY = Object.freeze({ ok: 0, due: 1, overdue: 2, never: 3 });

function dayOf(value) {
  const s = typeof value === 'string' ? value.trim().slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null;
}

function nameOf(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The cadence reading of a gap, in exact integers. Identical thresholds to the
 * per-person engine (`oneonone.js`): due from the interval, overdue beyond
 * 3/2 of it — written as 2d > 3i so no float can round the two apart.
 */
export function oneOnOneLineReading(daysSince, intervalDays) {
  if (!Number.isInteger(daysSince) || !Number.isInteger(intervalDays) || intervalDays < 1) return null;
  if (ONE_ON_ONE_LINE_OVERDUE.denominator * daysSince > ONE_ON_ONE_LINE_OVERDUE.numerator * intervalDays) return 'overdue';
  if (daysSince >= intervalDays) return 'due';
  return 'ok';
}

/** The stable key of one (person, line) pair, shared with RULE-OOL-01's markers. */
export function oneOnOneLineKey(line) {
  if (!line) return '';
  return line.role === 'home'
    ? `home|${line.personId}|${line.managerId}`
    : `line|${line.declarationId || line.lineId}`;
}

function emptyStateCounts() {
  return Object.fromEntries(ONE_ON_ONE_LINE_STATE_KEYS.map((key) => [key, 0]));
}

function emptyMeetingCounts() {
  return { heldN: 0, homeN: 0, lineN: 0, otherN: 0, danglingN: 0, unattributedN: 0 };
}

/* ------------------------------------------------------------------ scoping */

/**
 * Disclosure is decided by the SAME policy every other read of a 1:1 uses
 * (`canSee` on the `oneOnOnes` collection), asked once per person:
 *   full       the person and each line are printed by name.
 *   aggregate  the person is counted; no name and no row is built.
 *   denied     outside this seat: counted as withheld, in no figure at all.
 */
function scopeFor(state, at, cfg, matrix) {
  const lineScope = matrixLineScopeFor(state, { now: at, settings: cfg });
  const built = buildSeats(state, { now: at, settings: cfg, ...(lineScope ? { lineScope } : {}) });
  const seat = activeSeat(built);
  const disclose = (personId) => {
    if (seat.fullAccess) return 'full';
    const verdict = canSee({ personId }, 'oneOnOnes', seat, built).allow;
    // A person can also reach this seat through a subordinate's additional
    // line. The canonical DAG proves that reach, but it grants counts only,
    // never the sideways 1:1 detail that the seat policy would deny.
    if (verdict === 'denied' && !seat.readOnly && matrix.nodes.get(personId)?.ancestors.has(seat.id)) return 'aggregate';
    return verdict;
  };
  const scopeLabel = seat.fullAccess
    ? 'the whole workspace'
    : seat.readOnly
      ? 'an unresolved seat (counts only)'
      : `${nameOf(seat.name, seat.id)}’s span, declared lines and aggregate-only matrix descendants`;
  return { seat, disclose, scopeLabel };
}

/* ------------------------------------------------------------ the pair state */

/**
 * One (person, line) pair.
 *
 * Order matters and is the whole method:
 *   1. a line below the share floor owes nothing              → exempt
 *   2. an attributed 1:1 inside the interval                  → ok
 *   3. no attributed 1:1 yet, line younger than one interval  → new
 *   4. a LATER unattributed 1:1 that would read ok or due     → unproven
 *   5. otherwise what the attributed record proves            → due / overdue / never
 *
 * Step 4 never fires when the unattributed meeting would still leave the line
 * overdue: the line is silent either way, and saying so is not a guess.
 */
function pairState({ owes, intervalDays, lastHeldOn, lastUnattributedOn, startedOn, today }) {
  if (!owes) return S.exempt;
  const proven = lastHeldOn ? oneOnOneLineReading(daysBetween(lastHeldOn, today), intervalDays) : null;
  if (proven === 'ok') return S.ok;
  if (!lastHeldOn && startedOn) {
    const age = daysBetween(startedOn, today);
    if (Number.isInteger(age) && age >= 0 && age < intervalDays) return S.fresh;
  }
  if (lastUnattributedOn && (!lastHeldOn || lastUnattributedOn > lastHeldOn)) {
    const possible = oneOnOneLineReading(daysBetween(lastUnattributedOn, today), intervalDays);
    const provenRank = proven ? SEVERITY[proven] : SEVERITY.never;
    if (possible && SEVERITY[possible] < SEVERITY.overdue && SEVERITY[possible] < provenRank) return S.unproven;
    // An old unattributed meeting could still have been this manager's. It
    // proves the line is overdue either way, not that a 1:1 was *never* held.
    if (!proven && possible === 'overdue') return S.overdue;
  }
  return proven || S.never;
}

function pairReason(line, conv) {
  const who = line.managerName;
  const held = line.lastHeldOn ? `Last 1:1 held by ${who} on ${line.lastHeldOn}, ${plural(line.daysSince, 'day')} ago` : `No held 1:1 is attributed to ${who}`;
  switch (line.state) {
    case S.exempt:
      return `Declared share ${line.sharePct}% is below the ${conv.oneOnOneLineMinSharePct}% floor, so this line owes no standing 1:1.`;
    case S.ok:
      return `${held}; the next is due by ${line.dueOn}.`;
    case S.fresh:
      return `The line began ${line.startedOn}; its first 1:1 is due by ${line.dueOn}.`;
    case S.unproven:
      return line.uncertainDateN
        ? `${held}. ${plural(line.uncertainDateN, 'held 1:1')} may belong to this line but has an unverified date; its fallback date is not evidence, so the line cannot be read.`
        : `${held}. An unattributed 1:1 on ${line.lastUnattributedOn} may have been this line’s; until its holder is recorded, this line cannot be read.`;
    case S.due:
      return `${held} — past the ${line.intervalDays}-day interval (due ${line.dueOn}).`;
    case S.overdue:
      return line.lastHeldOn
        ? `${held} — beyond ${ONE_ON_ONE_LINE_OVERDUE.label} of ${line.intervalDays} days.`
        : `${held}. The latest unattributed 1:1 (${line.lastUnattributedOn}) would still leave this line overdue; it may have been held, so “never” cannot be claimed.`;
    default:
      return `${held}${line.startedOn ? `; the line has stood since ${line.startedOn}` : ''}.${line.lastUnattributedOn ? ` The latest unattributed 1:1 (${line.lastUnattributedOn}) would still leave it overdue.` : ''}`;
  }
}

/* ------------------------------------------------------------- the register */

/** People whose current reporting graph cannot safely support a line reading. */
function structuralIssues(state, matrix, today) {
  const rows = Array.isArray(state.reportingLines) ? state.reportingLines.filter(Boolean) : [];
  const rawById = new Map(rows.map((row) => [row.id, row]));
  const possibleNow = (row) => {
    if (!row) return true;
    const from = dayOf(row.fromISO);
    const to = dayOf(row.toISO);
    return !(from && from > today) && !(to && to < today);
  };
  const issues = new Map();
  const add = (personId, reason) => {
    if (!personId) return;
    if (!issues.has(personId)) issues.set(personId, new Set());
    issues.get(personId).add(reason);
  };
  for (const defect of matrix.defects || []) {
    if (possibleNow(defect.lineId ? rawById.get(defect.lineId) : null)) {
      add(defect.personId, 'An active or undated reporting-line defect makes the graph incomplete.');
    }
  }
  // The matrix DAG deliberately represents only one edge to a manager, but a
  // malformed import can contain two active declarations to that same manager
  // with different kinds. A holder alone cannot distinguish those lines.
  const seen = new Set();
  for (const row of rows.filter(possibleNow)) {
    const key = `${row.personId}|${row.managerId}`;
    if (seen.has(key)) add(row.personId, 'Several active declarations name the same manager; a holder cannot distinguish those lines.');
    seen.add(key);
  }
  for (const [personId, lines] of matrix.linesByPerson) {
    const node = matrix.chain.nodes.get(personId);
    if (node?.inCycle || lines.some((line) => matrix.chain.nodes.get(line.managerId)?.inCycle)) {
      add(personId, 'A reporting-line cycle prevents a trustworthy coverage reading.');
    }
  }
  return issues;
}

/**
 * The whole register, built under the acting seat.
 *
 * `matrix` may be supplied by a caller that has already built it (the rule
 * does); it must be the matrix of the SAME state, clock and settings.
 */
export function buildOneOnOneLines(state = {}, { now = new Date(), settings = null, matrix = null } = {}) {
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const today = dayKey(at) || new Date().toISOString().slice(0, 10);
  const cfg = settings || state.settings || {};
  const conv = normalizeOneOnOneLineSettings(cfg);
  // The home line is held to the workspace's EXISTING convention, read with the
  // same expression the per-person engine uses, so the two cannot diverge.
  const rawHome = Number(cfg.oneOnOneCadenceDays ?? 7);
  const homeCadenceDays = Number.isInteger(rawHome) && rawHome >= 1 ? rawHome : 7;
  const live = matrix || buildMatrix(state, { now: at, settings: cfg });
  const { seat, disclose, scopeLabel } = scopeFor(state, at, cfg, live);
  const issues = structuralIssues(state, live, today);

  const people = Array.isArray(state.people) ? state.people : [];
  const activeIds = new Set(people.filter((p) => p && p.status !== 'archived').map((p) => p.id));
  const nameById = new Map(people.map((p) => [p.id, nameOf(p.name, p.id)]));
  const managerName = (id) => (id === LEADER_ID ? 'the workspace leader' : nameById.get(id) || `${id} (not on the roster)`);

  // Held meetings are indexed once. A future meeting has not happened; a
  // repaired/missing date is counted but never treated as dated evidence.
  const heldByPerson = new Map();
  const futureByPerson = new Map();
  for (const meeting of Array.isArray(state.oneOnOnes) ? state.oneOnOnes : []) {
    if (!meeting || meeting.status !== 'held') continue;
    const parsed = dayOf(meeting.date);
    const dateUncertain = meeting.dateUncertain === true || !parsed;
    if (!dateUncertain && parsed > today) {
      futureByPerson.set(meeting.personId, (futureByPerson.get(meeting.personId) || 0) + 1);
      continue;
    }
    if (!heldByPerson.has(meeting.personId)) heldByPerson.set(meeting.personId, []);
    heldByPerson.get(meeting.personId).push({
      id: meeting.id,
      date: dateUncertain ? null : parsed,
      dateUncertain,
      heldById: typeof meeting.heldById === 'string' && meeting.heldById ? meeting.heldById : null,
      heldByBasis: meeting.heldByBasis || null,
    });
  }

  const persons = [];
  const states = emptyStateCounts();
  const meetings = emptyMeetingCounts();
  const byKind = new Map();
  const claimable = [];
  const refusedPersons = [];
  let structuralRefusedN = 0;
  let aggregateRefusedN = 0;
  let uncertainDateN = 0;
  let futureHeldN = 0;
  let peopleN = 0;
  let namedN = 0;
  let countedOnlyN = 0;
  let withheldN = 0;
  let pairsN = 0;
  let owingN = 0;
  let maskedN = 0;
  let silentPairsN = 0;
  let claimableTotal = 0;

  const linesByPerson = live.linesByPerson instanceof Map ? live.linesByPerson : new Map();
  const personIds = [...new Set([...linesByPerson.keys(), ...issues.keys()])]
    .sort((a, b) => String(nameById.get(a) || a).localeCompare(String(nameById.get(b) || b)) || String(a).localeCompare(String(b)));

  for (const personId of personIds) {
    const liveLines = (linesByPerson.get(personId) || []).filter((l) => l && l.active !== false);
    // A defect may have prevented the second line from being wired at all. It
    // must be refused explicitly rather than misreported as single-chain.
    if (!liveLines.some((l) => l.role !== 'primary') && !issues.has(personId)) continue;

    const allow = disclose(personId);
    if (allow !== 'full' && allow !== 'aggregate') { withheldN += 1; continue; }
    if (issues.has(personId)) {
      structuralRefusedN += 1;
      if (allow === 'full') refusedPersons.push({ personId, personName: nameById.get(personId) || personId, reason: [...issues.get(personId)].join(' ') });
      else aggregateRefusedN += 1;
      continue;
    }
    peopleN += 1;
    if (allow === 'full') namedN += 1; else countedOnlyN += 1;

    const held = (heldByPerson.get(personId) || []).slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.id).localeCompare(String(a.id)));
    const dated = held.filter((meeting) => !meeting.dateUncertain);
    const undated = held.filter((meeting) => meeting.dateUncertain);
    uncertainDateN += undated.length;
    futureHeldN += futureByPerson.get(personId) || 0;
    const home = liveLines.find((l) => l.role === 'primary') || null;
    const homeManagerId = home ? home.managerId : null;
    const additionalManagerIds = new Set(liveLines.filter((l) => l.role !== 'primary').map((l) => l.managerId));

    // --- every held meeting lands in exactly one attribution class
    const own = emptyMeetingCounts();
    for (const meeting of held) {
      own.heldN += 1;
      if (!meeting.heldById) { meeting.attribution = ONE_ON_ONE_ATTRIBUTIONS.unattributed; own.unattributedN += 1; }
      else if (meeting.heldById === homeManagerId) { meeting.attribution = ONE_ON_ONE_ATTRIBUTIONS.home; own.homeN += 1; }
      else if (additionalManagerIds.has(meeting.heldById)) { meeting.attribution = ONE_ON_ONE_ATTRIBUTIONS.line; own.lineN += 1; }
      else if (meeting.heldById === LEADER_ID || activeIds.has(meeting.heldById)) { meeting.attribution = ONE_ON_ONE_ATTRIBUTIONS.other; own.otherN += 1; }
      else { meeting.attribution = ONE_ON_ONE_ATTRIBUTIONS.dangling; own.danglingN += 1; }
    }
    for (const key of Object.keys(meetings)) meetings[key] += own[key];

    const unattributed = dated.filter((m) => !m.heldById);
    const lastUnattributedOn = unattributed.length ? unattributed[0].date : null;

    // --- one row per line, home first
    const ordered = [...liveLines].sort((a, b) => (a.role === 'primary' ? 0 : 1) - (b.role === 'primary' ? 0 : 1)
      || String(a.kind || '').localeCompare(String(b.kind || '')) || String(a.id).localeCompare(String(b.id)));
    const lines = [];
    const ownStates = emptyStateCounts();
    for (const l of ordered) {
      const role = l.role === 'primary' ? 'home' : 'additional';
      const shareDeclared = Number.isFinite(l.shareH) && l.shareInvalid !== true;
      const sharePct = shareDeclared ? l.shareH : null;
      // Evidence is needed to exempt a line. No declared share, no exemption.
      const owes = role === 'home' ? true : !(shareDeclared && sharePct < conv.oneOnOneLineMinSharePct);
      const intervalDays = role === 'home' ? homeCadenceDays : conv.oneOnOneLineCadenceDays;
      const credited = dated.filter((m) => m.heldById === l.managerId);
      const last = credited[0] || null;
      const lastHeldOn = last ? last.date : null;
      const startedOn = dayOf(l.fromISO);
      const uncertainForLine = undated.filter((m) => !m.heldById || m.heldById === l.managerId).length;
      let state_ = pairState({ owes, intervalDays, lastHeldOn, lastUnattributedOn, startedOn, today });
      if (owes && uncertainForLine && state_ !== S.ok) state_ = S.unproven;
      const row = {
        lineId: l.id,
        declarationId: l.declarationId || null,
        personId,
        personName: nameById.get(personId) || personId,
        role,
        kind: l.kind || '',
        managerId: l.managerId,
        managerName: managerName(l.managerId),
        managerOnRoster: l.managerId === LEADER_ID || activeIds.has(l.managerId),
        shareDeclared,
        sharePct,
        owes,
        intervalDays,
        startedOn,
        creditedN: credited.length,
        lastHeldOn,
        lastMeetingId: last ? last.id : null,
        lastHeldBasis: last ? last.heldByBasis : null,
        daysSince: lastHeldOn ? daysBetween(lastHeldOn, today) : null,
        dueOn: lastHeldOn ? addDays(lastHeldOn, intervalDays) : startedOn ? addDays(startedOn, intervalDays) : null,
        lastUnattributedOn: state_ === S.unproven || state_ === S.never || (state_ === S.overdue && !lastHeldOn) ? lastUnattributedOn : null,
        uncertainDateN: uncertainForLine,
        state: state_,
        stateLabel: ONE_ON_ONE_LINE_STATE_LABELS[state_],
        tone: ONE_ON_ONE_LINE_STATE_TONES[state_],
        silent: owes && ONE_ON_ONE_LINE_SILENT_STATES.includes(state_),
        canRelease: Boolean(last) && (Boolean(seat.fullAccess) || (!seat.readOnly && seat.id === l.managerId)),
      };
      row.lineKey = oneOnOneLineKey(row);
      row.reason = pairReason(row, conv);
      lines.push(row);

      ownStates[state_] += 1;
      states[state_] += 1;
      pairsN += 1;
      if (owes) owingN += 1;
      if (row.silent) silentPairsN += 1;
      const kindKey = `${role}|${row.kind}`;
      if (!byKind.has(kindKey)) byKind.set(kindKey, { role, kind: row.kind, pairsN: 0, owingN: 0, states: emptyStateCounts() });
      const bucket = byKind.get(kindKey);
      bucket.pairsN += 1;
      if (owes) bucket.owingN += 1;
      bucket.states[state_] += 1;
    }

    // --- the reading every other screen prints, and whether it hides a line
    const legacy = cadence(state, personId, at, cfg);
    const silentN = lines.filter((l) => l.silent).length;
    const masked = legacy.status === 'ok' && silentN > 0;
    if (masked) maskedN += 1;

    // --- unattributed meetings that could change a reading: the human remedy
    if (allow === 'full') {
      const candidates = lines.map((l) => ({ managerId: l.managerId, managerName: l.managerName, role: l.role, kind: l.kind }));
      for (const meeting of unattributed) {
        const gap = daysBetween(meeting.date, today);
        const matters = lines.some((l) => l.state === S.unproven
          && (!l.lastHeldOn || meeting.date > l.lastHeldOn)
          && ['ok', 'due'].includes(oneOnOneLineReading(gap, l.intervalDays)));
        if (!matters) continue;
        claimableTotal += 1;
        if (claimable.length >= ONE_ON_ONE_LINE_LIMITS.claimableList) continue;
        claimable.push({
          meetingId: meeting.id,
          personId,
          personName: nameById.get(personId) || personId,
          date: meeting.date,
          daysAgo: gap,
          candidates,
        });
      }
    }

    if (allow !== 'full') continue;
    const verdict = oneOnOnePersonVerdict({ masked, silentN, unprovenN: ownStates.unproven, dueN: ownStates.due, newN: ownStates.new });
    persons.push({
      personId,
      personName: nameById.get(personId) || personId,
      legacy: {
        status: legacy.status,
        lastHeldDate: legacy.lastHeldDate,
        daysSinceHeld: legacy.daysSinceHeld,
        expectedDays: legacy.expectedDays,
      },
      lines,
      counts: { lines: lines.length, owing: lines.filter((l) => l.owes).length, silent: silentN, states: ownStates },
      meetings: own,
      masked,
      verdict,
      verdictLabel: ONE_ON_ONE_PERSON_VERDICT_LABELS[verdict],
      tone: ONE_ON_ONE_PERSON_VERDICT_TONES[verdict],
    });
  }

  claimable.sort((a, b) => b.date.localeCompare(a.date) || String(a.personName).localeCompare(String(b.personName)) || String(a.meetingId).localeCompare(String(b.meetingId)));

  const stateSum = ONE_ON_ONE_LINE_STATE_KEYS.reduce((sum, key) => sum + states[key], 0);
  const classSum = meetings.homeN + meetings.lineN + meetings.otherN + meetings.danglingN + meetings.unattributedN;
  const canLog = !seat.readOnly && canAct(ONE_ON_ONE_LINE_RIGHTS.LOG, seat).allow;

  const board = {
    peopleN,
    namedN,
    countedOnlyN,
    // A scoped seat is not entitled to a count of people outside its span.
    withheldN: seat.fullAccess ? withheldN : null,
    structuralRefusedN,
    aggregateRefusedN,
    uncertainDateN,
    futureHeldN,
    pairsN,
    owingN,
    okN: states.ok,
    dueN: states.due,
    overdueN: states.overdue,
    neverN: states.never,
    newN: states.new,
    unprovenN: states.unproven,
    exemptN: states.exempt,
    silentPairsN,
    maskedN,
    statesReconcile: stateSum === pairsN,
    heldN: meetings.heldN,
    homeN: meetings.homeN,
    lineN: meetings.lineN,
    otherN: meetings.otherN,
    danglingN: meetings.danglingN,
    unattributedN: meetings.unattributedN,
    meetingsReconcile: classSum === meetings.heldN,
    claimableN: claimableTotal,
    claimableShownN: claimable.length,
  };

  const kinds = [...byKind.values()].sort((a, b) => (a.role === 'home' ? 0 : 1) - (b.role === 'home' ? 0 : 1) || String(a.kind).localeCompare(String(b.kind)));

  return {
    engineVersion: ONE_ON_ONE_LINE_ENGINE_VERSION,
    generatedOn: today,
    isMatrix: peopleN > 0 || structuralRefusedN > 0,
    singleChainNote: 'No multi-line person is visible in this scope. The existing per-person 1:1 cadence is unchanged; it is not evidence of who held an unattributed meeting.',
    conventions: {
      homeCadenceDays,
      lineCadenceDays: conv.oneOnOneLineCadenceDays,
      minSharePct: conv.oneOnOneLineMinSharePct,
      askDueDays: conv.oneOnOneLineAskDueDays,
      autoPropagate: conv.oneOnOneLineAutoPropagate,
      overdueLabel: ONE_ON_ONE_LINE_OVERDUE.label,
    },
    seat: { id: seat.id, name: nameOf(seat.name, seat.id), label: seat.label || seat.id, rank: seat.rank ?? null, fullAccess: Boolean(seat.fullAccess), readOnly: Boolean(seat.readOnly) },
    actor: {
      // The operator view names a holder; a declared seat claims its own.
      canAttribute: Boolean(seat.fullAccess),
      canClaim: !seat.fullAccess && canLog,
      canGovern: Boolean(seat.fullAccess) && !seat.readOnly && canAct(ONE_ON_ONE_LINE_RIGHTS.GOVERN, seat).allow,
      // The scan command is reserved, not implemented in this slice.
      canScan: false,
    },
    scope: seat.fullAccess ? 'workspace' : 'seat',
    scopeLabel,
    disclosure: countedOnlyN > 0 && namedN === 0 ? 'aggregate' : countedOnlyN > 0 ? 'mixed' : 'detail',
    persons,
    refusedPersons,
    kinds,
    claimable,
    board,
  };
}

/* ------------------------------------------------------------------- outputs */

/** One identity-free paragraph. Safe to paste into a leadership note. */
export function oneOnOneLineBriefText(report) {
  const b = report.board;
  const c = report.conventions;
  const lines = [`Matrix 1:1 line coverage — read from ${report.scope === 'workspace' ? 'the whole workspace' : 'the acting seat’s span and its declared lines'} on ${report.generatedOn}.`];
  if (!report.isMatrix) {
    lines.push(report.singleChainNote);
    return lines.join(' ');
  }
  if (b.structuralRefusedN) lines.push(`${plural(b.structuralRefusedN, 'person', 'people')} could not be read because the reporting graph is defective or ambiguous; the remaining figures are partial.`);
  lines.push(`${plural(b.peopleN, 'person', 'people')} ${b.peopleN === 1 ? 'sits' : 'sit'} on more than one readable reporting line, across ${plural(b.pairsN, '(person, line) pair')}; ${b.owingN} owe a standing 1:1 (home line every ${c.homeCadenceDays} days, an additional line every ${c.lineCadenceDays} days, exempt below a ${c.minSharePct}% share).`);
  lines.push(b.statesReconcile
    ? `On cadence ${b.okN}; due ${b.dueN}; overdue ${b.overdueN}; never held ${b.neverN}; new ${b.newN}; cannot be read ${b.unprovenN}; exempt ${b.exemptN} — ${b.pairsN} in all.`
    : 'THE PAIR STATES DO NOT ADD UP TO THE PAIR TOTAL; treat every figure in this note as unverified.');
  lines.push(b.maskedN
    ? `${plural(b.maskedN, 'person', 'people')} ${b.maskedN === 1 ? 'reads' : 'read'} on track on the people list while one of their lines is silent: another line’s meeting is masking it.`
    : 'No masked silent line was proven among the readable records.');
  lines.push(b.meetingsReconcile
    ? `Of ${plural(b.heldN, 'held 1:1')}: ${b.homeN} by the home line, ${b.lineN} by an additional line, ${b.otherN} by somebody who holds no line today, ${b.danglingN} by a holder no longer on the roster, and ${b.unattributedN} with no holder recorded.`
    : 'THE MEETING CLASSES DO NOT ADD UP TO THE HELD TOTAL; treat every figure in this note as unverified.');
  if (b.unprovenN) lines.push(`${plural(b.unprovenN, 'line')} cannot be read because a possible meeting lacks a holder or a trustworthy date; nothing is assumed either way.`);
  if (b.uncertainDateN) lines.push(`${plural(b.uncertainDateN, 'held 1:1')} has an unverified date; fallback dates are not used as evidence.`);
  if (b.futureHeldN) lines.push(`${plural(b.futureHeldN, 'future-dated held 1:1')} was excluded because it has not yet happened.`);
  if (b.withheldN) lines.push(`${plural(b.withheldN, 'person', 'people')} on more than one line ${b.withheldN === 1 ? 'sits' : 'sit'} outside this seat and ${b.withheldN === 1 ? 'is' : 'are'} counted here only as withheld.`);
  return lines.join(' ');
}

/** Reserved CSV helper: the scope is not registered in the running app. */
export function oneOnOneLineCsvRows(report) {
  const b = report.board;
  const c = report.conventions;
  const base = {
    generated_on: report.generatedOn,
    scope: report.scope,
    disclosure: report.disclosure,
    home_cadence_days: c.homeCadenceDays,
    line_cadence_days: c.lineCadenceDays,
    min_share_pct: c.minSharePct,
    engine_version: report.engineVersion,
  };
  const blank = Object.fromEntries(ONE_ON_ONE_LINE_CSV_COLUMNS.map((key) => [key, '']));
  const rows = [{
    ...blank,
    ...base,
    row_type: 'summary',
    people_on_several_lines: b.peopleN,
    people_withheld: b.withheldN,
    masked_people: b.maskedN,
    pairs: b.pairsN,
    pairs_owing: b.owingN,
    on_cadence: b.okN,
    due: b.dueN,
    overdue: b.overdueN,
    never_held: b.neverN,
    new_line: b.newN,
    cannot_be_read: b.unprovenN,
    exempt: b.exemptN,
    pair_states_reconcile: b.statesReconcile,
    held_meetings: b.heldN,
    held_by_home_line: b.homeN,
    held_by_additional_line: b.lineN,
    held_by_no_line_today: b.otherN,
    holder_not_on_roster: b.danglingN,
    no_holder_recorded: b.unattributedN,
    meeting_classes_reconcile: b.meetingsReconcile,
  }];
  for (const kind of report.kinds) {
    const sum = ONE_ON_ONE_LINE_STATE_KEYS.reduce((total, key) => total + kind.states[key], 0);
    rows.push({
      ...blank,
      ...base,
      row_type: 'line-kind',
      line_role: kind.role,
      line_kind: kind.kind,
      pairs: kind.pairsN,
      pairs_owing: kind.owingN,
      on_cadence: kind.states.ok,
      due: kind.states.due,
      overdue: kind.states.overdue,
      never_held: kind.states.never,
      new_line: kind.states.new,
      cannot_be_read: kind.states.unproven,
      exempt: kind.states.exempt,
      pair_states_reconcile: sum === kind.pairsN,
    });
  }
  return rows;
}

/** Proven-silent pairs in scope: the number a navigation badge would carry. */
export function oneOnOneLineAttentionCount(state = {}, { now = new Date(), settings = null } = {}) {
  return buildOneOnOneLines(state, { now, settings }).board.silentPairsN;
}
