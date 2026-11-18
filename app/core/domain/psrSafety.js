/**
 * app/core/domain/psrSafety.js — the ONE pure reader of the Pre-Startup Safety
 * Review & Commissioning Readiness Register (ADR-0258, Schema v210,
 * `#/pre-startup`).
 *
 * Every state, punch-item posture, governing discipline verdict, readiness
 * count, joint-apex startup authority, unsafe-startup breach, temporary-change
 * countdown, single-identity matrix roll-up, reconciliation check and signal is
 * derived here on read from declared source ledgers and the injected clock.
 * Nothing derived is ever persisted.
 */

import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import {
  PSR_BREACH_LABELS,
  PSR_DISCIPLINE_BY_KEY,
  PSR_DISCIPLINE_KEYS,
  PSR_ENGINE_VERSION,
  PSR_HREF,
  PSR_PUNCH_CATEGORY_BY_KEY,
  PSR_STATE_BY_KEY,
  PSR_STATE_KEYS,
  PSR_TRIGGER_BY_KEY,
  PSR_TRIGGER_KEYS,
} from './psrRegistry.js';
import {
  normalizePsrAuthorisations,
  normalizePsrMarkers,
  normalizePsrPunchItems,
  normalizePsrReadiness,
  normalizePsrReviews,
  normalizePsrSettings,
  normalizePsrSignoffs,
  normalizePsrStartups,
} from './psrSchema.js';
import { instantMs, wholeDaysBetween } from './psrMath.js';

const list = (value) => (Array.isArray(value) ? value : []);

/** Human-readable name for a hand; the raw id `leader` never prints as an id. */
export function psrPersonLabel(matrix, personId) {
  if (personId === LEADER_ID) return 'Workspace leader';
  const node = matrix?.nodes?.get?.(personId);
  if (node?.name) return node.name;
  const person = matrix?.roster?.get?.(personId);
  return person?.name || personId;
}

/**
 * Every ACTIVE reporting line holding `personId`, taken from the ONE canonical
 * matrix engine (`buildMatrix`), sorted deterministically.
 */
export function psrActiveLinesFor(matrix, personId) {
  if (!personId || personId === LEADER_ID) return [];
  const lines = matrix?.linesByPerson?.get?.(personId) || [];
  return lines
    .filter((line) => line && line.active !== false && line.managerId && line.managerId !== personId)
    .map((line) => ({
      lineId: line.id || null,
      managerId: line.managerId,
      kind: line.kind || null,
      shareH: Number.isInteger(line.shareH) ? line.shareH : null,
    }))
    .sort((a, b) => String(a.managerId).localeCompare(String(b.managerId)) || String(a.kind || '').localeCompare(String(b.kind || '')));
}

/**
 * Compute the joint startup-authorisation apex above every active reporting
 * line holding the unit holder, the modification proposer, and every governing
 * independent discipline signer.
 *
 * Three matrix safeguards:
 *  1. If any core gate hand (`proposerId`, `unitHolderId`, or a governing
 *     non-leader signer) has NO active line on the reporting graph, line
 *     coverage is incomplete and no single `apexId` is certified for
 *     authorisation — the system never drops an invisible second line.
 *  2. If the proposer is among the candidate apexes, the graph steps strictly
 *     above the proposer; the proposer can NEVER be their own startup apex.
 *  3. If `matrixJointApex` returns multiple incomparable apexes (`ambiguous`),
 *     `apexAmbiguous` is `true` and `apexId` is `null` — no single manager is
 *     silently picked.
 */
export function psrRequiredApex(matrix, review, governingSigners = []) {
  if (!matrix || !review) {
    return {
      coreHandIds: [],
      missingLineHands: [],
      managerIds: [],
      apexIds: [],
      apexId: null,
      apexAmbiguous: false,
      incompleteLineCoverage: true,
      noApex: true,
    };
  }
  const coreSet = new Set([review.unitHolderId, review.proposerId, ...list(governingSigners)].filter(Boolean));
  const coreHandIds = [...coreSet].sort();
  const missingLineHands = [];
  const managerSet = new Set();

  for (const handId of coreHandIds) {
    if (handId === LEADER_ID) {
      managerSet.add(LEADER_ID);
      continue;
    }
    const lines = psrActiveLinesFor(matrix, handId);
    if (!lines.length) {
      missingLineHands.push(handId);
      continue;
    }
    for (const line of lines) managerSet.add(line.managerId);
  }

  // Ensure the proposer's own managers sit in the target set if proposer appeared as a manager.
  if (review.proposerId && managerSet.has(review.proposerId)) {
    managerSet.delete(review.proposerId);
    const proposerLines = psrActiveLinesFor(matrix, review.proposerId);
    if (!proposerLines.length) {
      if (!missingLineHands.includes(review.proposerId)) missingLineHands.push(review.proposerId);
    } else {
      for (const line of proposerLines) managerSet.add(line.managerId);
    }
  }

  const managerIds = [...managerSet].sort();
  const rawApex = managerIds.length ? matrixJointApex(matrix, managerIds) : null;
  const candidateApexIds = list(rawApex?.apexIds).filter((id) => id && id !== review.proposerId);
  const ambiguous = Boolean(rawApex?.ambiguous) || candidateApexIds.length > 1;
  const incompleteLineCoverage = missingLineHands.length > 0;
  const uniqueApexId = !incompleteLineCoverage && !ambiguous && candidateApexIds.length === 1
    ? candidateApexIds[0]
    : null;

  return {
    coreHandIds,
    missingLineHands: missingLineHands.sort(),
    managerIds,
    // Rule-addressable seats (even when one hand was orphaned, if the remaining graph has an apex we report separately).
    apexIds: candidateApexIds,
    apexId: uniqueApexId,
    apexAmbiguous: ambiguous,
    incompleteLineCoverage,
    noApex: candidateApexIds.length === 0,
  };
}

