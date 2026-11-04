/**
 * Strategy Renewal Bridge: a bounded, seat-aware read model that joins the
 * declared Hoshin bets to Catchball commitments, then freezes an identity-free
 * learning line. Scenario numbers are transparent effort allocations only;
 * this module never moves budget, changes a bet, or edits a pact.
 */
import { addDays, dayKey, daysBetween, round } from '../time.js';
import { ACTIVE_PACT_STATUSES } from './catchballRegistry.js';
import { buildSeats, activeSeat } from './seat.js';
import { ALTITUDES } from './chainRegistry.js';
import {
  normalizeStrategyCycleReading,
  normalizeStrategyCycleSettings,
} from './strategyCycleSchema.js';
import {
  STRATEGY_CYCLE_DEFAULTS,
  STRATEGY_CYCLE_DISCLOSURE,
  STRATEGY_CYCLE_ENGINE_VERSION,
  STRATEGY_CYCLE_LIMITS,
  STRATEGY_CYCLE_PLAYBOOK,
} from './strategyCycleRegistry.js';

const roundEffort = (value) => round(Math.max(0, Number(value) || 0), 1);
const isActivePact = (pact) => ACTIVE_PACT_STATUSES.includes(pact?.status);
const sortedByDate = (a, b) => String(b?.frozenOn || '').localeCompare(String(a?.frozenOn || ''))
  || String(b?.createdAt || '').localeCompare(String(a?.createdAt || ''));

function wilson(successes, n) {
  if (!n) return { lowerPct: null, upperPct: null };
  const z = 1.96;
  const p = successes / n;
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denominator;
  const margin = (z * Math.sqrt((p * (1 - p) / n) + z2 / (4 * n * n))) / denominator;
  return {
    lowerPct: round(Math.max(0, centre - margin) * 100, 1),
    upperPct: round(Math.min(1, centre + margin) * 100, 1),
  };
}

export function strategyCycleBrier(rows = [], minimumN = 1) {
  const values = (Array.isArray(rows) ? rows : []).flatMap((pact) => {
    const rawConfidence = pact?.frozenConfidencePct;
    if (rawConfidence === null || rawConfidence === undefined || rawConfidence === '') return [];
    const confidence = Number(rawConfidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) return [];
    const outcome = pact.gradedOutcome === 'delivered' ? 1 : 0;
    return [((confidence / 100) - outcome) ** 2];
  });
  return values.length >= minimumN
    ? round(values.reduce((sum, value) => sum + value, 0) / values.length, 4)
    : null;
}

function scopeIdFor(seat) {
  return seat?.fullAccess || seat?.isLeader ? 'leader' : seat?.id;
}

function pactsInSeatScope(state, seat) {
  const pacts = Array.isArray(state?.catchballPacts) ? state.catchballPacts : [];
  if (seat?.readOnly) return [];
  if (seat?.fullAccess) return pacts;
  return pacts.filter((pact) => pact && (pact.toSeatId === seat.id || seat.scope?.has(pact.toSeatId)));
}

function betIndex(state) {
  return new Map((Array.isArray(state?.strategyBets) ? state.strategyBets : [])
    .filter((bet) => bet && typeof bet.id === 'string')
    .map((bet) => [bet.id, bet]));
}

function stoppedBetFor(pact, bets, today) {
  const bet = pact?.strategyBetId ? bets.get(pact.strategyBetId) : null;
  const stopDate = bet?.killCriterion?.checkOn;
  return Boolean(bet && bet.status === 'active' && stopDate && stopDate <= today);
}

