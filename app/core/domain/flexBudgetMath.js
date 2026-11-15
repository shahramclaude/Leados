/**
 * app/core/domain/flexBudgetMath.js — the exact kernel of the Flexible-Budget
 * Variance Statement (ADR-0213, Session 286, Schema v167).
 *
 * WHAT IT COMPUTES. One cost object, one period, one currency. A declared
 * standard (a budgeted quantity and a standard price per variable input, a lump
 * per fixed input, and the planned volume of the activity that drives the
 * variable inputs) is compared with one dated recording of what happened. The
 * single number a review asks about — "you are 134,000 over" — is split into the
 * causes that have different owners (Horngren, Datar & Rajan, *Cost Accounting:
 * A Managerial Emphasis*, ch. 7–8 and 14; Drury, *Management and Cost
 * Accounting*, ch. 17–18):
 *
 *   static-budget variance   = actual − static budget
 *     activity variance      = flexible budget − static budget
 *     flexible-budget var.   = actual − flexible budget
 *       price (pure)         = (AP − SP) × SQ allowed
 *       joint price×quantity = (AP − SP) × (AQ − SQ allowed)
 *       efficiency           = (AQ − SQ allowed) × SP
 *         mix   (pooled)     = (AQ − AQ_pool × budgeted share) × SP
 *         yield (pooled)     = (AQ_pool × budgeted share − SQ allowed) × SP
 *     fixed spending         = actual − lump            (a lump does not flex)
 *     unplanned              = actual                   (no standard exists)
 *
 *   where the flexible budget is the standard restated for the volume of work
 *   ACTUALLY done: SQ allowed = budgeted quantity × actual volume / planned
 *   volume. The textbook two-way split folds the joint term into "price"
 *   (AQ × (AP − SP)), which silently bills the person who set the rate for the
 *   extra quantity somebody else consumed. This kernel keeps the joint term
 *   apart, so a caller can refuse to assign it to one of two owners.
 *
 * EXACTNESS. Every figure is an exact rational over `BigInt` — no float is ever
 * used for money, quantity, price or ratio. A flexible budget is a ratio of two
 * volumes and is generally NOT a whole number of cents, so the kernel reports
 * two separate facts and never merges them:
 *
 *   1. `balances` — the PRINTED whole-cent figures add up, row by row and column
 *      by column. It is established by re-adding the printed integers, not
 *      assumed. Sub-cent residues are distributed by the largest-remainder
 *      method (Hamilton apportionment) inside each identity, so no printed cell
 *      is ever one cent or more away from its exact value.
 *   2. `rounding` — how many printed cells ARE their exact value, how many are
 *      an exact rational shown to the cent, and how many of those the
 *      apportionment moved off the nearest cent to keep the row adding up.
 *
 * Pure module: no DOM, no storage, no clock, no settings.
 */

/* ------------------------------------------------------------- rationals */

const bigAbs = (x) => (x < 0n ? -x : x);
function gcd(a, b) {
  let x = bigAbs(a);
  let y = bigAbs(b);
  while (y) { [x, y] = [y, x % y]; }
  return x;
}

