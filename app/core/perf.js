/**
 * app/core/perf.js — lightweight performance instrumentation.
 *
 * No external dependency, zero overhead when disabled, and safe to leave on
 * in production: it only records in-memory samples behind a flag and exposes
 * them through a single read function. The store and the post-commit spine
 * call into it directly so a leader can see where wall-clock time actually
 * goes instead of guessing.
 *
 * This is the efficiency pillar's observability layer: you cannot improve
 * what you cannot measure.
 */

const SAMPLE_CAP = 500;
const SLOW_THRESHOLD_MS = 16; // one frame budget — anything above is worth noticing
// Only these coarse product lanes need cumulative totals. Aggregating every
// per-rule sample would add bookkeeping to the hot automation loop we measure.
const CUMULATIVE_LANES = new Set(['nav.counters', 'scenario.read', 'store:update']);

let enabled = false;
let samples = [];
let marks = new Map();
// The ring is for recent examples; lane totals survive eviction so a busy
// automation cascade cannot erase the navigation/scenario cost being measured.
const lanes = new Map();

function recordSample(label, elapsedMs, meta) {
  if (samples.length >= SAMPLE_CAP) samples.shift();
  samples.push({ label, elapsedMs, slow: elapsedMs > SLOW_THRESHOLD_MS, at: new Date().toISOString(), meta });
  if (!CUMULATIVE_LANES.has(label)) return;
  const lane = lanes.get(label) || { count: 0, totalMs: 0, maxMs: 0, slowCount: 0, lastMs: 0 };
  lane.count += 1;
  lane.totalMs += elapsedMs;
  lane.maxMs = Math.max(lane.maxMs, elapsedMs);
  lane.slowCount += elapsedMs > SLOW_THRESHOLD_MS ? 1 : 0;
  lane.lastMs = elapsedMs;
  lanes.set(label, lane);
}

export function perfEnabled() {
  return enabled;
}

export function enablePerf() {
  enabled = true;
}

export function disablePerf() {
  enabled = false;
}

export function clearPerf() {
  samples = [];
  marks.clear();
  lanes.clear();
}

/**
 * Mark the start of a timed span. Returns a token to pass to perfEnd.
 * No-op when disabled — caller should not branch on the return.
 */
export function perfMark(label) {
  if (!enabled) return 0;
  const t = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  marks.set(label, t);
  return t;
}

/**
 * End a span started with perfMark. Records the elapsed time and, when it
 * exceeds SLOW_THRESHOLD_MS, flags it as slow. Returns elapsed ms or 0.
 */
export function perfEnd(label, meta = null) {
  if (!enabled) return 0;
  const start = marks.get(label);
  if (start == null) return 0;
  const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  const elapsed = now - start;
  marks.delete(label);
  recordSample(label, elapsed, meta);
  return elapsed;
}

/**
 * One-shot measurement for code that cannot easily bracket with mark/end.
 * Records elapsed and returns it.
 */
export function perfMeasure(label, fn, meta = null) {
  if (!enabled) return fn();
  const start = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  let result;
  try {
    result = fn();
  } finally {
    const elapsed = (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) - start;
    recordSample(label, elapsed, meta);
  }
  return result;
}

/**
 * Record an arbitrary timing sample (e.g. from an already-measured span).
 */
export function perfSample(label, elapsedMs, meta = null) {
  if (!enabled) return;
  recordSample(label, elapsedMs, meta);
}

/**
 * Read all samples (copy). Optionally filtered to slow only.
 */
export function perfRead({ slowOnly = false } = {}) {
  const copy = samples.slice();
  if (slowOnly) return copy.filter((s) => s.slow);
  return copy;
}

/** Cumulative totals for one label, independent of the recent-sample ring. */
export function perfLaneSummary(label) {
  const lane = lanes.get(label);
  if (!lane) return { count: 0, totalMs: 0, meanMs: 0, maxMs: 0, slowCount: 0, lastMs: 0 };
  return { ...lane, totalMs: Math.round(lane.totalMs * 100) / 100, meanMs: Math.round((lane.totalMs / lane.count) * 100) / 100 };
}

/**
 * Summary: count, total, mean, p50/p95, slow count.
 */
export function perfSummary() {
  if (samples.length === 0) return { count: 0, totalMs: 0, meanMs: 0, p50Ms: 0, p95Ms: 0, slowCount: 0 };
  const sorted = samples.map((s) => s.elapsedMs).sort((a, b) => a - b);
  const totalMs = sorted.reduce((a, b) => a + b, 0);
  const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
  return {
    count: samples.length,
    totalMs: Math.round(totalMs * 100) / 100,
    meanMs: Math.round((totalMs / samples.length) * 100) / 100,
    p50Ms: Math.round(p50 * 100) / 100,
    p95Ms: Math.round(p95 * 100) / 100,
    slowCount: samples.filter((s) => s.slow).length,
  };
}

/**
 * Expose a tiny global for manual debugging: window.__LEADOS_PERF.read().
 * The app shell wires this when the debug flag is on.
 */
export function installPerfDebug(scope = typeof window !== 'undefined' ? window : null) {
  if (!scope) return;
  scope.__LEADOS_PERF = {
    enable: enablePerf,
    disable: disablePerf,
    clear: clearPerf,
    read: perfRead,
    summary: perfSummary,
    lane: perfLaneSummary,
    enabled: perfEnabled,
  };
}
