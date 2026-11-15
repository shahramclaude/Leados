/**
 * app/core/domain/riskAppetiteMath.js — the exact kernel of the Enterprise Risk
 * Appetite & Tolerance Breach Register (ADR-0219).
 *
 * NO FLOATING POINT TOUCHES A MONEY FIGURE. Every retention and every tolerance
 * is an integer number of cents. Sums are taken in `BigInt` and converted back
 * to a Number only after the bounded range in the registry guarantees a safe
 * integer, so a printed total is the exact sum of the rows printed beside it.
 *
 * A COUNT AND A SUM ARE DIFFERENT INSTRUMENTS and are never compared to each
 * other: `declared-risks` is an integer count, `retained-exposure` is integer
 * cents in ONE currency. The register prints them side by side and adds
 * neither to the other.
 *
 * A MEASURED FIGURE IS ALWAYS OVER A NAMED POPULATION. `commonMeasure` returns
 * the figure AND the population size it was taken over, so a screen cannot
 * print "3" without saying three of what.
 */

import { RA_LIMITS as L } from './riskAppetiteRegistry.js';

/** Whole days from one calendar day to another; null when either is unreadable. */
export function raDaysBetween(from, to) {
  if (!from || !to) return null;
  const a = Date.parse(`${from}T00:00:00.000Z`);
  const b = Date.parse(`${to}T00:00:00.000Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/** The number every money figure must stay under to be a safe integer. */
export const RA_MAX_CENTS = BigInt(L.centsMax);

/**
 * Exact sum of integer cents. Refuses (returns null) if any row is not a stored
 * cents integer or if the total leaves the safe range: a total the register
 * cannot hold exactly is not rounded, it is withheld.
 */
export function raSumCents(rows) {
  let total = 0n;
  for (const row of rows) {
    const cents = row;
    if (!Number.isSafeInteger(cents) || cents < 0) return null;
    total += BigInt(cents);
    if (total > RA_MAX_CENTS) return null;
  }
  return Number(total);
}

/**
 * Measure one statement over its declared population. The caller has already
 * selected the population (live declarations in the statement's domain); this
 * function applies the currency rule and computes the verdict EXACTLY.
 *
 * Returns a value object. `measured` is null and `verdict` is `unmeasurable`
 * when the figure cannot be computed exactly — never zero.
 */
export function measureStatement(statement, population) {
  const rows = Array.isArray(population) ? population : [];
  if (!statement || (statement.measure !== 'declared-risks' && statement.measure !== 'retained-exposure')) {
    return {
      verdict: 'unmeasurable',
      measured: null,
      tolerance: null,
      unit: null,
      populationN: rows.length,
      excludedOtherCurrencyN: 0,
      excludedOtherCurrencyCentsByCurrency: {},
      headroom: null,
      overBy: null,
      breached: null,
      reason: 'The statement does not declare a measure this register can compute.',
    };
  }

  if (statement.measure === 'declared-risks') {
    const measured = rows.length;
    const tolerance = Number.isSafeInteger(statement.toleranceCount) ? statement.toleranceCount : null;
    if (tolerance === null) {
      return {
        verdict: 'unmeasurable', measured, tolerance: null, unit: 'count', populationN: measured,
        excludedOtherCurrencyN: 0, excludedOtherCurrencyCentsByCurrency: {}, headroom: null, overBy: null, breached: null,
        reason: 'The statement carries no readable integer tolerance.',
      };
    }
    const breached = measured > tolerance;
    return {
      verdict: breached ? 'breached' : 'within-tolerance',
      measured,
      tolerance,
      unit: 'count',
      populationN: measured,
      excludedOtherCurrencyN: 0,
      excludedOtherCurrencyCentsByCurrency: {},
      headroom: breached ? 0 : tolerance - measured,
      overBy: breached ? measured - tolerance : 0,
      breached,
      reason: '',
    };
  }

  // Retained exposure: one currency, exact cents, no conversion and no pooling.
  const inCurrency = rows.filter((row) => row.currency === statement.currency);
  const others = rows.filter((row) => row.currency !== statement.currency);
  const excludedTotals = new Map();
  for (const row of others) {
    const next = (excludedTotals.get(row.currency) ?? 0n) + BigInt(row.retainedCents);
    excludedTotals.set(row.currency, next);
  }
  const excludedOtherCurrencyCentsByCurrency = {};
  for (const [key, total] of excludedTotals.entries()) {
    excludedOtherCurrencyCentsByCurrency[key] = total > RA_MAX_CENTS ? null : Number(total);
  }
  const measured = raSumCents(inCurrency.map((row) => row.retainedCents));
  const tolerance = Number.isSafeInteger(statement.toleranceCents) ? statement.toleranceCents : null;
  if (measured === null || tolerance === null) {
    return {
      verdict: 'unmeasurable',
      measured: null,
      tolerance,
      unit: 'money',
      currency: statement.currency,
      populationN: inCurrency.length,
      excludedOtherCurrencyN: others.length,
      excludedOtherCurrencyCentsByCurrency,
      headroom: null,
      overBy: null,
      breached: null,
      reason: measured === null
        ? 'The retained amounts do not sum to a figure this register can hold exactly (an unreadable cent value or a total beyond the safe range). Nothing is rounded and nothing is printed as zero.'
        : 'The statement carries no readable integer-cents tolerance.',
    };
  }
  const breached = BigInt(measured) > BigInt(tolerance);
  return {
    verdict: breached ? 'breached' : 'within-tolerance',
    measured,
    tolerance,
    unit: 'money',
    currency: statement.currency,
    populationN: inCurrency.length,
    excludedOtherCurrencyN: others.length,
    excludedOtherCurrencyCentsByCurrency,
    headroom: breached ? 0 : tolerance - measured,
    overBy: breached ? measured - tolerance : 0,
    breached,
    reason: '',
  };
}

/**
 * The deterministic signatures the rule files. A breach signature names the
 * statement and the exact figure the verdict rests on: if the measured figure
 * moves, the old ask no longer describes the condition it was written for and a
 * new one is owed. A review signature names the statement only — the review date
 * is the condition, and its passing is a fact.
 */
export function raBreachSignature(statementId, measurement) {
  const figure = measurement?.unit === 'money'
    ? `${measurement.currency}:${measurement.measured}`
    : `${measurement?.measured}`;
  return `rap1:breach:${statementId}:${figure}:${measurement?.tolerance}`;
}
export const raReviewSignature = (statementId) => `rap1:review:${statementId}`;
export const raMissingSignature = (domain) => `rap1:missing:${domain}`;

/**
 * The register's two claims over the whole record, kept apart from every
 * per-statement verdict:
 *   - `countsReconcile` — the per-domain count of declared risks adds up to the
 *     number of live declarations (each risk counted exactly once).
 *   - `figuresComplete` — every open risk-bearing case carries a live
 *     declaration, every declaration resolves to a live case, every declared
 *     domain carries a live statement for the measure it is being tested under,
 *     and no currency is left outside an exposure statement.
 */
export function raClaims({
  declaredTotal,
  byDomainCounts,
  openRiskCases,
  declaredCaseIds,
  missingCaseIds,
  domainsWithoutAppetite,
  currenciesWithoutStatement,
}) {
  const perDomainSum = Object.values(byDomainCounts || {}).reduce((sum, n) => sum + n, 0);
  const countsReconcile = perDomainSum === declaredTotal;
  // Callers pass either ids or the case rows themselves; both are accepted so a
  // caller cannot accidentally compare an OBJECT to a Set of strings and get
  // "every case undeclared" — a defect that reads as a permanent coverage gap.
  const undeclaredN = openRiskCases.filter((row) => {
    const caseId = typeof row === 'string' ? row : row?.id;
    return !caseId || !declaredCaseIds.has(caseId);
  }).length;
  const figuresComplete = undeclaredN === 0
    && missingCaseIds.length === 0
    && domainsWithoutAppetite.length === 0
    && currenciesWithoutStatement.length === 0;
  return {
    countsReconcile,
    perDomainSum,
    undeclaredN,
    missingCaseN: missingCaseIds.length,
    domainsWithoutAppetiteN: domainsWithoutAppetite.length,
    currenciesWithoutStatementN: currenciesWithoutStatement.length,
    figuresComplete,
  };
}
