/**
 * app/core/domain/mutualAidMath.js — the exact integer kernels of the Mutual-Aid
 * Activation & Resource-Commitment Register (ADR-0244).
 *
 * PURE. No DOM, no storage, no ambient clock, no network. Every figure this
 * register prints about a request validity, a promised arrival, a late arrival,
 * a release grace, a promise-versus-ask comparison or an arrival-versus-promise
 * comparison is computed here from day keys and whole-number quantities, so the
 * same fixture gives the same answer in a test, in the browser and in an
 * exported file.
 *
 * WHY WHOLE DAYS AND WHOLE QUANTITIES. A mutual-aid transaction is declared,
 * lived and defended in days and in counts: "they promised two responders and a
 * pump by Friday, one pump and no responders arrived" is the sentence a
 * commander or a counterparty can act on. Fractional days would invite an
 * argument about the hour the request was sent, which is exactly the ambiguity
 * the record exists to remove. Quantities are exact integers: a promise of two
 * and an arrival of one is a shortfall of one, never a percentage of anything.
 *
 * THE KERNELS:
 *   1. `validityClosesOn` — the last day a request stays open awaiting an answer.
 *   2. `overdueDays` — how many days AFTER a promised day an act is still
 *      missing. The `not-arrived-overdue` figure; never negative.
 *   3. `lateDays` — how many days AFTER a promised day an arrival came. A late
 *      arrival keeps its lateness permanently.
 *   4. `releaseDueOn` — the day the release is owed after a withdrawal, from the
 *      declared grace convention.
 *   5. `coverageOf` — the promise compared against the ask, line by line.
 *   6. `arrivalCoverage` — the arrival compared against the promise, line by
 *      line.
 *
 * The rounding rule is the same one the rest of this workspace uses: a span is
 * floored, so the system never claims a day that has not finished. A lateness of
 * zero is printed as zero rather than as "on time", because the two are
 * different claims and the screen says which.
 */

import { addDays, daysBetween, dayKey } from '../time.js';

/** A stored day key, normalised, or null. Never a partial date. */
export function maaDay(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const key = dayKey(raw);
  return key === raw ? key : null;
}

/**
 * The last day a request stays open awaiting an acceptance. A validity of `n`
 * days opened on day D closes on D + n: the partner is entitled to the whole of
 * that day, and an acceptance on it is in time. Nothing here rounds, and an
 * unreadable input returns null so the caller prints a refusal rather than a
 * plausible deadline.
 */
export function validityClosesOn(openedOn, validityDays) {
  const opened = maaDay(openedOn);
  if (!opened || !Number.isInteger(validityDays) || validityDays < 1) return null;
  return addDays(opened, validityDays);
}

/** Whole days remaining until a due day; negative once it has passed. */
export function daysUntil(nowDay, dueOn) {
  const now = maaDay(nowDay);
  const due = maaDay(dueOn);
  if (!now || !due) return null;
  return daysBetween(now, due);
}

/**
 * How many days a promised act is OVERDUE, or 0. Used for the promised arrival
 * day that passed with no arrival on the record, and for the release grace that
 * passed with no release. Never negative.
 */
export function overdueDays(nowDay, dueOn) {
  const now = maaDay(nowDay);
  const due = maaDay(dueOn);
  if (!now || !due) return null;
  const delta = daysBetween(due, now);
  return delta !== null && delta > 0 ? delta : 0;
}

/** How many days AFTER a promised day an arrival came, or 0. Never negative. */
export function lateDays(arrivedOn, promisedOn) {
  const arrived = maaDay(arrivedOn);
  const promised = maaDay(promisedOn);
  if (!arrived || !promised) return null;
  const delta = daysBetween(promised, arrived);
  return delta !== null && delta > 0 ? delta : 0;
}

/** The day the release is owed after a withdrawal, from the declared grace. */
export function releaseDueOn(withdrawnOn, graceDays) {
  const on = maaDay(withdrawnOn);
  if (!on || !Number.isInteger(graceDays) || graceDays < 0) return null;
  return addDays(on, graceDays);
}

/**
 * Normalise a list of resource lines to the shape the comparison kernels read:
 * `{ kind, quantity }` with a closed kind, a whole quantity inside the declared
 * bounds, sorted by kind then quantity. Lines that cannot be read exactly are
 * dropped and counted by the caller; this function never invents a line.
 */
export function normaliseResourceLines(rows, kindKeys, warnings = []) {
  const out = [];
  const seen = new Set();
  let dropped = 0;
  const list = (value) => (Array.isArray(value) ? value : []);
  for (const row of list(rows)) {
    if (!row || typeof row !== 'object') { dropped += 1; continue; }
    const kind = kindKeys.includes(row.kind) ? row.kind : null;
    const quantity = Number(row.quantity);
    if (!kind || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000) { dropped += 1; continue; }
    const key = `${kind}|${quantity}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind, quantity });
  }
  out.sort((a, b) => a.kind.localeCompare(b.kind) || a.quantity - b.quantity);
  if (dropped) warnings.push(`${dropped} resource line(s) could not be read exactly — an unknown kind or a quantity outside the declared bounds — and were dropped.`);
  return out;
}

/**
 * THE PROMISE COMPARED AGAINST THE ASK. For every asked line, the promised
 * lines of the same kind are summed; the line is covered when the sum is at
 * least the asked quantity. Shortfalls are exact integers per kind — never a
 * percentage, never a rounded figure. Overs (a promise larger than asked) are
 * reported as the separate fact they are: a partner that sends more than was
 * asked has answered a different question, and the register prints it.
 */
export function coverageOf(askedLines, promisedLines) {
  const askByKind = new Map();
  for (const line of askedLines) {
    askByKind.set(line.kind, (askByKind.get(line.kind) || 0) + line.quantity);
  }
  const promisedByKind = new Map();
  for (const line of promisedLines) {
    promisedByKind.set(line.kind, (promisedByKind.get(line.kind) || 0) + line.quantity);
  }
  const shortfalls = [];
  const overs = [];
  for (const [kind, asked] of [...askByKind.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const promised = promisedByKind.get(kind) || 0;
    if (promised < asked) shortfalls.push({ kind, asked, promised, shortfall: asked - promised });
    else if (promised > asked) overs.push({ kind, asked, promised, over: promised - asked });
  }
  return {
    covered: shortfalls.length === 0,
    shortfalls,
    overs,
    askedKinds: [...askByKind.keys()].sort(),
    promisedKinds: [...promisedByKind.keys()].sort(),
  };
}

/**
 * THE ARRIVAL COMPARED AGAINST THE PROMISE. The promised lines are the standard
 * the arrival is measured against: for every promised line, the arrived lines of
 * the same kind are summed. A shortfall is exact per kind; an over-delivery is
 * reported separately and is a fact, not a failure.
 */
export function arrivalCoverage(promisedLines, arrivedLines) {
  return coverageOf(promisedLines, arrivedLines);
}
