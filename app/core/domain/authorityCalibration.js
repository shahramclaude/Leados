/**
 * app/core/domain/authorityCalibration.js — the Authority Calibration Ledger
 * (Schema v85, ADR-0079).
 *
 * A mandate contract that reaches a terminal state is one Bernoulli trial:
 * did the authority the sender granted actually hold?
 *
 *   completed  → held      (the receiver delivered and the sender verified)
 *   returned   → not held  (the receiver handed it back)
 *   expired    → not held  (expiry passed without a verified outcome)
 *   revoked    → not held  (authority withdrawn before delivery)
 *
 * Trials group by (action class × receiver altitude), so the workspace can
 * answer, for each kind of right at each altitude: how often does authority
 * actually hold, and is the expectation of it calibrated? The subject of
 * every figure is a span and an action class — never a person, never a rating
 * of an individual.
 *
 * Every figure is re-derived on read from terminal mandates, so a calibration
 * figure can never drift from the record it describes. Below the declared
 * evidence floor counts are shown and the rate is refused — never a decimal
 * invented from a cell of one.
 *
 * Pure module: no DOM, storage, network, Math.random or wall clock beyond
 * the injected `now`.
 */

import { dayKey } from '../time.js';
import { ALTITUDES, altitudeByKey } from './chainRegistry.js';
import { buildSeats } from './seat.js';
import { MANDATE_ACTIONS } from './mandateRegistry.js';

export const AUTHORITY_CALIBRATION_ENGINE_VERSION = 'authority-calibration-2026.11-v1';

export const AUTHORITY_CALIBRATION_CONVENTIONS = Object.freeze({
  floorN: 5,
  reliabilityFloorPct: 60,
  autoPropagate: true,
});

const TERMINAL_STATUSES = Object.freeze(['completed', 'returned', 'expired', 'revoked']);
const HELD_STATUS = 'completed';

export function isTerminalMandate(m) {
  return Boolean(m && TERMINAL_STATUSES.includes(m.status));
}

export function mandateHeld(m) {
  return m.status === HELD_STATUS;
}

export function authorityCalibrationConventions(settings = {}) {
  const int = (key, min, max, fallback) => {
    const n = Math.round(Number(settings[key]));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };
  return {
    floorN: int('authorityCalibrationFloorN', 1, 50, AUTHORITY_CALIBRATION_CONVENTIONS.floorN),
    reliabilityFloorPct: int(
      'authorityCalibrationReliabilityFloorPct',
      1,
      100,
      AUTHORITY_CALIBRATION_CONVENTIONS.reliabilityFloorPct,
    ),
    autoPropagate: settings.authorityCalibrationAutoPropagate !== false,
  };
}

/** Wilson (1927) score interval at 95%, returns [lo, hi] in [0,1]. */
function wilson95(hits, n) {
  if (n <= 0) return [null, null];
  const z = 1.959963984540054;
  const p = hits / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)) / denom;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

/** The altitude of the seat a mandate was granted to, or null. */
function receiverAltitudeKey(mandate, built) {
  const seat = mandate.toSeatId ? built.byId.get(mandate.toSeatId) : null;
  return seat && seat.altitudeKey ? seat.altitudeKey : null;
}

/**
 * Collect every terminal mandate as one trial, grouped by
 * (action class × receiver altitude). Each trial carries a sequential,
 * out-of-sample forecast: the cell's hold rate computed from trials that
 * closed strictly before it — never itself, never the future.
 */
function collectTrials(state, built, { now, settings, seatId } = {}) {
  const conv = authorityCalibrationConventions(settings);
  const mandates = Array.isArray(state.mandates) ? state.mandates : [];
  const inScope = (m) => {
    if (!m) return false;
    if (!isTerminalMandate(m)) return false;
    if (seatId) {
      const seat = built.byId.get(seatId);
      if (!seat) return false;
      if (
        !seat.fullAccess
        && !seat.scope.has(m.toSeatId)
        && m.fromSeatId !== seat.id
      ) {
        return false;
      }
    }
    return true;
  };
  const trials = mandates
    .filter(inScope)
    .map((m) => {
      const actionClass =
        Array.isArray(m.actions) && m.actions.length ? m.actions[0] : 'other';
      return {
        mandateId: m.id,
        actionClass,
        altitudeKey: receiverAltitudeKey(m, built),
        toSeatId: m.toSeatId,
        fromSeatId: m.fromSeatId,
        held: mandateHeld(m),
        terminalStatus: m.status,
        closedAt: m.closedAt || m.updatedAt || m.createdAt,
        closedOn: (m.closedAt || m.updatedAt || m.createdAt || '').slice(0, 10),
        effortDays: m.effortDays,
      };
    });
  trials.sort(
    (a, b) =>
      a.closedOn.localeCompare(b.closedOn) || a.mandateId.localeCompare(b.mandateId),
  );

  // Group by (actionClass, altitudeKey). Sequential forecast = the cell's hold
  // rate from strictly-prior trials, so each trial is graded against what the
  // cell knew before it closed — an out-of-sample forecast.
  const byCell = new Map();
  for (const trial of trials) {
    const key = `${trial.actionClass}|${trial.altitudeKey || 'unassigned'}`;
    let cell = byCell.get(key);
    if (!cell) {
      cell = { actionClass: trial.actionClass, altitudeKey: trial.altitudeKey, trials: [] };
      byCell.set(key, cell);
    }
    const prior = cell.trials.filter(
      (t) =>
        t.closedOn < trial.closedOn ||
        (t.closedOn === trial.closedOn && t.mandateId < trial.mandateId),
    );
    const priorHeld = prior.filter((t) => t.held).length;
    trial.forecastPct = prior.length ? (priorHeld / prior.length) * 100 : null;
    cell.trials.push(trial);
  }
  return { trials, byCell, conv };
}

