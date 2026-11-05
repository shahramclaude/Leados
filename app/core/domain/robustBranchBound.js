/**
 * app/core/domain/robustBranchBound.js — certified exact branch-and-bound for
 * the Robust Allocation Terminal (ADR-0097, Schema v99).
 *
 * ADR-0095 refused a plan whose feasible integer grid exceeded the declared
 * enumeration bound: honest, but it made large-but-ordinary problems
 * impossible. This module removes the wall WITHOUT changing what a solution
 * means: a depth-first branch-and-bound with exact rational relaxation bounds
 * proves the same Wald maximin, Savage minimax-regret, per-scenario oracles,
 * price of fairness, stress switches and regret release as the enumerator, and
 * prints a certificate (engine, nodes explored, nodes pruned, node budget).
 *
 * Exactness rules, in the code rather than in prose:
 *  - All comparisons in the fractional-relaxation bounds use integer
 *    cross-multiplication (a/b > c/d  ⇔  a·d > c·b). No floating point ever
 *    decides a prune, a bound or a tie.
 *  - A fractional bound is CEILED to the next integer, so the bound is never
 *    below the true fractional optimum — rounding can only weaken pruning,
 *    never invalidate optimality.
 *  - Pruning is STRICT (maximisation: UB < incumbent → prune; minimisation:
 *    LB > incumbent → prune). A node whose bound merely TIES the incumbent is
 *    explored, because the declaration order tie-breaks (lower cost, lower
 *    hours, lexicographically smaller unit vector) could still be won inside.
 *    The printed plan is therefore the same unique total-order optimum the
 *    enumerator prints.
 *  - The node budget is SHARED across every sub-solve (oracles, maximin,
 *    minimax, fairness price, stress, regret release). When it is exhausted the
 *    whole solve is REFUSED with a printed reason — never silently approximated.
 *  - Structural bounds (actions ≤ 6, unit sum ≤ 64, scenarios ≤ 24) are checked
 *    BEFORE the first branch; outside the certified regime the solver refuses.
 *
 * The subject of every figure is a PLAN, a SEGMENT or an ACTION LINE. No person
 * is rated, ranked or named.
 */

class BudgetExhausted extends Error {
  constructor() { super('node-budget-exhausted'); this.name = 'BudgetExhausted'; }
}

const EPS_CEIL = (num, den) => {
  // Exact integer ceiling of num/den for non-negative integers.
  if (den === 0) return num > 0 ? Number.MAX_SAFE_INTEGER : 0;
  return Math.floor(num / den) + (num % den === 0 ? 0 : 1);
};

/** Density comparator: v_i/w_i vs v_j/w_j by cross-multiplication; ties by index. */
function densityCompare(V, W, i, j) {
  const wi = W[i] > 0 ? W[i] : 0;
  const wj = W[j] > 0 ? W[j] : 0;
  if (wi === 0 && wj === 0) return i < j ? -1 : 1;
  if (wi === 0) return V[i] > 0 ? -1 : 1; // zero weight: fits free, rank first
  if (wj === 0) return V[j] > 0 ? 1 : -1;
  const left = V[i] * wj;
  const right = V[j] * wi;
  if (left !== right) return left > right ? -1 : 1;
  return i < j ? -1 : 1;
}

/**
 * Fractional bounded-knapsack upper bound on Σ V_i·u_i over the actions in
 * `ids`, each with at most units[i] units left and per-unit weight W[i],
 * against capacity C. Exact integer result (ceiled), ≥ the fractional optimum,
 * hence ≥ any integer (and therefore any produced) value.
 */
function knapsackBound(V, W, units, ids, C) {
  if (C <= 0) return 0;
  const order = ids.slice().sort((a, b) => densityCompare(V, W, a, b));
  let bound = 0;
  let capacity = C;
  for (const i of order) {
    const w = W[i];
    const m = units[i];
    if (m <= 0 || V[i] <= 0) continue;
    if (w <= 0) { bound += V[i] * m; continue; } // free in this dimension
    const full = Math.min(m, Math.floor(capacity / w));
    bound += full * V[i];
    capacity -= full * w;
    if (full < m && capacity > 0) {
      bound += EPS_CEIL(V[i] * capacity, w);
      capacity = 0;
      break;
    }
    if (capacity <= 0) break;
  }
  return bound;
}

