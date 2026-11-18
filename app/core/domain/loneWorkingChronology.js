/** ADR-0256: audit the recorded chronology, not the person's whereabouts. */
import { instantMs } from './loneWorkingMath.js';
import { LWK_CHRONOLOGY_LABELS, LWK_LIMITS as L } from './loneWorkingRegistry.js';

export function latestLwkActMs(checkins, escalations) {
  let latest = null;
  for (const act of checkins) {
    const ms = instantMs(act.at);
    if (ms !== null && (latest === null || ms > latest)) latest = ms;
  }
  for (const act of escalations) {
    const ms = instantMs(act.raisedAt);
    if (ms !== null && (latest === null || ms > latest)) latest = ms;
  }
  return latest;
}

/** Turn a loader-valid declaration into an interval for comparison. An expected
 * end, a future close and a close contradicted by a later act never prove separation. */
export function lwkChronologyWindow(deployment, nowMs, latestActMs = null) {
  const startMs = instantMs(deployment.startAt);
  const expectedEndMs = instantMs(deployment.expectedEndAt);
  const claimedCloseMs = instantMs(deployment.closedAt);
  const closeMs = claimedCloseMs !== null && claimedCloseMs <= nowMs
    && (latestActMs === null || latestActMs <= claimedCloseMs) ? claimedCloseMs : null;
  return { startMs, expectedEndMs, claimedCloseMs, closeMs };
}

/** Compare two windows for the SAME person. Half-open millisecond intervals.
 * Without two supported close times an intersection is of recorded windows,
 * not a measured duration of simultaneous working. Empty closed spans never intersect. */
export function lwkWindowConflict(a, b) {
  if (a.closeMs === a.startMs || b.closeMs === b.startMs) return null;
  if ((a.closeMs !== null && a.closeMs <= b.startMs) || (b.closeMs !== null && b.closeMs <= a.startMs)) return null;
  const fromMs = Math.max(a.startMs, b.startMs);
  const toMs = Math.min(a.closeMs ?? a.expectedEndMs, b.closeMs ?? b.expectedEndMs);
  if (toMs <= fromMs) return { kind: 'separation-unproved', fromMs: null, toMs: null, overlapMs: null };
  return {
    kind: a.closeMs !== null && b.closeMs !== null ? 'recorded-overlap' : 'window-overlap',
    fromMs, toMs, overlapMs: toMs - fromMs,
  };
}

const iso = (ms) => (ms === null ? null : new Date(ms).toISOString());
function windowEvidence(deployment, frame) {
  return {
    id: deployment.id, siteRef: deployment.siteRef, startAt: deployment.startAt, expectedEndAt: deployment.expectedEndAt,
    recordedCloseAt: deployment.closedAt, usedRecordedClose: frame.closeMs !== null,
  };
}

/** Exact census over already-scoped rows. Work is bounded by the 600-deployment
 * ledger; count every pair but only materialize an authorized page of evidence. */
export function auditLwkChronology(rows, { nowMs, detailed, page: requestedPage, sourceIncomplete }) {
  const maxFindings = (L.deployments * (L.deployments - 1)) / 2 + 2 * L.deployments + L.checkins + L.escalations;
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= Math.ceil(maxFindings / L.rowsShown)
    ? requestedPage : 1;
  const offset = (page - 1) * L.rowsShown;
  const byPerson = new Map();
  const affected = new Set();
  const people = new Set();
  const counts = Object.fromEntries(Object.keys(LWK_CHRONOLOGY_LABELS).map((kind) => [kind, 0]));
  let findingsN = 0;
  const findings = [];

  function count(kind, row) {
    counts[kind] += 1;
    affected.add(row.deployment.personId);
    findingsN += 1;
    return detailed && findingsN > offset && findingsN <= offset + L.rowsShown;
  }

  // Rows are newest-start first with a stable ID tie break from the register.
  for (const row of rows) {
    const { deployment, checkins, escalations } = row;
    const frame = lwkChronologyWindow(deployment, nowMs, latestLwkActMs(checkins, escalations));
    const personId = deployment.personId;
    people.add(personId);
    const emitAct = (kind, event, eventAt, eventId = null) => {
      if (count(kind, row)) findings.push({ kind, personName: row.personName,
        first: windowEvidence(deployment, frame), event, eventAt, eventId });
    };
    if (frame.startMs > nowMs) emitAct('future-record', 'Start', deployment.startAt);
    if (frame.claimedCloseMs !== null && frame.claimedCloseMs > nowMs) emitAct('future-record', 'Close', deployment.closedAt);
    const inspectAct = (event, at, id) => {
      const ms = instantMs(at);
      if (frame.claimedCloseMs !== null && ms > frame.claimedCloseMs) emitAct('after-close', event, at, id);
      else if (ms > nowMs) emitAct('future-record', event, at, id);
    };
    for (const contact of checkins) inspectAct('Check-in', contact.at, contact.id);
    for (const escalation of escalations) inspectAct('Escalation', escalation.raisedAt, escalation.id);
    if (frame.startMs > nowMs) continue; // flagged above; not evidence of past occupancy

    const others = byPerson.get(personId) || [];
    for (const other of others) {
      const conflict = lwkWindowConflict(frame, other.frame);
      if (conflict && count(conflict.kind, row)) {
        findings.push({ kind: conflict.kind, personName: row.personName,
          first: windowEvidence(deployment, frame), second: windowEvidence(other.deployment, other.frame),
          overlapMs: conflict.overlapMs, from: iso(conflict.fromMs), to: iso(conflict.toMs) });
      }
    }
    others.push({ deployment, frame });
    byPerson.set(personId, others);
  }

  return {
    counts, findingsN, affectedPeopleN: affected.size, peopleN: people.size,
    deploymentsN: rows.length, sourceIncomplete, findings, page,
    pages: Math.max(1, Math.ceil(findingsN / L.rowsShown)),
    firstFinding: findings.length ? offset + 1 : null,
    lastFinding: findings.length ? offset + findings.length : null,
  };
}
