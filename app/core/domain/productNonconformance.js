/**
 * app/core/domain/productNonconformance.js — the single read model for ADR-0253.
 *
 * Every state is derived from declarations and dated acts plus the current Matrix
 * graph. No status, hold, release, approval or verification verdict is stored.
 */

import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import { activeManagersOf } from './dutyMeans.js';
import {
  QNC_ENGINE_VERSION,
  QNC_LIMITS as L,
  QNC_STATE_BY_KEY,
  QNC_STATE_KEYS,
  QNC_TERMINAL_STATE_KEYS,
} from './productNonconformanceRegistry.js';
import {
  normalizeQncCases,
  normalizeQncContainments,
  normalizeQncDecisions,
  normalizeQncDispositionActs,
  normalizeQncMarkers,
  normalizeQncSettings,
  normalizeQncVerifications,
} from './productNonconformanceSchema.js';

const list = (value) => (Array.isArray(value) ? value : []);
const sortedUnique = (values) => [...new Set(list(values).filter((value) => typeof value === 'string' && value))].sort();
const state = (key) => ({ key, ...(QNC_STATE_BY_KEY[key] || QNC_STATE_BY_KEY['record-conflict']) });

/** Every currently active manager line of a person, read through the one Matrix graph. */
export function qncActiveLinesFor(matrix, personId) {
  const lines = matrix?.linesByPerson?.get(personId) || [];
  return lines
    .filter((line) => line && line.active !== false && line.managerId && line.managerId !== personId)
    .map((line) => ({ lineId: line.id || null, managerId: line.managerId, kind: line.kind || null }))
    .sort((a, b) => String(a.managerId).localeCompare(String(b.managerId))
      || String(a.lineId).localeCompare(String(b.lineId)));
}

function qncPersonLabel(matrix, personId) {
  if (personId === LEADER_ID) return 'Workspace leader';
  return matrix?.nodes?.get(personId)?.name || matrix?.roster?.get(personId)?.name || null;
}

/**
 * STRICT SENIORITY ON THE WRITE PATH AND THE READ PATH, ONE RULE.
 *
 * A passing re-verification releases an output, so the hand that records it must
 * be a DIFFERENT person AND strictly senior to the hand that completed the rework,
 * proved on the live reporting graph. "Somebody else" is not independence: a peer
 * can be persuaded, a subordinate cannot refuse, and the person who did the work
 * can always agree with themselves. An imported row that fails this is KEPT and
 * printed — deleting it would hide the control failure — but it never counts as a
 * verification, so the output stays held.
 */
export function qncVerificationSeniority(matrix, completion, verification) {
  const performerId = completion?.performedById || null;
  const verifierId = verification?.verifiedById || null;
  if (!performerId || !verifierId) {
    return { ok: false, reason: 'The completion or the re-verification names no hand, so seniority cannot be established.' };
  }
  if (performerId === verifierId) {
    return { ok: false, reason: 'The verifier is the same hand that completed the rework. Re-verification is independent by construction.' };
  }
  if (!matrix) {
    return { ok: false, reason: 'The reporting graph could not be read, so no seat can be proved strictly senior to the hand that completed the rework.' };
  }
  const performer = matrix.nodes?.get?.(performerId) || null;
  const verifier = matrix.nodes?.get?.(verifierId) || null;
  if (!performer) {
    return { ok: false, reason: 'The hand that completed the rework is no longer on the reporting graph, so nobody can be proved strictly senior to them.' };
  }
  if (!verifier) {
    return { ok: false, reason: 'The verifier is not a seat on the live reporting graph.' };
  }
  if (!performer.ancestors?.has?.(verifierId)) {
    return { ok: false, reason: 'The verifier is not strictly senior to the hand that completed the rework on the live reporting graph.' };
  }
  return { ok: true, reason: null };
}

function groupDecisions(decisions) {
  const groups = new Map();
  for (const row of list(decisions)) {
    const key = JSON.stringify([row.caseId, row.routeKey, row.decisionRound]);
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }
  return [...groups.values()].map((rows) => rows.sort((a, b) => String(a.decidedAt).localeCompare(String(b.decidedAt))
    || String(a.decidedById).localeCompare(String(b.decidedById))));
}

