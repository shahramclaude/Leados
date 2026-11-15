/**
 * app/core/domain/capitalRationingMath.js — the exact selection kernel of the
 * Capital Rationing & Funded-Set Register (ADR-0211, Schema v165).
 *
 * WHY AN EXACT SEARCH AND NOT A SORT. The register this module extends orders
 * proposals by profitability index and the panel said so in its own words. That
 * order is exactly correct ONLY when every candidate is independent with one
 * binding constraint: then the fractional optimum and the integer optimum
 * coincide and greedily taking the best ratio is optimal. Weingartner (1963) is
 * the paper that ended that era. As soon as two cases are alternatives
 * (mutually exclusive — funding both counts one benefit twice), one case's
 * benefit depends on another, or a share of benefit is booked twice, the ranking
 * is silently wrong and the size of the error is not visible from the ranking.
 *
 * So this file solves the real problem:
 *
 *     maximise   Σ_i v_i·x_i  −  Σ_(i,j)∈O  o_ij·v_i·x_i·x_j
 *     over       x ∈ {0,1}^n
 *     subject to Σ_i w_i·x_i ≤ C                       (the declared ceiling)
 *                x_i + x_j ≤ 1  for every `exclusive` (i,j)
 *                x_i ≤ x_j      for every `requires` (i → j)
 *
 * where v_i is the case's own appraised net present value in whole cents, w_i is
 * the money the case commits (its promised outlay, undiscounted, in cents — the
 * figure a ceiling is actually written against), and o_ij is the declared shared
 * benefit in whole basis points of v_i.
 *
 * EVERY COMPARISON IS INTEGER. There is no `Math.pow` and no float anywhere in a
 * comparison, a bound or a tie-break:
 *   - the objective is held in an exact numerator over a common denominator of
 *     10,000 (because overlap is in basis points), so value = cents × 10,000;
 *   - the fractional bound is a rational held as {num, den} of BigInt and
 *     compared by CROSS-MULTIPLICATION, never by division;
 *   - the bound can only over-state, so rounding in it can never invalidate the
 *     proof it is used for.
 *
 * THE CLAIM, STATED NARROWLY. When a search returns `proved: true` the value it
 * printed is the maximum over every feasible set and the set it printed achieves
 * it. That is a theorem about the search, not a hope: `nodesPruned` counts only
 * branches a valid bound abandoned. When the budget is exhausted it returns
 * `proved: false` and NO set — because the best set found so far, printed as a
 * plan, would be a guess in a table.
 *
 * SOUNDNESS OF THE BOUND, STATED EXACTLY. The pruning bound ignores exclusivity,
 * dependency and overlap deductions, so it can only over-state what a branch can
 * still achieve; the incumbent it is compared against is the EXACT objective of
 * a wholly-decided set, deductions included. Over-stated bound against exact
 * incumbent means a pruned branch provably contains no better set. Pruning is
 * STRICT: a branch whose bound merely ties the incumbent is still explored,
 * because a tie can hide a different set of the same value and this register
 * would rather find it than claim a uniqueness it does not have.
 *
 * Pure module: no DOM, no storage, no clock, no floating-point arithmetic in any
 * decision. Deterministic for a given candidate list and constraint set.
 */

/** The objective's common denominator: overlap shares are whole basis points. */
const SCALE = 10000n;

/** One whole currency unit, in cents — the step the shadow price is read at. */
export const SHADOW_STEP_CENTS = 100;

/** A node budget shared by every search one read runs. */
export class NodeBudget {
  constructor(limit) {
    this.limit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 0;
    this.used = 0;
    this.exhausted = false;
  }

  /** Take one node. False once the budget is gone. */
  take() {
    if (this.used >= this.limit) { this.exhausted = true; return false; }
    this.used += 1;
    return true;
  }

  get remaining() { return Math.max(0, this.limit - this.used); }
}

/* ------------------------------------------------------------------ sorting */

