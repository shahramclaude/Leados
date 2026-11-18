/**
 * app/core/domain/asg.js — the ONE reader of the Secondment / Assignment
 * Return & Handover Register (ADR-0262, Schema v214, `#/secondment`).
 *
 * Every state, day count, timeliness verdict, coverage gap and handback
 * completeness this module prints is derived here, on read, from stored
 * declarations and the injected clock. Nothing derived is stored anywhere, so
 * the same workspace read twice gives the same answer and a hand-edited file
 * cannot carry an assignment marked "returned" whose ledger holds no handback.
 *
 * THE ONE QUESTION THIS READER ANSWERS PER ASSIGNMENT: *where is this person's
 * move in its own lifecycle, and does the record support the answer?* The
 * answer is one of NINE states, and each is a DIFFERENT fact (see
 * `ASG_STATE_BY_KEY`): planned, return-decision-overdue, decision-due, active,
 * handback-open, returned, transfer-consent-owed, transfer-handback-open,
 * transferred.
 *
 * WHY THE STATE IS DERIVED AND NOT STORED. A state is the product of the
 * declared window, the act ledger and today. Storing the product would let it
 * disagree with its own inputs; the reader recomputes it on every read. A
 * return day passed with no decision is exactly as visible as a decision that
 * was made — silence is a state, never a default.
 *
 * WHY THE OVERDUE PRINT NEVER CONVERTS. The register is fail-secure on the
 * calendar: an overdue return day changes nothing except what is PRINTED. The
 * assignment is neither ended, nor extended, nor converted by the passage of
 * time. `returnDayInForce` moves only through a recorded `extend` act.
 *
 * MATRIX CORRECTNESS (ADR-0140/0141). The assignment names two sides — the
 * home manager and the host manager. The reader resolves EVERY active line
 * holding the person through the ONE matrix engine, counts the person ONCE,
 * and derives the joint apex over every hand that answers for the move: the
 * two named sides and every active line's manager. Where a named hand is off
 * the graph the row is printed as an orphan rather than dropped, because
 * deleting it would erase a live secondment duty from the record. Where a
 * named side no longer holds an active line for the person, the row prints
 * `side-line-mismatch` — the declaration and the live graph disagree, and the
 * register never silently repoints a declaration at a manager nobody named.
 */

import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import {
  ASG_COVER_BY_KEY,
  ASG_DECISION_BY_KEY,
  ASG_SETTING_KEYS,
  ASG_STATE_BY_KEY,
} from './asgRegistry.js';
import {
  normalizeAsgActs,
  normalizeAsgAssignments,
  normalizeAsgCovers,
  normalizeAsgMarkers,
  normalizeAsgSettings,
} from './asgSchema.js';
import {
  consentAct,
  currentCovers,
  daysBetweenDays,
  handbackSides,
  returnDayLedger,
} from './asgMath.js';

const list = (value) => (Array.isArray(value) ? value : []);

export function asgPersonLabel(matrix, personId) {
  if (personId === LEADER_ID) return 'Workspace leader';
  const node = matrix?.nodes?.get(personId);
  if (node?.name) return node.name;
  const person = matrix?.roster?.get(personId);
  return person?.name || personId;
}

export function asgActiveLinesFor(matrix, personId) {
  const lines = matrix?.linesByPerson?.get(personId) || [];
  return lines
    .filter((line) => line && line.active !== false && line.managerId && line.managerId !== personId)
    .map((line) => ({
      lineId: line.id || null,
      managerId: line.managerId,
      kind: line.kind || null,
    }))
    .sort((a, b) => String(a.managerId).localeCompare(String(b.managerId)));
}

function handOnRoster(matrix, handId) {
  if (!handId) return false;
  return Boolean(matrix?.roster?.has(handId) || matrix?.nodes?.has(handId));
}

/**
 * THE ASSIGNMENT KERNEL. Pure over (assignment, covers, acts, matrix,
 * todayDay, conventions), exported so the suite can pin every branch without a
 * store and so the rule and the screen cannot disagree about a state.
 */
