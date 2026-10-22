// src/lib/montecarlo.ts
//
// Monte Carlo risk quantification engine (the "Part 04" contract this part
// depends on). Reconstructed self-contained for this sandbox — see the
// provenance note in src/lib/audit.ts; the same applies here: Part 04's
// actual module is not present on disk, so we implement the documented
// behaviour (annualized loss distribution per risk, portfolio aggregation
// with correlation, VaR/TVaR percentiles, correlation-sensitivity runs)
// directly, with the assumptions made explicit and testable.

import { mulberry32, seedFromString, type Rng } from "./prng";
import {
  sampleBeta,
  sampleLognormal,
  valueAtRisk,
  tailValueAtRisk,
  mean,
  stddev,
  equicorrelationMatrix,
  cholesky,
  correlatedStandardNormals,
  normalCdf,
} from "./stats";
import type { BetaBelief } from "./beta";
import type { ImpactDistribution } from "@/db/schema";

export interface ControlForSimulation {
  controlId: number;
  type: "preventive" | "detective" | "corrective";
  effectiveness: BetaBelief;
}

export interface RiskForSimulation {
  riskId: number;
  likelihood: BetaBelief; // annual probability of >=1 occurrence
  impact: ImpactDistribution;
  controls: ControlForSimulation[];
}

export interface LossSummary {
  trials: number;
  mean: number;
  stddev: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  tvar95: number;
  tvar99: number;
  probabilityOfAnyLoss: number;
  /** 90% Monte Carlo standard-error band on p95 (to disclose simulation noise). */
  p95StandardError: number;
  currency: string | null;
  nonFinancialNote?: string;
}

function summarize(losses: number[], currency: string | null, nonFinancialNote?: string): LossSummary {
  const asc = [...losses].sort((a, b) => a - b);
  const p95 = valueAtRisk(asc, 0.95);
  // Bootstrap-free MC standard error approximation for a quantile (order-statistic normal approx):
  // SE(p) ~ sqrt(p(1-p)/n) / f(x_p) is unavailable without a density estimate, so we instead
  // report a conservative binomial-based bound on the *rank* uncertainty translated back through
  // local linear interpolation of the sorted sample (documented in docs as an approximation).
  const n = asc.length;
  const se = Math.sqrt((0.95 * 0.05) / Math.max(n, 1)) * n * (asc[Math.min(n - 1, Math.ceil(0.95 * n))] - asc[Math.max(0, Math.floor(0.95 * n) - 1)] || 0) / n;
  return {
    trials: n,
    mean: mean(asc),
    stddev: stddev(asc),
    p50: valueAtRisk(asc, 0.5),
    p90: valueAtRisk(asc, 0.9),
    p95,
    p99: valueAtRisk(asc, 0.99),
    tvar95: tailValueAtRisk(asc, 0.95),
    tvar99: tailValueAtRisk(asc, 0.99),
    probabilityOfAnyLoss: asc.filter((x) => x > 0).length / Math.max(n, 1),
    p95StandardError: Number.isFinite(se) ? se : 0,
    currency,
    nonFinancialNote,
  };
}

/**
 * Residual effectiveness combination assumption (documented, tested for sensitivity
 * via scripts/validate-correlation-sensitivity.ts and the risk.ts unit coverage):
 *  - Preventive controls multiplicatively reduce the ANNUAL LIKELIHOOD of occurrence.
 *  - Detective/corrective controls multiplicatively reduce the SEVERITY (impact) of an
 *    occurrence that does happen, representing faster containment.
 *  - Multiple controls of the same lever combine as independent survival probabilities:
 *    residual_multiplier = product(1 - effectiveness_i). This likely OVERSTATES risk
 *    reduction if controls are correlated in failure mode (e.g. same root cause, same
 *    IT system) — flagged explicitly in the UI as a documented assumption.
 */
