/**
 * app/core/domain/valueBridgeMath.js — the exact kernel of the Enterprise Value
 * Bridge (ADR-0214, Session 287, Schema v168).
 *
 * WHAT IT COMPUTES. Two dated readings of one company in one currency, and the
 * exact split of the movement in OWNER EQUITY between them into the four facts
 * that answer to four different people (Koller, Goedhart & Wessels, *Valuation:
 * Measuring and Managing the Value of Companies*, 7th ed., ch. 2–3 and 12–14;
 * Damodaran, *Investment Valuation*, ch. 11 and 17; Rosenbaum & Pearl,
 * *Investment Banking*, ch. 1–2):
 *
 *   equity      = EBITDA × multiple − net debt
 *
 *   operating   = ( organic EBITDA₁ − organic EBITDA₀ ) × multiple₀
 *   perimeter   = ( perimeter adjustment₁ − perimeter adjustment₀ ) × multiple₀
 *   re-rating   = reported EBITDA₁ × ( multiple₁ − multiple₀ )
 *   net debt    = net debt₀ − net debt₁
 *
 *   organic EBITDA = reported EBITDA − perimeter adjustment
 *
 *   identity:  equity₁ − equity₀ = operating + perimeter + re-rating + net debt
 *
 * WHY THE SPLIT IS BUILT THIS WAY. The four legs are four different decisions.
 * OPERATING is what the people running the business did at the multiple the
 * market already paid for it. PERIMETER is what was bought or sold — value the
 * corporate-development seat created by writing a cheque, not by operating
 * anything, and worthless as evidence about a manager who happened to inherit
 * it. RE-RATING is what the market changed its mind about, which no line manager
 * controls and which a chief executive does. NET DEBT is cash: what was
 * generated, paid out, or borrowed. Collapsing them into "value went up 12%"
 * is how a board ends up rewarding a re-rating and blaming a manager for an
 * acquisition.
 *
 * THE TRAP THIS REFUSES. Adding acquired EBITDA to an acquired company's
 * opening base and reading the difference as organic growth is the single most
 * common corruption of a value bridge. Here the perimeter adjustment is
 * DECLARED per reading, and a reading that says "reported" without declaring
 * one is `unseparated`: the total movement is still printed, and the
 * ATTRIBUTION IS REFUSED with a printed reason. No adjustment is ever inferred
 * from a transaction list, a case file or the shape of the numbers.
 *
 * EXACTNESS. EBITDA, net debt and every promise are whole cents held as
 * `BigInt`; a multiple is an exact rational (ten-thousandths of a turn). A
 * multiple applied to cents is generally NOT a whole number of cents, so the
 * kernel reports two separate facts and never merges them:
 *
 *   1. `balances` — the PRINTED whole-cent figures add up: opening equity plus
 *      the four printed legs equals the printed closing equity, re-added from
 *      the printed integers rather than assumed. Sub-cent residues are
 *      distributed by the largest-remainder method (Hamilton apportionment), so
 *      no printed cell is ever a whole cent or more from its exact value.
 *   2. `rounding` — how many printed cells ARE their exact value, how many are
 *      an exact rational printed to the nearest cent, and how many the
 *      apportionment moved off the nearest cent to keep the column adding up,
 *      with the largest such move in thousandths of a cent.
 *
 * The opening/closing enterprise value and net-debt levels are printed for the
 * reader's information and are INDEPENDENTLY rounded: they are not part of the
 * additive claim, and the result says so (`levelClaim: 'independent'`).
 *
 * Pure module: no DOM, no storage, no clock, no settings.
 */

/* ------------------------------------------------------------- rationals */

const bigAbs = (x) => (x < 0n ? -x : x);

function bigGcd(a, b) {
  let x = bigAbs(a);
  let y = bigAbs(b);
  while (y) { [x, y] = [y, x % y]; }
  return x;
}

/** An exact rational in lowest terms with a positive denominator. */
export function rat(n, d = 1n) {
  let num = BigInt(n);
  let den = BigInt(d);
  if (den === 0n) throw new RangeError('valueBridgeMath: zero denominator');
  if (den < 0n) { num = -num; den = -den; }
  const g = bigGcd(num, den) || 1n;
  return Object.freeze({ n: num / g, d: den / g });
}

