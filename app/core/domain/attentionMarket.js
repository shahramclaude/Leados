/**
 * app/core/domain/attentionMarket.js — the Attention Market (Session 82, ADR-0047).
 *
 * THE QUESTION EVERY OTHER SCREEN LEAVES OPEN
 * -------------------------------------------
 * Forty modules each maintain a queue and each badge says "look at me". A leader
 * with eleven hours this week cannot act on the union of them, and none of the
 * other terminals answers the only question that matters at 09:00 on Monday:
 * *given everything I have recorded, what is the best eleven hours I can buy,
 * and what does the twelfth hour cost me?*
 *
 * That is not a list problem. It is a capital-budgeting problem under a single
 * binding constraint, and it has been solved in the operations-research
 * literature since the 1950s. This module states it exactly:
 *
 *     maximise    Σ_i  v_i(mode_i)          subject to   Σ_i  h_i(mode_i) ≤ H
 *     over        mode_i ∈ {do, delegate, drop}   for every open obligation i
 *
 * Each candidate and each mode is *derived from records the leader already
 * typed*; nothing is invented to fill the plan. Where a quantity is missing the
 * candidate is `unpriced` and is excluded from the optimum with its hours
 * printed, because a number that looks optimised but rests on a guess is worse
 * than an explicit gap.
 *
 * WHY A MULTIPLE-CHOICE KNAPSACK AND NOT A SORT
 * ---------------------------------------------
 * Ranking by value-per-hour is the standard advice and it is wrong here for two
 * reasons the records already contain. First, *doing* and *delegating* are
 * different modes of the same item with different costs AND different success
 * probabilities, so the item is a group of mutually exclusive alternatives, not
 * a single line. Second, the ranking gives no price for the constraint; the
 * linear-programming dual does, and that dual — the shadow price of an hour — is
 * the number a leader cannot get anywhere else.
 *
 * The LP relaxation of the multiple-choice knapsack is solved EXACTLY by the
 * incremental-ratio algorithm (Dyer 1984; Zemel 1984) after convex-hull pruning
 * of every group, which is what `solveLpRelaxation` implements. The integer plan
 * is then built from the same ordering and improved by local search. The report
 * prints the LP upper bound, the achieved value and the exact gap between them,
 * so the plan never claims to be optimal — it claims to be within a stated,
 * computable distance of a bound it can prove.
 *
 * WHAT IS DELIBERATELY NOT MODELLED
 * ---------------------------------
 * - No correlation between items. Two cases caused by one root cause are two
 *   exposures in this model unless they are literally the same record, which is
 *   the only overlap the workspace can prove.
 * - No learning curve, no diminishing returns to hours within a mode.
 * - No scheduling: the plan is a *set*, not a week. When things happen is the
 *   Decision Portfolio's problem (ADR-0043), not this one.
 * - No cross-currency arithmetic. Each currency is its own market with its own
 *   budget and its own shadow price; summing USD and EUR to one number would
 *   manufacture a figure no record supports.
 *
 * Pure module: no storage access, no DOM, no clock (the caller supplies `now`).
 * Deterministic for a given workspace, date and set of declarations.
 */

import { addDays, dayKey, daysBetween, daysSince, round } from '../time.js';
import { pertTriple } from './capacity.js';

export const ATT_ENGINE_VERSION = 'att-1.0.0';

/* --------------------------------------------------------------- constants */

/** Hours the leader can spend on obligation work in one horizon, by default. */
export const ATT_DEFAULT_BUDGET_HOURS = 12;
/** Share of an item's hours that a hand-off still costs the leader. */
export const ATT_DEFAULT_HANDOFF_SHARE = 25;
/** Completion observations needed before a measured rate replaces the prior. */
export const ATT_DEFAULT_MIN_SAMPLES = 4;
/** Horizon over which a committed plan is held to its own prediction. */
export const ATT_DEFAULT_HORIZON_DAYS = 7;
/** Prior weight in the empirical-Bayes shrink. One pseudo-observation. */
export const ATT_PRIOR_WEIGHT = 1;
/** Assumed hours of leader effort in one effort-day when a PERT estimate exists. */
export const ATT_HOURS_PER_EFFORT_DAY = 6;
/**
 * The share of a record's own effort estimate that lands on the leader.
 *
 * This is the one place where a derived hour could be mistaken for a measured
 * one. `effortDays` on a funded item and `capacityDays` on a case are TEAM
 * effort — the work the delivery consumes — not the leader's attention. Neither
 * record contains a leader-attention field, and inventing one would be exactly
 * the fabricated quantity this module refuses everywhere else. So the split is
 * a declared convention, printed beside every derived figure, and a leader who
 * knows their own calendar can override any row by typing the hours.
 */
export const ATT_DEFAULT_LEADER_SHARE_PCT = 10;
/** Delegate attention available in one horizon, as a multiple of the leader's. */
export const ATT_DEFAULT_DELEGATE_CAPACITY_FACTOR = 2;
/** Hard caps that keep an adversarial import from stalling the solver. */
export const ATT_MAX_CANDIDATES = 48;
export const ATT_MAX_HOURS = 400;
export const ATT_MAX_BUDGET_HOURS = 200;
/** Search effort budget for the integer improvement pass. */
const LOCAL_SEARCH_PASSES = 12;
const SENSITIVITY_FACTORS = Object.freeze([0.5, 0.75, 1, 1.25, 1.5]);

export const ATT_MODES = Object.freeze(['do', 'delegate', 'drop']);

export const ATT_MODE_LABELS = Object.freeze({
  do: 'Do it yourself',
  delegate: 'Hand it off',
  drop: 'Let it carry',
});

/**
 * Where an obligation can come from. Each entry names the module that owns the
 * record and the route that opens it, so a candidate is always one click from
 * the thing it describes. Order is display order.
 */
export const ATT_SOURCE_TYPES = Object.freeze([
  // `delegable` is a property of the obligation, not a preference. A case, a
  // package of funded work and a resilience gap can be owned by a report; a
  // budget ceiling, a negotiation mandate and a decision frame are questions
  // that only the accountable leader can answer, and offering to hand them off
  // would be offering a mode that does not exist.
  { id: 'case', label: 'Operational case', route: (id) => `#/cases/${encodeURIComponent(id)}`, domain: 'Operational cases', delegable: true },
  { id: 'portfolio', label: 'Funded work', route: () => '#/capacity?tab=portfolio', domain: 'Capacity & flow', delegable: true },
  { id: 'negotiation', label: 'Negotiation', route: (id) => `#/negotiations/${encodeURIComponent(id)}`, domain: 'Negotiation', delegable: false },
  { id: 'dependency', label: 'Critical dependency', route: () => '#/resilience', domain: 'Operational resilience', delegable: true },
  { id: 'voi', label: 'Priced decision frame', route: (id) => `#/voi?frame=${encodeURIComponent(id)}&panel=frames`, domain: 'Information value', delegable: false },
  { id: 'budget', label: 'Budget overshoot', route: (id) => `#/finance/${encodeURIComponent(id)}`, domain: 'Finance', delegable: false },
  { id: 'decision', label: 'Open decision', route: () => '#/decisions', domain: 'Decisions', delegable: false },
  { id: 'premise', label: 'Falsified premise', route: (id) => `#/premises?premise=${encodeURIComponent(id)}`, domain: 'Premise sentinel', delegable: false },
]);

export const ATT_SOURCE_BY_ID = Object.freeze(
  Object.fromEntries(ATT_SOURCE_TYPES.map((entry) => [entry.id, entry])),
);

export const ATT_STATUSES = Object.freeze(['committed', 'reviewed', 'abandoned']);

/* ---------------------------------------------------------------- helpers */

function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function nonNegative(value) {
  const n = num(value);
  if (n === null) return null;
  return n < 0 ? 0 : n;
}

function str(value) {
  return value === null || value === undefined ? '' : String(value);
}

function money(value, currency) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'not priced';
  const code = str(currency || '').trim().toUpperCase();
  const rounded = Math.round(Number(value));
  const formatted = rounded.toLocaleString('en-US');
  return code ? `${code} ${formatted}` : formatted;
}

export { money as formatAttentionMoney };

/**
 * Empirical-Bayes rate: the observed share, shrunk toward a prior by one
 * pseudo-observation. With `priorMean = 0.5` and weight 1 this is the Jeffreys
 * posterior mean, which is the same convention the calibration module uses.
 * A rate is never returned as "0% because it has never happened" — four misses
 * is not proof, and a zero would silently delete an item from every plan.
 */
export function shrunkRate(hits, n, priorMean = 0.5, priorWeight = ATT_PRIOR_WEIGHT) {
  const total = Math.max(0, Math.round(Number(n) || 0));
  const wins = Math.min(total, Math.max(0, Math.round(Number(hits) || 0)));
  const mean = Number.isFinite(Number(priorMean)) ? Math.min(1, Math.max(0, Number(priorMean))) : 0.5;
  const weight = Number.isFinite(Number(priorWeight)) && Number(priorWeight) >= 0 ? Number(priorWeight) : ATT_PRIOR_WEIGHT;
  const denominator = total + weight;
  if (denominator <= 0) return 0.5;
  return round((wins + weight * mean) / denominator, 4);
}

/* ------------------------------------------------------------- conventions */

/**
 * Every convention is clamped to a real band and reported back with its default.
 * A typo in a budget must not silently become "zero hours", which would produce
 * an empty plan that looks like a decision.
 */
export function conventionsFromSettings(settings = {}) {
  const src = settings && typeof settings === 'object' ? settings : {};
  const budget = num(src.attBudgetHours);
  const share = num(src.attHandoffSharePct);
  const samples = num(src.attMinSamples);
  const horizon = num(src.attHorizonDays);
  const perDay = num(src.attHoursPerEffortDay);
  const minRatio = num(src.attMinRatioPerHour);
  const leaderShare = num(src.attLeaderSharePct);
  const delegate = num(src.attDelegateHours);
  return {
    budgetHours: budget === null || budget < 0 ? ATT_DEFAULT_BUDGET_HOURS : Math.min(ATT_MAX_BUDGET_HOURS, round(budget, 1)),
    handoffSharePct: share === null ? ATT_DEFAULT_HANDOFF_SHARE : Math.min(100, Math.max(0, round(share, 0))),
    minSamples: samples === null ? ATT_DEFAULT_MIN_SAMPLES : Math.min(50, Math.max(1, Math.round(samples))),
    horizonDays: horizon === null ? ATT_DEFAULT_HORIZON_DAYS : Math.min(365, Math.max(1, Math.round(horizon))),
    hoursPerEffortDay: perDay === null ? ATT_HOURS_PER_EFFORT_DAY : Math.min(24, Math.max(0.5, round(perDay, 2))),
    minRatioPerHour: minRatio === null ? 0 : Math.max(0, round(minRatio, 2)),
    leaderSharePct: leaderShare === null
      ? ATT_DEFAULT_LEADER_SHARE_PCT
      : Math.min(100, Math.max(0.5, round(leaderShare, 1))),
    // The delegate pool. A hand-off moves work from the leader's week into
    // somebody else's, so the plan needs a second ceiling or it will simply hand
    // everything to the most reliable person. Zero means "delegation is not
    // available in this market", which is a legitimate answer.
    delegateHours: delegate === null
      ? round(ATT_DEFAULT_BUDGET_HOURS * ATT_DEFAULT_DELEGATE_CAPACITY_FACTOR, 1)
      : Math.min(ATT_MAX_HOURS, Math.max(0, round(delegate, 1))),
  };
}

/* ------------------------------------------------- completion-discipline */

