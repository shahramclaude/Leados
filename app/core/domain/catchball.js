/**
 * app/core/domain/catchball.js — Hoshin Kanri & Catchball Cascade Engine
 * (`#/catchball`, Session 123, Schema v89, ADR-0083).
 *
 * Explicit cross-domain frameworks implemented here:
 *  1. Hoshin Kanri Four-Quadrant X-Matrix & Bowling Charts (Akao 1991;
 *     Jackson 2006): South Breakthrough Bets × West Cascaded Span Pacts ×
 *     North Leading/Lagging Metrics (preserving dimensional units) × East
 *     Span Capacity & Commitment-Accounting Budgets.
 *  2. Dantzig–Wolfe (1960) & Kornai–Lipták (1965) Bilateral Decomposition:
 *     local span feasibility priced from `buildLoadReport` (person-day supply,
 *     WIP, saturation band) and `evaluateBudget` (same-currency encumbrance
 *     headroom), refusing silent consent into saturated queues.
 *  3. Goldratt (1997) / Leontief Weakest-Link Floor vs. Prendergast (1993)
 *     "Watermelon" Divergence: side-by-side effort-weighted mean progress vs.
 *     bottleneck minimum across child pacts.
 *  4. Argyris & Schön (1978) Double-Loop Learning: separates Execution Drift
 *     from Strategic Thesis Falsification (`thesis-suspect` when leading
 *     process adherence >= floor while lagging outcome <= red floor past the
 *     review midpoint — explicitly exonerating the executing span).
 *  5. Combinatorial Cascade Fan-Out (b^d) & Herfindahl–Hirschman Concentration
 *     across spans, Fréchet (1935) Joint Delivery Bounds, Wilson (1927) 95%
 *     Score Intervals, Strictly-Prior Brier Skill, and Primary + Complementary
 *     Small-Cell Suppression across all 5 organizational altitudes.
 *
 * Pure module: no DOM, no storage, no network, no wall-clock globals.
 */

import { addDays, dayKey, daysBetween, round } from '../time.js';
import { ALTITUDES, altitudeByKey, altitudeRank } from './chainRegistry.js';
import { activeSeat, buildSeats, canSee } from './seat.js';
import { LEADER_ID } from './chain.js';
import { buildLoadReport } from './load.js';
import { evaluateBudget, isBudgetOpen } from './finance.js';
import { normalizeCatchballSettings } from './catchballSchema.js';
import {
  ACTIVE_PACT_STATUSES,
  BOWLER_STATE_LABELS,
  CATCHBALL_ALTITUDE_PLAYBOOK,
  CATCHBALL_ENGINE_VERSION,
  CORRELATION_WEIGHTS,
  GRADED_OUTCOMES,
} from './catchballRegistry.js';

const Z_95 = 1.959964;

