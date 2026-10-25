/**
 * app/core/domain/capacity.js — Team Capacity, Flow & Portfolio Allocation.
 *
 * The operating-plan layer of LeadOS. Goals, delegations, operational cases
 * and 30-60-90 plans each record *intent*; none of them answers the manager's
 * actual weekly question: "given the people I have, what can we really commit
 * to, what has to give, and how confident should I be in that date?"
 *
 * This module answers it with named, citable methods rather than vibes:
 *
 *  1. Production / Operations Research — capacity planning with an explicit
 *     operational-load reserve, and *queueing* theory: Little's Law
 *     (WIP = Throughput × Cycle Time; Little, 1961) plus Kingman's diffusion
 *     approximation for queue wait (Kingman, 1961), so utilisation is shown as
 *     what it actually costs in lead time rather than as a vanity percentage.
 *  2. Economics / Finance — opportunity cost, value density (net present value
 *     per unit of the scarcest resource), marginal analysis at the funding
 *     boundary, and a kill/defer discipline instead of sunk-cost reasoning.
 *  3. Mathematics / Statistics — three-point Beta-PERT estimates per item, and
 *     portfolio aggregation of independent PERT variances (central limit
 *     theorem) into P50/P80/P90 delivery dates with a normal-CDF probability of
 *     hitting a target date.
 *  4. Leadership — protected focus (fewer, funded commitments), explicit
 *     trade-offs recorded as owned decisions, and capacity reserved for
 *     incidents rather than assumed away.
 *
 * Pure module: no DOM, no storage, no wall-clock globals. Every function takes
 * `now`. Nothing is invented: an unestimated item stays unestimated and is
 * counted as such instead of being given a plausible default.
 */

import { addDays, dayKey, daysBetween, round } from '../time.js';

export const PORTFOLIO_DECISIONS = ['undecided', 'funded', 'deferred', 'cut'];

export const PORTFOLIO_DECISION_LABELS = {
  undecided: 'Undecided',
  funded: 'Funded',
  deferred: 'Deferred',
  cut: 'Cut',
};

export const PORTFOLIO_STATUSES = ['open', 'done', 'released'];

export const PORTFOLIO_STATUS_LABELS = {
  open: 'Open',
  done: 'Delivered',
  released: 'Capacity released',
};

export const PORTFOLIO_KINDS = ['project', 'capacity-reserve', 'maintenance', 'compliance', 'hiring'];

export const PORTFOLIO_KIND_LABELS = {
  project: 'Planned work',
  'capacity-reserve': 'Capacity reserve (incident/mitigation)',
  maintenance: 'Maintenance & operations',
  compliance: 'Compliance & audit',
  hiring: 'Hiring & interviews',
};

export const PORTFOLIO_SOURCE_TYPES = ['manual', 'goal', 'case', 'delegation', 'requisition', 'change'];

/**
 * Utilisation bands (committed ÷ allocatable). The 80% guardrail comes from
 * queueing theory rather than preference: beyond ~80% utilisation, wait time
 * grows hyperbolically (Kingman), so a team at 95% has roughly four times the
 * queue delay of a team at 80% for the same service time.
 */
export const UTILISATION_BANDS = [
  { id: 'slack', max: 0.55, label: 'Under-committed', tone: 'caution', guidance: 'There is unallocated capacity. Fund the highest value-density item or reserve the time before it is absorbed by low-value work.' },
  { id: 'healthy', max: 0.8, label: 'Sustainable', tone: 'good', guidance: 'Committed work fits with a real buffer for interrupts. This is the band the queueing maths supports.' },
  { id: 'elevated', max: 0.9, label: 'Elevated', tone: 'warn', guidance: 'The buffer is thin: one incident will push delivery, and queue delay is already climbing.' },
  { id: 'overloaded', max: 1, label: 'Overloaded', tone: 'caution', guidance: 'Every additional day of work now costs more than a day of delivery. Defer or cut explicitly instead of absorbing it silently.' },
  { id: 'infeasible', max: Infinity, label: 'Infeasible', tone: 'bad', guidance: 'Committed work exceeds the capacity that exists. Something has to be removed — the plan cannot be met as written.' },
];

