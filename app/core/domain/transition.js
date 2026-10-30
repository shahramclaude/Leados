/**
 * app/core/domain/transition.js — the Workforce Transition Terminal (Schema v52).
 *
 * WHY THIS EXISTS
 * ---------------
 * Seventy-four sessions answered questions about work and about paying people.
 * The largest decision a leader ever makes about *people* had no surface: who
 * leaves, in what order, what it costs, what walks out of the building with
 * them, and what the people who stay will do about it.
 *
 * The market sells this as process: a selection list, a notice date calculator,
 * a severance formula, an approval workflow and a compliance report printed
 * after the fact. That framing answers "how do I execute the list I already
 * have?" It never answers the four questions that decide whether the list was
 * any good:
 *
 *   1. ROBUSTNESS — is this selection the answer, or is it the answer to my
 *      arbitrary weights? Every selection grid is a weighted sum of judgements.
 *      This module re-solves the same constrained problem under an ensemble of
 *      perturbed weightings and prints, per person, how often they were chosen.
 *      A name at 50% is a name decided by a coefficient, not by a fact, and no
 *      HR product in the reviewed set says so.
 *
 *   2. PRICE OF COMPLIANCE — the four-fifths screen is normally a warning. Here
 *      it is a constrained optimisation: if the proposed plan breaches the
 *      ratio, the module searches the cheapest set of swaps that satisfies it
 *      and prints what compliance costs in cash and capability. Or it reports,
 *      plainly, that no swap set reaches the floor.
 *
 *   3. WHAT LEAVES WITH THEM — capability is not a score in an HRIS. Here it is
 *      derived from the workspace's own dependency, succession, case, goal and
 *      delegation records: the sole steward of a critical service cannot be
 *      selected at all, and every other knowledge risk becomes an owned
 *      hand-over obligation with a date, created on the rule spine.
 *
 *   4. THE ALTERNATIVES, PRICED — involuntary selection against a voluntary
 *      offer is the classic adverse-selection problem (Akerlof, 1970): a
 *      voluntary programme attracts the people with the best outside options,
 *      which are not the people the criteria would have chosen. Three
 *      alternatives plus the do-nothing case are priced on the same four terms
 *      and compared with minimax regret.
 *
 * WHAT THIS MODULE REFUSES TO DO
 * ------------------------------
 *  - It stores no protected characteristic. The impact screen runs over a
 *    declared organisational dimension (team, level, tenure band) or over opaque
 *    group codes the leader supplies from their own HR/legal classification.
 *    The app never learns what a code means, and it says so on the page.
 *  - It does not claim legal correctness. Notice periods, severance formulas and
 *    consultation duties vary by jurisdiction, contract and works council. They
 *    are declared conventions, printed, and never inferred.
 *  - It does not predict any individual's departure as a fact. The survivor
 *    model is a three-term convention with a frozen prediction that a later
 *    dated review scores with a Brier skill score, withheld below five outcomes.
 *  - It never selects a person. It computes a constrained recommendation, shows
 *    its sensitivity, and requires a human to mark each row. `locked` rows are
 *    the leader's; the optimizer fills only what the leader has left open.
 *
 * Pure module: no storage, no clock, no unseeded randomness, no I/O. Every
 * figure the UI prints is derived here so a view can never invent one.
 */

import { addDays, dayKey, daysBetween } from '../time.js';
import { wilson } from './comp.js';

/* ------------------------------------------------------------- vocabulary */

export const TRANSITION_KINDS = ['reduction', 'redeployment', 'mixed'];
export const TRANSITION_KIND_LABELS = {
  reduction: 'Headcount reduction',
  redeployment: 'Redeployment first',
  mixed: 'Reduction with redeployment',
};

export const TRANSITION_STATUSES = ['draft', 'decided', 'finalized', 'abandoned'];
export const TRANSITION_STATUS_LABELS = {
  draft: 'Draft — nothing is decided',
  decided: 'Decided — the plan is named',
  finalized: 'Finalized — predictions frozen',
  abandoned: 'Abandoned',
};

/**
 * The dimensions the impact screen may run over.
 *
 * `declared-group` exists because the statutory screen is applied to a protected
 * classification the app must not hold. The leader can paste opaque codes
 * (`G1`, `G2`) produced by their own HR system; the arithmetic is identical and
 * the meaning never enters the workspace.
 */
export const TRANSITION_DIMENSIONS = ['declared-group', 'team', 'level', 'tenure-band'];
export const TRANSITION_DIMENSION_LABELS = {
  'declared-group': 'Opaque group codes you supply',
  team: 'Team',
  level: 'Job level',
  'tenure-band': 'Tenure band',
};

/** Which side of the criteria a person can be judged on. */
export const TRANSITION_CRITERIA = [
  {
    key: 'performance',
    label: 'Performance evidence',
    weight: 30,
    direction: 'lower is more exposed',
    framework: 'Last completed review rating; a missing review is a printed gap, never a zero',
  },
  {
    key: 'capability',
    label: 'Capability only they hold',
    weight: 25,
    direction: 'lower is more exposed',
    framework: 'Dependency stewardship, succession bench, open case/goal/delegation ownership',
  },
  {
    key: 'cost',
    label: 'Cost to exit',
    weight: 20,
    direction: 'cheaper is more exposed',
    framework: 'Declared notice and severance conventions against recorded pay',
  },
  {
    key: 'tenure',
    label: 'Tenure',
    weight: 10,
    direction: 'shorter is more exposed (LIFO)',
    framework: 'last-in-first-out is a convention, not a fairness claim',
  },
  {
    key: 'futureFit',
    label: 'Future role fit',
    weight: 15,
    direction: 'lower is more exposed',
    framework: 'Succession readiness plus an open growth plan',
  },
];

export const TRANSITION_DEFAULT_WEIGHTS = Object.freeze(
  Object.fromEntries(TRANSITION_CRITERIA.map((criterion) => [criterion.key, criterion.weight])),
);

/**
 * Every number the module uses that is a judgement rather than a measurement.
 * They are exported so the method card can print them and the tests can pin
 * them, which is the only thing that keeps a convention from becoming folklore.
 */
export const TRANSITION_CONVENTIONS = Object.freeze({
  noticeDays: 60,
  severanceMonthsPerYear: 1,
  severanceCapMonths: 6,
  impactRatio: 0.8,
  minGroupSize: 5,
  survivorLoadPct: 40,
  horizonDays: 365,
  /** Ensemble draws for the robustness read. Fixed, so a reading is reproducible. */
  ensembleDraws: 240,
  /** Below this share of draws a person is a stable retention; above it, a core exit. */
  stabilityCorePct: 80,
  stabilityKnifePct: 20,
  /** Capability value of a sole steward of a critical dependency. */
  soleStewardWeight: 6,
  criticallStewardWeight: 3,
  importantStewardWeight: 2,
  supportingStewardWeight: 1,
  /** Replacement-cost uplift when nobody is recorded as ready for the seat. */
  benchScarcityUplift: 0.25,
  /** Share of capability preserved by an internal move rather than an exit. */
  redeployCapabilityRetained: 0.65,
  /** Retraining cost of one internal move, in months of that person's pay. */
  redeployMonths: 2,
  /** Survivor regretted-attrition convention: base, workload term, mobility term. */
  survivorBasePct: 10,
  survivorLoadTermPct: 30,
  survivorMobilityTermPct: 20,
  /** Sample floor for the outcome calibration. */
  calibrationMin: 5,
});

const RATING_SCORE = {
  'needs-development': 0.1,
  'meets-expectations': 0.45,
  'often-exceeds': 0.8,
  'sets-standard': 1,
};

const HIGH_PERFORMER_RATINGS = new Set(['often-exceeds', 'sets-standard']);

export const TRANSITION_GATES = [
  { key: 'decision', label: 'Decision and criteria recorded', offsetDays: null, owner: 'You' },
  { key: 'consultation', label: 'Consultation opens with employee representatives', offsetDays: -90, owner: 'You and HR' },
  { key: 'criteria-locked', label: 'Selection criteria locked and disclosed to reviewers', offsetDays: -60, owner: 'You' },
  { key: 'notification', label: 'Individual notification conversations', offsetDays: -30, owner: 'You' },
  { key: 'handover', label: 'Knowledge hand-over complete and signed off', offsetDays: -14, owner: 'Each leaver and their successor' },
  { key: 'last-day', label: 'Last working day', offsetDays: 0, owner: 'HR operations' },
  { key: 'survivor-checkin', label: 'Survivor check-in conversations', offsetDays: 30, owner: 'You' },
  { key: 'outcome-review', label: 'Dated outcome review against the frozen prediction', offsetDays: 365, owner: 'You' },
];

export const TRANSITION_GATE_STATUSES = ['done', 'due', 'overdue', 'upcoming', 'blocked'];

/* ------------------------------------------------------------- small maths */

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, dp = 0) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** dp;
  return Math.round(value * factor) / factor;
}

function mean(values) {
  const list = values.filter((value) => Number.isFinite(value));
  if (!list.length) return null;
  return list.reduce((sum, value) => sum + value, 0) / list.length;
}

function median(values) {
  const list = values.filter((value) => Number.isFinite(value)).slice().sort((a, b) => a - b);
  if (!list.length) return null;
  const mid = Math.floor(list.length / 2);
  return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
}

/** Deterministic 32-bit PRNG. Same seed, same ensemble, on every machine. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(text) {
  let hash = 2166136261;
  const value = String(text || '');
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/* -------------------------------------------------------------- fact base */

/**
 * Recorded pay, from the newest merit cycle that has a real number for a person.
 *
 * A draft cycle is acceptable because its current-pay column is a record of pay
 * today, not a proposal; its proposal column is ignored entirely. A missing pay
 * figure stays null: an exit cost invented from nothing would be the most
 * expensive kind of fiction in this module.
 */
export function payById(state) {
  const out = new Map();
  const cycles = (state?.meritCycles || [])
    .filter((cycle) => cycle && cycle.status !== 'abandoned')
    .slice()
    .sort((a, b) => String(b.effectiveOn || '').localeCompare(String(a.effectiveOn || '')));
  for (const cycle of cycles) {
    for (const row of cycle.rows || []) {
      if (!row || !row.personId) continue;
      const pay = Number(row.currentPay);
      if (!Number.isFinite(pay) || pay <= 0) continue;
      if (!out.has(row.personId)) out.set(row.personId, { pay, cycleId: cycle.id, cycleLabel: cycle.label, on: cycle.effectiveOn || null });
    }
  }
  return out;
}