export function deriveAssignment({
  assignment = null,
  covers = [],
  acts = [],
  matrix = null,
  todayDay = null,
  conventions = null,
} = {}) {
  const conv = conventions || normalizeAsgSettings({});
  const today = todayDay || dayKey(new Date());
  if (!assignment) return null;
  const assignmentActs = list(acts).filter((a) => a && a.assignmentId === assignment.assignmentId);
  const decisions = assignmentActs.filter((a) => a.kind === 'return-decision');
  const ledger = returnDayLedger(assignment, decisions);
  const handbacks = handbackSides(assignmentActs);
  const consent = consentAct(assignmentActs);
  const coversFor = list(covers).filter((c) => c && c.assignmentId === assignment.assignmentId);
  const current = currentCovers(coversFor);
  const coverageRows = [...current.entries()].map(([dutyLabel, cover]) => ({
    dutyLabel,
    coverKind: cover.coverKind,
    coverKindLabel: ASG_COVER_BY_KEY[cover.coverKind]?.label || cover.coverKind,
    coverHandId: cover.coverHandId,
    coverHandName: cover.coverHandId ? asgPersonLabel(matrix, cover.coverHandId) : null,
    coverHandOrphan: Boolean(cover.coverHandId && !handOnRoster(matrix, cover.coverHandId)),
    declaredDay: cover.declaredDay,
    history: coversFor.filter((c) => c.dutyLabel === dutyLabel).length - 1,
  })).sort((a, b) => String(a.dutyLabel).localeCompare(String(b.dutyLabel)));

  const finalDecision = ledger.timed.find((d) => d.decisionKind !== 'extend') || null;
  const latestTimed = ledger.timed.length > 0 ? ledger.timed[ledger.timed.length - 1] : null;

  // ---- state derivation: nine different facts, never one reassuring word.
  let state = 'active';
  let stateDetail = ASG_STATE_BY_KEY.active.detail;
  let overdueDays = 0;
  let daysToReturn = null;
  if (!finalDecision) {
    if (today < assignment.startDay) {
      state = 'planned';
      stateDetail = ASG_STATE_BY_KEY.planned.detail;
      daysToReturn = daysBetweenDays(today, ledger.returnDayInForce);
    } else if (today > ledger.returnDayInForce) {
      state = 'return-decision-overdue';
      stateDetail = ASG_STATE_BY_KEY['return-decision-overdue'].detail;
      overdueDays = daysBetweenDays(ledger.returnDayInForce, today) || 0;
    } else {
      daysToReturn = daysBetweenDays(today, ledger.returnDayInForce);
      if (daysToReturn !== null && daysToReturn <= conv[ASG_SETTING_KEYS.warnHorizonDays]) {
        state = 'decision-due';
        stateDetail = ASG_STATE_BY_KEY['decision-due'].detail;
      } else {
        state = 'active';
        stateDetail = ASG_STATE_BY_KEY.active.detail;
      }
    }
  } else if (finalDecision.decisionKind === 'return') {
    if (handbacks.complete) {
      state = 'returned';
      stateDetail = ASG_STATE_BY_KEY.returned.detail;
    } else {
      state = 'handback-open';
      stateDetail = ASG_STATE_BY_KEY['handback-open'].detail;
    }
  } else {
    if (!consent) {
      state = 'transfer-consent-owed';
      stateDetail = ASG_STATE_BY_KEY['transfer-consent-owed'].detail;
    } else if (handbacks.complete) {
      state = 'transferred';
      stateDetail = ASG_STATE_BY_KEY.transferred.detail;
    } else {
      state = 'transfer-handback-open';
      stateDetail = ASG_STATE_BY_KEY['transfer-handback-open'].detail;
    }
  }

  // ---- matrix resolution: every active line, one person, one joint apex.
  const lines = matrix ? asgActiveLinesFor(matrix, assignment.personId) : [];
  const lineManagerIds = lines.map((l) => l.managerId);
  const managerIds = [...new Set([assignment.homeManagerId, assignment.hostManagerId, ...lineManagerIds])]
    .filter((m) => m && m !== assignment.personId);
  let jointApex = null;
  if (matrix && managerIds.length > 0) {
    try {
      jointApex = matrixJointApex(matrix, managerIds);
    } catch {
      jointApex = null;
    }
  }
  const orphans = [];
  const handNamed = (label, handId) => {
    if (handId && !handOnRoster(matrix, handId)) orphans.push({ role: label, handId });
  };
  handNamed('person', assignment.personId);
  handNamed('home-manager', assignment.homeManagerId);
  handNamed('host-manager', assignment.hostManagerId);
  for (const row of coverageRows) handNamed('cover-hand', row.coverHandId);
  if (consent) handNamed('consent-hand', consent.consentById);
  for (const side of ['home', 'host']) {
    const act = handbacks[side];
    if (act) handNamed(`handback-${side}`, act.receivedById);
  }
  if (latestTimed) handNamed('deciding-hand', latestTimed.recordedById);

  // A named side that no longer holds an active line for the person: printed,
  // never repointed.
  const sideLineMismatch = [];
  const homeHolds = lineManagerIds.includes(assignment.homeManagerId);
  const hostHolds = lineManagerIds.includes(assignment.hostManagerId);
  if (matrix && !homeHolds) sideLineMismatch.push('home');
  if (matrix && !hostHolds) sideLineMismatch.push('host');

  const uncovered = coverageRows.filter((r) => r.coverKind === 'uncovered');
  return {
    assignment,
    personId: assignment.personId,
    personName: asgPersonLabel(matrix, assignment.personId),
    homeManagerName: asgPersonLabel(matrix, assignment.homeManagerId),
    hostManagerName: asgPersonLabel(matrix, assignment.hostManagerId),
    state,
    stateDetail,
    overdueDays,
    daysToReturn,
    startDay: assignment.startDay,
    originalReturnDay: ledger.originalReturnDay,
    returnDayInForce: ledger.returnDayInForce,
    extends: ledger.extends,
    decisions: ledger.timed,
    finalDecision,
    decidedLate: Boolean(latestTimed && latestTimed.decidedLate),
    lateDays: latestTimed ? latestTimed.lateDays : 0,
    coverageRows,
    uncoveredLabels: uncovered.map((r) => r.dutyLabel),
    handbacks,
    consent,
    lines,
    managerIds,
    jointApex,
    orphans,
    sideLineMismatch,
  };
}

