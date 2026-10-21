/**
 * scripts/property-tests.ts — `npm run test:properties`
 *
 * Hand-rolled property tests (no external framework) exercising invariants
 * that MUST hold for the belief/decision/Monte-Carlo layer to be trustworthy:
 *
 *   1. Posterior updates obey conjugacy identities (Beta, NIG).
 *   2. Credible intervals narrow as consistent evidence accumulates.
 *   3. VOI >= 0 always (Blackwell's theorem), on seeded + randomized decisions.
 *   4. Regret is always >= 0.
 *   5. Identical seeds -> identical results (PRNG, mcCore.cjs vs prng.ts, and
 *      the Monte Carlo worker pool's inline strategy run twice).
 *
 * Exits non-zero (with a printed failure list) if any property is violated.
 */
import { Rng } from "../src/lib/prng";
import { RateBelief, LevelBelief } from "../src/lib/intelligence/beliefs";
import {
  PendingDecision,
  InformationSource,
  analyzeDecision,
  regret,
  valueOfInformation,
} from "../src/lib/intelligence/decisionEngine";
import { SEEDED_DECISIONS } from "../src/lib/intelligence/decisions";
import { runMonteCarloScenario } from "../src/lib/intelligence/montecarlo";
import { McScenarioSpec } from "../src/lib/intelligence/workerPool";

const mcCore = require("../src/lib/intelligence/mcCore.cjs") as {
  makeMulberry32: (seed: string) => () => number;
};

