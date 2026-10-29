/**
 * app/core/domain/measurement.js — the Scorecard Integrity Lab (Schema v47).
 *
 * THE QUESTION THIS ANSWERS
 * -------------------------
 * Every leader sets goals, key results, KPIs and review criteria. Almost none of
 * them ask the prior question: *if I pay attention to these numbers, what will
 * people actually do differently?* The answer is not rhetorical. It is a
 * multi-task principal–agent problem with a gaming technology, and it has a
 * closed-form solution.
 *
 * This module takes the leader's declared scorecard — the tasks it measures,
 * the true value of each task, how easy each metric is to move without moving
 * the objective, how noisy it is, how much of the reward is at stake, and
 * whether hitting a number raises next period's target — and computes:
 *
 *   1. the effort an agent with those incentives will actually allocate,
 *      split between *genuine* progress and *gaming*;
 *   2. the effort that flows to work the scorecard does not count;
 *   3. the value delivered versus the first-best value for the same effort;
 *   4. a per-metric Goodhart index, and a portfolio-level distortion figure;
 *   5. a deterministic search over re-weightings, paired guardrails, reduced
 *      stakes and newly measured tasks, ranked by modelled value net of the
 *      declared cost of measuring one more thing.
 *
 * WHAT IS MODELLED (named frameworks)
 * -----------------------------------
 *  - **Holmström & Milgrom (1991), "Multitask Principal–Agent Analyses"**: with
 *    linear rewards and convex effort cost, an agent allocates effort in
 *    proportion to incentive intensity divided by marginal cost, and tasks
 *    outside the measure receive *no* effort. That is why a unidimensional
 *    scorecard silently deletes the unmeasured job.
 *  - **Baker (1992), "Incentive Contracts and Performance Measurement"**:
 *    distortion is a property of the *measure*, not of the agent. A measure
 *    that responds to a cheap action as strongly as to the valuable one is
 *    distorted even when nobody is dishonest.
 *  - **Banker & Datar (1989) / the LEN model**: a noisy measure is discounted by
 *    1/(1 + rσ²), so it attracts less effort than a clean metric of the same
 *    weight, and the principal pays a risk premium for what it does attract.
 *    Noise is therefore a *price on the metric*, not a footnote. In a
 *    single-metric scorecard noise cannot change the composition of effort —
 *    both genuine and cosmetic work scale together — which is why the premium is
 *    printed separately instead of being folded into the value figure.
 *  - **Weitzman (1980) ratchet effect; Freixas, Guesnerie & Tirole (1985)**:
 *    when today's result becomes tomorrow's target, the agent withholds output.
 *  - **Kerr (1975), "On the Folly of Rewarding A While Hoping for B"** and
 *    **Campbell (1979) / Goodhart (1975)**: stakes amplify distortion, so the
 *    same metric is riskier when pay, ranking or promotion rests on it.
 *
 * WHAT IS DELIBERATELY NOT MODELLED, AND SAID SO IN THE UI
 * -------------------------------------------------------
 *  - This is an equilibrium of a *declared* model, not a measurement of any
 *    person. It never reads a message, a calendar, a keystroke or a sentiment.
 *  - Parameters are leader-declared conventions (0–100 scales), not estimated
 *    psychometrics. The page prints every assumption next to its number.
 *  - Agents are homogeneous. Real teams contain one person who games and three
 *    who would not — the model describes *the incentive*, not the people.
 *  - Effort is a single scalar budget. Attention has depth effects and switching
 *    costs that this model ignores; those are Modelled nowhere rather than
 *    modelled badly.
 *  - No claim is made that a redesigned scorecard causes better outcomes. The
 *    predictions are frozen and scored later, and a single observation is
 *    printed as an anecdote, never as calibration.
 *
 * Pure module: no DOM, no storage, no network, no wall clock. Every function
 * takes its inputs and returns a plain value.
 */

import { addDays, clamp, daysBetween, dayKey, round } from '../time.js';

export const MEASUREMENT_ENGINE_VERSION = 'scorecard-integrity-2026.10-v1';

export const MEASUREMENT_TASK_KINDS = Object.freeze(['measured', 'unmeasured']);

export const MEASUREMENT_STATUSES = Object.freeze(['draft', 'committed', 'reviewed', 'retired']);

export const MEASUREMENT_RULE_IDS = Object.freeze({
  REDESIGN: 'RULE-MTX-01',
  CALIBRATION: 'RULE-MTX-02',
});

/** Minimum net value (0–100 index) before a committed scorecard is flagged. */
export const MEASUREMENT_MIN_EFFICIENCY = 55;

/** Goodhart index (0–100) above which a single metric is called out. */
export const MEASUREMENT_GOODHART_ALERT = 55;

/** A redesign must beat the current design by this much to be recommended. */
export const MEASUREMENT_MIN_LIFT = 2;

/** Counts-only floor: below this many scored scorecards the lab prints no skill claim. */
export const MEASUREMENT_MIN_SCORED = 3;

/** A recorded observation must beat the frozen prediction by this many points to falsify it. */
export const MEASUREMENT_FALSIFIER_MARGIN_PP = 12;

/** The declared cost of adding one more measured metric (value index points). */
export const MEASUREMENT_METRIC_COST_PCT = 2;

const MAX_TASKS = 12;
const MAX_NAME = 160;
const GAMING_WITHHOLD = 0.6; // ratchet: at ratchet = 100%, withhold 60% of genuine effort
const GAMING_COST_FLOOR = 0.25;

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampPct(value, fallback = 0) {
  return clamp(num(value, fallback), 0, 100);
}

function text(value, max) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function money(n, dp = 0) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: dp }).format(n);
}

/* ------------------------------------------------------------------ model */

