/**
 * app/core/domain/sequentialInvestigation.js — the Sequential Investigation
 * Planner (Session 81, RULE-SEQ-01..03, ADR-0046). Pure: no DOM, storage,
 * clock or network, so the same arithmetic is reproducible in tests and in
 * the browser.
 *
 * WHAT WAS MISSING
 * ----------------
 * The Information Value Terminal (Schema v54) prices ONE test at a time. Real
 * investigations are conditional: run test A; if it fires, test B is worth
 * buying; if it does not, the decision is clear and waiting is pure cost. A
 * single-test EVSI cannot say whether a second test is worth anything, and
 * cannot say that the right FIRST move depends on what the first test returns.
 *
 * NAMED THEORY, IMPLEMENTED EXPLICITLY
 * ------------------------------------
 *  - **Bayesian updating (Bayes 1763).** A settled test multiplies the belief
 *    by its likelihood P(signal | state) and renormalises. Successive tests are
 *    combined this way ONLY under conditional independence given the state —
 *    an assumption the leader must accept, and one the planner prints.
 *  - **Finite-horizon optimal stopping by backward induction (Bellman 1957;
 *    the Bayes sequential test of Arrow, Blackwell & Girshick 1949).** The
 *    planner enumerates the decision tree exactly over the declared menu and
 *    horizon:
 *        V(π, k) = max{ stop: max_o E_π[u(o,s)] ,
 *                       test j: Σ_σ P(σ | π) · V(π | σ, k−1) − c_j − d_j }
 *    where c_j is the test's fee and d_j the declared cost of waiting for it.
 *    It is not a one-step look-ahead heuristic: the one-step (myopic) policy is
 *    reported beside it so the value of a SECOND stage is a printed number.
 *  - **Wald's sequential logic (Wald 1945; Wald & Wolfowitz 1948).** The
 *    reason to stop early is the same reason an SPRT stops early: the evidence
 *    so far is already decisive enough that another observation's expected
 *    improvement does not cover its cost.
 *  - **Blackwell (1951, 1953) monotonicity** is inherited from the single-test
 *    engine: a more accurate test is never worth less, so a plan that includes
 *    a more accurate test never values the plan lower.
 *  - **Consistency check against the single-test engine.** With no settled
 *    tests and a one-stage horizon, the net value of each test here equals the
 *    existing `evaluateInquiry().netValue`. The test suite enforces that
 *    identity so the two engines cannot drift apart.
 *
 * HARD HONESTY BOUNDARIES
 * -----------------------
 *  - Declared probabilities are PRIORS. Settled tests update the belief this
 *    module reads, but the frame's own declared numbers are never rewritten.
 *  - Tests are binary, declared, and conditionally independent given the state.
 *    Correlated tests (two reads of the same source) are a known failure of
 *    this model; the planner says so instead of pretending otherwise.
 *  - Waiting is priced by the declared per-test delay cost only. No discount
 *    rate is invented, and no option is allowed to be free because it is late.
 *  - The horizon is capped at three stages and the menu at six tests. Beyond
 *    that the tree would be large and a leader could not check the arithmetic
 *    by hand. The planner therefore CAPS rather than guesses: the horizon used
 *    is reported as `horizon`, and any tests beyond the six are counted in
 *    `omittedTests`, never silently dropped.
 *  - Exact over the declared menu. It cannot discover a test nobody declared.
 */

import { evaluateFrame, payoffTable } from './valueOfInformation.js';

export const SEQ_ENGINE_VERSION = 'sequential-voi-2026.10-v1';
export const SEQ_MAX_STAGES = 3;
export const SEQ_MAX_TESTS = 6;
/** A second stage is advised only when it adds at least this share of stake (and the currency floor). */
export const SEQ_MATERIAL_GAIN_SHARE_PCT = 1;
export const SEQ_MATERIAL_GAIN_FLOOR = 1;
const EPS = 1e-9;

/* ---------------------------------------------------------------- helpers */

function finiteOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Declared accuracy as a probability, clamped to the same [50%, 100%] band the entry form enforces. */
function accuracy(pct) {
  return Math.min(1, Math.max(0.5, finiteOr(pct, 75) / 100));
}

/**
 * P(signal | state) for a binary test. The target states are the ones the test
 * is designed to detect: it fires with its sensitivity there and with
 * (1 − specificity) everywhere else. The negative signal is the complement.
 */
export function signalLikelihood(test, stateId, signal) {
  const target = Array.isArray(test.targetStateIds) && test.targetStateIds.includes(stateId);
  const pFires = target ? accuracy(test.sensitivityPct) : 1 - accuracy(test.specificityPct);
  return signal === 'negative' ? 1 - pFires : pFires;
}

/** Unnormalised P(signal) for a belief vector aligned to `stateIds`. */
export function signalProbability(stateIds, belief, test, signal) {
  let sum = 0;
  for (let i = 0; i < stateIds.length; i += 1) sum += belief[i] * signalLikelihood(test, stateIds[i], signal);
  return sum;
}

/** Bayes update of a belief vector on one observed signal. `null` when the signal is impossible. */
export function updateBelief(stateIds, belief, test, signal) {
  const joint = stateIds.map((stateId, i) => belief[i] * signalLikelihood(test, stateId, signal));
  const total = joint.reduce((acc, value) => acc + value, 0);
  if (!(total > EPS)) return null;
  return joint.map((value) => value / total);
}

const roundMoney = (value) => Math.round(value * 100) / 100;

function pctVector(belief) {
  return belief.map((value) => Math.round(value * 1e4) / 100);
}

/** The best immediate decision under a belief. Ties go to the status quo, then to declaration order. */
export function bestDecision({ stateIds, options, payoff, belief }) {
  let best = null;
  for (const option of options) {
    let value = 0;
    for (let i = 0; i < stateIds.length; i += 1) value += belief[i] * payoff(option.id, stateIds[i]);
    const candidate = { optionId: option.id, label: option.label, isStatusQuo: Boolean(option.isStatusQuo), value };
    if (!best || candidate.value > best.value + EPS) best = candidate;
    else if (Math.abs(candidate.value - best.value) <= EPS && candidate.isStatusQuo && !best.isStatusQuo) best = candidate;
  }
  return best;
}

/* ------------------------------------------------------------ the solver */

function solveNode(ctx, belief, stagesLeft, used) {
  const stop = bestDecision({ stateIds: ctx.stateIds, options: ctx.options, payoff: ctx.payoff, belief });
  const decideNode = {
    kind: 'decide',
    optionId: stop.optionId,
    optionLabel: stop.label,
    value: roundMoney(stop.value),
    beliefPct: pctVector(belief),
  };
  if (stagesLeft <= 0) return decideNode;

  let best = decideNode;
  for (const test of ctx.tests) {
    if (used.has(test.id)) continue;
    const pPositive = signalProbability(ctx.stateIds, belief, test, 'positive');
    const pNegative = signalProbability(ctx.stateIds, belief, test, 'negative');
    const nextUsed = new Set([...used, test.id]);
    let expected = 0;
    let positive = null;
    let negative = null;
    if (pPositive > EPS) {
      const after = updateBelief(ctx.stateIds, belief, test, 'positive');
      if (after) {
        positive = solveNode(ctx, after, stagesLeft - 1, nextUsed);
        expected += pPositive * positive.value;
      }
    }
    if (pNegative > EPS) {
      const after = updateBelief(ctx.stateIds, belief, test, 'negative');
      if (after) {
        negative = solveNode(ctx, after, stagesLeft - 1, nextUsed);
        expected += pNegative * negative.value;
      }
    }
    const cost = roundMoney(test.cost || 0);
    const delayCost = roundMoney(test.delayCost || 0);
    const value = expected - cost - delayCost;
    if (value > best.value + EPS) {
      best = {
        kind: 'test',
        testId: test.id,
        testLabel: test.label,
        value: roundMoney(value),
        stopValue: decideNode.value,
        cost,
        delayCost,
        pPositivePct: Math.round(pPositive * 1e4) / 100,
        beliefPct: pctVector(belief),
        positive,
        negative,
        // Kept on the node so the expected number of tests can be read off the tree.
        pPositive,
      };
    }
  }
  return best;
}