function lexLess(a, b) {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}

/** Prefer higher value, then lower cost, lower hours, lex-smaller x (mirrors the enumerator). */
function better(candidate, best, minimize) {
  if (!best) return true;
  if (candidate.value !== best.value) return minimize ? candidate.value < best.value : candidate.value > best.value;
  if (candidate.cost !== best.cost) return candidate.cost < best.cost;
  if (candidate.hours !== best.hours) return candidate.hours < best.hours;
  return lexLess(candidate.x, best.x);
}

function topGammaSum(d, gamma) {
  if (gamma <= 0) return 0;
  if (gamma >= d.length) return d.reduce((sum, v) => sum + v, 0);
  return d.slice().sort((a, b) => b - a).slice(0, gamma).reduce((sum, v) => sum + v, 0);
}

/** The static instance shared by every sub-solve. */
function frame(plan) {
  const actions = plan.actions;
  const n = actions.length;
  const segIndex = new Map(plan.segments.map((s, i) => [s.key, i]));
  const segOf = actions.map((a) => segIndex.get(a.segmentKey));
  const hi = actions.map((a) => a.effectHi);
  const dev = actions.map((a) => a.effectHi - a.effectLo);
  const cost = actions.map((a) => a.unitCost);
  const hours = actions.map((a) => a.unitHours);
  const coverage = actions.map((a) => a.unitCoverage);
  const unitsMax = actions.map((a) => a.maxUnits);
  const segSize = plan.segments.map((s) => s.size);
  const segFloor = plan.segments.map((s) => s.floorCoverage);
  // Greatest coverage each segment can still receive from actions i.. (floors pruning).
  const maxFutureCoverage = plan.segments.map(() => new Array(n + 1).fill(0));
  for (let s = 0; s < plan.segments.length; s += 1) {
    for (let i = n - 1; i >= 0; i -= 1) {
      maxFutureCoverage[s][i] = maxFutureCoverage[s][i + 1]
        + (segOf[i] === s ? unitsMax[i] * coverage[i] : 0);
    }
  }
  const bySegment = plan.segments.map((_, s) => actions.map((a, i) => i).filter((i) => segOf[i] === s));
  return {
    n, actions, segOf, hi, dev, cost, hours, coverage, unitsMax,
    segSize, segFloor, maxFutureCoverage, bySegment,
    budgetCap: plan.budgetCap, hoursCap: plan.hoursCap, gamma: plan.gamma,
  };
}

/**
 * Upper bound on Σ V_i·x_i over completions of a node at depth `depth`:
 * min of the single-constraint fractional relaxations (budget, hours) and the
 * per-segment saturation relaxation summed over segments. Each term relaxes the
 * others, so each is a valid upper bound on the remaining value; the min is too.
 */
function remainingBound(F, V, depth, budgetLeft, hoursLeft, segLeft, unitsLeft) {
  const ids = [];
  for (let i = depth; i < F.n; i += 1) ids.push(i);
  if (!ids.length) return 0;
  const budgetBound = knapsackBound(V, F.cost, unitsLeft, ids, budgetLeft);
  const hoursBound = knapsackBound(V, F.hours, unitsLeft, ids, hoursLeft);
  let segmentBound = 0;
  for (let s = 0; s < F.bySegment.length; s += 1) {
    const fresh = unitsLeft.map((u, i) => (depth <= i ? u : 0));
    segmentBound += knapsackBound(V, F.coverage, fresh, F.bySegment[s], segLeft[s]);
  }
  return Math.min(budgetBound, hoursBound, segmentBound);
}

/**
 * Core DFS. `objective` decides node value semantics:
 *  - linear(V):      maximise Σ V_i·x_i                       (oracles, optimistic)
 *  - robust:         maximise nominal(x) − topΓ(dev·x)        (Wald maximin)
 *  - regret(oraclesV, scenarioSets, oracleVal): minimise max_s (oracle_s − v_s(x))
 */
