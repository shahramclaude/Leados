/**
 * app/core/domain/continuityCoupling.js — Continuity-Coupled ("All-Weather")
 * Portfolio Monte Carlo, Coherent Tail Risk (VaR/CVaR), Dual-Hat Steward
 * Contention & Marginal Resilience-to-Delivery Frontier.
 *
 * Bridges the operational silo between Operational Resilience (`#/resilience`)
 * and Capacity & Flow (`#/capacity` / `#/scenarios`) using named methods:
 *
 *  1. Production & Supply-Chain Resilience — Simchi-Levi, Schmidt & Wei (HBR
 *     2014; Management Science 2015) and Gao, Simchi-Levi, Teo & Yan
 *     (Operations Research, 2019): directed multi-tier survival shortfall
 *     propagation max(0, outage - TTS) attenuated by warm-standby switchover
 *     or eliminated by dual-active redundancy.
 *  2. Operations Research & Critical Chain — Hopp & Spearman (Factory Physics,
 *     2011) and Goldratt (Critical Chain, 1997): random preemptive outage
 *     shocks divert focused recovery capacity from qualified stewards (starving
 *     owner-constrained Critical-Chain paths) while service survival shortfalls
 *     stall downstream linked portfolio items without double-counting repair.
 *  3. Systems Safety — Perrow (Normal Accidents, 1984) common-mode sub-tier
 *     cascades and Avelino et al. (ICPC 2016) Bus-Factor stewardship pooling.
 *  4. Non-Parametric Statistics & Variance Reduction — Common Random Numbers
 *     (Law, Simulation Modeling and Analysis, 2014) pairing Fair-Weather and
 *     All-Weather Beta-PERT effort draws trial-by-trial, combined with Efron
 *     (1979) empirical bootstrap & Vovk et al. (2005) split-conformal drill
 *     ratio uplift once n >= 5 continuity drills are recorded.
 *  5. Actuarial & Financial Risk — Coherent discrete Conditional Value-at-Risk
 *     / Expected Shortfall CVaR_alpha (Rockafellar & Uryasev, 2000; Acerbi &
 *     Tasche, 2002) strictly segmented per currency, paired with marginal
 *     redundancy ROI and Williamson (1985) / Tsebelis (2002) hold-up warnings.
 *
 * Honesty boundaries enforced in code:
 *  - Active dependencies missing `annualFailureProb` or `ttrDays` are NEVER
 *    treated as 0% failure risk; they are omitted from shock sampling and
 *    explicitly surfaced in `unmodeledDeps` so uncertainty is never hidden.
 *  - Below n = 5 scored continuity drills (`RESILIENCE_MIN_DRILL_SAMPLES`),
 *    shock recovery durations use declared point TTRs without inventing spread.
 *  - Currencies are never summed across cohorts.
 *  - Pure module: zero DOM, zero storage IO, zero network, zero Math.random().
 */

import { addDays, dayKey, daysBetween } from '../time.js';
import { buildCapacityModel } from './capacity.js';
import {
  DEFAULT_SIMULATION_SEED,
  DEFAULT_SIMULATION_TRIALS,
  MAX_SIMULATION_TRIALS,
  MIN_SIMULATION_TRIALS,
  createSeededRng,
  hashSeed,
  quantileSorted,
  sampleBetaPert,
  sampleStandardNormal,
} from './simulation.js';
import {
  RESILIENCE_MIN_DRILL_SAMPLES,
  analyzeDependencyNetwork,
  effectivePropagatedOutage,
  evaluateDrillCalibration,
  evaluateHoldUpRisk,
  evaluateRedundancyEconomics,
  isDependencyActive,
} from './resilience.js';

export const COUPLING_ENGINE_VERSION = 'continuity-coupling-2026.10-v1';
export const DEFAULT_COUPLING_MIN_FIT_PCT = 50;
export const DEFAULT_COUPLING_TAIL_DROP_PCT = 15;
export const COUPLING_SLIP_WARN_DAYS = 7;
export const COUPLING_DUAL_HAT_DELTA = 0.15;
export const COUPLING_DUAL_HAT_MIN_OVERLOAD = 0.5;

