/**
 * app/core/domain/earnedValueMath.js — the exact kernel of the Earned-Value
 * Delivery & Estimate-at-Completion Register (ADR-0217, Schema v171).
 *
 * WHAT IS EXACT HERE, AND WHY IT HAS TO BE. Every amount is a whole number of
 * cents. Package EV is plannedCents × share ÷ 100, rounded half away from zero,
 * and the case total is the sum of those printed package figures — so the rows
 * re-add to the total by CONSTRUCTION, every read, on every machine. Line
 * attribution apportions each package's integer cents across its declared line
 * shares by largest remainder with a deterministic tie-break on the line key, so
 * the lines re-add to the case to the cent as well.
 *
 * THE RATIOS ARE SCALED INTEGERS, NOT FLOATS. CPI and SPI print as ppm (×10_000):
 * CPI 1.023 prints as 10230. Null is a refused ratio with a reason, never a
 * zero: EV ÷ AC when AC = 0 is refused; SPI when PV = 0 is refused; TCPI when
 * BAC − AC ≤ 0 is refused. A zero in any of these cells would read as "on plan",
 * which is precisely the reassuring blank this doctrine bans.
 *
 * Pure module: no DOM, no storage, no clock, no settings.
 */

const L = { maxCents: 900_000_000_000_000 };
const BIG_MAX = BigInt(L.maxCents);
const bigAbs = (x) => (x < 0n ? -x : x);

/** Cents to a printable integer, or null when the figure does not fit. */
export function printedCents(value) {
  const big = typeof value === 'bigint' ? value : BigInt(Math.trunc(Number(value) || 0));
  if (big > BIG_MAX || big < -BIG_MAX) return null;
  return Number(big);
}

/** The exact sum of a list of integer cents, as `BigInt`. */
export function sumCents(values) {
  return (values || []).reduce((acc, value) => acc + BigInt(Math.trunc(Number(value) || 0)), 0n);
}

const list = (value) => (Array.isArray(value) ? value : []);

