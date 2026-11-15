/**
 * app/core/domain/investmentCaseMath.js — the exact discounting kernel of the
 * Investment Case Register (ADR-0208, Schema v162).
 *
 * WHY THIS IS NOT `Math.pow`. A discount factor is `(1 + r) ^ -(days / 365)`: an
 * irrational number for almost every date. `Math.pow` is not required to return
 * the same last bit in every JavaScript engine (JavaScriptCore calls the
 * platform's libm), so a net present value computed with it can differ by one
 * cent between the browser that printed it and the browser that exported it.
 * This workspace's rule is that a displayed figure IS the stored figure, so the
 * kernel does not use floating point at all:
 *
 *   - money is an integer number of cents;
 *   - a rate is an integer number of millionths (1 bp = 100 millionths);
 *   - time is an integer number of days;
 *   - `ln` and `exp` are evaluated in 160-bit binary fixed point with BigInt,
 *     from their power series, with a deterministic number of integer
 *     operations. Integer arithmetic has one answer in every engine.
 *
 * THE ROUNDING RULE, DECLARED. A discounted sum is first snapped to the nearest
 * billionth of a cent and then rounded half away from zero to a whole cent. The
 * snap exists so that a value that is EXACTLY half a cent (a flow of one cent
 * discounted at 100% over 365 days) rounds the way arithmetic says it should,
 * instead of at the mercy of the 49th decimal place.
 *
 * WHAT IS CLAIMED. Every figure is reproducible bit for bit, and agrees to the
 * cent with 80-digit reference arithmetic for flows up to 10^14 cents over 60
 * years (pinned by test against reference vectors). What is NOT claimed: that
 * a net present value is knowable to the cent. The flows are a promise.
 *
 * Day count: Actual/365 Fixed from the declared valuation day — the convention
 * a spreadsheet's XNPV/XIRR uses — so a figure here can be checked against the
 * tool a finance team already trusts.
 *
 * Pure module: no DOM, no storage, no clock, no floating-point transcendental.
 */

const FRAC = 160n;
const ONE = 1n << FRAC;
const HALF = ONE >> 1n;
const NANO = 1_000_000_000n;
const MILLION = 1_000_000n;
const DAYS_PER_YEAR = 365n;
const DAY_MS = 86400000;

/** Below this magnitude (2^-80 of a cent) a discounted sum is read as exactly zero. */
const ZERO_BAND = ONE >> 80n;

/** The integer rate bracket of the internal-rate search, in millionths. */
export const INVESTMENT_IRR_BRACKET = Object.freeze({ minMicro: -999_999, maxMicro: 100_000_000 });

/** Truncating fixed-point multiply. Symmetric about zero, so a series term reaches 0n. */
function fxMul(a, b) {
  const p = a * b;
  return p >= 0n ? p >> FRAC : -((-p) >> FRAC);
}

/** atanh(s) for a fixed-point |s| < 1, from its odd power series. */
function fxAtanh(s) {
  const negative = s < 0n;
  const a = negative ? -s : s;
  const a2 = fxMul(a, a);
  let power = a;
  let sum = a;
  for (let k = 3n; ; k += 2n) {
    power = fxMul(power, a2);
    const term = power / k;
    if (term === 0n) break;
    sum += term;
  }
  return negative ? -sum : sum;
}

/** ln 2 = 2·atanh(1/3), evaluated once with the same series as everything else. */
const LN2 = 2n * fxAtanh(ONE / 3n);
const LN2_HALF = LN2 >> 1n;

/** Natural logarithm of a strictly positive fixed-point number. */
function fxLn(x) {
  if (x <= 0n) throw new RangeError('fxLn: the argument must be strictly positive.');
  // x = m · 2^k with m in [1, 2); then fold m into [0.75, 1.5) so |s| ≤ 0.2.
  let k = x.toString(2).length - 1 - Number(FRAC);
  let m = k >= 0 ? x >> BigInt(k) : x << BigInt(-k);
  if (m > ONE + HALF) { m >>= 1n; k += 1; }
  const s = ((m - ONE) << FRAC) / (m + ONE);
  return BigInt(k) * LN2 + 2n * fxAtanh(s);
}

/** e^y for a fixed-point y of either sign. Underflows to 0n below 2^-160. */
function fxExp(y) {
  let n = y / LN2;
  let f = y - n * LN2;
  if (f > LN2_HALF) { f -= LN2; n += 1n; } else if (f < -LN2_HALF) { f += LN2; n -= 1n; }
  let term = ONE;
  let sum = ONE;
  for (let j = 1n; ; j += 1n) {
    term = fxMul(term, f) / j;
    if (term === 0n) break;
    sum += term;
  }
  return n >= 0n ? sum << n : sum >> (-n);
}

