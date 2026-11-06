/**
 * ADR-0107 — the statistics of the Outcome Learning Loop.
 *
 * Deliberately dependency-free (not even `time.js`): `decisionTempo.js` imports
 * this file, and `schema.js` imports `decisionTempo.js`, so pulling the domain
 * graph in here would create a module-init cycle. Every function is pure,
 * deterministic and exported so a test can check it by hand.
 *
 * Nothing here estimates a person. The unit is one adopted response, one span,
 * one cell. A refusal is a first-class answer: below the declared floor the
 * function returns `{ status: 'refused', reason }`, never a small-sample point
 * estimate dressed up as a forecast.
 */
export const OUTCOME_PRIOR_VERSION = 'outcome-prior-2026.11-v1';
const Z95 = 1.959963984540054;
const round = (v, places = 4) => Number.isFinite(v) ? Math.round(v * 10 ** places) / 10 ** places : null;
const clamp = (v, lo, hi, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};
export const outcomeConventions = (settings = {}) => Object.freeze({
  minGrades: Math.round(clamp(settings.outcomeMinGrades, 3, 25, 5)),
  minCell: Math.round(clamp(settings.outcomeMinCell, 3, 25, 5)),
  shrinkK: Math.round(clamp(settings.outcomeShrinkK, 2, 40, 8)),
  staleDays: Math.round(clamp(settings.outcomeStaleDays, 1, 90, 14)),
  materialityPp: Math.round(clamp(settings.outcomeMaterialityPp, 5, 50, 15)),
  conformalCoverage: round(clamp(settings.outcomeConformalCoverage, 0.5, 0.95, 0.8), 2),
  fidelityFloorPct: Math.round(clamp(settings.outcomeFidelityFloorPct, 50, 95, 75)),
});

/** Wilson (1927) score interval. `p` may be fractional: `mixed` outcomes are a real half. */
export function wilsonInterval(p, n, z = Z95) {
  if (!Number.isFinite(p) || !Number.isFinite(n) || n <= 0 || p < 0 || p > 1) return null;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n)) / denom;
  return { lo: round(Math.max(0, centre - half), 4), hi: round(Math.min(1, centre + half), 4) };
}

/** Brier (1950) on a tri-state outcome; base is the strictly-prior 0.5, not a fitted mean. */
export function brierPair(forecastPct, outcomeValue) {
  if (forecastPct === null || forecastPct === undefined || forecastPct === '') return null;
  const p = clamp(forecastPct, 0, 100, null);
  const y = Number(outcomeValue);
  if (p === null || !Number.isFinite(y) || y < 0 || y > 1) return null;
  const prob = p / 100;
  const brier = round((prob - y) ** 2, 6);
  const baseBrier = round((0.5 - y) ** 2, 6);
  return { brier, baseBrier, skill: baseBrier > 0 ? round(1 - brier / baseBrier, 6) : null };
}

/**
 * One-sided split-conformal upper bound on days past a declared horizon.
 * k = ceil((n+1)·coverage); the finite-sample coverage guarantee is k/(n+1)
 * under exchangeability. When k > n the requested level is unidentifiable at
 * this sample size and the band is REFUSED, never extended to +∞ as a number.
 */
export function conformalUpper(residuals, { coverage = 0.8, minN = 5 } = {}) {
  const values = (Array.isArray(residuals) ? residuals : []).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  const n = values.length;
  if (n < minN) return { status: 'refused', n, minN, reason: `Only ${n} graded loop(s); the band is refused below ${minN}.` };
  const k = Math.ceil((n + 1) * coverage);
  if (k > n) return { status: 'refused', n, k, coverage, reason: `Nominal ${Math.round(coverage * 100)}% coverage needs at least ${Math.ceil(1 / (1 - coverage)) - 1} graded loops; ${n} cannot identify the bound.` };
  return {
    status: 'published', n, k, coverage: round(k / (n + 1), 4),
    upperDays: Math.max(0, Math.round(values[k - 1])),
    medianDays: Math.round(values[Math.floor((n - 1) / 2)]),
    worstObservedDays: Math.round(values[n - 1]),
    method: 'One-sided split conformal (Vovk et al., 2005); marginal finite-sample coverage k/(n+1) under exchangeability. Not a conditional guarantee.',
  };
}

/** Pooled Brier skill against the strictly-prior base. Refused below the floor. */
export function pooledBrier(grades, { minGrades = 5 } = {}) {
  const rows = (Array.isArray(grades) ? grades : []).filter((g) => g && g.status === 'graded'
    && Number.isFinite(g.brier) && Number.isFinite(g.baseBrier));
  if (rows.length < minGrades) return { status: 'refused', n: rows.length, minGrades, reason: `Only ${rows.length} graded loop(s); pooled skill is refused below ${minGrades}.` };
  const brier = round(rows.reduce((n, r) => n + r.brier, 0) / rows.length, 6);
  const baseBrier = round(rows.reduce((n, r) => n + r.baseBrier, 0) / rows.length, 6);
  return {
    status: 'published', n: rows.length, brier, baseBrier,
    skill: baseBrier > 0 ? round(1 - brier / baseBrier, 6) : null,
    reason: baseBrier > 0 ? null : 'Every graded outcome was exactly the 0.5 base rate; skill is mathematically undefined.',
  };
}

