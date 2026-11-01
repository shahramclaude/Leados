/**
 * app/core/domain/settlement.js — Outcome Attribution & Loop Settlement Engine
 * (Schema v75, ADR-0067).
 *
 * Pure, deterministic, write-free domain module. No DOM, storage, network or
 * global clock.Confidential conflict records (`state.conflicts`), anonymous
 * pulse responses (`state.pulses`) and candidate files (`state.candidates`)
 * are never read here.
 *
 * Named frameworks implemented:
 *  1. Lipke (2003) Earned Schedule: ES = P * PD, SPI(t) = ES / AT,
 *     SV(t) = ES - AT, IEAC(t) = AT / P (for P > 0.05), avoiding classical
 *     EVM's SPI -> 1.0 convergence pathology at deadline.
 *  2. Goldratt (1997) Critical-Chain Buffer Fever Chart: plots window burn W
 *     against execution clearance P across Green, Watch and Red zones.
 *  3. Pressman & Wildavsky (1973) Joint Clearance Complexity: separates
 *     leader-gated clearances (DACI choice, stakeholder brief, 1:1 coaching)
 *     from delegated execution clearances and computes sequential joint pass
 *     probability prod_i p_i.
 *  4. Argyris (1977) Single- vs Double-Loop Learning, Fixsen et al. (2005)
 *     Implementation vs Intervention failure, and Holmström (1979) / Kerr (1975)
 *     anti-scapegoating attribution (separating false leader thesis from
 *     clean team delivery, and flagging Type-III premature strategy rejection).
 *  5. Brinson & Fachler (1985) exact 3-way additive economic variance partition:
 *     Delta C = ScheduleDrift + RateAndSpendRevision + Interaction (residual 0),
 *     strictly per-currency and never equating encumbrance with actual spend.
 *  6. Savage (1951) ex-post policy regret across rehearsed Response Studio
 *     branches (`contain` / `verify` / `wait`), plus Brier (1950) strictly
 *     proper out-of-sample forecast grading & Wilson (1927) 95% intervals.
 */

import { dayKey } from '../time.js';
import { computeFmea, computePertImpact, isCaseOpen } from './cases.js';
import { responseEconomics, RESPONSE_LABELS, RESPONSE_STRATEGIES } from './response.js';
import {
  SETTLEMENT_CHANNEL_LABELS,
  SETTLEMENT_CHANNEL_OWNER_SIDE,
  SETTLEMENT_ENGINE_VERSION,
  SETTLEMENT_FEVER_LABELS,
  SETTLEMENT_LIMITS,
  SETTLEMENT_LOOP_LABELS,
  SETTLEMENT_REGIME_META,
  SETTLEMENT_THESIS_LABELS,
} from './settlementRegistry.js';
import { normalizeSettlementSettings } from './settlementSchema.js';

const Z_95 = 1.959963984540054;

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function round3(n) {
  return Math.round(Number(n) * 1000) / 1000;
}

function round4(n) {
  return Math.round(Number(n) * 10000) / 10000;
}