export const R0 = rat(0n);
export const rAdd = (a, b) => rat(a.n * b.d + b.n * a.d, a.d * b.d);
export const rSub = (a, b) => rat(a.n * b.d - b.n * a.d, a.d * b.d);
export const rMul = (a, b) => rat(a.n * b.n, a.d * b.d);
export const rDiv = (a, b) => rat(a.n * b.d, a.d * b.n);
export const rNeg = (a) => rat(-a.n, a.d);
export const rAbs = (a) => rat(bigAbs(a.n), a.d);
export const rSign = (a) => (a.n < 0n ? -1 : a.n > 0n ? 1 : 0);
export const rCmp = (a, b) => { const x = a.n * b.d - b.n * a.d; return x < 0n ? -1 : x > 0n ? 1 : 0; };
export const rEq = (a, b) => a.n === b.n && a.d === b.d;
export const rIsInt = (a) => a.d === 1n;
export const rSum = (list) => list.reduce((acc, x) => rAdd(acc, x), R0);

/** True mathematical floor, in cents (toward −∞) — never `Math.floor` on a float. */
export function rFloor(a) {
  if (a.n >= 0n) return a.n / a.d;
  return -((-a.n + a.d - 1n) / a.d);
}

/** The fractional part as a rational in [0, 1). */
export function rFrac(a) { return rSub(a, rat(rFloor(a))); }

/** Nearest whole cent, halves away from zero. −0.5 → −1, +0.5 → +1. */
export function rRoundHalfAway(a) {
  const floor = rFloor(a);
  const frac = rSub(a, rat(floor));
  const half = rat(1n, 2n);
  const cmp = rCmp(frac, half);
  if (cmp > 0) return floor + 1n;
  if (cmp < 0) return floor;
  return a.n > 0n ? floor + 1n : floor;
}

/* --------------------------------------------------------- apportionment */

/**
 * Distribute `total` (a rational number of cents) across `parts`, which must add
 * to exactly `total`, by largest remainder. Every printed part is its floor or
 * its floor plus one cent, the printed parts add to the printed total, and ties
 * break by position so the result is deterministic.
 */
export function apportion(total, parts) {
  if (!Array.isArray(parts) || parts.length === 0) {
    return { ok: false, reason: 'apportion: no parts to distribute' };
  }
  if (rCmp(rSum(parts), total) !== 0) {
    return { ok: false, reason: 'apportion: the parts do not add to the total' };
  }
  const totalPrinted = rRoundHalfAway(total);
  const floors = parts.map((part) => rFloor(part));
  const fracs = parts.map((part, index) => rSub(part, rat(floors[index])));
  const residual = totalPrinted - floors.reduce((acc, value) => acc + value, 0n);
  if (residual < 0n) return { ok: false, reason: 'apportion: a negative residual is impossible' };
  if (residual > BigInt(parts.length)) {
    return { ok: false, reason: 'apportion: the residual exceeds the number of parts' };
  }
  const order = fracs
    .map((frac, index) => ({ index, frac }))
    .sort((a, b) => {
      const cmp = rCmp(b.frac, a.frac);
      return cmp !== 0 ? cmp : a.index - b.index;
    });
  const printed = floors.slice();
  for (let k = 0; k < Number(residual); k += 1) printed[order[k].index] += 1n;
  return { ok: true, printed, totalPrinted, residual: Number(residual) };
}

/**
 * Two claims, kept apart: how many printed cells ARE their exact value, how many
 * are their nearest cent, and how many were moved off the nearest cent by the
 * apportionment so the column adds up.
 */
export function roundingStats(cells) {
  let exactN = 0;
  let nearestN = 0;
  let movedN = 0;
  let maxDriftE3 = 0n;
  for (const cell of cells) {
    const nearest = rRoundHalfAway(cell.exact);
    if (rIsInt(cell.exact) && cell.printed === cell.exact.n) exactN += 1;
    else if (cell.printed === nearest) nearestN += 1;
    else movedN += 1;
    const drift = rRoundHalfAway(rMul(rAbs(rSub(rat(cell.printed), cell.exact)), rat(1000n)));
    if (drift > maxDriftE3) maxDriftE3 = drift;
  }
  return { cells: cells.length, exactN, nearestN, movedN, maxDriftE3 };
}

