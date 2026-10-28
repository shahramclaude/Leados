/**
 * app/core/domain/policyPortfolio.js — Structural Capital Allocation (Schema v38).
 *
 * Every leadership tool answers "what should I do?" by ranking a list. That is
 * the wrong question when the constraint is *your own attention*. A first-time
 * leader has a fixed number of effort-weeks and six structurally different ways
 * to spend them; the interesting question is which *combination* buys the most
 * system health per unit of effort, which part of the gain belongs to which
 * lever, and how wrong the answer would be if the model is wrong.
 *
 * This module is the allocation layer over the Operating System Dynamics Lab
 * (`dynamics.js`). It does not re-derive the system; it spends a budget inside
 * the model that is already derived from the leader's own records.
 *
 * Named frameworks, implemented rather than gestured at (Section 0.2 doctrine):
 *
 *  1. Capital budgeting under a single binding constraint (Bierman & Smidt,
 *     *The Capital Budgeting Decision*, 1966; Brealey, Myers & Allen): when one
 *     resource is scarce, rank by *marginal return on the constraint*, not by
 *     raw return. Here the constraint is implementation effort, measured in
 *     weeks, and every accepted increment is ranked by Δscore ÷ Δeffort.
 *
 *  2. Integer knapsack / budgeted allocation (Dantzig, 1957; Kellerer,
 *     Pferschy & Pisinger, *Knapsack Problems*, 2004). Levers move in discrete
 *     steps, so the problem is a bounded integer program. This module runs a
 *     deterministic greedy marginal-return allocation with a pairwise
 *     complementarity pass. It does **not** claim a proven global optimum, and
 *     the UI says so.
 *
 *  3. Multi-attribute utility instead of one score (Keeney & Raiffa, *Decisions
 *     with Multiple Objectives*, 1976; Pareto, 1906). Four outcomes are scored
 *     separately — pressure, throughput, capacity and work in progress — then
 *     combined with declared weights, and the raw deltas are always reported
 *     beside the composite. Weights are conventions the leader can see.
 *
 *  4. Shapley value attribution (Shapley, 1953; Roth, *The Shapley Value*,
 *     1988). The joint gain of a portfolio is not the sum of its parts. Exact
 *     Shapley values over all 2^n coalitions (n ≤ 6 levers, so exact is cheap)
 *     attribute the modelled gain to each lever, and pair interactions separate
 *     substitutes from complements (Bulow, Geanakoplos & Klemperer, 1985).
 *     This is attribution *inside a model*, not observed causality — the label
 *     says so everywhere it is shown.
 *
 *  5. Minimax regret under uncertainty (Savage, 1951; Luce & Raiffa, 1957).
 *     Parameter uncertainty is sampled with a seeded lognormal draw; regret is
 *     computed per draw against the best available option (including the
 *     playbook levers and doing nothing), and the robust choice is the one with
 *     the smallest worst-case regret. A plan that wins on average and loses
 *     catastrophically in the tail is reported as exactly that.
 *
 *  6. Validation before recommendation (Box, 1976 — "all models are wrong";
 *     the decision-quality literature's warning about optimizing an unvalidated
 *     model). LeadOS will compare portfolios on an unvalidated model, because a
 *     comparison can still teach you something. It will not call the result
 *     actionable. The trust ladder is explicit, and the module names the exact
 *     evidence that would move it up — including out-of-sample checkpoints
 *     scored against a frozen prediction (MASE-style skill against naive
 *     persistence; Hyndman & Koehler, 2006).
 *
 * Honesty boundaries enforced in code:
 *  - Effort costs are stated conventions, not measurements. They are labelled
 *    `assumed` and editable; the report never presents them as facts.
 *  - Missing money, missing baselines and missing observations stay missing.
 *    A checkpoint with no frozen baseline is `unscorable`, never scored as zero.
 *  - Out-of-sample scoring is counts-only below two independent checkpoints.
 *  - Nothing here ranks a person. The unit of allocation is a structural lever.
 *  - Pure module: no DOM, storage, network or ambient clock.
 */

import { addDays, dayKey } from '../time.js';
import {
  DYN_DEFAULT_HORIZON_WEEKS,
  DYN_LEVERS,
  DYN_MAX_HORIZON_WEEKS,
  DYN_MIN_HORIZON_WEEKS,
  DYN_PLAYBOOK,
  buildDynamicsReport,
  evaluatePolicy,
  mulberry32,
  simulate,
} from './dynamics.js';
import { LINK_ENTITY_TYPES, LINK_RELATIONS } from './cases.js';
import {
  CHECKPOINT_MIN_FOR_POOLED_SKILL,
  CHECKPOINT_STOCKS,
  pooledCheckpointSkill,
  scoreCheckpoint,
} from './checkpointScoring.js';

// The scoring primitives live in a dependency-free module so the schema
// normalizer can re-derive them without an import cycle. Re-exported here
// because this is where callers expect the checkpoint API to live.
export { CHECKPOINT_STOCKS, pooledCheckpointSkill, scoreCheckpoint };

export const CAP_ENGINE_VERSION = 'capital-allocation-2026.10-v1';

/** Ranks used by the trust ladder. Higher is stronger. */
export const CAP_TRUST_GRADES = Object.freeze({
  unvalidated: {
    rank: 0,
    label: 'Unvalidated',
    tone: 'bad',
    meaning: 'There is not enough dated history to score the model against anything. Portfolios can be compared, but the comparison is a way to ask better questions, not evidence.',
    recommendation: 'comparative',
  },
  refuted: {
    rank: 1,
    label: 'Refuted by its own tests',
    tone: 'bad',
    meaning: 'The model lost to “tomorrow equals today” on the workspace history, or its frozen predictions lost out of sample. Any allocation built on it is a hypothesis about structure, not a result.',
    recommendation: 'comparative',
  },
  provisional: {
    rank: 2,
    label: 'Provisional',
    tone: 'warn',
    meaning: 'The hindcast beats naive persistence, but too much of the model is still convention, or its predictions have not been graded out of sample. Directional at best.',
    recommendation: 'directional',
  },
  backtested: {
    rank: 3,
    label: 'Backtested',
    tone: 'info',
    meaning: 'The model beats naive persistence on your own history and most of its parameters are measured. Directionally usable; not yet graded against a frozen prediction.',
    recommendation: 'directional',
  },
  validated: {
    rank: 4,
    label: 'Out-of-sample validated',
    tone: 'good',
    meaning: 'The model beat persistence on history and its frozen predictions have repeatedly beaten persistence when the checkpoint arrived. This is the only grade that earns the word “actionable”.',
    recommendation: 'actionable',
  },
});

// Rule and signal prefixes follow the repository convention <MODULE>-NN. The
// capacity-and-flow module already owns RULE-CAP-01..06 and CAP-01..05, so the
// structural capital allocator uses SCA to keep both namespaces unambiguous:
// two rules sharing an id make the automation catalog and the signal
// deduplication silently wrong.
export const CAP_RULE_IDS = Object.freeze({
  COMMIT: 'RULE-SCA-01',
  CHECKPOINT: 'RULE-SCA-02',
  REBASELINE: 'RULE-SCA-03',
  LINEAGE: 'RULE-SCA-04',
});

export const CAP_RULES = Object.freeze([
  {
    id: CAP_RULE_IDS.COMMIT,
    name: 'Adopted portfolio → one DACI commitment decision',
    framework: 'Bierman & Smidt (1966) capital budgeting; Keeney & Raiffa (1976) multi-attribute utility',
    trigger: 'capital.policy.adopted',
    targetModule: 'decisions',
    description: 'Opens exactly one idempotent DACI decision to commit the portfolio, listing the Shapley-attributed levers as options and carrying the model trust grade in the question so the approver sees how much the comparison is worth. Decision Tempo prices the timing position in the same transaction. Nothing is implemented automatically.',
  },
  {
    id: CAP_RULE_IDS.CHECKPOINT,
    name: 'Adopted portfolio → one owned out-of-sample checkpoint',
    framework: 'Popper-style falsification; pre-registered expectations (Impact Ledger convention)',
    trigger: 'capital.policy.adopted',
    targetModule: 'delegations',
    description: 'Freezes the predicted end-state and the do-nothing baseline at adoption, then opens exactly one owned delegation to record the realised stocks on the checkpoint date. The frozen baseline is what lets the later score be a skill score rather than a memory test.',
  },
  {
    id: CAP_RULE_IDS.REBASELINE,
    name: 'Out-of-sample failure → one re-baselining decision',
    framework: 'Box (1976) model criticism; Hyndman & Koehler (2006) MASE skill',
    trigger: 'dynamics.checkpoint.recorded',
    targetModule: 'decisions',
    description: 'When at least two independent checkpoints have been scored and their pooled out-of-sample skill is not positive, opens one DACI decision to re-measure the parameters, shorten the horizon, or stop relying on the model. The model is not silently retuned.',
  },
  {
    id: CAP_RULE_IDS.LINEAGE,
    name: 'Checkpoint → typed scoring lineage',
    framework: 'Audit lineage; append-only evidence',
    trigger: 'dynamics.checkpoint.recorded',
    targetModule: 'links',
    description: 'Appends an idempotent typed edge from the checkpoint to the policy or experiment it grades, so the evidence chain survives reload, export and the leader’s memory.',
  },
]);