/**
 * Normalize a task row. Weights are stored as declared percentages; the
 * measured weights are renormalized at read time so a hand-edited 80/80 cannot
 * silently double the effective incentive intensity.
 */
export function normalizeMeasurementTask(raw = {}) {
  const kind = MEASUREMENT_TASK_KINDS.includes(raw.kind) ? raw.kind : 'measured';
  return {
    id: String(raw.id || '').slice(0, 80),
    name: text(raw.name, MAX_NAME),
    kind,
    weightPct: kind === 'measured' ? clampPct(raw.weightPct, 0) : 0,
    trueValue: clamp(num(raw.trueValue, 50), 1, 100),
    effortCost: clamp(num(raw.effortCost, 50), 1, 100),
    gamingEase: clamp(num(raw.gamingEase, 20), 0, 100),
    noisePct: clamp(num(raw.noisePct, 20), 0, 100),
    ratchetPct: clamp(num(raw.ratchetPct, 0), 0, 100),
  };
}

/** Declared parameters of one scorecard, coerced into safe ranges. */
export function normalizeMeasurementParams(raw = {}) {
  return {
    stakesPct: clampPct(raw.stakesPct, 50),
    professionalismPct: clampPct(raw.professionalismPct, 25),
    riskAversionPct: clampPct(raw.riskAversionPct, 40),
    detectionPct: clampPct(raw.detectionPct, 25),
    effortHoursPerWeek: clamp(num(raw.effortHoursPerWeek, 35), 1, 80),
  };
}

/**
 * The multi-task equilibrium for one declared scorecard.
 *
 * Every input is a percentage on screen and a fraction in the algebra, so a
 * reader can reproduce any number with a calculator.
 *
 *   ŵ_i = w_i / Σw                      normalized reward weight (measured only)
 *   ρ_i = ŵ_i / (1 + r σ_i²)            risk-adjusted intensity (LEN, Banker–Datar)
 *   c_i = 1 + 3·cost_i                  marginal cost of genuine effort
 *   k_i = 0.25 + 2(1 − ease_i)²         marginal cost of gaming
 *   a_i = ρ_i / c_i                     genuine effort (first-order condition)
 *   b_i = ρ_i · ease_i / k_i            gaming effort
 *   h_i = 1 − 0.6·ratchet_i             ratchet withholding on genuine effort
 *
 * The measured budget is (1 − π) where π is the declared floor of effort that
 * goes to unmeasured work regardless of incentives; it is split between a_i·h_i
 * and b_i. Unmeasured tasks split π in proportion to their first-best ratio
 * v_i / c_i, because a professional will spend defensible time on the most
 * valuable unmeasured work available.
 *
 * @returns {{
 *   tasks: Array<object>, measuredEffort:number, unmeasuredEffort:number,
 *   gamingSharePct:number, valueDelivered:number, idealValue:number,
 *   efficiencyPct:number, unmeasuredNeglectPct:number, riskPremiumPct:number
 * }}
 */
