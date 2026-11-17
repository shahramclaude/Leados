/**
 * ADR-0239 — budget commitment maturity lens.
 *
 * A time-bucketed reading of active budget encumbrances already on the record.
 * It does not model cash, bank balances, receipts, payment terms, liquidity or
 * a payment date: expectedOn is the date the budget owner declared for a line.
 * Amounts stay in their recorded currency. Rows are aggregate-only and small
 * cells are withheld.
 */
import { addDays, dayKey, daysBetween } from '../time.js';

export const BUDGET_MATURITY_WEEKS = 13;
export const BUDGET_MATURITY_PRIVACY_FLOOR = 3;
export const BUDGET_MATURITY_CSV_SCOPE = 'budget-commitment-maturity';
export const BUDGET_MATURITY_CSV_DESCRIPTOR = Object.freeze({
  key: BUDGET_MATURITY_CSV_SCOPE,
  label: 'Budget commitment maturity (overdue and 13-week declared due-date buckets)',
  group: 'analytics',
  sensitive: false,
  filenameSlug: 'budget-commitment-maturity',
  description: 'Aggregate-only per-currency encumbrance timing. Expected dates are not cash dates; committed and planned amounts stay separate; currencies are not converted. Amounts and counts below a floor of three are blank with a reason. No budget name/id, line id, person, owner, note or free text.',
});
export const BUDGET_MATURITY_CSV_COLUMNS = Object.freeze([
  'record_type', 'currency', 'week', 'starts_on', 'ends_on', 'amount_cents',
  'line_n', 'row_reason',
]);
export const BUDGET_MATURITY_METHOD = Object.freeze({
  horizonWeeks: BUDGET_MATURITY_WEEKS,
  bucketDays: 7,
  privacyFloor: BUDGET_MATURITY_PRIVACY_FLOOR,
  includedStatuses: Object.freeze(['committed', 'planned']),
  excludedStatuses: Object.freeze(['spent', 'released']),
  amountBasis: 'committedAmount parsed as exact whole cents from its stored decimal representation',
  dateBasis: 'expectedOn, a budget-owner expectation; not a cash-settlement date',
  framework: 'Commitment/encumbrance accounting and maturity laddering; a planning lens, not liquidity forecasting.',
});

const validDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && Number.isFinite(Date.parse(`${v}T00:00:00Z`))
  && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

function cents(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const raw = String(value).trim();
  if (!/^\d{1,13}(?:\.\d{1,2})?$/.test(raw)) return null;
  const [whole, fraction = ''] = raw.split('.');
  const result = BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
  return result <= BigInt(Number.MAX_SAFE_INTEGER) ? result : null;
}

const bucketId = (index) => index < 0 ? 'overdue' : `week-${index + 1}`;

function makeBucket(currency, kind, index, asOf) {
  const startsOn = index < 0 ? null : addDays(asOf, index * 7);
  return {
    key: `${currency}|${kind}|${bucketId(index)}`,
    recordType: kind,
    currency,
    week: index < 0 ? 'overdue' : index + 1,
    startsOn,
    endsOn: startsOn ? addDays(startsOn, 6) : null,
    amount: 0n,
    lineN: 0,
    unpricedN: 0,
    withheld: false,
    reason: null,
  };
}

/**
 * Read all active envelopes once and place each open line in at most one
 * currency/status/week cell. Cross-envelope overlap cannot be identified from
 * this schema, so sums are explicitly gross declared encumbrances, not a
 * consolidated cash position. No person/line identity is returned.
 */
