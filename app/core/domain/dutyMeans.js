/**
 * app/core/domain/dutyMeans.js — pure read model for the Duty-Without-Means
 * Register (Accountability–Means Parity & Simons' Entrepreneurial Gap Ledger,
 * ADR-0221, Schema v175, CSV #163, `#/means`).
 *
 * ONE READER. The `#/means` view, navigation attention badge, CSV export #163,
 * and post-commit rule `RULE-DWM-01` all read `buildDutyMeans`. None of them
 * computes a requirement state, duty verdict, shortfall, or joint-apex
 * addressee of its own. Nothing in this file mutates state.
 *
 * TWO CLAIMS KEPT APART (Bulletproof Reliability Mandate)
 *   - `countsReconcile`: live duty verdicts sum to `dutiesLiveInScopeN`,
 *     requirement states sum to `requirementsLiveInScopeN`, and every currency,
 *     hour, and authority row satisfies `covered + acceptedGap + unbacked === required`.
 *   - `figuresComplete`: zero orphan rows, zero live unscoped duties, zero
 *     unanswered or drifted requirements, zero altitude-withheld carrier rows,
 *     and a clean matrix graph.
 */

import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import {
  DWM_CSV_COLUMNS,
  DWM_DUTY_VERDICTS,
  DWM_ENGINE_VERSION,
  DWM_FRAMEWORKS,
  DWM_PILLARS,
  DWM_REQUIREMENT_STATES,
  DWM_RULE_ID,
  DWM_SETTING_KEYS,
  DWM_STRUCTURE_KINDS,
  dwmAuthorityScopeByKey,
  dwmPillarByKey,
  dwmReqStateByKey,
  dwmSourceByKey,
  dwmVerdictByKey,
} from './dutyMeansRegistry.js';
import {
  dwmDay,
  dwmDaysBetween,
  formatDwmMoney,
  normalizeDutyMeansActs,
  normalizeDutyMeansDuties,
  normalizeDutyMeansMarkers,
  normalizeDutyMeansRequirements,
  normalizeDutyMeansSettings,
  parseDwmAskSummary,
} from './dutyMeansSchema.js';

const list = (value) => (Array.isArray(value) ? value : []);

