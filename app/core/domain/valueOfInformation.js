/**
 * app/core/domain/valueOfInformation.js — the Information Value Terminal
 * (Session 77, Schema v54, RULE-VOI-01..05).
 *
 * WHAT WAS MISSING
 * ----------------
 * By Schema v53 this app could price a delay (Tempo), score a promise
 * (Forecast Integrity), grade an intervention (Impact / Fidelity), read a
 * structure (Structural Design) and watch a belief decay as evidence aged
 * (Premise Sentinel). The Premise Sentinel even names "buy information (probe)"
 * as one of its four responses to a breach. Nothing anywhere in the product
 * could answer the question a first-time leader asks at that moment:
 *
 *     *how much is it worth to find this out before I commit?*
 *
 * Without a number, "let's get more data" is a way of not deciding, and
 * "let's just decide" is a way of not thinking. This module is the number.
 *
 * NAMED THEORY, IMPLEMENTED EXPLICITLY
 * ------------------------------------
 *  - **Value of information (Raiffa & Schlaifer 1961; Howard 1966).** The
 *    *expected value of perfect information* is
 *        EVPI = Σ_s p_s · max_o u(o, s) − max_o Σ_s p_s · u(o, s),
 *    computed exactly by enumeration over the declared state space. It is an
 *    upper bound on what ANY investigation can be worth, and it is computed
 *    from the leader's own declared payoffs — never from a model of the world.
 *  - **Expected value of sample information (EVSI).** For a two-signal test
 *    with declared sensitivity and specificity, the joint distribution of
 *    (signal, state) follows from Bayes' rule, the posterior is exact, and
 *    EVSI = E_signal[max_o E[u | signal]] − max_o E[u]. No Monte Carlo, no
 *    approximation, no seed to argue about.
 *  - **Blackwell (1951, 1953) sufficiency ordering.** A test that is more
 *    accurate in either dimension is Blackwell-more-informative, so EVSI is
 *    monotone in sensitivity and in specificity. That monotonicity is what
 *    makes the printed **break-even accuracy** — the accuracy at which the
 *    test first pays for itself — a bisection rather than a guess.
 *  - **Minimax regret (Savage 1951; Loomes & Sugden 1982).** Expected value is
 *    not the only defensible rule. The register reports the minimax-regret
 *    choice beside the expected-value choice, and says so plainly when they
 *    differ, because a leader who cannot absorb the worst case is not being
 *    irrational by refusing the highest expected value.
 *  - **Bayesian diagnostic evidence (Straus et al., *Evidence-Based Medicine*;
 *    Jaeschke, Guyatt & Sackett 1994).** A settled test writes a likelihood
 *    ratio into the existing Premise Sentinel: LR+ = se / (1 − sp) and
 *    LR− = (1 − se) / sp. This is the vertical join that makes the module more
 *    than a calculator — the money decision and the belief ledger are the same
 *    uncertainty, and settling a test moves the belief that the decision rested
 *    on, in the same transaction.
 *  - **Portfolio concentration (Herfindahl 1950; Markowitz 1952 intuition,
 *    not its arithmetic).** Several open decisions that rest on ONE premise are
 *    one bet, not several. The portfolio view names the premise, counts the
 *    decisions that would flip if it were wrong, and prices the swing if it is.
 *    No diversification benefit is claimed and no covariance is invented: the
 *    flip is a declared stress, not a probability.
 *  - **Proper scoring (Brier 1950; Good 1952).** When a frame is settled with
 *    the state that actually occurred, the declared distribution is scored —
 *    multi-class Brier and logarithmic loss — and the *regret actually
 *    incurred* is recorded beside it. Both are withheld below a printed floor.
 *
 * HARD HONESTY BOUNDARIES
 * -----------------------
 *  - **A missing payoff is null, never zero.** An option whose payoff in a
 *    state was never entered makes that row unpriced; EVPI is then `null` with
 *    the count of missing cells printed, because a zero would silently become
 *    the most persuasive number on the page.
 *  - **Probabilities must sum to 100.** The register refuses to save a set that
 *    does not, rather than renormalising a typo into a confident answer.
 *  - **No model of the world.** States, probabilities and payoffs are the
 *    leader's declarations. EVPI is a bound *given* those declarations; it is
 *    not a forecast, and the page says so next to every figure.
 *  - **Information is not free and not sufficient.** EVSI is compared to the
 *    declared cost, and a test whose net value is negative is reported as not
 *    worth buying — including the case where no achievable accuracy would make
 *    it worth buying.
 *  - **Conflicts and anonymous pulses are never read.** The module reads only
 *    the roster, premises, decisions and its own records.
 *
 * Pure module: no DOM, storage, network, `Math.random` or wall clock.
 */

import { addDays, dayKey, daysBetween } from '../time.js';

export const VOI_ENGINE_VERSION = 'information-value-2026.10-v1';

export const VOI_DECISION_STATUSES = Object.freeze(['open', 'decided', 'abandoned']);
export const VOI_DECISION_STATUS_LABELS = Object.freeze({
  open: 'Open — not decided',
  decided: 'Decided (prediction frozen)',
  abandoned: 'Abandoned',
});

export const INQUIRY_STATUSES = Object.freeze(['planned', 'running', 'settled', 'abandoned']);
export const INQUIRY_STATUS_LABELS = Object.freeze({
  planned: 'Planned — nothing bought yet',
  running: 'Running',
  settled: 'Settled — the signal arrived',
  abandoned: 'Abandoned',
});

export const OPEN_INQUIRY_STATUSES = Object.freeze(['planned', 'running']);
export const INQUIRY_SIGNALS = Object.freeze(['positive', 'negative']);
export const INQUIRY_SIGNAL_LABELS = Object.freeze({
  positive: 'The test fired (the target state was observed)',
  negative: 'The test did not fire',
});

export const VOI_MIN_STATES = 2;
export const VOI_MAX_STATES = 6;
export const VOI_MIN_OPTIONS = 2;
export const VOI_MAX_OPTIONS = 5;
export const VOI_MAX_PAYOFF = 1_000_000_000;
export const VOI_LR_MAX = 20;

export const VOI_RULE_IDS = Object.freeze({
  LINKED: 'RULE-VOI-01',
  BUY: 'RULE-VOI-02',
  EVIDENCE: 'RULE-VOI-03',
  CONCENTRATION: 'RULE-VOI-04',
  OUTCOME: 'RULE-VOI-05',
});

