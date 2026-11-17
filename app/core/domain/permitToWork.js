/**
 * app/core/domain/permitToWork.js — the ONE reader of the Permit-to-Work,
 * Energy-Isolation & Simultaneous-Operations Register (ADR-0246, Schema v200,
 * `#/permit-to-work`).
 *
 * Every state, expiry, proof verdict, atmosphere verdict, conflict and count this
 * module prints is derived here, on read, from stored declarations and the
 * injected clock. Nothing derived is stored anywhere, so the same workspace read
 * twice gives the same answer and a hand-edited file cannot carry a green permit
 * over a line whose isolation was lifted at eleven.
 *
 * THE ONE QUESTION THIS READER ANSWERS PER PERMIT: *at this minute, what does the
 * record actually prove stands between a crew and the energy on this plant?* The
 * answer is one of nine states and every condition that fired beneath it, and each
 * is a DIFFERENT fact:
 *
 *   live                 inside validity, every required isolation proved, the
 *                        latest reading per declared test inside the limit and
 *                        inside the declared freshness window, no suspension open.
 *   live-unverified      inside validity and at least one recorded isolation has no
 *                        proof of zero energy inside the permit's own window.
 *   live-atmosphere      inside validity and the latest reading fails the permit's
 *                        own limit, or the permit declares a test it never recorded.
 *   live-atmosphere-stale inside validity, the readings pass, and at least one is
 *                        older than the freshness window the permit declared.
 *   suspended            a suspension is recorded and not resumed.
 *   not-yet-valid        declared for a later window; nobody may work under it yet.
 *   expired-open         validity ended with no closure on the record.
 *   closed-complete      closed with every isolation removed and confirmed.
 *   closed-isolation-owed closed while an isolation was never removed and confirmed.
 *
 * WHY THE ORDER OF THE FLAGS IS PART OF THE DESIGN. `live-atmosphere` outranks
 * `live-unverified` in the state name because a breathing atmosphere outranks every
 * other fact about a permit to enter a space, and BOTH are still printed in
 * `flags` — the state is a headline, the flags are the record. No state ever hides
 * a second condition behind the first.
 *
 * WHY `expired-open` AND NOT "closed". A permit whose validity ran out and that
 * nobody closed is not closed. It is the exact state in which the paperwork and the
 * plant have stopped agreeing, and it is the state in which people are hurt. It is
 * printed with the exact whole minutes it has been open past its end.
 *
 * WHY THE CONFLICTS ARE DERIVED AND NEVER STORED. A vendor conflict check is a
 * screen that tells you about now. A record that recomputes the conflict from the
 * isolation and the permit's own window can still prove, six weeks later, that the
 * line was lifted at 11:04 while the hot-work permit ran to 17:00 — and it cannot be
 * made to agree with itself by editing a status.
 *
 * MATRIX CORRECTNESS (ADR-0140/0141). A permit is ISSUED by one line holder and
 * HELD by one person, and in a matrix those are routinely different hands: the
 * engineer who authorises the work may sit on the function line while the plant the
 * work is on is owned by another. The reader therefore resolves every ACTIVE line
 * that holds the HOLDER today through the one matrix engine, prints them beside the
 * issuing line, counts a person ONCE in every people figure, and hands the rule the
 * joint apex over those lines — never the holder, who is the person the control
 * protects.
 */

import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import {
  PTW_CONFLICT_KIND_BY_KEY,
  PTW_CONFLICT_KINDS,
  PTW_ENGINE_VERSION,
  PTW_STATE_BY_KEY,
  PTW_STATE_KEYS,
} from './permitToWorkRegistry.js';
import {
  normalizePtwAtmosphere,
  normalizePtwClosures,
  normalizePtwHandovers,
  normalizePtwIsolations,
  normalizePtwMarkers,
  normalizePtwPermits,
  normalizePtwSettings,
  normalizePtwSuspensions,
} from './permitToWorkSchema.js';
import {
  atmosphereVerdict,
  freshnessReading,
  instantMs,
  isolationProof,
  minutesBetweenOrdinal,
  minutesPast,
  minutesRemaining,
  overlapMs,
  overlapMinutes,
  validityEndMs,
} from './permitToWorkMath.js';

const list = (value) => (Array.isArray(value) ? value : []);

/** A readable label for a hand. The raw id `leader` never reaches a screen. */
export function ptwPersonLabel(matrix, personId) {
  if (personId === LEADER_ID) return 'Workspace leader';
  const node = matrix?.nodes?.get(personId);
  if (node?.name) return node.name;
  const person = matrix?.roster?.get(personId);
  return person?.name || personId;
}

/** Every ACTIVE line that holds a person, as `{ managerId, kind, shareH }`. */
export function ptwActiveLinesFor(matrix, personId) {
  const lines = matrix?.linesByPerson?.get(personId) || [];
  return lines
    .filter((line) => line && line.active !== false && line.managerId && line.managerId !== personId)
    .map((line) => ({
      lineId: line.id || null,
      managerId: line.managerId,
      kind: line.kind || null,
      shareH: Number.isInteger(line.shareH) ? line.shareH : null,
    }))
    .sort((a, b) => String(a.managerId).localeCompare(String(b.managerId)));
}

/** The applied isolations a permit depends on, in a stable order. */
const isolationsFor = (rows, permitId) => rows
  .filter((row) => row.permitId === permitId)
  .sort((a, b) => instantMs(a.appliedAt) - instantMs(b.appliedAt) || minutesBetweenOrdinal(a.id, b.id));

/** The LATEST reading per declared test. A tie at the same instant resolves by id. */
export function latestReadings(atmosphere, permit) {
  const rows = atmosphere.filter((row) => row.permitId === permit.id);
  const byTest = new Map();
  for (const row of rows) {
    const held = byTest.get(row.testKey);
    if (!held) { byTest.set(row.testKey, row); continue; }
    const delta = instantMs(row.testedAt) - instantMs(held.testedAt);
    if (delta > 0 || (delta === 0 && minutesBetweenOrdinal(row.id, held.id) > 0)) byTest.set(row.testKey, row);
  }
  return permit.atmospherePlan.map((entry) => {
    const reading = byTest.get(entry.testKey) || null;
    const verdict = reading ? atmosphereVerdict(entry, reading.reading) : { verdict: 'undeterminable', reason: 'The permit declares this test and no reading of it exists on the record.' };
    const freshness = { stale: null, minutesSince: null, minutesOver: null, reason: null };
    return { entry, reading, verdict, freshness };
  });
}

