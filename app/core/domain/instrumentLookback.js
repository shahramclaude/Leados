/** ADR-0252: reverse traceability after an as-found failure (ISO 9001 §7.1.5.2).
 * The decision unit is an inspection/release reference, not a spreadsheet line,
 * an affected part, a manager, or the instrument's subsequent as-left result.
 */
import { standardWorkDay } from './standardWorkSchema.js';

export const LOOKBACK_LIMITS = Object.freeze({ rows: 2000, papers: 200, workspaceRows: 6000, ref: 120, text: 1024 * 1024 });
export const USE_CLASSES = Object.freeze({
  matched: 'In review window', possible: 'Cannot place — investigate', after: 'After failure — check separately',
  before: 'Before last good day', other: 'Different instrument',
});
const bad = (field, error) => ({ ok: false, field, error });
const ref = (v) => typeof v === 'string' && v.length > 0 && v.length <= LOOKBACK_LIMITS.ref
  && v.trim() === v && !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(v);
const day = (v) => typeof v === 'string' && v.length === 10 && standardWorkDay(v) === v;
const blank = (v) => v === '' || v === null;
const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;

/** One gate for preview, action and reload. Bad input never becomes a shorter,
 * clean-looking extract. Null/empty cells are unknown; absent columns are not. */
export function readInstrumentEvidence(input, { checkOn, capturedOn }) {
  if (!input || !day(checkOn) || !day(capturedOn) || checkOn > capturedOn) return bad('checkId', 'The source check and capture need ordered calendar days.');
  for (const [field, label] of [['instrumentRef', 'instrument ID'], ['failureRef', 'as-found failure evidence'], ['sourceRef', 'versioned use-log source']]) {
    if (!ref(input[field])) return bad(field, `Enter the ${label} as a single reference of 1–${LOOKBACK_LIMITS.ref} characters, without outer whitespace.`);
  }
  if (!day(input.failedOn) || input.failedOn > checkOn) return bad('failedOn', 'The as-found failure needs a real day on or before the abnormal check.');
  const hasGood = !blank(input.goodOn) || !blank(input.goodRef);
  if (hasGood && (!day(input.goodOn) || input.goodOn >= input.failedOn || !ref(input.goodRef) || input.goodRef === input.failureRef)) {
    return bad('goodOn', 'Give a strictly earlier good day and a distinct result reference, or leave both blank. Day-only evidence cannot order two checks on the same day; an as-left pass is not a prior good check.');
  }
  if (!['attested', 'partial'].includes(input.coverage)) return bad('coverage', 'Declare whether the source covers every line and use in the window.');
  const expected = blank(input.expectedUses) ? null : input.expectedUses;
  if (expected !== null && (!Number.isSafeInteger(expected) || expected < 0)) return bad('expectedUses', 'The independent source control is a nonnegative whole count of distinct use IDs, or unknown.');
  if (!Array.isArray(input.uses) || input.uses.length > LOOKBACK_LIMITS.rows) return bad('extract', `Supply a whole extract of at most ${LOOKBACK_LIMITS.rows} rows. No partial scan was made.`);

  const uses = [];
  const unique = new Map();
  for (const [index, raw] of input.uses.entries()) {
    const at = `Data row ${index + 1}`;
    if (!raw || !ref(raw.useRef)) return bad('extract', `${at}: a distinct, nonblank use ID is required.`);
    for (const field of ['instrumentRef', 'decisionRef']) {
      if (!blank(raw[field]) && !ref(raw[field])) return bad('extract', `${at}: ${field} is not a readable reference. An empty cell means unknown.`);
    }
    if (!blank(raw.usedOn) && (!day(raw.usedOn) || raw.usedOn > capturedOn)) return bad('extract', `${at}: use a real YYYY-MM-DD no later than the capture, or leave the day unknown.`);
    const use = { useRef: raw.useRef, instrumentRef: raw.instrumentRef || null, usedOn: raw.usedOn || null, decisionRef: raw.decisionRef || null };
    const prior = unique.get(use.useRef);
    if (prior && (prior.use.instrumentRef !== use.instrumentRef || prior.use.usedOn !== use.usedOn || prior.use.decisionRef !== use.decisionRef)) {
      return bad('extract', `${at} conflicts with data row ${prior.index + 1} for use ID “${use.useRef}”. Reconcile the source; neither copy was chosen.`);
    }
    if (!prior) unique.set(use.useRef, { index, use });
    uses.push(use);
  }
  return { ok: true, evidence: {
    instrumentRef: input.instrumentRef, failedOn: input.failedOn, failureRef: input.failureRef,
    goodOn: hasGood ? input.goodOn : null, goodRef: hasGood ? input.goodRef : null,
    sourceRef: input.sourceRef, coverage: input.coverage, expectedUses: expected, uses,
  } };
}

