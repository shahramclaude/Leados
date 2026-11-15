/**
 * app/core/domain/incentiveIntegrity.js — the pure reader of the Variable-Pay
 * Design & Incentive Integrity Register (ADR-0220, Schema v174, `#/incentive`).
 *
 * ONE READER. Every figure, verdict, count, coverage gap, contest, escalation
 * and attention number the screen and the rule print is computed here from the
 * stored plans, measures, readings, awards and recovery acts, and the live
 * matrix. Nothing derived is stored, so a hand-edited file cannot carry an
 * integrity verdict its own rows do not imply.
 *
 * WHAT IS KEPT APART, ALWAYS:
 *
 *   1. WHAT A PLAN PAYS FOR AND WHAT IT PAID. A measure is a declared outcome
 *      with an exact target and a declared control; an award is money decided
 *      for a person. The reader never derives one from the other.
 *   2. THE AWARD'S VERDICT AND ITS MONEY BUCKET. A state (`provable`, `missed`,
 *      `discretionary`, `unverified`, `recovery-due`) says what stands behind the
 *      award. A bucket says where its cents are counted, and every award is in
 *      exactly ONE bucket: a CONTESTED award is in the contested bucket even
 *      when its own state is provable, so no cent is ever counted twice.
 *   3. "THE FIGURES ADD UP" AND "THE PRINTED FIGURES ARE THE COMPUTED ONES".
 *      `countsReconcile` proves the per-plan counts are the row count;
 *      `figuresComplete` proves nothing is missing, unverified, drifted or
 *      withheld. Neither word is used for the other.
 *   4. ONE OUTCOME PAID TWICE. In a matrix a person sits on several lines, so
 *      two plans can pay for the same measure key over overlapping windows. The
 *      pair is CONTESTED: both amounts are held out of the provable total and
 *      the pair is named. The reader never picks one scheme as the real one and
 *      never splits the money between them.
 *   5. VERIFICATION THAT DRIFTED. A reading verified by a seat that the live
 *      matrix no longer puts above the funding line reads unverified — the
 *      evidence weakened after the fact and the register says so instead of
 *      preserving a stale verification.
 *
 * MONEY. Per plan currency, exact integer cents, `BigInt` sums, no conversion
 * and no pooling. Every currency gets its own total; the register never prints
 * one number across currencies.
 *
 * DISCLOSURE. The reader scopes plans to the seat that holds their owner
 * (span or declared line) and withholds individual award rows above the
 * manager-of-the-funding-line altitude. When it withholds anything it says so
 * and refuses to certify the workspace-wide coverage claim from that seat.
 */

import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import { canSee } from './seat.js';
import {
  normalizeIncAwards,
  normalizeIncMarkers,
  normalizeIncMeasures,
  normalizeIncPlans,
  normalizeIncReadings,
  normalizeIncRecoveries,
  incText,
} from './incentiveSchema.js';
import {
  INC_AWARD_STATES,
  INC_ENGINE_VERSION,
  INC_LIMITS as L,
  INC_METHOD,
} from './incentiveRegistry.js';

export const INC_PLAN_COLLECTION = 'incentivePlans';
export const INC_MEASURE_COLLECTION = 'incentiveMeasures';
export const INC_READING_COLLECTION = 'incentiveReadings';
export const INC_AWARD_COLLECTION = 'incentiveAwards';
export const INC_RECOVERY_COLLECTION = 'incentiveRecoveries';

/** The actor a seat acts as: the operator is the leader, a declared seat is its node. */
export function incentiveActorId(seat) {
  if (!seat) return null;
  return seat.fullAccess ? LEADER_ID : (seat.nodeId || seat.id || null);
}

/** The matrix, built with no active seat so a reading never depends on who is looking. */
export function incentiveMatrix(state, now, settings) {
  return buildMatrix(state, { now, settings: { ...(settings || {}), activeSeatId: null } });
}

const nameOf = (matrix, id) => {
  if (!id) return null;
  const node = matrix?.nodes?.get(id);
  return (node && node.name) || id;
};

const list = (value) => (Array.isArray(value) ? value : []);

/** Exact sum of non-negative integer cents; null (withheld) if any row or the
 * total leaves the exact range. Never rounded, never printed as zero. */
export function incSumCents(values) {
  let total = 0n;
  for (const cents of values) {
    if (!Number.isSafeInteger(cents) || cents < 0) return null;
    total += BigInt(cents);
    if (total > BigInt(L.centsMax)) return null;
  }
  return Number(total);
}

/** Add two exact cents figures. Null propagates: a total the register cannot
 * hold exactly is withheld, never silently reduced by the unreadable part. */