function rawMetrics(active, previous, bets, today, watermelonGap) {
  const priorIds = new Set(previous?.cohortPactIds || []);
  const activeIds = new Set(active.map((pact) => pact.id));
  const carryover = active.filter((pact) => priorIds.has(pact.id));
  const overdue = active.filter((pact) => pact.dueOn && pact.dueOn < today);
  const watermelon = active.filter((pact) => pact.reportedPct !== null && pact.reportedPct !== undefined
    && pact.laggingPct !== null && pact.laggingPct !== undefined
    && Number.isFinite(Number(pact.reportedPct)) && Number.isFinite(Number(pact.laggingPct))
    && Number(pact.reportedPct) - Number(pact.laggingPct) >= watermelonGap);
  const stopRuleDue = active.filter((pact) => stoppedBetFor(pact, bets, today));
  const stoppedBet = active.filter((pact) => bets.get(pact.strategyBetId)?.status === 'retired');
  const unmeasured = active.filter((pact) => pact.laggingPct === null || pact.laggingPct === undefined);
  return {
    active: active.length,
    carryover: carryover.length,
    overdue: overdue.length,
    watermelon: watermelon.length,
    stopRuleDue: stopRuleDue.length,
    stoppedBet: stoppedBet.length,
    unmeasured: unmeasured.length,
    effortDays: roundEffort(active.reduce((sum, pact) => sum + (Number(pact.effortDays) || 0), 0)),
    releasedEffortDays: roundEffort([...new Set([...stopRuleDue, ...stoppedBet])]
      .reduce((sum, pact) => sum + (Number(pact.effortDays) || 0), 0)),
    reviewEffortDays: roundEffort(carryover.reduce((sum, pact) => sum + (Number(pact.effortDays) || 0), 0)),
    _activeIds: activeIds,
    _carryoverIds: new Set(carryover.map((pact) => pact.id)),
    _overdueIds: new Set(overdue.map((pact) => pact.id)),
  };
}

function isSmallCell(value, floor) {
  return Number.isFinite(value) && value > 0 && value < floor;
}

const SENSITIVE_CYCLE_METRICS = Object.freeze([
  'active', 'carryover', 'overdue', 'watermelon', 'stopRuleDue', 'stoppedBet', 'unmeasured',
]);

function cycleMetricsNeedSuppression(cycle, floor) {
  return cycle?.metrics?.suppressed === true
    || SENSITIVE_CYCLE_METRICS.some((key) => isSmallCell(cycle?.metrics?.[key], floor))
    || (cycle?.byAltitude || []).some((row) => isSmallCell(row?.activeN, floor))
    || (cycle?.byBet || []).some((row) => isSmallCell(row?.activeN, floor));
}

function cycleForecastNeedsSuppression(cycle, floor) {
  return cycleMetricsNeedSuppression(cycle, floor)
    || cycle?.forecast?.refusal === 'small-cell-suppressed'
    || isSmallCell(cycle?.forecast?.settledN, floor);
}

function childSeatRows(active, seat, built, cellFloor) {
  if (seat?.readOnly || seat?.fullAccess || !seat?.childSeatIds?.length) {
    return { rows: [], hasSmallCell: false };
  }
  const children = seat.childSeatIds
    .map((id) => built.byId.get(id))
    .filter(Boolean)
    .slice(0, 80);
  const rawRows = children.map((child, index) => {
    const owned = active.filter((pact) => pact.toSeatId === child.id || child.scope?.has(pact.toSeatId));
    return {
      rank: child.rank,
      label: seat.rank >= 4 ? `Span ${index + 1}` : child.name,
      activeN: owned.length,
      overdueN: owned.filter((pact) => pact.dueOn && pact.dueOn < dayKey(built.now)).length,
      effortDays: roundEffort(owned.reduce((sum, pact) => sum + (Number(pact.effortDays) || 0), 0)),
    };
  });
  return {
    rows: rawRows,
    hasSmallCell: seat.rank >= 3 && rawRows.some((row) => isSmallCell(row.activeN, cellFloor)),
  };
}

function makeByAltitude(active, previous, today) {
  const previousIds = new Set(previous?.cohortPactIds || []);
  return ALTITUDES.map((altitude) => {
    const rows = active.filter((pact) => pact.altitudeKey === altitude.key);
    return {
      altitudeKey: altitude.key,
      rank: altitude.rank,
      activeN: rows.length,
      carryoverN: rows.filter((pact) => previousIds.has(pact.id)).length,
      overdueN: rows.filter((pact) => pact.dueOn && pact.dueOn < today).length,
      effortDays: roundEffort(rows.reduce((sum, pact) => sum + (Number(pact.effortDays) || 0), 0)),
      suppressed: false,
    };
  });
}