/**
 * THE PERMIT KERNEL. Pure over (permit, its isolations, its atmosphere, its
 * handovers, its suspensions, its closure, nowMs), exported so the suite can pin
 * every branch without a store and so the rule and the screen cannot disagree about
 * a state.
 *
 * Every figure is an exact whole number of minutes or null, and a null is always
 * accompanied by the reason it could not be computed.
 */
export function derivePtwState({ permit, isolations = [], atmosphere = [], handovers = [], suspensions = [], closure = null, nowMs }) {
  const startMs = instantMs(permit?.validFromAt);
  const endMs = validityEndMs(startMs, permit?.validityMinutes);
  const closedMs = closure ? instantMs(closure.closedAt) : null;
  const flightMs = instantMs(permit?.flightFromAt);

  // A closed permit is read AT ITS CLOSE, not at this minute: a lateness figure
  // that kept growing after a human ended the permit is a figure about a period
  // that no longer exists.
  const readingMs = closedMs !== null ? closedMs : nowMs;

  /** The instant the permit becomes live: its declared start, or its flight window. */
  const goLiveMs = Number.isFinite(flightMs) ? flightMs : startMs;

  /** An isolation is REQUIRED when the permit declares it and the permit requires
   *  proven energy control. A `general` permit with no declared isolation requires
   *  none — and that is a declared absence, not an assumption: the permit's work
   *  kind decides it, and the door will not issue an energy-control kind with none. */
  const isolationRows = isolations.map((row) => {
    const proof = isolationProof({
      appliedMs: instantMs(row.appliedAt),
      verifiedMs: row.verifiedAt ? instantMs(row.verifiedAt) : null,
      verifyWithinMinutes: row.verifyWithinMinutes,
    });
    // Once the isolation is removed AND confirmed, it no longer protects anything.
    // The record of the removal is what the conflict engine reads, and a permit
    // whose isolation was restored must not read as proved because it once was.
    const restored = Boolean(row.removalConfirmedById);
    return {
      isolation: row,
      proof,
      restored,
      protects: !restored,
      removedMs: row.removedAt ? instantMs(row.removedAt) : null,
      unconfirmedRemoval: Boolean(row.removedAt && !row.removalConfirmedById),
    };
  });

  const outstanding = isolationRows.filter((row) => row.protects);
  const unverified = outstanding.filter((row) => !row.proof.proved);
  const overdue = outstanding.filter((row) => row.proof.overdue);
  const unconfirmedRemoval = isolationRows.filter((row) => row.unconfirmedRemoval);

  /** ATMOSPHERE. The latest reading per declared test, compared exactly. */
  const readingRows = permit?.atmospherePlan?.length
    ? latestReadings(atmosphere, permit).map((row) => ({
      ...row,
      freshness: row.reading
        ? freshnessReading(readingMs, instantMs(row.reading.testedAt), row.entry.freshnessMinutes)
        : row.freshness,
    }))
    : [];
  const atmosphereFailing = readingRows.filter((row) => row.verdict.verdict !== 'pass');
  const atmosphereStale = readingRows.filter((row) => row.verdict.verdict === 'pass' && row.freshness.stale === true);
  const atmosphereOutOfLimit = atmosphereFailing.filter((row) => row.reading !== null);
  const atmosphereMissing = atmosphereFailing.filter((row) => row.reading === null);

  const openSuspensions = suspensions
    .filter((row) => !row.resumedAt)
    .sort((a, b) => instantMs(b.suspendedAt) - instantMs(a.suspendedAt) || minutesBetweenOrdinal(a.id, b.id));
  const suspended = openSuspensions.length > 0;

  const lateMinutes = Number.isFinite(endMs) && Number.isFinite(readingMs) ? minutesPast(readingMs, endMs) : null;
  const remainingMinutes = Number.isFinite(endMs) && closedMs === null ? minutesRemaining(nowMs, endMs) : null;

  const base = {
    startMs,
    endMs,
    goLiveMs,
    closedMs,
    flightMs: Number.isFinite(flightMs) ? flightMs : null,
    remainingMinutes,
    lateMinutes,
    isolationRows: isolationRows.map((row) => ({ ...row, proof: { ...row.proof } })),
    requiredIsolationN: isolationRows.length,
    outstandingIsolationN: outstanding.length,
    unverifiedIsolationN: unverified.length,
    overdueIsolationN: overdue.length,
    unconfirmedRemovalN: unconfirmedRemoval.length,
    readings: readingRows,
    atmosphereFailingN: atmosphereFailing.length,
    atmosphereStaleN: atmosphereStale.length,
    atmosphereOutOfLimitN: atmosphereOutOfLimit.length,
    atmosphereMissingN: atmosphereMissing.length,
    handoversN: handovers.length,
    suspensionsN: suspensions.length,
    suspensionOpen: suspended,
    lastHandover: handovers.length
      ? [...handovers].sort((a, b) => instantMs(b.at) - instantMs(a.at) || minutesBetweenOrdinal(a.id, b.id))[0]
      : null,
    selfIssued: Boolean(permit?.selfIssued),
    noFireWatch: Boolean(permit?.noFireWatch),
  };

  const stateFor = (key) => ({ key, ...PTW_STATE_BY_KEY[key] });

  /** THE FLAGS. Every condition that fired, whether or not it becomes the headline. */
  const flags = [];
  if (permit?.energyControl && isolationRows.length === 0) flags.push('no-isolation-declared');
  if (unverified.length) flags.push('isolation-unverified');
  if (overdue.length) flags.push('isolation-verification-overdue');
  if (unconfirmedRemoval.length) flags.push('isolation-removal-unconfirmed');
  if (atmosphereOutOfLimit.length || atmosphereMissing.length) flags.push('atmosphere-out-of-limit');
  if (atmosphereStale.length) flags.push('atmosphere-stale');
  if (suspended) flags.push('suspended');
  if (permit?.selfIssued) flags.push('self-issued');
  if (permit?.noFireWatch) flags.push('no-fire-watch');

  /* --------------------------------------------------------------- closure */

  if (closedMs !== null) {
    // NOTE THE FIELD PATH: `isolationRows` here hold `{ isolation: <stored row>, … }`,
    // so the confirmed-removal hand lives at `row.isolation.removalConfirmedById`.
    // Reading it one level too high silently made every closure read
    // `closed-isolation-owed` — the exact direction of error (printing a defect that
    // is not there) that this register exists to refuse.
    const isolationOwed = isolationRows.some((row) => !row.isolation.removalConfirmedById);
    return {
      ...base,
      flags,
      state: stateFor(isolationOwed ? 'closed-isolation-owed' : 'closed-complete'),
      isolationOwed,
      closure,
    };
  }

  /* ---------------------------------------------------- not yet valid (flight) */

  /**
   * BEFORE THE DECLARED FIRST ENTRY the permit is `not-yet-valid`. But a permit
   * whose declared test has ALREADY been recorded and ALREADY fails its own limit
   * is not merely future — the atmosphere in that space is measured and wrong right
   * now, and printing a neutral "not yet" over it is the fold this register exists
   * to prevent. The existing failure is printed instead. A test that has simply not
   * been taken yet is NOT a failure before entry: nobody has been asked to measure
   * it yet, so the permit reads `not-yet-valid` and the method tab says the reading
   * is owed before entry.
   */
  if (Number.isFinite(nowMs) && Number.isFinite(goLiveMs) && nowMs < goLiveMs) {
    if (atmosphereOutOfLimit.length) {
      return { ...base, flags, state: stateFor('live-atmosphere'), isolationOwed: false, closure: null, beforeEntry: true };
    }
    return { ...base, flags, state: stateFor('not-yet-valid'), isolationOwed: false, closure: null };
  }

  /* --------------------------------------------------------------- expired */

  if (Number.isFinite(nowMs) && Number.isFinite(endMs) && nowMs > endMs) {
    return { ...base, flags, state: stateFor('expired-open'), isolationOwed: false, closure: null };
  }

  /* ------------------------------------------------------------- suspended */

  if (suspended) {
    return { ...base, flags, state: stateFor('suspended'), isolationOwed: false, closure: null };
  }

  /* ---------------------------------------------------------------- live */

  // An unreadable clock is not a licence to print "live".
  if (!Number.isFinite(nowMs) || endMs === null || goLiveMs === null) {
    return { ...base, flags, state: stateFor('live-unverified'), isolationOwed: false, closure: null, unreadableClock: true };
  }

  if (atmosphereFailing.length) {
    return { ...base, flags, state: stateFor('live-atmosphere'), isolationOwed: false, closure: null };
  }
  /**
   * ENERGY-CONTROL WORK WITH NO ISOLATION ON THE RECORD IS NOT PROVED. A permit of a
   * kind that requires proven energy control, live with an empty isolation ledger,
   * reads `live-unverified` — nothing on the record proves the plant is dead, and
   * the absence of an isolation row is not evidence of a safe plant.
   */
  if (permit?.energyControl && isolationRows.length === 0) {
    return { ...base, flags, state: stateFor('live-unverified'), isolationOwed: false, closure: null, noIsolationDeclared: true };
  }
  if (unverified.length) {
    return { ...base, flags, state: stateFor('live-unverified'), isolationOwed: false, closure: null };
  }
  if (atmosphereStale.length) {
    return { ...base, flags, state: stateFor('live-atmosphere-stale'), isolationOwed: false, closure: null };
  }
  return { ...base, flags, state: stateFor('live'), isolationOwed: false, closure: null };
}

