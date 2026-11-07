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

/* ------------------------------------------------------------------ helpers */

const round1 = (n) => Math.round(n * 10) / 10;
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
 *   the seat itself     the holder rehearses their own absence;
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
    const eligible = isSelf || candidateRank >= seatRank;
    rows.push({
      personId: node.id,
      name: node.name,
      label: nodeSeat.label,
      rank: candidateRank,
      altitudeKey: nodeSeat.altitudeKey,
      isSelf,
      relation: isSelf ? 'self' : (above ? 'ancestor' : 'descendant'),
      eligible,
      reason: eligible
        ? (isSelf
          ? 'The seat itself — the holder may rehearse their own absence.'
          : above
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
    ineligible: `${ineligibleCovers.length} declared cover(s) cannot answer this duty at rank ${seat.rank}. The declaration is stale, not wrong in spirit — re-declare it on an eligible person.`,
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
    conventions: conv,
    bounds: {
      dutyCoverageExerciseDays: [7, 180],
      dutyCoverageConcentrationPct: [50, 100],
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
      ...rows.filter((r) => !r.reading.candidates.length).map((r) => ({
        dutyId: r.reading.dutyId,
        reason: `“${r.reading.label}” has no eligible candidate inside this span: the reporting tree puts nobody at or above rank ${r.seat.rank} under ${namesVisible ? r.seat.name : 'this seat'}. Declare the duty's cover from the altitude above, or record the stand-in as a person on the roster first.`,
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