/** The last completed review per person. Draft reviews are not evidence. */
export function ratingById(state) {
  const out = new Map();
  const reviews = (state?.reviews || [])
    .filter((review) => review && review.status === 'complete' && review.personId)
    .slice()
    .sort((a, b) => String(b.completedAt || b.periodEnd || '').localeCompare(String(a.completedAt || a.periodEnd || '')));
  for (const review of reviews) {
    if (out.has(review.personId)) continue;
    const rating = review.manager?.rating;
    if (!RATING_SCORE[rating]) continue;
    out.set(review.personId, { rating, on: review.completedAt || review.periodEnd || null, reviewId: review.id });
  }
  return out;
}

/**
 * Stewardship of operational dependencies, with the sole-holder flag.
 *
 * The flag is the hard constraint in the whole module: a person who is the only
 * recorded steward of a critical service is not a selectable row, because the
 * organisation has already recorded that nothing and nobody else covers it.
 */
export function stewardshipById(state) {
  const out = new Map();
  const add = (personId, entry) => {
    const list = out.get(personId) || [];
    list.push(entry);
    out.set(personId, list);
  };
  for (const dependency of state?.dependencies || []) {
    if (!dependency || dependency.status === 'retired') continue;
    const stewards = (dependency.stewards || []).filter((row) => row && row.personId);
    const sole = stewards.length === 1;
    for (const steward of stewards) {
      add(steward.personId, {
        dependencyId: dependency.id,
        label: dependency.label || dependency.name || 'an unnamed dependency',
        criticality: dependency.criticality || 'important',
        role: steward.role || 'backup',
        soleHolder: sole && (dependency.criticality || 'important') === 'critical',
      });
    }
  }
  return out;
}

function tenureYearsOf(person, now) {
  const days = daysBetween(person?.startDate, dayKey(now));
  if (!Number.isFinite(days) || days < 0) return null;
  return round(days / 365, 2);
}

function tenureBand(years) {
  if (!Number.isFinite(years)) return 'unrecorded';
  if (years < 1) return '<1y';
  if (years < 3) return '1–3y';
  if (years < 5) return '3–5y';
  return '5y+';
}

/**
 * The exit cost of one person, from declared conventions.
 *
 * Two components, both printed: pay in lieu of notice, and severance at the
 * declared months-per-year-of-service inside the declared cap. No statutory
 * deduction, no tax, no holiday balance — inventing those would be pretending to
 * a legal opinion this module explicitly refuses to give.
 */
export function exitCostFor({ annualPay, tenureYears, noticeDays, monthsPerYear, capMonths }) {
  if (!Number.isFinite(annualPay) || annualPay <= 0) return { status: 'unpriced', total: null, noticePay: null, severancePay: null, severanceMonths: null };
  const monthly = annualPay / 12;
  const noticePay = monthly * (Math.max(0, noticeDays) / 30);
  const severanceMonths = Number.isFinite(tenureYears) && tenureYears > 0
    ? Math.min(capMonths, tenureYears * monthsPerYear)
    : 0;
  const severancePay = monthly * severanceMonths;
  return {
    status: 'priced',
    total: Math.round(noticePay + severancePay),
    noticePay: Math.round(noticePay),
    severancePay: Math.round(severancePay),
    severanceMonths: round(severanceMonths, 2),
  };
}

/* ------------------------------------------------------------ candidate set */

/**
 * Assemble the scored candidate pool.
 *
 * Every raw input is kept beside its normalised value so the page can print why
 * a person scored what they scored, and so a reader can disagree with the
 * normalisation instead of only with the conclusion.
 */
export function candidates(state, program, now = new Date()) {
  const settings = state?.settings || {};
  const paid = payById(state);
  const ratings = ratingById(state);
  const stewardship = stewardshipById(state);
  const benchSeats = new Map();
  for (const row of state?.readiness || []) {
    if (!row || !row.personId) continue;
    const list = benchSeats.get(row.personId) || [];
    list.push({ seat: row.seat, rating: row.rating });
    benchSeats.set(row.personId, list);
  }
  const openCases = new Map();
  for (const row of state?.cases || []) {
    if (!row || row.status === 'resolved' || row.status === 'closed' || !row.ownerId) continue;
    openCases.set(row.ownerId, (openCases.get(row.ownerId) || 0) + 1);
  }
  const openDelegations = new Map();
  for (const row of state?.delegations || []) {
    if (!row || row.status !== 'active' || !row.personId) continue;
    openDelegations.set(row.personId, (openDelegations.get(row.personId) || 0) + 1);
  }
  const openGoals = new Map();
  for (const row of state?.goals || []) {
    if (!row || row.status === 'done' || row.status === 'dropped' || !row.ownerId) continue;
    openGoals.set(row.ownerId, (openGoals.get(row.ownerId) || 0) + 1);
  }
  const growthPlans = new Map();
  for (const row of state?.growthPlans || []) {
    if (!row || !row.personId) continue;
    if (row.status === 'archived' || row.status === 'complete') continue;
    growthPlans.set(row.personId, row);
  }

  const people = new Map((state?.people || []).map((person) => [person.id, person]));
  const notices = Number.isFinite(Number(settings.transitionNoticeDays))
    ? Number(settings.transitionNoticeDays) : TRANSITION_CONVENTIONS.noticeDays;
  const monthsPerYear = Number.isFinite(Number(settings.transitionSeveranceMonthsPerYear))
    ? Number(settings.transitionSeveranceMonthsPerYear) : TRANSITION_CONVENTIONS.severanceMonthsPerYear;
  const capMonths = Number.isFinite(Number(settings.transitionSeveranceCapMonths))
    ? Number(settings.transitionSeveranceCapMonths) : TRANSITION_CONVENTIONS.severanceCapMonths;
  const replacementMultiplier = Number.isFinite(Number(settings.compReplacementMultiplier))
    ? Number(settings.compReplacementMultiplier) : 0.5;

  const rows = [];
  for (const row of program?.rows || []) {
    if (!row || !row.personId) continue;
    const person = people.get(row.personId);
    const pay = paid.get(row.personId) || null;
    const rating = ratings.get(row.personId) || null;
    const years = person ? tenureYearsOf(person, now) : null;
    const stewardshipRows = stewardship.get(row.personId) || [];
    const seats = benchSeats.get(row.personId) || [];
    const readyNow = seats.filter((seat) => seat.rating === 'ready-now').length;
    const readyLater = seats.filter((seat) => seat.rating === 'ready-later').length;
    const cases = openCases.get(row.personId) || 0;
    const delegations = openDelegations.get(row.personId) || 0;
    const goals = openGoals.get(row.personId) || 0;
    const growth = growthPlans.get(row.personId) || null;

    const stewardsValue = stewardshipRows.reduce((sum, entry) => {
      if (entry.soleHolder) return sum + TRANSITION_CONVENTIONS.soleStewardWeight;
      if (entry.criticality === 'critical') return sum + TRANSITION_CONVENTIONS.criticallStewardWeight;
      if (entry.criticality === 'important') return sum + TRANSITION_CONVENTIONS.importantStewardWeight;
      return sum + TRANSITION_CONVENTIONS.supportingStewardWeight;
    }, 0);
    const capabilityRaw = stewardsValue + readyNow * 1.5 + readyLater * 1 + Math.min(4, cases) + Math.min(3, delegations) * 0.5 + Math.min(3, goals) * 0.5;

    const exit = exitCostFor({
      annualPay: pay ? pay.pay : null,
      tenureYears: years,
      noticeDays: notices,
      monthsPerYear,
      capMonths,
    });
    const benchScarce = readyNow === 0;
    const replacementCost = pay
      ? Math.round(pay.pay * replacementMultiplier * (1 + (benchScarce ? TRANSITION_CONVENTIONS.benchScarcityUplift : 0)))
      : null;

    rows.push({
      personId: row.personId,
      person: person || null,
      name: person?.name || 'A person no longer in the roster',
      role: person?.role || '',
      team: person?.team || 'unassigned',
      level: person?.level || 'ic',
      status: person?.status || 'unknown',
      stillActive: Boolean(person) && person.status !== 'archived',
      declared: row.selected === true,
      locked: row.locked === true,
      group: String(row.group || '').trim().toUpperCase().slice(0, 8),
      mobility: Number.isFinite(Number(row.mobility)) ? clamp(Number(row.mobility), 0, 100) : null,
      workloadOverride: Number.isFinite(Number(row.workloadUnits)) ? clamp(Number(row.workloadUnits), 0, 1000) : null,
      note: String(row.note || ''),
      rating: rating ? rating.rating : null,
      ratingOn: rating ? rating.on : null,
      ratingScore: rating ? RATING_SCORE[rating.rating] : null,
      highPerformer: rating ? HIGH_PERFORMER_RATINGS.has(rating.rating) : false,
      tenureYears: years,
      tenureBand: tenureBand(years),
      pay: pay ? pay.pay : null,
      paySource: pay ? { cycleId: pay.cycleId, cycleLabel: pay.cycleLabel, on: pay.on } : null,
      exitCost: exit.total,
      exitStatus: exit.status,
      noticePay: exit.noticePay,
      severancePay: exit.severancePay,
      severanceMonths: exit.severanceMonths,
      replacementCost,
      benchScarce,
      readyNow,
      stewardships: stewardshipRows,
      soleHolder: stewardshipRows.some((entry) => entry.soleHolder),
      capabilityRaw,
      openCases: cases,
      openDelegations: delegations,
      openGoals: goals,
      growthPlan: growth ? { id: growth.id, title: growth.title || growth.focus || 'Growth plan' } : null,
    });
  }

  // Normalise every dimension across the pool. A pool of one normalises to 0 for
  // the spread terms, which is why the composite falls back to the raw share.
  const max = (pick) => {
    const values = rows.map(pick).filter((value) => Number.isFinite(value));
    return values.length ? Math.max(...values) : 0;
  };
  const maxCapability = max((row) => row.capabilityRaw);
  const maxCost = max((row) => row.exitCost);
  const maxTenure = max((row) => row.tenureYears);

  for (const row of rows) {
    const performanceExposure = row.ratingScore === null ? null : 1 - row.ratingScore;
    const capabilityExposure = maxCapability > 0 ? 1 - row.capabilityRaw / maxCapability : 0.5;
    const costExposure = Number.isFinite(row.exitCost) && maxCost > 0 ? 1 - row.exitCost / maxCost : null;
    const tenureExposure = Number.isFinite(row.tenureYears) && maxTenure > 0 ? 1 - row.tenureYears / maxTenure : null;
    const futureFitExposure = (() => {
      const bench = row.readyNow * 1 + row.readyLater * 0.5;
      const growth = row.growthPlan ? 0.5 : 0;
      const raw = bench + growth;
      return clamp(1 - raw / 1.5, 0, 1);
    })();
    row.exposure = {
      performance: performanceExposure,
      capability: capabilityExposure,
      cost: costExposure,
      tenure: tenureExposure,
      futureFit: futureFitExposure,
    };
    // Workload units are what a leaver's absence redistributes. Ownership of
    // open work is the only local evidence of load, so it is used directly and
    // printed, rather than estimated from a job title.
    row.workloadUnits = row.workloadOverride !== null
      ? row.workloadOverride
      : Math.round((row.openCases * 3 + row.openDelegations * 2 + row.openGoals * 2 + row.stewardships.length * 2) * 10) / 10;
  }

  return {
    rows,
    payAvailable: paid.size,
    missingPay: rows.filter((row) => row.exitStatus === 'unpriced').length,
    missingRating: rows.filter((row) => row.ratingScore === null).length,
    maxCapability,
  };
}