export function dutyMeansMatrix(state, now, settings) {
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

export function declaredLineShareH(matrix, personId, managerId) {
  if (!matrix || !personId || !managerId) return null;
  const lines = matrix.linesByPerson?.get(personId) || [];
  const match = lines.find((line) => line.managerId === managerId);
  if (!match) return null;
  return Number.isInteger(match.shareH) ? match.shareH : null;
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
 * In any DAG, a common upper bound of every holder's managers is strictly above
 * every holder and disjoint from `holderIds` itself, so no demanding or
 * controlling line is ever asked to adjudicate its own refusal.
 */
export function strictJointApex(matrix, holderIds = []) {
  const unique = [...new Set(list(holderIds).filter(Boolean))].sort();
  if (!matrix || !unique.length) {
    return {
      ok: false,
      reason: 'holder-off-roster',
      holderIds: unique,
      managerIds: [],
      apexIds: [],
      apexId: null,
      unique: false,
      ambiguous: false,
      disconnected: true,
      topReached: false,
    };
  }
  const allManagerIds = new Set();
  for (const holderId of unique) {
    if (!matrix.nodes?.has(holderId)) {
      return {
        ok: false,
        reason: 'holder-off-roster',
        holderIds: unique,
        managerIds: [],
        apexIds: [],
        apexId: null,
        unique: false,
        ambiguous: false,
        disconnected: true,
        topReached: false,
      };
    }
    const mgrs = activeManagersOf(matrix, holderId);
    if (!mgrs.length) {
      return {
        ok: false,
        reason: 'no-joint-apex',
        holderIds: unique,
        managerIds: [],
        apexIds: [],
        apexId: null,
        unique: false,
        ambiguous: false,
        disconnected: true,
        topReached: true,
      };
    }
    for (const m of mgrs) allManagerIds.add(m);
  }
  const managerIds = [...allManagerIds].sort();
  const apex = matrixJointApex(matrix, managerIds);
  const usableIds = (apex.apexIds || []).filter((id) => id && id !== LEADER_ID && matrix.nodes.has(id));
  if (!usableIds.length) {
    return {
      ok: false,
      reason: 'no-joint-apex',
      holderIds: unique,
      managerIds,
      apexIds: [],
      apexId: null,
      unique: false,
      ambiguous: Boolean(apex.ambiguous),
      disconnected: true,
      topReached: Boolean(apex.isLeaderOnly),
    };
  }
  return {
    ok: true,
    reason: usableIds.length === 1 ? 'unique-joint-apex' : 'diamond-joint-apex',
    holderIds: unique,
    managerIds,
    apexIds: usableIds,
    apexId: usableIds.length === 1 ? usableIds[0] : null,
    unique: usableIds.length === 1,
    ambiguous: usableIds.length > 1,
    disconnected: false,
    topReached: false,
  };
}

export function classifyRequirementStructure(matrix, duty, req) {
  if (!duty || !req) return DWM_STRUCTURE_KINDS.SAME_LINE;
  if (req.controllingHolderId === duty.demandingLineHolderId) {
    return DWM_STRUCTURE_KINDS.SAME_LINE;
  }
  if (!matrix?.nodes?.has(duty.demandingLineHolderId) || !matrix?.nodes?.has(req.controllingHolderId)) {
    return DWM_STRUCTURE_KINDS.CROSS_LINE;
  }
  const demandingAnc = matrix.nodes.get(duty.demandingLineHolderId)?.ancestors;
  const controllingAnc = matrix.nodes.get(req.controllingHolderId)?.ancestors;
  if (demandingAnc?.has(req.controllingHolderId) || controllingAnc?.has(duty.demandingLineHolderId)) {
    return DWM_STRUCTURE_KINDS.VERTICAL;
  }
  return DWM_STRUCTURE_KINDS.CROSS_LINE;
}

export function supplierStanding(matrix, req, act) {
  if (!req || !act) return { ok: false, reason: 'missing-act' };
  if (!matrix) return { ok: false, reason: 'matrix-unavailable' };
  if (!matrix.nodes?.has(req.controllingHolderId)) {
    return { ok: false, reason: 'controlling-holder-off-roster' };
  }
  if (!isHolderOrAbove(matrix, act.byId, req.controllingHolderId)) {
    return { ok: false, reason: 'supplier-no-longer-controls-line' };
  }
  const needsMoney = req.pillar === 'budget'
    || (req.pillar === 'authority' && dwmAuthorityScopeByKey(req.authorityScope)?.needsMoney);
  if (act.state === 'supplied') {
    if (needsMoney && (act.currency !== req.currency || typeof act.suppliedCents !== 'number')) {
      return { ok: false, reason: 'incompatible-supply-currency' };
    }
    if (req.pillar === 'time' && typeof act.suppliedHours !== 'number') {
      return { ok: false, reason: 'missing-supplied-hours' };
    }
    if (!needsMoney && req.pillar === 'authority'
      && (act.suppliedCents !== null || act.suppliedHours !== null)) {
      return { ok: false, reason: 'unexpected-supply-quantity' };
    }
  }
  return { ok: true, reason: 'standing-verified' };
}

export function governorStanding(matrix, duty, req, act) {
  if (!duty || !req || !act) return { ok: false, reason: 'missing-act' };
  if (!matrix) return { ok: false, reason: 'matrix-unavailable' };
  if (!isStrictlyAboveAll(matrix, act.byId, [duty.demandingLineHolderId, req.controllingHolderId])) {
    return { ok: false, reason: 'governor-not-above-both-lines' };
  }
  return { ok: true, reason: 'joint-apex-verified' };
}

export function governingActFor(acts, asOf) {
  const eligible = list(acts).filter((row) => !asOf || row.on <= asOf);
  if (!eligible.length) return null;
  const sorted = [...eligible].sort((a, b) => (
    a.on === b.on ? a.id.localeCompare(b.id) : a.on.localeCompare(b.on)
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

export function indexDutyMeansAsks(state) {
  const delegationsById = new Map(list(state?.delegations).filter((d) => d && typeof d.id === 'string').map((d) => [d.id, d]));
  const out = [];
  for (const link of list(state?.links)) {
    if (!link || link.ruleId !== DWM_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const signature = parseDwmAskSummary(link.summary);
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

export function buildDutyMeans(state, { now = new Date(), settings = null, seat = null } = {}) {
  const asOf = dwmDay(dayKey(now)) || '2026-11-15';
  const conv = normalizeDutyMeansSettings(settings || state?.settings || {});
  const loadWarnings = [];
  const dutiesRaw = normalizeDutyMeansDuties(state?.dutyMeansDuties, loadWarnings);
  const requirementsRaw = normalizeDutyMeansRequirements(state?.dutyMeansRequirements, loadWarnings);
  const actsRaw = normalizeDutyMeansActs(state?.dutyMeansActs, loadWarnings);
  const markers = normalizeDutyMeansMarkers(state?.dutyMeansMarkers, loadWarnings);

  const { matrix, error: matrixError } = dutyMeansMatrix(state, now, settings || state?.settings || {});
  const peopleById = new Map(list(state?.people).filter((p) => p?.id).map((p) => [p.id, p]));

  const dutyById = new Map(dutiesRaw.map((d) => [d.id, d]));
  const reqsByDuty = new Map();
  let orphanRequirementsN = 0;
  for (const req of requirementsRaw) {
    if (!dutyById.has(req.dutyId)) {
      orphanRequirementsN += 1;
      continue;
    }
    if (!reqsByDuty.has(req.dutyId)) reqsByDuty.set(req.dutyId, []);
    reqsByDuty.get(req.dutyId).push(req);
  }

  const reqById = new Map();
  for (const reqList of reqsByDuty.values()) {
    for (const r of reqList) reqById.set(r.id, r);
  }

  const actsByReq = new Map();
  let orphanActsN = 0;
  for (const act of actsRaw) {
    if (!reqById.has(act.requirementId)) {
      orphanActsN += 1;
      continue;
    }
    if (!actsByReq.has(act.requirementId)) actsByReq.set(act.requirementId, []);
    actsByReq.get(act.requirementId).push(act);
  }

  const executiveRedacted = Boolean(seat && !seat.fullAccess && !seat.isLeader && Number(seat.rank) >= 4);
  let dutiesOutsideScopeN = 0;
  let requirementsOutsideScopeN = 0;
  let carrierIdentityWithheldN = 0;

  const duties = [];
  const requirements = [];
  const escalations = [];

  for (const duty of dutiesRaw) {
    const dutyReqs = reqsByDuty.get(duty.id) || [];
    const visible = inSeatSpan(seat, duty.carrierId)
      || inSeatSpan(seat, duty.demandingLineHolderId)
      || dutyReqs.some((r) => inSeatSpan(seat, r.controllingHolderId));
    if (!visible) {
      dutiesOutsideScopeN += 1;
      requirementsOutsideScopeN += dutyReqs.length;
      continue;
    }

    const isRetired = Boolean(duty.retiredOn && duty.retiredOn <= asOf);
    const status = isRetired ? 'retired' : 'live';
    const carrierOnRoster = Boolean(matrix?.nodes?.has(duty.carrierId));
    const demandingOnRoster = Boolean(matrix?.nodes?.has(duty.demandingLineHolderId));
    const demandingHoldsCarrier = demandingOnRoster && carrierOnRoster && (
      activeManagersOf(matrix, duty.carrierId).includes(duty.demandingLineHolderId)
      || Boolean(matrix.nodes.get(duty.carrierId)?.ancestors?.has(duty.demandingLineHolderId))
    );

    if (executiveRedacted) carrierIdentityWithheldN += 1;

    const evaluatedReqs = [];
    for (const req of dutyReqs) {
      const reqActs = actsByReq.get(req.id) || [];
      const act = governingActFor(reqActs, asOf);
      const structureKind = classifyRequirementStructure(matrix, duty, req);
      const crossLine = structureKind === DWM_STRUCTURE_KINDS.CROSS_LINE;
      const shareH = declaredLineShareH(matrix, duty.carrierId, req.controllingHolderId);
      const needsMoney = req.pillar === 'budget'
        || (req.pillar === 'authority' && Boolean(dwmAuthorityScopeByKey(req.authorityScope)?.needsMoney));
      const daysSinceDeclared = dwmDaysBetween(req.declaredOn, asOf) ?? 0;
      const windowOpen = duty.windowFrom <= asOf;
      const pastResponseWindow = daysSinceDeclared >= conv[DWM_SETTING_KEYS.responseDays] || windowOpen;

      let reqState = 'awaiting-means';
      let standingReason = 'awaiting-controlling-line';
      let coveredCents = needsMoney ? 0 : null;
      let acceptedGapCents = needsMoney ? 0 : null;
      let unbackedShortfallCents = needsMoney ? req.requiredCents : null;
      let oversuppliedCents = needsMoney ? 0 : null;
      let coveredHours = req.pillar === 'time' ? 0 : null;
      let acceptedGapHours = req.pillar === 'time' ? 0 : null;
      let unbackedShortfallHours = req.pillar === 'time' ? req.requiredHours : null;
      let oversuppliedHours = req.pillar === 'time' ? 0 : null;

      if (matrixError || !carrierOnRoster || !demandingOnRoster) {
        reqState = 'unreadable';
        standingReason = matrixError || (!carrierOnRoster ? 'carrier-off-roster' : 'demanding-line-off-roster');
      } else if (!act) {
        if (pastResponseWindow) {
          reqState = 'overdue-unanswered';
          standingReason = windowOpen ? 'duty-window-open-unanswered' : 'past-response-days';
        } else {
          reqState = 'awaiting-means';
          standingReason = 'within-response-window';
        }
      } else if (act.state === 'revoked') {
        const standing = supplierStanding(matrix, req, act);
        reqState = standing.ok ? 'withdrawn' : 'drifted';
        standingReason = standing.ok ? 'means-withdrawn' : standing.reason;
      } else if (act.state === 'declined') {
        const standing = supplierStanding(matrix, req, act);
        reqState = standing.ok ? 'declined' : 'drifted';
        standingReason = standing.ok ? 'means-declined' : standing.reason;
      } else if (act.state === 'accepted-gap') {
        const standing = governorStanding(matrix, duty, req, act);
        if (!standing.ok) {
          reqState = 'drifted';
          standingReason = standing.reason;
        } else {
          reqState = 'accepted-gap';
          standingReason = standing.reason;
          if (needsMoney) {
            coveredCents = 0;
            acceptedGapCents = req.requiredCents;
            unbackedShortfallCents = 0;
          }
          if (req.pillar === 'time') {
            coveredHours = 0;
            acceptedGapHours = req.requiredHours;
            unbackedShortfallHours = 0;
          }
        }
      } else if (act.state === 'supplied') {
        const standing = supplierStanding(matrix, req, act);
        if (!standing.ok) {
          reqState = 'drifted';
          standingReason = standing.reason;
        } else if (needsMoney) {
          const cap = Math.min(req.requiredCents, act.suppliedCents);
          const short = Math.max(0, req.requiredCents - act.suppliedCents);
          oversuppliedCents = Math.max(0, act.suppliedCents - req.requiredCents);
          coveredCents = cap;
          acceptedGapCents = 0;
          unbackedShortfallCents = short;
          reqState = short > 0 ? 'partial' : 'backed';
          standingReason = short > 0 ? 'partial-money-shortfall' : 'full-money-backed';
        } else if (req.pillar === 'time') {
          const cap = Math.min(req.requiredHours, act.suppliedHours);
          const short = Math.max(0, req.requiredHours - act.suppliedHours);
          oversuppliedHours = Math.max(0, act.suppliedHours - req.requiredHours);
          coveredHours = cap;
          acceptedGapHours = 0;
          unbackedShortfallHours = short;
          reqState = short > 0 ? 'partial' : 'backed';
          standingReason = short > 0 ? 'partial-hours-shortfall' : 'full-hours-backed';
        } else {
          reqState = 'backed';
          standingReason = 'authority-granted';
        }
      }

      const jointApex = strictJointApex(matrix, [duty.demandingLineHolderId, req.controllingHolderId]);
      const stateMeta = dwmReqStateByKey(reqState);
      const pillarMeta = dwmPillarByKey(req.pillar);
      const authMeta = req.authorityScope ? dwmAuthorityScopeByKey(req.authorityScope) : null;

      const evaluated = {
        id: req.id,
        dutyId: duty.id,
        dutyLabel: duty.label,
        dutyStatus: status,
        pillar: req.pillar,
        pillarLabel: pillarMeta?.label || req.pillar,
        authorityScope: req.authorityScope,
        authorityScopeLabel: authMeta?.label || null,
        controllingHolderId: req.controllingHolderId,
        controllingHolderName: personLabel(peopleById, req.controllingHolderId),
        demandingLineHolderId: duty.demandingLineHolderId,
        demandingLineName: personLabel(peopleById, duty.demandingLineHolderId),
        carrierId: executiveRedacted ? null : duty.carrierId,
        carrierName: executiveRedacted ? null : personLabel(peopleById, duty.carrierId),
        structureKind,
        crossLine,
        declaredLineShareH: shareH,
        currency: req.currency,
        requiredCents: req.requiredCents,
        coveredCents,
        acceptedGapCents,
        unbackedShortfallCents,
        oversuppliedCents,
        requiredMoneyDisplay: needsMoney ? formatDwmMoney(req.currency, req.requiredCents) : null,
        shortfallMoneyDisplay: needsMoney ? formatDwmMoney(req.currency, unbackedShortfallCents) : null,
        requiredHours: req.requiredHours,
        coveredHours,
        acceptedGapHours,
        unbackedShortfallHours,
        oversuppliedHours,
        rationale: executiveRedacted ? null : req.rationale,
        declaredOn: req.declaredOn,
        declaredById: req.declaredById,
        state: reqState,
        stateLabel: stateMeta?.label || reqState,
        stateTone: stateMeta?.tone || 'warn',
        standingReason,
        actsN: reqActs.length,
        governingAct: act ? {
          id: act.id,
          state: act.state,
          on: act.on,
          byId: act.byId,
          byName: personLabel(peopleById, act.byId),
          suppliedCents: act.suppliedCents,
          suppliedHours: act.suppliedHours,
          evidenceKind: act.evidenceKind,
          evidenceId: act.evidenceId,
          reason: executiveRedacted ? null : act.reason,
        } : null,
        escalation: jointApex,
      };
      evaluatedReqs.push(evaluated);
      requirements.push(evaluated);
    }

    let verdict = 'means-backed';
    if (matrixError || !carrierOnRoster || !demandingOnRoster || !demandingHoldsCarrier) {
      verdict = 'unmeasurable';
    } else if (evaluatedReqs.length === 0) {
      verdict = 'unscoped-means';
    } else if (evaluatedReqs.some((r) => r.state === 'declined' || r.state === 'withdrawn')) {
      verdict = 'means-declined';
    } else if (evaluatedReqs.some((r) => r.crossLine
      && (r.state === 'overdue-unanswered' || r.state === 'partial' || r.state === 'drifted' || r.state === 'unreadable'))) {
      verdict = 'cross-line-locked';
    } else if (evaluatedReqs.some((r) => !r.crossLine
      && (r.state === 'overdue-unanswered' || r.state === 'partial' || r.state === 'drifted' || r.state === 'unreadable'))) {
      verdict = 'means-shortfall';
    } else if (evaluatedReqs.some((r) => r.state === 'awaiting-means')) {
      verdict = 'pending-means';
    } else if (evaluatedReqs.some((r) => r.state === 'accepted-gap')) {
      verdict = 'entrepreneurial-gap';
    } else {
      verdict = 'means-backed';
    }

    const escalatedReqs = evaluatedReqs.filter((r) => (
      r.state === 'declined' || r.state === 'withdrawn' || r.state === 'partial' || r.state === 'drifted'
    ));
    const escalationHolderIds = [
      duty.demandingLineHolderId,
      ...escalatedReqs.map((r) => r.controllingHolderId),
    ];
    const dutyEscalation = escalatedReqs.length
      ? strictJointApex(matrix, escalationHolderIds)
      : strictJointApex(matrix, [duty.demandingLineHolderId]);

    const backedPillarsN = evaluatedReqs.filter((r) => r.state === 'backed').length;
    const acceptedGapPillarsN = evaluatedReqs.filter((r) => r.state === 'accepted-gap').length;
    const unbackedPillarsN = evaluatedReqs.length - backedPillarsN - acceptedGapPillarsN;
    const crossLinePillarsN = evaluatedReqs.filter((r) => r.crossLine).length;
    const gapClassification = evaluatedReqs.length === 0
      ? 'unexamined'
      : unbackedPillarsN === 0 && acceptedGapPillarsN === 0
        ? 'parity'
        : unbackedPillarsN === 0
          ? 'bounded-entrepreneurial-gap'
          : evaluatedReqs.every((r) => r.state === 'backed' || r.state === 'accepted-gap' || r.state === 'awaiting-means')
            ? 'awaiting-contract'
            : 'unbacked-accountability-gap';

    const verdictMeta = dwmVerdictByKey(verdict);
    const sourceMeta = dwmSourceByKey(duty.sourceKind);

    const dutyRow = {
      id: duty.id,
      label: duty.label,
      status,
      carrierId: executiveRedacted ? null : duty.carrierId,
      carrierName: executiveRedacted ? null : personLabel(peopleById, duty.carrierId),
      carrierIdentityWithheld: executiveRedacted,
      demandingLineHolderId: duty.demandingLineHolderId,
      demandingLineName: personLabel(peopleById, duty.demandingLineHolderId),
      demandingHoldsCarrier,
      windowFrom: duty.windowFrom,
      windowTo: duty.windowTo,
      declaredOn: duty.declaredOn,
      declaredById: duty.declaredById,
      outcomeBasis: executiveRedacted ? null : duty.outcomeBasis,
      sourceKind: duty.sourceKind,
      sourceLabel: sourceMeta?.label || duty.sourceKind,
      sourceId: duty.sourceId,
      retiredOn: duty.retiredOn,
      retiredById: duty.retiredById,
      retirementReason: executiveRedacted ? null : duty.retirementReason,
      verdict,
      verdictLabel: verdictMeta?.label || verdict,
      verdictTone: verdictMeta?.tone || 'warn',
      verdictSays: verdictMeta?.says || '',
      requirementsN: evaluatedReqs.length,
      simonsGap: {
        accountabilityPillarsN: evaluatedReqs.length,
        backedPillarsN,
        acceptedGapPillarsN,
        unbackedPillarsN,
        crossLinePillarsN,
        gapClassification,
      },
      escalation: dutyEscalation,
      requirements: evaluatedReqs,
    };
    duties.push(dutyRow);

    if (status === 'live' && escalatedReqs.length > 0) {
      escalations.push({
        dutyId: duty.id,
        dutyLabel: duty.label,
        verdict,
        verdictLabel: dutyRow.verdictLabel,
        demandingLineHolderId: duty.demandingLineHolderId,
        demandingLineName: dutyRow.demandingLineName,
        controllingHolders: [...new Set(escalatedReqs.map((r) => r.controllingHolderId))].map((id) => ({
          id,
          name: personLabel(peopleById, id),
        })),
        crossLine: escalatedReqs.some((r) => r.crossLine),
        unbackedRequirementsN: escalatedReqs.length,
        requirementIds: escalatedReqs.map((r) => r.id),
        jointApex: dutyEscalation,
        apexNames: dutyEscalation.apexIds.map((id) => personLabel(peopleById, id)),
      });
    }
  }

  const liveDuties = duties.filter((d) => d.status === 'live');
  const retiredDuties = duties.filter((d) => d.status === 'retired');
  const liveReqs = requirements.filter((r) => r.dutyStatus === 'live');

  const verdictCounts = Object.fromEntries(DWM_DUTY_VERDICTS.map((v) => [v.key, 0]));
  for (const d of liveDuties) verdictCounts[d.verdict] = (verdictCounts[d.verdict] || 0) + 1;

  const reqStateCounts = Object.fromEntries(DWM_REQUIREMENT_STATES.map((s) => [s.key, 0]));
  for (const r of liveReqs) reqStateCounts[r.state] = (reqStateCounts[r.state] || 0) + 1;

  // Per-currency exact BigInt conservation over live requirements
  const byCurrency = new Map();
  let hoursRequired = 0;
  let hoursCovered = 0;
  let hoursAcceptedGap = 0;
  let hoursUnbackedShortfall = 0;
  let authorityRequiredN = 0;
  let authorityCoveredN = 0;
  let authorityAcceptedGapN = 0;
  let authorityUnbackedN = 0;

  for (const r of liveReqs) {
    if (r.currency && typeof r.requiredCents === 'number') {
      if (!byCurrency.has(r.currency)) {
        byCurrency.set(r.currency, {
          currency: r.currency,
          requirementsN: 0,
          requiredCents: 0n,
          coveredCents: 0n,
          acceptedGapCents: 0n,
          unbackedShortfallCents: 0n,
        });
      }
      const bucket = byCurrency.get(r.currency);
      bucket.requirementsN += 1;
      bucket.requiredCents += BigInt(r.requiredCents);
      bucket.coveredCents += BigInt(r.coveredCents || 0);
      bucket.acceptedGapCents += BigInt(r.acceptedGapCents || 0);
      bucket.unbackedShortfallCents += BigInt(r.unbackedShortfallCents || 0);
    }
    if (r.pillar === 'time' && typeof r.requiredHours === 'number') {
      hoursRequired += r.requiredHours;
      hoursCovered += r.coveredHours || 0;
      hoursAcceptedGap += r.acceptedGapHours || 0;
      hoursUnbackedShortfall += r.unbackedShortfallHours || 0;
    }
    if (r.pillar === 'authority') {
      authorityRequiredN += 1;
      if (r.state === 'backed') authorityCoveredN += 1;
      else if (r.state === 'accepted-gap') authorityAcceptedGapN += 1;
      else authorityUnbackedN += 1;
    }
  }

  const currencies = [...byCurrency.values()]
    .sort((a, b) => a.currency.localeCompare(b.currency))
    .map((b) => {
      const reqC = Number(b.requiredCents);
      const covC = Number(b.coveredCents);
      const accC = Number(b.acceptedGapCents);
      const unbC = Number(b.unbackedShortfallCents);
      const reconciles = b.coveredCents + b.acceptedGapCents + b.unbackedShortfallCents === b.requiredCents;
      return {
        currency: b.currency,
        requirementsN: b.requirementsN,
        requiredCents: reqC,
        coveredCents: covC,
        acceptedGapCents: accC,
        unbackedShortfallCents: unbC,
        requiredDisplay: formatDwmMoney(b.currency, reqC),
        coveredDisplay: formatDwmMoney(b.currency, covC),
        acceptedGapDisplay: formatDwmMoney(b.currency, accC),
        unbackedShortfallDisplay: formatDwmMoney(b.currency, unbC),
        reconciles,
      };
    });

  const sumVerdicts = Object.values(verdictCounts).reduce((acc, n) => acc + n, 0);
  const sumReqStates = Object.values(reqStateCounts).reduce((acc, n) => acc + n, 0);
  const sumDutyReqs = liveDuties.reduce((acc, d) => acc + d.requirementsN, 0);
  const hoursReconcile = hoursCovered + hoursAcceptedGap + hoursUnbackedShortfall === hoursRequired;
  const authorityReconcile = authorityCoveredN + authorityAcceptedGapN + authorityUnbackedN === authorityRequiredN;
  const currenciesReconcile = currencies.every((c) => c.reconciles);

  const countsReconcile = sumVerdicts === liveDuties.length
    && sumReqStates === liveReqs.length
    && sumDutyReqs === liveReqs.length
    && hoursReconcile
    && authorityReconcile
    && currenciesReconcile;

  const incompleteReasons = [];
  if (matrixError) incompleteReasons.push('matrix-graph-error');
  if (loadWarnings.length > 0) incompleteReasons.push(`malformed-rows-dropped:${loadWarnings.length}`);
  if (orphanRequirementsN > 0) incompleteReasons.push(`orphan-requirements:${orphanRequirementsN}`);
  if (orphanActsN > 0) incompleteReasons.push(`orphan-acts:${orphanActsN}`);
  if (verdictCounts['unmeasurable'] > 0) incompleteReasons.push(`unmeasurable-duties:${verdictCounts['unmeasurable']}`);
  if (verdictCounts['unscoped-means'] > 0) incompleteReasons.push(`unscoped-duties:${verdictCounts['unscoped-means']}`);
  if (reqStateCounts['overdue-unanswered'] > 0) incompleteReasons.push(`overdue-unanswered:${reqStateCounts['overdue-unanswered']}`);
  if (reqStateCounts['awaiting-means'] > 0) incompleteReasons.push(`awaiting-means:${reqStateCounts['awaiting-means']}`);
  if (reqStateCounts['drifted'] > 0) incompleteReasons.push(`drifted-means:${reqStateCounts['drifted']}`);
  if (carrierIdentityWithheldN > 0) incompleteReasons.push(`carrier-identity-withheld:${carrierIdentityWithheldN}`);

  const figuresComplete = incompleteReasons.length === 0;
  const asks = indexDutyMeansAsks(state);
  const openMarkers = markers.filter((m) => !m.resolvedOn);

  return {
    asOf,
    engineVersion: DWM_ENGINE_VERSION,
    ruleId: DWM_RULE_ID,
    conventions: conv,
    matrixError,
    loadWarnings,
    frameworks: DWM_FRAMEWORKS,
    pillars: DWM_PILLARS,
    detailLevel: executiveRedacted ? 'leaders' : 'full',
    scope: {
      seatId: seat?.id || null,
      seatRank: seat?.rank ?? null,
      dutiesInScopeN: duties.length,
      dutiesOutsideScopeN,
      requirementsInScopeN: requirements.length,
      requirementsOutsideScopeN,
      carrierIdentityWithheldN,
    },
    counts: {
      dutiesTotal: duties.length,
      dutiesLive: liveDuties.length,
      dutiesRetired: retiredDuties.length,
      requirementsLive: liveReqs.length,
      crossLineRequirementsLive: liveReqs.filter((r) => r.crossLine).length,
      escalationsLive: escalations.length,
      openAsksN: asks.filter((a) => a.task && a.task.status === 'active').length,
      openMarkersN: openMarkers.length,
      verdicts: verdictCounts,
      requirementStates: reqStateCounts,
    },
    currencies,
    hours: {
      requiredHours: hoursRequired,
      coveredHours: hoursCovered,
      acceptedGapHours: hoursAcceptedGap,
      unbackedShortfallHours: hoursUnbackedShortfall,
      reconciles: hoursReconcile,
    },
    authority: {
      requiredN: authorityRequiredN,
      coveredN: authorityCoveredN,
      acceptedGapN: authorityAcceptedGapN,
      unbackedN: authorityUnbackedN,
      reconciles: authorityReconcile,
    },
    gaps: {
      orphanRequirementsN,
      orphanActsN,
      dutiesWithoutRequirementsN: verdictCounts['unscoped-means'],
      crossLineLockedDutiesN: verdictCounts['cross-line-locked'],
      meansDeclinedDutiesN: verdictCounts['means-declined'],
      meansShortfallDutiesN: verdictCounts['means-shortfall'],
      overdueUnansweredN: reqStateCounts['overdue-unanswered'],
      driftedRequirementsN: reqStateCounts['drifted'],
    },
    claims: {
      countsReconcile,
      figuresComplete,
      incompleteReasons,
    },
    duties,
    requirements,
    escalations,
    markers: openMarkers,
  };
}

/**
 * Navigation badge count for the active seat: exact number of open conditions
 * where THIS seat owes an answer (declaring means on an unscoped duty,
 * answering an overdue means request it controls, or governing a joint-apex
 * escalation). Returns 0 when no seat is active or when the seat is read-only.
 */
export function dutyMeansAttentionCount(state, { now = new Date(), settings = null, seat = null } = {}) {
  if (!seat || seat.readOnly || !seat.id || seat.isLeader) return 0;
  const report = buildDutyMeans(state, { now, settings, seat: null });
  if (report.matrixError) return 0;
  let owed = 0;
  for (const duty of report.duties) {
    if (duty.status !== 'live') continue;
    if (duty.windowFrom <= report.asOf && duty.verdict === 'unscoped-means' && duty.demandingLineHolderId === seat.id) {
      owed += 1;
    }
    for (const req of duty.requirements) {
      if (req.state === 'overdue-unanswered' && req.controllingHolderId === seat.id) {
        owed += 1;
      }
    }
    const needsJointApex = duty.requirements.some((r) => (
      r.state === 'declined' || r.state === 'withdrawn' || r.state === 'partial' || r.state === 'drifted'
    ));
    if (needsJointApex && duty.escalation.apexIds.includes(seat.id)) {
      owed += 1;
    }
  }
  return owed;
}

export function dutyMeansCandidates(state, { now = new Date(), settings = null, seat = null } = {}) {
  const { matrix } = dutyMeansMatrix(state, now, settings || state?.settings || {});
  const activePeople = list(state?.people).filter((p) => p?.id && p.status !== 'archived' && matrix?.nodes?.has(p.id));
  const carriers = activePeople
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
  return { carriers, holders };
}

/**
 * Identity-free CSV rows (#163): one `workspace` control row (carrying hours,
 * authority, duty verdict and requirement state counts) plus one `currency` row
 * per declared currency (carrying exact integer cents). No person id, duty id,
 * label, rationale, or evidence text is reachable from this export.
 */
export function dutyMeansCsvRows(report) {
  if (!report) return [];
  const c = report.counts;
  const base = {
    as_of: report.asOf,
    engine_version: report.engineVersion,
    duties_live_total: c.dutiesLive,
    duties_retired_total: c.dutiesRetired,
    duties_backed: c.verdicts['means-backed'] || 0,
    duties_entrepreneurial_gap: c.verdicts['entrepreneurial-gap'] || 0,
    duties_pending_means: c.verdicts['pending-means'] || 0,
    duties_means_shortfall: c.verdicts['means-shortfall'] || 0,
    duties_cross_line_locked: c.verdicts['cross-line-locked'] || 0,
    duties_means_declined: c.verdicts['means-declined'] || 0,
    duties_unscoped_means: c.verdicts['unscoped-means'] || 0,
    duties_unmeasurable: c.verdicts['unmeasurable'] || 0,
    requirements_total: c.requirementsLive,
    requirements_cross_line: c.crossLineRequirementsLive,
    requirements_backed: c.requirementStates['backed'] || 0,
    requirements_partial: c.requirementStates['partial'] || 0,
    requirements_accepted_gap: c.requirementStates['accepted-gap'] || 0,
    requirements_declined: c.requirementStates['declined'] || 0,
    requirements_withdrawn: c.requirementStates['withdrawn'] || 0,
    requirements_drifted: c.requirementStates['drifted'] || 0,
    requirements_overdue_unanswered: c.requirementStates['overdue-unanswered'] || 0,
    requirements_awaiting_means: c.requirementStates['awaiting-means'] || 0,
    counts_reconcile: report.claims.countsReconcile ? 1 : 0,
    figures_complete: report.claims.figuresComplete ? 1 : 0,
    incomplete_reasons: report.claims.incompleteReasons.join(';') || 'clean',
  };

  const rows = [
    {
      ...base,
      row_kind: 'workspace',
      currency: '',
      money_required_cents: '',
      money_covered_cents: '',
      money_accepted_gap_cents: '',
      money_unbacked_shortfall_cents: '',
      hours_required_total: report.hours.requiredHours,
      hours_covered_total: report.hours.coveredHours,
      hours_accepted_gap_total: report.hours.acceptedGapHours,
      hours_unbacked_shortfall_total: report.hours.unbackedShortfallHours,
      authority_required_total: report.authority.requiredN,
      authority_covered_total: report.authority.coveredN,
      authority_accepted_gap_total: report.authority.acceptedGapN,
      authority_unbacked_total: report.authority.unbackedN,
    },
  ];

  for (const cur of report.currencies) {
    rows.push({
      ...base,
      row_kind: 'currency',
      currency: cur.currency,
      money_required_cents: cur.requiredCents,
      money_covered_cents: cur.coveredCents,
      money_accepted_gap_cents: cur.acceptedGapCents,
      money_unbacked_shortfall_cents: cur.unbackedShortfallCents,
      hours_required_total: '',
      hours_covered_total: '',
      hours_accepted_gap_total: '',
      hours_unbacked_shortfall_total: '',
      authority_required_total: '',
      authority_covered_total: '',
      authority_accepted_gap_total: '',
      authority_unbacked_total: '',
    });
  }

  return rows.map((row) => {
    const shaped = {};
    for (const col of DWM_CSV_COLUMNS) shaped[col] = row[col] ?? '';
    return shaped;
  });
}
