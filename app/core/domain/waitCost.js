/**
 * app/core/domain/waitCost.js — the Cost of Waiting Terminal's engine (Schema
 * v64). Pure read model: no persistence, no UI, no clock of its own.
 *
 * ADR-0053: Session 89 shipped the Delivery Survival Terminal, which answers
 * "how long does work like this take here, censoring honestly". Its own
 * roadmap entry said the next gap out loud: *the cost of the wait is a
 * sentence, not a number*. This module makes it a number.
 *
 * The price of waiting was always in the workspace — decision tempo derives a
 * carrying cost per week from a decision's value at stake (Reinertsen 2009
 * cost-of-delay, linear profile), and the finance module holds real money —
 * but nothing joined that price to the empirical time-to-finish curve. This
 * engine joins them:
 *
 *   weekly delay cost of an open item  =  declared weekly price of its class
 *                                          (or the decision's own derived
 *                                          rate from its value at stake)
 *
 *   LEGACY ENDPOINT LOWER BOUND            = weekly cost × N × P(still open at
 *                                          age + 7N | survived to age), where
 *                                          the probability comes from the
 *                                          class's own Kaplan–Meier curve.
 *   Session 93 / ADR-0056 proved that this endpoint-only product is NOT the
 *   expected carrying cost: items closing before the horizon still waited.
 *   The Consequence Lab integrates the whole conditional survival curve for
 *   the expected time; this module preserves old certificates and CSV keys
 *   but labels their value as a lower bound, never a forecast of net savings.
 *
 * Doctrine carried over from the modules it reads:
 *   - Currencies are NEVER summed across units; every aggregate is per currency.
 *   - An unpriced wait is reported as `unpriced`, never as zero.
 *   - Below the at-risk floor no probability is printed; the scenario cell
 *     says why instead of showing a guess.
 *   - No person is scored. The price attaches to the work item, and the curve
 *     is a property of a class of work in a system.
 *   - Nothing is invented for an existing workspace: with no declared price
 *     and no priced decision, the report says "unpriced" everywhere.
 */

import { dayKey, weekKey, round } from '../time.js';
import {
  SURVIVAL_CLASSES,
  classTransport,
  conventionsFromSettings as survivalConventions,
  resolveOwner,
  survivalReport,
} from './survival.js';
import {
  classifyDecisionType,
  decisionValueTerms,
  derivedRatePerWeek,
  guardrailDaysFor,
} from './decisionTempo.js';

export const WAIT_ENGINE_VERSION = 'waitcost-2026.10-v1';

/* ------------------------------------------------------------------ */
/* 0. Vocabulary and conventions                                       */
/* ------------------------------------------------------------------ */

export const WAIT_DEFAULTS = Object.freeze({
  // Window, in weeks, over which a decision's value at stake is spread to get
  // a weekly carrying cost (Reinertsen linear cost-of-delay profile). A
  // declared convention, not an economic constant.
  waitErosionWeeks: 12,
  // Comma-separated scenario horizons in weeks: "if I wait this many more
  // weeks, what is the legacy endpoint-only LOWER BOUND on carrying cost?"
  waitScenarioWeeks: '1,2,4,8',
  // Weekly priced exposure per currency above which the scan opens one triage
  // DACI decision. 0 means "any priced overdue exposure at all", which is safe
  // because nothing is priced until the leader declares a price.
  waitTriageThreshold: 0,
  // Exits in a class needed before a row's confidence is called "high".
  waitConfidenceFloor: 5,
  // Owned tasks opened per scan for priced overdue items.
  waitMaxTasksPerScan: 5,
  // Owned tasks opened per scan to price currently-unpriced overdue items.
  waitMaxPriceTasks: 3,
  // `prices-delay` edges written per exposure certificate.
  waitMaxLinks: 40,
  // Exposure certificates retained (append-only audit history).
  waitExposureCap: 60,
  // Post-commit propagation pause. An explicit scan always runs.
  waitAutoPropagate: true,
});