/**
 * The effort book. Every number here is a **convention** — the leader's own
 * estimate of implementation effort per unit of lever, not a measurement the
 * app can derive. It is deliberately visible, centralised and labelled.
 */
export const CAP_EFFORT_BOOK = Object.freeze({
  hirePerWeek: {
    effortPerUnit: 1.6,
    unit: 'weeks of recruiting and onboarding effort per person-day/week added',
    basis: 'assumed',
    note: 'Recruiting, interviewing and the senior hours spent ramping a joiner.',
  },
  wipCapPct: {
    effortPerUnit: 0.07,
    unit: 'weeks per point of intake refused',
    basis: 'assumed',
    note: 'The negotiation cost of saying no, per point of committed intake deferred.',
  },
  scopeCutPct: {
    effortPerUnit: 0.05,
    unit: 'weeks per point of committed scope removed',
    basis: 'assumed',
    note: 'Renegotiating an existing commitment is cheaper than preventing a new one.',
  },
  reworkInvestment: {
    effortPerUnit: 7,
    unit: 'weeks per 100% of repair capacity redirected to prevention',
    basis: 'assumed',
    note: 'Setting up prevention work and defending it while incidents still land.',
  },
  delegationShare: {
    effortPerUnit: 5,
    unit: 'weeks per 100% of routing moved off the constraint',
    basis: 'assumed',
    note: 'Teaching substitution, writing it down and holding the line under pressure.',
  },
  learningShare: {
    effortPerUnit: 9,
    unit: 'weeks per 100% of capacity protected for learning',
    basis: 'assumed',
    note: 'Designing the ritual, protecting it and renegotiating delivery around it.',
  },
});

export const CAP_DEFAULT_BUDGET_UNITS = 12;
export const CAP_MIN_BUDGET_UNITS = 1;
export const CAP_MAX_BUDGET_UNITS = 40;

/** Convention weights for the composite. Editable per policy; reported raw. */
export const CAP_OBJECTIVE_WEIGHTS = Object.freeze({
  saturation: 0.35,
  throughput: 0.25,
  capacity: 0.2,
  wip: 0.2,
});

export const CAP_OBJECTIVE_LABELS = Object.freeze({
  saturation: 'Perceived pressure (lower is better)',
  throughput: 'Cumulative throughput (higher is better)',
  capacity: 'Delivery capacity (higher is better)',
  wip: 'Work in progress (lower is better)',
});

/** Parameter-convention share above which the model cannot be called actionable. */
export const CAP_ASSUMED_WARN_PCT = 40;
export const CAP_OOS_SKILL_FLOOR = 0;
export const CAP_SUBSTITUTE_POINTS = -0.5;
export const CAP_COMPLEMENT_POINTS = 0.5;
export const CAP_ROBUSTNESS_DRAWS = 32;
export const CAP_ROBUSTNESS_CV = 0.25;
export const CAP_ROBUSTNESS_SEED = 42;

export const CAP_LINK_ENTITY = 'capital';
export const CAP_CHECKPOINT_ENTITY = 'checkpoint';
export const CAP_LINK_RELATIONS = Object.freeze(['allocates', 'scores']);

/* ------------------------------------------------------------ helpers */

