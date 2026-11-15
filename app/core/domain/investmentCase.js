/**
 * app/core/domain/investmentCase.js — the ONE reader of the Investment Case
 * Register (ADR-0208, Schema v162, `#/finance?panel=cases`).
 *
 * The board, the brief, the CSV and `RULE-ICA-01` all read this module, so a
 * figure that is printed is the figure that is exported and the figure the rule
 * acted on. Nothing here writes, and nothing derived is ever stored: the
 * lifecycle is re-derived from the acts, and every money figure from the flows
 * by the exact kernel in `investmentCaseMath.js`.
 *
 * WHAT THE READER REFUSES TO ADD UP. A currency is never pooled with another.
 * Net present values are never summed across cases — each was valued on its own
 * day at its own rate, and a sum of them is money of no particular date. The
 * book is therefore read per currency as COUNTS and as PROMISED OUTLAY (which is
 * additive), and each case carries its own value.
 *
 * THE MATRIX. A case has one benefit owner and is counted once. A seat sees a
 * case when the owner sits in its reporting tree or on a declared line it holds,
 * and the row says which. A case reached by two line holders is one case in the
 * workspace totals and is never split between them.
 *
 * Pure module: no DOM, no storage, no clock beyond the injected `now`.
 */

import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { altitudeRank } from './chainRegistry.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import { canAct } from './seat.js';
import {
  adjustInvestment,
  appraiseInvestment,
  INVESTMENT_MATH,
  investmentMedian,
  reviewInvestment,
} from './investmentCaseMath.js';
import {
  INVESTMENT_ACT_ROUTE_BY_KEY,
  INVESTMENT_CASE_ENGINE_VERSION,
  INVESTMENT_CASE_FRAMEWORKS,
  INVESTMENT_CASE_LIMITS,
  INVESTMENT_CASE_METHOD,
  INVESTMENT_CASE_REFUSAL_BY_KEY,
  INVESTMENT_CASE_RIGHTS,
  INVESTMENT_CASE_SETTING_KEYS,
  INVESTMENT_CASE_STATUS_BY_KEY,
  INVESTMENT_CASE_STATUS_KEYS,
  INVESTMENT_IRR_STATE_BY_KEY,
  INVESTMENT_PAYBACK_STATE_BY_KEY,
} from './investmentCaseRegistry.js';
import {
  investmentCaseSignature,
  investmentDaysBetween,
  normalizeInvestmentCaseActs,
  normalizeInvestmentCases,
  normalizeInvestmentCaseSettings,
} from './investmentCaseSchema.js';

const L = INVESTMENT_CASE_LIMITS;
const LIVE_STATUSES = new Set(INVESTMENT_CASE_STATUS_KEYS.filter((key) => INVESTMENT_CASE_STATUS_BY_KEY[key].live));
const RATIFY_MIN_RANK = 3;

/* --------------------------------------------------------------- formatting */