function makeBetRows(active, bets, totalEffort, releasedEffort, today, cellFloor, seat) {
  const visibleOwnerIds = seat?.fullAccess ? null : new Set([seat?.id, ...(seat?.scope || [])]);
  const ids = [...new Set([
    ...active.map((pact) => pact.strategyBetId).filter(Boolean),
    ...[...bets.values()]
      .filter((bet) => bet.status === 'active'
        && (seat?.fullAccess || visibleOwnerIds.has(bet.ownerId))
        && !stoppedBetFor({ strategyBetId: bet.id }, bets, today))
      .map((bet) => bet.id),
  ])].sort();
  const raw = ids.map((betId) => {
    const bet = bets.get(betId);
    const pacts = active.filter((pact) => pact.strategyBetId === betId);
    const effortDays = roundEffort(pacts.reduce((sum, pact) => sum + (Number(pact.effortDays) || 0), 0));
    const overdueN = pacts.filter((pact) => pact.dueOn && pact.dueOn < today).length;
    const eligible = Boolean(bet && bet.status === 'active' && !stoppedBetFor({ strategyBetId: betId }, bets, today));
    const weight = eligible ? Math.max(0, Number(bet.weightPct) || 0) : 0;
    return {
      betId,
      betTitle: bet?.title || 'Unassigned strategic bet',
      activeN: pacts.length,
      overdueN,
      effortDays,
      declaredWeightPct: eligible ? Math.max(0, Number(bet.weightPct) || 0) : null,
      observedEffortSharePct: totalEffort > 0 ? round(effortDays / totalEffort * 100, 1) : null,
      releasedEffortDays: pacts.some((pact) => stoppedBetFor(pact, bets, today)
        || bets.get(betId)?.status === 'retired') ? effortDays : 0,
      eligibleWeight: weight,
    };
  });
  const weightTotal = raw.reduce((sum, row) => sum + row.eligibleWeight, 0);
  const rows = raw.map((row) => ({
    betId: row.betId,
    betTitle: row.betTitle,
    activeN: row.activeN,
    overdueN: row.overdueN,
    effortDays: row.effortDays,
    declaredWeightPct: row.declaredWeightPct,
    observedEffortSharePct: row.observedEffortSharePct,
    releasedEffortDays: row.releasedEffortDays,
    projectedEffortDays: roundEffort((row.releasedEffortDays > 0 ? 0 : row.effortDays)
      + (weightTotal > 0 ? releasedEffort * row.eligibleWeight / weightTotal : 0)),
    suppressed: false,
  }));
  const hasSmallCell = raw.some((row) => isSmallCell(row.activeN, cellFloor));
  return { rows, hasSmallCell };
}

function historicalReference(seat, scopedPacts, evidenceFloor, today) {
  const altitudes = new Set(seat.rank >= 5 ? ALTITUDES.map((entry) => entry.key) : [seat.altitudeKey]);
  const settled = scopedPacts.filter((pact) => pact.status === 'settled'
    && pact.gradedOutcome
    && altitudes.has(pact.altitudeKey)
    && pact.gradedOn
    && pact.gradedOn < today);
  const deliveredN = settled.filter((pact) => pact.gradedOutcome === 'delivered').length;
  const n = settled.length;
  const interval = wilson(deliveredN, n);
  const refusal = n === 0 ? 'no-settled-history' : n < evidenceFloor ? 'below-evidence-floor' : 'none';
  return {
    settledN: n,
    deliveredN,
    deliveryRatePct: refusal === 'none' ? round(deliveredN / n * 100, 1) : null,
    lowerPct: refusal === 'none' ? interval.lowerPct : null,
    upperPct: refusal === 'none' ? interval.upperPct : null,
    brier: refusal === 'none' ? strategyCycleBrier(settled, evidenceFloor) : null,
    refusal,
    basis: seat.rank >= 5 ? 'all-altitudes' : 'same-altitude',
  };
}

