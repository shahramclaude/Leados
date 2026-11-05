/**
 * app/core/domain/reputationalCapital.js — the Reputational Capital Ledger
 * (`#/reputation`, Schema v103, ADR-0101).
 *
 * THE PROBLEM, STATED AS A CALCULATION
 * ------------------------------------
 * A leader spends real capital every time they ask someone to be believed. The
 * cost of that ask is not constant: it is a function of what the counter-party's
 * own ACTS have already established. That function is nameable, boundable and
 * falsifiable, which means it belongs on a screen with intervals — not in a
 * leader's gut.
 *
 * The named foundations, implemented rather than gestured at:
 *
 *  - **Kreps, Milgrom, Roberts & Wilson (1982)** — a small probability of a
 *    committed counter-party sustains cooperation where backward induction says
 *    none survives. PRACTICAL TRANSLATION: reputation is a STOCK built out of
 *    completed acts, and a counter-party with no acts of a class has no stock to
 *    spend on it. That is why `insolvent` is a distinct verdict from `breached`
 *    and why it prints no rate.
 *  - **Wilson (1927) score interval** — every published rate carries an interval
 *    and every verdict is read off it. A point estimate alone never decides a
 *    guarantee.
 *  - **Gelman, Jakulin, Pittau & Su (2008)** — a weakly informative prior on the
 *    log-odds scale (here a Laplace-style α0/β0 anchored on the DECLARED class
 *    hazard rate) instead of a naive α=β=1 prior. The anchor is printed beside
 *    the cell, so a reader can see what the prior contributed before judging the
 *    posterior.
 *  - **Efron (2010), "The Future of Indirect Evidence"** — WILSON-FIRST: the
 *    prior must never be able to decide the verdict by itself. If one act from a
 *    record of nothing would already clear the obstacle, the cell is refused. A
 *    prior that wins alone is not evidence, it is an assumption with a badge.
 *  - **Rubinstein (1982) "perfect equilibrium in a bargaining model"; Sobel
 *    (1985) repeated-game reputation** — decay. Reputation is not a permanent
 *    asset: it is a decaying one. A half-life convention makes "we have always
 *    been reliable" a measurable claim about the last N days rather than a
 *    statement of faith. The decay is exponential on the observational clock,
 *    which is the standard discounted-sum treatment of a repeated interaction.
 *  - **Fudenberg & Tirole (1990) on dynamic contracts; Doval & Smolin (2026)
 *    calibrated mechanism design** — a REPAIR is a deliberately expensive,
 *    observable act that rebuilds a destroyed stake. Its existence is what makes
 *    a breach recoverable at all: without a costly signalling channel a
 *    dissolved reputation has no path back, and the model would be a punishment
 *    machine rather than a ledger.
 *  - **Grossman & Hart (1986) / Hart & Moore (1990)** — residual control. At the
 *    `structural` tier the guarantee stops resting on the person and starts
 *    resting on the allocation of the right; this is why the structural tier has
 *    the lowest obstacle, and why the ledger prices it as the honest answer to a
 *    class that cannot become solvent.
 *  - **Kahneman & Tversky (1979) prospect theory** — referenced ONLY as an
 *    explanation for why asymmetric loss aversion makes an unforgiven breach
 *    more expensive than a logically equivalent reward. It is deliberately NOT
 *    used as a parameter: gamma is a declared convention, printed, clamped and
 *    never estimated from anyone's behaviour.
 *
 * WHAT THIS ENGINE REFUSES TO DO
 * ------------------------------
 *  - It never rates, ranks or scores a person. The subject of every write is a
 *    PERSON-AS-COUNTER-PARTY, an ACT CLASS and a TIER. There is no composite
 *    score anywhere in this module, and no ordering of people on any screen.
 *  - It never withholds a decision, edits a reporting line or contacts anyone.
 *  - It never invents an act. Acts are derived from records OTHER modules own,
 *    or entered by a human who names the source record.
 *  - It never converts a refusal into a zero, or a lapsed record into a loss.
 *
 * Pure module: no DOM, no storage, no network, no Math.random, no ambient clock
 * beyond the injected `now`. Every figure is re-derived on read.
 */

import { addDays, dayKey, daysBetween, round } from '../time.js';
import { LEADER_ID } from './chain.js';
import { activeSeat, buildSeats } from './seat.js';
import { wilsonInterval } from './federation.js';
import { reputationConventions } from './reputationalCapitalSchema.js';
import {
  ACT_CLASSES,
  ACT_CLASS_KEYS,
  ENGAGEMENT_TIERS,
  REPUTATION_DEFAULTS,
  REPUTATION_DISCLOSURE,
  REPUTATION_ENGINE_VERSION,
  REPUTATION_LIMITS,
  REPUTATION_PLAYBOOK,
  REPUTATION_PREMISE,
  REPUTATION_VERDICT_META,
  engagementTierMeta,
} from './reputationalCapitalRegistry.js';

/* ------------------------------------------------------------------ */
/* 1. Statistics — each one named, each one testable                  */
/* ------------------------------------------------------------------ */

/**
 * Wilson (1927) score interval on a proportion, expressed in BETA-PARAMETER
 * space so the rest of the engine has exactly one currency.
 *
 * Wilson's correction is algebraically a shrinkage of the ordinary estimate
 * toward ½, and the shrinkage is exactly (z²/2) pseudo-acts — 1.92 at 95%. The
 * standard practice in this codebase (ADR-0090, ADR-0099) is to separate the
 * two components: a record `{breaches, kept}` and a DECLARED prior of
 * `{α0, β0}`. Presenting Wilson as its equivalent pseudo-count is what makes it
 * composable with the class base rate and with decay.
 */
export function wilsonBeta(kept, breached, z = 1.96) {
  const k = Math.max(0, Math.round(Number(kept) || 0));
  const b = Math.max(0, Math.round(Number(breached) || 0));
  const n = k + b;
  if (!n) return { alpha: null, beta: null, low: null, high: null, z };
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  // Wilson's centre is the shrunk proportion: (p + z²/2n) / (1 + z²/n).
  const centre = (p + z2 / (2 * n)) / denom;
  const spread = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  const low = Math.min(1, Math.max(0, (p + (z2 / (2 * n)) - spread) / denom));
  const high = Math.min(1, Math.max(0, (p + (z2 / (2 * n)) + spread) / denom));
  // The beta parameters whose posterior mean IS Wilson's centre and whose total
  // pseudo-count is n + z². By construction alpha + beta = n + z², so alpha is
  // exactly the kept acts plus half the pseudo-count — which is why Wilson and a
  // (z²/2)-act Laplace prior agree on the mean but disagree, correctly, on the
  // interval.
  const pseudo = z2 / 2;
  const total = n + z2;
  return {
    alpha: round(centre * total, 4),
    beta: round((1 - centre) * total, 4),
    low,
    high,
    z,
    pseudoActs: round(pseudo, 3),
  };
}

/**
 * Bayesian beta mean with a Laplace-style prior anchored on the DECLARED class
 * hazard rate. The prior's weight is `priorActs` (2 by default). A prior with
 * weight zero means "the record speaks alone", which is REFUSED at the floor —
 * the floor exists precisely so that weight never falls to zero.
 */
