/**
 * app/core/domain/pay.js — Pay Architecture, Pay-Equity Audit & Merit-Round
 * Simulation (Schema v51).
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * Every other screen in LeadOS models what a leader *decides*, *delegates* or
 * *observes*. None of them touch the single number that a first-time manager is
 * most likely to get wrong and least likely to be able to examine: what people
 * are actually paid, and whether the pattern of that pay is defensible under
 * controls they chose in advance.
 *
 * This is not a payroll system and it is not a salary benchmark feed. It is the
 * three analyses that a compensation committee runs, made available to someone
 * who has never run one:
 *
 *  1. ARCHITECTURE (economics of pay positioning). A band is a range with a
 *     minimum, a midpoint and a maximum; position within the range is the
 *     compa-ratio (pay ÷ midpoint) and range penetration ((pay − min) ÷
 *     (max − min)). Pay below the minimum is a structural defect — usually a
 *     forgotten correction, occasionally a documented exception. Pay above the
 *     maximum is red-circling: legitimate after a market move, corrosive when it
 *     is undocumented. Both are counted and priced, never silently tolerated.
 *
 *  2. EQUITY (labour economics + applied statistics). A raw pay gap is almost
 *     always the wrong number, because the two groups being compared are rarely
 *     in the same jobs at the same tenure. The audit therefore reports the raw
 *     difference *and* an OLS-adjusted difference in log pay with the controls
 *     the leader selected — level, role family and tenure — together with a
 *     classical 95% interval, the residual degrees of freedom and the R². The
 *     log specification makes the coefficient the (approximately) proportional
 *     gap, which is the quantity pay-transparency law is written in.
 *
 *     The adjusted coefficient is reported as *unexplained by the controls
 *     recorded here*. It is not a finding of discrimination, not a legal
 *     conclusion, and not a substitute for a job-evaluation study. Omitted
 *     variables (prior pay, negotiation, scarce-skill premia, performance,
 *     location) can move it in either direction, and the interval covers
 *     sampling noise only for this cohort — it is not a population inference.
 *
 *  3. FORWARD SIMULATION (public policy + incentive design). A merit matrix
 *     distributes an envelope by performance rating and position in range. It is
 *     the single most common way a defensible pay structure quietly re-widens a
 *     gap, because the people already below midpoint tend to be the people the
 *     matrix pays least to catch up. The simulator therefore re-runs the exact
 *     same adjusted model on the *projected* pay and prints the change, instead
 *     of letting the leader find out in eighteen months.
 *
 * REGULATORY ANCHOR (facts, not product claims)
 * ---------------------------------------------
 * Directive (EU) 2023/970 on pay transparency required transposition by
 * 7 June 2026. Two of its mechanics are directly modelled here: reporting the
 * proportion of each group in each pay quartile, and a *joint pay assessment*
 * trigger when a gap of at least 5% in a category of workers is not justified by
 * objective, gender-neutral criteria. The 5% figure is the Directive's; every
 * other threshold in this module is a stated management convention. Nothing here
 * establishes compliance with that or any other law, and this module cannot
 * perform a legally valid job evaluation — it records that one was done, who
 * attested it and when.
 *
 * HONESTY INVARIANTS
 * ------------------
 *  - Money is never converted between currencies. Every analysis is per currency
 *    cohort; mixed cohorts are refused, not averaged.
 *  - A missing pay record is missing, not zero. People without pay or without a
 *    matching band are counted as coverage gaps, never imputed.
 *  - An uncomputable model returns a status and a rendered reason. It never
 *    returns a plausible-looking number.
 *  - A committed merit round is a decision. It does not rewrite anyone's pay:
 *    a new assignment is recorded deliberately, with its own effective date.
 *  - No output of this module rates a person, ranks a person, or reports a gap
 *    for a category small enough that the number would identify an individual.
 *
 * Pure module: no DOM, no storage, no clock reads beyond the `now` argument.
 */

import { addDays, dayKey, daysBetween } from '../time.js';
import { LEVEL_LABELS, LEVELS, REVIEW_RATING_LABELS, REVIEW_RATINGS } from '../schema.js';

import {
  DEFAULT_MERIT_MATRIX,
  EUR_DIRECTIVE_JPA_GAP_PCT,
  MERIT_ROUND_STATUSES,
  PAY_AUDIT_STATUSES,
  PAY_CONTRAST_GROUPS,
  PAY_GROUP_BY_ID,
  PAY_GROUP_IDS,
  PAY_GROUPS,
  PAY_MAX_CONTROLS,
  PAY_MIN_COHORT,
  PAY_MIN_PER_GROUP,
  PAY_REASONS,
  PAY_REASON_IDS,
  PAY_SIGNAL_IDS,
  PAY_STALE_DAYS_DEFAULT,
} from './payVocabulary.js';

export {
  DEFAULT_MERIT_MATRIX,
  EUR_DIRECTIVE_JPA_GAP_PCT,
  MERIT_ROUND_STATUSES,
  PAY_AUDIT_STATUSES,
  PAY_CONTRAST_GROUPS,
  PAY_GROUP_BY_ID,
  PAY_GROUP_IDS,
  PAY_GROUPS,
  PAY_MAX_CONTROLS,
  PAY_MIN_COHORT,
  PAY_MIN_PER_GROUP,
  PAY_REASONS,
  PAY_REASON_IDS,
  PAY_SIGNAL_IDS,
  PAY_STALE_DAYS_DEFAULT,
};

/* --------------------------------------------------------------- utilities */

function num(value) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function round(value, places = 1) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export function levelLabel(level) {
  return LEVEL_LABELS[level] || level || 'Unclassified';
}

export function ratingLabel(rating) {
  return REVIEW_RATING_LABELS[rating] || 'No rating recorded';
}

/* ------------------------------------------------------- money & placement */

/**
 * The pay record in force on `onDay` for one person: the assignment with the
 * latest effective date that is not in the future. Ties are broken by the
 * recorded date and then the stored creation time, so the choice is
 * deterministic across reloads — never "whichever came first in the array".
 */
export function currentAssignment(state, personId, onDay) {
  const rows = (state?.payAssignments || []).filter(
    (row) => row && row.personId === personId && typeof row.effectiveFrom === 'string' && row.effectiveFrom <= onDay,
  );
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => {
    if (a.effectiveFrom !== b.effectiveFrom) return a.effectiveFrom < b.effectiveFrom ? 1 : -1;
    const ar = String(a.recordedOn || '');
    const br = String(b.recordedOn || '');
    if (ar !== br) return ar < br ? 1 : -1;
    return String(a.createdAt || '') < String(b.createdAt || '') ? 1 : -1;
  });
  return sorted[0];
}

/**
 * The band in force today for a role classification. Bands are *derived* from
 * family × level × currency rather than pointed at by each assignment, so a band
 * edit cannot silently leave a stale pointer on a person's pay record and a
 * person whose classification has no band is visibly unbanded instead of quietly
 * inheriting the wrong range.
 */
export function bandFor({ family, level, currency }, bands, onDay) {
  const candidates = (bands || []).filter(
    (band) =>
      band &&
      band.family === family &&
      band.level === level &&
      band.currency === currency &&
      typeof band.effectiveFrom === 'string' &&
      band.effectiveFrom <= onDay,
  );
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0];
}

/** Total target pay = base × (1 + variable target %). Actual payout is not recorded. */
export function totalTargetPay(assignment) {
  const base = num(assignment?.base);
  if (base === null || base <= 0) return null;
  const variable = num(assignment?.variableTargetPct) ?? 0;
  return round(base * (1 + Math.min(100, Math.max(0, variable)) / 100), 2);
}

export function placementOf(assignment, band) {
  const pay = totalTargetPay(assignment);
  if (pay === null) return null;
  if (!band) {
    return {
      status: 'unbanded',
      pay,
      compaRatio: null,
      rangePenetration: null,
      bandId: null,
      reason: 'No band is declared for this role family, level and currency, so position in range cannot be read.',
    };
  }
  const min = num(band.min);
  const mid = num(band.mid);
  const max = num(band.max);
  if (min === null || mid === null || max === null || mid <= 0 || max <= min) {
    return {
      status: 'invalid-band',
      pay,
      compaRatio: null,
      rangePenetration: null,
      bandId: band.id,
      reason: 'The declared band is not a valid range (minimum < midpoint < maximum), so no position is computed.',
    };
  }
  const compaRatio = pay / mid;
  const penetration = (pay - min) / (max - min);
  const status = pay < min ? 'below-min' : pay > max ? 'above-max' : 'in-band';
  return {
    status,
    pay,
    compaRatio: round(compaRatio, 3),
    rangePenetration: round(penetration, 3),
    bandId: band.id,
    band: { min, mid, max, currency: band.currency },
    reason: status === 'below-min'
      ? 'Total target pay is below the declared band minimum.'
      : status === 'above-max'
        ? 'Total target pay is above the declared band maximum (red-circled).'
        : 'Inside the declared range.',
  };
}