function withheldForecast(forecast) {
  return {
    ...forecast,
    settledN: 0,
    deliveredN: 0,
    deliveryRatePct: null,
    lowerPct: null,
    upperPct: null,
    brier: null,
    refusal: 'small-cell-suppressed',
  };
}

function compactReading(reading, {
  redactBetRows = false,
  suppressMetrics = false,
  suppressForecast = false,
  cellFloor = STRATEGY_CYCLE_DEFAULTS.strategyCycleCellFloor,
} = {}) {
  if (!reading) return null;
  const altitudeSmall = (reading.byAltitude || []).some((row) => isSmallCell(row.activeN, cellFloor));
  const betSmall = (reading.byBet || []).some((row) => isSmallCell(row.activeN, cellFloor));
  const suppressAllMetrics = suppressMetrics || (redactBetRows && (altitudeSmall || betSmall));
  const metrics = suppressAllMetrics
    ? Object.fromEntries(Object.keys(reading.metrics || {}).map((key) => [key, key === 'suppressed' ? true : 0]))
    : { ...reading.metrics };
  const suppressAltitudeRows = suppressAllMetrics;
  const suppressBetDetails = redactBetRows || suppressAllMetrics;
  const byAltitude = (reading.byAltitude || []).map((row) => (suppressAltitudeRows
    ? { ...row, activeN: 0, carryoverN: 0, overdueN: 0, effortDays: 0, suppressed: true }
    : { ...row }));
  const byBet = suppressBetDetails ? [] : (reading.byBet || []).map((row) => ({ ...row }));
  const suppressGrade = suppressAllMetrics || isSmallCell(reading.grade?.settledN, cellFloor);
  return {
    id: reading.id,
    altitudeKey: reading.altitudeKey,
    rank: reading.rank,
    status: reading.status,
    frozenOn: reading.frozenOn,
    reviewOn: reading.reviewOn,
    periodStart: reading.periodStart,
    windowDays: reading.windowDays,
    metrics,
    forecast: suppressForecast || reading.forecast?.refusal === 'small-cell-suppressed'
      || isSmallCell(reading.forecast?.settledN, cellFloor)
      ? withheldForecast(reading.forecast || {})
      : { ...reading.forecast },
    byAltitude,
    byBet,
    grade: reading.grade && !suppressGrade ? { ...reading.grade } : null,
  };
}

function scopeVisibleCycles(state, seat) {
  const cycles = Array.isArray(state?.strategyCycles) ? state.strategyCycles : [];
  if (seat?.readOnly) return [];
  const scopeId = scopeIdFor(seat);
  if (seat?.fullAccess) return cycles;
  if (seat?.isLeader || seat.rank >= 4) return cycles.filter((cycle) => cycle?.scopeSeatId === scopeId);
  return cycles.filter((cycle) => cycle && (cycle.scopeSeatId === seat.id || seat.scope?.has(cycle.scopeSeatId)));
}