async function main(): Promise<number> {
  let failures = 0;
  let passed = 0;

  function check(name: string, condition: boolean, detail?: string) {
    if (condition) {
      passed++;
      console.log(`  PASS  ${name}`);
    } else {
      failures++;
      console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
    }
  }

  function approxEqual(a: number, b: number, eps = 1e-9): boolean {
    return Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));
  }

  // ---------------------------------------------------------------------------
  console.log("\n=== 1. Conjugacy identities ===");

  {
    const prior = RateBelief.prior(2, 3);
    const successes = 7;
    const failuresN = 4;
    const posterior = prior.update(successes, failuresN);
    check("RateBelief: alpha' = alpha + successes", approxEqual(posterior.alpha, 2 + successes));
    check("RateBelief: beta' = beta + failures", approxEqual(posterior.beta, 3 + failuresN));
    check("RateBelief: mean = alpha/(alpha+beta)", approxEqual(posterior.mean, posterior.alpha / (posterior.alpha + posterior.beta)));
  }

  {
    const rng = new Rng("conjugacy-nig");
    const mu0 = 5;
    const kappa0 = 2;
    const alpha0 = 3;
    const beta0 = 4;
    const samples = Array.from({ length: 30 }, () => rng.normal(10, 2));
    const n = samples.length;
    const xbar = samples.reduce((a, b) => a + b, 0) / n;
    const sumSq = samples.reduce((a, x) => a + (x - xbar) ** 2, 0);
    const expectedKappaN = kappa0 + n;
    const expectedMuN = (kappa0 * mu0 + n * xbar) / expectedKappaN;
    const expectedAlphaN = alpha0 + n / 2;
    const expectedBetaN = beta0 + 0.5 * sumSq + (kappa0 * n * (xbar - mu0) ** 2) / (2 * expectedKappaN);

    const posterior = LevelBelief.prior(mu0, kappa0, alpha0, beta0).updateWithSamples(samples);
    check("LevelBelief: kappaN = kappa0 + n", approxEqual(posterior.kappa0, expectedKappaN));
    check("LevelBelief: muN matches weighted-average formula", approxEqual(posterior.mu0, expectedMuN));
    check("LevelBelief: alphaN = alpha0 + n/2", approxEqual(posterior.alpha0, expectedAlphaN));
    check("LevelBelief: betaN matches NIG formula", approxEqual(posterior.beta0, expectedBetaN, 1e-6));
  }

  // ---------------------------------------------------------------------------
  console.log("\n=== 2. Intervals narrow as consistent evidence accumulates ===");

  {
    const ratio = 0.7;
    const widths: number[] = [];
    for (const total of [10, 100, 1000, 10000]) {
      const successes = Math.round(total * ratio);
      const belief = RateBelief.prior(1, 1).update(successes, total - successes);
      const [lo, hi] = belief.interval(0.8);
      widths.push(hi - lo);
    }
    let monotonic = true;
    for (let i = 1; i < widths.length; i++) if (widths[i] >= widths[i - 1]) monotonic = false;
    check("RateBelief: 80% interval width strictly shrinks as n grows (fixed ratio)", monotonic, `widths=${widths.map((w) => w.toFixed(4)).join(",")}`);
  }

  {
    const rng = new Rng("interval-nesting-level");
    const trueMean = 12;
    const trueSd = 3;
    const widths: number[] = [];
    let belief = LevelBelief.prior(0, 1e-3, 1, 1);
    for (const batchSize of [5, 20, 100, 500]) {
      const samples = Array.from({ length: batchSize }, () => rng.normal(trueMean, trueSd));
      belief = LevelBelief.prior(0, 1e-3, 1, 1).updateWithSamples(
        Array.from({ length: belief.evidenceCount + batchSize }, () => rng.normal(trueMean, trueSd)),
      );
      const [lo, hi] = belief.interval(0.8);
      widths.push(hi - lo);
    }
    let shrinking = true;
    for (let i = 1; i < widths.length; i++) if (widths[i] >= widths[i - 1]) shrinking = false;
    check("LevelBelief: 80% mean interval shrinks as sample size grows", shrinking, `widths=${widths.map((w) => w.toFixed(4)).join(",")}`);
  }

  // ---------------------------------------------------------------------------
  console.log("\n=== 3. VOI >= 0 (Blackwell) and 4. Regret >= 0 ===");

  for (const decision of SEEDED_DECISIONS) {
    const analysis = analyzeDecision(decision);
    for (const v of analysis.voiBySource) {
      check(`VOI >= 0: ${decision.id} / ${v.sourceId}`, v.voi >= -1e-6, `voi=${v.voi}`);
    }
    for (const [actionId, r] of Object.entries(analysis.regret)) {
      check(`Regret >= 0: ${decision.id} / ${actionId}`, r >= -1e-9, `regret=${r}`);
    }
  }

  // Randomized decisions with consistent information partitions.
  {
    const rng = new Rng("voi-random-fuzz");
    for (let trial = 0; trial < 50; trial++) {
      const pResponds = rng.uniform(0.1, 0.9);
      const states = [
        { id: "s1", label: "state1", probability: pResponds },
        { id: "s2", label: "state2", probability: 1 - pResponds },
      ];
      const u = {
        a1: { s1: rng.uniform(-1000, 1000), s2: rng.uniform(-1000, 1000) },
        a2: { s1: rng.uniform(-1000, 1000), s2: rng.uniform(-1000, 1000) },
      };
      // Build one consistent signal split: p(signal1) = q, P(s1|signal1)=r1, solve P(s1|signal2) to keep marginal consistent.
      const q = rng.uniform(0.2, 0.8);
      const r1 = rng.uniform(0, 1);
      const r2 = (pResponds - q * r1) / (1 - q);
      if (r2 < 0 || r2 > 1) continue; // skip infeasible random draws
      const decision: PendingDecision = {
        id: `fuzz-${trial}`,
        title: "fuzz",
        description: "",
        actions: [
          { id: "a1", label: "a1" },
          { id: "a2", label: "a2" },
        ],
        states,
        utilities: u,
        informationSources: [],
        stateConfidenceClass: "assumed",
      };
      const source: InformationSource = {
        id: "src",
        label: "src",
        cost: 0,
        signals: [
          { id: "sig1", label: "sig1", probability: q, statePosteriors: { s1: r1, s2: 1 - r1 } },
          { id: "sig2", label: "sig2", probability: 1 - q, statePosteriors: { s1: r2, s2: 1 - r2 } },
        ],
      };
      const voi = valueOfInformation(decision, source);
      check(`VOI >= 0 (random fuzz #${trial})`, voi >= -1e-6, `voi=${voi}`);
      const reg = regret(decision);
      for (const [a, r] of Object.entries(reg)) {
        check(`Regret >= 0 (random fuzz #${trial} / ${a})`, r >= -1e-9, `regret=${r}`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  console.log("\n=== 5. Identical seeds -> identical results ===");

  {
    const seed = "determinism-check-1";
    const a = new Rng(seed);
    const b = new Rng(seed);
    let same = true;
    for (let i = 0; i < 1000; i++) if (a.next() !== b.next()) same = false;
    check("Rng: same seed -> identical stream (1000 draws)", same);
  }

  {
    const seed = "mccore-vs-prng-cross-check";
    const nextA = mcCore.makeMulberry32(seed);
    const b = new Rng(seed);
    let same = true;
    for (let i = 0; i < 1000; i++) if (nextA() !== b.next()) same = false;
    check("mcCore.cjs mulberry32 matches src/lib/prng.ts Rng bit-for-bit for same seed", same);
  }

  {
    const scenario: McScenarioSpec = {
      budget: 100000,
      variables: [
        { id: "x", mean: 50000, sd: 10000, weight: 1 },
        { id: "y", mean: 40000, sd: 8000, weight: 1 },
      ],
    };
    const seed = "mc-determinism-check";
    const [r1, r2] = await Promise.all([
      runMonteCarloScenario({ seed, scenario, totalPairs: 5000, strategy: "inline" }),
      runMonteCarloScenario({ seed, scenario, totalPairs: 5000, strategy: "inline" }),
    ]);
    check(
      "Monte Carlo (inline strategy): identical seed -> identical probExceed mean",
      approxEqual(r1.probExceed.mean, r2.probExceed.mean),
    );
    check(
      "Monte Carlo (inline strategy): identical seed -> identical expectedOverrun mean",
      approxEqual(r1.expectedOverrun.mean, r2.expectedOverrun.mean),
    );
  }

  // ---------------------------------------------------------------------------
  console.log(`\n=== RESULT: ${passed} passed, ${failures} failed ===`);
    return failures;
}

main()
  .then((failures) => process.exit(failures > 0 ? 1 : 0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
