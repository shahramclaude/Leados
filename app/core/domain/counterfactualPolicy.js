/**
 * app/core/domain/counterfactualPolicy.js — the Counterfactual Policy Engine
 * (Schema v76, ADR-0068).
 *
 * Pure, deterministic, write-free domain module. No DOM, storage, network or
 * global clock. Confidential conflict records (`state.conflicts`), anonymous
 * pulse responses (`state.pulses`) and candidate files (`state.candidates`)
 * are never read here. No person is ever a unit, an arm or a reward.
 *
 * The question: "Would a named, fully-specified alternative policy have scored
 * better than the way I actually decided?" answered from bandit feedback the
 * leader's own workspace already logged — one observed reward per decision
 * point, under the arm that was actually taken, and never under the other one.
 *
 * Named frameworks implemented:
 *  1. Off-policy evaluation (Dudík, Langford & Li 2011; Robins, Rotnitzky &
 *     Zhao 1994; Bang & Robins 2005): direct method, Horvitz–Thompson (1952)
 *     IPS, Hájek (1971) self-normalised IPS and the doubly-robust combination,
 *     with an effective-sample-size (Kong 1992) diagnostic.
 *  2. Manski (1990) partial identification: with no assumption on the unchosen
 *     arm the value is an interval, not a point. Reported twice — once with no
 *     assumption at all ([0, 1]) and once bounded by the rewards actually
 *     observed in the same family.
 *  3. Rosenbaum (1987, 2002) sensitivity analysis for hidden bias in matched
 *     pairs: the paired binary case reduces to McNemar (1947) under a
 *     bounded-binomial worst case; the design sensitivity Gamma* is the
 *     magnitude of unobserved confounding needed to overturn the finding.
 *  4. Dawid (1984) prequential discipline: every evaluated policy chooses its
 *     arm at point i using only points strictly before i, so no point is ever
 *     scored by a rule that had seen its outcome.
 *  5. Howard, Ramdas, McAuliffe & Sekhon (2021) time-uniform confidence
 *     sequences: a Hoeffding stitched boundary valid at every stopping time,
 *     so a leader who re-reads this terminal every morning is not quietly
 *     spending an unreported false-positive budget.
 *  6. Stuart (2010) covariate balance: absolute standardised mean differences
 *     before and after greedy nearest-neighbour matching inside a caliper.
 */

import { dayKey } from '../time.js';
import { computeFmea } from './cases.js';
import {
  COUNTERFACTUAL_ENGINE_VERSION,
  COUNTERFACTUAL_LIMITS,
  POLICY_FAMILIES,
  POLICY_FAMILY_META,
  POLICY_IDS,
  POLICY_META,
  POLICY_VERDICT_META,
} from './counterfactualRegistry.js';
import { normalizeCounterfactualSettings } from './counterfactualPolicySchema.js';

const Z_95 = 1.959963984540054;

/**
 * Authority granted at delegation time, as an ordinal for matching. Declared
 * when the work is handed over, so it is a legitimate pre-treatment covariate.
 */
const DELEGATION_AUTHORITY_ORDER = Object.freeze({
  recommend: 1,
  agree: 2,
  'act-inform': 3,
  own: 4,
});

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function round3(n) {
  return Math.round(Number(n) * 1000) / 1000;
}

function round4(n) {
  return Math.round(Number(n) * 10000) / 10000;
}

/** Warnings are reported once each, however many estimators produce them. */
function pushWarning(warnings, message) {
  if (!warnings) return;
  if (warnings.includes(message)) return;
  warnings.push(message);
}

function mean(list) {
  if (!list.length) return null;
  let s = 0;
  for (const v of list) s += v;
  return s / list.length;
}

function sd(list) {
  if (list.length < 2) return null;
  const m = mean(list);
  let s = 0;
  for (const v of list) s += (v - m) ** 2;
  return Math.sqrt(s / (list.length - 1));
}