/**
 * Density comparison: value per cent of ceiling, by exact cross-multiplication
 * over the SCALED value. Ties break on the candidate's declared index, so the
 * search is deterministic and the printed set is reproducible in any engine.
 */
export function densityCompare(a, b) {
  if (a.weight === 0 && b.weight === 0) return a.index - b.index;
  // A zero-weight case with positive value is always fundable and ranks first.
  if (a.weight === 0) return a.scaledValue > 0n ? -1 : 1;
  if (b.weight === 0) return a.scaledValue > 0n ? 1 : -1;
  const left = a.scaledValue * BigInt(b.weight);
  const right = b.scaledValue * BigInt(a.weight);
  if (left !== right) return left > right ? -1 : 1;
  return a.index - b.index;
}

/* ------------------------------------------------------- relation handling */

/**
 * Read declared relations into the three constraint shapes the solver consumes.
 * Only relations whose BOTH ends are candidates in this currency take part; the
 * rest are counted with their reason, never invented into a constraint.
 */
export function prepareRelations(relations, candidates) {
  const byId = new Map(candidates.map((row) => [row.caseId, row]));
  const exclusive = [];
  const requires = [];
  const overlap = [];
  const excluded = [];
  const seenExclusive = new Set();
  for (const relation of Array.isArray(relations) ? relations : []) {
    const a = byId.get(relation.aCaseId);
    const b = byId.get(relation.bCaseId);
    if (!a || !b) { excluded.push({ relation, why: 'not-a-candidate' }); continue; }
    if (a.index === b.index) { excluded.push({ relation, why: 'same-case' }); continue; }
    if (relation.kind === 'exclusive') {
      // A symmetric constraint declared from both directions is ONE constraint.
      const pair = [a.index, b.index].sort((x, y) => x - y);
      const key = `${pair[0]}:${pair[1]}`;
      if (seenExclusive.has(key)) continue;
      seenExclusive.add(key);
      exclusive.push({ a: pair[0], b: pair[1], relation });
      continue;
    }
    if (relation.kind === 'requires') {
      requires.push({ a: a.index, b: b.index, relation });
      continue;
    }
    if (relation.kind === 'overlap') {
      // The share is of the `a` case's value, as declared. Deducted only when
      // BOTH are funded — a set that funds one of them claims nothing twice.
      overlap.push({ a: a.index, b: b.index, bp: relation.overlapBp, relation });
      continue;
    }
    excluded.push({ relation, why: 'unknown-kind' });
  }
  return { exclusive, requires, overlap, excluded };
}

/**
 * The exact objective of one selection, in scaled cents (cents × 10,000).
 *
 * `selection[i]` is 1, 0 or -1 (undecided). Deductions are applied per declared
 * relation, so two relations over the same pair each deduct their own declared
 * share — that is what was declared, and the register does not invent a merged
 * share for a pair.
 */
export function evaluateSelection(selection, candidates, relations) {
  let scaled = 0n;
  let weight = 0;
  for (const candidate of candidates) {
    if (selection[candidate.index] !== 1) continue;
    scaled += candidate.scaledValue;
    weight += candidate.weight;
  }
  let deductions = 0n;
  for (const rule of relations.overlap) {
    if (selection[rule.a] !== 1 || selection[rule.b] !== 1) continue;
    deductions += (candidates[rule.a].scaledValue * BigInt(rule.bp)) / 10000n;
  }
  return { scaled: scaled - deductions, weight, deductions };
}

/**
 * Is a partial assignment still feasible and still extendable? Checked DURING
 * the search, so an infeasible branch is abandoned where it first breaks rather
 * than at a leaf.
 */
function violates(assigned, relations, weight, ceiling) {
  if (weight > ceiling) return true;
  for (const rule of relations.exclusive) {
    if (assigned[rule.a] === 1 && assigned[rule.b] === 1) return true;
  }
  for (const rule of relations.requires) {
    // The dependent is decided IN while the thing it depends on is decided OUT.
    if (assigned[rule.a] === 1 && assigned[rule.b] === 0) return true;
  }
  return false;
}