function search(F, spec) {
  const {
    kind, V = null, scenarioV = null, oracleVal = null,
    minimize = false, ignoreFloors = false, budget,
  } = spec;
  const x = new Array(F.n).fill(0);
  const unitsLeft = F.unitsMax.slice();
  const covUsed = new Array(F.bySegment.length).fill(0);
  const devAssigned = new Array(F.n).fill(0); // dev contribution of fixed prefix
  const scenAssigned = scenarioV ? scenarioV.map(() => 0) : null;
  let best = null;
  let explored = 0;
  let pruned = 0;

  const stats = () => ({ explored, pruned });

  const leafValue = (costSoFar, hoursSoFar) => {
    if (kind === 'linear') {
      let value = 0;
      for (let i = 0; i < F.n; i += 1) value += V[i] * x[i];
      return value;
    }
    if (kind === 'robust') {
      let nominal = 0;
      const d = new Array(F.n);
      for (let i = 0; i < F.n; i += 1) { nominal += F.hi[i] * x[i]; d[i] = F.dev[i] * x[i]; }
      return nominal - topGammaSum(d, F.gamma);
    }
    // regret: max over scenarios of (oracle − scenario value)
    let maxRegret = 0;
    for (let s = 0; s < scenarioV.length; s += 1) {
      let v = 0;
      for (let i = 0; i < F.n; i += 1) v += scenarioV[s][i] * x[i];
      const regret = oracleVal[s] - v;
      if (regret > maxRegret) maxRegret = regret;
    }
    return maxRegret;
  };

  const floorsPossible = (depth) => {
    if (ignoreFloors) return true;
    for (let s = 0; s < F.bySegment.length; s += 1) {
      if (F.segFloor[s] > 0 && covUsed[s] + F.maxFutureCoverage[s][depth] < F.segFloor[s]) return false;
    }
    return true;
  };

  const dfs = (depth, costSoFar, hoursSoFar, prefixLinear, prefixNominal) => {
    if (budget.left <= 0) throw new BudgetExhausted();
    budget.left -= 1;
    explored += 1;
    if (!floorsPossible(depth)) { pruned += 1; return; }
    // Bound the node.
    if (best) {
      if (kind === 'linear') {
        const ub = prefixLinear + remainingBound(F, V, depth, F.budgetCap - costSoFar, F.hoursCap - hoursSoFar, F.segSize.map((sz, s) => sz - covUsed[s]), unitsLeft);
        if (ub < best.value) { pruned += 1; return; }
      } else if (kind === 'robust') {
        const segLeft = F.segSize.map((sz, s) => sz - covUsed[s]);
        const ub = prefixNominal
          + remainingBound(F, F.hi, depth, F.budgetCap - costSoFar, F.hoursCap - hoursSoFar, segLeft, unitsLeft)
          - topGammaSum(devAssigned, F.gamma); // penalty can only grow: subtract the prefix part
        if (ub < best.value) { pruned += 1; return; }
      } else {
        // regret: LB = max_s (oracle_s − UB_s(node)); prune only when strictly worse
        const segLeft = F.segSize.map((sz, s) => sz - covUsed[s]);
        let lb = 0;
        for (let s = 0; s < scenarioV.length; s += 1) {
          const ubS = scenAssigned[s] + remainingBound(F, scenarioV[s], depth, F.budgetCap - costSoFar, F.hoursCap - hoursSoFar, segLeft, unitsLeft);
          const regretLb = oracleVal[s] - ubS;
          if (regretLb > lb) lb = regretLb;
        }
        if (lb > best.value) { pruned += 1; return; }
      }
    }
    if (depth === F.n) {
      if (!ignoreFloors) {
        for (let s = 0; s < F.bySegment.length; s += 1) if (covUsed[s] < F.segFloor[s]) return;
      }
      const value = leafValue(costSoFar, hoursSoFar);
      const candidate = { value, x: x.slice(), cost: costSoFar, hours: hoursSoFar };
      if (better(candidate, best, minimize)) best = candidate;
      return;
    }
    const a = F.actions[depth];
    const s = F.segOf[depth];
    const v = V ? V[depth] : 0;
    // Descending units: strong incumbents early; the final winner is the
    // unique total-order optimum regardless of visit order.
    for (let u = a.maxUnits; u >= 0; u -= 1) {
      const nc = costSoFar + a.unitCost * u;
      const nh = hoursSoFar + a.unitHours * u;
      if (nc > F.budgetCap || nh > F.hoursCap) continue;
      const ncv = covUsed[s] + a.unitCoverage * u;
      if (ncv > F.segSize[s]) continue;
      x[depth] = u;
      unitsLeft[depth] = a.maxUnits - u;
      covUsed[s] = ncv;
      devAssigned[depth] = F.dev[depth] * u;
      if (scenAssigned) {
        for (let si = 0; si < scenarioV.length; si += 1) scenAssigned[si] += scenarioV[si][depth] * u;
      }
      dfs(depth + 1, nc, nh, prefixLinear + v * u, prefixNominal + F.hi[depth] * u);
      if (scenAssigned) {
        for (let si = 0; si < scenarioV.length; si += 1) scenAssigned[si] -= scenarioV[si][depth] * u;
      }
      devAssigned[depth] = 0;
      covUsed[s] -= a.unitCoverage * u;
      unitsLeft[depth] = a.maxUnits;
      x[depth] = 0;
    }
  };

  dfs(0, 0, 0, 0, 0);
  return { best, ...stats() };
}