export const VOI_RULES = Object.freeze([
  {
    id: VOI_RULE_IDS.LINKED,
    name: 'Typed provenance for a decision frame',
    framework: 'Provenance without copying the record (ADR-0036)',
    trigger: 'voi.declared / voi.updated',
    targetModule: 'voi',
    description: 'Writes typed `rests-on` links from the frame to every premise its states rest on, and an `informs` link to the decision record it belongs to. Re-running cannot duplicate an edge.',
  },
  {
    id: VOI_RULE_IDS.BUY,
    name: 'Buy information, or decide now',
    framework: 'Raiffa & Schlaifer (1961) value of information · DACI',
    trigger: 'voi.declared',
    targetModule: 'voi',
    description: 'When EVPI clears the declared money and share thresholds and nothing has been bought yet, opens exactly one DACI decision about buying information, plus one owned task to scope the cheapest informative test. Never opens a decision per option.',
  },
  {
    id: VOI_RULE_IDS.EVIDENCE,
    name: 'A settled test is evidence in the belief ledger',
    framework: 'Bayes · Straus et al. likelihood ratios · Premise Sentinel',
    trigger: 'inquiry.settled',
    targetModule: 'premises',
    description: 'Converts the arrived signal into LR+ = se/(1−sp) or LR− = (1−se)/sp and appends a dated observation to the premise the decision rests on, so the posterior moves in the same transaction as the money result. Idempotent by observation key.',
  },
  {
    id: VOI_RULE_IDS.CONCENTRATION,
    name: 'One premise, several decisions',
    framework: 'Herfindahl (1950) concentration · correlated-bet discipline',
    trigger: 'voi.declared / inquiry.settled',
    targetModule: 'voi',
    description: 'When a single premise anchors at or above the declared number of open frames, opens exactly one DACI decision about de-risking the shared assumption — never one decision per frame — plus one owned task on the premise owner.',
  },
  {
    id: VOI_RULE_IDS.OUTCOME,
    name: 'A decided frame is held to its own number',
    framework: 'Pre-registration · Brier (1950) proper scoring',
    trigger: 'voi.decided / voi.settled',
    targetModule: 'decisions',
    description: 'On decide, schedules one dated outcome review that restates the frozen EVPI and the chosen option. On settle, records the realised regret and the scored distribution rather than rewriting the prediction.',
  },
]);

/**
 * Declared conventions. Every one of these is a printed number on the page, not
 * a hidden constant, and every one is configurable per workspace.
 */
export const VOI_CONVENTIONS = Object.freeze({
  buyInfoThreshold: 2500,
  buyInfoSharePct: 10,
  concentrationThreshold: 3,
  nearTiePct: 5,
  reviewHorizonDays: 90,
  minScoredFrames: 3,
});

export function conventionsFromSettings(state = {}) {
  const s = state?.settings || {};
  const num = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const int = (value, min, max, fallback) => {
    const n = Math.round(num(value, fallback));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };
  return {
    buyInfoThreshold: Math.min(1e9, Math.max(0, num(s.voiBuyInfoThreshold, VOI_CONVENTIONS.buyInfoThreshold))),
    buyInfoSharePct: int(s.voiBuyInfoSharePct, 0, 100, VOI_CONVENTIONS.buyInfoSharePct),
    concentrationThreshold: int(s.voiConcentrationThreshold, 2, 50, VOI_CONVENTIONS.concentrationThreshold),
    nearTiePct: int(s.voiNearTiePct, 0, 50, VOI_CONVENTIONS.nearTiePct),
    reviewHorizonDays: int(s.voiReviewHorizonDays, 30, 730, VOI_CONVENTIONS.reviewHorizonDays),
    minScoredFrames: int(s.voiMinScoredFrames, 1, 20, VOI_CONVENTIONS.minScoredFrames),
  };
}

/* -------------------------------------------------------------- arithmetic */

function round(value, dp = 2) {
  if (!Number.isFinite(Number(value))) return null;
  const f = 10 ** dp;
  return Math.round(Number(value) * f) / f;
}