export function utilisationBand(value) {
  if (value === null || value === undefined || value === '') {
    return { id: 'unmeasured', max: null, label: 'Not measured', tone: 'neutral', guidance: 'Record team members and at least one estimate to see utilisation.' };
  }
  const v = Number(value);
  if (!Number.isFinite(v)) return { id: 'unmeasured', max: null, label: 'Not measured', tone: 'neutral', guidance: 'Record team members and at least one estimate to see utilisation.' };
  return UTILISATION_BANDS.find((band) => v <= band.max) || UTILISATION_BANDS[UTILISATION_BANDS.length - 1];
}

/**
 * Ramp factors for people whose effective capacity is reduced by a transition.
 * These are planning conventions (documented as such, editable in Settings),
 * not measurements of anyone's ability. A new joiner in the first month is
 * assumed to contribute less than half of a settled teammate's focus time
 * because the manager and the buddy are also spending time on scaffolding.
 */
export const RAMP_CONVENTIONS = {
  'new-hire-early': { factor: 0.45, label: 'New joiner, first 30 days' },
  'new-hire-ramping': { factor: 0.75, label: 'New joiner, days 31–90' },
  'role-transition': { factor: 0.8, label: 'Role transition / acting seat' },
  reboarding: { factor: 0.7, label: 'Returning from extended leave' },
};

/** Manager + buddy time an active 30-60-90 plan costs inside the horizon. */
export const ONBOARDING_SCAFFOLD_DAYS = 2;
export const NEW_HIRE_SCAFFOLD_DAYS = 3;

/** Variability factor (Ca² + Cs²) / 2 for Kingman. 1.0 = Poisson/exponential. */
const KINGMAN_VARIABILITY = 1;
const Z_80 = 0.8416212335729143; // Standard normal 80th percentile

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function nonNegative(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function round2(n) {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/** Beta-PERT mean and standard deviation for a three-point estimate. */
export function pertTriple(triple = {}) {
  const values = [
    nonNegative(triple.optimistic, 0),
    nonNegative(triple.mostLikely, 0),
    nonNegative(triple.pessimistic, 0),
  ].sort((a, b) => a - b);
  const [optimistic, mostLikely, pessimistic] = values;
  const measured = optimistic > 0 || mostLikely > 0 || pessimistic > 0;
  const expected = (optimistic + 4 * mostLikely + pessimistic) / 6;
  const stdDev = (pessimistic - optimistic) / 6;
  const variance = stdDev * stdDev;
  return {
    measured,
    optimistic: round2(optimistic),
    mostLikely: round2(mostLikely),
    pessimistic: round2(pessimistic),
    expected: round2(expected),
    stdDev: round2(stdDev),
    variance: round2(variance),
    p10: round2(Math.max(0, expected - 1.2815515655446004 * stdDev)),
    p90: round2(Math.max(0, expected + 1.2815515655446004 * stdDev)),
  };
}

/** Abramowitz & Stegun 7.1.26 error-function approximation (|ε| < 1.5e-7). */
function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return sign * y;
}

export function normalCdf(z) {
  if (!Number.isFinite(z)) return null;
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

function clampPct(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, n));
}

/**
 * Effective person-days a person can put into *planned* work over the horizon,
 * after their own transition ramp. Ramp is read from an active 30-60-90 plan;
 * without one, a person is assumed settled — an assumption stated in the UI,
 * never hidden.
 */
function personSupply(person, state, { now, settings, horizonWeeks }) {
  // Focused hours per week ÷ an 8-hour working day = person-days per week.
  const daysPerWeek = nonNegative(settings.capacityHoursPerWeek, 32) / 8;
  const grossDays = round2(daysPerWeek * horizonWeeks);
  const plan = (state.onboarding || []).find(
    (p) => p.personId === person.id && p.status === 'active',
  );
  let ramp = { factor: 1, key: 'settled', label: 'Settled in role' };
  const reasons = [];
  if (plan) {
    const startedOn = plan.startDate || (plan.createdAt || '').slice(0, 10);
    const elapsed = startedOn ? daysBetween(startedOn, dayKey(now)) : null;
    if (plan.kind === 'new-hire' && elapsed !== null && elapsed < 30) {
      ramp = { factor: RAMP_CONVENTIONS['new-hire-early'].factor, key: 'new-hire-early', label: RAMP_CONVENTIONS['new-hire-early'].label };
    } else if (plan.kind === 'new-hire' && elapsed !== null && elapsed < 90) {
      ramp = { factor: RAMP_CONVENTIONS['new-hire-ramping'].factor, key: 'new-hire-ramping', label: RAMP_CONVENTIONS['new-hire-ramping'].label };
    } else if (plan.kind === 'role-transition') {
      ramp = { factor: RAMP_CONVENTIONS['role-transition'].factor, key: 'role-transition', label: RAMP_CONVENTIONS['role-transition'].label };
    } else if (plan.kind === 'reboarding') {
      ramp = { factor: RAMP_CONVENTIONS.reboarding.factor, key: 'reboarding', label: RAMP_CONVENTIONS.reboarding.label };
    }
    if (ramp.factor < 1) {
      reasons.push(`Active ${plan.kind === 'reboarding' ? 'return-to-work' : plan.kind} plan (${plan.label || 'unnamed'}) reduces focused availability in this horizon.`);
    }
  }
  const availableDays = round2(grossDays * ramp.factor);
  return {
    personId: person.id,
    name: person.name,
    role: person.role || '',
    grossDays,
    rampFactor: ramp.factor,
    rampKey: ramp.key,
    rampLabel: ramp.label,
    reasons,
    availableDays,
  };
}

