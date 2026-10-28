/**
 * app/core/domain/premiseTails.js — Assumption-Aware Scenario Tails +
 * Correlated-Evidence Clustering (Session 55).
 *
 * The question no OKR/scenario tool answers: "my delivery forecast assumes
 * things that may no longer be true — how much wider is the tail because of
 * THAT, and which assumption is doing the damage?"
 *
 * Method (all deterministic, seeded, local):
 *  1. Coupling: each non-retired premise is linked to portfolio work through
 *     the same two-hop typed graph the Premise Sentinel already uses
 *     (buildPremiseScope). Belief that the premise still holds is the
 *     Sentinel posterior. Failure probability = 1 - posterior.
 *  2. Shock convention (transparent, leader-visible, NOT calibrated):
 *     if a premise fails, every coupled committed item's sampled effort is
 *     multiplied by 1 + shock, shock by criticality:
 *     load-bearing 0.60, major 0.40, monitor 0.25. Multiple failed premises
 *     compound multiplicatively (capped at x3 per item).
 *  3. Paired simulation: baseline and premise-coupled worlds share the SAME
 *     seeded Beta-PERT draws (Law & Kelton Common Random Numbers), so the
 *     P50/P80/P90 delta isolates premise fragility, not sampling noise.
 *  4. Attribution: leave-one-out — rerun the coupled world with one premise
 *     forced true; its tail contribution is the P90 it removes. This is the
 *     "hold that assumption at its most likely value" test practitioners ask
 *     for, made exact and reproducible.
 *  5. Honesty gates: a premise with zero committed evidence is `unmeasured`
 *     and is NEVER coupled numerically (a prior is not a frequency). Belief
 *     is a confidence-weighted stress input, never an actuarial frequency —
 *     every output carries that basis label.
 *  6. Correlated-evidence clustering: observations sharing one typed source
 *     (sourceType:sourceId) are one incident told several times, not several
 *     incidents. We report clusters and the largest cluster's share of
 *     discounted weight; above 50% the belief is flagged pseudo-replicated.
 *     The posterior itself is NOT silently rewritten — the leader sees the
 *     concentration and decides (forecast-aggregation research: summing
 *     log-odds over correlated signals double-counts shared information).
 *
 * Pure module: no DOM, storage, network, or wall-clock globals.
 */
import { dayKey } from '../time.js';
import { buildCapacityModel } from './capacity.js';
import { buildPremiseReport, buildPremiseScope } from './premises.js';
import {
  createSeededRng, hashSeed, quantileSorted, sampleBetaPert,
  DEFAULT_SIMULATION_SEED, DEFAULT_SIMULATION_TRIALS,
} from './simulation.js';

export const PREMISE_TAILS_ENGINE_VERSION = 'premise-tails-2026.10-v1';
export const PREMISE_TAIL_SHOCK = Object.freeze({ 'load-bearing': 0.6, major: 0.4, monitor: 0.25 });
export const PREMISE_TAIL_MAX_MULTIPLIER = 3;
export const PREMISE_TAIL_DOMINANCE_SHARE = 0.5;
export const PREMISE_TAIL_WIDENING_PCT = 15;

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const r4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;
const clampInt = (v, lo, hi, fb) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fb; };

/** Cluster one premise's evaluated evidence rows by typed source identity. */
export function clusterPremiseEvidence(evidenceRows = []) {
  const groups = new Map();
  for (const row of evidenceRows || []) {
    if (!row) continue;
    const key = `${row.sourceType || 'manual'}:${row.sourceId || row.id || 'unknown'}`;
    if (!groups.has(key)) groups.set(key, { key, sourceType: row.sourceType || 'manual', rows: [], weightBits: 0 });
    const g = groups.get(key);
    g.rows.push(row);
    g.weightBits += Math.abs(Number(row.bits) || 0);
  }
  const clusters = [...groups.values()].map((g) => ({
    key: g.key, sourceType: g.sourceType, count: g.rows.length,
    weightBits: r4(g.weightBits),
    sensors: [...new Set(g.rows.map((r) => r.sensorId || 'manual'))],
  })).sort((a, b) => b.weightBits - a.weightBits || a.key.localeCompare(b.key));
  const totalWeight = clusters.reduce((s, c) => s + c.weightBits, 0);
  const largest = clusters[0] || null;
  const largestShare = largest && totalWeight > 0 ? r4(largest.weightBits / totalWeight) : 0;
  return {
    clusterCount: clusters.length,
    observationCount: (evidenceRows || []).length,
    clusters,
    largestShare,
    pseudoReplicated: Boolean(largest && clusters.length >= 1 && (evidenceRows || []).length >= 2 && largestShare > PREMISE_TAIL_DOMINANCE_SHARE),
    effectiveIndependentSources: clusters.length,
  };
}