/** Build one cell's calibration reading. */
function buildCell(actionClass, altitudeKey, cell, conv) {
  const altitude = altitudeByKey(altitudeKey);
  const altitudeLabel = altitude ? altitude.label : altitudeKey === 'unassigned' ? 'Unassigned' : '—';
  const trials = cell.trials;
  const n = trials.length;
  const completedN = trials.filter((t) => t.held).length;
  const returnedN = trials.filter((t) => t.terminalStatus === 'returned').length;
  const expiredN = trials.filter((t) => t.terminalStatus === 'expired').length;
  const revokedN = trials.filter((t) => t.terminalStatus === 'revoked').length;
  const holdRate = n ? completedN / n : null;
  const holdRatePct = holdRate === null ? null : Math.round(holdRate * 1000) / 10;
  const refused = n < conv.floorN;
  const [wilsonLo, wilsonHi] = holdRate !== null && !refused ? wilson95(completedN, n) : [null, null];
  const forecastTrials = trials.filter((t) => t.forecastPct !== null);
  const brier = forecastTrials.length
    ? forecastTrials.reduce((s, t) => s + ((t.forecastPct / 100 - Number(t.held)) ** 2), 0) / forecastTrials.length
    : null;
  const brierReference = holdRate !== null ? holdRate * (1 - holdRate) : null;
  const brierSkill =
    brier !== null && brierReference && brierReference > 0 ? 1 - brier / brierReference : null;
  const belowFloor = holdRatePct !== null && holdRatePct < conv.reliabilityFloorPct;
  return {
    actionClass,
    actionLabel:
      Object.values(MANDATE_ACTIONS).includes(actionClass) ? actionClass : 'other',
    altitudeKey,
    altitudeLabel,
    n,
    completedN,
    returnedN,
    expiredN,
    revokedN,
    holdRate,
    holdRatePct,
    refused,
    floorN: conv.floorN,
    reliabilityFloorPct: conv.reliabilityFloorPct,
    wilsonLo: wilsonLo === null ? null : Math.round(wilsonLo * 1000) / 10,
    wilsonHi: wilsonHi === null ? null : Math.round(wilsonHi * 1000) / 10,
    brier: brier === null ? null : Math.round(brier * 10000) / 10000,
    brierSkill: brierSkill === null ? null : Math.round(brierSkill * 1000) / 10,
    brierReference: brierReference === null ? null : Math.round(brierReference * 10000) / 10000,
    forecastTrials: forecastTrials.length,
    belowFloor,
    members: trials.map((t) => ({
      mandateId: t.mandateId,
      held: t.held,
      forecastPct: t.forecastPct === null ? null : Math.round(t.forecastPct * 10) / 10,
      terminalStatus: t.terminalStatus,
      closedOn: t.closedOn,
    })),
  };
}

