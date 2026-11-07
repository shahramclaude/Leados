/**
 * app/core/domain/dutyCoverage.js — the Duty Coverage Register's pure engine
 * (ADR-0121, Schema v114, `#/duty-cover`).
 *
 * ONE QUESTION, ASKED PER DUTY AND PER ALTITUDE
 * ---------------------------------------------
 * ADR-0075 declared every altitude's duties. ADR-0076 enforced what a seat may
 * read. Neither answered the ordinary Monday question a shift lead, a manager,
 * a director and a chief each ask in their own words:
 *
 *     "If I am not here tomorrow, which of my duties stops — and does the
 *      person who would pick it up know, have the span for it, and have
 *      actually used their access?"
 *
 * This module answers it without inventing anything:
 *
 *   duty          declared (chainRegistry ALTITUDES.duties), never fitted;
 *   span holder   DERIVED: the leadership node that owns the duty's work,
 *                 found by harvesting the shared SIGNAL_SOURCES registry and
 *                 taking the LCA of every open item of the duty's sources
 *                 inside the seat's subtree. No items ⇒ genuinely no holder,
 *                 and the register says so instead of guessing a name;
 *   eligible pool DERIVED: every active person inside the seat's span whose
 *                 current altitude can answer this duty — same altitude, an
 *                 ancestor altitude inside the span, or the seat itself; a
 *                 descendant is NOT eligible, because a duty never passes down
 *                 below the altitude whose horizon it occupies (Jaques 1956);
 *   declared cover stored, dated, human (`dutyCovers`);
 *   exercise      DERIVED: has this cover ever recorded work inside the duty's
 *                 span inside the declared window? A declaration nobody has
 *                 exercised is a name on a page, and the register prints which.
 *
 * WHAT IT REFUSES TO SAY
 * ----------------------
 *   - It never prints a "coverage score" and never rates a person. `readiness`
 *     is a statement about the REGISTER (named + capable + exercised), and its
 *     denominator is the duty, not the human.
 *   - It never opens an automation decision. Declaring cover is a human act;
 *     an engine-assigned stand-in is an invented responsibility.
 *   - It never names a person who is not eligible. An ineligible candidate is
 *     printed as refused WITH the reason, because an access control that cannot
 *     explain its own refusal is a broken one (SEAT_PREMISE).
 *
 * Pure module: no storage, no DOM, no clock beyond the injected `now`.
 */

import { harvestWork, LEADER_ID } from './chain.js';
import { buildSeats, activeSeat } from './seat.js';
import { addDays, dayKey, daysBetween } from '../time.js';
import {
  DUTY_COVERAGE_LIMITS,
  DUTY_PREMISE,
} from './dutyCoverageRegistry.js';
import { normalizeDutyCoverageSettings, makeDutyId } from './dutyCoverageSchema.js';
import {
  activeAbsenceFor, overlaps, parseAbsenceWindow,
} from './dutyAbsenceSchema.js';
import {
  DUTY_ABSENCE_LIMITS,
  DUTY_CONCURRENCY_ENGINE_VERSION,
  DUTY_CONCURRENCY_PREMISE,
  DUTY_COVER_LOAD_ENGINE_VERSION,
  DUTY_COVER_LOAD_PREMISE,
  DUTY_COVER_LOAD_LIMITS,
  DUTY_COVER_LOAD_REFUSALS,
} from './dutyAbsenceRegistry.js';

/* ------------------------------------------------------------------ helpers */

const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;
const clamp01 = (n) => Math.min(1, Math.max(0, n));

/** Wilson (1927) score interval — the same estimator the rest of the product uses. */
export function wilsonInterval(successes, n, z = 1.959963984540054) {
  if (!Number.isFinite(n) || n <= 0) return null;
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { p: round1(clamp01(p) * 100), low: round1(clamp01(centre - half) * 100), high: round1(clamp01(centre + half) * 100), n };
}

/**
 * The exercise index for ONE seat: the most recent dated record on which each
 * candidate cover appears, where "appears" means the record is inside this
 * duty's span or the cover co-appears with someone who is.
 *
 * Why this is the right derivation rather than "any work by that person": the
 * register needs evidence the cover has actually touched THIS span. An ancestor
 * cover (the manager, the director) co-appearing on a case, a delegation or a
 * 1:1 with someone in the span has demonstrably reached into it; a cover sitting
 * inside the span is credited by their own work. A 1:1 record is the work of both
 * parties — the leader who held it and the person it was held with — so it
 * credits the report's manager as well.
 */
export function exerciseIndex(state, built, seat, { now = new Date(), settings = null, items = null } = {}) {
  const chain = built.chain;
  const scope = seat.scope;
  const out = new Map();
  const bump = (personId, day, via) => {
    if (typeof personId !== 'string' || !personId) return;
    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
    const current = out.get(personId);
    if (!current || day > current.day) out.set(personId, { day, via });
  };
  const record = (people, day, via) => {
    if (!day) return;
    const unique = [...new Set((people || []).filter((p) => typeof p === 'string' && p))];
    const touchesSpan = unique.some((p) => scope.has(p));
    for (const personId of unique) {
      if (!built.byId.has(personId)) continue; // only a leadership node can be a cover
      if (personId === seat.id || scope.has(personId) || touchesSpan) bump(personId, day, via);
    }
  };
  const all = items || harvestWork(state, chain, { now, settings: settings || state?.settings || null });
  for (const item of all) record(item.people, item.openedOn, item.typeLabel);
  // 1:1s are recorded by the leader who held the conversation; the record names
  // only the report, so both parties are credited explicitly.
  const meetings = Array.isArray(state?.oneOnOnes) ? state.oneOnOnes : [];
  for (const m of meetings) {
    if (!m || m.status !== 'held' || !m.personId) continue;
    const managerId = chain.byId.get(m.personId)?.parentId || null;
    record([m.personId, managerId], m.date, '1:1 held');
  }
  return out;
}

function ancestorIds(chain, seatId) {
  const out = new Set();
  let cursor = chain.nodes.get(seatId)?.parentId || null;
  let guard = 0;
  while (cursor && guard < 64) {
    if (cursor !== LEADER_ID) out.add(cursor);
    const parent = chain.nodes.get(cursor)?.parentId || null;
    if (!parent || parent === cursor) break;
    cursor = parent;
    guard += 1;
  }
  return out;
}

function dutyItems(items, duty) {
  const keys = new Set(Array.isArray(duty.sources) ? duty.sources : []);
  return items.filter((item) => keys.has(item.type));
}

function oldestOpenDay(items) {
  let best = null;
  for (const item of items) {
    const day = item.openedOn;
    if (typeof day === 'string' && (!best || day < best)) best = day;
  }
  return best;
}

/**
 * The eligible pool for one duty, with an explicit verdict and reason per
 * candidate. A candidate must be a leadership node whose altitude can carry the
 * duty's horizon, reached WITHOUT crossing a peer boundary:
 *
 *   the seat itself     REFUSED: an absent holder cannot stand in for themself;
 *   inside the span     a subordinate leadership node at or above the seat's
 *                       rank (a reorganisation can put one there);
 *   above the seat      every reporting-tree ancestor: an absence rises to the
 *                       span that owns the lowest common work (subsidiarity),
 *                       which is exactly where the duty's LCA sits;
 *   below the seat      REFUSED and printed — a duty never passes down below
 *                       the altitude whose horizon it occupies (Jaques 1956);
 *   a peer              not in the set at all, because a peer's span is reached
 *                       only through the common leader, never sideways.
 */
export function dutyCandidates(state, built, seat, duty) {
  const chain = built.chain;
  const seatRank = seat.rank ?? 1;
  const ancestors = ancestorIds(chain, seat.id);
  const rows = [];
  for (const node of chain.nodes.values()) {
    if (node.reachable === false || !node.altitude) continue;
    const nodeSeat = built.byId.get(node.id);
    if (!nodeSeat) continue;
    const inSpan = seat.scope.has(node.id);
    const above = ancestors.has(node.id);
    if (!inSpan && !above) continue; // a peer or an unrelated branch: never offered
    const isSelf = node.id === seat.id;
    const candidateRank = nodeSeat.rank;
    const eligible = !isSelf && candidateRank >= seatRank;
    rows.push({
      personId: node.id,
      name: node.name,
      label: nodeSeat.label,
      rank: candidateRank,
      altitudeKey: nodeSeat.altitudeKey,
      isSelf,
      relation: isSelf ? 'self' : (above ? 'ancestor' : 'descendant'),
      eligible,
      reason: isSelf
        ? 'The duty holder cannot cover their own absence. Declare a different eligible stand-in.'
        : eligible
          ? (above
            ? `Reporting-tree ancestor at rank ${candidateRank}: an absence rises to the span that owns the lowest common work (Aghion & Tirole 1997 subsidiarity), never sideways to a peer.`
            : `Rank ${candidateRank} inside this span: can answer the duty without leaving the span.`)
          : `Rank ${candidateRank} sits BELOW rank ${seatRank}. A duty never passes down below the altitude whose horizon it occupies (Jaques 1956) — this candidate cannot be answerable for it.`,
    });
  }
  return rows.sort((a, b) => Number(b.isSelf) - Number(a.isSelf) || a.rank - b.rank || a.name.localeCompare(b.name));
}

