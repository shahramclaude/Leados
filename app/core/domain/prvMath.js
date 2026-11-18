/**
 * app/core/domain/prvMath.js — the exact integer kernels of the Provision &
 * Reimbursement Register (ADR-0250).
 *
 * PURE. No DOM, no storage, no ambient clock, no network, no floating-point money.
 * Every figure this register prints — a best estimate, a provision, a reimbursement
 * asset, a net exposure, a reconciliation gap — is computed here from declared
 * facts, so the same fixture gives the same answer in a test, in the browser and in
 * an exported file.
 *
 * WHY THE EXPECTED VALUE IS AN EXACT DIVISION AND NEVER ROUNDED. IAS 37's
 * probability-weighted expected value is a sum of (probability × amount). A
 * probability in basis points and an amount in integer minor units make every
 * product an integer, so the weighted sum is an integer and the division by 10,000
 * is exact wherever the scenarios are stated in whole minor units. Where it is
 * NOT exact — a half-penny hiding in a weighted sum — the register REFUSES the
 * estimate with its reason rather than rounding it, because a provision rounded
 * into existence is a figure the record does not support.
 *
 * WHY THE ASSET IS CAPPED AT THE PROVISION. IAS 37 (para 53) recognizes a
 * reimbursement only up to the amount of the provision; a recovery larger than
 * the obligation is not an asset beyond the obligation. The excess is printed as a
 * figure, never recognized.
 *
 * WHY MONEY IS INTEGER MINOR UNITS AND NEVER A FLOAT. 0.1 + 0.2 is not 0.3, and a
 * provision schedule that prints a total which does not equal the sum of its rows
 * fails the reliability mandate at the first decimal place. Every amount is an
 * integer number of minor units with a three-letter currency.
 *
 * WHY DAYS ARE COUNTED IN UTC. A carrying or an assessment is dated on a calendar;
 * UTC day boundaries mean no DST shift can move a date by an hour and no locale
 * can move it by a day.
 */

export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

/**
 * An instant as epoch milliseconds, or null.
 *
 * A `Date` is accepted because callers hold one; a string must parse to a finite
 * time. A bare number is refused: an epoch number in a JSON file is as likely to
 * be a duration as an instant.
 */
export function instantMs(value) {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? time : null;
}

/** UTC midnight of the day containing `ms`, or null. */
export function utcDayMs(value) {
  const ms = typeof value === 'number' && Number.isFinite(value) ? value : instantMs(value);
  if (ms === null) return null;
  return Math.floor(ms / DAY_MS) * DAY_MS;
}

/** `YYYY-MM-DD` for the UTC day containing `ms`, or null. */
export function utcDayKey(value) {
  const dayMs = utcDayMs(value);
  if (dayMs === null) return null;
  return new Date(dayMs).toISOString().slice(0, 10);
}

/** Whole calendar days from `from` to `to` (positive when `to` is later). */
export function wholeDaysBetween(from, to) {
  const a = utcDayMs(from);
  const b = utcDayMs(to);
  if (a === null || b === null) return null;
  return Math.round((b - a) / DAY_MS);
}

/**
 * An integer amount in minor units, or null. A fractional, negative, non-numeric
 * or non-finite value is refused — never rounded into the record, because a total
 * built from rounded rows is a total that does not equal its parts.
 */
export function minorUnits(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (!Number.isInteger(value) || value < 0) return null;
  return value;
}

/** An exact sum of integer minor units over rows that carry a readable amount. */
export function sumMinor(rows, pick) {
  let total = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    const amount = pick ? pick(row) : row;
    if (Number.isInteger(amount)) total += amount;
  }
  return total;
}

/**
 * The probability-weighted expected value over declared scenarios.
 *
 * Returns `{ minor, reason }`. `minor` is null when the estimate cannot be
 * supported exactly, and `reason` then says why in the register's own words:
 *   - no scenarios;
 *   - the probabilities do not sum to exactly 10,000 basis points (100%);
 *   - the weighted sum is not a whole number of minor units.
 *
 * A scenario set that is short or over 100% is a declaration error, not a figure
 * to be normalised; the register refuses it and asks for the scenarios to be
 * re-declared.
 */
