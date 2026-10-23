// Deterministic, explainable lead-scoring engine.
// Every score decomposes into named, weighted criteria so the result can be
// shown to a human with a full breakdown — no black box.

export type LeadAttributes = {
  budget?: number; // estimated deal value in currency units
  employees?: number; // company headcount
  engagement?: number; // 0-100, how engaged the lead has been
  titleSeniority?: "individual_contributor" | "manager" | "director" | "vp" | "c_level";
  icpFit?: number; // 0-100, how well the lead matches ideal customer profile
  responded?: boolean;
};

export type ScoreContribution = {
  criterion: string;
  weight: number;
  rawValue: number | string | boolean | null;
  normalizedValue: number; // 0-1
  contribution: number; // points contributed out of 100
  rationale: string;
};

export type ScoreResult = {
  score: number;
  breakdown: ScoreContribution[];
  label: "low" | "medium" | "high" | "critical";
};

const SENIORITY_WEIGHTS: Record<NonNullable<LeadAttributes["titleSeniority"]>, number> = {
  individual_contributor: 0.2,
  manager: 0.45,
  director: 0.7,
  vp: 0.85,
  c_level: 1,
};

const CRITERIA_WEIGHTS = {
  budget: 0.25,
  employees: 0.15,
  engagement: 0.2,
  titleSeniority: 0.2,
  icpFit: 0.15,
  responded: 0.05,
} as const;

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function scoreLead(attributes: LeadAttributes): ScoreResult {
  const breakdown: ScoreContribution[] = [];

  const budget = attributes.budget ?? 0;
  const budgetNorm = clamp01(budget / 100_000);
  breakdown.push({
    criterion: "Budget",
    weight: CRITERIA_WEIGHTS.budget,
    rawValue: budget,
    normalizedValue: budgetNorm,
    contribution: Math.round(budgetNorm * CRITERIA_WEIGHTS.budget * 100),
    rationale: `Estimated budget of ${budget.toLocaleString()} scaled against a $100k reference ceiling.`,
  });

  const employees = attributes.employees ?? 0;
  const employeesNorm = clamp01(employees / 2000);
  breakdown.push({
    criterion: "Company size",
    weight: CRITERIA_WEIGHTS.employees,
    rawValue: employees,
    normalizedValue: employeesNorm,
    contribution: Math.round(employeesNorm * CRITERIA_WEIGHTS.employees * 100),
    rationale: `${employees.toLocaleString()} employees scaled against a 2,000-employee reference ceiling.`,
  });

  const engagement = attributes.engagement ?? 0;
  const engagementNorm = clamp01(engagement / 100);
  breakdown.push({
    criterion: "Engagement",
    weight: CRITERIA_WEIGHTS.engagement,
    rawValue: engagement,
    normalizedValue: engagementNorm,
    contribution: Math.round(engagementNorm * CRITERIA_WEIGHTS.engagement * 100),
    rationale: `Observed engagement score of ${engagement}/100 (email opens, site visits, replies).`,
  });

  const seniority = attributes.titleSeniority ?? "individual_contributor";
  const seniorityNorm = SENIORITY_WEIGHTS[seniority];
  breakdown.push({
    criterion: "Title seniority",
    weight: CRITERIA_WEIGHTS.titleSeniority,
    rawValue: seniority,
    normalizedValue: seniorityNorm,
    contribution: Math.round(seniorityNorm * CRITERIA_WEIGHTS.titleSeniority * 100),
    rationale: `Contact title mapped to seniority tier "${seniority}".`,
  });

  const icpFit = attributes.icpFit ?? 0;
  const icpNorm = clamp01(icpFit / 100);
  breakdown.push({
    criterion: "ICP fit",
    weight: CRITERIA_WEIGHTS.icpFit,
    rawValue: icpFit,
    normalizedValue: icpNorm,
    contribution: Math.round(icpNorm * CRITERIA_WEIGHTS.icpFit * 100),
    rationale: `Ideal-customer-profile fit rated ${icpFit}/100.`,
  });

  const responded = attributes.responded ?? false;
  const respondedNorm = responded ? 1 : 0;
  breakdown.push({
    criterion: "Has responded",
    weight: CRITERIA_WEIGHTS.responded,
    rawValue: responded,
    normalizedValue: respondedNorm,
    contribution: Math.round(respondedNorm * CRITERIA_WEIGHTS.responded * 100),
    rationale: responded
      ? "Lead has responded to outreach at least once."
      : "No response recorded yet.",
  });

  const score = Math.min(
    100,
    breakdown.reduce((sum, item) => sum + item.contribution, 0)
  );

  let label: ScoreResult["label"] = "low";
  if (score >= 80) label = "critical";
  else if (score >= 60) label = "high";
  else if (score >= 35) label = "medium";

  return { score, breakdown, label };
}
