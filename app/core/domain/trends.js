/**
 * app/core/domain/trends.js — multi-period historical trends across every
 * team-health dimension and operational follow-through habit.
 *
 * Principles:
 *  - Never invent history: periods before the workspace recorded management
 *    activity return null (`pre-history`), and unmeasured dimensions return
 *    null (`no-evidence`) rather than zero.
 *  - Preserve pulse anonymity: every historical window runs the exact same
 *    minimum-cohort, complete-response, and unanimous-slice suppression rules.
 *  - Disclose reconstruction fidelity: dimensions backed strictly by dated
 *    events or Schema v5 snapshots are marked `exact`; periods relying on
 *    mutable current fields (such as pre-v5 key-result values or undated
 *    plan closures) are marked `approximate` with explicit reasons.
 *  - Prevent composition bias: composite period-over-period deltas compare
 *    dimensions measured in both periods (`matchedDelta`) and disclose when
 *    dimension coverage changed.
 */

import { addDays, dayKey, formatDate, round } from '../time.js';
import { DIMENSIONS, dimensions, reconstructStateAt } from './health.js';
import { aggregate } from './pulse.js';
import { feedbackLatencySummary } from './feedback.js';
import { delegationSummary } from './delegations.js';

export const TREND_HORIZONS = {
  '8w': { key: '8w', label: '8 weeks', periods: 4, stepDays: 14, description: '4 fortnightly checkpoints' },
  '12w': { key: '12w', label: '12 weeks', periods: 6, stepDays: 14, description: '6 fortnightly checkpoints' },
  '6m': { key: '6m', label: '6 months', periods: 6, stepDays: 30, description: '6 monthly checkpoints (30-day steps)' },
};

/**
 * Earliest calendar date of a logged management record in the workspace.
 * Roster start dates are deliberately excluded so adding long-tenured people
 * to a brand-new workspace does not fabricate empty historical periods.
 */
export function firstRecordedActivityDay(state) {
  const candidates = [
    ...(state.oneOnOnes || []).map((m) => m.date),
    ...(state.feedback || []).map((f) => f.date),
    ...(state.pulses || []).map((p) => p.date),
    ...(state.recognition || []).map((r) => r.date),
    ...(state.decisions || []).map((d) => d.date),
    ...(state.delegations || []).map((d) => d.delegatedOn),
    ...(state.goals || []).flatMap((g) => [
      (g.createdAt || '').slice(0, 10),
      ...(g.checkins || []).map((c) => c.date),
    ]),
    ...(state.growthPlans || []).map((p) => (p.createdAt || '').slice(0, 10)),
  ].filter((d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d));

  if (!candidates.length) return null;
  candidates.sort();
  return candidates[0];
}

function matchedComparison(laterDims, earlierDims) {
  const earlierMap = new Map(earlierDims.map((d) => [d.key, d]));
  const shared = laterDims.filter(
    (d) => typeof d.score === 'number' && typeof earlierMap.get(d.key)?.score === 'number',
  );
  if (!shared.length) return { available: false, delta: null, sharedKeys: [], coverageChanged: false };
  const weightSum = shared.reduce((sum, d) => sum + d.weight, 0);
  const laterMean = round(shared.reduce((sum, d) => sum + d.score * d.weight, 0) / weightSum, 1);
  const earlierMean = round(shared.reduce((sum, d) => sum + earlierMap.get(d.key).score * d.weight, 0) / weightSum, 1);
  const laterKeys = laterDims.filter((d) => typeof d.score === 'number').map((d) => d.key).join(',');
  const earlierKeys = earlierDims.filter((d) => typeof d.score === 'number').map((d) => d.key).join(',');
  return {
    available: true,
    delta: round(laterMean - earlierMean, 1),
    laterMatched: laterMean,
    earlierMatched: earlierMean,
    sharedKeys: shared.map((d) => d.key),
    coverageChanged: laterKeys !== earlierKeys,
  };
}

/**
 * Build multi-period series for overall health, all five health dimensions,
 * feedback observation-to-discussion latency, and delegation follow-through.
 */