export function betaMean(kept, breached, { hazardPct = 10, priorActs = 2 } = {}) {
  const k = Math.max(0, Number(kept) || 0);
  const b = Math.max(0, Number(breached) || 0);
  const prior = Math.max(0, Number(priorActs) || 0);
  const hazard = Math.min(99, Math.max(1, Number(hazardPct) || 10)) / 100;
  if (!prior) return k + b ? k / (k + b) : null;
  return (k + prior * (1 - hazard)) / (k + b + prior);
}

/**
 * Decayed act counts. Each act contributes exp(-ln2 × age / halfLife) of one
 * act's weight. An act older than the window contributes nothing (the caller
 * excludes it), and the half-life decides how fast an old act stops counting
 * INSIDE the window. Both are conventions; both are printed.
 */
export function decayWeight(ageDays, halfLifeDays) {
  const age = Math.max(0, Number(ageDays) || 0);
  const hl = Math.max(1, Number(halfLifeDays) || 1);
  return Math.pow(0.5, age / hl);
}

/**
 * The obstacle a guarantee has to clear, as a proportion in (0, 1].
 *
 * `1 + γ · max(0, ln(ask / stake))` is the convex cost of asking beyond what the
 * record earned. It is deliberately a power of the ask-to-stake ratio: doubling
 * the ask when the record is half the size doubles the cost, and the cost of an
 * ask at or under the stake is exactly the declared tier obstacle.
 *
 * The exponent shaped as a power law is the honest form of a prospect-theoretic
 * intuition (losses loom larger), and the module says so instead of smuggling a
 * fitted loss-aversion parameter in as if it had been estimated.
 */
export function obstaclePct({ tier, stakeActs, askActs, gamma = REPUTATION_DEFAULTS.reputationObstacleGamma }) {
  const meta = engagementTierMeta(tier) || engagementTierMeta('vouching');
  const g = Math.min(REPUTATION_LIMITS.premiumGammaMax, Math.max(0, Number(gamma) || 0));
  const stake = Math.max(0, Number(stakeActs) || 0);
  const ask = Math.max(0, Number(askActs) || 0);
  const excess = stake > 0 && ask > stake ? Math.log(ask / stake) : 0;
  const premium = g * Math.max(0, excess);
  // The base is the tier obstacle; the premium eats the remaining headroom
  // toward 100 at a declared rate, so a larger ask never prints an obstacle
  // above the interval ceiling. The clamp is a printed ceiling, not a silent one.
  const obstacle = 100 - (100 - meta.obstaclePct) * Math.exp(-premium);
  return {
    tier: meta.key,
    tierLabel: meta.label,
    baseObstaclePct: meta.obstaclePct,
    premium: round(premium, 3),
    multiplier: round(Math.exp(premium), 3),
    obstaclePct: round(Math.min(99.5, obstacle), 1),
    askActs: ask,
    stakeActs: round(stake, 2),
    gamma: g,
  };
}

/**
 * WILSON-FIRST refusal check (Efron 2010).
 *
 * The question is NOT "does this record clear the obstacle?" — that is the
 * verdict's own job. The question is "would the DECLARED ANCHOR ALONE clear it?".
 * If it would, the anchor is deciding and the record contributes nothing, so the
 * cell is refused.
 *
 * The anchor is put through the SAME estimator as the record: `priorActs` pseudo
 * acts, `hazardPct` of them kept, and the Wilson interval of that little sample is
 * read at its low end. A 15% anchor with 2 pseudo acts has a low end near 3%, so
 * it can never carry a 15% obstacle — and a genuinely strong record at a normal
 * anchor is therefore PUBLISHED, not refused. Only an extreme anchor (a class
 * whose declared base rate is itself above the obstacle) trips the probe, which is
 * exactly the case the rule exists to catch.
 *
 * The earlier version of this function probed `wilsonBeta(kept + 1, breached)`
 * and so refused every good record — 9 kept, 0 breached, structural tier was
 * refused at a 15% anchor. It was wrong about which sample was on trial.
 */
/** The anchor's OWN interval low end, printed beside the refusal it causes. */
export function priorIntervalLowPct(hazardPct, priorActs) {
  const prior = Math.max(0, Number(priorActs) || 0);
  if (!prior) return null;
  const hazard = Math.min(0.99, Math.max(0.001, (Number(hazardPct) || 0) / 100));
  const anchor = wilsonBeta(hazard * prior, (1 - hazard) * prior);
  return anchor.low === null ? null : anchor.low * 100;
}

export function priorCouldDecide({ obstacle, hazardPct, priorActs }) {
  const prior = Math.max(0, Number(priorActs) || 0);
  if (!prior) return false;
  const hazard = Math.min(0.99, Math.max(0.001, (Number(hazardPct) || 0) / 100));
  const anchor = wilsonBeta(hazard * prior, (1 - hazard) * prior);
  if (anchor.low === null) return false;
  return anchor.low >= obstacle;
}

/**
 * Lanczos (g = 7, n = 9) log-gamma. Accurate to ~1e-13 over the range this
 * module uses (all Beta parameters here are > 0.5).
 */
