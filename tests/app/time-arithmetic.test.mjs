import test from 'node:test';
import assert from 'node:assert/strict';

import { addDays, dayKey, daysBetween, daysSince, isOverdue, startOfDay, toDate, weekStart } from '../../app/core/time.js';

// The previous implementation is the oracle. These helpers are intentionally
// local to the test: production must not carry a second date implementation.
const DAY_MS = 86400000;
function previousStartOfDay(value) {
  const d = toDate(value);
  return d ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())) : null;
}
function previousDayKey(value) {
  const d = previousStartOfDay(value);
  return d ? d.toISOString().slice(0, 10) : null;
}
function previousDaysBetween(from, to) {
  const a = previousStartOfDay(from);
  const b = previousStartOfDay(to);
  return a && b ? Math.round((b.getTime() - a.getTime()) / DAY_MS) : null;
}

function inputs() {
  const fixed = [
    null, undefined, '', ' ', 'not-a-date', '2026-02-30', '2026-13-01',
    '0000-01-01', '0099-12-31', '0100-01-01', '1969-12-31T23:59:59.999Z',
    '1970-01-01T00:00:00.000Z', '2024-02-29', '2026-11-14T23:59:59.999Z',
    '2026-11-14T12:00:00+14:00', '2026-11-14T12:00:00-12:00',
    new Date('2026-11-14T10:00:00Z'), new Date(NaN), 0, -1, NaN, Infinity,
  ];
  // Deterministic coverage across century boundaries, leap days, pre-epoch
  // timestamps and fractional days. No wall-clock or random test inputs.
  for (let i = 0; i < 2000; i += 1) {
    const ms = -2208988800000 + i * 43219877;
    fixed.push(ms, new Date(ms), new Date(ms).toISOString(), new Date(ms).toISOString().slice(0, 10));
  }
  return fixed;
}

test('UTC day helpers are byte-equivalent to the previous calendar implementation', () => {
  for (const value of inputs()) {
    assert.equal(dayKey(value), previousDayKey(value), `dayKey(${String(value)})`);
    assert.equal(startOfDay(value)?.getTime() ?? null, previousStartOfDay(value)?.getTime() ?? null, `startOfDay(${String(value)})`);
  }
});

test('day differences keep pre-epoch, fractional-day and invalid-input behaviour', () => {
  const values = inputs();
  for (let i = 0; i < values.length; i += 17) {
    const from = values[i];
    const to = values[(i + 37) % values.length];
    assert.equal(daysBetween(from, to), previousDaysBetween(from, to), `${String(from)} -> ${String(to)}`);
    assert.equal(daysSince(from, to), previousDaysBetween(from, to));
    assert.equal(isOverdue(from, to), previousDaysBetween(from, to) > 0);
  }
  assert.equal(daysBetween('1969-12-31T23:59:59.999Z', '1970-01-01T00:00:00Z'), 1);
  assert.equal(daysBetween('2026-11-14T23:59:59.999Z', '2026-11-15T00:00:00Z'), 1);
});

test('day and week shifts still cross month, year and leap boundaries correctly', () => {
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('1970-01-01', -1), '1969-12-31');
  assert.equal(weekStart('2026-11-15'), '2026-11-09');
  assert.equal(weekStart('2026-11-16'), '2026-11-16');
  const date = new Date('2026-11-14T10:00:00Z');
  const before = date.toISOString();
  dayKey(date); startOfDay(date); daysBetween(date, '2026-11-15');
  assert.equal(date.toISOString(), before, 'a shared Date input is never mutated');
});
