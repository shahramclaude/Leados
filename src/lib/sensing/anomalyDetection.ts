// Orchestrates the three explainable detectors and turns raw flags into
// fully-explained AnomalyAlert objects: { series, method, deviation,
// expectedBand, falsePositiveEstimate, likelyCauses[] }.

import { runEwma } from "./ewma";
import { runRobustZ } from "./robustZ";
import { runSeasonalEwma } from "./seasonal";
import { FALSE_POSITIVE_ESTIMATE } from "./falsePositiveRates";
import type { AnomalyAlert, DetectionMethod, Severity, SeriesMeta, SeriesPoint } from "./types";

function severityFromDeviation(devSigma: number): Severity {
  if (devSigma >= 6) return "high";
  if (devSigma >= 4) return "medium";
  return "low";
}

function likelyCauses(method: DetectionMethod, devSigma: number, direction: 1 | -1): string[] {
  const causes: string[] = [];
  if (method === "seasonal_ewma") {
    causes.push("Seasonal pattern deviated from its usual shape for this time period (possible seasonal break or one-off event).");
  } else if (method === "robust_z") {
    causes.push("A single extreme reading inconsistent with the typical spread of recent values (possible data glitch or genuine spike).");
  } else {
    causes.push(direction > 0 ? "Sustained upward move beyond the expected band (possible level shift or trend change)." : "Sustained downward move beyond the expected band (possible level shift or trend change).");
  }
  if (devSigma >= 6) causes.push("Deviation magnitude is large relative to recent history; low chance of ordinary noise.");
  else causes.push("Deviation is moderate; cannot rule out noise without more points.");
  return causes;
}

/**
 * Pick the primary detector for a series based on its metadata, matching the
 * documented policy: seasonal decomposition where seasonality is declared,
 * robust (MAD) z for declared heavy-tailed series, EWMA control chart
 * otherwise.
 */
export function primaryMethodFor(meta: SeriesMeta): DetectionMethod {
  if (meta.seasonalPeriod && meta.seasonalPeriod >= 4) return "seasonal_ewma";
  if (meta.heavyTailed) return "robust_z";
  return "ewma";
}

export interface DetectOptions {
  ewma?: Parameters<typeof runEwma>[1];
  robustZ?: Parameters<typeof runRobustZ>[1];
}

/** Run every method against a series (used for eval + cross-checking). */
export function detectAllMethods(
  points: SeriesPoint[],
  meta: SeriesMeta,
  options: DetectOptions = {},
): Record<DetectionMethod, AnomalyAlert[]> {
  const values = points.map((p) => p.value);

  const result: Record<DetectionMethod, AnomalyAlert[]> = {
    ewma: [],
    robust_z: [],
    seasonal_ewma: [],
  };

  const ewma = runEwma(values, options.ewma);
  for (let i = 0; i < values.length; i++) {
    if (ewma.flagged[i]) {
      const direction = values[i] - ewma.mu[i] >= 0 ? 1 : -1;
      result.ewma.push({
        index: i,
        ts: points[i].ts,
        method: "ewma",
        observed: values[i],
        expectedLow: ewma.mu[i] - ewma.limit[i],
        expectedHigh: ewma.mu[i] + ewma.limit[i],
        deviation: ewma.deviationSigma[i],
        falsePositiveEstimate: FALSE_POSITIVE_ESTIMATE.ewma,
        likelyCauses: likelyCauses("ewma", ewma.deviationSigma[i], direction),
        severity: severityFromDeviation(ewma.deviationSigma[i]),
      });
    }
  }

  const robust = runRobustZ(values, options.robustZ);
  for (let i = 0; i < values.length; i++) {
    if (robust.flagged[i]) {
      const viaSlope = robust.flagSource[i] === "slope";
      const deviation = Math.abs(viaSlope ? robust.slopeZ[i] : robust.modifiedZ[i]);
      const direction = (viaSlope ? robust.slopeZ[i] : robust.modifiedZ[i]) >= 0 ? 1 : -1;
      const band = robust.mad[i] * (3.5 / 0.6745);
      const causes = viaSlope
        ? [
            "Rate-of-change (first difference) deviated from its recent typical spread (possible trend/slope change).",
            deviation >= 6
              ? "Deviation magnitude is large; low chance of ordinary noise."
              : "Deviation is moderate; cannot rule out noise without more points.",
          ]
        : likelyCauses("robust_z", deviation, direction);
      result.robust_z.push({
        index: i,
        ts: points[i].ts,
        method: "robust_z",
        observed: values[i],
        expectedLow: robust.median[i] - band,
        expectedHigh: robust.median[i] + band,
        deviation,
        falsePositiveEstimate: FALSE_POSITIVE_ESTIMATE.robust_z,
        likelyCauses: causes,
        severity: severityFromDeviation(deviation),
      });
    }
  }

  if (meta.seasonalPeriod && meta.seasonalPeriod >= 4) {
    const seasonal = runSeasonalEwma(values, meta.seasonalPeriod, options.ewma);
    for (let i = 0; i < values.length; i++) {
      if (seasonal.flagged[i]) {
        const direction = seasonal.decomposition.residual[i] - seasonal.mu[i] >= 0 ? 1 : -1;
        result.seasonal_ewma.push({
          index: i,
          ts: points[i].ts,
          method: "seasonal_ewma",
          observed: values[i],
          expectedLow: seasonal.decomposition.trend[i] + seasonal.decomposition.seasonal[i] + (seasonal.mu[i] - seasonal.limit[i]),
          expectedHigh: seasonal.decomposition.trend[i] + seasonal.decomposition.seasonal[i] + (seasonal.mu[i] + seasonal.limit[i]),
          deviation: seasonal.deviationSigma[i],
          falsePositiveEstimate: FALSE_POSITIVE_ESTIMATE.seasonal_ewma,
          likelyCauses: likelyCauses("seasonal_ewma", seasonal.deviationSigma[i], direction),
          severity: severityFromDeviation(seasonal.deviationSigma[i]),
        });
      }
    }
  }

  return result;
}

/** Run only the policy-selected primary method for a series (production path). */
export function detectPrimary(
  points: SeriesPoint[],
  meta: SeriesMeta,
  options: DetectOptions = {},
): AnomalyAlert[] {
  const all = detectAllMethods(points, meta, options);
  return all[primaryMethodFor(meta)];
}