/**
 * Build the capacity model: supply (who is actually available), demand
 * (committed vs merely wanted), utilisation, and the per-person bottleneck.
 */
export function buildCapacityModel(state, { now = new Date(), settings = null } = {}) {
  const s = settings || state.settings || {};
  const today = dayKey(now);
  const horizonWeeks = Math.min(26, Math.max(1, Math.round(num(s.planningHorizonWeeks, 4))));
  const operationalLoadPct = clampPct(s.operationalLoadPct, 20);
  const wipPerPerson = Math.max(1, Math.round(num(s.wipLimitPerPerson, 2)));

  const activePeople = (state.people || []).filter((p) => p.status !== 'archived');
  const supplyPeople = activePeople.map((p) => personSupply(p, state, { now, settings: s, horizonWeeks }));
  const grossDays = round2(supplyPeople.reduce((sum, p) => sum + p.grossDays, 0));
  const availableDays = round2(supplyPeople.reduce((sum, p) => sum + p.availableDays, 0));
  const operationalReserveDays = round2((availableDays * operationalLoadPct) / 100);
  const allocatableDays = round2(Math.max(0, availableDays - operationalReserveDays));

  const items = (state.portfolio || []).map((item) => {
    const effort = pertTriple(item.effortDays);
    const value = pertTriple(item.value);
    const consumesCapacity =
      item.status === 'open' && (item.kind === 'capacity-reserve' || item.decision === 'funded');
    return {
      item,
      id: item.id,
      title: item.title,
      kind: item.kind,
      status: item.status,
      decision: item.decision,
      ownerId: item.ownerId || null,
      sourceType: item.sourceType || 'manual',
      sourceId: item.sourceId || null,
      targetOn: item.targetOn || null,
      rationale: item.rationale || '',
      decisionOn: item.decisionOn || null,
      effort,
      value,
      currency: item.currency || 'USD',
      consumesCapacity,
      valueDensity: effort.expected > 0 && value.measured ? round2(value.expected / effort.expected) : null,
      implicit: false,
    };
  });

  // Defensive: an open case with a capacity estimate but no reserve entry (for
  // example a workspace created before Schema v16, or a case registered with
  // propagation switched off) still consumes real capacity. It is counted as
  // an implicit reserve and labelled as such, never hidden.
  const reservedCaseIds = new Set(
    items.filter((i) => i.kind === 'capacity-reserve' && i.sourceType === 'case').map((i) => i.sourceId),
  );
  for (const c of state.cases || []) {
    if (!['open', 'mitigating', 'monitoring'].includes(c.status)) continue;
    if (reservedCaseIds.has(c.id)) continue;
    const days = nonNegative(c.financial?.capacityDaysMostLikely, 0);
    const optimistic = nonNegative(c.financial?.capacityDaysOptimistic, 0);
    const pessimistic = nonNegative(c.financial?.capacityDaysPessimistic, 0);
    if (days <= 0 && optimistic <= 0 && pessimistic <= 0) continue;
    const effort = pertTriple({
      optimistic: optimistic || days,
      mostLikely: days || optimistic,
      pessimistic: pessimistic || days,
    });
    items.push({
      item: c,
      id: `implicit-case-${c.id}`,
      title: c.title,
      kind: 'capacity-reserve',
      status: 'open',
      decision: 'funded',
      ownerId: c.ownerId || null,
      sourceType: 'case',
      sourceId: c.id,
      targetOn: c.reviewOn || null,
      rationale: '',
      decisionOn: null,
      effort,
      value: pertTriple({}),
      currency: c.financial?.currency || 'USD',
      consumesCapacity: true,
      valueDensity: null,
      implicit: true,
    });
  }

  // 30-60-90 scaffolding is real manager/buddy time that never appears as a
  // portfolio item. It is modelled as a synthetic demand line.
  const scaffoldLines = [];
  for (const plan of state.onboarding || []) {
    if (plan.status !== 'active') continue;
    const person = activePeople.find((p) => p.id === plan.personId);
    if (!person) continue;
    const days = plan.kind === 'new-hire' ? NEW_HIRE_SCAFFOLD_DAYS : ONBOARDING_SCAFFOLD_DAYS;
    const effort = pertTriple({ optimistic: days, mostLikely: days, pessimistic: days * 1.5 });
    scaffoldLines.push({
      item: plan,
      id: `scaffold-${plan.id}`,
      title: `30-60-90 scaffolding — ${person.name}`,
      kind: 'capacity-reserve',
      status: 'open',
      decision: 'funded',
      ownerId: plan.personId,
      sourceType: 'onboarding',
      sourceId: plan.id,
      targetOn: null,
      rationale: 'Manager and buddy time for the active plan.',
      decisionOn: null,
      effort,
      value: pertTriple({}),
      currency: 'USD',
      consumesCapacity: true,
      valueDensity: null,
      implicit: true,
    });
  }

  const allItems = [...items, ...scaffoldLines];
  const committed = allItems.filter((i) => i.consumesCapacity);
  const capacityReserves = committed.filter((i) => i.kind === 'capacity-reserve');
  const fundedProjects = committed.filter((i) => i.kind !== 'capacity-reserve');
  const wanted = allItems.filter((i) => i.status === 'open' && i.decision === 'undecided' && i.kind !== 'capacity-reserve');
  const parked = allItems.filter((i) => ['deferred', 'cut'].includes(i.decision) && i.status === 'open');

  const reserveDays = round2(capacityReserves.reduce((sum, i) => sum + i.effort.expected, 0));
  const fundedDays = round2(fundedProjects.reduce((sum, i) => sum + i.effort.expected, 0));
  const wantedDays = round2(wanted.reduce((sum, i) => sum + i.effort.expected, 0));
  const parkedDays = round2(parked.reduce((sum, i) => sum + i.effort.expected, 0));
  const committedDays = round2(reserveDays + fundedDays);
  const unestimated = committed.filter((i) => !i.effort.measured);

  const utilisation = allocatableDays > 0 ? round(committedDays / allocatableDays, 3) : null;
  const band = utilisationBand(utilisation);
  const slackDays = round2(allocatableDays - committedDays);

  // Per-person load. Unowned items are shared evenly across the active team so
  // the bottleneck ranking cannot be gamed by leaving an owner blank.
  const unowned = committed.filter((i) => !i.ownerId);
  const unownedPerPerson = activePeople.length ? unowned.reduce((sum, i) => sum + i.effort.expected, 0) / activePeople.length : 0;
  const perPerson = supplyPeople.map((p) => {
    const own = committed.filter((i) => i.ownerId === p.personId);
    const ownDays = round2(own.reduce((sum, i) => sum + i.effort.expected, 0));
    const loadDays = round2(ownDays + unownedPerPerson);
    const share = availableDays > 0 ? p.availableDays / availableDays : 0;
    const allocatable = round2(allocatableDays * share);
    const personUtilisation = allocatable > 0 ? round(loadDays / allocatable, 3) : null;
    return {
      ...p,
      ownDays,
      sharedDays: round2(unownedPerPerson),
      loadDays,
      allocatable,
      utilisation: personUtilisation,
      items: own.map((i) => i.title),
    };
  });
  const bottleneck = perPerson
    .filter((p) => Number.isFinite(p.utilisation))
    .sort((a, b) => b.utilisation - a.utilisation)[0] || null;

  return {
    today,
    horizonWeeks,
    operationalLoadPct,
    wipPerPerson,
    supply: {
      people: perPerson,
      grossDays,
      availableDays,
      operationalReserveDays,
      allocatableDays,
      activeCount: activePeople.length,
      rampedCount: supplyPeople.filter((p) => p.rampFactor < 1).length,
    },
    demand: {
      items: allItems,
      committed,
      capacityReserves,
      fundedProjects,
      wanted,
      parked,
      reserveDays,
      fundedDays,
      wantedDays,
      parkedDays,
      committedDays,
      unestimatedCount: unestimated.length,
    },
    utilisation,
    band,
    slackDays,
    bottleneck,
    perPerson,
    hasTeam: activePeople.length > 0,
  };
}