export function scorecardEquilibrium(scorecard = {}) {
  const params = normalizeMeasurementParams(scorecard);
  const tasks = (scorecard.tasks || []).map(normalizeMeasurementTask).filter((t) => t.name);
  const measured = tasks.filter((t) => t.kind === 'measured');
  const unmeasured = tasks.filter((t) => t.kind === 'unmeasured');

  const weightSum = measured.reduce((sum, t) => sum + t.weightPct, 0);
  // A scorecard with no measured weight at all is not a scorecard: treat the
  // measured rows as equally weighted and report that as a finding.
  const equalWeight = weightSum <= 0 && measured.length > 0;
  const baseWeight = equalWeight ? 100 / measured.length : 100;

  const risk = params.riskAversionPct / 100;
  const professionalism = params.professionalismPct / 100;
  // Campbell (1979): the same metric invites more corruption when more rests on
  // it. Modelled as a multiplier on gaming effort (0.6× at zero stakes, 1.4× at
  // total stakes), so halving what is at stake is a real design change and not a
  // cosmetic relabelling.
  const stakesMultiplier = 0.6 + 0.8 * (params.stakesPct / 100);

  const raw = tasks.map((task) => {
    const isMeasured = task.kind === 'measured';
    const weightShare = isMeasured ? (weightSum > 0 ? task.weightPct / weightSum : 1 / Math.max(1, measured.length)) : 0;
    const noise = task.noisePct / 100;
    const intensity = weightShare / (1 + risk * noise * noise);
    const cost = 1 + 3 * (task.effortCost / 100);
    const ease = task.gamingEase / 100;
    const gamingCost = GAMING_COST_FLOOR + 2 * (1 - ease) * (1 - ease);
    const ratchet = task.ratchetPct / 100;
    const genuine = isMeasured ? (intensity / cost) * (1 - GAMING_WITHHOLD * ratchet) : 0;
    const gaming = isMeasured ? (intensity * ease * stakesMultiplier) / gamingCost : 0;
    const unmeasuredPull = isMeasured ? 0 : task.trueValue / cost;
    return { task, weightShare, intensity, cost, ease, genuine, gaming, unmeasuredPull, equalWeight };
  });

  const measuredRaw = raw.filter((r) => r.task.kind === 'measured').reduce((sum, r) => sum + r.genuine + r.gaming, 0);
  const unmeasuredRaw = raw.filter((r) => r.task.kind === 'unmeasured').reduce((sum, r) => sum + r.unmeasuredPull, 0);
  // Effort is conserved. The professionalism floor is the share of effort that
  // goes to work the scorecard does not count; when the leader declares no
  // uncounted work, that floor has nowhere to go and redistributes to the
  // measured tasks rather than evaporating. An earlier version silently lost
  // 20% of the budget in that case, which understated every value it reported.
  const unmeasuredBudget = unmeasuredRaw > 0 ? professionalism : 0;
  const measuredBudget = 1 - unmeasuredBudget;

  const rows = raw.map((r) => {
    const isMeasured = r.task.kind === 'measured';
    const genuine = isMeasured
      ? (measuredRaw > 0 ? (r.genuine / measuredRaw) * measuredBudget : 0)
      : (unmeasuredRaw > 0 ? (r.unmeasuredPull / unmeasuredRaw) * unmeasuredBudget : 0);
    const gaming = isMeasured && measuredRaw > 0 ? (r.gaming / measuredRaw) * measuredBudget : 0;
    const effort = genuine + gaming;
    return {
      id: r.task.id,
      name: r.task.name,
      kind: r.task.kind,
      weightPct: round(r.weightShare * 100, 1),
      declaredWeightPct: r.task.weightPct,
      trueValue: r.task.trueValue,
      effortCost: r.task.effortCost,
      gamingEase: r.task.gamingEase,
      noisePct: r.task.noisePct,
      ratchetPct: r.task.ratchetPct,
      genuineEffortPct: round(genuine * 100, 2),
      gamingEffortPct: round(gaming * 100, 2),
      effortPct: round(effort * 100, 2),
      gamingSharePct: effort > 0 ? round((gaming / effort) * 100, 1) : 0,
      valueContribution: round(r.task.trueValue * genuine, 2),
      // A metric's "yield" is how much true value one unit of the rewarded
      // behaviour buys. Below 1.0 the metric is paying for something else.
      valuePerRewardedUnit: effort > 0 ? round((r.task.trueValue * genuine) / (effort * 100) * 100, 2) : 0,
    };
  });

  // First best: the allocation a principal with observable true effort would
  // choose. With quadratic cost the optimum is a_i ∝ v_i / c_i across ALL tasks
  // (measured and unmeasured alike), because true value is what is maximized.
  const idealRaw = tasks.map((task) => ({ task, pull: task.trueValue / (1 + 3 * (task.effortCost / 100)) }));
  const idealTotal = idealRaw.reduce((sum, r) => sum + r.pull, 0);
  const idealByTask = new Map(idealRaw.map((r) => [r.task.id, idealTotal > 0 ? r.pull / idealTotal : 0]));

  const valueDelivered = rows.reduce((sum, r) => sum + r.valueContribution, 0);
  const idealValue = idealRaw.reduce((sum, r) => sum + r.task.trueValue * (idealTotal > 0 ? r.pull / idealTotal : 0), 0);
  const measuredEffort = rows.filter((r) => r.kind === 'measured').reduce((sum, r) => sum + r.effortPct, 0) / 100;
  const gamingEffort = rows.reduce((sum, r) => sum + r.gamingEffortPct, 0) / 100;
  const unmeasuredEffort = rows.filter((r) => r.kind === 'unmeasured').reduce((sum, r) => sum + r.effortPct, 0) / 100;

  // Risk premium: the share of the reward budget that buys nothing because the
  // agent must be compensated for bearing noise. Reported, never netted off.
  const noiseWeight = measured.reduce((sum, t) => {
    const share = weightSum > 0 ? t.weightPct / weightSum : 1 / Math.max(1, measured.length);
    return sum + share * (t.noisePct / 100) ** 2;
  }, 0);
  const riskPremiumPct = round(risk * noiseWeight * 100, 1);

  return {
    engineVersion: MEASUREMENT_ENGINE_VERSION,
    params,
    rows,
    // Unmeasured tasks that receive less than their first-best share: this is
    // Holmström–Milgrom's crowding-out, printed rather than asserted.
    unmeasuredNeglectPct: round(
      tasks
        .filter((t) => t.kind === 'unmeasured')
        .reduce((sum, t) => {
          const row = rows.find((r) => r.id === t.id);
          const ideal = idealByTask.get(t.id) || 0;
          return sum + Math.max(0, ideal - (row ? row.effortPct / 100 : 0));
        }, 0) * 100,
      1,
    ),
    measuredEffort: round(measuredEffort, 3),
    unmeasuredEffort: round(unmeasuredEffort, 3),
    gamingEffort: round(gamingEffort, 3),
    gamingSharePct: measuredEffort > 0 ? round((gamingEffort / measuredEffort) * 100, 1) : 0,
    valueDelivered: round(valueDelivered, 2),
    idealValue: round(idealValue, 2),
    efficiencyPct: idealValue > 0 ? round(clamp((valueDelivered / idealValue) * 100, 0, 100), 1) : 0,
    riskPremiumPct,
    equalWeight,
    counts: {
      measured: measured.length,
      unmeasured: unmeasured.length,
      total: tasks.length,
    },
  };
}

/**
 * Per-metric distortion profile (Baker 1992; Kerr 1975; Campbell 1979).
 *
 *   gamingShare   what fraction of the behaviour the metric pays for is gaming
 *   stakesFactor  0.5–1.5, the Campbell amplifier
 *   detection     what fraction of gaming the leader would actually notice
 *   goodhart      100 · gamingShare · stakesFactor · (1 − detection)
 *
 * The index is a declared composite, not a validated instrument. Its job is to
 * order metrics for attention, and it says so on screen.
 */