/* ------------------------------------------------------------- the optimizer */

/**
 * Weights are normalised to shares so a leader can think in any units.
 * A criterion with no data anywhere in the pool is dropped and reported: a
 * weight on a column nobody filled in is not a criterion, it is noise that makes
 * every other weight smaller.
 */
export function normalizeWeights(weights, available = {}) {
  const out = {};
  const dropped = [];
  let total = 0;
  for (const criterion of TRANSITION_CRITERIA) {
    const raw = Number(weights?.[criterion.key]);
    const weight = Number.isFinite(raw) && raw > 0 ? raw : 0;
    const usable = available[criterion.key] !== false;
    if (weight > 0 && !usable) {
      dropped.push(criterion.key);
      out[criterion.key] = 0;
      continue;
    }
    out[criterion.key] = weight;
    total += weight;
  }
  if (total <= 0) {
    for (const criterion of TRANSITION_CRITERIA) out[criterion.key] = 1 / TRANSITION_CRITERIA.length;
    return { weights: out, dropped, total: 1 };
  }
  for (const criterion of TRANSITION_CRITERIA) out[criterion.key] /= total;
  return { weights: out, dropped, total };
}

/** Which criteria have data anywhere in the pool. */
export function availableCriteria(rows) {
  const available = {};
  for (const criterion of TRANSITION_CRITERIA) {
    available[criterion.key] = rows.some((row) => Number.isFinite(row.exposure?.[criterion.key]));
  }
  return available;
}

/**
 * Composite exposure: how much this person looks like a candidate under *these*
 * weights. Missing components fall back to the pool average of that component
 * and the fallback is counted, because silently treating a missing review as
 * "average" and silently treating it as "worst" are both wrong by a lot.
 */
export function scoreRows(rows, weights) {
  const averages = {};
  for (const criterion of TRANSITION_CRITERIA) {
    averages[criterion.key] = mean(rows.map((row) => row.exposure?.[criterion.key])) ?? 0.5;
  }
  let imputed = 0;
  const scored = rows.map((row) => {
    let composite = 0;
    const parts = {};
    for (const criterion of TRANSITION_CRITERIA) {
      const raw = row.exposure?.[criterion.key];
      const used = Number.isFinite(raw) ? raw : averages[criterion.key];
      if (!Number.isFinite(raw)) imputed += 1;
      parts[criterion.key] = used;
      composite += (weights[criterion.key] || 0) * used;
    }
    return { ...row, score: composite, scoreParts: parts };
  });
  return { rows: scored, averages, imputed };
}

/**
 * Selection under constraints, by greedy construction plus swap repair.
 *
 * Honest about what it is: the headcount-plus-cost problem is a knapsack, and a
 * knapsack with a cardinality floor and hard exclusions has no closed form. The
 * constructor sorts by the declared objective, the repair loop removes the
 * cheapest-to-lose selected row for the highest-value unselected row whenever
 * the cost ceiling binds, and the module prints a fractional-relaxation bound so
 * the reader can see how far from the best conceivable plan it landed. It never
 * claims optimality.
 */
export function optimizeSelection(rows, {
  targetCount = 0,
  weights = TRANSITION_DEFAULT_WEIGHTS,
  costCeiling = null,
  objective = 'score',
  blocked = new Map(),
  lockedIn = new Set(),
  lockedOut = new Set(),
} = {}) {
  const { rows: scored, imputed, averages } = scoreRows(rows, normalizeWeights(weights, availableCriteria(rows)).weights);
  const eligible = [];
  const excluded = [];
  for (const row of scored) {
    if (lockedOut.has(row.personId)) { excluded.push({ row, reason: 'locked-out' }); continue; }
    if (blocked.has(row.personId)) { excluded.push({ row, reason: blocked.get(row.personId) }); continue; }
    eligible.push(row);
  }

  const key = objective === 'cost'
    ? (row) => (Number.isFinite(row.exitCost) ? row.exitCost : Number.MAX_SAFE_INTEGER)
    : objective === 'retain'
      ? (row) => -row.capabilityRaw
      : (row) => -row.score;
  const ascending = objective === 'cost';

  const forced = eligible.filter((row) => lockedIn.has(row.personId));
  const rest = eligible.filter((row) => !lockedIn.has(row.personId));
  const need = Math.max(0, targetCount - forced.length);
  const ordered = rest.slice().sort((a, b) => (ascending ? key(a) - key(b) : key(a) - key(b)));

  const chosen = [...forced, ...ordered.slice(0, need)];
  const spare = ordered.slice(need);

  const costOf = (row) => (Number.isFinite(row.exitCost) ? row.exitCost : 0);
  const totalCost = () => chosen.reduce((sum, row) => sum + costOf(row), 0);
  const totalScore = () => chosen.reduce((sum, row) => sum + row.score, 0);
  const totalCapability = () => chosen.reduce((sum, row) => sum + row.capabilityRaw, 0);

  let repairs = 0;
  if (Number.isFinite(costCeiling) && costCeiling >= 0) {
    // Swap repair: repeatedly find the cheapest true improvement in cost per unit
    // of the objective we are allowed to lose. Deterministic tie-break by id.
    let guard = 0;
    while (totalCost() > costCeiling && guard < 400) {
      guard += 1;
      let best = null;
      for (const selected of chosen) {
        if (forced.some((row) => row.personId === selected.personId)) continue;
        for (const candidate of spare) {
          if (chosen.some((row) => row.personId === candidate.personId)) continue;
          const costDelta = costOf(selected) - costOf(candidate);
          if (costDelta <= 0) continue;
          const objectiveDelta = objective === 'cost'
            ? 0
            : objective === 'retain'
              ? candidate.capabilityRaw - selected.capabilityRaw
              : candidate.score - selected.score;
          // Efficiency: cost saved per unit of objective lost. A swap that also
          // improves the objective is always taken first.
          const efficiency = objectiveDelta >= 0 ? Number.POSITIVE_INFINITY : costDelta / -objectiveDelta;
          if (!best || efficiency > best.efficiency
            || (efficiency === best.efficiency && costDelta > best.costDelta)) {
            best = { selected, candidate, costDelta, objectiveDelta, efficiency };
          }
        }
      }
      if (!best) break;
      const index = chosen.findIndex((row) => row.personId === best.selected.personId);
      const spareIndex = spare.findIndex((row) => row.personId === best.candidate.personId);
      chosen[index] = best.candidate;
      spare[spareIndex] = best.selected;
      repairs += 1;
    }
  }

  // Fractional-relaxation bound for the score objective: the best value a
  // planner who could split people down the middle could reach. It is a bound,
  // not an achievable plan, and the gap is reported as an upper bound on the
  // improvement still available.
  let bound = null;
  if (objective === 'score' && Number.isFinite(costCeiling) && costCeiling > 0) {
    const sorted = eligible.filter((row) => !lockedOut.has(row.personId))
      .slice()
      .sort((a, b) => (b.score / Math.max(1, costOf(b))) - (a.score / Math.max(1, costOf(a))));
    let budget = costCeiling;
    let value = 0;
    for (const row of sorted) {
      const cost = Math.max(1, costOf(row));
      if (cost <= budget) { value += row.score; budget -= cost; } else { value += row.score * (budget / cost); break; }
    }
    bound = value;
  }

  return {
    objective,
    targetCount,
    selected: chosen,
    unselected: spare,
    selectedIds: new Set(chosen.map((row) => row.personId)),
    cost: Math.round(totalCost()),
    score: totalScore(),
    capability: totalCapability(),
    repairs,
    excluded,
    imputed,
    averages,
    bound: bound === null ? null : round(bound, 4),
    /** Relative gap to the relaxation bound. `null` when no bound exists. */
    gapPct: bound && bound > 0 ? round(Math.max(0, (bound - totalScore()) / bound) * 100, 1) : null,
    costCeilingBreached: Number.isFinite(costCeiling) ? totalCost() > costCeiling + 0.5 : false,
    shortfall: Math.max(0, targetCount - chosen.length),
  };
}

/* ------------------------------------------------------- robust selection */

/**
 * Solve the same problem under an ensemble of perturbed weightings.
 *
 * Each draw multiplies every declared weight by an independent uniform factor in
 * [0.5, 1.5) and re-normalises. The result is not a probability that a person
 * should leave; it is the answer to "how much of my shortlist is a property of
 * my weight table rather than of the record?" A person selected in every draw is
 * robust to the weights. A person selected in half of them is a judgement the
 * model is hiding from you.
 */