/** Premise -> coupled committed portfolio item ids + failure model. Pure. */
export function buildPremiseTailModel(state = {}, now = new Date()) {
  const report = buildPremiseReport(state, now);
  const model = buildCapacityModel(state, { now });
  const committedIds = new Set((model.demand?.committed || []).filter((i) => i.effort?.measured).map((i) => i.id));
  const couplings = [];
  const unmeasured = [];
  for (const p of report.premises) {
    if (p.evaluation.status === 'retired') continue;
    const scope = buildPremiseScope(state, p);
    const itemIds = scope.filter((r) => r.type === 'portfolio' && committedIds.has(r.id)).map((r) => r.id);
    const clustering = clusterPremiseEvidence(p.evaluation.evidenceRows || []);
    const base = {
      premiseId: p.id, title: p.title, criticality: p.criticality || 'major',
      status: p.evaluation.status, posteriorPct: p.evaluation.posteriorPct,
      failureProbability: r4(1 - p.evaluation.posteriorPct / 100),
      evidenceCount: p.evaluation.evidenceCount, confidence: p.evaluation.confidence,
      shock: PREMISE_TAIL_SHOCK[p.criticality] ?? PREMISE_TAIL_SHOCK.major,
      itemIds, clustering,
    };
    if (!p.evaluation.evidenceCount) { unmeasured.push({ ...base, reason: 'unmeasured: no committed evidence — prior is not a frequency, never coupled' }); continue; }
    if (!itemIds.length) { unmeasured.push({ ...base, reason: 'no typed link to measured committed portfolio work' }); continue; }
    couplings.push(base);
  }
  return {
    engineVersion: PREMISE_TAILS_ENGINE_VERSION,
    today: dayKey(now),
    basis: 'belief-weighted stress test — posterior belief is a confidence signal, NOT an actuarial failure frequency',
    shockTable: { ...PREMISE_TAIL_SHOCK },
    couplings, unmeasured,
    allocatableDays: model.supply?.allocatableDays ?? 0,
    hasTeam: Boolean(model.hasTeam),
  };
}

function runPaired(items, couplings, { seed, trials, holdTrueId = null }) {
  const rng = createSeededRng(seed);
  const itemIdx = new Map(items.map((it, i) => [it.id, i]));
  const active = couplings.filter((c) => c.premiseId !== holdTrueId);
  // Precompute per-item premise list
  const itemPremises = items.map((it) => active.filter((c) => c.itemIds.includes(it.id)));
  const base = new Float64Array(trials);
  const coupled = new Float64Array(trials);
  let coupledOverload = 0; let baseOverload = 0;
  // allocatable filled by caller via closure variable below
  return { base, coupled, coupledOverload, baseOverload, itemPremises, rngState: null,
    run(allocatableDays) {
      for (let k = 0; k < trials; k++) {
        // premise failure draws first (fixed order => CRN pairing stable)
        const failed = active.map((c) => rng() < c.failureProbability);
        let b = 0; let cp = 0;
        for (let i = 0; i < items.length; i++) {
          const e = items[i].effort;
          const draw = sampleBetaPert(rng, { optimistic: e.optimistic, mostLikely: e.mostLikely, pessimistic: e.pessimistic });
          b += draw;
          let mult = 1;
          const ps = itemPremises[i];
          for (let j = 0; j < ps.length; j++) {
            const ci = active.indexOf(ps[j]);
            if (failed[ci]) mult *= (1 + ps[j].shock);
          }
          cp += draw * Math.min(PREMISE_TAIL_MAX_MULTIPLIER, mult);
        }
        base[k] = b; coupled[k] = cp;
        if (allocatableDays > 0) {
          if (b > allocatableDays) baseOverload++;
          if (cp > allocatableDays) coupledOverload++;
        }
      }
      return { base, coupled, baseOverload, coupledOverload };
    } };
}