/**
 * One duty's full reading for one seat.
 *   band = 'covered'   a declared cover is eligible AND has exercised access
 *          'thin'      declared and eligible, but no recorded exercise in window
 *          'ineligible' a declared cover cannot answer this duty at this altitude
 *          'gap'       no declared cover at all (the ordinary, honest empty state)
 */
export function dutyReading(state, built, seat, duty, { now = new Date(), settings = null, items = null, exercise = null } = {}) {
  const effective = settings || state?.settings || {};
  const conv = normalizeDutyCoverageSettings(effective);
  const today = dayKey(now);
  const dutyId = makeDutyId(seat.id, duty.key);
  const allItems = items || harvestWork(state, built.chain, { now, settings: effective });
  const relevant = dutyItems(allItems, duty);
  const candidates = dutyCandidates(state, built, seat, duty);
  const byPerson = new Map(candidates.map((c) => [c.personId, c]));
  const covers = (Array.isArray(state?.dutyCovers) ? state.dutyCovers : [])
    .filter((row) => row && row.dutyId === dutyId && row.status === 'active');
  const index = exercise || exerciseIndex(state, built, seat, { now, settings: effective, items: allItems });
  const windowStart = addDays(today, -conv.dutyCoverageExerciseDays);

  const coverRows = covers.map((row) => {
    const candidate = byPerson.get(row.coverId) || null;
    const seen = index.get(row.coverId) || null;
    const lastDay = seen ? seen.day : null;
    const ageDays = lastDay ? daysBetween(lastDay, today) : null;
    const exercised = Boolean(lastDay) && ageDays !== null && ageDays >= 0 && ageDays <= conv.dutyCoverageExerciseDays;
    const eligible = Boolean(candidate?.eligible);
    return {
      id: row.id,
      coverId: row.coverId,
      name: candidate?.name || null,
      label: candidate?.label || null,
      rank: candidate?.rank ?? null,
      note: row.note,
      declaredOn: row.declaredOn,
      declaredBySeatId: row.declaredBySeatId,
      decisionId: row.decisionId,
      eligible,
      eligibilityReason: candidate
        ? candidate.reason
        : 'This person is no longer inside the seat’s span — a reorganisation or an archived record left the cover describing someone who cannot answer here. Re-declare the cover.',
      lastWorkDay: lastDay,
      lastWorkAgeDays: ageDays,
      exercised,
      exerciseNote: exercised
        ? `Recorded work inside this span on ${lastDay} (${ageDays} day(s) ago, inside the declared ${conv.dutyCoverageExerciseDays}-day window).`
        : (lastDay
          ? `Last recorded work on ${lastDay} — ${ageDays} day(s) ago, outside the declared ${conv.dutyCoverageExerciseDays}-day window. A declaration nobody exercises is a name on a page.`
          : 'No recorded work in this workspace at all. The cover is declared but the register cannot show it is live — the honest reading is "unexercised", never "covered".'),
    };
  });

  const eligibleCovers = coverRows.filter((c) => c.eligible);
  const exercisedCovers = eligibleCovers.filter((c) => c.exercised);
  const ineligibleCovers = coverRows.filter((c) => !c.eligible);
  const band = !coverRows.length
    ? 'gap'
    : (ineligibleCovers.length ? 'ineligible' : (exercisedCovers.length ? 'covered' : 'thin'));

  const eligibleCandidates = candidates.filter((c) => c.eligible);
  const reasons = {
    gap: `No one is declared answerable for “${duty.label}” when this ${seat.label} seat is absent. The duty is real — ${relevant.length} open item(s) sit in it — but the cover is a human declaration this workspace has not recorded yet.`,
    thin: `${eligibleCovers.length} cover(s) are declared and eligible, but none has dated work in this span in the last ${conv.dutyCoverageExerciseDays} day(s). The register cannot distinguish “ready and quiet” from “forgotten”, so it prints “thin” rather than a reassuring “covered”.`,
    ineligible: `${ineligibleCovers.length} declared cover(s) cannot answer this duty. ${ineligibleCovers.map((c) => c.eligibilityReason).join(" ")} Revoke the stale declaration and declare an eligible stand-in.`,
    covered: `${exercisedCovers.length} of ${eligibleCovers.length} declared cover(s) have recorded work inside this span in the last ${conv.dutyCoverageExerciseDays} day(s).`,
  };

  // Concentration: who actually did this duty's recorded work (Kahn 1990,
  // Weick & Sutcliffe 2007)? Derived from dated records, never asserted.
  const hands = new Map();
  for (const item of relevant) {
    for (const pid of Array.isArray(item.people) ? item.people : []) {
      if (!pid || pid === LEADER_ID) continue;
      if (!seat.scope.has(pid)) continue;
      hands.set(pid, (hands.get(pid) || 0) + 1);
    }
  }
  const totalHands = [...hands.values()].reduce((a, b) => a + b, 0);
  const concentration = [...hands.entries()]
    .map(([pid, n]) => ({ personId: pid, name: built.chain.byId.get(pid)?.name || pid, n, sharePct: totalHands ? round1((n / totalHands) * 100) : null }))
    .sort((a, b) => b.n - a.n || String(a.personId).localeCompare(String(b.personId)));
  const top = concentration[0] || null;
  const soleHanded = Boolean(top) && totalHands >= 2 && top.sharePct >= conv.dutyCoverageConcentrationPct;

  return {
    dutyId,
    key: duty.key,
    label: duty.label,
    question: duty.question,
    routes: duty.routes || [],
    sources: duty.sources || [],
    openN: relevant.length,
    oldestOn: oldestOpenDay(relevant),
    band,
    bandReason: reasons[band],
    covers: coverRows,
    eligibleCoversN: eligibleCovers.length,
    exercisedCoversN: exercisedCovers.length,
    candidates,
    eligibleCandidates,
    ineligibleCandidates: candidates.filter((c) => !c.eligible),
    concentration: { rows: concentration, totalN: totalHands, top, soleHanded, thresholdPct: conv.dutyCoverageConcentrationPct },
    windowStart,
  };
}

/** Which duties belong to this seat (an unresolved/operator seat has none). */
export function dutiesForSeat(seat) {
  if (!seat || seat.fullAccess) return [];
  return Array.isArray(seat.duties) ? seat.duties : [];
}

/* ------------------------------------------------- ADR-0122: the dated plan */

/**
 * The Dated Absence Plan (ADR-0122): what happens to THIS seat's duty lines
 * during one specific window.
 *
 * The register answered "who answers when I am absent?" but had no dates, so
 * it could not answer the question a lead actually asks on a Thursday: *"I am
 * out 2027-07-05 → 2027-07-09 — which of my duties stops on those days?"*
 *
 * The plan is a DERIVED reading of two declared things:
 *   the seat's own duty lines (declared by the altitude table, never fitted);
 *   the declared covers (ADR-0121) plus every active absence plan (ADR-0122).
 *
 * Per duty line the plan prints, for each declared cover:
 *   available    is this cover present during the window? A cover with their
 *                OWN active absence plan overlapping the window is NOT — the
 *                conflict is printed with the cover's own window and reason,
 *                not hidden behind a reassuring "covered";
 *   exercised    the ADR-0121 derivation, unchanged (dated work in the span);
 *   selfCoverage the cascade: is the cover's OWN absence covered? A cover who
 *                is out and whose own register is exposed too stacks the
 *                exposure — that is printed, never assumed away.
 *
 * `windowBand` per duty line:
 *   covered       an available, eligible cover has recorded work in the span;
 *   thin          an available, eligible cover, but no recorded exercise;
 *   cover-absent  every declared cover is themselves absent during the window;
 *   ineligible    the declared cover(s) cannot answer at this altitude;
 *   gap           nobody is declared answerable at all.
 *
 * Nothing here is stored: the same inputs re-derive the same plan, and a plan
 * whose window or cover changed prints the change on the next read.
 */
