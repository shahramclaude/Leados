// Uncertainty surfacing (Part 04), reused by every dashboard/report surface
// (Part 07/08) that shows a confidence-bearing value. One banding function,
// one color/label mapping — do not reimplement per-page.
export type ConfidenceBand = "low" | "medium" | "high";

export function confidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= 0.66) return "high";
  if (confidence >= 0.33) return "medium";
  return "low";
}

export const CONFIDENCE_BAND_LABEL: Record<ConfidenceBand, string> = {
  high: "High confidence",
  medium: "Moderate confidence",
  low: "Low confidence",
};

export const CONFIDENCE_BAND_CLASSES: Record<ConfidenceBand, string> = {
  high: "bg-emerald-100 text-emerald-800 border-emerald-300",
  medium: "bg-amber-100 text-amber-800 border-amber-300",
  low: "bg-rose-100 text-rose-800 border-rose-300",
};