const EPS = 1e-9;

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampText(value, max) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function gaussian(rand) {
  // Box–Muller, matching the dynamics Monte Carlo's distribution family.
  let u = 0;
  let v = 0;
  while (u <= 0) u = rand();
  while (v <= 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function leverByKey(key) {
  return DYN_LEVERS.find((lever) => lever.key === key) || null;
}

function defaults() {
  return Object.fromEntries(DYN_LEVERS.map((lever) => [lever.key, lever.default]));
}

function normalizeWeights(raw) {
  const weights = {};
  let total = 0;
  for (const key of Object.keys(CAP_OBJECTIVE_WEIGHTS)) {
    const value = clamp(num(raw?.[key], CAP_OBJECTIVE_WEIGHTS[key]), 0, 1);
    weights[key] = value;
    total += value;
  }
  if (total <= EPS) return { ...CAP_OBJECTIVE_WEIGHTS };
  const out = {};
  for (const key of Object.keys(weights)) out[key] = round2((weights[key] / total) * 100) / 100;
  return out;
}

function baselineSummary(model, weeks) {
  return simulate(model.stocks, model.params, {}, { weeks }).summary;
}

/* ------------------------------------------------- objective function */

/**
 * Score one simulated end-state against the do-nothing baseline.
 *
 * Each of the four outcomes is first expressed as a *relative* gain (so a
 * person-day means the same thing in a five-person team and a fifty-person
 * one), clamped to ±1 so no single metric can own the composite, and only then
 * weighted. The raw deltas are returned alongside, because a leader is entitled
 * to disagree with the weights and needs the numbers to do it.
 */
export function objectiveScore(baseline, scenario, weights = CAP_OBJECTIVE_WEIGHTS) {
  const w = normalizeWeights(weights);
  const satDenom = Math.max(20, Math.abs(num(baseline?.endSaturationPct, 100)));
  const thrDenom = Math.max(20, Math.abs(num(baseline?.cumulativeThroughputDays, 100)));
  const capDenom = Math.max(1, Math.abs(num(baseline?.endCapacityPerWeek, 10)));
  const wipDenom = Math.max(1, Math.abs(num(baseline?.endWipDays, 10)));
  const gains = {
    saturation: clamp((num(baseline?.endSaturationPct, 0) - num(scenario?.endSaturationPct, 0)) / satDenom, -1, 1),
    throughput: clamp((num(scenario?.cumulativeThroughputDays, 0) - num(baseline?.cumulativeThroughputDays, 0)) / thrDenom, -1, 1),
    capacity: clamp((num(scenario?.endCapacityPerWeek, 0) - num(baseline?.endCapacityPerWeek, 0)) / capDenom, -1, 1),
    wip: clamp((num(baseline?.endWipDays, 0) - num(scenario?.endWipDays, 0)) / wipDenom, -1, 1),
  };
  const parts = {};
  let score = 0;
  for (const key of Object.keys(gains)) {
    parts[key] = round2(gains[key] * 100);
    score += w[key] * gains[key] * 100;
  }
  return {
    score: round2(score),
    parts,
    weights: w,
    raw: {
      saturationPct: round2(num(scenario?.endSaturationPct, 0) - num(baseline?.endSaturationPct, 0)),
      wipDays: round2(num(scenario?.endWipDays, 0) - num(baseline?.endWipDays, 0)),
      capacityPerWeek: round2(num(scenario?.endCapacityPerWeek, 0) - num(baseline?.endCapacityPerWeek, 0)),
      throughputDays: round2(num(scenario?.cumulativeThroughputDays, 0) - num(baseline?.cumulativeThroughputDays, 0)),
      dependencyPct: round2(num(scenario?.endDependencyPct, 0) - num(baseline?.endDependencyPct, 0)),
    },
  };
}

/** Total implementation effort of a lever vector, in effort-weeks. */
export function effortOf(levers = {}, book = CAP_EFFORT_BOOK) {
  const rows = [];
  let total = 0;
  for (const lever of DYN_LEVERS) {
    const value = clamp(num(levers?.[lever.key], lever.default), lever.min, lever.max);
    const entry = book?.[lever.key] || CAP_EFFORT_BOOK[lever.key];
    const effort = value * entry.effortPerUnit;
    total += effort;
    if (value > 0) {
      rows.push({
        key: lever.key,
        label: lever.label,
        value: round2(value),
        unit: lever.unit,
        effort: round2(effort),
        basis: entry.basis,
        costNote: entry.note,
        leverageClass: lever.leverageClass,
        leverageLabel: lever.leverageLabel,
      });
    }
  }
  return { total: round2(total), rows: rows.sort((a, b) => b.effort - a.effort || a.key.localeCompare(b.key)) };
}

/* ------------------------------------------------------------ allocation */

/**
 * Deterministic budgeted allocation: greedy marginal return on the binding
 * constraint, then one pairwise complementarity pass.
 *
 * The path is also the efficient frontier: every accepted increment has a
 * measured effort and a measured score, so the leader can see what the next
 * effort-week would have bought. No global-optimum claim is made anywhere.
 */
export function allocate(model, {
  budget = CAP_DEFAULT_BUDGET_UNITS,
  weights = CAP_OBJECTIVE_WEIGHTS,
  book = CAP_EFFORT_BOOK,
  weeks = DYN_DEFAULT_HORIZON_WEEKS,
} = {}) {
  const horizon = clamp(Math.round(num(weeks, DYN_DEFAULT_HORIZON_WEEKS)), DYN_MIN_HORIZON_WEEKS, DYN_MAX_HORIZON_WEEKS);
  const cap = clamp(num(budget, CAP_DEFAULT_BUDGET_UNITS), 0, CAP_MAX_BUDGET_UNITS);
  const base = baselineSummary(model, horizon);
  const levers = defaults();
  let remaining = cap;
  let score = 0;
  const steps = [];
  const scoreFor = (candidate) => objectiveScore(base, simulate(model.stocks, model.params, candidate, { weeks: horizon }).summary, weights).score;
  let guard = 0;
  let complementPasses = 0;

  const apply = (key, to, effort, gain, kind) => {
    levers[key] = round2(to);
    remaining = round2(Math.max(0, remaining - effort));
    score = round2(score + gain);
    steps.push({
      key,
      label: leverByKey(key)?.label || key,
      from: round2(to - (leverByKey(key)?.step || 0)),
      to: round2(to),
      effort: round2(effort),
      gain: round2(gain),
      scoreAfter: score,
      remaining: remaining,
      kind,
    });
  };

  while (guard < 240) {
    guard += 1;
    let best = null;
    for (const lever of DYN_LEVERS) {
      const current = levers[lever.key];
      const next = Math.min(lever.max, round2(current + lever.step));
      if (next <= current + EPS) continue;
      const entry = book?.[lever.key] || CAP_EFFORT_BOOK[lever.key];
      const cost = (next - current) * entry.effortPerUnit;
      if (cost > remaining + 1e-6 || cost <= EPS) continue;
      const candidate = { ...levers, [lever.key]: next };
      const candidateScore = scoreFor(candidate);
      const gain = round2(candidateScore - score);
      if (gain <= 0.01) continue;
      const ratio = gain / cost;
      if (!best
        || ratio > best.ratio + 1e-9
        || (Math.abs(ratio - best.ratio) <= 1e-9 && gain > best.gain + 1e-9)
        || (Math.abs(ratio - best.ratio) <= 1e-9 && Math.abs(gain - best.gain) <= 1e-9
          && lever.leverageClass > best.leverageClass)
        || (Math.abs(ratio - best.ratio) <= 1e-9 && Math.abs(gain - best.gain) <= 1e-9
          && lever.leverageClass === best.leverageClass && lever.key > best.key)) {
        best = { key: lever.key, next, cost, gain, ratio, leverageClass: lever.leverageClass };
      }
    }
    if (best) {
      apply(best.key, best.next, best.cost, best.gain, 'marginal');
      continue;
    }
    if (complementPasses >= 2) break;
    // No single step pays. Two levers that only pay together are complements
    // (Bulow–Geanakoplos–Klemperer); test them explicitly before stopping.
    complementPasses += 1;
    let pair = null;
    const singles = DYN_LEVERS
      .map((lever) => ({ lever, next: Math.min(lever.max, round2(levers[lever.key] + lever.step)) }))
      .filter((entry) => entry.next > levers[entry.lever.key] + EPS);
    for (let i = 0; i < singles.length; i += 1) {
      for (let j = i + 1; j < singles.length; j += 1) {
        const a = singles[i];
        const b = singles[j];
        const costA = (a.next - levers[a.lever.key]) * (book?.[a.lever.key] || CAP_EFFORT_BOOK[a.lever.key]).effortPerUnit;
        const costB = (b.next - levers[b.lever.key]) * (book?.[b.lever.key] || CAP_EFFORT_BOOK[b.lever.key]).effortPerUnit;
        const cost = costA + costB;
        if (cost > remaining + 1e-6) continue;
        const candidate = { ...levers, [a.lever.key]: a.next, [b.lever.key]: b.next };
        const gain = round2(scoreFor(candidate) - score);
        if (gain <= 0.01) continue;
        if (!pair || gain / cost > pair.ratio + 1e-9) {
          pair = { a, b, gain, cost, ratio: gain / cost };
        }
      }
    }
    if (!pair) break;
    // The pair's gain is recorded once, on the first leg; the second leg moves
    // for bookkeeping without double-counting the same score.
    const costA = (pair.a.next - levers[pair.a.lever.key])
      * (book?.[pair.a.lever.key] || CAP_EFFORT_BOOK[pair.a.lever.key]).effortPerUnit;
    const costB = (pair.b.next - levers[pair.b.lever.key])
      * (book?.[pair.b.lever.key] || CAP_EFFORT_BOOK[pair.b.lever.key]).effortPerUnit;
    const fromA = levers[pair.a.lever.key];
    const fromB = levers[pair.b.lever.key];
    levers[pair.a.lever.key] = round2(pair.a.next);
    levers[pair.b.lever.key] = round2(pair.b.next);
    remaining = round2(Math.max(0, remaining - costA - costB));
    score = round2(score + pair.gain);
    steps.push({
      key: pair.a.lever.key,
      label: leverByKey(pair.a.lever.key)?.label || pair.a.lever.key,
      from: round2(fromA),
      to: round2(pair.a.next),
      effort: round2(costA + costB),
      gain: pair.gain,
      scoreAfter: score,
      remaining,
      kind: 'complement',
      pairWith: pair.b.lever.key,
    });
  }

  const effort = effortOf(levers, book);
  return {
    levers,
    budget: round2(cap),
    remaining: round2(Math.max(0, cap - effort.total)),
    effort: effort.total,
    effortRows: effort.rows,
    score: round2(score),
    steps,
    path: frontierFrom(steps, cap),
    note: 'Greedy marginal-return allocation with a pairwise complementarity pass. This is a good feasible portfolio, not a proven global optimum.',
  };
}

/** Turn the accepted path into an efficient-frontier curve (score vs effort). */
export function frontierFrom(steps = [], budget = CAP_DEFAULT_BUDGET_UNITS) {
  const points = [{ effort: 0, score: 0 }];
  for (const step of steps) {
    const previous = points[points.length - 1];
    points.push({ effort: round2(previous.effort + step.effort), score: round2(step.scoreAfter) });
  }
  // Pareto: keep only points that are not dominated on both effort and score.
  const efficient = [];
  for (const point of points) {
    const dominated = points.some((other) => other !== point
      && other.effort <= point.effort + EPS && other.score >= point.score - EPS
      && (other.effort < point.effort - EPS || other.score > point.score + EPS));
    if (!dominated) efficient.push(point);
  }
  efficient.sort((a, b) => a.effort - b.effort || a.score - b.score);
  return { points: efficient, budget: round2(budget), exhausted: points[points.length - 1]?.effort >= budget - EPS };
}

/* ------------------------------------------------------------ attribution */

/**
 * Exact Shapley attribution of the joint modelled gain.
 *
 * v(S) is the composite score of the coalition's levers alone (no budget
 * constraint). With at most six levers, all 2^n coalitions are enumerated, so
 * the value is exact for this game — not sampled. The efficiency identity
 * Σφᵢ = v(N) − v(∅) is computed and returned so the UI can show that the shares
 * add up instead of asking the reader to trust them.
 */
export function shapleyAttribution(model, levers = {}, {
  weights = CAP_OBJECTIVE_WEIGHTS,
  weeks = DYN_DEFAULT_HORIZON_WEEKS,
} = {}) {
  const horizon = clamp(Math.round(num(weeks, DYN_DEFAULT_HORIZON_WEEKS)), DYN_MIN_HORIZON_WEEKS, DYN_MAX_HORIZON_WEEKS);
  const base = baselineSummary(model, horizon);
  const players = DYN_LEVERS.filter((lever) => num(levers?.[lever.key], 0) > 0);
  const n = players.length;
  if (!n) {
    return {
      method: 'exact-shapley',
      players: [],
      contributions: [],
      coalitions: 0,
      total: 0,
      efficiencyGap: 0,
      note: 'No lever is funded, so there is no gain to attribute.',
    };
  }
  const scoreOf = (mask) => {
    const candidate = defaults();
    players.forEach((lever, index) => {
      if (mask & (1 << index)) candidate[lever.key] = clamp(num(levers[lever.key], 0), lever.min, lever.max);
    });
    return objectiveScore(base, simulate(model.stocks, model.params, candidate, { weeks: horizon }).summary, weights).score;
  };
  const total = 1 << n;
  const values = new Array(total);
  for (let mask = 0; mask < total; mask += 1) values[mask] = scoreOf(mask);
  const fact = [1];
  for (let i = 1; i <= n; i += 1) fact[i] = fact[i - 1] * i;
  const rawPhis = [];
  const contributions = players.map((lever, index) => {
    let phi = 0;
    for (let mask = 0; mask < total; mask += 1) {
      if (mask & (1 << index)) continue;
      const size = popcount(mask);
      const weight = (fact[size] * fact[n - size - 1]) / fact[n];
      phi += weight * (values[mask | (1 << index)] - values[mask]);
    }
    rawPhis.push(phi);
    return {
      key: lever.key,
      label: lever.label,
      value: round2(num(levers[lever.key], 0)),
      leverageClass: lever.leverageClass,
      leverageLabel: lever.leverageLabel,
      marginal: round2(phi),
    };
  });
  // Round only for display. The efficiency identity is checked against the raw
  // values, because summing rounded contributions produces a spurious gap and
  // an attribution that appears not to add up is worse than no attribution.
  const rawTotal = rawPhis.reduce((sum, phi) => sum + phi, 0);
  const attributedTotal = round2(rawTotal);
  for (const row of contributions) {
    row.sharePct = Math.abs(rawTotal) > EPS ? Math.round((row.marginal / rawTotal) * 1000) / 10 : null;
  }
  contributions.sort((a, b) => b.marginal - a.marginal || a.key.localeCompare(b.key));
  return {
    method: 'exact-shapley',
    players: players.map((lever) => lever.key),
    contributions,
    coalitions: total,
    total: round2(values[total - 1]),
    aloneSum: round2(players.reduce((sum, lever, index) => sum + values[1 << index], 0)),
    attributedTotal,
    efficiencyGap: Math.abs(rawTotal - values[total - 1]) < 0.005 ? 0 : round2(rawTotal - values[total - 1]),
    note: 'Exact Shapley values over every coalition of the funded levers. This attributes gain *inside the model*; it is not observed causality.',
  };
}

function popcount(mask) {
  let count = 0;
  let value = mask;
  while (value) {
    value &= value - 1;
    count += 1;
  }
  return count;
}

/**
 * Pair interactions: negative means the two levers are substitutes (each is
 * worth less because the other is present), positive means complements.
 */
export function pairInteractions(model, levers = {}, {
  weights = CAP_OBJECTIVE_WEIGHTS,
  weeks = DYN_DEFAULT_HORIZON_WEEKS,
} = {}) {
  const horizon = clamp(Math.round(num(weeks, DYN_DEFAULT_HORIZON_WEEKS)), DYN_MIN_HORIZON_WEEKS, DYN_MAX_HORIZON_WEEKS);
  const base = baselineSummary(model, horizon);
  const funded = DYN_LEVERS.filter((lever) => num(levers?.[lever.key], 0) > 0);
  if (funded.length < 2) return { pairs: [], note: 'Two levers are needed before substitutability can be measured.' };
  const scoreOf = (spec) => {
    const candidate = defaults();
    for (const [key, value] of Object.entries(spec)) candidate[key] = value;
    return objectiveScore(base, simulate(model.stocks, model.params, candidate, { weeks: horizon }).summary, weights).score;
  };
  const pairs = [];
  for (let i = 0; i < funded.length; i += 1) {
    for (let j = i + 1; j < funded.length; j += 1) {
      const a = funded[i];
      const b = funded[j];
      const av = clamp(num(levers[a.key], 0), a.min, a.max);
      const bv = clamp(num(levers[b.key], 0), b.min, b.max);
      const soloA = scoreOf({ [a.key]: av });
      const soloB = scoreOf({ [b.key]: bv });
      const joint = scoreOf({ [a.key]: av, [b.key]: bv });
      const interaction = round2(joint - soloA - soloB);
      pairs.push({
        a: a.key,
        aLabel: a.label,
        b: b.key,
        bLabel: b.label,
        soloA: round2(soloA),
        soloB: round2(soloB),
        joint: round2(joint),
        interaction,
        kind: interaction <= CAP_SUBSTITUTE_POINTS ? 'substitute'
          : interaction >= CAP_COMPLEMENT_POINTS ? 'complement' : 'additive',
      });
    }
  }
  pairs.sort((a, b) => Math.abs(b.interaction) - Math.abs(a.interaction) || a.a.localeCompare(b.a));
  return {
    pairs,
    substitutes: pairs.filter((p) => p.kind === 'substitute'),
    complements: pairs.filter((p) => p.kind === 'complement'),
    note: 'Interaction = joint gain − the two gains measured separately. Negative means the levers compete for the same constrained resource.',
  };
}

/* ------------------------------------------------------------ robustness */

/**
 * Seeded parameter uncertainty with Savage minimax regret.
 *
 * Options are the allocated portfolio, each named playbook, and doing nothing.
 * Regret is measured per draw against the best score available in that draw, so
 * a plan that is merely average in every world is distinguishable from a plan
 * that is brilliant in one world and ruinous in another.
 */
export function robustness(model, levers = {}, {
  weeks = DYN_DEFAULT_HORIZON_WEEKS,
  draws = CAP_ROBUSTNESS_DRAWS,
  seed = CAP_ROBUSTNESS_SEED,
  cv = CAP_ROBUSTNESS_CV,
  weights = CAP_OBJECTIVE_WEIGHTS,
  playbooks = DYN_PLAYBOOK,
  book = CAP_EFFORT_BOOK,
} = {}) {
  const horizon = clamp(Math.round(num(weeks, DYN_DEFAULT_HORIZON_WEEKS)), DYN_MIN_HORIZON_WEEKS, DYN_MAX_HORIZON_WEEKS);
  const trials = clamp(Math.round(num(draws, CAP_ROBUSTNESS_DRAWS)), 4, 200);
  const rand = mulberry32(seed);
  const keys = ['growthRate', 'overloadAttrition', 'reworkGenRate', 'onboardingDragPd', 'dependencyRouting', 'pressureLagWeeks'];
  const options = [
    { key: 'portfolio', label: 'Allocated portfolio', levers: { ...defaults(), ...levers }, kind: 'portfolio' },
    ...playbooks.map((playbook) => ({
      key: playbook.key,
      label: playbook.name,
      levers: { ...defaults(), ...playbook.levers },
      kind: 'playbook',
    })),
    { key: 'do-nothing', label: 'Do nothing', levers: defaults(), kind: 'baseline' },
  ];
  const scores = options.map(() => []);
  const regrets = options.map(() => []);
  for (let t = 0; t < trials; t += 1) {
    const params = { ...model.params };
    for (const key of keys) {
      const base = Math.max(1e-9, Math.abs(num(params[key], 1e-9)));
      params[key] = base * Math.exp(gaussian(rand) * cv - (cv * cv) / 2);
    }
    const baseSummary = simulate(model.stocks, params, {}, { weeks: horizon }).summary;
    const drawScores = options.map((option) => objectiveScore(
      baseSummary,
      simulate(model.stocks, params, option.levers, { weeks: horizon }).summary,
      weights,
    ).score);
    const best = Math.max(...drawScores);
    drawScores.forEach((score, index) => {
      scores[index].push(score);
      regrets[index].push(round2(best - score));
    });
  }
  const rows = options.map((option, index) => {
    const sorted = [...scores[index]].sort((a, b) => a - b);
    const effort = effortOf(option.levers, book).total;
    return {
      key: option.key,
      label: option.label,
      kind: option.kind,
      levers: option.levers,
      effort,
      meanScore: round2(scores[index].reduce((sum, s) => sum + s, 0) / scores[index].length),
      p10: round2(sorted[Math.floor(sorted.length * 0.1)]),
      p90: round2(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))]),
      maxRegret: round2(Math.max(...regrets[index])),
      meanRegret: round2(regrets[index].reduce((sum, r) => sum + r, 0) / regrets[index].length),
      effortPerPoint: effort > EPS
        ? round2(effort / Math.max(0.01, scores[index].reduce((sum, score) => sum + score, 0) / scores[index].length))
        : null,
    };
  });
  // Win rate must be counted per draw, not by index lookup.
  const winCounts = options.map(() => 0);
  for (let t = 0; t < trials; t += 1) {
    const drawScores = options.map((option, index) => scores[index][t] ?? 0);
    const best = Math.max(...drawScores);
    drawScores.forEach((score, index) => {
      if (score >= best - 1e-9) winCounts[index] += 1;
    });
  }
  rows.forEach((row, index) => {
    row.winRatePct = Math.round((winCounts[index] / trials) * 1000) / 10;
  });
  const rankedByRegret = [...rows].sort((a, b) => a.maxRegret - b.maxRegret || b.meanScore - a.meanScore || a.key.localeCompare(b.key));
  const minimax = rankedByRegret[0];
  const portfolioRow = rows[0];
  return {
    draws: trials,
    seed,
    cv,
    assumedKeys: keys,
    options: rows,
    minimax: { key: minimax.key, label: minimax.label, maxRegret: minimax.maxRegret },
    portfolio: {
      label: portfolioRow.label,
      meanScore: portfolioRow.meanScore,
      p10: portfolioRow.p10,
      p90: portfolioRow.p90,
      maxRegret: portfolioRow.maxRegret,
      meanRegret: portfolioRow.meanRegret,
      winRatePct: portfolioRow.winRatePct,
      regretRank: rankedByRegret.findIndex((row) => row.key === 'portfolio') + 1,
      isMinimax: minimax.key === 'portfolio',
      beatsDoNothingPct: portfolioRow.winRatePct,
    },
    note: `Seeded ${seed} lognormal parameter draws (CV ${cv}) on ${keys.length} structural coefficients. Regret is measured against the best option in each draw. This is sensitivity to the model's assumptions, not a probability of the future.`,
  };
}