function diffDays(fromDay, toDay) {
  if (!fromDay || !toDay) return null;
  const a = Date.parse(`${fromDay}T00:00:00.000Z`);
  const b = Date.parse(`${toDay}T00:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/** Exact Wilson (1927) 95% score interval in percentage points [0, 100]. */
export function wilsonIntervalPct(successes, n) {
  const total = Math.max(0, Math.round(Number(n) || 0));
  const k = Math.max(0, Math.min(total, Math.round(Number(successes) || 0)));
  if (total === 0) return null;
  const p = k / total;
  const z2 = Z_95 * Z_95;
  const denom = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denom;
  const half = (Z_95 * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total)) / denom;
  return {
    ratePct: round2(p * 100),
    loPct: round2(Math.max(0, (center - half) * 100)),
    hiPct: round2(Math.min(100, (center + half) * 100)),
    k,
    n: total,
  };
}

/**
 * Lipke (2003) Earned Schedule in time units.
 * Refuses rather than inventing a deadline when `reviewOn` is absent.
 */
export function computeEarnedSchedule({ openedOn, reviewOn, asOfDay, clearancePct, closedOn = null }) {
  const effectiveDay = closedOn && closedOn < asOfDay ? closedOn : asOfDay;
  const elapsedRaw = diffDays(openedOn, effectiveDay);
  const elapsedDays = elapsedRaw === null ? 0 : Math.max(0, elapsedRaw);
  const progress = Math.max(0, Math.min(1, (Number(clearancePct) || 0) / 100));

  if (!openedOn || !reviewOn) {
    return {
      scheduled: false,
      plannedDays: null,
      elapsedDays,
      earnedScheduleDays: null,
      spiT: null,
      svDays: null,
      ieacDays: null,
      windowBurnPct: null,
      overdue: false,
      daysPastReview: 0,
    };
  }

  const plannedRaw = diffDays(openedOn, reviewOn);
  const plannedDays = Math.max(1, plannedRaw ?? 1);
  const earnedScheduleDays = round2(progress * plannedDays);
  const atForRatio = elapsedDays > 0 ? elapsedDays : (effectiveDay >= openedOn ? 1 : 0);
  const spiT = atForRatio > 0 ? round3(earnedScheduleDays / atForRatio) : 1;
  const svDays = round2(earnedScheduleDays - elapsedDays);
  // IEAC(t) = AT / P requires at least 5% earned progress to avoid unstable blow-ups.
  const ieacDays = progress > 0.05 && atForRatio > 0
    ? round2(atForRatio / progress)
    : null;
  const windowBurnPct = round2(Math.max(0, Math.min(150, (elapsedDays / plannedDays) * 100)));
  const pastRaw = diffDays(reviewOn, effectiveDay);
  const overdue = Boolean(pastRaw !== null && pastRaw > 0 && progress < 0.999);

  return {
    scheduled: true,
    plannedDays,
    elapsedDays,
    earnedScheduleDays,
    spiT,
    svDays,
    ieacDays,
    windowBurnPct,
    overdue,
    daysPastReview: pastRaw !== null && pastRaw > 0 ? pastRaw : 0,
  };
}

/**
 * Goldratt (1997) Critical-Chain Buffer Fever Chart.
 * Compares fraction of window consumed W in [0, 1+] against clearance P in [0, 1].
 *  - Watch corridor: W > 0.25 + 0.60 * P
 *  - Red breach:     W > 0.45 + 0.55 * P  (or overdue with P < 1)
 */
export function classifyFeverZone({ windowBurnPct, clearancePct, scheduled, overdue = false }) {
  if (!scheduled || windowBurnPct === null || windowBurnPct === undefined) {
    return {
      zone: 'unscheduled',
      label: SETTLEMENT_FEVER_LABELS.unscheduled,
      bufferIndex: null,
      watchCeilingPct: null,
      redCeilingPct: null,
    };
  }
  const p = Math.max(0, Math.min(1, (Number(clearancePct) || 0) / 100));
  const w = Math.max(0, Number(windowBurnPct) / 100);
  const watchThreshold = 0.25 + 0.60 * p;
  const redThreshold = 0.45 + 0.55 * p;
  const bufferIndex = round2((w / Math.max(0.1, redThreshold)) * 100);

  let zone = 'green';
  if ((overdue && p < 0.999) || (p < 0.999 && w > redThreshold)) {
    zone = 'red';
  } else if (p < 0.999 && w > watchThreshold) {
    zone = 'watch';
  }

  return {
    zone,
    label: SETTLEMENT_FEVER_LABELS[zone],
    bufferIndex,
    watchCeilingPct: round2(watchThreshold * 100),
    redCeilingPct: round2(redThreshold * 100),
  };
}

/**
 * 2x2 Epistemic x Execution Attribution Matrix
 * (Argyris 1977 + Fixsen et al. 2005 + Holmström 1979 / Kerr 1975).
 */
export function classifyAttributionRegime({
  thesisState,
  executionClearancePct,
  leaderClearancePct,
  delegateClearancePct,
  leaderCount,
  delegateCount,
  feverZone,
  overdue,
  closedOutcome,
  fidelityFloorPct = SETTLEMENT_LIMITS.defaultFidelityFloorPct,
}) {
  const floor = Number.isFinite(Number(fidelityFloorPct))
    ? Number(fidelityFloorPct)
    : SETTLEMENT_LIMITS.defaultFidelityFloorPct;
  const execPct = Number(executionClearancePct) || 0;
  const leadPct = leaderClearancePct === null ? null : Number(leaderClearancePct);
  const delPct = delegateClearancePct === null ? null : Number(delegateClearancePct);
  const cleanDelegate = delegateCount > 0 ? delPct >= floor : execPct >= floor;
  const stressed = feverZone === 'red' || feverZone === 'watch' || Boolean(overdue);

  let regime = 'in-flight-on-pace';
  if (thesisState === 'corroborated' && execPct >= floor) {
    regime = 'validated-win';
  } else if (thesisState === 'falsified' && cleanDelegate) {
    regime = 'thesis-falsified-clean-execution';
  } else if (
    leaderCount > 0
    && leadPct !== null
    && leadPct < 50
    && (delegateCount === 0 || (delPct !== null && delPct - leadPct >= 25))
    && stressed
  ) {
    regime = 'execution-stalled-leader-gated';
  } else if (thesisState === 'untested' && execPct < floor && stressed && !closedOutcome) {
    regime = 'execution-drift-untested-thesis';
  } else if ((thesisState === 'falsified' || overdue || closedOutcome) && execPct < floor) {
    regime = 'confounded-refused';
  }

  let primaryBottleneck = 'none';
  if (leaderCount > 0 && leadPct < 100 && (delegateCount === 0 || leadPct <= (delPct ?? 100) - 15)) {
    primaryBottleneck = 'leader';
  } else if (delegateCount > 0 && delPct < 100 && (leaderCount === 0 || delPct < (leadPct ?? 100))) {
    primaryBottleneck = 'delegate';
  } else if (execPct < 100) {
    primaryBottleneck = 'shared';
  }

  return {
    regime,
    meta: SETTLEMENT_REGIME_META[regime],
    primaryBottleneck,
    cleanDelegateExecution: cleanDelegate,
    fidelityFloorPct: floor,
  };
}

/**
 * Brinson & Fachler (1985) exact 3-way additive economic variance partition:
 *   Planned C0 = M0 + T0 * r0
 *   Realized C1 = M1 + T1 * r1
 *   Delta C = C1 - C0
 *           = (T1 - T0) * r0               [Schedule / duration drift]
 *           + (T0 * (r1 - r0) + (M1 - M0)) [Rate & direct-spend revision]
 *           + (T1 - T0) * (r1 - r0)        [Schedule x rate interaction]
 *
 * Strictly refuses mixed currencies and never treats committed encumbrance as
 * actual spend.
 */
export function computeEconomicVariance({
  plannedCurrency = null,
  actualCurrency = null,
  plannedMitigation = null,
  actualMitigation = null,
  committedEncumbrance = null,
  plannedDays = null,
  actualDays = null,
  plannedDailyCarry = null,
  actualDailyCarry = null,
  hasDatedActualSpend = false,
}) {
  const pCur = typeof plannedCurrency === 'string' && plannedCurrency.trim()
    ? plannedCurrency.trim().toUpperCase()
    : null;
  const aCur = typeof actualCurrency === 'string' && actualCurrency.trim()
    ? actualCurrency.trim().toUpperCase()
    : null;

  if (pCur && aCur && pCur !== aCur) {
    return {
      status: 'mixed-currency-refused',
      reason: `Planned economics (${pCur}) and recorded budget/actuals (${aCur}) use different currencies; no exchange rate is assumed.`,
      currency: null,
      committedEncumbrance: committedEncumbrance !== null ? round2(committedEncumbrance) : null,
      encumbranceCurrency: aCur,
      plannedCost: null,
      realizedCost: null,
      varianceTotal: null,
      scheduleEffect: null,
      rateEffect: null,
      interactionEffect: null,
      residual: null,
    };
  }

  const currency = aCur || pCur;
  if (!currency) {
    return {
      status: 'unpriced',
      reason: 'No currency-denominated cost baseline is declared on this loop.',
      currency: null,
      committedEncumbrance: null,
      plannedCost: null,
      realizedCost: null,
      varianceTotal: null,
      scheduleEffect: null,
      rateEffect: null,
      interactionEffect: null,
      residual: null,
    };
  }

  if (!hasDatedActualSpend) {
    return {
      status: committedEncumbrance !== null && committedEncumbrance > 0 ? 'encumbrance-only' : 'awaiting-actuals',
      reason: committedEncumbrance !== null && committedEncumbrance > 0
        ? `${currency} ${round2(committedEncumbrance).toLocaleString('en-US')} is encumbered (committed), not spent. Record actual spend or case actuals to settle variance.`
        : 'No dated actual spend or settled carry window has been recorded yet.',
      currency,
      committedEncumbrance: committedEncumbrance !== null ? round2(committedEncumbrance) : null,
      plannedCost: plannedMitigation !== null || plannedDailyCarry !== null
        ? round2((Number(plannedMitigation) || 0) + Math.max(0, Number(plannedDays) || 0) * Math.max(0, Number(plannedDailyCarry) || 0))
        : null,
      realizedCost: null,
      varianceTotal: null,
      scheduleEffect: null,
      rateEffect: null,
      interactionEffect: null,
      residual: null,
    };
  }

  const m0 = Math.max(0, Number(plannedMitigation) || 0);
  const m1 = Math.max(0, Number(actualMitigation) || 0);
  const t0 = Math.max(0, Number(plannedDays) || 0);
  const t1 = Math.max(0, Number(actualDays) || 0);
  const r0 = Math.max(0, Number(plannedDailyCarry) || 0);
  const r1 = Math.max(0, Number(actualDailyCarry ?? r0) || 0);

  const plannedCost = round2(m0 + t0 * r0);
  const realizedCost = round2(m1 + t1 * r1);
  const varianceTotal = round2(realizedCost - plannedCost);
  const scheduleEffect = round2((t1 - t0) * r0);
  const rateEffect = round2(t0 * (r1 - r0) + (m1 - m0));
  const rawInteraction = (t1 - t0) * (r1 - r0);
  // Absorb at most sub-cent IEEE rounding into interaction so the 3 terms sum
  // identically to varianceTotal.
  const interactionEffect = Math.abs(scheduleEffect + rateEffect + rawInteraction - varianceTotal) <= 0.03
    ? round2(varianceTotal - scheduleEffect - rateEffect)
    : round2(rawInteraction);
  const residual = round2(varianceTotal - (scheduleEffect + rateEffect + interactionEffect));

  return {
    status: 'settled',
    reason: null,
    currency,
    committedEncumbrance: committedEncumbrance !== null ? round2(committedEncumbrance) : null,
    plannedMitigation: round2(m0),
    actualMitigation: round2(m1),
    plannedDays: round2(t0),
    actualDays: round2(t1),
    plannedDailyCarry: round2(r0),
    actualDailyCarry: round2(r1),
    plannedCost,
    realizedCost,
    varianceTotal,
    scheduleEffect,
    rateEffect,
    interactionEffect,
    residual,
  };
}

/**
 * Savage (1951) ex-post policy regret across Response Studio's 3 rehearsed
 * policies (`contain`, `verify`, `wait`) evaluated at realized parameters.
 */
export function computeCounterfactualPolicyRegret(responsePlan, {
  actualDays = null,
  actualMitigation = null,
  riskMaterialized = null,
} = {}) {
  if (!responsePlan?.assumptions || !RESPONSE_STRATEGIES.includes(responsePlan.strategy)) {
    return null;
  }
  const econ = responseEconomics(responsePlan.assumptions);
  if (!econ.available) return null;

  const a = responsePlan.assumptions;
  const weeklyExpected = ((Number(a.weeklyDelayLow) || 0) + 4 * (Number(a.weeklyDelayMode) || 0) + (Number(a.weeklyDelayHigh) || 0)) / 6;
  const dailyCarry = weeklyExpected / 7;
  const evidenceDays = Math.max(1, Number(a.evidenceDays) || 3);
  const delayDays = Math.max(1, Number(a.delayDays) || 14);
  const plannedMitigation = Math.max(0, Number(a.mitigationBudget) || 0);
  const observedDays = actualDays !== null && Number.isFinite(Number(actualDays))
    ? Math.max(0, Number(actualDays))
    : delayDays;

  // Under hindsight:
  // - `contain` pays direct mitigation immediately and carries minimal residual exposure;
  //   if actualMitigation was recorded on a `contain` adoption, use it.
  // - `verify` carries exposure during `min(observedDays, evidenceDays)` and then
  //   pays mitigation only if the risk did not self-resolve (`riskMaterialized !== false`).
  // - `wait` carries exposure across `observedDays` and still pays mitigation if
  //   `riskMaterialized === true`.
  const neededMitigation = riskMaterialized === false ? 0 : (
    actualMitigation !== null && responsePlan.strategy === 'contain'
      ? Math.max(0, Number(actualMitigation))
      : plannedMitigation
  );
  const containCost = round2(
    (responsePlan.strategy === 'contain' && actualMitigation !== null
      ? Math.max(0, Number(actualMitigation))
      : plannedMitigation)
    + (responsePlan.strategy === 'contain' ? observedDays * dailyCarry * 0.25 : Math.min(observedDays, evidenceDays) * dailyCarry * 0.25),
  );
  const verifyCost = round2(
    Math.min(observedDays, evidenceDays) * dailyCarry + neededMitigation,
  );
  const waitCost = round2(
    observedDays * dailyCarry + (riskMaterialized === false ? 0 : neededMitigation),
  );

  const policyCosts = {
    contain: containCost,
    verify: verifyCost,
    wait: waitCost,
  };
  const chosenStrategy = responsePlan.strategy;
  const chosenCost = policyCosts[chosenStrategy];
  const entries = RESPONSE_STRATEGIES.map((id) => ({
    strategy: id,
    label: RESPONSE_LABELS[id],
    cost: policyCosts[id],
  })).sort((x, y) => x.cost - y.cost);
  const best = entries[0];
  const realizedRegret = round2(Math.max(0, chosenCost - best.cost));

  return {
    currency: econ.currency,
    chosenStrategy,
    chosenLabel: RESPONSE_LABELS[chosenStrategy],
    chosenCost,
    hindsightBestStrategy: best.strategy,
    hindsightBestLabel: best.label,
    hindsightBestCost: best.cost,
    realizedRegret,
    policies: entries,
    caveat: 'Ex-post counterfactual under declared carry rates; unchosen policies were not run in reality.',
  };
}

/* ------------------------------------------------------------------ */
/* O(V + E) workspace index                                           */
/* ------------------------------------------------------------------ */

function buildWorkspaceIndex(state = {}) {
  const peopleById = new Map();
  for (const p of state.people || []) if (p?.id) peopleById.set(p.id, p);

  const casesById = new Map();
  for (const c of state.cases || []) if (c?.id) casesById.set(c.id, c);

  const decisionsById = new Map();
  for (const d of state.decisions || []) if (d?.id) decisionsById.set(d.id, d);

  const delegationsById = new Map();
  for (const d of state.delegations || []) if (d?.id) delegationsById.set(d.id, d);

  const premisesById = new Map();
  const premisesByCaseId = new Map();
  for (const pr of state.premises || []) {
    if (!pr?.id) continue;
    premisesById.set(pr.id, pr);
    for (const ref of pr.sourceRefs || []) {
      if (ref?.sourceType === 'case' && ref.sourceId) {
        const list = premisesByCaseId.get(ref.sourceId) || [];
        list.push(pr);
        premisesByCaseId.set(ref.sourceId, list);
      }
    }
  }

  const latestOutcomeByPremiseId = new Map();
  for (const out of state.premiseOutcomes || []) {
    if (!out?.premiseId) continue;
    const prev = latestOutcomeByPremiseId.get(out.premiseId);
    if (!prev || String(out.settledOn || '') >= String(prev.settledOn || '')) {
      latestOutcomeByPremiseId.set(out.premiseId, out);
    }
  }

  const budgetsById = new Map();
  const budgetLineByKey = new Map();
  const budgetLinesByCaseId = new Map();
  for (const b of state.budgets || []) {
    if (!b?.id) continue;
    budgetsById.set(b.id, b);
    for (const line of b.lines || []) {
      if (!line?.id) continue;
      const entry = { budget: b, line };
      budgetLineByKey.set(`${b.id}:${line.id}`, entry);
      if (line.sourceType === 'case' && line.sourceId) {
        const list = budgetLinesByCaseId.get(line.sourceId) || [];
        list.push(entry);
        budgetLinesByCaseId.set(line.sourceId, list);
      }
    }
  }

  const commsById = new Map();
  const commsByCaseId = new Map();
  for (const dr of state.commsDrafts || []) {
    if (!dr?.id) continue;
    commsById.set(dr.id, dr);
    if (dr.caseId) {
      const list = commsByCaseId.get(dr.caseId) || [];
      list.push(dr);
      commsByCaseId.set(dr.caseId, list);
    }
  }

  const meetingsByPersonId = new Map();
  for (const m of state.oneOnOnes || []) {
    if (!m?.personId) continue;
    const list = meetingsByPersonId.get(m.personId) || [];
    list.push(m);
    meetingsByPersonId.set(m.personId, list);
  }

  const peersByNodeKey = new Map();
  const pushPeer = (key, peer) => {
    const list = peersByNodeKey.get(key) || [];
    list.push(peer);
    peersByNodeKey.set(key, list);
  };
  for (const lnk of state.links || []) {
    if (!lnk?.sourceType || !lnk?.sourceId || !lnk?.targetType || !lnk?.targetId) continue;
    pushPeer(`${lnk.sourceType}:${lnk.sourceId}`, { type: lnk.targetType, id: lnk.targetId, relation: lnk.relation });
    pushPeer(`${lnk.targetType}:${lnk.targetId}`, { type: lnk.sourceType, id: lnk.sourceId, relation: lnk.relation });
  }

  const settlementsByLoopKey = new Map();
  for (const s of state.settlements || []) {
    if (!s?.loopKey || s.status === 'archived') continue;
    const prev = settlementsByLoopKey.get(s.loopKey);
    if (!prev || (s.status === 'settled' && prev.status !== 'settled') || String(s.updatedAt) >= String(prev.updatedAt)) {
      settlementsByLoopKey.set(s.loopKey, s);
    }
  }

  return {
    peopleById,
    casesById,
    decisionsById,
    delegationsById,
    premisesById,
    premisesByCaseId,
    latestOutcomeByPremiseId,
    budgetsById,
    budgetLineByKey,
    budgetLinesByCaseId,
    commsById,
    commsByCaseId,
    meetingsByPersonId,
    peersByNodeKey,
    settlementsByLoopKey,
  };
}

/* ------------------------------------------------------------------ */
/* Channel evaluation & loop assembly                                 */
/* ------------------------------------------------------------------ */

function scoreDecisionItem(decision) {
  const chosen = Boolean(decision?.chosen && String(decision.chosen).trim())
    || decision?.status === 'decided';
  return {
    kind: 'decision',
    ownerSide: SETTLEMENT_CHANNEL_OWNER_SIDE.decision,
    id: decision.id,
    title: decision.title || 'Governed decision',
    route: `#/decisions`,
    score: chosen ? 1 : 0,
    statusLabel: chosen ? 'Chosen' : 'Unchosen (leader gate)',
    cleared: chosen,
  };
}