export function expectedValueMinor(scenarios) {
  const rows = Array.isArray(scenarios) ? scenarios : [];
  if (!rows.length) return { minor: null, reason: 'No scenarios are declared, so no expected value can be computed.' };
  let probabilityTotal = 0;
  let weightedTotal = 0;
  for (const row of rows) {
    const probability = Number.isInteger(row?.probabilityBps) ? row.probabilityBps : null;
    const amount = Number.isInteger(row?.amountMinor) ? row.amountMinor : null;
    if (probability === null || amount === null) {
      return { minor: null, reason: 'A scenario carries a probability or an amount that is not a whole number, so the expected value cannot be computed exactly.' };
    }
    probabilityTotal += probability;
    weightedTotal += probability * amount;
  }
  if (probabilityTotal !== 10_000) {
    return {
      minor: null,
      reason: `The declared probabilities sum to ${probabilityTotal} basis points, not 10,000 (100%). The register refuses to normalise a scenario set that is short or over 100%.`,
    };
  }
  if (weightedTotal % 10_000 !== 0) {
    return {
      minor: null,
      reason: `The probability-weighted sum is ${weightedTotal} hundred-thousandths of a minor unit, which is not a whole minor unit. The register refuses to round an expected value into existence.`,
    };
  }
  return { minor: weightedTotal / 10_000, reason: null };
}

/**
 * The reimbursement asset, capped at the provision.
 *
 * Returns `{ assetMinor, capped, excessMinor, reason }`. `assetMinor` is null
 * when there is no expected reimbursement to recognize (nothing received and no
 * declared virtual certainty on a claimed amount) — a caller must then print
 * `asset-not-recognized`, never a zero that reads as a decision.
 */
export function capAssetMinor({ expectedMinor, provisionMinor }) {
  if (!Number.isInteger(expectedMinor) || expectedMinor <= 0) {
    return { assetMinor: null, capped: false, excessMinor: 0, reason: 'No reimbursement is expected: the insurer has paid nothing and no virtual certainty is declared on a claimed amount.' };
  }
  if (!Number.isInteger(provisionMinor) || provisionMinor <= 0) {
    // A zero provision supports NO asset. Recognizing a reimbursement against an
    // obligation the record does not provide for would invent value, and it would
    // print a figure on a matter the register has already said is unassessed,
    // disclosed-only or remote.
    return { assetMinor: null, capped: false, excessMinor: 0, reason: 'No provision is recognized, so there is no obligation for a reimbursement asset to be recognized against.' };
  }
  if (expectedMinor > provisionMinor) {
    return { assetMinor: provisionMinor, capped: true, excessMinor: expectedMinor - provisionMinor, reason: null };
  }
  return { assetMinor: expectedMinor, capped: false, excessMinor: 0, reason: null };
}

/**
 * The reconciliation of the computed provision against the declared finance
 * carrying. Returns `{ reconciled, gapMinor, reason }`. `gapMinor` is
 * `carried − provision`: positive where the carrying is above the computed
 * provision, negative where it is below. A carrying that is not declared is a
 * refusal (`reconciled: null`), never a silent zero.
 */
export function reconciliation({ provisionMinor, carriedMinor }) {
  if (!Number.isInteger(provisionMinor)) {
    return { reconciled: null, gapMinor: null, reason: 'No computed provision exists for this currency, so no reconciliation can be printed.' };
  }
  if (!Number.isInteger(carriedMinor)) {
    return { reconciled: null, gapMinor: null, reason: 'No finance carrying is declared for this currency, so the register cannot say whether the figures agree.' };
  }
  const gap = carriedMinor - provisionMinor;
  return { reconciled: gap === 0, gapMinor: gap, reason: null };
}

/** Minor units for a human to read, in a declared currency. Screen only; CSV never formats. */
export function moneyLabel(minor, currency = 'GBP') {
  if (!Number.isInteger(minor)) return '—';
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  const major = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, '0');
  return `${sign}${currency} ${major.toLocaleString('en-GB')}.${rest}`;
}

/** A signed day offset for a human to read, e.g. "in 12 days", "9 days ago". */
export function dayLabel(days) {
  if (!Number.isInteger(days)) return '—';
  if (days === 0) return 'today';
  const abs = Math.abs(days);
  const unit = abs === 1 ? 'day' : 'days';
  return days > 0 ? `in ${abs} ${unit}` : `${abs} ${unit} ago`;
}

/** A `YYYY-MM-DD` day for a human to read, from epoch ms. */
export function dayKeyLabel(dayMs) {
  return utcDayKey(dayMs) || '—';
}