/**
 * Little's Law and Kingman's approximation over the current record.
 *
 * Throughput is measured from *completed* records in the trailing window, so it
 * is evidence rather than ambition. When there is no completion history the
 * function returns nulls and says so — it never fabricates a throughput figure.
 */
export function flowMetrics(state, model, { now = new Date(), windowWeeks = 8 } = {}) {
  const today = dayKey(now);
  const windowStart = addDays(today, -windowWeeks * 7);

  // Throughput counts comparable units only: operating-plan items. Delegations
  // are separate commitments with their own ledger and averaging them into the
  // same rate would produce a number that describes neither.
  const donePortfolio = (state.portfolio || []).filter((i) => i.status === 'done' && i.completedOn);
  const completedInWindow = donePortfolio.filter((i) => i.completedOn >= windowStart);
  const throughputPerWeek = round(completedInWindow.length / windowWeeks, 2);
  const observedCycleDays = (() => {
    const durations = donePortfolio
      .map((i) => {
        const start = i.createdOn || (i.createdAt || '').slice(0, 10);
        return start && i.completedOn ? daysBetween(start, i.completedOn) : null;
      })
      .filter((d) => typeof d === 'number' && d >= 0)
      .sort((a, b) => a - b);
    if (!durations.length) return null;
    const mid = Math.floor(durations.length / 2);
    return durations.length % 2 ? durations[mid] : round((durations[mid - 1] + durations[mid]) / 2, 1);
  })();

  // WIP is counted in the same unit as throughput (operating-plan items) —
  // mixing delegations and cases into the same count would make Little's Law
  // answer a question nobody asked. Other open commitments are reported
  // separately as context.
  const wip = model.demand.fundedProjects.length;
  const otherOpenCommitments =
    (state.delegations || []).filter((d) => d.status === 'active').length +
    (state.cases || []).filter((c) => ['open', 'mitigating'].includes(c.status)).length;

  const wipLimit = Math.max(1, model.wipPerPerson * Math.max(1, model.supply.activeCount));
  // Little's Law needs at least two completed units before a rate means
  // anything; one completion is an anecdote, not a throughput.
  const littleCycleWeeks = completedInWindow.length >= 2 && throughputPerWeek > 0
    ? round(wip / throughputPerWeek, 2)
    : null;

  const rho = model.utilisation;
  const delayMultiplier = Number.isFinite(rho) && rho >= 0 && rho < 1
    ? round(1 + (rho / (1 - rho)) * KINGMAN_VARIABILITY, 2)
    : null;
  let waitWeeks = null;
  let inflatedCycleWeeks = null;
  if (Number.isFinite(rho) && rho > 0 && rho < 1 && littleCycleWeeks) {
    waitWeeks = round((rho / (1 - rho)) * KINGMAN_VARIABILITY * littleCycleWeeks, 2);
    inflatedCycleWeeks = round(littleCycleWeeks + waitWeeks, 2);
  } else if (Number.isFinite(rho) && rho >= 1) {
    inflatedCycleWeeks = null; // queue is unstable; a finite answer would be a lie
  }

  return {
    windowWeeks,
    windowStart,
    completedInWindow: completedInWindow.length,
    throughputPerWeek,
    observedCycleDays,
    wip,
    otherOpenCommitments,
    wipLimit,
    wipBreach: wip > wipLimit,
    littleCycleWeeks,
    littleCycleNote: littleCycleWeeks === null
      ? `Fewer than two plan items were delivered in the last ${windowWeeks} weeks, so no completion rate exists yet.`
      : null,
    utilisation: Number.isFinite(rho) ? rho : null,
    variabilityFactor: KINGMAN_VARIABILITY,
    delayMultiplier,
    waitWeeks,
    inflatedCycleWeeks,
    unstable: Number.isFinite(rho) ? rho >= 1 : false,
  };
}