export function absenceWindowPlan(state, built, seat, window, { now = new Date(), settings = null, items = null, depth = 0 } = {}) {
  const effective = settings || state?.settings || {};
  const conv = normalizeDutyCoverageSettings(effective);
  const parsedWindow = parseAbsenceWindow(window);
  const allItems = items || harvestWork(state, built.chain, { now, settings: effective });
  const absences = new Map();
  for (const plan of Array.isArray(state?.absencePlans) ? state.absencePlans : []) {
    if (plan && plan.status === 'active' && plan.seatId) absences.set(plan.seatId, plan);
  }

  const rows = [];
  for (const duty of dutiesForSeat(seat)) {
    const reading = dutyReading(state, built, seat, duty, { now, settings: effective, items: allItems });
    const coverRows = reading.covers.map((c) => {
      const absence = absences.get(c.coverId) || null;
      const available = !absence || !overlaps(absence, parsedWindow);
      return {
        ...c,
        available,
        absence: absence ? { from: absence.from, to: absence.to, reason: absence.reason } : null,
      };
    });
    const available = coverRows.filter((c) => c.available && c.eligible);
    const exercisedAvailable = available.filter((c) => c.exercised);
    const conflicts = coverRows.filter((c) => !c.available).map((c) => ({
      coverId: c.coverId,
      name: c.name,
      label: c.label,
      from: c.absence.from,
      to: c.absence.to,
      reason: c.absence.reason,
    }));
    let windowBand;
    if (!coverRows.length) windowBand = 'gap';
    else if (exercisedAvailable.length) windowBand = 'covered';
    else if (available.length) windowBand = 'thin';
    else if (conflicts.length) windowBand = 'cover-absent';
    else windowBand = 'ineligible';

    const windowLabel = `${parsedWindow.from} → ${parsedWindow.to}`;
    const windowReasons = {
      gap: `No one is declared answerable for “${duty.label}” during ${windowLabel}. The duty is real — ${reading.openN} open item(s) sit in it — and the cover is a human declaration this workspace has not recorded.`,
      thin: `${available.length} cover(s) are declared, eligible and present during ${windowLabel}, but none has dated work in this span in the last ${conv.dutyCoverageExerciseDays} day(s). The register prints “thin” rather than a reassuring “covered”.`,
      covered: `${exercisedAvailable.length} of ${available.length} declared cover(s) are present during ${windowLabel} and have recorded work inside this span in the last ${conv.dutyCoverageExerciseDays} day(s).`,
      'cover-absent': `Every declared cover for “${duty.label}” is themselves absent during ${windowLabel}: ${conflicts.map((c) => `${c.name || 'the cover'} (${c.label}) is out ${c.from} → ${c.to}`).join('; ')}. No other cover is declared for this duty line, so the duty is exposed on those dates.`,
      ineligible: reading.bandReason,
    };

    // The cascade: for each cover who is absent, is their OWN absence covered?
    // One level deep, against the cover's own absence window — a cover whose
    // own register is exposed too stacks the exposure, and that stacking is a
    // printed fact, never an assumption.
    const cascade = conflicts.map((c) => {
      if (depth >= 1) return { coverId: c.coverId, name: c.name, from: c.from, to: c.to, selfCoverage: null };
      const coverSeat = built.byId.get(c.coverId);
      const coverAbsence = absences.get(c.coverId);
      if (!coverSeat || !coverAbsence) return { coverId: c.coverId, name: c.name, from: c.from, to: c.to, selfCoverage: null };
      const own = absenceWindowPlan(state, built, coverSeat, { from: coverAbsence.from, to: coverAbsence.to }, { now, settings: effective, items: allItems, depth: depth + 1 });
      const selfCoverage = own.summary.coveredN > 0 ? 'covered' : (own.summary.exposedN > 0 ? 'exposed' : null);
      return { coverId: c.coverId, name: c.name, from: c.from, to: c.to, selfCoverage };
    });

    rows.push({
      dutyId: reading.dutyId,
      key: reading.key,
      label: reading.label,
      question: reading.question,
      routes: reading.routes,
      sources: reading.sources,
      openN: reading.openN,
      oldestOn: reading.oldestOn,
      band: reading.band,
      bandReason: reading.bandReason,
      windowBand,
      windowReason: windowReasons[windowBand],
      covers: coverRows,
      availableCoversN: available.length,
      exercisedAvailableN: exercisedAvailable.length,
      conflicts,
      cascade,
    });
  }

  const byWindowBand = { covered: 0, thin: 0, 'cover-absent': 0, ineligible: 0, gap: 0 };
  for (const row of rows) byWindowBand[row.windowBand] += 1;
  const exposedRows = rows.filter((r) => r.windowBand === 'gap' || r.windowBand === 'cover-absent' || r.windowBand === 'ineligible');
  return {
    window: parsedWindow,
    seatId: seat.id,
    seatLabel: seat.label,
    rows,
    summary: {
      dutiesN: rows.length,
      coveredN: byWindowBand.covered,
      thinN: byWindowBand.thin,
      coverAbsentN: byWindowBand['cover-absent'],
      ineligibleN: byWindowBand.ineligible,
      gapN: byWindowBand.gap,
      exposedN: exposedRows.length,
      exposedOpenN: exposedRows.filter((r) => r.openN > 0).length,
      conflictsN: rows.reduce((sum, r) => sum + r.conflicts.length, 0),
    },
    conventions: conv,
  };
}

/**
 * The dated roll-up: every active absence plan for a seat INSIDE this seat's
 * span (the seat's own plan is the plan panel's subject, not a roll-up), each
 * graded against its own window. A manager planning a week sees the leads'
 * absences and their exposure; a VP sees the same as counts. Nothing is
 * assigned — the roll-up reports what the declarations already say.
 */
export function dutyAbsenceRollup(state, built, seat, { now = new Date(), settings = null, items = null } = {}) {
  const effective = settings || state?.settings || {};
  const allItems = items || harvestWork(state, built.chain, { now, settings: effective });
  const rows = [];
  for (const plan of Array.isArray(state?.absencePlans) ? state.absencePlans : []) {
    if (!plan || plan.status !== 'active' || !plan.seatId) continue;
    if (plan.seatId === seat.id) continue;
    if (!seat.fullAccess && !seat.scope.has(plan.seatId)) continue;
    const absentSeat = built.byId.get(plan.seatId);
    if (!absentSeat) continue;
    const planForSeat = absenceWindowPlan(state, built, absentSeat, { from: plan.from, to: plan.to }, { now, settings: effective, items: allItems, depth: 1 });
    rows.push({
      seatId: plan.seatId,
      label: absentSeat.label,
      rank: absentSeat.rank,
      altitudeKey: absentSeat.altitudeKey,
      from: plan.from,
      to: plan.to,
      reason: plan.reason,
      summary: planForSeat.summary,
    });
  }
  rows.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.label.localeCompare(b.label)));
  return {
    rows,
    exposedN: rows.reduce((sum, r) => sum + r.summary.exposedN, 0),
    exposedOpenN: rows.reduce((sum, r) => sum + r.summary.exposedOpenN, 0),
  };
}

/* =============================== ADR-0124: cover capacity in a shared window */

/**
 * One open work item, keyed ONCE. `harvestWork` already emits only open items;
 * the key is stable across duty lines and across seats, which is exactly what
 * stops the same case being counted twice when two absent leads hold the same
 * duty source, or when an ancestor cover's span already contains a descendant's
 * case (Simpson 1951 — the composition of the parts is not their sum).
 */
const workKey = (item) => `${item.type}:${item.entityId ?? item.title}`;

function workInSpan(item, seat) {
  const people = Array.isArray(item.people) ? item.people : [];
  return people.some((pid) => seat.scope.has(pid))
    || Boolean(item.ownerNodeId && seat.scope.has(item.ownerNodeId));
}

function openWorkKeys(seat, duty, items) {
  const out = new Set();
  for (const item of dutyItems(items, duty)) {
    if (workInSpan(item, seat)) out.add(workKey(item));
  }
  return out;
}

