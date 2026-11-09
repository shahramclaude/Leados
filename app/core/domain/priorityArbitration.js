/**
 * app/core/domain/priorityArbitration.js — the Cross-Line Priority Arbitration
 * (ADR-0143, Schema v120, `#/arbitration`).
 *
 * THE DUTY, IN THE WORDS OF THE PERSON WHO HOLDS IT
 * -------------------------------------------------
 * A frontline lead in a matrix has a functional manager and a project manager.
 * Both have handed her dated work. Both are right, from where they sit. She has
 * one week. Her question is not "how much of me does each line own" (ADR-0140
 * answered that) and not "may this manager read my work at all" (ADR-0141
 * answered that). It is:
 *
 *     "Which of these two things do I do first — and who decided, when, and
 *      until when?"
 *
 * Before this module the workspace could not put that question anywhere. The
 * leader either silently picked one (and the other line learned about it from a
 * missed date) or escalated to somebody who had never seen the two demands side
 * by side. Both outcomes lose the same thing: the record of the trade-off.
 *
 * THE FOUR THINGS THIS MODULE REFUSES TO DO
 * -----------------------------------------
 *  1. IT DOES NOT PICK. The engine computes an exact ranking and prints it as a
 *     RECOMMENDATION. It is `proposed`, it binds nobody, and the obligations stay
 *     unissued until a human arbiter records the agreement. A silent owner is a
 *     decision the product is not entitled to make — the same rule ADR-0140 holds
 *     for `responsibleNodeId`.
 *  2. IT DOES NOT INVENT A NUMBER. Cost of delay and job size are integers the
 *     LINE MANAGER declares, in a unit the workspace declares. A demand that has
 *     not stated them is `incomplete`, and while any demand is incomplete the
 *     case prints `insufficient-evidence` and offers NO order at all. A ranking
 *     built on one real figure and one guessed figure is a fabricated comparison.
 *  3. IT DOES NOT RANK BY FEELING. The order is decided by EXACT INTEGER
 *     CROSS-MULTIPLICATION of the two printed columns (`delayWeight` and
 *     `jobSize`), not by a float ratio that could round two different demands
 *     into a tie. Two demands whose cross-products are exactly equal are
 *     reported `contested`: the engine names the tie rather than breaking it with
 *     an invisible tie-break.
 *  4. IT DOES NOT COLLAPSE TWO CLAIMS INTO ONE WORD. `ranked` (the order was
 *     computable) and `reconciles` (the printed disposition counts add to the
 *     frozen demand count) are different facts and are printed on separate lines,
 *     exactly as ADR-0140 keeps `balances` and `auditClean` apart.
 *
 * WHY WSJF, AND WHAT THE CHAIN MULTIPLIER IS FOR
 * ----------------------------------------------
 * Reinertsen's weighted shortest job first (2009) ranks by cost of delay per unit
 * of duration, which is the only comparison that makes "this big thing matters
 * more" and "this small thing unblocks the week" commensurable. Goldratt's CCPM
 * priority (1997) adds the one thing WSJF alone misses in operations: a small
 * blocker sitting on the longest remaining chain outranks a large piece of work
 * beside it. This module applies both explicitly rather than blending them into
 * an unaccountable score:
 *
 *     delayWeight = costOfDelay × (1 + chainDaysRemaining)
 *     order       = descending delayWeight / jobSize   (exact integer compare)
 *
 * `chainDaysRemaining` unstated is counted as 0 AND the row prints "chain not
 * stated", because an unstated chain is not evidence of a critical one. That
 * convention is declared in `PRIORITY_METHOD` and printed on the Method panel.
 *
 * Pure module: no DOM, no storage, no clock beyond the injected `now`.
 */

import { buildMatrix, matrixAllocations, matrixJointApex, matrixLineScope } from './matrix.js';
import { activeSeat, buildSeats } from './seat.js';
import { LEADER_ID } from './chain.js';
import { dayKey, daysBetween } from '../time.js';
import {
  PRIORITY_CSV_COLUMNS,
  PRIORITY_ENGINE_VERSION,
  PRIORITY_FINDINGS,
  PRIORITY_FLOORS,
  PRIORITY_LIMITS,
  PRIORITY_METHOD,
  PRIORITY_NODE_TYPE,
  PRIORITY_PANELS,
  PRIORITY_STATE_LABELS,
  PRIORITY_STATES,
  PRIORITY_VERDICT_LABELS,
  PRIORITY_VERDICTS,
  priorityFindingRank,
} from './priorityArbitrationRegistry.js';
import { normalizePrioritySettings } from './priorityArbitrationSchema.js';

const FULL_H = 100;

/* ------------------------------------------------------------------ helpers */