/**
 * The workspace's own record of whether obligations in a class actually get
 * closed on the date they were given. This is the only honest source for `p`:
 * it is a fact about this leader and this team, not a published average.
 *
 * A record counts only when it carries BOTH a due date and a completion date or
 * a live status. Records closed without a date are dropped and counted in
 * `undated`, never treated as misses, because an undated close is an unknown
 * and counting it either way would manufacture the statistic being measured.
 */
export function completionDiscipline(state = {}, now = new Date()) {
  const at = now instanceof Date ? now : new Date(now);
  const out = {
    case: tallyCases(state.cases),
    portfolio: tallyPortfolio(state.portfolio),
    negotiation: tallyNegotiations(state.negotiations),
    delegation: tallyDelegations(state.delegations),
    decision: tallyDecisions(state.decisions, at),
    dependency: { hits: 0, n: 0, undated: 0 },
    voi: { hits: 0, n: 0, undated: 0 },
    budget: { hits: 0, n: 0, undated: 0 },
    premise: { hits: 0, n: 0, undated: 0 },
  };
  return out;
}

function tallyCases(rows) {
  let hits = 0; let n = 0; let undated = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || !row.resolvedOn) continue;
    const due = row.reviewOn || (row.openedOn ? dayKey(addDays(row.openedOn, 14)) : null);
    if (!due) { undated += 1; continue; }
    n += 1;
    if (row.resolvedOn <= due) hits += 1;
  }
  return { hits, n, undated };
}

function tallyPortfolio(rows) {
  let hits = 0; let n = 0; let undated = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || !row.completedOn) continue;
    if (!row.targetOn) { undated += 1; continue; }
    n += 1;
    if (row.completedOn <= row.targetOn) hits += 1;
  }
  return { hits, n, undated };
}

function tallyNegotiations(rows) {
  let hits = 0; let n = 0; let undated = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || !row.closedOn) continue;
    if (!row.reviewOn) { undated += 1; continue; }
    n += 1;
    if (row.closedOn <= row.reviewOn) hits += 1;
  }
  return { hits, n, undated };
}

function tallyDelegations(rows) {
  let hits = 0; let n = 0; let undated = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || !row.completedOn) continue;
    if (!row.dueOn) { undated += 1; continue; }
    n += 1;
    if (row.completedOn <= row.dueOn) hits += 1;
  }
  return { hits, n, undated };
}

function tallyDecisions(rows, at) {
  let hits = 0; let n = 0; let undated = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row) continue;
    // A decision counts as "landed" once it has a chosen option AND a recorded
    // review outcome that is not pending. Anything else is still open, and
    // counting an open decision as a miss would score the future as a failure.
    if (!row.chosen) continue;
    if (!row.reviewOn) { undated += 1; continue; }
    if (row.outcome === 'pending') continue;
    n += 1;
    const landedOn = row.reviewedOn || row.decidedOn || null;
    if (landedOn && landedOn <= row.reviewOn) hits += 1;
  }
  return { hits, n, undated };
}

/**
 * Per-person hand-off reliability, measured from that person's own completed
 * delegations. Shrunk toward the TEAM mean when the team has enough history
 * (empirical Bayes), and toward 0.5 when it does not. Who is a plausible
 * delegate is decided by role and workload elsewhere; this function only says
 * how often a date given to that person was kept.
 */
export function delegateReliability(state = {}, conventions = {}) {
  const minSamples = conventions.minSamples ?? ATT_DEFAULT_MIN_SAMPLES;
  const byPerson = new Map();
  for (const row of Array.isArray(state.delegations) ? state.delegations : []) {
    if (!row || !row.personId || !row.completedOn || !row.dueOn) continue;
    const entry = byPerson.get(row.personId) || { hits: 0, n: 0 };
    entry.n += 1;
    if (row.completedOn <= row.dueOn) entry.hits += 1;
    byPerson.set(row.personId, entry);
  }
  let teamHits = 0; let teamN = 0;
  for (const entry of byPerson.values()) { teamHits += entry.hits; teamN += entry.n; }
  const teamMeasured = teamN >= minSamples;
  const teamPrior = teamMeasured ? teamHits / teamN : 0.5;
  const people = [];
  for (const person of Array.isArray(state.people) ? state.people : []) {
    if (!person || !person.id || person.status === 'archived') continue;
    const entry = byPerson.get(person.id) || { hits: 0, n: 0 };
    const measured = entry.n >= minSamples;
    people.push({
      personId: person.id,
      name: person.name || person.id,
      hits: entry.hits,
      n: entry.n,
      measured,
      basis: measured
        ? `${entry.hits} of ${entry.n} completed delegations kept their due date`
        : `only ${entry.n} completed delegation(s); the ${teamMeasured ? 'team' : 'uninformative'} prior is used`,
      rate: shrunkRate(entry.hits, entry.n, teamPrior),
    });
  }
  people.sort((a, b) => b.rate - a.rate);
  return {
    people,
    teamPrior: round(teamPrior, 4),
    teamMeasured,
    teamN,
    measuredCount: people.filter((p) => p.measured).length,
  };
}

/* ---------------------------------------------------------- the harvest */

/**
 * Turn one record into a candidate. Every candidate carries `basis` strings so
 * the screen can print where each number came from and a sceptical reader can
 * check it against the record. `exposure` is null — never 0 — when the record
 * carries no monetary quantity, because a zero would rank the item last forever
 * while looking like a measurement.
 */
function candidate(spec) {
  return {
    id: `${spec.sourceType}:${spec.sourceId}`,
    sourceType: spec.sourceType,
    sourceId: spec.sourceId,
    title: spec.title,
    route: spec.route,
    domain: spec.domain,
    currency: spec.currency || null,
    exposure: spec.exposure === null || spec.exposure === undefined ? null : round(spec.exposure, 2),
    exposureBasis: spec.exposureBasis || '',
    hours: spec.hours === null || spec.hours === undefined ? null : round(spec.hours, 2),
    hoursBasis: spec.hoursBasis || '',
    dueOn: spec.dueOn || null,
    overdueDays: spec.overdueDays ?? null,
    note: spec.note || '',
  };
}

function caseCandidates(state, conventions) {
  const out = [];
  for (const row of Array.isArray(state.cases) ? state.cases : []) {
    if (!row || !row.id) continue;
    if (!['open', 'mitigating', 'monitoring'].includes(row.status)) continue;
    const fin = row.financial && typeof row.financial === 'object' ? row.financial : {};
    const pert = pertTriple({ optimistic: fin.optimistic, mostLikely: fin.mostLikely, pessimistic: fin.pessimistic });
    const exposure = pert.measured ? pert.expected : null;
    const capacityDays = pertTriple({
      optimistic: fin.capacityDaysOptimistic,
      mostLikely: fin.capacityDaysMostLikely,
      pessimistic: fin.capacityDaysPessimistic,
    });
    out.push(candidate({
      sourceType: 'case',
      sourceId: row.id,
      title: row.title || 'Operational case',
      route: ATT_SOURCE_BY_ID.case.route(row.id),
      domain: ATT_SOURCE_BY_ID.case.domain,
      currency: fin.currency || 'USD',
      exposure,
      exposureBasis: pert.measured
        ? `PERT expected loss of the case's own three-point cost estimate (${pert.optimistic} / ${pert.mostLikely} / ${pert.pessimistic})`
        : 'the case carries no three-point cost estimate, so it is unpriced',
      hours: capacityDays.measured
        ? round(capacityDays.expected * conventions.hoursPerEffortDay * (conventions.leaderSharePct / 100), 2)
        : null,
      hoursBasis: capacityDays.measured
        ? `derived: ${capacityDays.expected} expected capacity-days × ${conventions.hoursPerEffortDay} h/day × ${conventions.leaderSharePct}% declared leader share`
        : 'the case carries no capacity-days estimate',
      dueOn: row.reviewOn || null,
      overdueDays: row.reviewOn ? daysSince(row.reviewOn, contextNow) : null,
      note: fin.opportunityCost || '',
    }));
  }
  return out;
}

function portfolioCandidates(state, conventions) {
  const out = [];
  for (const row of Array.isArray(state.portfolio) ? state.portfolio : []) {
    if (!row || !row.id) continue;
    if (row.status !== 'open') continue;
    const effort = pertTriple(row.effortDays);
    const value = pertTriple(row.value);
    out.push(candidate({
      sourceType: 'portfolio',
      sourceId: row.id,
      title: row.title || 'Funded work',
      route: ATT_SOURCE_BY_ID.portfolio.route(row.id),
      domain: ATT_SOURCE_BY_ID.portfolio.domain,
      currency: row.currency || 'USD',
      exposure: value.measured ? value.expected : null,
      exposureBasis: value.measured
        ? `PERT expected value of the funded item's own three-point estimate (${value.optimistic} / ${value.mostLikely} / ${value.pessimistic})`
        : 'the item carries no three-point value estimate, so it is unpriced',
      hours: effort.measured
        ? round(effort.expected * conventions.hoursPerEffortDay * (conventions.leaderSharePct / 100), 2)
        : null,
      hoursBasis: effort.measured
        ? `derived: ${effort.expected} expected effort-days × ${conventions.hoursPerEffortDay} h/day × ${conventions.leaderSharePct}% declared leader share`
        : 'the item carries no effort estimate',
      dueOn: row.targetOn || null,
      overdueDays: row.targetOn ? daysSince(row.targetOn, contextNow) : null,
      note: row.rationale || '',
    }));
  }
  return out;
}

function negotiationCandidates(state) {
  const out = [];
  for (const row of Array.isArray(state.negotiations) ? state.negotiations : []) {
    if (!row || !row.id) continue;
    if (row.status !== 'active') continue;
    const stakes = nonNegative(row.stakesValue);
    const batna = nonNegative(row.ourBatnaValue);
    // The surplus at stake is the gap between what the deal is worth and what
    // walking away is worth. Below BATNA there is nothing to protect, and the
    // candidate is unpriced rather than zero — a deal worth less than its
    // alternative is a different problem, not a cheap one.
    const surplus = stakes !== null && batna !== null ? stakes - batna : null;
    out.push(candidate({
      sourceType: 'negotiation',
      sourceId: row.id,
      title: row.title || 'Negotiation',
      route: ATT_SOURCE_BY_ID.negotiation.route(row.id),
      domain: ATT_SOURCE_BY_ID.negotiation.domain,
      currency: row.stakesCurrency || 'USD',
      exposure: surplus !== null && surplus > 0 ? surplus : null,
      exposureBasis: surplus === null
        ? 'stakes or BATNA is missing on the record'
        : surplus <= 0
          ? `the deal is worth ${money(stakes, row.stakesCurrency)} against a BATNA of ${money(batna, row.stakesCurrency)}; there is no surplus to protect`
          : `stakes ${money(stakes, row.stakesCurrency)} less BATNA ${money(batna, row.stakesCurrency)}`,
      hours: null,
      hoursBasis: 'the record carries no effort estimate; hours must be declared',
      dueOn: row.reviewOn || row.nextSessionOn || null,
      overdueDays: (row.reviewOn || row.nextSessionOn) ? daysSince(row.reviewOn || row.nextSessionOn, contextNow) : null,
      note: row.strategic ? 'Marked strategic on its own record.' : '',
    }));
  }
  return out;
}