function scoreDelegationItem(del, openedOn) {
  const done = del.status === 'done';
  const checkedIn = !done && del.status === 'active'
    && Array.isArray(del.checkins)
    && del.checkins.some((c) => c?.date && (!openedOn || c.date >= openedOn));
  const score = done ? 1 : checkedIn ? 0.5 : 0;
  return {
    kind: 'delegation',
    ownerSide: SETTLEMENT_CHANNEL_OWNER_SIDE.delegation,
    id: del.id,
    personId: del.personId || null,
    title: del.title || 'Delegated work',
    route: '#/delegations',
    score,
    statusLabel: done ? 'Completed' : checkedIn ? 'Active · check-in logged' : del.status === 'returned' ? 'Returned' : 'Active · no check-in yet',
    cleared: done,
  };
}

function scorePremiseItem(premise, latestOutcome, openedOn) {
  const outcomeVerdict = latestOutcome?.verdict || null;
  const breached = premise.status === 'breached' && premise.humanDisposition !== 'reaffirmed';
  const reviewed = Boolean(premise.lastReviewedOn && (!openedOn || premise.lastReviewedOn >= openedOn));
  const settled = Boolean(outcomeVerdict);
  const score = settled ? 1 : reviewed ? 0.6 : 0;
  return {
    kind: 'premise',
    ownerSide: SETTLEMENT_CHANNEL_OWNER_SIDE.premise,
    id: premise.id,
    ownerId: premise.ownerId || null,
    title: premise.title || 'Assumption',
    route: `#/premises?premise=${encodeURIComponent(premise.id)}`,
    score,
    outcomeVerdict,
    breached,
    priorPct: Number.isFinite(Number(premise.priorPct)) ? Number(premise.priorPct) : null,
    statusLabel: settled
      ? `Settled (${outcomeVerdict})`
      : breached
        ? 'Signpost breached'
        : reviewed
          ? `Reviewed ${premise.lastReviewedOn}`
          : 'Unreviewed assumption',
    cleared: settled,
  };
}