/* ------------------------------------------------------------ checkpoints */

/**
 * Checkpoint scoring and pooling live in `checkpointScoring.js` (dependency-
 * free so the schema can re-derive a stored score on load). The constant below
 * is the same threshold that module enforces, re-stated here for the trust
 * ladder so the two cannot silently diverge.
 */
export const CAP_MIN_OOS_CHECKPOINTS = CHECKPOINT_MIN_FOR_POOLED_SKILL;

/* ------------------------------------------------------------ trust */

/**
 * The trust ladder. A recommendation is only "actionable" when the model has
 * been graded out of sample; everything else is labelled directional or
 * comparative, and the blockers name the exact evidence that would promote it.
 */
export function modelTrust(report, checkpoints = []) {
  const calibration = report?.calibration || null;
  const provenance = report?.provenance || { assumedPct: 100, measured: 0, estimated: 0, assumed: 0 };
  const oos = pooledCheckpointSkill(checkpoints);
  const skill = Number.isFinite(num(calibration?.skill, NaN)) ? round2(calibration.skill) : null;
  const hindcast = {
    status: calibration?.status || 'insufficient',
    skill,
    mase: Number.isFinite(num(calibration?.mase, NaN)) ? round2(calibration.mase) : null,
    rmse: Number.isFinite(num(calibration?.rmse, NaN)) ? round2(calibration.rmse) : null,
    naiveRmse: Number.isFinite(num(calibration?.naiveRmse, NaN)) ? round2(calibration.naiveRmse) : null,
    horizonWeeks: calibration?.horizonWeeks ?? null,
    reason: calibration?.reason || null,
  };
  let grade = 'unvalidated';
  if (hindcast.skill === null) {
    grade = 'unvalidated';
  } else if (hindcast.skill <= CAP_OOS_SKILL_FLOOR) {
    grade = 'refuted';
  } else if (provenance.assumedPct >= CAP_ASSUMED_WARN_PCT) {
    grade = 'provisional';
  } else if (oos.n < CAP_MIN_OOS_CHECKPOINTS || oos.skill === null) {
    grade = 'backtested';
  } else if (oos.skill > 0) {
    grade = 'validated';
  } else {
    grade = 'refuted';
  }
  const meta = CAP_TRUST_GRADES[grade] || CAP_TRUST_GRADES.unvalidated;
  const blockers = [];
  if (hindcast.skill === null) {
    blockers.push(calibration?.reason
      ? `Hindcast unavailable: ${calibration.reason}`
      : 'Not enough dated completions to hindcast the model.');
  } else if (hindcast.skill <= 0) {
    blockers.push(`Hindcast skill ${hindcast.skill} — the model did not beat “tomorrow equals today” on your own history.`);
  }
  if (provenance.assumedPct >= CAP_ASSUMED_WARN_PCT) {
    blockers.push(`${provenance.assumedPct}% of parameters are conventions (measured ${provenance.measured}, estimated ${provenance.estimated}, assumed ${provenance.assumed}). Record delivery actuals, incident reserves and departures to convert them.`);
  }
  if (oos.n < CAP_MIN_OOS_CHECKPOINTS) {
    blockers.push(`Record ${CAP_MIN_OOS_CHECKPOINTS - oos.n} more independently dated out-of-sample checkpoint${CAP_MIN_OOS_CHECKPOINTS - oos.n === 1 ? '' : 's'}.`);
  } else if (oos.skill !== null && oos.skill <= 0) {
    blockers.push(`Pooled out-of-sample skill ${oos.skill} across ${oos.n} checkpoints — the frozen predictions lost to persistence.`);
  }
  return {
    grade,
    rank: meta.rank,
    label: meta.label,
    tone: meta.tone,
    meaning: meta.meaning,
    recommendation: meta.recommendation,
    actionable: meta.rank >= CAP_TRUST_GRADES.backtested.rank,
    hindcast,
    outOfSample: oos,
    assumptions: {
      pct: provenance.assumedPct,
      measured: provenance.measured,
      estimated: provenance.estimated,
      assumed: provenance.assumed,
    },
    blockers,
  };
}

