/**
 * app/core/domain/caseToAnswer.js — the ONE read model for the Fair-Process
 * Discipline & Grievance Register (ADR-0254, Schema v207).
 *
 * Every state, independence verdict, seniority verdict, ladder reading and appeal
 * outcome is derived here from declarations and dated acts plus the CURRENT matrix
 * graph. Nothing derived is stored, so no workspace file can carry a decided case
 * whose decision-maker was never independent of it.
 *
 * THE SIX THINGS THIS FILE COMPUTES, AND WHY EACH IS A SEPARATE FACT
 *
 *   1. THE PROCEDURE ORDER. A fair procedure has an order: allegation, then an
 *      independent investigator holding terms of reference, then written findings
 *      on the case's own standard of proof, then a decision by a hand senior to
 *      the investigator, then — only if lodged — an appeal heard by a different,
 *      strictly senior hand. `record-conflict` is derived when the dated acts
 *      cannot all be true in that order, and it is never cleared by preferring the
 *      later row.
 *
 *   2. INDEPENDENCE IS A GRAPH PROPERTY, NOT A DECLARATION. `dgiIndependence`
 *      walks the live reporting graph (home line AND every declared matrix line)
 *      and refuses an investigator who holds either party, is held by either
 *      party, or IS either party. It is applied on the write path so the door
 *      refuses, and here so an imported row that offends it is kept, printed and
 *      its findings marked unreliable — deleting it would hide the failure.
 *
 *   3. SENIORITY IS STRICT AND ONE-DIRECTIONAL. An investigator must be strictly
 *      senior to the subject (an investigator cannot conclude above a person they
 *      report to); a decision-maker must be strictly senior to the investigator
 *      (the hand that decides what happened does not also decide what it costs);
 *      an appeal decider must be a DIFFERENT hand and strictly senior to the
 *      decision-maker. Peers are never "independent enough".
 *
 *   4. THE LADDER — CONSISTENCY, COMPUTED RATHER THAN PROMISED. For an upheld
 *      allegation the register reads the subject's own most recent LIVE sanction
 *      of the same allegation class and computes the LOWEST declared rung ABOVE
 *      it. That computed rung is printed beside the rung the decision-maker chose,
 *      with the exact rank departure and the written reason. The register does not
 *      impose the computed rung: it makes a departure visible, which is the whole
 *      of what a consistency check can honestly do.
 *
 *   5. APPEAL AND DECISION ARE NEVER MERGED. The decision row is immutable. An
 *      appeal outcome lives in its own ledger and states `allowed`, `refused` or
 *      `varied` — and a `varied` outcome carries its own substituted sanction.
 *      "The appeal outcome stands" is therefore derived, and both rungs are printed.
 *
 *   6. WHAT IS OWED AND TO WHOM. A case in `decision-owed` owes a decision to the
 *      joint apex above the investigator's line and the subject's line; a case in
 *      `findings-owed` owes findings to the investigator; a case in `open` owes an
 *      assignment to the seat that opened it. Worklists are computed per seat, so a
 *      reader sees their own duties and not somebody else's paperwork.
 *
 * WHAT THIS FILE NEVER DOES. It never decides that a person is guilty, never picks
 * a sanction, never treats a withdrawal as a clearance, never treats a closed
 * appeal window as an appeal refused, never infers misconduct from text, never
 * scores or ranks a person, and never shows the allegation to a seat that holds
 * neither party and is not an assigned hand. Seats are workflow declarations:
 * confidentiality here is a rendering contract enforced by this reader, and the
 * panel prints that fact rather than implying a security boundary.
 */

import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixJointApex, matrixLineScopeFor } from './matrix.js';
import { activeManagersOf } from './dutyMeans.js';
import {
  DGI_ENGINE_VERSION,
  DGI_LIMITS as L,
  DGI_REVIEW_STATE_BY_KEY,
  DGI_REVIEW_STATE_KEYS,
  DGI_SANCTION_RANK,
  DGI_SANCTION_BY_KEY,
  DGI_STANDARD_BY_KEY,
  DGI_TERMINAL_STATE_KEYS,
  DGI_UPHELD_KEYS,
  DGI_ALLEGATION_CLASS_BY_KEY,
  DGI_CASE_KIND_BY_KEY,
  DGI_DIRECTION_KIND_BY_KEY,
  DGI_FINDING_BY_KEY,
  DGI_WITHDRAWAL_REASON_BY_KEY,
} from './caseToAnswerRegistry.js';
import {
  normalizeDgiAllegations,
  normalizeDgiAppealOutcomes,
  normalizeDgiAppeals,
  normalizeDgiCases,
  normalizeDgiDecisions,
  normalizeDgiDirections,
  normalizeDgiFindings,
  normalizeDgiInvestigators,
  normalizeDgiMarkers,
  normalizeDgiSettings,
  normalizeDgiWithdrawals,
} from './caseToAnswerSchema.js';

const list = (value) => (Array.isArray(value) ? value : []);
const sortedUnique = (values) => [...new Set(list(values).filter((value) => typeof value === 'string' && value))].sort();
const stateOf = (key) => ({ key, ...(DGI_REVIEW_STATE_BY_KEY[key] || DGI_REVIEW_STATE_BY_KEY['record-conflict']) });
const byDay = (left, right) => (left < right ? -1 : left > right ? 1 : 0);