export function goodhartProfile(scorecard = {}, equilibrium = null) {
  const eq = equilibrium || scorecardEquilibrium(scorecard);
  const params = eq.params;
  const stakesFactor = 0.5 + params.stakesPct / 100;
  const detection = params.detectionPct / 100;
  const metrics = eq.rows
    .filter((r) => r.kind === 'measured')
    .map((r) => {
      const gamingShare = r.gamingSharePct / 100;
      return {
        id: r.id,
        name: r.name,
        goodhartIndex: round(clamp(100 * gamingShare * stakesFactor * (1 - detection), 0, 100), 1),
        gamingSharePct: r.gamingSharePct,
        weightPct: r.weightPct,
        valuePerRewardedUnit: r.valuePerRewardedUnit,
        gamingEase: r.gamingEase,
        noisePct: r.noisePct,
        ratchetPct: r.ratchetPct,
        band: gamingShare >= 0.5 ? 'high' : gamingShare >= 0.25 ? 'moderate' : 'low',
      };
    })
    .sort((a, b) => b.goodhartIndex - a.goodhartIndex);
  return {
    metrics,
    worst: metrics[0] || null,
    portfolioIndex: metrics.length
      ? round(metrics.reduce((sum, m) => sum + m.goodhartIndex * (m.weightPct / 100), 0), 1)
      : 0,
    stakesFactor: round(stakesFactor, 2),
    detectionPct: params.detectionPct,
  };
}

/* -------------------------------------------------------------- redesigns */

function withTasks(scorecard, tasks) {
  return { ...scorecard, tasks: tasks.map((t) => ({ ...t })) };
}

function reweightByValue(tasks) {
  const measured = tasks.filter((t) => t.kind === 'measured');
  if (!measured.length) return tasks;
  const scores = measured.map((t) => Math.max(0.5, (t.trueValue / 100) * (1 - 0.5 * (t.gamingEase / 100))));
  const total = scores.reduce((sum, n) => sum + n, 0);
  let assigned = 0;
  const out = tasks.map((t) => {
    if (t.kind !== 'measured') return { ...t };
    const index = measured.indexOf(t);
    const weight = index === measured.length - 1 ? round(100 - assigned, 1) : round((scores[index] / total) * 100, 1);
    assigned += weight;
    return { ...t, weightPct: weight };
  });
  return out;
}

function addGuardrails(tasks) {
  // A paired counter-metric halves the ease of moving the number without moving
  // the goal. Declared convention, not an estimate from history.
  return tasks.map((t) => (t.kind === 'measured' && t.gamingEase >= 45 ? { ...t, gamingEase: round(t.gamingEase * 0.5, 1) } : { ...t }));
}

function measureTheGap(tasks, maxAdds = 2) {
  const gaps = tasks
    .filter((t) => t.kind === 'unmeasured')
    .sort((a, b) => b.trueValue - a.trueValue)
    .slice(0, maxAdds);
  if (!gaps.length) return { tasks, added: 0 };
  // Newly measured work starts noisy and partly gameable: that is the honest
  // cost of measuring something that was not being measured.
  const converted = tasks.map((t) => (gaps.some((g) => g.id === t.id)
    ? { ...t, kind: 'measured', weightPct: 20, gamingEase: Math.max(t.gamingEase, 35), noisePct: Math.max(t.noisePct, 30) }
    : { ...t }));
  const measured = converted.filter((t) => t.kind === 'measured');
  const total = measured.reduce((sum, t) => sum + t.weightPct, 0);
  return {
    tasks: converted.map((t) => (t.kind === 'measured' ? { ...t, weightPct: round((t.weightPct / total) * 100, 1) } : t)),
    added: gaps.length,
  };
}

export const MEASUREMENT_DESIGN_IDS = Object.freeze([
  'current',
  'value-weighted',
  'guardrailed',
  'de-staked',
  'measure-the-gap',
  'composite',
  'composite-gap',
]);

export const MEASUREMENT_DESIGN_LABELS = Object.freeze({
  current: 'Your scorecard as declared',
  'value-weighted': 'Weight what is valuable and hard to fake',
  guardrailed: 'Pair each gameable metric with a counter-metric',
  'de-staked': 'Halve what rests on the numbers',
  'measure-the-gap': 'Measure the work you left uncounted',
  composite: 'Re-weight, guardrail and de-stake together',
  'composite-gap': 'All of that, and count the uncounted work',
});

/**
 * Evaluate one design against the same agent model. `metricCostPct` is the
 * declared value cost of maintaining one measured metric beyond the first, so a
 * design that adds three dashboards is not compared to one that adds none as if
 * measurement were free.
 */
export function evaluateDesign(scorecard, designId, { metricCostPct = MEASUREMENT_METRIC_COST_PCT } = {}) {
  const baseTasks = (scorecard.tasks || []).map(normalizeMeasurementTask);
  let tasks = baseTasks.map((t) => ({ ...t }));
  let params = normalizeMeasurementParams(scorecard);
  let added = 0;
  let touched = [];

  switch (designId) {
    case 'value-weighted':
      tasks = reweightByValue(tasks);
      touched = ['weights'];
      break;
    case 'guardrailed': {
      const before = tasks.map((t) => t.gamingEase);
      tasks = addGuardrails(tasks);
      touched = ['guardrails'];
      added = tasks.filter((t, i) => t.gamingEase !== before[i]).length;
      break;
    }
    case 'de-staked':
      params = { ...params, stakesPct: round(params.stakesPct * 0.5, 1) };
      touched = ['stakes'];
      break;
    case 'measure-the-gap': {
      const res = measureTheGap(tasks);
      tasks = res.tasks;
      added = res.added;
      touched = ['measurement'];
      break;
    }
    case 'composite': {
      const before = tasks.map((t) => t.gamingEase);
      tasks = addGuardrails(reweightByValue(tasks));
      added = tasks.filter((t, i) => t.gamingEase !== before[i]).length;
      params = { ...params, stakesPct: round(params.stakesPct * 0.5, 1) };
      touched = ['weights', 'guardrails', 'stakes'];
      break;
    }
    case 'composite-gap': {
      const before = tasks.map((t) => t.gamingEase);
      const gap = measureTheGap(tasks);
      tasks = addGuardrails(reweightByValue(gap.tasks));
      added = gap.added + tasks.filter((t, i) => t.gamingEase !== before[i] && i < before.length).length;
      params = { ...params, stakesPct: round(params.stakesPct * 0.5, 1) };
      touched = ['weights', 'guardrails', 'stakes', 'measurement'];
      break;
    }
    case 'current':
    default:
      break;
  }

  const candidate = {
    ...scorecard,
    ...params,
    tasks,
  };
  const equilibrium = scorecardEquilibrium(candidate);
  const goodhart = goodhartProfile(candidate, equilibrium);
  const metricCount = equilibrium.counts.measured;
  const measurementCost = Math.max(0, metricCount - 1) * metricCostPct;
  const netValue = round(equilibrium.valueDelivered - measurementCost, 2);
  return {
    id: designId,
    label: MEASUREMENT_DESIGN_LABELS[designId] || designId,
    touched,
    addedMetrics: added,
    metricCount,
    measurementCost: round(measurementCost, 2),
    equilibrium,
    goodhart,
    valueDelivered: equilibrium.valueDelivered,
    efficiencyPct: equilibrium.efficiencyPct,
    gamingSharePct: equilibrium.gamingSharePct,
    netValue,
  };
}

