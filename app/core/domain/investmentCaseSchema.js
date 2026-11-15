/**
 * app/core/domain/investmentCaseSchema.js — fail-closed storage contract for the
 * Investment Case Register (ADR-0208, Schema v162).
 *
 * THREE append-only ledgers and nothing else:
 *
 *   1. `investmentCases` — one declared case: a named benefit owner, a currency,
 *      a price basis, a hurdle rate, a valuation day, a review day and a dated
 *      schedule of flows in whole cents. Immutable once declared: a changed
 *      promise is a new case, never an edit of the one that was ratified.
 *
 *   2. `investmentCaseActs` — the dated human acts: approve, reject, withdraw,
 *      review. A review carries the actual flows up to its cut-off.
 *
 *   3. `investmentCaseMarkers` — the rule's bounded ledger of identity-free
 *      observations where no roster seat can be asked.
 *
 * NOTHING DERIVED IS STORED. No present value, rate of return, payback, ratio or
 * status: each is re-derived on read from the flows, so a replayed workspace
 * cannot carry a stale figure and a hand-edited file cannot carry a figure that
 * does not follow from its own flows.
 *
 * WHAT THE LOADER REFUSES (never repairs):
 *   - a case with no readable id, title, owner, currency, basis, hurdle, days or
 *     flows; a flow that is undated, of an undeclared kind, zero, not a whole
 *     number of cents, an outlay that is not money out, or dated before the
 *     valuation day; a schedule with no outlay or no dated benefit; a review day
 *     that precedes the first promised benefit;
 *   - an act naming a case that is not on the record, an act its case's
 *     lifecycle does not admit (a second decision, a review of a case nobody
 *     ratified, a review whose cut-off does not move forward, a final review
 *     that stops short of the declared review day), and — the control
 *     this register exists for — a ratification or review SIGNED BY THE BENEFIT
 *     OWNER. A hand-edited file cannot manufacture a self-approved case.
 */

import {
  INVESTMENT_ACT_KINDS,
  INVESTMENT_ACT_ROUTE_KEYS,
  INVESTMENT_BASIS_KEYS,
  INVESTMENT_CASE_ASK_PREFIX,
  INVESTMENT_CASE_BOUNDS,
  INVESTMENT_CASE_DEFAULTS,
  INVESTMENT_CASE_LIMITS,
  INVESTMENT_CASE_SETTING_KEYS,
  INVESTMENT_FLOW_KIND_KEYS,
} from './investmentCaseRegistry.js';

const L = INVESTMENT_CASE_LIMITS;
const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
const AMOUNT_RE = /^([+-]?)(\d{1,15})(?:\.(\d{1,2}))?$/;
const RATE_RE = /^(\d{1,3})(?:\.(\d{1,2}))?$/;
const SIGNATURE_RE = /^ica1:[0-9a-f]{16}$/;
const DAY_MS = 86400000;
const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value, max = 400) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const id = (value) => { const c = text(value, 120); return ID_RE.test(c) ? c : null; };
const KIND_ORDER = new Map(INVESTMENT_FLOW_KIND_KEYS.map((key, index) => [key, index]));