export function robustnessEnsemble(rows, {
  targetCount = 0,
  weights = TRANSITION_DEFAULT_WEIGHTS,
  costCeiling = null,
  blocked = new Map(),
  lockedIn = new Set(),
  lockedOut = new Set(),
  draws = TRANSITION_CONVENTIONS.ensembleDraws,
  seed = 'transition',
} = {}) {
  const eligible = rows.filter((row) => !blocked.has(row.personId) && !lockedOut.has(row.personId));
  const count = Math.max(1, Math.round(draws));
  if (!eligible.length || targetCount <= 0) {
    return { draws: 0, status: 'insufficient', reason: 'There is nothing to perturb: no eligible candidate or no headcount target.', byPerson: new Map(), core: [], knifeEdge: [], stableRetained: [] };
  }
  const random = mulberry32(hashSeed(seed));
  const tally = new Map(eligible.map((row) => [row.personId, 0]));
  for (let draw = 0; draw < count; draw += 1) {
    const perturbed = {};
    for (const criterion of TRANSITION_CRITERIA) {
      const base = Number(weights?.[criterion.key]) || 0;
      // A zero weight stays zero: the leader has excluded the criterion, and
      // perturbing it would be measuring a model they did not ask for.
      perturbed[criterion.key] = base <= 0 ? 0 : base * (0.5 + random());
    }
    const plan = optimizeSelection(rows, {
      targetCount,
      weights: perturbed,
      costCeiling,
      objective: 'score',
      blocked,
      lockedIn,
      lockedOut,
    });
    for (const row of plan.selected) tally.set(row.personId, (tally.get(row.personId) || 0) + 1);
  }

  const byPerson = new Map();
  for (const [personId, hits] of tally) {
    const pct = round((hits / count) * 100, 0);
    const band = pct >= TRANSITION_CONVENTIONS.stabilityCorePct
      ? 'core'
      : pct >= TRANSITION_CONVENTIONS.stabilityKnifePct ? 'knife-edge' : 'stable-retained';
    byPerson.set(personId, { pct, band, hits, draws: count });
  }
  const rowsWith = eligible.map((row) => ({ row, ...byPerson.get(row.personId) }));
  return {
    draws: count,
    status: count >= 20 ? 'ok' : 'thin',
    reason: count >= 20 ? '' : `Only ${count} draws: the stability share is indicative, not settled.`,
    byPerson,
    core: rowsWith.filter((entry) => entry.band === 'core'),
    knifeEdge: rowsWith.filter((entry) => entry.band === 'knife-edge'),
    stableRetained: rowsWith.filter((entry) => entry.band === 'stable-retained'),
  };
}

/* -------------------------------------------------------- impact screening */

function groupValue(row, dimension) {
  if (dimension === 'team') return row.team || 'unassigned';
  if (dimension === 'level') return row.level || 'ic';
  if (dimension === 'tenure-band') return row.tenureBand || 'unrecorded';
  return row.group || 'unspecified';
}

/**
 * The four-fifths screen, applied to the *decision* (who is chosen) rather than
 * to headcount, with Wilson intervals and an explicit reliability floor.
 *
 * This is a screen, not a legal finding: the rule is a heuristic that regulators
 * have themselves criticised at small n (Watkins, McKenna & Chen, FAccT 2024),
 * and a ratio that clears 0.8 does not prove fairness any more than one that
 * fails it proves discrimination.
 */
export function impactScreen(rows, selectedIds, {
  dimension = 'team',
  threshold = TRANSITION_CONVENTIONS.impactRatio,
  minGroupSize = TRANSITION_CONVENTIONS.minGroupSize,
} = {}) {
  const pool = rows.filter((row) => row.stillActive);
  // On a declared dimension, a person with no group code is not a group. Folding
  // them into an `unspecified` bucket would let twelve undeclared people outvote
  // two declared groups and quietly make the screen uncomputable, which reads as
  // "insufficient" when the real finding is "the groups were never declared".
  const isDeclared = dimension === 'declared-group';
  const undeclared = isDeclared ? pool.filter((row) => !String(row.group || '').trim()) : [];
  const comparable = isDeclared ? pool.filter((row) => String(row.group || '').trim()) : pool;
  const coverage = { declared: comparable.length, total: pool.length, complete: undeclared.length === 0 };
  if (pool.length < 2) {
    return { status: 'insufficient', detail: 'A selection screen needs at least two people in the pool.', groups: [], ratio: null, threshold, flagged: false, reliable: false, excluded: [], dimension, target: 'proposed', coverage };
  }
  const buckets = new Map();
  for (const row of comparable) {
    const key = groupValue(row, dimension);
    const bucket = buckets.get(key) || { label: key, n: 0, selected: 0 };
    bucket.n += 1;
    if (selectedIds.has(row.personId)) bucket.selected += 1;
    buckets.set(key, bucket);
  }
  const groups = [];
  const excluded = [];
  for (const bucket of buckets.values()) {
    const rate = bucket.n ? bucket.selected / bucket.n : 0;
    const interval = wilson(bucket.selected, bucket.n);
    const entry = {
      label: bucket.label,
      n: bucket.n,
      selected: bucket.selected,
      rate: round(rate, 3),
      ratePct: round(rate * 100, 1),
      low: round(interval.low, 3),
      high: round(interval.high, 3),
      lowPct: round(interval.low * 100, 1),
      highPct: round(interval.high * 100, 1),
      included: bucket.n >= minGroupSize,
      reason: bucket.n >= minGroupSize ? null : 'below-floor',
    };
    if (entry.included) groups.push(entry);
    else excluded.push(entry);
  }
  if (undeclared.length) {
    excluded.push({
      label: 'unspecified',
      n: undeclared.length,
      selected: undeclared.filter((row) => selectedIds.has(row.personId)).length,
      rate: null,
      ratePct: null,
      low: null,
      high: null,
      lowPct: null,
      highPct: null,
      included: false,
      reason: 'no-group',
    });
  }
  if (groups.length < 2) {
    const why = isDeclared
      ? `${comparable.length} of ${pool.length} candidate(s) carry a group code and form ${groups.length} group(s) of ${minGroupSize} or more`
      : `${groups.length} group(s) of ${minGroupSize} or more were found among ${pool.length} candidate(s)`;
    return {
      status: 'insufficient',
      detail: `At least two groups of ${minGroupSize} or more are needed for a rate comparison. ${why}; the rest are printed but excluded.`,
      groups: [],
      excluded,
      ratio: null,
      threshold,
      flagged: false,
      reliable: false,
      dimension,
      target: 'proposed',
      coverage,
    };
  }
  const rates = groups.map((group) => group.rate);
  const high = Math.max(...rates);
  const lowRate = Math.min(...rates);
  const ratio = high > 0 ? lowRate / high : null;
  const reliable = groups.length >= 2 && groups.every((group) => group.n >= minGroupSize);
  const flagged = ratio !== null && ratio < threshold;
  const worst = groups.slice().sort((a, b) => a.rate - b.rate)[0];
  const best = groups.slice().sort((a, b) => b.rate - a.rate)[0];

  /**
   * How many selections would have to move — at constant headcount — before the
   * direction of the disparity reverses.
   *
   * This is the point the 2024 Georgetown Law Technology Review critique makes
   * and the EEOC's own Q&A concedes: a four-fifths ratio is an effect size with
   * no notion of significance, so in a small pool one person can decide which
   * group looks worse. Printing that count is cheaper and more honest than a
   * p-value nobody can act on, and it is impossible to read as a legal verdict.
   */
  const fragility = (() => {
    if (!worst || !best || worst.label === best.label || worst.rate >= best.rate) return null;
    const transferable = Math.min(best.selected, 20);
    for (let moved = 1; moved <= transferable; moved += 1) {
      const highRate = (best.selected - moved) / best.n;
      const lowRateAfter = (worst.selected + moved) / worst.n;
      if (lowRateAfter >= highRate) {
        return {
          flipsAt: moved,
          lowLabel: worst.label,
          highLabel: best.label,
          statement: `Moving ${moved} selection(s) from ${best.label} to ${worst.label} — the same headcount, a different list — reverses which group is selected more often. Read the intervals before treating this ratio as a finding.`,
        };
      }
    }
    return {
      flipsAt: null,
      lowLabel: worst.label,
      highLabel: best.label,
      statement: `Even ${transferable} transfer(s) between ${best.label} and ${worst.label} do not reverse the ordering, so the direction of this disparity is not a one-person artefact.`,
    };
  })();
  return {
    status: 'ok',
    dimension,
    target: 'proposed',
    groups,
    excluded,
    ratio: round(ratio, 3),
    threshold,
    flagged,
    reliable,
    coverage,
    fragility,
    detail: flagged
      ? `The lowest-selecting group (${worst.label}) is selected at ${worst.ratePct}% against ${best.ratePct}% in ${best.label}: a ratio of ${round(ratio, 2)} against the ${threshold} floor. That is a question about the criteria, not a verdict on the people.`
      : `The lowest-selecting group (${worst.label}) is selected at ${worst.ratePct}% against ${best.ratePct}% in ${best.label}: a ratio of ${round(ratio, 2)}, at or above the ${threshold} floor. The screen clears; it does not prove fairness.`,
    intervalNote: [
      reliable
        ? 'Every included group meets the size floor, so the ratio is reported as computed.'
        : 'At least one included group is small enough that its interval is wide; the ratio is reported but flagged low-confidence.',
      undeclared.length
        ? `${undeclared.length} candidate(s) carry no group code and are outside the comparison entirely; the ratio describes only the declared groups.`
        : '',
    ].filter(Boolean).join(' '),
  };
}

/**
 * The cheapest set of swaps that brings the proposed plan to the floor.
 *
 * This is the module's answer to a warning. A screen that says "adverse impact
 * detected" leaves a leader with two bad options: defend the list or rebuild it
 * blind. Instead: search pairwise swaps between an over-selecting and an
 * under-selecting group, take the swap that fixes the ratio for the least lost
 * score, repeat, and print the bill — headcount unchanged, cost delta, and the
 * capability that would stay instead.
 */