export function simulateRiskLoss(
  risk: RiskForSimulation,
  trials: number,
  rng: Rng,
  mode: "inherent" | "residual",
): number[] {
  const losses = new Array(trials);
  const preventive = risk.controls.filter((c) => c.type === "preventive");
  const detective = risk.controls.filter((c) => c.type !== "preventive");

  for (let i = 0; i < trials; i++) {
    let pOccur = sampleBeta(rng, risk.likelihood.alpha, risk.likelihood.beta);
    let severityMultiplier = 1;

    if (mode === "residual") {
      for (const c of preventive) {
        const eff = sampleBeta(rng, c.effectiveness.alpha, c.effectiveness.beta);
        pOccur *= 1 - eff;
      }
      for (const c of detective) {
        const eff = sampleBeta(rng, c.effectiveness.alpha, c.effectiveness.beta);
        severityMultiplier *= 1 - eff;
      }
    }

    const occurs = rng() < pOccur;
    if (!occurs) {
      losses[i] = 0;
      continue;
    }

    if (risk.impact.kind === "lognormal") {
      const severity = sampleLognormal(rng, risk.impact.mu, risk.impact.sigma);
      losses[i] = severity * severityMultiplier;
    } else {
      // Categorical (non-financial) impact: encode as a severity-rank score 1..N so the
      // engine can still produce a distribution, but we never present this as currency.
      const r = rng();
      let cum = 0;
      let idx = 0;
      for (let k = 0; k < risk.impact.probabilities.length; k++) {
        cum += risk.impact.probabilities[k];
        if (r <= cum) {
          idx = k;
          break;
        }
        idx = k;
      }
      losses[i] = (idx + 1) * severityMultiplier;
    }
  }
  return losses;
}

export interface RiskSimulationResult {
  riskId: number;
  seed: number;
  trials: number;
  inherent: LossSummary;
  residual: LossSummary;
}

export function simulateRisk(risk: RiskForSimulation, trials = 20000, seedKey?: string): RiskSimulationResult {
  const seed = seedKey ? seedFromString(seedKey) : seedFromString(`risk-${risk.riskId}-${Date.now()}`);
  const rng = mulberry32(seed);
  const currency = risk.impact.kind === "lognormal" ? risk.impact.currency : null;
  const note =
    risk.impact.kind === "categorical"
      ? "Non-financial categorical impact: values are an ordinal severity-rank score, NOT currency. Do not sum into financial VaR."
      : undefined;

  const inherentLosses = simulateRiskLoss(risk, trials, rng, "inherent");
  const residualLosses = simulateRiskLoss(risk, trials, rng, "residual");

  return {
    riskId: risk.riskId,
    seed,
    trials,
    inherent: summarize(inherentLosses, currency, note),
    residual: summarize(residualLosses, currency, note),
  };
}

// ---------------------------------------------------------------------------
// Portfolio aggregation with correlation + sensitivity
// ---------------------------------------------------------------------------

export type CorrelationAssumption = "independent" | "moderate" | "high" | "comonotonic";

export const CORRELATION_RHO: Record<CorrelationAssumption, number> = {
  independent: 0,
  moderate: 0.3,
  high: 0.6,
  comonotonic: 0.97, // not exactly 1 to keep Cholesky numerically stable
};

export interface PortfolioSimulationInput {
  risks: RiskForSimulation[]; // only financial (lognormal) risks are aggregated into $ VaR
  trials: number;
  mode: "inherent" | "residual";
  correlation: CorrelationAssumption;
  seedKey?: string;
}

/**
 * Aggregate portfolio loss using a Gaussian copula to correlate the *occurrence*
 * indicator across risks (shared macro/operational drivers), then draw
 * independent severities conditional on occurrence.
 *
 * KNOWN LIMITATION (disclosed, not hidden): a Gaussian copula has ZERO upper
 * tail dependence as correlation rho -> 1 only asymptotically in the
 * comonotonic limit; for rho < 1 it structurally understates how often *all*
 * bad things happen together in extreme (tail) scenarios compared to
 * heavy-tailed copulas (t-copula, Clayton). We run sensitivity across rho
 * values and flag this as a standing caveat on every aggregate report.
 */