function combinations(indices, k) {
  const out = [];
  const combo = [];
  const recurse = (start) => {
    if (combo.length === k) { out.push(combo.slice()); return; }
    for (let i = start; i < indices.length; i += 1) {
      combo.push(indices[i]);
      recurse(i + 1);
      combo.pop();
    }
  };
  recurse(0);
  return out;
}

function sameUnits(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

function scenarioValues(F, scenarioSet) {
  return F.hi.map((h, i) => (scenarioSet.includes(i) ? h - F.dev[i] : h));
}

/**
 * Certified exact solve of one plan by branch-and-bound. Returns the same
 * field shape as the enumeration path plus a `certificate`, or { ok:false }
 * with a printed reason (structural bound or node budget exhausted).
 */
export function bnbSolveRobustPlan(plan, { maxNodes, scenariosMax, unitsSumMax }) {
  const actions = plan.actions;
  const n = actions.length;
  const gamma = plan.gamma;
  const unitsSum = actions.reduce((sum, a) => sum + a.maxUnits, 0);
  if (unitsSum > unitsSumMax) {
    return { ok: false, reason: `The declared unit sum (${unitsSum}) exceeds the certified branch-and-bound bound of ${unitsSumMax}. Reduce maxUnits; an approximate answer is refused.` };
  }
  const scenarioSets = combinations(actions.map((_, i) => i), gamma);
  if (scenarioSets.length > scenariosMax) {
    return { ok: false, reason: `Γ=${gamma} over ${n} actions produces ${scenarioSets.length} scenario problems, above the ${scenariosMax}-scenario bound. Lower Γ or the number of actions.` };
  }
  const F = frame(plan);
  const budget = { left: maxNodes };
  const nodes = { explored: 0, pruned: 0 };
  const run = (spec) => {
    const result = search(F, { ...spec, budget });
    nodes.explored += result.explored;
    nodes.pruned += result.pruned;
    return result;
  };

  try {
    // Per-scenario oracle values (exact linear maxima over the feasible set).
    const scenarioV = scenarioSets.map((set) => scenarioValues(F, set));
    const oracleVal = scenarioV.map((V) => {
      const result = run({ kind: 'linear', V });
      if (!result.best) return null;
      return result.best.value;
    });
    // Optimistic (nominal) plan.
    const optimistic = run({ kind: 'linear', V: F.hi }).best;
    // Wald maximin.
    const maximin = run({ kind: 'robust' }).best;
    if (!maximin) {
      return { ok: false, reason: 'No feasible allocation satisfies the budget, hours, saturation and equity-floor constraints together. Relax a floor or raise a cap; an infeasible plan is refused, not relaxed.' };
    }
    // Savage minimax regret against the exact oracles, warmed by the maximin plan.
    let minimax = null;
    {
      let maxRegret = 0;
      for (let s = 0; s < scenarioV.length; s += 1) {
        let v = 0;
        for (let i = 0; i < n; i += 1) v += scenarioV[s][i] * maximin.x[i];
        const regret = oracleVal[s] - v;
        if (regret > maxRegret) maxRegret = regret;
      }
      minimax = { value: maxRegret, x: maximin.x.slice(), cost: maximin.cost, hours: maximin.hours };
      const result = run({ kind: 'regret', scenarioV, oracleVal, minimize: true });
      if (result.best && better(result.best, minimax, true)) minimax = result.best;
    }
    // Price of fairness: maximin without the equity floors.
    let priceOfFairness = 0;
    const hasFloor = plan.segments.some((s) => s.floorCoverage > 0);
    if (hasFloor) {
      const unconstrained = run({ kind: 'robust', ignoreFloors: true }).best;
      if (unconstrained) priceOfFairness = Math.max(0, unconstrained.value - maximin.value);
    }
    // One-at-a-time stress switches.
    const stressSwitches = [];
    for (let j = 0; j < n; j += 1) {
      if (F.dev[j] === 0) continue;
      const stressedDev = F.dev.slice();
      stressedDev[j] = F.hi[j];
      const Fs = { ...F, dev: stressedDev };
      const result = search(Fs, { kind: 'robust', budget });
      nodes.explored += result.explored;
      nodes.pruned += result.pruned;
      if (result.best && !sameUnits(result.best.x, maximin.x)) stressSwitches.push(actions[j].key);
    }
    // Value of information: exact regret released by resolving the top range.
    const exposure = actions.map((a, j) => F.dev[j] * maximin.x[j]);
    let topIdx = -1;
    let topValue = -1;
    for (let j = 0; j < n; j += 1) {
      if (exposure[j] > topValue) { topValue = exposure[j]; topIdx = j; }
    }
    let regretRelease = 0;
    if (topIdx >= 0 && F.dev[topIdx] > 0) {
      const resolvedDev = F.dev.slice();
      resolvedDev[topIdx] = 0;
      const Fr = { ...F, dev: resolvedDev };
      const resolvedScenarioV = scenarioSets.map((set) => Fr.hi.map((h, i) => (set.includes(i) ? h - Fr.dev[i] : h)));
      const resolvedOracle = [];
      for (const V of resolvedScenarioV) {
        const r = search(Fr, { kind: 'linear', V, budget });
        nodes.explored += r.explored;
        nodes.pruned += r.pruned;
        resolvedOracle.push(r.best ? r.best.value : null);
      }
      const resolved = search(Fr, {
        kind: 'regret', scenarioV: resolvedScenarioV, oracleVal: resolvedOracle, minimize: true, budget,
      });
      nodes.explored += resolved.explored;
      nodes.pruned += resolved.pruned;
      if (resolved.best) regretRelease = Math.max(0, minimax.value - resolved.best.value);
    }

    const robustUnits = maximin.x;
    const committedHours = actions.reduce((sum, a, i) => sum + a.unitHours * robustUnits[i], 0);
    const committedBudget = actions.reduce((sum, a, i) => sum + a.unitCost * robustUnits[i], 0);
    const robustNominal = F.hi.reduce((sum, h, i) => sum + h * robustUnits[i], 0);
    const optimisticWorstCase = (() => {
      if (!optimistic) return null;
      const d = optimistic.x.map((u, i) => F.dev[i] * u);
      const nominal = F.hi.reduce((sum, h, i) => sum + h * optimistic.x[i], 0);
      return nominal - topGammaSum(d, gamma);
    })();

    return {
      ok: true,
      reason: '',
      gamma,
      feasibleN: null, // the feasible set is certified, never enumerated
      scenariosN: scenarioSets.length,
      robustUnits,
      robustWorstCase: maximin.value,
      robustOptimistic: robustNominal,
      robustMaxRegret: (() => {
        let worst = 0;
        for (let s = 0; s < scenarioV.length; s += 1) {
          let v = 0;
          for (let i = 0; i < n; i += 1) v += scenarioV[s][i] * robustUnits[i];
          const regret = oracleVal[s] - v;
          if (regret > worst) worst = regret;
        }
        return worst;
      })(),
      minimaxUnits: minimax.x,
      minimaxMaxRegret: minimax.value,
      optimisticUnits: optimistic ? optimistic.x : null,
      optimisticWorstCase,
      priceOfFairness,
      committedHours,
      committedBudget,
      stressSwitches,
      topExposureAction: topIdx >= 0 ? actions[topIdx].key : null,
      regretRelease,
      exposure,
      certificate: {
        engine: 'branch-and-bound',
        nodes: nodes.explored,
        pruned: nodes.pruned,
        budget: maxNodes,
        certified: true,
      },
    };
  } catch (error) {
    if (error instanceof BudgetExhausted) {
      return {
        ok: false,
        reason: `The certified branch-and-bound reached the declared node budget of ${maxNodes} before proving optimality. Raise the node budget convention or reduce maxUnits; an uncertified answer is refused, never approximated.`,
      };
    }
    throw error;
  }
}