export function complianceRepair(rows, selectedIds, {
  dimension = 'team',
  threshold = TRANSITION_CONVENTIONS.impactRatio,
  minGroupSize = TRANSITION_CONVENTIONS.minGroupSize,
  maxSwaps = 40,
} = {}) {
  const screen = impactScreen(rows, selectedIds, { dimension, threshold, minGroupSize });
  if (screen.status !== 'ok') {
    return { status: screen.status, detail: screen.detail, swaps: [], costDelta: 0, scoreLoss: 0, feasible: null, screen };
  }
  if (!screen.flagged) {
    return {
      status: 'ok',
      feasible: true,
      alreadyCompliant: true,
      detail: 'The proposed plan already clears the floor; no swap is needed and none is invented.',
      swaps: [],
      costDelta: 0,
      scoreLoss: 0,
      screen,
      after: screen,
    };
  }
  const current = new Set(selectedIds);
  // A swap can only move a person between two declared groups; pulling an
  // undeclared person into one would change the dimension as a side effect.
  const pool = rows.filter((row) => row.stillActive && (dimension !== 'declared-group' || String(row.group || '').trim()));
  const costs = (row) => (Number.isFinite(row.exitCost) ? row.exitCost : 0);
  const swaps = [];
  let costDelta = 0;
  let scoreLoss = 0;
  let guard = 0;
  let bestScreen = screen;

  while (bestScreen.flagged && guard < maxSwaps) {
    guard += 1;
    const worst = bestScreen.groups.slice().sort((a, b) => a.rate - b.rate)[0];
    const best = bestScreen.groups.slice().sort((a, b) => b.rate - a.rate)[0];
    if (!worst || !best || worst.label === best.label) break;
    const ins = pool.filter((row) => groupValue(row, dimension) === worst.label && !current.has(row.personId));
    const outs = pool.filter((row) => groupValue(row, dimension) === best.label && current.has(row.personId));
    if (!ins.length || !outs.length) break;

    let choice = null;
    for (const add of ins) {
      for (const drop of outs) {
        const trial = new Set(current);
        trial.delete(drop.personId);
        trial.add(add.personId);
        const trialScreen = impactScreen(rows, trial, { dimension, threshold, minGroupSize });
        if (trialScreen.status !== 'ok') continue;
        const gained = (trialScreen.ratio ?? 0) - (bestScreen.ratio ?? 0);
        const lost = drop.score - add.score;
        if (!choice || gained > choice.gained || (gained === choice.gained && lost < choice.lost)) {
          choice = { add, drop, gained, lost, screen: trialScreen, cost: costs(add) - costs(drop) };
        }
      }
    }
    if (!choice) break;
    current.delete(choice.drop.personId);
    current.add(choice.add.personId);
    swaps.push({
      outId: choice.drop.personId,
      outName: choice.drop.name,
      outGroup: groupValue(choice.drop, dimension),
      inId: choice.add.personId,
      inName: choice.add.name,
      inGroup: groupValue(choice.add, dimension),
      ratioBefore: bestScreen.ratio,
      ratioAfter: choice.screen.ratio,
      scoreLost: round(choice.lost, 4),
      costDelta: Math.round(choice.cost),
      capabilityGained: round(choice.add.capabilityRaw - choice.drop.capabilityRaw, 2),
    });
    costDelta += Math.round(choice.cost);
    scoreLoss += choice.lost;
    bestScreen = choice.screen;
  }

  const feasible = !bestScreen.flagged;
  return {
    status: 'ok',
    feasible,
    alreadyCompliant: false,
    swaps,
    costDelta,
    scoreLoss: round(scoreLoss, 4),
    repairedIds: current,
    screen: bestScreen,
    after: bestScreen,
    addedHeadcount: 0,
    detail: feasible
      ? `Complying costs ${swaps.length} swap(s): ${Math.round(costDelta)} in additional exit cost and ${round(scoreLoss, 3)} of composite exposure lost. Headcount is unchanged, so the work is a different list — not a smaller one.`
      : `No swap set reaches the ${threshold} floor within ${maxSwaps} swaps at this headcount and group size. The honest statement is that this plan cannot be made compliant by swapping people inside it; the criteria or the target have to change.`,
  };
}

/* ---------------------------------------------------------- what leaves */

/**
 * Continuity exposure for the proposed leavers.
 *
 * `blockers` are people the module will not select: a sole recorded steward of a
 * critical dependency. Everything else is a priced obligation — who must hand
 * over what, by when — because knowledge that leaves undocumented is the part of
 * a reduction that cannot be bought back.
 */
export function continuityExposure(state, candidatesResult, selectedIds, now = new Date()) {
  const program = state?.transitionPrograms || [];
  const obligations = new Map();
  for (const dependency of state?.dependencies || []) {
    if (!dependency || dependency.status === 'retired') continue;
    for (const steward of dependency.stewards || []) {
      if (!steward || !steward.personId) continue;
      const list = obligations.get(steward.personId) || [];
      list.push(dependency);
      obligations.set(steward.personId, list);
    }
  }
  const rows = [];
  const blockers = [];
  for (const row of candidatesResult.rows) {
    if (!row.stillActive) continue;
    const isSelected = selectedIds.has(row.personId);
    const dep = obligations.get(row.personId) || [];
    const sole = dep.filter((dependency) => {
      const stewards = (dependency.stewards || []).filter((entry) => entry && entry.personId);
      return stewards.length === 1 && dependency.criticality === 'critical';
    });
    if (isSelected && sole.length) {
      blockers.push({
        personId: row.personId,
        name: row.name,
        reason: `sole steward of ${sole.map((dependency) => dependency.label || dependency.name || 'an unnamed dependency').join(', ')}`,
        dependencyIds: sole.map((dependency) => dependency.id),
      });
    }
    if (!isSelected) continue;
    const atRisk = row.stewardships.filter((entry) => entry.soleHolder || entry.criticality === 'critical');
    const score = clamp(
      (sole.length ? 60 : 0)
      + (row.soleHolder ? 20 : 0)
      + Math.min(20, row.capabilityRaw * 3)
      + (row.openCases ? Math.min(15, row.openCases * 5) : 0)
      + (row.openDelegations ? Math.min(10, row.openDelegations * 3) : 0),
      0, 100,
    );
    rows.push({
      personId: row.personId,
      name: row.name,
      riskScore: Math.round(score),
      soleStewardOf: sole.map((dependency) => ({ id: dependency.id, label: dependency.label || dependency.name || 'Unnamed dependency' })),
      criticalDependencies: atRisk.map((entry) => ({ id: entry.dependencyId, label: entry.label, criticality: entry.criticality })),
      openCases: row.openCases,
      openDelegations: row.openDelegations,
      openGoals: row.openGoals,
      benchScarce: row.benchScarce,
      readyNow: row.readyNow,
      requiresHandover: score >= 25 || row.soleHolder || row.openCases > 0,
    });
  }
  rows.sort((a, b) => b.riskScore - a.riskScore);
  const programBlockerCount = (state?.transitionPrograms || []).length;
  return {
    rows,
    blockers,
    atRisk: rows.filter((row) => row.requiresHandover),
    totalRisk: rows.reduce((sum, row) => sum + row.riskScore, 0),
    programs: programBlockerCount,
    note: blockers.length
      ? 'A sole steward of a critical dependency is not selectable: the workspace has already recorded that nobody else covers it. Reassign the dependency first, or keep the person.'
      : 'No proposed leaver is the sole steward of a critical dependency. Knowledge risk below is still an obligation, not a warning.',
  };
}

/* ------------------------------------------------------------ who stays */

/**
 * Survivor load and a three-term departure convention.
 *
 * The redistribution rule is deliberately mechanical and printed: a leaver's
 * recorded ownership units are shared equally between the up-to-three
 * lowest-loaded active people on the same team; if the team empties, across the
 * whole remaining roster. It is a planning convention, not a model of how work
 * actually lands — and the frozen prediction exists so a later review can say
 * how wrong it was.
 */
export function survivorImpact(candidatesResult, selectedIds, settings = {}, now = new Date()) {
  const threshold = Number.isFinite(Number(settings.transitionSurvivorLoadPct))
    ? Number(settings.transitionSurvivorLoadPct) : TRANSITION_CONVENTIONS.survivorLoadPct;
  const active = candidatesResult.rows.filter((row) => row.stillActive);
  const leavers = active.filter((row) => selectedIds.has(row.personId));
  const stayers = active.filter((row) => !selectedIds.has(row.personId)).map((row) => ({
    ...row,
    loadBefore: row.workloadUnits,
    loadAfter: row.workloadUnits,
    received: 0,
  }));
  const byTeam = new Map();
  for (const row of stayers) {
    const list = byTeam.get(row.team) || [];
    list.push(row);
    byTeam.set(row.team, list);
  }
  let unplaced = 0;
  for (const leaver of leavers) {
    const teamMates = (byTeam.get(leaver.team) || []).filter((row) => row.stillActive);
    const receivers = (teamMates.length ? teamMates : stayers)
      .slice()
      .sort((a, b) => a.loadAfter - b.loadAfter || a.personId.localeCompare(b.personId))
      .slice(0, 3);
    if (!receivers.length) { unplaced += leaver.workloadUnits; continue; }
    const share = leaver.workloadUnits / receivers.length;
    for (const receiver of receivers) {
      receiver.received += share;
      receiver.loadAfter += share;
    }
  }
  const before = stayers.map((row) => row.loadBefore);
  const after = stayers.map((row) => row.loadAfter);
  const flagged = [];
  for (const row of stayers) {
    const increasePct = row.loadBefore > 0 ? ((row.loadAfter - row.loadBefore) / row.loadBefore) * 100 : (row.loadAfter > 0 ? 100 : 0);
    row.increasePct = round(increasePct, 1);
    row.overloaded = increasePct >= threshold;
    const mobility = Number.isFinite(row.mobility) ? row.mobility / 100 : 0.5;
    const departurePct = clamp(
      TRANSITION_CONVENTIONS.survivorBasePct
      + TRANSITION_CONVENTIONS.survivorLoadTermPct * Math.min(1, Math.max(0, increasePct) / 100)
      + TRANSITION_CONVENTIONS.survivorMobilityTermPct * mobility,
      0, 95,
    );
    row.departurePct = round(departurePct, 1);
    row.highValue = row.highPerformer || row.capabilityRaw >= (candidatesResult.maxCapability * 0.5);
    if (row.overloaded) flagged.push(row);
  }
  const expectedDepartures = stayers.filter((row) => row.highValue)
    .reduce((sum, row) => sum + row.departurePct / 100, 0);
  return {
    stayers,
    leavers,
    flagged: flagged.sort((a, b) => b.increasePct - a.increasePct),
    threshold,
    unplaced: round(unplaced, 1),
    beforeMedian: round(median(before), 1),
    afterMedian: round(median(after), 1),
    beforeMean: round(mean(before), 1),
    afterMean: round(mean(after), 1),
    // Only retained people with a high-value marker are scored; scoring everyone
    // would turn a planning convention into a per-person attrition prediction.
    predictions: stayers.filter((row) => row.highValue).map((row) => ({
      personId: row.personId,
      departurePct: row.departurePct,
      increasePct: row.increasePct,
    })),
    expectedDepartures: round(expectedDepartures, 2),
    note: 'Redistribution is equal across the three lowest-loaded people on the same team. It is a planning convention with a frozen prediction, not a forecast about any individual.',
  };
}

