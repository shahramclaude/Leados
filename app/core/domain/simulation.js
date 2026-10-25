/**
 * app/core/domain/simulation.js — Deterministic Seeded Monte Carlo Engine for
 * Joint Multi-Project Capacity Confidence & Stochastic Satir J-Curve Payback.
 *
 * Cross-Domain Theoretical Foundations:
 *  - Malcolm, Roseboom, Clark & Fazar (1959) & Vose (2008): Exact continuous
 *    Beta-PERT sampling on [O, P] with α = 1 + 4(M−O)/(P−O), β = 1 + 4(P−M)/(P−O),
 *    preserving right-skewed tail risk that Central Limit Theorem normal sums
 *    understate on small N (3–12 concurrent leadership commitments).
 *  - Marsaglia & Tsang (2000), ACM TOMS 26(3): Exact squeeze acceptance-rejection
 *    Gamma variate generation (with Ahrens-Dieter boost for α < 1).
 *  - Sam Savage (2009), The Flaw of Averages: A portfolio with mean utilisation
 *    < 100% can still carry > 50% horizon-overload probability when individual
 *    items and incident/change reserves are right-skewed.
 *  - Goldratt (1997), Critical Chain & Parallel Resource Contention: Joint
 *    completion of funded work is governed by max(team effort / team rate,
 *    max_owner(owner effort / owner rate)), surfacing hidden bottleneck people.
 *  - Virginia Satir (1991) Change Model & Capital Budgeting under Uncertainty:
 *    Piecewise continuous J-Curve cash/benefit trajectory coupling stochastic
 *    transition duration τ^(k) (stretched by portfolio queueing contention when
 *    overloaded) with feasibility-adjusted post-cutover monthly benefits B^(k).
 *
 * Pure module: zero external dependencies, zero Math.random(), zero wall-clock
 * globals, deterministic across OS/engines for any fixed seed.
 */

import { addDays, dayKey, daysBetween } from '../time.js';
import { buildCapacityModel, deliveryForecast } from './capacity.js';
import {
  evaluateChangeEconomics,
  evaluateForceField,
  evaluateGuidingCoalition,
  evaluateStarAlignment,
  isChangeCommitted,
  isChangeOpen,
} from './changes.js';

export const DEFAULT_SIMULATION_SEED = 42;
export const DEFAULT_SIMULATION_TRIALS = 1000;
export const MIN_SIMULATION_TRIALS = 200;
export const MAX_SIMULATION_TRIALS = 5000;