export function waitConventionsFromSettings(settings = {}) {
  const s = settings || {};
  const num = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const int = (value, fallback, min, max) => Math.min(max, Math.max(min, Math.round(num(value, fallback))));
  const rawWeeks = String(s.waitScenarioWeeks ?? WAIT_DEFAULTS.waitScenarioWeeks)
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 52);
  const weeks = [...new Set(rawWeeks)].sort((a, b) => a - b).slice(0, 6);
  const surv = survivalConventions(s);
  return {
    erosionWeeks: int(s.waitErosionWeeks, WAIT_DEFAULTS.waitErosionWeeks, 1, 52),
    scenarioWeeks: weeks.length ? weeks : [1, 2, 4, 8],
    triageThreshold: Math.min(1e12, Math.max(0, num(s.waitTriageThreshold, WAIT_DEFAULTS.waitTriageThreshold))),
    confidenceFloor: int(s.waitConfidenceFloor, WAIT_DEFAULTS.waitConfidenceFloor, 2, 100),
    maxTasksPerScan: int(s.waitMaxTasksPerScan, WAIT_DEFAULTS.waitMaxTasksPerScan, 0, 10),
    maxPriceTasks: int(s.waitMaxPriceTasks, WAIT_DEFAULTS.waitMaxPriceTasks, 0, 10),
    maxLinks: int(s.waitMaxLinks, WAIT_DEFAULTS.waitMaxLinks, 1, 200),
    exposureCap: int(s.waitExposureCap, WAIT_DEFAULTS.waitExposureCap, 10, 200),
    autoPropagate: s.waitAutoPropagate !== false,
    // The survival conventions this engine reads through (at-risk floor,
    // observed-tail cap) so the two terminals can never disagree.
    minAtRisk: surv.minAtRisk,
  };
}

export const WAIT_SIGNAL_IDS = Object.freeze([
  'WAIT-01', 'WAIT-02', 'WAIT-03', 'WAIT-04', 'WAIT-05', 'WAIT-06',
]);

export const WAIT_CLASS_KEYS = Object.freeze(SURVIVAL_CLASSES.map((row) => row.key));

const CLASS_LABELS = new Map(SURVIVAL_CLASSES.map((row) => [row.key, row.label]));

export function classLabel(key) {
  return CLASS_LABELS.get(key) || key || 'work';
}

/* ------------------------------------------------------------------ */
/* 1. Prices                                                           */
/* ------------------------------------------------------------------ */

function finitePositive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * The latest declared weekly price for a class. Newer declarations supersede
 * older ones; the history stays in the collection so the audit trail keeps the
 * earlier price. Returns null when the class is unpriced — unpriced is a
 * state, not a zero.
 */
export function activeWaitPrice(state, classKey) {
  const rows = (Array.isArray(state?.waitPrices) ? state.waitPrices : [])
    .filter((row) => row && row.classKey === classKey && Number.isFinite(Number(row.weeklyAmount)));
  if (!rows.length) return null;
  const latest = rows.reduce((best, row) => {
    const a = String(row.declaredOn || '');
    const b = String(best.declaredOn || '');
    return a >= b ? row : best;
  });
  return {
    id: latest.id,
    classKey,
    weeklyAmount: round(Number(latest.weeklyAmount), 2),
    currency: String(latest.currency || 'USD').toUpperCase(),
    declaredOn: latest.declaredOn || null,
  };
}

function decisionRecordFor(state, sourceId) {
  return (Array.isArray(state?.decisions) ? state.decisions : []).find((row) => row && row.id === sourceId) || null;
}

/**
 * The weekly delay price of one open work item.
 *
 *   - A decision is priced from its own value at stake: the linked-record
 *     valuation decision tempo already computes (cases, budgets, portfolio
 *     value, negotiations, dependency shortfalls), spread over the declared
 *     erosion window. This is Reinertsen's linear cost-of-delay profile: the
 *     value erodes evenly per week of indecision.
 *   - Every other class is priced by the leader's declared weekly price for
 *     that class.
 *   - Otherwise: unpriced. Never zero.
 */
