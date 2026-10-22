// Zero-filler lint over a week of generated morning briefs.
// Run via `npm run lint:briefs`. Pure/no DB dependency: builds a week's
// worth of plausible-but-synthetic BriefInputs (including a couple of
// "quiet day" cases with zero alerts/updates, which is exactly where
// template filler usually sneaks in) and asserts every generated brief
// still lints clean.

import { generateBrief, lintBrief, type BriefInputs } from "../src/lib/sensing/briefing";

function dayInputs(dayOffset: number, variant: "busy" | "quiet" | "mixed"): BriefInputs {
  const asOf = new Date(Date.UTC(2024, 0, 15 + dayOffset, 6, 0, 0));

  if (variant === "quiet") {
    return {
      asOf,
      monitoredSeriesCount: 12,
      overnightAlerts: [],
      forecastUpdates: [],
      riskProximities: [],
      weakSignals: [],
    };
  }

  if (variant === "busy") {
    return {
      asOf,
      monitoredSeriesCount: 12,
      overnightAlerts: [
        {
          alertId: 100 + dayOffset,
          seriesName: "signups_daily",
          method: "ewma",
          observed: 212.4,
          expectedLow: 150.1,
          expectedHigh: 190.3,
          deviation: 4.8,
          falsePositiveEstimate: 0.03,
          severity: "medium",
        },
        {
          alertId: 101 + dayOffset,
          seriesName: "checkout_latency_ms",
          method: "robust_z",
          observed: 980.2,
          expectedLow: 300,
          expectedHigh: 520,
          deviation: 6.1,
          falsePositiveEstimate: 0.27,
          severity: "high",
        },
      ],
      forecastUpdates: [
        { questionId: 3, question: "Will checkout latency breach threshold this week?", kind: "crowd_shift", detail: "crowd probability moved from 0.48 to 0.63 after 2 new forecasts." },
      ],
      riskProximities: [
        { riskId: 2, riskTitle: "Checkout degradation", indicatorId: 5, currentValue: 980.2, thresholdValue: 1000, proximity: 0.91, direction: "above" },
      ],
      weakSignals: [
        { themeLabel: "refund delays", status: "signal", velocity: 2.1, evidenceCount: 9 },
      ],
    };
  }

  // mixed: one quiet section, one with data
  return {
    asOf,
    monitoredSeriesCount: 12,
    overnightAlerts: [],
    forecastUpdates: [
      { questionId: 1, question: "Will weekly signups exceed 1,200?", kind: "resolved", detail: "resolved YES; 4 forecasts scored, best Brier 0.0100 (carol)." },
    ],
    riskProximities: [],
    weakSignals: [],
  };
}

const variants: ("busy" | "quiet" | "mixed")[] = ["busy", "quiet", "mixed", "quiet", "busy", "mixed", "quiet"];

let anyFailed = false;
console.log("=== lint:briefs — one week of generated briefs ===\n");
variants.forEach((variant, i) => {
  const inputs = dayInputs(i, variant);
  const { content, citationsCount } = generateBrief(inputs);
  const lint = lintBrief(content);
  console.log(`Day ${i + 1} (${variant}): citations=${citationsCount} lint=${lint.passed ? "PASS" : "FAIL"}`);
  if (!lint.passed) {
    anyFailed = true;
    lint.errors.forEach((e) => console.log(`  - ${e}`));
  }
});

console.log("");
if (anyFailed) {
  console.error("lint:briefs: at least one brief FAILED the zero-filler lint");
  process.exitCode = 1;
} else {
  console.log("lint:briefs: all 7 generated briefs PASSED the zero-filler lint");
}