/* ------------------------------------------------------------ payloads */

export function normalizeCapitalPolicyPayload(data = {}) {
  const name = clampText(data.name, 140);
  const hypothesis = clampText(data.hypothesis, 600);
  if (name.length < 3) return { ok: false, error: 'Name the portfolio in at least 3 characters.', field: 'name' };
  if (hypothesis.length < 10) return { ok: false, error: 'Write the expectation in at least 10 characters — a portfolio nobody can contradict is not a plan.', field: 'hypothesis' };
  const levers = {};
  let touched = 0;
  for (const lever of DYN_LEVERS) {
    const value = clamp(num(data.levers?.[lever.key], lever.default), lever.min, lever.max);
    levers[lever.key] = Math.round(value * 1000) / 1000;
    if (levers[lever.key] > 0) touched += 1;
  }
  if (!touched) return { ok: false, error: 'Fund at least one lever — a portfolio that spends nothing changes nothing.', field: 'levers' };
  const budgetUnits = clamp(round2(num(data.budgetUnits, CAP_DEFAULT_BUDGET_UNITS)), CAP_MIN_BUDGET_UNITS, CAP_MAX_BUDGET_UNITS);
  const weights = normalizeWeights(data.weights);
  const ownerId = data.ownerId ? String(data.ownerId) : null;
  const checkpointOn = data.checkpointOn ? String(data.checkpointOn).slice(0, 10) : null;
  return {
    ok: true,
    value: {
      name,
      hypothesis,
      levers,
      budgetUnits,
      weights,
      ownerId,
      checkpointOn,
      horizonWeeks: clamp(Math.round(num(data.horizonWeeks, DYN_DEFAULT_HORIZON_WEEKS)), DYN_MIN_HORIZON_WEEKS, DYN_MAX_HORIZON_WEEKS),
      notes: clampText(data.notes, 1200),
    },
  };
}

export function normalizeDynamicsCheckpointPayload(data = {}) {
  const subjectType = data.subjectType === 'experiment' ? 'experiment' : data.subjectType === 'policy' ? 'policy' : null;
  if (!subjectType) return { ok: false, error: 'A checkpoint must grade a portfolio or an experiment.', field: 'subjectType' };
  const subjectId = clampText(data.subjectId, 80);
  if (!subjectId) return { ok: false, error: 'Choose what this checkpoint grades.', field: 'subjectId' };
  const recordedOn = String(data.recordedOn || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(recordedOn)) return { ok: false, error: 'Choose the date the observations were taken.', field: 'recordedOn' };
  const observed = {};
  let recorded = 0;
  for (const stock of CHECKPOINT_STOCKS) {
    const raw = data.observed?.[stock.key];
    if (raw === '' || raw === null || raw === undefined) continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) return { ok: false, error: `${stock.label} must be a number.`, field: `observed.${stock.key}` };
    if (value < stock.min || value > stock.max) {
      return { ok: false, error: `${stock.label} must be between ${stock.min} and ${stock.max} ${stock.unit}.`, field: `observed.${stock.key}` };
    }
    observed[stock.key] = Math.round(value * 100) / 100;
    recorded += 1;
  }
  if (!recorded) return { ok: false, error: 'Record at least one observed stock — a checkpoint with no observations cannot grade a prediction.', field: 'observed.saturationPct' };
  return {
    ok: true,
    value: {
      subjectType,
      subjectId,
      recordedOn,
      observed,
      note: clampText(data.note, 600),
    },
  };
}

/* ------------------------------------------------------------ report */

const REPORT_CACHE = new WeakMap();

function fingerprint(state, now) {
  return [
    dayKey(now),
    state?.meta?.revision ?? 0,
    state?.meta?.updatedAt ?? '',
    state?.settings?.capitalEffortBudget ?? '',
    (state?.capitalPolicies || []).length,
    (state?.dynamicsCheckpoints || []).length,
    (state?.dynamicsExperiments || []).length,
    (state?.people || []).length,
    (state?.portfolio || []).length,
  ].join('|');
}

export function buildCapitalReport(state = {}, now = new Date()) {
  if (state && typeof state === 'object') {
    const key = fingerprint(state, now);
    const cached = REPORT_CACHE.get(state);
    if (cached && cached.key === key) return cached.report;
    const report = computeCapitalReport(state, now);
    REPORT_CACHE.set(state, { key, report });
    return report;
  }
  return computeCapitalReport(state, now);
}

