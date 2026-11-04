/**
 * app/core/domain/carryover.js — Hoshin Carryover Terminal Engine
 * (`#/carryover`, Session 128, Schema v94, ADR-0088).
 *
 * The gap this module fills
 * -------------------------
 * Session 124's double-loop detector can prove that a Catchball pact was
 * settled as `thesis-invalidated` — faithful execution, falsified upstream
 * hypothesis. But the falsification stopped there. Nothing connected it to:
 *
 *  1. the bet's stop rule (`strategyBets.killCriterion`), which the Strategy
 *     Coherence Terminal only notices when the rule's date passes with no
 *     human verdict (RULE-SCO-04) — an invalidated pact could sit unexamined
 *     for a whole horizon while its bet stayed `active`;
 *  2. the resources the pact encumbered — `effortDays` of receiving-span
 *     capacity and the `committed` budget line (`encumberedLineId`) — which
 *     stayed locked after the thesis died; and
 *  3. the NEXT allocation cycle, which never saw the released person-days and
 *     budget authority again.
 *
 * The Hoshin Carryover Terminal closes that loop. One record per invalidated
 * pact carries the resolved bet, the resource bundle the settlement acts on
 * and the once-only later grade. A governed DACI settlement decision
 * (retire / revise / reaffirm) is opened per bet; retiring the bet releases
 * the encumbered budget line and person-day commitment in the SAME atomic
 * transaction, and the released capacity is printed for the next cycle.
 *
 * Named frameworks, implemented rather than gestured at
 * -----------------------------------------------------
 *  1. Double-loop learning (Argyris & Schön, 1978): the record exists only for
 *     pacts whose execution was exonerated — the falsified object is the
 *     *hypothesis*, never the team.
 *  2. Stop rules as falsifiability instruments (Popper, 1934; Rumelt 2011):
 *     every settlement decision prints the bet's dated kill criterion, its
 *     direction and whether the date passed, and refuses to settle a bet
 *     whose stop rule was never written (it says so).
 *  3. Commitment (encumbrance) accounting (public-sector budgetary control):
 *     release moves a `committed` line to `released` and never erases a
 *     recorded `spent` actual — the money that landed stays landed.
 *  4. Capital budgeting under one binding constraint (Bierman & Smidt 1966;
 *     Brealey, Myers & Allen): released person-days and budget authority are
 *     printed as NEXT-CYCLE supply at the receiving span, with the exact-sum
 *     roll-up and the Fréchet bounds left to the catchball module where the
 *     joint-delivery question belongs.
 *  5. Wilson (1927) 95% intervals, strictly-prior Brier skill and pooled
 *     base rates for the settlement calibration ledger — the same read-model
 *     discipline as the Authority Calibration Ledger (ADR-0079), applied to
 *     strategy bets instead of mandate contracts.
 *
 * Honesty boundaries enforced in code
 * -----------------------------------
 *  - A record is created only for pacts whose recorded settlement outcome is
 *    `thesis-invalidated`; an invalidation without exoneration is reported as
 *    `execution-invalidated` and is NOT carried over (that is a coaching
 *    problem, not a strategy problem).
 *  - A bet that cannot be resolved is carried with `betBasis: 'unresolved'`
 *    and its settlement decision is refused, not guessed.
 *  - Releasing a line that is already `spent` is refused and named
 *    `already-spent`; nothing is subtracted from a recorded actual.
 *  - Below the declared cell floor the calibration cell refuses its rate and
 *    prints counts only.
 *  - Nothing here rates a person. The unit of settlement is a bet, and the
 *    only person reference is the bet's accountable owner.
 *  - Pure module: no DOM, no storage, no network, no ambient clock.
 */

