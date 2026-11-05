/**
 * app/core/domain/clearing.js — pure combinatorial solver, Vickrey–Clarke–Groves
 * (VCG) pivot pricing engine, Dantzig–Wolfe shadow-price & resource-mix analyzer,
 * and 5-altitude disclosure-governed read model for the Hierarchical
 * Clearinghouse (`#/clearing`, Schema v100, ADR-0098).
 *
 * Pure module: no storage mutation, no network calls, no DOM.
 */
import { addDays, dayKey } from '../time.js';
import { ALTITUDES, altitudeByKey } from './chainRegistry.js';
import { LEADER_ID } from './chain.js';
import { activeSeat, buildSeats } from './seat.js';
import {
  CLEARING_ALTITUDE_PLAYBOOK,
  CLEARING_DISCLOSURE,
  CLEARING_ENGINE_VERSION,
  CLEARING_FRAMEWORKS,
  CLEARING_LIMITS,
  CLEARING_PREMISE,
} from './clearingRegistry.js';
import { clearingConventions, normalizeClearingRounds } from './clearingSchema.js';

const Z_95 = 1.959963984540054;

function round2(n) {
  return Math.round(n * 100) / 100;
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

/** Exact Wilson (1927) 95% score interval in whole percentage points. */
export function wilsonIntervalPct(k, n) {
  if (!Number.isInteger(n) || n <= 0 || !Number.isInteger(k) || k < 0 || k > n) {
    return { pct: null, lowPct: null, highPct: null };
  }
  const p = k / n;
  const z2 = Z_95 * Z_95;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (Z_95 * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return {
    pct: Math.round(p * 100),
    lowPct: Math.max(0, Math.round((center - half) * 100)),
    highPct: Math.min(100, Math.round((center + half) * 100)),
  };
}

/** Choices available to one bidding span (Tier 0 = unfunded, Tiers 1..K = declared packages). */
function choicesForBid(bid, respectFloors = true) {
  const zero = {
    tierIndex: 0,
    key: null,
    label: 'Unfunded',
    cost: 0,
    capacityDays: 0,
    valueLo: 0,
    valueHi: 0,
    isMinimumViable: false,
  };
  const tiers = (Array.isArray(bid.tiers) ? bid.tiers : []).map((t, idx) => ({
    tierIndex: idx + 1,
    key: t.key,
    label: t.label,
    cost: t.cost,
    capacityDays: t.capacityDays,
    valueLo: t.valueLo,
    valueHi: t.valueHi,
    isMinimumViable: t.isMinimumViable === true,
  }));
  if (!respectFloors) return [zero, ...tiers];
  const minFloor = tiers.find((t) => t.isMinimumViable);
  if (!minFloor) return [zero, ...tiers];
  // A minimum-viable tier constrains a FUNDED span; it does not force every
  // bidder into the market. Keep Tier 0 so the exact economy can still decline
  // a span, then remove only the sub-floor funded packages.
  return [zero, ...tiers.filter((t) => t.tierIndex >= minFloor.tierIndex)];
}

/**
 * Exact Bertsimas–Sim (2004) Γ-robust social welfare of a chosen package vector.
 * Because each span picks at most one package tier, adversarial uncertainty
 * reduces Nominal ∑ valueHi by the sum of the min(Γ, M) largest spreads
 * (valueHi - valueLo) among the chosen tiers — exact in O(M log M).
 */
export function evaluateBundleObjectives(chosenTiers, gamma) {
  let nominal = 0;
  let totalCost = 0;
  let totalCapacityDays = 0;
  const spreads = [];
  for (let i = 0; i < chosenTiers.length; i += 1) {
    const c = chosenTiers[i];
    nominal += c.valueHi;
    totalCost += c.cost;
    totalCapacityDays += c.capacityDays;
    const spread = c.valueHi - c.valueLo;
    if (spread > 0) spreads.push(spread);
  }
  if (gamma <= 0 || spreads.length === 0) {
    return { nominal, robust: nominal, totalCost, totalCapacityDays, bindingStressLoss: 0 };
  }
  spreads.sort((a, b) => b - a);
  const limit = Math.min(gamma, spreads.length);
  let loss = 0;
  for (let i = 0; i < limit; i += 1) loss += spreads[i];
  return {
    nominal,
    robust: nominal - loss,
    totalCost,
    totalCapacityDays,
    bindingStressLoss: loss,
  };
}

/** Enumerate all subsets of {0..m-1} of size k = min(gamma, m) for exact Savage regret. */
function buildStressSubsets(m, gamma) {
  const k = Math.min(Math.max(0, gamma), m);
  if (k === 0 || m === 0) return [new Set()];
  const subsets = [];
  const current = [];
  function walk(start) {
    if (current.length === k) {
      subsets.push(new Set(current));
      return;
    }
    const remainingNeeded = k - current.length;
    for (let i = start; i <= m - remainingNeeded; i += 1) {
      current.push(i);
      walk(i + 1);
      current.pop();
    }
  }
  walk(0);
  return subsets;
}

function scenarioValue(chosenTiers, stressedSet) {
  let sum = 0;
  for (let i = 0; i < chosenTiers.length; i += 1) {
    const c = chosenTiers[i];
    sum += stressedSet.has(i) ? c.valueLo : c.valueHi;
  }
  return sum;
}

/** Deterministic preference comparator across two feasible vectors. */
function isBetterCandidate(cand, best, regime) {
  if (!best) return true;
  const primaryA = regime === 'nominal' ? cand.nominal : regime === 'minimax' ? -cand.maxRegret : cand.robust;
  const primaryB = regime === 'nominal' ? best.nominal : regime === 'minimax' ? -best.maxRegret : best.robust;
  if (primaryA !== primaryB) return primaryA > primaryB;
  if (cand.robust !== best.robust) return cand.robust > best.robust;
  if (cand.nominal !== best.nominal) return cand.nominal > best.nominal;
  if (cand.maxRegret !== best.maxRegret) return cand.maxRegret < best.maxRegret;
  if (cand.totalCost !== best.totalCost) return cand.totalCost < best.totalCost;
  if (cand.totalCapacityDays !== best.totalCapacityDays) return cand.totalCapacityDays < best.totalCapacityDays;
  for (let i = 0; i < cand.indices.length; i += 1) {
    if (cand.indices[i] !== best.indices[i]) return cand.indices[i] > best.indices[i];
  }
  return false;
}

/**
 * Core exact 2D multiple-choice combinatorial solver over a given list of bids.
 * Uses exact grid enumeration when combinations <= maxCombinations, or exact
 * branch-and-bound with suffix upper/lower bounds up to nodeBudget.
 */
function solveEconomy(bids, {
  netBudgetCap,
  netCapacityCap,
  gamma = 0,
  respectFloors = true,
  computeMinimax = true,
  maxCombinations = CLEARING_LIMITS.combinationsMax,
  nodeBudget = CLEARING_LIMITS.nodeBudgetMax,
} = {}) {
  const m = bids.length;
  if (m === 0) {
    return {
      ok: true,
      combinations: 1,
      certificate: { engine: 'enumeration', combinations: 1, nodes: 1, pruned: 0, budget: maxCombinations, certified: true },
      byRegime: {
        robust: { chosenTiers: [], indices: [], nominal: 0, robust: 0, maxRegret: 0, totalCost: 0, totalCapacityDays: 0 },
        nominal: { chosenTiers: [], indices: [], nominal: 0, robust: 0, maxRegret: 0, totalCost: 0, totalCapacityDays: 0 },
        minimax: { chosenTiers: [], indices: [], nominal: 0, robust: 0, maxRegret: 0, totalCost: 0, totalCapacityDays: 0 },
      },
    };
  }

  const choiceLists = bids.map((b) => choicesForBid(b, respectFloors));
  let combinations = 1;
  for (const list of choiceLists) {
    if (list.length === 0) {
      return { ok: false, reason: 'A bidding span has no eligible package tier under the floor rule.' };
    }
    combinations *= list.length;
  }

  // Quick infeasibility pre-check on minimum cost and capacity per span.
  let minPossibleCost = 0;
  let minPossibleCap = 0;
  for (const list of choiceLists) {
    minPossibleCost += Math.min(...list.map((c) => c.cost));
    minPossibleCap += Math.min(...list.map((c) => c.capacityDays));
  }
  if (minPossibleCost > netBudgetCap || minPossibleCap > netCapacityCap) {
    return {
      ok: false,
      reason: `Minimum-viable floor tiers require ${minPossibleCost} budget and ${minPossibleCap} capacity days, exceeding the net clearable envelope (${netBudgetCap} budget, ${netCapacityCap} days). Relax floors or widen the envelope.`,
    };
  }

  const scenarios = computeMinimax ? buildStressSubsets(m, gamma) : [new Set()];

  if (combinations <= maxCombinations) {
    // Pass 1: enumerate all feasible bundles and find exact scenario oracles.
    const feasible = [];
    const oraclePerScenario = new Array(scenarios.length).fill(0);
    const current = new Array(m);

    const walkEnum = (idx, costSoFar, capSoFar) => {
      if (idx === m) {
        const chosen = current.slice();
        const evalObj = evaluateBundleObjectives(chosen, gamma);
        const scenVals = computeMinimax
          ? scenarios.map((set, sIdx) => {
            const v = scenarioValue(chosen, set);
            if (v > oraclePerScenario[sIdx]) oraclePerScenario[sIdx] = v;
            return v;
          })
          : null;
        feasible.push({
          chosenTiers: chosen,
          indices: chosen.map((c) => c.tierIndex),
          nominal: evalObj.nominal,
          robust: evalObj.robust,
          totalCost: evalObj.totalCost,
          totalCapacityDays: evalObj.totalCapacityDays,
          scenVals,
          maxRegret: 0,
        });
        return;
      }
      const list = choiceLists[idx];
      for (let j = 0; j < list.length; j += 1) {
        const c = list[j];
        const nextCost = costSoFar + c.cost;
        const nextCap = capSoFar + c.capacityDays;
        if (nextCost <= netBudgetCap && nextCap <= netCapacityCap) {
          current[idx] = c;
          walkEnum(idx + 1, nextCost, nextCap);
        }
      }
    };

    walkEnum(0, 0, 0);
    if (feasible.length === 0) {
      return {
        ok: false,
        reason: 'No joint combination of floor-compliant tiers fits inside both the budget and capacity caps simultaneously.',
      };
    }

    let bestRobust = null;
    let bestNominal = null;
    let bestMinimax = null;

    for (const cand of feasible) {
      if (computeMinimax && cand.scenVals) {
        let maxR = 0;
        for (let sIdx = 0; sIdx < scenarios.length; sIdx += 1) {
          const r = oraclePerScenario[sIdx] - cand.scenVals[sIdx];
          if (r > maxR) maxR = r;
        }
        cand.maxRegret = maxR;
        cand.scenVals = null;
      }
      if (isBetterCandidate(cand, bestRobust, 'robust')) bestRobust = cand;
      if (isBetterCandidate(cand, bestNominal, 'nominal')) bestNominal = cand;
      if (isBetterCandidate(cand, bestMinimax, 'minimax')) bestMinimax = cand;
    }

    return {
      ok: true,
      combinations,
      certificate: {
        engine: 'enumeration',
        combinations,
        nodes: combinations,
        pruned: 0,
        budget: maxCombinations,
        certified: true,
      },
      byRegime: {
        robust: bestRobust,
        nominal: bestNominal,
        minimax: bestMinimax,
      },
    };
  }

  // Exact Branch-and-Bound when combinations > maxCombinations.
  const suffixMinCost = new Array(m + 1).fill(0);
  const suffixMinCap = new Array(m + 1).fill(0);
  const suffixMaxHi = new Array(m + 1).fill(0);
  const orderedLists = choiceLists.map((list) => [...list].sort((a, b) => b.valueHi - a.valueHi || a.cost - b.cost));
  for (let i = m - 1; i >= 0; i -= 1) {
    suffixMinCost[i] = suffixMinCost[i + 1] + Math.min(...orderedLists[i].map((c) => c.cost));
    suffixMinCap[i] = suffixMinCap[i + 1] + Math.min(...orderedLists[i].map((c) => c.capacityDays));
    suffixMaxHi[i] = suffixMaxHi[i + 1] + Math.max(...orderedLists[i].map((c) => c.valueHi));
  }

  let nodes = 0;
  let pruned = 0;
  let budgetExceeded = false;

  const solveTarget = (targetRegime, scenarioSet = null) => {
    let best = null;
    const current = new Array(m);
    const dfs = (idx, costSoFar, capSoFar, hiSoFar) => {
      if (budgetExceeded) return;
      nodes += 1;
      if (nodes > nodeBudget) {
        budgetExceeded = true;
        return;
      }
      if (costSoFar + suffixMinCost[idx] > netBudgetCap || capSoFar + suffixMinCap[idx] > netCapacityCap) {
        pruned += 1;
        return;
      }
      const optimisticUpper = hiSoFar + suffixMaxHi[idx];
      if (best) {
        const threshold = scenarioSet ? best.scenVal : targetRegime === 'nominal' ? best.nominal : best.robust;
        if (optimisticUpper < threshold) {
          pruned += 1;
          return;
        }
      }
      if (idx === m) {
        const chosen = current.slice();
        const evalObj = evaluateBundleObjectives(chosen, gamma);
        const cand = {
          chosenTiers: chosen,
          indices: chosen.map((c) => c.tierIndex),
          nominal: evalObj.nominal,
          robust: evalObj.robust,
          totalCost: evalObj.totalCost,
          totalCapacityDays: evalObj.totalCapacityDays,
          maxRegret: 0,
          scenVal: scenarioSet ? scenarioValue(chosen, scenarioSet) : 0,
        };
        if (scenarioSet) {
          if (!best || cand.scenVal > best.scenVal) best = cand;
        } else if (isBetterCandidate(cand, best, targetRegime)) {
          best = cand;
        }
        return;
      }
      for (const c of orderedLists[idx]) {
        if (costSoFar + c.cost <= netBudgetCap && capSoFar + c.capacityDays <= netCapacityCap) {
          current[idx] = c;
          dfs(idx + 1, costSoFar + c.cost, capSoFar + c.capacityDays, hiSoFar + c.valueHi);
        } else {
          pruned += 1;
        }
      }
    };
    dfs(0, 0, 0, 0);
    return best;
  };

  const bestRobust = solveTarget('robust');
  const bestNominal = solveTarget('nominal');
  if (budgetExceeded) {
    return {
      ok: false,
      reason: `Combinatorial grid (${combinations} packages) exceeded the exact branch-and-bound node budget (${nodeBudget}). Reduce tiers or raise clearingNodeBudget; LeadOS refuses uncertified heuristic allocations.`,
    };
  }
  if (!bestRobust || !bestNominal) {
    return {
      ok: false,
      reason: 'No joint combination of floor-compliant tiers fits inside both the budget and capacity caps simultaneously.',
    };
  }

  let bestMinimax = bestRobust;
  if (computeMinimax) {
    const oracles = scenarios.map((set) => {
      const res = solveTarget('nominal', set);
      return res ? res.scenVal : 0;
    });
    if (!budgetExceeded) {
      const computeRegret = (cand) => {
        let maxR = 0;
        for (let sIdx = 0; sIdx < scenarios.length; sIdx += 1) {
          const r = oracles[sIdx] - scenarioValue(cand.chosenTiers, scenarios[sIdx]);
          if (r > maxR) maxR = r;
        }
        return maxR;
      };
      bestRobust.maxRegret = computeRegret(bestRobust);
      bestNominal.maxRegret = computeRegret(bestNominal);
      bestMinimax = isBetterCandidate(bestNominal, bestRobust, 'minimax') ? bestNominal : bestRobust;
    }
  }

  return {
    ok: true,
    combinations,
    certificate: {
      engine: 'branch-and-bound',
      combinations,
      nodes,
      pruned,
      budget: nodeBudget,
      certified: true,
    },
    byRegime: {
      robust: bestRobust,
      nominal: bestNominal,
      minimax: bestMinimax,
    },
  };
}

/** Active social objective value of a chosen tier vector under the chosen regime. */
function objectiveForRegime(chosenTiers, gamma, regime) {
  const obj = evaluateBundleObjectives(chosenTiers, gamma);
  return regime === 'nominal' ? obj.nominal : obj.robust;
}

/**
 * Hall, Lovallo & Musters (2012) corporate reallocation benchmarks:
 *   1. Uniform Proportional "Peanut-Butter" Haircut (scales each span's cap in
 *      proportion to its max requested cost & capacity);
 *   2. Naive Equal Split (1/M of net budget & capacity per span).
 */
function computeBenchmarks(bids, { netBudgetCap, netCapacityCap, gamma, respectFloors, regime }) {
  const m = bids.length;
  if (m === 0) return { proportionalHaircutValue: 0, equalSplitValue: 0 };

  const choiceLists = bids.map((b) => choicesForBid(b, respectFloors));
  const maxCosts = choiceLists.map((list) => Math.max(...list.map((c) => c.cost)));
  const maxCaps = choiceLists.map((list) => Math.max(...list.map((c) => c.capacityDays)));
  const totalReqCost = maxCosts.reduce((a, b) => a + b, 0);
  const totalReqCap = maxCaps.reduce((a, b) => a + b, 0);

  const pickUnderQuotas = (quotasB, quotasC) => {
    const picked = [];
    let remB = netBudgetCap;
    let remC = netCapacityCap;
    for (let i = 0; i < m; i += 1) {
      const qB = Math.min(remB, quotasB[i]);
      const qC = Math.min(remC, quotasC[i]);
      const list = choiceLists[i];
      let best = null;
      for (const c of list) {
        if (c.cost <= qB && c.capacityDays <= qC) {
          const val = gamma > 0 && regime !== 'nominal' ? c.valueLo : c.valueHi;
          const bestVal = best ? (gamma > 0 && regime !== 'nominal' ? best.valueLo : best.valueHi) : -1;
          if (!best || val > bestVal || (val === bestVal && c.valueHi > best.valueHi)) best = c;
        }
      }
      if (!best) {
        // If quota cannot even fund a mandatory floor, try cheapest tier that fits remaining envelope, else Tier 0.
        const fallbackList = choicesForBid(bids[i], false).sort((a, b) => a.cost - b.cost || a.capacityDays - b.capacityDays);
        best = fallbackList.find((c) => c.cost <= remB && c.capacityDays <= remC) || fallbackList[0];
      }
      picked.push(best);
      remB -= best.cost;
      remC -= best.capacityDays;
    }
    return objectiveForRegime(picked, gamma, regime);
  };

  const propQuotasB = maxCosts.map((c) => (
    totalReqCost > netBudgetCap && totalReqCost > 0 ? Math.floor((netBudgetCap * c) / totalReqCost) : netBudgetCap
  ));
  const propQuotasC = maxCaps.map((d) => (
    totalReqCap > netCapacityCap && totalReqCap > 0 ? Math.floor((netCapacityCap * d) / totalReqCap) : netCapacityCap
  ));
  const eqB = new Array(m).fill(Math.floor(netBudgetCap / m));
  const eqC = new Array(m).fill(Math.floor(netCapacityCap / m));

  return {
    proportionalHaircutValue: pickUnderQuotas(propQuotasB, propQuotasC),
    equalSplitValue: pickUnderQuotas(eqB, eqC),
  };
}

/**
 * Dantzig–Wolfe / Baumol–Fabian Lagrangian dual upper bound and shadow prices
 * (λ*_budget, λ*_capacity). By weak minimax + Lagrangian duality, for every
 * scenario S (|S| ≤ Γ) and every λ_B ≥ 0, λ_C ≥ 0:
 *   W*(N) ≤ λ_B·B + λ_C·C + ∑_i max_{c ∈ choices_i} (v_i(c, S) - λ_B·cost - λ_C·cap).
 */
function computeLagrangianDual(bids, winnerTiers, {
  netBudgetCap,
  netCapacityCap,
  gamma,
  respectFloors,
  regime,
  activeObjective,
}) {
  const m = bids.length;
  if (m === 0) {
    return { dualBudgetPrice: 0, dualCapacityPrice: 0, lagrangianBound: 0, decentralizationGap: 0 };
  }
  const choiceLists = bids.map((b) => choicesForBid(b, respectFloors));

  // Identify the binding adversarial scenario S* on winnerTiers (top Γ spreads).
  const stressedSet = new Set();
  if (gamma > 0 && regime !== 'nominal') {
    const ranked = winnerTiers
      .map((c, idx) => ({ idx, spread: c.valueHi - c.valueLo }))
      .filter((x) => x.spread > 0)
      .sort((a, b) => b.spread - a.spread);
    for (let i = 0; i < Math.min(gamma, ranked.length); i += 1) stressedSet.add(ranked[i].idx);
  }

  const evalDual = (lamB, lamC) => {
    let bound = lamB * netBudgetCap + lamC * netCapacityCap;
    let subgradB = netBudgetCap;
    let subgradC = netCapacityCap;
    for (let i = 0; i < m; i += 1) {
      const list = choiceLists[i];
      let bestSub = -Infinity;
      let chosen = list[0];
      for (const c of list) {
        const v = stressedSet.has(i) ? c.valueLo : c.valueHi;
        const reduced = v - lamB * c.cost - lamC * c.capacityDays;
        if (reduced > bestSub) {
          bestSub = reduced;
          chosen = c;
        }
      }
      bound += bestSub;
      subgradB -= chosen.cost;
      subgradC -= chosen.capacityDays;
    }
    return { bound, subgradB, subgradC };
  };

  let lamB = 0;
  let lamC = 0;
  let bestBound = Infinity;
  let bestLamB = 0;
  let bestLamC = 0;

  // Initial scale-aware step size.
  const maxVal = Math.max(1, ...choiceLists.flatMap((list) => list.map((c) => c.valueHi)));
  const scaleB = netBudgetCap > 0 ? maxVal / netBudgetCap : 0;
  const scaleC = netCapacityCap > 0 ? maxVal / netCapacityCap : 0;

  for (let iter = 0; iter < 90; iter += 1) {
    const { bound, subgradB, subgradC } = evalDual(lamB, lamC);
    if (bound < bestBound) {
      bestBound = bound;
      bestLamB = lamB;
      bestLamC = lamC;
    }
    const norm2 = subgradB * subgradB + subgradC * subgradC;
    if (norm2 < 1e-9) break;
    const target = activeObjective;
    const polyak = Math.max(0, (bound - target) / norm2);
    const decay = 1.2 / (1 + iter * 0.12);
    const step = polyak > 0 ? decay * polyak : (0.05 / (iter + 1)) * Math.max(scaleB, scaleC);
    lamB = netBudgetCap > 0 ? Math.max(0, lamB - step * subgradB) : 0;
    lamC = netCapacityCap > 0 ? Math.max(0, lamC - step * subgradC) : 0;
  }

  // Certified upper bound is never below activeObjective (clamped against fp rounding).
  const certifiedBound = Math.max(activeObjective, round2(bestBound));
  return {
    dualBudgetPrice: round4(bestLamB),
    dualCapacityPrice: round4(bestLamC),
    lagrangianBound: certifiedBound,
    decentralizationGap: round2(Math.max(0, certifiedBound - activeObjective)),
  };
}

/** Herfindahl–Hirschman Index (0..10000) across allocated envelope shares. */
function computeAllocationHhi(allocations, committedBudget, committedCapacityDays) {
  const n = allocations.length;
  if (n === 0 || (committedBudget === 0 && committedCapacityDays === 0)) return 0;
  let sumSq = 0;
  for (const a of allocations) {
    const shareB = committedBudget > 0 ? a.allocatedCost / committedBudget : null;
    const shareC = committedCapacityDays > 0 ? a.allocatedCapacityDays / committedCapacityDays : null;
    const share = shareB !== null && shareC !== null
      ? (shareB + shareC) / 2
      : (shareB ?? shareC ?? 0);
    sumSq += (share * 100) * (share * 100);
  }
  return Math.min(10000, Math.round(sumSq));
}

/**
 * Goldratt (1984) Theory-of-Constraints resource-mix bottleneck classification.
 */
function classifyResourceMix({
  netBudgetCap,
  netCapacityCap,
  committedBudget,
  committedCapacityDays,
  rationedPositiveSpans,
  dualBudgetPrice,
  dualCapacityPrice,
  nextBudgetStepGain,
  nextCapacityDayGain,
  highPct,
  lowPct,
}) {
  if (rationedPositiveSpans === 0) return 'slack';
  const bPct = netBudgetCap > 0 ? Math.round((committedBudget / netBudgetCap) * 100) : 100;
  const cPct = netCapacityCap > 0 ? Math.round((committedCapacityDays / netCapacityCap) * 100) : 100;
  const budgetBinding = bPct >= highPct && (dualBudgetPrice > 0 || nextBudgetStepGain > 0 || bPct >= 95);
  const capBinding = cPct >= highPct && (dualCapacityPrice > 0 || nextCapacityDayGain > 0 || cPct >= 95);
  if ((budgetBinding && netCapacityCap > 0 && cPct <= lowPct) || (capBinding && netBudgetCap > 0 && bPct <= lowPct)) {
    return 'mix-imbalance';
  }
  if (bPct >= cPct + 15) return 'budget-bottleneck';
  if (cPct >= bPct + 15) return 'capacity-bottleneck';
  return 'balanced';
}

/**
 * Solve a clearing round end-to-end:
 *   - Nominal, Bertsimas–Sim Γ-Robust, and Savage Minimax-Regret optima
 *   - N + 1 exact VCG marginal economies for Clarke externalities τ_i & ΔW_i
 *   - Hall–Lovallo–Musters Peanut-Butter & Equal-Split benchmarks
 *   - Rawlsian Price of Floor Protection
 *   - Dantzig–Wolfe Lagrangian dual shadow prices & Decentralization Gap
 *   - Discrete marginal unit gains & Goldratt Resource-Mix Bottleneck posture
 */
export function solveClearingRound(round, options = {}) {
  if (!round || typeof round !== 'object') {
    return { ok: false, reason: 'No clearing round supplied.' };
  }
  const bids = Array.isArray(round.bids) ? round.bids : [];
  const conventions = clearingConventions(options.settings || {});
  const maxCombinations = options.maxCombinations ?? conventions.clearingMaxCombinations;
  const nodeBudget = options.nodeBudget ?? conventions.clearingNodeBudget;
  const netBudgetCap = Math.max(0, (round.budgetCap || 0) - (round.reserveBudget || 0));
  const netCapacityCap = Math.max(0, (round.capacityCap || 0) - (round.reserveCapacity || 0));
  const gamma = Math.max(0, Number(round.gamma) || 0);
  const respectFloors = round.respectFloors !== false;
  const defaultRegime = gamma > 0 ? 'robust' : 'nominal';
  const regime = ['robust', 'nominal', 'minimax'].includes(options.regime)
    ? options.regime
    : (round.adoptedRegime || defaultRegime);

  const full = solveEconomy(bids, {
    netBudgetCap,
    netCapacityCap,
    gamma,
    respectFloors,
    computeMinimax: true,
    maxCombinations,
    nodeBudget,
  });
  if (!full.ok) return full;

  const winner = full.byRegime[regime] || full.byRegime.robust;
  const activeObjective = objectiveForRegime(winner.chosenTiers, gamma, regime);

  // Price of Floor Protection: solve without mandatory floors and compare.
  let priceOfFloors = 0;
  const anyFloor = bids.some((b) => Array.isArray(b.tiers) && b.tiers.some((t) => t.isMinimumViable));
  if (respectFloors && anyFloor) {
    const unfloored = solveEconomy(bids, {
      netBudgetCap,
      netCapacityCap,
      gamma,
      respectFloors: false,
      computeMinimax: false,
      maxCombinations,
      nodeBudget,
    });
    if (unfloored.ok) {
      const unfWinner = unfloored.byRegime[regime === 'minimax' ? 'robust' : regime];
      const unfObj = objectiveForRegime(unfWinner.chosenTiers, gamma, regime);
      priceOfFloors = Math.max(0, unfObj - activeObjective);
    }
  }

  // Exact N + 1 VCG Marginal Economies: remove each span i in turn and re-solve.
  const allocations = [];
  for (let i = 0; i < bids.length; i += 1) {
    const bid = bids[i];
    const chosen = winner.chosenTiers[i];
    const othersTiers = winner.chosenTiers.filter((_, idx) => idx !== i);
    const othersWelfareWithSpan = objectiveForRegime(othersTiers, gamma, regime);
    const effectiveValue = Math.max(0, activeObjective - othersWelfareWithSpan);

    const reducedBids = bids.filter((_, idx) => idx !== i);
    const marginal = solveEconomy(reducedBids, {
      netBudgetCap,
      netCapacityCap,
      gamma,
      respectFloors,
      computeMinimax: regime === 'minimax',
      maxCombinations,
      nodeBudget,
    });
    const welfareWithoutSpan = marginal.ok
      ? objectiveForRegime(marginal.byRegime[regime].chosenTiers, gamma, regime)
      : othersWelfareWithSpan;

    // Exact Clarke pivot externality τ_i = W*(N \ {i}) - W_{-i}(x*) ≥ 0.
    const clarkeExternality = chosen.tierIndex === 0
      ? 0
      : Math.max(0, welfareWithoutSpan - othersWelfareWithSpan);
    const marginalContribution = Math.max(0, activeObjective - welfareWithoutSpan);

    allocations.push({
      bidderSeatId: bid.bidderSeatId,
      chosenTierIndex: chosen.tierIndex,
      tierKey: chosen.tierIndex > 0 ? chosen.key : null,
      tierLabel: chosen.tierIndex > 0 ? chosen.label : '',
      allocatedCost: chosen.cost,
      allocatedCapacityDays: chosen.capacityDays,
      valueLo: chosen.valueLo,
      valueHi: chosen.valueHi,
      effectiveValue,
      welfareWithoutSpan,
      othersWelfareWithSpan,
      clarkeExternality,
      marginalContribution,
      pivotal: clarkeExternality > 0,
    });
  }

  // Peanut-Butter & Equal-Split Benchmarks.
  const benchmarks = computeBenchmarks(bids, {
    netBudgetCap,
    netCapacityCap,
    gamma,
    respectFloors,
    regime,
  });
  const reallocationAlpha = activeObjective - benchmarks.proportionalHaircutValue;

  // Dantzig–Wolfe / Lagrangian Dual Shadow Prices & Decentralization Gap.
  const dual = computeLagrangianDual(bids, winner.chosenTiers, {
    netBudgetCap,
    netCapacityCap,
    gamma,
    respectFloors,
    regime,
    activeObjective,
  });

  // Discrete marginal unit sensitivity (+budgetStep, +1 capacity day).
  const positiveCosts = bids
    .flatMap((b) => (b.tiers || []).map((t) => t.cost))
    .filter((c) => c > 0);
  const budgetStep = positiveCosts.length > 0
    ? Math.max(1, Math.min(...positiveCosts))
    : Math.max(1, Math.round(netBudgetCap * 0.1) || 1);

  let nextBudgetStepGain = 0;
  if (netBudgetCap > 0 || positiveCosts.length > 0) {
    const plusB = solveEconomy(bids, {
      netBudgetCap: netBudgetCap + budgetStep,
      netCapacityCap,
      gamma,
      respectFloors,
      computeMinimax: false,
      maxCombinations,
      nodeBudget,
    });
    if (plusB.ok) {
      const targetReg = regime === 'minimax' ? 'robust' : regime;
      nextBudgetStepGain = Math.max(
        0,
        objectiveForRegime(plusB.byRegime[targetReg].chosenTiers, gamma, regime) - activeObjective,
      );
    }
  }

  let nextCapacityDayGain = 0;
  const plusC = solveEconomy(bids, {
    netBudgetCap,
    netCapacityCap: netCapacityCap + 1,
    gamma,
    respectFloors,
    computeMinimax: false,
    maxCombinations,
    nodeBudget,
  });
  if (plusC.ok) {
    const targetReg = regime === 'minimax' ? 'robust' : regime;
    nextCapacityDayGain = Math.max(
      0,
      objectiveForRegime(plusC.byRegime[targetReg].chosenTiers, gamma, regime) - activeObjective,
    );
  }

  // Count spans with rationed positive-value tranches.
  let rationedPositiveSpans = 0;
  for (let i = 0; i < bids.length; i += 1) {
    const maxBidHi = Math.max(0, ...(bids[i].tiers || []).map((t) => t.valueHi));
    if (maxBidHi > allocations[i].valueHi) rationedPositiveSpans += 1;
  }

  const committedBudget = winner.totalCost;
  const committedCapacityDays = winner.totalCapacityDays;
  const hhi = computeAllocationHhi(allocations, committedBudget, committedCapacityDays);
  const mixPosture = classifyResourceMix({
    netBudgetCap,
    netCapacityCap,
    committedBudget,
    committedCapacityDays,
    rationedPositiveSpans,
    dualBudgetPrice: dual.dualBudgetPrice,
    dualCapacityPrice: dual.dualCapacityPrice,
    nextBudgetStepGain,
    nextCapacityDayGain,
    highPct: conventions.clearingMixImbalanceHighPct,
    lowPct: conventions.clearingMixImbalanceLowPct,
  });

  return {
    ok: true,
    regime,
    netBudgetCap,
    netCapacityCap,
    committedBudget,
    committedCapacityDays,
    activeObjective,
    nominalObjective: full.byRegime.nominal.nominal,
    robustWorstCase: full.byRegime.robust.robust,
    minimaxRegret: full.byRegime.minimax.maxRegret,
    regimes: {
      robust: {
        objective: full.byRegime.robust.robust,
        nominal: full.byRegime.robust.nominal,
        maxRegret: full.byRegime.robust.maxRegret,
        committedBudget: full.byRegime.robust.totalCost,
        committedCapacityDays: full.byRegime.robust.totalCapacityDays,
        indices: full.byRegime.robust.indices,
      },
      nominal: {
        objective: full.byRegime.nominal.nominal,
        robust: full.byRegime.nominal.robust,
        maxRegret: full.byRegime.nominal.maxRegret,
        committedBudget: full.byRegime.nominal.totalCost,
        committedCapacityDays: full.byRegime.nominal.totalCapacityDays,
        indices: full.byRegime.nominal.indices,
      },
      minimax: {
        objective: objectiveForRegime(full.byRegime.minimax.chosenTiers, gamma, 'robust'),
        nominal: full.byRegime.minimax.nominal,
        maxRegret: full.byRegime.minimax.maxRegret,
        committedBudget: full.byRegime.minimax.totalCost,
        committedCapacityDays: full.byRegime.minimax.totalCapacityDays,
        indices: full.byRegime.minimax.indices,
      },
    },
    proportionalHaircutValue: benchmarks.proportionalHaircutValue,
    equalSplitValue: benchmarks.equalSplitValue,
    reallocationAlpha,
    priceOfFloors,
    dualBudgetPrice: dual.dualBudgetPrice,
    dualCapacityPrice: dual.dualCapacityPrice,
    lagrangianBound: dual.lagrangianBound,
    decentralizationGap: dual.decentralizationGap,
    nextBudgetStepGain,
    nextCapacityDayGain,
    budgetStep,
    mixPosture,
    rationedPositiveSpans,
    hhi,
    allocations,
    certificate: full.certificate,
  };
}

/**
 * Cross-check declared settlement value against linked workspace delivery records
 * (`goal`, `case`, `strategy`, `delegation`) and generated delivery delegations.
 */
export function evaluateBidEvidenceStatus(state, round, bid, realizedValue) {
  if (!state || !bid) return 'unlinked';
  const checks = [];
  if (bid.linkedEntityType && bid.linkedEntityId) {
    if (bid.linkedEntityType === 'goal') {
      const g = (state.goals || []).find((x) => x && x.id === bid.linkedEntityId);
      if (g) checks.push(g.status === 'done' || (Number(g.progress) || 0) >= 80);
    } else if (bid.linkedEntityType === 'case') {
      const c = (state.cases || []).find((x) => x && x.id === bid.linkedEntityId);
      if (c) checks.push(c.status === 'resolved' || c.status === 'closed');
    } else if (bid.linkedEntityType === 'strategy') {
      const s = (state.strategyBets || []).find((x) => x && x.id === bid.linkedEntityId);
      if (s) checks.push(s.status !== 'stopped' && s.status !== 'dropped');
    } else if (bid.linkedEntityType === 'delegation') {
      const d = (state.delegations || []).find((x) => x && x.id === bid.linkedEntityId);
      if (d) checks.push(d.status === 'done' || d.status === 'completed');
    }
  }
  // Also inspect RULE-CLR-01 generated delivery delegations for this bidder on this round.
  if (round && Array.isArray(state.links) && Array.isArray(state.delegations)) {
    const delIds = state.links
      .filter((l) => l && l.sourceType === 'clearinground' && l.sourceId === round.id && l.targetType === 'delegation' && l.relation === 'consumes-capacity')
      .map((l) => l.targetId);
    for (const delId of delIds) {
      const del = state.delegations.find((d) => d && d.id === delId && (d.personId === bid.bidderSeatId || d.assigneeId === bid.bidderSeatId));
      if (del) checks.push(del.status === 'done' || del.status === 'completed');
    }
  }
  if (checks.length === 0) return 'unlinked';
  const anyComplete = checks.some(Boolean);
  if (realizedValue > 0 && !anyComplete) return 'contradicted';
  return anyComplete ? 'corroborated' : 'uncorroborated';
}

/** Eligible subordinate leadership spans that may bid into a round chaired by `chairSeat`. */
export function eligibleBidderSeats(built, chairSeatId) {
  const chair = chairSeatId === LEADER_ID
    ? built.byId.get(LEADER_ID) || built.operatorSeat
    : built.byId.get(chairSeatId);
  if (!chair) return [];
  const directChildren = (chair.childSeatIds || [])
    .map((id) => built.byId.get(id))
    .filter(Boolean);
  if (directChildren.length > 0) return directChildren;
  // Fallback when a chair leads spans indexed in descendantSeatIds.
  return (chair.descendantSeatIds || [])
    .map((id) => built.byId.get(id))
    .filter(Boolean);
}

/**
 * Determine how `seat` relates to `round`:
 *   - 'chair-or-above' : operator, the round's chair, or an ancestor of the chair
 *   - 'invited-bidder' : direct subordinate / bidder inside the round chaired directly above
 *   - 'none'           : outside scope (sideways or unrelated subtree)
 */
export function roundAccessRole(round, seat, built) {
  if (!round || !seat) return 'none';
  if (seat.fullAccess) return 'chair-or-above';
  if (seat.readOnly) return 'none';
  if (round.scopeSeatId === seat.id) return 'chair-or-above';
  if (round.scopeSeatId !== LEADER_ID && seat.scope.has(round.scopeSeatId)) return 'chair-or-above';
  // Check if this seat is an eligible bidder in a round chaired by its direct leadership parent,
  // or already submitted a bid for itself.
  const eligibleIds = new Set(eligibleBidderSeats(built, round.scopeSeatId).map((s) => s.id));
  const ownBidExists = (round.bids || []).some((b) => b.bidderSeatId === seat.id);
  if (eligibleIds.has(seat.id) || ownBidExists) return 'invited-bidder';
  return 'none';
}

function seatDisplayLabel(built, seatId, seat, allowNames) {
  if (seatId === LEADER_ID) return 'Enterprise chair';
  const node = built.byId.get(seatId);
  if (!node) return `Span (${seatId})`;
  if (allowNames) return `${node.name} (${node.label})`;
  return `${node.label} span`;
}

/** Project one round through the active seat's disclosure and anti-anchoring lens. */
function projectRoundForSeat(state, round, seat, built, conventions, today) {
  const role = roundAccessRole(round, seat, built);
  if (role === 'none') return null;

  // Item titles and person names are shown ONLY to the chair itself (or undeclared operator),
  // or to an invited bidder for its OWN bid — upward ancestors above the chair see unit/altitude
  // structure unless at chair rank, preserving upward title discipline.
  const isDirectChairOrOperator = seat.fullAccess || round.scopeSeatId === seat.id;
  const isAncestorAboveChair = !isDirectChairOrOperator && role === 'chair-or-above';

  const netBudgetCap = Math.max(0, round.budgetCap - round.reserveBudget);
  const netCapacityCap = Math.max(0, round.capacityCap - round.reserveCapacity);
  const overdueDays = round.status === 'cleared' && today > addDays(round.horizonOn, conventions.clearingReviewDays)
    ? Math.max(1, Math.round((new Date(`${today}T00:00:00Z`) - new Date(`${round.horizonOn}T00:00:00Z`)) / 86_400_000))
    : 0;

  if (role === 'invited-bidder') {
    // Sealed horizontal boundary: an invited subordinate seat NEVER sees sibling bids,
    // sibling names, or sibling allocations — neither while open nor after clearing!
    const ownBid = (round.bids || []).find((b) => b.bidderSeatId === seat.id) || null;
    const ownAlloc = round.frozen
      ? (round.frozen.allocations || []).find((a) => a.bidderSeatId === seat.id) || null
      : null;
    const ownOutcome = round.settlement
      ? (round.settlement.outcomes || []).find((o) => o.bidderSeatId === seat.id) || null
      : null;
    return {
      id: round.id,
      accessRole: 'invited-bidder',
      title: round.title,
      outcomeLabel: round.outcomeLabel,
      currency: round.currency,
      openedOn: round.openedOn,
      horizonOn: round.horizonOn,
      scopeSeatId: round.scopeSeatId,
      chairLabel: seatDisplayLabel(built, round.scopeSeatId, seat, false),
      altitudeKey: round.altitudeKey,
      rank: round.rank,
      status: round.status,
      budgetCap: round.budgetCap,
      capacityCap: round.capacityCap,
      reserveBudget: round.reserveBudget,
      reserveCapacity: round.reserveCapacity,
      netBudgetCap,
      netCapacityCap,
      gamma: round.gamma,
      respectFloors: round.respectFloors,
      expectedHurdleHoldPct: round.expectedHurdleHoldPct,
      bidsCount: (round.bids || []).length,
      bidsSealed: true,
      sealReason: 'Sibling span bids and allocations are sealed horizontally to prevent anchoring and peer reverse-engineering.',
      bids: ownBid ? [{
        ...ownBid,
        bidderLabel: seatDisplayLabel(built, ownBid.bidderSeatId, seat, true),
      }] : [],
      ownBid,
      ownAllocation: ownAlloc,
      ownOutcome,
      livePreview: null,
      frozen: null,
      settlement: ownOutcome ? {
        settledOn: round.settlement.settledOn,
        outcomes: [ownOutcome],
      } : null,
      overdueSettlement: overdueDays > 0,
      overdueDays,
      eligibleBidders: [{ seatId: seat.id, label: seatDisplayLabel(built, seat.id, seat, true) }],
    };
  }

  // Chair, ancestor above chair, or operator view.
  const allowBidderNames = isDirectChairOrOperator;
  const eligible = eligibleBidderSeats(built, round.scopeSeatId).map((s) => ({
    seatId: s.id,
    label: seatDisplayLabel(built, s.id, seat, allowBidderNames),
    altitudeKey: s.altitudeKey,
    rank: s.rank,
  }));

  let livePreview = null;
  if (round.status === 'open' && round.bids.length > 0) {
    const solved = solveClearingRound(round, { settings: conventions });
    livePreview = solved.ok ? solved : { ok: false, reason: solved.reason };
  }

  const labelMap = new Map();
  let spanCounter = 1;
  for (const b of round.bids) {
    labelMap.set(
      b.bidderSeatId,
      allowBidderNames
        ? seatDisplayLabel(built, b.bidderSeatId, seat, true)
        : `Sub-span #${spanCounter++} (${built.byId.get(b.bidderSeatId)?.label || 'unit'})`,
    );
  }

  return {
    id: round.id,
    accessRole: isDirectChairOrOperator ? 'chair' : 'ancestor',
    title: isDirectChairOrOperator ? round.title : `${altitudeByKey(round.altitudeKey)?.label || round.altitudeKey} clearing round · ${round.openedOn}`,
    outcomeLabel: round.outcomeLabel,
    currency: round.currency,
    openedOn: round.openedOn,
    horizonOn: round.horizonOn,
    scopeSeatId: round.scopeSeatId,
    chairLabel: seatDisplayLabel(built, round.scopeSeatId, seat, isDirectChairOrOperator),
    altitudeKey: round.altitudeKey,
    rank: round.rank,
    status: round.status,
    budgetCap: round.budgetCap,
    capacityCap: round.capacityCap,
    reserveBudget: round.reserveBudget,
    reserveCapacity: round.reserveCapacity,
    netBudgetCap,
    netCapacityCap,
    gamma: round.gamma,
    respectFloors: round.respectFloors,
    expectedHurdleHoldPct: round.expectedHurdleHoldPct,
    linkedBudgetId: round.linkedBudgetId,
    strategyBetId: round.strategyBetId,
    bidsCount: round.bids.length,
    bidsSealed: false,
    sealReason: isAncestorAboveChair
      ? 'Upward altitude view: structural clearing, shadow prices and hurdle posture are shown without individual note text or subordinate person names.'
      : '',
    bids: round.bids.map((b) => ({
      bidderSeatId: b.bidderSeatId,
      bidderLabel: labelMap.get(b.bidderSeatId),
      submittedOn: b.submittedOn,
      linkedEntityType: b.linkedEntityType,
      linkedEntityId: b.linkedEntityId,
      note: isDirectChairOrOperator ? b.note : '',
      tiers: b.tiers.map((t) => ({
        ...t,
        label: isDirectChairOrOperator ? t.label : `Tier ${t.key}`,
      })),
    })),
    ownBid: null,
    ownAllocation: null,
    ownOutcome: null,
    livePreview: livePreview && livePreview.ok ? {
      ...livePreview,
      allocations: livePreview.allocations.map((a) => ({
        ...a,
        bidderLabel: labelMap.get(a.bidderSeatId) || a.bidderSeatId,
        tierLabel: isDirectChairOrOperator ? a.tierLabel : (a.tierKey ? `Tier ${a.tierKey}` : ''),
      })),
    } : livePreview,
    clearedOn: round.clearedOn,
    adoptedRegime: round.adoptedRegime,
    overrideNote: isDirectChairOrOperator ? round.overrideNote : '',
    frozen: round.frozen ? {
      ...round.frozen,
      allocations: round.frozen.allocations.map((a) => ({
        ...a,
        bidderLabel: labelMap.get(a.bidderSeatId) || a.bidderSeatId,
        tierLabel: isDirectChairOrOperator ? a.tierLabel : (a.tierKey ? `Tier ${a.tierKey}` : ''),
      })),
    } : null,
    settlement: round.settlement ? {
      ...round.settlement,
      note: isDirectChairOrOperator ? round.settlement.note : '',
      outcomes: round.settlement.outcomes.map((o) => ({
        ...o,
        bidderLabel: labelMap.get(o.bidderSeatId) || o.bidderSeatId,
      })),
    } : null,
    overdueSettlement: overdueDays > 0,
    overdueDays,
    eligibleBidders: eligible,
  };
}

/**
 * Compute strictly-prior Brier calibration across settled rounds that pre-registered
 * `expectedHurdleHoldPct` and had ≥ 1 pivotal winner.
 */
function computeBrierCalibration(settledRounds, cellFloor, allowPooledRates) {
  const graded = settledRounds
    .filter((r) => r.expectedHurdleHoldPct !== null && r.settlement && r.settlement.pivotalCount > 0)
    .slice()
    .sort((a, b) => (
      String(a.settlement.settledOn).localeCompare(String(b.settlement.settledOn)) ||
      String(a.id).localeCompare(String(b.id))
    ));
  const n = graded.length;
  if (!allowPooledRates) {
    return {
      n,
      meanBrier: null,
      meanReferenceBrier: null,
      skillPct: null,
      refused: true,
      reason: 'WITHHELD below director rank (pooled calibration scores are director+ governance telemetry).',
    };
  }
  if (n < cellFloor) {
    return {
      n,
      meanBrier: null,
      meanReferenceBrier: null,
      skillPct: null,
      refused: true,
      reason: `WITHHELD: ${n} graded expectation(s) below cell floor of ${cellFloor}.`,
    };
  }
  let sumBrier = 0;
  let sumRef = 0;
  let priorHits = 0;
  for (let i = 0; i < n; i += 1) {
    const r = graded[i];
    const p = r.expectedHurdleHoldPct / 100;
    const y = r.settlement.allPivotalCleared ? 1 : 0;
    const brier = (p - y) * (p - y);
    // Strictly-prior Laplace-smoothed sequential base rate: never peeks ahead!
    const refP = (priorHits + 0.5) / (i + 1);
    const refBrier = (refP - y) * (refP - y);
    sumBrier += brier;
    sumRef += refBrier;
    priorHits += y;
  }
  const meanBrier = round4(sumBrier / n);
  const meanReferenceBrier = round4(sumRef / n);
  const skillPct = meanReferenceBrier > 0
    ? Math.round(((meanReferenceBrier - meanBrier) / meanReferenceBrier) * 100)
    : 0;
  return {
    n,
    meanBrier,
    meanReferenceBrier,
    skillPct,
    refused: false,
    reason: '',
  };
}

/**
 * Build the cross-altitude vertical roll-up with small-cell floor + complementary
 * suppression so a single suppressed altitude row can never be recovered by
 * subtracting printed rows from the workspace total.
 */
function buildAltitudeRollup(inScopeRounds, conventions, allowPooledRates, today) {
  const floor = conventions.clearingCellFloor;
  const rawRows = ALTITUDES.map((alt) => {
    const rows = inScopeRounds.filter((r) => r.altitudeKey === alt.key);
    const clearedOrSettled = rows.filter((r) => r.status === 'cleared' || r.status === 'settled');
    const settled = rows.filter((r) => r.status === 'settled' && r.settlement);
    const overdue = rows.filter((r) => r.status === 'cleared' && today > addDays(r.horizonOn, conventions.clearingReviewDays));
    const mixImbalanced = clearedOrSettled.filter((r) => r.frozen && r.frozen.mixPosture === 'mix-imbalance');
    const committedCapacityDays = clearedOrSettled.reduce((acc, r) => acc + (r.frozen?.committedCapacityDays || 0), 0);
    const fundedSpansN = clearedOrSettled.reduce(
      (acc, r) => acc + (r.frozen?.allocations || []).filter((a) => a.chosenTierIndex > 0).length,
      0,
    );
    const pivotalN = settled.reduce((acc, r) => acc + (r.settlement?.pivotalCount || 0), 0);
    const pivotalClearedN = settled.reduce((acc, r) => acc + (r.settlement?.pivotalClearedCount || 0), 0);
    const alphaByOutcome = {};
    for (const r of clearedOrSettled) {
      if (r.frozen) {
        alphaByOutcome[r.currency] = (alphaByOutcome[r.currency] || 0) + r.frozen.reallocationAlpha;
      }
    }
    return {
      altitudeKey: alt.key,
      label: alt.label,
      rank: alt.rank,
      roundsN: rows.length,
      clearedN: clearedOrSettled.length,
      settledN: settled.length,
      fundedSpansN,
      committedCapacityDays,
      overdueN: overdue.length,
      mixImbalancedN: mixImbalanced.length,
      pivotalN,
      pivotalClearedN,
      alphaByCurrency: alphaByOutcome,
      primarySuppressed: rows.length > 0 && rows.length < floor,
      complementarySuppressed: false,
    };
  });

  // Complementary suppression: if exactly 1 altitude row is primary-suppressed,
  // also suppress the smallest non-empty non-suppressed sibling row so subtraction
  // from workspace totals cannot recover the small cell!
  const primaryCount = rawRows.filter((r) => r.primarySuppressed).length;
  if (primaryCount === 1) {
    const partner = rawRows
      .filter((r) => !r.primarySuppressed && r.roundsN > 0)
      .sort((a, b) => a.roundsN - b.roundsN || a.rank - b.rank)[0];
    if (partner) partner.complementarySuppressed = true;
  }

  return rawRows.map((row) => {
    const suppressed = row.primarySuppressed || row.complementarySuppressed;
    let holdStats = { pct: null, lowPct: null, highPct: null };
    let rateRefused = true;
    let rateReason = '';
    if (suppressed) {
      rateReason = row.primarySuppressed
        ? `WITHHELD: cell has < ${floor} rounds.`
        : 'WITHHELD: complementary suppression partner.';
    } else if (!allowPooledRates) {
      rateReason = 'WITHHELD below director rank.';
    } else if (row.pivotalN < floor) {
      rateReason = row.pivotalN === 0
        ? 'No settled pivotal tranches yet.'
        : `WITHHELD: ${row.pivotalN} pivotal tranche(s) below floor of ${floor}.`;
    } else {
      holdStats = wilsonIntervalPct(row.pivotalClearedN, row.pivotalN);
      rateRefused = false;
    }

    return {
      altitudeKey: row.altitudeKey,
      label: row.label,
      rank: row.rank,
      suppressed,
      suppressionKind: row.primarySuppressed ? 'small-cell' : row.complementarySuppressed ? 'complementary' : null,
      roundsN: suppressed ? null : row.roundsN,
      clearedN: suppressed ? null : row.clearedN,
      settledN: suppressed ? null : row.settledN,
      fundedSpansN: suppressed ? null : row.fundedSpansN,
      committedCapacityDays: suppressed ? null : row.committedCapacityDays,
      overdueN: suppressed ? null : row.overdueN,
      mixImbalancedN: suppressed ? null : row.mixImbalancedN,
      pivotalN: suppressed ? null : row.pivotalN,
      pivotalClearedN: suppressed ? null : row.pivotalClearedN,
      hurdleHoldPct: holdStats.pct,
      intervalLowPct: holdStats.lowPct,
      intervalHighPct: holdStats.highPct,
      alphaByCurrency: suppressed ? {} : row.alphaByCurrency,
      refused: suppressed || rateRefused,
      reason: rateReason,
    };
  });
}

/** Primary scoped report for `#/clearing`, briefs, CSV #94, and navigation badges. */
export function buildClearingReport(state, { now = new Date(), settings = null, roundId = null } = {}) {
  const effectiveSettings = settings || state?.settings || {};
  const conventions = clearingConventions(effectiveSettings);
  const today = dayKey(now);
  const built = buildSeats(state, { now, settings: effectiveSettings });
  const seat = activeSeat(built);

  if (seat.readOnly) {
    return {
      ok: false,
      error: `The declared seat "${seat.unresolvedSeatId}" no longer exists in this roster. Declare a valid seat on the Altitude Lens before accessing the Clearinghouse.`,
      seat: { id: seat.id, label: seat.label, altitudeKey: seat.altitudeKey, rank: seat.rank, readOnly: true },
    };
  }

  const allRounds = normalizeClearingRounds(state?.clearingRounds || []);
  // Rounds chaired inside the seat's own subtree (used for upward roll-up totals).
  const subtreeRounds = allRounds.filter((r) => (
    seat.fullAccess || r.scopeSeatId === seat.id || (r.scopeSeatId !== LEADER_ID && seat.scope.has(r.scopeSeatId))
  ));
  // All rounds visible to this seat (subtree rounds + parent rounds where this seat is an invited bidder).
  const projectedRounds = allRounds
    .map((r) => projectRoundForSeat(state, r, seat, built, conventions, today))
    .filter(Boolean);

  const selected = (roundId && projectedRounds.find((r) => r.id === roundId))
    || projectedRounds[0]
    || null;

  const allowPooledRates = seat.fullAccess || seat.rank >= 3;
  const byAltitude = buildAltitudeRollup(subtreeRounds, conventions, allowPooledRates, today);

  const clearedSubtree = subtreeRounds.filter((r) => r.status === 'cleared' || r.status === 'settled');
  const settledSubtree = subtreeRounds.filter((r) => r.status === 'settled' && r.settlement);
  const overdueSubtree = subtreeRounds.filter(
    (r) => r.status === 'cleared' && today > addDays(r.horizonOn, conventions.clearingReviewDays),
  );
  const totalPivotal = settledSubtree.reduce((acc, r) => acc + (r.settlement?.pivotalCount || 0), 0);
  const totalPivotalCleared = settledSubtree.reduce((acc, r) => acc + (r.settlement?.pivotalClearedCount || 0), 0);
  const totalHurdleDeficits = settledSubtree.reduce(
    (acc, r) => acc + (r.settlement?.outcomes || []).filter((o) => o.pivotal && !o.hurdleCleared).length,
    0,
  );
  const mixBottlenecks = clearedSubtree.filter((r) => r.frozen && r.frozen.mixPosture === 'mix-imbalance').length;

  // Currency-segregated Reallocation Alpha & Encumbered Budget (NEVER summed across currencies!).
  const economicsByCurrency = {};
  for (const r of clearedSubtree) {
    if (!r.frozen) continue;
    if (!economicsByCurrency[r.currency]) {
      economicsByCurrency[r.currency] = {
        currency: r.currency,
        roundsN: 0,
        committedBudget: 0,
        reallocationAlpha: 0,
      };
    }
    economicsByCurrency[r.currency].roundsN += 1;
    economicsByCurrency[r.currency].committedBudget += r.frozen.committedBudget;
    economicsByCurrency[r.currency].reallocationAlpha += r.frozen.reallocationAlpha;
  }

  let workspaceHold = {
    n: totalPivotal,
    k: totalPivotalCleared,
    pct: null,
    lowPct: null,
    highPct: null,
    refused: true,
    reason: '',
  };
  if (!allowPooledRates) {
    workspaceHold.reason = 'WITHHELD below director rank.';
  } else if (totalPivotal < conventions.clearingCellFloor) {
    workspaceHold.reason = totalPivotal === 0
      ? 'No settled pivotal tranches in scope yet.'
      : `WITHHELD: ${totalPivotal} settled pivotal tranche(s) below cell floor of ${conventions.clearingCellFloor}.`;
  } else {
    const w = wilsonIntervalPct(totalPivotalCleared, totalPivotal);
    workspaceHold = {
      n: totalPivotal,
      k: totalPivotalCleared,
      pct: w.pct,
      lowPct: w.lowPct,
      highPct: w.highPct,
      refused: false,
      reason: '',
    };
  }

  const brierCalibration = computeBrierCalibration(settledSubtree, conventions.clearingCellFloor, allowPooledRates);
  const playbookKey = seat.altitudeKey && CLEARING_ALTITUDE_PLAYBOOK[seat.altitudeKey]
    ? seat.altitudeKey : 'chief';

  const chairSeatId = seat.fullAccess ? LEADER_ID : seat.id;
  const canChair = seat.fullAccess || (seat.rank >= 2 && eligibleBidderSeats(built, chairSeatId).length > 0);
  const chairEligibleBidders = canChair
    ? eligibleBidderSeats(built, chairSeatId).map((s) => ({
      seatId: s.id,
      label: seatDisplayLabel(built, s.id, seat, true),
      altitudeKey: s.altitudeKey,
      rank: s.rank,
    }))
    : [];

  return {
    ok: true,
    engineVersion: CLEARING_ENGINE_VERSION,
    today,
    premise: CLEARING_PREMISE,
    disclosure: CLEARING_DISCLOSURE,
    frameworks: CLEARING_FRAMEWORKS,
    conventions,
    seat: {
      id: seat.id,
      label: seat.label,
      altitudeKey: playbookKey,
      rank: seat.rank,
      fullAccess: Boolean(seat.fullAccess),
      canChair,
      canGovernConventions: Boolean(seat.fullAccess || seat.rank >= 3),
      chairEligibleBidders,
    },
    playbook: CLEARING_ALTITUDE_PLAYBOOK[playbookKey],
    summary: {
      visibleRoundsN: projectedRounds.length,
      subtreeRoundsN: subtreeRounds.length,
      openN: subtreeRounds.filter((r) => r.status === 'open').length,
      clearedN: clearedSubtree.length,
      settledN: settledSubtree.length,
      invitedOpenN: projectedRounds.filter((r) => r.accessRole === 'invited-bidder' && r.status === 'open').length,
      committedCapacityDays: clearedSubtree.reduce((acc, r) => acc + (r.frozen?.committedCapacityDays || 0), 0),
      fundedSpansN: clearedSubtree.reduce(
        (acc, r) => acc + (r.frozen?.allocations || []).filter((a) => a.chosenTierIndex > 0).length,
        0,
      ),
      overdueSettlementN: overdueSubtree.length,
      hurdleDeficitsN: totalHurdleDeficits,
      mixBottlenecksN: mixBottlenecks,
      economicsByCurrency: Object.values(economicsByCurrency).sort((a, b) => a.currency.localeCompare(b.currency)),
    },
    hurdleCoverage: workspaceHold,
    brierCalibration,
    byAltitude,
    rounds: projectedRounds,
    selected,
  };
}

/** Attention badge count for navigation and Mission Control. */
export function clearingAttentionCount(state, { now = new Date(), settings = null } = {}) {
  const report = buildClearingReport(state, { now, settings });
  if (!report.ok) return 0;
  const openAwaitingMyBid = report.rounds.filter(
    (r) => r.accessRole === 'invited-bidder' && r.status === 'open' && !r.ownBid,
  ).length;
  return (
    report.summary.overdueSettlementN +
    report.summary.hurdleDeficitsN +
    report.summary.mixBottlenecksN +
    openAwaitingMyBid
  );
}

/** Identity-free Markdown brief safe to carry upward across altitudes. */
export function clearingBriefText(report) {
  if (!report || !report.ok) {
    return typeof report?.error === 'string' ? report.error : 'No clearinghouse reading is available.';
  }
  const s = report.summary;
  const hc = report.hurdleCoverage;
  const bc = report.brierCalibration;
  const holdLine = hc.refused
    ? `Clarke Hurdle Coverage: WITHHELD (${hc.reason})`
    : `Clarke Hurdle Coverage: ${hc.k} of ${hc.n} pivotal tranches cleared τ_i (${hc.pct}%, Wilson 95% ${hc.lowPct}–${hc.highPct}%).`;
  const brierLine = bc.refused
    ? `Hurdle Calibration (Brier): WITHHELD (${bc.reason})`
    : `Hurdle Calibration (Brier): n=${bc.n}, mean Brier ${bc.meanBrier}, prior-reference ${bc.meanReferenceBrier}, skill ${bc.skillPct}%.`;
  const econLines = s.economicsByCurrency.length > 0
    ? s.economicsByCurrency.map(
      (e) => `  - ${e.currency} (${e.roundsN} round(s)): committed ${e.committedBudget} ${e.currency}, Reallocation Alpha vs peanut-butter haircut ${e.reallocationAlpha >= 0 ? '+' : ''}${e.reallocationAlpha} outcome units.`,
    )
    : ['  - No cleared currency envelopes in scope yet.'];

  const altLines = report.byAltitude.map((row) => {
    if (row.suppressed) {
      return `  - ${row.label} (rank ${row.rank}): SUPPRESSED (${row.reason})`;
    }
    const rate = row.refused
      ? `rate WITHHELD (${row.reason})`
      : `hurdle hold ${row.hurdleHoldPct}% (${row.intervalLowPct}–${row.intervalHighPct}%)`;
    return `  - ${row.label} (rank ${row.rank}): ${row.roundsN} round(s), ${row.clearedN} cleared, ${row.settledN} settled, ${row.committedCapacityDays} shared days, ${rate}`;
  });

  return [
    `# Internal Clearinghouse Certificate — ${report.today} — ${report.seat.label}`,
    '',
    `Premise: ${report.premise}`,
    `Conventions: cell floor ${report.conventions.clearingCellFloor}, review window ${report.conventions.clearingReviewDays}d, mix imbalance ${report.conventions.clearingMixImbalanceHighPct}%/${report.conventions.clearingMixImbalanceLowPct}%.`,
    '',
    `## Posture Summary`,
    `- Subtree rounds: ${s.subtreeRoundsN} (${s.openN} open, ${s.clearedN} cleared/settled, ${s.settledN} settled once)`,
    `- Funded span tranches: ${s.fundedSpansN} (${s.committedCapacityDays} shared person-days committed)`,
    `- Attention signals: ${s.overdueSettlementN} overdue settlement(s), ${s.hurdleDeficitsN} pivotal hurdle deficit(s), ${s.mixBottlenecksN} resource-mix bottleneck(s)`,
    `- ${holdLine}`,
    `- ${brierLine}`,
    '',
    `## Currency-Segregated Envelope Summary (never pooled across currencies)`,
    ...econLines,
    '',
    `## Altitude Roll-Up`,
    ...altLines,
    '',
    `Disclosure: No person name, span name, round title, or raw sealed bid is printed in this certificate.`,
  ].join('\n');
}

/**
 * Aggregate-only rows for CSV scope #94 (`internal-clearinghouse`).
 * Refused and suppressed cells are ALWAYS blank (''), never zero.
 */
export function clearingCsvRows(report) {
  if (!report || !report.ok) return [];
  const rows = report.byAltitude.map((r) => ({
    row_kind: 'altitude',
    altitude: r.altitudeKey,
    rank: r.rank,
    rounds_n: r.suppressed ? '' : r.roundsN,
    cleared_n: r.suppressed ? '' : r.clearedN,
    settled_n: r.suppressed ? '' : r.settledN,
    funded_spans_n: r.suppressed ? '' : r.fundedSpansN,
    committed_capacity_days: r.suppressed ? '' : r.committedCapacityDays,
    overdue_n: r.suppressed ? '' : r.overdueN,
    mix_imbalanced_n: r.suppressed ? '' : r.mixImbalancedN,
    pivotal_n: r.suppressed ? '' : r.pivotalN,
    pivotal_cleared_n: r.suppressed ? '' : r.pivotalClearedN,
    hurdle_hold_pct: r.refused || r.hurdleHoldPct === null ? '' : r.hurdleHoldPct,
    interval_low_pct: r.refused || r.intervalLowPct === null ? '' : r.intervalLowPct,
    interval_high_pct: r.refused || r.intervalHighPct === null ? '' : r.intervalHighPct,
    mean_brier: '',
    brier_skill_pct: '',
    refused: r.refused ? 'yes' : 'no',
    reason: r.reason || '',
  }));

  const s = report.summary;
  const hc = report.hurdleCoverage;
  const bc = report.brierCalibration;
  const scopeSuppressed = s.subtreeRoundsN > 0 && s.subtreeRoundsN < report.conventions.clearingCellFloor;
  rows.push({
    row_kind: 'workspace',
    altitude: report.seat.altitudeKey || 'chief',
    rank: report.seat.rank,
    rounds_n: scopeSuppressed ? '' : s.subtreeRoundsN,
    cleared_n: scopeSuppressed ? '' : s.clearedN,
    settled_n: scopeSuppressed ? '' : s.settledN,
    funded_spans_n: scopeSuppressed ? '' : s.fundedSpansN,
    committed_capacity_days: scopeSuppressed ? '' : s.committedCapacityDays,
    overdue_n: scopeSuppressed ? '' : s.overdueSettlementN,
    mix_imbalanced_n: scopeSuppressed ? '' : s.mixBottlenecksN,
    pivotal_n: scopeSuppressed ? '' : hc.n,
    pivotal_cleared_n: scopeSuppressed ? '' : hc.k,
    hurdle_hold_pct: hc.refused || hc.pct === null ? '' : hc.pct,
    interval_low_pct: hc.refused || hc.lowPct === null ? '' : hc.lowPct,
    interval_high_pct: hc.refused || hc.highPct === null ? '' : hc.highPct,
    mean_brier: bc.refused || bc.meanBrier === null ? '' : bc.meanBrier,
    brier_skill_pct: bc.refused || bc.skillPct === null ? '' : bc.skillPct,
    refused: scopeSuppressed || hc.refused ? 'yes' : 'no',
    reason: scopeSuppressed
      ? `WITHHELD: scope has < ${report.conventions.clearingCellFloor} rounds.`
      : (hc.reason || ''),
  });

  return rows;
}