function finite(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function cellKey(optionId, stateId) {
  return `${optionId}::${stateId}`;
}

/** The declared payoff table, as a lookup with explicit nulls for gaps. */
export function payoffTable(frame = {}) {
  const states = Array.isArray(frame.states) ? frame.states : [];
  const options = Array.isArray(frame.options) ? frame.options : [];
  const byCell = new Map();
  for (const cell of Array.isArray(frame.payoffs) ? frame.payoffs : []) {
    if (!cell || !cell.optionId || !cell.stateId) continue;
    const value = cell.value === null || cell.value === undefined ? null : finite(cell.value, null);
    byCell.set(cellKey(cell.optionId, cell.stateId), value);
  }
  const get = (optionId, stateId) => {
    const key = cellKey(optionId, stateId);
    return byCell.has(key) ? byCell.get(key) : null;
  };
  let missing = 0;
  let priced = 0;
  for (const option of options) {
    for (const state of states) {
      const value = get(option.id, state.id);
      if (value === null) missing += 1;
      else priced += 1;
    }
  }
  return { get, missing, priced, cells: options.length * states.length };
}

function probabilitySum(states) {
  return states.reduce((acc, state) => acc + (finite(state.probability, 0) || 0), 0);
}

function evForOption({ states, option, table }) {
  let sum = 0;
  for (const state of states) {
    const value = table.get(option.id, state.id);
    if (value === null) return null;
    sum += (finite(state.probability, 0) / 100) * value;
  }
  return sum;
}

function evForOptionWithProbabilities({ states, option, table, probabilities }) {
  let sum = 0;
  for (const state of states) {
    const value = table.get(option.id, state.id);
    if (value === null) return null;
    sum += ((probabilities.get(state.id) ?? 0) / 100) * value;
  }
  return sum;
}

function bestOption({ states, options, table, probabilities }) {
  let best = null;
  for (const option of options) {
    const ev = probabilities
      ? evForOptionWithProbabilities({ states, option, table, probabilities })
      : evForOption({ states, option, table });
    if (ev === null) continue;
    if (!best || ev > best.ev) best = { optionId: option.id, label: option.label, ev };
  }
  return best;
}

/* ------------------------------------------------------------- the frame */

/**
 * The complete reading of one decision frame: expected value per option,
 * EVPI, minimax regret, the indifference gap and the per-state regret table.
 *
 * Every null here is deliberate. `priced: false` means the arithmetic was
 * refused, not that the answer was zero.
 */
export function evaluateFrame(frame = {}, { conventions = VOI_CONVENTIONS } = {}) {
  const states = Array.isArray(frame.states) ? frame.states : [];
  const options = Array.isArray(frame.options) ? frame.options : [];
  const table = payoffTable(frame);
  const sum = probabilitySum(states);
  const probabilitiesOk = states.length >= VOI_MIN_STATES && sum === 100;
  const priced = probabilitiesOk && table.missing === 0 && options.length >= VOI_MIN_OPTIONS;

  const optionRows = options.map((option) => {
    const ev = priced ? evForOption({ states, option, table }) : null;
    return {
      optionId: option.id,
      label: option.label,
      isStatusQuo: Boolean(option.isStatusQuo),
      ev: ev === null ? null : round(ev, 2),
      unpricedCells: states.filter((state) => table.get(option.id, state.id) === null).length,
    };
  });

  const ranked = optionRows
    .filter((row) => row.ev !== null)
    .slice()
    .sort((a, b) => b.ev - a.ev || String(a.optionId).localeCompare(String(b.optionId)));
  const best = ranked[0] || null;
  const runnerUp = ranked[1] || null;

  // Regret table: regret(o, s) = max_o' u(o', s) − u(o, s). Only defined where
  // every option is priced in that state.
  const perState = states.map((state) => {
    const values = options.map((option) => ({ optionId: option.id, value: table.get(option.id, state.id) }));
    const complete = values.every((row) => row.value !== null);
    if (!complete) {
      return {
        stateId: state.id,
        label: state.label,
        probability: finite(state.probability, 0),
        premiseId: state.premiseId || null,
        complete: false,
        bestOptionId: null,
        bestValue: null,
        regretOfPick: null,
      };
    }
    const maxValue = Math.max(...values.map((row) => row.value));
    const winner = values.find((row) => row.value === maxValue);
    return {
      stateId: state.id,
      label: state.label,
      probability: finite(state.probability, 0),
      premiseId: state.premiseId || null,
      complete: true,
      bestOptionId: winner ? winner.optionId : null,
      bestValue: round(maxValue, 2),
      regretOfPick: best ? round(maxValue - table.get(best.optionId, state.id), 2) : null,
    };
  });

  // EVPI needs a complete regret table in every state with non-zero weight.
  let evpi = null;
  let expectedValueOfPerfectInformation = null;
  if (priced && perState.every((row) => row.complete)) {
    expectedValueOfPerfectInformation = perState.reduce(
      (acc, row) => acc + (row.probability / 100) * row.bestValue,
      0,
    );
    if (best) evpi = round(expectedValueOfPerfectInformation - best.ev, 2);
  }

  // Minimax regret: the option whose worst regret across states is smallest.
  let minimaxRegret = null;
  if (priced && perState.every((row) => row.complete)) {
    const rows = options.map((option) => {
      let worst = -Infinity;
      let worstStateId = null;
      for (const row of perState) {
        const value = table.get(option.id, row.stateId);
        const regret = row.bestValue - value;
        if (regret > worst) {
          worst = regret;
          worstStateId = row.stateId;
        }
      }
      return { optionId: option.id, label: option.label, maxRegret: round(worst, 2), worstStateId };
    });
    rows.sort((a, b) => a.maxRegret - b.maxRegret || String(a.optionId).localeCompare(String(b.optionId)));
    minimaxRegret = rows[0] || null;
  }

  const values = [];
  for (const option of options) {
    for (const state of states) {
      const value = table.get(option.id, state.id);
      if (value !== null) values.push(value);
    }
  }
  const maxPayoff = values.length ? Math.max(...values) : null;
  const minPayoff = values.length ? Math.min(...values) : null;
  const range = maxPayoff !== null && minPayoff !== null ? maxPayoff - minPayoff : null;
  const stake = values.length ? Math.max(...values.map((value) => Math.abs(value))) : null;
  const gap = best && runnerUp ? round(best.ev - runnerUp.ev, 2) : null;
  const nearTie = gap !== null && range !== null && range > 0
    ? gap <= (conventions.nearTiePct / 100) * range
    : false;

  const reasons = [];
  if (states.length < VOI_MIN_STATES) reasons.push(`Declare at least ${VOI_MIN_STATES} states of the world.`);
  if (options.length < VOI_MIN_OPTIONS) reasons.push(`Declare at least ${VOI_MIN_OPTIONS} options.`);
  if (states.length && sum !== 100) reasons.push(`The declared state probabilities sum to ${sum}%, not 100%.`);
  if (table.missing) reasons.push(`${table.missing} payoff cell(s) have no value, so the arithmetic is refused rather than filled with a zero.`);

  return {
    probabilitiesOk,
    probabilitySum: sum,
    priced,
    pricedCells: table.priced,
    totalCells: table.cells,
    missingCells: table.missing,
    options: optionRows,
    ranked,
    best,
    runnerUp,
    evpi,
    expectedValueOfPerfectInformation: expectedValueOfPerfectInformation === null ? null : round(expectedValueOfPerfectInformation, 2),
    evpiShareOfStakePct: evpi !== null && stake ? round((evpi / stake) * 100, 1) : null,
    minimaxRegret,
    robustChoiceDiffersFromExpected: Boolean(best && minimaxRegret && minimaxRegret.optionId !== best.optionId),
    gap,
    nearTie,
    stake: stake === null ? null : round(stake, 2),
    range: range === null ? null : round(range, 2),
    perState,
    reasons,
  };
}

/**
 * Swap the two states that carry one premise and re-evaluate. This is the
 * declared stress behind the concentration view: "what if this assumption is
 * wrong?" It is a swap of two declared probabilities, not a probability of the
 * premise being wrong.
 */
export function flipPremise(frame = {}, premiseId, { conventions = VOI_CONVENTIONS } = {}) {
  const states = Array.isArray(frame.states) ? frame.states : [];
  const linked = states.filter((state) => state && state.premiseId === premiseId);
  if (linked.length !== 2) return null;
  const [first, second] = linked;
  if (!Number.isFinite(Number(first.probability)) || !Number.isFinite(Number(second.probability))) return null;
  const flipped = {
    ...frame,
    states: states.map((state) => {
      if (state.id === first.id) return { ...state, probability: second.probability };
      if (state.id === second.id) return { ...state, probability: first.probability };
      return state;
    }),
  };
  const before = evaluateFrame(frame, { conventions });
  const after = evaluateFrame(flipped, { conventions });
  if (!before.priced || !after.priced || !before.best || !after.best) {
    return { flips: false, swing: null, before, after, fromOptionId: before.best?.optionId ?? null, toOptionId: after.best?.optionId ?? null };
  }
  const table = payoffTable(flipped);
  const probabilities = new Map(flipped.states.map((state) => [state.id, state.probability]));
  const keptChoice = evForOptionWithProbabilities({
    states: flipped.states,
    option: { id: before.best.optionId },
    table,
    probabilities,
  });
  const swing = keptChoice === null ? null : round(after.best.ev - keptChoice, 2);
  return {
    flips: before.best.optionId !== after.best.optionId,
    swing,
    before,
    after,
    fromOptionId: before.best.optionId,
    toOptionId: after.best.optionId,
  };
}

/* ------------------------------------------------------------- the inquiry */

/**
 * Likelihood ratio of an observed signal, in the standard diagnostic form.
 *
 *   LR+ = sensitivity / (1 − specificity)
 *   LR− = (1 − sensitivity) / specificity
 *
 * Clamped at `VOI_LR_MAX` because a perfect test has an infinite likelihood
 * ratio, and an infinite weight on one observation is exactly the kind of
 * certainty the Premise Sentinel's Cromwell clamp exists to prevent.
 */
export function likelihoodRatioFor({ signal, sensitivityPct, specificityPct }) {
  const se = Math.min(1, Math.max(0.5, (finite(sensitivityPct, 75) || 75) / 100));
  const sp = Math.min(1, Math.max(0.5, (finite(specificityPct, 75) || 75) / 100));
  const raw = signal === 'positive' ? se / Math.max(0.01, 1 - sp) : (1 - se) / Math.max(0.01, sp);
  const lr = Math.min(VOI_LR_MAX, Math.max(1 / VOI_LR_MAX, raw));
  return {
    lr: round(lr, 3),
    raw: Number.isFinite(raw) ? round(raw, 3) : null,
    clamped: Number.isFinite(raw) ? raw > VOI_LR_MAX : true,
  };
}

/**
 * Posterior over the declared states after a two-signal test.
 * `targetStateIds` are the states the test is designed to detect.
 */
export function posteriorAfterSignal(frame = {}, study = {}, signal = 'positive') {
  const states = Array.isArray(frame.states) ? frame.states : [];
  const targets = new Set(Array.isArray(study.targetStateIds) ? study.targetStateIds : []);
  const se = Math.min(1, Math.max(0.5, (finite(study.sensitivityPct, 75) || 75) / 100));
  const sp = Math.min(1, Math.max(0.5, (finite(study.specificityPct, 75) || 75) / 100));
  // P(observed signal | state): the positive branch is sensitivity on a target
  // state and (1 − specificity) elsewhere; the negative branch is its complement
  // in each case. Using the positive branch for both — the defect this comment
  // exists to prevent — makes every test look like it changed nothing.
  const joint = states.map((state) => {
    const isTarget = targets.has(state.id);
    const observedProbability = signal === 'negative'
      ? (isTarget ? 1 - se : sp)
      : (isTarget ? se : 1 - sp);
    const priorPct = finite(state.probability, 0) || 0;
    return { stateId: state.id, priorPct, fireProbability: observedProbability, joint: (priorPct / 100) * observedProbability };
  });
  const total = joint.reduce((acc, row) => acc + row.joint, 0);
  if (!(total > 0)) return { ok: false, posteriors: [], signalProbabilityPct: 0 };
  return {
    ok: true,
    signalProbabilityPct: round(total * 100, 4),
    posteriors: joint.map((row) => ({
      stateId: row.stateId,
      priorPct: row.priorPct,
      posteriorPct: round((row.joint / total) * 100, 4),
    })),
  };
}

/**
 * EVSI, net value, efficiency against the EVPI ceiling, and the break-even
 * accuracy. `null` everywhere the arithmetic cannot be done honestly.
 */
export function evaluateInquiry(frame = {}, study = {}, { conventions = VOI_CONVENTIONS } = {}) {
  const base = evaluateFrame(frame, { conventions });
  const cost = finite(study.cost, 0) || 0;
  // The fee is not the whole price of learning. A test that takes six weeks
  // costs the value that six weeks of acting would have delivered, and the
  // consulting literature names delay as a first-class deduction for exactly
  // that reason (net value = benefit - fee - delay - effort). The delay figure
  // is declared, never derived: this module has no discount rate and no
  // stochastic option to defer, and saying so is more honest than inventing one.
  const delayCost = finite(study.delayCost, 0) || 0;
  const totalCost = round(cost + delayCost, 2);
  const empty = {
    ok: false,
    reason: '',
    evsi: null,
    netValue: null,
    efficiencyPct: null,
    breakEvenSensitivityPct: null,
    posteriorPositive: null,
    posteriorNegative: null,
    expectedValueIfPositive: null,
    expectedValueIfNegative: null,
    signalProbabilityPct: null,
    cost,
    delayCost,
    totalCost,
    verdict: 'insufficient',
  };
  if (!base.priced) {
    return { ...empty, reason: 'The frame is unpriced, so no test can be valued against it.' };
  }
  if (!(Array.isArray(study.targetStateIds) && study.targetStateIds.length)) {
    return { ...empty, reason: 'Name the state(s) of the world this test is designed to detect.' };
  }
  const states = frame.states || [];
  const options = frame.options || [];
  const table = payoffTable(frame);
  const expectedValueFor = (probabilities) => {
    let bestRow = null;
    for (const option of options) {
      const ev = evForOptionWithProbabilities({
        states,
        option,
        table,
        probabilities: new Map(Object.entries(probabilities).map(([k, v]) => [k, v])),
      });
      if (ev === null) return { optionId: null, ev: null };
      if (!bestRow || ev > bestRow.ev) bestRow = { optionId: option.id, ev };
    }
    return bestRow || { optionId: null, ev: null };
  };

  let positive = posteriorAfterSignal(frame, study, 'positive');
  let negative = posteriorAfterSignal(frame, study, 'negative');
  const signalProbabilities = (() => {
    const se = Math.min(1, Math.max(0.5, (finite(study.sensitivityPct, 75) || 75) / 100));
    const sp = Math.min(1, Math.max(0.5, (finite(study.specificityPct, 75) || 75) / 100));
    const targets = new Set(Array.isArray(study.targetStateIds) ? study.targetStateIds : []);
    const pPositive = states.reduce((acc, state) => {
      const prior = (finite(state.probability, 0) || 0) / 100;
      return acc + prior * (targets.has(state.id) ? se : 1 - sp);
    }, 0);
    return { pPositive, pNegative: 1 - pPositive };
  })();

  const asMap = (rows) => Object.fromEntries(rows.map((row) => [row.stateId, row.posteriorPct]));
  const afterPositive = expectedValueFor(asMap(positive.posteriors));
  const afterNegative = expectedValueFor(asMap(negative.posteriors));

  // A signal with zero prior probability cannot be conditioned on, and a test
  // that cannot fire in any state is not a test.
  if (!(signalProbabilities.pPositive > 0) || !(signalProbabilities.pNegative > 0)
    || afterPositive.ev === null || afterNegative.ev === null || !base.best) {
    return {
      ...empty,
      reason: 'At these probabilities and this accuracy the test can only produce one signal, so it carries no new information.',
      signalProbabilityPct: round(signalProbabilities.pPositive * 100, 2),
    };
  }

  const evsiRaw = (signalProbabilities.pPositive * afterPositive.ev)
    + (signalProbabilities.pNegative * afterNegative.ev)
    - base.best.ev;
  const evsi = round(Math.max(0, evsiRaw), 2);
  const netValue = evsi === null ? null : round(evsi - totalCost, 2);
  const efficiencyPct = base.evpi && base.evpi > 0 ? round((evsi / base.evpi) * 100, 1) : null;

  // Break-even accuracy. EVSI is monotone in sensitivity (Blackwell ordering),
  // so a bisection on sensitivity at the declared specificity is exact enough
  // to print to one decimal place.
  const specificity = Math.min(1, Math.max(0.5, (finite(study.specificityPct, 75) || 75) / 100));
  // A test is useless exactly when sensitivity + specificity = 1 (it is a coin
  // flip dressed as a measurement). Below that line it is worse than useless and
  // EVSI, being bounded below by zero for the decision-maker who can ignore it,
  // is reported as 0.
  const evsiAt = (sensitivity) => {
    if (sensitivity + specificity <= 1) return 0;
    const variant = { ...study, sensitivityPct: sensitivity * 100, specificityPct: specificity * 100 };
    const pos = posteriorAfterSignal(frame, variant, 'positive');
    const neg = posteriorAfterSignal(frame, variant, 'negative');
    const pPos = states.reduce((acc, state) => {
      const prior = (finite(state.probability, 0) || 0) / 100;
      const targets = new Set(variant.targetStateIds);
      return acc + prior * (targets.has(state.id) ? sensitivity : 1 - specificity);
    }, 0);
    const pNeg = 1 - pPos;
    if (!(pPos > 0) || !(pNeg > 0)) return 0;
    const posEv = expectedValueFor(asMap(pos.posteriors));
    const negEv = expectedValueFor(asMap(neg.posteriors));
    if (posEv.ev === null || negEv.ev === null) return 0;
    return Math.max(0, (pPos * posEv.ev) + (pNeg * negEv.ev) - base.best.ev);
  };
  let breakEven = null;
  if (evsiAt(1) < totalCost) {
    breakEven = null; // no achievable sensitivity at this specificity pays for it
  } else {
    const floor = Math.max(0, 1 - specificity);
    let lo = floor + 1e-9;
    let hi = 1;
    for (let i = 0; i < 80; i += 1) {
      const mid = (lo + hi) / 2;
      if (evsiAt(mid) >= totalCost) hi = mid;
      else lo = mid;
    }
    breakEven = Math.ceil(hi * 1000) / 10;
  }

  const verdict = netValue === null ? 'insufficient' : netValue > 0 ? 'buy' : 'not-worth-it';

  return {
    ok: true,
    reason: verdict === 'not-worth-it'
      ? `This test costs ${cost.toLocaleString('en-US')}${delayCost > 0 ? ` and ${delayCost.toLocaleString('en-US')} in waiting` : ''} and is worth at most ${evsi.toLocaleString('en-US')} — its net value is negative, so deciding now is cheaper than learning.`
      : '',
    evsi,
    netValue,
    efficiencyPct,
    breakEvenSensitivityPct: breakEven,
    signalProbabilityPct: round(signalProbabilities.pPositive * 100, 2),
    expectedValueIfPositive: round(afterPositive.ev, 2),
    expectedValueIfNegative: round(afterNegative.ev, 2),
    optionIfPositive: afterPositive.optionId,
    optionIfNegative: afterNegative.optionId,
    posteriorPositive: positive.posteriors,
    posteriorNegative: negative.posteriors,
    cost,
    delayCost,
    totalCost,
    verdict,
  };
}

/* ---------------------------------------------------------------- portfolio */

function premiseTitle(state, premiseId) {
  const premise = (state.premises || []).find((row) => row && row.id === premiseId);
  return premise ? premise.title || 'Untitled premise' : null;
}

/**
 * The portfolio reading across every open frame.
 *
 * The claim it makes is narrow and therefore checkable: *given the declared
 * payoffs and probabilities, flipping this one premise changes the preferred
 * option in N of your open decisions.* It is not a probability, and it is not
 * a covariance estimate.
 */
export function buildVoiPortfolio(state = {}, now = new Date()) {
  const conventions = conventionsFromSettings(state);
  const all = Array.isArray(state.voiDecisions) ? state.voiDecisions : [];
  const studies = Array.isArray(state.voiStudies) ? state.voiStudies : [];
  const open = all.filter((frame) => frame && frame.status === 'open');
  const today = dayKey(now);

  const frames = all.map((frame) => {
    const evaluated = evaluateFrame(frame, { conventions });
    const frameStudies = studies.filter((study) => study && study.frameId === frame.id);
    const activeStudies = frameStudies.filter((study) => OPEN_INQUIRY_STATUSES.includes(study.status));
    const evaluatedStudies = frameStudies.map((study) => ({
      study,
      reading: evaluateInquiry(frame, study, { conventions }),
      overdue: Boolean(study.dueOn && study.dueOn < today && OPEN_INQUIRY_STATUSES.includes(study.status)),
    }));
    return {
      frame,
      evaluated,
      studies: evaluatedStudies,
      activeStudies,
      bestStudy: evaluatedStudies
        .filter((row) => row.reading.ok)
        .sort((a, b) => (b.reading.netValue ?? -Infinity) - (a.reading.netValue ?? -Infinity))[0] || null,
    };
  });

  const openRows = frames.filter((row) => row.frame.status === 'open');

  // Premise anchoring: only frames whose states carry the premise, and only
  // where exactly two states carry it (a swap is defined).
  const anchors = new Map();
  for (const row of openRows) {
    const premiseIds = [...new Set((row.frame.states || []).map((state) => state.premiseId).filter(Boolean))];
    for (const premiseId of premiseIds) {
      const flip = flipPremise(row.frame, premiseId, { conventions });
      if (!flip) continue;
      const entry = anchors.get(premiseId) || {
        premiseId,
        title: premiseTitle(state, premiseId),
        frames: [],
        flips: 0,
        swing: 0,
      };
      entry.frames.push({
        frameId: row.frame.id,
        label: row.frame.label,
        flips: flip.flips,
        swing: flip.swing,
        fromOptionId: flip.fromOptionId,
        toOptionId: flip.toOptionId,
      });
      if (flip.flips) entry.flips += 1;
      if (flip.flips && Number.isFinite(flip.swing)) entry.swing += Math.max(0, flip.swing);
      anchors.set(premiseId, entry);
    }
  }
  const anchorRows = [...anchors.values()]
    .map((entry) => ({ ...entry, swing: round(entry.swing, 2) }))
    .sort((a, b) => b.flips - a.flips || b.swing - a.swing || String(a.premiseId).localeCompare(String(b.premiseId)));

  const anchoredFrames = new Set(anchorRows.flatMap((entry) => entry.frames.map((row) => row.frameId)));
  const shareBase = anchoredFrames.size || 0;
  const hhi = shareBase
    ? round(anchorRows.reduce((acc, entry) => {
      const unique = new Set(entry.frames.map((row) => row.frameId)).size;
      const share = unique / shareBase;
      return acc + (share * share) * 10000;
    }, 0), 0)
    : null;

  const top = anchorRows[0] || null;

  return {
    conventions,
    frames,
    openFrames: openRows,
    anchors: anchorRows,
    anchoredFrameCount: anchoredFrames.size,
    unanchoredFrameCount: openRows.length - anchoredFrames.size,
    hhi,
    topPremise: top,
    concentrationBreach: Boolean(top && top.frames.length >= conventions.concentrationThreshold),
    counts: {
      total: all.length,
      open: openRows.length,
      decided: all.filter((row) => row.status === 'decided').length,
      abandoned: all.filter((row) => row.status === 'abandoned').length,
      priced: openRows.filter((row) => row.evaluated.priced).length,
      unpriced: openRows.filter((row) => !row.evaluated.priced).length,
      studies: studies.length,
      activeStudies: studies.filter((study) => OPEN_INQUIRY_STATUSES.includes(study.status)).length,
      overdueStudies: frames.reduce((acc, row) => acc + row.studies.filter((s) => s.overdue).length, 0),
      nearTies: openRows.filter((row) => row.evaluated.nearTie).length,
      flipsAtRisk: anchorRows.reduce((acc, entry) => acc + entry.flips, 0),
    },
  };
}

/* ----------------------------------------------------------------- signals */

export function voiSignals(state = {}, now = new Date()) {
  const portfolio = buildVoiPortfolio(state, now);
  const conventions = portfolio.conventions;
  const signals = [];
  const push = (signal) => signals.push({
    domain: 'Information value',
    severity: 2,
    priority: 40,
    ...signal,
  });

  // VOI-S1 — the cheapest thing you could learn, where it clears both thresholds.
  const candidates = portfolio.openFrames
    .filter((row) => row.evaluated.priced && row.evaluated.evpi !== null)
    .filter((row) => !row.activeStudies.length)
    .map((row) => {
      const threshold = Math.max(conventions.buyInfoThreshold, ((row.evaluated.stake || 0) * conventions.buyInfoSharePct) / 100);
      return { row, clears: row.evaluated.evpi >= threshold, threshold };
    })
    .filter((entry) => entry.clears)
    .sort((a, b) => b.row.evaluated.evpi - a.row.evaluated.evpi);
  for (const entry of candidates.slice(0, 1)) {
    push({
      ruleId: 'VOI-01',
      severity: 3,
      priority: 62,
      title: `“${entry.row.frame.label}” is worth up to ${money(entry.row.evaluated.evpi, entry.row.frame.currency)} of information`,
      detail: `Perfect information would move the expected value by ${money(entry.row.evaluated.evpi, entry.row.frame.currency)} against a declared stake of ${money(entry.row.evaluated.stake, entry.row.frame.currency)}. Nothing has been bought yet, and the ceiling clears your declared threshold of ${money(entry.threshold, entry.row.frame.currency)}.`,
      evidence: [
        `EVPI ${money(entry.row.evaluated.evpi, entry.row.frame.currency)}`,
        `Stake ${money(entry.row.evaluated.stake, entry.row.frame.currency)}`,
        `Threshold ${money(entry.threshold, entry.row.frame.currency)}`,
        `Open investigations: ${entry.row.activeStudies.length}`,
      ],
      route: `#/voi?frame=${encodeURIComponent(entry.row.frame.id)}&panel=inquiries`,
      action: { label: 'Price a test against this ceiling', route: `#/voi?frame=${encodeURIComponent(entry.row.frame.id)}&panel=inquiries` },
      entityType: 'voi',
      entityId: entry.row.frame.id,
    });
  }

  // VOI-S2 — a test that costs more than it can be worth.
  for (const row of portfolio.openFrames) {
    const bad = row.studies.find((s) => s.reading.ok && s.reading.verdict === 'not-worth-it'
      && OPEN_INQUIRY_STATUSES.includes(s.study.status));
    if (!bad) continue;
    push({
      ruleId: 'VOI-02',
      severity: 2,
      priority: 47,
      title: `“${bad.study.label}” costs more than the information can be worth`,
      detail: `Declared cost of learning ${money(bad.reading.totalCost, row.frame.currency)}${bad.reading.delayCost > 0 ? ` (fee ${money(bad.study.cost, row.frame.currency)} plus ${money(bad.reading.delayCost, row.frame.currency)} of waiting)` : ''}, worth at most ${money(bad.reading.evsi, row.frame.currency)} at the declared accuracy, so its net value is ${money(bad.reading.netValue, row.frame.currency)}.${bad.reading.breakEvenSensitivityPct === null ? ' No achievable sensitivity pays for it at this specificity.' : ` It would first pay at ${bad.reading.breakEvenSensitivityPct}% sensitivity.`}`,
      evidence: [
        `Total cost of learning ${money(bad.reading.totalCost, row.frame.currency)}`,
        `EVSI ${money(bad.reading.evsi, row.frame.currency)}`,
        `Net value ${money(bad.reading.netValue, row.frame.currency)}`,
        `Sensitivity / specificity ${bad.study.sensitivityPct}% / ${bad.study.specificityPct}%`,
      ],
      route: `#/voi?frame=${encodeURIComponent(row.frame.id)}&panel=inquiries`,
      action: { label: 'Review or drop this test', route: `#/voi?frame=${encodeURIComponent(row.frame.id)}&panel=inquiries` },
      entityType: 'voi',
      entityId: row.frame.id,
    });
  }

  // VOI-S3 — an indifference zone: a cheap test has unusual leverage here.
  for (const row of portfolio.openFrames.slice().sort((a, b) => (b.evaluated.evpi ?? -1) - (a.evaluated.evpi ?? -1)).slice(0, 3)) {
    if (!row.evaluated.nearTie || row.activeStudies.length) continue;
    push({
      ruleId: 'VOI-03',
      severity: 2,
      priority: 44,
      title: `“${row.frame.label}” is a near-tie — small evidence moves it`,
      detail: `The top two options are ${money(Math.abs(row.evaluated.gap || 0), row.frame.currency)} apart against a payoff range of ${money(row.evaluated.range, row.frame.currency)}. An indifference zone is where a cheap test has the most leverage, and where deciding on preference alone is legitimate too — but say which you are doing.`,
      evidence: [
        `Gap between the top two options ${money(Math.abs(row.evaluated.gap || 0), row.frame.currency)}`,
        `Payoff range ${money(row.evaluated.range, row.frame.currency)}`,
        `EVPI ${money(row.evaluated.evpi, row.frame.currency)}`,
      ],
      route: `#/voi?frame=${encodeURIComponent(row.frame.id)}&panel=frames`,
      action: { label: 'Look at the payoff table', route: `#/voi?frame=${encodeURIComponent(row.frame.id)}&panel=frames` },
      entityType: 'voi',
      entityId: row.frame.id,
    });
  }

  // VOI-S4 — one premise, several decisions.
  if (portfolio.topPremise && portfolio.concentrationBreach) {
    const top = portfolio.topPremise;
    push({
      ruleId: 'VOI-04',
      severity: 4,
      priority: 74,
      title: `One assumption anchors ${top.frames.length} open decisions`,
      detail: `“${top.title || 'A premise that no longer exists'}” appears in ${top.frames.length} open frames; flipping it changes the preferred option in ${top.flips} of them, a swing of ${money(top.swing, 'USD')} across the portfolio. These are one bet, not ${top.frames.length} — which is exactly the correlation that gets discovered after the fact. The flip is a declared stress, not a probability that the premise is wrong, and no covariance is estimated.`,
      evidence: [
        `Open frames resting on this premise: ${top.frames.length}`,
        `Preferred option changes in ${top.flips}`,
        `Declared swing ${money(top.swing, 'USD')}`,
        `Concentration (HHI) ${portfolio.hhi ?? 'not computable'}`,
      ],
      route: '#/voi?panel=portfolio',
      action: { label: 'Open the concentration reading', route: '#/voi?panel=portfolio' },
      entityType: 'voi',
      entityId: top.premiseId,
    });
  }

  // VOI-S5 — an overdue test is a decision that quietly got postponed.
  for (const row of portfolio.openFrames) {
    for (const study of row.studies) {
      if (!study.overdue) continue;
      const days = Math.max(0, daysBetween(study.study.dueOn, dayKey(now)) ?? 0);
      push({
        ruleId: 'VOI-05',
        severity: 3,
        priority: 58,
        title: `“${study.study.label}” is ${days} day(s) overdue`,
        detail: `A test that was going to settle a ${money(row.evaluated.stake, row.frame.currency)} question has not reported. An investigation that drifts is a decision being made by default, and the cost of the delay is real even when nothing looks wrong.`,
        evidence: [
          `Due ${study.study.dueOn}`,
          `Overdue by ${days} day(s)`,
          `Declared wait ${money(study.study.delayCost || 0, row.frame.currency)}`,
        ],
        route: `#/voi?frame=${encodeURIComponent(row.frame.id)}&panel=inquiries`,
        action: { label: 'Record the answer or abandon it', route: `#/voi?frame=${encodeURIComponent(row.frame.id)}&panel=inquiries` },
        entityType: 'voi',
        entityId: row.frame.id,
      });
    }
  }

  // VOI-S6 — the arithmetic was refused, and that is the signal.
  for (const row of portfolio.openFrames) {
    if (row.evaluated.priced) continue;
    push({
      ruleId: 'VOI-06',
      severity: 2,
      priority: 38,
      title: `“${row.frame.label}” cannot be valued yet`,
      detail: row.evaluated.reasons.join(' ') || 'The frame is incomplete.',
      evidence: [
        `States ${row.frame.states.length}`,
        `Options ${row.frame.options.length}`,
        `Missing payoff cells ${row.evaluated.missingCells ?? 0}`,
      ],
      route: `#/voi?frame=${encodeURIComponent(row.frame.id)}&panel=frames`,
      action: { label: 'Complete the payoff table', route: `#/voi?frame=${encodeURIComponent(row.frame.id)}&panel=frames` },
      entityType: 'voi',
      entityId: row.frame.id,
    });
  }

  return signals;
}

export function voiAttentionCount(state = {}, now = new Date()) {
  return voiSignals(state, now).filter((signal) => signal.severity >= 3).length;
}

/* ------------------------------------------------------------------- scoring */

/**
 * Multi-class Brier and logarithmic loss over the declared distribution, using
 * the state that actually occurred. Withheld below one settled outcome.
 */
export function scoreFrame(frame = {}) {
  const outcomes = Array.isArray(frame.outcomes) ? frame.outcomes : [];
  const states = Array.isArray(frame.states) ? frame.states : [];
  const rows = outcomes
    .filter((row) => row && row.realizedStateId && Array.isArray(row.probabilities))
    .map((row) => {
      const lookup = new Map(row.probabilities.map((entry) => [entry.stateId, entry.pct]));
      const brier = states.reduce((acc, state) => {
        const declared = (lookup.get(state.id) ?? 0) / 100;
        const observed = state.id === row.realizedStateId ? 1 : 0;
        return acc + (declared - observed) ** 2;
      }, 0);
      const realized = (lookup.get(row.realizedStateId) ?? 0) / 100;
      return {
        on: row.on,
        realizedStateId: row.realizedStateId,
        brier: round(brier, 4),
        logLoss: realized > 0 ? round(-Math.log(realized), 4) : null,
        regret: Number.isFinite(Number(row.regret)) ? round(row.regret, 2) : null,
      };
    });
  const withBrier = rows.filter((row) => row.brier !== null);
  return {
    rows,
    count: rows.length,
    meanBrier: withBrier.length ? round(withBrier.reduce((acc, row) => acc + row.brier, 0) / withBrier.length, 4) : null,
    meanLogLoss: (() => {
      const values = rows.map((row) => row.logLoss).filter((value) => value !== null);
      return values.length ? round(values.reduce((acc, v) => acc + v, 0) / values.length, 4) : null;
    })(),
    realizedRegret: rows.reduce((acc, row) => acc + (row.regret || 0), 0),
  };
}

/* --------------------------------------------------------------------- brief */

function money(value, currency = 'USD') {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'not priced';
  return `${String(currency || 'USD').toUpperCase()} ${Math.round(Number(value)).toLocaleString('en-US')}`;
}

export function voiBrief(state = {}, now = new Date()) {
  const portfolio = buildVoiPortfolio(state, now);
  const conventions = portfolio.conventions;
  const lines = [];
  lines.push('LEADOS — INFORMATION VALUE BRIEF');
  lines.push(`Generated ${dayKey(now)} · engine ${VOI_ENGINE_VERSION}`);
  lines.push('');
  lines.push(`Open frames: ${portfolio.counts.open} (${portfolio.counts.priced} priced, ${portfolio.counts.unpriced} priced not at all)`);
  lines.push(`Studies: ${portfolio.counts.studies} declared, ${portfolio.counts.activeStudies} open, ${portfolio.counts.overdueStudies} overdue`);
  lines.push('');
  lines.push('WHAT INFORMATION WOULD BE WORTH (EVPI ceiling)');
  const priced = portfolio.openFrames
    .filter((row) => row.evaluated.evpi !== null)
    .sort((a, b) => b.evaluated.evpi - a.evaluated.evpi);
  if (!priced.length) lines.push('  none — no open frame has a complete payoff table.');
  for (const row of priced.slice(0, 8)) {
    const best = row.evaluated.best;
    const bestLabel = best ? (row.frame.options.find((option) => option.id === best.optionId)?.label || best.optionId) : '—';
    lines.push(`  ${row.frame.label}: EV ${money(best ? best.ev : null, row.frame.currency)} on “${bestLabel}”; perfect information worth at most ${money(row.evaluated.evpi, row.frame.currency)} (${row.evaluated.evpiShareOfStakePct ?? '—'}% of stake).`);
  }
  lines.push('');
  lines.push('INVESTIGATIONS');
  const withStudies = portfolio.openFrames.filter((row) => row.studies.length);
  if (!withStudies.length) lines.push('  none declared.');
  for (const row of withStudies.slice(0, 8)) {
    for (const study of row.studies) {
      const reading = study.reading;
      lines.push(`  ${row.frame.label} · ${study.study.label}: ${INQUIRY_STATUS_LABELS[study.study.status] || study.study.status}; ${reading.ok
        ? `EVSI ${money(reading.evsi, row.frame.currency)}, cost ${money(reading.cost, row.frame.currency)}, net ${money(reading.netValue, row.frame.currency)}, ${reading.efficiencyPct === null ? 'no ceiling' : `${reading.efficiencyPct}% of the EVPI ceiling`}${reading.breakEvenSensitivityPct === null ? ', never pays for itself at any accuracy' : `, break-even sensitivity ${reading.breakEvenSensitivityPct}%`}`
        : `not valued: ${reading.reason}`}`);
    }
  }
  lines.push('');
  lines.push('CONCENTRATION');
  if (!portfolio.anchors.length) {
    lines.push('  no open frame rests on a named premise.');
  } else {
    lines.push(`  ${portfolio.anchoredFrameCount} of ${portfolio.counts.open} open frames rest on a named premise; HHI ${portfolio.hhi ?? 'not computable'} (declared threshold: ${conventions.concentrationThreshold} decisions on one premise).`);
    for (const anchor of portfolio.anchors.slice(0, 5)) {
      lines.push(`  ${anchor.title || anchor.premiseId}: ${anchor.frames.length} frame(s), ${anchor.flips} would flip, swing ${money(anchor.swing, 'USD')}.`);
    }
  }
  lines.push('');
  lines.push('CONVENTIONS AND WHAT THIS DOES NOT CLAIM');
  lines.push(`  A frame is priced only when every option has a value in every state and the declared probabilities sum to 100%. Missing cells are null, never zero.`);
  lines.push(`  EVPI is a bound given the leader's declared payoffs and probabilities. It is not a forecast, and it is not evidence that any option will deliver.`);
  lines.push(`  Information is worth buying only when net value is positive against a declared cost. The break-even accuracy assumes EVSI is monotone in sensitivity (Blackwell 1951/1953).`);
  lines.push(`  The concentration view is a declared stress — the two states carrying a premise are swapped — not a probability that the premise is wrong. No covariance is estimated.`);
  lines.push(`  A settled test writes LR+ = se/(1−sp) or LR− = (1−se)/sp into the Premise Sentinel as one dated observation. It does not prove the decision was right.`);
  return lines.join('\n');
}