function expectedTestsRun(node) {
  if (!node || node.kind !== 'test') return 0;
  const pNegative = 1 - node.pPositive;
  return 1 + node.pPositive * expectedTestsRun(node.positive) + pNegative * expectedTestsRun(node.negative);
}

function longestPath(node) {
  if (!node || node.kind !== 'test') return 0;
  return 1 + Math.max(longestPath(node.positive), longestPath(node.negative));
}

/** Strip the internal probability field from the tree before it leaves this module. */
function publicTree(node) {
  if (!node) return null;
  if (node.kind === 'decide') {
    return { kind: 'decide', optionId: node.optionId, optionLabel: node.optionLabel, value: node.value, beliefPct: node.beliefPct };
  }
  return {
    kind: 'test',
    testId: node.testId,
    testLabel: node.testLabel,
    value: node.value,
    stopValue: node.stopValue,
    cost: node.cost,
    delayCost: node.delayCost,
    pPositivePct: node.pPositivePct,
    beliefPct: node.beliefPct,
    positive: publicTree(node.positive),
    negative: publicTree(node.negative),
  };
}

/**
 * The raw net value of one test followed by the best decision, against deciding
 * now, with no option to stop early: E[best after the test] − cost − delay − stop.
 * It can be negative. The solver floors it at zero because the plan may always
 * decline a test; this function does not, so it matches the single-test engine's
 * `netValue` exactly. The register's "Net value alone" column reads this value.
 */
export function oneTestNet({ stateIds, options, payoff, belief, test }) {
  const stop = bestDecision({ stateIds, options, payoff, belief });
  const pPositive = signalProbability(stateIds, belief, test, 'positive');
  const pNegative = signalProbability(stateIds, belief, test, 'negative');
  let expected = 0;
  if (pPositive > EPS) {
    const after = updateBelief(stateIds, belief, test, 'positive');
    if (after) expected += pPositive * bestDecision({ stateIds, options, payoff, belief: after }).value;
  }
  if (pNegative > EPS) {
    const after = updateBelief(stateIds, belief, test, 'negative');
    if (after) expected += pNegative * bestDecision({ stateIds, options, payoff, belief: after }).value;
  }
  const cost = roundMoney(test.cost || 0);
  const delayCost = roundMoney(test.delayCost || 0);
  return expected - cost - delayCost - stop.value;
}

/**
 * Solve the sequential plan exactly.
 *
 * `payoff(optionId, stateId)` must return a finite number for every cell; the
 * caller refuses unpriced frames before reaching here. `tests` is the declared
 * menu. `maxStages` is capped at SEQ_MAX_STAGES and at the menu size.
 */
export function solveSequentialPlan({
  stateIds,
  options,
  payoff,
  belief,
  tests = [],
  maxStages = SEQ_MAX_STAGES,
}) {
  const menu = tests.slice(0, SEQ_MAX_TESTS);
  const horizon = Math.max(0, Math.min(maxStages, SEQ_MAX_STAGES, menu.length));
  const ctx = { stateIds, options, payoff, tests: menu };
  const tree = solveNode(ctx, belief, horizon, new Set());
  const oneStage = horizon >= 1 ? solveNode(ctx, belief, 1, new Set()) : tree;
  const stop = bestDecision({ stateIds, options, payoff, belief });
  const sequenceValue = roundMoney(tree.value);
  const oneStageValue = roundMoney(oneStage.value);
  const secondStageGain = roundMoney(Math.max(0, sequenceValue - oneStageValue));
  let verdict = 'no-test';
  if (menu.length) verdict = tree.kind === 'test' ? 'test-first' : 'decide-now';
  return {
    horizon,
    verdict,
    stopValue: roundMoney(stop.value),
    stopOptionId: stop.optionId,
    stopOptionLabel: stop.label,
    oneStageValue,
    oneStageTestId: oneStage.kind === 'test' ? oneStage.testId : null,
    sequenceValue,
    secondStageGain,
    expectedTests: Math.round(expectedTestsRun(tree) * 1000) / 1000,
    longestPath: longestPath(tree),
    firstMove: tree.kind === 'test'
      ? { kind: 'test', testId: tree.testId, testLabel: tree.testLabel, value: tree.value }
      : { kind: 'decide', optionId: tree.optionId, optionLabel: tree.optionLabel, value: tree.value },
    tree: publicTree(tree),
    onPolicyTestIds: collectTestIds(tree),
  };
}