function dependencyCandidates(state) {
  const out = [];
  for (const row of Array.isArray(state.dependencies) ? state.dependencies : []) {
    if (!row || !row.id) continue;
    if (row.status !== 'active') continue;
    if (row.criticality !== 'critical' && row.criticality !== 'high') continue;
    const daily = nonNegative(row.dailyImpactOverride) ?? nonNegative(row.derivedDailyImpact);
    const ttr = nonNegative(row.ttrDays);
    const exposure = daily !== null && ttr !== null ? daily * ttr : null;
    out.push(candidate({
      sourceType: 'dependency',
      sourceId: row.id,
      title: row.name || 'Critical dependency',
      route: ATT_SOURCE_BY_ID.dependency.route(row.id),
      domain: ATT_SOURCE_BY_ID.dependency.domain,
      currency: row.currency || row.derivedCurrency || 'USD',
      exposure,
      exposureBasis: exposure === null
        ? 'no measured daily impact or time-to-recover on the record'
        : `${money(daily, row.currency)} per day of outage × ${ttr} day(s) to recover`,
      hours: null,
      hoursBasis: 'the record carries no effort estimate; hours must be declared',
      dueOn: null,
      overdueDays: null,
      note: row.substitutability === 'none' ? 'No substitute exists if it fails.' : '',
    }));
  }
  return out;
}

function voiCandidates(state) {
  const out = [];
  for (const row of Array.isArray(state.voiDecisions) ? state.voiDecisions : []) {
    if (!row || !row.id || row.status !== 'open') continue;
    if (!Array.isArray(row.states) || !row.states.length) continue;
    const values = [];
    for (const payoff of Array.isArray(row.payoffs) ? row.payoffs : []) {
      const value = num(payoff?.value);
      if (value !== null) values.push(Math.abs(value));
    }
    const stake = values.length ? Math.max(...values) : null;
    out.push(candidate({
      sourceType: 'voi',
      sourceId: row.id,
      title: row.label || 'Decision frame',
      route: ATT_SOURCE_BY_ID.voi.route(row.id),
      domain: ATT_SOURCE_BY_ID.voi.domain,
      currency: row.currency || 'USD',
      exposure: stake,
      exposureBasis: stake === null
        ? 'no payoff cell has been priced'
        : 'the largest absolute payoff in the frame\'s own declared table',
      hours: null,
      hoursBasis: 'the record carries no effort estimate; hours must be declared',
      dueOn: null,
      overdueDays: null,
      note: row.question || '',
    }));
  }
  return out;
}

function budgetCandidates(state) {
  const out = [];
  for (const row of Array.isArray(state.budgets) ? state.budgets : []) {
    if (!row || !row.id) continue;
    if (row.status !== 'active') continue;
    const limit = nonNegative(row.limit);
    let committed = 0;
    for (const line of Array.isArray(row.lines) ? row.lines : []) {
      if (!line) continue;
      if (['committed', 'spent', 'settled'].includes(line.status)) {
        committed += nonNegative(line.actualAmount) ?? nonNegative(line.committedAmount) ?? 0;
      }
    }
    const overshoot = limit !== null ? round(committed - limit, 2) : null;
    out.push(candidate({
      sourceType: 'budget',
      sourceId: row.id,
      title: row.name || 'Budget',
      route: ATT_SOURCE_BY_ID.budget.route(row.id),
      domain: ATT_SOURCE_BY_ID.budget.domain,
      currency: row.currency || 'USD',
      exposure: overshoot !== null && overshoot > 0 ? overshoot : null,
      exposureBasis: limit === null
        ? 'the budget has no ceiling on the record'
        : overshoot > 0
          ? `${money(committed, row.currency)} committed against a ceiling of ${money(limit, row.currency)}`
          : `committed ${money(committed, row.currency)} of a ${money(limit, row.currency)} ceiling; nothing is overspent`,
      hours: null,
      hoursBasis: 'the record carries no effort estimate; hours must be declared',
      dueOn: row.endsOn || null,
      overdueDays: null,
      note: row.periodLabel || '',
    }));
  }
  return out;
}

/** Set by `buildAttentionMarket` so the harvesters share one clock. */
let contextNow = new Date();

/**
 * The harvest. Each harvester is a pure function of the workspace; adding a
 * module later means adding one function to this list, not editing the solver.
 * Duplicate protection keys are resolved in `resolveAtoms` below.
 */
export function harvestCandidates(state = {}, now = new Date(), conventions = conventionsFromSettings(state.settings)) {
  contextNow = now instanceof Date ? now : new Date(now);
  const raw = [
    ...caseCandidates(state, conventions),
    ...portfolioCandidates(state, conventions),
    ...negotiationCandidates(state),
    ...dependencyCandidates(state),
    ...voiCandidates(state),
    ...budgetCandidates(state),
  ];
  return raw
    .filter((row) => row.sourceId)
    .slice(0, ATT_MAX_CANDIDATES)
    .sort((a, b) => {
      const av = a.exposure ?? -1;
      const bv = b.exposure ?? -1;
      if (bv !== av) return bv - av;
      return a.title.localeCompare(b.title);
    });
}

/* --------------------------------------------------------------- the solve */

/**
 * Convex-hull prune of one group's (hours, value) options.
 *
 * The LP relaxation of a multiple-choice knapsack is solved by taking
 * incremental ratios in descending order, and that argument only holds if each
 * group's marginal ratio is non-increasing. Pruning every option that lies
 * below the upper convex hull of its own group makes that true, and it does so
 * without changing the LP optimum because a point inside the hull is by
 * definition dominated by a fractional mix of its neighbours.
 *
 * Input options must be sorted by hours ascending. The (0,0) "drop" option is
 * always kept, so a group can always refuse to be filled.
 */
export function pruneToHull(options) {
  const sorted = [...options]
    .filter((option) => Number.isFinite(option.hours) && Number.isFinite(option.value))
    .sort((a, b) => (a.hours - b.hours) || (a.value - b.value));
  if (sorted.length <= 1) return sorted;
  const hull = [];
  for (const option of sorted) {
    if (hull.length) {
      const last = hull[hull.length - 1];
      // Same hours, no more value: strictly dominated, so never worth taking.
      if (option.hours === last.hours && option.value <= last.value) continue;
    }
    hull.push(option);
    // Remove a point that adds hours without adding value. It is a candidate
    // for removal only while a cheaper point already reaches its value, which
    // is the LAST point of the hull, never the middle one.
    while (hull.length >= 2) {
      const last = hull[hull.length - 1];
      const previous = hull[hull.length - 2];
      if (last.value <= previous.value) { hull.pop(); continue; }
      break;
    }
    // Convexity: while the last three points turn the wrong way, the middle
    // point lies below the chord between its neighbours and cannot appear in
    // any LP solution, so drop the MIDDLE point and re-test.
    while (hull.length >= 3) {
      const a = hull[hull.length - 3];
      const b = hull[hull.length - 2];
      const c = hull[hull.length - 1];
      const slopeAb = (b.value - a.value) / (b.hours - a.hours);
      const slopeBc = (c.value - b.value) / (c.hours - b.hours);
      if (slopeAb <= slopeBc) { hull.splice(hull.length - 2, 1); continue; }
      break;
    }
  }
  return hull;
}

/**
 * Build the mode table for one candidate.
 *
 * `do` and `delegate` are the same obligation answered two ways. The delegate
 * mode costs the leader only the hand-off share of the hours — briefing,
 * checking, repairing — and is worth the obligation's expected value times the
 * DELEGATE'S measured record, not the leader's. That difference is the whole
 * point: an item can be worth more handed off than done, and a ranking that
 * cannot express it will always tell the leader to do everything themselves.
 */
export function modesForCandidate(row, { successProbability, conventions, delegate }) {
  const options = [{ key: 'drop', mode: 'drop', hours: 0, value: 0, probability: 0, delegateId: null, load: 0 }];
  if (row.hours === null || row.exposure === null) return options;
  if (row.hours <= 0) return options;
  const p = successProbability === null ? null : successProbability;
  if (p !== null) {
    options.push({
      key: 'do',
      mode: 'do',
      hours: row.hours,
      value: row.exposure * p,
      probability: p,
      delegateId: null,
      load: 0,
    });
  }
  if (delegate && delegate.personId && ATT_SOURCE_BY_ID[row.sourceType]?.delegable !== false) {
    const handoffHours = round(row.hours * (conventions.handoffSharePct / 100), 2);
    options.push({
      key: 'delegate',
      mode: 'delegate',
      hours: handoffHours,
      value: row.exposure * delegate.rate,
      probability: delegate.rate,
      // The hand-off consumes the leader's supervision hours AND the delegate's
      // own working hours. That second quantity is what the delegate pool caps.
      load: row.hours,
      delegateId: delegate.personId,
      delegateName: delegate.name,
      delegateMeasured: delegate.measured,
    });
  }
  return options;
}

/**
 * Dyer's incremental-ratio algorithm for the LP relaxation of a multiple-choice
 * knapsack. Returns the exact LP value, the shadow price of the budget, and the
 * fractional group that sets it.
 *
 * The shadow price is the interesting output. When the budget is not saturated
 * the price of an extra hour is zero — the leader is not time-constrained, they
 * are option-constrained, and telling them to "buy back time" would be advice
 * for a problem they do not have.
 */
export function solveLpRelaxation(groups, budgetHours) {
  const budget = Number.isFinite(budgetHours) && budgetHours > 0 ? budgetHours : 0;
  const increments = [];
  for (const group of groups) {
    const hull = pruneToHull(group.options);
    for (let i = 1; i < hull.length; i += 1) {
      const previous = hull[i - 1];
      const next = hull[i];
      const dh = next.hours - previous.hours;
      const dv = next.value - previous.value;
      if (!(dh > 0) || !(dv > 0)) continue;
      increments.push({
        groupId: group.id,
        fromIndex: i - 1,
        toIndex: i,
        option: next,
        previous,
        hours: dh,
        value: dv,
        ratio: dv / dh,
      });
    }
  }
  increments.sort((a, b) => (b.ratio - a.ratio) || (a.hours - b.hours) || a.groupId.localeCompare(b.groupId));

  // Within a group, prerequisites must be taken in order, but because each
  // group's hull slopes are non-increasing the ratio order already visits them
  // in that order. Track how far each group has advanced to be certain.
  const advance = new Map();
  for (const group of groups) advance.set(group.id, 0);
  let used = 0;
  let value = 0;
  let shadowPrice = 0;
  let bindingGroup = null;
  for (const increment of increments) {
    const index = advance.get(increment.groupId) || 0;
    // Skip until the prerequisite increment for this group has been taken.
    if (index !== increment.fromIndex) continue;
    const remaining = budget - used;
    if (increment.hours <= remaining + 1e-9) {
      used += increment.hours;
      value += increment.value;
      advance.set(increment.groupId, increment.toIndex);
      continue;
    }
    // Fractional last increment: this is what sets the dual.
    const fraction = remaining > 0 ? remaining / increment.hours : 0;
    value += increment.value * fraction;
    used = budget;
    shadowPrice = increment.ratio;
    bindingGroup = increment.groupId;
    break;
  }
  return {
    budgetHours: budget,
    usedHours: round(used, 2),
    lpValue: round(value, 2),
    shadowPrice: round(shadowPrice, 2),
    saturated: round(used, 2) >= round(budget, 2) - 1e-9 && budget > 0,
    bindingGroupId: bindingGroup,
  };
}

/**
 * Integer plan from the same ordering, then improved by local search.
 *
 * The greedy prefix is feasible by construction. Local search then tries every
 * single unselected increment that still fits, and every removal of one taken
 * increment followed by the addition of two that fit. Neither move can make the
 * plan infeasible, so the result is always a legal plan — the gap to the LP
 * bound is printed, never hidden.
 */
