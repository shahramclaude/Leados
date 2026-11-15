/**
 * app/core/domain/synergyMath.js — the exact kernel of the Deal Thesis &
 * Synergy Realization Register (ADR-0216, Schema v170).
 *
 * WHAT IS EXACT HERE, AND WHY IT HAS TO BE. Every amount in this register is a
 * whole number of cents. Adding a board's promises is not a place where a float
 * gets the benefit of the doubt: the register's whole claim is that the printed
 * headline is the sum of the printed rows, and that claim is only true if the
 * arithmetic is integer arithmetic. Every sum is taken in `BigInt` and converted
 * back to a printed integer only when it fits the declared range — a total that
 * does not fit is refused (`null` plus a reason), never printed as a rounded
 * approximation.
 *
 * THE IDENTITY THE REGISTER PRINTS. On one deal, with claims grouped by the
 * saving they name:
 *
 *     headline + contested + disSynergy  ===  sumOfRows
 *
 * where `headline` is the sum of UNCONTESTED synergy promises minus the sum of
 * UNCONTESTED dis-synergy promises, `contested` is the same net sum over the
 * groups where two owners claimed one saving, and `sumOfRows` is the plain sum
 * of every live promise with its direction applied. The reader re-adds this from
 * the printed integers and prints `countsReconcile` beside the figures; a
 * workspace whose own rows fail that identity prints `false`, not a total.
 *
 * WHY THE CONTESTED AMOUNT IS HELD OUT. Counting both is double counting.
 * Splitting it between the two claimants is inventing an allocation no human
 * agreed to, and taking the larger is the same invention with a tie-break. The
 * register therefore counts the contested money NOWHERE in the headline, prints
 * it as its own figure beside both names, and leaves the settlement to the
 * people it belongs to.
 *
 * Pure module: no DOM, no storage, no clock, no settings.
 */

const L = { maxCents: 900_000_000_000_000 };
const bigAbs = (x) => (x < 0n ? -x : x);

/** Cents to a printable integer, or null when the figure does not fit. */
export function printedCents(value) {
  const big = typeof value === 'bigint' ? value : BigInt(Math.trunc(Number(value) || 0));
  if (big > BigInt(L.maxCents) || big < BigInt(-L.maxCents)) return null;
  return Number(big);
}

/** The exact sum of a list of integer cents, as `BigInt`. */
export function sumCents(values) {
  return (values || []).reduce((acc, value) => acc + BigInt(Math.trunc(Number(value) || 0)), 0n);
}

/**
 * The exact signed contribution of one claim, in `BigInt`: positive for a
 * synergy, negative for a declared dis-synergy. The sign lives in the EFFECT,
 * never in a reader's guess about a minus sign.
 */
export function signedCents(claim, amountCents = claim?.promisedAnnualCents) {
  const magnitude = BigInt(Math.trunc(Number(amountCents) || 0));
  return claim?.effectKey === 'dis-synergy' ? -magnitude : magnitude;
}

/**
 * Group claims by the saving they name, WITHIN one deal and one direction. A
 * group of two or more is contested. Grouping is by the derived `savingKey`,
 * which the loader recomputes from the reference the leader typed.
 */
export function groupBySaving(claims = []) {
  const groups = new Map();
  for (const claim of claims) {
    const key = `${claim.dealId}|${claim.savingKey}|${claim.effectKey}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(claim);
  }
  const rows = [...groups.entries()]
    .map(([key, members]) => ({
      key,
      dealId: members[0].dealId,
      savingKey: members[0].savingKey,
      effectKey: members[0].effectKey,
      members: members.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
      contested: members.length > 1,
    }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return rows;
}

/**
 * The reconciliation of one deal's promises. `amountOf` lets the caller feed the
 * full promise, the promised-to-date figure or a verified figure through the SAME
 * identity, so every one of those columns proves itself the same way.
 */
export function reconcileClaims(claims = [], amountOf = (claim) => claim.promisedAnnualCents) {
  const groups = groupBySaving(claims);
  let headline = 0n;
  let contested = 0n;
  let sumOfRows = 0n;
  let disSynergy = 0n;
  let contestedCount = 0;
  let contestedPromiseCents = 0n;
  for (const group of groups) {
    for (const member of group.members) {
      const signed = signedCents(member, amountOf(member));
      sumOfRows += signed;
      if (group.contested) {
        contested += signed;
        contestedPromiseCents += bigAbs(signed);
      } else {
        headline += signed;
        if (member.effectKey === 'dis-synergy') disSynergy += bigAbs(signed);
      }
    }
    if (group.contested) contestedCount += 1;
  }
  const identity = headline + contested === sumOfRows;
  return {
    groups,
    contestedGroups: groups.filter((group) => group.contested),
    contestedCount,
    contestedPromiseCents,
    headlineCents: headline,
    contestedCents: contested,
    disSynergyCents: disSynergy,
    sumOfRowsCents: sumOfRows,
    countsReconcile: identity,
    headlinePrinted: printedCents(headline),
    contestedPrinted: printedCents(contested),
    disSynergyPrinted: printedCents(disSynergy),
    sumOfRowsPrinted: printedCents(sumOfRows),
  };
}

/**
 * A share in parts per ten-thousand, rounded half away from zero, or null when
 * the denominator is zero. Used for capture and verification shares: the panel
 * prints one decimal place from this integer, so the percentage it shows is the
 * ratio of the printed integers rather than a float that happens to look right.
 */
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
  const signed = negative ? -rounded : rounded;
  return printedCents(signed);
}

/** One decimal place of a ppm figure, as a printable integer count of tenths. */
export function ppmToTenths(value) {
  if (!Number.isFinite(value)) return null;
  const tenths = Math.round(Number(value) / 100);
  return Number.isFinite(tenths) ? tenths : null;
}

/** The declared materiality band on a target: floor(target × pct / 100), in cents. */
export function materialityBandCents(targetCents, materialityPct) {
  const target = BigInt(Math.trunc(Number(targetCents) || 0));
  const pct = BigInt(Math.trunc(Math.max(0, Number(materialityPct) || 0)));
  return printedCents(target * pct / 100n);
}

/**
 * Payback in whole tenths of a month: cost ÷ (net run-rate ÷ 12), rounded half
 * away from zero. Refused (null) when either side makes the figure meaningless —
 * a non-positive run-rate, a negative cost — so the caller prints a reason
 * instead of `0` or `Infinity`.
 */
export function paybackMonthsX10(costCents, netRunRateCents) {
  const cost = Number(costCents);
  const net = Number(netRunRateCents);
  if (!Number.isFinite(cost) || !Number.isFinite(net)) return null;
  if (cost <= 0 || net <= 0) return null;
  const numerator = BigInt(Math.round(cost)) * 120n;
  const denominator = BigInt(Math.round(net));
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  return printedCents(rounded);
}

/** One decimal place of a months-x10 figure, for printing. */
export function monthsText(monthsX10) {
  if (!Number.isSafeInteger(monthsX10)) return null;
  const whole = Math.trunc(monthsX10 / 10);
  const tenth = Math.abs(monthsX10 % 10);
  return `${whole}.${tenth}`;
}