function liveSnapshotData(state, seat, built, now, previous, { id = null, reviewOn = null } = {}) {
  const today = dayKey(now);
  const settings = normalizeStrategyCycleSettings(state?.settings || {});
  const scopedPacts = pactsInSeatScope(state, seat);
  const active = scopedPacts.filter(isActivePact);
  const bets = betIndex(state);
  const raw = rawMetrics(active, previous, bets, today, Number(state?.settings?.catchballWatermelonGapPct) || 25);
  const child = childSeatRows(active, seat, built, settings.strategyCycleCellFloor);
  const byAltitude = makeByAltitude(active, previous, today);
  const byBet = makeBetRows(active, bets, raw.effortDays, raw.releasedEffortDays, today, settings.strategyCycleCellFloor, seat);
  const aggregateTier = seat.rank >= 3;
  const smallAltitude = aggregateTier && byAltitude.some((row) => isSmallCell(row.activeN, settings.strategyCycleCellFloor));
  const smallBet = aggregateTier && byBet.hasSmallCell;
  const sensitiveCounts = ['active', 'carryover', 'overdue', 'watermelon', 'stopRuleDue', 'stoppedBet', 'unmeasured'];
  const suppressAggregate = aggregateTier && (child.hasSmallCell || smallAltitude || smallBet
    || sensitiveCounts.some((key) => isSmallCell(raw[key], settings.strategyCycleCellFloor)));
  const metrics = {
    active: suppressAggregate ? 0 : raw.active,
    carryover: suppressAggregate ? 0 : raw.carryover,
    overdue: suppressAggregate ? 0 : raw.overdue,
    watermelon: suppressAggregate ? 0 : raw.watermelon,
    stopRuleDue: suppressAggregate ? 0 : raw.stopRuleDue,
    stoppedBet: suppressAggregate ? 0 : raw.stoppedBet,
    unmeasured: suppressAggregate ? 0 : raw.unmeasured,
    effortDays: suppressAggregate ? 0 : raw.effortDays,
    releasedEffortDays: suppressAggregate ? 0 : raw.releasedEffortDays,
    reviewEffortDays: suppressAggregate ? 0 : raw.reviewEffortDays,
    suppressed: suppressAggregate,
  };
  const safeAltitudeRows = byAltitude.map((row) => {
    const suppress = aggregateTier && (suppressAggregate || smallAltitude
      || isSmallCell(row.activeN, settings.strategyCycleCellFloor));
    return suppress ? { ...row, activeN: 0, carryoverN: 0, overdueN: 0, effortDays: 0, suppressed: true } : row;
  });
  const safeSpanRows = child.rows.map((row) => aggregateTier && (suppressAggregate || child.hasSmallCell)
    ? { rank: row.rank, label: row.label, activeN: null, overdueN: null, effortDays: null, suppressed: true }
    : { ...row, suppressed: false });
  const safeBetRows = seat.rank !== 3 || suppressAggregate
    ? []
    : byBet.rows.map((row) => ({ ...row }));
  const rawForecast = historicalReference(seat, scopedPacts, settings.strategyCycleEvidenceFloor, today);
  const suppressForecast = aggregateTier && (suppressAggregate
    || isSmallCell(rawForecast.settledN, settings.strategyCycleCellFloor));
  const forecast = suppressForecast ? withheldForecast(rawForecast) : rawForecast;
  const previousIds = new Set(previous?.cohortPactIds || []);
  const detailAllowed = seat.rank <= 2 && !seat.readOnly;
  const detailRows = detailAllowed
    ? active.slice(0, 100).map((pact) => {
      const bet = bets.get(pact.strategyBetId);
      return {
        pactId: pact.id,
        title: pact.title,
        status: pact.status,
        dueOn: pact.dueOn,
        altitudeKey: pact.altitudeKey,
        effortDays: roundEffort(pact.effortDays),
        overdue: Boolean(pact.dueOn && pact.dueOn < today),
        carryover: previousIds.has(pact.id),
        stoppedBet: bets.get(pact.strategyBetId)?.status === 'retired',
        strategyBetId: seat.rank === 3 ? (bet?.id || null) : null,
        strategyBetTitle: seat.rank === 3 ? (bet?.title || '') : '',
      };
    })
    : [];
  const cohort = active.slice(0, STRATEGY_CYCLE_LIMITS.cohortPacts);
  const selectedReviewOn = validReviewDay(reviewOn, today, seat.horizonDays || 30);
  const start = previous?.reviewOn && previous.reviewOn < today ? previous.reviewOn : today;
  const reading = id ? normalizeStrategyCycleReading({
    id,
    scopeSeatId: scopeIdFor(seat),
    altitudeKey: seat.altitudeKey || 'chief',
    rank: seat.rank,
    status: 'frozen',
    frozenOn: today,
    reviewOn: selectedReviewOn,
    periodStart: start,
    windowDays: daysBetween(start, selectedReviewOn) || 1,
    sourceRevision: state?.meta?.revision || 0,
    previousId: previous?.id || null,
    cohortPactIds: cohort.map((pact) => pact.id),
    metrics,
    forecast,
    byAltitude: safeAltitudeRows,
    byBet: safeBetRows,
    grade: null,
    createdAt: now.toISOString(),
  }) : null;
  return {
    today,
    seat,
    scopedPacts,
    activePacts: active,
    metrics,
    forecast,
    byAltitude: safeAltitudeRows,
    byBet: safeBetRows,
    spans: safeSpanRows,
    details: detailRows,
    reading,
    overflow: active.length > STRATEGY_CYCLE_LIMITS.cohortPacts,
    scopeId: scopeIdFor(seat),
    settings,
  };
}