function computeCapitalReport(state = {}, now = new Date()) {
  const dynamics = buildDynamicsReport(state, now);
  const settings = state.settings || {};
  const budgetUnits = clamp(num(settings.capitalEffortBudget, CAP_DEFAULT_BUDGET_UNITS), CAP_MIN_BUDGET_UNITS, CAP_MAX_BUDGET_UNITS);
  if (!dynamics.adequate) {
    return {
      engineVersion: CAP_ENGINE_VERSION,
      today: dayKey(now),
      adequate: false,
      reason: dynamics.reason || 'The structural model needs a roster and a measured capacity before a budget can be allocated.',
      dynamics,
      budgetUnits,
      effortBook: CAP_EFFORT_BOOK,
      weights: CAP_OBJECTIVE_WEIGHTS,
      allocation: null,
      evaluation: null,
      attribution: null,
      pairs: null,
      robustness: null,
      trust: null,
      policies: [],
      checkpoints: [],
      totals: { attention: 0, policies: 0, adopted: 0, dueCheckpoints: 0, scoredCheckpoints: 0 },
    };
  }
  const weights = normalizeWeights(settings.capitalWeights);
  const allocation = allocate(dynamics.model, {
    budget: budgetUnits,
    weights,
    book: CAP_EFFORT_BOOK,
    weeks: dynamics.horizonWeeks,
  });
  const evaluation = evaluatePolicy(dynamics.model, allocation.levers, { weeks: dynamics.horizonWeeks });
  const objective = objectiveScore(dynamics.simulation.summary, evaluation.scenario.summary, weights);
  const attribution = shapleyAttribution(dynamics.model, allocation.levers, { weights, weeks: dynamics.horizonWeeks });
  const pairs = pairInteractions(dynamics.model, allocation.levers, { weights, weeks: dynamics.horizonWeeks });
  const robust = robustness(dynamics.model, allocation.levers, { weeks: dynamics.horizonWeeks, weights });
  const checkpoints = (Array.isArray(state.dynamicsCheckpoints) ? state.dynamicsCheckpoints : []).filter(Boolean);
  const trust = modelTrust(dynamics, checkpoints);
  const policies = (Array.isArray(state.capitalPolicies) ? state.capitalPolicies : [])
    .filter(Boolean)
    .map((policy) => {
      const effort = effortOf(policy.levers);
      const own = checkpoints.filter((row) => row.subjectType === 'policy' && row.subjectId === policy.id);
      const evaluation = policy.status === 'adopted'
        ? evaluatePolicy(dynamics.model, policy.levers, { weeks: policy.horizonWeeks || dynamics.horizonWeeks })
        : null;
      return {
        ...policy,
        effort: effort.total,
        effortRows: effort.rows,
        overBudget: effort.total > policy.budgetUnits + 0.01,
        evaluation,
        objective: evaluation
          ? objectiveScore(dynamics.simulation.summary, evaluation.scenario.summary, policy.weights || weights)
          : null,
        checkpoints: own.slice().sort((a, b) => String(b.recordedOn).localeCompare(String(a.recordedOn))),
        scoring: pooledCheckpointSkill(own),
        checkpointDue: policy.status === 'adopted'
          && Boolean(policy.checkpointOn)
          && policy.checkpointOn <= dayKey(now),
      };
    })
    .sort((a, b) => (a.status === 'adopted' ? 0 : 1) - (b.status === 'adopted' ? 0 : 1)
      || String(b.createdOn || '').localeCompare(String(a.createdOn || '')));
  const experimentCheckpoints = checkpoints.filter((row) => row.subjectType === 'experiment');
  const dueCheckpoints = policies.filter((policy) => policy.checkpointDue).length
    + (Array.isArray(dynamics.experiments) ? dynamics.experiments.filter((experiment) => experiment.checkpointDue
      && !experimentCheckpoints.some((row) => row.subjectId === experiment.id && row.recordedOn >= experiment.checkpointOn)).length : 0);
  const oos = pooledCheckpointSkill(checkpoints);
  const attention = attentionFrom(state, checkpoints, dueCheckpoints);

  return {
    engineVersion: CAP_ENGINE_VERSION,
    today: dayKey(now),
    adequate: true,
    reason: null,
    dynamics,
    horizonWeeks: dynamics.horizonWeeks,
    budgetUnits,
    effortBook: CAP_EFFORT_BOOK,
    weights,
    allocation,
    evaluation,
    objective,
    attribution,
    pairs,
    robustness: robust,
    trust,
    policies,
    checkpoints: checkpoints.map((row) => ({
      ...row,
      subjectLabel: row.subjectType === 'policy'
        ? (policies.find((policy) => policy.id === row.subjectId)?.name || 'Portfolio')
        : (dynamics.experiments.find((experiment) => experiment.id === row.subjectId)?.name || 'Experiment'),
    })),
    experimentCheckpoints,
    experimentScoring: pooledCheckpointSkill(experimentCheckpoints),
    totals: {
      attention,
      policies: policies.length,
      adopted: policies.filter((policy) => policy.status === 'adopted').length,
      dueCheckpoints,
      scoredCheckpoints: checkpoints.filter((row) => Number.isFinite(num(row.scoring?.skill, NaN))).length,
      checkpoints: checkpoints.length,
    },
  };
}

/**
 * Badge arithmetic, deliberately cheap: the navigation renders on every route,
 * so this must not pay for the optimizer. "Running on a model that was already
 * refuted when you committed" is judged from the trust grade frozen at
 * adoption, which is the honest question — the grade now may have moved.
 */
function attentionFrom(state, checkpoints, dueCheckpoints) {
  const oos = pooledCheckpointSkill(checkpoints);
  const committedOnRefuted = (Array.isArray(state.capitalPolicies) ? state.capitalPolicies : [])
    .some((policy) => policy && policy.status === 'adopted'
      && ['unvalidated', 'refuted'].includes(policy.predicted?.trustGrade));
  return dueCheckpoints
    + (oos.n >= CAP_MIN_OOS_CHECKPOINTS && oos.skill !== null && oos.skill <= 0 ? 1 : 0)
    + (committedOnRefuted ? 1 : 0);
}

export function capitalAttentionCount(state = {}, now = new Date()) {
  const today = dayKey(now);
  const policies = (Array.isArray(state.capitalPolicies) ? state.capitalPolicies : []).filter(Boolean);
  const checkpoints = (Array.isArray(state.dynamicsCheckpoints) ? state.dynamicsCheckpoints : []).filter(Boolean);
  const due = policies.filter((policy) => policy.status === 'adopted'
    && policy.checkpointOn && policy.checkpointOn <= today).length;
  return attentionFrom(state, checkpoints, due);
}

/* ------------------------------------------------------------ signals */

export function capitalSignals(state = {}, now = new Date()) {
  const report = buildCapitalReport(state, now);
  if (!report.adequate) return [];
  const signals = [];
  const due = report.policies.filter((policy) => policy.checkpointDue);
  if (due.length) {
    signals.push({
      ruleId: 'SCA-01',
      domain: 'Capital allocation',
      title: `${due.length} portfolio checkpoint${due.length === 1 ? '' : 's'} passed without a score`,
      detail: 'The prediction was frozen at adoption. Until the realised stocks are recorded, the portfolio is still a belief and the model learns nothing from it.',
      severity: 3,
      confidence: 'high',
      evidence: due.slice(0, 3).map((policy) => `“${policy.name}” — checkpoint ${policy.checkpointOn}`),
      action: { label: 'Score the checkpoint', route: '#/capital?tab=checkpoints' },
    });
  }
  const oos = pooledCheckpointSkill(report.checkpoints);
  if (oos.n >= CAP_MIN_OOS_CHECKPOINTS && oos.skill !== null && oos.skill <= 0) {
    signals.push({
      ruleId: 'SCA-02',
      domain: 'Capital allocation',
      title: 'Out of sample, the structural predictions lost to “tomorrow equals today”',
      detail: `Pooled skill ${oos.skill} across ${oos.n} checked predictions (${oos.beats} beat persistence). An allocation built on this model should be treated as a hypothesis about structure, not a plan with a number attached.`,
      severity: 4,
      confidence: 'high',
      evidence: report.checkpoints.slice(0, 3).map((row) => `${row.subjectLabel} — ${row.recordedOn}: skill ${row.scoring?.skill ?? '—'}`),
      action: { label: 'Open the checkpoint ledger', route: '#/capital?tab=checkpoints' },
    });
  }
  if (report.policies.some((policy) => policy.status === 'adopted') && report.trust.rank < CAP_TRUST_GRADES.backtested.rank) {
    signals.push({
      ruleId: 'SCA-03',
      domain: 'Capital allocation',
      title: `A funded portfolio is running on a ${report.trust.label.toLowerCase()} model`,
      detail: report.trust.meaning,
      severity: 3,
      confidence: 'high',
      evidence: report.trust.blockers.slice(0, 3),
      action: { label: 'See what would validate it', route: '#/capital?tab=checkpoints' },
    });
  }
  if (report.attribution?.contributions?.length && report.attribution.contributions[0].sharePct !== null
    && Math.abs(report.attribution.contributions[0].sharePct) >= 70) {
    const top = report.attribution.contributions[0];
    signals.push({
      ruleId: 'SCA-04',
      domain: 'Capital allocation',
      title: `${Math.round(Math.abs(top.sharePct))}% of the modelled gain comes from one lever: ${top.label.toLowerCase()}`,
      detail: 'A portfolio whose gain is one lever deep is not diversified. If that lever stalls, the plan has no second engine — and the attribution is measured inside the model, so a concentrated share also means the recommendation rests on one mechanism.',
      severity: 2,
      confidence: 'medium',
      evidence: [
        `Attributed marginal gain ${top.marginal} utility points (${top.sharePct}% of the total).`,
        `Remaining effort budget ${report.allocation.remaining} weeks.`,
      ],
      action: { label: 'Inspect the attribution', route: '#/capital?tab=attribution' },
    });
  }
  if (report.allocation && report.allocation.remaining >= Math.max(1, report.budgetUnits * 0.25)) {
    signals.push({
      ruleId: 'SCA-05',
      domain: 'Capital allocation',
      title: `${report.allocation.remaining} of ${report.budgetUnits} effort-weeks stay unspent`,
      detail: 'No further lever step returned a positive modelled gain inside this budget. That is a finding, not an inefficiency: the next increment has diminishing or negative returns under the current structure. Either stop here or change the structure rather than the budget.',
      severity: 1,
      confidence: 'medium',
      evidence: [
        `Allocated score ${report.allocation.score} utility points for ${report.allocation.effort} effort-weeks.`,
        `Frontier has ${report.allocation.path.points.length} non-dominated point(s).`,
      ],
      action: { label: 'Read the frontier', route: '#/capital?tab=plan' },
    });
  }
  return signals;
}