/**
 * Pure per-review derivation kernel. Exported so tests can verify every single
 * state transition, disqualification, breach code and countdown without a store.
 */
export function derivePsrReview({
  review,
  punchItems = [],
  signoffs = [],
  readiness = [],
  authorisations = [],
  startup = null,
  matrix = null,
  todayDay,
  revertHorizonDays = 14,
}) {
  const triggerDef = PSR_TRIGGER_BY_KEY[review.triggerKind] || null;
  const isTemporary = Boolean(triggerDef?.temporary);
  const flags = [];
  const addFlag = (flag) => { if (!flags.includes(flag)) flags.push(flag); };

  if (review.proposerId === review.unitHolderId) {
    addFlag('proposer-is-unit-holder');
  }

  /* 1. Punch items: Category A (pre-startup) vs Category B (post-startup). */
  const evaluatedPunch = [...list(punchItems)]
    .sort((a, b) => String(a.category).localeCompare(String(b.category)) || String(a.itemRef).localeCompare(String(b.itemRef)))
    .map((item) => {
      const hasClosure = Boolean(item.closedDay && item.closedAt && item.closedById);
      let closureDisqualifiedReason = null;
      if (hasClosure && item.category === 'pre-startup') {
        if (item.closedById === review.proposerId) {
          closureDisqualifiedReason = 'proposer-closed-blocker';
          addFlag('unverified-self-closure');
        } else if (item.closedById === item.ownerId) {
          closureDisqualifiedReason = 'owner-self-closed-blocker';
          addFlag('unverified-self-closure');
        }
      }
      const verifiedClosed = hasClosure && !closureDisqualifiedReason;
      const daysToDue = !verifiedClosed && item.dueDay && todayDay
        ? wholeDaysBetween(todayDay, item.dueDay)
        : null;
      const overdueDays = daysToDue !== null && daysToDue < 0 ? -daysToDue : null;
      return {
        ...item,
        categoryDef: PSR_PUNCH_CATEGORY_BY_KEY[item.category] || null,
        disciplineDef: PSR_DISCIPLINE_BY_KEY[item.discipline] || null,
        hasClosure,
        verifiedClosed,
        closureDisqualifiedReason,
        daysToDue,
        overdueDays,
        overdue: overdueDays !== null && overdueDays > 0,
      };
    });

  const catAItems = evaluatedPunch.filter((i) => i.category === 'pre-startup');
  const catBItems = evaluatedPunch.filter((i) => i.category === 'post-startup');
  const openCatA = catAItems.filter((i) => !i.verifiedClosed);
  const closedCatA = catAItems.filter((i) => i.verifiedClosed);
  const openCatB = catBItems.filter((i) => !i.verifiedClosed);
  const closedCatB = catBItems.filter((i) => i.verifiedClosed);
  const overdueCatB = openCatB.filter((i) => i.overdue);
  const maxPostOverdueDays = overdueCatB.length
    ? Math.max(...overdueCatB.map((i) => i.overdueDays || 0))
    : null;

  /* 2. Discipline sign-offs: proposer disqualified; latest valid per discipline governs. */
  const sortedSignoffs = [...list(signoffs)].sort((a, b) => {
    const am = instantMs(a.signedAt) ?? 0;
    const bm = instantMs(b.signedAt) ?? 0;
    if (am !== bm) return am - bm;
    return String(a.id).localeCompare(String(b.id));
  });
  const evaluatedSignoffs = sortedSignoffs.map((row) => {
    const disqualifiedReason = row.signedById === review.proposerId ? 'proposer-signed-discipline' : null;
    if (disqualifiedReason) addFlag('proposer-signed-discipline');
    return {
      ...row,
      disciplineDef: PSR_DISCIPLINE_BY_KEY[row.discipline] || null,
      valid: !disqualifiedReason,
      disqualifiedReason,
    };
  });

  const latestValidByDiscipline = new Map();
  for (const row of evaluatedSignoffs) {
    if (row.valid) latestValidByDiscipline.set(row.discipline, row);
  }

  const gateRows = review.requiredDisciplines.map((discipline) => {
    const governing = latestValidByDiscipline.get(discipline) || null;
    const status = governing ? governing.verdict : 'unsigned';
    return {
      discipline,
      label: PSR_DISCIPLINE_BY_KEY[discipline]?.label || discipline,
      status,
      governing,
    };
  });
  const clearedDisciplines = gateRows.filter((g) => g.status === 'cleared').map((g) => g.discipline);
  const rejectedDisciplines = gateRows.filter((g) => g.status === 'rejected').map((g) => g.discipline);
  const missingDisciplines = gateRows.filter((g) => g.status === 'unsigned').map((g) => g.discipline);
  const governingSigners = gateRows
    .map((g) => g.governing?.signedById || null)
    .filter(Boolean);

  /* 3. Operator readiness: self-attestation and proposer attestation disqualified. */
  const readinessByOperator = new Map();
  const evaluatedReadiness = [...list(readiness)]
    .sort((a, b) => String(a.operatorId).localeCompare(String(b.operatorId)))
    .map((row) => {
      let disqualifiedReason = null;
      if (row.attestedById === row.operatorId) {
        disqualifiedReason = 'operator-self-attested';
        addFlag('invalid-readiness-attestation');
      } else if (row.attestedById === review.proposerId) {
        disqualifiedReason = 'proposer-attested-readiness';
        addFlag('invalid-readiness-attestation');
      }
      const item = { ...row, valid: !disqualifiedReason, disqualifiedReason };
      readinessByOperator.set(row.operatorId, item);
      return item;
    });

  const operatorRows = review.affectedOperatorIds.map((operatorId) => {
    const attestation = readinessByOperator.get(operatorId) || null;
    return {
      operatorId,
      attested: Boolean(attestation?.valid),
      attestation,
    };
  });
  const briefedOperators = operatorRows.filter((o) => o.attested).map((o) => o.operatorId);
  const unbriefedOperators = operatorRows.filter((o) => !o.attested).map((o) => o.operatorId);

  /* 4. Required joint startup apex from the live matrix. */
  const apexInfo = psrRequiredApex(matrix, review, governingSigners);

  /* 5. Startup authorisation: latest row examined against gates, chronology & live apex. */
  const sortedAuths = [...list(authorisations)].sort((a, b) => {
    const am = instantMs(a.authorisedAt) ?? 0;
    const bm = instantMs(b.authorisedAt) ?? 0;
    if (am !== bm) return am - bm;
    return String(a.id).localeCompare(String(b.id));
  });
  const authorisation = sortedAuths.length ? sortedAuths[sortedAuths.length - 1] : null;
  const authorisationInvalidReasons = [];
  if (authorisation) {
    const authMs = instantMs(authorisation.authorisedAt);
    if (review.proposerId === review.unitHolderId) {
      authorisationInvalidReasons.push('proposer-is-unit-holder');
    }
    if (authorisation.authorisedById === review.proposerId) {
      authorisationInvalidReasons.push('authorised-by-proposer');
    }
    if (!apexInfo.apexId || authorisation.authorisedById !== apexInfo.apexId) {
      authorisationInvalidReasons.push('authorised-outside-joint-apex');
    }
    if (openCatA.length > 0) {
      authorisationInvalidReasons.push('authorised-with-open-blockers');
    }
    if (rejectedDisciplines.length > 0) {
      authorisationInvalidReasons.push('authorised-with-rejected-gate');
    }
    if (missingDisciplines.length > 0) {
      authorisationInvalidReasons.push('authorised-with-missing-disciplines');
    }
    if (unbriefedOperators.length > 0) {
      authorisationInvalidReasons.push('authorised-with-unbriefed-operators');
    }
    // Chronological integrity: every Category A closure, governing clearance and
    // operator briefing must exist at or before the authorisation instant.
    if (authMs !== null) {
      const lateCatA = closedCatA.some((i) => {
        const cm = instantMs(i.closedAt);
        return cm !== null && cm > authMs;
      });
      const lateGate = gateRows.some((g) => {
        const sm = g.governing ? instantMs(g.governing.signedAt) : null;
        return sm !== null && sm > authMs;
      });
      const lateBrief = operatorRows.some((o) => {
        const bm = o.attestation?.valid ? instantMs(o.attestation.attestedAt) : null;
        return bm !== null && bm > authMs;
      });
      if (lateCatA || lateGate || lateBrief) {
        authorisationInvalidReasons.push('gate-completed-after-authorisation');
      }
    }
    if (authorisationInvalidReasons.length) addFlag('authorisation-invalid');
  }
  const authorisationValid = Boolean(authorisation && authorisationInvalidReasons.length === 0);

  /* 6. Physical startup / energisation & temporary-change reversal clocks. */
  const breaches = [];
  const addBreach = (code) => { if (!breaches.includes(code)) breaches.push(code); };
  let daysToRevert = null;
  let revertOverdueDays = null;
  const restored = Boolean(startup?.restoredDay && startup?.restoredAt);
  if (restored) addFlag('restored');

  if (startup) {
    const startMs = instantMs(startup.energisedAt);
    if (!authorisation) {
      addBreach('energised-without-authorisation');
    } else {
      const authMs = instantMs(authorisation.authorisedAt);
      if (startMs !== null && authMs !== null && startMs < authMs) {
        addBreach('energised-before-authorisation');
      }
      if (!authorisationValid) {
        addBreach('energised-on-invalid-authorisation');
      }
    }
    if (openCatA.length > 0) addBreach('energised-with-open-blockers');
    if (rejectedDisciplines.length > 0) addBreach('energised-with-rejected-gate');
    if (missingDisciplines.length > 0) addBreach('energised-with-missing-disciplines');
    if (unbriefedOperators.length > 0) addBreach('energised-with-unbriefed-operators');
    // Also detect backfilled closure/signoff/briefing performed AFTER energisation.
    if (startMs !== null) {
      if (closedCatA.some((i) => (instantMs(i.closedAt) ?? 0) > startMs)) {
        addBreach('energised-with-open-blockers');
      }
      if (gateRows.some((g) => g.governing && (instantMs(g.governing.signedAt) ?? 0) > startMs)) {
        addBreach('energised-with-missing-disciplines');
      }
      if (operatorRows.some((o) => o.attestation?.valid && (instantMs(o.attestation.attestedAt) ?? 0) > startMs)) {
        addBreach('energised-with-unbriefed-operators');
      }
    }

    if (isTemporary && review.revertByDay && !restored && todayDay) {
      daysToRevert = wholeDaysBetween(todayDay, review.revertByDay);
      if (daysToRevert !== null && daysToRevert < 0) {
        revertOverdueDays = -daysToRevert;
      } else if (daysToRevert !== null && daysToRevert <= revertHorizonDays) {
        addFlag('temporary-expiring');
      }
    }
  } else if (todayDay && review.plannedStartDay) {
    const toPlanned = wholeDaysBetween(todayDay, review.plannedStartDay);
    if (toPlanned !== null && toPlanned < 0) {
      addFlag('startup-past-planned');
    }
  }

  /* 7. Ten-state mutually exclusive partition. */
  let stateKey;
  if (startup) {
    if (breaches.length > 0) {
      stateKey = 'breach-energised-unsafe';
    } else if (isTemporary && !restored && revertOverdueDays !== null && revertOverdueDays > 0) {
      stateKey = 'temporary-expired-live';
    } else if (overdueCatB.length > 0) {
      stateKey = 'live-post-startup-overdue';
    } else if ((isTemporary && !restored) || openCatB.length > 0) {
      stateKey = 'live-conditions-open';
    } else {
      stateKey = 'closed-verified';
    }
  } else if (rejectedDisciplines.length > 0) {
    stateKey = 'gate-rejected';
  } else if (openCatA.length > 0) {
    stateKey = 'blocked-pre-startup';
  } else if (missingDisciplines.length > 0 || unbriefedOperators.length > 0) {
    stateKey = 'awaiting-verification';
  } else if (authorisationValid) {
    stateKey = 'authorised-awaiting-startup';
  } else {
    stateKey = 'ready-for-authorisation';
  }

  const state = PSR_STATE_BY_KEY[stateKey];
  const temporaryExpiring = flags.includes('temporary-expiring');

  return {
    state,
    triggerDef,
    isTemporary,
    punchItems: evaluatedPunch,
    catAItems,
    catBItems,
    openCatAN: openCatA.length,
    closedCatAN: closedCatA.length,
    openCatBN: openCatB.length,
    closedCatBN: closedCatB.length,
    overdueCatBN: overdueCatB.length,
    maxPostOverdueDays,
    signoffs: evaluatedSignoffs,
    gateRows,
    clearedDisciplines,
    rejectedDisciplines,
    missingDisciplines,
    governingSigners,
    readiness: evaluatedReadiness,
    operatorRows,
    briefedOperators,
    unbriefedOperators,
    authorisations: sortedAuths,
    authorisation,
    authorisationValid,
    authorisationInvalidReasons,
    startup: startup || null,
    restored,
    daysToRevert,
    revertOverdueDays,
    temporaryExpiring,
    breaches,
    breachLabels: breaches.map((code) => PSR_BREACH_LABELS[code] || code),
    flags,
    apexInfo,
    apexIds: apexInfo.apexIds,
    apexId: apexInfo.apexId,
    apexAmbiguous: apexInfo.apexAmbiguous,
    incompleteLineCoverage: apexInfo.incompleteLineCoverage,
    noApex: apexInfo.noApex,
  };
}