export function priceForRow(state, row, conventions) {
  const item = row?.item || {};
  if (item.kind === 'decision') {
    const decision = decisionRecordFor(state, item.sourceId);
    if (decision) {
      const terms = decisionValueTerms(state, decision);
      if (terms.priced && terms.dominant) {
        const rate = derivedRatePerWeek(terms.dominant.amount, conventions.erosionWeeks);
        return {
          priced: true,
          weeklyAmount: rate,
          currency: terms.dominant.currency,
          source: 'derived',
          sourceLabel: 'derived from the decision’s own value at stake',
          basis: `${terms.dominant.currency} ${round(terms.dominant.amount, 2)} at stake ÷ ${conventions.erosionWeeks} week erosion window = ${rate}/week (linear cost-of-delay profile, Reinertsen 2009), from ${terms.termCount} linked value term(s)`,
          valueAtStake: round(terms.dominant.amount, 2),
        };
      }
    }
  }
  const classPrice = activeWaitPrice(state, item.kind);
  if (classPrice) {
    return {
      priced: true,
      weeklyAmount: classPrice.weeklyAmount,
      currency: classPrice.currency,
      source: 'declared',
      sourceLabel: `declared ${classLabel(item.kind).toLowerCase()} price`,
      basis: `Leader-declared weekly price for ${classLabel(item.kind).toLowerCase()}, declared ${classPrice.declaredOn || 'earlier'} (${classPrice.id})`,
      valueAtStake: null,
    };
  }
  return {
    priced: false,
    weeklyAmount: null,
    currency: null,
    source: 'unpriced',
    sourceLabel: 'unpriced — not zero',
    basis: item.kind === 'decision'
      ? 'This decision has no linked value at stake and the decisions class has no declared weekly price, so its wait is unpriced. Unpriced is not zero.'
      : `No weekly price has been declared for ${classLabel(item.kind).toLowerCase()}, so its wait is unpriced. Unpriced is not zero.`,
    valueAtStake: null,
  };
}

/* ------------------------------------------------------------------ */
/* 2. The wait scenario: P(still open in N more weeks | current age)   */
/* ------------------------------------------------------------------ */

/**
 * P(the item is still open `extraDays` from now, given it has survived
 * `elapsedDays`), read off the class's own Kaplan–Meier curve:
 *
 *   P = S(age + extra) / S(age)
 *
 * The same floors as the survival terminal apply: below the at-risk floor no
 * number is printed, and beyond the longest observation the tail is flagged
 * as extrapolated rather than drawn silently.
 */
export function stillOpenProbability(curve, elapsedDays, extraDays, minAtRisk) {
  if (!curve || !curve.steps?.length) {
    return { available: false, probability: null, reason: 'no dated record of this class exists yet' };
  }
  if (!Number.isFinite(elapsedDays) || elapsedDays < 0) {
    return { available: false, probability: null, reason: 'the item has no start date' };
  }
  const survivalNow = curve.survivalAt(elapsedDays);
  if (survivalNow <= 0) {
    return { available: false, probability: null, reason: 'every comparable item has already exited the risk set' };
  }
  const atRisk = curve.atRiskAt(elapsedDays);
  if (atRisk < minAtRisk) {
    return {
      available: false,
      probability: null,
      atRisk,
      reason: `only ${atRisk} comparable item(s) remain at risk at day ${Math.round(elapsedDays)}; the reading floor is ${minAtRisk}`,
    };
  }
  const target = elapsedDays + Math.max(0, finitePositive(extraDays) ?? 0);
  const survivalTarget = curve.survivalAt(target);
  const probability = Math.max(0, Math.min(1, survivalTarget / survivalNow));
  const beyondEvidence = target > curve.maxObservedDays;
  return {
    available: true,
    probability: round(probability, 4),
    probabilityPct: round(probability * 100, 1),
    atRisk,
    survivalNow: round(survivalNow, 4),
    beyondEvidence,
    reason: beyondEvidence
      ? `the horizon reaches day ${Math.round(target)}, past the longest observation on record (${Math.round(curve.maxObservedDays)} days), so the tail is extrapolated rather than observed`
      : '',
  };
}

/* ------------------------------------------------------------------ */
/* 3. Confidence                                                       */
/* ------------------------------------------------------------------ */

/**
 * A confidence label per row, so the page never presents a flat number as
 * equally trustworthy. "high" needs a price AND enough comparable exits in
 * the class AND enough items still at risk right now; anything less says so.
 *
 * Transport is read per axis (Session 95, ADR-0058): this terminal's
 * scenarios are built on time to *any* exit, so a failed timing axis caps
 * the row at low, exactly as the old generic drift flag did. A failed
 * *completion* axis alone does not touch the scenario arithmetic — weekly
 * exposure and still-open timing still describe recent work — but it does
 * undermine this row's "overdue against the class completion median"
 * framing, so the basis names that instead of silently discounting the
 * whole row. A favorable completion shift makes pooled completion figures
 * conservative, which the basis also says. No price or probability is ever
 * adjusted by this function; it labels, it does not correct.
 */
