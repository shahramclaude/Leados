/**
 * app/core/domain/robustAllocation.js — the Robust Allocation engine
 * (ADR-0095, Schema v98).
 *
 * Pure read/write-model code. Nothing here touches DOM, storage or the network.
 * The solver is EXACT integer arithmetic: it enumerates the feasible integer
 * grid and the C(n, Γ) Bertsimas–Sim scenario problems, prints the Wald maximin
 * and Savage minimax-regret plans, prices the equity floor, stress-tests each
 * effect range and ranks the ranges by the regret their resolution releases.
 *
 * The subject of every figure is a PLAN, a SEGMENT or an ACTION LINE. No person
 * is rated, ranked or named in a published row, a brief or a CSV cell.
 */
import { addDays, dayKey, weekKey } from '../time.js';
import { buildSeats, activeSeat } from './seat.js';
import { robustAllocationConventions } from './robustAllocationSchema.js';
import { bnbSolveRobustPlan } from './robustBranchBound.js';
import { PROSPECTIVE_INSTRUMENT_BY_KEY } from './prospectiveRegistry.js';
import {
  ROBUST_ALLOCATION_DISCLOSURE,
  ROBUST_ALLOCATION_ENGINE_VERSION,
  ROBUST_ALLOCATION_LIMITS,
  ROBUST_ALLOCATION_PLAYBOOK,
  ROBUST_ALLOCATION_PREMISE,
} from './robustAllocationRegistry.js';