/**
 * Determine whether an active seat holds `personId` through either its home
 * hierarchy span (`seat.scope`), its active declared matrix line scope
 * (`seat.lineScope`), direct self identity, or live matrix ancestry.
 */
export function psrSeatHoldsPerson(seat, matrix, personId) {
  if (!personId) return false;
  if (!seat || seat.fullAccess) return true;
  const seatId = seat.nodeId || seat.id || null;
  if (!seatId) return false;
  if (personId === seatId) return true;
  if (seat.scope?.has?.(personId)) return true;
  if (seat.lineScope?.has?.(personId)) return true;
  const node = matrix?.nodes?.get?.(personId);
  if (node?.ancestors?.has?.(seatId)) return true;
  return false;
}

/**
 * Determine whether a review row falls inside `seat`'s active reporting reach.
 * A person reached through two active lines still includes the review ONCE; an
 * expired secondary line and a peer span never grant access.
 */
export function psrRowInReach(seat, matrix, row) {
  if (!seat || seat.fullAccess) return true;
  const seatId = seat.nodeId || seat.id || null;
  if (!seatId) return false;
  if (row.apexId === seatId || row.apexIds.includes(seatId)) return true;
  for (const personId of row.involvedPersonIds) {
    if (psrSeatHoldsPerson(seat, matrix, personId)) return true;
  }
  return false;
}