/**
 * Deterministic design search. Returns every candidate, the current baseline and
 * a recommendation only when a candidate beats the baseline by at least
 * `minLift` net value points. "Keep it" is a legitimate answer.
 */
export function rankDesigns(scorecard, { metricCostPct = MEASUREMENT_METRIC_COST_PCT, minLift = MEASUREMENT_MIN_LIFT } = {}) {
  const designs = MEASUREMENT_DESIGN_IDS.map((id) => evaluateDesign(scorecard, id, { metricCostPct }));
  const baseline = designs.find((d) => d.id === 'current');
  const ranked = [...designs].sort((a, b) => b.netValue - a.netValue || b.efficiencyPct - a.efficiencyPct);
  const best = ranked[0];
  const lift = best && best.id !== 'current' ? round(best.netValue - baseline.netValue, 2) : 0;
  return {
    baseline,
    designs,
    ranked,
    best,
    lift,
    recommend: Boolean(best && best.id !== 'current' && lift >= minLift),
    reason: !best || best.id === 'current'
      ? 'No redesign beats the declared scorecard on modelled value once the cost of measuring more is counted.'
      : lift >= minLift
        ? `${best.label} adds ${money(lift, 1)} net value points over the declared scorecard with ${best.metricCount} measured metric(s).`
        : `${best.label} only adds ${money(lift, 1)} net value points, below the ${minLift}-point threshold. Keep what you have and watch it.`,
  };
}

/**
 * The frozen prediction. Committed once, never recomputed, so the later
 * comparison is a genuine out-of-sample test rather than a memory.
 */
export function freezeMeasurementPrediction(scorecard) {
  const equilibrium = scorecardEquilibrium(scorecard);
  const goodhart = goodhartProfile(scorecard, equilibrium);
  const ranking = rankDesigns(scorecard);
  return {
    engineVersion: MEASUREMENT_ENGINE_VERSION,
    efficiencyPct: equilibrium.efficiencyPct,
    valueDelivered: equilibrium.valueDelivered,
    gamingSharePct: equilibrium.gamingSharePct,
    unmeasuredNeglectPct: equilibrium.unmeasuredNeglectPct,
    riskPremiumPct: equilibrium.riskPremiumPct,
    goodhartIndex: goodhart.portfolioIndex,
    worstMetric: goodhart.worst ? { id: goodhart.worst.id, name: goodhart.worst.name, goodhartIndex: goodhart.worst.index ?? goodhart.worst.goodhartIndex } : null,
    // The falsifier: the level of observed gaming at which the model was too kind.
    // The falsifier is a margin, not a wall: the model is falsified when the
    // recorded gaming share exceeds the frozen prediction by this many points.
    falsifierGamingPct: round(clamp(equilibrium.gamingSharePct + MEASUREMENT_FALSIFIER_MARGIN_PP, 0, 100), 1),
    falsifierMarginPp: MEASUREMENT_FALSIFIER_MARGIN_PP,
    recommendedDesign: ranking.recommend ? ranking.best.id : 'current',
    recommendedLift: ranking.lift,
  };
}

/**
 * Score one recorded observation against the frozen prediction.
 *
 * The observation is a *human recorded estimate* of how much of the measured
 * movement was cosmetic, not telemetry. With one observation the result is an
 * anecdote; the function says so and refuses to compute a skill score.
 */
export function scoreMeasurementObservation(scorecard) {
  const frozen = scorecard?.frozen?.prediction;
  const observation = scorecard?.observation;
  if (!frozen || !observation || !observation.recordedOn) return null;
  const predicted = num(frozen.gamingSharePct, 0);
  const observed = clampPct(observation.gamingSharePct, 0);
  const error = round(observed - predicted, 1);
  const absError = Math.abs(error);
  const band = absError <= 10 ? 'called' : error > 0 ? 'under-predicted' : 'over-predicted';
  const metricMove = num(observation.metricMovedPct, 0);
  const trueMove = num(observation.trueOutcomePct, 0);
  return {
    predictedGamingPct: predicted,
    observedGamingPct: observed,
    errorPp: error,
    absErrorPp: round(absError, 1),
    band,
    falsified: observed - predicted >= MEASUREMENT_FALSIFIER_MARGIN_PP,
    metricMovedPct: round(metricMove, 1),
    trueOutcomePct: round(trueMove, 1),
    // What the scorecard bought: the part of the metric movement that did not
    // arrive as true outcome. Printed even when it flatters the model.
    cosmeticGapPp: round(metricMove - trueMove, 1),
    note: text(observation.note, 600),
    recordedOn: observation.recordedOn,
    // A single observation is a story, not calibration.
    sufficient: false,
  };
}

/* ---------------------------------------------------------------- report */