/* ------------------------------------------------------------- primitives */

export const MULTIPLE_SCALE = 10_000n;
/** The largest printed magnitude this kernel will hand back as a safe integer. */
export const MAX_PRINTED_CENTS = 9_000_000_000_000_000n;

/** EBITDA cents × a multiple in ten-thousandths = enterprise value cents. */
export function evCents(ebitdaCents, multipleE4) {
  return rDiv(rMul(rat(BigInt(ebitdaCents)), rat(BigInt(multipleE4))), rat(MULTIPLE_SCALE));
}

/** Enterprise value cents − net debt cents = owner equity value cents. */
export function equityCents(ev, netDebtCents) {
  return rSub(ev, rat(BigInt(netDebtCents)));
}

/** The organic EBITDA a reading carries: reported less its declared perimeter adjustment. */
export function organicEbitdaCents(reading) {
  const adjustment = reading.perimeter === 'organic' ? 0 : (reading.perimeterAdjCents ?? 0);
  return BigInt(reading.ebitdaCents) - BigInt(adjustment);
}

export function perimeterAdjustmentCents(reading) {
  return BigInt(reading.perimeter === 'organic' ? 0 : (reading.perimeterAdjCents ?? 0));
}

/* ------------------------------------------------------------------ legs */

/** The four legs, in bridge order. Key, label and the duty each one answers. */
export const BRIDGE_LEGS = Object.freeze([
  Object.freeze({ key: 'operating', label: 'Operating', owner: 'the line that runs the business', says: 'Organic EBITDA movement at the multiple the market already paid for it. This is the only leg that is evidence about operating managers.' }),
  Object.freeze({ key: 'perimeter', label: 'Perimeter (acquired / disposed)', owner: 'corporate development', says: 'EBITDA that entered or left the perimeter, valued at the opening multiple. A cheque wrote this, not an operator.' }),
  Object.freeze({ key: 'rerating', label: 'Re-rating', owner: 'the market', says: 'Closing EBITDA × the change in the multiple. No line manager controls it; a chief executive and the equity story do.' }),
  Object.freeze({ key: 'debt', label: 'Net debt', owner: 'the finance seat', says: 'Cash generated, paid out, borrowed or repaid. A reduction in net debt is value to the owner; an increase is not.' }),
]);
export const BRIDGE_LEG_KEYS = Object.freeze(BRIDGE_LEGS.map((row) => row.key));
export const bridgeLegByKey = (key) => BRIDGE_LEGS.find((row) => row.key === key) || null;


/**
 * The opening anchor. Normally the nearest cent. At an exact half cent the side
 * is chosen so that the anchor's error and the apportionment's error do not ADD:
 * a +0.5 anchor on top of a +0.5 rounding of the movement would put the printed
 * closing level a whole cent away from its exact value, which this kernel
 * promises never to do. One of the two half-cents is taken on the other side,
 * and `roundingStats` reports that cell as moved rather than hiding it.
 */
function anchorPrinted(exact, partError) {
  const floor = rFloor(exact);
  const frac = rSub(exact, rat(floor));
  if (rCmp(frac, rat(1n, 2n)) !== 0) return rRoundHalfAway(exact);
  const up = floor + 1n;
  const down = floor;
  const errUp = rAdd(rSub(rat(up), exact), partError);
  const errDown = rAdd(rSub(rat(down), exact), partError);
  return rCmp(rAbs(errUp), rAbs(errDown)) <= 0 ? up : down;
}

/* ------------------------------------------------------------- the bridge */

/**
 * The exact bridge between two normalized readings of one currency.
 *
 * `opening`/`closing` are stored rows: { day, currency, ebitdaCents,
 * multipleE4, netDebtCents, perimeter, perimeterAdjCents }. Everything derived
 * is computed here and nowhere else.
 */
