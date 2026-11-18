/**
 * app/core/domain/calRules.js — `RULE-CAL-01` on the shared post-commit spine
 * (ADR-0261, Schema v213, `#/performance-calibration`).
 *
 * FOUR conditions, each filed at most once per (deterministic `cal1:…`
 * signature, addressee) and bounded at 4 per commit with the remainder
 * counted: `divergent-uncalibrated` where two or more lines proposed ratings
 * two or more steps apart with no calibrated rating reconciling them;
 * `overdue-session` where a session is open past the declared warn horizon;
 * `distribution-flag` where the four-fifths ratio is below 0.8; and
 * `uncalibrated-person` where a person in an open session has no calibrated
 * rating past the warn horizon.
 *
 * Every ask goes to the LOWEST JOINT APEX above every line holding a
 * responsible hand — never to one line on another's behalf. A session whose
 * hands are all off the graph, an unresolvable or ambiguous apex or a
 * disconnected reporting graph writes ONE identity-free `calMarkers`
 * observation per condition and substitutes nobody. The ask text is
 * deliberately opaque — a calibration schedule names people and ratings, so no
 * title carries a session reference, person, rating or rationale — because a
 * delegation is readable above the addressee; the opaque signature lives only
 * in the typed `issues-obligation` link. Asks carry typed
 * `issues-obligation` provenance and close themselves when the condition
 * clears or the addressee moves. It never records a session or any act,
 * declares a distribution, authors a rationale, averages two divergent
 * proposals, overwrites a proposed rating, or scores, ranks or names a person
 * as a cause; pause-governed on every path (`calAutoPropagate`), including
 * the explicit scan.
 */

import { dayKey } from '../time.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import { buildCalibration } from './cal.js';
import { CAL_CONDITION_BY_KEY, CAL_PAUSE_SWITCH, CAL_RULE_ID } from './calRegistry.js';

const list = (value) => (Array.isArray(value) ? value : []);

export function calConditions(report, { now = new Date() } = {}) {
  const conditions = [];
  const today = dayKey(now instanceof Date ? now : new Date(now || Date.now()));
  for (const sessionReport of list(report?.sessions)) {
    const session = sessionReport.session;
    if (!session) continue;
    const sessionId = session.sessionId;
    // Divergent-uncalibrated: one per person
    for (const row of list(sessionReport.rows)) {
      if (row.state === 'divergent-uncalibrated') {
        conditions.push({
          kind: 'divergent-uncalibrated',
          sessionId,
          personId: row.personId,
          signature: `cal1:divergent-uncalibrated:${sessionId}:${row.personId}`,
          managerIds: row.managerIds || [],
          holders: session.holders || [],
        });
      }
      if (row.isOverdue) {
        conditions.push({
          kind: 'overdue-session',
          sessionId,
          personId: row.personId,
          signature: `cal1:overdue-session:${sessionId}:${row.personId}`,
          managerIds: row.managerIds || [],
          holders: session.holders || [],
        });
      }
    }
    // Distribution flag: one per session
    if (sessionReport.bias && !sessionReport.bias.refused && sessionReport.bias.flagged) {
      conditions.push({
        kind: 'distribution-flag',
        sessionId,
        signature: `cal1:distribution-flag:${sessionId}`,
        managerIds: [],
        holders: session.holders || [],
      });
    }
    // Uncalibrated person: session open past warn horizon, person uncalibrated
    if (session.status === 'open') {
      for (const row of list(sessionReport.rows)) {
        if (row.state === 'uncalibrated' && row.isOverdue) {
          conditions.push({
            kind: 'uncalibrated-person',
            sessionId,
            personId: row.personId,
            signature: `cal1:uncalibrated-person:${sessionId}:${row.personId}`,
            managerIds: row.managerIds || [],
            holders: session.holders || [],
          });
        }
      }
    }
  }
  return conditions;
}

export function indexCalAsks(state) {
  const links = list(state?.links);
  const bySignature = new Map();
  for (const link of links) {
    if (!link || link.kind !== 'issues-obligation') continue;
    const sig = link.signature || link.meta?.signature;
    if (sig && sig.startsWith('cal1:')) {
      if (!bySignature.has(sig)) bySignature.set(sig, []);
      bySignature.get(sig).push(link);
    }
  }
  return bySignature;
}

export function calRule(state, { now = new Date(), settings = null, commit = null, scan = false } = {}) {
  const conv = settings || state?.settings || {};
  const paused = conv[CAL_PAUSE_SWITCH] === false && !scan;
  if (paused) return { filed: 0, deferred: 0, markers: 0, paused: true };
  const report = buildCalibration(state, { now, settings: conv });
  const conditions = calConditions(report, { now });
  const existing = indexCalAsks(state);
  const matrix = buildMatrix(state, { now, settings: conv });
  let filed = 0;
  let deferred = 0;
  let markers = 0;
  const cap = 4;
  for (const condition of conditions) {
    if (filed >= cap) { deferred += 1; continue; }
    const sig = condition.signature;
    const prior = existing.get(sig) || [];
    const open = prior.filter((l) => l.status === 'open');
    if (open.length > 0) continue;
    // Human-closed or returned asks are never re-filed
    const closed = prior.filter((l) => l.status === 'closed' || l.status === 'returned');
    if (closed.length > 0) continue;
    // Resolve joint apex over holders + manager lines
    const nodeIds = [...new Set([...(condition.holders || []), ...(condition.managerIds || [])])];
    let apex = null;
    try {
      apex = nodeIds.length > 0 ? matrixJointApex(matrix, nodeIds) : null;
    } catch {
      apex = null;
    }
    // `matrixJointApex` always returns an object; an unresolvable apex carries
    // a null `apexId`. Where nobody can be asked, write an identity-free
    // marker and substitute nobody.
    if (!apex || !apex.apexId) {
      // Identity-free marker, substitute nobody
      if (commit) {
        const markerId = `cal-marker-${sig.replace(/[^A-Za-z0-9]/g, '-').slice(0, 80)}`;
        const markersList = Array.isArray(state.calMarkers) ? state.calMarkers : [];
        if (!markersList.some((m) => m.markerId === markerId)) {
          markersList.push({ markerId, condition: condition.kind, sessionId: condition.sessionId, at: (now instanceof Date ? now : new Date(now || Date.now())).toISOString() });
          state.calMarkers = markersList;
          markers += 1;
        }
      }
      continue;
    }
    if (commit) {
      const label = CAL_CONDITION_BY_KEY[condition.kind]?.label || condition.kind;
      commit({
        kind: 'issues-obligation',
        signature: sig,
        from: 'performance-calibration',
        to: apex,
        title: `Calibration: ${label}`,
        detail: 'A calibration condition needs a human decision with written rationale. No rating is changed by this ask.',
        status: 'open',
        ruleId: CAL_RULE_ID,
        meta: { sessionId: condition.sessionId, condition: condition.kind },
      });
      filed += 1;
    }
  }
  return { filed, deferred, markers, paused: false };
}

export const calRuleDescriptor = {
  id: CAL_RULE_ID,
  module: 'calRules.js',
  pauseSwitch: CAL_PAUSE_SWITCH,
};