export function rowConfidence(row, price, conventions) {
  const klass = row.klass || {};
  const exits = Number(klass.counts?.exits) || 0;
  const atRisk = row.reading?.atRisk ?? klass.curve?.atRiskAt?.(row.item?.elapsedDays ?? 0) ?? null;
  const transport = klass.transport || classTransport(klass);
  if (!price.priced) {
    return { level: 'low', basis: 'unpriced — the wait has no declared cost, so no confidence in a figure is possible', transport };
  }
  if (transport.timing.status === 'undermined') {
    return {
      level: 'low',
      basis: `Timing transport failed: ${transport.timing.basis}. No price or probability has been silently adjusted.`,
      transport,
    };
  }
  const transportNote = transport.completion.status === 'undermined'
    ? ` · completion transport failed (${transport.decompVerdict}) — this row's overdue framing against the class completion median is not quotable; the weekly exposure and still-open timing are unaffected`
    : transport.completion.status === 'favorable-shift'
      ? ` · completion improved in the recent cohort (${transport.decompVerdict}) — completion-median framing is conservative, not optimistic`
      : '';
  if (exits >= conventions.confidenceFloor && (atRisk === null || atRisk >= conventions.minAtRisk)) {
    return {
      level: 'high',
      basis: `${price.source === 'declared' ? 'declared' : 'derived'} price · ${exits} exit(s) in the class · ${atRisk === null ? 'at-risk unknown' : `${atRisk} still at risk`}${transportNote}`,
      transport,
    };
  }
  if (exits >= conventions.minAtRisk || (atRisk !== null && atRisk >= conventions.minAtRisk)) {
    return {
      level: 'medium',
      basis: `${price.source === 'declared' ? 'declared' : 'derived'} price · thin evidence (${exits} exit(s), ${atRisk === null ? 'at-risk unknown' : `${atRisk} at risk`}) — the price is real, the curve is thin${transportNote}`,
      transport,
    };
  }
  return {
    level: 'low',
    basis: `${price.source === 'declared' ? 'declared' : 'derived'} price · almost no evidence in the class (${exits} exit(s)) — treat the scenario as a shape, not a number${transportNote}`,
    transport,
  };
}

/* ------------------------------------------------------------------ */
/* 4. The report                                                       */
/* ------------------------------------------------------------------ */

function scenarioForRow(row, price, conventions) {
  const scenarios = [];
  for (const weeks of conventions.scenarioWeeks) {
    const extraDays = weeks * 7;
    const stillOpen = stillOpenProbability(row.klass?.curve, row.item?.elapsedDays, extraDays, conventions.minAtRisk);
    if (!price.priced) {
      scenarios.push({ weeks, available: false, reason: 'unpriced' });
      continue;
    }
    if (!stillOpen.available) {
      scenarios.push({ weeks, available: false, reason: stillOpen.reason });
      continue;
    }
    // Compatibility: this v64 field is named `expectedAdditionalCost` in old
    // certificates/CSV, but the endpoint-only product is a LOWER BOUND on
    // expected outstanding-time cost. v67 Consequence Lab integrates the KM
    // curve exactly for a root decision, without rewriting old snapshots.
    const expectedCost = round(price.weeklyAmount * weeks * stillOpen.probability, 2);
    scenarios.push({
      weeks,
      available: true,
      stillOpenPct: stillOpen.probabilityPct,
      beyondEvidence: stillOpen.beyondEvidence,
      expectedAdditionalCost: expectedCost,
      reason: stillOpen.reason || '',
    });
  }
  return scenarios;
}