/**
 * The exact integer comparison weight of one demand.
 *
 * `costOfDelay × (1 + chainDays)`. Chosen over `costOfDelay` alone so a blocker
 * on the longest chain can outrank a larger piece of work beside it — Goldratt's
 * CCPM priority, applied as an explicit multiplier rather than a hidden weight.
 * Returns `null` when the cost of delay was never declared: an undeclared cost
 * has no weight, and inventing one is the failure this module exists to prevent.
 */
export function priorityDelayWeight(demand) {
  if (!Number.isInteger(demand?.cod)) return null;
  const chain = Number.isInteger(demand?.chainDays) ? demand.chainDays : 0;
  return demand.cod * (1 + chain);
}

/**
 * Rank every demand in a case, EXACTLY.
 *
 * The comparison is `wA × sizeB` against `wB × sizeA` — integer multiplication
 * of two printed integers, so the printed order is provably the order of the
 * stored numbers and cannot be a float artefact. `ratio` is offered ONLY as a
 * display convenience and is labelled as such on every surface: it is derived
 * from the same two integers and decides nothing.
 *
 * Nothing here mutates or rounds. Demands missing either integer are listed as
 * `incomplete` and force the whole case to `insufficient-evidence`, because a
 * partial ranking invites a reader to fill the gap themselves.
 */
export function priorityRank(caseRow) {
  const demands = Array.isArray(caseRow?.demands) ? caseRow.demands : [];
  const rows = demands.map((demand) => {
    const weight = priorityDelayWeight(demand);
    const size = Number.isInteger(demand?.jobSize) && demand.jobSize > 0 ? demand.jobSize : null;
    const complete = weight !== null && size !== null;
    return {
      demandId: demand.id,
      title: demand.title,
      managerId: demand.managerId,
      managerName: demand.managerName || demand.managerId,
      kind: demand.kind,
      kindLabel: demand.kindLabel,
      dueOn: demand.dueOn,
      cod: demand.cod,
      chainDays: Number.isInteger(demand.chainDays) ? demand.chainDays : null,
      chainStated: Number.isInteger(demand.chainDays),
      jobSize: size,
      delayWeight: weight,
      // Display only, and printed beside the two integers that decide the order.
      ratio: complete ? weight / size : null,
      ratioDisplay: complete ? (weight / size).toFixed(2) : null,
      complete,
      missing: [
        Number.isInteger(demand?.cod) ? null : 'cost of delay',
        size === null ? 'job size' : null,
      ].filter(Boolean),
      treatment: demand.treatment || null,
      disposition: demand.treatment?.disposition || 'pending',
    };
  });

  const complete = rows.filter((r) => r.complete);
  const incomplete = rows.filter((r) => !r.complete);

  if (rows.length === 0) {
    return {
      rows,
      ranked: false,
      verdict: PRIORITY_VERDICTS.incomplete,
      verdictLabel: PRIORITY_VERDICT_LABELS[PRIORITY_VERDICTS.incomplete],
      rankedIds: [],
      completeN: 0,
      incompleteN: 0,
      contestedN: 0,
      reason: 'The case holds no frozen demand, so there is nothing to order.',
    };
  }

  if (incomplete.length) {
    return {
      rows,
      ranked: false,
      verdict: PRIORITY_VERDICTS.incomplete,
      verdictLabel: PRIORITY_VERDICT_LABELS[PRIORITY_VERDICTS.incomplete],
      rankedIds: [],
      completeN: complete.length,
      incompleteN: incomplete.length,
      contestedN: 0,
      reason: `${incomplete.length} of ${rows.length} demand(s) carry no ${incomplete[0].missing.join(' and no ')}. No order is printed: a ranking that mixes measured demands with unmeasured ones is a comparison the record cannot support. Ask the line that owns the demand for the figure, then re-open this case.`,
    };
  }

  if (rows.length === 1) {
    return {
      rows,
      ranked: false,
      verdict: PRIORITY_VERDICTS.singleDemand,
      verdictLabel: PRIORITY_VERDICT_LABELS[PRIORITY_VERDICTS.singleDemand],
      rankedIds: [],
      completeN: 1,
      incompleteN: 0,
      contestedN: 0,
      reason: 'Only one demand is in contention. There is no precedence to decide; the person simply does the work.',
    };
  }

  /* Exact comparison: descending delayWeight/size. The comparator multiplies
     integers, so equal cross-products are a TRUE tie and are never broken by
     array order, insertion order, name or id. */
  const sorted = [...complete].sort((a, b) => {
    const left = a.delayWeight * b.jobSize;
    const right = b.delayWeight * a.jobSize;
    if (left !== right) return right - left;
    // A true tie keeps a deterministic printed order for readability ONLY; it
    // does not decide precedence, and the verdict below says so out loud.
    return a.demandId < b.demandId ? -1 : a.demandId > b.demandId ? 1 : 0;
  });

  // The tie GROUP at the top, INCLUDING the first row: the panel must be able to
  // name every demand that is indistinguishable, not merely the ones it happens
  // to have listed after the first.
  const tiedTop = complete.filter((d) => d.delayWeight * sorted[0].jobSize === sorted[0].delayWeight * d.jobSize);
  const contested = tiedTop.length > 1;

  return {
    rows: sorted,
    ranked: true,
    verdict: contested ? PRIORITY_VERDICTS.contested : PRIORITY_VERDICTS.clearFirst,
    verdictLabel: contested
      ? PRIORITY_VERDICT_LABELS[PRIORITY_VERDICTS.contested]
      : PRIORITY_VERDICT_LABELS[PRIORITY_VERDICTS.clearFirst],
    rankedIds: sorted.map((r) => r.demandId),
    completeN: complete.length,
    incompleteN: 0,
    contestedN: contested ? tiedTop.length : 0,
    tiedIds: tiedTop.map((d) => d.demandId),
    reason: contested
      ? `${tiedTop.length} demand(s) carry exactly the same weight per unit of work (${sorted[0].delayWeight} ÷ ${sorted[0].jobSize} against each of them). The engine names the tie and does not break it: the arbiter must choose, and record why.`
      : `The order follows exact integer comparison of delay weight over job size across all ${complete.length} frozen demands. No ratio was rounded to decide it.`,
  };
}