/** An exact rational in lowest terms with a positive denominator. */
export function rat(n, d = 1n) {
  let num = BigInt(n);
  let den = BigInt(d);
  if (den === 0n) throw new RangeError('flexBudgetMath: zero denominator');
  if (den < 0n) { num = -num; den = -den; }
  const g = gcd(num, den) || 1n;
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

/** Floor toward −∞, as a BigInt. */
export function rFloor(a) {
  const q = a.n / a.d;
  return a.n % a.d !== 0n && a.n < 0n ? q - 1n : q;
}

/** Round half to even, as a BigInt — the nearest whole unit, ties to the even one. */
export function rRound(a) {
  const floor = rFloor(a);
  const twice = rSub(rMul(a, rat(2n)), rat(2n * floor)); // 2 × fractional part, in [0, 2)
  const cmp = rCmp(twice, rat(1n));
  if (cmp < 0) return floor;
  if (cmp > 0) return floor + 1n;
  return floor % 2n === 0n ? floor : floor + 1n;
}

const SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const toSafe = (big) => (bigAbs(big) <= SAFE ? Number(big) : null);

/* ------------------------------------------------------------ apportion */

/**
 * Largest-remainder (Hamilton) apportionment of exact parts onto whole units
 * that must add to a whole `total`. Returns `null` when the parts do not sum to
 * within one unit per part of the total — i.e. when the caller's identity is
 * broken, which is a defect to report and never a residue to hide.
 *
 * Each returned unit is `floor(part)` or `floor(part) + 1`, so no part moves a
 * whole unit. Ties go to the earlier part, so the result is reproducible.
 */
export function apportion(parts, total) {
  const want = BigInt(total);
  const floors = parts.map((part) => rFloor(part));
  const deficit = want - floors.reduce((acc, x) => acc + x, 0n);
  if (deficit < 0n || deficit > BigInt(parts.length)) return null;
  const order = parts
    .map((part, index) => ({ index, fraction: rSub(part, rat(floors[index])) }))
    .filter((row) => rSign(row.fraction) > 0)
    .sort((a, b) => rCmp(b.fraction, a.fraction) || a.index - b.index);
  if (deficit > BigInt(order.length)) return null;
  const out = floors.slice();
  for (let i = 0; i < Number(deficit); i += 1) out[order[i].index] += 1n;
  return out;
}

/* ------------------------------------------------------------ materiality */

/**
 * Management by exception, on a DECLARED threshold and on the EXACT figure —
 * never on the rounded one, so a printed cent cannot flip a verdict. Both tests
 * must pass: the absolute floor and the share of the base. A share of zero
 * switches that test off; a base of zero (an unplanned cost) passes it, because
 * anything measured against nothing is all of it.
 */
export function isMaterial(value, base, { floorCents = 0, bp = 0 } = {}) {
  const magnitude = rAbs(value);
  if (rSign(magnitude) === 0) return false;
  if (rCmp(magnitude, rat(BigInt(floorCents))) < 0) return false;
  if (!bp) return true;
  const against = rAbs(base);
  if (rSign(against) === 0) return true;
  return rCmp(rMul(magnitude, rat(10000n)), rMul(rat(BigInt(bp)), against)) >= 0;
}

/** A cost variance is unfavourable when actual exceeds the standard. */
export const direction = (value) => (rSign(value) > 0 ? 'U' : rSign(value) < 0 ? 'F' : 'none');

/** value / |base| in whole basis points, half-even; `null` on a zero base. */
export function shareBp(value, base) {
  const against = rAbs(base);
  if (rSign(against) === 0) return null;
  return toSafe(rRound(rDiv(rMul(value, rat(10000n)), against)));
}

/* ----------------------------------------------------------------- kernel */

/** quantity (thousandths) × price (ten-thousandths of a unit) → exact cents. */
export const costCents = (qtyE3, priceE4) => rat(BigInt(qtyE3) * BigInt(priceE4), 100000n);

const CELL_KEYS = Object.freeze([
  'static', 'activity', 'flex', 'price', 'joint', 'efficiency', 'mix', 'yield',
  'spending', 'unplanned', 'actual', 'total', 'flexVariance',
]);
export const FLEX_CELL_KEYS = CELL_KEYS;

/**
 * The statement. `plan` and `actual` are already-validated stored shapes:
 *
 *   plan   { volumeE3, lines: [{ key, behaviour: 'variable'|'fixed', qtyE3,
 *            priceE4, budgetCents, pool }] }
 *   actual { volumeE3, final, lines: [{ key, qtyE3, cents }],
 *            unplanned: [{ key, cents }] }
 *
 * `final: false` is an interim reading: the period has not ended, the static
 * budget is a full-period figure and no phasing was declared, so the activity
 * variance, the static-budget variance and every fixed-cost variance are
 * WITHHELD (`null`) — the flexible-budget variances of the variable inputs are
 * valid at any cut-off, because the standard is restated for the work done.
 */
export function computeFlexStatement(plan, actual) {
  const planned = BigInt(plan.volumeE3);
  const done = BigInt(actual.volumeE3);
  if (planned <= 0n) return { ok: false, reason: 'no-planned-volume' };
  if (done < 0n) return { ok: false, reason: 'unreadable-volume' };
  const final = actual.final === true;
  const ratio = rat(done, planned);
  const actualByKey = new Map((actual.lines || []).map((row) => [row.key, row]));

  /* Pools: substitutable inputs measured in one unit. A pool of one is a line. */
  const poolMembers = new Map();
  for (const line of plan.lines) {
    if (line.behaviour !== 'variable' || !line.pool) continue;
    if (!poolMembers.has(line.pool)) poolMembers.set(line.pool, []);
    poolMembers.get(line.pool).push(line);
  }
  const poolInfo = new Map();
  for (const [key, members] of poolMembers) {
    if (members.length < 2) { poolInfo.set(key, { pooled: false, reason: 'pool-of-one' }); continue; }
    const budgetQty = members.reduce((acc, line) => acc + BigInt(line.qtyE3), 0n);
    let actualQty = 0n;
    let readable = budgetQty > 0n;
    for (const line of members) {
      const row = actualByKey.get(line.key);
      if (!row || row.qtyE3 === null || row.qtyE3 === undefined) { readable = false; break; }
      actualQty += BigInt(row.qtyE3);
    }
    poolInfo.set(key, readable ? { pooled: true, budgetQty, actualQty } : { pooled: false, reason: 'unreadable-pool' });
  }

  const lines = [];
  const defects = [];
  let cells = 0;
  let exactCells = 0;
  let apportionedCells = 0;

  /** Note one printed cell against its exact value. */
  const note = (exact, printed) => {
    cells += 1;
    if (rIsInt(exact)) { exactCells += 1; return; }
    if (rRound(exact) !== printed) apportionedCells += 1;
  };

  for (const line of plan.lines) {
    const row = actualByKey.get(line.key);
    if (!row) return { ok: false, reason: 'line-missing', key: line.key };
    const actualCents = BigInt(row.cents);
    const exact = Object.fromEntries(CELL_KEYS.map((key) => [key, null]));
    const cents = Object.fromEntries(CELL_KEYS.map((key) => [key, null]));
    exact.actual = rat(actualCents);
    let split = null;
    let pooled = false;
    let poolReason = null;
    let stdQtyAllowed = null;
    let actualPriceE4 = null;

    if (line.behaviour === 'fixed') {
      const lump = rat(BigInt(line.budgetCents));
      exact.static = lump;
      exact.flex = lump;
      if (final) {
        exact.activity = R0;
        exact.spending = rSub(exact.actual, lump);
        exact.total = exact.spending;
        exact.flexVariance = exact.spending;
      }
      // Whole cents by construction: a lump and a recorded cost are both integers.
      cents.static = lump.n;
      cents.flex = lump.n;
      cents.actual = actualCents;
      if (final) {
        cents.activity = 0n;
        cents.spending = actualCents - lump.n;
        cents.total = cents.spending;
        cents.flexVariance = cents.spending;
      }
    } else {
      if (row.qtyE3 === null || row.qtyE3 === undefined) return { ok: false, reason: 'quantity-missing', key: line.key };
      const budgetQty = BigInt(line.qtyE3);
      const actualQty = BigInt(row.qtyE3);
      const stdPrice = BigInt(line.priceE4);
      const staticBudget = costCents(budgetQty, stdPrice);
      const flex = rMul(staticBudget, ratio);
      stdQtyAllowed = rMul(rat(budgetQty), ratio); // thousandths of a unit
      const atStandard = costCents(actualQty, stdPrice); // AQ × SP
      const conventionalPrice = rSub(exact.actual, atStandard);
      const efficiency = rSub(atStandard, flex);
      exact.static = staticBudget;
      exact.flex = flex;
      exact.efficiency = efficiency;
      if (actualQty > 0n) {
        // AP = actual / AQ, in cents per thousandth; SP likewise.
        const actualPrice = rat(actualCents, actualQty);
        const standardPrice = rat(stdPrice, 100000n);
        const gap = rSub(actualPrice, standardPrice);
        exact.price = rMul(gap, stdQtyAllowed);
        exact.joint = rMul(gap, rSub(rat(actualQty), stdQtyAllowed));
        actualPriceE4 = rMul(actualPrice, rat(100000n));
        split = 'three-way';
        if (!rEq(rAdd(exact.price, exact.joint), conventionalPrice)) defects.push(`${line.key}: price + joint ≠ conventional price variance`);
      } else {
        // Nothing was consumed, so no actual price exists to split on.
        exact.price = conventionalPrice;
        split = 'combined';
      }
      const info = line.pool ? poolInfo.get(line.pool) : null;
      if (info && info.pooled) {
        const share = rat(budgetQty, info.budgetQty);
        const atBudgetMix = rMul(rat(info.actualQty), share); // AQ_pool × budgeted share
        const priceUnit = rat(stdPrice, 100000n);
        exact.mix = rMul(rSub(rat(actualQty), atBudgetMix), priceUnit);
        exact.yield = rMul(rSub(atBudgetMix, stdQtyAllowed), priceUnit);
        pooled = true;
        if (!rEq(rAdd(exact.mix, exact.yield), efficiency)) defects.push(`${line.key}: mix + yield ≠ efficiency`);
      } else if (info) {
        poolReason = info.reason;
      }
      exact.flexVariance = rSub(exact.actual, flex);
      if (final) {
        exact.activity = rSub(flex, staticBudget);
        exact.total = rSub(exact.actual, staticBudget);
      }
      // The exact identity this line must satisfy before a cent is printed.
      const causes = rSum([exact.price, exact.joint || R0, exact.efficiency]);
      if (!rEq(causes, exact.flexVariance)) defects.push(`${line.key}: price + joint + efficiency ≠ flexible-budget variance`);

      /* Print, in two levels so NO printed cell is a whole cent from its exact
         value: (A) flexible budget + causes are apportioned onto the recorded
         cost; (B) static budget + activity are apportioned onto the flexible
         budget that level A printed. */
      const partKeys = ['flex', 'price'];
      if (exact.joint !== null) partKeys.push('joint');
      partKeys.push('efficiency');
      const printed = apportion(partKeys.map((key) => exact[key]), actualCents);
      if (!printed) defects.push(`${line.key}: the printed cells could not be reconciled to the recorded cost`);
      const safePrinted = printed || partKeys.map((key) => rRound(exact[key]));
      partKeys.forEach((key, index) => { cents[key] = safePrinted[index]; note(exact[key], safePrinted[index]); });
      cents.actual = actualCents;
      if (final) {
        const base = apportion([exact.static, exact.activity], cents.flex);
        if (!base) defects.push(`${line.key}: static budget and activity could not be reconciled to the printed flexible budget`);
        const safeBase = base || [rRound(exact.static), cents.flex - rRound(exact.static)];
        cents.static = safeBase[0];
        cents.activity = safeBase[1];
        note(exact.static, cents.static);
        note(exact.activity, cents.activity);
        cents.total = actualCents - cents.static;
      }
      cents.flexVariance = actualCents - cents.flex;
      if (pooled) {
        const pair = apportion([exact.mix, exact.yield], cents.efficiency);
        if (!pair) defects.push(`${line.key}: mix and yield could not be reconciled to the printed efficiency variance`);
        const safePair = pair || [rRound(exact.mix), cents.efficiency - rRound(exact.mix)];
        cents.mix = safePair[0];
        cents.yield = safePair[1];
        note(exact.mix, cents.mix);
        note(exact.yield, cents.yield);
      }
    }
    lines.push({
      key: line.key, kind: line.behaviour, pool: line.pool || null, pooled, poolReason, split,
      stdQtyAllowed, actualPriceE4, exact, cents,
    });
  }

  for (const extra of actual.unplanned || []) {
    const amount = BigInt(extra.cents);
    const exact = Object.fromEntries(CELL_KEYS.map((key) => [key, null]));
    const cents = Object.fromEntries(CELL_KEYS.map((key) => [key, null]));
    exact.static = R0; exact.flex = R0; exact.actual = rat(amount); exact.unplanned = rat(amount);
    exact.flexVariance = rat(amount);
    cents.static = 0n; cents.flex = 0n; cents.actual = amount; cents.unplanned = amount; cents.flexVariance = amount;
    if (final) { exact.activity = R0; exact.total = rat(amount); cents.activity = 0n; cents.total = amount; }
    lines.push({ key: extra.key, kind: 'unplanned', pool: null, pooled: false, poolReason: null, split: null, stdQtyAllowed: null, actualPriceE4: null, exact, cents });
  }

  /* Totals: the sum of the cells that were printed, and the sum of the exact ones. */
  const compared = (line) => final || line.kind !== 'fixed';
  const sumCents = (key, filter = () => true) => {
    const rows = lines.filter((line) => filter(line) && line.cents[key] !== null);
    return rows.length ? rows.reduce((acc, line) => acc + line.cents[key], 0n) : null;
  };
  const sumExact = (key, filter = () => true) => {
    const rows = lines.filter((line) => filter(line) && line.exact[key] !== null);
    return rows.length ? rSum(rows.map((line) => line.exact[key])) : null;
  };
  const totalCents = {};
  const totalExact = {};
  for (const key of ['price', 'joint', 'efficiency', 'mix', 'yield', 'unplanned']) {
    totalCents[key] = sumCents(key);
    totalExact[key] = sumExact(key);
  }
  totalCents.actual = sumCents('actual');
  totalExact.actual = sumExact('actual');
  totalCents.comparedActual = sumCents('actual', compared);
  totalExact.comparedActual = sumExact('actual', compared);
  totalCents.comparedFlex = sumCents('flex', compared);
  totalExact.comparedFlex = sumExact('flex', compared);
  totalCents.flex = final ? sumCents('flex') : totalCents.comparedFlex;
  totalExact.flex = final ? sumExact('flex') : totalExact.comparedFlex;
  totalCents.flexVariance = totalCents.comparedActual === null || totalCents.comparedFlex === null ? null : totalCents.comparedActual - totalCents.comparedFlex;
  totalExact.flexVariance = totalExact.comparedActual === null || totalExact.comparedFlex === null ? null : rSub(totalExact.comparedActual, totalExact.comparedFlex);
  if (final) {
    totalCents.static = sumCents('static');
    totalExact.static = sumExact('static');
    totalCents.activity = sumCents('activity');
    totalExact.activity = sumExact('activity');
    totalCents.spending = sumCents('spending');
    totalExact.spending = sumExact('spending');
    totalCents.total = totalCents.actual - totalCents.static;
    totalExact.total = rSub(totalExact.actual, totalExact.static);
  } else {
    totalCents.static = null; totalExact.static = null;
    totalCents.activity = null; totalExact.activity = null;
    totalCents.spending = null; totalExact.spending = null;
    totalCents.total = null; totalExact.total = null;
  }

  /* Pools, as their own rows: efficiency = mix + yield is a pool-level claim. */
  const pools = [];
  for (const [key, info] of poolInfo) {
    const members = lines.filter((line) => line.pool === key);
    if (!info.pooled) { pools.push({ key, pooled: false, reason: info.reason, lineKeys: members.map((line) => line.key) }); continue; }
    const mixExact = rSum(members.map((line) => line.exact.mix));
    const yieldExact = rSum(members.map((line) => line.exact.yield));
    // Independent form of the pool mix variance: AQ_pool × (actual-mix price − budget-mix price).
    const planLines = poolMembers.get(key);
    const budgetMixPrice = rDiv(rSum(planLines.map((line) => costCents(line.qtyE3, line.priceE4))), rat(info.budgetQty));
    const actualAtStd = rSum(planLines.map((line) => costCents(actualByKey.get(line.key).qtyE3, line.priceE4)));
    const independentMix = rSub(actualAtStd, rMul(rat(info.actualQty), budgetMixPrice));
    if (!rEq(independentMix, mixExact)) defects.push(`pool ${key}: the mix variance disagrees with its independent form`);
    pools.push({
      key, pooled: true, lineKeys: members.map((line) => line.key),
      budgetQtyE3: info.budgetQty, actualQtyE3: info.actualQty,
      exact: { efficiency: rSum(members.map((line) => line.exact.efficiency)), mix: mixExact, yield: yieldExact },
      cents: {
        efficiency: members.reduce((acc, line) => acc + line.cents.efficiency, 0n),
        mix: members.reduce((acc, line) => acc + line.cents.mix, 0n),
        yield: members.reduce((acc, line) => acc + line.cents.yield, 0n),
      },
    });
  }

  /* The balance is ESTABLISHED by re-adding the printed integers. */
  const checks = verifyPrinted({ final, lines, totals: totalCents, pools });
  const balances = defects.length === 0 && checks.every((check) => check.ok);

  /* Hand back safe Numbers; a figure beyond the safe range is refused whole. */
  const narrow = (bag) => {
    const out = {};
    for (const [key, value] of Object.entries(bag)) {
      if (value === null || value === undefined) { out[key] = null; continue; }
      const n = toSafe(value);
      if (n === null) return null;
      out[key] = n;
    }
    return out;
  };
  const narrowedTotals = narrow(totalCents);
  if (!narrowedTotals) return { ok: false, reason: 'overflow' };
  const outLines = [];
  for (const line of lines) {
    const narrowed = narrow(line.cents);
    if (!narrowed) return { ok: false, reason: 'overflow' };
    outLines.push({ ...line, cents: narrowed });
  }
  const outPools = [];
  for (const pool of pools) {
    if (!pool.pooled) { outPools.push(pool); continue; }
    const narrowed = narrow(pool.cents);
    if (!narrowed) return { ok: false, reason: 'overflow' };
    outPools.push({ ...pool, cents: narrowed, budgetQtyE3: toSafe(pool.budgetQtyE3), actualQtyE3: toSafe(pool.actualQtyE3) });
  }

  return {
    ok: true,
    final,
    volume: { plannedE3: toSafe(planned), actualE3: toSafe(done), ratio, ratioBp: toSafe(rRound(rMul(ratio, rat(10000n)))), ratioExact: rIsInt(rMul(ratio, rat(10000n))) },
    lines: outLines,
    pools: outPools,
    totals: { exact: totalExact, cents: narrowedTotals },
    rounding: { cells, exactCells, roundedCells: cells - exactCells, apportionedCells },
    checks,
    defects,
    balances,
  };
}

/**
 * Re-add the printed integers. Independent of how they were produced: it reads
 * only whole cents, so it would catch a defect in the apportionment itself.
 */
export function verifyPrinted({ final, lines, totals, pools }) {
  const big = (value) => (value === null || value === undefined ? null : BigInt(value));
  const checks = [];
  let lineIdentity = true;
  let poolIdentity = true;
  for (const line of lines) {
    const c = Object.fromEntries(Object.entries(line.cents).map(([key, value]) => [key, big(value)]));
    if (line.kind === 'variable') {
      const causes = c.price + (c.joint ?? 0n) + c.efficiency;
      if (c.flex + causes !== c.actual) lineIdentity = false;
      if (c.flexVariance !== causes) lineIdentity = false;
      if (final && (c.static + c.activity !== c.flex || c.static + c.total !== c.actual)) lineIdentity = false;
      if (line.pooled && c.mix + c.yield !== c.efficiency) poolIdentity = false;
    } else if (line.kind === 'fixed') {
      if (final && (c.static + c.spending !== c.actual || c.activity !== 0n || c.flex !== c.static)) lineIdentity = false;
    } else if (c.unplanned !== c.actual || c.flex !== 0n) {
      lineIdentity = false;
    }
  }
  checks.push({ key: 'rows', label: 'Every row: standard + its causes = the recorded cost', ok: lineIdentity });
  checks.push({ key: 'pools', label: 'Every pooled row: mix + yield = efficiency', ok: poolIdentity });

  const t = Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, big(value)]));
  const column = (key, filter = () => true) => lines.filter(filter).reduce((acc, line) => (line.cents[key] === null ? acc : acc + big(line.cents[key])), 0n);
  const compared = (line) => final || line.kind !== 'fixed';
  let columnsOk = true;
  for (const key of ['price', 'joint', 'efficiency', 'mix', 'yield', 'unplanned']) {
    if (t[key] !== null && t[key] !== undefined && t[key] !== column(key)) columnsOk = false;
  }
  if (t.actual !== column('actual')) columnsOk = false;
  if (t.comparedActual !== null && t.comparedActual !== column('actual', compared)) columnsOk = false;
  if (t.comparedFlex !== null && t.comparedFlex !== column('flex', compared)) columnsOk = false;
  if (final) {
    for (const key of ['static', 'activity', 'spending']) {
      if (t[key] !== null && t[key] !== column(key)) columnsOk = false;
    }
  }
  checks.push({ key: 'columns', label: 'Every total: the sum of the rows printed above it', ok: columnsOk });

  const causes = (t.price ?? 0n) + (t.joint ?? 0n) + (t.efficiency ?? 0n) + (t.unplanned ?? 0n) + (final ? (t.spending ?? 0n) : 0n);
  // Nothing compared (an interim reading of a plan of lumps only) balances vacuously.
  const nothingCompared = t.comparedFlex === null && t.comparedActual === null;
  let bridgeOk = nothingCompared
    || (t.comparedFlex !== null && t.comparedActual !== null && t.comparedFlex + causes === t.comparedActual && t.flexVariance === causes);
  if (final) bridgeOk = bridgeOk && t.static + t.activity === t.flex && t.static + t.activity + causes === t.actual && t.total === t.activity + causes;
  checks.push({ key: 'bridge', label: final ? 'The bridge: static budget + activity + every cause = actual cost' : 'The bridge: flexible budget + every cause = the cost compared', ok: Boolean(bridgeOk) });

  let poolTotals = true;
  for (const pool of pools || []) {
    if (!pool.pooled) continue;
    const members = lines.filter((line) => line.pool === pool.key);
    const sum = (key) => members.reduce((acc, line) => acc + big(line.cents[key]), 0n);
    if (big(pool.cents.mix) !== sum('mix') || big(pool.cents.yield) !== sum('yield') || big(pool.cents.efficiency) !== sum('efficiency')) poolTotals = false;
    if (big(pool.cents.mix) + big(pool.cents.yield) !== big(pool.cents.efficiency)) poolTotals = false;
  }
  checks.push({ key: 'pool-totals', label: 'Every pool: its mix and yield are the sums of its rows, and add to its efficiency', ok: poolTotals });
  return checks;
}