/**
 * Rank open wanted items by value density and simulate the funding decision at
 * the capacity boundary. `funded`/`deferred` are *recommendations*: nothing is
 * written until the leader records a decision, which is the whole point.
 */
export function rankPortfolio(model) {
  const slack = model.slackDays;
  const candidates = model.demand.wanted
    .slice()
    .sort((a, b) => {
      const da = a.valueDensity ?? -1;
      const db = b.valueDensity ?? -1;
      if (db !== da) return db - da;
      return String(a.targetOn || '9999').localeCompare(String(b.targetOn || '9999'));
    });

  let remaining = Math.max(0, slack);
  const funded = [];
  const deferred = [];
  for (const item of candidates) {
    if (item.effort.measured && item.effort.expected <= remaining) {
      funded.push({ ...item, fundedDaysLeft: round2(remaining - item.effort.expected) });
      remaining = round2(remaining - item.effort.expected);
    } else {
      deferred.push(item);
    }
  }

  // When the plan is already over capacity, the cheapest way back is to remove
  // the lowest value density committed work first (marginal analysis), not the
  // newest or the least popular.
  const deficit = Math.max(0, -slack);
  let toFree = deficit;
  const releaseCandidates = [];
  if (deficit > 0) {
    const committedRanked = model.demand.committed
      .filter((i) => i.kind !== 'capacity-reserve' && i.valueDensity !== null)
      .slice()
      .sort((a, b) => (a.valueDensity ?? Infinity) - (b.valueDensity ?? Infinity));
    for (const item of committedRanked) {
      if (toFree <= 0) break;
      releaseCandidates.push(item);
      toFree = round2(toFree - item.effort.expected);
    }
  }

  return {
    candidates,
    funded,
    deferred,
    marginalCutoff: candidates.length ? candidates[candidates.length - 1].valueDensity ?? null : null,
    nextInLine: deferred[0] || null,
    deficitDays: deficit,
    releaseCandidates,
    releaseDays: round2(releaseCandidates.reduce((sum, i) => sum + i.effort.expected, 0)),
    unableToFreeEnough: deficit > 0 && toFree > 0,
    daysLeftAfterRecommendations: remaining,
  };
}