function round1(n) {
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}
function round2(n) {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}
function round3(n) {
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null;
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function finitePosOrNull(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function finiteNonNegOrNull(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Exact Knuth Poisson(lambda) variate generator on a deterministic PRNG, with
 * normal approximation guard for large lambda (> 30).
 */
export function samplePoisson(rng, lambda) {
  if (!Number.isFinite(lambda) || lambda <= 0) return 0;
  if (lambda > 30) {
    const z = sampleStandardNormal(rng);
    return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * z));
  }
  const limit = Math.exp(-lambda);
  let k = 0;
  let prod = 1;
  do {
    k += 1;
    prod *= rng();
  } while (prod > limit);
  return k - 1;
}

/**
 * Coherent discrete Value-at-Risk (VaR_alpha) and Conditional Value-at-Risk /
 * Expected Shortfall (CVaR_alpha) per Rockafellar & Uryasev (2000) and
 * Acerbi & Tasche (2002). Exact for any finite sample size N >= 1.
 */
export function computeTailRisk(samples, alpha = 0.9) {
  if (!samples || !samples.length) {
    return { count: 0, mean: 0, p50: 0, var90: 0, cvar90: 0, max: 0, nonZeroProb: 0 };
  }
  const n = samples.length;
  const sorted = Array.from(samples).sort((a, b) => a - b);
  let sum = 0;
  let nonZero = 0;
  for (let i = 0; i < n; i += 1) {
    sum += sorted[i];
    if (sorted[i] > 1e-9) nonZero += 1;
  }
  const a = Math.min(0.995, Math.max(0.5, Number(alpha) || 0.9));
  const tailMass = 1 - a;
  const kAlpha = Math.min(n - 1, Math.floor(a * n));
  const boundaryWeight = (kAlpha + 1) / n - a;
  let tailWeightedSum = Math.max(0, boundaryWeight) * sorted[kAlpha];
  for (let i = kAlpha + 1; i < n; i += 1) {
    tailWeightedSum += (1 / n) * sorted[i];
  }
  const cvar = tailMass > 0 ? tailWeightedSum / tailMass : sorted[n - 1];
  const varVal = quantileSorted(sorted, a) ?? 0;

  return {
    count: n,
    mean: round2(sum / n),
    p50: round2(quantileSorted(sorted, 0.5) ?? 0),
    var90: round2(varVal),
    cvar90: round2(Math.max(varVal, cvar)),
    max: round2(sorted[n - 1]),
    nonZeroProb: round3(nonZero / n),
  };
}

/**
 * Convert annual disruption probability (% chance of >= 1 event in 365d) into
 * continuous-time Poisson arrival intensity over `horizonCalendarDays`.
 */
export function horizonArrivalLambda(annualProbPct, horizonCalendarDays) {
  const pPct = finitePosOrNull(annualProbPct);
  if (pPct === null || !(horizonCalendarDays > 0)) return 0;
  const p = Math.min(0.999, Math.max(0, pPct / 100));
  return -(horizonCalendarDays / 365) * Math.log(1 - p);
}

function buildPortfolioDependencyMap(activeDeps, measuredCommitted, links = []) {
  const byItemId = new Map();
  const addEdge = (itemId, depId) => {
    if (!itemId || !depId) return;
    if (!byItemId.has(itemId)) byItemId.set(itemId, new Set());
    byItemId.get(itemId).add(depId);
  };
  const itemByGoal = new Map();
  for (const item of measuredCommitted) {
    if (item.sourceType === 'goal' && item.sourceId) {
      if (!itemByGoal.has(item.sourceId)) itemByGoal.set(item.sourceId, []);
      itemByGoal.get(item.sourceId).push(item.id);
    }
  }
  const activeDepIds = new Set(activeDeps.map((d) => d.id));
  for (const dep of activeDeps) {
    if (dep.linkedPortfolioId) addEdge(dep.linkedPortfolioId, dep.id);
    for (const gid of dep.linkedGoalIds || []) {
      for (const itemId of itemByGoal.get(gid) || []) addEdge(itemId, dep.id);
    }
  }
  for (const lnk of links || []) {
    if (!lnk) continue;
    if (lnk.sourceType === 'dependency' && lnk.targetType === 'portfolio' && activeDepIds.has(lnk.sourceId)) {
      addEdge(lnk.targetId, lnk.sourceId);
    } else if (lnk.sourceType === 'portfolio' && lnk.targetType === 'dependency' && activeDepIds.has(lnk.targetId)) {
      addEdge(lnk.sourceId, lnk.targetId);
    }
  }
  return byItemId;
}

function applyDependencyOverrides(state, overrides) {
  if (!overrides || typeof overrides !== 'object' || !Object.keys(overrides).length) return state;
  return {
    ...state,
    dependencies: (state.dependencies || []).map((dep) => {
      const patch = dep && overrides[dep.id];
      if (!patch) return dep;
      return { ...dep, ...patch };
    }),
  };
}

/**
 * Coupled Continuity-Shock × Critical-Chain Portfolio Monte Carlo.
 *
 * Uses Common Random Numbers (two independent seeded streams: one for effort
 * PERT draws, one for Poisson/bootstrap continuity shocks) so Fair-Weather and
 * All-Weather trials are strictly paired trial-by-trial.
 */
export function simulateCoupledPortfolio(
  state = {},
  {
    seed,
    trials,
    now = new Date(),
    includeUndecided = false,
    dependencyOverrides = null,
  } = {},
) {
  const workingState = applyDependencyOverrides(state, dependencyOverrides);
  const resolvedSeed = hashSeed(seed ?? workingState?.settings?.simulationSeed ?? DEFAULT_SIMULATION_SEED);
  const resolvedTrials = clampInt(
    trials ?? workingState?.settings?.simulationTrials,
    MIN_SIMULATION_TRIALS,
    MAX_SIMULATION_TRIALS,
    DEFAULT_SIMULATION_TRIALS,
  );
  const effortRng = createSeededRng(resolvedSeed);
  const shockRng = createSeededRng(hashSeed(resolvedSeed ^ 0x9e3779b9));
  const today = dayKey(now);

  const model = buildCapacityModel(workingState, { now });
  const baseCommitted = includeUndecided
    ? [...model.demand.committed, ...model.demand.wanted]
    : model.demand.committed;
  const baseFunded = includeUndecided
    ? [...model.demand.fundedProjects, ...model.demand.wanted]
    : model.demand.fundedProjects;
  const measuredCommitted = baseCommitted.filter((i) => i.effort?.measured);
  const fundedIds = new Set(baseFunded.filter((i) => i.effort?.measured).map((i) => i.id));
  const measuredFunded = measuredCommitted.filter((i) => fundedIds.has(i.id));

  const network = analyzeDependencyNetwork(workingState, now);
  const drillCal = evaluateDrillCalibration(workingState, now);
  const activeDeps = network.activeDeps || [];

  const modeledDeps = [];
  const unmodeledDeps = [];
  for (const dep of activeDeps) {
    const prob = finiteNonNegOrNull(dep.annualFailureProb);
    const ttr = finitePosOrNull(dep.ttrDays);
    if (prob === null) {
      unmodeledDeps.push({ id: dep.id, name: dep.name, criticality: dep.criticality, reason: 'missing-probability' });
    } else if (prob > 0 && ttr === null && dep.substitutability !== 'dual-active') {
      unmodeledDeps.push({ id: dep.id, name: dep.name, criticality: dep.criticality, reason: 'missing-ttr' });
    } else if (prob > 0) {
      modeledDeps.push(dep);
    }
  }
  const unmodeledCriticalDeps = unmodeledDeps.filter((d) => d.criticality === 'critical' || d.criticality === 'important');

  if (!model.hasTeam || measuredCommitted.length === 0) {
    return {
      available: false,
      shocksModeled: modeledDeps.length > 0,
      seed: resolvedSeed,
      trials: resolvedTrials,
      reason: !model.hasTeam
        ? 'Add active team members to run coupled continuity-capacity simulation.'
        : 'Record at least one 3-point effort estimate on committed work to run coupled simulation.',
      modeledDependencyCount: modeledDeps.length,
      unmodeledDeps,
      unmodeledCriticalDeps,
    };
  }

  const horizonCalendarDays = Math.max(1, model.horizonWeeks * 7);
  const allocatableDays = model.supply.allocatableDays;
  const teamDailyRate = allocatableDays > 0 ? allocatableDays / horizonCalendarDays : 0;
  const activePeople = model.supply.people || [];
  const personIndexById = new Map(activePeople.map((p, idx) => [p.personId, idx]));
  const personAllocatable = activePeople.map((p) => p.allocatable);
  const personDailyRates = activePeople.map((p) => (p.allocatable > 0 ? p.allocatable / horizonCalendarDays : 0));

  const drillRatios = drillCal.sufficient ? drillCal.pairs.map((p) => p.ratio).filter((r) => r > 0) : [];
  const calibrationMode = drillRatios.length >= RESILIENCE_MIN_DRILL_SAMPLES
    ? 'empirical-drill-bootstrap'
    : 'declared-point-ttr';

  const itemCount = measuredCommitted.length;
  const itemOwnerIdx = measuredCommitted.map((item) =>
    (item.ownerId && personIndexById.has(item.ownerId) ? personIndexById.get(item.ownerId) : -1),
  );
  const itemIsFunded = measuredCommitted.map((item) => fundedIds.has(item.id));
  const itemDepMap = buildPortfolioDependencyMap(activeDeps, measuredCommitted, workingState.links);
  const itemDepIds = measuredCommitted.map((item) => Array.from(itemDepMap.get(item.id) || []));

  const depIndexById = new Map(activeDeps.map((d, idx) => [d.id, idx]));
  const depLambdas = activeDeps.map((dep) => {
    const prob = finiteNonNegOrNull(dep.annualFailureProb);
    if (prob === null || prob <= 0) return 0;
    const ttr = finitePosOrNull(dep.ttrDays);
    if (ttr === null && dep.substitutability !== 'dual-active') return 0;
    return horizonArrivalLambda(prob, horizonCalendarDays);
  });
  const depStewardIndices = activeDeps.map((dep) => {
    const st = network.stewardshipById.get(dep.id);
    const idxs = (st?.qualifiedStewards || [])
      .map((s) => personIndexById.get(s.personId))
      .filter((idx) => idx !== undefined);
    return idxs;
  });
  const depValuations = activeDeps.map((dep) => network.valuationById.get(dep.id));
  const currencies = Array.from(
    new Set(
      depValuations
        .flatMap((v) => (v?.priced ? (v.byCurrency || []).map((c) => c.currency) : [])),
    ),
  ).sort();
  const lossSamplesByCurrency = Object.fromEntries(currencies.map((cur) => [cur, new Float64Array(resolvedTrials)]));

  const targetItems = measuredFunded
    .filter((i) => i.targetOn)
    .slice()
    .sort((a, b) => String(a.targetOn).localeCompare(String(b.targetOn)) || String(a.id).localeCompare(String(b.id)));
  const targetMeta = targetItems.map((item) => ({
    item,
    itemIdx: measuredCommitted.indexOf(item),
    daysToTarget: Math.max(0, daysBetween(today, item.targetOn)),
    fairHitCount: 0,
    coupledHitCount: 0,
  }));

  const fairBottleneckSamples = new Float64Array(resolvedTrials);
  const coupledBottleneckSamples = new Float64Array(resolvedTrials);
  const diversionPersonDaySamples = new Float64Array(resolvedTrials);
  const trialDraws = new Float64Array(itemCount);
  const personCommitted = new Float64Array(activePeople.length);
  const personFunded = new Float64Array(activePeople.length);
  const personDiverted = new Float64Array(activePeople.length);
  const outageAt = new Float64Array(activeDeps.length);
  const shortfallAt = new Float64Array(activeDeps.length);

  const fairOwnerOverCount = new Array(activePeople.length).fill(0);
  const coupledOwnerOverCount = new Array(activePeople.length).fill(0);
  const stewardDivertedTrials = new Array(activePeople.length).fill(0);
  const personDivertedSum = new Float64Array(activePeople.length);
  const depShockTrials = new Array(activeDeps.length).fill(0);

  let fairFitCount = 0;
  let coupledFitCount = 0;
  let shockTrialCount = 0;

  const maxCascadePasses = Math.max(1, activeDeps.length - 1);

  for (let k = 0; k < resolvedTrials; k += 1) {
    personCommitted.fill(0);
    personFunded.fill(0);
    personDiverted.fill(0);
    outageAt.fill(0);
    shortfallAt.fill(0);

    let totalCommitted = 0;
    let totalFunded = 0;
    let unownedCommitted = 0;
    let unownedFunded = 0;

    // 1. Fair-weather effort draws (paired CRN stream)
    for (let i = 0; i < itemCount; i += 1) {
      const e = measuredCommitted[i].effort;
      const draw = sampleBetaPert(effortRng, {
        optimistic: e.optimistic,
        mostLikely: e.mostLikely,
        pessimistic: e.pessimistic,
      });
      trialDraws[i] = draw;
      totalCommitted += draw;
      const ownerIdx = itemOwnerIdx[i];
      if (ownerIdx >= 0) personCommitted[ownerIdx] += draw;
      else unownedCommitted += draw;
      if (itemIsFunded[i]) {
        totalFunded += draw;
        if (ownerIdx >= 0) personFunded[ownerIdx] += draw;
        else unownedFunded += draw;
      }
    }

    // 2. Continuity shock arrivals & drill-calibrated recovery durations
    let unstewardedDivertedDays = 0;
    let anyShockInTrial = false;
    for (let d = 0; d < activeDeps.length; d += 1) {
      const lam = depLambdas[d];
      if (!(lam > 0)) continue;
      const arrivals = samplePoisson(shockRng, lam);
      if (arrivals <= 0) continue;
      anyShockInTrial = true;
      depShockTrials[d] += 1;
      const dep = activeDeps[d];
      const baseTtr = finitePosOrNull(dep.ttrDays) ?? 0;
      let rawRecoveryCalDays = 0;
      for (let a = 0; a < arrivals; a += 1) {
        const mult = calibrationMode === 'empirical-drill-bootstrap'
          ? drillRatios[Math.min(drillRatios.length - 1, Math.floor(shockRng() * drillRatios.length))]
          : 1;
        rawRecoveryCalDays += baseTtr * mult;
      }
      const effServiceOutage = dep.substitutability === 'dual-active'
        ? 0
        : dep.substitutability === 'warm-standby'
          ? Math.min(rawRecoveryCalDays, arrivals * (finitePosOrNull(dep.warmSwitchDays) ?? 1))
          : rawRecoveryCalDays;
      outageAt[d] = effServiceOutage;

      // Emergency recovery labor on direct shock (attenuated by warm-standby / eliminated by dual-active)
      const cutoverCalDays = Math.min(horizonCalendarDays, effServiceOutage);
      if (cutoverCalDays > 0) {
        const stewards = depStewardIndices[d];
        if (stewards.length > 0) {
          const perStewardCal = cutoverCalDays / stewards.length;
          for (let s = 0; s < stewards.length; s += 1) {
            const pIdx = stewards[s];
            personDiverted[pIdx] += perStewardCal * personDailyRates[pIdx];
          }
        } else if (activePeople.length > 0) {
          unstewardedDivertedDays += cutoverCalDays * (teamDailyRate / activePeople.length);
        }
      }
    }
    if (anyShockInTrial) shockTrialCount += 1;

    // 3. Propagate upstream outages across multi-tier dependency DAG
    if (anyShockInTrial) {
      for (let pass = 0; pass < maxCascadePasses; pass += 1) {
        let changed = false;
        for (let d = 0; d < activeDeps.length; d += 1) {
          const currOut = outageAt[d];
          if (currOut <= 0) continue;
          const downIds = network.downstreamOf.get(activeDeps[d].id) || [];
          for (let m = 0; m < downIds.length; m += 1) {
            const nxtIdx = depIndexById.get(downIds[m]);
            if (nxtIdx === undefined) continue;
            const prop = effectivePropagatedOutage(currOut, activeDeps[nxtIdx]);
            if (prop > outageAt[nxtIdx] + 1e-9) {
              outageAt[nxtIdx] = prop;
              changed = true;
            }
          }
        }
        if (!changed) break;
      }

      // Compute survival shortfalls & currency losses per node
      for (let d = 0; d < activeDeps.length; d += 1) {
        const out = outageAt[d];
        if (out <= 0) continue;
        const tts = finiteNonNegOrNull(activeDeps[d].ttsDays);
        const sf = tts !== null ? Math.max(0, out - tts) : out;
        shortfallAt[d] = sf;
        if (sf > 0) {
          const val = depValuations[d];
          if (val?.priced) {
            for (const term of val.byCurrency || []) {
              lossSamplesByCurrency[term.currency][k] += term.dailyImpact * sf;
            }
          }
        }
      }
    }

    // 4. Evaluate Fair-Weather vs Coupled Capacity & Critical-Chain Completion
    let totalDiverted = 0;
    for (let p = 0; p < activePeople.length; p += 1) {
      const div = Math.min(personAllocatable[p], personDiverted[p] + unstewardedDivertedDays);
      personDiverted[p] = div;
      totalDiverted += div;
      if (div > 1e-9) {
        stewardDivertedTrials[p] += 1;
        personDivertedSum[p] += div;
      }
    }
    diversionPersonDaySamples[k] = totalDiverted;

    const netTeamAllocatable = Math.max(0, allocatableDays - totalDiverted);
    if (allocatableDays > 0 && totalCommitted <= allocatableDays + 1e-9) fairFitCount += 1;

    // Max service shortfall stall across funded items
    let maxItemStallCalDays = 0;
    for (let i = 0; i < itemCount; i += 1) {
      if (!itemIsFunded[i]) continue;
      const deps = itemDepIds[i];
      let itemStall = 0;
      for (let m = 0; m < deps.length; m += 1) {
        const dIdx = depIndexById.get(deps[m]);
        if (dIdx !== undefined && shortfallAt[dIdx] > itemStall) itemStall = shortfallAt[dIdx];
      }
      if (itemStall > maxItemStallCalDays) maxItemStallCalDays = itemStall;
    }

    if (
      allocatableDays > 0 &&
      totalCommitted + totalDiverted <= allocatableDays + 1e-9 &&
      maxItemStallCalDays <= 1e-9
    ) {
      coupledFitCount += 1;
    }

    const sharedCommitted = activePeople.length > 0 ? unownedCommitted / activePeople.length : 0;
    const sharedFunded = activePeople.length > 0 ? unownedFunded / activePeople.length : 0;

    const fairTeamCal = teamDailyRate > 0 ? totalFunded / teamDailyRate : 0;
    const netTeamRate = netTeamAllocatable / horizonCalendarDays;
    const coupledTeamCal = (netTeamRate > 1e-9
      ? totalFunded / netTeamRate
      : (teamDailyRate > 0 ? horizonCalendarDays + totalFunded / teamDailyRate : 0)) + maxItemStallCalDays;

    let fairMaxCal = fairTeamCal;
    let coupledMaxCal = coupledTeamCal;

    for (let p = 0; p < activePeople.length; p += 1) {
      const pAlloc = personAllocatable[p];
      const pComm = personCommitted[p] + sharedCommitted;
      const pCoupledComm = pComm + personDiverted[p];
      if (pAlloc > 0) {
        if (pComm > pAlloc + 1e-9) fairOwnerOverCount[p] += 1;
        if (pCoupledComm > pAlloc + 1e-9) coupledOwnerOverCount[p] += 1;
      }
      const pFund = personFunded[p] + sharedFunded;
      const pRate = personDailyRates[p];
      if (pFund > 0 && pRate > 0) {
        const fCal = pFund / pRate;
        if (fCal > fairMaxCal) fairMaxCal = fCal;
        const netPersonAlloc = Math.max(0, pAlloc - personDiverted[p]);
        const netPRate = netPersonAlloc / horizonCalendarDays;
        const cCal = (netPRate > 1e-9 ? pFund / netPRate : horizonCalendarDays + fCal);
        if (cCal > coupledMaxCal) coupledMaxCal = cCal;
      }
    }

    fairBottleneckSamples[k] = fairMaxCal;
    coupledBottleneckSamples[k] = Math.max(fairMaxCal, coupledMaxCal);

    // 5. Target-date hit probabilities (Fair-Weather vs All-Weather)
    if (targetMeta.length > 0) {
      let cumFunded = 0;
      let cumStall = 0;
      for (let t = 0; t < targetMeta.length; t += 1) {
        const meta = targetMeta[t];
        cumFunded += meta.itemIdx >= 0 ? trialDraws[meta.itemIdx] : meta.item.effort.expected;
        if (meta.itemIdx >= 0) {
          for (const depId of itemDepIds[meta.itemIdx]) {
            const dIdx = depIndexById.get(depId);
            if (dIdx !== undefined && shortfallAt[dIdx] > cumStall) cumStall = shortfallAt[dIdx];
          }
        }
        const fairCapByTarget = meta.daysToTarget * teamDailyRate;
        if (cumFunded <= fairCapByTarget + 1e-9) meta.fairHitCount += 1;
        const effDaysToTarget = Math.max(0, meta.daysToTarget - cumStall);
        const coupledCapByTarget = effDaysToTarget * netTeamRate;
        if (cumFunded <= coupledCapByTarget + 1e-9) meta.coupledHitCount += 1;
      }
    }
  }

  const sortedFairCal = Array.from(fairBottleneckSamples).sort((a, b) => a - b);
  const sortedCoupledCal = Array.from(coupledBottleneckSamples).sort((a, b) => a - b);
  const diversionTail = computeTailRisk(diversionPersonDaySamples, 0.9);
  const sortedDiversion = Array.from(diversionPersonDaySamples).sort((a, b) => a - b);

  const fairP50Days = Math.ceil(quantileSorted(sortedFairCal, 0.5) ?? 0);
  const fairP80Days = Math.ceil(quantileSorted(sortedFairCal, 0.8) ?? 0);
  const fairP90Days = Math.ceil(quantileSorted(sortedFairCal, 0.9) ?? 0);
  const coupledP50Days = Math.ceil(quantileSorted(sortedCoupledCal, 0.5) ?? 0);
  const coupledP80Days = Math.ceil(quantileSorted(sortedCoupledCal, 0.8) ?? 0);
  const coupledP90Days = Math.ceil(quantileSorted(sortedCoupledCal, 0.9) ?? 0);

  const fairFitProb = round3(fairFitCount / resolvedTrials);
  const coupledFitProb = round3(coupledFitCount / resolvedTrials);
  const fitDropPp = round1((fairFitProb - coupledFitProb) * 100);
  const p80SlipDays = Math.max(0, coupledP80Days - fairP80Days);

  const tailLossByCurrency = Object.fromEntries(
    currencies.map((cur) => [cur, computeTailRisk(lossSamplesByCurrency[cur], 0.9)]),
  );

  // Dual-hat steward contention diagnostics
  const ownedFundedByPerson = new Map();
  for (const item of measuredCommitted) {
    if (!item.ownerId) continue;
    ownedFundedByPerson.set(item.ownerId, (ownedFundedByPerson.get(item.ownerId) || 0) + 1);
  }
  const stewardDepsByPerson = new Map();
  for (let d = 0; d < activeDeps.length; d += 1) {
    if (!(depLambdas[d] > 0)) continue;
    for (const pIdx of depStewardIndices[d]) {
      const pid = activePeople[pIdx].personId;
      if (!stewardDepsByPerson.has(pid)) stewardDepsByPerson.set(pid, []);
      stewardDepsByPerson.get(pid).push({
        id: activeDeps[d].id,
        name: activeDeps[d].name,
        criticality: activeDeps[d].criticality,
        busFactor: network.stewardshipById.get(activeDeps[d].id)?.busFactor ?? 0,
      });
    }
  }

  const dualHatStewards = activePeople
    .map((p, idx) => {
      const fairOverProb = round3(fairOwnerOverCount[idx] / resolvedTrials);
      const coupledOverProb = round3(coupledOwnerOverCount[idx] / resolvedTrials);
      const deltaOverProb = round3(coupledOverProb - fairOverProb);
      const ownedCount = ownedFundedByPerson.get(p.personId) || 0;
      const deps = stewardDepsByPerson.get(p.personId) || [];
      return {
        personId: p.personId,
        name: p.name,
        ownedItemCount: ownedCount,
        stewardedShockDeps: deps,
        soleStewardCount: deps.filter((d) => d.busFactor <= 1).length,
        fairOverloadProb: fairOverProb,
        coupledOverloadProb: coupledOverProb,
        overloadJumpProb: deltaOverProb,
        diversionTrialProb: round3(stewardDivertedTrials[idx] / resolvedTrials),
        meanDivertedDays: round2(personDivertedSum[idx] / resolvedTrials),
        contended: Boolean(
          ownedCount > 0 &&
          deps.length > 0 &&
          coupledOverProb >= COUPLING_DUAL_HAT_MIN_OVERLOAD &&
          deltaOverProb >= COUPLING_DUAL_HAT_DELTA,
        ),
      };
    })
    .filter((row) => row.ownedItemCount > 0 && row.stewardedShockDeps.length > 0)
    .sort((a, b) => b.overloadJumpProb - a.overloadJumpProb || b.coupledOverloadProb - a.coupledOverloadProb);

  const minFitGuard = clampInt(workingState?.settings?.couplingMinFitPct, 10, 95, DEFAULT_COUPLING_MIN_FIT_PCT) / 100;
  const tailDropGuardPp = clampInt(workingState?.settings?.couplingTailDropPct, 5, 60, DEFAULT_COUPLING_TAIL_DROP_PCT);
  const fairWeatherMirage = Boolean(
    modeledDeps.length > 0 &&
    fairFitProb >= 0.5 &&
    (coupledFitProb < minFitGuard || fitDropPp >= tailDropGuardPp || p80SlipDays >= COUPLING_SLIP_WARN_DAYS),
  );

  return {
    available: true,
    shocksModeled: modeledDeps.length > 0,
    engineVersion: COUPLING_ENGINE_VERSION,
    seed: resolvedSeed,
    trials: resolvedTrials,
    horizonWeeks: model.horizonWeeks,
    horizonCalendarDays,
    allocatableDays,
    calibrationMode,
    drillSampleCount: drillCal.n,
    drillMinSamples: RESILIENCE_MIN_DRILL_SAMPLES,
    conformalUpperMultiplier: drillCal.band?.sufficient ? drillCal.band.highFactor : null,
    modeledDependencyCount: modeledDeps.length,
    activeDependencyCount: activeDeps.length,
    unmodeledDeps,
    unmodeledCriticalDeps,
    shockTrialProbability: round3(shockTrialCount / resolvedTrials),
    fairWeather: {
      horizonFitProbability: fairFitProb,
      overloadProbability: round3(1 - fairFitProb),
      p50CalendarDays: fairP50Days,
      p80CalendarDays: fairP80Days,
      p90CalendarDays: fairP90Days,
      p50Date: addDays(today, fairP50Days),
      p80Date: addDays(today, fairP80Days),
      p90Date: addDays(today, fairP90Days),
    },
    allWeather: {
      horizonFitProbability: coupledFitProb,
      overloadProbability: round3(1 - coupledFitProb),
      p50CalendarDays: coupledP50Days,
      p80CalendarDays: coupledP80Days,
      p90CalendarDays: coupledP90Days,
      p50Date: addDays(today, coupledP50Days),
      p80Date: addDays(today, coupledP80Days),
      p90Date: addDays(today, coupledP90Days),
    },
    delta: {
      fitDropPp,
      p80SlipDays,
      p90SlipDays: Math.max(0, coupledP90Days - fairP90Days),
      expectedDivertedDays: diversionTail.mean,
      p80DivertedDays: round2(quantileSorted(sortedDiversion, 0.8) ?? 0),
      cvar90DivertedDays: diversionTail.cvar90,
    },
    fairWeatherMirage,
    tailLossByCurrency,
    dualHatStewards,
    targetRisks: targetMeta.map((m) => ({
      id: m.item.id,
      title: m.item.title,
      targetOn: m.item.targetOn,
      fairProbability: round3(m.fairHitCount / resolvedTrials),
      coupledProbability: round3(m.coupledHitCount / resolvedTrials),
      dropPp: round1(((m.fairHitCount - m.coupledHitCount) / resolvedTrials) * 100),
    })),
    dependencyShockRates: activeDeps
      .map((dep, idx) => ({
        id: dep.id,
        name: dep.name,
        criticality: dep.criticality,
        substitutability: dep.substitutability,
        horizonShockProb: round3(depShockTrials[idx] / resolvedTrials),
      }))
      .filter((d) => d.horizonShockProb > 0),
  };
}

/**
 * Rank individual dependency hardening interventions by their paired CRN
 * lift on All-Weather delivery certainty, P80 schedule days, CVaR_90 loss,
 * and expected annual redundancy ROI.
 */
export function rankHardeningInterventions(state = {}, { now = new Date(), seed, trials } = {}) {
  const resolvedTrials = clampInt(
    trials ?? Math.min(Number(state?.settings?.simulationTrials) || 600, 600),
    MIN_SIMULATION_TRIALS,
    MAX_SIMULATION_TRIALS,
    600,
  );
  const base = simulateCoupledPortfolio(state, { now, seed, trials: resolvedTrials });
  if (!base.available || !base.shocksModeled) {
    return { available: base.available, baseline: base, interventions: [] };
  }

  const network = analyzeDependencyNetwork(state, now);
  const activePeople = (state.people || []).filter((p) => p && p.status !== 'archived');
  const interventions = [];

  for (const dep of network.activeDeps || []) {
    const prob = finitePosOrNull(dep.annualFailureProb);
    if (prob === null || dep.substitutability === 'dual-active') continue;

    const targetMode = dep.substitutability === 'warm-standby' ? 'dual-active' : 'warm-standby';
    const st = network.stewardshipById.get(dep.id);
    const qualifiedIds = new Set((st?.qualifiedStewards || []).map((s) => s.personId));
    const candidateBackup = st && st.busFactor <= 1
      ? activePeople.find((p) => !qualifiedIds.has(p.id))
      : null;

    const patchedStewards = candidateBackup
      ? [
          ...(Array.isArray(dep.stewards) ? dep.stewards : []),
          { personId: candidateBackup.id, role: 'backup', verifiedOn: dayKey(now), notes: 'Counterfactual backup' },
        ]
      : dep.stewards;

    const cf = simulateCoupledPortfolio(state, {
      now,
      seed: base.seed,
      trials: resolvedTrials,
      dependencyOverrides: {
        [dep.id]: {
          substitutability: targetMode,
          warmSwitchDays: targetMode === 'warm-standby' ? Math.min(1, finitePosOrNull(dep.ttrDays) ?? 1) : null,
          stewards: patchedStewards,
        },
      },
    });

    const fitGainPp = round1((cf.allWeather.horizonFitProbability - base.allWeather.horizonFitProbability) * 100);
    const p80DaysSaved = Math.max(0, base.allWeather.p80CalendarDays - cf.allWeather.p80CalendarDays);
    const divertedSaved = round2(Math.max(0, base.delta.expectedDivertedDays - cf.delta.expectedDivertedDays));

    const metrics = network.nodeMetrics.get(dep.id);
    const val = network.valuationById.get(dep.id);
    const econ = evaluateRedundancyEconomics(dep, metrics, val);
    const holdUp = evaluateHoldUpRisk(dep, metrics, state);

    const domCur = econ.currency || val?.currency || dep.currency || 'USD';
    const baseCvar = base.tailLossByCurrency[domCur]?.cvar90 ?? null;
    const cfCvar = cf.tailLossByCurrency[domCur]?.cvar90 ?? null;
    const cvarReduction = baseCvar !== null && cfCvar !== null ? round2(Math.max(0, baseCvar - cfCvar)) : null;

    interventions.push({
      dependencyId: dep.id,
      dependencyName: dep.name,
      criticality: dep.criticality,
      currentMode: dep.substitutability,
      targetMode,
      crossTrainAdded: Boolean(candidateBackup),
      fitGainPp,
      p80DaysSaved,
      divertedDaysSaved: divertedSaved,
      currency: domCur,
      cvar90Reduction: cvarReduction,
      mitigationCost: econ.mitigationCost,
      expectedAnnualLoss: econ.expectedAnnualLoss,
      netAnnualBenefit: econ.netAnnualBenefit,
      roiMultiple: econ.roiMultiple,
      dualDividend: Boolean((fitGainPp >= 3 || p80DaysSaved >= 2) && econ.netAnnualBenefit !== null && econ.netAnnualBenefit > 0),
      holdUpScore: holdUp.score,
      holdUpBand: holdUp.level,
      gatekeeperWarning: (holdUp.reasons || []).some((r) => r.includes('gatekeeper') || r.includes('negotiation')),
    });
  }

  interventions.sort(
    (a, b) =>
      b.fitGainPp - a.fitGainPp ||
      b.p80DaysSaved - a.p80DaysSaved ||
      (b.cvar90Reduction || 0) - (a.cvar90Reduction || 0) ||
      (b.netAnnualBenefit || -Infinity) - (a.netAnnualBenefit || -Infinity),
  );

  return {
    available: true,
    baseline: base,
    interventions,
  };
}