/** The shared double-FNV-1a shape (same as capitalRationingSchema). */
function doubleFnv(joined, prefix) {
  let h1 = 0x811c9dc5;
  let h2 = 0x050c5d1f;
  for (let i = 0; i < joined.length; i += 1) {
    const code = joined.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= code;
    h2 = Math.imul(h2, 0x01000193) >>> 0;
    h2 = (h2 + 0x9e3779b9) >>> 0;
  }
  return `${prefix}${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

/**
 * The signature of a BASELINE, not of an ask: a fingerprint of everything the
 * figures depend on — the case, and for every live package its id, budget,
 * increments and line shares. A note is not money and does not move the
 * signature; a re-phase that keeps the budget does.
 */
export function baselineSignature(caseId, packages = []) {
  const parts = [`case:${caseId || ''}`];
  const rows = list(packages)
    .filter((pkg) => pkg && pkg.status !== 'superseded')
    .map((pkg) => ({
      id: String(pkg.id || ''),
      cents: BigInt(Math.trunc(Number(pkg.plannedCents) || 0)).toString(10),
      phases: list(pkg.phases).map((phase) => `${phase.phaseEnd}:${BigInt(Math.trunc(Number(phase.cents) || 0)).toString(10)}`).join(','),
      lines: list(pkg.lineShares).map((share) => `${share.lineKey}:${share.pct}`).join(','),
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const row of rows) {
    parts.push(`pkg:${row.id}|${row.cents}|${row.phases}|${row.lines}`);
  }
  return doubleFnv(parts.join('\n'), 'evbl:');
}

/** The double-FNV ask signature used by RULE-EVL-01. `ev1:` prefix. */
export function earnedValueAskSignature(key, caseId, subject) {
  return doubleFnv(`key:${key || ''}\ncase:${caseId || ''}\nsub:${subject || ''}`, 'ev1:');
}

/**
 * Divide two integers to a printed whole-cent integer, rounded half away from
 * zero. Null when the denominator is zero — or, with the option, non-positive.
 */
export function divideCents(numerator, denominator, { refuseNonPositiveDenominator = false } = {}) {
  const den = BigInt(typeof denominator === 'bigint' ? denominator : Math.trunc(Number(denominator) || 0));
  if (den === 0n) return null;
  if (refuseNonPositiveDenominator && den <= 0n) return null;
  const num = BigInt(typeof numerator === 'bigint' ? numerator : Math.trunc(Number(numerator) || 0));
  const negative = (num < 0n) !== (den < 0n);
  const absN = bigAbs(num);
  const absD = bigAbs(den);
  const quotient = absN / absD;
  const remainder = absN % absD;
  const rounded = remainder * 2n >= absD ? quotient + 1n : quotient;
  return printedCents(negative ? -rounded : rounded);
}

/**
 * Apportion an integer amount of cents across non-negative integer weights by
 * largest remainder, with a deterministic tie-break on the key. Parts re-add to
 * `amount` EXACTLY (for amount ≥ 0). Returns a Map key → printed integer.
 */
export function apportionCents(amount, shares) {
  const rows = list(shares).map((row) => ({
    id: String(row.id),
    weight: BigInt(Math.max(0, Math.trunc(Number(row.weight) || 0))),
  }));
  const totalWeight = rows.reduce((acc, row) => acc + row.weight, 0n);
  const total = BigInt(Math.trunc(Number(amount) || 0));
  const out = new Map(rows.map((row) => [row.id, 0n]));
  if (!rows.length || total === 0n || totalWeight === 0n) return out;
  const negative = total < 0n;
  const absTotal = bigAbs(total);
  const whole = rows.map((row) => {
    const n = absTotal * row.weight;
    return { id: row.id, q: n / totalWeight, r: n % totalWeight };
  });
  let assigned = whole.reduce((acc, row) => acc + row.q, 0n);
  let leftover = absTotal - assigned;
  const order = whole.slice().sort((a, b) =>
    (a.r === b.r ? (a.id < b.id ? -1 : 1) : a.r > b.r ? -1 : 1));
  let i = 0;
  while (leftover > 0n && order.length) {
    const row = order[i % order.length];
    row.q += 1n;
    leftover -= 1n;
    i += 1;
    if (i > rows.length * 2) break;
  }
  for (const row of whole) out.set(row.id, negative ? -row.q : row.q);
  return out;
}

/** A ratio as ppm (×10_000), rounded half away from zero; null when whole = 0. */
export function ppm(part, whole) {
  const denominator = BigInt(Math.trunc(Number(whole) || 0));
  if (denominator === 0n) return null;
  const numerator = BigInt(Math.trunc(Number(part) || 0)) * 10_000n;
  const negative = (numerator < 0n) !== (denominator < 0n);
  const absN = bigAbs(numerator);
  const absD = bigAbs(denominator);
  const quotient = absN / absD;
  const remainder = absN % absD;
  const rounded = remainder * 2n >= absD ? quotient + 1n : quotient;
  return printedCents(negative ? -rounded : rounded);
}

/** Ratio of two scaled-ppm figures as ppm: (a×10_000) ÷ (b×10_000) → ppm. */
export function ppmOfPpm(ppmPart, ppmWhole) {
  if (ppmPart === null || ppmWhole === null) return null;
  return ppm(ppmPart, ppmWhole);
}

/**
 * Earned value for one package: plannedCents × sharePct ÷ 100, rounded half away
 * from zero. Exact rational inputs; integer output.
 */
export function packageEarnedCents(plannedCents, sharePct) {
  const planned = BigInt(Math.trunc(Number(plannedCents) || 0));
  const share = BigInt(Math.trunc(Number(sharePct) || 0));
  return divideCents(planned * share, 100n);
}

/**
 * The three assumption-labelled estimates at completion — each refused
 * SEPARATELY with its own null, never pooled into one "EAC":
 *
 *   atPlan   AC + (BAC − EV)                       future work at the budgeted rate
 *   atCpi    BAC ÷ CPI = BAC × AC ÷ EV             current cost efficiency persists
 *   atCpiSpi AC + remaining·AC·PV ÷ EV²             CPI×SPI persists (a "worst-of" lens)
 *
 * BAC − EV may be negative (EV ahead of plan); estimates then sit BELOW AC and
 * that is the honest reading of the numbers, not an error.
 */
export function estimatesAtCompletion({ bac, ev, pv, ac }) {
  const BAC = BigInt(Math.trunc(Number(bac) || 0));
  const EV = BigInt(Math.trunc(Number(ev) || 0));
  const PV = BigInt(Math.trunc(Number(pv) || 0));
  const AC = BigInt(Math.trunc(Number(ac) || 0));
  const remaining = BAC - EV;

  const atPlan = printedCents(AC + remaining);
  // EAC at CPI = BAC ÷ CPI = BAC × AC ÷ EV
  const atCpi = EV > 0n && AC > 0n ? divideCents(BAC * AC, EV) : null;
  // EAC at CPI×SPI = AC + remaining ÷ (CPI×SPI), CPI×SPI = EV²/(AC·PV)
  //                = AC + remaining × AC × PV ÷ EV²
  const atCpiSpi = EV > 0n && AC > 0n && PV > 0n
    ? divideCents(AC * EV * EV + remaining * AC * PV, EV * EV)
    : null;
  return { atPlan, atCpi, atCpiSpi };
}

/**
 * TCPI — the performance against the remaining budget needed to still land on
 * BAC. Refused when BAC − AC ≤ 0 (no remaining budget to measure against) or
 * when the figure would divide by zero.
 */
export function tcpiPpm({ bac, ev, ac }) {
  const BAC = BigInt(Math.trunc(Number(bac) || 0));
  const EV = BigInt(Math.trunc(Number(ev) || 0));
  const AC = BigInt(Math.trunc(Number(ac) || 0));
  const remainingBudget = BAC - AC;
  if (remainingBudget <= 0n) return null;
  const remainingWork = BAC - EV;
  return ppm(Number(remainingWork), Number(remainingBudget));
}
