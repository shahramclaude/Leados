/**
 * app/core/domain/goalAttainmentSchema.js — fail-closed storage contract for the
 * Goal Attainment Period Close & Restatement Register (ADR-0206, Schema v160).
 *
 * THREE append-only ledgers and nothing else:
 *
 *   1. `goalAttainmentClosures` — one human closing act: a declared, already
 *      ended period, the span each goal that fell due inside it was counted in on
 *      the period's last recorded day, that goal's attainment bucket, and the
 *      bucket counts the act reported. The counts are STORED precisely so they
 *      can be re-proved against the entries on load: a row whose reported counts
 *      do not equal the entries beneath it describes a report nobody made, and it
 *      is dropped with a counted warning rather than quietly re-totalled.
 *
 *   2. `goalAttainmentNotes` — one dated, written acknowledgement that a SPECIFIC
 *      restatement (by fingerprint) is the accepted basis. Append-only. A later
 *      acknowledgement never edits an earlier one and never covers a different
 *      fingerprint.
 *
 *   3. `goalAttainmentMarkers` — the rule's bounded idempotency ledger, holding
 *      identity-free observations where no roster seat can be asked.
 *
 * NOTHING DERIVED IS STORED. No live bucket, no delta, no verdict, no cause and
 * no fingerprint of the current reading: every one is re-derived on read from
 * the goals, the check-ins and the recorded structure, so a replayed workspace
 * cannot carry a stale claim that a period still reproduces.
 *
 * WHAT THE LOADER REFUSES (never repairs):
 *   - a closure with no id, no label, no real period, or a period longer than the
 *     declared bound;
 *   - a closure whose `closedOn` is not strictly after its period end (a period
 *     that has not ended cannot be closed);
 *   - an entry whose bucket is not in the closed set, or whose span is missing;
 *   - two entries for one goal (one goal is one row), or a stored bucket count
 *     that does not match the entries;
 *   - a closure whose period OVERLAPS an earlier closure. Two closing acts over
 *     the same days are two different reports of one period, and choosing between
 *     them is a decision this loader is not entitled to make by arithmetic, so
 *     the later act is dropped and counted — never merged, never re-totalled;
 *   - a note naming a closure that is not on the record, or with a fingerprint
 *     that is not the declared shape, or a duplicate (closure, fingerprint) pair.
 */

import { dayKey } from '../time.js';
import {
  GOAL_ATTAINMENT_ASK_PREFIX,
  GOAL_ATTAINMENT_BOUNDS,
  GOAL_ATTAINMENT_BUCKET_KEYS,
  GOAL_ATTAINMENT_DEFAULTS,
  GOAL_ATTAINMENT_LIMITS,
  GOAL_ATTAINMENT_SETTING_KEYS,
} from './goalAttainmentRegistry.js';

const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const SIGNATURE_RE = /^gar1:[0-9a-f]{16}$/;
const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value, max = 400) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const id = (value) => { const c = text(value, 120); return ID_RE.test(c) ? c : null; };

/** The explicit "no owner" span key. A team goal is counted apart, never placed. */
export const GOAL_ATTAINMENT_OWNERLESS = 'ownerless';