/** Distinct open work items inside ONE seat's span and declared duty lines. */
function openWorkForSeat(seat, items) {
  const out = new Set();
  for (const duty of dutiesForSeat(seat)) {
    for (const key of openWorkKeys(seat, duty, items)) out.add(key);
  }
  return out;
}

/**
 * The comparison set for the REVEALED capacity envelope. Little's Law (1961)
 * makes work-in-progress the unit; the number is a reading of observed work,
 * not a productivity constant fitted to a person and not a WIP target imported
 * from the differently denominated funded-plan ledger.
 *
 * The envelope itself is chosen PER COVER in `buildCoverLoads`: the peak own
 * open work among the seats in this span at or below that cover's altitude,
 * excluding the cover. Comparing a manager's load to a chief's whole-span load
 * would be a composition error (Simpson 1951; Greenland/Robins/Pearl 1999) —
 * the chief's duty lines legitimately see more work simply because their span
 * contains everyone. Like-for-like, or an explicit refusal.
 */
export function coverLoadEnvelope(built, seat, items) {
  const loads = new Map();
  for (const s of built.seats) {
    if (s.isLeader || s.reachable === false) continue;
    if (!seat.fullAccess && s.id !== seat.id && !seat.scope.has(s.id)) continue;
    loads.set(s.id, { id: s.id, rank: s.rank, n: openWorkForSeat(s, items).size });
  }
  return { loads, seatsN: loads.size };
}

/**
 * Grade every available, eligible cover of ONE overlap window. `assignments`
 * is derived inside the sweep (never stored): the sole-answerable duty lines'
 * open work, the shared lines that must not be attributed to one person, and
 * the absent seats each cover would stand in for.
 *
 * The identity wall is applied AT CONSTRUCTION: above rank 2 the cover's name
 * and id are nulled before the reason text is built, so neither the card, the
 * brief, the governed decision nor JSON.stringify(report) can carry them.
 */
function buildCoverLoads({ built, window, items, assignments, seats, namesVisible, envelope }) {
  const refById = new Map(seats.map((s) => [s.seatId, s.ref]));
  const ids = [...assignments.keys()].sort();
  const gradedIds = ids.slice(0, DUTY_COVER_LOAD_LIMITS.coverCap);
  const deferredCoversN = ids.length - gradedIds.length;
  const rows = [];
  const byId = new Map();
  for (const coverId of gradedIds) {
    const a = assignments.get(coverId);
    const coverSeat = built.byId.get(coverId) || null;
    const display = namesVisible ? (a.name || a.label) : a.label;
    const ownKeys = coverSeat ? openWorkForSeat(coverSeat, items) : new Set();
    const ownN = ownKeys.size;
    const inheritedN = a.inherited.size;
    let overlapN = 0;
    for (const key of a.inherited) if (ownKeys.has(key)) overlapN += 1;
    const combinedN = ownN + inheritedN - overlapN;
    // Like-for-like: a chief's whole-span load is not a fair envelope for a
    // manager. The cover is excluded, so the reading asks whether THIS seat
    // would carry more open work than the busiest comparable seat in the span.
    const comparable = [...envelope.loads.values()].filter((x) => x.id !== coverId && x.rank <= a.rank);
    const peakN = comparable.reduce((max, x) => Math.max(max, x.n), 0);
    const peersN = comparable.length;
    const refs = [...a.seatIds].map((id) => refById.get(id)).filter(Boolean).sort();
    const refusal = !coverSeat || !dutiesForSeat(coverSeat).length
      ? DUTY_COVER_LOAD_REFUSALS.noDuties
      : (!peersN ? DUTY_COVER_LOAD_REFUSALS.noComparableSeat : (peakN === 0 ? DUTY_COVER_LOAD_REFUSALS.noEnvelope : null));
    const band = refusal ? 'refused' : (combinedN > peakN ? 'over-envelope' : (combinedN === peakN ? 'at-envelope' : 'within-envelope'));
    const ratio = refusal ? null : round2(combinedN / peakN);
    const basis = `${display} (rank ${a.rank}) would be answerable for ${combinedN} distinct open work item(s) ${window.from} → ${window.to}: ${ownN} in their own duty lines, ${inheritedN} inherited from ${a.seatIds.size} absent seat(s) (${refs.join(', ') || 'none'}), and ${overlapN} of those already inside their own span — counted once, not twice.`;
    const shared = a.sharedLinesN
      ? ` ${a.sharedLinesN} further duty line(s) have more than one available cover; their open work is not attributed to one person because no split is declared.`
      : '';
    const comparableText = `the peak ${peakN}-item open-work load among ${peersN} comparable seat(s) at or below this cover’s altitude`;
    const verdict = refusal
      ? ` Cover capacity refused — ${refusal}`
      : (band === 'over-envelope'
        ? ` That is ${ratio}× ${comparableText}: this seat would carry more open work than the busiest comparable seat in this span today. The register will not call that spare capacity.`
        : (band === 'at-envelope'
          ? ` That exactly matches ${comparableText} (${ratio}×): there is no recorded headroom.`
          : ` That is ${ratio}× ${comparableText}. The envelope reads today's open work, not effort estimates, calendar load, or arrivals before the window opens.`));
    rows.push({
      coverId: namesVisible ? coverId : null,
      name: namesVisible ? a.name : null,
      label: a.label,
      rank: a.rank,
      ownN,
      inheritedN,
      overlapN,
      combinedN,
      envelopeN: peakN,
      peersN,
      ratio,
      band,
      reason: `${basis}${shared}${verdict}`,
      soleLinesN: a.soleLinesN,
      sharedLinesN: a.sharedLinesN,
      seatsN: a.seatIds.size,
      refs,
    });
    byId.set(coverId, rows[rows.length - 1]);
  }
  const bandCount = (b) => rows.filter((r) => r.band === b).length;
  rows.sort((x, y) => {
    const rank = (b) => (b === 'over-envelope' ? 0 : b === 'at-envelope' ? 1 : b === 'within-envelope' ? 2 : 3);
    return rank(x.band) - rank(y.band) || y.combinedN - x.combinedN || String(x.label).localeCompare(String(y.label));
  });
  const maxEnvelopeN = rows.reduce((max, r) => Math.max(max, r.envelopeN), 0);
  const maxPeersN = rows.reduce((max, r) => Math.max(max, r.peersN), 0);
  return {
    rows,
    byId,
    summary: {
      envelopeN: maxEnvelopeN,
      envelopeSeatsN: maxPeersN,
      gradedN: rows.length,
      overEnvelopeN: bandCount('over-envelope'),
      atEnvelopeN: bandCount('at-envelope'),
      withinEnvelopeN: bandCount('within-envelope'),
      refusedN: bandCount('refused'),
      deferredCoversN,
      maxCombinedN: rows.reduce((max, r) => Math.max(max, r.combinedN), 0),
      refusal: rows.length && rows.every((r) => r.band === 'refused') && maxEnvelopeN === 0
        ? DUTY_COVER_LOAD_REFUSALS.noEnvelope
        : null,
    },
  };
}

/* ============================================================ concurrency */

/**
 * Maximal date ranges on which at least two declared windows of `participants`
 * are live at once. Boundaries are the day each window opens and the day after
 * it closes, so the sweep is over inclusive ISO day keys and never depends on
 * the clock. Adjacent ranges with the same participant set are merged, because
 * "lead1 out 5–7, lead2 out 5–9" is ONE window with a stable cast, not three.
 */
function concurrencyIntervals(participants) {
  const points = new Set();
  for (const p of participants) {
    points.add(p.from);
    points.add(addDays(p.to, 1));
  }
  const sorted = [...points].filter(Boolean).sort();
  const raw = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const from = sorted[i];
    const to = addDays(sorted[i + 1], -1);
    if (!from || !to || from > to) continue;
    const active = participants.filter((p) => p.from <= from && p.to >= from);
    if (active.length < 2) continue;
    const key = active.map((p) => p.seatId).sort().join('|');
    const prev = raw[raw.length - 1];
    if (prev && prev.key === key && addDays(prev.to, 1) === from) {
      prev.to = to;
      continue;
    }
    raw.push({ from, to, key, active });
  }
  return raw;
}

