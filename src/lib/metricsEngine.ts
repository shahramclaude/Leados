// =============================================================================
// Leados — Metrics Engine
// -----------------------------------------------------------------------------
// Not present in this checkout (Parts 1-5 missing). Rebuilt here with the
// general-purpose statistical primitives (CUSUM change detection, Holt-
// Winters smoothing/forecast, generic anomaly scoring) that the spec assumes
// already exist, then EXTENDED with `detectProjectAnomalies` for Part 6.
// =============================================================================

import type { Project, ProjectAnomaly, ProjectSnapshot } from "./types";

export interface CusumChangePoint {
  index: number;
  direction: "up" | "down";
  cumulativeDeviation: number;
}

/**
 * cusumDetect(series, k, h): CusumChangePoint[]
 * Classic two-sided CUSUM (cumulative sum) control-chart change detector.
 * `k` is the allowance/slack (fraction of std dev), `h` is the decision
 * threshold (in std devs). Flags the index where the cumulative deviation
 * from the running mean crosses the threshold in either direction.
 */
export function cusumDetect(
  series: number[],
  k = 0.5,
  h = 2,
): CusumChangePoint[] {
  if (series.length < 2) return [];

  const mean = series.reduce((a, b) => a + b, 0) / series.length;
  const variance =
    series.reduce((a, b) => a + (b - mean) ** 2, 0) / series.length;
  const std = Math.sqrt(variance) || 1;

  const kAllowance = k * std;
  const threshold = h * std;

  let sHigh = 0;
  let sLow = 0;
  const changePoints: CusumChangePoint[] = [];

  for (let i = 0; i < series.length; i++) {
    const dev = series[i] - mean;
    sHigh = Math.max(0, sHigh + dev - kAllowance);
    sLow = Math.min(0, sLow + dev + kAllowance);

    if (sHigh > threshold) {
      changePoints.push({ index: i, direction: "up", cumulativeDeviation: sHigh });
      sHigh = 0;
    }
    if (Math.abs(sLow) > threshold) {
      changePoints.push({ index: i, direction: "down", cumulativeDeviation: sLow });
      sLow = 0;
    }
  }

  return changePoints;
}

/**
 * holtWintersLevelTrend(series, alpha, beta): { level, trend, fitted }
 * Simplified (non-seasonal) double exponential smoothing — Holt's linear
 * trend method — used by the predictive scoring layer elsewhere; exposed
 * here so other modules can reuse one smoothing implementation.
 */
export function holtWintersLevelTrend(
  series: number[],
  alpha = 0.4,
  beta = 0.3,
): { level: number; trend: number; fitted: number[] } {
  if (series.length === 0) return { level: 0, trend: 0, fitted: [] };
  let level = series[0];
  let trend = series.length > 1 ? series[1] - series[0] : 0;
  const fitted: number[] = [level];

  for (let i = 1; i < series.length; i++) {
    const value = series[i];
    const prevLevel = level;
    level = alpha * value + (1 - alpha) * (prevLevel + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
    fitted.push(level);
  }

  return { level, trend, fitted };
}

export function standardDeviation(series: number[]): number {
  if (series.length === 0) return 0;
  const mean = series.reduce((a, b) => a + b, 0) / series.length;
  const variance =
    series.reduce((a, b) => a + (b - mean) ** 2, 0) / series.length;
  return Math.sqrt(variance);
}

// -----------------------------------------------------------------------------
// Part 6 extension — project-level anomaly detection
// -----------------------------------------------------------------------------

/**
 * detectProjectAnomalies(snapshots, project): ProjectAnomaly[]
 *
 * Operates on the trailing ~30 days of `project_snapshots` confidence
 * series for a single project.
 *
 * Uses `cusumDetect` (above) on the confidence time series: if confidence
 * drops by more than 2 standard deviations (a structural break per the
 * CUSUM control chart), emits a 'structural_break' anomaly.
 *
 * Independently, if confidence drops for 3+ consecutive snapshots, emits a
 * 'trend_reversal' anomaly.
 */
export function detectProjectAnomalies(
  snapshots: ProjectSnapshot[],
  project: Project,
): ProjectAnomaly[] {
  const ordered = [...snapshots]
    .filter((s) => s.projectId === project.id)
    .sort((a, b) => a.snapshotAt.getTime() - b.snapshotAt.getTime());

  if (ordered.length < 2) return [];

  const series = ordered.map((s) => s.confidence);
  const anomalies: ProjectAnomaly[] = [];

  // --- structural_break via CUSUM (k=0.5 std, h=2 std per spec) ---
  const changePoints = cusumDetect(series, 0.5, 2);
  const std = standardDeviation(series);
  for (const cp of changePoints) {
    if (cp.direction !== "down") continue;
    const snap = ordered[cp.index];
    const dropMagnitude = Math.abs(cp.cumulativeDeviation);
    if (dropMagnitude > 2 * std && std > 0) {
      anomalies.push({
        projectId: project.id,
        type: "structural_break",
        detectedAt: snap.snapshotAt.toISOString(),
        detail: `Confidence broke structurally downward at snapshot ${snap.snapshotAt.toISOString()} (cumulative deviation ${dropMagnitude.toFixed(2)}, > 2σ=${(2 * std).toFixed(2)}).`,
        magnitude: dropMagnitude,
      });
    }
  }

  // --- trend_reversal: 3+ consecutive declining snapshots ---
  let consecutiveDrops = 0;
  for (let i = 1; i < series.length; i++) {
    if (series[i] < series[i - 1]) {
      consecutiveDrops += 1;
      if (consecutiveDrops === 3) {
        const start = ordered[i - 2];
        const totalDrop = series[i - 2] - series[i];
        anomalies.push({
          projectId: project.id,
          type: "trend_reversal",
          detectedAt: ordered[i].snapshotAt.toISOString(),
          detail: `Confidence declined for 3 consecutive snapshots starting ${start.snapshotAt.toISOString()} (−${Math.abs(totalDrop)} pts cumulative).`,
          magnitude: Math.abs(totalDrop),
        });
      }
    } else {
      consecutiveDrops = 0;
    }
  }

  return anomalies;
}
