// Empirical false-positive estimates per detection method.
//
// These are NOT theoretical control-limit alphas. They are measured by
// `npm run eval:sensing`, which injects known anomalies into generated
// series and also runs every method over long anomaly-free stretches to
// count false alarms. Run the script and paste the "falsePositiveRate"
// column here; the alert objects cite whichever number is current in this
// file plus the script that produced it, so the number never silently goes
// stale without someone having to notice the mismatch.
//
// Last measured: see eval:sensing console output / docs/eval-sensing-log.txt
// committed alongside this file.

import type { DetectionMethod } from "./types";

// Measured 2024-01-15 by `npm run eval:sensing` (60 seeds x 4 injection
// types x 3 methods; see docs/eval-sensing-log.txt for the full run). These
// are 1 - precision on the method's in-scope anomaly types (i.e. "of the
// alerts this method raises that it's designed to raise, what fraction are
// likely noise, not a real event") -- the more conservative, decision-
// relevant number, rather than the raw per-point background false-alarm
// rate (which is much lower but answers a different question: "how often
// does a quiet point get flagged at all").
export const FALSE_POSITIVE_ESTIMATE: Record<DetectionMethod, number> = {
  // EWMA(lambda=0.25, L=2.7): precision 0.97 on its full in-scope set
  // (level_shift, trend_change, seasonal_break, spike) -> FP estimate 0.03.
  ewma: 0.03,
  // Robust z (MAD, threshold 4.5, plus debounced first-difference check):
  // precision 0.73 on its in-scope set (level_shift, spike only -- it is
  // NOT relied on for trend_change/seasonal_break, see GATE_SCOPE in
  // scripts/eval-sensing.ts) -> FP estimate 0.27.
  robust_z: 0.27,
  // Seasonal decomposition + residual EWMA (lambda=0.35, L=2.3): precision
  // 0.69 on its in-scope set (level_shift, seasonal_break, spike) -> FP
  // estimate 0.31.
  seasonal_ewma: 0.31,
};

export const FALSE_POSITIVE_SOURCE =
  "npm run eval:sensing (seeded injection harness, see docs/eval-sensing-log.txt)";
