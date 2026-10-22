// LEADOS — Part 39: shared types for the Organizational Fitness Function.

export type EvidenceClass = "measured" | "derived" | "self_reported" | "proxy";

export type Direction = "higher_better" | "lower_better";

export interface FitnessDimension {
  id: string;
  name: string;
  description: string;
  /** Default policy weight used to seed v1 of the weight policy. Not sacred — overridable via Weight Policy flow. */
  defaultWeight: number;
}

export interface FitnessMetric {
  id: string;
  dimensionId: string;
  name: string;
  description: string;
  unit: string;
  direction: Direction;
  evidenceClass: EvidenceClass;
  /** Normalization bounds — values are clamped into [min, max] before scaling to [0, 1]. */
  min: number;
  max: number;
  /** Honesty rule: how could this metric be improved WITHOUT real improvement? Authored for every metric. */
  goodhartRisk: string;
  /** The paired counter-metric id that should move consistently with real improvement. */
  counterMetricId: string;
  /** Why this specific pairing defends against the gaming risk above. */
  counterRationale: string;
}

export interface WeightEntry {
  weight: number;
  rationale: string;
}

export type WeightMap = Record<string, WeightEntry>;

export interface MetricSampleInput {
  metricId: string;
  value: number;
}

export interface MetricDecomposition {
  id: string;
  name: string;
  unit: string;
  direction: Direction;
  evidenceClass: EvidenceClass;
  value: number;
  normalizedScore: number;
  goodhartRisk: string;
  counterMetricId: string;
  counterRationale: string;
  counterValue: number | null;
  counterNormalizedScore: number | null;
  /** ∂Fitness/∂value for this metric, holding everything else fixed. */
  sensitivity: number;
}

export interface DimensionDecomposition {
  id: string;
  name: string;
  description: string;
  rawWeight: number;
  weightRationale: string;
  normalizedWeight: number;
  /** D_i — mean of normalized metric scores in this dimension. */
  score: number;
  /** normalizedWeight * score — this dimension's contribution to the final number. */
  contribution: number;
  /** ∂Fitness/∂w_i for this dimension's raw weight, holding other raw weights fixed. */
  weightSensitivity: number;
  metrics: MetricDecomposition[];
}

export interface FitnessResult {
  fitness: number;
  totalRawWeight: number;
  policyId: number | null;
  policyVersion: number | null;
  dimensions: DimensionDecomposition[];
  generatedAt: string;
}