export function solveIntegerPlan(groups, budgetHours, lp) {
  const budget = lp.budgetHours;
  const taken = new Map();
  const hulls = new Map();
  for (const group of groups) {
    hulls.set(group.id, pruneToHull(group.options));
    taken.set(group.id, 0);
  }
  const ratioOf = (group, toIndex) => {
    const hull = hulls.get(group.id);
    const from = hull[toIndex - 1];
    const to = hull[toIndex];
    if (!from || !to) return 0;
    const dh = to.hours - from.hours;
    if (!(dh > 0)) return 0;
    return (to.value - from.value) / dh;
  };
  // Greedy in descending ratio, taking every increment that fits.
  const all = [];
  for (const group of groups) {
    const hull = hulls.get(group.id);
    for (let i = 1; i < hull.length; i += 1) {
      all.push({ groupId: group.id, toIndex: i, ratio: ratioOf(group, i), hours: hull[i].hours - hull[i - 1].hours, value: hull[i].value - hull[i - 1].value });
    }
  }
  all.sort((a, b) => (b.ratio - a.ratio) || (a.hours - b.hours) || a.groupId.localeCompare(b.groupId));
  let used = 0;
  for (const increment of all) {
    if ((taken.get(increment.groupId) || 0) !== increment.toIndex - 1) continue;
    if (used + increment.hours > budget + 1e-9) continue;
    used += increment.hours;
    taken.set(increment.groupId, increment.toIndex);
  }

  const valueOf = () => {
    let total = 0;
    let hours = 0;
    for (const group of groups) {
      const hull = hulls.get(group.id);
      const index = taken.get(group.id) || 0;
      const option = hull[index];
      if (option) { total += option.value; hours += option.hours; }
    }
    return { value: total, hours };
  };

  // Local search: single additions, then one-out-two-in swaps.
  for (let pass = 0; pass < LOCAL_SEARCH_PASSES; pass += 1) {
    let improved = false;
    // 1) Any next increment in any group that still fits.
    for (const group of groups) {
      const hull = hulls.get(group.id);
      const index = taken.get(group.id) || 0;
      const next = hull[index + 1];
      if (!next) continue;
      const state = valueOf();
      const delta = next.hours - (hull[index]?.hours ?? 0);
      if (state.hours + delta <= budget + 1e-9) {
        const gain = next.value - (hull[index]?.value ?? 0);
        if (gain > 0) { taken.set(group.id, index + 1); improved = true; }
      }
    }
    if (improved) continue;
    // 2) Give back one taken increment to afford two that do not fit alone.
    const snapshot = new Map(taken);
    outer: for (const donor of groups) {
      const donorIndex = taken.get(donor.id) || 0;
      if (donorIndex === 0) continue;
      const donorHull = hulls.get(donor.id);
      const freed = donorHull[donorIndex].hours - donorHull[donorIndex - 1].hours;
      const lost = donorHull[donorIndex].value - donorHull[donorIndex - 1].value;
      taken.set(donor.id, donorIndex - 1);
      const after = valueOf();
      for (const receiver of groups) {
        if (receiver.id === donor.id) continue;
        const rIndex = taken.get(receiver.id) || 0;
        const rHull = hulls.get(receiver.id);
        const rNext = rHull[rIndex + 1];
        if (!rNext) continue;
        const cost = rNext.hours - rHull[rIndex].hours;
        const gain = rNext.value - rHull[rIndex].value;
        if (after.hours + cost <= budget + 1e-9 && gain > lost) {
          taken.set(receiver.id, rIndex + 1);
          improved = true;
          break outer;
        }
      }
      // Restore, then try the same donor under a smaller budget remainder.
      taken.set(donor.id, donorIndex);
      if (freed <= 0) continue;
    }
    if (!improved) {
      for (const [key, value] of snapshot) taken.set(key, value);
      break;
    }
  }

  const final = valueOf();
  const selections = [];
  for (const group of groups) {
    const hull = hulls.get(group.id);
    const index = taken.get(group.id) || 0;
    const option = hull[index] || hull[0];
    selections.push({
      groupId: group.id,
      option,
      hourIndex: index,
      hullSize: hull.length,
    });
  }
  const lpValue = lp.lpValue;
  return {
    selections,
    usedHours: round(final.hours, 2),
    value: round(final.value, 2),
    lpValue,
    lpBound: lpValue,
    gapPct: lpValue > 1e-9 ? round(((lpValue - final.value) / lpValue) * 100, 2) : 0,
    gapValue: round(lpValue - final.value, 2),
  };
}


/* ------------------------------------------------ two-resource market (delegation) */

/**
 * Delegation is not free and it is not infinite. Handing an obligation off
 * converts leader hours into the delegate's hours, and the delegate is a person
 * with a week. Ignoring that produces the plan the model produces by itself:
 * hand everything to the most reliable person, and spend almost nothing. That is
 * arithmetically correct and operationally absurd.
 *
 * So the market has TWO resources:
 *
 *     maximise   Σ v  subject to   Σ leaderHours ≤ H   and   Σ delegateLoad ≤ D
 *
 * Two constraints make the LP non-greedy, so this is solved by Lagrangian
 * relaxation on the second constraint:
 *
 *     L(μ) = max { Σ (v − μ·load) : Σ leaderHours ≤ H } + μD          μ ≥ 0
 *
 * The inner problem is an ordinary multiple-choice knapsack in leader hours, so
 * Dyer's algorithm still solves it exactly. `L` is convex and piecewise linear in
 * μ, so it is minimised by a golden-section search, and `min L` is a valid UPPER
 * bound on the constrained optimum for every μ ≥ 0 (weak duality). The plan
 * itself is then built over BOTH constraints and improved by local search. The
 * printed gap is the distance between an achievable plan and a bound that holds,
 * which is the only kind of bound worth printing.
 *
 * When μ* is zero the delegate pool was never the binding resource; when it is
 * positive it is the marginal value of one more hour of somebody else's week.
 */
function withPenalty(groups, mu) {
  return groups.map((group) => ({
    id: group.id,
    candidate: group.candidate,
    options: group.options.map((option) => ({
      ...option,
      value: option.value - mu * (option.load || 0),
    })),
  }));
}

function delegateLoadOf(groups, selections) {
  const byId = new Map(groups.map((group) => [group.id, group]));
  let load = 0;
  for (const selection of selections) {
    const group = byId.get(selection.groupId);
    if (group) load += selection.option.load || 0;
  }
  return round(load, 2);
}

function lpDelegateLoad(groups, budgetHours, mu) {
  // Re-run Dyer at this price and read back the delegate load it consumed.
  const adjusted = withPenalty(groups, mu);
  const lp = solveLpRelaxation(adjusted, budgetHours);
  // Recover the load by replaying the same ordering is not possible from the
  // aggregate, so walk the hulls directly here.
  const hulls = new Map(adjusted.map((group) => [group.id, pruneToHull(group.options)]));
  const increments = [];
  for (const group of adjusted) {
    const hull = hulls.get(group.id);
    for (let i = 1; i < hull.length; i += 1) {
      const dh = hull[i].hours - hull[i - 1].hours;
      const dv = hull[i].value - hull[i - 1].value;
      if (!(dh > 0) || !(dv > 0)) continue;
      increments.push({ groupId: group.id, from: i - 1, to: i, dh, dv, ratio: dv / dh });
    }
  }
  increments.sort((a, b) => (b.ratio - a.ratio) || (a.dh - b.dh) || a.groupId.localeCompare(b.groupId));
  const advance = new Map(adjusted.map((group) => [group.id, 0]));
  let used = 0;
  let load = 0;
  for (const increment of increments) {
    if ((advance.get(increment.groupId) || 0) !== increment.from) continue;
    const remaining = budgetHours - used;
    const option = hulls.get(increment.groupId)[increment.to];
    const loadDelta = (option.load || 0) - (hulls.get(increment.groupId)[increment.from].load || 0);
    if (increment.dh <= remaining + 1e-9) {
      used += increment.dh;
      load += loadDelta;
      advance.set(increment.groupId, increment.to);
      continue;
    }
    const fraction = remaining > 0 ? remaining / increment.dh : 0;
    load += loadDelta * fraction;
    break;
  }
  return { lpValue: lp.lpValue, load: round(load, 2) };
}

/** Primal plan honouring BOTH constraints, improved by local search. */
function solvePrimal(groups, budgetHours, delegateHours) {
  const hulls = new Map(groups.map((group) => [group.id, pruneToHull(group.options)]));
  const taken = new Map(groups.map((group) => [group.id, 0]));
  const increments = [];
  for (const group of groups) {
    const hull = hulls.get(group.id);
    for (let i = 1; i < hull.length; i += 1) {
      const dh = hull[i].hours - hull[i - 1].hours;
      const dv = hull[i].value - hull[i - 1].value;
      if (!(dh > 0) || !(dv > 0)) continue;
      increments.push({ groupId: group.id, to: i, dh, dv, ratio: dv / dh, dLoad: (hull[i].load || 0) - (hull[i - 1].load || 0) });
    }
  }
  increments.sort((a, b) => (b.ratio - a.ratio) || (a.dh - b.dh) || a.groupId.localeCompare(b.groupId));
  let hours = 0;
  let load = 0;
  for (const increment of increments) {
    if ((taken.get(increment.groupId) || 0) !== increment.to - 1) continue;
    if (hours + increment.dh > budgetHours + 1e-9) continue;
    if (load + increment.dLoad > delegateHours + 1e-9) continue;
    hours += increment.dh;
    load += increment.dLoad;
    taken.set(increment.groupId, increment.to);
  }
  const totals = () => {
    let value = 0; let h = 0; let l = 0;
    for (const group of groups) {
      const hull = hulls.get(group.id);
      const option = hull[taken.get(group.id) || 0];
      if (option) { value += option.value; h += option.hours; l += option.load || 0; }
    }
    return { value, hours: h, load: l };
  };
  for (let pass = 0; pass < LOCAL_SEARCH_PASSES; pass += 1) {
    let improved = false;
    for (const group of groups) {
      const hull = hulls.get(group.id);
      const index = taken.get(group.id) || 0;
      const current = hull[index];
      const next = hull[index + 1];
      if (!next || !current) continue;
      const state = totals();
      const dh = next.hours - current.hours;
      const dl = (next.load || 0) - (current.load || 0);
      if (state.hours + dh <= budgetHours + 1e-9
        && state.load + dl <= delegateHours + 1e-9
        && next.value > current.value) {
        taken.set(group.id, index + 1);
        improved = true;
      }
    }
    if (!improved) break;
  }
  const final = totals();
  const selections = groups.map((group) => {
    const hull = hulls.get(group.id);
    const index = taken.get(group.id) || 0;
    return { groupId: group.id, option: hull[index] || hull[0], hourIndex: index, hullSize: hull.length };
  });
  return { selections, value: round(final.value, 2), usedHours: round(final.hours, 2), delegateLoad: round(final.load, 2) };
}

/**
 * Solve the market. Falls back to the single-resource path when no obligation in
 * the market can be handed off, because adding an unbounded second resource
 * would make the dual search ill-posed for no gain.
 */