/** ln(1 + r) for a rate in millionths. The rate must exceed -100%. */
function lnOnePlusMicro(micro) {
  return fxLn(ONE + (ONE * BigInt(micro)) / MILLION);
}

/** The discount factor (1 + r)^-(days/365), given ln(1 + r). */
function factorAt(lnOnePlus, days) {
  if (days === 0) return ONE;
  return fxExp(-(lnOnePlus * BigInt(days)) / DAYS_PER_YEAR);
}

const sign = (fx) => (fx > ZERO_BAND ? 1 : fx < -ZERO_BAND ? -1 : 0);

/** Fixed-point cents → whole cents, by the declared rule. Null when not a safe integer. */
function fxToCents(fx) {
  const negative = fx < 0n;
  const a = negative ? -fx : fx;
  const nano = (a * NANO + HALF) >> FRAC;
  const cents = (nano + NANO / 2n) / NANO;
  const out = Number(negative ? -cents : cents);
  return Number.isSafeInteger(out) ? out : null;
}

/** num/den in whole permille, half away from zero. Null when den ≤ 0 or the ratio is unbounded. */
function fxPermille(num, den) {
  if (sign(den) <= 0) return null;
  const negative = num < 0n;
  const a = negative ? -num : num;
  const q = (a * 2000n + den) / (2n * den);
  if (q > 10_000_000n) return null;
  return Number(negative ? -q : q);
}