export function scorecardIntegrity(scorecard, { metricCostPct = MEASUREMENT_METRIC_COST_PCT } = {}) {
  const equilibrium = scorecardEquilibrium(scorecard);
  const goodhart = goodhartProfile(scorecard, equilibrium);
  const ranking = rankDesigns(scorecard, { metricCostPct });
  const badge = equilibrium.efficiencyPct >= 75 && goodhart.portfolioIndex < 35
    ? { id: 'sound', label: 'Sound', tone: 'good' }
    : equilibrium.efficiencyPct >= MEASUREMENT_MIN_EFFICIENCY && goodhart.portfolioIndex < MEASUREMENT_GOODHART_ALERT
      ? { id: 'leaky', label: 'Leaky', tone: 'warn' }
      : { id: 'distorted', label: 'Distorted', tone: 'bad' };
  return {
    ...scorecard,
    // Recomputed from the live draft so a stale preview cannot commit a design
    // the leader never saw modelled.
    designKey: scorecardDesignKey(scorecard),
    equilibrium,
    goodhart,
    ranking,
    badge,
    observationScore: scoreMeasurementObservation(scorecard),
  };
}

export function buildMeasurementReport(state = {}, { now = new Date(), metricCostPct = MEASUREMENT_METRIC_COST_PCT } = {}) {
  const at = now instanceof Date ? now : new Date(now);
  const today = dayKey(at);
  const scorecards = (state.scorecards || []).filter(Boolean).map((row) => scorecardIntegrity(row, { metricCostPct }));
  const active = scorecards.filter((s) => s.status === 'committed');
  const drafts = scorecards.filter((s) => s.status === 'draft');
  const reviewed = scorecards.filter((s) => s.status === 'reviewed');

  // Expected value destroyed: how much modelled value the current scorecard
  // gives up against the best declared redesign, scaled by the declared hours.
  const atStake = active.map((s) => {
    const best = s.ranking.recommend ? s.ranking.best : s.ranking.baseline;
    const hours = s.equilibrium.params.effortHoursPerWeek;
    // Hours are the honest unit. A scorecard that buys 30% of first-best value
    // means roughly 70% of the declared team hours buy something the metric does
    // not pay for — not that 70% of the team is idle.
    const efficiencyGapPct = round(Math.max(0, (best.efficiencyPct ?? 0) - s.equilibrium.efficiencyPct), 1);
    return {
      id: s.id,
      title: s.title,
      efficiencyGapPct,
      design: best.id,
      designLabel: best.label,
      recommend: s.ranking.recommend,
      hoursPerWeek: hours,
      misdirectedHoursPerWeek: row1((1 - s.equilibrium.efficiencyPct / 100) * hours),
      recoverableHoursPerWeek: row1((efficiencyGapPct / 100) * hours),
    };
  }).sort((a, b) => b.recoverableHoursPerWeek - a.recoverableHoursPerWeek);

  const overdue = active.filter((s) => s.reviewOn && s.reviewOn <= today && (!s.observation || !s.observation.recordedOn));
  const awaitingReview = active.filter((s) => !s.reviewOn);
  const scored = scorecards
    .map((s) => s.observationScore)
    .filter((row) => row && row.recordedOn);

  const calibration = (() => {
    if (scored.length < MEASUREMENT_MIN_SCORED) {
      return {
        count: scored.length,
        sufficient: false,
        message: `Only ${scored.length} scored observation(s). Below ${MEASUREMENT_MIN_SCORED} the lab prints the individual errors and refuses to claim calibration.`,
        rows: scored,
        meanAbsErrorPp: scored.length ? round(scored.reduce((sum, r) => sum + r.absErrorPp, 0) / scored.length, 1) : null,
      };
    }
    const meanAbsError = round(scored.reduce((sum, r) => sum + r.absErrorPp, 0) / scored.length, 1);
    const bias = round(scored.reduce((sum, r) => sum + r.errorPp, 0) / scored.length, 1);
    return {
      count: scored.length,
      sufficient: true,
      message: `Across ${scored.length} observations the declared model's average absolute error is ${meanAbsError} percentage points${bias > 0 ? `; it under-predicts gaming by ${Math.abs(bias)}pp on average` : bias < 0 ? `; it over-predicts gaming by ${Math.abs(bias)}pp on average` : '; it is unbiased on this sample'}.`,
      meanAbsErrorPp: meanAbsError,
      biasPp: bias,
      rows: scored,
    };
  })();

  const attention = [];
  for (const s of active) {
    // The attention list is driven by the same badge the page renders. An
    // earlier version gated this on the Goodhart index alone, so a card the page
    // called "distorted" could be missing from the list of things needing a
    // decision — an inconsistency a reader would rightly treat as a bug.
    if (s.badge.id !== 'sound') {
      attention.push({
        id: s.id,
        kind: s.badge.id === 'distorted' ? 'distortion' : 'leak',
        severity: s.badge.id === 'distorted' ? 4 : 2,
        title: s.badge.id === 'distorted'
          ? `“${s.title}” is modelled to deliver ${s.equilibrium.efficiencyPct}% of first-best value with ${s.equilibrium.gamingSharePct}% cosmetic effort`
          : `“${s.title}” leaks: ${s.equilibrium.gamingSharePct}% of measured effort is modelled as cosmetic (Goodhart ${s.goodhart.portfolioIndex}/100)`,
        route: '#/measurement',
      });
    }
    if (s.reviewOn && s.reviewOn <= today && !(s.observation && s.observation.recordedOn)) {
      attention.push({
        id: s.id,
        kind: 'review-due',
        severity: 3,
        title: `“${s.title}” was due for measurement on ${s.reviewOn} and nobody recorded what happened`,
        route: '#/measurement',
      });
    }
  }
  for (const row of scored) {
    if (row.falsified) {
      const s = scorecards.find((c) => c.observationScore === row);
      attention.push({
        id: s?.id || row.recordedOn,
        kind: 'falsified',
        severity: 4,
        title: `Recorded gaming (${row.observedGamingPct}%) exceeded the frozen prediction (${row.predictedGamingPct}%) — the model was too kind`,
        route: '#/measurement',
      });
    }
  }

  return {
    engineVersion: MEASUREMENT_ENGINE_VERSION,
    asOf: today,
    scorecards,
    active,
    drafts,
    reviewed,
    attention,
    atStake,
    calibration,
    totals: {
      total: scorecards.length,
      active: active.length,
      drafts: drafts.length,
      distorted: active.filter((s) => s.badge.id === 'distorted').length,
      leaky: active.filter((s) => s.badge.id === 'leaky').length,
      overdue: overdue.length,
      awaitingReview: awaitingReview.length,
      meanEfficiencyPct: active.length ? round(active.reduce((sum, s) => sum + s.equilibrium.efficiencyPct, 0) / active.length, 1) : null,
      meanGoodhart: active.length ? round(active.reduce((sum, s) => sum + s.goodhart.portfolioIndex, 0) / active.length, 1) : null,
      // Two different questions, kept apart: how many declared hours buy
      // behaviour the metric does not reward, and how many of those a declared
      // redesign would recover. Neither is a claim about an individual.
      misdirectedHoursPerWeek: round(atStake.reduce((sum, r) => sum + r.misdirectedHoursPerWeek, 0), 1),
      recoverableHoursPerWeek: round(atStake.reduce((sum, r) => sum + r.recoverableHoursPerWeek, 0), 1),
    },
    assumptions: [
      `Effort is a single budget: ${active.length ? 'per scorecard, ' : ''}declared in hours per week. Attention switching and depth are not modelled.`,
      'Parameters are your declared 0–100 conventions, not measured psychometrics. Every number on this page can be re-derived with a calculator from the assumptions card.',
      'Agents are homogeneous and rational within the declared model. This describes the incentive, not your people, and it never scores a person.',
      'Reward weights are renormalized to 100% across measured tasks, so a hand-edited 80/80 cannot double the real incentive intensity.',
      'A single observation is an anecdote. The lab prints errors individually until there are three.',
    ],
  };
}