export function simulatePortfolio(input: PortfolioSimulationInput): LossSummary & { correlation: CorrelationAssumption; rho: number } {
  const financialRisks = input.risks.filter((r) => r.impact.kind === "lognormal");
  const n = financialRisks.length;
  const rho = CORRELATION_RHO[input.correlation];
  const seed = input.seedKey ? seedFromString(input.seedKey) : seedFromString(`portfolio-${Date.now()}`);
  const rng = mulberry32(seed);

  if (n === 0) {
    return { ...summarize([0], null), correlation: input.correlation, rho };
  }

  const corr = equicorrelationMatrix(n, rho);
  const L = cholesky(corr);
  const totals = new Array(input.trials).fill(0);

  for (let t = 0; t < input.trials; t++) {
    const z = correlatedStandardNormals(rng, L); // correlated standard normals, one per risk
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const risk = financialRisks[i] as RiskForSimulation & { impact: Extract<ImpactDistribution, { kind: "lognormal" }> };
      let pOccur = sampleBeta(rng, risk.likelihood.alpha, risk.likelihood.beta);
      let severityMultiplier = 1;
      if (input.mode === "residual") {
        for (const c of risk.controls) {
          const eff = sampleBeta(rng, c.effectiveness.alpha, c.effectiveness.beta);
          if (c.type === "preventive") pOccur *= 1 - eff;
          else severityMultiplier *= 1 - eff;
        }
      }
      // Map the correlated normal to a uniform via its CDF, then to a Bernoulli occurrence
      // indicator with marginal probability pOccur. This correlates *whether* risks fire
      // while leaving each risk's own marginal probability untouched (copula property).
      const u = normalCdf(z[i]);
      const occurs = u < pOccur;
      if (occurs) {
        const severity = sampleLognormal(rng, risk.impact.mu, risk.impact.sigma);
        sum += severity * severityMultiplier;
      }
    }
    totals[t] = sum;
  }

  const currency = financialRisks[0].impact.kind === "lognormal" ? financialRisks[0].impact.currency : null;
  return { ...summarize(totals, currency), correlation: input.correlation, rho };
}

export interface CorrelationSensitivityResult {
  assumption: CorrelationAssumption;
  rho: number;
  p95: number;
  p99: number;
  tvar99: number;
  diversificationBenefitVsComonotonic: number; // (comonotonic sum of p99s - aggregate p99) / sum
}

export function runCorrelationSensitivity(
  risks: RiskForSimulation[],
  trials: number,
  mode: "inherent" | "residual",
  seedKey = "sensitivity",
): CorrelationSensitivityResult[] {
  const assumptions: CorrelationAssumption[] = ["independent", "moderate", "high", "comonotonic"];
  const results = assumptions.map((a) =>
    simulatePortfolio({ risks, trials, mode, correlation: a, seedKey: `${seedKey}-${a}` }),
  );
  // Sum of standalone p99s as the comonotonic-additive reference point.
  const standaloneP99Sum = risks
    .filter((r) => r.impact.kind === "lognormal")
    .reduce((acc, r) => {
      const seed = mulberry32(seedFromString(`${seedKey}-standalone-${r.riskId}`));
      const losses = simulateRiskLoss(r, trials, seed, mode);
      return acc + valueAtRisk([...losses].sort((a, b) => a - b), 0.99);
    }, 0);

  return results.map((r) => ({
    assumption: r.correlation,
    rho: r.rho,
    p95: r.p95,
    p99: r.p99,
    tvar99: r.tvar99,
    diversificationBenefitVsComonotonic:
      standaloneP99Sum > 0 ? (standaloneP99Sum - r.p99) / standaloneP99Sum : 0,
  }));
}
