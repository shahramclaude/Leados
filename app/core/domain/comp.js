/**
 * app/core/domain/comp.js — the Merit & Pay-Equity Terminal (Schema v51).
 *
 * Every other module in LeadOS answers a question about one person's work. This
 * one answers the question a manager is asked once a year and is almost never
 * equipped for: *given a fixed merit budget and a team of unequal market
 * position, performance and replaceability, where does the next dollar go — and
 * what does the resulting pattern look like to the people who receive it?*
 *
 * Four disciplines are used explicitly, and none of them is decoration:
 *
 *  1. **Labour economics — Oaxaca–Blinder decomposition.** The gap between two
 *     declared groups is split into the part explained by recorded
 *     characteristics (level, tenure, last rating) and the part left
 *     unexplained. Log pay, pooled coefficients, an adjusted-gap interval
 *     interval, and a refusal to fit below a printed sample floor.
 *  2. **Employment law — the four-fifths rule.** Adverse impact is the ratio of
 *     the favourable-decision rates between groups (< 0.8 flags). It is a
 *     screening heuristic, not a legal conclusion.
 *  3. **Statistics — honest small-n.** Wilson intervals on proportions, a
 *     analytic standard error, a Brier skill score with a base-rate
 *     comparator, and "insufficient" rather than a number when the sample
 *     cannot support the claim.
 *  4. **Decision theory — marginal value per dollar.** Retention value is
 *     modelled per person as replacement cost × the reduction in departure
 *     probability achieved by a raise. Because the hazard model is logistic,
 *     marginal returns diminish, so a budget has a genuine allocation problem
 *     rather than a trivial ranking. Three candidate policies are priced side
 *     by side and the regret of each against the best one is printed.
 *
 * The module refuses three specific fictions:
 *
 *  - it never asks for or stores a protected characteristic. It audits whatever
 *    comparison the leader declares (hire origin, reporting line), and states
 *    that an unexplained gap is not evidence of discrimination;
 *  - a policy comparison is not a forecast. Every number is a model output from
 *    inputs the leader entered, and the constants are printed on the page;
 *  - the retention model grades itself out of sample. When people later leave,
 *    the frozen predictions are scored with a Brier skill score against the
 *    observed base rate, and below five outcomes it refuses to report.
 *
 * Pure module: no storage, no clock, no randomness outside the seeded PRNG.
 */

import { clamp, dayKey, daysBetween, mean, round } from '../time.js';
import { successionGaps } from './readiness.js';

/* ------------------------------------------------------------- conventions */

/**
 * These are management conventions with a printed rationale, not constants of
 * nature. A leader can change the ones that are settings; the rest are shown on
 * the method card so a reader can disagree with them explicitly.
 */
export const COMP_CONVENTIONS = Object.freeze({
  // Band positioning. Midpoint targeting is the common compensation convention;
  // it is not a merit standard and this app does not treat it as one.
  targetCompaRatio: 1.0,
  // A subordinate at or above (1 − tolerance) × their manager's pay is flagged
  // as compression. The tolerance exists only so a 0.5% difference is not noise.
  compressionTolerancePct: 3,
  // Below this share of the band floor a raise is "below the floor", which is a
  // structural problem that a merit cycle cannot honestly solve.
  floorAlertCompaRatio: 0.9,
  // Four-fifths rule (EEOC Uniform Guidelines). Screening heuristic only.
  adverseImpactRatio: 0.8,
  // Sample floors. Below them the module returns `insufficient`, never a guess.
  minGroupSize: 5,
  minOutcomesForCalibration: 5,
  // The seed behind every sampled quantity this module produces. Fixed so the
  // same workspace always prints the same number.
  simulationSeed: 0x9e3779b9,
  // Retention hazard. `p(depart) = logistic(z)` with z built from the four terms
  // below. Every coefficient is printed on the page and none was fitted to this
  // workspace's data — which is exactly why the module scores itself later.
  riskBase: -2.2,
  riskPerDeficitPp: 0.055,
  riskPerPeerDeficitPp: 0.04,
  riskPerRecordedConcern: 0.9,
  riskDeficitCapPp: 30,
  riskPeerDeficitCapPp: 20,
  riskFloorPct: 2,
  riskCeilingPct: 85,
  // Replacement cost as a multiple of annual pay, before the succession factor.
  // 0.5 × annual pay is a deliberately conservative mid-point of the widely
  // cited 50–200% range; the leader can change it in settings.
  replacementMultiplier: 0.5,
  // Succession factor: an empty bench makes a departure more expensive to
  // absorb; a ready-now successor makes it cheaper. Read from `readiness`.
  criticalityEmptyBench: 1.5,
  criticalityCoveredBench: 0.8,
  // Merit mechanics.
  minAdjustPct: 0,
  maxAdjustPct: 20,
  policyStepPct: 0.5,
  // Compression/inversion tolerance for a new external hire against the
  // internal median at the same level (the "loyalty penalty" audit).
  newHireTenureDays: 365,
});

export const COMP_STATUSES = ['draft', 'finalized', 'abandoned'];
export const COMP_STATUS_LABELS = {
  draft: 'In progress',
  finalized: 'Finalized (frozen audit)',
  abandoned: 'Abandoned',
};

export const COMP_ORIGINS = ['internal', 'external', 'unknown'];
export const COMP_ORIGIN_LABELS = {
  internal: 'Internal promotion / hire',
  external: 'External hire',
  unknown: 'Not recorded',
};

export const COMP_DIMENSIONS = ['origin', 'reporting-line'];
export const COMP_DIMENSION_LABELS = {
  origin: 'How the person joined (internal vs external)',
  'reporting-line': 'Reporting line (sub-team)',
};

export const COMP_POLICIES = [
  {
    id: 'equal',
    label: 'Across the board',
    description: 'The same percentage for everyone. Cheap to explain, and it pays the person already above the band the most money.',
  },
  {
    id: 'performance',
    label: 'Performance-weighted',
    description: 'Last completed review rating sets the share. Pays for the past, and says nothing about who is about to leave.',
  },
  {
    id: 'retention',
    label: 'Marginal retention value',
    description: 'Each increment goes where it buys the most expected retained value per dollar, with diminishing returns and the band ceiling respected.',
  },
];

const LEVEL_ORDER = ['ic', 'senior', 'lead', 'manager', 'director', 'vp'];