/**
 * Build the complete Pre-Startup Safety Review report from workspace state and
 * injected clock. Scopes rows to `seat` when supplied; never mutates `state`.
 */
export function buildPreStartupSafety(state, { now = new Date(), settings = null, seat = null } = {}) {
  const warnings = [];
  const at = now instanceof Date ? now : new Date(now);
  const asOf = dayKey(at) || at.toISOString().slice(0, 10);
  const cfg = { ...(state?.settings || {}), ...(settings || {}) };
  const conventions = normalizePsrSettings(cfg);

  const allReviews = normalizePsrReviews(state?.psrReviews, warnings);
  const allPunch = normalizePsrPunchItems(state?.psrPunchItems, allReviews, warnings);
  const allSignoffs = normalizePsrSignoffs(state?.psrSignoffs, allReviews, warnings);
  const allReadiness = normalizePsrReadiness(state?.psrReadiness, allReviews, warnings);
  const allAuths = normalizePsrAuthorisations(state?.psrAuthorisations, allReviews, warnings);
  const allStartups = normalizePsrStartups(state?.psrStartups, allReviews, warnings);
  const markers = normalizePsrMarkers(state?.psrMarkers, warnings);

  const groupByReview = (items) => {
    const map = new Map();
    for (const item of items) {
      const bucket = map.get(item.reviewId) || [];
      bucket.push(item);
      map.set(item.reviewId, bucket);
    }
    return map;
  };
  const punchByReview = groupByReview(allPunch);
  const signoffsByReview = groupByReview(allSignoffs);
  const readinessByReview = groupByReview(allReadiness);
  const authsByReview = groupByReview(allAuths);
  const startupByReview = new Map(allStartups.map((row) => [row.reviewId, row]));

  let matrix = null;
  let matrixError = null;
  try {
    matrix = buildMatrix(state, { now: at, settings: { ...cfg, activeSeatId: null } });
  } catch (error) {
    matrixError = `The reporting graph could not be read, so reporting lines and joint startup apexes could not be verified: ${error?.message || 'unknown error'}.`;
  }
  const graphIds = new Set([
    ...(matrix?.nodes?.keys?.() || []),
    LEADER_ID,
  ]);

  const builtAll = [];
  for (const review of allReviews) {
    const punchItems = punchByReview.get(review.id) || [];
    const signoffs = signoffsByReview.get(review.id) || [];
    const readiness = readinessByReview.get(review.id) || [];
    const authorisations = authsByReview.get(review.id) || [];
    const startup = startupByReview.get(review.id) || null;

    const derived = derivePsrReview({
      review,
      punchItems,
      signoffs,
      readiness,
      authorisations,
      startup,
      matrix,
      todayDay: asOf,
      revertHorizonDays: conventions.psrRevertHorizonDays,
    });

    // Every distinct roster identity involved in this review — counted ONCE.
    const personSet = new Set([
      review.proposerId,
      review.unitHolderId,
      ...review.affectedOperatorIds,
      ...punchItems.map((p) => p.ownerId),
      ...derived.governingSigners,
    ].filter((pid) => pid && pid !== LEADER_ID));
    const involvedPersonIds = [...personSet].sort();

    const personRows = involvedPersonIds.map((personId) => {
      const onGraph = graphIds.has(personId);
      const lines = onGraph ? psrActiveLinesFor(matrix, personId) : [];
      return {
        personId,
        name: onGraph ? psrPersonLabel(matrix, personId) : null,
        onGraph,
        lines: lines.map((line) => ({ ...line, managerName: psrPersonLabel(matrix, line.managerId) })),
      };
    });

    const orphanHands = personRows.filter((p) => !p.onGraph).map((p) => p.personId);
    const lineManagerIds = [...new Set(personRows.flatMap((p) => p.lines.map((l) => l.managerId)))].sort();

    builtAll.push({
      review,
      proposerName: psrPersonLabel(matrix, review.proposerId),
      unitHolderName: psrPersonLabel(matrix, review.unitHolderId),
      apexName: derived.apexId ? psrPersonLabel(matrix, derived.apexId) : null,
      involvedPersonIds,
      personRows,
      orphanHands,
      orphan: orphanHands.length > 0,
      lineManagerIds,
      lineManagerRows: lineManagerIds.map((id) => ({ managerId: id, managerName: psrPersonLabel(matrix, id) })),
      ...derived,
    });
  }

  // Scope to active seat reach (single-chain and active matrix lines; never duplicated).
  const rows = builtAll
    .filter((row) => psrRowInReach(seat, matrix, row))
    .sort((a, b) => {
      const ua = PSR_STATE_KEYS.indexOf(a.state.key);
      const ub = PSR_STATE_KEYS.indexOf(b.state.key);
      if (ua !== ub) return ua - ub;
      return String(a.review.reviewRef).localeCompare(String(b.review.reviewRef));
    });
  const outOfReachN = builtAll.length - rows.length;

  const visibleReviewIds = new Set(rows.map((r) => r.review.id));
  const reviews = rows.map((r) => r.review);
  const punchItems = rows.flatMap((r) => r.punchItems);
  const signoffs = rows.flatMap((r) => r.signoffs);
  const readiness = rows.flatMap((r) => r.readiness);
  const authorisations = rows.flatMap((r) => r.authorisations);
  const startups = rows.map((r) => r.startup).filter(Boolean);

  // Exact single-identity counts across the scoped rows (no double counting across lines or reviews).
  const states = Object.fromEntries(PSR_STATE_KEYS.map((key) => [key, 0]));
  const triggers = Object.fromEntries(PSR_TRIGGER_KEYS.map((key) => [key, 0]));
  for (const row of rows) {
    states[row.state.key] = (states[row.state.key] || 0) + 1;
    triggers[row.review.triggerKind] = (triggers[row.review.triggerKind] || 0) + 1;
  }

  const distinctOperators = new Set(rows.flatMap((r) => r.review.affectedOperatorIds));
  const distinctUnbriefedOperators = new Set(rows.flatMap((r) => r.unbriefedOperators));
  const distinctPeople = new Set(rows.flatMap((r) => r.involvedPersonIds));
  const distinctOrphans = new Set(rows.flatMap((r) => r.orphanHands));
  const distinctLines = new Set(rows.flatMap((r) => r.lineManagerIds));

  // Discipline summary across scoped reviews.
  const disciplineMap = new Map(PSR_DISCIPLINE_KEYS.map((key) => [key, {
    key,
    label: PSR_DISCIPLINE_BY_KEY[key].label,
    reviewsRequiredN: 0,
    gatesClearedN: 0,
    gatesRejectedN: 0,
    gatesUnsignedN: 0,
    catAOpenN: 0,
    catAClosedN: 0,
    catBOpenN: 0,
    catBOverdueN: 0,
    catBClosedN: 0,
  }]));
  for (const row of rows) {
    for (const gate of row.gateRows) {
      const entry = disciplineMap.get(gate.discipline);
      if (!entry) continue;
      entry.reviewsRequiredN += 1;
      if (gate.status === 'cleared') entry.gatesClearedN += 1;
      else if (gate.status === 'rejected') entry.gatesRejectedN += 1;
      else entry.gatesUnsignedN += 1;
    }
    for (const item of row.punchItems) {
      const entry = disciplineMap.get(item.discipline);
      if (!entry) continue;
      if (item.category === 'pre-startup') {
        if (item.verifiedClosed) entry.catAClosedN += 1;
        else entry.catAOpenN += 1;
      } else if (item.verifiedClosed) {
        entry.catBClosedN += 1;
      } else {
        entry.catBOpenN += 1;
        if (item.overdue) entry.catBOverdueN += 1;
      }
    }
  }
  const disciplineRows = PSR_DISCIPLINE_KEYS.map((key) => disciplineMap.get(key));

  // Per-line matrix roll-up: each review appears on every line holding its hands;
  // each person on a line is counted ONCE via a Set; the register never sums
  // per-line counts into a register headline (printed explicitly in the UI).
  const byLine = new Map();
  for (const row of rows) {
    for (const managerId of row.lineManagerIds) {
      const entry = byLine.get(managerId) || {
        managerId,
        managerName: psrPersonLabel(matrix, managerId),
        reviewsN: 0,
        unsafeBreachN: 0,
        tempExpiredN: 0,
        postOverdueN: 0,
        blockedOrRejectedN: 0,
        readyForAuthN: 0,
        reviewIds: new Set(),
        people: new Set(),
      };
      if (!entry.reviewIds.has(row.review.id)) {
        entry.reviewIds.add(row.review.id);
        entry.reviewsN += 1;
        if (row.state.key === 'breach-energised-unsafe') entry.unsafeBreachN += 1;
        if (row.state.key === 'temporary-expired-live') entry.tempExpiredN += 1;
        if (row.state.key === 'live-post-startup-overdue') entry.postOverdueN += 1;
        if (row.state.key === 'blocked-pre-startup' || row.state.key === 'gate-rejected') entry.blockedOrRejectedN += 1;
        if (row.state.key === 'ready-for-authorisation') entry.readyForAuthN += 1;
      }
      for (const person of row.personRows) {
        if (person.lines.some((line) => line.managerId === managerId)) {
          entry.people.add(person.personId);
        }
      }
      byLine.set(managerId, entry);
    }
  }
  const lineRows = [...byLine.values()]
    .map((entry) => ({
      managerId: entry.managerId,
      managerName: entry.managerName,
      reviewsN: entry.reviewsN,
      unsafeBreachN: entry.unsafeBreachN,
      tempExpiredN: entry.tempExpiredN,
      postOverdueN: entry.postOverdueN,
      blockedOrRejectedN: entry.blockedOrRejectedN,
      readyForAuthN: entry.readyForAuthN,
      peopleN: entry.people.size,
      peopleIds: [...entry.people].sort(),
    }))
    .sort((a, b) => String(a.managerName).localeCompare(String(b.managerName)) || String(a.managerId).localeCompare(String(b.managerId)));

  const totals = {
    reviews: rows.length,
    unsafeBreach: states['breach-energised-unsafe'] || 0,
    temporaryExpired: states['temporary-expired-live'] || 0,
    postOverdue: states['live-post-startup-overdue'] || 0,
    gateRejected: states['gate-rejected'] || 0,
    blockedCatA: states['blocked-pre-startup'] || 0,
    awaitingVerification: states['awaiting-verification'] || 0,
    readyForAuth: states['ready-for-authorisation'] || 0,
    liveConditionsOpen: states['live-conditions-open'] || 0,
    authorisedWaiting: states['authorised-awaiting-startup'] || 0,
    closedVerified: states['closed-verified'] || 0,
    temporaryExpiring: rows.filter((r) => r.temporaryExpiring).length,
    disqualifiedActs: rows.reduce((sum, r) => (
      sum
      + r.punchItems.filter((p) => p.closureDisqualifiedReason).length
      + r.signoffs.filter((s) => s.disqualifiedReason).length
      + r.readiness.filter((rd) => rd.disqualifiedReason).length
      + (r.authorisation && !r.authorisationValid ? 1 : 0)
    ), 0),
    catAOpen: rows.reduce((sum, r) => sum + r.openCatAN, 0),
    catAClosed: rows.reduce((sum, r) => sum + r.closedCatAN, 0),
    catBOpen: rows.reduce((sum, r) => sum + r.openCatBN, 0),
    catBOverdue: rows.reduce((sum, r) => sum + r.overdueCatBN, 0),
    catBClosed: rows.reduce((sum, r) => sum + r.closedCatBN, 0),
    gatesCleared: rows.reduce((sum, r) => sum + r.clearedDisciplines.length, 0),
    gatesRejected: rows.reduce((sum, r) => sum + r.rejectedDisciplines.length, 0),
    gatesUnsigned: rows.reduce((sum, r) => sum + r.missingDisciplines.length, 0),
    operatorsN: distinctOperators.size,
    operatorsUnbriefedN: distinctUnbriefedOperators.size,
    peopleN: distinctPeople.size,
    orphanHandsN: distinctOrphans.size,
    linesN: distinctLines.size,
    ambiguousApexN: rows.filter((r) => r.apexAmbiguous).length,
  };

  // Reconciliation: `balances` (arithmetic partition proof) held strictly apart
  // from `figuresComplete` (record completeness / no dropped rows / no orphans).
  const stateSum = Object.values(states).reduce((sum, n) => sum + n, 0);
  const triggerSum = Object.values(triggers).reduce((sum, n) => sum + n, 0);
  const punchSum = totals.catAOpen + totals.catAClosed + totals.catBOpen + totals.catBClosed;
  const gateSum = totals.gatesCleared + totals.gatesRejected + totals.gatesUnsigned;
  const requiredGatesTotal = rows.reduce((sum, r) => sum + r.review.requiredDisciplines.length, 0);

  const balancesDetail = {
    statesReconcile: stateSum === rows.length,
    triggersReconcile: triggerSum === rows.length,
    punchReconciles: punchSum === punchItems.length && totals.catBOverdue <= totals.catBOpen,
    gatesReconcile: gateSum === requiredGatesTotal,
    childrenReconcile: punchItems.every((p) => visibleReviewIds.has(p.reviewId))
      && signoffs.every((s) => visibleReviewIds.has(s.reviewId))
      && readiness.every((rd) => visibleReviewIds.has(rd.reviewId))
      && authorisations.every((au) => visibleReviewIds.has(au.reviewId))
      && startups.every((st) => visibleReviewIds.has(st.reviewId)),
    oneStartupPerReview: startups.length === new Set(startups.map((st) => st.reviewId)).size,
    oneReviewPerRef: reviews.length === new Set(reviews.map((rv) => rv.reviewRef)).size,
  };
  const balances = Object.values(balancesDetail).every(Boolean);

  const incompleteReasons = [];
  if (warnings.length) {
    incompleteReasons.push(`${warnings.length} ledger warning(s): unreadable or orphan stored row(s) were refused and dropped rather than guessed.`);
  }
  if (distinctOrphans.size) {
    incompleteReasons.push(`${distinctOrphans.size} named hand(s) are not on the live reporting graph; their line position cannot be verified.`);
  }
  if (totals.ambiguousApexN) {
    incompleteReasons.push(`${totals.ambiguousApexN} review(s) have multiple incomparable common managers on the matrix graph; startup authority is ambiguous and not guessed.`);
  }
  if (matrixError) {
    incompleteReasons.push(matrixError);
  }
  if (!balances) {
    incompleteReasons.push('One or more state, trigger, punch or gate sums did not reconcile.');
  }
  const figuresComplete = incompleteReasons.length === 0;

  // Altitude disclosure: full operational detail at ranks 1..3 (frontline,
  // mid-manager, director) and for the unscoped workspace operator; aggregate
  // counts only at ranks 4..5 (VP, CEO), withholding names, unit refs, findings
  // and document references while printing exact counts, breaches and reconciliation.
  const detailed = !seat || seat.fullAccess || (Number.isInteger(seat.rank) ? seat.rank <= 3 : true);
  const seatId = seat && !seat.fullAccess ? (seat.nodeId || seat.id || null) : null;
  const disclosure = detailed
    ? { level: 'detail', reason: null, rank: seat?.rank ?? null, outOfReachN }
    : {
      level: 'aggregate',
      reason: 'Operational row detail — unit references, punch-list findings, document references and named individuals — is withheld above director altitude (rank 3). Exact state counts, gate breaches, expired temporary modifications, overdue Category B counts and reconciliation status are printed in full. Where this seat is the computed joint startup apex on a ready review, its authorisation reference is listed separately so the gate can be exercised. Seats are workflow declarations, not authentication.',
      rank: seat?.rank ?? null,
      outOfReachN,
    };

  // Preserve decider sightline (ADR-0245 pattern) ONLY for reviews where a VP/CEO
  // declared seat IS the exact live computed joint startup apex.
  const apexActionableRefs = !detailed && seatId
    ? rows
      .filter((r) => r.apexId === seatId && r.state.key === 'ready-for-authorisation')
      .map((r) => ({
        reviewId: r.review.id,
        reviewRef: r.review.reviewRef,
        triggerLabel: r.triggerDef?.label || r.review.triggerKind,
        clearedGatesN: r.clearedDisciplines.length,
        closedCatAN: r.closedCatAN,
        briefedOperatorsN: r.briefedOperators.length,
      }))
    : [];

  const attention = {
    unsafeBreachN: totals.unsafeBreach,
    temporaryExpiredN: totals.temporaryExpired,
    postOverdueN: totals.postOverdue,
    gateRejectedN: totals.gateRejected,
    blockedCatAN: totals.blockedCatA,
    readyForAuthN: totals.readyForAuth,
    temporaryExpiringN: totals.temporaryExpiring,
    total: totals.unsafeBreach
      + totals.temporaryExpired
      + totals.postOverdue
      + totals.gateRejected
      + totals.blockedCatA
      + totals.readyForAuth
      + totals.temporaryExpiring,
  };

  return {
    ok: true,
    engineVersion: PSR_ENGINE_VERSION,
    asOf,
    nowIso: at.toISOString(),
    conventions,
    matrix,
    matrixError,
    warnings,
    reviews: detailed ? reviews : [],
    punchItems: detailed ? punchItems : [],
    signoffs: detailed ? signoffs : [],
    readiness: detailed ? readiness : [],
    authorisations: detailed ? authorisations : [],
    startups: detailed ? startups : [],
    markers,
    rows: detailed ? rows : [],
    apexActionableRefs,
    detailed,
    disclosure,
    states,
    stateRows: PSR_STATE_KEYS.map((key) => ({
      key,
      label: PSR_STATE_BY_KEY[key].label,
      tone: PSR_STATE_BY_KEY[key].tone,
      count: states[key] || 0,
    })),
    triggers,
    triggerRows: PSR_TRIGGER_KEYS.map((key) => ({
      key,
      label: PSR_TRIGGER_BY_KEY[key].label,
      count: triggers[key] || 0,
    })),
    disciplineRows,
    lineRows: detailed ? lineRows : [],
    totals,
    balances,
    balancesDetail,
    figuresComplete,
    incompleteReasons,
    attention,
    seat: seat
      ? { id: seatId, rank: seat.rank ?? null, fullAccess: Boolean(seat.fullAccess), label: seat.label || '' }
      : { id: null, rank: null, fullAccess: true, label: 'whole register (no seat)' },
  };
}