export function robustHash(value) {
  let result = 2166136261;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    result ^= text.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

export function robustWeekKey(now) {
  return weekKey(now);
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

/** Wilson (1927) score interval, refused on an empty or invalid sample. */
export function wilsonInterval(k, n, z = 1.96) {
  if (!Number.isFinite(k) || !Number.isFinite(n) || n <= 0 || k < 0 || k > n) {
    return { pct: null, lowPct: null, highPct: null, refused: true, reason: 'No valid sample.' };
  }
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const margin = (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return {
    pct: round1(p * 100),
    lowPct: round1(Math.max(0, centre - margin) * 100),
    highPct: round1(Math.min(1, centre + margin) * 100),
    refused: false,
    reason: '',
  };
}

/* ------------------------------------------------------------- exact solver */

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

function topGammaSum(dev, gamma) {
  if (gamma <= 0) return 0;
  if (gamma >= dev.length) return dev.reduce((sum, v) => sum + v, 0);
  return dev.slice().sort((a, b) => b - a).slice(0, gamma).reduce((sum, v) => sum + v, 0);
}

function lexLess(a, b) {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}

/** Prefer higher value (or lower for regret), then lower cost, hours, lex x. */
function prefer(candidate, best, minimize = false) {
  if (!best) return true;
  if (candidate.value !== best.value) return minimize ? candidate.value < best.value : candidate.value > best.value;
  if (candidate.cost !== best.cost) return candidate.cost < best.cost;
  if (candidate.hours !== best.hours) return candidate.hours < best.hours;
  return lexLess(candidate.x, best.x);
}

/**
 * Enumerate the feasible integer grid with monotone pruning. Budget, hours and
 * per-segment saturation are hard; equity floors are checked at the leaf unless
 * `ignoreFloors` (used only to price fairness). The declared grid bound is
 * enforced BEFORE enumeration so an over-cap instance is refused, never run.
 */
export function enumerateFeasible(plan, { maxCombinations, ignoreFloors = false }) {
  const actions = plan.actions;
  const segments = plan.segments;
  const n = actions.length;
  let grid = 1;
  for (const a of actions) {
    grid *= (a.maxUnits + 1);
    if (grid > maxCombinations) {
      return { ok: false, allocations: [], reason: `The declared grid (${actions.map((a) => a.maxUnits + 1).join('×')} combinations) exceeds the exact-solver bound of ${maxCombinations}. Reduce maxUnits or the number of actions; an approximate answer is refused.` };
    }
  }
  const segIndex = new Map(segments.map((s, i) => [s.key, i]));
  const segSize = segments.map((s) => s.size);
  const segFloor = segments.map((s) => s.floorCoverage);
  const allocations = [];
  const x = new Array(n).fill(0);
  const coverage = new Array(segments.length).fill(0);
  const dfs = (i, cost, hours) => {
    if (i === n) {
      if (!ignoreFloors) {
        for (let s = 0; s < segments.length; s += 1) if (coverage[s] < segFloor[s]) return;
      }
      allocations.push({ x: x.slice(), cost, hours });
      return;
    }
    const a = actions[i];
    const s = segIndex.get(a.segmentKey);
    for (let u = 0; u <= a.maxUnits; u += 1) {
      const nc = cost + a.unitCost * u;
      const nh = hours + a.unitHours * u;
      if (nc > plan.budgetCap || nh > plan.hoursCap) break;
      const ncv = coverage[s] + a.unitCoverage * u;
      if (ncv > segSize[s]) break;
      x[i] = u;
      coverage[s] = ncv;
      dfs(i + 1, nc, nh);
      coverage[s] -= a.unitCoverage * u;
    }
    x[i] = 0;
  };
  dfs(0, 0, 0);
  return { ok: true, allocations, reason: '' };
}

function nominalAndDev(x, hi, dev) {
  let nominal = 0;
  const d = new Array(x.length);
  for (let i = 0; i < x.length; i += 1) {
    nominal += hi[i] * x[i];
    d[i] = dev[i] * x[i];
  }
  return { nominal, d };
}

/** One pass: the Wald maximin allocation over a feasible set. */
function maximinOver(feasible, hi, dev, gamma) {
  let best = null;
  for (const alloc of feasible) {
    const { nominal, d } = nominalAndDev(alloc.x, hi, dev);
    const value = nominal - topGammaSum(d, gamma);
    const candidate = { value, x: alloc.x, cost: alloc.cost, hours: alloc.hours };
    if (prefer(candidate, best)) best = candidate;
  }
  return best;
}

/** Two passes: optimistic, maximin and the Savage minimax-regret allocation. */
function solveCore(feasible, hi, dev, gamma, scenarios) {
  const oracle = scenarios.map(() => -Infinity);
  let optimistic = null;
  let maximin = null;
  for (const alloc of feasible) {
    const { nominal, d } = nominalAndDev(alloc.x, hi, dev);
    const worst = nominal - topGammaSum(d, gamma);
    const optCandidate = { value: nominal, x: alloc.x, cost: alloc.cost, hours: alloc.hours };
    if (prefer(optCandidate, optimistic)) optimistic = optCandidate;
    const maxCandidate = { value: worst, x: alloc.x, cost: alloc.cost, hours: alloc.hours };
    if (prefer(maxCandidate, maximin)) maximin = maxCandidate;
    for (let s = 0; s < scenarios.length; s += 1) {
      let v = nominal;
      for (const i of scenarios[s]) v -= d[i];
      if (v > oracle[s]) oracle[s] = v;
    }
  }
  let minimax = null;
  for (const alloc of feasible) {
    const { nominal, d } = nominalAndDev(alloc.x, hi, dev);
    let maxRegret = 0;
    for (let s = 0; s < scenarios.length; s += 1) {
      let v = nominal;
      for (const i of scenarios[s]) v -= d[i];
      const regret = oracle[s] - v;
      if (regret > maxRegret) maxRegret = regret;
    }
    const candidate = { value: maxRegret, x: alloc.x, cost: alloc.cost, hours: alloc.hours };
    if (prefer(candidate, minimax, true)) minimax = candidate;
  }
  // Regret of the maximin plan itself (read beside the minimax plan).
  let maximinRegret = 0;
  {
    const { nominal, d } = nominalAndDev(maximin.x, hi, dev);
    for (let s = 0; s < scenarios.length; s += 1) {
      let v = nominal;
      for (const i of scenarios[s]) v -= d[i];
      const regret = oracle[s] - v;
      if (regret > maximinRegret) maximinRegret = regret;
    }
  }
  return { optimistic, maximin, minimax, maximinRegret, oracle };
}

/**
 * Solve one plan exactly. Returns a refusal (ok:false) for an over-cap grid,
 * an exhausted node budget or an infeasible constraint set — never an
 * approximation or a silent zero. ADR-0097: a grid above the enumeration bound
 * is handed to the certified branch-and-bound (same printed values, provenance
 * certificate attached) instead of being refused outright.
 */
export function solveRobustPlan(plan, {
  maxCombinations = ROBUST_ALLOCATION_LIMITS.combinationsMax,
  nodeBudget = ROBUST_ALLOCATION_LIMITS.nodeBudgetDefault,
} = {}) {
  const actions = plan.actions;
  const n = actions.length;
  const gamma = plan.gamma;
  // The enumeration gate is the GRID size; past it, the certified
  // branch-and-bound takes over with its own structural bounds.
  let grid = 1;
  for (const a of actions) {
    grid *= (a.maxUnits + 1);
    if (grid > maxCombinations) {
      return bnbSolveRobustPlan(plan, {
        maxNodes: nodeBudget,
        scenariosMax: ROBUST_ALLOCATION_LIMITS.scenariosMax,
        unitsSumMax: ROBUST_ALLOCATION_LIMITS.unitsSumMax,
      });
    }
  }
  const enumRes = enumerateFeasible(plan, { maxCombinations });
  if (!enumRes.ok) return enumRes;
  const feasible = enumRes.allocations;
  if (!feasible.length) {
    return { ok: false, reason: 'No feasible allocation satisfies the budget, hours, saturation and equity-floor constraints together. Relax a floor or raise a cap; an infeasible plan is refused, not relaxed.' };
  }
  const scenarios = combinations(actions.map((_, i) => i), gamma);
  if (scenarios.length > ROBUST_ALLOCATION_LIMITS.scenariosMax) {
    return { ok: false, reason: `Γ=${gamma} over ${n} actions produces ${scenarios.length} scenario problems, above the ${ROBUST_ALLOCATION_LIMITS.scenariosMax}-scenario bound. Lower Γ or the number of actions.` };
  }
  const hi = actions.map((a) => a.effectHi);
  const dev = actions.map((a) => a.effectHi - a.effectLo);
  const core = solveCore(feasible, hi, dev, gamma, scenarios);

  // Price of fairness: the worst-case value the equity floor costs.
  let priceOfFairness = 0;
  const hasFloor = plan.segments.some((s) => s.floorCoverage > 0);
  if (hasFloor) {
    const noFloor = enumerateFeasible(plan, { maxCombinations, ignoreFloors: true });
    if (noFloor.ok && noFloor.allocations.length) {
      const unconstrained = maximinOver(noFloor.allocations, hi, dev, gamma);
      priceOfFairness = Math.max(0, unconstrained.value - core.maximin.value);
    }
  }

  // One-at-a-time stress: force each effect range to its floor (lo=0 ⇒ dev=hi)
  // and report which single stress flips the recommended maximin plan.
  const stressSwitches = [];
  for (let j = 0; j < n; j += 1) {
    if (dev[j] === 0) continue;
    const stressedDev = dev.slice();
    stressedDev[j] = hi[j];
    const stressed = maximinOver(feasible, hi, stressedDev, gamma);
    if (stressed && !sameUnits(stressed.x, core.maximin.x)) stressSwitches.push(actions[j].key);
  }

  // Value of information: rank by worst-case exposure on the robust plan, then
  // compute the EXACT regret released by resolving the top range (dev=0).
  const exposure = actions.map((a, j) => dev[j] * core.maximin.x[j]);
  let topIdx = -1;
  let topValue = -1;
  for (let j = 0; j < n; j += 1) {
    if (exposure[j] > topValue) { topValue = exposure[j]; topIdx = j; }
  }
  let regretRelease = 0;
  if (topIdx >= 0 && dev[topIdx] > 0) {
    const voiDev = dev.slice();
    voiDev[topIdx] = 0;
    const resolved = solveCore(feasible, hi, voiDev, gamma, scenarios);
    regretRelease = Math.max(0, core.minimax.value - resolved.minimax.value);
  }

  const robustUnits = core.maximin.x;
  const committedHours = actions.reduce((sum, a, i) => sum + a.unitHours * robustUnits[i], 0);
  const committedBudget = actions.reduce((sum, a, i) => sum + a.unitCost * robustUnits[i], 0);
  const robustNominal = nominalAndDev(robustUnits, hi, dev).nominal;

  return {
    ok: true,
    reason: '',
    gamma,
    feasibleN: feasible.length,
    scenariosN: scenarios.length,
    robustUnits,
    robustWorstCase: core.maximin.value,
    robustOptimistic: robustNominal,
    robustMaxRegret: core.maximinRegret,
    minimaxUnits: core.minimax.x,
    minimaxMaxRegret: core.minimax.value,
    optimisticUnits: core.optimistic.x,
    optimisticWorstCase: nominalAndDev(core.optimistic.x, hi, dev).nominal - topGammaSum(nominalAndDev(core.optimistic.x, hi, dev).d, gamma),
    priceOfFairness,
    committedHours,
    committedBudget,
    stressSwitches,
    topExposureAction: topIdx >= 0 ? actions[topIdx].key : null,
    regretRelease,
    exposure,
    certificate: {
      engine: 'enumeration',
      nodes: feasible.length,
      pruned: 0,
      budget: maxCombinations,
      certified: true,
    },
  };
}

function sameUnits(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

/* ------------------------------------------------------------- read model */

function scopedPlans(state, seat) {
  const all = Array.isArray(state.robustPlans) ? state.robustPlans : [];
  if (seat.fullAccess) return all.slice(0, ROBUST_ALLOCATION_LIMITS.plans);
  return all.filter((p) => p && (p.scopeSeatId === seat.id || (p.scopeSeatId && seat.scope.has(p.scopeSeatId))));
}

function gradeForContract(state, contractId) {
  if (!contractId) return null;
  return (Array.isArray(state.prospectiveGrades) ? state.prospectiveGrades : [])
    .find((g) => g && g.contractId === contractId) || null;
}

function lineTasksForPlan(state, planId) {
  const links = Array.isArray(state.links) ? state.links : [];
  const ids = links
    .filter((l) => l && l.sourceType === 'robustplan' && l.sourceId === planId && l.targetType === 'delegation' && l.relation === 'consumes-capacity')
    .map((l) => l.targetId);
  const byId = new Map((Array.isArray(state.delegations) ? state.delegations : []).map((d) => [d && d.id, d]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

/** Derived lifecycle state of one plan, read from records other modules own. */
export function planState(state, plan, { today, reviewDays }) {
  if (plan.status !== 'adopted') return 'draft';
  const grade = gradeForContract(state, plan.linkedContractId);
  if (grade && grade.outcome === 0) return 'falsified';
  const past = today > addDays(plan.horizonOn, reviewDays);
  if (past) {
    if (plan.linkedContractId && !grade) return 'ungraded';
    const tasks = lineTasksForPlan(state, plan.id);
    if (tasks.length && tasks.some((t) => t.status !== 'done')) return 'overdue';
  }
  return 'adopted';
}

/** Is `maybeAncestor` the same node as `descendant` or one of its chain parents? */
export function isSameOrAncestor(built, maybeAncestor, descendant) {
  if (!maybeAncestor || !descendant) return false;
  if (maybeAncestor === descendant) return true;
  let cursor = built?.chain?.nodes?.get(descendant)?.parentId || null;
  let guard = 0;
  while (cursor && guard < 64) {
    if (cursor === maybeAncestor) return true;
    cursor = built?.chain?.nodes?.get(cursor)?.parentId || null;
    guard += 1;
  }
  return false;
}

/** Does a plan scoped at `scopeSeatId` cover a cell graded beneath it? Peer spans never qualify. */
export function planCoversCell(built, plan, cell) {
  for (const cellSeatId of cell.scopeSeatIds || []) {
    if (isSameOrAncestor(built, plan.scopeSeatId, cellSeatId)) return true;
  }
  return false;
}

/**
 * ADR-0097 — Evidence-calibrated ranges. Settled prospective grades are
 * clustered by (altitude × instrument) cell and read back against the plans
 * whose actions declare the same instrument as their premise evidence. The
 * module NEVER adjusts a declared range: it publishes the graded record per
 * cell (count, reach rate, Wilson 95% interval) and flags TENSION when the
 * graded record contradicts the premises a scoped plan rests on; moving the
 * number is a human act (a new declared revision).
 * Cells below the declared floor are refused, small cells are complementarily
 * suppressed, and pooled rates are withheld below director rank — the same
 * disclosure ladder as the allocation roll-up.
 */
export function buildCalibrationCells(source, { seat, conventions, plans, built: builtSeats = null }) {
  const grades = (Array.isArray(source.prospectiveGrades) ? source.prospectiveGrades : []).filter(Boolean);
  const contracts = new Map((Array.isArray(source.prospectiveContracts) ? source.prospectiveContracts : []).filter(Boolean).map((c) => [c.id, c]));
  const inScope = (contract) => {
    if (!contract) return false;
    if (seat.fullAccess) return true;
    return contract.scopeSeatId === seat.id || (contract.scopeSeatId && seat.scope.has(contract.scopeSeatId));
  };
  const byKey = new Map();
  for (const grade of grades) {
    const contract = contracts.get(grade.contractId);
    if (!contract || !inScope(contract) || !PROSPECTIVE_INSTRUMENT_BY_KEY[grade.instrumentKey]) continue;
    const altitudeKey = contract.altitudeKey || 'unknown';
    const key = `${altitudeKey}|${grade.instrumentKey}`;
    if (!byKey.has(key)) byKey.set(key, { altitudeKey, instrumentKey: grade.instrumentKey, gradedN: 0, reachedN: 0, falsifiedN: 0, scopeSeatIds: new Set() });
    const cell = byKey.get(key);
    cell.gradedN += 1;
    if (grade.outcome === 1) cell.reachedN += 1;
    if (grade.outcome === 0) cell.falsifiedN += 1;
    if (contract.scopeSeatId) cell.scopeSeatIds.add(contract.scopeSeatId);
  }
  // How many scoped plans rest on each cell via a declared evidence instrument.
  // Coverage is the plan's span over the cell's declared seat (evidence rolls
  // up the subtree); without a chain the join degrades to altitude equality.
  const planCounts = new Map();
  for (const plan of plans || []) {
    if (!plan) continue;
    const keys = new Set((plan.actions || []).map((a) => a && a.evidenceInstrumentKey).filter(Boolean));
    if (!keys.size) continue;
    for (const [cellKey, cellRaw] of byKey) {
      if (!keys.has(cellRaw.instrumentKey)) continue;
      const covered = builtSeats
        ? [...(cellRaw.scopeSeatIds || [])].some((id) => isSameOrAncestor(builtSeats, plan.scopeSeatId, id))
        : (plan.altitudeKey || 'unknown') === cellRaw.altitudeKey;
      if (covered) planCounts.set(cellKey, (planCounts.get(cellKey) || 0) + 1);
    }
  }
  const floor = conventions.robustAllocationCellFloor;
  const cells = [...byKey.values()].map((cell) => {
    const key = `${cell.altitudeKey}|${cell.instrumentKey}`;
    const wilson = wilsonInterval(cell.reachedN, cell.gradedN);
    const refused = seat.rank < 3 || cell.gradedN < floor || wilson.refused;
    const tension = !refused && cell.falsifiedN > cell.reachedN;
    return {
      key,
      altitudeKey: cell.altitudeKey,
      instrumentKey: cell.instrumentKey,
      instrumentLabel: PROSPECTIVE_INSTRUMENT_BY_KEY[cell.instrumentKey]?.label || cell.instrumentKey,
      gradedN: cell.gradedN,
      reachedN: cell.reachedN,
      falsifiedN: cell.falsifiedN,
      scopeSeatIds: [...(cell.scopeSeatIds || [])],
      plansN: planCounts.get(key) || 0,
      reachedPct: refused ? null : wilson.pct,
      lowPct: refused ? null : wilson.lowPct,
      highPct: refused ? null : wilson.highPct,
      refused,
      suppressed: false,
      tension,
      reason: refused
        ? (seat.rank < 3 ? 'Withheld below director rank; counts only.' : `Below the ${floor}-grade cell floor.`)
        : '',
    };
  }).sort((a, b) => String(a.key).localeCompare(String(b.key)));
  // Complementary suppression: a sub-floor cell blanks the smallest surviving
  // sibling cell so its rate cannot be recovered against a total.
  const small = cells.filter((c) => c.gradedN > 0 && c.gradedN < floor);
  if (small.length) {
    const survivor = cells.filter((c) => !(c.gradedN < floor) && !c.refused && !c.suppressed)
      .sort((a, b) => a.gradedN - b.gradedN)[0];
    if (survivor) {
      survivor.suppressed = true;
      survivor.refused = true;
      survivor.tension = false;
      survivor.reachedPct = null;
      survivor.lowPct = null;
      survivor.highPct = null;
      survivor.reason = 'Complementary suppression: a sibling cell is below the floor, so this cell is blanked beside it.';
    }
  }
  return cells;
}

/** The one read model. Every panel, the brief, the CSV and the badge read this. */
export function buildRobustAllocationReport(state, { now = new Date(), settings = null, planId = null } = {}) {
  const source = state || {};
  const clock = now instanceof Date ? now : new Date(now || Date.now());
  const today = dayKey(clock);
  const conventions = robustAllocationConventions(settings || source.settings || {});
  const built = buildSeats(source, { now: clock, settings: settings || source.settings || {} });
  const seat = activeSeat(built);
  const plans = scopedPlans(source, seat);
  const detailAllowed = seat.fullAccess || seat.rank <= 2;

  const rows = plans.map((plan) => ({
    id: plan.id,
    title: detailAllowed ? plan.title : '',
    declaredOn: plan.declaredOn,
    horizonOn: plan.horizonOn,
    scopeSeatId: plan.scopeSeatId,
    altitudeKey: plan.altitudeKey,
    rank: plan.rank,
    status: plan.status,
    state: planState(source, plan, { today, reviewDays: conventions.robustAllocationReviewDays }),
    gamma: plan.gamma,
    actionsN: plan.actions.length,
    segmentsN: plan.segments.length,
    currency: plan.currency,
    linkedContractId: plan.linkedContractId,
    committedHours: plan.frozen ? plan.frozen.committedHours : null,
    robustWorstCase: plan.frozen ? plan.frozen.robustWorstCase : null,
  })).sort((a, b) => String(b.declaredOn).localeCompare(String(a.declaredOn)) || String(a.id).localeCompare(String(b.id)));

  const calibrationCells = buildCalibrationCells(source, { seat, conventions, plans, built });

  // Solve only the selected plan (default: most recent). Drafts solve live;
  // adopted plans read their frozen vector so the governed work is never
  // re-derived from a changed assumption.
  const selected = plans.find((p) => p.id === planId) || plans[0] || null;
  let solution = null;
  let selectedDetail = null;
  if (selected) {
    solution = selected.status === 'adopted' && selected.frozen
      ? { ok: true, ...selected.frozen, gamma: selected.gamma, frozen: true, certificate: selected.frozen.certificate || null }
      : solveRobustPlan(selected, {
        maxCombinations: conventions.robustAllocationMaxCombinations,
        nodeBudget: conventions.robustAllocationNodeBudget,
      });
    selectedDetail = {
      id: selected.id,
      title: detailAllowed ? selected.title : '',
      outcomeLabel: selected.outcomeLabel,
      currency: selected.currency,
      budgetCap: selected.budgetCap,
      hoursCap: selected.hoursCap,
      gamma: selected.gamma,
      segments: selected.segments,
      actions: selected.actions.map((action) => {
        if (!action.evidenceInstrumentKey) return action;
        // The graded record read for a declared range: the NEAREST cell of the
        // same instrument at same altitude or directly beneath the plan's
        // span (evidence rolls up the subtree; a peer span never qualifies).
        const candidates = calibrationCells
          .filter((c) => !c.suppressed && c.instrumentKey === action.evidenceInstrumentKey && planCoversCell(built, selected, c));
        const cell = candidates.length
          ? candidates.sort((a, b) => b.gradedN - a.gradedN)[0]
          : null;
        const evidence = !cell
          ? { instrumentKey: action.evidenceInstrumentKey, gradedN: 0, refused: false, reason: '', tension: false }
          : {
            instrumentKey: action.evidenceInstrumentKey,
            instrumentLabel: cell.instrumentLabel,
            evidenceAltitude: cell.altitudeKey,
            gradedN: cell.gradedN,
            reachedPct: cell.reachedPct,
            lowPct: cell.lowPct,
            highPct: cell.highPct,
            refused: cell.refused,
            reason: cell.reason,
            tension: cell.tension,
          };
        return { ...action, evidence };
      }),
      status: selected.status,
      state: planState(source, selected, { today, reviewDays: conventions.robustAllocationReviewDays }),
      linkedContractId: selected.linkedContractId,
      linkedGrade: gradeForContract(source, selected.linkedContractId),
      supersedesId: selected.supersedesId || null,
    };
  }

  // Vertical roll-up: per-altitude counts and the falsified share, with the
  // Wilson interval, small-cell withholding and complementary suppression.
  const byAltitude = ['frontline', 'manager', 'director', 'exec', 'chief'].map((key) => {
    const subset = plans.filter((p) => (p.altitudeKey || 'unknown') === key);
    const adopted = subset.filter((p) => p.status === 'adopted');
    const states = subset.map((p) => planState(source, p, { today, reviewDays: conventions.robustAllocationReviewDays }));
    const falsified = states.filter((s) => s === 'falsified').length;
    const overdue = states.filter((s) => s === 'overdue').length;
    const ungraded = states.filter((s) => s === 'ungraded').length;
    const committedHours = adopted.reduce((sum, p) => sum + (p.frozen ? p.frozen.committedHours : 0), 0);
    const fundedLines = adopted.reduce((sum, p) => sum + (p.frozen ? p.frozen.robustUnits.filter((u) => u > 0).length : 0), 0);
    const wilson = wilsonInterval(falsified, adopted.length);
    const refused = seat.rank < 3 || adopted.length < conventions.robustAllocationCellFloor || wilson.refused;
    return {
      altitudeKey: key,
      plansN: subset.length,
      adoptedN: adopted.length,
      fundedLinesN: fundedLines,
      committedHours,
      falsifiedN: falsified,
      overdueN: overdue,
      ungradedN: ungraded,
      falsifiedPct: refused ? null : wilson.pct,
      lowPct: refused ? null : wilson.lowPct,
      highPct: refused ? null : wilson.highPct,
      refused,
      suppressed: false,
      reason: refused ? (seat.rank < 3 ? 'Withheld below director rank; counts only.' : `Below the ${conventions.robustAllocationCellFloor}-plan cell floor.`) : '',
    };
  });
  // Complementary suppression: a sub-floor altitude blanks the smallest
  // surviving sibling so a withheld rate cannot be recovered by subtraction.
  const small = byAltitude.filter((a) => a.adoptedN > 0 && a.adoptedN < conventions.robustAllocationCellFloor);
  if (small.length) {
    const survivor = byAltitude.filter((a) => a.adoptedN >= conventions.robustAllocationCellFloor && !a.suppressed)
      .sort((a, b) => a.adoptedN - b.adoptedN)[0];
    if (survivor) {
      survivor.suppressed = true;
      survivor.refused = true;
      survivor.falsifiedPct = null;
      survivor.lowPct = null;
      survivor.highPct = null;
      survivor.reason = 'Complementary suppression: a sibling altitude is below the floor, so this row is blanked beside it.';
    }
  }

  const adoptedAll = plans.filter((p) => p.status === 'adopted');
  const falsifiedAll = plans.filter((p) => planState(source, p, { today, reviewDays: conventions.robustAllocationReviewDays }) === 'falsified').length;
  const coverage = wilsonInterval(falsifiedAll, adoptedAll.length);
  const coverageRefused = seat.rank < 3 || adoptedAll.length < conventions.robustAllocationCellFloor || coverage.refused;

  const openDecisions = (Array.isArray(source.decisions) ? source.decisions : [])
    .filter((d) => d && d.outcome === 'pending' && /RULE-RAL-0[2-5]/.test(String(d.rationale || '')))
    .map((d) => ({ id: d.id, title: d.title, reviewOn: d.reviewOn || null, ruleId: (String(d.rationale).match(/RULE-RAL-0[2-5]/) || [''])[0] }));

  const summary = {
    plans: plans.length,
    adopted: adoptedAll.length,
    drafts: plans.filter((p) => p.status === 'draft').length,
    falsified: falsifiedAll,
    overdue: rows.filter((r) => r.state === 'overdue').length,
    ungraded: rows.filter((r) => r.state === 'ungraded').length,
    openFindings: openDecisions.length,
    committedHours: adoptedAll.reduce((sum, p) => sum + (p.frozen ? p.frozen.committedHours : 0), 0),
  };

  return {
    ok: true,
    engineVersion: ROBUST_ALLOCATION_ENGINE_VERSION,
    today,
    seat: {
      id: seat.id, label: seat.label, shortLabel: seat.shortLabel,
      rank: seat.rank, altitudeKey: seat.altitudeKey || 'chief',
      fullAccess: Boolean(seat.fullAccess), readOnly: Boolean(seat.readOnly),
    },
    detailAllowed,
    playbook: ROBUST_ALLOCATION_PLAYBOOK[seat.altitudeKey] || ROBUST_ALLOCATION_PLAYBOOK.chief,
    premise: ROBUST_ALLOCATION_PREMISE,
    disclosure: ROBUST_ALLOCATION_DISCLOSURE,
    conventions,
    rows,
    selectedPlanId: selected ? selected.id : null,
    selectedDetail,
    solution,
    byAltitude,
    calibration: {
      cells: calibrationCells,
      gradedN: calibrationCells.reduce((sum, c) => sum + c.gradedN, 0),
      publishedN: calibrationCells.filter((c) => !c.refused && !c.suppressed).length,
      tensionN: calibrationCells.filter((c) => c.tension).length,
    },
    coverage: {
      ...coverage,
      refused: coverageRefused,
      reason: coverageRefused
        ? (seat.rank < 3 ? 'A pooled rate is withheld below director rank; counts only.' : `${adoptedAll.length} adopted plan(s) is below the ${conventions.robustAllocationCellFloor}-plan floor.`)
        : '',
      adoptedN: adoptedAll.length, falsifiedN: falsifiedAll, floor: conventions.robustAllocationCellFloor,
    },
    openDecisions,
    summary,
    attention: Math.min(99, summary.falsified + summary.overdue + summary.ungraded + summary.openFindings),
    withheld: [
      ...(seat.rank < 3 ? [{ n: byAltitude.length, reason: 'Pooled rates are withheld below director rank; only counts and your own plans are shown.' }] : []),
      ...(solution && !solution.ok ? [{ n: 1, reason: solution.reason }] : []),
    ],
  };
}

/** Identity-free upward brief. No id, title, name or currency amount appears. */
export function robustAllocationBriefText(report) {
  if (!report?.ok) return '';
  const { summary, coverage, conventions, seat, today, byAltitude } = report;
  const published = byAltitude.filter((a) => !a.refused && !a.suppressed);
  const lines = [
    '# Robust allocation — upward brief',
    '',
    `Measured ${today} at ${seat.label.toLowerCase()} (rank ${seat.rank}).`,
    '',
    `- ${summary.plans} plan(s): ${summary.adopted} adopted, ${summary.drafts} draft, ${summary.falsified} falsified out of sample, ${summary.overdue} overdue, ${summary.ungraded} ungraded.`,
    `- Committed leadership hours across adopted plans: ${summary.committedHours}. Open governed findings: ${summary.openFindings}.`,
    coverage.refused
      ? `- Falsified share WITHHELD: ${coverage.reason}`
      : `- Falsified share ${coverage.pct}% (Wilson 95% ${coverage.lowPct}–${coverage.highPct}%) over ${coverage.adoptedN} adopted plan(s).`,
    '',
    '## Published altitude rows (counts and rates only)',
    '',
    published.length
      ? published.map((a) => `- ${a.altitudeKey}: ${a.adoptedN} adopted, ${a.fundedLinesN} funded lines, ${a.committedHours} hours, falsified ${a.falsifiedPct}% (95% ${a.lowPct}–${a.highPct}%).`).join('\n')
      : '- No altitude row reached the declared evidence floor.',
    '',
    '## Evidence calibration (graded pre-registered bets by altitude × instrument cell)',
    '',
    ...(report.calibration && report.calibration.gradedN
      ? [
        `- ${report.calibration.gradedN} graded contract(s) in scope across ${report.calibration.cells.length} cell(s); ${report.calibration.tensionN} cell(s) in premise–evidence tension.`,
        ...report.calibration.cells.filter((c) => !c.refused && !c.suppressed && c.plansN > 0)
          .map((c) => `- ${c.altitudeKey} × ${c.instrumentLabel}: ${c.reachedN}/${c.gradedN} reached (${c.reachedPct}%, 95% ${c.lowPct}–${c.highPct}%), supporting ${c.plansN} plan(s)${c.tension ? ' — TENSION' : ''}.`),
      ]
      : ['- No graded prospective evidence is in scope yet.']),
    '',
    '## Conventions and limits',
    '',
    `- Cell floor ${conventions.robustAllocationCellFloor}; review window ${conventions.robustAllocationReviewDays} day(s); enumeration bound ${conventions.robustAllocationMaxCombinations} combinations; certified branch-and-bound node budget ${conventions.robustAllocationNodeBudget}.`,
    `- ${report.disclosure.premise}`,
    `- ${report.disclosure.uncertainty}`,
    `- ${report.disclosure.equity}`,
    `- ${report.disclosure.rollup}`,
    `- ${report.disclosure.local}`,
    '',
    'No plan id, title, person name or currency amount appears in this brief. Money is never pooled across currencies.',
  ];
  return lines.join('\n');
}

/** Aggregate-only CSV rows. A refused figure is BLANK (null), never zero. */
export function robustAllocationCsvRows(report) {
  if (!report?.ok) return [];
  const blank = (row, condition) => (condition ? { ...row, falsified_pct: null, interval_low_pct: null, interval_high_pct: null } : row);
  const altitudeRows = report.byAltitude.map((a) => blank({
    row_kind: 'altitude', altitude: a.altitudeKey, rank: null,
    plans_n: a.plansN, adopted_n: a.adoptedN, funded_lines_n: a.fundedLinesN,
    committed_hours: a.committedHours, falsified_n: a.falsifiedN, overdue_n: a.overdueN, ungraded_n: a.ungradedN,
    falsified_pct: a.falsifiedPct, interval_low_pct: a.lowPct, interval_high_pct: a.highPct,
    refused: a.refused || a.suppressed ? 'yes' : 'no', reason: a.reason,
  }, a.refused || a.suppressed));
  const workspace = {
    row_kind: 'workspace', altitude: 'all', rank: null,
    plans_n: report.summary.plans, adopted_n: report.summary.adopted,
    funded_lines_n: null, committed_hours: report.summary.committedHours,
    falsified_n: report.summary.falsified, overdue_n: report.summary.overdue, ungraded_n: report.summary.ungraded,
    falsified_pct: report.coverage.refused ? null : report.coverage.pct,
    interval_low_pct: report.coverage.refused ? null : report.coverage.lowPct,
    interval_high_pct: report.coverage.refused ? null : report.coverage.highPct,
    refused: report.coverage.refused ? 'yes' : 'no', reason: report.coverage.reason,
  };
  return [...altitudeRows, workspace];
}

/** Cheap badge counter: does not build the full report or solve on every render. */
export function robustAllocationAttentionCount(state, { now = new Date(), settings = null } = {}) {
  const source = state || {};
  const clock = now instanceof Date ? now : new Date(now || Date.now());
  const today = dayKey(clock);
  const conventions = robustAllocationConventions(settings || source.settings || {});
  const plans = Array.isArray(source.robustPlans) ? source.robustPlans : [];
  const grades = Array.isArray(source.prospectiveGrades) ? source.prospectiveGrades : [];
  const gradeByContract = new Map(grades.map((g) => [g && g.contractId, g]));
  let attention = 0;
  for (const plan of plans) {
    if (!plan || plan.status !== 'adopted') continue;
    const grade = gradeByContract.get(plan.linkedContractId);
    if (grade && grade.outcome === 0) { attention += 1; continue; }
    if (today > addDays(plan.horizonOn, conventions.robustAllocationReviewDays)) attention += 1;
  }
  const findings = (Array.isArray(source.decisions) ? source.decisions : [])
    .filter((d) => d && d.outcome === 'pending' && /RULE-RAL-0[2-5]/.test(String(d.rationale || ''))).length;
  return Math.min(99, attention + findings);
}