/* ------------------------------------------------------------- conflicts */

const makeConflict = (kind, data) => ({
  kind,
  severity: PTW_CONFLICT_KIND_BY_KEY[kind]?.severity ?? 1,
  label: PTW_CONFLICT_KIND_BY_KEY[kind]?.label || kind,
  says: PTW_CONFLICT_KIND_BY_KEY[kind]?.says || '',
  ...data,
});

/**
 * SIMULTANEOUS-OPERATIONS CONFLICTS, derived from the finished record.
 *
 * Exported so the suite can pin every branch without a store, and so the rule and
 * the screen cannot disagree about a conflict. Every conflict names the exact
 * figures that prove it — the overlap in whole minutes, the minutes past a window,
 * the reading and the limit — because a conflict without its arithmetic is an
 * opinion.
 */
export function derivePtwConflicts(rows) {
  const conflicts = [];
  const byId = new Map(rows.map((row) => [row.permit.id, row]));

  /** Two permits whose validity windows overlap, half-open, computed exactly. */
  const overlaps = (a, b) => overlapMs(a.startMs, a.endMs, b.startMs, b.endMs) > 0;

  /* 1. An isolation released under a LIVE permit it protects. */
  for (const row of rows) {
    for (const iso of row.isolationRows) {
      if (!iso.removedMs) continue;
      for (const other of rows) {
        if (other.permit.id === row.permit.id) continue;
        if (!other.isolationRows.some((candidate) => candidate.isolation.pointRef.toLowerCase() === iso.isolation.pointRef.toLowerCase()
          && candidate.isolation.lockRef.toLowerCase() === iso.isolation.lockRef.toLowerCase())) continue;
        const openAtRelease = other.closedMs === null && iso.removedMs >= other.startMs && iso.removedMs <= other.endMs;
        if (!openAtRelease) continue;
        conflicts.push(makeConflict('isolation-released-under-live-permit', {
          areaRef: row.permit.areaRef,
          pointRef: iso.isolation.pointRef,
          permitIds: [row.permit.id, other.permit.id],
          at: iso.isolation.removedAt,
          minutes: overlapMinutes(other.startMs, other.endMs, iso.removedMs, iso.removedMs + 60_000),
          detail: `The isolation on ${iso.isolation.pointRef} (lock ${iso.isolation.lockRef}) was removed while ${other.permit.workRef} was still inside its validity window.`,
        }));
      }
    }
  }

  /**
   * 2. HOT WORK LIVE OVER AN ISOLATION RELEASE, IN ONE AREA.
   *
   * THE SECOND PERMIT IN THE AREA IS THE EVIDENCE, not a duplicate isolation row.
   * The release this register must catch is: crew A's isolation was restored while
   * crew B's ignition source was still live in the same space. Crew A often does not
   * record the isolation at all — the permit itself is what tells us something was
   * being done to that plant. Requiring both permits to carry the same isolation row
   * would make the single most dangerous contradiction in the category visible only
   * when the paperwork happened to be duplicated.
   */
  for (const hot of rows.filter((row) => row.permit.ignition)) {
    if (hot.closedMs !== null) continue;
    for (const other of rows) {
      if (other.permit.id === hot.permit.id) continue;
      if (String(other.permit.areaRef).toLowerCase() !== String(hot.permit.areaRef).toLowerCase()) continue;
      const releases = other.isolationRows.filter((iso) => iso.removedMs && iso.removedMs >= hot.startMs && iso.removedMs <= hot.endMs);
      if (!releases.length) {
        /**
         * NO RECORDED RELEASE, BUT A SECOND PERMIT IN THE SAME AREA DURING HOT WORK.
         * The register cannot prove an energy release here, and it will not invent
         * one. What it CAN prove is that two authorised activities share one space
         * with an ignition source live, so it prints that as its own finding with the
         * exact overlap and says plainly that no isolation release is recorded.
         */
        if (!overlaps(hot, other)) continue;
        conflicts.push(makeConflict('entry-during-hot-work', {
          areaRef: hot.permit.areaRef,
          pointRef: null,
          permitIds: [hot.permit.id, other.permit.id],
          at: null,
          minutes: overlapMinutes(hot.startMs, hot.endMs, other.startMs, other.endMs),
          detail: `${other.permit.workRef} is live in ${hot.permit.areaRef} while the hot-work permit ${hot.permit.workRef} is live there. No isolation release is recorded on this pair; the overlap of the two authorisations is the finding.`,
        }));
        continue;
      }
      for (const iso of releases) {
        conflicts.push(makeConflict('hot-work-over-isolation-release', {
          areaRef: hot.permit.areaRef,
          pointRef: iso.isolation.pointRef,
          permitIds: [hot.permit.id, other.permit.id],
          at: iso.isolation.removedAt,
          minutes: minutesPast(iso.removedMs, hot.startMs),
          detail: `The isolation on ${iso.isolation.pointRef} was removed in ${hot.permit.areaRef} while the hot-work permit ${hot.permit.workRef} was live. The energy that isolation was holding came back into a space with an ignition source in it.`,
        }));
      }
    }
  }

  /* 3. Two live hot-work permits in one area. */
  const hotLive = rows.filter((row) => row.permit.ignition && row.closedMs === null && row.state.key.startsWith('live'));
  for (let i = 0; i < hotLive.length; i += 1) {
    for (let j = i + 1; j < hotLive.length; j += 1) {
      const a = hotLive[i];
      const b = hotLive[j];
      if (String(a.permit.areaRef).toLowerCase() !== String(b.permit.areaRef).toLowerCase()) continue;
      if (!overlaps(a, b)) continue;
      conflicts.push(makeConflict('two-hot-work-same-area', {
        areaRef: a.permit.areaRef,
        permitIds: [a.permit.id, b.permit.id],
        minutes: overlapMinutes(a.startMs, a.endMs, b.startMs, b.endMs),
        detail: `Two hot-work permits are live in ${a.permit.areaRef} over the same window.`,
      }));
    }
  }

  /* 4. Confined-space entry live during hot work in the same area. */
  for (const entry of rows.filter((row) => row.permit.atmosphereRequired && row.closedMs === null && row.state.key.startsWith('live'))) {
    for (const hot of rows.filter((row) => row.permit.ignition && row.closedMs === null)) {
      if (hot.permit.id === entry.permit.id) continue;
      if (String(entry.permit.areaRef).toLowerCase() !== String(hot.permit.areaRef).toLowerCase()) continue;
      if (!overlaps(entry, hot)) continue;
      conflicts.push(makeConflict('entry-during-hot-work', {
        areaRef: entry.permit.areaRef,
        permitIds: [entry.permit.id, hot.permit.id],
        minutes: overlapMinutes(entry.startMs, entry.endMs, hot.startMs, hot.endMs),
        detail: `A confined-space entry is live in ${entry.permit.areaRef} while a hot-work permit is live there.`,
      }));
    }
  }

  /* 5. One isolation claimed by two live permits. */
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const a = rows[i];
      const b = rows[j];
      if (a.closedMs !== null || b.closedMs !== null) continue;
      for (const isoA of a.isolationRows) {
        if (isoA.restored) continue;
        const match = b.isolationRows.find((isoB) => !isoB.restored
          && isoB.isolation.pointRef.toLowerCase() === isoA.isolation.pointRef.toLowerCase()
          && isoB.isolation.lockRef.toLowerCase() === isoA.isolation.lockRef.toLowerCase());
        if (!match) continue;
        conflicts.push(makeConflict('isolation-double-claimed', {
          areaRef: a.permit.areaRef,
          pointRef: isoA.isolation.pointRef,
          permitIds: [a.permit.id, b.permit.id],
          minutes: overlapMinutes(a.startMs, a.endMs, b.startMs, b.endMs),
          detail: `Two live permits both depend on the isolation on ${isoA.isolation.pointRef} (lock ${isoA.isolation.lockRef}). Restoring it to finish one job unprotects the other.`,
        }));
      }
    }
  }

  /* 6. One holder on two live permits over the same window. */
  const liveRows = rows.filter((row) => row.closedMs === null && row.state.key.startsWith('live'));
  for (let i = 0; i < liveRows.length; i += 1) {
    for (let j = i + 1; j < liveRows.length; j += 1) {
      const a = liveRows[i];
      const b = liveRows[j];
      if (a.permit.holderId !== b.permit.holderId) continue;
      if (!overlaps(a, b)) continue;
      conflicts.push(makeConflict('holder-double-booked', {
        areaRef: a.permit.areaRef,
        permitIds: [a.permit.id, b.permit.id],
        minutes: overlapMinutes(a.startMs, a.endMs, b.startMs, b.endMs),
        detail: 'The same person holds two live permits over the same window in this workspace.',
      }));
    }
  }

  /* 7–12. Per-permit conditions that are conflicts in their own right. */
  for (const row of rows) {
    if (row.state.key === 'expired-open') {
      conflicts.push(makeConflict('permit-lapsed-open', {
        areaRef: row.permit.areaRef,
        permitIds: [row.permit.id],
        minutes: row.lateMinutes,
        detail: `${row.permit.workRef} ran past its declared validity with no closure on the record.`,
      }));
    }
    if (row.overdueIsolationN) {
      conflicts.push(makeConflict('isolation-verification-overdue', {
        areaRef: row.permit.areaRef,
        permitIds: [row.permit.id],
        minutes: row.isolationRows.filter((iso) => iso.proof.overdue).reduce((sum, iso) => sum + (iso.proof.minutesOverWindow || 0), 0),
        detail: `${row.overdueIsolationN} isolation(s) on ${row.permit.workRef} missed the permit's own verification window with no proof of zero energy.`,
      }));
    }
    if (row.atmosphereOutOfLimitN || row.atmosphereMissingN) {
      conflicts.push(makeConflict('atmosphere-out-of-limit', {
        areaRef: row.permit.areaRef,
        permitIds: [row.permit.id],
        minutes: null,
        detail: row.atmosphereOutOfLimitN
          ? `${row.atmosphereOutOfLimitN} declared test(s) on ${row.permit.workRef} have a latest reading outside the permit's own limit.`
          : `${row.atmosphereMissingN} declared test(s) on ${row.permit.workRef} have never been recorded.`,
      }));
    }
    if (row.atmosphereStaleN) {
      const worst = row.readings
        .filter((reading) => reading.freshness?.stale === true)
        .reduce((max, reading) => Math.max(max, reading.freshness.minutesOver || 0), 0);
      conflicts.push(makeConflict('atmosphere-stale', {
        areaRef: row.permit.areaRef,
        permitIds: [row.permit.id],
        minutes: worst,
        detail: `${row.atmosphereStaleN} reading(s) on ${row.permit.workRef} are older than the freshness window the permit declared, by up to ${worst} whole minute(s).`,
      }));
    }
    if (row.noFireWatch) {
      conflicts.push(makeConflict('hot-work-without-fire-watch', {
        areaRef: row.permit.areaRef,
        permitIds: [row.permit.id],
        minutes: null,
        detail: `${row.permit.workRef} is an ignition permit with no named fire watch on the record.`,
      }));
    }
    if (row.state.key === 'closed-isolation-owed') {
      conflicts.push(makeConflict('closure-isolation-owed', {
        areaRef: row.permit.areaRef,
        permitIds: [row.permit.id],
        minutes: null,
        detail: `${row.permit.workRef} was closed while an isolation it applied was never removed and confirmed.`,
      }));
    }
    if (row.permit.energyControl && row.requiredIsolationN === 0 && row.closedMs === null) {
      conflicts.push(makeConflict('isolation-verification-overdue', {
        areaRef: row.permit.areaRef,
        permitIds: [row.permit.id],
        minutes: null,
        detail: `${row.permit.workRef} is energy-control work with no isolation on the record at all, so there is nothing proving the plant is at zero energy.`,
      }));
    }
    if (row.orphan) {
      conflicts.push(makeConflict('orphan-holder', {
        areaRef: row.permit.areaRef,
        permitIds: [row.permit.id],
        minutes: null,
        detail: 'The holder of this permit is not on the active reporting graph, so no authorising hand above them can be resolved.',
      }));
    }
  }

  // Deterministic order: highest severity first, then kind, then the permits joined.
  conflicts.sort((a, b) => b.severity - a.severity
    || String(a.kind).localeCompare(String(b.kind))
    || String(a.permitIds.join('|')).localeCompare(String(b.permitIds.join('|')))
    || String(a.pointRef || '').localeCompare(String(b.pointRef || '')));
  return conflicts;
}