/* ------------------------------------------------------------ brief */

export function capitalBrief(state = {}, now = new Date()) {
  const report = buildCapitalReport(state, now);
  const lines = [`# Structural capital allocation brief — ${report.today}`];
  if (!report.adequate) {
    lines.push(`Not available: ${report.reason}`);
    return lines.join('\n');
  }
  lines.push(`Budget: ${report.budgetUnits} effort-weeks. Allocated: ${report.allocation.effort} weeks, leaving ${report.allocation.remaining}.`);
  lines.push(`Model trust: ${report.trust.label} (${report.trust.recommendation}). ${report.trust.meaning}`);
  lines.push('');
  lines.push('## Allocated portfolio');
  if (!report.allocation.effortRows.length) {
    lines.push('No lever step returned a positive modelled gain inside the budget.');
  } else {
    for (const row of report.allocation.effortRows) {
      lines.push(`- ${row.label}: ${row.value} ${row.unit} — ${row.effort} effort-weeks (${row.leverageLabel}).`);
    }
  }
  lines.push('');
  lines.push(`Modelled end-state at week ${report.evaluation.scenario.horizonWeeks}: pressure ${report.evaluation.scenario.summary.endSaturationPct}% (${report.evaluation.delta.saturationPct > 0 ? '+' : ''}${report.evaluation.delta.saturationPct} points vs doing nothing), WIP ${report.evaluation.scenario.summary.endWipDays} person-days, capacity ${report.evaluation.scenario.summary.endCapacityPerWeek} person-days/week, throughput delta ${report.evaluation.delta.throughputDays} person-days.`);
  lines.push('');
  lines.push('## Attribution (exact Shapley, inside the model)');
  for (const row of report.attribution.contributions) {
    lines.push(`- ${row.label}: ${row.marginal} utility points${row.sharePct === null ? '' : ` (${row.sharePct}%)`}.`);
  }
  lines.push(`Efficiency check: attributed total ${report.attribution.total} vs joint gain ${report.attribution.total} (gap ${report.attribution.efficiencyGap}).`);
  lines.push('');
  lines.push('## Robustness (Savage minimax regret)');
  lines.push(`The portfolio's mean modelled score is ${report.robustness.portfolio.meanScore} (P10 ${report.robustness.portfolio.p10}, P90 ${report.robustness.portfolio.p90}); it wins ${report.robustness.portfolio.winRatePct}% of ${report.robustness.draws} draws; worst-case regret ${report.robustness.portfolio.maxRegret} utility points over ${report.robustness.options.length} options. The minimax-regret option is “${report.robustness.minimax.label}”.`);
  lines.push('');
  lines.push('## What would change the answer');
  if (report.trust.blockers.length) {
    for (const blocker of report.trust.blockers) lines.push(`- ${blocker}`);
  } else {
    lines.push('- Nothing outstanding on the trust ladder.');
  }
  lines.push('');
  lines.push('Caveats: effort costs are stated conventions, not measurements. Shapley shares attribute gain inside a structural model; they are not observed causality. Regret is sensitivity to assumed coefficients, not a probability of the future. Nothing here is a judgement about a person.');
  return lines.join('\n');
}

/* ------------------------------------------------------------ rule */

function pushLink(draft, { sourceType, sourceId, targetType, targetId, relation, ruleId, summary }, ctx) {
  draft.links = Array.isArray(draft.links) ? draft.links : [];
  const exists = draft.links.some((link) => link && link.sourceType === sourceType && link.sourceId === sourceId
    && link.targetType === targetType && link.targetId === targetId && link.relation === relation);
  if (exists) return false;
  draft.links.push({
    id: ctx.idFactory('lnk'),
    sourceType,
    sourceId,
    targetType,
    targetId,
    relation,
    ruleId,
    summary: clampText(summary, 300),
    createdOn: ctx.todayStr,
    createdAt: ctx.nowIso,
  });
  return true;
}

function note(ctx, ruleId, action, targetType, targetId, summary, out) {
  out.push({ ruleId, action, targetType, targetId, summary: clampText(summary, 300) });
  if (ctx.logEvent) {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: targetType,
      entityId: targetId,
      summary: `[${ruleId}] ${clampText(summary, 280)}`.slice(0, 300),
    });
  }
}

function markerFor(ruleId, entityId = '') {
  return `[${ruleId}${entityId ? `:${entityId}` : ''}]`;
}

function decisionExists(draft, marker) {
  return (draft.decisions || []).some((decision) => decision && String(decision.question || '').includes(marker));
}

function delegationExists(draft, marker) {
  return (draft.delegations || []).some((delegation) => delegation
    && `${delegation.title || ''} ${delegation.expectedOutcome || ''} ${delegation.support || ''}`.includes(marker));
}

function talkingPointExists(draft, personId, marker) {
  const person = (draft.people || []).find((p) => p && p.id === personId);
  return Boolean(person && (person.talkingPoints || []).some((entry) => String(entry).includes(marker)));
}

/**
 * Post-commit rule (ADR-0008) on the shared spine.
 *
 * Cost discipline: this rule never re-runs the optimizer. The adopted portfolio
 * already froze its attribution and prediction at adoption, which is what the
 * rule reads. Every write is idempotent via markers, so repeated saves and
 * scans converge instead of accumulating decisions.
 */