/**
 * The DERIVED lifecycle state. Never stored, so a hand-edited file cannot
 * promote a proposal into an agreement — the acts are the state.
 */
export function priorityState(caseRow) {
  if (caseRow?.withdrawnAt) return PRIORITY_STATES.withdrawn;
  if (caseRow?.agreement) return PRIORITY_STATES.agreed;
  if (caseRow?.proposal) return PRIORITY_STATES.proposed;
  return PRIORITY_STATES.open;
}

export function priorityStateLabel(state) {
  return PRIORITY_STATE_LABELS[state] || state;
}

/**
 * Which lines DECLARE the `priority` decision right on this person.
 *
 * The arbitration asks one line to yield precedence to another, which is exactly
 * the `priority` right. When both lines DECLARE it, the case is not a
 * disagreement the parties can settle between themselves — it is the structure
 * contradicting itself, and only the arbiter above both lines can settle it.
 *
 * Deliberately counts ONLY stated rights, never `presumedRights`. The home line's
 * presumed performance/pay/absence rights are a declared convention (ADR-0140),
 * and sweeping them into this reading would let a presumption manufacture a
 * contention that no human declared. A finding must rest on an act.
 */
function contestedPriority(caseRow, matrix) {
  const lines = matrix.linesByPerson.get(caseRow.personId) || [];
  const named = new Set((caseRow.demands || []).map((d) => d.managerId));
  const holders = lines
    .filter((l) => l.active !== false)
    .filter((l) => (l.rights || []).includes('priority'))
    .filter((l) => named.has(l.managerId))
    .map((l) => l.managerId);
  return { holders: [...new Set(holders)], contested: holders.length > 1 };
}

/**
 * Who arbitrates. The manager set is the distinct lines that placed the frozen
 * demands; the arbiter is their EXACT MINIMAL COMMON ANCESTOR in the reporting
 * DAG. A diamond tie is reported as a tie with both apexes named — never
 * resolved by picking the alphabetically first branch.
 */
function arbitrationApex(caseRow, matrix) {
  const managers = [...new Set((caseRow.demands || []).map((d) => d.managerId).filter(Boolean))];
  if (managers.length < 2) {
    return {
      managers,
      state: 'single-line',
      apexId: null,
      apexIds: [],
      label: 'Only one line placed a demand, so there is no cross-line precedence to decide.',
    };
  }
  const apex = matrixJointApex(matrix, managers);
  if (apex.unique && apex.apexId) {
    return {
      managers,
      state: 'unique',
      apexId: apex.apexId,
      apexIds: apex.apexIds,
      label: `${matrix.nodes.get(apex.apexId)?.name || apex.apexId} is the joint apex above both lines.`,
    };
  }
  return {
    managers,
    state: 'ambiguous',
    apexId: null,
    apexIds: apex.apexIds || [],
    label: `The two lines meet at ${(apex.apexIds || []).length || 'no'} incomparable minimal ancestors in the reporting DAG. No single arbiter is chosen for you; the case names the tie so it can be closed deliberately.`,
  };
}

