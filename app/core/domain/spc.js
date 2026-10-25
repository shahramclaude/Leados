/**
 * app/core/domain/spc.js — Statistical Process Control (Shewhart XmR).
 *
 * Pure mathematical module (no DOM, no storage) separating common-cause noise
 * from special-cause signals on longitudinal leadership and operational series.
 *
 * Theoretical basis:
 *   - Walter A. Shewhart (1931), "Economic Control of Quality of Manufactured
 *     Product": natural process limits +/- 3 sigma_within around the process
 *     center line.
 *   - W. Edwards Deming (1986), "Out of the Crisis" (the funnel experiment):
 *     reacting to single-point movement inside natural process limits ("tampering")
 *     doubles process variance rather than improving performance.
 *   - Donald J. Wheeler (1993), "Understanding Variation: The Key to Managing
 *     Chaos": Individuals & Moving-Range (XmR) chart for periodic management
 *     time series where each period yields a single observation (subgroup n = 2
 *     for consecutive moving ranges, bias-correction constant d2 = 1.128,
 *     3 / d2 = 2.660, 2 / d2 = 1.773, D4 = 3.267).
 *
 * Honest measurement invariants:
 *   1. Never fabricates limits from thin history: requires at least 4 measured
 *      observations AND at least 3 adjacent period-to-period moving ranges.
 *   2. Never interpolates across missing or privacy-suppressed periods: if
 *      period t is null/suppressed, |x_{t+1} - x_{t-1}| is NOT a 1-period
 *      moving range, and consecutive-run counters reset across the gap.
 *   3. Respects physical scale bounds (e.g. [0, 100] scores or [0, inf) days)
 *      when displaying clamped UNPL/LNPL while testing Rule 1 against raw
 *      statistical limits so bounded ceilings cannot trigger impossible alarms.
 */

export const XMR_D2 = 1.128;
export const XMR_LIMIT_FACTOR = 2.66; // 3 / 1.128
export const XMR_TWO_SIGMA_FACTOR = 1.773; // 2 / 1.128
export const XMR_D4 = 3.267;
export const MIN_XMR_POINTS = 4;
export const MIN_ADJACENT_RANGES = 3;