export function buildTeamTrends(state, now = new Date(), options = {}) {
  const horizonKey = TREND_HORIZONS[options.horizon] ? options.horizon : '12w';
  const horizon = TREND_HORIZONS[horizonKey];
  const periods = options.periods || horizon.periods;
  const stepDays = options.stepDays || horizon.stepDays;
  const today = dayKey(now);
  const firstActivity = firstRecordedActivityDay(state);

  const points = [];
  const latencyPoints = [];
  const delegationPoints = [];

  for (let i = 0; i < periods; i += 1) {
    const daysBack = (periods - 1 - i) * stepDays;
    const periodEnd = addDays(today, -daysBack);
    const periodStart = addDays(periodEnd, -(stepDays - 1));
    const isCurrent = periodEnd === today;
    const shortLabel = formatDate(periodEnd, { withYear: false });
    const asOfDate = new Date(`${periodEnd}T23:59:59.000Z`);

    // 1. Feedback observation-to-conversation latency in [periodStart .. periodEnd]
    if (!isCurrent && (!firstActivity || periodEnd < firstActivity)) {
      latencyPoints.push({
        periodStart,
        periodEnd,
        label: shortLabel,
        totalGiven: 0,
        measured: 0,
        unmeasured: 0,
        invalid: 0,
        delayed: 0,
        averageDays: null,
        onTimePct: null,
        status: 'pre-history',
        fidelity: 'exact',
      });
    } else {
      const windowFeedback = (state.feedback || []).filter(
        (f) => f.direction === 'given' && f.date && f.date >= periodStart && f.date <= periodEnd && f.date <= today,
      );
      const lat = feedbackLatencySummary(windowFeedback, state.settings?.feedbackLatencyTargetDays ?? 7);
      const onTimePct = lat.samples > 0 ? round(((lat.samples - lat.delayed) / lat.samples) * 100) : null;
      latencyPoints.push({
        periodStart,
        periodEnd,
        label: shortLabel,
        totalGiven: windowFeedback.length,
        measured: lat.samples,
        unmeasured: lat.unmeasured,
        invalid: lat.invalid,
        delayed: lat.delayed,
        averageDays: lat.average,
        onTimePct,
        status: lat.samples > 0 ? 'measured' : windowFeedback.length > 0 ? 'unmeasured' : 'no-evidence',
        fidelity: 'exact',
      });
    }

    // 2. Pre-history guard for point-in-time health & delegation checkpoints
    if (!isCurrent && (!firstActivity || periodEnd < firstActivity)) {
      const preDims = Object.fromEntries(
        DIMENSIONS.map((d) => [
          d.key,
          {
            key: d.key,
            label: d.label,
            weight: d.weight,
            score: null,
            status: 'pre-history',
            blockedReason: null,
            fidelity: null,
            fidelityReasons: [],
            detail: 'Before workspace records began.',
          },
        ]),
      );
      points.push({
        periodStart,
        periodEnd,
        label: shortLabel,
        isCurrent,
        status: 'pre-history',
        overall: null,
        coverage: 0,
        measuredCount: 0,
        fidelity: null,
        fidelityReasons: [],
        dimensions: preDims,
      });
      delegationPoints.push({
        periodStart,
        periodEnd,
        label: shortLabel,
        status: 'pre-history',
        fidelity: 'exact',
        followThroughPct: null,
        evaluated: 0,
        active: 0,
        onTrack: 0,
        attention: 0,
        overdue: 0,
        blocked: 0,
        checkinDue: 0,
        completedInWindow: 0,
        returnedInWindow: 0,
      });
      continue;
    }

    const reconstructed = reconstructStateAt(state, periodEnd, { currentDay: today });
    const snap = reconstructed.state;
    const rawDims = dimensions(snap, asOfDate);
    const pulse = aggregate(snap, asOfDate);

    // 3. Per-dimension historical evidence & suppression checks
    const dimEntries = {};
    for (const dim of rawDims) {
      let score = dim.score;
      let status = typeof score === 'number' ? 'measured' : 'no-evidence';
      let blockedReason = null;
      let detail = dim.detail;

      if (dim.key === 'wellbeing') {
        if (pulse.n === 0) {
          score = null;
          status = 'no-evidence';
        } else if (pulse.blocked) {
          score = null;
          status = 'suppressed';
          blockedReason = pulse.blockedReason;
        }
      } else if (!isCurrent) {
        if (dim.key === 'cadence' && snap.oneOnOnes.length === 0) {
          score = null;
          status = 'no-evidence';
          detail = 'No 1:1 records existed by this checkpoint.';
        } else if (dim.key === 'feedback' && snap.feedback.length === 0) {
          score = null;
          status = 'no-evidence';
          detail = 'No feedback records existed by this checkpoint.';
        } else if (dim.key === 'clarity' && snap.goals.length === 0 && pulse.blocked) {
          score = null;
          status = 'no-evidence';
          detail = 'No goals or readable pulse existed by this checkpoint.';
        } else if (dim.key === 'growth' && snap.growthPlans.length === 0 && pulse.blocked) {
          score = null;
          status = 'no-evidence';
          detail = 'No development plans or readable pulse existed by this checkpoint.';
        }
      }

      const fid = reconstructed.fidelity[dim.key] || { level: 'exact', reasons: [] };
      dimEntries[dim.key] = {
        key: dim.key,
        label: dim.label,
        weight: dim.weight,
        score,
        status,
        blockedReason,
        fidelity: status === 'measured' ? fid.level : null,
        fidelityReasons: status === 'measured' ? fid.reasons : [],
        detail,
      };
    }

    const measuredDims = DIMENSIONS.map((d) => dimEntries[d.key]).filter((d) => typeof d.score === 'number');
    const weightSum = measuredDims.reduce((sum, d) => sum + d.weight, 0);
    const overall = measuredDims.length
      ? round(measuredDims.reduce((sum, d) => sum + d.score * d.weight, 0) / weightSum, 1)
      : null;
    const periodReasons = [...new Set(measuredDims.flatMap((d) => d.fidelityReasons))];

    points.push({
      periodStart,
      periodEnd,
      label: shortLabel,
      isCurrent,
      status: measuredDims.length ? 'measured' : 'no-evidence',
      overall,
      coverage: round(weightSum, 2),
      measuredCount: measuredDims.length,
      fidelity: measuredDims.length ? (periodReasons.length ? 'approximate' : 'exact') : null,
      fidelityReasons: periodReasons,
      dimensions: dimEntries,
    });

    // 4. Delegation follow-through at checkpoint
    if (!snap.delegations.length) {
      delegationPoints.push({
        periodStart,
        periodEnd,
        label: shortLabel,
        status: 'no-evidence',
        fidelity: 'exact',
        followThroughPct: null,
        evaluated: 0,
        active: 0,
        onTrack: 0,
        attention: 0,
        overdue: 0,
        blocked: 0,
        checkinDue: 0,
        completedInWindow: 0,
        returnedInWindow: 0,
      });
    } else {
      const delSummary = delegationSummary({ delegations: snap.delegations }, asOfDate, state.settings);
      const completedInWindow = snap.delegations.filter(
        (d) => d.status === 'done' && d.completedOn && d.completedOn >= periodStart && d.completedOn <= periodEnd,
      ).length;
      const returnedInWindow = snap.delegations.filter(
        (d) => d.status === 'returned' && d.returnedOn && d.returnedOn >= periodStart && d.returnedOn <= periodEnd,
      ).length;
      const onTrack = Math.max(0, delSummary.active - delSummary.attention.length);
      const evaluated = delSummary.active + completedInWindow;
      const followThroughPct = evaluated > 0 ? round(((onTrack + completedInWindow) / evaluated) * 100) : null;
      delegationPoints.push({
        periodStart,
        periodEnd,
        label: shortLabel,
        status: evaluated > 0 ? 'measured' : 'no-active',
        fidelity: 'exact',
        followThroughPct,
        evaluated,
        active: delSummary.active,
        onTrack,
        attention: delSummary.attention.length,
        overdue: delSummary.overdue,
        blocked: delSummary.blocked,
        checkinDue: delSummary.checkinDue,
        completedInWindow,
        returnedInWindow,
      });
    }
  }

  // Per-dimension summaries
  const dimensionSummaries = DIMENSIONS.map((meta) => {
    const series = points.map((p) => ({
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      label: p.label,
      ...p.dimensions[meta.key],
    }));
    const measured = series.filter((s) => s.status === 'measured' && typeof s.score === 'number');
    const latest = series[series.length - 1];
    const earlierMeasured = series.slice(0, -1).filter((s) => s.status === 'measured' && typeof s.score === 'number');
    const previous = earlierMeasured.length ? earlierMeasured[earlierMeasured.length - 1] : null;
    const first = measured.length ? measured[0] : null;
    const reasons = [...new Set(measured.flatMap((s) => s.fidelityReasons))];
    const suppressedCount = series.filter((s) => s.status === 'suppressed').length;
    const approximateCount = measured.filter((s) => s.fidelity === 'approximate').length;

    const canComparePrev = typeof latest.score === 'number' && previous !== null;
    const canCompareSpan = typeof latest.score === 'number' && first !== null && first.periodEnd !== latest.periodEnd;

    return {
      ...meta,
      latestScore: latest.score,
      latestStatus: latest.status,
      latestBlockedReason: latest.blockedReason,
      measuredPeriods: measured.length,
      totalPeriods: periods,
      suppressedCount,
      approximateCount,
      fidelity: measured.length ? (approximateCount > 0 ? 'approximate' : 'exact') : null,
      fidelityReasons: reasons,
      deltaVsPrevious: canComparePrev ? round(latest.score - previous.score, 1) : null,
      previousPeriodEnd: previous ? previous.periodEnd : null,
      deltaOverHorizon: canCompareSpan ? round(latest.score - first.score, 1) : null,
      firstPeriodEnd: first ? first.periodEnd : null,
      series,
    };
  });

  // Composite overall summary using matched-dimension comparison
  const measuredOverallPoints = points.filter((p) => typeof p.overall === 'number');
  const latestPoint = points[points.length - 1];
  const earlierOverall = points.slice(0, -1).filter((p) => typeof p.overall === 'number');
  const prevPoint = earlierOverall.length ? earlierOverall[earlierOverall.length - 1] : null;
  const firstPoint = measuredOverallPoints.length ? measuredOverallPoints[0] : null;

  const prevComparison = typeof latestPoint.overall === 'number' && prevPoint
    ? matchedComparison(Object.values(latestPoint.dimensions), Object.values(prevPoint.dimensions))
    : { available: false, delta: null, sharedKeys: [], coverageChanged: false };

  const spanComparison = typeof latestPoint.overall === 'number' && firstPoint && firstPoint.periodEnd !== latestPoint.periodEnd
    ? matchedComparison(Object.values(latestPoint.dimensions), Object.values(firstPoint.dimensions))
    : { available: false, delta: null, sharedKeys: [], coverageChanged: false };

  const overallReasons = [...new Set(measuredOverallPoints.flatMap((p) => p.fidelityReasons))];
  const overallSummary = {
    latest: latestPoint.overall,
    latestCoverage: latestPoint.coverage,
    measuredPeriods: measuredOverallPoints.length,
    totalPeriods: periods,
    fidelity: measuredOverallPoints.length
      ? (measuredOverallPoints.some((p) => p.fidelity === 'approximate') ? 'approximate' : 'exact')
      : null,
    fidelityReasons: overallReasons,
    vsPrevious: {
      ...prevComparison,
      periodEnd: prevPoint ? prevPoint.periodEnd : null,
    },
    overHorizon: {
      ...spanComparison,
      periodEnd: firstPoint ? firstPoint.periodEnd : null,
    },
  };

  // Operational follow-through summaries
  const measuredLatency = latencyPoints.filter((p) => p.status === 'measured' && typeof p.averageDays === 'number');
  const latestLatency = measuredLatency.length ? measuredLatency[measuredLatency.length - 1] : null;
  const prevLatency = measuredLatency.length >= 2 ? measuredLatency[measuredLatency.length - 2] : null;
  const latencySummary = {
    targetDays: state.settings?.feedbackLatencyTargetDays ?? 7,
    measuredPeriods: measuredLatency.length,
    unmeasuredConversations: latencyPoints.reduce((sum, p) => sum + p.unmeasured, 0),
    measuredConversations: latencyPoints.reduce((sum, p) => sum + p.measured, 0),
    available: measuredLatency.length >= 2,
    latestAverageDays: latestLatency ? latestLatency.averageDays : null,
    latestPeriodEnd: latestLatency ? latestLatency.periodEnd : null,
    previousAverageDays: prevLatency ? prevLatency.averageDays : null,
    previousPeriodEnd: prevLatency ? prevLatency.periodEnd : null,
    deltaDays: latestLatency && prevLatency ? round(latestLatency.averageDays - prevLatency.averageDays, 1) : null,
    reason: measuredLatency.length >= 2
      ? null
      : 'Needs observed dates on given feedback in at least two periods before a trend can be compared.',
    points: latencyPoints,
  };

  const measuredDelegations = delegationPoints.filter((p) => p.status === 'measured' && typeof p.followThroughPct === 'number');
  const latestDelegation = measuredDelegations.length ? measuredDelegations[measuredDelegations.length - 1] : null;
  const prevDelegation = measuredDelegations.length >= 2 ? measuredDelegations[measuredDelegations.length - 2] : null;
  const delegationTrendSummary = {
    checkinTargetDays: state.settings?.delegationCheckinDays ?? 7,
    measuredPeriods: measuredDelegations.length,
    available: measuredDelegations.length >= 2,
    latestPct: latestDelegation ? latestDelegation.followThroughPct : null,
    latestPeriodEnd: latestDelegation ? latestDelegation.periodEnd : null,
    previousPct: prevDelegation ? prevDelegation.followThroughPct : null,
    previousPeriodEnd: prevDelegation ? prevDelegation.periodEnd : null,
    deltaPct: latestDelegation && prevDelegation ? round(latestDelegation.followThroughPct - prevDelegation.followThroughPct, 1) : null,
    reason: measuredDelegations.length >= 2
      ? null
      : 'Needs active or completed delegations across at least two checkpoints before follow-through can be compared.',
    points: delegationPoints,
  };

  return {
    horizon,
    firstActivity,
    points,
    overall: overallSummary,
    dimensions: dimensionSummaries,
    latency: latencySummary,
    delegations: delegationTrendSummary,
  };
}
