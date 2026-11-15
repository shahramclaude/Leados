/**
 * app/core/domain/portfolioReview.js — pure read model for the Enterprise
 * Portfolio Review Register (Keep / Fix / Sell / Exit, ADR-0222, Schema v176,
 * CSV #164, `#/portfolio`).
 *
 * ONE READER. The `#/portfolio` view, navigation attention badge, CSV export
 * #164, and post-commit rule `RULE-PRV-01` all read `buildPortfolioReview`.
 * None of them computes a unit state, milestone state, or joint-apex addressee
 * of its own. Nothing in this file mutates state.
 *
 * TWO CLAIMS KEPT APART (Bulletproof Reliability Mandate)
 *   - `countsReconcile`: live unit states sum to `unitsLiveInScopeN`, milestone
 *     states sum to the milestones on live verdicts, and every currency row
 *     re-adds from the printed integers (latest measured cents and latest
 *     expected proceeds).
 *   - `figuresComplete`: zero orphan rows, zero unmeasurable or unreviewed
 *     units, zero overdue reviews, zero pending verdicts, zero overdue
 *     milestones, and a clean matrix graph.
 */

import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import {
  PRV_CSV_COLUMNS,
  PRV_ENGINE_VERSION,
  PRV_FRAMEWORKS,
  PRV_MILESTONE_STATES,
  PRV_RULE_ID,
  PRV_SETTING_KEYS,
  PRV_UNIT_STATES,
  prvEvidenceByKey,
  prvUnitStateByKey,
  prvVerdictByKey,
} from './portfolioReviewRegistry.js';
import {
  formatPrvMoney,
  normalizePortfolioMarkers,
  normalizePortfolioMilestones,
  normalizePortfolioReviews,
  normalizePortfolioSettings,
  normalizePortfolioUnits,
  normalizePortfolioVerdicts,
  parsePrvAskSummary,
  prvDay,
  prvDaysBetween,
} from './portfolioReviewSchema.js';

const list = (value) => (Array.isArray(value) ? value : []);

export function portfolioReviewMatrix(state, now, settings) {
  try {
    const matrix = buildMatrix(state, { now, settings: settings || state?.settings || {} });
    return { matrix, error: null };
  } catch (err) {
    return { matrix: null, error: String(err?.message || err || 'matrix-error') };
  }
}

export function activeManagersOf(matrix, personId) {
  if (!matrix || !personId || !matrix.nodes?.has(personId)) return [];
  const lines = matrix.linesByPerson?.get(personId) || [];
  const mgrs = new Set();
  for (const line of lines) {
    if (line?.managerId && matrix.nodes.has(line.managerId) && line.managerId !== personId) {
      mgrs.add(line.managerId);
    }
  }
  return [...mgrs].sort();
}

export function isHolderOrAbove(matrix, actorId, holderId) {
  if (!actorId || !holderId) return false;
  if (actorId === LEADER_ID) return true;
  if (!matrix?.nodes?.has(holderId) || !matrix?.nodes?.has(actorId)) return false;
  if (actorId === holderId) return true;
  return Boolean(matrix.nodes.get(holderId)?.ancestors?.has(actorId));
}

export function isStrictlyAboveAll(matrix, actorId, holderIds = []) {
  const unique = [...new Set(list(holderIds).filter(Boolean))];
  if (!actorId || !unique.length) return false;
  if (actorId === LEADER_ID) return true;
  if (!matrix?.nodes?.has(actorId)) return false;
  for (const holderId of unique) {
    if (!matrix.nodes.has(holderId)) return false;
    if (actorId === holderId) return false;
    if (!matrix.nodes.get(holderId)?.ancestors?.has(actorId)) return false;
  }
  return true;
}

/**
 * Lowest seat(s) strictly above EVERY reporting line of EVERY involved holder.
 * Uses `matrixJointApex` over the union of active managers of `holderIds`.
 */
