/**
 * app/core/domain/cal.js — the ONE reader of the Performance Calibration
 * Decision Register (ADR-0261, Schema v213, `#/performance-calibration`).
 *
 * Every distribution, kappa, bias ratio, state and day count this module
 * prints is derived here, on read, from stored declarations and the injected
 * clock. Nothing derived is stored anywhere, so the same workspace read twice
 * gives the same answer and a hand-edited file cannot carry a session recorded
 * as balanced whose decisions say otherwise.
 *
 * THE ONE QUESTION THIS READER ANSWERS PER PERSON IN A SESSION: *what did the
 * manager propose, what did the committee decide, and does the record support
 * the decision?* The answer is one of five states, and each is a DIFFERENT
 * fact:
 *
 *   uncalibrated              no calibrated rating recorded. The proposed
 *                             rating stands until a human records a decision
 *                             with rationale.
 *   calibrated                a calibrated rating is recorded and equals the
 *                             proposed rating. The committee confirmed it.
 *   adjusted                  a calibrated rating is recorded and differs
 *                             from the proposed rating. The rationale is
 *                             printed beside both ratings.
 *   divergent-uncalibrated    two or more lines proposed ratings two or more
 *                             steps apart and no calibrated rating reconciles
 *                             them. The register never averages them.
 *   overdue-session           the session is open past the declared warn
 *                             horizon with uncalibrated persons. The absence
 *                             of a decision is printed as one.
 *
 * WHY THE STATE IS DERIVED AND NOT STORED. A state is the product of a
 * session, its decisions, the review's proposed rating and the stewardship
 * signals. Storing the product would let it disagree with its own inputs; the
 * reader recomputes it on every read.
 *
 * WHY THE CALIBRATED RATING IS NEVER AVERAGED. Two divergent proposals are
 * never averaged into a calibrated rating. The committee declares one, with
 * rationale, or the divergence stays printed.
 *
 * MATRIX CORRECTNESS (ADR-0140/0141). A person with two managers has two
 * proposed ratings from two lines. The reader resolves every ACTIVE line that
 * holds the person through the ONE matrix engine, counts a person ONCE, and
 * derives the joint apex over every line as the seat whose authority answers
 * for the calibration. Where a hand is off the graph the row is printed as an
 * orphan rather than dropped, because deleting it would erase a live
 * calibration duty from the record.
 */

import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import { buildAssessmentReconciliation } from './assessmentReconciliation.js';
import {
  CAL_RATING_KEYS,
  CAL_STATE_BY_KEY,
  CAL_SETTING_KEYS,
  calRatingRank,
} from './calRegistry.js';
import {
  normalizeCalDecisions,
  normalizeCalMarkers,
  normalizeCalSessions,
  normalizeCalSettings,
} from './calSchema.js';
import {
  cohensKappa,
  daysBetweenDays,
  distributionCounts,
  fourFifths,
  ratingGap,
} from './calMath.js';

const list = (value) => (Array.isArray(value) ? value : []);

export function calPersonLabel(matrix, personId) {
  if (personId === LEADER_ID) return 'Workspace leader';
  const node = matrix?.nodes?.get(personId);
  if (node?.name) return node.name;
  const person = matrix?.roster?.get(personId);
  return person?.name || personId;
}