export function buildAssignmentReport(state, { now = new Date(), settings = null } = {}) {
  const warnings = [];
  const assignments = normalizeAsgAssignments(state?.asgAssignments, warnings);
  const covers = normalizeAsgCovers(state?.asgCovers, assignments, warnings);
  const acts = normalizeAsgActs(state?.asgActs, assignments, warnings);
  const markers = normalizeAsgMarkers(state?.asgMarkers, warnings);
  const conv = normalizeAsgSettings(settings || state?.settings || {});
  const today = dayKey(now instanceof Date ? now : new Date(now || Date.now()));
  const matrix = buildMatrix(state, { now, settings });
  const rows = assignments
    .map((assignment) => deriveAssignment({ assignment, covers, acts, matrix, todayDay: today, conventions: conv }))
    .filter(Boolean);
  const counts = {
    total: rows.length,
    planned: 0,
    active: 0,
    decisionDue: 0,
    returnDecisionOverdue: 0,
    handbackOpen: 0,
    returned: 0,
    transferConsentOwed: 0,
    transferHandbackOpen: 0,
    transferred: 0,
  };
  const byKey = {
    planned: 'planned',
    active: 'active',
    'decision-due': 'decisionDue',
    'return-decision-overdue': 'returnDecisionOverdue',
    'handback-open': 'handbackOpen',
    returned: 'returned',
    'transfer-consent-owed': 'transferConsentOwed',
    'transfer-handback-open': 'transferHandbackOpen',
    transferred: 'transferred',
  };
  for (const row of rows) {
    counts[byKey[row.state]] += 1;
  }
  const decisions = rows.flatMap((r) => r.decisions);
  const coverageRows = rows.flatMap((r) => r.coverageRows);
  const totals = {
    ...counts,
    persons: new Set(rows.map((r) => r.personId)).size,
    decisions: decisions.length,
    extends: rows.reduce((n, r) => n + r.extends, 0),
    decidedLate: decisions.filter((d) => d.decidedLate).length,
    coverageRows: coverageRows.length,
    namedCover: coverageRows.filter((c) => c.coverKind === 'named-cover').length,
    retainedByHome: coverageRows.filter((c) => c.coverKind === 'retained-by-home').length,
    uncovered: coverageRows.filter((c) => c.coverKind === 'uncovered').length,
    handbacks: rows.reduce((n, r) => n + (r.handbacks.home ? 1 : 0) + (r.handbacks.host ? 1 : 0), 0),
    consents: rows.filter((r) => r.consent).length,
    unresolvedHands: rows.reduce((n, r) => n + (r.orphans.length > 0 ? 1 : 0), 0),
    warnings: warnings.length,
  };
  return {
    rows,
    markers,
    warnings,
    conventions: conv,
    today,
    totals,
    counts,
  };
}

export function asgAttentionCount(state, { now = new Date(), settings = null } = {}) {
  try {
    const report = buildAssignmentReport(state, { now, settings });
    let count = 0;
    for (const row of report.rows) {
      if (row.state === 'return-decision-overdue' || row.state === 'decision-due') count += 1;
      if (row.state === 'handback-open' || row.state === 'transfer-handback-open') count += 1;
      if (row.state === 'transfer-consent-owed') count += 1;
      count += row.uncoveredLabels.length;
    }
    return count;
  } catch {
    return 0;
  }
}

export function asgSignals(state, { now = new Date(), settings = null } = {}) {
  try {
    const report = buildAssignmentReport(state, { now, settings });
    const signals = [];
    for (const row of report.rows) {
      if (row.state === 'return-decision-overdue') {
        signals.push({ kind: 'return-decision-overdue', assignmentId: row.assignment.assignmentId });
      }
    }
    return signals;
  } catch {
    return [];
  }
}