export function buildBudgetMaturity(state, { now = new Date() } = {}) {
  const asOf = dayKey(now instanceof Date ? now : new Date(now));
  if (!asOf) {
    return {
      asOf: null,
      horizonWeeks: BUDGET_MATURITY_WEEKS,
      privacyFloor: BUDGET_MATURITY_PRIVACY_FLOOR,
      rows: [],
      activeEnvelopeN: 0,
      sourceLineN: 0,
      placedLineN: 0,
      unplacedLineN: 0,
      beyondHorizonN: 0,
      unpricedLineN: 0,
      duplicateSourceN: 0,
      invalidCurrencyN: 0,
      invalidRowN: 0,
      partitionReconciles: false,
      figuresComplete: false,
      reason: 'The as-of day is unreadable; no date bucket can be computed.',
      method: BUDGET_MATURITY_METHOD,
    };
  }
  const budgets = (Array.isArray(state?.budgets) ? state.budgets : []).filter((row) => row?.status === 'active');
  const candidates = [];
  let sourceLineN = 0;
  let invalidCurrencyN = 0;
  let invalidRowN = 0;
  let unplacedLineN = 0;
  const lineKeys = new Set();
  const sourceRefs = new Map();

  for (const budget of budgets) {
    const currency = typeof budget.currency === 'string' && /^[A-Z]{3}$/.test(budget.currency.toUpperCase())
      ? budget.currency.toUpperCase() : null;
    for (const line of Array.isArray(budget.lines) ? budget.lines : []) {
      if (!line || !['committed', 'planned'].includes(line.status)) continue;
      sourceLineN += 1;
      const lineKey = budget.id && line.id ? `${budget.id}|${line.id}` : null;
      if (!lineKey || lineKeys.has(lineKey)) { invalidRowN += 1; unplacedLineN += 1; continue; }
      lineKeys.add(lineKey);
      if (!currency) { invalidCurrencyN += 1; unplacedLineN += 1; continue; }
      const kind = line.status === 'committed' ? 'committed' : 'planned';
      const ref = line.sourceType && line.sourceId ? `${line.sourceType}|${line.sourceId}` : null;
      const candidate = { budgetId: budget.id, lineId: line.id, currency, kind, ref, day: line.expectedOn, amount: cents(line.committedAmount) };
      candidates.push(candidate);
      if (ref) {
        if (!sourceRefs.has(ref)) sourceRefs.set(ref, []);
        sourceRefs.get(ref).push(candidate);
      }
    }
  }

  const duplicateCandidates = new Set();
  for (const matches of sourceRefs.values()) {
    if (matches.length > 1) for (const row of matches) duplicateCandidates.add(row);
  }
  const buckets = new Map();
  const unknownDateKinds = new Set();
  const ambiguousCurrencies = new Set();
  let duplicateSourceN = 0;
  let placedLineN = 0;
  let unpricedLineN = 0;
  let beyondHorizonN = 0;

  const getBucket = (currency, kind, index) => {
    const key = `${currency}|${kind}|${bucketId(index)}`;
    if (!buckets.has(key)) buckets.set(key, makeBucket(currency, kind, index, asOf));
    return buckets.get(key);
  };

  for (const row of candidates) {
    if (duplicateCandidates.has(row)) {
      duplicateSourceN += 1;
      unplacedLineN += 1;
      ambiguousCurrencies.add(row.currency);
      continue;
    }
    const offset = validDay(row.day) ? daysBetween(asOf, row.day) : null;
    if (!Number.isInteger(offset)) {
      unplacedLineN += 1;
      unknownDateKinds.add(`${row.currency}|${row.kind}`);
      continue;
    }
    const index = offset < 0 ? -1 : Math.floor(offset / 7);
    if (index >= BUDGET_MATURITY_WEEKS) {
      beyondHorizonN += 1;
      continue;
    }
    const bucket = getBucket(row.currency, row.kind, index);
    bucket.lineN += 1;
    placedLineN += 1;
    if (row.amount === null) {
      bucket.unpricedN += 1;
      unpricedLineN += 1;
    } else bucket.amount += row.amount;
  }

  const currencies = [...new Set(candidates.map((row) => row.currency))].sort();
  const rows = [];
  for (const currency of currencies) {
    for (const kind of ['committed', 'planned']) {
      for (let index = -1; index < BUDGET_MATURITY_WEEKS; index += 1) {
        const cell = buckets.get(`${currency}|${kind}|${bucketId(index)}`)
          || makeBucket(currency, kind, index, asOf);
        const unknownDate = unknownDateKinds.has(`${currency}|${kind}`);
        if (invalidRowN > 0) {
          cell.withheld = true;
          cell.reason = 'One or more open lines have unreadable identity fields; zero and aggregate claims are withheld.';
        } else if (ambiguousCurrencies.has(currency)) {
          cell.withheld = true;
          cell.reason = 'A duplicate source reference makes this currency’s placement ambiguous; affected amounts are withheld.';
        } else if (unknownDate) {
          cell.withheld = true;
          cell.reason = 'One or more open lines in this currency have no readable expected date; a zero for a specific week cannot be claimed.';
        } else if (cell.unpricedN) {
          cell.withheld = true;
          cell.reason = `${cell.unpricedN} placed line(s) in this cell have no readable exact-cent amount.`;
        } else if (cell.lineN > 0 && cell.lineN < BUDGET_MATURITY_PRIVACY_FLOOR) {
          cell.withheld = true;
          cell.reason = `Below the declared privacy floor of ${BUDGET_MATURITY_PRIVACY_FLOOR} open lines.`;
        } else if (cell.lineN === 0 && invalidCurrencyN > 0) {
          cell.withheld = true;
          cell.reason = 'An active open line has no valid currency, so an empty cell cannot be certified as zero.';
        }
        rows.push({
          recordType: kind,
          currency,
          week: cell.week,
          startsOn: cell.startsOn,
          endsOn: cell.endsOn,
          amountCents: cell.withheld ? null : cell.amount.toString(),
          lineN: cell.withheld ? null : cell.lineN,
          rowReason: cell.reason,
          withheld: cell.withheld,
        });
      }
    }
  }

  const partitionReconciles = sourceLineN === placedLineN + unplacedLineN + beyondHorizonN;
  const figuresComplete = partitionReconciles && invalidCurrencyN === 0 && invalidRowN === 0
    && duplicateSourceN === 0 && unplacedLineN === 0 && beyondHorizonN === 0 && unpricedLineN === 0
    && rows.every((row) => !row.withheld);
  const reason = figuresComplete ? null : 'One or more source lines are unplaced, outside the 13-week horizon, unpriced, duplicated, invalid-currency or withheld by the privacy floor.';
  return {
    asOf,
    horizonWeeks: BUDGET_MATURITY_WEEKS,
    privacyFloor: BUDGET_MATURITY_PRIVACY_FLOOR,
    activeEnvelopeN: budgets.length,
    sourceLineN,
    placedLineN,
    unplacedLineN,
    beyondHorizonN,
    unpricedLineN,
    duplicateSourceN,
    invalidCurrencyN,
    invalidRowN,
    partitionReconciles,
    figuresComplete,
    reason,
    rows,
    method: BUDGET_MATURITY_METHOD,
  };
}

/** Aggregate-only export; no identifiers, names, line labels or narrative. */
export function budgetMaturityCsvRows(report) {
  return (report?.rows || []).map((row) => ({
    record_type: row.recordType,
    currency: row.currency,
    week: row.week,
    starts_on: row.startsOn,
    ends_on: row.endsOn,
    amount_cents: row.amountCents,
    line_n: row.lineN,
    row_reason: row.rowReason,
  }));
}