/**
 * The whole architecture as a read model. Every person on the active roster is
 * listed whether or not they have pay, so the coverage gap is a row rather than
 * an absence the leader has to notice.
 */
export function payArchitecture(state, now = new Date()) {
  const today = dayKey(now);
  const staleDays = num(state?.settings?.payStaleDays) ?? PAY_STALE_DAYS_DEFAULT;
  const bands = Array.isArray(state?.payBands) ? state.payBands.filter(Boolean) : [];
  const people = (Array.isArray(state?.people) ? state.people : []).filter(
    (person) => person && person.status !== 'archived' && person.name,
  );

  const rows = people.map((person) => {
    const assignment = currentAssignment(state, person.id, today);
    const band = assignment ? bandFor(assignment, bands, today) : null;
    const placement = assignment ? placementOf(assignment, band) : null;
    const ageDays = assignment ? daysBetween(assignment.effectiveFrom, today) : null;
    return {
      person,
      assignment,
      band,
      placement,
      ageDays,
      stale: ageDays !== null && ageDays > staleDays,
      group: PAY_GROUP_BY_ID[person.equalPayGroup] ? person.equalPayGroup : 'unrecorded',
      family: assignment?.family || '',
      level: assignment?.level || person.level || '',
      currency: assignment?.currency || '',
    };
  });

  const paid = rows.filter((row) => row.placement);
  const unbanded = paid.filter((row) => row.placement.status === 'unbanded' || row.placement.status === 'invalid-band');
  const belowMin = paid.filter((row) => row.placement.status === 'below-min');
  const aboveMax = paid.filter((row) => row.placement.status === 'above-max');
  const stale = paid.filter((row) => row.stale);
  const noPay = rows.filter((row) => !row.assignment);
  const noGroup = paid.filter((row) => row.group === 'unrecorded' || row.group === 'undisclosed');

  const byCurrency = {};
  for (const row of paid) {
    const currency = row.currency || 'unspecified';
    const bucket = byCurrency[currency] || (byCurrency[currency] = {
      currency,
      headcount: 0,
      payroll: 0,
      midpointPayroll: 0,
      costToMidpoint: 0,
      banded: 0,
      belowMin: 0,
      aboveMax: 0,
      stale: 0,
      medianCompa: null,
      compaRatios: [],
    });
    bucket.headcount += 1;
    bucket.payroll += row.placement.pay;
    if (row.band) {
      bucket.banded += 1;
      bucket.midpointPayroll += num(row.band.mid) || 0;
      bucket.costToMidpoint += Math.max(0, (num(row.band.mid) || 0) - row.placement.pay);
    }
    if (row.placement.status === 'below-min') bucket.belowMin += 1;
    if (row.placement.status === 'above-max') bucket.aboveMax += 1;
    if (row.stale) bucket.stale += 1;
    if (row.placement.compaRatio !== null) bucket.compaRatios.push(row.placement.compaRatio);
  }
  for (const bucket of Object.values(byCurrency)) {
    const sorted = [...bucket.compaRatios].sort((a, b) => a - b);
    bucket.medianCompa = sorted.length
      ? sorted.length % 2
        ? sorted[(sorted.length - 1) / 2]
        : round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2, 3)
      : null;
    bucket.payroll = round(bucket.payroll, 2);
    bucket.midpointPayroll = round(bucket.midpointPayroll, 2);
    bucket.costToMidpoint = round(bucket.costToMidpoint, 2);
    delete bucket.compaRatios;
  }

  const families = [...new Set(bands.map((band) => band.family).filter(Boolean))].sort();
  const bandGaps = [];
  for (const family of families) {
    for (const level of LEVELS) {
      const declared = bands.filter((band) => band.family === family && band.level === level);
      const staffed = paid.filter((row) => row.family === family && row.level === level);
      if (staffed.length && !declared.length) {
        bandGaps.push({
          family,
          level,
          headcount: staffed.length,
          reason: 'People are classified into this family and level, but no band is declared for it.',
        });
      }
    }
  }

  return {
    today,
    rows,
    paid,
    bands,
    byCurrency,
    counts: {
      people: rows.length,
      paid: paid.length,
      noPay: noPay.length,
      unbanded: unbanded.length,
      belowMin: belowMin.length,
      aboveMax: aboveMax.length,
      stale: stale.length,
      noGroup: noGroup.length,
      bands: bands.length,
      families: families.length,
    },
    currencies: Object.keys(byCurrency).sort(),
    issues: { unbanded, belowMin, aboveMax, stale, noPay, noGroup },
    bandGaps,
    staleDays,
    coverageComplete: rows.length > 0 && noPay.length === 0 && unbanded.length === 0,
  };
}

/* ------------------------------------------------------------- the OLS core */

function zeros(n) {
  return new Array(n).fill(0);
}

/**
 * Least squares via the normal equations with partial pivoting, plus an explicit
 * rank test. The rank test is the part that matters: a control set that
 * perfectly separates the two groups (every woman in one job family, every man in
 * another) is singular, and a solver that silently returns huge coefficients from
 * a near-singular matrix is how a pay-gap tool produces a defamatory number.
 * When the pivot is too small, we say so instead.
 */
function leastSquares(columns, y) {
  const n = y.length;
  const k = columns.length;
  if (!n || !k || columns.some((column) => column.length !== n)) {
    return { ok: false, reason: 'shape' };
  }
  const xtx = Array.from({ length: k }, () => zeros(k));
  const xty = zeros(k);
  for (let i = 0; i < n; i += 1) {
    for (let a = 0; a < k; a += 1) {
      const xa = columns[a][i];
      xty[a] += xa * y[i];
      for (let b = a; b < k; b += 1) xtx[a][b] += xa * columns[b][i];
    }
  }
  for (let a = 0; a < k; a += 1) for (let b = 0; b < a; b += 1) xtx[a][b] = xtx[b][a];

  const scale = Math.max(1, ...xtx.map((row, i) => Math.abs(row[i])));
  const aug = xtx.map((row, i) => [...row, xty[i]]);
  const rankThreshold = scale * 1e-9;
  for (let col = 0; col < k; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < k; row += 1) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[pivot][col])) pivot = row;
    }
    if (Math.abs(aug[pivot][col]) <= rankThreshold) return { ok: false, reason: 'singular', at: col };
    if (pivot !== col) {
      const swap = aug[col];
      aug[col] = aug[pivot];
      aug[pivot] = swap;
    }
    const divisor = aug[col][col];
    for (let c = col; c <= k; c += 1) aug[col][c] /= divisor;
    for (let row = 0; row < k; row += 1) {
      if (row === col) continue;
      const factor = aug[row][col];
      if (!factor) continue;
      for (let c = col; c <= k; c += 1) aug[row][c] -= factor * aug[col][c];
    }
  }
  const beta = aug.map((row) => row[k]);

  // Inverse of X'X from the same elimination, needed for standard errors.
  const identity = Array.from({ length: k }, (_, i) => zeros(k).map((_, j) => (i === j ? 1 : 0)));
  const inv = Array.from({ length: k }, () => zeros(k));
  const work = xtx.map((row) => [...row]);
  const invWork = identity.map((row) => [...row]);
  for (let col = 0; col < k; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < k; row += 1) {
      if (Math.abs(work[row][col]) > Math.abs(work[pivot][col])) pivot = row;
    }
    if (Math.abs(work[pivot][col]) <= rankThreshold) return { ok: false, reason: 'singular', at: col };
    if (pivot !== col) {
      [work[col], work[pivot]] = [work[pivot], work[col]];
      [invWork[col], invWork[pivot]] = [invWork[pivot], invWork[col]];
    }
    const divisor = work[col][col];
    for (let c = 0; c < k; c += 1) {
      work[col][c] /= divisor;
      invWork[col][c] /= divisor;
    }
    for (let row = 0; row < k; row += 1) {
      if (row === col) continue;
      const factor = work[row][col];
      if (!factor) continue;
      for (let c = 0; c < k; c += 1) {
        work[row][c] -= factor * work[col][c];
        invWork[row][c] -= factor * invWork[col][c];
      }
    }
  }
  for (let a = 0; a < k; a += 1) for (let b = 0; b < k; b += 1) inv[a][b] = invWork[a][b];

  let rss = 0;
  let tss = 0;
  const mean = y.reduce((sum, v) => sum + v, 0) / n;
  for (let i = 0; i < n; i += 1) {
    let fit = 0;
    for (let a = 0; a < k; a += 1) fit += beta[a] * columns[a][i];
    rss += (y[i] - fit) ** 2;
    tss += (y[i] - mean) ** 2;
  }
  return {
    ok: true,
    beta,
    inv,
    rss,
    tss,
    n,
    k,
    df: n - k,
    r2: tss > 0 ? 1 - rss / tss : null,
  };
}