/**
 * How much of the person the AGREED precedence actually claims.
 *
 * Capacity is read from the matrix ledger's declared allocation on each line
 * that holds a sequenced demand. An undeclared allocation contributes NOTHING and
 * is counted as undeclared — it is never assumed to be 100%, because that would
 * make a case close on a figure nobody agreed. The total is compared with the
 * declared capacity convention and reported as a fact, not as a verdict on anyone.
 */
function arbitrationCapacity(caseRow, rankRows, matrix, conventions) {
  const allocation = matrixAllocations(matrix).find((p) => p.personId === caseRow.personId) || null;
  const sequenced = rankRows.filter((r) => r.disposition === 'sequenced');
  const byManager = new Map();
  for (const row of sequenced) {
    if (!byManager.has(row.managerId)) byManager.set(row.managerId, []);
    byManager.get(row.managerId).push(row);
  }
  const lines = [];
  let claimedH = 0;
  let undeclaredN = 0;
  for (const [managerId, rows] of byManager) {
    const line = (allocation?.lines || []).find((l) => l.managerId === managerId) || null;
    const shareH = Number.isInteger(line?.shareH) ? line.shareH : null;
    if (shareH === null) undeclaredN += 1;
    else claimedH += shareH;
    lines.push({
      managerId,
      managerName: matrix.nodes.get(managerId)?.name || rows[0].managerName || managerId,
      demandN: rows.length,
      shareH,
      shareDisplay: shareH === null ? null : (shareH / 100).toFixed(2),
      kindLabel: rows[0].kindLabel || rows[0].kind || '',
    });
  }
  const limitH = conventions.priorityCapacityShareH;
  return {
    lines,
    lineN: lines.length,
    sequencedN: sequenced.length,
    claimedH,
    claimedDisplay: (claimedH / 100).toFixed(2),
    limitH,
    limitDisplay: (limitH / 100).toFixed(2),
    undeclaredN,
    overCapacity: claimedH > limitH,
    // A claim over capacity is a real finding. A claim UNDER capacity is not
    // evidence of slack: the shares are declarations about the whole person, not
    // about this fortnight's demands. The panel says so rather than printing a
    // reassuring "headroom".
    reason: undeclaredN
      ? `${undeclaredN} sequenced line(s) carry no declared allocation in the matrix ledger, so this total UNDERSTATES what the agreement claims. Declare the share on the Lines panel before treating it as complete.`
      : claimedH > limitH
        ? `The sequenced demands claim ${(claimedH / 100).toFixed(2)} of a person against the declared ceiling of ${(limitH / 100).toFixed(2)}. The agreement is recorded, and the over-claim is printed: a precedence that cannot physically be met is how a matrix misses its dates.`
        : `The sequenced demands claim ${(claimedH / 100).toFixed(2)} of a person against the declared ceiling of ${(limitH / 100).toFixed(2)}. This is a claim on declared capacity, not evidence of spare time.`,
  };
}

/** Is the agreed precedence inside its window, due for review, or expired? */
function windowState(caseRow, today) {
  const agreement = caseRow.agreement;
  if (!agreement) return { state: 'none', label: 'No precedence has been agreed.', daysToReview: null, daysToEnd: null };
  const daysToEnd = daysBetween(today, agreement.effectiveTo);
  const daysToReview = agreement.reviewOn ? daysBetween(today, agreement.reviewOn) : null;
  if (daysToEnd !== null && daysToEnd < 0) {
    return {
      state: 'expired',
      label: `The agreed precedence ran out on ${agreement.effectiveTo}. The demands need a fresh case, or the arbiter must record a new window.`,
      daysToReview,
      daysToEnd,
    };
  }
  if (daysToReview !== null && daysToReview <= 0) {
    return {
      state: 'review-due',
      label: `The precedence is still inside its window until ${agreement.effectiveTo} but was due for review on ${agreement.reviewOn}. A precedence nobody revisits becomes a habit nobody chose.`,
      daysToReview,
      daysToEnd,
    };
  }
  return {
    state: 'in-force',
    label: `In force until ${agreement.effectiveTo}; due for review on ${agreement.reviewOn}.`,
    daysToReview,
    daysToEnd,
  };
}

/* ------------------------------------------------------------- the read model */

/**
 * The person's matrix allocation, from whichever shape the caller supplied: a
 * `Map` keyed by person id (the caller's fast path), a plain lookup function, or
 * the resolved list itself. Accepting all three is not convenience — it means a
 * caller cannot silently get `null` (and therefore an "undeclared capacity"
 * reading) by passing the perfectly reasonable shape this function did not yet
 * expect.
 */
function resolveAllocation(allocationByPerson, personId) {
  if (!allocationByPerson) return null;
  if (typeof allocationByPerson === 'function') return allocationByPerson(personId) || null;
  if (typeof allocationByPerson.get === 'function') return allocationByPerson.get(personId) || null;
  if (Array.isArray(allocationByPerson)) return allocationByPerson.find((a) => a && a.personId === personId) || null;
  return null;
}

