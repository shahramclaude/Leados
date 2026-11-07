/**
 * app/core/domain/dutyWindowExercise.js — date-valid cover exercise for one
 * absence window (ADR-0125, Schema v115; ADR-0128 adds explicit rehearsals,
 * Schema v117).
 *
 * THE GAP THIS CLOSES
 * -------------------
 * ADR-0121/0122 asked whether a declared cover had *any* recent work touching
 * the holder's span. That is a standing-register reading. It is not the question
 * a frontline lead asks before a specific absence: "did this person practise
 * THIS duty in time for THESE dates?" An old case, a goal in a different duty
 * line, or a record dated after the absence starts cannot answer that.
 *
 * ADR-0128 closes the remainder of that question: dated work is INFERRED
 * evidence — a cover cc'd on one case grades identically to a cover the holder
 * walked through the shift checklist. An explicit rehearsal record is the human
 * act itself: a seat that was there attests that the cover practised the duty
 * on a dated day, in a declared mode, with an outcome. A ready rehearsal inside
 * the preparation window therefore grades ABOVE inferred work (`rehearsed`);
 * a rehearsal that FOUND GAPS grades as its own `gaps` status and does NOT
 * make the cover exercised, because a drill that surfaced the exposure is the
 * drill working — certifying it anyway would make rehearsing counter-productive.
 * Inferred work evidence is never erased: with no rehearsal records the
 * reading is exactly ADR-0125's.
 *
 * WHAT IS DERIVED, NEVER STORED
 * -----------------------------
 * For one duty line and one declared cover, the preparation evidence window is
 *
 *     [absence.from - dutyCoverageExerciseDays, absence.from - 1]
 *
 * inclusive ISO days, anchored to the absence start rather than to today. A
 * record counts only when it is:
 *   - of one of the duty's declared SIGNAL_SOURCES (not any work in the span),
 *     or an active explicit rehearsal of THIS duty line by THIS cover;
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
import { DUTY_REHEARSAL_MODE_LABELS } from './dutyRehearsalRegistry.js';

const keyFor = (dutyKey, personId) => `${dutyKey}|${personId}`;
const recordKey = (evidence) => `${evidence.type}:${evidence.sourceId}:${evidence.day}`;

/** Evidence kind ranks: an explicit rehearsal outranks inferred dated work. */
const kindRank = (e) => (e.kind === 'rehearsal' ? 0 : 1);
/** Within rehearsals: a certified (ready) drill outranks a gaps-found one. */
const outcomeRank = (e) => (e.kind === 'rehearsal' ? (e.outcome === 'ready' ? 0 : 1) : 0);
/** Within rehearsals: holder attestation outranks supervisor outranks self-report. */
const ATTESTATION_RANKS = Object.freeze({ holder: 0, supervisor: 1, self: 2, 'third-party': 3 });
const attestationRank = (e) => (e.kind === 'rehearsal' ? (ATTESTATION_RANKS[e.attestation] ?? 4) : 0);

const ATTESTATION_TEXTS = Object.freeze({
  holder: 'attested by the duty holder',
  supervisor: 'attested by a leader above the holder',
  self: 'self-reported by the cover',
  'third-party': 'recorded by a seat outside the duty line',
});

function touchesSpan(item, seat) {
  const people = Array.isArray(item.people) ? item.people : [];
  return people.some((pid) => seat.scope.has(pid))
    || Boolean(item.ownerNodeId && seat.scope.has(item.ownerNodeId));
}