/** Whole days from one real calendar day to another, or null. */
export function investmentDayOffset(fromDay, toDay) {
  const a = Date.parse(`${fromDay}T00:00:00.000Z`);
  const b = Date.parse(`${toDay}T00:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / DAY_MS);
}

/**
 * Read flows `{ on, kind, cents }` into the kernel's own shape: an integer day
 * offset from the valuation day and a BigInt amount, in date order. A flow dated
 * before the valuation day was already sunk when the case was valued and is not
 * part of the decision, so it makes the whole stream unreadable (null).
 */
function prepare(flows, baseOn) {
  const out = [];
  for (const flow of Array.isArray(flows) ? flows : []) {
    const days = investmentDayOffset(baseOn, flow?.on);
    if (days === null || days < 0 || !Number.isSafeInteger(flow?.cents)) return null;
    out.push({ days, on: flow.on, kind: flow.kind, cents: flow.cents, big: BigInt(flow.cents) });
  }
  out.sort((a, b) => a.days - b.days);
  return out;
}

function presentValue(prepared, lnOnePlus, pick = null) {
  let sum = 0n;
  const cache = new Map();
  for (const flow of prepared) {
    if (pick && !pick(flow)) continue;
    let factor = cache.get(flow.days);
    if (factor === undefined) { factor = factorAt(lnOnePlus, flow.days); cache.set(flow.days, factor); }
    sum += flow.big * factor;
  }
  return sum;
}

/** Net flow per day, in date order, zero-net days removed. One exponent, one coefficient. */
function netByDay(prepared) {
  const byDay = new Map();
  for (const flow of prepared) {
    const row = byDay.get(flow.days) || { days: flow.days, on: flow.on, big: 0n };
    row.big += flow.big;
    byDay.set(flow.days, row);
  }
  return [...byDay.values()].filter((row) => row.big !== 0n).sort((a, b) => a.days - b.days);
}

/**
 * The internal rate of return — printed ONLY where it is unique and means what
 * the reader thinks it means.
 *
 * A dated stream is a generalised polynomial in v = 1/(1 + r) with real
 * exponents; by Descartes' rule of signs in Laguerre's extension it has at most
 * as many positive roots as its coefficients have sign changes, and exactly one
 * when they change sign exactly once. So:
 *   - no sign change         → no rate makes a one-signed stream worth zero;
 *   - one change, out-then-in → exactly one rate (an investment): searched;
 *   - one change, in-then-out → exactly one rate, but it is a BORROWING cost and
 *     "higher is better" reverses, so it is refused rather than printed bare;
 *   - more than one change    → up to that many rates; none is printed.
 *
 * The search is an integer bisection over millionths, so the answer is the
 * largest rate at which the stream is still worth at least zero — a floor, so a
 * printed IRR never overstates.
 */
export function investmentIrr(flows, baseOn) {
  const prepared = prepare(flows, baseOn);
  if (!prepared || !prepared.length) return { state: 'unreadable', micro: null, signChanges: null };
  const net = netByDay(prepared);
  let changes = 0;
  for (let i = 1; i < net.length; i += 1) if ((net[i].big > 0n) !== (net[i - 1].big > 0n)) changes += 1;
  if (!net.length || changes === 0) return { state: 'no-sign-change', micro: null, signChanges: changes };
  if (changes > 1) return { state: 'multiple-sign-changes', micro: null, signChanges: changes };
  if (net[0].big > 0n) return { state: 'inflow-first', micro: null, signChanges: changes };
  const valueAt = (micro) => sign(presentValue(net, lnOnePlusMicro(micro)));
  let lo = INVESTMENT_IRR_BRACKET.minMicro;
  let hi = INVESTMENT_IRR_BRACKET.maxMicro;
  if (valueAt(lo) < 0) return { state: 'below-bracket', micro: null, signChanges: changes };
  if (valueAt(hi) >= 0) return { state: 'above-bracket', micro: null, signChanges: changes };
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (valueAt(mid) >= 0) lo = mid; else hi = mid;
  }
  return { state: 'unique', micro: lo, signChanges: changes };
}

/**
 * Payback read on the DATED flows: the first flow day on which the running total
 * is no longer negative, after it has been negative. No interpolation inside a
 * period — a lump sum arrives on its day, and pretending it trickled in would
 * invent a payback date nobody declared.
 */
function paybackOf(prepared, valueOf, isZeroOrMore, isNegative) {
  let running = 0n;
  let firstOut = null;
  let wentNegative = false;
  const days = [...new Set(prepared.map((flow) => flow.days))];
  for (const day of days) {
    const todays = prepared.filter((flow) => flow.days === day);
    for (const flow of todays) {
      if (firstOut === null && flow.big < 0n) firstOut = flow;
      running += valueOf(flow);
    }
    if (isNegative(running)) wentNegative = true;
    else if (wentNegative && isZeroOrMore(running)) {
      return { state: 'pays-back', on: todays[0].on, days: day - (firstOut ? firstOut.days : 0) };
    }
  }
  if (!wentNegative) return { state: 'never-negative', on: null, days: null };
  return { state: 'not-inside-schedule', on: null, days: null };
}

const KIND = { outlay: 'outlay', benefit: 'benefit', residual: 'residual' };

/**
 * The whole appraisal of one dated stream at one declared rate.
 *
 * `hurdleBp` is the declared hurdle in whole basis points. Every money figure is
 * whole cents; a figure that cannot be claimed is null and carries its reason in
 * `refusals` — never a zero.
 */
export function appraiseInvestment({ flows, baseOn, hurdleBp }) {
  const prepared = prepare(flows, baseOn);
  if (!prepared || !prepared.length || !Number.isInteger(hurdleBp) || hurdleBp < 0) {
    return { ok: false, reason: 'The stream could not be read: a flow is undated, dated before the valuation day, or not a whole number of cents.' };
  }
  const lnHurdle = lnOnePlusMicro(hurdleBp * 100);
  const factors = new Map();
  const factor = (days) => {
    let value = factors.get(days);
    if (value === undefined) { value = factorAt(lnHurdle, days); factors.set(days, value); }
    return value;
  };
  const pv = (pick) => prepared.reduce((sum, flow) => (pick(flow) ? sum + flow.big * factor(flow.days) : sum), 0n);
  const plain = (pick) => prepared.reduce((sum, flow) => (pick(flow) ? sum + flow.big : sum), 0n);
  const isOutlay = (flow) => flow.kind === KIND.outlay;
  const isBenefit = (flow) => flow.kind === KIND.benefit;
  const isResidual = (flow) => flow.kind === KIND.residual;

  const pvOutlayFx = -pv(isOutlay);           // a positive magnitude
  const pvBenefitFx = pv(isBenefit);
  const pvResidualFx = pv(isResidual);
  const npvFx = pvBenefitFx + pvResidualFx - pvOutlayFx;
  const refusals = [];

  const irr = investmentIrr(flows, baseOn);
  const simple = paybackOf(prepared, (flow) => flow.big, (v) => v >= 0n, (v) => v < 0n);
  const discounted = paybackOf(prepared, (flow) => flow.big * factor(flow.days), (v) => sign(v) >= 0, (v) => sign(v) < 0);

  // Peak cash exposure: how deep the running undiscounted total goes, and when.
  let running = 0n;
  let peak = 0n;
  let peakOn = null;
  for (const flow of prepared) {
    running += flow.big;
    if (running < peak) { peak = running; peakOn = flow.on; }
  }

  const piPermille = fxPermille(pvBenefitFx + pvResidualFx, pvOutlayFx);
  if (piPermille === null) refusals.push('profitability-index');
  // How much of the promised return is the residual value alone.
  const returnsFx = pvBenefitFx + pvResidualFx;
  const residualSharePermille = sign(pvResidualFx) > 0 ? fxPermille(pvResidualFx, returnsFx) : null;
  if (irr.state !== 'unique') refusals.push(`irr:${irr.state}`);
  if (simple.state !== 'pays-back') refusals.push(`payback:${simple.state}`);
  if (discounted.state !== 'pays-back') refusals.push(`discounted-payback:${discounted.state}`);

  return {
    ok: true,
    hurdleBp,
    baseOn,
    flowsN: prepared.length,
    horizonDays: prepared[prepared.length - 1].days,
    lastFlowOn: prepared[prepared.length - 1].on,
    npvCents: fxToCents(npvFx),
    npvSign: sign(npvFx),
    pvOutlayCents: fxToCents(pvOutlayFx),
    pvBenefitCents: fxToCents(pvBenefitFx),
    pvResidualCents: fxToCents(pvResidualFx),
    npvExResidualCents: fxToCents(npvFx - pvResidualFx),
    npvExResidualSign: sign(npvFx - pvResidualFx),
    piPermille,
    residualSharePermille,
    irr,
    // IRR minus hurdle, in hundredths of a basis point (millionths): the room the case has.
    marginMicro: irr.state === 'unique' ? irr.micro - hurdleBp * 100 : null,
    payback: simple,
    discountedPayback: discounted,
    peakExposureCents: Number(-peak),
    peakExposureOn: peakOn,
    undiscounted: {
      outlayCents: Number(-plain(isOutlay)),
      benefitCents: Number(plain(isBenefit)),
      residualCents: Number(plain(isResidual)),
      netCents: Number(plain(() => true)),
    },
    refusals,
  };
}

/**
 * What a post-completion review can and cannot say.
 *
 * `promised` and `actual` are flow lists in the SAME currency and basis,
 * discounted at the SAME declared rate to the SAME valuation day, so the two
 * present values are comparable and their ratio is dimensionless.
 *
 *   benefit ratio  PV(actual benefits to the cut-off) / PV(benefits PROMISED to
 *                  the cut-off). The promise was dated, so a benefit that has not
 *                  arrived by its date is a shortfall today — in present-value
 *                  terms a late benefit is a smaller one.
 *   cost ratio     PV(all actual outlays) / PV(all promised outlays) — printed
 *                  ONLY when the review declares the outlay complete. While money
 *                  is still going out, "spent less than planned so far" cannot be
 *                  told apart from "running late", and this register holds no
 *                  progress measure that could tell them apart.
 *   evidence NPV   actuals to the cut-off plus the ORIGINAL promise for what is
 *                  dated after it. Also only with the outlay complete, for the
 *                  same reason: otherwise unspent money silently leaves the sum.
 *
 * No new forecast is invented anywhere: what is not yet evidence is carried at
 * exactly the figure that was promised.
 */
export function reviewInvestment({ promised, actual, baseOn, hurdleBp, cutoffOn, outlayComplete }) {
  const promisedFlows = prepare(promised, baseOn);
  const actualFlows = prepare(actual, baseOn);
  const cutoffDays = investmentDayOffset(baseOn, cutoffOn);
  if (!promisedFlows || !actualFlows || cutoffDays === null || cutoffDays < 0 || !Number.isInteger(hurdleBp) || hurdleBp < 0) {
    return { ok: false, reason: 'The review could not be read against its case: a flow or the cut-off is undated or precedes the valuation day.' };
  }
  if (actualFlows.some((flow) => flow.days > cutoffDays)) {
    return { ok: false, reason: 'An actual flow is dated after the review cut-off. A review states what happened up to its cut-off, never after it.' };
  }
  const lnHurdle = lnOnePlusMicro(hurdleBp * 100);
  const toDate = (flow) => flow.days <= cutoffDays;
  const after = (flow) => flow.days > cutoffDays;
  const kind = (key) => (flow) => flow.kind === key;
  const both = (a, b) => (flow) => a(flow) && b(flow);

  const pvBenefitPromisedToDateFx = presentValue(promisedFlows, lnHurdle, both(kind(KIND.benefit), toDate));
  const pvBenefitActualFx = presentValue(actualFlows, lnHurdle, kind(KIND.benefit));
  const pvOutlayPromisedFx = -presentValue(promisedFlows, lnHurdle, kind(KIND.outlay));
  const pvOutlayActualFx = -presentValue(actualFlows, lnHurdle, kind(KIND.outlay));
  const pvResidualActualFx = presentValue(actualFlows, lnHurdle, kind(KIND.residual));
  const plain = (list, pick) => Number(list.reduce((sum, flow) => (pick(flow) ? sum + flow.big : sum), 0n));

  const refusals = [];
  const benefitPermille = fxPermille(pvBenefitActualFx, pvBenefitPromisedToDateFx);
  if (benefitPermille === null) refusals.push('benefit-ratio:no-benefit-promised-by-cutoff');
  let costPermille = null;
  let evidenceNpvFx = null;
  if (outlayComplete === true) {
    costPermille = fxPermille(pvOutlayActualFx, pvOutlayPromisedFx);
    if (costPermille === null) refusals.push('cost-ratio:no-outlay-promised');
    const remainingPromiseFx = presentValue(promisedFlows, lnHurdle, (flow) => after(flow) && flow.kind !== KIND.outlay);
    evidenceNpvFx = presentValue(actualFlows, lnHurdle) + remainingPromiseFx;
  } else {
    refusals.push('cost-ratio:outlay-open');
    refusals.push('evidence-npv:outlay-open');
  }

  return {
    ok: true,
    cutoffOn,
    outlayComplete: outlayComplete === true,
    benefitPermille,
    costPermille,
    evidenceNpvCents: evidenceNpvFx === null ? null : fxToCents(evidenceNpvFx),
    evidenceNpvSign: evidenceNpvFx === null ? null : sign(evidenceNpvFx),
    pvBenefitPromisedToDateCents: fxToCents(pvBenefitPromisedToDateFx),
    pvBenefitActualCents: fxToCents(pvBenefitActualFx),
    pvOutlayPromisedCents: fxToCents(pvOutlayPromisedFx),
    pvOutlayActualCents: fxToCents(pvOutlayActualFx),
    pvResidualActualCents: fxToCents(pvResidualActualFx),
    undiscounted: {
      benefitPromisedToDateCents: plain(promisedFlows, both(kind(KIND.benefit), toDate)),
      benefitActualCents: plain(actualFlows, kind(KIND.benefit)),
      outlayPromisedCents: -plain(promisedFlows, kind(KIND.outlay)),
      outlayPromisedToDateCents: -plain(promisedFlows, both(kind(KIND.outlay), toDate)),
      outlayActualCents: -plain(actualFlows, kind(KIND.outlay)),
      residualActualCents: plain(actualFlows, kind(KIND.residual)),
    },
    refusals,
  };
}

/**
 * The promise re-read at a track record: benefits scaled by the benefit ratio,
 * outlays by the cost ratio, the residual carried as promised (the register
 * holds no evidence about residuals and says so). Ratios are whole permille, so
 * the adjustment is exact integer arithmetic on the same present values.
 */
export function adjustInvestment({ flows, baseOn, hurdleBp, costPermille, benefitPermille }) {
  const prepared = prepare(flows, baseOn);
  if (!prepared || !prepared.length || !Number.isInteger(hurdleBp) || hurdleBp < 0
    || !Number.isInteger(costPermille) || !Number.isInteger(benefitPermille) || costPermille < 0) {
    return { ok: false, reason: 'The adjustment needs a readable stream and two whole-permille ratios.' };
  }
  const lnHurdle = lnOnePlusMicro(hurdleBp * 100);
  const kind = (key) => (flow) => flow.kind === key;
  const pvOutlayFx = -presentValue(prepared, lnHurdle, kind(KIND.outlay));
  const pvBenefitFx = presentValue(prepared, lnHurdle, kind(KIND.benefit));
  const pvResidualFx = presentValue(prepared, lnHurdle, kind(KIND.residual));
  const scaled = (pvBenefitFx * BigInt(benefitPermille) - pvOutlayFx * BigInt(costPermille)) / 1000n + pvResidualFx;
  return { ok: true, npvCents: fxToCents(scaled), npvSign: sign(scaled) };
}

/** Median of whole numbers; an even count takes the mean of the two middles, half up. */
export function investmentMedian(values) {
  const sorted = [...values].filter((value) => Number.isInteger(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.floor((sorted[mid - 1] + sorted[mid] + 1) / 2);
}

/** The kernel's own constants, exported so the Method card prints them rather than paraphrasing. */
export const INVESTMENT_MATH = Object.freeze({
  fractionBits: Number(FRAC),
  dayCount: 'Actual/365 Fixed',
  rounding: 'nearest billionth of a cent, then half away from zero to a whole cent',
  rateUnit: 'millionths (hundredths of a basis point)',
  irrRounding: 'the largest whole millionth at which the stream is still worth at least zero',
});