/**
 * Concurrent absence exposure (ADR-0123).
 *
 * The per-absence plan answers "is THIS seat's cover present on THESE dates?".
 * A director reviewing a holiday week asks a different question:
 *
 *     "Three seats are out the same week — which duty lines lose their cover
 *      on the shared dates, and is one person the only declared cover for two
 *      of them?"
 *
 * Both halves are DERIVED from the declared absence windows and the declared
 * covers. Nothing is stored, nothing is scheduled, and no cover is assigned:
 * the sweep prints the overlap, the exposed lines on the shared dates and the
 * cover who would be the single answerable person for more than one absent
 * seat. Above the manager altitude a cover's name is withheld (rank ≤ 2
 * convention, ADR-0121/ADR-0125 seam); counts, seats and refusals survive.
 *
 * Refusals are printed, never zeroed: no absence declared, one absence, or
 * declared windows that never share a date each read as a printed refusal —
 * "nothing to grade" is not the same claim as "no collision will happen".
 */
export function absenceConcurrency(state, built, seat, { now = new Date(), settings = null, items = null } = {}) {
  const effective = settings || state?.settings || {};
  const allItems = items || harvestWork(state, built.chain, { now, settings: effective });
  const namesVisible = seat.fullAccess || (seat.rank ?? 1) <= 2;

  const participants = [];
  for (const plan of Array.isArray(state?.absencePlans) ? state.absencePlans : []) {
    if (!plan || plan.status !== 'active' || !plan.seatId) continue;
    const node = built.byId.get(plan.seatId);
    if (!node) continue;
    const inScope = seat.fullAccess || plan.seatId === seat.id || seat.scope.has(plan.seatId);
    if (!inScope) continue;
    const window = parseAbsenceWindow(plan);
    if (!window) continue;
    participants.push({
      seatId: plan.seatId,
      node,
      from: window.from,
      to: window.to,
      reason: plan.reason || '',
      self: plan.seatId === seat.id,
    });
  }
  participants.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : (a.seatId < b.seatId ? -1 : 1)));
  // ADR-0124: one revealed envelope per reading, derived from the same open
  // work the register already harvests. It does not depend on the dates, so it
  // is computed once and reused by every overlap window.
  const envelope = coverLoadEnvelope(built, seat, allItems);

  const result = {
    engineVersion: DUTY_CONCURRENCY_ENGINE_VERSION,
    premise: DUTY_CONCURRENCY_PREMISE,
    namesVisible,
    scope: {
      seatId: seat.id,
      label: seat.label,
      rank: seat.rank,
      altitudeKey: seat.altitudeKey,
      fullAccess: Boolean(seat.fullAccess),
    },
    participants: participants.map((p) => ({
      seatId: p.seatId,
      label: p.node.label,
      rank: p.node.rank,
      altitudeKey: p.node.altitudeKey,
      from: p.from,
      to: p.to,
      days: (daysBetween(p.from, p.to) ?? 0) + 1,
      self: p.self,
      reason: namesVisible ? p.reason : null,
    })),
    windows: [],
    summary: {
      participantsN: participants.length,
      windowsN: 0,
      deferredWindowsN: 0,
      maxConcurrent: 0,
      seatsInOverlapN: 0,
      exposedWindowsN: 0,
      exposedN: 0,
      exposedOpenN: 0,
      singleCoverN: 0,
      coverLoadGradedN: 0,
      coverLoadOverN: 0,
      coverLoadRefusedN: 0,
      coverLoadDeferredN: 0,
      coverLoadMaxN: 0,
    },
    // ADR-0124: the capacity reading travels WITH the concurrency sweep at
    // every altitude, so a manager's decision and a chief's roll-up quote the
    // same derived figure rather than a second store or a second computation.
    coverLoad: {
      engineVersion: DUTY_COVER_LOAD_ENGINE_VERSION,
      premise: DUTY_COVER_LOAD_PREMISE,
      coverCap: DUTY_COVER_LOAD_LIMITS.coverCap,
      seatsN: envelope.seatsN,
      envelopeN: 0,
      envelopeSeatsN: 0,
      gradedN: 0,
      overEnvelopeN: 0,
      atEnvelopeN: 0,
      withinEnvelopeN: 0,
      refusedN: 0,
      deferredCoversN: 0,
      maxCombinedN: 0,
      refusal: null,
    },
    refused: null,
  };

  if (!participants.length) {
    result.refused = 'No active absence plan is declared in this seat’s span, so no concurrent absence can be graded. An empty ledger is not evidence that absences will not collide.';
    return result;
  }
  if (participants.length === 1) {
    result.refused = 'Only one active absence plan sits in this seat’s span: a concurrency window needs at least two declared windows that share a date. Overlap is not graded from one declaration.';
    return result;
  }

  const raw = concurrencyIntervals(participants);
  if (!raw.length) {
    result.refused = `${participants.length} absence plans are declared in this span, but no two windows share a date. Adjacency is not overlap: the exposure of concurrent absence is left ungraded rather than reported as clear.`;
    return result;
  }

  const capped = raw.slice(0, DUTY_ABSENCE_LIMITS.concurrentWindowCap);
  result.summary.deferredWindowsN = raw.length - capped.length;
  const seatsOut = new Set();

  for (const w of capped) {
    const usedLabels = new Map();
    const refFor = (node) => {
      if (namesVisible) return node.name || node.label;
      const n = (usedLabels.get(node.label) || 0) + 1;
      usedLabels.set(node.label, n);
      return `${node.label} ${n}`;
    };
    const seats = [];
    const soleMap = new Map();
    const conflictMap = new Map();
    // ADR-0124: the work each available, eligible cover would be answerable
    // for on these shared dates. Sets, not counts: the same case reaches two
    // duty lines and two seats and must be counted exactly once.
    const coverAssignments = new Map();
    let exposedN = 0;
    let exposedOpenN = 0;

    for (const p of w.active) {
      seatsOut.add(p.seatId);
      const planForWindow = absenceWindowPlan(
        state, built, p.node, { from: w.from, to: w.to },
        { now, settings: effective, items: allItems, depth: 1 },
      );
      let seatExposed = 0;
      let seatExposedOpen = 0;
      for (const row of planForWindow.rows) {
        if (row.windowBand === 'gap' || row.windowBand === 'cover-absent' || row.windowBand === 'ineligible') {
          seatExposed += 1;
          if (row.openN > 0) seatExposedOpen += 1;
        }
        // A duty line with exactly ONE available, eligible cover is the only
        // place a single point of failure can hide: two such lines belonging
        // to two different absent seats share that one person.
        const available = row.covers.filter((c) => c.available && c.eligible);
        if (available.length === 1) {
          const cover = available[0];
          const rec = soleMap.get(cover.coverId)
            || { coverId: cover.coverId, name: cover.name, label: cover.label, rank: cover.rank, dutiesN: 0, seatIds: new Set() };
          rec.dutiesN += 1;
          rec.seatIds.add(p.seatId);
          soleMap.set(cover.coverId, rec);
        }
        // Only a SOLE available cover inherits the line's open work. A line
        // with several covers is printed as shared and never split by guess.
        for (const cover of available) {
          const rec = coverAssignments.get(cover.coverId) || {
            name: cover.name, label: cover.label, rank: cover.rank,
            inherited: new Set(), seatIds: new Set(), soleLinesN: 0, sharedLinesN: 0,
          };
          if (available.length === 1) {
            rec.soleLinesN += 1;
            for (const key of openWorkKeys(p.node, { sources: row.sources }, allItems)) rec.inherited.add(key);
          } else rec.sharedLinesN += 1;
          rec.seatIds.add(p.seatId);
          coverAssignments.set(cover.coverId, rec);
        }
        for (const conflict of row.conflicts) {
          const rec = conflictMap.get(conflict.coverId)
            || { coverId: conflict.coverId, name: conflict.name, label: conflict.label, from: conflict.from, to: conflict.to, seatsN: 0 };
          rec.seatsN += 1;
          conflictMap.set(conflict.coverId, rec);
        }
      }
      exposedN += seatExposed;
      exposedOpenN += seatExposedOpen;
      seats.push({
        seatId: p.seatId,
        ref: refFor(p.node),
        label: p.node.label,
        rank: p.node.rank,
        altitudeKey: p.node.altitudeKey,
        self: p.self,
        from: p.from,
        to: p.to,
        exposedN: seatExposed,
        exposedOpenN: seatExposedOpen,
      });
    }

    // ADR-0124: grade every available cover of this shared window against the
    // revealed envelope BEFORE the single-cover findings are redacted, so the
    // capacity travels with the finding rather than as a separate table.
    const load = buildCoverLoads({
      built, window: w, items: allItems, assignments: coverAssignments,
      seats, namesVisible, envelope,
    });
    const capacityFor = (coverId) => {
      const r = load.byId.get(coverId);
      if (!r) return null;
      return {
        band: r.band, ownN: r.ownN, inheritedN: r.inheritedN, overlapN: r.overlapN,
        combinedN: r.combinedN, envelopeN: r.envelopeN, ratio: r.ratio, reason: r.reason,
      };
    };

    const singleCovers = [...soleMap.values()]
      .filter((c) => c.seatIds.size >= 2)
      .map((c) => ({
        coverId: namesVisible ? c.coverId : null,
        name: namesVisible ? c.name : null,
        label: c.label,
        rank: c.rank,
        dutiesN: c.dutiesN,
        seatsN: c.seatIds.size,
        refs: [...c.seatIds].map((id) => seats.find((s) => s.seatId === id)?.ref).filter(Boolean),
        capacity: capacityFor(c.coverId),
      }))
      .sort((a, b) => b.seatsN - a.seatsN || b.dutiesN - a.dutiesN);

    const conflicts = [...conflictMap.values()]
      .map((c) => ({
        coverId: namesVisible ? c.coverId : null,
        name: namesVisible ? c.name : null,
        label: c.label,
        from: c.from,
        to: c.to,
        seatsN: c.seatsN,
      }))
      .sort((a, b) => b.seatsN - a.seatsN);

    const count = w.active.length;
    const days = (daysBetween(w.from, w.to) ?? 0) + 1;
    const band = exposedOpenN > 0 ? 'open-exposed' : exposedN > 0 ? 'exposed' : singleCovers.length ? 'concentrated' : 'covered';
    const coverText = singleCovers.length
      ? ` ${singleCovers.length} declared cover(s) would be the ONLY answerable person for more than one absent seat: ${singleCovers
        .map((c) => `${c.label} for ${c.seatsN} absent seats (${c.refs.join(', ')})`).join('; ')}.`
      : '';
    const capacityText = load.summary.overEnvelopeN
      ? ` Cover capacity: ${load.summary.overEnvelopeN} available cover(s) would be answerable for more open work than the ${load.summary.envelopeN}-item observed envelope for this span (largest ${load.summary.maxCombinedN}).`
      : (load.summary.refusal ? ` Cover capacity refused: ${load.summary.refusal}` : '');
    const reasons = {
      'open-exposed': `${count} seats are absent at once ${w.from} → ${w.to} (${days} day(s)). ${exposedN} of their duty line(s) have no available, eligible cover on those shared dates and ${exposedOpenN} of them carry open work right now.${coverText}${capacityText}`,
      exposed: `${count} seats are absent at once ${w.from} → ${w.to} (${days} day(s)). ${exposedN} duty line(s) have no available cover on those dates; none of them carries open work today, which is not the same as being safe.${coverText}${capacityText}`,
      concentrated: `${count} seats are absent at once ${w.from} → ${w.to} (${days} day(s)). Every duty line has an available cover, but the cover is not always a different person — see the single point(s) below.${coverText}${capacityText}`,
      covered: `${count} seats are absent at once ${w.from} → ${w.to} (${days} day(s)). Every duty line has an available, genuinely distinct cover. This is a register reading, not a forecast.${capacityText}`,
    };

    result.windows.push({
      from: w.from,
      to: w.to,
      days,
      count,
      band,
      reason: reasons[band],
      seats,
      exposedN,
      exposedOpenN,
      conflicts,
      singleCovers,
      coverLoads: load.rows,
      capacity: load.summary,
    });
  }

  const windows = result.windows;
  result.summary.windowsN = windows.length;
  result.summary.maxConcurrent = windows.reduce((max, w) => Math.max(max, w.count), 0);
  result.summary.seatsInOverlapN = seatsOut.size;
  result.summary.exposedWindowsN = windows.filter((w) => w.exposedN > 0).length;
  result.summary.exposedN = windows.reduce((sum, w) => sum + w.exposedN, 0);
  result.summary.exposedOpenN = windows.reduce((sum, w) => sum + w.exposedOpenN, 0);
  result.summary.singleCoverN = windows.reduce((sum, w) => sum + w.singleCovers.length, 0);
  result.coverLoad.gradedN = windows.reduce((sum, w) => sum + w.capacity.gradedN, 0);
  result.coverLoad.envelopeN = windows.reduce((max, w) => Math.max(max, w.capacity.envelopeN), 0);
  result.coverLoad.envelopeSeatsN = windows.reduce((max, w) => Math.max(max, w.capacity.envelopeSeatsN), 0);
  result.coverLoad.overEnvelopeN = windows.reduce((sum, w) => sum + w.capacity.overEnvelopeN, 0);
  result.coverLoad.atEnvelopeN = windows.reduce((sum, w) => sum + w.capacity.atEnvelopeN, 0);
  result.coverLoad.withinEnvelopeN = windows.reduce((sum, w) => sum + w.capacity.withinEnvelopeN, 0);
  result.coverLoad.refusedN = windows.reduce((sum, w) => sum + w.capacity.refusedN, 0);
  result.coverLoad.deferredCoversN = windows.reduce((sum, w) => sum + w.capacity.deferredCoversN, 0);
  result.coverLoad.maxCombinedN = windows.reduce((max, w) => Math.max(max, w.capacity.maxCombinedN), 0);
  result.coverLoad.refusal = result.coverLoad.gradedN > 0
    && result.coverLoad.refusedN === result.coverLoad.gradedN
    && result.coverLoad.envelopeN === 0
    ? DUTY_COVER_LOAD_REFUSALS.noEnvelope
    : null;
  result.summary.coverLoadGradedN = result.coverLoad.gradedN;
  result.summary.coverLoadOverN = result.coverLoad.overEnvelopeN;
  result.summary.coverLoadRefusedN = result.coverLoad.refusedN;
  result.summary.coverLoadDeferredN = result.coverLoad.deferredCoversN;
  result.summary.coverLoadMaxN = result.coverLoad.maxCombinedN;
  return result;
}

