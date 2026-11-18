/**
 * app/core/domain/asgRules.js — `RULE-ASG-01` on the shared post-commit spine
 * (ADR-0262, Schema v214, `#/secondment`).
 *
 * FIVE conditions, each filed at most once per (deterministic `asg1:…`
 * signature, addressee) and bounded at 4 per commit with the remainder
 * counted: `return-decision-due` where the return day in force is inside the
 * warn horizon with no decision answering it; `return-decision-overdue` where
 * that day has passed unanswered; `duty-cover-uncovered` where a declared duty
 * is neither covered by a named hand nor retained by the home line;
 * `handback-incomplete` where a decided return or conversion has no handback
 * evidence from both lines past the handback horizon; and
 * `transfer-consent-owed` where a decided conversion has no home-line consent
 * and the move is due or past due.
 *
 * Every ask goes to the LOWEST JOINT APEX above every hand that answers for
 * the move — the two named sides and every active line currently holding the
 * person — never to one line on another's behalf. An assignment whose hands
 * are all off the graph, an unresolvable or ambiguous apex or a disconnected
 * reporting graph writes ONE identity-free `asgMarkers` observation per
 * condition and substitutes nobody. The ask text is deliberately opaque — a
 * secondment schedule names people, managers and duties, so no title carries
 * an assignment reference, a person, a manager or a duty label — because a
 * delegation is readable above the addressee; the opaque signature lives only
 * in the typed `issues-obligation` link. Asks carry typed `issues-obligation`
 * provenance and close themselves when the condition clears or the addressee
 * moves. It never records an assignment or any act, moves a return day, ends
 * an assignment, transfers a person, or names a person or line as a cause;
 * pause-governed on every path (`asgAutoPropagate`), including the explicit
 * scan.
 */

import { dayKey } from '../time.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import { buildAssignmentReport } from './asg.js';
import { daysBetweenDays } from './asgMath.js';
import { ASG_CONDITION_BY_KEY, ASG_PAUSE_SWITCH, ASG_RULE_ID, ASG_SETTING_KEYS } from './asgRegistry.js';

const list = (value) => (Array.isArray(value) ? value : []);

export function asgConditions(report, { now = new Date() } = {}) {
  const conditions = [];
  const today = dayKey(now instanceof Date ? now : new Date(now || Date.now()));
  const horizon = report?.conventions?.[ASG_SETTING_KEYS.handbackHorizonDays] || 14;
  for (const row of list(report?.rows)) {
    const assignmentId = row.assignment?.assignmentId;
    if (!assignmentId) continue;
    const sideManagers = [row.assignment.homeManagerId, row.assignment.hostManagerId];
    const managerIds = row.managerIds || sideManagers;
    if (row.state === 'decision-due') {
      conditions.push({
        kind: 'return-decision-due',
        assignmentId,
        signature: `asg1:return-decision-due:${assignmentId}`,
        managerIds,
        holders: sideManagers,
      });
    }
    if (row.state === 'return-decision-overdue') {
      conditions.push({
        kind: 'return-decision-overdue',
        assignmentId,
        signature: `asg1:return-decision-overdue:${assignmentId}`,
        managerIds,
        holders: sideManagers,
      });
    }
    // Coverage: one condition per CURRENT uncovered duty while the person is
    // still away. A terminal assignment (returned / transferred) is not asked.
    const terminal = row.state === 'returned' || row.state === 'transferred';
    if (!terminal) {
      for (const dutyLabel of row.uncoveredLabels || []) {
        conditions.push({
          kind: 'duty-cover-uncovered',
          assignmentId,
          dutyLabel,
          signature: `asg1:duty-cover-uncovered:${assignmentId}:${dutyLabel}`,
          managerIds,
          holders: sideManagers,
        });
      }
    }
    // Handback: due once the handback horizon has run past the return day in
    // force and at least one side's evidence is missing.
    if ((row.state === 'handback-open' || row.state === 'transfer-handback-open')
      && daysBetweenDays(row.returnDayInForce, today) > horizon) {
      conditions.push({
        kind: 'handback-incomplete',
        assignmentId,
        signature: `asg1:handback-incomplete:${assignmentId}`,
        managerIds,
        holders: sideManagers,
      });
    }
    // Consent: owed once the move is due or past due and the home line has not
    // consented on the record.
    if (row.state === 'transfer-consent-owed' && today >= row.returnDayInForce) {
      conditions.push({
        kind: 'transfer-consent-owed',
        assignmentId,
        signature: `asg1:transfer-consent-owed:${assignmentId}`,
        managerIds,
        holders: sideManagers,
      });
    }
  }
  return conditions;
}

export function indexAsgAsks(state) {
  const links = list(state?.links);
  const bySignature = new Map();
  for (const link of links) {
    if (!link || link.kind !== 'issues-obligation') continue;
    const sig = link.signature || link.meta?.signature;
    if (sig && sig.startsWith('asg1:')) {
      if (!bySignature.has(sig)) bySignature.set(sig, []);
      bySignature.get(sig).push(link);
    }
  }
  return bySignature;
}

export function asgRule(state, { now = new Date(), settings = null, commit = null, scan = false } = {}) {
  const conv = settings || state?.settings || {};
  const paused = conv[ASG_PAUSE_SWITCH] === false && !scan;
  if (paused) return { filed: 0, deferred: 0, markers: 0, paused: true };
  const report = buildAssignmentReport(state, { now, settings: conv });
  const conditions = asgConditions(report, { now });
  const existing = indexAsgAsks(state);
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
    // Resolve the joint apex over the two named sides and every active line
    // holding the person.
    const nodeIds = [...new Set([...(condition.holders || []), ...(condition.managerIds || [])])].filter(Boolean);
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
      if (commit) {
        const markerId = `asg-marker-${sig.replace(/[^A-Za-z0-9]/g, '-').slice(0, 80)}`;
        const markersList = Array.isArray(state.asgMarkers) ? state.asgMarkers : [];
        if (!markersList.some((m) => m.markerId === markerId)) {
          markersList.push({ markerId, condition: condition.kind, assignmentId: condition.assignmentId, at: (now instanceof Date ? now : new Date(now || Date.now())).toISOString() });
          state.asgMarkers = markersList;
          markers += 1;
        }
      }
      continue;
    }
    if (commit) {
      const label = ASG_CONDITION_BY_KEY[condition.kind]?.label || condition.kind;
      commit({
        kind: 'issues-obligation',
        signature: sig,
        from: 'secondment',
        to: apex,
        title: `Assignment register: ${label}`,
        detail: 'An assignment condition needs a human act on the record — a dated decision, a named cover, a consent or handback evidence. Nothing is ended, extended or transferred by this ask.',
        status: 'open',
        ruleId: ASG_RULE_ID,
        meta: { assignmentId: condition.assignmentId, condition: condition.kind },
      });
      filed += 1;
    }
  }
  return { filed, deferred, markers, paused: false };
}

export const asgRuleDescriptor = {
  id: ASG_RULE_ID,
  module: 'asgRules.js',
  pauseSwitch: ASG_PAUSE_SWITCH,
};
