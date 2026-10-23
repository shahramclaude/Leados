// Deterministic, explainable lead-scoring engine.
// Every score decomposes into named, weighted criteria with a human-readable
// rationale per criterion so a reviewer can see exactly why a lead scored
// the way it did — no opaque model, no hidden weights.

export type TitleSeniority =
  | "c_suite"
  | "vp"
  | "director"
  | "manager"
  | "individual_contributor";

export interface ScoringInput {
  budget: number;
  companySize: number;
  engagementScore: number; // 0-100
  titleSeniority: TitleSeniority;
  icpFit: number; // 0-100
  responseHistory: number; // 0-100
}

export interface ScoreCriterion {
  criterion: string;
  weight: number;
  rawValue: number;
  normalizedValue: number; // 0-100
  contribution: number; // weight * normalizedValue, in score points
  rationale: string;
}

export interface ScoreResult {
  total: number;
  breakdown: ScoreCriterion[];
}

const SENIORITY_POINTS: Record<TitleSeniority, number> = {
  c_suite: 100,
  vp: 80,
  director: 60,
  manager: 35,
  individual_contributor: 15,
};

const SENIORITY_LABEL: Record<TitleSeniority, string> = {
  c_suite: "C-suite",
  vp: "VP",
  director: "Director",
  manager: "Manager",
  individual_contributor: "Individual contributor",
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

// log-scaled so a $500k budget doesn't dwarf everything else linearly
function normalizeBudget(budget: number): number {
  if (budget <= 0) return 0;
  const score = (Math.log10(budget + 1) / Math.log10(1_000_000)) * 100;
  return clamp(score, 0, 100);
}

function normalizeCompanySize(size: number): number {
  if (size <= 0) return 0;
  const score = (Math.log10(size + 1) / Math.log10(10_000)) * 100;
  return clamp(score, 0, 100);
}

const WEIGHTS = {
  budget: 0.25,
  companySize: 0.15,
  engagement: 0.2,
  seniority: 0.15,
  icpFit: 0.15,
  responseHistory: 0.1,
};

export function computeScore(input: ScoringInput): ScoreResult {
  const budgetNorm = normalizeBudget(input.budget);
  const sizeNorm = normalizeCompanySize(input.companySize);
  const engagementNorm = clamp(input.engagementScore, 0, 100);
  const seniorityNorm = SENIORITY_POINTS[input.titleSeniority] ?? 15;
  const icpNorm = clamp(input.icpFit, 0, 100);
  const responseNorm = clamp(input.responseHistory, 0, 100);

  const breakdown: ScoreCriterion[] = [
    {
      criterion: "Budget",
      weight: WEIGHTS.budget,
      rawValue: input.budget,
      normalizedValue: Math.round(budgetNorm),
      contribution: Math.round(budgetNorm * WEIGHTS.budget),
      rationale: `Budget of $${input.budget.toLocaleString()} normalized on a log scale against a $1M reference ceiling.`,
    },
    {
      criterion: "Company size",
      weight: WEIGHTS.companySize,
      rawValue: input.companySize,
      normalizedValue: Math.round(sizeNorm),
      contribution: Math.round(sizeNorm * WEIGHTS.companySize),
      rationale: `${input.companySize.toLocaleString()} employees normalized on a log scale against a 10,000-employee reference ceiling.`,
    },
    {
      criterion: "Engagement",
      weight: WEIGHTS.engagement,
      rawValue: input.engagementScore,
      normalizedValue: Math.round(engagementNorm),
      contribution: Math.round(engagementNorm * WEIGHTS.engagement),
      rationale: `Observed engagement score of ${input.engagementScore}/100 (email opens, replies, site visits).`,
    },
    {
      criterion: "Title seniority",
      weight: WEIGHTS.seniority,
      rawValue: seniorityNorm,
      normalizedValue: seniorityNorm,
      contribution: Math.round(seniorityNorm * WEIGHTS.seniority),
      rationale: `Contact title mapped to seniority tier "${SENIORITY_LABEL[input.titleSeniority]}".`,
    },
    {
      criterion: "ICP fit",
      weight: WEIGHTS.icpFit,
      rawValue: input.icpFit,
      normalizedValue: Math.round(icpNorm),
      contribution: Math.round(icpNorm * WEIGHTS.icpFit),
      rationale: `Ideal-customer-profile fit rated ${input.icpFit}/100 against industry, geography and use-case match.`,
    },
    {
      criterion: "Response history",
      weight: WEIGHTS.responseHistory,
      rawValue: input.responseHistory,
      normalizedValue: Math.round(responseNorm),
      contribution: Math.round(responseNorm * WEIGHTS.responseHistory),
      rationale: `Historical responsiveness rated ${input.responseHistory}/100 across prior outreach touches.`,
    },
  ];

  const total = clamp(
    Math.round(breakdown.reduce((sum, c) => sum + c.contribution, 0)),
    0,
    100,
  );

  return { total, breakdown };
}
