/**
 * ADR-0255 — closed-window service error-budget evidence (Google SRE).
 * One customer-facing request population, not the Signal Integrity Board's
 * statistical alpha budget. Arithmetic and coverage are two separate claims.
 */
import { addDays, dayKey, daysBetween } from '../time.js';

export const SERVICE_BUDGET_ROUTE = 'service-error-budget';
export const SERVICE_BUDGET_HREF = `#/${SERVICE_BUDGET_ROUTE}`;
export const SERVICE_BUDGET_RIGHTS = Object.freeze({ READ: 'read-service-budget', RECORD: 'record-service-budget' });
export const SERVICE_BUDGET_LIMITS = Object.freeze({ days: 90, papers: 100, stewards: 6, ref: 120, extract: 16_384 });
export const SERVICE_BUDGET_HEADERS = Object.freeze(['day', 'good_events', 'total_events']);
export const SERVICE_BUDGET_LABELS = Object.freeze({
  within: 'Objective met · whole-error headroom remains',
  'no-headroom': 'Objective met · no whole-error headroom',
  exceeded: 'Objective missed',
  withheld: 'Objective not measurable',
});

const L = SERVICE_BUDGET_LIMITS;
const PPM = 1_000_000n;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const EVENTS = /^(?:0|[1-9]\d{0,17})$/;
const CONTROL_EVENTS = /^(?:0|[1-9]\d{0,19})$/; // at most 90 × (10¹⁸ − 1)
const BAD_REF = /[\u0000-\u001f\u007f\u2028\u2029]/u;
const isRef = (v) => typeof v === 'string' && v.length > 0 && v.length <= L.ref && v === v.trim() && !BAD_REF.test(v);
const isDay = (v) => typeof v === 'string' && DAY.test(v) && dayKey(v) === v;
const isCount = (v, pattern) => typeof v === 'string' && pattern.test(v);
export const serviceBudgetFailure = (field, error) => ({ ok: false, field, error });

/** Deliberately accepts only single-line cells. No readable-prefix import. */
export function parseServiceBudgetExtract(text) {
  const fail = (message) => serviceBudgetFailure('extract', message);
  if (typeof text !== 'string' || text.length > L.extract) return fail('Open a CSV or TSV of up to 16 KiB. No partial extract was read.');
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  if (lines.length > L.days + 1) return fail(`The extract exceeds ${L.days} daily rows. No partial extract was read.`);
  const headerLine = lines.shift() || '';
  const sep = headerLine.includes('\t') ? '\t' : ',';
  // These fields have no legal embedded delimiters, quotes or line breaks.
  const tokens = (line) => line.split(sep).map((part) => /^"[^"\r\n]*"$/.test(part) ? part.slice(1, -1) : part);
  const header = tokens(headerLine);
  if (header.length !== SERVICE_BUDGET_HEADERS.length || !SERVICE_BUDGET_HEADERS.every((key) => header.includes(key))) {
    return fail(`Expected exactly these headers: ${SERVICE_BUDGET_HEADERS.join(', ')}.`);
  }
  if (!lines.length) return fail('No daily rows were supplied. An observed day with no eligible events must explicitly report 0 good and 0 total.');
  const [dayIndex, goodIndex, totalIndex] = SERVICE_BUDGET_HEADERS.map((key) => header.indexOf(key));
  const daily = [];
  for (const [index, line] of lines.entries()) {
    const cells = tokens(line);
    if (cells.length !== header.length || !isDay(cells[dayIndex]) || !isCount(cells[goodIndex], EVENTS) || !isCount(cells[totalIndex], EVENTS)) {
      return fail(`Line ${index + 2} needs a valid UTC day and two unsigned whole event counts (up to 18 digits, no leading zeros or separators).`);
    }
    daily.push({ day: cells[dayIndex], good: cells[goodIndex], total: cells[totalIndex] });
  }
  return { ok: true, daily };
}