export function solveMarket(groups, { budgetHours, delegateHours, price = true }) {
  const hasDelegation = groups.some((group) => group.options.some((option) => option.mode === 'delegate'));
  const budget = Number.isFinite(budgetHours) && budgetHours > 0 ? budgetHours : 0;
  const capacityForExact = hasDelegation
    ? (Number.isFinite(delegateHours) && delegateHours >= 0 ? delegateHours : ATT_DEFAULT_BUDGET_HOURS * 2)
    : Number.POSITIVE_INFINITY;
  const exact = solveExact(groups, { budgetHours: budget, delegateHours: capacityForExact });
  if (exact.ok && exact.optimal) {
    // The marginal value of an hour is measured, not modelled: re-solve the SAME
    // market with one more hour and take the difference. On a knapsack the value
    // function is a step function, so a finite difference is the exact price of
    // the next hour and it does not depend on a fractional relaxation the leader
    // cannot act on. An extra hour that buys nothing returns zero, which is the
    // honest reading of an unconstrained week.
    const plusHour = price ? solveExact(groups, { budgetHours: budget + 1, delegateHours: capacityForExact }) : null;
    const leaderPrice = plusHour && plusHour.ok ? Math.max(0, round(plusHour.value - exact.value, 2)) : 0;
    let delegatePrice = 0;
    if (price && hasDelegation && Number.isFinite(capacityForExact)) {
      const plusDelegate = solveExact(groups, { budgetHours: budget, delegateHours: capacityForExact + 1 });
      delegatePrice = plusDelegate.ok ? Math.max(0, round(plusDelegate.value - exact.value, 2)) : 0;
    }
    return {
      mode: hasDelegation ? 'exact-two-resource' : 'exact-leader-hours',
      selections: exact.selections,
      value: exact.value,
      usedHours: exact.usedHours,
      delegateLoad: exact.delegateLoad,
      lpValue: exact.value,
      dualBound: exact.value,
      gapPct: 0,
      leaderPrice,
      delegatePrice,
      delegateCapacity: hasDelegation ? capacityForExact : null,
      delegateBinding: hasDelegation && delegatePrice > 0,
      dualEvaluations: exact.nodes,
      optimal: true,
      priceBasis: 'finite difference: the same market re-solved with one more hour',
    };
  }
  if (!hasDelegation) {
    const plain = groups.map((group) => ({
      id: group.id,
      candidate: group.candidate,
      options: group.options.map((option) => ({ ...option, load: option.load || 0 })),
    }));
    const lp = solveLpRelaxation(plain, budget);
    const plan = solvePrimal(plain, budget, Number.POSITIVE_INFINITY);
    return {
      mode: 'leader-hours-only',
      ...plan,
      lpValue: lp.lpValue,
      dualBound: lp.lpValue,
      gapPct: lp.lpValue > 1e-9 ? round(((lp.lpValue - plan.value) / lp.lpValue) * 100, 2) : 0,
      leaderPrice: lp.shadowPrice,
      delegatePrice: 0,
      delegateCapacity: null,
      delegateBinding: false,
      dualEvaluations: 0,
    };
  }
  const capacity = Number.isFinite(delegateHours) && delegateHours >= 0 ? delegateHours : ATT_DEFAULT_BUDGET_HOURS * 2;
  const plain = groups.map((group) => ({
    id: group.id,
    candidate: group.candidate,
    options: group.options.map((option) => ({ ...option, load: option.load || 0 })),
  }));
  // Golden-section search for the minimising μ. L is convex, so the bracket
  // shrinks monotonically; 48 evaluations put the price inside 1e-10 of the
  // optimum for any realistic stake, which is far below a printable digit.
  const maxRatio = Math.max(
    1,
    ...plain.flatMap((group) => group.options.map((option) => (option.load > 0 ? option.value / option.load : 0))),
  );
  let lo = 0;
  let hi = maxRatio;
  const phi = 0.6180339887498949;
  let c = hi - phi * (hi - lo);
  let d = lo + phi * (hi - lo);
  const L = (mu) => {
    const { lpValue, load } = lpDelegateLoad(plain, budget, mu);
    return { value: lpValue + mu * capacity, load };
  };
  let lc = L(c);
  let ld = L(d);
  let evaluations = 2;
  for (let i = 0; i < 46; i += 1) {
    if (lc.value < ld.value) {
      hi = d; d = c; ld = lc;
      c = hi - phi * (hi - lo);
      lc = L(c);
    } else {
      lo = c; c = d; lc = ld;
      d = lo + phi * (hi - lo);
      ld = L(d);
    }
    evaluations += 1;
  }
  const muStar = round((lo + hi) / 2, 6);
  const at = L(muStar);
  const primal = solvePrimal(plain, budget, capacity);
  // Guard the bound: weak duality guarantees min L >= OPT >= primal. A floating
  // point excursion below the primal would be a solver bug, and printing a
  // negative gap would be a lie about the guarantee, so the bound is floored at
  // the achieved value and that clamp is reported.
  const dualBound = round(Math.max(primal.value, at.value), 2);
  const clamped = at.value < primal.value;
  const leaderLp = solveLpRelaxation(plain, budget);
  return {
    mode: 'two-resource',
    ...primal,
    lpValue: leaderLp.lpValue,
    dualBound,
    gapPct: dualBound > 1e-9 ? round(((dualBound - primal.value) / dualBound) * 100, 2) : 0,
    leaderPrice: leaderLp.shadowPrice,
    delegatePrice: muStar > 1e-6 ? muStar : 0,
    delegateCapacity: capacity,
    delegateBinding: primal.delegateLoad >= capacity - 1e-6 && capacity > 0,
    dualEvaluations: evaluations,
    dualClamped: clamped,
  };
}


/* ------------------------------------------------------ bounded exact search */

/**
 * Exact optimum for a small market, by depth-first branch and bound.
 *
 * The Lagrangian dual is a real bound but it is often loose, and a 60% gap on a
 * four-item week reads as a broken solver even when the plan it produced is
 * optimal. For the sizes a leader actually faces — a dozen priced obligations
 * with three modes each — exhaustive search with two prunes is both cheap and
 * conclusive, and "this plan is optimal" is a much better sentence than "this
 * plan is within 65% of a bound".
 *
 * The node budget is the safety valve. When it is exhausted the search returns
 * the best plan it saw and says so (`exhausted: true`); the caller then falls
 * back to the Lagrangian bound. No result is ever reported as optimal unless the
 * whole tree was closed.
 */
const EXACT_NODE_BUDGET = 240000;
const EXACT_MAX_GROUPS = 14;

export function solveExact(groups, { budgetHours, delegateHours }) {
  if (groups.length > EXACT_MAX_GROUPS) return { ok: false, reason: 'market is larger than the exact search allows' };
  const budget = Number.isFinite(budgetHours) && budgetHours > 0 ? budgetHours : 0;
  const capacity = Number.isFinite(delegateHours) && delegateHours >= 0 ? delegateHours : Number.POSITIVE_INFINITY;
  const hulls = groups.map((group) => pruneToHull(group.options).map((option) => ({ ...option, load: option.load || 0 })));
  if (hulls.some((hull) => !hull.length)) return { ok: false, reason: 'a group has no options' };
  // Best-first ordering: the group whose best ratio is highest is decided first,
  // which makes the incumbent strong early and the bound prune hard.
  const order = groups.map((group, index) => index).sort((a, b) => {
    const ratio = (index) => {
      const hull = hulls[index];
      const last = hull[hull.length - 1];
      return last.hours > 0 ? last.value / last.hours : Number.POSITIVE_INFINITY;
    };
    return ratio(b) - ratio(a);
  });
  const suffixMax = new Array(order.length + 1).fill(0);
  for (let i = order.length - 1; i >= 0; i -= 1) {
    const hull = hulls[order[i]];
    suffixMax[i] = suffixMax[i + 1] + hull[hull.length - 1].value;
  }
  let nodes = 0;
  let best = { value: -1, hours: 0, load: 0, pick: null };
  const pick = new Array(groups.length).fill(0);
  const exhausted = { hit: false };
  function dfs(depth, value, hours, load) {
    if (exhausted.hit) return;
    nodes += 1;
    if (nodes > EXACT_NODE_BUDGET) { exhausted.hit = true; return; }
    if (value + suffixMax[depth] <= best.value + 1e-9) return;
    if (depth === order.length) {
      if (value > best.value + 1e-9) best = { value, hours, load, pick: [...pick] };
      return;
    }
    const index = order[depth];
    const hull = hulls[index];
    for (let i = hull.length - 1; i >= 0; i -= 1) {
      const option = hull[i];
      if (hours + option.hours > budget + 1e-9) continue;
      if (load + option.load > capacity + 1e-9) continue;
      pick[index] = i;
      dfs(depth + 1, value + option.value, hours + option.hours, load + option.load);
      if (exhausted.hit) return;
    }
    pick[index] = 0;
  }
  dfs(0, 0, 0, 0);
  if (best.value < 0) return { ok: false, reason: 'no feasible plan' };
  const selections = groups.map((group, index) => ({
    groupId: group.id,
    option: hulls[index][best.pick[index]] || hulls[index][0],
    hourIndex: best.pick[index],
    hullSize: hulls[index].length,
  }));
  return {
    ok: true,
    optimal: !exhausted.hit,
    exhausted: exhausted.hit,
    nodes,
    selections,
    value: round(best.value, 2),
    usedHours: round(best.hours, 2),
    delegateLoad: round(best.load, 2),
  };
}

/* -------------------------------------------------------- the read model */

function emptyReport(conventions) {
  return {
    engine: ATT_ENGINE_VERSION,
    conventions,
    generatedOn: null,
    candidates: [],
    groups: [],
    unpriced: [],
    shadowed: [],
    markets: [],
    plan: null,
    totals: {
      candidates: 0,
      priced: 0,
      unpriced: 0,
      shadowed: 0,
      exposureByCurrency: {},
      unpricedHours: 0,
      priceableHours: 0,
      coveragePct: null,
    },
    discipline: {},
    reliability: { people: [], teamPrior: 0.5, teamMeasured: false, teamN: 0, measuredCount: 0 },
    sensitivity: [],
    notes: [],
  };
}

/**
 * Collapse duplicate obligations onto one atom and split candidates into the
 * three buckets the terminal shows: priced (solvable), unpriced (no money), and
 * shadowed (a second record protecting the same exposed value).
 *
 * The workspace can prove "these two records are the same exposure" only when a
 * typed link says so. That is what this uses: a candidate linked to another
 * candidate through a `structures`, `couples`, `informs` or `rests-on` edge is
 * collapsed to the higher-exposure record, and the survivor is printed with the
 * value it absorbed. No statistical correlation is invented.
 */