function scoreBudgetItem(budget, line) {
  const hasActual = line.actualAmount !== null && line.actualAmount !== undefined && Number.isFinite(Number(line.actualAmount));
  const released = line.status === 'released';
  const score = hasActual || released ? 1 : line.status === 'committed' ? 0.5 : 0;
  return {
    kind: 'budget',
    ownerSide: SETTLEMENT_CHANNEL_OWNER_SIDE.budget,
    id: line.id,
    budgetId: budget.id,
    currency: budget.currency || 'USD',
    committedAmount: Number.isFinite(Number(line.committedAmount)) ? Number(line.committedAmount) : 0,
    actualAmount: hasActual ? Number(line.actualAmount) : null,
    title: line.title || 'Budget line',
    route: '#/finance',
    score,
    statusLabel: hasActual
      ? `Actual recorded (${budget.currency} ${round2(line.actualAmount)})`
      : released
        ? 'Released'
        : `Encumbered (${budget.currency} ${round2(line.committedAmount || 0)}) · no actual`,
    cleared: hasActual || released,
  };
}

function scoreCommsItem(draft, allCaseDrafts = []) {
  const sent = draft.status === 'sent'
    || (draft.status === 'superseded' && allCaseDrafts.some(
      (d) => d.stakeholderKey === draft.stakeholderKey && d.purpose === draft.purpose && d.status === 'sent',
    ));
  const approved = !sent && draft.status === 'approved';
  const score = sent ? 1 : approved ? 0.5 : 0;
  return {
    kind: 'comms',
    ownerSide: SETTLEMENT_CHANNEL_OWNER_SIDE.comms,
    id: draft.id,
    title: draft.subject || 'Stakeholder brief',
    route: '#/comms',
    score,
    statusLabel: sent ? 'Sent / logged' : approved ? 'Approved · unsent' : 'Draft awaiting leader approval',
    cleared: sent,
  };
}

function scoreCoachingItem(person, prompt, meetings = [], openedOn) {
  const heldSince = meetings.some((m) => m?.date && (!openedOn || m.date >= openedOn));
  const stillQueued = prompt ? (person.talkingPoints || []).includes(prompt) : (person.talkingPoints || []).length > 0;
  const cleared = heldSince || !stillQueued;
  return {
    kind: 'coaching',
    ownerSide: SETTLEMENT_CHANNEL_OWNER_SIDE.coaching,
    id: person.id,
    personId: person.id,
    title: `1:1 support · ${person.name || 'Team member'}`,
    route: `#/prep/${encodeURIComponent(person.id)}`,
    score: cleared ? 1 : 0,
    statusLabel: heldSince ? '1:1 held since adoption' : stillQueued ? 'Queued · no 1:1 held yet' : 'Cleared',
    cleared,
  };
}

function evaluateThesisState(sourceCase, premiseItems) {
  const anyFalsified = premiseItems.some((p) => p.outcomeVerdict === 'failed' || p.outcomeVerdict === 'falsified' || p.breached);
  if (anyFalsified) return 'falsified';

  if (sourceCase) {
    const fmea = computeFmea(sourceCase.fmea);
    const hasResidual = sourceCase.fmea?.residualSeverity != null
      && sourceCase.fmea?.residualProbability != null
      && sourceCase.fmea?.residualDetectability != null;
    if (hasResidual && fmea.residualRpn > fmea.rpn) return 'falsified';
    if (!isCaseOpen(sourceCase)) return 'corroborated';
  }

  const anyValidated = premiseItems.some((p) => p.outcomeVerdict === 'held' || p.outcomeVerdict === 'validated');
  if (anyValidated) return 'corroborated';

  return 'untested';
}

function analyzeSingleLoop(descriptor, idx, asOfDay, settings) {
  const {
    loopKey,
    loopKind,
    sourceId,
    title,
    sourceRoute,
    openedOn,
    reviewOn,
    sourceCase,
    bundleRecord,
    responseRecord,
    items,
  } = descriptor;

  const execItems = items.filter((i) => ['decision', 'comms', 'coaching', 'delegation'].includes(i.kind));
  const leaderItems = items.filter((i) => i.ownerSide === 'leader');
  const delegateItems = items.filter((i) => i.ownerSide === 'delegate');
  const premiseItems = items.filter((i) => i.kind === 'premise');
  const budgetItems = items.filter((i) => i.kind === 'budget');

  const meanPct = (arr) => (arr.length ? round2((arr.reduce((s, x) => s + x.score, 0) / arr.length) * 100) : null);
  const overallClearancePct = meanPct(items) ?? 0;
  const executionClearancePct = meanPct(execItems) ?? overallClearancePct;
  const leaderClearancePct = meanPct(leaderItems);
  const delegateClearancePct = meanPct(delegateItems);

  // Pressman & Wildavsky (1973) sequential joint clearance probability across gates:
  // each gate contributes p_i in [0.15, 1.0] based on observed readiness.
  const jointClearancePct = items.length
    ? round2(items.reduce((prod, item) => prod * (0.15 + 0.85 * item.score), 1) * 100)
    : 100;

  const closedOn = sourceCase && !isCaseOpen(sourceCase) ? sourceCase.resolvedOn || null : null;
  const schedule = computeEarnedSchedule({
    openedOn,
    reviewOn,
    asOfDay,
    clearancePct: overallClearancePct,
    closedOn,
  });
  const fever = classifyFeverZone({
    windowBurnPct: schedule.windowBurnPct,
    clearancePct: overallClearancePct,
    scheduled: schedule.scheduled,
    overdue: schedule.overdue,
  });

  const thesisState = evaluateThesisState(sourceCase, premiseItems);
  const closedOutcome = Boolean((sourceCase && !isCaseOpen(sourceCase)) || premiseItems.some((p) => Boolean(p.outcomeVerdict)));
  const attribution = classifyAttributionRegime({
    thesisState,
    executionClearancePct,
    leaderClearancePct,
    delegateClearancePct,
    leaderCount: leaderItems.length,
    delegateCount: delegateItems.length,
    feverZone: fever.zone,
    overdue: schedule.overdue,
    closedOutcome,
    fidelityFloorPct: settings.settlementFidelityFloorPct,
  });

  // Economic variance & counterfactual regret.
  const budgetCurrencies = [...new Set(budgetItems.map((b) => b.currency).filter(Boolean))];
  const committedEncumbrance = budgetCurrencies.length <= 1 && budgetItems.length
    ? budgetItems.reduce((s, b) => s + (b.committedAmount || 0), 0)
    : null;
  const hasBudgetActual = budgetCurrencies.length === 1 && budgetItems.some((b) => b.actualAmount !== null);
  const recordedBudgetActual = hasBudgetActual
    ? budgetItems.reduce((s, b) => s + (b.actualAmount ?? 0), 0)
    : null;
  const caseActualCost = sourceCase?.actuals?.actualCost != null && Number.isFinite(Number(sourceCase.actuals.actualCost))
    ? Number(sourceCase.actuals.actualCost)
    : null;

  let plannedCurrency = null;
  let actualCurrency = budgetCurrencies.length === 1 ? budgetCurrencies[0] : (budgetCurrencies.length > 1 ? 'MIXED' : null);
  let plannedMitigation = null;
  let actualMitigation = null;
  let plannedDays = schedule.plannedDays ?? 14;
  let actualDays = schedule.elapsedDays;
  let plannedDailyCarry = 0;
  let actualDailyCarry = 0;
  let hasDatedActualSpend = false;

  if (responseRecord?.assumptions) {
    const econ = responseEconomics(responseRecord.assumptions);
    if (econ.available) {
      const a = responseRecord.assumptions;
      const weeklyExpected = ((Number(a.weeklyDelayLow) || 0) + 4 * (Number(a.weeklyDelayMode) || 0) + (Number(a.weeklyDelayHigh) || 0)) / 6;
      plannedCurrency = econ.currency;
      plannedMitigation = responseRecord.strategy === 'wait' ? 0 : Number(a.mitigationBudget) || 0;
      plannedDays = responseRecord.strategy === 'wait'
        ? Number(a.delayDays) || 14
        : Number(a.evidenceDays) || 3;
      plannedDailyCarry = weeklyExpected / 7;
      actualDailyCarry = plannedDailyCarry;
      if (hasBudgetActual) {
        actualMitigation = recordedBudgetActual;
        hasDatedActualSpend = true;
      } else if (caseActualCost !== null) {
        actualCurrency = actualCurrency || sourceCase?.financial?.currency || plannedCurrency;
        actualMitigation = caseActualCost;
        hasDatedActualSpend = true;
      } else if (closedOutcome) {
        actualCurrency = actualCurrency || plannedCurrency;
        actualMitigation = responseRecord.strategy === 'contain' ? plannedMitigation : 0;
        hasDatedActualSpend = true;
      }
    }
  } else if (sourceCase) {
    const fmea = computeFmea(sourceCase.fmea);
    const pert = computePertImpact(sourceCase.financial, fmea);
    if (pert.hasFinancialEstimate || pert.mitigationCost > 0) {
      plannedCurrency = pert.currency;
      plannedMitigation = pert.mitigationCost || 0;
      plannedDailyCarry = plannedDays > 0 && pert.expectedUnmitigatedLoss
        ? (pert.expectedUnmitigatedLoss * 0.1) / plannedDays
        : 0;
      actualDailyCarry = plannedDailyCarry;
      if (hasBudgetActual) {
        actualMitigation = recordedBudgetActual;
        hasDatedActualSpend = true;
      } else if (caseActualCost !== null) {
        actualCurrency = actualCurrency || sourceCase.actuals?.currency || pert.currency;
        actualMitigation = caseActualCost;
        hasDatedActualSpend = true;
      }
    }
  }

  const economicVariance = budgetCurrencies.length > 1
    ? {
        status: 'mixed-currency-refused',
        reason: `Budget lines span multiple currencies (${budgetCurrencies.join(', ')}); no exchange rate is assumed.`,
        currency: null,
        committedEncumbrance: null,
        plannedCost: null,
        realizedCost: null,
        varianceTotal: null,
        scheduleEffect: null,
        rateEffect: null,
        interactionEffect: null,
        residual: null,
      }
    : computeEconomicVariance({
        plannedCurrency,
        actualCurrency,
        plannedMitigation,
        actualMitigation,
        committedEncumbrance,
        plannedDays,
        actualDays,
        plannedDailyCarry,
        actualDailyCarry,
        hasDatedActualSpend,
      });

  const policyRegret = responseRecord
    ? computeCounterfactualPolicyRegret(responseRecord, {
        actualDays,
        actualMitigation: hasDatedActualSpend ? actualMitigation : null,
        riskMaterialized: thesisState === 'falsified' ? true : (thesisState === 'corroborated' && responseRecord.strategy !== 'contain' ? false : null),
      })
    : null;

  const cleanClosure = Boolean(
    thesisState === 'corroborated'
    && executionClearancePct >= settings.settlementFidelityFloorPct
    && !schedule.overdue,
  );

  const settlementRecord = idx.settlementsByLoopKey.get(loopKey) || null;
  const settleReady = Boolean(closedOutcome || schedule.overdue || (reviewOn && reviewOn <= asOfDay));
  const delegateIds = [...new Set(delegateItems.map((d) => d.personId).filter(Boolean))];
  const blockingDecisionIds = leaderItems
    .filter((i) => i.kind === 'decision' && !i.cleared)
    .map((i) => i.id);

  // Channel summary table
  const byChannel = [];
  for (const kind of ['decision', 'comms', 'coaching', 'delegation', 'premise', 'budget']) {
    const chItems = items.filter((i) => i.kind === kind);
    if (!chItems.length) continue;
    byChannel.push({
      kind,
      label: SETTLEMENT_CHANNEL_LABELS[kind],
      ownerSide: SETTLEMENT_CHANNEL_OWNER_SIDE[kind],
      count: chItems.length,
      cleared: chItems.filter((i) => i.cleared).length,
      clearancePct: meanPct(chItems),
    });
  }

  return {
    loopKey,
    loopKind,
    loopKindLabel: SETTLEMENT_LOOP_LABELS[loopKind],
    sourceId,
    caseId: sourceCase?.id || null,
    title,
    sourceRoute,
    openedOn,
    reviewOn,
    closedOn,
    closedOutcome,
    settleReady,
    cleanClosure,
    items,
    byChannel,
    counts: {
      total: items.length,
      cleared: items.filter((i) => i.cleared).length,
      leader: leaderItems.length,
      leaderCleared: leaderItems.filter((i) => i.cleared).length,
      delegate: delegateItems.length,
      delegateCleared: delegateItems.filter((i) => i.cleared).length,
    },
    overallClearancePct,
    executionClearancePct,
    leaderClearancePct,
    delegateClearancePct,
    jointClearancePct,
    thesisState,
    thesisLabel: SETTLEMENT_THESIS_LABELS[thesisState],
    schedule,
    fever,
    attribution,
    economicVariance,
    policyRegret,
    delegateIds,
    blockingDecisionIds,
    settlementRecord,
  };
}