function money(value) {
  // A blank is not a zero. `Number(null)` is 0, so the naive version silently
  // turned "no salary recorded" into a real 0 that flowed into compa-ratios,
  // the budget and the frozen audit. Missing pay must stay missing.
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function pctOf(value) {
  return Number.isFinite(value) ? Math.round(value * 1000) / 10 : null;
}

function isDay(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function logPay(pay) {
  const n = Number(pay);
  return Number.isFinite(n) && n > 0 ? Math.log(n) : null;
}

/**
 * Deterministic PRNG.
 *
 * Kept exported because every sampled quantity in this app has to reproduce on
 * every render and in every test: Math.random() would make the same workspace
 * print a different number each time.
 */
export function seededRandom(seed = COMP_CONVENTIONS.simulationSeed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* --------------------------------------------------------- band positioning */

/** The band in force for a level on a date: the latest `effectiveOn` at or before it. */
export function bandFor(bands, level, on) {
  const day = isDay(on) ? on : dayKey(on);
  const candidates = (bands || [])
    .filter((band) => band && band.level === level)
    .filter((band) => !band.effectiveOn || !day || band.effectiveOn <= day)
    .sort((a, b) => String(b.effectiveOn || '').localeCompare(String(a.effectiveOn || '')));
  return candidates[0] || null;
}

/**
 * Where a salary sits against its band.
 * `compa` below 1 means paid under the midpoint; `penetration` 0% is the floor
 * and 100% the ceiling. Neither is a performance statement.
 */
export function positionPay(pay, band) {
  const value = money(pay);
  if (!band || value === null) {
    return { compaRatio: null, penetrationPct: null, position: 'unknown', label: 'No band for this level' };
  }
  const mid = money(band.mid);
  const min = money(band.min);
  const max = money(band.max);
  const compaRatio = mid && mid > 0 ? value / mid : null;
  const span = max !== null && min !== null ? max - min : null;
  const penetrationPct = span && span > 0 ? ((value - min) / span) * 100 : null;
  let position = 'in';
  if (value < min) position = 'below';
  else if (value > max) position = 'above';
  const label = position === 'below' ? 'Below band floor' : position === 'above' ? 'Above band ceiling' : 'Inside band';
  return {
    compaRatio: compaRatio === null ? null : Math.round(compaRatio * 1000) / 1000,
    penetrationPct: penetrationPct === null ? null : Math.round(penetrationPct * 10) / 10,
    position,
    label,
  };
}

export function compensationBudget(cycle) {
  const budget = cycle?.budget || {};
  const value = Number(budget.value);
  const kind = budget.kind === 'pool-pct' ? 'pool-pct' : 'amount';
  return {
    kind,
    value: Number.isFinite(value) && value >= 0 ? value : 0,
    amount: null, // filled by budgetFor() once the roster is known
  };
}

/** Total current pay in the cycle, and the budget expressed as money. */
export function budgetFor(cycle, rows) {
  const payroll = rows.reduce((acc, row) => acc + (money(row.currentPay) || 0), 0);
  const declared = compensationBudget(cycle);
  const amount = declared.kind === 'pool-pct'
    ? money(payroll * (declared.value / 100))
    : money(declared.value);
  return {
    kind: declared.kind,
    value: declared.value,
    payroll: money(payroll),
    amount: amount === null ? 0 : amount,
    pctOfPayroll: payroll > 0 && amount !== null ? Math.round((amount / payroll) * 10000) / 100 : null,
  };
}

/* ------------------------------------------------------------- read models */

function activePersonMap(state) {
  const map = new Map();
  for (const person of (state?.people || [])) {
    if (person && person.id) map.set(person.id, person);
  }
  return map;
}

/**
 * Latest completed review rating for each person, as a 1–4 score — as of a
 * given day.
 *
 * The `asOf` bound matters: a cycle that took effect a year ago must be read
 * against the rating in force then, not against the review someone completed
 * last week. Reading today's rating into last year's pay decision is exactly the
 * kind of quiet anachronism this ledger exists to avoid.
 */
export function ratingIndex(state, asOf = null) {
  const out = new Map();
  const bound = isDay(asOf) ? `${asOf}T23:59:59.999Z` : null;
  for (const review of (state?.reviews || [])) {
    if (!review || review.status !== 'complete') continue;
    if (bound) {
      const completed = String(review.completedAt || review.updatedAt || '');
      if (!completed || completed > bound) continue;
    }
    const rating = review.manager?.rating;
    const score = ['needs-development', 'meets-expectations', 'often-exceeds', 'sets-standard'].indexOf(rating) + 1;
    if (!score) continue;
    const at = String(review.completedAt || review.updatedAt || '');
    const prev = out.get(review.personId);
    if (!prev || String(prev.at) < at) out.set(review.personId, { score, at, rating });
  }
  return out;
}

/** Succession factor per person, read from the readiness ledger, never invented. */
export function criticalityIndex(state, now) {
  // `successionGaps` reads the 1:1, feedback, delegation and goal ledgers to
  // test whether a "ready now" claim is supported. If any of them is missing —
  // a partially loaded workspace, a fixture — the module makes no bench claim
  // at all rather than defaulting everyone to "critical" or "covered".
  const required = ['people', 'readiness', 'oneOnOnes', 'feedback', 'delegations', 'goals', 'growthPlans', 'recognition'];
  if (!required.every((key) => Array.isArray(state?.[key]))) return new Map();
  const rows = successionGaps(state, now, state?.settings);
  const bySeat = new Map(rows.map((row) => [row.seat, row]));
  const people = activePersonMap(state);
  const out = new Map();
  for (const person of people.values()) {
    if (person.status === 'archived') continue;
    const seat = person.role ? bySeat.get(person.role) : null;
    if (!seat) {
      out.set(person.id, { factor: 1, basis: 'no succession seat recorded', seat: person.role || null, bench: null });
      continue;
    }
    if (seat.gap) {
      out.set(person.id, {
        factor: COMP_CONVENTIONS.criticalityEmptyBench,
        basis: `seat “${seat.seat}” has no ready-now successor`,
        seat: seat.seat,
        bench: 0,
      });
    } else {
      out.set(person.id, {
        factor: COMP_CONVENTIONS.criticalityCoveredBench,
        basis: `seat “${seat.seat}” has ${seat.readyNow.length} ready-now successor(s)`,
        seat: seat.seat,
        bench: seat.readyNow.length,
      });
    }
  }
  return out;
}

/**
 * The compensation roster as the module reads it: one row per pay decision,
 * joined to the person record, their band, their last rating and their
 * succession exposure. Nothing here is written back.
 */
export function compensationRows(state, cycle, now = new Date()) {
  const people = activePersonMap(state);
  const criticality = criticalityIndex(state, now);
  const on = cycle?.effectiveOn || dayKey(now);
  // The rating is read as of the day the pay took effect, but never from the
  // future: a cycle that has not taken effect yet uses the latest review.
  const ratings = ratingIndex(state, on <= dayKey(now) ? on : dayKey(now));
  return (cycle?.rows || []).map((row) => {
    const person = people.get(row.personId) || null;
    const band = bandFor(state?.compBands || [], row.level || person?.level, on);
    const rating = ratings.get(row.personId) || null;
    const crit = criticality.get(row.personId) || { factor: 1, basis: 'no succession seat recorded', bench: null };
    const current = money(row.currentPay);
    const proposed = money(row.proposedPay);
    return {
      row,
      person,
      personId: row.personId,
      name: person?.name || 'Removed person',
      missingPerson: !person,
      level: row.level || person?.level || null,
      band,
      currentPay: current,
      proposedPay: proposed,
      adjustPct: current && proposed ? Math.round(((proposed - current) / current) * 1000) / 10 : null,
      adjustAmount: current && proposed ? money(proposed - current) : null,
      origin: row.origin || 'unknown',
      tenureDays: person?.startDate ? daysBetween(person.startDate, on) : null,
      rating,
      criticality: crit,
      retentionConcern: row.retentionConcern === true,
      note: String(row.note || ''),
      position: positionPay(current, band),
      proposedPosition: positionPay(proposed, band),
    };
  });
}

/* ------------------------------------------------------------- band health */

export function bandIntegrity(state, cycle, now = new Date()) {
  const rows = compensationRows(state, cycle, now);
  const withPay = rows.filter((row) => row.currentPay !== null);
  const bands = new Map();
  for (const row of withPay) {
    const key = row.band ? `${row.band.level}:${row.band.effectiveOn || 'undated'}` : 'none';
    if (!bands.has(key)) {
      bands.set(key, {
        level: row.level,
        band: row.band,
        people: 0,
        below: 0,
        above: 0,
        compaTotal: 0,
        compaCount: 0,
      });
    }
    const entry = bands.get(key);
    entry.people += 1;
    if (row.position.position === 'below') entry.below += 1;
    if (row.position.position === 'above') entry.above += 1;
    if (row.position.compaRatio !== null) {
      entry.compaTotal += row.position.compaRatio;
      entry.compaCount += 1;
    }
  }
  const levels = [...bands.values()].map((entry) => ({
    ...entry,
    meanCompa: entry.compaCount ? Math.round((entry.compaTotal / entry.compaCount) * 1000) / 1000 : null,
  })).sort((a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level));

  const unmapped = rows.filter((row) => !row.band).length;
  const noPay = rows.filter((row) => row.currentPay === null).length;
  return {
    levels,
    counts: {
      rows: rows.length,
      withPay: withPay.length,
      withoutPay: noPay,
      noBand: unmapped,
      belowFloor: withPay.filter((row) => row.position.position === 'below').length,
      aboveCeiling: withPay.filter((row) => row.position.position === 'above').length,
      insideBand: withPay.filter((row) => row.position.position === 'in').length,
    },
    // A cycle that cannot see pay or bands cannot audit anything, and the UI
    // says so instead of printing three tidy zeros.
    usable: withPay.length > 0 && unmapped < rows.length,
  };
}

/* -------------------------------------------------- compression / inversion */

/**
 * Two structural defects a merit cycle can create or reveal, both about
 * *relative* pay inside a reporting line:
 *
 *  - **Compression/inversion:** a person paid at or above their manager's pay
 *    (within tolerance). It is not automatically wrong — a senior individual
 *    contributor can out-earn a first-line manager — but it must be a decision
 *    someone took rather than a gift of an across-the-board raise.
 *  - **Loyalty penalty:** an external hire paid at or above the internal median
 *    for the same level inside their first year.
 */
export function compressionFindings(state, cycle, now = new Date()) {
  const rows = compensationRows(state, cycle, now);
  const byPerson = new Map(rows.filter((row) => row.proposedPay !== null).map((row) => [row.personId, row]));
  const tolerance = COMP_CONVENTIONS.compressionTolerancePct / 100;
  const findings = [];

  for (const row of rows) {
    if (row.proposedPay === null || !row.person?.managerId) continue;
    const manager = byPerson.get(row.person.managerId);
    if (!manager || manager.proposedPay === null) continue;
    const ratio = row.proposedPay / manager.proposedPay;
    if (ratio >= 1 - tolerance) {
      findings.push({
        kind: 'inversion',
        severity: ratio >= 1 ? 4 : 3,
        subjectId: row.personId,
        otherId: manager.personId,
        subjectName: row.name,
        otherName: manager.name,
        detail: `${row.name} is proposed at ${pctOf(ratio) ?? 0}% of ${manager.name}'s pay (${money(row.proposedPay)} vs ${money(manager.proposedPay)}).`,
        advice: ratio >= 1
          ? 'Either the manager is under-paid for the scope they hold, or the subordinate is paid for a market the band does not describe. Both are fixable; leaving it unexplained is not.'
          : 'Within the compression tolerance but close. Decide deliberately whether the reporting line should look like this.',
      });
    }
  }

  for (const row of rows) {
    if (row.origin !== 'external' || row.proposedPay === null) continue;
    const tenure = row.tenureDays;
    if (tenure === null || tenure > COMP_CONVENTIONS.newHireTenureDays) continue;
    const peers = rows.filter((other) => other.personId !== row.personId
      && other.level === row.level
      && other.origin !== 'external'
      && other.proposedPay !== null);
    // One internal colleague at the same level is exactly the comparison the
    // external-hire premium is about; requiring two would hide the finding on a
    // small team, which is where it is most likely to matter.
    if (peers.length < 1) continue;
    const peerMedian = median(peers.map((peer) => peer.proposedPay));
    if (!peerMedian) continue;
    if (row.proposedPay >= peerMedian * (1 + tolerance)) {
      findings.push({
        kind: 'loyalty-penalty',
        severity: 3,
        subjectId: row.personId,
        otherId: null,
        subjectName: row.name,
        otherName: null,
        detail: `${row.name} joined externally and is proposed at ${money(row.proposedPay)}, ${pctOf((row.proposedPay / peerMedian - 1)) ?? 0}% above the internal median for ${row.level} (${money(peerMedian)}).`,
        advice: 'This is the well-documented external-hire premium. It is a market fact, not a fairness finding — but if it repeats, the internal people are being asked to subsidise it, and that is how loyalty gets priced at zero.',
      });
    }
  }

  return findings.sort((a, b) => b.severity - a.severity);
}

export function median(values) {
  const list = values.map(Number).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!list.length) return null;
  const mid = Math.floor(list.length / 2);
  return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
}

/* --------------------------------------------------------- linear algebra */

/** Gauss–Jordan inverse with partial pivoting; `null` when singular. */
export function invertMatrix(matrix) {
  const n = matrix.length;
  if (!n || matrix.some((row) => row.length !== n)) return null;
  const a = matrix.map((row, i) => [...row.map(Number), ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < 1e-12) return null;
    if (pivot !== col) {
      const tmp = a[pivot];
      a[pivot] = a[col];
      a[col] = tmp;
    }
    const divisor = a[col][col];
    for (let j = 0; j < 2 * n; j += 1) a[col][j] /= divisor;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = a[row][col];
      if (!factor) continue;
      for (let j = 0; j < 2 * n; j += 1) a[row][j] -= factor * a[col][j];
    }
  }
  return a.map((row) => row.slice(n));
}

/**
 * Ordinary least squares with a stated ridge fallback.
 *
 * A team-sized sample with level dummies can be rank-deficient (every senior
 * engineer in one sub-team, say). Silently dropping rows would change the
 * comparison; silently reporting infinite coefficients would be worse. The
 * fallback adds a tiny penalty to the diagonal, records that it did so, and the
 * caller prints `ridge: true` rather than pretending the fit was clean.
 */
export function ols(y, X) {
  const n = y.length;
  const k = X[0]?.length || 0;
  if (!n || !k || X.some((row) => row.length !== k)) return { ok: false, reason: 'malformed-design' };
  if (n <= k + 1) return { ok: false, reason: 'not-enough-observations', n, k };

  const xtx = Array.from({ length: k }, () => Array.from({ length: k }, () => 0));
  const xty = Array.from({ length: k }, () => 0);
  for (let i = 0; i < n; i += 1) {
    for (let a = 0; a < k; a += 1) {
      xty[a] += X[i][a] * y[i];
      for (let b = 0; b < k; b += 1) xtx[a][b] += X[i][a] * X[i][b];
    }
  }

  let ridge = false;
  let inv = invertMatrix(xtx);
  if (!inv) {
    ridge = true;
    const scale = xtx.reduce((acc, row, i) => acc + row[i], 0) / k;
    const lambda = Math.max(scale * 1e-6, 1e-6);
    const penalised = xtx.map((row, i) => row.map((value, j) => (i === j ? value + lambda : value)));
    inv = invertMatrix(penalised);
    if (!inv) return { ok: false, reason: 'singular' };
  }

  const beta = Array.from({ length: k }, (_, a) => inv[a].reduce((acc, value, b) => acc + value * xty[b], 0));
  let sse = 0;
  let sst = 0;
  const ybar = mean(y);
  for (let i = 0; i < n; i += 1) {
    const fitted = X[i].reduce((acc, value, a) => acc + value * beta[a], 0);
    sse += (y[i] - fitted) ** 2;
    sst += (y[i] - ybar) ** 2;
  }
  const dof = Math.max(1, n - k);
  const sigma2 = sse / dof;
  const se = inv.map((row, a) => Math.sqrt(Math.max(0, sigma2 * row[a])));
  return {
    ok: true,
    beta,
    se,
    n,
    k,
    dof,
    ridge,
    r2: sst > 0 ? 1 - sse / sst : null,
  };
}

/* ------------------------------------------------------ Oaxaca–Blinder */

/**
 * Design matrix for the decomposition.
 *
 * Controls are the *recorded, job-relevant* characteristics a merit system is
 * supposed to pay for: level, tenure and the last completed rating. Hire origin
 * and reporting line are the group variables, so they never enter as controls.
 * A missing rating gets an explicit missingness column instead of being dropped
 * or imputed silently — dropping people with no review would remove exactly the
 * people a thin paperwork culture forgets.
 */
function decompositionDesign(rows) {
  const levels = [...new Set(rows.map((row) => row.level).filter(Boolean))];
  const reference = levels
    .map((level) => ({ level, n: rows.filter((row) => row.level === level).length }))
    .sort((a, b) => b.n - a.n)[0]?.level;
  const dummies = levels
    .filter((level) => level !== reference)
    .filter((level) => rows.filter((row) => row.level === level).length >= 2);

  const tenureValues = rows.map((row) => (row.tenureDays === null ? null : row.tenureDays / 365.25)).filter((v) => v !== null);
  const tenureMean = tenureValues.length ? mean(tenureValues) : 0;
  const ratingValues = rows.map((row) => row.rating?.score).filter((v) => typeof v === 'number');
  const ratingMean = ratingValues.length ? mean(ratingValues) : 0;
  // A column that is constant across the sample cannot be estimated and would
  // make the design singular, so the missingness flag is only built when it
  // actually varies. The same restraint keeps the printed control list honest.
  const hasMissingRating = ratingValues.length < rows.length;
  const hasSomeRating = ratingValues.length > 0;

  const labels = [
    'intercept',
    ...dummies.map((level) => `level:${level}`),
    'tenure-years',
    'last-rating',
    ...(hasMissingRating && hasSomeRating ? ['rating-missing'] : []),
  ];
  const matrix = rows.map((row) => {
    const tenure = row.tenureDays === null ? tenureMean : row.tenureDays / 365.25;
    const score = typeof row.rating?.score === 'number' ? row.rating.score : ratingMean;
    return [
      1,
      ...dummies.map((level) => (row.level === level ? 1 : 0)),
      tenure - tenureMean,
      score - ratingMean,
      ...(hasMissingRating && hasSomeRating ? [typeof row.rating?.score === 'number' ? 0 : 1] : []),
    ];
  });
  return { labels, matrix, dummies, reference, tenureMean, ratingMean, ratingMissing: rows.filter((row) => typeof row.rating?.score !== 'number').length };
}

function wilson(successes, n) {
  if (!n) return null;
  const p = successes / n;
  const z = 1.959963984540054;
  const denom = 1 + (z ** 2) / n;
  const centre = (p + (z ** 2) / (2 * n)) / denom;
  const spread = (z * Math.sqrt((p * (1 - p)) / n + (z ** 2) / (4 * n ** 2))) / denom;
  return {
    p: Math.round(p * 1000) / 1000,
    low: Math.max(0, Math.round((centre - spread) * 1000) / 1000),
    high: Math.min(1, Math.round((centre + spread) * 1000) / 1000),
  };
}

export { wilson };

/** Group membership for the declared dimension. */
export function declareGroups(state, cycle, rows) {
  if (cycle.comparison?.dimension === 'reporting-line') {
    const people = activePersonMap(state);
    const groups = new Map();
    for (const row of rows) {
      const person = people.get(row.personId);
      const managerId = person?.managerId || '__leader__';
      const manager = people.get(managerId);
      const label = manager ? manager.name : 'Reports to the leader';
      if (!groups.has(managerId)) groups.set(managerId, { id: managerId, label, members: [] });
      groups.get(managerId).members.push(row.personId);
    }
    return [...groups.values()].sort((a, b) => b.members.length - a.members.length);
  }
  const groups = { internal: [], external: [], unknown: [] };
  for (const row of rows) groups[row.origin]?.push(row.personId);
  return [
    { id: 'internal', label: COMP_ORIGIN_LABELS.internal, members: groups.internal },
    { id: 'external', label: COMP_ORIGIN_LABELS.external, members: groups.external },
    { id: 'unknown', label: COMP_ORIGIN_LABELS.unknown, members: groups.unknown },
  ].filter((group) => group.members.length > 0);
}

function decompose(observations, labels) {
  const y = observations.map((obs) => obs.y);
  const X = observations.map((obs) => obs.x);
  const fit = ols(y, X);
  if (!fit.ok) return { ok: false, reason: fit.reason };
  const groups = [...new Set(observations.map((obs) => obs.group))];
  const [a, b] = groups;
  const rowsA = observations.filter((obs) => obs.group === a);
  const rowsB = observations.filter((obs) => obs.group === b);
  const meanA = y.filter((_, i) => observations[i].group === a);
  const meanB = y.filter((_, i) => observations[i].group === b);
  const gap = mean(meanA) - mean(meanB);
  const explained = labels.map((_, k) => {
    const xa = mean(rowsA.map((obs) => obs.x[k]));
    const xb = mean(rowsB.map((obs) => obs.x[k]));
    return fit.beta[k] * (xa - xb);
  }).reduce((acc, value) => acc + value, 0);
  return {
    ok: true,
    groups,
    gap,
    explained,
    unexplained: gap - explained,
    ridge: fit.ridge,
    r2: fit.r2,
    contributions: labels.map((label, k) => ({
      label,
      coefficient: Math.round(fit.beta[k] * 1e6) / 1e6,
      contribution: Math.round((fit.beta[k] * (mean(rowsA.map((obs) => obs.x[k])) - mean(rowsB.map((obs) => obs.x[k])))) * 1e6) / 1e6,
    })),
    nA: rowsA.length,
    nB: rowsB.length,
  };
}

/**
 * Twofold Oaxaca–Blinder on log pay, with a stated interval on the adjusted gap.
 *
 * The decomposition answers: of the observed gap between two groups, how much
 * is explained by the characteristics the workspace records, and how much is
 * not? It cannot answer *why* the remainder exists — omitted variables
 * (negotiation history, market timing, scope the level field does not capture)
 * live inside it. The UI prints that sentence next to the number.
 */
export function oaxacaBlinder(state, cycle, now = new Date(), options = {}) {
  const rows = compensationRows(state, cycle, now);
  const groups = declareGroups(state, cycle, rows);
  const minGroupSize = options.minGroupSize ?? COMP_CONVENTIONS.minGroupSize;
  const observations = rows
    .filter((row) => row.currentPay !== null && logPay(row.currentPay) !== null)
    .map((row) => ({ ...row, y: logPay(row.currentPay) }));

  const base = {
    dimension: cycle.comparison?.dimension || 'origin',
    dimensionLabel: COMP_DIMENSION_LABELS[cycle.comparison?.dimension || 'origin'],
    groups,
    minGroupSize,
    caveats: [
      'An unexplained gap is not proof of discrimination. It is the part of the difference the recorded characteristics do not account for, and omitted variables sit inside it.',
      'The controls are level, tenure and the last completed review rating only. Scope, negotiation history and market timing are not recorded, so they cannot be held constant.',
      'Log-pay Oaxaca–Blinder is a descriptive decomposition. It does not estimate a counterfactual pay structure for this team.',
    ],
  };

  const eligible = groups
    .map((group) => ({ ...group, rows: observations.filter((obs) => group.members.includes(obs.personId)) }))
    .sort((a, b) => b.rows.length - a.rows.length)
    .slice(0, 2);
  if (eligible.length < 2) {
    return { ...base, status: 'insufficient', reason: 'two-groups-required', n: observations.length };
  }
  const [gA, gB] = eligible;
  if (gA.rows.length < minGroupSize || gB.rows.length < minGroupSize) {
    return {
      ...base,
      status: 'insufficient',
      reason: 'group-too-small',
      n: observations.length,
      nA: gA.rows.length,
      nB: gB.rows.length,
      detail: `Groups need at least ${minGroupSize} people with pay recorded before a decomposition says anything. ${gA.label} has ${gA.rows.length}, ${gB.label} has ${gB.rows.length}.`,
    };
  }

  // Only the two compared groups enter the fit. A third reporting line would
  // otherwise be scored as if it belonged to the reference group.
  const sampleRows = observations.filter((obs) => gA.members.includes(obs.personId) || gB.members.includes(obs.personId));
  const design = decompositionDesign(sampleRows);
  if (design.labels.length + 2 > sampleRows.length) {
    return {
      ...base,
      status: 'insufficient',
      reason: 'not-enough-observations',
      n: sampleRows.length,
      nA: gA.rows.length,
      nB: gB.rows.length,
      detail: `With ${design.labels.length} controls, ${sampleRows.length} people cannot support the fit. Add pay records or drop a level from the comparison.`,
    };
  }

  const sample = sampleRows.map((row, index) => ({
    group: gA.members.includes(row.personId) ? gA.id : gB.id,
    y: row.y,
    x: design.matrix[index],
    personId: row.personId,
  }));
  const point = decompose(sample, design.labels);
  if (!point.ok) {
    return { ...base, status: 'insufficient', reason: point.reason, n: sampleRows.length, nA: gA.rows.length, nB: gB.rows.length };
  }

  // Inference on the adjusted gap.
  //
  // Resampling people is the wrong instrument at team scale. With eight people
  // per group a percentile bootstrap can draw a sample with nobody at one level,
  // the level coefficient becomes unidentified, and the interval ends up
  // measuring composition noise instead of uncertainty about the gap. So the
  // adjusted gap is estimated directly, as the coefficient on a group indicator
  // in the same regression — the standard pay-equity "adjusted gap" — and its
  // interval comes from its own standard error with a small-sample t multiplier.
  // The twofold decomposition above stays descriptive; this is the inferential
  // companion, and the two are printed side by side rather than conflated.
  const indicator = sample.map((observation) => (observation.group === gA.id ? 1 : 0));
  const adjustedFit = ols(sample.map((observation) => observation.y), sample.map((observation, index) => [...observation.x, indicator[index]]));
  let adjusted = null;
  if (adjustedFit.ok) {
    const last = adjustedFit.beta.length - 1;
    const coefficient = adjustedFit.beta[last];
    const se = adjustedFit.se[last];
    // 97.5% t quantile by the Cornish–Fisher expansion of the normal quantile;
    // at these degrees of freedom the exact table differs in the second decimal.
    const z = 1.959963984540054;
    const dof = Math.max(1, adjustedFit.dof);
    const t = z + ((z ** 3 + z) / (4 * dof)) + ((5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * dof ** 2));
    adjusted = {
      logPts: Math.round(coefficient * 1e6) / 1e6,
      seLogPts: Math.round(se * 1e6) / 1e6,
      lowLogPts: Math.round((coefficient - t * se) * 1e6) / 1e6,
      highLogPts: Math.round((coefficient + t * se) * 1e6) / 1e6,
      t: Math.round(t * 1000) / 1000,
      dof,
    };
  }

  const asPct = (logPts) => Math.round((Math.exp(logPts) - 1) * 1000) / 10;
  const ratio = Math.round((point.unexplained / (Math.abs(point.gap) || 1)) * 1000) / 10;

  return {
    ...base,
    status: 'ok',
    n: sampleRows.length,
    nA: gA.rows.length,
    nB: gB.rows.length,
    groupA: gA.label,
    groupB: gB.label,
    controls: design.labels,
    ridge: point.ridge,
    r2: point.r2 === null ? null : Math.round(point.r2 * 1000) / 1000,
    ratingMissing: design.ratingMissing,
    gapLogPts: Math.round(point.gap * 1e6) / 1e6,
    gapPct: asPct(point.gap),
    explainedLogPts: Math.round(point.explained * 1e6) / 1e6,
    explainedPct: asPct(point.explained),
    unexplainedLogPts: Math.round(point.unexplained * 1e6) / 1e6,
    unexplainedPct: asPct(point.unexplained),
    unexplainedSharePct: ratio,
    adjusted: adjusted
      ? {
        logPts: adjusted.logPts,
        pct: asPct(adjusted.logPts),
        standardErrorLogPts: adjusted.seLogPts,
        t: adjusted.t,
        dof: adjusted.dof,
      }
      : null,
    interval: adjusted
      ? {
        unexplainedLogPts: [adjusted.lowLogPts, adjusted.highLogPts],
        unexplainedPct: [asPct(adjusted.lowLogPts), asPct(adjusted.highLogPts)],
        method: 'adjusted-gap-t',
      }
      : { unexplainedLogPts: null, unexplainedPct: null, method: 'adjusted-gap-t' },
    // A flag fires only when the interval excludes zero AND the gap is material.
    // A wide interval that straddles zero is printed, not acted on.
    floorPct: options.flagPp ?? state?.settings?.compEquityFlagPp ?? 5,
    contributions: point.contributions,
  };
}

/* ------------------------------------------------------- adverse impact */

/**
 * Four-fifths rule on the merit decision itself.
 *
 * "Favourable" is an adjustment at or above the cohort median. The rule is a
 * screening heuristic from US employment-law practice, applied here to the
 * *distribution of a raise*, which is the decision a manager actually controls.
 */
export function adverseImpact(state, cycle, now = new Date(), plannedRows = null) {
  const rows = (plannedRows || compensationRows(state, cycle, now))
    .filter((row) => row.currentPay !== null);
  if (rows.length < 4) {
    return { status: 'insufficient', reason: 'too-few-rows', detail: 'At least four pay decisions are needed before a ratio means anything.' };
  }
  const adjustments = rows.map((row) => row.adjustPct ?? 0);
  const cut = median(adjustments);
  const groups = declareGroups(state, cycle, rows);
  const classified = groups
    .map((group) => {
      const members = rows.filter((row) => group.members.includes(row.personId));
      const favourable = members.filter((row) => (row.adjustPct ?? 0) >= cut).length;
      return {
        id: group.id,
        label: group.label,
        n: members.length,
        favourable,
        rate: members.length ? Math.round((favourable / members.length) * 1000) / 1000 : null,
        interval: wilson(favourable, members.length),
        meanAdjustPct: members.length ? round(mean(members.map((row) => row.adjustPct ?? 0)), 1) : null,
      };
    })
    .filter((group) => group.n > 0);
  const rates = classified.filter((group) => group.rate !== null);
  if (rates.length < 2) {
    return { status: 'insufficient', reason: 'single-group', detail: 'Only one group has pay decisions, so there is nothing to compare.', groups: classified, cut };
  }
  const max = Math.max(...rates.map((group) => group.rate));
  const min = Math.min(...rates.map((group) => group.rate));
  const ratio = max > 0 ? Math.round((min / max) * 1000) / 1000 : null;
  const threshold = state?.settings?.compAdverseImpactRatio ?? COMP_CONVENTIONS.adverseImpactRatio;
  const smallest = [...rates].sort((a, b) => a.n - b.n)[0];
  return {
    status: 'ok',
    cut: Math.round(cut * 10) / 10,
    groups: classified,
    ratio,
    threshold,
    flagged: ratio !== null && ratio < threshold,
    // The rule is a screen, and a screen on five people per group is noisy. The
    // interval is printed so a reader can see the width the ratio hides.
    reliable: smallest.n >= COMP_CONVENTIONS.minGroupSize,
    detail: ratio === null
      ? 'No favourable decisions were recorded, so no ratio can be computed.'
      : `Ratio ${ratio.toFixed(2)} against a ${threshold.toFixed(2)} screen${smallest.n < COMP_CONVENTIONS.minGroupSize ? `; the smaller group has only ${smallest.n} people, so this is a prompt to look, not a finding` : ''}.`,
  };
}

/* --------------------------------------------------------- retention model */

function logistic(z) {
  if (z > 40) return 1;
  if (z < -40) return 0;
  return 1 / (1 + Math.exp(-z));
}

/**
 * Departure probability, with every term exposed.
 *
 * The model is deliberately small and additive-in-logit. A manager can read the
 * four terms and disagree with one of them, which is the point: a black box
 * that says "23% flight risk" would be unfalsifiable and therefore useless in
 * the conversation where it matters.
 */
export function retentionRisk(row, peerMedian, conventions = COMP_CONVENTIONS) {
  const pay = row.proposedPay ?? row.currentPay;
  const band = row.band;
  // The compa-ratio is recomputed from the pay under test, never read from the
  // stored position: otherwise a proposed raise would not move the hazard and
  // the marginal-value optimiser would have nothing to optimise.
  const compa = positionPay(pay, band).compaRatio;
  const deficitPp = compa !== null && compa < 1
    ? Math.min(conventions.riskDeficitCapPp, (1 - compa) * 100)
    : 0;
  const peerDeficitPp = peerMedian && pay ? Math.min(conventions.riskPeerDeficitCapPp, Math.max(0, ((peerMedian - pay) / peerMedian) * 100)) : 0;
  const concern = row.retentionConcern ? 1 : 0;
  const z = conventions.riskBase
    + conventions.riskPerDeficitPp * deficitPp
    + conventions.riskPerPeerDeficitPp * peerDeficitPp
    + conventions.riskPerRecordedConcern * concern;
  const probability = clamp(logistic(z) * 100, conventions.riskFloorPct, conventions.riskCeilingPct);
  return {
    departurePct: Math.round(probability * 10) / 10,
    terms: {
      deficitPp: Math.round(deficitPp * 10) / 10,
      peerDeficitPp: Math.round(peerDeficitPp * 10) / 10,
      concern,
      band: band ? band.label || band.level : 'none',
    },
    z: Math.round(z * 1000) / 1000,
  };
}

function peerMedians(rows) {
  const out = new Map();
  for (const row of rows) {
    const peers = rows.filter((other) => other.level === row.level && other.personId !== row.personId && (other.proposedPay ?? other.currentPay) !== null);
    out.set(row.personId, peers.length ? median(peers.map((other) => other.proposedPay ?? other.currentPay)) : null);
  }
  return out;
}

function replacementCostFor(state, row, conventions = COMP_CONVENTIONS) {
  const multiplier = Number(state?.settings?.compReplacementMultiplier);
  const base = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : conventions.replacementMultiplier;
  const annual = (row.proposedPay ?? row.currentPay) || 0;
  const factor = row.criticality?.factor ?? 1;
  return {
    amount: money(annual * base * factor),
    multiplier: base,
    factor,
    basis: row.criticality?.basis || 'no succession seat recorded',
  };
}

/* -------------------------------------------------------- policy comparison */

function planMetrics(context, plan, rows) {
  const { budget, now } = context;
  const proposed = rows.map((row) => {
    const pct = plan.get(row.personId) ?? 0;
    const pay = row.currentPay === null ? null : money(row.currentPay * (1 + pct / 100));
    return { ...row, proposedPay: pay, adjustPct: row.currentPay === null ? null : Math.round(pct * 10) / 10 };
  });
  const withPay = proposed.filter((row) => row.currentPay !== null);
  const spend = withPay.reduce((acc, row) => acc + Math.max(0, (row.proposedPay || 0) - row.currentPay), 0);
  const adjustments = withPay.map((row) => row.adjustPct ?? 0);
  // The peer reference is the *current* cohort, passed in by the caller. Reading
  // it from the proposed figures would let every policy improve its own
  // baseline: pay everyone, and the peer median (and the perceived deficit)
  // moves with it, so the comparison would be circular.
  const medians = context.medians || peerMedians(rows);
  let before = 0;
  let after = 0;
  let retainedValue = 0;
  let replacementTotal = 0;
  for (const row of withPay) {
    // The baseline is always *current* pay. Reading a stored proposal here would
    // make the comparison depend on which policy had last been applied, so a
    // second look at the same cycle would silently price every policy against a
    // different starting point — and after applying a policy, every rival would
    // look like it bought nothing.
    const stored = rows.find((candidate) => candidate.personId === row.personId);
    const beforeRisk = retentionRisk({ ...stored, proposedPay: stored.currentPay }, medians.get(row.personId));
    const afterRisk = retentionRisk(row, medians.get(row.personId));
    const cost = replacementCostFor(context.state, row);
    before += beforeRisk.departurePct / 100;
    after += afterRisk.departurePct / 100;
    retainedValue += cost.amount * ((beforeRisk.departurePct - afterRisk.departurePct) / 100);
    replacementTotal += cost.amount;
  }
  const proposedCycle = {
    ...context.cycle,
    rows: proposed.map((row) => ({ ...row.row, proposedPay: row.proposedPay })),
  };
  const compression = compressionFindings(context.state, proposedCycle, now);
  const impact = adverseImpact(context.state, context.cycle, now, proposed);
  const bandViolations = withPay.filter((row) => row.band && row.proposedPay > row.band.max).length;
  return {
    plan: proposed.map((row) => ({
      personId: row.personId,
      name: row.name,
      currentPay: row.currentPay,
      proposedPay: row.proposedPay,
      adjustPct: row.adjustPct,
    })),
    spend: money(spend),
    usePct: budget.amount > 0 ? Math.round((spend / budget.amount) * 1000) / 10 : null,
    meanAdjustPct: adjustments.length ? round(mean(adjustments), 1) : null,
    minAdjustPct: adjustments.length ? round(Math.min(...adjustments), 1) : null,
    maxAdjustPct: adjustments.length ? round(Math.max(...adjustments), 1) : null,
    zeroAdjusted: adjustments.filter((value) => value <= 0).length,
    bandViolations,
    compressionCount: compression.length,
    impact,
    expectedDepartures: Math.round(after * 100) / 100,
    expectedDeparturesBefore: Math.round(before * 100) / 100,
    retainedValue: Math.round(retainedValue),
    replacementExposure: Math.round(replacementTotal),
    costPerRetainedPoint: (before - after) > 0.001 ? Math.round(spend / ((before - after) * 100)) : null,
  };
}

/**
 * Price three defensible policies against the same budget.
 *
 * The point is not that one policy is "correct". It is that an equal split and a
 * performance-weighted split have *knowable* consequences for who is likely to
 * leave, and a manager who can see those consequences makes a different
 * decision than one who cannot.
 */
export function policyComparison(state, cycle, now = new Date()) {
  const rows = compensationRows(state, cycle, now);
  const usable = rows.filter((row) => row.currentPay !== null);
  const budget = budgetFor(cycle, rows);
  if (!usable.length || budget.amount <= 0) {
    return { status: 'insufficient', reason: usable.length ? 'no-budget' : 'no-pay', budget, rows };
  }
  const conventions = COMP_CONVENTIONS;
  const maxPct = Number(state?.settings?.compMaxAdjustPct) || conventions.maxAdjustPct;
  const headroom = (row) => Math.max(0, Math.min(maxPct, row.band ? ((row.band.max / row.currentPay) - 1) * 100 : maxPct));
  const medians = peerMedians(rows);
  const context = { state, cycle, now, budget, medians };
  const policies = [];

  // 1. Across the board.
  {
    const rate = budget.payroll > 0 ? (budget.amount / budget.payroll) * 100 : 0;
    const plan = new Map(usable.map((row) => [row.personId, Math.min(rate, headroom(row))]));
    policies.push({ id: 'equal', ...COMP_POLICIES[0], ...planMetrics(context, plan, rows), rate: round(rate, 2) });
  }

  // 2. Performance-weighted, with an explicit fallback for missing reviews.
  {
    const weight = (row) => (row.rating ? 0.5 + 0.5 * row.rating.score : 1);
    const missing = usable.filter((row) => !row.rating).length;
    let low = 0;
    let high = 20;
    const build = (scale) => {
      const plan = new Map(usable.map((row) => [row.personId, Math.min(headroom(row), weight(row) * scale)]));
      const spend = usable.reduce((acc, row) => acc + Math.min(headroom(row), weight(row) * scale) / 100 * row.currentPay, 0);
      return { plan, spend };
    };
    for (let i = 0; i < 40; i += 1) {
      const mid = (low + high) / 2;
      if (build(mid).spend > budget.amount) high = mid;
      else low = mid;
    }
    const { plan } = build(low);
    policies.push({
      id: 'performance',
      ...COMP_POLICIES[1],
      ...planMetrics(context, plan, rows),
      rate: round(low, 2),
      missingRatings: missing,
    });
  }

  // 3. Marginal retention value: greedy increments, diminishing returns, band ceiling.
  {
    const plan = new Map(usable.map((row) => [row.personId, 0]));
    let remaining = budget.amount;
    const step = conventions.policyStepPct;
    for (let guard = 0; guard < 4000; guard += 1) {
      let best = null;
      for (const row of usable) {
        const current = plan.get(row.personId) ?? 0;
        const cap = headroom(row);
        if (current + step > cap + 1e-9) continue;
        const cost = (row.currentPay * step) / 100;
        if (cost > remaining) continue;
        const baseRisk = retentionRisk({ ...row, proposedPay: row.currentPay * (1 + current / 100) }, medians.get(row.personId));
        const nextRisk = retentionRisk({ ...row, proposedPay: row.currentPay * (1 + (current + step) / 100) }, medians.get(row.personId));
        const value = replacementCostFor(state, row).amount
          * ((baseRisk.departurePct - nextRisk.departurePct) / 100);
        const density = cost > 0 ? value / cost : 0;
        if (!best || density > best.density) best = { row, density, cost };
      }
      if (!best || best.density <= 0) break;
      plan.set(best.row.personId, (plan.get(best.row.personId) ?? 0) + step);
      remaining -= best.cost;
    }
    policies.push({ id: 'retention', ...COMP_POLICIES[2], ...planMetrics(context, plan, rows), remaining: money(remaining) });
  }

  const best = [...policies].sort((a, b) => b.retainedValue - a.retainedValue)[0];
  for (const policy of policies) {
    policy.regretValue = money(best.retainedValue - policy.retainedValue);
    policy.sameAsBest = policy.id === best.id;
  }
  return {
    status: 'ok',
    budget,
    rows,
    usable: usable.length,
    headroomNote: `No policy may push anyone above their band ceiling or past ${maxPct}%.`,
    policies,
    best: best.id,
    generatedFor: dayKey(now),
  };
}

/* ------------------------------------------------------------- full audit */

/** Everything the page, the rules, the CSV and the brief read, derived once. */
export function fairnessReading(state, cycle, now = new Date()) {
  const rows = compensationRows(state, cycle, now);
  const integrity = bandIntegrity(state, cycle, now);
  const compression = compressionFindings(state, cycle, now);
  const decomposition = oaxacaBlinder(state, cycle, now);
  const impact = adverseImpact(state, cycle, now);
  const budget = budgetFor(cycle, rows);
  const policies = policyComparison(state, cycle, now);
  const medians = peerMedians(rows);
  const exposures = rows.map((row) => {
    const risk = row.currentPay === null ? null : retentionRisk(row, medians.get(row.personId));
    const cost = replacementCostFor(state, row);
    return {
      personId: row.personId,
      name: row.name,
      departurePct: risk?.departurePct ?? null,
      terms: risk?.terms ?? null,
      replacementCost: cost.amount,
      criticalityBasis: cost.basis,
      allocatedPct: row.adjustPct,
      unaddressedHighRisk: (risk?.departurePct ?? 0) >= 25 && (row.adjustPct ?? 0) <= 0,
    };
  });
  const expectedDepartures = exposures.reduce((acc, row) => acc + (row.departurePct ?? 0) / 100, 0);

  const flags = [];
  if (integrity.counts.withoutPay > 0) {
    flags.push({ id: 'pay-missing', severity: 2, detail: `${integrity.counts.withoutPay} pay decision(s) have no current pay recorded, so no positioning or decomposition includes them.` });
  }
  if (integrity.counts.belowFloor > 0) {
    flags.push({ id: 'below-floor', severity: 3, detail: `${integrity.counts.belowFloor} person(s) sit below their band floor. A merit cycle cannot close a structural deficit; it can only disguise one.` });
  }
  if (integrity.counts.aboveCeiling > 0) {
    flags.push({ id: 'above-ceiling', severity: 2, detail: `${integrity.counts.aboveCeiling} person(s) sit above their band ceiling. Red-circling is a policy decision, not a merit outcome.` });
  }
  if (compression.length) {
    flags.push({ id: 'compression', severity: Math.max(...compression.map((f) => f.severity)), detail: `${compression.length} relative-pay finding(s) inside the reporting line.` });
  }
  if (impact.status === 'ok' && impact.flagged) {
    flags.push({ id: 'adverse-impact', severity: impact.reliable ? 4 : 3, detail: `Four-fifths screen triggered at ratio ${impact.ratio.toFixed(2)}.` });
  }
  if (decomposition.status === 'ok' && decomposition.interval.unexplainedPct
    && (decomposition.interval.unexplainedPct[0] > decomposition.floorPct || decomposition.interval.unexplainedPct[1] < -decomposition.floorPct)) {
    flags.push({ id: 'unexplained-gap', severity: 3, detail: `The unexplained gap's interval excludes zero at a material size (${decomposition.interval.unexplainedPct[0]}% to ${decomposition.interval.unexplainedPct[1]}%).` });
  }
  if (policies.status === 'ok' && policies.budget.amount > 0) {
    const spend = rows.reduce((acc, row) => acc + Math.max(0, (row.proposedPay || 0) - (row.currentPay || 0)), 0);
    if (spend > policies.budget.amount + 0.5) {
      flags.push({ id: 'over-budget', severity: 3, detail: `Proposed increases total ${Math.round(spend)} against a ${Math.round(policies.budget.amount)} budget.` });
    }
  }
  const unaddressed = exposures.filter((row) => row.unaddressedHighRisk);

  return {
    cycle,
    generatedFor: dayKey(now),
    rows,
    integrity,
    compression,
    decomposition,
    impact,
    budget,
    policies,
    exposures,
    expectedDepartures: Math.round(expectedDepartures * 100) / 100,
    replacementExposure: exposures.reduce((acc, row) => acc + (row.replacementCost || 0), 0),
    unaddressed,
    flags,
    spent: money(rows.reduce((acc, row) => acc + Math.max(0, (row.proposedPay || 0) - (row.currentPay || 0)), 0)),
  };
}

/* -------------------------------------------------------- self-scoring */

/**
 * Does the retention model know anything?
 *
 * Predictions are frozen at finalization and scored only when outcomes exist.
 * Brier against the observed base rate is the skill score: 0 is "no better than
 * always guessing the base rate", 1 is perfect. Departed and stayed are read
 * from the frozen window, never reconstructed after the fact.
 */
export function retentionCalibration(state, now = new Date()) {
  const cycles = (state?.meritCycles || []).filter((cycle) => cycle && cycle.status === 'finalized' && cycle.audit);
  const rows = [];
  for (const cycle of cycles) {
    const predictions = cycle.audit?.predictions || [];
    const outcomes = new Map((cycle.outcomes || []).map((outcome) => [outcome.personId, outcome]));
    for (const prediction of predictions) {
      const outcome = outcomes.get(prediction.personId);
      if (!outcome || outcome.departed === null) continue;
      const p = prediction.departurePct / 100;
      rows.push({
        cycleId: cycle.id,
        cycleLabel: cycle.label,
        personId: prediction.personId,
        predicted: p,
        observed: outcome.departed ? 1 : 0,
        allocatedPct: prediction.adjustPct,
        on: outcome.on,
      });
    }
  }
  const min = COMP_CONVENTIONS.minOutcomesForCalibration;
  if (rows.length < min) {
    return {
      status: 'insufficient',
      n: rows.length,
      required: min,
      detail: `The model has ${rows.length} resolved prediction(s). It grades itself at ${min}, so no skill claim is made yet.`,
      rows,
    };
  }
  const brier = mean(rows.map((row) => (row.predicted - row.observed) ** 2));
  const base = mean(rows.map((row) => row.observed));
  const baseBrier = mean(rows.map((row) => (base - row.observed) ** 2));
  const skill = baseBrier > 0 ? 1 - brier / baseBrier : null;
  const buckets = [
    { label: 'Under 10%', test: (p) => p < 0.1 },
    { label: '10–20%', test: (p) => p >= 0.1 && p < 0.2 },
    { label: '20–35%', test: (p) => p >= 0.2 && p < 0.35 },
    { label: '35% and above', test: (p) => p >= 0.35 },
  ].map((bucket) => {
    const members = rows.filter((row) => bucket.test(row.predicted));
    return {
      label: bucket.label,
      n: members.length,
      predicted: members.length ? round(mean(members.map((row) => row.predicted)) * 100, 1) : null,
      observed: members.length ? round(mean(members.map((row) => row.observed)) * 100, 1) : null,
    };
  }).filter((bucket) => bucket.n > 0);
  return {
    status: 'ok',
    n: rows.length,
    departed: rows.filter((row) => row.observed === 1).length,
    brier: Math.round(brier * 1000) / 1000,
    baseBrier: Math.round(baseBrier * 1000) / 1000,
    baseRatePct: round(base * 100, 1),
    skill: skill === null ? null : Math.round(skill * 1000) / 1000,
    buckets,
    rows,
    detail: skill === null
      ? 'Nobody in the scored set left, so the base-rate comparator has no variance and no skill score is defined.'
      : skill > 0
        ? `The model beats the base rate by ${Math.round(skill * 100)}% on ${rows.length} resolved predictions. That is a small sample and one team.`
        : `The model does not beat the base rate on ${rows.length} resolved predictions. The coefficients are a convention, and this is the evidence.`,
  };
}

/* --------------------------------------------------------------- signals */

export function compSignals(state, now = new Date()) {
  const out = [];
  const cycles = (state?.meritCycles || []).filter((cycle) => cycle && cycle.status !== 'abandoned');
  if (!cycles.length) return out;
  const draft = cycles.filter((cycle) => cycle.status === 'draft');
  for (const cycle of draft.slice(0, 3)) {
    const reading = fairnessReading(state, cycle, now);
    if (reading.integrity.counts.withoutPay > 0) {
      out.push({
        ruleId: 'MER-01',
        domain: 'Merit & pay equity',
        severity: 2,
        confidence: 'high',
        title: `“${cycle.label}” has ${reading.integrity.counts.withoutPay} pay decision(s) with no current pay`,
        detail: 'Without current pay there is no band position, no decomposition and no allocation — the cycle cannot be finalized honestly.',
        evidence: [reading.integrity.counts.withoutPay + ' row(s) missing current pay', `${reading.rows.length} row(s) in the cycle`],
        action: { label: 'Open the merit cycle', route: `#/merit?cycle=${encodeURIComponent(cycle.id)}` },
      });
    }
    if (reading.flags.some((flag) => flag.id === 'over-budget')) {
      out.push({
        ruleId: 'MER-02',
        domain: 'Merit & pay equity',
        severity: 3,
        confidence: 'high',
        title: `“${cycle.label}” proposes more than its budget`,
        detail: `Proposed increases total ${Math.round(reading.spent)} against a ${Math.round(reading.budget.amount)} budget.`,
        evidence: [`Budget ${Math.round(reading.budget.amount)}`, `Proposed ${Math.round(reading.spent)}`],
        action: { label: 'Compare policies', route: `#/merit?cycle=${encodeURIComponent(cycle.id)}` },
      });
    }
    if (reading.compression.length) {
      out.push({
        ruleId: 'MER-03',
        domain: 'Merit & pay equity',
        severity: 4,
        confidence: 'medium',
        title: `${reading.compression.length} relative-pay finding(s) inside “${cycle.label}”`,
        detail: reading.compression[0].detail,
        evidence: reading.compression.slice(0, 3).map((finding) => finding.detail),
        action: { label: 'Review the reporting line', route: `#/merit?cycle=${encodeURIComponent(cycle.id)}&panel=allocation` },
      });
    }
    if (reading.impact.status === 'ok' && reading.impact.flagged) {
      out.push({
        ruleId: 'MER-04',
        domain: 'Merit & pay equity',
        severity: reading.impact.reliable ? 4 : 3,
        confidence: reading.impact.reliable ? 'medium' : 'low',
        title: `Four-fifths screen triggered in “${cycle.label}” (ratio ${reading.impact.ratio.toFixed(2)})`,
        detail: reading.impact.detail,
        evidence: reading.impact.groups.map((group) => `${group.label}: ${group.favourable}/${group.n} at or above the median`),
        action: { label: 'Open the fairness audit', route: `#/merit?cycle=${encodeURIComponent(cycle.id)}&panel=fairness` },
      });
    }
    if (reading.decomposition.status === 'ok' && reading.decomposition.interval.unexplainedPct
      && reading.decomposition.interval.unexplainedPct[0] > reading.decomposition.floorPct) {
      out.push({
        ruleId: 'MER-05',
        domain: 'Merit & pay equity',
        severity: 3,
        confidence: 'medium',
        title: `Unexplained pay gap of ${reading.decomposition.interval.unexplainedPct[0]}–${reading.decomposition.interval.unexplainedPct[1]}% in “${cycle.label}”`,
        detail: `${reading.decomposition.groupA} vs ${reading.decomposition.groupB}, holding level, tenure and last rating constant. An unexplained gap is a question about the mechanism, not a verdict on a person.`,
        evidence: [`Gap ${reading.decomposition.gapPct}%`, `Explained ${reading.decomposition.explainedPct}%`, `${reading.decomposition.n} people with pay`],
        action: { label: 'Read the decomposition', route: `#/merit?cycle=${encodeURIComponent(cycle.id)}&panel=fairness` },
      });
    }
    if (reading.unaddressed.length) {
      out.push({
        ruleId: 'MER-06',
        domain: 'Merit & pay equity',
        severity: 4,
        confidence: 'low',
        title: `${reading.unaddressed.length} high-risk person(s) with no proposed increase`,
        detail: `The retention model puts ${reading.unaddressed.map((row) => row.name).slice(0, 3).join(', ')} at 25% or more likely to leave, and their proposed adjustment is zero. The model is a convention; the conversation it prompts is not.`,
        evidence: reading.unaddressed.slice(0, 3).map((row) => `${row.name}: ${row.departurePct}% modelled departure, replacement cost ${Math.round(row.replacementCost || 0)}`),
        action: { label: 'Open the retention view', route: `#/merit?cycle=${encodeURIComponent(cycle.id)}&panel=retention` },
      });
    }
  }
  const calibration = retentionCalibration(state, now);
  if (calibration.status === 'ok' && calibration.skill !== null && calibration.skill < 0) {
    out.push({
      ruleId: 'MER-07',
      domain: 'Merit & pay equity',
      severity: 2,
      confidence: 'low',
      title: 'The retention model is not beating the base rate',
      detail: calibration.detail,
      evidence: [`Brier ${calibration.brier} vs base ${calibration.baseBrier}`, `${calibration.n} resolved predictions`],
      action: { label: 'Read the calibration', route: '#/merit?panel=calibration' },
    });
  }
  return out;
}

/** Badge count for the shell: decision-shaped work only, never hygiene. */
export function meritAttention(state, now = new Date()) {
  return compSignals(state, now).filter((signal) => signal.severity >= 3).length;
}

/* ----------------------------------------------------------------- brief */

export function buildCompBrief(state, cycle, now = new Date()) {
  const reading = fairnessReading(state, cycle, now);
  const lines = [];
  lines.push(`# Merit cycle brief — ${cycle.label}`);
  lines.push('');
  lines.push(`Generated ${dayKey(now)} from the records in this workspace. Figures are model outputs from entered inputs, not market data.`);
  lines.push('');
  lines.push(`- Status: ${COMP_STATUS_LABELS[cycle.status] || cycle.status}`);
  lines.push(`- Effective: ${cycle.effectiveOn || 'not set'} · Currency: ${cycle.currency || 'USD'}`);
  lines.push(`- Budget: ${reading.budget.kind === 'pool-pct' ? `${reading.budget.value}% of payroll` : Math.round(reading.budget.amount)} (${reading.budget.pctOfPayroll ?? '—'}% of ${Math.round(reading.budget.payroll)} payroll)`);
  lines.push(`- Proposed: ${Math.round(reading.spent)} across ${reading.rows.length} pay decision(s)`);
  lines.push('');
  lines.push('## Band integrity');
  lines.push(`- ${reading.integrity.counts.insideBand} inside band · ${reading.integrity.counts.belowFloor} below floor · ${reading.integrity.counts.aboveCeiling} above ceiling · ${reading.integrity.counts.noBand} without a band`);
  for (const level of reading.integrity.levels) {
    lines.push(`- ${level.level}: ${level.people} people, mean compa-ratio ${level.meanCompa ?? '—'}${level.below ? `, ${level.below} below floor` : ''}`);
  }
  lines.push('');
  lines.push('## Fairness audit');
  if (reading.decomposition.status === 'ok') {
    const d = reading.decomposition;
    lines.push(`- ${d.groupA} vs ${d.groupB} (${d.n} people; ${d.nA} vs ${d.nB})`);
    lines.push(`- Raw gap ${d.gapPct}% · explained by level, tenure and last rating ${d.explainedPct}% · unexplained ${d.unexplainedPct}%`);
    if (d.interval.unexplainedPct) lines.push(`- Adjusted gap, 95% interval: ${d.interval.unexplainedPct[0]}% to ${d.interval.unexplainedPct[1]}% (t = ${d.adjusted?.t ?? '—'}, dof = ${d.adjusted?.dof ?? '—'}${d.ridge ? ', ridge fallback used' : ''})`);
    lines.push('- An unexplained gap is not proof of discrimination; omitted variables sit inside it.');
  } else {
    lines.push(`- Decomposition not run: ${reading.decomposition.detail || reading.decomposition.reason}`);
  }
  if (reading.impact.status === 'ok') {
    lines.push(`- Four-fifths screen: ratio ${reading.impact.ratio.toFixed(2)} (threshold ${reading.impact.threshold.toFixed(2)}), favourable = adjustment at or above the median of ${reading.impact.cut}%`);
    for (const group of reading.impact.groups) {
      lines.push(`  - ${group.label}: ${group.favourable}/${group.n} favourable, mean adjustment ${group.meanAdjustPct}%`);
    }
  } else {
    lines.push(`- Adverse impact not computed: ${reading.impact.detail}`);
  }
  lines.push('');
  lines.push('## Relative pay');
  if (!reading.compression.length) lines.push('- No compression or external-premium finding above tolerance.');
  for (const finding of reading.compression) lines.push(`- ${finding.detail} ${finding.advice}`);
  lines.push('');
  lines.push('## Retention exposure');
  lines.push(`- Expected departures at current proposals: ${reading.expectedDepartures} of ${reading.exposures.length}`);
  lines.push(`- Replacement exposure if all left: ${Math.round(reading.replacementExposure)}`);
  for (const row of [...reading.exposures].sort((a, b) => (b.departurePct ?? 0) - (a.departurePct ?? 0)).slice(0, 5)) {
    lines.push(`- ${row.name}: ${row.departurePct ?? '—'}% modelled departure, allocated ${row.allocatedPct ?? '—'}%, replacement ${Math.round(row.replacementCost || 0)} (${row.criticalityBasis})`);
  }
  lines.push('');
  lines.push('## Policy comparison');
  if (reading.policies.status === 'ok') {
    for (const policy of reading.policies.policies) {
      lines.push(`- ${policy.label}: spend ${Math.round(policy.spend)} (${policy.usePct ?? '—'}% of budget), mean ${policy.meanAdjustPct}%, expected departures ${policy.expectedDepartures}, retained value ${policy.retainedValue}, regret ${policy.regretValue}${policy.sameAsBest ? ' — best on retained value' : ''}`);
    }
    lines.push(`- ${reading.policies.headroomNote}`);
  } else {
    lines.push(`- Not computed: ${reading.policies.reason}`);
  }
  lines.push('');
  lines.push('## Model');
  lines.push(`- Departure probability: logistic(${COMP_CONVENTIONS.riskBase} + ${COMP_CONVENTIONS.riskPerDeficitPp}×compa-deficit-pp + ${COMP_CONVENTIONS.riskPerPeerDeficitPp}×peer-deficit-pp + ${COMP_CONVENTIONS.riskPerRecordedConcern} if a retention concern is recorded), clamped to ${COMP_CONVENTIONS.riskFloorPct}–${COMP_CONVENTIONS.riskCeilingPct}%.`);
  lines.push(`- Replacement cost: annual pay × ${Number(state?.settings?.compReplacementMultiplier) || COMP_CONVENTIONS.replacementMultiplier} × succession factor (${COMP_CONVENTIONS.criticalityEmptyBench} empty bench, ${COMP_CONVENTIONS.criticalityCoveredBench} covered).`);
  lines.push('- The coefficients are conventions, not fitted estimates. The calibration card scores them against what actually happened.');
  return lines.join('\n');
}
