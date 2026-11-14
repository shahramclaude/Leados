/**
 * app/core/storeOptimizations.js — measured helpers for the persistence layer.
 *
 * Two jobs, both in service of the same promise: a workspace that is honest
 * about its own cost.
 *
 *  1. A keyed memo for pure derived reads. The store replaces the state object
 *     on every committed write, so identity is an exact "did anything change?"
 *     test; combined with the calendar day and the acting seat it is a sound
 *     cache key for the expensive read models the shell runs per render.
 *
 *  2. A size estimator, used for the storage-quota warning and the workspace
 *     size reading. It is an estimate and is labelled as one — the exact
 *     number is one JSON.stringify away and far too expensive to run on every
 *     render.
 *
 * Everything else that used to live here (a coalescing persist wrapper, a
 * revision-keyed memo, a dirty check) was exported, tested and called by
 * nothing. It was removed rather than left as an invitation to assume a
 * batching layer that does not exist: the plaintext save is synchronous and
 * ordered on purpose, and the encrypted path already serialises and collapses
 * concurrent writes in `store.js`.
 */

import { dayKey } from './time.js';

/**
 * Memoize a pure derived read by an explicit key, compared part by part with
 * `===`.
 *
 * A revision counter is the right key only for reads that depend on the stored
 * records and nothing else. It is the wrong key for a read that also depends on
 * the calendar day, the acting seat or a settings object, and it cannot tell
 * two different snapshots apart when they happen to share a revision number (an
 * import, a reset, a demo reload).
 *
 * This helper takes the key parts directly, so a caller can pass the state
 * object itself — the store replaces it on every committed write, which makes
 * identity an exact, cheap "did anything change?" test — plus whatever else the
 * read depends on. A hit returns the previous result by reference; callers that
 * mutate the result must copy it first.
 */
export function createKeyedMemo(build) {
  if (typeof build !== 'function') throw new TypeError('build function required');
  let lastKey = null;
  let lastResult = null;
  let hits = 0;
  let misses = 0;

  function get(...key) {
    if (lastKey !== null && key.length === lastKey.length && key.every((part, i) => part === lastKey[i])) {
      hits += 1;
      return lastResult;
    }
    lastKey = key;
    lastResult = build(...key);
    misses += 1;
    return lastResult;
  }

  get.clear = () => { lastKey = null; lastResult = null; };
  get.stats = () => ({
    hits,
    misses,
    hitRate: hits + misses === 0 ? 0 : hits / (hits + misses),
    cached: lastResult !== null,
  });
  get.resetStats = () => { hits = 0; misses = 0; };
  return get;
}

/**
 * Estimate the serialized size of a workspace without serializing all of it.
 *
 * Collections are not homogeneous in this product — a demo workspace holds a
 * handful of tiny links and a handful of large case records — so sampling only
 * the first three rows systematically under- or over-estimates by a wide
 * margin, and the quota warning built on it would be wrong in the direction
 * that loses a leader's data.
 *
 * The sample is therefore deterministic and stratified: every array is probed
 * at five evenly spaced positions (first, quarter, middle, three-quarters,
 * last), up to five rows, and the mean is extrapolated. Small arrays are
 * measured exactly. The result is still an estimate — the exact figure costs a
 * full `JSON.stringify` of the workspace — and every caller labels it as one.
 */
export const SIZE_SAMPLE_POINTS = 5;

export function estimateStateSize(state) {
  if (!state || typeof state !== 'object') return 0;
  let size = 0;
  for (const key of Object.keys(state)) {
    const val = state[key];
    if (Array.isArray(val)) {
      if (val.length === 0) continue;
      const positions = samplePositions(val.length, SIZE_SAMPLE_POINTS);
      let sampleSize = 0;
      for (const i of positions) {
        const item = val[i];
        try { sampleSize += JSON.stringify(item).length; } catch { sampleSize += 500; }
      }
      const avg = sampleSize / positions.length;
      // + the array wrapper, the key and its punctuation.
      size += avg * val.length + key.length + 12;
    } else if (val && typeof val === 'object') {
      try { size += JSON.stringify(val).length + key.length + 8; } catch { size += 1000; }
    } else if (typeof val === 'string') {
      size += val.length + key.length + 8;
    }
  }
  return Math.round(size);
}

/** Evenly spaced, de-duplicated indices across an array of `length`. */
function samplePositions(length, points) {
  if (length <= points) return Array.from({ length }, (_, i) => i);
  const out = [];
  for (let p = 0; p < points; p += 1) {
    out.push(Math.round((p * (length - 1)) / (points - 1)));
  }
  return Array.from(new Set(out));
}

/**
 * Storage quota guard: checks whether persisting would likely exceed
 * localStorage quota (typically 5-10 MB). Returns a warning string or null.
 */
export function quotaWarningFor(state, quotaBytes = 5 * 1024 * 1024) {
  const est = estimateStateSize(state);
  if (est > quotaBytes * 0.9) return `Workspace is ${Math.round(est / 1024)} KB — approaching browser storage limits. Export a backup.`;
  if (est > quotaBytes * 0.75) return `Workspace is ${Math.round(est / 1024)} KB. Consider archiving old records.`;
  return null;
}