function summarizeCurrencyTotals(rows) {
  const byCurrency = new Map();
  for (const row of rows) {
    const price = row.price;
    if (!price.priced) continue;
    const currency = price.currency;
    if (!byCurrency.has(currency)) {
      byCurrency.set(currency, {
        currency,
        weeklyExposure: 0,
        weeklyExposureOverdue: 0,
        pricedItems: 0,
        overduePricedItems: 0,
        topItemShare: 0,
        topItemKey: null,
        scenarios: [],
        scenarioRows: 0,
      });
    }
    const bucket = byCurrency.get(currency);
    bucket.weeklyExposure = round(bucket.weeklyExposure + price.weeklyAmount, 2);
    bucket.pricedItems += 1;
    if (row.overdue) {
      bucket.weeklyExposureOverdue = round(bucket.weeklyExposureOverdue + price.weeklyAmount, 2);
      bucket.overduePricedItems += 1;
    }
  }
  for (const bucket of byCurrency.values()) {
    // Concentration within one currency only — money is never pooled across
    // currencies, and a share is computed inside a single currency's bucket.
    const overdueRows = rows.filter((row) => row.price.priced && row.price.currency === bucket.currency && row.overdue);
    if (overdueRows.length && bucket.weeklyExposureOverdue > 0) {
      const top = overdueRows.reduce((best, row) => (row.price.weeklyAmount > (best?.price.weeklyAmount || -1) ? row : best), null);
      bucket.topItemShare = round((top.price.weeklyAmount / bucket.weeklyExposureOverdue) * 100, 1);
      bucket.topItemKey = top.item.key;
    }
    // Aggregate scenarios per currency: only rows whose curve could answer.
    for (const weeks of [...new Set(rows.flatMap((row) => row.scenarios.map((s) => s.weeks)))].sort((a, b) => a - b)) {
      const applicable = rows.filter((row) => (
        row.price.priced
        && row.price.currency === bucket.currency
        && row.scenarios.some((s) => s.weeks === weeks && s.available)
      ));
      const expected = round(applicable.reduce((sum, row) => {
        const scenario = row.scenarios.find((s) => s.weeks === weeks);
        return sum + (scenario.available ? scenario.expectedAdditionalCost : 0);
      }, 0), 2);
      bucket.scenarios.push({ weeks, expectedAdditionalCost: expected, coveredRows: applicable.length });
      bucket.scenarioRows = Math.max(bucket.scenarioRows, applicable.length);
    }
  }
  return [...byCurrency.values()].sort((a, b) => b.weeklyExposureOverdue - a.weeklyExposureOverdue);
}

/**
 * The report every screen, signal and rule reads. Pure: recomputed from the
 * workspace on every call, so no stored figure can drift from the records
 * that produced it.
 */
export function waitCostReport(state, now = new Date(), settings = {}) {
  const conventions = waitConventionsFromSettings(settings);
  const surv = survivalReport(state, now, settings);
  const today = surv.today;

  const rows = surv.openItems.map((row) => {
    const price = priceForRow(state, row, conventions);
    const overdue = Boolean(row.pastMedian);
    const severe = Boolean(row.percentile?.available && row.percentile.percentile >= 90);
    const confidence = rowConfidence(row, price, conventions);
    const scenarios = scenarioForRow(row, price, conventions);
    return {
      item: row.item,
      klass: row.klass,
      reading: row.reading,
      percentile: row.percentile,
      pastMedian: row.pastMedian,
      overdueBy: row.overdueBy,
      overdue,
      severe,
      price,
      confidence,
      scenarios,
      // Decision guardrail position, for signal WAIT-05 and the queue table.
      guardrail: null,
    };
  });

  for (const row of rows) {
    if (row.item.kind !== 'decision') continue;
    const decision = decisionRecordFor(state, row.item.sourceId);
    if (!decision) continue;
    const type = classifyDecisionType(decision, decisionValueTerms(state, decision), settings).type;
    const guardrail = guardrailDaysFor(type, settings);
    row.guardrail = {
      type,
      days: guardrail,
      past: row.item.elapsedDays > guardrail,
      elapsedDays: row.item.elapsedDays,
    };
  }

  // Ranked: priced overdue first by weekly cost, then priced open, then
  // unpriced by age. An unpriced row never sorts above a priced one — an
  // unknown cost is not a small cost, but it is also not a claim of one.
  rows.sort((a, b) => {
    if (a.price.priced !== b.price.priced) return a.price.priced ? -1 : 1;
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (a.price.priced && b.price.priced) return b.price.weeklyAmount - a.price.weeklyAmount;
    return b.item.elapsedDays - a.item.elapsedDays;
  });

  const totals = summarizeCurrencyTotals(rows);
  const unpricedOverdue = rows.filter((row) => !row.price.priced && row.overdue);
  const pricedOverdue = rows.filter((row) => row.price.priced && row.overdue);

  return {
    today,
    week: weekKey(now) || today,
    conventions,
    survival: surv,
    rows,
    totals,
    counts: {
      open: rows.length,
      priced: rows.filter((row) => row.price.priced).length,
      unpriced: rows.filter((row) => !row.price.priced).length,
      overdue: rows.filter((row) => row.overdue).length,
      pricedOverdue: pricedOverdue.length,
      unpricedOverdue: unpricedOverdue.length,
      severeOverdue: rows.filter((row) => row.severe).length,
      currencies: totals.length,
      decisionsPastGuardrail: rows.filter((row) => row.guardrail?.past && row.price.priced).length,
      certificates: (Array.isArray(state?.waitExposures) ? state.waitExposures : []).length,
      prices: (Array.isArray(state?.waitPrices) ? state.waitPrices : []).length,
    },
  };
}