/**
 * Build the whole arbitration reading for one case: the exact ranking, the
 * arbiter, the capacity claim, the derived state and the bounded findings.
 */
export function buildPriorityCase(caseRow, { matrix, today, conventions, allocationByPerson = null }) {
  const rank = priorityRank(caseRow);
  const state = priorityState(caseRow);
  const apex = arbitrationApex(caseRow, matrix);
  const contested = contestedPriority(caseRow, matrix);
  const capacity = arbitrationCapacity(caseRow, rank.rows, matrix, conventions);
  const window = windowState(caseRow, today);
  const person = matrix.nodes.get(caseRow.personId) || null;
  const allocation = resolveAllocation(allocationByPerson, caseRow.personId);

  const dispositions = { pending: 0, sequenced: 0, deferred: 0, reshaped: 0, released: 0 };
  for (const row of rank.rows) dispositions[row.disposition] = (dispositions[row.disposition] || 0) + 1;

  /* TWO SEPARATE CLAIMS, never collapsed.
       `ranked`      the order could be computed from complete declared figures.
       `reconciles`  the printed disposition counts add to the frozen demand
                     count, and (once agreed) the agreement names every demand
                     exactly once. A case can be perfectly reconciling and still
                     ranked false — the counts add up and there is no ranking.
     Printing "reconciles" alone would let a reader hear "this is decided", and
     printing "ranked" alone would let them hear "the record adds up". */
  const dispositionTotal = Object.values(dispositions).reduce((a, b) => a + b, 0);
  const agreementCoversAll = caseRow.agreement
    ? caseRow.agreement.rankedIds.length === caseRow.demands.length
    : true;
  const reconciles = dispositionTotal === caseRow.demands.length && agreementCoversAll;

  const dissentN = (caseRow.dissents || []).length;
  const objectionN = (caseRow.dissents || []).filter((d) => d.stance === 'object').length;

  return {
    id: caseRow.id,
    personId: caseRow.personId,
    personName: person?.name || caseRow.personName || caseRow.personId,
    personAltitude: person?.altitude || null,
    openedOn: caseRow.openedOn,
    openedAt: caseRow.openedAt,
    openedBySeatId: caseRow.openedBySeatId,
    note: caseRow.note,
    state,
    stateLabel: priorityStateLabel(state),
    rank,
    apex,
    contested,
    capacity,
    window,
    dispositions,
    demandN: caseRow.demands.length,
    dispositionTotal,
    reconciles,
    agreementCoversAll,
    dissentN,
    objectionN,
    dissents: caseRow.dissents || [],
    proposal: caseRow.proposal,
    agreement: caseRow.agreement,
    withdrawnOn: caseRow.withdrawnOn,
    withdrawReason: caseRow.withdrawReason,
    allocation,
    /* The single most important sentence on the screen. A proposal is not an
       agreement, and the product says which one it is holding. */
    binding: state === PRIORITY_STATES.agreed
      ? `AGREED on ${caseRow.agreement.at.slice(0, 10)}: the precedence below is binding on both lines until ${caseRow.agreement.effectiveTo}.`
      : state === PRIORITY_STATES.proposed
        ? 'PROPOSED, NOT AGREED: the recommendation below binds nobody. No obligation has been issued to either line, and the person is not expected to act on it.'
        : state === PRIORITY_STATES.withdrawn
          ? `WITHDRAWN on ${caseRow.withdrawnOn}: nothing was agreed, so nothing is owed.`
          : 'OPEN: the demands are frozen and no precedence has been proposed yet.',
  };
}