/** Quadrant: an association between DELIVERY FIDELITY and a human outcome. */
export function outcomeVerdict({ outcomeValue, fidelityPct, fidelityFloorPct = 75 } = {}) {
  if (!Number.isFinite(outcomeValue) || !Number.isFinite(fidelityPct)) return 'ungradable';
  const good = outcomeValue >= 0.5;
  const delivered = fidelityPct >= fidelityFloorPct;
  if (good && delivered) return 'earned';
  if (good && !delivered) return 'lucky';
  if (!good && delivered) return 'variance';
  return 'fixable';
}

/**
 * The outside view for the price of a NEW decision. This is the ONLY function
 * `decisionTempo.js` imports. It never returns a number below the floor, never
 * claims causality and never overwrites a leader's declared forecast.
 */
export function outsideViewFromGrades(grades, settings = {}) {
  const conv = outcomeConventions(settings);
  const rows = (Array.isArray(grades) ? grades : []).filter((g) => g && g.status === 'graded'
    && Number.isFinite(g.outcomeValue) && Number.isFinite(g.forecastPct));
  const n = rows.length;
  if (n < conv.minGrades) {
    return { status: 'refused', n, minGrades: conv.minGrades, reason: `Only ${n} graded loop(s). An outside view is refused below ${conv.minGrades}; the leader's own declared forecast is not replaced by a thinner one.`, conventions: conv };
  }
  const observed = rows.reduce((sum, g) => sum + g.outcomeValue, 0) / n;
  const declared = rows.reduce((sum, g) => sum + g.forecastPct / 100, 0) / n;
  const k = conv.shrinkK;
  const shrunk = (n * observed + k * 0.5) / (n + k);
  const interval = wilsonInterval(shrunk, n + k);
  const gapPp = round((declared - observed) * 100, 1);
  const material = Math.abs(gapPp) >= conv.materialityPp;
  const direction = !material ? 'aligned' : gapPp > 0 ? 'overconfident' : 'underconfident';
  const score = pooledBrier(rows, { minGrades: conv.minGrades });
  return {
    status: 'published', engineVersion: OUTCOME_PRIOR_VERSION, n,
    observedPct: round(observed * 100, 1), declaredPct: round(declared * 100, 1),
    pct: round(shrunk * 100, 1), loPct: interval ? round(interval.lo * 100, 1) : null,
    hiPct: interval ? round(interval.hi * 100, 1) : null,
    gapPp, material, direction, shrinkK: k,
    pooled: score,
    method: 'Pooled realised outcome over this workspace’s own graded loops, shrunk toward the 0.5 maximum-entropy prior by k declared observations; Wilson (1927) 95% interval at effective n+k. Not a market base rate and never a person score.',
    conventions: conv,
  };
}

/** A bounded disclosure envelope for one altitude's child spans. */
export function suppressedCells(groups, { floor = 5, detail = false } = {}) {
  const hiddenKeys = new Set(detail ? [] : groups.filter((g) => g.rows.length < floor).map((g) => g.key));
  let secondary = null;
  if (!detail && hiddenKeys.size === 1) {
    const candidate = groups.filter((g) => !hiddenKeys.has(g.key)).sort((a, b) => a.rows.length - b.rows.length || String(a.key).localeCompare(String(b.key)))[0];
    if (candidate) { hiddenKeys.add(candidate.key); secondary = candidate.key; }
  }
  const cells = groups.map((g) => {
    const hidden = hiddenKeys.has(g.key);
    const graded = g.rows.filter((r) => r.graded).length;
    const good = g.rows.filter((r) => r.good).length;
    const late = g.rows.filter((r) => r.late).length;
    return {
      key: g.key, label: g.label, seatId: g.seatId, rank: g.rank ?? null, suppressed: hidden, secondary: g.key === secondary,
      loops: hidden ? { lower: 0, upper: g.key === secondary ? g.rows.length : floor - 1 } : { lower: g.rows.length, upper: g.rows.length },
      graded: hidden ? { lower: 0, upper: g.key === secondary ? graded : floor - 1 } : { lower: graded, upper: graded },
      good: hidden ? { lower: 0, upper: g.key === secondary ? good : floor - 1 } : { lower: good, upper: good },
      late: hidden ? { lower: 0, upper: g.key === secondary ? late : floor - 1 } : { lower: late, upper: late },
      reason: hidden ? (g.key === secondary ? 'Complementary suppression prevents subtracting the other visible cells from the parent total.' : `Small-cell suppression: fewer than ${floor} observations.`) : '',
    };
  });
  const totals = ['loops', 'graded', 'good', 'late'].reduce((acc, k) => {
    acc[k] = cells.reduce((sum, c) => ({ lower: sum.lower + c[k].lower, upper: sum.upper + c[k].upper }), { lower: 0, upper: 0 });
    return acc;
  }, {});
  return { cells, totals, floor, suppressedN: hiddenKeys.size, method: detail ? 'Exact operational counts inside the permitted individual-detail span.' : 'Primary + complementary suppression; interval parent totals prevent simple differencing. Not differential privacy.' };
}