function quantiles(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return { p50: r2(quantileSorted(sorted, 0.5)), p80: r2(quantileSorted(sorted, 0.8)), p90: r2(quantileSorted(sorted, 0.9)) };
}

/** Paired baseline vs premise-coupled Monte Carlo with leave-one-out attribution. */
export function simulatePremiseTails(state = {}, { seed, trials, now = new Date() } = {}) {
  const tailModel = buildPremiseTailModel(state, now);
  const model = buildCapacityModel(state, { now });
  const items = (model.demand?.committed || []).filter((i) => i.effort?.measured);
  const resolvedSeed = hashSeed(seed ?? state?.settings?.simulationSeed ?? DEFAULT_SIMULATION_SEED);
  const resolvedTrials = clampInt(trials ?? state?.settings?.simulationTrials, 200, 5000, DEFAULT_SIMULATION_TRIALS);
  if (!model.hasTeam || !items.length) {
    return { available: false, engineVersion: PREMISE_TAILS_ENGINE_VERSION, basis: tailModel.basis,
      reason: !model.hasTeam ? 'Add active team members to simulate.' : 'Record a 3-point effort estimate on committed work first.',
      tailModel, seed: resolvedSeed, trials: resolvedTrials };
  }
  const alloc = model.supply.allocatableDays || 0;
  const main = runPaired(items, tailModel.couplings, { seed: resolvedSeed, trials: resolvedTrials });
  const out = main.run(alloc);
  const baseQ = quantiles(out.base); const coupledQ = quantiles(out.coupled);
  // Leave-one-out attribution (same seed => paired)
  const contributions = tailModel.couplings.map((c) => {
    const loo = runPaired(items, tailModel.couplings, { seed: resolvedSeed, trials: resolvedTrials, holdTrueId: c.premiseId });
    const looOut = loo.run(alloc);
    const looQ = quantiles(looOut.coupled);
    return { premiseId: c.premiseId, title: c.title, status: c.status, posteriorPct: c.posteriorPct,
      failureProbability: c.failureProbability, shock: c.shock, itemCount: c.itemIds.length,
      tailContributionDays: r2(coupledQ.p90 - looQ.p90), p90Without: looQ.p90,
      pseudoReplicated: c.clustering.pseudoReplicated, largestSourceShare: c.clustering.largestShare };
  }).sort((a, b) => b.tailContributionDays - a.tailContributionDays || String(a.premiseId).localeCompare(String(b.premiseId)));
  const wideningPct = baseQ.p90 > 0 ? r2(((coupledQ.p90 - baseQ.p90) / baseQ.p90) * 100) : 0;
  return {
    available: true, engineVersion: PREMISE_TAILS_ENGINE_VERSION, basis: tailModel.basis,
    seed: resolvedSeed, trials: resolvedTrials, today: tailModel.today,
    allocatableDays: alloc, itemCount: items.length,
    baseline: { ...baseQ, overloadProbability: r4(out.baseOverload / resolvedTrials) },
    coupled: { ...coupledQ, overloadProbability: r4(out.coupledOverload / resolvedTrials) },
    delta: { p50Days: r2(coupledQ.p50 - baseQ.p50), p80Days: r2(coupledQ.p80 - baseQ.p80),
      p90Days: r2(coupledQ.p90 - baseQ.p90), wideningPct,
      overloadDelta: r4(out.coupledOverload / resolvedTrials - out.baseOverload / resolvedTrials) },
    contributions, couplings: tailModel.couplings, unmeasured: tailModel.unmeasured,
    dominantPremiseId: contributions[0]?.tailContributionDays > 0 ? contributions[0].premiseId : null,
  };
}

