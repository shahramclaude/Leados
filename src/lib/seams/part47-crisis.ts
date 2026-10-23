// SEAM ADAPTER — Part 47 (Crisis Elevation)
//
// STATUS: not present in this repo snapshot. "Escalating via Part 47's
// crisis elevation when thresholds breach" is implemented locally: Part 50
// owns the `crisis_elevations` table and the threshold-breach rule
// (`shouldElevate`) that decides when an external signal should be escalated.
// When Part 47's real escalation service exists, replace `recordElevation`'s
// body with a call into it; keep the same function signature so callers in
// Part 50 do not need to change.

export interface ElevationDecision {
  elevate: boolean;
  reason: string;
  thresholdBreached: string;
}

export function shouldElevate(params: {
  severity: "low" | "moderate" | "high" | "critical";
  reliabilityClass: "tier1_verified" | "tier2_reported" | "tier3_unverified";
}): ElevationDecision {
  const { severity, reliabilityClass } = params;

  if (reliabilityClass === "tier3_unverified") {
    return {
      elevate: false,
      reason: "Source reliability too low to trigger crisis elevation on its own.",
      thresholdBreached: "none",
    };
  }

  if (severity === "critical") {
    return {
      elevate: true,
      reason: "Critical-severity external signal from a reliable source.",
      thresholdBreached: "severity>=critical AND reliability>=tier2",
    };
  }

  if (severity === "high" && reliabilityClass === "tier1_verified") {
    return {
      elevate: true,
      reason: "High-severity external signal from a tier-1 verified source.",
      thresholdBreached: "severity>=high AND reliability==tier1",
    };
  }

  return {
    elevate: false,
    reason: "Below crisis-elevation thresholds.",
    thresholdBreached: "none",
  };
}