/** The leadership ancestors of the holder seat, for deriving attestation strength. */
function chainAncestors(built, seatId) {
  const out = new Set();
  let cursor = built.chain.nodes.get(seatId)?.parentId || null;
  let guard = 0;
  while (cursor && guard < 16) {
    out.add(cursor);
    cursor = built.chain.nodes.get(cursor)?.parentId || null;
    guard += 1;
  }
  return out;
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
        kind: 'work',
      };
      for (const personId of people) {
        if (!built.byId.has(personId)) continue;
        add(duty.key, personId, evidence);
      }
    }
  }

  // ADR-0128: explicit rehearsal records join the SAME index as first-class
  // evidence, keyed to the duty line and the cover who rehearsed it. A
  // rehearsal is not harvested work — it is a dated attestation — so it is
  // indexed from its own ledger, only for duties this holder seat declares,
  // and only for rows the schema kept (active, roster-checked on reload).
  const dutyKeys = new Set(dutyLines.map((d) => d.key));
  const ancestors = chainAncestors(built, seat.id);
  for (const row of Array.isArray(state?.dutyRehearsals) ? state.dutyRehearsals : []) {
    if (!row || row.status !== 'active') continue;
    if (row.seatId !== seat.id) continue;
    if (!dutyKeys.has(row.dutyKey)) continue;
    if (!built.byId.has(row.coverSeatId)) continue;
    const day = dayKey(row.rehearsedOn);
    if (!day) continue;
    const attestation = row.recordedBySeatId === row.seatId ? 'holder'
      : row.recordedBySeatId === row.coverSeatId ? 'self'
        : ancestors.has(row.recordedBySeatId) ? 'supervisor'
          : 'third-party';
    add(row.dutyKey, row.coverSeatId, {
      day,
      type: 'rehearsal',
      typeLabel: `explicit rehearsal · ${DUTY_REHEARSAL_MODE_LABELS[row.mode] || row.mode}`,
      sourceId: row.id || null,
      route: '#/duty-cover?panel=plan',
      kind: 'rehearsal',
      mode: row.mode,
      outcome: row.outcome,
      attestation,
    });
  }

  const sorted = new Map();
  for (const [key, records] of out) {
    sorted.set(key, [...records.values()].sort((a, b) => (
      a.day < b.day ? 1 : a.day > b.day ? -1
        : kindRank(a) - kindRank(b)
        || outcomeRank(a) - outcomeRank(b)
        || attestationRank(a) - attestationRank(b)
        || String(a.type).localeCompare(String(b.type))
        || String(a.sourceId).localeCompare(String(b.sourceId))
    )));
  }
  return sorted;
}

const cloneEvidence = (evidence, observed) => (evidence ? { ...evidence, observed } : null);