function round2(n) {
  return Math.round(n * 100) / 100;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function normalizeSeriesPoint(raw, idx) {
  if (typeof raw === 'number') {
    return {
      index: idx,
      label: `P${idx + 1}`,
      date: null,
      value: Number.isFinite(raw) ? raw : null,
      status: Number.isFinite(raw) ? 'measured' : 'unmeasured',
    };
  }
  const v = raw && typeof raw.value === 'number' && Number.isFinite(raw.value) ? raw.value : null;
  return {
    index: idx,
    label: raw?.label || raw?.date || `P${idx + 1}`,
    date: raw?.date || null,
    value: v,
    status: raw?.status || (v !== null ? 'measured' : 'unmeasured'),
  };
}

function classifyPolarity(directionOfMove, desirableDirection) {
  if (desirableDirection === 'neutral' || !directionOfMove) return 'neutral';
  if (desirableDirection === 'higher') {
    return directionOfMove === 'high' ? 'favorable' : 'adverse';
  }
  if (desirableDirection === 'lower') {
    return directionOfMove === 'low' ? 'favorable' : 'adverse';
  }
  return 'neutral';
}

/**
 * Compute Shewhart XmR natural process limits and Wheeler special-cause signals.
 *
 * @param {Array<number|{label?:string,date?:string,value:number|null,status?:string}>} items
 * @param {{
 *   minBound?: number|null,
 *   maxBound?: number|null,
 *   desirableDirection?: 'higher'|'lower'|'neutral',
 *   unit?: string,
 * }} [options]
 */
export function computeXmR(items, options = {}) {
  const {
    minBound = null,
    maxBound = null,
    desirableDirection = 'higher',
    unit = '',
  } = options;

  const points = (Array.isArray(items) ? items : []).map(normalizeSeriesPoint);
  const measured = points.filter((p) => p.value !== null);
  const gapCount = points.length - measured.length;

  const adjacentRanges = [];
  for (let i = 1; i < points.length; i += 1) {
    if (points[i - 1].value !== null && points[i].value !== null) {
      adjacentRanges.push({
        index: i,
        fromLabel: points[i - 1].label,
        toLabel: points[i].label,
        date: points[i].date,
        range: Math.abs(points[i].value - points[i - 1].value),
        delta: points[i].value - points[i - 1].value,
      });
    }
  }

  if (measured.length < MIN_XMR_POINTS || adjacentRanges.length < MIN_ADJACENT_RANGES) {
    return {
      available: false,
      reason: measured.length < MIN_XMR_POINTS
        ? `Needs at least ${MIN_XMR_POINTS} measured checkpoints (${measured.length} available) before natural process limits can separate signal from noise.`
        : `Needs at least ${MIN_ADJACENT_RANGES} consecutive period-to-period pairs (${adjacentRanges.length} available; gaps are not interpolated).`,
      measuredCount: measured.length,
      adjacentRangeCount: adjacentRanges.length,
      gapCount,
      mean: null,
      avgMovingRange: null,
      sigmaWithin: null,
      unpl: null,
      lnpl: null,
      rawUnpl: null,
      rawLnpl: null,
      url: null,
      signals: [],
      recentSignals: [],
      regime: 'insufficient-data',
      guidance: 'Collect more periodic observations before treating single-period swings as a trend.',
      points,
      movingRanges: adjacentRanges,
    };
  }

  const mean = measured.reduce((acc, p) => acc + p.value, 0) / measured.length;
  const avgMovingRange = adjacentRanges.reduce((acc, r) => acc + r.range, 0) / adjacentRanges.length;
  const sigmaWithin = avgMovingRange / XMR_D2;

  const rawUnpl = mean + XMR_LIMIT_FACTOR * avgMovingRange;
  const rawLnpl = mean - XMR_LIMIT_FACTOR * avgMovingRange;
  const rawUpper2Sigma = mean + XMR_TWO_SIGMA_FACTOR * avgMovingRange;
  const rawLower2Sigma = mean - XMR_TWO_SIGMA_FACTOR * avgMovingRange;
  const url = XMR_D4 * avgMovingRange;

  const unpl = maxBound !== null ? Math.min(maxBound, rawUnpl) : rawUnpl;
  const lnpl = minBound !== null ? Math.max(minBound, rawLnpl) : rawLnpl;

  const signals = [];
  const constantProcess = avgMovingRange === 0;

  // Rule 1: Any observation outside raw 3-sigma natural process limits.
  if (!constantProcess) {
    for (const p of measured) {
      if (p.value > rawUnpl) {
        const polarity = classifyPolarity('high', desirableDirection);
        signals.push({
          rule: 'beyond-limit',
          ruleCode: 'WE-1',
          index: p.index,
          label: p.label,
          date: p.date,
          value: round1(p.value),
          direction: 'high',
          polarity,
          summary: `${p.label} (${round1(p.value)}${unit}) exceeded the upper natural process limit (${round1(unpl)}${unit}).`,
        });
      } else if (p.value < rawLnpl) {
        const polarity = classifyPolarity('low', desirableDirection);
        signals.push({
          rule: 'beyond-limit',
          ruleCode: 'WE-1',
          index: p.index,
          label: p.label,
          date: p.date,
          value: round1(p.value),
          direction: 'low',
          polarity,
          summary: `${p.label} (${round1(p.value)}${unit}) fell below the lower natural process limit (${round1(lnpl)}${unit}).`,
        });
      }
    }

    // Rule 2: Consecutive period-to-period jump exceeding Upper Range Limit (D4 * mR_bar).
    for (const mr of adjacentRanges) {
      if (mr.range > url) {
        const moveDir = mr.delta >= 0 ? 'high' : 'low';
        const polarity = classifyPolarity(moveDir, desirableDirection);
        signals.push({
          rule: 'range-spike',
          ruleCode: 'WE-2',
          index: mr.index,
          label: mr.toLabel,
          date: mr.date,
          value: round1(mr.range),
          direction: moveDir,
          polarity,
          summary: `Jump from ${mr.fromLabel} to ${mr.toLabel} (${mr.delta >= 0 ? '+' : ''}${round1(mr.delta)}${unit}) exceeded the moving-range limit (${round1(url)}${unit}).`,
        });
      }
    }
  }

  // Rule 3: Run of 8 consecutive adjacent observations on the same side of the mean.
  // Gaps reset the consecutive run so unmeasured/suppressed periods are never bridged.
  let runSide = null;
  let runPoints = [];
  for (const p of points) {
    if (p.value === null || p.value === mean) {
      runSide = null;
      runPoints = [];
      continue;
    }
    const side = p.value > mean ? 'high' : 'low';
    if (side === runSide) {
      runPoints.push(p);
    } else {
      runSide = side;
      runPoints = [p];
    }
    if (runPoints.length === 8) {
      const polarity = classifyPolarity(side, desirableDirection);
      signals.push({
        rule: 'sustained-shift',
        ruleCode: 'WE-3',
        index: p.index,
        label: p.label,
        date: p.date,
        value: round1(p.value),
        direction: side,
        polarity,
        summary: `8 consecutive periods (${runPoints[0].label}–${p.label}) stayed ${side === 'high' ? 'above' : 'below'} the center line (${round1(mean)}${unit}), indicating a sustained process shift.`,
      });
    }
  }

  // Rule 4: 3 out of 4 consecutive adjacent observations beyond 2-sigma on the same side.
  if (!constantProcess) {
    let contiguous = [];
    for (const p of points) {
      if (p.value === null) {
        contiguous = [];
        continue;
      }
      contiguous.push(p);
      if (contiguous.length >= 4) {
        const win = contiguous.slice(-4);
        const highHits = win.filter((w) => w.value > rawUpper2Sigma);
        const lowHits = win.filter((w) => w.value < rawLower2Sigma);
        if (highHits.length >= 3) {
          const already = signals.some((s) => s.rule === 'near-limit-cluster' && s.index === p.index - 1 && s.direction === 'high');
          if (!already) {
            signals.push({
              rule: 'near-limit-cluster',
              ruleCode: 'WE-4',
              index: p.index,
              label: p.label,
              date: p.date,
              value: round1(p.value),
              direction: 'high',
              polarity: classifyPolarity('high', desirableDirection),
              summary: `3 of 4 consecutive periods ending ${p.label} exceeded upper 2σ (${round1(Math.min(maxBound ?? rawUpper2Sigma, rawUpper2Sigma))}${unit}).`,
            });
          }
        } else if (lowHits.length >= 3) {
          const already = signals.some((s) => s.rule === 'near-limit-cluster' && s.index === p.index - 1 && s.direction === 'low');
          if (!already) {
            signals.push({
              rule: 'near-limit-cluster',
              ruleCode: 'WE-4',
              index: p.index,
              label: p.label,
              date: p.date,
              value: round1(p.value),
              direction: 'low',
              polarity: classifyPolarity('low', desirableDirection),
              summary: `3 of 4 consecutive periods ending ${p.label} fell below lower 2σ (${round1(Math.max(minBound ?? rawLower2Sigma, rawLower2Sigma))}${unit}).`,
            });
          }
        }
      }
    }
  }

  const lastTwoIndices = new Set(measured.slice(-2).map((p) => p.index));
  const recentSignals = signals.filter((s) => lastTwoIndices.has(s.index));

  let regime = 'common-cause';
  if (signals.length > 0) {
    const activeSet = recentSignals.length > 0 ? recentSignals : signals;
    const hasAdverse = activeSet.some((s) => s.polarity === 'adverse');
    const hasFavorable = activeSet.some((s) => s.polarity === 'favorable');
    if (hasAdverse && hasFavorable) regime = 'special-cause-mixed';
    else if (hasAdverse) regime = 'special-cause-adverse';
    else if (hasFavorable) regime = 'special-cause-favorable';
    else regime = 'special-cause-mixed';
  }

  let guidance;
  if (regime === 'common-cause') {
    guidance = `Common-cause variation only (natural band ${round1(lnpl)}${unit} to ${round1(unpl)}${unit}). Do not chase single-period wiggles (Deming tampering); change the underlying operating system if you want a new mean.`;
  } else if (regime === 'special-cause-adverse') {
    guidance = 'Adverse special-cause signal detected outside routine noise. Investigate the specific period or structural change rather than treating this as ordinary fluctuation.';
  } else if (regime === 'special-cause-favorable') {
    guidance = 'Favorable special-cause shift detected beyond routine noise. Verify what changed in the process and anchor the practice so it does not revert.';
  } else {
    guidance = 'Special-cause variation detected across periods. Inspect specific events at the flagged checkpoints.';
  }

  return {
    available: true,
    reason: null,
    measuredCount: measured.length,
    adjacentRangeCount: adjacentRanges.length,
    gapCount,
    mean: round2(mean),
    avgMovingRange: round2(avgMovingRange),
    sigmaWithin: round2(sigmaWithin),
    unpl: round2(unpl),
    lnpl: round2(lnpl),
    rawUnpl: round2(rawUnpl),
    rawLnpl: round2(rawLnpl),
    url: round2(url),
    signals,
    recentSignals,
    regime,
    guidance,
    points,
    movingRanges: adjacentRanges.map((r) => ({ ...r, range: round2(r.range), delta: round2(r.delta) })),
  };
}

/**
 * Evaluate whether an operational change shifted a tracked metric beyond
 * baseline natural process limits (used in Organizational Change anchoring).
 *
 * @param {Array<{date?:string,value:number,phase?:'baseline'|'post',note?:string}>} observations
 * @param {{
 *   desirableDirection?: 'lower'|'higher',
 *   minBound?: number|null,
 *   maxBound?: number|null,
 *   unit?: string,
 * }} [options]
 */
export function compareBaselineShift(observations, options = {}) {
  const {
    desirableDirection = 'lower',
    minBound = 0,
    maxBound = null,
    unit = '',
  } = options;

  const valid = (Array.isArray(observations) ? observations : [])
    .filter((o) => o && typeof o.value === 'number' && Number.isFinite(o.value))
    .slice()
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

  const baseline = valid.filter((o) => o.phase !== 'post');
  const post = valid.filter((o) => o.phase === 'post');

  if (!baseline.length || !post.length) {
    return {
      measured: false,
      statisticallyVerified: false,
      verdict: 'incomplete',
      baselineMean: baseline.length ? round2(baseline.reduce((s, o) => s + o.value, 0) / baseline.length) : null,
      postMean: post.length ? round2(post.reduce((s, o) => s + o.value, 0) / post.length) : null,
      delta: null,
      pctChange: null,
      baselineCount: baseline.length,
      postCount: post.length,
      baselineXmR: null,
      summary: !baseline.length && !post.length
        ? 'No baseline or post-change observations recorded yet.'
        : !baseline.length
          ? 'Record at least one pre-change baseline observation to compare against.'
          : 'Record post-change observations to test whether the change moved the metric.',
    };
  }

  const baselineMean = baseline.reduce((s, o) => s + o.value, 0) / baseline.length;
  const postMean = post.reduce((s, o) => s + o.value, 0) / post.length;
  const delta = postMean - baselineMean;
  const pctChange = baselineMean !== 0 ? (delta / Math.abs(baselineMean)) * 100 : null;
  const improved = desirableDirection === 'lower' ? delta < 0 : delta > 0;

  const baselineXmR = computeXmR(
    baseline.map((b, i) => ({ label: b.date || `B${i + 1}`, date: b.date, value: b.value })),
    { minBound, maxBound, desirableDirection, unit },
  );

  let statisticallyVerified = false;
  let verdict = improved ? 'directional-improvement' : delta === 0 ? 'unchanged' : 'directional-regression';
  let summary = '';

  if (baselineXmR.available && baselineXmR.avgMovingRange > 0) {
    // Check if post-change observations breached the baseline natural process limit in the desirable direction,
    // OR if all post-change observations (>= 3) sit outside baseline 2-sigma on the desirable side.
    const postBeyondLimit = post.some((p) => (
      desirableDirection === 'lower' ? p.value < baselineXmR.rawLnpl : p.value > baselineXmR.rawUnpl
    ));
    const twoSigmaThreshold = desirableDirection === 'lower'
      ? baselineXmR.mean - XMR_TWO_SIGMA_FACTOR * baselineXmR.avgMovingRange
      : baselineXmR.mean + XMR_TWO_SIGMA_FACTOR * baselineXmR.avgMovingRange;
    const postClusterShift = post.length >= 3 && post.filter((p) => (
      desirableDirection === 'lower' ? p.value < twoSigmaThreshold : p.value > twoSigmaThreshold
    )).length >= 3;

    const postAdverseBreach = post.some((p) => (
      desirableDirection === 'lower' ? p.value > baselineXmR.rawUnpl : p.value < baselineXmR.rawLnpl
    ));

    if (improved && (postBeyondLimit || postClusterShift)) {
      statisticallyVerified = true;
      verdict = 'verified-shift';
      summary = `Verified shift beyond baseline natural limits (${round1(baselineXmR.lnpl)}–${round1(baselineXmR.unpl)}${unit}): baseline ${round1(baselineMean)}${unit} → post-change ${round1(postMean)}${unit}.`;
    } else if (!improved && postAdverseBreach) {
      verdict = 'adverse-shift';
      summary = `Adverse breach beyond baseline natural limits: baseline ${round1(baselineMean)}${unit} → post-change ${round1(postMean)}${unit}.`;
    } else {
      verdict = 'within-noise';
      summary = `Post-change mean (${round1(postMean)}${unit}) remains inside baseline natural process limits (${round1(baselineXmR.lnpl)}–${round1(baselineXmR.unpl)}${unit}) — indistinguishable from common-cause noise so far.`;
    }
  } else {
    summary = `Baseline ${round1(baselineMean)}${unit} (${baseline.length} obs) → post-change ${round1(postMean)}${unit} (${post.length} obs). At least ${MIN_XMR_POINTS} baseline observations are needed to compute Shewhart natural limits.`;
  }

  return {
    measured: true,
    statisticallyVerified,
    verdict,
    improved,
    baselineMean: round2(baselineMean),
    postMean: round2(postMean),
    delta: round2(delta),
    pctChange: pctChange !== null ? round1(pctChange) : null,
    baselineCount: baseline.length,
    postCount: post.length,
    baselineXmR,
    summary,
  };
}