/**
 * Extract all non-overlapping coordinated control loops from the workspace:
 *  1. Committed Action Bundles (`bundle:<id>`)
 *  2. Committed Response Plans (`response:<id>`)
 *  3. Operational Cases (`case:<id>`) not already wrapped by a committed bundle
 *     or response plan, provided they coordinate >= 2 cross-module items.
 */
export function extractControlLoops(state = {}, now = new Date(), settingsInput = null) {
  const asOfDay = dayKey(now);
  const settings = normalizeSettlementSettings(settingsInput || state?.settings || {});
  const idx = buildWorkspaceIndex(state);
  const coveredCaseIds = new Set();
  const loops = [];

  // 1. Committed Action Bundles
  for (const b of state.actionBundles || []) {
    if (!b || b.status !== 'committed') continue;
    const sourceCase = b.sourceId ? idx.casesById.get(b.sourceId) || null : null;
    if (sourceCase) coveredCaseIds.add(sourceCase.id);
    const openedOn = (b.committedAt || b.createdAt || '').slice(0, 10) || sourceCase?.openedOn || asOfDay;
    const items = [];
    const seenKeys = new Set();
    const pushUnique = (item) => {
      if (!item) return;
      const k = `${item.kind}:${item.id}`;
      if (seenKeys.has(k)) return;
      seenKeys.add(k);
      items.push(item);
    };

    for (const out of b.outputs || []) {
      if (!out?.kind || !out?.id) continue;
      if (out.kind === 'decision') {
        const d = idx.decisionsById.get(out.id);
        if (d) pushUnique(scoreDecisionItem(d));
      } else if (out.kind === 'delegation') {
        const d = idx.delegationsById.get(out.id);
        if (d && !(d.support || '').includes('[BND-02:')) pushUnique(scoreDelegationItem(d, openedOn));
      } else if (out.kind === 'premise') {
        const pr = idx.premisesById.get(out.id);
        if (pr) pushUnique(scorePremiseItem(pr, idx.latestOutcomeByPremiseId.get(pr.id), openedOn));
      } else if (out.kind === 'budget') {
        const entry = idx.budgetLineByKey.get(`${out.budgetId}:${out.id}`);
        if (entry) pushUnique(scoreBudgetItem(entry.budget, entry.line));
      } else if (out.kind === 'comms') {
        const dr = idx.commsById.get(out.id);
        if (dr) pushUnique(scoreCommsItem(dr, idx.commsByCaseId.get(dr.caseId) || []));
      } else if (out.kind === 'coaching') {
        const p = idx.peopleById.get(out.id);
        if (p) pushUnique(scoreCoachingItem(p, out.prompt || '', idx.meetingsByPersonId.get(p.id) || [], openedOn));
      }
    }

    loops.push(analyzeSingleLoop({
      loopKey: `bundle:${b.id}`,
      loopKind: 'bundle',
      sourceId: b.id,
      title: b.name || sourceCase?.title || 'Adopted action bundle',
      sourceRoute: `#/bundles?bundle=${encodeURIComponent(b.id)}`,
      openedOn,
      reviewOn: b.reviewOn || sourceCase?.reviewOn || null,
      sourceCase,
      bundleRecord: b,
      responseRecord: null,
      items,
    }, idx, asOfDay, settings));
  }

  // 2. Committed Response Plans
  for (const r of state.responsePlans || []) {
    if (!r || r.status !== 'committed') continue;
    const sourceCase = r.caseId ? idx.casesById.get(r.caseId) || null : null;
    if (sourceCase) coveredCaseIds.add(sourceCase.id);
    const committedDay = (r.committedAt || r.createdAt || '').slice(0, 10);
    const openedOn = (sourceCase?.openedOn && (!committedDay || sourceCase.openedOn < committedDay))
      ? sourceCase.openedOn
      : (committedDay || sourceCase?.openedOn || asOfDay);
    const items = [];
    const seenKeys = new Set();
    const pushUnique = (item) => {
      if (!item) return;
      const k = `${item.kind}:${item.id}`;
      if (seenKeys.has(k)) return;
      seenKeys.add(k);
      items.push(item);
    };

    const peerSources = [
      ...(idx.peersByNodeKey.get(`response:${r.id}`) || []),
      ...(sourceCase ? (idx.peersByNodeKey.get(`case:${sourceCase.id}`) || []) : []),
    ];
    for (const peer of peerSources) {
      if (peer.type === 'decision') {
        const d = idx.decisionsById.get(peer.id);
        if (d) pushUnique(scoreDecisionItem(d));
      } else if (peer.type === 'delegation') {
        const d = idx.delegationsById.get(peer.id);
        if (d) pushUnique(scoreDelegationItem(d, openedOn));
      } else if (peer.type === 'premise') {
        const pr = idx.premisesById.get(peer.id);
        if (pr) pushUnique(scorePremiseItem(pr, idx.latestOutcomeByPremiseId.get(pr.id), openedOn));
      } else if (peer.type === 'comms') {
        const dr = idx.commsById.get(peer.id);
        if (dr) pushUnique(scoreCommsItem(dr, idx.commsByCaseId.get(dr.caseId) || []));
      }
    }
    if (sourceCase) {
      for (const pr of idx.premisesByCaseId.get(sourceCase.id) || []) {
        pushUnique(scorePremiseItem(pr, idx.latestOutcomeByPremiseId.get(pr.id), openedOn));
      }
      for (const entry of idx.budgetLinesByCaseId.get(sourceCase.id) || []) {
        pushUnique(scoreBudgetItem(entry.budget, entry.line));
      }
      for (const dr of (idx.commsByCaseId.get(sourceCase.id) || []).filter((d) => d.status !== 'superseded' && d.status !== 'dismissed')) {
        pushUnique(scoreCommsItem(dr, idx.commsByCaseId.get(sourceCase.id) || []));
      }
    }

    loops.push(analyzeSingleLoop({
      loopKey: `response:${r.id}`,
      loopKind: 'response',
      sourceId: r.id,
      title: sourceCase?.title || r.caseInput?.title || `Response (${RESPONSE_LABELS[r.strategy] || r.strategy})`,
      sourceRoute: `#/responses?plan=${encodeURIComponent(r.id)}`,
      openedOn,
      reviewOn: r.reviewOn || sourceCase?.reviewOn || r.caseInput?.reviewOn || null,
      sourceCase,
      bundleRecord: null,
      responseRecord: r,
      items,
    }, idx, asOfDay, settings));
  }

  // 3. Coordinated Case Control Loops (cases with >= 2 linked clearance items,
  //    not already wrapped by a committed bundle or response plan).
  for (const c of state.cases || []) {
    if (!c?.id || coveredCaseIds.has(c.id)) continue;
    const openedOn = c.openedOn || asOfDay;
    const items = [];
    const seenKeys = new Set();
    const pushUnique = (item) => {
      if (!item) return;
      const k = `${item.kind}:${item.id}`;
      if (seenKeys.has(k)) return;
      seenKeys.add(k);
      items.push(item);
    };

    for (const peer of idx.peersByNodeKey.get(`case:${c.id}`) || []) {
      if (peer.type === 'decision') {
        const d = idx.decisionsById.get(peer.id);
        if (d) pushUnique(scoreDecisionItem(d));
      } else if (peer.type === 'delegation') {
        const d = idx.delegationsById.get(peer.id);
        if (d) pushUnique(scoreDelegationItem(d, openedOn));
      } else if (peer.type === 'premise') {
        const pr = idx.premisesById.get(peer.id);
        if (pr) pushUnique(scorePremiseItem(pr, idx.latestOutcomeByPremiseId.get(pr.id), openedOn));
      } else if (peer.type === 'comms') {
        const dr = idx.commsById.get(peer.id);
        if (dr && dr.status !== 'superseded' && dr.status !== 'dismissed') {
          pushUnique(scoreCommsItem(dr, idx.commsByCaseId.get(c.id) || []));
        }
      }
    }
    for (const pr of idx.premisesByCaseId.get(c.id) || []) {
      pushUnique(scorePremiseItem(pr, idx.latestOutcomeByPremiseId.get(pr.id), openedOn));
    }
    for (const entry of idx.budgetLinesByCaseId.get(c.id) || []) {
      pushUnique(scoreBudgetItem(entry.budget, entry.line));
    }
    for (const dr of (idx.commsByCaseId.get(c.id) || []).filter((d) => d.status !== 'superseded' && d.status !== 'dismissed')) {
      pushUnique(scoreCommsItem(dr, idx.commsByCaseId.get(c.id) || []));
    }

    if (items.length < 2 && !idx.settlementsByLoopKey.has(`case:${c.id}`)) continue;

    loops.push(analyzeSingleLoop({
      loopKey: `case:${c.id}`,
      loopKind: 'case-loop',
      sourceId: c.id,
      title: c.title || 'Coordinated case loop',
      sourceRoute: `#/cases/${encodeURIComponent(c.id)}`,
      openedOn,
      reviewOn: c.reviewOn || null,
      sourceCase: c,
      bundleRecord: null,
      responseRecord: null,
      items,
    }, idx, asOfDay, settings));
  }

  return loops;
}