/** Inclusive *day* bounds are deliberately conservative: a use on either
 * boundary day cannot be cleared by inventing a within-day ordering. An
 * unknown instrument can still be excluded by a provably out-of-window day. */
function place(use, paper) {
  if (use.instrumentRef !== null && use.instrumentRef !== paper.instrumentRef) return 'other';
  if (use.usedOn && use.usedOn > paper.failedOn) return 'after';
  if (use.usedOn && paper.goodOn && use.usedOn < paper.goodOn) return 'before';
  return use.instrumentRef && use.usedOn && paper.goodOn ? 'matched' : 'possible';
}

/** Input has passed readInstrumentEvidence. Do not total across papers: two
 * extracts, or two failing instruments, can point at the very same decision. */
export function traceInstrumentUses(paper) {
  const { uses, ...basis } = paper;
  const byUse = new Map();
  for (const use of uses) {
    const prior = byUse.get(use.useRef);
    if (prior) prior.copies += 1;
    else byUse.set(use.useRef, { ...use, copies: 1, placement: place(use, paper) });
  }
  const rows = [...byUse.values()].sort((a, b) => cmp(a.useRef, b.useRef));
  const counts = { matched: 0, possible: 0, before: 0, after: 0, other: 0 };
  const byDecision = new Map();
  let unlinked = 0;
  for (const row of rows) {
    counts[row.placement] += 1;
    if (row.placement !== 'matched' && row.placement !== 'possible') continue;
    if (!row.decisionRef) { unlinked += 1; continue; }
    const entry = byDecision.get(row.decisionRef) || { decisionRef: row.decisionRef, matched: 0, possible: 0 };
    entry[row.placement] += 1;
    byDecision.set(row.decisionRef, entry);
  }
  const decisions = [...byDecision.values()].sort((a, b) => cmp(a.decisionRef, b.decisionRef));
  const recorded = decisions.filter((row) => row.matched > 0).length;
  const balances = Object.values(counts).reduce((sum, n) => sum + n, 0) === rows.length
    && rows.reduce((sum, row) => sum + row.copies, 0) === uses.length
    && decisions.reduce((sum, row) => sum + row.matched + row.possible, unlinked) === counts.matched + counts.possible;
  const reasons = [];
  if (!paper.goodOn) reasons.push('No evidenced last-good day; the start of the look-back is unknown.');
  if (paper.coverage !== 'attested') reasons.push('Coverage of all uses across the relevant lines was not attested.');
  if (paper.expectedUses === null) reasons.push('No independent distinct-use control total was supplied.');
  else if (paper.expectedUses !== rows.length) reasons.push(`The source control is ${paper.expectedUses} distinct uses; the extract contains ${rows.length}.`);
  if (counts.possible) reasons.push(`${counts.possible} distinct use(s) cannot be placed in or out of the window.`);
  if (unlinked) reasons.push(`${unlinked} relevant or possible use(s) lack an inspection/release reference.`);
  if (!balances) reasons.push('The source rows, placements and decision links do not reconcile.');
  return { basis, rows, decisions, counts, recorded, unlinked, sourceRows: uses.length, distinctUses: rows.length,
    duplicateRows: uses.length - rows.length, balances, reasons, decisionTotal: reasons.length ? null : recorded };
}

/** The numeric receipt for ONE extract. Both the table and optional CSV use
 * these cells. Only fixed labels, counts and identity-free reasons leave here. */
export function instrumentReceipt(trace) {
  return [
    ['Source rows', trace.sourceRows], ['Repeated copies', trace.duplicateRows],
    ['Distinct uses', trace.distinctUses], ['Independent source control', trace.basis.expectedUses, trace.basis.expectedUses === null ? 'Not supplied.' : ''],
    ...Object.entries(USE_CLASSES).map(([key, label]) => [label, trace.counts[key]]),
    ['Relevant or possible uses without decision ID', trace.unlinked],
    ['Named decisions with an in-window use', trace.recorded], ['Named decisions including possible links', trace.decisions.length],
    ['Total distinct decisions in the review window', trace.decisionTotal, trace.reasons.join(' ')],
    ['Source and link counts reconcile', trace.balances ? 'Yes' : 'No'],
  ].map(([measure, value, reason = '']) => ({ measure, value, reason }));
}