/* --------------------------------------------------------- the alternatives */

/**
 * Four ways to reach the same target, priced on the same terms.
 *
 * Voluntary severance is modelled as *adverse selection*, which is the whole
 * reason it is on this page: a volunteer compares their offer to their outside
 * option, so take-up is highest exactly among the people with the best outside
 * options — the mobile, the marketable, often the strongest. The model says so
 * and then prints what that would cost in capability.
 */
export function alternatives(candidatesResult, selectedIds, settings = {}, now = new Date()) {
  const active = candidatesResult.rows.filter((row) => row.stillActive);
  const proposed = active.filter((row) => selectedIds.has(row.personId));
  const plannedCost = proposed.reduce((sum, row) => sum + (row.exitCost ?? 0), 0);
  const totalCapability = active.reduce((sum, row) => sum + row.capabilityRaw, 0) || 1;
  const capabilityLost = proposed.reduce((sum, row) => sum + row.capabilityRaw, 0);
  const highPerformers = active.filter((row) => row.highPerformer);
  const highLost = proposed.filter((row) => row.highPerformer).length;
  const target = proposed.length;

  const voluntary = (() => {
    const candidateRows = active.map((row) => {
      const mobility = Number.isFinite(row.mobility) ? row.mobility / 100 : 0.5;
      // Generosity is relative to the declared involuntary exit cost: a richer
      // offer attracts more takers, and the printed weight makes the convention
      // inspectable.
      const generosity = 1.15;
      return { row, takeUp: mobility * generosity };
    });
    const expected = candidateRows.slice()
      .sort((a, b) => b.takeUp - a.takeUp || a.row.personId.localeCompare(b.row.personId))
      .slice(0, target);
    const cost = expected.reduce((sum, entry) => sum + (entry.row.exitCost ?? 0) * 1.15, 0);
    const lostCapability = expected.reduce((sum, entry) => sum + entry.row.capabilityRaw, 0);
    const lostHigh = expected.filter((entry) => entry.row.highPerformer).length;
    return {
      id: 'voluntary',
      label: 'Voluntary severance offer',
      headcount: expected.length,
      cost: Math.round(cost),
      capabilityLost: round(lostCapability, 2),
      capabilityLostPct: round((lostCapability / totalCapability) * 100, 1),
      highPerformersLost: lostHigh,
      leavers: expected.map((entry) => entry.row.personId),
      caveat: 'A volunteer compares the offer with their own outside option, so take-up concentrates among the most mobile — who are, by construction of this model, not the people the criteria would have chosen.',
      framework: 'Akerlof (1970) adverse selection · Rothschild–Stiglitz (1976) screening',
    };
  })();

  const redeployment = (() => {
    const receiving = (settings._requisitions || 0);
    const movers = Math.min(target, receiving);
    const sorted = proposed.slice().sort((a, b) => (a.exitCost ?? 0) - (b.exitCost ?? 0));
    const moved = sorted.slice(0, movers);
    const leavers = sorted.slice(movers);
    const retrain = moved.reduce((sum, row) => sum + (row.pay ? (row.pay / 12) * TRANSITION_CONVENTIONS.redeployMonths : 0), 0);
    const exitCost = leavers.reduce((sum, row) => sum + (row.exitCost ?? 0), 0);
    const lostCapability = leavers.reduce((sum, row) => sum + row.capabilityRaw, 0)
      + moved.reduce((sum, row) => sum + row.capabilityRaw * (1 - TRANSITION_CONVENTIONS.redeployCapabilityRetained), 0);
    const lostHigh = leavers.filter((row) => row.highPerformer).length;
    return {
      id: 'redeploy',
      label: 'Redeploy inside the organisation',
      headcount: leavers.length,
      rolesRemoved: target,
      cost: Math.round(retrain + exitCost),
      capabilityLost: round(lostCapability, 2),
      capabilityLostPct: round((lostCapability / totalCapability) * 100, 1),
      highPerformersLost: lostHigh,
      movers: moved.map((row) => row.personId),
      leavers: leavers.map((row) => row.personId),
      caveat: receiving
        ? `${receiving} open requisition(s) can absorb a move. A redeployment meets the role target without meeting the headcount target, and part of the person's capability is lost in the new role.`
        : 'No open requisition is recorded, so no move is priced. A redeployment plan with nowhere to redeploy is a slower reduction with a better story.',
      framework: 'Internal labour market · Becker (1964) firm-specific human capital',
    };
  })();

  const attritionOnly = {
    id: 'attrition',
    label: 'Hiring freeze and natural attrition',
    headcount: 0,
    rolesRemoved: 0,
    cost: 0,
    capabilityLost: 0,
    capabilityLostPct: 0,
    highPerformersLost: 0,
    leavers: [],
    caveat: 'Meets nothing today. It is the true do-nothing case, and the honest comparison for a reduction target whose deadline actually matters.',
    framework: 'Real options · option value of waiting',
  };

  const involuntary = {
    id: 'involuntary',
    label: 'Selection by the declared criteria',
    headcount: proposed.length,
    rolesRemoved: proposed.length,
    cost: Math.round(plannedCost),
    capabilityLost: round(capabilityLost, 2),
    capabilityLostPct: round((capabilityLost / totalCapability) * 100, 1),
    highPerformersLost: highLost,
    leavers: proposed.map((row) => row.personId),
    caveat: 'This is the plan on the table. Its cost assumes every row has recorded pay; unpriced rows are excluded from the total and counted on the page.',
    framework: 'Bounded rationality · procedural justice (Leventhal, 1980)',
  };

  const options = [involuntary, voluntary, redeployment, attritionOnly];
  // Redeployment is only a distinct path when there is somewhere to redeploy to.
  // With no open requisition it degenerates into the involuntary plan with a
  // kinder story, and would tie on both cost and capability — a duplicate row
  // that dilutes the comparison rather than informing it.
  redeployment.available = Number(settings._requisitions || 0) > 0;
  for (const option of options) {
    if (option.available === undefined) option.available = true;
    // An option that does not remove the roles the programme exists to remove is
    // not an alternative; it answers a different question. Excluding it from the
    // comparison is not a preference, it is arithmetic — and it is printed.
    option.meetsTarget = target > 0 ? (option.available && option.headcount >= target) : null;
    option.shortfallPct = target > 0 ? round(((target - Math.min(target, option.headcount)) / target) * 100, 1) : 0;
  }

  /**
   * The comparison rule.
   *
   * Pareto dominance over the options that actually meet the target. Cash and
   * capability are never converted into each other here, so the honest output is
   * either a single dominating option or the frontier plus the gap between its
   * ends. An earlier minimax-regret version recommended attrition at zero cost
   * while removing nobody, which is the failure mode this rule replaces.
   */
  const eligible = target > 0 ? options.filter((option) => option.meetsTarget) : options.slice();
  const frontier = eligible.filter((option) => !eligible.some((other) => other !== option
    && other.cost <= option.cost
    && other.capabilityLost <= option.capabilityLost
    && (other.cost < option.cost || other.capabilityLost < option.capabilityLost)));
  let recommended = null;
  let tradeoff = '';
  if (frontier.length === 1) {
    recommended = frontier[0].id;
    tradeoff = `${frontier[0].label} dominates every option that meets the target on both cash and capability.`;
  } else if (frontier.length > 1) {
    const cheapest = frontier.slice().sort((a, b) => a.cost - b.cost)[0];
    const gentlest = frontier.slice().sort((a, b) => a.capabilityLost - b.capabilityLost)[0];
    if (cheapest.id === gentlest.id) {
      recommended = cheapest.id;
      tradeoff = `${cheapest.label} is both the cheapest and the gentlest option that meets the target.`;
    } else {
      const cashGap = Math.abs(cheapest.cost - gentlest.cost);
      const capabilityGap = round(Math.abs(cheapest.capabilityLost - gentlest.capabilityLost), 2);
      tradeoff = `${cheapest.label} is ${cashGap === 0 ? 'no cheaper' : `${cashGap} cheaper`} than ${gentlest.label}, and loses `
        + `${capabilityGap} ${capabilityGap === 1 ? 'unit' : 'units'} more recorded capability. `
        + 'Neither dominates the other, so this module does not choose for you: the choice is which of those two numbers you would rather explain to the people who stay, and to whoever reviews the cost.';
    }
  } else {
    tradeoff = 'No option meets the headcount target. The target is the thing that has to change, and no comparison here can hide that.';
  }

  const costs = options.map((option) => option.cost);
  const capabilities = options.map((option) => option.capabilityLost);
  const costRange = Math.max(...costs) - Math.min(...costs) || 1;
  const capRange = Math.max(...capabilities) - Math.min(...capabilities) || 1;
  for (const option of options) {
    // Distance above the best observed value as a share of the observed range.
    // Named for what it is: a gap, not a regret — regret implies a baseline of
    // the best attainable plan, which this module cannot compute.
    option.costAboveBest = round((option.cost - Math.min(...costs)) / costRange, 3);
    option.capabilityAboveBest = round((option.capabilityLost - Math.min(...capabilities)) / capRange, 3);
    option.onFrontier = frontier.some((entry) => entry.id === option.id);
  }

  return {
    options,
    target,
    recommended,
    frontier: frontier.map((option) => option.id),
    tradeoff,
    highPerformerPool: highPerformers.length,
    note: 'Cash and capability are reported side by side and never converted into each other. An option that does not remove the target headcount is excluded from the comparison rather than ranked below the others.',
    framework: 'Pareto dominance · Akerlof (1970) adverse selection',
  };
}