/**
 * Pure What-If simulator: recomputes Lipke Earned Schedule, Fever Zone,
 * Attribution Regime and Brinson–Fachler Variance under hypothetical clearance
 * or spend overrides without mutating workspace state.
 */
export function rehearseLoopWhatIf(loop, overrides = {}, settingsInput = {}) {
  if (!loop) return null;
  const settings = normalizeSettlementSettings(settingsInput);
  const clearLeader = overrides.clearLeaderGates === true;
  const clearDelegate = overrides.clearDelegateGates === true;
  const thesisOverride = ['corroborated', 'falsified', 'untested'].includes(overrides.thesisState)
    ? overrides.thesisState
    : loop.thesisState;
  const simulatedDays = overrides.actualDays !== undefined && overrides.actualDays !== null && Number.isFinite(Number(overrides.actualDays))
    ? Math.max(0, Number(overrides.actualDays))
    : loop.schedule.elapsedDays;

  const items = loop.items.map((item) => {
    if (clearLeader && item.ownerSide === 'leader') return { ...item, score: 1, cleared: true };
    if (clearDelegate && item.ownerSide === 'delegate') return { ...item, score: 1, cleared: true };
    return item;
  });

  const meanPct = (arr) => (arr.length ? round2((arr.reduce((s, x) => s + x.score, 0) / arr.length) * 100) : null);
  const overallClearancePct = meanPct(items) ?? 0;
  const execItems = items.filter((i) => ['decision', 'comms', 'coaching', 'delegation'].includes(i.kind));
  const leaderItems = items.filter((i) => i.ownerSide === 'leader');
  const delegateItems = items.filter((i) => i.ownerSide === 'delegate');
  const executionClearancePct = meanPct(execItems) ?? overallClearancePct;
  const leaderClearancePct = meanPct(leaderItems);
  const delegateClearancePct = meanPct(delegateItems);
  const jointClearancePct = items.length
    ? round2(items.reduce((prod, item) => prod * (0.15 + 0.85 * item.score), 1) * 100)
    : 100;

  const plannedDays = loop.schedule.plannedDays;
  const progress = overallClearancePct / 100;
  const earnedScheduleDays = plannedDays ? round2(progress * plannedDays) : null;
  const atRatio = simulatedDays > 0 ? simulatedDays : 1;
  const spiT = earnedScheduleDays !== null ? round3(earnedScheduleDays / atRatio) : null;
  const svDays = earnedScheduleDays !== null ? round2(earnedScheduleDays - simulatedDays) : null;
  const windowBurnPct = plannedDays ? round2(Math.min(150, (simulatedDays / plannedDays) * 100)) : null;
  const overdue = Boolean(plannedDays && simulatedDays > plannedDays && progress < 0.999);

  const fever = classifyFeverZone({
    windowBurnPct,
    clearancePct: overallClearancePct,
    scheduled: Boolean(plannedDays),
    overdue,
  });

  const attribution = classifyAttributionRegime({
    thesisState: thesisOverride,
    executionClearancePct,
    leaderClearancePct,
    delegateClearancePct,
    leaderCount: leaderItems.length,
    delegateCount: delegateItems.length,
    feverZone: fever.zone,
    overdue,
    closedOutcome: thesisOverride !== 'untested' || loop.closedOutcome,
    fidelityFloorPct: settings.settlementFidelityFloorPct,
  });

  let simulatedVariance = loop.economicVariance;
  if (
    overrides.actualMitigation !== undefined
    && overrides.actualMitigation !== null
    && overrides.actualMitigation !== ''
    && Number.isFinite(Number(overrides.actualMitigation))
    && loop.economicVariance?.currency
  ) {
    simulatedVariance = computeEconomicVariance({
      plannedCurrency: loop.economicVariance.currency,
      actualCurrency: loop.economicVariance.currency,
      plannedMitigation: loop.economicVariance.plannedMitigation ?? 0,
      actualMitigation: Math.max(0, Number(overrides.actualMitigation)),
      committedEncumbrance: loop.economicVariance.committedEncumbrance,
      plannedDays: plannedDays ?? 14,
      actualDays: simulatedDays,
      plannedDailyCarry: loop.economicVariance.plannedDailyCarry ?? 0,
      actualDailyCarry: loop.economicVariance.actualDailyCarry ?? loop.economicVariance.plannedDailyCarry ?? 0,
      hasDatedActualSpend: true,
    });
  }

  return {
    overallClearancePct,
    executionClearancePct,
    leaderClearancePct,
    delegateClearancePct,
    jointClearancePct,
    spiT,
    svDays,
    windowBurnPct,
    fever,
    thesisState: thesisOverride,
    attribution,
    economicVariance: simulatedVariance,
  };
}