/**
 * The whole register, one pass.
 *
 * `seat` only narrows disclosure; with no seat the reading is the whole record,
 * exactly as every other register in this workspace behaves, so a headless export
 * and an operator screen cannot disagree about a figure.
 */
export function buildPermitToWork(state, { now = new Date(), settings = null, seat = null } = {}) {
  const warnings = [];
  const at = now instanceof Date ? now : new Date(now);
  const nowMs = at.getTime();
  const asOf = dayKey(at) || at.toISOString().slice(0, 10);
  const cfg = { ...(state?.settings || {}), ...(settings || {}) };
  const conventions = normalizePtwSettings(cfg);

  const permits = normalizePtwPermits(state?.ptwPermits, warnings);
  const isolations = normalizePtwIsolations(state?.ptwIsolations, permits, warnings);
  const atmosphere = normalizePtwAtmosphere(state?.ptwAtmosphere, permits, warnings);
  const handovers = normalizePtwHandovers(state?.ptwHandovers, permits, warnings);
  const suspensions = normalizePtwSuspensions(state?.ptwSuspensions, permits, warnings);
  const closures = normalizePtwClosures(state?.ptwClosures, permits, warnings);
  const markers = normalizePtwMarkers(state?.ptwMarkers, warnings);

  let matrix = null;
  let matrixError = null;
  try {
    matrix = buildMatrix(state, { now: at, settings: { ...cfg, activeSeatId: null } });
  } catch (error) {
    matrixError = `The reporting graph could not be read, so no line can be resolved and no joint seat can be asked: ${error?.message || 'unknown error'}.`;
  }
  const matrixNodeIds = new Set([...(matrix?.nodes?.keys?.() || []), ...(matrix?.roster?.keys?.() || []), LEADER_ID]);

  const closureByPermit = new Map(closures.map((row) => [row.permitId, row]));
  const suspensionsByPermit = new Map();
  for (const row of suspensions) {
    const held = suspensionsByPermit.get(row.permitId) || [];
    held.push(row);
    suspensionsByPermit.set(row.permitId, held);
  }
  const handoversByPermit = new Map();
  for (const row of handovers) {
    const held = handoversByPermit.get(row.permitId) || [];
    held.push(row);
    handoversByPermit.set(row.permitId, held);
  }

  /* ------------------------------------------------------------------ rows */

  const rows = [];
  let orphanN = 0;
  for (const permit of permits) {
    const orphan = !matrixNodeIds.has(permit.holderId);
    if (orphan) orphanN += 1;
    const lines = orphan ? [] : ptwActiveLinesFor(matrix, permit.holderId);
    const apex = lines.length ? matrixJointApex(matrix, lines.map((line) => line.managerId)) : null;
    const derived = derivePtwState({
      permit,
      isolations: isolationsFor(isolations, permit.id),
      atmosphere: atmosphere.filter((row) => row.permitId === permit.id),
      handovers: handoversByPermit.get(permit.id) || [],
      suspensions: suspensionsByPermit.get(permit.id) || [],
      closure: closureByPermit.get(permit.id) || null,
      nowMs,
    });
    const issuingLineActive = !orphan && lines.some((line) => line.managerId === permit.lineManagerId);
    rows.push({
      permit,
      personName: orphan ? null : ptwPersonLabel(matrix, permit.holderId),
      issuerName: ptwPersonLabel(matrix, permit.issuerId),
      fireWatchName: permit.fireWatchId ? ptwPersonLabel(matrix, permit.fireWatchId) : null,
      crewNames: permit.crewIds.map((personId) => ptwPersonLabel(matrix, personId)),
      orphan,
      lines: lines.map((line) => ({
        ...line,
        name: ptwPersonLabel(matrix, line.managerId),
        isIssuing: line.managerId === permit.lineManagerId,
      })),
      issuingLineName: ptwPersonLabel(matrix, permit.lineManagerId),
      issuingLineIsActive: issuingLineActive,
      /** The issuing line no longer holds the holder: the authorising hand moved. */
      issuingLineGone: !orphan && !issuingLineActive,
      apex,
      ...derived,
    });
  }
  rows.sort((a, b) => {
    // Open work first, worst state first, then the soonest end, then by id.
    const openA = a.closedMs === null ? 0 : 1;
    const openB = b.closedMs === null ? 0 : 1;
    if (openA !== openB) return openA - openB;
    const badA = a.state.tone === 'bad' ? 0 : a.state.tone === 'warn' ? 1 : 2;
    const badB = b.state.tone === 'bad' ? 0 : b.state.tone === 'warn' ? 1 : 2;
    if (badA !== badB) return badA - badB;
    const endA = Number.isFinite(a.endMs) ? a.endMs : Number.MAX_SAFE_INTEGER;
    const endB = Number.isFinite(b.endMs) ? b.endMs : Number.MAX_SAFE_INTEGER;
    if (endA !== endB) return endA - endB;
    return minutesBetweenOrdinal(a.permit.id, b.permit.id);
  });

  /* ---------------------------------------------------------------- states */

  const states = Object.fromEntries(PTW_STATE_KEYS.map((key) => [key, 0]));
  for (const row of rows) states[row.state.key] = (states[row.state.key] || 0) + 1;

  const openRows = rows.filter((row) => row.closedMs === null);
  const closedRows = rows.filter((row) => row.closedMs !== null);
  const conflicts = derivePtwConflicts(rows);
  const liveConflicts = conflicts.filter((conflict) => conflict.permitIds.some((permitId) => {
    const row = rows.find((candidate) => candidate.permit.id === permitId);
    return row && row.closedMs === null;
  }));

  const people = new Set(rows.map((row) => row.permit.holderId));
  const expiringSoonN = rows.filter((row) => row.closedMs === null && Number.isInteger(row.remainingMinutes) && row.remainingMinutes > 0 && row.remainingMinutes <= 120).length;

  /**
   * TWO CLAIMS, PRINTED APART (Bulletproof Reliability Mandate).
   *   `statesReconcile` — every printed state count re-adds to the permits.
   *   `isolationsReconcile` / `atmosphereReconcile` / `closuresReconcile` — every
   *     attached row points at a permit still on the record.
   * `figuresComplete` is a SEPARATE claim about provenance, and neither one is
   * folded into a state or into the other.
   */
  const stateTotal = Object.values(states).reduce((sum, n) => sum + n, 0);
  const permitIds = new Set(permits.map((row) => row.id));
  const balances = {
    statesReconcile: stateTotal === permits.length,
    isolationsReconcile: isolations.every((row) => permitIds.has(row.permitId)),
    atmosphereReconcile: atmosphere.every((row) => permitIds.has(row.permitId)),
    handoversReconcile: handovers.every((row) => permitIds.has(row.permitId)),
    suspensionsReconcile: suspensions.every((row) => permitIds.has(row.permitId)),
    closuresReconcile: closures.every((row) => permitIds.has(row.permitId)),
  };

  const incompleteReasons = [];
  if (warnings.length) incompleteReasons.push(`${warnings.length} stored row(s) were unreadable or carried a flagged condition; nothing was repaired.`);
  if (orphanN) incompleteReasons.push(`${orphanN} permit(s) name a holder who is not on the active reporting graph; no authorising line can be resolved above them.`);
  if (matrixError) incompleteReasons.push(matrixError);
  if (!balances.statesReconcile) incompleteReasons.push('The printed state counts do not re-add to the permits they summarise.');
  for (const key of ['isolationsReconcile', 'atmosphereReconcile', 'handoversReconcile', 'suspensionsReconcile', 'closuresReconcile']) {
    if (!balances[key]) incompleteReasons.push(`${key.replace(/Reconcile$/, '')} row(s) are attached to a permit that is not on the record.`);
  }
  if (permits.length && rows.every((row) => row.state.key === 'not-yet-valid')) {
    incompleteReasons.push('Every permit on this record is declared for a future window, so no live condition has yet been proved.');
  }

  /* ---------------------------------------------------------- line roll-up */

  const byLine = new Map();
  for (const row of rows) {
    for (const line of row.lines) {
      const entry = byLine.get(line.managerId) || {
        managerId: line.managerId,
        managerName: line.name,
        permitsN: 0,
        liveN: 0,
        unverifiedN: 0,
        expiredN: 0,
        conflictsN: 0,
        holders: new Set(),
        issuingN: 0,
      };
      entry.permitsN += 1;
      if (row.state.key.startsWith('live')) entry.liveN += 1;
      if (row.state.key === 'live-unverified') entry.unverifiedN += 1;
      if (row.state.key === 'expired-open') entry.expiredN += 1;
      if (line.isIssuing) entry.issuingN += 1;
      entry.holders.add(row.permit.holderId);
      byLine.set(line.managerId, entry);
    }
  }
  for (const entry of byLine.values()) {
    entry.conflictsN = conflicts.filter((conflict) => conflict.permitIds.some((permitId) => {
      const row = rows.find((candidate) => candidate.permit.id === permitId);
      return row && row.lines.some((line) => line.managerId === entry.managerId);
    })).length;
  }
  const lineRows = [...byLine.values()]
    .map((entry) => ({ ...entry, holdersN: entry.holders.size, holders: [...entry.holders].sort() }))
    .sort((a, b) => String(a.managerName).localeCompare(String(b.managerName)) || String(a.managerId).localeCompare(String(b.managerId)));

  /* ------------------------------------------------------------ disclosure */

  const detailed = !seat || seat.fullAccess || (Number.isInteger(seat.rank) ? seat.rank <= 3 : true);
  const disclosure = detailed
    ? { level: 'detail', reason: null, rank: seat?.rank ?? null }
    : {
      level: 'aggregate',
      reason: 'Permit-level rows are withheld above rank 3; this reading prints counts, exact minutes and conflict kinds. Which named crew is inside which space at this minute is operational safety material, not executive reading — but every conflict is still counted, so nothing dangerous is hidden by the ceiling.',
      rank: seat?.rank ?? null,
    };

  const visibleRows = detailed ? rows : [];
  const visibleConflicts = detailed
    ? conflicts
    : conflicts.map((conflict) => ({
      ...conflict,
      detail: `A ${conflict.label.toLowerCase()} conflict is on the record. Its permits, area and exact arithmetic are withheld at this altitude; the count and the kind are not.`,
      areaRef: null,
      pointRef: null,
    }));

  return {
    ok: true,
    engineVersion: PTW_ENGINE_VERSION,
    matrix,
    asOf,
    nowIso: at.toISOString(),
    conventions,
    permits,
    isolations,
    atmosphere,
    handovers,
    suspensions,
    closures,
    markers,
    rows: visibleRows,
    allRows: rows,
    openRows: detailed ? openRows : [],
    closedRows: detailed ? closedRows : [],
    conflicts: visibleConflicts,
    detailed: Boolean(detailed),
    disclosure,
    warnings,
    matrixError,
    orphanN,
    states,
    stateTotal,
    balances,
    figuresComplete: incompleteReasons.length === 0,
    incompleteReasons,
    totals: {
      permits: permits.length,
      open: openRows.length,
      closed: closedRows.length,
      people: people.size,
      workKindsN: new Set(permits.map((row) => row.workKind)).size,
      isolations: isolations.length,
      isolationsUnverifiedN: rows.reduce((sum, row) => sum + row.unverifiedIsolationN, 0),
      isolationsOverdueN: rows.reduce((sum, row) => sum + row.overdueIsolationN, 0),
      isolationsUnconfirmedRemovalN: rows.reduce((sum, row) => sum + row.unconfirmedRemovalN, 0),
      atmosphereTests: atmosphere.length,
      liveN: states.live || 0,
      liveUnverifiedN: states['live-unverified'] || 0,
      liveAtmosphereN: states['live-atmosphere'] || 0,
      liveAtmosphereStaleN: states['live-atmosphere-stale'] || 0,
      suspendedN: states.suspended || 0,
      notYetValidN: states['not-yet-valid'] || 0,
      expiredOpenN: states['expired-open'] || 0,
      expiredMinutes: rows.reduce((sum, row) => sum + (row.state.key === 'expired-open' && Number.isInteger(row.lateMinutes) ? row.lateMinutes : 0), 0),
      closedCompleteN: states['closed-complete'] || 0,
      closedIsolationOwedN: states['closed-isolation-owed'] || 0,
      handovers: handovers.length,
      entries: rows.filter((row) => row.closedMs === null && row.state.key.startsWith('live') && row.permit.atmosphereRequired).length,
      conflicts: conflicts.length,
      conflictsLive: liveConflicts.length,
      conflictKindsN: new Set(conflicts.map((conflict) => conflict.kind)).size,
      expiringSoonN,
      selfIssuedN: rows.filter((row) => row.permit.selfIssued).length,
      noFireWatchN: rows.filter((row) => row.permit.noFireWatch).length,
      linesN: lineRows.length,
    },
    lineRows,
    stateRows: PTW_STATE_KEYS.map((key) => ({ key, label: PTW_STATE_BY_KEY[key].label, tone: PTW_STATE_BY_KEY[key].tone, count: states[key] || 0 })),
    conflictKindRows: PTW_CONFLICT_KINDS.map((row) => ({
      key: row.key,
      label: row.label,
      severity: row.severity,
      count: conflicts.filter((conflict) => conflict.kind === row.key).length,
    })),
    /**
     * THE BADGE COUNT, AND WHY IT IS NOT `states + conflicts`. A permit in a bad
     * state usually produces a conflict that DESCRIBES that same state, so adding
     * the two would count one danger twice and inflate the number a leader is asked
     * to act on. The badge counts each DANGER once: the permit states that are
     * dangerous, plus the conflicts that are NOT the per-permit expression of those
     * states — the simultaneous-operations findings, which no single state can carry.
     */
    attention: (() => {
      const dangerousStates = ['live-unverified', 'live-atmosphere', 'expired-open'];
      const stateTotalBad = dangerousStates.reduce((sum, key) => sum + (states[key] || 0), 0);
      const perPermitKinds = new Set([
        'permit-lapsed-open',
        'isolation-verification-overdue',
        'atmosphere-out-of-limit',
        'atmosphere-stale',
        'closure-isolation-owed',
        'hot-work-without-fire-watch',
        'orphan-holder',
      ]);
      const simultaneous = new Set(conflicts
        .filter((conflict) => !perPermitKinds.has(conflict.kind))
        .map((conflict) => `${conflict.kind}::${conflict.permitIds.slice().sort().join('|')}`));
      const liveUnverifiedN = states['live-unverified'] || 0;
      const liveAtmosphereN = states['live-atmosphere'] || 0;
      const expiredOpenN = states['expired-open'] || 0;
      return {
        liveUnverifiedN,
        liveAtmosphereN,
        expiredOpenN,
        conflictsN: simultaneous.size,
        total: stateTotalBad + simultaneous.size,
      };
    })(),
    seat: seat
      ? { rank: seat.rank ?? null, fullAccess: Boolean(seat.fullAccess), label: seat.label || '' }
      : { rank: null, fullAccess: true, label: 'whole register (no seat)' },
  };
}