export function addCents(a, b) {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b)) return null;
  const total = BigInt(a) + BigInt(b);
  if (total > BigInt(L.centsMax)) return null;
  return Number(total);
}

/** Sort readings the way the record orders them: by day, then verification, then id. */
function compareReadings(a, b) {
  if (a.asOf !== b.asOf) return a.asOf < b.asOf ? -1 : 1;
  if (a.verifiedOn !== b.verifiedOn) return a.verifiedOn < b.verifiedOn ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * The rests the newest reading on or before a day. A reading dated after the
 * decision is NOT evidence for it — the money was decided before the number
 * existed.
 */
export function readingInForce(readings, day) {
  const eligible = list(readings).filter((row) => row.asOf <= day);
  return eligible.length ? eligible.slice().sort(compareReadings).at(-1) : null;
}

/**
 * Follow an explicit restatement chain. Returns the terminal reading (which may
 * be the reading itself when nothing restates it) and the depth walked. A chain
 * deeper than eight is refused rather than followed forever.
 */
export function terminalRestatement(readings, readingId) {
  const byRestated = new Map();
  for (const row of list(readings)) {
    if (row.restatesId) byRestated.set(row.restatesId, row);
  }
  let current = list(readings).find((row) => row.id === readingId) || null;
  let depth = 0;
  while (current && byRestated.has(current.id) && depth < 8) {
    current = byRestated.get(current.id);
    depth += 1;
  }
  return { reading: current, depth, chained: depth > 0 };
}

/** Does a reading meet its measure's declared target? Exact integer comparison. */
export function readingMeetsTarget(reading, measure) {
  if (!reading || !measure) return null;
  if (measure.unit === 'money') {
    if (!Number.isSafeInteger(reading.actualCents) || !Number.isSafeInteger(measure.targetCents)) return null;
    return measure.direction === 'increase'
      ? reading.actualCents >= measure.targetCents
      : reading.actualCents <= measure.targetCents;
  }
  if (!Number.isSafeInteger(reading.actualCount) || !Number.isSafeInteger(measure.targetCount)) return null;
  return measure.direction === 'increase'
    ? reading.actualCount >= measure.targetCount
    : reading.actualCount <= measure.targetCount;
}

/** Is the verifier still above the plan's owner on the live matrix? */
export function verifierStanding(matrix, plan, reading) {
  if (!matrix || !plan || !reading) return { ok: false, reason: 'matrix-unreadable' };
  if (!matrix.nodes?.has?.(plan.ownerId)) return { ok: false, reason: 'owner-off-roster' };
  if (reading.verifiedById === plan.ownerId) return { ok: false, reason: 'self-verified' };
  const above = matrix.nodes.get(plan.ownerId)?.ancestors;
  if (!above || !above.has(reading.verifiedById)) return { ok: false, reason: 'verifier-not-above' };
  return { ok: true, reason: '' };
}

/**
 * The live envelope per funding line, currency and window. Retirement is final:
 * a retired plan keeps its awards and its history, and is never revived.
 */
export function liveIncPlans(plans, asOf) {
  const live = [];
  const retired = [];
  const future = [];
  for (const row of list(plans)) {
    if (row.declaredOn > asOf) { future.push(row); continue; }
    if (row.retiredOn && row.retiredOn <= asOf) retired.push(row);
    else live.push(row);
  }
  return { live, retired, future };
}

/** Does this seat hold the plan's funding line (or is it the operator)? */
function seatHoldsPlanOwner(seat, ownerId) {
  if (!seat) return false;
  if (seat.fullAccess) return true;
  const nodeId = seat.nodeId || seat.id || null;
  if (!nodeId) return false;
  if (ownerId === nodeId) return true;
  if (seat.scope?.has?.(ownerId)) return true;
  if (seat.lineScope?.has?.(ownerId)) return true;
  return false;
}

/**
 * The seat above every line that funds a set of owners. Deliberately the
 * MANAGERS of the owners: a funding line cannot clear its own overrun, so the
 * ask goes one rung up, and above EVERY line in a matrix rather than one.
 */
export function fundingApex(matrix, ownerIds) {
  const managers = new Set();
  for (const ownerId of ownerIds || []) {
    if (!ownerId) continue;
    const lines = matrix?.linesByPerson?.get?.(ownerId) || [];
    let found = false;
    for (const line of lines) {
      if (line?.active === false) continue;
      if (line?.managerId && matrix?.nodes?.has?.(line.managerId)) { managers.add(line.managerId); found = true; }
    }
    if (!found) {
      for (const managerId of matrix?.nodes?.get?.(ownerId)?.managerIds || []) {
        if (matrix?.nodes?.has?.(managerId)) managers.add(managerId);
      }
    }
  }
  const ids = [...managers].sort();
  const apex = matrix ? matrixJointApex(matrix, ids) : { apexIds: [], apexId: null, unique: false, ambiguous: false, disconnected: false, isLeaderOnly: false };
  return { managerIds: ids, ...apex };
}

const emptyCurrencyTotals = () => ({
  plansLive: 0, plansRetired: 0, plansOverCeiling: 0, plansWithoutMeasure: 0, plansWithoutReading: 0,
  measures: 0, measuresOutside: 0,
  awardsN: 0,
  awardedCents: 0,
  provableCents: 0, missedCents: 0, discretionaryCents: 0, unverifiedCents: 0, recoveryDueCents: 0, contestedCents: 0,
  awardsProvable: 0, awardsMissed: 0, awardsDiscretionary: 0, awardsUnverified: 0, awardsRecoveryDue: 0, awardsContested: 0,
  recoveryRecordedCents: 0, recoveryWaivedCents: 0, recoveryDemandedCents: 0,
  recoveryOutstandingCents: 0, recoveryOutstandingN: 0,
  contests: 0,
});

/**
 * The whole register. Pure: every figure is re-derived on each call.
 */
export function buildIncentiveIntegrity(state, { now = new Date(), settings = null, seat = null } = {}) {
  const warnings = [];
  const at = now instanceof Date ? now : new Date(now);
  const asOf = dayKey(at) || L.dayMin;
  const plansAll = normalizeIncPlans(state?.incentivePlans, warnings);
  const measuresAll = normalizeIncMeasures(state?.incentiveMeasures, warnings);
  const readingsAll = normalizeIncReadings(state?.incentiveReadings, measuresAll, warnings);
  const awardsAll = normalizeIncAwards(state?.incentiveAwards, warnings);
  const recoveriesAll = normalizeIncRecoveries(state?.incentiveRecoveries, warnings);
  const markers = normalizeIncMarkers(state?.incentiveMarkers, warnings);

  let matrix = null;
  let matrixError = null;
  try {
    matrix = incentiveMatrix(state, at, settings || state?.settings || null);
  } catch (error) {
    matrixError = `The reporting graph could not be read, so funding lines, verification standing and escalation cannot be computed: ${error?.message || 'unknown error'}.`;
  }

  const { live: livePlans, retired: retiredPlans } = liveIncPlans(plansAll, asOf);
  const plansById = new Map(plansAll.map((row) => [row.id, row]));
  const measuresByPlan = new Map();
  for (const measure of measuresAll) {
    if (!measuresByPlan.has(measure.planId)) measuresByPlan.set(measure.planId, []);
    measuresByPlan.get(measure.planId).push(measure);
  }
  const measuresById = new Map(measuresAll.map((row) => [row.id, row]));
  const readingsByMeasure = new Map();
  for (const reading of readingsAll) {
    if (!readingsByMeasure.has(reading.measureId)) readingsByMeasure.set(reading.measureId, []);
    readingsByMeasure.get(reading.measureId).push(reading);
  }
  for (const [key, rows] of readingsByMeasure.entries()) readingsByMeasure.set(key, rows.slice().sort(compareReadings));

  /* ------------------------------------------------------------ plan scope */
  const scoped = Boolean(seat) && !seat.fullAccess;
  const inScopePlan = (plan) => (scoped ? seatHoldsPlanOwner(seat, plan.ownerId) : true);
  const visiblePlans = plansAll.filter(inScopePlan);
  const plansOutsideScopeN = plansAll.length - visiblePlans.length;
  const visiblePlanIds = new Set(visiblePlans.map((row) => row.id));

  /* ----------------------------------------------------------- award states */
  const recoveriesByAward = new Map();
  for (const act of recoveriesAll) {
    if (!recoveriesByAward.has(act.awardId)) recoveriesByAward.set(act.awardId, []);
    recoveriesByAward.get(act.awardId).push(act);
  }

  const awardRows = [];
  let orphanAwardN = 0;
  let awardOutsideScopeN = 0;
  for (const award of awardsAll) {
    const plan = plansById.get(award.planId) || null;
    if (!plan) { orphanAwardN += 1; continue; }
    if (!visiblePlanIds.has(plan.id)) { awardOutsideScopeN += 1; continue; }
    const measure = award.measureId ? (measuresById.get(award.measureId) || null) : null;
    const planReadings = measure ? (readingsByMeasure.get(measure.id) || []) : [];
    const basis = measure ? readingInForce(planReadings, award.decidedOn) : null;
    const standing = basis ? verifierStanding(matrix, plan, basis) : { ok: false, reason: measure ? 'no-reading' : 'measure-missing' };
    const terminal = basis ? terminalRestatement(planReadings, basis.id) : { reading: null, depth: 0, chained: false };
    const basisMet = readingMeetsTarget(basis, measure);
    const terminalMet = terminal.chained ? readingMeetsTarget(terminal.reading, measure) : basisMet;

    let awardState;
    let stateReason = '';
    if (!measure) {
      if (award.basisKind === 'discretionary') awardState = 'discretionary';
      else { awardState = 'unverified'; stateReason = 'measured basis with no readable measure'; }
    } else if (!basis) {
      awardState = 'unverified'; stateReason = 'no reading on or before the decision day';
    } else if (!standing.ok) {
      awardState = 'unverified'; stateReason = `the verifier is not above the funding line (${standing.reason})`;
    } else if (award.basisKind === 'discretionary') {
      awardState = 'discretionary';
    } else if (basisMet === null) {
      awardState = 'unverified'; stateReason = 'the target or the reading is not an exact figure';
    } else if (basisMet && terminal.chained && terminalMet === false) {
      awardState = 'recovery-due';
      stateReason = 'the reading this award rested on was restated and no longer meets the target';
    } else if (basisMet) {
      awardState = 'provable';
    } else {
      awardState = 'missed';
      stateReason = 'the reading in force on the decision day did not meet the target';
    }

    const acts = recoveriesByAward.get(award.id) || [];
    const recorded = incSumCents(acts.filter((act) => act.state === 'recovered').map((act) => act.amountCents));
    const waived = incSumCents(acts.filter((act) => act.state === 'waived').map((act) => act.amountCents));
    const demanded = incSumCents(acts.filter((act) => act.state === 'demanded').map((act) => act.amountCents));
    const dueCents = awardState === 'recovery-due' ? award.amountCents : 0;
    const outstandingCents = dueCents > 0 && recorded !== null && waived !== null
      ? Math.max(0, dueCents - recorded - waived)
      : (dueCents > 0 ? null : 0);

    awardRows.push({
      ...award,
      currency: plan.currency,
      planLabel: plan.label,
      planOwnerId: plan.ownerId,
      planStatus: plan.retiredOn ? 'retired' : 'live',
      personName: nameOf(matrix, award.personId),
      measureKey: measure?.key || null,
      measureLabel: measure?.label || null,
      direction: measure?.direction || null,
      unit: measure?.unit || null,
      control: measure?.control || null,
      targetCents: measure?.targetCents ?? null,
      targetCount: measure?.targetCount ?? null,
      basisReadingId: basis?.id || null,
      basisActualCents: basis?.actualCents ?? null,
      basisActualCount: basis?.actualCount ?? null,
      basisAsOf: basis?.asOf || null,
      verifiedById: basis?.verifiedById || null,
      verifiedByName: nameOf(matrix, basis?.verifiedById),
      restated: terminal.chained,
      restatedReadingId: terminal.chained ? terminal.reading?.id || null : null,
      restatedActualCents: terminal.chained ? (terminal.reading?.actualCents ?? null) : null,
      restatedActualCount: terminal.chained ? (terminal.reading?.actualCount ?? null) : null,
      basisMeetsTarget: basisMet,
      currentMeetsTarget: terminal.chained ? terminalMet : basisMet,
      state: awardState,
      stateReason,
      recovery: {
        acts,
        dueCents,
        outstandingCents,
        recordedCents: recorded,
        waivedCents: waived,
        demandedCents: demanded,
      },
      contested: false,
      contestKey: null,
      bucket: awardState,
    });
  }

  /* --------------------------------------------------------------- contests */
  const byKey = new Map();
  for (const award of awardRows) {
    if (!award.measureKey) continue;
    if (!byKey.has(award.measureKey)) byKey.set(award.measureKey, []);
    byKey.get(award.measureKey).push(award);
  }
  const contests = [];
  for (const [key, rows] of byKey.entries()) {
    if (rows.length < 2) continue;
    const planIds = [...new Set(rows.map((row) => row.planId))];
    if (planIds.length < 2) continue;
    // Two plans pay the same outcome only when their windows overlap in time.
    const overlapping = [];
    for (let i = 0; i < planIds.length; i += 1) {
      for (let j = i + 1; j < planIds.length; j += 1) {
        const a = plansById.get(planIds[i]);
        const b = plansById.get(planIds[j]);
        if (!a || !b) continue;
        const intersects = a.periodFrom <= b.periodTo && b.periodFrom <= a.periodTo;
        if (intersects) overlapping.push([a.id, b.id]);
      }
    }
    if (!overlapping.length) continue;
    const involvedPlans = [...new Set(overlapping.flat())];
    const owners = [...new Set(involvedPlans.map((id) => plansById.get(id)?.ownerId).filter(Boolean))];
    const involvedAwards = rows.filter((row) => involvedPlans.includes(row.planId));
    const currencies = [...new Set(involvedAwards.map((row) => row.currency))].sort();
    const centsByCurrency = {};
    for (const currency of currencies) {
      centsByCurrency[currency] = incSumCents(involvedAwards.filter((row) => row.currency === currency).map((row) => row.amountCents));
    }
    for (const row of involvedAwards) {
      row.contested = true;
      row.contestKey = key;
      row.bucket = 'contested';
    }
    contests.push({
      key,
      planIds: involvedPlans.sort(),
      ownerIds: owners.sort(),
      overlappingPairs: overlapping,
      awardIds: involvedAwards.map((row) => row.id).sort(),
      currencies,
      centsByCurrency,
      label: involvedAwards.find((row) => row.measureLabel)?.measureLabel || key,
      escalation: fundingApex(matrix, owners),
      reason: `The same measure “${key}” is paid by ${involvedPlans.length} plans whose windows overlap. Both amounts are held out of the provable total: the register does not decide which scheme owns the result and does not split the money.`,
    });
  }
  contests.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  /* ------------------------------------------------------- per-plan readings */
  const measureRows = [];
  let measuresWithoutPlanN = 0;
  for (const measure of measuresAll) {
    const plan = plansById.get(measure.planId) || null;
    if (!plan) { measuresWithoutPlanN += 1; continue; }
    if (!visiblePlanIds.has(plan.id)) continue;
    const rows = readingsByMeasure.get(measure.id) || [];
    const newest = rows.length ? rows.at(-1) : null;
    const standing = newest ? verifierStanding(matrix, plan, newest) : null;
    measureRows.push({
      ...measure,
      planLabel: plan.label,
      planOwnerId: plan.ownerId,
      currency: plan.currency,
      readingsN: rows.length,
      newestReading: newest,
      newestMeets: newest ? readingMeetsTarget(newest, measure) : null,
      verified: Boolean(newest && standing?.ok),
      standingReason: newest ? (standing?.ok ? '' : standing?.reason || 'unverified') : 'no-reading',
      readsAt: newest
        ? { cents: newest.actualCents ?? null, count: newest.actualCount ?? null, asOf: newest.asOf, verifiedById: newest.verifiedById }
        : null,
      controlLabel: measure.control,
    });
  }
  const visibleMeasures = measureRows;
  const measuresByPlanVisible = new Map();
  for (const measure of visibleMeasures) {
    if (!measuresByPlanVisible.has(measure.planId)) measuresByPlanVisible.set(measure.planId, []);
    measuresByPlanVisible.get(measure.planId).push(measure);
  }

  /* ---------------------------------------------------------------- plans */
  const currencies = new Map();
  const currencyOf = (code) => {
    if (!currencies.has(code)) currencies.set(code, emptyCurrencyTotals());
    return currencies.get(code);
  };

  const awardsByPlan = new Map();
  for (const award of awardRows) {
    if (!awardsByPlan.has(award.planId)) awardsByPlan.set(award.planId, []);
    awardsByPlan.get(award.planId).push(award);
  }
  const contestKeys = new Set(contests.map((row) => row.key));

  const planRows = [];
  let plansWithoutMeasureN = 0;
  let plansWithoutReadingN = 0;
  let plansOverCeilingN = 0;
  for (const plan of visiblePlans) {
    const rows = awardsByPlan.get(plan.id) || [];
    const measures = measuresByPlanVisible.get(plan.id) || [];
    const bucket = (key) => incSumCents(rows.filter((row) => row.bucket === key).map((row) => row.amountCents));
    const awardedCents = incSumCents(rows.map((row) => row.amountCents));
    const provableCents = bucket('provable');
    const overByCents = awardedCents === null ? null : Math.max(0, awardedCents - plan.ceilingCents);
    const remainingCents = awardedCents === null ? null : Math.max(0, plan.ceilingCents - awardedCents);
    const status = plan.retiredOn ? 'retired' : 'live';
    const started = plan.periodFrom <= asOf;
    const hasVerifiedReading = measures.some((row) => row.verified);
    const unmeasured = status === 'live' && started && measures.length > 0 && !hasVerifiedReading;
    const verdict = matrixError || awardedCents === null
      ? 'unmeasurable'
      : (awardedCents > plan.ceilingCents ? 'over-ceiling' : 'within-ceiling');
    if (verdict === 'over-ceiling') plansOverCeilingN += 1;
    if (status === 'live' && measures.length === 0) plansWithoutMeasureN += 1;
    if (status === 'live' && started && measures.length > 0 && !hasVerifiedReading) plansWithoutReadingN += 1;

    const escalation = fundingApex(matrix, [plan.ownerId]);
    const row = {
      ...plan,
      status,
      ownerName: nameOf(matrix, plan.ownerId) || plan.ownerId,
      measures,
      measuresN: measures.length,
      controlsOutsideN: measures.filter((measure) => measure.control === 'outside').length,
      awards: rows.map((r) => r.id),
      awardsN: rows.length,
      awardedCents,
      remainingCents,
      overByCents,
      verdict,
      verdictReason: matrixError
        ? 'The reporting graph could not be read, so this plan cannot be judged.'
        : (awardedCents === null ? 'The awards do not sum to a figure this register can hold exactly. Nothing is rounded and nothing is printed as zero.' : ''),
      provableCents,
      missedCents: bucket('missed'),
      discretionaryCents: bucket('discretionary'),
      unverifiedCents: bucket('unverified'),
      recoveryDueCents: bucket('recovery-due'),
      contestedCents: bucket('contested'),
      recoveryOutstandingN: rows.filter((r) => (r.recovery.outstandingCents ?? 0) > 0).length,
      recoveryOutstandingCents: incSumCents(rows.map((r) => r.recovery.outstandingCents ?? 0)),
      provableN: rows.filter((r) => r.bucket === 'provable').length,
      contestedN: rows.filter((r) => r.contested).length,
      outsideControlAwardsN: rows.filter((r) => r.control === 'outside').length,
      outsideControlCents: incSumCents(rows.filter((r) => r.control === 'outside').map((r) => r.amountCents)),
      unmeasured,
      escalation,
    };
    planRows.push(row);

    const totals = currencyOf(plan.currency);
    if (status === 'live') totals.plansLive += 1; else totals.plansRetired += 1;
    if (verdict === 'over-ceiling') totals.plansOverCeiling += 1;
    if (status === 'live' && measures.length === 0) totals.plansWithoutMeasure += 1;
    if (unmeasured) totals.plansWithoutReading += 1;
    totals.measures += measures.length;
    totals.measuresOutside += measures.filter((measure) => measure.control === 'outside').length;
    totals.awardsN += rows.length;
    totals.awardedCents = addCents(totals.awardedCents, awardedCents);
    totals.awardsProvable += rows.filter((r) => r.bucket === 'provable').length;
    totals.awardsMissed += rows.filter((r) => r.bucket === 'missed').length;
    totals.awardsDiscretionary += rows.filter((r) => r.bucket === 'discretionary').length;
    totals.awardsUnverified += rows.filter((r) => r.bucket === 'unverified').length;
    totals.awardsRecoveryDue += rows.filter((r) => r.bucket === 'recovery-due').length;
    totals.awardsContested += rows.filter((r) => r.bucket === 'contested').length;
    for (const key of ['provable', 'missed', 'discretionary', 'unverified', 'recovery-due', 'contested']) {
      const field = `${key === 'recovery-due' ? 'recoveryDue' : key}Cents`;
      totals[field] = addCents(totals[field], bucket(key));
    }
  }

  /* -------------------------------------------------------------- recovery */
  let recoveryOutstandingN = 0;
  for (const award of awardRows) {
    const totals = currencyOf(award.currency);
    totals.recoveryRecordedCents = addCents(totals.recoveryRecordedCents, award.recovery.recordedCents ?? 0);
    totals.recoveryWaivedCents = addCents(totals.recoveryWaivedCents, award.recovery.waivedCents ?? 0);
    totals.recoveryDemandedCents = addCents(totals.recoveryDemandedCents, award.recovery.demandedCents ?? 0);
    if (award.recovery.outstandingCents !== null && award.recovery.outstandingCents > 0) {
      totals.recoveryOutstandingCents = addCents(totals.recoveryOutstandingCents, award.recovery.outstandingCents);
      totals.recoveryOutstandingN += 1;
      recoveryOutstandingN += 1;
    }
  }
  for (const contest of contests) {
    for (const code of contest.currencies) currencyOf(code).contests += 1;
  }

  /* ---------------------------------------------------- disclosure of rows */
  const awardDetail = !seat ? true : (seat.fullAccess ? true : canSee({ id: 'inc-award', personId: null }, INC_AWARD_COLLECTION, seat, null).allow === 'full');
  const visibleAwardRows = awardDetail
    ? awardRows
    : awardRows.map((row) => ({
      ...row,
      amountCents: null,
      personId: null,
      personName: null,
      decidedById: null,
      verifiedById: null,
      verifiedByName: null,
      rationale: '',
      recovery: { ...row.recovery, acts: [] },
    }));
  const withheldAwardN = awardDetail ? 0 : awardRows.length;

  /* ---------------------------------------------------------------- claims */
  const planAwardsSum = planRows.reduce((sum, row) => sum + row.awardsN, 0);
  const countedAwardsN = awardRows.length;
  const countsReconcile = planAwardsSum === countedAwardsN
    && [...currencies.values()].every((totals) => Number.isSafeInteger(totals.awardedCents));
  const awardsWithoutReadingN = awardRows.filter((row) => row.state === 'unverified' && row.stateReason.startsWith('no reading')).length;
  const verifierDriftedN = awardRows.filter((row) => row.state === 'unverified' && row.stateReason.includes('not above')).length;
  const figuresComplete = orphanAwardN === 0
    && measuresWithoutPlanN === 0
    && plansWithoutMeasureN === 0
    && plansWithoutReadingN === 0
    && awardsWithoutReadingN === 0
    && verifierDriftedN === 0
    && withheldAwardN === 0
    && matrixError === null;

  const claims = {
    countsReconcile,
    planAwardsSum,
    countedAwardsN,
    figuresComplete,
    orphanAwardN,
    measuresWithoutPlanN,
    plansWithoutMeasureN,
    plansWithoutReadingN,
    awardsWithoutReadingN,
    verifierDriftedN,
    withheldAwardN,
    plansOutsideScopeN,
    awardOutsideScopeN,
    scoped,
  };

  const currencyRows = [...currencies.entries()]
    .map(([currency, totals]) => ({ currency, ...totals }))
    .sort((a, b) => (a.currency < b.currency ? -1 : a.currency > b.currency ? 1 : 0));

  return {
    asOf,
    engine: INC_ENGINE_VERSION,
    method: INC_METHOD,
    matrixError,
    warnings,
    scope: {
      seatId: seat?.nodeId || seat?.id || null,
      seatLabel: seat?.label || null,
      rank: seat?.rank ?? null,
      fullAccess: Boolean(seat?.fullAccess),
      scoped,
      plansInScopeN: visiblePlans.length,
      plansOutsideScopeN,
      awardDetail,
      withheldAwardN,
    },
    plans: planRows,
    measures: measureRows,
    awards: visibleAwardRows,
    contests,
    recoveries: recoveriesAll.filter((act) => awardRows.some((row) => row.id === act.awardId)),
    markers,
    currencies: currencyRows,
    claims,
    gaps: {
      plansWithoutMeasureN,
      plansWithoutReadingN,
      plansOverCeilingN,
      awardsWithoutReadingN,
      verifierDriftedN,
      orphanAwardN,
      measuresWithoutPlanN,
      measuresOutsideControlN: measureRows.filter((row) => row.control === 'outside').length,
      recoveryOutstandingN,
      contestsN: contests.length,
    },
    counts: {
      plansLive: livePlans.length,
      plansRetired: retiredPlans.length,
      plansTotal: plansAll.length,
      measures: measuresAll.length,
      readings: readingsAll.length,
      awards: awardsAll.length,
      recoveries: recoveriesAll.length,
      contests: contests.length,
    },
    awardStates: INC_AWARD_STATES.map((row) => row.key),
  };
}

/**
 * How many conditions this seat is the addressee of. Deliberately the same
 * conditions `RULE-INC-01` files, computed from the same reader: a badge that
 * counts something the rule would not ask is a badge that lies.
 */
export function incentiveAttentionCount(state, { now = new Date(), settings = null, seat = null } = {}) {
  const report = buildIncentiveIntegrity(state, { now, settings, seat });
  const nodeId = seat ? (seat.fullAccess ? LEADER_ID : (seat.nodeId || seat.id || null)) : null;
  const isAddressee = (apex) => {
    if (!seat) return false;
    if (seat.fullAccess) return true;
    if (!apex) return false;
    if (apex.unique) return apex.apexId === nodeId;
    return apex.ambiguous && apex.apexIds.includes(nodeId);
  };
  let n = 0;
  for (const plan of report.plans) {
    if (plan.verdict === 'over-ceiling' && isAddressee(plan.escalation)) n += 1;
    if (plan.unmeasured && plan.ownerId === nodeId) n += 1;
    if ((plan.recoveryDueCents || 0) > 0 && isAddressee(plan.escalation)) n += 1;
  }
  for (const contest of report.contests) {
    if (isAddressee(contest.escalation)) n += 1;
  }
  return n;
}

/**
 * The candidates a form may pick from, for the acting seat only: the plans it
 * holds, and the live measures of those plans. Never the whole workspace.
 */
export function incentiveCandidates(state, { now = new Date(), settings = null, seat = null } = {}) {
  const report = buildIncentiveIntegrity(state, { now, settings, seat });
  // Who the seat could award: people it holds on the tree or a declared line, and
  // never itself. This is the shortlist a form offers; the ACTION is the door and
  // re-proves the hold. A full-access operator sees the active roster.
  const nodeId = seat ? (seat.nodeId || seat.id || null) : null;
  const people = list(state?.people)
    .filter((person) => person && typeof person.id === 'string' && person.status !== 'inactive')
    .filter((person) => {
      if (!seat) return false;
      if (seat.fullAccess) return true;
      if (person.id === nodeId) return false;
      return Boolean(seat.scope?.has?.(person.id) || seat.lineScope?.has?.(person.id));
    })
    .map((person) => ({ id: person.id, name: person.name || person.id }));
  return {
    awardees: people,
    plans: report.plans.map((row) => ({
      id: row.id,
      label: row.label,
      ownerId: row.ownerId,
      ownerName: row.ownerName,
      currency: row.currency,
      ceilingCents: row.ceilingCents,
      periodFrom: row.periodFrom,
      periodTo: row.periodTo,
      status: row.status,
      overByCents: row.overByCents,
    })),
    measures: report.measures.map((row) => ({
      id: row.id,
      planId: row.planId,
      key: row.key,
      label: row.label,
      unit: row.unit,
      targetCents: row.targetCents,
      targetCount: row.targetCount,
      direction: row.direction,
      verified: row.verified,
    })),
    awards: report.awards
      .filter((row) => row.recovery.acts.length === 0 && row.state !== 'discretionary')
      .map((row) => ({
        id: row.id,
        planId: row.planId,
        measureKey: row.measureKey,
        currency: row.currency,
        amountCents: row.amountCents,
        state: row.state,
        personName: row.personName,
      })),
  };
}

/**
 * CSV #162 — one summary row per currency, identity-free by construction.
 * Every figure is the reader's own integer; a figure it could not compute is
 * BLANK with its reason, never a zero.
 */
export function incentiveCsvRows(report) {
  const rows = [];
  const blank = report.claims.figuresComplete ? '' : 'figures_complete=false — see the panel for the named gap';
  for (const totals of report.currencies) {
    rows.push({
      as_of: report.asOf,
      row_kind: 'summary',
      currency: totals.currency,
      plans_live: totals.plansLive,
      plans_retired: totals.plansRetired,
      plans_over_ceiling: totals.plansOverCeiling,
      plans_without_measure: totals.plansWithoutMeasure,
      plans_without_reading: totals.plansWithoutReading,
      measures_declared: totals.measures,
      measures_controlled_outside: totals.measuresOutside,
      awards_total: totals.awardsN,
      awards_provable: totals.awardsProvable,
      awards_missed: totals.awardsMissed,
      awards_discretionary: totals.awardsDiscretionary,
      awards_unverified: totals.awardsUnverified,
      awards_recovery_due: totals.awardsRecoveryDue,
      awarded_cents: totals.awardedCents,
      provable_cents: totals.provableCents,
      missed_cents: totals.missedCents,
      discretionary_cents: totals.discretionaryCents,
      unverified_cents: totals.unverifiedCents,
      contested_outcomes: totals.contests,
      contested_cents: totals.contestedCents,
      recovery_due_cents: totals.recoveryDueCents,
      recovery_recorded_cents: totals.recoveryRecordedCents,
      recovery_waived_cents: totals.recoveryWaivedCents,
      counts_reconcile: report.claims.countsReconcile ? 1 : 0,
      figures_complete: report.claims.figuresComplete ? 1 : 0,
      blank_reason: blank,
    });
  }
  if (!rows.length) {
    rows.push({
      as_of: report.asOf, row_kind: 'summary', currency: '',
      plans_live: 0, plans_retired: 0, plans_over_ceiling: 0, plans_without_measure: 0, plans_without_reading: 0,
      measures_declared: 0, measures_controlled_outside: 0,
      awards_total: 0, awards_provable: 0, awards_missed: 0, awards_discretionary: 0, awards_unverified: 0, awards_recovery_due: 0,
      awarded_cents: 0, provable_cents: 0, missed_cents: 0, discretionary_cents: 0, unverified_cents: 0,
      contested_outcomes: 0, contested_cents: 0, recovery_due_cents: 0, recovery_recorded_cents: 0, recovery_waived_cents: 0,
      counts_reconcile: 1, figures_complete: report.claims.figuresComplete ? 1 : 0,
      blank_reason: 'no plan in any currency has been declared',
    });
  }
  return rows;
}