/**
 * The report's dated section: the seat's own active absence (with its window
 * plan) plus every absence in the span below, counts-only above the manager
 * altitude. The full per-duty plan for the acting seat is read through
 * `dutyAbsencePlan`; this section is what the register, the brief and the CSV
 * carry, and it never names a person above rank 2.
 */
function buildAbsenceSection(state, built, seat, { now, settings, items }) {
  const own = activeAbsenceFor(state?.absencePlans, seat.fullAccess ? null : seat.id);
  const inSpan = dutyAbsenceRollup(state, built, seat, { now, settings, items });
  const namesVisible = seat.fullAccess || (seat.rank ?? 1) <= 2;
  const ownSummary = own
    ? absenceWindowPlan(state, built, seat, { from: own.from, to: own.to }, { now, settings, items, depth: 0 }).summary
    : null;
  return {
    own: own
      ? {
        id: own.id,
        from: own.from,
        to: own.to,
        reason: namesVisible ? own.reason : null,
        declaredOn: own.declaredOn,
        summary: ownSummary,
      }
      : null,
    inSpan: inSpan.rows.map((r) => ({
      seatId: r.seatId,
      label: r.label,
      rank: r.rank,
      from: r.from,
      to: r.to,
      reason: namesVisible ? r.reason : null,
      summary: r.summary,
    })),
    exposedN: (ownSummary ? ownSummary.exposedN : 0) + inSpan.exposedN,
    exposedOpenN: (ownSummary ? ownSummary.exposedOpenN : 0) + inSpan.exposedOpenN,
    // ADR-0123: the overlap reading travels with the register at every
    // altitude, so a director's unit and a chief's enterprise receive the same
    // derived windows without a second store or a second computation.
    concurrency: absenceConcurrency(state, built, seat, { now, settings, items }),
  };
}

/** Compare direct leadership branches without copying identities or records upward.
 * Each duty is assigned once to its nearest direct branch; the active seat's
 * own duties are excluded. Rates are descriptive register coverage, not risk
 * predictions. Branch numbers are ephemeral and are not organisational IDs.
 */