export function serviceTargetPpm(percent) {
  if (typeof percent !== 'string' || !/^(?:0|[1-9]\d{0,2})(?:\.\d{1,4})?$/.test(percent)) return null;
  const [whole, fractional = ''] = percent.split('.');
  const ppm = Number(whole) * 10_000 + Number(fractional.padEnd(4, '0'));
  return ppm > 0 && ppm <= Number(PPM) ? ppm : null;
}

export function formatServiceTarget(ppm) {
  const whole = Math.floor(ppm / 10_000);
  const fraction = String(ppm % 10_000).padStart(4, '0').replace(/0+$/, '');
  return `${whole}${fraction ? `.${fraction}` : ''}%`;
}

/** Normalise both writes and imports, keeping incomplete but readable evidence. */
export function readServiceBudgetEvidence(input, capturedOn) {
  const { serviceRef, policyRef, sourceRef, startOn, endOn, targetPpm, stewardIds, control, daily } = input || {};
  for (const [field, label] of [['serviceRef', 'Service'], ['policyRef', 'Versioned objective'], ['sourceRef', 'Versioned telemetry extract']]) {
    if (!isRef(input?.[field])) return serviceBudgetFailure(field, `${label} needs a reference of up to ${L.ref} characters, without outer whitespace or control characters.`);
  }
  if (!isDay(startOn) || !isDay(endOn) || endOn < startOn || endOn >= capturedOn || daysBetween(startOn, endOn) >= L.days) {
    return serviceBudgetFailure('endOn', `Use an inclusive UTC window of 1–${L.days} days ending before the capture day.`);
  }
  if (!Number.isInteger(targetPpm) || targetPpm < 1 || targetPpm > Number(PPM)) {
    return serviceBudgetFailure('target', 'Declare the target above 0% and at most 100%, with no more than four decimal places in percent.');
  }
  if (!Array.isArray(stewardIds) || stewardIds.length < 1 || stewardIds.length > L.stewards || !stewardIds.every(isRef)
    || new Set(stewardIds).size !== stewardIds.length) {
    return serviceBudgetFailure('stewardIds', `Choose 1–${L.stewards} distinct service stewards. A person on two lines is still one steward.`);
  }
  if (control !== null && (!isRef(control?.ref) || control.ref.toLowerCase() === sourceRef.toLowerCase()
    || !isCount(control.good, CONTROL_EVENTS) || !isCount(control.total, CONTROL_EVENTS) || BigInt(control.good) > BigInt(control.total))) {
    return serviceBudgetFailure('controlRef', 'Supply a different control source reference and both whole counts (good ≤ total), or leave all three control fields blank.');
  }
  if (!Array.isArray(daily) || !daily.length || daily.length > L.days) {
    return serviceBudgetFailure('extract', `Supply 1–${L.days} daily evidence rows.`);
  }
  const seen = new Set();
  const rows = [];
  for (const [index, row] of daily.entries()) {
    if (!isDay(row?.day) || row.day < startOn || row.day > endOn) {
      return serviceBudgetFailure('extract', `Data row ${index + 1} is outside the declared UTC window or has an invalid day.`);
    }
    if (seen.has(row.day)) return serviceBudgetFailure('extract', `More than one row claims ${row.day}. Consolidate the disjoint source events before recording; no copy was chosen.`);
    if (!isCount(row.good, EVENTS) || !isCount(row.total, EVENTS) || BigInt(row.good) > BigInt(row.total)) {
      return serviceBudgetFailure('extract', `Data row ${index + 1} needs unsigned whole counts with good events no greater than total events.`);
    }
    seen.add(row.day);
    rows.push({ day: row.day, good: row.good, total: row.total });
  }
  rows.sort((a, b) => a.day.localeCompare(b.day));
  return { ok: true, evidence: { serviceRef, policyRef, sourceRef, startOn, endOn, targetPpm, stewardIds: [...stewardIds].sort(),
    control: control === null ? null : { ref: control.ref, good: control.good, total: control.total }, daily: rows } };
}

function gcd(a, b) { while (b !== 0n) [a, b] = [b, a % b]; return a; }
const absolute = (n) => n < 0n ? -n : n;

function ratio(a, b) {
  const d = gcd(a, b);
  return `${a / d}/${b / d}`;
}

