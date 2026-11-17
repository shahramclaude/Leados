/**
 * app/core/domain/personalDealingMath.js — the exact day kernels of the
 * Personal-Account Dealing & Insider-List Register (ADR-0245).
 *
 * PURE. No DOM, no storage, no ambient clock, no network. Every figure this
 * register prints about a closed window, a turnaround, a validity or a breach
 * offset is computed here from day keys and whole numbers, so the same fixture
 * gives the same answer in a test, in the browser and in an exported file.
 *
 * WHY WHOLE DAYS. A closed period is declared, lived and defended in days: "the
 * window opened on the 3rd and the results go out on the 24th" is the sentence a
 * compliance officer, an auditor and a regulator all understand. A fractional day
 * would invite an argument about the hour of the trade, which is exactly the
 * ambiguity the record exists to remove. Quantities are whole securities and are
 * never rounded.
 *
 * THE KERNELS
 *   1. `windowSpan` — the FIRST and LAST closed day of an event, from its
 *      declaration. Refuses (null) rather than guessing when the arithmetic
 *      cannot be resolved; the caller must print the refusal.
 *   2. `withinWindow` — is a day inside a half-open-inclusive span? Inclusive on
 *      both ends: the whole of the first and last closed day is closed.
 *   3. `daysInside` — how many days inside the window the offending day sits from
 *      the nearest edge. Zero means it fell on an edge day, which is still inside.
 *   4. `daysLate` — how many days past a due day an act is still missing.
 *   5. `daysLeft` — how many days remain until a due day; negative once passed.
 *   6. `validThrough` — the last day a granted clearance is valid, from the
 *      decision day and the DECLARED validity. There is no default.
 *
 * The rounding rule is the same one the rest of this workspace uses: nothing is
 * rounded, and a span is expressed in whole days that have actually been lived.
 * Zero is printed as zero rather than as "none", because "it fell on the edge
 * day" and "it fell nowhere near the window" are different facts.
 */

import { addDays, daysBetween, dayKey } from '../time.js';

/** A stored day key, normalised, or null. Never a partial date. */
export function dwlDay(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const key = dayKey(raw);
  return key === raw ? key : null;
}

/** A whole day offset inside its declared bounds, or null. Never defaulted. */
export function dwlWholeDays(value, bounds) {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < bounds.min || value > bounds.max) return null;
  return value;
}

/** A whole quantity of securities inside its declared bounds, or null. */
export function dwlQuantity(value, bounds) {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < bounds.min || value > bounds.max) return null;
  return value;
}

/**
 * THE WINDOW SPAN. An event declares its anchor (the public disclosure day) and
 * an EXPLICIT number of whole days before and after it are closed. Both numbers
 * are required — `0` is a legitimate declaration ("no days before"), but a
 * missing one is not, and nothing here substitutes a default.
 *
 * The window opens `beforeDays` before the disclosure day and its last closed
 * day is `afterDays` after it. When `afterDays` is 0 the disclosure day itself is
 * the last closed day: dealing re-opens the day after the market was told, which
 * is the only reading that does not leave a closed period with no end.
 */
export function windowSpan(disclosesOn, beforeDays, afterDays) {
  const anchor = dwlDay(disclosesOn);
  if (!anchor) return null;
  if (!Number.isInteger(beforeDays) || beforeDays < 0) return null;
  if (!Number.isInteger(afterDays) || afterDays < 0) return null;
  const opensOn = addDays(anchor, -beforeDays);
  const closesOn = addDays(anchor, afterDays);
  if (!opensOn || !closesOn) return null;
  return { opensOn, closesOn, anchor, beforeDays, afterDays };
}

/**
 * IS THIS DAY INSIDE THE SPAN? Inclusive on both ends: the whole of the first
 * closed day and the whole of the last closed day are closed. A half-open rule
 * would let a trade on the last declared day read as open, which is precisely the
 * kind of off-by-one nobody would ever notice until an investigation did.
 */
export function withinWindow(day, span) {
  const on = dwlDay(day);
  if (!on || !span?.opensOn || !span?.closesOn) return false;
  return on >= span.opensOn && on <= span.closesOn;
}

/**
 * HOW FAR INSIDE the window the day sits, measured from the nearest edge, or null
 * when it is outside. Zero means it fell on the first or last closed day — still
 * inside, and the figure stays zero rather than being promoted to one.
 */
export function daysInside(day, span) {
  const on = dwlDay(day);
  if (!on || !withinWindow(on, span)) return null;
  const fromFirst = daysBetween(span.opensOn, on);
  const toLast = daysBetween(on, span.closesOn);
  if (fromFirst === null || toLast === null) return null;
  return Math.min(fromFirst, toLast);
}

/** Whole days a due day is OVERDUE, or 0. Never negative. */
export function daysLate(nowDay, dueOn) {
  const now = dwlDay(nowDay);
  const due = dwlDay(dueOn);
  if (!now || !due) return null;
  const delta = daysBetween(due, now);
  return delta !== null && delta > 0 ? delta : 0;
}

/** Whole days remaining until a due day; negative once it has passed. */
export function daysLeft(nowDay, dueOn) {
  const now = dwlDay(nowDay);
  const due = dwlDay(dueOn);
  if (!now || !due) return null;
  return daysBetween(now, due);
}

/** The day a request's declared turnaround runs out. No default exists. */
export function turnaroundDueOn(requestedOn, turnaroundDays) {
  const on = dwlDay(requestedOn);
  if (!on || !Number.isInteger(turnaroundDays) || turnaroundDays < 1) return null;
  return addDays(on, turnaroundDays);
}

/**
 * THE LAST DAY A GRANTED CLEARANCE IS VALID, from the decision day and the
 * DECLARED validity. Nothing here defaults the validity: a clearance with no
 * declared end would approve a trade indefinitely, which is the failure the door
 * refuses by name.
 */
export function validThrough(decidedOn, validityDays) {
  const on = dwlDay(decidedOn);
  if (!on || !Number.isInteger(validityDays) || validityDays < 1) return null;
  return addDays(on, validityDays);
}

/**
 * A SECURITY REFERENCE, normalised: bounded, non-empty, and never fabricated. The
 * register holds what the broker or the instrument writes; it does not resolve an
 * ISIN, look up a price or validate a ticker against a market feed it does not
 * have.
 */
export function dwlSecurityRef(value, bounds) {
  if (typeof value !== 'string') return null;
  const candidate = value.replace(/\s+/g, ' ').trim().slice(0, bounds.max + 40);
  if (candidate.length < bounds.min) return null;
  return candidate.slice(0, bounds.max);
}