function lngamma(x) {
  const C = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lngamma(1 - x);
  const xm = x - 1;
  let a = C[0];
  for (let i = 1; i < 9; i += 1) a += C[i] / (xm + i);
  const t = xm + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (xm + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Digamma via the standard recurrence, then an asymptotic series at x ≥ 10. */
function digamma(x) {
  let v = x;
  let acc = 0;
  while (v < 10) {
    acc -= 1 / v;
    v += 1;
  }
  const inv = 1 / v;
  const inv2 = inv * inv;
  return acc + Math.log(v) - inv / 2 - inv2 / 12 + (inv2 * inv2) / 120 - (inv2 * inv2 * inv2) / 252;
}

const lnBeta = (a, b) => lngamma(a) + lngamma(b) - lngamma(a + b);

/**
 * KL(Beta(a, b) || Beta(p, q)) in nats — how much a record's implied beta
 * distribution has moved away from the DECLARED class hazard anchor.
 *
 * The closed form is
 *   ln B(p,q) − ln B(a,b) + (a−p)ψ(a) + (b−q)ψ(b) + (p−a+q−b)ψ(a+b).
 *
 * It is used only for the METHOD panel: it lets the screen state, in one number,
 * how much of a cell's posterior is the record and how much is the anchor. A
 * divergence near zero means the cell is basically the base rate, which is a
 * reason to refuse it, not to publish it.
 */
export function betaKl(kept, breached, hazardPct) {
  const a = Math.max(0.01, Number(kept) || 0) + 0.5;
  const b = Math.max(0.01, Number(breached) || 0) + 0.5;
  const h = Math.min(99, Math.max(1, Number(hazardPct) || 10)) / 100;
  const p = 1 - h;
  const q = h;
  if (p <= 0 || q <= 0) return null;
  const value = lnBeta(p, q) - lnBeta(a, b)
    + (a - p) * digamma(a)
    + (b - q) * digamma(b)
    + (p - a + q - b) * digamma(a + b);
  return Number.isFinite(value) ? Math.max(0, round(value, 6)) : null;
}

/**
 * Reputational capital for one cell: decayed kept/breached acts, the beta
 * interval, the declared hazard anchor, and the verdict. The verdict order is
 * deliberate and printed in the UI: contested → insolvent → refused → expired →
 * obstacle comparison.
 */
export function cellReading({
  kept = 0,
  breached = 0,
  disputed = 0,
  lastActOn = null,
  actFloor,
  exposureFloor,
  windowDays,
  halfLifeDays,
  hazardPct,
  priorActs = 2,
  gamma,
  askActs = 0,
  tier = 'vouching',
  now,
}) {
  const total = kept + breached + disputed;
  const exposure = kept + breached;
  const interval = wilsonBeta(kept, breached);
  const stake = betaMean(kept, breached, { hazardPct, priorActs });
  const price = obstaclePct({ tier, stakeActs: (kept + breached), askActs, gamma });
  const obstacle = price.obstaclePct / 100;
  const ageDays = lastActOn ? Math.max(0, daysBetween(lastActOn, now) ?? 0) : null;
  const expired = ageDays !== null && ageDays > windowDays;

  const base = {
    kept,
    breached,
    disputed,
    actsN: total,
    exposureN: round(exposure, 2),
    stakeBeta: stake === null ? null : round(stake, 4),
    intervalLowPct: interval.low === null ? null : round(interval.low * 100, 1),
    intervalHighPct: interval.high === null ? null : round(interval.high * 100, 1),
    pointPct: exposure ? round((kept / exposure) * 100, 1) : null,
    hazardPct: round(hazardPct, 1),
    priorActs,
    price,
    obstaclePct: price.obstaclePct,
    ageDays,
    lastActOn,
    gamma,
  };

  const refused = (reason) => ({ ...base, verdict: 'refused', reason, refused: true });
  if (!total) return refused('No act of this class is on record. A guarantee resting on nothing is worth its stated price and no more.');
  if (disputed > 0) return { ...base, verdict: 'contested', reason: `${disputed} act(s) of this class are disputed by a human. The dispute is owned elsewhere; this reading will not resolve it.`, refused: false };
  if (breached === 0 && kept === 0) return refused('Every act of this class was excused. Excusals neither build nor destroy stake, so there is nothing to price.');
  if (exposure < actFloor) return refused(`Only ${exposure} graded act(s) of this class — below the declared floor of ${actFloor}.`);
  if (exposure < exposureFloor) return refused(`Weighted exposure ${round(exposure, 2)} is below the declared exposure floor of ${exposureFloor}.`);
  // WILSON-FIRST (Efron 2010): the declared hazard anchor must never be able to
  // decide the verdict unaided. The probe grants the record ONE more kept act and
  // asks whether the interval would already clear the obstacle; if it would, the
  // cell is refused, because nothing in it was measured.
  if (priorCouldDecide({ obstacle, hazardPct, priorActs })) {
    return refused(`The declared ${round(hazardPct, 1)}% class anchor ALONE clears the ${price.obstaclePct}% obstacle (its own interval starts at ${round(priorIntervalLowPct(hazardPct, priorActs), 1)}%). A prior that can decide the verdict by itself is an opinion, so the cell is refused.`);
  }
  if (expired) return { ...base, verdict: 'expired', reason: `The most recent act of this class is ${ageDays} days old — outside the declared ${windowDays}-day window. The record has stopped counting.`, refused: false };
  if (interval.low !== null && interval.low >= obstacle) {
    return { ...base, verdict: 'solvent', reason: `The interval's low end (${base.intervalLowPct}%) clears the ${price.obstaclePct}% obstacle for a ${price.tierLabel.toLowerCase()} ask at ${askActs} act(s) of stake.`, refused: false };
  }
  // A record can miss the obstacle for two very different reasons, and
  // conflating them is how a ledged turns into a euphemism: the ASK may be too
  // large for an otherwise real stake, or the RECORD may be worse than the base
  // rate for the class entirely. The declared hazard rate is the line.
  if (interval.high !== null && interval.high < obstacle) {
    const hazard = round(hazardPct, 1) / 100;
    if (interval.high < hazard) {
      return { ...base, verdict: 'drawn-down', reason: `The interval's high end (${base.intervalHighPct}%) is below even the declared ${round(hazardPct, 1)}% class hazard rate. This is not a large ask — it is a record worse than the base rate. A repair is the only honest route.`, refused: false };
    }
    return { ...base, verdict: 'encumbered', reason: `The interval's high end (${base.intervalHighPct}%) sits below the ${price.obstaclePct}% obstacle: the stake is real but the ask is larger than the record has earned.`, refused: false };
  }
  return refused(`The interval ${base.intervalLowPct}–${base.intervalHighPct}% straddles the ${price.obstaclePct}% obstacle. The honest output is a refusal, not a coin-flip with a badge.`);
}

/* ------------------------------------------------------------------ */
/* 2. The act ledger — derived from records other modules already own  */
/* ------------------------------------------------------------------ */

const DAY_MS = 86400000;
const oneYearBack = (now, days) => dayKey(new Date(new Date(now).getTime() - days * DAY_MS));

/**
 * Harvest every act the workspace can already evidence.
 *
 * Each source is a MODULE THAT ALREADY DATES THE WORK. The harvesters only read:
 * they never mutate, never copy a note, and never invent an act for a record
 * whose outcome is unknown. An ungraded prospective contract is not a kept act;
 * it is simply not yet an act.
 */
export function harvestActs(state, { now = new Date(), conventions = null } = {}) {
  const conv = conventions || reputationConventions(state?.settings || {});
  const since = oneYearBack(now, conv.reputationWindowDays);
  const today = dayKey(now);
  const excluded = [];
  const acts = [];
  const push = (act) => {
    if (!act.personId || !act.actClass || !ACT_CLASS_KEYS.includes(act.actClass)) return;
    if (!act.on || act.on > today) return;
    if (act.on < since) return;
    acts.push({
      id: act.id,
      personId: act.personId,
      actClass: act.actClass,
      sourceType: act.sourceType,
      sourceId: act.sourceId || null,
      status: act.status,
      on: act.on,
      derived: true,
      note: '',
    });
  };

  // ── delivery: a delegation that came back, and came back on time ────────────
  for (const row of Array.isArray(state?.delegations) ? state.delegations : []) {
    if (!row || !row.personId) continue;
    const closedOn = row.status === 'done' ? row.completedOn : (row.status === 'returned' ? row.returnedOn : null);
    if (!closedOn) continue;
    const late = Boolean(row.dueOn) && closedOn > row.dueOn;
    push({ id: `del:${row.id}`, personId: row.personId, actClass: 'delivery', sourceType: 'delegation', sourceId: row.id, status: late ? 'breached' : 'kept', on: closedOn });
  }

  // ── custody: bounded authority verified (or breached) by the sender ────────
  for (const row of Array.isArray(state?.mandates) ? state.mandates : []) {
    if (!row || !row.receiverId) continue;
    const status = String(row.status || '');
    if (status === 'verified') push({ id: `man:${row.id}`, personId: row.receiverId, actClass: 'custody', sourceType: 'mandate', sourceId: row.id, status: 'kept', on: row.verifiedOn || row.deliveredOn || row.acceptedOn });
    else if (status === 'breached') push({ id: `man:${row.id}`, personId: row.receiverId, actClass: 'custody', sourceType: 'mandate', sourceId: row.id, status: 'breached', on: row.breachedOn || row.returnedOn || row.acceptedOn });
  }

  // ── calibration: a prospective bet graded against its own threshold ────────
  for (const row of Array.isArray(state?.prospectiveContracts) ? state.prospectiveContracts : []) {
    if (!row || !row.ownerId) continue;
    const grade = row.grade;
    if (!grade || grade.y === null || grade.y === undefined) continue;
    const threshold = Number(row.thresholdPct);
    const probability = Number(row.probabilityPct);
    if (!Number.isFinite(threshold) || !Number.isFinite(probability)) continue;
    const on = row.gradedOn || row.horizonOn;
    if (!on) continue;
    // A "kept" bet is one whose stated probability justified the threshold it
    // shipped with: it met the bar it declared, not the bar hindsight chose.
    const kept = probability >= threshold ? grade.y === 1 : grade.y === 0;
    push({ id: `pro:${row.id}`, personId: row.ownerId, actClass: 'calibration', sourceType: 'prospective', sourceId: row.id, status: kept ? 'kept' : 'breached', on });
  }

  // ── stewardship: an escalation settled where it arose ─────────────────────
  for (const row of Array.isArray(state?.escalationRecords) ? state.escalationRecords : []) {
    if (!row || !row.ownerId) continue;
    const on = row.settledOn || row.absorbedOn;
    if (!on) continue;
    push({ id: `esc:${row.id}`, personId: row.ownerId, actClass: 'stewardship', sourceType: 'escalation', sourceId: row.id, status: row.absorbedBy === 'self' || row.absorbed === true ? 'kept' : 'breached', on });
  }

  // ── allocation: a funded robust plan delivered against its frozen solution ──
  for (const row of Array.isArray(state?.robustPlans) ? state.robustPlans : []) {
    if (!row || !row.ownerId) continue;
    const on = row.deliveredOn || (row.status === 'delivered' ? row.updatedOn || row.adoptedOn : null);
    if (!on) continue;
    const lines = Array.isArray(row.lines) ? row.lines : [];
    const funded = lines.reduce((sum, line) => sum + (Number(line?.units) || 0), 0);
    const delivered = lines.reduce((sum, line) => sum + (Number(line?.deliveredUnits) || 0), 0);
    const kept = funded > 0 ? delivered >= funded : false;
    push({ id: `ral:${row.id}`, personId: row.ownerId, actClass: 'allocation', sourceType: 'robustplan', sourceId: row.id, status: kept ? 'kept' : 'breached', on });
  }

  // ── forecast: a frozen prediction scored once, against its interval ─────────
  for (const row of Array.isArray(state?.forecastChallenges) ? state.forecastChallenges : []) {
    if (!row || !row.ownerId) continue;
    const on = row.resolvedOn || row.scoredOn;
    if (!on) continue;
    const outcome = String(row.outcome || row.status || '');
    if (outcome !== 'held' && outcome !== 'missed') continue;
    push({ id: `fc:${row.id}`, personId: row.ownerId, actClass: 'forecast', sourceType: 'forecast', sourceId: row.id, status: outcome === 'held' ? 'kept' : 'breached', on });
  }

  // ── contribution: a recognition the person's own leader did not witness ─────
  for (const row of Array.isArray(state?.recognition) ? state.recognition : []) {
    if (!row || !row.personId || !row.date) continue;
    const giver = String(row.givenBy || row.leaderId || '').trim();
    if (!giver || giver === LEADER_ID) continue;
    push({ id: `rec:${row.id}`, personId: row.personId, actClass: 'contribution', sourceType: 'recognition', sourceId: row.id, status: 'kept', on: row.date });
  }

  // ── continuity: the person's own declared edge carried work ────────────────
  // A span whose declared edge is measurably silent is a BREACH of continuity,
  // not a person's failure — but it is a fact about the edge they hold, and the
  // ledger records it as an act so an organisation can see the pattern in one
  // class rather than in a reorg post-mortem. It is counted at most once per
  // person per window so a single silent month cannot drown out a year of acts.
  const federation = Array.isArray(state?.federationAssessments) ? state.federationAssessments : [];
  const latest = federation.slice().sort((a, b) => String(b.frozenOn || '').localeCompare(String(a.frozenOn || '')))[0] || null;
  if (latest && Array.isArray(latest.rows)) {
    for (const row of latest.rows) {
      if (!row || !row.seatId) continue;
      if (row.state === 'direct') push({ id: `fed:${latest.id}:${row.seatId}`, personId: row.seatId, actClass: 'continuity', sourceType: 'federation', sourceId: latest.id, status: 'kept', on: latest.frozenOn });
      else if (row.state === 'silent' && row.suppressed !== true) push({ id: `fed:${latest.id}:${row.seatId}`, personId: row.seatId, actClass: 'continuity', sourceType: 'federation', sourceId: latest.id, status: 'breached', on: latest.frozenOn });
    }
  } else {
    excluded.push({ source: 'federation', reason: 'No frozen federation reading exists, so no edge has been measured and continuity is not an act class yet.' });
  }

  // ── human-entered acts: the only records a person types themselves ─────────
  for (const row of Array.isArray(state?.reputationActs) ? state.reputationActs : []) {
    if (!row || row.derived) continue;
    if (!row.on || !row.personId || !ACT_CLASS_KEYS.includes(row.actClass)) continue;
    acts.push({
      id: row.id,
      personId: row.personId,
      actClass: row.actClass,
      sourceType: row.sourceType || 'manual',
      sourceId: row.sourceId || null,
      status: row.status,
      on: row.on,
      derived: false,
      note: '',
    });
  }

  return { acts, excluded, windowDays: conv.reputationWindowDays, since, today };
}

/**
 * Decay and fold the harvested acts into one cell per person × act class.
 * Excusals are dropped here (they neither build nor destroy stake) and the
 * removal is COUNTED so the screen can print it.
 */
export function buildActCells(acts, { now = new Date(), conventions }) {
  const conv = conventions || reputationConventions({});
  const today = dayKey(now);
  const cells = new Map();
  let excused = 0;
  let lapsed = 0;
  for (const act of Array.isArray(acts) ? acts : []) {
    if (act.status === 'excused') {
      excused += 1;
      continue;
    }
    const age = daysBetween(act.on, today);
    if (age === null) continue;
    if (age < 0) continue;
    if (age > conv.reputationWindowDays) {
      lapsed += 1;
      continue;
    }
    const weight = decayWeight(age, conv.reputationHalfLifeDays);
    const key = `${act.personId}|${act.actClass}`;
    if (!cells.has(key)) {
      cells.set(key, {
        personId: act.personId,
        actClass: act.actClass,
        kept: 0,
        breached: 0,
        disputed: 0,
        rawKept: 0,
        rawBreached: 0,
        lastActOn: null,
        actsN: 0,
      });
    }
    const cell = cells.get(key);
    cell.actsN += 1;
    if (act.status === 'disputed') cell.disputed += 1;
    else if (act.status === 'kept') {
      cell.kept += weight;
      cell.rawKept += 1;
    } else if (act.status === 'breached') {
      cell.breached += weight;
      cell.rawBreached += 1;
    }
    if (!cell.lastActOn || act.on > cell.lastActOn) cell.lastActOn = act.on;
  }
  return { cells, excused, lapsed };
}

/* ------------------------------------------------------------------ */
/* 3. Open guarantee and repair positions                              */
/* ------------------------------------------------------------------ */

/**
 * The workspace's open positions, each priced against TODAY'S record.
 *
 * A guarantee is a promise about a person made by the span above them (or by the
 * leader). A repair is a promise a person made about themselves: N acts of this
 * class, kept before a date, that re-establish the stake a breach destroyed. A
 * repair is deliberately a costly, observable signal — Fudenberg & Tirole's
 * point — because a costless apology rebuilds nothing.
 */
export function pricePositions(state, cells, { now = new Date(), conventions }) {
  const conv = conventions || reputationConventions(state?.settings || {});
  const today = dayKey(now);
  const positions = Array.isArray(state?.reputationPositions) ? state.reputationPositions : [];
  return positions
    .filter((row) => row && (row.status === 'open'))
    .map((row) => {
      const cell = cells.get(`${row.personId}|${row.actClass}`) || null;
      const reading = cellReading({
        kept: cell ? cell.kept : 0,
        breached: cell ? cell.breached : 0,
        disputed: cell ? cell.disputed : 0,
        lastActOn: cell ? cell.lastActOn : null,
        actFloor: conv.reputationActFloor,
        exposureFloor: conv.reputationExposureFloor,
        windowDays: conv.reputationWindowDays,
        halfLifeDays: conv.reputationHalfLifeDays,
        hazardPct: conv.reputationClassHazard[convClass(row.actClass)],
        priorActs: 2,
        gamma: conv.reputationObstacleGamma,
        askActs: Number(row.askActs) || 0,
        tier: row.tier || 'vouching',
        now: today,
      });
      const ageDays = daysBetween(row.openedOn, today);
      const dueInDays = row.dueOn ? -((daysBetween(row.dueOn, today)) ?? 0) : null;
      return {
        ...row,
        reading,
        ageDays: ageDays === null ? null : Math.max(0, ageDays),
        dueInDays,
        overdue: Boolean(row.dueOn) && row.dueOn < today,
      };
    });
}

function convClass(key) {
  return ACT_CLASS_KEYS.includes(key) ? key : 'delivery';
}

/* ------------------------------------------------------------------ */
/* 4. The report                                                       */
/* ------------------------------------------------------------------ */

/**
 * The whole reading, rebuilt from records on every call.
 *
 * Every figure is re-derived: none is cached, none is copied into a snapshot
 * that could later disagree with the ledger it came from. The report is
 * identity-reduced because it is expensive to build — but the CELLS it returns
 * internally carry person ids because the seat layer must be able to scope them.
 * `publishedCells` is what a view may print, and it is already scoped.
 */
export function buildReputationReport(state = {}, { now = new Date(), settings = null, seatId = null } = {}) {
  const effectiveSettings = settings || state?.settings || {};
  const conv = reputationConventions(effectiveSettings);
  const today = dayKey(now);
  const built = buildSeats(state, { now, settings: effectiveSettings });
  // Scope to the OPERATING SEAT, not to the workspace: an undeclared workspace
  // reads through the seat the product itself resolves (activeSeat), so a
  // frontline lead opening this screen sees their own span and never a peer's.
  const declared = seatId && built.byId.has(seatId) ? built.byId.get(seatId) : null;
  const seat = declared || (built.seats.length ? activeSeat(built) : null);

  const harvest = harvestActs(state, { now, conventions: conv });
  const { cells, excused, lapsed } = buildActCells(harvest.acts, { now, conventions: conv });

  // ── Which people may this seat read at all? ────────────────────────────────
  // A seat reads itself and the spans BENEATH it. It never reads a peer, never a
  // manager, and never the whole workspace unless it is the leader's own seat.
  const readablePeople = new Set();
  if (!seat || seat.fullAccess) {
    for (const person of Array.isArray(state?.people) ? state.people : []) if (person?.id) readablePeople.add(person.id);
  } else {
    // ADR-0101 defect repair: `seat.subtreeIds` is an EMPTY array on every real
    // seat — the scope that is actually populated is `seat.scope` (a Set built
    // from the chain's subtree). Reading the empty array made a declared seat see
    // exactly itself and nothing beneath it, so a frontline lead could never see
    // their own ICs. `scope` is the seat's own access primitive; use it, and fall
    // back to `subtreeIds` only if a future seat supplies that shape instead.
    readablePeople.add(seat.id);
    for (const id of seat.scope || []) readablePeople.add(id);
    for (const id of seat.subtreeIds || []) readablePeople.add(id);
  }

  const readings = [];
  for (const cell of cells.values()) {
    if (!readablePeople.has(cell.personId)) continue;
    const reading = cellReading({
      kept: cell.kept,
      breached: cell.breached,
      disputed: cell.disputed,
      lastActOn: cell.lastActOn,
      actFloor: conv.reputationActFloor,
      exposureFloor: conv.reputationExposureFloor,
      windowDays: conv.reputationWindowDays,
      halfLifeDays: conv.reputationHalfLifeDays,
      hazardPct: conv.reputationClassHazard[convClass(cell.actClass)],
      priorActs: 2,
      gamma: conv.reputationObstacleGamma,
      askActs: conv.reputationAskActs,
      tier: 'vouching',
      now: today,
    });
    readings.push({
      personId: cell.personId,
      actClass: cell.actClass,
      hazardPct: conv.reputationClassHazard[convClass(cell.actClass)],
      ...reading,
    });
  }

  // ── Aggregation by class and by altitude ──────────────────────────────────
  // Pooled counts, never a mean of rates: the report prints the pooled rate, an
  // exact sum of the acts beneath it, and refuses below the publishing floor.
  const byClass = new Map();
  for (const reading of readings) {
    if (!byClass.has(reading.actClass)) byClass.set(reading.actClass, { kept: 0, breached: 0, disputed: 0, persons: new Set(), expiredN: 0, refusedN: 0, solventN: 0, encumberedN: 0, 'drawn-downN': 0, contestedN: 0, insolventN: 0 });
    const bucket = byClass.get(reading.actClass);
    bucket.kept += reading.kept;
    bucket.breached += reading.breached;
    bucket.disputed += reading.disputed;
    bucket.persons.add(reading.personId);
    if (reading.verdict === 'expired') bucket.expiredN += 1;
    if (reading.verdict === 'solvent') bucket.solventN += 1;
    if (reading.verdict === 'encumbered') bucket.encumberedN += 1;
    if (reading.verdict === 'drawn-down') bucket['drawn-downN'] += 1;
    if (reading.verdict === 'contested') bucket.contestedN += 1;
    if (reading.verdict === 'insolvent') bucket.insolventN += 1;
    if (reading.refused) bucket.refusedN += 1;
  }
  const classRows = ACT_CLASSES.map((meta) => {
    const bucket = byClass.get(meta.key) || { kept: 0, breached: 0, disputed: 0, persons: new Set(), expiredN: 0, refusedN: 0, solventN: 0, encumberedN: 0, 'drawn-downN': 0, contestedN: 0, insolventN: 0 };
    const exposure = bucket.kept + bucket.breached;
    const interval = wilsonBeta(bucket.kept, bucket.breached);
    const publishable = exposure >= conv.reputationExposureFloor && bucket.persons.size >= conv.reputationPublishedCellFloor;
    return {
      actClass: meta.key,
      label: meta.label,
      frontier: meta.frontier,
      question: meta.question,
      kept: round(bucket.kept, 2),
      breached: round(bucket.breached, 2),
      disputed: bucket.disputed,
      exposure: round(exposure, 2),
      personsN: bucket.persons.size,
      hazardPct: conv.reputationClassHazard[meta.key],
      pooledPct: publishable && exposure ? round((bucket.kept / exposure) * 100, 1) : null,
      intervalLowPct: publishable && interval.low !== null ? round(interval.low * 100, 1) : null,
      intervalHighPct: publishable && interval.high !== null ? round(interval.high * 100, 1) : null,
      suppressed: !publishable,
      suppressedReason: publishable ? null : `Below the publishing floor (${conv.reputationExposureFloor} weighted acts and ${conv.reputationPublishedCellFloor} spans).`,
      expiredN: bucket.expiredN,
      refusedN: bucket.refusedN,
      solventN: bucket.solventN,
      encumberedN: bucket.encumberedN,
      drawnDownN: bucket['drawn-downN'],
      contestedN: bucket.contestedN,
      insolventN: bucket.insolventN,
    };
  });

  const positions = pricePositions(state, cells, { now, conventions: conv });

  // ── The withdrawal shock ──────────────────────────────────────────────────
  // "Which portfolios would fail if a class were drawn to zero?" — the exec
  // question, answered as an exact count rather than a heatmap. A position is
  // AT RISK when its cell is not solvent; the shock sets every cell of the class
  // to zero and re-counts. No probability is assigned: the shock is a declared
  // scenario, not a forecast.
  const classAtRisk = new Map();
  for (const position of positions) {
    if (!classAtRisk.has(position.actClass)) classAtRisk.set(position.actClass, { total: 0, atRisk: 0 });
    const bucket = classAtRisk.get(position.actClass);
    bucket.total += 1;
    if (position.reading.verdict !== 'solvent') bucket.atRisk += 1;
  }
  const shocks = ACT_CLASSES.map((meta) => {
    const bucket = classAtRisk.get(meta.key) || { total: 0, atRisk: 0 };
    return {
      actClass: meta.key,
      label: meta.label,
      openPositionsN: bucket.total,
      atRiskN: bucket.atRisk,
      atRiskPct: bucket.total ? round((bucket.atRisk / bucket.total) * 100, 1) : null,
      // The declared shock: zero out this class across every readable span and
      // count what no longer clears its obstacle.
      shockN: bucket.total,
    };
  }).filter((row) => row.openPositionsN > 0);

  // ── The growth / drawdown verdict ─────────────────────────────────────────
  // Two windows of the same class, compared on POOLED kept/breached acts of the
  // spans the seat can read. Deliberately coarse: the point is direction, and a
  // direction read off ten acts is not a finding.
  const halfWindow = Math.max(7, Math.round(conv.reputationWindowDays / 2));
  const cut = oneYearBack(now, halfWindow);
  const recent = { kept: 0, breached: 0 };
  const prior = { kept: 0, breached: 0 };
  for (const act of harvest.acts) {
    if (!readablePeople.has(act.personId)) continue;
    if (act.status === 'excused' || act.status === 'disputed') continue;
    const bucket = act.on >= cut ? recent : prior;
    if (act.status === 'kept') bucket.kept += 1;
    else if (act.status === 'breached') bucket.breached += 1;
  }
  const recentExposure = recent.kept + recent.breached;
  const priorExposure = prior.kept + prior.breached;
  let growth = { verdict: 'refused', reason: 'Not enough acts on either side of the window split to state a direction.', recentExposure, priorExposure, deltaPctPoints: null };
  if (recentExposure >= conv.reputationExposureFloor && priorExposure >= conv.reputationExposureFloor) {
    const recentRate = recent.kept / recentExposure;
    const priorRate = prior.kept / priorExposure;
    const rc = wilsonBeta(recent.kept, recent.breached);
    const pc = wilsonBeta(prior.kept, prior.breached);
    const delta = round((recentRate - priorRate) * 100, 1);
    const separated = rc.low !== null && pc.high !== null && (rc.low > pc.high || rc.high < pc.low);
    growth = {
      verdict: separated ? (delta > 0 ? 'growing' : 'drawing-down') : 'flat',
      reason: separated
        ? `The two windows' Wilson intervals do not overlap: the kept share moved ${delta > 0 ? '+' : ''}${delta} points.`
        : `The intervals overlap; the ${delta > 0 ? '+' : ''}${delta}-point difference is inside the noise. Reported flat, not as a trend.`,
      recentExposure,
      priorExposure,
      deltaPctPoints: delta,
      recentPct: round(recentRate * 100, 1),
      priorPct: round(priorRate * 100, 1),
    };
  }

  // ── The five altitude playbooks, with the numbers this seat may see ───────
  const rank = seat?.rank ?? 5;
  const playbook = REPUTATION_PLAYBOOK[altitudeKeyForRank(rank)] || REPUTATION_PLAYBOOK.chief;

  const openDecisions = Array.isArray(state?.decisions)
    ? state.decisions.filter((d) => d && !d.chosen && /^(Guarantee|Repair|Class withdrawal|Contested act)/.test(String(d.title || '')))
    : [];
  const openRepairs = positions.filter((p) => p.kind === 'repair');
  const openGuarantees = positions.filter((p) => p.kind === 'guarantee');

  return {
    ok: true,
    engineVersion: REPUTATION_ENGINE_VERSION,
    today,
    conventions: conv,
    seat: seat ? { id: seat.id, rank: seat.rank, fullAccess: Boolean(seat.fullAccess), altitude: seat.altitude || null } : null,
    playbook,
    premise: REPUTATION_PREMISE,
    disclosure: REPUTATION_DISCLOSURE,
    readings,
    classRows,
    positions,
    shocks,
    growth,
    openDecisions,
    openRepairsN: openRepairs.length,
    openGuaranteesN: openGuarantees.length,
    totals: {
      actsN: harvest.acts.length,
      excusedN: excused,
      lapsedN: lapsed,
      cellsN: readings.length,
      solventN: readings.filter((r) => r.verdict === 'solvent').length,
      encumberedN: readings.filter((r) => r.verdict === 'encumbered').length,
      drawnDownN: readings.filter((r) => r.verdict === 'drawn-down').length,
      contestedN: readings.filter((r) => r.verdict === 'contested').length,
      expiredN: readings.filter((r) => r.verdict === 'expired').length,
      refusedN: readings.filter((r) => r.refused).length,
      openPositionsN: positions.length,
    },
    excluded: harvest.excluded,
  };
}

function altitudeKeyForRank(rank) {
  if (rank >= 5) return 'chief';
  if (rank === 4) return 'exec';
  if (rank === 3) return 'director';
  if (rank === 2) return 'manager';
  return 'frontline';
}

/* ------------------------------------------------------------------ */
/* 5. The counterfactual — what would make this cell solvent           */
/* ------------------------------------------------------------------ */

/**
 * The cheapest honest path from here to a solvent cell, in ACTS.
 *
 * Two levers, priced side by side so a leader can see that a structural change
 * is usually cheaper than an accumulated one:
 *   - keep N more acts of this class (the record route), and
 *   - drop the tier (the structural route),
 * and the number of acts a repair would have to bank before the next guarantee
 * is safe. Every answer is an integer count of acts — never a probability the
 * person could not afford.
 */
export function counterfactualActs(reading, conventions) {
  const conv = conventions || reputationConventions({});
  if (!reading) return null;
  const baseKept = Math.max(0, Number(reading.kept) || 0);
  const baseBreached = Math.max(0, Number(reading.breached) || 0);
  const askActs = Number(reading.price?.askActs) || 0;
  // Least kept acts (recorded breaches held constant — a banked act never
  // deletes a breach) that would put the interval's LOW end above `obstacle`.
  const actsTo = (obstacle) => {
    for (let extra = 0; extra <= 400; extra += 1) {
      const probe = wilsonBeta(baseKept + extra, baseBreached);
      if (probe.low !== null && probe.low >= obstacle) return extra;
    }
    return null;
  };
  const tiers = ENGAGEMENT_TIERS.map((tier) => {
    const price = obstaclePct({ tier: tier.key, stakeActs: baseKept + baseBreached + askActs, askActs, gamma: conv.reputationObstacleGamma });
    const obstacle = price.obstaclePct / 100;
    const acts = actsTo(obstacle);
    const already = wilsonBeta(baseKept, baseBreached);
    const clearsNow = already.low !== null && already.low >= obstacle;
    return { tier: tier.key, label: tier.label, obstaclePct: price.obstaclePct, acts, clearsNow };
  });
  const cheapest = tiers
    .filter((row) => row.acts !== null)
    .sort((a, b) => a.acts - b.acts || a.obstaclePct - b.obstaclePct)[0] || null;
  return {
    obstaclePct: reading.obstaclePct,
    actsToSolvency: actsTo(reading.obstaclePct / 100),
    tiers,
    cheapestRoute: cheapest,
    // The reader's answer, in one line: the cheapest honest way to make this
    // cell carry the ask, whether that is a repair or a structural move.
    verdict: cheapest ? `${cheapest.acts === 0 ? 'Already solvent' : `${cheapest.acts} kept act(s)`} at the ${cheapest.label.toLowerCase()} tier (${cheapest.obstaclePct}% obstacle)` : 'No number of acts clears this obstacle: the shape of the ask is wrong, not the record.',
  };
}

/* ------------------------------------------------------------------ */
/* 6. Attention, signals and CSV                                       */
/* ------------------------------------------------------------------ */

export function reputationAttentionCount(state, { now = new Date(), settings = null } = {}) {
  const report = buildReputationReport(state, { now, settings });
  let count = 0;
  for (const reading of report.readings) {
    if (reading.verdict === 'contested') count += 2;
    else if (reading.verdict === 'encumbered') count += 1;
  }
  for (const position of report.positions) {
    if (position.overdue) count += 1;
    if (position.reading.verdict === 'contested') count += 1;
  }
  count += report.openDecisions.length;
  return count;
}

/**
 * Platform-shaped signals: `{ ruleId, domain, title, detail, severity,
 * confidence, evidence[], action{label, route}, personId? }`. The board and the
 * after-action ledger read these without a translation layer.
 */
export function reputationSignals(state = {}, { now = new Date(), settings = null } = {}) {
  const report = buildReputationReport(state, { now, settings });
  const out = [];
  for (const reading of report.readings) {
    if (reading.verdict === 'contested') {
      out.push({
        ruleId: 'RCLA-01',
        domain: 'Reputation',
        title: 'A reputational claim is disputed',
        detail: `${reading.disputed} act(s) of the ${reading.actClass} class are contested. The ledger will not resolve the dispute, and it will not price a guarantee on that class until a human does.`,
        severity: 4,
        confidence: 'high',
        evidence: [`${reading.actClass}: ${reading.actsN} act(s), ${reading.disputed} disputed`],
        action: { label: 'Open the contested classes', route: '#/reputation?panel=repair' },
        personId: reading.personId,
      });
    } else if (reading.verdict === 'drawn-down') {
      out.push({
        ruleId: 'RCLA-06',
        domain: 'Reputation',
        title: 'A class is being drawn down below its base rate',
        detail: `The ${reading.actClass} interval tops out at ${reading.intervalHighPct}%, below even the declared ${reading.hazardPct}% class hazard rate. This is not a large ask; the record is worse than the base rate.`,
        severity: 4,
        confidence: 'medium',
        evidence: [`${reading.actClass}: ${reading.kept.toFixed(1)} kept, ${reading.breached.toFixed(1)} decayed breaches`],
        action: { label: 'Price the repair', route: '#/reputation?panel=repair' },
        personId: reading.personId,
      });
    } else if (reading.verdict === 'encumbered') {
      out.push({
        ruleId: 'RCLA-02',
        domain: 'Reputation',
        title: 'A guarantee ask exceeds what the record has earned',
        detail: `The ${reading.actClass} class interval tops out at ${reading.intervalHighPct}% against a ${reading.obstaclePct}% obstacle. The stake is real; the ask is larger.`,
        severity: 3,
        confidence: 'medium',
        evidence: [`${reading.actClass}: ${reading.kept.toFixed(1)} kept, ${reading.breached.toFixed(1)} decayed breaches`],
        action: { label: 'Price a repair', route: '#/reputation?panel=repair' },
        personId: reading.personId,
      });
    }
  }
  for (const position of report.positions) {
    if (position.overdue) {
      out.push({
        ruleId: 'RCLA-03',
        domain: 'Reputation',
        title: 'An open reputational position has lapsed',
        detail: `A ${position.kind} on the ${position.actClass} class passed its due date without being closed. An open position is a claim nobody is standing behind.`,
        severity: 3,
        confidence: 'high',
        evidence: [`Opened ${position.openedOn}, due ${position.dueOn}`],
        action: { label: 'Close or withdraw the position', route: '#/reputation?panel=positions' },
        personId: position.personId,
      });
    }
  }
  if (report.growth.verdict === 'drawing-down') {
    out.push({
      ruleId: 'RCLA-04',
      domain: 'Reputation',
      title: 'Reputational capital is being drawn down',
      detail: report.growth.reason,
      severity: 4,
      confidence: 'medium',
      evidence: [`Recent window ${report.growth.recentExposure} acts, prior ${report.growth.priorExposure} acts`],
      action: { label: 'Read the class split', route: '#/reputation?panel=desk' },
    });
  }
  const insolvent = report.classRows.filter((row) => row.insolventN > 0);
  for (const row of insolvent.slice(0, 2)) {
    out.push({
      ruleId: 'RCLA-05',
      domain: 'Reputation',
      title: `No counter-party here has a ${row.label.toLowerCase()} record`,
      detail: `${row.insolventN} span(s) have no completed act of this class, so a guarantee resting on it is worth its stated price and nothing more. That is a structural gap, not a personal one.`,
      severity: 3,
      confidence: 'high',
      evidence: [`${row.label}: ${row.personsN} span(s) with acts, ${row.insolventN} with none`],
      action: { label: 'See the tier ladder', route: '#/reputation?panel=guarantees' },
    });
  }
  return out;
}

/**
 * The CSV rows. Aggregate-only and refusal-honest by construction: one row per
 * act class, one per class × verdict band, one per open position band. NO person
 * id, name, act id, source id or note reaches the export — a published cell
 * never carries the identity that produced it.
 */
export function reputationCsvRows(report) {
  const rows = [];
  for (const row of report.classRows) {
    rows.push({
      row_kind: 'class',
      act_class: row.actClass,
      verdict_band: '',
      spans_n: row.personsN,
      kept: row.kept,
      breached: row.breached,
      exposure: row.exposure,
      pooled_kept_pct: row.pooledPct ?? '',
      interval_low_pct: row.intervalLowPct ?? '',
      interval_high_pct: row.intervalHighPct ?? '',
      hazard_pct: row.hazardPct,
      suppressed: row.suppressed ? 1 : 0,
      solvent_n: row.solventN,
      encumbered_n: row.encumberedN,
      drawn_down_n: row.drawnDownN,
      contested_n: row.contestedN,
      expired_n: row.expiredN,
      refused_n: row.refusedN,
      insolvent_n: row.insolventN,
    });
  }
  const bands = ['solvent', 'encumbered', 'drawn-down', 'contested', 'expired', 'refused', 'insolvent'];
  for (const actClass of ACT_CLASS_KEYS) {
    for (const band of bands) {
      const matching = report.readings.filter((r) => r.actClass === actClass && (band === 'refused' ? r.refused : r.verdict === band));
      if (!matching.length) continue;
      const kept = matching.reduce((s, r) => s + r.kept, 0);
      const breached = matching.reduce((s, r) => s + r.breached, 0);
      const exposure = kept + breached;
      const interval = wilsonBeta(kept, breached);
      const publishable = exposure >= report.conventions.reputationExposureFloor;
      rows.push({
        row_kind: 'band',
        act_class: actClass,
        verdict_band: band,
        spans_n: matching.length,
        kept: round(kept, 2),
        breached: round(breached, 2),
        exposure: round(exposure, 2),
        pooled_kept_pct: publishable ? round((kept / exposure) * 100, 1) : '',
        interval_low_pct: publishable && interval.low !== null ? round(interval.low * 100, 1) : '',
        interval_high_pct: publishable && interval.high !== null ? round(interval.high * 100, 1) : '',
        hazard_pct: report.conventions.reputationClassHazard[actClass],
        suppressed: publishable ? 0 : 1,
        solvent_n: '', encumbered_n: '', drawn_down_n: '', contested_n: '', expired_n: '', refused_n: '', insolvent_n: '',
      });
    }
  }
  for (const tier of ENGAGEMENT_TIERS) {
    const matching = report.positions.filter((p) => p.tier === tier.key);
    rows.push({
      row_kind: 'tier',
      act_class: '',
      verdict_band: tier.key,
      spans_n: matching.length,
      kept: '', breached: '', exposure: '',
      pooled_kept_pct: '', interval_low_pct: '', interval_high_pct: '',
      hazard_pct: tier.obstaclePct,
      suppressed: 0,
      solvent_n: matching.filter((p) => p.reading.verdict === 'solvent').length,
      encumbered_n: matching.filter((p) => p.reading.verdict === 'encumbered').length,
      drawn_down_n: matching.filter((p) => p.reading.verdict === 'drawn-down').length,
      contested_n: matching.filter((p) => p.reading.verdict === 'contested').length,
      expired_n: matching.filter((p) => p.reading.verdict === 'expired').length,
      refused_n: matching.filter((p) => p.reading.refused).length,
      insolvent_n: matching.filter((p) => p.reading.verdict === 'insolvent').length,
    });
  }
  rows.push({
    row_kind: 'growth',
    act_class: '',
    verdict_band: report.growth.verdict,
    spans_n: '',
    kept: '', breached: '', exposure: report.growth.recentExposure + report.growth.priorExposure,
    pooled_kept_pct: report.growth.recentPct ?? '',
    interval_low_pct: '', interval_high_pct: '',
    hazard_pct: '',
    suppressed: report.growth.verdict === 'refused' ? 1 : 0,
    solvent_n: '', encumbered_n: '', drawn_down_n: '', contested_n: '', expired_n: '', refused_n: '', insolvent_n: '',
  });
  return rows;
}

/**
 * The identity-free upward brief. Written in the voice this app uses everywhere:
 * counts, intervals, and the limits stated in the same breath.
 */
export function reputationBriefText(report) {
  const lines = [];
  lines.push(`# Reputational capital — ${report.today}`);
  lines.push('');
  lines.push(`Reading at: ${report.seat ? `rank ${report.seat.rank} seat` : 'no declared seat'}. Window ${report.conventions.reputationWindowDays} days, half-life ${report.conventions.reputationHalfLifeDays} days, act floor ${report.conventions.reputationActFloor}, exposure floor ${report.conventions.reputationExposureFloor}.`);
  lines.push('');
  lines.push(`- Acts on record: ${report.totals.actsN} (${report.totals.excusedN} excused, ${report.totals.lapsedN} lapsed outside the window)`);
  lines.push(`- Cells read: ${report.totals.cellsN} — solvent ${report.totals.solventN}, encumbered ${report.totals.encumberedN}, drawn down ${report.totals.drawnDownN}, contested ${report.totals.contestedN}, lapsed ${report.totals.expiredN}, refused ${report.totals.refusedN}`);
  lines.push(`- Open positions: ${report.totals.openPositionsN} (guarantees ${report.openGuaranteesN}, repairs ${report.openRepairsN})`);
  lines.push(`- Direction: ${report.growth.verdict}${report.growth.deltaPctPoints === null ? '' : ` (${report.growth.deltaPctPoints > 0 ? '+' : ''}${report.growth.deltaPctPoints} points)`} — ${report.growth.reason}`);
  lines.push('');
  lines.push('## By class (pooled, suppressed below the publishing floor)');
  for (const row of report.classRows) {
    const rate = row.suppressed ? 'suppressed' : `${row.pooledPct}% [${row.intervalLowPct}–${row.intervalHighPct}%]`;
    lines.push(`- ${row.label}: ${rate} over ${row.exposure} weighted act(s) across ${row.personsN} span(s); declared hazard ${row.hazardPct}%.`);
  }
  lines.push('');
  lines.push('## What this does not say');
  lines.push('- No person is rated, ranked or scored. The unit is what an act will cost to guarantee.');
  lines.push('- No probability is assigned to a withdrawal; the shock table is a declared scenario.');
  lines.push(`- Seats are local workflow declarations, not authenticated identity.`);
  return lines.join('\n');
}