/** Whole minutes-free day arithmetic: an exact integer count of calendar days from a to b. */
export function dgiDaysBetween(fromDay, toDay) {
  if (!fromDay || !toDay) return null;
  const a = Date.parse(`${fromDay}T00:00:00.000Z`);
  const b = Date.parse(`${toDay}T00:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Exact whole-day addition on a canonical UTC calendar day. Written here rather
 * than imported because the appeal window is a DAY count, not an instant, and a
 * local-time `addDays` would move the boundary by a zone offset.
 */
export function dgiAddDays(day, n) {
  if (!day || !Number.isInteger(n)) return null;
  const ms = Date.parse(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms + n * 86_400_000).toISOString().slice(0, 10);
}

/** Every currently active manager line of a person, through the ONE matrix graph. */
export function dgiActiveLinesFor(matrix, personId) {
  const lines = matrix?.linesByPerson?.get(personId) || [];
  return lines
    .filter((line) => line && line.active !== false && line.managerId && line.managerId !== personId)
    .map((line) => ({ lineId: line.id || null, managerId: line.managerId, kind: line.kind || null }))
    .sort((a, b) => String(a.managerId).localeCompare(String(b.managerId)) || String(a.lineId).localeCompare(String(b.lineId)));
}

function dgiPersonLabel(matrix, personId) {
  if (personId === LEADER_ID) return 'Workspace leader';
  return matrix?.nodes?.get(personId)?.name || matrix?.roster?.get(personId)?.name || null;
}

/**
 * INDEPENDENCE OF A NAMED HAND FROM A CASE'S PARTIES.
 *
 * Returns `{ ok, reason, holdsPartyIds, heldByPartyIds }`. A hand fails when it
 * holds either party on an ACTIVE line, is held by either party on an active line,
 * is a party itself, or is not on the graph at all (an unresolvable hand cannot be
 * proved independent). The manager set is deliberately NOT expanded to include the
 * parties' whole subtree: the duty is "does this hand have power over, or owe
 * power to, either party".
 */
export function dgiIndependence(matrix, handId, partyIds = []) {
  const parties = list(partyIds).filter((value) => typeof value === 'string' && value);
  if (!handId) return { ok: false, reason: 'No hand is named, so independence cannot be proved.', holdsPartyIds: [], heldByPartyIds: [] };
  if (parties.includes(handId)) {
    return { ok: false, reason: 'That hand is one of the parties to the case.', holdsPartyIds: [], heldByPartyIds: [] };
  }
  if (!matrix) return { ok: false, reason: 'The reporting graph could not be read, so no hand can be proved independent.', holdsPartyIds: [], heldByPartyIds: [] };
  if (!matrix.nodes?.has?.(handId)) {
    return { ok: false, reason: 'That hand is not a seat on the live reporting graph, so it cannot be proved independent of the parties.', holdsPartyIds: [], heldByPartyIds: [] };
  }
  const holdsPartyIds = parties.filter((partyId) => dgiActiveLinesFor(matrix, partyId).some((line) => line.managerId === handId));
  if (holdsPartyIds.length) {
    return {
      ok: false,
      reason: `That hand is the recorded manager of ${holdsPartyIds.map((partyId) => dgiPersonLabel(matrix, partyId) || partyId).join(' and ')} on an active line, so it is not independent of this case.`,
      holdsPartyIds,
      heldByPartyIds: [],
    };
  }
  // THE OTHER DIRECTION: the hand reports UP to one of the parties. This is the
  // disqualifier that is easy to get backwards — being senior to a party is normal
  // and is tested separately as seniority, but being JUNIOR to a party means the
  // hand owes its own position to the person it is judging. That direction is read
  // here from the hand's OWN ancestor set, never from the party's.
  const handAncestors = matrix.nodes.get(handId)?.ancestors || new Set();
  const heldByPartyIds = parties.filter((partyId) => handAncestors.has?.(partyId));
  if (heldByPartyIds.length) {
    return {
      ok: false,
      reason: `That hand reports, on an active reporting line, to ${heldByPartyIds.map((partyId) => dgiPersonLabel(matrix, partyId) || partyId).join(' and ')} — a party to this case — so it cannot independently conclude about them.`,
      holdsPartyIds: [],
      heldByPartyIds,
    };
  }
  return { ok: true, reason: null, holdsPartyIds: [], heldByPartyIds: [] };
}

/**
 * STRICT SENIORITY on the live graph, one rule for all three uses (investigator
 * over subject, decider over investigator, appeal decider over decider).
 */
export function dgiStrictlySeniorTo(matrix, seniorId, juniorId) {
  if (!seniorId || !juniorId) {
    return { ok: false, reason: 'One of the two hands is not named, so seniority cannot be established.' };
  }
  if (seniorId === juniorId) {
    return { ok: false, reason: 'A hand is not senior to itself.' };
  }
  if (!matrix) return { ok: false, reason: 'The reporting graph could not be read, so seniority cannot be proved.' };
  const senior = matrix.nodes?.get?.(seniorId) || null;
  const junior = matrix.nodes?.get?.(juniorId) || null;
  if (!senior) return { ok: false, reason: 'The senior hand is not a seat on the live reporting graph.' };
  if (!junior) return { ok: false, reason: 'The junior hand is not a seat on the live reporting graph, so nobody can be proved senior to them.' };
  if (!junior.ancestors?.has?.(seniorId)) {
    return { ok: false, reason: 'That hand is not strictly senior to the other on the live reporting graph. A peer cannot conclude above a peer.' };
  }
  return { ok: true, reason: null };
}

/** The ladder rung a live sanction of a given class sits at, or null where unknown. */
function rungOf(sanctionKey) {
  const rank = DGI_SANCTION_RANK[sanctionKey];
  return Number.isInteger(rank) ? rank : null;
}

/**
 * THE CONSISTENCY READING FOR ONE CASE.
 *
 * `previousLiveSameClass` is the subject's own most recent still-live sanction on
 * any case carrying an upheld allegation of the SAME class, as at the decision
 * day. The computed rung is the lowest declared rung strictly above it — which is
 * `recorded-conversation` (rank 1) when there is no prior live sanction, because
 * an upheld allegation with no history does not start at a warning.
 *
 * `none` (rank 0) is deliberately NOT the computed rung for a first upheld
 * allegation: a decision to impose nothing is a decision, and the register prints
 * it as a departure with a reason rather than prescribing it.
 */
export function dgiLadderReading({ prior, chosenSanction, history = [] }) {
  const chosenRank = rungOf(chosenSanction);
  const previousRank = prior ? rungOf(prior.sanction) : 0;
  const escalations = Number.isInteger(previousRank) ? previousRank + 1 : 2;
  const computedRank = Math.min(escalations, DGI_SANCTION_RANK.dismissal);
  const expected = Object.keys(DGI_SANCTION_RANK).find((key) => DGI_SANCTION_RANK[key] === computedRank) || null;
  return {
    chosenRank,
    previousRank: prior ? previousRank : null,
    previous: prior
      ? {
        sanction: prior.sanction,
        decidedOn: prior.decidedOn,
        caseRef: prior.caseRef || null,
        expiresOn: prior.expiresOn || null,
        classKeys: list(prior.classKeys),
      }
      : null,
    computed: expected ? DGI_SANCTION_BY_KEY[expected] : null,
    computedRank,
    departure: Number.isInteger(chosenRank) && chosenRank !== computedRank
      ? chosenRank - computedRank
      : 0,
    isDeparture: Number.isInteger(chosenRank) && chosenRank !== computedRank,
    // The history is printed so a reader sees the escalation chain, not just the
    // last rung. Newest first, each with its own day and sanction.
    history: list(history).slice(0, 6),
  };
}

/** A live sanction is one with no declared expiry, or one whose expiry has not passed. */
export function dgiSanctionIsLive(decision, asOfDay) {
  if (!decision) return false;
  if (decision.sanction === 'none') return false;
  if (!decision.expiresOn) return true;
  return decision.expiresOn >= asOfDay;
}

function allegationRowsFor(caseId, allegations) {
  return list(allegations).filter((row) => row.caseId === caseId).sort((a, b) => {
    const sa = Number.isInteger(a.sequence) ? a.sequence : 999;
    const sb = Number.isInteger(b.sequence) ? b.sequence : 999;
    return sa - sb || String(a.id).localeCompare(String(b.id));
  });
}

function latestInvestigator(caseId, investigators) {
  const rows = list(investigators).filter((row) => row.caseId === caseId)
    .sort((a, b) => String(a.assignedOn).localeCompare(String(b.assignedOn))
      || String(a.createdAt).localeCompare(String(b.createdAt))
      || String(a.id).localeCompare(String(b.id)));
  return rows.length ? { current: rows[rows.length - 1], history: rows } : { current: null, history: [] };
}

/**
 * THE CASE DERIVATION. Pure over the loaded ledgers, the live graph and the day.
 * Exported so the suite can pin every branch without a store, and so the rule and
 * CSV consume the same kernel the screen does.
 */
export function deriveDgiCase({ caseRow, allegations, investigators, directions, findings, decisions, appeals, appealOutcomes, withdrawals, matrix, matrixError, conventions, asOfDay, priorByClass }) {
  const caseId = caseRow.id;
  const myAllegations = allegationRowsFor(caseId, allegations);
  const investigation = latestInvestigator(caseId, investigators);
  const currentInvestigator = investigation.current;
  const myDirections = list(directions).filter((row) => row.caseId === caseId)
    .sort((a, b) => String(a.recordedOn).localeCompare(String(b.recordedOn)) || String(a.id).localeCompare(String(b.id)));
  const myFindings = list(findings).filter((row) => row.caseId === caseId)
    .sort((a, b) => String(a.foundOn).localeCompare(String(b.foundOn)) || String(a.id).localeCompare(String(b.id)));
  const myDecisions = list(decisions).filter((row) => row.caseId === caseId)
    .sort((a, b) => String(a.decidedOn).localeCompare(String(b.decidedOn)) || String(a.id).localeCompare(String(b.id)));
  const decision = myDecisions.length === 1 ? myDecisions[0] : null;
  const myAppeals = list(appeals).filter((row) => row.caseId === caseId)
    .sort((a, b) => String(a.lodgedOn).localeCompare(String(b.lodgedOn)) || String(a.id).localeCompare(String(b.id)));
  const appeal = myAppeals.length === 1 ? myAppeals[0] : null;
  const appealOutcome = appeal ? (list(appealOutcomes).filter((row) => row.appealId === appeal.id).sort(byDayOf('decidedOn')).slice(-1)[0] || null) : null;
  const withdrawal = list(withdrawals).filter((row) => row.caseId === caseId).sort(byDayOf('withdrawnOn')).slice(-1)[0] || null;

  const parties = [caseRow.subjectId, caseRow.raisedById].filter(Boolean);
  const managers = sortedUnique(parties.flatMap((personId) => dgiActiveLinesFor(matrix, personId).map((line) => line.managerId)));
  let apex = null;
  if (matrix && managers.length) {
    try { apex = matrixJointApex(matrix, managers); } catch { apex = null; }
  }
  const apexIds = sortedUnique(apex?.apexIds);
  const syntheticApex = apexIds.includes(LEADER_ID);
  const authorityResolved = !matrixError && managers.length > 0 && apexIds.length > 0
    && apexIds.length <= L.partiesMax + 10 && !syntheticApex;

  // INDEPENDENCE AND SENIORITY, COMPUTED FROM THE GRAPH ON EVERY READ.
  const investigatorIndependence = currentInvestigator
    ? dgiIndependence(matrix, currentInvestigator.investigatorId, parties)
    : null;
  const investigatorSeniority = currentInvestigator
    ? dgiStrictlySeniorTo(matrix, currentInvestigator.investigatorId, caseRow.subjectId)
    : null;
  const investigatorValid = Boolean(currentInvestigator && investigatorIndependence?.ok && investigatorSeniority?.ok);
  // The seat that walked into an interest AFTER being assigned: the verdict is
  // recomputed live, so a line change is printed rather than grandfathered.
  const investigatorInvalidReason = !currentInvestigator
    ? null
    : !investigatorIndependence?.ok
      ? investigatorIndependence.reason
      : !investigatorSeniority?.ok
        ? investigatorSeniority.reason
        : null;

  const findingsByAllegation = new Map();
  for (const row of myFindings) {
    const bucket = findingsByAllegation.get(row.allegationId) || [];
    bucket.push(row);
    findingsByAllegation.set(row.allegationId, bucket);
  }
  const allegationsOut = myAllegations.map((allegation) => {
    const rows = findingsByAllegation.get(allegation.id) || [];
    const latest = rows[rows.length - 1] || null;
    return {
      allegation,
      findings: rows,
      finding: latest,
      // A finding is unreliable when the hand that recorded it was not the
      // independent investigator, was not independent of the parties, or was not
      // senior to the subject. It is kept and printed; it simply does not count.
      reliable: Boolean(latest && investigatorValid && latest.foundById === currentInvestigator.investigatorId
        && latest.standardOfProof === caseRow.standardOfProof),
      standardMismatch: Boolean(latest && latest.standardOfProof !== caseRow.standardOfProof),
    };
  });
  const findingsComplete = allegationsOut.length > 0 && allegationsOut.every((row) => row.finding && row.reliable);
  const findingsOwedN = allegationsOut.filter((row) => !row.finding || !row.reliable).length;
  const upheld = allegationsOut.filter((row) => row.finding && row.reliable && DGI_UPHELD_KEYS.includes(row.finding.outcome));
  const notUpheld = allegationsOut.filter((row) => row.finding && row.reliable && !DGI_UPHELD_KEYS.includes(row.finding.outcome));
  const caseUpheld = upheld.length > 0;

  // THE DECISION SIDE.
  const decisionSeniority = decision && currentInvestigator
    ? dgiStrictlySeniorTo(matrix, decision.decidedById, currentInvestigator.investigatorId)
    : (decision ? { ok: false, reason: 'There is no investigator on the record to be senior to.' } : null);
  const decisionIndependence = decision ? dgiIndependence(matrix, decision.decidedById, parties) : null;
  const decisionValid = Boolean(decision && decisionIndependence?.ok && decisionSeniority?.ok && findingsComplete);

  // THE APPEAL SIDE.
  const appealIndependence = appealOutcome ? dgiIndependence(matrix, appealOutcome.decidedById, parties) : null;
  const appealSeniority = appealOutcome && decision
    ? dgiStrictlySeniorTo(matrix, appealOutcome.decidedById, decision.decidedById)
    : null;
  const appealDifferentHand = Boolean(appealOutcome && decision && appealOutcome.decidedById !== decision.decidedById);
  const appealValid = Boolean(appealOutcome && appealDifferentHand && appealIndependence?.ok && appealSeniority?.ok);
  const appealLate = Boolean(appeal && decision && appeal.lodgedOn > dgiAddDays(decision.decidedOn, conventions.dgiAppealWindowDays));

  // THE LADDER, READ AGAINST THE SUBJECT'S OWN RECORD.
  const classKeys = sortedUnique(allegationsOut.filter((row) => row.finding && row.reliable && DGI_UPHELD_KEYS.includes(row.finding.outcome))
    .map((row) => row.allegation.classKey));
  const priorForSubject = priorByClass ? priorByClass({ subjectId: caseRow.subjectId, classKeys, beforeDay: decision?.decidedOn || asOfDay, excludeCaseId: caseId }) : null;
  const ladder = decision
    ? dgiLadderReading({
      prior: priorForSubject?.prior || null,
      chosenSanction: decision.sanction,
      history: priorForSubject?.history || [],
    })
    : null;

  // THE PROCEDURE ORDER, AND THE CONFLICTS THAT BREAK IT.
  const conflicts = [];
  for (const row of myFindings) {
    const allegation = myAllegations.find((item) => item.id === row.allegationId);
    if (!allegation) continue;
    const caseActsBefore = [];
    if (row.foundOn < caseRow.openedOn) conflicts.push({ key: 'finding-before-case', detail: 'A written finding is dated before the case was opened.' });
    if (currentInvestigator && row.foundOn < currentInvestigator.assignedOn) {
      conflicts.push({ key: 'finding-before-investigator', detail: 'A written finding is dated before the investigator holding it was assigned.' });
    }
    if (row.standardOfProof !== caseRow.standardOfProof) {
      conflicts.push({ key: 'standard-changed', detail: 'A written finding applies a standard of proof the case did not declare at opening.' });
    }
    if (caseActsBefore.length) continue;
  }
  if (myDecisions.length > 1) conflicts.push({ key: 'two-decisions', detail: 'More than one sanction decision is on the record. An appeal is a different act, and a decision is recorded once.' });
  if (decision && myFindings.some((row) => row.foundOn > decision.decidedOn)) {
    conflicts.push({ key: 'decision-before-finding', detail: 'A sanction decision is dated before a written finding it depends on.' });
  }
  if (decision && currentInvestigator && decision.decidedOn < currentInvestigator.assignedOn) {
    conflicts.push({ key: 'decision-before-assignment', detail: 'A sanction decision is dated before the investigator was assigned.' });
  }
  if (myAppeals.length > 1) conflicts.push({ key: 'two-appeals', detail: 'More than one appeal is on the record for this case.' });
  if (appeal && !decision) conflicts.push({ key: 'appeal-without-decision', detail: 'An appeal is on the record with no decision to appeal.' });
  if (appeal && decision && appeal.lodgedOn < decision.decidedOn) conflicts.push({ key: 'appeal-before-decision', detail: 'An appeal is dated before the decision it appeals.' });
  if (appealOutcome && appeal && appealOutcome.decidedOn < appeal.lodgedOn) conflicts.push({ key: 'appeal-outcome-before-lodging', detail: 'An appeal outcome is dated before the appeal was lodged.' });
  // A DECISION CANNOT REST ON FINDINGS THAT DO NOT COUNT. If the investigator is not
  // independent today (or was never independent, on an imported row), every finding
  // they recorded is unreliable, and a decision built on those findings is a
  // decision built on nothing. This is checked BEFORE the ordinary decision and
  // appeal branches, so a case cannot read as "decided" or "appeal lodged" while
  // the ground under it has gone.
  if (myDecisions.length && currentInvestigator && !investigatorValid) {
    conflicts.push({
      key: 'decision-on-unreliable-findings',
      detail: `A sanction decision rests on findings recorded by a hand that is not independent of both parties or not strictly senior to the subject: ${investigatorInvalidReason || 'the live graph no longer supports it.'}`,
    });
  }
  if (withdrawal && myDecisions.length) conflicts.push({ key: 'withdrawal-after-decision', detail: 'A withdrawal is on the record after a decision. A decision is ended by an appeal, not by a withdrawal.' });
  if (withdrawal && myAppeals.length) conflicts.push({ key: 'withdrawal-after-appeal', detail: 'A withdrawal is on the record after an appeal was lodged.' });

  // THE STATE. One key, mutually exclusive, in procedure order.
  let stateKey = null;
  let nextOwed = null;
  let canAssign = false;
  let canFind = false;
  let canDecide = false;
  let canLodge = false;
  let canDecideAppeal = false;
  let appealDaysLeft = null;

  if (conflicts.length) {
    stateKey = 'record-conflict';
  } else if (withdrawal) {
    stateKey = 'withdrawn';
  } else if (appealOutcome) {
    stateKey = 'appeal-decided';
  } else if (appeal) {
    stateKey = 'appeal-lodged';
    nextOwed = { key: 'appeal-decision', to: apexIds };
    canDecideAppeal = true;
  } else if (decision) {
    appealDaysLeft = conventions.dgiAppealWindowDays - (dgiDaysBetween(decision.decidedOn, asOfDay) ?? 0);
    if (appealDaysLeft >= 0) {
      stateKey = 'decided';
      canLodge = true;
      nextOwed = { key: 'appeal-window', to: apexIds, daysLeft: appealDaysLeft };
    } else {
      stateKey = 'appeal-window-closed';
      nextOwed = null;
    }
  } else if (currentInvestigator && !investigatorValid) {
    stateKey = 'investigator-invalid';
    nextOwed = { key: 'reassign-investigator', to: apexIds };
    canAssign = true;
  } else if (!currentInvestigator) {
    stateKey = 'open';
    nextOwed = { key: 'assign-investigator', to: apexIds };
    canAssign = true;
  } else if (!findingsComplete) {
    stateKey = findingsOwedN === allegationsOut.length ? 'investigator-assigned' : 'findings-owed';
    nextOwed = { key: 'findings', to: [currentInvestigator.investigatorId], owedN: findingsOwedN };
    canFind = true;
  } else if (!decision) {
    stateKey = 'decision-owed';
    nextOwed = { key: 'decision', to: apexIds };
    canDecide = true;
  } else {
    // A decision exists, findings are complete, but the decision itself fails the
    // independence or seniority test. That is a record defect, not a closed case.
    stateKey = 'record-conflict';
  }

  // A decision that fails its own tests is a conflict; say so precisely.
  if (stateKey === 'record-conflict' && decision && !decisionValid && !conflicts.length) {
    conflicts.push({
      key: 'decision-not-valid',
      detail: decisionSeniority && !decisionSeniority.ok
        ? decisionSeniority.reason
        : decisionIndependence && !decisionIndependence.ok
          ? decisionIndependence.reason
          : 'The decision does not stand on the record it cites.',
    });
  }

  const terminal = DGI_TERMINAL_STATE_KEYS.includes(stateKey);
  const appealSanction = appealOutcome?.outcome === 'varied' ? appealOutcome.sanction : null;
  const effectiveSanction = appealOutcome
    ? (appealOutcome.outcome === 'varied' ? appealOutcome.sanction
      : appealOutcome.outcome === 'allowed' ? 'none'
        : decision?.sanction || null)
    : (decision?.sanction || null);
  const overturned = Boolean(appealOutcome && decision
    && appealOutcome.outcome !== 'refused'
    && DGI_SANCTION_RANK[effectiveSanction] !== DGI_SANCTION_RANK[decision.sanction]);

  return {
    case: caseRow,
    kind: DGI_CASE_KIND_BY_KEY[caseRow.caseKind] || null,
    standard: DGI_STANDARD_BY_KEY[caseRow.standardOfProof] || null,
    state: stateOf(stateKey),
    nextOwed,
    terminal,
    allegations: allegationsOut,
    allegationsN: allegationsOut.length,
    findingsOwedN,
    findingsComplete,
    upheldN: upheld.length,
    notUpheldN: notUpheld.length,
    caseUpheld,
    classKeys,
    investigator: currentInvestigator,
    investigatorHistory: investigation.history,
    investigatorIndependence,
    investigatorSeniority,
    investigatorValid,
    investigatorInvalidReason,
    directions: myDirections,
    directionsMatrix: {
      subjectInformed: myDirections.some((row) => row.kind === 'subject-informed'),
      companionOffered: myDirections.some((row) => row.kind === 'companion-offered'),
      interimMeasure: myDirections.filter((row) => row.kind === 'interim-measure').slice(-1)[0] || null,
      recusal: myDirections.filter((row) => row.kind === 'recusal-recorded').slice(-1)[0] || null,
    },
    decision,
    decisionSeniority,
    decisionIndependence,
    decisionValid,
    decisionsN: myDecisions.length,
    ladder,
    appeal,
    appealOutcome,
    appealIndependence,
    appealSeniority,
    appealDifferentHand,
    appealValid,
    appealLate,
    appealDaysLeft,
    appealSanction,
    effectiveSanction,
    overturned,
    withdrawal,
    withdrawalReason: withdrawal ? DGI_WITHDRAWAL_REASON_BY_KEY[withdrawal.reasonKey] || null : null,
    parties: parties.map((personId) => ({
      personId,
      role: personId === caseRow.subjectId ? 'subject' : 'raised-by',
      name: dgiPersonLabel(matrix, personId),
      onGraph: Boolean(matrix?.nodes?.has?.(personId)),
    })),
    managers,
    authority: {
      apexIds,
      ambiguous: Boolean(apex?.ambiguous) || apexIds.length > 1,
      resolved: authorityResolved,
      reason: matrixError
        ? 'The reporting graph could not be read.'
        : !managers.length
          ? 'No active reporting line carries a party to this case.'
          : !apexIds.length
            ? 'The current matrix has no common decision seat above the lines that hold the parties.'
            : apexIds.length > L.partiesMax + 10
              ? `The current matrix resolves ${apexIds.length} required apexes, above the supported limit.`
              : syntheticApex
                ? 'The only common authority is the synthetic workspace root, not a named human seat.'
                : null,
    },
    canAssign,
    canFind,
    canDecide,
    canLodge,
    canDecideAppeal,
    conflicts,
    isConflicted: stateKey === 'record-conflict',
  };
}

/** A comparator factory so two-row filters do not each hand-roll a string compare. */
function byDayOf(field) {
  return (a, b) => byDay(String(a?.[field] || ''), String(b?.[field] || ''));
}

/**
 * WHO MAY SEE A CASE. A seat sees a case it opened, an assigned hand on it, or a
 * party's manager — and never a case where it is neither. Above the detail ceiling
 * it receives counts only, and the reason is printed.
 */
export function dgiCanSeeCase(row, seat, { today } = {}) {
  if (!seat) return true;
  if (seat.fullAccess) return true;
  const seatId = seat.nodeId || seat.id || null;
  if (!seatId) return false;
  if (row.case.subjectId === seatId || row.case.raisedById === seatId) return true;
  if (row.case.declaredById === seatId) return true;
  if (row.investigator && row.investigator.investigatorId === seatId) return true;
  if (row.decision && row.decision.decidedById === seatId) return true;
  if (row.appealOutcome && row.appealOutcome.decidedById === seatId) return true;
  if ((row.authority.apexIds || []).includes(seatId)) return true;
  if (seat.scope?.has?.(row.case.subjectId) || seat.scope?.has?.(row.case.raisedById)) return true;
  if (seat.lineScope?.has?.(row.case.subjectId) || seat.lineScope?.has?.(row.case.raisedById)) return true;
  return false;
}

/** True where the case still demands an answer from somebody. */
function attentionFor(row) {
  return !row.terminal;
}

/**
 * The whole register. A seat may read the cases it holds; above the detail ceiling
 * it receives counts with the declared privacy floor and a printed reason.
 */
export function buildCaseToAnswer(stateValue, { now = new Date(), settings = null, seat = null } = {}) {
  const warnings = [];
  const at = now instanceof Date ? now : new Date(now);
  const asOfDay = dayKey(at) || at.toISOString().slice(0, 10);
  const cfg = { ...(stateValue?.settings || {}), ...(settings || {}) };
  const conventions = normalizeDgiSettings(cfg);

  const allegations = normalizeDgiAllegations(stateValue?.dgiAllegations, at, warnings);
  const cases = normalizeDgiCases(stateValue?.dgiCases, allegations, stateValue?.people, at, warnings);
  const investigators = normalizeDgiInvestigators(stateValue?.dgiInvestigators, cases, at, warnings);
  const directions = normalizeDgiDirections(stateValue?.dgiDirections, cases, at, warnings);
  const findings = normalizeDgiFindings(stateValue?.dgiFindings, cases, allegations, at, warnings);
  const decisions = normalizeDgiDecisions(stateValue?.dgiDecisions, cases, at, warnings);
  const appeals = normalizeDgiAppeals(stateValue?.dgiAppeals, cases, decisions, at, warnings);
  const appealOutcomes = normalizeDgiAppealOutcomes(stateValue?.dgiAppealOutcomes, appeals, at, warnings);
  const withdrawals = normalizeDgiWithdrawals(stateValue?.dgiWithdrawals, cases, at, warnings);
  const markers = normalizeDgiMarkers(stateValue?.dgiMarkers, at, warnings);

  let matrix = null;
  let matrixError = null;
  try {
    matrix = buildMatrix(stateValue, { now: at, settings: { ...cfg, activeSeatId: null } });
  } catch (error) {
    matrixError = `The reporting graph could not be read (${String(error?.message || 'unknown graph error').slice(0, 160)}).`;
  }

  // Pre-index the subject's own sanction history once, so the ladder read is not
  // an O(cases²) walk for every row on every render.
  const caseById = new Map(cases.map((row) => [row.id, row]));
  const findingsByCase = new Map();
  for (const row of findings) {
    const bucket = findingsByCase.get(row.caseId) || [];
    bucket.push(row);
    findingsByCase.set(row.caseId, bucket);
  }
  const allegationsByCaseId = new Map();
  for (const row of allegations) {
    const bucket = allegationsByCaseId.get(row.caseId) || [];
    bucket.push(row);
    allegationsByCaseId.set(row.caseId, bucket);
  }

  /**
   * The subject's own record, for the ladder. "Live" is tested at the DECISION day
   * of the case being read, not today: a warning that ran out after this case was
   * decided was live when it mattered, and a warning that has since expired must
   * not be used to escalate a new case as though it were still on the file.
   */
  function priorByClass({ subjectId, classKeys, beforeDay, excludeCaseId }) {
    const wanted = new Set(list(classKeys));
    const rows = [];
    for (const other of cases) {
      if (other.id === excludeCaseId || other.subjectId !== subjectId) continue;
      const decision = decisions.find((item) => item.caseId === other.id);
      if (!decision) continue;
      if (decision.decidedOn > beforeDay) continue;
      if (!dgiSanctionIsLive(decision, beforeDay)) continue;
      const otherAllegations = allegationsByCaseId.get(other.id) || [];
      const otherFindings = findingsByCase.get(other.id) || [];
      const classes = sortedUnique(otherAllegations
        .filter((allegation) => otherFindings.some((finding) => finding.allegationId === allegation.id && DGI_UPHELD_KEYS.includes(finding.outcome)))
        .map((allegation) => allegation.classKey));
      if (!classes.some((key) => wanted.has(key))) continue;
      rows.push({
        caseRef: other.caseRef,
        sanction: decision.sanction,
        decidedOn: decision.decidedOn,
        expiresOn: decision.expiresOn || null,
        classKeys: classes,
      });
    }
    rows.sort((a, b) => String(b.decidedOn).localeCompare(String(a.decidedOn)));
    return { prior: rows[0] || null, history: rows };
  }

  const inputRows = cases.map((caseRow) => deriveDgiCase({
    caseRow,
    allegations,
    investigators,
    directions,
    findings,
    decisions,
    appeals,
    appealOutcomes,
    withdrawals,
    matrix,
    matrixError,
    conventions,
    asOfDay,
    priorByClass,
  }));

  const detailed = !seat || seat.fullAccess || (Number.isInteger(seat.rank) && seat.rank <= 3);
  const scopedRows = seat && !seat.fullAccess ? inputRows.filter((row) => dgiCanSeeCase(row, seat)) : inputRows;
  const visibleRows = detailed ? scopedRows : [];
  const counts = Object.fromEntries(DGI_REVIEW_STATE_KEYS.map((key) => [key, 0]));
  for (const row of scopedRows) counts[row.state.key] = (counts[row.state.key] || 0) + 1;

  const floor = conventions.dgiPrivacyFloor;
  const safe = (value) => {
    if (!Number.isInteger(value)) return null;
    if (detailed) return value;
    return value === 0 || value >= floor ? value : null;
  };

  const caseN = scopedRows.length;
  const openN = scopedRows.filter(attentionFor).length;
  const decidedN = scopedRows.filter((row) => ['decided', 'appeal-window-closed'].includes(row.state.key)).length;
  const appealLodgedN = scopedRows.filter((row) => row.state.key === 'appeal-lodged').length;
  const appealDecidedN = scopedRows.filter((row) => row.state.key === 'appeal-decided').length;
  const withdrawnN = scopedRows.filter((row) => row.state.key === 'withdrawn').length;
  const conflictN = scopedRows.filter((row) => row.state.key === 'record-conflict').length;
  const investigatorInvalidN = scopedRows.filter((row) => row.state.key === 'investigator-invalid').length;
  const upheldN = scopedRows.filter((row) => row.caseUpheld).length;
  const notUpheldN = scopedRows.filter((row) => row.allegations.length && row.notUpheldN > 0 && !row.caseUpheld).length;
  const noCaseToAnswerN = scopedRows.filter((row) => row.allegations.length && row.allegations.every((item) => item.finding?.reliable && item.finding.outcome === 'no-case-to-answer')).length;
  const dismissalN = scopedRows.filter((row) => row.effectiveSanction === 'dismissal').length;
  const overturnedN = scopedRows.filter((row) => row.overturned).length;
  const ladderDepartureN = scopedRows.filter((row) => row.ladder?.isDeparture).length;
  const unreliableFindingN = scopedRows.reduce((sum, row) => sum + row.allegations.filter((item) => item.finding && !item.reliable).length, 0);
  const appealInvalidN = scopedRows.filter((row) => row.appealOutcome && !row.appealValid).length;
  const appealLateN = scopedRows.filter((row) => row.appealLate).length;
  const appealWindowOpenN = scopedRows.filter((row) => row.state.key === 'decided' && (row.appealDaysLeft ?? 0) >= 0).length;

  const states = DGI_REVIEW_STATE_KEYS.map((key) => ({
    key,
    label: DGI_REVIEW_STATE_BY_KEY[key].label,
    tone: DGI_REVIEW_STATE_BY_KEY[key].tone,
    count: safe(counts[key]),
    withheld: safe(counts[key]) === null,
    reason: safe(counts[key]) === null ? `Below the declared privacy floor of ${floor}; the count is withheld, not zero.` : null,
  }));

  const balances = {
    stateCountsReconcile: Object.values(counts).reduce((sum, value) => sum + value, 0) === caseN,
    findingsPartition: scopedRows.every((row) => row.upheldN + row.notUpheldN <= row.allegationsN),
    // The two claims the reliability mandate says must never be merged:
    actsComplete: scopedRows.every((row) => !row.findingsOwedN || row.state.key !== 'decision-owed'),
    recordClean: conflictN === 0 && unreliableFindingN === 0 && appealInvalidN === 0,
  };
  const figuresComplete = balances.stateCountsReconcile && warnings.length === 0 && !matrixError;

  const seatId = seat?.fullAccess ? LEADER_ID : (seat?.nodeId || seat?.id || null);
  const worklist = visibleRows.filter((row) => {
    if (!seatId || seat?.fullAccess) return false;
    if (row.canAssign && row.authority.apexIds.includes(seatId)) return true;
    if (row.canFind && row.investigator?.investigatorId === seatId) return true;
    if (row.canDecide && row.authority.apexIds.includes(seatId)) return true;
    if (row.canLodge && (row.case.subjectId === seatId || row.case.raisedById === seatId)) return true;
    if (row.canDecideAppeal && dgiStrictlySeniorTo(matrix, seatId, row.decision?.decidedById).ok
      && dgiIndependence(matrix, seatId, [row.case.subjectId, row.case.raisedById].filter(Boolean)).ok) return true;
    return false;
  });

  const attention = {
    total: openN,
    openN,
    decisionOwedN: scopedRows.filter((row) => row.state.key === 'decision-owed').length,
    findingsOwedN: scopedRows.filter((row) => ['findings-owed', 'investigator-assigned'].includes(row.state.key)).length,
    assignmentOwedN: scopedRows.filter((row) => ['open', 'investigator-invalid'].includes(row.state.key)).length,
    appealOwedN: appealLodgedN,
  };

  return {
    ok: true,
    engineVersion: DGI_ENGINE_VERSION,
    matrix,
    matrixError,
    asOf: asOfDay,
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
      : {
        level: 'aggregate',
        reason: `Above rank ${3}, case references, the parties, the allegations, the written findings, the sanctions and the named hands are withheld. A non-zero count below ${floor} is blank with a reason, never a small number.`,
      },
    states,
    counts: detailed ? counts : Object.fromEntries(states.map((row) => [row.key, row.count])),
    totals: {
      cases: safe(caseN),
      open: safe(openN),
      decided: safe(decidedN),
      appealLodged: safe(appealLodgedN),
      appealDecided: safe(appealDecidedN),
      withdrawn: safe(withdrawnN),
      recordConflict: safe(conflictN),
      investigatorInvalid: safe(investigatorInvalidN),
      upheld: safe(upheldN),
      notUpheld: safe(notUpheldN),
      noCaseToAnswer: safe(noCaseToAnswerN),
      dismissal: safe(dismissalN),
      overturned: safe(overturnedN),
      ladderDeparture: safe(ladderDepartureN),
      unreliableFindings: safe(unreliableFindingN),
      appealInvalid: safe(appealInvalidN),
      appealLate: safe(appealLateN),
      appealWindowOpen: safe(appealWindowOpenN),
    },
    balances,
    figuresComplete,
    attention,
    seat: seat
      ? { id: seatId, rank: seat.rank ?? null, fullAccess: Boolean(seat.fullAccess), label: seat.label || '' }
      : { id: null, rank: null, fullAccess: true, label: 'whole register (no seat)' },
  };
}

/** A navigation/worklist count; callers get only the seat-scoped obligations. */
export function caseToAnswerAttentionCount(stateValue, { now = new Date(), settings = null, seat = null } = {}) {
  try {
    const report = buildCaseToAnswer(stateValue, { now, settings, seat });
    return report?.ok ? report.attention.total : 0;
  } catch {
    return 0;
  }
}

/**
 * Identity-free rows shared by the workspace CSV and the suite: one summary row,
 * one row per case kind and one row per derived review state. No case reference,
 * person, manager, allegation, standard, finding, sanction reason or day crosses
 * this boundary.
 */
export function caseToAnswerCsvRows(report) {
  if (!report?.ok) return [];
  const rows = [];
  const floor = report.privacyFloor;
  const safe = (value) => (Number.isInteger(value) && (value === 0 || value >= floor) ? value : null);
  const blank = [];
  const summary = {
    as_of: report.asOf,
    row_kind: 'summary',
    case_kind: '',
    state: '',
    cases_n: safe(report.totals.cases),
    open_n: safe(report.totals.open),
    decided_n: safe(report.totals.decided),
    appeal_lodged_n: safe(report.totals.appealLodged),
    appeal_decided_n: safe(report.totals.appealDecided),
    withdrawn_n: safe(report.totals.withdrawn),
    record_conflict_n: safe(report.totals.recordConflict),
    upheld_n: safe(report.totals.upheld),
    not_upheld_n: safe(report.totals.notUpheld),
    no_case_to_answer_n: safe(report.totals.noCaseToAnswer),
    sanction_dismissal_n: safe(report.totals.dismissal),
    appeal_overturned_n: safe(report.totals.overturned),
    ladder_departure_n: safe(report.totals.ladderDeparture),
    privacy_floor: floor,
    complete: report.figuresComplete,
    blank_reason: '',
  };
  for (const [key, value] of Object.entries(summary)) {
    if (value === null && key.endsWith('_n')) blank.push(key);
  }
  if (blank.length) summary.blank_reason = `Below the declared privacy floor of ${floor}; withheld ${blank.join(', ')}.`;
  rows.push(summary);
  const states = report.states || [];
  for (const state of states) {
    rows.push({
      as_of: report.asOf,
      row_kind: 'state',
      case_kind: '',
      state: state.key,
      cases_n: state.count,
      open_n: '',
      decided_n: '',
      appeal_lodged_n: '',
      appeal_decided_n: '',
      withdrawn_n: '',
      record_conflict_n: '',
      upheld_n: '',
      not_upheld_n: '',
      no_case_to_answer_n: '',
      sanction_dismissal_n: '',
      appeal_overturned_n: '',
      ladder_departure_n: '',
      privacy_floor: floor,
      complete: report.figuresComplete,
      blank_reason: state.count === null ? `Below the declared privacy floor of ${floor}; the state count is withheld, not zero.` : '',
    });
  }
  const kinds = new Map();
  for (const row of report.rows || []) {
    const key = row.case.caseKind;
    kinds.set(key, (kinds.get(key) || 0) + 1);
  }
  for (const [kind, count] of [...kinds.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    rows.push({
      as_of: report.asOf,
      row_kind: 'kind',
      case_kind: kind,
      state: '',
      cases_n: safe(count),
      open_n: '',
      decided_n: '',
      appeal_lodged_n: '',
      appeal_decided_n: '',
      withdrawn_n: '',
      record_conflict_n: '',
      upheld_n: '',
      not_upheld_n: '',
      no_case_to_answer_n: '',
      sanction_dismissal_n: '',
      appeal_overturned_n: '',
      ladder_departure_n: '',
      privacy_floor: floor,
      complete: report.figuresComplete,
      blank_reason: safe(count) === null ? `Below the declared privacy floor of ${floor}; the count is withheld, not zero.` : '',
    });
  }
  return rows;
}

export { DGI_ALLEGATION_CLASS_BY_KEY, DGI_DIRECTION_KIND_BY_KEY, DGI_FINDING_BY_KEY, DGI_WITHDRAWAL_REASON_BY_KEY, LEADER_ID };

/**
 * Insights signals. Five facts worth a leader's attention, each with the printed
 * evidence and a route — and NONE of them a score on a person, a line or a manager.
 *
 * What these deliberately do NOT say: they do not report "how many of your people
 * are being disciplined" as if that were a management metric. A count of open cases
 * is a workload and a count of overdue ones is a failure of the procedure, so the
 * signals are about the PROCEDURE and never about the person inside it.
 */
export function caseToAnswerSignals(state, now = new Date(), settings = null) {
  let report;
  try {
    report = buildCaseToAnswer(state, { now, settings, seat: null });
  } catch {
    return [];
  }
  if (!report?.ok) return [];
  const signals = [];
  const add = (signal) => signals.push({ domain: 'Fair process & discipline', route: '#/fair-process', ...signal });
  const t = report.totals;

  if (t.recordConflict) {
    add({
      ruleId: 'DGI-01',
      severity: 5,
      confidence: 'high',
      title: `${t.recordConflict} fair-process case(s) carry acts that cannot all be true in a fair order`,
      detail: 'A finding dated before the case, a decision before every finding, two decisions, an appeal before a decision, a finding on a standard the case never declared, or an act recorded by a hand that was not independent. The register prints the conflict and resolves nothing by preferring one row.',
      action: { label: 'Open the fair-process register', route: '#/fair-process' },
      evidence: [`${t.cases} case(s) on the register`, `${t.unreliableFindings} finding(s) that do not count`],
    });
  }

  if (t.investigatorInvalid) {
    add({
      ruleId: 'DGI-02',
      severity: 5,
      confidence: 'high',
      title: `${t.investigatorInvalid} case(s) whose investigator is no longer independent or no longer senior`,
      detail: 'Independence and seniority are recomputed from the live reporting graph on every read, so a line change after assignment is printed rather than grandfathered. A finding recorded by that hand does not count until the case is reassigned.',
      action: { label: 'Reassign the investigation', route: '#/fair-process' },
      evidence: [`${t.open} open case(s) in total`],
    });
  }

  if (t.findingsOwed || t.assignmentOwed) {
    add({
      ruleId: 'DGI-03',
      severity: 4,
      confidence: 'high',
      title: `${(t.assignmentOwed || 0) + (t.findingsOwed || 0)} case(s) waiting on the procedure, not on the person`,
      detail: `${t.assignmentOwed || 0} have no investigator able to hold them fairly and ${t.findingsOwed || 0} carry allegations with no reliable written finding. Every day here is a day a named person waits for an answer they are owed.`,
      action: { label: 'Open the fair-process register', route: '#/fair-process' },
      evidence: [`${t.decisionOwed || 0} further case(s) waiting on a sanction decision`],
    });
  }

  if (t.decisionOwed) {
    add({
      ruleId: 'DGI-04',
      severity: 4,
      confidence: 'high',
      title: `${t.decisionOwed} case(s) with complete written findings and no sanction decision`,
      detail: 'The findings are on the record and the decision is owed by a hand strictly senior to the investigator. The register computes the ladder rung this person’s own live record suggests and prints it beside the rung chosen, with any departure counted.',
      action: { label: 'Decide the sanction', route: '#/fair-process' },
      evidence: [`${t.upheld} case(s) with at least one upheld allegation`],
    });
  }

  if (t.ladderDeparture) {
    add({
      ruleId: 'DGI-05',
      severity: 3,
      confidence: 'high',
      title: `${t.ladderDeparture} decision(s) depart from the consistency ladder`,
      detail: 'The ladder is computed from the person’s own most recent live sanction of the same class and prints the lowest rung above it. A departure is permitted and is recorded with its written reason — what is not permitted is a departure nobody can see.',
      action: { label: 'Read the consistency panel', route: '#/fair-process?view=ladder' },
      evidence: [`${t.dismissal} dismissal decision(s) on the record`, `${t.overturned} appeal(s) overturned the decision below`],
    });
  }

  if (t.appealInvalid || t.appealLate) {
    add({
      ruleId: 'DGI-06',
      severity: 4,
      confidence: 'high',
      title: `${(t.appealInvalid || 0) + (t.appealLate || 0)} appeal problem(s) on the record`,
      detail: `${t.appealInvalid || 0} appeal outcome(s) were recorded by a hand that was not a different, strictly senior seat, and ${t.appealLate || 0} appeal(s) were lodged after the declared window. Both are kept and printed; neither is corrected by the register.`,
      action: { label: 'Open the appeals', route: '#/fair-process?view=cases' },
      evidence: [`${t.appealWindowOpen || 0} appeal window(s) still open`],
    });
  }

  return signals;
}