/** Build a verdict object from a live loop analysis (plus optional frozen forecast). */
export function buildSettlementVerdict(loop, { predictedCleanClosurePct = null, frozenAt = null, settledAt = null } = {}) {
  const outcomeY = loop.cleanClosure ? 1 : 0;
  const canGradeBrier = predictedCleanClosurePct !== null
    && Number.isFinite(Number(predictedCleanClosurePct))
    && (!frozenAt || !settledAt || frozenAt <= settledAt);
  const p = canGradeBrier ? Number(predictedCleanClosurePct) / 100 : null;
  const brier = p !== null ? round4((p - outcomeY) ** 2) : null;
  const ev = loop.economicVariance?.status === 'settled' ? loop.economicVariance : null;

  return {
    regime: loop.attribution.regime,
    thesisState: loop.thesisState,
    clearancePct: loop.overallClearancePct,
    leaderClearancePct: loop.leaderClearancePct,
    delegateClearancePct: loop.delegateClearancePct,
    spiT: loop.schedule.spiT,
    svDays: loop.schedule.svDays,
    feverZone: loop.fever.zone,
    cleanClosure: loop.cleanClosure,
    brier,
    currency: ev ? ev.currency : (loop.policyRegret?.currency || null),
    plannedCost: ev ? ev.plannedCost : null,
    realizedCost: ev ? ev.realizedCost : null,
    varianceTotal: ev ? ev.varianceTotal : null,
    scheduleEffect: ev ? ev.scheduleEffect : null,
    rateEffect: ev ? ev.rateEffect : null,
    interactionEffect: ev ? ev.interactionEffect : null,
    realizedRegret: loop.policyRegret ? loop.policyRegret.realizedRegret : null,
  };
}

/** Out-of-sample Brier & Wilson summary across settled receipts. */
export function summarizeSettlementCalibration(settlements = []) {
  const active = (settlements || []).filter((s) => s && s.status !== 'archived');
  const settled = active.filter((s) => s.status === 'settled' && s.verdict);
  const frozenOpen = active.filter((s) => s.status === 'frozen');
  const graded = settled.filter((s) => s.verdict?.brier !== null && s.predictedCleanClosurePct !== null);

  const cleanClosures = settled.filter((s) => s.verdict.cleanClosure).length;
  const exonerations = settled.filter((s) => s.verdict.regime === 'thesis-falsified-clean-execution').length;
  const leaderBottlenecks = settled.filter((s) => s.verdict.regime === 'execution-stalled-leader-gated').length;

  const meanBrier = graded.length
    ? round4(graded.reduce((sum, s) => sum + s.verdict.brier, 0) / graded.length)
    : null;
  const baseRate = graded.length
    ? graded.filter((s) => s.verdict.cleanClosure).length / graded.length
    : null;
  const referenceBrier = baseRate !== null ? round4(baseRate * (1 - baseRate)) : null;
  const skillSupported = graded.length >= SETTLEMENT_LIMITS.minSkillSamples && referenceBrier !== null && referenceBrier > 0;
  const brierSkill = skillSupported ? round3(1 - meanBrier / referenceBrier) : null;

  return {
    totalRecords: active.length,
    frozenCount: frozenOpen.length,
    settledCount: settled.length,
    gradedCount: graded.length,
    minSkillSamples: SETTLEMENT_LIMITS.minSkillSamples,
    skillSupported,
    meanBrier,
    referenceBrier,
    brierSkill,
    cleanClosureInterval: wilsonIntervalPct(cleanClosures, settled.length),
    exonerationInterval: wilsonIntervalPct(exonerations, settled.length),
    leaderBottleneckInterval: wilsonIntervalPct(leaderBottlenecks, settled.length),
  };
}

/** Primary read model for the Outcome Attribution & Loop Settlement Terminal. */
export function settlementReport(state = {}, now = new Date(), settingsInput = null, focusKey = null) {
  const settings = normalizeSettlementSettings(settingsInput || state?.settings || {});
  const asOfDay = dayKey(now);
  const loops = extractControlLoops(state, now, settings);
  const settlements = (state.settlements || []).filter((s) => s && s.status !== 'archived');
  const calibration = summarizeSettlementCalibration(settlements);

  const byRegime = {};
  for (const r of Object.keys(SETTLEMENT_REGIME_META)) {
    byRegime[r] = loops.filter((l) => l.attribution.regime === r).length;
  }
  const byZone = {
    green: loops.filter((l) => l.fever.zone === 'green').length,
    watch: loops.filter((l) => l.fever.zone === 'watch').length,
    red: loops.filter((l) => l.fever.zone === 'red').length,
    unscheduled: loops.filter((l) => l.fever.zone === 'unscheduled').length,
  };

  // Per-currency variance rollup across settled economics (strictly separated by currency).
  const currencyMap = new Map();
  for (const loop of loops) {
    const ev = loop.economicVariance;
    if (ev?.status !== 'settled' || !ev.currency) continue;
    if (!currencyMap.has(ev.currency)) {
      currencyMap.set(ev.currency, {
        currency: ev.currency,
        loops: 0,
        plannedCost: 0,
        realizedCost: 0,
        varianceTotal: 0,
        scheduleEffect: 0,
        rateEffect: 0,
        interactionEffect: 0,
      });
    }
    const g = currencyMap.get(ev.currency);
    g.loops += 1;
    g.plannedCost = round2(g.plannedCost + ev.plannedCost);
    g.realizedCost = round2(g.realizedCost + ev.realizedCost);
    g.varianceTotal = round2(g.varianceTotal + ev.varianceTotal);
    g.scheduleEffect = round2(g.scheduleEffect + ev.scheduleEffect);
    g.rateEffect = round2(g.rateEffect + ev.rateEffect);
    g.interactionEffect = round2(g.interactionEffect + ev.interactionEffect);
  }
  const varianceByCurrency = [...currencyMap.values()].sort((a, b) => a.currency.localeCompare(b.currency));

  const dueUnsettled = loops.filter(
    (l) => l.reviewOn && l.reviewOn <= asOfDay && l.settlementRecord?.status !== 'settled',
  );
  const dueFrozen = settlements.filter(
    (s) => s.status === 'frozen' && s.reviewOn && s.reviewOn <= asOfDay,
  );
  const leaderGatedRed = loops.filter(
    (l) => l.attribution.regime === 'execution-stalled-leader-gated' && l.fever.zone === 'red',
  );
  const exoneratedLoops = loops.filter(
    (l) => l.attribution.regime === 'thesis-falsified-clean-execution',
  );

  const focused = (focusKey && loops.find((l) => l.loopKey === focusKey || l.settlementRecord?.id === focusKey))
    || dueUnsettled[0]
    || leaderGatedRed[0]
    || exoneratedLoops[0]
    || loops[0]
    || null;

  return {
    engineVersion: SETTLEMENT_ENGINE_VERSION,
    asOfDay,
    settings,
    loops,
    focused,
    settlements,
    calibration,
    byRegime,
    byZone,
    varianceByCurrency,
    mixedVarianceCurrencies: varianceByCurrency.length > 1,
    counts: {
      loops: loops.length,
      bundles: loops.filter((l) => l.loopKind === 'bundle').length,
      responses: loops.filter((l) => l.loopKind === 'response').length,
      caseLoops: loops.filter((l) => l.loopKind === 'case-loop').length,
      dueUnsettled: dueUnsettled.length,
      dueFrozen: dueFrozen.length,
      leaderGatedRed: leaderGatedRed.length,
      exonerated: exoneratedLoops.length,
      attention: dueUnsettled.length + leaderGatedRed.length + dueFrozen.length,
    },
  };
}