/**
 * Aggregate committed planned work into a delivery forecast.
 *
 * Independent PERT variances are additive, so the portfolio's standard
 * deviation is the root of summed variances (central limit theorem). The
 * result is a date range, not a promise: P50 has a coin-flip chance of being
 * beaten.
 */
export function deliveryForecast(model, { now = new Date() } = {}) {
  const today = dayKey(now);
  const scoped = model.demand.fundedProjects.filter((i) => i.effort.measured);
  const unscoped = model.demand.fundedProjects.filter((i) => !i.effort.measured);
  if (!scoped.length) {
    return {
      available: false,
      reason: unscoped.length
        ? 'Funded work has no effort estimate yet, so no date can be forecast.'
        : 'No funded planned work to forecast.',
      p50: null,
      p80: null,
      p90: null,
      expectedDays: 0,
      unestimatedCount: unscoped.length,
    };
  }
  const meanDays = scoped.reduce((sum, i) => sum + i.effort.expected, 0);
  const variance = scoped.reduce((sum, i) => sum + i.effort.variance, 0);
  const stdDev = Math.sqrt(variance);
  const dailyCapacity = model.horizonWeeks > 0 ? model.supply.allocatableDays / (model.horizonWeeks * 7) : 0;
  const dateFor = (days) => (dailyCapacity > 0 ? addDays(today, Math.ceil(days / dailyCapacity)) : null);

  // Cumulative target risk: work competes for the same capacity, so each
  // target is judged against *all* funded work due by that date, not against
  // that item alone. Independent per-item odds would have every item claim the
  // whole team's time and report 100% confidence right up to the day it slips.
  const targetRisks = [];
  let cumulative = 0;
  let cumulativeVariance = 0;
  for (const item of scoped.filter((i) => i.targetOn).sort((a, b) => String(a.targetOn).localeCompare(String(b.targetOn)))) {
    cumulative += item.effort.expected;
    cumulativeVariance += item.effort.variance;
    const sd = Math.sqrt(cumulativeVariance);
    const daysToTarget = Math.max(0, daysBetween(today, item.targetOn));
    const capacityByTarget = daysToTarget * dailyCapacity;
    targetRisks.push({
      id: item.id,
      title: item.title,
      targetOn: item.targetOn,
      daysToTarget,
      capacityByTarget: round2(capacityByTarget),
      cumulativeWorkByTarget: round2(cumulative),
      probability: sd > 0 ? round(normalCdf((capacityByTarget - cumulative) / sd) ?? 0, 3) : null,
      atRisk: capacityByTarget < cumulative,
    });
  }

  const earliestTarget = targetRisks.length ? targetRisks[0].targetOn : null;

  return {
    available: true,
    expectedDays: round2(meanDays),
    stdDev: round2(stdDev),
    scopeCount: scoped.length,
    unestimatedCount: unscoped.length,
    p50Days: round2(meanDays),
    p80Days: round2(meanDays + Z_80 * stdDev),
    p90Days: round2(meanDays + 1.2815515655446004 * stdDev),
    p50: dateFor(meanDays),
    p80: dateFor(meanDays + Z_80 * stdDev),
    p90: dateFor(meanDays + 1.2815515655446004 * stdDev),
    dailyCapacity: round2(dailyCapacity),
    earliestTarget,
    targetProbability: targetRisks.length ? targetRisks[0].probability : null,
    targetRisks,
    lateTargetCount: targetRisks.filter((t) => t.atRisk).length,
  };
}

