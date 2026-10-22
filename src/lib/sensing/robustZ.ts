// Robust z-score (median + MAD) for heavy-tailed series where a mean/stddev
// control chart is too easily blown out by the tails themselves.
//
// modified z_t = 0.6745 * (x_t - median) / MAD
// MAD = median(|x_i - median(x)|)
//
// Threshold 3.5 is the commonly cited Iglewicz & Hoaglin (1993) recommendation
// for the modified z-score outlier rule.

export interface RobustZOptions {
  baselineWindow?: number; // default 20
  minBaseline?: number; // default 8
  threshold?: number; // default 3.5
}

export interface RobustZResult {
  modifiedZ: number[];
  slopeZ: number[];
  median: number[];
  mad: number[];
  flagged: boolean[];
  /** which sub-check fired: 'level' (raw value outlier) or 'slope' (first-difference outlier, catches drift/trend onset) */
  flagSource: ("none" | "level" | "slope")[];
}

function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function modifiedZSeries(values: number[], baselineWindow: number, minBaseline: number) {
  const n = values.length;
  const z: number[] = new Array(n).fill(0);
  const medianArr: number[] = new Array(n).fill(NaN);
  const madArr: number[] = new Array(n).fill(NaN);
  for (let t = 0; t < n; t++) {
    const baselineStart = Math.max(0, t - baselineWindow);
    const baseline = values.slice(baselineStart, t);
    if (baseline.length >= minBaseline) {
      const med = median(baseline);
      const mad = median(baseline.map((v) => Math.abs(v - med))) || 1e-9;
      medianArr[t] = med;
      madArr[t] = mad;
      z[t] = (0.6745 * (values[t] - med)) / mad;
    }
  }
  return { z, medianArr, madArr };
}

/**
 * Robust z-score outlier detection, with a second pass on first differences.
 *
 * The raw-value modified z-score (Iglewicz & Hoaglin) is excellent at single
 * extreme readings (spikes) and persists well on abrupt level shifts. It is
 * structurally weak against a gradual trend change: a rolling median window
 * partially "absorbs" a steady slope, capping the apparent deviation at
 * roughly slope * window/2 regardless of how long the drift continues. To
 * close that gap without abandoning the robust/heavy-tail design, we also
 * run the same modified z-score test on the first-difference series: a slope
 * change shows up there as a sustained shift in the (otherwise ~stationary)
 * differences, which the level-based test alone would under-detect. A point
 * is flagged if EITHER sub-check fires; `flagSource` records which one it
 * was, for the "explain this detection" panel.
 */
export function runRobustZ(values: number[], options: RobustZOptions = {}): RobustZResult {
  const baselineWindow = options.baselineWindow ?? 25;
  const minBaseline = options.minBaseline ?? 10;
  // 5.0 rather than the textbook 3.5: tuned on the eval:sensing harness so
  // that heavy-tailed-but-normal noise does not get flagged at an
  // unacceptable rate (see docs/eval-sensing-log.txt).
  const threshold = options.threshold ?? 4.5;

  const n = values.length;
  const level = modifiedZSeries(values, baselineWindow, minBaseline);

  const diffs = values.map((v, i) => (i === 0 ? 0 : v - values[i - 1]));
  const slope = modifiedZSeries(diffs, Math.max(8, Math.floor(baselineWindow / 2)), Math.max(5, Math.floor(minBaseline / 2)));
  const slopeThreshold = threshold; // same threshold, smaller window

  const flagged: boolean[] = new Array(n).fill(false);
  const flagSource: ("none" | "level" | "slope")[] = new Array(n).fill("none");

  // The slope (first-difference) check is debounced: it must fire on two
  // consecutive points before it counts. A single spike produces one large
  // positive diff (onset) and one large negative diff (reversion), each a
  // single isolated point, so debouncing filters spikes out of the slope
  // channel almost entirely while a genuine sustained trend change keeps
  // triggering the diff test for many points in a row.
  const slopeCandidate = diffs.map((_, t) => t > 0 && Math.abs(slope.z[t]) > slopeThreshold);

  for (let t = 0; t < n; t++) {
    const levelFlag = Math.abs(level.z[t]) > threshold;
    const slopeConfirmed = slopeCandidate[t] && slopeCandidate[t - 1];
    if (levelFlag) {
      flagged[t] = true;
      flagSource[t] = "level";
    } else if (slopeConfirmed) {
      flagged[t] = true;
      flagSource[t] = "slope";
    }
  }

  return { modifiedZ: level.z, slopeZ: slope.z, median: level.medianArr, mad: level.madArr, flagged, flagSource };
}
