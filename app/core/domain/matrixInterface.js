/**
 * app/core/domain/matrixInterface.js — pure derived read model for the Matrix
 * Management-Interface Operating-Agreement Register (ADR-0162, Schema v131).
 *
 * Pure module: no storage, no clock globals, no DOM. Every state, date check,
 * joint-apex escalation path, coverage rate, and refusal is recomputed from
 * the live matrix graph (`buildMatrix`, `matrixAllocations`, `matrixJointApex`),
 * active `cadenceForums`, and append-only bilateral `matrixInterfaceAgreements`.
 */

import { dayKey, daysBetween } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixAllocations, matrixJointApex, matrixLineScope } from './matrix.js';
import { MATRIX_FLOORS } from './matrixRegistry.js';
import { activeSeat, buildSeats } from './seat.js';
import {
  MATRIX_INTERFACE_ENGINE_VERSION,
  MATRIX_INTERFACE_LIMITS,
  MATRIX_INTERFACE_STATES,
  consultationRuleMeta,
  interfaceStateMeta,
} from './matrixInterfaceRegistry.js';
import {
  canonicalPairKey,
  normalizeMatrixInterfaceAgreements,
  normalizeMatrixInterfaceSettings,
} from './matrixInterfaceSchema.js';

function personDisplayName(matrix, peopleById, id) {
  if (!id) return 'Unknown';
  if (id === LEADER_ID) {
    return matrix?.nodes?.get(LEADER_ID)?.name || 'Workspace Leader';
  }
  return matrix?.nodes?.get(id)?.name || peopleById.get(id)?.name || 'Former roster member';
}