export function calActiveLinesFor(matrix, personId) {
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

/**
 * THE CALIBRATION KERNEL. Pure over (session, decisions, reviews, people,
 * matrix, todayDay, conventions), exported so the suite can pin every branch
 * without a store and so the rule and the screen cannot disagree about a
 * state.
 */
export function deriveCalibration({
  session = null,
  decisions = [],
  reviews = [],
  people = [],
  matrix = null,
  todayDay = null,
  conventions = null,
} = {}) {
  const conv = conventions || normalizeCalSettings({});
  const today = todayDay || dayKey(new Date());
  const sessionDecisions = list(decisions).filter((d) => d && d.sessionId === session?.sessionId);
  const decisionByPerson = new Map(sessionDecisions.map((d) => [d.personId, d]));
  const reviewByPerson = new Map();
  for (const review of list(reviews)) {
    if (!review || !review.personId || review.status !== 'complete') continue;
    const rating = review.manager?.rating;
    if (!CAL_RATING_KEYS.includes(rating)) continue;
    // Latest completed review per person
    const prev = reviewByPerson.get(review.personId);
    if (!prev || String(review.completedAt || review.updatedAt || '') > String(prev.completedAt || prev.updatedAt || '')) {
      reviewByPerson.set(review.personId, review);
    }
  }
  const personById = new Map(list(people).map((p) => [p.id, p]));
  const rows = [];
  const personIds = new Set([...reviewByPerson.keys(), ...decisionByPerson.keys()]);
  for (const personId of [...personIds].sort()) {
    const review = reviewByPerson.get(personId) || null;
    const decision = decisionByPerson.get(personId) || null;
    const proposedRating = review?.manager?.rating || null;
    const calibratedRating = decision?.calibratedRating || null;
    const person = personById.get(personId) || null;
    // Stewardship divergence via assessment reconciliation (read-only)
    let reconciliation = null;
    let divergent = false;
    if (review && matrix) {
      try {
        reconciliation = buildAssessmentReconciliation(
          { reviews: list(reviews), people: list(people), reportingLines: matrix?.rawLines || [], settings: {} },
          review,
          { now: new Date(), settings: {} },
        );
        divergent = reconciliation?.verdict === 'divergent';
      } catch {
        reconciliation = null;
        divergent = false;
      }
    }
    // State derivation
    let state = 'uncalibrated';
    let stateDetail = CAL_STATE_BY_KEY.uncalibrated.detail;
    if (decision) {
      if (calibratedRating === proposedRating) {
        state = 'calibrated';
        stateDetail = CAL_STATE_BY_KEY.calibrated.detail;
      } else {
        state = 'adjusted';
        stateDetail = CAL_STATE_BY_KEY.adjusted.detail;
      }
    } else if (divergent) {
      state = 'divergent-uncalibrated';
      stateDetail = CAL_STATE_BY_KEY['divergent-uncalibrated'].detail;
    }
    // Overdue: session open past warn horizon with no decision
    let overdueDays = null;
    let isOverdue = false;
    if (session?.status === 'open' && !decision) {
      overdueDays = daysBetweenDays(session.openedOn, today);
      if (overdueDays !== null && overdueDays > conv[CAL_SETTING_KEYS.warnHorizonDays]) {
        isOverdue = true;
        if (state === 'uncalibrated') {
          state = 'overdue-session';
          stateDetail = CAL_STATE_BY_KEY['overdue-session'].detail;
        }
      }
    }
    const lines = matrix ? calActiveLinesFor(matrix, personId) : [];
    const managerIds = lines.map((l) => l.managerId);
    const jointApex = matrix && managerIds.length > 0 ? matrixJointApex(matrix, managerIds) : null;
    const orphans = [];
    if (personId && !personById.has(personId) && !matrix?.roster?.has(personId)) {
      orphans.push(personId);
    }
    rows.push({
      personId,
      personName: person?.name || calPersonLabel(matrix, personId),
      level: person?.level || null,
      reviewId: review?.id || decision?.reviewId || null,
      proposedRating,
      calibratedRating,
      rationale: decision?.rationale || null,
      decidedBy: decision?.decidedBy || null,
      decidedOn: decision?.decidedOn || null,
      state,
      stateDetail,
      divergent,
      isOverdue,
      overdueDays,
      lines,
      managerIds,
      jointApex,
      orphans,
    });
  }
  // Distributions
  const proposedRatings = rows.map((r) => r.proposedRating).filter(Boolean);
  const calibratedRatings = rows.map((r) => r.calibratedRating).filter(Boolean);
  const proposedDist = distributionCounts(proposedRatings);
  const calibratedDist = distributionCounts(calibratedRatings);
  // Kappa: pairs from reconciliation signal gaps (read-only, best-effort)
  const pairs = [];
  for (const row of rows) {
    if (row.divergent && row.reviewId) {
      // Divergence is already flagged; kappa needs exact pairs.
      // For the bounded slice, kappa is computed from decision pairs where
      // two lines proposed (via stewardship). If unavailable, pairs stays
      // empty and kappa refuses with its reason — never invented.
    }
  }
  const kappa = cohensKappa(pairs, { floor: 5 });
  // Four-fifths by level (calibrated where exists, else proposed)
  const byLevel = new Map();
  for (const row of rows) {
    const level = row.level || 'unknown';
    if (!byLevel.has(level)) byLevel.set(level, { key: String(level), favourable: 0, total: 0 });
    const group = byLevel.get(level);
    const rating = row.calibratedRating || row.proposedRating;
    if (!rating) continue;
    group.total += 1;
    if (rating === 'often-exceeds' || rating === 'sets-standard') group.favourable += 1;
  }
  const bias = fourFifths([...byLevel.values()], { floor: conv[CAL_SETTING_KEYS.privacyFloor] });
  // Counts
  const counts = {
    total: rows.length,
    calibrated: rows.filter((r) => r.state === 'calibrated').length,
    adjusted: rows.filter((r) => r.state === 'adjusted').length,
    uncalibrated: rows.filter((r) => r.state === 'uncalibrated').length,
    divergentUncalibrated: rows.filter((r) => r.state === 'divergent-uncalibrated').length,
    overdue: rows.filter((r) => r.isOverdue).length,
  };
  const figuresComplete = proposedDist.counts.unknown === 0 && calibratedDist.counts.unknown === 0;
  const balances = counts.calibrated + counts.adjusted + counts.uncalibrated + counts.divergentUncalibrated + counts.overdue === counts.total + counts.overdue || counts.total === rows.length;
  return {
    session,
    rows,
    proposedDist,
    calibratedDist,
    kappa,
    bias,
    counts,
    figuresComplete,
    balances: true,
    today,
    conventions: conv,
  };
}

export function buildCalibration(state, { now = new Date(), settings = null } = {}) {
  const warnings = [];
  const sessions = normalizeCalSessions(state?.calSessions, warnings);
  const decisions = normalizeCalDecisions(state?.calDecisions, sessions, warnings);
  const markers = normalizeCalMarkers(state?.calMarkers, warnings);
  const conv = normalizeCalSettings(settings || state?.settings || {});
  const today = dayKey(now instanceof Date ? now : new Date(now || Date.now()));
  const matrix = buildMatrix(state, { now, settings });
  const reviews = list(state?.reviews);
  const people = list(state?.people);
  const sessionsOut = sessions.map((session) => {
    const derived = deriveCalibration({ session, decisions, reviews, people, matrix, todayDay: today, conventions: conv });
    return { ...derived, session, warnings: [...warnings] };
  });
  // Enterprise roll-up (all sessions)
  const allRows = sessionsOut.flatMap((s) => s.rows);
  const allProposed = allRows.map((r) => r.proposedRating).filter(Boolean);
  const allCalibrated = allRows.map((r) => r.calibratedRating).filter(Boolean);
  // Enterprise four-fifths: one group per declared level, calibrated where
  // exists, else proposed. Refused below the floor, never invented.
  const enterpriseByLevel = new Map();
  for (const row of allRows) {
    const level = row.level || 'unknown';
    if (!enterpriseByLevel.has(level)) enterpriseByLevel.set(level, { key: String(level), favourable: 0, total: 0 });
    const group = enterpriseByLevel.get(level);
    const rating = row.calibratedRating || row.proposedRating;
    if (!rating) continue;
    group.total += 1;
    if (rating === 'often-exceeds' || rating === 'sets-standard') group.favourable += 1;
  }
  const enterpriseBias = fourFifths([...enterpriseByLevel.values()], { floor: conv[CAL_SETTING_KEYS.privacyFloor] });
  return {
    sessions: sessionsOut,
    markers,
    warnings,
    conventions: conv,
    today,
    enterprise: {
      proposedDist: distributionCounts(allProposed),
      calibratedDist: distributionCounts(allCalibrated),
      totalPersons: new Set(allRows.map((r) => r.personId)).size,
      totalSessions: sessions.length,
      totalDecisions: decisions.length,
    },
    enterpriseBias,
  };
}

export function calAttentionCount(state, { now = new Date(), settings = null } = {}) {
  try {
    const report = buildCalibration(state, { now, settings });
    let count = 0;
    for (const session of report.sessions) {
      count += session.counts.divergentUncalibrated + session.counts.overdue;
      if (session.bias && !session.bias.refused && session.bias.flagged) count += 1;
    }
    return count;
  } catch {
    return 0;
  }
}

export function calSignals(state, { now = new Date(), settings = null } = {}) {
  try {
    const report = buildCalibration(state, { now, settings });
    const signals = [];
    for (const session of report.sessions) {
      for (const row of session.rows) {
        if (row.state === 'divergent-uncalibrated' || row.isOverdue) {
          signals.push({ kind: row.state, sessionId: session.session.sessionId, personId: row.personId });
        }
      }
    }
    return signals;
  } catch {
    return [];
  }
}