export function computeBridge(opening, closing) {
  const e0 = BigInt(opening.ebitdaCents);
  const e1 = BigInt(closing.ebitdaCents);
  const m0 = BigInt(opening.multipleE4);
  const m1 = BigInt(closing.multipleE4);
  const nd0 = BigInt(opening.netDebtCents);
  const nd1 = BigInt(closing.netDebtCents);
  const adj0 = perimeterAdjustmentCents(opening);
  const adj1 = perimeterAdjustmentCents(closing);

  const ev0 = evCents(opening.ebitdaCents, opening.multipleE4);
  const ev1 = evCents(closing.ebitdaCents, closing.multipleE4);
  const eq0 = equityCents(ev0, opening.netDebtCents);
  const eq1 = equityCents(ev1, closing.netDebtCents);

  const flags = {
    stale: false,
    multipleNotMeaningful: e0 <= 0n || e1 <= 0n,
    netCash: nd0 < 0n || nd1 < 0n,
    perimeterMoved: adj0 !== 0n || adj1 !== 0n,
  };

  const unseparated = opening.perimeter === 'unseparated' || closing.perimeter === 'unseparated';
  const levels = {
    openingEvCents: toPrintedNumber(rRoundHalfAway(ev0)),
    closingEvCents: toPrintedNumber(rRoundHalfAway(ev1)),
    openingNetDebtCents: opening.netDebtCents,
    closingNetDebtCents: closing.netDebtCents,
  };
  if (levels.openingEvCents === null || levels.closingEvCents === null) {
    return { ok: false, reason: 'This bridge is too large to print exactly. Split the company into reporting segments.' };
  }

  if (unseparated) {
    const eq0Printed = rRoundHalfAway(eq0);
    const eq1Printed = rRoundHalfAway(eq1);
    const printedEq0 = toPrintedNumber(eq0Printed);
    const printedEq1 = toPrintedNumber(eq1Printed);
    if (printedEq0 === null || printedEq1 === null) {
      return { ok: false, reason: 'This bridge is too large to print exactly. Split the company into reporting segments.' };
    }
    return {
      ok: true,
      state: 'perimeter-undeclared',
      flags,
      exact: { equity0: eq0, equity1: eq1, legs: null },
      printed: {
        openingEquityCents: printedEq0,
        closingEquityCents: printedEq1,
        totalMovementCents: printedEq1 - printedEq0,
        legs: null,
      },
      balances: null,
      balancesReason: 'No attribution is claimed, so no identity is claimed: the two levels are independently rounded.',
      levelClaim: 'independent',
      rounding: {
        cells: 2,
        exactN: [eq0, eq1].filter((value) => rIsInt(value)).length,
        nearestN: 0,
        movedN: 0,
        maxDriftE3: 0n,
      },
      levels,
      withheld: ['operating', 'perimeter', 'rerating', 'debt'],
      withheldReason: 'perimeter-undeclared',
    };
  }

  const operating = rDiv(rMul(rat(e1 - adj1 - e0 + adj0), rat(m0)), rat(MULTIPLE_SCALE));
  const perimeter = rDiv(rMul(rat(adj1 - adj0), rat(m0)), rat(MULTIPLE_SCALE));
  const rerating = rDiv(rMul(rat(e1), rat(m1 - m0)), rat(MULTIPLE_SCALE));
  const debt = rat(nd0 - nd1);
  const legs = [operating, perimeter, rerating, debt];
  const delta = rSub(eq1, eq0);

  // An internal identity, not a data check: if this fails the kernel is wrong.
  if (rCmp(rSum(legs), delta) !== 0) {
    return { ok: false, reason: 'The bridge legs do not re-add to the movement in equity. This is a defect in the kernel, not in the readings; nothing is printed.' };
  }

  const split = apportion(delta, legs);
  if (!split.ok) return { ok: false, reason: split.reason };

  const splitError = rSub(rat(split.totalPrinted), delta);
  const eq0Printed = anchorPrinted(eq0, splitError);
  const printedLegs = split.printed;
  const eq1Printed = eq0Printed + printedLegs.reduce((acc, value) => acc + value, 0n);
  const printedEq0 = toPrintedNumber(eq0Printed);
  const printedEq1 = toPrintedNumber(eq1Printed);
  if (printedEq0 === null || printedEq1 === null) {
    return { ok: false, reason: 'This bridge is too large to print exactly. Split the company into reporting segments.' };
  }
  const printedLegNumbers = printedLegs.map(toPrintedNumber);
  if (printedLegNumbers.some((value) => value === null)) {
    return { ok: false, reason: 'This bridge is too large to print exactly. Split the company into reporting segments.' };
  }

  // Re-added from the PRINTED integers, never assumed from the construction.
  const reAdded = BigInt(printedEq0) + printedLegNumbers.reduce((acc, value) => acc + BigInt(value), 0n);
  const balances = reAdded === BigInt(printedEq1);

  const rounding = roundingStats([
    { printed: eq0Printed, exact: eq0 },
    ...printedLegs.map((printed, index) => ({ printed, exact: legs[index] })),
    { printed: eq1Printed, exact: eq1 },
  ]);

  return {
    ok: true,
    state: 'attributable',
    flags,
    exact: {
      equity0: eq0,
      equity1: eq1,
      legs: { operating, perimeter, rerating, debt },
    },
    printed: {
      openingEquityCents: printedEq0,
      operatingCents: printedLegNumbers[0],
      perimeterCents: printedLegNumbers[1],
      reratingCents: printedLegNumbers[2],
      debtCents: printedLegNumbers[3],
      closingEquityCents: printedEq1,
      totalMovementCents: printedEq1 - printedEq0,
    },
    balances,
    balancesReason: balances
      ? 'Opening equity plus the four printed legs equals the printed closing equity, re-added from the printed cents.'
      : 'The printed legs do not re-add. This is a defect in this register, not in the readings.',
    levelClaim: 'independent',
    rounding: { ...rounding, maxDriftE3: Number(rounding.maxDriftE3) },
    levels,
    withheld: [],
    withheldReason: null,
  };
}