export function resolveAtoms(candidates, state = {}) {
  const byKey = new Map(candidates.map((row) => [row.id, row]));
  const links = Array.isArray(state.links) ? state.links : [];
  const parent = new Map();
  const find = (key) => {
    let current = key;
    const path = [];
    while (parent.has(current) && parent.get(current) !== current) { path.push(current); current = parent.get(current); }
    for (const node of path) parent.set(node, current);
    return current;
  };
  const union = (a, b) => {
    if (!byKey.has(a) || !byKey.has(b)) return;
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  const SHARING_RELATIONS = new Set(['structures', 'couples', 'informs', 'rests-on', 'calibrates']);
  for (const link of links) {
    if (!link || !SHARING_RELATIONS.has(link.relation)) continue;
    const a = `${link.sourceType}:${link.sourceId}`;
    const b = `${link.targetType}:${link.targetId}`;
    union(a, b);
  }
  const clusters = new Map();
  for (const row of candidates) {
    const root = find(row.id);
    const list = clusters.get(root) || [];
    list.push(row);
    clusters.set(root, list);
  }
  const shadowed = [];
  for (const list of clusters.values()) {
    if (list.length <= 1) continue;
    const ordered = [...list].sort((a, b) => {
      const av = a.exposure ?? -1;
      const bv = b.exposure ?? -1;
      return bv - av;
    });
    const [survivor, ...rest] = ordered;
    for (const row of rest) {
      shadowed.push({
        ...row,
        shadowedBy: survivor.id,
        shadowedByTitle: survivor.title,
      });
    }
  }
  const shadowedIds = new Set(shadowed.map((row) => row.id));
  const survivors = candidates.filter((row) => !shadowedIds.has(row.id));
  return { survivors, shadowed };
}

/**
 * Hours for a candidate: the record's own estimate if it has one, otherwise the
 * median of hours the leader declared for the same source type in past plans,
 * otherwise null. A pre-filled number is tagged with how it was obtained so the
 * screen can say which ones are still guesses.
 */
export function resolveHours(row, { declarations, history, conventions }) {
  if (row.hours !== null && Number.isFinite(row.hours) && row.hours > 0) {
    return { hours: row.hours, basis: `measured: ${row.hoursBasis}`, source: 'record' };
  }
  const declared = declarations?.[row.id];
  if (declared !== undefined && declared !== null && declared !== '') {
    const value = nonNegative(declared);
    if (value !== null && value > 0) {
      return { hours: round(value, 2), basis: 'declared on this plan', source: 'declared' };
    }
  }
  const prior = history?.[row.sourceType];
  if (prior && prior.n > 0 && prior.median > 0) {
    return {
      hours: round(prior.median, 2),
      basis: `prior: median of ${prior.n} hour(s) you declared for ${ATT_SOURCE_BY_ID[row.sourceType]?.label || row.sourceType} before`,
      source: 'history',
    };
  }
  return { hours: null, basis: row.hoursBasis || 'no effort estimate and no history for this kind of item', source: 'none' };
}

/** Median of declared hours per source type across past committed plans. */
export function hourHistory(plans) {
  const buckets = new Map();
  for (const plan of Array.isArray(plans) ? plans : []) {
    const result = plan?.result;
    if (!result || !Array.isArray(result.items)) continue;
    for (const item of result.items) {
      const hours = nonNegative(item?.hours);
      if (hours === null || hours <= 0) continue;
      const type = str(item.sourceType);
      if (!type) continue;
      const list = buckets.get(type) || [];
      list.push(hours);
      buckets.set(type, list);
    }
  }
  const out = {};
  for (const [type, list] of buckets) {
    const sorted = [...list].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[mid] : round((sorted[mid - 1] + sorted[mid]) / 2, 2);
    out[type] = { n: sorted.length, median };
  }
  return out;
}

/**
 * Build the whole terminal. `options.declarations` maps candidate id → hours the
 * leader typed; `options.delegates` maps candidate id → personId they picked.
 */
export function buildAttentionMarket(state = {}, now = new Date(), options = {}) {
  const at = now instanceof Date ? now : new Date(now);
  const conventions = { ...conventionsFromSettings(state.settings), ...(options.conventions || {}) };
  const budgetHours = nonNegative(options.budgetHours) ?? conventions.budgetHours;
  const report = emptyReport(conventions);
  report.generatedOn = dayKey(at);
  contextNow = at;

  const harvested = harvestCandidates(state, at, conventions);
  const { survivors, shadowed } = resolveAtoms(harvested, state);
  const discipline = completionDiscipline(state, at);
  const reliability = delegateReliability(state, conventions);
  const history = hourHistory(state.attentionPlans);
  const declarations = options.declarations || {};
  const delegateChoices = options.delegates || {};
  const bestDelegate = reliability.people[0] || null;
  // A hand-off is only offered automatically to someone whose own completed
  // delegations say they keep dates. With no evidence the prior makes
  // delegation look strictly better than doing the work — same value, a
  // quarter of the hours — and that is an artefact of the prior, not a finding
  // about the team. Below the sample floor the mode is withheld and the screen
  // asks the leader to name a person, which is a declaration they own.
  const bestMeasuredDelegate = reliability.people.find((person) => person.measured) || null;

  const candidates = [];
  for (const row of survivors) {
    const resolved = resolveHours(row, { declarations, history, conventions });
    const tally = discipline[row.sourceType] || { hits: 0, n: 0, undated: 0 };
    const measured = tally.n >= conventions.minSamples;
    const probability = measured ? shrunkRate(tally.hits, tally.n) : shrunkRate(0, 0);
    const delegable = ATT_SOURCE_BY_ID[row.sourceType]?.delegable !== false;
    const explicit = delegateChoices[row.id];
    const autoDelegate = options.autoDelegate !== false;
    const chosenDelegateId = explicit !== undefined && explicit !== null
      ? String(explicit || '')
      : (autoDelegate && delegable && bestMeasuredDelegate ? bestMeasuredDelegate.personId : '');
    const delegate = delegable && chosenDelegateId
      ? reliability.people.find((p) => p.personId === chosenDelegateId) || null
      : null;
    const entry = {
      ...row,
      hours: resolved.hours,
      hoursBasis: resolved.basis,
      hoursSource: resolved.source,
      successProbability: probability,
      successMeasured: measured,
      successBasis: measured
        ? `${tally.hits} of ${tally.n} ${str(row.sourceType)} records closed by their own due date`
        : `only ${tally.n} closed ${str(row.sourceType)} record(s); a 50% prior is used and flagged`,
      successSamples: tally.n,
      successHits: tally.hits,
      delegable,
      delegateId: delegate ? delegate.personId : null,
      delegateName: delegate ? delegate.name : null,
      delegateRate: delegate ? delegate.rate : null,
      delegateMeasured: delegate ? delegate.measured : false,
      defaultDelegateId: bestMeasuredDelegate ? bestMeasuredDelegate.personId : null,
      defaultDelegateName: bestMeasuredDelegate ? bestMeasuredDelegate.name : null,
      explicitDelegate: explicit !== undefined && explicit !== null && String(explicit) !== '',
    };
    candidates.push(entry);
  }

  const priced = candidates.filter((row) => row.exposure !== null && row.exposure > 0 && row.hours !== null && row.hours > 0);
  const unpriced = candidates.filter((row) => !(row.exposure !== null && row.exposure > 0 && row.hours !== null && row.hours > 0));

  const groups = priced.map((row) => ({
    id: row.id,
    candidate: row,
    options: modesForCandidate(row, {
      successProbability: row.successProbability,
      conventions,
      delegate: row.delegateId ? reliability.people.find((p) => p.personId === row.delegateId) : null,
    }),
  })).filter((group) => group.options.length > 1);

  // One market per currency. Currencies are never summed.
  const currencies = [...new Set(groups.map((group) => group.candidate.currency || 'USD'))].sort();
  const markets = [];
  for (const currency of currencies) {
    const scoped = groups.filter((group) => (group.candidate.currency || 'USD') === currency);
    const explicitBudget = nonNegative(options.budgetByCurrency?.[currency]);
    const share = priced.length
      ? scoped.reduce((acc, group) => acc + (group.candidate.hours || 0), 0)
        / Math.max(1e-9, priced.reduce((acc, row) => acc + (row.hours || 0), 0))
      : 0;
    const marketBudget = explicitBudget ?? round(budgetHours * share, 2);
    const delegateCapacity = nonNegative(options.delegateHoursByCurrency?.[currency]) ?? conventions.delegateHours;
    const solution = solveMarket(scoped, {
      budgetHours: marketBudget,
      delegateHours: delegateCapacity,
      price: options.price !== false,
    });
    const byGroup = new Map(solution.selections.map((row) => [row.groupId, row]));
    const chosen = [];
    const dropped = [];
    for (const group of scoped) {
      const selection = byGroup.get(group.id);
      const option = selection?.option || group.options[0];
      const row = group.candidate;
      if (option.mode === 'drop') {
        dropped.push({
          candidate: row,
          reason: 'the solver could not buy it inside the hour budget',
          forgone: round(row.exposure * row.successProbability, 2),
          forgonePerHour: row.hours ? round((row.exposure * row.successProbability) / row.hours, 2) : null,
        });
      } else {
        chosen.push({
          candidate: row,
          mode: option.mode,
          hours: option.hours,
          value: round(option.value, 2),
          probability: option.probability,
          delegateId: option.delegateId || null,
          delegateName: option.delegateName || null,
          ratio: option.hours > 0 ? round(option.value / option.hours, 2) : null,
        });
      }
    }
    // Where the hand-offs actually land. The solver promises a probability per
    // person; it does not guarantee that person has the hours to absorb the
    // volume. This is printed, not enforced, because the delegate's own
    // capacity is the Capacity module's measurement and inventing a ceiling
    // here would silently override it.
    const delegateLoad = new Map();
    for (const row of chosen) {
      if (row.mode !== 'delegate' || !row.delegateId) continue;
      const entry = delegateLoad.get(row.delegateId) || {
        personId: row.delegateId,
        name: row.delegateName,
        items: 0,
        effortHours: 0,
        handoffHours: 0,
      };
      entry.items += 1;
      entry.effortHours = round(entry.effortHours + (row.candidate.hours || 0), 2);
      entry.handoffHours = round(entry.handoffHours + row.hours, 2);
      delegateLoad.set(row.delegateId, entry);
    }
    chosen.sort((a, b) => (b.value - a.value) || a.candidate.title.localeCompare(b.candidate.title));
    dropped.sort((a, b) => (b.forgone - a.forgone) || a.candidate.title.localeCompare(b.candidate.title));
    markets.push({
      currency,
      budgetHours: marketBudget,
      usedHours: solution.usedHours,
      leftHours: round(marketBudget - solution.usedHours, 2),
      value: solution.value,
      lpBound: solution.dualBound,
      lpRelaxationValue: solution.lpValue,
      gapPct: solution.gapPct,
      gapValue: round(solution.dualBound - solution.value, 2),
      shadowPrice: solution.leaderPrice,
      delegatePrice: solution.delegatePrice,
      delegateCapacity: solution.delegateCapacity,
      delegateHoursUsed: solution.delegateLoad,
      delegateBinding: solution.delegateBinding,
      solverMode: solution.mode,
      dualClamped: Boolean(solution.dualClamped),
      // Binding means "another hour would buy something", which is a stronger
      // and more useful claim than "the hours happen to add up to the budget".
      saturated: solution.leaderPrice > 0,
      optimal: Boolean(solution.optimal),
      priceBasis: solution.priceBasis || 'linear-programming dual at the budget boundary',
      groupCount: scoped.length,
      chosen,
      dropped,
      pricedHours: round(scoped.reduce((acc, group) => acc + (group.candidate.hours || 0), 0), 2),
      totalExposure: round(scoped.reduce((acc, group) => acc + (group.candidate.exposure || 0), 0), 2),
      delegatedCount: chosen.filter((row) => row.mode === 'delegate').length,
      delegateLoad: [...delegateLoad.values()].sort((a, b) => b.effortHours - a.effortHours),
      delegatedHoursSaved: round(chosen.reduce((acc, row) => {
        if (row.mode !== 'delegate') return acc;
        return acc + Math.max(0, (row.candidate.hours || 0) - row.hours);
      }, 0), 2),
    });
  }

  const exposureByCurrency = {};
  for (const row of priced) {
    const key = row.currency || 'USD';
    exposureByCurrency[key] = round((exposureByCurrency[key] || 0) + row.exposure, 2);
  }
  const pricedHours = round(priced.reduce((acc, row) => acc + row.hours, 0), 2);
  const unpricedHours = round(unpriced.reduce((acc, row) => acc + (row.hours || 0), 0), 2);
  const totalHours = pricedHours + unpricedHours;

  report.candidates = candidates;
  report.groups = groups;
  report.unpriced = unpriced;
  report.shadowed = shadowed;
  report.markets = markets;
  report.discipline = discipline;
  report.reliability = reliability;
  report.totals = {
    candidates: candidates.length,
    priced: priced.length,
    unpriced: unpriced.length,
    shadowed: shadowed.length,
    exposureByCurrency,
    unpricedHours,
    priceableHours: pricedHours,
    totalHours: round(totalHours, 2),
    coveragePct: totalHours > 0 ? round((pricedHours / totalHours) * 100, 1) : null,
    chosenCount: markets.reduce((acc, market) => acc + market.chosen.length, 0),
    droppedCount: markets.reduce((acc, market) => acc + market.dropped.length, 0),
    delegatedCount: markets.reduce((acc, market) => acc + market.delegatedCount, 0),
    hoursSavedByDelegation: round(markets.reduce((acc, market) => acc + market.delegatedHoursSaved, 0), 2),
    totalValue: round(markets.reduce((acc, market) => acc + market.value, 0), 2),
  };

  // Sensitivity: what does the plan look like if the week shrinks or grows?
  // This is five extra solves of the same market and it is only rendered on the
  // Frontier tab, so callers that need a cheap read — the signal feed, the nav
  // badge — switch it off rather than paying for a curve nobody is looking at.
  for (const factor of (options.sensitivity === false ? [] : SENSITIVITY_FACTORS)) {
    const row = { factor, budgetHours: round(budgetHours * factor, 2), markets: [] };
    for (const currency of currencies) {
      const scoped = groups.filter((group) => (group.candidate.currency || 'USD') === currency);
      const share = priced.length
        ? scoped.reduce((acc, group) => acc + (group.candidate.hours || 0), 0)
          / Math.max(1e-9, priced.reduce((acc, item) => acc + (item.hours || 0), 0))
        : 0;
      const marketBudget = round(budgetHours * factor * share, 2);
      const solution = solveMarket(scoped, { budgetHours: marketBudget, delegateHours: conventions.delegateHours });
      const selectedIds = new Set(solution.selections
        .filter((selection) => selection.option.mode !== 'drop')
        .map((selection) => selection.groupId));
      row.markets.push({
        currency,
        budgetHours: marketBudget,
        value: solution.value,
        usedHours: solution.usedHours,
        delegateLoad: solution.delegateLoad,
        shadowPrice: solution.leaderPrice,
        selectedIds: [...selectedIds],
      });
    }
    report.sensitivity.push(row);
  }

  const binding = markets.filter((market) => market.saturated);
  const unpricedShare = totalHours > 0 ? (unpricedHours / totalHours) * 100 : 0;
  if (!candidates.length) {
    report.notes.push({
      tone: 'neutral',
      title: 'Nothing to allocate yet',
      body: 'The market is built from obligations the workspace can price: open cases with a three-point cost estimate, funded work with an effort and a value estimate, active negotiations above their BATNA, critical dependencies with a measured daily impact, overspent budgets, and priced decision frames. Record one of those and it appears here automatically.',
    });
  }
  if (unpricedShare >= 25) {
    report.notes.push({
      tone: 'caution',
      title: `${unpricedHours} hours of your queue could not be priced and were not optimised`,
      body: `That is ${round(unpricedShare, 0)}% of the recorded queue. Unpriced work cannot compete with priced work in any prioritisation, including this one — the solver is not ignoring those items out of judgement, it has no number to rank them by. Either price them or accept that they will always lose to the items that are.`,
    });
  }
  for (const market of binding) {
    report.notes.push({
      tone: 'info',
      title: `${market.currency}: the hour budget is binding, and one more hour is worth ${money(market.shadowPrice, market.currency)}`,
      body: `The linear-programming dual at the budget boundary prices the next hour at ${money(market.shadowPrice, market.currency)} of expected protected value. That is a marginal rate, not an average: it holds only while the same item stays at the boundary.`,
    });
  }
  for (const market of markets.filter((row) => row.delegateBinding)) {
    report.notes.push({
      tone: 'caution',
      title: `${market.currency}: the delegate pool is the binding constraint, not your calendar`,
      body: `The plan fills all ${market.delegateCapacity} h of delegated capacity. The Lagrangian price of one more delegate hour is ${money(market.delegatePrice, market.currency)} of expected protected value — which is a statement about someone else's week, not yours. Adding leader hours buys nothing here; adding a second capable owner does.`,
    });
  }
  const notBinding = markets.filter((market) => !market.saturated);
  for (const market of notBinding) {
    if (market.leftHours > 0.5) {
      report.notes.push({
        tone: 'good',
        title: `${market.currency}: you are not actually time-constrained`,
        body: `${market.leftHours} h of the ${market.budgetHours} h budget is unspent because nothing left in the queue clears the cut. The constraint here is the supply of priceable, worthwhile obligations — not the calendar. Adding hours would buy nothing.`,
      });
    }
  }
  return report;
}

/* ---------------------------------------------------------------- signals */

const PRIORITY = 60;

/**
 * Signals and the nav badge need the counts and the binding flags, not the
 * frontier curve or the marginal price of an hour. Those two extras are two
 * extra solves each and they are only read on the terminal itself.
 */
const CHEAP_READ = Object.freeze({ sensitivity: false, price: false });

/**
 * Signals for the workspace feed. Each one names a decision the leader can make
 * today; none of them is a reminder to "review the module".
 */
export function attSignals(state = {}, now = new Date()) {
  const report = buildAttentionMarket(state, now, CHEAP_READ);
  const out = [];
  const push = (signal) => out.push({ domain: 'Attention market', severity: 2, priority: PRIORITY, ...signal });

  const binding = report.markets.filter((market) => market.saturated);
  for (const market of binding.slice(0, 1)) {
    push({
      ruleId: 'ATT-S1',
      severity: 4,
      priority: 78,
      title: `Your hour is worth ${money(market.shadowPrice, market.currency)} and the week is oversubscribed`,
      detail: `${market.currency} obligations worth ${money(market.totalExposure, market.currency)} are open against a ${market.budgetHours} h budget. The best feasible plan buys ${money(market.value, market.currency)} of expected protected value and ${market.dropped.length} item(s) do not fit. The marginal hour clears ${money(market.shadowPrice, market.currency)}; that is the number to quote when someone asks for another meeting.`,
      evidence: [
        `Budget ${market.budgetHours} h · used ${market.usedHours} h`,
        `Expected protected value ${money(market.value, market.currency)}`,
        `LP bound ${money(market.lpBound, market.currency)} · gap ${market.gapPct}%`,
        `${market.dropped.length} obligation(s) forgone`,
      ],
      route: '#/attention',
      action: { label: 'Open the attention market', route: '#/attention' },
      entityType: null,
      entityId: null,
    });
    break;
  }

  const delegable = report.markets.flatMap((market) => market.chosen.filter((row) => row.mode === 'delegate'));
  if (delegable.length) {
    const saved = report.totals.hoursSavedByDelegation;
    push({
      ruleId: 'ATT-S2',
      severity: 3,
      priority: 66,
      title: `${delegable.length} obligation(s) are worth more handed off than done`,
      detail: `Given this team's own on-time record, handing these off protects ${money(delegable.reduce((acc, row) => acc + row.value, 0), delegable[0].candidate.currency)} of expected value for ${roundh(delegable.reduce((acc, row) => acc + row.hours, 0))} h of your time instead of ${roundh(delegable.reduce((acc, row) => acc + (row.candidate.hours || 0), 0))} h — ${saved} h back.`,
      evidence: delegable.slice(0, 3).map((row) => `${row.candidate.title} → ${row.delegateName}`),
      route: '#/attention?tab=plan',
      action: { label: 'See the hand-offs', route: '#/attention?tab=plan' },
      entityType: null,
      entityId: null,
    });
  }

  if (report.unpriced.length) {
    const hours = report.totals.unpricedHours;
    push({
      ruleId: 'ATT-S3',
      severity: 3,
      priority: 63,
      title: `${report.unpriced.length} open obligation(s) carry no money value`,
      detail: `${hours} h of the recorded queue cannot enter the optimisation, so it cannot win a contest against work that can. This is not the solver's opinion — it is the arithmetic consequence of a missing field. Price the ones that matter, or expect them to be dropped every week.`,
      evidence: report.unpriced.slice(0, 3).map((row) => `${row.title} — ${row.exposureBasis.slice(0, 80)}`),
      route: '#/attention?tab=unpriced',
      action: { label: 'See what cannot compete', route: '#/attention?tab=unpriced' },
      entityType: null,
      entityId: null,
    });
  }

  const reviewDue = (Array.isArray(state.attentionPlans) ? state.attentionPlans : [])
    .filter((plan) => plan && plan.status === 'committed')
    .filter((plan) => {
      const due = plan.result?.reviewOn;
      return Boolean(due) && dayKey(now) >= due;
    });
  for (const plan of reviewDue.slice(0, 1)) {
    push({
      ruleId: 'ATT-S4',
      severity: 4,
      priority: 74,
      title: `The plan you committed on ${plan.committedOn} is due for its own result`,
      detail: `It predicted ${money(plan.result?.value, plan.result?.currency)} of expected protected value for ${plan.result?.usedHours} h. Until it is reviewed that number is a forecast, not a result, and the workspace has no evidence about whether this way of spending a week works.`,
      evidence: [
        `Committed ${plan.committedOn}`,
        `Budget ${plan.result?.budgetHours} h`,
        `Review due ${plan.result?.reviewOn}`,
      ],
      route: `#/attention?tab=plan&plan=${encodeURIComponent(plan.id)}`,
      action: { label: 'Review the plan', route: `#/attention?tab=plan&plan=${encodeURIComponent(plan.id)}` },
      entityType: 'attention',
      entityId: plan.id,
    });
    break;
  }

  const unmeasured = report.candidates.filter((row) => !row.successMeasured).length;
  if (report.candidates.length >= 5 && unmeasured === report.candidates.length) {
    push({
      ruleId: 'ATT-S5',
      severity: 2,
      priority: 41,
      title: 'Every success probability in the plan is a prior, not a measurement',
      detail: `No obligation class has ${report.conventions.minSamples} closed records yet, so every value in the optimisation uses a 50% prior. The ranking is then a ranking of exposure per hour and nothing more. Close ${report.conventions.minSamples} of anything with a due date and the next plan will use your own record instead.`,
      evidence: Object.entries(report.discipline).map(([key, tally]) => `${key}: ${tally.hits}/${tally.n}`).slice(0, 5),
      route: '#/attention?tab=method',
      action: { label: 'How probabilities are derived', route: '#/attention?tab=method' },
      entityType: null,
      entityId: null,
    });
  }
  return out;
}

function roundh(value) {
  return round(value, 1);
}

/** Nav badge: items the solver could not buy, plus plans awaiting a review. */
export function attentionAttentionCount(state = {}, now = new Date()) {
  const report = buildAttentionMarket(state, now, CHEAP_READ);
  const due = (Array.isArray(state.attentionPlans) ? state.attentionPlans : [])
    .filter((plan) => plan && plan.status === 'committed' && plan.result?.reviewOn && dayKey(now) >= plan.result.reviewOn)
    .length;
  return report.totals.droppedCount + due;
}

/* ------------------------------------------------------------------ brief */

/** Deterministic plain-text brief for the download button. */
export function attentionBrief(state = {}, now = new Date(), options = {}) {
  const report = buildAttentionMarket(state, now, options);
  const lines = [];
  lines.push('ATTENTION MARKET');
  lines.push(`Generated ${report.generatedOn}`);
  lines.push('');
  lines.push(`Candidates ${report.totals.candidates} · priced ${report.totals.priced} · unpriced ${report.totals.unpriced} · shadowed ${report.totals.shadowed}`);
  if (report.totals.coveragePct !== null) {
    lines.push(`Priceable share of recorded hours: ${report.totals.coveragePct}% (${report.totals.priceableHours} h of ${report.totals.totalHours} h)`);
  }
  lines.push('');
  for (const market of report.markets) {
    lines.push(`— ${market.currency} —`);
    lines.push(`Budget ${market.budgetHours} h · allocated ${market.usedHours} h · left ${market.leftHours} h`);
    lines.push(`Expected protected value ${money(market.value, market.currency)} (LP bound ${money(market.lpBound, market.currency)}, gap ${market.gapPct}%)`);
    lines.push(`Shadow price of one hour: ${market.saturated ? money(market.shadowPrice, market.currency) : 'zero — the budget is not binding'}`);
    lines.push('');
    lines.push('  Buy:');
    for (const row of market.chosen) {
      const who = row.mode === 'delegate' ? ` (handed to ${row.delegateName} at ${Math.round(row.probability * 100)}%)` : ` (you, ${Math.round(row.probability * 100)}% confidence)`;
      lines.push(`    ${row.candidate.title} · ${row.hours} h · ${money(row.value, market.currency)}${who}`);
    }
    if (!market.chosen.length) lines.push('    nothing clears the cut');
    lines.push('  Forgo:');
    for (const row of market.dropped.slice(0, 10)) {
      lines.push(`    ${row.candidate.title} · ${row.candidate.hours} h · gives up ${money(row.forgone, market.currency)}`);
    }
    if (!market.dropped.length) lines.push('    nothing is being forgone inside the budget');
    lines.push('');
  }
  if (report.unpriced.length) {
    lines.push(`UNPRICED — ${report.unpriced.length} item(s), ${report.totals.unpricedHours} h, excluded from the optimisation`);
    for (const row of report.unpriced.slice(0, 15)) {
      lines.push(`  ${row.title} · ${row.exposureBasis}`);
    }
    lines.push('');
  }
  lines.push('METHOD');
  lines.push('Multiple-choice knapsack: do / hand off / let it carry, one choice per obligation, subject to one hour budget per currency.');
  lines.push('The linear relaxation is solved exactly by the incremental-ratio algorithm after convex-hull pruning (Dyer 1984; Zemel 1984). The integer plan is built from the same ordering and improved by local search.');
  lines.push('The LP bound and the achieved value are both printed; the gap between them is a stated distance, not a claim of optimality.');
  lines.push('Success probabilities are empirical-Bayes shrunk rates from closed records with a due date, one pseudo-observation, prior 50% below four observations.');
  lines.push('Currencies are never summed. No correlation between obligations is modelled, and no hours are inferred where a record has none.');
  return lines.join('\n');
}

/* ------------------------------------------------------------ review score */

/**
 * Grade a committed plan against what the records actually did.
 *
 * Each selected item is re-read from the workspace and classified:
 *   realised  — the record moved and its exposure fell (or the work landed).
 *   open      — the record has not moved yet; it is neither a hit nor a miss.
 *   contradicted — the record moved the wrong way (exposure rose, a case
 *                  reopened). That is the one outcome a plan must be held to.
 *   unmeasured — the source type has no mechanical reading.
 *
 * The predicted success probability is scored as a Brier term only over items
 * with a realised or contradicted verdict. Open and unmeasured items are
 * excluded from the score and counted, because scoring an unfinished item as a
 * miss would make every plan look bad at the moment it is written.
 */
export function scoreAttentionPlan(plan, state = {}, now = new Date()) {
  if (!plan || !plan.result) return { ok: false, reason: 'no frozen plan to score' };
  const at = now instanceof Date ? now : new Date(now);
  const frozen = plan.result;
  const items = Array.isArray(frozen.items) ? frozen.items : [];
  const readings = [];
  let realised = 0;
  let contradicted = 0;
  let open = 0;
  let unmeasured = 0;
  let brierSum = 0;
  let brierN = 0;
  for (const item of items) {
    if (!item || !item.sourceType) continue;
    const current = currentExposureOf(item, state);
    const entry = {
      id: item.id,
      title: item.title,
      sourceType: item.sourceType,
      predicted: item.probability,
      frozenExposure: item.exposure,
      currentExposure: current.exposure,
      verdict: 'unmeasured',
      avoided: null,
      note: current.note,
    };
    if (current.exposure === null) {
      unmeasured += 1;
    } else if (current.exposure <= 0) {
      entry.verdict = 'realised';
      entry.avoided = item.exposure;
      realised += 1;
      brierSum += (1 - item.probability) ** 2;
      brierN += 1;
    } else if (current.exposure < item.exposure) {
      entry.verdict = 'realised';
      entry.avoided = round(item.exposure - current.exposure, 2);
      realised += 1;
      brierSum += (1 - item.probability) ** 2;
      brierN += 1;
    } else if (current.exposure > item.exposure) {
      entry.verdict = 'contradicted';
      entry.avoided = 0;
      contradicted += 1;
      brierSum += item.probability ** 2;
      brierN += 1;
    } else {
      entry.verdict = 'open';
      open += 1;
    }
    readings.push(entry);
  }
  const currency = frozen.currency || null;
  const predictedValue = Number(frozen.value) || 0;
  const measuredAvoided = round(readings.reduce((acc, row) => acc + (row.avoided || 0), 0), 2);
  const scored = readings.filter((row) => row.verdict === 'realised' || row.verdict === 'contradicted');
  return {
    ok: true,
    reviewedOn: dayKey(at),
    currency,
    predictedValue,
    measuredAvoided,
    attainmentPct: predictedValue > 0 ? round((measuredAvoided / predictedValue) * 100, 1) : null,
    counts: { total: readings.length, realised, contradicted, open, unmeasured },
    brier: brierN ? round(brierSum / brierN, 4) : null,
    brierN,
    readings,
    complete: open === 0 && unmeasured === 0,
    notes: [
      'Measured avoided value is the drop in each record\'s own declared exposure since the plan was frozen. It is not proof that the work caused the drop.',
      open ? `${open} selected item(s) have not moved yet and are excluded from the score.` : null,
      unmeasured ? `${unmeasured} selected item(s) carry no mechanical exposure reading and are excluded from the score.` : null,
    ].filter(Boolean),
  };
}

function currentExposureOf(item, state) {
  const id = item.sourceId;
  if (item.sourceType === 'case') {
    const row = (state.cases || []).find((entry) => entry && entry.id === id);
    if (!row) return { exposure: null, note: 'the case no longer exists' };
    if (['resolved', 'closed'].includes(row.status)) return { exposure: 0, note: 'the case is resolved' };
    const fin = row.financial || {};
    const pert = pertTriple({ optimistic: fin.optimistic, mostLikely: fin.mostLikely, pessimistic: fin.pessimistic });
    if (!pert.measured) return { exposure: null, note: 'the case lost its cost estimate' };
    return { exposure: round(pert.expected, 2), note: `${row.status}` };
  }
  if (item.sourceType === 'portfolio') {
    const row = (state.portfolio || []).find((entry) => entry && entry.id === id);
    if (!row) return { exposure: null, note: 'the item no longer exists' };
    if (row.status === 'done' || row.completedOn) return { exposure: 0, note: 'the work landed' };
    if (row.status === 'released') return { exposure: 0, note: 'the work was released' };
    const value = pertTriple(row.value);
    if (!value.measured) return { exposure: null, note: 'the item lost its value estimate' };
    return { exposure: round(value.expected, 2), note: row.status };
  }
  if (item.sourceType === 'negotiation') {
    const row = (state.negotiations || []).find((entry) => entry && entry.id === id);
    if (!row) return { exposure: null, note: 'the negotiation no longer exists' };
    if (row.status === 'agreed' || row.closedOn) return { exposure: 0, note: `closed ${row.closedOn || ''}`.trim() };
    if (row.status === 'walked-away') return { exposure: 0, note: 'walked away' };
    const stakes = nonNegative(row.stakesValue);
    const batna = nonNegative(row.ourBatnaValue);
    if (stakes === null || batna === null) return { exposure: null, note: 'stakes or BATNA missing' };
    return { exposure: round(Math.max(0, stakes - batna), 2), note: row.status };
  }
  if (item.sourceType === 'dependency') {
    const row = (state.dependencies || []).find((entry) => entry && entry.id === id);
    if (!row) return { exposure: null, note: 'the dependency no longer exists' };
    if (row.status !== 'active') return { exposure: 0, note: `now ${row.status}` };
    const daily = nonNegative(row.dailyImpactOverride) ?? nonNegative(row.derivedDailyImpact);
    const ttr = nonNegative(row.ttrDays);
    if (daily === null || ttr === null) return { exposure: null, note: 'impact or recovery time missing' };
    return { exposure: round(daily * ttr, 2), note: 'still active' };
  }
  if (item.sourceType === 'budget') {
    const row = (state.budgets || []).find((entry) => entry && entry.id === id);
    if (!row) return { exposure: null, note: 'the budget no longer exists' };
    const limit = nonNegative(row.limit);
    if (limit === null) return { exposure: null, note: 'the ceiling is gone' };
    let committed = 0;
    for (const line of Array.isArray(row.lines) ? row.lines : []) {
      if (line && ['committed', 'spent', 'settled'].includes(line.status)) {
        committed += nonNegative(line.actualAmount) ?? nonNegative(line.committedAmount) ?? 0;
      }
    }
    return { exposure: round(Math.max(0, committed - limit), 2), note: row.status };
  }
  if (item.sourceType === 'voi') {
    const row = (state.voiDecisions || []).find((entry) => entry && entry.id === id);
    if (!row) return { exposure: null, note: 'the frame no longer exists' };
    if (row.status !== 'open') return { exposure: 0, note: `now ${row.status}` };
    const values = (row.payoffs || []).map((payoff) => num(payoff?.value)).filter((value) => value !== null).map(Math.abs);
    if (!values.length) return { exposure: null, note: 'no priced payoff cell' };
    return { exposure: round(Math.max(...values), 2), note: 'still open' };
  }
  return { exposure: null, note: 'this source type has no exposure reading' };
}

/* --------------------------------------------------------- plan assembly */

/**
 * Freeze the plan the leader is committing to. The result object is the whole
 * prediction: the chosen set, the forgone set with its price, the LP bound, the
 * shadow price and the success probability used for every item. Everything else
 * in the module is re-derived on load, so a stored figure can never drift.
 */
export function freezePlan(state, now, options = {}) {
  const at = now instanceof Date ? now : new Date(now);
  const report = buildAttentionMarket(state, at, options);
  const conventions = report.conventions;
  const primaryCurrency = options.currency || report.markets[0]?.currency || null;
  const market = report.markets.find((row) => row.currency === primaryCurrency) || report.markets[0] || null;
  if (!market) return { ok: false, reason: 'nothing priceable to commit' };
  const reviewOn = dayKey(addDays(at, conventions.horizonDays));
  const items = market.chosen.map((row) => ({
    id: row.candidate.id,
    sourceType: row.candidate.sourceType,
    sourceId: row.candidate.sourceId,
    title: row.candidate.title,
    route: row.candidate.route,
    mode: row.mode,
    hours: row.hours,
    hoursIfDoneByLeader: row.candidate.hours,
    exposure: row.candidate.exposure,
    currency: row.candidate.currency,
    probability: row.probability,
    probabilityMeasured: row.candidate.successMeasured,
    value: row.value,
    delegateId: row.delegateId,
    delegateName: row.delegateName,
  }));
  const forgone = market.dropped.map((row) => ({
    id: row.candidate.id,
    sourceType: row.candidate.sourceType,
    sourceId: row.candidate.sourceId,
    title: row.candidate.title,
    hours: row.candidate.hours,
    exposure: row.candidate.exposure,
    currency: row.candidate.currency,
    forgone: row.forgone,
    reason: row.reason,
  }));
  return {
    ok: true,
    result: {
      currency: market.currency,
      budgetHours: market.budgetHours,
      usedHours: market.usedHours,
      leftHours: market.leftHours,
      value: market.value,
      lpBound: market.lpBound,
      gapPct: market.gapPct,
      shadowPrice: market.shadowPrice,
      saturated: market.saturated,
      totalExposure: market.totalExposure,
      items,
      forgone,
      coveragePct: report.totals.coveragePct,
      unpricedCount: report.totals.unpriced,
      unpricedHours: report.totals.unpricedHours,
      otherMarkets: report.markets.filter((row) => row.currency !== market.currency).map((row) => ({
        currency: row.currency,
        budgetHours: row.budgetHours,
        value: row.value,
        chosen: row.chosen.length,
        dropped: row.dropped.length,
      })),
      committedOn: dayKey(at),
      reviewOn,
      horizonDays: conventions.horizonDays,
      handoffSharePct: conventions.handoffSharePct,
    },
  };
}