function groupVerdict(rows) {
  const first = rows[0];
  if (!first) return { complete: false, disagreement: false, disposition: null, concessionRef: null, decidedAt: null, routeIds: [] };
  const routeIds = list(first.routeIds);
  const actors = new Set(rows.map((row) => row.decidedById));
  const signaturesAgree = rows.every((row) => row.disposition === first.disposition
    && (row.concessionRef || null) === (first.concessionRef || null)
    && JSON.stringify(row.routeIds) === JSON.stringify(routeIds));
  const disagreement = !signaturesAgree;
  const complete = signaturesAgree && routeIds.length > 0 && actors.size === routeIds.length
    && routeIds.every((id) => actors.has(id));
  return {
    complete,
    disagreement,
    disposition: signaturesAgree ? first.disposition : null,
    concessionRef: signaturesAgree ? (first.concessionRef || null) : null,
    decidedAt: rows.reduce((latest, row) => String(row.decidedAt) > latest ? String(row.decidedAt) : latest, ''),
    routeIds,
    routeKey: first.routeKey,
    decisionRound: first.decisionRound,
    rows,
  };
}

const after = (left, right) => Boolean(left && right && left >= right);
const verifiedFor = (completion, verifications) => list(verifications)
  .filter((row) => row.completionId === completion?.id)
  .sort((a, b) => String(a.verifiedAt).localeCompare(String(b.verifiedAt))
    || String(a.id).localeCompare(String(b.id)));