/** Whole cents → `EUR 1,234,567.89`, by integer arithmetic only. A null is a dash. */
export function investmentMoney(currency, cents) {
  if (cents === null || cents === undefined || !Number.isSafeInteger(cents)) return '—';
  const negative = cents < 0;
  const a = Math.abs(cents);
  const whole = String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '−' : ''}${currency ? `${currency} ` : ''}${whole}.${String(a % 100).padStart(2, '0')}`;
}

/** Whole basis points → `8.50%`. */
export function investmentRateBp(bp) {
  if (!Number.isInteger(bp)) return '—';
  return `${Math.floor(bp / 100)}.${String(bp % 100).padStart(2, '0')}%`;
}

/** Millionths → `12.3456%` (signed). */
export function investmentRateMicro(micro) {
  if (!Number.isInteger(micro)) return '—';
  const negative = micro < 0;
  const a = Math.abs(micro);
  return `${negative ? '−' : ''}${Math.floor(a / 10000)}.${String(a % 10000).padStart(4, '0')}%`;
}

/** Whole permille → `1.234×` (signed). */
export function investmentRatio(permille) {
  if (!Number.isInteger(permille)) return '—';
  const negative = permille < 0;
  const a = Math.abs(permille);
  return `${negative ? '−' : ''}${Math.floor(a / 1000)}.${String(a % 1000).padStart(3, '0')}×`;
}

/** Whole days → `1,095 d (3.00 y)`, the years by integer arithmetic. */
export function investmentDuration(days) {
  if (!Number.isInteger(days)) return '—';
  const hundredths = Math.round((days * 100) / 365);
  return `${String(days).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} d (${Math.floor(hundredths / 100)}.${String(hundredths % 100).padStart(2, '0')} y)`;
}

/* ---------------------------------------------------------------- memoising */

// A case is immutable, so its appraisal is a pure function of its own content.
// The cache is keyed by that content, never by an id, and holds frozen values.
const APPRAISALS = new Map();
const REVIEWS = new Map();
const CACHE_CAP = 800;

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

function remember(cache, key, compute) {
  if (cache.has(key)) {
    const hit = cache.get(key);
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const value = deepFreeze(compute());
  cache.set(key, value);
  if (cache.size > CACHE_CAP) cache.delete(cache.keys().next().value);
  return value;
}

const flowKey = (flows) => flows.map((flow) => `${flow.on}:${flow.kind}:${flow.cents}`).join(',');
const caseKey = (record) => `${record.hurdleBp}|${record.baseOn}|${flowKey(record.flows)}`;

/** The exact appraisal of one declared case. Frozen; never mutate it. */
export function investmentCaseAppraisal(record) {
  return remember(APPRAISALS, caseKey(record), () => appraiseInvestment({ flows: record.flows, baseOn: record.baseOn, hurdleBp: record.hurdleBp }));
}

function reviewReading(record, review) {
  const key = `${caseKey(record)}#${review.cutoffOn}|${review.outlayComplete ? 1 : 0}|${flowKey(review.flows)}`;
  return remember(REVIEWS, key, () => reviewInvestment({
    promised: record.flows, actual: review.flows, baseOn: record.baseOn, hurdleBp: record.hurdleBp,
    cutoffOn: review.cutoffOn, outlayComplete: review.outlayComplete,
  }));
}

/* ---------------------------------------------------------------- lifecycle */

const firstDayOf = (flows, kind) => flows.filter((flow) => flow.kind === kind).reduce((min, flow) => (min === null || flow.on < min ? flow.on : min), null);

/**
 * The lifecycle of one case from its acts and today's date. No money arithmetic
 * happens here, so the rule can ask "which reviews are due" without appraising
 * anything.
 */
export function investmentCaseLifecycle(record, acts, today) {
  const mine = acts.filter((act) => act.caseId === record.id);
  const decision = mine.find((act) => act.kind === 'approve' || act.kind === 'reject') || null;
  const withdrawal = mine.find((act) => act.kind === 'withdraw') || null;
  const reviews = mine.filter((act) => act.kind === 'review');
  const latestReview = reviews.length ? reviews[reviews.length - 1] : null;
  const ratified = decision?.kind === 'approve';
  const closed = Boolean(ratified && latestReview && !latestReview.nextReviewOn);
  const dueOn = !ratified || closed ? null : (latestReview ? latestReview.nextReviewOn : record.reviewOn);
  let status;
  if (withdrawal) status = 'withdrawn';
  else if (!decision) status = 'proposed';
  else if (decision.kind === 'reject') status = 'rejected';
  else if (closed) status = 'closed';
  else if (dueOn && today >= dueOn) status = 'review-due';
  else status = latestReview ? 'tracking' : 'approved';
  const firstOutlayOn = firstDayOf(record.flows, 'outlay');
  return {
    status,
    decision,
    withdrawal,
    reviews,
    latestReview,
    ratified,
    dueOn,
    // Days until the governing review day; zero or negative means it has arrived.
    dueInDays: dueOn ? investmentDaysBetween(today, dueOn) : null,
    outlayComplete: Boolean(latestReview?.outlayComplete),
    firstOutlayOn,
    // A promise written after the money had started to move was written with
    // hindsight. It is printed, and it is kept out of the track record.
    retrospective: Boolean(firstOutlayOn && record.declaredOn > firstOutlayOn),
  };
}

/* ------------------------------------------------------------------ monitor */

/**
 * Who a due review is owed to, on today's reporting graph.
 *
 * Decision control stays with the seat that ratified for as long as that seat is
 * on the roster, still holds the altitude to ratify, and still sits above the
 * benefit owner (or the owner has left — the promise was made TO the ratifier).
 * Otherwise it passes to the lowest seat that sits above the owner on EVERY one
 * of the owner's active reporting lines and holds that altitude: the joint apex
 * of the owner's managers, climbed until a ratifying altitude is reached. A
 * diamond with no single apex is `ambiguous` and nobody is chosen.
 */