/* Student-t distribution: regularized incomplete beta + bisection quantile. */

function gammaln(x) {
  const cof = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j += 1) {
    y += 1;
    ser += cof[j] / y;
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

function betacf(a, b, x) {
  const MAXIT = 200;
  const EPS = 3e-12;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

function betaInc(a, b, x) {
  if (!(x > 0)) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(gammaln(a + b) - gammaln(a) - gammaln(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** P(T ≤ t) for Student's t with `df` degrees of freedom. */
export function studentTCdf(t, df) {
  if (!Number.isFinite(t) || !Number.isFinite(df) || df <= 0) return null;
  const x = df / (df + t * t);
  const tail = 0.5 * betaInc(df / 2, 0.5, x);
  return t > 0 ? 1 - tail : tail;
}

/** Two-sided p-value for an observed t statistic. */
export function studentTPValue(t, df) {
  const cdf = studentTCdf(t, df);
  if (cdf === null) return null;
  return Math.min(1, 2 * Math.min(cdf, 1 - cdf));
}

/** Quantile by bisection on the CDF — deterministic, monotone, no table. */
export function studentTQuantile(p, df) {
  if (!(p > 0) || !(p < 1) || !(df > 0)) return null;
  let low = -80;
  let high = 80;
  for (let i = 0; i < 200; i += 1) {
    const mid = (low + high) / 2;
    const cdf = studentTCdf(mid, df);
    if (cdf === null) return null;
    if (cdf < p) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/* ----------------------------------------------------------- gap modelling */

function groupLabel(id) {
  return PAY_GROUP_BY_ID[id]?.label || id;
}

/**
 * Build the cohort the audit is allowed to use: active people, with a current pay
 * record in the requested currency, with a recorded contrast group, and with a
 * role classification. Every exclusion is counted with its reason so the audit
 * can never quietly shrink its own denominator.
 */
export function buildCohort(state, options = {}, now = new Date()) {
  const today = dayKey(now);
  const currency = String(options.currency || '').trim();
  const groupA = PAY_CONTRAST_GROUPS.includes(options.groupA) ? options.groupA : 'woman';
  const groupB = PAY_CONTRAST_GROUPS.includes(options.groupB) ? options.groupB : 'man';
  const excluded = { noPay: 0, otherCurrency: 0, noGroup: 0, undisclosed: 0, otherGroup: 0, noClassification: 0, noBand: 0 };
  const included = [];

  for (const person of (state?.people || [])) {
    if (!person || person.status === 'archived' || !person.name) continue;
    const assignment = currentAssignment(state, person.id, today);
    if (!assignment) { excluded.noPay += 1; continue; }
    if (currency && assignment.currency !== currency) { excluded.otherCurrency += 1; continue; }
    const group = PAY_GROUP_BY_ID[person.equalPayGroup] ? person.equalPayGroup : 'unrecorded';
    if (group === 'unrecorded') { excluded.noGroup += 1; continue; }
    if (group === 'undisclosed') { excluded.undisclosed += 1; continue; }
    if (group !== groupA && group !== groupB) { excluded.otherGroup += 1; continue; }
    const pay = totalTargetPay(assignment);
    if (pay === null || pay <= 0) { excluded.noPay += 1; continue; }
    const tenureYears = person.startDate ? Math.max(0, (daysBetween(person.startDate, today) ?? 0) / 365.25) : null;
    included.push({
      person,
      personId: person.id,
      assignment,
      group,
      pay,
      logPay: Math.log(pay),
      level: assignment.level || person.level || '',
      family: assignment.family || '',
      tenureYears,
    });
  }
  const missingTenure = included.filter((row) => row.tenureYears === null).length;
  return {
    currency: currency || (included[0]?.assignment.currency ?? ''),
    groupA,
    groupB,
    groupALabel: groupLabel(groupA),
    groupBLabel: groupLabel(groupB),
    rows: included,
    excluded,
    missingTenure,
    today,
  };
}

function levelsIn(rows) {
  return [...new Set(rows.map((row) => row.level).filter(Boolean))].sort();
}

function familiesIn(rows) {
  return [...new Set(rows.map((row) => row.family).filter(Boolean))].sort();
}

/**
 * Fit ln(pay) = a + b·group + controls. `controls` is a subset of
 * ['level', 'family', 'tenure']; each control consumes degrees of freedom and the
 * caller is told exactly what was used.
 */
function fitGap(rows, groupA, controls) {
  const useLevel = controls.includes('level');
  const useFamily = controls.includes('family');
  const useTenure = controls.includes('tenure') && rows.every((row) => row.tenureYears !== null);
  const columns = [rows.map(() => 1), rows.map((row) => (row.group === groupA ? 1 : 0))];
  const names = ['intercept', 'group'];
  const controlNotes = [];

  if (useLevel) {
    const present = levelsIn(rows);
    const reference = present[0];
    for (const level of present.slice(1)) {
      columns.push(rows.map((row) => (row.level === level ? 1 : 0)));
      names.push(`level:${level}`);
    }
    controlNotes.push(`level (reference: ${levelLabel(reference)})`);
  }
  if (useFamily) {
    const present = familiesIn(rows);
    if (present.length > 1) {
      const reference = present[0];
      for (const family of present.slice(1)) {
        columns.push(rows.map((row) => (row.family === family ? 1 : 0)));
        names.push(`family:${family}`);
      }
      controlNotes.push(`role family (reference: ${reference})`);
    } else {
      controlNotes.push('role family (only one family present, so it explains nothing)');
    }
  }
  if (useTenure) {
    columns.push(rows.map((row) => row.tenureYears));
    names.push('tenureYears');
    controlNotes.push('tenure in years');
  }

  const y = rows.map((row) => row.logPay);
  const fit = leastSquares(columns, y);
  if (!fit.ok) return { ok: false, reason: fit.reason, names, controlsUsed: controlNotes };
  if (fit.df < 3) return { ok: false, reason: 'degrees-of-freedom', names, controlsUsed: controlNotes, df: fit.df };

  const sigma2 = fit.rss / fit.df;
  const se = Math.sqrt(Math.max(0, sigma2 * fit.inv[1][1]));
  const beta = fit.beta[1];
  const t = se > 0 ? beta / se : null;
  const df = fit.df;
  const tCrit = studentTQuantile(0.975, df);
  return {
    ok: true,
    beta,
    se,
    t,
    df,
    n: fit.n,
    k: fit.k,
    r2: fit.r2,
    pValue: t === null ? null : studentTPValue(t, df),
    ci: tCrit === null || !Number.isFinite(se)
      ? null
      : { low: beta - tCrit * se, high: beta + tCrit * se, level: 0.95 },
    names,
    controlsUsed: controlNotes,
    predicted: rows.map((_, index) => {
      let value = 0;
      for (let a = 0; a < fit.beta.length; a += 1) value += fit.beta[a] * columns[a][index];
      return value;
    }),
  };
}

function toPct(beta) {
  if (!Number.isFinite(beta)) return null;
  return round((Math.exp(beta) - 1) * 100, 2);
}

/**
 * The full equity audit. Returns a status plus, when the model can be fitted, the
 * raw and adjusted gaps with an interval. `controlsUsed` and `droppedBecause` are
 * always present so a reader knows whether "adjusted" means what they think.
 */
export function payGapAudit(state, options = {}, now = new Date()) {
  return auditCohort(buildCohort(state, options, now), {
    ...options,
    settings: state?.settings || {},
  }, now);
}

/**
 * The modelling half of the audit, separated so the same code can be run over an
 * injected cohort. The worked example uses exactly this function: a demonstration
 * that used a second implementation would prove nothing about the first.
 */
export function auditCohort(cohort, options = {}, now = new Date()) {
  const trigger = num(options.triggerPct)
    ?? num(options.settings?.payGapTriggerPct)
    ?? EUR_DIRECTIVE_JPA_GAP_PCT;
  const requested = {
    level: options.controls?.level !== false,
    family: options.controls?.family !== false,
    tenure: options.controls?.tenure !== false,
  };
  const base = {
    status: 'insufficient',
    asOf: cohort.today,
    currency: cohort.currency,
    groupA: cohort.groupA,
    groupB: cohort.groupB,
    groupALabel: cohort.groupALabel,
    groupBLabel: cohort.groupBLabel,
    triggerPct: trigger,
    requestedControls: requested,
    controlsUsed: [],
    droppedBecause: null,
    excluded: cohort.excluded,
    n: cohort.rows.length,
    nA: cohort.rows.filter((row) => row.group === cohort.groupA).length,
    nB: cohort.rows.filter((row) => row.group === cohort.groupB).length,
    notes: [],
  };

  if (!cohort.rows.length) {
    return { ...base, reason: 'No person has both a current pay record in this currency and a recorded contrast group, so there is nothing to compare.' };
  }
  // Counts live on `base` (they were computed from the cohort above); reading
  // them from the cohort object would compare `undefined` to a number and let a
  // one-person group through, which is the exact failure this guard exists for.
  if (base.nA < PAY_MIN_PER_GROUP || base.nB < PAY_MIN_PER_GROUP) {
    return {
      ...base,
      reason: `Each group needs at least ${PAY_MIN_PER_GROUP} people with pay recorded in this currency (found ${base.nA} and ${base.nB}). Below that, a group mean describes nobody in particular and could point at an individual.`,
    };
  }
  if (cohort.rows.length < PAY_MIN_COHORT) {
    return {
      ...base,
      reason: `At least ${PAY_MIN_COHORT} comparable people are required for a modelled gap (found ${cohort.rows.length}). With fewer, the interval would be wider than any difference it could detect.`,
    };
  }

  const rowsA = cohort.rows.filter((r) => r.group === cohort.groupA);
  const rowsB = cohort.rows.filter((r) => r.group === cohort.groupB);
  const meanA = rowsA.reduce((s, r) => s + r.logPay, 0) / rowsA.length;
  const meanB = rowsB.reduce((s, r) => s + r.logPay, 0) / rowsB.length;
  const rawGapPct = toPct(meanA - meanB);

  const attempts = [];
  const ladder = [];
  if (requested.tenure && cohort.missingTenure) {
    base.notes.push(`${cohort.missingTenure} person(s) have no start date, so tenure could not be used as a control even though it was requested.`);
  }
  const full = [];
  if (requested.level) full.push('level');
  if (requested.family) full.push('family');
  if (requested.tenure && cohort.missingTenure === 0) full.push('tenure');
  ladder.push(full);
  if (full.includes('family')) ladder.push(full.filter((c) => c !== 'family'));
  if (full.includes('tenure')) ladder.push(full.filter((c) => c !== 'tenure'));
  if (full.length) ladder.push([]);

  let fit = null;
  let controlsUsed = [];
  let droppedBecause = null;
  let firstReason = null;
  for (let i = 0; i < ladder.length; i += 1) {
    const controls = ladder[i];
    const attempt = fitGap(cohort.rows, cohort.groupA, controls);
    attempts.push({ controls, ok: attempt.ok, reason: attempt.reason || null, df: attempt.df ?? null });
    if (attempt.ok) {
      fit = attempt;
      controlsUsed = controls;
      if (i > 0) {
        droppedBecause = firstReason === 'singular'
          ? 'The requested controls perfectly separate the two groups, so the adjusted model is not identified. The controls listed below are what could actually be estimated.'
          : firstReason === 'degrees-of-freedom'
            ? 'The requested controls left too few residual degrees of freedom to estimate a variance. The controls listed below are what could actually be estimated.'
            : 'A control could not be estimated on this cohort, so the model fell back to the controls listed below.';
      }
      break;
    }
    if (!firstReason) firstReason = attempt.reason;
    if (attempt.reason === 'shape') break;
  }

  if (!fit) {
    return {
      ...base,
      attempts,
      rawGapPct,
      reason: firstReason === 'singular'
        ? 'The two groups do not overlap in the recorded role levels or families, so no adjusted comparison is estimable. That separation is itself worth reading: it means the comparison is happening across different jobs.'
        : 'No model could be fitted on this cohort — there are too few residual degrees of freedom once the requested controls are included. Reduce the controls or record more comparable pay.',
    };
  }

  /* Quartiles — the share of each group in each quarter of the pay distribution. */
  const sortedRows = [...cohort.rows].sort((a, b) => a.pay - b.pay);
  const quartiles = [0, 1, 2, 3].map((index) => {
    const start = Math.floor((index * sortedRows.length) / 4);
    const end = Math.floor(((index + 1) * sortedRows.length) / 4);
    const slice = sortedRows.slice(start, end);
    const countA = slice.filter((row) => row.group === cohort.groupA).length;
    return {
      quartile: index + 1,
      label: `Q${index + 1}${index === 0 ? ' (lowest pay)' : index === 3 ? ' (highest pay)' : ''}`,
      headcount: slice.length,
      countA,
      countB: slice.length - countA,
      shareAPct: slice.length ? round((countA / slice.length) * 100, 1) : null,
      shareBPct: slice.length ? round(((slice.length - countA) / slice.length) * 100, 1) : null,
      min: slice.length ? slice[0].pay : null,
      max: slice.length ? slice[slice.length - 1].pay : null,
    };
  });

  /* Categories (the Directive's "category of workers"), approximated by job level. */
  const categories = levelsIn(cohort.rows).map((level) => {
    const rows = cohort.rows.filter((row) => row.level === level);
    const a = rows.filter((row) => row.group === cohort.groupA);
    const b = rows.filter((row) => row.group === cohort.groupB);
    const meanLevelA = a.length ? a.reduce((s, r) => s + r.logPay, 0) / a.length : null;
    const meanLevelB = b.length ? b.reduce((s, r) => s + r.logPay, 0) / b.length : null;
    const estimable = a.length >= 2 && b.length >= 2;
    const gapPct = estimable ? toPct(meanLevelA - meanLevelB) : null;
    const requiresAssessment = estimable && gapPct !== null && Math.abs(gapPct) >= trigger;
    return {
      level,
      label: levelLabel(level),
      nA: a.length,
      nB: b.length,
      total: rows.length,
      gapPct,
      estimable,
      requiresAssessment,
      reason: estimable
        ? null
        : 'Fewer than two people from each group sit at this level, so no category gap is published — it would describe individuals.',
    };
  });

  const flaggedCategories = categories.filter((row) => row.requiresAssessment);
  const ciPct = fit.ci ? { low: toPct(fit.ci.low), high: toPct(fit.ci.high), level: 0.95 } : null;
  const significant = ciPct !== null && (ciPct.low > 0 || ciPct.high < 0);

  return {
    ...base,
    status: 'ok',
    attempts,
    droppedBecause,
    controlsUsed,
    controlLabels: fit.controlsUsed,
    n: cohort.rows.length,
    df: fit.df,
    k: fit.k,
    r2: fit.r2 === null ? null : round(fit.r2, 3),
    rawGapPct,
    rawFavours: rawGapPct === 0 ? 'equal' : rawGapPct > 0 ? cohort.groupA : cohort.groupB,
    adjustedGapPct: toPct(fit.beta),
    adjustedCiPct: ciPct,
    pValue: fit.pValue === null ? null : round(fit.pValue, 3),
    significant,
    meetsThreshold: Math.abs(toPct(fit.beta) ?? 0) >= trigger,
    quartiles,
    categories,
    flaggedCategories,
    requiresJointAssessment: flaggedCategories.length > 0,
    means: {
      groupA: round(Math.exp(meanA), 2),
      groupB: round(Math.exp(meanB), 2),
      overall: round(Math.exp(cohort.rows.reduce((s, r) => s + r.logPay, 0) / cohort.rows.length), 2),
    },
    notes: [
      ...base.notes,
      'The adjusted figure is the difference unexplained by the controls recorded here. It is not a finding of discrimination, and omitted variables (prior pay, negotiation, scarce skills, location) can move it either way.',
      'The interval covers sampling noise for this cohort only; it is not a population inference and it assumes the pay records are accurate.',
      'A joint pay assessment compares work of equal value, which requires a job-evaluation study. This screen publishes level-level differences and records that the study was done — it does not perform one.',
    ],
    cohort,
  };
}

/* ---------------------------------------------------------- remediation */

/**
 * Re-fit the same design matrix on a set of projected rows.
 *
 * Exported because two callers need precisely this and neither may use a second
 * implementation: the merit-round rule projects a committed matrix forward, and
 * the remediation planner prices a correction. A projection computed with a
 * *different* model than the audit would look comparable and would not be.
 */
export function refitGapPct(rows, groupA, controls) {
  const fit = fitGap(rows, groupA, controls || []);
  if (!fit.ok) return { ok: false, reason: fit.reason };
  return { ok: true, gapPct: toPct(fit.beta), df: fit.df };
}

/**
 * Price the ways to bring the adjusted difference under the threshold.
 *
 * The uniform option has a closed form, and it is worth stating why rather than
 * iterating: the model is linear in log pay with a single group indicator, so a
 * uniform proportional correction applied only to group A shifts the coefficient
 * by exactly ln(1 + p) and nothing else. That makes the required p exact under
 * the fitted model rather than an approximation — and the result is still only as
 * good as the specification, which the caveat says out loud.
 *
 * Every option is re-fitted before its projected gap is reported. Nothing here is
 * a legal remediation plan, an approved budget, or a decision: it is the price of
 * three designs so the trade-off can be argued with numbers instead of adjectives.
 */
export function remediationOptions(state, audit, now = new Date()) {
  if (!audit || audit.status !== 'ok' || !audit.cohort) {
    return { status: 'unavailable', reason: 'A fitted audit is required before a correction can be priced.' };
  }
  const rows = audit.cohort.rows;
  const groupA = audit.groupA;
  const controls = audit.controlsUsed || [];
  const trigger = audit.triggerPct;
  const current = audit.adjustedGapPct;
  const currency = audit.currency;
  const options = [];

  const project = (label, note, transform) => {
    const projected = rows.map((row) => {
      const pay = transform(row);
      return { ...row, pay, logPay: Math.log(pay) };
    });
    const refit = refitGapPct(projected, groupA, controls);
    const cost = projected.reduce((sum, row, index) => sum + (row.pay - rows[index].pay), 0);
    return {
      label,
      note,
      cost: round(cost, 2),
      currency,
      projectedGapPct: refit.ok ? refit.gapPct : null,
      meetsThreshold: refit.ok ? Math.abs(refit.gapPct) < trigger : null,
      estimable: refit.ok,
      reason: refit.ok ? null : 'The corrected cohort cannot be re-fitted, so its projected difference is not published.',
    };
  };

  if (current !== null && current < 0) {
    // Group A is the lower-paid group: the correction is a lift on A.
    const needed = Math.exp(-trigger / 100 - Math.log(1 + current / 100)) - 1;
    if (needed > 0) {
      options.push(project(
        `Uniform ${(needed * 100).toFixed(1)}% correction to ${audit.groupALabel}`,
        'One percentage applied to everyone in the lower-paid group. Exact under the fitted model, and the bluntest option: it also over-corrects the people who were already at parity.',
        (row) => (row.group === groupA ? row.pay * (1 + needed) : row.pay),
      ));
    }
  }

  // Targeted: only people in the lower-paid group who sit below their own level's
  // median for that group. Cheaper in theory, and worth measuring rather than assuming.
  const levelMedians = new Map();
  for (const level of new Set(rows.filter((row) => row.group === groupA).map((row) => row.level))) {
    const pays = rows.filter((row) => row.group === groupA && row.level === level).map((row) => row.pay).sort((a, b) => a - b);
    if (!pays.length) continue;
    const mid = pays.length % 2 ? pays[(pays.length - 1) / 2] : (pays[pays.length / 2 - 1] + pays[pays.length / 2]) / 2;
    levelMedians.set(level, mid);
  }
  const targetedTargets = rows.filter((row) => row.group === groupA && levelMedians.has(row.level) && row.pay < levelMedians.get(row.level));
  if (targetedTargets.length) {
    options.push(project(
      `Lift the ${targetedTargets.length} lowest-placed ${audit.groupALabel} people to their level median`,
      'A targeted correction: only the people below their own level\'s median within the lower-paid group. Sometimes cheaper than a uniform lift and sometimes dearer, which is precisely why it is re-fitted instead of assumed. It leaves the people already at parity alone, which is easier to explain and harder to characterise as a blanket quota.',
      (row) => (targetedTargets.includes(row) ? levelMedians.get(row.level) : row.pay),
    ));
  }

  // Structural: lift every placement that sits below its band minimum.
  const architecture = payArchitecture(state, now);
  const belowMin = architecture.rows.filter((row) => row.placement && row.placement.status === 'below-min' && row.band);
  if (belowMin.length) {
    const byId = new Map(belowMin.map((row) => [row.person.id, Number(row.band.min)]));
    options.push(project(
      `Lift ${belowMin.length} below-minimum placement(s) to the band minimum`,
      'Fixes confirmed defects rather than the distribution. It may move the adjusted difference very little, which is exactly why it is shown next to the options that do: a defect is not the same problem as a gap.',
      (row) => (byId.has(row.personId) ? Math.max(row.pay, byId.get(row.personId)) : row.pay),
    ));
  }

  return {
    status: 'ok',
    asOf: audit.asOf,
    currency,
    triggerPct: trigger,
    currentGapPct: current,
    options,
    note: 'Costs are annualised total target pay at the cohort level, before tax, employer contributions or any budget constraint. The projected difference is re-fitted, never assumed; a correction can shift composition as well as level, and the re-fit catches that.',
  };
}

/* ------------------------------------------------------------ merit rounds */

/** Position-in-range multiplier: the further below midpoint, the larger the correction. */
export function positionFactor(compaRatio) {
  if (compaRatio === null || compaRatio === undefined) return 1;
  if (compaRatio < 0.85) return 1.35;
  if (compaRatio < 0.95) return 1.15;
  if (compaRatio < 1.05) return 1;
  if (compaRatio < 1.15) return 0.8;
  return 0.5;
}

/** The most recent completed review rating for a person, or '' when none exists. */
export function latestRating(state, personId, onDay) {
  const rows = (state?.reviews || []).filter(
    (row) => row && row.personId === personId && row.status === 'complete' && (!row.periodEnd || row.periodEnd <= onDay),
  );
  if (!rows.length) return { rating: '', reviewId: null, on: null };
  const sorted = [...rows].sort((a, b) => (String(a.periodEnd) < String(b.periodEnd) ? 1 : -1));
  const top = sorted[0];
  const rating = REVIEW_RATINGS.includes(top.manager?.rating) ? top.manager.rating : '';
  return { rating, reviewId: top.id, on: top.periodEnd || null };
}

/**
 * Project a merit matrix over a declared envelope. Deterministic: same inputs,
 * same allocation, every render. Nothing is written to a pay record.
 */
export function simulateMeritRound(state, roundSpec, now = new Date()) {
  // The parameter is deliberately not named `round`: that is the module's
  // rounding helper, and shadowing it turns every arithmetic line into a
  // "not a function" failure at runtime.
  const today = dayKey(now);
  const currency = String(roundSpec?.currency || '').trim();
  const matrix = { ...DEFAULT_MERIT_MATRIX, ...(roundSpec?.matrix || {}) };
  const basePct = num(roundSpec?.basePct) ?? 0;
  const envelopePct = num(roundSpec?.envelopePct);
  const architecture = payArchitecture(state, now);
  const eligible = architecture.paid.filter((row) => !currency || row.currency === currency);

  const proposals = eligible.map((row) => {
    const rating = latestRating(state, row.person.id, today);
    const perf = num(matrix[rating.rating]) ?? 0;
    const factor = positionFactor(row.placement.compaRatio);
    const rawPct = round(basePct * perf * factor, 3);
    return {
      personId: row.person.id,
      name: row.person.name,
      group: row.group,
      level: row.level,
      family: row.family,
      rating: rating.rating,
      ratingLabel: ratingLabel(rating.rating),
      reviewId: rating.reviewId,
      currentPay: row.placement.pay,
      compaRatio: row.placement.compaRatio,
      placement: row.placement.status,
      perfFactor: perf,
      positionFactor: factor,
      rawPct,
      proposedPct: rawPct,
      newPay: round(row.placement.pay * (1 + rawPct / 100), 2),
      increase: round(row.placement.pay * (rawPct / 100), 2),
    };
  });

  const payroll = round(proposals.reduce((sum, row) => sum + row.currentPay, 0), 2);
  const cost = round(proposals.reduce((sum, row) => sum + row.increase, 0), 2);
  const envelopeAmount = envelopePct === null ? null : round((payroll * envelopePct) / 100, 2);
  const overBudget = envelopeAmount !== null && cost > envelopeAmount;
  const scale = envelopeAmount !== null && cost > 0 && overBudget ? envelopeAmount / cost : 1;

  const scaled = proposals.map((row) => ({
    ...row,
    proposedPct: round(row.rawPct * scale, 3),
    newPay: round(row.currentPay * (1 + (row.rawPct * scale) / 100), 2),
    increase: round((row.currentPay * row.rawPct * scale) / 100, 2),
  }));
  const scaledCost = round(scaled.reduce((sum, row) => sum + row.increase, 0), 2);

  // Fairness read: the projected distribution by group and by position in range.
  const byGroup = {};
  for (const row of scaled) {
    const bucket = byGroup[row.group] || (byGroup[row.group] = { group: row.group, headcount: 0, meanPct: 0, meanIncrease: 0 });
    bucket.headcount += 1;
    bucket.meanPct += row.proposedPct;
    bucket.meanIncrease += row.increase;
  }
  for (const bucket of Object.values(byGroup)) {
    bucket.meanPct = bucket.headcount ? round(bucket.meanPct / bucket.headcount, 2) : null;
    bucket.meanIncrease = bucket.headcount ? round(bucket.meanIncrease / bucket.headcount, 1) : null;
  }

  const belowMinBefore = scaled.filter((row) => row.placement === 'below-min').length;
  const belowMinAfter = scaled.filter((row) => {
    const band = architecture.rows.find((r) => r.person.id === row.personId)?.band;
    return band && row.newPay < (num(band.min) ?? 0);
  }).length;

  return {
    asOf: today,
    currency,
    basePct,
    envelopePct,
    payroll,
    cost,
    envelopeAmount,
    overBudget,
    scale: round(scale, 4),
    scaled,
    scaledCost,
    budgetGap: envelopeAmount === null ? null : round(envelopeAmount - scaledCost, 2),
    headcount: scaled.length,
    noRating: scaled.filter((row) => !row.rating).length,
    byGroup,
    belowMinBefore,
    belowMinAfter,
    belowMinName: scaled.filter((row) => row.placement === 'below-min').map((row) => row.personId),
    status: 'projection',
  };
}

/**
 * Re-run the equity model on projected pay. This is the whole point of the merit
 * simulator: a matrix that looks fair per person can widen a gap in aggregate,
 * and the only way to know is to fit the same model again afterwards.
 */
export function projectGapAfterRound(state, round, audit, now = new Date()) {
  if (!audit || audit.status !== 'ok' || !audit.cohort) return { status: 'unavailable', reason: 'No fitted audit is available to re-run.' };
  const projection = simulateMeritRound(state, round, now);
  const byPerson = new Map(projection.scaled.map((row) => [row.personId, row]));
  const rows = audit.cohort.rows.map((row) => {
    const proposed = byPerson.get(row.personId);
    const pay = proposed ? proposed.newPay : row.pay;
    return { ...row, pay, logPay: Math.log(pay) };
  });
  if (rows.length !== audit.cohort.rows.length) return { status: 'unavailable', reason: 'The cohort changed since the audit was filed.' };
  const fit = fitGap(rows, audit.groupA, audit.controlsUsed || []);
  if (!fit.ok) {
    return {
      status: 'unavailable',
      reason: fit.reason === 'singular'
        ? 'The projected model is not identified on this cohort, so no after-round gap is published.'
        : 'The projected model could not be fitted (insufficient residual degrees of freedom).',
    };
  }
  const projected = toPct(fit.beta);
  return {
    status: 'ok',
    projectedAdjustedGapPct: projected,
    deltaPct: round(projected - audit.adjustedGapPct, 2),
    widens: projected > audit.adjustedGapPct,
    controlsUsed: audit.controlsUsed || [],
    df: fit.df,
    note: 'A projection, not a promise: it assumes every proposed increase is enacted exactly as simulated and that nothing else about the cohort changes.',
  };
}

/* ------------------------------------------------------ transparency readiness */

export const TRANSPARENCY_ITEMS = Object.freeze([
  { id: 'bands', label: 'Every paid person has a declared band', basis: 'records' },
  { id: 'currency', label: 'Pay records are current', basis: 'records' },
  { id: 'classification', label: 'Role families and levels are declared', basis: 'records' },
  { id: 'groups', label: 'Group membership is recorded for every paid person', basis: 'records' },
  { id: 'audit', label: 'An equity audit was filed in the last 12 months', basis: 'records' },
  { id: 'jpa', label: 'Every flagged category has an open remediation decision', basis: 'records' },
  { id: 'jobEvaluation', label: 'A gender-neutral job-evaluation study was completed', basis: 'attestation' },
  { id: 'information', label: 'A route for pay-information requests is in place', basis: 'attestation' },
]);

/**
 * Readiness is derived from records wherever a record exists, and *says so* where
 * it is only an attestation. It is deliberately not a compliance percentage: an
 * "80% compliant" bar invites a leader to stop at 80.
 */
export function transparencyReadiness(state, now = new Date()) {
  const today = dayKey(now);
  const architecture = payArchitecture(state, now);
  const settings = state?.settings || {};
  const audits = (state?.payAudits || []).filter((row) => row && row.status === 'filed');
  const recentAudit = audits
    .filter((row) => row.filedOn && (daysBetween(row.filedOn, today) ?? 1e9) <= 365)
    .sort((a, b) => (a.filedOn < b.filedOn ? 1 : -1))[0] || null;

  const openDecisionFor = (auditId) => (state?.links || []).some(
    (link) => link &&
      ((link.sourceType === 'payAudit' && link.sourceId === auditId && link.targetType === 'decision') ||
        (link.targetType === 'payAudit' && link.targetId === auditId && link.sourceType === 'decision')),
  );

  const items = TRANSPARENCY_ITEMS.map((item) => {
    switch (item.id) {
      case 'bands': {
        const gap = architecture.counts.paid - architecture.counts.unbanded;
        return {
          ...item,
          status: architecture.counts.paid === 0 ? 'unknown' : architecture.counts.unbanded === 0 ? 'met' : 'gap',
          detail: architecture.counts.paid === 0
            ? 'No pay has been recorded yet.'
            : `${gap} of ${architecture.counts.paid} paid people sit in a declared band; ${architecture.counts.unbanded} cannot be placed.`,
          route: '#/pay?tab=architecture',
        };
      }
      case 'currency': {
        const stale = architecture.counts.stale;
        return {
          ...item,
          status: architecture.counts.paid === 0 ? 'unknown' : stale === 0 ? 'met' : 'gap',
          detail: architecture.counts.paid === 0
            ? 'No pay has been recorded yet.'
            : `${stale} record(s) are older than ${architecture.staleDays} days. A stale record is not a wrong one, but it is not current either.`,
          route: '#/pay?tab=architecture',
        };
      }
      case 'classification': {
        const undeclared = architecture.bandGaps.length;
        return {
          ...item,
          status: architecture.counts.bands === 0 ? 'unknown' : undeclared === 0 ? 'met' : 'gap',
          detail: architecture.counts.bands === 0
            ? 'No band has been declared, so no classification exists to read.'
            : undeclared === 0
              ? `All staffed family/level combinations have a declared band (${architecture.counts.families} families).`
              : `${undeclared} staffed family/level combination(s) have no declared band.`,
          route: '#/pay?tab=architecture',
        };
      }
      case 'groups': {
        const missing = architecture.counts.noGroup;
        return {
          ...item,
          status: architecture.counts.paid === 0 ? 'unknown' : missing === 0 ? 'met' : 'gap',
          detail: architecture.counts.paid === 0
            ? 'No pay has been recorded yet.'
            : missing === 0
              ? 'Every paid person has a contrast group recorded or explicitly marked not to be analysed.'
              : `${missing} paid person(s) have no contrast group recorded, so the audit excludes them and says so.`,
          route: '#/pay?tab=architecture',
        };
      }
      case 'audit': {
        return {
          ...item,
          status: recentAudit ? 'met' : audits.length ? 'gap' : 'unknown',
          detail: recentAudit
            ? `A filed audit is on record from ${recentAudit.filedOn}${recentAudit.snapshot?.status === 'ok' ? ` (adjusted gap ${recentAudit.snapshot.adjustedGapPct ?? '—'}%)` : ' (the cohort could not be modelled and it says so)'}.`
            : audits.length
              ? 'Audits exist but none was filed in the last 12 months.'
              : 'No audit has been filed. A live preview is not a record of an assessment.',
          route: '#/pay?tab=equity',
        };
      }
      case 'jpa': {
        const flagged = recentAudit?.snapshot?.flaggedCategories || [];
        if (!recentAudit) return { ...item, status: 'unknown', detail: 'No filed audit means no category can have been flagged.', route: '#/pay?tab=equity' };
        if (!flagged.length) return { ...item, status: 'met', detail: 'The filed audit flagged no category above the threshold.', route: '#/pay?tab=equity' };
        const open = openDecisionFor(recentAudit.id);
        return {
          ...item,
          status: open ? 'met' : 'gap',
          detail: open
            ? `${flagged.length} category/categories flagged; a decision is linked to the audit.`
            : `${flagged.length} category/categories flagged at or above ${recentAudit.snapshot.triggerPct}% but no remediation decision is linked to the audit. A joint pay assessment needs an owned action, not a report.`,
          route: '#/pay?tab=equity',
        };
      }
      case 'jobEvaluation': {
        const on = settings.payJobEvaluationOn || null;
        return {
          ...item,
          status: on ? 'met' : 'unknown',
          detail: on
            ? `Attested by the leader on ${on}. LeadOS records the attestation; it does not verify the study or perform one.`
            : 'Not recorded. Work of equal value cannot be established from pay data alone, and this tool will not pretend it can.',
          route: '#/pay?tab=transparency',
        };
      }
      case 'information': {
        const on = settings.payInformationRouteOn || null;
        return {
          ...item,
          status: on ? 'met' : 'unknown',
          detail: on
            ? `Attested by the leader on ${on}.`
            : 'Not recorded. A route for pay-information requests is an attestation about process, not something LeadOS can observe.',
          route: '#/pay?tab=transparency',
        };
      }
      default:
        return { ...item, status: 'unknown', detail: '' };
    }
  });

  return {
    today,
    items,
    counts: {
      met: items.filter((row) => row.status === 'met').length,
      gap: items.filter((row) => row.status === 'gap').length,
      unknown: items.filter((row) => row.status === 'unknown').length,
      total: items.length,
    },
    derived: items.filter((row) => row.basis === 'records'),
    attested: items.filter((row) => row.basis === 'attestation'),
    recentAudit,
  };
}

/* -------------------------------------------------- worked example cohort */

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

/**
 * A synthetic, deterministic 28-person cohort used only by the worked example.
 *
 * It exists because the honest answer on a real five-person roster is "this
 * cannot be modelled", and a first-time leader learns nothing from a refusal
 * alone. The example is generated from a fixed seed, labelled as illustrative
 * everywhere it appears, and never mixed into a filed audit or a brief.
 */
export function buildExampleCohort(seed = 20261029) {
  const rand = mulberry32(seed);
  const levels = ['ic', 'senior', 'lead'];
  const families = ['Engineering', 'Product', 'Data'];
  const bands = {
    'Engineering|ic': [62000, 78000, 94000],
    'Engineering|senior': [96000, 120000, 144000],
    'Engineering|lead': [128000, 158000, 190000],
    'Product|ic': [66000, 83000, 100000],
    'Product|senior': [104000, 130000, 156000],
    'Product|lead': [136000, 168000, 200000],
    'Data|ic': [64000, 80000, 96000],
    'Data|senior': [98000, 122000, 146000],
    'Data|lead': [130000, 160000, 192000],
  };
  const rows = [];
  for (let i = 0; i < 28; i += 1) {
    const group = i % 2 === 0 ? 'woman' : 'man';
    const level = levels[Math.floor(rand() * levels.length)];
    const family = families[Math.floor(rand() * families.length)];
    const [min, mid, max] = bands[`${family}|${level}`];
    const tenureYears = Math.round((0.5 + rand() * 8) * 10) / 10;
    // A deliberate, stated structural effect: women are placed 4 points lower in
    // range than men at the same level and family, plus noise. That is what the
    // model has to be able to see; it is not a claim about any real employer.
    const position = 0.34 + rand() * 0.32 + (group === 'woman' ? -0.1 : 0.02);
    const pay = Math.round((min + position * (max - min)) / 500) * 500;
    rows.push({
      person: { id: `example-${i + 1}`, name: `Example ${i + 1}`, equalPayGroup: group, startDate: null },
      personId: `example-${i + 1}`,
      assignment: { currency: 'USD', level, family },
      group,
      pay,
      logPay: Math.log(pay),
      level,
      family,
      tenureYears,
    });
  }
  return {
    currency: 'USD',
    groupA: 'woman',
    groupB: 'man',
    groupALabel: 'Woman',
    groupBLabel: 'Man',
    rows,
    excluded: { noPay: 0, otherCurrency: 0, noGroup: 0, undisclosed: 0, otherGroup: 0, noClassification: 0, noBand: 0 },
    missingTenure: 0,
    today: null,
    synthetic: true,
  };
}

/** The audited worked example, always labelled synthetic. */
export function exampleGapAudit(seed = 20261029) {
  const cohort = buildExampleCohort(seed);
  const audit = auditCohort(cohort, { currency: 'USD', groupA: 'woman', groupB: 'man' }, new Date());
  return { ...audit, synthetic: true, asOf: null };
}

/* ------------------------------------------------------------------ portfolio */

/** One read model for the page header, the nav badge and the brief. */
export function payPortfolio(state, now = new Date()) {
  const architecture = payArchitecture(state, now);
  const readiness = transparencyReadiness(state, now);
  const audits = (Array.isArray(state?.payAudits) ? state.payAudits : []).filter(Boolean);
  const rounds = (Array.isArray(state?.meritRounds) ? state.meritRounds : []).filter(Boolean);
  const filed = audits.filter((row) => row.status === 'filed');
  const latestFiled = filed.sort((a, b) => (String(a.filedOn) < String(b.filedOn) ? 1 : -1))[0] || null;
  const attention = [];
  if (architecture.counts.belowMin) {
    attention.push({
      id: 'below-min',
      severity: 4,
      title: `${architecture.counts.belowMin} person(s) are paid below their band minimum`,
      route: '#/pay?tab=architecture',
    });
  }
  if (!filed.length && architecture.counts.paid >= PAY_MIN_COHORT) {
    attention.push({
      id: 'no-audit',
      severity: 3,
      title: 'Enough pay is recorded to run an equity audit, and none has been filed',
      route: '#/pay?tab=equity',
    });
  }
  if (latestFiled?.snapshot?.requiresJointAssessment) {
    attention.push({
      id: 'jpa',
      severity: 5,
      title: `${latestFiled.snapshot.flaggedCategories.length} pay category/categories crossed the ${latestFiled.snapshot.triggerPct}% assessment threshold`,
      route: '#/pay?tab=equity',
    });
  }
  if (architecture.counts.unbanded) {
    attention.push({
      id: 'unbanded',
      severity: 3,
      title: `${architecture.counts.unbanded} paid person(s) cannot be placed in a band`,
      route: '#/pay?tab=architecture',
    });
  }
  return {
    architecture,
    readiness,
    audits,
    rounds,
    latestFiled,
    attention,
    counts: {
      people: architecture.counts.people,
      paid: architecture.counts.paid,
      belowMin: architecture.counts.belowMin,
      aboveMax: architecture.counts.aboveMax,
      unbanded: architecture.counts.unbanded,
      bands: architecture.counts.bands,
      filedAudits: filed.length,
      readinessGaps: readiness.counts.gap,
      attention: attention.length,
    },
  };
}

/** Nav badge: attention, never telemetry. */
export function payAttentionCount(state, now = new Date()) {
  const rows = Array.isArray(state?.payBands) ? state.payBands : [];
  const paid = Array.isArray(state?.payAssignments) ? state.payAssignments : [];
  if (!rows.length && !paid.length) return 0;
  return payPortfolio(state, now).counts.attention;
}

/* --------------------------------------------------------------- signals */

export function paySignals(state, now = new Date()) {
  const report = payPortfolio(state, now);
  const signals = [];
  const latest = report.latestFiled;

  if (latest?.snapshot?.status === 'ok' && latest.snapshot.significant) {
    const gap = latest.snapshot.adjustedGapPct;
    signals.push({
      ruleId: PAY_SIGNAL_IDS.GAP,
      domain: 'Pay architecture',
      title: `Adjusted pay gap of ${gap}% in ${latest.snapshot.currency} is not explained by the recorded controls`,
      detail: `Filed ${latest.filedOn} across ${latest.snapshot.n} comparable people, controlling for ${latest.snapshot.controlLabels?.join(', ') || 'nothing'}. The 95% interval is ${latest.snapshot.adjustedCiPct?.low}% to ${latest.snapshot.adjustedCiPct?.high}%. This is a difference the recorded controls do not explain — not a finding of discrimination, and not a substitute for a job-evaluation study.`,
      severity: 5,
      confidence: 'medium',
      evidence: [
        `Raw gap ${latest.snapshot.rawGapPct}% · adjusted ${gap}% · ${latest.snapshot.df} residual df · R² ${latest.snapshot.r2 ?? '—'}`,
        `Groups: ${latest.snapshot.groupALabel} vs ${latest.snapshot.groupBLabel}`,
      ],
      action: { label: 'Open the filed audit', route: `#/pay?tab=equity&audit=${encodeURIComponent(latest.id)}` },
    });
  }

  if (latest?.snapshot?.requiresJointAssessment) {
    const flagged = latest.snapshot.flaggedCategories;
    signals.push({
      ruleId: PAY_SIGNAL_IDS.JPA,
      domain: 'Pay architecture',
      title: `${flagged.length} pay categor${flagged.length === 1 ? 'y is' : 'ies are'} at or above the ${latest.snapshot.triggerPct}% assessment threshold`,
      detail: `Categories: ${flagged.map((row) => `${row.label} (${row.gapPct}%, ${row.nA}+${row.nB} people)`).join('; ')}. A justified difference is fine; an unexplained one needs a documented, owned assessment with objective, gender-neutral criteria — and the criteria must exist before the conclusion does.`,
      severity: 5,
      confidence: 'high',
      evidence: flagged.slice(0, 4).map((row) => `${row.label}: ${row.gapPct}% over ${row.nA + row.nB} people`),
      action: { label: 'Open the audit', route: `#/pay?tab=equity&audit=${encodeURIComponent(latest.id)}` },
    });
  }

  if (report.architecture.counts.belowMin) {
    signals.push({
      ruleId: PAY_SIGNAL_IDS.BELOW_MIN,
      domain: 'Pay architecture',
      title: `${report.architecture.counts.belowMin} person(s) are paid below the band minimum`,
      detail: 'Below-minimum pay is usually a missed correction rather than a decision. If it is a deliberate exception, it needs a written reason and a review date; if it is not, it is a defect that compounds every year it is left alone.',
      severity: 4,
      confidence: 'high',
      evidence: Object.values(report.architecture.byCurrency).map(
        (row) => `${row.currency}: ${row.belowMin} below minimum · cost to midpoint ${row.costToMidpoint}`,
      ),
      action: { label: 'Review placements', route: '#/pay?tab=architecture' },
    });
  }

  const coverageIssues = report.architecture.counts.unbanded + report.architecture.counts.stale + report.architecture.counts.noGroup;
  if (coverageIssues) {
    signals.push({
      ruleId: PAY_SIGNAL_IDS.COVERAGE,
      domain: 'Pay architecture',
      title: 'The pay records are not yet readable as an architecture',
      detail: `${report.architecture.counts.unbanded} paid person(s) cannot be placed in a band, ${report.architecture.counts.stale} record(s) are older than ${report.architecture.staleDays} days, and ${report.architecture.counts.noGroup} paid person(s) have no contrast group. Every one of these shrinks the equity audit's cohort silently unless it is fixed.`,
      severity: 3,
      confidence: 'high',
      evidence: [
        `${report.architecture.counts.paid} paid of ${report.architecture.counts.people} people`,
        `${report.architecture.counts.bands} band(s) declared across ${report.architecture.counts.families} families`,
      ],
      action: { label: 'Open architecture', route: '#/pay?tab=architecture' },
    });
  }

  const declared = report.rounds.filter((row) => row.status === 'declared');
  for (const round of declared.slice(0, 2)) {
    const audit = latest?.snapshot?.status === 'ok' ? latest.snapshot : null;
    if (!audit) break;
    const projection = projectGapAfterRound(state, round, { ...audit, status: 'ok', cohort: buildCohort(state, { currency: audit.currency, groupA: audit.groupA, groupB: audit.groupB }, now) }, now);
    if (projection.status !== 'ok' || !projection.widens) continue;
    signals.push({
      ruleId: PAY_SIGNAL_IDS.MERIT_WIDENS,
      domain: 'Pay architecture',
      title: `“${round.label}” is projected to widen the adjusted gap by ${projection.deltaPct} points`,
      detail: `The matrix is not unfair person by person — it pays by rating and position in range. But the people furthest below midpoint get the largest percentage on the smallest base, which is exactly how a gap survives a well-intentioned cycle. Options: shift part of the envelope to below-midpoint corrections, or accept it with the trade-off written down.`,
      severity: 4,
      confidence: 'medium',
      evidence: [
        `Projected adjusted gap ${projection.projectedAdjustedGapPct}% from ${audit.adjustedGapPct}%`,
        `${round.basePct}% matrix base · envelope ${round.envelopePct}% of payroll`,
      ],
      action: { label: 'Open the simulator', route: `#/pay?tab=merit&round=${encodeURIComponent(round.id)}` },
    });
  }

  return signals;
}

/* -------------------------------------------------------------------- brief */

export function buildPayBrief(state, now = new Date()) {
  const report = payPortfolio(state, now);
  const lines = [`# Pay architecture brief — ${dayKey(now)}`, ''];
  lines.push(`Prepared from this workspace's own records. Nothing here is benchmarked against an external market source, and no currency is converted.`);
  lines.push('');
  lines.push('## Coverage');
  lines.push(`- ${report.architecture.counts.paid} of ${report.architecture.counts.people} active people have a pay record.`);
  lines.push(`- ${report.architecture.counts.bands} band(s) across ${report.architecture.counts.families} role families.`);
  lines.push(`- Unplaced: ${report.architecture.counts.unbanded}. Below minimum: ${report.architecture.counts.belowMin}. Above maximum: ${report.architecture.counts.aboveMax}. Stale: ${report.architecture.counts.stale}.`);
  for (const bucket of Object.values(report.architecture.byCurrency)) {
    lines.push(`- ${bucket.currency}: payroll ${bucket.payroll}, median compa-ratio ${bucket.medianCompa ?? '—'}, cost to move everyone to midpoint ${bucket.costToMidpoint}.`);
  }
  lines.push('');
  lines.push('## Equity');
  if (!report.latestFiled) {
    lines.push('- No audit has been filed. A live preview is not a record of an assessment.');
  } else {
    const snap = report.latestFiled.snapshot;
    lines.push(`- Filed ${report.latestFiled.filedOn} (${snap.currency}): ${snap.groupALabel} vs ${snap.groupBLabel}.`);
    if (snap.status === 'ok') {
      lines.push(`- Raw gap ${snap.rawGapPct}%; adjusted ${snap.adjustedGapPct}% (95% interval ${snap.adjustedCiPct?.low}% to ${snap.adjustedCiPct?.high}%), controlling for ${snap.controlLabels?.join(', ') || 'nothing'}.`);
      lines.push(`- ${snap.n} comparable people, ${snap.df} residual degrees of freedom, R² ${snap.r2 ?? '—'}.`);
      lines.push(`- Categories at or above the ${snap.triggerPct}% threshold: ${snap.flaggedCategories.length ? snap.flaggedCategories.map((row) => `${row.label} (${row.gapPct}%)`).join(', ') : 'none'}.`);
    } else {
      lines.push(`- The filed cohort could not be modelled: ${snap.reason}`);
    }
  }
  lines.push('');
  lines.push('## What this does not say');
  lines.push('- The adjusted figure is not a finding of discrimination, a legal opinion, or a job evaluation.');
  lines.push('- Omitted variables can move the estimate either way; the interval covers sampling noise for this cohort only.');
  lines.push('- A committed merit round is a decision, not a pay change: record the new assignment when it takes effect.');
  return lines.join('\n');
}