function branchCoverage(built, seat, rows) {
  if (seat.fullAccess || seat.readOnly || (seat.rank ?? 0) < 3) return null;
  const children = seat.childSeatIds.map((id) => built.byId.get(id)).filter(Boolean)
    .sort((a, b) => a.id.localeCompare(b.id));
  const branches = children.map((child, i) => {
    const branchRows = rows.filter((row) => row.seat.id === child.id || child.scope.has(row.seat.id));
    const total = branchRows.length;
    const covered = branchRows.filter((row) => row.reading.band === 'covered').length;
    return {
      label: `Branch ${i + 1} · ${child.label}`,
      dutiesN: total, coveredN: covered,
      gapN: branchRows.filter((row) => row.reading.band === 'gap').length,
      openGapN: branchRows.filter((row) => row.reading.band === 'gap' && row.reading.openN > 0).length,
      readinessPct: total ? round1(covered * 100 / total) : null,
    };
  });
  const ownN = rows.filter((row) => row.seat.id === seat.id).length;
  // Check each row, rather than only the totals: an omission and a duplicate
  // could otherwise cancel out and make a broken partition look complete.
  const partitioned = rows.every((row) => row.seat.id === seat.id
    ? !children.some((child) => child.id === row.seat.id || child.scope.has(row.seat.id))
    : children.filter((child) => child.id === row.seat.id || child.scope.has(row.seat.id)).length === 1);
  if (!partitioned) return { branches: [], ownN, refusal: 'The reporting tree did not partition this register; comparison refused.' };
  const eligible = branches.filter((branch) => branch.dutiesN > 0);
  const total = eligible.reduce((sum, branch) => sum + branch.dutiesN, 0);
  const covered = eligible.reduce((sum, branch) => sum + branch.coveredN, 0);
  return {
    branches, ownN, refusal: eligible.length < 2 ? 'At least two branches with declared duty lines are needed for comparison.' : null,
    pooledPct: total ? round1(covered * 100 / total) : null,
    meanPct: eligible.length ? round1(eligible.reduce((sum, branch) => sum + branch.coveredN / branch.dutiesN, 0) * 100 / eligible.length) : null,
  };
}

/**
 * Read the whole register for one seat. `projection` carries the counts every
 * altitude reads: a frontline lead sees their own five duties with names,
 * a director sees every duty under their span as counts and refusals, and the
 * chief sees the enterprise rows and the concentration that needs a second hand.
 */
export function buildDutyCoverageReport(state, { now = new Date(), settings = null } = {}) {
  const effective = settings || state?.settings || null;
  const built = buildSeats(state, { now, settings: effective });
  const seat = activeSeat(built);
  const conv = normalizeDutyCoverageSettings(effective || {});
  const items = harvestWork(state, built.chain, { now, settings: effective });

  // A seat reads its OWN duty lines plus every declared duty line in the spans
  // below it, so a manager sees their leads' register and a director sees the
  // managers'. Names are withheld above the manager altitude below.
  const scopedSeats = seat.fullAccess
    ? built.seats.filter((s) => !s.isLeader)
    : [seat, ...built.seats.filter((s) => !s.isLeader && s.id !== seat.id && seat.scope.has(s.id))];
  const rows = [];
  for (const s of scopedSeats) {
    const duties = dutiesForSeat(s);
    for (const duty of duties) {
      rows.push({ seat: s, reading: dutyReading(state, built, s, duty, { now, settings: effective, items }) });
    }
  }

  const byBand = { covered: 0, thin: 0, ineligible: 0, gap: 0 };
  for (const row of rows) byBand[row.reading.band] += 1;
  const total = rows.length;
  const coveredN = byBand.covered;

  // The enterprise reading is deliberately counts-only: the same table, with
  // each duty's owner seat described and no person named below it.
  // Above rank 2 the register prints counts, seats and refusals — never a
  // person's name for a cover. Below it, the lead needs the actual names.
  const namesVisible = seat.fullAccess || (seat.rank ?? 1) <= 2;
  const redactSeat = (seatObj) => {
    if (!seatObj) return seatObj;
    if (namesVisible) return seatObj;
    return { id: seatObj.id, name: null, label: seatObj.label, rank: seatObj.rank, altitudeKey: seatObj.altitudeKey };
  };
  const redactReading = (reading) => {
    if (namesVisible) return reading;
    return {
      ...reading,
      covers: reading.covers.map((c) => ({ ...c, coverId: null, name: null, label: c.rank === null ? null : `Rank ${c.rank} cover`, note: null, declaredBySeatId: null, decisionId: null })),
      candidates: [],
      eligibleCandidates: reading.eligibleCandidates.map((c) => ({ personId: null, name: null, label: c.label, rank: c.rank, eligible: true, reason: c.reason, isSelf: c.isSelf })),
      ineligibleCandidates: reading.ineligibleCandidates.map((c) => ({ personId: null, name: null, label: c.label, rank: c.rank, eligible: false, reason: c.reason, isSelf: c.isSelf })),
      concentration: {
        ...reading.concentration,
        rows: reading.concentration.rows.map((h) => ({ personId: null, name: null, n: h.n, sharePct: h.sharePct })),
        top: reading.concentration.top ? { personId: null, name: null, n: reading.concentration.top.n, sharePct: reading.concentration.top.sharePct } : null,
      },
    };
  };
  const redactRow = (row) => {
    if (namesVisible) return row;
    return { seat: redactSeat(row.seat), reading: redactReading(row.reading) };
  };

  const perSeat = new Map();
  for (const row of rows) {
    const key = row.seat.id;
    if (!perSeat.has(key)) perSeat.set(key, { seatId: key, name: row.seat.name, label: row.seat.label, rank: row.seat.rank, altitudeKey: row.seat.altitudeKey, dutiesN: 0, covered: 0, thin: 0, ineligible: 0, gap: 0, soleHandedN: 0 });
    const entry = perSeat.get(key);
    entry.dutiesN += 1;
    entry[row.reading.band] += 1;
    if (row.reading.concentration.soleHanded) entry.soleHandedN += 1;
  }
  const seatRows = [...perSeat.values()].sort((a, b) => b.rank - a.rank || String(a.name).localeCompare(String(b.name)));

  const redactedRows = rows.map(redactRow);
  const effectiveRows = namesVisible ? rows : redactedRows;
  const gaps = effectiveRows.filter((r) => r.reading.band === 'gap');
  const thin = effectiveRows.filter((r) => r.reading.band === 'thin');
  const ineligible = effectiveRows.filter((r) => r.reading.band === 'ineligible');
  const unexercisedDutyGaps = effectiveRows.filter((r) => r.reading.openN > 0 && r.reading.band === 'gap');

  const readinessPct = total ? round1((coveredN / total) * 100) : null;
  const interval = total ? wilsonInterval(coveredN, total) : null;

  return {
    engineVersion: 'duty-coverage-2026.11-v1',
    premise: DUTY_PREMISE,
    seat: {
      id: seat.id,
      name: namesVisible ? seat.name : null,
      label: seat.label,
      rank: seat.rank,
      altitudeKey: seat.altitudeKey,
      fullAccess: Boolean(seat.fullAccess),
      readOnly: Boolean(seat.readOnly),
      scopeN: seat.scopeN,
    },
    namesVisible,
    branchCoverage: branchCoverage(built, seat, rows),
    absences: buildAbsenceSection(state, built, seat, { now, settings: effective, items }),
    conventions: conv,
    bounds: {
      dutyCoverageExerciseDays: [7, 180],
      dutyCoverageConcentrationPct: [50, 100],
      dutyAbsenceMaxSpanDays: DUTY_ABSENCE_LIMITS.maxSpanDays,
      dutyConcurrencyWindowCap: DUTY_ABSENCE_LIMITS.concurrentWindowCap,
      dutyCoverLoadCap: DUTY_COVER_LOAD_LIMITS.coverCap,
    },
    summary: {
      dutiesN: total,
      coveredN,
      thinN: byBand.thin,
      ineligibleN: byBand.ineligible,
      gapN: byBand.gap,
      byBand,
      openGapN: unexercisedDutyGaps.length,
      soleHandedN: rows.filter((r) => r.reading.concentration.soleHanded).length,
      readinessPct,
      interval,
      windowStart: addDays(dayKey(now), -conv.dutyCoverageExerciseDays),
    },
    rows: redactedRows,
    seatRows: namesVisible ? seatRows : seatRows.map((s) => ({ ...s, name: null })),
    gaps,
    thin,
    ineligible,
    refusals: [
      ...rows.filter((r) => !r.reading.eligibleCandidates.length).map((r) => ({
        dutyId: r.reading.dutyId,
        reason: `“${r.reading.label}” has no eligible stand-in in the reporting tree for ${namesVisible ? r.seat.name : 'this seat'}. The holder cannot cover their own absence; add an eligible leadership stand-in to the roster or review the reporting tree.`,
      })),
      ...ineligible.map((r) => ({
        dutyId: r.reading.dutyId,
        reason: r.reading.bandReason,
      })),
    ].slice(0, DUTY_COVERAGE_LIMITS.rowCap),
  };
}