/** Navigation badge count: decision-shaped safety & startup duties only. */
export function psrAttentionCount(state, { now = new Date(), settings = null, seat = null } = {}) {
  try {
    const report = buildPreStartupSafety(state, { now, settings, seat });
    return report?.ok ? report.attention.total : 0;
  } catch {
    return 0;
  }
}

/**
 * Insights signals (`PSR-01..06` in domain bucket `'Pre-startup safety'`).
 * Strictly procedural and plant-safety findings — never a rating on a person.
 */
export function psrSignals(state, now = new Date(), settings = null) {
  let report;
  try {
    report = buildPreStartupSafety(state, { now, settings, seat: null });
  } catch {
    return [];
  }
  if (!report?.ok || report.totals.reviews === 0) return [];
  const signals = [];
  const add = (sig) => signals.push({ domain: 'Pre-startup safety', route: PSR_HREF, ...sig });
  const t = report.totals;

  if (t.unsafeBreach > 0) {
    add({
      ruleId: 'PSR-01',
      severity: 5,
      confidence: 'high',
      title: `${t.unsafeBreach} unit(s) recorded physical energisation with an unmet pre-startup safety gate`,
      detail: 'Energisation was logged without a valid joint-apex Startup Authorisation, before authorisation, or while a Category A blocker, required discipline sign-off or operator pre-startup briefing was incomplete.',
      action: { label: 'Inspect unsafe-startup breaches', route: '#/pre-startup?view=startups' },
      evidence: [`${t.reviews} review(s) on register`, `${t.unsafeBreach} in breach-energised-unsafe`],
    });
  }

  if (t.temporaryExpired > 0) {
    add({
      ruleId: 'PSR-02',
      severity: 5,
      confidence: 'high',
      title: `${t.temporaryExpired} temporary modification(s) remain energised past their declared revert-by day`,
      detail: 'Time never reverts a temporary change or bypass (Flixborough control). Verify physical restoration to baseline specification and record the restoration reference.',
      action: { label: 'Review expired temporary changes', route: '#/pre-startup?view=startups' },
      evidence: [`${t.temporaryExpired} expired live temporary modification(s)`, `${t.temporaryExpiring} more inside the ${report.conventions.psrRevertHorizonDays}-day revert horizon`],
    });
  }

  if (t.postOverdue > 0) {
    add({
      ruleId: 'PSR-03',
      severity: 4,
      confidence: 'high',
      title: `${t.postOverdue} live unit(s) carry ${t.catBOverdue} overdue Category B post-startup condition(s)`,
      detail: 'Post-startup punch items were permitted past energisation only against explicit due days that have now passed without verified closure.',
      action: { label: 'Open PSSR punch list', route: '#/pre-startup?view=punch' },
      evidence: [`${t.catBOverdue} overdue of ${t.catBOpen} open Category B condition(s)`],
    });
  }

  if (t.gateRejected > 0) {
    add({
      ruleId: 'PSR-04',
      severity: 4,
      confidence: 'high',
      title: `${t.gateRejected} pre-startup review(s) held by a rejected discipline gate`,
      detail: 'At least one required functional discipline rejected startup readiness. Authorisation remains blocked until an independent re-verification clears the gate.',
      action: { label: 'Review discipline gates', route: '#/pre-startup?view=gates' },
      evidence: [`${t.gatesRejected} rejected gate(s)`, `${t.gatesCleared} cleared gate(s)`],
    });
  }

  if (t.blockedCatA > 0) {
    add({
      ruleId: 'PSR-05',
      severity: 3,
      confidence: 'high',
      title: `${t.blockedCatA} pre-startup review(s) hold ${t.catAOpen} open Category A startup blocker(s)`,
      detail: 'Category A items must be resolved and independently verified closed (never by the modification proposer or item owner) before startup may be authorised.',
      action: { label: 'Open Category A blockers', route: '#/pre-startup?view=punch' },
      evidence: [`${t.catAOpen} open Category A blocker(s)`, `${t.catAClosed} verified closed`],
    });
  }

  if (t.readyForAuth > 0 || t.temporaryExpiring > 0) {
    add({
      ruleId: 'PSR-06',
      severity: 3,
      confidence: 'high',
      title: `${t.readyForAuth} review(s) ready for joint-apex authorisation; ${t.temporaryExpiring} temporary change(s) approaching revert day`,
      detail: `Ready reviews await the computed joint apex across all active discipline and operating lines; approaching temporary changes lie within the declared ${report.conventions.psrRevertHorizonDays}-day revert horizon.`,
      action: { label: 'Open authorisations & temporary changes', route: '#/pre-startup?view=startups' },
      evidence: [`${t.readyForAuth} ready for joint-apex sign-off`, `${t.temporaryExpiring} inside ${report.conventions.psrRevertHorizonDays}-day horizon`],
    });
  }

  return signals;
}