export function settlementAttentionCount(state = {}, now = new Date()) {
  const r = settlementReport(state, now);
  return r.counts.dueUnsettled + r.counts.leaderGatedRed;
}

/** Read-side Insights signals (`Outcome attribution` bucket in `DOMAIN_ORDER`). */
export function settlementSignals(state = {}, now = new Date()) {
  const report = settlementReport(state, now);
  const signals = [];

  for (const loop of report.loops) {
    // Only emit signals for explicitly adopted bundles/responses, loops with a
    // declared reviewOn window, or loops with an explicit settlement record.
    if (loop.loopKind === 'case-loop' && !loop.reviewOn && !loop.settlementRecord) continue;
    const route = `#/attribution?loop=${encodeURIComponent(loop.loopKey)}`;

    if (loop.attribution.regime === 'thesis-falsified-clean-execution' && loop.settlementRecord?.status !== 'settled') {
      signals.push({
        ruleId: 'STL-01',
        domain: 'Outcome attribution',
        title: `Exonerate clean delivery & pivot thesis: “${loop.title}”`,
        detail: `Delegated execution cleared at ${loop.delegateClearancePct ?? loop.executionClearancePct}% (floor ${report.settings.settlementFidelityFloorPct}%), yet the governing premise or case outcome failed. Credit the team for clean delivery and settle the double-loop pivot.`,
        severity: 4,
        confidence: 'high',
        evidence: [
          `Execution clearance: ${loop.executionClearancePct}%`,
          `Thesis state: ${loop.thesisLabel}`,
          `Loop type: ${loop.loopKindLabel}`,
        ],
        action: { label: 'Settle & credit team', route },
      });
    } else if (loop.attribution.regime === 'execution-stalled-leader-gated' && loop.fever.zone === 'red') {
      signals.push({
        ruleId: 'STL-02',
        domain: 'Outcome attribution',
        title: `Leader-gated clearance bottleneck: “${loop.title}”`,
        detail: `Leader-owned clearances sit at ${loop.leaderClearancePct}% while window burn is ${loop.schedule.windowBurnPct}% (SPI(t) ${loop.schedule.spiT ?? '—'}). Clear your unchosen decision or brief before assigning follow-up work.`,
        severity: 4,
        confidence: 'high',
        evidence: [
          `Leader clearance: ${loop.leaderClearancePct}% (${loop.counts.leaderCleared}/${loop.counts.leader})`,
          `Delegate clearance: ${loop.delegateClearancePct ?? 'n/a'}%`,
          `Fever zone: ${loop.fever.label}`,
        ],
        action: { label: 'Clear leader bottleneck', route },
      });
    } else if (
      loop.reviewOn
      && loop.schedule.daysPastReview >= report.settings.settlementStaleDays
      && loop.settlementRecord?.status !== 'settled'
      && (loop.loopKind !== 'case-loop' || loop.settlementRecord)
    ) {
      signals.push({
        ruleId: 'STL-03',
        domain: 'Outcome attribution',
        title: `Overdue loop settlement (${loop.schedule.daysPastReview}d past review): “${loop.title}”`,
        detail: `Review date ${loop.reviewOn} passed ${loop.schedule.daysPastReview} day(s) ago at ${loop.overallClearancePct}% clearance (${loop.attribution.meta.label}). Record the settlement receipt so lessons and variance are captured.`,
        severity: 3,
        confidence: 'medium',
        evidence: [
          `Review due: ${loop.reviewOn}`,
          `Lipke SPI(t): ${loop.schedule.spiT ?? '—'} · SV(t): ${loop.schedule.svDays ?? '—'}d`,
          `Regime: ${loop.attribution.meta.label}`,
        ],
        action: { label: 'Open loop settlement', route },
      });
    }
  }

  if (report.calibration.gradedCount >= SETTLEMENT_LIMITS.minSkillSamples && report.calibration.brierSkill !== null && report.calibration.brierSkill < 0) {
    signals.push({
      ruleId: 'STL-04',
      domain: 'Outcome attribution',
      title: 'Loop closure forecasts underperform workspace base rate',
      detail: `Across ${report.calibration.gradedCount} graded loop forecasts, mean Brier is ${report.calibration.meanBrier} vs base-rate ${report.calibration.referenceBrier} (skill ${report.calibration.brierSkill}). Temper closure confidence on multi-gate bundles.`,
      severity: 2,
      confidence: 'medium',
      evidence: [
        `Graded forecasts: ${report.calibration.gradedCount}`,
        `Mean Brier: ${report.calibration.meanBrier}`,
        `Brier skill: ${report.calibration.brierSkill}`,
      ],
      action: { label: 'Inspect calibration ledger', route: '#/attribution?panel=ledger' },
    });
  }

  return signals;
}

/** Deterministic board- & retro-ready plain-text brief. */
export function buildSettlementBrief(report, focusLoop = report?.focused, now = new Date()) {
  const lines = [];
  lines.push(`OUTCOME ATTRIBUTION & LOOP SETTLEMENT BRIEF (${SETTLEMENT_ENGINE_VERSION})`);
  lines.push(`Generated: ${dayKey(now)} · Fidelity floor: ${report.settings.settlementFidelityFloorPct}% · Active loops: ${report.counts.loops}`);
  lines.push(`Fever distribution: Green ${report.byZone.green} · Watch ${report.byZone.watch} · Red ${report.byZone.red} · Unscheduled ${report.byZone.unscheduled}`);
  lines.push(
    `Calibration ledger: ${report.calibration.settledCount} settled, ${report.calibration.gradedCount} Brier-graded`
    + (report.calibration.meanBrier !== null ? ` · mean Brier ${report.calibration.meanBrier}` : '')
    + (report.calibration.skillSupported ? ` · skill ${report.calibration.brierSkill}` : ` · skill withheld (< ${SETTLEMENT_LIMITS.minSkillSamples} graded)`),
  );

  if (focusLoop) {
    lines.push('');
    lines.push(`FOCUSED LOOP — ${focusLoop.title} [${focusLoop.loopKindLabel}]`);
    lines.push(`Window: ${focusLoop.openedOn} -> ${focusLoop.reviewOn || 'unscheduled'} · Clearance: ${focusLoop.overallClearancePct}% (joint Pressman-Wildavsky ${focusLoop.jointClearancePct}%)`);
    lines.push(`Earned Schedule (Lipke): ES ${focusLoop.schedule.earnedScheduleDays ?? 'n/a'}d · AT ${focusLoop.schedule.elapsedDays}d · SPI(t) ${focusLoop.schedule.spiT ?? 'n/a'} · SV(t) ${focusLoop.schedule.svDays ?? 'n/a'}d · Fever: ${focusLoop.fever.label}`);
    lines.push(`Gate ownership: Leader ${focusLoop.leaderClearancePct ?? 'n/a'}% (${focusLoop.counts.leaderCleared}/${focusLoop.counts.leader}) · Delegate ${focusLoop.delegateClearancePct ?? 'n/a'}% (${focusLoop.counts.delegateCleared}/${focusLoop.counts.delegate})`);
    lines.push(`Attribution regime: ${focusLoop.attribution.meta.label} · Thesis: ${focusLoop.thesisLabel}`);
    lines.push(`Guidance: ${focusLoop.attribution.meta.actionGuidance}`);
    const ev = focusLoop.economicVariance;
    if (ev?.status === 'settled') {
      lines.push(`Brinson-Fachler variance (${ev.currency}): Planned ${ev.plannedCost} vs Realized ${ev.realizedCost} -> Delta ${ev.varianceTotal} = Schedule ${ev.scheduleEffect} + Rate/Spend ${ev.rateEffect} + Interaction ${ev.interactionEffect} (residual ${ev.residual})`);
    } else if (ev?.reason) {
      lines.push(`Economic variance: ${ev.status} — ${ev.reason}`);
    }
    if (focusLoop.policyRegret) {
      const pr = focusLoop.policyRegret;
      lines.push(`Counterfactual policy regret (${pr.currency}): Chosen ${pr.chosenLabel} (${pr.chosenCost}) vs hindsight optimum ${pr.hindsightBestLabel} (${pr.hindsightBestCost}) -> Regret ${pr.realizedRegret}`);
    }
  }

  lines.push('');
  lines.push('Epistemic boundary: Operational attribution separates recorded gate completion from premise settlement. It never scores personal traits, never assumes exchange rates across currencies, and never treats encumbered commitments as actual spend.');
  return lines.join('\n');
}