function validReviewDay(value, today, horizonDays) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const delta = daysBetween(today, value);
    if (delta !== null && delta >= 1 && delta <= STRATEGY_CYCLE_LIMITS.horizonDays) return value;
    return null;
  }
  return addDays(today, Math.max(1, Math.min(STRATEGY_CYCLE_LIMITS.horizonDays, Number(horizonDays) || 30)));
}

function latestCycle(cycles, scopeId) {
  return cycles.filter((cycle) => cycle && cycle.scopeSeatId === scopeId).sort(sortedByDate)[0] || null;
}

/**
 * Build the privacy-sanitized current reading and historical cycle ledger for
 * the active seat. Unlike projectForSeat this API may compute aggregates from
 * withheld rows, but it returns no raw aggregate record or out-of-scope ID.
 */
export function buildStrategyCycleReport(state = {}, { now = new Date(), cycleId = null } = {}) {
  const built = buildSeats(state, { now, settings: state?.settings || {} });
  const seat = activeSeat(built);
  const cycles = [...scopeVisibleCycles(state, seat)].sort(sortedByDate);
  const scopeId = scopeIdFor(seat);
  const ownLatest = latestCycle(cycles, scopeId);
  const live = liveSnapshotData(state, seat, built, now, ownLatest);
  const aggregateTier = seat.rank >= 3;
  const highAltitude = seat.rank >= 4;
  const suppressAggregate = aggregateTier && live.metrics.suppressed;
  const historyCount = aggregateTier && isSmallCell(cycles.length, live.settings.strategyCycleCellFloor)
    ? null
    : cycles.length;
  const historyRows = cycles.slice(0, STRATEGY_CYCLE_LIMITS.historyRows);
  const focusedCycle = cycleId ? cycles.find((cycle) => cycle.id === cycleId) : null;
  if (focusedCycle && !historyRows.some((cycle) => cycle.id === focusedCycle.id)) historyRows.push(focusedCycle);
  const history = historyRows.map((cycle) => compactReading(cycle, {
    redactBetRows: highAltitude,
    suppressMetrics: aggregateTier && cycleMetricsNeedSuppression(cycle, live.settings.strategyCycleCellFloor),
    suppressForecast: aggregateTier && cycleForecastNeedsSuppression(cycle, live.settings.strategyCycleCellFloor),
    cellFloor: live.settings.strategyCycleCellFloor,
  }));
  return {
    ok: true,
    engineVersion: STRATEGY_CYCLE_ENGINE_VERSION,
    today: live.today,
    seat: {
      id: seat.id,
      label: seat.label,
      shortLabel: seat.shortLabel,
      altitudeKey: seat.altitudeKey || 'chief',
      rank: seat.rank,
      horizonDays: seat.horizonDays || 365,
      fullAccess: Boolean(seat.fullAccess),
      readOnly: Boolean(seat.readOnly),
      isLeader: Boolean(seat.isLeader),
    },
    playbook: STRATEGY_CYCLE_PLAYBOOK[seat.altitudeKey] || STRATEGY_CYCLE_PLAYBOOK.chief,
    disclosure: STRATEGY_CYCLE_DISCLOSURE,
    evidenceFloor: live.settings.strategyCycleEvidenceFloor,
    cellFloor: live.settings.strategyCycleCellFloor,
    autoPropagate: live.settings.strategyCycleAutoPropagate,
    live: {
      metrics: live.metrics,
      forecast: live.forecast,
      byAltitude: live.byAltitude,
      byBet: live.byBet,
      spans: live.spans,
      details: live.details,
      historyCount,
      latest: ownLatest ? compactReading(ownLatest, {
        redactBetRows: highAltitude,
        suppressMetrics: aggregateTier && (suppressAggregate
          || cycleMetricsNeedSuppression(ownLatest, live.settings.strategyCycleCellFloor)),
        suppressForecast: aggregateTier && cycleForecastNeedsSuppression(ownLatest, live.settings.strategyCycleCellFloor),
        cellFloor: live.settings.strategyCycleCellFloor,
      }) : null,
      overflow: live.overflow,
    },
    history,
  };
}