/** Only called with validated evidence. All count/ratio output is JSON-safe and exact. */
export function evaluateServiceBudget(evidence) {
  const { startOn, endOn, daily, control, targetPpm } = evidence;
  const missing = [];
  const days = new Set(daily.map((r) => r.day));
  const expectedDays = daysBetween(startOn, endOn) + 1;
  for (let i = 0; i < expectedDays; i += 1) {
    const day = dayKey(addDays(startOn, i));
    if (!days.has(day)) missing.push(day);
  }
  let good = 0n, total = 0n, errors = 0n;
  const rows = daily.map((row) => {
    const g = BigInt(row.good), t = BigInt(row.total), failed = t - g;
    good += g; total += t; errors += failed;
    return { ...row, errors: String(failed) };
  });
  const balances = good + errors === total && rows.length + missing.length === expectedDays;
  const controlMatches = control === null ? null : good === BigInt(control.good) && total === BigInt(control.total);
  const issues = [];
  if (!balances) issues.push(['internal-balance', 'The printed days or event partitions do not reconcile.']);
  if (missing.length) issues.push(['missing-days', 'One or more UTC days are missing. No missing count was treated as zero.']);
  if (controlMatches === null) issues.push(['missing-control', 'A separate control for both good and total events was not supplied.']);
  if (controlMatches === false) issues.push(['control-mismatch', 'The daily sums disagree with the separate control. Compare both counts before using this window.']);
  if (balances && !missing.length && controlMatches === true && total === 0n) issues.push(['no-eligible-events', 'All days and the control report zero eligible events. There is no success rate or burn rate to compute.']);

  const ready = !issues.length;
  const badRatePpm = PPM - BigInt(targetPpm);
  // Floor is intentional: this is the greatest WHOLE count that still meets
  // the exact ratio, not an approximation to an event or a rounded verdict.
  const allowed = ready ? total * badRatePpm / PPM : null;
  const remaining = ready ? allowed - errors : null;
  const verdict = !ready ? 'withheld' : remaining < 0n ? 'exceeded' : remaining === 0n ? 'no-headroom' : 'within';
  const reason = issues.map(([, message]) => message).join(' ');
  const burn = ready && badRatePpm > 0n ? ratio(errors * PPM, total * badRatePpm) : null;
  const receipt = [
    { measure: 'coverage_days', value: String(rows.length), reason: '' },
    { measure: 'expected_days', value: String(expectedDays), reason: '' },
    { measure: 'missing_days', value: String(missing.length), reason: '' },
    { measure: 'printed_rows_balance', value: balances ? 'yes' : 'no', reason: '' },
    { measure: 'recorded_good_events', value: String(good), reason: '' },
    { measure: 'recorded_total_events', value: String(total), reason: '' },
    { measure: 'recorded_error_events', value: String(errors), reason: '' },
    { measure: 'control_good_events', value: control?.good ?? null, reason: control ? '' : 'No separate control supplied.' },
    { measure: 'control_total_events', value: control?.total ?? null, reason: control ? '' : 'No separate control supplied.' },
    { measure: 'control_matches', value: controlMatches === null ? null : controlMatches ? 'yes' : 'no', reason: controlMatches === null ? 'No separate control supplied.' : '' },
    { measure: 'target_percent', value: formatServiceTarget(targetPpm), reason: '' },
    { measure: 'observed_success_fraction', value: ready ? `${good}/${total}` : null, reason },
    { measure: 'whole_errors_allowed', value: ready ? String(allowed) : null, reason },
    { measure: 'whole_error_headroom', value: ready ? String(remaining > 0n ? remaining : 0n) : null, reason },
    { measure: 'errors_over_allowance', value: ready ? String(remaining < 0n ? absolute(remaining) : 0n) : null, reason },
    { measure: 'burn_multiple_fraction', value: burn, reason: ready && burn === null ? 'A 100% objective allows no errors; burn relative to a zero error rate is undefined.' : reason },
    { measure: 'verdict', value: verdict, reason },
  ];
  return { verdict, issues: issues.map(([code, message]) => ({ code, message })), rows, missing, receipt };
}