/** Pool every cell at one altitude into a single reading. */
function poolByAltitude(altitudeKey, cells, conv) {
  const trials = cells.flatMap((cell) => cell.members);
  const n = trials.length;
  const completedN = trials.filter((t) => t.held).length;
  const holdRate = n ? completedN / n : null;
  const holdRatePct = holdRate === null ? null : Math.round(holdRate * 1000) / 10;
  const refused = n < conv.floorN;
  const [wilsonLo, wilsonHi] = holdRate !== null && !refused ? wilson95(completedN, n) : [null, null];
  // Fréchet lower bound on "at least one cell at this altitude reliably holds":
  // assumption-free, equals the max cell hold rate at this altitude. Printed
  // beside the independence reference 1 − Π(1 − pᵢ), which assumes cell
  // independence — an assumption the workspace does not make.
  const cellRates = cells.map((c) => c.holdRate).filter((r) => r !== null);
  const frechetLowerBoundPct =
    holdRatePct === null ? null : Math.round(Math.max(0, ...cellRates.map((r) => r * 100)) * 10) / 10;
  const independencePct =
    cellRates.length
      ? Math.round((1 - cellRates.reduce((p, r) => p * (1 - r), 1)) * 1000) / 10
      : null;
  return {
    altitudeKey,
    altitudeLabel: altitudeByKey(altitudeKey)?.label || '—',
    n,
    completedN,
    holdRate,
    holdRatePct,
    refused,
    floorN: conv.floorN,
    wilsonLo: wilsonLo === null ? null : Math.round(wilsonLo * 1000) / 10,
    wilsonHi: wilsonHi === null ? null : Math.round(wilsonHi * 1000) / 10,
    cellsN: cells.length,
    frechetLowerBoundPct,
    independencePct,
    members: trials.map((t) => ({
      mandateId: t.mandateId,
      actionClass: t.actionClass,
      held: t.held,
      terminalStatus: t.terminalStatus,
      closedOn: t.closedOn,
    })),
  };
}

/** The full calibration report. `seatId` scopes the reading to one seat's span. */
export function calibrateAuthority(state = {}, { now = new Date(), settings = state.settings || {}, seatId = null } = {}) {
  const built = buildSeats(state, { now, settings });
  const conv = authorityCalibrationConventions(settings);
  const { byCell } = collectTrials(state, built, { now, settings, seatId });

  const cells = [];
  for (const [key, cell] of byCell) {
    const [actionClass, altitudeKey] = key.split('|');
    cells.push(buildCell(actionClass, altitudeKey, cell, conv));
  }
  cells.sort((a, b) => b.holdRatePct - a.holdRatePct || b.n - a.n || String(a.actionClass).localeCompare(String(b.actionClass)));

  // Pool by receiver altitude so each altitude sees its own hold rate, and the
  // level above sees the pooled figure without any re-entry.
  const byAltitude = new Map();
  for (const cell of cells) {
    const group = byAltitude.get(cell.altitudeKey) || [];
    group.push(cell);
    byAltitude.set(cell.altitudeKey, group);
  }
  const altitudeReadings = ALTITUDES.map((altitude) => {
    const cellsAtAltitude = byAltitude.get(altitude.key) || [];
    return poolByAltitude(altitude.key, cellsAtAltitude, conv);
  });

  const allTrials = cells.flatMap((cell) => cell.members);
  const totalTrials = allTrials.length;
  const totalCompleted = allTrials.filter((t) => t.held).length;
  const overallHoldRate = totalTrials ? totalCompleted / totalTrials : null;
  const overallHoldRatePct = overallHoldRate === null ? null : Math.round(overallHoldRate * 1000) / 10;
  const overallRefused = totalTrials < conv.floorN;

  const scoringCells = cells.filter((cell) => cell.brier !== null);
  const overallBrier = scoringCells.length
    ? Math.round(
        scoringCells.reduce((sum, cell) => sum + cell.brier * cell.forecastTrials, 0) /
          scoringCells.reduce((sum, cell) => sum + cell.forecastTrials, 0) *
          10000,
      ) / 10000
    : null;

  const scoredBelowFloor = cells.filter((cell) => !cell.refused && cell.belowFloor);
  const scoredAtOrAboveFloor = cells.filter((cell) => !cell.refused && !cell.belowFloor);

  return {
    engineVersion: AUTHORITY_CALIBRATION_ENGINE_VERSION,
    now: dayKey(now),
    conv,
    seatId,
    cells,
    altitudeReadings,
    totalTrials,
    totalCompleted,
    overallHoldRate,
    overallHoldRatePct,
    overallRefused,
    overallBrier,
    scoringCells: scoringCells.length,
    scoredBelowFloor: scoredBelowFloor.length,
    scoredAtOrAboveFloor: scoredAtOrAboveFloor.length,
    refusedCells: cells.filter((cell) => cell.refused).length,
    caveats: [
      'A terminal mandate is one trial: completed means the authority held; returned, expired or revoked means it did not.',
      'Each trial is graded against the cell\u2019s hold rate from strictly-prior terminals — an out-of-sample, sequential forecast, never a declared probability.',
      'Figures are re-derived on read from terminal mandates; nothing is stored as a frozen claim and nothing is back-filled.',
      `Below ${conv.floorN} trials in a cell, the hold rate is refused and counts only are shown.`,
      'No person is rated or ranked. The subject of every figure is a span and an action class.',
    ],
  };
}