/**
 * The same feasibility test on a FINAL selection, used by the rank-order plan and
 * by the test suite, so both plans are judged by exactly one rule.
 */
export function feasibleSelection(selection, candidates, relations, ceilingCents) {
  const { weight } = evaluateSelection(selection, candidates, relations);
  if (weight > ceilingCents) return { ok: false, why: 'over-ceiling', weight };
  for (const rule of relations.exclusive) {
    if (selection[rule.a] === 1 && selection[rule.b] === 1) return { ok: false, why: 'exclusive-pair-funded', weight };
  }
  for (const rule of relations.requires) {
    if (selection[rule.a] === 1 && selection[rule.b] !== 1) return { ok: false, why: 'dependent-funded-alone', weight };
  }
  return { ok: true, weight };
}

/**
 * The fractional (LP-relaxation) bound over `items` from position `from` with
 * `room` cents left, in SCALED cents as an exact rational.
 *
 * The relaxation of a 0/1 knapsack takes items in decreasing value per unit of
 * weight until one is cut — exactly optimal for the relaxation (Dantzig 1957) —
 * so its value is a valid upper bound on the integer problem, and it is the only
 * thing pruning is allowed to rely on. `items` must already be in density order.
 */
export function fractionalBound(items, room, from = 0) {
  let num = 0n;
  let den = 1n;
  let left = room;
  for (let i = from; i < items.length && left > 0; i += 1) {
    const item = items[i];
    // The relaxation never takes an item of non-positive value — you would simply
    // leave it. Including one would DEDUCT from the bound and make it under-state
    // what the branch can still achieve, which is the one thing a bound may never
    // do. Density order puts these last, so the bound ends here.
    if (item.scaledValue <= 0n) break;
    if (item.weight <= left) {
      num += item.scaledValue;
      left -= item.weight;
      continue;
    }
    // A fraction of this item fits: kept as a rational, never divided.
    num = num * BigInt(item.weight) + item.scaledValue * BigInt(left);
    den = den * BigInt(item.weight);
    left = 0;
  }
  return { num, den };
}

/** base + num/den > target, in exact integer arithmetic (den is always > 0). */
const aboveTarget = (base, bound, target) => (base - target) * bound.den + bound.num > 0n;

/**
 * Solve the selection problem exactly by depth-first branch and bound.
 *
 * Returns one of:
 *   { proved: true,  selection, valueCents, weightCents, ... }  — proven optimal
 *   { proved: false, reason, ... }                              — refused, NO set
 *
 * The refusal is the product. A plan nobody can prove is worse than no plan,
 * because it would be ratified as though it had been proven.
 */