/* ------------------------------------------------------------------ */
/* 5. Exposure certificates (the frozen, auditable weekly snapshot)    */
/* ------------------------------------------------------------------ */

/**
 * Freeze one week's priced exposure into a certificate. The certificate is
 * append-only audit history: it records what the waiting was priced at, the
 * per-currency aggregates and the scenario table, with the opaque item keys
 * the typed `prices-delay` edges point at. It is not a prediction that is
 * graded later — the survival readings already grade the curve; this records
 * the money the curve was multiplied by.
 */
export function buildExposureCertificate(report, options = {}) {
  const conventions = report.conventions;
  const items = report.rows
    .filter((row) => row.price.priced)
    .slice(0, conventions.maxLinks)
    .map((row) => ({
      key: row.item.key,
      sourceType: row.item.sourceType,
      sourceId: row.item.sourceId,
      title: row.item.title,
      classKey: row.item.kind,
      elapsedDays: row.item.elapsedDays,
      overdue: row.overdue,
      weeklyAmount: row.price.weeklyAmount,
      currency: row.price.currency,
      priceSource: row.price.source,
      confidence: row.confidence.level,
      scenarios: row.scenarios
        .filter((s) => s.available)
        .map((s) => ({ weeks: s.weeks, stillOpenPct: s.stillOpenPct, expectedAdditionalCost: s.expectedAdditionalCost })),
    }));
  return {
    id: options.id || null,
    label: String(options.label || '').slice(0, 200).trim() || `Exposure certificate, week of ${report.week}`,
    week: report.week,
    frozenOn: report.today,
    reviewOn: options.reviewOn || null,
    horizonWeeks: conventions.scenarioWeeks.slice(),
    totals: report.totals.map((bucket) => ({
      currency: bucket.currency,
      weeklyExposure: bucket.weeklyExposure,
      weeklyExposureOverdue: bucket.weeklyExposureOverdue,
      pricedItems: bucket.pricedItems,
      overduePricedItems: bucket.overduePricedItems,
      topItemSharePct: bucket.topItemShare,
      scenarios: bucket.scenarios.map((s) => ({ weeks: s.weeks, expectedAdditionalCost: s.expectedAdditionalCost, coveredRows: s.coveredRows })),
    })),
    items,
    counts: { ...report.counts },
    markers: [],
    history: [{
      at: options.nowIso || null,
      type: 'frozen',
      summary: `Froze ${items.length} priced item(s) across ${report.totals.length} currenc(ies) for week ${report.week}`,
    }],
    createdAt: options.nowIso || null,
    updatedAt: options.nowIso || null,
  };
}

/* ------------------------------------------------------------------ */
/* 6. Signals                                                          */
/* ------------------------------------------------------------------ */