function deriveCase({ caseRow, containments, decisions, acts, verifications, matrix, matrixError, at }) {
  const ownerRows = caseRow.ownerIds.map((personId) => {
    const onGraph = Boolean(matrix?.nodes?.has(personId));
    const lines = onGraph ? qncActiveLinesFor(matrix, personId) : [];
    return {
      personId,
      name: onGraph ? qncPersonLabel(matrix, personId) : null,
      onGraph,
      lines: lines.map((line) => ({ ...line, name: qncPersonLabel(matrix, line.managerId) })),
    };
  });
  const unresolvedOwners = ownerRows.filter((row) => !row.onGraph || row.lines.length === 0);
  const managerIds = sortedUnique(ownerRows.flatMap((row) => row.lines.map((line) => line.managerId)));
  let apex = null;
  if (matrix && managerIds.length) {
    try { apex = matrixJointApex(matrix, managerIds); } catch { apex = null; }
  }
  const apexIds = sortedUnique(apex?.apexIds);
  const syntheticApex = apexIds.includes(LEADER_ID);
  const authorityResolved = !matrixError && unresolvedOwners.length === 0 && managerIds.length > 0
    && apexIds.length > 0 && apexIds.length <= L.approversMax && !syntheticApex;
  const authorityReason = matrixError
    ? 'The reporting graph could not be read.'
    : unresolvedOwners.length
      ? 'One or more accountable hands no longer resolve to an active reporting line.'
      : !managerIds.length
        ? 'No active reporting line carries the declared accountable hands.'
        : !apexIds.length
          ? 'The current matrix has no common decision seat above every accountable line.'
          : apexIds.length > L.approversMax
            ? `The current matrix resolves ${apexIds.length} required apexes, above the supported limit of ${L.approversMax}.`
            : syntheticApex
              ? 'The only common authority is the synthetic workspace root, not a named human seat.'
              : null;
  const routeKey = apexIds.length ? apexIds.join('|') : null;

  const caseContainments = list(containments).filter((row) => row.caseId === caseRow.id)
    .sort((a, b) => String(a.recordedAt).localeCompare(String(b.recordedAt))
      || String(a.id).localeCompare(String(b.id)));
  const caseDecisions = list(decisions).filter((row) => row.caseId === caseRow.id);
  const caseActs = list(acts).filter((row) => row.caseId === caseRow.id)
    .sort((a, b) => String(a.performedAt).localeCompare(String(b.performedAt)) || a.sequence - b.sequence);
  const caseVerifications = list(verifications).filter((row) => row.caseId === caseRow.id);
  // THE LATEST ATTESTATION IS THE ONE THAT GOVERNS. An earlier `entire` act does
  // not make the output contained after a later act attests only part of it: the
  // case would otherwise read as fully held while the newest evidence says the
  // hold covers less than the identified output. History is kept and printed; it
  // is never summed into a stronger claim than the last hand made.
  const latestContainment = caseContainments[caseContainments.length - 1] || null;
  const fullContainment = latestContainment?.scope === 'entire';
  const containmentSupersededN = caseContainments
    .filter((row, index) => index < caseContainments.length - 1 && row.scope === 'entire').length;
  const groups = groupDecisions(caseDecisions);
  const verdicts = groups.map((rows) => groupVerdict(rows));

  // An act cannot close a case unless it follows a complete, unanimous signature
  // set with the exact same route/disposition, then follows the stage that the
  // disposition itself requires. This also allows a terminal historical act to
  // remain a fact if the live matrix changes later.
  const recognizedActs = new Set();
  const terminalOutcomes = [];
  const stageByGroup = [];
  let ineffectiveActsN = 0;
  let rejectedVerifications = [];
  for (const group of verdicts) {
    if (!group.complete || group.disagreement) continue;
    const groupActs = caseActs.filter((row) => row.routeKey === group.routeKey && row.decisionRound === group.decisionRound);
    const afterDecision = (row) => after(row.performedAt, group.decidedAt);
    const kindMatches = (kind) => groupActs.filter((row) => row.kind === kind && afterDecision(row));
    if (group.disposition === 'return') {
      const matching = kindMatches('returned');
      matching.forEach((row) => recognizedActs.add(row.id));
      if (matching.length) terminalOutcomes.push({ stateKey: 'closed-returned', at: matching[0].performedAt, act: matching[0], group });
      stageByGroup.push({ group, stateKey: matching.length ? 'closed-returned' : 'return-pending', completion: null, verification: null });
    } else if (group.disposition === 'scrap') {
      const matching = kindMatches('scrapped');
      matching.forEach((row) => recognizedActs.add(row.id));
      if (matching.length) terminalOutcomes.push({ stateKey: 'closed-scrapped', at: matching[0].performedAt, act: matching[0], group });
      stageByGroup.push({ group, stateKey: matching.length ? 'closed-scrapped' : 'scrap-pending', completion: null, verification: null });
    } else if (group.disposition === 'use-as-is') {
      const matching = kindMatches('released-under-concession').filter((row) => row.concessionRef === undefined || row.concessionRef === group.concessionRef);
      matching.forEach((row) => recognizedActs.add(row.id));
      if (matching.length) terminalOutcomes.push({ stateKey: 'closed-concession', at: matching[0].performedAt, act: matching[0], group });
      stageByGroup.push({ group, stateKey: matching.length ? 'closed-concession' : 'release-pending', completion: null, verification: null });
    } else if (group.disposition === 'rework') {
      const completions = kindMatches('rework-completed');
      completions.forEach((row) => recognizedActs.add(row.id));
      const completion = completions[0] || null;
      const verificationsForCompletion = completion ? verifiedFor(completion, caseVerifications) : [];
      const assessedVerifications = verificationsForCompletion.map((row) => ({
        row,
        seniority: qncVerificationSeniority(matrix, completion, row),
      }));
      const acceptedVerifications = assessedVerifications.filter((item) => item.seniority.ok).map((item) => item.row);
      rejectedVerifications = assessedVerifications.filter((item) => !item.seniority.ok);
      const verification = acceptedVerifications[acceptedVerifications.length - 1] || null;
      // A re-verification that fails seniority is NOT a verification: the output
      // stays at `reverification-pending` and the refusal is printed, rather than
      // reading as a failed test the next hand would have to repeat anyway.
      let stage = !completion ? 'rework-pending'
        : !verification ? 'reverification-pending'
          : verification.outcome === 'fail' ? 'reverification-failed'
            : 'release-pending';
      if (completion && verification?.outcome === 'pass') {
        const releases = kindMatches('released-after-rework').filter((row) => after(row.performedAt, verification.verifiedAt));
        releases.forEach((row) => recognizedActs.add(row.id));
        if (releases.length) {
          stage = 'closed-rework';
          terminalOutcomes.push({ stateKey: 'closed-rework', at: releases[0].performedAt, act: releases[0], group });
        }
      }
      stageByGroup.push({ group, stateKey: stage, completion, verification });
    }
  }

  for (const act of caseActs) {
    if (['returned', 'scrapped', 'released-after-rework', 'released-under-concession'].includes(act.kind)
      && !recognizedActs.has(act.id)) ineffectiveActsN += 1;
  }
  // Multiple different terminal acts, or a terminal act that cannot be tied to
  // a unanimous decision and its required evidence, is a record conflict.
  const terminalKeys = new Set(terminalOutcomes.map((item) => item.stateKey));
  const invalidTerminal = ineffectiveActsN > 0;
  let derivedState = null;
  let currentGroup = null;
  let currentVerdict = null;
  let currentStage = null;
  let currentRound = 0;
  let nextDecisionRound = 1;
  let canDecide = false;

  if (terminalOutcomes.length && (terminalKeys.size > 1 || invalidTerminal)) {
    derivedState = 'record-conflict';
  } else if (terminalOutcomes.length === 1) {
    derivedState = terminalOutcomes[0].stateKey;
  } else if (invalidTerminal) {
    derivedState = 'record-conflict';
  } else if (!fullContainment) {
    derivedState = caseContainments.length ? 'containment-partial' : 'containment-missing';
  } else if (!authorityResolved) {
    derivedState = 'authority-unresolved';
  } else {
    const currentGroups = verdicts.filter((row) => row.routeKey === routeKey)
      .sort((a, b) => a.decisionRound - b.decisionRound);
    currentVerdict = currentGroups[currentGroups.length - 1] || null;
    if (!currentVerdict) {
      derivedState = caseDecisions.length ? 'authority-changed' : 'decision-pending';
      nextDecisionRound = 1;
      canDecide = true;
    } else {
      currentRound = currentVerdict.decisionRound;
      currentGroup = currentVerdict.rows;
      if (currentVerdict.disagreement) {
        derivedState = 'decision-disagreement';
        nextDecisionRound = Math.min(L.decisionRoundsMax, currentRound + 1);
        canDecide = currentRound < L.decisionRoundsMax;
      } else if (!currentVerdict.complete) {
        derivedState = 'awaiting-joint-approval';
        nextDecisionRound = currentRound;
        canDecide = true;
      } else {
        currentStage = stageByGroup.find((row) => row.group.routeKey === currentVerdict.routeKey
          && row.group.decisionRound === currentVerdict.decisionRound) || null;
        derivedState = currentStage?.stateKey || 'record-conflict';
        if (derivedState === 'reverification-failed') {
          nextDecisionRound = Math.min(L.decisionRoundsMax, currentRound + 1);
          canDecide = currentRound < L.decisionRoundsMax;
        }
      }
    }
  }

  const caseState = state(derivedState || 'record-conflict');
  const currentCompletion = currentStage?.completion || null;
  const currentVerification = currentStage?.verification || null;
  const currentDisposition = currentVerdict?.complete && !currentVerdict.disagreement ? currentVerdict.disposition : null;
  const currentConcessionRef = currentVerdict?.complete && !currentVerdict.disagreement ? currentVerdict.concessionRef : null;
  const currentRoundActs = currentVerdict
    ? caseActs.filter((row) => row.routeKey === currentVerdict.routeKey && row.decisionRound === currentVerdict.decisionRound)
    : [];
  const allowedActKinds = [];
  if (currentStage?.stateKey === 'rework-pending') allowedActKinds.push('rework-completed');
  if (currentStage?.stateKey === 'return-pending') allowedActKinds.push('returned');
  if (currentStage?.stateKey === 'scrap-pending') allowedActKinds.push('scrapped');
  if (currentStage?.stateKey === 'release-pending' && currentDisposition === 'rework' && currentVerification?.outcome === 'pass') {
    allowedActKinds.push('released-after-rework');
  }
  if (currentStage?.stateKey === 'release-pending' && currentDisposition === 'use-as-is') {
    allowedActKinds.push('released-under-concession');
  }

  return {
    case: caseRow,
    state: caseState,
    ownerRows,
    managerIds,
    managerRows: managerIds.map((managerId) => ({ managerId, name: qncPersonLabel(matrix, managerId) })),
    authority: {
      resolved: authorityResolved,
      reason: authorityReason,
      apexIds,
      apexRows: apexIds.map((personId) => ({ personId, name: qncPersonLabel(matrix, personId), synthetic: personId === LEADER_ID })),
      ambiguous: Boolean(apex?.ambiguous),
      disconnected: Boolean(apex?.disconnected),
      routeKey,
    },
    containments: caseContainments,
    fullContainment,
    latestContainment,
    containmentSupersededN,
    rejectedVerifications: rejectedVerifications.map((item) => ({
      id: item.row.id,
      verifiedById: item.row.verifiedById,
      verifiedAt: item.row.verifiedAt,
      outcome: item.row.outcome,
      reason: item.seniority.reason,
    })),
    decisions: caseDecisions,
    acts: caseActs,
    verifications: caseVerifications,
    currentGroup,
    currentRound,
    currentRouteKey: currentVerdict?.routeKey || routeKey,
    nextDecisionRound,
    currentDisposition,
    currentConcessionRef,
    currentCompletion,
    currentVerification,
    currentRoundActs,
    allowedActKinds,
    canDecide,
    ineffectiveActsN,
    matrixError: matrixError || null,
    terminal: QNC_TERMINAL_STATE_KEYS.includes(caseState.key),
    needs: caseState.key,
    updatedAt: at.toISOString(),
  };
}