function row1(value) {
  return Math.round(value * 10) / 10;
}

/* --------------------------------------------------------------- signals */

export function measurementSignals(state = {}, now = new Date()) {
  const report = buildMeasurementReport(state, { now });
  const signals = [];
  const { totals, atStake, calibration } = report;

  if (totals.distorted) {
    const worst = report.active
      .filter((s) => s.badge.id === 'distorted')
      .sort((a, b) => b.goodhart.portfolioIndex - a.goodhart.portfolioIndex)[0];
    const top = worst?.goodhart.worst;
    signals.push({
      ruleId: 'MTX-01',
      domain: 'Scorecard integrity',
      title: `${totals.distorted} committed scorecard(s) are modelled to pay mostly for gaming`,
      detail: 'This is not an accusation of dishonesty; it is what a metric that responds to a cheap action produces from an honest agent. The lab prices the behaviour the scorecard buys and names a redesign that buys more of what you meant.',
      severity: 4,
      confidence: 'low',
      evidence: [
        worst ? `“${worst.title}” — Goodhart index ${worst.goodhart.portfolioIndex}/100, modelled genuine value ${worst.equilibrium.efficiencyPct}% of first-best` : null,
        top ? `Worst metric “${top.name}”: ${top.gamingSharePct}% of the behaviour it rewards is modelled as cosmetic` : null,
        `Declared parameters are conventions, not measurements — see the assumptions card.`,
      ].filter(Boolean),
      action: { label: 'Open the lab', route: '#/measurement' },
    });
  }

  if (totals.overdue) {
    const oldest = [...report.active]
      .filter((s) => s.reviewOn && s.reviewOn <= report.asOf && !(s.observation && s.observation.recordedOn))
      .sort((a, b) => String(a.reviewOn).localeCompare(String(b.reviewOn)))[0];
    signals.push({
      ruleId: 'MTX-02',
      domain: 'Scorecard integrity',
      title: `${totals.overdue} committed scorecard(s) passed their measurement date with nothing recorded`,
      detail: 'A frozen prediction that is never compared with what happened is a decoration. The comparison takes one deliberate conversation and is the only way this model ever becomes more than an opinion.',
      severity: 3,
      confidence: 'high',
      evidence: [
        oldest ? `“${oldest.title}” was due on ${oldest.reviewOn} (${Math.max(0, daysBetween(oldest.reviewOn, report.asOf))} day(s) ago)` : null,
        oldest?.frozen?.prediction ? `Frozen prediction: ${oldest.frozen.prediction.gamingSharePct}% gaming, ${oldest.frozen.prediction.efficiencyPct}% modelled genuine value` : null,
      ].filter(Boolean),
      action: { label: 'Record what happened', route: '#/measurement' },
    });
  }

  const falsified = report.attention.filter((row) => row.kind === 'falsified');
  if (falsified.length) {
    signals.push({
      ruleId: 'MTX-03',
      domain: 'Scorecard integrity',
      title: `${falsified.length} recorded observation(s) exceeded the frozen prediction`,
      detail: 'The model was too kind. That is the useful outcome: it is a measured miss rather than a comforting story, and it is why the prediction was frozen before the evidence arrived.',
      severity: 4,
      confidence: 'high',
      evidence: falsified.slice(0, 3).map((row) => row.title),
      action: { label: 'Review the misses', route: '#/measurement' },
    });
  }

  const neverCommitted = report.drafts.filter((s) => s.equilibrium.counts.measured > 0);
  if (neverCommitted.length) {
    signals.push({
      ruleId: 'MTX-04',
      domain: 'Scorecard integrity',
      title: `${neverCommitted.length} scorecard(s) are modelled but not committed`,
      detail: 'An uncommitted scorecard is a thought. Committing freezes the prediction, opens the redesign decision when the numbers warrant it and starts the clock on the only test that matters.',
      severity: 2,
      confidence: 'high',
      evidence: neverCommitted.slice(0, 3).map((s) => `“${s.title}”: modelled genuine value ${s.equilibrium.efficiencyPct}% of first-best`),
      action: { label: 'Commit or discard', route: '#/measurement' },
    });
  }

  if (totals.active && totals.recoverableHoursPerWeek >= 5) {
    const top = atStake.find((row) => row.recommend) || atStake[0];
    signals.push({
      ruleId: 'MTX-05',
      domain: 'Scorecard integrity',
      title: `≈${totals.recoverableHoursPerWeek}h a week of declared team effort is recoverable by a redesign the lab already modelled`,
      detail: 'This is the largest recoverable cost on the page: the gap between the behaviour the scorecard rewards and the behaviour the work requires, expressed in the hours the team actually has. It is a model result under declared parameters, not a timesheet.',
      severity: 3,
      confidence: 'low',
      evidence: [
        top ? `Largest single gap: “${top.title}” — ${top.efficiencyGapPct}pp of first-best, ≈${top.recoverableHoursPerWeek}h/week via “${top.designLabel}”` : null,
        `Across ${totals.active} committed scorecard(s); ${totals.misdirectedHoursPerWeek}h/week modelled to buy behaviour the cards do not reward.`,
      ].filter(Boolean),
      action: { label: 'See the redesign', route: '#/measurement' },
    });
  }

  if (calibration.sufficient) {
    signals.push({
      ruleId: 'MTX-06',
      domain: 'Scorecard integrity',
      title: `The declared model's average error is ${calibration.meanAbsErrorPp} percentage points across ${calibration.count} observations`,
      detail: 'This is the only number on the page that was tested against reality rather than derived from the model. It is printed whether it flatters the model or not.',
      severity: 2,
      confidence: 'high',
      evidence: [calibration.message],
      action: { label: 'Open the calibration ledger', route: '#/measurement' },
    });
  }

  return signals;
}