export function resolveInvestmentMonitor(matrix, record, ratifierId) {
  if (!matrix) return { state: 'ambiguous', seatId: null, basis: null };
  if (ratifierId === LEADER_ID) return { state: 'leader-held', seatId: null, basis: 'ratifier' };
  const rankOf = (nodeId) => altitudeRank(matrix.nodes.get(nodeId)?.altitude);
  const ownerOn = matrix.roster.has(record.ownerId);
  const ratifierOn = Boolean(ratifierId) && matrix.roster.has(ratifierId);
  if (ratifierOn && ratifierId !== record.ownerId && rankOf(ratifierId) >= RATIFY_MIN_RANK
    && (!ownerOn || matrix.nodes.get(ratifierId)?.descendants?.has(record.ownerId))) {
    return { state: 'seat', seatId: ratifierId, basis: 'ratifier' };
  }
  if (!ownerOn) return { state: 'off-roster', seatId: null, basis: null };
  let current = record.ownerId;
  for (let guard = 0; guard <= matrix.nodes.size; guard += 1) {
    const managers = [...new Set(matrix.nodes.get(current)?.managerIds || [])];
    if (!managers.length) return { state: 'leader-held', seatId: null, basis: 'joint-apex' };
    const apex = matrixJointApex(matrix, managers);
    if (!apex.unique || !apex.apexId) return { state: 'ambiguous', seatId: null, basis: 'joint-apex' };
    if (apex.apexId === LEADER_ID) return { state: 'leader-held', seatId: null, basis: 'joint-apex' };
    if (rankOf(apex.apexId) >= RATIFY_MIN_RANK) return { state: 'seat', seatId: apex.apexId, basis: 'joint-apex' };
    current = apex.apexId;
  }
  return { state: 'ambiguous', seatId: null, basis: 'joint-apex' };
}

/**
 * Every ratified case whose governing review day has arrived, with the seat the
 * review is owed to. The rule reads exactly this list, and so does the board.
 */
export function investmentCaseDueReviews(state = {}, { now = new Date(), matrix = null } = {}) {
  const today = dayKey(now instanceof Date ? now : new Date(now || Date.now()));
  const cases = normalizeInvestmentCases(state.investmentCases, []);
  const acts = normalizeInvestmentCaseActs(state.investmentCaseActs, cases, []);
  const out = [];
  for (const record of cases) {
    const life = investmentCaseLifecycle(record, acts, today);
    if (life.status !== 'review-due') continue;
    const monitor = resolveInvestmentMonitor(matrix, record, life.decision.actedById);
    out.push({
      caseId: record.id,
      title: record.title,
      currency: record.currency,
      dueOn: life.dueOn,
      overdueDays: Math.max(0, -(life.dueInDays ?? 0)),
      reviewsN: life.reviews.length,
      ratifiedOn: life.decision.actedOn,
      monitor,
      signature: investmentCaseSignature({ caseId: record.id, dueOn: life.dueOn }),
    });
  }
  return out;
}

/* ------------------------------------------------------------------- reader */

const sumSafe = (values) => {
  let total = 0n;
  for (const value of values) total += BigInt(value);
  const out = Number(total);
  return Number.isSafeInteger(out) ? out : null;
};

function trackRecordOf(entries, floorN) {
  const prospective = entries.filter((entry) => !entry.life.retrospective && entry.latestReading);
  const retrospectiveN = entries.filter((entry) => entry.life.retrospective && entry.latestReading).length;
  const cost = prospective.map((entry) => entry.latestReading.costPermille).filter((value) => Number.isInteger(value));
  const benefit = prospective.map((entry) => entry.latestReading.benefitPermille).filter((value) => Number.isInteger(value));
  const costSufficient = cost.length >= floorN;
  const benefitSufficient = benefit.length >= floorN;
  return {
    floorN,
    reviewedN: prospective.length,
    retrospectiveN,
    costN: cost.length,
    costSufficient,
    costMedianPermille: costSufficient ? investmentMedian(cost) : null,
    benefitN: benefit.length,
    benefitSufficient,
    benefitMedianPermille: benefitSufficient ? investmentMedian(benefit) : null,
    sufficient: costSufficient && benefitSufficient,
    reason: costSufficient && benefitSufficient
      ? null
      : `${cost.length} of ${floorN} cost ratios and ${benefit.length} of ${floorN} benefit ratios are on the record, from cases declared before their money moved. Below the floor the track record is counts only.`,
  };
}

/**
 * What one seat holds and reaches. ONE definition, read by the register and by
 * the navigation counter, so the number in the navigation can never disagree
 * with the rows it points at.
 */