function toPrintedNumber(value) {
  const magnitude = value < 0n ? -value : value;
  if (magnitude > MAX_PRINTED_CENTS) return null;
  return Number(value);
}

/* ------------------------------------------------------- multi-period chain */

/**
 * Compose consecutive attributable bridges into one bridge over the whole span.
 * The legs are the exact sums of the legs printed in between; the printed
 * result is apportioned afresh, so the chain adds up to the chain's own
 * endpoints rather than to a sum of independently rounded pairs.
 */
export function composeBridges(bridges) {
  if (!Array.isArray(bridges) || bridges.length < 2) {
    return { ok: false, reason: 'A chain needs at least two consecutive bridges.' };
  }
  const first = bridges[0];
  const last = bridges[bridges.length - 1];
  const sums = { operating: R0, perimeter: R0, rerating: R0, debt: R0 };
  for (const bridge of bridges) {
    if (!bridge || bridge.ok === false || bridge.state !== 'attributable') {
      return { ok: false, reason: 'A bridge inside this chain has no attribution, so the chain cannot be added.' };
    }
    for (const key of BRIDGE_LEG_KEYS) sums[key] = rAdd(sums[key], bridge.exact.legs[key]);
  }
  const legs = BRIDGE_LEG_KEYS.map((key) => sums[key]);
  const eq0 = first.exact.equity0;
  const eq1 = last.exact.equity1;
  const delta = rSub(eq1, eq0);
  if (rCmp(rSum(legs), delta) !== 0) {
    return { ok: false, reason: 'The chained legs do not re-add to the movement in equity between the chain’s ends.', defect: true };
  }
  const split = apportion(delta, legs);
  if (!split.ok) return { ok: false, reason: split.reason };
  const splitError = rSub(rat(split.totalPrinted), delta);
  const eq0Printed = anchorPrinted(eq0, splitError);
  const eq1Printed = eq0Printed + split.totalPrinted;
  const printedEq0 = toPrintedNumber(eq0Printed);
  const printedEq1 = toPrintedNumber(eq1Printed);
  const legsPrinted = split.printed.map(toPrintedNumber);
  if (printedEq0 === null || printedEq1 === null || legsPrinted.some((value) => value === null)) {
    return { ok: false, reason: 'This chain is too large to print exactly.' };
  }
  const balances = BigInt(printedEq0) + legsPrinted.reduce((acc, value) => acc + BigInt(value), 0n) === BigInt(printedEq1);
  const rounding = roundingStats([
    { printed: eq0Printed, exact: eq0 },
    ...split.printed.map((printed, index) => ({ printed, exact: legs[index] })),
    { printed: eq1Printed, exact: eq1 },
  ]);
  return {
    ok: true,
    state: 'attributable',
    moments: bridges.length + 1,
    fromDay: first.fromDay,
    toDay: last.toDay,
    currency: first.currency,
    exact: { equity0: eq0, equity1: eq1, legs: sums },
    printed: {
      openingEquityCents: printedEq0,
      operatingCents: legsPrinted[0],
      perimeterCents: legsPrinted[1],
      reratingCents: legsPrinted[2],
      debtCents: legsPrinted[3],
      closingEquityCents: printedEq1,
      totalMovementCents: printedEq1 - printedEq0,
    },
    balances,
    balancesReason: balances
      ? 'Opening equity plus the four printed legs equals the printed closing equity across the whole chain, re-added from the printed cents.'
      : 'The printed legs do not re-add. This is a defect in this register, not in the readings.',
    rounding: { ...rounding, maxDriftE3: Number(rounding.maxDriftE3) },
    flags: {
      stale: Boolean(last.flags?.stale),
      multipleNotMeaningful: Boolean(first.flags?.multipleNotMeaningful || last.flags?.multipleNotMeaningful),
      netCash: Boolean(first.flags?.netCash || last.flags?.netCash),
      perimeterMoved: bridges.some((bridge) => bridge.flags?.perimeterMoved),
    },
  };
}