/** A real calendar day as `YYYY-MM-DD`, or null. `2026-02-30` is null, not March. */
export function goalAttainmentDay(value) {
  const candidate = text(value, 10);
  if (!DAY_RE.test(candidate)) return null;
  const date = new Date(`${candidate}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === candidate ? candidate : null;
}

/** Inclusive whole days between two day keys, or null. `2026-09-01..2026-09-01` is 1. */
export function goalAttainmentInclusiveDays(from, to) {
  if (!goalAttainmentDay(from) || !goalAttainmentDay(to) || to < from) return null;
  const a = Date.parse(`${from}T00:00:00.000Z`);
  const b = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000) + 1;
}

/** Do two inclusive windows share at least one day? */
export function goalAttainmentOverlaps(aFrom, aTo, bFrom, bTo) {
  return !(aTo < bFrom || bTo < aFrom);
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

/** A period label is a human's own words about a date range — short, and never parsed. */
export function goalAttainmentLabel(value) {
  const candidate = text(value, GOAL_ATTAINMENT_LIMITS.labelMax + 20).replace(/\s+/g, ' ').trim();
  if (candidate.length < GOAL_ATTAINMENT_LIMITS.labelMin) return null;
  return candidate.slice(0, GOAL_ATTAINMENT_LIMITS.labelMax);
}

/** A written reason/acknowledgement, or null when it is below the declared minimum. */
export function goalAttainmentReason(value) {
  const candidate = text(value, GOAL_ATTAINMENT_LIMITS.reasonMax);
  return candidate.length >= GOAL_ATTAINMENT_LIMITS.reasonMin ? candidate : null;
}

/* ----------------------------------------------------------------- settings */

/** The loader clamps into the declared bounds; the setter (in the actions) refuses. */
export function normalizeGoalAttainmentSettings(raw = {}) {
  const src = isPlainObject(raw) ? raw : {};
  const K = GOAL_ATTAINMENT_SETTING_KEYS;
  const B = GOAL_ATTAINMENT_BOUNDS;
  const D = GOAL_ATTAINMENT_DEFAULTS;
  return {
    [K.askDueDays]: boundedInt(src[K.askDueDays], B.askDueDays, D.askDueDays),
    // Only an explicit `false` pauses the rule: an unreadable value must never
    // read as "somebody switched governance off".
    [K.autoPropagate]: src[K.autoPropagate] !== false,
  };
}

/* ----------------------------------------------------------------- closures */

const emptyBuckets = () => Object.fromEntries(GOAL_ATTAINMENT_BUCKET_KEYS.map((key) => [key, 0]));

/** Derive the bucket counts from the entries — the identity a closure must satisfy. */
export function goalAttainmentBucketCounts(entries = []) {
  const counts = emptyBuckets();
  for (const entry of entries) {
    if (entry && Object.prototype.hasOwnProperty.call(counts, entry.bucket)) counts[entry.bucket] += 1;
  }
  return counts;
}

function readEntries(value, spanLimit) {
  if (!Array.isArray(value)) return null;
  if (value.length > GOAL_ATTAINMENT_LIMITS.goalsPerClosure) return null;
  const out = [];
  const seenGoal = new Set();
  for (const raw of value) {
    if (!isPlainObject(raw)) return null;
    const goalId = id(raw.goalId);
    const bucket = GOAL_ATTAINMENT_BUCKET_KEYS.includes(raw.bucket) ? raw.bucket : null;
    const span = raw.span === GOAL_ATTAINMENT_OWNERLESS ? GOAL_ATTAINMENT_OWNERLESS : id(raw.span);
    if (!goalId || !bucket || !span || seenGoal.has(goalId)) return null;
    seenGoal.add(goalId);
    out.push({ goalId, bucket, span });
  }
  const spans = new Set(out.filter((entry) => entry.span !== GOAL_ATTAINMENT_OWNERLESS).map((entry) => entry.span));
  if (spans.size > spanLimit) return null;
  return out;
}

/**
 * Every closing act, read exactly or dropped. Deterministic order: period end,
 * then period start, then id — so the reader's "earlier act" is unambiguous.
 */
export function normalizeGoalAttainmentClosures(value, warnings = []) {
  if (!Array.isArray(value)) {
    if (value !== undefined && value !== null) warnings.push('Goal attainment: the closure ledger was not an array; it was read as empty.');
    return [];
  }
  const out = [];
  const seenId = new Set();
  let dropped = 0;
  for (const raw of value) {
    if (out.length >= GOAL_ATTAINMENT_LIMITS.closures) { dropped += 1; continue; }
    const row = isPlainObject(raw) ? raw : null;
    const closureId = row && id(row.id);
    const label = row && goalAttainmentLabel(row.label);
    const periodFrom = row && goalAttainmentDay(row.periodFrom);
    const periodTo = row && goalAttainmentDay(row.periodTo);
    const closedOn = row && goalAttainmentDay(row.closedOn);
    const days = periodFrom && periodTo ? goalAttainmentInclusiveDays(periodFrom, periodTo) : null;
    const entries = row ? readEntries(row.entries, GOAL_ATTAINMENT_LIMITS.spansPerClosure) : null;
    const storedBuckets = row ? row.buckets : null;
    if (!closureId || seenId.has(closureId) || !label || !periodFrom || !periodTo || !closedOn
      || !days || days > GOAL_ATTAINMENT_LIMITS.periodMaxDays
      // A period that has not ended cannot be closed: `closedOn` must be strictly
      // after the last day it reports, or the act is reporting a day it cannot
      // know.
      || !(closedOn > periodTo)
      || entries === null) {
      dropped += 1;
      continue;
    }
    // The reported counts must equal the entries beneath them. A row that fails
    // this describes a report nobody made; it is dropped, never re-totalled.
    const derived = goalAttainmentBucketCounts(entries);
    if (storedBuckets !== undefined && storedBuckets !== null) {
      if (!isPlainObject(storedBuckets)) { dropped += 1; continue; }
      const allMatch = GOAL_ATTAINMENT_BUCKET_KEYS.every((key) => Number(storedBuckets[key]) === derived[key]);
      const noExtras = Object.keys(storedBuckets).every((key) => GOAL_ATTAINMENT_BUCKET_KEYS.includes(key));
      if (!allMatch || !noExtras) { dropped += 1; continue; }
    }
    // Two closing acts over the same days are two reports of one period. The
    // later act is dropped and counted; no figure is chosen by arithmetic.
    const earlier = out.find((other) => goalAttainmentOverlaps(other.periodFrom, other.periodTo, periodFrom, periodTo));
    if (earlier) { dropped += 1; continue; }
    seenId.add(closureId);
    out.push({
      id: closureId,
      label,
      periodFrom,
      periodTo,
      periodDays: days,
      closedOn,
      closedAt: stamp(row.closedAt),
      closedById: id(row.closedById),
      note: text(row.note, GOAL_ATTAINMENT_LIMITS.reasonMax),
      entries,
      buckets: derived,
      goalsN: entries.length,
      spansN: new Set(entries.filter((entry) => entry.span !== GOAL_ATTAINMENT_OWNERLESS).map((entry) => entry.span)).size,
      ownerlessN: entries.filter((entry) => entry.span === GOAL_ATTAINMENT_OWNERLESS).length,
      multiLineN: Number.isInteger(row.multiLineN) && row.multiLineN >= 0 ? row.multiLineN : 0,
      engineVersion: text(row.engineVersion, 60) || '',
    });
  }
  if (dropped) warnings.push(`${dropped} goal-attainment closure row(s) could not be read exactly, reported counts that did not match their own entries, or claimed days another closing act already reported, and were dropped rather than repaired.`);
  out.sort((a, b) => String(a.periodTo).localeCompare(String(b.periodTo))
    || String(a.periodFrom).localeCompare(String(b.periodFrom))
    || String(a.id).localeCompare(String(b.id)));
  return out;
}

/* -------------------------------------------------------------------- notes */

/**
 * Dated acknowledgements. One live note per (closure, fingerprint): a second note
 * over the same fingerprint is a duplicate of one decision, and it is dropped
 * rather than merged.
 */
export function normalizeGoalAttainmentNotes(value, closures = null, warnings = []) {
  if (!Array.isArray(value)) {
    if (value !== undefined && value !== null) warnings.push('Goal attainment: the acknowledgement ledger was not an array; it was read as empty.');
    return [];
  }
  const known = closures ? new Set(closures.map((row) => row.id)) : null;
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const raw of value) {
    if (out.length >= GOAL_ATTAINMENT_LIMITS.notes) { dropped += 1; continue; }
    const row = isPlainObject(raw) ? raw : null;
    const noteId = row && id(row.id);
    const closureId = row && id(row.closureId);
    const signature = row && typeof row.signature === 'string' && SIGNATURE_RE.test(row.signature.trim()) ? row.signature.trim() : null;
    const reason = row && goalAttainmentReason(row.reason);
    const actedOn = row && goalAttainmentDay(row.actedOn);
    if (!noteId || !closureId || !signature || !reason || !actedOn) { dropped += 1; continue; }
    if (known && !known.has(closureId)) { dropped += 1; continue; }
    const slot = `${closureId}|${signature}`;
    if (seen.has(slot)) { dropped += 1; continue; }
    seen.add(slot);
    out.push({
      id: noteId,
      closureId,
      signature,
      reason,
      actedById: id(row.actedById),
      actedOn,
      actedAt: stamp(row.actedAt),
    });
  }
  if (dropped) warnings.push(`${dropped} goal-attainment acknowledgement row(s) were unreadable, named a closure that is not on the record, or duplicated one decision, and were dropped.`);
  out.sort((a, b) => String(a.actedOn).localeCompare(String(b.actedOn)) || String(a.id).localeCompare(String(b.id)));
  return out;
}

/** The rule's bounded idempotency ledger. Identity-free, keyed by signature. */
export function normalizeGoalAttainmentMarkers(value, warnings = []) {
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
  if (dropped) warnings.push(`${dropped} goal-attainment marker row(s) were unreadable or duplicated and were dropped.`);
  return out;
}

/* --------------------------------------------------------------- signatures */

/**
 * Deterministic, identity-free fingerprint of ONE restatement
 * (`gar1:<16-hex>`). Built from the period, the per-cause goal counts and the
 * per-span frozen/live deltas — never from a person, a name, a goal id, a title
 * or a label. A restatement that grows by one goal is a different fingerprint
 * and needs its own acknowledgement; a restatement that shrinks back to zero is
 * no restatement at all and is never asked about.
 */
export function goalAttainmentSignature(parts = {}) {
  const causes = GOAL_ATTAINMENT_BUCKET_KEYS; // fixed iteration order for buckets
  const lines = [];
  lines.push(`p:${parts.periodFrom || ''}..${parts.periodTo || ''}`);
  for (const key of causes) lines.push(`b:${key}:${Number(parts.buckets?.[key]) || 0}`);
  for (const key of Object.keys(parts.causes || {}).sort()) lines.push(`c:${key}:${Number(parts.causes[key]) || 0}`);
  const spans = [...(parts.spans || [])].map((span) => `${span.key}:${Number(span.frozenN) || 0}:${Number(span.liveN) || 0}`).sort();
  for (const span of spans) lines.push(`s:${span}`);
  const joined = lines.join('\n');
  let h1 = 0x811c9dc5;
  let h2 = 0x050c5d1f;
  for (let i = 0; i < joined.length; i += 1) {
    const code = joined.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= (code ^ (i & 0xff));
    h2 = Math.imul(h2, 0x01000193) >>> 0;
  }
  return `gar1:${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

export function goalAttainmentAskSummary(signature) {
  return `${GOAL_ATTAINMENT_ASK_PREFIX}${String(signature || '').trim()}`;
}

export function parseGoalAttainmentAskSummary(summary) {
  if (typeof summary !== 'string') return null;
  const trimmed = summary.trim();
  if (!trimmed.startsWith(GOAL_ATTAINMENT_ASK_PREFIX)) return null;
  const signature = trimmed.slice(GOAL_ATTAINMENT_ASK_PREFIX.length).trim();
  return SIGNATURE_RE.test(signature) ? { signature } : null;
}

/** The day a period ends, used by callers that only hold a closure record. */
export const goalAttainmentPeriodEnd = (closure) => goalAttainmentDay(closure?.periodTo);

export { dayKey as goalAttainmentToday };