/** A real calendar day as `YYYY-MM-DD`, or null. `2026-02-30` is null, not March. */
export function investmentDay(value) {
  const candidate = text(value, 10);
  if (!DAY_RE.test(candidate)) return null;
  const date = new Date(`${candidate}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === candidate ? candidate : null;
}

/** Whole days from one real day to another (positive when `to` is later), or null. */
export function investmentDaysBetween(from, to) {
  if (!investmentDay(from) || !investmentDay(to)) return null;
  return Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / DAY_MS);
}

function stamp(value) {
  const raw = text(value, 40);
  if (!raw) return null;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function boundedInt(value, [min, max], fallback) {
  const n = Math.round(Number(value));
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** A case title is the proposer's own words — short, and never parsed. */
export function investmentTitle(value) {
  const candidate = text(value, L.titleMax + 20).replace(/\s+/g, ' ').trim();
  if (candidate.length < L.titleMin) return null;
  return candidate.slice(0, L.titleMax);
}

/** A written reason, or null when it is below the declared minimum. */
export function investmentReason(value) {
  const candidate = text(value, L.reasonMax);
  return candidate.length >= L.reasonMin ? candidate : null;
}

export function investmentCurrency(value) {
  const candidate = text(value, 8).toUpperCase();
  return CURRENCY_RE.test(candidate) ? candidate : null;
}

/**
 * A typed amount in major units → exact whole cents, with no floating point in
 * between. `250000`, `250000.5` and `-1200.75` are read; `1e6`, `1,000`,
 * `0.30000000000000004` and anything past two decimals are refused (null).
 * Refusing is the point: an amount the register cannot read exactly is not
 * rounded into one it can.
 */
export function parseInvestmentAmount(value) {
  let raw;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    raw = String(value);
  } else if (typeof value === 'string') {
    raw = value.trim();
  } else {
    return null;
  }
  const match = AMOUNT_RE.exec(raw);
  if (!match) return null;
  const cents = Number(match[2]) * 100 + Number((match[3] || '').padEnd(2, '0') || 0);
  if (!Number.isSafeInteger(cents) || cents > L.maxCents) return null;
  return match[1] === '-' ? -cents : cents;
}

/** A typed percentage (`8`, `8.5`, `12.25`) → whole basis points, or null. */
export function parseInvestmentRatePercent(value) {
  const raw = typeof value === 'number' && Number.isFinite(value) ? String(value) : typeof value === 'string' ? value.trim().replace(/%$/, '').trim() : '';
  const match = RATE_RE.exec(raw);
  if (!match) return null;
  const bp = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0') || 0);
  return Number.isInteger(bp) && bp >= L.hurdleBpMin && bp <= L.hurdleBpMax ? bp : null;
}

function sortFlows(flows) {
  return flows
    .map((flow, index) => ({ flow, index }))
    .sort((a, b) => a.flow.on.localeCompare(b.flow.on)
      || KIND_ORDER.get(a.flow.kind) - KIND_ORDER.get(b.flow.kind)
      || a.flow.cents - b.flow.cents
      || a.index - b.index)
    .map((row) => row.flow);
}

/**
 * One typed flow → the stored shape, or a refusal sentence. The sign rule lives
 * here and nowhere else: an outlay is typed as a positive amount of money going
 * out and stored negative; a benefit or a residual is stored as typed.
 */
export function readTypedInvestmentFlow(raw) {
  if (!isPlainObject(raw)) return { ok: false, error: 'is not a flow' };
  const on = investmentDay(raw.on);
  if (!on) return { ok: false, error: 'has no real calendar day (write YYYY-MM-DD)' };
  const kind = INVESTMENT_FLOW_KIND_KEYS.includes(String(raw.kind || '').trim().toLowerCase()) ? String(raw.kind).trim().toLowerCase() : null;
  if (!kind) return { ok: false, error: `names no declared kind (write ${INVESTMENT_FLOW_KIND_KEYS.join(', ')})` };
  const amount = parseInvestmentAmount(raw.amount);
  if (amount === null) return { ok: false, error: 'has an amount that cannot be read exactly (digits, at most two decimals, no separators; at most a trillion)' };
  if (amount === 0) return { ok: false, error: 'is zero — a flow of nothing is not a flow' };
  if (kind === 'outlay' && amount < 0) return { ok: false, error: 'is an outlay typed as a negative amount — an outlay is entered as a positive amount of money going out' };
  return { ok: true, flow: { on, kind, cents: kind === 'outlay' ? -amount : amount } };
}

/**
 * The text grammar of the declaration dialog: one flow per line, three fields —
 * day, kind, amount — separated by commas, semicolons, tabs or spaces, so a
 * column pasted from a spreadsheet reads as it stands. Every refusal names its
 * line. Blank lines and lines starting with `#` are ignored.
 */
export function parseInvestmentFlowLines(value) {
  const flows = [];
  const lines = String(value ?? '').split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line || line.startsWith('#')) continue;
    const fields = line.split(/[\s,;]+/).filter(Boolean);
    if (fields.length !== 3) {
      return { ok: false, line: index + 1, error: `Line ${index + 1} has ${fields.length} field(s); a flow is three: day, kind, amount — for example “2027-01-01 outlay 250000”. Amounts carry no thousands separator.` };
    }
    const read = readTypedInvestmentFlow({ on: fields[0], kind: fields[1], amount: fields[2] });
    if (!read.ok) return { ok: false, line: index + 1, error: `Line ${index + 1} ${read.error}.` };
    flows.push(read.flow);
  }
  return { ok: true, flows: sortFlows(flows) };
}

/** Typed flows from either door shape — text lines or an array of `{ on, kind, amount }`. */
export function readTypedInvestmentFlows(input) {
  if (typeof input === 'string') return parseInvestmentFlowLines(input);
  if (!Array.isArray(input)) return { ok: false, error: 'State the flows as lines of “day kind amount”, or as a list.' };
  const flows = [];
  for (let index = 0; index < input.length; index += 1) {
    const read = readTypedInvestmentFlow(input[index]);
    if (!read.ok) return { ok: false, line: index + 1, error: `Flow ${index + 1} ${read.error}.` };
    flows.push(read.flow);
  }
  return { ok: true, flows: sortFlows(flows) };
}