function collectTestIds(node, out = new Set()) {
  if (!node || node.kind !== 'test') return [...out];
  out.add(node.testId);
  collectTestIds(node.positive, out);
  collectTestIds(node.negative, out);
  return [...out];
}

/* ------------------------------------------------- plain-language reading */

/**
 * One sentence for a node, in money the leader declared. Used in the advisory
 * notes, the decision register and the planner view, so every surface tells
 * the same story from the same tree.
 */
export function describePlanNode(node, currency = 'USD') {
  if (!node) return 'stop here';
  const money = (value) => `${String(currency || 'USD').toUpperCase()} ${Math.round(Number(value) || 0).toLocaleString('en-US')}`;
  if (node.kind === 'decide') return `decide “${node.optionLabel}” (expected ${money(node.value)})`;
  const price = roundMoney((node.cost || 0) + (node.delayCost || 0));
  return `run “${node.testLabel}” (fires ${node.pPositivePct}% of the time; costs ${money(price)} including waiting)`;
}

/* --------------------------------------------------- the read model */

/**
 * The current belief over a frame's states: the declared priors conditioned on
 * every SETTLED test, in the order they settled, under conditional
 * independence. Returns `ok: false` when the evidence cannot all be true.
 */
export function beliefFromEvidence(stateIds, priorPct, settledTests = []) {
  let belief = priorPct.map((value) => value / 100);
  const steps = [];
  for (const test of settledTests) {
    const next = updateBelief(stateIds, belief, test, test.signal);
    if (!next) return { ok: false, belief: null, steps };
    belief = next;
    steps.push({ studyId: test.id, signal: test.signal, beliefPct: pctVector(belief) });
  }
  return { ok: true, belief, steps };
}

function stableHash(text) {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  return `SEQ-${hash.toString(36).toUpperCase().padStart(6, '0').slice(-6)}`;
}

const ASSUMPTIONS = Object.freeze([
  'Each test is binary and declared by you; its sensitivity and specificity are claims you have to defend.',
  'Tests are conditionally independent given the true state. Two reads of the same source violate this, and the plan will overstate what the second adds.',
  'Declared probabilities are your priors. Settled tests update the belief used here; the frame’s own numbers are never rewritten.',
  `The plan is exact over the declared menu and a horizon of ${SEQ_MAX_STAGES} stages at most. It cannot invent a test you did not declare.`,
  'Waiting is priced only by the delay cost you declared for each test. No discount rate is assumed.',
]);

/**
 * The full planning reading for one decision frame. Every refusal carries a
 * reason; nothing is silently zeroed.
 */
