// Part 09 compatibility stand-in: fairness/privacy machinery. The real Part
// 09 module runs statistical parity / disparate-impact style scans over
// machine-readable decision criteria. Here we expose the same contract the
// ethical lens engine (Part 46) needs: given a decision's structured
// criteria (if any), run a scan; otherwise explain plainly why it could not
// run rather than pretending fairness was checked.

import { Explain, explain } from "@/lib/explain";

export interface FairnessScanResult {
  ran: boolean;
  disparities: Array<{ dimension: string; score: number; flagged: boolean }>;
}

export function runFairnessScan(
  structuredCriteria: Record<string, number> | null | undefined,
): Explain<FairnessScanResult> {
  if (!structuredCriteria || Object.keys(structuredCriteria).length === 0) {
    return explain(
      { ran: false, disparities: [] },
      "This decision has no machine-readable criteria attached, so the automated " +
        "fairness scan could not run. This is NOT evidence of fairness — it means " +
        "a human equity review is required instead.",
      ["no_structured_criteria"],
      "low",
    );
  }

  // Minimal, explainable heuristic: flag any dimension whose normalized score
  // deviates more than 0.3 from parity (0.5), mirroring the kind of
  // disparate-impact signal Part 09's real machinery computes in full.
  const disparities = Object.entries(structuredCriteria).map(([dimension, score]) => ({
    dimension,
    score,
    flagged: Math.abs(score - 0.5) > 0.3,
  }));

  const flaggedCount = disparities.filter((d) => d.flagged).length;

  return explain(
    { ran: true, disparities },
    flaggedCount > 0
      ? `Fairness scan ran on ${disparities.length} criteria and flagged ${flaggedCount} ` +
        `dimension(s) with a disparity greater than 0.3 from parity.`
      : `Fairness scan ran on ${disparities.length} criteria; no disparity exceeded the 0.3 threshold.`,
    disparities.map((d) => d.dimension),
    flaggedCount > 0 ? "medium" : "high",
  );
}
