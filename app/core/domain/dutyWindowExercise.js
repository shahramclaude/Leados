/**
 * app/core/domain/dutyWindowExercise.js — date-valid cover exercise for one
 * absence window (ADR-0125, Schema v115 unchanged).
 *
 * THE GAP THIS CLOSES
 * -------------------
 * ADR-0121/0122 asked whether a declared cover had *any* recent work touching
 * the holder's span. That is a standing-register reading. It is not the question
 * a frontline lead asks before a specific absence: "did this person practise
 * THIS duty in time for THESE dates?" An old case, a goal in a different duty
 * line, or a record dated after the absence starts cannot answer that.
 *
 * WHAT IS DERIVED, NEVER STORED
 * -----------------------------
 * For one duty line and one declared cover, the preparation evidence window is
 *
 *     [absence.from - dutyCoverageExerciseDays, absence.from - 1]
 *
 * inclusive ISO days, anchored to the absence start rather than to today. A
 * record counts only when it is:
 *   - of one of the duty's declared SIGNAL_SOURCES (not any work in the span);
 *   - dated inside that preparation window;
 *   - already recorded by today (future-dated work is not observed evidence);
 *   - touching the holder's span, with the cover appearing on the record.
 *
 * Closed work is included through the shared harvester's `includeClosed` path,
 * so a completed rehearsal does not vanish from the evidence. Derived 1:1
 * *cadence* items are excluded: an overdue-cadence synthesis is not a held
 * conversation. Actual held 1:1s are read from `oneOnOnes` and credit both the
 * report and the report's manager, exactly as the standing exercise index does.
 *
 * The module stores nothing. Change the window, the duty table, the cover or the
 * dated records and the next read re-derives the verdict.
 */

import { harvestWork } from './chain.js';
import { addDays, dayKey } from '../time.js';

const keyFor = (dutyKey, personId) => `${dutyKey}|${personId}`;
const recordKey = (evidence) => `${evidence.type}:${evidence.sourceId}:${evidence.day}`;

function touchesSpan(item, seat) {
  const people = Array.isArray(item.people) ? item.people : [];
  return people.some((pid) => seat.scope.has(pid))
    || Boolean(item.ownerNodeId && seat.scope.has(item.ownerNodeId));
}

/**
 * Build one holder seat's historical, duty-specific evidence index. The map key
 * is `<dutyKey>|<coverId>`; the value is evidence sorted newest first. Provenance
 * carries the source record id and route, but no person name and no free text.
 */
export function buildWindowExerciseIndex(state, built, seat, { now = new Date(), settings = null, duties = null } = {}) {
  const dutyLines = Array.isArray(duties) ? duties : (seat.fullAccess ? [] : (seat.duties || []));
  const out = new Map();
  if (!dutyLines.length) return out;

  const historical = harvestWork(state, built.chain, { now, settings: settings || state?.settings || null, includeClosed: true });
  const items = historical.filter((item) => item.type !== 'oneonone');
  const meetings = Array.isArray(state?.oneOnOnes) ? state.oneOnOnes : [];
  for (const meeting of meetings) {
    if (!meeting || meeting.status !== 'held' || !meeting.personId || !meeting.date) continue;
    const managerId = built.chain.byId.get(meeting.personId)?.parentId || null;
    items.push({
      type: 'oneonone',
      typeLabel: '1:1 held',
      entityId: meeting.id || `${meeting.personId}:${meeting.date}`,
      openedOn: dayKey(meeting.date),
      people: [meeting.personId, managerId].filter(Boolean),
      ownerNodeId: null,
      route: '#/oneonones',
    });
  }

  const add = (dutyKey, personId, evidence) => {
    const key = keyFor(dutyKey, personId);
    if (!out.has(key)) out.set(key, new Map());
    out.get(key).set(recordKey(evidence), evidence);
  };

  for (const duty of dutyLines) {
    const sources = new Set(Array.isArray(duty.sources) ? duty.sources : []);
    if (!sources.size) continue;
    for (const item of items) {
      if (!sources.has(item.type)) continue;
      const day = dayKey(item.openedOn);
      if (!day) continue;
      if (!touchesSpan(item, seat)) continue;
      const people = [...new Set((item.people || []).filter((pid) => typeof pid === 'string' && pid))];
      const evidence = {
        day,
        type: item.type,
        typeLabel: item.typeLabel || item.type,
        sourceId: item.entityId || null,
        route: item.route || null,
      };
      for (const personId of people) {
        if (!built.byId.has(personId)) continue;
        add(duty.key, personId, evidence);
      }
    }
  }

  const sorted = new Map();
  for (const [key, records] of out) {
    sorted.set(key, [...records.values()].sort((a, b) => (
      a.day < b.day ? 1 : a.day > b.day ? -1
        : String(a.type).localeCompare(String(b.type))
        || String(a.sourceId).localeCompare(String(b.sourceId))
    )));
  }
  return sorted;
}