export function buildSequencePlan(state = {}, frameId, { now = new Date() } = {}) {
  const frame = (state.voiDecisions || []).find((row) => row && row.id === frameId);
  if (!frame) return { ok: false, reason: 'That decision frame no longer exists.' };
  const reading = evaluateFrame(frame);
  if (!reading.priced) {
    return { ok: false, reason: 'The frame is unpriced: every option needs a payoff in every state, and the states must sum to 100%.' };
  }
  const stateIds = frame.states.map((row) => row.id);
  const priorPct = frame.states.map((row) => finiteOr(row.probability, 0));
  const table = payoffTable(frame);
  const payoff = (optionId, stateId) => table.get(optionId, stateId);
  const options = frame.options.map((row) => ({ id: row.id, label: row.label, isStatusQuo: Boolean(row.isStatusQuo) }));
  const targetsOk = (study) => Array.isArray(study.targetStateIds) && study.targetStateIds.length > 0
    && study.targetStateIds.every((id) => stateIds.includes(id));

  const studies = (state.voiStudies || []).filter((row) => row && row.frameId === frameId);
  const byTime = (a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || String(a.id).localeCompare(String(b.id));
  const settled = studies
    .filter((row) => row.status === 'settled' && row.result && ['positive', 'negative'].includes(row.result.signal) && targetsOk(row))
    .sort((a, b) => String(a.result.on || '').localeCompare(String(b.result.on || '')) || byTime(a, b))
    .map((row) => ({
      id: row.id,
      label: row.label,
      targetStateIds: row.targetStateIds,
      sensitivityPct: row.sensitivityPct,
      specificityPct: row.specificityPct,
      signal: row.result.signal,
      on: row.result.on || null,
    }));
  const open = studies
    .filter((row) => ['planned', 'running'].includes(row.status) && targetsOk(row)
      && finiteOr(row.sensitivityPct, 0) + finiteOr(row.specificityPct, 0) > 100)
    .sort(byTime);
  const omittedTests = Math.max(0, open.length - SEQ_MAX_TESTS);
  const menuRows = open.slice(0, SEQ_MAX_TESTS).map((row) => ({
    id: row.id,
    label: row.label,
    targetStateIds: row.targetStateIds,
    sensitivityPct: finiteOr(row.sensitivityPct, 75),
    specificityPct: finiteOr(row.specificityPct, 75),
    cost: roundMoney(finiteOr(row.cost, 0)),
    delayCost: roundMoney(finiteOr(row.delayCost, 0)),
  }));

  const conditioned = beliefFromEvidence(stateIds, priorPct, settled);
  if (!conditioned.ok) {
    return {
      ok: false,
      reason: 'The settled tests cannot all be true under the declared states, so the belief has no consistent value. Re-check the sensitivity, specificity and target states of the settled tests.',
    };
  }
  const belief = conditioned.belief;
  const plan = solveSequentialPlan({ stateIds, options, payoff, belief, tests: menuRows });

  // The raw one-test net of each declared test, from the current belief. Negative when the test
  // does not pay for itself. With no settled evidence it equals the register's netValue.
  const menu = menuRows.map((row) => ({
    ...row,
    singleNetValue: roundMoney(oneTestNet({ stateIds, options, payoff, belief, test: row })),
    onPolicy: plan.onPolicyTestIds.includes(row.id),
  }));

  const materialGain = Math.max(SEQ_MATERIAL_GAIN_FLOOR, (reading.stake || 0) * SEQ_MATERIAL_GAIN_SHARE_PCT / 100);
  const firstKey = plan.firstMove.kind === 'test' ? `test:${plan.firstMove.testId}` : `decide:${plan.firstMove.optionId}`;
  const planRef = stableHash([
    frameId, plan.verdict, firstKey, plan.horizon,
    Math.round(plan.sequenceValue), menu.map((row) => row.id).join(','), settled.map((row) => row.id).join(','),
  ].join('|'));

  return {
    ok: true,
    engineVersion: SEQ_ENGINE_VERSION,
    frameId,
    label: frame.label,
    status: frame.status,
    currency: frame.currency || 'USD',
    computedAt: now instanceof Date ? now.toISOString() : null,
    planRef,
    states: frame.states.map((row, i) => ({
      id: row.id,
      label: row.label,
      priorPct: priorPct[i],
      beliefPct: Math.round(belief[i] * 1e4) / 100,
    })),
    options,
    settled,
    menu,
    omittedTests,
    materialGain: roundMoney(materialGain),
    assumptions: [...ASSUMPTIONS],
    ...plan,
  };
}