export function premiseTailSignals(state = {}, now = new Date()) {
  let sim;
  try { sim = simulatePremiseTails(state, { now }); } catch { return []; }
  if (!sim?.available) return [];
  const signals = [];
  if (sim.delta.wideningPct >= PREMISE_TAIL_WIDENING_PCT && sim.delta.p90Days > 0) {
    signals.push({ ruleId: 'TAIL-01', domain: 'Assumption-aware tails',
      title: `Fragile assumptions widen the delivery P90 by ${sim.delta.wideningPct}% (+${sim.delta.p90Days} days)`,
      detail: 'Paired seeded simulation (Common Random Numbers): the same effort draws with and without premise failure. Belief-weighted stress, not an actuarial forecast — a prior is never treated as a frequency and unmeasured premises are excluded.',
      severity: sim.delta.wideningPct >= 30 ? 4 : 3, confidence: 'medium',
      evidence: sim.contributions.slice(0, 3).map((c) => `${c.title}: belief ${c.posteriorPct}%, removing its failure recovers ${c.tailContributionDays} P90 days`),
      action: { label: 'Open assumption-aware tails', route: '#/premises?tab=tails' } });
  }
  const dom = sim.contributions[0];
  if (dom && sim.delta.p90Days > 0 && dom.tailContributionDays / sim.delta.p90Days > PREMISE_TAIL_DOMINANCE_SHARE) {
    signals.push({ ruleId: 'TAIL-02', domain: 'Assumption-aware tails',
      title: `One assumption drives most of the tail: “${dom.title}”`,
      detail: 'Leave-one-out attribution: forcing this single premise true recovers the majority of the P90 widening. Hedge, buy information, or de-scope its coupled work before adding capacity.',
      severity: 3, confidence: 'medium',
      evidence: [`${dom.title}: ${dom.tailContributionDays} of ${sim.delta.p90Days} added P90 days; coupled items ${dom.itemCount}`],
      action: { label: 'Inspect the dominant assumption', route: '#/premises?tab=tails' } });
  }
  const pseudo = sim.couplings.filter((c) => c.clustering.pseudoReplicated);
  if (pseudo.length) {
    signals.push({ ruleId: 'TAIL-03', domain: 'Assumption-aware tails',
      title: `${pseudo.length} premise belief(s) rest on one source told several times`,
      detail: 'Correlated-evidence clustering: observations sharing one typed source are one incident, not independent corroboration. Summing log-odds over them double-counts shared information; seek a genuinely independent source before trusting the posterior.',
      severity: 3, confidence: 'high',
      evidence: pseudo.slice(0, 4).map((c) => `${c.title}: largest source carries ${Math.round(c.clustering.largestShare * 100)}% of discounted weight across ${c.clustering.clusterCount} source(s)`),
      action: { label: 'Check evidence concentration', route: '#/premises?tab=tails' } });
  }
  return signals;
}

export function premiseTailBrief(state = {}, now = new Date()) {
  const sim = simulatePremiseTails(state, { now });
  const lines = [`# Assumption-aware scenario tails — ${sim.today || dayKey(now)}`, '', `Basis: ${sim.basis}.`, ''];
  if (!sim.available) { lines.push(sim.reason); return lines.join('\n'); }
  lines.push(`Paired simulation (${sim.trials} trials, seed ${sim.seed}, ${sim.itemCount} measured committed items, ${sim.allocatableDays} allocatable days):`);
  lines.push(`- Baseline P50/P80/P90: ${sim.baseline.p50} / ${sim.baseline.p80} / ${sim.baseline.p90} days; overload ${(sim.baseline.overloadProbability * 100).toFixed(1)}%.`);
  lines.push(`- Premise-coupled P50/P80/P90: ${sim.coupled.p50} / ${sim.coupled.p80} / ${sim.coupled.p90} days; overload ${(sim.coupled.overloadProbability * 100).toFixed(1)}%.`);
  lines.push(`- Tail widening: P90 +${sim.delta.p90Days} days (${sim.delta.wideningPct}%).`);
  for (const c of sim.contributions) lines.push(`- ${c.title}: belief ${c.posteriorPct}%, failure stress recovers ${c.tailContributionDays} P90 days if held true (${c.itemCount} coupled item(s))${c.pseudoReplicated ? ' — PSEUDO-REPLICATED evidence' : ''}.`);
  if (sim.unmeasured.length) lines.push(`- Excluded as unmeasured/uncoupled: ${sim.unmeasured.map((u) => u.title).join('; ')}.`);
  lines.push('', 'Caveats: shock multipliers (+60% load-bearing, +40% major, +25% monitor effort on failure, capped x3/item) are transparent conventions, not calibrated loss data. Posterior belief weights a stress test; it is not a failure frequency.');
  return lines.join('\n');
}