function seatProjection(seat) {
  const operator = !seat || seat.fullAccess === true;
  const actorId = operator ? LEADER_ID : (seat.nodeId || seat.id || null);
  // A seat with no readable rank holds no right here. The rank-window check
  // compares numbers, and a missing rank must never fall through it as "allowed".
  const may = (right) => operator || (Number.isInteger(seat?.rank) && canAct(right, seat).allow === true);
  // A case is visible when its owner is in the seat's tree or on a line the seat holds.
  const reachOf = (ownerId) => {
    if (operator) return 'operator';
    if (seat.scope instanceof Set && seat.scope.has(ownerId)) return 'tree';
    if (seat.lineScope instanceof Set && seat.lineScope.has(ownerId)) return 'line';
    return null;
  };
  return {
    operator,
    actorId,
    canDeclare: may(INVESTMENT_CASE_RIGHTS.DECLARE),
    canRatify: may(INVESTMENT_CASE_RIGHTS.RATIFY),
    canGovern: may(INVESTMENT_CASE_RIGHTS.GOVERN),
    reachOf,
  };
}

/** The acts one seat may perform on one case. Decision control is never the owner's own act. */
function permittedActs(life, { canDeclare, canRatify, isOwner }) {
  return {
    decide: life.status === 'proposed' && canRatify && !isOwner,
    review: life.ratified && life.status !== 'closed' && canRatify && !isOwner,
    withdraw: life.status === 'proposed' && canDeclare,
  };
}

/**
 * The whole register, projected for one seat. `seat: null` is the undeclared
 * operator view — the whole workspace.
 */