function canSeeCase(caseRow, seat) {
  if (!seat || seat.fullAccess) return true;
  const ids = list(caseRow?.ownerIds);
  return ids.some((personId) => personId === (seat.nodeId || seat.id)
    || seat.scope?.has?.(personId)
    || seat.lineScope?.has?.(personId));
}

function attentionFor(row) {
  return !QNC_TERMINAL_STATE_KEYS.includes(row.state.key);
}

/**
 * The whole register. A seat may read its own tree or declared matrix lines;
 * above rank 3 it receives only aggregate counts with a privacy floor of three.
 * CSV, the screen and the automation rule all consume this same state kernel.
 */
export function buildProductNonconformance(stateValue, { now = new Date(), settings = null, seat = null } = {}) {
  const warnings = [];
  const at = now instanceof Date ? now : new Date(now);
  const asOf = dayKey(at) || at.toISOString().slice(0, 10);
  const cfg = { ...(stateValue?.settings || {}), ...(settings || {}) };
  const conventions = normalizeQncSettings(cfg);

  const cases = normalizeQncCases(stateValue?.qncCases, at, warnings);
  const containments = normalizeQncContainments(stateValue?.qncContainments, cases, at, warnings);
  const decisions = normalizeQncDecisions(stateValue?.qncDecisions, cases, containments, at, warnings);
  const acts = normalizeQncDispositionActs(stateValue?.qncDispositionActs, cases, decisions, at, warnings);
  const verifications = normalizeQncVerifications(stateValue?.qncVerifications, cases, acts, at, warnings);
  const markers = normalizeQncMarkers(stateValue?.qncMarkers, at, warnings);

  let matrix = null;
  let matrixError = null;
  try {
    matrix = buildMatrix(stateValue, { now: at, settings: { ...cfg, activeSeatId: null } });
  } catch (error) {
    matrixError = `The reporting graph could not be read (${String(error?.message || 'unknown graph error').slice(0, 160)}).`;
  }

  const inputRows = cases.map((caseRow) => deriveCase({
    caseRow, containments, decisions, acts, verifications, matrix, matrixError, at,
  }));
  const detailed = !seat || seat.fullAccess || (Number.isInteger(seat.rank) && seat.rank <= 3);
  const scopedRows = seat && !seat.fullAccess ? inputRows.filter((row) => canSeeCase(row.case, seat)) : inputRows;
  const visibleRows = detailed ? scopedRows : [];
  const counts = Object.fromEntries(QNC_STATE_KEYS.map((key) => [key, 0]));
  for (const row of scopedRows) counts[row.state.key] = (counts[row.state.key] || 0) + 1;
  const attentionN = scopedRows.filter(attentionFor).length;
  const caseN = scopedRows.length;
  const fullContainmentN = scopedRows.filter((row) => row.fullContainment).length;
  const containmentUnprovenN = caseN - fullContainmentN;
  const decisionOwedN = scopedRows.filter((row) => ['authority-unresolved', 'decision-pending', 'awaiting-joint-approval', 'decision-disagreement', 'authority-changed'].includes(row.state.key)).length;
  const verificationOwedN = scopedRows.filter((row) => ['reverification-pending', 'reverification-failed'].includes(row.state.key)).length;
  const releaseOwedN = scopedRows.filter((row) => ['rework-pending', 'release-pending', 'return-pending', 'scrap-pending'].includes(row.state.key)).length;
  const closedN = scopedRows.filter((row) => QNC_TERMINAL_STATE_KEYS.includes(row.state.key)).length;
  const unresolvedAuthorityN = scopedRows.filter((row) => row.state.key === 'authority-unresolved').length;
  const floor = 3;
  const filteredStates = QNC_STATE_KEYS.map((key) => {
    const count = counts[key] || 0;
    const withheld = !detailed && count > 0 && count < floor;
    return {
      key,
      label: QNC_STATE_BY_KEY[key].label,
      count: withheld ? null : count,
      withheld,
      reason: withheld ? `Below privacy floor ${floor}; the count is withheld, not zero.` : null,
    };
  });
  const filteredTotal = !detailed && caseN > 0 && caseN < floor ? null : caseN;
  const matrixUnresolved = scopedRows.filter((row) => row.authority.resolved === false && !row.terminal).length;
  const balances = {
    stateCountsReconcile: Object.values(counts).reduce((sum, value) => sum + value, 0) === caseN,
    casesEqualStateSum: Object.values(counts).reduce((sum, value) => sum + value, 0) === caseN,
  };
  const figuresComplete = balances.stateCountsReconcile && warnings.length === 0 && !matrixError;
  const seatId = seat?.fullAccess ? LEADER_ID : (seat?.nodeId || seat?.id || null);
  const worklist = visibleRows.filter((row) => {
    if (!seatId || seat?.fullAccess) return false;
    if (['containment-missing', 'containment-partial'].includes(row.state.key) && row.case.declaredById === seatId) return true;
    if (row.canDecide && row.authority.apexIds.includes(seatId)) return true;
    if (row.case.ownerIds.includes(seatId) && row.allowedActKinds.length) return true;
    if (row.state.key === 'reverification-pending' && row.currentCompletion
      && Number.isInteger(seat?.rank) && seat.rank >= 2
      && qncVerificationSeniority(matrix, row.currentCompletion, { performedById: row.currentCompletion.performedById, verifiedById: seatId }).ok) return true;
    return false;
  });
  const attention = {
    total: attentionN,
    openN: attentionN,
    decisionOwedN,
    verificationOwedN,
    releaseOwedN,
  };

  return {
    ok: true,
    engineVersion: QNC_ENGINE_VERSION,
    // The live graph this reading resolved. The rule reuses it so the screen and
    // the ask can never disagree about which seat is the apex for a case.
    matrix,
    asOf,
    nowIso: at.toISOString(),
    conventions,
    rows: visibleRows,
    worklist,
    markers,
    warnings,
    detailed,
    privacyFloor: floor,
    disclosure: detailed
      ? { level: 'detail', reason: null }
      : { level: 'aggregate', reason: `Above rank 3, case references, product, site, lot, finding, evidence, people and matrix routes are withheld. Non-zero state counts below ${floor} are blank with a reason.` },
    states: filteredStates,
    counts: detailed ? counts : Object.fromEntries(filteredStates.map((row) => [row.key, row.count])),
    totals: {
      cases: filteredTotal,
      open: !detailed && attentionN > 0 && attentionN < floor ? null : attentionN,
      fullContainment: !detailed && fullContainmentN > 0 && fullContainmentN < floor ? null : fullContainmentN,
      containmentUnproven: !detailed && containmentUnprovenN > 0 && containmentUnprovenN < floor ? null : containmentUnprovenN,
      unresolvedAuthority: !detailed && unresolvedAuthorityN > 0 && unresolvedAuthorityN < floor ? null : unresolvedAuthorityN,
      decisionOwed: !detailed && decisionOwedN > 0 && decisionOwedN < floor ? null : decisionOwedN,
      verificationOwed: !detailed && verificationOwedN > 0 && verificationOwedN < floor ? null : verificationOwedN,
      releaseOwed: !detailed && releaseOwedN > 0 && releaseOwedN < floor ? null : releaseOwedN,
      closed: !detailed && closedN > 0 && closedN < floor ? null : closedN,
      matrixUnresolved: !detailed && matrixUnresolved > 0 && matrixUnresolved < floor ? null : matrixUnresolved,
    },
    balances,
    figuresComplete,
    attention,
    seat: seat
      ? { id: seatId, rank: seat.rank ?? null, fullAccess: Boolean(seat.fullAccess), label: seat.label || '' }
      : { id: null, rank: null, fullAccess: true, label: 'whole register (no seat)' },
  };
}

