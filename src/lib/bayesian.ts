// ════════════════════════════════════════════════════════════════════
// Bayesian belief update module. Pure functions. No DB calls.
// Priors and likelihood ratios are explicitly labeled with their source
// so every probability shown to a user can be traced to its origin.
// ════════════════════════════════════════════════════════════════════

export interface BeliefUpdate {
  hypothesis: string;
  prior: number;
  posterior: number;
  posteriorPct: number;
  appliedEvidence: Array<{
    signal: string;
    likelihoodRatio: number;
    source: string;
    effect: "increases" | "decreases";
  }>;
  highRisk: boolean;
  label: string;
}

const PRIORS: Record<string, { prior: number; source: string }> = {
  attrition_60d: {
    prior: 0.15,
    source: "Base rate: SHRM (2022) voluntary turnover, tech sector",
  },
  revenue_miss_quarter: {
    prior: 0.35,
    source: "Base rate: Bessemer Venture Partners SaaS benchmark (2023)",
  },
  okr_on_track: {
    prior: 0.45,
    source: "Base rate: Lattice OKR Benchmark Report (2023)",
  },
  crisis_next_30d: {
    prior: 0.12,
    source: "Heuristic prior — labeled, not empirically validated",
  },
};

const LIKELIHOOD_RATIOS: Record<string, Record<string, { lr: number; source: string }>> = {
  attrition_60d: {
    burnout_signal: { lr: 4.0, source: "Leiter & Maslach (2009)" },
    mood_declining: { lr: 3.0, source: "Haid et al. (2022)" },
    cadence_missed: { lr: 2.5, source: "Gallup (2023)" },
    no_growth_plan: { lr: 2.0, source: "Lattice (2023)" },
    recent_conflict: { lr: 1.8, source: "Heuristic — labeled" },
    comp_at_market: { lr: 0.6, source: "SHRM (2022)" },
    recent_promotion: { lr: 0.4, source: "General HR practice" },
  },
  revenue_miss_quarter: {
    win_rate_declining: { lr: 3.5, source: "SaaS best practice" },
    pipeline_thin: { lr: 3.0, source: "SaaS best practice" },
    velocity_declining: { lr: 2.0, source: "Heuristic — labeled" },
    ltv_cac_below_3: { lr: 2.5, source: "Bessemer VP (2023)" },
    nps_high: { lr: 0.7, source: "Net Promoter 3.0 (Reichheld)" },
  },
  okr_on_track: {
    goal_hit_rate_high: { lr: 2.8, source: "Historical base rate" },
    velocity_stable: { lr: 1.8, source: "Heuristic — labeled" },
    okr_silent_30d: { lr: 0.3, source: "Doerr (2018)" },
    no_owner: { lr: 0.4, source: "OKR best practice" },
  },
};

export function updateBelief(hypothesis: string, activeSignals: string[]): BeliefUpdate {
  const def = PRIORS[hypothesis];
  if (!def) throw new Error("Unknown hypothesis: " + hypothesis);

  const lrs = LIKELIHOOD_RATIOS[hypothesis] ?? {};
  let odds = def.prior / (1 - def.prior);
  const applied: BeliefUpdate["appliedEvidence"] = [];

  for (const signal of activeSignals) {
    const entry = lrs[signal];
    if (!entry) continue;
    odds *= entry.lr;
    applied.push({
      signal,
      likelihoodRatio: entry.lr,
      source: entry.source,
      effect: entry.lr >= 1 ? "increases" : "decreases",
    });
  }

  const posterior = odds / (1 + odds);
  const posteriorPct = Math.round(posterior * 100);

  return {
    hypothesis,
    prior: def.prior,
    posterior: Math.round(posterior * 1000) / 1000,
    posteriorPct,
    appliedEvidence: applied,
    highRisk: posterior > 0.6,
    label:
      `Bayesian update: P(${hypothesis}|evidence) = ${posteriorPct}%. ` +
      `Prior: ${Math.round(def.prior * 100)}%. ` +
      `Source: ${def.source}. ` +
      `Labeled: likelihood ratios from cited research. Small n → high uncertainty.`,
  };
}

export function extractSignals(findings: Array<{ rule: string }>): {
  attrition_60d: string[];
  revenue_miss_quarter: string[];
  okr_on_track: string[];
} {
  const rules = new Set(findings.map((f) => f.rule));
  return {
    attrition_60d: [
      rules.has("R7") && "burnout_signal",
      rules.has("R14") && "mood_declining",
      rules.has("R15") && "cadence_missed",
      rules.has("R8b") && "no_growth_plan",
      rules.has("R6") && "recent_conflict",
    ].filter(Boolean) as string[],
    revenue_miss_quarter: [
      rules.has("R27") && "win_rate_declining",
      rules.has("R26") && "pipeline_thin",
      rules.has("R34") && "velocity_declining",
      rules.has("R21") && "ltv_cac_below_3",
    ].filter(Boolean) as string[],
    okr_on_track: [
      rules.has("R41") && "okr_silent_30d",
      rules.has("R42") && "no_owner",
    ].filter(Boolean) as string[],
  };
}