/* ----------------------------------------------------------------- brief */

export function measurementBrief(state = {}, { now = new Date() } = {}) {
  const report = buildMeasurementReport(state, { now });
  const lines = [];
  lines.push(`SCORECARD INTEGRITY — ${report.asOf}`);
  lines.push('');
  lines.push(`${report.totals.active} committed scorecard(s); ${report.totals.distorted} distorted, ${report.totals.leaky} leaky, ${report.totals.overdue} overdue for measurement.`);
  if (report.totals.meanEfficiencyPct !== null) {
    lines.push(`Modelled genuine value: ${report.totals.meanEfficiencyPct}% of first-best. Mean Goodhart index ${report.totals.meanGoodhart}/100.`);
  }
  lines.push(`Misdirected effort: ≈${report.totals.misdirectedHoursPerWeek}h/team/week buys behaviour the scorecard does not reward; ≈${report.totals.recoverableHoursPerWeek}h/week is recoverable by a modelled redesign.`);
  lines.push('');
  for (const card of report.active.slice(0, 8)) {
    lines.push(`• ${card.title} — ${card.badge.label}`);
    lines.push(`  genuine value ${card.equilibrium.efficiencyPct}% · gaming ${card.equilibrium.gamingSharePct}% of measured effort · Goodhart ${card.goodhart.portfolioIndex}/100`);
    const worst = card.goodhart.worst;
    if (worst) lines.push(`  worst metric: “${worst.name}” (index ${worst.goodhartIndex}, ${worst.gamingSharePct}% cosmetic)`);
    if (card.ranking.recommend) lines.push(`  redesign: ${card.ranking.best.label} → +${card.ranking.lift} net value points`);
    if (card.observationScore) {
      lines.push(`  observed gaming ${card.observationScore.observedGamingPct}% vs frozen ${card.observationScore.predictedGamingPct}% (${card.observationScore.band})`);
    }
  }
  if (report.calibration.rows.length) {
    lines.push('');
    lines.push(report.calibration.sufficient
      ? `CALIBRATION — ${report.calibration.message}`
      : `CALIBRATION — ${report.calibration.message}`);
    for (const row of report.calibration.rows.slice(0, 6)) {
      lines.push(`  ${row.recordedOn}: predicted ${row.predictedGamingPct}% · observed ${row.observedGamingPct}% · error ${row.errorPp > 0 ? '+' : ''}${row.errorPp}pp`);
    }
  }
  lines.push('');
  lines.push('ASSUMPTIONS');
  for (const line of report.assumptions) lines.push(`  - ${line}`);
  return lines.join('\n');
}

/** Stable key for a scorecard design, used to refuse a stale commit. */
export function scorecardDesignKey(scorecard) {
  const payload = JSON.stringify({
    title: text(scorecard?.title, MAX_NAME),
    stakesPct: num(scorecard?.stakesPct),
    professionalismPct: num(scorecard?.professionalismPct),
    riskAversionPct: num(scorecard?.riskAversionPct),
    detectionPct: num(scorecard?.detectionPct),
    tasks: (scorecard?.tasks || []).map((t) => [
      text(t.name, MAX_NAME), t.kind, num(t.weightPct), num(t.trueValue),
      num(t.effortCost), num(t.gamingEase), num(t.noisePct), num(t.ratchetPct),
    ]),
  });
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `mtx-${(hash >>> 0).toString(16)}`;
}

/** Next review date when the leader does not name one. */
export function defaultMeasurementReviewOn(today, weeks = 6) {
  return addDays(today, Math.max(7, weeks * 7));
}