/* --------------------------------------------------------------- timeline */

/**
 * Backwards-planned gate sequence. Gate evidence is a recorded human check on
 * the program (`gates`), never inferred from the presence of a decision: this
 * module's whole purpose is to stop delivery being confused with paperwork.
 */
export function transitionTimeline(program, now = new Date()) {
  const today = dayKey(now);
  const effectiveOn = program?.effectiveOn || today;
  const recorded = new Map((program?.gates || []).map((gate) => [gate.key, gate]));
  const gates = TRANSITION_GATES.map((gate) => {
    const on = gate.offsetDays === null ? (program?.declaredOn || today) : addDays(effectiveOn, gate.offsetDays);
    const record = recorded.get(gate.key) || null;
    let status = 'upcoming';
    if (record?.done) status = 'done';
    else if (record?.blocked) status = 'blocked';
    else if (on && today > on) status = 'overdue';
    else if (on && today === on) status = 'due';
    return {
      key: gate.key,
      label: gate.label,
      owner: gate.owner,
      on,
      status,
      note: record?.note || '',
      recordedOn: record?.on || null,
    };
  });
  const lastDay = gates.find((gate) => gate.key === 'last-day');
  const handover = gates.find((gate) => gate.key === 'handover');
  const handoverBlocked = Boolean(handover && handover.status !== 'done' && lastDay && today >= lastDay.on);
  return {
    gates,
    effectiveOn,
    today,
    daysToEffective: daysBetween(today, effectiveOn),
    handoverBlocked,
    overdue: gates.filter((gate) => gate.status === 'overdue').length,
    done: gates.filter((gate) => gate.status === 'done').length,
    note: handoverBlocked
      ? 'The last working day has arrived with an incomplete knowledge hand-over. That is the single most expensive thing on this page to discover late.'
      : '',
  };
}

/* --------------------------------------------------------------- reading */

function proposedAndRecommended(state, program, facts, settings, blocked) {
  const target = Number.isFinite(Number(program?.target?.headcount))
    ? Math.max(0, Math.round(Number(program.target.headcount))) : 0;
  const weights = program?.weights && Object.keys(program.weights).length
    ? program.weights : TRANSITION_DEFAULT_WEIGHTS;
  const costCeiling = Number.isFinite(Number(program?.target?.costCeiling)) ? Number(program.target.costCeiling) : null;
  const proposed = facts.rows.filter((row) => row.stillActive && row.declared);
  const proposedIds = new Set(proposed.map((row) => row.personId));
  const lockedIn = new Set(facts.rows.filter((row) => row.stillActive && row.locked && row.declared).map((row) => row.personId));
  const lockedOut = new Set(facts.rows.filter((row) => row.locked && !row.declared).map((row) => row.personId));
  const recommended = optimizeSelection(facts.rows.filter((row) => row.stillActive), {
    targetCount: target,
    weights,
    costCeiling,
    blocked,
    lockedIn,
    lockedOut,
  });
  const cost = proposed.reduce((sum, row) => sum + (row.exitCost ?? 0), 0);
  const unpriced = proposed.filter((row) => row.exitStatus === 'unpriced').length;
  const capabilityLost = proposed.reduce((sum, row) => sum + row.capabilityRaw, 0);
  const totalCapability = facts.rows.filter((row) => row.stillActive).reduce((sum, row) => sum + row.capabilityRaw, 0);
  const replacementExposure = proposed.reduce((sum, row) => sum + (row.replacementCost ?? 0), 0);
  return {
    proposed,
    proposedIds,
    cost: Math.round(cost),
    unpriced,
    costCeiling,
    costCeilingBreached: Number.isFinite(costCeiling) && cost > costCeiling + 0.5,
    target,
    shortfall: Math.max(0, target - proposed.length),
    overTarget: Math.max(0, proposed.length - target),
    highPerformersLost: proposed.filter((row) => row.highPerformer).length,
    capabilityLost: round(capabilityLost, 2),
    capabilityLostPct: totalCapability > 0 ? round((capabilityLost / totalCapability) * 100, 1) : 0,
    replacementExposure: Math.round(replacementExposure),
    recommended,
    weights,
    lockedIn,
    lockedOut,
  };
}

/**
 * The complete read model for one program.
 *
 * `depth: 'fast'` skips the weight ensemble and the compliance search. It exists
 * so the Insights roll-up (which runs on every render) cannot pay for 240
 * re-solves per program; the page uses the full read.
 */
export function transitionReading(state, program, now = new Date(), { depth = 'full' } = {}) {
  const settings = state?.settings || {};
  const facts = candidates(state, program, now);
  const active = facts.rows.filter((row) => row.stillActive);
  const blockedMap = new Map();
  for (const row of active) {
    if (row.soleHolder) blockedMap.set(row.personId, 'sole steward of a critical dependency');
  }
  const plan = proposedAndRecommended(state, program, facts, settings, blockedMap);
  const dimension = TRANSITION_DIMENSIONS.includes(program?.dimension) ? program.dimension : 'team';
  const threshold = Number.isFinite(Number(settings.transitionImpactRatio))
    ? Number(settings.transitionImpactRatio) : TRANSITION_CONVENTIONS.impactRatio;
  const minGroupSize = Number.isFinite(Number(settings.transitionMinGroupSize))
    ? Number(settings.transitionMinGroupSize) : TRANSITION_CONVENTIONS.minGroupSize;
  const screenIds = plan.proposed.length ? plan.proposedIds : plan.recommended.selectedIds;
  const screen = impactScreen(facts.rows, screenIds, { dimension, threshold, minGroupSize });
  if (!plan.proposed.length) screen.target = 'recommended';
  const continuity = continuityExposure(state, facts, plan.proposedIds, now);
  const survivors = survivorImpact(facts, plan.proposedIds, settings, now);
  const options = alternatives(facts, plan.proposedIds, {
    ...settings,
    _requisitions: (state?.requisitions || []).filter((row) => row && (row.status === 'open' || row.status === 'approved')).length,
  }, now);
  const timeline = transitionTimeline(program, now);
  const robustness = depth === 'fast'
    ? { draws: 0, status: 'skipped', reason: 'Skipped in the fast read.', byPerson: new Map(), core: [], knifeEdge: [], stableRetained: [] }
    : robustnessEnsemble(active, {
      targetCount: plan.target,
      weights: plan.weights,
      costCeiling: plan.costCeiling,
      blocked: blockedMap,
      lockedIn: plan.lockedIn,
      lockedOut: plan.lockedOut,
      seed: program?.id || 'transition',
    });
  const compliance = depth === 'fast'
    ? { status: 'skipped', detail: 'Compliance repair is not computed in the fast read.', swaps: [], costDelta: 0, scoreLoss: 0, feasible: null, screen }
    : complianceRepair(facts.rows, screenIds, { dimension, threshold, minGroupSize });
  const calibration = transitionCalibration(state, now);

  const flags = [];
  if (screen.status === 'ok' && screen.flagged) {
    flags.push({ id: 'impact', severity: screen.reliable ? 4 : 3, detail: screen.detail });
  }
  if (robustness.status === 'ok' && active.length) {
    const share = robustness.knifeEdge.length / Math.max(1, plan.target || active.length);
    if (robustness.knifeEdge.length && (plan.target ? share >= 0.25 : robustness.knifeEdge.length >= 3)) {
      flags.push({
        id: 'fragile-selection',
        severity: 3,
        detail: `${robustness.knifeEdge.length} candidate(s) are selected in ${TRANSITION_CONVENTIONS.stabilityKnifePct}–${TRANSITION_CONVENTIONS.stabilityCorePct}% of weightings. Those names are decided by the weight table, not by a fact in the record.`,
      });
    }
  }
  if (continuity.blockers.length) flags.push({ id: 'sole-holder', severity: 5, detail: continuity.note });
  if (survivors.flagged.length) {
    flags.push({
      id: 'survivor-load',
      severity: 3,
      detail: `${survivors.flagged.length} retained person(s) take on at least ${survivors.threshold}% more recorded ownership than before the change.`,
    });
  }
  if (plan.unpriced) {
    flags.push({
      id: 'unpriced',
      severity: 2,
      detail: `${plan.unpriced} proposed exit(s) have no recorded pay, so no cash cost and no replacement exposure can be computed for them.`,
    });
  }
  if (plan.costCeilingBreached) {
    flags.push({
      id: 'over-budget',
      severity: 4,
      detail: `The proposed exits cost ${plan.cost} against a ${plan.costCeiling} ceiling.`,
    });
  }
  if (compliance.status === 'ok' && compliance.feasible === false) {
    flags.push({ id: 'infeasible-compliance', severity: 4, detail: compliance.detail });
  }
  if (timeline.handoverBlocked) flags.push({ id: 'handover', severity: 4, detail: timeline.note });

  return {
    program,
    facts,
    active,
    plan,
    screen,
    compliance,
    robustness,
    continuity,
    survivors,
    options,
    timeline,
    calibration,
    flags,
    ready: plan.proposed.length > 0 && plan.target > 0,
    snapshot: program?.snapshot || null,
    outcomes: program?.outcomes || [],
  };
}

/* ----------------------------------------------------------- calibration */

export function transitionCalibration(state, now = new Date()) {
  const rows = [];
  for (const program of state?.transitionPrograms || []) {
    if (!program || !program.snapshot) continue;
    const horizonOn = addDays(program.effectiveOn || program.snapshot.on || dayKey(now), TRANSITION_CONVENTIONS.horizonDays);
    for (const outcome of program.outcomes || []) {
      if (!outcome || typeof outcome.departed !== 'boolean' || !Number.isFinite(Number(outcome.departurePct))) continue;
      rows.push({ predicted: Number(outcome.departurePct) / 100, observed: outcome.departed ? 1 : 0, programId: program.id, horizonOn });
    }
  }
  const closed = rows.filter((row) => row.horizonOn <= dayKey(now) || true);
  const n = closed.length;
  const base = n ? mean(closed.map((row) => row.observed)) : null;
  const brier = n ? mean(closed.map((row) => (row.predicted - row.observed) ** 2)) : null;
  const baseBrier = n ? mean(closed.map((row) => (base - row.observed) ** 2)) : null;
  const skill = n && baseBrier > 0 ? 1 - brier / baseBrier : null;
  const measured = n >= TRANSITION_CONVENTIONS.calibrationMin;
  return {
    n,
    measurable: measured,
    brier: measured ? round(brier, 3) : null,
    baseBrier: measured ? round(baseBrier, 3) : null,
    skill: measured && Number.isFinite(skill) ? round(skill, 3) : null,
    basePct: measured && Number.isFinite(base) ? round(base * 100, 1) : null,
    note: measured
      ? 'Brier against the observed base rate. A positive skill score means the three-term convention beat "everyone has the same odds". It is a property of a planning convention, not a forecast about any person.'
      : `Withheld: ${n} of ${TRANSITION_CONVENTIONS.calibrationMin} frozen prediction(s) have resolved. A rate from ${n} outcome(s) is a story, not a calibration.`,
  };
}