/** Findings, worst first. Every one is a fact about the RECORD, never about a person. */
export function priorityFindings(cases, today) {
  const out = [];
  for (const c of cases) {
    if (c.state === PRIORITY_STATES.proposed) {
      out.push({
        finding: 'awaiting-agreement', caseId: c.id, personName: c.personName, severity: 100,
        detail: `A precedence was proposed on ${c.proposal.at.slice(0, 10)} and nobody has agreed it. Until an arbiter records the agreement, both lines still believe their demand comes first.`,
      });
    }
    if (c.state === PRIORITY_STATES.open) {
      out.push({
        finding: 'open-case', caseId: c.id, personName: c.personName, severity: 90,
        detail: `The demands were frozen on ${c.openedOn} and no precedence has been proposed. The trade-off is still being made informally, which is the state this register exists to end.`,
      });
    }
    if (c.state === PRIORITY_STATES.agreed && c.capacity.overCapacity) {
      out.push({
        finding: 'over-capacity', caseId: c.id, personName: c.personName, severity: 80,
        detail: c.capacity.reason,
      });
    }
    if (c.state === PRIORITY_STATES.agreed && c.window.state === 'review-due') {
      out.push({
        finding: 'review-due', caseId: c.id, personName: c.personName, severity: 70,
        detail: c.window.label,
      });
    }
    if (c.state === PRIORITY_STATES.agreed && c.window.state === 'expired') {
      out.push({
        finding: 'review-due', caseId: c.id, personName: c.personName, severity: 75,
        detail: c.window.label,
      });
    }
    if (c.dispositions.pending > 0) {
      out.push({
        finding: 'pending-demand', caseId: c.id, personName: c.personName, severity: 60,
        detail: `${c.dispositions.pending} frozen demand(s) carry no disposition. A case cannot be agreed while a side has not been heard: "I never agreed to that" is the failure mode of an arbitration with a silent party.`,
      });
    }
    if (c.apex.state === 'ambiguous') {
      out.push({
        finding: 'apex-ambiguous', caseId: c.id, personName: c.personName, severity: 55,
        detail: c.apex.label,
      });
    }
    if (c.rank.incompleteN > 0) {
      out.push({
        finding: 'incomplete-score', caseId: c.id, personName: c.personName, severity: 50,
        detail: c.rank.reason,
      });
    }
    if (c.state === PRIORITY_STATES.agreed && c.dissentN === 0) {
      out.push({
        finding: 'no-dissent-recorded', caseId: c.id, personName: c.personName, severity: 30,
        detail: 'The agreement carries no party answer at all. That is not wrongdoing — but an agreement nobody answered for is one escalation away from being reopened, and the register would rather print that than imply both lines were heard.',
      });
    }
  }
  out.sort((a, b) => priorityFindingRank(a.finding) - priorityFindingRank(b.finding)
    || b.severity - a.severity
    || String(a.personName).localeCompare(String(b.personName))
    || String(a.caseId).localeCompare(String(b.caseId)));
  return out;
}

/**
 * The whole screen. Built under the acting seat, so a seat sees the arbitration
 * cases about people it can actually reach — through the tree OR a declared
 * matrix line, exactly as ADR-0141 established. Never a peer span.
 */