/** Construct one normalized frozen snapshot; refuses when the contract is exceeded. */
export function buildStrategyCycleSnapshot(state = {}, { id, now = new Date(), reviewOn = null } = {}) {
  const built = buildSeats(state, { now, settings: state?.settings || {} });
  const seat = activeSeat(built);
  if (seat.readOnly) return { ok: false, error: 'The declared seat is unresolved and read-only. Choose a valid operating altitude before freezing a strategy cycle.' };
  const cycles = scopeVisibleCycles(state, seat);
  const scopeId = scopeIdFor(seat);
  const previous = latestCycle(cycles, scopeId);
  const live = liveSnapshotData(state, seat, built, now, previous, { id, reviewOn });
  if (live.overflow) return { ok: false, error: `This seat has more than ${STRATEGY_CYCLE_LIMITS.cohortPacts} active Catchball commitments. Narrow the cycle to a lower operating seat; the system will not silently truncate its evidence.` };
  const nextReview = validReviewDay(reviewOn, live.today, seat.horizonDays || 30);
  if (!nextReview) return { ok: false, error: `Choose a review date 1–${STRATEGY_CYCLE_LIMITS.horizonDays} days in the future.` };
  const reading = liveSnapshotData(state, seat, built, now, previous, { id, reviewOn: nextReview }).reading;
  if (!reading) return { ok: false, error: 'The frozen cycle did not pass its schema contract.' };
  return { ok: true, reading };
}

/** Compact, privacy-safe report copy. */
export function strategyCycleBriefText(report) {
  if (!report?.ok) return '';
  const m = report.live.metrics;
  const value = (number) => m.suppressed ? 'withheld (small-cell boundary)' : String(number);
  const reference = report.live.forecast.refusal === 'none'
    ? `${report.live.forecast.deliveryRatePct}% (95% Wilson ${report.live.forecast.lowerPct}–${report.live.forecast.upperPct}%, n=${report.live.forecast.settledN})`
    : `withheld (${report.live.forecast.refusal}, n=${report.live.forecast.settledN})`;
  return [
    `# Strategy renewal · ${report.seat.label} · ${report.today}`,
    '',
    report.playbook.focus,
    '',
    `- Active Catchball commitments: ${value(m.active)}.`,
    `- Carryover / overdue: ${value(m.carryover)} / ${value(m.overdue)}.`,
    `- Effort attached to active commitments: ${m.suppressed ? 'withheld' : `${m.effortDays} person-days`}.`,
    `- Explicit stop-rule / retired-bet exposure: ${value(m.stopRuleDue)} / ${value(m.stoppedBet)} commitment(s).`,
    `- Historical delivery reference: ${reference}; it is not a forecast or causal estimate.`,
    '',
    `- Decision question: ${report.playbook.decision}`,
    `- Reinvestment scenario: no budget, bet, owner, date or pact is changed by the engine.`,
    `- Disclosure: ${report.disclosure.local}`,
  ].join('\n');
}