function money(amount, currency) {
  return `${currency} ${Number(amount).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

export function waitCostSignals(state, now = new Date(), settings = {}) {
  const report = waitCostReport(state, now, settings);
  const { conventions } = report;
  const signals = [];
  const queueRoute = (params = '') => `#/wait?panel=queue${params ? `&${params}` : ''}`;

  // WAIT-01 — priced items past their class median are carrying a weekly cost.
  const pricedOverdue = report.rows.filter((row) => row.price.priced && row.overdue);
  if (pricedOverdue.length) {
    const top = pricedOverdue[0];
    signals.push({
      ruleId: 'WAIT-01',
      domain: 'Cost of waiting',
      severity: 3,
      title: `${pricedOverdue.length} priced item(s) are past the point where comparable work finishes — ${money(top.price.weeklyAmount, top.price.currency)}/week on the largest`,
      detail: `Each of these has waited longer than the median of its own class of work, measured from your closed records with censoring. The weekly figure is the declared (or decision-derived) delay price, not a rating of anyone holding the work.`,
      evidence: pricedOverdue.slice(0, 5).map((row) => (
        `${classLabel(row.item.kind)} · ${row.item.elapsedDays}d old (class median ${row.klass.completionQuantile.reached ? `${row.klass.completionQuantile.days}d` : 'not reached'}) · ${money(row.price.weeklyAmount, row.price.currency)}/week · confidence ${row.confidence.level}`
      )),
      action: { label: 'Open the priced queue', route: queueRoute() },
    });
  }

  // WAIT-02 — the aggregate weekly exposure per currency clears the threshold.
  for (const bucket of report.totals) {
    if (bucket.weeklyExposureOverdue > conventions.triageThreshold) {
      signals.push({
        ruleId: 'WAIT-02',
        domain: 'Cost of waiting',
        severity: 3,
        title: `Waiting is costing ${money(bucket.weeklyExposureOverdue, bucket.currency)} per week across ${bucket.overduePricedItems} overdue item(s)`,
        detail: `That is the sum of declared weekly delay prices over open items already past their class median, in ${bucket.currency} only — currencies are never pooled. The threshold is the declared ${money(conventions.triageThreshold, bucket.currency)} triage convention. This is the number the category's "on track" labels never show.`,
        evidence: [
          `Weekly exposure, all priced open items: ${money(bucket.weeklyExposure, bucket.currency)}`,
          `Of which overdue (past class median): ${money(bucket.weeklyExposureOverdue, bucket.currency)}`,
          `${bucket.pricedItems} priced open item(s) in ${bucket.currency}`,
        ],
        action: { label: 'Open the overview', route: '#/wait?panel=overview' },
      });
    }
  }

  // WAIT-03 — overdue work whose wait is unpriced. Unpriced is not zero.
  const unpricedOverdue = report.rows.filter((row) => !row.price.priced && row.overdue);
  if (unpricedOverdue.length) {
    const byClass = new Map();
    for (const row of unpricedOverdue) byClass.set(row.item.kind, (byClass.get(row.item.kind) || 0) + 1);
    signals.push({
      ruleId: 'WAIT-03',
      domain: 'Cost of waiting',
      severity: 2,
      title: `${unpricedOverdue.length} overdue item(s) have an unpriced wait — and unpriced is not zero`,
      detail: 'These are past their class median but carry no declared weekly price (and, for decisions, no linked value at stake). The honest reading is "unknown cost", and the fix is one declared price per class, not a bigger dashboard.',
      evidence: [...byClass.entries()].map(([key, count]) => `${classLabel(key)}: ${count} overdue item(s) unpriced`),
      action: { label: 'Declare prices', route: '#/wait?panel=prices' },
    });
  }

  // WAIT-04 — the wait compounds: scenario growth over the longest horizon.
  for (const bucket of report.totals) {
    const maxScenario = bucket.scenarios[bucket.scenarios.length - 1];
    if (!maxScenario || !bucket.scenarioRows) continue;
    const growth = bucket.weeklyExposureOverdue > 0
      ? maxScenario.expectedAdditionalCost / bucket.weeklyExposureOverdue
      : null;
    if (growth !== null && growth >= 0.25 && bucket.scenarioRows >= 1) {
      signals.push({
        ruleId: 'WAIT-04',
        domain: 'Cost of waiting',
        severity: 2,
        title: `If nothing changes, the +${maxScenario.weeks}-week endpoint lower bound is ${money(maxScenario.expectedAdditionalCost, bucket.currency)} in ${bucket.currency}`,
        detail: `This legacy figure is price × weeks × P(still open at the END | open now). It is a LOWER BOUND on expected carrying cost because work that closes before the horizon still waited part of it. The Consequence Lab integrates the whole conditional Kaplan–Meier curve for an open decision; ${bucket.scenarioRows} item(s) have a readable endpoint here.`,
        evidence: [
          ...bucket.scenarios.map((s) => `+${s.weeks} week(s): ${money(s.expectedAdditionalCost, bucket.currency)} endpoint lower bound (${s.coveredRows} item(s) covered)`),
          'P(still open) = S(age + 7w) / S(age) on the class KM curve; below the at-risk floor the scenario is withheld, not guessed',
        ],
        action: { label: 'Open the scenarios', route: '#/wait?panel=scenarios' },
      });
    }
  }

  // WAIT-05 — priced decisions sitting past their guardrail.
  const pastGuardrail = report.rows.filter((row) => row.guardrail?.past && row.price.priced);
  if (pastGuardrail.length) {
    signals.push({
      ruleId: 'WAIT-05',
      domain: 'Cost of waiting',
      severity: 3,
      title: `${pastGuardrail.length} priced decision(s) are past their tempo guardrail while carrying a weekly delay cost`,
      detail: 'Decision tempo already flags these as decision debt; this signal adds the money: each undecided day costs the derived weekly rate of its value at stake. The guardrail is the declared per-type convention, the price is the decision’s own linked value.',
      evidence: pastGuardrail.slice(0, 5).map((row) => (
        `${row.guardrail.type} guardrail ${row.guardrail.days}d · open ${row.item.elapsedDays}d · ${money(row.price.weeklyAmount, row.price.currency)}/week`
      )),
      action: { label: 'Open decision tempo', route: '#/tempo' },
    });
  }

  // WAIT-06 — the waiting is concentrated in one item inside one currency.
  for (const bucket of report.totals) {
    if (bucket.topItemShare >= 50 && bucket.overduePricedItems > 1) {
      signals.push({
        ruleId: 'WAIT-06',
        domain: 'Cost of waiting',
        severity: 2,
        title: `${bucket.topItemShare}% of the overdue ${bucket.currency} exposure sits on a single item`,
        detail: 'One open item carries half the weekly waiting cost in this currency. That is the item where a decision — expedite, re-scope, or a deliberate recorded deferral — buys the most per conversation. Concentration is computed inside one currency only.',
        evidence: [`Top item share of overdue exposure: ${bucket.topItemShare}%`, `Overdue priced items in ${bucket.currency}: ${bucket.overduePricedItems}`],
        action: { label: 'Open the priced queue', route: queueRoute() },
      });
    }
  }

  return signals;
}