/* --------------------------------------------------------------- signals */

/**
 * Read-side findings. `fast` is used by the Insights roll-up; the signals stay
 * meaningful because they read the proposed plan, not the ensemble.
 */
export function transitionSignals(state, now = new Date()) {
  const out = [];
  for (const program of (state?.transitionPrograms || [])) {
    if (!program || program.status === 'abandoned') continue;
    const reading = transitionReading(state, program, now, { depth: 'fast' });
    const route = `#/transition?program=${encodeURIComponent(program.id)}`;
    if (reading.continuity.blockers.length) {
      out.push({
        ruleId: 'TRN-01',
        domain: 'Workforce transition',
        severity: 5,
        confidence: 'high',
        title: `${reading.continuity.blockers.length} selected exit(s) in “${program.label}” would remove the only holder of a critical capability`,
        detail: reading.continuity.note,
        evidence: reading.continuity.blockers.slice(0, 3).map((row) => `${row.name}: ${row.reason}`),
        action: { label: 'Open the continuity reading', route: `${route}&panel=continuity` },
      });
    }
    if (reading.screen.status === 'ok' && reading.screen.flagged) {
      out.push({
        ruleId: 'TRN-02',
        domain: 'Workforce transition',
        severity: reading.screen.reliable ? 4 : 3,
        confidence: reading.screen.reliable ? 'medium' : 'low',
        title: `Selection ratio ${reading.screen.ratio} in “${program.label}” is below the ${reading.screen.threshold} floor`,
        detail: reading.screen.detail,
        evidence: reading.screen.groups.map((group) => `${group.label}: ${group.selected}/${group.n} selected (${group.ratePct}%, 95% ${group.lowPct}–${group.highPct}%)`),
        action: { label: 'Price the compliance alternative', route: `${route}&panel=exposure` },
      });
    }
    if (reading.plan.shortfall > 0) {
      out.push({
        ruleId: 'TRN-03',
        domain: 'Workforce transition',
        severity: 3,
        confidence: 'high',
        title: `“${program.label}” names ${reading.plan.proposed.length} of ${reading.plan.target} planned exits`,
        detail: 'A target without named rows is an intention. The gap is reported rather than filled in by the model.',
        evidence: [`${reading.plan.proposed.length} named`, `${reading.plan.target} target`, `${reading.active.length} in the pool`],
        action: { label: 'Name the remainder or change the target', route },
      });
    }
    if (reading.plan.unpriced) {
      out.push({
        ruleId: 'TRN-04',
        domain: 'Workforce transition',
        severity: 2,
        confidence: 'high',
        title: `${reading.plan.unpriced} exit(s) in “${program.label}” cannot be priced`,
        detail: 'No recorded pay means no exit cost, no replacement exposure and no budget check. Missing stays missing rather than becoming zero.',
        evidence: reading.plan.proposed.filter((row) => row.exitStatus === 'unpriced').slice(0, 3).map((row) => row.name),
        action: { label: 'Open the plan', route },
      });
    }
    if (reading.survivors.flagged.length) {
      out.push({
        ruleId: 'TRN-05',
        domain: 'Workforce transition',
        severity: 3,
        confidence: 'medium',
        title: `${reading.survivors.flagged.length} retained person(s) in “${program.label}” absorb at least ${reading.survivors.threshold}% more ownership`,
        detail: 'Survivor load is the second wave of a reduction. It is measured from recorded ownership, not from how people say they feel.',
        evidence: reading.survivors.flagged.slice(0, 3).map((row) => `${row.name}: +${row.increasePct}% ownership units`),
        action: { label: 'Read the survivor panel', route: `${route}&panel=alternatives` },
      });
    }
    if (reading.timeline.handoverBlocked) {
      out.push({
        ruleId: 'TRN-06',
        domain: 'Workforce transition',
        severity: 4,
        confidence: 'high',
        title: `Knowledge hand-over is incomplete on “${program.label}” and the last working day has arrived`,
        detail: reading.timeline.note,
        evidence: reading.timeline.gates.filter((gate) => gate.status !== 'done' && gate.status !== 'upcoming').slice(0, 4).map((gate) => `${gate.label}: ${gate.status}`),
        action: { label: 'Open the timeline', route: `${route}&panel=plan` },
      });
    }
    if (reading.calibration.measurable && reading.calibration.skill !== null && reading.calibration.skill < 0) {
      out.push({
        ruleId: 'TRN-07',
        domain: 'Workforce transition',
        severity: 2,
        confidence: 'medium',
        title: 'The survivor convention is scoring worse than its own base rate',
        detail: reading.calibration.note,
        evidence: [`Brier ${reading.calibration.brier}`, `Base ${reading.calibration.baseBrier}`, `${reading.calibration.n} resolved`],
        action: { label: 'Read the calibration', route: `${route}&panel=method` },
      });
    }
  }
  return out;
}

/**
 * Attention count for the navigation badge: decision-shaped signals only.
 * Hygiene rows (an unpriced exit) are excluded on purpose — a badge that never
 * goes to zero is a badge nobody reads.
 */
export function transitionAttention(state, now = new Date()) {
  return transitionSignals(state, now).filter((signal) => signal.severity >= 3).length;
}

/* ------------------------------------------------------------------ brief */

export function transitionBrief(state, now = new Date()) {
  const lines = [];
  const programs = (state?.transitionPrograms || []).filter((program) => program && program.status !== 'abandoned');
  lines.push('WORKFORCE TRANSITION BRIEF');
  lines.push(`Generated ${dayKey(now)} · LeadOS Schema v52`);
  lines.push('');
  if (!programs.length) {
    lines.push('No transition programme is declared. Nothing here is a recommendation.');
    return lines.join('\n');
  }
  for (const program of programs) {
    const reading = transitionReading(state, program, now);
    const currency = program.currency || 'USD';
    lines.push(`── ${program.label} (${program.status}) ──────────────────────────`);
    lines.push(`Target ${reading.plan.target} exit(s); ${reading.plan.proposed.length} named; effective ${program.effectiveOn || 'unrecorded'}.`);
    lines.push(`Cash cost ${currency} ${reading.plan.cost}${reading.plan.unpriced ? ` (${reading.plan.unpriced} unpriced)` : ''}; replacement exposure ${currency} ${reading.plan.replacementExposure}.`);
    lines.push(`Capability leaving ${reading.plan.capabilityLostPct}% of the pool's recorded capability value; ${reading.plan.highPerformersLost} high performer(s).`);
    if (reading.screen.status === 'ok') {
      lines.push(`Selection ratio ${reading.screen.ratio} against a ${reading.screen.threshold} floor — ${reading.screen.flagged ? 'BELOW the floor' : 'clears the floor'}${reading.screen.reliable ? '' : ' (low confidence: small groups)'}.`);
    } else {
      lines.push(`Selection screen: ${reading.screen.detail}`);
    }
    if (reading.compliance.status === 'ok' && !reading.compliance.alreadyCompliant) {
      lines.push(`Cheapest compliant plan: ${reading.compliance.feasible ? `${reading.compliance.swaps.length} swap(s), +${currency} ${reading.compliance.costDelta} cost, ${reading.compliance.scoreLoss} composite exposure lost` : 'none reachable at this headcount'}.`);
    }
    if (reading.robustness.status === 'ok') {
      lines.push(`Weight robustness: ${reading.robustness.core.length} core, ${reading.robustness.knifeEdge.length} knife-edge, ${reading.robustness.stableRetained.length} stable-retained over ${reading.robustness.draws} weightings.`);
    }
    if (reading.continuity.blockers.length) {
      lines.push(`BLOCKERS: ${reading.continuity.blockers.map((row) => `${row.name} (${row.reason})`).join('; ')}`);
    }
    if (reading.continuity.atRisk.length) {
      lines.push(`Knowledge hand-over required for ${reading.continuity.atRisk.length} leaver(s); highest risk ${reading.continuity.atRisk[0].name} at ${reading.continuity.atRisk[0].riskScore}/100.`);
    }
    lines.push(`Survivor load: median ownership ${reading.survivors.beforeMedian} → ${reading.survivors.afterMedian}; ${reading.survivors.flagged.length} person(s) above the +${reading.survivors.threshold}% convention.`);
    lines.push(`Alternatives, minimax regret: ${reading.options.recommended ? reading.options.options.find((option) => option.id === reading.options.recommended).label : 'not computed'}.`);
    lines.push('');
  }
  lines.push('Conventions in force (not legal advice):');
  const settings = state?.settings || {};
  lines.push(`  notice ${settings.transitionNoticeDays ?? TRANSITION_CONVENTIONS.noticeDays} days · severance ${settings.transitionSeveranceMonthsPerYear ?? TRANSITION_CONVENTIONS.severanceMonthsPerYear} month(s) per year of service, capped at ${settings.transitionSeveranceCapMonths ?? TRANSITION_CONVENTIONS.severanceCapMonths} · impact floor ${settings.transitionImpactRatio ?? TRANSITION_CONVENTIONS.impactRatio} · group floor ${settings.transitionMinGroupSize ?? TRANSITION_CONVENTIONS.minGroupSize}.`);
  lines.push('No protected characteristic is stored. The screen runs on an organisational dimension or on opaque codes the leader supplies.');
  lines.push('This brief is not legal advice and contains no individual prediction.');
  return lines.join('\n');
}