function r1(n) {
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

function r3(n) {
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null;
}

/**
 * Wilson (1927) 95% score interval in percentage points [0, 100].
 * Refused (`null`) when `n < floorN`.
 */
export function wilsonInterval(k, n, floorN = 5) {
  if (!Number.isInteger(n) || n <= 0 || n < floorN || !Number.isInteger(k) || k < 0 || k > n) return null;
  const p = k / n;
  const z2 = Z_95 * Z_95;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (Z_95 * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return {
    lo: r1(Math.max(0, (center - half) * 100)),
    hi: r1(Math.min(100, (center + half) * 100)),
  };
}

/**
 * Fréchet (1935) assumption-free joint delivery probability bounds over child
 * pacts with probabilities p_1..p_k in [0, 1]:
 *   lower = max(0, sum(p_i) - (k - 1))
 *   independence = prod(p_i)
 *   upper = min(p_i)
 * Guarantees 0 <= lower <= independence <= upper <= 1.
 */
export function frechetDeliveryBounds(probabilities = []) {
  if (!Array.isArray(probabilities) || !probabilities.length
    || probabilities.some((p) => p === null || p === '' || !Number.isFinite(Number(p)) || Number(p) < 0 || Number(p) > 1)) return null;
  const valid = probabilities.map(Number);
  const k = valid.length;
  const sum = valid.reduce((acc, p) => acc + p, 0);
  const lower = Math.max(0, sum - (k - 1));
  const upper = Math.min(...valid);
  const independence = valid.reduce((acc, p) => acc * p, 1);
  return {
    k,
    lowerPct: r1(lower * 100),
    independencePct: r1(independence * 100),
    upperPct: r1(upper * 100),
  };
}

/**
 * Bowler 2x2 diagnostic & Argyris–Schön double-loop thesis-vs-execution check.
 * When leading process adherence >= `catchballLeadingFloorPct` while lagging
 * realization <= `catchballThesisRedPct` past the pact's midpoint (or at
 * settlement), execution is EXONERATED (`executionExonerated: true`) and the
 * upstream causal hypothesis is marked `thesis-suspect`.
 */
export function classifyBowlerPact(pact, today, conventions = {}) {
  const conv = normalizeCatchballSettings(conventions);
  if (!pact) {
    return {
      state: 'unmeasured',
      label: BOWLER_STATE_LABELS.unmeasured,
      pastMidpoint: false,
      midpointOn: null,
      executionExonerated: false,
    };
  }
  let midpointOn = null;
  let pastMidpoint = true;
  if (pact.startsOn && pact.dueOn && pact.dueOn > pact.startsOn) {
    const spanDays = daysBetween(pact.startsOn, pact.dueOn);
    if (Number.isFinite(spanDays) && spanDays > 0) {
      midpointOn = addDays(pact.startsOn, Math.floor(spanDays / 2));
      pastMidpoint = today >= midpointOn;
    }
  }
  if (pact.status === 'settled' || pact.gradedOutcome === 'thesis-invalidated') {
    pastMidpoint = true;
  }

  const lead = pact.leadingPct;
  const lag = pact.laggingPct;
  if (lead === null || lead === undefined || lag === null || lag === undefined) {
    return {
      state: 'unmeasured',
      label: BOWLER_STATE_LABELS.unmeasured,
      pastMidpoint,
      midpointOn,
      executionExonerated: false,
    };
  }

  if (
    (pastMidpoint || pact.gradedOutcome === 'thesis-invalidated')
    && lead >= conv.catchballLeadingFloorPct
    && lag <= conv.catchballThesisRedPct
  ) {
    return {
      state: 'thesis-suspect',
      label: BOWLER_STATE_LABELS['thesis-suspect'],
      pastMidpoint,
      midpointOn,
      executionExonerated: true,
    };
  }
  if (lead >= conv.catchballLeadingFloorPct && lag >= conv.catchballLaggingFloorPct) {
    return {
      state: 'aligned',
      label: BOWLER_STATE_LABELS.aligned,
      pastMidpoint,
      midpointOn,
      executionExonerated: false,
    };
  }
  if (lead < conv.catchballLeadingFloorPct && lag >= conv.catchballLaggingFloorPct) {
    return {
      state: 'lucky-variance',
      label: BOWLER_STATE_LABELS['lucky-variance'],
      pastMidpoint,
      midpointOn,
      executionExonerated: false,
    };
  }
  // Faithful leading execution with a lagging outcome is not execution
  // drift, even when the double-loop midpoint/red threshold is not yet met.
  if (lead >= conv.catchballLeadingFloorPct) {
    return { state: 'outcome-lag', label: BOWLER_STATE_LABELS['outcome-lag'], pastMidpoint, midpointOn, executionExonerated: false };
  }
  return {
    state: 'execution-drift',
    label: BOWLER_STATE_LABELS['execution-drift'],
    pastMidpoint,
    midpointOn,
    executionExonerated: false,
  };
}

/**
 * Dantzig–Wolfe / Kornai–Lipták local feasibility pricing for a receiving span:
 * couples person-day queueing load (`buildLoadReport`) and commitment-accounting
 * budget authority (`evaluateBudget`).
 */
export function priceSpanFeasibility(
  state = {},
  seatId,
  {
    effortDays = 0,
    budgetId = null,
    resourceAskAmount = null,
    currency = null,
    now = new Date(),
    loadReport = null,
  } = {},
) {
  const load = loadReport || buildLoadReport(state, now);
  const personLoad = (load.people || []).find((p) => p.personId === seatId) || null;
  const addDaysEffort = Math.max(0, Number(effortDays) || 0);

  const existingPactDays = (state.catchballPacts || [])
    .filter((p) => p && p.toSeatId === seatId && p.status === 'agreed')
    .reduce((s, p) => s + (Number(p.effortDays) || 0), 0);

  const allocatableDays = personLoad ? Number(personLoad.effort?.allocatableDays || 0) : null;
  const baseExpectedDays = personLoad ? Number(personLoad.effort?.expectedEffortDays || 0) : null;
  const combinedExpectedDays = baseExpectedDays !== null
    ? r1(baseExpectedDays + existingPactDays)
    : r1(existingPactDays);
  const headroomDays = allocatableDays !== null
    ? r1(allocatableDays - combinedExpectedDays)
    : null;
  const postPactDays = r1((combinedExpectedDays || 0) + addDaysEffort);
  const postPactUtilizationPct = allocatableDays && allocatableDays > 0
    ? r1((postPactDays / allocatableDays) * 100)
    : null;

  const band = personLoad?.band || 'unknown';
  const saturationIndex = personLoad?.index ?? null;
  const silentOverloadBlocked = Boolean(
    ['saturated', 'overloaded'].includes(band)
    || (allocatableDays !== null && addDaysEffort > 0 && postPactDays > allocatableDays),
  );

  let budgetVerdict = null;
  if (budgetId) {
    const budget = (state.budgets || []).find((b) => b && b.id === budgetId) || null;
    if (!budget) {
      budgetVerdict = { ok: false, reason: `Budget "${budgetId}" does not exist.` };
    } else if (!isBudgetOpen(budget)) {
      budgetVerdict = { ok: false, reason: `Budget "${budget.name || budget.id}" is ${budget.status}, not active.` };
    } else {
      const evaluated = evaluateBudget(budget, now);
      const reqCur = currency ? String(currency).toUpperCase() : evaluated.currency;
      const ask = resourceAskAmount !== null && resourceAskAmount !== undefined
        ? Number(resourceAskAmount)
        : 0;
      if (reqCur !== evaluated.currency) {
        budgetVerdict = {
          ok: false,
          currencyMismatch: true,
          budgetCurrency: evaluated.currency,
          requestedCurrency: reqCur,
          reason: `Currency mismatch: pact asks ${reqCur} against ${evaluated.currency} budget (no FX conversion by doctrine).`,
        };
      } else {
        const wouldBreach = evaluated.hasLimit && ask > 0 && (evaluated.forecastAtCompletion + ask) > evaluated.limit;
        budgetVerdict = {
          ok: !wouldBreach,
          budgetId: budget.id,
          budgetName: budget.name || budget.id,
          currency: evaluated.currency,
          limit: evaluated.limit,
          forecastAtCompletion: evaluated.forecastAtCompletion,
          remainingVsLimit: evaluated.remainingVsLimit,
          askAmount: r1(ask),
          wouldBreachEnvelope: wouldBreach,
          reason: wouldBreach
            ? `Encumbering ${evaluated.currency} ${ask} exceeds remaining authority (${evaluated.currency} ${evaluated.remainingVsLimit}).`
            : `Within ${evaluated.currency} envelope (${evaluated.remainingVsLimit ?? 'unbounded'} remaining).`,
        };
      }
    }
  }

  return {
    seatId,
    band,
    saturationIndex,
    allocatableDays,
    existingCommittedDays: combinedExpectedDays,
    headroomDays,
    requestedEffortDays: r1(addDaysEffort),
    postPactDays,
    postPactUtilizationPct,
    silentOverloadBlocked,
    budget: budgetVerdict,
  };
}

/**
 * Leadership ancestor seat ids (closest first, excluding synthetic `__leader__`)
 * for vertical `rolls-up-to` provenance.
 */
export function ancestorPersonSeatIds(built, personId) {
  const out = [];
  if (!built || !personId) return out;
  // Use the same repaired, cycle-safe tree as the seat engine.
  let cursor = built.chain?.nodes?.get(personId)?.parentId || null;
  const visited = new Set([personId]);
  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    if (built.byId.has(cursor) && cursor !== LEADER_ID) out.push(cursor);
    cursor = built.chain.nodes.get(cursor)?.parentId || null;
  }
  return out;
}

/**
 * Apply primary + complementary small-cell suppression over direct child spans
 * when viewing from aggregate executive/chief altitudes.
 */
export function buildSpanRollupRows(pacts, viewerSeat, built, cellFloor = 3) {
  const root = built.byId.get(LEADER_ID);
  const childSeats = viewerSeat && !viewerSeat.fullAccess
    ? (viewerSeat.childSeatIds || []).map((id) => built.byId.get(id)).filter(Boolean)
    : (root?.childSeatIds || []).map((id) => built.byId.get(id)).filter(Boolean);

  const suppressNeeded = Boolean(viewerSeat && !viewerSeat.fullAccess && viewerSeat.rank >= 4);

  const rawRows = childSeats.map((spanSeat) => {
    const inSpan = pacts.filter((p) => spanSeat.scope.has(p.toSeatId) || p.toSeatId === spanSeat.id);
    const active = inSpan.filter((p) => ACTIVE_PACT_STATUSES.includes(p.status));
    const measured = active.filter((p) => p.laggingPct !== null);
    const meanLaggingPct = measured.length
      ? r1(measured.reduce((s, p) => s + p.laggingPct, 0) / measured.length)
      : null;
    const weakestLaggingPct = measured.length
      ? r1(Math.min(...measured.map((p) => p.laggingPct)))
      : null;
    const totalEffortDays = r1(active.reduce((s, p) => s + (p.effortDays || 0), 0)) || 0;
    const primarySuppressed = suppressNeeded && inSpan.length > 0 && inSpan.length < cellFloor;
    return {
      seatId: spanSeat.id,
      spanLabel: viewerSeat && !viewerSeat.fullAccess && viewerSeat.rank >= 4
        ? `${spanSeat.shortLabel} span`
        : `${spanSeat.name} (${spanSeat.shortLabel})`,
      altitudeKey: spanSeat.altitudeKey,
      rank: spanSeat.rank,
      rawCount: inSpan.length,
      activeCount: active.length,
      totalEffortDays,
      meanLaggingPct,
      weakestLaggingPct,
      primarySuppressed,
      complementarySuppressed: false,
    };
  });

  // Complementary suppression: if exactly 1 non-empty child span is primary-suppressed
  // and at least one other non-empty sibling exists, suppress the smallest sibling too
  // so parent-minus-siblings subtraction cannot isolate the small cell.
  const primaryCount = rawRows.filter((r) => r.primarySuppressed).length;
  const nonZeroUnsuppressed = rawRows
    .filter((r) => r.rawCount > 0 && !r.primarySuppressed)
    .sort((a, b) => a.rawCount - b.rawCount || a.seatId.localeCompare(b.seatId));
  if (suppressNeeded && primaryCount === 1 && nonZeroUnsuppressed.length >= 1) {
    nonZeroUnsuppressed[0].complementarySuppressed = true;
  }

  return rawRows.map((row) => {
    const withheld = row.primarySuppressed || row.complementarySuppressed;
    const countDisplay = withheld
      ? (row.primarySuppressed ? `[1..${cellFloor - 1}]` : `at least ${cellFloor} (withheld)`)
      : String(row.rawCount);
    return {
      ...row,
      withheld,
      countDisplay,
      meanLaggingPct: withheld ? null : row.meanLaggingPct,
      weakestLaggingPct: withheld ? null : row.weakestLaggingPct,
      suppressionReason: row.primarySuppressed
        ? `Primary small-cell suppression (0 < n < ${cellFloor})`
        : row.complementarySuppressed
          ? 'Complementary sibling suppression (prevents parent-minus-sibling differencing)'
          : '',
    };
  });
}

/** Score only forecasts frozen before the outcome. Reference outcomes must
 * have been graded before the forecast date; same-day ordering is unknown. */
function brierFor(rows, history) {
  let n = 0; let error = 0; let reference = 0;
  for (const row of rows) {
    if (row.frozenConfidencePct == null || !row.agreedOn || !row.gradedOn || row.agreedOn >= row.gradedOn) continue;
    const prior = history.filter((other) => other.id !== row.id && other.gradedOn && other.gradedOn < row.agreedOn);
    const base = prior.length ? prior.filter((other) => other.gradedOutcome === 'delivered').length / prior.length : 0.5;
    const y = row.gradedOutcome === 'delivered' ? 1 : 0;
    const pred = Math.min(1, Math.max(0, row.frozenConfidencePct / 100));
    error += (pred - y) ** 2;
    reference += (base - y) ** 2;
    n += 1;
  }
  return { n, error, reference };
}

/**
 * Out-of-sample strictly-prior Brier calibration + Catchball negotiation lift.
 */
export function calibrateCatchball(pacts = [], conventions = {}) {
  const conv = normalizeCatchballSettings(conventions);
  const settled = pacts
    .filter((p) => p && p.status === 'settled' && GRADED_OUTCOMES.includes(p.gradedOutcome))
    .slice()
    .sort((a, b) => (a.gradedOn || '').localeCompare(b.gradedOn || '')
      || (a.createdAt || '').localeCompare(b.createdAt || '')
      || a.id.localeCompare(b.id));

  const cells = ALTITUDES.map((alt) => {
    const rows = settled.filter((p) => p.altitudeKey === alt.key);
    const scores = brierFor(rows, rows);

    const n = rows.length;
    const deliveredN = rows.filter((r) => r.gradedOutcome === 'delivered').length;
    const missedN = rows.filter((r) => r.gradedOutcome === 'missed').length;
    const thesisInvalidatedN = rows.filter((r) => r.gradedOutcome === 'thesis-invalidated').length;
    const refused = n < conv.catchballFloorN;
    const holdRatePct = refused ? null : r1((deliveredN / n) * 100);
    const wilson = wilsonInterval(deliveredN, n, conv.catchballFloorN);
    const brier = scores.n < conv.catchballFloorN ? null : r3(scores.error / scores.n);
    const brierSkill = brier !== null && scores.reference > 0
      ? r3(1 - scores.error / scores.reference) : null;
    const belowFloor = !refused && holdRatePct !== null && holdRatePct < conv.catchballReliabilityFloorPct;

    return {
      altitudeKey: alt.key,
      label: alt.label,
      shortLabel: alt.shortLabel,
      rank: alt.rank,
      horizonDays: alt.horizonDays,
      n,
      deliveredN,
      missedN,
      thesisInvalidatedN,
      refused,
      floorN: conv.catchballFloorN,
      reliabilityFloorPct: conv.catchballReliabilityFloorPct,
      holdRatePct,
      wilsonLo: wilson ? wilson.lo : null,
      wilsonHi: wilson ? wilson.hi : null,
      brier,
      brierN: scores.n,
      brierSkill,
      belowFloor,
    };
  });

  // Pooled calibration; a proposal plus an acceptance is not a counter-offer.
  const pooledScores = brierFor(settled, settled);

  const totalN = settled.length;
  const totalDelivered = settled.filter((r) => r.gradedOutcome === 'delivered').length;
  const totalThesisInvalidated = settled.filter((r) => r.gradedOutcome === 'thesis-invalidated').length;
  const pooledRefused = totalN < conv.catchballFloorN;
  const pooledHoldRatePct = pooledRefused ? null : r1((totalDelivered / totalN) * 100);
  const pooledWilson = wilsonInterval(totalDelivered, totalN, conv.catchballFloorN);
  const pooledBrier = pooledScores.n < conv.catchballFloorN ? null : r3(pooledScores.error / pooledScores.n);
  const pooledBrierSkill = pooledBrier !== null && pooledScores.reference > 0
    ? r3(1 - pooledScores.error / pooledScores.reference) : null;

  // Proposal + acceptance are two turns, but not a counter-offer.
  const negotiated = settled.filter((r) => (r.roundCount || 1) >= 3);
  const singlePass = settled.filter((r) => (r.roundCount || 1) <= 2);
  const negotiatedDel = negotiated.filter((r) => r.gradedOutcome === 'delivered').length;
  const singlePassDel = singlePass.filter((r) => r.gradedOutcome === 'delivered').length;
  const negotiatedRatePct = negotiated.length >= conv.catchballFloorN ? r1((negotiatedDel / negotiated.length) * 100) : null;
  const singlePassRatePct = singlePass.length >= conv.catchballFloorN ? r1((singlePassDel / singlePass.length) * 100) : null;
  const negotiationLiftPp = negotiatedRatePct !== null && singlePassRatePct !== null
    ? r1(negotiatedRatePct - singlePassRatePct)
    : null;

  return {
    totalN,
    totalDelivered,
    totalThesisInvalidated,
    pooledRefused,
    pooledHoldRatePct,
    pooledWilsonLo: pooledWilson ? pooledWilson.lo : null,
    pooledWilsonHi: pooledWilson ? pooledWilson.hi : null,
    pooledBrier,
    pooledBrierN: pooledScores.n,
    pooledBrierSkill,
    negotiatedN: negotiated.length,
    negotiatedDeliveredN: negotiatedDel,
    negotiatedRatePct,
    singlePassN: singlePass.length,
    singlePassDeliveredN: singlePassDel,
    singlePassRatePct,
    negotiationLiftPp,
    cells,
  };
}

/**
 * Build the complete Hoshin Kanri & Catchball Cascade report, respecting the
 * active Operating Seat's subtree scope and altitude disclosure ladder.
 */
export function buildCatchballReport(state = {}, { now = new Date(), settings = null } = {}) {
  const today = dayKey(now);
  const conv = normalizeCatchballSettings(settings || state?.settings || {});
  const builtSeats = buildSeats(state, { now, settings: state?.settings || {} });
  const seat = activeSeat(builtSeats);
  const scoped = !seat.fullAccess;
  const detailWithheld = scoped && seat.rank >= 4;
  const unitDisclosure = scoped && seat.rank === 3;
  const disclosureMode = !scoped ? 'operator' : seat.rank <= 2 ? 'names' : seat.rank === 3 ? 'unit' : 'aggregate';

  const loadReport = buildLoadReport(state, now);
  const peopleById = new Map((state.people || []).map((p) => [p.id, p]));
  const bets = (Array.isArray(state.strategyBets) ? state.strategyBets : [])
    .filter((bet) => seat.fullAccess || canSee(bet, 'strategyBets', seat, builtSeats).allow === 'full');
  const allPacts = Array.isArray(state.catchballPacts) ? state.catchballPacts : [];
  const allRounds = Array.isArray(state.catchballRounds) ? state.catchballRounds : [];

  // Scope pacts to active seat's subtree (or empty if unresolved read-only seat)
  const inSeatScope = (pact) => {
    if (!scoped) return true;
    if (seat.readOnly) return false;
    return seat.scope.has(pact.toSeatId) || pact.toSeatId === seat.id;
  };
  const scopedPacts = allPacts.filter(inSeatScope);
  const scopedPactIds = new Set(scopedPacts.map((p) => p.id));
  const scopedRounds = allRounds.filter((r) => scopedPactIds.has(r.pactId));

  // Child map for vertical cascade calculations
  const childrenByParent = new Map();
  for (const p of scopedPacts) {
    if (!p.parentPactId || !ACTIVE_PACT_STATUSES.includes(p.status)) continue;
    const arr = childrenByParent.get(p.parentPactId) || [];
    arr.push(p);
    childrenByParent.set(p.parentPactId, arr);
  }

  const formatSpanOwner = (personId) => {
    if (!personId || personId === LEADER_ID) return 'Enterprise root';
    if (scoped && !seat.scope.has(personId)) return 'Upstream span';
    const person = peopleById.get(personId);
    const seatNode = builtSeats.byId.get(personId);
    if (detailWithheld) {
      return seatNode ? `${seatNode.shortLabel} span` : 'Subordinate span';
    }
    if (unitDisclosure) {
      if (seatNode) return `${person?.name || personId} (${seatNode.shortLabel})`;
      return person?.team ? `${person.team} unit` : 'Frontline unit';
    }
    return person ? `${person.name}${person.role ? ` · ${person.role}` : ''}` : personId;
  };

  // Enrich each pact with Bowler state, child roll-up (mean vs weakest-link),
  // Watermelon divergence, Fréchet bounds, and capacity/budget pricing.
  const enrichedPacts = scopedPacts.map((pact) => {
    const bowler = classifyBowlerPact(pact, today, conv);
    const children = childrenByParent.get(pact.id) || [];
    const measuredChildren = children.filter((c) => c.laggingPct !== null && c.laggingPct !== undefined);
    const unmeasuredChildCount = children.length - measuredChildren.length;

    let weightedMeanPct = null;
    let weakestLinkPct = null;
    let bottleneckChildId = null;

    if (measuredChildren.length > 0) {
      let wSum = 0;
      let wySum = 0;
      for (const child of measuredChildren) {
        const w = Math.max(1, Number(child.effortDays) || 1) * (CORRELATION_WEIGHTS[child.correlation] || 0.6);
        wSum += w;
        wySum += w * child.laggingPct;
      }
      weightedMeanPct = wSum > 0 ? r1(wySum / wSum) : null;

      const strongOrMod = measuredChildren.filter((c) => c.correlation !== 'supporting');
      const pool = strongOrMod.length ? strongOrMod : measuredChildren;
      const sorted = [...pool].sort((a, b) => a.laggingPct - b.laggingPct || a.id.localeCompare(b.id));
      weakestLinkPct = r1(sorted[0].laggingPct);
      bottleneckChildId = sorted[0].id;
    }

    const headlineCandidates = [pact.reportedPct, weightedMeanPct].filter((v) => v !== null && v !== undefined);
    const headlinePct = headlineCandidates.length ? Math.max(...headlineCandidates) : pact.laggingPct;
    const comparisonFloor = weakestLinkPct !== null ? weakestLinkPct : pact.laggingPct;
    const watermelonGapPp = headlinePct !== null && comparisonFloor !== null && children.length > 0
      ? r1(headlinePct - comparisonFloor)
      : (pact.reportedPct !== null && pact.laggingPct !== null ? r1(pact.reportedPct - pact.laggingPct) : null);
    const isWatermelon = Boolean(
      ACTIVE_PACT_STATUSES.includes(pact.status)
      && watermelonGapPp !== null
      && watermelonGapPp >= conv.catchballWatermelonGapPct,
    );

    // Progress is not a probability. A bound over only children with known
    // forecasts would silently omit obligations, so refuse incomplete sets.
    const childProbs = children.map((c) => c.status === 'agreed' && c.frozenConfidencePct != null
      ? c.frozenConfidencePct / 100 : null);
    const frechet = childProbs.length >= conv.catchballFloorN && childProbs.every((v) => v !== null)
      ? frechetDeliveryBounds(childProbs) : null;

    const feasibility = priceSpanFeasibility(state, pact.toSeatId, {
      effortDays: pact.status === 'agreed' ? 0 : pact.effortDays,
      budgetId: pact.budgetId,
      // An agreed pact is already included in the budget's commitments.
      resourceAskAmount: pact.status === 'agreed' && pact.encumberedLineId ? 0 : pact.resourceAskAmount,
      currency: pact.currency,
      now,
      loadReport,
    });

    const pactRounds = scopedRounds
      .filter((r) => r.pactId === pact.id)
      .sort((a, b) => a.roundNumber - b.roundNumber || a.createdAt.localeCompare(b.createdAt));

    return {
      ...pact,
      displayTitle: detailWithheld ? `[${pact.altitudeKey.toUpperCase()} pact · ${pact.horizonDays}d]` : pact.title,
      ownerLabel: formatSpanOwner(pact.toSeatId),
      senderLabel: formatSpanOwner(pact.fromSeatId),
      altitudeRank: altitudeRank(pact.altitudeKey),
      bowler,
      childCount: children.length,
      unmeasuredChildCount,
      weightedMeanPct,
      weakestLinkPct,
      bottleneckChildId,
      headlinePct,
      watermelonGapPp,
      isWatermelon,
      frechet,
      feasibility,
      rounds: detailWithheld ? [] : pactRounds,
    };
  });

  // South-to-West-to-North-to-East Four-Quadrant X-Matrix summary per Strategy Bet
  const activePacts = enrichedPacts.filter((p) => ACTIVE_PACT_STATUSES.includes(p.status));
  const xMatrixBets = bets
    .filter((b) => b && b.status !== 'retired')
    .map((bet) => {
      const deployed = activePacts.filter((p) => p.strategyBetId === bet.id);
      const measured = deployed.filter((p) => p.laggingPct !== null);
      const effortDays = r1(deployed.reduce((s, p) => s + (p.effortDays || 0), 0)) || 0;
      const meanPct = measured.length
        ? r1(measured.reduce((s, p) => s + p.laggingPct, 0) / measured.length)
        : null;
      const weakestPct = measured.length
        ? r1(Math.min(...measured.map((p) => p.laggingPct)))
        : null;
      const thesisSuspectCount = deployed.filter((p) => p.bowler.state === 'thesis-suspect').length;
      const watermelonCount = deployed.filter((p) => p.isWatermelon).length;
      const undeployed = (Number(bet.weightPct) || 0) >= 20 && deployed.length === 0;
      return {
        betId: bet.id,
        title: bet.title,
        targetSharePct: Number(bet.weightPct) || 0,
        deployedCount: deployed.length,
        agreedCount: deployed.filter((p) => p.status === 'agreed').length,
        counteredCount: deployed.filter((p) => p.status === 'countered').length,
        effortDays,
        meanPct,
        weakestPct,
        watermelonGapPp: meanPct !== null && weakestPct !== null ? r1(meanPct - weakestPct) : null,
        thesisSuspectCount,
        watermelonCount,
        undeployed,
      };
    });

  // Combinatorial cascade fan-out (b^d) & Span HHI concentration
  const depthMemo = new Map();
  const pactById = new Map(scopedPacts.map((p) => [p.id, p]));
  const depthOf = (id, trail = new Set()) => {
    if (depthMemo.has(id)) return depthMemo.get(id);
    const p = pactById.get(id);
    if (!p || !p.parentPactId || !pactById.has(p.parentPactId) || trail.has(id)) {
      depthMemo.set(id, 1);
      return 1;
    }
    const next = new Set(trail);
    next.add(id);
    const d = 1 + depthOf(p.parentPactId, next);
    depthMemo.set(id, d);
    return d;
  };
  const maxCascadeDepth = activePacts.length
    ? Math.max(...activePacts.map((p) => depthOf(p.id)))
    : 0;
  const parentCounts = [...childrenByParent.values()].map((arr) => arr.filter((c) => ACTIVE_PACT_STATUSES.includes(c.status)).length).filter((n) => n > 0);
  const meanBranching = parentCounts.length
    ? r1(parentCounts.reduce((s, n) => s + n, 0) / parentCounts.length)
    : 0;
  const maxBranching = parentCounts.length ? Math.max(...parentCounts) : 0;
  const combinatoricProjection = maxCascadeDepth > 1 && meanBranching > 0
    ? Math.round(meanBranching ** maxCascadeDepth)
    : activePacts.length;

  const spanEffortMap = new Map();
  const spanActiveCountMap = new Map();
  for (const p of activePacts) {
    spanEffortMap.set(p.toSeatId, (spanEffortMap.get(p.toSeatId) || 0) + Math.max(1, p.effortDays || 1));
    spanActiveCountMap.set(p.toSeatId, (spanActiveCountMap.get(p.toSeatId) || 0) + 1);
  }
  const totalWeightedEffort = [...spanEffortMap.values()].reduce((s, v) => s + v, 0);
  const spanHhi = totalWeightedEffort > 0
    ? r3([...spanEffortMap.values()].reduce((s, v) => s + (v / totalWeightedEffort) ** 2, 0))
    : null;
  const effectiveSpanCount = spanHhi && spanHhi > 0 ? r1(1 / spanHhi) : null;
  const fanoutBreachSpans = [...spanActiveCountMap.entries()]
    .filter(([, count]) => count > conv.catchballMaxFanout)
    .map(([spanId, count]) => ({ seatId: spanId, label: formatSpanOwner(spanId), count }));

  const spanRollup = buildSpanRollupRows(scopedPacts, seat, builtSeats, conv.catchballCellFloor);
  const calibration = calibrateCatchball(scopedPacts, conv);

  const watermelons = activePacts.filter((p) => p.isWatermelon);
  const thesisSuspects = activePacts.filter((p) => p.bowler.state === 'thesis-suspect');
  const openNegotiations = activePacts.filter((p) => p.status === 'proposed' || p.status === 'countered');

  return {
    engineVersion: CATCHBALL_ENGINE_VERSION,
    today,
    conventions: conv,
    scoped,
    detailWithheld,
    disclosureMode,
    seat: {
      id: seat.id,
      label: seat.label,
      shortLabel: seat.shortLabel,
      altitudeKey: seat.altitudeKey,
      rank: seat.rank,
      horizonDays: seat.horizonDays,
      fullAccess: seat.fullAccess,
      readOnly: Boolean(seat.readOnly),
    },
    playbook: CATCHBALL_ALTITUDE_PLAYBOOK,
    pacts: enrichedPacts,
    activePacts,
    openNegotiations,
    watermelons,
    thesisSuspects,
    xMatrixBets,
    spanRollup,
    fanout: {
      maxCascadeDepth,
      meanBranching,
      maxBranching,
      combinatoricProjection,
      spanHhi,
      effectiveSpanCount,
      fanoutBreachSpans,
    },
    calibration,
  };
}

/** Public read boundary for the executive/enterprise aggregate lens.
 * Never return hidden item bodies or exact withheld counts to API callers. */
export function projectCatchballReport(report) {
  if (!report.detailWithheld) return report;
  const floor = report.conventions.catchballCellFloor;
  const countValues = [report.activePacts.length, report.openNegotiations.length,
    report.watermelons.length, report.thesisSuspects.length];
  // Suppress all related totals when one is small: subtracting two totals must
  // not reveal the withheld category. This is a local disclosure convention,
  // not a differential-privacy guarantee.
  const suppressTotals = countValues.some((n) => n > 0 && n < floor);
  const totals = {
    active: suppressTotals ? null : countValues[0],
    open: suppressTotals ? null : countValues[1],
    watermelons: suppressTotals ? null : countValues[2],
    thesisSuspects: suppressTotals ? null : countValues[3],
  };
  const spanRollup = report.spanRollup.map((row) => ({
    ...row,
    seatId: null,
    rawCount: row.withheld ? null : row.rawCount,
    activeCount: row.withheld ? null : row.activeCount,
    totalEffortDays: row.withheld ? null : row.totalEffortDays,
  }));
  const calibration = {
    ...report.calibration,
    totalN: null, totalDelivered: null, totalThesisInvalidated: null,
    pooledRefused: true, pooledHoldRatePct: null, pooledWilsonLo: null, pooledWilsonHi: null,
    pooledBrier: null, pooledBrierN: null, pooledBrierSkill: null,
    negotiatedN: null, negotiatedDeliveredN: null, negotiatedRatePct: null,
    singlePassN: null, singlePassDeliveredN: null, singlePassRatePct: null, negotiationLiftPp: null,
    cells: report.calibration.cells.map((c) => ({
      ...c, n: null, deliveredN: null, missedN: null, thesisInvalidatedN: null,
      refused: true, withheld: true, holdRatePct: null, wilsonLo: null, wilsonHi: null,
      brier: null, brierN: null, brierSkill: null, belowFloor: false,
    })),
  };
  return {
    ...report, totals, calibration, spanRollup,
    pacts: [], activePacts: [], openNegotiations: [], watermelons: [], thesisSuspects: [],
    xMatrixBets: [],
    fanout: { ...report.fanout, fanoutBreachSpans: [],
      ...(suppressTotals ? { maxCascadeDepth: null, meanBranching: null, maxBranching: null,
        combinatoricProjection: null, spanHhi: null, effectiveSpanCount: null } : {}) },
  };
}

/**
 * Insights findings (`Strategy deployment` bucket in `DOMAIN_ORDER` &
 * `SIGNAL_FAMILIES`). Returns `[]` on an empty workspace so `SETUP-01` remains
 * the sole nudge on virgin workspaces.
 */
export function catchballSignals(state = {}, now = new Date()) {
  if (!Array.isArray(state?.catchballPacts) || state.catchballPacts.length === 0) {
    return [];
  }
  const report = buildCatchballReport(state, { now });
  const out = [];

  if (report.watermelons.length > 0) {
    const worst = [...report.watermelons].sort((a, b) => (b.watermelonGapPp || 0) - (a.watermelonGapPp || 0))[0];
    out.push({
      ruleId: 'HK-01',
      domain: 'Strategy deployment',
      title: report.watermelons.length === 1
        ? `A Hoshin pact shows a ${worst.watermelonGapPp} pp Watermelon gap between headline and weakest-link floor`
        : `${report.watermelons.length} Hoshin pacts mask red bottleneck spans behind green roll-ups`,
      detail: `Effort-weighted or self-reported progress exceeds the Goldratt/Leontief weakest-link child floor by at least ${report.conventions.catchballWatermelonGapPct} pp. Averaging child percentages hides the constraint that governs actual delivery.`,
      severity: worst.watermelonGapPp >= 40 ? 4 : 3,
      confidence: 'high',
      evidence: report.watermelons.slice(0, 4).map(
        (p) => `${p.title}: headline ${p.headlinePct}% vs weakest-link floor ${p.weakestLinkPct ?? p.laggingPct}% (gap ${p.watermelonGapPp} pp)`,
      ),
      action: { label: 'Inspect Watermelon roll-up', route: '#/catchball?panel=watermelon' },
    });
  }

  if (report.thesisSuspects.length > 0) {
    out.push({
      ruleId: 'HK-02',
      domain: 'Strategy deployment',
      title: report.thesisSuspects.length === 1
        ? 'Double-loop alert: leading process execution held, but the lagging outcome stalled'
        : `${report.thesisSuspects.length} pacts show faithful leading execution with a stalled lagging outcome`,
      detail: `Argyris & Schön double-loop separation: the owning span delivered >= ${report.conventions.catchballLeadingFloorPct}% of agreed leading inputs while the lagging KPI sits <= ${report.conventions.catchballThesisRedPct}% past midpoint. Execution is exonerated — review the upstream strategic causal hypothesis rather than pressing the team harder.`,
      severity: 4,
      confidence: 'high',
      evidence: report.thesisSuspects.slice(0, 4).map(
        (p) => `${p.title}: leading ${p.leadingPct}% vs lagging ${p.laggingPct}% (execution exonerated)`,
      ),
      action: { label: 'Review causal thesis', route: '#/catchball?panel=watermelon' },
    });
  }

  const overloadedNegotiations = report.openNegotiations.filter(
    (p) => p.status === 'countered' || p.feasibility.silentOverloadBlocked,
  );
  if (overloadedNegotiations.length > 0) {
    out.push({
      ruleId: 'HK-03',
      domain: 'Strategy deployment',
      title: `${overloadedNegotiations.length} Catchball negotiation(s) require trade-off or capacity resolution`,
      detail: 'Downstream spans have either countered upward with a priced scope/trade-off/resource request or sit in a saturated person-day band where silent acceptance is blocked.',
      severity: 3,
      confidence: 'high',
      evidence: overloadedNegotiations.slice(0, 4).map(
        (p) => `${p.title} (${p.status}) — load band: ${p.feasibility.band}, effort: ${p.effortDays}d`,
      ),
      action: { label: 'Open Catchball workbench', route: '#/catchball?panel=workbench' },
    });
  }

  const undeployedBets = report.xMatrixBets.filter((b) => b.undeployed);
  if (undeployedBets.length > 0) {
    out.push({
      ruleId: 'HK-04',
      domain: 'Strategy deployment',
      title: `${undeployedBets.length} Breakthrough Bet(s) >= 20% target share have zero Catchball pacts`,
      detail: 'Stated strategic priority has no negotiated vertical deployment in the Hoshin X-Matrix, leaving execution unowned across spans.',
      severity: 3,
      confidence: 'medium',
      evidence: undeployedBets.slice(0, 4).map(
        (b) => `${b.title} — target share ${b.targetSharePct}%, 0 active pacts`,
      ),
      action: { label: 'Deploy on X-Matrix', route: '#/catchball?panel=matrix' },
    });
  }

  const breachingCells = report.calibration.cells.filter((c) => c.belowFloor);
  if (breachingCells.length > 0 || report.fanout.fanoutBreachSpans.length > 0) {
    out.push({
      ruleId: 'HK-05',
      domain: 'Strategy deployment',
      title: breachingCells.length > 0
        ? `${breachingCells.length} altitude cell(s) sit below the ${report.conventions.catchballReliabilityFloorPct}% Catchball delivery floor`
        : `${report.fanout.fanoutBreachSpans.length} span(s) exceed the cascade fan-out ceiling (${report.conventions.catchballMaxFanout})`,
      detail: 'Either combinatorial cascade branching is fragmenting span attention or settled pacts at an altitude are failing their reliability floor.',
      severity: 3,
      confidence: breachingCells.length > 0 ? 'high' : 'medium',
      evidence: [
        ...breachingCells.map((c) => `${c.label}: ${c.holdRatePct}% delivered (${c.deliveredN}/${c.n})`),
        ...report.fanout.fanoutBreachSpans.map((s) => `Span fan-out: ${s.count} active pacts > max ${report.conventions.catchballMaxFanout}`),
      ].slice(0, 4),
      action: { label: 'Open cascade calibration', route: '#/catchball?panel=calibration' },
    });
  }

  return out;
}

export function catchballAttentionCount(state = {}, now = new Date(), settings = null) {
  if (!Array.isArray(state?.catchballPacts) || state.catchballPacts.length === 0) return 0;
  const r = buildCatchballReport(state, { now, settings });
  return r.watermelons.length + r.thesisSuspects.length + r.openNegotiations.filter((p) => p.status === 'countered').length;
}

/**
 * Identity-free executive Markdown brief: aggregate counts, intervals, rates
 * and methodology limits only — never person names, person ids, or free-text notes.
 */
export function catchballBriefText(state = {}, { now = new Date(), settings = null } = {}) {
  const r = buildCatchballReport(state, { now, settings });
  const cal = r.calibration;
  if (r.detailWithheld) {
    const safe = projectCatchballReport(r);
    const show = (n) => n == null ? 'withheld (small-cell guard)' : String(n);
    return [
      `# HOSHIN KANRI & CATCHBALL CASCADE BRIEF — ${r.today}`,
      '',
      'Executive aggregate view. Pact titles, names, notes and small cells are withheld.',
      `- Active pacts: ${show(safe.totals.active)}.`,
      `- Open negotiations: ${show(safe.totals.open)}.`,
      `- Watermelon divergences: ${show(safe.totals.watermelons)}.`,
      `- Thesis-suspect: ${show(safe.totals.thesisSuspects)}; this is a prompt for human review, not proof of causality.`,
      '- Altitude calibration cells are withheld in this aggregate view to prevent differencing.',
      '- Local seats are workflow declarations, not multi-user authentication; suppression is not differential privacy.',
    ].join('\n');
  }
  const lines = [
    `# HOSHIN KANRI & CATCHBALL CASCADE BRIEF — ${r.today}`,
    '',
    'Identity-free aggregate diagnostic. No person names, person ids, pact titles or free-text negotiation notes appear in this brief.',
    '',
    '## 1. X-Matrix & Cascade Posture',
    `- Active pacts: ${r.activePacts.length} (open negotiations: ${r.openNegotiations.length}; settled trials: ${cal.totalN}).`,
    `- Breakthrough Bets tracked: ${r.xMatrixBets.length} (undeployed >=20% bets: ${r.xMatrixBets.filter((b) => b.undeployed).length}).`,
    `- Cascade geometry: max depth ${r.fanout.maxCascadeDepth}, mean branching ${r.fanout.meanBranching}, theoretical b^d fan-out ${r.fanout.combinatoricProjection}, span effort HHI ${r.fanout.spanHhi ?? 'unmeasured'} (effective spans: ${r.fanout.effectiveSpanCount ?? 'unmeasured'}).`,
    '',
    '## 2. Watermelon & Double-Loop Separation',
    `- Watermelon divergences (headline minus weakest-link >= ${r.conventions.catchballWatermelonGapPct} pp): ${r.watermelons.length}.`,
    `- Double-loop thesis-suspect pacts (leading >= ${r.conventions.catchballLeadingFloorPct}% & lagging <= ${r.conventions.catchballThesisRedPct}% — execution exonerated): ${r.thesisSuspects.length}.`,
    '',
    '## 3. Out-of-Sample Calibration & Catchball Lift',
    `- Pooled delivery hold rate: ${cal.pooledRefused ? `refused (n=${cal.totalN} < floor ${r.conventions.catchballFloorN})` : `${cal.pooledHoldRatePct}% (Wilson 95%: ${cal.pooledWilsonLo}–${cal.pooledWilsonHi}%)`}.`,
    `- Strictly-prior Brier score: ${cal.pooledBrier ?? 'refused'} · Brier skill vs base rate: ${cal.pooledBrierSkill ?? 'refused'}.`,
    `- Bilateral Catchball lift (countered pacts vs pacts without a counter): ${cal.negotiationLiftPp === null ? `counts-only (negotiated ${cal.negotiatedDeliveredN}/${cal.negotiatedN}, single-pass ${cal.singlePassDeliveredN}/${cal.singlePassN})` : `${cal.negotiationLiftPp >= 0 ? '+' : ''}${cal.negotiationLiftPp} pp (${cal.negotiatedRatePct}% vs ${cal.singlePassRatePct}%)`}.`,
    '',
    '## 4. Altitude Calibration Cells',
    ...cal.cells.map(
      (c) => `- Rank ${c.rank} (${c.shortLabel}, ${c.horizonDays}d): n=${c.n}, delivered=${c.deliveredN}, thesis-invalidated=${c.thesisInvalidatedN}, hold=${c.refused ? 'refused' : `${c.holdRatePct}%`}, Wilson=${c.refused ? '—' : `${c.wilsonLo}–${c.wilsonHi}%`}.`,
    ),
    '',
    '## 5. Honest Limits',
    '- Local Operating Seats are auditable workspace declarations, not authenticated multi-user security.',
    '- Small-cell + complementary sibling suppression prevents simple parent-minus-sibling differencing at executive altitudes; it is not differential privacy.',
    '- Fréchet joint delivery intervals bound unknown inter-span correlation without assuming independence; cells below the sample floor print counts only.',
  ];
  return lines.join('\n');
}

/**
 * Aggregate-only rows for CSV scope #78 (`catchball-cascade`).
 * Refused rates are exported as empty string `''`, never `0`.
 */
export function catchballCsvRows(state = {}, { now = new Date(), settings = null } = {}) {
  const r = buildCatchballReport(state, { now, settings });
  const cal = r.calibration;
  const blank = (v) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '' : v);

  if (r.detailWithheld) {
    // The union of altitude/outcome tables can disclose small cells through
    // subtraction. Export no cell values from the aggregate seat.
    return [...cal.cells.map((c) => ({
      row_kind: 'altitude', altitude: c.altitudeKey, rank: c.rank, horizon_days: c.horizonDays,
      active_pacts: '', watermelon_n: '', thesis_suspect_n: '', settled_n: '', delivered_n: '',
      thesis_invalidated_n: '', hold_rate_pct: '', wilson_lo_pct: '', wilson_hi_pct: '',
      brier: '', brier_skill: '', negotiation_lift_pp: '', verdict: 'withheld-aggregate-view',
    })), {
      row_kind: 'workspace', altitude: 'all', rank: '', horizon_days: '', active_pacts: '',
      watermelon_n: '', thesis_suspect_n: '', settled_n: '', delivered_n: '', thesis_invalidated_n: '',
      hold_rate_pct: '', wilson_lo_pct: '', wilson_hi_pct: '', brier: '', brier_skill: '',
      negotiation_lift_pp: '', verdict: 'withheld-aggregate-view',
    }];
  }
  const rows = cal.cells.map((c) => {
    const altActive = r.activePacts.filter((p) => p.altitudeKey === c.altitudeKey);
    const altWatermelons = altActive.filter((p) => p.isWatermelon).length;
    const altThesisSuspects = altActive.filter((p) => p.bowler.state === 'thesis-suspect').length;
    return {
      row_kind: 'altitude',
      altitude: c.altitudeKey,
      rank: c.rank,
      horizon_days: c.horizonDays,
      active_pacts: altActive.length,
      watermelon_n: altWatermelons,
      thesis_suspect_n: altThesisSuspects,
      settled_n: c.n,
      delivered_n: c.deliveredN,
      thesis_invalidated_n: c.thesisInvalidatedN,
      hold_rate_pct: blank(c.holdRatePct),
      wilson_lo_pct: blank(c.wilsonLo),
      wilson_hi_pct: blank(c.wilsonHi),
      brier: blank(c.brier),
      brier_skill: blank(c.brierSkill),
      negotiation_lift_pp: '',
      verdict: c.refused ? 'below-floor' : c.belowFloor ? 'breach' : 'calibrated',
    };
  });

  rows.push({
    row_kind: 'workspace',
    altitude: 'all',
    rank: '',
    horizon_days: '',
    active_pacts: r.activePacts.length,
    watermelon_n: r.watermelons.length,
    thesis_suspect_n: r.thesisSuspects.length,
    settled_n: cal.totalN,
    delivered_n: cal.totalDelivered,
    thesis_invalidated_n: cal.totalThesisInvalidated,
    hold_rate_pct: blank(cal.pooledHoldRatePct),
    wilson_lo_pct: blank(cal.pooledWilsonLo),
    wilson_hi_pct: blank(cal.pooledWilsonHi),
    brier: blank(cal.pooledBrier),
    brier_skill: blank(cal.pooledBrierSkill),
    negotiation_lift_pp: blank(cal.negotiationLiftPp),
    verdict: cal.pooledRefused
      ? `below-floor;hhi=${r.fanout.spanHhi ?? 'na'}`
      : `evaluated;hhi=${r.fanout.spanHhi ?? 'na'}`,
  });

  return rows;
}