export function strictJointApex(matrix, holderIds = []) {
  const unique = [...new Set(list(holderIds).filter(Boolean))].sort();
  if (!matrix || !unique.length) {
    return {
      ok: false, reason: 'holder-off-roster', holderIds: unique, managerIds: [],
      apexIds: [], apexId: null, unique: false, ambiguous: false,
      disconnected: true, topReached: false,
    };
  }
  const allManagerIds = new Set();
  for (const holderId of unique) {
    if (!matrix.nodes?.has(holderId)) {
      return {
        ok: false, reason: 'holder-off-roster', holderIds: unique, managerIds: [],
        apexIds: [], apexId: null, unique: false, ambiguous: false,
        disconnected: true, topReached: false,
      };
    }
    const mgrs = activeManagersOf(matrix, holderId);
    if (!mgrs.length) {
      return {
        ok: false, reason: 'no-joint-apex', holderIds: unique, managerIds: [],
        apexIds: [], apexId: null, unique: false, ambiguous: false,
        disconnected: true, topReached: true,
      };
    }
    for (const m of mgrs) allManagerIds.add(m);
  }
  const managerIds = [...allManagerIds].sort();
  const apex = matrixJointApex(matrix, managerIds);
  const usableIds = (apex.apexIds || []).filter((id) => id && id !== LEADER_ID && matrix.nodes.has(id));
  if (!usableIds.length) {
    return {
      ok: false, reason: 'no-joint-apex', holderIds: unique, managerIds,
      apexIds: [], apexId: null, unique: false, ambiguous: Boolean(apex.ambiguous),
      disconnected: true, topReached: Boolean(apex.isLeaderOnly),
    };
  }
  return {
    ok: true,
    reason: usableIds.length === 1 ? 'unique-joint-apex' : 'diamond-joint-apex',
    holderIds: unique, managerIds, apexIds: usableIds,
    apexId: usableIds.length === 1 ? usableIds[0] : null,
    unique: usableIds.length === 1, ambiguous: usableIds.length > 1,
    disconnected: false, topReached: false,
  };
}

function governingRow(rows, asOf, dateField) {
  const eligible = list(rows).filter((row) => !asOf || row[dateField] <= asOf);
  if (!eligible.length) return null;
  const sorted = [...eligible].sort((a, b) => (
    a[dateField].localeCompare(b[dateField])
  ));
  return sorted[sorted.length - 1];
}

function inSeatSpan(seat, personId) {
  if (!personId) return false;
  if (!seat || seat.fullAccess || seat.isLeader) return true;
  if (seat.readOnly) return false;
  return personId === seat.id
    || Boolean(seat.scope?.has?.(personId))
    || Boolean(seat.lineScope?.has?.(personId));
}

function personLabel(peopleById, personId) {
  if (!personId) return '—';
  if (personId === LEADER_ID) return 'Workspace leader';
  return peopleById.get(personId)?.name || personId;
}

