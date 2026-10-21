/**
 * modelCards.ts — the model card registry.
 *
 * Every Explain<T>.modelCardId must resolve to an entry here. Model cards
 * are the honesty backstop: what data feeds the model, what method it uses,
 * what it assumes, when it was last validated against outcomes, and how it
 * is known to fail. Surfaced via /model-cards and linked from every
 * InsightCard.
 */

export interface ModelCard {
  id: string;
  name: string;
  beliefType: "RateBelief" | "LevelBelief" | "DriftBelief" | "DecisionEngine" | "MonteCarlo";
  whatData: string;
  method: string;
  assumptions: string[];
  lastValidated: string; // ISO date
  calibration: {
    brierScore?: number;
    ece?: number;
    coverage80?: number;
    sampleSize: number;
    source: string;
  };
  knownFailureModes: string[];
}

export const MODEL_CARDS: ModelCard[] = [
  {
    id: "completion-rate-v1",
    name: "Task Completion Rate",
    beliefType: "RateBelief",
    whatData: "Resolved task outcomes (success/failure) logged per cycle from the `observations` table, kind='rate', metric='task_completion_rate'.",
    method: "Beta(alpha, beta) conjugate posterior. alpha' = alpha + successes, beta' = beta + failures. Prior Beta(1,1) (uninformative/uniform).",
    assumptions: [
      "Outcomes are exchangeable (order and timing don't matter beyond count).",
      "No sub-population effects modeled (e.g. by team or task type) in v1.",
      "Beta/Bernoulli is appropriate only because the quantity is strictly bounded in [0,1]; do not reuse for unbounded durations or costs.",
    ],
    lastValidated: "2026-01-12",
    calibration: { brierScore: 0.071, ece: 0.021, coverage80: 0.79, sampleSize: 400, source: "eval:intelligence synthetic binary scenario set" },
    knownFailureModes: [
      "Underreacts to sudden regime changes (e.g. a process change) because older successes/failures keep weight indefinitely — no decay term.",
      "If completion is actually bimodal (two very different sub-processes mixed together), the single Beta will report a misleading middle mean.",
    ],
  },
  {
    id: "cycle-time-v1",
    name: "Cycle Time (days)",
    beliefType: "LevelBelief",
    whatData: "Cycle-time measurements per completed unit, kind='level', metric='cycle_time_days'.",
    method: "Normal-Inverse-Gamma conjugate posterior over unknown mean and unknown variance. Interval uses a Student-t-corrected normal approximation on the posterior mean.",
    assumptions: [
      "Cycle time is approximately symmetric/unimodal after any obvious transform (no log-transform applied in v1, so a long right tail will bias the mean upward and widen intervals rather than being corrected).",
      "Observations within a single batch update are treated as i.i.d.",
    ],
    lastValidated: "2026-01-12",
    calibration: { brierScore: undefined, ece: undefined, coverage80: 0.81, sampleSize: 300, source: "eval:intelligence synthetic continuous scenario set (interval coverage check)" },
    knownFailureModes: [
      "Heavy-tailed cycle times (occasional huge outlier jobs) inflate the variance estimate and produce overly wide intervals for the typical case — a known LevelBelief/Normal misuse risk, see Phase 5.",
      "Small-n intervals rely on a t-style inflation heuristic, not an exact Student-t quantile; slightly under-covers below n~10.",
    ],
  },
  {
    id: "engagement-drift-v1",
    name: "Weekly Engagement Drift",
    beliefType: "DriftBelief",
    whatData: "Weekly aggregate engagement score, kind='drift', metric='weekly_engagement_score'.",
    method: "EWMA(lambda=0.3) with 3-sigma control limits: z_t = lambda*x_t + (1-lambda)*z_(t-1); limits = mean0 +/- 3*sigma*sqrt(lambda/(2-lambda)).",
    assumptions: [
      "lambda=0.3 is a fixed smoothing constant chosen for ~3-4 period responsiveness; not re-tuned per metric automatically.",
      "sigma is itself an EWMA of squared residuals, so volatility estimates lag true volatility shifts by design.",
    ],
    lastValidated: "2026-01-12",
    calibration: { ece: 0.034, sampleSize: 250, source: "eval:intelligence synthetic drift-detection scenario set" },
    knownFailureModes: [
      "Slow to flag drift immediately after initialization (tSinceInit small) because sigma hasn't converged yet.",
      "A single extreme outlier can trip the control limit even if the underlying process hasn't actually shifted (false positive), since there's no robust/Winsorized variant in v1.",
    ],
  },
  {
    id: "decision-engine-v1",
    name: "Decision EV / Regret / VOI",
    beliefType: "DecisionEngine",
    whatData: "Seeded pending-decision fixtures: enumerated actions, discrete outcome states with probabilities (sourced from the relevant RateBelief/LevelBelief where available), and declared utilities per (action, state).",
    method: "EV(a) = Sum_s P(s) * U(a,s). Regret(a) = max_a' EV(a') - EV(a). VOI = E_info[max_a EV(a|info)] - max_a EV(a), computed by exact enumeration over a declared finite information partition.",
    assumptions: [
      "Utilities are elicited/declared by the decision owner, not statistically estimated — they carry no uncertainty interval themselves.",
      "State probabilities inherit the confidence class of their source belief; when a state's probability is itself 'assumed', the resulting EV/VOI is marked 'inferred' at best.",
      "VOI is computed over a specific, finite information partition declared per decision (not the fully general infinite-outcome VOI).",
    ],
    lastValidated: "2026-01-12",
    calibration: { sampleSize: 3, source: "property tests: VOI >= 0 and regret >= 0 on seeded decisions" },
    knownFailureModes: [
      "If the declared utilities are wrong, EV/regret/VOI will be confidently wrong in the same direction — the engine cannot detect a bad utility function.",
      "VOI can be understated if the declared information partition omits a signal that would actually be informative.",
    ],
  },
  {
    id: "monte-carlo-core-v1",
    name: "Monte Carlo Simulation Core",
    beliefType: "MonteCarlo",
    whatData: "User-declared scenario parameters (distribution family + parameters per input variable) — no historical data required to run, but calibration against real outcomes is TODO (see Phase 5, 'what we deliberately did not do').",
    method: "Seeded PRNG (mulberry32-derived), antithetic variates (pair u with 1-u) and a uniform control variate (known analytic mean 0.5) for variance reduction, executed across a worker pool; stops/report when relative MC standard error < 2% at the declared N.",
    assumptions: [
      "Antithetic variates reduce variance only when the payoff function is monotonic in the underlying uniforms; for non-monotonic payoffs the variance-reduction benefit shrinks toward zero (but correctness is unaffected).",
      "Control variate coefficient is fixed at c=1 for simplicity rather than estimated as the covariance-optimal c*; documented as a known simplification.",
    ],
    lastValidated: "2026-01-12",
    calibration: { sampleSize: 0, source: "Convergence verified analytically (known closed-form test integrals), not yet against production scenarios." },
    knownFailureModes: [
      "For extremely heavy-tailed scenario distributions, 2% relative-error convergence at modest N is optimistic — the engine will under-report the required N.",
      "Worker-pool parallel streams are seeded by sub-stream index; while this guarantees reproducibility, it has NOT been proven statistically independent (no formal stream-independence test performed), a documented simplification.",
    ],
  },
];

export function getModelCard(id: string): ModelCard | undefined {
  return MODEL_CARDS.find((c) => c.id === id);
}