/** A navigation/worklist count; callers get only their seat-scoped obligations. */
export function productNonconformanceAttentionCount(stateValue, { now = new Date(), settings = null, seat = null } = {}) {
  try {
    const report = buildProductNonconformance(stateValue, { now, settings, seat });
    return report?.ok ? report.attention.total : 0;
  } catch {
    return 0;
  }
}

/** Identity-free rows shared by the workspace CSV and tests. */
export function productNonconformanceCsvRows(report) {
  if (!report?.ok) return [];
  const raw = report._counts || report.counts || {};
  const rows = [];
  const safe = (value) => Number.isInteger(value) && (value === 0 || value >= report.privacyFloor) ? value : null;
  const suppressed = [];
  const counts = report.fullCounts || raw;
  const summary = {
    as_of: report.asOf,
    row_kind: 'summary',
    state: '',
    cases_n: safe(report.fullTotals?.cases ?? report.totals?.cases),
    open_cases_n: safe(report.fullTotals?.open ?? report.totals?.open),
    full_containment_n: safe(report.fullTotals?.fullContainment ?? report.totals?.fullContainment),
    containment_unproven_n: safe(report.fullTotals?.containmentUnproven ?? report.totals?.containmentUnproven),
    authority_unresolved_n: safe(report.fullTotals?.unresolvedAuthority ?? report.totals?.unresolvedAuthority),
    decision_owed_n: safe(report.fullTotals?.decisionOwed ?? report.totals?.decisionOwed),
    verification_owed_n: safe(report.fullTotals?.verificationOwed ?? report.totals?.verificationOwed),
    release_owed_n: safe(report.fullTotals?.releaseOwed ?? report.totals?.releaseOwed),
    closed_n: safe(report.fullTotals?.closed ?? report.totals?.closed),
    privacy_floor: report.privacyFloor,
    complete: report.figuresComplete,
    blank_reason: '',
  };
  for (const key of ['cases_n', 'open_cases_n', 'full_containment_n', 'containment_unproven_n', 'authority_unresolved_n', 'decision_owed_n', 'verification_owed_n', 'release_owed_n', 'closed_n']) {
    if (summary[key] === null) suppressed.push(key);
  }
  if (suppressed.length) summary.blank_reason = `Below privacy floor ${report.privacyFloor}; withheld ${suppressed.join(', ')}.`;
  rows.push(summary);
  for (const key of QNC_STATE_KEYS) {
    const count = counts[key] ?? 0;
    const value = safe(count);
    rows.push({
      as_of: report.asOf,
      row_kind: 'state',
      state: key,
      cases_n: value,
      open_cases_n: '',
      full_containment_n: '',
      containment_unproven_n: '',
      authority_unresolved_n: '',
      decision_owed_n: '',
      verification_owed_n: '',
      release_owed_n: '',
      closed_n: '',
      privacy_floor: report.privacyFloor,
      complete: report.figuresComplete,
      blank_reason: value === null ? `Below privacy floor ${report.privacyFloor}; the state count is withheld, not zero.` : '',
    });
  }
  return rows;
}