export function solveFundedSet({ candidates, relations, ceilingCents, budget }) {
  const n = candidates.length;
  const prepared = relations || { exclusive: [], requires: [], overlap: [] };
  if (!n) {
    return {
      proved: true, selection: [], valueCents: 0, weightCents: 0, deductionsCents: 0,
      nodesExplored: 0, nodesPruned: 0, tooHeavy: [], scale: Number(SCALE),
    };
  }
  if (!Number.isSafeInteger(ceilingCents) || ceilingCents < 0) {
    return { proved: false, reason: 'The ceiling is not a whole non-negative number of cents.', nodesExplored: 0, nodesPruned: 0, tooHeavy: [] };
  }
  const ceiling = ceilingCents;
  const order = [...candidates].sort(densityCompare);

  // A candidate whose own weight breaks the ceiling can never be funded. It is
  // NOT dropped silently: it is reported as too heavy for this ceiling, because
  // a case quietly removed is indistinguishable from one that was considered.
  const admissible = order.filter((candidate) => candidate.weight <= ceiling);
  const tooHeavy = order.filter((candidate) => candidate.weight > ceiling);

  // A case whose own outlay exceeds the whole ceiling cannot be in ANY feasible
  // set. It is pinned OUT before the search rather than left undecided: an
  // undecided target of a `requires`, or an undecided half of an `exclusive`
  // pair, would slip past the violation test and be funded in a set that cannot
  // exist. This is a proof, not a heuristic — and the case is still REPORTED.
  const assigned = new Array(n).fill(-1);
  for (const candidate of tooHeavy) assigned[candidate.index] = 0;
  let best = null; // { scaled, assignment }
  let nodesExplored = 0;
  let nodesPruned = 0;

  const search = (pos, weight, scaled) => {
    if (!budget.take()) { budget.exhausted = true; return; }
    nodesExplored += 1;

    if (pos >= admissible.length) {
      // A wholly-decided admissible tail: the exact objective, deductions included.
      const exact = evaluateSelection(assigned, candidates, prepared);
      if (best === null || exact.scaled > best.scaled) {
        best = { scaled: exact.scaled, assignment: [...assigned] };
      }
      return;
    }
    const room = ceiling - weight;
    if (room > 0) {
      const bound = fractionalBound(admissible, room, pos);
      // Strict: a bound that merely TIES the incumbent is explored, because a
      // tie can hide a different set of equal value.
      if (best !== null && !aboveTarget(scaled, bound, best.scaled)) { nodesPruned += 1; return; }
    } else if (best !== null) {
      // No room left and nothing more can be added: this branch is closed.
      const exact = evaluateSelection(assigned, candidates, prepared);
      if (exact.scaled > best.scaled) best = { scaled: exact.scaled, assignment: [...assigned] };
      nodesPruned += 1;
      return;
    }

    const item = admissible[pos];
    // Branch 1: fund it.
    if (weight + item.weight <= ceiling) {
      assigned[item.index] = 1;
      if (!violates(assigned, prepared, weight + item.weight, ceiling)) {
        search(pos + 1, weight + item.weight, scaled + item.scaledValue);
      }
      assigned[item.index] = -1;
      if (budget.exhausted) return;
    }
    // Branch 2: do not fund it.
    assigned[item.index] = 0;
    if (!violates(assigned, prepared, weight, ceiling)) {
      search(pos + 1, weight, scaled);
    }
    assigned[item.index] = -1;
  };

  if (violates(assigned, prepared, 0, ceiling)) {
    // The declarations themselves admit no funded set at all (for example an
    // `exclusive` pair of which both are too heavy would not, but a `requires`
    // chain pinned out at the root does). That is a finding, not a plan.
    return {
      proved: true, selection: candidates.map(() => 0), valueCents: 0, weightCents: 0,
      deductionsCents: 0, nodesExplored: 0, nodesPruned: 0,
      tooHeavy: tooHeavy.map((candidate) => candidate.caseId),
      noFeasibleSet: true, scale: Number(SCALE),
    };
  }

  search(0, 0, 0n);

  if (budget.exhausted) {
    return {
      proved: false,
      reason: best === null
        ? 'The search exhausted its node budget before reaching a single feasible set. Nothing is printed.'
        : 'The search exhausted its node budget, so optimality was NOT proven. The best set found is deliberately not printed as a plan.',
      nodesExplored,
      nodesPruned,
      budgetExhausted: true,
      tooHeavy: tooHeavy.map((candidate) => candidate.caseId),
    };
  }

  const selection = candidates.map((candidate) => (best && best.assignment[candidate.index] === 1 ? 1 : 0));
  const finalValue = evaluateSelection(selection, candidates, prepared);
  return {
    proved: true,
    selection,
    valueCents: Number(finalValue.scaled / SCALE),
    weightCents: finalValue.weight,
    deductionsCents: Number(finalValue.deductions / SCALE),
    nodesExplored,
    nodesPruned,
    tooHeavy: tooHeavy.map((candidate) => candidate.caseId),
    scale: Number(SCALE),
  };
}