export function buildInvestmentCases(state = {}, { now = new Date(), settings = null, seat = null } = {}) {
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const today = dayKey(at) || new Date().toISOString().slice(0, 10);
  const cfg = settings || state.settings || {};
  const conv = normalizeInvestmentCaseSettings(cfg);
  const warnings = [];
  const cases = normalizeInvestmentCases(state.investmentCases, warnings);
  const acts = normalizeInvestmentCaseActs(state.investmentCaseActs, cases, warnings);
  const { operator, actorId, canDeclare, canRatify, canGovern, reachOf } = seatProjection(seat);

  let matrix = null;
  try {
    matrix = buildMatrix(state, { now: at, settings: { ...cfg, activeSeatId: null } });
  } catch {
    matrix = null;
  }
  const people = new Map((Array.isArray(state.people) ? state.people : []).filter((p) => p && p.id).map((p) => [p.id, p]));
  const nameOf = (personId) => (personId === LEADER_ID
    ? (matrix?.nodes?.get(LEADER_ID)?.name || 'Workspace leader')
    : (people.get(personId)?.name || 'Someone no longer on the roster'));

  /* 1. Every case in the workspace, read once. */
  const entries = cases.map((record) => {
    const life = investmentCaseLifecycle(record, acts, today);
    const readings = life.reviews.map((review) => ({ review, reading: reviewReading(record, review) }));
    const latestReading = readings.length && readings[readings.length - 1].reading.ok ? readings[readings.length - 1].reading : null;
    return { record, life, readings, latestReading };
  });

  /* 2. The track record: whole-workspace, dimensionless, floored. */
  const seatFloor = operator ? 0 : (Number(seat?.disclosure?.floorN) || 0);
  const track = trackRecordOf(entries, Math.max(L.trackRecordFloorN, seatFloor));

  /* 3. The seat projection. A case is visible when its owner is in the seat's
        tree or on a line the seat holds; everything else is counted, not shown. */
  const visible = [];
  let outsideN = 0;
  for (const entry of entries) {
    const reach = reachOf(entry.record.ownerId);
    if (!reach) { outsideN += 1; continue; }
    visible.push({ ...entry, reach });
  }

  /* 4. One row per visible case. */
  const rows = visible.map(({ record, life, readings, latestReading, reach }) => {
    const appraisal = investmentCaseAppraisal(record);
    const ownerOnRoster = Boolean(matrix?.roster?.has(record.ownerId));
    const ownerLinesN = ownerOnRoster ? (matrix.nodes.get(record.ownerId)?.managerIds || []).length : 0;
    const isOwner = !operator && actorId === record.ownerId;
    const open = life.status === 'proposed' || LIVE_STATUSES.has(life.status);
    let adjusted;
    if (!open) adjusted = { state: 'not-applicable', npvCents: null, npvSign: null };
    else if (!track.sufficient) adjusted = { state: 'below-floor', npvCents: null, npvSign: null };
    else {
      const result = adjustInvestment({
        flows: record.flows, baseOn: record.baseOn, hurdleBp: record.hurdleBp,
        costPermille: track.costMedianPermille, benefitPermille: track.benefitMedianPermille,
      });
      adjusted = result.ok
        ? { state: 'adjusted', npvCents: result.npvCents, npvSign: result.npvSign }
        : { state: 'unreadable', npvCents: null, npvSign: null };
    }
    const monitor = life.ratified && life.status !== 'closed'
      ? resolveInvestmentMonitor(matrix, record, life.decision.actedById)
      : null;
    const act = (row) => (row ? {
      actId: row.id,
      kind: row.kind,
      actedOn: row.actedOn,
      actedById: row.actedById,
      actedByName: nameOf(row.actedById),
      via: row.via,
      viaLabel: row.via ? INVESTMENT_ACT_ROUTE_BY_KEY[row.via]?.label || row.via : null,
      reason: row.reason,
    } : null);
    return {
      caseId: record.id,
      title: record.title,
      ownerId: record.ownerId,
      ownerName: nameOf(record.ownerId),
      ownerOnRoster,
      currency: record.currency,
      basis: record.basis,
      hurdleBp: record.hurdleBp,
      baseOn: record.baseOn,
      reviewOn: record.reviewOn,
      declaredOn: record.declaredOn,
      declaredById: record.declaredById,
      declaredByName: nameOf(record.declaredById),
      note: record.note,
      flows: record.flows,
      retrospective: life.retrospective,
      firstOutlayOn: life.firstOutlayOn,
      status: life.status,
      statusMeta: INVESTMENT_CASE_STATUS_BY_KEY[life.status],
      live: LIVE_STATUSES.has(life.status),
      decision: act(life.decision),
      withdrawal: act(life.withdrawal),
      reviews: readings.map(({ review, reading }) => ({
        ...act(review),
        cutoffOn: review.cutoffOn,
        outlayComplete: review.outlayComplete,
        nextReviewOn: review.nextReviewOn,
        flows: review.flows,
        reading: reading.ok ? reading : null,
        readingRefusal: reading.ok ? null : reading.reason,
      })),
      latestReading,
      dueOn: life.dueOn,
      dueInDays: life.dueInDays,
      appraisal,
      irrMeta: INVESTMENT_IRR_STATE_BY_KEY[appraisal.irr?.state] || null,
      paybackMeta: INVESTMENT_PAYBACK_STATE_BY_KEY[appraisal.payback?.state] || null,
      discountedPaybackMeta: INVESTMENT_PAYBACK_STATE_BY_KEY[appraisal.discountedPayback?.state] || null,
      adjusted,
      matrix: { ownerLinesN, multiLine: ownerLinesN > 1, reach },
      monitor: monitor ? { ...monitor, seatName: monitor.seatId ? nameOf(monitor.seatId) : null } : null,
      can: permittedActs(life, { canDeclare, canRatify, isOwner }),
    };
  });

  /* 5. Order. What needs an act first; then, among proposals, the rationing
        order — most present value returned per unit put in first. */
  const pi = (row) => (Number.isInteger(row.appraisal.piPermille) ? row.appraisal.piPermille : -Infinity);
  rows.sort((a, b) => a.statusMeta.rank - b.statusMeta.rank
    || (a.status === 'proposed' ? pi(b) - pi(a) : 0)
    || String(a.dueOn || '').localeCompare(String(b.dueOn || ''))
    || b.declaredOn.localeCompare(a.declaredOn)
    || a.caseId.localeCompare(b.caseId));
  rows.forEach((row, index) => { row.code = `C${String(index + 1).padStart(2, '0')}`; });

  /* 6. Totals. Counts across the visible book; money per currency only. */
  const count = (list, status) => list.filter((row) => row.status === status).length;
  const totals = {
    casesN: rows.length,
    shownN: Math.min(rows.length, L.caseRowsShown),
    remainderN: Math.max(0, rows.length - L.caseRowsShown),
    outsideN,
    ...Object.fromEntries(INVESTMENT_CASE_STATUS_KEYS.map((key) => [`${key}N`, count(rows, key)])),
    liveN: rows.filter((row) => row.live).length,
    multiLineOwnerN: rows.filter((row) => row.matrix.multiLine).length,
    viaLineN: rows.filter((row) => row.matrix.reach === 'line').length,
    retrospectiveN: rows.filter((row) => row.retrospective).length,
    ownerOffRosterN: rows.filter((row) => !row.ownerOnRoster).length,
    irrNotPrintedN: rows.filter((row) => row.appraisal.irr.state !== 'unique').length,
    paybackNotPrintedN: rows.filter((row) => row.appraisal.payback.state !== 'pays-back').length,
    reviewsN: rows.reduce((n, row) => n + row.reviews.length, 0),
    awaitingThisSeatN: rows.filter((row) => row.can.decide).length,
    reviewOwedByThisSeatN: rows.filter((row) => row.status === 'review-due' && row.can.review).length,
  };
  const currencies = [...new Set(rows.map((row) => row.currency))].sort().map((currency) => {
    const mine = rows.filter((row) => row.currency === currency);
    const book = (list) => ({
      n: list.length,
      outlayCents: sumSafe(list.map((row) => row.appraisal.undiscounted.outlayCents)),
      npvPositiveN: list.filter((row) => row.appraisal.npvSign > 0).length,
      npvNegativeN: list.filter((row) => row.appraisal.npvSign < 0).length,
      npvZeroN: list.filter((row) => row.appraisal.npvSign === 0).length,
    });
    return {
      currency,
      casesN: mine.length,
      ...Object.fromEntries(INVESTMENT_CASE_STATUS_KEYS.map((key) => [`${key}N`, count(mine, key)])),
      multiLineOwnerN: mine.filter((row) => row.matrix.multiLine).length,
      retrospectiveN: mine.filter((row) => row.retrospective).length,
      proposed: book(mine.filter((row) => row.status === 'proposed')),
      ratified: book(mine.filter((row) => row.live)),
    };
  });

  /* 7. Refusals: every reason something on this page is a dash or a count. */
  const refusals = [];
  const refuse = (key, says = null) => refusals.push({ key, says: says || INVESTMENT_CASE_REFUSAL_BY_KEY[key].says });
  if (rows.length && currencies.length) refuse('npv-not-pooled');
  if (totals.irrNotPrintedN) refuse('irr-not-printed', `${totals.irrNotPrintedN} case(s) carry no unique internal rate of return — the stream changes sign more than once, never, or money comes in first. No rate is printed for them; their net present value at the declared hurdle is.`);
  if (totals.paybackNotPrintedN) refuse('payback-not-printed', `${totals.paybackNotPrintedN} case(s) do not pay back inside their own declared schedule, or are never in deficit. No payback day is printed for them.`);
  const outlayOpenN = rows.filter((row) => row.latestReading && !row.latestReading.outlayComplete).length;
  if (outlayOpenN) refuse('outlay-open', `${outlayOpenN} reviewed case(s) have not declared their outlay complete, so no cost ratio and no evidence-based net present value is printed for them: while money is still going out, spending less than planned so far cannot be told apart from running late.`);
  const noBenefitN = rows.filter((row) => row.latestReading && row.latestReading.benefitPermille === null).length;
  if (noBenefitN) refuse('no-benefit-promised', `${noBenefitN} reviewed case(s) were reviewed to a cut-off before any promised benefit. Nothing was promised by that day, so no benefit ratio is printed.`);
  if (rows.length && !track.sufficient) refuse('track-record-below-floor', `${track.reason} No promise is re-read against it.`);
  if (track.retrospectiveN) refuse('retrospective-excluded', `${track.retrospectiveN} reviewed case(s) were declared after their first outlay day — written with hindsight. Their ratios are printed on their own cards and they are left out of the track record.`);
  if (track.sufficient && rows.some((row) => row.adjusted.state === 'adjusted' && row.appraisal.pvResidualCents)) refuse('residual-carried');
  if (totals.ownerOffRosterN) refuse('owner-off-roster', `${totals.ownerOffRosterN} case(s) name a benefit owner who is no longer on the active roster. They stay on the record; nobody is substituted as their owner.`);
  if (totals.multiLineOwnerN) refuse('multi-line-owner', `${totals.multiLineOwnerN} case(s) belong to a benefit owner who holds more than one active reporting line. Each is counted ONCE, is visible to the holder of every one of those lines, and is never split between them.`);
  if (outsideN) refuse('outside-span', `${outsideN} case(s) belong to benefit owners outside this seat’s reporting tree and declared lines. They are counted, never listed.`);
  if (totals.remainderN) refuse('truncated', `${totals.remainderN} case(s) are not listed on this screen. The totals count them.`);
  if (warnings.length) refuse('invalid-ledger', warnings.join(' '));

  return {
    today,
    actorId,
    seat: { operator, rank: operator ? null : (seat.rank ?? null), label: operator ? 'Workspace leader (operator view)' : (seat.label || ''), canDeclare, canRatify, canGovern },
    conventions: conv,
    cases: rows.slice(0, L.caseRowsShown),
    allCases: rows,
    totals,
    currencies,
    trackRecord: track,
    refusals,
    attentionN: totals.awaitingThisSeatN + totals.reviewOwedByThisSeatN,
    method: INVESTMENT_CASE_METHOD,
    frameworks: INVESTMENT_CASE_FRAMEWORKS,
    math: INVESTMENT_MATH,
    engineVersion: INVESTMENT_CASE_ENGINE_VERSION,
    settingKeys: INVESTMENT_CASE_SETTING_KEYS,
  };
}

