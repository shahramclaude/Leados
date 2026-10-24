/**
 * app/core/time.js — pure, deterministic date helpers.
 *
 * All day-level arithmetic is UTC-based so a "day" never shifts with DST and
 * so tests are reproducible across machines. Day values are stored as
 * `YYYY-MM-DD`; timestamps as full ISO strings.
 *
 * No I/O, no globals, no implicit "now": every function that needs the current
 * time takes it as an argument.
 */

const DAY_MS = 86400000;

/** Parse anything reasonable into a Date, or null. Date-only strings are UTC midnight. */
export function toDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value);
  if (typeof value !== 'string' || value.trim() === '') return null;
  const raw = value.trim();
  const d = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(raw + 'T00:00:00.000Z') : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** UTC midnight of the day containing `value`. */
export function startOfDay(value) {
  const d = toDate(value);
  if (!d) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** `YYYY-MM-DD` for the UTC day containing `value`. */
export function dayKey(value) {
  const d = startOfDay(value);
  return d ? d.toISOString().slice(0, 10) : null;
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from, to) {
  const a = startOfDay(from);
  const b = startOfDay(to);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

/** Whole days elapsed since `value`. Negative means it is in the future. */
export function daysSince(value, now) {
  return daysBetween(value, now);
}

/** `value` shifted by `n` days, returned as a day key. */
export function addDays(value, n) {
  const d = startOfDay(value);
  if (!d) return null;
  return new Date(d.getTime() + n * DAY_MS).toISOString().slice(0, 10);
}

/** Monday-based week start (UTC) as a day key. */
export function weekStart(value) {
  const d = startOfDay(value);
  if (!d) return null;
  const dow = d.getUTCDay(); // 0 = Sunday
  const offset = dow === 0 ? -6 : 1 - dow;
  return new Date(d.getTime() + offset * DAY_MS).toISOString().slice(0, 10);
}

export function weekKey(value) {
  return weekStart(value);
}

/** True when `due` is strictly before the current day. */
export function isOverdue(due, now) {
  const delta = daysBetween(due, now);
  return delta !== null && delta > 0;
}

/** Human phrasing for a signed day offset ("today", "3 days ago", "in 5 days"). */
export function humanDays(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs === 0) return 'today';
  const unit = abs === 1 ? 'day' : 'days';
  return n > 0 ? `${abs} ${unit} ago` : `in ${abs} ${unit}`;
}

/** Short display date, e.g. "24 Oct 2026". Deterministic (UTC). */
export function formatDate(value, { withYear = true } = {}) {
  const d = toDate(value);
  if (!d) return '—';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const base = `${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
  return withYear ? `${base} ${d.getUTCFullYear()}` : base;
}

/** Month label for chart axes, e.g. "Oct". */
export function monthLabel(value) {
  const d = toDate(value);
  if (!d) return '—';
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
}

/** Clamp helper used by the scoring modules. */
export function clamp(n, min = 0, max = 100) {
  if (typeof n !== 'number' || Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/** Rounded to `dp` decimals without float dust. */
export function round(n, dp = 0) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0;
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

/** Arithmetic mean, or null for an empty list. */
export function mean(values) {
  const nums = (values || []).filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** Latest value by date from `[{ date, ... }]`, or null. */
export function latestByDate(items, field = 'date') {
  let best = null;
  for (const item of items || []) {
    const d = toDate(item?.[field]);
    if (!d) continue;
    if (!best || d > best.d) best = { d, item };
  }
  return best ? best.item : null;
}