/** Flows back to the text grammar, so a dialog can show what is stored. */
export function investmentFlowLines(flows) {
  return (Array.isArray(flows) ? flows : []).map((flow) => {
    const cents = flow.kind === 'outlay' ? -flow.cents : flow.cents;
    const negative = cents < 0;
    const a = Math.abs(cents);
    return `${flow.on} ${flow.kind} ${negative ? '-' : ''}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
  }).join('\n');
}

/** STORED flows, read exactly or not at all (null). */
function readStoredFlows(value, { limit, fromDay = null, toDay = null, allowEmpty = false }) {
  if (!Array.isArray(value) || value.length > limit) return null;
  if (!value.length && !allowEmpty) return null;
  const out = [];
  for (const raw of value) {
    if (!isPlainObject(raw)) return null;
    const on = investmentDay(raw.on);
    const kind = INVESTMENT_FLOW_KIND_KEYS.includes(raw.kind) ? raw.kind : null;
    const cents = raw.cents;
    if (!on || !kind || !Number.isSafeInteger(cents) || cents === 0 || Math.abs(cents) > L.maxCents) return null;
    if (kind === 'outlay' && cents > 0) return null;
    if (fromDay && on < fromDay) return null;
    if (toDay && on > toDay) return null;
    out.push({ on, kind, cents });
  }
  return sortFlows(out);
}

/**
 * The structural rules of a promise, shared by the door and the loader so the
 * two cannot disagree about what a case is. Returns null when sound, otherwise
 * the sentence the door prints.
 */
export function investmentScheduleProblem({ flows, baseOn, reviewOn }) {
  if (!Array.isArray(flows) || flows.length < 2) return 'A case needs at least two dated flows: money out and money back.';
  if (flows.length > L.flowsPerCase) return `A case may promise at most ${L.flowsPerCase} dated flows; ${flows.length} were supplied. Aggregate to periods.`;
  if (!flows.some((flow) => flow.kind === 'outlay')) return 'The schedule names no outlay. A case with no money out is not an investment, and has nothing to be appraised against.';
  if (!flows.some((flow) => flow.kind === 'benefit')) return 'The schedule names no dated benefit. A case that promises nothing on a day cannot be reviewed against anything.';
  const first = flows.reduce((min, flow) => (flow.on < min ? flow.on : min), flows[0].on);
  const last = flows.reduce((max, flow) => (flow.on > max ? flow.on : max), flows[0].on);
  if (first < baseOn) return `A flow is dated ${first}, before the valuation day ${baseOn}. Money that had already moved when the case was valued is sunk; it is not part of the decision.`;
  const horizon = investmentDaysBetween(baseOn, last);
  if (horizon === null || horizon > L.horizonMaxDays) return `The last flow is dated ${last}, more than sixty years after the valuation day. That is not a promise anyone will be there to review.`;
  const firstBenefit = flows.filter((flow) => flow.kind === 'benefit').reduce((min, flow) => (flow.on < min ? flow.on : min), '9999-12-31');
  if (!reviewOn) return 'Declare the day this promise will be reviewed. A case with no review day is a case nobody intends to check.';
  if (reviewOn < firstBenefit) return `The review day ${reviewOn} falls before the first promised benefit (${firstBenefit}). A review that early can find nothing to compare.`;
  const reviewGap = investmentDaysBetween(baseOn, reviewOn);
  if (reviewGap === null || reviewGap > L.horizonMaxDays + 366) return 'The review day is more than sixty years after the valuation day.';
  return null;
}

/* ----------------------------------------------------------------- settings */

/** The loader clamps into the declared bounds; the setter (in the actions) refuses. */
export function normalizeInvestmentCaseSettings(raw = {}) {
  const src = isPlainObject(raw) ? raw : {};
  const K = INVESTMENT_CASE_SETTING_KEYS;
  return {
    [K.askDueDays]: boundedInt(src[K.askDueDays], INVESTMENT_CASE_BOUNDS.askDueDays, INVESTMENT_CASE_DEFAULTS.askDueDays),
    // Only an explicit `false` pauses the rule: an unreadable value must never
    // read as "somebody switched governance off".
    [K.autoPropagate]: src[K.autoPropagate] !== false,
  };
}

/* -------------------------------------------------------------------- cases */

/** Every declared case, read exactly or dropped. Order: declaration day, then id. */
export function normalizeInvestmentCases(value, warnings = []) {
  if (!Array.isArray(value)) {
    if (value !== undefined && value !== null) warnings.push('Investment cases: the case ledger was not an array; it was read as empty.');
    return [];
  }
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const raw of value) {
    if (out.length >= L.cases) { dropped += 1; continue; }
    const row = isPlainObject(raw) ? raw : null;
    const caseId = row && id(row.id);
    const title = row && investmentTitle(row.title);
    const ownerId = row && id(row.ownerId);
    const currency = row && typeof row.currency === 'string' && CURRENCY_RE.test(row.currency) ? row.currency : null;
    const basis = row && INVESTMENT_BASIS_KEYS.includes(row.basis) ? row.basis : null;
    const hurdleBp = row && Number.isInteger(row.hurdleBp) && row.hurdleBp >= L.hurdleBpMin && row.hurdleBp <= L.hurdleBpMax ? row.hurdleBp : null;
    const baseOn = row && investmentDay(row.baseOn);
    const reviewOn = row && investmentDay(row.reviewOn);
    const declaredOn = row && investmentDay(row.declaredOn);
    const declaredById = row && id(row.declaredById);
    const flows = row && baseOn ? readStoredFlows(row.flows, { limit: L.flowsPerCase, fromDay: baseOn }) : null;
    if (!caseId || seen.has(caseId) || !title || !ownerId || !currency || !basis || hurdleBp === null
      || !baseOn || !reviewOn || !declaredOn || !declaredById || !flows
      || investmentScheduleProblem({ flows, baseOn, reviewOn })) {
      dropped += 1;
      continue;
    }
    seen.add(caseId);
    out.push({
      id: caseId,
      title,
      ownerId,
      currency,
      basis,
      hurdleBp,
      baseOn,
      reviewOn,
      flows,
      note: text(row.note, L.reasonMax),
      declaredOn,
      declaredAt: stamp(row.declaredAt),
      declaredById,
      engineVersion: text(row.engineVersion, 60) || '',
    });
  }
  if (dropped) warnings.push(`${dropped} investment-case row(s) could not be read exactly — an unreadable owner, currency, rate, day or flow, a schedule with no outlay or no dated benefit, or a review day before the first promised benefit — and were dropped rather than repaired.`);
  out.sort((a, b) => a.declaredOn.localeCompare(b.declaredOn) || a.id.localeCompare(b.id));
  return out;
}

/* --------------------------------------------------------------------- acts */

/**
 * Every act its case's lifecycle admits, in the order it happened. An act that
 * the lifecycle does not admit is dropped and counted: a second decision, a
 * review of a case nobody ratified, a cut-off that does not move forward, an act
 * dated before its case — and any ratification or review signed by the benefit
 * owner of the case it concerns.
 */
export function normalizeInvestmentCaseActs(value, cases = [], warnings = []) {
  if (!Array.isArray(value)) {
    if (value !== undefined && value !== null) warnings.push('Investment cases: the act ledger was not an array; it was read as empty.');
    return [];
  }
  const caseById = new Map(cases.map((row) => [row.id, row]));
  const state = new Map(cases.map((row) => [row.id, { stage: 'proposed', lastCutoff: null, outlayComplete: false, reviewsN: 0 }]));
  const ordered = value
    .map((raw, index) => ({ raw, index, on: isPlainObject(raw) ? investmentDay(raw.actedOn) : null }))
    .sort((a, b) => String(a.on || '').localeCompare(String(b.on || '')) || a.index - b.index);
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const { raw, on } of ordered) {
    if (out.length >= L.acts) { dropped += 1; continue; }
    const row = isPlainObject(raw) ? raw : null;
    const actId = row && id(row.id);
    const caseId = row && id(row.caseId);
    const kind = row && INVESTMENT_ACT_KINDS.includes(row.kind) ? row.kind : null;
    const actedById = row && id(row.actedById);
    const record = caseId ? caseById.get(caseId) : null;
    const life = caseId ? state.get(caseId) : null;
    if (!actId || seen.has(actId) || !record || !life || !kind || !on || !actedById || on < record.declaredOn) { dropped += 1; continue; }
    const control = kind !== 'withdraw';
    const via = INVESTMENT_ACT_ROUTE_KEYS.includes(row.via) ? row.via : null;
    // Decision control is never the benefit owner's own act, and always states
    // the route that carried its authority.
    if (control && (actedById === record.ownerId || !via)) { dropped += 1; continue; }
    const reason = investmentReason(row.reason);
    const base = { id: actId, caseId, kind, actedOn: on, actedAt: stamp(row.actedAt), actedById, via: control ? via : null, reason: reason || '' };

    if (kind === 'approve' || kind === 'reject' || kind === 'withdraw') {
      if (life.stage !== 'proposed') { dropped += 1; continue; }
      if (kind !== 'approve' && !reason) { dropped += 1; continue; }
      life.stage = kind === 'approve' ? 'approved' : kind === 'reject' ? 'rejected' : 'withdrawn';
      seen.add(actId);
      out.push(base);
      continue;
    }

    // A review.
    const cutoffOn = investmentDay(row.cutoffOn);
    const nextReviewOn = row.nextReviewOn === null || row.nextReviewOn === undefined || row.nextReviewOn === '' ? null : investmentDay(row.nextReviewOn);
    const nextUnreadable = !(row.nextReviewOn === null || row.nextReviewOn === undefined || row.nextReviewOn === '') && !nextReviewOn;
    const flows = cutoffOn ? readStoredFlows(row.flows, { limit: L.flowsPerReview, fromDay: record.baseOn, toDay: cutoffOn, allowEmpty: true }) : null;
    if (life.stage !== 'approved' || life.reviewsN >= L.reviewsPerCase
      || !cutoffOn || cutoffOn > on || cutoffOn < record.baseOn
      || (life.lastCutoff && !(cutoffOn > life.lastCutoff))
      || typeof row.outlayComplete !== 'boolean'
      // An outlay once declared complete is not re-opened by a later review.
      || (life.outlayComplete && row.outlayComplete !== true)
      || nextUnreadable || (nextReviewOn && !(nextReviewOn > cutoffOn))
      // A review that ENDS the record must reach the review day the case
      // declared; closing a promise before the day it said it would be checked
      // is the escape this register exists to close.
      || (!nextReviewOn && cutoffOn < record.reviewOn)
      || !flows || (!flows.length && !reason)) {
      dropped += 1;
      continue;
    }
    life.lastCutoff = cutoffOn;
    life.outlayComplete = row.outlayComplete === true;
    life.reviewsN += 1;
    if (!nextReviewOn) life.stage = 'closed';
    seen.add(actId);
    out.push({ ...base, cutoffOn, flows, outlayComplete: row.outlayComplete === true, nextReviewOn });
  }
  if (dropped) warnings.push(`${dropped} investment-case act row(s) were unreadable, named a case that is not on the record, were not admitted by that case’s lifecycle, or were a ratification or review signed by the case’s own benefit owner, and were dropped rather than repaired.`);
  return out;
}

/** The rule's bounded idempotency ledger. Identity-free, keyed by signature. */
export function normalizeInvestmentCaseMarkers(value, warnings = []) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const raw of value) {
    const row = isPlainObject(raw) ? raw : null;
    const key = row ? text(row.key, 220) : '';
    if (!key || seen.has(key)) { dropped += 1; continue; }
    seen.add(key);
    out.push({ key, at: stamp(row.at), ruleId: text(row.ruleId, 40), kind: text(row.kind, 40), detail: text(row.detail, 300) });
  }
  if (dropped) warnings.push(`${dropped} investment-case marker row(s) were unreadable or duplicated and were dropped.`);
  return out.slice(-L.markers);
}

/* --------------------------------------------------------------- signatures */

/**
 * Deterministic, fixed-length key for ONE due review (`ica1:<16-hex>`): the case
 * and the review day that arrived. No person, no title and no money reaches a
 * marker key, a link summary or an ask's provenance.
 */
export function investmentCaseSignature({ caseId, dueOn }) {
  const joined = `case:${caseId || ''}\ndue:${dueOn || ''}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x050c5d1f;
  for (let i = 0; i < joined.length; i += 1) {
    const code = joined.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= (code ^ (i & 0xff));
    h2 = Math.imul(h2, 0x01000193) >>> 0;
  }
  return `ica1:${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

export function investmentCaseAskSummary(signature) {
  return `${INVESTMENT_CASE_ASK_PREFIX}${String(signature || '').trim()}`;
}

export function parseInvestmentCaseAskSummary(summary) {
  if (typeof summary !== 'string') return null;
  const trimmed = summary.trim();
  if (!trimmed.startsWith(INVESTMENT_CASE_ASK_PREFIX)) return null;
  const signature = trimmed.slice(INVESTMENT_CASE_ASK_PREFIX.length).trim();
  return SIGNATURE_RE.test(signature) ? { signature } : null;
}