/**
 * The navigation badge count. Counts DECISION-SHAPED danger — a live permit with an
 * unproved isolation, a live permit whose atmosphere is outside its own limits, a
 * lapsed permit nobody closed, and every simultaneous-operations conflict — and
 * never every open permit, so the badge reads as "danger owed now" rather than
 * "permits in use".
 */
export function permitToWorkAttentionCount(state, { now = new Date(), settings = null, seat = null } = {}) {
  try {
    const report = buildPermitToWork(state, { now, settings, seat });
    if (!report?.ok) return 0;
    return report.attention.total;
  } catch {
    return 0;
  }
}

/**
 * Insights signals. Each is a fact worth a leader's attention with the printed
 * evidence and a route — and none of them a score on a person.
 */
export function permitToWorkSignals(state, now = new Date(), settings = null) {
  let report;
  try {
    report = buildPermitToWork(state, { now, settings, seat: null });
  } catch {
    return [];
  }
  if (!report?.ok) return [];
  const signals = [];
  const add = (signal) => signals.push({ domain: 'Permit to work', route: '#/permit-to-work', ...signal });

  const danger = report.totals.liveUnverifiedN + report.totals.liveAtmosphereN;
  if (danger) {
    add({
      ruleId: 'PTW-01',
      severity: 5,
      confidence: 'high',
      title: `${danger} live permit(s) without a proved safe state`,
      detail: `${report.totals.liveUnverifiedN} permit(s) are inside their validity with at least one isolation that was never proved at zero energy inside the permit's own window, and ${report.totals.liveAtmosphereN} are live with an atmosphere outside the limits the permit's own issuer declared — including declared tests that were never recorded. Work may be under way on plant whose safe state the record cannot show.`,
      action: { label: 'Open the permit register', route: '#/permit-to-work' },
      evidence: [
        `${report.totals.isolations} isolation(s) on the record`,
        `${report.totals.isolationsOverdueN} past the permit's own verification window`,
        `${report.totals.atmosphereTests} gas test(s) recorded`,
      ],
    });
  }

  if (report.totals.expiredOpenN) {
    add({
      ruleId: 'PTW-02',
      severity: 5,
      confidence: 'high',
      title: `${report.totals.expiredOpenN} permit(s) lapsed and never closed`,
      detail: `The declared validity ended and nobody recorded a closure, ${report.totals.expiredMinutes} whole minute(s) past their ends in total. The paperwork and the plant have stopped agreeing, which is the state a permit system exists to prevent.`,
      action: { label: 'See the lapsed permits', route: '#/permit-to-work?view=permits' },
      evidence: [`${report.totals.open} permit(s) open`, `${report.totals.closed} closed`],
    });
  }

  const worst = report.conflicts.filter((conflict) => conflict.severity >= 4);
  if (worst.length) {
    add({
      ruleId: 'PTW-03',
      severity: 5,
      confidence: 'high',
      title: `${worst.length} simultaneous-operations conflict(s) at high severity`,
      detail: `Derived from the record on every read, never from a stored flag: ${[...new Set(worst.map((conflict) => conflict.label))].join('; ')}. Each conflict carries the exact overlap or overdue minutes that prove it.`,
      action: { label: 'See the conflicts', route: '#/permit-to-work?view=conflicts' },
      evidence: [
        `${report.totals.conflicts} conflict(s) in total`,
        `${report.totals.conflictsLive} join a permit that is still open`,
      ],
    });
  }

  if (report.totals.closedIsolationOwedN) {
    add({
      ruleId: 'PTW-04',
      severity: 4,
      confidence: 'high',
      title: `${report.totals.closedIsolationOwedN} permit(s) closed with an isolation outstanding`,
      detail: 'The permit was closed while an isolation it applied was never removed and confirmed. The plant may be isolated with nobody aware of it, and the closure is kept and printed rather than repaired — erasing it would erase the only record of the plant’s state.',
      action: { label: 'Open the closed permits', route: '#/permit-to-work?view=permits' },
      evidence: [`${report.totals.isolationsUnconfirmedRemovalN} removal(s) never confirmed`],
    });
  }

  return signals;
}