/** Read-side signals: where authority is holding, where it is not, and where the record cannot yet say. */
export function authorityCalibrationSignals(report = {}) {
  const signals = [];
  const push = (signal) => signals.push({ domain: 'Authority calibration', ...signal });

  const cells = report.cells || [];
  const breaching = cells.filter((cell) => !cell.refused && cell.belowFloor);
  if (breaching.length) {
    const worst = breaching[0];
    push({
      ruleId: 'ACL-01',
      severity: worst.holdRatePct <= (worst.reliabilityFloorPct || 60) / 2 ? 3 : 2,
      confidence: 'high',
      title: `Authority is not holding in ${breaching.length} cell(s) below the reliability floor`,
      detail: `“${worst.actionLabel}” at ${worst.altitudeLabel} holds ${worst.holdRatePct}% of ${cellN(worst)} terminal contract(s), below the ${worst.reliabilityFloorPct}% floor. The workspace learns which spans reliably hold which rights by grading contracts against delivered outcomes — this cell is not yet one of them.`,
      action: {
        label: 'Open the authority calibration ledger',
        route: '#/authority-calibration?panel=overview',
      },
      evidence: [`${worst.holdRatePct}% hold rate`, `${cellN(worst)} trial(s)`, `floor ${worst.reliabilityFloorPct}%`],
    });
  }

  const maturing = cells.filter((cell) => cell.n > 0 && cell.n < cell.floorN && cell.n >= 1);
  if (maturing.length) {
    push({
      ruleId: 'ACL-02',
      severity: 1,
      confidence: 'medium',
      title: `${maturing.length} cell(s) building toward the evidence floor`,
      detail: `These cells hold ${maturing.map((c) => c.n).join(', ')} terminal trial(s) against a floor of ${cellFloor(maturing)}. No rate is printed until a cell reaches ${cellFloor(maturing)} trials; until then the record is honest about what it cannot yet say.`,
      action: { label: 'Open the authority calibration ledger', route: '#/authority-calibration?panel=overview' },
      evidence: maturing.slice(0, 3).map((c) => `${c.actionLabel}@${c.altitudeLabel}: ${c.n}/${c.floorN}`),
    });
  }

  const unskilled = cells.filter((cell) => cell.brier !== null && cell.brierSkill !== null && cell.brierSkill < -0.1);
  if (unskilled.length) {
    push({
      ruleId: 'ACL-03',
      severity: 2,
      confidence: 'medium',
      title: `${unskilled.length} cell(s) where the running forecast under-performs the base rate`,
      detail: `A negative calibration skill means expecting authority to hold (the cell's own hold rate) predicts outcomes worse than always-forecasting the base rate. The cell's expectations are not yet calibrated to its results.`,
      action: { label: 'Open the authority calibration ledger', route: '#/authority-calibration?panel=overview' },
      evidence: unskilled.slice(0, 3).map((c) => `${c.actionLabel}@${c.altitudeLabel}: skill ${c.brierSkill * 100}pp`),
    });
  }

  if (report.totalTrials === 0) {
    push({
      ruleId: 'ACL-04',
      severity: 1,
      confidence: 'high',
      title: 'No terminal mandate contracts yet',
      detail: 'No accepted authority contract has reached a terminal state (completed, returned, expired or revoked). Grade accepts against delivered outcomes as they close; nothing is inferred before then.',
      action: { label: 'Open Decision Rights', route: '#/mandates' },
      evidence: ['0 terminal contracts'],
    });
  }

  return signals;
}

function cellN(cell) {
  return `${cell.completedN} held · ${cell.returnedN + cell.expiredN + cell.revokedN} not held`;
}
function cellFloor(cells) {
  return cells.length ? cells[0].floorN : 0;
}

export function authorityCalibrationAttentionCount(state = {}, now = new Date(), settings = null) {
  const report = calibrateAuthority(state, { now, settings: settings || state.settings || {} });
  return Math.min(99, report.scoredBelowFloor + (report.totalTrials === 0 ? 1 : 0) + report.refusedCells);
}

/** Identity-free brief: safe to paste upward or into a board pack. */
export function authorityCalibrationBrief(report = {}) {
  const parts = [];
  parts.push(`LeadOS · Authority Calibration Ledger · ${report.now || ''} · ${report.engineVersion || ''}`);
  parts.push(`${report.totalTrials || 0} terminal contract(s), ${report.totalCompleted || 0} held; overall hold rate ${report.overallHoldRatePct === null ? 'refused' : report.overallHoldRatePct}%.`);
  if (report.overallRefused) parts.push('Overall rate refused: below the evidence floor.');
  if (report.overallBrier !== null) parts.push(`Pooled Brier ${report.overallBrier} over ${report.scoringCells} scorable cell(s).`);
  if (report.scoredBelowFloor) parts.push(`${report.scoredBelowFloor} cell(s) below the reliability floor — authority not holding there.`);
  parts.push('No person is rated or ranked; every figure is a span and an action class.');
  return parts.join(' ');
}

export { wilson95 };