/**
 * Grade one cover against one exact absence window. `status` is one of:
 *   rehearsed an EXPLICIT rehearsal record (outcome ready) inside the
 *             preparation window, recorded by today — the strongest evidence,
 *             because it is a dated human attestation, not an inference
 *   valid     duty-specific dated work inside the preparation window,
 *             recorded by today (ADR-0125's inferred evidence, unchanged)
 *   gaps      the only in-window evidence is an explicit rehearsal that FOUND
 *             GAPS: practice happened, certified readiness did not, and the
 *             governed decision opened at the recording names what must change
 *   stale     latest observed evidence is older than the preparation window
 *   late      observed evidence exists but falls after the preparation cutoff
 *   future    the only evidence is dated after today and is not yet observed
 *   missing   no dated evidence of this duty's sources touches the span
 *
 * A ready rehearsal outranks inferred work; an attested rehearsal (holder or
 * supervisor) outranks a self-reported one of the same kind. The reason text
 * deliberately carries no person name and no source record id; those live in
 * the structured provenance and are redacted at the reporting seam.
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

  const readyRehearsals = valid.filter((e) => e.kind === 'rehearsal' && e.outcome === 'ready');
  const gapsRehearsals = valid.filter((e) => e.kind === 'rehearsal' && e.outcome === 'gaps');
  const works = valid.filter((e) => e.kind !== 'rehearsal');

  if (readyRehearsals.length) {
    // Strength before recency: an attested rehearsal outranks a self-report
    // even if the self-report is newer; among equals the newest wins (the
    // index is already sorted newest-first within each rank).
    const attested = readyRehearsals.filter((e) => e.attestation === 'holder' || e.attestation === 'supervisor');
    const evidence = attested[0] || readyRehearsals[0];
    return {
      ...base,
      status: 'rehearsed',
      exercised: true,
      evidence: cloneEvidence(evidence, true),
      lastEvidence: cloneEvidence(evidence, true),
      reason: `Explicit rehearsal recorded ${evidence.day} (${evidence.typeLabel}, ${ATTESTATION_TEXTS[evidence.attestation] || evidence.attestation}), outcome ready, inside the preparation window ${from} → ${to} for absence ${window.from} → ${window.to}. A dated attestation by a seat that was there outranks inferred work.${gapsRehearsals.length ? ` An earlier in-window rehearsal found gaps; the ready record supersedes it.` : ''}`,
    };
  }
  if (works.length) {
    const evidence = works[0];
    const gapsNote = gapsRehearsals.length
      ? ` Note: an explicit rehearsal recorded ${gapsRehearsals[0].day} (${gapsRehearsals[0].typeLabel}) FOUND GAPS in readiness; the evidence graded here is inferred dated work, not a certified rehearsal.`
      : '';
    return {
      ...base,
      status: 'valid',
      exercised: true,
      evidence: cloneEvidence(evidence, true),
      lastEvidence: cloneEvidence(evidence, true),
      gapsRehearsal: gapsRehearsals.length ? cloneEvidence(gapsRehearsals[0], true) : null,
      reason: `Duty-specific evidence recorded ${evidence.day} (${evidence.typeLabel}), inside the preparation window ${from} → ${to} for absence ${window.from} → ${window.to}.${gapsNote}`,
    };
  }
  if (gapsRehearsals.length) {
    const evidence = gapsRehearsals[0];
    return {
      ...base,
      status: 'gaps',
      exercised: false,
      evidence: cloneEvidence(evidence, true),
      lastEvidence: cloneEvidence(evidence, true),
      reason: `An explicit rehearsal recorded ${evidence.day} (${evidence.typeLabel}, ${ATTESTATION_TEXTS[evidence.attestation] || evidence.attestation}) FOUND GAPS inside the preparation window ${from} → ${to}: the cover practised this duty and the attestation did not certify readiness for ${window.from} → ${window.to}. The governed decision opened at the recording names what must change; a drill that found the exposure is not a green badge.`,
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
    reason: `No dated work of this duty's sources touches the holder's span for this cover inside the preparation window ${from} → ${to}, and no explicit rehearsal of this duty by this cover is recorded.`,
  };
}

/** Identity wall: above rank 2 the source record id is withheld; dates, modes, outcomes, attestation strength and counts survive — none of them names a person. */
export function redactWindowExercise(exercise, namesVisible) {
  if (!exercise || namesVisible) return exercise || null;
  const strip = (e) => (e ? { ...e, sourceId: null } : null);
  return {
    ...exercise,
    evidence: strip(exercise.evidence),
    lastEvidence: strip(exercise.lastEvidence),
    gapsRehearsal: strip(exercise.gapsRehearsal),
  };
}

/**
 * Aggregate cover-status counts for a set of duty rows' available, eligible
 * covers. ADR-0128 adds the explicit-rehearsal counts: `rehearsedCoversN`
 * (evidence is a dated attestation, not an inference), `gapsCoversN` (a drill
 * found what must change), and the attestation split — a self-reported
 * rehearsal is an accountable claim, but a mid-manager counting how much of
 * the span's readiness rests on covers certifying themselves needs the two
 * numbers apart.
 */
export function summarizeWindowExercise(rows) {
  const summary = {
    gradedCoversN: 0,
    validCoversN: 0,
    rehearsedCoversN: 0,
    gapsCoversN: 0,
    attestedRehearsalsN: 0,
    selfReportedRehearsalsN: 0,
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
      if (status === 'rehearsed') {
        summary.rehearsedCoversN += 1;
        if (cover.windowExercise?.evidence?.attestation === 'self') summary.selfReportedRehearsalsN += 1;
        else summary.attestedRehearsalsN += 1;
      } else if (status === 'valid') summary.validCoversN += 1;
      else if (status === 'gaps') summary.gapsCoversN += 1;
      else if (status === 'stale') summary.staleCoversN += 1;
      else if (status === 'future') summary.futureCoversN += 1;
      else if (status === 'late') summary.lateCoversN += 1;
      else summary.missingCoversN += 1;
    }
  }
  return summary;
}