/** A dedicated seat-scoped CSV, not a full-workspace export. */
export function strategyCycleCsvRows(report) {
  if (!report?.ok) return [];
  const m = report.live.metrics;
  const withheld = m.suppressed;
  const blank = (value) => (value === null || value === undefined ? '' : value);
  const rows = report.live.byAltitude.map((cell) => ({
    row_kind: 'altitude',
    altitude: cell.altitudeKey,
    rank: cell.rank,
    active_pacts: cell.suppressed || withheld ? '' : cell.activeN,
    carryover_pacts: cell.suppressed || withheld ? '' : cell.carryoverN,
    overdue_pacts: cell.suppressed || withheld ? '' : cell.overdueN,
    effort_days: cell.suppressed || withheld ? '' : cell.effortDays,
    delivery_reference_pct: report.live.forecast.refusal === 'none' && !withheld
      ? blank(report.live.forecast.deliveryRatePct) : '',
    delivery_interval_low_pct: report.live.forecast.refusal === 'none' && !withheld
      ? blank(report.live.forecast.lowerPct) : '',
    delivery_interval_high_pct: report.live.forecast.refusal === 'none' && !withheld
      ? blank(report.live.forecast.upperPct) : '',
    settled_n: report.live.forecast.refusal === 'none' && !withheld ? report.live.forecast.settledN : '',
    verdict: cell.suppressed || withheld ? 'withheld-small-cell'
      : report.live.forecast.refusal === 'none' ? 'historical-reference' : report.live.forecast.refusal,
  }));
  rows.push({
    row_kind: 'workspace',
    altitude: report.seat.altitudeKey,
    rank: report.seat.rank,
    active_pacts: withheld ? '' : m.active,
    carryover_pacts: withheld ? '' : m.carryover,
    overdue_pacts: withheld ? '' : m.overdue,
    effort_days: withheld ? '' : m.effortDays,
    delivery_reference_pct: report.live.forecast.refusal === 'none' && !withheld ? report.live.forecast.deliveryRatePct : '',
    delivery_interval_low_pct: report.live.forecast.refusal === 'none' && !withheld ? report.live.forecast.lowerPct : '',
    delivery_interval_high_pct: report.live.forecast.refusal === 'none' && !withheld ? report.live.forecast.upperPct : '',
    settled_n: report.live.forecast.refusal === 'none' && !withheld ? report.live.forecast.settledN : '',
    verdict: withheld ? 'withheld-small-cell' : report.live.forecast.refusal,
  });
  if (!withheld && report.seat.rank === 3) {
    for (const bet of report.live.byBet) rows.push({
      row_kind: 'bet',
      altitude: report.seat.altitudeKey,
      rank: report.seat.rank,
      active_pacts: bet.activeN,
      carryover_pacts: '',
      overdue_pacts: bet.overdueN,
      effort_days: bet.effortDays,
      delivery_reference_pct: '',
      delivery_interval_low_pct: '',
      delivery_interval_high_pct: '',
      settled_n: '',
      verdict: `projected-effort=${bet.projectedEffortDays}; declared-weight=${bet.declaredWeightPct ?? 'unmeasured'}`,
    });
  }
  return rows;
}

/**
 * Return the lowest set of non-sensitive facts needed by the post-commit
 * renewal rule. Not used by views; kept here to share the seat/catchball join.
 */
export function retiredBetPacts(state, betId, { now = new Date() } = {}) {
  const built = buildSeats(state, { now, settings: state?.settings || {} });
  const seat = activeSeat(built);
  const bet = (state?.strategyBets || []).find((row) => row && row.id === betId);
  if (!bet || bet.status !== 'retired') return { seat, bet: null, pacts: [], ancestors: [], overflow: false, totalCount: 0 };
  const allPacts = (Array.isArray(state?.catchballPacts) ? state.catchballPacts : [])
    .filter((pact) => pact && pact.strategyBetId === betId && isActivePact(pact)
      && (seat.fullAccess || (!seat.readOnly && (pact.toSeatId === seat.id || seat.scope?.has(pact.toSeatId)))));
  const pacts = allPacts.slice(0, STRATEGY_CYCLE_LIMITS.cohortPacts);
  const ancestorIds = new Set();
  for (const pact of pacts) {
    let current = built.chain.byId.get(pact.toSeatId);
    let guard = 0;
    while (current?.parentId && current.parentId !== 'leader' && guard < 100) {
      ancestorIds.add(current.parentId);
      current = built.chain.byId.get(current.parentId);
      guard += 1;
    }
  }
  return {
    seat, bet, pacts, ancestors: [...ancestorIds],
    overflow: allPacts.length > STRATEGY_CYCLE_LIMITS.cohortPacts,
    totalCount: allPacts.length,
  };
}

export function strategyCycleDefaults() {
  return { ...STRATEGY_CYCLE_DEFAULTS };
}