export function buildPriorityReport(state, { now = new Date(), settings = null, seat = null } = {}) {
  const effective = settings || state?.settings || null;
  const conventions = normalizePrioritySettings(effective || {});
  const matrix = buildMatrix(state, { now, settings: effective });
  const today = dayKey(now);
  const lineScope = matrixLineScope(matrix);
  /* The seat is resolved HERE, with the declared lines injected, whenever the
     caller did not supply one. This is the ADR-0142 lesson applied before the
     defect rather than after it: the reading boundary and the CSV export must
     resolve the same seat from the same graph, or an export can publish a span
     the screen would have withheld. */
  const actingSeat = seat || activeSeat(buildSeats(state, {
    now,
    settings: effective,
    lineScope: lineScope.byManager,
  }));
  const allCases = Array.isArray(state?.priorityArbitrations) ? state.priorityArbitrations : [];
  const allocations = matrixAllocations(matrix);
  const allocationMap = new Map(allocations.map((a) => [a.personId, a]));

  /* Seat scope. `seat` is passed in by the action layer, which has already
     resolved it with the matrix line scope injected; `null` means the undeclared
     operator view, which reads the whole workspace as it always has. */
  const inScope = (personId) => {
    if (!actingSeat || actingSeat.fullAccess) return true;
    if (actingSeat.id === personId) return true;
    if (actingSeat.scope?.has?.(personId)) return true;
    if (actingSeat.lineScope?.has?.(personId)) return true;
    return false;
  };

  const scopedCases = allCases.filter((c) => c && inScope(c.personId));
  const built = scopedCases.map((c) => buildPriorityCase(c, { matrix, today, conventions, allocationByPerson: allocationMap }));

  const live = built.filter((c) => c.state !== PRIORITY_STATES.withdrawn);
  const concluded = built.filter((c) => c.state === PRIORITY_STATES.withdrawn || c.window.state === 'expired');

  /* Stable, boring order: worst state first, then the oldest case. A board that
     reorders itself by a derived score would move under the reader's hand. */
  const stateOrder = { proposed: 0, open: 1, agreed: 2, withdrawn: 3 };
  const sortCases = (a, b) => (stateOrder[a.state] - stateOrder[b.state]) || String(a.openedOn).localeCompare(String(b.openedOn)) || String(a.id).localeCompare(String(b.id));
  const boardCases = [...live].sort(sortCases);
  const logCases = [...built].filter((c) => c.state !== PRIORITY_STATES.proposed && c.state !== PRIORITY_STATES.open).sort((a, b) => String(b.openedAt).localeCompare(String(a.openedAt)));

  const findingsAll = priorityFindings(built, today);
  const findings = findingsAll.slice(0, PRIORITY_LIMITS.boardCases);

  /* Roll-up totals. Every figure below is the sum of the printed rows: the
     identity is asserted here and pinned in the suite. */
  const totals = {
    caseN: live.length,
    openN: live.filter((c) => c.state === PRIORITY_STATES.open).length,
    proposedN: live.filter((c) => c.state === PRIORITY_STATES.proposed).length,
    agreedN: live.filter((c) => c.state === PRIORITY_STATES.agreed).length,
    withdrawnN: built.filter((c) => c.state === PRIORITY_STATES.withdrawn).length,
    personN: new Set(live.map((c) => c.personId)).size,
    demandN: live.reduce((acc, c) => acc + c.demandN, 0),
    obligatedN: live.reduce((acc, c) => acc + (c.agreement?.issued?.length || 0), 0),
    objectionN: live.reduce((acc, c) => acc + c.objectionN, 0),
    ambiguousApexN: live.filter((c) => c.apex.state === 'ambiguous').length,
    overCapacityN: live.filter((c) => c.state === PRIORITY_STATES.agreed && c.capacity.overCapacity).length,
  };
  totals.identity = totals.openN + totals.proposedN + totals.agreedN === totals.caseN;

  const seatRow = {
    id: actingSeat?.id || null,
    label: actingSeat?.label || 'Undeclared operator view',
    rank: actingSeat?.rank ?? null,
    fullAccess: Boolean(actingSeat?.fullAccess),
    readOnly: Boolean(actingSeat?.readOnly),
    lineScopeN: actingSeat?.lineScopeN || 0,
  };

  return {
    engineVersion: PRIORITY_ENGINE_VERSION,
    method: PRIORITY_METHOD,
    panels: PRIORITY_PANELS,
    findings: PRIORITY_FINDINGS,
    conventions: {
      precedenceDays: conventions.priorityPrecedenceDays,
      reviewDays: conventions.priorityReviewDays,
      capacityShareH: conventions.priorityCapacityShareH,
      capacityShareDisplay: (conventions.priorityCapacityShareH / 100).toFixed(2),
      demandsPerCase: PRIORITY_LIMITS.demandsPerCase,
      boardCases: PRIORITY_LIMITS.boardCases,
      detailRank: PRIORITY_FLOORS.detailRank,
    },
    seat: seatRow,
    today,
    totals,
    cases: boardCases.slice(0, PRIORITY_LIMITS.boardCases),
    caseRemainderN: Math.max(0, boardCases.length - PRIORITY_LIMITS.boardCases),
    logCases: logCases.slice(0, PRIORITY_LIMITS.historyCases),
    logRemainderN: Math.max(0, logCases.length - PRIORITY_LIMITS.historyCases),
    concludedN: concluded.length,
    findings,
    findingsRemainderN: Math.max(0, findingsAll.length - findings.length),
    limits: PRIORITY_LIMITS,
  };
}

/** Attention badge. A proposed precedence nobody agreed is the count that matters. */
export function priorityAttentionCount(state, { now = new Date(), settings = null } = {}) {
  try {
    const report = buildPriorityReport(state, { now, settings: settings || state?.settings || null });
    return report.totals.proposedN + report.totals.openN + report.findings.filter((f) => f.finding === 'over-capacity').length;
  } catch {
    return 0;
  }
}

/* ----------------------------------------------------------------- export/brief */

/**
 * CSV scope #106 (Schema v120, ADR-0143). Aggregate-only: the report is built
 * under the acting seat, no person's name, no demand title and no case id ever
 * enters a row, and a withheld figure is BLANK with its reason — never 0.
 */
