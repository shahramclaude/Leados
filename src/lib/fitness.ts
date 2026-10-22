// Seam 1: fitness reads every domain's metrics.
//
// A domain's fitness score is the mean of each metric's attainment ratio
// (value / target), clamped to [0, 1.5] per metric so a single wildly
// over-performing metric cannot dominate, then expressed 0-100.
export type FitnessMetricInput = {
  name: string;
  value: number;
  target: number;
};

export type FitnessResult = {
  score: number;
  metricCount: number;
  inputs: Array<{ name: string; attainment: number }>;
};

const MAX_METRIC_ATTAINMENT = 1.5;

export function computeFitnessScore(inputMetrics: FitnessMetricInput[]): FitnessResult {
  if (inputMetrics.length === 0) {
    return { score: 0, metricCount: 0, inputs: [] };
  }

  const inputs = inputMetrics.map((metric) => {
    const rawAttainment = metric.target === 0 ? 0 : metric.value / metric.target;
    const attainment = Math.max(0, Math.min(MAX_METRIC_ATTAINMENT, rawAttainment));
    return { name: metric.name, attainment };
  });

  const mean = inputs.reduce((sum, m) => sum + m.attainment, 0) / inputs.length;
  const score = Math.round(Math.min(1, mean) * 10000) / 100; // 0-100, 2dp

  return { score, metricCount: inputMetrics.length, inputs };
}