function compareActs(a, b) {
  if (a.decidedOn !== b.decidedOn) return a.decidedOn < b.decidedOn ? -1 : 1;
  if (a.at !== b.at) return a.at < b.at ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function termsMatch(a, b) {
  if (!a || !b) return false;
  return (
    a.consultationRule === b.consultationRule
    && (a.forumId || null) === (b.forumId || null)
    && a.escalationSeatId === b.escalationSeatId
    && a.effectiveFrom === b.effectiveFrom
    && a.reviewByOn === b.reviewByOn
  );
}

function actSummary(act, names, forumById, redactProse) {
  if (!act) return null;
  const forum = act.forumId ? forumById.get(act.forumId) || null : null;
  const ruleMeta = consultationRuleMeta(act.consultationRule);
  return {
    id: act.id,
    actingSide: act.actingSide,
    actingManagerId: act.actingManagerId,
    actingManagerName: names.managerLabel(act.actingManagerId),
    outcome: act.outcome,
    consultationRule: act.consultationRule,
    consultationRuleLabel: ruleMeta?.label || act.consultationRule || '',
    effectiveFrom: act.effectiveFrom,
    reviewByOn: act.reviewByOn,
    forumId: act.forumId,
    forumName: forum?.title || forum?.name || (act.forumId ? 'Missing forum' : null),
    forumActive: Boolean(forum && forum.status === 'active'),
    escalationSeatId: act.escalationSeatId,
    escalationSeatName: names.seatLabel(act.escalationSeatId),
    basis: redactProse ? '' : act.basis,
    basisWithheld: redactProse && Boolean(act.basis),
    reason: redactProse ? '' : act.reason,
    decidedOn: act.decidedOn,
    decidedBySeatId: act.decidedBySeatId,
  };
}

function isDefectInCurrentWindow(defect, today) {
  if (!defect || typeof defect !== 'object') return false;
  if (defect.fromISO && defect.fromISO > today) return false;
  if (defect.toISO && defect.toISO < today) return false;
  return true;
}

function pairReachableBySeat(pair, seat, apex) {
  if (seat.fullAccess) return true;
  if (pair.managerAId === seat.id || pair.managerBId === seat.id) return true;
  for (const pid of pair.peopleIds) {
    if (seat.scope?.has?.(pid) || seat.lineScope?.has?.(pid)) return true;
  }
  if (apex?.unique && (apex.apexId === seat.id || seat.scope?.has?.(apex.apexId))) return true;
  if (!apex?.unique && Array.isArray(apex?.apexIds)) {
    if (apex.apexIds.some((id) => id === seat.id || seat.scope?.has?.(id))) return true;
  }
  return false;
}

/**
 * Pure read model for ADR-0162. Never mutates state.
 */
export function buildMatrixInterfaceReport(state, opts = {}) {
  const at = opts.now instanceof Date ? opts.now : new Date(opts.now || Date.now());
  const today = dayKey(at);
  const cfg = { ...(state?.settings || {}), ...(opts.settings || {}) };
  const conv = normalizeMatrixInterfaceSettings(cfg);
  const matrix = opts.matrix || buildMatrix(state, { now: at, settings: cfg });
  const allocations = opts.allocations || matrixAllocations(matrix);
  const lineScope = opts.lineScope || matrixLineScope(matrix);
  const builtSeats = opts.seats || buildSeats(state, { now: at, settings: cfg, lineScope: lineScope.byManager });
  const seat = opts.seat || activeSeat(builtSeats);

  const peopleById = new Map((state?.people || []).filter(Boolean).map((p) => [p.id, p]));
  const forumById = new Map((state?.cadenceForums || []).filter(Boolean).map((f) => [f.id, f]));
  const acts = normalizeMatrixInterfaceAgreements(state?.matrixInterfaceAgreements, []);

  // Collect deduplicated active unordered manager pairs across multi-line people.
  const pairAcc = new Map();
  const matrixPeopleSet = new Set();

  const allocList = Array.isArray(allocations) ? allocations : (allocations?.people || []);
  for (const alloc of allocList) {
    if (!alloc.multiLine) continue;
    matrixPeopleSet.add(alloc.personId);
    const managers = [...new Set((alloc.lines || []).map((l) => l.managerId).filter(Boolean))].sort();
    for (let i = 0; i < managers.length; i += 1) {
      for (let j = i + 1; j < managers.length; j += 1) {
        const pair = canonicalPairKey(managers[i], managers[j]);
        if (!pair) continue;
        let entry = pairAcc.get(pair.pairKey);
        if (!entry) {
          entry = {
            ...pair,
            peopleIds: new Set(),
            incompletePeopleIds: new Set(),
          };
          pairAcc.set(pair.pairKey, entry);
        }
        entry.peopleIds.add(alloc.personId);
        if (alloc.totalH === null) entry.incompletePeopleIds.add(alloc.personId);
      }
    }
  }

  // Count active-window reporting-line defects so partial/broken lines cannot
  // report a confident coverage rate.
  const activeDefects = (matrix.defects || []).filter((d) => isDefectInCurrentWindow(d, today));
  const invalidLineN = activeDefects.length;

  // Group normalized acts by canonical pairKey.
  const actsByPair = new Map();
  for (const act of acts) {
    if (!actsByPair.has(act.pairKey)) actsByPair.set(act.pairKey, []);
    actsByPair.get(act.pairKey).push(act);
  }
  for (const list of actsByPair.values()) list.sort(compareActs);

  const hidePeerNames = !seat.fullAccess && Number(seat.rank) >= MATRIX_FLOORS.detailRank;
  const redactProse = !seat.fullAccess && Number(seat.rank) >= MATRIX_FLOORS.detailRank;
  const names = {
    managerLabel: (id) => {
      if (!id) return 'Unknown';
      if (hidePeerNames && id !== seat.id) return 'Counterpart (outside detail ceiling)';
      return personDisplayName(matrix, peopleById, id);
    },
    seatLabel: (id) => {
      if (!id) return 'Unassigned';
      if (hidePeerNames && id !== seat.id) return 'Joint apex (outside detail ceiling)';
      return personDisplayName(matrix, peopleById, id);
    },
  };

  const allPairs = [];
  const scopedPairs = [];
  let outOfScopePairsN = 0;
  let futureDatedN = 0;

  for (const entry of pairAcc.values()) {
    const apex = matrixJointApex(matrix, [entry.managerAId, entry.managerBId]);
    const apexAncestors = apex.unique && apex.apexId
      ? (matrix.nodes?.get(apex.apexId)?.ancestors || new Set())
      : new Set();

    const pairActs = actsByPair.get(entry.pairKey) || [];
    let latestRetire = null;
    for (let i = pairActs.length - 1; i >= 0; i -= 1) {
      if (pairActs[i].outcome === 'retire') {
        latestRetire = pairActs[i];
        break;
      }
    }

    let liveA = null;
    let liveB = null;
    for (const act of pairActs) {
      if (act.outcome !== 'affirm') continue;
      if (latestRetire && compareActs(act, latestRetire) <= 0) continue;
      if (act.actingSide === 'a') liveA = act;
      else if (act.actingSide === 'b') liveB = act;
    }

    const inScope = pairReachableBySeat(entry, seat, apex);
    const hasIncompleteAllocation = entry.incompletePeopleIds.size > 0;
    const bothLive = Boolean(liveA && liveB);
    const matched = bothLive && termsMatch(liveA, liveB);
    const activeAgreement = matched ? liveA : null;

    // Validate live escalation owner against today's reporting DAG.
    const agreedEscalationId = activeAgreement?.escalationSeatId
      || liveA?.escalationSeatId
      || liveB?.escalationSeatId
      || null;
    const escalationReachable = Boolean(
      apex.unique
      && agreedEscalationId
      && (agreedEscalationId === apex.apexId || apexAncestors.has(agreedEscalationId)),
    );
    const escalationStale = Boolean(matched && apex.unique && !escalationReachable);

    // Validate linked forum against live cadenceForums (if named).
    const activeForumId = activeAgreement?.forumId || null;
    const activeForum = activeForumId ? forumById.get(activeForumId) || null : null;
    const forumAvailable = !activeForumId || Boolean(activeForum && activeForum.status === 'active');

    let stateKey = 'unagreed';
    let stateDetail = '';
    let futureDated = false;
    let dueSoon = false;
    let daysUntilReview = null;
    let overdueDays = null;

    if (!apex.unique || escalationStale) {
      stateKey = 'structurally-unresolvable';
      if (apex.ambiguous) {
        stateDetail = `Diamond tie across ${apex.apexIds.length} minimal joint ancestors in the live DAG; no single apex can be assumed.`;
      } else if (apex.disconnected) {
        stateDetail = 'No common ancestor connects both counterpart managers in the live reporting DAG.';
      } else {
        stateDetail = 'Structure shifted since terms were signed: named escalation owner no longer sits at or above the live joint apex.';
      }
    } else if (bothLive && !matched) {
      stateKey = 'contested-terms';
      stateDetail = 'Both counterpart managers signed live acts whose terms diverge (rule, forum, escalation owner, or dates).';
    } else if (matched && !forumAvailable) {
      stateKey = 'forum-unavailable';
      stateDetail = 'The agreed interface names a cadence forum that is missing or retired.';
    } else if (matched && activeAgreement.effectiveFrom > today) {
      stateKey = 'unagreed';
      futureDated = true;
      futureDatedN += 1;
      stateDetail = `Bilateral terms start ${activeAgreement.effectiveFrom}; not yet in force on ${today}.`;
    } else if (matched && activeAgreement.reviewByOn < today) {
      stateKey = 'expired';
      overdueDays = daysBetween(activeAgreement.reviewByOn, today);
      stateDetail = `Review deadline ${activeAgreement.reviewByOn} passed ${overdueDays} day(s) ago; never auto-renewed.`;
    } else if (matched) {
      stateKey = 'current';
      daysUntilReview = daysBetween(today, activeAgreement.reviewByOn);
      dueSoon = daysUntilReview <= conv.matrixInterfaceDueWarnDays;
      stateDetail = dueSoon
        ? `Current through ${activeAgreement.reviewByOn} (review due in ${daysUntilReview} day(s)).`
        : `Current through ${activeAgreement.reviewByOn} (${daysUntilReview} day(s) remaining).`;
    } else if (liveA || liveB) {
      stateKey = 'one-sided';
      const signerSide = liveA ? 'A' : 'B';
      stateDetail = `Counterpart ${signerSide} signed terms; awaiting matching confirmation from the other manager.`;
    } else if (latestRetire) {
      stateKey = 'unagreed';
      stateDetail = `Prior agreement retired on ${latestRetire.decidedOn}; no live agreement in force.`;
    } else {
      stateKey = 'unagreed';
      stateDetail = 'No operating agreement has been recorded between these counterpart managers.';
    }

    const meta = interfaceStateMeta(stateKey);
    const row = {
      pairKey: entry.pairKey,
      managerAId: entry.managerAId,
      managerBId: entry.managerBId,
      managerAName: names.managerLabel(entry.managerAId),
      managerBName: names.managerLabel(entry.managerBId),
      managerAWithheld: hidePeerNames && entry.managerAId !== seat.id,
      managerBWithheld: hidePeerNames && entry.managerBId !== seat.id,
      sharedPeopleN: entry.peopleIds.size,
      incompletePeopleN: entry.incompletePeopleIds.size,
      hasIncompleteAllocation,
      state: stateKey,
      stateLabel: meta.label,
      stateTone: meta.tone,
      severity: meta.severity,
      stateDetail,
      futureDated,
      dueSoon,
      daysUntilReview,
      overdueDays,
      apex: {
        unique: apex.unique,
        ambiguous: apex.ambiguous,
        disconnected: apex.disconnected,
        apexId: apex.apexId || null,
        apexName: apex.unique && apex.apexId ? names.seatLabel(apex.apexId) : null,
        apexIds: [...(apex.apexIds || [])],
        apexLabel: apex.unique && apex.apexId
          ? names.seatLabel(apex.apexId)
          : apex.ambiguous
            ? `Tie across ${apex.apexIds.length} minimal ancestors`
            : 'Disconnected',
        escalationSeatIds: apex.unique && apex.apexId ? [apex.apexId, ...apexAncestors] : [],
      },
      escalationStale,
      liveA: actSummary(liveA, names, forumById, redactProse),
      liveB: actSummary(liveB, names, forumById, redactProse),
      latestRetire: actSummary(latestRetire, names, forumById, redactProse),
      agreed: activeAgreement ? actSummary(activeAgreement, names, forumById, redactProse) : null,
      actCount: pairActs.length,
      canAffirm: Boolean(
        !seat.readOnly
        && apex.unique
        && (seat.fullAccess || seat.id === entry.managerAId || seat.id === entry.managerBId),
      ),
      canRetire: Boolean(
        !seat.readOnly
        && (liveA || liveB)
        && (seat.fullAccess
          || seat.id === entry.managerAId
          || seat.id === entry.managerBId
          || (apex.unique && seat.id === apex.apexId)),
      ),
    };

    allPairs.push(row);
    if (inScope) scopedPairs.push(row);
    else outOfScopePairsN += 1;
  }

  // Deterministic severity-first sort: worst state first, then shared people desc, then pairKey asc.
  const sortRows = (rows) => rows.sort((x, y) => {
    if (x.severity !== y.severity) return x.severity - y.severity;
    if (x.dueSoon !== y.dueSoon) return x.dueSoon ? -1 : 1;
    if (y.sharedPeopleN !== x.sharedPeopleN) return y.sharedPeopleN - x.sharedPeopleN;
    return x.pairKey < y.pairKey ? -1 : x.pairKey > y.pairKey ? 1 : 0;
  });
  sortRows(allPairs);
  sortRows(scopedPairs);

  // Aggregate counts over scopedPairs
  const counts = Object.fromEntries(MATRIX_INTERFACE_STATES.map((s) => [s.key, 0]));
  let dueSoonN = 0;
  let incompletePairsN = 0;
  for (const row of scopedPairs) {
    counts[row.state] = (counts[row.state] || 0) + 1;
    if (row.dueSoon) dueSoonN += 1;
    if (row.hasIncompleteAllocation) incompletePairsN += 1;
  }

  const allPairsN = scopedPairs.length;
  const coveredN = counts.current || 0;
  const uncoveredN = allPairsN - coveredN;
  const statesSum = MATRIX_INTERFACE_STATES.reduce((acc, s) => acc + (counts[s.key] || 0), 0);
  const statesReconcile = statesSum === allPairsN && (coveredN + uncoveredN === allPairsN);

  const isMatrix = matrix.isMatrix || allPairs.length > 0 || invalidLineN > 0;
  let coverageWithheldReason = '';
  if (!isMatrix || allPairsN === 0) {
    coverageWithheldReason = allPairs.length === 0
      ? 'No active counterpart manager pairs exist in this workspace.'
      : 'No counterpart manager pairs fall within this operating seat’s span.';
  } else if (invalidLineN > 0) {
    coverageWithheldReason = `${invalidLineN} active reporting-line defect(s) prevent proving complete pair coverage; coverage rate is withheld rather than computed on a partial graph.`;
  } else if (allPairsN < MATRIX_FLOORS.cellN) {
    coverageWithheldReason = `Active pair count (${allPairsN}) sits below the small-cell disclosure floor (${MATRIX_FLOORS.cellN}); coverage rate is withheld.`;
  }

  const coverageWithheld = Boolean(coverageWithheldReason);
  const coveragePct = coverageWithheld
    ? null
    : Math.round((coveredN / allPairsN) * 1000) / 10;

  // Joint-apex escalation roll-up across unresolved pairs (never collapsing diamond ties).
  const apexBuckets = new Map();
  for (const row of scopedPairs) {
    if (row.state === 'current') continue;
    const key = row.apex.unique
      ? `unique|${row.apex.apexId}`
      : row.apex.ambiguous
        ? `tie|${row.apex.apexIds.join(',')}`
        : 'disconnected';
    let b = apexBuckets.get(key);
    if (!b) {
      b = {
        key,
        apexKind: row.apex.unique ? 'unique' : row.apex.ambiguous ? 'ambiguous-tie' : 'disconnected',
        apexId: row.apex.apexId,
        apexLabel: row.apex.apexLabel,
        ambiguous: row.apex.ambiguous,
        disconnected: row.apex.disconnected,
        unresolvedPairsN: 0,
        sharedPeopleSet: new Set(),
      };
      apexBuckets.set(key, b);
    }
    b.unresolvedPairsN += 1;
    // Shared people count on unresolved pairs scoped via matrix allocations (deduplicated per bucket)
    const acc = pairAcc.get(row.pairKey);
    if (acc) {
      for (const pid of acc.peopleIds) b.sharedPeopleSet.add(pid);
    }
  }
  const apexRollups = [...apexBuckets.values()]
    .map((b) => ({
      key: b.key,
      apexKind: b.apexKind,
      apexId: b.apexId,
      apexLabel: b.apexLabel,
      ambiguous: b.ambiguous,
      disconnected: b.disconnected,
      unresolvedPairsN: b.unresolvedPairsN,
      sharedPeopleN: b.sharedPeopleSet.size,
    }))
    .sort((a, b) => b.unresolvedPairsN - a.unresolvedPairsN || (a.key < b.key ? -1 : 1));

  const visiblePairs = scopedPairs.slice(0, MATRIX_INTERFACE_LIMITS.rows);
  const rowsOmittedN = Math.max(0, scopedPairs.length - visiblePairs.length);

  return {
    engineVersion: MATRIX_INTERFACE_ENGINE_VERSION,
    today,
    isMatrix,
    singleChainNote: !isMatrix
      ? 'This workspace declares no active additional reporting lines. Management-interface operating agreements activate only where a shared person couples two or more manager spans.'
      : '',
    seat: {
      id: seat.id,
      name: seat.name,
      label: seat.label,
      rank: seat.rank,
      fullAccess: Boolean(seat.fullAccess),
      readOnly: Boolean(seat.readOnly),
    },
    conventions: {
      ...conv,
      cellFloor: MATRIX_FLOORS.cellN,
      detailRank: MATRIX_FLOORS.detailRank,
      rowsCap: MATRIX_INTERFACE_LIMITS.rows,
    },
    board: {
      allPairsN,
      currentN: counts.current || 0,
      oneSidedN: counts['one-sided'] || 0,
      contestedTermsN: counts['contested-terms'] || 0,
      forumUnavailableN: counts['forum-unavailable'] || 0,
      expiredN: counts.expired || 0,
      unagreedN: counts.unagreed || 0,
      unresolvableN: counts['structurally-unresolvable'] || 0,
      dueSoonN,
      futureDatedN,
      coveredN,
      uncoveredN,
      coveragePct,
      coverageWithheld,
      coverageWithheldReason,
      invalidLineN,
      incompletePairsN,
      outOfScopePairsN,
      statesReconcile,
      rowsOmittedN,
      matrixPeopleN: matrixPeopleSet.size,
    },
    pairs: visiblePairs,
    allScopedPairs: scopedPairs,
    allPairs,
    apexRollups,
  };
}

export function matrixInterfaceCandidates(state, opts = {}) {
  const report = buildMatrixInterfaceReport(state, opts);
  const at = opts.now instanceof Date ? opts.now : new Date(opts.now || Date.now());
  const cfg = { ...(state?.settings || {}), ...(opts.settings || {}) };
  const matrix = opts.matrix || buildMatrix(state, { now: at, settings: cfg });
  const peopleById = new Map((state?.people || []).filter(Boolean).map((p) => [p.id, p]));
  const hidePeerNames = !report.seat.fullAccess && Number(report.seat.rank) >= MATRIX_FLOORS.detailRank;

  const activeForums = (state?.cadenceForums || [])
    .filter((f) => f && f.status === 'active')
    .map((f) => ({ id: f.id, name: f.name, cadence: f.cadence || '', kind: f.kind || '' }));

  const pairs = report.allScopedPairs.map((pair) => {
    const escalationOptions = (pair.apex.escalationSeatIds || []).map((id) => ({
      seatId: id,
      label: hidePeerNames && id !== report.seat.id
        ? 'Joint escalation ancestor (outside detail ceiling)'
        : personDisplayName(matrix, peopleById, id),
    }));
    return {
      pairKey: pair.pairKey,
      managerAId: pair.managerAId,
      managerBId: pair.managerBId,
      managerAName: pair.managerAName,
      managerBName: pair.managerBName,
      state: pair.state,
      stateLabel: pair.stateLabel,
      canAffirm: pair.canAffirm,
      canRetire: pair.canRetire,
      apex: pair.apex,
      escalationOptions,
      liveA: pair.liveA,
      liveB: pair.liveB,
    };
  });

  return {
    today: report.today,
    seat: report.seat,
    conventions: report.conventions,
    pairs,
    forums: activeForums,
  };
}

/**
 * Identity-free brief: never carries any person name, manager name, forum
 * title, escalation owner name, or prose basis/reason.
 */
export function matrixInterfaceBriefText(report) {
  const b = report.board;
  if (!report.isMatrix) {
    return [
      `Matrix management interfaces (${report.today}, ${report.seat.label})`,
      'No active multi-line counterpart interfaces in this workspace (single-chain mode).',
    ].join('\n');
  }
  const coverageLine = b.coverageWithheld
    ? `Coverage rate: withheld (${b.coverageWithheldReason})`
    : `Coverage rate: ${b.coveragePct}% (${b.coveredN} of ${b.allPairsN} active counterpart pairs current)`;
  return [
    `Matrix management interfaces (${report.today}, ${report.seat.label})`,
    `Active deduplicated counterpart pairs in span: ${b.allPairsN} (across ${b.matrixPeopleN} multi-line people; ${b.outOfScopePairsN} outside seat)`,
    `Current: ${b.currentN} (due soon: ${b.dueSoonN}) · One-sided: ${b.oneSidedN} · Terms diverge: ${b.contestedTermsN} · Forum unavailable: ${b.forumUnavailableN} · Expired: ${b.expiredN} · Unagreed: ${b.unagreedN} · Structurally unresolvable: ${b.unresolvableN}`,
    coverageLine,
    `State totals reconcile: ${b.statesReconcile ? 'verified' : 'NOT verified'}`,
  ].join('\n');
}

/**
 * Aggregate-only CSV rows (scope #122). Never names a person, manager,
 * forum, escalation seat, or free-text field.
 */
export function matrixInterfaceCsvRows(report) {
  const b = report.board;
  const rows = [
    {
      row_kind: 'workspace',
      scope: report.seat.label || 'workspace',
      as_of: report.today,
      all_pairs_n: b.allPairsN,
      current_n: b.currentN,
      one_sided_n: b.oneSidedN,
      contested_terms_n: b.contestedTermsN,
      forum_unavailable_n: b.forumUnavailableN,
      expired_n: b.expiredN,
      unagreed_n: b.unagreedN,
      unresolvable_n: b.unresolvableN,
      due_soon_n: b.dueSoonN,
      covered_n: b.coveredN,
      uncovered_n: b.uncoveredN,
      coverage_pct: b.coverageWithheld ? '' : b.coveragePct,
      coverage_withheld: b.coverageWithheld,
      coverage_withheld_reason: b.coverageWithheldReason,
      invalid_line_n: b.invalidLineN,
      incomplete_pairs_n: b.incompletePairsN,
      cell_floor: report.conventions.cellFloor,
      default_term_days: report.conventions.matrixInterfaceDefaultTermDays,
      due_warn_days: report.conventions.matrixInterfaceDueWarnDays,
      states_reconcile: b.statesReconcile,
      shared_people_n: b.matrixPeopleN,
      apex_kind: '',
      apex_ambiguous: false,
      unresolved_pairs_n: b.uncoveredN,
    },
  ];
  for (const bucket of report.apexRollups || []) {
    rows.push({
      row_kind: 'escalation-bucket',
      scope: report.seat.label || 'workspace',
      as_of: report.today,
      all_pairs_n: '',
      current_n: '',
      one_sided_n: '',
      contested_terms_n: '',
      forum_unavailable_n: '',
      expired_n: '',
      unagreed_n: '',
      unresolvable_n: '',
      due_soon_n: '',
      covered_n: '',
      uncovered_n: '',
      coverage_pct: '',
      coverage_withheld: '',
      coverage_withheld_reason: '',
      invalid_line_n: '',
      incomplete_pairs_n: '',
      cell_floor: report.conventions.cellFloor,
      default_term_days: report.conventions.matrixInterfaceDefaultTermDays,
      due_warn_days: report.conventions.matrixInterfaceDueWarnDays,
      states_reconcile: '',
      shared_people_n: bucket.sharedPeopleN,
      apex_kind: bucket.apexKind,
      apex_ambiguous: bucket.ambiguous,
      unresolved_pairs_n: bucket.unresolvedPairsN,
    });
  }
  return rows;
}

export function matrixInterfaceAttentionCount(state, opts = {}) {
  const report = buildMatrixInterfaceReport(state, opts);
  if (!report.isMatrix) return 0;
  return report.board.uncoveredN;
}