export function priorityCsvRows(report) {
  const rows = [];
  const t = report.totals;
  rows.push({
    row_kind: 'workspace',
    scope: 'workspace',
    altitude: report.seat.rank === null ? '' : String(report.seat.rank),
    case_state: '',
    demand_n: t.demandN,
    person_n: t.personN,
    pending_n: '',
    sequenced_n: '',
    verdict: '',
    apex_state: '',
    window_from: '',
    window_to: '',
    review_on: '',
    dissent_n: t.objectionN,
    obligation_n: t.obligatedN,
    over_capacity: t.overCapacityN ? 'yes' : 'no',
    band: t.overCapacityN ? 'has-over-capacity' : t.proposedN ? 'has-awaiting-agreement' : 'clean',
    withheld: 'no',
    withheld_reason: '',
  });

  for (const c of report.cases) {
    // Above the declared detail ceiling the row keeps its counts and loses its
    // arbiter identity: which manager arbitrates is item detail about a seat.
    const detailAllowed = report.seat.fullAccess || (Number.isInteger(report.seat.rank) && report.seat.rank < PRIORITY_FLOORS.detailRank);
    rows.push({
      row_kind: 'case',
      scope: 'span',
      altitude: report.seat.rank === null ? '' : String(report.seat.rank),
      case_state: c.state,
      demand_n: c.demandN,
      line_n: c.apex.managers.length,
      person_n: 1,
      complete_n: c.rank.completeN,
      incomplete_n: c.rank.incompleteN,
      pending_n: c.dispositions.pending,
      sequenced_n: c.dispositions.sequenced,
      deferred_n: c.dispositions.deferred,
      reshaped_n: c.dispositions.reshaped,
      released_n: c.dispositions.released,
      verdict: c.rank.verdict,
      apex_state: c.apex.state,
      apex_n: detailAllowed ? c.apex.apexIds.length : null,
      window_from: c.agreement?.effectiveFrom || '',
      window_to: c.agreement?.effectiveTo || '',
      review_on: c.agreement?.reviewOn || '',
      days_to_review: Number.isInteger(c.window.daysToReview) ? c.window.daysToReview : '',
      dissent_n: c.objectionN,
      obligation_n: c.agreement?.issued?.length || 0,
      sequenced_capacity_h: c.capacity.claimedH,
      capacity_limit_h: c.capacity.limitH,
      over_capacity: c.capacity.overCapacity ? 'yes' : 'no',
      band: c.state === PRIORITY_STATES.agreed ? 'agreed' : c.state === PRIORITY_STATES.proposed ? 'awaiting-agreement' : c.state,
      withheld: detailAllowed ? 'no' : 'yes',
      withheld_reason: detailAllowed ? '' : `The arbiter’s identity is withheld above the declared detail ceiling of rank ${PRIORITY_FLOORS.detailRank}. The counts and the derived state are still exported.`,
    });
    for (const r of c.rank.rows) {
      rows.push({
        row_kind: 'demand',
        scope: 'span',
        altitude: report.seat.rank === null ? '' : String(report.seat.rank),
        case_state: c.state,
        demand_n: 1,
        ars_rank: c.rank.ranked ? c.rank.rankedIds.indexOf(r.demandId) + 1 : '',
        ars_cod: Number.isInteger(r.cod) ? r.cod : '',
        ars_chain_days: r.chainStated ? r.chainDays : '',
        ars_job_size: Number.isInteger(r.jobSize) ? r.jobSize : '',
        ars_state: r.complete ? r.disposition : 'incomplete',
        band: r.complete ? 'measured' : 'refused',
        withheld: 'no',
        withheld_reason: r.complete ? '' : `No rank: ${r.missing.join(' and ')} not stated by the line.`,
      });
    }
  }
  for (const f of report.findings) {
    rows.push({ row_kind: 'finding', scope: 'span', case_state: '', verdict: f.finding, band: 'finding', withheld: 'no', withheld_reason: '' });
  }
  return rows;
}

/** The identity-free upward brief: counts and states, never a person or a title. */
export function priorityBriefText(report) {
  const t = report.totals;
  const lines = [];
  lines.push(`Cross-line priority arbitration — ${t.caseN} live case(s) over ${t.personN} person(s) and ${t.demandN} frozen demand(s).`);
  lines.push(`${t.openN} open with no precedence proposed, ${t.proposedN} proposed and unagreed, ${t.agreedN} agreed. ${t.identity ? 'The three states add exactly to the live case count.' : 'THE STATE COUNTS DO NOT ADD TO THE LIVE TOTAL — treat every figure here as unverified and report it.'}`);
  if (t.obligatedN) lines.push(`${t.obligatedN} owned obligation(s) were issued by an agreement, each pointing at the real task record rather than a copy of it.`);
  if (t.objectionN) lines.push(`${t.objectionN} recorded objection(s) sit on live agreements. An agreement that carries its objection is the only kind worth citing.`);
  if (t.ambiguousApexN) lines.push(`${t.ambiguousApexN} case(s) have no single arbiter: the two lines meet at incomparable minimal ancestors. None was chosen for you.`);
  if (t.overCapacityN) lines.push(`${t.overCapacityN} agreed precedence(s) claim more than the declared capacity of the person they sequence. The agreement is recorded and the over-claim is printed.`);
  const withheld = report.findingsRemainderN + report.caseRemainderN;
  if (withheld) lines.push(`${withheld} further row(s) were counted and are not printed here; no figure above is a percentage of an undisclosed total.`);
  lines.push('No person, demand title or arbiter is named in this brief. The absence of a case is not evidence that no conflict exists — only that none was declared.');
  return lines.join('\n');
}

export { PRIORITY_CSV_COLUMNS, PRIORITY_NODE_TYPE, PRIORITY_STATES };