/** The identity-free upward brief: counts, altitudes and every refusal, named. */
export function dutyCoverageBriefText(report) {
  if (!report) return 'No duty-coverage register is available.';
  const s = report.summary;
  const lines = [
    `LeadOS · Duty coverage — ${report.seat.label} (rank ${report.seat.rank}, ${s.dutiesN} declared duty line(s))`,
    `Covered: ${s.coveredN} · thin (declared, unexercised): ${s.thinN} · ineligible cover: ${s.ineligibleN} · no cover: ${s.gapN}`,
    s.interval
      ? `Register readiness ${s.readinessPct}% (${s.coveredN}/${s.dutiesN}; Wilson 95% ${s.interval.low}–${s.interval.high}%). This measures the REGISTER, not any person.`
      : 'Register readiness: refused — no declared duty line exists at this seat, so there is no denominator and no rate.',
    `${s.openGapN} duty line(s) carrying open work have no cover at all.`,
    s.soleHandedN ? `${s.soleHandedN} duty line(s) are 100%-concentrated in one hand at or above the declared ${report.conventions.dutyCoverageConcentrationPct}% share.` : 'No duty line is concentrated in a single hand above the declared share.',
  ];
  const absenceTotal = (report.absences?.own ? 1 : 0) + (report.absences?.inSpan?.length || 0);
  if (absenceTotal) {
    lines.push(`Dated absence plans: ${absenceTotal} active in this span — ${report.absences.exposedOpenN} duty line(s) carry open work with no available cover on the absence dates. Availability is derived from the declared windows, never stored.`);
  }
  // ADR-0123: concurrency is printed as its own reading, with its own refusal.
  const conc = report.absences?.concurrency;
  if (conc && conc.summary.participantsN > 0) {
    if (conc.refused) {
      lines.push(`Concurrent absence: refused — ${conc.refused}`);
    } else {
      lines.push(`Concurrent absence: ${conc.summary.windowsN} overlapping window(s) in this span, at most ${conc.summary.maxConcurrent} seats absent at once — ${conc.summary.exposedN} duty line(s) have no available cover on the shared dates, ${conc.summary.exposedOpenN} of them carrying open work, and ${conc.summary.singleCoverN} single-cover point(s) where one person is the only answerable cover for two or more absent seats.`);
      if (conc.summary.deferredWindowsN) {
        lines.push(`  · ${conc.summary.deferredWindowsN} further overlapping window(s) were not graded: the concurrency sweep is capped at ${report.bounds.dutyConcurrencyWindowCap} window(s).`);
      }
      // ADR-0124: counts only, no name and no cover id — the same identity-free
      // contract the rest of the upward brief already carries.
      const load = conc.coverLoad;
      if (load) {
        lines.push(`Cover capacity on the shared dates: ${load.gradedN} available cover(s) graded against a like-for-like revealed envelope (largest ${load.envelopeN} open work item(s) among ${load.envelopeSeatsN} comparable seat(s)) — ${load.overEnvelopeN} would carry more than that peak (largest ${load.maxCombinedN} item(s)), ${load.refusedN} refused. The union counts each open item once, including items already inside the cover's own span.`);
        if (load.refusal) lines.push(`  · Cover capacity refusal: ${load.refusal}`);
        if (load.deferredCoversN) lines.push(`  · ${load.deferredCoversN} further available cover(s) were not graded: the capacity sweep is capped at ${report.bounds.dutyCoverLoadCap} cover(s) per window.`);
      }
    }
  }
  const comparison = report.branchCoverage;
  if (comparison) {
    if (comparison.refusal) lines.push(`Branch comparison refused: ${comparison.refusal}`);
    else lines.push(`Direct branches: pooled register readiness ${comparison.pooledPct}%; mean branch readiness ${comparison.meanPct}%. ${comparison.ownN} own duty line(s) excluded. These are descriptive register measures, not forecasts.`);
  }
  if (report.refusals.length) {
    lines.push(`Printed refusals (${report.refusals.length}):`);
    for (const refusal of report.refusals.slice(0, 8)) lines.push(`  · ${refusal.reason}`);
  } else if (s.gapN || s.thinN || s.ineligibleN) {
    lines.push('Nothing was refused outright, but the bands above are not a pass: a duty line with no cover, or with a cover nobody has exercised, keeps printing until a human declares one.');
  } else lines.push('No refusals: every declared duty line has an eligible, exercised cover.');
  lines.push('A declaration nobody exercises is a name on a page; this register says so instead of printing a reassuring blank.');
  return lines.join('\n');
}

/** Aggregate-only rows for the CSV register; identity-free above rank 2. */
export function dutyCoverageCsvRows(report) {
  if (!report) return [];
  const rows = [];
  const scope = report.seat.fullAccess ? 'operator' : `rank-${report.seat.rank}`;
  for (const row of report.rows) {
    const r = row.reading;
    rows.push({
      row_kind: 'duty',
      scope,
      altitude: report.seat.altitudeKey || '',
      duty_key: r.key,
      band: r.band,
      open_n: r.openN,
      covers_declared_n: r.covers.length,
      covers_eligible_n: r.eligibleCoversN,
      covers_exercised_n: r.exercisedCoversN,
      candidates_eligible_n: r.eligibleCandidates.length,
      candidates_refused_n: r.ineligibleCandidates.length,
      concentration_top_share_pct: r.concentration.top?.sharePct ?? '',
      sole_handed: r.concentration.soleHanded ? 'yes' : 'no',
      window_days: report.conventions.dutyCoverageExerciseDays,
      refused_reason: r.band === 'gap' || r.band === 'thin' || r.band === 'ineligible' ? r.bandReason.slice(0, 200) : '',
    });
  }
  rows.push({
    row_kind: 'register',
    scope,
    altitude: report.seat.altitudeKey || '',
    duty_key: '',
    band: '',
    open_n: report.summary.openGapN,
    covers_declared_n: report.summary.coveredN,
    covers_eligible_n: report.summary.thinN,
    covers_exercised_n: report.summary.ineligibleN,
    candidates_eligible_n: report.summary.gapN,
    candidates_refused_n: report.summary.soleHandedN,
    concentration_top_share_pct: report.summary.readinessPct ?? '',
    sole_handed: '',
    window_days: report.conventions.dutyCoverageExerciseDays,
    refused_reason: report.summary.interval ? '' : 'no declared duty line at this seat',
  });
  // ADR-0122: one aggregate row per active absence plan in scope (own + span).
  // Window and exposure counts only — no person, no seat id, no seat label, no
  // reason text. The seat's rank is a position number, not an identity.
  const absenceRows = [];
  if (report.absences?.own) {
    absenceRows.push({ seatId: report.seat.id, label: report.seat.label, rank: report.seat.rank, from: report.absences.own.from, to: report.absences.own.to, summary: report.absences.own.summary });
  }
  for (const a of report.absences?.inSpan || []) {
    absenceRows.push({ seatId: a.seatId, label: a.label, rank: a.rank, from: a.from, to: a.to, summary: a.summary });
  }
  for (const a of absenceRows) {
    rows.push({
      row_kind: 'absence',
      scope,
      altitude: report.seat.altitudeKey || '',
      duty_key: '',
      band: '',
      absence_seat_rank: a.rank,
      absence_from: a.from,
      absence_to: a.to,
      absence_duties_n: a.summary.dutiesN,
      absence_covered_n: a.summary.coveredN,
      absence_thin_n: a.summary.thinN,
      absence_cover_absent_n: a.summary.coverAbsentN,
      absence_ineligible_n: a.summary.ineligibleN,
      absence_gap_n: a.summary.gapN,
      absence_exposed_open_n: a.summary.exposedOpenN,
      refused_reason: '',
    });
  }
  return rows;
}

/** Attention: an open-work duty with no cover, or a stale ineligible one. */
export function dutyCoverageAttentionCount(state, { now = new Date(), settings = null } = {}) {
  try {
    const built = buildSeats(state, { now, settings: settings || state?.settings || null });
    const seat = activeSeat(built);
    if (seat.fullAccess) return 0;
    const report = buildDutyCoverageReport(state, { now, settings });
    return report.summary.openGapN + report.summary.ineligibleN;
  } catch {
    return 0;
  }
}