/**
 * Weekly utilisation history, reconstructed from item lifespans. Roster and
 * ramp are current values, so the series is explicitly `approximate` — the same
 * honesty rule the health trends use.
 */
export function capacityHistory(state, { now = new Date(), weeks = 8 } = {}) {
  const today = dayKey(now);
  const points = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const asOf = addDays(today, -i * 7);
    const asOfDate = new Date(`${asOf}T23:59:59.000Z`);
    const model = buildCapacityModel(state, { now: asOfDate });
    const live = model.demand.committed.filter((item) => {
      const created = (item.item.createdOn || (item.item.createdAt || '').slice(0, 10) || asOf);
      if (created > asOf) return false;
      if (item.status === 'done' && item.item.completedOn && item.item.completedOn <= asOf) return false;
      if (item.status === 'released' && item.item.releasedOn && item.item.releasedOn <= asOf) return false;
      // A funding decision taken after this point had not happened yet.
      if (item.decision === 'funded' && item.decisionOn && item.decisionOn > asOf) return false;
      return true;
    });
    const committedDays = round2(live.reduce((sum, item) => sum + item.effort.expected, 0));
    const allocatable = model.supply.allocatableDays;
    points.push({
      weekEnding: asOf,
      committedDays,
      allocatableDays: allocatable,
      utilisation: allocatable > 0 ? round(committedDays / allocatable, 3) : null,
    });
  }
  return { points, fidelity: 'approximate', note: 'Roster, ramp and reserved capacity use current values; the series is a reconstruction, not a recorded snapshot.' };
}

/** Everything the Capacity view and the signal engine need, in one call. */
export function capacitySummary(state, now = new Date()) {
  const model = buildCapacityModel(state, { now });
  const flow = flowMetrics(state, model, { now });
  const ranking = rankPortfolio(model);
  const forecast = deliveryForecast(model, { now });
  return { model, flow, ranking, forecast, history: capacityHistory(state, { now, weeks: 8 }) };
}

/** Resolve a portfolio item's source record for display, without private data. */
export function portfolioSource(state, item) {
  if (!item || item.sourceType === 'manual' || !item.sourceId) return null;
  if (item.sourceType === 'case') {
    const rec = (state.cases || []).find((c) => c.id === item.sourceId);
    return rec ? { type: 'case', id: rec.id, title: rec.title, route: `#/cases/${rec.id}`, status: rec.status } : null;
  }
  if (item.sourceType === 'goal') {
    const rec = (state.goals || []).find((g) => g.id === item.sourceId);
    return rec ? { type: 'goal', id: rec.id, title: rec.title, route: '#/goals', status: rec.confidence } : null;
  }
  if (item.sourceType === 'delegation') {
    const rec = (state.delegations || []).find((d) => d.id === item.sourceId);
    return rec ? { type: 'delegation', id: rec.id, title: rec.title, route: '#/delegations', status: rec.status } : null;
  }
  if (item.sourceType === 'requisition') {
    const rec = (state.requisitions || []).find((r) => r.id === item.sourceId);
    return rec ? { type: 'requisition', id: rec.id, title: rec.title, route: `#/hiring/${rec.id}`, status: rec.status } : null;
  }
  if (item.sourceType === 'change') {
    const rec = (state.changes || []).find((ch) => ch.id === item.sourceId);
    return rec ? { type: 'change', id: rec.id, title: rec.title, route: `#/changes/${rec.id}`, status: rec.status } : null;
  }
  return null;
}