const cloneEvidence = (evidence, observed) => (evidence ? { ...evidence, observed } : null);

/**
 * Grade one cover against one exact absence window. `status` is one of:
 *   valid   duty-specific evidence inside the preparation window, recorded by today
 *   stale   latest observed evidence is older than the preparation window
 *   late    observed evidence exists but falls after the preparation cutoff
 *   future  the only evidence is dated after today and is not yet observed
 *   missing no dated evidence of this duty's sources touches the span
 *
 * The reason text deliberately carries no person name and no source record id;
 * those live in the structured provenance and are redacted at the reporting seam.
 */
export function windowExerciseFor(index, dutyKey, coverId, window, { now = new Date(), exerciseDays = 30 } = {}) {
  const from = addDays(window.from, -exerciseDays);
  const to = addDays(window.from, -1);
  const today = dayKey(now);
  const entries = index?.get(keyFor(dutyKey, coverId)) || [];
  const observed = entries.filter((e) => e.day <= today);
  const future = entries.filter((e) => e.day > today);
  const valid = observed.filter((e) => e.day >= from && e.day <= to);
  const lastObserved = observed[0] || null;
  const lastFuture = future[0] || null;
  const base = { from, to, cutoffOn: to, days: exerciseDays, today };

  if (valid.length) {
    const evidence = valid[0];
    return {
      ...base,
      status: 'valid',
      exercised: true,
      evidence: cloneEvidence(evidence, true),
      lastEvidence: cloneEvidence(evidence, true),
      reason: `Duty-specific evidence recorded ${evidence.day} (${evidence.typeLabel}), inside the preparation window ${from} → ${to} for absence ${window.from} → ${window.to}.`,
    };
  }
  if (lastObserved && lastObserved.day > to) {
    return {
      ...base,
      status: 'late',
      exercised: false,
      evidence: null,
      lastEvidence: cloneEvidence(lastObserved, true),
      reason: `Duty-specific evidence on ${lastObserved.day} (${lastObserved.typeLabel}) is after the preparation cutoff ${to}; work during or after the absence does not prove pre-absence readiness for ${window.from} → ${window.to}.`,
    };
  }
  if (lastObserved) {
    return {
      ...base,
      status: 'stale',
      exercised: false,
      evidence: null,
      lastEvidence: cloneEvidence(lastObserved, true),
      reason: `Latest duty-specific evidence ${lastObserved.day} (${lastObserved.typeLabel}) is before the preparation window ${from} → ${to}; it does not prove readiness for absence ${window.from} → ${window.to}.`,
    };
  }
  if (lastFuture) {
    return {
      ...base,
      status: 'future',
      exercised: false,
      evidence: null,
      lastEvidence: cloneEvidence(lastFuture, false),
      reason: `A duty-specific record is dated ${lastFuture.day} (${lastFuture.typeLabel}), after today (${today}); future-dated work is not observed evidence for ${window.from} → ${window.to}.`,
    };
  }
  return {
    ...base,
    status: 'missing',
    exercised: false,
    evidence: null,
    lastEvidence: null,
    reason: `No dated work of this duty's sources touches the holder's span for this cover inside the preparation window ${from} → ${to}.`,
  };
}

/** Identity wall: above rank 2 the source record id is withheld; dates/counts survive. */
export function redactWindowExercise(exercise, namesVisible) {
  if (!exercise || namesVisible) return exercise || null;
  const strip = (e) => (e ? { ...e, sourceId: null } : null);
  return { ...exercise, evidence: strip(exercise.evidence), lastEvidence: strip(exercise.lastEvidence) };
}

/** Aggregate cover-status counts for a set of duty rows' available, eligible covers. */
export function summarizeWindowExercise(rows) {
  const summary = {
    gradedCoversN: 0,
    validCoversN: 0,
    staleCoversN: 0,
    missingCoversN: 0,
    futureCoversN: 0,
    lateCoversN: 0,
    validLinesN: 0,
    thinLinesN: 0,
  };
  for (const row of rows || []) {
    if (row.windowBand === 'covered') summary.validLinesN += 1;
    if (row.windowBand === 'thin') summary.thinLinesN += 1;
    for (const cover of row.covers || []) {
      if (!cover.available || !cover.eligible) continue;
      const status = cover.windowExercise?.status || 'missing';
      summary.gradedCoversN += 1;
      if (status === 'valid') summary.validCoversN += 1;
      else if (status === 'stale') summary.staleCoversN += 1;
      else if (status === 'future') summary.futureCoversN += 1;
      else if (status === 'late') summary.lateCoversN += 1;
      else summary.missingCoversN += 1;
    }
  }
  return summary;
}