export function indexPortfolioReviewAsks(state) {
  const delegationsById = new Map(list(state?.delegations).filter((d) => d && typeof d.id === 'string').map((d) => [d.id, d]));
  const out = [];
  for (const link of list(state?.links)) {
    if (!link || link.ruleId !== PRV_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const signature = parsePrvAskSummary(link.summary);
    if (!signature) continue;
    out.push({
      link,
      signature,
      seatId: String(link.sourceId || ''),
      task: delegationsById.get(String(link.targetId || '')) || null,
    });
  }
  return out;
}

export function buildPortfolioReview(state, { now = new Date(), settings = null, seat = null } = {}) {
  const asOf = prvDay(dayKey(now)) || '2026-11-15';
  const conv = normalizePortfolioSettings(settings || state?.settings || {});
  const loadWarnings = [];
  const unitsRaw = normalizePortfolioUnits(state?.portfolioUnits, loadWarnings);
  const reviewsRaw = normalizePortfolioReviews(state?.portfolioReviews, loadWarnings);
  const verdictsRaw = normalizePortfolioVerdicts(state?.portfolioVerdicts, loadWarnings);
  const milestonesRaw = normalizePortfolioMilestones(state?.portfolioMilestones, loadWarnings);
  const markers = normalizePortfolioMarkers(state?.portfolioMarkers, loadWarnings);

  const { matrix, error: matrixError } = portfolioReviewMatrix(state, now, settings || state?.settings || {});
  const peopleById = new Map(list(state?.people).filter((p) => p?.id).map((p) => [p.id, p]));

  const unitById = new Map(unitsRaw.map((u) => [u.id, u]));
  const reviewsByUnit = new Map();
  let orphanReviewsN = 0;
  for (const rev of reviewsRaw) {
    if (!unitById.has(rev.unitId)) { orphanReviewsN += 1; continue; }
    if (!reviewsByUnit.has(rev.unitId)) reviewsByUnit.set(rev.unitId, []);
    reviewsByUnit.get(rev.unitId).push(rev);
  }
  const verdictsByUnit = new Map();
  let orphanVerdictsN = 0;
  for (const v of verdictsRaw) {
    if (!unitById.has(v.unitId)) { orphanVerdictsN += 1; continue; }
    if (!verdictsByUnit.has(v.unitId)) verdictsByUnit.set(v.unitId, []);
    verdictsByUnit.get(v.unitId).push(v);
  }
  const verdictById = new Map();
  for (const vList of verdictsByUnit.values()) for (const v of vList) verdictById.set(v.id, v);
  const milestonesByVerdict = new Map();
  let orphanMilestonesN = 0;
  for (const ms of milestonesRaw) {
    if (!verdictById.has(ms.verdictId)) { orphanMilestonesN += 1; continue; }
    if (!milestonesByVerdict.has(ms.verdictId)) milestonesByVerdict.set(ms.verdictId, []);
    milestonesByVerdict.get(ms.verdictId).push(ms);
  }

  let unitsOutsideScopeN = 0;
  const units = [];
  const reviews = [];
  const verdicts = [];
  const milestones = [];
  const escalations = [];

  for (const unit of unitsRaw) {
    const visible = inSeatSpan(seat, unit.owningLineHolderId);
    if (!visible) { unitsOutsideScopeN += 1; continue; }

    const isRetired = Boolean(unit.retiredOn && unit.retiredOn <= asOf);
    const status = isRetired ? 'retired' : 'live';
    const ownerOnRoster = Boolean(matrix?.nodes?.has(unit.owningLineHolderId));
    const unitReviews = reviewsByUnit.get(unit.id) || [];
    const unitVerdicts = verdictsByUnit.get(unit.id) || [];
    const latestReview = governingRow(unitReviews, asOf, 'assessedOn');
    const latestVerdict = governingRow(unitVerdicts, asOf, 'decidedOn');

    const reviewAgeDays = latestReview ? (prvDaysBetween(latestReview.assessedOn, asOf) ?? 0) : null;
    const reviewOverdue = Boolean(latestReview && (reviewAgeDays > conv[PRV_SETTING_KEYS.reviewDays]
      || (latestVerdict?.verdict === 'fix' && latestVerdict.reReviewOn <= asOf && latestReview.assessedOn < latestVerdict.reReviewOn)));
    const verdictStale = Boolean(latestVerdict && latestReview && (latestVerdict.reviewId !== latestReview.id || latestVerdict.decidedOn < latestReview.assessedOn));

    let unitState = 'keep';
    let stateReason = 'verdict-current';
    if (matrixError || !ownerOnRoster) {
      unitState = 'unmeasurable';
      stateReason = matrixError || 'owning-line-off-roster';
    } else if (!latestReview) {
      unitState = 'unreviewed';
      stateReason = 'no-review-on-record';
    } else if (reviewOverdue) {
      unitState = 'review-overdue';
      stateReason = 'latest-review-past-cadence';
    } else if (!latestVerdict || verdictStale) {
      unitState = 'verdict-pending';
      stateReason = !latestVerdict ? 'reviewed-no-verdict' : 'verdict-predates-latest-review';
    } else {
      unitState = latestVerdict.verdict;
      stateReason = 'verdict-current';
    }

    const verdictMilestones = latestVerdict ? (milestonesByVerdict.get(latestVerdict.id) || []) : [];
    const evaluatedMilestones = verdictMilestones.map((ms) => {
      const done = Boolean(ms.doneOn && ms.doneOn <= asOf);
      const overdue = !done && ms.dueOn < asOf;
      const msState = done ? 'done' : overdue ? 'overdue' : 'open';
      const msMeta = PRV_MILESTONE_STATES.find((s) => s.key === msState);
      return {
        id: ms.id,
        verdictId: ms.verdictId,
        unitId: unit.id,
        label: ms.label,
        dueOn: ms.dueOn,
        doneOn: ms.doneOn,
        doneById: ms.doneById,
        doneByName: personLabel(peopleById, ms.doneById),
        note: ms.note,
        state: msState,
        stateLabel: msMeta?.label || msState,
        stateTone: msMeta?.tone || 'warn',
      };
    });
    milestones.push(...evaluatedMilestones);

    const milestonesDoneN = evaluatedMilestones.filter((m) => m.state === 'done').length;
    const milestonesOverdueN = evaluatedMilestones.filter((m) => m.state === 'overdue').length;
    const milestonesOpenN = evaluatedMilestones.length - milestonesDoneN - milestonesOverdueN;

    const jointApex = strictJointApex(matrix, [unit.owningLineHolderId]);
    const stateMeta = prvUnitStateByKey(unitState);
    const verdictMeta = latestVerdict ? prvVerdictByKey(latestVerdict.verdict) : null;
    const evidenceMeta = latestReview ? prvEvidenceByKey(latestReview.evidenceKind) : null;

    const unitRow = {
      id: unit.id,
      name: unit.name,
      status,
      owningLineHolderId: unit.owningLineHolderId,
      owningLineName: personLabel(peopleById, unit.owningLineHolderId),
      currency: unit.currency,
      reviewDueOn: unit.reviewDueOn,
      declaredOn: unit.declaredOn,
      declaredById: unit.declaredById,
      declaredByName: personLabel(peopleById, unit.declaredById),
      basis: unit.basis,
      retiredOn: unit.retiredOn,
      retiredById: unit.retiredById,
      retirementReason: unit.retirementReason,
      state: unitState,
      stateLabel: stateMeta?.label || unitState,
      stateTone: stateMeta?.tone || 'warn',
      stateSays: stateMeta?.says || '',
      stateReason,
      reviewsN: unitReviews.length,
      verdictsN: unitVerdicts.length,
      latestReview: latestReview ? {
        id: latestReview.id,
        assessedOn: latestReview.assessedOn,
        assessedById: latestReview.assessedById,
        assessedByName: personLabel(peopleById, latestReview.assessedById),
        basis: latestReview.basis,
        measuredCents: latestReview.measuredCents,
        measuredDisplay: formatPrvMoney(unit.currency, latestReview.measuredCents),
        evidenceKind: latestReview.evidenceKind,
        evidenceLabel: evidenceMeta?.label || latestReview.evidenceKind,
        evidenceId: latestReview.evidenceId,
        ageDays: reviewAgeDays,
        overdue: reviewOverdue,
      } : null,
      latestVerdict: latestVerdict ? {
        id: latestVerdict.id,
        verdict: latestVerdict.verdict,
        verdictLabel: verdictMeta?.label || latestVerdict.verdict,
        decidedOn: latestVerdict.decidedOn,
        decidedById: latestVerdict.decidedById,
        decidedByName: personLabel(peopleById, latestVerdict.decidedById),
        rationale: latestVerdict.rationale,
        expectedProceedsCents: latestVerdict.expectedProceedsCents,
        expectedProceedsDisplay: latestVerdict.expectedProceedsCents !== null
          ? formatPrvMoney(unit.currency, latestVerdict.expectedProceedsCents) : null,
        expectedOn: latestVerdict.expectedOn,
        reReviewOn: latestVerdict.reReviewOn,
        stale: verdictStale,
      } : null,
      milestones: evaluatedMilestones,
      milestonesDoneN,
      milestonesOpenN,
      milestonesOverdueN,
      executionOverdue: Boolean(latestVerdict?.expectedOn && latestVerdict.expectedOn < asOf),
      escalation: jointApex,
    };
    units.push(unitRow);

    for (const rev of unitReviews) {
      reviews.push({
        id: rev.id,
        unitId: unit.id,
        unitName: unit.name,
        unitStatus: status,
        currency: unit.currency,
        assessedOn: rev.assessedOn,
        assessedById: rev.assessedById,
        assessedByName: personLabel(peopleById, rev.assessedById),
        basis: rev.basis,
        measuredCents: rev.measuredCents,
        measuredDisplay: formatPrvMoney(unit.currency, rev.measuredCents),
        evidenceKind: rev.evidenceKind,
        evidenceLabel: prvEvidenceByKey(rev.evidenceKind)?.label || rev.evidenceKind,
        evidenceId: rev.evidenceId,
        isLatest: latestReview?.id === rev.id,
      });
    }
    for (const v of unitVerdicts) {
      verdicts.push({
        id: v.id,
        unitId: unit.id,
        unitName: unit.name,
        unitStatus: status,
        currency: unit.currency,
        verdict: v.verdict,
        verdictLabel: prvVerdictByKey(v.verdict)?.label || v.verdict,
        decidedOn: v.decidedOn,
        decidedById: v.decidedById,
        decidedByName: personLabel(peopleById, v.decidedById),
        rationale: v.rationale,
        expectedProceedsCents: v.expectedProceedsCents,
        expectedProceedsDisplay: v.expectedProceedsCents !== null
          ? formatPrvMoney(unit.currency, v.expectedProceedsCents) : null,
        expectedOn: v.expectedOn,
        reReviewOn: v.reReviewOn,
        isLatest: latestVerdict?.id === v.id,
        milestonesN: (milestonesByVerdict.get(v.id) || []).length,
      });
    }

    if (status === 'live' && (unitState === 'review-overdue' || unitState === 'verdict-pending'
      || milestonesOverdueN > 0)) {
      escalations.push({
        unitId: unit.id,
        unitName: unit.name,
        state: unitState,
        stateLabel: unitRow.stateLabel,
        owningLineHolderId: unit.owningLineHolderId,
        owningLineName: unitRow.owningLineName,
        milestonesOverdueN,
        jointApex,
        apexNames: jointApex.apexIds.map((id) => personLabel(peopleById, id)),
      });
    }
  }

  const liveUnits = units.filter((u) => u.status === 'live');
  const retiredUnits = units.filter((u) => u.status === 'retired');

  const stateCounts = Object.fromEntries(PRV_UNIT_STATES.map((s) => [s.key, 0]));
  for (const u of liveUnits) stateCounts[u.state] = (stateCounts[u.state] || 0) + 1;

  const milestoneStateCounts = { done: 0, open: 0, overdue: 0 };
  for (const m of milestones) milestoneStateCounts[m.state] = (milestoneStateCounts[m.state] || 0) + 1;

  // Per-currency exact BigInt conservation over live units: latest measured
  // cents and latest expected proceeds, never pooled across currencies.
  const byCurrency = new Map();
  for (const u of liveUnits) {
    if (!byCurrency.has(u.currency)) {
      byCurrency.set(u.currency, {
        currency: u.currency, unitsN: 0, measuredCents: 0n, proceedsCents: 0n,
      });
    }
    const bucket = byCurrency.get(u.currency);
    bucket.unitsN += 1;
    if (u.latestReview) bucket.measuredCents += BigInt(u.latestReview.measuredCents);
    if (u.latestVerdict && u.latestVerdict.expectedProceedsCents !== null) {
      bucket.proceedsCents += BigInt(u.latestVerdict.expectedProceedsCents);
    }
  }
  const currencies = [...byCurrency.values()]
    .sort((a, b) => a.currency.localeCompare(b.currency))
    .map((b) => {
      const measured = Number(b.measuredCents);
      const proceeds = Number(b.proceedsCents);
      return {
        currency: b.currency,
        unitsN: b.unitsN,
        measuredCents: Number.isSafeInteger(measured) ? measured : null,
        proceedsCents: Number.isSafeInteger(proceeds) ? proceeds : null,
        measuredDisplay: Number.isSafeInteger(measured) ? formatPrvMoney(b.currency, measured) : 'REFUSED: total exceeds safe integer cents',
        proceedsDisplay: Number.isSafeInteger(proceeds) ? formatPrvMoney(b.currency, proceeds) : 'REFUSED: total exceeds safe integer cents',
        reconciles: Number.isSafeInteger(measured) && Number.isSafeInteger(proceeds),
      };
    });

  const sumStates = Object.values(stateCounts).reduce((acc, n) => acc + n, 0);
  const sumMilestones = Object.values(milestoneStateCounts).reduce((acc, n) => acc + n, 0);
  const countsReconcile = sumStates === liveUnits.length
    && sumMilestones === milestones.length
    && currencies.every((c) => c.reconciles);

  const incompleteReasons = [];
  if (!countsReconcile) incompleteReasons.push('aggregate-overflow');
  if (unitsOutsideScopeN > 0) incompleteReasons.push(`units-outside-scope:${unitsOutsideScopeN}`);
  if (matrixError) incompleteReasons.push('matrix-graph-error');
  if (loadWarnings.length > 0) incompleteReasons.push(`malformed-rows-dropped:${loadWarnings.length}`);
  if (orphanReviewsN > 0) incompleteReasons.push(`orphan-reviews:${orphanReviewsN}`);
  if (orphanVerdictsN > 0) incompleteReasons.push(`orphan-verdicts:${orphanVerdictsN}`);
  if (orphanMilestonesN > 0) incompleteReasons.push(`orphan-milestones:${orphanMilestonesN}`);
  if (stateCounts['unmeasurable'] > 0) incompleteReasons.push(`unmeasurable-units:${stateCounts['unmeasurable']}`);
  if (stateCounts['unreviewed'] > 0) incompleteReasons.push(`unreviewed-units:${stateCounts['unreviewed']}`);
  if (stateCounts['review-overdue'] > 0) incompleteReasons.push(`review-overdue-units:${stateCounts['review-overdue']}`);
  if (stateCounts['verdict-pending'] > 0) incompleteReasons.push(`verdict-pending-units:${stateCounts['verdict-pending']}`);
  if (milestoneStateCounts['overdue'] > 0) incompleteReasons.push(`overdue-milestones:${milestoneStateCounts['overdue']}`);

  if (liveUnits.some((u) => u.executionOverdue)) incompleteReasons.push('execution-date-passed');
  const figuresComplete = incompleteReasons.length === 0;
  const asks = indexPortfolioReviewAsks(state);
  const openMarkers = markers.filter((m) => !m.resolvedOn);

  return {
    asOf,
    engineVersion: PRV_ENGINE_VERSION,
    ruleId: PRV_RULE_ID,
    conventions: conv,
    matrixError,
    loadWarnings,
    frameworks: PRV_FRAMEWORKS,
    verdicts: PRV_UNIT_STATES,
    scope: {
      seatId: seat?.id || null,
      seatRank: seat?.rank ?? null,
      unitsInScopeN: units.length,
      unitsOutsideScopeN,
    },
    counts: {
      unitsTotal: units.length,
      unitsLive: liveUnits.length,
      unitsRetired: retiredUnits.length,
      reviewsTotal: reviews.length,
      verdictsTotal: verdicts.length,
      milestonesTotal: milestones.length,
      escalationsLive: escalations.length,
      openAsksN: asks.filter((a) => a.task && a.task.status === 'active').length,
      openMarkersN: openMarkers.length,
      unitStates: stateCounts,
      milestoneStates: milestoneStateCounts,
    },
    currencies,
    gaps: {
      orphanReviewsN,
      orphanVerdictsN,
      orphanMilestonesN,
      unreviewedUnitsN: stateCounts['unreviewed'],
      reviewOverdueUnitsN: stateCounts['review-overdue'],
      verdictPendingUnitsN: stateCounts['verdict-pending'],
      overdueMilestonesN: milestoneStateCounts['overdue'],
    },
    claims: { countsReconcile, figuresComplete, incompleteReasons },
    units,
    reviews,
    verdicts,
    milestones,
    escalations,
    markers: openMarkers,
  };
}

/**
 * Navigation badge count for the active seat: exact number of open conditions
 * where THIS seat owes an answer (reviewing an overdue unit it owns, or
 * governing a verdict-pending / slippage escalation as joint apex).
 */
export function portfolioReviewAttentionCount(state, { now = new Date(), settings = null, seat = null } = {}) {
  if (!seat || seat.readOnly || !seat.id || seat.isLeader) return 0;
  const report = buildPortfolioReview(state, { now, settings, seat: null });
  if (report.matrixError) return 0;
  let owed = 0;
  for (const unit of report.units) {
    if (unit.status !== 'live') continue;
    if ((unit.state === 'review-overdue' || (unit.state === 'unreviewed' && unit.reviewDueOn <= report.asOf)) && unit.owningLineHolderId === seat.id) owed += 1;
    if ((unit.state === 'verdict-pending' || unit.milestonesOverdueN > 0)
      && unit.escalation.apexIds.includes(seat.id)) owed += 1;
  }
  return owed;
}

export function portfolioReviewCandidates(state, { now = new Date(), settings = null, seat = null } = {}) {
  const { matrix } = portfolioReviewMatrix(state, now, settings || state?.settings || {});
  const activePeople = list(state?.people).filter((p) => p?.id && p.status !== 'archived' && matrix?.nodes?.has(p.id));
  const owners = activePeople
    .filter((p) => (!seat || seat.fullAccess || seat.isLeader
      ? true
      : (p.id === seat.id || seat.scope?.has?.(p.id) || seat.lineScope?.has?.(p.id))))
    .map((p) => ({
      id: p.id,
      name: p.name || p.id,
      level: p.level || '',
      managerIds: activeManagersOf(matrix, p.id),
    }));
  const holders = activePeople.map((p) => ({
    id: p.id,
    name: p.name || p.id,
    level: p.level || '',
  }));
  return { owners, holders };
}

/**
 * Identity-free CSV rows (#164): one `workspace` control row (unit states,
 * review/verdict/milestone counts) plus one `currency` row per declared
 * currency (exact integer cents for latest measured value and expected
 * proceeds). No person id, unit id, name, rationale, or evidence text is
 * reachable from this export.
 */
export function portfolioReviewCsvRows(report) {
  if (!report) return [];
  const c = report.counts;
  const base = {
    as_of: report.asOf,
    engine_version: report.engineVersion,
    units_live_total: c.unitsLive,
    units_retired_total: c.unitsRetired,
    units_keep: c.unitStates['keep'] || 0,
    units_fix: c.unitStates['fix'] || 0,
    units_sell: c.unitStates['sell'] || 0,
    units_exit: c.unitStates['exit'] || 0,
    units_verdict_pending: c.unitStates['verdict-pending'] || 0,
    units_review_overdue: c.unitStates['review-overdue'] || 0,
    units_unreviewed: c.unitStates['unreviewed'] || 0,
    units_unmeasurable: c.unitStates['unmeasurable'] || 0,
    reviews_total: c.reviewsTotal,
    verdicts_total: c.verdictsTotal,
    milestones_open: c.milestoneStates['open'] || 0,
    milestones_done: c.milestoneStates['done'] || 0,
    milestones_overdue: c.milestoneStates['overdue'] || 0,
    counts_reconcile: report.claims.countsReconcile ? 1 : 0,
    figures_complete: report.claims.figuresComplete ? 1 : 0,
    incomplete_reasons: report.claims.incompleteReasons.join(';') || 'clean',
  };

  const rows = [{
    ...base,
    row_kind: 'workspace',
    currency: '',
    money_measured_cents: '',
    money_expected_proceeds_cents: '',
  }];

  for (const cur of report.currencies) {
    rows.push({
      ...base,
      row_kind: 'currency',
      currency: cur.currency,
      money_measured_cents: cur.measuredCents,
      money_expected_proceeds_cents: cur.proceedsCents,
    });
  }

  return rows.map((row) => Object.fromEntries(
    PRV_CSV_COLUMNS.map((key) => [key, row[key] ?? '']),
  ));
}

export default buildPortfolioReview;