/* ------------------------------------------------------------------- briefs */

/** Identity-free summary text. No person, no case id, no title. */
export function investmentCaseBriefText(report) {
  if (!report) return '';
  const t = report.totals;
  const track = report.trackRecord;
  const lines = [
    `Investment cases — ${report.today}`,
    `${t.casesN} case(s) in view: ${t.proposedN} awaiting ratification, ${t['review-dueN']} with a review due, ${t.approvedN} ratified, ${t.trackingN} reviewed with a further review declared, ${t.closedN} closed, ${t.rejectedN} refused, ${t.withdrawnN} withdrawn.${t.outsideN ? ` ${t.outsideN} sit outside this seat's span and are counted only.` : ''}`,
  ];
  for (const row of report.currencies || []) {
    lines.push(`${row.currency}: ratified book ${row.ratified.n} case(s), promised outlay ${investmentMoney(row.currency, row.ratified.outlayCents)}, ${row.ratified.npvPositiveN} worth more than zero at their own hurdle and ${row.ratified.npvNegativeN} worth less; ${row.proposed.n} proposal(s) asking ${investmentMoney(row.currency, row.proposed.outlayCents)}.`);
  }
  lines.push(track.sufficient
    ? `Track record (${track.costN} cost / ${track.benefitN} benefit ratios, floor ${track.floorN}): reviewed cases cost a median ${investmentRatio(track.costMedianPermille)} of their promise and returned a median ${investmentRatio(track.benefitMedianPermille)} of the benefit promised by their review cut-off.`
    : `Track record: ${track.reason}`);
  if (t.multiLineOwnerN) lines.push(`${t.multiLineOwnerN} case(s) have a benefit owner on more than one reporting line; each is counted once.`);
  lines.push('Currencies are never pooled and net present values are never added across cases.');
  return lines.join('\n');
}