import { addDays, dayKey, daysBetween, weekKey, round } from '../time.js';
import { ALTITUDES, altitudeByKey, altitudeRank } from './chainRegistry.js';
import { activeSeat, buildSeats, canSee } from './seat.js';
import { buildLoadReport } from './load.js';
import { evaluateBudget, isBudgetOpen } from './finance.js';
import { wilsonInterval, classifyBowlerPact } from './catchball.js';
import { normalizeCatchballSettings } from './catchballSchema.js';
import { normalizeCarryoverSettings } from './carryoverSchema.js';
import {
  CARRYOVER_ENGINE_VERSION,
  CARRYOVER_STATUS_LABELS,
  CARRYOVER_VERDICT_KEYS,
  CARRYOVER_RELEASE_LABELS,
  CARRYOVER_SETTLEMENT_VERDICTS,
} from './carryoverRegistry.js';

const Z_95 = 1.959964;

function r1(n) {
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

function r2(n) {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function clampText(v, max = 120) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/* ------------------------------------------------------------------ */
/* Bet resolution                                                     */
/* ------------------------------------------------------------------ */

/**
 * Resolve the strategy bet an invalidated pact deployed, in declared order:
 *  1. `pact.strategyBetId` (direct);
 *  2. the pact's `linkedGoalId` through the strategy-tag graph;
 *  3. the pact's `tradeOffSourceId` through the strategy-tag graph;
 *  4. the pact's `premiseId` through premise → decision → `decides` links.
 * Each basis is printed; `unresolved` never guesses.
 */
export function resolvePactBet(state = {}, pact) {
  if (!pact || typeof pact !== 'object') return { betId: null, betBasis: 'unresolved' };
  const bets = Array.isArray(state.strategyBets) ? state.strategyBets : [];
  const tags = Array.isArray(state.strategyTags) ? state.strategyTags : [];
  const betIds = new Set(bets.map((b) => b && b.id).filter(Boolean));

  if (pact.strategyBetId && betIds.has(pact.strategyBetId)) {
    return { betId: pact.strategyBetId, betBasis: 'pact.strategyBetId' };
  }

  const tagFor = (entityType, entityId) => {
    if (!entityType || !entityId) return null;
    const tag = tags.find((t) => t && t.entityType === entityType && t.entityId === entityId && betIds.has(t.betId));
    return tag ? tag.betId : null;
  };

  if (pact.linkedGoalId) {
    const betId = tagFor('goal', pact.linkedGoalId);
    if (betId) return { betId, betBasis: 'goal-tag' };
  }
  if (pact.tradeOffSourceId) {
    const betId = tagFor(pact.tradeOffSourceType, pact.tradeOffSourceId);
    if (betId) return { betId, betBasis: 'trade-off-tag' };
  }
  if (pact.premiseId) {
    const premise = (state.premises || []).find((p) => p && p.id === pact.premiseId);
    const decisionId = premise && premise.decisionId ? premise.decisionId : null;
    if (decisionId) {
      const decision = (state.decisions || []).find((d) => d && d.id === decisionId);
      if (decision) {
        const link = (state.links || []).find((l) => l
          && l.sourceType === 'decision' && l.sourceId === decisionId
          && l.relation === 'decides' && l.targetType === 'strategy' && betIds.has(l.targetId));
        if (link) return { betId: link.targetId, betBasis: 'premise' };
      }
    }
  }
  return { betId: null, betBasis: 'unresolved' };
}

/* ------------------------------------------------------------------ */
/* Resource bundle                                                    */
/* ------------------------------------------------------------------ */

/**
 * The resource bundle a settlement decision acts on: the receiving span's
 * person-day commitment and the budget line the pact encumbered. `committedAmount`
 * is the line's committed amount AT RECORD TIME — frozen so the settlement
 * decision can be audited against what it was judging.
 */
export function carryoverResourceBundle(state = {}, pact) {
  const resource = {
    effortDays: Math.max(0, Number(pact?.effortDays) || 0),
    budgetId: pact?.budgetId || null,
    budgetName: null,
    encumberedLineId: pact?.encumberedLineId || null,
    currency: pact?.currency || null,
    committedAmount: null,
    lineStatus: null,
  };
  if (!pact?.budgetId || !pact?.encumberedLineId) return resource;
  const budget = (state.budgets || []).find((b) => b && b.id === pact.budgetId);
  if (!budget) return resource;
  resource.budgetName = budget.name || null;
  resource.currency = budget.currency || resource.currency;
  const line = (budget.lines || []).find((l) => l && l.id === pact.encumberedLineId);
  if (line) {
    resource.committedAmount = Number.isFinite(Number(line.committedAmount)) ? Number(line.committedAmount) : null;
    resource.lineStatus = line.status || null;
  }
  return resource;
}

/* ------------------------------------------------------------------ */
/* Bet stop-rule state                                                */
/* ------------------------------------------------------------------ */

/**
 * The bet's stop-rule state. Never guesses: a bet without a kill criterion is
 * `no-stop-rule`, not "fine".
 */
export function carryoverBetState(bet, now = new Date()) {
  if (!bet) return {
    hasBet: false,
    state: 'no-bet',
    stateLabel: 'No bet resolved',
    hasStopRule: false,
    metric: null,
    threshold: null,
    direction: null,
    checkOn: null,
    stopRulePassed: false,
    daysOverdue: null,
    verdictRecorded: false,
    verdict: null,
    verdictRecordedOn: null,
    retired: false,
    retiredOn: null,
  };
  const kill = bet.killCriterion || null;
  const today = dayKey(now);
  let stopRulePassed = false;
  let daysOverdue = null;
  if (kill && kill.checkOn && kill.checkOn < today) {
    stopRulePassed = true;
    const delta = daysBetween(kill.checkOn, today);
    if (Number.isFinite(delta)) daysOverdue = delta;
  }
  const verdict = bet.verdict || null;
  const retired = bet.status === 'retired';

  let state;
  let stateLabel;
  if (retired) {
    state = 'retired';
    stateLabel = `Retired ${bet.retiredOn || '—'}`;
  } else if (verdict) {
    state = 'verdict-recorded';
    stateLabel = `Verdict “${verdict.verdict}” recorded ${verdict.recordedOn}`;
  } else if (stopRulePassed) {
    state = 'stop-rule-due';
    stateLabel = `Stop rule due ${kill.checkOn}${daysOverdue ? ` (${daysOverdue}d overdue)` : ''}`;
  } else if (kill && kill.checkOn) {
    state = 'pending-stop-rule';
    stateLabel = `Stop rule due ${kill.checkOn}`;
  } else {
    state = 'no-stop-rule';
    stateLabel = 'No dated stop rule written';
  }

  return {
    hasBet: true,
    state,
    stateLabel,
    hasStopRule: Boolean(kill && kill.checkOn),
    metric: kill ? kill.metric || null : null,
    threshold: kill && kill.threshold !== null && kill.threshold !== undefined ? kill.threshold : null,
    direction: kill ? kill.direction : null,
    checkOn: kill ? kill.checkOn : null,
    stopRulePassed,
    daysOverdue,
    verdictRecorded: Boolean(verdict),
    verdict: verdict ? verdict.verdict : null,
    verdictRecordedOn: verdict ? verdict.recordedOn : null,
    retired,
    retiredOn: bet.retiredOn || null,
  };
}

/* ------------------------------------------------------------------ */
/* Report                                                             */
/* ------------------------------------------------------------------ */

function recordStatus(rec) {
  return CARRYOVER_STATUS_LABELS[rec.status] || rec.status;
}

function decisionOpenFor(draft, decisionId) {
  if (!decisionId) return false;
  const decision = (draft.decisions || []).find((d) => d && d.id === decisionId);
  return Boolean(decision && !decision.chosen);
}

/**
 * The full read model. One report, five altitude-differentiated views.
 */
export function buildCarryoverReport(state = {}, now = new Date(), settingsOverride = null) {
  const settings = normalizeCarryoverSettings({ ...(state.settings || {}), ...(settingsOverride || {}) });
  const conv = normalizeCatchballSettings(state.settings || {});
  const today = dayKey(now);
  const built = buildSeats(state, { now, settings: state.settings || {} });

  const pacts = Array.isArray(state.catchballPacts) ? state.catchballPacts : [];
  const records = Array.isArray(state.carryoverRecords) ? state.carryoverRecords : [];
  const bets = Array.isArray(state.strategyBets) ? state.strategyBets : [];
  const decisions = Array.isArray(state.decisions) ? state.decisions : [];

  // Pacts settled as thesis-invalidated — the carryover population.
  const invalidated = pacts.filter((p) => p && p.status === 'settled' && p.gradedOutcome === 'thesis-invalidated');
  const byPactId = new Map(records.map((r) => [r.pactId, r]));

  const recordViews = records.map((rec) => {
    const pact = pacts.find((p) => p && p.id === rec.pactId);
    const bet = rec.betId ? bets.find((b) => b && b.id === rec.betId) : null;
    const bowler = pact ? classifyBowlerPact(pact, now, conv) : null;
    const decision = rec.settlementDecisionId
      ? decisions.find((d) => d && d.id === rec.settlementDecisionId)
      : null;
    const owner = bet?.ownerId
      ? (state.people || []).find((p) => p && p.id === bet.ownerId)
      : null;
    const seat = owner && built.byId.has(owner.id) ? built.byId.get(owner.id) : null;
    return {
      record: rec,
      title: pact ? pact.title : `Pact ${rec.pactId}`,
      status: rec.status,
      statusLabel: recordStatus(rec),
      bet,
      betState: carryoverBetState(bet, now),
      betOwner: owner ? { id: owner.id, name: owner.name } : null,
      betAltitude: seat ? { key: seat.altitudeKey, rank: seat.rank, label: seat.label, shortLabel: seat.shortLabel } : null,
      bowler,
      decision,
      decisionOpen: decisionOpenFor(state, rec.settlementDecisionId),
      resource: rec.resource,
    };
  });

  // Invalidated pacts without a record yet (the settlement queue the rule fills).
  const uncovered = invalidated.filter((p) => !byPactId.has(p.id)).map((pact) => {
    const resolved = resolvePactBet(state, pact);
    const bet = resolved.betId ? bets.find((b) => b && b.id === resolved.betId) : null;
    const bowler = classifyBowlerPact(pact, now, conv);
    const owner = bet?.ownerId
      ? (state.people || []).find((pp) => pp && pp.id === bet.ownerId)
      : null;
    const seat = owner && built.byId.has(owner.id) ? built.byId.get(owner.id) : null;
    return {
      pact,
      title: pact.title,
      resolved,
      bet,
      betState: carryoverBetState(bet, now),
      betOwner: owner ? { id: owner.id, name: owner.name } : null,
      betAltitude: seat ? { key: seat.altitudeKey, rank: seat.rank, label: seat.label, shortLabel: seat.shortLabel } : null,
      bowler,
      resource: carryoverResourceBundle(state, pact),
    };
  });

  const pending = recordViews.filter((r) => r.record.status === 'pending-settlement');
  const decisionDue = recordViews.filter((r) => r.decisionOpen);
  const releaseDue = recordViews.filter((r) => (
    r.record.status === 'settled-pending-release'
    && r.record.settlementVerdict === 'retire-bet'
    && r.record.releaseOutcome === null
    && r.resource.encumberedLineId
    && r.resource.lineStatus === 'committed'
  ));
  const released = recordViews.filter((r) => r.record.releaseOutcome === 'released');
  const withheld = recordViews.filter((r) => r.record.releaseOutcome === 'withheld');

  // Bets involved, with their stop-rule state and attached records.
  const betRows = bets.map((bet) => {
    const attached = recordViews.filter((r) => r.bet && r.bet.id === bet.id);
    if (!attached.length) return null;
    const owner = bet.ownerId ? (state.people || []).find((p) => p && p.id === bet.ownerId) : null;
    const seat = owner && built.byId.has(owner.id) ? built.byId.get(owner.id) : null;
    return {
      bet,
      betState: carryoverBetState(bet, now),
      betOwner: owner ? { id: owner.id, name: owner.name } : null,
      betAltitude: seat ? { key: seat.altitudeKey, rank: seat.rank, label: seat.label, shortLabel: seat.shortLabel } : null,
      records: attached,
      invalidatedPacts: attached.length,
      encumberedDays: attached.reduce((s, r) => s + (r.resource.effortDays || 0), 0),
    };
  }).filter(Boolean);

  // Released capacity for the NEXT allocation cycle: exact sums by receiving
  // span and budget. Supply estimate, not a committed allocation.
  const spanMap = new Map();
  for (const r of released) {
    const key = r.resource.budgetId || `none:${r.record.pactId}`;
    const entry = spanMap.get(key) || {
      budgetId: r.resource.budgetId,
      budgetName: r.resource.budgetName,
      currency: r.resource.currency,
      effortDays: 0,
      amount: 0,
      records: 0,
    };
    entry.effortDays = round(entry.effortDays + (r.resource.effortDays || 0));
    entry.amount = round(entry.amount + (r.resource.committedAmount || 0));
    entry.records += 1;
    spanMap.set(key, entry);
  }
  const nextCycle = {
    byBudget: [...spanMap.entries()].map(([, v]) => v).sort((a, b) => b.effortDays - a.effortDays),
    totals: {
      effortDays: round([...spanMap.values()].reduce((s, v) => s + v.effortDays, 0)),
      records: [...spanMap.values()].reduce((s, v) => s + v.records, 0),
    },
    note: 'Exact sums of released person-days and budget authority, grouped by funding envelope. A supply estimate for the next allocation cycle — not a committed allocation.',
  };

  const calibration = carryoverCalibration(state, recordViews, now, settings);

  const counts = {
    invalidated: invalidated.length,
    uncovered: uncovered.length,
    records: records.length,
    pending: pending.length,
    decisionDue: decisionDue.length,
    releaseDue: releaseDue.length,
    released: released.length,
    withheld: withheld.length,
    bets: betRows.length,
    nextCycleEffortDays: nextCycle.totals.effortDays,
  };

  return {
    engineVersion: CARRYOVER_ENGINE_VERSION,
    now: now.toISOString(),
    today,
    conventions: settings,
    counts,
    uncovered,
    records: recordViews,
    pending,
    decisionDue,
    releaseDue,
    released,
    withheld,
    bets: betRows,
    nextCycle,
    calibration,
  };
}

/* ------------------------------------------------------------------ */
/* Calibration ledger                                                 */
/* ------------------------------------------------------------------ */

/**
 * Once-only, later grading of settlement decisions. Each settled record is
 * graded once against the prediction frozen when its settlement decision was
 * opened: the decision's recorded `forecastProbability`, or — when the leader
 * left it blank — the cell's strictly-prior hold rate (never the cell's own
 * current rate, which would grade a forecast against itself).
 *
 * Cells: bet-owner altitude × settlement outcome. Wilson 95% intervals;
 * rates refused below the declared floor. Brier skill printed against the
 * pooled base rate, withheld below five graded trials.
 */
export function carryoverCalibration(state = {}, recordViews = [], now = new Date(), settings = null) {
  const conv = normalizeCarryoverSettings({ ...(state.settings || {}), ...(settings || {}) });
  const floorN = conv.carryoverCellFloor;
  const reliabilityFloor = conv.carryoverReliabilityFloorPct;
  const gradingDelayDays = conv.carryoverGradingDelayDays;
  const today = dayKey(now);

  const settled = recordViews.filter((r) => r.record.status !== 'pending-settlement');
  const gradable = settled.filter((r) => {
    if (r.record.graded || !r.record.settledOn) return false;
    const delay = gradingDelayDays;
    const delta = daysBetween(r.record.settledOn, today);
    return Number.isFinite(delta) && delta >= delay;
  });

  const cells = new Map();
  for (const r of gradable) {
    const key = r.betAltitude ? r.betAltitude.key : 'unassigned';
    const cell = cells.get(key) || { altitudeKey: key, label: r.betAltitude ? r.betAltitude.label : 'Unassigned', trials: [] };
    cell.trials.push(r);
    cells.set(key, cell);
  }

  const cellRows = [...cells.entries()].map(([key, cell]) => {
    const sorted = [...cell.trials].sort((a, b) => String(a.record.settledOn).localeCompare(String(b.record.settledOn)));
    const settledN = sorted.filter((r) => r.record.settlementVerdict === 'retire-bet').length;
    const n = sorted.length;
    const refused = n < floorN;
    const wilson = wilsonInterval(settledN, n, floorN);
    const holdRatePct = refused ? null : r1((settledN / n) * 100);

    // Strictly-prior Brier is computed in the pass below (cells map), so this
    // row only carries the Wilson interval and the hold rate.
    return {
      altitudeKey: key,
      label: cell.label,
      n,
      settledN,
      holdRatePct,
      wilsonLo: wilson ? wilson.lo : null,
      wilsonHi: wilson ? wilson.hi : null,
      refused,
      belowFloor: !refused && holdRatePct < reliabilityFloor,
      gradable: n,
    };
  });

  // Workspace pool: the base rate every cell's Brier skill is read against.
  const pooledSettled = gradable.filter((r) => r.record.settlementVerdict === 'retire-bet').length;
  const pooledN = gradable.length;
  const pooledRefused = pooledN < floorN;
  const pooledBaseRate = pooledRefused ? null : pooledSettled / pooledN;

  // Sequential Brier, recomputed cleanly (the loop above kept the strictly-prior
  // discipline; this pass produces the printed numbers).
  const brierByCell = new Map();
  for (const [key, cell] of cells.entries()) {
    const sorted = [...cell.trials].sort((a, b) => String(a.record.settledOn).localeCompare(String(b.record.settledOn)));
    let priorSettled = 0;
    let priorN = 0;
    let sum = 0;
    let n = 0;
    for (const r of sorted) {
      const decision = r.decision;
      let predicted = null;
      if (decision && Number.isFinite(Number(decision.forecastProbability))
        && decision.forecastProbability !== null && decision.forecastProbability !== undefined) {
        predicted = Math.min(1, Math.max(0, Number(decision.forecastProbability)));
      } else if (priorN > 0) {
        predicted = priorSettled / priorN;
      }
      const outcome = r.record.settlementVerdict === 'retire-bet' ? 1 : 0;
      if (predicted !== null) {
        sum += (predicted - outcome) * (predicted - outcome);
        n += 1;
      }
      if (r.record.settlementVerdict === 'retire-bet') priorSettled += 1;
      priorN += 1;
    }
    brierByCell.set(key, { brier: n ? sum / n : null, n });
  }
  for (const row of cellRows) {
    const b = brierByCell.get(row.altitudeKey) || { brier: null, n: 0 };
    row.brier = b.brier === null ? null : r2(b.brier);
    row.brierN = b.n;
    row.skill = (b.brier !== null && pooledBaseRate !== null)
      ? r2(b.brier - (pooledBaseRate * (1 - pooledBaseRate)))
      : null;
  }

  return {
    cells: cellRows,
    workspace: {
      n: pooledN,
      settledN: pooledSettled,
      baseRatePct: pooledRefused ? null : r1(pooledBaseRate * 100),
      refused: pooledRefused,
      gradable: gradable.length,
      graded: recordViews.filter((r) => r.record.graded).length,
    },
    conventions: { cellFloor: floorN, reliabilityFloorPct: reliabilityFloor, gradingDelayDays },
  };
}

/* ------------------------------------------------------------------ */
/* Signals, badge, brief, CSV                                         */
/* ------------------------------------------------------------------ */

export function carryoverSignals(state = {}, now = new Date()) {
  const report = buildCarryoverReport(state, now);
  const signals = [];
  for (const row of report.uncovered) {
    signals.push({
      key: `CO-UNCOV:${row.pact.id}`,
      ruleId: 'RULE-CO-01',
      tone: 'warn',
      title: `Unsettled invalidation: “${row.title}”`,
      detail: row.resolved.betId
        ? `The falsified hypothesis was deployed under “${row.bet?.title || row.resolved.betId}” — open the settlement decision.`
        : 'No strategy bet could be resolved for this invalidation — the settlement decision is refused, not guessed.',
    });
  }
  for (const row of report.decisionDue) {
    signals.push({
      key: `CO-DEC:${row.record.id}`,
      ruleId: 'RULE-CO-02',
      tone: 'warn',
      title: `Settlement decision due on “${row.title}”`,
      detail: row.bet ? `Bet stop-rule state: ${row.betState.stateLabel}.` : 'Bet unresolved.',
    });
  }
  for (const row of report.releaseDue) {
    signals.push({
      key: `CO-REL:${row.record.id}`,
      ruleId: 'RULE-CO-02',
      tone: 'bad',
      title: `Release due: “${row.title}”`,
      detail: row.resource.committedAmount !== null
        ? `${row.resource.effortDays} person-day(s) and ${row.resource.currency || '—'} ${row.resource.committedAmount} still encumbered.`
        : `${row.resource.effortDays} person-day(s) still committed.`,
    });
  }
  for (const row of report.calibration.cells) {
    if (row.belowFloor) {
      signals.push({
        key: `CO-CAL:${row.altitudeKey}`,
        ruleId: 'RULE-CO-04',
        tone: 'warn',
        title: `${row.label} settlement hold rate ${row.holdRatePct}% is below the ${report.conventions.carryoverReliabilityFloorPct}% floor`,
        detail: `n=${row.n}, Wilson 95% ${row.wilsonLo}–${row.wilsonHi}%.`,
      });
    }
  }
  return signals;
}

export function carryoverAttentionCount(state = {}, now = new Date()) {
  const report = buildCarryoverReport(state, now);
  return report.counts.decisionDue + report.counts.releaseDue;
}

/**
 * Identity-free executive brief. No bet titles, no pact titles, no names, no
 * budget names: only counts, intervals and the released-capacity totals.
 */
export function carryoverBriefText(state = {}, now = new Date()) {
  const report = buildCarryoverReport(state, now);
  const c = report.counts;
  const cal = report.calibration;
  const lines = [
    `# Hoshin Carryover Brief — ${report.today}`,
    '',
    `- Pacts settled as thesis-invalidated: ${c.invalidated}.`,
    `- Settlements still awaiting a stop-rule verdict: ${c.decisionDue}.`,
    `- Settled retirements with resources still encumbered: ${c.releaseDue}.`,
    `- Settlements released into the next allocation cycle: ${c.released} (${report.nextCycle.totals.effortDays} person-day(s)).`,
    `- Settlements with release withheld in writing: ${c.withheld}.`,
  ];
  if (cal.workspace.n > 0) {
    lines.push(`- Settlement calibration: ${cal.workspace.settledN}/${cal.workspace.n} settled within the review window (base rate ${cal.workspace.baseRatePct ?? 'refused'}%).`);
    for (const cell of cal.cells) {
      lines.push(`- ${cell.label}: n=${cell.n}, settled=${cell.settledN}, hold=${cell.refused ? 'refused' : `${cell.holdRatePct}%`}${cell.wilsonLo !== null ? `, Wilson 95% ${cell.wilsonLo}–${cell.wilsonHi}%` : ''}.`);
    }
  }
  lines.push('');
  lines.push('Aggregate-only: no bet titles, pact titles, names, budget names or record ids are printed here. Released capacity is a supply estimate for the next allocation cycle, not a committed allocation.');
  return lines.join('\n');
}

/** Aggregate-only CSV rows (scope #80). */
export function carryoverCsvRows(state = {}, now = new Date()) {
  const report = buildCarryoverReport(state, now);
  const c = report.counts;
  const rows = [
    { row_kind: 'counts', item: 'invalidated_pacts', value: c.invalidated },
    { row_kind: 'counts', item: 'uncovered_pacts', value: c.uncovered },
    { row_kind: 'counts', item: 'carryover_records', value: c.records },
    { row_kind: 'counts', item: 'pending_settlement', value: c.pending },
    { row_kind: 'counts', item: 'decisions_due', value: c.decisionDue },
    { row_kind: 'counts', item: 'releases_due', value: c.releaseDue },
    { row_kind: 'counts', item: 'settlements_released', value: c.released },
    { row_kind: 'counts', item: 'releases_withheld', value: c.withheld },
    { row_kind: 'counts', item: 'bets_involved', value: c.bets },
    { row_kind: 'next_cycle', item: 'released_person_days', value: report.nextCycle.totals.effortDays },
    { row_kind: 'next_cycle', item: 'released_records', value: report.nextCycle.totals.records },
  ];
  for (const row of report.calibration.cells) {
    rows.push({ row_kind: 'calibration', item: `${row.altitudeKey}_hold_rate_pct`, value: row.refused ? '' : row.holdRatePct });
    rows.push({ row_kind: 'calibration', item: `${row.altitudeKey}_wilson_lo`, value: row.wilsonLo ?? '' });
    rows.push({ row_kind: 'calibration', item: `${row.altitudeKey}_wilson_hi`, value: row.wilsonHi ?? '' });
    rows.push({ row_kind: 'calibration', item: `${row.altitudeKey}_n`, value: row.n });
  }
  return rows;
}

export function carryoverTotals(state = {}, now = new Date()) {
  const report = buildCarryoverReport(state, now);
  return {
    invalidated: report.counts.invalidated,
    decisionDue: report.counts.decisionDue,
    releaseDue: report.counts.releaseDue,
    released: report.counts.released,
    nextCycleEffortDays: report.nextCycle.totals.effortDays,
  };
}

/* ------------------------------------------------------------------ */
/* Release preview (what a settlement decision would do)               */
/* ------------------------------------------------------------------ */

/**
 * Honest preview of a release: refuses a `spent` line, names the encumbered
 * amount, and never claims authority it does not have.
 */
export function carryoverReleasePreview(state = {}, recordView) {
  const rec = recordView.record;
  if (!rec.resource.encumberedLineId) {
    return { ok: true, outcome: 'unencumbered', message: 'Nothing was encumbered for this pact — only the person-day commitment returns.' };
  }
  const budget = (state.budgets || []).find((b) => b && b.id === rec.resource.budgetId);
  if (!budget) return { ok: false, outcome: null, message: `Funding envelope ${rec.resource.budgetId} no longer exists.` };
  const line = (budget.lines || []).find((l) => l && l.id === rec.resource.encumberedLineId);
  if (!line) return { ok: false, outcome: null, message: `Encumbered line ${rec.resource.encumberedLineId} no longer exists.` };
  if (line.status === 'spent') {
    return {
      ok: false,
      outcome: 'already-spent',
      message: `The line is already spent — the money landed. No release is possible; correct the actual if it is wrong.`,
    };
  }
  if (line.status === 'released') {
    return { ok: true, outcome: 'released', message: 'Already released — the authority was returned.' };
  }
  return {
    ok: true,
    outcome: 'committed',
    message: `Would release ${rec.resource.currency || budget.currency} ${rec.resource.committedAmount ?? '—'} and return ${rec.resource.effortDays} person-day(s) to the receiving span.`,
  };
}

export { wilsonInterval } from './catchball.js';
export { CARRYOVER_VERDICT_KEYS, CARRYOVER_RELEASE_LABELS, CARRYOVER_SETTLEMENT_VERDICTS, CARRYOVER_STATUS_LABELS };