export function policyPortfolioRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string') return [];
  const type = event.type;
  const isCapital = type.startsWith('capital.');
  const isCheckpoint = type === 'dynamics.checkpoint.recorded';
  const force = ctx.force === true || event.force === true;
  if (!isCapital && !isCheckpoint && !force) return [];
  // An adoption is an explicit commitment the leader just made, so its
  // fan-out always runs. The pause switch governs the *governance* response to
  // a checkpoint (re-baselining and lineage), which is exactly what a leader
  // might want to keep manual while grading several portfolios at once.
  if (!force && !isCapital && draft.settings?.capitalAutoPropagate === false) return [];
  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const runCtx = {
    now,
    todayStr: dayKey(now),
    nowIso: now.toISOString(),
    idFactory: ctx.idFactory || ((prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`),
    logEvent: ctx.logEvent,
  };
  const out = [];

  /* ----- RULE-SCA-01/02 — adopted portfolio → decision + checkpoint ----- */
  if (type === 'capital.policy.adopted') {
    const policy = (draft.capitalPolicies || []).find((row) => row && row.id === event.entityId);
    if (policy && policy.status === 'adopted') {
      const predicted = policy.predicted || {};
      const attribution = Array.isArray(predicted.attribution) ? predicted.attribution : [];
      const trustLabel = clampText(predicted.trustLabel || 'unvalidated', 80);
      const commitMarker = markerFor(CAP_RULE_IDS.COMMIT, policy.id);
      if (!decisionExists(draft, commitMarker)) {
        draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
        const top = attribution.slice(0, 3);
        const decision = {
          id: runCtx.idFactory('dec'),
          title: `Commit the “${clampText(policy.name, 90)}” capital portfolio`.slice(0, 180),
          question: [
            `The allocation spends ${predicted.effort ?? '—'} effort-weeks of a ${policy.budgetUnits}-week budget to move modelled pressure ${predicted.endSaturationPct ?? '—'}% by week ${predicted.horizonWeeks ?? '—'}, against ${predicted.baseline?.endSaturationPct ?? '—'}% if nothing changes.`,
            top.length ? `Largest attributed levers: ${top.map((row) => `${row.label} (${row.sharePct === null ? '—' : `${row.sharePct}%`})`).join(', ')}.` : '',
            `Model trust at adoption: ${trustLabel}. ${predicted.trustMeaning || ''}`.trim(),
            'Commit, stage, or decline the portfolio.',
            commitMarker,
          ].filter(Boolean).join(' ').slice(0, 2000),
          date: runCtx.todayStr,
          reversibility: (predicted.effort ?? 0) > 8 ? 'irreversible' : 'reversible',
          driver: (draft.settings?.leaderName || '').slice(0, 120),
          approver: '', contributors: '', informed: '',
          options: [
            {
              id: runCtx.idFactory('dopt'),
              label: 'Commit the full portfolio now',
              pros: 'Captures the modelled gain inside this horizon; one owner and one checkpoint make it reviewable.',
              cons: `Consumes ${predicted.effort ?? '—'} effort-weeks that cannot be spent elsewhere; the model's trust grade is ${trustLabel}.`,
            },
            {
              id: runCtx.idFactory('dopt'),
              label: 'Stage it: fund the strongest lever first and reallocate at the checkpoint',
              pros: 'Buys information at lower commitment and tests the attribution before the whole budget is gone.',
              cons: 'The complementarities between levers are forfeited, so the staged total is below the joint modelled gain.',
            },
            {
              id: runCtx.idFactory('dopt'),
              label: 'Decline and change the structure instead',
              pros: 'If the model is unvalidated, not spending is a legitimate answer; changing the loop beats buying parameter relief.',
              cons: 'The pressure the allocation was aimed at remains, and the next review will ask why nothing was done.',
            },
          ],
          chosen: '', rationale: '', reviewOn: null, reviewedOn: null,
          outcome: 'pending', outcomeNotes: '', createdAt: runCtx.nowIso,
        };
        draft.decisions.push(decision);
        pushLink(draft, {
          sourceType: CAP_LINK_ENTITY, sourceId: policy.id, targetType: 'decision', targetId: decision.id,
          relation: 'allocates', ruleId: CAP_RULE_IDS.COMMIT,
          summary: `Capital portfolio commitment ${commitMarker}`,
        }, runCtx);
        note(ctx, CAP_RULE_IDS.COMMIT, 'created', 'decision', decision.id,
          `Opened a DACI commitment decision for “${clampText(policy.name, 70)}” (feeds Decision Tempo)`, out);
      }
      const checkpointMarker = markerFor(CAP_RULE_IDS.CHECKPOINT, policy.id);
      const owner = (draft.people || []).find((person) => person && person.id === policy.ownerId && person.status !== 'archived');
      if (owner && !delegationExists(draft, checkpointMarker)) {
        draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
        const due = policy.checkpointOn || dayKey(addDays(runCtx.todayStr, Math.min(56, (policy.horizonWeeks || 26) * 7)));
        const delegation = {
          id: runCtx.idFactory('delegation'),
          personId: owner.id,
          title: `Record the “${clampText(policy.name, 80)}” portfolio checkpoint`.slice(0, 160),
          expectedOutcome: `At the checkpoint, record the realised pressure, work in progress, capacity and dependency so the frozen prediction (${predicted.endSaturationPct ?? '—'}% pressure at week ${predicted.horizonWeeks ?? '—'}) can be scored against what happened.`.slice(0, 600),
          authority: 'recommend',
          support: `The baseline (${predicted.baseline?.endSaturationPct ?? '—'}% pressure if nothing changed) was frozen at adoption, which is what makes this a skill score rather than a memory test. ${checkpointMarker}`.slice(0, 1200),
          delegatedOn: runCtx.todayStr,
          dueOn: due,
          status: 'active',
          checkins: [], completedOn: null, completionNote: '', returnedOn: null, returnReason: '',
          createdAt: runCtx.nowIso, updatedAt: runCtx.nowIso,
        };
        draft.delegations.push(delegation);
        pushLink(draft, {
          sourceType: CAP_LINK_ENTITY, sourceId: policy.id, targetType: 'delegation', targetId: delegation.id,
          relation: 'tracks-followup', ruleId: CAP_RULE_IDS.CHECKPOINT,
          summary: `Owned out-of-sample checkpoint ${checkpointMarker}`,
        }, runCtx);
        note(ctx, CAP_RULE_IDS.CHECKPOINT, 'created', 'delegation', delegation.id,
          `Opened an owned checkpoint for “${clampText(policy.name, 70)}” with the baseline frozen`, out);
      }
      const ownerId = policy.ownerId;
      const practiceMarker = markerFor(`${CAP_RULE_IDS.COMMIT}-review`, policy.id);
      if (ownerId && !talkingPointExists(draft, ownerId, practiceMarker)) {
        const person = (draft.people || []).find((p) => p && p.id === ownerId && p.status !== 'archived');
        if (person) {
          const text = `${practiceMarker} Portfolio review, not a performance point: which lever actually moved, which part of the gain was one mechanism, and what we would stop funding?`.slice(0, 200);
          person.talkingPoints = [...(Array.isArray(person.talkingPoints) ? person.talkingPoints : []), text].slice(-12);
          note(ctx, CAP_RULE_IDS.COMMIT, 'updated', 'person', ownerId,
            'Queued a blameless portfolio-review talking point for the owner', out);
        }
      }
    }
  }

  /* ----- RULE-SCA-04 — checkpoint → typed lineage (always) ----- */
  if (isCheckpoint && event.entityId) {
    const checkpoint = (draft.dynamicsCheckpoints || []).find((row) => row && row.id === event.entityId);
    if (checkpoint) {
      const targetType = checkpoint.subjectType === 'experiment' ? 'dynamics' : CAP_LINK_ENTITY;
      const exists = (draft.links || []).some((link) => link
        && link.sourceType === CAP_CHECKPOINT_ENTITY && link.sourceId === checkpoint.id
        && link.targetType === targetType && link.targetId === checkpoint.subjectId
        && link.relation === 'scores');
      if (!exists) {
        pushLink(draft, {
          sourceType: CAP_CHECKPOINT_ENTITY, sourceId: checkpoint.id,
          targetType, targetId: checkpoint.subjectId, relation: 'scores',
          ruleId: CAP_RULE_IDS.LINEAGE,
          summary: `Checkpoint ${checkpoint.recordedOn} scored ${checkpoint.scoring?.verdict || 'unscorable'}`,
        }, runCtx);
        note(ctx, CAP_RULE_IDS.LINEAGE, 'created', targetType, checkpoint.subjectId,
          `Appended scoring lineage from the ${checkpoint.recordedOn} checkpoint`, out);
      }
    }
  }

  /* ----- RULE-SCA-03 — pooled out-of-sample failure → re-baseline ----- */
  if (isCheckpoint) {
    const checkpoints = (draft.dynamicsCheckpoints || []).filter(Boolean);
    const pooled = pooledCheckpointSkill(checkpoints);
    if (pooled.n >= CAP_MIN_OOS_CHECKPOINTS && pooled.skill !== null && pooled.skill <= 0) {
      const marker = markerFor(CAP_RULE_IDS.REBASELINE);
      if (!decisionExists(draft, marker)) {
        draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
        const decision = {
          id: runCtx.idFactory('dec'),
          title: 'Re-baseline the structural model before allocating against it'.slice(0, 180),
          question: [
            `Frozen predictions have been scored ${pooled.n} times and their pooled out-of-sample skill is ${pooled.skill} (${pooled.beats} of ${pooled.n} beat persistence).`,
            'The model that priced the capital portfolio is losing to “tomorrow equals today”. Choose how to correct it.',
            marker,
          ].join(' ').slice(0, 2000),
          date: runCtx.todayStr,
          reversibility: 'reversible',
          driver: (draft.settings?.leaderName || '').slice(0, 120),
          approver: '', contributors: '', informed: '',
          options: [
            {
              id: runCtx.idFactory('dopt'),
              label: 'Re-measure the assumed coefficients from real operational records',
              pros: 'Attacks the most likely cause: conventions standing in for measurements.',
              cons: 'Takes weeks of record-keeping before the next allocation can claim anything.',
            },
            {
              id: runCtx.idFactory('dopt'),
              label: 'Shorten the horizon and re-hindcast',
              pros: 'A shorter horizon is easier to beat and exposes structural error sooner.',
              cons: 'Structural delays — hiring drag, capability growth — disappear from the window.',
            },
            {
              id: runCtx.idFactory('dopt'),
              label: 'Stop allocating against the model and use the playbooks as judgement aids only',
              pros: 'Honest while the evidence is negative; nothing irreversible is spent on a refuted model.',
              cons: 'Gives up the only quantitative comparison the workspace has, until it earns it back.',
            },
          ],
          chosen: '', rationale: '', reviewOn: null, reviewedOn: null,
          outcome: 'pending', outcomeNotes: '', createdAt: runCtx.nowIso,
        };
        draft.decisions.push(decision);
        note(ctx, CAP_RULE_IDS.REBASELINE, 'created', 'decision', decision.id,
          `Opened a re-baselining decision: pooled out-of-sample skill ${pooled.skill} over ${pooled.n} checkpoints`, out);
      }
    }
  }

  return out;
}

/* ------------------------------------------------------------ glue */

export const CAPACITY_LINK_ENTITY_TYPES = Object.freeze([CAP_LINK_ENTITY, CAP_CHECKPOINT_ENTITY]);

export function capitalLinkTypesSupported() {
  return CAPACITY_LINK_ENTITY_TYPES.every((entity) => LINK_ENTITY_TYPES.includes(entity))
    && CAP_LINK_RELATIONS.every((relation) => LINK_RELATIONS.includes(relation));
}