/**
 * The profitability-index plan under the SAME constraints — the shortcut this
 * workspace already shipped, solved as a plan so its shortfall can be measured.
 *
 * Greedy in descending value per cent, skipping anything that would breach the
 * ceiling or a declared relation. The optimal plan is solved by the same exact
 * search over the same candidates and constraints, so the difference between the
 * two printed values is attributable to the ORDER and to nothing else.
 */
export function solveRankOrder({ candidates, relations, ceilingCents }) {
  const prepared = relations || { exclusive: [], requires: [], overlap: [] };
  const order = [...candidates].sort(densityCompare);
  const selection = candidates.map(() => 0);
  let weight = 0;
  const skipped = [];
  for (const candidate of order) {
    if (weight + candidate.weight > ceilingCents) { skipped.push({ caseId: candidate.caseId, why: 'over-ceiling' }); continue; }
    selection[candidate.index] = 1;
    const feasible = feasibleSelection(selection, candidates, prepared, ceilingCents);
    if (!feasible.ok) {
      selection[candidate.index] = 0;
      skipped.push({ caseId: candidate.caseId, why: feasible.why });
      continue;
    }
    weight += candidate.weight;
  }
  const value = evaluateSelection(selection, candidates, prepared);
  return { selection, valueCents: Number(value.scaled / SCALE), weightCents: weight, skipped };
}

/**
 * The shadow price of the ceiling: the exact change in the proven-optimal value
 * when the ceiling is raised by one whole currency unit.
 *
 * A finite difference, not a derivative: the optimal value as a function of the
 * ceiling is a STEP function — it rises only when another cent lets a whole case
 * in — so a derivative would be meaningless on it. Zero is a real answer and is
 * printed as zero, because it means the ceiling is not binding.
 *
 * Returns null when either solve could not be proven: a price computed from an
 * unproven solve is not a price.
 */
export function shadowPrice({ candidates, relations, ceilingCents, budget, stepCents = SHADOW_STEP_CENTS }) {
  const base = solveFundedSet({ candidates, relations, ceilingCents, budget });
  if (!base.proved) return null;
  const raised = solveFundedSet({ candidates, relations, ceilingCents: ceilingCents + stepCents, budget });
  if (!raised.proved) return null;
  const deltaCents = raised.valueCents - base.valueCents;
  return {
    stepCents,
    deltaCents,
    // Return per unit of ceiling added, in whole basis points — directly
    // comparable with the hurdle rate each case was appraised at.
    shadowBp: stepCents > 0 ? Math.round((deltaCents * 10000) / stepCents) : null,
    baseValueCents: base.valueCents,
    raisedValueCents: raised.valueCents,
    raisedWeightCents: raised.weightCents,
    raisedSelectionDiffers: base.selection.some((value, index) => value !== raised.selection[index]),
  };
}

/** A deterministic signature for a funded set: its declared candidate ids, sorted. */
export function selectionSignature(caseIds) {
  const joined = [...(caseIds || [])].sort().join(',');
  let h1 = 0x811c9dc5;
  let h2 = 0x050c5d1f;
  for (let i = 0; i < joined.length; i += 1) {
    const code = joined.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= code;
    h2 = Math.imul(h2, 0x01000193) >>> 0;
    h2 = (h2 + 0x9e3779b9) >>> 0;
  }
  return `fnd1:${joined.length.toString(16)}:${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

/** The kernel's constants, exported so the Method card prints rather than paraphrases them. */
export const CAPITAL_RATIONING_MATH = Object.freeze({
  objectiveScale: Number(SCALE),
  objective: 'Σ v·x − Σ o·v·x·x over a common denominator of 10,000; every comparison in BigInt',
  bound: 'exact fractional knapsack (Dantzig 1957) over the undecided tail, compared by cross-multiplication',
  pruning: 'strict — a branch whose bound merely ties the incumbent is still explored',
  ties: 'declared candidate order, so a printed set is reproducible',
  shadowStep: `${SHADOW_STEP_CENTS} cents (one whole currency unit)`,
  optimality: 'claimed ONLY when the search closed its own gap; a budget-exhausted solve prints no set',
});