export function waitCostAttentionCount(state, now = new Date(), settings = {}) {
  return waitCostSignals(state, now, settings).filter((signal) => signal.severity >= 3).length;
}

/* ------------------------------------------------------------------ */
/* 7. The deterministic brief                                          */
/* ------------------------------------------------------------------ */

/** Deterministic internal brief. Item titles are omitted by design. */
export function waitCostBrief(state, now = new Date(), settings = {}) {
  const report = waitCostReport(state, now, settings);
  const { conventions } = report;
  const lines = [];
  lines.push('COST OF WAITING — INTERNAL BRIEF');
  lines.push(`Generated ${report.today} · week ${report.week} · ${report.counts.open} open item(s): ${report.counts.priced} priced, ${report.counts.unpriced} unpriced (unpriced is not zero)`);
  lines.push('');
  if (!report.counts.open) {
    lines.push('No open dated work exists, so there is no waiting to price. Open items appear here only when a record has a start date.');
    return lines.join('\n');
  }
  lines.push(`Conventions: erosion window ${conventions.erosionWeeks} week(s) for decision value at stake · triage threshold ${conventions.triageThreshold} per currency per week · scenario horizons ${conventions.scenarioWeeks.join(', ')} week(s)`);
  lines.push('');
  if (!report.totals.length) {
    lines.push('No weekly price has been declared for any class, and no open decision carries a linked value at stake. Every wait is therefore UNPRICED — reported as unknown, never as zero. Declare a weekly price per class on the Prices panel to turn this brief into money.');
    lines.push('');
  }
  for (const bucket of report.totals) {
    lines.push(`- ${bucket.currency}: weekly exposure ${money(bucket.weeklyExposure, bucket.currency)} over ${bucket.pricedItems} priced open item(s); overdue share ${money(bucket.weeklyExposureOverdue, bucket.currency)} over ${bucket.overduePricedItems} item(s) past their class median`);
    for (const scenario of bucket.scenarios) {
      lines.push(`  wait +${scenario.weeks} week(s): endpoint lower bound ${money(scenario.expectedAdditionalCost, bucket.currency)} (${scenario.coveredRows} item(s) the curve could answer)`);
    }
    if (bucket.topItemShare >= 50) lines.push(`  concentration: one item carries ${bucket.topItemShare}% of the overdue exposure in this currency`);
  }
  lines.push('');
  lines.push(`Overdue but unpriced: ${report.counts.unpricedOverdue} item(s). Priced decisions past guardrail: ${report.counts.decisionsPastGuardrail}. Exposure certificates frozen: ${report.counts.certificates}.`);
  lines.push('');
  lines.push('Method: this legacy scenario field is an endpoint-only LOWER BOUND, weekly price × weeks × S(age+7w)/S(age), not the expected time-integrated cost. For a root decision, the Consequence Lab integrates the conditional KM curve. Below the at-risk floor this page withholds the endpoint figure; beyond the observed tail it flags extrapolation. Currencies never mix; titles are omitted.');
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* 8. Small helpers for rules and views                                */
/* ------------------------------------------------------------------ */

export function exposureById(state, id) {
  return (Array.isArray(state?.waitExposures) ? state.waitExposures : []).find((row) => row && row.id === id) || null;
}

export { resolveOwner, dayKey };