/* ------------------------------------------------------------ plan attainment */

/**
 * What a declared value-creation promise actually delivered.
 *
 * The realised figure is the PRINTED leg in whole cents — the number the panel
 * and the CSV show — never the sub-cent exact value, so a computed shortfall can
 * never disagree with the figure it is printed next to. Where a promise is not
 * backed by a whole cent (or a leg is contested), no attainment is computed.
 */
export function attainment(realisedCents, promisedCents) {
  if (!Number.isSafeInteger(realisedCents) || !Number.isSafeInteger(promisedCents)) return null;
  const value = realisedCents - promisedCents;
  if (!Number.isSafeInteger(value)) return null;
  return value;
}

/* ------------------------------------------------------------- formatting */

/** Whole cents → `DKK 1,234.50`; a figure that cannot be claimed is a dash. */
export function vbMoneyText(currency, cents) {
  if (cents === null || cents === undefined) return '—';
  const value = typeof cents === 'bigint' ? cents : (Number.isSafeInteger(cents) ? BigInt(cents) : null);
  if (value === null) return '—';
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  const whole = String(magnitude / 100n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const centsPart = String(magnitude % 100n).padStart(2, '0');
  return `${negative ? '−' : ''}${currency ? `${currency} ` : ''}${whole}.${centsPart}`;
}

/** A signed movement with its direction in words — never a bare sign. */
export function vbMovementText(currency, cents) {
  if (cents === null || cents === undefined || !Number.isSafeInteger(cents)) return '—';
  if (cents === 0) return `${vbMoneyText(currency, 0)} (no movement)`;
  return `${cents > 0 ? '+' : '−'}${vbMoneyText(currency, Math.abs(cents))}`;
}

/** Ten-thousandths of a turn → `8.5×` / `8.25×`, trailing zeros trimmed. */
export function vbMultipleText(e4) {
  if (!Number.isSafeInteger(e4)) return '—';
  const negative = e4 < 0;
  const magnitude = Math.abs(e4);
  const whole = Math.floor(magnitude / 10000);
  const fraction = String(magnitude % 10000).padStart(4, '0').replace(/0+$/, '');
  return `${negative ? '−' : ''}${whole}${fraction ? `.${fraction}` : ''}×`;
}

/** Thousandths of a cent → `0.49`. */
export function vbDriftText(e3) {
  if (!Number.isSafeInteger(e3)) return '—';
  const whole = Math.floor(e3 / 1000);
  const fraction = String(e3 % 1000).padStart(3, '0').replace(/0+$/, '');
  return `${whole}${fraction ? `.${fraction}` : ''}`;
}