function diffDays(fromDay, toDay) {
  if (!fromDay || !toDay) return null;
  const a = Date.parse(`${fromDay}T00:00:00.000Z`);
  const b = Date.parse(`${toDay}T00:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/** mulberry32 — deterministic, seedable, no global state. */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ *
 * 1. Harvesting decision points from records the leader already keeps.
 * ------------------------------------------------------------------ */

/**
 * Every adapter yields a unit with:
 *   family   — which kind of decision point
 *   arm      — 0 or 1, the arm the RECORD shows was taken
 *   reward   — the observed score in [0, 1] under that arm, never the other
 *   decidedOn — the day the arm was effectively taken
 *   settledOn — the day a human recorded the outcome
 *   covariates — declared, numeric, and available at decision time
 *
 * A unit whose outcome was never recorded does not exist. Nothing is imputed.
 */
function pushUnit(out, unit) {
  if (!unit || unit.reward === null || unit.reward === undefined) return;
  if (!POLICY_FAMILIES.includes(unit.family)) return;
  out.push(unit);
}

function harvestAssumptions(state) {
  const units = [];
  const premises = new Map((state.premises || []).map((p) => [p && p.id, p]));
  const firstOutcome = new Map();
  for (const o of state.premiseOutcomes || []) {
    if (!o || !o.premiseId || o.verdict === 'inconclusive') continue;
    const prev = firstOutcome.get(o.premiseId);
    if (!prev || String(o.settledOn) < String(prev.settledOn)) firstOutcome.set(o.premiseId, o);
  }
  for (const [premiseId, outcome] of firstOutcome) {
    const p = premises.get(premiseId);
    if (!p) continue;
    const settledOn = outcome.settledOn;
    const createdDay = String(p.createdAt || '').slice(0, 10);
    const observations = Array.isArray(p.observations) ? p.observations : [];
    const tested = observations.some((o) => o && o.observedOn && String(o.observedOn) <= String(settledOn));
    pushUnit(units, {
      id: `assumption:${premiseId}`,
      family: 'assumption',
      sourceType: 'premise',
      sourceId: premiseId,
      arm: tested ? 1 : 0,
      reward: outcome.verdict === 'held' ? 1 : 0,
      decidedOn: createdDay || settledOn,
      settledOn,
      covariates: {
        // PRE-TREATMENT only. The number of observations IS the treatment, and
        // the settlement date is downstream of it — matching on either would
        // guarantee zero overlap and fake a refusal.
        horizon: diffDays(createdDay, p.reviewBy || settledOn),
        prior: Number.isFinite(Number(p.priorPct)) ? Number(p.priorPct) : null,
      },
    });
  }
  return units;
}

function harvestDecisions(state) {
  const units = [];
  for (const d of state.decisions || []) {
    if (!d || !d.chosen || !d.decidedOn || !d.reviewOn) continue;
    if (!['good', 'mixed', 'bad'].includes(d.outcome)) continue;
    const onTime = String(d.decidedOn) <= String(d.reviewOn);
    pushUnit(units, {
      id: `decision:${d.id}`,
      family: 'decision',
      sourceType: 'decision',
      sourceId: d.id,
      arm: onTime ? 1 : 0,
      reward: d.outcome === 'good' ? 1 : d.outcome === 'mixed' ? 0.5 : 0,
      decidedOn: d.decidedOn,
      settledOn: d.reviewedOn || d.decidedOn,
      covariates: {
        // PRE-TREATMENT: both are written when the decision is created. The
        // delay itself is the treatment and is deliberately excluded.
        horizon: diffDays(d.date, d.reviewOn),
        prior: Number.isFinite(Number(d.forecastProbability)) ? Number(d.forecastProbability) : null,
      },
    });
  }
  return units;
}

function harvestDelegations(state) {
  const units = [];
  for (const dl of state.delegations || []) {
    if (!dl || (dl.status !== 'done' && dl.status !== 'returned')) continue;
    if (!dl.dueOn || !dl.delegatedOn) continue;
    const terminalOn = dl.completedOn || dl.returnedOn;
    if (!terminalOn) continue;
    const checkins = Array.isArray(dl.checkins) ? dl.checkins : [];
    const checked = checkins.some((c) => c && c.date && String(c.date) <= String(dl.dueOn));
    pushUnit(units, {
      id: `delegation:${dl.id}`,
      family: 'delegation',
      sourceType: 'delegation',
      sourceId: dl.id,
      arm: checked ? 1 : 0,
      reward: dl.status === 'done' && dl.completedOn && String(dl.completedOn) <= String(dl.dueOn) ? 1 : 0,
      decidedOn: dl.delegatedOn,
      settledOn: terminalOn,
      covariates: {
        // PRE-TREATMENT: the horizon and the authority granted are both fixed
        // at delegation time. The check-in count is the treatment.
        horizon: diffDays(dl.delegatedOn, dl.dueOn),
        prior: DELEGATION_AUTHORITY_ORDER[dl.authority] ?? null,
      },
    });
  }
  return units;
}

function harvestCases(state) {
  const units = [];
  for (const c of state.cases || []) {
    if (!c || (c.status !== 'resolved' && c.status !== 'closed')) continue;
    const a = c.actuals;
    if (!a || a.materialised !== true && a.materialised !== false) continue;
    const fmea = computeFmea(c.fmea);
    const spent = Number(a.mitigationSpend);
    pushUnit(units, {
      id: `case:${c.id}`,
      family: 'case',
      sourceType: 'case',
      sourceId: c.id,
      arm: Number.isFinite(spent) && spent > 0 ? 1 : 0,
      reward: a.materialised === false ? 1 : 0,
      decidedOn: c.openedOn || String(c.createdAt || '').slice(0, 10),
      settledOn: a.settledOn || c.resolvedOn || dayKey(new Date()),
      covariates: {
        // PRE-TREATMENT: the FMEA ratings are the leader's own declared
        // assessment, recorded when the case was opened.
        horizon: Number.isFinite(fmea?.rpn) ? fmea.rpn : null,
        prior: Number.isFinite(Number(c.fmea?.severity)) ? Number(c.fmea.severity) : null,
      },
    });
  }
  return units;
}

/**
 * Harvest every decision point the workspace can already score.
 *
 * Deterministic ordering: by the day the arm was taken, then by id, so the
 * prequential policies below always see the same history in the same order.
 */
export function harvestPolicyUnits(state = {}, now = new Date()) {
  const today = dayKey(now);
  const units = [
    ...harvestAssumptions(state),
    ...harvestDecisions(state),
    ...harvestDelegations(state),
    ...harvestCases(state),
  ]
    .filter((u) => u.decidedOn && u.settledOn && String(u.settledOn) <= today)
    .sort((a, b) => (a.decidedOn === b.decidedOn
      ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
      : (a.decidedOn < b.decidedOn ? -1 : 1)));

  for (const u of units) {
    const meta = POLICY_FAMILY_META[u.family];
    u.familyLabel = meta.label;
    u.armLabel = u.arm === 1 ? meta.arm1Label : meta.arm0Label;
    u.armOtherLabel = u.arm === 1 ? meta.arm0Label : meta.arm1Label;
    u.rewardLabel = meta.rewardLabel;
  }
  return units;
}

/* ------------------------------------------------------------------ *
 * 2. Behavioural propensity & outcome model
 * ------------------------------------------------------------------ */

/**
 * Laplace-smoothed per-family propensity, clipped for positivity.
 *
 * The behavioural policy is ESTIMATED, not known, and the terminal says so:
 * a weight larger than 1/minPropensity would let a single decision point stand
 * for twenty and no honest interval survives that.
 */
function buildPropensity(units, warnings) {
  const counts = new Map();
  for (const u of units) {
    const row = counts.get(u.family) || { n: 0, arm0: 0, arm1: 0 };
    row.n += 1;
    row[u.arm === 1 ? 'arm1' : 'arm0'] += 1;
    counts.set(u.family, row);
  }
  const model = new Map();
  let clipped = 0;
  for (const [family, row] of counts) {
    const raw = {
      0: (row.arm0 + 1) / (row.n + 2),
      1: (row.arm1 + 1) / (row.n + 2),
    };
    const p = {};
    for (const arm of [0, 1]) {
      const before = raw[arm];
      p[arm] = Math.min(COUNTERFACTUAL_LIMITS.maxPropensity, Math.max(COUNTERFACTUAL_LIMITS.minPropensity, before));
      if (p[arm] !== before) clipped += 1;
    }
    model.set(family, { ...row, raw, p, clipped: p[0] !== raw[0] || p[1] !== raw[1] });
  }
  if (clipped && warnings) {
    pushWarning(warnings, `${clipped} behavioural propensity estimate(s) hit the ${COUNTERFACTUAL_LIMITS.minPropensity}–${COUNTERFACTUAL_LIMITS.maxPropensity} positivity clamp; weights were bounded rather than trusted.`);
  }
  return model;
}

/**
 * Shrunk outcome model Q(family, arm). Cells with no observations fall back to
 * the family mean and are flagged — an outcome model that invents a cell is the
 * one failure mode the doubly-robust estimator cannot repair on its own.
 */
function buildOutcomeModel(units) {
  const cells = new Map();
  const familyMeans = new Map();
  const famSums = new Map();
  for (const u of units) {
    const f = famSums.get(u.family) || { n: 0, s: 0 };
    f.n += 1;
    f.s += u.reward;
    famSums.set(u.family, f);
    const key = `${u.family}:${u.arm}`;
    const c = cells.get(key) || { n: 0, s: 0 };
    c.n += 1;
    c.s += u.reward;
    cells.set(key, c);
  }
  for (const [family, f] of famSums) familyMeans.set(family, f.s / f.n);

  const q = (family, arm) => {
    const c = cells.get(`${family}:${arm}`);
    const fm = familyMeans.get(family);
    if (!c || c.n === 0) return { value: fm ?? null, n: 0, extrapolated: true };
    const m = COUNTERFACTUAL_LIMITS.priorPseudoCount;
    const prior = fm ?? 0.5;
    return { value: (c.s + m * prior) / (c.n + m), n: c.n, extrapolated: false };
  };
  return { q, cells, familyMeans };
}

/* ------------------------------------------------------------------ *
 * 3. Preqential policies
 * ------------------------------------------------------------------ */

function runningMean(history, family, arm, halfLifeDays, today) {
  let num = 0;
  let den = 0;
  let count = 0;
  for (const h of history) {
    if (h.family !== family || h.arm !== arm) continue;
    let w = 1;
    if (halfLifeDays && h.settledOn && today) {
      const age = diffDays(h.settledOn, today);
      if (age !== null && age >= 0) w = 2 ** (-age / halfLifeDays);
      else if (age !== null && age < 0) w = 1;
    }
    num += w * h.reward;
    den += w;
    count += 1;
  }
  return den > 0 ? { value: num / den, count, weight: den } : { value: null, count: 0, weight: 0 };
}

/**
 * Choose the arm every policy would take at `unit`, given only the strictly
 * earlier history. Returns a map policyId -> arm.
 */
export function policyChoices(policyIds, unit, history, today) {
  const out = {};
  for (const id of policyIds) {
    if (id === 'observed') {
      out[id] = unit.arm;
      continue;
    }
    if (id === 'always-act') {
      out[id] = 1;
      continue;
    }
    if (id === 'always-hold') {
      out[id] = 0;
      continue;
    }
    if (id === 'prequential-best') {
      const a0 = runningMean(history, unit.family, 0, null, null);
      const a1 = runningMean(history, unit.family, 1, null, null);
      if (a0.count < COUNTERFACTUAL_LIMITS.minPriorPerArm || a1.count < COUNTERFACTUAL_LIMITS.minPriorPerArm) {
        out[id] = 1; // declared default while either arm is untested
      } else if (a1.value > a0.value) out[id] = 1;
      else if (a0.value > a1.value) out[id] = 0;
      else out[id] = 1;
      continue;
    }
    if (id === 'adaptive-recent') {
      const a0 = runningMean(history, unit.family, 0, COUNTERFACTUAL_LIMITS.recentHalfLifeDays, today);
      const a1 = runningMean(history, unit.family, 1, COUNTERFACTUAL_LIMITS.recentHalfLifeDays, today);
      if (a0.count < COUNTERFACTUAL_LIMITS.minPriorPerArm || a1.count < COUNTERFACTUAL_LIMITS.minPriorPerArm) {
        out[id] = 1;
      } else if (a1.value > a0.value) out[id] = 1;
      else if (a0.value > a1.value) out[id] = 0;
      else out[id] = 1;
      continue;
    }
    out[id] = unit.arm;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 4. Estimators
 * ------------------------------------------------------------------ */

/**
 * Evaluate one target policy over one ordered unit list.
 *
 * `history` for the prequential policies is built in the same pass, so the
 * choice at unit i can never see unit i (or anything after it).
 */
export function evaluatePolicy(units, policyId, { propensity, outcome, warnings } = {}) {
  const n = units.length;
  if (!n) return null;
  const today = units[n - 1].settledOn;
  const history = [];
  const choices = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const u = units[i];
    choices[i] = policyChoices([policyId], u, history, today)[policyId];
    history.push({ family: u.family, arm: u.arm, reward: u.reward, settledOn: u.settledOn });
  }

  let sumY = 0;
  let ipsNum = 0;
  let snipsNum = 0;
  let snipsDen = 0;
  let drNum = 0;
  let dmNum = 0;
  let sumW = 0;
  let sumW2 = 0;
  let matched = 0;
  let knownMiss = 0;
  let extrapolatedCells = 0;
  let clippedWeights = 0;

  for (let i = 0; i < n; i += 1) {
    const u = units[i];
    const pi = choices[i];
    sumY += u.reward;
    const pModel = propensity?.get(u.family);
    const mu = pModel ? pModel.p[u.arm] : null;
    const qPi = outcome ? outcome.q(u.family, pi) : { value: null, extrapolated: true };
    if (qPi.extrapolated) extrapolatedCells += 1;

    // Direct method: the modelled reward under the arm the policy would take.
    dmNum += qPi.value === null ? 0 : qPi.value;

    if (u.arm === pi) {
      matched += 1;
      knownMiss += u.reward;
      if (mu !== null) {
        const w = 1 / mu;
        sumW += w;
        sumW2 += w * w;
        ipsNum += w * u.reward;
        snipsNum += w * u.reward;
        snipsDen += w;
        const qArm = outcome ? outcome.q(u.family, u.arm) : { value: null };
        drNum += (qPi.value === null ? 0 : qPi.value) + w * (u.reward - (qArm.value === null ? u.reward : qArm.value));
        if (pModel && pModel.p[u.arm] !== pModel.raw[u.arm]) clippedWeights += 1;
      }
    } else if (mu !== null) {
      // The policy agrees with the arm that was NOT taken: the IPS/DR
      // correction contributes nothing, and the reward stays unobserved.
      sumW += 0;
      drNum += qPi.value === null ? 0 : qPi.value;
    } else {
      drNum += qPi.value === null ? 0 : qPi.value;
    }
  }

  const observed = sumY / n;
  // The behaviour policy is EXACTLY identified: every unit contributed the arm
  // it took and the reward that arm produced, so its value is the plain mean
  // and needs no weight, no model and no correction. Running the estimators on
  // it anyway would report a corrected number against a known one.
  const isObservedPolicy = policyId === 'observed';
  const ips = isObservedPolicy ? observed : ipsNum / n;
  const snips = isObservedPolicy ? observed : (snipsDen > 0 ? snipsNum / snipsDen : null);
  const dm = isObservedPolicy ? observed : dmNum / n;
  const dr = isObservedPolicy ? observed : drNum / n;
  const ess = isObservedPolicy ? n : (sumW2 > 0 ? (sumW * sumW) / sumW2 : 0);

  // Which number leads. Under poor overlap the inverse-propensity weight on a
  // rarely-taken arm can exceed ten, and one decision point then moves the
  // doubly-robust estimate by eight points — a point estimate with that
  // variance is not a finding. The self-normalised estimator (Hajek 1971;
  // Swaminathan & Joachims 2015) is bounded by the reward range, so it leads;
  // the unnormalised estimators stay on the panel as cross-checks, and the
  // spread between them is reported as the fragility diagnostic it is.
  const value = isObservedPolicy
    ? observed
    : (snips !== null ? snips : (dm !== null ? dm : dr));
  const spreadValues = [dm, ips, snips, dr].filter((v) => v !== null && Number.isFinite(v));
  const crossCheckSpreadPp = spreadValues.length > 1
    ? round2((Math.max(...spreadValues) - Math.min(...spreadValues)) * 100)
    : null;

  // Manski (1990) partial identification. Two nests of assumptions.
  const missing = n - matched;
  const famRange = new Map();
  for (const u of units) {
    const r = famRange.get(u.family) || { lo: 1, hi: 0 };
    r.lo = Math.min(r.lo, u.reward);
    r.hi = Math.max(r.hi, u.reward);
    famRange.set(u.family, r);
  }
  let famLo = 0;
  let famHi = 0;
  for (let i = 0; i < n; i += 1) {
    if (u_armMatches(units[i], choices[i])) continue;
    const r = famRange.get(units[i].family) || { lo: 0, hi: 1 };
    famLo += r.lo;
    famHi += r.hi;
  }
  const manski = {
    noAssumption: {
      low: (knownMiss + missing * 0) / n,
      high: (knownMiss + missing * 1) / n,
      signDetermined: n > 0 && (missing === 0 || ((knownMiss + missing * 0) / n > observed && missing === 0)),
    },
    familyObserved: {
      low: (knownMiss + famLo) / n,
      high: (knownMiss + famHi) / n,
    },
    missingFraction: round4(missing / n),
  };
  manski.noAssumption.signDetermined = missing === 0
    || manski.noAssumption.low > observed
    || manski.noAssumption.high < observed;
  manski.familyObserved.signDetermined = missing === 0
    || manski.familyObserved.low > observed
    || manski.familyObserved.high < observed;

  if (warnings && extrapolatedCells > 0) {
    pushWarning(warnings, `${extrapolatedCells} decision point(s) were scored by an outcome model with no observation in that cell; the value falls back to the family mean and is flagged.`);
  }

  return {
    policyId,
    observed,
    value: round4(value),
    crossCheckSpreadPp,
    dm: round4(dm),
    ips: round4(ips),
    snips: snips === null ? null : round4(snips),
    dr: round4(dr),
    effectiveSample: round2(ess),
    agreementPct: round2((matched / n) * 100),
    missingFraction: manski.missingFraction,
    manski,
    diagnostics: {
      extrapolatedCells,
      clippedWeights,
      missing,
      matched,
    },
  };
}

function u_armMatches(u, pi) {
  return u.arm === pi;
}

/**
 * Stratified (within-family) nonparametric bootstrap on the doubly-robust
 * estimate, seeded so the interval is identical on every render.
 *
 * Deliberately allocation-light: this runs inside a read model that is rebuilt
 * on every screen, so the inner loop walks pre-flattened typed arrays instead
 * of rebuilding Maps four hundred times.
 *
 * The nuisance models (propensity and outcome model) are refitted inside each
 * resample, and the prequential policies are re-run over the resampled history
 * in chronological order — so the resample is scored by a rule that has not
 * seen it, exactly as the point estimate is.
 */
export function bootstrapDelta(units, policyId, { draws, seed } = {}) {
  const n = units.length;
  if (!n) return null;
  const B = draws || COUNTERFACTUAL_LIMITS.bootstrapDraws;
  const rng = seededRandom(seed === undefined ? COUNTERFACTUAL_LIMITS.bootstrapSeed : seed);

  const fams = [...new Set(units.map((u) => u.family))].sort();
  const famId = new Map(fams.map((f, i) => [f, i]));
  const F = Math.max(1, fams.length);
  const famIdx = new Int32Array(n);
  const arm = new Int32Array(n);
  const reward = new Float64Array(n);
  const settleDay = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    famIdx[i] = famId.get(units[i].family);
    arm[i] = units[i].arm === 1 ? 1 : 0;
    reward[i] = units[i].reward;
    const ms = Date.parse(`${units[i].settledOn}T00:00:00.000Z`);
    settleDay[i] = Number.isFinite(ms) ? ms / 86_400_000 : 0;
  }
  const members = fams.map((f) => {
    const out = [];
    for (let i = 0; i < n; i += 1) if (units[i].family === f) out.push(i);
    return out;
  });

  const m = COUNTERFACTUAL_LIMITS.priorPseudoCount;
  const halfLife = COUNTERFACTUAL_LIMITS.recentHalfLifeDays;
  const minPrior = COUNTERFACTUAL_LIMITS.minPriorPerArm;
  const pLo = COUNTERFACTUAL_LIMITS.minPropensity;
  const pHi = COUNTERFACTUAL_LIMITS.maxPropensity;
  const adaptive = policyId === 'adaptive-recent';
  const prequential = policyId === 'prequential-best' || adaptive;

  const deltas = new Float64Array(B);
  const picked = new Int32Array(n);
  const famN = new Float64Array(F);
  const famArm1 = new Float64Array(F);
  const famSum = new Float64Array(F);
  const cellN = new Float64Array(F * 2);
  const cellSum = new Float64Array(F * 2);
  const mu = new Float64Array(F * 2);
  const runN = new Float64Array(F * 2);
  const runW = new Float64Array(F * 2);
  const runWt = new Float64Array(F * 2);

  for (let b = 0; b < B; b += 1) {
    let k = 0;
    for (const list of members) {
      const len = list.length;
      for (let j = 0; j < len; j += 1) {
        const r = Math.floor(rng() * len);
        picked[k] = list[r < len ? r : len - 1];
        k += 1;
      }
    }
    // Chronological order: the units array is already sorted, so sorting the
    // picked original indices restores the order the prequential rules see.
    const order = Array.from(picked.subarray(0, n)).sort((x, y) => x - y);

    famN.fill(0); famArm1.fill(0); famSum.fill(0);
    cellN.fill(0); cellSum.fill(0);
    runN.fill(0); runW.fill(0); runWt.fill(0);
    let total = 0;
    for (let t = 0; t < n; t += 1) {
      const i = order[t];
      const f = famIdx[i];
      const a = arm[i];
      const y = reward[i];
      famN[f] += 1;
      famSum[f] += y;
      if (a === 1) famArm1[f] += 1;
      cellN[f * 2 + a] += 1;
      cellSum[f * 2 + a] += y;
      total += y;
    }
    for (let f = 0; f < F; f += 1) {
      if (famN[f] === 0) {
        mu[f * 2] = 0.5;
        mu[f * 2 + 1] = 0.5;
      } else {
        const r0 = (famN[f] - famArm1[f] + 1) / (famN[f] + 2);
        const r1 = (famArm1[f] + 1) / (famN[f] + 2);
        mu[f * 2] = Math.min(pHi, Math.max(pLo, r0));
        mu[f * 2 + 1] = Math.min(pHi, Math.max(pLo, r1));
      }
    }

    const observed = total / n;
    const lastDay = settleDay[order[n - 1]];
    let num = 0;
    let den = 0;
    for (let t = 0; t < n; t += 1) {
      const i = order[t];
      const f = famIdx[i];
      const a = arm[i];
      const y = reward[i];
      const fm = famN[f] > 0 ? famSum[f] / famN[f] : 0.5;

      let pi;
      if (policyId === 'observed') {
        pi = a;
      } else if (policyId === 'always-act') {
        pi = 1;
      } else if (policyId === 'always-hold') {
        pi = 0;
      } else {
        const c0 = runN[f * 2];
        const c1 = runN[f * 2 + 1];
        const w0 = runWt[f * 2];
        const w1 = runWt[f * 2 + 1];
        if (c0 < minPrior || c1 < minPrior || w0 === 0 || w1 === 0) {
          pi = 1; // declared default while either arm is untested in this family
        } else {
          const v0 = runW[f * 2] / w0;
          const v1 = runW[f * 2 + 1] / w1;
          pi = v1 > v0 ? 1 : v0 > v1 ? 0 : 1;
        }
      }

      // Self-normalised (Hajek) estimator: bounded by the reward range, which
      // is the property that keeps a small-sample bootstrap interval sane.
      if (a === pi) {
        const w = 1 / mu[f * 2 + a];
        num += w * y;
        den += w;
      }

      // Advance the prequential history with this point.
      const age = lastDay - settleDay[i];
      const w = prequential && adaptive ? (age >= 0 ? 2 ** (-age / halfLife) : 1) : 1;
      runN[f * 2 + a] += 1;
      runW[f * 2 + a] += w * y;
      runWt[f * 2 + a] += w;
    }
    deltas[b] = (den > 0 ? num / den : observed) - observed;
  }

  const sorted = Array.from(deltas).sort((x, y) => x - y);
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))];
  return {
    draws: sorted.length,
    low: round4(at(0.025)),
    high: round4(at(0.975)),
    median: round4(at(0.5)),
  };
}

/* ------------------------------------------------------------------ *
 * 5. Matched pairs & Rosenbaum sensitivity
 * ------------------------------------------------------------------ */

function standardise(units, keys) {
  const stats = new Map();
  for (const key of keys) {
    const values = units.map((u) => (Number.isFinite(u.covariates?.[key]) ? u.covariates[key] : null)).filter((v) => v !== null);
    const m = values.length ? mean(values) : 0;
    const s = values.length > 1 ? sd(values) : null;
    stats.set(key, { mean: m, sd: s && s > 0 ? s : 1 });
  }
  return (u, key) => {
    const v = u.covariates?.[key];
    if (!Number.isFinite(v)) return 0; // a missing declared covariate is centred, never imputed
    const st = stats.get(key);
    return (v - st.mean) / st.sd;
  };
}

function asmd(treated, control, keys, z) {
  const out = {};
  for (const key of keys) {
    const t = treated.map((u) => z(u, key)).filter(Number.isFinite);
    const c = control.map((u) => z(u, key)).filter(Number.isFinite);
    const mt = mean(t);
    const mc = mean(c);
    const st = sd(t);
    const sc = sd(c);
    const pooled = (st && sc) ? Math.sqrt((st * st + sc * sc) / 2) : null;
    out[key] = pooled && pooled > 0 ? round3(Math.abs(mt - mc) / pooled) : null;
  }
  return out;
}

function distance(a, b, keys, z) {
  let s = 0;
  for (const key of keys) s += (z(a, key) - z(b, key)) ** 2;
  return Math.sqrt(s);
}

/**
 * Greedy nearest-neighbour matching within a caliper, per family, on the
 * declared covariates. Deterministic: treated units are processed in the same
 * chronological order the estimators use.
 */
export function matchPairs(units, keys = ['ageDays', 'breadth']) {
  const z = standardise(units, keys);
  const pairs = [];
  const perFamily = {};
  for (const family of POLICY_FAMILIES) {
    const treated = units.filter((u) => u.family === family && u.arm === 1);
    const control = units.filter((u) => u.family === family && u.arm === 0);
    if (!treated.length || !control.length) {
      perFamily[family] = { treated: treated.length, control: control.length, matched: 0, asmdBefore: null, asmdAfter: null };
      continue;
    }
    const before = asmd(treated, control, keys, z);
    const used = new Set();
    const matched = [];
    const caliper = COUNTERFACTUAL_LIMITS.matchCaliperSd;
    for (const t of treated) {
      let best = null;
      let bestD = Infinity;
      for (const c of control) {
        if (used.has(c.id)) continue;
        const d = distance(t, c, keys, z);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (best && bestD <= caliper) {
        used.add(best.id);
        matched.push({ family, treated: t, control: best, distance: round3(bestD) });
      }
    }
    pairs.push(...matched);
    perFamily[family] = {
      treated: treated.length,
      control: control.length,
      matched: matched.length,
      asmdBefore: before,
      asmdAfter: asmd(
        matched.map((p) => p.treated),
        matched.map((p) => p.control),
        keys,
        z,
      ),
      meanDistance: matched.length ? round3(mean(matched.map((p) => p.distance))) : null,
    };
  }
  return { pairs, perFamily, covariates: keys };
}

/** Upper-tail binomial P(X >= k) for X ~ Bin(m, p). */
export function binomialSurvival(m, k, p) {
  if (m <= 0) return 1;
  if (k <= 0) return 1;
  if (k > m) return 0;
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  // Recurrence from the k-th pmf; stable for the sample sizes a leadership
  // workspace can produce and exact to double precision well past m = 2000.
  const lgamma = (x) => {
    const cof = [76.18009172947146, -86.50532032941677, 24.01409824083091,
      -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x;
    let tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j += 1) {
      y += 1;
      ser += cof[j] / y;
    }
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  };
  const logPmf = (j) => lgamma(m + 1) - lgamma(j + 1) - lgamma(m - j + 1) + j * Math.log(p) + (m - j) * Math.log(1 - p);
  let total = 0;
  for (let j = k; j <= m; j += 1) total += Math.exp(logPmf(j));
  return Math.min(1, Math.max(0, total));
}

/**
 * Rosenbaum (1987) worst-case two-sided p-value for a matched-pair sign test.
 *
 * Under the sensitivity model with parameter Gamma, the odds that one member
 * of a matched pair receives the active arm may differ by at most Gamma. Among
 * the m discordant pairs the count favouring the active arm is then bounded by
 * Bin(m, Gamma / (1 + Gamma)), which is the worst case for the null.
 */
export function mcnemarUpperBound(m, k, gamma = 1) {
  if (m <= 0) return 1;
  const p = gamma / (1 + gamma);
  const favouring = Math.max(k, m - k);
  const oneSided = binomialSurvival(m, favouring, p);
  return Math.min(1, 2 * oneSided);
}

/**
 * Design sensitivity: the largest Gamma at which the finding still survives.
 * Monotone in Gamma, so a bisection is exact to the reported tolerance.
 */
export function rosenbaumDesignSensitivity(m, k, { alpha = 0.05, maxGamma = COUNTERFACTUAL_LIMITS.maxGamma } = {}) {
  if (m <= 0) return { gamma: null, significantAtOne: false, capped: false };
  if (mcnemarUpperBound(m, k, 1) > alpha) {
    return { gamma: 1, significantAtOne: false, capped: false };
  }
  let lo = 1;
  let hi = maxGamma;
  if (mcnemarUpperBound(m, k, hi) <= alpha) {
    return { gamma: hi, significantAtOne: true, capped: true };
  }
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (mcnemarUpperBound(m, k, mid) <= alpha) lo = mid;
    else hi = mid;
  }
  return { gamma: round3(lo), significantAtOne: true, capped: false };
}

/**
 * The paired comparison, restricted to pairs whose rewards are binary so
 * McNemar applies. A 0.5 reward (a "mixed" decision review) is reported as
 * excluded rather than rounded up or down.
 */
export function pairedAnalysis(match) {
  const binary = (match.pairs || []).filter(
    (p) => (p.treated.reward === 0 || p.treated.reward === 1)
      && (p.control.reward === 0 || p.control.reward === 1),
  );
  let favouring = 0;
  let opposing = 0;
  for (const p of binary) {
    if (p.treated.reward > p.control.reward) favouring += 1;
    else if (p.treated.reward < p.control.reward) opposing += 1;
  }
  const m = favouring + opposing;
  const k = favouring;
  const exact = mcnemarUpperBound(m, k, 1);
  const sens = rosenbaumDesignSensitivity(m, k);
  const rate = m > 0 ? k / m : null;
  const gamma = sens.gamma === null ? null : sens.gamma;
  const lo = gamma ? 1 / (1 + gamma) : null;
  const hi = gamma ? gamma / (1 + gamma) : null;
  return {
    pairs: (match.pairs || []).length,
    binaryPairs: binary.length,
    excludedPairs: (match.pairs || []).length - binary.length,
    favouring,
    opposing,
    concordant: m,
    discordantRate: rate === null ? null : round4(rate),
    discordantInterval: lo === null ? null : { low: round4(lo), high: round4(hi) },
    mcnemarP: m > 0 ? round4(exact) : null,
    sensitivity: sens,
    gammaCurve: [1, 1.25, 1.5, 2, 3, 5, 10].map((g) => ({
      gamma: g,
      pUpper: m > 0 ? round4(mcnemarUpperBound(m, k, g)) : null,
    })),
  };
}

/* ------------------------------------------------------------------ *
 * 6. Time-uniform confidence sequence
 * ------------------------------------------------------------------ */

/**
 * Hoeffding-type stitched confidence sequence for the mean of [0, 1] rewards.
 *
 * For any lambda > 0, M_t(lambda) = exp(lambda * S_t - t * lambda^2 / 8) is a
 * nonnegative supermartingale under the true mean (Hoeffding 1963), so Ville's
 * inequality gives P(exists t: M_t >= 1/alpha) <= alpha. Splitting alpha
 * equally across a finite geometric lambda grid and applying a union bound
 * yields a boundary valid simultaneously for every t.
 *
 * The point: this interval may be inspected every day, at every t, and the
 * stated coverage still holds. A fixed-horizon interval does not survive that.
 */
export function hoeffdingConfidenceSequence(values, { alpha = COUNTERFACTUAL_LIMITS.csAlpha, gridPoints = COUNTERFACTUAL_LIMITS.csGridPoints } = {}) {
  const n = values.length;
  if (!n) return [];
  const L = Math.log(gridPoints / alpha);
  const lamHi = Math.min(8, Math.sqrt(8 * L));
  const lamLo = Math.max(0.01, Math.sqrt(8 * L / n));
  const grid = [];
  for (let i = 0; i < gridPoints; i += 1) {
    const t = gridPoints === 1 ? 0 : i / (gridPoints - 1);
    grid.push(lamLo * (lamHi / lamLo) ** t);
  }
  const out = [];
  let running = 0;
  for (let i = 0; i < n; i += 1) {
    running += values[i];
    const t = i + 1;
    let bound = Infinity;
    for (const lam of grid) {
      const b = (L + (t * lam * lam) / 8) / lam;
      if (b < bound) bound = b;
    }
    const m = running / t;
    out.push({
      t,
      mean: round4(m),
      low: round4(Math.max(0, m - bound / t)),
      high: round4(Math.min(1, m + bound / t)),
      halfWidth: round4(bound / t),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 7. Report
 * ------------------------------------------------------------------ */

function floorsFor(units, settings) {
  const arm0 = units.filter((u) => u.arm === 0).length;
  const arm1 = units.filter((u) => u.arm === 1).length;
  const byFamily = {};
  for (const family of POLICY_FAMILIES) {
    const list = units.filter((u) => u.family === family);
    byFamily[family] = {
      units: list.length,
      arm0: list.filter((u) => u.arm === 0).length,
      arm1: list.filter((u) => u.arm === 1).length,
      meetsFamilyFloor: list.length >= COUNTERFACTUAL_LIMITS.minUnitsPerFamily,
    };
  }
  return {
    minUnits: settings.counterfactualMinUnits,
    minUnitsPerArm: COUNTERFACTUAL_LIMITS.minUnitsPerArm,
    minUnitsPerFamily: COUNTERFACTUAL_LIMITS.minUnitsPerFamily,
    minEffectiveSample: COUNTERFACTUAL_LIMITS.minEffectiveSample,
    minPairsForSensitivity: COUNTERFACTUAL_LIMITS.minPairsForSensitivity,
    counts: { units: units.length, arm0, arm1 },
    byFamily,
    met: units.length >= settings.counterfactualMinUnits
      && Math.min(arm0, arm1) >= COUNTERFACTUAL_LIMITS.minUnitsPerArm,
  };
}

function verdictFor(est, settings, ci, sens) {
  if (!est) return { verdict: 'insufficient', reason: 'no decision points' };
  if (est.effectiveSample !== null && est.effectiveSample < COUNTERFACTUAL_LIMITS.minEffectiveSample) {
    return {
      verdict: 'insufficient',
      reason: `effective sample ${est.effectiveSample} is below the floor of ${COUNTERFACTUAL_LIMITS.minEffectiveSample} — the weights are too concentrated to estimate a value`,
    };
    void fragile;
  }
  const delta = (est.value - est.observed) * 100;
  const materiality = settings.counterfactualMaterialityPp;
  if (Math.abs(delta) < materiality) {
    return { verdict: 'no-difference', deltaPp: round2(delta), reason: `difference ${round2(delta)}pp is inside the ${materiality}pp materiality band` };
  }
  // Strongest claim available: Manski's assumption-free identified set.
  const mLow = (est.manski.noAssumption.low - est.observed) * 100;
  const mHigh = (est.manski.noAssumption.high - est.observed) * 100;
  if (mLow > 0) return { verdict: 'bounded-better', deltaPp: round2(delta), reason: `every value the unobserved arm may take keeps this policy ahead (worst case +${round2(mLow)}pp)` };
  if (mHigh < 0) return { verdict: 'bounded-worse', deltaPp: round2(delta), reason: `every value the unobserved arm may take keeps this policy behind (worst case ${round2(mHigh)}pp)` };

  const ciExcludes = Boolean(ci && (ci.low > 0 || ci.high < 0));
  const fragile = est.crossCheckSpreadPp !== null && est.crossCheckSpreadPp > 10;
  const fragilityNote = fragile
    ? ` The four estimators disagree by ${est.crossCheckSpreadPp}pp, which is what concentrated weights look like — read the point estimate as fragile.`
    : '';
  const robust = Boolean(sens?.significantAtOne && sens.gamma >= settings.counterfactualRobustGamma);
  if (!ciExcludes) {
    return {
      verdict: sens?.significantAtOne ? 'no-difference' : 'refused-unidentifiable',
      deltaPp: round2(delta),
      reason: `the bootstrap interval covers zero and the assumption-free bounds cannot determine the sign.${fragilityNote}`,
    };
  }
  if (robust) {
    return {
      verdict: delta > 0 ? 'supported-better' : 'supported-worse',
      deltaPp: round2(delta),
      reason: `interval excludes zero and the finding survives hidden bias up to Gamma ${sens.gamma}.${fragilityNote}`,
    };
  }
  return {
    verdict: 'suggestive',
    deltaPp: round2(delta),
    reason: `interval excludes zero but only Gamma ${sens?.gamma ?? 1} of hidden bias would explain it away, below the ${settings.counterfactualRobustGamma} robustness bar.${fragilityNote}`,
  };
}

/**
 * The full read model. Everything here is derived; nothing is stored.
 */
/**
 * Read-model cache. This report is rebuilt by the nav badge, the Insights roll
 * and the view on the same render, and it is a pure function of (state, day,
 * scope) — so a WeakMap keyed on the state object makes the repeat calls free
 * without ever serving a stale figure after a write (a write replaces state).
 */
const REPORT_CACHE = new WeakMap();

export function counterfactualReport(state = {}, now = new Date(), focusFamily = null) {
  const settings = normalizeCounterfactualSettings(state.settings || {});
  const warnings = [];
  const cacheKey = `${dayKey(now)}|${focusFamily && POLICY_FAMILIES.includes(focusFamily) ? focusFamily : 'all'}`;
  if (state && typeof state === 'object') {
    const hit = REPORT_CACHE.get(state);
    if (hit && hit.key === cacheKey) return hit.report;
  }
  const allUnits = harvestPolicyUnits(state, now);
  const scope = focusFamily && POLICY_FAMILIES.includes(focusFamily) ? focusFamily : 'all';
  const units = scope === 'all' ? allUnits : allUnits.filter((u) => u.family === scope);

  const floors = floorsFor(allUnits, settings);
  const scopedFloors = scope === 'all' ? floors : floorsFor(units, settings);
  const observable = scopedFloors.met;

  const observedValue = units.length ? round4(mean(units.map((u) => u.reward))) : null;
  const propensity = buildPropensity(units, warnings);
  const outcome = buildOutcomeModel(units);

  const ciByPolicy = {};
  const race = [];
  if (observable) {
    for (const policyId of POLICY_IDS) {
      const est = evaluatePolicy(units, policyId, { propensity, outcome, warnings });
      if (!est) continue;
      let ci = null;
      if (policyId !== 'observed') {
        ci = bootstrapDelta(units, policyId, {
          draws: COUNTERFACTUAL_LIMITS.bootstrapDraws,
          seed: COUNTERFACTUAL_LIMITS.bootstrapSeed,
        });
      }
      ciByPolicy[policyId] = ci;
      race.push({
        ...est,
        policyMeta: POLICY_META[policyId],
        ci: null, // set below, once the floors have ruled on the row
        deltaPp: round2((est.dr - est.observed) * 100),
        verdict: null,
      });
    }
  }

  const match = matchPairs(units);
  const paired = pairedAnalysis(match);
  const sensitivity = paired.sensitivity;

  for (const row of race) {
    const v = row.policyId === 'observed'
      ? { verdict: 'observed', reason: 'the behaviour policy — fully observed, no counterfactual', deltaPp: 0 }
      : verdictFor(row, settings, ciByPolicy[row.policyId], sensitivity);
    row.verdict = v.verdict;
    row.verdictMeta = POLICY_VERDICT_META[v.verdict] || POLICY_VERDICT_META.insufficient;
    row.verdictReason = v.reason;
    if (v.deltaPp !== undefined) row.deltaPp = v.deltaPp;
    // An interval over a row the floors refused would dress a refusal up as a
    // finding, so it is withheld rather than printed beside it.
    const ci = ciByPolicy[row.policyId];
    row.ci = row.policyId !== 'observed' && ci && v.verdict !== 'insufficient'
      ? { lowPp: round2(ci.low * 100), highPp: round2(ci.high * 100) }
      : null;
  }

  const sequence = hoeffdingConfidenceSequence(units.map((u) => u.reward));
  const last = sequence.length ? sequence[sequence.length - 1] : null;

  const byFamily = POLICY_FAMILIES.map((family) => {
    const list = allUnits.filter((u) => u.family === family);
    const meta = POLICY_FAMILY_META[family];
    const famPropensity = buildPropensity(list);
    const famOutcome = buildOutcomeModel(list);
    const rows = [];
    if (list.length >= COUNTERFACTUAL_LIMITS.minUnitsPerFamily) {
      for (const policyId of POLICY_IDS) {
        const est = evaluatePolicy(list, policyId, { propensity: famPropensity, outcome: famOutcome });
        if (est) rows.push({ policyId, value: est.value, dr: est.dr, observed: round4(est.observed), deltaPp: round2((est.value - est.observed) * 100), agreementPct: est.agreementPct });
      }
    }
    return {
      family,
      meta,
      units: list.length,
      arm0: list.filter((u) => u.arm === 0).length,
      arm1: list.filter((u) => u.arm === 1).length,
      observedValue: list.length ? round4(mean(list.map((u) => u.reward))) : null,
      belowFloor: list.length < COUNTERFACTUAL_LIMITS.minUnitsPerFamily,
      rows,
    };
  });

  const best = race
    .filter((r) => r.policyId !== 'observed')
    .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity))[0] || null;

  const caveats = buildCaveats(units, match, paired, scope, warnings);

  const report = {
    engineVersion: COUNTERFACTUAL_ENGINE_VERSION,
    scope,
    settings,
    limits: COUNTERFACTUAL_LIMITS,
    counts: {
      units: units.length,
      totalUnits: allUnits.length,
      arm0: units.filter((u) => u.arm === 0).length,
      arm1: units.filter((u) => u.arm === 1).length,
      families: byFamily.filter((f) => f.units > 0).length,
    },
    floors: scopedFloors,
    observable,
    observedValue,
    race,
    byFamily,
    match: {
      pairs: match.pairs.length,
      covariates: match.covariates,
      perFamily: match.perFamily,
      balanceTarget: COUNTERFACTUAL_LIMITS.asmdBalanceTarget,
      caliperSd: COUNTERFACTUAL_LIMITS.matchCaliperSd,
      balanced: Object.values(match.perFamily).every(
        (f) => !f.asmdAfter || Object.values(f.asmdAfter).every((v) => v === null || v <= COUNTERFACTUAL_LIMITS.asmdBalanceTarget),
      ),
    },
    paired,
    sensitivity,
    sequence,
    sequenceLast: last,
    best,
    warnings,
    caveats,
    evaluations: (state.policyEvaluations || []).slice().sort((a, b) => String(b.frozenAt).localeCompare(String(a.frozenAt))),
  };

  if (state && typeof state === 'object') REPORT_CACHE.set(state, { key: cacheKey, report });
  return report;
}

function buildCaveats(units, match, paired, scope, warnings) {
  const lines = [];
  lines.push('One reward is observed per decision point — the one under the arm that was actually taken. The other arm is never observed; every counterfactual value here is an estimate over an unobserved quantity, not a measurement.');
  lines.push('The behavioural policy (how you actually choose) is estimated from the record and clipped for positivity, so the weights are bounded. It is not known, and an off-policy estimate is only as good as its overlap with your own behaviour: a policy you have almost never followed cannot be identified, and this terminal refuses rather than extrapolates.');
  lines.push('Selection is the default explanation for any difference found here. Testing a fragile assumption, deciding a hard call late, checking in on a struggling delegation and spending on a bad case are all responses to the situation, not random assignments. The Gamma figure is how much hidden selection would be needed to explain the gap, not a proof that the gap is causal.');
  if (paired.excludedPairs) {
    lines.push(`${paired.excludedPairs} matched pair(s) were excluded from the paired test because a 0.5 reward (a "mixed" decision review) is neither a success nor a failure and is never rounded into one.`);
  }
  if (!match.pairs) {
    lines.push('No matched pairs could be formed inside the caliper, so the paired sensitivity analysis is withheld entirely and only the off-policy bounds are reported.');
  }
  if (scope !== 'all') {
    lines.push(`This reading is restricted to one family (${POLICY_FAMILY_META[scope]?.label || scope}). Rewards are not comparable across families, and no cross-family total is ever printed.`);
  }
  for (const w of warnings) lines.push(w);
  return lines;
}

/* ------------------------------------------------------------------ *
 * 8. Signals & brief
 * ------------------------------------------------------------------ */

export function counterfactualSignals(state = {}, now = new Date()) {
  const report = counterfactualReport(state, now);
  const signals = [];
  const route = (panel) => `#/counterfactual?panel=${panel}`;

  if (!report.observable) {
    // A workspace with no scored decision point at all is not a thin record —
    // it is a new one. The terminal stays silent there: an empty workspace gets
    // the setup nudge, not a complaint about a track record it cannot have yet.
    if (report.counts.totalUnits <= 0) return signals;
    const need = Math.max(0, report.floors.minUnits - report.counts.units);
    signals.push({
      ruleId: 'CFP-05',
      domain: 'Counterfactual policy',
      title: 'Not enough decision points to price a counterfactual policy',
      detail: `${report.counts.units} scored decision point(s) on record; the floor is ${report.floors.minUnits} with at least ${report.floors.minUnitsPerArm} in each arm (${need} more needed). Until then the terminal prints counts only and estimates nothing.`,
      severity: 1,
      confidence: 'high',
      evidence: [
        `Decision points: ${report.counts.units}/${report.floors.minUnits}`,
        `Arm split: ${report.counts.arm1} acted / ${report.counts.arm0} held`,
        `Families with data: ${report.counts.families}`,
      ],
      action: { label: 'Open the race', route: route('race') },
    });
    return signals;
  }

  const robust = report.race.filter((r) => r.policyId !== 'observed'
    && (r.verdict === 'supported-better' || r.verdict === 'bounded-better' || r.verdict === 'supported-worse' || r.verdict === 'bounded-worse'));
  const best = robust[0] || report.best;

  if (best && ['supported-better', 'bounded-better'].includes(best.verdict)) {
    signals.push({
      ruleId: 'CFP-01',
      domain: 'Counterfactual policy',
      title: `A named policy beats your record: ${best.policyMeta.label}`,
      detail: `Headline value ${round2((best.value ?? 0) * 100)}% against your recorded ${round2((best.observed ?? 0) * 100)}% — ${best.deltaPp}pp, with ${best.crossCheckSpreadPp}pp spread across the four cross-checks. ${best.verdictReason}. This is a ruling to make, not a rule to obey: the engine never adopts a policy for you.`,
      severity: 4,
      confidence: best.verdict === 'bounded-better' ? 'high' : 'medium',
      evidence: [
        `Decision points: ${report.counts.units} (${report.counts.arm1} acted / ${report.counts.arm0} held)`,
        `Agreement with the record: ${best.agreementPct}%`,
        `Hidden-bias bound: Gamma ${report.sensitivity?.gamma ?? 'n/a'}`,
        `Effective sample: ${best.effectiveSample}`,
      ],
      action: { label: 'Rule on this policy', route: route('race') },
    });
  } else if (best && ['supported-worse', 'bounded-worse'].includes(best.verdict)) {
    signals.push({
      ruleId: 'CFP-02',
      domain: 'Counterfactual policy',
      title: `Your record beats the rule: ${best.policyMeta.label} would have lost`,
      detail: `Headline value ${round2((best.value ?? 0) * 100)}% against your recorded ${round2((best.observed ?? 0) * 100)}% — ${best.deltaPp}pp, with ${best.crossCheckSpreadPp}pp spread across the four cross-checks. ${best.verdictReason}. Nothing is changed for you; the finding is that the mechanical rule is not the thing to adopt.`,
      severity: 3,
      confidence: 'medium',
      evidence: [
        `Decision points: ${report.counts.units}`,
        `Agreement with the record: ${best.agreementPct}%`,
        `Hidden-bias bound: Gamma ${report.sensitivity?.gamma ?? 'n/a'}`,
      ],
      action: { label: 'Inspect the race', route: route('race') },
    });
  }

  const refused = report.race.filter((r) => r.policyId !== 'observed' && r.verdict === 'refused-unidentifiable');
  if (refused.length && !robust.length) {
    signals.push({
      ruleId: 'CFP-03',
      domain: 'Counterfactual policy',
      title: 'The record cannot answer this yet — no claim is made',
      detail: `${refused.length} alternative policy/policies sit inside the assumption-free bounds: too much of the unobserved arm, too little overlap, or a bootstrap interval that covers zero. The terminal prints the bounds instead of an estimate.`,
      severity: 1,
      confidence: 'high',
      evidence: refused.slice(0, 3).map((r) => `${r.policyMeta.label}: ${r.verdictReason}`),
      action: { label: 'See the bounds', route: route('bounds') },
    });
  }

  const suggestive = report.race.filter((r) => r.verdict === 'suggestive');
  if (suggestive.length) {
    signals.push({
      ruleId: 'CFP-04',
      domain: 'Counterfactual policy',
      title: 'Suggestive only — hidden bias would explain it away',
      detail: `${suggestive[0].policyMeta.label} is ${suggestive[0].deltaPp}pp ahead with an interval that excludes zero, but only Gamma ${report.sensitivity?.gamma ?? 1} of hidden selection would account for it, under the ${report.settings.counterfactualRobustGamma} robustness bar. Reported, never recommended.`,
      severity: 2,
      confidence: 'low',
      evidence: [
        `Design sensitivity: Gamma ${report.sensitivity?.gamma ?? 'n/a'}`,
        `Discordant pairs favouring the active arm: ${report.paired.favouring}/${report.paired.concordant || 0}`,
        `Bounded discordant rate: ${report.paired.discordantInterval ? `${round2(report.paired.discordantInterval.low * 100)}–${round2(report.paired.discordantInterval.high * 100)}%` : 'n/a'}`,
      ],
      action: { label: 'Stress the finding', route: route('sensitivity') },
    });
  }

  if (report.paired.binaryPairs > 0 && report.paired.binaryPairs < COUNTERFACTUAL_LIMITS.minPairsForSensitivity) {
    signals.push({
      ruleId: 'CFP-06',
      domain: 'Counterfactual policy',
      title: 'Matched-pair sensitivity is below its floor',
      detail: `Only ${report.paired.binaryPairs} pair(s) with binary rewards could be matched inside the ${COUNTERFACTUAL_LIMITS.matchCaliperSd} SD caliper; the floor is ${COUNTERFACTUAL_LIMITS.minPairsForSensitivity}. The Gamma bound is printed as it stands and labelled thin.`,
      severity: 1,
      confidence: 'medium',
      evidence: [
        `Matched pairs: ${report.match.pairs}`,
        `Binary-reward pairs: ${report.paired.binaryPairs}`,
        `Covariates matched: ${report.match.covariates.join(', ')}`,
      ],
      action: { label: 'Open sensitivity', route: route('sensitivity') },
    });
  }

  return signals;
}

export function counterfactualAttentionCount(state = {}, now = new Date()) {
  const report = counterfactualReport(state, now);
  if (!report.observable) return 0;
  return report.race.filter((r) => ['supported-better', 'bounded-better', 'supported-worse', 'bounded-worse'].includes(r.verdict)).length;
}

/** Deterministic, identity-free brief. No record id, title, person or note. */
export function buildCounterfactualBrief(report, now = new Date()) {
  const lines = [];
  const pct = (v) => (v === null || v === undefined ? 'n/a' : `${round2(Number(v) * 100)}%`);
  lines.push(`COUNTERFACTUAL POLICY BRIEF (${COUNTERFACTUAL_ENGINE_VERSION})`);
  lines.push(`Generated: ${dayKey(now)} · Scope: ${report.scope === 'all' ? 'all four decision-point families' : POLICY_FAMILY_META[report.scope]?.label} · Engine: off-policy evaluation, headline = self-normalised IPS (Hájek 1971), cross-checked by DM / IPS / doubly robust`);
  lines.push(`Decision points: ${report.counts.units} (${report.counts.arm1} active arm / ${report.counts.arm0} hold arm) · Families with data: ${report.counts.families}`);
  if (!report.observable) {
    lines.push('');
    lines.push(`Below the evidence floor (${report.floors.minUnits} points, ${report.floors.minUnitsPerArm} per arm). Counts only; no counterfactual value was estimated and none may be quoted from this brief.`);
    lines.push('');
    lines.push('Epistemic boundary: one reward is observed per decision point, under the arm that was taken. The other arm is never observed. This terminal estimates, bounds and refuses; it does not measure a causal effect and never scores a person.');
    return lines.join('\n');
  }
  lines.push(`Recorded behaviour scored ${pct(report.observedValue)} across ${report.counts.units} decision points.`);
  lines.push('');
  lines.push('POLICY RACE (headline value · delta against the record · verdict)');
  for (const row of report.race) {
    lines.push(`  ${row.policyMeta.label}: ${pct(row.dr)} · ${row.deltaPp >= 0 ? '+' : ''}${row.deltaPp}pp · ${row.verdictMeta.label}`);
  }
  lines.push('');
  lines.push('PARTIAL IDENTIFICATION (Manski 1990, assumption-free bounds on the same delta)');
  for (const row of report.race) {
    if (row.policyId === 'observed') continue;
    lines.push(`  ${row.policyMeta.label}: [${round2((row.manski.noAssumption.low - row.observed) * 100)}pp, ${round2((row.manski.noAssumption.high - row.observed) * 100)}pp] with no assumption · ${round2(row.manski.missingFraction * 100)}% of points unobserved under this policy`);
  }
  lines.push('');
  lines.push('HIDDEN-BIAS SENSITIVITY (Rosenbaum 2002, matched pairs)');
  lines.push(`  Matched pairs: ${report.match.pairs} · binary-reward pairs: ${report.paired.binaryPairs} · covariates: ${report.match.covariates.join(', ')}`);
  lines.push(`  Discordant pairs favouring the active arm: ${report.paired.favouring} of ${report.paired.concordant}`);
  lines.push(`  McNemar p at Gamma 1: ${report.paired.mcnemarP ?? 'n/a'} · design sensitivity Gamma*: ${report.sensitivity?.gamma ?? 'n/a'}${report.sensitivity?.capped ? ' (at the search ceiling)' : ''}`);
  lines.push('');
  for (const row of report.byFamily) {
    if (!row.units) continue;
    lines.push(`FAMILY — ${row.meta.label}: ${row.units} point(s), recorded ${pct(row.observedValue)}${row.belowFloor ? ` · below the ${COUNTERFACTUAL_LIMITS.minUnitsPerFamily}-point family floor` : ''}`);
    lines.push(`  ${row.meta.question}`);
    lines.push(`  Confounder the record cannot remove: ${row.meta.confounder}`);
  }
  lines.push('');
  lines.push('Epistemic boundary: one reward is observed per decision point, under the arm that was taken. The other arm is never observed. Every counterfactual figure is an estimate over that unobserved quantity, bounded by the assumption-free interval above and stress-tested against hidden selection — never a measured causal effect, never a forecast, and never a score of any person.');
  return lines.join('\n');
}