/* ---------------------------------------------------------------------- CSV */

const blank = (value) => (value === null || value === undefined ? '' : value);

/** CSV scope #150 rows, from the SAME report the board printed. */
export function investmentCaseCsvRows(report) {
  if (!report) return [];
  const t = report.totals;
  const track = report.trackRecord;
  const common = { generated_on: report.today, engine_version: report.engineVersion, ask_due_days: report.conventions[INVESTMENT_CASE_SETTING_KEYS.askDueDays] };
  const counts = (source) => ({
    cases_n: source.casesN,
    proposed_n: source.proposedN,
    approved_n: source.approvedN,
    review_due_n: source['review-dueN'],
    tracking_n: source.trackingN,
    closed_n: source.closedN,
    rejected_n: source.rejectedN,
    withdrawn_n: source.withdrawnN,
    multi_line_owner_n: source.multiLineOwnerN,
    retrospective_n: source.retrospectiveN,
  });
  const out = [{
    row_type: 'workspace', key: 'workspace', ...common, ...counts(t),
    figures_complete: 'yes',
    claim_reason: 'Counts only: currencies are never pooled and net present values are never added across cases.',
  }];
  for (const row of report.currencies || []) {
    out.push({
      row_type: 'currency', key: row.currency, currency: row.currency, ...common, ...counts(row),
      npv_positive_n: row.ratified.npvPositiveN,
      npv_negative_n: row.ratified.npvNegativeN,
      outlay_cents: blank(row.ratified.outlayCents),
      figures_complete: row.ratified.outlayCents === null ? 'no' : 'yes',
      claim_reason: row.ratified.outlayCents === null
        ? 'The promised outlay of the ratified book exceeds the exactly representable range and is not printed.'
        : 'outlay_cents is the promised undiscounted outlay of the ratified book (ratified, review due, tracking). npv_positive_n and npv_negative_n count that book at each case’s own hurdle.',
    });
  }
  for (const row of report.allCases || []) {
    const a = row.appraisal;
    const reading = row.latestReading;
    const reasons = [...a.refusals];
    if (reading) reasons.push(...reading.refusals);
    if (row.adjusted.state === 'below-floor') reasons.push('adjusted-npv:track-record-below-floor');
    if (row.retrospective) reasons.push('retrospective:excluded-from-track-record');
    out.push({
      row_type: 'case', key: row.code, currency: row.currency, ...common,
      status: row.status,
      basis: row.basis,
      hurdle_bp: row.hurdleBp,
      flows_n: a.flowsN,
      horizon_days: a.horizonDays,
      multi_line_owner_n: row.matrix.multiLine ? 1 : 0,
      retrospective_n: row.retrospective ? 1 : 0,
      outlay_cents: a.undiscounted.outlayCents,
      benefit_cents: a.undiscounted.benefitCents,
      residual_cents: a.undiscounted.residualCents,
      pv_outlay_cents: blank(a.pvOutlayCents),
      npv_cents: blank(a.npvCents),
      npv_ex_residual_cents: blank(a.npvExResidualCents),
      pi_permille: blank(a.piPermille),
      irr_state: a.irr.state,
      irr_micro: blank(a.irr.micro),
      payback_days: blank(a.payback.days),
      discounted_payback_days: blank(a.discountedPayback.days),
      peak_exposure_cents: a.peakExposureCents,
      residual_share_permille: blank(a.residualSharePermille),
      reviews_n: row.reviews.length,
      outlay_complete: reading ? (reading.outlayComplete ? 'yes' : 'no') : '',
      cost_permille: reading ? blank(reading.costPermille) : '',
      benefit_permille: reading ? blank(reading.benefitPermille) : '',
      evidence_npv_cents: reading ? blank(reading.evidenceNpvCents) : '',
      adjusted_npv_cents: row.adjusted.state === 'adjusted' ? blank(row.adjusted.npvCents) : '',
      figures_complete: reasons.length ? 'no' : 'yes',
      claim_reason: reasons.join('; '),
    });
  }
  out.push({
    row_type: 'track-record', key: 'track-record', ...common,
    cases_n: track.reviewedN,
    retrospective_n: track.retrospectiveN,
    track_cost_n: track.costN,
    track_cost_median_permille: blank(track.costMedianPermille),
    track_benefit_n: track.benefitN,
    track_benefit_median_permille: blank(track.benefitMedianPermille),
    figures_complete: track.sufficient ? 'yes' : 'no',
    claim_reason: track.sufficient
      ? `Medians of the latest review of every case declared on or before its first outlay day (floor ${track.floorN}).`
      : track.reason,
  });
  return out;
}

