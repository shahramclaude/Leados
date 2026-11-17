/**
 * app/core/domain/permitToWorkMath.js — the exact integer kernels of the
 * Permit-to-Work, Energy-Isolation & Simultaneous-Operations Register (ADR-0246).
 *
 * PURE. No DOM, no storage, no ambient clock, no network. Every figure this
 * register prints — minutes to expiry, minutes open past expiry, minutes since a
 * test, minutes of overlap between two live permits, degrees of separation between
 * an isolation claim and a limit — is computed here from stored values and the
 * injected clock, so the same fixture gives the same answer in the test, in the
 * browser and in an exported file.
 *
 * WHY WHOLE MINUTES AND NOT A PERCENTAGE. A permit authority reads a clock, not a
 * ratio: "fourteen minutes to expiry" and "ninety minutes past the verification
 * window" are actionable, "0.23 of a shift" is not. `Math.floor` is deliberate and
 * is the one rounding rule in the file: with thirty-nine seconds left, the
 * register says ZERO minutes remain, because a system that rounds the remaining
 * time UP manufactures safety margin that is not there and a system that rounds a
 * lateness DOWN to zero hides a pass. Flooring the remaining span is the only
 * choice that never claims a minute that has not finished, and flooring an
 * elapsed span is the only choice that never claims a minute that has not run.
 *
 * THE EIGHT KERNELS:
 *   1. `instantMs` / `wholeMinutesBetween` — the shared primitive, floored.
 *   2. `validityEndMs` — the instant a declared validity ends, from a start and a
 *      whole-minute validity, refused rather than guessed.
 *   3. `minutesRemaining` / `minutesPast` — the two readings of a deadline, each
 *      floored, each refusing to return a number it could not compute.
 *   4. `overlapMinutes` / `overlapMs` — the exact intersection of two half-open
 *      validity windows, so two permits that abut do not conflict.
 *   5. `atmosphereVerdict` — the reading compared EXACTLY against the permit's own
 *      declared limit, with the direction taken from the declared test, never from
 *      a rule of thumb in the reader.
 *   6. `freshnessStale` — the test compared against the permit's own declared
 *      freshness window.
 *   7. `isolationProved` — applied AND verified inside the permit's own declared
 *      verification window, with the overdue minutes when it is not.
 *   8. `minutesBetweenOrdinal` — deterministic ordering of rows at the same instant.
 */

export const MINUTE_MS = 60_000;

/**
 * An instant as epoch milliseconds, or null.
 *
 * A `Date` is accepted because callers hold one; a string must parse to a finite
 * time. A bare number is REFUSED: an epoch number in a JSON file is as likely to
 * be a duration or a version as an instant, and guessing which would put a
 * manufactured validity on a permit.
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

/** Whole minutes elapsed from `fromMs` to `toMs`, floored; negative if `to` is earlier. */
export function wholeMinutesBetween(fromMs, toMs) {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;
  return Math.floor((toMs - fromMs) / MINUTE_MS);
}

/**
 * The instant a declared validity ends, from the declared start and a whole number
 * of minutes. Refuses a fractional or non-positive validity instead of rounding
 * it, because the whole register runs against this instant.
 */
export function validityEndMs(startMs, validityMinutes) {
  if (!Number.isFinite(startMs)) return null;
  if (!Number.isInteger(validityMinutes) || validityMinutes <= 0) return null;
  return startMs + validityMinutes * MINUTE_MS;
}

/**
 * Whole minutes remaining inside a deadline, floored.
 *
 * Returns 0 AT the deadline (nothing remains, but nothing is past yet) and null
 * only when the deadline itself cannot be computed. A caller that cannot compute a
 * remaining time must print its refusal rather than a zero, because a zero here
 * reads as "expired" and an absent number reads as "still valid" — both lies.
 */
export function minutesRemaining(nowMs, deadlineMs) {
  if (!Number.isFinite(nowMs) || !Number.isFinite(deadlineMs)) return null;
  if (nowMs >= deadlineMs) return 0;
  return Math.floor((deadlineMs - nowMs) / MINUTE_MS);
}

/** Whole minutes past a deadline, or 0 when the deadline has not passed. */
export function minutesPast(nowMs, deadlineMs) {
  if (!Number.isFinite(nowMs) || !Number.isFinite(deadlineMs)) return null;
  if (nowMs <= deadlineMs) return 0;
  return Math.floor((nowMs - deadlineMs) / MINUTE_MS);
}

/** Exact milliseconds two half-open spans share, or 0. */
export function overlapMs(aStartMs, aEndMs, bStartMs, bEndMs) {
  if (![aStartMs, aEndMs, bStartMs, bEndMs].every(Number.isFinite)) return 0;
  const lo = Math.max(aStartMs, bStartMs);
  const hi = Math.min(aEndMs, bEndMs);
  if (hi <= lo) return 0;
  return hi - lo;
}

/** Exact whole minutes two half-open spans share, floored, or 0. */
export function overlapMinutes(aStartMs, aEndMs, bStartMs, bEndMs) {
  const ms = overlapMs(aStartMs, aEndMs, bStartMs, bEndMs);
  return ms <= 0 ? 0 : Math.floor(ms / MINUTE_MS);
}

/**
 * THE ATMOSPHERE VERDICT. Compares one reading against the limit the permit's
 * issuer declared, in the direction the declared test requires.
 *
 * RETURNS A VERDICT, NEVER A BOOLEAN: `pass`, `fail`, or `undeterminable` with the
 * reason. A boolean would collapse "the air is fine" and "nobody can tell" into
 * the same reassuring `true`, which is exactly what the Bulletproof Reliability
 * Mandate forbids on a permit that lets a person into a space.
 *
 * @param {{ testKey: string, limitMin: number, limitMax: number, limitDirection: 'between'|'at-most'|'at-least' }} limit
 * @param {number|null} reading
 */