function round2(n) {
  return Math.round(n * 100) / 100;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function nonNegative(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * FNV-1a 32-bit deterministic hash for string or numeric seeds.
 */
export function hashSeed(input) {
  if (typeof input === 'number' && Number.isFinite(input)) {
    const uint = (Math.trunc(input) >>> 0);
    return uint === 0 ? DEFAULT_SIMULATION_SEED : uint;
  }
  const text = String(input ?? DEFAULT_SIMULATION_SEED);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const out = h >>> 0;
  return out === 0 ? DEFAULT_SIMULATION_SEED : out;
}

/**
 * Mulberry32 deterministic PRNG returning uniform variates strictly in (0, 1).
 */
export function createSeededRng(seed = DEFAULT_SIMULATION_SEED) {
  let state = hashSeed(seed);
  return function nextRandom() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    const u = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    // Clamp strictly inside (0, 1) so log(u) in Box-Muller / Gamma never sees 0.
    if (u <= 0) return 1e-12;
    if (u >= 1) return 1 - 1e-12;
    return u;
  };
}

/**
 * Box-Muller standard normal variate N(0, 1).
 */
export function sampleStandardNormal(rng) {
  const u1 = Math.max(1e-12, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Marsaglia & Tsang (2000) exact Gamma(shape, 1) variate generator, with
 * Ahrens-Dieter power boost for 0 < shape < 1.
 */
export function sampleGamma(rng, shape) {
  if (!(shape > 0) || !Number.isFinite(shape)) return 0;
  if (shape < 1) {
    const boosted = sampleGamma(rng, shape + 1);
    return boosted * Math.pow(Math.max(1e-12, rng()), 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    const x = sampleStandardNormal(rng);
    let v = 1 + c * x;
    if (v <= 0) continue;
    v = v * v * v;
    const u = rng();
    const x2 = x * x;
    if (u < 1 - 0.0331 * x2 * x2) return d * v;
    if (Math.log(u) < 0.5 * x2 + d * (1 - v + Math.log(v))) return d * v;
  }
}

/**
 * Standard Beta(alpha, beta) variate on [0, 1].
 */
export function sampleBeta(rng, alpha, beta) {
  const g1 = sampleGamma(rng, alpha);
  const g2 = sampleGamma(rng, beta);
  const total = g1 + g2;
  return total > 0 ? g1 / total : 0.5;
}

/**
 * Continuous Beta-PERT variate on [O, P] with exact mean (O + λM + P)/(λ + 2)
 * when λ = 4: α = 1 + 4(M−O)/(P−O), β = 1 + 4(P−M)/(P−O), α + β = 6.
 */
export function sampleBetaPert(rng, { optimistic = 0, mostLikely = 0, pessimistic = 0, lambda = 4 } = {}) {
  const [o, m, p] = [
    nonNegative(optimistic, 0),
    nonNegative(mostLikely, 0),
    nonNegative(pessimistic, 0),
  ].sort((a, b) => a - b);
  const span = p - o;
  if (span <= 1e-9) return o;
  const lam = Number.isFinite(lambda) && lambda > 0 ? lambda : 4;
  const alpha = 1 + lam * ((m - o) / span);
  const beta = 1 + lam * ((p - m) / span);
  return o + sampleBeta(rng, alpha, beta) * span;
}

/**
 * Linear-interpolated empirical quantile on a pre-sorted numeric array.
 */
export function quantileSorted(sorted, q) {
  if (!sorted || !sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const clamped = Math.max(0, Math.min(1, q));
  const pos = clamped * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  const frac = pos - lo;
  return sorted[lo] + (sorted[hi] - sorted[lo]) * frac;
}

function buildHistogram(sorted, { binCount = 12, cutoff = null } = {}) {
  if (!sorted.length) return [];
  const minVal = sorted[0];
  const maxVal = sorted[sorted.length - 1];
  if (maxVal - minVal <= 1e-6) {
    return [{
      index: 0,
      from: round2(minVal),
      to: round2(maxVal),
      midpoint: round2(minVal),
      count: sorted.length,
      probability: 1,
      exceedsCutoff: cutoff !== null && cutoff > 0 ? minVal > cutoff : false,
    }];
  }
  const width = (maxVal - minVal) / binCount;
  const counts = new Array(binCount).fill(0);
  for (let i = 0; i < sorted.length; i += 1) {
    const rawIdx = Math.floor((sorted[i] - minVal) / width);
    const idx = Math.min(binCount - 1, Math.max(0, rawIdx));
    counts[idx] += 1;
  }
  return counts.map((count, i) => {
    const from = minVal + i * width;
    const to = i === binCount - 1 ? maxVal : minVal + (i + 1) * width;
    const midpoint = (from + to) / 2;
    return {
      index: i,
      from: round2(from),
      to: round2(to),
      midpoint: round2(midpoint),
      count,
      probability: round3(count / sorted.length),
      exceedsCutoff: cutoff !== null && cutoff > 0 ? midpoint > cutoff : false,
    };
  });
}

/**
 * Seeded Monte Carlo simulation of the operating plan (`#/capacity`):
 *  - Joint multi-project + reserve horizon feasibility probability
 *  - Team-fungible vs Owner-Constrained (Critical Chain) P50 / P80 / P90 dates
 *  - Target-date joint completion probabilities (side-by-side with CLT)
 *  - Schedule sensitivity / variance driver ranking
 *  - Trial-level congestion vector for coupling with `#/changes` J-curves
 */
export function simulatePortfolio(
  state,
  {
    seed,
    trials,
    now = new Date(),
    includeUndecided = false,
    retainTrialSeries = false,
  } = {},
) {
  const resolvedSeed = hashSeed(seed ?? state?.settings?.simulationSeed ?? DEFAULT_SIMULATION_SEED);
  const resolvedTrials = clampInt(
    trials ?? state?.settings?.simulationTrials,
    MIN_SIMULATION_TRIALS,
    MAX_SIMULATION_TRIALS,
    DEFAULT_SIMULATION_TRIALS,
  );
  const rng = createSeededRng(resolvedSeed);
  const today = dayKey(now);
  const model = buildCapacityModel(state, { now });
  const cltForecast = deliveryForecast(model, { now });

  const baseCommitted = includeUndecided
    ? [...model.demand.committed, ...model.demand.wanted]
    : model.demand.committed;
  const baseFunded = includeUndecided
    ? [...model.demand.fundedProjects, ...model.demand.wanted]
    : model.demand.fundedProjects;

  const measuredCommitted = baseCommitted.filter((i) => i.effort?.measured);
  const unestimatedCommittedCount = baseCommitted.length - measuredCommitted.length;
  const fundedIds = new Set(baseFunded.filter((i) => i.effort?.measured).map((i) => i.id));
  const measuredFunded = measuredCommitted.filter((i) => fundedIds.has(i.id));

  const horizonCalendarDays = Math.max(1, model.horizonWeeks * 7);
  const allocatableDays = model.supply.allocatableDays;
  const teamDailyRate = allocatableDays > 0 ? allocatableDays / horizonCalendarDays : 0;

  const activePeople = model.supply.people || [];
  const personIndexById = new Map(activePeople.map((p, idx) => [p.personId, idx]));
  const personDailyRates = activePeople.map((p) => (p.allocatable > 0 ? p.allocatable / horizonCalendarDays : 0));
  const personAllocatable = activePeople.map((p) => p.allocatable);

  if (!model.hasTeam || measuredCommitted.length === 0) {
    return {
      available: false,
      seed: resolvedSeed,
      trials: resolvedTrials,
      includeUndecided: Boolean(includeUndecided),
      reason: !model.hasTeam
        ? 'Add active team members to simulate capacity and completion confidence.'
        : 'Record at least one 3-point effort estimate on committed work to run Monte Carlo simulation.',
      allocatableDays,
      unestimatedCommittedCount,
      cltForecast,
    };
  }

  // Sort target-bearing funded items chronologically once (matching deliveryForecast)
  const targetItems = measuredFunded
    .filter((i) => i.targetOn)
    .slice()
    .sort((a, b) => String(a.targetOn).localeCompare(String(b.targetOn)) || String(a.id).localeCompare(String(b.id)));
  const targetMeta = targetItems.map((item) => {
    const daysToTarget = Math.max(0, daysBetween(today, item.targetOn));
    return {
      item,
      itemIdx: measuredCommitted.indexOf(item),
      daysToTarget,
      capacityByTarget: daysToTarget * teamDailyRate,
      hitCount: 0,
      cumCalendarSamples: new Float64Array(resolvedTrials),
    };
  });

  // Streaming correlation accumulators per committed item
  const itemCount = measuredCommitted.length;
  const sumItem = new Float64Array(itemCount);
  const sumItemSq = new Float64Array(itemCount);
  const sumItemTotal = new Float64Array(itemCount);
  const itemOwnerIdx = measuredCommitted.map((item) =>
    (item.ownerId && personIndexById.has(item.ownerId) ? personIndexById.get(item.ownerId) : -1),
  );
  const itemIsFunded = measuredCommitted.map((item) => fundedIds.has(item.id));

  const committedSamples = new Float64Array(resolvedTrials);
  const fundedSamples = new Float64Array(resolvedTrials);
  const teamCalSamples = new Float64Array(resolvedTrials);
  const bottleneckCalSamples = new Float64Array(resolvedTrials);

  const trialUtilisation = retainTrialSeries ? new Float64Array(resolvedTrials) : null;
  const ownerTrialUtilisation = retainTrialSeries
    ? Object.fromEntries(activePeople.map((p) => [p.personId, new Float64Array(resolvedTrials)]))
    : null;

  const criticalPersonCounts = new Array(activePeople.length).fill(0);
  const personOverloadCounts = new Array(activePeople.length).fill(0);
  let horizonFitCount = 0;
  let anyOwnerBreachCount = 0;

  let sumTotal = 0;
  let sumTotalSq = 0;
  const trialDraws = new Float64Array(itemCount);
  const personCommittedTrial = new Float64Array(activePeople.length);
  const personFundedTrial = new Float64Array(activePeople.length);

  for (let k = 0; k < resolvedTrials; k += 1) {
    personCommittedTrial.fill(0);
    personFundedTrial.fill(0);
    let totalCommitted = 0;
    let totalFunded = 0;
    let unownedCommitted = 0;
    let unownedFunded = 0;

    for (let i = 0; i < itemCount; i += 1) {
      const e = measuredCommitted[i].effort;
      const draw = sampleBetaPert(rng, {
        optimistic: e.optimistic,
        mostLikely: e.mostLikely,
        pessimistic: e.pessimistic,
      });
      trialDraws[i] = draw;
      totalCommitted += draw;
      const ownerIdx = itemOwnerIdx[i];
      if (ownerIdx >= 0) {
        personCommittedTrial[ownerIdx] += draw;
      } else {
        unownedCommitted += draw;
      }
      if (itemIsFunded[i]) {
        totalFunded += draw;
        if (ownerIdx >= 0) {
          personFundedTrial[ownerIdx] += draw;
        } else {
          unownedFunded += draw;
        }
      }
    }

    committedSamples[k] = totalCommitted;
    fundedSamples[k] = totalFunded;
    sumTotal += totalCommitted;
    sumTotalSq += totalCommitted * totalCommitted;

    for (let i = 0; i < itemCount; i += 1) {
      const d = trialDraws[i];
      sumItem[i] += d;
      sumItemSq[i] += d * d;
      sumItemTotal[i] += d * totalCommitted;
    }

    if (allocatableDays > 0 && totalCommitted <= allocatableDays + 1e-9) {
      horizonFitCount += 1;
    }
    if (trialUtilisation) {
      trialUtilisation[k] = allocatableDays > 0 ? totalCommitted / allocatableDays : 1;
    }

    const sharedCommitted = activePeople.length > 0 ? unownedCommitted / activePeople.length : 0;
    const sharedFunded = activePeople.length > 0 ? unownedFunded / activePeople.length : 0;

    const teamCalDays = teamDailyRate > 0 ? totalFunded / teamDailyRate : 0;
    teamCalSamples[k] = teamCalDays;

    let maxCalDays = teamCalDays;
    let criticalPersonIdx = -1;
    let anyOwnerOver = false;

    for (let p = 0; p < activePeople.length; p += 1) {
      const pComm = personCommittedTrial[p] + sharedCommitted;
      const pAlloc = personAllocatable[p];
      if (pAlloc > 0) {
        const u = pComm / pAlloc;
        if (ownerTrialUtilisation) {
          ownerTrialUtilisation[activePeople[p].personId][k] = u;
        }
        if (pComm > pAlloc + 1e-9) {
          personOverloadCounts[p] += 1;
          anyOwnerOver = true;
        }
      }
      const pFund = personFundedTrial[p] + sharedFunded;
      const pRate = personDailyRates[p];
      if (pFund > 0 && pRate > 0) {
        const pCalDays = pFund / pRate;
        if (pCalDays > maxCalDays + 1e-6) {
          maxCalDays = pCalDays;
          criticalPersonIdx = p;
        }
      }
    }

    if (anyOwnerOver) anyOwnerBreachCount += 1;
    if (criticalPersonIdx >= 0) criticalPersonCounts[criticalPersonIdx] += 1;
    bottleneckCalSamples[k] = maxCalDays;

    // Cumulative target-date checks in chronological order
    if (targetMeta.length > 0) {
      // Map drawn effort by id in O(1) via targetMeta order
      let cumFundedByTarget = 0;
      for (let t = 0; t < targetMeta.length; t += 1) {
        const meta = targetMeta[t];
        cumFundedByTarget += meta.itemIdx >= 0 ? trialDraws[meta.itemIdx] : meta.item.effort.expected;
        if (cumFundedByTarget <= meta.capacityByTarget + 1e-9) {
          meta.hitCount += 1;
        }
        meta.cumCalendarSamples[k] = teamDailyRate > 0 ? cumFundedByTarget / teamDailyRate : 0;
      }
    }
  }

  const sortedCommitted = Array.from(committedSamples).sort((a, b) => a - b);
  const sortedFunded = Array.from(fundedSamples).sort((a, b) => a - b);
  const sortedTeamCal = Array.from(teamCalSamples).sort((a, b) => a - b);
  const sortedBottleneckCal = Array.from(bottleneckCalSamples).sort((a, b) => a - b);

  const meanCommitted = sumTotal / resolvedTrials;
  const varCommitted = Math.max(0, sumTotalSq / resolvedTrials - meanCommitted * meanCommitted);
  const stdCommitted = Math.sqrt(varCommitted);

  const horizonFitProbability = round3(horizonFitCount / resolvedTrials);
  const overloadProbability = round3(1 - horizonFitProbability);
  const ownerBottleneckBreachProbability = round3(anyOwnerBreachCount / resolvedTrials);

  const dateFromCalDays = (calDays) =>
    (teamDailyRate > 0 && calDays !== null ? addDays(today, Math.ceil(calDays)) : null);

  const hasFunded = measuredFunded.length > 0;
  const teamP50Cal = hasFunded ? quantileSorted(sortedTeamCal, 0.5) : null;
  const teamP80Cal = hasFunded ? quantileSorted(sortedTeamCal, 0.8) : null;
  const teamP90Cal = hasFunded ? quantileSorted(sortedTeamCal, 0.9) : null;

  const bnP50Cal = hasFunded ? quantileSorted(sortedBottleneckCal, 0.5) : null;
  const bnP80Cal = hasFunded ? quantileSorted(sortedBottleneckCal, 0.8) : null;
  const bnP90Cal = hasFunded ? quantileSorted(sortedBottleneckCal, 0.9) : null;

  const topBottlenecks = activePeople
    .map((p, idx) => ({
      personId: p.personId,
      name: p.name,
      criticalShare: round3(criticalPersonCounts[idx] / resolvedTrials),
      overloadProbability: round3(personOverloadCounts[idx] / resolvedTrials),
      deterministicUtilisation: p.utilisation,
    }))
    .filter((b) => b.criticalShare > 0 || b.overloadProbability > 0)
    .sort((a, b) => b.criticalShare - a.criticalShare || b.overloadProbability - a.overloadProbability);

  // Schedule Sensitivity / Variance Drivers (Pearson r between item effort & total demand)
  const drivers = measuredCommitted
    .map((item, i) => {
      const mI = sumItem[i] / resolvedTrials;
      const vI = Math.max(0, sumItemSq[i] / resolvedTrials - mI * mI);
      const sdI = Math.sqrt(vI);
      const cov = sumItemTotal[i] / resolvedTrials - mI * meanCommitted;
      const corr = sdI > 1e-9 && stdCommitted > 1e-9
        ? Math.max(-1, Math.min(1, cov / (sdI * stdCommitted)))
        : 0;
      const varianceShare = varCommitted > 1e-9 ? Math.min(1, vI / varCommitted) : 0;
      return {
        id: item.id,
        title: item.title,
        kind: item.kind,
        sourceType: item.sourceType || 'manual',
        sourceId: item.sourceId || null,
        ownerId: item.ownerId || null,
        optimistic: item.effort.optimistic,
        mostLikely: item.effort.mostLikely,
        pessimistic: item.effort.pessimistic,
        expected: item.effort.expected,
        spread: round2(item.effort.pessimistic - item.effort.optimistic),
        sensitivityIndex: round3(Math.max(0, corr)),
        varianceShare: round3(varianceShare),
      };
    })
    .sort((a, b) => b.sensitivityIndex - a.sensitivityIndex || b.spread - a.spread);

  // Target-date joint completion table (MC vs CLT)
  const cltById = new Map((cltForecast.targetRisks || []).map((t) => [t.id, t]));
  const targetRisks = targetMeta.map((meta) => {
    const sortedCal = Array.from(meta.cumCalendarSamples).sort((a, b) => a - b);
    const mcP50Cal = quantileSorted(sortedCal, 0.5);
    const mcP80Cal = quantileSorted(sortedCal, 0.8);
    const mcProb = round3(meta.hitCount / resolvedTrials);
    const cltRow = cltById.get(meta.item.id) || null;
    const deterministicFits = meta.capacityByTarget >= (cltRow?.cumulativeWorkByTarget ?? 0);
    return {
      id: meta.item.id,
      title: meta.item.title,
      sourceType: meta.item.sourceType || 'manual',
      sourceId: meta.item.sourceId || null,
      targetOn: meta.item.targetOn,
      daysToTarget: meta.daysToTarget,
      capacityByTarget: round2(meta.capacityByTarget),
      cumulativeExpectedWork: cltRow?.cumulativeWorkByTarget ?? round2(meta.item.effort.expected),
      cltProbability: cltRow?.probability ?? null,
      mcProbability: mcProb,
      mcP50Date: dateFromCalDays(mcP50Cal),
      mcP80Date: dateFromCalDays(mcP80Cal),
      deterministicAtRisk: Boolean(cltRow?.atRisk),
      tailRiskOnly: deterministicFits && mcProb < 0.5,
    };
  });

  const deterministicFeasible = model.utilisation !== null && model.utilisation <= 1;
  const flawOfAveragesTrap = deterministicFeasible && overloadProbability >= 0.5;
  const bottleneckSlipDaysP80 =
    hasFunded && bnP80Cal !== null && teamP80Cal !== null
      ? Math.max(0, Math.round(bnP80Cal - teamP80Cal))
      : 0;

  return {
    available: true,
    seed: resolvedSeed,
    trials: resolvedTrials,
    includeUndecided: Boolean(includeUndecided),
    allocatableDays,
    deterministicCommittedDays: round2(measuredCommitted.reduce((s, i) => s + i.effort.expected, 0)),
    deterministicUtilisation: model.utilisation,
    unestimatedCommittedCount,
    horizonFitProbability,
    overloadProbability,
    ownerBottleneckBreachProbability,
    flawOfAveragesTrap,
    committedDemand: {
      mean: round2(meanCommitted),
      stdDev: round2(stdCommitted),
      min: round2(sortedCommitted[0]),
      p10: round2(quantileSorted(sortedCommitted, 0.1)),
      p25: round2(quantileSorted(sortedCommitted, 0.25)),
      p50: round2(quantileSorted(sortedCommitted, 0.5)),
      p80: round2(quantileSorted(sortedCommitted, 0.8)),
      p90: round2(quantileSorted(sortedCommitted, 0.9)),
      max: round2(sortedCommitted[sortedCommitted.length - 1]),
      bins: buildHistogram(sortedCommitted, { binCount: 12, cutoff: allocatableDays }),
    },
    fundedScope: {
      count: measuredFunded.length,
      p10Days: hasFunded ? round2(quantileSorted(sortedFunded, 0.1)) : null,
      p50Days: hasFunded ? round2(quantileSorted(sortedFunded, 0.5)) : null,
      p80Days: hasFunded ? round2(quantileSorted(sortedFunded, 0.8)) : null,
      p90Days: hasFunded ? round2(quantileSorted(sortedFunded, 0.9)) : null,
    },
    teamCompletion: {
      available: hasFunded,
      p50CalendarDays: teamP50Cal !== null ? Math.ceil(teamP50Cal) : null,
      p80CalendarDays: teamP80Cal !== null ? Math.ceil(teamP80Cal) : null,
      p90CalendarDays: teamP90Cal !== null ? Math.ceil(teamP90Cal) : null,
      p50: dateFromCalDays(teamP50Cal),
      p80: dateFromCalDays(teamP80Cal),
      p90: dateFromCalDays(teamP90Cal),
    },
    bottleneckCompletion: {
      available: hasFunded,
      p50CalendarDays: bnP50Cal !== null ? Math.ceil(bnP50Cal) : null,
      p80CalendarDays: bnP80Cal !== null ? Math.ceil(bnP80Cal) : null,
      p90CalendarDays: bnP90Cal !== null ? Math.ceil(bnP90Cal) : null,
      p50: dateFromCalDays(bnP50Cal),
      p80: dateFromCalDays(bnP80Cal),
      p90: dateFromCalDays(bnP90Cal),
      slipDaysVsTeamP80: bottleneckSlipDaysP80,
      topBottlenecks,
    },
    targetRisks,
    drivers,
    cltForecast,
    ...(retainTrialSeries ? { trialUtilisation, ownerTrialUtilisation } : {}),
  };
}

/**
 * Stochastic Satir J-Curve & Payback Simulation for an Organizational Change
 * (`#/changes`). Couples 3-point Beta-PERT transition effort, transition cost,
 * feasibility-adjusted 3-point monthly benefits, and (when `portfolioSim` or
 * `state` is supplied) real-time portfolio capacity congestion.
 */
export function simulateChangeJCurve(
  change,
  {
    state = null,
    seed,
    trials,
    now = new Date(),
    portfolioSim = null,
  } = {},
) {
  const baseSeed = seed ?? state?.settings?.simulationSeed ?? DEFAULT_SIMULATION_SEED;
  const changeSeed = hashSeed(`${baseSeed}:change:${change?.id || change?.title || 'chg'}`);
  const resolvedTrials = clampInt(
    trials ?? state?.settings?.simulationTrials,
    MIN_SIMULATION_TRIALS,
    MAX_SIMULATION_TRIALS,
    DEFAULT_SIMULATION_TRIALS,
  );

  const forceField = evaluateForceField(change);
  const star = evaluateStarAlignment(change);
  const coalition = evaluateGuidingCoalition(change);
  const econ = evaluateChangeEconomics(change, { forceField, star, coalition });

  if (!econ.financialMeasured) {
    return {
      available: false,
      seed: changeSeed,
      trials: resolvedTrials,
      currency: econ.currency,
      horizonMonths: econ.horizonMonths,
      economics: econ,
      reason: 'Record a transition cost or 3-point monthly benefit estimate to simulate the J-curve.',
    };
  }

  const rng = createSeededRng(changeSeed);
  const H = econ.horizonMonths;
  const cost = econ.transitionCost;
  const feasibility = econ.feasibilityFactor;
  const committed = isChangeCommitted(change);

  const ownerUtilSeries =
    committed && change?.ownerId && portfolioSim?.ownerTrialUtilisation?.[change.ownerId]
      ? portfolioSim.ownerTrialUtilisation[change.ownerId]
      : null;
  const teamUtilSeries = committed && portfolioSim?.trialUtilisation
    ? portfolioSim.trialUtilisation
    : null;

  // Matrix of monthly cumulative net values: (H + 1) x resolvedTrials
  const monthSamples = Array.from({ length: H + 1 }, () => new Float64Array(resolvedTrials));
  const paybackSamples = [];
  const troughValues = new Float64Array(resolvedTrials);
  const troughMonths = new Float64Array(resolvedTrials);
  const netHorizonSamples = new Float64Array(resolvedTrials);
  let positiveHorizonCount = 0;
  let congestionStretchedTrials = 0;

  for (let k = 0; k < resolvedTrials; k += 1) {
    const effortDraw = econ.effort.measured
      ? sampleBetaPert(rng, {
          optimistic: econ.effort.optimistic,
          mostLikely: econ.effort.mostLikely,
          pessimistic: econ.effort.pessimistic,
        })
      : 0;

    const rawBenefitDraw = econ.monthlyBenefit.measured
      ? sampleBetaPert(rng, {
          optimistic: econ.monthlyBenefit.optimistic,
          mostLikely: econ.monthlyBenefit.mostLikely,
          pessimistic: econ.monthlyBenefit.pessimistic,
        })
      : 0;
    const adjMonthlyBenefit = rawBenefitDraw * feasibility;

    let stretch = 1;
    const utilSample = ownerUtilSeries && k < ownerUtilSeries.length
      ? ownerUtilSeries[k]
      : teamUtilSeries && k < teamUtilSeries.length
        ? teamUtilSeries[k]
        : 1;
    if (utilSample > 1.0001) {
      stretch = Math.min(2.5, utilSample);
      congestionStretchedTrials += 1;
    }

    // 15 focused person-days ≈ 3 transition weeks (0.75 months) baseline
    const baseTau = econ.effort.measured
      ? Math.max(0.25, effortDraw / 15)
      : cost > 0
        ? 0.5
        : 0;
    const tau = Math.min(H * 1.25, baseTau * stretch);

    troughMonths[k] = Math.min(H, tau);
    troughValues[k] = tau > 0 ? -Math.min(cost, cost * (Math.min(H, tau) / tau)) : -cost;

    monthSamples[0][k] = 0;
    for (let m = 1; m <= H; m += 1) {
      let val;
      if (tau <= 1e-6) {
        val = -cost + adjMonthlyBenefit * m;
      } else if (m <= tau) {
        val = -cost * (m / tau);
      } else {
        val = -cost + adjMonthlyBenefit * (m - tau);
      }
      monthSamples[m][k] = val;
    }

    const netH = monthSamples[H][k];
    netHorizonSamples[k] = netH;
    if (netH > 0) positiveHorizonCount += 1;

    if (cost <= 0 && adjMonthlyBenefit > 0) {
      paybackSamples.push(round2(tau));
    } else if (adjMonthlyBenefit > 1e-6) {
      const pb = tau + cost / adjMonthlyBenefit;
      if (pb <= H + 1e-9) paybackSamples.push(pb);
    }
  }

  const months = monthSamples.map((arr, month) => {
    const sorted = Array.from(arr).sort((a, b) => a - b);
    const mean = sorted.reduce((s, v) => s + v, 0) / resolvedTrials;
    return {
      month,
      p10: round2(quantileSorted(sorted, 0.1)),
      p50: round2(quantileSorted(sorted, 0.5)),
      p80: round2(quantileSorted(sorted, 0.8)),
      p90: round2(quantileSorted(sorted, 0.9)),
      mean: round2(mean),
    };
  });

  const sortedNet = Array.from(netHorizonSamples).sort((a, b) => a - b);
  const meanNet = sortedNet.reduce((s, v) => s + v, 0) / resolvedTrials;
  const sortedTroughVal = Array.from(troughValues).sort((a, b) => a - b);
  const sortedTroughMo = Array.from(troughMonths).sort((a, b) => a - b);

  // For payback, trials that never break even within H are treated as +Infinity
  // when computing unconditional P50/P80/P90 payback quantiles!
  const sortedPaybackWithInf = paybackSamples.slice().sort((a, b) => a - b);
  while (sortedPaybackWithInf.length < resolvedTrials) {
    sortedPaybackWithInf.push(Infinity);
  }
  const finiteQuantile = (q) => {
    const v = quantileSorted(sortedPaybackWithInf, q);
    return Number.isFinite(v) ? round1(v) : null;
  };

  const probabilityPositive = round3(positiveHorizonCount / resolvedTrials);
  const probabilityLoss = round3(1 - probabilityPositive);
  const probabilityPaybackWithinHorizon = round3(paybackSamples.length / resolvedTrials);

  return {
    available: true,
    seed: changeSeed,
    trials: resolvedTrials,
    currency: econ.currency,
    horizonMonths: H,
    transitionCost: cost,
    feasibilityFactor: feasibility,
    discountDrivers: econ.discountDrivers,
    coupledWithCapacity: Boolean(ownerUtilSeries || teamUtilSeries),
    congestionStretchProbability: round3(congestionStretchedTrials / resolvedTrials),
    months,
    valley: {
      troughMonthP50: round1(quantileSorted(sortedTroughMo, 0.5)),
      troughValueP50: round2(quantileSorted(sortedTroughVal, 0.5)),
      troughValueP90Worst: round2(quantileSorted(sortedTroughVal, 0.1)),
    },
    paybackMonths: {
      deterministic: econ.expectedPaybackMonths,
      p10: finiteQuantile(0.1),
      p50: finiteQuantile(0.5),
      p80: finiteQuantile(0.8),
      p90: finiteQuantile(0.9),
      probabilityWithinHorizon: probabilityPaybackWithinHorizon,
    },
    horizonNet: {
      deterministic: econ.riskAdjustedNetBenefit,
      mean: round2(meanNet),
      p10: round2(quantileSorted(sortedNet, 0.1)),
      p50: round2(quantileSorted(sortedNet, 0.5)),
      p80: round2(quantileSorted(sortedNet, 0.8)),
      p90: round2(quantileSorted(sortedNet, 0.9)),
      probabilityPositive,
      probabilityLoss,
    },
    economics: econ,
  };
}

/**
 * Coupled workspace simulation across `#/capacity` and all open `#/changes`
 * records, sharing trial-by-trial capacity utilisation so overloaded owners or
 * horizons realistically stretch active organizational change J-curves.
 */
export function simulateJointWorkspace(
  state,
  {
    seed,
    trials,
    now = new Date(),
    includeUndecided = false,
  } = {},
) {
  const resolvedSeed = hashSeed(seed ?? state?.settings?.simulationSeed ?? DEFAULT_SIMULATION_SEED);
  const resolvedTrials = clampInt(
    trials ?? state?.settings?.simulationTrials,
    MIN_SIMULATION_TRIALS,
    MAX_SIMULATION_TRIALS,
    DEFAULT_SIMULATION_TRIALS,
  );
  const portfolio = simulatePortfolio(state, {
    seed: resolvedSeed,
    trials: resolvedTrials,
    now,
    includeUndecided,
    retainTrialSeries: true,
  });

  const changesById = {};
  for (const chg of state?.changes || []) {
    if (!chg) continue;
    changesById[chg.id] = simulateChangeJCurve(chg, {
      state,
      seed: resolvedSeed,
      trials: resolvedTrials,
      now,
      portfolioSim: portfolio.available ? portfolio : null,
    });
  }

  // Strip internal Float64Array buffers from external return payload
  const { trialUtilisation: _tu, ownerTrialUtilisation: _otu, ...cleanPortfolio } = portfolio;
  return {
    seed: resolvedSeed,
    trials: resolvedTrials,
    portfolio: cleanPortfolio,
    changesById,
    openChangeSimulations: (state?.changes || [])
      .filter(isChangeOpen)
      .map((chg) => ({ change: chg, simulation: changesById[chg.id] }))
      .filter((row) => row.simulation?.available),
  };
}