/** The number this seat owes an act on: proposals it may ratify plus reviews it owes. */
export function investmentCaseAttentionCount(state = {}, { now = new Date(), seat = null } = {}) {
  // With no case on the record nothing can be owed.
  if (!Array.isArray(state?.investmentCases) || !state.investmentCases.length) return 0;
  // The counter sits in the navigation of every route, so it reads only what
  // the count depends on — each case's lifecycle and whether this seat reaches
  // and may act on it. It never appraises a case and never reads the reporting
  // graph: the exact arithmetic costs milliseconds per case (measured: 0.4 s
  // cold for 400 eight-flow cases, 5 s for 400 sixty-flow ones) and belongs to
  // the screen that prints the figures, not to a badge on every other screen.
  // It counts from the same `seatProjection` / `permittedActs` the register
  // uses, and the suite pins the two against each other for every seat.
  try {
    const at = now instanceof Date ? now : new Date(now || Date.now());
    const today = dayKey(at) || new Date().toISOString().slice(0, 10);
    const warnings = [];
    const cases = normalizeInvestmentCases(state.investmentCases, warnings);
    const acts = normalizeInvestmentCaseActs(state.investmentCaseActs, cases, warnings);
    const projection = seatProjection(seat);
    let owed = 0;
    for (const record of cases) {
      if (!projection.reachOf(record.ownerId)) continue;
      const life = investmentCaseLifecycle(record, acts, today);
      const can = permittedActs(life, { ...projection, isOwner: !projection.operator && projection.actorId === record.ownerId });
      if (can.decide || (life.status === 'review-due' && can.review)) owed += 1;
    }
    return owed;
  } catch {
    return 0;
  }
}

/** How many appraisals and review readings are memoised — a diagnostic, so "does the badge appraise?" is answerable. */
export function investmentCaseCacheStats() {
  return { appraisals: APPRAISALS.size, reviews: REVIEWS.size };
}
