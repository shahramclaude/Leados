// LEADOS intelligence engine — worker performance / churn risk predictor.
export const SYSTEM_ID = "performance-risk-predictor-v1";

export interface PerformanceRiskInput {
  recentSlaMisses: number;
  avgResponseMinutes: number;
  tenureMonths: number;
  engagementScore: number; // 0..1
}

export interface PerformanceRiskOutput {
  churnRiskScore: number; // 0..100, higher = more likely to churn / miss SLA
  band: "low" | "medium" | "high";
  factors: Array<{ factor: string; weight: number; direction: "increases" | "decreases" }>;
}

/** Predicts SLA-miss / churn risk to inform (not act on) retention outreach.
 * decisionRole: inform — output is advisory only, surfaced to an ops
 * dashboard; no automated consequence attaches to the worker. */
export function predictPerformanceRisk(input: PerformanceRiskInput): PerformanceRiskOutput {
  const slaComponent = Math.min(input.recentSlaMisses * 8, 40);
  const responseComponent = Math.min(input.avgResponseMinutes / 2, 25);
  const tenureProtection = Math.min(input.tenureMonths / 2, 20);
  const engagementProtection = input.engagementScore * 20;

  const raw = slaComponent + responseComponent - tenureProtection - engagementProtection + 20;
  const churnRiskScore = Math.max(0, Math.min(100, Math.round(raw)));
  const band = churnRiskScore >= 66 ? "high" : churnRiskScore >= 33 ? "medium" : "low";

  return {
    churnRiskScore,
    band,
    factors: [
      { factor: "Recent SLA misses", weight: Math.round(slaComponent), direction: "increases" },
      { factor: "Avg response time", weight: Math.round(responseComponent), direction: "increases" },
      { factor: "Tenure", weight: Math.round(tenureProtection), direction: "decreases" },
      { factor: "Engagement", weight: Math.round(engagementProtection), direction: "decreases" },
    ],
  };
}