export function atmosphereVerdict(limit, reading) {
  if (!limit || typeof limit !== 'object') return { verdict: 'undeterminable', reason: 'The permit declares no limit for this test, so nothing can be compared.' };
  if (!Number.isFinite(reading)) return { verdict: 'undeterminable', reason: 'No reading was recorded, so no comparison can be made.' };
  const lo = Number(limit.limitMin);
  const hi = Number(limit.limitMax);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    return { verdict: 'undeterminable', reason: 'The declared limit is unreadable, so the reading cannot be compared to it.' };
  }
  if (limit.limitDirection === 'between') {
    if (lo > hi) return { verdict: 'undeterminable', reason: 'The declared band is inverted, so no reading can satisfy it.' };
    return reading >= lo && reading <= hi
      ? { verdict: 'pass', reason: null }
      : { verdict: 'fail', reason: `The reading ${reading} sits outside the declared band ${lo}–${hi}.` };
  }
  if (limit.limitDirection === 'at-most') {
    return reading <= hi
      ? { verdict: 'pass', reason: null }
      : { verdict: 'fail', reason: `The reading ${reading} exceeds the declared limit of ${hi}.` };
  }
  if (limit.limitDirection === 'at-least') {
    return reading >= lo
      ? { verdict: 'pass', reason: null }
      : { verdict: 'fail', reason: `The reading ${reading} falls below the declared minimum of ${lo}.` };
  }
  return { verdict: 'undeterminable', reason: 'The declared limit direction is unknown, so no comparison can be made.' };
}

/**
 * Is a test older than the freshness window the permit itself declared?
 * Returns `{ stale, minutesSince, minutesOver }` — never a bare boolean, because
 * the exact minutes since the reading is the fact a permit authority acts on.
 */
export function freshnessReading(nowMs, testedMs, freshnessMinutes) {
  if (!Number.isFinite(nowMs) || !Number.isFinite(testedMs)) {
    return { stale: null, minutesSince: null, minutesOver: null, reason: 'The reading instant or the clock is unreadable.' };
  }
  if (!Number.isInteger(freshnessMinutes) || freshnessMinutes <= 0) {
    return { stale: null, minutesSince: null, minutesOver: null, reason: 'The permit declares no freshness window, so staleness cannot be judged.' };
  }
  const minutesSince = wholeMinutesBetween(testedMs, nowMs);
  const over = minutesSince - freshnessMinutes;
  return {
    stale: over > 0,
    minutesSince: minutesSince < 0 ? 0 : minutesSince,
    minutesOver: over > 0 ? over : 0,
    reason: null,
  };
}

/**
 * THE ISOLATION PROOF. An isolation is proved ONLY when a verification instant is
 * on the record AND it falls inside the permit's own declared verification window
 * measured from the applied instant. A verification recorded outside its own
 * declared window is not a proof this register will accept; it is an
 * `isolation-verification-overdue` conflict with the exact minutes, because the
 * control the issuer declared is the control the record is held to.
 *
 * Returns the state, the exact minutes to or past the window, and a printed reason
 * whenever it is not proved.
 */
export function isolationProof({ appliedMs, verifiedMs, verifyWithinMinutes }) {
  const out = {
    proved: false,
    overdue: false,
    minutesAfterApplied: null,
    minutesOverWindow: null,
    reason: null,
  };
  if (!Number.isFinite(appliedMs)) return { ...out, reason: 'The isolation has no readable applied instant.' };
  const within = Number.isInteger(verifyWithinMinutes) && verifyWithinMinutes > 0 ? verifyWithinMinutes : null;
  if (within === null) return { ...out, reason: 'The permit declares no verification window, so no proof can be judged against one.' };
  if (!Number.isFinite(verifiedMs)) {
    return { ...out, reason: `Nothing has been recorded proving this isolation at zero energy inside the permit’s ${within}-minute verification window.` };
  }
  const delta = wholeMinutesBetween(appliedMs, verifiedMs);
  if (delta === null) return { ...out, reason: 'The applied or verified instant is unreadable.' };
  if (delta < 0) {
    return { ...out, minutesAfterApplied: delta, reason: 'The verification is recorded BEFORE the isolation was applied, so it cannot be a proof of this isolation.' };
  }
  const over = delta > within ? delta - within : 0;
  return {
    proved: over === 0,
    overdue: over > 0,
    minutesAfterApplied: delta,
    minutesOverWindow: over > 0 ? over : 0,
    reason: over > 0
      ? `The proof was recorded ${delta} whole minute(s) after the isolation was applied, ${over} whole minute(s) outside the permit’s declared ${within}-minute verification window.`
      : null,
  };
}

/**
 * A deterministic ordinal for a stored row so two rows at the same instant always
 * sort the same way. The reader uses it in every comparator and the suite pins it,
 * because a control whose two readers disagree about "the latest reading" can
 * disagree about whether an atmosphere passed.
 */
export function minutesBetweenOrdinal(aId, bId) {
  return String(aId || '').localeCompare(String(bId || ''));
}

/** A duration for a human to read, from whole minutes. Never used by the CSV. */
export function durationLabel(minutes) {
  if (!Number.isInteger(minutes)) return '—';
  const sign = minutes < 0 ? '−' : '';
  const value = Math.abs(minutes);
  if (value < 60) return `${sign}${value} min`;
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  return rest ? `${sign}${hours} h ${rest} min` : `${sign}${hours} h`;
}
